'use strict';

/* =========================================================
 * Account Manager（アカウントマネージャー）
 *
 * 【保存の仕組み】
 * - データはサーバー（api.php）に保存し、どの端末からでも同じ内容を表示
 * - ただし保存するのは、この端末で暗号化したものだけ（サーバーは中身を読めない）
 *   データ鍵(AES-256-GCM)を、パスワードから PBKDF2 で作った鍵で包んでサーバーに保管
 * - ログインは「ユーザー名＋パスワード」と「暗証番号」の二重チェック
 *   パスワード自体は送らず、パスワードから作った認証鍵だけをサーバーに送る
 *
 * 【消えないための対策】
 * - 保存ごとに直前の状態をサーバー上の「復元ポイント」に最大50件保持
 * - 削除したアカウントはゴミ箱へ（TRASH_DAYS 日間は復元可）
 * - 別の端末と同時に保存した場合は検知し、最新を読み直して変更をやり直す
 * - 暗号化バックアップ（添付ファイル込み）の書き出し・読み込み、未バックアップ時の通知
 * ========================================================= */

const DB_NAME = 'account-manager';
const PREFS_KEY = 'am.prefs';
const KDF_ITER = 600000;
const CATEGORIES = ['個人用', '仕事用', 'その他'];
const OLD_PW_DAYS = 180;
const CLIPBOARD_CLEAR_SEC = 30;
const TRASH_DAYS = 30;
const MAX_FILE_MB = 25;
const BACKUP_REMIND_DAYS = 7;

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const dec = new TextDecoder();

let dek = null;        // データ鍵 CryptoKey（ロック中は null）
let header = null;     // { iter, salt, wkIv, wk }：鍵の保護情報
let rev = 0;           // 保存リビジョン（同時編集の検知用）
let vault = null;      // { entries: [], trash: [] }（ロック中は null）
let filterCat = 'すべて';
let currentId = null;  // 編集中のID
let openId = null;     // 一覧で開いているカード
let editAtts = [];     // 編集中：保持する既存添付
let pendingFiles = []; // 編集中：これから追加するファイル
let lastActivity = Date.now();
let prefs = loadPrefs();
const liveUrls = new Set();

/* ---------- 汎用 ---------- */
function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;   // CSSOM経由（CSPでも可）
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function fmtDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function daysSince(ts) { return Math.floor((Date.now() - ts) / 86400000); }
function uid() { return b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, ''); }
function toast(msg, ms = 2200) {
  const t = $('#toast');
  // モーダル表示中は最前面のダイアログ内に移す（裏に隠れて見えなくなるのを防ぐ）
  const top = [...document.querySelectorAll('dialog[open]')].pop();
  const host = top || document.body;
  if (t.parentNode !== host) host.append(t);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function loadPrefs() {
  const def = { autoLockMin: 5, sort: 'updated', lastBackupAt: 0, lastChangeAt: 0 };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
  catch { return def; }
}
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* 無視 */ } }
function makeUrl(blob) { const u = URL.createObjectURL(blob); liveUrls.add(u); return u; }
function dropUrl(u) { if (u) { URL.revokeObjectURL(u); liveUrls.delete(u); } }
function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = h('a', { href: u, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
/** ファイル種別ラベル（IMG / PDF / 拡張子） */
function fileIcon(type, name = '') {
  if ((type || '').startsWith('image/')) return h('span', { class: 'ftype img' }, 'IMG');
  if (type === 'application/pdf') return h('span', { class: 'ftype pdf' }, 'PDF');
  const ext = (name.split('.').pop() || '').slice(0, 4).toUpperCase();
  return h('span', { class: 'ftype' }, ext && ext !== name.toUpperCase() ? ext : 'FILE');
}
/** 線画アイコン */
const ICONS = {
  chevron: 'M9 6l6 6-6 6',
  clip: 'M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9',
  close: 'M6 6l12 12M18 6L6 18',
};
function icon(name) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'ico');
  svg.setAttribute('aria-hidden', 'true');
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

/* ---------- IndexedDB（添付ファイルのキャッシュ／旧版データの読み出し用） ---------- */
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const s of ['meta', 'files']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'sid', autoIncrement: true });
        if (!d.objectStoreNames.contains('fcache')) d.createObjectStore('fcache');
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => { r.result.close(); dbPromise = null; };
        resolve(r.result);
      };
      r.onerror = () => { dbPromise = null; reject(r.error); };
      r.onblocked = () => toast('他のタブを閉じてから再度開いてください');
    });
  }
  return dbPromise;
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error || new Error('aborted'));
});
async function idb(store, mode, fn) {
  const tx = (await db()).transaction(store, mode);
  const result = fn(tx.objectStore(store));
  const out = result instanceof IDBRequest ? reqP(result) : Promise.resolve(result);
  await txDone(tx);
  return out;
}
const idbGet = (s, k) => idb(s, 'readonly', (os) => os.get(k)).catch(() => undefined);
const idbPut = (s, v, k) => idb(s, 'readwrite', (os) => os.put(v, k)).catch(() => undefined);
const idbClear = (s) => idb(s, 'readwrite', (os) => os.clear()).catch(() => undefined);

/* ---------- 暗号化 ---------- */
async function deriveKek(password, saltBytes, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** パスワードから「データ鍵を包む鍵」と「サーバー用の認証鍵」を作る。
 *  前半32バイトは deriveKek と同じ値なので、バックアップの形式はそのまま使える */
async function deriveLogin(password, saltB64, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' }, base, 512));
  const kek = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const auth = b64(bits.slice(32));
  bits.fill(0);
  return { kek, auth };
}
async function aesEnc(k, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data);
  return { iv, ct };
}
const aesDec = (k, iv, ct) => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct);
const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

/** パスワードでデータ鍵を取り出す（バックアップ・旧データ用）。違う場合は例外 */
async function unwrapDekRaw(hdr, password) {
  const kek = await deriveKek(password, unb64(hdr.salt), hdr.iter);
  return new Uint8Array(await aesDec(kek, unb64(hdr.wkIv), unb64(hdr.wk)));
}
async function decryptJson(k, ivB64, ctB64) {
  return JSON.parse(dec.decode(await aesDec(k, unb64(ivB64), unb64(ctB64))));
}
async function encryptJson(k, data) {
  const { iv, ct } = await aesEnc(k, enc.encode(JSON.stringify(data)));
  return { iv: b64(iv), ct: b64(ct) };
}
function normalize(data) {
  data.entries = data.entries || [];
  data.trash = data.trash || [];
  return data;
}

/* ---------- サーバー通信 ---------- */
class ApiError extends Error {
  constructor(status, msg, data) { super(msg); this.status = status; this.data = data || {}; }
}
class ConflictError extends Error {}
let token = null;      // ログイン中のセッション（メモリ上のみ）

