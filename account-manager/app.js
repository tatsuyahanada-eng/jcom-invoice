'use strict';

/* =========================================================
 * アカウントマネージャー
 *
 * 【保存の仕組み】
 * - 保存先は端末内の IndexedDB（容量が大きく、添付ファイルも保存できる）
 * - 全データは「データ鍵」(AES-256-GCM) で暗号化。データ鍵は管理者パスワード
 *   から PBKDF2-SHA256 で作った鍵で暗号化して保存（パスワード変更時は鍵だけ掛け替え）
 * - 添付ファイルも1件ずつ暗号化して保存。ファイル名などの情報は本体側に暗号化して保持
 *
 * 【消えないための対策】
 * - 保存ごとに直前の状態を「復元ポイント」として最大 MAX_SNAPSHOTS 件保持
 * - 削除したアカウントはゴミ箱へ（TRASH_DAYS 日間は復元可）
 * - ブラウザに「永続ストレージ」を要求（容量不足時の自動削除を防ぐ）
 * - 保存は1トランザクションで行い、別タブでの同時編集による上書きを検知
 * - 保存に失敗した場合は画面上の変更を確定させない
 * - 暗号化バックアップ（添付ファイル込み）の書き出し・復元、未バックアップ時の通知
 * ========================================================= */

const DB_NAME = 'account-manager';
const LEGACY_VAULT_KEY = 'am.vault';   // 旧版（localStorage保存）
const PREFS_KEY = 'am.prefs';
const FAIL_KEY = 'am.fail';
const KDF_ITER = 600000;
const CATEGORIES = ['個人用', '仕事用', 'その他'];
const OLD_PW_DAYS = 180;
const CLIPBOARD_CLEAR_SEC = 30;
const MAX_SNAPSHOTS = 50;
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
function fileIcon(type) {
  if ((type || '').startsWith('image/')) return '🖼';
  if (type === 'application/pdf') return '📕';
  return '📄';
}

/* ---------- IndexedDB ---------- */
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('meta');
        d.createObjectStore('files');
        d.createObjectStore('snapshots', { keyPath: 'sid', autoIncrement: true });
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
const idbGet = (s, k) => idb(s, 'readonly', (os) => os.get(k));
const idbAll = (s) => idb(s, 'readonly', (os) => os.getAll());
const idbKeys = (s) => idb(s, 'readonly', (os) => os.getAllKeys());
const idbPut = (s, v, k) => idb(s, 'readwrite', (os) => os.put(v, k));
const idbDel = (s, k) => idb(s, 'readwrite', (os) => os.delete(k));

/* ---------- 暗号化 ---------- */
async function deriveKek(password, saltBytes, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function aesEnc(k, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data);
  return { iv, ct };
}
const aesDec = (k, iv, ct) => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct);
const importDek = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function wrapDek(password, raw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(password, salt, KDF_ITER);
  const w = await aesEnc(kek, raw);
  return { iter: KDF_ITER, salt: b64(salt), wkIv: b64(w.iv), wk: b64(w.ct) };
}
/** パスワードでデータ鍵を取り出す。違う場合は例外 */
async function unwrapDekRaw(hdr, password) {
  const kek = await deriveKek(password, unb64(hdr.salt), hdr.iter);
  return new Uint8Array(await aesDec(kek, unb64(hdr.wkIv), unb64(hdr.wk)));
}
async function decryptJson(k, ivB64, ctB64) {
  return JSON.parse(dec.decode(await aesDec(k, unb64(ivB64), unb64(ctB64))));
}
function normalize(data) {
  data.entries = data.entries || [];
  data.trash = data.trash || [];
  return data;
}

/* ---------- 保存 ---------- */
class ConflictError extends Error {}

