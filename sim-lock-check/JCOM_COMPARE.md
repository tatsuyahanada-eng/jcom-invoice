# J:COMチェッカーとの照合レポート

- J:COM：「モバイル動作確認端末チェッカー」https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html （1305件、取得 2026-10-07）
- 本ツール：data.js（各キャリア公式で補正済み）。**本ツールのデータは上書きしていません**

## 集計

| J:COM区分 | 一致 | 基準の違い | 相違 | 本ツール未登録 |
|---|---|---|---|---|
| SIMフリー | 303 | 0 | 0 | 0 |
| docomo | 241 | 0 | 1 | 0 |
| au | 190 | 91 | 0 | 0 |
| SoftBank | 205 | 0 | 1 | 0 |
| UQ | 104 | 0 | 0 | 0 |
| Y!mobile | 66 | 0 | 6 | 0 |
| 楽天モバイル | 97 | 0 | 0 | 0 |

## 相違（要確認）

| J:COM区分 | 機種 | 型番 | 発売 | J:COM | 本ツール | 理由 |
|---|---|---|---|---|---|---|
| docomo | AQUOS sense6 SH-54B | SH-54B | 2021年11月 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| SoftBank | OPPO A55s 5G A102OP | A102OP | 2021年11月 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| Y!mobile | iPhone 11 | — | 2019年9月 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| Y!mobile | HUAWEI nova lite for Y!mobile | — | — | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| Y!mobile | Android One S8 | — | — | 不要 | 購入日で判定 | 本ツールは購入日で判定（公式のロックあり機種一覧に掲載）。J:COMは「不要」 |
| Y!mobile | AQUOS wish A104SH | A104SH | 2022年 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| Y!mobile | Xperia 10 III A102SO | A102SO | 2021年 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |
| Y!mobile | moto g53y 5G XT2335-4 | A301MO | 2023年6月 | 要 | 解除不要 | 本ツールは各キャリア公式（発売時期・公式のロックあり機種一覧）で「ロックなし」。J:COMは「要」 |

## 基準の違い（au版：J:COMは「au回線で使う場合」、本ツールは「他社回線で使う場合」）

iPhone 12 Pro（2020年10月）、iPhone 12 Pro Max（2020年11月）、iPhone 12（2020年10月）、iPhone 12 mini（2020年11月）、iPhone SE (第2世代)（2020年5月）、iPhone 11 Pro（2019年9月）、iPhone 11 Pro Max（2019年9月）、iPhone 11（2019年9月）、iPhone XR（2018年10月）、iPhone XS（2018年9月）、iPhone XS Max（2018年9月）、iPhone X（2017年11月）、iPhone 8（2017年9月）、iPhone 8 Plus（2017年9月）、11インチ iPad Pro（第3世代）（2021年5月）、12.9インチ iPad Pro（第5世代）（2021年5月）、iPad Air（第4世代）（2020年10月）、iPad（第8世代）（2020年9月）、11インチ iPad Pro（第2世代）（2020年3月）、12.9インチ iPad Pro（第4世代）（2020年3月）、iPad（第7世代）（2019年9月）、iPad Air（第3世代）（2019年3月）、iPad mini（第5世代）（2019年3月）、11インチ iPad Pro（第1世代）（2018年11月）、12.9インチ iPad Pro（第3世代）（2018年11月）、iPad（第6世代）（2018年3月）、P30 lite Premium HWV33（2019年）、P20 lite HWV32（2018年）、HUAWEI nova 2 HWV31（2017年）、GRATINA KYV48（2020年）、BASIO4 KYV47（2020年）、TORQUE G04 KYV46（2020年）、URBANO V04 KYV45（—）、Qua phone QZ KYV44（—）、BASIO3 KYV43（2018年）、LG it LGV36（2018年）、isai V30+ LGV35（2018年）、OPPO Find X3 Pro OPG03（2021年6月）、OPPO A54 5G OPG02（2021年6月）、OPPO Find X2 Pro OPG01（2020年6月）、Galaxy A21 シンプル SCV49（2020年）、Galaxy S21+ 5G SCG10（—）、Galaxy S21 5G SCG09（2021年4月）、Galaxy A32 5G SCG08（2021年2月）、Galaxy A51 5G SCG07（2020年12月）、Galaxy Z Fold2 5G SCG05（—）、Galaxy Z Flip 5G SCG04（—）、Galaxy Note20 Ultra 5G SCG06（2020年10月）、Galaxy A41 SCV48（2020年）、Galaxy S20 Ultra 5G SCG03（2020年5月）、Galaxy S20+ 5G SCG02（2020年3月）、Galaxy S20 5G SCG01（2020年3月）、Galaxy Z Flip SCV47（—）、Galaxy A20 SCV46（2019年）、Galaxy Fold SCV44（—）、Galaxy Note10+ SCV45（2019年）、Galaxy A30 SCV43（2019年）、Galaxy S10+ SCV42（2019年6月）、Galaxy S10 SCV41（2019年6月）、Galaxy Note9 SCV40（2018年）、Galaxy S9+ SCV39（2018年5月）、Galaxy S9 SCV38（2018年5月）、Galaxy Note8 SCV37（2017年）、AQUOS sense5G SHG03（2021年2月）、AQUOS zero5G basic DX SHG02（—）、AQUOS sense3 basic SHV48（2020年6月）、AQUOS R5G SHG01（2020年3月）、AQUOS zero2 SHV47（2019年）、AQUOS sense3 SHV45（2019年）、AQUOS sense3 plus サウンド SHV46（—）、AQUOS sense2 かんたん SHV43（2018年）、AQUOS R3 SHV44（2019年）、AQUOS sense2 SHV43（2018年）、AQUOS R2 SHV42（2018年）、AQUOS R compact SHV41（—）、AQUOS sense SHV40（2018年）、Xperia 1 III SOG03（2021年7月）、Xperia 10 III SOG04（2021年6月）、Xperia 5 II SOG02（2020年10月）、Xperia 10 II SOV43（2020年）、Xperia 1 II SOG01（2020年5月）、Xperia 8 SOV42（2019年）、Xperia 5 SOV41（2019年）、Xperia 1 SOV40（2019年）、Xperia XZ3 SOV39（2018年）、Xperia XZ2 Premium SOV38（2018年8月）、Xperia XZ2 SOV37（2018年5月）、Xperia XZ1 SOV36（2017年10月）、Mi 10 Lite 5G XIG01（2021年6月）、ZTE a1 ZTG01（2020年8月）、Google Pixel 5（2020年10月）

