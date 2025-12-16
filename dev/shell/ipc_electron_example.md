## Electron IPC 适配示例（壳层与前端联调）

### 目标
- 将 `shell_entry.ShellApp` 的会话管理能力通过 Electron 主进程暴露给渲染进程；
- 事件名沿用 `sessionStatus`；指令为 `passport:login` / `passport:refresh` / `passport:logout`；
- 保持错误码处理与现有契约一致（前端已对接错误码）。

### 主进程示例（Node/Electron）
```ts
// main/ipc-passport.ts
import { ipcMain } from 'electron';
import { ShellApp } from './shell_entry_bridge'; // TS/JS 封装，内部 new ShellApp(...)

const app = new ShellApp({ baseUrl: 'http://127.0.0.1:8091', appId: 'jiuweihu' });

// 广播 sessionStatus 给所有窗口
app.onSessionStatus((payload) => {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => win.webContents.send('sessionStatus', payload));
});

ipcMain.handle('passport:login', async (_e, args) => {
  const { phone, code } = args;
  await app.login(phone, code);
  return { ok: true };
});

ipcMain.handle('passport:refresh', async (_e, args) => {
  const { guid, refresh_token } = args;
  const ok = await app.refresh(guid, refresh_token);
  return { ok };
});

ipcMain.handle('passport:logout', async (_e, args) => {
  await app.logout(args?.access_token);
  return { ok: true };
});

// 启动流程：主进程启动时调用一次，向前端广播 sso 状态
app.startup();
```

### 渲染进程示例（前端消费）
```ts
// renderer/passport-ipc.ts
import { ipcRenderer } from 'electron';

export const onSessionStatus = (handler: (payload: any) => void) => {
  ipcRenderer.on('sessionStatus', (_e, payload) => handler(payload));
};

export const loginByPhone = async (phone: string, code: string) => {
  return ipcRenderer.invoke('passport:login', { phone, code });
};

export const refreshToken = async (guid: string, refresh_token: string) => {
  return ipcRenderer.invoke('passport:refresh', { guid, refresh_token });
};

export const logout = async (access_token?: string) => {
  return ipcRenderer.invoke('passport:logout', { access_token });
};
```

### 与现有 Python 壳层的衔接
- 可在 Node 侧通过 `child_process`/`ffi`/`gRPC` 调用 Python 版 `ShellApp`，或将 Python 逻辑移植到 Node。
- 若继续用 Python 版：
  - 在 Python 提供本地 IPC（如 socket/管道）暴露 login/refresh/logout 与 sessionStatus；
  - Electron 主进程作为客户端调用，并把返回的 sessionStatus 转发给渲染进程。

### 对齐注意事项
- sessionStatus 事件 payload：`{ status: string, payload?: any }`，与前端当前订阅保持一致。
- 指令幂等：logout/refresh 调用失败也要保证本地清理与状态广播。
- 错误码契约：后端错误码经 Python 壳层的 error_handling 处理后，再通过 sessionStatus 告知前端（none/banned/rate_limited/app_mismatch 等）。

### 后续增强
- 将 `event_bus.py` 替换为真实的 IPC 适配层，实现 emit/on/dispatch 直接调用 Electron IPC。
- 增加 DPAPI 加解密与文件权限，避免明文 session.dat（可在 SessionFileManager 中插入加解密钩子）。
- 监控/日志：在事件广播和指令处理处增加埋点或日志输出。 
