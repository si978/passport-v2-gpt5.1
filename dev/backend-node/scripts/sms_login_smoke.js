/* eslint-disable no-console */
// 真实短信网关验收脚本（需要后端已启动，且已配置 SMS_GATEWAY_URL 或阿里云环境变量）。
//
// 用法：
//   node dev/backend-node/scripts/sms_login_smoke.js
//
// 环境变量：
//   PASSPORT_BACKEND_BASE_URL=http://127.0.0.1:3000   （生产形态通常为 http://127.0.0.1:8080）
//   PASSPORT_APP_ID=jiuweihu
//   TEST_PHONE=13800138000
//   TEST_CODE=123456   （可选，不填则交互输入）

const readline = require('readline');
const http = require('http');
const https = require('https');

const ask = (q) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (ans) => {
      rl.close();
      resolve(String(ans || '').trim());
    });
  });

const postJson = (url, body, extraHeaders) =>
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
          ...(extraHeaders || {}),
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

async function main() {
  const baseUrl = process.env.PASSPORT_BACKEND_BASE_URL || 'http://127.0.0.1:3000';
  const appId = process.env.PASSPORT_APP_ID || 'jiuweihu';

  const phone = process.env.TEST_PHONE || (await ask('手机号: '));
  if (!phone) throw new Error('phone required');

  console.log(`POST ${baseUrl}/api/passport/send-code`);
  const sendRes = await postJson(`${baseUrl}/api/passport/send-code`, { phone });
  console.log('send-code status=', sendRes.statusCode, 'body=', sendRes.body);
  if (sendRes.statusCode >= 400) process.exit(1);

  const code = process.env.TEST_CODE || (await ask('短信验证码: '));
  if (!code) throw new Error('code required');

  console.log(`POST ${baseUrl}/api/passport/login-by-phone`);
  const loginRes = await postJson(`${baseUrl}/api/passport/login-by-phone`, { phone, code, app_id: appId });
  console.log('login status=', loginRes.statusCode);
  console.log('login body=', loginRes.body);
  if (loginRes.statusCode >= 400) process.exit(1);

  const login = loginRes.body || {};
  if (!login.guid || !login.access_token || !login.refresh_token) {
    console.error('login response missing tokens');
    process.exit(1);
  }

  console.log(`POST ${baseUrl}/api/passport/verify-token`);
  const verifyRes = await postJson(`${baseUrl}/api/passport/verify-token`, {
    access_token: login.access_token,
    app_id: appId,
  });
  console.log('verify-token status=', verifyRes.statusCode, 'body=', verifyRes.body);
  if (verifyRes.statusCode >= 400 || !verifyRes.body?.guid) process.exit(1);

  console.log(`POST ${baseUrl}/api/passport/refresh-token`);
  const refreshRes = await postJson(`${baseUrl}/api/passport/refresh-token`, {
    guid: login.guid,
    refresh_token: login.refresh_token,
    app_id: appId,
  });
  console.log('refresh-token status=', refreshRes.statusCode);
  if (refreshRes.statusCode >= 400 || !refreshRes.body?.access_token) process.exit(1);

  console.log(`POST ${baseUrl}/api/passport/logout`);
  const logoutRes = await postJson(
    `${baseUrl}/api/passport/logout`,
    {},
    { Authorization: `Bearer ${refreshRes.body.access_token}` },
  );
  console.log('logout status=', logoutRes.statusCode, 'body=', logoutRes.body);
  if (logoutRes.statusCode >= 400 || !logoutRes.body?.success) process.exit(1);

  console.log(`SMOKE OK: guid=${login.guid} app_id=${appId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
