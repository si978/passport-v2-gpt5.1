"""认证相关应用服务。

本模块以 `dev/backend/services.py` 中的 AuthService/TokenService/LogoutService
为参考实现，目标是：

- 在不改变业务语义和错误码约定的前提下，提供更清晰的用例层接口；
- 显式依赖 `refactor.backend.domain` 中的领域模型与仓储实现；
- 为后续替换持久化实现或接入 HTTP / RPC 层提供稳定契约。
"""

from __future__ import annotations

import re
import secrets
import string
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from refactor.backend.domain import (
    AppSession,
    AuthError,
    ERR_PHONE_INVALID,
    ERR_REFRESH_EXPIRED,
    ERR_REFRESH_MISMATCH,
    InMemorySessionStore,
    InMemoryUserRepo,
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
    """GUID 生成器，对应业务规则 BR-01。

    为保持与现有实现兼容，这里沿用“当前日期 + user_type + 随机数”的简化规则。
    """

    @staticmethod
    def generate(user_type: int, now: Optional[datetime] = None) -> str:
        now = now or now_utc()
        date_part = now.strftime("%Y%m%d")  # 8 位日期
        type_part = f"{user_type:02d}"      # 2 位用户类型
        rand_part = "".join(secrets.choice(string.digits) for _ in range(10))  # 10 位随机数字串
        return f"{date_part}{type_part}{rand_part}"


class VerificationCodeService:
    """验证码服务（BR-09）。

    当前仅实现验证逻辑，发送短信逻辑由上层或其他模块负责。
    """

    def __init__(self, store: VerificationCodeStore) -> None:
        self._store = store

    def validate_code(self, phone: str, code: str, now: Optional[datetime] = None) -> None:
        now = now or now_utc()
        record = self._store.get(phone)
        if record is None:
            raise AuthError(ERR_PHONE_INVALID, "no code for phone")
        saved_code, expires_at = record
        if now >= expires_at:
            from refactor.backend.domain import ERR_CODE_EXPIRED, ERR_CODE_INVALID

            raise AuthError(ERR_CODE_EXPIRED, "code expired")
        if code != saved_code:
            from refactor.backend.domain import ERR_CODE_INVALID

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


class AuthUseCase:
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
        self._vc.validate_code(phone, code)

        now = now_utc()
        user = self._users.find_by_phone(phone)

        if user is None:
            guid = self._guid_gen.generate(user_type=1, now=now)
            user = User(guid=guid, phone=phone)
            self._users.save(user)
        elif user.status == UserStatus.BANNED:
            from refactor.backend.domain import ERR_USER_BANNED

            raise AuthError(ERR_USER_BANNED, "user banned")
        elif user.status == UserStatus.DELETED:
            guid = self._guid_gen.generate(user_type=user.user_type, now=now)
            user = User(guid=guid, phone=phone, user_type=user.user_type, account_source=user.account_source)
            self._users.save(user)

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


class TokenRefreshUseCase:
    """Token 刷新用例（FL-02 / BR-03/04）。

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

        access_token = AuthUseCase._generate_token(prefix="A")
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

        return LoginResult(
            guid=guid,
            access_token=access_token,
            refresh_token=session.refresh_token,
            user_status=UserStatus.ACTIVE,
            account_source="phone",
            access_token_expires_at=at_exp,
            refresh_token_expires_at=session.refresh_token_expires_at,
        )


class LogoutUseCase:
    """会话销毁用例（FL-05 / US-04 部分）。"""

    def __init__(self, session_store: InMemorySessionStore) -> None:
        self._sessions = session_store

    def logout(self, guid: str) -> None:
        self._sessions.delete(guid)


__all__ = [
    "GuidGenerator",
    "VerificationCodeService",
    "LoginResult",
    "AuthUseCase",
    "TokenRefreshUseCase",
    "LogoutUseCase",
]
