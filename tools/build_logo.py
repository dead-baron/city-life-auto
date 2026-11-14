"""Build the title logo's assets from the owner's layered neon logo (2026-11-14).

Usage: python3 tools/build_logo.py <logo_dir> [--bg night1.png night2.png ...] [--root .]

<logo_dir> holds the owner's files: 01-skyline.png, 02-city-life.png, 03-swoosh.png, 04-auto.png (the lit layers,
1536 x 1024, stacked at 0,0 they make the lit logo), unlit.png (the sign switched off, same frame) and one-line.png (the
horizontal one-line wordmark). --bg: in-game night screenshots for the share card's background (darkened and blurred);
without them a navy night gradient.

Outputs
  assets/logo/unlit, sky, city, swoosh, auto   the title's logo: the sign off, then each lit layer cropped to its own
                                               content box, at the largest size drawn (620 CSS px wide at 2x: 1240 px
                                               for the whole logo) - WebP or PNG, whichever is smaller
  assets/logo/oneline                          the one-line wordmark for small places (the pause header: 340 CSS px
                                               at 2x)
  assets/og-card.png                           the social share card, 1200 x 630
and prints the layers' boxes for client/titlelogo.js LAYERS (as % of the logo's box).

The art is pixel art that isn't on a perfect grid (an art pixel is about 5.5 source pixels), so every layer is
shrunk once with Lanczos and then put back on a small palette (32 colours, no dither): the edges come out as hard
steps again, and the files a fraction of the size. Alpha under 16 (a faint haze round the source's matte) is dropped;
the page draws its own glow.
"""
import io
import json
import os
import sys
import numpy as np
from PIL import Image, ImageFilter

LOGO_W = 1240    # the logo's box at its largest: #logo is at most 620 CSS px wide (client/style.css), at 2x
ONE_W = 680      # the one-line wordmark: the pause header's at most 340 CSS px
COLORS = 32
LAYERS = [('sky', '01-skyline.png'), ('city', '02-city-life.png'), ('swoosh', '03-swoosh.png'), ('auto', '04-auto.png')]


def clean(im, th=16):
    a = np.array(im.convert('RGBA'))
    a[a[..., 3] < th] = 0
    a[..., 3] = np.where(a[..., 3] >= 240, 255, a[..., 3])   # (the source's "opaque" is 250-254)
    return Image.fromarray(a)


