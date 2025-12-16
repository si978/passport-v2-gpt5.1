import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.domain import (  # type: ignore  # noqa: E402
    ERR_CODE_EXPIRED,
    ERR_CODE_INVALID,
    ERR_PHONE_INVALID,
    ERR_USER_BANNED,
    InMemorySessionStore,
    InMemoryUserRepo,
    User,
    UserStatus,
    VerificationCodeStore,
)
from backend.services import (  # type: ignore  # noqa: E402
    AuthError,
    AuthService,
    GuidGenerator,
    VerificationCodeService,
)


UTC = timezone.utc


class AuthCycle1And2Tests(unittest.TestCase):
    """覆盖 Cycle1/2 相关的后端核心逻辑（不含 HTTP 层）。"""

    def setUp(self) -> None:
        self.user_repo = InMemoryUserRepo()
        self.session_store = InMemorySessionStore()
        self.vc_store = VerificationCodeStore()
        self.vc_service = VerificationCodeService(self.vc_store)
        self.guid_gen = GuidGenerator()
        self.auth = AuthService(self.user_repo, self.session_store, self.vc_service, self.guid_gen)

        # 为测试手机号预置验证码
        now = datetime.now(UTC)
        self.vc_store.save("13800138000", "123456", now + timedelta(minutes=5))

    def test_invalid_phone_rejected(self) -> None:
        with self.assertRaises(AuthError) as ctx:
            self.auth.login_with_phone("12345", "123456", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_PHONE_INVALID)

    def test_new_user_register_and_login(self) -> None:
        result = self.auth.login_with_phone("13800138000", "123456", "jiuweihu")
        self.assertTrue(result.guid)
        user = self.user_repo.find_by_phone("13800138000")
        self.assertIsNotNone(user)
        self.assertEqual(user.guid, result.guid)  # type: ignore[attr-defined]
        # 会话已创建
        session = self.session_store.get(result.guid)
        self.assertIsNotNone(session)

    def test_banned_user_cannot_login(self) -> None:
        # 预置封禁用户
        user = User(guid="20250101010000000001", phone="13800138001", status=UserStatus.BANNED)
        self.user_repo.save(user)
        now = datetime.now(UTC)
        self.vc_store.save("13800138001", "654321", now + timedelta(minutes=5))

        with self.assertRaises(AuthError) as ctx:
            self.auth.login_with_phone("13800138001", "654321", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_USER_BANNED)

    def test_deleted_user_creates_new_guid(self) -> None:
        old_user = User(guid="20250101010000000002", phone="13800138002", status=UserStatus.DELETED)
        self.user_repo.save(old_user)
        now = datetime.now(UTC)
        self.vc_store.save("13800138002", "111222", now + timedelta(minutes=5))

        result = self.auth.login_with_phone("13800138002", "111222", "jiuweihu")
        self.assertNotEqual(result.guid, old_user.guid)

    def test_wrong_code_raises_err_code_invalid(self) -> None:
        with self.assertRaises(AuthError) as ctx:
            self.auth.login_with_phone("13800138000", "000000", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_CODE_INVALID)

    def test_expired_code_raises_err_code_expired(self) -> None:
        expired_store = VerificationCodeStore()
        expired_service = VerificationCodeService(expired_store)
        auth = AuthService(self.user_repo, self.session_store, expired_service, self.guid_gen)
        now = datetime.now(UTC)
        expired_store.save("13800138003", "999999", now - timedelta(seconds=1))

        with self.assertRaises(AuthError) as ctx:
            auth.login_with_phone("13800138003", "999999", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_CODE_EXPIRED)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
