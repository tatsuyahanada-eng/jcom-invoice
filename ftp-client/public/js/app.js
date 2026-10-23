// APP UP FTP Manager - main UI.
import { vault } from './vault.js';
import { Relay } from './relay.js';
import * as lfs from './localfs.js';
import { extractArchive, isArchive } from './archive/index.js';
import { safeSegments } from './archive/util.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// Build DOM safely (file names are untrusted: always textContent, never innerHTML).
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const fmtSize = (n) => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); };
const rjoin = (...p) => ('/' + p.join('/')).replace(/\/+/g, '/').replace(/(.)\/$/, '$1');
const validName = (n) => n && n !== '.' && n !== '..' && !/[\/\\\0\r\n]/.test(n);

// ---------- toast / dialogs ----------
let toastTimer;
function toast(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (error ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), error ? 6000 : 2500);
}

function ask({ title, message = '', input = null, type = 'text', okText = 'OK', danger = false }) {
  const dlg = $('#askDlg');
  $('#askTitle').textContent = title;
  $('#askMsg').textContent = message;
  const inp = $('#askInput');
  inp.hidden = input === null;
  inp.type = type;
  inp.value = input ?? '';
  inp.required = input !== null;
  const ok = $('#askOk');
  ok.textContent = okText;
  ok.className = danger ? 'danger' : 'primary';
  return new Promise((resolve) => {
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? (input === null ? true : inp.value) : null);
    dlg.returnValue = '';
    dlg.showModal();
    if (input !== null) { inp.focus(); inp.select(); }
  });
}
const confirmAsk = (title, message, okText = 'OK', danger = false) => ask({ title, message, okText, danger });

// ---------- jobs (progress panel) ----------
function job(label) {
  $('#jobs').hidden = false;
  const bar = h('i');
  const text = h('div', {}, label);
  const li = h('li', {}, text, h('div', { class: 'bar' }, bar));
  $('#jobList').prepend(li);
  return {
    progress(done, total, sub) {
      bar.style.width = `${total ? Math.min(100, (done / total) * 100) : 0}%`;
      text.textContent = sub ? `${label} - ${sub}` : label;
    },
    done(msg) { li.className = 'done'; bar.style.width = '100%'; text.textContent = msg || `${label} 完了`; },
    fail(err) { li.className = 'fail'; text.textContent = `${label} 失敗: ${err.message || err}`; },
  };
}

// ---------- state ----------
const relay = new Relay(() => vault.data?.relayToken || '');
const state = {
  roots: [], // { key, label, handle, isOpfs }
  local: { root: null, segs: [], items: [], sel: new Set() },
  remote: { path: '/', items: [], sel: new Set(), profile: null },
  clip: null, // { op, side, items:[{name,type}], local:{root,segs}, remotePath }
  active: 'local',
};

// ---------- lock / unlock ----------
let lastActivity = Date.now();
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, () => (lastActivity = Date.now()), { passive: true }));
setInterval(() => {
  if (!vault.isUnlocked()) return;
  const min = vault.data.settings.autoLockMin || 10;
  if (Date.now() - lastActivity > min * 60000) lockApp('一定時間操作がなかったためロックしました');
}, 15000);

async function lockApp(msg) {
  await relay.disconnect();
  vault.lock();
  setConnState();
  renderRemote();
  showLock(msg);
}

function showLock(msg = '') {
  const first = !vault.exists();
  $('#lockMsg').textContent = msg || (first
    ? '最初にマスターパスワードを設定してください。サーバ情報はこのパスワードで暗号化して端末内に保存されます。'
    : 'マスターパスワードを入力してください');
  $('#lockPw2').hidden = !first;
  $('#lockPw2').required = first;
  $('#lockPw').autocomplete = first ? 'new-password' : 'current-password';
  $('#lockSubmit').textContent = first ? '設定して開始' : 'ロック解除';
  $('#resetBtn').hidden = first;
  $('#lockErr').textContent = '';
  $('#lockPw').value = '';
  $('#lockPw2').value = '';
  const dlg = $('#lockDlg');
  if (!dlg.open) dlg.showModal();
  $('#lockPw').focus();
}

$('#lockDlg').addEventListener('cancel', (e) => e.preventDefault()); // can't Esc out
$('#lockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('#lockPw').value;
  const btn = $('#lockSubmit');
  btn.disabled = true;
  $('#lockErr').textContent = '';
  try {
    if (!vault.exists()) {
      if (pw !== $('#lockPw2').value) throw new Error('パスワードが一致しません');
      await vault.create(pw);
    } else {
      await vault.unlock(pw);
    }
    $('#lockDlg').close();
    lastActivity = Date.now();
    renderServerSelect();
    if (!vault.data.relayToken) openSettings('最初に中継サーバのアクセストークンを入力してください');
  } catch (err) {
    $('#lockErr').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$('#lockBtn').onclick = () => lockApp('ロックしました');
$('#resetBtn').onclick = async () => {
  if (await confirmAsk('初期化', '保存したサーバ情報・設定をすべて削除します。元に戻せません。', '初期化する', true)) {
    vault.reset();
    showLock();
  }
};
$('#importBackupBtn').onclick = () => $('#backupInput').click();
$('#backupInput').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    await vault.importText(await f.text());
    showLock('バックアップを読み込みました。そのバックアップのマスターパスワードで解除してください');
  } catch (err) { $('#lockErr').textContent = err.message; }
};

