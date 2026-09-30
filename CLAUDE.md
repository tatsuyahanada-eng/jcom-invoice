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
- 見た目は、ユーザーが提示した参考画像（CASE BY CASE）のダークHUD調で統一する: シルバー基調（**背景は明るいシルバー #D3D7DB**＋薄いグリッド、文字・主色はスチール系の濃いグレー #36414C。彩度を落とした無彩色寄りで統一。黒背景には戻さない。蛍光シアン/青緑は他アプリで使用済みのため使わない）／黄色（強調・主ボタン。文字に使う金色は #7A5800）、
  等幅フォントのラベル、四隅にブラケットのあるパネル、色分けした上部タブ（通常＝シルバー塗り）、破線ボタン。
- アプリアイコンは、シルバー（#D0D2D4）を光沢ハイライトで光らせた、中央に置いたカレンダー風の図柄のみ（ガンメタルの丸角四角の上。TJ・カバン・チェック等は入れない）
  （`todays-jobs/icon.png` / `icon-192.png`、Androidは `android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png`＋背景色 `navy`）。
  アプリ内のタイトルの左にもこのアイコンを表示。複雑な図柄には戻さない。

## カレンダー連携の方針（Today's Jobs）
- 多くの人が使う前提で、Androidアプリの標準は「端末のカレンダー（CalendarContract）から読み込む」。Googleログイン・Google Cloud設定・審査が不要なため。
- Googleログイン（Android認可/ウェブのクライアントID）は任意の代替手段として残す。
- 取り込むカレンダーは、端末・Googleどちらも「カレンダーごとにチェックして選ぶ」方式（複数選択可。例：その他業務、くらしのマーケット）。複数カレンダーの場合、案件カードにカレンダー名のチップを出す。
- WebViewでは `confirm()` が動かないため、確認は自作ダイアログ（`askDialog` / `askConfirm`）を使う。
- 取り込み済みの日に「読み込み」を押すと、確認ポップアップを出す（上書き取り込み／入力内容を残して更新のみ／キャンセル）。
