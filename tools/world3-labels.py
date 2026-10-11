#!/usr/bin/env python3
"""The built World v3 map (docs/world-v3-world.png's tiles, 1 px = 2 tiles) with names, a 1 km grid and a legend, for the
owner's markup. Names and positions from the skeleton (shared/world3-skeleton.js via tools/world3-skeleton.mjs).
  node tools/world3-skeleton.mjs skel.json; crop docs/world-v3-world.png to its map (16, 40, 2520 x 2016) as base.png
  python3 tools/world3-labels.py base.png skel.json docs/world-v3-world-labeled.png clean.png
"""
import sys, json, math
from PIL import Image, ImageDraw, ImageFont

BASE, SKEL, OUT_L, OUT_C = sys.argv[1:5]
S = 0.5                                   # px per tile
SK = json.load(open(SKEL))
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONTI = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf'
_f = {}
def F(size, style=''):
    k = (size, style)
    if k not in _f: _f[k] = ImageFont.truetype(FONTB if style == 'b' else FONTI if style == 'i' else FONT, size)
    return _f[k]

base = Image.open(BASE).convert('RGB')
W, H = base.size

def grid(img):
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for k in range(0, 6):
        x = int(k * 1000 * S)
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 70), width=1)
        d.text((x + 5, 4) if k < 5 else (x - 5, 4), f'{k} km', font=F(16, 'b'), fill=(255, 255, 255, 230), anchor='la' if k < 5 else 'ra', stroke_width=3, stroke_fill=(10, 10, 16, 230))
    for k in range(0, 5):
        y = int(k * 1000 * S)
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 70), width=1)
        if k > 0: d.text((5, y + 4 if y + 24 < H else y - 22), f'{k} km', font=F(16, 'b'), fill=(255, 255, 255, 230), stroke_width=3, stroke_fill=(10, 10, 16, 230))
    return Image.alpha_composite(img.convert('RGBA'), ov)

def text(d, x, y, s, size, style='', fill=(255, 255, 255), anchor='mm', stroke=3):
    d.text((x, y), s, font=F(size, style), fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=(12, 12, 18))

def cum(pts):
    L = [0.0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    return L
def at(pts, frac):
    L = cum(pts); s = L[-1] * frac
    for i in range(1, len(L)):
        if L[i] >= s:
            t = (s - L[i - 1]) / max(1e-9, L[i] - L[i - 1]); a, b = pts[i - 1], pts[i]
            return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, math.atan2(b[1] - a[1], b[0] - a[0])
    return pts[-1][0], pts[-1][1], 0.0

def rotated(img, x, y, s, size, angle, fill, style=''):
    # a road's name along the road (never upside down)
    a = math.degrees(angle)
    if a > 90: a -= 180
    if a < -90: a += 180
    f = F(size, style)
    bb = f.getbbox(s, stroke_width=3)
    tw, th = bb[2] - bb[0] + 8, bb[3] - bb[1] + 8
    t = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    ImageDraw.Draw(t).text((tw / 2, th / 2), s, font=f, fill=fill, anchor='mm', stroke_width=3, stroke_fill=(12, 12, 18))
    t = t.rotate(-a, expand=True, resample=Image.BICUBIC)
    img.alpha_composite(t, (int(x - t.width / 2), int(y - t.height / 2)))

clean = grid(base)
clean.convert('RGB').save(OUT_C)

img = grid(base)
d = ImageDraw.Draw(img)

# --- roads: the highways (orange names) and the main roads (white), along the line, at a quiet spot -------------------
SKIP = {'Canal Bridge 1', 'Canal Footbridge 2', 'Canal Bridge 3', 'Canal Bridge 4', 'Canal Footbridge 5', 'Canal Bridge 6',
        'Airport Road', 'Runway Road', 'Port Bridge', 'Pelican Walk', 'Hollow Road', 'Canyon Road', 'Southbank Walk',
        'Westport Avenue', 'Southbank Avenue', 'Harbor Footbridge', 'Union Bridge', 'Eastgate Bridge', 'Harbor Tunnel', 'Toll Point Bridge'}
FRAC = {'Coast Highway': [0.13, 0.62, 0.86], 'Bay Ring': [0.30], 'North Highway': [0.25, 0.75], 'Granite Peaks Highway': [0.35],
        'Highland Highway': [0.5], 'Valley Highway': [0.45], 'Desert Highway': [0.3], 'Bay Bridge': [0.45],
        'Route 9': [0.2], 'Summit Road': [0.4], 'Redwood Coast Road': [0.55], 'Shore Road': [0.3], 'West Sea Road': [0.4],
        'Sandpiper Drive': [0.6], 'Valley Road': [0.6], 'Mine Road': [0.6], 'Mesa Road': [0.5]}
for ln in SK['lines']:
    if ln['kind'] not in ('hwy', 'art') or ln['name'] in SKIP or ' (' in ln['name']: continue
    pts = [(p[0] * S, p[1] * S) for p in ln['path']] if ln.get('path') and isinstance(ln['path'][0], list) else None
    if not pts:
        pts = [(p['x'] * S, p['y'] * S) for p in ln['path']] if ln.get('path') else [(p[0] * S, p[1] * S) for p in ln['ctrl']]
    for fr in FRAC.get(ln['name'], [0.5]):
        x, y, a = at(pts, fr)
        hw = ln['kind'] == 'hwy'
        rotated(img, x, y, ln['name'], 17 if hw else 14, a, (255, 196, 120) if hw else (240, 240, 232), 'b' if hw else '')

d = ImageDraw.Draw(img)
# --- interchanges (yellow) and the closed tunnel portals --------------------------------------------------------------
for q in SK['interchanges']:
    x, y = q['at'][0] * S, q['at'][1] * S
    d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 236, 90), width=2)
    left = q['name'] in ('Redwood Junction',)
    text(d, x - 9 if left else x + 9, y + 12 if left else y - 10, q['name'], 14, '', (255, 236, 120), 'rm' if left else 'lm', 3)
