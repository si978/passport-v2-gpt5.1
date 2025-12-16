"""壳层接线示例（占位版本）。

用途：演示如何在 IPC/HTTP 回调中统一处理后端错误码与本地会话文件错误。
实际项目接入时，替换这里的占位函数为真实调用。
"""

from __future__ import annotations

from typing import Optional

from error_handling import map_error_to_action, handle_error_action


def handle_http_error(code: Optional[str]) -> None:
    """后端接口错误回调时调用。

    参数 code 可兼容后端返回的 `code`/`error_code`。
    """

    action = map_error_to_action(code)
    handle_error_action(
        action,
        logout=_logout,
        broadcast_status=_broadcast,
        on_rate_limit=lambda: _broadcast("rate_limited"),
        on_app_mismatch=lambda: _broadcast("app_mismatch"),
    )


def handle_session_file_error(code: str) -> None:
    """本地会话文件错误（例如 ERR_SESSION_CORRUPTED / ERR_SESSION_NOT_FOUND）。"""

    handle_http_error(code)


# --- 以下为占位实现，在真实壳层中替换 ---


def _logout() -> None:
    # TODO: 删除本地 session.dat / 内存 Token / 停止刷新调度
    pass


def _broadcast(status: str) -> None:
    # TODO: 通过 IPC 广播给前端，例如 sessionStatus 事件
    pass


if __name__ == "__main__":  # pragma: no cover
    # 简单自检
    handle_http_error("ERR_REFRESH_EXPIRED")
    handle_http_error("ERR_USER_BANNED")
    handle_session_file_error("ERR_SESSION_NOT_FOUND")
