"""
Passport Windows 壳层验收工具（GUI）

目标：
- 在 EXE 内完成真实短信登录并写入本地 session.dat
- 以“另一个端 app_id”读取同一 session.dat，调用 refresh-token 验证 SSO 可用

说明：
- 默认后端基地址：生产形态 Nginx 反代 `http://127.0.0.1:8080/api`
- 默认 session 文件：优先 `C:\\ProgramData\\Passport\\session.dat`（不可写时回退到 `%LOCALAPPDATA%\\Passport\\session.dat`）
- 可选启用 DPAPI 加密（推荐）
"""

from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

import requests
import tkinter as tk
from tkinter import ttk, messagebox


def _try_import_shell_modules():
    try:
        from shell.session_file_manager import SessionFileManager, default_session_path  # type: ignore
        from shell.dpapi_adapter import protect, unprotect  # type: ignore

        return SessionFileManager, default_session_path, protect, unprotect
    except Exception:
        # 允许从 dev/shell 目录直接运行：把 dev 加入 sys.path
        here = os.path.abspath(os.path.dirname(__file__))
        dev_root = os.path.abspath(os.path.join(here, ".."))
        if dev_root not in sys.path:
            sys.path.insert(0, dev_root)
        from shell.session_file_manager import SessionFileManager, default_session_path  # type: ignore
        from shell.dpapi_adapter import protect, unprotect  # type: ignore

        return SessionFileManager, default_session_path, protect, unprotect


SessionFileManager, default_session_path, dpapi_protect, dpapi_unprotect = _try_import_shell_modules()


def _try_import_client_config():
    try:
        from shell.client_config import default_config_path, load_config, save_config  # type: ignore

        return default_config_path, load_config, save_config
    except Exception:
        # 允许从 dev/shell 目录直接运行：把 dev 加入 sys.path
        here = os.path.abspath(os.path.dirname(__file__))
        dev_root = os.path.abspath(os.path.join(here, ".."))
        if dev_root not in sys.path:
            sys.path.insert(0, dev_root)
        from shell.client_config import default_config_path, load_config, save_config  # type: ignore

        return default_config_path, load_config, save_config


default_config_path, load_client_config, save_client_config = _try_import_client_config()


UTC = timezone.utc
PHONE_RE = re.compile(r"^1[3-9][0-9]{9}$")


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def mask_token(token: Optional[str]) -> str:
    if not token:
        return ""
    s = str(token)
    if len(s) <= 18:
        return s
    return f"{s[:12]}...{s[-4:]}"


def ensure_api_base(url: str) -> str:
    u = (url or "").strip().rstrip("/")
    if not u:
        return ""
    return u if u.endswith("/api") else f"{u}/api"


def normalize_session_path(path: str) -> str:
    p = (path or "").strip()
    return p if p else default_session_path()


@dataclass
class HttpResult:
    ok: bool
    status_code: int
    data: Any = None
    error: Optional[str] = None


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
                return HttpResult(False, resp.status_code, data=data, error=err)
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


