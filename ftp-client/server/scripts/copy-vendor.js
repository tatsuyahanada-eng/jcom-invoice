// Copy the libarchive WASM build into public/vendor so the PWA can load it
// from its own origin (no CDN, works offline).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../node_modules/libarchive.js/dist');
const dst = path.resolve(here, '../../public/vendor/libarchive');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['libarchive.js', 'worker-bundle.js', 'libarchive.wasm']) {
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
console.log('libarchive copied to', dst);
