"""Cut the character body template from the concept sheet "PLAYER CHARACTER (8 DIRECTION)".

Usage: python3 tools/build_chars.py [concept_dir] [repo_root=.]

The sheet shows the same plain figure (grey tee, blue jeans, dark shoes, bald head) from the
eight directions S, SW, W, NW, N, NE, E, SE, painted as pixel art at about 8x. Each figure is
cut out, scaled back down to its native pixel size (38 px tall, the height of a character in the
game's 32x44 art grid) by majority vote over each block, and every pixel is labelled by what it
is - outline, skin, shirt, trousers, shoes - with its shade within that part. The client
(client/render/chars.js) recolours the parts per outfit, adds hair, faces, hats and holds, and
animates legs and arms.

Output: assets/chars/body.png, 8 cells of 32x44 side by side (S, SW, W, NW, N, NE, E, SE).
  R = part (0 none, 1 outline, 2 skin, 3 shirt, 4 trousers, 5 shoes)
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
    os.makedirs(os.path.join(ROOT, 'assets', 'chars'), exist_ok=True)
    path = os.path.join(ROOT, 'assets', 'chars', 'body.png')
    Image.fromarray(out, 'RGBA').save(path)
    print(path, out.shape)
    # a preview with flat colours, for checking by eye
    pal = {1: (26, 18, 32), 2: (224, 172, 126), 3: (200, 200, 200), 4: (60, 90, 160), 5: (70, 70, 74)}
    pv = np.zeros((CH, CW * 8, 3), np.uint8) + 255
    for c, col in pal.items():
        sel = out[..., 0] == c
        f = (out[..., 1][sel].astype(float) / 128.0)[:, None]
        pv[sel] = np.clip(np.array(col)[None, :] * (0.75 + 0.25 * f), 0, 255).astype(np.uint8)
    Image.fromarray(pv).resize((CW * 8 * 6, CH * 6), Image.NEAREST).save(os.path.join(ROOT, 'tools', 'data', 'body-preview.png'))


main()
