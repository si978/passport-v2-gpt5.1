from __future__ import annotations

from datetime import datetime
from typing import Any, Callable, Dict, Optional

try:  # pragma: no cover
    from error_handling import map_error_to_action, handle_error_action
except Exception:  # pragma: no cover
    from .error_handling import map_error_to_action, handle_error_action

try:
    from native.local_session import LocalSessionValidator, ValidationStatus
except Exception:  # pragma: no cover
    from enum import Enum
    from datetime import datetime, timezone

    class ValidationStatus(str, Enum):
        VALID = "valid"
        CORRUPTED = "corrupted"
        EXPIRED_LOCAL = "expired_local"
        UNKNOWN = "unknown"

    class LocalSessionValidator:  # type: ignore
        def validate(self, struct, now: datetime):
            try:
                if not all(k in struct for k in ("guid", "refresh_token", "expires_at")):
                    return ValidationStatus.CORRUPTED
                exp = struct["expires_at"]
                if isinstance(exp, (int, float)):
                    exp_dt = datetime.fromtimestamp(float(exp), timezone.utc)
                else:
                    exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
            except Exception:
                return ValidationStatus.CORRUPTED
            if exp_dt < now:
                return ValidationStatus.EXPIRED_LOCAL
            return ValidationStatus.VALID

# 优先使用绝对导入，确保在非包上下文下也可运行
try:  # pragma: no cover
    from error_handling import map_error_to_action, handle_error_action
except Exception:  # pragma: no cover
    from .error_handling import map_error_to_action, handle_error_action


class SsoStartupHandler:
    """壳层启动时 SSO 决策逻辑，对应 Cycle12。

    通过依赖注入方式接收文件读写与 IPC 广播函数，便于在单元测试中替换。
    """

    def __init__(
        self,
        read_session_file: Callable[[], Optional[Dict[str, Any]]],
        delete_session_file: Callable[[], None],
        broadcast_status: Callable[[str, Optional[Dict[str, Any]]], None],
        validator: Optional[LocalSessionValidator] = None,
    ) -> None:
        self._read = read_session_file
        self._delete = delete_session_file
        self._broadcast = broadcast_status
        self._validator = validator or LocalSessionValidator()

    def handle_error_code(self, code: str) -> None:
        """在壳层收到后端错误码时按契约处理（SSO 启动/刷新场景）。"""

        action = map_error_to_action(code)
        handle_error_action(
            action,
            logout=lambda: self._delete(),
            broadcast_status=lambda status: self._broadcast(status, None),
            on_rate_limit=lambda: self._broadcast("rate_limited", None),
            on_app_mismatch=lambda: self._broadcast("app_mismatch", None),
        )

    def handle_startup(self, now: datetime) -> None:
        try:
            struct = self._read()
        except FileNotFoundError:
            self._broadcast("none", None)
            return
        except ValueError:
            # 解密失败视为本地会话损坏，删除文件并告知前端无可用 SSO。
            self._delete()
            self._broadcast("none", None)
            return

        if struct is None:
            self._broadcast("none", None)
            return

        status = self._validator.validate(struct, now)
        if status == ValidationStatus.VALID:
            self._broadcast("sso_available", struct)
        elif status in (ValidationStatus.CORRUPTED, ValidationStatus.EXPIRED_LOCAL):
            self._delete()
            self._broadcast("none", None)
        else:
            self._broadcast("none", None)