/** 暗号化して保存。直前の状態は復元ポイントへ。別タブで更新されていたら中止 */
async function persist(data, newHeader = header) {
  const { iv, ct } = await aesEnc(dek, enc.encode(JSON.stringify(data)));
  const rec = { v: 2, ...newHeader, iv: b64(iv), ct: b64(ct), rev: rev + 1, n: data.entries.length, savedAt: Date.now() };
  const tx = (await db()).transaction(['meta', 'snapshots'], 'readwrite');
  const meta = tx.objectStore('meta');
  const snaps = tx.objectStore('snapshots');
  let conflict = false;
  meta.get('vault').onsuccess = (ev) => {
    const cur = ev.target.result;
    if (cur && cur.rev !== rev) { conflict = true; tx.abort(); return; }
    if (cur) snaps.add({ savedAt: cur.savedAt, rev: cur.rev, n: cur.n, iv: cur.iv, ct: cur.ct });
    meta.put(rec, 'vault');
    snaps.count().onsuccess = (e2) => {
      let extra = e2.target.result - MAX_SNAPSHOTS;
      if (extra <= 0) return;
      snaps.openCursor().onsuccess = (e3) => {
        const c = e3.target.result;
        if (c && extra-- > 0) { c.delete(); c.continue(); }
      };
    };
  };
  try { await txDone(tx); }
  catch (e) { throw conflict ? new ConflictError() : e; }
  rev = rec.rev;
  header = newHeader;
  prefs.lastChangeAt = Date.now();
  savePrefs();
  updateBackupBanner();
}

/** 保存済みの最新データを読み直す（別タブで更新された場合） */
async function reloadVault() {
  const rec = await idbGet('meta', 'vault');
  vault = normalize(await decryptJson(dek, rec.iv, rec.ct));
  header = { iter: rec.iter, salt: rec.salt, wkIv: rec.wkIv, wk: rec.wk };
  rev = rec.rev;
}

/** 変更を複製に適用して保存。成功したときだけ画面のデータに反映。
 *  別タブで先に保存されていたら、最新データを読み直して同じ変更をやり直す */
