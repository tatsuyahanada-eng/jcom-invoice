/* 解析ロジックの回帰テスト（依存なし）
   実行: node receipt-ocr/tests/parse.test.js
   OCRのテキストは「よくある崩れ方」を含めてある。ここが崩れると金額違いの請求につながるため、
   パーサを触ったら必ず実行すること。 */
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'assets', 'util.js'));
const parse = require(path.join(__dirname, '..', 'assets', 'parse.js'));
const exporter = require(path.join(__dirname, '..', 'assets', 'export.js'));
const sync = require(path.join(__dirname, '..', 'assets', 'sync.js'));

let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n      got : ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
}
function group(name, fn) { console.log('\n' + name); fn(); }

/* ---------------- レシート解析 ---------------- */

const RECEIPTS = [
  {
    label: 'タイムズ駐車場（入庫・出庫・お預り・お釣り）',
    text: `タイムズ札幌北3条西\n領収書\n入庫 2025年11月04日 09:12\n出庫 2025年11月04日 11:48\n駐車時間 2時間36分\n駐車料金        ¥1,200\nお預り          ¥2,000\nお釣り          ¥800\nTEL 0120-77-8924`,
    want: { date: '2025-11-04', time: '11:48', type: '駐車場', amount: 1200, name: 'タイムズ札幌北3条西' },
  },
  {
    label: '高速通行料（数字がO/lに化けたケース）',
    text: `領 収 書\n中日本高速道路株式会社\n利用日 2025/11/04\n入口 名古屋IC  出口 豊田IC\n通行料金   ¥l,45O\nETCカード ****-****-****-1234\nNo.000123`,
    want: { date: '2025-11-04', type: '高速', amount: 1450, name: '名古屋 → 豊田' },
  },
  {
    label: '令和表記／金額ラベルが1行上',
    text: `三井のリパーク 中央町第5\n令和7年3月9日\nご利用料金\n  600円\n現金 1000円\n釣銭 400円`,
    want: { date: '2025-03-09', type: '駐車場', amount: 600 },
  },
  {
    label: 'ガソリン（小計・消費税・合計）',
    text: `ENEOS セルフ中央SS\n2026/01/15 18:02\nレギュラー 32.15L\n単価 168円\n小計      5,404\n消費税     540\n合計      ¥5,944`,
    want: { date: '2026-01-15', time: '18:02', type: 'ガソリン', amount: 5944 },
  },
  {
    label: '年がなく月日のみ（撮影日から補完）',
    text: `NPC24H 博多駅前パーキング\n11月4日 20:15 出庫\n駐車料金 800円`,
    ctx: { fallbackDate: '2025-11-04' },
    want: { date: '2025-11-04', time: '20:15', type: '駐車場', amount: 800 },
  },
  {
    label: '半角カナのレシート',
    text: `ﾀｲﾑｽﾞ ﾅｺﾞﾔｴｷﾆｼ\n2025/12/02 19:30\nﾁｭｳｼｬﾘｮｳｷﾝ ¥1,100\nｵｱｽﾞｶﾘ ¥2,000`,
    want: { date: '2025-12-02', type: '駐車場', amount: 1100 },
  },
  {
    label: '伝票番号（裸の5桁）を金額と間違えない',
    text: `パラカ 名古屋伏見\n伝票 20983\n2025/11/04\n駐車料金 ¥500`,
    want: { date: '2025-11-04', type: '駐車場', amount: 500 },
  },
  {
    label: 'タクシー',
    text: `日本交通株式会社\n2025年11月04日 22:41\n乗車 22:10  降車 22:41\n運賃 3,480円\n合計 3,480円\n領収書 No.4417`,
    want: { date: '2025-11-04', time: '22:41', type: 'タクシー', amount: 3480 },
  },
  {
    label: '首都高（合計行がなく通行料のみ）',
    text: `首都高速道路株式会社\n領収書\n2025-12-20\n通行料 1,320円`,
    want: { date: '2025-12-20', type: '高速', amount: 1320 },
  },
];

group('レシート解析', () => {
  for (const c of RECEIPTS) {
    const r = parse.receipt(c.text, c.ctx || { fallbackDate: '2025-11-04' });
    for (const [k, v] of Object.entries(c.want)) check(`${c.label} / ${k}`, r[k], v);
  }
});

group('高速道路の経路', () => {
  const route = t => parse.receipt(t, {}).name;
  // 「利用年月日 …」が「入口」の直前に来るため、IC の手前を素朴に拾うと日付を経路名にしてしまう
  check('日付行のあとの入口/出口',
    route('ETC利用証明書\n中日本高速道路株式会社\n利用年月日 2026年02月11日\n入口 名古屋IC\n出口 豊田IC\n通行料金 1,450円'),
    '名古屋 → 豊田');
  check('1行に入口・出口',
    route('中日本高速道路\n利用日 2025/11/04\n入口 名古屋IC  出口 豊田IC\n通行料金 1,450円'),
    '名古屋 → 豊田');
  check('ラベルなしのIC2つ',
    route('高速道路 領収書\n2026/03/01\n川口IC から 浦和IC\n通行料金 900円'),
    '川口 → 浦和');
  check('出口だけ',
    route('NEXCO東日本\n利用日 2026年04月02日\n出口 仙台宮城IC\n通行料金 2,000円'),
    '仙台宮城 出口');
  check('IC情報なしなら事業者名',
    route('首都高速道路株式会社\n領収書\n2025-12-20\n通行料 1,320円'),
    '首都高速道路株式会社');
});

