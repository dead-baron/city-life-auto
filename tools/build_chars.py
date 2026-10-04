"""Cut the character body template from the concept sheet "PLAYER CHARACTER (8 DIRECTION)".

Usage: python3 tools/build_chars.py [concept_dir] [repo_root=.]

The sheet shows the same plain figure (grey tee, blue jeans, dark shoes, bald head) from the
eight directions S, SW, W, NW, N, NE, E, SE, painted as pixel art at about 8x. Each figure is
cut out, scaled back down to its native pixel size (38 px tall, the height of a character in the
game's 32x44 art grid) by majority vote over each block, and every pixel is labelled by what it
is - outline, skin, shirt, trousers, shoes - with its shade within that part. The client
(client/render/chars.js) recolours the parts per outfit, adds hair, faces, hats and holds, and
animates legs and arms.

Also the female body with its 4-frame walk cycle in 8 directions (BASE FEMALE CHARACTER sheet) and
two lying-down poses from the animation sheet (knocked down, passed out).

Output: assets/chars/body.png, rows of 8 cells of 32x44 (S, SW, W, NW, N, NE, E, SE):
  row 0 male idle, row 1 female idle, rows 2-5 female walk frames 1-4.
  assets/chars/lying.png: 2 cells of 56x32 (knocked down, passed out), head to the left.
  R = part (0 none, 1 outline, 2 skin, 3 shirt, 4 trousers, 5 shoes, 6 hair)
  G = shade 0..255 (128 = the part's mid tone)
  A = 255 where there is body
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '/root/.claude/uploads/3178f15e-1719-5566-8959-b26eee0c4149'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SHEET = 'cf97aba7-image.png'
CW, CH, FOOT_Y, FIG_H = 32, 44, 42, 38

def find(name):
    for d in (SRC, '/mnt/user-data/uploads', os.path.join(ROOT, 'tools', 'data')):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def figures(im):
    """The eight figures of the first row, left to right (S, SW, W, NW, N, NE, E, SE)."""
    a = np.asarray(im).astype(int)
    fg = a.min(axis=2) < 226
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    out = []
    for i, sl in enumerate(objs):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h > 150 and sl[0].start < a.shape[0] / 2:
            out.append((sl[1].start, sl, lab[sl] == i + 1))
    out.sort(key=lambda q: q[0])
    assert len(out) == 8, f'expected 8 figures, found {len(out)}'
    return [(sl, mask) for _, sl, mask in out]


def classify(rgb):
    r, g, b = rgb.astype(int)
    mx, mn = max(r, g, b), min(r, g, b)
    if mx < 72:
        return 1                                   # outline
    if r > 150 and r - b > 38 and r >= g:
        return 2                                   # skin
    if b > r + 18 and b > 90:
        return 4                                   # jeans
    if mx - mn < 30 and mx >= 150:
        return 3                                   # shirt (light grey)
    if mx - mn < 34 and mx < 150:
        return 5                                   # shoes (dark grey)
    if r > 120 and r - b > 20:
        return 2
    return 3 if mx > 140 else 5


def downsample(crop, cls, th, tw, nparts=7):
    """Labelled source pixels -> target cell (part, shade) by majority vote per block."""
    h, w = cls.shape
    sy, sx = h / th, w / tw
    cell = np.zeros((th, tw, 4), np.uint8)
    lum = 0.3 * crop[..., 0] + 0.59 * crop[..., 1] + 0.11 * crop[..., 2]
    for ty in range(th):
        y0, y1 = int(ty * sy), max(int(ty * sy) + 1, int((ty + 1) * sy))
        for tx in range(tw):
            x0, x1 = int(tx * sx), max(int(tx * sx) + 1, int((tx + 1) * sx))
            blk = cls[y0:y1, x0:x1].ravel()
            if (blk > 0).sum() < blk.size * 0.45:
                continue
            counts = np.bincount(blk[blk > 0], minlength=nparts)
            c = 1 if counts[1] >= blk.size * 0.3 else int(np.argmax(counts))
            sel = cls[y0:y1, x0:x1] == c
            cell[ty, tx] = (c, int(lum[y0:y1, x0:x1][sel].mean()), 0, 255)
    for c in range(2, nparts):
        sel = cell[..., 0] == c
        if sel.any():
            m = cell[..., 1][sel].astype(float).mean()
            cell[..., 1][sel] = np.clip(128 + (cell[..., 1][sel].astype(float) - m) * 1.6, 0, 255).astype(np.uint8)
    return cell


# ---- the female body: "BASE FEMALE CHARACTER - SKINNY ATHLETIC (8 DIRECTIONS)" with a 4-frame
# walk cycle per direction. The figure is drawn in underwear, so the parts are assigned by where
# they are on the body: the torso becomes the top, hips to ankles the trousers, the feet shoes,
# the hair its own part (recoloured; a ponytail is dropped for short styles), skin stays skin.
FEMALE = 'ccc36a44-image.png'
F_ROWS = [(135, 335), (383, 523), (523, 672), (672, 825), (825, 1000)]  # idle, walk 1-4


def nude_figures(a, y0, y1):
    band = a[y0:y1]
    bg = np.array([91, 93, 91])
    d = np.abs(band - bg).max(axis=2)
    lum = band @ [0.3, 0.59, 0.11]
    sat = band.max(axis=2) - band.min(axis=2)
    shadow = (sat < 14) & (lum > 40) & (lum < 86)
    fg = (d > 26) & ~shadow
    fg[:, :60] = False  # the row-number column
    fg = ndimage.binary_opening(fg, iterations=1)
    lab, n = ndimage.label(fg)
    objs = ndimage.find_objects(lab)
    figs = []
    for i, sl in enumerate(objs):
        if sl is None:
            continue
        hh = sl[0].stop - sl[0].start
        if hh < (y1 - y0) * 0.45 or sl[1].stop - sl[1].start < 20:  # (and not the grid lines)
            continue
        m = ndimage.binary_fill_holes(lab[sl] == i + 1)
        figs.append((sl[1].start, (slice(sl[0].start + y0, sl[0].stop + y0), sl[1]), m))
    figs.sort(key=lambda q: q[0])
    return [(sl, m) for _, sl, m in figs]


def label_nude(crop, mask):
    h, w = mask.shape
    r, g, b = crop[..., 0], crop[..., 1], crop[..., 2]
    mx, mn = crop.max(axis=2), crop.min(axis=2)
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    cls = np.zeros((h, w), np.uint8)
    line = lum < 26
    white = (lum > 175) & (mx - mn < 40)
    hair = (lum < 86) & ~line & (r >= g)
    skin = ~line & ~white & ~hair
    # body zones by height
    ys = np.arange(h)[:, None] / h
    rows = mask.sum(axis=1)
    # the head: skin + hair rows at the top, down to where the shoulders widen
    # the neck: the narrowest row between a fifth and a half of the way down
    widths = mask.sum(axis=1).astype(float)
    lo_, hi_ = int(h * 0.2), int(h * 0.5)
    neck = (lo_ + int(np.argmin(widths[lo_:hi_] + np.arange(hi_ - lo_) * 0.15))) / h
    head = ys < neck
    legs = (ys >= 0.56) & (ys < 0.93)
    feet = ys >= 0.93
    torso = (ys >= neck) & (ys < max(0.56, neck + 0.22))
    legs = legs & ~torso
    # the legs' x extent (to tell arms from body in the torso band)
    leg_cols = np.where((mask & legs).any(axis=0))[0]
    lx0, lx1 = (leg_cols.min(), leg_cols.max()) if len(leg_cols) else (0, w)
    inside = np.zeros((h, w), bool)
    inside[:, max(0, lx0 - 1):lx1 + 2] = True
    cls[mask & line] = 1
    cls[mask & hair] = 6
    cls[mask & skin & head] = 2
    cls[mask & (skin | white) & torso & inside] = 3
    cls[mask & (skin | white) & torso & ~inside] = 2
    cls[mask & (skin | white) & legs & inside] = 4
    cls[mask & (skin | white) & legs & ~inside] = 2   # hands hanging beside the hips
    cls[mask & (skin | white) & feet] = 5
    cls[mask & white & head] = 2
    return cls


def build_female(out_rows):
    a = np.asarray(Image.open(find(FEMALE)).convert('RGB')).astype(int)
    for ri, (y0, y1) in enumerate(F_ROWS):
        figs = nude_figures(a, y0, y1)
        assert len(figs) == 8, f'female row {ri}: {len(figs)} figures'
        row = np.zeros((CH, CW * 8, 4), np.uint8)
        hmax = max(m.shape[0] for _, m in figs)
        for k, (sl, mask) in enumerate(figs):
            crop = a[sl].copy()
            cls = label_nude(crop, mask)
            h, w = mask.shape
            th = max(1, round(FIG_H * h / hmax))
            tw = min(CW, max(1, round(w * th / h)))
            cell = downsample(crop, cls, th, tw)
            ox = k * CW + (CW - tw) // 2
            row[FOOT_Y - th:FOOT_Y, ox:ox + tw] = cell
        out_rows.append(row)


# ---- lying down: "KNOCKED DOWN / DEATH" frame 8 and "PASSED OUT" from the animation sheet.
ANIM = '396409bc-image.png'
LYING_BOXES = [(100, 880, 220, 1000), (860, 880, 1100, 1010)]  # knocked down (last frame), passed out
LW, LH = 56, 32


def build_lying():
    a = np.asarray(Image.open(find(ANIM)).convert('RGB')).astype(int)
    out = np.zeros((LH, LW * len(LYING_BOXES), 4), np.uint8)
    for k, (x0, y0, x1, y1) in enumerate(LYING_BOXES):
        crop = a[y0:y1, x0:x1]
        bg = np.median(np.concatenate([crop[0], crop[-1]]), axis=0)
        d = np.abs(crop - bg).max(axis=2)
        lum = crop @ [0.3, 0.59, 0.11]
        sat = crop.max(axis=2) - crop.min(axis=2)
        fg = (d > 26) & ~((sat < 14) & (lum > 30) & (lum < 86))
        lab, n = ndimage.label(ndimage.binary_opening(fg))
        big = np.argmax(np.bincount(lab.ravel())[1:]) + 1
        m = ndimage.binary_fill_holes(lab == big)
        ys, xs = np.nonzero(m)
        crop = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        m = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        # lying along x, head to the left: zones by x instead of y
        cls = np.transpose(label_nude(np.transpose(crop, (1, 0, 2)), np.transpose(m)))
        h, w = m.shape
        tw = min(LW - 2, round(w * 0.30)); th = max(1, min(LH - 2, round(h * tw / w)))
        cell = downsample(crop, cls, th, tw)
        out[(LH - th) // 2:(LH - th) // 2 + th, k * LW + (LW - tw) // 2:k * LW + (LW - tw) // 2 + tw] = cell
    return out


def main():
    im = Image.open(find(SHEET)).convert('RGB')
    a = np.asarray(im)
    out = np.zeros((CH, CW * 8, 4), np.uint8)
    for k, (sl, mask) in enumerate(figures(im)):
        crop = a[sl].copy()
        h, w = mask.shape
        scale = FIG_H / h
        tw, th = max(1, round(w * scale)), FIG_H
        # majority vote per target pixel: class of every source pixel, then the commonest class
        # (and the mean colour of that class) wins
        cls = np.zeros(mask.shape, np.uint8)
        for y in range(h):
            for x in range(w):
                if mask[y, x]:
                    cls[y, x] = classify(crop[y, x])
        # dark shading on the shirt and the jeans reads like shoe grey: above the feet it's
        # the shading of whatever part it sits in
        rows4 = (cls == 4).sum(axis=1)
        waist = int(np.argmax(rows4 > max(3, rows4.max() * 0.25)))
        feet = int(h * 0.88)
        for y in range(feet):
            dark = cls[y] == 5
            cls[y][dark] = 3 if y < waist else 4
        cell = np.zeros((th, tw, 4), np.uint8)
        lum = 0.3 * crop[..., 0] + 0.59 * crop[..., 1] + 0.11 * crop[..., 2]
        for ty in range(th):
            y0, y1 = int(ty / scale), max(int(ty / scale) + 1, int((ty + 1) / scale))
            for tx in range(tw):
                x0, x1 = int(tx / scale), max(int(tx / scale) + 1, int((tx + 1) / scale))
                blk = cls[y0:y1, x0:x1].ravel()
                if (blk > 0).sum() < blk.size * 0.45:
                    continue
                counts = np.bincount(blk[blk > 0], minlength=6)
                # outlines are thin: keep them when they are a good share of the block
                c = 1 if counts[1] >= blk.size * 0.3 else int(np.argmax(counts))
                sel = cls[y0:y1, x0:x1] == c
                l = lum[y0:y1, x0:x1][sel].mean()
                cell[ty, tx] = (c, int(l), 0, 255)
        # shade: each part's brightness relative to its own mean (128 = mean)
        for c in range(2, 6):
            sel = cell[..., 0] == c
            if sel.any():
                m = cell[..., 1][sel].astype(float).mean()
                cell[..., 1][sel] = np.clip(128 + (cell[..., 1][sel].astype(float) - m) * 1.6, 0, 255).astype(np.uint8)
        ox = k * CW + (CW - tw) // 2
        oy = FOOT_Y - th
        out[oy:oy + th, ox:ox + tw] = cell
    rows = [out]
    build_female(rows)
    sheet = np.concatenate(rows, axis=0)  # row 0 male idle, 1 female idle, 2-5 female walk 1-4
    os.makedirs(os.path.join(ROOT, 'assets', 'chars'), exist_ok=True)
    path = os.path.join(ROOT, 'assets', 'chars', 'body.png')
    Image.fromarray(sheet, 'RGBA').save(path)
    lying = build_lying()
    Image.fromarray(lying, 'RGBA').save(os.path.join(ROOT, 'assets', 'chars', 'lying.png'))
    print(path, sheet.shape, 'lying', lying.shape)
    # previews with flat colours, for checking by eye
    pal = {1: (26, 18, 32), 2: (224, 172, 126), 3: (200, 200, 200), 4: (60, 90, 160), 5: (70, 70, 74), 6: (120, 70, 30)}
    for name, img in (('body-preview.png', sheet), ('lying-preview.png', lying)):
        pv = np.zeros(img.shape[:2] + (3,), np.uint8) + 255
        for c, col in pal.items():
            sel = img[..., 0] == c
            f = (img[..., 1][sel].astype(float) / 128.0)[:, None]
            pv[sel] = np.clip(np.array(col)[None, :] * (0.75 + 0.25 * f), 0, 255).astype(np.uint8)
        Image.fromarray(pv).resize((pv.shape[1] * 5, pv.shape[0] * 5), Image.NEAREST).save(os.path.join(ROOT, 'tools', 'data', name))


main()
