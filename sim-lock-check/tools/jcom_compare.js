// J:COMチェッカー（tools/jcom_checker.json）と本ツール（data.js）の「SIMロック解除の要否」を照合する（上書きはしない）
//   node tools/jcom_compare.js   → jcom_ref.js（アプリの参考表示用）／JCOM_COMPARE.md（照合レポート）／tools/jcom_compare.csv
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8').replace(/^const /gm, 'var '));
const J = JSON.parse(fs.readFileSync(path.join(__dirname, 'jcom_checker.json'), 'utf8'));
const CAT = { au: 'au', docomo: 'docomo', SoftBank: 'sb', UQ: 'uq', 'Y!mobile': 'ymobile', '楽天モバイル': 'rakuten', 'SIMフリー': 'free' };
const CNAME = { au: 'au', docomo: 'ドコモ', sb: 'ソフトバンク', uq: 'UQモバイル', ymobile: 'ワイモバイル', rakuten: '楽天モバイル', free: 'SIMフリー' };
const CODE = /\b([A-Z]{2,3}-\d{2}[A-Z]|[A-Z]{3}\d{2}|[A-Z]{2}[VGFTX]\d{2}|A\d{3}[A-Z]{2}|\d{3}[A-Z]{2,3}|LP-\d{2})\b/g;
const N = x => (x || '').toLowerCase().normalize('NFKC').replace(/samsung|google|motorola|xiaomi|sony|sharp|kyocera|fcnt|®|™|（.*?）|\(.*?\)|\s|-|・/g, '');
const NG = x => (x || '').toLowerCase().normalize('NFKC').replace(/samsung|google|®|™|\s|-|・/g, '').replace(/[（）()]/g, '');
const rk = r => { const m = /(\d{4})年(?:(\d{1,2})月)?/.exec(r || ''); return m ? +m[1] * 100 + (m[2] ? +m[2] : 6) : 0; };
const sold = v => { const b = (UNLOCK[v.c] || {}).buy; return !!(b && v.ship === 'locked' && /\d{4}年\d{1,2}月/.test(v.rel || '') && rk(v.rel) > rk(b.since)); };
const verdict = v => { const u = UNLOCK[v.c] || {};
  if (v.c === 'rakuten' || v.c === 'free' || v.ship === 'free' || sold(v)) return ['不要', '解除不要'];
  if (v.ship === 'locked') return ['要', u.buy ? '購入日で判定' : u.remote ? '要確認（au側で順次解除中）' : '要解除'];
  return ['?', v.ship]; };
const idx = [];
for (const d of DEVICES) { if (d.generic) continue; for (const v of d.variants) idx.push({ d, v, codes: ((v.code || '') + ' ' + (v.n || '')).match(CODE) || [], n: N(d.name), ng: NG(d.name), nn: N(v.n || '') }); }
const rows = [], used = new Set();
for (const j of J) {
  const c = CAT[j.cat], cand = idx.filter(x => x.v.c === c), jc = j.name.match(CODE) || [];
  let hit = cand.filter(x => jc.some(k => x.codes.includes(k)));
  if (!hit.length) hit = cand.filter(x => x.ng === NG(j.name));
  if (!hit.length) hit = cand.filter(x => x.n === N(j.name) || (x.nn && x.nn === N(j.name)));
  if (!hit.length) { rows.push({ j, c, status: 'アプリ未登録' }); continue; }
  hit.forEach(h => used.add(h.v));
  const x = hit[0], [a, lab] = verdict(x.v);
  let status = a === j.unlock ? '一致' : '相違', why = '';
  if (status === '相違' && c === 'au' && x.v.ship === 'locked' && j.unlock === '不要')
    { status = '基準の違い'; why = 'J:COM MOBILEはau回線のため、au端末は2017年夏より前の機種を除きロック解除なしで使える（J:COMの判定）。本ツールは他社回線（ドコモ・ソフトバンク系など）で使う場合の判定'; }
  else if (status === '相違' && j.unlock === '要') why = '本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」';
  else if (status === '相違') why = '本ツールは購入日で判定（公式のロックあり機種一覧に掲載）。J:COMは「不要」';
  rows.push({ j, c, x, a, lab, status, why });
}
// アプリの参考表示用（id|キャリア → J:COMの判定）
const ref = {};
for (const r of rows) if (r.x) ref[r.x.d.id + '|' + r.c] = [r.j.unlock, r.j.name, r.status, r.why];
fs.writeFileSync(path.join(ROOT, 'jcom_ref.js'), '/* J:COM「モバイル動作確認端末チェッカー」の判定（参考表示用・自動生成：tools/jcom_compare.js） */\nconst JCOM_REF_DATE = "' + (process.env.JCOM_DATE || '2026-10-07') + '";\nconst JCOM_REF = ' + JSON.stringify(ref) + ';\n');
// CSV
const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
fs.writeFileSync(path.join(__dirname, 'jcom_compare.csv'), '﻿' + [['結果', 'J:COM区分', 'メーカー', 'J:COM機種名', 'J:COM判定', '本ツール機種名', '型番', '発売', '本ツール判定', '理由'].map(esc).join(',')]
  .concat(rows.map(r => [r.status, r.j.cat, r.j.maker, r.j.name, r.j.unlock, r.x ? r.x.d.name : '', r.x ? r.x.v.code || '' : '', r.x ? r.x.v.rel : '', r.lab || '', r.why || ''].map(esc).join(','))).join('\n'));
