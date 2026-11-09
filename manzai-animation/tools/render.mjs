// アニメーションを mp4 に書き出す。
// 使い方: node tools/render.mjs <出力.mp4> [音声ファイル] [開始秒] [終了秒]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [out = 'out.mp4', audio, from = '0', to] = process.argv.slice(2);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`http://localhost:${port}/`);
await page.evaluate(() => window.ANIM.ready);
const { FPS, duration } = await page.evaluate(() => ({ FPS: ANIM.FPS, duration: ANIM.duration }));
const t0 = +from, t1 = to ? +to : duration;

const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-'];
if (audio) args.push('-ss', String(t0), '-t', String(t1 - t0), '-i', audio, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '160k', '-af', `afade=t=out:st=${t1 - t0 - 0.5}:d=0.5`);
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'medium', '-movflags', '+faststart', '-shortest', out);
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });

const n = Math.round((t1 - t0) * FPS);
for (let i = 0; i < n; i++) {
  const b64 = await page.evaluate(t => { ANIM.renderFrame(t); return document.getElementById('stage').toDataURL('image/jpeg', 0.93).slice(23); }, t0 + i / FPS);
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  if (i % 240 === 0) console.log(`${(t0 + i / FPS).toFixed(0)}s / ${t1.toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close(); server.close();
console.log('done', out);
