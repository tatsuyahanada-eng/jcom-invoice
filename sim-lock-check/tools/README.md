# 機種データの追加・更新

`models.dsl` に1機種＝1行で書き、`python3 tools/build.py` を実行すると `data.js` の `DEVICES` が再生成されます。

```
id | 機種名 | 確認手順グループ | 読み(検索用) | キャリア版 | 発売時期 [| mfr=メーカーキー] [## メモ]
```

- キャリア版：`d`=ドコモ `a`=au `s`=ソフトバンク `u`=UQ `y`=ワイモバイル `r`=楽天 `f`=SIMフリー
  - `d:SO-54C`（型番）／`y@2024.07`（そのキャリアだけ発売時期が違う）／`a!F`（ロック有無を強制：F=なし L=あり C=購入時期で異なる）
- ロック有無は発売時期から自動判定（ドコモ2021/8/27・au/UQ 2021/10/1・SB/Y! 2021/10/1以降はロックなし、楽天・SIMフリーは常にロックなし）
- 型番は公式サイト等で確認できたものだけを書く（不明は空欄）
- `legacy.json` は2021年以前の既存データ（`build.py` の REMOVE に載せた機種は除く）

## J:COM「動作確認端末チェッカー」PDFの取り込み
```
python3 tools/extract_jcom_pdf.py <PDFのパス>   # → tools/jcom_source.json
python3 tools/import_jcom.py                    # → tools/jcom_overlay.json（既存データと突き合わせ）
python3 tools/build.py                          # → data.js
```

## 公式一覧による自動補正
`tools/official_locked.json`（各キャリア公式の「SIMロック解除対応機種」一覧）を `build.py` が読み込み、
ロックあり／なしを公式ルールで確定させます。変更内容は `tools/official_changes.log` に出力されます。
一覧を更新したときは JSON を差し替えて `python3 tools/build.py` を実行してください。

## J:COMチェッカーとの照合（上書きなし）
```
curl -sL -A "Mozilla/5.0" https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html -o device.html
python3 tools/extract_jcom_checker.py device.html   # → tools/jcom_checker.json
node tools/jcom_compare.js                          # → jcom_ref.js（詳細画面の参考表示）／JCOM_COMPARE.md／tools/jcom_compare.csv
```
本ツールの判定は変更せず、J:COMの判定を「参考」として並べて表示します。build.py でデータを作り直したら jcom_compare.js も再実行してください。
