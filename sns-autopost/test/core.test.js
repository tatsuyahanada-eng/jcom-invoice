import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { xWeightedLength, graphemeLength } from '../src/textlen.js';
import { parseFeed, isUsableHeadline } from '../src/sources.js';
import { checkPost, longestCommonRun } from '../src/compliance.js';
import { planPost, pickCase, dateKey } from '../src/planner.js';
import { hashtagFacets } from '../src/publishers/bluesky.js';
import { oauthHeader } from '../src/publishers/x.js';
import { buildUserPrompt, generatePost } from '../src/generator.js';

const profile = JSON.parse(fs.readFileSync(new URL('../config/profile.json', import.meta.url)));
const cases = JSON.parse(fs.readFileSync(new URL('../data/cases.json', import.meta.url))).cases;
const seasonal = JSON.parse(fs.readFileSync(new URL('../data/seasonal.json', import.meta.url)));

test('X の文字数: 日本語=2, 英数=1, URL=23, 絵文字=2', () => {
  assert.equal(xWeightedLength('abc'), 3);
  assert.equal(xWeightedLength('あいう'), 6);
  assert.equal(xWeightedLength('見て https://example.com/very/long/path'), 4 + 1 + 23);
  assert.equal(xWeightedLength('📩'), 2);
  assert.equal(xWeightedLength('👨‍👩‍👧'), 2);
  assert.equal(graphemeLength('👨‍👩‍👧あ'), 2);
});

test('RSS の見出しを取り出し、Google ニュースの媒体名を外す', () => {
  const xml = `<rss><channel><item><title><![CDATA[生成AIで議事録を自動化 - 架空新聞]]></title>
    <pubDate>Mon, 12 Oct 2026 01:00:00 GMT</pubDate></item>
    <item><title>A &amp; B の新サービス</title></item>
    <item><title>医師が作った英語アプリ｜Example.com</title></item></channel></rss>`;
  const items = parseFeed(xml);
  assert.deepEqual(items.map((i) => i.title), ['生成AIで議事録を自動化', 'A & B の新サービス', '医師が作った英語アプリ']);
  assert.ok(items[0].date instanceof Date);
});

const good = {
  topic: 'テスト',
  x_text: '紙の日報、まだ手書きですか？\nスマホで入力→自動集計するアプリ、作れます。\nDMでご相談ください📩\n#PWA',
  long_text: '紙の日報をスマホアプリに。入力するだけで自動集計。DMでご相談ください📩 #PWA #業務効率化',
};

test('問題のない投稿はチェックを通る', () => {
  const r = checkPost(good, { profile });
  assert.equal(r.ok, true, r.errors.join(','));
});

test('非公開の固有名詞・誇大表現・URL・タグ過多・文字数超過を弾く', () => {
  const bad = {
    ...good,
    x_text: 'J:COM さん向けに作りました！必ず儲かる https://evil.example #a #b #c DM' + 'あ'.repeat(120),
  };
  const r = checkPost(bad, { profile });
  assert.equal(r.ok, false);
  const all = r.errors.join('\n');
  for (const s of ['J:COM', '必ず儲か', 'URL', 'ハッシュタグ', '文字数']) assert.match(all, new RegExp(s));
});

test('ニュース見出しの丸写しを検出する', () => {
  const headline = '中小企業の約半数が生成AIの業務活用を検討中と判明';
  assert.ok(longestCommonRun('調査で中小企業の約半数が生成AIの業務活用を検討中', headline) >= 12);
  const r = checkPost({ ...good, x_text: `${headline}！DM #PWA` }, { profile, headlines: [{ title: headline }] });
  assert.equal(r.ok, false);
});

test('曜日ごとの投稿タイプと事例ローテーション', () => {
  const tue = new Date('2026-10-13T12:00:00+09:00'); // 火曜
  const plan = planPost({ date: tue, profile, cases, seasonal, history: [] });
  assert.equal(plan.type, 'case_study');
  assert.ok(plan.caseStudy.publishable);
  assert.equal(plan.seasonalTopics, seasonal['10']);

  const used = cases.filter((c) => c.publishable).map((c, i) => ({ date: `2026-10-${String(5 + i).padStart(2, '0')}`, caseId: c.id }));
  // 全事例をクールダウン期間内に使っていたら豆知識に切り替わる
  const plan2 = planPost({ date: tue, profile, cases, seasonal, history: used });
  assert.equal(plan2.type, 'tips');
  assert.equal(plan2.caseStudy, null);
});

