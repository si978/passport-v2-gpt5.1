from __future__ import annotations

import os
import tempfile
import unittest
from typing import Any, Dict, Optional

from auth_controller import AuthController
from session_file_manager import SessionFileManager
from refresh_scheduler import RefreshScheduler, now_utc
from logout_handler import LogoutHandler


class StubHttpClient:
    def __init__(self) -> None:
        self.calls: list[Dict[str, Any]] = []
        self.should_fail_refresh = False

    def login_by_phone(self, phone: str, code: str) -> Dict[str, Any]:
        self.calls.append({"op": "login", "phone": phone, "code": code})
        return {
            "guid": "G-STUB",
            "refresh_token": "R-STUB",
            "refresh_token_expires_at": now_utc().isoformat(),
        }

    def refresh_token(self, guid: str, refresh_token: str) -> Dict[str, Any]:
        self.calls.append({"op": "refresh", "guid": guid, "rt": refresh_token})
        if self.should_fail_refresh:
            raise RuntimeError("refresh failed")
        return {
            "guid": guid,
            "refresh_token": refresh_token,
            "refresh_token_expires_at": now_utc().isoformat(),
        }

    def logout(self, access_token: Optional[str] = None) -> None:
        self.calls.append({"op": "logout", "at": access_token})


class StubLogoutHandler(LogoutHandler):
    def __init__(self):
        super().__init__(api_logout=lambda: None, delete_session_file=lambda: None, broadcast_status=lambda _: None)
        self.logout_called = False

    def logout(self) -> None:  # type: ignore[override]
        self.logout_called = True
        return super().logout()


class StubScheduler(RefreshScheduler):
    def __init__(self):
        super().__init__(on_refresh=lambda: True)
        self.started = False

    def start(self, login_time):
        self.started = True
        return super().start(login_time)


class AuthControllerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.http = StubHttpClient()
        self.scheduler = StubScheduler()
        self.logout_handler = StubLogoutHandler()
        self.broadcast_events: list[str] = []
        self.tmpdir = tempfile.TemporaryDirectory()
        self.fm = SessionFileManager(path=os.path.join(self.tmpdir.name, "session.dat"))

    def tearDown(self) -> None:  # noqa: D401
        self.tmpdir.cleanup()

    def _controller(self) -> AuthController:
        return AuthController(
            http=self.http,
            file_mgr=self.fm,
            refresh_scheduler=self.scheduler,
            logout_handler=self.logout_handler,
            broadcast_status=lambda status: self.broadcast_events.append(status),
        )

    def test_login_persists_and_starts_scheduler(self):
        ctrl = self._controller()
        ctrl.login("13800138000", "123456")

        self.assertTrue(self.scheduler.started)
        self.assertIn("active", self.broadcast_events)
        self.assertEqual(self.http.calls[0]["op"], "login")

    def test_refresh_success(self):
        ctrl = self._controller()
        ok = ctrl.refresh("G1", "R1")
        self.assertTrue(ok)
        self.assertTrue(self.scheduler.started)
        self.assertIn("active", self.broadcast_events)

    def test_refresh_failure_returns_false(self):
        ctrl = self._controller()
        self.http.should_fail_refresh = True
        ok = ctrl.refresh("G1", "R1")
        self.assertFalse(ok)

    def test_logout_invokes_handler(self):
        ctrl = self._controller()
        ctrl.logout("A1")
        self.assertTrue(self.logout_handler.logout_called)
        self.assertEqual(self.http.calls[-1]["op"], "logout")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
