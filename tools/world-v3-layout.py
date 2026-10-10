#!/usr/bin/env python3
"""World v3 draft layout (docs/WORLD-V3.md part 2): the plan picture docs/world-v3-layout.png.

The world rebuilt on the bones of concept WR3 (docs/art-v2/targets/WR3_whole-world.png): today's islands, cut out
of today's world map picture district by district and moved whole into a bay, the mainland round the bay holding the
new regions, and the new skeleton - highways, arterials, the railway and the subway, ferries and bridges, the river
channel - drawn over it. Plain shapes, true scale (1 px = 2 m), a 1 km grid. A plan for the owner to OK, not the game.

  python3 tools/world-v3-layout.py <grids dir> [out.png]

<grids dir> holds today's per-tile grids as raw bytes (MAP_W x MAP_H, row-major): dist.u8 (district ids), tiles.u8
(tile types), as written by:
  node -e "import('./shared/map.js').then(({generateCity:g})=>{const m=g(1337),fs=require('fs');
           for(const k of ['dist','tiles'])fs.writeFileSync(process.argv[1]+'/'+k+'.u8',m[k])})" <grids dir>
Coordinates below are World v3 tiles (1 tile = 1 m) unless they say 'today'.
"""
import sys, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

GRIDS = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'docs/world-v3-layout.png'
MAP_W, MAP_H = 1312, 1200            # today's world, tiles (shared/constants.js)
OV_X0, OV_Y0 = 24, 10                # assets/map/overview.webp: 1 px per tile, from today's tile (24, 10) (meta.json x0/y0 / 32)
W3, H3 = 5040, 4032                  # World v3: 10 x 8 regions of 504 x 504 tiles (21 x 21 chunks of 24)
S = 0.5                              # px per tile in the picture
WATER = {6, 7}                       # shared/constants.js T.WATER, T.DEEP

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
F = lambda n, b=False: ImageFont.truetype(FONTB if b else FONT, n)

C = {
    'sea': (31, 74, 128), 'bay': (40, 92, 150), 'shallow': (64, 124, 176), 'river': (70, 140, 205),
    'mountain': (138, 136, 142), 'snow': (236, 238, 244), 'forest': (46, 102, 56), 'redwood': (60, 92, 48),
    'farm': (176, 172, 92), 'farm2': (150, 160, 70), 'desert': (196, 108, 64), 'mesa': (160, 74, 46),
    'coast': (214, 196, 140), 'wetland': (88, 128, 96), 'town': (150, 144, 140), 'hwy': (244, 152, 36),
    'hwycase': (90, 40, 10), 'art': (250, 244, 214), 'artcase': (60, 50, 40), 'rail': (70, 36, 24), 'subway': (214, 70, 210),
    'ferry': (225, 250, 255), 'grid': (255, 255, 255), 'label': (255, 255, 255), 'ink': (20, 20, 28),
}

img = Image.new('RGB', (int(W3 * S), int(H3 * S)), C['sea'])
d = ImageDraw.Draw(img, 'RGBA')
P = lambda pts: [(x * S, y * S) for x, y in pts]


def smooth(pts, closed=True, it=3):
    """Chaikin corner cutting (tiles)."""
    for _ in range(it):
        out = []
        n = len(pts)
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            a, b = pts[i], pts[(i + 1) % n]
            out += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        pts = out if closed else [pts[0]] + out + [pts[-1]]
    return pts


def poly(pts, fill, it=3, outline=None, width=1):
    d.polygon(P(smooth(pts, True, it)), fill=fill, outline=outline, width=width)


def line(pts, fill, w, it=2, closed=False):
    q = P(smooth(pts, closed, it)) if it else P(pts)
    if closed:
        q = q + [q[0]]
    d.line(q, fill=fill, width=max(1, int(w)), joint='curve')


def dashed(pts, fill, w, on=10, off=8, it=2):
    q = P(smooth(pts, False, it)) if it else P(pts)
    acc, draw = 0.0, True
    for (x0, y0), (x1, y1) in zip(q, q[1:]):
        L = math.hypot(x1 - x0, y1 - y0)
        t = 0.0
        while t < L:
            seg = (on if draw else off) - acc
            t1 = min(L, t + seg)
            if draw:
                d.line([(x0 + (x1 - x0) * t / L, y0 + (y1 - y0) * t / L), (x0 + (x1 - x0) * t1 / L, y0 + (y1 - y0) * t1 / L)], fill=fill, width=w)
            acc += t1 - t
            if acc >= (on if draw else off) - 1e-6:
                acc, draw = 0.0, not draw
            t = t1


