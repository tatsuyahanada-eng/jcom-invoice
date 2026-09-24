// スマホ移行Check Tool — サービスワーカー
// アプリ本体一式をキャッシュし、オフラインでも起動・閲覧できるようにする。
// キャッシュ名のバージョンを上げると、次回アクセス時に新しいキャッシュへ切り替わる。
const CACHE_NAME = "sim-lock-check-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./data.js",
  "./vendor/qrcode.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
  "./icons/favicon.ico"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// ネットワーク優先：オンライン時は常に最新を取得してキャッシュを更新し、
// オフライン時だけキャッシュから返す（更新をアップロードすると次回起動で反映される）。
// 同一オリジンのGETのみ対象（外部リクエストやPOST等はそのままネットワークへ）。
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
  );
});
