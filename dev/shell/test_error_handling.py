from __future__ import annotations

import unittest

from error_handling import ErrorAction, map_error_to_action, handle_error_action


class ErrorHandlingTests(unittest.TestCase):
    def test_map_error_to_action(self) -> None:
        self.assertEqual(map_error_to_action("ERR_REFRESH_EXPIRED"), ErrorAction.LOGOUT)
        self.assertEqual(map_error_to_action("ERR_REFRESH_MISMATCH"), ErrorAction.LOGOUT)
        self.assertEqual(map_error_to_action("ERR_SESSION_NOT_FOUND"), ErrorAction.LOGOUT)
        self.assertEqual(map_error_to_action("ERR_ACCESS_EXPIRED"), ErrorAction.RETRY_REFRESH)
        self.assertEqual(map_error_to_action("ERR_ACCESS_INVALID"), ErrorAction.RETRY_REFRESH)
        self.assertEqual(map_error_to_action("ERR_USER_BANNED"), ErrorAction.BAN)
        self.assertEqual(map_error_to_action("ERR_APP_ID_MISMATCH"), ErrorAction.APP_MISMATCH)
        self.assertEqual(map_error_to_action("ERR_CODE_TOO_FREQUENT"), ErrorAction.RATE_LIMIT)
        self.assertEqual(map_error_to_action("ERR_INTERNAL"), ErrorAction.INTERNAL)
        self.assertEqual(map_error_to_action(None), ErrorAction.NOOP)

    def test_handle_error_action_logout_and_ban(self) -> None:
        events: list[str] = []

        def logout():
            events.append("logout")

        def broadcast(status: str):
            events.append(f"broadcast:{status}")

        handle_error_action(ErrorAction.LOGOUT, logout=logout, broadcast_status=broadcast)
        handle_error_action(ErrorAction.BAN, logout=logout, broadcast_status=broadcast)

        self.assertIn("logout", events)
        self.assertIn("broadcast:none", events)
        self.assertIn("broadcast:banned", events)

    def test_handle_error_action_rate_limit_and_app_mismatch(self) -> None:
        events: list[str] = []

        handle_error_action(
            ErrorAction.RATE_LIMIT,
            logout=lambda: None,
            broadcast_status=lambda _: None,
            on_rate_limit=lambda: events.append("rate_limited"),
        )

        handle_error_action(
            ErrorAction.APP_MISMATCH,
            logout=lambda: None,
            broadcast_status=lambda _: None,
            on_app_mismatch=lambda: events.append("app_mismatch"),
        )

        self.assertIn("rate_limited", events)
        self.assertIn("app_mismatch", events)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