for q in SK['closures']:
    x, y = min(W - 6, q['at'][0] * S), max(6, q['at'][1] * S)
    text(d, x - 4 if x > W - 20 else x + 6, y + 14 if y < 20 else y, 'tunnel (closed)', 13, 'i', (255, 210, 210), 'rm' if x > W - 20 else 'lm', 3)

# --- water ------------------------------------------------------------------------------------------------------------
WATERC = (190, 228, 255)
for l in SK['lakes']:
    xs = [p[0] for p in l['poly']]; ys = [p[1] for p in l['poly']]
    text(d, sum(xs) / len(xs) * S, sum(ys) / len(ys) * S, l['name'], 18, 'i', WATERC)
x, y, a = at([(p[0] * S, p[1] * S) for p in SK['river']['pts']], 0.62); rotated(img, x + 26, y, 'the Long Reach (river)', 16, a, WATERC, 'i')
for s in SK['streams']:
    x, y, a = at([(p[0] * S, p[1] * S) for p in s['pts']], 0.5 if s['name'] != 'Silver Thread Creek' else 0.62); rotated(img, x + 18, y, s['name'], 14, a, WATERC, 'i')
d = ImageDraw.Draw(img)
text(d, 3420 * S, 2150 * S, 'THE BAY', 40, 'b', (170, 210, 245))
text(d, 2300 * S, 3700 * S, 'THE OPEN SEA', 44, 'b', (170, 210, 245))
text(d, 170 * S, 1500 * S, 'THE SEA', 30, 'b', (170, 210, 245))

# --- the regions (biomes) ---------------------------------------------------------------------------------------------
REG = {'Granite Peaks': (900, 330), 'Highland Woods': (700, 1330), 'Willow Valley': (2900, 1180), 'Red Rock Desert': (4300, 1400),
       'North Ridge': (3330, 110), 'Sandpiper Coast': (4560, 1990), 'Egret Coast': (720, 2440), 'Northshore': (2950, 1612)}
for b in SK['biomes']:
    x, y = REG.get(b['name'], (0, 0))
    text(d, x * S, y * S, b['name'].upper(), 40 if b['name'] not in ('North Ridge', 'Northshore') else 30, 'b', (255, 255, 255), stroke=5)

# --- towns and cities -------------------------------------------------------------------------------------------------
TOWN_OFF = {'Metro City': (0, -120), 'Southbank': (110, 20), 'Westport': (0, -260), 'Northshore': (-330, -60),
            'Cedar Falls': (0, -150), 'Dry Creek': (0, 60), 'Gull Harbor': (0, 90), 'Timber Bend': (0, -50),
            'Willow Crossing': (0, -55), 'Lucky Mesa': (0, -150), 'Copper Gulch': (0, 60), 'Dusty Hollow': (0, -50),
            'Sandpiper Bay': (0, 75), 'Route 9': (60, 40), 'Egret Point': (-80, -60)}
TOWN_NAME = {'Cedar Falls': 'Cedar Isle (Cedar Falls)', 'Metro City': 'METRO CITY', 'Westport': 'WESTPORT'}
for t in SK['towns']:
    if t['name'] == 'Northshore': continue   # (the region's name stands for it)
    x, y = t['at'][0] * S, t['at'][1] * S
    ox, oy = TOWN_OFF.get(t['name'], (0, -50))
    big = t['name'] in ('Metro City', 'Westport')
    if not t.get('today'): d.rectangle([x - 4, y - 4, x + 4, y + 4], fill=(255, 255, 255), outline=(12, 12, 18), width=2)
    text(d, x + ox * S, y + oy * S, TOWN_NAME.get(t['name'], t['name']), 30 if big else 24, 'b', (255, 248, 225), stroke=4)

