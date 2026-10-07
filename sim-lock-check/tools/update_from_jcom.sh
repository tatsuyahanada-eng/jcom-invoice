#!/usr/bin/env bash
# J:COMチェッカーを取得し直し、前回との差分があれば jcom_checker.json / jcom_ref.js / JCOM_COMPARE.md を更新する
#   bash tools/update_from_jcom.sh        （終了コード 0=差分なし／10=差分あり・更新済み／それ以外=エラー）
set -euo pipefail
cd "$(dirname "$0")/.."
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
TODAY="$(TZ=Asia/Tokyo date +%F)"
curl -sSL --fail -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36" \
  "https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html" -o "$TMP/device.html"
cp tools/jcom_checker.json "$TMP/old.json"
python3 tools/extract_jcom_checker.py "$TMP/device.html"          # → tools/jcom_checker.json（新）
N=$(python3 -c "import json;print(len(json.load(open('tools/jcom_checker.json'))))")
if [ "$N" -lt 1000 ]; then echo "取得件数が少なすぎます($N)。ページ構成が変わった可能性があるため中止" >&2; cp "$TMP/old.json" tools/jcom_checker.json; exit 2; fi
set +e; python3 tools/jcom_diff.py "$TMP/old.json" tools/jcom_checker.json "$TODAY"; RC=$?; set -e
JCOM_DATE="$TODAY" node tools/jcom_compare.js
exit $RC
