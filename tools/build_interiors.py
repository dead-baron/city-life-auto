"""Shop and public-building interiors cut from the concept interior paintings.

Usage: python3 tools/build_interiors.py <concept_dir> [repo_root=.]

Each painting is a top-down cutaway of a whole shop - back wall (staff area, counter) at the top,
the shop floor in the middle, the glass front and door at the bottom - which is exactly how the
game's walk-in units are laid out. The interior part of each painting (inside the walls) is cut
out, scaled down to at most MAX_W px wide and packed into one sheet.

Whole outdoor scene paintings (a golf course...) are cut the same way into a second sheet; the
map lays them over open wild ground (shared/islands.js SCENE_SPOTS).

Outputs
  assets/interiors.webp      the packed interiors
  assets/scenes.webp         the outdoor scene paintings
  shared/interior-art.js     generated: which painting(s) each walk-in business kind uses + rects
"""
import json
import os
import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')
MAX_W = 512

# name -> (concept file, crop box in source px: the inside of the walls, door at the bottom)
CROPS = {
    'liquor':   ('e64cbc31-image.png', (480, 180, 1144, 578)),    # corner liquor store
    'corner':   ('7bc80c60-image.png', (544, 172, 1062, 566)),    # 24-hour corner store
    'fuelmart': ('e3f952b3-image.png', (62, 44, 1508, 800)),      # gas station shop
    'freshmart': ('761f4587-image.png', (318, 98, 1296, 624)),    # supermarket
    'pawn':     ('f03f9fc2-image.png', (8, 30, 1440, 1000)),      # pawn shop
    'boutique': ('023fcef7-image.png', (14, 38, 1522, 1008)),     # clothing boutique
    'outfitter': ('fda467a6-image.png', (14, 38, 1522, 1008)),    # sporting goods / outdoor store
    'bank':     ('832ce44d-image.png', (236, 38, 1344, 576)),     # bank hall
    'hospital': ('3f2693ed-image.png', (300, 0, 1236, 900)),      # hospital lobby
    'police':   ('904b7cc6-image.png', (38, 254, 1500, 768)),     # police station floor
}
# outdoor scenes: key -> (concept file, crop box, width to keep in px)
SCENES = {
    'golf': ('4d9b4746-image.png', (0, 0, 1536, 950), 1536),   # clubhouse, fairways, bunkers, ponds, a creek
    'cay': ('564860fe-image.png', (0, 0, 1448, 1086), 1160),   # a palm island with a cabin and a jetty
    'canyon': ('d5c71092-image.png', (0, 0, 1536, 1024), 1200),  # desert canyon: mesas, a homestead, a dirt road
    'coach': ('9038c592-image.png', (70, 200, 1470, 740), 900),  # inside a passenger coach (the riding view)
}
# Scenes that reshape the ground under them: the painting is sampled into a tile mask (cols x
# rows) - '.' water, 's' sand/dirt, 'g' grass, 'd' jetty, '#' solid (cliffs, buildings).
# solid / dock: rects in fractions of the painting forced to that class.
MASKS = {
    'cay': {'w': 58, 'h': 44, 'kind': 'island', 'dock': [(0.58, 0.6, 0.76, 0.87)], 'solid': [(0.505, 0.30, 0.6, 0.45)]},
    'canyon': {'w': 54, 'h': 36, 'kind': 'desert', 'dock': [], 'solid': [(0.15, 0.05, 0.26, 0.25), (0.03, 0.03, 0.11, 0.23)]},
}
# walk-in business kind -> paintings it can use (picked per building)
KINDS = {
    'convenience': ['liquor', 'corner'], 'gasstation': ['fuelmart'], 'grocery': ['freshmart'],
    'pawn': ['pawn'], 'fence': ['pawn'], 'clothing': ['boutique'],
    'sports': ['outfitter'], 'hardware': ['outfitter'], 'gunshop': ['outfitter'], 'tackle': ['outfitter'],
    'bank': ['bank'], 'courthouse': ['bank'], 'hospital': ['hospital'], 'pharmacy': ['hospital'], 'police': ['police'],
}


