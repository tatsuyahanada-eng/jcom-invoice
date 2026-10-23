// FTP relay server for the APP UP FTP Manager PWA.
// Browsers cannot speak FTP, so this small server does it on their behalf.
// Run it on your own PC / home server only. See ../README.md.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const cfg = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 8790),
  tlsCert: process.env.TLS_CERT,
  tlsKey: process.env.TLS_KEY,
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 2048) * 1024 * 1024,
  allowPlainFtp: process.env.ALLOW_PLAIN_FTP !== '0',
  // Optional comma-separated list of FTP hosts this relay may connect to.
  hostAllowlist: (process.env.FTP_HOST_ALLOWLIST || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionIdleMs: 15 * 60 * 1000,
  maxSessions: 20,
};

// ---- access token -------------------------------------------------------
const TOKEN_FILE = path.join(__dirname, '.relay-token');
function loadToken() {
  if (process.env.RELAY_TOKEN) return process.env.RELAY_TOKEN;
  if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  const t = crypto.randomBytes(24).toString('base64url');
  fs.writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 });
  return t;
}
const TOKEN = loadToken();
if (TOKEN.length < 16) {
  console.error('RELAY_TOKEN は16文字以上にしてください');
  process.exit(1);
}
const tokenBuf = Buffer.from(TOKEN);

const failures = new Map(); // ip -> { count, until }
function checkAuth(req) {
  const ip = req.socket.remoteAddress || '?';
  const f = failures.get(ip);
  if (f && f.count >= 10 && Date.now() < f.until) return { ok: false, status: 429 };
  const h = req.headers.authorization || '';
  const given = Buffer.from(h.startsWith('Bearer ') ? h.slice(7) : '');
  const ok = given.length === tokenBuf.length && crypto.timingSafeEqual(given, tokenBuf);
  if (!ok) {
    const n = f && Date.now() < f.until ? f.count + 1 : 1;
    failures.set(ip, { count: n, until: Date.now() + 10 * 60 * 1000 });
    return { ok: false, status: 401 };
  }
  failures.delete(ip);
  return { ok: true };
}

// ---- FTP sessions -------------------------------------------------------
const sessions = new Map(); // sid -> { client, queue, lastUsed }

function run(sess, fn) {
  sess.lastUsed = Date.now();
  const p = sess.queue.then(() => fn(sess.client));
  sess.queue = p.catch(() => {});
  return p;
}

function closeSession(sid) {
  const s = sessions.get(sid);
  if (s) { s.client.close(); sessions.delete(sid); }
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) if (now - s.lastUsed > cfg.sessionIdleMs) closeSession(sid);
}, 60 * 1000).unref();

function getSession(sid) {
  const s = typeof sid === 'string' && sessions.get(sid);
  if (!s) throw httpError(440, '接続が切れました。再接続してください');
  if (s.client.closed) { sessions.delete(sid); throw httpError(440, '接続が切れました。再接続してください'); }
  return s;
}

// Reject CR/LF/NUL so a path can never inject extra FTP commands.
function cleanPath(p) {
  if (typeof p !== 'string' || !p.startsWith('/') || /[\r\n\0]/.test(p) || p.length > 4096) {
    throw httpError(400, '不正なパスです');
  }
  return path.posix.normalize(p);
}

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw httpError(413, 'リクエストが大きすぎます'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw httpError(400, 'JSON が不正です'); }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

