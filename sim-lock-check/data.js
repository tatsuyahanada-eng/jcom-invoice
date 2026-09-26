/* =========================================================
   SIMロックチェックツール データ定義
   - 機種を追加するときは DEVICES に1件追加するだけでOK
   - ship: free=ロックなし出荷 / locked=ロックあり出荷 / cond=購入時期などで解除済の可能性 / rule=発売日・購入日で判定
   - 情報は 2026年9月時点の現場用リファレンスをもとに作成。最新は各社公式で確認すること
   ========================================================= */

/* mark: バッジに表示する短い符号（実ロゴ画像は権利上使用できないため、
   ブランドカラー＋イニシャルの統一サイズバッジで代用。正式ロゴ画像を
   使用できる場合は clogo() のCSS/マークアップを差し替えれば入れ替え可能）
   color: シックな配色に合わせて各社のブランドカラーを落ち着いたトーンに
   寄せた近似色（正式なカラーコードではない） */
const CARRIERS = {
  docomo:  { name: "ドコモ",        short: "docomo",  net: "docomo", color: "#a4234a", mark: "d" },
  au:      { name: "au",            short: "au",      net: "au",     color: "#b56a25", mark: "au" },
  sb:      { name: "ソフトバンク",  short: "SB",      net: "sb",     color: "#4a4f57", mark: "SB" },
  rakuten: { name: "楽天モバイル",  short: "楽天",    net: "rakuten",color: "#8c3b2a", mark: "R" },
  uq:      { name: "UQモバイル",    short: "UQ",      net: "au",     color: "#9c4a7e", mark: "UQ" },
  ymobile: { name: "ワイモバイル",  short: "Y!",      net: "sb",     color: "#9c2f68", mark: "Y!" },
  free:    { name: "SIMフリー",     short: "フリー",  net: null,     color: "#3f7a5e", mark: "SF" }
};

/* キャリアごとのSIMロック解除・照会情報 */
const UNLOCK = {
  docomo: {
    rules: [
      "2021/8/27以降に発売された機種はSIMロックなしで販売",
      "それ以前の機種でも、2020/8/19以降に一括 or クレジットカード払いで購入したものは解除済で渡されている場合あり",
      "2015/4以前発売の機種は解除非対応の場合あり（ドコモは一部対応）"
    ],
    how: [
      "IMEI（*#06#）を控える",
      "My docomo（Web）またはドコモショップで「SIMロック解除」を手続き（IMEIを入力）",
      "Android：他社SIMを挿すと「SIMロック解除コード」入力画面 → 手続きで得たコードを入力して解除",
      "iPhone：他社SIMを挿してWi-Fi接続・再起動 → 設定で「SIMロックなし」を確認"
    ],
    mechanism: "手続き後、他社SIMを挿すと解除コード入力画面 → 入力で解除。画面が出る＝未解除。",
    inquiry: "My docomo／ドコモショップ（IMEIで照会）",
    links: [
      { label: "ドコモ SIMロック解除（公式）", url: "https://www.docomo.ne.jp/support/unlock_simcard/" },
      { label: "ドコモ ネットワーク利用制限 確認（IMEI判定）", url: "http://nw-restriction.nttdocomo.co.jp/top.php" }
    ]
  },
  au: {
    rules: [
      "2021/10/1以降に発売された機種はSIMロックなしで販売",
      "My au の「SIMロック解除可否」欄で状態を確認できる"
    ],
    how: [
      "IMEI（*#06#）を控える",
      "My au またはauショップで「SIMロック解除」を手続き",
      "Android：解除コードは無し。Wi-Fi接続して設定の「状態の更新」で解除情報をダウンロード → 表示が「許可」になればOK",
      "iPhone：Wi-Fi接続して再起動 → 設定で「SIMロックなし」を確認"
    ],
    mechanism: "コード無し。Wi-Fi接続＋「状態の更新」で解除情報をダウンロード → 表示が「許可」になればOK。",
    inquiry: "My au「SIMロック解除可否」欄／auショップ",
    links: [
      { label: "au SIMロック解除（公式）", url: "https://www.au.com/support/service/mobile/procedure/simcard/unlock/" }
    ]
  },
  uq: {
    rules: [
      "au（KDDI）と同じ基準：2021/10/1以降に発売された機種はSIMロックなしで販売",
      "2026/8/19以降、UQ側の設定変更で解除手続きが不要になる端末が順次拡大中（公式ページで最新を確認）",
      "au回線網のため、povo・au系MVNOのSIMでは判定できない"
    ],
    how: [
      "IMEI（*#06#）を控える",
      "My UQ mobile またはUQスポット／au Style等で「SIMロック解除」を手続き",
      "Android：Wi-Fi接続して設定の「状態の更新」→ 表示が「許可」になればOK（au版と同じ仕組み）",
      "iPhone：Wi-Fi接続して再起動 → 設定で「SIMロックなし」を確認"
    ],
    mechanism: "au版と同じ。コード無し、Wi-Fi接続＋「状態の更新」で反映。",
    inquiry: "My UQ mobile／UQスポット（IMEIで照会）",
    links: [
      { label: "UQモバイル SIMロック解除（公式）", url: "https://www.uqwimax.jp/mobile/support/procedure/simcard/unlock/" }
    ]
  },
  sb: {
    rules: [
      "2021/5/12以降の購入分は解除済で渡し（発売日でなく購入日が基準）",
      "2021/10/1以降に発売された機種はSIMロックなしで販売"
    ],
    how: [
      "IMEI（*#06#）を控える",
      "My SoftBank（IMEI入力）またはショップで解除コードを発行",
      "Android：他社SIMを挿すと解除コード入力画面 → 発行されたコードを入力（Pixelのみサーバ判定でコード不要）",
      "iPhone：他社SIMを挿してWi-Fi接続・再起動 → 設定で「SIMロックなし」を確認"
    ],
    mechanism: "他社SIM挿入で解除コード入力（Pixelのみサーバ判定）。画面が出る＝未解除。",
    inquiry: "My SoftBank（IMEI入力）／ソフトバンクショップ",
    links: [
      { label: "ソフトバンク SIMロック解除（公式）", url: "https://www.softbank.jp/mobile/support/usim/unlock_procedure/" }
    ]
  },
  ymobile: {
    rules: [
      "ソフトバンクと同じ基準：2021/5/12以降の購入分は解除済で渡し",
      "2021/10/1以降に発売された機種はSIMロックなしで販売"
    ],
    how: [
      "IMEI（*#06#）を控える",
      "My Y!mobile またはワイモバイルショップで解除コードを発行",
      "Android：他社SIMを挿すと解除コード入力画面 → コードを入力",
      "iPhone：他社SIMを挿してWi-Fi接続・再起動 → 設定で「SIMロックなし」を確認"
    ],
    mechanism: "ソフトバンクと同じ。他社SIM挿入で解除コード入力。画面が出る＝未解除。",
    inquiry: "My Y!mobile／ワイモバイルショップ（IMEIで照会）",
    links: [
      { label: "ワイモバイル SIMロック解除（公式）", url: "https://www.ymobile.jp/support/procedure/simlock_unlock/" }
    ]
  },
  rakuten: {
    rules: ["楽天モバイルで販売された機種は全機種SIMロックなし"],
    how: ["解除手続きは不要"],
    mechanism: "全機種ロックなし。確認不要。",
    inquiry: "確認不要",
    links: []
  },
  free: {
    rules: ["Apple Store／Google Store／メーカー直販／家電量販店のSIMフリー版はロックなし"],
    how: ["解除手続きは不要"],
    mechanism: "ロックなし。確認不要。",
    inquiry: "確認不要",
    links: []
  }
};

/* メーカー（OS）ごとの確認方法 */
/* 確認手順のナビゲーション（パンくず表示用の構造化データ）
   steps: タップしていくメニュー名の配列 / target: 最後に見る項目名（「」付きで強調表示）
   label: 複数手順がある場合の見出し（機種名など） / note: 操作の補足（スクロール等、手順そのものではない注記） */
