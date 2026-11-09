// 確認用: 指定した秒のフレームを1枚の画像に並べる。 node tools/shot.mjs out.png 10 20 30 ...
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [out, ...ts] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('file://' + root + '/index.html');
await page.evaluate(() => window.ANIM.ready);
await page.evaluate(async ts => {
  const cols = Math.min(3, ts.length), rows = Math.ceil(ts.length / cols);
  const c = document.createElement('canvas'); c.width = 640 * cols; c.height = 360 * rows; c.id = 'sheet';
  const g = c.getContext('2d');
  ts.forEach((t, i) => { ANIM.renderFrame(+t); g.drawImage(document.getElementById('stage'), (i % cols) * 640, Math.floor(i / cols) * 360, 640, 360); g.fillStyle = '#0f0'; g.font = '20px sans-serif'; g.fillText(t + 's', (i % cols) * 640 + 8, Math.floor(i / cols) * 360 + 24); });
  document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;display:block'; document.body.appendChild(c);
  c.style.cssText = 'width:auto;height:auto';
}, ts);
await (await page.$('#sheet')).screenshot({ path: out });
await browser.close();
