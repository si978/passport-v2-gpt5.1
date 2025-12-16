import os
import sys
from datetime import datetime, timedelta, timezone

import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.domain import InMemoryUserRepo, User, UserStatus  # type: ignore  # noqa: E402
from backend.services import BanService, UserQueryService  # type: ignore  # noqa: E402


UTC = timezone.utc


class AdminUserQueryCycle25Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.user_repo = InMemoryUserRepo()
        self.query = UserQueryService(self.user_repo)
        self.ban = BanService(self.user_repo, None)  # type: ignore[arg-type]

        base = datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
        # ACTIVE
        u1 = User(guid="G1", phone="13800138010", status=UserStatus.ACTIVE, created_at=base)
        # BANNED
        u2 = User(guid="G2", phone="13800138011", status=UserStatus.BANNED, created_at=base + timedelta(minutes=1))
        # DELETED
        u3 = User(guid="G3", phone="13800138012", status=UserStatus.DELETED, created_at=base + timedelta(minutes=2))
        for u in (u1, u2, u3):
            self.user_repo.save(u)

    def test_list_users_returns_all_sorted(self) -> None:
        users = self.query.list_users()
        self.assertEqual([u.guid for u in users], ["G1", "G2", "G3"])

    def test_list_users_filter_by_status(self) -> None:
        active = self.query.list_users(UserStatus.ACTIVE)
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0].guid, "G1")

        banned = self.query.list_users(UserStatus.BANNED)
        self.assertEqual(len(banned), 1)
        self.assertEqual(banned[0].guid, "G2")

    def test_ban_and_unban_updates_status_and_query(self) -> None:
        # 先封禁 ACTIVE 用户
        self.ban.ban_by_phone("13800138010")
        banned = self.query.list_users(UserStatus.BANNED)
        self.assertTrue(any(u.guid == "G1" for u in banned))

        # 再解封
        self.ban.unban_by_phone("13800138010")
        active = self.query.list_users(UserStatus.ACTIVE)
        self.assertTrue(any(u.guid == "G1" for u in active))


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