const P = (steps, target, note) => ({ steps, target, note });

const MAKERS = {
  iphone: {
    name: "iPhone（Apple）", os: "ios",
    path: P(["設定", "一般", "情報"], "SIMロック", "画面を下にスクロールすると表示されます（iOS 14以降）"),
    ok: "SIMロックなし ＝ 解除済／SIMフリー",
    ng: "SIMロックあり ＝ ロック中",
    notes: [
      "解除直後は反映待ちのことがある → Wi-Fiに接続して再起動、他社SIMを挿して再確認",
      "iOS 13以前は項目が無い → iOSを更新するか他社SIMで確認",
      "iPhone 13以降は全キャリアでロックなし販売",
      "ロック中に他社SIMを挿すと「SIMはサポートされていません」「有効なSIMではありません」と表示"
    ],
    codes: ["*#06#", "iphone-none"]
  },
  pixel: {
    name: "Google Pixel", os: "android",
    path: P(["設定", "システム", "開発者向けオプション"], "OEMロック解除", "スイッチがグレー表示＝ロックあり。見るだけでONにしない"),
    ok: "スイッチが操作できる ＝ ロックなし",
    ng: "スイッチがグレー＋「携帯通信会社によってロックされている端末では利用できません」＝ ロックあり",
    notes: [
      "開発者向けオプションが無い場合：設定 →「デバイス情報」→「ビルド番号」を7回タップすると表示される",
      "判定はGoogleサーバ参照 → Wi-Fiに接続して確認（未接続だと誤表示あり）",
      "Google Store版・Pixel 6以降は原則ロックなし。要注意はキャリア版 Pixel 3〜5a"
    ],
    codes: ["*#06#", "pixel-none"]
  },
  xperia: {
    name: "Xperia（ソニー）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）", "SIMのステータス"], "SIMロックステータス"),
    ok: "許可されています ＝ 解除済",
    ng: "許可されていません ＝ ロック中",
    notes: [
      "解除手続き後に未反映なら「SIMロック解除状態の更新」をタップ（Wi-Fi必須）",
      "SIMフリー版は項目自体が無いことがある（＝ロックなし）"
    ],
    codes: ["*#06#", "*#*#7378423#*#*"]
  },
  galaxy: {
    name: "Galaxy（サムスン）", os: "android",
    path: P(["設定", "端末情報", "ステータス情報"], "SIMロックの状態"),
    ok: "許可 ＝ 解除済",
    ng: "許可されていません／制限 ＝ ロック中",
    notes: [
      "未反映なら「SIMカードの状態を更新」→ ダウンロード → 再起動（au版はWi-Fi必須）",
      "機種によって「ステータス」「SIMカードステータス」と表記が異なる"
    ],
    codes: ["*#06#", "*#7465625#"]
  },
  aquos: {
    name: "AQUOS（シャープ）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス", "ドコモ／ソフトバンク／Y!mobile版の場所"),
    pathBy: {
      au: P(["設定", "システム", "端末情報"], "SIMロックの状態"),
      uq: P(["設定", "システム", "端末情報"], "SIMロックの状態")
    },
    ok: "許可 ＝ 解除済",
    ng: "許可されていません ＝ ロック中",
    notes: [
      "ドコモ／SB版は項目が無いことも → 他社SIMを挿して解除コード入力画面が出るかで判定",
      "楽天・SIMフリー版（sense4 lite 等）は元からロックなし"
    ],
    codes: ["*#06#"]
  },
  kyocera: {
    name: "京セラ（BASIO・かんたんスマホ・DIGNO・TORQUE）", os: "android",
    /* 機種ごとの正確な場所は各DEVICESエントリのpath/pathsで上書きする（BASIO4/BASIO3等）。
       ここはそれらを持たない機種（DIGNO・TORQUE・BASIO active等）向けの一般的な目安 */
    path: P(["設定", "端末情報"], "SIMカードの状態", "機種により「その他の設定」の中や、ツール→設定の階層になっている場合がある（BASIOシリーズ等）"),
    ok: "許可 ＝ 解除済",
    ng: "許可されていません ＝ ロック中",
    notes: [
      "解除後は同じ画面の「状態の更新」で反映（Wi-Fi接続）",
      "BASIOは設定が「かんたん」メニューのため「その他の設定」の中に隠れている",
      "「SIMのステータス」（電波・番号）とは別項目。「SIMカードの状態」を開く",
      "かんたんスマホ（Y!mobile）・DIGNO（SB）は他社SIM挿入時の解除コード入力画面で判定"
    ],
    codes: ["*#06#"]
  },
  oppo: {
    name: "OPPO", os: "android",
    path: P(["設定", "端末情報", "SIMカードのステータス"], "SIMカードロックステータス"),
    ok: "許可 ＝ 解除済",
    ng: "許可されていません ＝ ロック中",
    notes: [
      "要確認はキャリア版（au・UQ・Y!mobile）だけ",
      "SIMフリー版・楽天版はすべてロックなし（型番が CPH〜 ならSIMフリー版）",
      "Y!mobile版は項目が無いことあり → 他社SIMで解除コード画面の有無を確認"
    ],
    codes: ["*#06#"]
  },
  xiaomi: {
    name: "Xiaomi（Redmi・Mi）", os: "android",
    path: P(["設定", "デバイス情報", "すべての仕様", "デバイスの状態"], "SIMカードのステータス", "階層が深いので注意"),
    ok: "許可 ＝ 解除済",
    ng: "許可されていません ＝ ロック中",
    notes: [
      "ロック状態・「SIMのステータス更新」はここ",
      "SB版 Redmi Note 9T（A001XM）：他社SIMで解除コード入力画面＝ロック中。My SoftBankでIMEIからコード発行",
      "国内SIMフリー版（Redmi Note 9S／10 Pro 等）はロックなし"
    ],
    codes: ["*#06#", "*#*#7465625#*#*"]
  },
  fcnt: {
    name: "arrows・らくらくスマートフォン（FCNT）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス"),
    ok: "他社SIMでアンテナが立つ ＝ 解除済",
    ng: "他社SIMで「SIMロック解除コード」入力画面 ＝ ロック中",
    notes: [
      "ドコモ版は画面上に表示が無い機種が多い → 他社SIMテストで判定",
      "らくらくスマートフォンはドコモショップでIMEI照会するのが早い"
    ],
    codes: ["*#06#"]
  },
  huawei: {
    name: "HUAWEI", os: "android",
    path: P(["プロジェクトメニュー", "ネットワーク設定"], "SIMロック状態照会", "先に電話アプリで「*#*#2846579#*#*」を入力してメニューを開く"),
    ok: "SIMLOCK_DEACTIVE ＝ フリー",
    ng: "NW_LOCKED ＝ ロック中",
    notes: ["EMUI機種のみ。反応しない場合は他社SIMテストで判定"],
    codes: ["*#06#", "*#*#2846579#*#*"]
  },
  android: {
    name: "その他のAndroid", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: [
      "「SIMロック状態」「SIMロックステータス」などの項目を探す",
      "OPPO・Xiaomi・motorola等は国内SIMフリー版中心 → 項目なし＝ロックなしが多い",
      "表示が無い機種は他社SIMテスト → 販売キャリアへIMEI照会で判定"
    ],
    codes: ["*#06#", "*#*#7465625#*#*", "*#*#4636#*#*"]
  },
  garaho: {
    name: "ガラホ（Android系ケータイ）", os: "garaho",
    path: P(["メニュー", "設定"], "端末情報", "「その他設定」の中に「端末情報」がある機種もある"),
    ok: "他社SIMでアンテナが立ち、通話・SMSができる ＝ 解除済",
    ng: "「SIMロック解除コード（ネットワークロック解除PIN）を入力」画面 ＝ ロック中",
    notes: [
      "機種により「SIMロック」項目あり。無い機種が多いので過信しない",
      "確実なのは他社回線SIMテスト：電源OFF → 他社SIM挿入 → 電源ON",
      "ロック中はAPN設定がグレーで選べないのも目安",
      "3Gガラケーは各社3G停波で実用不可 → 確認不要"
    ],
    codes: ["*#06#"]
  }
};