// レポート
const cnt = {}; for (const r of rows) { const k = r.j.cat; cnt[k] = cnt[k] || { 一致: 0, 基準の違い: 0, 相違: 0, アプリ未登録: 0 }; cnt[k][r.status]++; }
const notInJ = idx.filter(x => !used.has(x.v) && x.v.c !== 'free' && x.v.c !== 'rakuten');
let md = `# J:COMチェッカーとの照合レポート\n\n- J:COM：「モバイル動作確認端末チェッカー」https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html （${J.length}件、取得 ${process.env.JCOM_DATE || '2026-10-07'}）\n- 本ツール：data.js（各キャリア公式で補正済み）。**本ツールのデータは上書きしていません**\n\n`;
md += '## 集計\n\n| J:COM区分 | 一致 | 基準の違い | 相違 | 本ツール未登録 |\n|---|---|---|---|---|\n' + Object.entries(cnt).map(([k, v]) => `| ${k} | ${v.一致} | ${v.基準の違い} | ${v.相違} | ${v.アプリ未登録} |`).join('\n') + '\n\n';
md += '## 相違（要確認）\n\n| J:COM区分 | 機種 | 型番 | 発売 | J:COM | 本ツール | 理由 |\n|---|---|---|---|---|---|---|\n' + rows.filter(r => r.status === '相違').map(r => `| ${r.j.cat} | ${r.j.name} | ${r.x.v.code || '—'} | ${r.x.v.rel} | ${r.j.unlock} | ${r.lab} | ${r.why} |`).join('\n') + '\n\n';
md += '## 基準の違い（au版：J:COMは「au回線で使う場合」、本ツールは「他社回線で使う場合」）\n\n' + rows.filter(r => r.status === '基準の違い').map(r => `${r.j.name}（${r.x.v.rel}）`).join('、') + '\n\n';
md += '## J:COMにあり本ツール未登録\n\n' + Object.entries(rows.filter(r => r.status === 'アプリ未登録').reduce((o, r) => ((o[r.j.cat] = o[r.j.cat] || []).push(r.j.name), o), {})).map(([k, v]) => `- **${k}**（${v.length}）：${v.join('、')}`).join('\n') + '\n\n';
md += `## 本ツールにありJ:COMに無い（キャリア版 ${notInJ.length}件）\n\n` + Object.entries(notInJ.reduce((o, x) => ((o[CNAME[x.v.c]] = o[CNAME[x.v.c]] || []).push(x.d.name + (x.v.code ? ' ' + x.v.code : '')), o), {})).map(([k, v]) => `- **${k}**（${v.length}）：${v.join('、')}`).join('\n') + '\n';
fs.writeFileSync(path.join(ROOT, 'JCOM_COMPARE.md'), md);
for (const [k, v] of Object.entries(cnt)) console.log(k, JSON.stringify(v));
console.log('相違', rows.filter(r => r.status === '相違').length, '／基準の違い', rows.filter(r => r.status === '基準の違い').length, '／本ツールのみ', notInJ.length);
