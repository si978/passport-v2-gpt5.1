"""端到端回归脚本（stub 后端版）。

用途：快速验证壳层入口 + IPC 占位 + stub 后端的核心契约场景。
真实后端回归可参考 cross-regression-plan.md 替换 base_url。
"""

from __future__ import annotations

import threading
import time

import requests

from shell_entry import ShellApp
from stub_backend import create_server, state


def run_e2e_stub():
    # 启动 stub 后端
    server = create_server(port=8091)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.05)
    requests.get("http://127.0.0.1:8091/health", timeout=2)

    app = ShellApp(base_url="http://127.0.0.1:8091", app_id="jiuweihu")

    def step(desc, fn):
        print(f"[CASE] {desc}")
        fn()
        print(f"  events: {app.events[-1] if app.events else 'n/a'}")

    def login_ok():
        state.mode = "ok"
        app.login("13800138000", "123456")

    def login_banned():
        state.mode = "banned"
        try:
            app.login("13800138000", "123456")
        except Exception:
            pass

    def refresh_expired():
        state.mode = "ok"
        app.login("13800138000", "123456")
        state.mode = "refresh_expired"
        data = app._read_as_dict()
        if data:
            app.refresh(data["guid"], data["refresh_token"])

    def session_not_found():
        state.mode = "ok"
        app.login("13800138000", "123456")
        state.mode = "session_not_found"
        data = app._read_as_dict()
        if data:
            app.refresh(data["guid"], data["refresh_token"])

    def rate_limit():
        state.mode = "rate_limit"
        try:
            app.login("13800138000", "123456")
        except Exception:
            pass

    def app_mismatch():
        state.mode = "ok"
        app.login("13800138000", "123456")
        state.mode = "app_mismatch"
        data = app._read_as_dict()
        if data:
            app.refresh(data["guid"], data["refresh_token"])

    steps = [
        ("login success", login_ok),
        ("login banned", login_banned),
        ("refresh expired", refresh_expired),
        ("session not found", session_not_found),
        ("rate limit", rate_limit),
        ("app mismatch", app_mismatch),
    ]

    for desc, fn in steps:
        app.events.clear()
        fn()
        if app.events:
            print(f"  -> last status: {app.events[-1]}")

    server.shutdown()
    t.join(timeout=1)


if __name__ == "__main__":  # pragma: no cover
    run_e2e_stub()
