"""为 Python 版本绑定 IPC sender 的示例。

用途：当宿主（Electron/WebView2 等）提供一个跨进程发送函数时，可在此处绑定，
并将指令派发给 ShellApp。真实项目中请将 sender 替换为宿主提供的函数。
"""

from __future__ import annotations

from ipc_adapter import bind_sender, dispatch_command
from shell_entry import ShellApp


def bind_and_run(sender_func):
    """sender_func: callable(event: str, payload: any) -> None"""
    bind_sender(sender_func)
    app = ShellApp(base_url="http://127.0.0.1:8091", app_id="jiuweihu")
    return app


if __name__ == "__main__":  # pragma: no cover
    # demo：简单打印 sender
    app = bind_and_run(lambda event, payload: print(f"send {event}: {payload}"))
    dispatch_command("login", {"phone": "13800138000", "code": "123456"})
