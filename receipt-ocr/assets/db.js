/* IndexedDB による永続化
   - records : 明細（日付インデックス付き）
   - images  : 明細に紐づくサムネイル／OCR元画像
   - settings: 設定値（key-value）
   localStorage は約5MBで画像が入らないため IndexedDB を使う。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};
  const DB_NAME = 'transport-expense';
  const DB_VER = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) {
          const s = db.createObjectStore('records', { keyPath: 'id' });
          s.createIndex('date', 'date');
          s.createIndex('month', 'month');
          s.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        void ev;
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return open().then(db => db.transaction(store, mode).objectStore(store));
  }
  function done(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* ---------- records ---------- */

  /** 明細を1件保存（月フィールドは date から自動導出） */
  async function putRecord(rec) {
    rec.month = (rec.date || '').slice(0, 7);
    rec.updatedAt = Date.now();
    const store = await tx('records', 'readwrite');
    await done(store.put(rec));
    return rec;
  }

  /** 複数件をまとめて保存（同期・インポート用。updatedAt は保持する） */
  async function putRecordsRaw(list) {
    const store = await tx('records', 'readwrite');
    for (const rec of list) {
      rec.month = (rec.date || '').slice(0, 7);
      store.put(rec);
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve(list.length);
      store.transaction.onerror = () => reject(store.transaction.error);
    });
  }

  /** 削除済み（tombstone）を除いた全明細 */
  async function allRecords() {
    const store = await tx('records', 'readonly');
    const list = await done(store.getAll());
    return list.filter(r => !r.deleted).sort(sortByDateTime);
  }

  /** tombstone を含む全明細（同期用） */
  async function allRecordsRaw() {
    const store = await tx('records', 'readonly');
    return done(store.getAll());
  }

  function sortByDateTime(a, b) {
    const ka = (a.date || '9999-99-99') + (a.time || '99:99');
    const kb = (b.date || '9999-99-99') + (b.time || '99:99');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }

  async function getRecord(id) {
    const store = await tx('records', 'readonly');
    return done(store.get(id));
  }

  /** 論理削除（同期先にも削除を伝えるため tombstone を残す） */
  async function deleteRecord(id) {
    const rec = await getRecord(id);
    if (!rec) return;
    const store = await tx('records', 'readwrite');
    await done(store.put({
      id: rec.id, date: rec.date, month: rec.month,
      deleted: 1, updatedAt: Date.now()
    }));
    await deleteImage(id);
  }

  /** 物理削除（全消去用） */
  async function clearAll() {
    const db = await open();
    const t = db.transaction(['records', 'images'], 'readwrite');
    t.objectStore('records').clear();
    t.objectStore('images').clear();
    return new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }

  /* ---------- images ---------- */

  async function putImage(id, thumb, full) {
    const store = await tx('images', 'readwrite');
    return done(store.put({ id, thumb, full }));
  }
  async function getImage(id) {
    const store = await tx('images', 'readonly');
    return done(store.get(id));
  }
  async function deleteImage(id) {
    const store = await tx('images', 'readwrite');
    return done(store.delete(id));
  }
  async function allImages() {
    const store = await tx('images', 'readonly');
    return done(store.getAll());
  }

  /* ---------- settings ---------- */

  async function getSetting(key, fallback) {
    try {
      const store = await tx('settings', 'readonly');
      const v = await done(store.get(key));
      return v === undefined ? fallback : v;
    } catch (e) { return fallback; }
  }
  async function setSetting(key, value) {
    const store = await tx('settings', 'readwrite');
    return done(store.put(value, key));
  }

  /** 概算の使用容量（ブラウザが対応していれば） */
  async function usage() {
    if (navigator.storage && navigator.storage.estimate) {
      try { return await navigator.storage.estimate(); } catch (e) { /* noop */ }
    }
    return null;
  }

  App.db = {
    open, putRecord, putRecordsRaw, allRecords, allRecordsRaw, getRecord,
    deleteRecord, clearAll, putImage, getImage, deleteImage, allImages,
    getSetting, setSetting, usage, sortByDateTime
  };
})(window);
