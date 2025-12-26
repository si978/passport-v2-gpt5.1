"""
Passport Windows 客户端（GUI，支持启动自动 SSO）

用于打包成两个独立 EXE：
- Client A：app_id=jiuweihu（手机号登录写入 session.dat；启动自动用 refresh_token 恢复会话）
- Client B：app_id=youlishe（启动读取 session.dat 并用 refresh_token 完成 SSO 登录）

依赖：
- `shell.session_file_manager.SessionFileManager`：session.dat 读写
- `shell.dpapi_adapter`：可选 DPAPI 加解密（写入为 base64 字符串；读取兼容明文）
"""

from __future__ import annotations

import os
import re
import sys
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import requests
import tkinter as tk
from tkinter import ttk, messagebox


UTC = timezone.utc
PHONE_RE = re.compile(r"^1[3-9][0-9]{9}$")
TWO_HOURS = timedelta(hours=2)


def _ensure_dev_on_syspath() -> None:
    here = os.path.abspath(os.path.dirname(__file__))
    dev_root = os.path.abspath(os.path.join(here, ".."))
    if dev_root not in sys.path:
        sys.path.insert(0, dev_root)


def _import_shell_modules():
    _ensure_dev_on_syspath()
    from shell.session_file_manager import SessionFileManager, default_session_path  # type: ignore
    from shell.dpapi_adapter import protect, unprotect  # type: ignore

    return SessionFileManager, default_session_path, protect, unprotect


SessionFileManager, default_session_path, dpapi_protect, dpapi_unprotect = _import_shell_modules()


def _import_client_config():
    _ensure_dev_on_syspath()
    from shell.client_config import default_config_path, load_config, save_config  # type: ignore

    return default_config_path, load_config, save_config


default_config_path, load_client_config, save_client_config = _import_client_config()


def now_utc() -> datetime:
    return datetime.now(UTC)


def now_iso() -> str:
    return now_utc().isoformat()


def parse_iso_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(UTC)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), UTC)
    if not isinstance(value, str):
        raise ValueError("invalid datetime")
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(UTC)


def ensure_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if not u:
        return ""
    return u if u.endswith("/api") else f"{u}/api"


def normalize_session_path(path: str) -> str:
    p = (path or "").strip()
    return p if p else default_session_path()


def mask_token(token: Optional[str]) -> str:
    if not token:
        return ""
    s = str(token)
    if len(s) <= 18:
        return s
    return f"{s[:12]}...{s[-4:]}"


@dataclass
class HttpResult:
    ok: bool
    status_code: int
    data: Any = None
    error: Optional[str] = None
    error_code: Optional[str] = None


class PassportClient:
    def __init__(self, base_api: str, timeout_sec: int = 10) -> None:
        self.base_api = ensure_api_base(base_api)
        self.timeout_sec = timeout_sec

    def _post(self, path: str, payload: Dict[str, Any]) -> HttpResult:
        if not self.base_api:
            return HttpResult(False, 0, error="Base URL 为空")
        url = f"{self.base_api}{path}"
        try:
            resp = requests.post(url, json=payload, timeout=self.timeout_sec)
            data = None
            if resp.content:
                try:
                    data = resp.json()
                except Exception:
                    data = resp.text
            if resp.status_code >= 400:
                code = None
                if isinstance(data, dict):
                    code = data.get("error_code") or data.get("code")
                err = f"HTTP {resp.status_code}"
                if code:
                    err += f" ({code})"
                return HttpResult(False, resp.status_code, data=data, error=err, error_code=code)
            return HttpResult(True, resp.status_code, data=data)
        except Exception as exc:  # noqa: BLE001
            return HttpResult(False, 0, error=str(exc))

    def send_code(self, phone: str) -> HttpResult:
        return self._post("/passport/send-code", {"phone": phone})

    def login_by_phone(self, phone: str, code: str, app_id: str) -> HttpResult:
        return self._post("/passport/login-by-phone", {"phone": phone, "code": code, "app_id": app_id})

    def refresh_token(self, guid: str, refresh_token: str, app_id: str) -> HttpResult:
        return self._post("/passport/refresh-token", {"guid": guid, "refresh_token": refresh_token, "app_id": app_id})

    def verify_token(self, access_token: str, app_id: str) -> HttpResult:
        return self._post("/passport/verify-token", {"access_token": access_token, "app_id": app_id})

    def logout(self, access_token: Optional[str]) -> HttpResult:
        payload: Dict[str, Any] = {}
        if access_token:
            payload["access_token"] = access_token
        return self._post("/passport/logout", payload)


