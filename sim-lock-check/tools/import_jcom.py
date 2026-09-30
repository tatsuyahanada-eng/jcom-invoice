#!/usr/bin/env python3
"""J:COMモバイル「動作確認端末チェッカー」の一覧（jcom_source.json）を機種データに取り込む。

  python3 tools/extract_jcom_pdf.py  <PDF>     # PDF → tools/jcom_source.json（メーカー・購入キャリア・機種名）
  python3 tools/import_jcom.py                 # 既存データ(legacy+models.dsl)と突き合わせ → tools/jcom_overlay.json
  python3 tools/build.py                       # data.js を再生成

・一覧にある機種は、キャリア版（購入キャリア）・型番・機種名を反映（既存の機種は不足キャリアを補い、型番を上書き）
・一覧に無い新機種は追加（発売時期が分かるものは発売時期つき）
・SIMロックの有無は、発売時期／型番の世代（ドコモ 2021/8/27・au/UQ/SB/Y! 2021/10/1）から判定。判断できないものは「要判定」
"""
import json, re, os, sys, unicodedata, hashlib
D = os.path.dirname(os.path.abspath(__file__)) + '/'
sys.path.insert(0, D)
import build

CARR = {'SIMフリー': 'free', 'docomo': 'docomo', 'au': 'au', 'SoftBank': 'sb', 'UQ': 'uq', 'Y!mobile': 'ymobile', '楽天モバイル': 'rakuten'}
MAKER_OF = {'Apple': 'iphone', 'Google': 'pixel', 'Sony Corporation': 'xperia', 'SAMSUNG': 'galaxy', 'SHARP': 'aquos', 'KYOCERA': 'kyocera', 'FCNT': 'fcnt', 'OPPO': 'oppo',
            'Xiaomi': 'xiaomi', 'Motorola': 'motorola', 'ZTE Corporation': 'zte', 'ASUS': 'asus', 'LG Electronics': 'lg', 'TCL Communication': 'tcl', 'BALMUDA': 'balmuda',
            'HTC': 'htc', 'Huawei': 'huawei', 'ALT': 'android', 'Rakuten': 'android', 'Nothing': 'nothing'}
MFR_KEY = {'Apple': 'apple', 'Google': 'google', 'Sony Corporation': 'sony', 'SAMSUNG': 'samsung', 'SHARP': 'sharp', 'KYOCERA': 'kyocera', 'FCNT': 'fcnt', 'OPPO': 'oppo',
           'Xiaomi': 'xiaomi', 'Motorola': 'motorola', 'ZTE Corporation': 'zte', 'ASUS': 'asus', 'LG Electronics': 'lg', 'TCL Communication': 'tcl', 'BALMUDA': 'balmuda',
           'HTC': 'htc', 'Huawei': 'huawei', 'ALT': 'alt', 'Rakuten': 'rakuten', 'Nothing': 'nothing'}
KANA = {'iphone': 'アイフォン', 'pixel': 'ピクセル グーグル', 'xperia': 'エクスペリア', 'galaxy': 'ギャラクシー', 'aquos': 'アクオス', 'kyocera': '京セラ', 'fcnt': '富士通 アローズ',
        'oppo': 'オッポ', 'xiaomi': 'シャオミ', 'motorola': 'モトローラ モト', 'zte': 'ゼットティーイー', 'asus': 'エイスース ゼンフォン', 'lg': 'エルジー', 'tcl': 'ティーシーエル',
        'balmuda': 'バルミューダ', 'htc': 'エイチティーシー', 'huawei': 'ファーウェイ', 'nothing': 'ナッシング', 'android': ''}

CODE_RE = re.compile(r'^(?:(?:S[OHC]|F|L|KY|HW|DM|MO|M)-\d{2}[A-Z]|(?:S[OCH][GV]|OPG|XIG|KY[GV]|LGV|HTV|HW[VU]|FCG|ZTG|SHV)\d{2}|[A-Z]?\d{3}[A-Z]{2}|XQ-[A-Z0-9]{4}'
                     r'|SH-R?M\d{2}[a-z]?|SM-[A-Z]\d{3}[A-Z]+|CPH\d{4}|XT\d{4}-\d|LP-\d\d|LYA-L\d\d|MAR-LX\d[A-Z]|ANE-LX\d[A-Z]|AT-M\d{3}[A-Z]|J\d{4}|Z[A-Z]\d{3}[A-Z]{2})$')

