"""
星币商城客户端 - 无边框 WebView + 登录集成

启动流程：
1. 检查 session.dat 是否有效
2. 有效 → 直接打开无边框 WebView 显示星币商城
3. 无效 → 显示登录窗口，登录成功后打开 WebView
"""

from __future__ import annotations

import os
import re
import sys
import threading
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

import requests
import tkinter as tk
from tkinter import ttk, messagebox

# 确保 dev 目录在 sys.path
def _ensure_dev_on_syspath() -> None:
    here = os.path.abspath(os.path.dirname(__file__))
    dev_root = os.path.abspath(os.path.join(here, ".."))
    if dev_root not in sys.path:
        sys.path.insert(0, dev_root)

_ensure_dev_on_syspath()

from shell.session_file_manager import SessionFileManager, default_session_path
from shell.dpapi_adapter import protect as dpapi_protect, unprotect as dpapi_unprotect
from shell.client_config import default_config_path, load_config, save_config

# 常量
UTC = timezone.utc
PHONE_RE = re.compile(r"^1[3-9][0-9]{9}$")
TWO_HOURS = timedelta(hours=2)
APP_ID = "youlishe"

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


class PassportClient:
    """Passport API 客户端"""
    def __init__(self, base_api: str, timeout_sec: int = 15) -> None:
        self.base_api = ensure_api_base(base_api)
        self.timeout_sec = timeout_sec

    def _post(self, path: str, payload: Dict[str, Any], retries: int = 2) -> Tuple[bool, int, Any, Optional[str]]:
        if not self.base_api:
            return False, 0, None, "Base URL 为空"
        url = f"{self.base_api}{path}"
        
        last_err = None
        for attempt in range(retries + 1):
            try:
                resp = requests.post(url, json=payload, timeout=self.timeout_sec)
                data = None
                if resp.content:
                    try:
                        data = resp.json()
                    except Exception:
                        data = resp.text
                if resp.status_code >= 400:
                    err_msg = data.get("message") if isinstance(data, dict) else None
                    return False, resp.status_code, data, err_msg or f"HTTP {resp.status_code}"
                return True, resp.status_code, data, None
            except requests.exceptions.Timeout:
                last_err = "网络超时，请检查网络连接"
            except requests.exceptions.ConnectionError:
                last_err = "无法连接服务器，请检查网络"
            except Exception as exc:
                last_err = str(exc)
            
            if attempt < retries:
                import time
                time.sleep(0.5 * (attempt + 1))
        
        return False, 0, None, last_err

    def send_code(self, phone: str):
        return self._post("/passport/send-code", {"phone": phone})

    def login_by_phone(self, phone: str, code: str):
        return self._post("/passport/login-by-phone", {"phone": phone, "code": code, "app_id": APP_ID})

    def refresh_token(self, guid: str, refresh_token: str):
        return self._post("/passport/refresh-token", {"guid": guid, "refresh_token": refresh_token, "app_id": APP_ID})

    def logout(self, access_token: Optional[str]):
        payload = {"access_token": access_token} if access_token else {}
        return self._post("/passport/logout", payload)


class SessionStore:
    """Session 存储管理"""
    def __init__(self, path: str, use_dpapi: bool = True) -> None:
        self.path = normalize_session_path(path)
        self.use_dpapi = use_dpapi

    def _manager(self):
        if self.use_dpapi:
            return SessionFileManager(path=self.path, encoder=dpapi_protect, decoder=dpapi_unprotect)
        return SessionFileManager(path=self.path, encoder=None, decoder=None)

    def read(self) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
        try:
            return self._manager().read(), None
        except FileNotFoundError:
            return None, "session 文件不存在"
        except Exception as exc:
            return None, f"读取 session 失败：{exc}"

    def write(self, payload: Dict[str, Any]) -> Optional[str]:
        try:
            self._manager().write(payload)
            return None
        except Exception as exc:
            return f"写入 session 失败：{exc}"

    def delete(self) -> Optional[str]:
        try:
            self._manager().delete()
            return None
        except Exception as exc:
            return f"删除 session 失败：{exc}"