class SessionStore:
    def __init__(self, path: str, use_dpapi: bool) -> None:
        self.path = normalize_session_path(path)
        self.use_dpapi = use_dpapi

    def _manager(self) -> Any:
        if self.use_dpapi:
            return SessionFileManager(path=self.path, encoder=dpapi_protect, decoder=dpapi_unprotect)
        return SessionFileManager(path=self.path, encoder=None, decoder=None)

    def read(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        mgr = self._manager()
        try:
            return mgr.read(), None
        except FileNotFoundError:
            return None, "session 文件不存在或已过期被清理"
        except Exception as exc:  # noqa: BLE001
            return None, f"读取 session 失败：{exc}"

    def write(self, payload: Dict[str, Any]) -> Optional[str]:
        mgr = self._manager()
        try:
            mgr.write(payload)
            return None
        except Exception as exc:  # noqa: BLE001
            return f"写入 session 失败：{exc}"

    def delete(self) -> Optional[str]:
        mgr = self._manager()
        try:
            mgr.delete()
            return None
        except Exception as exc:  # noqa: BLE001
            return f"删除 session 失败：{exc}"


def validate_local_session(struct: Dict[str, Any], now: datetime) -> Tuple[bool, str]:
    # 与 native.local_session.LocalSessionValidator 对齐的最小校验：
    # - 必填字段存在且时间可解析
    # - expires_at >= created_at
    # - now <= expires_at（refresh 生命周期外视为损坏）
    # - now - created_at <= 2h，否则本地 SSO 失效
    required = {"guid", "phone", "created_at", "expires_at", "refresh_token"}
    if not required.issubset(struct.keys()):
        return False, "session 字段缺失"

    try:
        created_at = parse_iso_dt(struct.get("created_at"))
        expires_at = parse_iso_dt(struct.get("expires_at"))
    except Exception:  # noqa: BLE001
        return False, "session 时间字段非法"

    if expires_at < created_at:
        return False, "session 时间范围非法"

    if now > expires_at:
        return False, "session 已过期（refresh 失效）"

    if now - created_at > TWO_HOURS:
        return False, "session 超过 2 小时阈值（本地 SSO 失效）"

    return True, "ok"


class PassportClientGui(tk.Tk):
    def __init__(self, *, app_id: str, title: str, allow_phone_login: bool = True) -> None:
        super().__init__()
        self.fixed_app_id = app_id
        self.allow_phone_login = allow_phone_login

        self.title(title)
        self.geometry("860x640")

        self.config_path = (os.environ.get("PASSPORT_CLIENT_CONFIG") or "").strip() or default_config_path()
        cfg = load_client_config(self.config_path)

        cfg_base_url = cfg.get("base_url") if isinstance(cfg.get("base_url"), str) else ""
        cfg_session_path = cfg.get("session_path") if isinstance(cfg.get("session_path"), str) else ""
        cfg_use_dpapi = cfg.get("use_dpapi") if isinstance(cfg.get("use_dpapi"), bool) else None
        cfg_watch_session = cfg.get("watch_session") if isinstance(cfg.get("watch_session"), bool) else None

        base_url_default = os.environ.get("PASSPORT_BASE_URL") or cfg_base_url or "http://127.0.0.1:8080"
        session_default = os.environ.get("PASSPORT_SESSION_PATH") or cfg_session_path or normalize_session_path("")

        if "PASSPORT_USE_DPAPI" in os.environ:
            use_dpapi_default = os.environ.get("PASSPORT_USE_DPAPI", "1") != "0"
        else:
            use_dpapi_default = True if cfg_use_dpapi is None else bool(cfg_use_dpapi)

        if "PASSPORT_WATCH_SESSION" in os.environ:
            watch_session_default = os.environ.get("PASSPORT_WATCH_SESSION", "1") != "0"
        else:
            watch_session_default = True if cfg_watch_session is None else bool(cfg_watch_session)

        self.base_url = tk.StringVar(value=base_url_default)
        self.session_path = tk.StringVar(value=session_default)
        self.use_dpapi = tk.BooleanVar(value=use_dpapi_default)
        self.watch_session = tk.BooleanVar(value=watch_session_default)

        self.phone = tk.StringVar(value=os.environ.get("TEST_PHONE", ""))
        self.code = tk.StringVar(value=os.environ.get("TEST_CODE", ""))

        self.status = tk.StringVar(value="启动中…")
        self.current_guid = tk.StringVar(value="")
        self.current_access_token = ""
        self.current_access_expires_at = tk.StringVar(value="")
        self.current_refresh_expires_at = tk.StringVar(value="")

        self.output = tk.Text(self, height=16, wrap="word")

        self._auto_login_inflight = False
        self._auto_login_pending = False
        self._last_session_path: Optional[str] = None
        self._last_session_mtime: Optional[float] = None
        self._closing = False

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # 启动自动登录（SSO）
        self.after(200, self.auto_startup_login)
        # 监听 session.dat 变化：任一端写入/删除都会触发本端刷新（双向 SSO）
        self.after(1200, self._poll_session_changes)

    # --- UI helpers ---
    def _append(self, line: str) -> None:
        self.output.insert("end", line + "\n")
        self.output.see("end")

    def _set_status(self, s: str) -> None:
        self.status.set(s)

    def _client(self) -> PassportClient:
        return PassportClient(self.base_url.get())

    def _store(self) -> SessionStore:
        return SessionStore(self.session_path.get(), self.use_dpapi.get())

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=12)
        root.pack(fill="both", expand=True)

        cfg = ttk.LabelFrame(root, text="运行配置", padding=10)
        cfg.pack(fill="x")

        ttk.Label(cfg, text="后端地址（自动补 /api）：").grid(row=0, column=0, sticky="w")
        ttk.Entry(cfg, textvariable=self.base_url, width=60).grid(row=0, column=1, sticky="we", padx=6)

        ttk.Label(cfg, text="session.dat：").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(cfg, textvariable=self.session_path, width=60).grid(row=1, column=1, sticky="we", padx=6, pady=(8, 0))

        ttk.Checkbutton(cfg, text="使用 DPAPI 加密（推荐）", variable=self.use_dpapi).grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Button(cfg, text="保存配置", command=lambda: self.save_config(silent=False)).grid(
            row=2, column=2, sticky="e", padx=(8, 0), pady=(8, 0)
        )
        ttk.Checkbutton(cfg, text="自动同步（监听 session.dat）", variable=self.watch_session).grid(
            row=3, column=1, sticky="w", pady=(8, 0)
        )
        cfg.columnconfigure(1, weight=1)

        top = ttk.LabelFrame(root, text=f"自动登录（app_id={self.fixed_app_id}）", padding=10)
        top.pack(fill="x", pady=(12, 0))

        ttk.Label(top, text="状态：").grid(row=0, column=0, sticky="w")
        ttk.Label(top, textvariable=self.status).grid(row=0, column=1, sticky="w")

        ttk.Label(top, text="GUID：").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Label(top, textvariable=self.current_guid).grid(row=1, column=1, sticky="w", pady=(8, 0))

        ttk.Label(top, text="Access Expires：").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Label(top, textvariable=self.current_access_expires_at).grid(row=2, column=1, sticky="w", pady=(8, 0))

        ttk.Label(top, text="Refresh Expires：").grid(row=3, column=0, sticky="w", pady=(8, 0))
        ttk.Label(top, textvariable=self.current_refresh_expires_at).grid(row=3, column=1, sticky="w", pady=(8, 0))

        btns = ttk.Frame(top)
        btns.grid(row=0, column=2, rowspan=4, padx=(12, 0))
        ttk.Button(btns, text="重新尝试自动登录", command=self.auto_startup_login).pack(fill="x")
        ttk.Button(btns, text="退出登录（全局）", command=self.logout_and_clear).pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="打开星币商城", command=self.open_star_coins).pack(fill="x", pady=(8, 0))

        if self.allow_phone_login:
            login = ttk.LabelFrame(root, text="手机号登录（写入 session.dat）", padding=10)
            login.pack(fill="x", pady=(12, 0))

            ttk.Label(login, text="手机号：").grid(row=0, column=0, sticky="w")
            ttk.Entry(login, textvariable=self.phone, width=24).grid(row=0, column=1, sticky="w", padx=6)

            ttk.Label(login, text="验证码：").grid(row=1, column=0, sticky="w", pady=(8, 0))
            ttk.Entry(login, textvariable=self.code, width=24).grid(row=1, column=1, sticky="w", padx=6, pady=(8, 0))

            ttk.Button(login, text="发送验证码（真实短信）", command=self.on_send_code).grid(row=0, column=2, sticky="we")
            ttk.Button(login, text="登录并写入 session.dat", command=self.on_login_and_write).grid(row=1, column=2, sticky="we", pady=(8, 0))

            login.columnconfigure(2, weight=1)

        out_box = ttk.LabelFrame(root, text="输出", padding=10)
        out_box.pack(fill="both", expand=True, pady=(12, 0))

        self.output.pack(in_=out_box, fill="both", expand=True)
        ttk.Button(out_box, text="清空输出", command=lambda: self._clear_output()).pack(anchor="e", pady=(8, 0))

    def _clear_output(self) -> None:
        self.output.delete("1.0", "end")

    def _reset_current_session(self) -> None:
        self.current_guid.set("")
        self.current_access_token = ""
        self.current_access_expires_at.set("")
        self.current_refresh_expires_at.set("")

    def _queue_auto_login(self, reason: str) -> None:
        if self._auto_login_inflight:
            self._auto_login_pending = True
            self._append(f"{reason} -> auto-login queued")
            return
        self._append(f"{reason} -> auto-login start")
        self.auto_startup_login()

    def _poll_session_changes(self) -> None:
        try:
            if not self.watch_session.get():
                return

            path = normalize_session_path(self.session_path.get())
            if path != self._last_session_path:
                self._last_session_path = path
                self._last_session_mtime = None

            try:
                stat = os.stat(path)
            except FileNotFoundError:
                if self._last_session_mtime is not None:
                    self._last_session_mtime = None
                    self._reset_current_session()
                    self._append("[watch] session removed -> local cleared")
                    self._set_status("无可用 session（请登录）")
                return
            except Exception as exc:  # noqa: BLE001
                self._append(f"[watch] stat failed: {exc}")
                return

            mtime = float(stat.st_mtime)
            if self._last_session_mtime is None:
                self._last_session_mtime = mtime
                if not self.current_access_token:
                    self._queue_auto_login("[watch] session found")
                return

            if abs(mtime - self._last_session_mtime) > 1e-6:
                self._last_session_mtime = mtime
                self._queue_auto_login("[watch] session changed")
        finally:
            if self._closing:
                return
            try:
                self.after(1500, self._poll_session_changes)
            except tk.TclError:  # pragma: no cover
                return

    def _on_close(self) -> None:
        self._closing = True
        try:
            self.save_config(silent=True)
        finally:
            self.destroy()

    def save_config(self, *, silent: bool = False) -> None:
        payload = {
            "base_url": (self.base_url.get() or "").strip(),
            "session_path": normalize_session_path(self.session_path.get()),
            "use_dpapi": bool(self.use_dpapi.get()),
            "watch_session": bool(self.watch_session.get()),
        }
        try:
            save_client_config(self.config_path, payload)
            if not silent:
                self._append(f"[config.save] ok path={self.config_path}")
                messagebox.showinfo("已保存", f"配置已保存：{self.config_path}")
        except Exception as exc:  # noqa: BLE001
            if not silent:
                self._append(f"[config.save] ok=false path={self.config_path} err={exc}")
                messagebox.showerror("保存失败", str(exc))

    # --- Async runner ---
    def _run_async(self, fn, on_done=None) -> None:
        def runner():
            try:
                res = fn()
                if on_done:
                    try:
                        self.after(0, lambda: on_done(res, None))
                    except tk.TclError:  # pragma: no cover
                        return
            except Exception as exc:  # noqa: BLE001
                if on_done:
                    try:
                        self.after(0, lambda: on_done(None, exc))
                    except tk.TclError:  # pragma: no cover
                        return

        threading.Thread(target=runner, daemon=True).start()

    # --- Actions ---
    def auto_startup_login(self) -> None:
        if self._auto_login_inflight:
            self._auto_login_pending = True
            self._append("[auto] already running -> queued")
            return

        self._auto_login_inflight = True
        self._set_status("检查本地 session…")

        def work():
            store = self._store()
            sess, err = store.read()
            if err or not sess:
                return ("none", err or "empty", None)

            ok, reason = validate_local_session(sess, now_utc())
            if not ok:
                store.delete()
                return ("invalid", reason, None)

            guid = str(sess.get("guid") or "").strip()
            rt = str(sess.get("refresh_token") or "").strip()
            if not guid or not rt:
                store.delete()
                return ("invalid", "session 缺少 guid/refresh_token", None)

            client = self._client()
            res = client.refresh_token(guid, rt, self.fixed_app_id)
            return ("refresh", res, sess)

        def done(result, exc):
            try:
                if exc:
                    self._append(f"[auto] exception: {exc}")
                    self._reset_current_session()
                    self._set_status("自动登录失败（异常）")
                    return
                if not result:
                    self._reset_current_session()
                    self._set_status("自动登录失败（无结果）")
                    return

                kind, payload, _sess = result
                if kind == "none":
                    self._append(f"[auto] session none: {payload}")
                    self._reset_current_session()
                    self._set_status("无可用 session（请登录）")
                    return
                if kind == "invalid":
                    self._append(f"[auto] session invalid: {payload}（已清理本地文件）")
                    self._reset_current_session()
                    self._set_status("session 无效/过期（请重新登录）")
                    return

                res: HttpResult = payload
                self._append(
                    f"[refresh-token] app_id={self.fixed_app_id} ok={res.ok} status={res.status_code} err={res.error or ''}"
                )

                if not res.ok:
                    # 会话失效类错误：清理本地文件，避免反复失败
                    if res.error_code in ("ERR_SESSION_NOT_FOUND", "ERR_REFRESH_EXPIRED", "ERR_REFRESH_MISMATCH"):
                        self._store().delete()
                        self._append("[auto] server session invalid -> local session cleared")
                    self._reset_current_session()
                    self._set_status("自动登录失败（请登录）")
                    return

                if not isinstance(res.data, dict):
                    self._reset_current_session()
                    self._set_status("自动登录失败（响应异常）")
                    return

                data = res.data
                guid = str(data.get("guid") or "")
                access_token = str(data.get("access_token") or "")
                at_exp = str(data.get("access_token_expires_at") or "")
                rt_exp = str(data.get("refresh_token_expires_at") or "")

                self.current_guid.set(guid)
                self.current_access_token = access_token
                self.current_access_expires_at.set(at_exp)
                self.current_refresh_expires_at.set(rt_exp)

                self._append(f"  access_token={mask_token(access_token)} expires_at={at_exp}")

                v = (
                    self._client().verify_token(access_token, self.fixed_app_id)
                    if access_token
                    else HttpResult(False, 0, error="missing access_token")
                )
                self._append(f"[verify-token] ok={v.ok} status={v.status_code} err={v.error or ''}")
                if v.ok and isinstance(v.data, dict):
                    self._append(
                        f"  verified: guid={v.data.get('guid')} app_id={v.data.get('app_id')} expires_at={v.data.get('expires_at')}"
                    )

                self._set_status("自动登录成功")
            finally:
                self._auto_login_inflight = False
                if self._auto_login_pending:
                    self._auto_login_pending = False
                    if not self._closing:
                        try:
                            self.after(200, self.auto_startup_login)
                        except tk.TclError:  # pragma: no cover
                            return

        self._run_async(work, done)

    def on_send_code(self) -> None:
        phone = (self.phone.get() or "").strip()
        if not PHONE_RE.match(phone):
            messagebox.showerror("参数错误", "手机号格式不正确")
            return

        self._set_status("发送验证码…")

        def work():
            return self._client().send_code(phone)

        def done(res: Optional[HttpResult], exc: Optional[Exception]):
            if exc or not res:
                self._append(f"[send-code] exception: {exc}")
                self._set_status("发送失败")
                messagebox.showerror("发送失败", str(exc) if exc else "发送失败")
                return
            self._append(f"[send-code] phone={phone} ok={res.ok} status={res.status_code} err={res.error or ''}")
            if not res.ok:
                self._set_status("发送失败")
                messagebox.showerror("发送失败", res.error or "发送失败")
                return
            self._set_status("验证码已发送")
            messagebox.showinfo("已发送", "验证码已发送（请查看手机短信）")

        self._run_async(work, done)

    def on_login_and_write(self) -> None:
        phone = (self.phone.get() or "").strip()
        code = (self.code.get() or "").strip()
        if not PHONE_RE.match(phone):
            messagebox.showerror("参数错误", "手机号格式不正确")
            return
        if not re.match(r"^[0-9]{6}$", code):
            messagebox.showerror("参数错误", "请输入 6 位数字验证码")
            return

        self._set_status("登录中…")

        def work():
            return self._client().login_by_phone(phone, code, self.fixed_app_id)

        def done(res: Optional[HttpResult], exc: Optional[Exception]):
            if exc or not res:
                self._append(f"[login] exception: {exc}")
                self._set_status("登录失败")
                messagebox.showerror("登录失败", str(exc) if exc else "登录失败")
                return

            self._append(f"[login] app_id={self.fixed_app_id} ok={res.ok} status={res.status_code} err={res.error or ''}")
            if not res.ok or not isinstance(res.data, dict):
                self._set_status("登录失败")
                messagebox.showerror("登录失败", res.error or "登录失败")
                return

            data = res.data
            guid = str(data.get("guid") or "").strip()
            refresh_token = str(data.get("refresh_token") or "").strip()
            refresh_expires_at = str(data.get("refresh_token_expires_at") or "").strip()
            user_type = str(data.get("user_type") or "user")

            if not guid or not refresh_token or not refresh_expires_at:
                self._set_status("登录失败（响应异常）")
                messagebox.showerror("响应异常", "后端响应缺少 guid/refresh_token/refresh_token_expires_at")
                return

            payload = {
                "guid": guid,
                "phone": phone,
                "user_type": user_type,
                "refresh_token": refresh_token,
                "created_at": now_iso(),
                "expires_at": refresh_expires_at,
            }
            err = self._store().write(payload)
            if err:
                self._append(f"[session.write] err={err}")
                self._set_status("写入失败")
                messagebox.showerror("写入失败", err)
                return

            self._append(f"[session.write] ok path={normalize_session_path(self.session_path.get())} guid={guid}")
            self._append(f"  refresh_token={mask_token(refresh_token)} expires_at={refresh_expires_at}")

            # 登录成功后立即刷新一次，拿到当前 app 的 access_token（不更新 session.dat）
            self.after(100, self.auto_startup_login)
            self._set_status("登录成功（已写入 session.dat）")
            messagebox.showinfo("成功", "登录成功，已写入 session.dat；将自动尝试登录")

        self._run_async(work, done)

    def logout_and_clear(self) -> None:
        if not self.current_access_token:
            # 即使没 token，也清本地，保持幂等
            self._store().delete()
            self.current_guid.set("")
            self.current_access_token = ""
            self.current_access_expires_at.set("")
            self.current_refresh_expires_at.set("")
            self._set_status("已清理本地 session")
            self._append("[logout] no access_token, local session cleared")
            return

        self._set_status("退出中…")

        def work():
            return self._client().logout(self.current_access_token)

        def done(res: Optional[HttpResult], exc: Optional[Exception]):
            if exc:
                self._append(f"[logout] exception: {exc}")
            elif res:
                self._append(f"[logout] ok={res.ok} status={res.status_code} err={res.error or ''}")

            # 无论后端成功与否，都清理本地
            self._store().delete()
            self.current_guid.set("")
            self.current_access_token = ""
            self.current_access_expires_at.set("")
            self.current_refresh_expires_at.set("")
            self._set_status("已退出（本地已清理）")
            messagebox.showinfo("已退出", "已退出登录（本地 session.dat 已清理）")

        self._run_async(work, done)

    def open_star_coins(self) -> None:
        """打开星币商城 H5 页面（WebView）"""
        if not self.current_access_token:
            messagebox.showwarning("未登录", "请先登录后再打开星币商城")
            return

        star_coins_base = os.environ.get("STAR_COINS_URL", "http://localhost/user/tasks")
        url = f"{star_coins_base}?access_token={self.current_access_token}"
        
        self._append(f"[star-coins] opening: {url}")
        
        # JS API 供 Web 端调用
        gui_self = self
        class StarCoinsApi:
            def minimize(self):
                pass  # WebView 内不支持最小化主窗口
            
            def close(self):
                pass  # 关闭由 WebView 自身处理
            
            def logout(self):
                """退出登录（兼容旧版）"""
                gui_self.after(0, gui_self.logout_and_clear)
            
            def saveSession(self, data: dict):
                """保存 session（Web 端登录成功后调用）"""
                try:
                    guid = data.get("guid", "")
                    phone = data.get("phone", "")
                    refresh_token = data.get("refreshToken", "")
                    expires_at = data.get("expiresAt", "")
                    
                    if not guid or not refresh_token:
                        gui_self._append("[saveSession] Missing guid or refreshToken")
                        return
                    
                    payload = {
                        "guid": guid,
                        "phone": phone,
                        "user_type": "user",
                        "refresh_token": refresh_token,
                        "created_at": now_iso(),
                        "expires_at": expires_at,
                    }
                    gui_self._store().write(payload)
                    gui_self._append(f"[saveSession] Session saved for {phone}")
                    # 刷新主窗口状态
                    gui_self.after(100, gui_self.auto_startup_login)
                except Exception as e:
                    gui_self._append(f"[saveSession] Error: {e}")
            
            def clearSession(self):
                """删除 session（Web 端退出登录后调用）"""
                gui_self.after(0, gui_self.logout_and_clear)
        
        # 使用 webview 在端内展示
        try:
            import webview
            self._append("[star-coins] using pywebview")
            
            def start_webview():
                try:
                    webview.create_window(
                        '游利社星币商城',
                        url,
                        width=1000,
                        height=750,
                        resizable=True,
                        frameless=True,
                        min_size=(800, 600),
                        js_api=StarCoinsApi(),
                    )
                    webview.start(private_mode=False)
                except Exception as e:
                    self.after(0, lambda: self._append(f"[star-coins] webview error: {e}"))
                    self.after(0, lambda: self._fallback_browser(url))
            
            threading.Thread(target=start_webview, daemon=True).start()
        except ImportError:
            self._append("[star-coins] pywebview not installed, using browser")
            self._fallback_browser(url)
    
    def _fallback_browser(self, url: str) -> None:
        """使用浏览器打开"""
        import webbrowser
        webbrowser.open(url)
        self._append("[star-coins] opened in browser")


def run_client(*, app_id: str, title: str, allow_phone_login: bool = True) -> int:
    app = PassportClientGui(app_id=app_id, title=title, allow_phone_login=allow_phone_login)
    app.mainloop()
    return 0
