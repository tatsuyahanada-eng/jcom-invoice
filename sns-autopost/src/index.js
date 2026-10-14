#!/usr/bin/env node
// 使い方:
//   node src/index.js generate [--date YYYY-MM-DD] [--type trend_idea|wish_app|case_study|se_diary|tips] [--dry-run] [--force]
//   node src/index.js publish  [--date YYYY-MM-DD]   … 下書きを PUBLISH_PLATFORMS に投稿
//   node src/index.js daily    [--type ...]          … generate → publish を続けて実行
//   node src/index.js check    [--date YYYY-MM-DD]   … 手で直した下書きを再チェック

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { planPost, parseNotes, dateKey } from './planner.js';
import { fetchHeadlines } from './sources.js';
import { generatePost } from './generator.js';
import { checkPost } from './compliance.js';
import { PUBLISHERS, parsePlatforms } from './publishers/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  profile: path.join(ROOT, 'config/profile.json'),
  cases: path.join(ROOT, 'data/cases.json'),
  seasonal: path.join(ROOT, 'data/seasonal.json'),
  history: path.join(ROOT, 'data/history.json'),
  notes: path.join(ROOT, 'data/notes.md'),
  draft: (date) => path.join(ROOT, 'posts', `${date}.json`),
};

const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
const exists = (file) => fs.access(file).then(() => true, () => false);

