import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.domain import (  # type: ignore  # noqa: E402
    ERR_REFRESH_EXPIRED,
    InMemorySessionStore,
    InMemoryUserRepo,
    UserStatus,
    VerificationCodeStore,
)
from backend.services import (  # type: ignore  # noqa: E402
    AuthError,
    AuthService,
    BanService,
    GuidGenerator,
    LogoutService,
    TokenService,
    VerificationCodeService,
)


UTC = timezone.utc


class LogoutAndBanCycle19And20Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.user_repo = InMemoryUserRepo()
        self.session_store = InMemorySessionStore()
        self.vc_store = VerificationCodeStore()
        self.vc_service = VerificationCodeService(self.vc_store)
        self.guid_gen = GuidGenerator()
        self.auth = AuthService(self.user_repo, self.session_store, self.vc_service, self.guid_gen)
        self.token_service = TokenService(self.session_store)
        self.logout_service = LogoutService(self.session_store)
        self.ban_service = BanService(self.user_repo, self.session_store)

    def _login_user(self, phone: str, code: str, app_id: str = "jiuweihu"):
        now = datetime.now(UTC)
        self.vc_store.save(phone, code, now + timedelta(minutes=5))
        return self.auth.login_with_phone(phone, code, app_id)

    def test_logout_deletes_session_and_is_idempotent(self) -> None:
        result = self._login_user("13800138100", "123456")
        # 会话存在
        self.assertIsNotNone(self.session_store.get(result.guid))

        # 第一次退出
        self.logout_service.logout(result.guid)
        self.assertIsNone(self.session_store.get(result.guid))

        # 再次退出不应抛异常
        self.logout_service.logout(result.guid)
        self.assertIsNone(self.session_store.get(result.guid))

        # 退出后刷新应视为 refresh 过期/会话缺失
        with self.assertRaises(AuthError) as ctx:
            self.token_service.refresh_access_token(result.guid, result.refresh_token, "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_REFRESH_EXPIRED)

    def test_ban_user_sets_status_and_deletes_session(self) -> None:
        phone = "13800138101"
        result = self._login_user(phone, "654321")
        self.assertEqual(self.user_repo.find_by_phone(phone).status, UserStatus.ACTIVE)  # type: ignore[union-attr]
        self.assertIsNotNone(self.session_store.get(result.guid))

        self.ban_service.ban_by_phone(phone)
        user = self.user_repo.find_by_phone(phone)
        assert user is not None
        self.assertEqual(user.status, UserStatus.BANNED)
        self.assertIsNone(self.session_store.get(result.guid))

        # 再次登录应被 ERR_USER_BANNED 拦截
        now = datetime.now(UTC)
        self.vc_store.save(phone, "654321", now + timedelta(minutes=5))
        with self.assertRaises(AuthError):
            self.auth.login_with_phone(phone, "654321", "jiuweihu")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
