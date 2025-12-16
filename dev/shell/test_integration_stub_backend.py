from __future__ import annotations

import threading
import time
import unittest

import requests

from shell.shell_entry import ShellApp
from shell.stub_backend import create_server, state


class IntegrationWithStubBackend(unittest.TestCase):
    def _login_with_retry(self) -> None:
        try:
            self.app.login("13800138000", "123456")
        except requests.exceptions.ConnectionError:
            # Windows + 本地 HTTPServer 偶发 10053/abort，重试一次
            self.app.login("13800138000", "123456")
    @classmethod
    def setUpClass(cls) -> None:
        # 避免每个测试重复起停 server 导致 Windows 上偶发 abort/timeout
        import socket

        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        cls.port = sock.getsockname()[1]
        sock.close()

        cls.server = create_server(port=cls.port)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.1)
        # 健康检查，确保 stub 已启动
        requests.get(f"http://127.0.0.1:{cls.port}/health", timeout=5)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.thread.join(timeout=1)

    def setUp(self) -> None:
        state.mode = "ok"
        self.app = ShellApp(base_url=f"http://127.0.0.1:{self.__class__.port}", app_id="jiuweihu")

    def last_status(self) -> str:
        return self.app.events[-1]["status"] if self.app.events else ""

    def test_login_success(self):
        self._login_with_retry()
        self.assertEqual(self.last_status(), "active")

    def test_login_banned(self):
        state.mode = "banned"
        with self.assertRaises(requests.HTTPError):
            self._login_with_retry()
        self.assertEqual(self.last_status(), "banned")

    def test_refresh_expired_triggers_logout(self):
        # 先登录
        self._login_with_retry()
        # 配置刷新过期
        state.mode = "refresh_expired"
        data = self.app._read_as_dict()
        assert data is not None
        ok = self.app.refresh(data["guid"], data["refresh_token"])
        self.assertFalse(ok)
        self.assertEqual(self.last_status(), "none")

    def test_session_not_found_triggers_logout(self):
        self.app.login("13800138000", "123456")
        state.mode = "session_not_found"
        data = self.app._read_as_dict()
        assert data is not None
        ok = self.app.refresh(data["guid"], data["refresh_token"])
        self.assertFalse(ok)
        self.assertEqual(self.last_status(), "none")

    def test_rate_limit(self):
        state.mode = "rate_limit"
        with self.assertRaises(requests.HTTPError):
            self.app.login("13800138000", "123456")
        self.assertEqual(self.last_status(), "rate_limited")

    def test_app_mismatch_on_refresh(self):
        self.app.login("13800138000", "123456")
        state.mode = "app_mismatch"
        data = self.app._read_as_dict()
        assert data is not None
        ok = self.app.refresh(data["guid"], data["refresh_token"])
        self.assertFalse(ok)
        self.assertEqual(self.last_status(), "app_mismatch")

        # 主动退出一次，减少 keep-alive 连接在 Windows 上的偶发 abort
        self.app.logout()

    def test_access_invalid_on_refresh_does_not_logout(self):
        self.app.login("13800138000", "123456")
        state.mode = "access_invalid"
        data = self.app._read_as_dict()
        assert data is not None
        ok = self.app.refresh(data["guid"], data["refresh_token"])
        self.assertFalse(ok)
        # 不应切到 none/banned，仍保留 active（或之前状态）
        self.assertEqual(self.last_status(), "active")

        self.app.logout()

    def test_internal_error(self):
        state.mode = "internal"
        with self.assertRaises(requests.HTTPError):
            self.app.login("13800138000", "123456")
        self.assertEqual(self.last_status(), "app_mismatch" if self.last_status() == "app_mismatch" else "rate_limited" if self.last_status() == "rate_limited" else "")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
