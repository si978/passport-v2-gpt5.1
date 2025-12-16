"""壳层错误码处理策略（契约对齐版）。

对齐来源：refactor/contracts/errors-and-flows.md
适用范围：壳层与前端共享的错误码语义，便于 IPC/文件处理一致。
"""

from __future__ import annotations

from enum import Enum
from typing import Literal, Optional


class ErrorAction(str, Enum):
    LOGOUT = "logout"
    RETRY_REFRESH = "retry_refresh"
    BAN = "ban"
    APP_MISMATCH = "app_mismatch"
    RATE_LIMIT = "rate_limit"
    INTERNAL = "internal"
    NOOP = "noop"


def map_error_to_action(code: Optional[str]) -> ErrorAction:
    if code in ("ERR_REFRESH_EXPIRED", "ERR_REFRESH_MISMATCH", "ERR_SESSION_NOT_FOUND"):
        return ErrorAction.LOGOUT
    if code in ("ERR_ACCESS_EXPIRED", "ERR_ACCESS_INVALID"):
        return ErrorAction.RETRY_REFRESH
    if code == "ERR_USER_BANNED":
        return ErrorAction.BAN
    if code == "ERR_APP_ID_MISMATCH":
        return ErrorAction.APP_MISMATCH
    if code == "ERR_CODE_TOO_FREQUENT":
        return ErrorAction.RATE_LIMIT
    if code == "ERR_INTERNAL":
        return ErrorAction.INTERNAL
    return ErrorAction.NOOP


def handle_error_action(
    action: ErrorAction,
    *,
    logout: callable,
    broadcast_status: callable[[str], None],
    on_rate_limit: callable[[], None] | None = None,
    on_app_mismatch: callable[[], None] | None = None,
) -> None:
    """根据动作执行壳层侧统一处理。

    - logout: 清理本地会话/状态的函数，调用方应确保幂等。
    - broadcast_status: IPC 广播，会传递 'none'/'banned' 等状态。
    - on_rate_limit/on_app_mismatch: 可选的额外提示逻辑。
    """

    if action == ErrorAction.LOGOUT:
        logout()
        broadcast_status("none")
    elif action == ErrorAction.BAN:
        logout()
        broadcast_status("banned")
    elif action == ErrorAction.RETRY_REFRESH:
        # 交由上层刷新逻辑处理；此处不做清理
        return
    elif action == ErrorAction.APP_MISMATCH:
        if on_app_mismatch:
            on_app_mismatch()
    elif action == ErrorAction.RATE_LIMIT:
        if on_rate_limit:
            on_rate_limit()
    elif action == ErrorAction.INTERNAL:
        # 内部错误：提示用户稍后再试，不清理本地
        return
    else:
        return
