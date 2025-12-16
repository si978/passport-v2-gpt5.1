from __future__ import annotations

import random
import re
import secrets
import string
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from .domain import (
    AppSession,
    AuthError,
    ERR_APP_ID_MISMATCH,
    ERR_CODE_EXPIRED,
    ERR_CODE_INVALID,
    ERR_PHONE_INVALID,
    ERR_REFRESH_EXPIRED,
    ERR_REFRESH_MISMATCH,
    ERR_USER_BANNED,
    InMemoryLoginLogRepo,
    InMemorySessionStore,
    InMemoryUserRepo,
    LoginLog,
    Session,
    User,
    UserStatus,
    VerificationCodeStore,
    calc_access_expires,
    calc_refresh_expires,
    now_utc,
)


PHONE_REGEX = re.compile(r"^1[3-9][0-9]{9}$")


class GuidGenerator:
    """GUID 生成器，对应 BR-01。这里使用当前日期 + user_type + 随机数的简化实现。"""

    @staticmethod
    def generate(user_type: int, now: Optional[datetime] = None) -> str:
        now = now or now_utc()
        date_part = now.strftime("%Y%m%d")  # 8 位日期
        type_part = f"{user_type:02d}"      # 2 位用户类型
        rand_part = "".join(random.choices(string.digits, k=10))
        return f"{date_part}{type_part}{rand_part}"


class VerificationCodeService:
    """验证码服务（BR-09）。当前仅实现验证逻辑，发送逻辑后续在验证码迭代补充。"""

    def __init__(self, store: VerificationCodeStore) -> None:
        self._store = store

    def validate_code(self, phone: str, code: str, now: Optional[datetime] = None) -> None:
        now = now or now_utc()
        record = self._store.get(phone)
        if record is None:
            raise AuthError(ERR_PHONE_INVALID, "no code for phone")
        saved_code, expires_at = record
        if now >= expires_at:
            raise AuthError(ERR_CODE_EXPIRED, "code expired")
        if code != saved_code:
            raise AuthError(ERR_CODE_INVALID, "code mismatch")


@dataclass
class LoginResult:
    guid: str
    access_token: str
    refresh_token: str
    user_status: UserStatus
    account_source: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime


class AuthService:
    """手机号登录/注册主流程（FL-01，BR-02）。"""

    def __init__(
        self,
        user_repo: InMemoryUserRepo,
        session_store: InMemorySessionStore,
        vc_service: VerificationCodeService,
        guid_gen: GuidGenerator,
    ) -> None:
        self._users = user_repo
        self._sessions = session_store
        self._vc = vc_service
        self._guid_gen = guid_gen

    def _validate_phone(self, phone: str) -> None:
        if not PHONE_REGEX.match(phone):
            raise AuthError(ERR_PHONE_INVALID, "invalid phone format")

    def login_with_phone(self, phone: str, code: str, app_id: str) -> LoginResult:
        self._validate_phone(phone)
        # 验证验证码（BR-09）
        self._vc.validate_code(phone, code)

        now = now_utc()
        user = self._users.find_by_phone(phone)

        if user is None:
            # 新用户注册（BR-02 + BR-01）
            guid = self._guid_gen.generate(user_type=1, now=now)
            user = User(guid=guid, phone=phone)
            self._users.save(user)
        elif user.status == UserStatus.BANNED:
            # 封禁用户不得登录（BR-08）
            raise AuthError(ERR_USER_BANNED, "user banned")
        elif user.status == UserStatus.DELETED:
            # 注销用户视为新用户（C-01）
            guid = self._guid_gen.generate(user_type=user.user_type, now=now)
            user = User(guid=guid, phone=phone, user_type=user.user_type, account_source=user.account_source)
            self._users.save(user)

        # 创建/更新会话（BR-03/BR-07）
        refresh_token = self._generate_token(prefix="R")
        access_token = self._generate_token(prefix="A")
        rt_exp = calc_refresh_expires(now)
        at_exp = calc_access_expires(now)

        app_session = AppSession(
            access_token=access_token,
            access_token_expires_at=at_exp,
            last_active_at=now,
        )
        session = Session(
            guid=user.guid,
            refresh_token=refresh_token,
            refresh_token_expires_at=rt_exp,
            apps={app_id: app_session},
        )
        self._sessions.put(session)

        return LoginResult(
            guid=user.guid,
            access_token=access_token,
            refresh_token=refresh_token,
            user_status=user.status,
            account_source=user.account_source,
            access_token_expires_at=at_exp,
            refresh_token_expires_at=rt_exp,
        )

    @staticmethod
    def _generate_token(prefix: str) -> str:
        rand = secrets.token_hex(16)
        return f"{prefix}.{rand}"


