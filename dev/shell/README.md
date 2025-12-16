## 壳层契约化处理（快速提要）

- 错误码处理：`error_handling.py`
  - `map_error_to_action(code)`：错误码 → 动作映射（契约同 refactor/contracts/errors-and-flows.md）
  - `handle_error_action(action, logout, broadcast_status, ...)`：统一执行（logout/ban/refresh retry/app mismatch/rate limit/internal）。

- 集成点：
  - 启动/SSO：`sso_startup.py` 提供 `handle_error_code`，在刷新失败或收到后端错误时调用。
  - 退出：`logout_handler.py` 提供 `on_error_code`，用于后端响应错误时统一处理。

- 测试：`python -m pytest dev/shell -q`（含错误处理 PoC 3/3 通过）。

- 验收/联调（可运行）：
  - Stub 后端 + IPC 链路一键演示：`npm run demo:shell`（或 `node dev/shell/ipc_stdio_demo.js`）
  - 真实后端（需先启动 Nest 并可发短信）：
    - 设置 `START_STUB_BACKEND=0`，并配置：
      - `PASSPORT_BASE_URL=http://127.0.0.1:8080/api`（若不含 `/api`，脚本会自动补齐）
      - `PASSPORT_APP_ID=jiuweihu`（按需）
      - `PASSPORT_SESSION_PATH=...`（可选）
    - 运行 `node dev/shell/ipc_stdio_demo.js`，按提示输入手机号与短信验证码（会真实外发短信）
    - 可选：`CONFIRM_SMS_SEND=1` 跳过“是否发送短信”确认；或提前设置 `TEST_PHONE/TEST_CODE` 走非交互模式
  - 说明：IPC 侧新增 `get_session` 指令用于联调读取本地会话（见 `dev/shell/ipc_stdio_server.py`）。

## Windows EXE（推荐给验收/非开发人员）

提供一个可双击运行的 GUI 工具：在 EXE 内完成“真实短信登录写入 session.dat”以及“另一个端 app_id 的 SSO 刷新验证”。

1. 先确保生产形态已启动（`deploy/docker-compose.yml`），并能访问：`http://127.0.0.1:8080/api/health`
2. 打包 EXE：`npm run build:shell:exe`（或 `pwsh deploy/build-shell-gui.ps1`）
3. 运行：`dist/PassportShellDemo.exe`
   - 端 A：输入手机号/验证码，点击“登录并写入 session.dat”
   - 端 B：填入另一个 `app_id`（默认 `youlishe`），点击“SSO 刷新（refresh-token）”

## 两个独立 EXE（模拟两个客户端，启动即自动 SSO）

用于真实验证“两个客户端共享 session.dat，启动自动 SSO 登录”的效果：

1. 打包：`npm run build:clients:exe`（或 `pwsh deploy/build-shell-clients.ps1`）
2. 运行客户端 A：`dist/PassportClientJiuweihu.exe`
   - 首次无 session 时可在界面内手机号登录（会写入 `session.dat`）
3. 运行客户端 B：`dist/PassportClientYoulishe.exe`
   - 启动会自动读取 `session.dat`，调用 `refresh-token(app_id=youlishe)` 完成 SSO；成功会显示 “自动登录成功”

- 待接线：
  - 将 `error_handling.py` 嵌入实际 IPC/刷新/退出流（取代占位的 on_error_code 调用）。
  - 文件层错误码（ERR_SESSION_CORRUPTED/NOT_FOUND）与 2 小时阈值清理保持一致，确保广播状态与后端契约一致。

### 接线示例（伪代码）

```python
from error_handling import map_error_to_action, handle_error_action

def on_http_error(code: str):
    action = map_error_to_action(code)
    handle_error_action(
        action,
        logout=clear_local_session_and_delete_file,
        broadcast_status=lambda status: ipc_broadcast(status),
        on_rate_limit=lambda: ipc_broadcast("rate_limited"),
        on_app_mismatch=lambda: ipc_broadcast("app_mismatch"),
    )

def on_session_file_error(err_code: str):
    # ERR_SESSION_CORRUPTED / ERR_SESSION_NOT_FOUND
    on_http_error(err_code)

def on_refresh_failure(err_code: str):
    on_http_error(err_code)
```

> 真实接入时：
> - 刷新失败/后端错误回调中调用 `on_http_error`。
> - 会话文件校验失败时调用 `on_session_file_error`。
> - IPC 广播需与前端订阅的事件名保持一致（见前端 `sessionEvents`）。
