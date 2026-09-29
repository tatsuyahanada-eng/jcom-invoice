#!/usr/bin/env python3
# 機種データ生成：legacy.json（既存）に、分割・訂正・追加（models.dsl）を適用して data.js の DEVICES を再生成する
import json, re, sys, copy
import os
D_DIR = os.path.dirname(os.path.abspath(__file__)) + '/'
DATA_JS = D_DIR + '../data.js'

legacy = json.load(open(D_DIR + 'legacy.json'))
LG = {d['id']: d for d in legacy}
ABB = {'d': 'docomo', 'a': 'au', 's': 'sb', 'u': 'uq', 'y': 'ymobile', 'r': 'rakuten', 'f': 'free'}
FLAG = {'F': 'free', 'L': 'locked', 'C': 'cond', 'R': 'rule'}

def ym(rel):
    m = re.search(r'(\d{4})年(?:(\d{1,2})月)?', rel or '')
    return (int(m.group(1)) * 100 + (int(m.group(2)) if m.group(2) else 6)) if m else 0

def auto_ship(c, rel):
    k = ym(rel)
    if c in ('rakuten', 'free'): return 'free'
    if c == 'docomo': return 'free' if k >= 202109 else ('cond' if k == 202108 else 'locked')
    if c in ('au', 'uq'): return 'free' if k >= 202110 else 'locked'
    return 'free' if k >= 202110 else ('cond' if k >= 202105 else 'locked')   # sb / ymobile

def fmt_date(t):
    t = t.strip()
    m = re.fullmatch(r'(\d{4})\.(\d{1,2})', t)
    if m: return f'{m.group(1)}年{int(m.group(2))}月'
    if re.fullmatch(r'\d{4}', t): return t + '年'
    return t

def parse_variants(spec, default_rel):
    out = []
    for tok in [x.strip() for x in spec.split(',') if x.strip()]:
        m = re.fullmatch(r'([dausryf])(?::([^@!~]*))?(?:@([^!~]*))?(?:!([FLCR]))?(?:~(.*))?', tok)
        if not m: raise SystemExit('bad variant token: ' + tok)
        c = ABB[m.group(1)]; code = (m.group(2) or '').strip(); rel = fmt_date(m.group(3)) if m.group(3) else fmt_date(default_rel)
        ship = FLAG[m.group(4)] if m.group(4) else auto_ship(c, rel)
        v = {'c': c}
        if code: v['code'] = code
        v['rel'] = rel; v['ship'] = ship
        if m.group(5): v['note'] = m.group(5).strip()
        out.append(v)
    return out

def parse_dsl(path):
    rows = []
    for ln in open(path, encoding='utf-8'):
        ln = ln.rstrip('\n')
        if not ln.strip() or ln.lstrip().startswith('#'): continue
        note = None
        if ' ## ' in ln: ln, note = ln.split(' ## ', 1)
        f = [x.strip() for x in ln.split('|')]
        if len(f) < 6: raise SystemExit('bad row: ' + ln)
        id_, name, maker, kana, vs, rel = f[:6]
        opts = dict(x.split('=', 1) for x in f[6:] if '=' in x)
        d = {'id': id_, 'name': name, 'maker': maker, 'kana': kana}
        if 'mfr' in opts: d['mfr'] = opts['mfr']
        if 'brand' in opts: d['brand'] = opts['brand']
        d['variants'] = parse_variants(vs, rel)
        if note: d['note'] = note.strip()
        rows.append(d)
    return rows

# ---------- 1) 既存データの削除・訂正 ----------
EXTRA_KEYS = ('path', 'paths', 'brand', 'mfr')
models = {}       # id -> dict（順序維持）
order = []
def put(d):
    if d['id'] not in models: order.append(d['id'])
    models[d['id']] = d

REMOVE = {
    # 分割して置き換える（models.dsl 側で再定義）
    'iphone-6s-7', 'iphone-8-x', 'iphone-xs-xr', 'iphone-11', 'iphone-12', 'iphone-13', 'iphone-14', 'iphone-15', 'iphone-16', 'iphone-17',
    'pixel-3', 'pixel-4', 'pixel-5', 'pixel-6', 'pixel-7', 'pixel-8', 'pixel-9', 'pixel-10',
    'xperia-x-performance', 'xperia-xz', 'xperia-xz1', 'xperia-xz2',
    'galaxy-s8', 'galaxy-s9', 'galaxy-s10', 'galaxy-s20', 'galaxy-feel', 'galaxy-z-flip3-fold3', 'galaxy-s22', 'galaxy-z-flip4-fold4', 'galaxy-s23',
    'galaxy-z-flip5-fold5', 'galaxy-s24', 'galaxy-z-flip6-fold6', 'galaxy-s25', 'galaxy-z-flip7-fold7', 'galaxy-s26',
    'aquos-sense4', 'aquos-r5g-r6', 'aquos-r8', 'aquos-r9',
    'kantan-sumaho2', 'arrows-be', 'arrows-m-simfree', 'rakuten-hand', 'redmi-free',
    # 誤りが判明したもの（訂正版を models.dsl に記載）
    'oppo-a55s', 'oppo-a5-2020', 'raku-4', 'arrows-u', 'xperia-ace', 'kyocera-kyg04', 'torque-5g', 'basio-active',
}
for d in legacy:
    if d['id'] in REMOVE: continue
    d = copy.deepcopy(d)
    # 個別の訂正
    if d['id'] == 'aquos-sense3':      # Y!mobile版の型番が他機種と重複していた（未確認）ため削除
        d['variants'] = [v for v in d['variants'] if v['c'] != 'ymobile']
    if d['id'] == 'oppo-a54':
        pass
    put(d)

