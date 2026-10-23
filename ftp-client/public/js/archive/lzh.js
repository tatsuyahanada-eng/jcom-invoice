// LZH (LHA) reader: header level 0/1/2, methods -lh0- -lhd- -lh5- -lh6- -lh7-.
// Shift_JIS file names (common in Japanese archives) are decoded correctly.
import { decodeName, crc16 } from './util.js';

const METHODS = { '-lh5-': 13, '-lh6-': 15, '-lh7-': 16 };

export async function readLzh(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = [];
  let pos = 0;
  while (pos < buf.length) {
    if (buf[pos] === 0) break; // end of archive
    const h = parseHeader(buf, pos);
    if (!h) throw new Error('LZH ヘッダが壊れています');
    const dataStart = h.dataStart;
    const dataEnd = dataStart + h.packed;
    if (dataEnd > buf.length) throw new Error('LZH データが途中で切れています');
    if (h.method === '-lhd-' || h.isDir) {
      entries.push({ path: h.path.replace(/\/?$/, '/'), dir: true });
    } else {
      const src = buf.subarray(dataStart, dataEnd);
      let out;
      if (h.method === '-lh0-' || h.method === '-lz4-') out = src.slice();
      else if (METHODS[h.method]) out = decodeLh(src, h.size, METHODS[h.method]);
      else throw new UnsupportedError(`未対応の圧縮方式 ${h.method}`);
      if (h.crc != null && crc16(out) !== h.crc) throw new Error(`CRC エラー: ${h.path}`);
      entries.push({ path: h.path, dir: false, data: new Blob([out]), mtime: h.mtime });
    }
    pos = dataEnd;
  }
  return entries;
}

export class UnsupportedError extends Error {}

function u16(b, p) { return b[p] | (b[p + 1] << 8); }
function u32(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; }

function parseHeader(b, p) {
  if (p + 22 > b.length) return null;
  const level = b[p + 20];
  const method = String.fromCharCode(...b.subarray(p + 2, p + 7));
  if (!/^-l[hz][0-9a-z]-$/.test(method)) return null;
  let packed = u32(b, p + 7);
  const size = u32(b, p + 11);
  let nameBytes = null, dirBytes = null, crc = null, isDir = false, mtime = null;
  let dataStart;

  const readExt = (q, nextSize, headerEnd) => {
    let total = 0;
    while (nextSize > 0) {
      if (q + nextSize > b.length) return -1;
      const type = b[q];
      const body = b.subarray(q + 1, q + nextSize - 2);
      if (type === 0x01) nameBytes = body;
      else if (type === 0x02) dirBytes = body;
      else if (type === 0x54 && body.length >= 4) mtime = u32(body, 0) * 1000;
      total += nextSize;
      q += nextSize;
      nextSize = u16(b, q - 2);
    }
    return total;
  };

  if (level === 0 || level === 1) {
    const hsize = b[p];
    const nlen = b[p + 21];
    nameBytes = b.subarray(p + 22, p + 22 + nlen);
    crc = u16(b, p + 22 + nlen);
    mtime = dosTime(u32(b, p + 15));
    if (level === 0) {
      dataStart = p + hsize + 2;
    } else {
      const base = p + hsize + 2;
      const first = u16(b, base - 2);
      const extTotal = readExt(base, first);
      if (extTotal < 0) return null;
      packed -= extTotal; // level 1: packed size includes extended headers
      dataStart = base + extTotal;
    }
  } else if (level === 2) {
    const total = u16(b, p);
    crc = u16(b, p + 21);
    mtime = u32(b, p + 15) * 1000;
    if (readExt(p + 26, u16(b, p + 24)) < 0) return null;
    dataStart = p + total;
  } else {
    throw new UnsupportedError(`未対応の LZH ヘッダレベル ${level}`);
  }

  if (method === '-lhd-') { isDir = true; crc = null; }
  let full = new Uint8Array(0);
  if (dirBytes && dirBytes.length) {
    const d = Uint8Array.from(dirBytes, (c) => (c === 0xff ? 0x2f : c));
    full = d;
    if (d[d.length - 1] !== 0x2f && nameBytes && nameBytes.length) full = concat(d, [0x2f]);
  }
  if (nameBytes) full = concat(full, Uint8Array.from(nameBytes, (c) => (c === 0xff ? 0x2f : c)));
  let path = decodeName(full).replace(/\\/g, '/');
  return { method, packed, size, crc, isDir, path, dataStart, mtime };
}

function concat(a, b) { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; }

