"""Cut the painted ground shadows out of the street-prop sprites, so the game's live sun casts them.

The concept sheets paint every tree, palm, bench and bin with a dark, cool shadow on the ground
beside it, always falling the same way. With the sun moving through the day that baked shadow
fights the live one, so this removes it: in each prop's cell, the "object" is everything that
isn't a cool dark shadow colour; its silhouette (closed, holes filled, plus a few px for the
outline ring) is kept, and any cool-dark pixel outside it - the painted shadow - becomes
transparent. Vehicles, cash machines, subway kiosks and rooftop pieces are left alone (cars have
no painted shadow; the rooftop kit's shading belongs to the roof).

Usage:  python3 tools/deshadow.py [repo_root=.] [--review out.png]
Run it after tools/build_art.py (which rebuilds the atlases from the concept sheets). It only
changes alpha, through the palette's transparent index, so colours are untouched; running it twice
is harmless. --review writes a before/after sheet of every prop it touched.
"""
import json
import os
import sys
import numpy as np
import cv2
from PIL import Image
from scipy import ndimage

ROOT = next((a for a in sys.argv[1:] if not a.startswith('--') and not a.endswith('.png')), os.path.join(os.path.dirname(__file__), '..'))
REVIEW = sys.argv[sys.argv.index('--review') + 1] if '--review' in sys.argv else None
ASSETS = os.path.join(ROOT, 'assets')

SKIP = ('prop_atm', 'prop_subway', 'prop_roof', 'prop_mosaic', 'prop_gravel', 'prop_rubble',
        'prop_tires', 'prop_bags', 'prop_dumpster_m', 'prop_dumpster_s', 'prop_trashcan', 'prop_drum', 'prop_bikerack', 'prop_cart', 'prop_news', 'prop_mailbox', 'prop_vend',
        'prop_spool', 'prop_wheelbarrow', 'prop_pipes', 'prop_bench_m')


def shadow_mask(c):
    """c: HxWx4 RGBA cell -> bool mask of the painted ground shadow."""
    rgb = c[..., :3].astype(int)
    al = c[..., 3]
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    L = (r + g + b) / 3
    sat = rgb.max(-1) - rgb.min(-1)
    opaque = al > 8
    cool = opaque & (L < 105) & (b >= r) & (b >= g - 8) & (sat < 80)
    obj = opaque & ~cool
    sil = cv2.morphologyEx(obj.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    sil = ndimage.binary_fill_holes(sil)
    n, comp, st, _ = cv2.connectedComponentsWithStats(sil.astype(np.uint8), 8)
    big = np.zeros(sil.shape, bool)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= 0.02 * sil.size:
            big |= comp == i
    if not big.any():
        return np.zeros(sil.shape, bool)
    # a dark, cool object (black bin bags, tyres, a grey cart) looks like shadow all over: whatever
    # it would cut must be a small part of the cell's dark-cool pixels, or it's the object itself
    if cool.sum() > 0.75 * opaque.sum():
        return np.zeros(sil.shape, bool)
    keep = cv2.dilate(big.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    kill = opaque & ~keep
    # stray specks of shadow left between kept pixels
    n2, comp2, st2, _ = cv2.connectedComponentsWithStats((opaque & ~kill).astype(np.uint8), 8)
    for i in range(1, n2):
        if st2[i, cv2.CC_STAT_AREA] < 6:
            kill |= comp2 == i
    return kill


def main():
    meta = json.load(open(os.path.join(ASSETS, 'sprites.json')))
    sheets = {}
    for i, name in enumerate(meta['atlases']):
        im = Image.open(os.path.join(ASSETS, name))
        assert im.mode == 'P', f'{name}: expected a palette image'
        trn = im.info.get('transparency')
        tidx = trn.index(0) if isinstance(trn, (bytes, bytearray)) else trn
        sheets[i] = {'name': name, 'img': im, 'idx': np.array(im), 'rgba': np.array(im.convert('RGBA')), 'tidx': tidx}
    review = []
    total = 0
    for fname, f in meta['frames'].items():
        if not fname.startswith('prop_') or fname.startswith(SKIP):
            continue
        sh = sheets[f['a']]
        y0, x0 = f['y'], f['x']
        cell = sh['rgba'][y0:y0 + f['h'], x0:x0 + f['w']]
        kill = shadow_mask(cell)
        if not kill.any():
            continue
        total += int(kill.sum())
        before = cell.copy()
        sh['idx'][y0:y0 + f['h'], x0:x0 + f['w']][kill] = sh['tidx']
        sh['rgba'][y0:y0 + f['h'], x0:x0 + f['w']][kill] = 0
        review.append((fname, before, sh['rgba'][y0:y0 + f['h'], x0:x0 + f['w']].copy()))
    for sh in sheets.values():
        out = Image.fromarray(sh['idx'], 'P')
        out.putpalette(sh['img'].getpalette())
        out.info['transparency'] = sh['img'].info['transparency']
        out.save(os.path.join(ASSETS, sh['name']), optimize=True, transparency=sh['img'].info['transparency'])
    print(f'deshadow: {len(review)} props, {total} shadow px removed')
    if REVIEW and review:
        bgc = np.array([200, 215, 190], np.float32)
        def over(x):
            a = x[..., 3:4] / 255
            return (x[..., :3] * a + bgc * (1 - a)).astype(np.uint8)
        tiles = [np.concatenate([over(b), over(a)], 0) for _, b, a in review]
        rows, row, w = [], [], 0
        for t in tiles:
            if w + t.shape[1] > 1800 and row:
                rows.append(row); row, w = [], 0
            row.append(t); w += t.shape[1] + 4
        rows.append(row)
        H = sum(max(t.shape[0] for t in r) + 6 for r in rows)
        W = max(sum(t.shape[1] + 4 for t in r) for r in rows)
        canvas = np.full((H, W, 3), 40, np.uint8)
        y = 0
        for r in rows:
            x = 0
            for t in r:
                canvas[y:y + t.shape[0], x:x + t.shape[1]] = t
                x += t.shape[1] + 4
            y += max(t.shape[0] for t in r) + 6
        Image.fromarray(canvas).save(REVIEW)
        print('review sheet:', REVIEW)


if __name__ == '__main__':
    main()