def smallest(im, path_no_ext):
    """Save im on a COLORS palette as .webp (lossless) or .png, whichever is smaller; remove the other."""
    q = im.quantize(COLORS, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    out = {}
    b = io.BytesIO(); q.save(b, 'PNG', optimize=True); out['.png'] = b.getvalue()
    b = io.BytesIO(); q.convert('RGBA').save(b, 'WEBP', lossless=True, quality=100, method=6); out['.webp'] = b.getvalue()
    ext = min(out, key=lambda k: len(out[k]))
    for k in out:
        p = path_no_ext + k
        if k == ext:
            with open(p, 'wb') as f:
                f.write(out[k])
        elif os.path.exists(p):
            os.remove(p)
    return os.path.basename(path_no_ext) + ext, len(out[ext]), q.size


def og_card(lit, box, bgs, path):
    W, H = 1200, 630
    if bgs:
        # the night city: the shots side by side, cut to the card's height, blurred, darkened and pulled to navy
        strip = []
        for p in bgs:
            im = Image.open(p).convert('RGB')
            im = im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
            strip.append(im)
        total = sum(i.width for i in strip)
        row = Image.new('RGB', (max(W, total), H))
        x = 0
        for i in strip:
            row.paste(i, (x, 0)); x += i.width
        bg = row.crop(((row.width - W) // 2, 0, (row.width - W) // 2 + W, H)).filter(ImageFilter.GaussianBlur(6))
        a = np.asarray(bg).astype(np.float32) / 255
        navy = np.array([0.04, 0.06, 0.14], np.float32)
        a = a * 0.62 + navy * 0.5
    else:
        y = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
        top, bot = np.array([0.03, 0.04, 0.10]), np.array([0.10, 0.10, 0.24])
        a = np.broadcast_to(top + (bot - top) * y, (H, W, 3)).copy()
    # a vignette, so the logo's middle is the brightest place
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((xx - W / 2) / (W * 0.62)) ** 2 + ((yy - H * 0.48) / (H * 0.7)) ** 2)
    a *= np.clip(1.15 - d * 0.75, 0.35, 1.1)[..., None]
    bg = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
    # the lit logo, 470 px tall, with each layer's neon glow under it (its own colour, blurred wide and close)
    s = 470 / (box[3] - box[1])
    lw, lh = round((box[2] - box[0]) * s), round((box[3] - box[1]) * s)
    ox, oy = (W - lw) // 2, (H - lh) // 2
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    GLOW = {'sky': (40, 160, 255), 'city': (255, 60, 80), 'swoosh': (255, 60, 80), 'auto': (255, 170, 30)}
    logo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for k, im in lit:
        im = im.crop((box[0], box[1], box[2], box[3])).resize((lw, lh), Image.LANCZOS)
        full = Image.new('RGBA', (W, H), (0, 0, 0, 0)); full.alpha_composite(im, (ox, oy))   # (blurred on the whole card: no edge to the glow)
        al = np.asarray(full)[..., 3]
        for r, k2 in ((28, 0.6), (9, 0.75)):
            m = np.asarray(Image.fromarray(al).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
            g = np.zeros((H, W, 4), np.uint8); g[..., :3] = GLOW[k]; g[..., 3] = np.clip(m * k2, 0, 255).astype(np.uint8)
            glow.alpha_composite(Image.fromarray(g))
        logo.alpha_composite(full)
    bg.alpha_composite(glow)
    bg.alpha_composite(logo)
    bg.convert('RGB').save(path, optimize=True)
    return os.path.getsize(path)


def main():
    args = sys.argv[1:]
    src = args[0]
    root = args[args.index('--root') + 1] if '--root' in args else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    bgs = []
    if '--bg' in args:
        for a in args[args.index('--bg') + 1:]:
            if a.startswith('--'):
                break
            bgs.append(a)
    out = os.path.join(root, 'assets', 'logo')
    os.makedirs(out, exist_ok=True)
    ims = [(k, clean(Image.open(os.path.join(src, f)))) for k, f in LAYERS]
    unlit = clean(Image.open(os.path.join(src, 'unlit.png')))
    # the logo's box: everything any of them draws
    bbs = [im.getbbox() for _, im in ims] + [unlit.getbbox()]
    box = (min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs))
    bw, bh = box[2] - box[0], box[3] - box[1]
    s = LOGO_W / bw
    table = []
    for k, im in [('unlit', unlit)] + ims:
        bb = im.getbbox()
        x0, y0, x1, y1 = (round((bb[0] - box[0]) * s), round((bb[1] - box[1]) * s), round((bb[2] - box[0]) * s), round((bb[3] - box[1]) * s))
        small = im.crop(bb).resize((x1 - x0, y1 - y0), Image.LANCZOS)
        name, size, dims = smallest(small, os.path.join(out, k))
        BW, BH = round(bw * s), round(bh * s)
        table.append({'k': k, 'f': name, 'x': round(x0 / BW * 100, 3), 'y': round(y0 / BH * 100, 3), 'w': round((x1 - x0) / BW * 100, 3), 'src': [bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]], 'px': list(dims), 'bytes': size})
    one = clean(Image.open(os.path.join(src, 'one-line.png')))
    one = one.crop(one.getbbox())
    one = one.resize((ONE_W, round(one.height * ONE_W / one.width)), Image.LANCZOS)
    oname, osize, odims = smallest(one, os.path.join(out, 'oneline'))
    og = og_card(ims, box, bgs, os.path.join(root, 'assets', 'og-card.png'))
    print(json.dumps({'box': list(box), 'aspect': [round(bw * s), round(bh * s)], 'layers': table, 'oneline': [oname, osize, list(odims)], 'og': og}, indent=1))


if __name__ == '__main__':
    main()
