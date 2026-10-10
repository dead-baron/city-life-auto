#!/usr/bin/env python3
"""World v3's skeleton picture (docs/WORLD-V3.md part 6): docs/world-v3-layout-v2.png, drawn FROM the skeleton's data
(shared/world3-skeleton.js, written out as JSON by tools/world3-skeleton.mjs), in the draft layout's style
(tools/world-v3-layout.py): the biome colours, today's islands cut out of today's world map picture and placed, the
lines with their tunnels dotted and bridges cased in white, the main line as a double line, the stations,
interchanges, closed tunnel mouths, a legend and the 1 km grid.

  node tools/world3-skeleton.mjs skel.json
  python3 tools/world-v3-skeleton.py skel.json <grids dir> [out.png] [--over docs/world-v3-markup-2026-10-10.png]

<grids dir> as for tools/world-v3-layout.py (today's dist.u8 and tiles.u8); without it the islands are plain shapes.
--over draws the lines over another picture of the frame (the owner's markup) to check the tracing against it.
"""
import sys, json, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

args = [a for a in sys.argv[1:] if not a.startswith('--')]
OVER = sys.argv[sys.argv.index('--over') + 1] if '--over' in sys.argv else None
if OVER in args:
    args.remove(OVER)
SK = json.load(open(args[0]))
GRIDS = args[1] if len(args) > 1 else None
OUT = args[2] if len(args) > 2 else 'docs/world-v3-layout-v2.png'
MAP_W, MAP_H = 1312, 1200
OV_X0, OV_Y0 = 24, 10
W3, H3 = SK['frame']
S = 0.5
WATER = {6, 7}
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
F = lambda n, b=False: ImageFont.truetype(FONTB if b else FONT, n)
C = {
    'sea': (31, 74, 128), 'river': (70, 140, 205), 'mountain': (138, 136, 142), 'snow': (236, 238, 244),
    'forest': (46, 102, 56), 'farm': (176, 172, 92), 'desert': (196, 108, 64), 'mesa': (160, 74, 46), 'ridge': (150, 96, 70),
    'coast': (214, 196, 140), 'wetland': (88, 128, 96), 'sandpiper': (150, 140, 80), 'northshore': (110, 128, 96),
    'hwy': (244, 152, 36), 'hwycase': (90, 40, 10), 'art': (250, 244, 214), 'artcase': (60, 50, 40), 'rail': (40, 160, 60),
    'railcase': (20, 40, 24), 'sub1': (226, 70, 214), 'sub2': (246, 214, 40), 'ferry': (225, 250, 255), 'ink': (20, 20, 28),
    'label': (255, 255, 255), 'bridge': (250, 250, 250),
}
BIOME_COL = {'woods': C['forest'], 'peaks': C['mountain'], 'valley': C['farm'], 'desert': C['desert'], 'ridge': C['ridge'],
             'sandpiper': C['sandpiper'], 'egret': C['wetland'], 'northshore': C['northshore']}

if OVER:
    img = Image.open(OVER).convert('RGB').resize((int(W3 * S), int(H3 * S)))
    img = Image.blend(img, Image.new('RGB', img.size, (0, 0, 0)), 0.35)
else:
    img = Image.new('RGB', (int(W3 * S), int(H3 * S)), C['sea'])
d = ImageDraw.Draw(img, 'RGBA')
P = lambda pts: [(x * S, y * S) for x, y in pts]


def smooth(pts, closed=True, it=3):
    for _ in range(it):
        out, n = [], len(pts)
        for i in (range(n) if closed else range(n - 1)):
            a, b = pts[i], pts[(i + 1) % n]
            out += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        pts = out if closed else [pts[0]] + out + [pts[-1]]
    return pts


def poly(pts, fill, it=3):
    d.polygon(P(smooth([tuple(p) for p in pts], True, it)), fill=fill)


def label(x, y, text, size=14, bold=False, fill=C['label'], anchor='mm'):
    d.text((x * S, y * S), text, font=F(size, bold), fill=fill, anchor=anchor, stroke_width=3, stroke_fill=(15, 15, 22))


# --- pieces of a path by distance ------------------------------------------------------------------------------------
def cum(path):
    s = [0.0]
    for (x0, y0), (x1, y1) in zip(path, path[1:]):
        s.append(s[-1] + math.hypot(x1 - x0, y1 - y0))
    return s


