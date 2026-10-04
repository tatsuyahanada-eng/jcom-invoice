# WorkBase Portal

現地作業のファイル取得・手順確認・チェックシートをまとめた業務ポータル（PWA）。
チェックシートの作業記録は、サーバー（PHP + MySQL）に保存して共有し、あとから振り返れます。

```
portal/
  index.html            アプリ本体（1ファイル）
  manifest.webmanifest  ホーム画面へのインストール用
  sw.js                 オフライン対応（アプリ本体をキャッシュ。/api/ はキャッシュしない）
  icons/                ロゴ・アプリアイコン
  api/                  作業記録のサーバー側（PHP）
    index.php           API 本体
    lib.php             共通処理（DB接続・検証）
    schema.sql          テーブル定義
    migrate.php         テーブル作成（--seed でデモデータ）
    config.sample.php   接続設定のひな形
```

## 動作環境

- PHP 8.1 以上（`pdo_mysql`、`mbstring`）
- MySQL 5.7 以上 / 8.x、または MariaDB 10.3 以上（文字コードは utf8mb4）
- HTTPS で配信（PWA のインストールとオフライン動作に必要）

## サーバーの設置

1. データベースとユーザーを作る

   ```sql
   CREATE DATABASE workbase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'workbase'@'localhost' IDENTIFIED BY '強いパスワード';
   GRANT SELECT, INSERT, UPDATE, DELETE ON workbase.* TO 'workbase'@'localhost';
   ```
   テーブルを作る間だけ `CREATE` 権限も必要です（`ALL` を付けて作成後に外してもかまいません）。

2. 接続設定を書く

   ```
   cp portal/api/config.sample.php portal/api/config.php   # 接続情報を書き換える
   ```
   `config.php` は Git に含めません。環境変数（`WB_DB_HOST` / `WB_DB_PORT` / `WB_DB_NAME` / `WB_DB_USER` / `WB_DB_PASS`）でも指定できます。

3. テーブルを作る（コマンドラインから）

   ```
   php portal/api/migrate.php            # テーブル作成
   php portal/api/migrate.php --seed     # 確認用のデモ記録 40 件を追加（本番では使わない）
   ```
   コマンドラインが使えない場合は、`api/schema.sql` を phpMyAdmin などでそのまま実行してください。

4. `portal` フォルダごとサーバーに置く。

画面を開くと、サーバーに接続できているかが「作業記録」の上部に表示されます。

## 保護すること

- **ログイン**：`api/` は、サイトに設定している Basic 認証などの配下に置いてください。認証されたユーザー名（`REMOTE_USER`）が、記録の `auth_user` に保存されます。画面で入力する「作業者」は自己申告です。
- **Apache**：`api/.htaccess` が `config.php`・`lib.php`・`schema.sql`・`migrate.php` を外から読めないようにしています（`AllowOverride` が有効な場合）。
- **Nginx など**：同じファイルを拒否する設定を自分で追加してください。

  ```nginx
  location ~ ^/portal/api/(config\.php|config\.sample\.php|lib\.php|migrate\.php|schema\.sql)$ { deny all; }
  ```
- **書き込み**：記録の登録は、同一サイトから送る `X-Requested-With: WorkBase` ヘッダーが必須です（他サイトからの送信を防ぐため）。SQL は、すべてプリペアドステートメントです。
- **更新・削除**：記録は登録のみで、画面からは変更・削除できません。

## API

| メソッド | 呼び出し | 内容 |
|---|---|---|
| GET | `api/?r=health` | 接続確認 |
| POST | `api/?r=records` | 作業記録の登録。同じ `id` を再送しても二重登録されません |
| GET | `api/?r=records` | 一覧（`q` `task` `worker` `status=ok\|skipped` `from` `to` `limit` `offset`） |
| GET | `api/?r=records/{id}` | 詳細（項目ごとのチェック結果つき） |
| GET | `api/?r=stats&days=90` | 集計（`days=0` ですべて） |
| GET | `api/?r=export` | CSV（一覧と同じ絞り込み） |

## 送信の仕組み

チェックシートの完了時に、記録はまず端末に保存され、その場で送信されます。通信できないときは「未送信」として端末に残り、通信が戻ると（またはアプリを開き直したときに）自動で送信されます。

## PWA（アプリとして使う）

スマホのブラウザのメニューから「ホーム画面に追加」（iPhone は共有ボタンから）。画面を更新して配信するときは、`sw.js` 先頭の `VERSION` を上げてください。

## ローカルでの確認

```
WB_DB_PASS=パスワード php -S localhost:8000 -t portal
```
http://localhost:8000/ を開きます。
