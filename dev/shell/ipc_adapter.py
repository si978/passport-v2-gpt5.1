"""IPC 适配层占位。

- 允许绑定真实发送函数（如 Electron ipcMain / WebView2 postMessage），未绑定则回退到本地 event_bus。
- 提供注册/分发指令的简易接口，复用 event_bus.on/dispatch。
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from event_bus import bus, broadcast_session_status as _bus_broadcast

_sender: Optional[Callable[[str, Any], None]] = None


def bind_sender(fn: Callable[[str, Any], None]) -> None:
    """绑定真实 IPC 发送函数，签名 (event, payload)。"""

    global _sender
    _sender = fn


def emit_session_status(status: str, payload: Any = None) -> None:
    """向前端广播 sessionStatus，若有真实 sender 则优先使用。"""

    if _sender:
        _sender("sessionStatus", {"status": status, "payload": payload})
    # 本地 event_bus 仍然保留，便于测试/回退
    _bus_broadcast(status, payload)


def register_command(event: str, handler: Callable[[Dict[str, Any]], None]) -> None:
    """注册来自前端的指令回调（login/refresh/logout）。"""

    bus.on(event, handler)


def dispatch_command(event: str, payload: Dict[str, Any] | None = None) -> None:
    """用于测试/占位，从本地触发指令，等价于收到前端 IPC。"""

    bus.dispatch(event, payload or {})


__all__ = [
    "bind_sender",
    "emit_session_status",
    "register_command",
    "dispatch_command",
]
