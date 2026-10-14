// 「今日なにを投稿するか」を決める。曜日ごとの投稿タイプ・事例のローテーション・CTA の選択。

export const POST_TYPES = {
  trend_idea: {
    label: 'トレンド × アプリ案',
    needsHeadlines: true,
    instruction:
      '最近のニュース・トレンドの見出しから1つテーマを選び、「この流れなら、こんなアプリが作れる」という具体的なアプリ案を紹介する。' +
      'ニュースの内容は一般化した言い方で触れるだけにし、見出しの文言・媒体名・企業名・人名は使わない。' +
      'アプリ案は「誰の」「どんな手間が」「どう楽になるか」が伝わるように。PWA か Android アプリのどちらが向くかも一言添える。',
  },
  wish_app: {
    label: 'こんなアプリあったらいいね',
    needsHeadlines: false,
    instruction:
      '季節の行事や日常・仕事の「ちょっとした困りごと」から、「こんなアプリがあったらいいな」というアイデアを1つ紹介する。' +
      '読者が「あるある」と共感できる困りごとから入り、最後に「作れます」と自然につなげる。' +
      '読者に「あなたならどんなアプリが欲しい？」と問いかけてもよい。',
  },
  case_study: {
    label: '開発事例の紹介',
    needsHeadlines: false,
    instruction:
      '指定された開発事例を紹介する。「課題 → 作ったもの → 何が楽になったか」の流れで書く。' +
      '事例データに書かれている事実だけを使い、数字や効果を作らない（results が空なら定量的な効果には触れない）。' +
      '顧客名・ブランド名・社名は絶対に書かない（データに書かれている匿名表現のみ使う）。',
  },
  tips: {
    label: 'アプリ開発の豆知識',
    needsHeadlines: false,
    instruction:
      'アプリ開発を検討している中小企業・個人事業主向けの豆知識を1つ紹介する。' +
      '例: PWA と Android アプリ（APK）の違い、ストアに出さない社内配布、まず小さく試作する進め方、Excel 業務のアプリ化、AI を組み込むときの注意点など。' +
      '最近の投稿と同じテーマは避ける。',
  },
};

export function dateKey(date) {
  // 日本時間の YYYY-MM-DD
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
}

function jstParts(date) {
  const key = dateKey(date);
  const [y, m, d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { key, month: m, weekday };
}

function daysBetween(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}

export function pickCase(cases, history, todayKey, cooldownDays) {
  const usable = cases.filter((c) => c.publishable);
  if (usable.length === 0) return null;
  const lastUsed = new Map();
  for (const h of history) {
    if (h.caseId && (!lastUsed.has(h.caseId) || h.date > lastUsed.get(h.caseId))) {
      lastUsed.set(h.caseId, h.date);
    }
  }
  // 使ったことがない事例 → 最後に使ったのが古い事例 の順
  const sorted = [...usable].sort((a, b) => {
    const la = lastUsed.get(a.id) ?? '0000-00-00';
    const lb = lastUsed.get(b.id) ?? '0000-00-00';
    return la < lb ? -1 : la > lb ? 1 : 0;
  });
  const candidate = sorted[0];
  const last = lastUsed.get(candidate.id);
  if (last && daysBetween(todayKey, last) < cooldownDays) return null;
  return candidate;
}

export function planPost({ date, profile, cases, seasonal, history, forcedType }) {
  const { key, month, weekday } = jstParts(date);
  let type = forcedType ?? profile.schedule[String(weekday)] ?? 'wish_app';
  if (!POST_TYPES[type]) throw new Error(`未知の投稿タイプ: ${type}`);

  let caseStudy = null;
  if (type === 'case_study') {
    caseStudy = pickCase(cases, history, key, profile.caseCooldownDays ?? 10);
    // 公開できる事例がない／全部クールダウン中なら豆知識に差し替え
    if (!caseStudy) type = 'tips';
  }

  const ctaIndex = history.length % profile.cta.length;
  return {
    date: key,
    type,
    typeLabel: POST_TYPES[type].label,
    instruction: POST_TYPES[type].instruction,
    needsHeadlines: POST_TYPES[type].needsHeadlines,
    caseStudy,
    seasonalTopics: seasonal[String(month)] ?? [],
    cta: profile.cta[ctaIndex],
    recentTopics: history.slice(-14).map((h) => `${h.date} [${h.type}] ${h.topic}`),
  };
}
