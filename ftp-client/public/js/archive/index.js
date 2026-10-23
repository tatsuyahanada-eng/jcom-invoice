// Archive dispatcher. Returns [{ path, dir, data: Blob }].
// ZIP / LZH: own readers (Shift_JIS names OK). Others: libarchive (WASM).
import { readZip } from './zip.js';
import { readLzh, UnsupportedError } from './lzh.js';

export const ARCHIVE_RE = /\.(zip|lzh|lha|tar|tgz|tar\.gz|tbz2?|tar\.bz2|txz|tar\.xz|gz|rar|7z)$/i;

export function isArchive(name) { return ARCHIVE_RE.test(name); }

async function sniff(file) {
  const h = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (h[0] === 0x50 && h[1] === 0x4b) return 'zip';
  if (h[2] === 0x2d && h[3] === 0x6c && (h[4] === 0x68 || h[4] === 0x7a) && h[6] === 0x2d) return 'lzh';
  return 'other';
}

export async function extractArchive(file, { password } = {}) {
  const kind = await sniff(file);
  try {
    if (kind === 'zip' && !password) return await readZip(file);
    if (kind === 'lzh') return await readLzh(file);
  } catch (e) {
    if (!(e instanceof UnsupportedError)) throw e;
  }
  return extractWithLibarchive(file, password);
}

async function extractWithLibarchive(file, password) {
  const { Archive } = await import(new URL('../../vendor/libarchive/libarchive.js', import.meta.url).href);
  const archive = await Archive.open(file);
  if (password) await archive.usePassword(password);
  else if (await archive.hasEncryptedData()) {
    const err = new Error('パスワードが必要です');
    err.needPassword = true;
    throw err;
  }
  await archive.extractFiles();
  const list = await archive.getFilesArray();
  const out = [];
  for (const { file: f, path } of list) {
    const blob = f instanceof Blob ? f : await f.extract();
    const name = blob.name || f.name;
    out.push({ path: (path || '') + name, dir: false, data: blob });
  }
  if (!out.length) throw new Error('展開できるファイルがありません（形式未対応、または壊れています）');
  return out;
}
