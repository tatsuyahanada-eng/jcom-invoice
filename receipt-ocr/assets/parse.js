/* 日本語レシートのテキスト解析
   OCRの生テキストから 日付 / 時刻 / 種別 / 名称・経路 / 金額 を推定する。
   元アプリは「最初に見つかった金額」を採用していたため、
   「お預り」「お釣り」を拾ってしまうことがあった。ここではキーワードの重み付けで
   合計金額を選び、あわせて項目ごとの信頼度を返す（低い項目は画面上で強調する）。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};

  const TYPES = ['駐車場', '高速', 'ガソリン', 'タクシー', '電車・バス', 'その他'];

  /* ---------- 正規化 ---------- */

  // 半角カナ→全角カナ（レシートは半角カナ印字が多い）
  const KANA_MAP = {
    'ｱ':'ア','ｲ':'イ','ｳ':'ウ','ｴ':'エ','ｵ':'オ','ｶ':'カ','ｷ':'キ','ｸ':'ク','ｹ':'ケ','ｺ':'コ',
    'ｻ':'サ','ｼ':'シ','ｽ':'ス','ｾ':'セ','ｿ':'ソ','ﾀ':'タ','ﾁ':'チ','ﾂ':'ツ','ﾃ':'テ','ﾄ':'ト',
    'ﾅ':'ナ','ﾆ':'ニ','ﾇ':'ヌ','ﾈ':'ネ','ﾉ':'ノ','ﾊ':'ハ','ﾋ':'ヒ','ﾌ':'フ','ﾍ':'ヘ','ﾎ':'ホ',
    'ﾏ':'マ','ﾐ':'ミ','ﾑ':'ム','ﾒ':'メ','ﾓ':'モ','ﾔ':'ヤ','ﾕ':'ユ','ﾖ':'ヨ',
    'ﾗ':'ラ','ﾘ':'リ','ﾙ':'ル','ﾚ':'レ','ﾛ':'ロ','ﾜ':'ワ','ｦ':'ヲ','ﾝ':'ン',
    'ｧ':'ァ','ｨ':'ィ','ｩ':'ゥ','ｪ':'ェ','ｫ':'ォ','ｬ':'ャ','ｭ':'ュ','ｮ':'ョ','ｯ':'ッ',
    'ｰ':'ー','｡':'。','､':'、','｢':'「','｣':'」','･':'・'
  };
  const KANA_DAKU = { 'ｶ':'ガ','ｷ':'ギ','ｸ':'グ','ｹ':'ゲ','ｺ':'ゴ','ｻ':'ザ','ｼ':'ジ','ｽ':'ズ','ｾ':'ゼ','ｿ':'ゾ',
    'ﾀ':'ダ','ﾁ':'ヂ','ﾂ':'ヅ','ﾃ':'デ','ﾄ':'ド','ﾊ':'バ','ﾋ':'ビ','ﾌ':'ブ','ﾍ':'ベ','ﾎ':'ボ','ｳ':'ヴ' };
  const KANA_HANDAKU = { 'ﾊ':'パ','ﾋ':'ピ','ﾌ':'プ','ﾍ':'ペ','ﾎ':'ポ' };

  function kanaToFull(text) {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i], nx = text[i + 1];
      if (nx === 'ﾞ' && KANA_DAKU[c]) { out += KANA_DAKU[c]; i++; continue; }
      if (nx === 'ﾟ' && KANA_HANDAKU[c]) { out += KANA_HANDAKU[c]; i++; continue; }
      out += (KANA_MAP[c] !== undefined ? KANA_MAP[c] : c);
    }
    return out;
  }

  /** 全角→半角・半角カナ→全角カナ・記号ゆれの吸収。
   *  重要: 長音記号「ー」(U+30FC) はハイフンに変換しないこと。
   *  変換すると「リパーク」「パーキング」等が壊れ、種別判定と店名照合に失敗する。 */
  function normalize(text) {
    return kanaToFull(String(text || ''))
      .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .replace(/[￥＼]/g, '¥')
      .replace(/[，、]/g, ',')
      .replace(/[〇◯○]/g, '0')
      // Tesseractの日本語認識は数字を丸囲み数字に取り違えることが多い（例: 2025 -> ②⓪②⑤）
      .replace(/⓪/g, '0')
      .replace(/[①-⑳]/g, c => String(c.charCodeAt(0) - 0x245F))
      .replace(/[❶-❿]/g, c => String(c.charCodeAt(0) - 0x2775))
      .replace(/[―−–—]/g, '-')
      .replace(/･/g, '・')
      .replace(/(\d)\s*,\s*(\d{3})\b/g, '$1,$2')   // "1, 200" -> "1,200"
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n?/g, '\n');
  }

  /** 数字として読むべきトークン内の誤認識文字を直す（O->0, l->1 など） */
  const DIGIT_FIX = { O: '0', o: '0', D: '0', Q: '0', l: '1', I: '1', i: '1', '|': '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', g: '9', b: '6' };
  function fixNumeric(token) {
    const digits = (token.match(/\d/g) || []).length;
    const letters = (token.match(/[A-Za-z|]/g) || []).length;
    if (digits < 1 || letters === 0 || letters > digits) return token;
    return token.replace(/[A-Za-z|]/g, c => (DIGIT_FIX[c] !== undefined ? DIGIT_FIX[c] : c));
  }

  /** 数字混じりトークンを補正した行を返す */
  function repairDigits(line) {
    return line.replace(/[0-9A-Za-z|,]{2,}/g, fixNumeric);
  }

  /* ---------- 種別判定 ---------- */

  const TYPE_RULES = [
    { type: 'ガソリン', re: /給油|ガソリン|軽油|レギュラー|ハイオク|ENEOS|エネオス|出光|apollostation|コスモ石油|SHELL|シェル|キグナス|JA-?SS|燃料|リットル|L単価/i, w: 3 },
    { type: '高速', re: /高速道路|通行料|料金所|ETC|NEXCO|ネクスコ|首都高|阪神高速|名古屋高速|広島高速|福岡北九州|本四|ハイウェイ|HIGHWAY|インターチェンジ|出口\s*料金|コウソク|ツウコウリョウ/i, w: 3 },
    { type: '駐車場', re: /駐車|パーキング|PARKING|タイムズ|TIMES|リパーク|コインパーク|NPC|パラカ|入庫|出庫|満車|時間料金|最大料金|チュウシャ|ニュウコ|シュッコ/i, w: 3 },
    { type: 'タクシー', re: /タクシー|TAXI|個人タクシー|乗車|降車|迎車|実車|運転者|MK|日本交通|第一交通/i, w: 2 },
    { type: '電車・バス', re: /鉄道|JR|地下鉄|バス|乗車券|特急券|運賃|Suica|PASMO|ICOCA|入場|きっぷ|新幹線/i, w: 2 },
  ];

  function detectType(text) {
    let best = { type: 'その他', score: 0 };
    for (const rule of TYPE_RULES) {
      const hits = (text.match(new RegExp(rule.re.source, rule.re.flags.replace('g', '') + 'g')) || []).length;
      if (!hits) continue;
      const score = hits * rule.w;
      if (score > best.score) best = { type: rule.type, score };
    }
    // 「高速」と「駐車場」が両方出る場合（SAの駐車券など）はキーワード数で決着済み
    return { type: best.type, confidence: best.score >= 3 ? 0.9 : best.score > 0 ? 0.6 : 0.2 };
  }

  /* ---------- 金額 ---------- */

  // レシートは半角カナ印字も多い（正規化で全角カナになる）。カナ表記も同じ重みで拾う。
  const POSITIVE = [
    { re: /合\s*計|ご?請求金額|ご?請求額|お?支払(い)?金額|お?支払額|総額|領収金額|決済金額|ゴウケイ|オシハライ|ゴセイキュウ/, w: 100 },
    { re: /駐車料金|駐車場料金|通行料金|通行料|利用料金|ご利用金額|ご利用料金|ご精算金額|精算金額|運賃|お買上|チュウシャリョウキン|チュウシャリョウ|ツウコウリョウ|リヨウリョウキン|セイサンキンガク|ウンチン/, w: 80 },
    { re: /税込|内税込|ゼイコミ/, w: 45 },
    { re: /領収書|領収証|金額|リョウシュウ|キンガク/, w: 35 },
    { re: /現金|クレジット|カード|電子マネー|ゲンキン/, w: 12 },
  ];
  const STRONG_NEG = /お?預\s*(り|かり)|お?釣|釣銭|つり|お返し|ポイント|残高|前回|カード番号|電話|TEL|会員番号|登録番号|伝票|レジ|取引番号|管理番号|オアズカリ|アズカリ|オツリ|ツリセン|ポイント|ザンダカ|デンピョウ/i;
  const WEAK_NEG = /消費税|内税|外税|税額|税抜|対象額|割引|値引|クーポン|回数券|枚数|単価|ショウヒゼイ|ウチゼイ|ワリビキ|タンカ/;
  // 数値の直後がこれらの単位なら金額ではない
  const NON_MONEY_UNIT = /^[ ]?(分|時間|時|台|枚|人|個|回|番|号|%|km|L|l|ﾘｯﾄﾙ|リットル|日|ヶ月|階|F)/i;

  /** 日付・時刻・電話番号を空白でマスクして、金額の誤検出を防ぐ */
  function maskNonMoney(line) {
    const blank = m => ' '.repeat(m.length);
    return line
      .replace(/(令和|平成|R|H)\s*(元|\d{1,2})\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日?/g, blank)
      .replace(/\d{4}\s*[-\/年.]\s*\d{1,2}\s*[-\/月.]\s*\d{1,2}\s*日?/g, blank)
      .replace(/\d{1,2}\s*[-\/月]\s*\d{1,2}\s*日/g, blank)
      .replace(/\d{1,2}\s*[:時]\s*\d{2}(\s*[:分]\s*\d{2})?/g, blank)
      .replace(/(TEL|Tel|電話|FAX)[^0-9]{0,4}[\d\-()]{7,}/g, blank)
      .replace(/\d{2,4}-\d{2,4}-\d{3,4}/g, blank)
      .replace(/〒\s*\d{3}-?\d{4}/g, blank)
      .replace(/No\.?\s*\d+/gi, blank);
  }

  function moneyTokens(line) {
    const masked = maskNonMoney(line);
    const out = [];
    const re = /(¥|\\)?\s?(\d{1,3}(?:,\d{3})+|\d{1,7})\s?(円|-)?/g;
    let m;
    while ((m = re.exec(masked)) !== null) {
      const raw = m[2];
      const after = masked.slice(m.index + m[0].length);
      if (NON_MONEY_UNIT.test(after)) continue;
      const value = Number(raw.replace(/,/g, ''));
      if (!isFinite(value) || value <= 0) continue;
      // 桁区切りなしの4桁以上で通貨記号もない数字は、番号の可能性が高い
      const marked = !!(m[1] || m[3] === '円');
      const comma = raw.indexOf(',') >= 0;
      out.push({ value, marked, comma, bare: !marked && !comma });
    }
    return out;
  }

  /**
   * 合計金額を推定する。
   * @returns {{amount:number, confidence:number, candidates:Array}}
   */
  function extractAmount(lines, type) {
    const cands = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prev = i > 0 ? lines[i - 1] : '';
      let keyword = 0;
      for (const p of POSITIVE) if (p.re.test(line)) keyword = Math.max(keyword, p.w);
      // ラベルが上の行にあり、この行が数字だけ、というレイアウトに対応
      if (keyword === 0 && /^[\s¥\\]*[\d,]+\s*円?[\s]*$/.test(line)) {
        for (const p of POSITIVE) if (p.re.test(prev)) keyword = Math.max(keyword, p.w * 0.75);
      }
      const strongNeg = STRONG_NEG.test(line);
      const weakNeg = WEAK_NEG.test(line);

      for (const t of moneyTokens(line)) {
        let score = keyword;
        if (t.marked) score += 18;
        if (t.comma) score += 8;
        if (t.bare && t.value >= 1000) score -= 25;   // 伝票番号などの裸の数字
        if (strongNeg) score -= 130;
        if (weakNeg) score -= 45;
        score += (i / Math.max(1, lines.length - 1)) * 12;   // 合計は下のほうに出やすい
        if (t.value < 50) score -= 30;
        if (t.value > 100000) score -= 35;
        if ((type === '駐車場' || type === '高速') && t.value % 10 !== 0) score -= 10;
        cands.push({ value: t.value, score, line: i });
      }
    }
    if (!cands.length) return { amount: '', confidence: 0, candidates: [] };

    cands.sort((a, b) => (b.score - a.score) || (b.value - a.value));
    const top = cands[0];
    // 同点に近い候補が別の値なら信頼度を下げる
    const rival = cands.find(c => c.value !== top.value && top.score - c.score < 12);
    let confidence =
      top.score >= 100 ? 0.95 :
      top.score >= 75 ? 0.8 :
      top.score >= 45 ? 0.6 :
      top.score >= 20 ? 0.4 : 0.25;
    if (rival) confidence = Math.min(confidence, 0.5);
    return { amount: top.value, confidence, candidates: cands.slice(0, 5) };
  }

  /* ---------- 日付 ---------- */

  const DATE_CONTEXT = /出庫|出場|退場|精算|ご?利用日|利用日時|発行日|領収日|日時|年月日|お買上げ日/;

  function pad2(n) { return String(n).padStart(2, '0'); }
  function validDate(y, m, d) {
    if (!(y >= 2000 && y <= 2100)) return null;
    if (!(m >= 1 && m <= 12)) return null;
    if (!(d >= 1 && d <= 31)) return null;
    const dt = new Date(y, m - 1, d);
    if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    return `${y}-${pad2(m)}-${pad2(d)}`;
  }

  /**
   * @param {string} text 正規化済みテキスト
   * @param {{fallbackDate?:string}} ctx
   */
  function extractDate(text, ctx) {
    const found = [];
    const push = (value, index, base) => {
      if (!value) return;
      const around = text.slice(Math.max(0, index - 24), index + 24);
      found.push({ value, score: base + (DATE_CONTEXT.test(around) ? 30 : 0), index });
    };
    let m;

    // 令和 / 平成
    const eraRe = /(令和|平成|R|H)\s*(元|\d{1,2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
    while ((m = eraRe.exec(text)) !== null) {
      const base = (m[1] === '令和' || m[1] === 'R') ? 2018 : 1988;
      const yy = m[2] === '元' ? 1 : Number(m[2]);
      push(validDate(base + yy, Number(m[3]), Number(m[4])), m.index, 90);
    }
    // 西暦4桁
    const y4 = /(20\d{2})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})\s*日?/g;
    while ((m = y4.exec(text)) !== null) push(validDate(+m[1], +m[2], +m[3]), m.index, 100);
    // 西暦2桁 (25/01/05)
    const y2 = /(?:^|[^\d])(\d{2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?![\d])/g;
    while ((m = y2.exec(text)) !== null) push(validDate(2000 + +m[1], +m[2], +m[3]), m.index, 70);
    // 月日のみ（年は文脈 or 撮影日から補う）
    const fallbackYear = Number((ctx && ctx.fallbackDate || '').slice(0, 4)) || new Date().getFullYear();
    const md = /(?:^|[^\d\/\-.])(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*日?(?![\d\/\-.])/g;
    while ((m = md.exec(text)) !== null) {
      const hasKanji = /月/.test(m[0]);
      push(validDate(fallbackYear, +m[1], +m[2]), m.index, hasKanji ? 55 : 30);
    }

    if (!found.length) {
      return { date: (ctx && ctx.fallbackDate) || '', confidence: (ctx && ctx.fallbackDate) ? 0.3 : 0 };
    }
    found.sort((a, b) => (b.score - a.score) || (b.index - a.index));
    const best = found[0];
    const conflict = found.some(f => f.value !== best.value && best.score - f.score < 15);
    let confidence = best.score >= 100 ? 0.95 : best.score >= 70 ? 0.8 : best.score >= 50 ? 0.6 : 0.4;
    if (conflict) confidence = Math.min(confidence, 0.55);
    return { date: best.value, confidence };
  }

  /* ---------- 時刻 ---------- */

  const TIME_CONTEXT = /出庫|出場|退場|精算|発行|領収|降車|利用/;

  function extractTime(text) {
    const re = /(\d{1,2})\s*[:時]\s*(\d{2})/g;
    const found = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const hh = +m[1], mm = +m[2];
      if (hh > 23 || mm > 59) continue;
      const before = text.slice(Math.max(0, m.index - 20), m.index);
      found.push({ value: `${pad2(hh)}:${pad2(mm)}`, score: TIME_CONTEXT.test(before) ? 50 : 10, index: m.index });
    }
    if (!found.length) return { time: '', confidence: 0 };
    found.sort((a, b) => (b.score - a.score) || (b.index - a.index));   // 同点なら後ろ（＝出庫時刻）
    return { time: found[0].value, confidence: found[0].score >= 50 ? 0.85 : 0.5 };
  }

  /* ---------- 名称・経路 ---------- */

  const OPERATORS = [
    'タイムズ', 'TIMES', '三井のリパーク', 'リパーク', 'NPC24H', 'NPC', 'パラカ', 'Paraca',
    '名鉄協商', 'コインパーク', 'ザ・パーク', 'THE PARK', '楽天パーク', 'スペースエコ',
    '日本駐車場開発', 'アップルパーク', 'エコロパーク', 'システムパーク', 'akippa',
    'NEXCO東日本', 'NEXCO中日本', 'NEXCO西日本', 'NEXCO', '首都高速', '阪神高速',
    '名古屋高速', '広島高速', '本四高速', '福岡北九州高速',
    'ENEOS', '出光', 'apollostation', 'コスモ石油', 'キグナス', 'SHELL',
  ];

  /** 高速料金の経路（○○IC → △△IC）を作る。
   *  「入口 名古屋IC」のようにラベルが名前の前に来るため、
   *  単に "IC" の直前を拾うと「…年02月11日 入口」の日付部分を拾ってしまう。
   *  そのためラベル基準の抽出を先に試し、日付・数字を含む候補は捨てる。 */
  const IC_NAME = '[一-龥ぁ-んァ-ヶA-Za-z・ー]{1,12}';
  const IC_SUFFIX = /(?:IC|ＩＣ|インターチェンジ|インター|料金所|本線)$/;

  function cleanIcName(v) {
    const s = String(v || '').replace(/^[の・\-\s:：]+|[の・\-\s:：]+$/g, '').replace(IC_SUFFIX, '');
    if (!s) return '';
    if (/[\d年月日時分円]/.test(s)) return '';     // 日付・金額を経路名にしない
    return s;
  }

  function extractRoute(text) {
    const grab = (re) => {
      const m = re.exec(text);
      return m ? cleanIcName(m[1]) : '';
    };
    const entry = grab(new RegExp('(?:入口|入り口|入場|IN)\\s*[:：]?\\s*(' + IC_NAME + ')'));
    const exit = grab(new RegExp('(?:出口|出場|OUT)\\s*[:：]?\\s*(' + IC_NAME + ')'));
    if (entry && exit) return { name: `${entry} → ${exit}`, confidence: 0.85 };

    // ラベルが読めなかった場合は「○○IC」を順に拾う
    const names = [];
    const re = new RegExp('(' + IC_NAME + ')\\s*(?:IC|インターチェンジ|インター|料金所)', 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = cleanIcName(m[1]);
      if (n && !names.includes(n)) names.push(n);
    }
    if (entry && names.length) {
      const other = names.find(n => n !== entry);
      if (other) return { name: `${entry} → ${other}`, confidence: 0.7 };
    }
    if (exit && names.length) {
      const other = names.find(n => n !== exit);
      if (other) return { name: `${other} → ${exit}`, confidence: 0.7 };
    }
    if (names.length >= 2) return { name: `${names[0]} → ${names[1]}`, confidence: 0.75 };
    if (exit) return { name: `${exit} 出口`, confidence: 0.6 };
    if (entry) return { name: `${entry} 入口`, confidence: 0.6 };
    if (names.length === 1) return { name: `${names[0]} 料金所`, confidence: 0.5 };
    return null;
  }

  function extractName(lines, text, type) {
    if (type === '高速') {
      const route = extractRoute(text);
      if (route) return route;
    }
    // 事業者名の辞書一致
    for (const op of OPERATORS) {
      const idx = text.indexOf(op);
      if (idx < 0) continue;
      const line = (text.slice(idx).split('\n')[0] || op).trim();
      return { name: cleanName(line) || op, confidence: 0.85 };
    }
    // 「〜駐車場」「〜パーキング」を含む行
    const named = lines.find(l => /駐車場|パーキング|PARKING/i.test(l) && l.replace(/[^一-龥ぁ-んァ-ヶA-Za-z]/g, '').length >= 2);
    if (named) return { name: cleanName(named), confidence: 0.65 };
    // 先頭付近の「名前らしい」行
    for (const l of lines.slice(0, 6)) {
      const s = cleanName(l);
      const letters = (s.match(/[一-龥ぁ-んァ-ヶA-Za-z]/g) || []).length;
      if (letters >= 3 && s.length <= 30 && !/領収|受取|様|合計|金額|円|TEL|〒/.test(s)) {
        return { name: s, confidence: 0.35 };
      }
    }
    return { name: '', confidence: 0 };
  }

  function cleanName(s) {
    return String(s || '')
      .replace(/(入庫|出庫|精算|領収|駐車料金|利用料金|合計|金額|TEL|電話).*$/, '')
      .replace(/[¥\\]\s*[\d,]+|[\d,]{2,}\s*円/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 40);
  }

  /* ---------- 本体 ---------- */

  /**
   * OCRテキストから明細フィールドを推定する。
   * @param {string} rawText
   * @param {{fallbackDate?:string, fileName?:string}} ctx
   */
  function receipt(rawText, ctx) {
    const context = ctx || {};
    const text = normalize(rawText);
    const lines = text.split('\n').map(l => repairDigits(l.trim())).filter(l => l.length > 0);
    const joined = lines.join('\n');

    const t = detectType(joined);
    const d = extractDate(joined, context);
    const tm = extractTime(joined);
    const a = extractAmount(lines, t.type);
    const n = extractName(lines, joined, t.type);

    return {
      date: d.date,
      time: tm.time,
      type: t.type,
      name: n.name,
      amount: a.amount === '' ? '' : a.amount,
      confidence: {
        date: round2(d.confidence),
        time: round2(tm.confidence),
        type: round2(t.confidence),
        name: round2(n.confidence),
        amount: round2(a.confidence),
      },
      candidates: a.candidates.map(c => c.value),
      text: joined,
    };
  }

  /**
   * 2つのOCRパスの解析結果を突き合わせて金額を決める。
   *
   * main    : 通常パス（日付は得意だが、数字を丸囲み数字に誤読しやすい）
   * numeric : 丸囲み数字を禁止したパス（数字は正確だが日本語が崩れる）
   *
   * 食い違ったときは numeric を採用しつつ信頼度を下げ、画面上で「要確認」に出す。
   * @returns {{amount:number|string, confidence:number, agreed:boolean}}
   */
  function reconcileAmount(main, numeric) {
    const a = main && main.amount !== '' && main.amount != null ? Number(main.amount) : null;
    const b = numeric && numeric.amount !== '' && numeric.amount != null ? Number(numeric.amount) : null;
    const confA = main && main.confidence ? Number(main.confidence.amount) || 0 : 0;
    const confB = numeric && numeric.confidence ? Number(numeric.confidence.amount) || 0 : 0;

    if (a === null && b === null) return { amount: '', confidence: 0, agreed: false };
    if (b === null) return { amount: a, confidence: confA, agreed: false };
    if (a === null) return { amount: b, confidence: Math.min(0.6, confB), agreed: false };
    if (a === b) return { amount: a, confidence: Math.min(1, Math.max(confA, confB) + 0.05), agreed: true };
    return { amount: b, confidence: Math.min(0.55, Math.max(0.3, confB - 0.2)), agreed: false };
  }

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  App.parse = {
    receipt, normalize, repairDigits, detectType, extractAmount,
    extractDate, extractTime, extractName, extractRoute, reconcileAmount, TYPES
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.parse;
})(typeof window !== 'undefined' ? window : globalThis);
