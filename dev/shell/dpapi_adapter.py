"""Windows DPAPI 适配（字符串版）。

- Windows 平台：优先使用 DPAPI (CryptProtectData / CryptUnprotectData)，确保持久化的 session 文件
  只能被当前用户解密；
- 非 Windows 或 DPAPI 调用失败：回退为原样字符串（仅用于开发/测试）。

注意：这里的 protect/unprotect 以 **字符串** 形式对外（便于与 SessionFileManager 的 encoder/decoder 对接）。
"""

from __future__ import annotations

import base64
import ctypes
import logging
import os
import sys
from ctypes import wintypes

logger = logging.getLogger(__name__)


def protect(plaintext: str) -> str:
    try:
        if os.name != "nt" or sys.platform.startswith("win") is False:
            return plaintext

        raw = plaintext.encode("utf-8")
        protected = _crypt_protect(raw)
        return base64.b64encode(protected).decode("ascii")
    except Exception as exc:  # noqa: BLE001
        logger.warning("DPAPI protect failed, falling back to plaintext: %s", exc)
        return plaintext


def unprotect(cipher_hex: str) -> str:
    try:
        if os.name != "nt" or sys.platform.startswith("win") is False:
            return cipher_hex

        try:
            cipher = base64.b64decode(cipher_hex.encode("ascii"), validate=True)
        except Exception:
            # 兼容“未加密/旧文件”：直接回退为原文
            return cipher_hex

        raw = _crypt_unprotect(cipher)
        return raw.decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        logger.warning("DPAPI unprotect failed, returning original string: %s", exc)
        return cipher_hex


class _DATA_BLOB(ctypes.Structure):  # type: ignore[misc]
    _fields_ = [
        ("cbData", wintypes.DWORD),
        ("pbData", ctypes.POINTER(ctypes.c_byte)),
    ]


def _crypt_protect(raw: bytes) -> bytes:
    CRYPTPROTECT_UI_FORBIDDEN = 0x1

    crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

    in_buf = ctypes.create_string_buffer(raw)
    in_blob = _DATA_BLOB(len(raw), ctypes.cast(in_buf, ctypes.POINTER(ctypes.c_byte)))
    out_blob = _DATA_BLOB()

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
        raise OSError("CryptProtectData failed")

    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)  # type: ignore[arg-type]


def _crypt_unprotect(cipher: bytes) -> bytes:
    CRYPTPROTECT_UI_FORBIDDEN = 0x1

    crypt32 = ctypes.windll.crypt32  # type: ignore[attr-defined]
    kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]

    in_buf = ctypes.create_string_buffer(cipher)
    in_blob = _DATA_BLOB(len(cipher), ctypes.cast(in_buf, ctypes.POINTER(ctypes.c_byte)))
    out_blob = _DATA_BLOB()

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
        raise OSError("CryptUnprotectData failed")

    try:
        return ctypes.string_at(out_blob.pbData, out_blob.cbData)
    finally:
        kernel32.LocalFree(out_blob.pbData)  # type: ignore[arg-type]


__all__ = ["protect", "unprotect"]
