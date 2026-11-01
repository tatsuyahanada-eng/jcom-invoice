'use strict';

/* =========================================================
 * アカウントマネージャー
 * - データは端末内(localStorage)に AES-GCM で暗号化して保存
 * - 鍵は管理者パスワードから PBKDF2-SHA256 で導出（鍵はメモリ上のみ）
 * ========================================================= */

const VAULT_KEY = 'am.vault';
const PREFS_KEY = 'am.prefs';
const FAIL_KEY = 'am.fail';
const KDF_ITER = 600000;
const CATEGORIES = ['個人用', '仕事用', 'その他'];
const OLD_PW_DAYS = 180;          // この日数以上パスワード未変更なら「要更新」表示
const CLIPBOARD_CLEAR_SEC = 30;

const $ = (s) => document.querySelector(s);
const enc = new TextEncoder();
const dec = new TextDecoder();

let key = null;        // CryptoKey（ロック中は null）
let salt = null;       // Uint8Array
let vault = null;      // { entries: [] }（ロック中は null）
let filterCat = 'すべて';
let currentId = null;
let lastActivity = Date.now();
let prefs = loadPrefs();

/* ---------- 汎用 ---------- */
function b64(buf) {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
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
function daysSince(ts) { return Math.floor((Date.now() - ts) / 86400000); }
function uid() { return b64(crypto.getRandomValues(new Uint8Array(12))).replace(/[+/=]/g, ''); }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2000);
}
function loadPrefs() {
  try { return Object.assign({ autoLockMin: 5, sort: 'updated' }, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
  catch { return { autoLockMin: 5, sort: 'updated' }; }
}
function savePrefs() { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }

/* ---------- 暗号化 ---------- */
async function deriveKey(password, saltBytes, iter = KDF_ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptVault(k, s, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(data)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt: b64(s), iv: b64(iv), ct: b64(ct), savedAt: Date.now() };
}
async function decryptVault(blob, password) {
  const s = unb64(blob.salt);
  const k = await deriveKey(password, s, blob.iter || KDF_ITER);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, k, unb64(blob.ct));
  return { key: k, salt: s, data: JSON.parse(dec.decode(pt)) };
}
function storedVault() {
  try { return JSON.parse(localStorage.getItem(VAULT_KEY) || 'null'); } catch { return null; }
}
async function persist() {
  const blob = await encryptVault(key, salt, vault);
  localStorage.setItem(VAULT_KEY, JSON.stringify(blob));
}

/* ---------- ロック画面 ---------- */
function showLock() {
  const first = !storedVault();
  $('#app').hidden = true;
  $('#lockScreen').hidden = false;
  $('#masterPw2Wrap').hidden = !first;
  $('#masterPw2').required = first;
  $('#masterPw').autocomplete = first ? 'new-password' : 'current-password';
  $('#lockMsg').textContent = first
    ? '最初に管理者パスワードを設定してください。'
    : '管理者パスワードを入力してください。';
  $('#lockBtn').textContent = first ? '設定して開始' : 'ロック解除';
  $('#lockNote').textContent = first
    ? '※ 管理者パスワードを忘れるとデータは復元できません。8文字以上で、忘れないものを設定してください。'
    : '';
  $('#lockErr').textContent = '';
  $('#masterPw').value = '';
  $('#masterPw2').value = '';
  setTimeout(() => $('#masterPw').focus(), 50);
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

  const existing = storedVault();
  if (!existing) {
    if (pw.length < 8) { err.textContent = '8文字以上にしてください。'; return; }
    if (pw !== $('#masterPw2').value) { err.textContent = '確認用パスワードが一致しません。'; return; }
    btn.disabled = true; btn.textContent = '設定中…';
    salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(pw, salt);
    vault = { entries: [] };
    await persist();
    btn.disabled = false;
    enterApp();
    return;
  }

  const f = failState();
  if (f.until > Date.now()) {
    err.textContent = `入力ミスが続いたため ${Math.ceil((f.until - Date.now()) / 1000)} 秒待ってください。`;
    return;
  }
  btn.disabled = true; btn.textContent = '確認中…';
  try {
    const r = await decryptVault(existing, pw);
    key = r.key; salt = r.salt; vault = r.data;
    vault.entries = vault.entries || [];
    localStorage.removeItem(FAIL_KEY);
    enterApp();
  } catch {
    f.n += 1;
    if (f.n >= 5) f.until = Date.now() + Math.min(300, 30 * 2 ** (f.n - 5)) * 1000;
    localStorage.setItem(FAIL_KEY, JSON.stringify(f));
    err.textContent = f.n >= 5
      ? `パスワードが違います。しばらく待ってから再入力してください。`
      : `パスワードが違います。（${f.n}回目）`;
    $('#masterPw').select();
  } finally {
    btn.disabled = false;
    btn.textContent = 'ロック解除';
  }
}

function enterApp() {
  $('#lockScreen').hidden = true;
  $('#app').hidden = false;
  $('#masterPw').value = '';
  $('#masterPw2').value = '';
  lastActivity = Date.now();
  $('#sortSel').value = prefs.sort;
  renderChips();
  renderList();
}

function lock() {
  key = null; vault = null; currentId = null;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  $('#list').replaceChildren();
  showLock();
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
  return [e.service, e.account, e.loginId, e.url, (e.tags || []).join(' '), e.memo, e.category]
    .join(' ').toLowerCase();
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
  let items = vault.entries.filter((e) =>
    (filterCat === 'すべて' || e.category === filterCat) &&
    terms.every((t) => searchText(e).includes(t)));

  const sort = $('#sortSel').value;
  items.sort((a, b) =>
    sort === 'service' ? a.service.localeCompare(b.service, 'ja') :
    sort === 'updatedAsc' ? a.updatedAt - b.updatedAt :
    b.updatedAt - a.updatedAt);

  $('#countLabel').textContent = `${items.length} 件`;
  $('#empty').hidden = vault.entries.length > 0;
  if (vault.entries.length > 0 && items.length === 0) {
    $('#list').replaceChildren(h('p', { class: 'empty' }, '該当するアカウントがありません。'));
    return;
  }

  $('#list').replaceChildren(...items.map((e) => {
    const old = e.password && daysSince(e.pwChangedAt || e.updatedAt) >= OLD_PW_DAYS;
    return h('div', { class: 'card', onclick: () => openDetail(e.id) },
      h('div', { class: 'avatar', style: `background:${avatarColor(e.service)}` }, (e.service || '?').slice(0, 1).toUpperCase()),
      h('div', { class: 'card-main' },
        h('div', { class: 'card-title' },
          h('span', { class: 'name' }, ...highlight(e.service, terms)),
          h('span', { class: `badge ${e.category}` }, e.category),
          old && h('span', { class: 'badge old' }, '要更新')),
        h('div', { class: 'card-sub' },
          ...highlight([e.account, e.loginId].filter(Boolean).join(' ・ ') || '（IDなし）', terms)),
        h('div', { class: 'card-sub' }, `更新: ${fmtDate(e.updatedAt)}`)),
      h('div', { class: 'card-copy' },
        e.loginId && h('button', { class: 'btn sm ghost', onclick: (ev) => { ev.stopPropagation(); copy(e.loginId, 'ID'); } }, 'ID'),
        e.password && h('button', { class: 'btn sm ghost', onclick: (ev) => { ev.stopPropagation(); copy(e.password, 'パスワード'); } }, 'PW')));
  }));
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
    class: 'btn sm ghost',
    onclick: () => { shown = !shown; span.textContent = shown ? value : '••••••••'; btn.textContent = shown ? '隠す' : '表示'; },
  }, '表示');
  return { span, btn };
}

