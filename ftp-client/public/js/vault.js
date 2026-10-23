// Encrypted local store for server profiles and the relay token.
// AES-GCM 256 with a key derived from a master password (PBKDF2-SHA256).
// Nothing is stored in plain text; the key lives only in memory while unlocked.
const KEY = 'appup.ftp.vault';
const ITER = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cryptoKey = null;
let salt = null;
let data = null;

async function derive(password, saltBytes, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export const vault = {
  exists() { return !!localStorage.getItem(KEY); },
  isUnlocked() { return !!cryptoKey; },
  get data() { return data; },

  async create(password) {
    if (password.length < 8) throw new Error('マスターパスワードは8文字以上にしてください');
    salt = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await derive(password, salt, ITER);
    data = { servers: [], relayToken: '', settings: { autoLockMin: 10, savePasswords: true } };
    await this.save();
  },

  async unlock(password) {
    const raw = JSON.parse(localStorage.getItem(KEY));
    const s = unb64(raw.salt);
    const k = await derive(password, s, raw.iter);
    try {
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(raw.iv) }, k, unb64(raw.ct));
      data = JSON.parse(dec.decode(pt));
    } catch {
      throw new Error('マスターパスワードが違います');
    }
    salt = s;
    cryptoKey = k;
    data.settings ||= { autoLockMin: 10, savePasswords: true };
    if (raw.iter < ITER) { cryptoKey = await derive(password, salt, ITER); await this.save(); }
  },

  async save() {
    if (!cryptoKey) throw new Error('ロックされています');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(data))));
    localStorage.setItem(KEY, JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }));
  },

  async changePassword(oldPw, newPw) {
    const keep = data;
    await this.unlock(oldPw);
    if (newPw.length < 8) throw new Error('マスターパスワードは8文字以上にしてください');
    salt = crypto.getRandomValues(new Uint8Array(16));
    cryptoKey = await derive(newPw, salt, ITER);
    data = keep;
    await this.save();
  },

  lock() { cryptoKey = null; data = null; },

  reset() { localStorage.removeItem(KEY); this.lock(); },

  // Encrypted backup (same master password) for moving to another device.
  exportBlob() { return new Blob([localStorage.getItem(KEY)], { type: 'application/json' }); },
  async importText(text) {
    const raw = JSON.parse(text);
    if (!raw || raw.v !== 1 || !raw.ct || !raw.salt || !raw.iv) throw new Error('バックアップ形式が不正です');
    localStorage.setItem(KEY, JSON.stringify(raw));
    this.lock();
  },
};