const api = {
  async connect(req, res) {
    const b = await readJson(req);
    const host = String(b.host || '').trim();
    if (!host || /[\s/]/.test(host)) throw httpError(400, 'ホスト名が不正です');
    if (cfg.hostAllowlist.length && !cfg.hostAllowlist.includes(host.toLowerCase())) {
      throw httpError(403, 'このホストへの接続は許可されていません (FTP_HOST_ALLOWLIST)');
    }
    const secureMode = ['explicit', 'implicit', 'none'].includes(b.secure) ? b.secure : 'explicit';
    if (secureMode === 'none' && !cfg.allowPlainFtp) throw httpError(403, '暗号化なし FTP はサーバ設定で禁止されています');
    if (sessions.size >= cfg.maxSessions) throw httpError(503, '接続数が上限です');
    const client = new Client(30000);
    try {
      await client.access({
        host,
        port: Number(b.port) || (secureMode === 'implicit' ? 990 : 21),
        user: String(b.user || 'anonymous'),
        password: String(b.password || ''),
        secure: secureMode === 'none' ? false : secureMode === 'implicit' ? 'implicit' : true,
        secureOptions: { rejectUnauthorized: !b.insecureTls, servername: host },
      });
    } catch (e) {
      client.close();
      throw httpError(502, `FTP 接続失敗: ${e.message}`);
    }
    const sid = crypto.randomBytes(18).toString('base64url');
    sessions.set(sid, { client, queue: Promise.resolve(), lastUsed: Date.now() });
    const pwd = await client.pwd().catch(() => '/');
    sendJson(res, 200, { sid, pwd, secure: secureMode });
  },

  async disconnect(req, res) {
    const b = await readJson(req);
    closeSession(b.sid);
    sendJson(res, 200, { ok: true });
  },

  async list(req, res) {
    const b = await readJson(req);
    const s = getSession(b.sid);
    const p = cleanPath(b.path || '/');
    const items = await run(s, async (c) => { await c.cd(p); return c.list(); });
    sendJson(res, 200, {
      path: p,
      items: items.filter((i) => i.name !== '.' && i.name !== '..').map((i) => ({
        name: i.name,
        type: i.isDirectory ? 'dir' : i.isSymbolicLink ? 'link' : 'file',
        size: i.size,
        mtime: i.modifiedAt ? i.modifiedAt.getTime() : (i.rawModifiedAt || null),
      })),
    });
  },

  async mkdir(req, res) {
    const b = await readJson(req);
    const s = getSession(b.sid);
    const p = cleanPath(b.path);
    await run(s, async (c) => { await c.ensureDir(p); await c.cd('/'); });
    sendJson(res, 200, { ok: true });
  },

  async delete(req, res) {
    const b = await readJson(req);
    const s = getSession(b.sid);
    const p = cleanPath(b.path);
    if (p === '/') throw httpError(400, 'ルートは削除できません');
    await run(s, (c) => (b.dir ? c.removeDir(p) : c.remove(p)));
    sendJson(res, 200, { ok: true });
  },

  async rename(req, res) {
    const b = await readJson(req);
    const s = getSession(b.sid);
    await run(s, (c) => c.rename(cleanPath(b.from), cleanPath(b.to)));
    sendJson(res, 200, { ok: true });
  },

  async upload(req, res, url) {
    const s = getSession(url.searchParams.get('sid'));
    const p = cleanPath(url.searchParams.get('path'));
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > cfg.maxUploadBytes) throw httpError(413, 'ファイルが大きすぎます');
    let seen = 0;
    const limiter = new Transform({
      transform(chunk, _e, cb) {
        seen += chunk.length;
        if (seen > cfg.maxUploadBytes) cb(httpError(413, 'ファイルが大きすぎます')); else cb(null, chunk);
      },
    });
    req.pipe(limiter);
    await run(s, async (c) => {
      await c.ensureDir(path.posix.dirname(p));
      await c.uploadFrom(limiter, path.posix.basename(p));
      await c.cd('/');
    });
    sendJson(res, 200, { ok: true, bytes: seen });
  },

  async download(req, res) {
    const b = await readJson(req);
    const s = getSession(b.sid);
    const p = cleanPath(b.path);
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
    await run(s, (c) => c.downloadTo(res, p));
    res.end();
  },
};

// ---- static files -------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.ico': 'image/x-icon',
};

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403).end(); return; }
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  await pipeline(fs.createReadStream(file), res);
}

// ---- server -------------------------------------------------------------
const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

async function handler(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (cfg.tlsCert) res.setHeader('strict-transport-security', 'max-age=31536000');
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      // Same-origin only: reject cross-site requests outright.
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') throw httpError(403, 'cross-site request blocked');
      const name = url.pathname.slice(5);
      if (name === 'ping' && req.method === 'GET') {
        const a = checkAuth(req);
        return sendJson(res, a.ok ? 200 : a.status, { ok: a.ok, allowPlainFtp: cfg.allowPlainFtp });
      }
      const a = checkAuth(req);
      if (!a.ok) throw httpError(a.status, a.status === 429 ? '試行回数が多すぎます。しばらく待ってください' : 'アクセストークンが違います');
      const fn = Object.hasOwn(api, name) && api[name];
      const method = name === 'upload' ? 'PUT' : 'POST';
      if (!fn || req.method !== method) throw httpError(404, 'not found');
      await fn(req, res, url);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      await serveStatic(req, res, url);
    } else {
      res.writeHead(405).end();
    }
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(new Date().toISOString(), url.pathname, e.message);
    if (!res.headersSent) sendJson(res, status, { error: e.message || 'error' });
    else res.destroy();
  }
}

const server = cfg.tlsCert && cfg.tlsKey
  ? https.createServer({ cert: fs.readFileSync(cfg.tlsCert), key: fs.readFileSync(cfg.tlsKey) }, handler)
  : http.createServer(handler);
server.requestTimeout = 0; // large uploads
server.listen(cfg.port, cfg.host, () => {
  const proto = cfg.tlsCert ? 'https' : 'http';
  console.log(`APP UP FTP Manager relay: ${proto}://${cfg.host}:${cfg.port}/`);
  console.log(`アクセストークン: ${TOKEN}`);
  if (cfg.host !== '127.0.0.1' && cfg.host !== 'localhost' && !cfg.tlsCert) {
    console.warn('警告: 外部公開しているのに HTTPS ではありません。TLS_CERT/TLS_KEY を設定するか、Tailscale 等の VPN 内で使ってください。');
  }
});