## J:COMにあり本ツール未登録



## 本ツールにありJ:COMに無い（キャリア版 102件）

- **ドコモ**（49）：iPhone 上記以外の最新モデル（iPhone 18以降など）、Pixel 上記以外の2021年10月以降発売モデル、Pixel 3a XL、Xperia 上記以外の2021年10月以降発売モデル、Xperia X Compact SO-02J、Xperia XZ SO-01J、Xperia X Performance SO-04H、Xperia Z5 SO-01H SO-01H、Xperia Z5 Compact SO-02H SO-02H、Xperia Z5 Premium SO-03H SO-03H、Xperia Z4 SO-03G SO-03G、Xperia A4 SO-04G SO-04G、Galaxy 上記以外の2022年以降発売モデル、Galaxy Z Fold / Z Flip 上記以外の最新モデル、Galaxy S7 edge SC-02H、Galaxy Active neo SC-01H SC-01H、AQUOS 上記以外の2021年11月以降発売モデル、AQUOS EVER SH-02J SH-02J、AQUOS ZETA SH-01H／SH-04H、AQUOS Compact SH-02H SH-02H、AQUOS ZETA SH-03G SH-03G、AQUOS EVER SH-04G SH-04G、AQUOS PAD SH-05G SH-05G、arrows N F-51C、らくらくスマートフォン4 F-04J、arrows SV F-03H F-03H、arrows Fit F-01H F-01H、ARROWS NX F-04G F-04G、arrows NX F-01J／F-02H、M Z-01K Z-01K、MONO MO-01J MO-01J、JOJO（L-02K） L-02K、V20 PRO L-01J L-01J、Disney Mobile on docomo DM-01J DM-01J、Disney Mobile on docomo DM-02H DM-02H、Disney Mobile on docomo DM-01H DM-01H、Disney Mobile on docomo DM-01G DM-01G、DIGNOケータイ KY-42C KY-42C、キッズケータイ SH-03M SH-03M、arrows ケータイ F-03L F-03L、AQUOSケータイ SH-02L SH-02L、AQUOSケータイ カメラレスケータイ SH-02K SH-02K、キッズケータイ F-03J F-03J、P-smartケータイ P-01J P-01J、AQUOSケータイ SH-01J SH-01J、らくらくホン F-02J F-02J、P-01H（ケータイ） P-01H、ARROWS ケータイ F-05G F-05G、AQUOS ケータイ SH-06G SH-06G
- **au**（16）：iPhone 上記以外の最新モデル（iPhone 18以降など）、Pixel 上記以外の2021年10月以降発売モデル、Pixel 4a (5G)、Xperia 上記以外の2021年10月以降発売モデル、Galaxy 上記以外の2022年以降発売モデル、Galaxy Z Fold / Z Flip 上記以外の最新モデル、AQUOS 上記以外の2021年11月以降発売モデル、DIGNO SX3 KYG02、BASIO（初代） KYV32、GRATINA KYF42 KYF42、GRATINA KYF39 KYF39、INFOBAR xv KYX01、AQUOS K SHF34 SHF34、GRATINA KYF37 KYF37、GRATINA 4G（KYF34） KYF34、AQUOS K SHF31 SHF31
- **ソフトバンク**（15）：iPhone 上記以外の最新モデル（iPhone 18以降など）、Pixel 上記以外の2021年10月以降発売モデル、Xperia 上記以外の2021年10月以降発売モデル、Xperia XZ 601SO、Xperia X Performance 502SO、Galaxy Z Fold / Z Flip 上記以外の最新モデル、AQUOS 上記以外の2021年11月以降発売モデル、AQUOSケータイ4、DIGNOケータイ4、DIGNOケータイ3 902KC、AQUOSケータイ3 805SH、かんたん携帯10 807SH、DIGNOケータイ2 702KC、AQUOSケータイ 2 601SH、DIGNOケータイ 501KC
- **UQモバイル**（7）：iPhone 上記以外の最新モデル（iPhone 18以降など）、iPhone 8、iPhone 8 Plus、Xperia 上記以外の2021年10月以降発売モデル、Galaxy 上記以外の2022年以降発売モデル、AQUOS 上記以外の2021年11月以降発売モデル、Redmi 9T
- **ワイモバイル**（15）：iPhone 上記以外の最新モデル（iPhone 18以降など）、iPhone 8、iPhone 8 Plus、Nexus 6P、Nexus 5X、Nexus 6、Xperia 上記以外の2021年10月以降発売モデル、AQUOS 上記以外の2021年11月以降発売モデル、かんたんスマホ3 A205KC、かんたんスマホ5 A601ZT、DIGNOケータイ3 903KC、AQUOSケータイ3 806SH、DIGNOケータイ2 701KC、AQUOSケータイ 2 602SH、DIGNOケータイ 502KC
