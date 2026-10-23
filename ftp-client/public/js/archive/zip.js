// ZIP reader with Shift_JIS name support. Handles stored/deflate and Zip64.
// Anything else (encrypted, other methods) throws UnsupportedError so the
// caller can fall back to libarchive.
import { decodeName, crc32 } from './util.js';
import { UnsupportedError } from './lzh.js';

const dv = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

async function readRange(file, start, end) {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

export async function readZip(file) {
  const size = file.size;
  const tailLen = Math.min(size, 65557);
  const tail = await readRange(file, size - tailLen, size);
  let eo = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { eo = i; break; }
  }
  if (eo < 0) throw new Error('ZIP の終端が見つかりません');
  const t = dv(tail);
  let count = t.getUint16(eo + 10, true);
  let cdSize = t.getUint32(eo + 12, true);
  let cdOff = t.getUint32(eo + 16, true);

  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eo - 20;
    if (loc >= 0 && t.getUint32(loc, true) === 0x07064b50) {
      const z64off = Number(t.getBigUint64(loc + 8, true));
      const z = dv(await readRange(file, z64off, z64off + 56));
      if (z.getUint32(0, true) !== 0x06064b50) throw new Error('Zip64 ヘッダが不正です');
      count = Number(z.getBigUint64(32, true));
      cdSize = Number(z.getBigUint64(40, true));
      cdOff = Number(z.getBigUint64(48, true));
    }
  }

  const cd = await readRange(file, cdOff, cdOff + cdSize);
  const c = dv(cd);
  const items = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (c.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 中央ディレクトリが不正です');
    const flags = c.getUint16(p + 8, true);
    const method = c.getUint16(p + 10, true);
    const crc = c.getUint32(p + 16, true);
    let csize = c.getUint32(p + 20, true);
    let usize = c.getUint32(p + 24, true);
    const nlen = c.getUint16(p + 28, true);
    const elen = c.getUint16(p + 30, true);
    const clen = c.getUint16(p + 32, true);
    let lho = c.getUint32(p + 42, true);
    const nameBytes = cd.subarray(p + 46, p + 46 + nlen);
    let name = decodeName(nameBytes, (flags & 0x800) !== 0);
    // extra fields
    let q = p + 46 + nlen;
    const eEnd = q + elen;
    while (q + 4 <= eEnd) {
      const id = c.getUint16(q, true), sz = c.getUint16(q + 2, true);
      let r = q + 4;
      if (id === 0x0001) {
        if (usize === 0xffffffff) { usize = Number(c.getBigUint64(r, true)); r += 8; }
        if (csize === 0xffffffff) { csize = Number(c.getBigUint64(r, true)); r += 8; }
        if (lho === 0xffffffff) { lho = Number(c.getBigUint64(r, true)); r += 8; }
      } else if (id === 0x7075 && sz > 5) {
        name = new TextDecoder().decode(cd.subarray(q + 9, q + 4 + sz)); // Info-ZIP Unicode path
      }
      q += 4 + sz;
    }
    items.push({ name: name.replace(/\\/g, '/'), flags, method, crc, csize, usize, lho });
    p = eEnd + clen;
  }

  if (items.some((it) => it.flags & 1)) throw new UnsupportedError('暗号化 ZIP');
  if (items.some((it) => it.method !== 0 && it.method !== 8)) throw new UnsupportedError('未対応の ZIP 圧縮方式');

  const entries = [];
  for (const it of items) {
    if (it.name.endsWith('/')) { entries.push({ path: it.name, dir: true }); continue; }
    const lh = dv(await readRange(file, it.lho, it.lho + 30));
    if (lh.getUint32(0, true) !== 0x04034b50) throw new Error(`ZIP ローカルヘッダが不正: ${it.name}`);
    const start = it.lho + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    const raw = file.slice(start, start + it.csize);
    let data;
    if (it.method === 0) data = raw;
    else data = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length !== it.usize || crc32(bytes) !== it.crc) throw new Error(`CRC エラー: ${it.name}`);
    entries.push({ path: it.name, dir: false, data: new Blob([bytes]) });
  }
  return entries;
}