// ---------- settings ----------
function openSettings(msg) {
  const f = $('#settingsForm');
  f.relayToken.value = vault.data.relayToken || '';
  f.autoLockMin.value = vault.data.settings.autoLockMin || 10;
  f.savePasswords.checked = vault.data.settings.savePasswords !== false;
  $('#relayStatus').textContent = msg || '';
  $('#secureInfo').textContent = window.isSecureContext
    ? `この画面は安全な接続 (${location.protocol}) で開かれています。`
    : '警告: 安全でない接続で開かれています。HTTPS か localhost で開いてください。';
  $('#settingsDlg').showModal();
}
$('#settingsBtn').onclick = () => vault.isUnlocked() && openSettings();
$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  vault.data.relayToken = f.relayToken.value.trim();
  vault.data.settings.autoLockMin = Number(f.autoLockMin.value) || 10;
  vault.data.settings.savePasswords = f.savePasswords.checked;
  if (!f.savePasswords.checked) vault.data.servers.forEach((s) => (s.password = ''));
  await vault.save();
  const ok = await relay.ping().catch(() => false);
  $('#relayStatus').textContent = ok ? '中継サーバに接続できました ✓' : '中継サーバに接続できません。トークンと起動状態を確認してください';
  if (ok) { toast('設定を保存しました'); $('#settingsDlg').close(); }
});
$('#exportBackupBtn').onclick = () => {
  saveBlob(vault.exportBlob(), `appup-ftp-backup-${new Date().toISOString().slice(0, 10)}.json`);
  toast('暗号化バックアップを保存しました');
};
$('#changePwBtn').onclick = async () => {
  const oldPw = await ask({ title: '現在のマスターパスワード', input: '', type: 'password' });
  if (!oldPw) return;
  const newPw = await ask({ title: '新しいマスターパスワード（8文字以上）', input: '', type: 'password' });
  if (!newPw) return;
  const again = await ask({ title: '新しいマスターパスワード（確認）', input: '', type: 'password' });
  if (newPw !== again) return toast('パスワードが一致しません', true);
  try { await vault.changePassword(oldPw, newPw); toast('変更しました'); } catch (err) { toast(err.message, true); }
};
$('#clearWorkBtn').onclick = async () => {
  if (!(await confirmAsk('作業領域を空にする', 'アプリ内作業領域のファイルをすべて削除します。', '削除する', true))) return;
  const root = await navigator.storage.getDirectory();
  await root.removeEntry('workspace', { recursive: true }).catch(() => {});
  state.roots[0].handle = await lfs.opfsRoot();
  if (state.local.root.isOpfs) { state.local.root = state.roots[0]; state.local.segs = []; }
  await refreshLocal();
  toast('作業領域を空にしました');
};
$$('dialog [data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));

// ---------- servers ----------
function renderServerSelect() {
  const sel = $('#serverSel');
  const cur = sel.value;
  sel.replaceChildren(
    h('option', { value: '' }, vault.data.servers.length ? '— サーバを選択 —' : '— 「サーバ管理」で追加 —'),
    ...vault.data.servers.map((s) => h('option', { value: s.id }, `${s.name} (${s.host})`)),
  );
  sel.value = vault.data.servers.some((s) => s.id === cur) ? cur : (vault.data.lastServer || '');
}

function renderServerList() {
  const ul = $('#serverList');
  ul.replaceChildren(...(vault.data.servers.length ? vault.data.servers.map((s) => h('li', {},
    h('div', { class: 'info' },
      h('div', {}, h('b', {}, s.name), ' ', h('span', { class: `chip ${s.secure === 'none' ? 'plain' : 'on'}` }, s.secure === 'none' ? 'FTP' : 'FTPS')),
      h('div', { class: 'muted small' }, `${s.user || 'anonymous'}@${s.host}:${s.port || (s.secure === 'implicit' ? 990 : 21)} ${s.remoteDir || ''}`)),
    h('button', { onclick: () => editServer(s) }, '編集'),
    h('button', { onclick: () => duplicateServer(s) }, '複製'),
    h('button', { class: 'danger', onclick: () => deleteServer(s) }, '削除'),
  )) : [h('li', { class: 'muted' }, 'まだ登録がありません')]));
}

function editServer(s) {
  const f = $('#serverForm');
  f.hidden = false;
  f.reset();
  for (const k of ['id', 'name', 'host', 'port', 'user', 'remoteDir']) f[k].value = s?.[k] ?? '';
  f.secure.value = s?.secure || 'explicit';
  f.password.value = s?.password || '';
  f.password.placeholder = vault.data.settings.savePasswords === false ? '保存しない設定です（接続時に入力）' : '空欄なら接続時に入力';
  f.password.disabled = vault.data.settings.savePasswords === false;
  f.insecureTls.checked = !!s?.insecureTls;
  $('[data-role=plainWarn]', f).hidden = f.secure.value !== 'none';
  f.name.focus();
}
function duplicateServer(s) { editServer({ ...s, id: '', name: `${s.name} のコピー` }); }
async function deleteServer(s) {
  if (!(await confirmAsk('サーバ削除', `「${s.name}」を削除しますか？`, '削除', true))) return;
  vault.data.servers = vault.data.servers.filter((x) => x.id !== s.id);
  await vault.save();
  renderServerList();
  renderServerSelect();
}
$('#serversBtn').onclick = () => {
  if (!vault.isUnlocked()) return;
  $('#serverForm').hidden = true;
  renderServerList();
  $('#serversDlg').showModal();
};
$('#addServerBtn').onclick = () => editServer(null);
$('#serverForm').secure.onchange = (e) => ($('[data-role=plainWarn]').hidden = e.target.value !== 'none');
$('[data-role=cancel]', $('#serverForm')).onclick = () => ($('#serverForm').hidden = true);
$('#serverForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const host = f.host.value.trim().replace(/^s?ftps?:\/\//i, '').replace(/\/.*$/, '');
  if (!host) return toast('ホストを入力してください', true);
  const remoteDir = f.remoteDir.value.trim();
  const entry = {
    id: f.id.value || crypto.randomUUID(),
    name: f.name.value.trim(),
    host,
    port: Number(f.port.value) || null,
    user: f.user.value.trim(),
    password: vault.data.settings.savePasswords === false ? '' : f.password.value,
    secure: f.secure.value,
    insecureTls: f.insecureTls.checked,
    remoteDir: remoteDir ? rjoin(remoteDir) : '',
  };
  const i = vault.data.servers.findIndex((s) => s.id === entry.id);
  if (i >= 0) vault.data.servers[i] = entry; else vault.data.servers.push(entry);
  await vault.save();
  f.hidden = true;
  renderServerList();
  renderServerSelect();
  toast('保存しました');
});