def label(x, y, text, size=14, bold=False, fill=C['label'], anchor='mm', halo=True):
    f = F(size, bold)
    if halo:
        d.text((x * S, y * S), text, font=f, fill=fill, anchor=anchor, stroke_width=3, stroke_fill=(15, 15, 22))
    else:
        d.text((x * S, y * S), text, font=f, fill=fill, anchor=anchor)


def dot(x, y, r=5, fill=(255, 255, 255), ring=(20, 20, 28)):
    d.ellipse([x * S - r, y * S - r, x * S + r, y * S + r], fill=fill, outline=ring, width=2)


def icon(x, y, kind, size=9):
    """Small landmark marks: plain shapes."""
    X, Y, s = x * S, y * S, size
    if kind == 'light':      # lighthouse: a white tower with a red band
        d.rectangle([X - 3, Y - s, X + 3, Y + s], fill=(250, 250, 250), outline=C['ink'])
        d.rectangle([X - 3, Y - 2, X + 3, Y + 2], fill=(200, 40, 40))
    elif kind == 'falls':    # waterfall: blue drop
        d.polygon([(X, Y - s), (X + s * .7, Y + s * .4), (X, Y + s), (X - s * .7, Y + s * .4)], fill=(150, 210, 255), outline=C['ink'])
    elif kind == 'peak':
        d.polygon([(X - s, Y + s * .7), (X, Y - s), (X + s, Y + s * .7)], fill=(240, 240, 245), outline=C['ink'])
    elif kind == 'mine':     # crossed tools: a dark square with an X
        d.rectangle([X - s * .8, Y - s * .8, X + s * .8, Y + s * .8], fill=(60, 50, 40), outline=(250, 220, 120), width=2)
        d.line([(X - s * .5, Y - s * .5), (X + s * .5, Y + s * .5)], fill=(250, 220, 120), width=2)
        d.line([(X + s * .5, Y - s * .5), (X - s * .5, Y + s * .5)], fill=(250, 220, 120), width=2)
    elif kind == 'casino':
        d.ellipse([X - s, Y - s, X + s, Y + s], fill=(200, 40, 140), outline=(255, 230, 120), width=3)
    elif kind == 'prison':
        d.rectangle([X - s, Y - s, X + s, Y + s], fill=(90, 90, 100), outline=(250, 250, 250), width=2)
        for k in (-1, 0, 1):
            d.line([(X + k * s * .5, Y - s), (X + k * s * .5, Y + s)], fill=(250, 250, 250), width=1)
    elif kind == 'lookout':
        d.polygon([(X - s * .6, Y + s), (X, Y - s), (X + s * .6, Y + s)], outline=(250, 250, 250), fill=(120, 80, 40), width=2)
    elif kind == 'camp':
        d.polygon([(X - s, Y + s * .7), (X, Y - s * .8), (X + s, Y + s * .7)], fill=(240, 160, 60), outline=C['ink'])
    elif kind == 'dam':
        d.rectangle([X - s * 1.2, Y - s * .35, X + s * 1.2, Y + s * .35], fill=(200, 200, 200), outline=C['ink'])
    elif kind == 'airport':
        d.ellipse([X - s, Y - s, X + s, Y + s], fill=(240, 240, 240), outline=C['ink'], width=2)
        d.line([(X - s * .7, Y), (X + s * .7, Y)], fill=C['ink'], width=3)
        d.line([(X, Y - s * .7), (X, Y + s * .5)], fill=C['ink'], width=3)
    else:                    # a generic place
        d.ellipse([X - s * .6, Y - s * .6, X + s * .6, Y + s * .6], fill=(250, 230, 90), outline=C['ink'], width=2)


# ---------------------------------------------------------------------------------------------------------------------
# The land: the mainland round the bay (north, with arms down the west and the east), then the regions on it.
MAINLAND = [
    (0, 0), (5040, 0), (5040, 2330), (4880, 2420), (4700, 2560), (4520, 2700), (4380, 2720), (4220, 2620), (4060, 2470),
    (3930, 2280), (3820, 2080), (3640, 1930), (3440, 1890), (3420, 1880), (3330, 1878), (3150, 1868), (2900, 1855),
    (2650, 1852), (2400, 1848), (2150, 1858), (1900, 1880), (1640, 1915), (1420, 1960), (1260, 2060), (1170, 2240),
    (1120, 2480), (1060, 2720), (960, 2900), (840, 3010), (700, 2960), (590, 2780), (520, 2560), (470, 2330),
    (400, 2120), (330, 1900), (360, 1640), (290, 1420), (330, 1180), (250, 980), (130, 820), (0, 760),
]
poly(MAINLAND, C['forest'], it=4)