class App(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Passport 壳层验收工具（SSO）")
        self.geometry("920x640")

        self.config_path = (os.environ.get("PASSPORT_CLIENT_CONFIG") or "").strip() or default_config_path()
        cfg = load_client_config(self.config_path)

        cfg_base_url = cfg.get("base_url") if isinstance(cfg.get("base_url"), str) else ""
        cfg_session_path = cfg.get("session_path") if isinstance(cfg.get("session_path"), str) else ""
        cfg_use_dpapi = cfg.get("use_dpapi") if isinstance(cfg.get("use_dpapi"), bool) else None

        base_url_default = os.environ.get("PASSPORT_BASE_URL") or cfg_base_url or "http://127.0.0.1:8080"
        session_default = os.environ.get("PASSPORT_SESSION_PATH") or cfg_session_path or normalize_session_path("")

        if "PASSPORT_USE_DPAPI" in os.environ:
            use_dpapi_default = os.environ.get("PASSPORT_USE_DPAPI", "1") != "0"
        else:
            use_dpapi_default = True if cfg_use_dpapi is None else bool(cfg_use_dpapi)

        self.base_url = tk.StringVar(value=base_url_default)
        self.session_path = tk.StringVar(value=session_default)
        self.use_dpapi = tk.BooleanVar(value=use_dpapi_default)

        self.app_id_login = tk.StringVar(value=os.environ.get("PASSPORT_APP_ID", "jiuweihu"))
        self.app_id_other = tk.StringVar(value=os.environ.get("PASSPORT_SSO_APP_ID", "youlishe"))

        self.phone = tk.StringVar(value=os.environ.get("TEST_PHONE", ""))
        self.code = tk.StringVar(value=os.environ.get("TEST_CODE", ""))

        self.output = tk.Text(self, height=18, wrap="word")

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build_ui(self) -> None:
        root = ttk.Frame(self, padding=12)
        root.pack(fill="both", expand=True)

        # 顶部：配置
        cfg = ttk.LabelFrame(root, text="运行配置", padding=10)
        cfg.pack(fill="x")

        ttk.Label(cfg, text="后端地址（会自动补 /api）：").grid(row=0, column=0, sticky="w")
        ttk.Entry(cfg, textvariable=self.base_url, width=60).grid(row=0, column=1, sticky="we", padx=6)

        ttk.Label(cfg, text="session.dat：").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(cfg, textvariable=self.session_path, width=60).grid(row=1, column=1, sticky="we", padx=6, pady=(8, 0))

        ttk.Checkbutton(cfg, text="使用 DPAPI 加密（推荐）", variable=self.use_dpapi).grid(row=2, column=1, sticky="w", pady=(8, 0))
        ttk.Button(cfg, text="保存配置", command=lambda: self.save_config(silent=False)).grid(
            row=2, column=2, sticky="e", padx=(8, 0), pady=(8, 0)
        )

        cfg.columnconfigure(1, weight=1)

        # 中部：两个端
        body = ttk.Frame(root)
        body.pack(fill="both", expand=True, pady=(12, 0))

        left = ttk.LabelFrame(body, text="端 A：登录并写入 session.dat", padding=10)
        left.pack(side="left", fill="both", expand=True, padx=(0, 6))

        right = ttk.LabelFrame(body, text="端 B：读取 session.dat 并验证 SSO", padding=10)
        right.pack(side="left", fill="both", expand=True, padx=(6, 0))

        # 左：登录端
        ttk.Label(left, text="app_id：").grid(row=0, column=0, sticky="w")
        ttk.Entry(left, textvariable=self.app_id_login, width=20).grid(row=0, column=1, sticky="w")

        ttk.Label(left, text="手机号：").grid(row=1, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(left, textvariable=self.phone, width=24).grid(row=1, column=1, sticky="w", pady=(8, 0))

        ttk.Label(left, text="验证码：").grid(row=2, column=0, sticky="w", pady=(8, 0))
        ttk.Entry(left, textvariable=self.code, width=24).grid(row=2, column=1, sticky="w", pady=(8, 0))

        ttk.Button(left, text="发送验证码（真实短信）", command=self.on_send_code).grid(row=3, column=0, columnspan=2, sticky="we", pady=(12, 0))
        ttk.Button(left, text="登录并写入 session.dat", command=self.on_login_and_write).grid(row=4, column=0, columnspan=2, sticky="we", pady=(8, 0))
        ttk.Button(left, text="删除 session.dat", command=self.on_delete_session).grid(row=5, column=0, columnspan=2, sticky="we", pady=(8, 0))

        left.columnconfigure(1, weight=1)

        # 右：SSO 端
        ttk.Label(right, text="app_id：").grid(row=0, column=0, sticky="w")
        ttk.Entry(right, textvariable=self.app_id_other, width=20).grid(row=0, column=1, sticky="w")

        ttk.Button(right, text="读取 session.dat", command=self.on_read_session).grid(row=1, column=0, columnspan=2, sticky="we", pady=(12, 0))
        ttk.Button(right, text="SSO 刷新（refresh-token）", command=self.on_sso_refresh).grid(row=2, column=0, columnspan=2, sticky="we", pady=(8, 0))

        right.columnconfigure(1, weight=1)

        # 底部输出
        out_box = ttk.LabelFrame(root, text="结果输出", padding=10)
        out_box.pack(fill="both", expand=True, pady=(12, 0))

        self.output.pack(in_=out_box, fill="both", expand=True)

        btns = ttk.Frame(out_box)
        btns.pack(fill="x", pady=(8, 0))
        ttk.Button(btns, text="清空输出", command=lambda: self._set_output("")).pack(side="right")

    def _client(self) -> PassportClient:
        return PassportClient(self.base_url.get())

    def _store(self) -> SessionStore:
        return SessionStore(self.session_path.get(), self.use_dpapi.get())

    def _append(self, line: str) -> None:
        self.output.insert("end", line + "\n")
        self.output.see("end")

    def _set_output(self, text: str) -> None:
        self.output.delete("1.0", "end")
        if text:
            self._append(text)

    def _on_close(self) -> None:
        try:
            self.save_config(silent=True)
        finally:
            self.destroy()

    def save_config(self, *, silent: bool = False) -> None:
        payload = {
            "base_url": (self.base_url.get() or "").strip(),
            "session_path": normalize_session_path(self.session_path.get()),
            "use_dpapi": bool(self.use_dpapi.get()),
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

    def _validate_phone(self) -> Optional[str]:
        phone = (self.phone.get() or "").strip()
        if not PHONE_RE.match(phone):
            return None
        return phone

    def on_send_code(self) -> None:
        phone = self._validate_phone()
        if not phone:
            messagebox.showerror("参数错误", "手机号格式不正确")
            return
        r = self._client().send_code(phone)
        self._append(f"[send-code] phone={phone} ok={r.ok} status={r.status_code} err={r.error or ''}")
        if not r.ok:
            messagebox.showerror("发送失败", r.error or "发送失败")
        else:
            messagebox.showinfo("已发送", "验证码已发送（请查看手机短信）")

    def on_login_and_write(self) -> None:
        phone = self._validate_phone()
        if not phone:
            messagebox.showerror("参数错误", "手机号格式不正确")
            return
        code = (self.code.get() or "").strip()
        if not re.match(r"^[0-9]{6}$", code):
            messagebox.showerror("参数错误", "请输入 6 位数字验证码")
            return
        app_id = (self.app_id_login.get() or "").strip()
        if not app_id:
            messagebox.showerror("参数错误", "app_id 不能为空")
            return

        r = self._client().login_by_phone(phone, code, app_id)
        self._append(f"[login] app_id={app_id} ok={r.ok} status={r.status_code} err={r.error or ''}")
        if not r.ok or not isinstance(r.data, dict):
            messagebox.showerror("登录失败", r.error or "登录失败")
            return

        data = r.data
        guid = str(data.get("guid") or "").strip()
        refresh_token = str(data.get("refresh_token") or "").strip()
        refresh_expires_at = str(data.get("refresh_token_expires_at") or "").strip()
        user_type = str(data.get("user_type") or "user")

        if not guid or not refresh_token or not refresh_expires_at:
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
            self._append(f"[session.write] path={normalize_session_path(self.session_path.get())} err={err}")
            messagebox.showerror("写入失败", err)
            return

        self._append(f"[session.write] ok path={normalize_session_path(self.session_path.get())} guid={guid}")
        self._append(f"  refresh_token={mask_token(refresh_token)} expires_at={refresh_expires_at}")
        messagebox.showinfo("成功", "登录成功，session.dat 已写入，可在端 B 验证 SSO")

    def on_read_session(self) -> None:
        data, err = self._store().read()
        if err:
            self._append(f"[session.read] ok=false err={err}")
            messagebox.showwarning("无会话", err)
            return
        assert data is not None
        guid = str(data.get("guid") or "")
        rt = str(data.get("refresh_token") or "")
        exp = str(data.get("expires_at") or "")
        phone = str(data.get("phone") or "")
        self._append(f"[session.read] ok guid={guid} phone={phone} expires_at={exp}")
        self._append(f"  refresh_token={mask_token(rt)}")

    def on_sso_refresh(self) -> None:
        app_id = (self.app_id_other.get() or "").strip()
        if not app_id:
            messagebox.showerror("参数错误", "端 B app_id 不能为空")
            return

        sess, err = self._store().read()
        if err or not sess:
            self._append(f"[sso] session missing: {err or 'empty'}")
            messagebox.showwarning("无会话", err or "session 为空")
            return

        guid = str(sess.get("guid") or "").strip()
        refresh_token = str(sess.get("refresh_token") or "").strip()
        if not guid or not refresh_token:
            messagebox.showerror("session 异常", "session.dat 缺少 guid/refresh_token")
            return

        r = self._client().refresh_token(guid, refresh_token, app_id)
        self._append(f"[refresh-token] app_id={app_id} ok={r.ok} status={r.status_code} err={r.error or ''}")
        if not r.ok or not isinstance(r.data, dict):
            messagebox.showerror("SSO 刷新失败", r.error or "SSO 刷新失败")
            return

        access_token = str(r.data.get("access_token") or "")
        at_exp = str(r.data.get("access_token_expires_at") or "")
        self._append(f"  access_token={mask_token(access_token)} expires_at={at_exp}")

        v = self._client().verify_token(access_token, app_id) if access_token else HttpResult(False, 0, error="missing access_token")
        self._append(f"[verify-token] ok={v.ok} status={v.status_code} err={v.error or ''}")
        if v.ok and isinstance(v.data, dict):
            self._append(f"  verified: guid={v.data.get('guid')} app_id={v.data.get('app_id')} expires_at={v.data.get('expires_at')}")

        if not v.ok:
            messagebox.showwarning("SSO 部分成功", "refresh-token 成功，但 verify-token 失败，请查看输出")
            return

        messagebox.showinfo("SSO 成功", f"端 B（app_id={app_id}）已通过 refresh_token 获取 access_token，SSO OK")

    def on_delete_session(self) -> None:
        err = self._store().delete()
        if err:
            self._append(f"[session.delete] err={err}")
            messagebox.showerror("删除失败", err)
            return
        self._append("[session.delete] ok")
        messagebox.showinfo("已删除", "session.dat 已删除")


def main() -> int:
    app = App()
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
