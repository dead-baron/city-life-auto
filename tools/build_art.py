"""Build every game art asset from the City Life Auto concept sheets.

Usage: python3 tools/build_art.py <concept_dir> [repo_root=.]

Outputs
  assets/atlas0.png + assets/sprites.json   vehicles, crates, loot bags, street props (2 px per world px)
  assets/prefabs.png                        whole building lots cut from the building sheet (native res,
                                            drawn at PREFAB_SCALE world px per source px)
  assets/ground.png                         seamless 128x128 ground textures (1 px per world px)
  assets/logo.png                           title logo with transparent background
  shared/prefab-data.js                     generated: prefab footprints/doors in tiles + atlas rects

Vehicle liveries with real-world trademarks (USPS, UPS, FedEx, DHL, Amazon, Brinks, Garda, FBI)
are skipped on purpose.
"""
import json
import os
import sys
import tempfile
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy import ndimage
from segment import segment, crop

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')
ASSETS = os.path.join(ROOT, 'assets')
SCALE = 2          # sprite atlas px per world px
PREFAB_SCALE = 2   # world px per building-sheet source px
TILE = 32

# ----------------------------------------------------------------------------- vehicles
# model -> footprint area in world px^2. Each model keeps the art's own proportions
# (no stretching), so the collision box is exactly the sprite's outline.
AREAS = {'compact': 84 * 44, 'sedan': 100 * 48, 'taxi': 100 * 48, 'sports': 96 * 48, 'pickup': 110 * 50,
         'van': 112 * 54, 'police': 100 * 48, 'swat': 120 * 58, 'ambulance': 116 * 54, 'bike': 48 * 20,
         'speedboat': 104 * 48, 'dinghy': 80 * 40, 'bus': 190 * 60, 'armored': 118 * 56}

# Vehicles cut from a box on a sheet (largest object inside the box): (sheet, box, front, model)
VEHICLE_BOXES = [
    ('ae847b9b-image.png', (512, 180, 580, 334), 'up', 'bus'),
    ('ae847b9b-image.png', (376, 178, 436, 336), 'up', 'armored'),
]

VEHICLE_SOURCES = [
    ('5c049cb0-image.png', 'up', 'compact', None, []),
    ('07cfc704-image.png', 'up', 'sedan', None, []),
    ('433db6b5-image.png', 'down', 'taxi', None, []),
    ('51155b7e-image.png', 'down', 'sports', None, []),
    ('2486798a-image.png', 'down', 'van', None, [7, 8, 9, 10, 11]),
    ('c4bd5f1c-image.png', 'up', 'pickup', [0, 1, 2], []),
    ('1a76d8fe-image.png', 'down', 'police', [0], []),
    ('a1ca5305-image.png', 'down', 'police', [0, 1, 2], []),
    ('1a76d8fe-image.png', 'down', 'swat', [1], []),
    ('a1ca5305-image.png', 'down', 'swat', [6], []),
    ('a1ca5305-image.png', 'down', 'ambulance', [14, 16, 17, 19, 20], []),
    ('7254f892-image.png', 'up', 'bike', None, []),
    ('75494cb5-image.png', 'up', 'speedboat', None, []),
    ('75494cb5-image.png', 'up', 'dinghy', [0, 3, 6, 9], []),
]

ITEM_SOURCES = [
    ('0893c72f-image.png', 0, 'crate1', 30), ('0893c72f-image.png', 2, 'crate2', 30),
    ('0893c72f-image.png', 4, 'crate3', 30), ('0893c72f-image.png', 6, 'crate4', 30),
    ('0893c72f-image.png', 8, 'produce', 30),
    ('0893c72f-image.png', 36, 'bag1', 30), ('0893c72f-image.png', 38, 'bag2', 30),
    ('0893c72f-image.png', 40, 'bag3', 30), ('0893c72f-image.png', 42, 'bag4', 32),
]

# ----------------------------------------------------------------------------- street props
PROPS_SHEET = 'ae847b9b-image.png'
PANELS = {'furn': (602, 42, 1052, 350), 'env': (585, 390, 1025, 622), 'food': (1035, 390, 1440, 622),
          'park': (1100, 660, 1440, 862), 'trash': (392, 660, 730, 862), 'ind': (740, 660, 1095, 862)}