def validate_session(sess: Dict[str, Any], now: datetime) -> Tuple[bool, str]:
    """验证 session 是否有效"""
    required = {"guid", "phone", "created_at", "expires_at", "refresh_token"}
    if not required.issubset(sess.keys()):
        return False, "session 字段缺失"
    try:
        created_at = parse_iso_dt(sess.get("created_at"))
        expires_at = parse_iso_dt(sess.get("expires_at"))
    except Exception:
        return False, "session 时间字段非法"
    if expires_at < created_at:
        return False, "session 时间范围非法"
    if now > expires_at:
        return False, "session 已过期"
    if now - created_at > TWO_HOURS:
        return False, "session 超过 2 小时阈值"
    return True, "ok"


# 全局配置
def get_config():
    """获取配置"""
    config_path = os.environ.get("PASSPORT_CLIENT_CONFIG") or default_config_path()
    cfg = load_config(config_path)
    
    base_url = os.environ.get("PASSPORT_BASE_URL") or cfg.get("base_url") or "https://passport.dingnew.top"
    session_path = os.environ.get("PASSPORT_SESSION_PATH") or cfg.get("session_path") or default_session_path()
    use_dpapi = cfg.get("use_dpapi", True)
    star_coins_url = os.environ.get("STAR_COINS_URL") or "https://star.dingnew.top/client/tasks"
    
    return {
        "base_url": base_url,
        "session_path": session_path,
        "use_dpapi": use_dpapi,
        "star_coins_url": star_coins_url,
    }


