#!/usr/bin/env python3
"""J:COMチェッカーの新旧スナップショットを比べ、差分（追加・削除・SIMロック解除の要否変更）を tools/jcom_changes.json に書く。
  python3 tools/jcom_diff.py <旧json> <新json> [確認日]
"""
import json, sys, os, datetime
old = json.load(open(sys.argv[1], encoding='utf-8')); new = json.load(open(sys.argv[2], encoding='utf-8'))
date = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
k = lambda o: (o['cat'], o['name'])
O = {k(o): o for o in old}; N = {k(o): o for o in new}
ch = {'date': date, 'total': len(new),
      'added': [{'cat': c, 'name': n, 'unlock': N[(c, n)]['unlock']} for (c, n) in N if (c, n) not in O],
      'removed': [{'cat': c, 'name': n, 'unlock': O[(c, n)]['unlock']} for (c, n) in O if (c, n) not in N],
      'changed': [{'cat': c, 'name': n, 'from': O[(c, n)]['unlock'], 'to': N[(c, n)]['unlock']} for (c, n) in N if (c, n) in O and O[(c, n)]['unlock'] != N[(c, n)]['unlock']]}
json.dump(ch, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'jcom_changes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('added', len(ch['added']), 'removed', len(ch['removed']), 'changed', len(ch['changed']))
sys.exit(0 if not (ch['added'] or ch['removed'] or ch['changed']) else 10)
