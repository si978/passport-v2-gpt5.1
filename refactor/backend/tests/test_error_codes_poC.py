"""错误码契约占位测试（PoC）。

目的：确保 Python 参考实现暴露的错误码常量与契约/PRD 中的关键错误码一致，
即便当前实现未完全覆盖（如频控、内部错误包装、会话不存在细分）。
"""

from __future__ import annotations

import unittest

from refactor.backend.domain import (  # type: ignore
    ERR_ACCESS_EXPIRED,
    ERR_ACCESS_INVALID,
    ERR_APP_ID_MISMATCH,
    ERR_CODE_EXPIRED,
    ERR_CODE_INVALID,
    ERR_CODE_TOO_FREQUENT,
    ERR_INTERNAL,
    ERR_PHONE_INVALID,
    ERR_REFRESH_EXPIRED,
    ERR_REFRESH_MISMATCH,
    ERR_SESSION_NOT_FOUND,
    ERR_USER_BANNED,
)


class ErrorCodeContractTests(unittest.TestCase):
    def test_error_codes_exist(self) -> None:
        # 登录/验证码相关
        self.assertIsInstance(ERR_PHONE_INVALID, str)
        self.assertIsInstance(ERR_CODE_INVALID, str)
        self.assertIsInstance(ERR_CODE_EXPIRED, str)
        self.assertIsInstance(ERR_CODE_TOO_FREQUENT, str)

        # Token/会话相关
        self.assertIsInstance(ERR_REFRESH_EXPIRED, str)
        self.assertIsInstance(ERR_REFRESH_MISMATCH, str)
        self.assertIsInstance(ERR_SESSION_NOT_FOUND, str)
        self.assertIsInstance(ERR_ACCESS_EXPIRED, str)
        self.assertIsInstance(ERR_ACCESS_INVALID, str)
        self.assertIsInstance(ERR_APP_ID_MISMATCH, str)

        # 用户状态/内部错误
        self.assertIsInstance(ERR_USER_BANNED, str)
        self.assertIsInstance(ERR_INTERNAL, str)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