# 一覧の表記ゆれ → 既存データの機種名
ALIAS = {'らくらくスマートフォンme F-01L': 'らくらくスマートフォン me', 'あんしんスマホ': 'あんしんスマホ KY-51B', 'V60 ThinQ 5G': 'LG V60 ThinQ 5G', 'V30+': 'LG V30+', 'BALMUDA Phone X01A': 'BALMUDA Phone', 'OPPO Reno5 A (eSIM)': 'OPPO Reno5 A（eSIM対応版）', 'らくらくスマートフォン F-42A': 'らくらくスマートフォン', 'arrows Be F-04K': 'arrows Be', 'らくらくスマートフォン me F-01L': 'らくらくスマートフォン me',
         'AQUOS sense': 'AQUOS sense（初代）', 'Xperia 1 V Gaming Edition': 'Xperia 1 V', 'らくらくスマートフォン Lite': 'らくらくスマートフォン Lite MR01'}

FORCE_SPLIT = {'arrowsnx'}   # 同名で型番違いの別機種（DB側は F-01J／F-02H、一覧側は F-01K）

# 発売時期（年月）が分かっているもの。キー＝機種名（正規化）。分からないものは空欄（要判定 or 型番から判定）
REL_TXT = '''
iPhone 18 Pro|iPhone 18 Pro Max|iPhone Duo = 2026.09
Pixel 11|Pixel 11 Pro|Pixel 11 Pro XL|Pixel 11 Pro Fold = 2026.08
Galaxy Z Flip8|Galaxy Z Fold8|Galaxy Z Fold8 Ultra = 2026.07
Galaxy A36 5G = 2025.06
Galaxy S23 FE = 2024
OPPO Find N6 = 2026
OPPO Find X9 = 2025.10
OPPO Reno14 5G|OPPO A5x = 2025
OPPO Find X8 = 2024
Zenfone 12 Ultra = 2025
ROG Phone 9 Pro|ROG Phone 8 Pro = 2024
ROG Phone 7 Ultimate|ROG Phone 7 = 2023
ROG Phone 6 Pro|ROG Phone 6 = 2022
ROG Phone 5s Pro|ROG Phone 5s|ROG Phone 5 Ultimate|ROG Phone 5|Smartphone for Snapdragon Insiders|Zenfone 8 Flip|Zenfone 8 = 2021
ZenFone 7 / 7 Pro|ROG Phone 3 = 2020
ROG Phone II|ZenFone 6|ZenFone MAX M2|ZenFone MAX Pro M2 = 2019
ZenFone Live L1|ZenFone MAX Pro M1|ROG Phone|ZenFone Max M1|ZenFone 5Z|ZenFone 5Q|ZenFone 5 = 2018
ZenFone 4 Selfie|ZenFone 4 Max|ZenFone 4 Max Pro|ZenFone 4 Pro|ZenFone 4 Selfie Pro|ZenFone 4|ZenFone Live|ZenFone AR|ZenFone Zoom S = 2017
ZenFone 3 Ultra|ZenFone 3 Laser|ZenFone 3 Deluxe|ZenFone 3|ZenFone 3 Max|ZenFone 2 laser|ZenFone Go = 2016
Xperia 10 III lite = 2021
Xperia 8 Lite = 2019
Xperia XZ Premium = 2017
Xperia Z5|Xperia Z4 = 2015
POCO X7 Pro = 2025
Xiaomi 14 Ultra|Redmi Note 13 Pro 5G = 2024
Xiaomi 13T Pro|Redmi 12C = 2023
Xiaomi 12T Pro|POCO F4 GT|Redmi Note 11 = 2022
Xiaomi 11T Pro = 2021.11
Mi Note 10 Lite = 2020
Mi 10 Lite 5G = 2020.09
BALMUDA Phone X01A = 2021.11
razr 60 ultra|razr 60s|edge 60|razr 60d|edge 60s pro = 2025
razr 50 ultra|razr 50d|edge 50s pro|moto g24 = 2024
edge 40 neo|edge 40|razr 40 ultra|razr 40s|moto g13 = 2023
moto g32|moto g31 = 2022
edge 20|edge 20 fusion|moto g50 5G|moto g100|moto g30|moto g10|moto e7 power|moto e7 = 2021
moto g PRO|moto g9 play|moto g8 power lite|moto e6s|moto g8 power|moto g8|razr 5G = 2020
moto g8 plus|moto g7 plus|moto g7 = 2019
moto z3 PLAY|moto e5|moto g6 Plus|moto g6|Moto X4 = 2018
Moto G5S|Moto G5S Plus = 2017
HUAWEI P40 lite E|HUAWEI P40 Pro 5G|HUAWEI nova lite 3+ = 2020
HUAWEI nova 5T|HUAWEI P30|HUAWEI P30 lite|HUAWEI nova lite 3|HUAWEI P30 lite Premium|HUAWEI P30 Pro = 2019
HUAWEI Mate 20 Pro|HUAWEI Mate 20 lite|HUAWEI nova 3|HUAWEI P20|HUAWEI P20 lite|HUAWEI Mate 10 Pro|HUAWEI nova lite 2|HUAWEI P20 Pro = 2018
HUAWEI P10 lite|HUAWEI nova|HUAWEI nova 2|HUAWEI P9 lite PREMIUM = 2017
OPPO Reno A|OPPO Reno 10x Zoom|OPPO R17 Neo = 2019
OPPO R17 Pro|OPPO AX7|OPPO Find X|OPPO R15 Pro|OPPO R15 Neo|OPPO R11s = 2018
Nothing Phone (2) = 2023
Nothing Phone (2a) = 2024
Nothing Phone (3a)|Nothing Phone (3a) Lite|Nothing Phone (3)|CMF Phone 2 Pro = 2025
SHINE LITE|IDOL 4|LG V30+|Disney Mobile on docomo|Qua phone PX|isai Beat|HTC U11|MONO = 2017
BLADE V770|HTC 10|isai vivid|LG X screen = 2016
nubia Flip 5G|nubia S 5G = 2024
nubia Flip 2|nubia Ivy = 2025
Axon 10 Pro 5G|Libero S10|LG G8X ThinQ|LG K50|LG style2 = 2019
LG style|LG it|isai V30+ = 2018
HTC J butterfly = 2015
'''
LOCK_YEAR = {'H': 2015, 'J': 2016, 'K': 2017, 'L': 2018, 'M': 2019, 'A': 2020, 'B': 2021, 'C': 2022, 'D': 2023, 'E': 2024, 'F': 2025, 'G': 2026}