/* ダイヤルコード */
const CODES = {
  "*#06#": { target: "全機種共通（iPhone・Android・ガラホ）", show: "IMEI（製造番号）を表示。キャリアへの照会・解除手続きに必須", note: "発信ボタン不要" },
  "*#*#7465625#*#*": { target: "一部Android（MediaTek系・旧機種など）", show: "「SIMロック」画面：各項目が「ロック解除されています」＝解除済／「ロックされています」＝ロック中", note: "国内キャリア版は反応しないことが多い" },
  "*#7465625#": { target: "Galaxy（主に海外版）", show: "「Network Lock」[OFF]＝フリー／[ON]＝ロック中", note: "ドコモ／au版は無効化されている場合あり" },
  "*#*#7378423#*#*": { target: "Xperia", show: "サービスメニュー ＞ Service info ＞ Simlock（機種によりConfiguration）でロック状態を表示", note: "新しい機種ほど項目が無い傾向" },
  "*#*#2846579#*#*": { target: "HUAWEI", show: "プロジェクトメニュー ＞ ネットワーク設定 ＞ SIMロック状態照会：SIMLOCK_DEACTIVE＝フリー／NW_LOCKED＝ロック中", note: "EMUI機種" },
  "*#*#4636#*#*": { target: "Android全般", show: "テスト情報（電話番号・電波・ネットワーク種別）。SIMロック判定には使えない", note: "Galaxy等は非対応あり" },
  "iphone-none": { label: "（なし）", target: "iPhone", show: "SIMロックを確認するダイヤルコードは存在しない → 設定 ＞ 一般 ＞ 情報 で確認", note: "*3001#12345#* はフィールドテスト（電波詳細のみ）" },
  "pixel-none": { label: "（なし）", target: "Pixel", show: "ロック状態を出すコードは基本的に非対応 → 開発者向けオプション「OEMロック解除」で判断", note: "Wi-Fi接続して確認" }
};

/* 機種データ
   c: キャリア / code: 型番 / rel: 発売（おおよそ） / ship: 出荷時の状態 / note: 個別メモ */