function openDetail(id) {
  const e = vault.entries.find((x) => x.id === id);
  if (!e) return;
  currentId = id;
  $('#dService').textContent = e.service;

  const rows = [];
  const row = (k, v, ...actions) => h('div', { class: 'kv-row' },
    h('span', { class: 'kv-k' }, k), v, actions.length ? h('span', { class: 'kv-actions' }, ...actions) : null);

  rows.push(row('区分', h('span', { class: 'kv-v' }, h('span', { class: `badge ${e.category}` }, e.category))));
  if (e.account) rows.push(row('アカウント', h('span', { class: 'kv-v' }, e.account)));
  if (e.loginId) rows.push(row('ID', h('span', { class: 'kv-v mono' }, e.loginId),
    h('button', { class: 'btn sm ghost', onclick: () => copy(e.loginId, 'ID') }, 'コピー')));
  if (e.password) {
    const m = maskedValue(e.password);
    rows.push(row('パスワード', m.span, m.btn,
      h('button', { class: 'btn sm ghost', onclick: () => copy(e.password, 'パスワード') }, 'コピー')));
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

  const hist = (e.history || []).slice().reverse();
  const histEl = h('div', { class: 'history' },
    h('h3', null, `変更前の履歴（${hist.length}件）`),
    hist.length === 0 ? h('p', { class: 'muted small' }, 'まだ変更履歴はありません。ID やパスワードを変更すると、変更前の値がここに残ります。') : null,
    ...hist.map((x) => {
      const lines = [];
      if (x.prevLoginId !== undefined) lines.push(h('div', { class: 'hist-line' }, '旧ID:', h('code', null, x.prevLoginId || '(なし)')));
      if (x.prevPassword !== undefined) {
        const m = maskedValue(x.prevPassword || '(なし)');
        m.span.className = '';
        const code = h('code', null, m.span);
        lines.push(h('div', { class: 'hist-line' }, '旧PW:', code, m.btn,
          x.prevPassword && h('button', { class: 'btn sm ghost', onclick: () => copy(x.prevPassword, '旧パスワード') }, 'コピー')));
      }
      return h('div', { class: 'hist-item' },
        h('div', { class: 'hist-date' }, `${fmtDate(x.changedAt)} に変更${x.note ? ' ・ ' + x.note : ''}`),
        ...lines);
    }));

  $('#dBody').replaceChildren(h('div', { class: 'kv' }, ...rows), histEl);
  $('#detailDlg').showModal();
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
  updateStrength();
  $('#serviceList').replaceChildren(...[...new Set(vault.entries.map((x) => x.service))].map((s) => h('option', { value: s })));
  $('#editDlg').showModal();
  if (!e) setTimeout(() => $('#fService').focus(), 50);
}

async function onEditSubmit(ev) {
  ev.preventDefault();
  const service = $('#fService').value.trim();
  if (!service) return;
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
  };

  if (currentId) {
    const e = vault.entries.find((x) => x.id === currentId);
    const idChanged = e.loginId !== data.loginId;
    const pwChanged = e.password !== data.password;
    if (idChanged || pwChanged) {
      const rec = { changedAt: now, note: $('#fChangeNote').value.trim() };
      if (idChanged) rec.prevLoginId = e.loginId;
      if (pwChanged) rec.prevPassword = e.password;
      e.history = [...(e.history || []), rec];
      if (pwChanged) e.pwChangedAt = now;
    }
    Object.assign(e, data, { updatedAt: now });
  } else {
    vault.entries.push({ id: uid(), ...data, createdAt: now, updatedAt: now, pwChangedAt: now, history: [] });
  }
  await persist();
  $('#editDlg').close();
  const reopen = currentId;
  renderChips();
  renderList();
  if (reopen) openDetail(reopen);
  toast('保存しました');
}

