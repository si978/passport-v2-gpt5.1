"""镜像测试：验证重构后的应用层用例与原实现行为一致。

本文件通过同时调用 `dev/backend/services.py` 中的服务和
`refactor.backend.application.auth` 中的用例，确保核心登录/验证码/封禁
行为在重构后保持不变。
"""

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
    ERR_CODE_EXPIRED,
    ERR_CODE_INVALID,
    ERR_PHONE_INVALID,
    ERR_USER_BANNED,
    InMemorySessionStore as OldSessionStore,
    InMemoryUserRepo as OldUserRepo,
    User,
    UserStatus,
    VerificationCodeStore,
)
from dev.backend.services import (  # type: ignore  # noqa: E402
    AuthError as OldAuthError,
    AuthService,
    GuidGenerator as OldGuidGenerator,
    VerificationCodeService as OldVcService,
)

from refactor.backend.domain import (  # type: ignore  # noqa: E402
    InMemorySessionStore as NewSessionStore,
    InMemoryUserRepo as NewUserRepo,
)
from refactor.backend.domain import (  # type: ignore  # noqa: E402
    AuthError as NewAuthError,
)
from refactor.backend.application.auth import (  # type: ignore  # noqa: E402
    AuthUseCase,
    GuidGenerator,
    VerificationCodeService,
)


class AuthUsecaseMirrorTests(unittest.TestCase):
    """确保新旧实现对关键场景给出相同结果/错误码。"""

    def setUp(self) -> None:
        # 旧实现依赖的组件
        self.old_user_repo = OldUserRepo()
        self.old_session_store = OldSessionStore()
        self.vc_store = VerificationCodeStore()
        self.old_vc_service = OldVcService(self.vc_store)
        self.old_guid_gen = OldGuidGenerator()
        self.old_auth = AuthService(
            self.old_user_repo,
            self.old_session_store,
            self.old_vc_service,
            self.old_guid_gen,
        )

        # 新实现依赖的组件
        self.new_user_repo = NewUserRepo()
        self.new_session_store = NewSessionStore()
        self.new_vc_service = VerificationCodeService(self.vc_store)
        self.new_guid_gen = GuidGenerator()
        self.new_auth = AuthUseCase(
            self.new_user_repo,
            self.new_session_store,
            self.new_vc_service,
            self.new_guid_gen,
        )

        # 为测试手机号预置验证码
        now = datetime.now(UTC)
        self.vc_store.save("13800138000", "123456", now + timedelta(minutes=5))

    def test_invalid_phone_rejected_same_error(self) -> None:
        with self.assertRaises(OldAuthError) as old_ctx:
            self.old_auth.login_with_phone("12345", "123456", "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx:
            self.new_auth.login_with_phone("12345", "123456", "jiuweihu")
        self.assertEqual(old_ctx.exception.code, ERR_PHONE_INVALID)
        self.assertEqual(new_ctx.exception.code, ERR_PHONE_INVALID)

    def test_new_user_register_and_login_consistent(self) -> None:
        old_res = self.old_auth.login_with_phone("13800138000", "123456", "jiuweihu")
        new_res = self.new_auth.login_with_phone("13800138000", "123456", "jiuweihu")

        # 都应创建用户和会话
        self.assertIsNotNone(self.old_user_repo.find_by_phone("13800138000"))
        self.assertIsNotNone(self.new_user_repo.find_by_phone("13800138000"))
        self.assertIsNotNone(self.old_session_store.get(old_res.guid))
        self.assertIsNotNone(self.new_session_store.get(new_res.guid))

    def test_banned_user_cannot_login_same_error(self) -> None:
        user = User(guid="G-BANNED", phone="13800138001", status=UserStatus.BANNED)
        self.old_user_repo.save(user)
        self.new_user_repo.save(User(guid=user.guid, phone=user.phone, status=user.status))

        now = datetime.now(UTC)
        self.vc_store.save("13800138001", "654321", now + timedelta(minutes=5))

        with self.assertRaises(OldAuthError) as old_ctx:
            self.old_auth.login_with_phone("13800138001", "654321", "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx:
            self.new_auth.login_with_phone("13800138001", "654321", "jiuweihu")
        self.assertEqual(old_ctx.exception.code, ERR_USER_BANNED)
        self.assertEqual(new_ctx.exception.code, ERR_USER_BANNED)

    def test_wrong_and_expired_code_same_error_codes(self) -> None:
        # 错误验证码
        with self.assertRaises(OldAuthError) as old_ctx1:
            self.old_auth.login_with_phone("13800138000", "000000", "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx1:
            self.new_auth.login_with_phone("13800138000", "000000", "jiuweihu")
        self.assertEqual(old_ctx1.exception.code, ERR_CODE_INVALID)
        self.assertEqual(new_ctx1.exception.code, ERR_CODE_INVALID)

        # 过期验证码：为此创建新的 store/service 以模拟过期
        expired_store = VerificationCodeStore()
        expired_old_vc = OldVcService(expired_store)
        expired_new_vc = VerificationCodeService(expired_store)
        old_auth = AuthService(self.old_user_repo, self.old_session_store, expired_old_vc, self.old_guid_gen)
        new_auth = AuthUseCase(self.new_user_repo, self.new_session_store, expired_new_vc, self.new_guid_gen)

        now = datetime.now(UTC)
        expired_store.save("13800138003", "999999", now - timedelta(seconds=1))

        with self.assertRaises(OldAuthError) as old_ctx2:
            old_auth.login_with_phone("13800138003", "999999", "jiuweihu")
        with self.assertRaises(NewAuthError) as new_ctx2:
            new_auth.login_with_phone("13800138003", "999999", "jiuweihu")
        self.assertEqual(old_ctx2.exception.code, ERR_CODE_EXPIRED)
        self.assertEqual(new_ctx2.exception.code, ERR_CODE_EXPIRED)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