# name: (panel, index, longest side in world px)
PROPS = {
    'tree_a': ('env', 0, 78), 'tree_b': ('env', 5, 78), 'palm_a': ('env', 8, 62), 'palm_b': ('env', 9, 58),
    'palm_c': ('env', 11, 58), 'palm_d': ('env', 17, 50), 'shrub_a': ('env', 1, 40), 'shrub_b': ('env', 4, 38),
    'palm_s': ('env', 6, 44), 'flowerbed': ('env', 15, 60), 'planter_sq': ('env', 14, 32), 'planter_g': ('env', 3, 34),
    'bench_a': ('furn', 0, 40), 'bench_b': ('furn', 1, 40), 'bench_m': ('furn', 2, 40), 'trashcan': ('furn', 3, 16),
    'dumpster_s': ('furn', 5, 42), 'mailbox': ('furn', 6, 18), 'dumpster_m': ('furn', 11, 50),
    'planter_fl': ('furn', 12, 46), 'atm': ('furn', 10, 20), 'news_a': ('furn', 19, 16), 'news_b': ('furn', 22, 16),
    'news_c': ('furn', 27, 16), 'hydrant': ('furn', 17, 16), 'hydrant_y': ('furn', 20, 16), 'cone': ('furn', 15, 14),
    'bikerack': ('furn', 21, 30), 'bush_a': ('furn', 31, 30), 'bush_b': ('furn', 32, 30), 'bush_c': ('furn', 33, 36),
    'umbrella_r': ('food', 0, 46), 'umbrella_b': ('food', 1, 46), 'umbrella_g': ('food', 2, 46), 'umbrella_y': ('food', 3, 46),
    'foodcart': ('food', 4, 44), 'foodcart_b': ('food', 5, 44), 'stall': ('food', 6, 66), 'vend_a': ('food', 11, 26),
    'vend_cola': ('food', 12, 26), 'vend_c': ('food', 13, 26), 'produce_a': ('food', 7, 30), 'produce_b': ('food', 10, 30),
    'pbench': ('park', 0, 42), 'flowers_a': ('park', 1, 48), 'flowers_big': ('park', 9, 52), 'fountain': ('park', 10, 84),
    'mosaic': ('park', 11, 60), 'potted': ('park', 12, 24),
    'bags': ('trash', 0, 40), 'cart': ('trash', 9, 36), 'dump_g': ('trash', 11, 46), 'dump_b': ('trash', 13, 46),
    'dump_o': ('trash', 15, 46), 'tires': ('trash', 20, 40), 'pallet_s': ('trash', 21, 30),
    'pallet': ('ind', 0, 38), 'pipes': ('ind', 1, 46), 'rubble': ('ind', 2, 38), 'lumber': ('ind', 3, 60),
    'barrier': ('ind', 6, 46), 'wheelbarrow': ('ind', 7, 36), 'gravel': ('ind', 9, 38), 'sandbags': ('ind', 10, 42),
    'pallet_b': ('ind', 11, 44), 'drum': ('ind', 12, 22), 'spool': ('ind', 13, 30), 'planks': ('ind', 14, 38),
}

