import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.domain import (  # type: ignore  # noqa: E402
    ERR_REFRESH_EXPIRED,
    ERR_REFRESH_MISMATCH,
    InMemorySessionStore,
    InMemoryUserRepo,
    User,
    UserStatus,
    VerificationCodeStore,
    Session,
    AppSession,
)
from backend.services import (  # type: ignore  # noqa: E402
    AuthError,
    AuthService,
    GuidGenerator,
    TokenService,
    VerificationCodeService,
)


UTC = timezone.utc


class TokenRefreshCycle6Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.user_repo = InMemoryUserRepo()
        self.session_store = InMemorySessionStore()
        self.vc_store = VerificationCodeStore()
        self.vc_service = VerificationCodeService(self.vc_store)
        self.guid_gen = GuidGenerator()
        self.auth = AuthService(self.user_repo, self.session_store, self.vc_service, self.guid_gen)

    def _login_user(self, phone: str, code: str, app_id: str = "jiuweihu"):
        now = datetime.now(UTC)
        self.vc_store.save(phone, code, now + timedelta(minutes=5))
        return self.auth.login_with_phone(phone, code, app_id)

    def test_normal_refresh_success(self) -> None:
        result = self._login_user("13800138010", "123456")
        token_service = TokenService(self.session_store)

        refreshed = token_service.refresh_access_token(result.guid, result.refresh_token, "jiuweihu")
        self.assertNotEqual(refreshed.access_token, result.access_token)
        session = self.session_store.get(result.guid)
        assert session is not None
        app_sess = session.apps.get("jiuweihu")
        assert app_sess is not None
        self.assertEqual(app_sess.access_token, refreshed.access_token)

    def test_refresh_token_expired_raises_error(self) -> None:
        guid = "20250101010000000011"
        user = User(guid=guid, phone="13800138011", status=UserStatus.ACTIVE)
        self.user_repo.save(user)
        now = datetime.now(UTC)
        expired_rt = "R.expired"
        session = Session(
            guid=guid,
            refresh_token=expired_rt,
            refresh_token_expires_at=now - timedelta(seconds=1),
            apps={"jiuweihu": AppSession(access_token="A.old", access_token_expires_at=now, last_active_at=now)},
        )
        self.session_store.put(session)

        token_service = TokenService(self.session_store)
        with self.assertRaises(AuthError) as ctx:
            token_service.refresh_access_token(guid, expired_rt, "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_REFRESH_EXPIRED)

    def test_refresh_token_mismatch_raises_error(self) -> None:
        result = self._login_user("13800138012", "654321")
        token_service = TokenService(self.session_store)
        with self.assertRaises(AuthError) as ctx:
            token_service.refresh_access_token(result.guid, "R.wrong", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_REFRESH_MISMATCH)

    def test_cross_app_creates_new_app_session_for_sso(self) -> None:
        result = self._login_user("13800138013", "112233", app_id="jiuweihu")
        token_service = TokenService(self.session_store)

        refreshed = token_service.refresh_access_token(result.guid, result.refresh_token, "youlishe")
        session = self.session_store.get(result.guid)
        assert session is not None
        self.assertIn("jiuweihu", session.apps)
        self.assertIn("youlishe", session.apps)
        self.assertNotEqual(session.apps["jiuweihu"].access_token, session.apps["youlishe"].access_token)
        self.assertEqual(refreshed.access_token, session.apps["youlishe"].access_token)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