# --- the islands --------------------------------------------------------------------------------------------------------
ISL = [('Westport International (airport)', 1400, 2770), ('Pelican Key', 2374, 2990), ('Port Westport', 1060, 2160),
       ('Paradise Cay', 1364, 3445), ('Coral Cay', 1644, 3590), ('Lighthouse Rock', 236, 1630), ("Smuggler's Rock", 3598, 3240),
       ('PRISON ISLAND', 4320, 3130), ('Egret Rocks', 330, 2950)]
for name, x, y in ISL:
    text(d, x * S, y * S, name, 22 if name not in ('PRISON ISLAND', 'Port Westport') else 26 if name == 'PRISON ISLAND' else 16, 'b', (255, 248, 225), stroke=4)

# --- landmarks ----------------------------------------------------------------------------------------------------------
LM_OFF = {'North Cape Light': (70, 0, 'lm'), 'Egret Point Light': (40, 40, 'lm'), 'Sandpiper Point Light': (30, 50, 'lm'),
          'Silver Thread Falls': (30, 0, 'lm'), 'Lookout Hill': (0, -40, 'mm'), 'Granite Lookout': (30, 0, 'lm'),
          'Copper Gulch Mine': (40, 20, 'lm'), 'Red Rock Dam': (0, 60, 'mm'), 'Granite Peaks': (0, 0, None),
          'Redwood campgrounds': (30, 0, 'lm'), 'Lakeside campground': (-30, 0, 'rm'), 'Mesa camp': (30, 0, 'lm'),
          'Toll plaza and marina (Toll Point)': (0, 60, 'mm'), 'Westport International': (0, 0, None), 'Prison': (0, 0, None)}
for q in SK['landmarks']:
    ox, oy, anc = LM_OFF.get(q['name'], (30, 0, 'lm'))
    if anc is None: continue
    x, y = q['at'][0] * S, q['at'][1] * S
    d.polygon([(x, y - 7), (x - 6, y + 5), (x + 6, y + 5)], fill=(255, 140, 60), outline=(12, 12, 18))
    text(d, x + ox * S, y + oy * S, q['name'], 16, '', (255, 230, 200), anc, 3)

# --- the legend (over the open sea, bottom right) -----------------------------------------------------------------------
LX, LY, LW, LH = W - 790, H - 330, 770, 310
ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
od.rounded_rectangle([LX, LY, LX + LW, LY + LH], 10, fill=(14, 18, 30, 225), outline=(220, 220, 230, 255), width=2)
img = Image.alpha_composite(img, ov); d = ImageDraw.Draw(img)
d.text((LX + 18, LY + 14), 'City Life Auto - World v3 as built (2026-10-11)', font=F(22, 'b'), fill=(255, 255, 255))
d.text((LX + 18, LY + 46), '5.04 x 4.03 km (5040 x 4032 tiles), grid lines every 1 km. Drawn from the built map, 1 px = 2 tiles.', font=F(13), fill=(210, 210, 220))
KEY = [((236, 140, 40), 'Highway (light orange: on a bridge or deck)'), ((240, 238, 228), 'Main road (arterial); grey: streets'),
       ((255, 236, 90), 'Interchange ramps'), ((70, 210, 90), 'Main line railway (pale: bridge; dark: tunnel)'),
       ((150, 50, 40), 'Tunnels (road or subway)'), ((70, 140, 170), 'Rivers and lakes')]
KEY2 = [((236, 240, 244), 'Snow (Granite Peaks)'), ((226, 196, 140), 'Desert; rings = mesas'), ((112, 150, 82), 'Fields and pasture'),
        ((60, 100, 50), 'Forest'), ((150, 110, 96), 'Buildings'), ((255, 140, 60), 'Landmark')]
for col, (items) in ((0, KEY), (1, KEY2)):
    for k, (c, s) in enumerate(items):
        x0, y0 = LX + 18 + col * 440, LY + 82 + k * 36
        if col == 0 and k < 5: d.line([(x0, y0 + 10), (x0 + 34, y0 + 10)], fill=c, width=5)
        else: d.rectangle([x0 + 4, y0 + 2, x0 + 30, y0 + 18], fill=c, outline=(12, 12, 18))
        d.text((x0 + 44, y0 + 2), s, font=F(14), fill=(235, 235, 240))
d.text((LX + 18, LY + LH - 26), 'White squares: the new towns. Names from the skeleton (WORLD-V3.md part 6).', font=F(13), fill=(190, 190, 200))
img.convert('RGB').save(OUT_L)
print('wrote', OUT_L, OUT_C, img.size)
