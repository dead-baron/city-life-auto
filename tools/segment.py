"""Shared sprite segmentation helpers for tools/extract_concept_art.py."""
import numpy as np
from PIL import Image
from scipy import ndimage


def segment(path, thresh=40, min_area=900, max_aspect=6.0):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    diff = np.abs(a - bg).max(axis=2)
    bgc = diff <= thresh
    lab, n = ndimage.label(bgc)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    background = np.isin(lab, list(edge))
    fg = ~background
    fg = ndimage.binary_opening(fg, iterations=2)
    lab2, n2 = ndimage.label(fg)
    objs = ndimage.find_objects(lab2)
    out = []
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        area = int((lab2[sl] == i + 1).sum())
        if area < min_area or max(w / h, h / w) > max_aspect:
            continue
        out.append({'x': sl[1].start, 'y': sl[0].start, 'w': w, 'h': h, 'area': area, 'label': i + 1})
    # reading order: cluster rows by vertical center
    out.sort(key=lambda o: o['y'] + o['h'] / 2)
    rows, cur = [], []
    for o in out:
        cy = o['y'] + o['h'] / 2
        if cur and abs(cy - (cur[-1]['y'] + cur[-1]['h'] / 2)) > max(o['h'], cur[-1]['h']) * 0.5:
            rows.append(cur)
            cur = []
        cur.append(o)
    if cur:
        rows.append(cur)
    ordered = []
    for r in rows:
        ordered.extend(sorted(r, key=lambda o: o['x']))
    return im, lab2, ordered


def crop(im, lab, o, pad=0):
    x, y, w, h = o['x'], o['y'], o['w'], o['h']
    rgb = im.crop((x, y, x + w, y + h)).convert('RGBA')
    mask = (lab[y:y + h, x:x + w] == o['label'])
    mask = ndimage.binary_fill_holes(mask)
    alpha = Image.fromarray((mask * 255).astype(np.uint8))
    rgb.putalpha(alpha)
    return rgb
