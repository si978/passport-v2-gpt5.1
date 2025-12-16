/* eslint-disable no-console */
// Node 演示脚本：spawn Python 壳层（stdio JSON 协议）并跑一轮 startup/login/get_session/refresh/logout。
//
// 默认会启动 stub 后端（dev/shell/stub_backend.py），无需真实后端即可验收壳层 IPC 链路。
//
// 用法：
//   node dev/shell/ipc_stdio_demo.js
//
// 可选环境变量：
//   PASSPORT_BASE_URL=http://127.0.0.1:8090           （stub 默认）
//   PASSPORT_BASE_URL=http://127.0.0.1:8080/api       （真实后端推荐；若不含 /api，会自动补齐）
//   PASSPORT_APP_ID=jiuweihu
//   PYTHON=python
//   START_STUB_BACKEND=1
//   TEST_PHONE=13800138000
//   TEST_CODE=123456                                   （可选；真实后端不建议预置，除非你已拿到短信验证码）
//   CONFIRM_SMS_SEND=1                                 （可选；真实后端下自动发送验证码前跳过确认）

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });

const httpGet = (url) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ''),
        method: 'GET',
        headers: { Connection: 'close' },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ statusCode: res.statusCode || 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });

const httpPostJson = (url, body) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const data = Buffer.from(JSON.stringify(body || {}), 'utf8');
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + (u.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(data.length),
          Connection: 'close',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = raw;
          }
          resolve({ statusCode: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });

async function waitForHealth(baseUrl, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await httpGet(`${baseUrl}/health`);
      if (res.statusCode === 200) return;
    } catch {
      // ignore
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  throw new Error(`stub backend not ready: ${baseUrl}`);
}

class PythonShellClient {
  constructor(opts) {
    this.proc = opts.proc;
    this.pending = new Map();
    this.handlers = new Set();

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on('line', (line) => this.onLine(line));
  }

  onSessionStatus(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg && typeof msg.event === 'string') {
      if (msg.event === 'sessionStatus') {
        for (const h of this.handlers) h(msg.payload);
      }
      return;
    }

    if (msg && typeof msg.id === 'string') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result || {});
      else p.reject(new Error(msg.error || 'unknown error'));
    }
  }

  request(cmd, params, timeoutMs = 5000) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const payload = { id, cmd, params: params || {} };

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

const stripTrailingSlash = (s) => String(s || '').replace(/\/+$/, '');
const ensureApiSuffix = (baseUrl) => {
  const trimmed = stripTrailingSlash(baseUrl);
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
};

async function main() {
  const startStub = (process.env.START_STUB_BACKEND || '1') !== '0';

  const baseUrlRaw =
    process.env.PASSPORT_BASE_URL || (startStub ? 'http://127.0.0.1:8090' : 'http://127.0.0.1:8080');
  const baseUrl = startStub ? stripTrailingSlash(baseUrlRaw) : ensureApiSuffix(baseUrlRaw);

  const appId = process.env.PASSPORT_APP_ID || 'jiuweihu';
  const python = process.env.PYTHON || 'python';

  const u = new URL(baseUrl);
  const host = u.hostname || '127.0.0.1';
  const port = Number(u.port || '8090');

  let stubProc = null;
  if (startStub) {
    const stubPath = path.join(__dirname, 'stub_backend.py');
    stubProc = spawn(python, [stubPath, '--host', host, '--port', String(port)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await waitForHealth(baseUrl, 5000);
  }

  const ipcPath = path.join(__dirname, 'ipc_stdio_server.py');
  const sessionPath = process.env.PASSPORT_SESSION_PATH || path.join(os.tmpdir(), `passport-session-demo-${port}.dat`);
  const shellProc = spawn(python, [ipcPath], {
    env: { ...process.env, PASSPORT_BASE_URL: baseUrl, PASSPORT_APP_ID: appId, PASSPORT_SESSION_PATH: sessionPath },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  const client = new PythonShellClient({ proc: shellProc });
  client.onSessionStatus((payload) => console.log('[sessionStatus]', payload));

  const cleanup = () => {
    try {
      shellProc.kill();
    } catch {
      // ignore
    }
    try {
      if (stubProc) stubProc.kill();
    } catch {
      // ignore
    }
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('exit', cleanup);

  await client.request('startup');

  const phone = process.env.TEST_PHONE || (startStub ? '13800138000' : await ask('手机号: '));
  if (!phone) throw new Error('phone required');

  let code = process.env.TEST_CODE;
  if (!code) {
    if (startStub) {
      code = '123456';
    } else {
      const confirmed =
        process.env.CONFIRM_SMS_SEND === '1' ||
        /^y(es)?$/i.test(await ask(`将向 ${phone} 发送真实短信验证码，继续？(y/N): `));
      if (!confirmed) {
        throw new Error('aborted by user');
      }

      console.log(`POST ${baseUrl}/passport/send-code`);
      const sendRes = await httpPostJson(`${baseUrl}/passport/send-code`, { phone });
      console.log('send-code status=', sendRes.statusCode, 'body=', sendRes.body);
      if (sendRes.statusCode >= 400) {
        throw new Error(`send-code failed: ${JSON.stringify(sendRes.body)}`);
      }

      code = await ask('短信验证码: ');
    }
  }
  if (!code) throw new Error('code required');

  await client.request('login', { phone, code });

  const sessRes = await client.request('get_session');
  const session = sessRes.session;
  if (!session) {
    throw new Error('get_session returned empty session');
  }
  console.log('[session]', session);

  await client.request('refresh', { guid: session.guid, refresh_token: session.refresh_token });
  await client.request('logout', {});

  cleanup();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