# regions as coloured areas (drawn over the mainland, clipped by drawing the sea again later where needed)
REGIONS = {
    'mountain': [(0, 0), (2350, 0), (2300, 220), (2050, 420), (1700, 560), (1250, 700), (800, 720), (420, 640), (150, 700), (0, 760)],
    'farm': [(2150, 300), (2550, 260), (3000, 240), (3480, 260), (3620, 520), (3640, 900), (3620, 1350), (3560, 1700),
             (3400, 1800), (3000, 1720), (2650, 1580), (2250, 1500), (1980, 1300), (1950, 900), (2020, 560)],
    'desert': [(3480, 0), (5040, 0), (5040, 2200), (4700, 2160), (4300, 2050), (3980, 1900), (3800, 1700), (3700, 1350),
               (3700, 900), (3640, 520), (3500, 260)],
    'coast_e': [(3820, 2080), (3980, 1900), (4300, 2050), (4700, 2160), (5040, 2200), (5040, 2330), (4880, 2420),
                (4700, 2560), (4520, 2700), (4380, 2720), (4220, 2620), (4060, 2470), (3930, 2280)],
    'wetland': [(470, 2330), (560, 2250), (760, 2300), (900, 2500), (1000, 2700), (960, 2900), (840, 3010), (700, 2960), (590, 2780), (520, 2560)],
    'town_n': [(1950, 1880), (2000, 1640), (2300, 1560), (2700, 1560), (3050, 1640), (3250, 1760), (3330, 1878), (2650, 1852), (2150, 1858)],
}
poly(REGIONS['mountain'], C['mountain'], it=3)
for (cx, cy, r) in [(380, 230, 150), (760, 140, 170), (1180, 300, 160), (1560, 160, 140), (1950, 120, 120), (560, 480, 110), (980, 560, 90)]:
    poly([(cx - r, cy + r * .7), (cx, cy - r), (cx + r, cy + r * .7)], C['snow'], it=0)
    poly([(cx - r * .55, cy + r * .1), (cx, cy - r), (cx + r * .55, cy + r * .1)], (250, 250, 255), it=0)
