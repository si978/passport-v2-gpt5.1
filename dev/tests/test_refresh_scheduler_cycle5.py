import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from shell.refresh_scheduler import (  # type: ignore  # noqa: E402
    REFRESH_INTERVAL,
    RETRY_INTERVAL,
    MAX_RETRY,
    RefreshScheduler,
    RefreshState,
)


UTC = timezone.utc


class RefreshSchedulerTests(unittest.TestCase):
    def test_successful_refresh_schedules_next_with_interval(self) -> None:
        calls = []

        def on_refresh() -> bool:
            calls.append("ok")
            return True

        scheduler = RefreshScheduler(on_refresh)
        base = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        scheduler.start(base)

        # 强制将 next_scheduled_at 设为 base+interval 以消除抖动影响
        assert scheduler._state is not None  # type: ignore[attr-defined]
        scheduler._state.next_scheduled_at = base + REFRESH_INTERVAL

        scheduler.tick(base + REFRESH_INTERVAL)
        self.assertEqual(calls, ["ok"])

    def test_failed_refresh_retries_up_to_max_retry(self) -> None:
        calls = []

        def on_refresh() -> bool:
            calls.append("fail")
            return False

        scheduler = RefreshScheduler(on_refresh)
        base = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        scheduler.start(base)
        assert scheduler._state is not None  # type: ignore[attr-defined]
        scheduler._state.next_scheduled_at = base

        # 触发第一次失败
        scheduler.tick(base)
        self.assertEqual(len(calls), 1)
        state = scheduler._state
        assert state is not None
        self.assertEqual(state.retry_count, 1)
        self.assertEqual(state.next_scheduled_at, base + RETRY_INTERVAL)

        # 触发第二次失败
        scheduler.tick(base + RETRY_INTERVAL)
        self.assertEqual(len(calls), 2)
        state = scheduler._state
        assert state is not None
        self.assertEqual(state.retry_count, 2)

        # 超过 MAX_RETRY 后不再重试
        # 将 next_scheduled_at 调整为当前时间后再 tick 一次
        state.next_scheduled_at = base + RETRY_INTERVAL * 2
        scheduler.tick(base + RETRY_INTERVAL * 2)
        # 由于已经达到 MAX_RETRY，_schedule_next 会清空 next_scheduled_at
        state = scheduler._state
        assert state is not None
        self.assertIsNone(state.next_scheduled_at)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
