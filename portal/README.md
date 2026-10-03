# WorkBase Portal

現地作業のファイル取得・手順確認・チェックシートをまとめた業務ポータル（PWA）。

- `index.html` … アプリ本体（1ファイル）
- `manifest.webmanifest` / `icons/` … ホーム画面へのインストール用
- `sw.js` … オフライン対応（アプリ本体をキャッシュ）

PWA のインストールとオフライン動作には HTTPS（または localhost）での配信が必要です。
ローカル確認: `cd portal && python3 -m http.server 8000` → http://localhost:8000/