// ---------- connect ----------
function setConnState() {
  const c = $('#connState');
  const p = state.remote.profile;
  if (relay.sid && p) {
    c.textContent = p.secure === 'none' ? '接続中 (暗号化なし)' : '接続中 (FTPS)';
    c.className = `chip ${p.secure === 'none' ? 'plain' : 'on'}`;
    $('#connectBtn').textContent = '切断';
    $('#remoteTitle').textContent = `${p.name} — ${p.host}`;
  } else {
    c.textContent = '未接続';
    c.className = 'chip off';
    $('#connectBtn').textContent = '接続';
    $('#remoteTitle').textContent = '';
  }
}

$('#connectBtn').onclick = async () => {
  if (!vault.isUnlocked()) return;
  if (relay.sid) {
    await relay.disconnect();
    state.remote.profile = null;
    state.remote.items = [];
    setConnState();
    renderRemote();
    return;
  }
  const p = vault.data.servers.find((s) => s.id === $('#serverSel').value);
  if (!p) return toast('接続するサーバを選んでください', true);
  await connectTo(p);
};
$('#serverSel').onchange = async () => {
  if (relay.sid) { await relay.disconnect(); state.remote.profile = null; setConnState(); renderRemote(); }
};

async function connectTo(p) {
  if (!vault.data.relayToken) return openSettings('アクセストークンを入力してください');
  let pw = p.password;
  if (!pw) {
    pw = await ask({ title: `${p.name} のパスワード`, input: '', type: 'password' });
    if (pw === null) return;
  }
  if (p.secure === 'none' && !(await confirmAsk('暗号化なし FTP', 'このサーバは暗号化なしで接続します。パスワードやファイルが盗み見られる可能性があります。続けますか？', '接続する'))) return;
  const btn = $('#connectBtn');
  btn.disabled = true;
  btn.textContent = '接続中…';
  try {
    const r = await relay.connect(p, pw);
    state.remote.profile = p;
    state.remote.path = p.remoteDir || r.pwd || '/';
    vault.data.lastServer = p.id;
    vault.save();
    setConnState();
    await refreshRemote();
    switchTab('remote');
    toast(`${p.name} に接続しました`);
  } catch (err) {
    toast(err.message, true);
    setConnState();
  } finally {
    btn.disabled = false;
    if (!relay.sid) btn.textContent = '接続';
  }
}

// ---------- local pane ----------
async function initRoots() {
  state.roots = [{ key: 'opfs', label: 'アプリ内作業領域', handle: await lfs.opfsRoot(), isOpfs: true }];
  for (const hd of await loadSavedHandles()) state.roots.push({ key: `dir:${hd.name}:${state.roots.length}`, label: `📁 ${hd.name}`, handle: hd, isOpfs: false });
  state.local.root = state.roots[0];
  renderRootSelect();
}