group('Tesseract特有の化けを吸収する', () => {
  // 日本語モデルは数字を丸囲み数字として返すことがある（実測で確認済み）
  check('丸囲み数字', parse.normalize('②⓪②⑤年⑪月⓪④日'), '2025年11月04日');
  check('黒丸数字', parse.normalize('❶❷❸'), '123');
  const r = parse.receipt(
    'タイムズ札幌北3条西\n出庫 ②⓪②⑤年⑪月⓪④日 11:48\n駐車料金 1,200M\nお預り 2,000円',
    { fallbackDate: '2026-09-14' });
  check('丸囲み数字の日付を復元', r.date, '2025-11-04');
  check('円がMに化けても金額を拾う', r.amount, 1200);
});

group('長音記号を壊さない（種別判定の前提）', () => {
  check('パーキング', parse.normalize('パーキング'), 'パーキング');
  check('リパーク', parse.normalize('リパーク'), 'リパーク');
  check('全角英数の半角化', parse.normalize('ＡＢＣ１２３'), 'ABC123');
  check('全角ダッシュはハイフンへ', parse.normalize('2025―11―04'), '2025-11-04');
});

group('2パスの突き合わせ（金額）', () => {
  // 実測: 「駐車料金 1,200円」を通常パスは ⑫⑥⑥円 -> 1266 と読み、
  //       丸囲み数字を禁止したパスは 1,200 と正しく読む。
  const main = parse.receipt('駐車料金 ⑫⑥⑥円\nお預り ②,⑥00円', {});
  const numeric = parse.receipt('駐車料金 1,200\nお預り 2,000', {});
  check('通常パスは誤読する', main.amount, 1266);
  check('金額パスは正しい', numeric.amount, 1200);
  const r = parse.reconcileAmount(main, numeric);
  check('食い違えば金額パスを採用', r.amount, 1200);
  check('食い違いは要確認に落とす', r.confidence <= 0.55, true);

  const same = parse.reconcileAmount({ amount: 800, confidence: { amount: 0.8 } }, { amount: 800, confidence: { amount: 0.8 } });
  check('一致なら加点', same.agreed && same.confidence > 0.8, true);
  check('片方だけなら据え置き', parse.reconcileAmount({ amount: 700, confidence: { amount: 0.9 } }, null).amount, 700);
  check('通常パスが空なら金額パスを採用', parse.reconcileAmount({ amount: '', confidence: { amount: 0 } }, { amount: 300, confidence: { amount: 0.8 } }).amount, 300);
  check('どちらも空', parse.reconcileAmount({ amount: '', confidence: {} }, { amount: '', confidence: {} }).amount, '');
});

/* ---------------- 集計・出力 ---------------- */

const SAMPLE = [
  { id: 'a', date: '2026-01-05', time: '10:00', type: '駐車場', name: 'A', amount: 600, staff: '高橋', confidence: { date: 1, amount: 1 } },
  { id: 'b', date: '2026-01-05', time: '15:00', type: '高速', name: 'B', amount: 1450, staff: '高橋', confidence: { date: 1, amount: 1 } },
  { id: 'c', date: '2026-01-20', time: '', type: '駐車場', name: 'C', amount: 300, staff: '佐藤', confidence: { date: 1, amount: 1 } },
  { id: 'd', date: '2026-02-02', time: '', type: 'タクシー', name: 'D', amount: 2000, staff: '佐藤', confidence: { date: 1, amount: 1 } },
];

group('絞り込み', () => {
  check('日で絞る', exporter.filterRecords(SAMPLE, { mode: 'day', date: '2026-01-05' }).map(r => r.id), ['a', 'b']);
  check('月で絞る', exporter.filterRecords(SAMPLE, { mode: 'month', month: '2026-01' }).map(r => r.id), ['a', 'b', 'c']);
  check('期間で絞る', exporter.filterRecords(SAMPLE, { mode: 'range', from: '2026-01-06', to: '2026-02-28' }).map(r => r.id), ['c', 'd']);
  check('種別で絞る', exporter.filterRecords(SAMPLE, { mode: 'all', types: ['駐車場'] }).map(r => r.id), ['a', 'c']);
  check('担当者で絞る', exporter.filterRecords(SAMPLE, { mode: 'all', staff: '佐藤' }).map(r => r.id), ['c', 'd']);
  check('担当者＋月', exporter.filterRecords(SAMPLE, { mode: 'month', month: '2026-01', staff: '高橋' }).map(r => r.id), ['a', 'b']);
});

