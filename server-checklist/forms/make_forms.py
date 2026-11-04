"""デイリー記録の手書き用フォーム（304・306）を HTML で作る。PDF 化は Chromium で行う。"""
import sys, html
out = sys.argv[1]
rooms = sys.argv[2].split(',')

CSS = """
@page { size: A4 landscape; margin: 9mm 10mm 8mm 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Noto Sans CJK JP","Noto Sans JP","Yu Gothic","IPAPGothic","IPA Pゴシック",sans-serif; color: #000; }
.page { page-break-after: always; height: 186mm; display: flex; flex-direction: column; overflow: hidden; }
.page:last-child { page-break-after: auto; }
.top { display: flex; align-items: flex-end; gap: 6mm; margin-bottom: 3mm; }
.ttl { font-size: 17pt; font-weight: 800; letter-spacing: .5pt; }
.ttl { white-space: nowrap; }
.ttl small { font-size: 11pt; font-weight: 600; margin-left: 2mm; }
.room { border: 2px solid #000; border-radius: 2mm; padding: 0 3mm; font-size: 18pt; font-weight: 900; }
.fill { margin-left: auto; display: flex; gap: 6mm; font-size: 10.5pt; }
.fill span { border-bottom: 1px solid #000; padding: 0 1mm; white-space: nowrap; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1; }
th, td { border: 1px solid #000; text-align: center; vertical-align: middle; }
thead th { background: #e6e6e6; font-size: 9pt; font-weight: 700; padding: 1mm 0.5mm; line-height: 1.25; }
thead th small { font-weight: 500; font-size: 7.5pt; display: block; }
tbody td { height: 8.3mm; font-size: 10pt; }
td.rk { font-weight: 800; font-size: 11pt; text-align: left; padding-left: 2mm; }
td.rk.blank { color: #999; font-weight: 400; font-size: 8pt; }
td.tm { font-size: 11pt; color: #444; letter-spacing: 3pt; }
td.rg { font-size: 11pt; color: #555; }
td.rg .wave { display: inline-block; width: 50%; text-align: center; }
td.un { font-size: 7.5pt; color: #666; }
td.st { font-size: 9.5pt; letter-spacing: 1pt; }
tbody tr:nth-child(even) td { background: #f6f6f6; }
th.grp { border-bottom: 1px solid #000; }
.foot { display: flex; justify-content: space-between; font-size: 8pt; color: #333; margin-top: 2mm; }
"""

def page(room, row):
    racks = [f"{room}-{row}-{i:02d}" for i in range(1, 17)]
    h = [f'<div class="page"><div class="top"><div class="room">{room}</div>'
         f'<div class="ttl">デイリー記録表<small>{row}列　{room}-{row}-01〜16</small></div>'
         f'<div class="fill"><span>日付　　　年　　月　　日（　）</span><span>記録者　　　　　　　</span><span>確認者　　　　　　</span></div></div>']
    h.append('<table><colgroup><col style="width:12%"><col style="width:9%"><col style="width:9%"><col style="width:2.5%"><col style="width:9%">'
             '<col style="width:9%"><col style="width:9%"><col style="width:9%"><col style="width:8.5%"><col style="width:23%"></colgroup>')
    h.append('<thead><tr><th rowspan="2">ラック番号</th><th rowspan="2">チェック時刻</th><th colspan="3" class="grp">Pump Supply<small>kPa（から 〜 まで）</small></th>'
             '<th rowspan="2">Pump Return<small>kPa</small></th><th rowspan="2">System DP<small>kPa</small></th><th rowspan="2">HxS Out Temp<small>℃</small></th>'
             '<th rowspan="2">Unit status</th><th rowspan="2">備考</th></tr><tr><th>から</th><th></th><th>まで</th></tr></thead><tbody>')
    for r in racks + ['', '']:
        rk = f'<td class="rk">{html.escape(r)}</td>' if r else '<td class="rk blank">（追加）</td>'
        h.append(f'<tr>{rk}<td class="tm">:</td><td></td><td class="rg">〜</td><td></td><td></td><td></td><td></td>'
                 f'<td class="st">ON・OFF</td><td></td></tr>')
    h.append('</tbody></table><div class="foot"><span>System DP ≒ Pump Supply − Pump Return　／　Pump Supply が一定なら「から」だけ記入</span>'
             '<span>CDU Check Tool デイリー記録（アプリの「デイリー記録」と同じ項目）</span></div></div>')
    return ''.join(h)

body = ''.join(page(r, row) for r in rooms for row in ('2', '3'))
open(out, 'w', encoding='utf-8').write(f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>')
print('wrote', out)
