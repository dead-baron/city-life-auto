"""The title logo from clean vector sources (2026-11-14; the owner on the traced variants: "the linework is really
sloppy ... the city building pixel art looks really choppy and unclean"). Same design as his concept - a script
"City Life" (cream, a red rim), a swoosh under it, a bold "Auto" (a dark face, a gold rim, a cream inline), a skyline
over it - but nothing traced: the words set in open-licensed fonts (SIL OFL; record each in docs/CREDITS.md when one is
picked), the swoosh a bezier, the skyline rectangles on a grid.

Usage:
  python3 tools/font_logo.py --script S.ttf --display D.ttf --finish P|S [--name TAG] [--out DIR] [--preview]
                             [--install] [--root .]
  python3 tools/font_logo.py --sheet TAG=S.ttf,D.ttf [TAG=...] --out DIR   the current logo and each pairing, P and S

Finishes:
  P  pixel: everything drawn at the game's art scale with hard edges (fonts with anti-aliasing off, polygons unsmoothed,
     every rim an even number of art px), made bigger by a whole number, nearest-neighbour; then the neon glow
  S  smooth: drawn 4x and brought down (crisp anti-aliased edges), the same rims in proportion, the same glow

Outputs (--out, default .; --install: assets/logo/ under --root, as tools/build_logo.py names them, and the table for
client/titlelogo.js LAYERS printed):
  <tag>-<finish>-sky / -city / -swoosh / -auto .png   each lit layer with its glow, cropped to its own box
  <tag>-<finish>-unlit.png                             the sign switched off (dark glass, no glow)
  <tag>-<finish>-phone.png                             (--preview) the lit sign on the title's night, a phone upright
  <tag>-<finish>-desktop.png                           (--preview) a desktop mock of the whole title screen round it
Fonts: TTF, OTF or WOFF (FreeType reads them); only the font files are read.
"""
import json
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from neon_logo import night, current_logo, font as ui_font, save_smallest, blur  # noqa: E402

# the game's neon colours (client/art2/neonsigns.js NEON_COLS, signfont.js TRADES) and the concept's
CREAM, RED1, RED2 = (255, 238, 206), (255, 84, 96), (214, 30, 62)
GOLD1, GOLD2, FILL = (255, 190, 60), (232, 138, 22), (44, 24, 10)
CYAN, WINDOW, TOWER, TOWER2 = (70, 230, 255), (255, 214, 120), (14, 22, 49), (24, 34, 70)
GLOW = {'sky': CYAN, 'city': RED1, 'swoosh': RED1, 'auto': GOLD1}
ORDER = ['sky', 'city', 'swoosh', 'auto']

# the logo's layout in art px (the game's art scale: the logo ~240 art px wide, the page's 620 CSS px at ~2.6 px each)
W, H = 248, 168
SKY_BOX = (74, 4, 174, 46)       # the skyline: x0, y0, x1, y1 (its foot just over the script's caps)
CITY_BOX = (6, 36, 242, 104)     # "City Life" fitted in here (its width, then centred)
SWOOSH = ((40, 112), (124, 96), (214, 108))   # the swoosh: a quadratic bezier, its ends and control
AUTO_BOX = (46, 116, 202, 164)   # "Auto" fitted in here


def fit_font(path, text, box, k, stroke):
    """the font size (at k px an art px) that sets text as large as fits the box, its rim included"""
    bw, bh = (box[2] - box[0]) * k, (box[3] - box[1]) * k
    lo, hi = 4, 2000
    while hi - lo > 1:
        mid = (lo + hi) // 2
        f = ImageFont.truetype(path, mid)
        b = f.getbbox(text, stroke_width=stroke)
        if b[2] - b[0] <= bw and b[3] - b[1] <= bh:
            lo = mid
        else:
            hi = mid
    return ImageFont.truetype(path, lo)


def text_mask(path, text, box, k, rim, aa):
    """the word's glyphs as a mask on a canvas W*k x H*k, centred in box, room left round it for a rim of `rim` px"""
    f = fit_font(path, text, box, k, rim)
    m = Image.new('L', (W * k, H * k), 0)
    d = ImageDraw.Draw(m)
    d.fontmode = 'L' if aa else '1'
    b = f.getbbox(text, stroke_width=rim)
    x = (box[0] + box[2]) / 2 * k - (b[0] + b[2]) / 2
    y = (box[1] + box[3]) / 2 * k - (b[1] + b[3]) / 2
    d.text((round(x), round(y)), text, font=f, fill=255)
    return m