function renderRootSelect() {
  const sel = $('#rootSel');
  sel.replaceChildren(
    ...state.roots.map((r) => h('option', { value: r.key }, r.label)),
    ...(lfs.canPickFolder() ? [h('option', { value: '__pick' }, '＋ PC のフォルダを開く…')] : []),
    ...(state.roots.length > 1 ? [h('option', { value: '__forget' }, '開いたフォルダの一覧を消去')] : []),
  );
  sel.value = state.local.root.key;
}

$('#rootSel').onchange = async (e) => {
  const v = e.target.value;
  try {
    if (v === '__pick') {
      const hd = await lfs.pickFolder();
      const r = { key: `dir:${hd.name}:${state.roots.length}`, label: `📁 ${hd.name}`, handle: hd, isOpfs: false };
      state.roots.push(r);
      await saveHandles();
      state.local.root = r;
    } else if (v === '__forget') {
      state.roots = state.roots.slice(0, 1);
      await saveHandles();
      state.local.root = state.roots[0];
    } else {
      const r = state.roots.find((x) => x.key === v);
      if (!r.isOpfs && (await r.handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        if ((await r.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('フォルダへのアクセスが許可されませんでした');
      }
      state.local.root = r;
    }
    state.local.segs = [];
    await refreshLocal();
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, true);
  }
  renderRootSelect();
};

// Persist picked folder handles in IndexedDB (desktop only).
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('appup-ftp', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function loadSavedHandles() {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const q = db.transaction('kv').objectStore('kv').get('dirs');
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => res([]);
    });
  } catch { return []; }
}
async function saveHandles() {
  const db = await idb();
  db.transaction('kv', 'readwrite').objectStore('kv').put(state.roots.filter((r) => !r.isOpfs).map((r) => r.handle), 'dirs');
}

async function refreshLocal() {
  const L = state.local;
  try {
    L.items = sortItems(await lfs.list(L.root.handle, L.segs));
  } catch (err) {
    L.items = [];
    if (L.segs.length) { L.segs = []; return refreshLocal(); }
    toast(`ローカルを読めません: ${err.message}`, true);
  }
  L.sel = new Set([...L.sel].filter((n) => L.items.some((i) => i.name === n)));
  renderLocal();
  const u = await lfs.usage();
  $('#usage').textContent = u && L.root.isOpfs ? `使用 ${fmtSize(u.usage)} / ${fmtSize(u.quota)}` : '';
}

function sortItems(items) {
  return items.sort((a, b) => (a.type === 'dir') === (b.type === 'dir') ? a.name.localeCompare(b.name, 'ja', { numeric: true }) : a.type === 'dir' ? -1 : 1);
}

function renderList(side) {
  const S = state[side];
  const ul = side === 'local' ? $('#localList') : $('#remoteList');
  const pane = side === 'local' ? $('#localPane') : $('#remotePane');
  if (side === 'remote' && !relay.sid) {
    ul.replaceChildren(h('li', { class: 'empty' }, 'サーバに接続してください'));
  } else if (!S.items.length) {
    ul.replaceChildren(h('li', { class: 'empty' }, side === 'local' ? '空のフォルダです。「取り込み」でファイルを追加できます' : '空のフォルダです'));
  } else {
    ul.replaceChildren(...S.items.map((it) => {
      const cb = h('input', { type: 'checkbox', 'aria-label': `${it.name} を選択` });
      cb.checked = S.sel.has(it.name);
      const li = h('li', { class: `${it.type}${cb.checked ? ' sel' : ''}` },
        cb,
        h('span', { class: 'ico' }, it.type === 'dir' ? '📁' : it.type === 'link' ? '🔗' : isArchive(it.name) ? '🗜️' : '📄'),
        h('span', { class: 'name', title: it.name }, it.name),
        h('span', { class: 'meta' }, it.type === 'dir' ? fmtDate(it.mtime) : `${fmtSize(it.size)}  ${fmtDate(it.mtime)}`));
      const toggle = () => {
        if (S.sel.has(it.name)) S.sel.delete(it.name); else S.sel.add(it.name);
        renderList(side);
      };
      cb.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
      li.addEventListener('click', () => {
        if (it.type === 'dir' || it.type === 'link') openDir(side, it.name);
        else toggle();
      });
      return li;
    }));
  }
  const all = $('[data-role=all]', pane);
  all.checked = S.items.length > 0 && S.sel.size === S.items.length;
  $('[data-role=count]', pane).textContent = S.sel.size ? `${S.sel.size} 件選択中` : `${S.items.length} 件`;
  renderCrumbs(side);
  updateButtons();
}
const renderLocal = () => renderList('local');
const renderRemote = () => renderList('remote');

function renderCrumbs(side) {
  const nav = side === 'local' ? $('#localCrumbs') : $('#remoteCrumbs');
  const segs = side === 'local' ? state.local.segs : state.remote.path.split('/').filter(Boolean);
  const rootLabel = side === 'local' ? state.local.root?.label || '' : '/';
  const go = (n) => async () => {
    if (side === 'local') { state.local.segs = segs.slice(0, n); state.local.sel.clear(); await refreshLocal(); }
    else { state.remote.path = rjoin(...segs.slice(0, n)); state.remote.sel.clear(); await refreshRemote(); }
  };
  if (side === 'remote' && !relay.sid) return nav.replaceChildren();
  nav.replaceChildren(h('button', { onclick: go(0) }, rootLabel), ...segs.flatMap((s, i) => [h('span', {}, '›'), h('button', { onclick: go(i + 1) }, s)]));
}

