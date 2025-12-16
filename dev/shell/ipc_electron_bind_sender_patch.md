以下为在 Electron 主进程中绑定 Python 壳层 IPC 的参考补丁（伪代码示例）：

```ts
// main.ts 或专用 ipc 文件
import { ipcMain, BrowserWindow } from 'electron';
import { bind_sender, dispatch_command } from './ipc_adapter_bridge';

// 将 Python 壳层作为子进程/服务暴露的 sender 函数绑定到 ipc_adapter
bind_sender((event, payload) => {
  const wins = BrowserWindow.getAllWindows();
  wins.forEach((win) => win.webContents.send(event, payload));
});

ipcMain.handle('passport:login', async (_e, args) => {
  dispatch_command('login', { phone: args?.phone, code: args?.code });
  return { ok: true };
});

ipcMain.handle('passport:refresh', async (_e, args) => {
  dispatch_command('refresh', { guid: args?.guid, refresh_token: args?.refresh_token });
  return { ok: true };
});

ipcMain.handle('passport:logout', async (_e, args) => {
  dispatch_command('logout', { access_token: args?.access_token });
  return { ok: true };
});

// 启动时若需要 SSO 检查，可在 Python 壳层启动后触发 startup_flow（可通过额外指令或直接在子进程启动）。
```

> 说明：
- 需要在 Electron 打包环境下提供 `ipc_adapter_bridge`，调用 Python 侧的 `ipc_adapter.bind_sender` 和 `dispatch_command`。
- sessionStatus 事件通过 sender 广播到渲染进程（前端订阅）。
- baseUrl/appId 可通过环境变量注入。
