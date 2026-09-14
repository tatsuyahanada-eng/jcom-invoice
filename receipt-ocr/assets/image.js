/* 画像前処理
   レシートOCRの精度は「Tesseractに渡す前の画像」でほぼ決まる。
   ここでは次の順で処理する:
     1. EXIF回転を反映して読み込み（横向き写真対策）
     2. 適切なサイズへ拡大／縮小（文字高が小さすぎても大きすぎても精度が落ちる）
     3. グレースケール化 → 軽いシャープ
     4. 傾き補正（射影プロファイル法）
     5. Sauvola法による局所二値化（影・照明ムラに強い。全体コントラスト調整より大幅に有利）
   複数レシートが1枚に写っている場合は、局所分散から領収書領域を検出して切り出す。 */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};
  const U = App.util;

  const OCR_MIN_EDGE = 1400;   // OCR画像の長辺の下限（小さすぎる文字を拡大）
  const OCR_MAX_EDGE = 2200;   // 同上限（大きすぎるとメモリと時間を浪費）
  const AI_MAX_EDGE = 1568;    // AI解析へ送る画像の長辺
  const THUMB_EDGE = 200;      // 一覧に表示するサムネイル

  /* ---------- canvas ヘルパ ---------- */

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /** 画像を指定サイズに描画した canvas を返す */
  function drawScaled(img, w, h) {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  /** 長辺が [min, max] に収まるよう拡大縮小した canvas */
  function fitCanvas(img, minEdge, maxEdge) {
    const w = img.width, h = img.height;
    const edge = Math.max(w, h);
    let scale = 1;
    if (edge > maxEdge) scale = maxEdge / edge;
    else if (minEdge && edge < minEdge) scale = Math.min(3, minEdge / edge);
    return drawScaled(img, w * scale, h * scale);
  }

  /* ---------- グレースケール ---------- */

  /** canvas -> { data: Uint8ClampedArray(w*h), w, h } */
  function toGray(canvas) {
    const w = canvas.width, h = canvas.height;
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) {
      g[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    }
    return { data: g, w, h };
  }

  function grayToCanvas(gray) {
    const c = makeCanvas(gray.w, gray.h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(gray.w, gray.h);
    for (let j = 0, i = 0; j < gray.data.length; j++, i += 4) {
      img.data[i] = img.data[i + 1] = img.data[i + 2] = gray.data[j];
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** 3x3 アンシャープマスク（かすれた感熱紙の文字を立たせる） */
  function sharpen(gray, amount) {
    const { data, w, h } = gray;
    const out = new Uint8ClampedArray(data.length);
    out.set(data);
    const a = amount == null ? 0.7 : amount;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const blur = (
          data[i - w - 1] + data[i - w] + data[i - w + 1] +
          data[i - 1] + data[i] + data[i + 1] +
          data[i + w - 1] + data[i + w] + data[i + w + 1]
        ) / 9;
        out[i] = data[i] + (data[i] - blur) * a;
      }
    }
    return { data: out, w, h };
  }

  /* ---------- 二値化 ---------- */

  /** 大津の判別分析法によるしきい値 */
  function otsu(values) {
    const hist = new Float64Array(256);
    for (let i = 0; i < values.length; i++) hist[values[i] | 0]++;
    const total = values.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  /** Sauvola法による局所二値化（影やグラデーションのある写真に強い） */
  function sauvola(gray, k, windowSize) {
    const { data, w, h } = gray;
    const K = k == null ? 0.25 : k;
    const R = 128;
    let win = windowSize || Math.round(Math.min(w, h) / 22);
    win = Math.max(15, Math.min(81, win));
    if (win % 2 === 0) win++;
    const rad = (win - 1) / 2;

    // 積分画像（和・二乗和）
    const W1 = w + 1;
    const sum = new Float64Array(W1 * (h + 1));
    const sqs = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let rs = 0, rq = 0;
      for (let x = 0; x < w; x++) {
        const v = data[y * w + x];
        rs += v; rq += v * v;
        sum[(y + 1) * W1 + (x + 1)] = sum[y * W1 + (x + 1)] + rs;
        sqs[(y + 1) * W1 + (x + 1)] = sqs[y * W1 + (x + 1)] + rq;
      }
    }
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - rad), y1 = Math.min(h - 1, y + rad);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - rad), x1 = Math.min(w - 1, x + rad);
        const area = (y1 - y0 + 1) * (x1 - x0 + 1);
        const a = y1 + 1, b = y0, c = x1 + 1, d = x0;
        const s = sum[a * W1 + c] - sum[b * W1 + c] - sum[a * W1 + d] + sum[b * W1 + d];
        const q = sqs[a * W1 + c] - sqs[b * W1 + c] - sqs[a * W1 + d] + sqs[b * W1 + d];
        const mean = s / area;
        const variance = Math.max(0, q / area - mean * mean);
        const thr = mean * (1 + K * (Math.sqrt(variance) / R - 1));
        out[y * w + x] = data[y * w + x] > thr ? 255 : 0;
      }
    }
    return { data: out, w, h };
  }

  /* ---------- 傾き補正 ---------- */

  /**
   * 射影プロファイル法で傾き角（度）を推定する。
   *
   * 実装上の注意（ここを外すと推定が効かない）:
   *  - 二値化「後」の canvas を渡すこと。グレースケールのまま渡すと、暗い机などの
   *    背景が「インク」と判定されて文字の信号がかき消される。
   *  - 縮小は canvas の平滑化縮小を使う。最近傍で間引くと細い文字がほぼ消え、
   *    レシートの外枠の直線だけが残って誤った角度に張り付く。
   *  - 外周は枠線が乗るので少し内側だけを見る。
   *
   * @param {HTMLCanvasElement} binCanvas 二値化済み canvas
   * @returns {number} 角度（度）。正なら「右下がり」を戻す向き。
   */
  function estimateSkew(binCanvas, opts) {
    const o = opts || {};
    const maxDeg = o.maxDeg || 7;
    const stepDeg = o.stepDeg || 0.25;
    const targetW = 600;

    const scale = Math.min(1, targetW / binCanvas.width);
    const sw = Math.max(60, Math.round(binCanvas.width * scale));
    const sh = Math.max(60, Math.round(binCanvas.height * scale));
    const small = drawScaled(binCanvas, sw, sh);      // 平滑化しながら縮小

    // 外周6%（レシートの枠線・影）を除いた内側だけを使う
    const mx = Math.round(sw * 0.06), my = Math.round(sh * 0.06);
    const w = sw - mx * 2, h = sh - my * 2;
    if (w < 40 || h < 40) return 0;
    const px = small.getContext('2d', { willReadFrequently: true }).getImageData(mx, my, w, h).data;

    const gray = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; j < gray.length; i += 4, j++) {
      gray[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    }
    const thr = otsu(gray);
    const ink = new Uint8Array(w * h);
    let inkCount = 0;
    for (let i = 0; i < gray.length; i++) {
      ink[i] = gray[i] < thr ? 1 : 0;
      inkCount += ink[i];
    }
    // 文字がほとんど無い / 真っ黒 のときは補正しない
    const ratio = inkCount / ink.length;
    if (ratio < 0.005 || ratio > 0.5) return 0;

    // 画素を取りこぼすと大きい角度が不利になるため、行バッファを上下に広げる
    const cx = w / 2;
    const pad = Math.ceil(cx * Math.tan(maxDeg * Math.PI / 180)) + 2;
    const rowsLen = h + pad * 2;

    // インク画素だけを列挙しておく（角度ごとの走査を軽くする）
    const xs = new Int16Array(inkCount), ys = new Int16Array(inkCount);
    let n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (ink[y * w + x]) { xs[n] = x; ys[n] = y; n++; }
      }
    }

    let bestAngle = 0, bestScore = -1;
    const scores = [];
    for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += stepDeg) {
      const t = Math.tan(deg * Math.PI / 180);
      const rows = new Float64Array(rowsLen);
      for (let i = 0; i < n; i++) rows[Math.round(ys[i] - (xs[i] - cx) * t) + pad]++;
      // 行ごとのインク量のばらつきが最大 = 文字行が水平に揃っている
      let score = 0;
      for (let y = 0; y < rowsLen; y++) score += rows[y] * rows[y];
      scores.push([+deg.toFixed(2), score]);
      if (score > bestScore) { bestScore = score; bestAngle = deg; }
    }
    if (o.debug) return { angle: bestAngle, scores, inkRatio: ratio };
    // 探索範囲の端に張り付いた場合は信用しない
    if (Math.abs(Math.abs(bestAngle) - maxDeg) < 1e-6) return 0;
    return bestAngle;
  }

  /** canvas を指定角度（度）だけ回転（背景は白で埋める） */
  function rotateCanvas(canvas, deg) {
    const rad = deg * Math.PI / 180;
    const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
    const w = canvas.width * cos + canvas.height * sin;
    const h = canvas.width * sin + canvas.height * cos;
    const out = makeCanvas(w, h);
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  /* ---------- 複数レシートの切り出し ---------- */

  /** 局所分散（＝文字のあるところ）をもとにレシート領域を検出して切り出す。
   *  1枚しか写っていない場合も、余白を除いて切り詰めることで精度が上がる。 */
  function detectRegions(img) {
    const base = fitCanvas(img, 0, 900);
    const gray = toGray(base);
    const { w, h } = gray;
    const step = 8;
    const gw = Math.ceil(w / step), gh = Math.ceil(h / step);
    const std = new Float64Array(gw * gh);

    for (let by = 0; by < gh; by++) {
      for (let bx = 0; bx < gw; bx++) {
        let s = 0, q = 0, n = 0;
        const yEnd = Math.min(h, by * step + step), xEnd = Math.min(w, bx * step + step);
        for (let y = by * step; y < yEnd; y++) {
          for (let x = bx * step; x < xEnd; x++) {
            const v = gray.data[y * w + x];
            s += v; q += v * v; n++;
          }
        }
        const m = s / n;
        std[by * gw + bx] = Math.sqrt(Math.max(0, q / n - m * m));
      }
    }

    // 分散のしきい値（明確に「模様のある」ブロックだけを拾う）
    const scaled = new Uint8ClampedArray(std.length);
    for (let i = 0; i < std.length; i++) scaled[i] = Math.min(255, std[i] * 4);
    const thr = Math.max(28, otsu(scaled));
    let on = new Uint8Array(std.length);
    for (let i = 0; i < std.length; i++) on[i] = scaled[i] > thr ? 1 : 0;

    // 膨張（文字行同士をつないで1枚のレシートにまとめる）
    on = dilate(on, gw, gh, 3);

    // 連結成分
    const seen = new Uint8Array(on.length);
    const boxes = [];
    for (let i = 0; i < on.length; i++) {
      if (!on[i] || seen[i]) continue;
      const stack = [i];
      seen[i] = 1;
      let minx = gw, maxx = 0, miny = gh, maxy = 0, count = 0;
      while (stack.length) {
        const v = stack.pop();
        const x = v % gw, y = (v / gw) | 0;
        count++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        const nb = [v - 1, v + 1, v - gw, v + gw];
        for (const k of nb) {
          if (k < 0 || k >= on.length || seen[k] || !on[k]) continue;
          if ((k === v - 1 && x === 0) || (k === v + 1 && x === gw - 1)) continue;
          seen[k] = 1; stack.push(k);
        }
      }
      boxes.push({ x0: minx, y0: miny, x1: maxx, y1: maxy, count });
    }

    const gridArea = gw * gh;
    let kept = boxes.filter(b => b.count > gridArea * 0.015 &&
      (b.x1 - b.x0) >= 3 && (b.y1 - b.y0) >= 3);
    kept = mergeBoxes(kept, 2);
    kept.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));

    return { boxes: kept, step, baseW: w, baseH: h, gw, gh, srcW: img.width, srcH: img.height };
  }

  function dilate(on, gw, gh, r) {
    const out = new Uint8Array(on.length);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        if (!on[y * gw + x]) continue;
        for (let dy = -r; dy <= r; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= gh) continue;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= gw) continue;
            out[ny * gw + nx] = 1;
          }
        }
      }
    }
    return out;
  }

  /** 近接／重複する矩形をまとめる */
  function mergeBoxes(boxes, gap) {
    let list = boxes.slice();
    let merged = true;
    while (merged) {
      merged = false;
      outer:
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const overlap = !(a.x1 + gap < b.x0 || b.x1 + gap < a.x0 ||
                            a.y1 + gap < b.y0 || b.y1 + gap < a.y0);
          if (!overlap) continue;
          list[i] = {
            x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
            count: a.count + b.count
          };
          list.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
    return list;
  }

  /** 画像から領収書ごとの canvas 配列を作る。
   *  allowSplit=false（PDFページなど）のときは分割せず1枚として返す。 */
  function cropReceipts(img, allowSplit) {
    const whole = () => [fitCanvas(img, 0, Math.max(img.width, img.height))];
    let info;
    try { info = detectRegions(img); } catch (e) { return whole(); }
    const { boxes, step, baseW, baseH, srcW, srcH } = info;
    if (!boxes.length) return whole();

    const sx = srcW / baseW, sy = srcH / baseH;
    const marginPx = Math.round(Math.max(srcW, srcH) * 0.012);
    const toCrop = (b) => {
      const x0 = Math.max(0, b.x0 * step * sx - marginPx);
      const y0 = Math.max(0, b.y0 * step * sy - marginPx);
      const x1 = Math.min(srcW, (b.x1 + 1) * step * sx + marginPx);
      const y1 = Math.min(srcH, (b.y1 + 1) * step * sy + marginPx);
      const c = makeCanvas(x1 - x0, y1 - y0);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
      return c;
    };

    const imgArea = srcW * srcH;
    const areaOf = b => ((b.x1 - b.x0 + 1) * step * sx) * ((b.y1 - b.y0 + 1) * step * sy);

    // 領域が1つ：余白が多いときだけ切り詰める
    if (boxes.length === 1) {
      return areaOf(boxes[0]) < imgArea * 0.88 ? [toCrop(boxes[0])] : whole();
    }
    if (!allowSplit) {
      // 分割しない設定でも、全領域を囲む矩形で余白は落とす
      const b = mergeBoxes(boxes, 10000)[0];
      return b && areaOf(b) < imgArea * 0.88 ? [toCrop(b)] : whole();
    }
    // 小さすぎる断片を除いたうえで、2〜8枚なら分割
    const big = boxes.filter(b => areaOf(b) > imgArea * 0.04);
    if (big.length >= 2 && big.length <= 8) return big.map(toCrop);
    const b = mergeBoxes(boxes, 10000)[0];
    return b && areaOf(b) < imgArea * 0.88 ? [toCrop(b)] : whole();
  }

  /* ---------- 前処理本体 ---------- */

  /**
   * 1枚のレシート画像から OCR用／AI用／サムネイル用の画像を作る。
   * @param {HTMLCanvasElement|HTMLImageElement|ImageBitmap} src
   * @param {{deskew?:boolean}} opts
   */
  async function preprocess(src, opts) {
    const o = opts || {};
    let color = fitCanvas(src, OCR_MIN_EDGE, OCR_MAX_EDGE);

    // グレースケール -> シャープ -> 局所二値化
    let gray = toGray(color);
    gray = sharpen(gray, 0.6);
    await U.nextFrame();
    let binCanvas = grayToCanvas(sauvola(gray, 0.25));
    await U.nextFrame();

    // 傾き補正は二値化のあとで行う（背景の暗さに引きずられないようにするため）
    let angle = 0;
    if (o.deskew !== false) {
      try {
        angle = estimateSkew(binCanvas);
        if (Math.abs(angle) >= 0.4) {
          binCanvas = rotateCanvas(binCanvas, -angle);
          color = rotateCanvas(color, -angle);
        } else {
          angle = 0;
        }
      } catch (e) { angle = 0; }
    }
    await U.nextFrame();

    // AI解析・サムネイルはカラーのまま（AIは元の見た目のほうが読み取れる）
    const aiCanvas = fitCanvas(color, 0, AI_MAX_EDGE);
    const thumbCanvas = fitCanvas(color, 0, THUMB_EDGE);

    return {
      angle,
      ocr: binCanvas.toDataURL('image/png'),
      ai: aiCanvas.toDataURL('image/jpeg', 0.82),
      thumb: thumbCanvas.toDataURL('image/jpeg', 0.7),
      full: fitCanvas(color, 0, 1200).toDataURL('image/jpeg', 0.72)
    };
  }

  /** ファイル（画像 or PDF）からページ画像の配列を得る */
  async function pagesFromFile(file) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      if (!global.pdfjsLib) throw new Error('PDFライブラリを読み込めませんでした');
      const buf = await file.arrayBuffer();
      const pdf = await global.pdfjsLib.getDocument({ data: buf }).promise;
      const pages = [];
      const max = Math.min(pdf.numPages, 20);
      for (let n = 1; n <= max; n++) {
        const page = await pdf.getPage(n);
        const viewport = page.getViewport({ scale: 2 });
        const c = makeCanvas(viewport.width, viewport.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push({ image: c, isPdf: true });
      }
      return pages;
    }
    const img = await U.loadImage(file);
    return [{ image: img, isPdf: false }];
  }

  App.image = {
    pagesFromFile, cropReceipts, preprocess,
    fitCanvas, toGray, grayToCanvas, sharpen, sauvola, otsu, estimateSkew, rotateCanvas, drawScaled
  };
})(window);
