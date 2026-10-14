// X (旧Twitter) の文字数カウント（twitter-text v3 の重み付けに準拠した近似）
// 半角英数・一部記号 = 1、日本語などそれ以外 = 2、URL = 23、絵文字 = 2。上限は 280。

const LIGHT_RANGES = [
  [0, 4351],
  [8192, 8205],
  [8208, 8223],
  [8242, 8247],
];
const URL_RE = /https?:\/\/[^\s]+/g;
const URL_WEIGHT = 23;

const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });

function codePointWeight(cp) {
  return LIGHT_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi) ? 1 : 2;
}

export function xWeightedLength(text) {
  const normalized = text.normalize('NFC');
  let total = 0;
  const withoutUrls = normalized.replace(URL_RE, () => {
    total += URL_WEIGHT;
    return '';
  });
  for (const { segment } of segmenter.segment(withoutUrls)) {
    if (/\p{Extended_Pictographic}/u.test(segment)) {
      total += 2;
      continue;
    }
    for (const ch of segment) total += codePointWeight(ch.codePointAt(0));
  }
  return total;
}

// Bluesky / Threads 用: 書記素（見た目の1文字）単位の長さ
export function graphemeLength(text) {
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}
