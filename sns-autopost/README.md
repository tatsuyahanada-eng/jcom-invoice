# SNS 自動投稿ツール（アプリ開発の受注用）

PWA / Android アプリ（APK）の開発受注につなげるため、**毎日1本**、SNS に投稿文を自動で作って投稿するツールです。
GitHub Actions で毎日 20:07（日本時間）に動きます。

- ニュース・トレンドの見出しや季節の話題をヒントに「こんなアプリが作れる」「こんなアプリがあったらいいね」を投稿
- 自分の開発事例を、**公開してよい情報だけ**で紹介
- 投稿の最後は必ず **DM への誘導**
- 投稿前に自動チェック（文字数・非公開の固有名詞・誇大表現・ニュース見出しの丸写し・URL）。不合格なら投稿しません

投稿先: **X / Threads / Bluesky**（どれか1つからでも可）。投稿先を設定しなければ下書きを作るだけになります。

---

## 1週間の投稿パターン

| 曜日 | 投稿タイプ | 内容 |
|---|---|---|
| 月・木 | `trend_idea` トレンド × アプリ案 | 最近のニュースの流れから「こんなアプリが作れる」 |
| 火・金 | `case_study` 開発事例 | `data/cases.json` の事例を順番に紹介（同じ事例は10日間あけて使う） |
| 水・日 | `wish_app` あったらいいね | 季節の行事・日常の困りごとから「こんなアプリがあったら」 |
| 土 | `tips` 豆知識 | PWA と APK の違い、社内配布、小さく試作する進め方など |

曜日の割り当ては `config/profile.json` の `schedule` で変えられます（0=日曜〜6=土曜）。

---

## 初期設定

### 1. API キーを用意する

| 用途 | 必要なもの | 取得先 |
|---|---|---|
| 投稿文の生成（必須） | Claude API キー | https://console.anthropic.com/ |
| X に投稿 | API Key / Secret、Access Token / Secret（**Read and Write** 権限） | https://developer.x.com/ のプロジェクト設定 |
| Threads に投稿 | 長期アクセストークン（`threads_basic`, `threads_content_publish`） | Meta for Developers で Threads アプリを作成 |
| Bluesky に投稿 | ハンドル（例 `xxx.bsky.social`）とアプリパスワード | Bluesky の 設定 → プライバシーとセキュリティ → アプリパスワード |

> X API は料金プランや無料枠の条件がよく変わります。毎日1投稿が使っているプランの範囲に収まるか、developer portal で確認してください。
> Threads の長期トークンは 60 日で切れるので、期限前に更新して Secret を差し替えてください。

### 2. GitHub に登録する

リポジトリの **Settings → Secrets and variables → Actions** で設定します。

**Secrets**（値は暗号化されます）

```
ANTHROPIC_API_KEY
SNS_BLOCKED_TERMS                                                    … 任意。投稿に出してはいけない顧客名など（カンマ区切り）
X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET   … X を使う場合
THREADS_ACCESS_TOKEN                                                 … Threads を使う場合
BLUESKY_HANDLE / BLUESKY_APP_PASSWORD                                … Bluesky を使う場合
```

**Variables**

| 名前 | 例 | 説明 |
|---|---|---|
| `PUBLISH_PLATFORMS` | `x,threads` | 投稿先。未設定なら下書きのみ |
| `SNS_MODE` | `review` | `review` にすると、毎日の自動実行は下書き作成だけにして、確認後に手動で投稿する |

### 3. 動かしてみる

1. **Actions → SNS 毎日投稿 → Run workflow** で `command` に `generate` を選んで実行
2. 実行結果の Summary に下書きが表示され、`sns-autopost/posts/日付.json` にコミットされます
3. 内容に問題なければ `command: publish` で実行すると投稿されます

> スケジュール実行は **デフォルトブランチ（main）にこのワークフローがマージされてから**動き始めます。

---

## 運用の流れ

### おすすめ: 最初の2週間は「確認してから投稿」

1. `SNS_MODE` を `review` にする → 毎日 20:07 に下書きだけ作られる
2. GitHub アプリ等で `posts/日付.json` を確認。直したいときは `x_text` / `long_text` を編集してコミット
3. Actions で `command: check`（再チェック）→ `command: publish`（投稿）

品質に慣れてきたら `SNS_MODE` を消す（または `auto`）と、生成から投稿まで全自動になります。
全自動でも、チェックに通らなかった日は投稿されず、ワークフローが失敗表示になって GitHub から通知が届きます。

### ローカルで試す

```bash
cd sns-autopost
npm install
cp .env.example .env            # ANTHROPIC_API_KEY を記入
node --env-file=.env src/index.js generate --dry-run              # 今日の下書きを表示だけ
node --env-file=.env src/index.js generate --dry-run --type case_study
npm test
```

---

## 開発事例の追加（`data/cases.json`）

事例投稿は **ここに書いた内容だけ** を根拠に作られます。AI がそれ以上の事実や数字を足さないよう指示し、チェックでも確認しています。

```json
{
  "id": "英数字の識別子",
  "publishable": true,
  "title": "事例のタイトル",
  "platform": "PWA / Android アプリ など",
  "client": "顧客の匿名表現（例: 地方の建設会社 / 自社開発）",
  "problem": "導入前の困りごと",
  "solution": "作ったもの",
  "features": ["機能1", "機能2"],
  "tech": ["使った技術"],
  "results": "実測の効果（例: 月末の集計作業が2時間→10分）。無ければ空のまま",
  "notes": "投稿時の注意点"
}
```

