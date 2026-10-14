// Bluesky (AT Protocol) への投稿。ハッシュタグはタップできるよう facet を付ける。

const PDS = 'https://bsky.social/xrpc';

async function xrpc(method, body, jwt) {
  const res = await fetch(`${PDS}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bluesky ${method} ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// facet の位置は UTF-8 のバイト単位で指定する
export function hashtagFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  for (const m of text.matchAll(/#([^\s#]+)/g)) {
    const byteStart = enc.encode(text.slice(0, m.index)).length;
    const byteEnd = byteStart + enc.encode(m[0]).length;
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
    });
  }
  return facets;
}

export async function postToBluesky(text, env = process.env) {
  const session = await xrpc('com.atproto.server.createSession', {
    identifier: env.BLUESKY_HANDLE,
    password: env.BLUESKY_APP_PASSWORD,
  });
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    langs: ['ja'],
    createdAt: new Date().toISOString(),
    facets: hashtagFacets(text),
  };
  const res = await xrpc(
    'com.atproto.repo.createRecord',
    { repo: session.did, collection: 'app.bsky.feed.post', record },
    session.accessJwt,
  );
  const rkey = res.uri.split('/').pop();
  return { id: res.uri, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}

export const requiredEnv = ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'];