def grow(m, r):   # a mask grown by r px (a round pen: r steps of a 3 x 3 max, alternating with a cross)
    for i in range(r):
        if i % 2 == 0:
            m = m.filter(ImageFilter.MaxFilter(3))
        else:
            a = np.asarray(m)
            P = np.pad(a, 1)
            a = np.maximum.reduce([a, P[:-2, 1:-1], P[2:, 1:-1], P[1:-1, :-2], P[1:-1, 2:]])
            m = Image.fromarray(a)
    return m


def shrink(m, r):
    inv = Image.fromarray(255 - np.asarray(m))
    return Image.fromarray(255 - np.asarray(grow(inv, r)))


def swoosh_mask(k, aa):
    """the swoosh: a band along the bezier, thickest in its middle, tapering to points"""
    (ax, ay), (cx, cy), (bx, by) = SWOOSH
    s = 4 if aa else 1
    m = Image.new('L', (W * k * s, H * k * s), 0)
    top, bot = [], []
    N = 64
    for i in range(N + 1):
        t = i / N
        x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx
        y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by
        dx = 2 * (1 - t) * (cx - ax) + 2 * t * (bx - cx)
        dy = 2 * (1 - t) * (cy - ay) + 2 * t * (by - cy)
        ln = (dx * dx + dy * dy) ** 0.5 or 1
        nx, ny = -dy / ln, dx / ln
        w = 3.4 * (4 * t * (1 - t)) ** 0.7
        top.append(((x + nx * w) * k * s, (y + ny * w) * k * s))
        bot.append(((x - nx * w) * k * s, (y - ny * w) * k * s))
    ImageDraw.Draw(m).polygon(top + bot[::-1], fill=255)
    return m.resize((W * k, H * k), Image.LANCZOS) if aa else m