def key(name):
    s = unicodedata.normalize('NFKC', name).lower()
    return re.sub(r'[^0-9a-zぁ-んァ-ヶ一-龥+]', '', s)


REL = {}
for ln in REL_TXT.strip().split('\n'):
    names, r = ln.split(' = ')
    for n in names.split('|'): REL[key(n)] = r.strip()


def clean(raw, mfr):
    s = unicodedata.normalize('NFKC', raw).replace('XperiaTM', 'Xperia').replace('™', '').strip()
    s = re.sub(r'\s+', ' ', s)
    s = re.sub(r'(\d)(II|III|IV|VI|VII|VIII|V)\b', r'\1 \2', s)
    s = re.sub(r'^Xperia(\d)', r'Xperia \1', s)
    s = re.sub(r'^(Xperia \d+) ?(III|II|IV|VIII|VII|VI|V)(XQ-[A-Z0-9]{4})$', r'\1 \2 \3', s)
    s = re.sub(r'^(Samsung|Google|motorola) (?=\S)', '', s)
    return s


def split_code(s):
    for nm, cd in (('arrows Alpha2 M10', 'M10'), ('arrows We2 Plus M06', 'M06')):
        if s == nm: return nm[:-len(cd) - 1], cd
    if s == 'BALMUDA Phone X01A': return s, ''
    m = re.match(r'^(.*?)\s*\(?([A-Za-z0-9\-]+)\)?$', s)
    if m and m.group(1) and CODE_RE.match(m.group(2)): return m.group(1).strip(), m.group(2)
    return s, ''