class TokenService:
    """Token 刷新服务（FL-02 / BR-03/04）。

    支持多 app_id 子会话结构：同一 GUID 在不同 app 上可以拥有各自的 Access Token，
    用于 SSO 场景下的多客户端共享 Refresh Token。
    """

    def __init__(self, session_store: InMemorySessionStore) -> None:
        self._sessions = session_store

    def refresh_access_token(self, guid: str, refresh_token: str, app_id: str) -> LoginResult:
        now = now_utc()
        session = self._sessions.get(guid)
        if session is None or not session.is_refresh_valid(now):
            raise AuthError(ERR_REFRESH_EXPIRED, "refresh token expired or session missing")
        if session.refresh_token != refresh_token:
            raise AuthError(ERR_REFRESH_MISMATCH, "refresh token mismatch")

        access_token = AuthService._generate_token(prefix="A")
        at_exp = calc_access_expires(now)
        app_session = session.apps.get(app_id)
        if app_session is None:
            app_session = AppSession(access_token=access_token, access_token_expires_at=at_exp, last_active_at=now)
        else:
            app_session.access_token = access_token
            app_session.access_token_expires_at = at_exp
            app_session.last_active_at = now
        session.apps[app_id] = app_session
        self._sessions.put(session)

        # LoginResult 主要用于前端复用数据结构，这里只返回部分字段。
        return LoginResult(
            guid=guid,
            access_token=access_token,
            refresh_token=session.refresh_token,
            user_status=UserStatus.ACTIVE,
            account_source="phone",
            access_token_expires_at=at_exp,
            refresh_token_expires_at=session.refresh_token_expires_at,
        )


class LogoutService:
    """会话销毁服务（FL-05 / US-04 部分）。

    在当前 Python 骨架中，退出仅根据 guid 删除 Session，
    由上层（API/壳层）保证 guid 来源于有效的 Access Token。
    """

    def __init__(self, session_store: InMemorySessionStore) -> None:
        self._sessions = session_store

    def logout(self, guid: str) -> None:
        """按 guid 销毁会话，幂等处理。"""

        self._sessions.delete(guid)


class BanService:
    """封禁服务：更新用户状态并清理会话。"""

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


class UserQueryService:
    """后台用户查询服务 PoC，实现简单的按状态过滤与排序。"""

    def __init__(self, user_repo: InMemoryUserRepo) -> None:
        self._users = user_repo

    def list_users(self, status: Optional[UserStatus] = None) -> list[User]:
        users = list(self._users.all().values())
        if status is not None:
            users = [u for u in users if u.status == status]
        users.sort(key=lambda u: (u.created_at, u.phone))
        return users


class LoginLogService:
    """登录活跃记录服务 PoC，基于 InMemoryLoginLogRepo。"""

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
        """记录用户登出事件。

        策略：从最近到最早遍历日志，找到第一个满足以下条件的记录并补齐 logout_at：
        - guid 相同；
        - 若提供 phone，则 phone 也需匹配；
        - 当前尚未设置 logout_at。
        """

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

    def query_logs(
        self,
        phone: Optional[str] = None,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        channel: Optional[str] = None,
    ) -> list[LoginLog]:
        return self._repo.query(phone=phone, start=start, end=end, channel=channel)
