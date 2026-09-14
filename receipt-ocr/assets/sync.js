/* 端末間同期
   元の実装は「サーバー側のデータを丸ごと上書き」していたため、
   PCとスマホで別々に追加すると片方が消えることがあった。
   ここでは id 単位・updatedAt の新しい方を採用してマージする。
   削除は tombstone（deleted:1）で伝える。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};

  const ENDPOINT = 'api/sync.php';

  /** 2つの明細リストを id 単位でマージ（updatedAt の新しい方を採用） */
  function merge(a, b) {
    const map = new Map();
    for (const rec of [].concat(a || [], b || [])) {
      if (!rec || !rec.id) continue;
      const prev = map.get(rec.id);
      if (!prev || Number(rec.updatedAt || 0) > Number(prev.updatedAt || 0)) map.set(rec.id, rec);
    }
    return [...map.values()];
  }

  /** 同期対象のフィールドだけに絞る（画像やOCR全文は送らない） */
  function slim(rec) {
    return {
      id: rec.id,
      date: rec.date || '',
      time: rec.time || '',
      type: rec.type || '',
      name: rec.name || '',
      amount: Number(rec.amount) || 0,
      note: rec.note || '',
      source: rec.source || '',
      confidence: rec.confidence || null,
      deleted: rec.deleted ? 1 : 0,
      updatedAt: Number(rec.updatedAt) || Date.now(),
    };
  }

  function validKey(key) { return /^[A-Za-z0-9_-]{6,40}$/.test(key || ''); }

  /**
   * サーバーとマージ同期する。
   * @param {string} workspace 共有キー
   * @param {Array} localRecords tombstone を含むローカル全件
   * @returns {Promise<Array>} マージ後の全件
   */
  async function sync(workspace, localRecords) {
    if (!validKey(workspace)) {
      throw new Error('共有キーは半角英数字・ハイフン・アンダースコアで6〜40文字にしてください');
    }
    const payload = { workspace, records: (localRecords || []).map(slim) };
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`同期に失敗しました (HTTP ${res.status}) ${body.slice(0, 160)}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return Array.isArray(json.records) ? json.records : [];
  }

  App.sync = { sync, merge, slim, validKey, ENDPOINT };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.sync;
})(typeof window !== 'undefined' ? window : globalThis);