async function api(action, body, { raw = false, binary = null, query = '' } = {}) {
  let res;
  try {
    res = await fetch(`api.php?a=${action}${query}`, {
      method: 'POST',
      headers: binary
        ? { 'Content-Type': 'application/octet-stream', ...(token ? { 'X-Auth-Token': token } : {}) }
        : { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
      body: binary || JSON.stringify(body || {}),
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new ApiError(0, 'サーバーに接続できません。通信状態を確認してください。');
  }
  if (raw && res.ok) return res.arrayBuffer();
  let j = {};
  try { j = await res.json(); } catch {
    throw new ApiError(res.status, res.status === 404
      ? 'api.php が見つかりません。サーバーにアップロードされているか確認してください。'
      : `サーバーの応答が正しくありません（${res.status}）。PHPが使えるか確認してください。`);
  }
  if (!res.ok) {
    if (res.status === 401 && token) { token = null; setTimeout(() => { alert(j.error || 'ログインし直してください'); lock(); }, 0); }
    if (res.status === 409 && action === 'vault_put') throw new ConflictError(j.error);
    throw new ApiError(res.status, j.error || `エラー（${res.status}）`, j);
  }
  return j;
}

/* ---------- 保存 ---------- */
/** 暗号化してサーバーへ保存。直前の状態はサーバー側で復元ポイントに。別の端末で更新済みなら中止 */
async function persist(data) {
  const { iv, ct } = await encryptJson(dek, data);
  const r = await api('vault_put', { base: rev, iv, ct, n: data.entries.length });
  rev = r.rev;
  prefs.lastChangeAt = Date.now();
  savePrefs();
  updateBackupBanner();
}

/** サーバーの最新データを読み直す（別の端末で更新された場合） */
async function reloadVault() {
  const r = await api('vault_get');
  vault = normalize(await decryptJson(dek, r.vault.iv, r.vault.ct));
  header = r.header;
  rev = r.vault.rev;
}

/** 変更を複製に適用して保存。成功したときだけ画面のデータに反映。
 *  別の端末で先に保存されていたら、最新データを読み直して同じ変更をやり直す */
async function commit(mutate) {
  for (let attempt = 0; ; attempt++) {
    try {
      const next = structuredClone(vault);
      const r = mutate(next) || next;
      await persist(r);
      vault = r;
      return true;
    } catch (e) {
      if (e instanceof ConflictError && attempt < 2) {
        try { await reloadVault(); continue; } catch { /* 下で通知 */ }
      }
      reportSaveError(e);
      if (vault) { renderChips(); renderList(); }
      return false;
    }
  }
}

function reportSaveError(e) {
  console.error(e);
  if (e instanceof ApiError && e.status === 401) return;   // ログイン画面へ戻る処理は api() 側で実施
  if (e instanceof ConflictError) {
    alert('別の端末で同時に更新されたため保存できませんでした。もう一度お試しください。');
  } else {
    alert('保存に失敗しました。変更は確定していません。\n' + (e && e.message ? e.message : e));
  }
}

/* ---------- 添付ファイル（サーバーに暗号化して保存・端末にもキャッシュ） ---------- */
function packFile(iv, ct) {
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(new Uint8Array(iv), 0);
  out.set(new Uint8Array(ct), 12);
  return out;
}
async function uploadEncrypted(id, iv, ct) {
  await api('file_put', null, { binary: packFile(iv, ct), query: `&id=${encodeURIComponent(id)}` });
  await idbPut('fcache', { iv, ct }, id);
}
async function storeFile(file) {
  const id = uid();
  const { iv, ct } = await aesEnc(dek, await file.arrayBuffer());
  await uploadEncrypted(id, iv, ct);
  return { id, name: file.name || 'ファイル', type: file.type || 'application/octet-stream', size: file.size, addedAt: Date.now() };
}
/** 暗号化されたままのファイルを取得（キャッシュ → サーバー） */
async function getEncryptedFile(id) {
  const c = await idbGet('fcache', id);
  if (c) return c;
  const buf = new Uint8Array(await api('file_get', null, { raw: true, query: `&id=${encodeURIComponent(id)}` }));
  const rec = { iv: buf.slice(0, 12), ct: buf.slice(12).buffer };
  await idbPut('fcache', rec, id);
  return rec;
}
async function loadFile(att) {
  const rec = await getEncryptedFile(att.id);
  return new Blob([await aesDec(dek, rec.iv, rec.ct)], { type: att.type });
}

/* ---------- ログイン画面 ---------- */
let registered = null;
async function legacyLocal() {
  try { return (await idbGet('meta', 'vault')) || null; } catch { return null; }
}

async function showLock(message) {
  $('#app').hidden = true;
  $('#lockScreen').hidden = false;
  $('#lockErr').textContent = '';
  ['#masterPw', '#masterPw2', '#pin', '#pin2'].forEach((s) => { $(s).value = ''; });
  $('#lockMsg').textContent = '接続しています…';
  $('#lockForm').hidden = true;
  try {
    registered = (await api('status')).registered;
  } catch (e) {
    $('#lockMsg').textContent = e.message;
    $('#retryWrap').hidden = false;
    return;
  }
  $('#retryWrap').hidden = true;
  $('#lockForm').hidden = false;
  const first = !registered;
  $('#masterPw2Wrap').hidden = !first;
  $('#pin2Wrap').hidden = !first;
  $('#masterPw2').required = first;
  $('#pin2').required = first;
  $('#restoreWrap').hidden = !first;
  $('#masterPw').autocomplete = first ? 'new-password' : 'current-password';
  $('#lockMsg').textContent = message || (first
    ? '最初にアカウントを作成します。ユーザー名・パスワード・暗証番号を決めてください。'
    : 'ユーザー名・パスワード・暗証番号を入力してください。');
  $('#lockBtn').textContent = first ? 'アカウントを作成して開始' : 'ログイン';
  $('#lockNote').textContent = first
    ? '※ パスワードを忘れるとデータは復元できません（サーバーにも保存されていないため）。暗証番号は4〜8桁の数字です。'
    : '';
  $('#username').value = prefs.lastUser || '';
  ($('#username').value ? $('#masterPw') : $('#username')).focus();
}

function readLoginForm(first) {
  const username = $('#username').value.trim();
  const pw = $('#masterPw').value;
  const pin = $('#pin').value.trim();
  if (!username) throw new Error('ユーザー名を入力してください。');
  if (first) {
    if (pw.length < 8) throw new Error('パスワードは8文字以上にしてください。');
    if (pw !== $('#masterPw2').value) throw new Error('確認用パスワードが一致しません。');
    if (!/^[0-9]{4,8}$/.test(pin)) throw new Error('暗証番号は4〜8桁の数字にしてください。');
    if (pin !== $('#pin2').value.trim()) throw new Error('確認用の暗証番号が一致しません。');
  } else if (!pw || !pin) {
    throw new Error('パスワードと暗証番号を入力してください。');
  }
  return { username, pw, pin };
}

/** アカウント作成（空のデータで開始）。成功するとログイン状態になる */
async function register({ username, pw, pin }) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const { kek, auth } = await deriveLogin(pw, salt, KDF_ITER);
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const w = await aesEnc(kek, raw);
  dek = await importDek(raw);
  raw.fill(0);
  vault = normalize({});
  const { iv, ct } = await encryptJson(dek, vault);
  const r = await api('register', { username, pin, salt, iter: KDF_ITER, auth, wk: b64(w.ct), wkIv: b64(w.iv), iv, ct, n: 0 });
  token = r.token;
  header = r.header;
  rev = r.vault.rev;
  prefs.lastUser = username;
  savePrefs();
}

async function login({ username, pw, pin }) {
  const pre = await api('prelogin', { username });
  const { kek, auth } = await deriveLogin(pw, pre.salt, pre.iter);
  const r = await api('login', { username, auth, pin });
  token = r.token;
  const raw = new Uint8Array(await aesDec(kek, unb64(r.header.wkIv), unb64(r.header.wk)));
  dek = await importDek(raw);
  raw.fill(0);
  header = r.header;
  vault = normalize(await decryptJson(dek, r.vault.iv, r.vault.ct));
  rev = r.vault.rev;
  prefs.lastUser = username;
  savePrefs();
}

async function onLockSubmit(e) {
  e.preventDefault();
  const err = $('#lockErr');
  const btn = $('#lockBtn');
  err.textContent = '';
  if (!window.crypto || !crypto.subtle) {
    err.textContent = 'このブラウザ/接続では暗号化機能が使えません。HTTPS で開いてください。';
    return;
  }
  const first = !registered;
  let form;
  try { form = readLoginForm(first); } catch (ex) { err.textContent = ex.message; return; }
  btn.disabled = true;
  btn.textContent = first ? '作成中…' : '確認中…';
  try {
    if (first) await register(form); else await login(form);
    await enterApp();
    if (first) offerLegacyMigration();
  } catch (ex) {
    token = null; dek = null; vault = null;
    let msg = ex.message || String(ex);
    if (ex instanceof ApiError && ex.status === 403 && ex.data.left != null) msg += `（あと${ex.data.left}回失敗すると15分ロック）`;
    if (ex instanceof ApiError && ex.status === 429 && ex.data.retryAfter) msg += `（約${Math.ceil(ex.data.retryAfter / 60)}分後に再度お試しください）`;
    err.textContent = msg;
    $('#pin').value = '';
    $('#masterPw').select();
  } finally {
    btn.disabled = false;
    btn.textContent = first ? 'アカウントを作成して開始' : 'ログイン';
  }
}

async function enterApp() {
  $('#lockScreen').hidden = true;
  $('#app').hidden = false;
  ['#masterPw', '#masterPw2', '#pin', '#pin2'].forEach((s) => { $(s).value = ''; });
  lastActivity = Date.now();
  $('#sortSel').value = prefs.sort;
  $('#userLabel').textContent = prefs.lastUser || '';
  renderChips();
  renderList();
  updateBackupBanner();
  // ゴミ箱の期限切れを整理
  const limit = Date.now() - TRASH_DAYS * 86400000;
  if (vault.trash.some((t) => t.deletedAt < limit)) {
    await commit((v) => { v.trash = v.trash.filter((t) => t.deletedAt >= limit); });
  }
  updateLegacyUi();
}

function lock(message) {
  if (token) { const t = token; token = null; fetch('api.php?a=logout', { method: 'POST', headers: { 'X-Auth-Token': t }, body: '{}' }).catch(() => {}); }
  dek = null; vault = null; header = null; currentId = null; openId = null;
  editAtts = []; pendingFiles = [];
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('#search').value = '';
  $('#searchClear').hidden = true;
  $('#list').replaceChildren();
  liveUrls.forEach((u) => URL.revokeObjectURL(u));
  liveUrls.clear();
  showLock(typeof message === 'string' ? message : undefined);
}

/* ---------- 以前（端末内保存）のデータの引き継ぎ ---------- */
async function updateLegacyUi() {
  const rec = await legacyLocal();
  $('#legacyWrap').hidden = !rec;
  if (rec) $('#legacyInfo').textContent = `この端末には、以前の版で保存したデータ（${rec.n ?? '?'}件・${fmtDate(rec.savedAt)} 保存）が残っています。`;
}

async function offerLegacyMigration() {
  const rec = await legacyLocal();
  if (!rec || !rec.n) return;
  if (confirm(`この端末に、以前の版で保存したデータ（${rec.n}件）があります。\n新しいアカウントに引き継ぎますか？\n（以前の管理者パスワードが必要です）`)) {
    await onLegacyMerge();
  }
}

/** 端末内に残っている以前のデータを、サーバーのデータへ統合 */
async function onLegacyMerge() {
  const rec = await legacyLocal();
  if (!rec) return;
  const pw = await askPassword('以前の版で使っていた管理者パスワードを入力してください。');
  if (pw == null) return;
  busy('以前のデータを読み込んでいます…');
  try {
    let oldDek;
    try {
      const raw = await unwrapDekRaw(rec, pw);
      oldDek = await importDek(raw);
      raw.fill(0);
    } catch { throw new Error('以前の管理者パスワードが違います。'); }
    const data = normalize(await decryptJson(oldDek, rec.iv, rec.ct));
    busy('サーバーへ引き継いでいます…');
    // 同じID、または同じ「サービス名＋ログインID」のものは重複として飛ばす
    const k = (e) => `${(e.service || '').trim().toLowerCase()}\u0000${(e.loginId || '').trim().toLowerCase()}`;
    const haveId = new Set(vault.entries.map((e) => e.id));
    const haveKey = new Set(vault.entries.map(k));
    const toTake = data.entries.filter((e) => !haveId.has(e.id) && !haveKey.has(k(e)));
    for (const a of toTake.flatMap((e) => e.attachments || [])) {
      const f = await idbGet('files', a.id);
      if (!f) continue;
      const plain = await aesDec(oldDek, f.iv, f.ct);
      const { iv, ct } = await aesEnc(dek, plain);
      await uploadEncrypted(a.id, iv, ct);
    }
    const ok = await commit((v) => { v.entries.push(...toTake.filter((e) => !v.entries.some((x) => x.id === e.id))); });
    busyEnd();
    if (!ok) return;
    showListAfterImport(`以前のデータから ${toTake.length}件を引き継ぎました（重複 ${data.entries.length - toTake.length}件は省略）`);
  } catch (e) {
    busyEnd();
    alert(e.message || e);
  }
}

async function onLegacyDelete() {
  if (!confirm('この端末に残っている以前のデータを削除します。\nサーバーへの引き継ぎが済んでいることを確認してください。よろしいですか？')) return;
  await idb('meta', 'readwrite', (os) => os.delete('vault')).catch(() => {});
  await idbClear('files');
  await idbClear('snapshots');
  updateLegacyUi();
  toast('以前のデータを削除しました');
}

/* ---------- バックアップ通知 ---------- */
function updateBackupBanner() {
  const el = $('#backupBanner');
  if (!vault) { el.hidden = true; return; }
  const has = vault.entries.length > 0;
  const changed = prefs.lastChangeAt > (prefs.lastBackupAt || 0);
  const stale = daysSince(prefs.lastBackupAt || 0) >= BACKUP_REMIND_DAYS;
  el.hidden = !(has && changed && stale);
  $('#backupBannerText').textContent = prefs.lastBackupAt
    ? `最後のバックアップから${daysSince(prefs.lastBackupAt)}日経過し、変更があります。`
    : 'まだバックアップがありません。端末の故障・紛失に備えて保存しましょう。';
}

/* ---------- 一覧 ---------- */
function renderChips() {
  const wrap = $('#catChips');
  wrap.replaceChildren(...['すべて', ...CATEGORIES].map((c) => {
    const n = c === 'すべて' ? vault.entries.length : vault.entries.filter((e) => e.category === c).length;
    return h('button', {
      class: 'chip' + (filterCat === c ? ' on' : ''),
      onclick: () => { filterCat = c; renderChips(); renderList(); },
    }, c, h('span', { class: 'n' }, n));
  }));
}

function searchText(e) {
  return [e.service, e.account, e.loginId, e.url, (e.tags || []).join(' '), e.memo, e.category,
    (e.attachments || []).map((a) => a.name).join(' ')].join(' ').toLowerCase();
}

function highlight(text, terms) {
  text = text || '';
  if (!terms.length || !text) return [text];
  const lower = text.toLowerCase();
  const marks = [];
  for (const t of terms) {
    let i = 0;
    while ((i = lower.indexOf(t, i)) !== -1) { marks.push([i, i + t.length]); i += t.length; }
  }
  if (!marks.length) return [text];
  marks.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    out.push(text.slice(pos, s), h('mark', null, text.slice(s, e)));
    pos = e;
  }
  out.push(text.slice(pos));
  return out;
}

function renderList() {
  const terms = $('#search').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const items = vault.entries.filter((e) =>
    (filterCat === 'すべて' || e.category === filterCat) &&
    terms.every((t) => searchText(e).includes(t)));

  const sort = $('#sortSel').value;
  items.sort((a, b) =>
    sort === 'service' ? a.service.localeCompare(b.service, 'ja') :
    sort === 'updatedAsc' ? a.updatedAt - b.updatedAt :
    b.updatedAt - a.updatedAt);

  $('#countLabel').textContent = `${items.length} 件`;
  $('#empty').hidden = vault.entries.length > 0;
  document.querySelectorAll('.card').forEach((c) => (c._urls || []).forEach(dropUrl));
  if (vault.entries.length > 0 && items.length === 0) {
    $('#list').replaceChildren(h('p', { class: 'empty' }, '該当するアカウントがありません。'));
    return;
  }
  $('#list').replaceChildren(...items.map((e) => buildCard(e, terms)));
}

/* カード：閉じた状態はサービス名・アカウント名のみ。タップで開いて詳細を表示 */
function buildCard(e, terms) {
  const old = e.password && daysSince(e.pwChangedAt || e.updatedAt) >= OLD_PW_DAYS;
  const nAtt = (e.attachments || []).length;
  const inner = h('div', { class: 'card-panel-inner' });
  const panel = h('div', { class: 'card-panel' }, inner);
  const head = h('button', { class: 'card-head', type: 'button', 'aria-expanded': 'false' },
    h('div', { class: `avatar ${e.category}` }, (e.service || '?').slice(0, 1).toUpperCase()),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title' },
        h('span', { class: 'name' }, ...highlight(e.service, terms)),
        h('span', { class: `badge ${e.category}` }, e.category),
        old && h('span', { class: 'badge old' }, '要更新'),
        nAtt > 0 && h('span', { class: 'badge att', title: '添付ファイル' }, icon('clip'), nAtt)),
      e.account && h('div', { class: 'card-sub' }, ...highlight(e.account, terms))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chevron')));
  const card = h('div', { class: 'card', 'data-id': e.id }, head, panel);
  head.addEventListener('click', () => toggleCard(card, e.id));
  if (openId === e.id) openCard(card, e, false);
  return card;
}

function openCard(card, e, animate = true) {
  const inner = card.querySelector('.card-panel-inner');
  clearTimeout(card._t);
  card._urls = [];
  inner.replaceChildren(buildDetail(e, card._urls));
  card.classList.toggle('no-anim', !animate);
  card.classList.add('open');
  card.querySelector('.card-head').setAttribute('aria-expanded', 'true');
}

function closeCard(card) {
  card.classList.remove('open', 'no-anim');
  card.querySelector('.card-head').setAttribute('aria-expanded', 'false');
  // 閉じたら詳細（パスワード・画像等）を画面から消す
  card._t = setTimeout(() => {
    card.querySelector('.card-panel-inner').replaceChildren();
    (card._urls || []).forEach(dropUrl);
    card._urls = [];
  }, 300);
}

function toggleCard(card, id) {
  const e = vault.entries.find((x) => x.id === id);
  if (!e) return;
  if (card.classList.contains('open')) { closeCard(card); openId = null; return; }
  document.querySelectorAll('.card.open').forEach(closeCard);   // 開くのは1件だけ
  openId = id;
  openCard(card, e);
  setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 280);
}