# ----------------------------------------------------------------------------- building prefabs
BUILDINGS = 'a750d4b7-image.png'
# key: (src box, solid fractions x0,y0,x1,y1, door x fractions, ground, rotatable)
PREFABS = {
    'house1': ((13, 43, 128, 270), (.13, .22, .88, .63), [.5], 'lot', True),
    'house2': ((138, 43, 245, 270), (.09, .21, .94, .65), [.5], 'lot', True),
    'house3': ((253, 43, 352, 270), (.12, .21, .92, .63), [.5], 'lot', True),
    'apt1': ((368, 43, 530, 276), (.18, .08, .90, .78), [.5], 'lot', True),
    'apt2': ((543, 43, 710, 276), (.12, .04, .88, .80), [.5], 'lot', True),
    'tower1': ((725, 43, 882, 280), (.14, .02, .92, .80), [.5], 'plaza', True),
    'tower2': ((891, 43, 1006, 280), (.06, .02, .93, .86), [.5], 'plaza', True),
    'hotel': ((1021, 43, 1196, 280), (.12, .02, .84, .64), [.5], 'plaza', False),
    'hospital': ((1211, 43, 1438, 262), (.07, .02, .93, .74), [.5], 'plaza', False),
    'police': ((11, 325, 208, 480), (.13, .05, .88, .86), [.5], 'lot', False),
    'fire': ((221, 325, 418, 466), (.16, .05, .95, .97), [.4], 'lot', False),
    'gas': ((433, 325, 638, 546), (.67, .01, .93, .20), [.8], 'lot', False),
    'conv': ((653, 325, 863, 476), (.12, .04, .93, .85), [.5], 'lot', False),
    'strip': ((876, 325, 1153, 474), (.04, .15, .96, .82), [.17, .39, .61, .83], 'lot', False),
    'market': ((1165, 325, 1438, 470), (.06, .04, .95, .88), [.5], 'lot', False),
    'rest1': ((11, 588, 168, 793), (.17, .07, .78, .52), [.45], 'plaza', False),
    'rest2': ((178, 588, 323, 793), (.07, .07, .90, .65), [.5], 'plaza', False),
    'club': ((338, 588, 520, 793), (.10, .05, .86, .71), [.45], 'plaza', False),
    'bank': ((533, 588, 750, 793), (.14, .04, .88, .86), [.5], 'plaza', False),
    'dealer': ((765, 588, 998, 733), (.22, .05, .92, .89), [.57], 'lot', False),
    'repair': ((1011, 588, 1226, 743), (.15, .06, .80, .84), [.4], 'lot', False),
    'warehouse': ((1241, 588, 1438, 736), (.06, .03, .95, .78), [.5], 'lot', False),
    'industrial': ((11, 835, 316, 1076), (.05, .03, .96, .68), [.5], 'lot', True),
    'construction': ((558, 835, 793, 1076), (.29, .07, .96, .68), [.15], 'dirt', True),
    'church': ((806, 835, 970, 1076), (.13, .03, .90, .68), [.5], 'plaza', False),
    'school': ((985, 835, 1208, 983), (.06, .05, .94, .92), [.5], 'lot', False),
    'park': ((1221, 835, 1438, 1076), (.30, .11, .66, .46), [.5], 'grass', True),
}

# ----------------------------------------------------------------------------- ground textures
# name: (sheet, box, extra brightness) -> seamless 128x128 at 1 px per world px
GROUND = {
    'asphalt': ('1000056784.png', (74, 82, 318, 326)),
    'asphalt_worn': ('1000056784.png', (803, 88, 1047, 332)),
    'concrete': ('1000056787.png', (167, 556, 440, 822)),
    'brick': ('1000056784.png', (78, 612, 334, 868)),
    'slate': ('1000056787.png', (926, 563, 1116, 753)),
    'water': ('d46d170d-image.png', (141, 468, 259, 584)),
    'deep': ('d46d170d-image.png', (268, 723, 382, 845)),
}