function dosTime(t) {
  const d = new Date(((t >>> 25) & 0x7f) + 1980, ((t >>> 21) & 0x0f) - 1, (t >>> 16) & 0x1f,
    (t >>> 11) & 0x1f, (t >>> 5) & 0x3f, (t & 0x1f) * 2);
  return isNaN(d) ? null : d.getTime();
}

// ---- static Huffman + LZSS decoder (lh5/lh6/lh7) ----
const NC = 510, NT = 19, TBIT = 5, CBIT = 9;

function decodeLh(src, origSize, dicbit) {
  const np = dicbit + 1;
  const pbit = dicbit === 13 ? 4 : 5;
  const out = new Uint8Array(origSize);
  let ip = 0, bitbuf = 0, bitcnt = 0;

  const fill = () => {
    while (bitcnt <= 24) {
      bitbuf = (bitbuf << 8) | (ip < src.length ? src[ip] : 0);
      ip++;
      bitcnt += 8;
    }
  };
  const peek16 = () => { fill(); return (bitbuf >>> (bitcnt - 16)) & 0xffff; };
  const skip = (n) => { bitcnt -= n; };
  const getbits = (n) => {
    if (n === 0) return 0;
    fill();
    const v = (bitbuf >>> (bitcnt - n)) & ((1 << n) - 1);
    bitcnt -= n;
    return v;
  };

  const cLen = new Uint8Array(NC), ptLen = new Uint8Array(Math.max(NT, np));
  const cTab = { sym: new Uint16Array(65536), len: new Uint8Array(65536) };
  const pTab = { sym: new Uint16Array(65536), len: new Uint8Array(65536) };

  const makeTable = (n, lens, tab) => {
    const count = new Uint32Array(18);
    for (let i = 0; i < n; i++) count[lens[i]]++;
    count[0] = 0;
    const next = new Uint32Array(18);
    // canonical: codes assigned by length, then symbol order
    let c = 0;
    for (let l = 1; l <= 16; l++) { next[l] = c; c = (c + count[l]) << 1; }
    for (let s = 0; s < n; s++) {
      const l = lens[s];
      if (!l) continue;
      if (l > 16) throw new Error('LZH 符号長エラー');
      const cd = next[l]++;
      const start = cd << (16 - l), span = 1 << (16 - l);
      if (start + span > 65536) throw new Error('LZH ハフマン表エラー');
      tab.sym.fill(s, start, start + span);
      tab.len.fill(l, start, start + span);
    }
  };
  const single = (tab, s) => { tab.sym.fill(s); tab.len.fill(0); };
  const decode = (tab) => { const k = peek16(); skip(tab.len[k]); return tab.sym[k]; };

  const readPtLen = (nn, nbit, special) => {
    const n = getbits(nbit);
    if (n === 0) { ptLen.fill(0, 0, nn); single(pTab, getbits(nbit)); return; }
    let i = 0;
    while (i < n && i < nn) {
      let c = getbits(3);
      if (c === 7) while (getbits(1) === 1) c++;
      ptLen[i++] = c;
      if (i === special) { let z = getbits(2); while (z-- > 0 && i < nn) ptLen[i++] = 0; }
    }
    while (i < nn) ptLen[i++] = 0;
    makeTable(nn, ptLen, pTab);
  };

  const readCLen = () => {
    const n = getbits(CBIT);
    if (n === 0) { cLen.fill(0); single(cTab, getbits(CBIT)); return; }
    let i = 0;
    while (i < n && i < NC) {
      let c = decode(pTab);
      if (c <= 2) {
        if (c === 0) c = 1; else if (c === 1) c = getbits(4) + 3; else c = getbits(CBIT) + 20;
        while (c-- > 0 && i < NC) cLen[i++] = 0;
      } else cLen[i++] = c - 2;
    }
    while (i < NC) cLen[i++] = 0;
    makeTable(NC, cLen, cTab);
  };

  let op = 0, blockLeft = 0;
  while (op < origSize) {
    if (blockLeft === 0) {
      blockLeft = getbits(16);
      readPtLen(NT, TBIT, 3);
      readCLen();
      readPtLen(np, pbit, -1);
      if (blockLeft === 0) throw new Error('LZH ブロックエラー');
    }
    blockLeft--;
    const c = decode(cTab);
    if (c < 256) {
      out[op++] = c;
    } else {
      let len = c - 253;
      let j = decode(pTab);
      if (j !== 0) j = (1 << (j - 1)) + getbits(j - 1);
      let from = op - j - 1;
      while (len-- > 0 && op < origSize) {
        out[op++] = from >= 0 ? out[from] : 0x20;
        from++;
      }
    }
    if (ip > src.length + 8) throw new Error('LZH データ不足');
  }
  return out;
}
