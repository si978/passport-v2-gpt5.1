"""Python 壳层 IPC（stdio）服务端：供 Electron 主进程以子进程方式调用。

协议：一行一个 JSON。

请求：
{ "id": "uuid", "cmd": "login|refresh|logout|startup", "params": {...} }

响应：
{ "id": "uuid", "ok": true, "result": {...} }
或
{ "id": "uuid", "ok": false, "error": "..." }

事件：
{ "event": "sessionStatus", "payload": {"status": "active", "payload": ...} }

注意：这里不实现任何 Electron 代码，仅提供可复用 IPC 服务。
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict

import os
import sys

# ensure dev/shell is importable when running as a script
ROOT = os.path.abspath(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from ipc_adapter import bind_sender
from shell_entry import ShellApp


def _send(obj: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main() -> int:
    base_url = os.getenv("PASSPORT_BASE_URL", "http://127.0.0.1:8091")
    app_id = os.getenv("PASSPORT_APP_ID", "jiuweihu")
    app = ShellApp(base_url=base_url, app_id=app_id)

    # sender：将 sessionStatus 事件写回 stdout
    bind_sender(lambda event, payload: _send({"event": event, "payload": payload}))

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            req_id = req.get("id")
            cmd = req.get("cmd")
            params = req.get("params") or {}

            if cmd == "startup":
                app.startup_flow()
                _send({"id": req_id, "ok": True, "result": {}})
                continue
            if cmd == "login":
                app.login(params.get("phone"), params.get("code"))
                _send({"id": req_id, "ok": True, "result": {}})
                continue
            if cmd == "refresh":
                ok = app.refresh(params.get("guid"), params.get("refresh_token"))
                _send({"id": req_id, "ok": True, "result": {"ok": ok}})
                continue
            if cmd == "logout":
                app.logout(params.get("access_token"))
                _send({"id": req_id, "ok": True, "result": {}})
                continue
            if cmd == "get_session":
                _send({"id": req_id, "ok": True, "result": {"session": app._read_as_dict()}})
                continue

            _send({"id": req_id, "ok": False, "error": f"unknown cmd: {cmd}"})
        except Exception as exc:  # noqa: BLE001
            _send({"id": req.get("id"), "ok": False, "error": str(exc)})

    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