def prefix(name, mfr):
    if mfr == 'OPPO' and not name.startswith('OPPO'): return 'OPPO ' + name
    if mfr == 'Huawei' and not name.lower().startswith('huawei') and not name.startswith('Mate'): return 'HUAWEI ' + name
    if mfr == 'Huawei' and name.startswith('Mate'): return 'HUAWEI ' + name
    if mfr == 'Nothing' and not name.startswith(('Nothing', 'CMF')): return 'Nothing ' + name
    if mfr == 'LG Electronics' and re.match(r'^(V\d|G\d)', name): return 'LG ' + name
    return name


# ---------- ロック有無の判定 ----------
def code_ship(car, code, name):
    """型番の世代から出荷時のロック有無を判定。判断できなければ None"""
    if car in ('free', 'rakuten'): return 'free'
    if not code: return None
    m = re.match(r'^([A-Z]+)-(\d{2})([A-Z])$', code)
    if m and car == 'docomo':
        y = LOCK_YEAR.get(m.group(3))
        if y is None: return None
        if y <= 2020: return 'locked'
        if y == 2021: return 'locked' if int(m.group(2)) in (41, 51, 52, 53) else 'free'
        return 'free'
    m = re.match(r'^([A-Z]+)(\d{2})$', code)
    if m and car in ('au', 'uq'):
        pre, n = m.group(1), int(m.group(2))
        if pre.endswith('V'): return 'locked'
        if pre == 'SCG': return 'locked' if n <= 10 else 'free'
        if pre == 'SOG': return 'locked' if n <= 4 else 'free'
        if pre == 'SHG': return 'locked' if n <= 3 else 'free'
        if pre == 'OPG': return 'locked' if n <= 3 else 'free'
        if pre == 'XIG': return 'locked' if n <= 1 else 'free'
        if pre in ('KYG', 'FCG'): return 'free'
        return None
    if car in ('sb', 'ymobile'):
        if re.match(r'^\d{3}[A-Z]{2}$', code): return 'locked' if car == 'sb' else 'cond'   # 5xx〜9xx（2016〜2020年）
        m = re.match(r'^A(\d)(\d{2})[A-Z]{2}$', code)
        if m:
            g, n = int(m.group(1)), int(m.group(2))
            if code in ('A101BM', 'A101FC', 'A101XM', 'A103ZT', 'A102OP', 'A102SH', 'A103SO', 'A103SH', 'A104SH'): return 'free'
            if g == 0: return 'locked' if car == 'sb' else 'cond'
            if g == 1 and n == 1: return 'cond'
            if g == 1 and code in ('A102SO', 'A103OP'): return 'cond'
            return 'free'
        if code in ('LP-01',): return 'cond'
        if code in ('LP-02', 'LP-03'): return 'free'
        if code in ('LYA-L09', 'XT2071-4'): return 'locked'
        if re.match(r'^(SM-|XT)', code): return 'free'
    return None


def ship_for(car, code, rel, mfr, name):
    s = code_ship(car, code, name)
    if s: return s
    if car == 'uq' and mfr in ('ASUS', 'Huawei', 'LG Electronics', 'TCL Communication', 'ZTE Corporation', 'Motorola', 'Xiaomi', 'FCNT') and not (mfr == 'FCNT' and 'We' in name): return 'free'   # UQが販売したSIMフリー端末
    k = build.ym(rel)
    if k: return build.auto_ship(car, rel)
    if car == 'uq' and mfr in ('KYOCERA', 'SHARP'): return 'locked'   # 旧UQモバイル向けモデル（2021年以前）
    return 'rule'


def slug(name):
    s = unicodedata.normalize('NFKC', name).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s or ('m-' + hashlib.md5(name.encode()).hexdigest()[:8])


