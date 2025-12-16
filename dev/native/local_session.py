from __future__ import annotations

import base64
import json
import os
import ctypes
import logging
from ctypes import wintypes
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Dict, Optional, Union


UTC = timezone.utc


logger = logging.getLogger(__name__)


class ValidationStatus(str, Enum):
    VALID = "VALID"
    CORRUPTED = "CORRUPTED"
    EXPIRED_LOCAL = "EXPIRED_LOCAL"


class LocalSessionCrypto:
    """LocalSession 加解密实现。

    - Windows 平台：优先使用 DPAPI (CryptProtectData / CryptUnprotectData)，确保
      本地会话文件只能被当前用户解密；
    - 其它平台或 DPAPI 调用失败时：退化为 base64 编码/解码，仅用于开发/测试。
    """

    @staticmethod
    def _protect(raw: bytes) -> bytes:
        if os.name != "nt":  # 非 Windows 平台退化为 base64
            return base64.b64encode(raw)

        CRYPTPROTECT_UI_FORBIDDEN = 0x1

        class DATA_BLOB(ctypes.Structure):  # type: ignore[misc]
            _fields_ = [
                ("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

        in_buf = ctypes.create_string_buffer(raw)
        in_blob = DATA_BLOB(len(raw), ctypes.cast(in_buf, ctypes.POINTER(ctypes.c_byte)))
        out_blob = DATA_BLOB()

        res = crypt32.CryptProtectData(  # type: ignore[call-arg]
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
        if not res:
            # DPAPI 调用失败时退化为 base64，并记录警告日志便于定位环境问题。
            logger.warning("DPAPI CryptProtectData failed, falling back to base64 for LocalSession")
            return base64.b64encode(raw)

        try:
            protected = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        finally:
            kernel32.LocalFree(out_blob.pbData)  # type: ignore[arg-type]
        return protected

    @staticmethod
    def _unprotect(cipher: bytes) -> bytes:
        if os.name != "nt":
            return base64.b64decode(cipher)

        CRYPTPROTECT_UI_FORBIDDEN = 0x1

        class DATA_BLOB(ctypes.Structure):  # type: ignore[misc]
            _fields_ = [
                ("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_byte)),
            ]

        crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

        in_buf = ctypes.create_string_buffer(cipher)
        in_blob = DATA_BLOB(len(cipher), ctypes.cast(in_buf, ctypes.POINTER(ctypes.c_byte)))
        out_blob = DATA_BLOB()

        res = crypt32.CryptUnprotectData(  # type: ignore[call-arg]
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            ctypes.byref(out_blob),
        )
        if not res:
            # DPAPI 解密失败或密文格式不合法时尝试按 base64 解码，并记录警告日志。
            logger.warning("DPAPI CryptUnprotectData failed, attempting base64 fallback for LocalSession")
            return base64.b64decode(cipher)

        try:
            raw = ctypes.string_at(out_blob.pbData, out_blob.cbData)
        finally:
            kernel32.LocalFree(out_blob.pbData)  # type: ignore[arg-type]
        return raw

    @staticmethod
    def encrypt(payload: Dict[str, Any]) -> bytes:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        return LocalSessionCrypto._protect(raw)

    @staticmethod
    def decrypt(cipher: bytes) -> Dict[str, Any]:
        try:
            raw = LocalSessionCrypto._unprotect(cipher)
            return json.loads(raw.decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            raise ValueError("failed to decrypt local session") from exc


@dataclass
class LocalSession:
    guid: str
    phone: str
    created_at: datetime
    expires_at: datetime
    refresh_token: str
    # 与 PRD AC-17/DM-03 对齐的补充字段：当前仅作为结构占位，实际填充由壳层/客户端负责。
    user_type: str = "user"
    device_id: Optional[str] = None


class LocalSessionValidator:
    """根据 BR-06/C-03 对 LocalSession 结构与时间进行校验。"""

    # 为兼容历史会话文件，仅将核心时间相关字段设为必选字段；
    # user_type/device_id 若存在会在后续逐步校验，但缺失不会直接视为损坏。
    REQUIRED_FIELDS = {"guid", "phone", "created_at", "expires_at", "refresh_token"}

    def validate(self, struct: Dict[str, Any], now: datetime) -> ValidationStatus:
        if not self.REQUIRED_FIELDS.issubset(struct.keys()):
            return ValidationStatus.CORRUPTED

        try:
            created_at = datetime.fromisoformat(struct["created_at"]).astimezone(UTC)
            expires_at = datetime.fromisoformat(struct["expires_at"]).astimezone(UTC)
        except Exception:  # noqa: BLE001
            return ValidationStatus.CORRUPTED

        if expires_at < created_at:
            return ValidationStatus.CORRUPTED

        if now > expires_at:
            # 超过 Refresh 生命周期，属于“远端也失效”的场景，视为损坏/过期
            return ValidationStatus.CORRUPTED

        # 2 小时阈值逻辑（C-03）：超过 2 小时但未超过 refresh 生命周期时，本地 SSO 失效
        if now - created_at > timedelta(hours=2):
            return ValidationStatus.EXPIRED_LOCAL

        return ValidationStatus.VALID


PathLike = Union[str, "Path"]


def write_session_file(path: PathLike, payload: Dict[str, Any]) -> None:
    cipher = LocalSessionCrypto.encrypt(payload)
    try:
        Path(path).write_bytes(cipher)
    except OSError as exc:  # noqa: PERF203
        # 文件写入失败时记录错误日志，具体处理策略交由调用方决定。
        logger.error("failed to write LocalSession file %s: %s", path, exc)
        raise


def read_session_file(path: PathLike) -> Dict[str, Any]:
    cipher = Path(path).read_bytes()
    return LocalSessionCrypto.decrypt(cipher)


def delete_session_file(path: PathLike) -> None:
    p = Path(path)
    try:
        p.unlink()
    except FileNotFoundError:
        pass