/* ---------- コピー ---------- */
async function copy(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label}をコピーしました（${CLIPBOARD_CLEAR_SEC}秒後に消去）`);
    clearTimeout(copy._t);
    copy._t = setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), CLIPBOARD_CLEAR_SEC * 1000);
  } catch {
    toast('コピーできませんでした');
  }
}

/* ---------- 詳細 ---------- */
function maskedValue(value) {
  const span = h('span', { class: 'kv-v mono' }, '••••••••');
  let shown = false;
  const btn = h('button', {
    class: 'btn sm ghost', type: 'button',
    onclick: () => { shown = !shown; span.textContent = shown ? value : '••••••••'; btn.textContent = shown ? '隠す' : '表示'; },
  }, '表示');
  return { span, btn };
}

function buildAttachmentGrid(atts, urls) {
  return h('div', { class: 'att-grid' }, ...atts.map((a) => {
    const isImg = (a.type || '').startsWith('image/');
    const thumb = h('div', { class: 'att-thumb' }, fileIcon(a.type, a.name));
    if (isImg) {
      loadFile(a).then((blob) => {
        const u = makeUrl(blob);
        urls.push(u);
        thumb.replaceChildren(h('img', { src: u, alt: '' }));
      }).catch(() => thumb.replaceChildren(h('span', { class: 'ftype' }, 'ERR')));
    }
    return h('button', { class: 'att-item', type: 'button', onclick: () => openViewer(a) },
      thumb,
      h('span', { class: 'att-name' }, a.name),
      h('span', { class: 'att-size' }, fmtSize(a.size)));
  }));
}

function buildDetail(e, urls) {
  const rows = [];
  const row = (k, v, ...actions) => h('div', { class: 'kv-row' },
    h('span', { class: 'kv-k' }, k), v, actions.length ? h('span', { class: 'kv-actions' }, ...actions) : null);

  if (e.loginId) rows.push(row('ID', h('span', { class: 'kv-v mono' }, e.loginId),
    h('button', { class: 'btn sm ghost', type: 'button', onclick: () => copy(e.loginId, 'ID') }, 'コピー')));
  if (e.password) {
    const m = maskedValue(e.password);
    rows.push(row('パスワード', m.span, m.btn,
      h('button', { class: 'btn sm ghost', type: 'button', onclick: () => copy(e.password, 'パスワード') }, 'コピー')));
  }
  if (e.url) {
    const safe = /^https?:\/\//i.test(e.url);
    rows.push(row('URL', h('span', { class: 'kv-v' },
      safe ? h('a', { href: e.url, target: '_blank', rel: 'noopener noreferrer' }, e.url) : e.url)));
  }
  if (e.tags && e.tags.length) rows.push(row('タグ', h('span', { class: 'kv-v' }, e.tags.join(', '))));
  if (e.memo) rows.push(row('メモ', h('span', { class: 'kv-v memo' }, e.memo)));
  rows.push(row('更新日', h('span', { class: 'kv-v' }, fmtDate(e.updatedAt))));
  if (e.password) {
    const pd = e.pwChangedAt || e.updatedAt;
    rows.push(row('PW変更日', h('span', { class: 'kv-v' }, `${fmtDate(pd)}（${daysSince(pd)}日前）`)));
  }
  rows.push(row('登録日', h('span', { class: 'kv-v' }, fmtDate(e.createdAt))));

  const atts = e.attachments || [];
  const attEl = atts.length ? h('div', { class: 'section' },
    h('h3', null, `添付ファイル（${atts.length}件）`), buildAttachmentGrid(atts, urls)) : null;

  const hist = (e.history || []).slice().reverse();
  const histEl = h('div', { class: 'section' },
    h('h3', null, `変更前の履歴（${hist.length}件）`),
    hist.length === 0 ? h('p', { class: 'muted small' }, 'まだ変更履歴はありません。ID やパスワードを変更すると、変更前の値がここに残ります。') : null,
    ...hist.map((x) => {
      const lines = [];
      if (x.prevLoginId !== undefined) lines.push(h('div', { class: 'hist-line' }, '旧ID:', h('code', null, x.prevLoginId || '(なし)')));
      if (x.prevPassword !== undefined) {
        const m = maskedValue(x.prevPassword || '(なし)');
        m.span.className = '';
        lines.push(h('div', { class: 'hist-line' }, '旧PW:', h('code', null, m.span), m.btn,
          x.prevPassword && h('button', { class: 'btn sm ghost', type: 'button', onclick: () => copy(x.prevPassword, '旧パスワード') }, 'コピー')));
      }
      if (x.attAdded) lines.push(h('div', { class: 'hist-line' }, `添付追加: ${x.attAdded.join(', ')}`));
      if (x.attRemoved) lines.push(h('div', { class: 'hist-line' }, `添付削除: ${x.attRemoved.join(', ')}`));
      return h('div', { class: 'hist-item' },
        h('div', { class: 'hist-date' }, `${fmtDate(x.changedAt)} に変更${x.note ? ' ・ ' + x.note : ''}`),
        ...lines);
    }));

  const actions = h('div', { class: 'detail-actions' },
    h('button', { class: 'btn danger', type: 'button', onclick: () => onDelete(e.id) }, '削除'),
    h('button', { class: 'btn primary', type: 'button', onclick: () => openEdit(e.id) }, '編集'));
  return h('div', { class: 'detail' }, h('div', { class: 'kv' }, ...rows), attEl, histEl, actions);
}

/* ---------- ファイルビューア ---------- */
let viewerUrl = null;
async function openViewer(att) {
  const body = $('#viewerBody');
  $('#viewerTitle').textContent = att.name;
  body.replaceChildren(h('p', { class: 'muted' }, '読み込み中…'));
  $('#viewerDlg').showModal();
  let blob;
  try { blob = await loadFile(att); }
  catch (e) { body.replaceChildren(h('p', { class: 'error' }, '読み込めませんでした: ' + e.message)); return; }
  dropUrl(viewerUrl);
  viewerUrl = makeUrl(blob);
  const isImg = (att.type || '').startsWith('image/');
  body.replaceChildren(
    isImg ? h('img', { src: viewerUrl, alt: att.name, class: 'viewer-img' })
      : h('div', { class: 'viewer-file' }, h('div', { class: 'viewer-icon' }, fileIcon(att.type, att.name)),
        h('p', null, att.name), h('p', { class: 'muted small' }, `${fmtSize(att.size)}・${fmtDate(att.addedAt)} 追加`)));
  $('#viewerOpen').onclick = () => window.open(viewerUrl, '_blank', 'noopener');
  $('#viewerSave').onclick = () => downloadBlob(blob, att.name);
}

/* ---------- 追加・編集 ---------- */
function openEdit(id) {
  const e = id ? vault.entries.find((x) => x.id === id) : null;
  currentId = id || null;
  $('#eTitle').textContent = e ? 'アカウント編集' : 'アカウント追加';
  $('#fService').value = e?.service || '';
  $('#fAccount').value = e?.account || '';
  $('#fLoginId').value = e?.loginId || '';
  $('#fPassword').value = e?.password || '';
  $('#fPassword').type = 'password';
  $('#fPwToggle').textContent = '表示';
  $('#fUrl').value = e?.url || '';
  $('#fTags').value = (e?.tags || []).join(', ');
  $('#fMemo').value = e?.memo || '';
  $('#fChangeNote').value = '';
  $('#fChangeNoteWrap').hidden = !e;
  const cat = e?.category || (filterCat !== 'すべて' ? filterCat : '個人用');
  document.querySelectorAll('#fCategory input').forEach((r) => { r.checked = r.value === cat; });
  editAtts = [...(e?.attachments || [])];
  pendingFiles = [];
  renderEditAtts();
  updateStrength();
  $('#serviceList').replaceChildren(...[...new Set(vault.entries.map((x) => x.service))].map((s) => h('option', { value: s })));
  $('#editDlg').showModal();
  if (!e) setTimeout(() => $('#fService').focus(), 50);
}

function renderEditAtts() {
  const items = [
    ...editAtts.map((a, i) => ({ name: a.name, size: a.size, type: a.type, isNew: false, remove: () => { editAtts.splice(i, 1); renderEditAtts(); } })),
    ...pendingFiles.map((f, i) => ({ name: f.name, size: f.size, type: f.type, isNew: true, remove: () => { pendingFiles.splice(i, 1); renderEditAtts(); } })),
  ];
  $('#fAttList').replaceChildren(...items.map((it) => h('div', { class: 'att-row' },
    fileIcon(it.type, it.name),
    h('span', { class: 'att-row-name' }, it.name),
    it.isNew && h('span', { class: 'badge new' }, '追加'),
    h('span', { class: 'att-size' }, fmtSize(it.size)),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '外す', onclick: it.remove }, icon('close')))));
}

function addPendingFiles(files) {
  let skipped = 0;
  for (const f of files) {
    if (f.size > MAX_FILE_MB * 1048576) { skipped++; continue; }
    // 貼り付け画像は名前が無い／同名になりがちなので日時で命名
    let file = f;
    if (!f.name || f.name === 'image.png') {
      const ext = (f.type.split('/')[1] || 'bin').replace('jpeg', 'jpg');
      file = new File([f], `貼り付け_${fmtDate(Date.now()).replace(/[/: ]/g, '')}.${ext}`, { type: f.type });
    }
    pendingFiles.push(file);
  }
  renderEditAtts();
  if (skipped) toast(`${MAX_FILE_MB}MBを超えるファイル（${skipped}件）は追加できません`, 3500);
  else if (files.length) toast(`${files.length}件のファイルを追加しました（保存で確定）`);
}

async function onEditSubmit(ev) {
  ev.preventDefault();
  const service = $('#fService').value.trim();
  if (!service) return;
  const saveBtn = $('#editForm button[type=submit]');
  saveBtn.disabled = true;
  saveBtn.textContent = '保存中…';
  try {
    // 1) 新しいファイルを先に暗号化して保存（失敗したら本体は変更しない）
    const added = [];
    for (const f of pendingFiles) added.push(await storeFile(f));

    const now = Date.now();
    const data = {
      service,
      account: $('#fAccount').value.trim(),
      loginId: $('#fLoginId').value.trim(),
      password: $('#fPassword').value,
      url: $('#fUrl').value.trim(),
      tags: $('#fTags').value.split(/[,、]/).map((s) => s.trim()).filter(Boolean),
      memo: $('#fMemo').value,
      category: document.querySelector('#fCategory input:checked').value,
      attachments: [...editAtts, ...added],
    };
    const id = currentId;

    // 2) 本体を保存
    const ok = await commit((v) => {
      if (id) {
        const e = v.entries.find((x) => x.id === id);
        const idChanged = e.loginId !== data.loginId;
        const pwChanged = e.password !== data.password;
        const keepIds = new Set(editAtts.map((a) => a.id));
        const removed = (e.attachments || []).filter((a) => !keepIds.has(a.id)).map((a) => a.name);
        if (idChanged || pwChanged || added.length || removed.length) {
          const rec = { changedAt: now, note: $('#fChangeNote').value.trim() };
          if (idChanged) rec.prevLoginId = e.loginId;
          if (pwChanged) rec.prevPassword = e.password;
          if (added.length) rec.attAdded = added.map((a) => a.name);
          if (removed.length) rec.attRemoved = removed;
          e.history = [...(e.history || []), rec];
          if (pwChanged) e.pwChangedAt = now;
        }
        Object.assign(e, data, { updatedAt: now });
      } else {
        v.entries.push({ id: uid(), ...data, createdAt: now, updatedAt: now, pwChangedAt: now, history: [] });
      }
    });
    if (!ok) return;   // ダイアログは閉じず、入力内容を残す
    pendingFiles = [];
    $('#editDlg').close();
    if (!id) openId = null;
    renderChips();
    renderList();
    toast('保存しました');
  } catch (e) {
    reportSaveError(e);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '保存';
  }
}

function closeEditDialog() {
  if (pendingFiles.length && !confirm('追加したファイルがまだ保存されていません。閉じますか？')) return;
  pendingFiles = [];
  $('#editDlg').close();
}

async function onDelete(id) {
  const e = vault.entries.find((x) => x.id === id);
  if (!e || !confirm(`「${e.service}」をゴミ箱に移動しますか？\n（${TRASH_DAYS}日間は設定画面から復元できます）`)) return;
  const ok = await commit((v) => {
    const i = v.entries.findIndex((x) => x.id === id);
    const [item] = v.entries.splice(i, 1);
    v.trash.push({ ...item, deletedAt: Date.now() });
  });
  if (!ok) return;
  openId = null;
  renderChips();
  renderList();
  toast('ゴミ箱に移動しました');
}

/* ---------- パスワード生成・強度 ---------- */
function generatePassword(len = 16) {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*-_=+?'];
  const all = sets.join('');
  const pick = (chars) => {
    const lim = 256 - (256 % chars.length);
    const b = new Uint8Array(1);
    do crypto.getRandomValues(b); while (b[0] >= lim);
    return chars[b[0] % chars.length];
  };
  const out = sets.map(pick);
  while (out.length < len) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {   // シャッフル
    const b = new Uint32Array(1); crypto.getRandomValues(b);
    const j = b[0] % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join('');
}

function updateStrength() {
  const pw = $('#fPassword').value;
  const el = $('#fStrength');
  if (!pw) { el.textContent = ''; return; }
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += 30;
  const bits = pw.length * Math.log2(pool || 1);
  const dup = vault.entries.some((x) => x.id !== currentId && x.password && x.password === pw);
  const [label, color] = bits < 40 ? ['弱い', 'var(--danger)'] : bits < 70 ? ['普通', 'var(--warn)'] : ['強い', 'var(--ok)'];
  el.style.color = dup ? 'var(--danger)' : color;
  el.textContent = `強度: ${label}（${pw.length}文字）` + (dup ? ' ・ 他のアカウントと同じパスワードです' : '');
}

/* ---------- 設定画面 ---------- */
async function openSettings() {
  $('#autoLockSel').value = String(prefs.autoLockMin);
  $('#cpErr').textContent = '';
  $('#settingsDlg').showModal();
  renderSettingsLists();
}

async function renderSettingsLists() {
  // 保存の状態
  const lines = [
    h('div', { class: 'status-row' }, h('span', null, 'ログイン中'), h('span', null, prefs.lastUser || '-')),
    h('div', { class: 'status-row' }, h('span', null, '保存先'), h('span', { class: 'ok' }, '✓ サーバー（暗号化済み）')),
    h('div', { class: 'status-row' }, h('span', null, '最終バックアップ'),
      h('span', { class: prefs.lastBackupAt ? '' : 'warn' }, prefs.lastBackupAt ? fmtDate(prefs.lastBackupAt) : '未実施')),
    h('p', { class: 'muted small' }, 'データはこの端末で暗号化してからサーバーに保存しています。サーバーの管理者でも中身は読めません。サーバーの障害に備えて、バックアップも定期的に取ってください。'),
  ];
  $('#storageStatus').replaceChildren(...lines);

  // 復元ポイント（サーバー側に保存）
  let snaps = [];
  try { snaps = (await api('snapshots')).items; } catch (e) { snaps = []; }
  $('#snapList').replaceChildren(
    snaps.length ? '' : h('p', { class: 'muted small' }, 'まだありません。保存するたびに直前の状態が自動で記録されます。'),
    ...snaps.slice(0, 20).map((sn) => h('div', { class: 'list-row' },
      h('span', null, fmtDate(sn.savedAt), h('span', { class: 'muted small' }, `　${sn.n ?? '?'}件`)),
      h('button', { class: 'btn sm', type: 'button', onclick: () => restoreSnapshot(sn) }, 'この時点に戻す'))));

  // ゴミ箱
  const trash = vault.trash.slice().sort((a, b) => b.deletedAt - a.deletedAt);
  $('#trashList').replaceChildren(
    trash.length ? '' : h('p', { class: 'muted small' }, 'ゴミ箱は空です。'),
    ...trash.map((t) => h('div', { class: 'list-row' },
      h('span', null, t.service, h('span', { class: 'muted small' },
        `　${fmtDate(t.deletedAt)} 削除・あと${Math.max(0, TRASH_DAYS - daysSince(t.deletedAt))}日`)),
      h('span', { class: 'btn-row' },
        h('button', { class: 'btn sm', type: 'button', onclick: () => restoreTrash(t.id) }, '復元'),
        h('button', { class: 'btn sm danger', type: 'button', onclick: () => purgeTrash(t.id) }, '完全削除')))));
}

async function restoreSnapshot(s) {
  if (!confirm(`${fmtDate(s.savedAt)} の状態に戻しますか？\n（今の状態も復元ポイントとして残るので、元に戻すこともできます）`)) return;
  let data;
  try {
    const rec = await api('snapshot', null, { query: `&sid=${s.sid}` });
    data = normalize(await decryptJson(dek, rec.iv, rec.ct));
  } catch { alert('この復元ポイントは読み込めませんでした。'); return; }
  if (!(await commit(() => data))) return;
  openId = null;
  renderChips(); renderList(); renderSettingsLists();
  toast('復元しました');
}

async function restoreTrash(id) {
  const ok = await commit((v) => {
    const i = v.trash.findIndex((t) => t.id === id);
    const [item] = v.trash.splice(i, 1);
    delete item.deletedAt;
    v.entries.push(item);
  });
  if (!ok) return;
  renderChips(); renderList(); renderSettingsLists();
  toast('復元しました');
}

async function purgeTrash(id) {
  if (!confirm('ゴミ箱から完全に削除しますか？')) return;
  if (!(await commit((v) => { v.trash = v.trash.filter((t) => t.id !== id); }))) return;
  renderSettingsLists();
  toast('削除しました');
}

async function onChangeMaster(ev) {
  ev.preventDefault();
  const err = $('#cpErr');
  err.textContent = '';
  const oldPw = $('#cpOld').value, n1 = $('#cpNew').value, n2 = $('#cpNew2').value;
  if (n1.length < 8) { err.textContent = '新しいパスワードは8文字以上にしてください。'; return; }
  if (n1 !== n2) { err.textContent = '確認用パスワードが一致しません。'; return; }
  busy('パスワードを変更しています…');
  try {
    const old = await deriveLogin(oldPw, header.salt, header.iter);
    let raw;
    try { raw = new Uint8Array(await aesDec(old.kek, unb64(header.wkIv), unb64(header.wk))); }
    catch { throw new Error('現在のパスワードが違います。'); }
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const neu = await deriveLogin(n1, salt, KDF_ITER);
    const w = await aesEnc(neu.kek, raw);
    raw.fill(0);
    const r = await api('password', { authOld: old.auth, salt, iter: KDF_ITER, authNew: neu.auth, wk: b64(w.ct), wkIv: b64(w.iv) });
    header = r.header;
    ev.target.reset();
    busyEnd();
    toast('パスワードを変更しました。ほかの端末でも新しいパスワードでログインしてください。', 4500);
  } catch (e) {
    busyEnd();
    err.textContent = e.message || String(e);
  }
}

/** 本人確認：現在のパスワードから認証鍵を作る */
async function authFromPassword(pw) {
  return (await deriveLogin(pw, header.salt, header.iter)).auth;
}

async function onChangePin(ev) {
  ev.preventDefault();
  const err = $('#pinErr');
  err.textContent = '';
  const pw = $('#cpinPw').value, p1 = $('#cpinNew').value.trim(), p2 = $('#cpinNew2').value.trim();
  if (!/^[0-9]{4,8}$/.test(p1)) { err.textContent = '暗証番号は4〜8桁の数字にしてください。'; return; }
  if (p1 !== p2) { err.textContent = '確認用の暗証番号が一致しません。'; return; }
  busy('暗証番号を変更しています…');
  try {
    await api('pin', { auth: await authFromPassword(pw), pin: p1 });
    ev.target.reset();
    busyEnd();
    toast('暗証番号を変更しました', 3500);
  } catch (e) {
    busyEnd();
    err.textContent = e.status === 403 ? 'パスワードが違います。' : (e.message || String(e));
  }
}

async function onChangeUser(ev) {
  ev.preventDefault();
  const err = $('#cuErr');
  err.textContent = '';
  const name = $('#cuName').value.trim(), pw = $('#cuPw').value;
  if (!name) { err.textContent = '新しいユーザー名を入力してください。'; return; }
  busy('ユーザー名を変更しています…');
  try {
    await api('username', { auth: await authFromPassword(pw), username: name });
    prefs.lastUser = name; savePrefs();
    $('#userLabel').textContent = name;
    ev.target.reset();
    busyEnd();
    renderSettingsLists();
    toast('ユーザー名を変更しました', 3500);
  } catch (e) {
    busyEnd();
    err.textContent = e.status === 403 ? 'パスワードが違います。' : (e.message || String(e));
  }
}

/* ---------- バックアップ ---------- */
async function buildBackup() {
  busy('バックアップを作成しています…');
  try {
    const { iv, ct } = await encryptJson(dek, vault);
    const vaultRec = { v: 2, iter: header.iter, salt: header.salt, wkIv: header.wkIv, wk: header.wk, iv, ct, n: vault.entries.length, savedAt: Date.now() };
    const ids = new Set();
    [...vault.entries, ...vault.trash].forEach((e) => (e.attachments || []).forEach((a) => ids.add(a.id)));
    const files = {};
    let missing = 0;
    for (const id of ids) {
      try {
        const f = await getEncryptedFile(id);
        files[id] = { iv: b64(f.iv), ct: b64(f.ct) };
      } catch { missing++; }
    }
    const json = JSON.stringify({ app: 'account-manager', format: 2, exportedAt: Date.now(), vault: vaultRec, files });
    const name = `account-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (missing) alert(`添付ファイル ${missing}件を取得できなかったため、バックアップに含まれていません。`);
    return { blob: new Blob([json], { type: 'application/json' }), name, nFiles: Object.keys(files).length };
  } finally {
    busyEnd();
  }
}