def main():
    src = json.load(open(D + 'jcom_source.json', encoding='utf-8'))
    entries = []
    for car, mfr, items in src:
        for raw in items:
            s = clean(raw, mfr)
            name, code = split_code(s)
            name = ALIAS.get(name if not code else f'{name} {code}', ALIAS.get(name, name))
            name = prefix(name, mfr)
            entries.append(dict(car=CARR[car], mfr=mfr, raw=raw, name=name, code=code))
    # 同じ名称で型番が複数ある（らくらく・arrows Be 等）→ 型番で別機種として扱う
    cnt = {}
    for e in entries: cnt.setdefault((e['mfr'], key(e['name']), e['car']), []).append(e)
    dup = {(m, k) for (m, k, c), v in cnt.items() if len(v) > 1} | {(m, k) for (m, k, c), v in cnt.items() if k in FORCE_SPLIT}
    for e in entries:
        if (e['mfr'], key(e['name'])) in dup and e['code']:
            full = f"{e['name']} {e['code']}"
            e['name'] = ALIAS.get(full, full)

    models, order = build.base_models()
    DB = {}
    for d in models.values():
        if not d.get('generic'): DB[key(d['name'])] = d

    groups = {}
    for e in entries: groups.setdefault((e['mfr'], key(e['name'])), []).append(e)

    overlay = []; stats = dict(new=0, matched=0, added_variants=0, pruned=0, code_changed=[])
    used_ids = set(models.keys())
    for (mfr, k), es in groups.items():
        db = DB.get(k)
        name = db['name'] if db else es[0]['name']
        model_rel = ''
        if db:
            rels = [v['rel'] for v in db['variants'] if build.ym(v['rel'])]
            model_rel = min(rels, key=build.ym) if rels else ''
        else:
            model_rel = build.fmt_date(REL.get(k, ''))
            if not model_rel:
                for e in es:
                    m = re.match(r'^[A-Z]+-\d{2}([A-Z])$', e['code'] or '') if e['car'] == 'docomo' else None
                    if m and m.group(1) in LOCK_YEAR: model_rel = f'{LOCK_YEAR[m.group(1)]}年'; break
        variants = {}
        pdf_cars = {e['car'] for e in es}
        if db:
            for v in db['variants']:
                v = dict(v)
                # 新しい時代（2021年〜）の機種は、一覧に無いキャリア版は取り消す（推測で入れていたもの）
                if v['c'] not in ('free', 'rakuten') and v['c'] not in pdf_cars and build.ym(v['rel']) >= 202110:
                    stats['pruned'] += 1; continue
                variants[v['c']] = v
        for e in es:
            v = variants.get(e['car'])
            code = e['code']
            disp = f"{name} {code}".strip()
            nn = None
            if unicodedata.normalize('NFKC', e['raw']).replace('XperiaTM', 'Xperia').replace('™', '') != e['raw'] or True:
                r2 = clean(e['raw'], mfr)
                if key(r2) != key(disp) and key(r2) != key(name): nn = r2
            if v is None:
                rel = model_rel
                ship = ship_for(e['car'], code, rel, mfr, name)
                v = {'c': e['car']}
                if code: v['code'] = code
                v['rel'] = rel or '—'; v['ship'] = ship
                if nn: v['n'] = nn
                variants[e['car']] = v; stats['added_variants'] += 1
            else:
                if code and v.get('code') != code and not (code.startswith('XT') and v.get('code')):
                    old = v.get('code', '')
                    if old and old.split('／')[0].split('（')[0] != code: stats['code_changed'].append((name, e['car'], old, code))
                    if not old or old.split('／')[0].split('（')[0] != code: v['code'] = code
                if nn and not v.get('n'): v['n'] = nn
        vs = [variants[c] for c in ['docomo', 'au', 'sb', 'uq', 'ymobile', 'rakuten', 'free'] if c in variants]
        if db:
            d = dict(db); d['variants'] = vs; stats['matched'] += 1
        else:
            maker = MAKER_OF[mfr]
            garaho = name in ('GRATINA', 'カードケータイ')
            d = {'id': slug(name), 'name': name, 'maker': 'garaho' if garaho else maker, 'kana': KANA.get(maker, ''), 'variants': vs}
            if garaho: d['brand'] = maker
            if mfr in ('ALT', 'Rakuten'): d['mfr'] = MFR_KEY[mfr]
            i = d['id']; n = 2
            while i in used_ids: i = f"{d['id']}-{n}"; n += 1
            d['id'] = i; used_ids.add(i); stats['new'] += 1
        overlay.append(d)
    json.dump(overlay, open(D + 'jcom_overlay.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print('overlay models', len(overlay), '| matched', stats['matched'], '| new', stats['new'], '| added variants', stats['added_variants'], '| pruned', stats['pruned'])
    print('code changes:')
    for x in stats['code_changed']: print('  ', x)


if __name__ == '__main__':
    main()