async function commit(mutate) {
  for (let attempt = 0; ; attempt++) {
    try {
      const next = structuredClone(vault);
      const r = mutate(next) || next;
      await persist(r);
      vault = r;
      return true;
    } catch (e) {
      if (e instanceof ConflictError && attempt === 0) {
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
  if (e instanceof ConflictError) {
    alert('別のタブ／ウィンドウでデータが更新されています。上書きを防ぐため保存を中止しました。\nロックして開き直します。');
    lock();
  } else if (e && e.name === 'QuotaExceededError') {
    alert('端末の空き容量が不足しているため保存できませんでした。\n大きな添付ファイルを減らすか、端末の空き容量を増やしてください。');
  } else {
    alert('保存に失敗しました。変更は確定していません。\n' + (e && e.message ? e.message : e));
  }
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* 非対応 */ }
}

/* ---------- 添付ファイル ---------- */
async function storeFile(file) {
  const id = uid();
  const { iv, ct } = await aesEnc(dek, await file.arrayBuffer());
  await idbPut('files', { iv, ct, addedAt: Date.now() }, id);
  return { id, name: file.name || 'ファイル', type: file.type || 'application/octet-stream', size: file.size, addedAt: Date.now() };
}
async function loadFile(att) {
  const rec = await idbGet('files', att.id);
  if (!rec) throw new Error('ファイルが見つかりません');
  return new Blob([await aesDec(dek, rec.iv, rec.ct)], { type: att.type });
}

/** どこからも参照されていないファイルを削除（復元ポイントで参照中のものは残す） */
async function cleanupFiles() {
  try {
    const keep = new Set();
    const addFrom = (data) => [...(data.entries || []), ...(data.trash || [])]
      .forEach((e) => (e.attachments || []).forEach((a) => keep.add(a.id)));
    addFrom(vault);
    for (const s of await idbAll('snapshots')) addFrom(await decryptJson(dek, s.iv, s.ct));
    const day = Date.now() - 86400000;
    const tx = (await db()).transaction('files', 'readwrite');
    tx.objectStore('files').openCursor().onsuccess = (ev) => {
      const c = ev.target.result;
      if (!c) return;
      if (!keep.has(c.key) && (c.value.addedAt || 0) < day) c.delete();
      c.continue();
    };
    await txDone(tx);
  } catch (e) {
    console.warn('cleanup skipped', e);   // 失敗時は何も消さない
  }
}

/* ---------- ロック画面 ---------- */
async function vaultExists() {
  return !!(await idbGet('meta', 'vault')) || !!localStorage.getItem(LEGACY_VAULT_KEY);
}

async function showLock() {
  $('#app').hidden = true;
  $('#lockScreen').hidden = false;
  $('#lockErr').textContent = '';
  $('#masterPw').value = '';
  $('#masterPw2').value = '';
  let first;
  try { first = !(await vaultExists()); }
  catch {
    $('#lockMsg').textContent = 'データ保存領域を開けませんでした。プライベートブラウズを解除するか、ブラウザを変えてお試しください。';
    return;
  }
  $('#masterPw2Wrap').hidden = !first;
  $('#masterPw2').required = first;
  $('#restoreWrap').hidden = !first;
  $('#masterPw').autocomplete = first ? 'new-password' : 'current-password';
  $('#lockMsg').textContent = first
    ? '最初に管理者パスワードを設定してください。'
    : '管理者パスワードを入力してください。';
  $('#lockBtn').textContent = first ? '設定して開始' : 'ロック解除';
  $('#lockNote').textContent = first
    ? '※ 管理者パスワードを忘れるとデータは復元できません。8文字以上で、忘れないものを設定してください。'
    : '';
  $('#masterPw').focus();
}

function failState() {
  try { return JSON.parse(localStorage.getItem(FAIL_KEY) || '{"n":0,"until":0}'); } catch { return { n: 0, until: 0 }; }
}

async function onLockSubmit(e) {
  e.preventDefault();
  const pw = $('#masterPw').value;
  const err = $('#lockErr');
  const btn = $('#lockBtn');
  err.textContent = '';

  if (!window.crypto || !crypto.subtle) {
    err.textContent = 'このブラウザ/接続では暗号化機能が使えません。HTTPS で開いてください。';
    return;
  }

  const rec = await idbGet('meta', 'vault');
  const legacy = !rec && localStorage.getItem(LEGACY_VAULT_KEY);

  if (!rec && !legacy) {   // 初回設定
    if (pw.length < 8) { err.textContent = '8文字以上にしてください。'; return; }
    if (pw !== $('#masterPw2').value) { err.textContent = '確認用パスワードが一致しません。'; return; }
    btn.disabled = true; btn.textContent = '設定中…';
    try {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const hdr = await wrapDek(pw, raw);
      dek = await importDek(raw);
      raw.fill(0);
      rev = 0;
      await persist(normalize({}), hdr);
      vault = normalize({});
      enterApp();
    } catch (ex) {
      err.textContent = '保存に失敗しました: ' + ex.message;
    } finally {
      btn.disabled = false;
    }
    return;
  }

  const f = failState();
  if (f.until > Date.now()) {
    err.textContent = `入力ミスが続いたため ${Math.ceil((f.until - Date.now()) / 1000)} 秒待ってください。`;
    return;
  }
  btn.disabled = true; btn.textContent = '確認中…';
  try {
    if (rec) {
      const raw = await unwrapDekRaw(rec, pw);
      dek = await importDek(raw);
      raw.fill(0);
      vault = normalize(await decryptJson(dek, rec.iv, rec.ct));
      header = { iter: rec.iter, salt: rec.salt, wkIv: rec.wkIv, wk: rec.wk };
      rev = rec.rev;
    } else {
      await migrateLegacy(JSON.parse(legacy), pw);
    }
    localStorage.removeItem(FAIL_KEY);
    enterApp();
  } catch (ex) {
    if (ex && ex.name === 'OperationError') {   // 復号失敗＝パスワード違い
      f.n += 1;
      if (f.n >= 5) f.until = Date.now() + Math.min(300, 30 * 2 ** (f.n - 5)) * 1000;
      localStorage.setItem(FAIL_KEY, JSON.stringify(f));
      err.textContent = f.n >= 5
        ? 'パスワードが違います。しばらく待ってから再入力してください。'
        : `パスワードが違います。（${f.n}回目）`;
      $('#masterPw').select();
    } else {
      err.textContent = '読み込みに失敗しました: ' + (ex && ex.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'ロック解除';
  }
}

/** 旧版（localStorage）のデータを IndexedDB へ移行。確認できるまで旧データは消さない */
async function migrateLegacy(blob, pw) {
  const k = await deriveKek(pw, unb64(blob.salt), blob.iter || KDF_ITER);
  const data = normalize(JSON.parse(dec.decode(await aesDec(k, unb64(blob.iv), unb64(blob.ct)))));
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const hdr = await wrapDek(pw, raw);
  dek = await importDek(raw);
  raw.fill(0);
  rev = 0;
  await persist(data, hdr);
  const check = await idbGet('meta', 'vault');
  await decryptJson(dek, check.iv, check.ct);
  vault = data;
  localStorage.removeItem(LEGACY_VAULT_KEY);
}

async function enterApp() {
  $('#lockScreen').hidden = true;
  $('#app').hidden = false;
  $('#masterPw').value = '';
  $('#masterPw2').value = '';
  lastActivity = Date.now();
  $('#sortSel').value = prefs.sort;
  renderChips();
  renderList();
  updateBackupBanner();
  requestPersistentStorage();
  // ゴミ箱の期限切れを整理し、不要ファイルを掃除
  const limit = Date.now() - TRASH_DAYS * 86400000;
  if (vault.trash.some((t) => t.deletedAt < limit)) {
    await commit((v) => { v.trash = v.trash.filter((t) => t.deletedAt >= limit); });
  }
  setTimeout(() => { if (dek) cleanupFiles(); }, 3000);
}

function lock() {
  dek = null; vault = null; header = null; currentId = null; openId = null;
  editAtts = []; pendingFiles = [];
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('#list').replaceChildren();
  liveUrls.forEach((u) => URL.revokeObjectURL(u));
  liveUrls.clear();
  showLock();
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
    }, `${c} ${n}`);
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

function avatarColor(name) {
  let x = 0;
  for (const ch of name || '?') x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return `hsl(${x % 360} 55% 52%)`;
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
    h('div', { class: 'avatar', style: `background:${avatarColor(e.service)}` }, (e.service || '?').slice(0, 1).toUpperCase()),
    h('div', { class: 'card-main' },
      h('div', { class: 'card-title' },
        h('span', { class: 'name' }, ...highlight(e.service, terms)),
        h('span', { class: `badge ${e.category}` }, e.category),
        old && h('span', { class: 'badge old' }, '要更新'),
        nAtt > 0 && h('span', { class: 'badge att', title: '添付ファイル' }, `📎${nAtt}`)),
      e.account && h('div', { class: 'card-sub' }, ...highlight(e.account, terms))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, '›'));
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
    const thumb = h('div', { class: 'att-thumb' }, fileIcon(a.type));
    if (isImg) {
      loadFile(a).then((blob) => {
        const u = makeUrl(blob);
        urls.push(u);
        thumb.replaceChildren(h('img', { src: u, alt: '' }));
      }).catch(() => thumb.replaceChildren('⚠'));
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
      : h('div', { class: 'viewer-file' }, h('div', { class: 'viewer-icon' }, fileIcon(att.type)),
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
    h('span', { class: 'att-row-icon' }, fileIcon(it.type)),
    h('span', { class: 'att-row-name' }, it.name),
    it.isNew && h('span', { class: 'badge new' }, '追加'),
    h('span', { class: 'att-size' }, fmtSize(it.size)),
    h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': '外す', onclick: it.remove }, '✕'))));
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
  // データ保護の状態
  const lines = [];
  try {
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    lines.push(h('div', { class: 'status-row' }, h('span', null, '保存の保護'),
      h('span', { class: persisted ? 'ok' : 'warn' }, persisted ? '✓ 永続化済み' : '△ 未許可')));
    if (!persisted) lines.push(h('p', { class: 'muted small' },
      'ブラウザが容量不足時にデータを消す可能性があります。ホーム画面に追加（インストール）すると保護されやすくなります。定期的なバックアップをおすすめします。'));
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      lines.push(h('div', { class: 'status-row' }, h('span', null, '使用容量'),
        h('span', null, `${fmtSize(est.usage || 0)} / ${fmtSize(est.quota || 0)}`)));
    }
  } catch { /* 非対応 */ }
  lines.push(h('div', { class: 'status-row' }, h('span', null, '最終バックアップ'),
    h('span', { class: prefs.lastBackupAt ? '' : 'warn' }, prefs.lastBackupAt ? fmtDate(prefs.lastBackupAt) : '未実施')));
  $('#storageStatus').replaceChildren(...lines);

  // 復元ポイント
  const snaps = (await idbAll('snapshots')).sort((a, b) => b.sid - a.sid);
  $('#snapList').replaceChildren(
    snaps.length ? '' : h('p', { class: 'muted small' }, 'まだありません。保存するたびに直前の状態が自動で記録されます。'),
    ...snaps.slice(0, 20).map((s) => h('div', { class: 'list-row' },
      h('span', null, fmtDate(s.savedAt), h('span', { class: 'muted small' }, `　${s.n ?? '?'}件`)),
      h('button', { class: 'btn sm', type: 'button', onclick: () => restoreSnapshot(s) }, 'この時点に戻す'))));

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
  try { data = normalize(await decryptJson(dek, s.iv, s.ct)); }
  catch { alert('この復元ポイントは読み込めませんでした。'); return; }
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
  let raw;
  try { raw = await unwrapDekRaw(header, oldPw); }
  catch { err.textContent = '現在のパスワードが違います。'; return; }
  const newHdr = await wrapDek(n1, raw);
  raw.fill(0);
  try { await persist(vault, newHdr); }
  catch (e) { reportSaveError(e); return; }
  ev.target.reset();
  toast('管理者パスワードを変更しました。今後のバックアップは新しいパスワードで開きます。', 4000);
}

/* ---------- バックアップ ---------- */
async function buildBackup() {
  await persist(vault);   // 最新状態を確定
  const rec = await idbGet('meta', 'vault');
  const ids = new Set();
  [...vault.entries, ...vault.trash].forEach((e) => (e.attachments || []).forEach((a) => ids.add(a.id)));
  const files = {};
  for (const id of ids) {
    const f = await idbGet('files', id);
    if (f) files[id] = { iv: b64(f.iv), ct: b64(f.ct) };
  }
  const { rev: _r, ...vaultRec } = rec;
  const json = JSON.stringify({ app: 'account-manager', format: 2, exportedAt: Date.now(), vault: vaultRec, files });
  const name = `account-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return { blob: new Blob([json], { type: 'application/json' }), name, nFiles: Object.keys(files).length };
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
      await navigator.share({ files: [file], title: 'アカウントマネージャー バックアップ' });
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

/** バックアップのファイルを現在のデータ鍵で暗号化し直して保存 */
async function importFiles(bk, dekB, atts) {
  for (const a of atts) {
    const f = bk.files[a.id];
    if (!f || (await idbGet('files', a.id))) continue;
    const plain = await aesDec(dekB, unb64(f.iv), unb64(f.ct));
    const { iv, ct } = await aesEnc(dek, plain);
    await idbPut('files', { iv, ct, addedAt: Date.now() }, a.id);
  }
}

/** 設定画面から：今のデータにバックアップを統合 */
async function onImport(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let bk;
  try { bk = await readBackupFile(file); }
  catch { toast('バックアップファイルの形式が正しくありません'); return; }
  const pw = await askPassword('バックアップ作成時の管理者パスワードを入力してください。');
  if (pw == null) return;
  let opened;
  try { opened = await openBackup(bk, pw); }
  catch { toast('パスワードが違うため読み込めませんでした'); return; }

  try {
    const { data, dekB } = opened;
    const toTake = data.entries.filter((inc) => {
      const cur = vault.entries.find((x) => x.id === inc.id);
      return !cur || (inc.updatedAt || 0) > (cur.updatedAt || 0);
    });
    if (dekB) await importFiles(bk, dekB, toTake.flatMap((e) => e.attachments || []));
    let added = 0, updated = 0;
    const ok = await commit((v) => {
      for (const inc of toTake) {
        const i = v.entries.findIndex((x) => x.id === inc.id);
        if (i < 0) { v.entries.push(inc); added++; } else { v.entries[i] = inc; updated++; }
      }
    });
    if (!ok) return;
    renderChips(); renderList();
    toast(`インポート完了：追加 ${added}件 / 更新 ${updated}件`, 3500);
  } catch (e) { reportSaveError(e); }
}

/** 初回画面から：バックアップで丸ごと復元（新しい端末への移行用） */
async function onRestoreFirst(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  const err = $('#lockErr');
  err.textContent = '';
  let bk;
  try { bk = await readBackupFile(file); }
  catch { err.textContent = 'バックアップファイルの形式が正しくありません。'; return; }
  const pw = await askPassword('バックアップ作成時の管理者パスワードを入力してください。復元後はこのパスワードでロック解除します。');
  if (pw == null) return;
  $('#lockMsg').textContent = '復元中…';
  try {
    const { data, dekB } = await openBackup(bk, pw);
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const hdr = await wrapDek(pw, raw);
    dek = await importDek(raw);
    raw.fill(0);
    if (dekB) await importFiles(bk, dekB, [...data.entries, ...data.trash].flatMap((e) => e.attachments || []));
    rev = 0;
    await persist(data, hdr);
    vault = data;
    prefs.lastBackupAt = bk.exportedAt || Date.now();
    savePrefs();
    enterApp();
    toast(`復元しました（${data.entries.length}件）`, 3000);
  } catch (e) {
    dek = null;
    $('#lockMsg').textContent = '最初に管理者パスワードを設定してください。';
    err.textContent = e && e.name === 'OperationError' ? 'パスワードが違います。' : '復元に失敗しました: ' + (e && e.message);
  }
}

async function onWipe() {
  if (!confirm('すべてのアカウント・添付ファイル・復元ポイントと管理者パスワードを削除します。\n先にバックアップを取ることを強くおすすめします。よろしいですか？')) return;
  if (prompt('確認のため「削除」と入力してください') !== '削除') return;
  (await db()).close();
  dbPromise = null;
  await reqP(indexedDB.deleteDatabase(DB_NAME)).catch(() => {});
  localStorage.removeItem(LEGACY_VAULT_KEY);
  localStorage.removeItem(FAIL_KEY);
  prefs.lastBackupAt = 0; prefs.lastChangeAt = 0; savePrefs();
  lock();
  toast('すべてのデータを削除しました');
}

/* ---------- 自動ロック ---------- */
function touch() { lastActivity = Date.now(); }
function checkAutoLock() {
  if (!vault) return;
  if ($('#editDlg').open && pendingFiles.length) return;   // ファイル追加中はロックしない
  if (Date.now() - lastActivity > prefs.autoLockMin * 60000) lock();
}

/* ---------- 初期化 ---------- */
function init() {
  $('#lockForm').addEventListener('submit', onLockSubmit);
  $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', onRestoreFirst);
  $('#lockNowBtn').addEventListener('click', lock);
  $('#addBtn').addEventListener('click', () => openEdit(null));
  $('#search').addEventListener('input', renderList);
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
  $('#exportBtn').addEventListener('click', onExport);
  $('#shareBtn').addEventListener('click', onShareBackup);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImport);
  $('#wipeBtn').addEventListener('click', onWipe);
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

  showLock();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