def piece(path, s, a, b):
    """The part of a path between distances a and b."""
    out = []
    for i in range(len(path) - 1):
        s0, s1 = s[i], s[i + 1]
        if s1 < a or s0 > b or s1 == s0:
            continue
        def at(t):
            w = (t - s0) / (s1 - s0)
            return (path[i][0] + (path[i + 1][0] - path[i][0]) * w, path[i][1] + (path[i + 1][1] - path[i][1]) * w)
        p0 = at(max(a, s0)); p1 = at(min(b, s1))
        if not out:
            out.append(p0)
        out.append(p1)
    return out


def split(line):
    """[(kind, pts)]: the path cut into 'open', 'tunnel' and 'bridge' stretches."""
    path, s = line['path'], cum(line['path'])
    cuts = sorted({0.0, s[-1]} | {v for r in line['tunnels'] + line['bridges'] for v in r})
    out = []
    for a, b in zip(cuts, cuts[1:]):
        m = (a + b) / 2
        kind = 'tunnel' if any(x <= m <= y for x, y in line['tunnels']) else 'bridge' if any(x <= m <= y for x, y in line['bridges']) else 'open'
        pts = piece(path, s, a, b)
        if len(pts) > 1:
            out.append((kind, pts))
    return out


def stroke(pts, fill, w):
    d.line(P(pts), fill=fill, width=max(1, int(round(w))), joint='curve')


def dashed(pts, fill, w, on=10, off=8):
    q = P(pts)
    acc, draw = 0.0, True
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        t = 0.0
        while t < L:
            t1 = min(L, t + (on if draw else off) - acc)
            if draw:
                d.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * t1 / L, y0 + (y1 - y0) * t1 / L)], fill=fill, width=w)
            acc += t1 - t
            if acc >= (on if draw else off) - 1e-6:
                acc, draw = 0.0, not draw
            t = t1


