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

## デザイン方針（Today's Jobs）
- 見た目は、ユーザーが提示した参考画像（CASE BY CASE）のダークHUD調で統一する: 濃紺の背景＋薄いグリッド、プラチナ（銀青 #C5D3DF。主色。蛍光シアン/緑は他アプリで使用済みのため使わない）／黄色（強調・主ボタン）、
  等幅フォントのラベル、四隅にブラケットのあるパネル、色分けした上部タブ（通常＝プラチナ塗り）、破線ボタン。
- アプリアイコンはユーザー指定の画像（カレンダー＋書類＋カバン）。右下に小さく「TJ」を入れている（`todays-jobs/icon.png`、
  Androidは `android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png`）。アプリ内のタイトルの左にもアイコン、右に小さな「TJ」を表示。
