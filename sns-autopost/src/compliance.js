// 投稿前の自動チェック。1つでも error があれば投稿しない（下書きとして残す）。

import { xWeightedLength, graphemeLength } from './textlen.js';

// 誇大広告・保証表現（景品表示法・金融商品取引法の観点）
const RISKY_PHRASES = [
  '必ず儲か', '絶対儲か', '確実に儲か', '100%稼', '誰でも稼げ', '月収100万', '不労所得',
  '絶対に勝て', '必ず勝て', '元本保証', 'ノーリスク', '業界No.1', '日本一', '世界初',
];

const URL_RE = /https?:\/\/[^\s]+/g;
const HASHTAG_RE = /#[^\s#]+/g;

// 見出しの文言をそのまま流用していないか（連続 n 文字の一致で判定）
export function longestCommonRun(a, b) {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diagPrev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diagPrev + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diagPrev = tmp;
    }
  }
  return best;
}

export function checkPost(post, { profile, headlines = [], caseStudy = null }) {
  const errors = [];
  const warnings = [];
  const texts = { x_text: post.x_text ?? '', long_text: post.long_text ?? '' };

  if (!texts.x_text.trim()) errors.push('x_text が空です');
  if (!texts.long_text.trim()) errors.push('long_text が空です');

  const xLen = xWeightedLength(texts.x_text);
  if (xLen > profile.limits.xWeightedMax) {
    errors.push(`X 用の文字数オーバー（${xLen}/${profile.limits.xWeightedMax}、日本語は1文字=2カウント）`);
  }
  const longLen = graphemeLength(texts.long_text);
  if (longLen > profile.limits.longTextMax) {
    errors.push(`長文版の文字数オーバー（${longLen}/${profile.limits.longTextMax}）`);
  }

  for (const [field, text] of Object.entries(texts)) {
    const lower = text.toLowerCase();
    for (const term of profile.blockedTerms ?? []) {
      if (lower.includes(term.toLowerCase())) errors.push(`${field}: 非公開の固有名詞「${term}」が含まれています`);
    }
    for (const p of RISKY_PHRASES) {
      if (text.includes(p)) errors.push(`${field}: 誇大・保証表現「${p}」が含まれています`);
    }
    for (const url of text.match(URL_RE) ?? []) {
      if (!(profile.allowedUrls ?? []).some((u) => url.startsWith(u))) {
        errors.push(`${field}: 許可されていない URL「${url}」が含まれています`);
      }
    }
    const tags = text.match(HASHTAG_RE) ?? [];
    if (tags.length > (profile.hashtags?.maxPerPost ?? 2)) {
      errors.push(`${field}: ハッシュタグが多すぎます（${tags.length}個）`);
    }
    if (!/DM/i.test(text)) warnings.push(`${field}: DM への誘導が入っていません`);

    // 見出しの丸写しチェック（12 文字以上の連続一致はアウト）
    for (const h of headlines) {
      if (longestCommonRun(text, h.title) >= 12) {
        errors.push(`${field}: ニュース見出しの文言をそのまま使っています（「${h.title}」）`);
      }
    }
  }

  // 事例投稿: 事例データにない数字（％・倍・時間・円など）を作っていないか
  if (caseStudy && !caseStudy.results) {
    const numeric = /\d+(\.\d+)?\s*(%|％|倍|時間|分|円|万|割|件)/;
    for (const [field, text] of Object.entries(texts)) {
      if (numeric.test(text)) {
        warnings.push(`${field}: 事例に実績値が未登録なのに数値表現があります。事実か確認してください`);
      }
    }
  }

  return { ok: errors.length === 0, errors, warnings, xLength: xLen, longLength: longLen };
}
