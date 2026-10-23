// Android app (Capacitor) backend: everything runs natively in the app.
// FTP/FTPS, ZIP extraction and phone folders go through the "AppUp" plugin.
import { extractArchive } from '../archive/index.js';
import { safeSegments } from '../archive/util.js';

export async function createNativePlatform() {
  const { registerPlugin, Capacitor } = await import('../../vendor/capacitor/core.js');
  const P = registerPlugin('AppUp');

  // progress events from native, routed by job id
  const jobs = new Map();
  let jobSeq = 0;
  P.addListener('progress', (e) => jobs.get(e.job)?.(e));
  async function withJob(fn, cb) {
    const id = `j${++jobSeq}`;
    if (cb) jobs.set(id, cb);
    try { return await fn(id); } finally { jobs.delete(id); }
  }

  const wrap = (e) => {
    const err = new Error(e?.message || String(e));
    err.code = e?.code;
    return err;
  };
  const call = async (name, args = {}) => { try { return await P[name](args); } catch (e) { throw wrap(e); } };

  const mkRoot = (r) => r.id === 'app'
    ? { key: 'app', id: 'app', label: 'アプリ内作業領域', kind: 'app' }
    : { key: r.id, id: r.id, label: `📁 ${r.name}`, kind: 'folder' };

  // ---------- local ----------
  const local = {
    canPickFolder: true,
    async roots() { return (await call('roots')).roots.map(mkRoot); },
    async pickFolder() { return mkRoot(await call('pickFolder')); },
    async forgetFolders() {
      for (const r of await local.roots()) if (r.kind === 'folder') await call('forgetFolder', { root: r.id });
      return local.roots();
    },
    async ensureAccess() {},
    async list(root, segs) { return (await call('list', { root: root.id, path: segs })).items; },
    mkdir: (root, segs) => call('mkdir', { root: root.id, path: segs }),
    remove: (root, segs) => call('remove', { root: root.id, path: segs }),
    async exists(root, segs) { return (await call('exists', { root: root.id, path: segs })).type || null; },
    rename: (root, segs, newName) => call('rename', { root: root.id, path: segs, newName }),
    async walk(root, segs) { return (await call('walk', { root: root.id, path: segs })).items; },
    async copy(src, srcSegs, dst, dstSegs, onFile) {
      await withJob((job) => call('copy', { srcRoot: src.id, srcPath: srcSegs, dstRoot: dst.id, dstPath: dstSegs, job }),
        () => onFile?.(''));
    },
    async read(root, segs) {
      const st = await call('stat', { root: root.id, path: segs });
      try {
        const r = await fetch(Capacitor.convertFileSrc(st.uri));
        if (r.ok) {
          const b = await r.blob();
          if (b.size === st.size) return b;
        }
      } catch { /* fall back to base64 chunks */ }
      const parts = [];
      for (let off = 0; ; off += 1 << 20) {
        const c = await call('readChunk', { root: root.id, path: segs, offset: off, length: 1 << 20 });
        parts.push(Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0)));
        if (c.eof) break;
      }
      return new Blob(parts);
    },
    async write(root, segs, blob) {
      const CH = 512 * 1024;
      if (blob.size === 0) return call('writeChunk', { root: root.id, path: segs, data: '', append: false });
      for (let off = 0; off < blob.size; off += CH) {
        const data = await b64(blob.slice(off, off + CH));
        await call('writeChunk', { root: root.id, path: segs, data, append: off > 0 });
      }
    },
    async importPicker(root, segs, onFile) {
      return withJob((job) => call('importFiles', { root: root.id, path: segs, job }), (e) => onFile?.(e.done, e.total, e.file));
    },
    async extract(root, segs, dstSegs, { password, onFile } = {}) {
      const name = segs[segs.length - 1];
      if (/\.zip$/i.test(name) && !password) {
        try {
          const r = await withJob((job) => call('extractZip', { root: root.id, path: segs, dstRoot: root.id, dstPath: dstSegs, job }),
            (e) => onFile?.(e.done, e.file));
          return r.files;
        } catch (e) {
          if (e.code !== 'UNSUPPORTED') throw e;
          // encrypted ZIP etc.: fall back to the JS extractor below
        }
      }
      const entries = await extractArchive(await local.read(root, segs), { password });
      const plan = entries.map((e) => ({ ...e, segs: safeSegments(e.path) })).filter((e) => e.segs.length);
      let n = 0;
      for (const e of plan) {
        if (e.dir) { await local.mkdir(root, [...dstSegs, ...e.segs]); continue; }
        onFile?.(n, e.segs.join('/'));
        await local.write(root, [...dstSegs, ...e.segs], e.data);
        n++;
      }
      return n;
    },
    save: (root, segs) => call('exportFile', { root: root.id, path: segs }),
    async usage() { return null; },
  };

  // ---------- remote ----------
  let sid = null;
  const ftp = async (name, args) => {
    try {
      return await P[name]({ sid, ...args });
    } catch (e) {
      const err = wrap(e);
      if (err.code === 'DISCONNECTED') sid = null;
      throw err;
    }
  };
  const remote = {
    needsRelay: false,
    get connected() { return !!sid; },
    get sessionId() { return sid; },
    ping: async () => true,
    async connect(p, password) {
      const r = await call('ftpConnect', { host: p.host, port: p.port || 0, user: p.user, password, secure: p.secure, insecureTls: !!p.insecureTls });
      sid = r.sid;
      return r;
    },
    async disconnect() {
      if (!sid) return;
      const s = sid;
      sid = null;
      await call('ftpDisconnect', { sid: s }).catch(() => {});
    },
    async list(path) { return (await ftp('ftpList', { path })).items; },
    mkdir: (path) => ftp('ftpMkdir', { path }),
    remove: (path, dir) => ftp('ftpDelete', { path, dir }),
    rename: (from, to) => ftp('ftpRename', { from, to }),
    uploadLocal: (root, segs, remote, onProgress) => withJob((job) => ftp('ftpUpload', { root: root.id, path: segs, remote, job }),
      (e) => onProgress?.(e.done, e.total)),
    downloadLocal: (remote, root, segs, size, onProgress) => withJob((job) => ftp('ftpDownload', { remote, root: root.id, path: segs, size: size || 0, job }),
      (e) => onProgress?.(e.done, e.total)),
    async copyRemote(from, to) {
      // via a temp file in the app workspace
      const tmp = ['.tmp', `copy-${Date.now()}`];
      const app = { id: 'app' };
      try {
        await remote.downloadLocal(from, app, tmp);
        await remote.uploadLocal(app, tmp, to);
      } finally {
        await local.remove(app, ['.tmp']).catch(() => {});
      }
    },
  };

  return { name: 'native', local, remote, exitApp: () => call('exitApp') };
}

function b64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
