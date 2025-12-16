"""简易事件总线占位（可替换为真实 IPC）。

- emit(event, payload): 记录/广播事件（对前端）。
- on(event, handler): 注册指令处理（前端 -> 壳层）。
- dispatch(event, payload): 触发指令处理（测试/占位，可替换为真实 IPC 收到的事件）。
- broadcast_session_status(status, payload): 发送 sessionStatus 事件，前端可订阅。

实际项目中可替换为 WebSocket/IPC/Native 消息机制。
"""

from __future__ import annotations

from typing import Any, Dict, List


class EventBus:
    def __init__(self) -> None:
        self.events: List[Dict[str, Any]] = []
        self.handlers: Dict[str, List[Callable[[Any], None]]] = {}

    def emit(self, event: str, payload: Any = None) -> None:
        self.events.append({"event": event, "payload": payload})

    def on(self, event: str, handler: Callable[[Any], None]) -> None:
        self.handlers.setdefault(event, []).append(handler)

    def dispatch(self, event: str, payload: Any = None) -> None:
        for h in self.handlers.get(event, []):
            h(payload)


bus = EventBus()


def broadcast_session_status(status: str, payload: Any = None) -> None:
    bus.emit("sessionStatus", {"status": status, "payload": payload})


__all__ = ["EventBus", "bus", "broadcast_session_status"]
