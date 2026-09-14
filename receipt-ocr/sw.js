/* Service Worker
   元の実装は全リクエストが cache-first だったため、index.html を修正しても
   端末には古い画面が出続けていた（「直したのに反映されない」原因）。
   ここではアプリ本体をネットワーク優先、CDNのライブラリのみキャッシュ優先にする。 */
const VERSION = 'v1.0.0';
const SHELL_CACHE = `transport-expense-shell-${VERSION}`;
const LIB_CACHE = 'transport-expense-lib';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css',
  './assets/util.js',
  './assets/db.js',
  './assets/image.js',
  './assets/parse.js',
  './assets/ocr.js',
  './assets/export.js',
  './assets/sync.js',
  './assets/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[sw] precache失敗', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL_CACHE && k !== LIB_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // 同期のPOSTなどは素通し

  const url = new URL(req.url);

  // 同期・AIプロキシは常にネットワーク
  if (url.pathname.endsWith('/sync.php') || url.pathname.endsWith('/ai-proxy.php')) return;

  // 外部CDN（バージョン固定URL）はキャッシュ優先
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.open(LIB_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => fetch(req))
    );
    return;
  }

  // アプリ本体はネットワーク優先（オフライン時のみキャッシュ）
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('オフラインです', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      })
  );
});