async function openDir(side, name) {
  if (side === 'local') { state.local.segs = [...state.local.segs, name]; state.local.sel.clear(); await refreshLocal(); }
  else { state.remote.path = rjoin(state.remote.path, name); state.remote.sel.clear(); await refreshRemote(); }
}

async function refreshRemote() {
  const R = state.remote;
  if (!relay.sid) { R.items = []; renderRemote(); return; }
  try {
    const r = await relay.list(R.path);
    R.items = sortItems(r.items);
  } catch (err) {
    toast(err.message, true);
    if (!relay.sid) { state.remote.profile = null; setConnState(); }
    R.items = [];
  }
  R.sel = new Set([...R.sel].filter((n) => R.items.some((i) => i.name === n)));
  renderRemote();
}

function selected(side) { const S = state[side]; return S.items.filter((i) => S.sel.has(i.name)); }

function updateButtons() {
  const ls = selected('local'), rs = selected('remote');
  const conn = !!relay.sid;
  const set = (pane, act, on) => { const b = $(`[data-act=${act}]`, pane); if (b) b.disabled = !on; };
  const lp = $('#localPane'), rp = $('#remotePane');
  set(lp, 'up', state.local.segs.length > 0);
  set(lp, 'extract', ls.length === 1 && ls[0].type === 'file' && isArchive(ls[0].name));
  set(lp, 'copy', ls.length > 0); set(lp, 'cut', ls.length > 0); set(lp, 'delete', ls.length > 0);
  set(lp, 'rename', ls.length === 1);
  set(lp, 'save', ls.length > 0 && ls.every((i) => i.type === 'file'));
  set(lp, 'upload', conn && ls.length > 0);
  set(lp, 'paste', !!state.clip && (state.clip.side === 'local' || conn));
  set(lp, 'importDir', true);
  for (const a of ['refresh', 'mkdir']) set(rp, a, conn);
  set(rp, 'up', conn && state.remote.path !== '/');
  set(rp, 'copy', conn && rs.length > 0); set(rp, 'cut', conn && rs.length > 0); set(rp, 'delete', conn && rs.length > 0);
  set(rp, 'rename', conn && rs.length === 1);
  set(rp, 'download', conn && rs.length > 0);
  set(rp, 'extractRemote', conn && rs.length === 1 && rs[0].type === 'file' && isArchive(rs[0].name));
  set(rp, 'paste', conn && !!state.clip);
}

// ---------- toolbar actions ----------
$$('[data-role=all]').forEach((cb) => cb.addEventListener('change', (e) => {
  const side = e.target.closest('#localPane') ? 'local' : 'remote';
  const S = state[side];
  S.sel = e.target.checked ? new Set(S.items.map((i) => i.name)) : new Set();
  renderList(side);
}));

$('#localPane .toolbar').addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.act; if (a) run(localActions[a]); });
$('#remotePane .toolbar').addEventListener('click', (e) => { const a = e.target.closest('button')?.dataset.act; if (a) run(remoteActions[a]); });

async function run(fn) {
  if (!fn) return;
  try { await fn(); } catch (err) { if (err.name !== 'AbortError') { console.error(err); toast(err.message || String(err), true); } }
}

const localActions = {
  async up() { state.local.segs = state.local.segs.slice(0, -1); state.local.sel.clear(); await refreshLocal(); },
  refresh: () => refreshLocal(),
  async mkdir() {
    const n = await ask({ title: '新しいフォルダ', input: '' });
    if (n === null) return;
    if (!validName(n)) throw new Error('使えない名前です');
    await lfs.mkdir(state.local.root.handle, [...state.local.segs, n]);
    await refreshLocal();
  },
  import: () => $('#fileInput').click(),
  importDir: () => $('#dirInput').click(),
  async extract() { await extractLocal(selected('local')[0]); },
  copy: () => setClip('copy', 'local'),
  cut: () => setClip('cut', 'local'),
  paste: () => paste('local'),
  async rename() {
    const it = selected('local')[0];
    const n = await ask({ title: '名前変更', input: it.name });
    if (n === null || n === it.name) return;
    if (!validName(n)) throw new Error('使えない名前です');
    const L = state.local;
    if (await lfs.exists(L.root.handle, [...L.segs, n])) throw new Error('同じ名前が既にあります');
    await copyLocalTree(L.root, [...L.segs, it.name], L.root, [...L.segs, n]);
    await lfs.remove(L.root.handle, [...L.segs, it.name]);
    await refreshLocal();
  },
  async delete() {
    const items = selected('local');
    if (!(await confirmAsk('削除', `${items.length} 件を削除します:\n${items.map((i) => i.name).join('\n')}`, '削除', true))) return;
    for (const it of items) await lfs.remove(state.local.root.handle, [...state.local.segs, it.name]);
    state.local.sel.clear();
    await refreshLocal();
    toast('削除しました');
  },
  async save() {
    for (const it of selected('local')) saveBlob(await lfs.readFile(state.local.root.handle, [...state.local.segs, it.name]), it.name);
  },
  upload: () => paste('remote', makeClip('copy', 'local')),
};

