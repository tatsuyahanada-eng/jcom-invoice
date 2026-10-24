// Service worker: caches the app shell so the UI (and local extraction /
// file management) opens offline. API calls always go to the network.
const VERSION = 'appup-ftp-v4';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-192.png',
  'js/app.js', 'js/platform/web.js', 'js/vault.js', 'js/relay.js', 'js/localfs.js', 'js/opfs-writer.js',
  'js/archive/index.js', 'js/archive/zip.js', 'js/archive/lzh.js', 'js/archive/util.js',
  'vendor/libarchive/libarchive.js', 'vendor/libarchive/worker-bundle.js', 'vendor/libarchive/libarchive.wasm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  // network first (always get updates when the relay is reachable), cache fallback
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
