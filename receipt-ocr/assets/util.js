/* 共通ユーティリティ */
(function (global) {
  'use strict';
  const App = global.App = global.App || {};

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const yenFmt = new Intl.NumberFormat('ja-JP', {
    style: 'currency', currency: 'JPY', maximumFractionDigits: 0
  });
  const numFmt = new Intl.NumberFormat('ja-JP');

  const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

  /** 金額を「¥1,234」形式に */
  function yen(n) { return yenFmt.format(Number(n) || 0); }
  /** 数値をカンマ区切りに */
  function num(n) { return numFmt.format(Number(n) || 0); }

  /** Date -> 'YYYY-MM-DD'（ローカル時間基準。toISOStringはUTCずれが出るので使わない） */
  function toDateStr(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  /** Date -> 'HH:MM' */
  function toTimeStr(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  /** 'YYYY-MM-DD' -> 曜日（不正な値なら空文字） */
  function weekday(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return isNaN(d) ? '' : WEEK[d.getDay()];
  }
  function today() { return toDateStr(new Date()); }
  function thisMonth() { return today().slice(0, 7); }

  /** HTML属性値としての安全なエスケープ */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function uid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /** Blob -> dataURL */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /** base64 の dataURL -> { mediaType, base64 }（canvas.toDataURL は常に base64） */
  function splitDataUrl(dataUrl) {
    const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl || '');
    return m ? { mediaType: m[1], base64: m[2] } : null;
  }

  /** dataURL/Blob/File -> HTMLImageElement（EXIF回転も反映） */
  async function loadImage(src) {
    if (typeof src !== 'string') {
      // File / Blob: EXIF の向きを反映して読み込む
      try {
        const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' });
        return bmp;
      } catch (e) {
        src = await blobToDataUrl(src);
      }
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = src;
    });
  }

  /** UIをブロックしないよう、重い処理の合間に制御を返す */
  function nextFrame() {
    return new Promise(r => (global.requestAnimationFrame || setTimeout)(() => r(), 0));
  }

  /** ブラウザからファイルをダウンロード */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  App.util = {
    $, $$, yen, num, toDateStr, toTimeStr, weekday, today, thisMonth,
    esc, uid, blobToDataUrl, splitDataUrl, loadImage, nextFrame, download, WEEK
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = App.util;
})(typeof window !== 'undefined' ? window : globalThis);
