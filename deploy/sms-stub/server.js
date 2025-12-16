/* eslint-disable no-console */
// deploy/sms-stub: 本机/CI 验收用短信 stub
// - POST /send: 接收 { phone, code }，存入内存
// - GET  /last?phone=...: 取回最后一次验证码
// - GET  /health: 健康检查

const http = require('http');

const port = Number(process.env.PORT || '18080');

/** @type {Map<string, { code: string, at: string }>} */
const lastByPhone = new Map();

function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method === 'POST' && (url.pathname === '/send' || url.pathname === '/')) {
    const raw = await readBody(req);
    let json;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJson(res, 400, { ok: false, error: 'invalid_json' });
    }

    const phone = String(json.phone || '').trim();
    const code = String(json.code || '').trim();
    if (!phone || !code) {
      return sendJson(res, 400, { ok: false, error: 'phone_and_code_required' });
    }

    lastByPhone.set(phone, { code, at: new Date().toISOString() });
    console.log(`[sms-stub] received phone=${maskPhone(phone)}`);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/last') {
    const phone = String(url.searchParams.get('phone') || '').trim();
    if (!phone) return sendJson(res, 400, { ok: false, error: 'phone_required' });
    const rec = lastByPhone.get(phone);
    if (!rec) return sendJson(res, 404, { ok: false, error: 'not_found' });
    return sendJson(res, 200, { ok: true, phone, code: rec.code, at: rec.at });
  }

  return sendJson(res, 404, { ok: false, error: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[sms-stub] listening on ${port}`);
});

