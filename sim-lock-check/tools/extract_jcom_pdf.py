#!/usr/bin/env python3
"""J:COMモバイル「動作確認端末チェッカー」のPDFから、購入キャリア／メーカー／機種名を抜き出して tools/jcom_source.json に保存する（要 PyMuPDF）"""
import sys, json, os
import pymupdf as fitz
pdf = sys.argv[1]
CAR = {'SIMフリー', 'docomo', 'au', 'SoftBank', 'UQ', 'Y!mobile', '楽天モバイル'}
rows = []
for pi, p in enumerate(fitz.open(pdf)):
    for b in p.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            t = ''.join(s['text'] for s in l['spans']).strip()
            if t: rows.append((pi + 1, l['bbox'][1], l['bbox'][0], round(l['spans'][0]['size'], 1), t))
rows.sort(key=lambda r: (r[0], r[1]))
car = mfr = None; data = {}
for pg, y, x, sz, t in rows:
    if sz == 13.0 and t in CAR: car, mfr = t, None          # キャリア見出し
    elif sz == 12.1: mfr = t                                  # メーカー見出し
    elif sz == 7.4 and abs(x - 139) < 2 and car and mfr: data.setdefault((car, mfr), []).append(t)   # 機種名
out = [[k[0], k[1], v] for k, v in data.items()]
json.dump(out, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jcom_source.json'), 'w'), ensure_ascii=False, indent=0)
print(sum(len(v) for _, _, v in out), 'entries')
