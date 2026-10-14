import * as x from './x.js';
import * as threads from './threads.js';
import * as bluesky from './bluesky.js';

// 各 SNS に渡す本文: X は短い版、それ以外は長い版
export const PUBLISHERS = {
  x: { post: x.postToX, requiredEnv: x.requiredEnv, field: 'x_text' },
  threads: { post: threads.postToThreads, requiredEnv: threads.requiredEnv, field: 'long_text' },
  bluesky: { post: bluesky.postToBluesky, requiredEnv: bluesky.requiredEnv, field: 'long_text' },
};

export function parsePlatforms(value) {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((name) => {
      if (!PUBLISHERS[name]) throw new Error(`未対応の投稿先: ${name}（x / threads / bluesky）`);
      return name;
    });
}