const DEVICES = [
  // ---------- iPhone ----------
  { id: "iphone-6s-7", name: "iPhone 6s / 7 / SE（第1世代）", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2015〜16年", ship: "locked" },
      { c: "au", rel: "2015〜16年", ship: "locked" },
      { c: "sb", rel: "2015〜16年", ship: "locked" },
      { c: "ymobile", rel: "2018年〜（Y!販売）", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "uq", rel: "2018年〜（UQ販売）", ship: "locked" }
    ], note: "iOS 14以上に更新できない機種は設定に「SIMロック」項目が出ない → 他社SIMテストで判定" },
  { id: "iphone-8-x", name: "iPhone 8 / 8 Plus / X", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2017年", ship: "locked" },
      { c: "au", rel: "2017年", ship: "locked" },
      { c: "sb", rel: "2017年", ship: "locked" },
      { c: "uq", rel: "2019年〜（UQ販売）", ship: "locked" },
      { c: "ymobile", rel: "2019年〜（Y!販売）", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "iphone-xs-xr", name: "iPhone XS / XS Max / XR", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2018年", ship: "locked" },
      { c: "au", rel: "2018年", ship: "locked" },
      { c: "sb", rel: "2018年", ship: "locked" }
    ] },
  { id: "iphone-11", name: "iPhone 11 / 11 Pro / 11 Pro Max", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2019年9月", ship: "locked" },
      { c: "au", rel: "2019年9月", ship: "locked" },
      { c: "sb", rel: "2019年9月", ship: "locked" }
    ] },
  { id: "iphone-se2", name: "iPhone SE（第2世代）", maker: "iphone", kana: "アイフォン SE2",
    variants: [
      { c: "docomo", rel: "2020年5月", ship: "locked" },
      { c: "au", rel: "2020年5月", ship: "locked" },
      { c: "sb", rel: "2020年5月", ship: "locked" },
      { c: "uq", rel: "2020年", ship: "locked" },
      { c: "ymobile", rel: "2020年〜", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "iphone-12", name: "iPhone 12 / 12 mini / 12 Pro / 12 Pro Max", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2020年10月", ship: "locked" },
      { c: "au", rel: "2020年10月", ship: "locked" },
      { c: "sb", rel: "2020年10月", ship: "locked" }
    ] },
  { id: "iphone-13", name: "iPhone 13 / 13 mini / 13 Pro / 13 Pro Max", maker: "iphone", kana: "アイフォン",
    variants: [
      { c: "docomo", rel: "2021年9月", ship: "free" },
      { c: "au", rel: "2021年9月", ship: "free" },
      { c: "sb", rel: "2021年9月", ship: "free" },
      { c: "rakuten", rel: "2021年9月", ship: "free" },
      { c: "free", rel: "2021年9月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-se3", name: "iPhone SE（第3世代）", maker: "iphone", kana: "アイフォン SE3",
    variants: ["docomo", "au", "sb", "rakuten", "uq", "ymobile", "free"].map(c => ({ c, rel: "2022年3月", ship: "free" })) },
  { id: "iphone-14plus", name: "iPhone 14〜17 シリーズ / iPhone 16e", maker: "iphone", kana: "アイフォン 14 15 16 17 16e Air",
    variants: ["docomo", "au", "sb", "rakuten", "uq", "ymobile", "free"].map(c => ({ c, rel: "2022年〜", ship: "free" })) },

  // ---------- Pixel ----------
  { id: "pixel-3", name: "Pixel 3 / 3 XL / 3a / 3a XL", maker: "pixel", kana: "ピクセル グーグル",
    variants: [
      { c: "docomo", rel: "2018〜19年", ship: "locked" },
      { c: "sb", rel: "2018〜19年", ship: "locked" },
      { c: "free", rel: "2018〜19年", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-4", name: "Pixel 4 / 4 XL / 4a / 4a (5G)", maker: "pixel", kana: "ピクセル グーグル",
    variants: [
      { c: "sb", rel: "2019〜20年", ship: "locked" },
      { c: "au", rel: "2020年（4a 5G）", ship: "locked" },
      { c: "free", rel: "2019〜20年", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-5", name: "Pixel 5 / 5a (5G)", maker: "pixel", kana: "ピクセル グーグル",
    variants: [
      { c: "au", rel: "2020年10月（5）", ship: "locked" },
      { c: "sb", rel: "2020〜21年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "free", rel: "2020〜21年", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-6plus", name: "Pixel 6 以降（6〜10 シリーズ・aシリーズ）", maker: "pixel", kana: "ピクセル グーグル 7 8 9 10 7a 8a 9a",
    variants: [
      { c: "au", rel: "2021年10月〜", ship: "free" },
      { c: "sb", rel: "2021年10月〜", ship: "free" },
      { c: "docomo", rel: "2023年〜（Pixel 8〜）", ship: "free" },
      { c: "free", rel: "2021年10月〜", ship: "free" }
    ] },

  // ---------- Xperia ----------
  { id: "xperia-10-ii", name: "Xperia 10 II", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-41A", rel: "2020年", ship: "locked" },
      { c: "au", code: "SOV43", rel: "2020年", ship: "locked" },
      { c: "ymobile", code: "A001SO", rel: "2020年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-10-iii", name: "Xperia 10 III", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-52B", rel: "2021年6月", ship: "locked" },
      { c: "au", code: "SOG04", rel: "2021年6月", ship: "locked" },
      { c: "ymobile", code: "A102SO", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-1-iii", name: "Xperia 1 III", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-51B", rel: "2021年7月", ship: "locked" },
      { c: "au", code: "SOG03", rel: "2021年7月", ship: "locked" },
      { c: "sb", code: "A101SO", rel: "2021年7月", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-new", name: "Xperia 10 IV 以降 / 1 IV 以降 / 5 IV 以降", maker: "xperia", kana: "エクスペリア",
    variants: ["docomo", "au", "sb", "uq", "ymobile", "rakuten", "free"].map(c => ({ c, rel: "2022年〜", ship: "free" })) },

  // ---------- Xperia（2015〜2020年 旧機種） ----------
  { id: "xperia-x-performance", name: "Xperia X Performance / X Compact", maker: "xperia", kana: "エクスペリア エックス",
    variants: [
      { c: "docomo", code: "SO-04H", rel: "2016年", ship: "locked" },
      { c: "au", code: "SOV33", rel: "2016年", ship: "locked" },
      { c: "sb", code: "502SO", rel: "2016年", ship: "locked" }
    ] },
  { id: "xperia-xz", name: "Xperia XZ / XZs", maker: "xperia", kana: "エクスペリア エックスゼット",
    variants: [
      { c: "docomo", code: "SO-01J／SO-03J", rel: "2016〜17年", ship: "locked" },
      { c: "au", code: "SOV34／SOV35", rel: "2016〜17年", ship: "locked" },
      { c: "sb", code: "601SO", rel: "2016年", ship: "locked" }
    ] },
  { id: "xperia-xz1", name: "Xperia XZ1 / XZ1 Compact", maker: "xperia", kana: "エクスペリア エックスゼットワン",
    variants: [
      { c: "docomo", code: "SO-01K", rel: "2017年", ship: "locked" },
      { c: "au", code: "SOV36", rel: "2017年", ship: "locked" }
    ] },
  { id: "xperia-xz2", name: "Xperia XZ2 / XZ2 Compact / XZ2 Premium", maker: "xperia", kana: "エクスペリア エックスゼットツー",
    variants: [
      { c: "docomo", code: "SO-03K／SO-05K", rel: "2018年", ship: "locked" },
      { c: "au", code: "SOV37／SOV38", rel: "2018年", ship: "locked" },
      { c: "sb", code: "702SO", rel: "2018年", ship: "locked" }
    ] },
  { id: "xperia-xz3", name: "Xperia XZ3", maker: "xperia", kana: "エクスペリア エックスゼットスリー",
    variants: [
      { c: "docomo", code: "SO-01L", rel: "2018年", ship: "locked" },
      { c: "au", code: "SOV39", rel: "2018年", ship: "locked" },
      { c: "sb", code: "801SO", rel: "2018年", ship: "locked" }
    ] },
  { id: "xperia-1", name: "Xperia 1", maker: "xperia", kana: "エクスペリア ワン",
    variants: [
      { c: "docomo", code: "SO-03L", rel: "2019年", ship: "locked" },
      { c: "au", code: "SOV40", rel: "2019年", ship: "locked" },
      { c: "sb", code: "802SO", rel: "2019年", ship: "locked" }
    ] },
  { id: "xperia-5", name: "Xperia 5", maker: "xperia", kana: "エクスペリア ファイブ",
    variants: [
      { c: "au", code: "SOV41", rel: "2019年", ship: "locked" },
      { c: "sb", code: "901SO", rel: "2019年", ship: "locked" }
    ] },
  { id: "xperia-ace", name: "Xperia Ace", maker: "xperia", kana: "エクスペリア エース",
    variants: [
      { c: "docomo", code: "SO-02L", rel: "2019年12月", ship: "locked" },
      { c: "ymobile", code: "A001SO（初代）", rel: "2020年", ship: "locked" }
    ] },
  { id: "xperia-8", name: "Xperia 8", maker: "xperia", kana: "エクスペリア エイト",
    variants: [
      { c: "sb", code: "902SO", rel: "2019年", ship: "locked" }
    ] },

  // ---------- Galaxy ----------
  { id: "galaxy-a21", name: "Galaxy A21", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", code: "SC-42A", rel: "2020年", ship: "locked" },
      { c: "au", code: "SCV49", rel: "2020年", ship: "locked" },
      { c: "uq", code: "SCV49", rel: "2020年", ship: "locked" }
    ] },
  { id: "galaxy-a32", name: "Galaxy A32 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [{ c: "au", code: "SCG08", rel: "2021年2月", ship: "locked" }] },
  { id: "galaxy-s21", name: "Galaxy S21 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", code: "SC-51B", rel: "2021年4月", ship: "locked" },
      { c: "au", code: "SCG09", rel: "2021年4月", ship: "locked" }
    ] },
  { id: "galaxy-a52", name: "Galaxy A52 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [{ c: "docomo", code: "SC-53B", rel: "2021年6月", ship: "locked" }] },
  { id: "galaxy-new", name: "Galaxy S22 以降 / A23 以降", maker: "galaxy", kana: "ギャラクシー",
    variants: ["docomo", "au", "uq", "rakuten", "free"].map(c => ({ c, rel: "2022年〜", ship: "free" })) },

  // ---------- Galaxy（2015〜2020年 旧機種） ----------
  { id: "galaxy-s7edge", name: "Galaxy S7 edge", maker: "galaxy", kana: "ギャラクシー エステブン",
    variants: [
      { c: "docomo", code: "SC-02H", rel: "2016年", ship: "locked" },
      { c: "au", code: "SCV33", rel: "2016年", ship: "locked" }
    ] },
  { id: "galaxy-s8", name: "Galaxy S8 / S8+", maker: "galaxy", kana: "ギャラクシー エスエイト",
    variants: [
      { c: "docomo", code: "SC-02J／SC-03J", rel: "2017年", ship: "locked" },
      { c: "au", code: "SCV36", rel: "2017年", ship: "locked" }
    ] },
  { id: "galaxy-note8", name: "Galaxy Note8", maker: "galaxy", kana: "ギャラクシー ノート",
    variants: [
      { c: "docomo", code: "SC-01K", rel: "2017年", ship: "locked" },
      { c: "au", code: "SCV37", rel: "2017年", ship: "locked" }
    ] },
  { id: "galaxy-s9", name: "Galaxy S9 / S9+", maker: "galaxy", kana: "ギャラクシー エスナイン",
    variants: [
      { c: "docomo", code: "SC-02K／SC-03K", rel: "2018年", ship: "locked" },
      { c: "au", code: "SCV38", rel: "2018年", ship: "locked" }
    ] },
  { id: "galaxy-note9", name: "Galaxy Note9", maker: "galaxy", kana: "ギャラクシー ノート",
    variants: [
      { c: "docomo", code: "SC-01L", rel: "2018年", ship: "locked" },
      { c: "au", code: "SCV40", rel: "2018年", ship: "locked" }
    ] },
  { id: "galaxy-s10", name: "Galaxy S10 / S10+", maker: "galaxy", kana: "ギャラクシー エステン",
    variants: [
      { c: "docomo", code: "SC-03L／SC-04L", rel: "2019年", ship: "locked" },
      { c: "au", code: "SCV41／SCV42", rel: "2019年", ship: "locked" }
    ] },
  { id: "galaxy-feel", name: "Galaxy Feel / Feel2", maker: "galaxy", kana: "ギャラクシー フィール",
    variants: [
      { c: "docomo", code: "SC-04J（Feel）／SC-02L（Feel2）", rel: "2017〜18年", ship: "locked" }
    ] },
  { id: "galaxy-a20", name: "Galaxy A20", maker: "galaxy", kana: "ギャラクシー エートゥエンティ",
    variants: [{ c: "docomo", code: "SC-02M", rel: "2019年", ship: "locked" }] },
  { id: "galaxy-a30", name: "Galaxy A30", maker: "galaxy", kana: "ギャラクシー エーサーティ",
    variants: [{ c: "rakuten", rel: "2019年", ship: "free" }] },
  { id: "galaxy-a41", name: "Galaxy A41", maker: "galaxy", kana: "ギャラクシー エーヨンジューイチ",
    variants: [
      { c: "docomo", code: "SC-41A", rel: "2020年", ship: "locked" },
      { c: "uq", rel: "2020年", ship: "locked" }
    ] },
  { id: "galaxy-a51-5g", name: "Galaxy A51 5G", maker: "galaxy", kana: "ギャラクシー エーゴジューイチ",
    variants: [{ c: "au", code: "SCG07", rel: "2020年", ship: "locked" }] },
  { id: "galaxy-a22-5g", name: "Galaxy A22 5G", maker: "galaxy", kana: "ギャラクシー エーニジュウニ",
    variants: [
      { c: "au", rel: "2021年", ship: "locked" },
      { c: "uq", rel: "2021年", ship: "locked" }
    ] },

  // ---------- AQUOS ----------
  { id: "aquos-sense3-basic", name: "AQUOS sense3 basic", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "au", code: "SHV48", rel: "2020年6月", ship: "locked" },
      { c: "uq", code: "SHV48", rel: "2020年", ship: "locked" }
    ] },
  { id: "aquos-sense4", name: "AQUOS sense4 / sense4 lite / sense4 basic", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-41A", rel: "2020年11月", ship: "locked" },
      { c: "ymobile", code: "A003SH（basic）", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "rakuten", code: "SH-RM15（lite）", rel: "2020年", ship: "free" },
      { c: "free", code: "SH-M15", rel: "2020年", ship: "free" }
    ] },
  { id: "aquos-sense5g", name: "AQUOS sense5G", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-53A", rel: "2021年2月", ship: "locked" },
      { c: "au", code: "SHG03", rel: "2021年2月", ship: "locked" },
      { c: "sb", code: "A004SH", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "aquos-r5g-r6", name: "AQUOS R5G / R6", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-51A／SH-51B", rel: "2020〜21年", ship: "locked" },
      { c: "au", code: "SHG01", rel: "2020年", ship: "locked" },
      { c: "sb", code: "908SH／A101SH", rel: "2020〜21年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "aquos-new", name: "AQUOS sense6 以降 / wish シリーズ / R7 以降", maker: "aquos", kana: "アクオス センス ウィッシュ",
    variants: ["docomo", "au", "sb", "uq", "ymobile", "rakuten", "free"].map(c => ({ c, rel: "2021年11月〜", ship: "free" })) },

  // ---------- AQUOS（2015〜2020年 旧機種） ----------
  { id: "aquos-r", name: "AQUOS R", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-03J", rel: "2017年", ship: "locked" },
      { c: "au", code: "SHV39", rel: "2017年", ship: "locked" }
    ] },
  { id: "aquos-r2", name: "AQUOS R2", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-03K", rel: "2018年", ship: "locked" },
      { c: "au", code: "SHV42", rel: "2018年", ship: "locked" },
      { c: "sb", code: "706SH", rel: "2018年", ship: "locked" }
    ] },
  { id: "aquos-r3", name: "AQUOS R3", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-04L", rel: "2019年", ship: "locked" },
      { c: "au", code: "SHV44", rel: "2019年", ship: "locked" },
      { c: "sb", code: "808SH", rel: "2019年", ship: "locked" }
    ] },
  { id: "aquos-sense", name: "AQUOS sense（初代）", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-01K", rel: "2017年", ship: "locked" },
      { c: "au", code: "SHV40", rel: "2018年", ship: "locked" },
      { c: "sb", code: "603SH", rel: "2018年", ship: "locked" }
    ] },
  { id: "aquos-sense2", name: "AQUOS sense2", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-01L", rel: "2018年", ship: "locked" },
      { c: "au", code: "SHV43", rel: "2018年", ship: "locked" }
    ] },
  { id: "aquos-sense3", name: "AQUOS sense3", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-02M", rel: "2019年", ship: "locked" },
      { c: "au", code: "SHV45", rel: "2019年", ship: "locked" },
      { c: "ymobile", code: "A004SH", rel: "2019年", ship: "locked" }
    ] },
  { id: "aquos-zeta", name: "AQUOS ZETA", maker: "aquos", kana: "アクオス ゼータ",
    variants: [
      { c: "docomo", code: "SH-01H／SH-04H", rel: "2015〜16年", ship: "locked" },
      { c: "au", code: "SHV32", rel: "2015年", ship: "locked" }
    ] },
  { id: "aquos-keitai", name: "AQUOSケータイ（ガラホ）", maker: "garaho", brand: "aquos", kana: "アクオス ケータイ ガラホ",
    variants: [
      { c: "docomo", code: "SH-02L", rel: "2019年", ship: "locked" },
      { c: "sb", code: "805SH（AQUOSケータイ3）", rel: "2019年", ship: "locked", note: "My SoftBankでIMEI照会も可" }
    ] },

  // ---------- 京セラ ----------
  { id: "basio4", name: "BASIO4", maker: "kyocera", kana: "ベイシオ シニア",
    path: P(["その他の設定", "デバイス情報"], "SIMカードの状態"),
    variants: [
      { c: "au", code: "KYV47", rel: "2020年", ship: "locked" },
      { c: "uq", code: "KYV47", rel: "2020年", ship: "locked" }
    ] },
  { id: "basio3", name: "BASIO3", maker: "kyocera", kana: "ベイシオ シニア",
    path: P(["ツール", "設定", "端末情報"], "SIMカードの状態"),
    variants: [{ c: "au", code: "KYV43", rel: "2018年", ship: "locked" }] },
  { id: "basio2", name: "BASIO2", maker: "kyocera", kana: "ベイシオ シニア",
    variants: [{ c: "au", code: "KYV39", rel: "2017年", ship: "locked" }] },
  { id: "basio", name: "BASIO（初代）", maker: "kyocera", kana: "ベイシオ シニア",
    variants: [{ c: "au", code: "KYV32", rel: "2016年", ship: "locked" }] },
  { id: "basio-active", name: "BASIO active / active2", maker: "kyocera", kana: "ベイシオ アクティブ シニア",
    variants: [
      { c: "au", rel: "2019〜21年", ship: "locked", note: "防水・耐衝撃タイプのBASIO。設定 ＞ システム ＞ 端末情報 ＞「SIMロックの状態」で確認" },
      { c: "uq", rel: "2019〜21年", ship: "locked" }
    ], note: "型番はショップ・本体裏面のシールで確認（KYV4x系）" },
  { id: "kantan-sumaho2", name: "かんたんスマホ2 / 2+", maker: "kyocera", kana: "かんたんスマホ シニア",
    variants: [{ c: "ymobile", code: "A001KC", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し。他社SIMで解除コード画面の有無を確認" }] },
  { id: "kantan-sumaho1", name: "かんたんスマホ（初代）", maker: "kyocera", kana: "かんたんスマホ シニア",
    variants: [{ c: "ymobile", code: "501KC", rel: "2016年", ship: "locked" }] },
  { id: "digno", name: "DIGNO A / E / G / J / SANGA", maker: "kyocera", kana: "ディグノ",
    variants: [
      { c: "au", rel: "2016〜19年", ship: "locked", note: "au向けDIGNOシリーズ全般。設定 ＞ 端末情報 ＞ ステータス情報 ＞「SIMロックの状態」で確認" },
      { c: "ymobile", rel: "2018〜19年", ship: "locked", note: "Y!mobile向け（DIGNO J等）" },
      { c: "sb", rel: "2018〜19年", ship: "locked", note: "ソフトバンク向け（DIGNO G等）他社SIM挿入で解除コード画面の有無を確認" }
    ] },
  { id: "torque-g03", name: "TORQUE G03 / G04", maker: "kyocera", kana: "トルク",
    variants: [{ c: "au", rel: "2018〜19年", ship: "locked" }] },
  { id: "torque-5g", name: "TORQUE 5G", maker: "kyocera", kana: "トルク",
    variants: [{ c: "au", code: "KYG01", rel: "2021年", ship: "locked" }] },
  { id: "gratina", name: "GRATINA（ガラホ）", maker: "garaho", brand: "kyocera", kana: "グラティーナ ガラホ",
    variants: [{ c: "au", code: "KYF39", rel: "2019年", ship: "locked", note: "他社SIM挿入でアンテナが立つか／My auで「SIMロック解除可否」確認" }] },
  { id: "digno-keitai3", name: "DIGNOケータイ3（ガラホ）", maker: "garaho", brand: "kyocera", kana: "ディグノ ケータイ ガラホ",
    variants: [{ c: "sb", code: "903KC", rel: "2019年", ship: "locked", note: "My SoftBankでIMEI照会も可" }] },

  // ---------- OPPO ----------
  { id: "oppo-a54", name: "OPPO A54 5G", maker: "oppo", kana: "オッポ",
    variants: [
      { c: "au", code: "OPG02", rel: "2021年6月", ship: "locked" },
      { c: "uq", code: "OPG02", rel: "2021年6月", ship: "locked" }
    ] },
  { id: "oppo-reno3a", name: "OPPO Reno3 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", rel: "2020年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "rakuten", rel: "2020年", ship: "free" },
      { c: "free", code: "CPH2013", rel: "2020年", ship: "free" }
    ] },
  { id: "oppo-reno5a", name: "OPPO Reno5 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", code: "A101OP", rel: "2021年6月", ship: "cond", note: "2021/5/12以降の購入なら解除済で渡し。他社SIMで確認" },
      { c: "rakuten", rel: "2021年6月", ship: "free" },
      { c: "free", code: "CPH2199", rel: "2021年6月", ship: "free" }
    ] },
  { id: "oppo-a73", name: "OPPO A73", maker: "oppo", kana: "オッポ",
    variants: [
      { c: "rakuten", rel: "2020年", ship: "free" },
      { c: "free", code: "CPH2099", rel: "2020年", ship: "free" }
    ] },
  { id: "oppo-a5-2020", name: "OPPO A5 2020", maker: "oppo", kana: "オッポ エーファイブ",
    variants: [{ c: "au", code: "OPG01", rel: "2019年", ship: "locked" }] },
  { id: "oppo-a55s", name: "OPPO A55s 5G", maker: "oppo", kana: "オッポ エーゴジューゴ",
    variants: [{ c: "au", rel: "2021年", ship: "locked" }, { c: "uq", rel: "2021年", ship: "locked" }] },

  // ---------- Xiaomi ----------
  { id: "redmi-note-9t", name: "Redmi Note 9T", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [{ c: "sb", code: "A001XM", rel: "2021年2月", ship: "locked", note: "他社SIMで解除コード入力画面＝ロック中。My SoftBankでIMEIからコード発行" }] },
  { id: "redmi-9t", name: "Redmi 9T", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [
      { c: "rakuten", rel: "2021年", ship: "free" },
      { c: "uq", rel: "2021年", ship: "locked" }
    ] },
  { id: "redmi-note-10-je", name: "Redmi Note 10 JE", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [
      { c: "au", code: "XIG02", rel: "2021年8月", ship: "free", note: "解除済みの状態で出荷（au取説に記載）" },
      { c: "uq", code: "XIG02", rel: "2021年8月", ship: "free", note: "解除済みの状態で出荷" }
    ] },
  { id: "redmi-free", name: "Redmi Note 9S / 10 Pro ほか国内SIMフリー版", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [{ c: "free", rel: "2020年〜", ship: "free" }] },

  // ---------- FCNT ----------
  { id: "arrows-be4plus", name: "arrows Be4 Plus", maker: "fcnt", kana: "アローズ",
    variants: [{ c: "docomo", code: "F-41B", rel: "2021年", ship: "locked" }] },
  { id: "raku-f42a", name: "らくらくスマートフォン", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [{ c: "docomo", code: "F-42A", rel: "2020年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }] },
  { id: "arrows-we", name: "arrows We", maker: "fcnt", kana: "アローズ",
    variants: [
      { c: "docomo", code: "F-51B", rel: "2021年12月", ship: "free" },
      { c: "au", code: "FCG01", rel: "2021年12月", ship: "free" },
      { c: "sb", code: "A101FC", rel: "2021年12月", ship: "free" }
    ] },

  // ---------- arrows（2015〜2020年 旧機種） ----------
  { id: "arrows-be", name: "arrows Be / Be3", maker: "fcnt", kana: "アローズ ビー",
    variants: [
      { c: "docomo", code: "F-04K（Be）／F-02L（Be3）", rel: "2018〜19年", ship: "locked" }
    ] },
  { id: "arrows-nx", name: "arrows NX", maker: "fcnt", kana: "アローズ エヌエックス",
    variants: [
      { c: "docomo", code: "F-01J／F-02H", rel: "2016〜17年", ship: "locked" }
    ] },
  { id: "raku-f04j", name: "らくらくスマートフォン me", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [{ c: "docomo", code: "F-01L", rel: "2019年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }] },
  { id: "raku-4", name: "らくらくスマートフォン4", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [{ c: "docomo", code: "F-04K", rel: "2018年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }] },
  { id: "arrows-5g", name: "arrows 5G", maker: "fcnt", kana: "アローズ",
    variants: [{ c: "docomo", code: "F-51A", rel: "2020年", ship: "locked" }] },
  { id: "arrows-u", name: "arrows U", maker: "fcnt", kana: "アローズ ユー",
    variants: [{ c: "ymobile", code: "801FJ", rel: "2020年", ship: "locked" }] },
  { id: "arrows-m-simfree", name: "arrows M04 / M05（SIMフリー版）", maker: "fcnt", kana: "アローズ エム シムフリー",
    variants: [{ c: "free", rel: "2017〜19年", ship: "free", note: "富士通コネクテッドテクノロジーズのSIMフリー端末。ロックなし" }] },

  // ---------- HUAWEI ----------
  { id: "huawei-p20lite", name: "HUAWEI P20 lite", maker: "huawei", kana: "ファーウェイ",
    variants: [
      { c: "au", code: "HWV32", rel: "2018年", ship: "locked" },
      { c: "ymobile", rel: "2018年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "free", code: "ANE-LX2J", rel: "2018年", ship: "free" }
    ] },

  // ---------- 楽天オリジナル ----------
  { id: "rakuten-hand", name: "Rakuten Hand / Hand 5G / Mini / BIG", maker: "android", kana: "楽天 ラクテン ハンド",
    variants: [{ c: "rakuten", rel: "2020〜22年", ship: "free", note: "Rakuten Mini・Hand はeSIMのみ" }] },

  // ---------- 汎用（機種が見つからない時） ----------
  ...["iphone", "pixel", "xperia", "galaxy", "aquos", "kyocera", "oppo", "xiaomi", "fcnt", "android", "garaho"].map(m => ({
    id: "generic-" + m, generic: true, maker: m,
    name: "その他の " + (m === "android" ? "Android" : m === "garaho" ? "ガラホ" : MAKERS[m].name) + " 機種",
    kana: "その他 汎用",
    variants: ["docomo", "au", "sb", "uq", "ymobile", "rakuten", "free"].map(c => ({ c, rel: "—", ship: "rule" }))
  }))
];

/* キャリアメール持ち運び */
const MAIL = {
  docomo: {
    ok: true, title: "ドコモメール持ち運び",
    addresses: ["@docomo.ne.jp"],
    place: "My docomo（dアカウントが必要）",
    account: "dアカウントID（ドコモメールアドレス、または任意の文字列）とパスワード。MNP前に必ず確認",
    pay: "クレジットカード",
    deadline: "ドコモ回線解約後31日以内",
    fee: "月額料金あり（日割りなし）。初回申込から31日間無料（1回線目のみ）。最新の金額は公式で確認",
    apply: [
      "公式ページ『ドコモ回線解約後に申込む方法』から手続き",
      "または My docomo にログイン ＞ お手続き ＞ おすすめサービス ＞「ドコモメール持ち運び」"
    ],
    cautions: [
      "回線契約にもとづき発行したdアカウントのIDを持っていること",
      "回線契約名義が法人契約ではないこと",
      "回線契約の新規申込から一定期間が経過していること",
      "ドコモメールアプリが使えなくなるため、IMAP設定ができる別のメールアプリに設定する",
      "MNP転出前・後どちらでも申込可。転出後のみ申込可能なキャリアもあるため、転出後に統一するのがおすすめ"
    ],
    iphone: {
      app: "iPhone標準の「メール」アプリ",
      steps: [
        "専用のプロファイルをダウンロードして設定する",
        "ドコモメールアドレスの種類によりダウンロードするプロファイルが異なる",
        "公式「iPhone・iPadでドコモメールを使う」の『3. iPhoneドコモメール利用設定』を参照（注意事項もよく確認）"
      ],
      link: { label: "iPhone・iPadでドコモメールを使う", url: "https://www.docomo.ne.jp/service/docomo_mail/ios/use/" }
    },
    android: {
      app: "Gmailアプリ（希望がなければ）",
      steps: [
        "ドコモメールアプリはそのまま利用できない",
        "MNP切替後はドコモメールアプリを開くこともできなくなり、保存したメールも見られなくなる → 必要なメールは事前に退避",
        "公式『ドコモメールアプリ以外のメールアプリ、メールソフトでのご利用設定』を参照してIMAP設定"
      ],
      link: { label: "その他のメールアプリからのご利用", url: "https://www.docomo.ne.jp/service/docomo_mail/other/" }
    },
    links: [
      { label: "ドコモメール持ち運び（公式）", url: "https://www.docomo.ne.jp/service/docomo_mail_portability/" },
      { label: "料金に関するFAQ（公式）", url: "https://www.docomo.ne.jp/faq/detail?faqId=429948" },
      { label: "申込〜設定の解説動画（非公式・約11分）", url: "https://www.youtube.com/watch?v=yGJbc3AFHSM" }
    ],
    entries: [
      { label: "申込ページ（公式）", url: "https://www.docomo.ne.jp/service/docomo_mail_portability/" },
      { label: "料金・注意事項（公式FAQ）", url: "https://www.docomo.ne.jp/faq/detail?faqId=429948" }
    ]
  },
  au: {
    ok: true, title: "auメール持ち運び",
    addresses: ["@ezweb.ne.jp", "@au.com"],
    ng: ["@uqmobile.jp（UQモバイルメール）", "@xxx.biz.ezweb.ne.jp／@xxx.biz.au.com（ビジネスメール）"],
    place: "My au（au IDが必要）",
    account: "au ID（携帯電話番号、または任意の文字列）とパスワード。MNP前に必ず確認",
    pay: "クレジットカード",
    deadline: "au解約後31日以内",
    fee: "月額料金あり。最新の金額は公式で確認",
    apply: [
      "公式ページ『ご利用開始までの流れ』を見ながら申込",
      "申込の流れの中でそのままメール設定もできる"
    ],
    cautions: [
      "au回線契約にもとづき発行したau IDを持っていること",
      "迷惑メールフィルターは初期化される（要再設定）",
      "メールアプリではなくメッセージアプリでメールを見ていた場合、古いメールを閲覧できなくなる可能性あり",
      "@ezweb.ne.jp から @au.com に変更していた場合、持ち運び後は @au.com 宛てしか受信できなくなる"
    ],
    iphone: {
      app: "iPhone標準の「メール」アプリ",
      steps: [
        "専用のプロファイルをダウンロードして設定する",
        "公式サイトに画像での手順説明は無い → au公式の解説動画を参照"
      ],
      link: { label: "auメール持ち運び ご注意事項", url: "https://www.au.com/mobile/service/aumail_portability/notice/" }
    },
    android: {
      app: "auメールアプリ（継続利用できる）",
      steps: [
        "auメールアプリは再設定後そのまま利用できる（ドコモと違う点）",
        "申込の流れで設定する場合は公式ページの【3】から参照"
      ],
      link: { label: "auメール持ち運び各種設定（Android）", url: "https://www.au.com/support/service/mobile/email/aumailapp_portability/" }
    },
    links: [
      { label: "auメール持ち運び（公式）", url: "https://www.au.com/mobile/service/aumail_portability/" },
      { label: "au公式動画：iPhoneからの申込", url: "https://www.youtube.com/watch?v=-5YYlArui1E" },
      { label: "au公式動画：Androidからの申込", url: "https://www.youtube.com/watch?v=b4NdkA_F5Rw" },
      { label: "au公式動画：Gmailでの利用方法", url: "https://www.youtube.com/watch?v=9IDsuOD2JEQ" }
    ],
    entries: [
      { label: "申込ページ（公式）", url: "https://www.au.com/mobile/service/aumail_portability/" },
      { label: "ご注意事項（公式）", url: "https://www.au.com/mobile/service/aumail_portability/notice/" }
    ]
  },
  sb: {
    ok: true, title: "ソフトバンク メールアドレス持ち運び",
    addresses: ["Eメール(i)：@i.softbank.jp", "MMS：@softbank.ne.jp", "@●.vodafone.ne.jp", "@jp-●.ne.jp", "@disney.ne.jp", "@y-mobile.ne.jp", "@willcom.com", "@pdx.ne.jp"],
    place: "My SoftBank（SoftBank IDが必要）",
    account: "SoftBank ID（任意 or ランダム生成の文字列）とパスワード。本来は携帯番号だが、MNP後は文字列IDしか使えなくなり、MNP後にマイページで調べることもできない → 切替前に必ず確認",
    pay: "クレジットカード",
    deadline: "ソフトバンク回線解約後31日以内に My SoftBank から申込",
    fee: "1メールアドレスごとに月額料金。最新の金額は公式で確認",
    apply: ["公式『お申し込み方法』を参照して My SoftBank から申込"],
    cautions: [
      "持ち運び後の設定は「Eメール(i)かMMSか」×「iPhoneかAndroidか」で異なる",
      "メールボックス容量を超えると、古いメールから超えた分がまとめて削除される"
    ],
    iphone: {
      app: "iPhone標準の「メール」アプリ",
      steps: [
        "メールアドレスの種類（Eメール(i)／MMS）で設定方法が異なる",
        "公式ページのタブを「iPhone」に切り替えて手順を確認"
      ],
      link: { label: "設定方法 Eメール(i)", url: "https://www.softbank.jp/mobile/service/mail-address-portability/email-i/" }
    },
    android: {
      app: "ソフトバンク提供の持ち運び用公式メールアプリ",
      steps: [
        "Softbankメールアプリはそのまま利用できない",
        "メールアドレス持ち運び用の公式メールアプリを設定する",
        "公式ページのタブを「Android」に切り替えて手順を確認"
      ],
      link: { label: "設定方法 S!メール（MMS）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/mms/" }
    },
    links: [
      { label: "メールアドレス持ち運び（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/" },
      { label: "お申し込み方法（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/application/" },
      { label: "設定：Eメール(i) @i.softbank.jp", url: "https://www.softbank.jp/mobile/service/mail-address-portability/email-i/" },
      { label: "設定：S!メール（MMS）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/mms/" }
    ],
    entries: [
      { label: "申込ページ（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/application/" },
      { label: "サービス概要・注意事項（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/" }
    ]
  },
  ymobile: {
    ok: true, title: "ワイモバイル メールアドレス持ち運び",
    addresses: ["Y!mobileメール：@yahoo.ne.jp", "MMS：@ymobile.ne.jp", "@emobile-s.ne.jp", "@wcm.ne.jp", "@willcom.com", "@pdx.ne.jp", "@y-mobile.ne.jp"],
    place: "My SoftBank（SoftBank IDが必要）",
    account: "SoftBank ID（任意 or ランダム生成の文字列）とパスワード。MNP後は文字列IDしか使えず、後から調べられない → 切替前に必ず確認",
    pay: "クレジットカード",
    deadline: "回線解約後31日以内に My SoftBank から申込",
    fee: "1メールアドレスごとに月額料金。最新の金額は公式で確認",
    apply: ["公式『お申し込み方法』を参照して My SoftBank から申込"],
    cautions: [
      "持ち運び後の設定は「Y!mobileメールかMMSか」×「iPhoneかAndroidか」で異なる",
      "メールボックス容量を超えると、古いメールから超えた分がまとめて削除される",
      "端末を変えず Y!mobileメールアプリを使っていた場合は再設定不要で引き続き利用可"
    ],
    iphone: {
      app: "iPhone標準の「メール」アプリ",
      steps: [
        "My SoftBank にログイン（6桁の確認番号を求められる場合あり）＞「メール管理」",
        "「MMS（v）」＞「設定情報（+）」でメールアドレスとパスワードを確認",
        "設定 ＞ メール ＞ アカウント ＞ アカウントを追加 ＞ その他 ＞「メールアカウントを追加」",
        "名前（任意）・メール・パスワード・説明（任意）を入力して「次へ」",
        "「IMAP」を選び、受信 imap.softbank.ne.jp／送信 smtp.softbank.ne.jp、ユーザー名はメールアドレス",
        "「保存」→ メールアプリにアカウントが表示されれば完了"
      ],
      server: [["受信メールサーバ", "imap.softbank.ne.jp"], ["送信メールサーバ", "smtp.softbank.ne.jp"], ["ユーザー名", "確認したメールアドレス"], ["パスワード", "確認したパスワード"]],
      link: { label: "設定方法（MMS）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/mms/" }
    },
    android: {
      app: "Y!mobileメールアプリ（そのまま利用できる）",
      steps: [
        "My SoftBank ＞「メール管理」＞「MMS（v）」＞「設定情報（+）」でアドレスとパスワードを確認",
        "Y!mobileメールアプリをダウンロード",
        "アプリ左上のメニュー ＞ ▼ ＞「＋アカウントの追加」",
        "「MMS（メールアドレス持ち運び）」を選択",
        "確認したメールアドレスとパスワードを入力して「決定」で完了"
      ],
      link: { label: "設定方法（Y!mobileメール）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/ymobile-mail/" }
    },
    links: [
      { label: "ワイモバイル メールアドレス持ち運び（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/" },
      { label: "お申し込み方法（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/application/" },
      { label: "設定：Y!mobileメール @yahoo.ne.jp", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/ymobile-mail/" },
      { label: "設定：MMS", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/mms/" }
    ],
    entries: [
      { label: "申込ページ（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/application/" },
      { label: "サービス概要・注意事項（公式）", url: "https://www.softbank.jp/mobile/service/mail-address-portability/ymobile/" }
    ]
  },
  rakuten: {
    ok: true, title: "楽メール持ち運び",
    addresses: ["@rakumail.jp"],
    place: "my 楽天モバイル（Web版）※アプリからは申込不可",
    account: "楽天ユーザID（または楽天登録メールアドレス）とパスワード。MNP前に必ず確認",
    pay: "クレジットカード・口座振替・楽天ポイント",
    deadline: "楽天回線を解約した日を含めて31日間（楽天回線の契約中は申込不可＝MNP転出後に申込）",
    fee: "月額料金あり。最新の金額は公式で確認",
    apply: [
      "my 楽天モバイル（Web）にログイン",
      "「楽メール持ち運びのお申し込み」をタップ",
      "内容を確認し「申し込みを完了する」をタップ",
      "「ホームへ戻る」をタップして完了"
    ],
    cautions: [
      "契約中に楽メールのアカウントを所有していたこと",
      "Rakuten Linkアプリは使えない → 任意のメールアプリに登録が必要",
      "メールアドレスの変更・メールフィルター設定の変更はできない"
    ],
    server: [["IMAPサーバー", "mail.rakumail.jp ／ ポート 993 ／ TLS 1.2"], ["SMTPサーバー", "mail.rakumail.jp ／ ポート 465 ／ TLS 1.2"]],
    iphone: {
      app: "iPhone標準の「メール」アプリ",
      steps: [
        "設定 ＞ メール ＞ アカウント ＞ アカウントを追加 ＞ その他 ＞「メールアカウントを追加」",
        "名前（任意）・メールアドレス・パスワード・説明を入力",
        "「次へ」で自動検出。失敗したら下のサーバー情報を手入力"
      ],
      link: { label: "Apple：メールアカウントを追加する", url: "https://support.apple.com/ja-jp/102619" }
    },
    android: {
      app: "Gmailアプリ（希望がなければ）",
      steps: [
        "Gmailアプリを開き、右上のプロフィール写真をタップ",
        "「別のアカウントを追加」＞「その他」",
        "画面に沿って入力（下のサーバー情報を使用）"
      ],
      link: { label: "Gmail：メールアカウントを追加する", url: "https://support.google.com/mail/answer/6078445?hl=ja&co=GENIE.Platform%3DAndroid" }
    },
    links: [
      { label: "楽メール持ち運び（公式）", url: "https://network.mobile.rakuten.co.jp/service/rakumail-portability/" },
      { label: "申込・利用・解約方法（公式）", url: "https://network.mobile.rakuten.co.jp/guide/rakumail-portability/" }
    ],
    entries: [
      { label: "申込ページ（my 楽天モバイル）", url: "https://network.mobile.rakuten.co.jp/service/rakumail-portability/" },
      { label: "申込・利用・解約方法（公式）", url: "https://network.mobile.rakuten.co.jp/guide/rakumail-portability/" }
    ]
  },
  uq: {
    ok: false, title: "UQモバイルメール",
    addresses: ["@uqmobile.jp"],
    reason: "UQモバイルメール（@uqmobile.jp）は持ち運びサービスの対象外（2023年5月時点の資料）。auメール持ち運びの対象にも含まれない。",
    advice: [
      "MNP前に、よく使う連絡先へ新しいアドレスを伝えてもらう",
      "Gmail等のフリーメールへの切り替えを案内",
      "最新の提供状況はUQモバイル公式で確認"
    ]
  },
  free: {
    ok: null, title: "キャリアメールなし",
    reason: "SIMフリー端末そのものにキャリアメールは付いていない。持ち運びは「解約する旧キャリア」側のサービスで判断する（下の切替で旧キャリアを選択）。"
  }
};

/* 持ち運び不可の格安SIM（2023年5月時点） */
const MAIL_MVNO_NG = [
  ["OCNモバイルONE", "@×××.ocn.ne.jp"],
  ["BIGLOBE", "@×××.biglobe.ne.jp"],
  ["IIJmio", "@IIJmio-mail.jp、@miomio.jp"],
  ["mineo", "@mineo.jp"],
  ["NifMo", "@nifty.com"],
  ["UQモバイル", "@uqmobile.jp"]
];

const MAIL_COMMON = [
  "月額料金がかかり、旧キャリアから請求されることを説明",
  "旧キャリアのマイページID・パスワードがわかるか確認（不明ならヘルプデスクへ連絡）",
  "クレジットカードを持っているか確認（キャッシュカード・デビットカード不可。JCB・Master・VISA以外は使えない場合あり）",
  "メールボックス内の送受信データは消える可能性が高い",
  "キャリアメールの引き継ぎはMNP切替の後に実施する",
  "ID・パスワード・カード情報などの入力はお客さま自身に行ってもらう（作業者の代理入力はNG）"
];

const MAIL_FLOW = [
  ["引き継ぎが必要か確認", "オーダーされていても不要と言われたらヘルプデスクへ連絡"],
  ["注意事項を伝える", "月額料金がかかること、個人情報の入力は手伝えないこと"],
  ["必要なものを確認", "旧キャリアのマイページID/PW、クレジットカード"],
  ["MNP切り替え", "キャリアメール引き継ぎの前に実施"],
  ["専用サイトから申込", "旧キャリアごとの持ち運びページから申し込む"],
  ["送受信設定とテスト", "メールアプリを設定し、送信・受信テストを行う"]
];
