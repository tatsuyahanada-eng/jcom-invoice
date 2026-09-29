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
      "2021/6以降に発売された機種は原則SIMロックなしで販売（一部例外あり）",
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
  motorola: {
    name: "Motorola（モトローラ）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: [
      "国内はY!mobile等のキャリア版・SIMフリー版ともにロックなし販売が中心",
      "表示が無い機種は他社SIMテスト → 販売キャリアへIMEI照会で判定"
    ],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  zte: {
    name: "ZTE（Libero）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: [
      "LiberoシリーズはY!mobile向けが中心（型番 A〇〇〇ZT）",
      "2021/10以降に発売されたモデルはSIMロックなしで販売",
      "表示が無い機種は他社SIMテスト → 販売キャリアへIMEI照会で判定"
    ],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  asus: {
    name: "ASUS（Zenfone・ROG Phone）", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: ["国内はSIMフリー版の販売が中心 → ロックなし", "表示が無い機種は他社SIMテストで判定"],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  lg: {
    name: "LG Electronics", os: "android",
    path: P(["設定", "端末情報"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: ["国内向けの端末は2021年以前の販売のみ（LGは国内スマホ事業から撤退）", "ドコモ版は解除手続き後、他社SIMで解除コード入力画面の有無を確認"],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  tcl: {
    name: "TCL Communication", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: ["国内はSIMフリー版の販売が中心 → ロックなし"],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  balmuda: {
    name: "BALMUDA", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: ["ソフトバンク専売。2021/11/26発売でSIMロックなし（SIMフリー仕様）"],
    codes: ["*#06#", "*#*#4636#*#*"]
  },
  htc: {
    name: "HTC", os: "android",
    path: P(["設定", "デバイス情報（端末情報）"], "SIMのステータス／機器の状態", "見つからない場合は設定の検索窓に「SIMロック」と入力"),
    ok: "許可／解除済 ＝ ロックなし",
    ng: "許可されていません／ロック中 ＝ ロックあり",
    notes: ["国内はSIMフリー版の販売のみ → ロックなし"],
    codes: ["*#06#", "*#*#4636#*#*"]
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

/* メーカー一覧（メーカーで絞り込み用。表示順・表記は実機のメーカー選択画面に合わせる）
   k: キー / name: 表示名 / alias: 検索用の別名（カナ・英字・通称） */
const MFRS = [
  { k: "apple",     name: "Apple",             alias: "アップル アイフォン iphone" },
  { k: "asus",      name: "ASUS",              alias: "エイスース アスース zenfone rog" },
  { k: "fcnt",      name: "FCNT",              alias: "富士通 fujitsu arrows アローズ らくらく" },
  { k: "huawei",    name: "Huawei",            alias: "ファーウェイ ホーウェイ honor" },
  { k: "kyocera",   name: "KYOCERA",           alias: "京セラ basio digno torque" },
  { k: "lg",        name: "LG Electronics",    alias: "エルジー" },
  { k: "oppo",      name: "OPPO",              alias: "オッポ" },
  { k: "samsung",   name: "SAMSUNG",           alias: "サムスン ギャラクシー galaxy" },
  { k: "sharp",     name: "SHARP",             alias: "シャープ アクオス aquos" },
  { k: "sony",      name: "Sony Corporation",  alias: "ソニー sony エクスペリア xperia" },
  { k: "tcl",       name: "TCL Communication", alias: "ティーシーエル alcatel アルカテル" },
  { k: "xiaomi",    name: "Xiaomi",            alias: "シャオミ 小米 redmi レッドミー" },
  { k: "zte",       name: "ZTE Corporation",   alias: "ゼットティーイー libero リベロ" },
  { k: "balmuda",   name: "BALMUDA",           alias: "バルミューダ" },
  { k: "google",    name: "Google",            alias: "グーグル ピクセル pixel nexus ネクサス" },
  { k: "microsoft", name: "Microsoft",         alias: "マイクロソフト surface duo" },
  { k: "motorola",  name: "Motorola",          alias: "モトローラ moto モト razr" },
  { k: "htc",       name: "HTC",               alias: "エイチティーシー" },
  { k: "rakuten",   name: "Rakuten",           alias: "楽天 ラクテン hand mini big" },
  { k: "lenovo",    name: "Lenovo",            alias: "レノボ" },
  { k: "alt",       name: "ALT",               alias: "" },
  { k: "fsoft",     name: "富士ソフト",         alias: "fujisoft +f" },
  { k: "iodata",    name: "アイ・オー・データ機器", alias: "iodata アイオーデータ" },
  { k: "idy",       name: "IDY",               alias: "" }
];
/* 確認手順グループ（MAKERS）→ メーカー。機種ごとに mfr を持たせた場合はそちらを優先 */
const MAKER_MFR = {
  iphone: "apple", pixel: "google", xperia: "sony", galaxy: "samsung", aquos: "sharp", kyocera: "kyocera",
  oppo: "oppo", xiaomi: "xiaomi", fcnt: "fcnt", huawei: "huawei", motorola: "motorola", zte: "zte",
  asus: "asus", lg: "lg", tcl: "tcl", balmuda: "balmuda", htc: "htc"
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
  { id: "iphone-latest", name: "iPhone 上記以外の最新モデル（iPhone 18以降など）", maker: "iphone", kana: "アイフォン 18",
    variants: [
      { c: "docomo", rel: "2026年〜", ship: "free" },
      { c: "au", rel: "2026年〜", ship: "free" },
      { c: "sb", rel: "2026年〜", ship: "free" },
      { c: "uq", rel: "2026年〜", ship: "free" },
      { c: "ymobile", rel: "2026年〜", ship: "free" },
      { c: "rakuten", rel: "2026年〜", ship: "free" },
      { c: "free", rel: "2026年〜", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-17e", name: "iPhone 17e", maker: "iphone", kana: "アイフォン 17e",
    variants: [
      { c: "docomo", rel: "2026年3月", ship: "free" },
      { c: "au", rel: "2026年3月", ship: "free" },
      { c: "sb", rel: "2026年3月", ship: "free" },
      { c: "uq", rel: "2026年3月", ship: "free" },
      { c: "ymobile", rel: "2026年3月", ship: "free" },
      { c: "rakuten", rel: "2026年3月", ship: "free" },
      { c: "free", rel: "2026年3月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-17", name: "iPhone 17", maker: "iphone", kana: "アイフォン 17",
    variants: [
      { c: "docomo", rel: "2025年9月", ship: "free" },
      { c: "au", rel: "2025年9月", ship: "free" },
      { c: "sb", rel: "2025年9月", ship: "free" },
      { c: "uq", rel: "2025年9月", ship: "free" },
      { c: "ymobile", rel: "2025年9月", ship: "free" },
      { c: "rakuten", rel: "2025年9月", ship: "free" },
      { c: "free", rel: "2025年9月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-air", name: "iPhone Air", maker: "iphone", kana: "アイフォン エアー 17",
    variants: [
      { c: "docomo", rel: "2025年9月", ship: "free" },
      { c: "au", rel: "2025年9月", ship: "free" },
      { c: "sb", rel: "2025年9月", ship: "free" },
      { c: "uq", rel: "2025年9月", ship: "free" },
      { c: "rakuten", rel: "2025年9月", ship: "free" },
      { c: "free", rel: "2025年9月", ship: "free" }
    ] },
  { id: "iphone-17-pro", name: "iPhone 17 Pro", maker: "iphone", kana: "アイフォン 17 プロ",
    variants: [
      { c: "docomo", rel: "2025年9月", ship: "free" },
      { c: "au", rel: "2025年9月", ship: "free" },
      { c: "sb", rel: "2025年9月", ship: "free" },
      { c: "uq", rel: "2025年9月", ship: "free" },
      { c: "rakuten", rel: "2025年9月", ship: "free" },
      { c: "free", rel: "2025年9月", ship: "free" }
    ] },
  { id: "iphone-17-pro-max", name: "iPhone 17 Pro Max", maker: "iphone", kana: "アイフォン 17 プロ マックス",
    variants: [
      { c: "docomo", rel: "2025年9月", ship: "free" },
      { c: "au", rel: "2025年9月", ship: "free" },
      { c: "sb", rel: "2025年9月", ship: "free" },
      { c: "uq", rel: "2025年9月", ship: "free" },
      { c: "rakuten", rel: "2025年9月", ship: "free" },
      { c: "free", rel: "2025年9月", ship: "free" }
    ] },
  { id: "iphone-16e", name: "iPhone 16e", maker: "iphone", kana: "アイフォン 16e",
    variants: [
      { c: "docomo", rel: "2025年2月", ship: "free" },
      { c: "au", rel: "2025年2月", ship: "free" },
      { c: "sb", rel: "2025年2月", ship: "free" },
      { c: "uq", rel: "2025年2月", ship: "free" },
      { c: "ymobile", rel: "2025年2月", ship: "free" },
      { c: "rakuten", rel: "2025年2月", ship: "free" },
      { c: "free", rel: "2025年2月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-15", name: "iPhone 15", maker: "iphone", kana: "アイフォン 15",
    variants: [
      { c: "docomo", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" },
      { c: "sb", rel: "2023年9月", ship: "free" },
      { c: "uq", rel: "2023年9月", ship: "free" },
      { c: "rakuten", rel: "2023年9月", ship: "free" },
      { c: "free", rel: "2023年9月", ship: "free" },
      { c: "ymobile", rel: "2025年1月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-16", name: "iPhone 16", maker: "iphone", kana: "アイフォン 16",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "uq", rel: "2024年9月", ship: "free" },
      { c: "ymobile", rel: "2024年9月", ship: "free" },
      { c: "rakuten", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-16-plus", name: "iPhone 16 Plus", maker: "iphone", kana: "アイフォン 16 プラス",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "uq", rel: "2024年9月", ship: "free" },
      { c: "rakuten", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "iphone-16-pro", name: "iPhone 16 Pro", maker: "iphone", kana: "アイフォン 16 プロ",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "uq", rel: "2024年9月", ship: "free" },
      { c: "rakuten", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "iphone-16-pro-max", name: "iPhone 16 Pro Max", maker: "iphone", kana: "アイフォン 16 プロ マックス",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "uq", rel: "2024年9月", ship: "free" },
      { c: "rakuten", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "iphone-13", name: "iPhone 13", maker: "iphone", kana: "アイフォン 13",
    variants: [
      { c: "docomo", rel: "2021年9月", ship: "free" },
      { c: "au", rel: "2021年9月", ship: "free" },
      { c: "sb", rel: "2021年9月", ship: "free" },
      { c: "rakuten", rel: "2021年9月", ship: "free" },
      { c: "free", rel: "2021年9月", ship: "free" },
      { c: "ymobile", rel: "2023年11月", ship: "free" }
    ], note: "iPhone 13は4キャリアとも発売時（2021/9/24）からSIMロックなし。ワイモバイルは2023/11/15から取り扱い" },
  { id: "iphone-15-plus", name: "iPhone 15 Plus", maker: "iphone", kana: "アイフォン 15 プラス",
    variants: [
      { c: "docomo", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" },
      { c: "sb", rel: "2023年9月", ship: "free" },
      { c: "uq", rel: "2023年9月", ship: "free" },
      { c: "rakuten", rel: "2023年9月", ship: "free" },
      { c: "free", rel: "2023年9月", ship: "free" }
    ] },
  { id: "iphone-15-pro", name: "iPhone 15 Pro", maker: "iphone", kana: "アイフォン 15 プロ",
    variants: [
      { c: "docomo", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" },
      { c: "sb", rel: "2023年9月", ship: "free" },
      { c: "uq", rel: "2023年9月", ship: "free" },
      { c: "rakuten", rel: "2023年9月", ship: "free" },
      { c: "free", rel: "2023年9月", ship: "free" }
    ] },
  { id: "iphone-15-pro-max", name: "iPhone 15 Pro Max", maker: "iphone", kana: "アイフォン 15 プロ マックス",
    variants: [
      { c: "docomo", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" },
      { c: "sb", rel: "2023年9月", ship: "free" },
      { c: "uq", rel: "2023年9月", ship: "free" },
      { c: "rakuten", rel: "2023年9月", ship: "free" },
      { c: "free", rel: "2023年9月", ship: "free" }
    ] },
  { id: "iphone-14-plus", name: "iPhone 14 Plus", maker: "iphone", kana: "アイフォン 14 プラス",
    variants: [
      { c: "docomo", rel: "2022年10月", ship: "free" },
      { c: "au", rel: "2022年10月", ship: "free" },
      { c: "sb", rel: "2022年10月", ship: "free" },
      { c: "uq", rel: "2022年10月", ship: "free" },
      { c: "rakuten", rel: "2022年10月", ship: "free" },
      { c: "free", rel: "2022年10月", ship: "free" }
    ] },
  { id: "iphone-14", name: "iPhone 14", maker: "iphone", kana: "アイフォン 14",
    variants: [
      { c: "docomo", rel: "2022年9月", ship: "free" },
      { c: "au", rel: "2022年9月", ship: "free" },
      { c: "sb", rel: "2022年9月", ship: "free" },
      { c: "uq", rel: "2022年9月", ship: "free" },
      { c: "rakuten", rel: "2022年9月", ship: "free" },
      { c: "free", rel: "2022年9月", ship: "free" }
    ], note: "iPhone 13以降は全キャリアでロックなし販売" },
  { id: "iphone-14-pro", name: "iPhone 14 Pro", maker: "iphone", kana: "アイフォン 14 プロ",
    variants: [
      { c: "docomo", rel: "2022年9月", ship: "free" },
      { c: "au", rel: "2022年9月", ship: "free" },
      { c: "sb", rel: "2022年9月", ship: "free" },
      { c: "uq", rel: "2022年9月", ship: "free" },
      { c: "rakuten", rel: "2022年9月", ship: "free" },
      { c: "free", rel: "2022年9月", ship: "free" }
    ] },
  { id: "iphone-14-pro-max", name: "iPhone 14 Pro Max", maker: "iphone", kana: "アイフォン 14 プロ マックス",
    variants: [
      { c: "docomo", rel: "2022年9月", ship: "free" },
      { c: "au", rel: "2022年9月", ship: "free" },
      { c: "sb", rel: "2022年9月", ship: "free" },
      { c: "uq", rel: "2022年9月", ship: "free" },
      { c: "rakuten", rel: "2022年9月", ship: "free" },
      { c: "free", rel: "2022年9月", ship: "free" }
    ] },
  { id: "iphone-se3", name: "iPhone SE（第3世代）", maker: "iphone", kana: "アイフォン SE3",
    variants: [
      { c: "docomo", rel: "2022年3月", ship: "free" },
      { c: "au", rel: "2022年3月", ship: "free" },
      { c: "sb", rel: "2022年3月", ship: "free" },
      { c: "rakuten", rel: "2022年3月", ship: "free" },
      { c: "uq", rel: "2022年3月", ship: "free" },
      { c: "ymobile", rel: "2022年3月", ship: "free" },
      { c: "free", rel: "2022年3月", ship: "free" }
    ] },
  { id: "iphone-13-mini", name: "iPhone 13 mini", maker: "iphone", kana: "アイフォン 13 ミニ",
    variants: [
      { c: "docomo", rel: "2021年9月", ship: "free" },
      { c: "au", rel: "2021年9月", ship: "free" },
      { c: "sb", rel: "2021年9月", ship: "free" },
      { c: "rakuten", rel: "2021年9月", ship: "free" },
      { c: "free", rel: "2021年9月", ship: "free" }
    ], note: "iPhone 13は4キャリアとも発売時（2021/9/24）からSIMロックなし" },
  { id: "iphone-13-pro", name: "iPhone 13 Pro", maker: "iphone", kana: "アイフォン 13 プロ",
    variants: [
      { c: "docomo", rel: "2021年9月", ship: "free" },
      { c: "au", rel: "2021年9月", ship: "free" },
      { c: "sb", rel: "2021年9月", ship: "free" },
      { c: "rakuten", rel: "2021年9月", ship: "free" },
      { c: "free", rel: "2021年9月", ship: "free" }
    ], note: "iPhone 13は4キャリアとも発売時（2021/9/24）からSIMロックなし" },
  { id: "iphone-13-pro-max", name: "iPhone 13 Pro Max", maker: "iphone", kana: "アイフォン 13 プロ マックス",
    variants: [
      { c: "docomo", rel: "2021年9月", ship: "free" },
      { c: "au", rel: "2021年9月", ship: "free" },
      { c: "sb", rel: "2021年9月", ship: "free" },
      { c: "rakuten", rel: "2021年9月", ship: "free" },
      { c: "free", rel: "2021年9月", ship: "free" }
    ], note: "iPhone 13は4キャリアとも発売時（2021/9/24）からSIMロックなし" },
  { id: "iphone-12-mini", name: "iPhone 12 mini", maker: "iphone", kana: "アイフォン 12 ミニ",
    variants: [
      { c: "docomo", rel: "2020年11月", ship: "locked" },
      { c: "au", rel: "2020年11月", ship: "locked" },
      { c: "sb", rel: "2020年11月", ship: "locked" },
      { c: "ymobile", rel: "2020年11月", ship: "cond" }
    ] },
  { id: "iphone-12-pro-max", name: "iPhone 12 Pro Max", maker: "iphone", kana: "アイフォン 12 プロ マックス",
    variants: [
      { c: "docomo", rel: "2020年11月", ship: "locked" },
      { c: "au", rel: "2020年11月", ship: "locked" },
      { c: "sb", rel: "2020年11月", ship: "locked" }
    ] },
  { id: "iphone-12", name: "iPhone 12", maker: "iphone", kana: "アイフォン 12",
    variants: [
      { c: "docomo", rel: "2020年10月", ship: "locked" },
      { c: "au", rel: "2020年10月", ship: "locked" },
      { c: "sb", rel: "2020年10月", ship: "locked" }
    ] },
  { id: "iphone-12-pro", name: "iPhone 12 Pro", maker: "iphone", kana: "アイフォン 12 プロ",
    variants: [
      { c: "docomo", rel: "2020年10月", ship: "locked" },
      { c: "au", rel: "2020年10月", ship: "locked" },
      { c: "sb", rel: "2020年10月", ship: "locked" }
    ] },
  { id: "iphone-se2", name: "iPhone SE（第2世代）", maker: "iphone", kana: "アイフォン SE2",
    variants: [
      { c: "docomo", rel: "2020年5月", ship: "locked" },
      { c: "au", rel: "2020年5月", ship: "locked" },
      { c: "sb", rel: "2020年5月", ship: "locked" },
      { c: "uq", rel: "2020年", ship: "locked" },
      { c: "ymobile", rel: "2020年〜", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "iphone-11", name: "iPhone 11", maker: "iphone", kana: "アイフォン 11",
    variants: [
      { c: "docomo", rel: "2019年9月", ship: "locked" },
      { c: "au", rel: "2019年9月", ship: "locked" },
      { c: "sb", rel: "2019年9月", ship: "locked" }
    ] },
  { id: "iphone-11-pro", name: "iPhone 11 Pro", maker: "iphone", kana: "アイフォン 11 プロ",
    variants: [
      { c: "docomo", rel: "2019年9月", ship: "locked" },
      { c: "au", rel: "2019年9月", ship: "locked" },
      { c: "sb", rel: "2019年9月", ship: "locked" }
    ] },
  { id: "iphone-11-pro-max", name: "iPhone 11 Pro Max", maker: "iphone", kana: "アイフォン 11 プロ マックス",
    variants: [
      { c: "docomo", rel: "2019年9月", ship: "locked" },
      { c: "au", rel: "2019年9月", ship: "locked" },
      { c: "sb", rel: "2019年9月", ship: "locked" }
    ] },
  { id: "iphone-xr", name: "iPhone XR", maker: "iphone", kana: "アイフォン テンアール",
    variants: [
      { c: "docomo", rel: "2018年10月", ship: "locked" },
      { c: "au", rel: "2018年10月", ship: "locked" },
      { c: "sb", rel: "2018年10月", ship: "locked" }
    ] },
  { id: "iphone-xs", name: "iPhone XS", maker: "iphone", kana: "アイフォン テンエス",
    variants: [
      { c: "docomo", rel: "2018年9月", ship: "locked" },
      { c: "au", rel: "2018年9月", ship: "locked" },
      { c: "sb", rel: "2018年9月", ship: "locked" }
    ] },
  { id: "iphone-xs-max", name: "iPhone XS Max", maker: "iphone", kana: "アイフォン テンエス マックス",
    variants: [
      { c: "docomo", rel: "2018年9月", ship: "locked" },
      { c: "au", rel: "2018年9月", ship: "locked" },
      { c: "sb", rel: "2018年9月", ship: "locked" }
    ] },
  { id: "iphone-x", name: "iPhone X", maker: "iphone", kana: "アイフォン テン 10",
    variants: [
      { c: "docomo", rel: "2017年11月", ship: "locked" },
      { c: "au", rel: "2017年11月", ship: "locked" },
      { c: "sb", rel: "2017年11月", ship: "locked" }
    ] },
  { id: "iphone-8", name: "iPhone 8", maker: "iphone", kana: "アイフォン 8",
    variants: [
      { c: "docomo", rel: "2017年9月", ship: "locked" },
      { c: "au", rel: "2017年9月", ship: "locked" },
      { c: "sb", rel: "2017年9月", ship: "locked" },
      { c: "ymobile", rel: "2017年9月", ship: "cond" },
      { c: "uq", rel: "2017年9月", ship: "locked" }
    ] },
  { id: "iphone-8-plus", name: "iPhone 8 Plus", maker: "iphone", kana: "アイフォン 8 プラス",
    variants: [
      { c: "docomo", rel: "2017年9月", ship: "locked" },
      { c: "au", rel: "2017年9月", ship: "locked" },
      { c: "sb", rel: "2017年9月", ship: "locked" },
      { c: "ymobile", rel: "2017年9月", ship: "cond" },
      { c: "uq", rel: "2017年9月", ship: "locked" }
    ] },
  { id: "iphone-7", name: "iPhone 7", maker: "iphone", kana: "アイフォン 7",
    variants: [
      { c: "docomo", rel: "2016年9月", ship: "locked" },
      { c: "au", rel: "2016年9月", ship: "locked" },
      { c: "sb", rel: "2016年9月", ship: "locked" },
      { c: "ymobile", rel: "2016年9月", ship: "cond" },
      { c: "uq", rel: "2016年9月", ship: "locked" }
    ] },
  { id: "iphone-7-plus", name: "iPhone 7 Plus", maker: "iphone", kana: "アイフォン 7 プラス",
    variants: [
      { c: "docomo", rel: "2016年9月", ship: "locked" },
      { c: "au", rel: "2016年9月", ship: "locked" },
      { c: "sb", rel: "2016年9月", ship: "locked" }
    ] },
  { id: "iphone-se1", name: "iPhone SE（第1世代）", maker: "iphone", kana: "アイフォン SE 第1世代",
    variants: [
      { c: "docomo", rel: "2016年3月", ship: "locked" },
      { c: "au", rel: "2016年3月", ship: "locked" },
      { c: "sb", rel: "2016年3月", ship: "locked" },
      { c: "ymobile", rel: "2016年3月", ship: "cond" },
      { c: "uq", rel: "2016年3月", ship: "locked" }
    ], note: "iOS 14以上に更新できない機種は設定に「SIMロック」項目が出ない → 他社SIMテストで判定" },
  { id: "iphone-6s", name: "iPhone 6s", maker: "iphone", kana: "アイフォン 6s",
    variants: [
      { c: "docomo", rel: "2015年9月", ship: "locked" },
      { c: "au", rel: "2015年9月", ship: "locked" },
      { c: "sb", rel: "2015年9月", ship: "locked" },
      { c: "ymobile", rel: "2015年9月", ship: "cond" },
      { c: "uq", rel: "2015年9月", ship: "locked" }
    ] },
  { id: "iphone-6s-plus", name: "iPhone 6s Plus", maker: "iphone", kana: "アイフォン 6s プラス",
    variants: [
      { c: "docomo", rel: "2015年9月", ship: "locked" },
      { c: "au", rel: "2015年9月", ship: "locked" },
      { c: "sb", rel: "2015年9月", ship: "locked" }
    ] },

  // ---------- Pixel / Nexus ----------
  { id: "pixel-10a", name: "Pixel 10a", maker: "pixel", kana: "ピクセル グーグル 10a",
    variants: [
      { c: "au", rel: "2026年3月", ship: "free" },
      { c: "sb", rel: "2026年3月", ship: "free" },
      { c: "ymobile", rel: "2026年3月", ship: "free" },
      { c: "free", rel: "2026年3月", ship: "free" }
    ] },
  { id: "pixel-10-pro-fold", name: "Pixel 10 Pro Fold", maker: "pixel", kana: "ピクセル グーグル 10 プロ フォールド",
    variants: [
      { c: "docomo", rel: "2025年10月", ship: "free" },
      { c: "au", rel: "2025年10月", ship: "free" },
      { c: "sb", rel: "2025年10月", ship: "free" },
      { c: "free", rel: "2025年10月", ship: "free" }
    ] },
  { id: "pixel-9a", name: "Pixel 9a", maker: "pixel", kana: "ピクセル グーグル 9a",
    variants: [
      { c: "au", rel: "2025年4月", ship: "free" },
      { c: "sb", rel: "2025年4月", ship: "free" },
      { c: "ymobile", rel: "2025年9月", ship: "free" },
      { c: "free", rel: "2025年4月", ship: "free" }
    ] },
  { id: "pixel-10", name: "Pixel 10", maker: "pixel", kana: "ピクセル グーグル 10",
    variants: [
      { c: "docomo", rel: "2025年8月", ship: "free" },
      { c: "au", rel: "2025年8月", ship: "free" },
      { c: "sb", rel: "2025年8月", ship: "free" },
      { c: "free", rel: "2025年8月", ship: "free" }
    ] },
  { id: "pixel-10-pro", name: "Pixel 10 Pro", maker: "pixel", kana: "ピクセル グーグル 10 プロ",
    variants: [
      { c: "docomo", rel: "2025年8月", ship: "free" },
      { c: "au", rel: "2025年8月", ship: "free" },
      { c: "sb", rel: "2025年8月", ship: "free" },
      { c: "free", rel: "2025年8月", ship: "free" }
    ] },
  { id: "pixel-10-pro-xl", name: "Pixel 10 Pro XL", maker: "pixel", kana: "ピクセル グーグル 10 プロ",
    variants: [
      { c: "docomo", rel: "2025年8月", ship: "free" },
      { c: "au", rel: "2025年8月", ship: "free" },
      { c: "sb", rel: "2025年8月", ship: "free" },
      { c: "free", rel: "2025年8月", ship: "free" }
    ] },
  { id: "pixel-9-pro", name: "Pixel 9 Pro", maker: "pixel", kana: "ピクセル グーグル 9 プロ",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "pixel-9-pro-xl", name: "Pixel 9 Pro XL", maker: "pixel", kana: "ピクセル グーグル 9 プロ",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "pixel-9-pro-fold", name: "Pixel 9 Pro Fold", maker: "pixel", kana: "ピクセル グーグル 9 プロ フォールド",
    variants: [
      { c: "docomo", rel: "2024年9月", ship: "free" },
      { c: "au", rel: "2024年9月", ship: "free" },
      { c: "sb", rel: "2024年9月", ship: "free" },
      { c: "free", rel: "2024年9月", ship: "free" }
    ] },
  { id: "pixel-9", name: "Pixel 9", maker: "pixel", kana: "ピクセル グーグル 9",
    variants: [
      { c: "docomo", rel: "2024年8月", ship: "free" },
      { c: "au", rel: "2024年8月", ship: "free" },
      { c: "sb", rel: "2024年8月", ship: "free" },
      { c: "free", rel: "2024年8月", ship: "free" }
    ] },
  { id: "pixel-8a", name: "Pixel 8a", maker: "pixel", kana: "ピクセル グーグル 8a",
    variants: [
      { c: "docomo", rel: "2024年5月", ship: "free" },
      { c: "au", rel: "2024年5月", ship: "free" },
      { c: "sb", rel: "2024年5月", ship: "free" },
      { c: "uq", rel: "2024年5月", ship: "free" },
      { c: "ymobile", rel: "2024年7月", ship: "free" },
      { c: "free", rel: "2024年5月", ship: "free" }
    ] },
  { id: "pixel-7a", name: "Pixel 7a", maker: "pixel", kana: "ピクセル グーグル 7a",
    variants: [
      { c: "docomo", rel: "2023年5月", ship: "free" },
      { c: "au", rel: "2023年5月", ship: "free" },
      { c: "sb", rel: "2023年5月", ship: "free" },
      { c: "ymobile", rel: "2024年2月", ship: "free" },
      { c: "free", rel: "2023年5月", ship: "free" }
    ] },
  { id: "pixel-8", name: "Pixel 8", maker: "pixel", kana: "ピクセル グーグル 8",
    variants: [
      { c: "docomo", rel: "2023年10月", ship: "free" },
      { c: "au", rel: "2023年10月", ship: "free" },
      { c: "sb", rel: "2023年10月", ship: "free" },
      { c: "free", rel: "2023年10月", ship: "free" }
    ] },
  { id: "pixel-8-pro", name: "Pixel 8 Pro", maker: "pixel", kana: "ピクセル グーグル 8 プロ",
    variants: [
      { c: "docomo", rel: "2023年10月", ship: "free" },
      { c: "au", rel: "2023年10月", ship: "free" },
      { c: "sb", rel: "2023年10月", ship: "free" },
      { c: "free", rel: "2023年10月", ship: "free" }
    ] },
  { id: "pixel-fold", name: "Pixel Fold", maker: "pixel", kana: "ピクセル グーグル フォールド 折りたたみ",
    variants: [
      { c: "docomo", rel: "2023年7月", ship: "free" },
      { c: "au", rel: "2023年7月", ship: "free" },
      { c: "sb", rel: "2023年7月", ship: "free" },
      { c: "free", rel: "2023年7月", ship: "free" }
    ] },
  { id: "pixel-6plus", name: "Pixel 上記以外の2021年10月以降発売モデル", maker: "pixel", kana: "ピクセル グーグル 11 12",
    variants: [
      { c: "au", rel: "2021年10月〜", ship: "free" },
      { c: "sb", rel: "2021年10月〜", ship: "free" },
      { c: "docomo", rel: "2023年〜（Pixel 8〜）", ship: "free" },
      { c: "free", rel: "2021年10月〜", ship: "free" }
    ] },
  { id: "pixel-7", name: "Pixel 7", maker: "pixel", kana: "ピクセル グーグル 7",
    variants: [
      { c: "au", rel: "2022年10月", ship: "free" },
      { c: "sb", rel: "2022年10月", ship: "free" },
      { c: "free", rel: "2022年10月", ship: "free" }
    ] },
  { id: "pixel-7-pro", name: "Pixel 7 Pro", maker: "pixel", kana: "ピクセル グーグル 7 プロ",
    variants: [
      { c: "au", rel: "2022年10月", ship: "free" },
      { c: "sb", rel: "2022年10月", ship: "free" },
      { c: "free", rel: "2022年10月", ship: "free" }
    ] },
  { id: "pixel-6a", name: "Pixel 6a", maker: "pixel", kana: "ピクセル グーグル 6a",
    variants: [
      { c: "au", rel: "2022年7月", ship: "free" },
      { c: "sb", rel: "2022年7月", ship: "free" },
      { c: "free", rel: "2022年7月", ship: "free" }
    ] },
  { id: "pixel-6", name: "Pixel 6", maker: "pixel", kana: "ピクセル グーグル 6",
    variants: [
      { c: "au", rel: "2021年10月", ship: "free" },
      { c: "sb", rel: "2021年10月", ship: "free" },
      { c: "free", rel: "2021年10月", ship: "free" }
    ], note: "Google Store版・キャリア版ともSIMロックなし" },
  { id: "pixel-6-pro", name: "Pixel 6 Pro", maker: "pixel", kana: "ピクセル グーグル 6 プロ",
    variants: [
      { c: "au", rel: "2021年10月", ship: "free" },
      { c: "sb", rel: "2021年10月", ship: "free" },
      { c: "free", rel: "2021年10月", ship: "free" }
    ], note: "Google Store版・キャリア版ともSIMロックなし" },
  { id: "pixel-5a", name: "Pixel 5a (5G)", maker: "pixel", kana: "ピクセル グーグル 5a 5g",
    variants: [
      { c: "sb", rel: "2021年8月", ship: "cond" },
      { c: "free", rel: "2021年8月", ship: "free" }
    ] },
  { id: "pixel-4a-5g", name: "Pixel 4a (5G)", maker: "pixel", kana: "ピクセル グーグル 4a 5g",
    variants: [
      { c: "au", rel: "2020年11月", ship: "locked" },
      { c: "sb", rel: "2020年11月", ship: "locked" },
      { c: "free", rel: "2020年11月", ship: "free" }
    ] },
  { id: "pixel-4a", name: "Pixel 4a", maker: "pixel", kana: "ピクセル グーグル 4a",
    variants: [
      { c: "sb", rel: "2020年10月", ship: "locked" },
      { c: "free", rel: "2020年10月", ship: "free" }
    ] },
  { id: "pixel-5", name: "Pixel 5", maker: "pixel", kana: "ピクセル グーグル 5",
    variants: [
      { c: "au", rel: "2020年10月", ship: "locked" },
      { c: "sb", rel: "2020年10月", ship: "locked", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "free", rel: "2020年10月", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-4", name: "Pixel 4", maker: "pixel", kana: "ピクセル グーグル 4",
    variants: [
      { c: "sb", rel: "2019年10月", ship: "locked" },
      { c: "free", rel: "2019年10月", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-4-xl", name: "Pixel 4 XL", maker: "pixel", kana: "ピクセル グーグル 4",
    variants: [
      { c: "sb", rel: "2019年10月", ship: "locked" },
      { c: "free", rel: "2019年10月", ship: "free" }
    ] },
  { id: "pixel-3a", name: "Pixel 3a", maker: "pixel", kana: "ピクセル グーグル 3a",
    variants: [
      { c: "docomo", rel: "2019年6月", ship: "locked" },
      { c: "sb", rel: "2019年6月", ship: "locked" },
      { c: "free", rel: "2019年6月", ship: "free" }
    ] },
  { id: "pixel-3a-xl", name: "Pixel 3a XL", maker: "pixel", kana: "ピクセル グーグル 3a",
    variants: [
      { c: "docomo", rel: "2019年6月", ship: "locked" },
      { c: "sb", rel: "2019年6月", ship: "locked" },
      { c: "free", rel: "2019年6月", ship: "free" }
    ] },
  { id: "pixel-3", name: "Pixel 3", maker: "pixel", kana: "ピクセル グーグル 3",
    variants: [
      { c: "docomo", rel: "2018年11月", ship: "locked" },
      { c: "sb", rel: "2018年11月", ship: "locked" },
      { c: "free", rel: "2018年11月", ship: "free", note: "Google Store版" }
    ] },
  { id: "pixel-3-xl", name: "Pixel 3 XL", maker: "pixel", kana: "ピクセル グーグル 3",
    variants: [
      { c: "docomo", rel: "2018年11月", ship: "locked" },
      { c: "sb", rel: "2018年11月", ship: "locked" },
      { c: "free", rel: "2018年11月", ship: "free" }
    ] },
  { id: "nexus-6p", name: "Nexus 6P", maker: "pixel", kana: "ネクサス グーグル",
    variants: [
      { c: "ymobile", rel: "2016年", ship: "locked" }
    ] },
  { id: "nexus-5x", name: "Nexus 5X", maker: "pixel", kana: "ネクサス グーグル",
    variants: [
      { c: "ymobile", rel: "2016年", ship: "locked" }
    ] },
  { id: "nexus-6", name: "Nexus 6", maker: "pixel", kana: "ネクサス グーグル",
    variants: [
      { c: "ymobile", rel: "2015年", ship: "free", note: "Y!mobile販売分もSIMフリー扱い" }
    ] },

  // ---------- Xperia ----------
  { id: "xperia-1-viii", name: "Xperia 1 VIII", maker: "xperia", kana: "エクスペリア ワン マークエイト",
    variants: [
      { c: "docomo", code: "SO-51G", rel: "2026年6月", ship: "free" },
      { c: "au", rel: "2026年6月", ship: "free" }
    ] },
  { id: "xperia-10-vii", name: "Xperia 10 VII", maker: "xperia", kana: "エクスペリア テン マークセブン",
    variants: [
      { c: "docomo", code: "SO-52F", rel: "2025年10月", ship: "free" },
      { c: "au", code: "SOG16", rel: "2025年10月", ship: "free" },
      { c: "free", rel: "2025年10月", ship: "free" }
    ] },
  { id: "xperia-1-vii", name: "Xperia 1 VII", maker: "xperia", kana: "エクスペリア ワン マークセブン",
    variants: [
      { c: "docomo", code: "SO-51F", rel: "2025年6月", ship: "free" },
      { c: "au", code: "SOG15", rel: "2025年6月", ship: "free" },
      { c: "sb", code: "A501SO", rel: "2025年6月", ship: "free" },
      { c: "free", rel: "2025年6月", ship: "free" }
    ] },
  { id: "xperia-1-vi", name: "Xperia 1 VI", maker: "xperia", kana: "エクスペリア ワン マークシックス",
    variants: [
      { c: "docomo", code: "SO-51E", rel: "2024年6月", ship: "free" },
      { c: "au", code: "SOG13", rel: "2024年6月", ship: "free" },
      { c: "sb", code: "A401SO", rel: "2024年6月", ship: "free" },
      { c: "free", rel: "2024年6月", ship: "free" }
    ] },
  { id: "xperia-10-vi", name: "Xperia 10 VI", maker: "xperia", kana: "エクスペリア テン マークシックス",
    variants: [
      { c: "docomo", code: "SO-52E", rel: "2024年6月", ship: "free" },
      { c: "au", code: "SOG14", rel: "2024年6月", ship: "free" },
      { c: "sb", code: "A402SO", rel: "2024年6月", ship: "free" },
      { c: "free", rel: "2024年6月", ship: "free" }
    ] },
  { id: "xperia-5-v", name: "Xperia 5 V", maker: "xperia", kana: "エクスペリア ファイブ マークファイブ",
    variants: [
      { c: "docomo", code: "SO-53D", rel: "2023年11月", ship: "free" },
      { c: "au", code: "SOG12", rel: "2023年11月", ship: "free" },
      { c: "sb", rel: "2023年11月", ship: "free" },
      { c: "free", rel: "2023年11月", ship: "free" }
    ] },
  { id: "xperia-10-v", name: "Xperia 10 V", maker: "xperia", kana: "エクスペリア テン マークファイブ",
    variants: [
      { c: "docomo", code: "SO-52D", rel: "2023年7月", ship: "free" },
      { c: "au", code: "SOG11", rel: "2023年7月", ship: "free" },
      { c: "sb", code: "A302SO", rel: "2023年7月", ship: "free" },
      { c: "free", rel: "2023年7月", ship: "free" }
    ] },
  { id: "xperia-1-v", name: "Xperia 1 V", maker: "xperia", kana: "エクスペリア ワン マークファイブ",
    variants: [
      { c: "docomo", code: "SO-51D", rel: "2023年6月", ship: "free" },
      { c: "au", code: "SOG10", rel: "2023年6月", ship: "free" },
      { c: "sb", code: "A301SO", rel: "2023年6月", ship: "free" },
      { c: "free", rel: "2023年6月", ship: "free" }
    ] },
  { id: "xperia-5-iv", name: "Xperia 5 IV", maker: "xperia", kana: "エクスペリア ファイブ マークフォー",
    variants: [
      { c: "docomo", code: "SO-54C", rel: "2022年10月", ship: "free" },
      { c: "au", code: "SOG09", rel: "2022年10月", ship: "free" },
      { c: "sb", rel: "2022年10月", ship: "free" }
    ] },
  { id: "xperia-10-iv", name: "Xperia 10 IV", maker: "xperia", kana: "エクスペリア テン マークフォー",
    variants: [
      { c: "docomo", code: "SO-52C", rel: "2022年7月", ship: "free" },
      { c: "au", code: "SOG07", rel: "2022年7月", ship: "free" },
      { c: "sb", code: "A202SO", rel: "2022年7月", ship: "free" },
      { c: "uq", rel: "2022年7月", ship: "free" },
      { c: "rakuten", code: "XQ-CC44", rel: "2022年7月", ship: "free" },
      { c: "free", code: "XQ-CC44", rel: "2022年7月", ship: "free" }
    ] },
  { id: "xperia-new", name: "Xperia 上記以外の2021年10月以降発売モデル", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", rel: "2022年〜", ship: "free" },
      { c: "au", rel: "2022年〜", ship: "free" },
      { c: "sb", rel: "2022年〜", ship: "free" },
      { c: "uq", rel: "2022年〜", ship: "free" },
      { c: "ymobile", rel: "2022年〜", ship: "free" },
      { c: "rakuten", rel: "2022年〜", ship: "free" },
      { c: "free", rel: "2022年〜", ship: "free" }
    ] },
  { id: "xperia-1-iv", name: "Xperia 1 IV", maker: "xperia", kana: "エクスペリア ワン マークフォー",
    variants: [
      { c: "docomo", code: "SO-51C", rel: "2022年6月", ship: "free" },
      { c: "au", code: "SOG06", rel: "2022年6月", ship: "free" },
      { c: "sb", code: "A201SO", rel: "2022年6月", ship: "free" }
    ] },
  { id: "xperia-ace3", name: "Xperia Ace III", maker: "xperia", kana: "エクスペリア エース スリー",
    variants: [
      { c: "docomo", code: "SO-53C", rel: "2022年6月", ship: "free" },
      { c: "au", code: "SOG08", rel: "2022年6月", ship: "free" },
      { c: "ymobile", code: "A203SO", rel: "2022年6月", ship: "free" }
    ] },
  { id: "xperia-pro-i", name: "Xperia PRO-I", maker: "xperia", kana: "エクスペリア プロ アイ",
    variants: [
      { c: "free", code: "XQ-BE42", rel: "2021年12月", ship: "free" }
    ], note: "SIMフリー版（ソニーストア等）。ロックなし" },
  { id: "xperia-5-iii", name: "Xperia 5 III", maker: "xperia", kana: "エクスペリア ファイブ マークスリー",
    variants: [
      { c: "docomo", code: "SO-53B", rel: "2021年11月", ship: "free" },
      { c: "au", code: "SOG05", rel: "2021年11月", ship: "free" },
      { c: "sb", code: "A103SO", rel: "2021年11月", ship: "free" }
    ] },
  { id: "xperia-1-iii", name: "Xperia 1 III", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-51B", rel: "2021年7月", ship: "locked" },
      { c: "au", code: "SOG03", rel: "2021年7月", ship: "locked" },
      { c: "sb", code: "A101SO", rel: "2021年7月", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-10-iii", name: "Xperia 10 III", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-52B", rel: "2021年6月", ship: "locked" },
      { c: "au", code: "SOG04", rel: "2021年6月", ship: "locked" },
      { c: "ymobile", code: "A102SO", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-ace2", name: "Xperia Ace II", maker: "xperia", kana: "エクスペリア エース ツー",
    variants: [
      { c: "docomo", code: "SO-41B", rel: "2021年6月", ship: "locked" }
    ] },
  { id: "xperia-10-ii", name: "Xperia 10 II", maker: "xperia", kana: "エクスペリア",
    variants: [
      { c: "docomo", code: "SO-41A", rel: "2020年", ship: "locked" },
      { c: "au", code: "SOV43", rel: "2020年", ship: "locked" },
      { c: "ymobile", code: "A001SO", rel: "2020年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "xperia-1-ii", name: "Xperia 1 II", maker: "xperia", kana: "エクスペリア ワン",
    variants: [
      { c: "docomo", code: "SO-51A", rel: "2020年", ship: "locked" }
    ] },
  { id: "xperia-5-ii", name: "Xperia 5 II", maker: "xperia", kana: "エクスペリア ファイブ",
    variants: [
      { c: "docomo", code: "SO-52A", rel: "2020年", ship: "locked" }
    ] },
  { id: "xperia-1", name: "Xperia 1", maker: "xperia", kana: "エクスペリア ワン",
    variants: [
      { c: "docomo", code: "SO-03L", rel: "2019年", ship: "locked" },
      { c: "au", code: "SOV40", rel: "2019年", ship: "locked" },
      { c: "sb", code: "802SO", rel: "2019年", ship: "locked" }
    ] },
  { id: "xperia-5", name: "Xperia 5", maker: "xperia", kana: "エクスペリア ファイブ",
    variants: [
      { c: "docomo", code: "SO-01M", rel: "2019年", ship: "locked" },
      { c: "au", code: "SOV41", rel: "2019年", ship: "locked" },
      { c: "sb", code: "901SO", rel: "2019年", ship: "locked" }
    ] },
  { id: "xperia-8", name: "Xperia 8", maker: "xperia", kana: "エクスペリア エイト",
    variants: [
      { c: "sb", code: "902SO", rel: "2019年", ship: "locked" }
    ] },
  { id: "xperia-ace", name: "Xperia Ace", maker: "xperia", kana: "エクスペリア エース",
    variants: [
      { c: "docomo", code: "SO-02L", rel: "2019年6月", ship: "locked" }
    ] },
  { id: "xperia-xz2-premium", name: "Xperia XZ2 Premium", maker: "xperia", kana: "エクスペリア エックスゼットツー プレミアム",
    variants: [
      { c: "docomo", code: "SO-04K", rel: "2018年8月", ship: "locked" },
      { c: "au", code: "SOV38", rel: "2018年8月", ship: "locked" }
    ] },
  { id: "xperia-xz2-compact", name: "Xperia XZ2 Compact", maker: "xperia", kana: "エクスペリア エックスゼットツー コンパクト",
    variants: [
      { c: "docomo", code: "SO-05K", rel: "2018年7月", ship: "locked" }
    ] },
  { id: "xperia-xz3", name: "Xperia XZ3", maker: "xperia", kana: "エクスペリア エックスゼットスリー",
    variants: [
      { c: "docomo", code: "SO-01L", rel: "2018年", ship: "locked" },
      { c: "au", code: "SOV39", rel: "2018年", ship: "locked" },
      { c: "sb", code: "801SO", rel: "2018年", ship: "locked" }
    ] },
  { id: "xperia-xz2", name: "Xperia XZ2", maker: "xperia", kana: "エクスペリア エックスゼットツー",
    variants: [
      { c: "docomo", code: "SO-03K", rel: "2018年5月", ship: "locked" },
      { c: "au", code: "SOV37", rel: "2018年5月", ship: "locked" },
      { c: "sb", code: "702SO", rel: "2018年5月", ship: "locked" }
    ] },
  { id: "xperia-xz1-compact", name: "Xperia XZ1 Compact", maker: "xperia", kana: "エクスペリア エックスゼットワン コンパクト",
    variants: [
      { c: "docomo", code: "SO-02K", rel: "2017年11月", ship: "locked" }
    ] },
  { id: "xperia-xz1", name: "Xperia XZ1", maker: "xperia", kana: "エクスペリア エックスゼットワン",
    variants: [
      { c: "docomo", code: "SO-01K", rel: "2017年10月", ship: "locked" },
      { c: "au", code: "SOV36", rel: "2017年10月", ship: "locked" },
      { c: "sb", code: "701SO", rel: "2017年10月", ship: "locked" }
    ] },
  { id: "xperia-xzs", name: "Xperia XZs", maker: "xperia", kana: "エクスペリア エックスゼットエス",
    variants: [
      { c: "docomo", code: "SO-03J", rel: "2017年4月", ship: "locked" },
      { c: "au", code: "SOV35", rel: "2017年4月", ship: "locked" },
      { c: "sb", code: "602SO", rel: "2017年4月", ship: "locked" }
    ] },
  { id: "xperia-x-compact", name: "Xperia X Compact", maker: "xperia", kana: "エクスペリア エックス コンパクト",
    variants: [
      { c: "docomo", code: "SO-02J", rel: "2016年11月", ship: "locked" }
    ] },
  { id: "xperia-xz", name: "Xperia XZ", maker: "xperia", kana: "エクスペリア エックスゼット",
    variants: [
      { c: "docomo", code: "SO-01J", rel: "2016年11月", ship: "locked" },
      { c: "au", code: "SOV34", rel: "2016年11月", ship: "locked" },
      { c: "sb", code: "601SO", rel: "2016年11月", ship: "locked" }
    ] },
  { id: "xperia-x-performance", name: "Xperia X Performance", maker: "xperia", kana: "エクスペリア エックス パフォーマンス",
    variants: [
      { c: "docomo", code: "SO-04H", rel: "2016年5月", ship: "locked" },
      { c: "au", code: "SOV33", rel: "2016年5月", ship: "locked" },
      { c: "sb", code: "502SO", rel: "2016年5月", ship: "locked" }
    ] },

  // ---------- Galaxy ----------
  { id: "galaxy-s26", name: "Galaxy S26", maker: "galaxy", kana: "ギャラクシー エストゥエンティシックス",
    variants: [
      { c: "docomo", code: "SC-51G", rel: "2026年3月", ship: "free" },
      { c: "au", rel: "2026年3月", ship: "free" }
    ] },
  { id: "galaxy-s26-plus", name: "Galaxy S26+", maker: "galaxy", kana: "ギャラクシー エストゥエンティシックス プラス",
    variants: [
      { c: "au", rel: "2026年3月", ship: "free" }
    ] },
  { id: "galaxy-s26-ultra", name: "Galaxy S26 Ultra", maker: "galaxy", kana: "ギャラクシー エストゥエンティシックス ウルトラ",
    variants: [
      { c: "au", rel: "2026年3月", ship: "free" }
    ] },
  { id: "galaxy-z-flip7", name: "Galaxy Z Flip7", maker: "galaxy", kana: "ギャラクシー ゼットフリップ セブン 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-55F", rel: "2025年8月", ship: "free" },
      { c: "au", code: "SCG35", rel: "2025年8月", ship: "free" }
    ] },
  { id: "galaxy-z-fold7", name: "Galaxy Z Fold7", maker: "galaxy", kana: "ギャラクシー ゼットフォールド セブン 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-56F", rel: "2025年8月", ship: "free" },
      { c: "au", code: "SCG34", rel: "2025年8月", ship: "free" }
    ] },
  { id: "galaxy-a25", name: "Galaxy A25 5G", maker: "galaxy", kana: "ギャラクシー エートゥエンティファイブ",
    variants: [
      { c: "docomo", code: "SC-53F", rel: "2025年2月", ship: "free" },
      { c: "au", code: "SCG33", rel: "2025年2月", ship: "free" },
      { c: "sb", rel: "2025年2月", ship: "free" },
      { c: "uq", rel: "2025年2月", ship: "free" },
      { c: "ymobile", rel: "2025年2月", ship: "free" },
      { c: "rakuten", rel: "2025年2月", ship: "free" }
    ] },
  { id: "galaxy-s25", name: "Galaxy S25", maker: "galaxy", kana: "ギャラクシー エストゥエンティファイブ",
    variants: [
      { c: "docomo", code: "SC-51F", rel: "2025年2月", ship: "free" },
      { c: "au", code: "SCG31", rel: "2025年2月", ship: "free" }
    ] },
  { id: "galaxy-s25-ultra", name: "Galaxy S25 Ultra", maker: "galaxy", kana: "ギャラクシー エストゥエンティファイブ ウルトラ",
    variants: [
      { c: "docomo", code: "SC-52F", rel: "2025年2月", ship: "free" },
      { c: "au", code: "SCG32", rel: "2025年2月", ship: "free" }
    ] },
  { id: "galaxy-z-flip6", name: "Galaxy Z Flip6", maker: "galaxy", kana: "ギャラクシー ゼットフリップ シックス 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-54E", rel: "2024年7月", ship: "free" },
      { c: "au", code: "SCG29", rel: "2024年7月", ship: "free" }
    ] },
  { id: "galaxy-z-fold6", name: "Galaxy Z Fold6", maker: "galaxy", kana: "ギャラクシー ゼットフォールド シックス 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-55E", rel: "2024年7月", ship: "free" },
      { c: "au", code: "SCG28", rel: "2024年7月", ship: "free" }
    ] },
  { id: "galaxy-a55", name: "Galaxy A55 5G", maker: "galaxy", kana: "ギャラクシー エーゴジューゴ",
    variants: [
      { c: "docomo", code: "SC-53E", rel: "2024年", ship: "free" },
      { c: "au", code: "SCG27", rel: "2024年", ship: "free" }
    ] },
  { id: "galaxy-s24", name: "Galaxy S24", maker: "galaxy", kana: "ギャラクシー エストゥエンティフォー",
    variants: [
      { c: "docomo", code: "SC-51E", rel: "2024年4月", ship: "free" },
      { c: "au", code: "SCG25", rel: "2024年4月", ship: "free" }
    ] },
  { id: "galaxy-s24-ultra", name: "Galaxy S24 Ultra", maker: "galaxy", kana: "ギャラクシー エストゥエンティフォー ウルトラ",
    variants: [
      { c: "docomo", code: "SC-52E", rel: "2024年4月", ship: "free" },
      { c: "au", code: "SCG26", rel: "2024年4月", ship: "free" }
    ] },
  { id: "galaxy-z-flip5", name: "Galaxy Z Flip5", maker: "galaxy", kana: "ギャラクシー ゼットフリップ ファイブ 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-54D", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" }
    ] },
  { id: "galaxy-z-fold5", name: "Galaxy Z Fold5", maker: "galaxy", kana: "ギャラクシー ゼットフォールド ファイブ 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-55D", rel: "2023年9月", ship: "free" },
      { c: "au", rel: "2023年9月", ship: "free" }
    ] },
  { id: "galaxy-a54", name: "Galaxy A54 5G", maker: "galaxy", kana: "ギャラクシー エーゴジューヨン",
    variants: [
      { c: "docomo", code: "SC-53D", rel: "2023年6月", ship: "free" },
      { c: "au", code: "SCG21", rel: "2023年6月", ship: "free" },
      { c: "uq", code: "SCG21", rel: "2023年6月", ship: "free" }
    ] },
  { id: "galaxy-s23", name: "Galaxy S23", maker: "galaxy", kana: "ギャラクシー エストゥエンティスリー",
    variants: [
      { c: "docomo", code: "SC-51D", rel: "2023年2月", ship: "free" },
      { c: "au", code: "SCG19", rel: "2023年2月", ship: "free" }
    ] },
  { id: "galaxy-s23-ultra", name: "Galaxy S23 Ultra", maker: "galaxy", kana: "ギャラクシー エストゥエンティスリー ウルトラ",
    variants: [
      { c: "docomo", code: "SC-52D", rel: "2023年2月", ship: "free" },
      { c: "au", code: "SCG20", rel: "2023年2月", ship: "free" }
    ] },
  { id: "galaxy-a23", name: "Galaxy A23 5G", maker: "galaxy", kana: "ギャラクシー エーニジュウサン",
    variants: [
      { c: "docomo", code: "SC-56C", rel: "2022年11月", ship: "free" },
      { c: "au", code: "SCG18", rel: "2022年10月", ship: "free" },
      { c: "uq", code: "SCG18", rel: "2022年10月", ship: "free" },
      { c: "rakuten", rel: "2022年11月", ship: "free" }
    ] },
  { id: "galaxy-z-flip4", name: "Galaxy Z Flip4", maker: "galaxy", kana: "ギャラクシー ゼットフリップ フォー 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-54C", rel: "2022年9月", ship: "free" },
      { c: "au", code: "SCG17", rel: "2022年9月", ship: "free" }
    ] },
  { id: "galaxy-z-fold4", name: "Galaxy Z Fold4", maker: "galaxy", kana: "ギャラクシー ゼットフォールド フォー 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-55C", rel: "2022年9月", ship: "free" },
      { c: "au", code: "SCG16", rel: "2022年9月", ship: "free" }
    ] },
  { id: "galaxy-new", name: "Galaxy 上記以外の2022年以降発売モデル", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", rel: "2022年〜", ship: "free" },
      { c: "au", rel: "2022年〜", ship: "free" },
      { c: "uq", rel: "2022年〜", ship: "free" },
      { c: "rakuten", rel: "2022年〜", ship: "free" },
      { c: "free", rel: "2022年〜", ship: "free" }
    ] },
  { id: "galaxy-zfold-flip", name: "Galaxy Z Fold / Z Flip 上記以外の最新モデル", maker: "galaxy", kana: "ギャラクシー ゼットフォールド ゼットフリップ",
    variants: [
      { c: "docomo", rel: "2022年〜", ship: "free" },
      { c: "au", rel: "2022年〜", ship: "free" },
      { c: "sb", rel: "2022年〜", ship: "free" },
      { c: "rakuten", rel: "2022年〜", ship: "free" },
      { c: "free", rel: "2022年〜", ship: "free" }
    ] },
  { id: "galaxy-s22", name: "Galaxy S22", maker: "galaxy", kana: "ギャラクシー エストゥエンティトゥー",
    variants: [
      { c: "docomo", code: "SC-51C", rel: "2022年", ship: "free" },
      { c: "au", code: "SCG13", rel: "2022年", ship: "free" },
      { c: "uq", code: "SCG13", rel: "2022年", ship: "free" }
    ] },
  { id: "galaxy-s22-ultra", name: "Galaxy S22 Ultra", maker: "galaxy", kana: "ギャラクシー エストゥエンティトゥー ウルトラ",
    variants: [
      { c: "docomo", code: "SC-52C", rel: "2022年", ship: "free" },
      { c: "au", code: "SCG14", rel: "2022年", ship: "free" }
    ] },
  { id: "galaxy-a53", name: "Galaxy A53 5G", maker: "galaxy", kana: "ギャラクシー エーゴジューサン",
    variants: [
      { c: "docomo", code: "SC-53C", rel: "2022年5月", ship: "free" },
      { c: "au", code: "SCG15", rel: "2022年5月", ship: "free" },
      { c: "uq", code: "SCG15", rel: "2022年5月", ship: "free" }
    ] },
  { id: "galaxy-a22-5g", name: "Galaxy A22 5G", maker: "galaxy", kana: "ギャラクシー エートゥエンティトゥー",
    variants: [
      { c: "docomo", code: "SC-56B", rel: "2021年12月", ship: "free" }
    ], note: "ドコモのみの取り扱い（au・UQでの販売は無し）。2021/12/2発売でSIMロックなし" },
  { id: "galaxy-z-flip3", name: "Galaxy Z Flip3 5G", maker: "galaxy", kana: "ギャラクシー ゼットフリップ スリー 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-54B", rel: "2021年10月", ship: "free" },
      { c: "au", code: "SCG12", rel: "2021年10月", ship: "free" }
    ], note: "ドコモ・auとも発売時からSIMロックなし（au版は2021/10/6発売）" },
  { id: "galaxy-z-fold3", name: "Galaxy Z Fold3 5G", maker: "galaxy", kana: "ギャラクシー ゼットフォールド スリー 折りたたみ",
    variants: [
      { c: "docomo", code: "SC-55B", rel: "2021年10月", ship: "free" },
      { c: "au", code: "SCG11", rel: "2021年10月", ship: "free" }
    ], note: "ドコモ・auとも発売時からSIMロックなし（au版は2021/10/6発売）" },
  { id: "galaxy-a52", name: "Galaxy A52 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", code: "SC-53B", rel: "2021年6月", ship: "locked" }
    ] },
  { id: "galaxy-s21-ultra", name: "Galaxy S21 Ultra 5G", maker: "galaxy", kana: "ギャラクシー エストゥエンティワン",
    variants: [
      { c: "docomo", code: "SC-52B", rel: "2021年", ship: "locked" }
    ] },
  { id: "galaxy-s21", name: "Galaxy S21 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", code: "SC-51B", rel: "2021年4月", ship: "locked" },
      { c: "au", code: "SCG09", rel: "2021年4月", ship: "locked" }
    ] },
  { id: "galaxy-a32", name: "Galaxy A32 5G", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "au", code: "SCG08", rel: "2021年2月", ship: "locked" }
    ] },
  { id: "galaxy-a51-5g", name: "Galaxy A51 5G", maker: "galaxy", kana: "ギャラクシー エーゴジューイチ",
    variants: [
      { c: "docomo", code: "SC-54A", rel: "2020年12月", ship: "locked" },
      { c: "au", code: "SCG07", rel: "2020年12月", ship: "locked" }
    ] },
  { id: "galaxy-note20", name: "Galaxy Note20 Ultra 5G", maker: "galaxy", kana: "ギャラクシー ノート",
    variants: [
      { c: "docomo", code: "SC-53A", rel: "2020年10月", ship: "locked" },
      { c: "au", code: "SCG06", rel: "2020年10月", ship: "locked" }
    ] },
  { id: "galaxy-a21", name: "Galaxy A21", maker: "galaxy", kana: "ギャラクシー",
    variants: [
      { c: "docomo", code: "SC-42A", rel: "2020年", ship: "locked" },
      { c: "au", code: "SCV49", rel: "2020年", ship: "locked" },
      { c: "uq", code: "SCV49", rel: "2020年", ship: "locked" }
    ] },
  { id: "galaxy-a41", name: "Galaxy A41", maker: "galaxy", kana: "ギャラクシー エーヨンジューイチ",
    variants: [
      { c: "docomo", code: "SC-41A", rel: "2020年", ship: "locked" },
      { c: "uq", rel: "2020年", ship: "locked" }
    ] },
  { id: "galaxy-s20-ultra", name: "Galaxy S20 Ultra 5G", maker: "galaxy", kana: "ギャラクシー エストゥエンティ ウルトラ",
    variants: [
      { c: "au", code: "SCG03", rel: "2020年5月", ship: "locked" }
    ] },
  { id: "galaxy-s20", name: "Galaxy S20 5G", maker: "galaxy", kana: "ギャラクシー エストゥエンティ",
    variants: [
      { c: "docomo", code: "SC-51A", rel: "2020年3月", ship: "locked" },
      { c: "au", code: "SCG01", rel: "2020年3月", ship: "locked" }
    ] },
  { id: "galaxy-s20-plus", name: "Galaxy S20+ 5G", maker: "galaxy", kana: "ギャラクシー エストゥエンティ プラス",
    variants: [
      { c: "docomo", code: "SC-52A", rel: "2020年3月", ship: "locked" },
      { c: "au", code: "SCG02", rel: "2020年3月", ship: "locked" }
    ] },
  { id: "galaxy-a20", name: "Galaxy A20", maker: "galaxy", kana: "ギャラクシー エートゥエンティ",
    variants: [
      { c: "docomo", code: "SC-02M", rel: "2019年", ship: "locked" }
    ] },
  { id: "galaxy-a30", name: "Galaxy A30", maker: "galaxy", kana: "ギャラクシー エーサーティ",
    variants: [
      { c: "rakuten", rel: "2019年", ship: "free" }
    ] },
  { id: "galaxy-s10", name: "Galaxy S10", maker: "galaxy", kana: "ギャラクシー エステン",
    variants: [
      { c: "docomo", code: "SC-03L", rel: "2019年6月", ship: "locked" },
      { c: "au", code: "SCV41", rel: "2019年6月", ship: "locked" }
    ] },
  { id: "galaxy-s10-plus", name: "Galaxy S10+", maker: "galaxy", kana: "ギャラクシー エステン プラス",
    variants: [
      { c: "docomo", code: "SC-04L", rel: "2019年6月", ship: "locked" },
      { c: "au", code: "SCV42", rel: "2019年6月", ship: "locked" }
    ] },
  { id: "galaxy-feel2", name: "Galaxy Feel2", maker: "galaxy", kana: "ギャラクシー フィール ツー",
    variants: [
      { c: "docomo", code: "SC-02L", rel: "2018年11月", ship: "locked" }
    ] },
  { id: "galaxy-note9", name: "Galaxy Note9", maker: "galaxy", kana: "ギャラクシー ノート",
    variants: [
      { c: "docomo", code: "SC-01L", rel: "2018年", ship: "locked" },
      { c: "au", code: "SCV40", rel: "2018年", ship: "locked" }
    ] },
  { id: "galaxy-s9", name: "Galaxy S9", maker: "galaxy", kana: "ギャラクシー エスナイン",
    variants: [
      { c: "docomo", code: "SC-02K", rel: "2018年5月", ship: "locked" },
      { c: "au", code: "SCV38", rel: "2018年5月", ship: "locked" }
    ] },
  { id: "galaxy-s9-plus", name: "Galaxy S9+", maker: "galaxy", kana: "ギャラクシー エスナイン プラス",
    variants: [
      { c: "docomo", code: "SC-03K", rel: "2018年5月", ship: "locked" },
      { c: "au", code: "SCV39", rel: "2018年5月", ship: "locked" }
    ] },
  { id: "galaxy-note8", name: "Galaxy Note8", maker: "galaxy", kana: "ギャラクシー ノート",
    variants: [
      { c: "docomo", code: "SC-01K", rel: "2017年", ship: "locked" },
      { c: "au", code: "SCV37", rel: "2017年", ship: "locked" }
    ] },
  { id: "galaxy-s8-plus", name: "Galaxy S8+", maker: "galaxy", kana: "ギャラクシー エスエイト プラス",
    variants: [
      { c: "docomo", code: "SC-03J", rel: "2017年6月", ship: "locked" },
      { c: "au", code: "SCV35", rel: "2017年6月", ship: "locked" }
    ] },
  { id: "galaxy-s8", name: "Galaxy S8", maker: "galaxy", kana: "ギャラクシー エスエイト",
    variants: [
      { c: "docomo", code: "SC-02J", rel: "2017年5月", ship: "locked" },
      { c: "au", code: "SCV36", rel: "2017年5月", ship: "locked" }
    ] },
  { id: "galaxy-feel", name: "Galaxy Feel", maker: "galaxy", kana: "ギャラクシー フィール",
    variants: [
      { c: "docomo", code: "SC-04J", rel: "2017年5月", ship: "locked" }
    ] },
  { id: "galaxy-s7edge", name: "Galaxy S7 edge", maker: "galaxy", kana: "ギャラクシー エステブン",
    variants: [
      { c: "docomo", code: "SC-02H", rel: "2016年", ship: "locked" },
      { c: "au", code: "SCV33", rel: "2016年", ship: "locked" }
    ] },

  // ---------- AQUOS・BASIO(シャープ製) ----------
  { id: "aquos-r11", name: "AQUOS R11", maker: "aquos", kana: "アクオス アール イレブン",
    variants: [
      { c: "docomo", code: "SH-51G", rel: "2026年7月", ship: "free" },
      { c: "au", rel: "2026年7月", ship: "free" }
    ] },
  { id: "aquos-sense10", name: "AQUOS sense10", maker: "aquos", kana: "アクオス センス テン",
    variants: [
      { c: "docomo", code: "SH-53F", rel: "2025年11月", ship: "free" },
      { c: "au", code: "SHG15", rel: "2025年11月", ship: "free" },
      { c: "sb", rel: "2025年11月", ship: "free" },
      { c: "uq", rel: "2025年11月", ship: "free" }
    ] },
  { id: "aquos-r10", name: "AQUOS R10", maker: "aquos", kana: "アクオス アール テン",
    variants: [
      { c: "docomo", code: "SH-51F", rel: "2025年7月", ship: "free" },
      { c: "sb", rel: "2025年7月", ship: "free" }
    ] },
  { id: "aquos-wish5", name: "AQUOS wish5", maker: "aquos", kana: "アクオス ウィッシュ ファイブ",
    variants: [
      { c: "ymobile", code: "A502SH", rel: "2025年6月", ship: "free" }
    ] },
  { id: "aquos-sense9", name: "AQUOS sense9", maker: "aquos", kana: "アクオス センス ナイン",
    variants: [
      { c: "docomo", code: "SH-53E", rel: "2024年10月", ship: "free" },
      { c: "au", code: "SHG14", rel: "2024年", ship: "free" }
    ] },
  { id: "aquos-wish4", name: "AQUOS wish4", maker: "aquos", kana: "アクオス ウィッシュ フォー",
    variants: [
      { c: "docomo", code: "SH-52E", rel: "2024年", ship: "free" },
      { c: "ymobile", rel: "2024年7月", ship: "free" }
    ] },
  { id: "aquos-r9", name: "AQUOS R9", maker: "aquos", kana: "アクオス アール ナイン",
    variants: [
      { c: "docomo", code: "SH-51E", rel: "2024年", ship: "free" },
      { c: "sb", code: "A401SH", rel: "2024年", ship: "free" }
    ] },
  { id: "aquos-r9-pro", name: "AQUOS R9 pro", maker: "aquos", kana: "アクオス アール ナイン プロ",
    variants: [
      { c: "docomo", code: "SH-54E", rel: "2024年", ship: "free" }
    ] },
  { id: "basio-active2", name: "BASIO active2", maker: "aquos", kana: "ベイシオ アクティブ ツー シニア",
    variants: [
      { c: "au", code: "SHG12", rel: "2024年4月", ship: "free" }
    ], note: "シャープ製のau向けかんたんスマホ。設定 ＞ システム ＞ 端末情報 ＞「SIMロックの状態」で確認" },
  { id: "aquos-sense8", name: "AQUOS sense8", maker: "aquos", kana: "アクオス センス エイト",
    variants: [
      { c: "docomo", code: "SH-54D", rel: "2023年11月", ship: "free" },
      { c: "au", code: "SHG11", rel: "2023年11月", ship: "free" }
    ] },
  { id: "aquos-wish3", name: "AQUOS wish3", maker: "aquos", kana: "アクオス ウィッシュ スリー",
    variants: [
      { c: "docomo", code: "SH-53D", rel: "2023年8月", ship: "free" },
      { c: "sb", code: "A303SH", rel: "2023年", ship: "free" },
      { c: "ymobile", code: "A302SH", rel: "2023年", ship: "free" }
    ] },
  { id: "aquos-r8-pro", name: "AQUOS R8 pro", maker: "aquos", kana: "アクオス アール エイト プロ",
    variants: [
      { c: "docomo", code: "SH-51D", rel: "2023年6月", ship: "free" },
      { c: "sb", code: "A301SH", rel: "2023年7月", ship: "free" }
    ] },
  { id: "aquos-r8", name: "AQUOS R8", maker: "aquos", kana: "アクオス アール エイト",
    variants: [
      { c: "docomo", code: "SH-52D", rel: "2023年6月", ship: "free" }
    ] },
  { id: "aquos-sense7", name: "AQUOS sense7", maker: "aquos", kana: "アクオス センス セブン",
    variants: [
      { c: "docomo", code: "SH-53C", rel: "2022年11月", ship: "free" },
      { c: "au", code: "SHG10", rel: "2022年11月", ship: "free" }
    ] },
  { id: "aquos-wish2", name: "AQUOS wish2", maker: "aquos", kana: "アクオス ウィッシュ ツー",
    variants: [
      { c: "docomo", code: "SH-51C", rel: "2022年", ship: "free" },
      { c: "au", code: "SHG08", rel: "2022年9月", ship: "free" },
      { c: "ymobile", code: "A204SH", rel: "2022年6月", ship: "free" }
    ] },
  { id: "basio-active", name: "BASIO active", maker: "aquos", kana: "ベイシオ アクティブ シニア",
    variants: [
      { c: "au", code: "SHG09", rel: "2022年9月", ship: "free" }
    ], note: "京セラのBASIOシリーズとは別の、シャープ製のau向けかんたんスマホ。設定 ＞ システム ＞ 端末情報 ＞「SIMロックの状態」で確認" },
  { id: "aquos-wish", name: "AQUOS wish", maker: "aquos", kana: "アクオス ウィッシュ",
    variants: [
      { c: "au", code: "SHG06", rel: "2022年1月", ship: "free" },
      { c: "ymobile", code: "A104SH", rel: "2022年", ship: "free" }
    ] },
  { id: "aquos-r7", name: "AQUOS R7", maker: "aquos", kana: "アクオス アール セブン",
    variants: [
      { c: "docomo", code: "SH-52C", rel: "2022年6月", ship: "free" },
      { c: "sb", rel: "2022年6月", ship: "free" }
    ] },
  { id: "aquos-sense6s", name: "AQUOS sense6s", maker: "aquos", kana: "アクオス センス シックス エス",
    variants: [
      { c: "au", code: "SHG07", rel: "2022年4月", ship: "free" }
    ] },
  { id: "aquos-new", name: "AQUOS 上記以外の2021年11月以降発売モデル", maker: "aquos", kana: "アクオス センス ウィッシュ",
    variants: [
      { c: "docomo", rel: "2021年11月〜", ship: "free" },
      { c: "au", rel: "2021年11月〜", ship: "free" },
      { c: "sb", rel: "2021年11月〜", ship: "free" },
      { c: "uq", rel: "2021年11月〜", ship: "free" },
      { c: "ymobile", rel: "2021年11月〜", ship: "free" },
      { c: "rakuten", rel: "2021年11月〜", ship: "free" },
      { c: "free", rel: "2021年11月〜", ship: "free" }
    ] },
  { id: "aquos-sense6", name: "AQUOS sense6", maker: "aquos", kana: "アクオス センス シックス",
    variants: [
      { c: "docomo", code: "SH-54B", rel: "2021年11月", ship: "free" },
      { c: "au", code: "SHG05", rel: "2021年11月", ship: "free" }
    ] },
  { id: "aquos-zero6", name: "AQUOS zero6", maker: "aquos", kana: "アクオス ゼロ シックス",
    variants: [
      { c: "sb", code: "A102SH", rel: "2021年10月", ship: "free" }
    ] },
  { id: "aquos-r6", name: "AQUOS R6", maker: "aquos", kana: "アクオス アール シックス",
    variants: [
      { c: "docomo", code: "SH-51B", rel: "2021年6月", ship: "locked" },
      { c: "sb", code: "A101SH", rel: "2021年7月", ship: "cond" }
    ] },
  { id: "aquos-sense5g", name: "AQUOS sense5G", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-53A", rel: "2021年2月", ship: "locked" },
      { c: "au", code: "SHG03", rel: "2021年2月", ship: "locked" },
      { c: "sb", code: "A004SH", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },
  { id: "aquos-sense4-basic", name: "AQUOS sense4 basic", maker: "aquos", kana: "アクオス センス フォー ベーシック",
    variants: [
      { c: "ymobile", code: "A003SH", rel: "2021年", ship: "cond" }
    ] },
  { id: "aquos-sense4", name: "AQUOS sense4", maker: "aquos", kana: "アクオス センス フォー",
    variants: [
      { c: "docomo", code: "SH-41A", rel: "2020年11月", ship: "locked" },
      { c: "free", code: "SH-M15", rel: "2020年12月", ship: "free" }
    ] },
  { id: "aquos-sense4-lite", name: "AQUOS sense4 lite", maker: "aquos", kana: "アクオス センス フォー ライト",
    variants: [
      { c: "rakuten", code: "SH-RM15", rel: "2020年12月", ship: "free" },
      { c: "free", code: "SH-RM15", rel: "2020年12月", ship: "free" }
    ] },
  { id: "aquos-sense3-basic", name: "AQUOS sense3 basic", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "au", code: "SHV48", rel: "2020年6月", ship: "locked" },
      { c: "uq", code: "SHV48", rel: "2020年", ship: "locked" }
    ] },
  { id: "aquos-r5g", name: "AQUOS R5G", maker: "aquos", kana: "アクオス アール ファイブジー",
    variants: [
      { c: "docomo", code: "SH-51A", rel: "2020年3月", ship: "locked" },
      { c: "au", code: "SHG01", rel: "2020年3月", ship: "locked" },
      { c: "sb", code: "908SH", rel: "2020年3月", ship: "locked" }
    ] },
  { id: "aquos-r3", name: "AQUOS R3", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-04L", rel: "2019年", ship: "locked" },
      { c: "au", code: "SHV44", rel: "2019年", ship: "locked" },
      { c: "sb", code: "808SH", rel: "2019年", ship: "locked" }
    ] },
  { id: "aquos-sense3", name: "AQUOS sense3", maker: "aquos", kana: "アクオス センス",
    variants: [
      { c: "docomo", code: "SH-02M", rel: "2019年", ship: "locked" },
      { c: "au", code: "SHV45", rel: "2019年", ship: "locked" }
    ] },
  { id: "aquos-r2", name: "AQUOS R2", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-03K", rel: "2018年", ship: "locked" },
      { c: "au", code: "SHV42", rel: "2018年", ship: "locked" },
      { c: "sb", code: "706SH", rel: "2018年", ship: "locked" }
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
  { id: "aquos-r", name: "AQUOS R", maker: "aquos", kana: "アクオス アール",
    variants: [
      { c: "docomo", code: "SH-03J", rel: "2017年", ship: "locked" },
      { c: "au", code: "SHV39", rel: "2017年", ship: "locked" }
    ] },
  { id: "aquos-zeta", name: "AQUOS ZETA", maker: "aquos", kana: "アクオス ゼータ",
    variants: [
      { c: "docomo", code: "SH-01H／SH-04H", rel: "2015〜16年", ship: "locked" },
      { c: "au", code: "SHV32", rel: "2015年", ship: "locked" }
    ] },

  // ---------- 京セラ ----------
  { id: "torque-g07", name: "TORQUE G07", maker: "kyocera", kana: "トルク ジーゼロナナ",
    variants: [
      { c: "au", rel: "2026年3月", ship: "free" }
    ] },
  { id: "basio-active3", name: "BASIO active3", maker: "kyocera", kana: "ベイシオ アクティブ スリー シニア",
    variants: [
      { c: "au", code: "KYG04", rel: "2025年4月", ship: "free" }
    ] },
  { id: "torque-g06", name: "TORQUE G06", maker: "kyocera", kana: "トルク ジーゼロロク",
    variants: [
      { c: "au", code: "KYG03", rel: "2023年10月", ship: "free" }
    ] },
  { id: "kantan-sumaho3", name: "かんたんスマホ3", maker: "kyocera", kana: "かんたんスマホ シニア",
    variants: [
      { c: "ymobile", code: "A205KC", rel: "2023年3月", ship: "free" }
    ] },
  { id: "digno-sx3", name: "DIGNO SX3", maker: "kyocera", kana: "ディグノ",
    variants: [
      { c: "au", code: "KYG02", rel: "2022年", ship: "free" }
    ] },
  { id: "kantan-sumaho2-plus", name: "かんたんスマホ2+", maker: "kyocera", kana: "かんたんスマホ シニア プラス",
    variants: [
      { c: "ymobile", code: "A201KC", rel: "2022年", ship: "free" }
    ] },
  { id: "anshin-ky51b", name: "あんしんスマホ KY-51B", maker: "kyocera", kana: "あんしんスマホ シニア",
    variants: [
      { c: "docomo", code: "KY-51B", rel: "2022年2月", ship: "free" }
    ] },
  { id: "torque-5g", name: "TORQUE 5G", maker: "kyocera", kana: "トルク ファイブジー",
    variants: [
      { c: "au", code: "KYG01", rel: "2021年11月", ship: "free" }
    ] },
  { id: "kantan-sumaho2", name: "かんたんスマホ2", maker: "kyocera", kana: "かんたんスマホ シニア",
    variants: [
      { c: "ymobile", code: "A001KC", rel: "2021年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し。他社SIMで解除コード画面の有無を確認" }
    ] },
  { id: "basio4", name: "BASIO4", maker: "kyocera", kana: "ベイシオ シニア",
    path: { steps: ["その他の設定", "デバイス情報"], target: "SIMカードの状態" },
    variants: [
      { c: "au", code: "KYV47", rel: "2020年", ship: "locked" },
      { c: "uq", code: "KYV47", rel: "2020年", ship: "locked" }
    ] },
  { id: "torque-g04", name: "TORQUE G04", maker: "kyocera", kana: "トルク",
    variants: [
      { c: "au", code: "KYV46", rel: "2020年", ship: "locked" }
    ] },
  { id: "basio3", name: "BASIO3", maker: "kyocera", kana: "ベイシオ シニア",
    path: { steps: ["ツール", "設定", "端末情報"], target: "SIMカードの状態" },
    variants: [
      { c: "au", code: "KYV43", rel: "2018年", ship: "locked" }
    ] },
  { id: "torque-g03", name: "TORQUE G03", maker: "kyocera", kana: "トルク",
    variants: [
      { c: "au", code: "KYV41", rel: "2018年", ship: "locked" }
    ] },
  { id: "basio2", name: "BASIO2", maker: "kyocera", kana: "ベイシオ シニア",
    variants: [
      { c: "au", code: "KYV39", rel: "2017年", ship: "locked" }
    ] },
  { id: "basio", name: "BASIO（初代）", maker: "kyocera", kana: "ベイシオ シニア",
    variants: [
      { c: "au", code: "KYV32", rel: "2016年", ship: "locked" }
    ] },
  { id: "kantan-sumaho1", name: "かんたんスマホ（初代）", maker: "kyocera", kana: "かんたんスマホ シニア",
    variants: [
      { c: "ymobile", code: "501KC", rel: "2016年", ship: "locked" }
    ] },
  { id: "digno", name: "DIGNO A / E / G / J / SANGA", maker: "kyocera", kana: "ディグノ",
    variants: [
      { c: "au", rel: "2016〜19年", ship: "locked", note: "au向けDIGNOシリーズ全般。設定 ＞ 端末情報 ＞ ステータス情報 ＞「SIMロックの状態」で確認" },
      { c: "ymobile", rel: "2018〜19年", ship: "locked", note: "Y!mobile向け（DIGNO J等）" },
      { c: "sb", rel: "2018〜19年", ship: "locked", note: "ソフトバンク向け（DIGNO G等）他社SIM挿入で解除コード画面の有無を確認" }
    ] },

  // ---------- arrows・らくらくスマートフォン ----------
  { id: "arrows-alpha2", name: "arrows Alpha2", maker: "fcnt", kana: "アローズ アルファ",
    variants: [
      { c: "rakuten", rel: "2026年", ship: "free" }
    ] },
  { id: "arrows-we3", name: "arrows We3", maker: "fcnt", kana: "アローズ ウィー",
    variants: [
      { c: "au", rel: "2026年6月", ship: "free" }
    ] },
  { id: "arrows-alpha", name: "arrows Alpha", maker: "fcnt", kana: "アローズ アルファ",
    variants: [
      { c: "docomo", rel: "2025年8月", ship: "free" },
      { c: "free", rel: "2025年8月", ship: "free" }
    ] },
  { id: "raku-f53e", name: "らくらくスマートフォン F-53E", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [
      { c: "docomo", code: "F-53E", rel: "2025年1月", ship: "free" }
    ] },
  { id: "raku-lite", name: "らくらくスマートフォン Lite MR01", maker: "fcnt", kana: "らくらくホン シニア ライト",
    variants: [
      { c: "uq", rel: "2025年1月", ship: "free" },
      { c: "free", rel: "2025年1月", ship: "free" }
    ] },
  { id: "arrows-n", name: "arrows N", maker: "fcnt", kana: "アローズ エヌ",
    variants: [
      { c: "docomo", code: "F-51C", rel: "2022年11月", ship: "free" }
    ] },
  { id: "raku-f52b", name: "らくらくスマートフォン F-52B", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [
      { c: "docomo", code: "F-52B", rel: "2022年2月", ship: "free" }
    ] },
  { id: "arrows-we", name: "arrows We", maker: "fcnt", kana: "アローズ",
    variants: [
      { c: "docomo", code: "F-51B", rel: "2021年12月", ship: "free" },
      { c: "au", code: "FCG01", rel: "2021年12月", ship: "free" },
      { c: "sb", code: "A101FC", rel: "2021年12月", ship: "free" }
    ] },
  { id: "arrows-be4plus", name: "arrows Be4 Plus", maker: "fcnt", kana: "アローズ",
    variants: [
      { c: "docomo", code: "F-41B", rel: "2021年", ship: "locked" }
    ] },
  { id: "raku-f42a", name: "らくらくスマートフォン", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [
      { c: "docomo", code: "F-42A", rel: "2020年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }
    ] },
  { id: "arrows-5g", name: "arrows 5G", maker: "fcnt", kana: "アローズ",
    variants: [
      { c: "docomo", code: "F-51A", rel: "2020年", ship: "locked" }
    ] },
  { id: "raku-f04j", name: "らくらくスマートフォン me", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [
      { c: "docomo", code: "F-01L", rel: "2019年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }
    ] },
  { id: "arrows-m05", name: "arrows M05", maker: "fcnt", kana: "アローズ エム ゼロゴ シムフリー",
    variants: [
      { c: "free", rel: "2019年", ship: "free" }
    ], note: "富士通コネクテッドテクノロジーズのSIMフリー端末。ロックなし" },
  { id: "arrows-be3", name: "arrows Be3", maker: "fcnt", kana: "アローズ ビー スリー",
    variants: [
      { c: "docomo", code: "F-02L", rel: "2019年2月", ship: "locked" }
    ] },
  { id: "arrows-be", name: "arrows Be", maker: "fcnt", kana: "アローズ ビー",
    variants: [
      { c: "docomo", code: "F-04K", rel: "2018年6月", ship: "locked" }
    ] },
  { id: "arrows-u", name: "arrows U", maker: "fcnt", kana: "アローズ ユー",
    variants: [
      { c: "sb", code: "801FJ", rel: "2018年", ship: "locked" }
    ] },
  { id: "arrows-m04", name: "arrows M04", maker: "fcnt", kana: "アローズ エム ゼロヨン シムフリー",
    variants: [
      { c: "free", rel: "2018年", ship: "free" }
    ], note: "富士通コネクテッドテクノロジーズのSIMフリー端末。ロックなし" },
  { id: "raku-4", name: "らくらくスマートフォン4", maker: "fcnt", kana: "らくらくホン シニア",
    variants: [
      { c: "docomo", code: "F-04J", rel: "2017年", ship: "locked", note: "ドコモショップでIMEI照会が早い" }
    ], note: "ドコモショップでIMEI照会が早い" },
  { id: "arrows-nx", name: "arrows NX", maker: "fcnt", kana: "アローズ エヌエックス",
    variants: [
      { c: "docomo", code: "F-01J／F-02H", rel: "2016〜17年", ship: "locked" }
    ] },

  // ---------- OPPO ----------
  { id: "oppo-reno15a", name: "OPPO Reno15 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", rel: "2026年", ship: "free" },
      { c: "rakuten", rel: "2026年", ship: "free" },
      { c: "free", rel: "2026年", ship: "free" }
    ] },
  { id: "oppo-a5-5g", name: "OPPO A5 5G", maker: "oppo", kana: "オッポ エーファイブ",
    variants: [
      { c: "ymobile", rel: "2025年12月", ship: "free" },
      { c: "uq", rel: "2025年", ship: "free" },
      { c: "rakuten", rel: "2025年", ship: "free" }
    ] },
  { id: "oppo-reno13a", name: "OPPO Reno13 A", maker: "oppo", kana: "オッポ リノ サーティーン エー",
    variants: [
      { c: "ymobile", rel: "2025年6月", ship: "free" },
      { c: "rakuten", rel: "2025年6月", ship: "free" },
      { c: "free", rel: "2025年6月", ship: "free" }
    ] },
  { id: "oppo-a3-5g", name: "OPPO A3 5G", maker: "oppo", kana: "オッポ エースリー",
    variants: [
      { c: "ymobile", rel: "2024年12月", ship: "free" }
    ] },
  { id: "oppo-reno11a", name: "OPPO Reno11 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", rel: "2024年", ship: "free" }
    ] },
  { id: "oppo-a79-5g", name: "OPPO A79 5G", maker: "oppo", kana: "オッポ エーナナジュウキュウ",
    variants: [
      { c: "ymobile", rel: "2023年", ship: "free" }
    ] },
  { id: "oppo-reno9a", name: "OPPO Reno9 A", maker: "oppo", kana: "オッポ リノ ナイン エー",
    variants: [
      { c: "ymobile", rel: "2023年6月", ship: "free" },
      { c: "rakuten", rel: "2023年6月", ship: "free" },
      { c: "free", rel: "2023年6月", ship: "free" }
    ] },
  { id: "oppo-reno10-pro", name: "OPPO Reno10 Pro 5G", maker: "oppo", kana: "オッポ リノ テン プロ",
    variants: [
      { c: "sb", code: "A302OP", rel: "2023年", ship: "free" },
      { c: "free", rel: "2023年", ship: "free" }
    ] },
  { id: "oppo-reno7a", name: "OPPO Reno7 A", maker: "oppo", kana: "オッポ リノ セブン エー",
    variants: [
      { c: "ymobile", code: "A201OP", rel: "2022年6月", ship: "free" },
      { c: "au", code: "OPG04", rel: "2022年6月", ship: "free" },
      { c: "uq", code: "OPG04", rel: "2022年6月", ship: "free" },
      { c: "rakuten", rel: "2022年6月", ship: "free" },
      { c: "free", code: "CPH2353", rel: "2022年6月", ship: "free" }
    ] },
  { id: "oppo-a55s", name: "OPPO A55s 5G", maker: "oppo", kana: "オッポ エーゴジューゴエス",
    variants: [
      { c: "sb", code: "A102OP", rel: "2021年11月", ship: "free" },
      { c: "rakuten", rel: "2021年11月", ship: "free" },
      { c: "free", rel: "2021年11月", ship: "free" }
    ], note: "SoftBank・楽天モバイルの取り扱い（au・UQでの販売は無し）。2021/11/26発売でSIMロックなし" },
  { id: "oppo-a54", name: "OPPO A54 5G", maker: "oppo", kana: "オッポ",
    variants: [
      { c: "au", code: "OPG02", rel: "2021年6月", ship: "locked" },
      { c: "uq", code: "OPG02", rel: "2021年6月", ship: "locked" }
    ] },
  { id: "oppo-reno5a", name: "OPPO Reno5 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", code: "A101OP", rel: "2021年6月", ship: "cond", note: "2021/5/12以降の購入なら解除済で渡し。他社SIMで確認" },
      { c: "rakuten", rel: "2021年6月", ship: "free" },
      { c: "free", code: "CPH2199", rel: "2021年6月", ship: "free" }
    ] },
  { id: "oppo-find-x3-pro", name: "OPPO Find X3 Pro", maker: "oppo", kana: "オッポ ファインド エックススリー プロ",
    variants: [
      { c: "au", code: "OPG03", rel: "2021年6月", ship: "locked" }
    ] },
  { id: "oppo-reno3a", name: "OPPO Reno3 A", maker: "oppo", kana: "オッポ リノ",
    variants: [
      { c: "ymobile", rel: "2020年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "rakuten", rel: "2020年", ship: "free" },
      { c: "free", code: "CPH2013", rel: "2020年", ship: "free" }
    ] },
  { id: "oppo-a73", name: "OPPO A73", maker: "oppo", kana: "オッポ",
    variants: [
      { c: "rakuten", rel: "2020年", ship: "free" },
      { c: "free", code: "CPH2099", rel: "2020年", ship: "free" }
    ] },
  { id: "oppo-find-x2-pro", name: "OPPO Find X2 Pro", maker: "oppo", kana: "オッポ ファインド エックスツー プロ",
    variants: [
      { c: "au", code: "OPG01", rel: "2020年6月", ship: "locked" }
    ] },
  { id: "oppo-a5-2020", name: "OPPO A5 2020", maker: "oppo", kana: "オッポ エーファイブ",
    variants: [
      { c: "uq", rel: "2020年", ship: "locked" }
    ] },
  { id: "oppo-reno3-5g", name: "OPPO Reno3 5G", maker: "oppo", kana: "オッポ リノ スリー",
    variants: [
      { c: "sb", code: "A001OP", rel: "2020年", ship: "locked" }
    ] },

  // ---------- Xiaomi ----------
  { id: "redmi-14c", name: "Redmi 14C", maker: "xiaomi", kana: "レッドミー フォーティーン シー シャオミ",
    variants: [
      { c: "free", rel: "2025年", ship: "free" }
    ] },
  { id: "redmi-note-14-pro", name: "Redmi Note 14 Pro 5G", maker: "xiaomi", kana: "レッドミー ノート フォーティーン プロ シャオミ",
    variants: [
      { c: "free", rel: "2025年", ship: "free" }
    ] },
  { id: "xiaomi-14t", name: "Xiaomi 14T", maker: "xiaomi", kana: "シャオミ フォーティーンティー",
    variants: [
      { c: "uq", rel: "2024年12月", ship: "free" }
    ] },
  { id: "redmi-note-13-pro-plus", name: "Redmi Note 13 Pro+ 5G", maker: "xiaomi", kana: "レッドミー ノート サーティーン プロ プラス シャオミ",
    variants: [
      { c: "free", rel: "2024年", ship: "free" }
    ] },
  { id: "xiaomi-13t", name: "Xiaomi 13T", maker: "xiaomi", kana: "シャオミ サーティーンティー",
    variants: [
      { c: "au", code: "XIG04", rel: "2023年12月", ship: "free" },
      { c: "uq", code: "XIG04", rel: "2023年12月", ship: "free" }
    ] },
  { id: "redmi-12-5g", name: "Redmi 12 5G", maker: "xiaomi", kana: "レッドミー トゥエルブ シャオミ",
    variants: [
      { c: "au", code: "XIG03", rel: "2023年10月", ship: "free" },
      { c: "uq", code: "XIG03", rel: "2023年10月", ship: "free" }
    ] },
  { id: "redmi-note-11-pro-5g", name: "Redmi Note 11 Pro 5G", maker: "xiaomi", kana: "レッドミー ノート イレブン プロ シャオミ",
    variants: [
      { c: "free", rel: "2022年", ship: "free" }
    ] },
  { id: "redmi-note-10t", name: "Redmi Note 10T", maker: "xiaomi", kana: "レッドミー ノート テン ティー シャオミ",
    variants: [
      { c: "sb", code: "A101XM", rel: "2022年4月", ship: "free" }
    ] },
  { id: "redmi-note-10-je", name: "Redmi Note 10 JE", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [
      { c: "au", code: "XIG02", rel: "2021年8月", ship: "free", note: "解除済みの状態で出荷（au取説に記載）" },
      { c: "uq", code: "XIG02", rel: "2021年8月", ship: "free", note: "解除済みの状態で出荷" }
    ] },
  { id: "redmi-9t", name: "Redmi 9T", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [
      { c: "rakuten", rel: "2021年", ship: "free" },
      { c: "uq", rel: "2021年", ship: "locked" }
    ] },
  { id: "redmi-note-10-pro", name: "Redmi Note 10 Pro", maker: "xiaomi", kana: "レッドミー ノート テン プロ シャオミ",
    variants: [
      { c: "free", rel: "2021年", ship: "free" }
    ] },
  { id: "redmi-note-9t", name: "Redmi Note 9T", maker: "xiaomi", kana: "レッドミー シャオミ",
    variants: [
      { c: "sb", code: "A001XM", rel: "2021年2月", ship: "locked", note: "他社SIMで解除コード入力画面＝ロック中。My SoftBankでIMEIからコード発行" }
    ] },
  { id: "redmi-note-9s", name: "Redmi Note 9S", maker: "xiaomi", kana: "レッドミー ノート ナイン エス シャオミ",
    variants: [
      { c: "free", rel: "2020年", ship: "free" }
    ] },

  // ---------- Motorola ----------
  { id: "moto-g66y", name: "moto g66y 5G", maker: "motorola", kana: "モト モトローラ",
    variants: [
      { c: "ymobile", rel: "2025年", ship: "free" }
    ] },
  { id: "razr-50s", name: "razr 50s", maker: "motorola", kana: "モト レイザー 折りたたみ モトローラ",
    variants: [
      { c: "sb", rel: "2024年9月", ship: "free" }
    ] },
  { id: "moto-g64y", name: "moto g64y 5G", maker: "motorola", kana: "モト モトローラ",
    variants: [
      { c: "ymobile", rel: "2024年", ship: "free" }
    ] },
  { id: "moto-g53j", name: "moto g53j 5G", maker: "motorola", kana: "モト ジー モトローラ",
    variants: [
      { c: "free", rel: "2023年", ship: "free" }
    ] },
  { id: "moto-g53y", name: "moto g53y 5G", maker: "motorola", kana: "モト ジー モトローラ",
    variants: [
      { c: "ymobile", code: "A301MO", rel: "2023年6月", ship: "free" }
    ] },
  { id: "moto-g52j", name: "moto g52j 5G", maker: "motorola", kana: "モト ジー モトローラ",
    variants: [
      { c: "free", rel: "2022年", ship: "free" }
    ] },

  // ---------- ZTE (Libero) ----------
  { id: "kantan-sumaho5", name: "かんたんスマホ5", maker: "zte", kana: "かんたんスマホ シニア ゼットティーイー",
    variants: [
      { c: "ymobile", code: "A601ZT", rel: "2026年", ship: "free" }
    ] },
  { id: "libero-flip", name: "Libero Flip", maker: "zte", kana: "リベロ フリップ 折りたたみ",
    variants: [
      { c: "ymobile", code: "A304ZT", rel: "2024年", ship: "free" }
    ] },
  { id: "libero-5g-iv", name: "Libero 5G IV", maker: "zte", kana: "リベロ ゼットティーイー",
    variants: [
      { c: "ymobile", code: "A302ZT", rel: "2023年", ship: "free" }
    ] },
  { id: "libero-5g-iii", name: "Libero 5G III", maker: "zte", kana: "リベロ ゼットティーイー",
    variants: [
      { c: "ymobile", code: "A202ZT", rel: "2022年", ship: "free" }
    ] },
  { id: "libero-5g-ii", name: "Libero 5G II", maker: "zte", kana: "リベロ ゼットティーイー",
    variants: [
      { c: "ymobile", code: "A103ZT", rel: "2021年12月", ship: "free" }
    ] },
  { id: "libero-5g", name: "Libero 5G", maker: "zte", kana: "リベロ ゼットティーイー",
    variants: [
      { c: "ymobile", code: "A003ZT", rel: "2021年4月", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" }
    ] },

  // ---------- HUAWEI ----------
  { id: "huawei-p20lite", name: "HUAWEI P20 lite", maker: "huawei", kana: "ファーウェイ",
    variants: [
      { c: "au", code: "HWV32", rel: "2018年", ship: "locked" },
      { c: "ymobile", rel: "2018年", ship: "cond", note: "2021/5/12以降の購入分は解除済で渡し" },
      { c: "free", code: "ANE-LX2J", rel: "2018年", ship: "free" }
    ] },

  // ---------- ASUS ----------
  { id: "rog-phone-9", name: "ROG Phone 9", maker: "asus", kana: "ロッグ フォン エイスース ゲーミング",
    variants: [
      { c: "free", rel: "2024年11月", ship: "free" }
    ] },
  { id: "zenfone-11-ultra", name: "Zenfone 11 Ultra", maker: "asus", kana: "ゼンフォン エイスース",
    variants: [
      { c: "free", rel: "2024年7月", ship: "free" }
    ] },
  { id: "rog-phone-8", name: "ROG Phone 8", maker: "asus", kana: "ロッグ フォン エイスース ゲーミング",
    variants: [
      { c: "free", rel: "2024年5月", ship: "free" }
    ] },
  { id: "zenfone-10", name: "Zenfone 10", maker: "asus", kana: "ゼンフォン エイスース",
    variants: [
      { c: "free", rel: "2023年", ship: "free" }
    ] },
  { id: "zenfone-9", name: "Zenfone 9", maker: "asus", kana: "ゼンフォン エイスース",
    variants: [
      { c: "free", rel: "2022年", ship: "free" }
    ] },

  // ---------- LG ----------
  { id: "lg-style3", name: "LG style3", maker: "lg", kana: "エルジー スタイル スリー",
    variants: [
      { c: "docomo", code: "L-41A", rel: "2020年12月", ship: "locked" }
    ] },
  { id: "lg-v60", name: "LG V60 ThinQ 5G", maker: "lg", kana: "エルジー ブイシックスティー",
    variants: [
      { c: "docomo", code: "L-51A", rel: "2020年11月", ship: "locked" }
    ] },
  { id: "lg-velvet", name: "LG VELVET", maker: "lg", kana: "エルジー ベルベット",
    variants: [
      { c: "docomo", code: "L-52A", rel: "2020年10月", ship: "locked" }
    ] },

  // ---------- TCL ----------
  { id: "tcl-10-5g", name: "TCL 10 5G", maker: "tcl", kana: "ティーシーエル",
    variants: [
      { c: "free", rel: "2020年11月", ship: "free" }
    ] },

  // ---------- BALMUDA ----------
  { id: "balmuda-phone", name: "BALMUDA Phone", maker: "balmuda", kana: "バルミューダ フォン",
    variants: [
      { c: "sb", code: "A101BM", rel: "2021年11月", ship: "free" }
    ], note: "ソフトバンク専売。SIMロックなしで販売" },

  // ---------- HTC ----------
  { id: "htc-u23-pro", name: "HTC U23 pro", maker: "htc", kana: "エイチティーシー ユー",
    variants: [
      { c: "free", rel: "2023年7月", ship: "free" }
    ] },
  { id: "htc-desire-22-pro", name: "HTC Desire 22 pro", maker: "htc", kana: "エイチティーシー デザイア",
    variants: [
      { c: "free", rel: "2022年10月", ship: "free" }
    ] },

  // ---------- その他Android ----------
  { id: "mive-kesma", name: "MIVE ケースマ", maker: "android", mfr: "alt", kana: "ミーブ ケースマ ガラケー型 アルト",
    variants: [
      { c: "free", code: "AT-M140J", rel: "2026年2月", ship: "free" }
    ], note: "物理キー搭載のフィーチャーフォン型スマートフォン（4G）。SIMフリー" },
  { id: "rakuten-hand-5g", name: "Rakuten Hand 5G", maker: "android", mfr: "rakuten", kana: "楽天 ラクテン ハンド ファイブジー",
    variants: [
      { c: "rakuten", code: "P780", rel: "2022年2月", ship: "free" }
    ] },
  { id: "rakuten-big-s", name: "Rakuten BIG s", maker: "android", mfr: "rakuten", kana: "楽天 ラクテン ビッグ",
    variants: [
      { c: "rakuten", rel: "2021年", ship: "free" }
    ] },
  { id: "rakuten-hand", name: "Rakuten Hand", maker: "android", mfr: "rakuten", kana: "楽天 ラクテン ハンド",
    variants: [
      { c: "rakuten", code: "P710", rel: "2020年12月", ship: "free", note: "Rakuten Mini・Hand はeSIMのみ" }
    ] },
  { id: "rakuten-big", name: "Rakuten BIG", maker: "android", mfr: "rakuten", kana: "楽天 ラクテン ビッグ",
    variants: [
      { c: "rakuten", rel: "2020年", ship: "free" }
    ] },
  { id: "rakuten-mini", name: "Rakuten Mini", maker: "android", mfr: "rakuten", kana: "楽天 ラクテン ミニ",
    variants: [
      { c: "rakuten", code: "C330", rel: "2019年10月", ship: "free" }
    ], note: "eSIMのみ" },

  // ---------- ガラホ ----------
  { id: "aquos-keitai", name: "AQUOSケータイ（ガラホ）", maker: "garaho", brand: "aquos", kana: "アクオス ケータイ ガラホ",
    variants: [
      { c: "docomo", code: "SH-02L", rel: "2019年", ship: "locked" },
      { c: "sb", code: "805SH（AQUOSケータイ3）", rel: "2019年", ship: "locked", note: "My SoftBankでIMEI照会も可" }
    ] },
  { id: "gratina", name: "GRATINA（ガラホ）", maker: "garaho", brand: "kyocera", kana: "グラティーナ ガラホ",
    variants: [
      { c: "au", code: "KYF39", rel: "2019年", ship: "locked", note: "他社SIM挿入でアンテナが立つか／My auで「SIMロック解除可否」確認" }
    ] },
  { id: "digno-keitai3", name: "DIGNOケータイ3（ガラホ）", maker: "garaho", brand: "kyocera", kana: "ディグノ ケータイ ガラホ",
    variants: [
      { c: "sb", code: "903KC", rel: "2019年", ship: "locked", note: "My SoftBankでIMEI照会も可" }
    ] },

  // ---------- 汎用（機種が見つからない時） ----------
  ...["iphone", "pixel", "xperia", "galaxy", "aquos", "kyocera", "oppo", "xiaomi", "fcnt", "motorola", "zte", "asus", "lg", "tcl", "htc", "balmuda", "android", "garaho"].map(m => ({
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
