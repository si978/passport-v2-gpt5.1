from __future__ import annotations

from typing import Callable
try:
    from .error_handling import ErrorAction, map_error_to_action, handle_error_action
except ImportError:  # pragma: no cover - allow direct script execution
    from error_handling import ErrorAction, map_error_to_action, handle_error_action
import logging


class LogoutHandler:
    """壳层退出登录处理逻辑，对应 Cycle17。

    通过依赖注入方式接收后端退出调用、本地会话删除和 IPC 广播函数，
    方便在单元测试和不同平台壳层中复用。
    """

    def __init__(
        self,
        api_logout: Callable[[], None],
        delete_session_file: Callable[[], None],
        broadcast_status: Callable[[str], None],
    ) -> None:
        self._api_logout = api_logout
        self._delete = delete_session_file
        self._broadcast = broadcast_status
        self._logger = logging.getLogger(__name__)

    def logout(self) -> None:
        """处理主动退出：调用后端退出接口，删除本地会话，并广播 none。"""
        try:
            self._api_logout()
        except Exception as exc:  # noqa: BLE001
            # 后端退出接口失败时仍需继续本地清理与状态广播，避免残留本地会话。
            self._logger.warning("API logout failed, proceeding with local cleanup: %s", exc)
        finally:
            self._delete()
            self._broadcast("none")

    def on_banned(self) -> None:
        """处理封禁通知：删除本地会话并广播 banned。"""

        self._delete()
        self._broadcast("banned")

    def on_error_code(self, code: str) -> None:
        """根据后端错误码执行统一动作（契约化）。"""

        action = map_error_to_action(code)
        handle_error_action(
            action,
            logout=lambda: (self._delete(), None)[-1],
            broadcast_status=lambda status: self._broadcast(status),
            on_rate_limit=lambda: self._logger.warning("rate limited: %s", code),
            on_app_mismatch=lambda: self._logger.warning("app mismatch: %s", code),
        )
