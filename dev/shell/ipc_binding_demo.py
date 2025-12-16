"""IPC 绑定示例（Python 侧演示）。

用途：演示如何在宿主启动时绑定真实 sender，并将前端指令转发到 ShellApp。
真实接入时请在宿主（Electron/WebView2 等）侧用对应的 IPC API 替换 sender。
"""

from __future__ import annotations

from ipc_adapter import bind_sender, dispatch_command
from shell_entry import ShellApp


def start_with_dummy_sender():
    app = ShellApp(base_url="http://127.0.0.1:8091", app_id="jiuweihu")

    # 绑定一个简单的 sender，占位打印，真实环境请替换为 IPC 发送函数
    bind_sender(lambda event, payload: print(f"[IPC SEND] {event} -> {payload}"))

    # 示例：派发指令（等价于前端触发）
    dispatch_command("login", {"phone": "13800138000", "code": "123456"})

    return app


if __name__ == "__main__":  # pragma: no cover
    start_with_dummy_sender()
