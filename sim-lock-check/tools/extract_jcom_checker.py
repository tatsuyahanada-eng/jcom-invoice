#!/usr/bin/env python3
# J:COM「モバイル動作確認端末チェッカー」のページ（HTMLに全機種が埋め込み）から機種データを抽出する
#   curl -sL -A "Mozilla/5.0" https://www.jcom.co.jp/service/mobile/device/sim/detail/device.html -o device.html
#   python3 tools/extract_jcom_checker.py device.html   # → tools/jcom_checker.json
import re, json, html, sys, os
s = open(sys.argv[1], 'rb').read().decode('utf-8', 'ignore')
out = []
for m in re.finditer(r'<details\s+data-category="([^"]*)"\s+data-maker="([^"]*)"\s+data-type="([^"]*)"\s+data-esim="([^"]*)".*?<summary[^>]*>(.*?)</summary>(.*?)</details>', s, re.S):
    cat, mk, tp, es, name, body = m.groups()
    def li(k):
        x = re.search(r'<span class="fw-bold">' + k + r'\s*:</span>(.*?)</li>', body, re.S)
        return html.unescape(re.sub('<[^>]+>', '', x.group(1))).strip() if x else ''
    tds = [html.unescape(re.sub('<[^>]+>', '', t)).strip() for t in re.findall(r'<td[^>]*>(.*?)</td>', body, re.S)]
    notes = [html.unescape(re.sub('<[^>]+>', '', t)).strip() for t in re.findall(r'<ul class="list-note">(.*?)</ul>', body, re.S)]
    out.append({'cat': cat, 'maker': mk, 'type': tp, 'esim': es, 'name': html.unescape(re.sub('<[^>]+>', '', name)).strip(),
                'sim': li('対応SIM'), 'os': li('OSバージョン'), 'unlock': li('SIMロック解除'), 'func': tds[:4], 'note': ' '.join(n for n in notes if n)})
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jcom_checker.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('devices', len(out))
