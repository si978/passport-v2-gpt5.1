// Electron 渲染进程消费示例

import { ipcRenderer } from 'electron';

export type SessionStatusPayload = { status: string; payload?: any };

export function onSessionStatus(handler: (payload: SessionStatusPayload) => void) {
  ipcRenderer.on('sessionStatus', (_e, payload) => handler(payload));
}

export async function passportLogin(phone: string, code: string) {
  return ipcRenderer.invoke('passport:login', { phone, code });
}

export async function passportRefresh(guid: string, refresh_token: string) {
  return ipcRenderer.invoke('passport:refresh', { guid, refresh_token });
}

export async function passportLogout(access_token?: string) {
  return ipcRenderer.invoke('passport:logout', { access_token });
}
