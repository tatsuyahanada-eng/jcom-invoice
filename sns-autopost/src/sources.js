// ニュース・トレンドの見出しを RSS から集める。
// 著作権への配慮として、取得するのは「見出し」と「日付」だけ。本文は取得・保存・引用しない。

const GOOGLE_NEWS = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:7d&hl=ja&gl=JP&ceid=JP:ja`;

export const DEFAULT_FEEDS = [
  { name: 'Google ニュース: 生成AI アプリ', url: GOOGLE_NEWS('生成AI アプリ') },
  { name: 'Google ニュース: 業務効率化 DX', url: GOOGLE_NEWS('業務効率化 DX 中小企業') },
  { name: 'Google ニュース: スマホアプリ 新サービス', url: GOOGLE_NEWS('スマホアプリ 新サービス') },
  { name: 'はてなブックマーク テクノロジー', url: 'https://b.hatena.ne.jp/hotentry/it.rss' },
  { name: 'Google トレンド 急上昇', url: 'https://trends.google.co.jp/trending/rss?geo=JP' },
];

// 投稿のネタにしない話題（アダルト・ギャンブル・事件事故・災害・政治など）
const NG_TOPICS = [
  'ポルノ', 'アダルト', 'セクスティング', 'AI彼女', 'AI彼氏', '出会い', 'ギャンブル', 'カジノ', 'パチンコ',
  '死亡', '死去', '事故', '逮捕', '容疑', '殺', '詐欺', '地震', '津波', '災害', '火災', '選挙', '戦争',
];

export function isUsableHeadline(title) {
  return !NG_TOPICS.some((w) => title.includes(w));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(\w+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/<[^>]+>/g, '')
    .trim();
}

function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
}

// RSS 2.0 / RDF(RSS 1.0) の両方に対応した最小限のパーサ
export function parseFeed(xml) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return blocks
    .map((b) => {
      // 見出し末尾の「 - 媒体名」「｜媒体名」を外す
      const title = tag(b, 'title')
        .replace(/\s+-\s+[^-]+$/, '')
        .replace(/\s*[｜|]\s*[^｜|]+$/, '')
        .trim();
      const date = tag(b, 'pubDate') || tag(b, 'dc:date');
      return { title, date: date ? new Date(date) : null };
    })
    .filter((i) => i.title);
}

export async function fetchHeadlines({ feeds = DEFAULT_FEEDS, perFeed = 8, timeoutMs = 10000 } = {}) {
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const res = await fetch(feed.url, {
        headers: { 'User-Agent': 'sns-autopost/1.0 (+headline-only)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
      const items = parseFeed(await res.text()).slice(0, perFeed);
      return items.map((i) => ({ ...i, source: feed.name }));
    }),
  );
  const headlines = [];
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') headlines.push(...r.value);
    else console.warn(`[sources] 取得失敗 ${feeds[i].name}: ${r.reason?.message ?? r.reason}`);
  }
  // 同じ見出しの重複を除く
  const seen = new Set();
  return headlines.filter((h) => isUsableHeadline(h.title) && !seen.has(h.title) && seen.add(h.title));
}
