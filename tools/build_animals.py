"""Pets and strays cut from the character concept sheets (white background).

Usage: python3 tools/build_animals.py <concept_dir> [repo_root=.]

Outputs
  assets/animals.png       the sprites, transparent: one column per animal, one row per frame
  shared/animal-art.js     generated: rect [x, y, w, h] and view per animal, plus its animation
                           frames (idle, walk x4, run x4, sit), each on a padded canvas of the
                           same size so the animal stays anchored while it animates
    view 'top'   - drawn from straight above, nose to the RIGHT (rotate it to face any way)
    view 'front' - a 3/4 view facing the camera (mirror it for left / right)
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..')

# (sheet, band y0..y1 in px, components in left-to-right order -> names (None = skip), view, rotate to face right)
BANDS = [
    ('ac05a82f-image.png', (850, 1020), ['dog_golden', 'dog_black', None, None, None, None], 'top', 90, 'from_right', 6),
    ('ac05a82f-image.png', (880, 1020), [None, None, 'dog_spaniel', 'dog_pup', None, None], 'front', 0, 'from_right', 6),
    ('52c77f7d-image.png', (885, 1015), ['dog_retriever', 'cat_black', 'cat_grey', None, None, 'cat_ginger'], 'front', 0, 'from_left', 6),
]
SCALE = 0.5   # sheet px -> art px (the game draws them at ~1 art px per world px)


def components(im, band, n, side):
    a = np.asarray(im.convert('RGB')).astype(int)[band[0]:band[1]]
    fg = (a.min(-1) < 235) | ((a.max(-1) - a.min(-1)) > 25)
    fg = ndimage.binary_closing(fg, np.ones((5, 5)))
    lab, k = ndimage.label(fg)
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if h * w < 600:
            continue
        boxes.append((sl[1].start, sl[0].start + band[0], sl[1].stop, sl[0].stop + band[0], i + 1))
    boxes.sort(key=lambda b: b[0])
    if side == 'from_right':
        boxes = boxes[-n:]
    else:
        boxes = boxes[:n]
    return boxes, lab


def cut(im, box, band, lab):
    x0, y0, x1, y1, li = box
    rgb = im.convert('RGB').crop((x0, y0, x1, y1))
    mask = (lab[y0 - band[0]:y1 - band[0], x0:x1] == li)
    mask = ndimage.binary_dilation(mask, iterations=1)
    out = rgb.convert('RGBA')
    out.putalpha(Image.fromarray((mask * 255).astype(np.uint8)))
    return out


# ----------------------------------------------------------------------------- animation
# The concept sheet has one pose per animal, so the walk / run / sit frames are placeholders made
# from it: from above (dogs, nose right) paws peek out from under the body and swing in a walk
# (diagonal pairs) or a gallop (front pair, then back pair), the body stretching as it runs; it
# sits by tucking its back half in. The 3/4 front views are drawn sitting, so that pose is the
# sit frame; standing lifts the body onto longer legs, and walking / running step the left and
# right legs in turn, with a bob and (running) a forward lean.
PAD = 4
FRAMES = ['idle', 'walk0', 'walk1', 'walk2', 'walk3', 'run0', 'run1', 'run2', 'run3', 'sit']


def paw_colour(a):
    px = a[a[..., 3] > 200][:, :3].astype(float)
    lum = px.mean(1)
    dark = px[lum <= np.percentile(lum, 35)]
    c = np.median(dark, 0) * 0.85
    return tuple(int(v) for v in c) + (255,)


def resize_cols(a, x0, x1, k):
    """Squeeze columns x0..x1 of an RGBA array by k (nearest), returning the new array."""
    seg = Image.fromarray(a[:, x0:x1])
    nw = max(1, round((x1 - x0) * k))
    seg = np.asarray(seg.resize((nw, a.shape[0]), Image.NEAREST))
    return np.concatenate([a[:, :x0], seg, a[:, x1:]], 1)


def top_frames(sp):
    a0 = np.asarray(sp.convert('RGBA'))
    h, w = a0.shape[:2]
    W, H = w + PAD * 4, h + PAD * 2
    pc = paw_colour(a0)
    r = max(2, round(h * 0.11))
    cols = a0[..., 3] > 128

    def body_edge(x):
        ys = np.where(cols[:, min(w - 1, max(0, int(x)))])[0]
        return (ys.min(), ys.max()) if len(ys) else (h * 0.2, h * 0.8)

    def frame(paws, stretch=1.0, tuck=None):
        a = a0
        if tuck:  # rear half tucked under: sitting, seen from above
            a = resize_cols(a, 0, int(w * 0.45), tuck)
        if stretch != 1.0:
            a = np.asarray(Image.fromarray(a).resize((max(1, round(a.shape[1] * stretch)), h), Image.NEAREST))
        bw = a.shape[1]
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(canvas)
        ox, oy = (W - bw) // 2, PAD
        for fx, side, dx in paws:  # side -1 = top edge (left flank), 1 = bottom edge
            y0, y1 = body_edge(fx * w)
            cx = ox + fx * bw + dx
            cy = oy + (y0 - r * 0.1 if side < 0 else y1 + r * 0.1)
            d.ellipse([cx - r, cy - r * 0.8, cx + r, cy + r * 0.8], fill=pc)
        canvas.alpha_composite(Image.fromarray(a), (ox, oy))
        return canvas

    s_w, s_r = w * 0.07, w * 0.12
    out = {'idle': frame([(0.70, -1, 0), (0.70, 1, 0), (0.25, -1, 0), (0.25, 1, 0)])}
    for i in range(4):
        t = np.sin(i * np.pi / 2)  # 0, 1, 0, -1
        # walk: diagonal pairs swing together
        out[f'walk{i}'] = frame([(0.70, -1, s_w * t), (0.70, 1, -s_w * t), (0.25, -1, -s_w * t), (0.25, 1, s_w * t)])
        # gallop: front pair reaches out while the back pair pushes off, then they gather in
        out[f'run{i}'] = frame([(0.72, -1, s_r * t + 1), (0.72, 1, s_r * t - 1), (0.24, -1, -s_r * t), (0.24, 1, -s_r * t + 1)],
                               stretch=1.0 + 0.06 * t)
    out['sit'] = frame([(0.80, -1, 0), (0.80, 1, 0)], tuck=0.55)
    return out


def front_frames(sp):
    a0 = np.asarray(sp.convert('RGBA'))
    h, w = a0.shape[:2]
    leg = int(h * 0.26)           # the bottom band: paws and legs
    lift = max(2, round(h * 0.12))  # standing up from the sit
    W, H = w + PAD * 2, h + lift + PAD * 2 + 3

    def stand(step=0.0, lean=0, bob=0):
        body, legs = a0[:h - leg], a0[h - leg:]
        # longer legs: stretch the leg band
        legs_im = Image.fromarray(legs).resize((w, leg + lift + bob), Image.NEAREST)
        L = np.asarray(legs_im).copy()
        if step:
            # step: left legs lifted while right legs plant, and back
            half = w // 2
            k = int(round(abs(step)))
            if k:
                side = slice(0, half) if step > 0 else slice(half, w)
                L[:, side] = np.concatenate([L[k:, side], np.zeros((k, L[:, side].shape[1], 4), np.uint8)], 0)
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        base = H - PAD - (leg + lift)
        canvas.alpha_composite(Image.fromarray(L), (PAD, base - bob))
        canvas.alpha_composite(Image.fromarray(body), (PAD + lean, base - body.shape[0] - bob))
        return canvas

    out = {'idle': stand()}
    for i in range(4):
        t = np.sin(i * np.pi / 2)
        out[f'walk{i}'] = stand(step=2 * t, bob=int(abs(t)))
        out[f'run{i}'] = stand(step=3.4 * t, lean=1, bob=1 + int(abs(t)))
    sit = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    sit.alpha_composite(Image.fromarray(a0), (PAD, H - PAD - h))
    out['sit'] = sit
    return out


def main():
    sprites = {}
    for sheet, band, names, view, rot, side, n in BANDS:
        im = Image.open(os.path.join(SRC, sheet))
        boxes, lab = components(im, band, n, side)
        if side == 'from_right':
            names = names[-len(boxes):] if len(boxes) < len(names) else names
            boxes = boxes[-len(names):]
        for name, box in zip(names, boxes):
            if not name:
                continue
            sp = cut(im, box, band, lab)
            if rot:
                sp = sp.rotate(-rot, expand=True)  # nose up -> nose right
            sp = sp.resize((max(1, round(sp.width * SCALE)), max(1, round(sp.height * SCALE))), Image.LANCZOS)
            sprites[name] = (sp, view)
    anims = {name: (top_frames(sp) if view == 'top' else front_frames(sp), view) for name, (sp, view) in sprites.items()}
    cw = {name: fr['idle'].width for name, (fr, _) in anims.items()}
    rh = max(fr['idle'].height for fr, _ in anims.values())
    W = sum(v + 2 for v in cw.values())
    sheet = Image.new('RGBA', (W, rh * len(FRAMES) + 2 * len(FRAMES)), (0, 0, 0, 0))
    rects, x = {}, 0
    for name, (fr, view) in anims.items():
        f = {}
        for j, k in enumerate(FRAMES):
            im = fr[k]
            y = j * (rh + 2)
            sheet.paste(im, (x, y), im)
            f[k] = [x, y, im.width, im.height]
        rects[name] = {'r': f['idle'], 'view': view, 'pad': PAD,
                       'f': {'idle': f['idle'], 'walk': [f[f'walk{i}'] for i in range(4)], 'run': [f[f'run{i}'] for i in range(4)], 'sit': f['sit']}}
        x += cw[name] + 2
    sheet.save(os.path.join(ROOT, 'assets', 'animals.png'), optimize=True)
    js = ('// Generated by tools/build_animals.py - do not edit.\n'
          '// Pet / stray sprites in assets/animals.png: r = [x, y, w, h] (the idle frame); view top = from above,\n'
          '// nose right; front = 3/4, facing the camera. f = animation frames (idle, walk[4], run[4], sit), all on\n'
          '// the same padded canvas: top views are centred on the animal, front views stand on the canvas bottom\n'
          '// less pad.\n'
          f'export const ANIMAL_ART = {json.dumps(rects)};\n')
    with open(os.path.join(ROOT, 'shared', 'animal-art.js'), 'w') as f:
        f.write(js)
    print('animals', list(rects))


if __name__ == '__main__':
    main()
