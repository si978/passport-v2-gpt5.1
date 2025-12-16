"""后端 HTTP 调用封装（壳层侧）。

功能：
- 统一基地址、app_id 头。
- 对错误码进行解析，调用 error_handling 映射动作；由上层决定是否继续刷新/登出。
- 仅提供最小 login/refresh/logout 能力，便于 Phase 1 自测。
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Callable
import requests

try:
    from .error_handling import map_error_to_action, handle_error_action
except ImportError:  # pragma: no cover
    from error_handling import map_error_to_action, handle_error_action


class HttpClient:
    def __init__(
        self,
        base_url: str,
        app_id: str,
        *,
        on_logout: Callable[[], None],
        on_broadcast: Callable[[str], None],
        timeout: int = 5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.app_id = app_id
        self.timeout = timeout
        self.on_logout = on_logout
        self.on_broadcast = on_broadcast

    def _headers(self) -> Dict[str, str]:
        return {"Content-Type": "application/json", "x-app-id": self.app_id}

    def _request(self, method: str, path: str, json_body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        # Windows + 本地 HTTPServer 在高频短连接下偶发 10053/abort，做一次轻量重试以提升稳定性。
        try:
            resp = requests.request(
                method,
                url,
                headers={**self._headers(), "Connection": "close"},
                json=json_body,
                timeout=self.timeout,
            )
        except requests.exceptions.ConnectionError:
            resp = requests.request(
                method,
                url,
                headers={**self._headers(), "Connection": "close"},
                json=json_body,
                timeout=self.timeout,
            )

        if resp.status_code >= 400:
            data = {}
            if resp.content:
                try:
                    data = resp.json()
                except Exception:
                    data = {}
            code = data.get("code") or data.get("error_code")
            action = map_error_to_action(code)
            # 对于会话缺失/刷新类错误，直接广播 none 并返回空结果，避免再抛异常
            if code in ("ERR_SESSION_NOT_FOUND", "ERR_REFRESH_EXPIRED", "ERR_REFRESH_MISMATCH"):
                handle_error_action(
                    action,
                    logout=self.on_logout,
                    broadcast_status=self.on_broadcast,
                    on_rate_limit=lambda: self.on_broadcast("rate_limited"),
                    on_app_mismatch=lambda: self.on_broadcast("app_mismatch"),
                )
                return {}

            handle_error_action(
                action,
                logout=self.on_logout,
                broadcast_status=self.on_broadcast,
                on_rate_limit=lambda: self.on_broadcast("rate_limited"),
                on_app_mismatch=lambda: self.on_broadcast("app_mismatch"),
            )
            resp.raise_for_status()
            return {}

        if resp.content:
            return resp.json()
        return {}

    # --- API wrappers ---

    def login_by_phone(self, phone: str, code: str) -> Dict[str, Any]:
        return self._request("POST", "/passport/login-by-phone", {"phone": phone, "code": code, "app_id": self.app_id})

    def refresh_token(self, guid: str, refresh_token: str) -> Dict[str, Any]:
        return self._request("POST", f"/passport/{guid}/refresh-token", {"refresh_token": refresh_token, "app_id": self.app_id, "guid": guid})

    def logout(self, access_token: Optional[str] = None) -> None:
        body: Dict[str, Any] = {}
        if access_token:
            body["access_token"] = access_token
        self._request("POST", "/passport/logout", body)


__all__ = ["HttpClient"]
