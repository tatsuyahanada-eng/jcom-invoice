// Claude API で投稿文を生成する。チェックに通らなければ理由を伝えて書き直させる。

import Anthropic from '@anthropic-ai/sdk';
import { checkPost } from './compliance.js';

const POST_SCHEMA = {
  type: 'object',
  properties: {
    topic: { type: 'string', description: '投稿テーマを20文字程度で（重複防止の履歴用）' },
    x_text: { type: 'string', description: 'X 用の本文（ハッシュタグ・CTA 込み）' },
    long_text: { type: 'string', description: 'Threads / Bluesky 用の本文（ハッシュタグ・CTA 込み）' },
    inspired_by: {
      type: 'array',
      items: { type: 'string' },
      description: '参考にした見出し（そのまま記録用。本文には使わない）。使っていなければ空配列',
    },
  },
  required: ['topic', 'x_text', 'long_text', 'inspired_by'],
  additionalProperties: false,
};

export function buildSystemPrompt(profile) {
  const a = profile.account;
  return `あなたは「${a.displayName}」（${a.handle}）の SNS 担当です。毎日1本、日本語で投稿文を書きます。

# アカウントの人物像
${a.persona}

# 提供サービス
${a.services.map((s) => `- ${s}`).join('\n')}

# 強み
${a.strengths.map((s) => `- ${s}`).join('\n')}

# 投稿の目的
読んだ中小企業・個人事業主・現場の担当者が「うちの業務もアプリにできるかも」と感じ、DM で相談したくなること。売り込み色は控えめに、役立つ・面白い内容を主役にする。

# 文章のルール
- 1投稿1テーマ。冒頭1行で興味を引く（問いかけ・あるある・意外な事実など）。
- 専門用語はかみ砕く。PWA は「ホーム画面に追加できる Web アプリ」、APK は「Android アプリ」のように補足する。
- 改行を使って読みやすく。絵文字は2〜3個まで。
- 最後に指定された CTA（DM への誘導）を入れる。ハッシュタグは指定された候補から最大${profile.hashtags.maxPerPost}個、末尾に付ける。
- x_text は X の文字数制限に収める: 日本語は1文字=2カウントで合計${profile.limits.xWeightedMax}カウント以内（目安: 日本語だけなら約${Math.floor(profile.limits.xWeightedMax / 2) - 5}文字以内）。
- long_text は${profile.limits.longTextMax}文字以内。x_text より少し詳しく書いてよい。

# 著作権・権利・信用に関する厳守事項
- ニュースは「着想」にのみ使う。見出しや記事の文言を引用・転載しない。媒体名・記者名・企業名・製品名・人名を出さない（一般名詞に言い換える）。
- 他社のロゴ・キャラクター・商標を連想させる表現、他社サービスの名前を使ったアプリ名を作らない。
- 開発事例は渡されたデータの事実だけを書く。顧客名・ブランド名・社名は書かない。数字・効果・お客様の声を作らない。
- 「必ず儲かる」「絶対」「No.1」などの誇大・保証表現を使わない。投資・医療・法律の助言にあたる内容を書かない。
- URL は入れない。
- 実在の個人や企業を批判・揶揄しない。政治・宗教・災害や事件の当事者をネタにしない。`;
}

export function buildUserPrompt(plan, profile, headlines) {
  const parts = [`# 今日の投稿（${plan.date}）`, `投稿タイプ: ${plan.typeLabel}`, `書き方: ${plan.instruction}`];

  if (plan.caseStudy) {
    const { publishable, id, ...facts } = plan.caseStudy;
    parts.push(`\n# 紹介する開発事例（この内容だけを根拠にする）\n${JSON.stringify(facts, null, 2)}`);
  }
  if (plan.needsHeadlines && headlines.length > 0) {
    parts.push(
      `\n# 最近のニュース・トレンドの見出し（着想用。文言は使わないこと）\n` +
        headlines.map((h) => `- ${h.title}`).join('\n'),
    );
  }
  if (plan.type === 'wish_app' || (plan.needsHeadlines && headlines.length === 0)) {
    parts.push(`\n# 今の季節の話題（ヒント）\n${plan.seasonalTopics.map((t) => `- ${t}`).join('\n')}`);
  }
  parts.push(`\n# 使う CTA\n${plan.cta}`);
  parts.push(`\n# ハッシュタグ候補\n${profile.hashtags.pool.join(' ')}`);
  if (plan.recentTopics.length > 0) {
    parts.push(`\n# 最近の投稿テーマ（重複を避ける）\n${plan.recentTopics.map((t) => `- ${t}`).join('\n')}`);
  }
  return parts.join('\n');
}

function extractJson(response) {
  if (response.stop_reason === 'refusal') {
    throw new Error(`生成が拒否されました（${response.stop_details?.category ?? '理由不明'}）`);
  }
  if (response.stop_reason === 'max_tokens') throw new Error('出力が上限で途切れました');
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

export async function generatePost({ plan, profile, headlines, client = new Anthropic(), maxAttempts = 3 }) {
  const system = buildSystemPrompt(profile);
  const messages = [{ role: 'user', content: buildUserPrompt(plan, profile, headlines) }];
  let last;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await client.beta.messages.create({
      model: profile.model,
      max_tokens: 16000,
      // 安全分類器に誤って拒否された場合はサーバー側で別モデルに切り替えて続行
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: profile.effort,
        format: { type: 'json_schema', schema: POST_SCHEMA },
      },
      system,
      messages,
    });
    const post = extractJson(response);
    const check = checkPost(post, { profile, headlines, caseStudy: plan.caseStudy });
    last = { post, check, attempts: attempt };
    if (check.ok) return last;

    console.warn(`[generator] ${attempt}回目の下書きがチェック不合格:\n  - ${check.errors.join('\n  - ')}`);
    messages.push(
      { role: 'assistant', content: response.content },
      {
        role: 'user',
        content:
          `次の問題があるので直して、同じ JSON 形式で出し直してください。\n` +
          check.errors.map((e) => `- ${e}`).join('\n') +
          `\n（現在の X 用カウント: ${check.xLength}、長文版: ${check.longLength}文字）`,
      },
    );
  }
  return last;
}
