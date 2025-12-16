"""真实后端回归驱动脚本（占位，读取环境变量）。

环境变量：
- PASSPORT_BASE_URL（必填）
- PASSPORT_APP_ID（必填）

使用：配置后运行 `python dev/shell/real_backend_regress.py`
根据 `refactor/real-backend-regression.md` 的场景可扩展。
"""

from __future__ import annotations

import os
import sys

from shell_entry import ShellApp


BASE_URL = os.getenv("PASSPORT_BASE_URL")
APP_ID = os.getenv("PASSPORT_APP_ID")

if not BASE_URL or not APP_ID:
    print("PASSPORT_BASE_URL and PASSPORT_APP_ID are required")
    sys.exit(1)


def run():
    app = ShellApp(base_url=BASE_URL, app_id=APP_ID)

    def step(desc, fn):
        print(f"[CASE] {desc}")
        try:
            fn()
        except Exception as exc:  # noqa: BLE001
            print(f"  exception: {exc}")
        if app.events:
            print(f"  last status: {app.events[-1]}")

    def login_ok():
        app.events.clear()
        app.login(os.getenv("TEST_PHONE", "13800138000"), os.getenv("TEST_CODE", "123456"))

    def refresh_expired():
        app.events.clear()
        app.login(os.getenv("TEST_PHONE", "13800138000"), os.getenv("TEST_CODE", "123456"))
        # 需要后端配合构造 refresh 失效场景，或使用即将过期的 refresh_token
        data = app._read_as_dict()
        if data:
            app.refresh(data["guid"], data["refresh_token"])

    def banned_flow():
        app.events.clear()
        # 依赖后端提供封禁账号或封禁开关；若返回 ERR_USER_BANNED，则应广播 banned
        try:
            app.login(os.getenv("TEST_BANNED_PHONE", "13800000000"), os.getenv("TEST_CODE", "123456"))
        except Exception:
            pass

    def rate_limit_flow():
        app.events.clear()
        # 依赖后端频控策略；短时间多次调用可能触发 ERR_CODE_TOO_FREQUENT
        try:
            for _ in range(3):
                app.login(os.getenv("TEST_PHONE", "13800138000"), os.getenv("TEST_CODE", "123456"))
        except Exception:
            pass

    def access_invalid_flow():
        app.events.clear()
        # 依赖后端验证接口；此处占位：如果前端持有过期 Access Token，可在 API 调用前注入；
        # 可在后续扩展 http_client 增加 verify 接口，用于主动校验。
        pass

    def logout_flow():
        app.events.clear()
        app.logout()
    steps = [
        ("login success", login_ok),
        ("refresh (may expire)", refresh_expired),
        ("logout", logout_flow),
        ("banned", banned_flow),
        ("rate limit", rate_limit_flow),
        ("access invalid (placeholder)", access_invalid_flow),
        # TODO: 按 real-backend-regression.md 添加更多场景（封禁/刷新过期/会话缺失/频控等），需要可控后端数据或预设账号。
    ]

    for desc, fn in steps:
        step(desc, fn)


if __name__ == "__main__":  # pragma: no cover
    run()
