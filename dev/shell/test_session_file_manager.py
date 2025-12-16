from __future__ import annotations

import os
from tempfile import TemporaryDirectory
import unittest
from datetime import datetime, timedelta, timezone

from session_file_manager import SessionFileManager, TWO_HOURS

UTC = timezone.utc


def iso(dt: datetime) -> str:
    return dt.replace(tzinfo=UTC).isoformat()


class SessionFileManagerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmpdir = TemporaryDirectory()
        self.now = datetime(2025, 1, 1, 12, 0, 0, tzinfo=UTC)
        self.fm = SessionFileManager(path=os.path.join(self.tmpdir.name, "session.dat"), now_provider=lambda: self.now)

    def tearDown(self) -> None:  # noqa: D401
        self.tmpdir.cleanup()

    def _payload(self, created: datetime | None = None, expires: datetime | None = None):
        c = created or self.now
        e = expires or (c + timedelta(days=2))
        return {
            "guid": "G1",
            "phone": "13800138000",
            "user_type": "user",
            "refresh_token": "R",
            "created_at": iso(c),
            "expires_at": iso(e),
        }

    def test_write_and_read(self):
        self.fm.write(self._payload())
        data = self.fm.read()
        self.assertEqual(data["guid"], "G1")

    def test_missing_field_raises(self):
        bad = self._payload()
        del bad["guid"]
        with self.assertRaises(ValueError):
            self.fm.write(bad)

    def test_expires_before_created_raises(self):
        bad = self._payload(expires=self.now - timedelta(seconds=1))
        with self.assertRaises(ValueError):
            self.fm.write(bad)

    def test_parse_invalid_ts_raises(self):
        bad = self._payload()
        bad["created_at"] = "not-a-date"
        with self.assertRaises(ValueError):
            self.fm.write(bad)

    def test_stale_file_deleted_and_not_found(self):
        stale_time = self.now - TWO_HOURS - timedelta(minutes=1)
        payload = self._payload(created=stale_time)
        self.fm.write(payload)

        # 手动伪造文件创建时间为陈旧（stat.st_ctime）。在部分平台上直接修改 mtime 即可覆盖。
        os.utime(self.fm.path, (stale_time.timestamp(), stale_time.timestamp()))

        with self.assertRaises(FileNotFoundError):
            self.fm.read()
        # ensure file is deleted
        self.assertFalse(os.path.exists(self.fm.path))

    def test_encoder_decoder_roundtrip(self):
        def enc(s: str) -> str:
            return s[::-1]

        def dec(s: str) -> str:
            return s[::-1]

        fm = SessionFileManager(path=os.path.join(self.tmpdir.name, "session-enc.dat"), now_provider=lambda: self.now, encoder=enc, decoder=dec)
        fm.write(self._payload())
        data = fm.read()
        self.assertEqual(data["guid"], "G1")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
