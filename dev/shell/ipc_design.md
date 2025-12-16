## 壳层 IPC 集成设计（占位方案）

目标：
- 将现有无 IPC 壳层入口（`shell_entry.ShellApp`）对接前端，统一错误码与会话状态广播。
- 保持与前端订阅事件名 `sessionStatus` 一致；前端指令（login/logout/refresh）可通过 IPC 调用壳层。

事件与指令
- 事件：`sessionStatus`，payload `{ status: string, payload?: any }`
  - 可能值：`none`, `active`, `sso_available`, `banned`, `rate_limited`, `app_mismatch`。
- 指令：
  - `login`: params `{ phone, code }`
  - `refresh`: params `{ guid, refresh_token }`（可选，若壳层持有）
  - `logout`: params `{ access_token? }`

架构占位
- 事件总线接口（需替换 `event_bus.py`）：
  - `emit(event, payload)` → 发送到前端（如 WebView2 postMessage / Electron ipcMain / 自定义管道）。
  - `on(event, handler)` → 注册前端指令监听。
- 在 `shell_entry.ShellApp` 中：
  - 将 `_broadcast` 调用改为事件总线的 emit，实现 sessionStatus 推送；当前占位可直接调用 `event_bus.broadcast_session_status`。
  - 暴露 `handle_command(cmd, payload)`：路由 login/refresh/logout 到 AuthController。

接入步骤（建议）
1) 实现真实 EventBus（按宿主平台）：
   - Electron：ipcMain.on / webContents.send；
   - WebView2：postMessage + host handler；
   - 自定义：本地 TCP/命名管道。
2) 在 `shell_entry` 中注入 EventBus，替换 `event_bus` 占位；`broadcast_session_status` → eventBus.emit('sessionStatus', payload)。
3) 注册前端指令：
   - login → `ShellApp.login`
   - refresh → `ShellApp.refresh`（若无 guid/rt，壳层可读本地文件获取）
   - logout → `ShellApp.logout`
4) 保持错误码契约：壳层收到后端错误码走 `error_handling`，并通过 sessionStatus 向前端告知状态（none/banned/rate_limited/app_mismatch 等）。

安全与一致性
- 广播与指令都附带 `app_id` 校验（若前端传参，需壳层验证）；
- 会话文件操作仍走 SessionFileManager（2 小时阈值、损坏清理）；
- DPAPI/权限可在文件读写层增强，不影响 IPC 协议；
- 日志/监控可在 EventBus 层增加记录。

最小落地方案（可执行）
- 提供一个 EventBus 适配层（如 Electron ipcMain），实现 emit/on；
- 将 `shell_entry.ShellApp` 的 `_broadcast` 替换为 eventBus.emit；
- 注册 on('login'/'refresh'/'logout') 调用 ShellApp；
- 复用现有 stub 后端跑一轮前端->壳层->后端->壳层->前端 的闭环联调（可用 mock 前端脚本）。