const remoteActions = {
  async up() { state.remote.path = rjoin(...state.remote.path.split('/').filter(Boolean).slice(0, -1)); state.remote.sel.clear(); await refreshRemote(); },
  refresh: () => refreshRemote(),
  async mkdir() {
    const n = await ask({ title: 'サーバに新しいフォルダ', input: '' });
    if (n === null) return;
    if (!validName(n)) throw new Error('使えない名前です');
    await relay.mkdir(rjoin(state.remote.path, n));
    await refreshRemote();
  },
  copy: () => setClip('copy', 'remote'),
  cut: () => setClip('cut', 'remote'),
  paste: () => paste('remote'),
  async rename() {
    const it = selected('remote')[0];
    const n = await ask({ title: '名前変更（サーバ）', input: it.name });
    if (n === null || n === it.name) return;
    if (!validName(n)) throw new Error('使えない名前です');
    await relay.rename(rjoin(state.remote.path, it.name), rjoin(state.remote.path, n));
    await refreshRemote();
  },
  async delete() {
    const items = selected('remote');
    if (!(await confirmAsk('サーバから削除', `サーバ「${state.remote.profile.name}」から ${items.length} 件を削除します。元に戻せません。\n${items.map((i) => i.name).join('\n')}`, '削除', true))) return;
    const j = job('サーバから削除');
    let n = 0;
    try {
      for (const it of items) {
        j.progress(n++, items.length, it.name);
        await relay.remove(rjoin(state.remote.path, it.name), it.type === 'dir');
      }
      j.done(`${items.length} 件削除しました`);
    } catch (err) { j.fail(err); throw err; } finally { state.remote.sel.clear(); await refreshRemote(); }
  },
  download: () => paste('local', makeClip('copy', 'remote')),
  async extractRemote() {
    const it = selected('remote')[0];
    const j = job(`${it.name} をダウンロード`);
    const blob = await relay.download(rjoin(state.remote.path, it.name)).catch((err) => { j.fail(err); throw err; });
    j.done();
    await extractLocal({ name: it.name }, new File([blob], it.name));
    switchTab('local');
  },
};

// ---------- import (files / drag & drop) ----------
$('#fileInput').onchange = (e) => importFiles([...e.target.files].map((f) => ({ rel: [f.name], file: f }))).finally(() => (e.target.value = ''));
$('#dirInput').onchange = (e) => importFiles([...e.target.files].map((f) => ({ rel: (f.webkitRelativePath || f.name).split('/'), file: f }))).finally(() => (e.target.value = ''));
const lp = $('#localPane');
lp.addEventListener('dragover', (e) => { e.preventDefault(); lp.classList.add('dragover'); });
lp.addEventListener('dragleave', () => lp.classList.remove('dragover'));
lp.addEventListener('drop', async (e) => {
  e.preventDefault();
  lp.classList.remove('dragover');
  const list = [];
  const walkEntry = async (entry, rel) => {
    if (entry.isFile) list.push({ rel: [...rel, entry.name], file: await new Promise((r, j) => entry.file(r, j)) });
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((r, j) => reader.readEntries(r, j));
        for (const c of batch) await walkEntry(c, [...rel, entry.name]);
      } while (batch.length);
    }
  };
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (entries.length) for (const en of entries) await walkEntry(en, []);
  else list.push(...[...e.dataTransfer.files].map((f) => ({ rel: [f.name], file: f })));
  run(() => importFiles(list));
});

async function importFiles(list) {
  if (!list.length) return;
  const L = state.local;
  const j = job(`${list.length} 件を取り込み`);
  try {
    let i = 0;
    for (const { rel, file } of list) {
      j.progress(i++, list.length, rel.join('/'));
      await lfs.writeFile(L.root.handle, [...L.segs, ...safeSegments(rel.join('/'))], file, L.root.isOpfs);
    }
    j.done(`${list.length} 件を取り込みました`);
  } catch (err) { j.fail(err); throw err; } finally { await refreshLocal(); }
}

// ---------- extract ----------
function stripArchiveExt(name) { return name.replace(/\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz|zip|lzh|lha|tar|rar|7z|gz)$/i, '') || 'extracted'; }

