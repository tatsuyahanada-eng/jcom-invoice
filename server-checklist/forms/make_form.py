"""デイリー記録の手書き用フォーム（A4 縦・1枚・部屋ごと）。対象ラックの名前は印刷済み。
使い方: python3 make_form.py 部屋番号 出力.html [ラック接尾辞,...]  →  Chromium で PDF 化
接尾辞を省略すると、対象サーバー（1-11、2列・3列の 01・02・05・06・11・12・15・16）になります。"""
import sys

ROOM = sys.argv[1]
TARGET = ['1-11'] + [f'{row}-{i:02d}' for row in (2, 3) for i in (1, 2, 5, 6, 11, 12, 15, 16)]   # 対象サーバー 17 台
SUFFIX = sys.argv[3].split(',') if len(sys.argv) > 3 else TARGET
RACKS = [f'{ROOM}-{x}' for x in SUFFIX]
SPARE = 2                                                  # 手書きで足せる予備行
CSS = """
@page { size: A4 portrait; margin: 10mm 10mm 9mm 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: "Noto Sans CJK JP","Noto Sans JP","Yu Gothic","IPAPGothic","IPA Pゴシック",sans-serif; color: #000; }
.page { height: 277mm; display: flex; flex-direction: column; overflow: hidden; }
.ttl { text-align: center; font-size: 18pt; font-weight: 800; letter-spacing: 2pt; margin: 0; }
.ttl small { display: block; font-size: 9pt; font-weight: 500; letter-spacing: 0; color: #333; margin-top: .5mm; }
.fill { display: flex; align-items: flex-end; gap: 4mm; margin: 2mm 0 2.5mm; font-size: 11pt; }
.fill .f { display: flex; align-items: flex-end; gap: 1.5mm; white-space: nowrap; }
.fill .f i { font-style: normal; font-weight: 700; }
.fill .f b { display: inline-block; border-bottom: 1px solid #000; height: 7mm; }
.fill .room b { border: 2px solid #000; height: 9mm; border-radius: 1.5mm; padding: 0 4mm; font-size: 18pt; font-weight: 900; line-height: 8mm; }
.fill .date b.s { width: 11mm; } .fill .date b.l { width: 8mm; }
.fill .f { font-size: 10.5pt; }

.fill .who b { width: 22mm; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; flex: 1; }
th, td { border: 1px solid #000; text-align: center; vertical-align: middle; }
thead th { background: #e6e6e6; font-size: 9.5pt; font-weight: 700; padding: 1.2mm 0.5mm; line-height: 1.25; }
thead th small { display: block; font-weight: 500; font-size: 7.5pt; color: #222; }
tbody td { font-size: 10.5pt; padding: 0; }
td.rk { text-align: left; padding-left: 2mm; font-weight: 800; font-size: 11pt; white-space: nowrap; }
tr.sep td { border-top: 2px solid #000; }
td.tm { color: #aaa; font-size: 12pt; }
td.rg { color: #888; font-size: 11pt; }
tbody tr:nth-child(even) td { background: #f6f6f6; }
.notes { display: flex; justify-content: space-between; align-items: flex-end; font-size: 8pt; color: #333; margin-top: 2mm; gap: 6mm; }
"""
head = ('<thead><tr><th rowspan="2">ラック番号</th><th rowspan="2">チェック<br>時刻</th>'
        '<th colspan="3">Pump Supply<small>kPa（から 〜 まで）</small></th>'
        '<th rowspan="2">Pump Return<small>kPa</small></th><th rowspan="2">System DP<small>kPa</small></th>'
        '<th rowspan="2">HxS Out Temp<small>℃</small></th><th rowspan="2">備考</th></tr>'
        '<tr><th>から</th><th></th><th>まで</th></tr></thead>')
cols = [18, 12, 15, 4, 15, 15, 15, 15, 0]          # mm 相当の比率（最後は残り＝備考）
colgroup = '<colgroup>' + ''.join(f'<col style="width:{w}%">' if w else '<col>' for w in [13, 9.5, 10.5, 3.5, 10.5, 11, 11, 11]) + '<col></colgroup>'
def grp(r): return r.split('-')[1]            # 1 / 2 / 3（列）
rows = ''.join(f'<tr class="{"sep" if i and grp(r) != grp(RACKS[i-1]) else ""}"><td class="rk">{r}</td><td class="tm">:</td><td></td><td class="rg">〜</td><td></td><td></td><td></td><td></td><td></td></tr>' for i, r in enumerate(RACKS))
rows += ''.join(f'<tr class="{"sep" if k == 0 else ""}"><td class="rk"></td><td class="tm">:</td><td></td><td class="rg">〜</td><td></td><td></td><td></td><td></td><td></td></tr>' for k in range(SPARE))
body = f"""<div class="page">
<div class="ttl">デイリー記録表<small>CDU（pGD1 画面）の値を、ラックごとに記録します　／　{ROOM} 号室　対象 {len(RACKS)} 台</small></div>
<div class="fill">
 <div class="f room"><i>部屋番号</i><b>{ROOM}</b></div>
 <div class="f date"><i>日付</i><b class="s"></b>年<b class="l"></b>月<b class="l"></b>日（<b class="l"></b>）</div>
 <div class="f who" style="margin-left:auto"><i>記録者</i><b></b></div>
 <div class="f who" style="margin-left:0"><i>確認者</i><b></b></div>
</div>
<table>{colgroup}{head}<tbody>{rows}</tbody></table>
<div class="notes"><span>System DP ≒ Supply − Return　／　Supply が一定なら「から」だけ記入　／　アラーム・気づきは「備考」へ</span></div>
</div>"""
open(sys.argv[2], 'w', encoding='utf-8').write(f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{body}</body></html>')
print('wrote', sys.argv[2])
