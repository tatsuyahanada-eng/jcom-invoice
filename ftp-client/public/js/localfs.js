// Local file system on top of the File System Access API.
// Root is either the app's private storage (OPFS, works on phones too)
// or a real folder picked with showDirectoryPicker (desktop Chrome/Edge).

export async function opfsRoot() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle('workspace', { create: true });
}

export const canPickFolder = () => typeof window.showDirectoryPicker === 'function';

export async function pickFolder() {
  const h = await window.showDirectoryPicker({ mode: 'readwrite' });
  if ((await h.queryPermission?.({ mode: 'readwrite' })) !== 'granted') {
    if ((await h.requestPermission?.({ mode: 'readwrite' })) !== 'granted') throw new Error('書き込み権限がありません');
  }
  return h;
}

export async function dirAt(root, segs, create = false) {
  let d = root;
  for (const s of segs) d = await d.getDirectoryHandle(s, { create });
  return d;
}

export async function list(root, segs) {
  const d = await dirAt(root, segs);
  const out = [];
  for await (const [name, h] of d.entries()) {
    if (h.kind === 'file') {
      const f = await h.getFile();
      out.push({ name, type: 'file', size: f.size, mtime: f.lastModified });
    } else out.push({ name, type: 'dir', size: 0, mtime: null });
  }
  return out;
}

export async function readFile(root, segs) {
  const d = await dirAt(root, segs.slice(0, -1));
  return (await d.getFileHandle(segs[segs.length - 1])).getFile();
}

let worker = null;
function syncWrite(segs, blob) {
  // Safari fallback: createWritable is missing, use a worker with sync access handles.
  worker ||= new Worker(new URL('./opfs-writer.js', import.meta.url));
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (e) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMsg);
      e.data.error ? reject(new Error(e.data.error)) : resolve();
    };
    worker.addEventListener('message', onMsg);
    worker.postMessage({ id, segs, blob });
  });
}

export async function writeFile(root, segs, blob, isOpfs) {
  const d = await dirAt(root, segs.slice(0, -1), true);
  const fh = await d.getFileHandle(segs[segs.length - 1], { create: true });
  if (fh.createWritable) {
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  } else if (isOpfs) {
    await syncWrite(['workspace', ...segs], blob);
  } else throw new Error('このブラウザはファイル書き込みに対応していません');
}

export async function mkdir(root, segs) { await dirAt(root, segs, true); }

export async function remove(root, segs) {
  const d = await dirAt(root, segs.slice(0, -1));
  await d.removeEntry(segs[segs.length - 1], { recursive: true });
}

export async function exists(root, segs) {
  try {
    const d = await dirAt(root, segs.slice(0, -1));
    const n = segs[segs.length - 1];
    try { await d.getFileHandle(n); return 'file'; } catch { /* not a file */ }
    await d.getDirectoryHandle(n);
    return 'dir';
  } catch { return null; }
}

// Walk files below segs. Yields { rel: [..], file } and { rel, dir: true } for directories.
export async function* walk(root, segs, rel = []) {
  const d = await dirAt(root, segs);
  for await (const [name, h] of d.entries()) {
    if (h.kind === 'file') yield { rel: [...rel, name], file: await h.getFile() };
    else {
      yield { rel: [...rel, name], dir: true };
      yield* walk(root, [...segs, name], [...rel, name]);
    }
  }
}

export async function usage() {
  try { return await navigator.storage.estimate(); } catch { return null; }
}