async function extractLocal(it, fileObj) {
  const L = state.local;
  const file = fileObj || await lfs.readFile(L.root.handle, [...L.segs, it.name]);
  const base = stripArchiveExt(it.name);
  let folder = base, k = 2;
  while (await lfs.exists(L.root.handle, [...L.segs, folder])) folder = `${base} (${k++})`;
  const choice = await ask({ title: `「${it.name}」を解凍`, message: `解凍先のフォルダ名（現在の場所に作成します）。空欄にすると現在の場所へ直接展開します。`, input: folder });
  if (choice === null) return;
  if (choice && !validName(choice)) throw new Error('使えないフォルダ名です');
  const destSegs = choice ? [...L.segs, choice] : [...L.segs];
  const j = job(`${it.name} を解凍`);
  try {
    j.progress(0, 1, '読み込み中…');
    let entries;
    try {
      entries = await extractArchive(file);
    } catch (err) {
      if (!err.needPassword) throw err;
      const pw = await ask({ title: 'パスワード付きアーカイブ', message: it.name, input: '', type: 'password' });
      if (pw === null) throw new Error('キャンセルしました');
      entries = await extractArchive(file, { password: pw });
    }
    // Validate every path before writing anything (zip-slip protection).
    const plan = entries.map((e) => ({ ...e, segs: safeSegments(e.path) })).filter((e) => e.segs.length);
    let n = 0;
    const files = plan.filter((e) => !e.dir);
    for (const e of plan) {
      if (e.dir) { await lfs.mkdir(L.root.handle, [...destSegs, ...e.segs]); continue; }
      j.progress(n++, files.length, e.segs.join('/'));
      await lfs.writeFile(L.root.handle, [...destSegs, ...e.segs], e.data, L.root.isOpfs);
    }
    j.done(`${it.name}: ${files.length} ファイルを解凍しました`);
    await refreshLocal();
    if (choice) {
      state.local.sel = new Set([choice]);
      renderLocal();
    }
    toast('解凍しました。選択したまま「アップロード」でサーバへ送れます');
  } catch (err) {
    j.fail(err);
    throw err;
  }
}

// ---------- clipboard / paste ----------
function makeClip(op, side) {
  return {
    op, side,
    items: selected(side).map(({ name, type }) => ({ name, type })),
    local: { root: state.local.root, segs: [...state.local.segs] },
    remotePath: state.remote.path,
    sid: relay.sid,
  };
}
function setClip(op, side) {
  const c = makeClip(op, side);
  if (!c.items.length) return;
  state.clip = c;
  $('#clipText').textContent = `${c.items.length} 件を${op === 'cut' ? '切り取り' : 'コピー'}（${side === 'local' ? 'ローカル' : 'サーバ'}）→ 貼り付け先で「貼り付け」`;
  $('#clipbar').hidden = false;
  updateButtons();
}
function clearClip() { state.clip = null; $('#clipbar').hidden = true; updateButtons(); }
$('#clipClear').onclick = clearClip;

async function copyLocalTree(srcRoot, srcSegs, dstRoot, dstSegs, onFile) {
  const kind = await lfs.exists(srcRoot.handle, srcSegs);
  if (kind === 'file') {
    await lfs.writeFile(dstRoot.handle, dstSegs, await lfs.readFile(srcRoot.handle, srcSegs), dstRoot.isOpfs);
    onFile?.(dstSegs.join('/'));
    return;
  }
  await lfs.mkdir(dstRoot.handle, dstSegs);
  for await (const e of lfs.walk(srcRoot.handle, srcSegs)) {
    if (e.dir) await lfs.mkdir(dstRoot.handle, [...dstSegs, ...e.rel]);
    else { await lfs.writeFile(dstRoot.handle, [...dstSegs, ...e.rel], e.file, dstRoot.isOpfs); onFile?.(e.rel.join('/')); }
  }
}

async function remoteTree(path, rel = []) {
  const out = [];
  const r = await relay.list(path);
  for (const it of r.items) {
    if (it.type === 'dir') { out.push({ rel: [...rel, it.name], dir: true }); out.push(...await remoteTree(rjoin(path, it.name), [...rel, it.name])); }
    else out.push({ rel: [...rel, it.name], size: it.size, path: rjoin(path, it.name) });
  }
  return out;
}

