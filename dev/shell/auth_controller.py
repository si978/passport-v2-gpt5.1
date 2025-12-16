"""壳层侧 Auth 控制器（最小可用版）。

职责：
- 封装 login/refresh/logout 流程，处理错误码并更新本地会话文件。
- 依赖 SessionFileManager + HttpClient + RefreshScheduler + LogoutHandler。
"""

from __future__ import annotations

from typing import Callable, Optional
from datetime import datetime, timezone

try:
    from .session_file_manager import SessionFileManager
    from .http_client import HttpClient
    from .refresh_scheduler import RefreshScheduler, now_utc
    from .logout_handler import LogoutHandler
except ImportError:  # pragma: no cover - allow direct execution
    from session_file_manager import SessionFileManager
    from http_client import HttpClient
    from refresh_scheduler import RefreshScheduler, now_utc
    from logout_handler import LogoutHandler


class AuthController:
    def __init__(
        self,
        http: HttpClient,
        file_mgr: SessionFileManager,
        refresh_scheduler: RefreshScheduler,
        logout_handler: LogoutHandler,
        *,
        broadcast_status: Callable[[str], None],
    ) -> None:
        self.http = http
        self.file_mgr = file_mgr
        self.scheduler = refresh_scheduler
        self.logout_handler = logout_handler
        self.broadcast = broadcast_status

    def login(self, phone: str, code: str) -> None:
        data = self.http.login_by_phone(phone, code)
        self._persist_session(data)
        self.scheduler.start(login_time=now_utc())
        self.broadcast("active")

    def refresh(self, guid: str, refresh_token: str) -> bool:
        try:
            data = self.http.refresh_token(guid, refresh_token)
            self._persist_session(data)
            self.scheduler.start(login_time=now_utc())
            self.broadcast("active")
            return True
        except Exception:
            # refresh 调度会处理失败重试，最终失败可调用 logout_handler.on_error_code
            return False

    def logout(self, access_token: Optional[str] = None) -> None:
        try:
            self.http.logout(access_token)
        finally:
            self.logout_handler.logout()

    def _persist_session(self, data: dict) -> None:
        # 简化：直接写 session.dat，字段按契约，时间戳用 ISO8601
        payload = {
            "guid": data["guid"],
            "phone": data.get("phone", ""),
            "user_type": data.get("user_type", "user"),
            "refresh_token": data["refresh_token"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": data.get("refresh_token_expires_at") or data.get("refresh_expires_at") or data.get("expires_at"),
        }
        self.file_mgr.write(payload)


__all__ = ["AuthController"]