function markBackedUp() {
  prefs.lastBackupAt = Date.now();
  savePrefs();
  updateBackupBanner();
  if ($('#settingsDlg').open) renderSettingsLists();
}

async function onExport() {
  try {
    const { blob, name, nFiles } = await buildBackup();
    downloadBlob(blob, name);
    markBackedUp();
    toast(`バックアップを保存しました（アカウント${vault.entries.length}件・ファイル${nFiles}件）`, 3500);
  } catch (e) { reportSaveError(e); }
}

async function onShareBackup() {
  try {
    const { blob, name } = await buildBackup();
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Account Manager バックアップ' });
      markBackedUp();
      toast('バックアップを共有しました');
    } else {
      downloadBlob(blob, name);
      markBackedUp();
      toast('この端末では共有できないため、ダウンロードしました');
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    reportSaveError(e);
  }
}

function askPassword(message) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', autocomplete: 'off' });
    const dlg = h('dialog', { class: 'sheet' },
      h('form', { method: 'dialog' },
        h('div', { class: 'sheet-head' }, h('h2', null, 'パスワード入力')),
        h('div', { class: 'sheet-body' }, h('p', { class: 'muted small' }, message), input),
        h('div', { class: 'sheet-foot' },
          h('button', { class: 'btn', value: 'cancel', formnovalidate: '' }, 'キャンセル'),
          h('button', { class: 'btn primary', value: 'ok' }, 'OK'))));
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok' ? input.value : null); dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

