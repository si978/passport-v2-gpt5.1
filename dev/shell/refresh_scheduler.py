"""Token 刷新调度骨架，对应 Cycle5。

这里只实现与时间与错误处理相关的核心逻辑，具体平台定时器/IPC 集成由实际壳层项目接管。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional
import random


UTC = timezone.utc


REFRESH_INTERVAL = timedelta(hours=3)
JITTER_MAX = timedelta(minutes=10)
RETRY_INTERVAL = timedelta(minutes=5)
MAX_RETRY = 2


def now_utc() -> datetime:
    return datetime.now(UTC)


@dataclass
class RefreshState:
    last_success_at: datetime
    retry_count: int = 0
    next_scheduled_at: Optional[datetime] = None


class RefreshScheduler:
    def __init__(self, on_refresh: Callable[[], bool]) -> None:
        """on_refresh: 执行一次刷新请求，返回 bool 表示是否成功。"""

        self._on_refresh = on_refresh
        self._state: Optional[RefreshState] = None

    def start(self, login_time: datetime) -> None:
        self._state = RefreshState(last_success_at=login_time)
        self._schedule_next(success=True, base_time=login_time)

    def tick(self, now: Optional[datetime] = None) -> None:
        if self._state is None:
            return
        now = now or now_utc()
        if self._state.next_scheduled_at is None or now < self._state.next_scheduled_at:
            return
        success = self._on_refresh()
        self._schedule_next(success=success, base_time=now)

    def _schedule_next(self, success: bool, base_time: datetime) -> None:
        assert self._state is not None
        if success:
            self._state.last_success_at = base_time
            self._state.retry_count = 0
            jitter_seconds = random.randint(0, int(JITTER_MAX.total_seconds()))
            jitter = timedelta(seconds=jitter_seconds)
            self._state.next_scheduled_at = base_time + REFRESH_INTERVAL + jitter
        else:
            if self._state.retry_count >= MAX_RETRY:
                # 超出重试次数，交由前端处理“需要重新登录”的提示。
                self._state.next_scheduled_at = None
                return
            self._state.retry_count += 1
            self._state.next_scheduled_at = base_time + RETRY_INTERVAL