async function onDelete() {
  const e = vault.entries.find((x) => x.id === currentId);
  if (!e || !confirm(`「${e.service}」を削除しますか？（履歴も削除されます）`)) return;
  vault.entries = vault.entries.filter((x) => x.id !== currentId);
  await persist();
  $('#detailDlg').close();
  renderChips();
  renderList();
  toast('削除しました');
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

/* ---------- 設定 ---------- */
async function onChangeMaster(ev) {
  ev.preventDefault();
  const err = $('#cpErr');
  err.textContent = '';
  const oldPw = $('#cpOld').value, n1 = $('#cpNew').value, n2 = $('#cpNew2').value;
  if (n1.length < 8) { err.textContent = '新しいパスワードは8文字以上にしてください。'; return; }
  if (n1 !== n2) { err.textContent = '確認用パスワードが一致しません。'; return; }
  try { await decryptVault(storedVault(), oldPw); }
  catch { err.textContent = '現在のパスワードが違います。'; return; }
  salt = crypto.getRandomValues(new Uint8Array(16));
  key = await deriveKey(n1, salt);
  await persist();
  ev.target.reset();
  toast('管理者パスワードを変更しました');
}

async function onExport() {
  await persist();
  const blob = new Blob([JSON.stringify({ app: 'account-manager', ...storedVault() }, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `account-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('バックアップを保存しました');
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

async function onImport(ev) {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  let blob;
  try { blob = JSON.parse(await file.text()); if (!blob.ct || !blob.iv || !blob.salt) throw 0; }
  catch { toast('バックアップファイルの形式が正しくありません'); return; }
  const pw = await askPassword('バックアップ作成時の管理者パスワードを入力してください。');
  if (pw == null) return;
  let data;
  try { data = (await decryptVault(blob, pw)).data; }
  catch { toast('パスワードが違うため読み込めませんでした'); return; }

  let added = 0, updated = 0;
  for (const inc of data.entries || []) {
    const cur = vault.entries.find((x) => x.id === inc.id);
    if (!cur) { vault.entries.push(inc); added++; }
    else if ((inc.updatedAt || 0) > (cur.updatedAt || 0)) { Object.assign(cur, inc); updated++; }
  }
  await persist();
  renderChips();
  renderList();
  toast(`インポート完了：追加 ${added}件 / 更新 ${updated}件`);
}

function onWipe() {
  if (!confirm('すべてのアカウントと管理者パスワードを削除します。よろしいですか？')) return;
  if (prompt('確認のため「削除」と入力してください') !== '削除') return;
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(FAIL_KEY);
  lock();
  toast('すべてのデータを削除しました');
}

/* ---------- 自動ロック ---------- */
function touch() { lastActivity = Date.now(); }
function checkAutoLock() {
  if (vault && Date.now() - lastActivity > prefs.autoLockMin * 60000) lock();
}

/* ---------- 初期化 ---------- */
function init() {
  $('#lockForm').addEventListener('submit', onLockSubmit);
  $('#lockNowBtn').addEventListener('click', lock);
  $('#addBtn').addEventListener('click', () => openEdit(null));
  $('#search').addEventListener('input', renderList);
  $('#sortSel').addEventListener('change', () => { prefs.sort = $('#sortSel').value; savePrefs(); renderList(); });
  $('#editForm').addEventListener('submit', onEditSubmit);
  $('#dEdit').addEventListener('click', () => { $('#detailDlg').close(); openEdit(currentId); });
  $('#dDelete').addEventListener('click', onDelete);
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
  $('#settingsBtn').addEventListener('click', () => {
    $('#autoLockSel').value = String(prefs.autoLockMin);
    $('#cpErr').textContent = '';
    $('#settingsDlg').showModal();
  });
  $('#autoLockSel').addEventListener('change', () => { prefs.autoLockMin = Number($('#autoLockSel').value); savePrefs(); toast('自動ロックを変更しました'); });
  $('#changePwForm').addEventListener('submit', onChangeMaster);
  $('#exportBtn').addEventListener('click', onExport);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImport);
  $('#wipeBtn').addEventListener('click', onWipe);

  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (ev) => { if (ev.target === d) d.close(); }));   // 背景タップで閉じる

  ['pointerdown', 'keydown', 'scroll', 'input'].forEach((t) => document.addEventListener(t, touch, { passive: true, capture: true }));
  setInterval(checkAutoLock, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAutoLock(); });

  showLock();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
