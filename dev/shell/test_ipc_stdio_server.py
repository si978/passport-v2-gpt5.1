from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
import unittest

from stub_backend import create_server


class IpcStdioServerTests(unittest.TestCase):
    def test_startup_and_login_emits_session_status(self):
        server = create_server(port=8092)
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
        time.sleep(0.05)

        env = dict(os.environ)
        env["PASSPORT_BASE_URL"] = "http://127.0.0.1:8092"
        env["PASSPORT_APP_ID"] = "jiuweihu"

        proc = subprocess.Popen(
            [sys.executable, os.path.join(os.path.dirname(__file__), "ipc_stdio_server.py")],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

        assert proc.stdin and proc.stdout

        proc.stdin.write(json.dumps({"id": "1", "cmd": "startup", "params": {}}) + "\n")
        proc.stdin.flush()

        # 读取若干行直到响应
        lines = []
        deadline = time.time() + 3
        while time.time() < deadline and len(lines) < 10:
            line = proc.stdout.readline().strip()
            if not line:
                continue
            lines.append(line)
            obj = json.loads(line)
            if obj.get("id") == "1":
                break

        self.assertTrue(any(json.loads(l).get("id") == "1" and json.loads(l).get("ok") for l in lines))

        proc.stdin.write(json.dumps({"id": "2", "cmd": "login", "params": {"phone": "13800138000", "code": "123456"}}) + "\n")
        proc.stdin.flush()

        # 期望先看到 sessionStatus 事件或响应
        seen_status = False
        seen_resp = False
        deadline = time.time() + 3
        while time.time() < deadline and not (seen_status and seen_resp):
            line = proc.stdout.readline().strip()
            if not line:
                continue
            obj = json.loads(line)
            if obj.get("event") == "sessionStatus":
                seen_status = True
            if obj.get("id") == "2" and obj.get("ok") is True:
                seen_resp = True

        self.assertTrue(seen_status)
        self.assertTrue(seen_resp)

        proc.terminate()
        server.shutdown()
        t.join(timeout=1)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
