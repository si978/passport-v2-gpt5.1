from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from .domain import (
    AuthError,
    ERR_ACCESS_EXPIRED,
    ERR_ACCESS_INVALID,
    ERR_APP_ID_MISMATCH,
    InMemorySessionStore,
    now_utc,
)


@dataclass
class ValidationResult:
    guid: str
    app_id: str
    expires_at: datetime


class TokenValidator:
    def __init__(self, session_store: InMemorySessionStore) -> None:
        self._sessions = session_store

    def validate_access_token(self, access_token: str, app_id: str, now: Optional[datetime] = None) -> ValidationResult:
        now = now or now_utc()
        found_session = None
        found_app_id = None

        for guid, session in self._sessions.items():
            for aid, app_session in session.apps.items():
                if app_session.access_token == access_token:
                    found_session = session
                    found_app_id = aid
                    break
            if found_session is not None:
                break

        if found_session is None or found_app_id is None:
            raise AuthError(ERR_ACCESS_INVALID, "access token invalid")

        app_session = found_session.apps[found_app_id]
        if app_session.access_token_expires_at <= now:
            raise AuthError(ERR_ACCESS_EXPIRED, "access token expired")

        if found_app_id != app_id:
            raise AuthError(ERR_APP_ID_MISMATCH, "app id mismatch")

        return ValidationResult(guid=found_session.guid, app_id=found_app_id, expires_at=app_session.access_token_expires_at)