async function readBackupFile(file) {
  const blob = JSON.parse(await file.text());
  if (blob.format === 2 && blob.vault && blob.vault.wk) return blob;
  if (blob.ct && blob.iv && blob.salt) return { legacy: true, vault: blob, files: {} };   // 旧形式
  throw new Error('形式が違います');
}

/** 処理中の表示（最前面・閉じられない） */
function busy(msg) {
  let d = $('#busyDlg');
  if (!d) {
    d = h('dialog', { id: 'busyDlg', class: 'busy' }, h('div', { class: 'spinner' }), h('p', { id: 'busyMsg' }));
    d.addEventListener('cancel', (ev) => ev.preventDefault());
    document.body.append(d);
  }
  $('#busyMsg').textContent = msg;
  if (!d.open) d.showModal();
}
function busyEnd() { const d = $('#busyDlg'); if (d && d.open) d.close(); }

/** ファイル選択 → 形式確認 → パスワード → 復号 までの共通処理 */
async function pickBackup(file, message) {
  let bk;
  try { bk = await readBackupFile(file); }
  catch { throw new Error('バックアップファイルの形式が正しくありません。アプリの「バックアップ」で保存した .json ファイルを選んでください。'); }
  const pw = await askPassword(message);
  if (pw == null) return null;
  busy('バックアップを開いています…');
  try {
    const opened = await openBackup(bk, pw);
    return { bk, pw, ...opened };
  } catch (e) {
    busyEnd();
    if (e && e.name === 'OperationError') throw new Error('パスワードが違います。バックアップを作ったときのパスワードを入力してください。');
    throw e;
  }
}

