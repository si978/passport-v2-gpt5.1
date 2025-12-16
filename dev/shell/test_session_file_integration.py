from __future__ import annotations

import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from shell.session_file_manager import SessionFileManager, TWO_HOURS
from shell.shell_entry import ShellApp


UTC = timezone.utc


class SessionFileIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmpdir.name, "session.dat")
        self.fm = SessionFileManager(path=self.path, now_provider=lambda: datetime.now(UTC))

    def tearDown(self) -> None:  # noqa: D401
        self.tmpdir.cleanup()

    def _write(self, created: datetime, expires: datetime):
        payload = {
            "guid": "G1",
            "phone": "13800138000",
            "user_type": "user",
            "refresh_token": "R",
            "created_at": created.isoformat(),
            "expires_at": expires.isoformat(),
        }
        self.fm.write(payload)

    def test_stale_file_deleted_on_startup(self):
        stale_created = datetime.now(UTC) - TWO_HOURS - timedelta(minutes=5)
        self._write(stale_created, stale_created + timedelta(days=2))

        app = ShellApp(base_url="http://127.0.0.1:8091", app_id="jiuweihu", file_mgr=self.fm)
        app.startup_flow()
        self.assertTrue(any(e["status"] == "none" for e in app.events))
        self.assertFalse(os.path.exists(self.path))

    def test_valid_file_broadcasts_sso_available(self):
        created = datetime.now(UTC)
        self._write(created, created + timedelta(days=2))

        app = ShellApp(base_url="http://127.0.0.1:8091", app_id="jiuweihu", file_mgr=self.fm)
        app.startup_flow()
        self.assertTrue(any(e["status"] == "sso_available" for e in app.events))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
