"""极简 stub 后端：按请求路径返回约定错误码或成功响应。

仅用于本地集成测试，替代真实后端。
"""

from __future__ import annotations

from typing import Dict, Any
from http.server import BaseHTTPRequestHandler, HTTPServer
from socketserver import ThreadingMixIn
import argparse
import json


class StubState:
    def __init__(self) -> None:
        self.mode = "ok"  # ok / banned / refresh_expired / refresh_mismatch / session_not_found / app_mismatch / access_invalid / rate_limit / internal
        self.guid = "G-STUB"
        self.refresh_token = "R-STUB"


state = StubState()


def _send_json(handler: BaseHTTPRequestHandler, code: int, payload: Dict[str, Any]):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class StubHandler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802
        try:
            if self.path.endswith("/login-by-phone"):
                return self._handle_login()
            if self.path.endswith("/refresh-token"):
                return self._handle_refresh()
            if self.path.endswith("/logout"):
                return self._handle_logout()
            _send_json(self, 404, {"code": "NOT_FOUND"})
        except Exception as exc:  # noqa: BLE001
            _send_json(self, 500, {"code": "ERR_INTERNAL", "detail": str(exc)})

    def do_GET(self):  # noqa: N802
        try:
            if self.path == "/health":
                return _send_json(self, 200, {"ok": True})
            _send_json(self, 404, {"code": "NOT_FOUND"})
        except Exception as exc:  # noqa: BLE001
            _send_json(self, 500, {"code": "ERR_INTERNAL", "detail": str(exc)})

    def _handle_login(self):
        if state.mode == "banned":
            return _send_json(self, 403, {"code": "ERR_USER_BANNED"})
        if state.mode == "rate_limit":
            return _send_json(self, 429, {"code": "ERR_CODE_TOO_FREQUENT"})
        if state.mode == "internal":
            return _send_json(self, 500, {"code": "ERR_INTERNAL"})
        # success - 返回完整的会话字段
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=2)
        return _send_json(
            self,
            200,
            {
                "guid": state.guid,
                "phone": "13800138000",
                "user_type": 1,
                "refresh_token": state.refresh_token,
                "created_at": now.isoformat().replace("+00:00", "Z"),
                "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
            },
        )

    def _handle_refresh(self):
        if state.mode == "refresh_expired":
            return _send_json(self, 401, {"code": "ERR_REFRESH_EXPIRED"})
        if state.mode == "refresh_mismatch":
            return _send_json(self, 401, {"code": "ERR_REFRESH_MISMATCH"})
        if state.mode == "session_not_found":
            return _send_json(self, 401, {"code": "ERR_SESSION_NOT_FOUND"})
        if state.mode == "app_mismatch":
            return _send_json(self, 403, {"code": "ERR_APP_ID_MISMATCH"})
        if state.mode == "access_invalid":
            return _send_json(self, 401, {"code": "ERR_ACCESS_INVALID"})
        if state.mode == "internal":
            return _send_json(self, 500, {"code": "ERR_INTERNAL"})
        # success - 返回完整的会话字段
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=2)
        return _send_json(
            self,
            200,
            {
                "guid": state.guid,
                "phone": "13800138000",
                "user_type": 1,
                "refresh_token": state.refresh_token,
                "created_at": now.isoformat().replace("+00:00", "Z"),
                "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
            },
        )

    def _handle_logout(self):
        return _send_json(self, 200, {"code": "OK"})

    def log_message(self, format: str, *args):  # noqa: A003
        return  # silence


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def run_stub_server(host: str = "127.0.0.1", port: int = 8090):
    httpd = ThreadingHTTPServer((host, port), StubHandler)
    httpd.serve_forever()


def create_server(host: str = "127.0.0.1", port: int = 8090) -> HTTPServer:
    """用于测试的 server 工厂，可在测试中调用 shutdown() 结束。"""

    return ThreadingHTTPServer((host, port), StubHandler)


if __name__ == "__main__":  # pragma: no cover
    parser = argparse.ArgumentParser(description="Passport stub backend (for local shell integration tests)")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8090)
    args = parser.parse_args()

    run_stub_server(host=args.host, port=args.port)
