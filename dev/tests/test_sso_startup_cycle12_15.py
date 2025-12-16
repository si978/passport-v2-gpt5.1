import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from native.local_session import (  # type: ignore  # noqa: E402
    LocalSessionCrypto,
    LocalSessionValidator,
    ValidationStatus,
)
from shell.sso_startup import SsoStartupHandler  # type: ignore  # noqa: E402
from shell.logout_handler import LogoutHandler  # type: ignore  # noqa: E402
from backend.domain import InMemorySessionStore, now_utc  # type: ignore  # noqa: E402
from backend.services import TokenService  # type: ignore  # noqa: E402


UTC = timezone.utc


class SsoStartupCycle12To15Tests(unittest.TestCase):
    def test_startup_with_valid_local_session_broadcasts_sso_available(self) -> None:
        now = datetime(2025, 1, 1, 1, 0, tzinfo=UTC)
        struct = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": datetime(2025, 1, 1, 0, 0, tzinfo=UTC).isoformat(),
            "expires_at": datetime(2025, 1, 3, 0, 0, tzinfo=UTC).isoformat(),
            "refresh_token": "R.token",
        }

        def read_session():
            return struct

        deleted = {"value": False}

        def delete_session():
            deleted["value"] = True

        statuses = []
        payloads = []

        def broadcast_status(status: str, data=None):
            statuses.append(status)
            payloads.append(data)

        handler = SsoStartupHandler(read_session, delete_session, broadcast_status, LocalSessionValidator())
        handler.handle_startup(now)

        self.assertEqual(statuses, ["sso_available"])
        self.assertEqual(payloads, [struct])
        self.assertFalse(deleted["value"])

    def test_startup_with_missing_file_broadcasts_none(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)

        def read_session():  # noqa: D401
            raise FileNotFoundError

        deleted = {"value": False}

        def delete_session():
            deleted["value"] = True

        statuses = []

        def broadcast_status(status: str, _data=None):
            statuses.append(status)

        handler = SsoStartupHandler(read_session, delete_session, broadcast_status, LocalSessionValidator())
        handler.handle_startup(now)

        self.assertEqual(statuses, ["none"])
        self.assertFalse(deleted["value"])

    def test_startup_with_expired_local_session_deletes_and_broadcasts_none(self) -> None:
        created = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        now = created + timedelta(hours=3)
        struct = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": created.isoformat(),
            "expires_at": (created + timedelta(days=2)).isoformat(),
            "refresh_token": "R.token",
        }

        def read_session():
            return struct

        deleted = {"value": False}

        def delete_session():
            deleted["value"] = True

        statuses = []

        def broadcast_status(status: str, _data=None):
            statuses.append(status)

        handler = SsoStartupHandler(read_session, delete_session, broadcast_status, LocalSessionValidator())
        handler.handle_startup(now)

        self.assertEqual(statuses, ["none"])
        self.assertTrue(deleted["value"])

    def test_validation_status_mapping(self) -> None:
        """确保 ValidationStatus 到 handler 输出的一致性。"""

        now = datetime(2025, 1, 1, tzinfo=UTC)
        validator = LocalSessionValidator()

        struct_valid = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=1)).isoformat(),
            "refresh_token": "R.token",
        }
        self.assertEqual(validator.validate(struct_valid, now), ValidationStatus.VALID)

        struct_corrupted = {"guid": "G1"}
        self.assertEqual(validator.validate(struct_corrupted, now), ValidationStatus.CORRUPTED)

    def test_startup_with_corrupted_struct_deletes_and_broadcasts_none(self) -> None:
        created = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        now = created + timedelta(hours=1)

        # 缺失必填字段会被视为 CORRUPTED
        struct = {
            "guid": "G1",
            "created_at": created.isoformat(),
            "expires_at": (created + timedelta(days=2)).isoformat(),
        }

        def read_session():
            return struct

        deleted = {"value": False}

        def delete_session():
            deleted["value"] = True

        statuses = []

        def broadcast_status(status: str, _data=None):
            statuses.append(status)

        handler = SsoStartupHandler(read_session, delete_session, broadcast_status, LocalSessionValidator())
        handler.handle_startup(now)

        self.assertEqual(statuses, ["none"])
        self.assertTrue(deleted["value"])

    def test_startup_with_corrupted_cipher_deletes_and_broadcasts_none_netbar_scenario(self) -> None:
        """模拟网吧串号场景：本地文件存在但已无法被当前用户解密，应删除并视为无会话。"""

        now = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)

        def read_session():  # noqa: D401
            raise ValueError("failed to decrypt local session")

        deleted = {"value": False}

        def delete_session():
            deleted["value"] = True

        statuses = []

        def broadcast_status(status: str, _data=None):
            statuses.append(status)

        handler = SsoStartupHandler(read_session, delete_session, broadcast_status, LocalSessionValidator())
        handler.handle_startup(now)

        self.assertEqual(statuses, ["none"])
        self.assertTrue(deleted["value"])

    def test_multi_app_sso_refresh_uses_same_refresh_token(self) -> None:
        """逻辑级集成：使用同一 GUID 的 Refresh Token 为第二个 app 创建会话。"""

        store = InMemorySessionStore()
        token_service = TokenService(store)

        # 构造初始 session：只有 app "jiuweihu"，使用当前时间避免过期
        guid = "G1"
        from backend.domain import Session, AppSession, calc_refresh_expires, calc_access_expires  # type: ignore

        now = now_utc()
        rt = "R.token"
        session = Session(
            guid=guid,
            refresh_token=rt,
            refresh_token_expires_at=calc_refresh_expires(now),
            apps={
                "jiuweihu": AppSession(
                    access_token="A.jiuweihu",
                    access_token_expires_at=calc_access_expires(now),
                    last_active_at=now,
                )
            },
        )
        store.put(session)

        refreshed = token_service.refresh_access_token(guid, rt, "youlishe")
        self.assertEqual(refreshed.guid, guid)
        session2 = store.get(guid)
        assert session2 is not None
        self.assertIn("youlishe", session2.apps)
        self.assertNotEqual(session2.apps["jiuweihu"].access_token, session2.apps["youlishe"].access_token)

    def test_logout_handler_calls_api_delete_and_broadcast(self) -> None:
        calls = {"api": 0, "delete": 0, "status": []}

        def api_logout() -> None:
            calls["api"] += 1

        def delete_session() -> None:
            calls["delete"] += 1

        def broadcast_status(status: str) -> None:
            calls["status"].append(status)

        handler = LogoutHandler(api_logout, delete_session, broadcast_status)
        handler.logout()
        self.assertEqual(calls["api"], 1)
        self.assertEqual(calls["delete"], 1)
        self.assertEqual(calls["status"], ["none"])

        # on_banned 应广播 banned
        calls["status"].clear()
        handler.on_banned()
        self.assertEqual(calls["status"], ["banned"])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
