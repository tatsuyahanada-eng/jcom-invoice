# jcom-invoice

## Today's Jobs（`todays-jobs/`）の配布ルール

`todays-jobs/`（Webアプリ）と `todays-jobs/android/`（WebViewでラップするAndroidアプリ）を変更したら、
ユーザーは**毎回APKをダウンロードして実機で確認する**。次の形を守ること。

- APKのファイル名は必ず **`today'sjobs.apk`**（アポストロフィ入り。ユーザー指定）。
- ビルドは GitHub Actions（`.github/workflows/build-apk.yml`）が行う。`todays-jobs/**` を push すると自動で走る。
  このコンテナは `dl.google.com` へ出られず、Android SDK が使えないため、ここではビルドしない。
- 成果物の置き場所:
  1. Release タグ `apk-latest`（常に最新1件。スマホから直接ダウンロードしやすい）
  2. Actions の成果物 `todays-jobs-apk`（zipの中に `today'sjobs.apk`）
- 変更を push したら、ワークフローの成功を確認し、**ダウンロード先（Releaseページ / 実行ページのURL）をユーザーに毎回伝える**。
  失敗したらジョブログを読んで直す。
- 署名鍵は `todays-jobs/android/app/todaysjobs.jks` を固定で使う（個人の社内利用向け。上書きインストールできるようにするため）。
  versionCode は Actions の実行番号で自動的に増える。
