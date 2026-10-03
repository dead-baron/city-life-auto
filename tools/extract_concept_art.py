"""Cut game sprites out of the City Life Auto concept sheets and pack them into atlases.

Usage: python3 tools/extract_concept_art.py <concept_dir> [out_dir=assets]

Each concept sheet is segmented against its background colour, the chosen objects are
cropped with an alpha mask, rotated so the vehicle front points EAST (game angle 0),
resized to 2x their in-game size and shelf-packed into atlas PNGs + sprites.json.
Variants that carry real-world trademarks (USPS, UPS, FedEx, DHL, Amazon, Brinks,
Garda, FBI) are deliberately skipped.
"""
import json
import os
import sys
from PIL import Image
from segment import segment, crop

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'assets')
SCALE = 2  # atlas pixels per world pixel

# model -> (L, W) in world px (keep in sync with shared/vehicles.js)
SIZES = {
    'compact': (84, 44), 'sedan': (100, 48), 'taxi': (100, 48), 'sports': (96, 48), 'pickup': (110, 50),
    'van': (112, 54), 'police': (100, 48), 'swat': (120, 58), 'ambulance': (116, 54), 'bike': (48, 20),
    'speedboat': (104, 48), 'dinghy': (80, 40),
}

# (sheet, front direction on sheet, model, indices or None for all, exclude)
VEHICLE_SOURCES = [
    ('5c049cb0-image.png', 'up', 'compact', None, []),
    ('07cfc704-image.png', 'up', 'sedan', None, []),
    ('433db6b5-image.png', 'down', 'taxi', None, []),
    ('51155b7e-image.png', 'down', 'sports', None, []),
    ('2486798a-image.png', 'down', 'van', None, [7, 8, 9, 10, 11]),   # trademarked liveries
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

# (sheet, index, name, size px world)
PROP_SOURCES = [
    ('0893c72f-image.png', 0, 'crate1', 30), ('0893c72f-image.png', 2, 'crate2', 30),
    ('0893c72f-image.png', 4, 'crate3', 30), ('0893c72f-image.png', 6, 'crate4', 30),
    ('0893c72f-image.png', 8, 'produce', 30),
    ('0893c72f-image.png', 36, 'bag1', 30), ('0893c72f-image.png', 38, 'bag2', 30),
    ('0893c72f-image.png', 40, 'bag3', 30), ('0893c72f-image.png', 42, 'bag4', 32),
]


def fit(img, w, h):
    return img.resize((max(1, int(w)), max(1, int(h))), Image.LANCZOS)


def main():
    sprites = []  # (name, image)
    seg_cache = {}

    def objs_for(sheet):
        if sheet not in seg_cache:
            seg_cache[sheet] = segment(os.path.join(SRC, sheet))
        return seg_cache[sheet]

    counts = {}
    for sheet, front, model, idxs, excl in VEHICLE_SOURCES:
        im, lab, objs = objs_for(sheet)
        use = idxs if idxs is not None else range(len(objs))
        L, W = SIZES[model]
        for i in use:
            if i in excl or i >= len(objs):
                continue
            c = crop(im, lab, objs[i])
            c = c.rotate(-90 if front == 'up' else 90, expand=True, resample=Image.BICUBIC)
            c = fit(c, L * SCALE, W * SCALE)
            n = counts.get(model, 0)
            counts[model] = n + 1
            sprites.append((f'veh_{model}_{n}', c))
    for sheet, i, name, size in PROP_SOURCES:
        im, lab, objs = objs_for(sheet)
        c = crop(im, lab, objs[i])
        ratio = c.width / c.height
        w, h = (size, size / ratio) if ratio >= 1 else (size * ratio, size)
        sprites.append((name, fit(c, w * SCALE, h * SCALE)))

    # logo: knock out the white sheet background so it sits on the dark title screen
    import numpy as np
    from scipy import ndimage
    lim, llab, lobjs = segment(os.path.join(SRC, '1245b1cc-image.png'), thresh=18, min_area=500)
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
    os.makedirs(OUT, exist_ok=True)
    logo.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, 'logo.png'), optimize=True)

    # shelf pack
    sprites.sort(key=lambda s: -s[1].height)
    AW = 2048
    atlases, frames = [], {}
    x = y = rowh = 0
    cur = []
    def flush():
        nonlocal cur
        if not cur:
            return
        h = max(yy + img.height for _, img, xx, yy in cur)
        a = Image.new('RGBA', (AW, h), (0, 0, 0, 0))
        for name, img, xx, yy in cur:
            a.paste(img, (xx, yy))
            frames[name] = {'a': len(atlases), 'x': xx, 'y': yy, 'w': img.width, 'h': img.height}
        atlases.append(a)
        cur = []
    for name, img in sprites:
        if x + img.width + 2 > AW:
            x = 0
            y += rowh + 2
            rowh = 0
        if y + img.height > 2048:
            flush()
            x = y = rowh = 0
        cur.append((name, img, x, y))
        x += img.width + 2
        rowh = max(rowh, img.height)
    flush()
    files = []
    for i, a in enumerate(atlases):
        fn = f'atlas{i}.png'
        a.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(os.path.join(OUT, fn), optimize=True)
        files.append(fn)
    meta = {'scale': SCALE, 'atlases': files, 'frames': frames, 'variants': counts}
    with open(os.path.join(OUT, 'sprites.json'), 'w') as f:
        json.dump(meta, f, separators=(',', ':'))
    print('sprites', len(frames), 'atlases', [a.size for a in atlases], counts)


if __name__ == '__main__':
    main()
