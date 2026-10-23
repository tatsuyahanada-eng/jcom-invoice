// Browser (PWA) backend: OPFS / File System Access for local files,
// relay server for FTP.
import * as lfs from '../localfs.js';
import { Relay } from '../relay.js';
import { extractArchive } from '../archive/index.js';
import { safeSegments } from '../archive/util.js';

export function createWebPlatform({ getToken }) {
  const relay = new Relay(getToken);

  // ---------- local ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('appup-ftp', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function loadHandles() {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const q = db.transaction('kv').objectStore('kv').get('dirs');
        q.onsuccess = () => res(q.result || []);
        q.onerror = () => res([]);
      });
    } catch { return []; }
  }
  async function saveHandles(roots) {
    const db = await idb();
    db.transaction('kv', 'readwrite').objectStore('kv').put(roots.filter((r) => r.kind === 'folder').map((r) => r.handle), 'dirs');
  }
  let roots = [];
  const isOpfs = (root) => root.kind === 'app';

  const local = {
    canPickFolder: lfs.canPickFolder(),
    async roots() {
      if (!roots.length) {
        roots = [{ key: 'app', label: 'アプリ内作業領域', kind: 'app', handle: await lfs.opfsRoot() }];
        for (const hd of await loadHandles()) roots.push({ key: `dir:${hd.name}:${roots.length}`, label: `📁 ${hd.name}`, kind: 'folder', handle: hd });
      }
      return roots;
    },
    async pickFolder() {
      const hd = await lfs.pickFolder();
      const r = { key: `dir:${hd.name}:${roots.length}`, label: `📁 ${hd.name}`, kind: 'folder', handle: hd };
      roots.push(r);
      await saveHandles(roots);
      return r;
    },
    async forgetFolders() {
      roots = roots.filter((r) => r.kind === 'app');
      await saveHandles(roots);
      return roots;
    },
    async ensureAccess(root) {
      if (root.kind !== 'folder') return;
      if ((await root.handle.queryPermission({ mode: 'readwrite' })) !== 'granted'
        && (await root.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('フォルダへのアクセスが許可されませんでした');
    },
    list: (root, segs) => lfs.list(root.handle, segs),
    mkdir: (root, segs) => lfs.mkdir(root.handle, segs),
    remove: (root, segs) => lfs.remove(root.handle, segs),
    exists: (root, segs) => lfs.exists(root.handle, segs),
    read: (root, segs) => lfs.readFile(root.handle, segs),
    write: (root, segs, blob) => lfs.writeFile(root.handle, segs, blob, isOpfs(root)),
    async walk(root, segs) {
      const out = [];
      for await (const e of lfs.walk(root.handle, segs)) out.push({ rel: e.rel, dir: !!e.dir, size: e.file?.size || 0 });
      return out;
    },
    async copy(src, srcSegs, dst, dstSegs, onFile) {
      if ((await lfs.exists(src.handle, srcSegs)) === 'file') {
        await local.write(dst, dstSegs, await local.read(src, srcSegs));
        onFile?.(dstSegs.join('/'));
        return;
      }
      await lfs.mkdir(dst.handle, dstSegs);
      for await (const e of lfs.walk(src.handle, srcSegs)) {
        if (e.dir) await lfs.mkdir(dst.handle, [...dstSegs, ...e.rel]);
        else { await local.write(dst, [...dstSegs, ...e.rel], e.file); onFile?.(e.rel.join('/')); }
      }
    },
    async rename(root, segs, newName) {
      const to = [...segs.slice(0, -1), newName];
      if (await lfs.exists(root.handle, to)) throw new Error('同じ名前が既にあります');
      await local.copy(root, segs, root, to);
      await lfs.remove(root.handle, segs);
    },
    importPicker: null, // browser uses <input type=file>
    async extract(root, segs, dstSegs, { password, onFile } = {}) {
      return writeEntries(root, dstSegs, await extractArchive(await local.read(root, segs), { password }), onFile);
    },
    async save(root, segs) {
      const blob = await local.read(root, segs);
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: segs[segs.length - 1] });
      document.body.append(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    async usage(root) {
      if (!isOpfs(root)) return null;
      return lfs.usage();
    },
  };

  async function writeEntries(root, dstSegs, entries, onFile) {
    // validate every path before writing anything (zip-slip protection)
    const plan = entries.map((e) => ({ ...e, segs: safeSegments(e.path) })).filter((e) => e.segs.length);
    let n = 0;
    for (const e of plan) {
      if (e.dir) { await local.mkdir(root, [...dstSegs, ...e.segs]); continue; }
      onFile?.(n, e.segs.join('/'));
      await local.write(root, [...dstSegs, ...e.segs], e.data);
      n++;
    }
    return n;
  }

  // ---------- remote ----------
  const remote = {
    needsRelay: true,
    get connected() { return !!relay.sid; },
    get sessionId() { return relay.sid; },
    ping: () => relay.ping(),
    connect: (p, pw) => relay.connect(p, pw),
    disconnect: () => relay.disconnect(),
    async list(path) { return (await relay.list(path)).items; },
    mkdir: (p) => relay.mkdir(p),
    remove: (p, dir) => relay.remove(p, dir),
    rename: (a, b) => relay.rename(a, b),
    async uploadLocal(root, segs, remotePath, onProgress) {
      await relay.upload(remotePath, await local.read(root, segs), onProgress);
    },
    async downloadLocal(remotePath, root, segs) {
      await local.write(root, segs, await relay.download(remotePath));
    },
    async copyRemote(from, to) {
      await relay.upload(to, await relay.download(from));
    },
  };

  return { name: 'web', local, remote };
}
