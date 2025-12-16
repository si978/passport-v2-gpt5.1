"""镜像测试：验证管理类用例（封禁/查询/登录日志）新旧行为一致。"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

UTC = timezone.utc


from dev.backend.domain import (  # type: ignore  # noqa: E402
    InMemoryLoginLogRepo as OldLogRepo,
    InMemorySessionStore as OldSessionStore,
    InMemoryUserRepo as OldUserRepo,
    LoginLog,
    User,
    UserStatus,
)
from dev.backend.services import (  # type: ignore  # noqa: E402
    BanService,
    LoginLogService,
    UserQueryService,
)

from refactor.backend.domain import (  # type: ignore  # noqa: E402
    InMemoryLoginLogRepo as NewLogRepo,
    InMemorySessionStore as NewSessionStore,
    InMemoryUserRepo as NewUserRepo,
)
from refactor.backend.application.admin import (  # type: ignore  # noqa: E402
    BanUseCase,
    LoginLogQuery,
    LoginLogUseCase,
    UserQueryUseCase,
)


class AdminUsecaseMirrorTests(unittest.TestCase):
    def setUp(self) -> None:
        # 仓储与服务 - 旧实现
        self.old_users = OldUserRepo()
        self.old_sessions = OldSessionStore()
        self.old_logs = OldLogRepo()
        self.old_ban = BanService(self.old_users, self.old_sessions)
        self.old_query = UserQueryService(self.old_users)
        self.old_log_service = LoginLogService(self.old_logs)

        # 仓储与用例 - 新实现
        self.new_users = NewUserRepo()
        self.new_sessions = NewSessionStore()
        self.new_logs = NewLogRepo()
        self.new_ban = BanUseCase(self.new_users, self.new_sessions)
        self.new_query = UserQueryUseCase(self.new_users)
        self.new_log_usecase = LoginLogUseCase(self.new_logs)

    def test_ban_and_unban_have_same_effect(self) -> None:
        user_old = User(guid="G1", phone="13800138000", status=UserStatus.ACTIVE)
        user_new = User(guid="G1", phone="13800138000", status=UserStatus.ACTIVE)
        self.old_users.save(user_old)
        self.new_users.save(user_new)

        # 预置会话：使用 Session/AppSession，而不是 LoginLog
        from dev.backend.domain import Session as OldSession, AppSession as OldAppSession  # type: ignore  # noqa: E402
        from refactor.backend.domain import Session as NewSession, AppSession as NewAppSession  # type: ignore  # noqa: E402

        now = datetime.now(UTC)
        rt = "R.token"
        at_exp = now + timedelta(hours=1)
        rt_exp = now + timedelta(days=1)

        old_session = OldSession(
            guid="G1",
            refresh_token=rt,
            refresh_token_expires_at=rt_exp,
            apps={
                "jiuweihu": OldAppSession(
                    access_token="A.token",
                    access_token_expires_at=at_exp,
                    last_active_at=now,
                )
            },
        )
        new_session = NewSession(
            guid="G1",
            refresh_token=rt,
            refresh_token_expires_at=rt_exp,
            apps={
                "jiuweihu": NewAppSession(
                    access_token="A.token",
                    access_token_expires_at=at_exp,
                    last_active_at=now,
                )
            },
        )

        self.old_sessions.put(old_session)
        self.new_sessions.put(new_session)

        self.old_ban.ban_by_phone("13800138000")
        self.new_ban.ban_by_phone("13800138000")

        self.assertEqual(self.old_users.find_by_phone("13800138000").status, UserStatus.BANNED)  # type: ignore[union-attr]
        self.assertEqual(self.new_users.find_by_phone("13800138000").status, UserStatus.BANNED)  # type: ignore[union-attr]

        self.old_ban.unban_by_phone("13800138000")
        self.new_ban.unban_by_phone("13800138000")

        self.assertEqual(self.old_users.find_by_phone("13800138000").status, UserStatus.ACTIVE)  # type: ignore[union-attr]
        self.assertEqual(self.new_users.find_by_phone("13800138000").status, UserStatus.ACTIVE)  # type: ignore[union-attr]

    def test_user_query_sort_and_filter_are_consistent(self) -> None:
        base_time = datetime(2025, 1, 1, tzinfo=UTC)
        users = [
            User(guid="G1", phone="13800138000", status=UserStatus.ACTIVE, created_at=base_time),
            User(guid="G2", phone="13800138001", status=UserStatus.BANNED, created_at=base_time + timedelta(seconds=1)),
            User(guid="G3", phone="13800138002", status=UserStatus.ACTIVE, created_at=base_time + timedelta(seconds=2)),
        ]
        for u in users:
            self.old_users.save(u)
            self.new_users.save(User(
                guid=u.guid,
                phone=u.phone,
                status=u.status,
                created_at=u.created_at,
                updated_at=u.updated_at,
            ))

        old_active = self.old_query.list_users(status=UserStatus.ACTIVE)
        new_active = self.new_query.list_users(status=UserStatus.ACTIVE)
        self.assertEqual([u.guid for u in old_active], [u.guid for u in new_active])

    def test_login_log_record_and_query_consistent(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=UTC)
        # 记录几条登录日志
        for i in range(3):
            t = now + timedelta(minutes=i)
            self.old_log_service.record_login(
                guid="G1",
                phone="13800138000",
                success=True,
                channel="pc",
                ip="127.0.0.1",
                error_code=None,
                when=t,
            )
            self.new_log_usecase.record_login(
                guid="G1",
                phone="13800138000",
                success=True,
                channel="pc",
                ip="127.0.0.1",
                error_code=None,
                when=t,
            )

        # 登出记录
        self.old_log_service.record_logout("G1", phone="13800138000", channel="pc", ip="127.0.0.1", when=now + timedelta(minutes=10))
        self.new_log_usecase.record_logout("G1", phone="13800138000", channel="pc", ip="127.0.0.1", when=now + timedelta(minutes=10))

        # 查询
        q = LoginLogQuery(phone="13800138000", start=now, end=now + timedelta(minutes=20), channel="pc")
        old_rows = self.old_log_service.query_logs(phone=q.phone, start=q.start, end=q.end, channel=q.channel)
        new_rows = self.new_log_usecase.query(q)

        self.assertEqual(len(old_rows), len(new_rows))
        self.assertEqual([r.login_at for r in old_rows], [r.login_at for r in new_rows])


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
