// J:COMチェッカー（tools/jcom_checker.json）と本ツール（data.js）の「SIMロック解除の要否」を照合する（上書きはしない）
//   node tools/jcom_compare.js   → jcom_ref.js（アプリの参考表示用）／JCOM_COMPARE.md（照合レポート）／tools/jcom_compare.csv
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8').replace(/^const /gm, 'var '));
const J = JSON.parse(fs.readFileSync(path.join(__dirname, 'jcom_checker.json'), 'utf8'));
const CNAME = { au: 'au', docomo: 'ドコモ', sb: 'ソフトバンク', uq: 'UQモバイル', ymobile: 'ワイモバイル', rakuten: '楽天モバイル', free: 'SIMフリー' };
const LIB = require(path.join(ROOT, 'jcom_lib.js'));
const { rows, ref, unreg, notInJ, idx } = LIB.compare(DEVICES, UNLOCK, J);
let chg = { date: '', total: J.length, added: [], removed: [], changed: [] };
try { chg = JSON.parse(fs.readFileSync(path.join(__dirname, 'jcom_changes.json'), 'utf8')); } catch (e) {}
fs.writeFileSync(path.join(ROOT, 'jcom_ref.js'), LIB.refJs({ ref, unreg }, J.length, process.env.JCOM_DATE || chg.date || '2026-10-07', chg));
// CSV
const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(__dirname, 'jcom_compare.csv'), '﻿' + [['結果', 'J:COM区分', 'メーカー', 'J:COM機種名', 'J:COM判定', '本ツール機種名', '型番', '発売', '本ツール判定', '理由'].map(esc).join(',')]
  .concat(rows.map(r => [r.status, r.j.cat, r.j.maker, r.j.name, r.j.unlock, r.x ? r.x.d.name : '', r.x ? r.x.v.code || '' : '', r.x ? r.x.v.rel : '', r.lab || '', r.why || ''].map(esc).join(','))).join('\n'));
// レポート
const cnt = {}; for (const r of rows) { const k = r.j.cat; cnt[k] = cnt[k] || { 一致: 0, 基準の違い: 0, 相違: 0, アプリ未登録: 0 }; cnt[k][r.status]++; }
let md = `# J:COMチェッカーとの照合レポート\n\n- J:COM：「モバイル動作確認端末チェッカー」https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html （${J.length}件、取得 ${process.env.JCOM_DATE || chg.date || '2026-10-07'}）\n- 本ツール：data.js（各キャリア公式で補正済み）。**本ツールのデータは上書きしていません**\n\n`;
md += '## 集計\n\n| J:COM区分 | 一致 | 基準の違い | 相違 | 本ツール未登録 |\n|---|---|---|---|---|\n' + Object.entries(cnt).map(([k, v]) => `| ${k} | ${v.一致} | ${v.基準の違い} | ${v.相違} | ${v.アプリ未登録} |`).join('\n') + '\n\n';
md += '## 相違（要確認）\n\n| J:COM区分 | 機種 | 型番 | 発売 | J:COM | 本ツール | 理由 |\n|---|---|---|---|---|---|---|\n' + rows.filter(r => r.status === '相違').map(r => `| ${r.j.cat} | ${r.j.name} | ${r.x.v.code || '—'} | ${r.x.v.rel} | ${r.j.unlock} | ${r.lab} | ${r.why} |`).join('\n') + '\n\n';
md += '## 基準の違い（au版：J:COMは「au回線で使う場合」、本ツールは「他社回線で使う場合」）\n\n' + rows.filter(r => r.status === '基準の違い').map(r => `${r.j.name}（${r.x.v.rel}）`).join('、') + '\n\n';
md += '## J:COMにあり本ツール未登録\n\n' + Object.entries(rows.filter(r => r.status === 'アプリ未登録').reduce((o, r) => ((o[r.j.cat] = o[r.j.cat] || []).push(r.j.name), o), {})).map(([k, v]) => `- **${k}**（${v.length}）：${v.join('、')}`).join('\n') + '\n\n';
md += `## 本ツールにありJ:COMに無い（キャリア版 ${notInJ.length}件）\n\n` + Object.entries(notInJ.reduce((o, x) => ((o[CNAME[x.v.c]] = o[CNAME[x.v.c]] || []).push(x.d.name + (x.v.code ? ' ' + x.v.code : '')), o), {})).map(([k, v]) => `- **${k}**（${v.length}）：${v.join('、')}`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'JCOM_COMPARE.md'), md);
for (const [k, v] of Object.entries(cnt)) console.log(k, JSON.stringify(v));
console.log('相違', rows.filter(r => r.status === '相違').length, '／基準の違い', rows.filter(r => r.status === '基準の違い').length, '／本ツールのみ', notInJ.length);
