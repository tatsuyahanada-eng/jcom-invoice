// X (旧Twitter) API v2 への投稿。OAuth 1.0a User Context で署名する（外部ライブラリ不要）。

import crypto from 'node:crypto';

const ENDPOINT = 'https://api.x.com/2/tweets';

function pct(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function oauthHeader({ method, url, consumerKey, consumerSecret, token, tokenSecret, nonce, timestamp }) {
  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce ?? crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  };
  // JSON ボディは署名対象外。クエリパラメータもないので oauth_* のみで署名する
  const paramString = Object.keys(params).sort().map((k) => `${pct(k)}=${pct(params[k])}`).join('&');
  const base = [method.toUpperCase(), pct(url), pct(paramString)].join('&');
  const key = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  params.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
  return 'OAuth ' + Object.keys(params).sort().map((k) => `${pct(k)}="${pct(params[k])}"`).join(', ');
}

export async function postToX(text, env = process.env) {
  const auth = oauthHeader({
    method: 'POST',
    url: ENDPOINT,
    consumerKey: env.X_API_KEY,
    consumerSecret: env.X_API_SECRET,
    token: env.X_ACCESS_TOKEN,
    tokenSecret: env.X_ACCESS_TOKEN_SECRET,
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X API ${res.status}: ${JSON.stringify(body)}`);
  return { id: body.data.id, url: `https://x.com/i/web/status/${body.data.id}` };
}

export const requiredEnv = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'];
