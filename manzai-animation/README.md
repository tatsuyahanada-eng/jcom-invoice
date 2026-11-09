# 漫才アニメーション（サンプル）

台本とキャラクター画像から作った、約3分12秒・30fpsの切り絵風アニメーションです。

- `index.html` … ブラウザで開くと再生できます（同じフォルダに `audio.m4a` を置くと音付き）。
- `anim.js` … 描画本体。背景（赤×金のステージ）、キャラクター、字幕、カメラ、演出。
- `timeline.js` … セリフ・ツッコミ・エクササイズ・カット割りのタイミング（`tools/build_timeline.py` が生成）。
- `sprites/` … 提供いただいた画像から切り抜いたキャラクター素材。
- `tools/render.mjs` … mp4 への書き出し（Playwright + ffmpeg）。

```
python3 tools/build_timeline.py audio16k.wav      # タイミングを直したら再生成
node tools/render.mjs out.mp4 audio.m4a           # 全編を書き出し
node tools/render.mjs out.mp4 audio.m4a 86 96     # 86〜96秒だけ書き出し
```

音声と書き出した動画は著作物を含むためリポジトリには入れていません。
