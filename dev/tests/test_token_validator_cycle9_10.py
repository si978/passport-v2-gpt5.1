import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.domain import (  # type: ignore  # noqa: E402
    ERR_ACCESS_EXPIRED,
    ERR_ACCESS_INVALID,
    ERR_APP_ID_MISMATCH,
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
from backend.token_validator import TokenValidator  # type: ignore  # noqa: E402


UTC = timezone.utc


class TokenValidatorCycle9And10Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.user_repo = InMemoryUserRepo()
        self.session_store = InMemorySessionStore()
        self.vc_store = VerificationCodeStore()
        self.vc_service = VerificationCodeService(self.vc_store)
        self.guid_gen = GuidGenerator()
        self.auth = AuthService(self.user_repo, self.session_store, self.vc_service, self.guid_gen)
        self.validator = TokenValidator(self.session_store)

    def _login_user(self, phone: str, code: str, app_id: str = "jiuweihu"):
        now = datetime.now(UTC)
        self.vc_store.save(phone, code, now + timedelta(minutes=5))
        return self.auth.login_with_phone(phone, code, app_id)

    def test_valid_access_token_passes_validation(self) -> None:
        result = self._login_user("13800138020", "123456")
        vr = self.validator.validate_access_token(result.access_token, "jiuweihu")
        self.assertEqual(vr.guid, result.guid)
        self.assertEqual(vr.app_id, "jiuweihu")

    def test_expired_access_token_raises_err_access_expired(self) -> None:
        result = self._login_user("13800138021", "654321")
        session = self.session_store.get(result.guid)
        assert session is not None
        app = session.apps["jiuweihu"]
        app.access_token_expires_at = datetime.now(UTC) - timedelta(seconds=1)

        with self.assertRaises(AuthError) as ctx:
            self.validator.validate_access_token(result.access_token, "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_ACCESS_EXPIRED)

    def test_invalid_access_token_raises_err_access_invalid(self) -> None:
        self._login_user("13800138022", "111222")
        with self.assertRaises(AuthError) as ctx:
            self.validator.validate_access_token("A.invalid", "jiuweihu")
        self.assertEqual(ctx.exception.code, ERR_ACCESS_INVALID)

    def test_app_id_mismatch_raises_err_app_id_mismatch(self) -> None:
        result = self._login_user("13800138023", "333444", app_id="jiuweihu")
        with self.assertRaises(AuthError) as ctx:
            self.validator.validate_access_token(result.access_token, "youlishe")
        self.assertEqual(ctx.exception.code, ERR_APP_ID_MISMATCH)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