poly(REGIONS['farm'], C['farm'], it=3)
# field patches in the valley (a section grid of about 250 m)
for gx in range(2100, 3550, 250):
    for gy in range(420, 1520, 250):
        if (gx // 250 + gy // 250) % 3 == 0:
            continue
        k = ((gx * 7 + gy * 13) // 250) % 3
        col = [(196, 180, 84), (128, 158, 64), (210, 196, 120)][k]
        poly([(gx + 20, gy + 20), (gx + 230, gy + 20), (gx + 230, gy + 230), (gx + 20, gy + 230)], col + (150,), it=0)
poly(REGIONS['desert'], C['desert'], it=3)
for (cx, cy, rx, ry) in [(3900, 300, 160, 70), (4150, 1000, 140, 60), (4800, 900, 170, 80), (4400, 1500, 200, 70), (4900, 1700, 120, 60), (3950, 650, 90, 50)]:
    poly([(cx - rx, cy), (cx - rx * .6, cy - ry), (cx + rx * .7, cy - ry), (cx + rx, cy), (cx + rx * .6, cy + ry * .5), (cx - rx * .7, cy + ry * .5)], C['mesa'], it=2)
poly(REGIONS['coast_e'], (150, 140, 80), it=3)
poly(REGIONS['wetland'], C['wetland'], it=3)
poly(REGIONS['town_n'], (110, 128, 96), it=3)
# beaches along the coasts (sand strips)
for seg in [[(330, 1180), (290, 1420), (360, 1640)], [(4060, 2470), (4220, 2620), (4380, 2720)], [(4700, 2560), (4880, 2420), (5040, 2330)],
            [(590, 2780), (700, 2960), (840, 3010)], [(1260, 2060), (1170, 2240)]]:
    line(seg, C['coast'], 26 * S * 2, it=2)

# the river channel (the Long Reach: navigable from the bay to Kestrel Lake), the lake, the upper river and the desert creek
RIVER = [(3375, 1890), (3360, 1700), (3300, 1500), (3320, 1300), (3250, 1110), (3120, 960), (2960, 840), (2800, 720)]
line(RIVER, C['river'], 70 * S, it=3)
poly([(2380, 560), (2520, 440), (2760, 450), (2880, 560), (2840, 700), (2640, 760), (2440, 700)], C['river'], it=3)   # Kestrel Lake
line([(2560, 445), (2480, 300), (2520, 150), (2440, 0)], C['river'], 26 * S, it=2)                                    # Kestrel Creek, the upper river
line([(1110, 690), (1180, 900), (1150, 1150), (1300, 1500), (1500, 1700), (1600, 1915)], C['river'], 18 * S, it=2)   # Silver Thread Creek
poly([(4020, 520), (4120, 470), (4240, 500), (4220, 600), (4080, 610)], C['river'], it=2)                             # Red Rock Reservoir
line([(4240, 560), (4500, 760), (4700, 1000), (4900, 1250), (5040, 1300)], (120, 160, 190), 12 * S, it=2)             # the dry wash below the dam

# ---------------------------------------------------------------------------------------------------------------------
# Today's places, cut out of today's world map picture by district and moved whole: (district ids, dx, dy) - a
# World v3 tile = today's tile + (dx, dy).
try:
    dist = open(f'{GRIDS}/dist.u8', 'rb').read()
    tiles = open(f'{GRIDS}/tiles.u8', 'rb').read()
except OSError:
    dist = tiles = None
ov = Image.open('assets/map/overview.webp').convert('RGB')

MOVES = [
    # (name, district ids, today's box to cut from (x0, y0, x1, y1) or None for all of it, offset (dx, dy) or None,
    #  top-left in World v3 when no offset) - a World v3 tile = today's tile + (dx, dy)
    ('Metro City + Southbank', {1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 16, 17, 18, 46, 0, 14}, None, (1591, 1729), None),
    ('Westport', {23, 24, 25, 26, 28, 30}, None, (1400, 1800), None),
    ('Westport International', {27}, None, (1950, 2140), None),
    ('Cedar Isle', {35, 36, 37, 38, 39, 40}, None, (2580, 2066), None),
    ('Northshore', {31, 32, 34}, None, (1510, 1560), None),
    ('Highland Woods', {29}, None, (300, 1000), None),
    ('Granite Peaks', {33}, None, (600, 150), None),
    ('Dry Creek', {9, 41, 42}, None, (2555, 649), None),
    ('Gull Harbor', {43}, None, None, (960, 3120)),
    ('Coral Cay', {44}, None, None, (1560, 3420)),
    ('Paradise Cay', {45}, (460, 655, 525, 705), None, (1330, 3330)),
    ('Lighthouse Rock', {19}, (270, 38, 345, 100), None, (200, 1680)),
    ("Smuggler's Rock", {15}, None, None, (3560, 3290)),
    # The Islets: today's six biggest islets, scattered round the bay's mouth and the west coast
    ('', {20, 21}, (510, 605, 575, 670), None, (230, 2160)),
    ('', {20, 21}, (40, 842, 95, 908), None, (1240, 3000)),
    ('', {20, 21}, (722, 313, 776, 367), None, (2560, 3420)),
    ('', {20, 21}, (40, 379, 90, 427), None, (330, 2470)),
    ('', {20, 21}, (803, 278, 845, 322), None, (3920, 3050)),
    ('', {20, 21}, (1230, 1078, 1276, 1126), None, (2050, 3560)),
]
placed = {}
if dist is not None:
    for name, ids, clip, off, tl in MOVES:
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
        rim = m.filter(ImageFilter.MaxFilter(5))       # a dark rim so a moved piece reads as one
        img.paste((24, 30, 30), (int((x0 + dx) * S), int((y0 + dy) * S)), rim)
        img.paste(crop, (int((x0 + dx) * S), int((y0 + dy) * S)), m)
        if name:
            placed[name] = (x0 + dx, y0 + dy, x1 + dx, y1 + dy)
        print(f'{name or "an islet"}: today [{x0},{y0}..{x1},{y1}) -> v3 [{x0 + dx},{y0 + dy}..{x1 + dx},{y1 + dy}) offset ({dx}, {dy})')
d = ImageDraw.Draw(img, 'RGBA')

# ---------------------------------------------------------------------------------------------------------------------
# The skeleton
def hwy(pts, it=2, w=20):
    line(pts, C['hwycase'], (w + 10) * S, it)
    line(pts, C['hwy'], w * S, it)


def art(pts, it=2, w=10):
    line(pts, C['artcase'], (w + 6) * S, it)
    line(pts, C['art'], w * S, it)


def bridge(a, b, kind='hwy'):
    w = 26 if kind == 'hwy' else 16
    d.line(P([a, b]), fill=(250, 250, 250), width=int((w + 14) * S))
    d.line(P([a, b]), fill=C['hwy'] if kind == 'hwy' else C['art'], width=int(w * S))


# arterials first (under the highways)
ARTERIALS = {
    'Shore Road': [(1300, 1990), (1700, 1890), (2100, 1880), (2600, 1880), (3100, 1890), (3320, 1900)],
    'Redwood Coast Road': [(400, 1000), (420, 1250), (430, 1500), (480, 1800), (600, 2100), (800, 2450), (900, 2750), (850, 2950)],
    'Willow Road': [(3440, 1820), (3420, 1550), (3380, 1300), (3330, 1100), (3150, 900), (2950, 760)],
    'Lake Road': [(2350, 700), (2460, 800), (2680, 800), (2900, 700)],
    'Section Road N': [(2000, 1250), (2500, 1240), (3000, 1230), (3300, 1250)],
    'Section Road S': [(2050, 1000), (3200, 990)],
    'County Road 7': [(2700, 1580), (2720, 1000), (2700, 820)],
    'Peak Road': [(1700, 520), (1500, 300), (1300, 180)],
    'Timber Road': [(1150, 1060), (800, 1100), (420, 1150)],
    'Route 9': [(3790, 1500), (4100, 1650), (4500, 1700), (4900, 1650)],
    'Mine Road': [(3820, 1180), (4100, 1200), (4400, 1230), (4690, 1180)],
    'Canyon Road': [(4000, 820), (4100, 650), (4150, 560)],
    'Sandpiper Drive': [(3950, 2250), (4200, 2500), (4450, 2620), (4750, 2480), (5000, 2340)],
    'Airport Causeway': [(2180, 2600), (2170, 2700), (2170, 2810)],
    'Old Town Bridge': [(2560, 2010), (2600, 1930), (2640, 1860)],
}
for k, pts in ARTERIALS.items():
    art(pts)

HIGHWAYS = {
    'Coast Highway': [(520, 1150), (800, 1420), (1100, 1640), (1450, 1760), (1800, 1780), (2150, 1770), (2470, 1765), (2900, 1775),
                      (3200, 1790), (3380, 1795), (3620, 1810), (3880, 2000), (4150, 2200), (4450, 2330), (4800, 2320), (5040, 2260)],
    'Highland Highway': [(1450, 1760), (1250, 1500), (1150, 1250), (1170, 1050), (1330, 820), (1450, 640), (1560, 470), (1780, 330), (2100, 300)],
    'Valley Highway': [(2470, 1765), (2440, 1450), (2380, 1150), (2320, 880), (2260, 650), (2200, 450), (2100, 300), (2150, 120), (2200, 0)],
    'Desert Highway': [(3620, 1810), (3720, 1600), (3790, 1350), (3810, 1100), (3900, 880), (4150, 720), (4420, 600), (4560, 450), (4620, 200), (4650, 0)],
}
for k, pts in HIGHWAYS.items():
    hwy(pts)

# the Bay Ring and the bridges joining every island (endpoints in World v3 tiles)
BRIDGES = [
    ('Bay Bridge', (2470, 1765), (2450, 2000), 'hwy'),            # Northshore -> Metro City (the Valley Highway's south end)
    ('Old Town Bridge', (2640, 1860), (2580, 1990), 'art'),
    ('Strait Bridge', (1650, 1790), (1680, 2060), 'hwy'),         # the mainland -> Westport (the West Causeway)
    ('Harbor Bridge', (1890, 2300), (2160, 2290), 'hwy'),          # Westport -> Metro City
    ('Pelican Way', (2190, 2120), (2250, 2140), 'art'),
    ('Airport Causeway', (2170, 2640), (2175, 2800), 'art'),
    ('Cedar Bridge', (2600, 2600), (2930, 2910), 'hwy'),           # Southbank -> Cedar Isle (the red suspension bridge)
    ('East Toll Bridge', (3500, 2990), (3990, 2600), 'hwy'),       # Cedar Isle -> the Sandpiper Coast (toll plaza and marina, I4)
    ('River Lift Bridge', (3330, 1795), (3430, 1800), 'hwy'),      # the Coast Highway over the channel mouth (lifts for boats)
]
for name, a, b, kind in BRIDGES:
    bridge(a, b, kind)
# the island ring highways the Bay Ring runs through (today's, moved with their islands)
hwy([(1540, 2058), (1848, 2058), (1848, 2290), (1800, 2440), (1600, 2442), (1522, 2270)], it=2, w=14)    # Westport Beltway (today's, moved)
hwy([(2239, 2381), (2239, 2211), (2307, 2159), (2613, 2159), (2613, 2249), (2546, 2341), (2441, 2381)], it=2, w=14)   # Metro Ring
hwy([(2898, 2956), (3040, 2918), (3220, 2918), (3460, 2928), (3495, 3000), (3490, 3106), (3450, 3151), (3200, 3158), (3000, 3148), (2898, 3096)], it=2, w=14)  # Cedar Isle Loop
hwy([(2450, 2000), (2450, 2159)], it=0, w=14)
hwy([(2441, 2381), (2520, 2500), (2600, 2600)], it=1, w=14)
hwy([(3990, 2600), (4150, 2470), (4150, 2200)], it=1, w=14)

# the railway: the Coast Line along the bay and up into the desert, the Bay Line through the islands
COAST_LINE = [(1170, 1040), (1230, 1300), (1320, 1560), (1650, 1700), (2000, 1700), (2450, 1700), (2900, 1710), (3370, 1725),
              (3680, 1700), (3900, 1450), (4200, 1260), (4560, 1180), (4700, 950), (4640, 700), (4600, 520)]
BAY_LINE = [(2450, 1700), (2470, 1830), (2480, 2000), (2551, 2089), (2476, 2216), (2397, 2216), (2296, 2216), (2296, 2300),
            (2160, 2310), (1890, 2320), (1702, 2385), (1702, 2125), (1660, 2000), (1650, 1700)]
CEDAR_SPUR = [(2296, 2300), (2296, 2409), (2440, 2520), (2586, 2560), (2900, 2900), (3030, 2983)]
for pts in (COAST_LINE, BAY_LINE, CEDAR_SPUR):
    line(pts, (245, 235, 220), 14 * S, it=2)
    line(pts, C['rail'], 9 * S, it=2)
    dashed(pts, (245, 235, 220), 2, on=3, off=6, it=2)
# the subway under Metro City: the Bay Line's tunnel (today's, kept) and a new north-south line
SUB_N = [(2551, 2089), (2381, 2189), (2421, 2249), (2391, 2339), (2306, 2434), (2441, 2499), (2591, 2489)]
dashed(SUB_N, C['subway'], 6, on=8, off=5, it=1)
dashed([(2476, 2216), (2397, 2216), (2296, 2216), (2296, 2300)], C['subway'], 6, on=8, off=5, it=0)

# ferries (dotted over the water)
FERRIES = {
    'Bay Ferry': [(2190, 2360), (2000, 2420), (1900, 2400), (1950, 2100), (2150, 1950), (2330, 1880), (2700, 1950), (2800, 2300), (3000, 2700), (3060, 2880)],
    'River Water Bus': [(2620, 2000), (2900, 1950), (3360, 1900), (3355, 1700), (3300, 1500), (3310, 1300), (3240, 1110), (3110, 960), (2950, 840), (2800, 720), (2700, 600)],
    'Gull Harbor Car Ferry': [(1450, 2560), (1300, 2800), (1180, 3000), (1060, 3140)],
    'Cay Water Bus': [(3000, 3220), (2400, 3420), (1720, 3480), (1390, 3360)],
    'Lighthouse Water Bus': [(1440, 2480), (1100, 2300), (700, 2000), (300, 1760)],
    'Prison Boat': [(3480, 3150), (3800, 3250), (4150, 3300)],
}
for k, pts in FERRIES.items():
    dashed(pts, C['ferry'], 3, on=5, off=7, it=2)

# ---------------------------------------------------------------------------------------------------------------------
# New islands (plain shapes): the prison island, the outer cays' new neighbours
poly([(4130, 3170), (4480, 3140), (4560, 3300), (4470, 3450), (4180, 3440), (4100, 3300)], (110, 106, 96), it=2)
d.rectangle([4220 * S, 3220 * S, 4440 * S, 3380 * S], outline=(230, 230, 230), width=3)
icon(4330, 3300, 'prison', 14)

# ---------------------------------------------------------------------------------------------------------------------
# Towns and landmarks (new ones and today's in their new places)
TOWNS = [  # (x, y, name, size)
    (1170, 1040, 'Timber Bend', 22), (3330, 1300, 'Willow Crossing', 22), (4560, 420, 'Lucky Mesa', 30),
    (4560, 1250, 'Copper Gulch', 20), (4250, 1000, 'Dusty Hollow (ghost town)', 18), (4500, 2520, 'Sandpiper Bay', 20),
    (3790, 1540, 'Route 9', 16), (850, 2700, 'Egret Point', 16),
]
for x, y, name, size in TOWNS:
    d.rectangle([(x - 60) * S, (y - 40) * S, (x + 60) * S, (y + 40) * S], fill=(200, 196, 190), outline=C['ink'], width=2)
    for i in range(-2, 3):
        d.line([((x + i * 22) * S, (y - 40) * S), ((x + i * 22) * S, (y + 40) * S)], fill=(120, 120, 120), width=1)
    label(x, y + (150 if name == 'Lucky Mesa' else 75), name, size, True)
# the casino city is big: its Strip and old downtown as blocks
for i, (x, y) in enumerate([(4450, 300), (4500, 360), (4560, 300), (4620, 360), (4480, 520), (4660, 480), (4700, 280)]):
    d.rectangle([(x - 30) * S, (y - 30) * S, (x + 30) * S, (y + 30) * S], fill=[(220, 70, 160), (90, 190, 230), (240, 200, 90)][i % 3], outline=C['ink'], width=2)
icon(4560, 420, 'casino', 12)

MARKS = [  # (x, y, kind, name, label dx, dy)
    (300, 900, 'light', 'North Cape Light', 0, -40), (850, 3000, 'light', 'Egret Point Light', 120, 30),
    (4440, 2730, 'light', 'Sandpiper Point Light', 0, 45), (1110, 690, 'falls', 'Silver Thread Falls', 0, -40),
    (2560, 445, 'lookout', 'Lookout Hill', 0, -40), (2620, 600, 'generic', 'Kestrel Lake', 0, 0),
    (4690, 1180, 'mine', 'Copper Gulch Mine (MI1-MI7)', 0, 45), (4130, 610, 'dam', 'Red Rock Dam', 0, 40),
    (760, 140, 'peak', 'Granite Peaks', 0, 90), (1450, 640, 'generic', 'Gorge Bridge + tunnel', 120, 0),
    (2330, 1880, 'generic', 'Northshore pier', 0, 40), (3375, 1900, 'generic', 'River mouth', 120, 30),
    (4150, 2200, 'generic', 'Sandpiper interchange', 0, -40), (2470, 1765, 'generic', 'Northshore interchange', -170, -40),
    (3620, 1810, 'generic', 'Dry Creek interchange', 120, -30), (1450, 1760, 'generic', 'Westport Junction', -40, -40),
    (4000, 2580, 'generic', 'Toll plaza + marina', 0, 40), (900, 1500, 'camp', 'Redwood campgrounds', 0, 40),
    (2050, 520, 'camp', 'Lakeside campground', -40, 40), (4800, 1700, 'camp', 'Mesa camp', 0, 40),
    (2175, 2880, 'airport', '', 0, 0), (3200, 2560, 'generic', 'Surf point (east arm)', 0, 0),
]
for x, y, kind, name, lx, ly in MARKS:
    if kind == 'generic' and name == 'Surf point (east arm)':
        continue
    icon(x, y, kind, 10)
    if name:
        label(x + lx, y + ly, name, 13)

# region names
for x, y, name, size in [
    (900, 380, 'GRANITE PEAKS', 34), (760, 1300, 'HIGHLAND WOODS', 34), (2800, 1080, 'WILLOW VALLEY', 34),
    (4330, 1440, 'RED ROCK DESERT', 34), (4550, 2050, 'SANDPIPER COAST', 26), (720, 2450, 'EGRET COAST', 22),
    (2950, 1630, 'NORTHSHORE', 24), (2300, 3900, 'THE OPEN SEA', 26),
]:
    label(x, y, name, size, True)
# the islands' names (where they went)
for name, (x0, y0, x1, y1) in placed.items():
    label((x0 + x1) / 2, y1 + 40, name, 16, True, fill=(255, 245, 200))
label(2175, 2990, 'Airport island', 14, True, fill=(255, 245, 200)) if 'Westport International' not in placed else None
label(4330, 3090, 'Prison Island (new)', 16, True, fill=(255, 245, 200))
label(2190, 2005, 'Pelican Key', 13, True, fill=(255, 245, 200))
label(3050, 2440, 'THE BAY', 30, True, fill=(200, 230, 255))

# skeleton names (small, along the lines)
for x, y, name in [
    (1000, 1530, 'Coast Highway'), (3000, 1745, 'Coast Highway'), (4500, 2290, 'Coast Highway'), (1260, 1330, 'Highland Hwy'),
    (2330, 1300, 'Valley Hwy'), (3990, 830, 'Desert Hwy'), (2520, 1900, 'Bay Bridge'), (1580, 1950, 'Strait Bridge'),
    (2030, 2260, 'Harbor Bridge'), (2840, 2780, 'Cedar Bridge'), (3800, 2850, 'East Toll Bridge'), (3550, 1950, 'Lift bridge'),
    (2060, 1660, 'Coast Line (rail)'), (4300, 1320, 'Coast Line'), (1790, 2510, 'Bay Line (rail)'), (3200, 1600, 'the Long Reach'),
    (2100, 2470, 'Bay Ferry'), (3000, 1420, 'River Water Bus'), (1330, 2900, 'Gull Harbor car ferry'), (2200, 3480, ''),
    (2700, 2200, 'subway (2 lines)'), (2990, 800, 'Willow Road'), (650, 1950, 'Redwood Coast Rd'), (4250, 1180, 'Mine Road'),
]:
    if name:
        label(x, y, name, 12, fill=(255, 250, 210))

# ---------------------------------------------------------------------------------------------------------------------
# The 1 km grid, the frame, the legend
for k in range(0, W3 + 1, 1000):
    d.line([(k * S, 0), (k * S, H3 * S)], fill=(255, 255, 255, 70), width=1)
    label(k + 40, 30, f'{k // 1000} km', 12, anchor='lm')
for k in range(0, H3 + 1, 1000):
    d.line([(0, k * S), (W3 * S, k * S)], fill=(255, 255, 255, 70), width=1)
    if k:
        label(20, k - 30, f'{k // 1000} km', 12, anchor='lm')
for k in range(504, W3, 504):
    d.line([(k * S, 0), (k * S, 8)], fill=(255, 255, 255), width=1)

LX, LY = 3080, 3500
d.rectangle([LX * S, LY * S, (LX + 1940) * S, (LY + 520) * S], fill=(16, 22, 34, 225), outline=(220, 220, 230), width=2)
label(LX + 40, LY + 50, 'City Life Auto - World v3 draft layout (on the bones of WR3)', 20, True, anchor='lm')
label(LX + 40, LY + 100, '5.04 x 4.03 km (5040 x 4032 tiles, 1 tile = 1 m), 10 x 8 regions of 504 m; grid lines every 1 km', 13, anchor='lm')
label(LX + 40, LY + 140, "Map pictures = today's places, cut out by district and moved whole; plain colours = new land", 13, anchor='lm')
ys = LY + 190
for kind, text in [('hwy', 'Highway (and highway bridge)'), ('art', 'Arterial / county road'), ('rail', 'Railway (Coast Line, Bay Line)'),
                   ('sub', 'Subway (under Metro City)'), ('ferry', 'Ferry route'), ('river', 'River channel, the Long Reach (boats to Kestrel Lake)')]:
    x0, x1, y = (LX + 40) * S, (LX + 240) * S, ys * S
    if kind == 'hwy':
        d.line([(x0, y), (x1, y)], fill=C['hwycase'], width=15); d.line([(x0, y), (x1, y)], fill=C['hwy'], width=10)
    elif kind == 'art':
        d.line([(x0, y), (x1, y)], fill=C['artcase'], width=8); d.line([(x0, y), (x1, y)], fill=C['art'], width=5)
    elif kind == 'rail':
        d.line([(x0, y), (x1, y)], fill=(245, 235, 220), width=7); d.line([(x0, y), (x1, y)], fill=C['rail'], width=4)
    elif kind == 'sub':
        dashed([((LX + 40), ys), ((LX + 240), ys)], C['subway'], 6, on=8, off=5, it=0)
    elif kind == 'ferry':
        dashed([((LX + 40), ys), ((LX + 240), ys)], C['ferry'], 3, on=5, off=7, it=0)
    else:
        d.line([(x0, y), (x1, y)], fill=C['river'], width=12)
    label(LX + 280, ys, text, 13, anchor='lm')
    ys += 56
xs2 = LX + 1000
ys = LY + 190
for col, text in [(C['mountain'], 'Granite Peaks: mountains'), (C['forest'], 'Highland Woods: redwood and pine forest'), (C['farm'], 'Willow Valley: farmland, Kestrel Lake'),
                  (C['desert'], 'Red Rock Desert: canyons, mesas, casino city'), ((150, 140, 80), 'Sandpiper Coast: beaches, surf'),
                  (C['wetland'], 'Egret Coast: marsh and dunes'), ((110, 128, 96), 'Northshore: towns on the bay')]:
    d.rectangle([xs2 * S, (ys - 16) * S, (xs2 + 60) * S, (ys + 16) * S], fill=col, outline=(230, 230, 230))
    label(xs2 + 90, ys, text, 13, anchor='lm')
    ys += 47

img.save(OUT, optimize=True)
print('wrote', OUT, img.size)
