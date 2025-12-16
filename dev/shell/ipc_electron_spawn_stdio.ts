// Electron 主进程：spawn Python 壳层（stdio JSON 协议）并提供 ipcMain.handle
// 这是可直接粘贴改造的最小实现。

import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { ipcMain, BrowserWindow } from 'electron';
import * as readline from 'readline';
import * as path from 'path';

type Req = { id: string; cmd: string; params?: any };
type Resp = { id: string; ok: boolean; result?: any; error?: string };
type EventMsg = { event: string; payload: any };

export class PythonPassportShell {
  private proc: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: any }>();

  constructor(opts: { pythonPath?: string; scriptPath?: string; env?: Record<string, string> }) {
    const pythonPath = opts.pythonPath || 'python';
    const scriptPath = opts.scriptPath || path.join(process.cwd(), 'dev', 'shell', 'ipc_stdio_server.py');
    const env = { ...process.env, ...(opts.env || {}) };

    this.proc = spawn(pythonPath, [scriptPath], { env });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => this.onLine(line));

    this.proc.on('exit', (code) => {
      // 失败时 reject 所有 pending
      for (const [id, p] of this.pending.entries()) {
        clearTimeout(p.timer);
        p.reject(new Error(`python shell exited code=${code}, pending id=${id}`));
      }
      this.pending.clear();
    });
  }

  private onLine(line: string) {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg && typeof msg.event === 'string') {
      const e = msg as EventMsg;
      // 广播 sessionStatus
      if (e.event === 'sessionStatus') {
        BrowserWindow.getAllWindows().forEach((win) => win.webContents.send('sessionStatus', e.payload));
      }
      return;
    }

    if (msg && typeof msg.id === 'string') {
      const r = msg as Resp;
      const pending = this.pending.get(r.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(r.id);
      if (r.ok) pending.resolve(r.result);
      else pending.reject(new Error(r.error || 'unknown error'));
    }
  }

  request(cmd: string, params?: any, timeoutMs: number = 5000): Promise<any> {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload: Req = { id, cmd, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${cmd}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(JSON.stringify(payload) + '\n');
    });
  }
}

export function registerPassportIpc(shell: PythonPassportShell) {
  ipcMain.handle('passport:startup', async () => {
    await shell.request('startup', {});
    return { ok: true };
  });
  ipcMain.handle('passport:login', async (_e, args) => {
    await shell.request('login', { phone: args?.phone, code: args?.code });
    return { ok: true };
  });
  ipcMain.handle('passport:refresh', async (_e, args) => {
    const res = await shell.request('refresh', { guid: args?.guid, refresh_token: args?.refresh_token });
    return { ok: true, result: res };
  });
  ipcMain.handle('passport:logout', async (_e, args) => {
    await shell.request('logout', { access_token: args?.access_token });
    return { ok: true };
  });
}