async function summary(markdown) {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

function renderDraft(d) {
  const lines = [
    `## ${d.date} ${d.plan.typeLabel}${d.plan.caseId ? `（事例: ${d.plan.caseId}）` : ''} — ${d.status}`,
    ...(d.plan.note ? [`**元メモ:** ${d.plan.note}`] : []),
    `**テーマ:** ${d.post.topic}`,
    `### X 用（${d.check.xLength}/280 カウント）`,
    '```',
    d.post.x_text,
    '```',
    `### Threads / Bluesky 用（${d.check.longLength} 文字）`,
    '```',
    d.post.long_text,
    '```',
  ];
  if (d.check.errors.length) lines.push('**エラー（投稿しません）:**', ...d.check.errors.map((e) => `- ${e}`));
  if (d.check.warnings.length) lines.push('**注意:**', ...d.check.warnings.map((w) => `- ${w}`));
  return lines.join('\n');
}

async function loadContext() {
  const [profile, casesFile, seasonal, history, notesMd] = await Promise.all([
    readJson(P.profile),
    readJson(P.cases),
    readJson(P.seasonal),
    readJson(P.history),
    fs.readFile(P.notes, 'utf8').catch(() => ''),
  ]);
  // 公開リポジトリに書きたくない NG ワード（顧客名など）は Secret の SNS_BLOCKED_TERMS（カンマ区切り）で追加できる
  const extra = (process.env.SNS_BLOCKED_TERMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  profile.blockedTerms = [...(profile.blockedTerms ?? []), ...extra];
  return { profile, cases: casesFile.cases, seasonal, history, notes: parseNotes(notesMd) };
}

async function generate({ date, type, dryRun, force }) {
  const ctx = await loadContext();
  const target = date ? new Date(`${date}T12:00:00+09:00`) : new Date();
  const key = dateKey(target);

  if (!dryRun && !force && (await exists(P.draft(key)))) {
    console.log(`${key} の下書きは既にあります（作り直すときは --force）`);
    return readJson(P.draft(key));
  }

  const history = ctx.history.filter((h) => h.date !== key);
  const plan = planPost({ ...ctx, history, date: target, forcedType: type });
  const headlines = plan.needsHeadlines ? await fetchHeadlines() : [];
  console.log(`[plan] ${key} ${plan.typeLabel}${plan.caseStudy ? ` / 事例: ${plan.caseStudy.title}` : ''} / 見出し ${headlines.length}件`);

  const { post, check, attempts } = await generatePost({ plan, profile: ctx.profile, headlines });
  const draft = {
    date: key,
    status: check.ok ? 'draft' : 'blocked',
    plan: {
      type: plan.type,
      typeLabel: plan.typeLabel,
      caseId: plan.caseStudy?.id ?? null,
      noteId: plan.note?.id ?? null,
      note: plan.note?.text ?? null,
      cta: plan.cta,
    },
    post,
    check,
    attempts,
    // 着想に使った見出し（記録用。本文には使わない）
    headlines: headlines.map((h) => ({ title: h.title, source: h.source })),
    published: {},
    generatedAt: new Date().toISOString(),
  };

  await summary(renderDraft(draft));
  if (dryRun) return draft;

  await writeJson(P.draft(key), draft);
  history.push({
    date: key,
    type: plan.type,
    caseId: draft.plan.caseId,
    noteId: draft.plan.noteId,
    topic: post.topic,
    status: draft.status,
  });
  history.sort((a, b) => a.date.localeCompare(b.date));
  await writeJson(P.history, history);
  return draft;
}

async function publish({ date }) {
  const key = date ?? dateKey(new Date());
  const platforms = parsePlatforms(process.env.PUBLISH_PLATFORMS);
  if (platforms.length === 0) {
    console.log('PUBLISH_PLATFORMS が未設定のため投稿しません（下書きのみ）');
    return;
  }
  if (!(await exists(P.draft(key)))) throw new Error(`${key} の下書きがありません`);

  const { profile } = await loadContext();
  const draft = await readJson(P.draft(key));
  if (draft.status === 'blocked') throw new Error(`${key} の下書きはチェック不合格のため投稿しません。直してから check を実行してください`);

  // 手で編集されている可能性があるので投稿直前にもう一度チェック
  const check = checkPost(draft.post, { profile, headlines: draft.headlines });
  if (!check.ok) throw new Error(`投稿前チェックで不合格:\n- ${check.errors.join('\n- ')}`);

  const failures = [];
  for (const name of platforms) {
    if (draft.published[name]) {
      console.log(`[${name}] 投稿済みのためスキップ`);
      continue;
    }
    const pub = PUBLISHERS[name];
    const missing = pub.requiredEnv.filter((k) => !process.env[k]);
    if (missing.length) {
      failures.push(`${name}: 環境変数 ${missing.join(', ')} が未設定`);
      continue;
    }
    try {
      const result = await pub.post(draft.post[pub.field], process.env);
      draft.published[name] = { ...result, at: new Date().toISOString() };
      console.log(`[${name}] 投稿しました ${result.url ?? result.id}`);
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
    }
  }

  const done = platforms.every((n) => draft.published[n]);
  draft.status = done ? 'published' : 'partial';
  await writeJson(P.draft(key), draft);

  const history = await readJson(P.history);
  const entry = history.find((h) => h.date === key);
  if (entry) entry.status = draft.status;
  await writeJson(P.history, history);

  if (failures.length) throw new Error(`一部の投稿に失敗:\n- ${failures.join('\n- ')}`);
}

async function check({ date }) {
  const key = date ?? dateKey(new Date());
  const { profile } = await loadContext();
  const draft = await readJson(P.draft(key));
  draft.check = checkPost(draft.post, { profile, headlines: draft.headlines });
  if (draft.status === 'blocked' || draft.status === 'draft') draft.status = draft.check.ok ? 'draft' : 'blocked';
  await writeJson(P.draft(key), draft);
  await summary(renderDraft(draft));
  if (!draft.check.ok) process.exitCode = 1;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      date: { type: 'string' },
      type: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
    },
  });
  const cmd = positionals[0] ?? 'daily';
  const opts = { date: values.date, type: values.type || undefined, dryRun: values['dry-run'], force: values.force };

  if (cmd === 'generate') {
    const d = await generate(opts);
    if (d.status === 'blocked') process.exitCode = 1;
  } else if (cmd === 'publish') {
    await publish(opts);
  } else if (cmd === 'daily') {
    const d = await generate(opts);
    if (d.status === 'blocked') throw new Error('チェック不合格のため投稿を中止しました（posts/ の下書きを確認してください）');
    if (!opts.dryRun) await publish({ date: d.date });
  } else if (cmd === 'check') {
    await check(opts);
  } else {
    throw new Error(`不明なコマンド: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(`エラー: ${err.message}`);
  process.exit(1);
});
