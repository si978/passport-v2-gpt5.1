## Electron + Python 壳层 IPC 闭环接线清单（可执行）

目标：实现渲染进程 → 主进程 → Python 壳层 → 主进程 → 渲染进程 的闭环。

### 0. 前置
- 目标文件/示例：
  - 主进程：`dev/shell/ipc_electron_binding.ts`
  - 渲染进程：`dev/shell/ipc_electron_renderer_example.ts`
  - Python sender 绑定：`dev/shell/ipc_bind_sender_example.py`
- 约定：事件名 `sessionStatus`；指令 `passport:login` / `passport:refresh` / `passport:logout`。

### 1. Python 壳层以“服务”形式启动
推荐两种方式：

**方式 A：作为子进程启动（建议）**
- Electron 主进程启动 Python 子进程（`python -m ...`），并通过本地 IPC（stdin/stdout、socket、管道）与其通信。
- Python 子进程内部：
  - 初始化 `ShellApp(base_url, app_id)`
  - 调用 `ipc_adapter.bind_sender(sender)`，sender 将 sessionStatus 推送到宿主。
  - 从 IPC 接收 login/refresh/logout 指令，转为 `dispatch_command`。

**方式 B：Python 与 Electron 同进程（不建议）**
- 仅用于开发验证，生产不推荐。

### 2. 主进程绑定 sender（sessionStatus 广播）
- 在主进程中，把 Python 侧 sender 绑定到 `BrowserWindow.getAllWindows().webContents.send('sessionStatus', payload)`。
- 参考：`dev/shell/ipc_electron_bind_sender_patch.md`。

### 3. 主进程注册指令
- login/refresh/logout 分别 invoke Python（或 dispatch_command）触发 ShellApp。
- 参考：`dev/shell/ipc_electron_binding.ts`。

### 4. 渲染进程接入
- 在渲染进程订阅 `sessionStatus`，并调用 `ipcRenderer.invoke('passport:login', ...)`。
- 参考：`dev/shell/ipc_electron_renderer_example.ts`。

### 5. 本地验证步骤（最小闭环）
1) 使用 stub 后端：启动 `dev/shell/stub_backend.py`（或跑 `e2e_regression_stub.py`）。
2) 主进程启动 Python 壳层并绑定 sender。
3) 在渲染进程执行 login：应收到 sessionStatus=active。
4) 模拟封禁/刷新过期：应收到 sessionStatus=banned/none。

### 6. 常见问题
- sessionStatus 没收到：检查 sender 是否绑定、webContents.send 是否正确、事件名一致。
- login invoke 无响应：检查 ipcMain.handle 注册、Python 子进程是否在跑、IPC 通道是否卡住。
- 错误码不一致：确认后端返回 `code/error_code`，前端/壳层兼容逻辑已开启。

### 7. 上线前必须项
- 可直接使用的 stdio 子进程方案：`dev/shell/ipc_electron_spawn_stdio.ts`（spawn Python + JSON line 协议 + ipcMain.handle）。
- 真实后端回归：按 `refactor/real-backend-regression.md` 执行，并填写 `refactor/real-backend-regression-results.md`。
- 安全：DPAPI 启用、文件权限收敛、日志/监控。