def skyline(k):
    """the skyline on a grid: a tall middle tower stepping up to a spire, two towers either side (a gable, a flat top,
    a stepped one), dark faces with lit windows 2 x 2 art px on a 4 px grid, a tube round the silhouette (open along
    its foot). Returns (fill, tube, windows) masks at k px an art px - crisp at any k (only rectangles and 45-degree
    steps)"""
    x0, y0, x1, y1 = SKY_BOX
    cx, foot = (x0 + x1) // 2, y1
    fill = np.zeros((H, W), bool)
    win = np.zeros((H, W), bool)

    def tower(xa, xb, top, roof=None, lit=0.5, seed=1):
        fill[top:foot, xa:xb] = True
        if roof == 'gable':
            for i in range((xb - xa) // 2):
                fill[top - i - 1, xa + i + 1:xb - i - 1] = True
        if roof == 'step':
            fill[top - 4:top, xa + 3:xb - 3] = True
        r = (seed * 7919) % 101
        for wy in range(top + 4, foot - 3, 5):
            for wx in range(xa + 3, xb - 4, 5):
                r = (r * 37 + 11) % 101
                if r < lit * 101:
                    win[wy:wy + 2, wx:wx + 2] = True
    tower(x0 + 2, x0 + 20, foot - 18, 'gable', 0.5, 2)
    tower(x0 + 18, x0 + 38, foot - 26, None, 0.55, 3)
    tower(cx - 9, cx + 10, foot - 34, 'step', 0.6, 5)
    fill[foot - 46:foot - 38, cx:cx + 1] = True   # the spire
    tower(x1 - 38, x1 - 18, foot - 24, 'gable', 0.5, 7)
    tower(x1 - 20, x1 - 2, foot - 14, None, 0.5, 11)
    # the tube: the silhouette's edge, not along the foot
    P = np.pad(fill, 1)
    inner = P[:-2, 1:-1] & P[1:-1, :-2] & P[1:-1, 2:] & (P[2:, 1:-1] | (np.arange(H)[:, None] >= foot - 1))
    tube = fill & ~inner
    win &= ~np.pad(tube, 1)[1:-1, 1:-1]
    up = lambda a: Image.fromarray((a * 255).astype(np.uint8)).resize((W * k, H * k), Image.NEAREST)
    return up(fill), up(tube), up(win)


def layers(script, display, finish, k):
    """the four lit layers (RGBA, W*k x H*k) and their switched-off look"""
    aa = finish == 'S'
    rim = lambda art: max(1, round(art * k)) if aa else art * k   # (P: whole art px)
    L = {}
    # "City Life": cream glyphs, a red rim (RED1) and a darker red outside it (RED2)
    g = text_mask(script, 'City Life', CITY_BOX, k, rim(4), aa)
    r1, r2 = grow(g, rim(2)), grow(g, rim(4))
    L['city'] = [(r2, RED2), (r1, RED1), (g, CREAM)]
    # the swoosh, the same colours
    sw = swoosh_mask(k, aa)
    L['swoosh'] = [(grow(sw, rim(2)), RED2), (grow(sw, rim(1)), RED1), (sw, CREAM)]
    # "Auto": a gold rim, a cream inline, the dark face
    a = text_mask(display, 'Auto', AUTO_BOX, k, rim(4), aa)
    L['auto'] = [(grow(a, rim(3)), GOLD2), (grow(a, rim(2)), GOLD1), (a, CREAM), (shrink(a, rim(2)), FILL)]
    fill, tube, win = skyline(k)
    tube = grow(tube, max(0, k // 3)) if aa else tube
    L['sky'] = [(fill, TOWER), (tube, CYAN), (win, WINDOW)]
    return L


def paint(parts, lit=True):
    """the parts (mask, colour) painted in turn onto a clear layer; switched off, the lit colours go to dark glass"""
    w, h = parts[0][0].size
    out = np.zeros((h, w, 4), np.float32)
    for m, c in parts:
        a = np.asarray(m, np.float32)[..., None] / 255
        col = np.array(c if lit or c in (TOWER, FILL) else tuple(round(26 + (q - 26) * 0.28) for q in c), np.float32) / 255
        out[..., :3] = out[..., :3] * (1 - a) + col * a
        out[..., 3:] = out[..., 3:] * (1 - a) + a
    return out


EMIT = {CREAM: 0.95, RED1: 0.8, RED2: 0.5, GOLD1: 0.8, GOLD2: 0.6, CYAN: 0.85, WINDOW: 0.7}
GLOWS = ((1.1, 0.85), (4.5, 0.6), (13.0, 0.28))   # (art px, strength): the night's bloom (as tools/neon_logo.py)


def glow(parts, col, k, pad):
    """the layer's soft glow: its lit parts' light blurred (half and quarter size, and the wall's halo), in its colour"""
    w, h = parts[0][0].size
    e = np.zeros((h + 2 * pad, w + 2 * pad), np.float32)
    for m, c in parts:
        if c in EMIT:
            a = np.asarray(m, np.float32) / 255
            e[pad:pad + h, pad:pad + w] = np.maximum(e[pad:pad + h, pad:pad + w], a * EMIT[c])
    g = np.zeros_like(e)
    for s, kk in GLOWS:
        g += blur(e, s * k) * kk
    out = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.float32)
    out[..., :3] = np.array(col, np.float32) / 255
    out[..., 3] = np.clip(g, 0, 1)
    return out


def over(dst, src):
    a = src[..., 3:]
    dst[..., :3] = dst[..., :3] * (1 - a) + src[..., :3] * a
    dst[..., 3:] = dst[..., 3:] * (1 - a) + a
    return dst


def build(script, display, finish, k):
    """the sign at k px an art px: {layer: lit RGBA with its glow}, the whole sign lit, and the sign switched off - all
    on one canvas with room for the glow (pad px each side)"""
    L = layers(script, display, finish, k)
    pad = int(GLOWS[-1][0] * k * 2)
    lit, whole = {}, np.zeros((H * k + 2 * pad, W * k + 2 * pad, 4), np.float32)
    off = np.zeros_like(whole)
    for name in ORDER:
        g = glow(L[name], GLOW[name], k, pad)
        body = np.zeros_like(g)
        body[pad:-pad, pad:-pad] = paint(L[name])
        lit[name] = over(g.copy(), body)
        whole = over(over(whole, g), body)   # (the glows first would be truer to light; the tubes over is what shows)
        ob = np.zeros_like(g)
        ob[pad:-pad, pad:-pad] = paint(L[name], lit=False)
        off = over(off, ob)
    return lit, whole, off, pad


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8), 'RGBA')


def logo_image(script, display, finish, width):
    """the lit sign about `width` px wide (its art box): P at the nearest whole scale, S drawn at that size"""
    k = max(1, round(width / W))
    _, whole, _, pad = build(script, display, finish, k)
    return to_img(whole), pad, k


# ---- the title screen round it (a desktop mock: the logo, the buttons, the graphics row, the card) ------------------
GOLD, NAVY, NAVY3, EDGE, INK, CREAMUI, DIM = (226, 189, 87), (15, 24, 48), (34, 50, 94), (58, 74, 120), (7, 11, 22), (243, 234, 210), (166, 174, 196)