def offset(pts, o):
    """A path shifted sideways by o tiles (for the main line's two tracks)."""
    out = []
    for i, (x, y) in enumerate(pts):
        a, b = pts[max(0, i - 1)], pts[min(len(pts) - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        out.append((x - dy / L * o, y + dx / L * o))
    return out


# --- the land --------------------------------------------------------------------------------------------------------
if not OVER:
    poly(SK['mainland'], C['forest'], it=4)
    for b in SK['biomes'][1:]:
        poly(b['poly'], BIOME_COL[b['key']], it=3)
        if b['key'] == 'peaks':
            for (cx, cy, r) in [(380, 230, 150), (760, 140, 170), (1180, 300, 160), (1560, 160, 140), (1950, 120, 120), (560, 480, 110), (980, 560, 90)]:
                d.polygon(P([(cx - r, cy + r * .7), (cx, cy - r), (cx + r, cy + r * .7)]), fill=C['snow'])
        if b['key'] == 'valley':
            for gx in range(2100, 3550, 250):
                for gy in range(420, 1520, 250):
                    if (gx // 250 + gy // 250) % 3 == 0:
                        continue
                    col = [(196, 180, 84), (128, 158, 64), (210, 196, 120)][((gx * 7 + gy * 13) // 250) % 3]
                    d.polygon(P([(gx + 20, gy + 20), (gx + 230, gy + 20), (gx + 230, gy + 230), (gx + 20, gy + 230)]), fill=col + (150,))
        if b['key'] == 'desert':
            for (cx, cy, rx, ry) in [(3900, 300, 160, 70), (4150, 1000, 140, 60), (4800, 900, 170, 80), (4400, 1500, 200, 70), (4900, 1700, 120, 60), (3950, 650, 90, 50)]:
                poly([(cx - rx, cy), (cx - rx * .6, cy - ry), (cx + rx * .7, cy - ry), (cx + rx, cy), (cx + rx * .6, cy + ry * .5), (cx - rx * .7, cy + ry * .5)], C['mesa'], it=2)
    for seg in [[(330, 1180), (290, 1420), (360, 1640)], [(3880, 2600), (4060, 2620), (4220, 2650), (4380, 2720)], [(4700, 2560), (4880, 2420), (5040, 2330)],
                [(589, 2778), (702, 2961), (791, 2992), (901, 3040)], [(1800, 1872), (2150, 1858), (2650, 1852), (3150, 1868)]]:   # beaches (Northshore's along the gulf)
        stroke(smooth(seg, False, 2), C['coast'], 26)
    stroke(smooth([tuple(p) for p in SK['river']['pts']], False, 3), C['river'], SK['river']['width'] * S)
    for st in SK['streams']:
        stroke(smooth([tuple(p) for p in st['pts']], False, 2), C['river'], st['width'] * S)
    for lk in SK['lakes']:
        poly(lk['poly'], C['river'], it=3)

    # today's islands, cut out of today's world map picture by district and placed (shared/world3.js PLACEMENTS)
    MOVES = [
        ({29}, None, (300, 1000), None), ({33}, None, (600, 150), None), ({9, 41, 42}, None, (2555, 649), None),
        ({43}, None, None, (960, 3120)), ({44}, None, None, (1560, 3420)), ({45}, (460, 655, 525, 705), None, (1330, 3330)),
        ({19}, (270, 38, 345, 100), None, (200, 1680)), ({15}, None, None, (3560, 3290)),
        ({20, 21}, (510, 605, 575, 670), None, (230, 2160)), ({20, 21}, (40, 842, 95, 908), None, (1240, 3000)),
        ({20, 21}, (722, 313, 776, 367), None, (2560, 3420)), ({20, 21}, (40, 379, 90, 427), None, (330, 2470)),
        ({20, 21}, (803, 278, 845, 322), None, (3920, 3050)), ({20, 21}, (1230, 1078, 1276, 1126), None, (2050, 3560)),
    ]
    try:
        dist = open(f'{GRIDS}/dist.u8', 'rb').read() if GRIDS else None
        tiles = open(f'{GRIDS}/tiles.u8', 'rb').read() if GRIDS else None
    except OSError:
        dist = tiles = None
    if dist is not None:
        ov = Image.open('assets/map/overview.webp').convert('RGB')
        for ids, clip, off, tl in MOVES:
            cx0, cy0, cx1, cy1 = clip or (0, 0, MAP_W, MAP_H)
            xs, ys = [], []
            mask = Image.new('L', (MAP_W, MAP_H), 0)
            mp = mask.load()
            for y in range(cy0, cy1):
                row = y * MAP_W
                for x in range(cx0, cx1):
                    if dist[row + x] in ids and tiles[row + x] not in WATER:
                        mp[x, y] = 255
                        xs.append(x); ys.append(y)
            if not xs:
                continue
            x0, x1, y0, y1 = min(xs), max(xs) + 1, min(ys), max(ys) + 1
            dx, dy = off if off else (tl[0] - x0, tl[1] - y0)
            crop = ov.crop((x0 - OV_X0, y0 - OV_Y0, x1 - OV_X0, y1 - OV_Y0))
            m = mask.crop((x0, y0, x1, y1))
            w, h = max(1, int((x1 - x0) * S)), max(1, int((y1 - y0) * S))
            crop = crop.resize((w, h), Image.LANCZOS)
            m = m.resize((w, h), Image.LANCZOS).filter(ImageFilter.MaxFilter(3))
            img.paste((24, 30, 30), (int((x0 + dx) * S), int((y0 + dy) * S)), m.filter(ImageFilter.MaxFilter(5)))
            img.paste(crop, (int((x0 + dx) * S), int((y0 + dy) * S)), m)
        # the gulf's places at their new size (the skeleton's `picture`: today's districts, top-left in the frame, the
        # scale): the islands' land first, then today's look over it, then the canal through Metro City
        for isl in SK['islands']:
            if 'picture' in isl:
                poly(isl['poly'], (124, 118, 108), it=1)
        for pc in [i for i in SK['islands'] if 'picture' in i] + SK.get('pieces', []):
            pic = pc['picture']; ids = set(pic['ids']); k = pic['scale']
            x0, y0, x1, y1 = pic['from']
            mask = Image.new('L', (x1 - x0, y1 - y0), 0); mp = mask.load()
            for y in range(y0, y1):
                row = y * MAP_W
                for x in range(x0, x1):
                    if dist[row + x] in ids and tiles[row + x] not in WATER:
                        mp[x - x0, y - y0] = 255
            crop = ov.crop((x0 - OV_X0, y0 - OV_Y0, x1 - OV_X0, y1 - OV_Y0))
            w, h = max(1, int((x1 - x0) * k * S)), max(1, int((y1 - y0) * k * S))
            crop = crop.resize((w, h), Image.LANCZOS); m = mask.resize((w, h), Image.LANCZOS).filter(ImageFilter.MaxFilter(3))
            at = (int(pic['at'][0] * S), int(pic['at'][1] * S))
            img.paste((24, 30, 30), at, m.filter(ImageFilter.MaxFilter(5)))
            img.paste(crop, at, m)
        d = ImageDraw.Draw(img, 'RGBA')
    for isl in SK['islands']:
        if 'poly' in isl and 'picture' not in isl:   # (the gulf's islands are drawn above, with their pictures)
            poly(isl['poly'], (110, 106, 96) if isl['key'] == 'prison' else (120, 130, 100), it=2)
    if SK.get('canal'):
        stroke(smooth([tuple(p) for p in SK['canal']['pts']], False, 2), C['sea'], SK['canal']['width'] * S)
    x0, y0, x1, y1 = SK['port']['rect']
    d.rectangle([x0 * S, y0 * S, x1 * S, y1 * S], fill=(120, 120, 128), outline=(30, 30, 36), width=2)
    for k in range(y0 + 30, y1 - 10, 60):   # the cranes along the west quay
        d.rectangle([(x0 + 4) * S, k * S, (x0 + 30) * S, (k + 14) * S], fill=(230, 120, 40), outline=C['ink'])

# --- the lines -------------------------------------------------------------------------------------------------------
lines = SK['lines']
by = lambda kind: [l for l in lines if l['kind'] == kind]
for l in by('ferry'):
    dashed(l['path'], C['ferry'], 3, on=5, off=7)
for l in by('art'):
    if l.get('foot'):
        for kind, pts in split(l):
            stroke(pts, C['ink'], 9 * S); stroke(pts, (255, 214, 110), 5 * S)
        continue
    for kind, pts in split(l):
        if kind == 'tunnel':
            dashed(pts, C['art'], 5, on=5, off=6)
        else:
            if kind == 'bridge':
                stroke(pts, C['bridge'], 26 * S)
                if l['mayBeTunnel']:
                    stroke(pts, (60, 120, 170), 18 * S)
            stroke(pts, C['artcase'], 16 * S)
            stroke(pts, C['art'], 10 * S)
for l in by('main'):
    for kind, pts in split(l):
        a, b = offset(pts, 7), offset(pts, -7)
        if kind == 'tunnel':
            dashed(a, C['rail'], 3, on=6, off=6); dashed(b, C['rail'], 3, on=6, off=6)
            continue
        if kind == 'bridge':
            stroke(pts, C['bridge'], 34 * S)
        stroke(pts, C['railcase'], 24 * S)
        stroke(a, C['rail'], 3); stroke(b, C['rail'], 3)
for l in by('hwy'):
    for kind, pts in split(l):
        if kind == 'tunnel':
            dashed(pts, C['hwy'], 7, on=7, off=6)
        else:
            if kind == 'bridge':
                stroke(pts, C['bridge'], 40 * S)
            stroke(pts, C['hwycase'], 30 * S)
            stroke(pts, C['hwy'], 20 * S)
for l in by('sub'):
    col = C['sub1'] if l['color'] == 'pink' else C['sub2']
    for kind, pts in split(l):
        if kind == 'tunnel':
            dashed(pts, col, 5, on=6, off=5)
        else:
            stroke(pts, C['bridge'], 16 * S)
            stroke(pts, col, 9 * S)

# --- crossings, interchanges, closures, stations ------------------------------------------------------------------------
for c in SK['crossings']:
    X, Y = c['x'] * S, c['y'] * S
    if c['kind'] == 'level crossing':
        d.line([(X - 6, Y - 6), (X + 6, Y + 6)], fill=(250, 60, 50), width=3); d.line([(X - 6, Y + 6), (X + 6, Y - 6)], fill=(250, 60, 50), width=3)
    elif c['kind'] in ('overpass', 'bridge', 'flyover'):
        d.ellipse([X - 3, Y - 3, X + 3, Y + 3], fill=(255, 255, 255), outline=C['ink'])
    elif c['kind'] == 'interchange':
        d.ellipse([X - 6, Y - 6, X + 6, Y + 6], outline=(255, 255, 255), width=2)
for ic in SK['interchanges']:
    X, Y = ic['at'][0] * S, ic['at'][1] * S
    d.ellipse([X - 11, Y - 11, X + 11, Y + 11], fill=(255, 210, 120), outline=C['ink'], width=3)
for cl in SK['closures']:
    X, Y = min(max(cl['at'][0] * S, 12), W3 * S - 12), min(max(cl['at'][1] * S, 12), H3 * S - 12)
    d.rectangle([X - 11, Y - 11, X + 11, Y + 11], fill=(30, 30, 30), outline=(255, 210, 120), width=3)
    d.line([(X - 7, Y - 7), (X + 7, Y + 7)], fill=(255, 80, 60), width=3); d.line([(X - 7, Y + 7), (X + 7, Y - 7)], fill=(255, 80, 60), width=3)
for st in SK['stations']:
    X, Y = st['at'][0] * S, st['at'][1] * S
    if st['line'] == 'main':
        d.rectangle([X - 8, Y - 8, X + 8, Y + 8], fill=(255, 255, 255), outline=C['railcase'], width=3)
    else:
        col = C['sub1'] if st['line'].endswith('1') else C['sub2']
        d.ellipse([X - 7, Y - 7, X + 7, Y + 7], fill=(255, 255, 255), outline=col, width=4)

if not OVER:
    # towns, landmarks, names
    for t in SK['towns']:
        if t.get('today'):
            continue
        x, y = t['at']
        d.rectangle([(x - 50) * S, (y - 34) * S, (x + 50) * S, (y + 34) * S], fill=(200, 196, 190), outline=C['ink'], width=2)
        label(x, y + 70, t['name'] + (' (ghost town)' if t.get('note') == 'ghost town' else ''), 18, True)
    for m in SK['landmarks']:
        x, y = m['at']
        d.ellipse([x * S - 6, y * S - 6, x * S + 6, y * S + 6], fill=(250, 230, 90), outline=C['ink'], width=2)
        label(x, y - 34, m['name'], 12)
    for x, y, name, size in [
        (900, 380, 'GRANITE PEAKS', 34), (760, 1300, 'HIGHLAND WOODS', 34), (2800, 1150, 'WILLOW VALLEY', 34),
        (4330, 1440, 'RED ROCK DESERT', 34), (4600, 2060, 'SANDPIPER COAST', 24), (720, 2450, 'EGRET COAST', 22),
        (3000, 1620, 'NORTHSHORE', 24), (3150, 60, 'NORTH RIDGE', 22), (2950, 2960, 'THE GULF', 30), (2300, 3900, 'THE OPEN SEA', 26),
        (2150, 2240, 'METRO CITY', 20), (2290, 2700, 'SOUTHBANK', 15), (1430, 2120, 'WESTPORT', 18), (3080, 2580, 'CEDAR ISLE', 18),
        (4330, 3090, 'Prison Island', 16), (1040, 3330, 'Gull Harbor', 15), (1225, 2440, 'Port Westport', 13), (2370, 2990, 'Pelican Key', 12),
        (2270, 2560, 'the canal', 11),
    ]:
        label(x, y, name, size, True)
    names = {}
    for l in lines:
        if l['kind'] in ('hwy', 'main') and l['length'] > 900:
            path = l['path']
            x, y = path[len(path) // 3]
            names[l['name']] = (x, y)
    for name, (x, y) in names.items():
        label(x, y - 28, name, 12, fill=(255, 250, 210))

# --- the 1 km grid and the legend ---------------------------------------------------------------------------------------
for k in range(0, W3 + 1, 1000):
    d.line([(k * S, 0), (k * S, H3 * S)], fill=(255, 255, 255, 70), width=1)
    label(k + 40, 30, f'{k // 1000} km', 12, anchor='lm')
for k in range(0, H3 + 1, 1000):
    d.line([(0, k * S), (W3 * S, k * S)], fill=(255, 255, 255, 70), width=1)
    if k:
        label(20, k - 30, f'{k // 1000} km', 12, anchor='lm')
if not OVER:
    sm = SK['summary']
    LX, LY = 2980, 3390
    d.rectangle([LX * S, LY * S, (LX + 2040) * S, (LY + 636) * S], fill=(16, 22, 34, 230), outline=(220, 220, 230), width=2)
    label(LX + 40, LY + 44, 'City Life Auto - World v3 skeleton v2: the gulf (drawn from shared/world3-skeleton.js)', 19, True, anchor='lm')
    label(LX + 40, LY + 88, '5.04 x 4.03 km, grid lines every 1 km. The owner\'s markup of 2026-10-10, the rulings (WORLD-V3.md part 5), the gulf (part 7)', 12, anchor='lm')
    tk = lambda k: sm['tunnels'].get(k, {'count': 0, 'km': 0})
    bk = lambda k: sm['bridges'].get(k, {'count': 0, 'km': 0})
    label(LX + 40, LY + 120, f"highways {sm['km']['hwy']} km, arterials {sm['km']['art']} km, main line {sm['km']['main']} km (double track), subways {sm['km']['sub']} km", 12, anchor='lm')
    label(LX + 40, LY + 150, f"tunnels: road {tk('hwy')['count'] + tk('art')['count']}, rail {tk('main')['count']}, subway {tk('sub')['count']}; bridges: road {bk('hwy')['count'] + bk('art')['count']}, rail {bk('main')['count']}, subway {bk('sub')['count']}; stations {sum(sm['stations'].values())}", 12, anchor='lm')
    ys = LY + 196
    def sample(kind, y):
        a, b = (LX + 40, y), (LX + 300, y)
        if kind == 'hwy':
            stroke([a, b], C['hwycase'], 15); stroke([a, b], C['hwy'], 10)
        elif kind == 'hwyt':
            dashed([a, b], C['hwy'], 7, on=7, off=6)
        elif kind == 'art':
            stroke([a, b], C['artcase'], 8); stroke([a, b], C['art'], 5)
        elif kind == 'artb':
            stroke([a, b], C['bridge'], 13); stroke([a, b], (60, 120, 170), 9); stroke([a, b], C['artcase'], 8); stroke([a, b], C['art'], 5)
        elif kind == 'main':
            stroke([a, b], C['railcase'], 12); stroke(offset([a, b], 7), C['rail'], 3); stroke(offset([a, b], -7), C['rail'], 3)
        elif kind == 'maint':
            dashed(offset([a, b], 7), C['rail'], 3, on=6, off=6); dashed(offset([a, b], -7), C['rail'], 3, on=6, off=6)
        elif kind == 'sub1':
            stroke([a, b], C['bridge'], 8); stroke([a, b], C['sub1'], 5); dashed([(LX + 180, y), b], C['sub1'], 5, on=6, off=5)
        elif kind == 'sub2':
            stroke([a, b], C['bridge'], 8); stroke([a, b], C['sub2'], 5); dashed([(LX + 180, y), b], C['sub2'], 5, on=6, off=5)
        elif kind == 'ferry':
            dashed([a, b], C['ferry'], 3, on=5, off=7)
        elif kind == 'foot':
            stroke([a, b], C['ink'], 9 * S); stroke([a, b], (255, 214, 110), 5 * S)
    for kind, text in [('hwy', 'Highway (white casing: on a bridge)'), ('hwyt', 'Highway in a tunnel'), ('art', 'Arterial road'),
                       ('artb', 'West Sea Road causeway (could be a tunnel)'), ('main', 'Main line, double track'), ('maint', 'Main line in a tunnel'),
                       ('sub1', 'Subway line 1: viaduct, then underground'), ('sub2', 'Subway line 2: viaduct, then underground'), ('ferry', 'Ferry'), ('foot', 'Footbridge')]:
        sample(kind, ys)
        label(LX + 330, ys, text, 12, anchor='lm')
        ys += 42
    xs2, ys = LX + 1180, LY + 196
    X = xs2 * S
    for draw, text in [
        (lambda X, Y: d.ellipse([X - 11, Y - 11, X + 11, Y + 11], fill=(255, 210, 120), outline=C['ink'], width=3), 'Highway interchange'),
        (lambda X, Y: (d.rectangle([X - 11, Y - 11, X + 11, Y + 11], fill=(30, 30, 30), outline=(255, 210, 120), width=3), d.line([(X - 7, Y - 7), (X + 7, Y + 7)], fill=(255, 80, 60), width=3)), 'Closed tunnel mouth (map edge)'),
        (lambda X, Y: d.rectangle([X - 8, Y - 8, X + 8, Y + 8], fill=(255, 255, 255), outline=C['railcase'], width=3), 'Main line station'),
        (lambda X, Y: d.ellipse([X - 7, Y - 7, X + 7, Y + 7], fill=(255, 255, 255), outline=C['sub1'], width=4), 'Subway station'),
        (lambda X, Y: (d.line([(X - 6, Y - 6), (X + 6, Y + 6)], fill=(250, 60, 50), width=3), d.line([(X - 6, Y + 6), (X + 6, Y - 6)], fill=(250, 60, 50), width=3)), 'Level crossing (gated)'),
        (lambda X, Y: d.ellipse([X - 3, Y - 3, X + 3, Y + 3], fill=(255, 255, 255), outline=C['ink']), 'Overpass / rail bridge'),
        (lambda X, Y: d.ellipse([X - 6, Y - 6, X + 6, Y + 6], outline=(255, 255, 255), width=2), 'Road interchange at a town'),
    ]:
        draw(X, ys * S)
        label(xs2 + 50, ys, text, 12, anchor='lm')
        ys += 42

img.save(OUT, optimize=True)
print('wrote', OUT, img.size)
