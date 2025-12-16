"""镜像测试：验证 Token 刷新与登出用例与原实现行为一致。"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

UTC = timezone.utc


from dev.backend.domain import (  # type: ignore  # noqa: E402
    ERR_REFRESH_EXPIRED,
    ERR_REFRESH_MISMATCH,
    AppSession,
    InMemorySessionStore as OldSessionStore,
    Session,
    calc_access_expires,
    calc_refresh_expires,
    now_utc,
)
from dev.backend.services import (  # type: ignore  # noqa: E402
    AuthError as OldAuthError,
    LogoutService,
    TokenService,
)

from refactor.backend.domain import (  # type: ignore  # noqa: E402
    AuthError as NewAuthError,
    InMemorySessionStore as NewSessionStore,
)
from refactor.backend.application.auth import (  # type: ignore  # noqa: E402
    LogoutUseCase,
    TokenRefreshUseCase,
)


class TokenRefreshMirrorTests(unittest.TestCase):
    """确保 Token 刷新与登出在新旧实现间行为一致。"""

    def setUp(self) -> None:
        self.old_store = OldSessionStore()
        self.new_store = NewSessionStore()
        self.old_token = TokenService(self.old_store)
        self.new_token = TokenRefreshUseCase(self.new_store)
        self.old_logout = LogoutService(self.old_store)
        self.new_logout = LogoutUseCase(self.new_store)

    def _seed_session(self, guid: str, refresh_token: str, now: datetime, expired: bool = False) -> None:
        rt_exp = calc_refresh_expires(now)
        if expired:
            rt_exp = now - timedelta(seconds=1)
        at_exp = calc_access_expires(now)
        session = Session(
            guid=guid,
            refresh_token=refresh_token,
            refresh_token_expires_at=rt_exp,
            apps={
                "jiuweihu": AppSession(
                    access_token="A.old",
                    access_token_expires_at=at_exp,
                    last_active_at=now,
                )
            },
        )
        # 在两个 store 中写入相同的初始结构
        self.old_store.put(session)
        self.new_store.put(Session(
            guid=session.guid,
            refresh_token=session.refresh_token,
            refresh_token_expires_at=session.refresh_token_expires_at,
            apps=dict(session.apps),
        ))

    def test_refresh_success_creates_or_updates_app_session(self) -> None:
        now = now_utc()
        guid = "G1"
        rt = "R.token"
        self._seed_session(guid, rt, now)

        old_res = self.old_token.refresh_access_token(guid, rt, "youlishe")
        new_res = self.new_token.refresh_access_token(guid, rt, "youlishe")

        self.assertEqual(old_res.guid, new_res.guid)
        old_session = self.old_store.get(guid)
        new_session = self.new_store.get(guid)
        assert old_session is not None and new_session is not None
        self.assertIn("youlishe", old_session.apps)
        self.assertIn("youlishe", new_session.apps)

    def test_refresh_with_expired_session_raises_same_error(self) -> None:
        now = now_utc()
        guid = "G2"
        rt = "R.expired"
        self._seed_session(guid, rt, now, expired=True)

        with self.assertRaises(OldAuthError) as old_ctx:
            self.old_token.refresh_access_token(guid, rt, "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx:
            self.new_token.refresh_access_token(guid, rt, "jiuweihu")
        self.assertEqual(old_ctx.exception.code, ERR_REFRESH_EXPIRED)
        self.assertEqual(new_ctx.exception.code, ERR_REFRESH_EXPIRED)

    def test_refresh_with_mismatched_token_raises_same_error(self) -> None:
        now = now_utc()
        guid = "G3"
        rt = "R.valid"
        self._seed_session(guid, rt, now)

        with self.assertRaises(OldAuthError) as old_ctx:
            self.old_token.refresh_access_token(guid, "R.other", "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx:
            self.new_token.refresh_access_token(guid, "R.other", "jiuweihu")
        self.assertEqual(old_ctx.exception.code, ERR_REFRESH_MISMATCH)
        self.assertEqual(new_ctx.exception.code, ERR_REFRESH_MISMATCH)

    def test_logout_deletes_session_in_both_stores(self) -> None:
        now = now_utc()
        guid = "G4"
        rt = "R.logout"
        self._seed_session(guid, rt, now)
        self.assertIsNotNone(self.old_store.get(guid))
        self.assertIsNotNone(self.new_store.get(guid))

        self.old_logout.logout(guid)
        self.new_logout.logout(guid)

        self.assertIsNone(self.old_store.get(guid))
        self.assertIsNone(self.new_store.get(guid))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