class LoginWindow(tk.Tk):
    """登录窗口"""
    def __init__(self, config: Dict[str, Any], on_success: callable, on_cancel: callable = None):
        super().__init__()
        self.config = config
        self.on_success = on_success
        self.on_cancel = on_cancel
        self.access_token = None
        self._sending_code = False
        self._logging_in = False
        
        self.title("游利社星币商城 - 登录")
        self.geometry("400x320")
        self.resizable(False, False)
        
        # 居中显示
        self.update_idletasks()
        x = (self.winfo_screenwidth() - 400) // 2
        y = (self.winfo_screenheight() - 320) // 2
        self.geometry(f"400x320+{x}+{y}")
        
        self.phone = tk.StringVar()
        self.code = tk.StringVar()
        self.status = tk.StringVar(value="")
        self._build_ui()
        
        # 关闭窗口处理
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        
    def _on_close(self):
        if self.on_cancel:
            self.on_cancel()
        self.destroy()
        
    def _build_ui(self):
        frame = ttk.Frame(self, padding=30)
        frame.pack(fill="both", expand=True)
        
        # Logo
        ttk.Label(frame, text="游利社星币商城", font=("Microsoft YaHei", 18, "bold")).pack(pady=(0, 20))
        
        # 手机号
        ttk.Label(frame, text="手机号：").pack(anchor="w")
        ttk.Entry(frame, textvariable=self.phone, width=30).pack(fill="x", pady=(0, 10))
        
        # 验证码
        code_frame = ttk.Frame(frame)
        code_frame.pack(fill="x", pady=(0, 10))
        ttk.Label(code_frame, text="验证码：").pack(anchor="w")
        code_row = ttk.Frame(code_frame)
        code_row.pack(fill="x")
        ttk.Entry(code_row, textvariable=self.code, width=15).pack(side="left")
        self.send_btn = ttk.Button(code_row, text="发送验证码", command=self._send_code)
        self.send_btn.pack(side="right")
        
        # 登录按钮
        self.login_btn = ttk.Button(frame, text="登 录", command=self._login)
        self.login_btn.pack(fill="x", pady=(20, 0))
        
        # 状态提示
        ttk.Label(frame, textvariable=self.status, foreground="gray").pack(pady=(10, 0))
        
    def _set_status(self, msg: str, is_error: bool = False):
        self.status.set(msg)
        
    def _send_code(self):
        if self._sending_code:
            return
            
        phone = self.phone.get().strip()
        if not PHONE_RE.match(phone):
            messagebox.showerror("错误", "请输入正确的手机号")
            return
        
        self._sending_code = True
        self.send_btn.config(state="disabled")
        self._set_status("正在发送验证码...")
        
        def work():
            client = PassportClient(self.config["base_url"])
            return client.send_code(phone)
        
        def done(result):
            self._sending_code = False
            self.send_btn.config(state="normal")
            ok, status, data, err = result
            if ok:
                self._set_status("验证码已发送，请查看手机")
                messagebox.showinfo("成功", "验证码已发送")
            else:
                self._set_status("")
                messagebox.showerror("发送失败", err or "发送失败，请稍后重试")
        
        def run():
            result = work()
            try:
                self.after(0, lambda: done(result))
            except tk.TclError:
                pass
        
        threading.Thread(target=run, daemon=True).start()
        
    def _login(self):
        if self._logging_in:
            return
            
        phone = self.phone.get().strip()
        code = self.code.get().strip()
        
        if not PHONE_RE.match(phone):
            messagebox.showerror("错误", "请输入正确的手机号")
            return
        if not re.match(r"^\d{4,6}$", code):
            messagebox.showerror("错误", "请输入4-6位验证码")
            return
        
        self._logging_in = True
        self.login_btn.config(state="disabled")
        self._set_status("正在登录...")
        
        def work():
            client = PassportClient(self.config["base_url"])
            return client.login_by_phone(phone, code)
        
        def done(result):
            self._logging_in = False
            self.login_btn.config(state="normal")
            ok, status, data, err = result
            
            if not ok or not isinstance(data, dict):
                self._set_status("")
                messagebox.showerror("登录失败", err or "登录失败，请检查验证码")
                return
            
            # 保存 session
            guid = data.get("guid", "")
            refresh_token = data.get("refresh_token", "")
            refresh_expires_at = data.get("refresh_token_expires_at", "")
            self.access_token = data.get("access_token", "")
            
            if not guid or not refresh_token:
                self._set_status("")
                messagebox.showerror("错误", "登录响应异常，请稍后重试")
                return
            
            try:
                store = SessionStore(self.config["session_path"], self.config["use_dpapi"])
                store.write({
                    "guid": guid,
                    "phone": phone,
                    "user_type": data.get("user_type", "user"),
                    "refresh_token": refresh_token,
                    "created_at": now_iso(),
                    "expires_at": refresh_expires_at,
                })
            except Exception as e:
                # session 写入失败不影响登录
                pass
            
            self._set_status("登录成功")
            self.destroy()
            self.on_success(self.access_token)
        
        def run():
            result = work()
            try:
                self.after(0, lambda: done(result))
            except tk.TclError:
                pass
        
        threading.Thread(target=run, daemon=True).start()