/** 取り込み・置き換えのあと、一覧画面に戻して結果を見せる */
function showListAfterImport(message) {
  busyEnd();
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('#search').value = '';
  $('#searchClear').hidden = true;
  filterCat = 'すべて';
  openId = null;
  renderChips();
  renderList();
  window.scrollTo({ top: 0 });
  toast(message, 4500);
}

/** バックアップを開く → { data, dekB } */
async function openBackup(bk, pw) {
  if (bk.legacy) {
    const k = await deriveKek(pw, unb64(bk.vault.salt), bk.vault.iter || KDF_ITER);
    return { data: normalize(JSON.parse(dec.decode(await aesDec(k, unb64(bk.vault.iv), unb64(bk.vault.ct))))), dekB: null };
  }
  const raw = await unwrapDekRaw(bk.vault, pw);
  const dekB = await importDek(raw);
  raw.fill(0);
  return { data: normalize(await decryptJson(dekB, bk.vault.iv, bk.vault.ct)), dekB };
}

/** バックアップのファイルを現在のデータ鍵で暗号化し直してサーバーへ保存 */
async function importFiles(bk, dekB, atts) {
  for (const a of atts) {
    const f = bk.files[a.id];
    if (!f) continue;
    const plain = await aesDec(dekB, unb64(f.iv), unb64(f.ct));
    const { iv, ct } = await aesEnc(dek, plain);
    await uploadEncrypted(a.id, iv, ct);
  }
}

