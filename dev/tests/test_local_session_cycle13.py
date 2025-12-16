import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from native.local_session import (  # type: ignore  # noqa: E402
    LocalSessionCrypto,
    LocalSessionValidator,
    ValidationStatus,
    delete_session_file,
    read_session_file,
    write_session_file,
)


UTC = timezone.utc


class LocalSessionCycle13Tests(unittest.TestCase):
    def test_encrypt_decrypt_roundtrip(self) -> None:
        payload = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": datetime(2025, 1, 1, tzinfo=UTC).isoformat(),
            "expires_at": datetime(2025, 1, 3, tzinfo=UTC).isoformat(),
            "refresh_token": "R.token",
        }
        cipher = LocalSessionCrypto.encrypt(payload)
        self.assertNotIn(b"13800138000", cipher)

        decoded = LocalSessionCrypto.decrypt(cipher)
        self.assertEqual(decoded["guid"], payload["guid"])
        self.assertEqual(decoded["phone"], payload["phone"])

    def test_decrypt_invalid_cipher_raises(self) -> None:
        with self.assertRaises(ValueError):
            LocalSessionCrypto.decrypt(b"not-base64")

    def test_validator_valid(self) -> None:
        now = datetime(2025, 1, 1, 1, 0, tzinfo=UTC)
        struct = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": datetime(2025, 1, 1, 0, 0, tzinfo=UTC).isoformat(),
            "expires_at": datetime(2025, 1, 3, 0, 0, tzinfo=UTC).isoformat(),
            "refresh_token": "R.token",
        }
        status = LocalSessionValidator().validate(struct, now)
        self.assertEqual(status, ValidationStatus.VALID)

    def test_validator_corrupted_missing_fields(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)
        struct = {"guid": "G1"}
        status = LocalSessionValidator().validate(struct, now)
        self.assertEqual(status, ValidationStatus.CORRUPTED)

    def test_validator_expired_local_when_over_two_hours(self) -> None:
        created = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        now = created + timedelta(hours=2, minutes=1)
        struct = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": created.isoformat(),
            "expires_at": (created + timedelta(days=2)).isoformat(),
            "refresh_token": "R.token",
        }
        status = LocalSessionValidator().validate(struct, now)
        self.assertEqual(status, ValidationStatus.EXPIRED_LOCAL)

    def test_write_read_delete_session_file(self) -> None:
        payload = {
            "guid": "G1",
            "phone": "13800138000",
            "created_at": datetime(2025, 1, 1, tzinfo=UTC).isoformat(),
            "expires_at": datetime(2025, 1, 3, tzinfo=UTC).isoformat(),
            "refresh_token": "R.token",
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "session.dat")
            write_session_file(path, payload)
            loaded = read_session_file(path)
            self.assertEqual(loaded["guid"], payload["guid"])
            self.assertEqual(loaded["phone"], payload["phone"])

            # 删除应幂等
            delete_session_file(path)
            delete_session_file(path)



if __name__ == "__main__":  # pragma: no cover
    unittest.main()