test('非公開の事例は選ばれない', () => {
  const only = [{ id: 'secret', publishable: false }];
  assert.equal(pickCase(only, [], '2026-10-14', 10), null);
});

test('日付は日本時間で判定する', () => {
  assert.equal(dateKey(new Date('2026-10-13T16:00:00Z')), '2026-10-14');
});

test('Bluesky のハッシュタグ facet は UTF-8 バイト位置', () => {
  const [f] = hashtagFacets('アプリ #PWA');
  assert.deepEqual(f.index, { byteStart: 10, byteEnd: 14 });
  assert.equal(f.features[0].tag, 'PWA');
});

test('X の OAuth 1.0a ヘッダの形式と署名', () => {
  const h = oauthHeader({
    method: 'POST',
    url: 'https://api.x.com/2/tweets',
    consumerKey: 'ck',
    consumerSecret: 'cs',
    token: 'tk',
    tokenSecret: 'ts',
    nonce: 'n',
    timestamp: '1',
  });
  assert.match(h, /^OAuth oauth_consumer_key="ck", oauth_nonce="n", oauth_signature="[^"]+", oauth_signature_method="HMAC-SHA1"/);
  // 署名ベース文字列から独立に計算した期待値
  const base = 'POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&' +
    encodeURIComponent('oauth_consumer_key=ck&oauth_nonce=n&oauth_signature_method=HMAC-SHA1&oauth_timestamp=1&oauth_token=tk&oauth_version=1.0');
  const sig = crypto.createHmac('sha1', 'cs&ts').update(base).digest('base64');
  assert.ok(h.includes(`oauth_signature="${encodeURIComponent(sig)}"`));
});

test('事例投稿のプロンプトに非公開フィールドを含めない', () => {
  const plan = planPost({ date: new Date('2026-10-13T12:00:00+09:00'), profile, cases, seasonal, history: [] });
  const prompt = buildUserPrompt(plan, profile, []);
  assert.ok(!prompt.includes('"publishable"'));
  assert.ok(prompt.includes(plan.caseStudy.title));
});

test('不適切な話題の見出しは除外する', () => {
  assert.equal(isUsableHeadline('生成AIで議事録を自動化'), true);
  assert.equal(isUsableHeadline('AI彼女 アプリ 比較'), false);
  assert.equal(isUsableHeadline('台風で事故多発'), false);
});

function fakeClient(outputs) {
  const calls = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (req) => {
          calls.push(structuredClone(req));
          const text = JSON.stringify(outputs[calls.length - 1]);
          return { stop_reason: 'end_turn', content: [{ type: 'text', text }] };
        },
      },
    },
  };
}

test('チェック不合格なら理由を伝えて書き直させる', async () => {
  const plan = planPost({ date: new Date('2026-10-14T12:00:00+09:00'), profile, cases, seasonal, history: [] });
  const tooLong = { ...good, x_text: 'あ'.repeat(200) + ' DM', inspired_by: [] };
  const client = fakeClient([tooLong, { ...good, inspired_by: [] }]);
  const { post, check, attempts } = await generatePost({ plan, profile, headlines: [], client });
  assert.equal(attempts, 2);
  assert.equal(check.ok, true);
  assert.equal(post.x_text, good.x_text);
  const retry = client.calls[1].messages.at(-1).content;
  assert.match(retry, /文字数オーバー/);
  assert.equal(client.calls[0].model, profile.model);
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
});

test('生成が拒否されたらエラーにする', async () => {
  const plan = planPost({ date: new Date('2026-10-14T12:00:00+09:00'), profile, cases, seasonal, history: [] });
  const client = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', stop_details: { category: 'x' }, content: [] }) } } };
  await assert.rejects(generatePost({ plan, profile, headlines: [], client }), /拒否/);
});
