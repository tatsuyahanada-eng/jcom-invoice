// Integration test: relay server <-> local ftp-srv instance.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { FtpSrv } from 'ftp-srv';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = 'test-token-0123456789abcdef';
const FTP_PORT = 2121 + Math.floor(Math.random() * 500);
const RELAY_PORT = 18790 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${RELAY_PORT}`;
let root, ftp, ftps, relay, sid;
const FTPS_PORT = FTP_PORT + 600;
const quiet = { child() { return this; }, info() {}, error() {}, debug() {}, trace() {}, warn() {}, fatal() {} };

const call = async (name, body, token = TOKEN) => {
  const r = await fetch(`${BASE}/api/${name}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
};

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ftproot-'));
  fs.writeFileSync(path.join(root, 'hello.txt'), 'hello');
  ftp = new FtpSrv({ url: `ftp://127.0.0.1:${FTP_PORT}`, pasv_url: '127.0.0.1', pasv_min: 30000, pasv_max: 30100, anonymous: false, log: quiet });
  ftp.on('login', ({ username, password }, resolve, reject) =>
    username === 'u' && password === 'p' ? resolve({ root }) : reject(new Error('bad login')));
  ftp.on('client-error', () => {});
  await ftp.listen();
  // explicit FTPS server with a self-signed certificate
  const key = path.join(root, '..', `k-${FTPS_PORT}.pem`), cert = path.join(root, '..', `c-${FTPS_PORT}.pem`);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  ftps = new FtpSrv({ url: `ftp://127.0.0.1:${FTPS_PORT}`, pasv_url: '127.0.0.1', pasv_min: 30200, pasv_max: 30300, log: quiet,
    tls: { key: fs.readFileSync(key), cert: fs.readFileSync(cert) } });
  ftps.on('login', (_d, resolve) => resolve({ root }));
  ftps.on('client-error', () => {});
  await ftps.listen();
  fs.rmSync(key); fs.rmSync(cert);
  relay = spawn(process.execPath, [path.join(here, '../server.js')], {
    env: { ...process.env, RELAY_TOKEN: TOKEN, PORT: String(RELAY_PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res) => relay.stdout.on('data', (d) => String(d).includes('relay:') && res()));
});

after(async () => { relay?.kill(); await ftp?.close(); await ftps?.close(); fs.rmSync(root, { recursive: true, force: true }); });

test('rejects wrong token', async () => {
  const r = await call('connect', {}, 'nope-nope-nope-nope');
  assert.equal(r.status, 401);
});

test('connect + list', async () => {
  const bad = await call('connect', { host: '127.0.0.1', port: FTP_PORT, user: 'u', password: 'x', secure: 'none' });
  assert.equal(bad.status, 502);
  const r = await call('connect', { host: '127.0.0.1', port: FTP_PORT, user: 'u', password: 'p', secure: 'none' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  sid = r.body.sid;
  const l = await call('list', { sid, path: '/' });
  assert.deepEqual(l.body.items.map((i) => i.name), ['hello.txt']);
});

test('upload into new nested dir, download, rename, delete', async () => {
  const data = Buffer.from('日本語データ'.repeat(1000));
  const up = await fetch(`${BASE}/api/upload?sid=${sid}&path=${encodeURIComponent('/site/assets/日本語.txt')}`, {
    method: 'PUT', headers: { authorization: `Bearer ${TOKEN}` }, body: data,
  });
  assert.equal(up.status, 200, await up.clone().text());
  assert.deepEqual(fs.readFileSync(path.join(root, 'site/assets/日本語.txt')), data);

  const dl = await fetch(`${BASE}/api/download`, {
    method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ sid, path: '/site/assets/日本語.txt' }),
  });
  assert.deepEqual(Buffer.from(await dl.arrayBuffer()), data);

  assert.equal((await call('mkdir', { sid, path: '/site/empty' })).status, 200);
  assert.ok(fs.statSync(path.join(root, 'site/empty')).isDirectory());

  assert.equal((await call('rename', { sid, from: '/hello.txt', to: '/site/hello2.txt' })).status, 200);
  assert.ok(fs.existsSync(path.join(root, 'site/hello2.txt')));

  assert.equal((await call('delete', { sid, path: '/site', dir: true })).status, 200);
  assert.ok(!fs.existsSync(path.join(root, 'site')));
});

test('FTPS: rejects self-signed cert by default, works when allowed', async () => {
  const strict = await call('connect', { host: '127.0.0.1', port: FTPS_PORT, user: 'u', password: 'p', secure: 'explicit' });
  assert.equal(strict.status, 502);
  const ok = await call('connect', { host: '127.0.0.1', port: FTPS_PORT, user: 'u', password: 'p', secure: 'explicit', insecureTls: true });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const l = await call('list', { sid: ok.body.sid, path: '/' });
  assert.equal(l.status, 200);
  await call('disconnect', { sid: ok.body.sid });
});

test('blocks FTP command injection in paths', async () => {
  const r = await call('list', { sid, path: '/x\r\nDELE hello.txt' });
  assert.equal(r.status, 400);
  const r2 = await call('list', { sid, path: 'relative' });
  assert.equal(r2.status, 400);
});

test('blocks cross-site requests and static path traversal', async () => {
  const r = await fetch(`${BASE}/api/list`, { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', authorization: `Bearer ${TOKEN}` }, body: '{}' });
  assert.equal(r.status, 403);
  const t = await fetch(`${BASE}/..%2fserver%2fserver.js`);
  assert.ok(t.status === 403 || t.status === 404);
  const home = await fetch(`${BASE}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
});

test('disconnect invalidates session', async () => {
  await call('disconnect', { sid });
  const r = await call('list', { sid, path: '/' });
  assert.equal(r.status, 440);
});
