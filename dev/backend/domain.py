from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Dict, Optional


UTC = timezone.utc


class UserStatus(int, Enum):
    ACTIVE = 1      # 正常
    BANNED = 0      # 封禁
    DELETED = -1    # 注销/删除


@dataclass
class User:
    guid: str
    phone: str
    user_type: int = 1
    account_source: str = "phone"
    status: UserStatus = UserStatus.ACTIVE
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class AppSession:
    access_token: str
    access_token_expires_at: datetime
    last_active_at: datetime


@dataclass
class Session:
    guid: str
    refresh_token: str
    refresh_token_expires_at: datetime
    apps: Dict[str, AppSession]

    def is_refresh_valid(self, now: datetime) -> bool:
        return now < self.refresh_token_expires_at


class AuthError(Exception):
    """Base class for domain-level认证异常，携带错误码。"""

    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(message or code)
        self.code = code


# 错误码常量（需与 PRD 第 13 章保持一致）
ERR_CODE_INVALID = "ERR_CODE_INVALID"
ERR_CODE_EXPIRED = "ERR_CODE_EXPIRED"
ERR_PHONE_INVALID = "ERR_PHONE_INVALID"
ERR_USER_BANNED = "ERR_USER_BANNED"
ERR_REFRESH_EXPIRED = "ERR_REFRESH_EXPIRED"
ERR_REFRESH_MISMATCH = "ERR_REFRESH_MISMATCH"
ERR_APP_ID_MISMATCH = "ERR_APP_ID_MISMATCH"
ERR_ACCESS_EXPIRED = "ERR_ACCESS_EXPIRED"
ERR_ACCESS_INVALID = "ERR_ACCESS_INVALID"


class VerificationCodeStore:
    """简单的内存验证码存储，仅用于本地开发与单元测试。

    真实实现应使用 Redis 或其他集中式缓存，并带有过期策略与频率限制。
    """

    def __init__(self) -> None:
        self._data: Dict[str, tuple[str, datetime]] = {}

    def save(self, phone: str, code: str, expires_at: datetime) -> None:
        self._data[phone] = (code, expires_at)

    def get(self, phone: str) -> Optional[tuple[str, datetime]]:
        return self._data.get(phone)


class InMemoryUserRepo:
    """极简 User 仓储实现，仅用于本仓库内的开发与单测。"""

    def __init__(self) -> None:
        self._by_phone: Dict[str, User] = {}

    def find_by_phone(self, phone: str) -> Optional[User]:
        return self._by_phone.get(phone)

    def save(self, user: User) -> User:
        user.updated_at = datetime.now(UTC)
        self._by_phone[user.phone] = user
        return user

    def all(self) -> Dict[str, User]:
        return dict(self._by_phone)


class InMemorySessionStore:
    """极简 Session 存储实现，仅用于单元测试。"""

    def __init__(self) -> None:
        self._by_guid: Dict[str, Session] = {}

    def put(self, session: Session) -> None:
        self._by_guid[session.guid] = session

    def get(self, guid: str) -> Optional[Session]:
        return self._by_guid.get(guid)

    def delete(self, guid: str) -> None:
        self._by_guid.pop(guid, None)

    def items(self):
        return self._by_guid.items()


@dataclass
class LoginLog:
    """登录活跃记录，PoC 级实现，对应 DM-04 的子集字段。"""

    guid: str
    phone: str
    login_at: datetime
    logout_at: Optional[datetime] = None
    channel: str = "pc"
    ip: Optional[str] = None
    success: bool = True
    error_code: Optional[str] = None


class InMemoryLoginLogRepo:
    """极简 LoginLog 仓储，仅用于后台活跃表 PoC 与单测。"""

    def __init__(self) -> None:
        self._logs: list[LoginLog] = []

    def append(self, log: LoginLog) -> None:
        self._logs.append(log)

    def all(self) -> list[LoginLog]:
        return list(self._logs)

    def query(
        self,
        phone: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        channel: Optional[str] = None,
    ) -> list[LoginLog]:
        rows = self._logs
        if phone is not None:
            rows = [r for r in rows if r.phone == phone]
        if start is not None:
            rows = [r for r in rows if r.login_at >= start]
        if end is not None:
            rows = [r for r in rows if r.login_at <= end]
        if channel is not None:
            rows = [r for r in rows if r.channel == channel]
        return sorted(rows, key=lambda r: r.login_at)


REFRESH_TOKEN_TTL_DAYS = 2
ACCESS_TOKEN_TTL_HOURS = 4


def now_utc() -> datetime:
    return datetime.now(UTC)


def calc_refresh_expires(now: Optional[datetime] = None) -> datetime:
    return (now or now_utc()) + timedelta(days=REFRESH_TOKEN_TTL_DAYS)


def calc_access_expires(now: Optional[datetime] = None) -> datetime:
    return (now or now_utc()) + timedelta(hours=ACCESS_TOKEN_TTL_HOURS)