def button(d, box, label, f, primary=False):
    x0, y0, x1, y1 = box
    d.rounded_rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), radius=8, fill=INK)
    d.rounded_rectangle(box, radius=7, fill=GOLD if primary else (19, 30, 60), outline=GOLD, width=2)
    tw = d.textlength(label, font=f)
    d.text(((x0 + x1 - tw) / 2, (y0 + y1) / 2 - f.size * 0.55), label, font=f, fill=INK if primary else CREAMUI)


def desktop_mock(logo, pad, root):
    """1920 x 1080: the logo top centre (its height 40% of the screen at most), a clear gap, then RESUME / PLAY,
    CHARACTER / SETTINGS, the graphics row, the card bottom left, who's online bottom right"""
    Wd, Hd = 1920, 1080
    bg = night(Wd, Hd, 1)
    lw, lh = logo.width - 2 * pad, logo.height - 2 * pad
    s = min(560 / lw, Hd * 0.40 / lh)
    im = logo.resize((round(logo.width * s), round(logo.height * s)), Image.LANCZOS)
    p = round(pad * s)
    top = 70
    bg.alpha_composite(im, ((Wd - im.width) // 2, top - p))
    y = top + round(lh * s) + 56
    d = ImageDraw.Draw(bg)
    fb = ImageFont.truetype(os.path.join(root, 'assets', 'fonts', 'CLAPixel-Bold.woff'), 30)
    fs = ImageFont.truetype(os.path.join(root, 'assets', 'fonts', 'BarlowCondensed-Bold.woff'), 24)
    bw, bh, gap = 300, 64, 20
    x0 = Wd // 2 - bw - gap // 2
    button(d, (x0, y, x0 + bw, y + bh), 'RESUME', fb)
    button(d, (x0 + bw + gap, y, x0 + 2 * bw + gap, y + bh), 'PLAY', fb, True)
    y += bh + gap
    button(d, (x0, y, x0 + bw, y + bh - 8), 'CHARACTER', fb)
    button(d, (x0 + bw + gap, y, x0 + 2 * bw + gap, y + bh - 8), 'SETTINGS', fb)
    y += bh - 8 + gap + 6
    t = 'Graphics: High   ·   change'
    d.text(((Wd - d.textlength(t, font=fs)) / 2, y), t, font=fs, fill=DIM)
    # the card, bottom left: the avatar frame and the name
    cx, cy = 40, Hd - 40 - 84
    d.rounded_rectangle((cx, cy, cx + 330, cy + 84), radius=8, fill=(15, 24, 48), outline=GOLD, width=2)
    d.rounded_rectangle((cx + 12, cy + 14, cx + 68, cy + 70), radius=6, fill=NAVY3, outline=EDGE, width=2)
    d.text((cx + 84, cy + 16), 'Your Name', font=fs, fill=CREAMUI)
    d.text((cx + 84, cy + 46), '$1,240  ·  Lv 4', font=ImageFont.truetype(os.path.join(root, 'assets', 'fonts', 'BarlowCondensed-Medium.woff'), 20), fill=DIM)
    t = '12 online'
    tx = Wd - 40 - d.textlength(t, font=fs)
    d.ellipse((tx - 20, Hd - 58, tx - 8, Hd - 46), fill=(108, 208, 108))
    d.text((tx, Hd - 40 - 30), t, font=fs, fill=(108, 208, 108))
    return bg


def phone(logo, pad):
    """1170 x 2532 (390 x 844 at 3x): the logo 84vw wide, a third of the way down"""
    bg = night(1170, 2532, 3)
    lw = logo.width - 2 * pad
    s = 983 / lw
    im = logo.resize((round(logo.width * s), round(logo.height * s)), Image.NEAREST if abs(s - round(s)) < 0.05 else Image.LANCZOS)
    p = round(pad * s)
    bg.alpha_composite(im, ((1170 - im.width) // 2, 420 - p))
    return bg


def write_layers(script, display, finish, out, tag, install, scale=None):
    k = scale or (5 if finish == 'P' else 5)
    lit, whole, off, pad = build(script, display, finish, k)
    full = to_img(whole)
    bb = full.getchannel('A').point(lambda q: 255 if q >= 4 else 0).getbbox()
    BW, BH = bb[2] - bb[0], bb[3] - bb[1]
    name = (lambda n: os.path.join(out, n)) if install else (lambda n: os.path.join(out, f'{tag}-{finish}-{n}'))
    table = []
    unlit = to_img(off).crop(bb)
    if install:
        un = save_smallest(unlit, name('unlit'))
    else:
        unlit.save(name('unlit') + '.png', optimize=True)
        un = (os.path.basename(name('unlit')) + '.png', os.path.getsize(name('unlit') + '.png'))
    for n in ORDER:
        im = to_img(lit[n]).crop(bb)
        b = im.getchannel('A').point(lambda q: 255 if q >= 4 else 0).getbbox()
        im = im.crop(b)
        if install:
            f, size = save_smallest(im, name(n))
        else:
            im.save(name(n) + '.png', optimize=True)
            f, size = os.path.basename(name(n)) + '.png', os.path.getsize(name(n) + '.png')
        table.append({'k': n, 'f': f, 'x': round(b[0] / BW * 100, 3), 'y': round(b[1] / BH * 100, 3), 'w': round((b[2] - b[0]) / BW * 100, 3), 'px': [b[2] - b[0], b[3] - b[1]], 'c': '#%02x%02x%02x' % GLOW[n], 'bytes': size})
    return {'box': [BW, BH], 'unlit': list(un), 'layers': table}


def sheet(pairs, root, out):
    """the current logo, then each pairing P and S, on the title's night; under each a close-up (the C and the A)"""
    PW, PH, LW, CH = 620, 520, 540, 300
    cols = [('Current (AI image)', None, None, None)] + [(f'{t}  {fin}', s, d, fin) for t, s, d in pairs for fin in 'PS']
    sh = Image.new('RGB', (PW * len(cols), PH + CH), (10, 12, 20))
    dr = ImageDraw.Draw(sh)
    f = ui_font(24)
    for i, (label, s, d, fin) in enumerate(cols):
        bg = night(PW, PH, 1)
        if s is None:
            logo, pad = current_logo(root, LW)
            big, bpad = current_logo(root, 1240)
        else:
            logo, pad, _ = logo_image(s, d, fin, LW)
            big, bpad, _ = logo_image(s, d, fin, 1240)
            logo = logo.resize((round(logo.width * LW / (logo.width - 2 * pad)), round(logo.height * LW / (logo.width - 2 * pad))), Image.LANCZOS)
            pad = round(pad * LW / (logo.width - 2 * pad)) if False else round((logo.width - LW) / 2)
        bg.alpha_composite(logo, ((PW - logo.width) // 2, round(PH * 0.45 - logo.height / 2)))
        bw, bh = big.width - 2 * bpad, big.height - 2 * bpad
        close = big.crop((bpad + round(bw * 0.02), bpad + round(bh * 0.18), bpad + round(bw * 0.4), bpad + round(bh * 0.62)))
        cb = Image.new('RGBA', (PW, CH), NAVY + (255,))
        kk = min((PW - 20) / close.width, (CH - 20) / close.height)
        cl = close.resize((round(close.width * kk), round(close.height * kk)), Image.NEAREST)
        cb.alpha_composite(cl, ((PW - cl.width) // 2, (CH - cl.height) // 2))
        sh.paste(bg.convert('RGB'), (i * PW, 0))
        sh.paste(cb.convert('RGB'), (i * PW, PH))
        dr.text((i * PW + 16, 12), label, fill=CREAMUI, font=f)
        dr.line((i * PW, 0, i * PW, PH + CH), fill=(10, 12, 20), width=4)
    p = os.path.join(out, 'contact-sheet.png')
    sh.save(p, optimize=True)
    return p


def main():
    args = sys.argv[1:]
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    root = opt('--root', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    out = opt('--out', '.')
    os.makedirs(out, exist_ok=True)
    if '--sheet' in args:
        pairs = []
        for a in args[args.index('--sheet') + 1:]:
            if a.startswith('--'):
                break
            t, fs = a.split('=', 1)
            s, d = fs.split(',')
            pairs.append((t, s, d))
        print(sheet(pairs, root, out))
        return
    script, display, fin, tag = opt('--script'), opt('--display'), opt('--finish', 'P').upper(), opt('--name', 'logo')
    if '--install' in args:
        out = os.path.join(root, 'assets', 'logo')
    res = write_layers(script, display, fin, out, tag, '--install' in args)
    if '--preview' in args:
        logo, pad, _ = logo_image(script, display, fin, 983)
        phone(logo, pad).convert('RGB').save(os.path.join(out, f'{tag}-{fin}-phone.png'), optimize=True)
        desktop_mock(logo, pad, root).convert('RGB').save(os.path.join(out, f'{tag}-{fin}-desktop.png'), optimize=True)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