async function paste(dest, c = state.clip) {
  if (!c || !c.items.length) return;
  if ((c.side === 'remote' || dest === 'remote') && !relay.sid) throw new Error('サーバに接続してください');
  if (c.side === 'remote' && c.sid !== relay.sid) throw new Error('コピー元のサーバ接続が切れています。もう一度コピーしてください');
  const L = state.local, R = state.remote;
  const destItems = dest === 'local' ? L.items : R.items;
  // pasting into the same folder it came from
  const sameDir = c.side === dest && (dest === 'local' ? c.local.root === L.root && c.local.segs.join('/') === L.segs.join('/') : c.remotePath === R.path);
  if (sameDir) throw new Error('同じフォルダには貼り付けできません');
  // pasting a folder into itself
  for (const it of c.items) {
    if (c.side === 'local' && dest === 'local' && c.local.root === L.root && [...L.segs, ''].join('/').startsWith([...c.local.segs, it.name, ''].join('/'))) throw new Error('フォルダをその中に貼り付けることはできません');
    if (c.side === 'remote' && dest === 'remote' && (R.path + '/').startsWith(rjoin(c.remotePath, it.name) + '/')) throw new Error('フォルダをその中に貼り付けることはできません');
  }
  const clash = c.items.filter((it) => destItems.some((d) => d.name === it.name));
  const destLabel = dest === 'local' ? `ローカル: ${[L.root.label, ...L.segs].join('/')}` : `サーバ ${R.profile.name}: ${R.path}`;
  const verb = { 'local>remote': 'アップロード', 'remote>local': 'ダウンロード' }[`${c.side}>${dest}`] || (c.op === 'cut' ? '移動' : 'コピー');
  let msg = `${c.items.length} 件を ${verb} します。\n先: ${destLabel}`;
  if (clash.length) msg += `\n\n同じ名前があるため上書きされます:\n${clash.map((i) => i.name).join('\n')}`;
  if (c.op === 'cut') msg += '\n\n完了後、元のファイルは削除されます。';
  if (!(await confirmAsk(verb, msg, verb, clash.length > 0))) return;

  const j = job(verb);
  try {
    if (c.side === 'local' && dest === 'local') {
      let n = 0;
      for (const it of c.items) {
        await copyLocalTree(c.local.root, [...c.local.segs, it.name], L.root, [...L.segs, it.name], (p) => j.progress(++n, n + 1, p));
        if (c.op === 'cut') await lfs.remove(c.local.root.handle, [...c.local.segs, it.name]);
      }
      j.done(`${verb}しました`);
    } else if (c.side === 'local' && dest === 'remote') {
      const tasks = [];
      for (const it of c.items) {
        const segs = [...c.local.segs, it.name];
        if (it.type === 'file') tasks.push({ rel: [it.name], file: await lfs.readFile(c.local.root.handle, segs) });
        else {
          tasks.push({ rel: [it.name], dir: true });
          for await (const e of lfs.walk(c.local.root.handle, segs)) tasks.push({ ...e, rel: [it.name, ...e.rel] });
        }
      }
      const total = tasks.reduce((s, t) => s + (t.file?.size || 0), 0);
      let doneBytes = 0, files = 0;
      const base = R.path;
      for (const t of tasks) {
        const target = rjoin(base, ...t.rel);
        if (t.dir) { await relay.mkdir(target); continue; }
        await relay.upload(target, t.file, (loaded) => j.progress(doneBytes + loaded, total, `${t.rel.join('/')} (${files + 1}/${tasks.filter((x) => !x.dir).length})`));
        doneBytes += t.file.size;
        files++;
      }
      if (c.op === 'cut') for (const it of c.items) await lfs.remove(c.local.root.handle, [...c.local.segs, it.name]);
      j.done(`${files} ファイルをアップロードしました（${fmtSize(total)}）`);
    } else if (c.side === 'remote' && dest === 'local') {
      let files = 0;
      for (const it of c.items) {
        const src = rjoin(c.remotePath, it.name);
        const list = it.type === 'dir' ? [{ rel: [it.name], dir: true }, ...(await remoteTree(src, [it.name]))] : [{ rel: [it.name], path: src }];
        for (const e of list) {
          if (e.dir) { await lfs.mkdir(L.root.handle, [...L.segs, ...e.rel]); continue; }
          j.progress(files, files + 1, e.rel.join('/'));
          await lfs.writeFile(L.root.handle, [...L.segs, ...e.rel], await relay.download(e.path), L.root.isOpfs);
          files++;
        }
        if (c.op === 'cut') await relay.remove(src, it.type === 'dir');
      }
      j.done(`${files} ファイルをダウンロードしました`);
    } else {
      // remote -> remote (same connection)
      let files = 0;
      for (const it of c.items) {
        const src = rjoin(c.remotePath, it.name);
        const dst = rjoin(R.path, it.name);
        if (c.op === 'cut') { await relay.rename(src, dst); files++; continue; }
        const list = it.type === 'dir' ? [{ rel: [], dir: true }, ...(await remoteTree(src))] : [{ rel: [], path: src }];
        for (const e of list) {
          const target = rjoin(dst, ...e.rel);
          if (e.dir) { await relay.mkdir(target); continue; }
          j.progress(files, files + 1, e.rel.join('/') || it.name);
          await relay.upload(target, await relay.download(e.path));
          files++;
        }
      }
      j.done(`${verb}しました`);
    }
    if (c === state.clip && c.op === 'cut') clearClip();
  } catch (err) {
    j.fail(err);
    throw err;
  } finally {
    await refreshLocal();
    if (relay.sid) await refreshRemote();
  }
}

// ---------- misc ----------
function saveBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function switchTab(t) {
  state.active = t;
  $('#panes').dataset.active = t;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
}
$$('.tabs button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
$('#jobsClose').onclick = () => { $('#jobs').hidden = true; $('#jobList').replaceChildren(); };

// ---------- boot ----------
(async function boot() {
  if (!window.isSecureContext || !crypto.subtle || !navigator.storage?.getDirectory) {
    document.body.replaceChildren(h('div', { class: 'lock' },
      h('h1', {}, 'このブラウザ / 接続では使えません'),
      h('p', {}, 'HTTPS（または同じ PC の http://localhost）で開いてください。暗号化と端末内ストレージに安全な接続が必要です。')));
    return;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.storage.persist?.().catch(() => {});
  await initRoots();
  await refreshLocal();
  setConnState();
  renderRemote();
  showLock();
})();