/** 設定画面から：今のデータにバックアップを統合（追加＋新しい方で更新） */
async function onImport(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const r = await pickBackup(file, 'バックアップ作成時の管理者パスワードを入力してください。');
    if (!r) return;
    busy('取り込んでいます…');
    const { bk, data, dekB } = r;
    const toTake = data.entries.filter((inc) => {
      const cur = vault.entries.find((x) => x.id === inc.id);
      return !cur || (inc.updatedAt || 0) > (cur.updatedAt || 0);
    });
    if (dekB) await importFiles(bk, dekB, toTake.flatMap((e) => e.attachments || []));
    let added = 0, updated = 0;
    const ok = await commit((v) => {
      added = 0; updated = 0;
      for (const inc of toTake) {
        const i = v.entries.findIndex((x) => x.id === inc.id);
        if (i < 0) { v.entries.push(inc); added++; } else { v.entries[i] = inc; updated++; }
      }
    });
    busyEnd();
    if (!ok) return;
    showListAfterImport(added + updated
      ? `統合しました：追加 ${added}件 / 更新 ${updated}件`
      : '統合しました：新しいデータはありませんでした（すでに最新です）');
  } catch (e) {
    busyEnd();
    alert(e.message || e);
  }
}

/** 設定画面から：このデバイスのデータをバックアップの内容で置き換え（PC→スマホの同期用） */
async function onReplace(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const r = await pickBackup(file, 'バックアップ作成時のパスワードを入力してください。（今のログイン用パスワードは変わりません）');
    if (!r) return;
    busyEnd();
    const { bk, data, dekB } = r;
    const when = bk.exportedAt ? fmtDate(bk.exportedAt) : '不明';
    if (!confirm(`データを、バックアップ（${when} 作成・${data.entries.length}件）の内容で置き換えます。すべての端末に反映されます。\n\n今のデータ（${vault.entries.length}件）は復元ポイントに残るので、あとで戻せます。よろしいですか？`)) return;
    busy('置き換えています…');
    if (dekB) await importFiles(bk, dekB, [...data.entries, ...data.trash].flatMap((e) => e.attachments || []));
    const ok = await commit(() => data);
    busyEnd();
    if (!ok) return;
    showListAfterImport(`置き換えました（${data.entries.length}件）`);
  } catch (e) {
    busyEnd();
    alert(e.message || e);
  }
}

/** 取り込み用ファイル（平文JSON）から追加。重複（サービス名＋ID）は飛ばす */
async function onPlainImport(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let list;
  try {
    const j = JSON.parse(await file.text());
    list = Array.isArray(j) ? j : j.entries;
    if (!Array.isArray(list) || !list.length) throw 0;
  } catch { toast('取り込み用ファイルの形式が正しくありません'); return; }

  const norm = (v) => String(v ?? '').trim();
  const key = (x) => `${norm(x.service).toLowerCase()}\u0000${norm(x.loginId).toLowerCase()}`;
  const have = new Set(vault.entries.map(key));
  const now = Date.now();
  const fresh = [];
  let dup = 0;
  for (const r of list) {
    if (!norm(r.service)) continue;
    if (have.has(key(r))) { dup++; continue; }
    have.add(key(r));
    fresh.push({
      id: uid(),
      service: norm(r.service),
      account: norm(r.account),
      loginId: norm(r.loginId),
      password: String(r.password ?? ''),
      url: norm(r.url),
      tags: Array.isArray(r.tags) ? r.tags.map(norm).filter(Boolean) : [],
      memo: String(r.memo ?? ''),
      category: CATEGORIES.includes(r.category) ? r.category : '個人用',
      attachments: [],
      createdAt: now, updatedAt: now, pwChangedAt: now, history: [],
    });
  }
  if (!fresh.length) { toast(`追加できるアカウントがありません（重複 ${dup}件）`, 3500); return; }
  if (!confirm(`${fresh.length}件を追加します（重複で飛ばす：${dup}件）。よろしいですか？\n※ 取り込み前の状態は復元ポイントに残ります。`)) return;
  const ok = await commit((v) => { v.entries.push(...fresh); });
  if (!ok) return;
  renderChips(); renderList(); renderSettingsLists();
  toast(`取り込み完了：${fresh.length}件を追加しました。元ファイルは削除してください。`, 5000);
}

