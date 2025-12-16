import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
  sys.path.insert(0, ROOT)

from backend.domain import InMemoryLoginLogRepo  # type: ignore  # noqa: E402
from backend.services import LoginLogService  # type: ignore  # noqa: E402


UTC = timezone.utc


class LoginLogCycle28_29Tests(unittest.TestCase):
  def setUp(self) -> None:
    self.repo = InMemoryLoginLogRepo()
    self.service = LoginLogService(self.repo)

    base = datetime(2025, 1, 1, 10, 0, tzinfo=UTC)
    # user A: 两次登录（pc / mobile）
    self.service.record_login("GA", "13800138000", True, channel="pc", ip="1.1.1.1", when=base)
    self.service.record_logout("GA", "13800138000", channel="pc", ip="1.1.1.1", when=base + timedelta(hours=1))

    self.service.record_login("GA", "13800138000", False, channel="mobile", ip="2.2.2.2", error_code="ERR_CODE_INVALID", when=base + timedelta(hours=2))

    # user B: 一次登录
    self.service.record_login("GB", "13800138001", True, channel="pc", ip="3.3.3.3", when=base + timedelta(hours=3))

  def test_filter_by_phone(self) -> None:
    logs_a = self.service.query_logs(phone="13800138000")
    self.assertEqual(len(logs_a), 2)
    self.assertTrue(all(l.phone == "13800138000" for l in logs_a))

  def test_filter_by_time_window(self) -> None:
    start = datetime(2025, 1, 1, 11, 0, tzinfo=UTC)
    end = datetime(2025, 1, 1, 13, 0, tzinfo=UTC)
    logs = self.service.query_logs(start=start, end=end)
    # 11:00~13:00 只包含第二次登录和 user B 登录
    self.assertEqual(len(logs), 2)

  def test_filter_by_channel(self) -> None:
    pc_logs = self.service.query_logs(channel="pc")
    self.assertEqual(len(pc_logs), 2)
    self.assertTrue(all(l.channel == "pc" for l in pc_logs))

  def test_logout_updates_logout_at(self) -> None:
    base = datetime(2025, 1, 2, 10, 0, tzinfo=UTC)
    self.service.record_login("GC", "13800138002", True, channel="pc", when=base)
    self.service.record_logout("GC", "13800138002", when=base + timedelta(minutes=30))

    logs = self.service.query_logs(phone="13800138002")
    self.assertEqual(len(logs), 1)
    self.assertIsNotNone(logs[0].logout_at)


if __name__ == "__main__":  # pragma: no cover
  unittest.main()
