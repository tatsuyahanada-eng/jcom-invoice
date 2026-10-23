// Copy the shared web UI (../public) into www/ for the Android app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../public');
const www = path.resolve(here, '../www');
fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(src, www, { recursive: true, filter: (p) => !p.includes(`${path.sep}vendor${path.sep}`) && !p.endsWith(`${path.sep}vendor`) });
const lib = path.resolve(here, '../node_modules/libarchive.js/dist');
fs.mkdirSync(path.join(www, 'vendor/libarchive'), { recursive: true });
for (const f of ['libarchive.js', 'worker-bundle.js', 'libarchive.wasm']) fs.copyFileSync(path.join(lib, f), path.join(www, 'vendor/libarchive', f));
// Capacitor runtime (ES module, no dependencies)
fs.mkdirSync(path.join(www, 'vendor/capacitor'), { recursive: true });
fs.copyFileSync(path.resolve(here, '../node_modules/@capacitor/core/dist/index.js'), path.join(www, 'vendor/capacitor/core.js'));
// the browser-only service worker is not needed inside the app
fs.rmSync(path.join(www, 'sw.js'), { force: true });
console.log('www ready:', www);