/** 初回画面から：アカウントを作成して、バックアップの内容で始める */
async function onRestoreFirst(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const err = $('#lockErr');
  err.textContent = '';
  let form;
  try { form = readLoginForm(true); }
  catch (e) { err.textContent = '先に上の欄（ユーザー名・パスワード・暗証番号）を入力してください。' + e.message; return; }
  try {
    const r = await pickBackup(file, 'バックアップ作成時の管理者パスワードを入力してください。');
    if (!r) return;
    busy('アカウントを作成しています…');
    await register(form);
    busy('バックアップの内容を保存しています…');
    const { bk, data, dekB } = r;
    if (dekB) await importFiles(bk, dekB, [...data.entries, ...data.trash].flatMap((e) => e.attachments || []));
    await persist(data);
    vault = data;
    prefs.lastBackupAt = bk.exportedAt || Date.now();
    savePrefs();
    busyEnd();
    await enterApp();
    toast(`アカウントを作成し、バックアップから復元しました（${data.entries.length}件）`, 4500);
  } catch (e) {
    busyEnd();
    if (token) { lock(); }
    err.textContent = (e && e.message) ? e.message : '復元に失敗しました: ' + e;
  }
}

async function onWipe() {
  if (!confirm('サーバー上のすべてのアカウント情報・添付ファイル・復元ポイントと、ログイン用のアカウントを削除します。\nすべての端末で使えなくなります。先にバックアップを取ることを強くおすすめします。よろしいですか？')) return;
  if (prompt('確認のため「削除」と入力してください') !== '削除') return;
  const pw = await askPassword('本人確認のため、パスワードを入力してください。');
  if (pw == null) return;
  busy('削除しています…');
  try {
    await api('wipe', { auth: await authFromPassword(pw) });
    await idbClear('fcache');
    prefs.lastBackupAt = 0; prefs.lastChangeAt = 0; savePrefs();
    busyEnd();
    token = null;
    lock();
    toast('すべてのデータを削除しました');
  } catch (e) {
    busyEnd();
    alert(e.status === 403 ? 'パスワードが違います。' : (e.message || e));
  }
}

/* ---------- 自動ロック ---------- */
function touch() { lastActivity = Date.now(); }
function checkAutoLock() {
  if (!vault) return;
  if ($('#editDlg').open && pendingFiles.length) return;   // ファイル追加中はロックしない
  if (Date.now() - lastActivity > prefs.autoLockMin * 60000) lock();
}

/* ---------- 初期化 ---------- */
/* ---------- アプリとしてインストール ---------- */
let installEvt = null;
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function updateInstallUi() {
  const installed = isStandalone();
  // Chrome/Edge/Android は専用ダイアログ、それ以外（iOS Safari 等）は手順を表示
  const canShow = !installed && location.protocol !== 'file:';
  ['#installBtn', '#installLockBtn', '#installSettingsBtn'].forEach((id) => { $(id).hidden = !canShow; });
  $('#installStatus').textContent = installed
    ? '✓ インストール済み（アプリとして起動しています）'
    : 'ホーム画面に追加すると、アプリとして起動でき、データも消えにくくなります。';
}

async function onInstall() {
  if (installEvt) {
    installEvt.prompt();
    const r = await installEvt.userChoice.catch(() => null);
    installEvt = null;
    if (r && r.outcome === 'accepted') toast('インストールしました');
    updateInstallUi();
    return;
  }
  const step = (n, t) => h('li', null, h('b', null, `${n}. `), t);
  const ios = isIOS();
  $('#installSteps').replaceChildren(
    h('p', { class: 'muted small' }, 'お使いのブラウザでは自動インストールのボタンが使えないため、次の手順で追加してください。'),
    h('ol', { class: 'steps' }, ...(ios ? [
      step(1, 'Safari で画面下（iPad は上）の「共有」ボタン（□に↑）をタップ'),
      step(2, '「ホーム画面に追加」を選ぶ'),
      step(3, '右上の「追加」をタップ'),
      h('li', { class: 'muted small' }, '※ Chrome など Safari 以外では表示されないことがあります。その場合は Safari で開いてください。'),
    ] : [
      step(1, 'ブラウザのメニュー（︙ または ⋯）を開く'),
      step(2, '「アプリをインストール」または「ホーム画面に追加」を選ぶ'),
      step(3, '確認画面で「インストール」をタップ'),
      h('li', { class: 'muted small' }, '※ HTTPS の URL で開いている必要があります。'),
    ])));
  $('#installDlg').showModal();
}

function init() {
  $('#lockForm').addEventListener('submit', onLockSubmit);
  $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', onRestoreFirst);
  $('#lockNowBtn').addEventListener('click', lock);
  $('#addBtn').addEventListener('click', () => openEdit(null));
  const syncClear = () => { $('#searchClear').hidden = !$('#search').value; };
  $('#search').addEventListener('input', () => { syncClear(); renderList(); });
  $('#search').addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('#searchClear').click(); });
  $('#searchClear').addEventListener('click', () => {
    $('#search').value = '';
    syncClear();
    renderList();
    $('#search').focus();
  });
  $('#sortSel').addEventListener('change', () => { prefs.sort = $('#sortSel').value; savePrefs(); renderList(); });
  $('#editForm').addEventListener('submit', onEditSubmit);
  $('#fPassword').addEventListener('input', updateStrength);
  $('#fPwToggle').addEventListener('click', () => {
    const i = $('#fPassword');
    i.type = i.type === 'password' ? 'text' : 'password';
    $('#fPwToggle').textContent = i.type === 'password' ? '表示' : '隠す';
  });
  $('#fPwGen').addEventListener('click', () => {
    $('#fPassword').value = generatePassword();
    $('#fPassword').type = 'text';
    $('#fPwToggle').textContent = '隠す';
    updateStrength();
  });

  // 添付：選択・ドラッグ＆ドロップ・貼り付け
  $('#fAttPick').addEventListener('click', () => $('#fAttInput').click());
  $('#fAttInput').addEventListener('change', (ev) => { addPendingFiles([...ev.target.files]); ev.target.value = ''; });
  const drop = $('#fAttDrop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); addPendingFiles([...ev.dataTransfer.files]); });
  document.addEventListener('paste', (ev) => {
    if (!$('#editDlg').open) return;
    const files = [...(ev.clipboardData?.files || [])];
    if (files.length) { ev.preventDefault(); addPendingFiles(files); }
  });

  $('#settingsBtn').addEventListener('click', openSettings);
  $('#bannerBackupBtn').addEventListener('click', onExport);
  $('#autoLockSel').addEventListener('change', () => { prefs.autoLockMin = Number($('#autoLockSel').value); savePrefs(); toast('自動ロックを変更しました'); });
  $('#changePwForm').addEventListener('submit', onChangeMaster);
  $('#changePinForm').addEventListener('submit', onChangePin);
  $('#changeUserForm').addEventListener('submit', onChangeUser);
  $('#legacyMergeBtn').addEventListener('click', onLegacyMerge);
  $('#legacyDeleteBtn').addEventListener('click', onLegacyDelete);
  $('#retryBtn').addEventListener('click', () => showLock());
  $('#exportBtn').addEventListener('click', onExport);
  $('#shareBtn').addEventListener('click', onShareBackup);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImport);
  $('#replaceBtn').addEventListener('click', () => $('#replaceFile').click());
  $('#replaceFile').addEventListener('change', onReplace);
  $('#wipeBtn').addEventListener('click', onWipe);
  $('#plainImportBtn').addEventListener('click', () => $('#plainImportFile').click());
  $('#plainImportFile').addEventListener('change', onPlainImport);
  $('#viewerDlg').addEventListener('close', () => { dropUrl(viewerUrl); viewerUrl = null; $('#viewerBody').replaceChildren(); });

  document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => {
    const d = b.closest('dialog');
    if (d.id === 'editDlg') closeEditDialog(); else d.close();
  }));
  // 背景タップで閉じる（編集中の画面は誤操作で消えないよう対象外）
  document.querySelectorAll('dialog:not(#editDlg)').forEach((d) =>
    d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); }));
  $('#editDlg').addEventListener('cancel', (ev) => { ev.preventDefault(); closeEditDialog(); });

  ['pointerdown', 'keydown', 'scroll', 'input'].forEach((t) => document.addEventListener(t, touch, { passive: true, capture: true }));
  setInterval(checkAutoLock, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAutoLock(); });

  ['#installBtn', '#installLockBtn', '#installSettingsBtn'].forEach((id) => $(id).addEventListener('click', onInstall));
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvt = ev; updateInstallUi(); });
  window.addEventListener('appinstalled', () => { installEvt = null; updateInstallUi(); toast('インストールしました'); });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', updateInstallUi);
  updateInstallUi();

  showLock();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