class StarCoinsApp:
    """星币商城主应用"""
    def __init__(self):
        self.config = get_config()
        self.access_token = None
        self.webview_window = None
        self._exited = False
        
    def run(self):
        # 尝试自动登录
        token = self._try_auto_login()
        if token and len(token) > 10:
            self.access_token = token
            self._open_webview()
        else:
            # 自动登录失败，显示登录窗口
            self._show_login()
    
    def _try_auto_login(self) -> Optional[str]:
        """尝试使用 session.dat 自动登录"""
        try:
            store = SessionStore(self.config["session_path"], self.config["use_dpapi"])
            sess, err = store.read()
            if err or not sess:
                print(f"[DEBUG] Session read failed: {err}")
                return None
            
            ok, reason = validate_session(sess, now_utc())
            if not ok:
                print(f"[DEBUG] Session invalid: {reason}")
                store.delete()
                return None
            
            guid = sess.get("guid", "")
            rt = sess.get("refresh_token", "")
            if not guid or not rt:
                print("[DEBUG] Session missing guid or refresh_token")
                store.delete()
                return None
            
            client = PassportClient(self.config["base_url"])
            ok, status, data, err = client.refresh_token(guid, rt)
            if not ok or not isinstance(data, dict):
                print(f"[DEBUG] Token refresh failed: {err}")
                return None
            
            token = data.get("access_token", "")
            if not token:
                print("[DEBUG] No access_token in response")
                return None
            
            print(f"[DEBUG] Auto login success, token length: {len(token)}")
            return token
        except Exception as e:
            print(f"[DEBUG] Auto login exception: {e}")
            return None
    
    def _show_login(self):
        """显示登录窗口"""
        if self._exited:
            return
        
        def on_success(token):
            self._on_login_success(token)
        
        def on_cancel():
            self._on_login_cancel()
        
        try:
            login = LoginWindow(self.config, on_success, on_cancel)
            login.mainloop()
        except Exception as e:
            import tkinter.messagebox as mb
            mb.showerror("错误", f"无法显示登录窗口：{e}")
    
    def _on_login_cancel(self):
        """登录取消回调"""
        self._exited = True
    
    def _on_login_success(self, token: str):
        """登录成功回调"""
        if not token:
            self._show_login()
            return
        self.access_token = token
        self._open_webview()
    
    def _open_webview(self):
        """打开无边框 WebView"""
        if self._exited or not self.access_token:
            return
            
        try:
            import webview
        except ImportError:
            import tkinter.messagebox as mb
            mb.showerror("错误", "缺少 pywebview 组件，请联系技术支持")
            return
        
        url = f"{self.config['star_coins_url']}?access_token={self.access_token}"
        
        # JS API 用于退出登录和窗口控制
        class Api:
            def __init__(self, app):
                self._app = app
            
            def logout(self):
                """退出登录（兼容旧版）"""
                self._app._logout()
            
            def minimize(self):
                """最小化窗口"""
                if self._app.webview_window:
                    self._app.webview_window.minimize()
            
            def close(self):
                """关闭窗口"""
                if self._app.webview_window:
                    self._app.webview_window.destroy()
            
            def saveSession(self, data: dict):
                """保存 session 到本地文件（Web 端登录成功后调用）"""
                try:
                    guid = data.get("guid", "")
                    phone = data.get("phone", "")
                    refresh_token = data.get("refreshToken", "")
                    expires_at = data.get("expiresAt", "")
                    
                    if not guid or not refresh_token:
                        print("[Api.saveSession] Missing guid or refreshToken")
                        return
                    
                    store = SessionStore(self._app.config["session_path"], self._app.config["use_dpapi"])
                    store.write({
                        "guid": guid,
                        "phone": phone,
                        "user_type": "user",
                        "refresh_token": refresh_token,
                        "created_at": now_iso(),
                        "expires_at": expires_at,
                    })
                    print(f"[Api.saveSession] Session saved for {phone}")
                except Exception as e:
                    print(f"[Api.saveSession] Error: {e}")
            
            def clearSession(self):
                """删除本地 session 文件（Web 端退出登录后调用）"""
                self._app._logout()
        
        try:
            self.webview_window = webview.create_window(
                '游利社星币商城',
                url,
                width=1000,
                height=700,
                resizable=True,
                frameless=True,
                min_size=(800, 600),
                js_api=Api(self),
            )
            
            webview.start(private_mode=False)
        except Exception as e:
            import tkinter.messagebox as mb
            mb.showerror("错误", f"无法打开商城页面：{e}")
    
    def _logout(self):
        """退出登录"""
        try:
            # 调用后端登出
            client = PassportClient(self.config["base_url"])
            client.logout(self.access_token)
        except Exception:
            pass
        
        try:
            # 清除本地 session
            store = SessionStore(self.config["session_path"], self.config["use_dpapi"])
            store.delete()
        except Exception:
            pass
        
        # 关闭 WebView 并重新显示登录
        if self.webview_window:
            try:
                self.webview_window.destroy()
            except Exception:
                pass
        
        self.access_token = None
        self._show_login()


def main() -> int:
    # EXE 环境设置默认值
    if getattr(sys, "frozen", False):
        os.environ.setdefault("PASSPORT_BASE_URL", "https://passport.dingnew.top")
        os.environ.setdefault("STAR_COINS_URL", "https://star.dingnew.top/client/tasks")
    
    app = StarCoinsApp()
    app.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
