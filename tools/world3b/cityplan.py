# World v3b's city plan as a picture (docs/world-v3b/city-plan.png): the districts coloured by style, the streets
# (avenues and boulevards wider, alleys thin), the parks, the stadium and the airport, the traced highways, the main
# line and the ferries, each district named. Input: the JSON tools/world3-city-plan.mjs writes.
#   python3 tools/world3b/cityplan.py plan.json out.png [x0 y0 x1 y1 tiles-per-px]
import base64, json, sys
from PIL import Image, ImageDraw

STYLE = {
    'towers': (96, 120, 168), 'civic': (150, 140, 190), 'commercial': (214, 160, 92), 'nightlife': (204, 80, 170),
    'redlight': (236, 120, 150), 'arts': (230, 150, 120), 'luxury': (120, 186, 140), 'apartments': (196, 176, 120),
    'oldtown': (186, 118, 86), 'harbor': (120, 150, 160), 'industrial': (140, 136, 128), 'houses': (176, 206, 120),
    'beach': (238, 214, 140), 'southside': (168, 120, 110), 'park': (70, 160, 70), 'airport': (170, 170, 176),
}
D = json.load(open(sys.argv[1]))
out = sys.argv[2]
bx0, by0, bx1, by1 = D['box']
S0 = D['S']
view = [float(v) for v in sys.argv[3:8]] if len(sys.argv) >= 8 else [bx0, by0, bx1, by1, S0]
x0, y0, x1, y1, s = view
W, H = int((x1 - x0) / s), int((y1 - y0) / s)
ras = base64.b64decode(D['ras'])
RW, RH = D['RW'], D['RH']
col = {253: (52, 120, 196), 254: (196, 214, 160)}
for k, v in D['names'].items():
    col[int(k)] = STYLE.get(v['style'], (200, 200, 200))
im = Image.new('RGB', (W, H))
px = im.load()
for y in range(H):
    ty = y0 + y * s
    ry = int((ty - by0) / S0)
    for x in range(W):
        tx = x0 + x * s
        rx = int((tx - bx0) / S0)
        if 0 <= rx < RW and 0 <= ry < RH:
            px[x, y] = col.get(ras[ry * RW + rx], (200, 200, 200))
        else:
            px[x, y] = col[253]
d = ImageDraw.Draw(im)
P = lambda x, y: ((x - x0) / s, (y - y0) / s)
# the airport's field
A = D['airport']
for key, c in (('runway', (60, 60, 64)), ('taxi', (90, 90, 96)), ('apron', (120, 120, 126)), ('terminal', (220, 230, 240))):
    rx, ry, rw, rh = A[key]
    d.rectangle([P(rx, ry), P(rx + rw, ry + rh)], fill=c)
for rx, ry, rw, rh in A['hangars']:
    d.rectangle([P(rx, ry), P(rx + rw, ry + rh)], fill=(200, 200, 205))
for q in D['parks']:
    d.rectangle([P(q['x0'] + 6, q['y0'] + 6), P(q['x1'] - 6, q['y1'] - 6)], fill=(60, 150, 60))
    if q.get('pitch') and 'Stadium' in q['label']:
        cx, cy = (q['x0'] + q['x1']) / 2, (q['y0'] + q['y1']) / 2
        d.ellipse([P(cx - 46, cy - 36), P(cx + 46, cy + 36)], fill=(210, 210, 215), outline=(90, 90, 90))
        d.rectangle([P(cx - 28, cy - 18), P(cx + 28, cy + 18)], fill=(80, 170, 80))
# streets: the pavement, then the road
W_ROAD = {'st': 6, 'ave': 9, 'blvd': 9, 'alley': 3}
W_WALK = {'st': 12, 'ave': 16, 'blvd': 16, 'alley': 3}
plan = D['plan']
segs = [(True, r) for r in plan['h']] + [(False, r) for r in plan['v']] + [(False, r) for r in plan['alleys']]
for walk in (True, False):
    for horiz, r in segs:
        k = r['kind']
        w = max(1, round((W_WALK if walk else W_ROAD)[k] / s))
        c = (225, 222, 214) if walk else ((250, 250, 250) if k in ('ave', 'blvd') else (40, 40, 44) if k != 'alley' else (90, 90, 90))
        if walk and k == 'alley':
            continue
        a = P(r['a'], r['c']) if horiz else P(r['c'], r['a'])
        b = P(r['b'], r['c']) if horiz else P(r['c'], r['b'])
        d.line([a, b], fill=c, width=w)
for h in D['highways']:
    d.line([P(*p) for p in h['pts']], fill=(240, 150, 30), width=max(2, round(11 / s)))
d.line([P(*p) for p in D['loop']['pts']], fill=(70, 50, 40), width=max(1, round(5 / s)))
for f in D['ferries']:
    d.line([P(*p) for p in f['pts']], fill=(255, 255, 255), width=1)
for st in D['stations']:
    cx, cy = P(*st['at'])
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(255, 255, 255), outline=(0, 0, 0))
for k, v in D['names'].items():
    rx0, ry0, rx1, ry1 = v['at']
    cx, cy = P((rx0 + rx1) / 2, (ry0 + ry1) / 2)
    if 0 <= cx < W and 0 <= cy < H:
        t = v['name']
        tw = d.textlength(t)
        d.rectangle([cx - tw / 2 - 2, cy - 7, cx + tw / 2 + 2, cy + 6], fill=(255, 255, 255))
        d.text((cx - tw / 2, cy - 6), t, fill=(0, 0, 0))
im.save(out)
print('wrote', out, W, H)
