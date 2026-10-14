// Threads API への投稿（テキストのみ）。コンテナ作成 → 公開 の2段階。

const BASE = 'https://graph.threads.net/v1.0';

async function call(path, params) {
  const res = await fetch(`${BASE}${path}?${new URLSearchParams(params)}`, { method: 'POST' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(`Threads API ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  return body;
}

export async function postToThreads(text, env = process.env) {
  const token = env.THREADS_ACCESS_TOKEN;
  const container = await call('/me/threads', { media_type: 'TEXT', text, access_token: token });
  const published = await call('/me/threads_publish', { creation_id: container.id, access_token: token });
  return { id: published.id };
}

export const requiredEnv = ['THREADS_ACCESS_TOKEN'];
