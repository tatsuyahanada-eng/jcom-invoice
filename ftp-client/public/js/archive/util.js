// Shared helpers for archive readers.
const utf8 = new TextDecoder('utf-8', { fatal: true });
let sjis = null;
try { sjis = new TextDecoder('shift_jis'); } catch { /* not available */ }

// Archives made on Japanese Windows store names in Shift_JIS (CP932).
// Use UTF-8 when it decodes cleanly, otherwise fall back to Shift_JIS.
export function decodeName(bytes, forceUtf8 = false) {
  if (forceUtf8) return new TextDecoder().decode(bytes);
  try { return utf8.decode(bytes); } catch { /* not utf-8 */ }
  if (sjis) return sjis.decode(bytes);
  return new TextDecoder('latin1').decode(bytes);
}

const CRC16 = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1;
    t[i] = c;
  }
  return t;
})();
export function crc16(d) {
  let c = 0;
  for (let i = 0; i < d.length; i++) c = (c >>> 8) ^ CRC16[(c ^ d[i]) & 0xff];
  return c;
}

const CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
export function crc32(d, c = 0) {
  c = ~c >>> 0;
  for (let i = 0; i < d.length; i++) c = (c >>> 8) ^ CRC32[(c ^ d[i]) & 0xff];
  return ~c >>> 0;
}

// Turn an archive entry path into safe path segments.
// Blocks "zip slip" (../, absolute paths, drive letters) and invalid names.
export function safeSegments(path) {
  const segs = [];
  for (let s of String(path).replace(/\\/g, '/').split('/')) {
    s = s.trim();
    if (!s || s === '.') continue;
    if (s === '..') throw new Error(`危険なパスを含むため中止しました: ${path}`);
    if (/^[a-zA-Z]:$/.test(s) && segs.length === 0) continue; // C:
    s = s.replace(/[\x00-\x1f<>:"|?*]/g, '_');
    segs.push(s);
  }
  return segs;
}
