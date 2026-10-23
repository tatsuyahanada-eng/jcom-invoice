#!/bin/sh
# APP UP FTP Manager - Mac / Linux 用起動スクリプト
cd "$(dirname "$0")/server" || exit 1
[ -d node_modules ] || npm install --omit=dev
exec node server.js