def tile_mask(name, crop, spec):
    import numpy as np
    from scipy import ndimage
    im = np.asarray(Image.open(os.path.join(SRC, name)).convert('RGB').crop(crop)).astype(int)
    H, W, _ = im.shape
    w, h = spec['w'], spec['h']
    cls = [['s'] * w for _ in range(h)]
    rock = np.zeros((h, w), bool)
    for ty in range(h):
        for tx in range(w):
            b = im[int(ty * H / h):int((ty + 1) * H / h), int(tx * W / w):int((tx + 1) * W / w)].reshape(-1, 3)
            r, g, bl = b[:, 0], b[:, 1], b[:, 2]
            if spec['kind'] == 'island':
                if ((bl > r + 25) & (bl >= g - 40)).mean() > 0.55: cls[ty][tx] = '.'
                elif ((g > r + 8) & (g > bl)).mean() > 0.35: cls[ty][tx] = 'g'
            else:
                lum = (r + g + bl) / 3
                rock[ty, tx] = ((lum < 115) & (r - g > 35)).mean() > 0.45
    if spec['kind'] != 'island':
        rock = ndimage.binary_closing(rock, np.ones((3, 3)))
        lab, n = ndimage.label(rock)
        for k in range(1, n + 1):
            if (lab == k).sum() < 6: rock[lab == k] = False
        for ty in range(h):
            for tx in range(w):
                if rock[ty, tx]: cls[ty][tx] = '#'
    for key, ch in (('dock', 'd'), ('solid', '#')):
        for fx0, fy0, fx1, fy1 in spec[key]:
            for ty in range(int(fy0 * h), int(fy1 * h)):
                for tx in range(int(fx0 * w), int(fx1 * w)):
                    if ch == 'd' and cls[ty][tx] != 's': continue  # only the planks (read as sand) out in the water
                    cls[ty][tx] = ch
    return {'w': w, 'h': h, 'rows': [''.join(r) for r in cls]}


def main():
    pieces = {}
    for key, (name, box) in CROPS.items():
        im = Image.open(os.path.join(SRC, name)).convert('RGB').crop(box)
        if im.width > MAX_W:
            im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
        pieces[key] = im
    # shelf-pack, tallest first
    order = sorted(pieces, key=lambda k: -pieces[k].height)
    W = MAX_W * 2 + 4
    x = y = row_h = 0
    rects = {}
    for k in order:
        im = pieces[k]
        if x + im.width > W:
            x = 0; y += row_h + 2; row_h = 0
        rects[k] = [x, y, im.width, im.height]
        x += im.width + 2; row_h = max(row_h, im.height)
    H = y + row_h
    sheet = Image.new('RGB', (W, H), (0, 0, 0))
    for k, (rx, ry, _, _) in rects.items():
        sheet.paste(pieces[k], (rx, ry))
    out = os.path.join(ROOT, 'assets', 'interiors.webp')
    sheet.save(out, 'WEBP', quality=90, method=6)
    # outdoor scenes, stacked
    scene_ims = {}
    for key, (name, box, keep_w) in SCENES.items():
        im = Image.open(os.path.join(SRC, name)).convert('RGB').crop(box)
        if im.width > keep_w:
            im = im.resize((keep_w, round(im.height * keep_w / im.width)), Image.LANCZOS)
        scene_ims[key] = im
    sw = max(im.width for im in scene_ims.values())
    sh = sum(im.height + 2 for im in scene_ims.values())
    ssheet = Image.new('RGB', (sw, sh), (0, 0, 0))
    scene_rects, yy = {}, 0
    for key, im in scene_ims.items():
        ssheet.paste(im, (0, yy)); scene_rects[key] = [0, yy, im.width, im.height]; yy += im.height + 2
    ssheet.save(os.path.join(ROOT, 'assets', 'scenes.webp'), 'WEBP', quality=84, method=6)
    masks = {k: tile_mask(SCENES[k][0], SCENES[k][1], spec) for k, spec in MASKS.items()}
    js = ('// Generated by tools/build_interiors.py - do not edit.\n'
          '// Interior paintings for walk-in shops: rect [x, y, w, h] in assets/interiors.webp, door side at the bottom.\n'
          f'export const INTERIOR_RECTS = {json.dumps(rects)};\n'
          f'export const INTERIOR_KINDS = {json.dumps(KINDS)};\n'
          '// Outdoor scene paintings: rect [x, y, w, h] in assets/scenes.webp.\n'
          f'export const SCENE_RECTS = {json.dumps(scene_rects)};\n'
          '// Ground under the reshaping scenes, one char per tile: . water, s sand/dirt, g grass, d jetty, # solid.\n'
          f'export const SCENE_MASKS = {json.dumps(masks)};\n')
    with open(os.path.join(ROOT, 'shared', 'interior-art.js'), 'w') as f:
        f.write(js)
    print('interiors', W, 'x', H, os.path.getsize(out), 'bytes', len(rects), 'paintings')


if __name__ == '__main__':
    main()