for d in parse_dsl(D_DIR + 'models.dsl'):
    # 既存に同一idがあれば、path/paths などの補足を引き継ぐ
    old = LG.get(d['id'])
    if old:
        for k in EXTRA_KEYS:
            if k in old and k not in d: d[k] = old[k]
        # 既存の個別メモを引き継ぐ（同じキャリアのみ）
        for v in d['variants']:
            for ov in old['variants']:
                if ov['c'] == v['c'] and ov.get('note') and 'note' not in v: v['note'] = ov['note']
        if old.get('note') and 'note' not in d: d['note'] = old['note']
    put(d)

# ---------- 2) 出力 ----------
def js(v): return json.dumps(v, ensure_ascii=False)
def pathjs(p):
    s = '{ steps: %s, target: %s' % (js(p['steps']), js(p['target']))
    if p.get('note'): s += ', note: ' + js(p['note'])
    if p.get('label'): s += ', label: ' + js(p['label'])
    return s + ' }'
def var_js(v):
    s = 'c: %s' % js(v['c'])
    if v.get('code'): s += ', code: %s' % js(v['code'])
    if v.get('n'): s += ', n: %s' % js(v['n'])
    s += ', rel: %s, ship: %s' % (js(v['rel']), js(v['ship']))
    if v.get('note'): s += ', note: %s' % js(v['note'])
    return '{ ' + s + ' }'
def dev_js(d):
    head = '  { id: %s, name: %s, maker: %s,' % (js(d['id']), js(d['name']), js(d['maker']))
    if d.get('mfr'): head += ' mfr: %s,' % js(d['mfr'])
    if d.get('brand'): head += ' brand: %s,' % js(d['brand'])
    head += ' kana: %s,' % js(d.get('kana', ''))
    lines = [head]
    if d.get('path'): lines.append('    path: ' + pathjs(d['path']) + ',')
    if d.get('paths'): lines.append('    paths: [' + ', '.join(pathjs(p) for p in d['paths']) + '],')
    vs = ',\n      '.join(var_js(v) for v in d['variants'])
    tail = '\n    ]' + (', note: %s' % js(d['note']) if d.get('note') else '') + ' },'
    lines.append('    variants: [\n      ' + vs + tail)
    return '\n'.join(lines)

# メーカー順に並べる
MAKER_ORDER = ['iphone', 'pixel', 'xperia', 'galaxy', 'aquos', 'kyocera', 'fcnt', 'oppo', 'xiaomi', 'motorola', 'zte', 'huawei', 'asus', 'lg', 'tcl', 'balmuda', 'htc', 'microsoft', 'android', 'garaho']
def first_rel(d): return max((ym(v['rel']) for v in d['variants']), default=0)
specific = [models[i] for i in order if not models[i].get('generic')]
generic = [models[i] for i in order if models[i].get('generic')]
LABEL = {'iphone': 'iPhone', 'pixel': 'Pixel / Nexus', 'xperia': 'Xperia', 'galaxy': 'Galaxy', 'aquos': 'AQUOS・BASIO(シャープ製)', 'kyocera': '京セラ', 'fcnt': 'arrows・らくらくスマートフォン', 'oppo': 'OPPO',
         'xiaomi': 'Xiaomi', 'motorola': 'Motorola', 'zte': 'ZTE (Libero)', 'huawei': 'HUAWEI', 'asus': 'ASUS', 'lg': 'LG', 'tcl': 'TCL', 'balmuda': 'BALMUDA', 'htc': 'HTC', 'microsoft': 'Microsoft', 'android': 'その他Android', 'garaho': 'ガラホ'}
out = []
for mk in MAKER_ORDER:
    grp = [d for d in specific if d['maker'] == mk]
    if not grp: continue
    grp.sort(key=lambda d: -first_rel(d))
    out.append('\n  // ---------- %s ----------' % LABEL[mk])
    out += [dev_js(d) for d in grp]
rest = [d for d in specific if d['maker'] not in MAKER_ORDER]
if rest: raise SystemExit('unknown maker: ' + ', '.join(sorted({d['maker'] for d in rest})))

src = open(DATA_JS, encoding='utf-8').read()
a = src.index('const DEVICES = [')
b = src.index('  // ---------- 汎用（機種が見つからない時） ----------')
generic_tail_end = src.index('];\n\n/* キャリアメール持ち運び */')
new_devices = 'const DEVICES = [' + '\n'.join(out) + '\n\n' + src[b:generic_tail_end]
src = src[:a] + new_devices + src[generic_tail_end:]
open(DATA_JS, 'w', encoding='utf-8').write(src)
print('models', len(specific), 'generic', len(generic))
