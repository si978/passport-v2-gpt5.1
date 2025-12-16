"""管理后台相关应用服务：封禁/解封、用户查询、登录日志。"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from refactor.backend.domain import (
    InMemoryLoginLogRepo,
    InMemorySessionStore,
    InMemoryUserRepo,
    LoginLog,
    User,
    UserStatus,
    now_utc,
)


class BanUseCase:
    """封禁/解封用户用例。

    兼容旧实现的 `BanService` 行为：
    - 封禁时更新用户状态并清理会话；
    - 解封时仅更新用户状态，不恢复会话。
    """

    def __init__(self, user_repo: InMemoryUserRepo, session_store: Optional[InMemorySessionStore]) -> None:
        self._users = user_repo
        self._sessions = session_store

    def ban_by_phone(self, phone: str) -> None:
        user = self._users.find_by_phone(phone)
        if user is None:
            return
        user.status = UserStatus.BANNED
        self._users.save(user)
        if self._sessions is not None:
            self._sessions.delete(user.guid)

    def unban_by_phone(self, phone: str) -> None:
        user = self._users.find_by_phone(phone)
        if user is None:
            return
        user.status = UserStatus.ACTIVE
        self._users.save(user)


class UserQueryUseCase:
    """后台用户查询用例，提供按状态过滤与排序。"""

    def __init__(self, user_repo: InMemoryUserRepo) -> None:
        self._users = user_repo

    def list_users(self, status: Optional[UserStatus] = None) -> list[User]:
        users = list(self._users.all().values())
        if status is not None:
            users = [u for u in users if u.status == status]
        users.sort(key=lambda u: (u.created_at, u.phone))
        return users


@dataclass
class LoginLogQuery:
    phone: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    channel: Optional[str] = None


class LoginLogUseCase:
    """登录活跃记录用例，封装记录与查询逻辑。"""

    def __init__(self, repo: InMemoryLoginLogRepo) -> None:
        self._repo = repo

    def record_login(
        self,
        guid: str,
        phone: str,
        success: bool,
        *,
        channel: str = "pc",
        ip: Optional[str] = None,
        error_code: Optional[str] = None,
        when: Optional[datetime] = None,
    ) -> None:
        when = when or now_utc()
        log = LoginLog(
            guid=guid,
            phone=phone,
            login_at=when,
            channel=channel,
            ip=ip,
            success=success,
            error_code=error_code,
        )
        self._repo.append(log)

    def record_logout(
        self,
        guid: str,
        phone: Optional[str] = None,
        *,
        channel: str = "pc",
        ip: Optional[str] = None,
        when: Optional[datetime] = None,
    ) -> None:
        """记录用户登出事件，兼容旧实现的匹配策略。"""

        when = when or now_utc()
        logs = self._repo.all()
        for log in reversed(logs):
            if log.guid != guid:
                continue
            if phone is not None and log.phone != phone:
                continue
            if log.logout_at is not None:
                continue
            log.logout_at = when
            if channel:
                log.channel = channel
            if ip is not None:
                log.ip = ip
            break

    def query(self, query: LoginLogQuery) -> list[LoginLog]:
        return self._repo.query(
            phone=query.phone,
            start=query.start,
            end=query.end,
            channel=query.channel,
        )


__all__ = [
    "BanUseCase",
    "UserQueryUseCase",
    "LoginLogQuery",
    "LoginLogUseCase",
]
