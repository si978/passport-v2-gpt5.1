"""壳层入口（无 IPC 版本，用于集成自测）。

组合 StartupHandler + AuthController + RefreshScheduler + LogoutHandler + SessionFileManager + HttpClient，
提供最小可用的登录/刷新/退出与启动流程。

使用方式：在集成测试或脚本中直接调用 ShellApp 的方法，无需 IPC。
"""

from __future__ import annotations

import os
from typing import Optional, Dict, Any
from datetime import datetime

# DPAPI hooks default to None; may be set by optional imports
protect = None
unprotect = None

# 优先绝对导入，便于作为脚本或包使用
try:  # pragma: no cover
    from ipc_adapter import emit_session_status, register_command
    from sso_startup import SsoStartupHandler
    from session_file_manager import SessionFileManager
    from http_client import HttpClient
    from refresh_scheduler import RefreshScheduler, now_utc
    from logout_handler import LogoutHandler
    from auth_controller import AuthController
except Exception:  # pragma: no cover
    from ipc_adapter import emit_session_status, register_command
    from sso_startup import SsoStartupHandler
    from session_file_manager import SessionFileManager
    from http_client import HttpClient
    from refresh_scheduler import RefreshScheduler, now_utc
    from logout_handler import LogoutHandler
    from auth_controller import AuthController
    from .http_client import HttpClient
    from .refresh_scheduler import RefreshScheduler, now_utc
    from .logout_handler import LogoutHandler
    from .auth_controller import AuthController
    try:
        from .dpapi_adapter import protect, unprotect
    except Exception:  # pragma: no cover
        protect = unprotect = None


class ShellApp:
    def __init__(
        self,
        base_url: str,
        app_id: str,
        *,
        file_mgr: SessionFileManager | None = None,
        http_client: HttpClient | None = None,
        logout_handler: LogoutHandler | None = None,
        scheduler: RefreshScheduler | None = None,
    ) -> None:
        self.events: list[Dict[str, Any]] = []  # 用于测试观测广播

        session_path = os.getenv("PASSPORT_SESSION_PATH") or None
        self.file_mgr = file_mgr or SessionFileManager(
            path=session_path,
            encoder=protect if protect else None,
            decoder=unprotect if unprotect else None,
        )

        self.logout_handler = logout_handler or LogoutHandler(
            api_logout=lambda: None,
            delete_session_file=lambda: self.file_mgr.delete(),
            broadcast_status=self._broadcast,
        )

        self.http = http_client or HttpClient(
            base_url=base_url,
            app_id=app_id,
            on_logout=lambda: self.logout_handler.logout(),
            on_broadcast=lambda status: self._broadcast(status),
        )

        self.scheduler = scheduler or RefreshScheduler(on_refresh=self._on_refresh_tick)

        self.auth = AuthController(
            http=self.http,
            file_mgr=self.file_mgr,
            refresh_scheduler=self.scheduler,
            logout_handler=self.logout_handler,
            broadcast_status=self._broadcast,
        )

        self.startup = SsoStartupHandler(
            read_session_file=lambda: self._read_as_dict(),
            delete_session_file=lambda: self.file_mgr.delete(),
            broadcast_status=lambda status, payload: self._broadcast(status, payload),
        )

        # IPC 指令占位：在真实 IPC 中可用 bus.dispatch 被替换为外部事件触发
        register_command("login", lambda p: self.login(p.get("phone"), p.get("code")))
        register_command("refresh", lambda p: self.refresh(p.get("guid"), p.get("refresh_token")))
        register_command("logout", lambda p: self.logout(p.get("access_token")))

    # --- Public API ---
    def startup_flow(self, now: Optional[datetime] = None) -> None:
        # 先广播 none，若后续有有效会话会被 sso_available 覆盖
        self._broadcast("none")
        struct = self._read_as_dict()
        if not struct:
            return
        self.startup.handle_startup(now or now_utc())

    def login(self, phone: str, code: str) -> None:
        self.auth.login(phone, code)

    def refresh(self, guid: str, refresh_token: str) -> bool:
        return self.auth.refresh(guid, refresh_token)

    def logout(self, access_token: Optional[str] = None) -> None:
        self.auth.logout(access_token)

    # --- Helpers ---
    def _on_refresh_tick(self) -> bool:
        data = self._read_as_dict()
        if not data:
            return False
        return self.auth.refresh(data["guid"], data["refresh_token"])

    def _read_as_dict(self) -> Optional[Dict[str, Any]]:
        try:
            return self.file_mgr.read()
        except FileNotFoundError:
            return None
        except ValueError:
            return None

    def _broadcast(self, status: str, payload: Optional[Dict[str, Any]] = None) -> None:
        self.events.append({"status": status, "payload": payload})
        emit_session_status(status, payload)


__all__ = ["ShellApp"]
