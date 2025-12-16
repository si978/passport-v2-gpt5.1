"""本地会话文件管理（契约化版）。

- 路径默认：优先 `C:\\ProgramData\\Passport\\session.dat`；若无写入权限则回退到
  `%LOCALAPPDATA%\\Passport\\session.dat`（可通过初始化参数覆盖）。
- 字段校验：guid, phone, user_type, refresh_token, created_at, expires_at 必填；expires_at >= created_at。
- 时间阈值：文件创建时间超过 2 小时视为残留，读取时直接删除并抛 FileNotFoundError（等价“无可用会话”）。
- 兼容现有调用方式：
  - 文件不存在 → FileNotFoundError
  - 解密/解析/校验失败 → ValueError（视为损坏）
"""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

UTC = timezone.utc
TWO_HOURS = timedelta(hours=2)


def _dir_writable(path: str) -> bool:
    try:
        os.makedirs(path, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            dir=path,
            prefix=".passport_write_test_",
            suffix=".tmp",
            delete=True,
        ) as f:
            f.write(b"ok")
            f.flush()
        return True
    except Exception:  # noqa: BLE001
        return False


def default_session_path() -> str:
    program_data = os.environ.get("PROGRAMDATA") or r"C:\ProgramData"
    preferred_dir = os.path.join(program_data, "Passport")
    preferred = os.path.join(preferred_dir, "session.dat")

    local_app_data = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
    fallback_dir = os.path.join(local_app_data, "Passport")
    fallback = os.path.join(fallback_dir, "session.dat")

    return preferred if _dir_writable(preferred_dir) else fallback


class SessionFileManager:
    def __init__(
        self,
        path: Optional[str] = None,
        now_provider=lambda: datetime.now(UTC),
        encoder: Optional[Callable[[str], str]] = None,
        decoder: Optional[Callable[[str], str]] = None,
    ) -> None:
        """
        encoder/decoder：可选的加密/解密钩子，签名 str -> str。
        默认明文保存；可在实际落地时替换为 DPAPI 等实现。
        """

        self.path = path or default_session_path()
        self.now = now_provider
        self.encoder = encoder
        self.decoder = decoder

    # --- Public API ---
    def read(self) -> Dict[str, Any]:
        if not os.path.exists(self.path):
            raise FileNotFoundError(self.path)

        stat = os.stat(self.path)
        # 在部分平台上 utime 仅更新 mtime，st_ctime 不可控；使用 mtime 作为“最近写入时间”来判断残留。
        created_at_fs = datetime.fromtimestamp(stat.st_mtime, UTC)
        if self._is_stale(created_at_fs):
            # 超过 2 小时阈值，视为残留，删除并告知无可用会话
            self.delete()
            raise FileNotFoundError(self.path)

        try:
            with open(self.path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"failed to read session file: {exc}") from exc

        if self.decoder:
            try:
                content = self.decoder(content)
            except Exception as exc:  # noqa: BLE001
                raise ValueError("failed to decode session file") from exc

        try:
            data = json.loads(content)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("session file is not valid JSON") from exc

        self._validate_payload(data)
        return data

    def write(self, payload: Dict[str, Any]) -> None:
        self._validate_payload(payload)
        parent = os.path.dirname(self.path) or "."
        os.makedirs(parent, exist_ok=True)
        content = json.dumps(payload, ensure_ascii=False)
        if self.encoder:
            try:
                content = self.encoder(content)
            except Exception as exc:  # noqa: BLE001
                raise ValueError("failed to encode session file") from exc

        # 原子写入：避免另一个进程读到“被截断的半截 JSON”导致误判损坏。
        tmp_fd, tmp_path = tempfile.mkstemp(prefix=".passport_session_", suffix=".tmp", dir=parent)
        try:
            with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_path, self.path)
        finally:
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            except Exception:
                pass

    def delete(self) -> None:
        try:
            os.remove(self.path)
        except FileNotFoundError:
            return

    # --- Internal ---
    def _is_stale(self, created_at_fs: datetime) -> bool:
        return self.now() - created_at_fs > TWO_HOURS

    def _validate_payload(self, data: Dict[str, Any]) -> None:
        required = [
            "guid",
            "phone",
            "user_type",
            "refresh_token",
            "created_at",
            "expires_at",
        ]
        for key in required:
            if key not in data:
                raise ValueError(f"missing field: {key}")

        try:
            created_at = self._parse_ts(data["created_at"])
            expires_at = self._parse_ts(data["expires_at"])
        except Exception as exc:  # noqa: BLE001
            raise ValueError("invalid timestamp fields") from exc

        if expires_at < created_at:
            raise ValueError("expires_at earlier than created_at")

    def _parse_ts(self, value: Any) -> datetime:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(float(value), UTC)
        if isinstance(value, str):
            # 支持 ISO8601
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception as exc:  # noqa: BLE001
                raise ValueError("invalid datetime string") from exc
        raise ValueError("unsupported datetime format")


__all__ = ["SessionFileManager", "default_session_path", "TWO_HOURS"]
