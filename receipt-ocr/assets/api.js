/* サーバー通信（PHP + MySQL）
   通信の中身だけを担当し、マージ処理は sync.js が行う。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};

  const DEFAULT_BASE = 'api/';

  let config = { enabled: false, baseUrl: DEFAULT_BASE, token: '', shareImages: true };

  function configure(next) {
    config = Object.assign({}, config, next || {});
    if (!config.baseUrl) config.baseUrl = DEFAULT_BASE;
    if (!/\/$/.test(config.baseUrl)) config.baseUrl += '/';
    return config;
  }
  function current() { return Object.assign({}, config); }

  function headers() {
    const h = { 'content-type': 'application/json' };
    if (config.token) h['X-Access-Token'] = config.token;
    return h;
  }

  /** 共通のPOST。サーバーが返すエラーメッセージをそのまま画面に出せるようにする */
  async function post(path, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
    let res;
    try {
      res = await fetch(config.baseUrl + path, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body || {}),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch (err) {
      throw new Error(err.name === 'AbortError'
        ? 'サーバーの応答がありません（通信状況をご確認ください）'
        : 'サーバーに接続できませんでした（オフラインの可能性があります）');
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* HTMLのエラーページなど */ }

    if (!res.ok || !json || json.ok === false) {
      const detail = (json && json.error) || text.slice(0, 200).replace(/<[^>]*>/g, ' ').trim();
      if (res.status === 401) throw new Error('合言葉が違うか、ログインが切れています。設定をご確認ください。');
      if (res.status === 404) throw new Error(`APIが見つかりません（${config.baseUrl}${path}）。設置先のURLをご確認ください。`);
      throw new Error(detail || `サーバーエラー (HTTP ${res.status})`);
    }
    return json;
  }

  /**
   * 送信と受信を1往復で行う。
   * @param {number} since 前回受け取った同期カーソル
   * @param {Array} records 送信する明細（tombstone含む）
   */
  function syncRecords(since, records, limit) {
    return post('records.php', {
      since: Number(since) || 0,
      records: records || [],
      limit: limit || 500,
    });
  }

  /** レシート画像をアップロード */
  function uploadImage(id, thumb, full) {
    return post('image.php', { id, thumb, full }, 60000);
  }

  /** サーバー上の画像URL（Basic認証配下の静的ファイルを直接参照する） */
  function imageUrl(id, kind) {
    if (!id || id.length < 2) return '';
    const suffix = kind === 'full' ? '.jpg' : '_t.jpg';
    return `${config.baseUrl}uploads/${id.slice(0, 2)}/${id}${suffix}`;
  }

  /** 疎通確認（0件の送受信をしてみる） */
  async function ping() {
    const res = await syncRecords(0, [], 1);
    return { total: res.total, serverSeq: res.serverSeq };
  }

  App.api = { configure, current, syncRecords, uploadImage, imageUrl, ping, DEFAULT_BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.api;
})(typeof window !== 'undefined' ? window : globalThis);
