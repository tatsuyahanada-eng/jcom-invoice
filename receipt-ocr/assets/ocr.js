/* 文字認識エンジン
   2種類のエンジンを差し替えられるようにしている。

   1. local : Tesseract.js（無料・オフライン）
      元アプリの問題を修正:
        - 画像ごとに worker を作り直していた -> 1つを再利用（数倍高速）
        - tessedit_pageseg_mode を recognize() の第3引数で渡していた（v5では無視される）
          -> setParameters() で正しく設定
        - 認識が悪いときの回転・レイアウト再試行がなかった -> 追加
        - 金額用の2パス目を追加（下記）

      2パス構成にしている理由（実測にもとづく）:
        日本語モデルは数字を丸囲み数字に取り違えることが多く、
        「1,200円」が「⑫⑥⑥円」になって金額が 1266 になる例を確認した。
        丸囲み数字を禁止（blacklist）すると数字は正しく出るが、
        今度は「年・月・日」まわりが崩れて日付が取れなくなる。
        そこで
          パス1（通常）      -> 日付・時刻・種別・名称
          パス2（丸囲み禁止）-> 金額
        の2回読み、それぞれ得意な項目を採用する。

   2. ai : 画像をそのままAIに読ませる（高精度）
      感熱紙・かすれ・手書き混じりの領収書は Tesseract では限界があるため、
      精度を最優先する場合はこちらを使う。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};
  const U = App.util;

  // 日本語モデルが数字の代わりに出しがちな丸囲み数字
  const CIRCLED_DIGITS = '⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳❶❷❸❹❺❻❼❽❾❿';

  let mainWorker = null;      // jpn+eng（1つを使い回す）
  let mainLoading = null;

  function tesseractAvailable() { return !!global.Tesseract; }

  /** ライブラリの配置場所（index.html の APP_CDN で上書きできる） */
  function workerOptions(extra) {
    const cdn = global.APP_CDN || {};
    const opts = Object.assign({ logger: () => {} }, extra || {});
    if (cdn.tesseractWorker) opts.workerPath = cdn.tesseractWorker;
    if (cdn.tesseractCore) opts.corePath = cdn.tesseractCore;
    if (cdn.tesseractLang) opts.langPath = cdn.tesseractLang;
    return opts;
  }

  async function getMainWorker(onStatus) {
    if (mainWorker) return mainWorker;
    if (mainLoading) return mainLoading;
    mainLoading = (async () => {
      if (!tesseractAvailable()) throw new Error('OCRライブラリ(Tesseract.js)を読み込めませんでした。通信環境をご確認ください。');
      if (onStatus) onStatus('日本語の認識データを準備しています（初回のみ時間がかかります）…');
      const w = await global.Tesseract.createWorker('jpn+eng', 1, workerOptions({
        errorHandler: (e) => console.error('[tesseract]', e),
      }));
      await w.setParameters({
        tessedit_pageseg_mode: '6',        // 一様なテキストブロックとして扱う
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      mainWorker = w;
      return w;
    })();
    try { return await mainLoading; } finally { mainLoading = null; }
  }

  async function terminate() {
    try { if (mainWorker) await mainWorker.terminate(); } catch (e) { /* noop */ }
    mainWorker = null;
  }

  /** 平均信頼度（Tesseractの単語ごとconfidenceの平均） */
  function meanConfidence(data) {
    const words = (data && data.words) || [];
    const usable = words.filter(w => (w.text || '').trim().length > 0);
    if (!usable.length) return data && typeof data.confidence === 'number' ? data.confidence : 0;
    return usable.reduce((s, w) => s + (w.confidence || 0), 0) / usable.length;
  }

  /** dataURL を指定角度だけ回転した dataURL を返す */
  async function rotated(dataUrl, deg) {
    const img = await U.loadImage(dataUrl);
    const c = App.image.rotateCanvas(App.image.fitCanvas(img, 0, 4000), deg);
    return c.toDataURL('image/png');
  }

  /**
   * 端末内OCR。
   * @param {string} ocrDataUrl 前処理済み（二値化済み）の画像
   * @param {{retryRotate?:boolean, digitPass?:boolean, onStatus?:Function}} opts
   */
  async function recognizeLocal(ocrDataUrl, opts) {
    const o = opts || {};
    const worker = await getMainWorker(o.onStatus);

    let best = null;
    const run = async (image, psm, label) => {
      if (psm) await worker.setParameters({ tessedit_pageseg_mode: psm });
      const res = await worker.recognize(image);
      const conf = meanConfidence(res.data);
      const textLen = (res.data.text || '').replace(/\s/g, '').length;
      // 短すぎる結果は信頼度が高くても採用しない
      const score = conf * Math.min(1, textLen / 40);
      if (!best || score > best.score) best = { text: res.data.text || '', conf, score, label };
      return { conf, score };
    };

    await run(ocrDataUrl, '6', 'psm6');

    // レイアウト違いを試す（レシートは1カラムなので PSM 4 が効くことがある）
    if (best.conf < 72) await run(ocrDataUrl, '4', 'psm4');

    // それでも低いときは、写真の向きが違う可能性を疑う
    if (o.retryRotate !== false && best.conf < 55) {
      for (const deg of [180, 90, 270]) {
        if (o.onStatus) o.onStatus(`向きを${deg}°回して再認識しています…`);
        try {
          const img = await rotated(ocrDataUrl, deg);
          const r = await run(img, '6', 'rot' + deg);
          if (r.conf >= 70) break;
        } catch (e) { /* noop */ }
      }
    }
    await worker.setParameters({ tessedit_pageseg_mode: '6' });

    // 金額用のパス: 丸囲み数字を禁止して読み直す
    let numericText = null;
    if (o.digitPass) {
      try {
        if (o.onStatus) o.onStatus('金額を再確認しています…');
        await worker.setParameters({ tessedit_char_blacklist: CIRCLED_DIGITS });
        const res = await worker.recognize(ocrDataUrl);
        numericText = res.data.text || '';
      } catch (e) {
        numericText = null;
      } finally {
        await worker.setParameters({ tessedit_char_blacklist: '' });
      }
    }

    return { text: best.text, confidence: best.conf, mode: best.label, numericText };
  }

  /* ---------- AI 解析 ---------- */

  const AI_PROMPT = [
    'あなたは日本の交通費精算の担当者です。添付された領収書の画像を読み取り、JSONだけを出力してください。',
    '',
    '抽出する項目:',
    '- date: 利用日を YYYY-MM-DD 形式で。駐車場の場合は出庫日。読み取れなければ空文字。',
    '- time: 利用時刻を HH:MM 形式で。駐車場の場合は出庫時刻。読み取れなければ空文字。',
    '- type: 「駐車場」「高速」「ガソリン」「タクシー」「電車・バス」「その他」のいずれか。',
    '- name: 駐車場名・事業者名。高速道路の場合は「入口IC → 出口IC」の形式の経路。',
    '- amount: 実際に支払った合計金額（税込）の数値のみ。カンマや円記号は付けない。',
    '  「お預り」「お釣り」「消費税」「ポイント」の金額は絶対に選ばないこと。',
    '- note: 補足（不鮮明で自信がない項目があればここに日本語で記載）。',
    '- confidence: 全体の読み取り自信度を 0〜1 の数値で。',
    '',
    '1枚の画像に複数の領収書が写っている場合は、items 配列に領収書ごとの要素を入れてください。',
    '出力形式（この形以外は出力しない。前置き・コードフェンスも不要）:',
    '{"items":[{"date":"","time":"","type":"","name":"","amount":0,"note":"","confidence":0}]}',
  ].join('\n');

  /**
   * AIによる読み取り。
   * @param {string} aiDataUrl カラーのJPEG dataURL
   * @param {{mode:'proxy'|'direct', apiKey?:string, model?:string, proxyUrl?:string}} cfg
   */
  async function recognizeAi(aiDataUrl, cfg) {
    const parts = U.splitDataUrl(aiDataUrl);
    if (!parts) throw new Error('画像を送信用に変換できませんでした');
    const model = cfg.model || 'claude-sonnet-5';

    const payload = {
      model,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: parts.mediaType, data: parts.base64 } },
          { type: 'text', text: AI_PROMPT },
        ],
      }],
    };

    let res;
    if (cfg.mode === 'direct') {
      if (!cfg.apiKey) throw new Error('APIキーが設定されていません');
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(payload),
      });
    } else {
      res = await fetch(cfg.proxyUrl || 'api/ai-proxy.php', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`AI解析に失敗しました (HTTP ${res.status}) ${detail.slice(0, 200)}`);
    }
    const json = await res.json();
    const text = (json.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return { items: parseAiJson(text), raw: text };
  }

  /** AIの応答からJSONを取り出す（コードフェンスが付いても耐える） */
  function parseAiJson(text) {
    let s = String(text || '').trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('AIの応答を解釈できませんでした');
    const obj = JSON.parse(s.slice(start, end + 1));
    const items = Array.isArray(obj.items) ? obj.items : [obj];
    return items.map(it => ({
      date: typeof it.date === 'string' ? it.date.trim() : '',
      time: typeof it.time === 'string' ? it.time.trim() : '',
      type: App.parse.TYPES.includes(it.type) ? it.type : 'その他',
      name: typeof it.name === 'string' ? it.name.trim() : '',
      amount: Number(it.amount) > 0 ? Math.round(Number(it.amount)) : '',
      note: typeof it.note === 'string' ? it.note.trim() : '',
      confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0.8)),
    }));
  }

  App.ocr = {
    recognizeLocal, recognizeAi, terminate, parseAiJson,
    tesseractAvailable, AI_PROMPT, CIRCLED_DIGITS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.ocr;
})(typeof window !== 'undefined' ? window : globalThis);
