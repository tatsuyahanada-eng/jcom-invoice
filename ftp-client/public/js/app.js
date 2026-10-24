// APP UP FTP Manager - main UI (shared by the browser PWA and the Android app).
import { vault } from './vault.js';
import { isArchive } from './archive/index.js';
import { safeSegments } from './archive/util.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const IS_NATIVE = !!window.Capacitor?.isNativePlatform?.();

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
let platform, local, remote;
const state = {
  roots: [],
  local: { root: null, segs: [], items: [], sel: new Set() },
  remote: { path: '/', items: [], sel: new Set(), profile: null },
  clip: null, // { op, side, items:[{name,type}], local:{root,segs}, remotePath, sid }
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
  await remote.disconnect();
  state.remote.profile = null;
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
    if (remote.needsRelay && !vault.data.relayToken) openSettings('最初に中継サーバのアクセストークンを入力してください');
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
  f.relayToken.required = remote.needsRelay;
  $('#relayTokenRow').hidden = !remote.needsRelay;
  f.autoLockMin.value = vault.data.settings.autoLockMin || 10;
  f.savePasswords.checked = vault.data.settings.savePasswords !== false;
  $('#relayStatus').textContent = msg || '';
  $('#secureInfo').textContent = IS_NATIVE
    ? 'Android アプリ版: FTP 通信・解凍はすべてこの端末内で行います（中継サーバ不要）。'
    : window.isSecureContext ? `この画面は安全な接続 (${location.protocol}) で開かれています。` : '警告: 安全でない接続で開かれています。HTTPS か localhost で開いてください。';
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
  if (!remote.needsRelay) { toast('設定を保存しました'); $('#settingsDlg').close(); return; }
  const ok = await remote.ping().catch(() => false);
  $('#relayStatus').textContent = ok ? '中継サーバに接続できました ✓' : '中継サーバに接続できません。トークンと起動状態を確認してください';
  if (ok) { toast('設定を保存しました'); $('#settingsDlg').close(); }
});
$('#exportBackupBtn').onclick = async () => {
  const name = `appup-ftp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (IS_NATIVE) {
    // write into the workspace, then let the user pick where to save it
    const app = state.roots.find((r) => r.kind === 'app');
    await local.write(app, [name], vault.exportBlob());
    try { await local.save(app, [name]); toast('暗号化バックアップを保存しました'); } catch (err) { if (err.code !== 'CANCELLED') toast(err.message, true); }
    await local.remove(app, [name]).catch(() => {});
    if (state.local.root.kind === 'app') refreshLocal();
    return;
  }
  const a = h('a', { href: URL.createObjectURL(vault.exportBlob()), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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
  const app = state.roots.find((r) => r.kind === 'app');
  for (const it of await local.list(app, [])) await local.remove(app, [it.name]);
  if (state.local.root.kind === 'app') state.local.segs = [];
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
  if (remote.connected && p) {
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

async function disconnect() {
  await remote.disconnect();
  state.remote.profile = null;
  state.remote.items = [];
  setConnState();
  renderRemote();
}

$('#connectBtn').onclick = async () => {
  if (!vault.isUnlocked()) return;
  if (remote.connected) return disconnect();
  const p = vault.data.servers.find((s) => s.id === $('#serverSel').value);
  if (!p) return toast('接続するサーバを選んでください', true);
  await connectTo(p);
};
$('#serverSel').onchange = async () => { if (remote.connected) await disconnect(); };

async function connectTo(p) {
  if (remote.needsRelay && !vault.data.relayToken) return openSettings('アクセストークンを入力してください');
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
    const r = await remote.connect(p, pw);
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
    if (!remote.connected) btn.textContent = '接続';
  }
}

// ---------- local pane ----------
async function loadRoots(selectKey) {
  state.roots = await local.roots();
  state.local.root = state.roots.find((r) => r.key === (selectKey || state.local.root?.key)) || state.roots[0];
  renderRootSelect();
}

function renderRootSelect() {
  const sel = $('#rootSel');
  sel.replaceChildren(
    ...state.roots.map((r) => h('option', { value: r.key }, r.label)),
    ...(local.canPickFolder ? [h('option', { value: '__pick' }, IS_NATIVE ? '＋ スマホのフォルダを開く…' : '＋ PC のフォルダを開く…')] : []),
    ...(state.roots.length > 1 ? [h('option', { value: '__forget' }, '開いたフォルダの一覧を消去')] : []),
  );
  sel.value = state.local.root.key;
}

$('#rootSel').onchange = async (e) => {
  const v = e.target.value;
  try {
    if (v === '__pick') {
      const r = await local.pickFolder();
      await loadRoots(r.key);
    } else if (v === '__forget') {
      if (await confirmAsk('一覧を消去', '開いたフォルダへのアクセス許可を取り消します（フォルダ内のファイルは消えません）。', '消去する')) {
        await local.forgetFolders();
        await loadRoots('app');
      }
    } else {
      const r = state.roots.find((x) => x.key === v);
      await local.ensureAccess(r);
      state.local.root = r;
    }
    state.local.segs = [];
    state.local.sel.clear();
    await refreshLocal();
  } catch (err) {
    if (err.name !== 'AbortError' && err.code !== 'CANCELLED') toast(err.message, true);
  }
  renderRootSelect();
};

async function refreshLocal() {
  const L = state.local;
  try {
    L.items = sortItems((await local.list(L.root, L.segs)).filter((i) => !(L.root.kind === 'app' && !L.segs.length && i.name === '.tmp')));
  } catch (err) {
    L.items = [];
    if (L.segs.length) { L.segs = []; return refreshLocal(); }
    toast(`Cannot read Local: ${err.message}`, true);
  }
  L.sel = new Set([...L.sel].filter((n) => L.items.some((i) => i.name === n)));
  renderLocal();
  const u = await local.usage(L.root);
  $('#usage').textContent = u ? `使用 ${fmtSize(u.usage)} / ${fmtSize(u.quota)}` : '';
}

function sortItems(items) {
  return items.sort((a, b) => (a.type === 'dir') === (b.type === 'dir') ? a.name.localeCompare(b.name, 'ja', { numeric: true }) : a.type === 'dir' ? -1 : 1);
}

function renderList(side) {
  const S = state[side];
  const ul = side === 'local' ? $('#localList') : $('#remoteList');
  const pane = side === 'local' ? $('#localPane') : $('#remotePane');
  if (side === 'remote' && !remote.connected) {
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
        if (it.type === 'dir' || it.type === 'link') run(() => openDir(side, it.name));
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
  const go = (n) => () => run(async () => {
    if (side === 'local') { state.local.segs = segs.slice(0, n); state.local.sel.clear(); await refreshLocal(); }
    else { state.remote.path = rjoin(...segs.slice(0, n)); state.remote.sel.clear(); await refreshRemote(); }
  });
  if (side === 'remote' && !remote.connected) return nav.replaceChildren();
  nav.replaceChildren(h('button', { onclick: go(0) }, rootLabel), ...segs.flatMap((s, i) => [h('span', {}, '›'), h('button', { onclick: go(i + 1) }, s)]));
}

async function openDir(side, name) {
  if (side === 'local') { state.local.segs = [...state.local.segs, name]; state.local.sel.clear(); await refreshLocal(); }
  else { state.remote.path = rjoin(state.remote.path, name); state.remote.sel.clear(); await refreshRemote(); }
}

async function refreshRemote() {
  const R = state.remote;
  if (!remote.connected) { R.items = []; renderRemote(); return; }
  try {
    R.items = sortItems(await remote.list(R.path));
  } catch (err) {
    toast(err.message, true);
    if (!remote.connected) { state.remote.profile = null; setConnState(); }
    R.items = [];
  }
  R.sel = new Set([...R.sel].filter((n) => R.items.some((i) => i.name === n)));
  renderRemote();
}

function selected(side) { const S = state[side]; return S.items.filter((i) => S.sel.has(i.name)); }

function updateButtons() {
  const ls = selected('local'), rs = selected('remote');
  const conn = remote.connected;
  const set = (pane, act, on) => { const b = $(`[data-act=${act}]`, pane); if (b) b.disabled = !on; };
  const lp = $('#localPane'), rp = $('#remotePane');
  set(lp, 'up', state.local.segs.length > 0);
  set(lp, 'extract', ls.length === 1 && ls[0].type === 'file' && isArchive(ls[0].name));
  set(lp, 'copy', ls.length > 0); set(lp, 'cut', ls.length > 0); set(lp, 'delete', ls.length > 0);
  set(lp, 'rename', ls.length === 1);
  set(lp, 'save', IS_NATIVE ? ls.length === 1 && ls[0].type === 'file' : ls.length > 0 && ls.every((i) => i.type === 'file'));
  set(lp, 'upload', conn && ls.length > 0);
  set(lp, 'paste', !!state.clip && (state.clip.side === 'local' || conn));
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
  try { await fn(); } catch (err) {
    if (err.name === 'AbortError' || err.code === 'CANCELLED') return;
    console.error(err);
    toast(err.message || String(err), true);
    if (err.code === 'DISCONNECTED') { state.remote.profile = null; setConnState(); renderRemote(); }
  }
}

const L = () => state.local;
const localActions = {
  async up() { L().segs = L().segs.slice(0, -1); L().sel.clear(); await refreshLocal(); },
  refresh: () => refreshLocal(),
  async mkdir() {
    const n = await ask({ title: '新しいフォルダ', input: '' });
    if (n === null) return;
    if (!validName(n)) throw new Error('使えない名前です');
    await local.mkdir(L().root, [...L().segs, n]);
    await refreshLocal();
  },
  async import() {
    if (!local.importPicker) return $('#fileInput').click();
    const j = job('スマホから取り込み');
    try {
      const r = await local.importPicker(L().root, L().segs, (d, t, f) => j.progress(d, t, f));
      j.done(`${r.names.length} 件を取り込みました`);
      L().sel = new Set(r.names);
    } catch (err) {
      if (err.code === 'CANCELLED') { j.done('取り込みをキャンセルしました'); return; }
      j.fail(err);
      throw err;
    } finally { await refreshLocal(); }
  },
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
    await local.rename(L().root, [...L().segs, it.name], n);
    L().sel = new Set([n]);
    await refreshLocal();
  },
  async delete() {
    const items = selected('local');
    const where = L().root.kind === 'folder' ? `\n\n※「${L().root.label}」はスマホ/PC の実フォルダです。` : '';
    if (!(await confirmAsk('削除', `${items.length} 件を削除します:\n${items.map((i) => i.name).join('\n')}${where}`, '削除', true))) return;
    for (const it of items) await local.remove(L().root, [...L().segs, it.name]);
    L().sel.clear();
    await refreshLocal();
    toast('削除しました');
  },
  async save() {
    for (const it of selected('local')) await local.save(L().root, [...L().segs, it.name]);
    if (IS_NATIVE) toast('保存しました');
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
    await remote.mkdir(rjoin(state.remote.path, n));
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
    await remote.rename(rjoin(state.remote.path, it.name), rjoin(state.remote.path, n));
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
        await remote.remove(rjoin(state.remote.path, it.name), it.type === 'dir');
      }
      j.done(`${items.length} 件削除しました`);
    } catch (err) { j.fail(err); throw err; } finally { state.remote.sel.clear(); await refreshRemote(); }
  },
  download: () => paste('local', makeClip('copy', 'remote')),
  async extractRemote() {
    const it = selected('remote')[0];
    const j = job(`${it.name} をダウンロード`);
    let name = it.name, k = 2;
    while (await local.exists(L().root, [...L().segs, name])) name = it.name.replace(/(\.[^.]+)$/, ` (${k++})$1`);
    try {
      await remote.downloadLocal(rjoin(state.remote.path, it.name), L().root, [...L().segs, name], it.size, (d, t) => j.progress(d, t));
      j.done();
    } catch (err) { j.fail(err); throw err; }
    await refreshLocal();
    switchTab('local');
    await extractLocal({ name });
  },
};

// ---------- import (browser: files / drag & drop) ----------
$('#fileInput').onchange = (e) => run(() => importFiles([...e.target.files].map((f) => ({ rel: [f.name], file: f })))).finally(() => (e.target.value = ''));
$('#dirInput').onchange = (e) => run(() => importFiles([...e.target.files].map((f) => ({ rel: (f.webkitRelativePath || f.name).split('/'), file: f })))).finally(() => (e.target.value = ''));
const lpane = $('#localPane');
lpane.addEventListener('dragover', (e) => { e.preventDefault(); lpane.classList.add('dragover'); });
lpane.addEventListener('dragleave', () => lpane.classList.remove('dragover'));
lpane.addEventListener('drop', async (e) => {
  e.preventDefault();
  lpane.classList.remove('dragover');
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
  const j = job(`${list.length} 件を取り込み`);
  try {
    let i = 0;
    for (const { rel, file } of list) {
      j.progress(i++, list.length, rel.join('/'));
      await local.write(L().root, [...L().segs, ...safeSegments(rel.join('/'))], file);
    }
    j.done(`${list.length} 件を取り込みました`);
  } catch (err) { j.fail(err); throw err; } finally { await refreshLocal(); }
}

// ---------- extract ----------
function stripArchiveExt(name) { return name.replace(/\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz|zip|lzh|lha|tar|rar|7z|gz)$/i, '') || 'extracted'; }

async function extractLocal(it) {
  const base = stripArchiveExt(it.name);
  let folder = base, k = 2;
  while (await local.exists(L().root, [...L().segs, folder])) folder = `${base} (${k++})`;
  const choice = await ask({ title: `「${it.name}」を解凍`, message: '解凍先のフォルダ名（今いる場所に作成します）。空欄にすると今いる場所へ直接展開します。', input: folder });
  if (choice === null) return;
  if (choice && !validName(choice)) throw new Error('使えないフォルダ名です');
  const destSegs = choice ? [...L().segs, choice] : [...L().segs];
  const src = [...L().segs, it.name];
  const j = job(`${it.name} を解凍`);
  const onFile = (n, p) => j.progress(n, n + 1, p);
  try {
    j.progress(0, 1, '読み込み中…');
    let n;
    try {
      n = await local.extract(L().root, src, destSegs, { onFile });
    } catch (err) {
      if (!err.needPassword) throw err;
      const pw = await ask({ title: 'パスワード付きアーカイブ', message: it.name, input: '', type: 'password' });
      if (pw === null) throw new Error('キャンセルしました');
      n = await local.extract(L().root, src, destSegs, { password: pw, onFile });
    }
    j.done(`${it.name}: ${n} ファイルを解凍しました`);
    await refreshLocal();
    if (choice) { L().sel = new Set([choice]); renderLocal(); }
    toast('解凍しました。選択したまま「アップロード」でサーバへ送れます');
  } catch (err) {
    j.fail(err);
    await refreshLocal();
    throw err;
  }
}

// ---------- clipboard / paste ----------
function makeClip(op, side) {
  return {
    op, side,
    items: selected(side).map(({ name, type, size }) => ({ name, type, size })),
    local: { root: L().root, segs: [...L().segs] },
    remotePath: state.remote.path,
    sid: remote.sessionId,
  };
}
function setClip(op, side) {
  const c = makeClip(op, side);
  if (!c.items.length) return;
  state.clip = c;
  $('#clipText').textContent = `📋 ${c.items.length} 件${op === 'cut' ? '切り取り' : 'コピー'}中 → 貼り付け先で「貼り付け」`;
  $('#clipbar').hidden = false;
  updateButtons();
}
function clearClip() { state.clip = null; $('#clipbar').hidden = true; updateButtons(); }
$('#clipClear').onclick = clearClip;

async function remoteTree(path, rel = []) {
  const out = [];
  for (const it of await remote.list(path)) {
    if (it.type === 'dir') { out.push({ rel: [...rel, it.name], dir: true }); out.push(...await remoteTree(rjoin(path, it.name), [...rel, it.name])); }
    else out.push({ rel: [...rel, it.name], size: it.size, path: rjoin(path, it.name) });
  }
  return out;
}

const sameRoot = (a, b) => a.key === b.key;

async function paste(dest, c = state.clip) {
  if (!c || !c.items.length) return;
  if ((c.side === 'remote' || dest === 'remote') && !remote.connected) throw new Error('サーバに接続してください');
  if (c.side === 'remote' && c.sid !== remote.sessionId) throw new Error('コピー元のサーバ接続が切れています。もう一度コピーしてください');
  const Lc = L(), R = state.remote;
  const destItems = dest === 'local' ? Lc.items : R.items;
  const sameDir = c.side === dest && (dest === 'local' ? sameRoot(c.local.root, Lc.root) && c.local.segs.join('/') === Lc.segs.join('/') : c.remotePath === R.path);
  if (sameDir) throw new Error('同じフォルダには貼り付けできません');
  for (const it of c.items) {
    if (c.side === 'local' && dest === 'local' && sameRoot(c.local.root, Lc.root) && [...Lc.segs, ''].join('/').startsWith([...c.local.segs, it.name, ''].join('/'))) throw new Error('フォルダをその中に貼り付けることはできません');
    if (c.side === 'remote' && dest === 'remote' && (R.path + '/').startsWith(rjoin(c.remotePath, it.name) + '/')) throw new Error('フォルダをその中に貼り付けることはできません');
  }
  const clash = c.items.filter((it) => destItems.some((d) => d.name === it.name));
  const destLabel = dest === 'local' ? `Local: ${[Lc.root.label, ...Lc.segs].join('/')}` : `Server (${R.profile.name}): ${R.path}`;
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
        await local.copy(c.local.root, [...c.local.segs, it.name], Lc.root, [...Lc.segs, it.name], () => j.progress(++n, n + 1, it.name));
        if (c.op === 'cut') await local.remove(c.local.root, [...c.local.segs, it.name]);
      }
      j.done(`${verb}しました`);
    } else if (c.side === 'local' && dest === 'remote') {
      const tasks = [];
      for (const it of c.items) {
        const segs = [...c.local.segs, it.name];
        if (it.type === 'file') tasks.push({ rel: [it.name], size: it.size || 0 });
        else {
          tasks.push({ rel: [it.name], dir: true });
          for (const e of await local.walk(c.local.root, segs)) tasks.push({ ...e, rel: [it.name, ...e.rel] });
        }
      }
      const files = tasks.filter((t) => !t.dir);
      const total = files.reduce((s, t) => s + (t.size || 0), 0);
      let doneBytes = 0, count = 0;
      for (const t of tasks) {
        const target = rjoin(R.path, ...t.rel);
        if (t.dir) { await remote.mkdir(target); continue; }
        await remote.uploadLocal(c.local.root, [...c.local.segs, ...t.rel], target,
          (loaded) => j.progress(doneBytes + loaded, total, `${t.rel.join('/')} (${count + 1}/${files.length})`));
        doneBytes += t.size || 0;
        count++;
      }
      if (c.op === 'cut') for (const it of c.items) await local.remove(c.local.root, [...c.local.segs, it.name]);
      j.done(`${count} ファイルをアップロードしました（${fmtSize(total)}）`);
    } else if (c.side === 'remote' && dest === 'local') {
      let files = 0;
      for (const it of c.items) {
        const src = rjoin(c.remotePath, it.name);
        const list = it.type === 'dir' ? [{ rel: [it.name], dir: true }, ...(await remoteTree(src, [it.name]))] : [{ rel: [it.name], path: src, size: it.size }];
        for (const e of list) {
          if (e.dir) { await local.mkdir(Lc.root, [...Lc.segs, ...e.rel]); continue; }
          await remote.downloadLocal(e.path, Lc.root, [...Lc.segs, ...e.rel], e.size, (d, t) => j.progress(d, t, `${e.rel.join('/')} (${files + 1})`));
          files++;
        }
        if (c.op === 'cut') await remote.remove(src, it.type === 'dir');
      }
      j.done(`${files} ファイルをダウンロードしました`);
    } else {
      let files = 0;
      for (const it of c.items) {
        const src = rjoin(c.remotePath, it.name);
        const dst = rjoin(R.path, it.name);
        if (c.op === 'cut') { await remote.rename(src, dst); files++; continue; }
        const list = it.type === 'dir' ? [{ rel: [], dir: true }, ...(await remoteTree(src))] : [{ rel: [], path: src }];
        for (const e of list) {
          const target = rjoin(dst, ...e.rel);
          if (e.dir) { await remote.mkdir(target); continue; }
          j.progress(files, files + 1, e.rel.join('/') || it.name);
          await remote.copyRemote(e.path, target);
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
    if (remote.connected) await refreshRemote();
  }
}

// ---------- misc ----------
function switchTab(t) {
  state.active = t;
  document.body.dataset.side = t;
  $('#panes').dataset.active = t;
  $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
}
$$('.tabs button').forEach((b) => (b.onclick = () => switchTab(b.dataset.tab)));
$('#jobsClose').onclick = () => { $('#jobs').hidden = true; $('#jobList').replaceChildren(); };

// Android back button: close dialog -> go up a folder -> leave the app
addEventListener('appback', () => {
  const open = $$('dialog[open]').filter((d) => d.id !== 'lockDlg');
  if (open.length) { open[open.length - 1].close(); return; }
  if (!$('#jobs').hidden) { $('#jobs').hidden = true; return; }
  if (vault.isUnlocked()) {
    if (state.active === 'remote' && remote.connected && state.remote.path !== '/') return run(remoteActions.up);
    if (state.active === 'local' && L().segs.length) return run(localActions.up);
    if (state.active === 'remote') return switchTab('local');
  }
  platform.exitApp?.();
});

// ---------- boot ----------
(async function boot() {
  try {
    if (IS_NATIVE) {
      const { createNativePlatform } = await import('./platform/native.js');
      platform = await createNativePlatform();
    } else {
      if (!window.isSecureContext || !crypto.subtle || !navigator.storage?.getDirectory) {
        document.body.replaceChildren(h('div', { class: 'lock' },
          h('h1', {}, 'このブラウザ / 接続では使えません'),
          h('p', {}, 'HTTPS（または同じ PC の http://localhost）で開いてください。暗号化と端末内ストレージに安全な接続が必要です。')));
        return;
      }
      const { createWebPlatform } = await import('./platform/web.js');
      platform = createWebPlatform({ getToken: () => vault.data?.relayToken || '' });
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.storage.persist?.().catch(() => {});
    }
    ({ local, remote } = platform);
    document.body.classList.toggle('native', IS_NATIVE);
    await loadRoots('app');
    await refreshLocal();
    setConnState();
    renderRemote();
    showLock();
  } catch (err) {
    console.error(err);
    document.body.replaceChildren(h('div', { class: 'lock' }, h('h1', {}, '起動できませんでした'), h('p', {}, String(err.message || err))));
  }
})();
