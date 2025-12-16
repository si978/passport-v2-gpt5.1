// Electron 主进程 IPC 绑定示例（需在实际工程中调整路径/导出方式）

import { ipcMain, BrowserWindow } from 'electron';
import { ShellApp } from './shell_entry_bridge'; // 需封装 Python/TS 版 ShellApp 接口

// TODO: 将此处替换为真实的后端 baseUrl / appId
const shellApp = new ShellApp({ baseUrl: process.env.PASSPORT_BASE_URL || 'http://127.0.0.1:8091', appId: process.env.PASSPORT_APP_ID || 'jiuweihu' });

// 广播 sessionStatus 给所有窗口
shellApp.onSessionStatus((payload: any) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    win.webContents.send('sessionStatus', payload);
  });
});

ipcMain.handle('passport:login', async (_e, args) => {
  const { phone, code } = args || {};
  await shellApp.login(phone, code);
  return { ok: true };
});

ipcMain.handle('passport:refresh', async (_e, args) => {
  const { guid, refresh_token } = args || {};
  const ok = await shellApp.refresh(guid, refresh_token);
  return { ok };
});

ipcMain.handle('passport:logout', async (_e, args) => {
  await shellApp.logout(args?.access_token);
  return { ok: true };
});

export function startPassportIpc() {
  // 启动时执行一次启动流程
  shellApp.startup();
}
