from __future__ import annotations

import sys
import os
import unittest
from typing import Any, Dict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from shell.shell_entry import ShellApp


class StubShellApp(ShellApp):
    def __init__(self):
        # base_url/app_id 不会真正调用后端，因为我们会 monkeypatch http client
        super().__init__(base_url="http://stub", app_id="jiuweihu")
        # 覆盖 http client 调用为 stub
        self.http.login_by_phone = self._login_stub  # type: ignore
        self.http.refresh_token = self._refresh_stub  # type: ignore
        self.http.logout = self._logout_stub  # type: ignore
        self.refresh_called = False

    def _login_stub(self, phone: str, code: str) -> Dict[str, Any]:
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=2)
        return {
            "guid": "G-STUB",
            "phone": phone,
            "user_type": 1,
            "refresh_token": "R-STUB",
            "created_at": now.isoformat().replace("+00:00", "Z"),
            "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        }

    def _refresh_stub(self, guid: str, refresh_token: str) -> Dict[str, Any]:
        self.refresh_called = True
        from datetime import datetime, timedelta, timezone
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=2)
        return {
            "guid": guid,
            "phone": "13800138000",
            "user_type": 1,
            "refresh_token": refresh_token,
            "created_at": now.isoformat().replace("+00:00", "Z"),
            "expires_at": expires_at.isoformat().replace("+00:00", "Z"),
        }

    def _logout_stub(self, access_token=None):
        return None


class ShellEntryTests(unittest.TestCase):
    def test_login_then_refresh_flow(self):
        app = StubShellApp()
        app.login("13800138000", "123456")
        self.assertTrue(any(e["status"] == "active" for e in app.events))

        # simulate scheduler tick
        data = app._read_as_dict()
        assert data is not None
        ok = app.refresh(data["guid"], data["refresh_token"])
        self.assertTrue(ok)
        self.assertTrue(app.refresh_called)

    def test_startup_none_when_no_file(self):
        app = StubShellApp()
        app.startup_flow()
        self.assertTrue(any(e["status"] == "none" for e in app.events))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