初期データとして、これまでに作ったアプリ（経費精算フォーム、音声文字起こし、ネット調査、せどりチェッカー、FX シグナル、店舗 ID ツール、大相撲ガイド）を **匿名化して** 入れてあります。
内容を確認し、出したくないものは `publishable` を `false` にしてください。タスク管理ツールは内容未確認のため `false` にしてあります。

### 著作権・守秘のルール（ツールが守っていること）

| ルール | どう守っているか |
|---|---|
| 顧客名・ブランド名を出さない | `profile.json` の `blockedTerms` に入れた語を含む投稿は自動で不合格 |
| ニュース記事を転載しない | 取得するのは見出しだけ（本文は取得しない）。見出しと12文字以上一致したら不合格。媒体名・企業名も書かないよう指示 |
| 数字や効果を作らない | 事例の `results` が空なら数値表現に警告 |
| 誇大広告をしない | 「必ず儲かる」「No.1」などを自動で不合格 |
| 不適切な話題に乗らない | アダルト・ギャンブル・事件事故・災害・選挙などの見出しは最初から除外 |
| 外部リンクを貼らない | `allowedUrls` に登録した URL 以外は不合格 |

**画像・スクリーンショットは自動投稿しません。** 実績画面を載せたいときは、顧客情報やデモデータ以外が写っていないか確認したうえで手動で投稿してください。

新しい顧客の名前・社名・ブランド名が出てきたら `blockedTerms` に追加してください。
**このリポジトリは公開設定です。** 公開の場に書きたくない名前は、ファイルではなく Secret `SNS_BLOCKED_TERMS`（カンマ区切り）に登録してください。`cases.json` や `posts/` も誰でも読めるので、公開してよい内容だけを書いてください。

---

## DM を受けるための SNS 運用体制

ツールは「毎日の発信」を担当します。DM につなげるために、アカウント側で次の準備をしてください。

### プロフィール（例）

```
AIを使って業務アプリ・スマホアプリを作っています
📱 PWA（ホーム画面に追加できるWebアプリ）/ Androidアプリ
📝 Excel・紙の業務をスマホで完結
⚡ 小さく試作 → 数日〜数週間で形に
「こんなの作れる？」DMでお気軽に📩 相談無料
```

- **DM を開放する**: X は 設定 → プライバシーと安全 → ダイレクトメッセージ で「すべてのユーザー」から受け付ける
- プロフィールのリンク欄には事例をまとめたページ（ポートフォリオ）があると成約率が上がります

### 固定ポスト（例）

```
はじめまして。AIを使って業務アプリを作っています。

こんな相談、受けています👇
・Excelや紙の作業をスマホで済ませたい
・現場で使う社内アプリが欲しい（ストア公開なしでOK）
・文字起こし・要約などAIを業務に組み込みたい

作ったもの：経費精算フォーム／音声文字起こし／ネット診断アプリ など

「うちでもできる？」の段階で大丈夫です。DMください📩
```

### DM が来たときの返信テンプレート

```
ご連絡ありがとうございます！
差し支えなければ、次の3点を教えてください。
1. 今どんな作業に困っているか（例: 毎月の集計に時間がかかる）
2. 使う人と端末（例: 現場スタッフ5人・Androidスマホ）
3. ご希望の時期とご予算感（未定でも大丈夫です）
内容を見て、作り方の案と概算をお返しします。
```

### 毎日やること（5分）

1. 通知・DM を確認して返信（24時間以内が目安）
2. 投稿への返信・引用には一言お礼やコメントを返す
3. 反応が良かった投稿のテーマをメモ → `config/profile.json` やネタ（`data/seasonal.json`）に反映

### 週に1回

- 反応の良い投稿タイプを見て、`schedule` の配分を調整
- 新しく作ったアプリを `data/cases.json` に追加

---

## ファイル構成

```
sns-autopost/
├── config/profile.json   アカウント設定（人物像・サービス・CTA・ハッシュタグ・NGワード・曜日割り当て）
├── data/cases.json       開発事例（公開してよい情報だけ）
├── data/seasonal.json    月ごとの季節ネタ
├── data/history.json     投稿履歴（重複防止・事例ローテーション用。自動更新）
├── posts/                日ごとの下書き・投稿結果（自動更新）
├── src/
│   ├── index.js          コマンド（generate / publish / daily / check）
│   ├── planner.js        今日の投稿タイプ・事例・CTA を決める
│   ├── sources.js        ニュース・トレンドの見出し取得（RSS）
│   ├── generator.js      Claude API で投稿文を生成（チェック不合格なら書き直し）
│   ├── compliance.js     投稿前チェック
│   ├── textlen.js        X の文字数カウント
│   └── publishers/       X / Threads / Bluesky への投稿
└── test/                 テスト（npm test）
```

## 費用の目安

- Claude API: 1投稿あたり数円〜十数円程度（月 数百円程度）
- GitHub Actions: 公開リポジトリは無料、非公開でも無料枠内に収まる量
- SNS の API: X は契約プラン次第。Threads / Bluesky は無料