group('集計', () => {
  const jan = exporter.filterRecords(SAMPLE, { mode: 'month', month: '2026-01' });
  const t = exporter.grandTotal(jan);
  check('1月合計', t.total, 2350);
  check('1月駐車場', t['駐車場'], 900);
  check('1月高速', t['高速'], 1450);
  check('1月件数', t.count, 3);
  check('日別の日数', exporter.dailySummary(jan).length, 2);
  check('日別1日目合計', exporter.dailySummary(jan)[0].total, 2050);
  check('月別の月数', exporter.monthlySummary(SAMPLE).length, 2);
});

group('要確認の判定', () => {
  check('金額なしは要確認', exporter.needsCheck({ date: '2026-01-05', amount: '' }), true);
  check('日付なしは要確認', exporter.needsCheck({ date: '', amount: 100 }), true);
  check('低信頼は要確認', exporter.needsCheck({ date: '2026-01-05', amount: 100, confidence: { date: 1, amount: 0.4 } }), true);
  check('揃っていれば不要', exporter.needsCheck({ date: '2026-01-05', amount: 100, confidence: { date: 1, amount: 0.9 } }), false);
});

group('CSV', () => {
  const csv = exporter.rowsToCsv(exporter.detailRows(SAMPLE.slice(0, 1)));
  check('ヘッダ', csv.split('\r\n')[0], '日付,曜日,時刻,種別,名称・経路,金額(円),担当者,メモ,読取方法,要確認');
  check('本体', csv.split('\r\n')[1], '2026-01-05,月,10:00,駐車場,A,600,高橋,,,');
  check('カンマを含む値を引用', exporter.rowsToCsv([{ a: 'x,y' }]).split('\r\n')[1], '"x,y"');
});

/* ---------------- 同期 ---------------- */

group('同期マージ（サーバーから来た1件と手元の1件）', () => {
  const m = sync.mergeOne;

  check('手元に無ければ取り込む',
    m(undefined, { id: '1', name: 'サーバー', updatedAt: 100 }).name, 'サーバー');
  check('取り込んだものは送信済み扱い',
    m(undefined, { id: '1', name: 'X', updatedAt: 100 }).dirty, 0);

  check('サーバーのほうが新しければ採用',
    m({ id: '1', name: '手元', updatedAt: 100 }, { id: '1', name: 'サーバー', updatedAt: 200 }).name, 'サーバー');
  check('手元のほうが新しければ上書きしない',
    m({ id: '1', name: '手元', updatedAt: 300 }, { id: '1', name: 'サーバー', updatedAt: 200 }), null);
  check('手元の未送信の編集を守る',
    m({ id: '1', name: '編集中', updatedAt: 300, dirty: 1 }, { id: '1', name: 'サーバー', updatedAt: 200 }), null);

  check('OCR全文は空で上書きしない',
    m({ id: '1', rawText: '手元の全文', updatedAt: 1 }, { id: '1', rawText: '', updatedAt: 2 }).rawText, '手元の全文');
  check('サーバーの画像有無をそのまま採用',
    m({ id: '1', hasImage: true, updatedAt: 1 }, { id: '1', hasImage: false, updatedAt: 2 }).hasImage, false);
  check('端末の画像の実体は保持',
    m({ id: '1', localImage: 1, updatedAt: 1 }, { id: '1', hasImage: false, updatedAt: 2 }).localImage, 1);
  check('未送信の画像は送信待ちのまま',
    m({ id: '1', localImage: 1, imageSynced: 0, updatedAt: 1 }, { id: '1', hasImage: false, updatedAt: 2 }).imageSynced, 0);
  check('サーバーに画像があれば再送しない',
    m({ id: '1', localImage: 1, imageSynced: 0, updatedAt: 1 }, { id: '1', hasImage: true, updatedAt: 2 }).imageSynced, 1);
  check('月フィールドを日付から作り直す',
    m(undefined, { id: '1', date: '2026-03-09', updatedAt: 1 }).month, '2026-03');
});

group('同期で送るデータ', () => {
  const w = sync.toWire({
    id: 'x', staff: '高橋', date: '2026-01-05', time: '10:00', type: '駐車場',
    name: 'A', amount: '600', note: 'メモ', rawText: 'あ'.repeat(5000),
    hasImage: true, localImage: 1, deleted: 0, updatedAt: 123, dirty: 1, imageSynced: 0, month: '2026-01',
  });
  check('金額は数値化', w.amount, 600);
  check('担当者を含む', w.staff, '高橋');
  check('OCR全文は3000文字で打ち切る', w.rawText.length, 3000);
  check('ローカル専用の項目は送らない',
    ['dirty', 'imageSynced', 'month', 'localImage', 'hasImage'].filter(k => k in w), []);
  check('削除は0/1で送る', sync.toWire({ id: 'x', deleted: true }).deleted, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