def find_src(name):
    for d in (SRC, '/mnt/user-data/uploads'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def fit(img, w, h):
    return img.resize((max(1, int(round(w))), max(1, int(round(h)))), Image.LANCZOS)


def seamless(img):
    """Blend an image with its half-offset copy so it tiles without seams."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    b = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    yy = np.abs(np.linspace(-1, 1, h))[:, None]
    xx = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(1 - np.maximum(xx, yy), 0, 1) ** 0.7
    m = np.clip(m * 1.6, 0, 1)[..., None]
    out = a * m + b * (1 - m)
    return Image.fromarray(out.astype(np.uint8))


def shelf_pack(items, width=2048, pad=2):
    items = sorted(items, key=lambda s: -s[1].height)
    frames, sheets, cur = {}, [], []
    x = y = rowh = 0

    def flush():
        if not cur:
            return
        h = max(yy + img.height for _, img, xx, yy in cur)
        a = Image.new('RGBA', (width, h), (0, 0, 0, 0))
        for name, img, xx, yy in cur:
            a.paste(img, (xx, yy))
            frames[name] = {'a': len(sheets), 'x': xx, 'y': yy, 'w': img.width, 'h': img.height}
        sheets.append(a)
        cur.clear()

    for name, img in items:
        if x + img.width + pad > width:
            x, y, rowh = 0, y + rowh + pad, 0
        if y + img.height > 2048:
            flush()
            x = y = rowh = 0
        cur.append((name, img, x, y))
        x += img.width + pad
        rowh = max(rowh, img.height)
    flush()
    return frames, sheets


def save_png(img, path, colors=256):
    img.quantize(colors=colors, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)

# Rooftop equipment modules cut from the style-guide roof tiles (inside the parapet), stamped onto
# procedural flat roofs: name -> (sheet, box, longest side in world px)
ROOF_SHEET = '1000056778.png'
ROOF_MODULES = {
    'ac': ((604, 38, 840, 240), 92), 'heli': ((606, 598, 842, 776), 150), 'tanks': ((904, 596, 1122, 776), 96),
    'sky': ((1180, 598, 1410, 772), 104), 'access': ((1180, 842, 1410, 1016), 90),
}


def feather(img, px):
    """Fade the outer px pixels to transparent so a module blends into the roof surface."""
    w, h = img.size
    xx = np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]
    yy = np.minimum(np.arange(h), np.arange(h)[::-1])[:, None]
    a = np.clip(np.minimum(xx, yy) / px, 0, 1)
    out = img.convert('RGBA')
    out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    return out


def build_sprites():
    sprites, counts, aspects = [], {}, {}
    cache = {}

    def seg(sheet):
        if sheet not in cache:
            cache[sheet] = segment(find_src(sheet))
        return cache[sheet]

    raw = []
    for sheet, front, model, idxs, excl in VEHICLE_SOURCES:
        im, lab, objs = seg(sheet)
        for i in (idxs if idxs is not None else range(len(objs))):
            if i in excl or i >= len(objs):
                continue
            c = crop(im, lab, objs[i])
            c = c.rotate(-90 if front == 'up' else 90, expand=True, resample=Image.BICUBIC)
            c = c.crop(c.getbbox())
            raw.append((model, c))
            aspects.setdefault(model, []).append(c.width / c.height)
    with tempfile.TemporaryDirectory() as td:
        for sheet, box, front, model in VEHICLE_BOXES:
            pth = os.path.join(td, 'box.png')
            Image.open(find_src(sheet)).convert('RGB').crop(box).save(pth)
            im, lab, objs = segment(pth, thresh=20, min_area=400, max_aspect=6)
            o = max(objs, key=lambda q: q['area'])
            c = crop(im, lab, o)
            c = c.rotate(-90 if front == 'up' else 90, expand=True, resample=Image.BICUBIC)
            c = c.crop(c.getchannel('A').getbbox())
            raw.append((model, c))
            aspects.setdefault(model, []).append(c.width / c.height)
    lengths = {}
    for m, a in aspects.items():
        r = float(np.median(a))
        w = (AREAS[m] / r) ** 0.5
        lengths[m] = [int(round(w * r)), int(round(w))]
    for model, c in raw:
        n = counts.get(model, 0)
        counts[model] = n + 1
        L, W = lengths[model]
        sprites.append((f'veh_{model}_{n}', fit(c, L * SCALE, W * SCALE)))
    for sheet, i, name, size in ITEM_SOURCES:
        im, lab, objs = seg(sheet)
        c = crop(im, lab, objs[i])
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        sprites.append((name, fit(c, w * SCALE, h * SCALE)))

    sheet_img = Image.open(find_src(PROPS_SHEET)).convert('RGB')
    panel_objs = {}
    with tempfile.TemporaryDirectory() as td:
        for k, box in PANELS.items():
            p = os.path.join(td, k + '.png')
            sheet_img.crop(box).save(p)
            panel_objs[k] = segment(p, thresh=20, min_area=120, max_aspect=10)
    prop_sizes = {}
    for name, (panel, idx, size) in PROPS.items():
        im, lab, objs = panel_objs[panel]
        c = crop(im, lab, objs[idx])
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        prop_sizes[name] = [round(w), round(h)]
        sprites.append(('prop_' + name, fit(c, w * SCALE, h * SCALE)))
    roof_src = Image.open(find_src(ROOF_SHEET)).convert('RGB')
    for name, (box, size) in ROOF_MODULES.items():
        c = roof_src.crop(box)
        r = c.width / c.height
        w, h = (size, size / r) if r >= 1 else (size * r, size)
        prop_sizes['roof_' + name] = [round(w), round(h)]
        sprites.append(('prop_roof_' + name, feather(fit(c, w * SCALE, h * SCALE), 10)))
        print('  roof module', name, 'mean', tuple(int(v) for v in np.asarray(c).reshape(-1, 3).mean(0)))
    frames, sheets = shelf_pack(sprites)
    files = []
    for i, a in enumerate(sheets):
        fn = f'atlas{i}.png'
        save_png(a, os.path.join(ASSETS, fn))
        files.append(fn)
    with open(os.path.join(ASSETS, 'sprites.json'), 'w') as f:
        json.dump({'scale': SCALE, 'atlases': files, 'frames': frames, 'variants': counts, 'props': prop_sizes}, f, separators=(',', ':'))
    print('sprites', len(frames), 'vehicle lengths', lengths)
    return lengths, prop_sizes


SR_WEIGHTS = os.environ.get('SR_WEIGHTS', os.path.join(ROOT, 'tools', 'weights', 'realesr-general-x4v3.pth'))


def sharpen_lot(img, tw, th):
    """Concept-sheet lot -> crisp art at 1 art px per world px (tw*32 x th*32).

    The sheet stores each lot at ~half world resolution; stretching it 2x looked soft in game.
    Real-ESRGAN (numpy port in sr_upscale.py) upscales 4x with clean edges, then we downsample
    to exact world size so every building pixel maps 1:1 to a world pixel."""
    W, H = tw * TILE, th * TILE
    if os.path.exists(SR_WEIGHTS):
        from sr_upscale import upscale_pil
        up = upscale_pil(img, SR_WEIGHTS).convert('RGB')
    else:
        print('  (no SR weights at', SR_WEIGHTS, '- falling back to Lanczos + unsharp)')
        up = img.resize((img.width * 4, img.height * 4), Image.LANCZOS)
    out = up.resize((W, H), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.0, percent=60, threshold=2))


def build_prefabs():
    src = Image.open(find_src(BUILDINGS)).convert('RGB')
    items, meta = [], {}
    for key, (box, solid, doors, ground, rot) in PREFABS.items():
        img = src.crop(box)
        sw, sh = img.size
        tw = max(1, round(sw * PREFAB_SCALE / TILE))
        th = max(1, round(sh * PREFAB_SCALE / TILE))
        sx0, sy0, sx1, sy1 = solid
        so = [int(np.floor(sx0 * tw)), int(np.floor(sy0 * th)), int(np.ceil(sx1 * tw)), int(np.ceil(sy1 * th))]
        print('  prefab', key, tw, th)
        items.append((key, sharpen_lot(img, tw, th).convert('RGBA')))
        meta[key] = {'tw': tw, 'th': th, 'solid': so, 'doors': doors, 'ground': ground, 'rot': rot}
    frames, sheets = shelf_pack(items, width=2048)
    for i, sh in enumerate(sheets):
        sh.convert('RGB').save(os.path.join(ASSETS, f'prefabs{i}.webp'), quality=93, method=6)
    for k, f in frames.items():
        meta[k]['src'] = [f['a'], f['x'], f['y'], f['w'], f['h']]
    return meta, len(sheets)


# Seamless 128px pixel-art ground textures in the palette of the concept "park / greenery" and
# beach tiles (the sheets have no clean patch big enough to tile): periodic value noise quantized
# to 4 tones at 2 world px per art px, plus blade/grain highlights.
NATURAL = {
    'grass': (['#2f5c21', '#3a6e28', '#467f2e', '#559036'], ['#72ad42', '#8cc04c'], '#24481b'),
    'sand': (['#c9ab72', '#d6ba80', '#e0c68f', '#ead3a0'], ['#f4e3bb', '#fff1cf'], '#a98b56'),
    'dirt': (['#6d5232', '#7c5f3b', '#8a6a44', '#98774e'], ['#a8875c', '#b4936a'], '#4d3a22'),
}


def natural_tex(name, n=64, seed=7):
    tones, hl, dark = NATURAL[name]
    rng = np.random.default_rng(seed + len(name))
    yy, xx = np.mgrid[0:n, 0:n] / n * 2 * np.pi
    v = np.zeros((n, n))
    for _ in range(14):
        fx, fy = rng.integers(1, 7, 2)
        v += rng.uniform(0.3, 1) * np.sin(fx * xx + rng.uniform(0, 6.3)) * np.sin(fy * yy + rng.uniform(0, 6.3))
    v += rng.normal(0, 0.55, (n, n))
    q = np.digitize(v, np.quantile(v, [0.25, 0.5, 0.78]))
    pal = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in tones], np.uint8)
    img = pal[q]
    # highlights (blade tips / bright grains) and dark specks, sparse
    for c, frac in ((hl[0], 0.05), (hl[1], 0.02), (dark, 0.04)):
        m = rng.random((n, n)) < frac
        img[m] = [int(c[i:i + 2], 16) for i in (1, 3, 5)]
    if name == 'grass':  # short blades: a bright pixel with a darker one under it
        ys, xs = np.nonzero(rng.random((n, n)) < 0.035)
        for y, x in zip(ys, xs):
            img[y, x] = [156, 204, 82]
            img[(y + 1) % n, x] = [44, 90, 31]
    return Image.fromarray(img).resize((n * 2, n * 2), Image.NEAREST)


def build_ground():
    tiles = []
    for name, (sheet, box) in GROUND.items():
        img = Image.open(find_src(sheet)).convert('RGB').crop(box)
        img = seamless(img.resize((128, 128), Image.LANCZOS))
        tiles.append((name, img))
    for name in ('grass', 'sand', 'dirt'):
        tiles.append((name, natural_tex(name)))
    out = Image.new('RGB', (128 * len(tiles), 128))
    rects = {}
    for i, (name, img) in enumerate(tiles):
        out.paste(img, (i * 128, 0))
        rects[name] = [i * 128, 0, 128, 128]
    out.save(os.path.join(ASSETS, 'ground.png'), optimize=True)
    return rects


def build_logo():
    lim, llab, lobjs = segment(find_src('1245b1cc-image.png'), thresh=18, min_area=500)
    mask = np.zeros(llab.shape, bool)
    for o in lobjs:
        if o['area'] > 2000:
            mask |= (llab == o['label'])
    mask = ndimage.binary_fill_holes(mask)
    arr = np.array(lim.convert('RGBA'))
    arr[..., 3] = (mask * 255).astype('uint8')
    logo = Image.fromarray(arr)
    logo = logo.crop(logo.getbbox())
    logo.thumbnail((640, 640), Image.LANCZOS)
    save_png(logo, os.path.join(ASSETS, 'logo.png'))


def main():
    os.makedirs(ASSETS, exist_ok=True)
    lengths, prop_sizes = build_sprites()
    prefabs, nsheets = build_prefabs()
    ground = build_ground()
    build_logo()
    js = ('// GENERATED by tools/build_art.py - do not edit by hand.\n'
          '// Building prefabs cut from the concept building sheet. Sizes/footprints are in tiles\n'
          '// (32 world px); src is [sheet, x, y, w, h] inside assets/prefabs<sheet>.webp, stored at\n'
          '// 1 art px per world px (Real-ESRGAN upscaled from the concept sheet).\n'
          f'export const PREFAB_SHEETS = {nsheets};\n'
          f'export const PREFAB_SCALE = {PREFAB_SCALE};\n'
          f'export const PREFABS = {json.dumps(prefabs, indent=1)};\n'
          f'export const GROUND_TEX = {json.dumps(ground)};\n'
          f'export const PROP_SIZES = {json.dumps(prop_sizes)};\n'
          f'export const VEHICLE_ART_SIZE = {json.dumps(lengths)};\n')
    with open(os.path.join(ROOT, 'shared', 'prefab-data.js'), 'w') as f:
        f.write(js)
    print('prefabs', {k: (v['tw'], v['th']) for k, v in prefabs.items()})


if __name__ == '__main__':
    main()
