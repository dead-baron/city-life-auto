"""The title logo rebuilt in the game's own neon (2026-11-14; the owner: "recreate these in-engine ... something that uses
the games own graphics system"). Same design as the owner's logo - the script "City Life", the swoosh under it, a bold
"Auto", a skyline over it - but drawn the way the game draws its neon signs at night (client/art2/neonsigns.js `tube`,
signfont.js `paintBoard` lit 'neon', the Pink Mile's picture signs): on a clean art-pixel grid, in the game's neon
colours, each tube a white-hot core (signfont.js hotOf) inside its colour, and a soft glow round it (the night's bloom:
light.js, the bright parts blurred at half and quarter size and added back). No black outline.

Usage:
  python3 tools/neon_logo.py <logo_dir> --variant A|B|C|D|D2 [--out DIR] [--scale N] [--preview] [--install] [--no-glow]
                             [--root .]
  python3 tools/neon_logo.py <logo_dir> --sheet [D,D2] [--name F.png] --out DIR   variants (A-C by default) and the
                                                                 current logo side by side

<logo_dir>: the owner's layers (01-skyline.png, 02-city-life.png, 03-swoosh.png, 04-auto.png: 1536 x 1024, stacked at
0,0). Only their shapes are used: each layer's lit body (everything but the black outline) is smoothed, snapped to the
art grid (CELL source px an art px) and cleaned of one-pixel nicks; the script's tubes run along its centre line (a
thinning, spurs pruned).

The variants:
  A  thin tubes: "City Life" and the swoosh one tube along each stroke, "Auto" one tube round each letter, the
     skyline's roofline a thin tube with its lit windows
  B  filled letters with a neon rim: each letter lit through (the hot white of a tube) inside a tube of its colour,
     "Auto" a dark channel letter with a tube round it and one inside that; the skyline over its dark towers
  C  bolder tubes (shaded across, the core hot) and a richer skyline built like the title's own (titlescreen.js
     skyline: towers, antennas, lit windows) - the front row's roofline in cyan, a row behind in violet

Outputs (in --out, default the current dir; --install: assets/logo/ under --root, as tools/build_logo.py names them):
  <v>-sky / -city / -swoosh / -auto .png   each lit layer, its glow baked in, cropped to its own box, at --scale
                                           (art px -> px; default 5: the logo about 1270 px wide, the page's 620 CSS
                                           px at 2x)
                                           --no-glow: the tubes alone (the page's drop-shadows glow them: a
                                           fraction of the bytes - the baked glow is most of a layer's size)
  <v>-unlit.png                            the whole sign switched off (the tubes' dark glass, no glow)
  <v>-phone.png, <v>-desktop.png           (--preview) the lit sign on the title's night (its dusk and skyline) at
                                           a phone upright (390 x 844 at 3x) and a desktop (1920 x 1080)
and prints the layers' boxes for client/titlelogo.js LAYERS (as % of the logo's box) and each layer's glow colour.
"""
import io
import json
import math
import os
import re
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CELL = 6          # source px per art px (the owner's art pixel is about 5.5 source px; 6 gives the logo ~254 art px)
SRC_W, SRC_H = 1536, 1024
FILES = {'sky': '01-skyline.png', 'city': '02-city-life.png', 'swoosh': '03-swoosh.png', 'auto': '04-auto.png'}
ORDER = ['sky', 'city', 'swoosh', 'auto']

# the game's neon colours (client/art2/neonsigns.js NEON_COLS, signfont.js TRADES): red as the tattoo parlours',
# amber, cyan, violet; the lit windows' gold (titlescreen.js skyline)
RED, AMBER, CYAN, VIOLET, PINK = (255, 70, 90), (255, 190, 60), (70, 230, 255), (170, 100, 255), (255, 80, 150)
WINDOW = (255, 214, 120)
COL = {'sky': CYAN, 'city': RED, 'swoosh': RED, 'auto': AMBER}
TOWER = (14, 22, 49)        # the title skyline's near towers (#0e1631)
TOWER_FAR = (29, 42, 82)    # and its far ones (#1d2a52)


def hot(c):   # a tube's core: white-hot, tinted with its hue (signfont.js hotOf)
    return tuple(min(255, round(q * 0.35 + 170)) for q in c)


def mul(c, k):
    return tuple(max(0, min(255, round(q * k))) for q in c)


def mix(a, b, k):
    return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))


# ---- binary morphology on the art grid (numpy only) --------------------------------------------------------------
def shift(m, dx, dy):
    H, W = m.shape
    P = np.pad(m, 1)
    return P[1 + dy:1 + dy + H, 1 + dx:1 + dx + W]


def dil(m, sq=True):
    out = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if (dx or dy) and (sq or dx == 0 or dy == 0):
                out |= shift(m, dx, dy)
    return out


def ero(m, sq=True):
    return ~dil(~m, sq)


def nbrs(m):
    """the 8 neighbours, clockwise from north (p2..p9 in Zhang-Suen's naming)"""
    return [shift(m, 0, -1), shift(m, 1, -1), shift(m, 1, 0), shift(m, 1, 1), shift(m, 0, 1), shift(m, -1, 1), shift(m, -1, 0), shift(m, -1, -1)]


def thin(m):
    """Zhang-Suen thinning, then the staircases' corner pixels taken out (a one-pixel 8-connected centre line)"""
    m = m.astype(np.uint8).copy()
    while True:
        changed = False
        for step in (0, 1):
            p = nbrs(m)
            B = sum(x.astype(np.int32) for x in p)
            seq = p + [p[0]]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.int32) for i in range(8))
            p2, p4, p6, p8 = p[0], p[2], p[4], p[6]
            c = ((p2 * p4 * p6) == 0) & ((p4 * p6 * p8) == 0) if step == 0 else ((p2 * p4 * p8) == 0) & ((p2 * p6 * p8) == 0)
            d = (m == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if d.any():
                m[d] = 0
                changed = True
        if not changed:
            break
    m = m.astype(bool)
    yy, xx = np.mgrid[0:m.shape[0], 0:m.shape[1]]
    for par in (0, 1):
        N, NE, E, SE, S, SW, W, NW = nbrs(m)
        corner = (N & E & ~S & ~W & ~SW) | (E & S & ~W & ~N & ~NW) | (S & W & ~N & ~E & ~NE) | (W & N & ~E & ~S & ~SE)
        m &= ~(corner & (((xx + yy) & 1) == par))
    return m


def prune(sk, L=4, rounds=2):
    """take off the centre line's short spurs (a stroke's end that only nicks a corner): a branch of at most L px from
    an end to a junction"""
    sk = sk.copy()
    H, W = sk.shape
    for _ in range(rounds):
        cnt = sum(x.astype(np.int32) for x in nbrs(sk))
        ends = np.argwhere(sk & (cnt == 1))
        gone = []
        for y, x in ends:
            path, py, px, prev = [(y, x)], y, x, None
            ok = False
            for _ in range(L + 1):
                nxt = [(py + dy, px + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx) and 0 <= py + dy < H and 0 <= px + dx < W and sk[py + dy, px + dx] and (py + dy, px + dx) != prev and (py + dy, px + dx) not in path]
                if len(nxt) != 1:
                    ok = len(nxt) >= 2
                    break
                prev = (py, px)
                py, px = nxt[0]
                if cnt[py, px] >= 3:
                    ok = True
                    break
                path.append((py, px))
            if ok and len(path) <= L:
                gone += path
        for y, x in gone:
            sk[y, x] = False
        if not gone:
            break
    return sk


def tidy(m):
    """one-pixel nicks and bumps off a snapped shape (a majority vote over each 3 x 3, twice)"""
    for _ in range(2):
        s = sum(x.astype(np.int32) for x in nbrs(m)) + m.astype(np.int32)
        m = s >= 5
    return m


def blur(a, sigma):
    """gaussian blur of a float array (0..1 per channel) through PIL, in 8 bits x 3 for headroom"""
    if a.ndim == 3:
        return np.stack([blur(a[..., i], sigma) for i in range(a.shape[2])], -1)
    im = Image.fromarray(np.clip(a / 3 * 255, 0, 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(sigma))).astype(np.float32) / 255 * 3


# ---- the owner's layers -> shapes on the art grid ----------------------------------------------------------------
TOP = 16   # art px of headroom over the owner's frame (C's skyline stands taller than his)
GW, GH = math.ceil(SRC_W / CELL), math.ceil(SRC_H / CELL) + TOP


def snap(mask, smooth=0.4, th=0.5):
    """a source-size boolean mask onto the art grid: smoothed (the AI's uneven pixels), averaged per cell, thresholded"""
    im = Image.fromarray((mask * 255).astype(np.uint8))
    if smooth:
        im = im.filter(ImageFilter.GaussianBlur(CELL * smooth))
    a = np.zeros((GH * CELL, GW * CELL), np.float32)
    a[TOP * CELL:TOP * CELL + SRC_H, :SRC_W] = np.asarray(im).astype(np.float32) / 255
    return a.reshape(GH, CELL, GW, CELL).mean(axis=(1, 3)) >= th


def shapes(src):
    out = {}
    for k, f in FILES.items():
        a = np.asarray(Image.open(os.path.join(src, f)).convert('RGBA')).astype(np.int32)
        r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
        solid = al >= 128
        mx = np.maximum(np.maximum(r, g), b)
        outline = solid & (mx < 80) & (b >= r - 6)          # the black outline (a blue-black)
        if k == 'sky':
            tube = solid & (b > 150) & (g > 100) & (r < 120)   # the cyan tubes
            win = solid & (r > 180) & (g > 110) & (b < 90)     # the amber windows
            fill = solid & ~tube & ~win
            out['sky'] = {'tube': tidy(snap(tube, 0.25, 0.32)), 'win': snap(win, 0.15, 0.45), 'fill': tidy(snap(fill | tube | win, 0.3, 0.5))}
        else:
            body = solid & ~outline
            cream = solid & (r > 200) & (g > 180) & (b > 140)   # the letters' own line: the cream inside each stroke
            out[k] = {'body': tidy(snap(body)), 'core': tidy(snap(cream, 0.3, 0.45))}
            if k == 'auto':   # (its counters and the u's groove are narrow: a cell a third black outline is outline)
                out[k]['body'] = tidy(snap(body, 0.15, 0.55) & ~snap(outline | ~solid, 0.1, 0.34))
    # "Auto": its bold letters one by one (their rims touch in the owner's art). Each letter is what its cream inline
    # closes round (snapped finely, so the line stays whole), out a px past the line; what a line closes round with the
    # owner's transparent counter inside is a counter. A 2 px gap is left where two letters meet.
    A = out['auto']
    a = np.asarray(Image.open(os.path.join(src, FILES['auto'])).convert('RGBA')).astype(np.int32)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    line = snap((al >= 128) & (r > 200) & (g > 180) & (b > 140), 0.1, 0.25)
    see = snap(al < 128, 0.1, 0.3)
    holes = label(fill_holes(line) & ~line)
    letters, counters = [], np.zeros_like(line)
    for i in range(1, holes.max() + 1):
        h = holes == i
        if (h & see).any():
            counters |= h
        elif h.sum() >= 40:
            letters.append(dil(dil(h)))
    letters = [tidy(m & ~counters & ~dil(np.logical_or.reduce([o for o in letters if o is not m]), sq=False)) for m in letters]
    A['letters'] = letters
    A['sep'] = np.logical_or.reduce(letters)
    return out


def fill_holes(m):
    """m with everything it closes round filled in (what the outside can't reach, 4-connected)"""
    reach = np.zeros_like(m)
    reach[0, :] = ~m[0, :]; reach[-1, :] = ~m[-1, :]; reach[:, 0] = ~m[:, 0]; reach[:, -1] = ~m[:, -1]
    while True:
        nxt = dil(reach, sq=False) & ~m
        if (nxt == reach).all():
            return ~reach
        reach = nxt


def label(m):
    """4-connected components: 0 outside, 1.. each part, numbered left to right"""
    lab = np.zeros(m.shape, np.int32)
    H, W = m.shape
    n = 0
    for x in range(W):
        for y in range(H):
            if m[y, x] and not lab[y, x]:
                n += 1
                st = [(y, x)]
                lab[y, x] = n
                while st:
                    cy, cx = st.pop()
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            st.append((ny, nx))
    return lab


def grow(lab, within):
    """the labels spread through `within`, a px a round (the nearest part takes each px)"""
    lab = np.where(within, lab, 0)
    while True:
        add = np.zeros_like(lab)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            add = np.where((add == 0), shift(lab, dx, dy), add)
        new = np.where((lab == 0) & within & (add > 0), add, lab)
        if (new == lab).all():
            return lab
        lab = new


# ---- painting: each layer to an art-grid colour image, its emission (what glows) and its switched-off look -------
class Layer:
    def __init__(self, k, col):
        self.k, self.col = k, col
        self.rgb = np.zeros((GH, GW, 3), np.float32)
        self.a = np.zeros((GH, GW), bool)
        self.emi = np.zeros((GH, GW, 3), np.float32)   # 0..1 per channel
        self.off = np.zeros((GH, GW, 3), np.float32)

    def put(self, m, c, e=0.0, ec=None, off=None):
        m = m & np.ones_like(self.a)
        self.rgb[m] = c
        self.a |= m
        ec = ec or c
        self.emi[m] = np.array(ec, np.float32) / 255 * e
        self.off[m] = off if off is not None else glass(c)


def glass(c):   # a tube switched off: its dark tinted glass
    return mix((26, 22, 34), c, 0.28)


def tube(L, core, col, width=1, shade=False):
    """a neon tube along `core` (a one-px centre line): the hot core, `width` px of colour each side; shade: the tube's
    far side a step darker (the light falls from above, as on the game's 16-bit ramps)"""
    rings = [core]
    acc = core
    for i in range(width):
        nxt = dil(acc, sq=(i % 2 == 0))
        rings.append(nxt & ~acc)
        acc = nxt
    hc = hot(col)
    if width >= 2:
        L.put(rings[2] if not shade else rings[2], mul(col, 0.78), 0.55, col, glass(col))
        if shade:
            low = rings[2] & shift(acc, 0, -1) & ~shift(acc, 0, 1)   # the ring's lower side: darker still
            L.put(low, mul(col, 0.6), 0.45, col, mul(glass(col), 0.8))
        for r in rings[3:]:
            L.put(r, mul(col, 0.6), 0.35, col, mul(glass(col), 0.8))
        L.put(rings[1], mix(col, hc, 0.35), 0.85, col, glass(col))
    elif width == 1:
        L.put(rings[1], col, 0.75, col, glass(col))
    L.put(core, hc, 1.0, col, mix((40, 36, 50), col, 0.35))
    return acc


def edge_line(body):
    """the one-px line round a shape, just inside its edge (and round its counters)"""
    return body & ~ero(body, sq=False)


def paint_sky_orig(S, variant):
    sk = S['sky']
    L = Layer('sky', CYAN)
    if variant == 'B':
        L.put(sk['fill'] & ~sk['tube'], TOWER, 0.0, None, mul(TOWER, 0.9))
    core = prune(thin(sk['tube']), 3)
    tube(L, core, CYAN, 1)
    win = sk['win'] & ~dil(core)
    L.put(win, WINDOW, 0.7, WINDOW, (60, 52, 40))
    return L


def paint_letters(S, k, variant):
    """a word in the variant's neon: the script ("City Life", the swoosh) along its own centre line (the cream line
    inside each of the owner's strokes), "Auto" letter by letter round its shapes"""
    sh, col = S[k], COL[k]
    L = Layer(k, col)
    if k == 'auto':
        letters, hc = sh['letters'], hot(col)
        for m in letters:
            if variant == 'A':
                # one tube round each letter (and its counters), a px in from its edge
                tube(L, edge_line(ero(m, sq=False)), col, 1)
            elif variant == 'B':
                # a channel letter: dark inside, a tube round it, a hot inline a step in (the owner's Auto, lit)
                L.put(m, mul(col, 0.2), 0.06, col, mul(col, 0.12))
                outer = edge_line(m)
                L.put(outer, col, 0.8, col, glass(col))
                L.put(edge_line(ero(m, sq=False)), mul(col, 0.55), 0.45, col, glass(col))
                tube(L, edge_line(ero(ero(ero(m, sq=False)), sq=False)), col, 0)
            else:
                # bold: a shaded tube round each letter over its dimly lit face
                L.put(m, mul(col, 0.3), 0.12, col, mul(col, 0.12))
                tube(L, edge_line(ero(ero(m, sq=False))), col, 2, shade=True)
        return L
    line = prune(thin(sh['core']), 4)
    if variant == 'A':
        tube(L, line, col, 1)
    elif variant == 'B':
        # lit through: the stroke the hot white of a tube (lighter along its top), a tube of its colour round it
        body = dil(dil(line), sq=False)
        hc = hot(col)
        rim = edge_line(body)
        L.put(rim, col, 0.85, col, glass(col))
        face = body & ~rim
        L.put(face, hc, 0.95, col, mix((40, 34, 48), col, 0.2))
        L.put(face & ~shift(face, 0, -1), mix(hc, (255, 255, 255), 0.6), 1.0, col, mix((40, 34, 48), col, 0.25))
        L.put(face & ~shift(face, 0, 1), mix(hc, col, 0.45), 0.9, col, mix((40, 34, 48), col, 0.2))
    else:
        tube(L, line, col, 2, shade=True)
    return L


# ---- C's skyline: built like the title's own (titlescreen.js skyline), cleared of the letters under it -----------
def lcg(seed):
    """the title skyline's random (JS doubles: (seed * 1103515245 + 12345) & 0x7fffffff)"""
    s = [seed]

    def r():
        v = float(s[0]) * 1103515245.0 + 12345.0
        s[0] = int(v) % (1 << 32) & 0x7fffffff
        return s[0] / 0x7fffffff
    return r


def paint_sky_rich(S, letters):
    """a dome of towers over the middle of "City Life": the tallest in the middle with a spire, the rest stepping down,
    each with the title skyline's antennas and lit windows; the front row's roofline a cyan tube, a row of taller far
    towers behind in violet, dimmer. Kept a few px clear of every letter."""
    sk = S['sky']
    ys, xs = np.nonzero(sk['fill'])
    cx = int(round(xs.mean()))
    base = int(ys.max())   # the owner's skyline's foot
    clear = np.zeros((GH, GW), bool)
    for m in letters:
        clear |= m
    clear = dil(dil(dil(clear)))
    span = 64          # half-width of the dome (art px)
    r = lcg(11)
    front = np.zeros((GH, GW), bool)
    far = np.zeros((GH, GW), bool)
    wins = np.zeros((GH, GW), bool)
    ants = []

    def towers(mask, x0, x1, hmax, hmin, wmin, wmax, gap, wincell):
        x = x0
        while x < x1:
            w = wmin + int(r() * (wmax - wmin))
            mid = x + w / 2
            d = abs(mid - cx) / span
            h = int(hmin + (hmax - hmin) * max(0.0, 1 - d * d) * (0.75 + 0.25 * r()))
            top = base - h
            mask[top:base + 1, x:x + w] = True
            if r() < 0.35 and w >= 6 and wincell:
                ants.append((x + w // 2, top - 4))
                mask[top - 4:top, x + w // 2:x + w // 2 + 1] = True
            if wincell:
                for wy in range(top + 3, base - 1, 4):
                    for wx in range(x + 2, x + w - 2, 3):
                        if r() < 0.42:
                            wins[wy:wy + 2, wx:wx + 1] = True
            x += w + (gap if r() < 0.4 else 0)

    towers(far, cx - span + 6, cx + span - 6, 40, 14, 6, 12, 2, False)
    towers(front, cx - span, cx + span, 30, 8, 8, 16, 2, True)
    # the centre tower: the tallest, stepped, with a spire (the owner's skyline's middle)
    tw = 14
    for dw, dh in ((0, 34), (3, 39), (5, 43)):
        front[base - dh:base + 1, cx - tw // 2 + dw:cx + tw // 2 - dw + 1] = True
    front[base - 52:base - 43, cx:cx + 1] = True
    ants.append((cx, base - 52))
    for wy in range(base - 31, base - 1, 4):
        for wx in range(cx - tw // 2 + 2, cx + tw // 2 - 1, 3):
            wins[wy:wy + 2, wx:wx + 1] = True
    # rooflines: the silhouette's edge, open along the foot (the towers stand behind the letters); taken before the
    # letters' room is cleared, so a cut tower shows no tube along the cut
    def roof(m):
        below = shift(m, 0, 1) | (np.arange(GH)[:, None] >= base)
        e = m & ~(shift(m, 0, -1) & shift(m, -1, 0) & shift(m, 1, 0) & below)
        return e & (np.arange(GH)[:, None] < base)
    frontline, farline = roof(front), roof(far) & ~dil(front)
    # nothing over the letters
    front &= ~clear
    far &= ~clear
    wins &= front & ~clear
    L = Layer('sky', CYAN)
    L.put(far & ~front, TOWER_FAR, 0.0, None, mul(TOWER_FAR, 0.9))
    L.put(front, TOWER, 0.0, None, mul(TOWER, 0.9))
    L.put(farline & ~clear, mul(VIOLET, 0.85), 0.55, VIOLET, glass(VIOLET))
    tube(L, frontline & ~clear, CYAN, 1)
    L.a &= ~clear
    L.emi[clear] = 0
    L.put(wins & ~dil(frontline), WINDOW, 0.7, WINDOW, (60, 52, 40))
    # the aircraft lights on the antennas' tips (red, like the radio masts in the game)
    for x, y in ants:
        tip = np.zeros((GH, GW), bool)
        tip[max(0, y - 1), x] = True
        if not (tip & clear).any():
            L.put(tip, (255, 90, 90), 1.0, (255, 60, 60), (70, 30, 34))
    return L


# ---- D: the owner's logo as he drew it, cleaned up on the art grid (2026-11-14, the owner on A-C: "very thin ... can
# we not copy the concept art almost exactly but just have it cleaned up") --------------------------------------------
# Each layer's source colours sorted into a few classes (nearest of the colours he used), each art px the class most of
# its CELL x CELL source px are (a mode filter - the strokes keep their full weight), lone px voted out by their
# neighbours, then each class painted in one clean colour from the game's neon. His heavy black outline goes: kept only as
# a thin dark seam where it parts two lit shapes (letters overlapping, the u's groove, the y over the swoosh). D2: the
# script's red rim a px thicker, out into where the outline was.
CREAM, RED1, RED2, GOLD1, GOLD2 = (255, 238, 206), (255, 84, 96), (214, 30, 62), (255, 190, 60), (232, 138, 22)
FILL, EDGE = (44, 24, 10), (24, 14, 30)
OUTL = -2   # (the black outline's class)
CLASSES = {   # layer -> [(the source colour it stands for, the colour drawn, its glow, its colour switched off)]; OUTL last
    'city': [((240, 226, 196), CREAM, 0.95), ((242, 68, 58), RED1, 0.8), ((234, 10, 38), RED2, 0.55), ((6, 2, 16), None, 0)],
    'swoosh': [((240, 226, 196), CREAM, 0.95), ((242, 68, 58), RED1, 0.8), ((234, 10, 38), RED2, 0.55), ((6, 2, 16), None, 0)],
    'auto': [((240, 226, 196), CREAM, 0.95), ((242, 166, 4), GOLD1, 0.8), ((240, 140, 0), GOLD2, 0.6), ((40, 18, 0), FILL, 0.04), ((6, 2, 16), None, 0)],
    'sky': [((10, 178, 240), CYAN, 0.8), ((240, 168, 0), WINDOW, 0.7), ((0, 4, 40), TOWER, 0.0)],
}


def modes(path, refs):
    """the art grid's class per px (-1 clear, OUTL the outline, else the index into refs): a mode filter over each
    cell's source px, then lone px (fewer than 2 of their 8 neighbours alike) given their neighbourhood's class"""
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.int32)
    solid = a[..., 3] >= 128
    ref = np.array([r for r, *_ in refs], np.int32)
    d = ((a[..., None, :3] - ref[None, None]) ** 2).sum(-1)
    cls = np.where(solid, d.argmin(-1), -1)
    K = len(refs)
    votes = []
    for k in range(-1, K):
        m = np.zeros((GH * CELL, GW * CELL), np.float32)
        m[TOP * CELL:TOP * CELL + SRC_H, :SRC_W] = (cls == k)
        if k == -1:
            m[:TOP * CELL] = 1
            m[TOP * CELL + SRC_H:] = 1
            m[:, SRC_W:] = 1
        votes.append(m.reshape(GH, CELL, GW, CELL).mean(axis=(1, 3)))
    g = np.argmax(np.stack(votes), 0) - 1
    for _ in range(2):
        same = np.zeros(g.shape, np.int32)
        P = np.pad(g, 1, constant_values=-9)
        cnt = np.zeros((K + 1,) + g.shape, np.int32)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dx or dy:
                    nb = P[1 + dy:1 + dy + GH, 1 + dx:1 + dx + GW]
                    same += nb == g
                    for k in range(-1, K):
                        cnt[k + 1] += nb == k
        lone = same < 2
        g = np.where(lone, cnt.argmax(0) - 1, g)
    return g


def seams(g, lit, outl):
    """his outline split: what the outside reaches goes (the heavy edge round the letters and their drop below); what's
    shut inside the lit shapes stays as a thin dark seam where it's a line (letters overlapping, the u's groove, a
    counter's ring) and is filled with the colour round it where it's only a speck. Returns (the seams, g filled)."""
    outside = ~fill_holes(lit)
    inner = outl & ~outside
    lab = label(inner)
    keep = np.zeros_like(inner)
    g = g.copy()
    K = int(g.max()) + 1
    for i in range(1, lab.max() + 1):
        m = lab == i
        if m.sum() >= 6:
            keep |= m
            continue
        # a speck: the class most of the lit px round it are
        ring = dil(m) & lit
        vals = g[ring]
        if vals.size:
            g[m] = np.bincount(vals[vals >= 0], minlength=K).argmax()
    return keep, g


def paint_faithful(src, thick=False):
    Ls = {}
    for k in ORDER:
        refs = CLASSES[k]
        g = modes(os.path.join(src, FILES[k]), refs)
        L = Layer(k, COL[k])
        if k == 'sky':
            # the towers' dark only inside the skyline's outline (the rest of his dark round it goes)
            lit = (g == 0) | (g == 1)
            inside = fill_holes(lit | dil(lit)) & ~lit
            for i, (_, c, e) in enumerate(refs):
                m = g == i
                if i == 2:
                    m &= inside
                L.put(m, c, e, COL[k] if i != 1 else WINDOW, glass(c) if e else mul(c, 0.9))
            Ls[k] = L
            continue
        outl = g == len(refs) - 1
        lit = (g >= 0) & ~outl
        sm, g = seams(g, lit, outl)
        lit = (g >= 0) & (g != len(refs) - 1)
        if thick and k in ('city', 'swoosh'):
            # the red rim a px out, into where the outline was (round the outside, not into the seams)
            grow = dil(lit, sq=False) & outl & ~sm
            g = np.where(grow, 2, g)
            lit |= grow
        for i, (_, c, e) in enumerate(refs[:-1]):
            L.put(g == i, c, e, COL[k], glass(c) if c != FILL else mul(c, 0.8))
        L.put(sm, EDGE, 0.0, None, EDGE)
        Ls[k] = L
    return [Ls[k] for k in ORDER]


def build(src, variant):
    if variant in ('D', 'D2'):
        return paint_faithful(src, thick=variant == 'D2')
    S = shapes(src)
    Ls = {}
    for k in ('city', 'swoosh', 'auto'):
        Ls[k] = paint_letters(S, k, variant)
    if variant == 'C':
        Ls['sky'] = paint_sky_rich(S, [L.a for L in Ls.values()])
    else:
        Ls['sky'] = paint_sky_orig(S, variant)
    return [Ls[k] for k in ORDER]


# ---- rendering ------------------------------------------------------------------------------------------------
GLOWS = ((1.1, 0.85), (4.5, 0.6), (13.0, 0.28))   # (sigma in art px, strength): the bloom's half and quarter size, and the wall's halo


def glow_of(L, scale, pad):
    """the layer's soft glow at the output size: its emission blurred (the night's bloom), as colour + alpha"""
    e = np.repeat(np.repeat(L.emi, scale, 0), scale, 1)
    e = np.pad(e, ((pad, pad), (pad, pad), (0, 0)))
    g = np.zeros_like(e)
    for s, k in GLOWS:
        g += blur(e, s * scale) * k
    a = np.clip(g.max(axis=2), 0, 1)
    c = np.where(a[..., None] > 1e-4, g / np.maximum(a[..., None], 1e-4), 0)
    return np.clip(c, 0, 1), a


def render_layer(L, scale, pad, lit=True, glow=True):
    """an art layer at the output size: its glow (lit) under its pixels, every art px a whole scale x scale block"""
    H, W = GH * scale + 2 * pad, GW * scale + 2 * pad
    out = np.zeros((H, W, 4), np.float32)
    if lit and glow:
        c, a = glow_of(L, scale, pad)
        out[..., :3] = c
        out[..., 3] = a
    px = L.rgb if lit else L.off
    rgb = np.repeat(np.repeat(px / 255, scale, 0), scale, 1)
    al = np.repeat(np.repeat(L.a, scale, 0), scale, 1)
    sl = (slice(pad, pad + GH * scale), slice(pad, pad + GW * scale))
    o = out[sl]
    o[al, :3] = rgb[al]
    o[al, 3] = 1
    return Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), 'RGBA')


def logo_box(layers):
    m = np.zeros((GH, GW), bool)
    for L in layers:
        m |= L.a
    ys, xs = np.nonzero(m)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def compose(layers, scale, lit=True):
    """the whole sign at the output size, cropped to its tubes' box plus room for the glow"""
    pad = int(GLOWS[-1][0] * scale * 2)
    x0, y0, x1, y1 = logo_box(layers)
    base = Image.new('RGBA', (GW * scale + 2 * pad, GH * scale + 2 * pad), (0, 0, 0, 0))
    if lit:
        # glows add up like light; the tubes go on top
        acc = np.zeros((base.height, base.width, 3), np.float32)
        for L in layers:
            c, a = glow_of(L, scale, pad)
            acc += c * a[..., None]
        a = np.clip(acc.max(axis=2), 0, 1)
        c = np.where(a[..., None] > 1e-4, acc / np.maximum(a[..., None], 1e-4), 0)
        base = Image.fromarray((np.concatenate([np.clip(c, 0, 1), a[..., None]], 2) * 255).round().astype(np.uint8), 'RGBA')
    for L in layers:
        base.alpha_composite(render_layer(L, scale, pad, lit=False) if not lit else _pixels(L, scale, pad))
    crop = (x0 * scale, y0 * scale, x1 * scale + 2 * pad, y1 * scale + 2 * pad)
    return base.crop(crop), pad


def _pixels(L, scale, pad):
    H, W = GH * scale + 2 * pad, GW * scale + 2 * pad
    out = np.zeros((H, W, 4), np.uint8)
    rgb = np.repeat(np.repeat(L.rgb, scale, 0), scale, 1).astype(np.uint8)
    al = np.repeat(np.repeat(L.a, scale, 0), scale, 1)
    o = out[pad:pad + GH * scale, pad:pad + GW * scale]
    o[al, :3] = rgb[al]
    o[al, 3] = 255
    return Image.fromarray(out, 'RGBA')


# ---- the title's night (client/style.css #title: the dusk gradient and the skyline along the foot) ------------------
INK, NAVY, DUSK_A, DUSK_B = (7, 11, 22), (15, 24, 48), (58, 42, 92), (168, 80, 62)


def title_skyline():
    """client/titlescreen.js skyline(), 320 x 72"""
    W, H = 320, 72
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = lcg(7)

    def rect(x, y, w, h, c):
        if w > 0 and h > 0:
            d.rectangle((x, y, x + w - 1, y + h - 1), fill=c)
    for col, lo, hi, win in (((29, 42, 82), 20, 56, 0.18), ((14, 22, 49), 10, 40, 0.3)):
        x = -4
        while x < W:
            w = 10 + int(r() * 18)
            h = lo + int(r() * (hi - lo))
            rect(x, H - h, w, h, col)
            if r() < 0.3:
                rect(x + (w >> 1) - 1, H - h - 5, 2, 5, col)
            for wy in range(H - h + 3, H - 2, 4):
                for wx in range(x + 2, x + w - 2, 3):
                    if r() < win:
                        rect(wx, wy, 1, 2, (226, 189, 87))
            x += w + (2 if r() < 0.4 else 0)
    for px in (34, 118, 251, 300):
        ph = 26 + int(r() * 10)
        for y in range(ph):
            rect(px + round(math.sin(y / 9) * 1.5), H - y, 2, 1, (10, 16, 34))
        tx, ty = px + 1, H - ph
        for a in range(6):
            dx, dy = math.cos(a * 1.05), math.sin(a * 1.05) * 0.5
            for rr in range(9):
                rect(round(tx + dx * rr), round(ty + dy * rr + (rr * rr) / 22), 2, 1, (10, 16, 34))
    return im


def night(W, H, dpr):
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    stops = [(0, INK), (0.38, NAVY), (0.78, DUSK_A), (1, DUSK_B)]
    a = np.zeros((H, 3), np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        m = (y[:, 0] >= t0) & (y[:, 0] <= t1)
        k = ((y[m, 0] - t0) / (t1 - t0))[:, None]
        a[m] = np.array(c0) + (np.array(c1) - np.array(c0)) * k
    bg = Image.fromarray(np.broadcast_to(a[:, None, :], (H, W, 3)).astype(np.uint8)).convert('RGBA')
    sky = title_skyline()
    sh = round(216 * dpr)
    s = sky.resize((round(sky.width * sh / sky.height), sh), Image.NEAREST)
    for x in range((W - s.width) // 2 % s.width - s.width, W, s.width):
        bg.alpha_composite(s, (x, H - sh)) if x >= 0 else bg.alpha_composite(s.crop((-x, 0, s.width, sh)), (0, H - sh))
    return bg


def place(bg, logo, pad, scale, width, cy):
    """the logo onto the night, its tubes' box `width` px wide (whole art px only: scaled by a whole number when it
    can be, else smoothly), centred at height cy"""
    tw = logo.width - 2 * pad
    k = width / tw
    im = logo.resize((round(logo.width * k), round(logo.height * k)), Image.NEAREST if abs(k - round(k)) < 1e-6 else Image.LANCZOS)
    p = round(pad * k)
    x = (bg.width - (im.width - 2 * p)) // 2 - p
    y = round(cy - (im.height - 2 * p) / 2) - p
    # light adds up over the night: glow alpha over a dark ground reads the same
    bg.alpha_composite(im, (x, y)) if x >= 0 and y >= 0 else bg.paste(im, (x, y), im)
    return bg


def previews(layers, out, v):
    """the lit sign on the title's night: a phone upright (#logo min(620px, 84vw, 62vh): 328 CSS px at 3x) and a
    desktop (min(620px, 84vw, 46vh): 497 px), each scaled by a whole number of px an art px (the nearest)"""
    x0, y0, x1, y1 = logo_box(layers)
    aw = x1 - x0
    paths = []
    for name, (W, H, dpr, css_w, cy) in {'phone': (1170, 2532, 3, 327.6, 0.27), 'desktop': (1920, 1080, 1, 496.8, 0.33)}.items():
        s = max(1, round(css_w * dpr / aw))
        logo, pad = compose(layers, s)
        bg = night(W, H, dpr)
        place(bg, logo, pad, s, aw * s, H * cy)
        p = os.path.join(out, f'{v}-{name}.png')
        bg.convert('RGB').save(p, optimize=True)
        paths.append(p)
    return paths


# ---- the current logo (assets/logo + client/titlelogo.js LAYERS) for the comparison --------------------------------
def current_logo(root, width):
    js = open(os.path.join(root, 'client', 'titlelogo.js')).read()
    rows = re.findall(r"\{ k: '(\w+)', f: '([\w.]+)', x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), px: \[(\d+), (\d+)\], c: '#(\w+)' \}", js)
    unlit = Image.open(os.path.join(root, 'assets', 'logo', 'unlit.webp')).convert('RGBA')
    k = width / unlit.width
    H = round(unlit.height * k)
    pad = 60
    base = Image.new('RGBA', (width + 2 * pad, H + 2 * pad), (0, 0, 0, 0))
    base.alpha_composite(unlit.resize((width, H), Image.LANCZOS), (pad, pad))
    for _, f, x, y, w, _, _, c in rows:
        im = Image.open(os.path.join(root, 'assets', 'logo', f)).convert('RGBA')
        lw = round(float(w) / 100 * width)
        im = im.resize((lw, round(im.height * lw / im.width)), Image.LANCZOS)
        full = Image.new('RGBA', base.size, (0, 0, 0, 0))
        full.alpha_composite(im, (pad + round(float(x) / 100 * width), pad + round(float(y) / 100 * H)))
        al = np.asarray(full)[..., 3].astype(np.float32) / 255
        col = tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
        # its glow as the page draws it: drop-shadow(0 0 .45cqw) then drop-shadow(0 0 2cqw), in its colour
        g = np.zeros_like(al)
        for blur_css in (0.0045 * width, 0.02 * width):
            g = np.clip(g + blur(al, blur_css / 2), 0, 1)
        gl = np.zeros((*al.shape, 4), np.uint8)
        gl[..., :3] = col
        gl[..., 3] = (np.clip(g, 0, 1) * 255).astype(np.uint8)
        base.alpha_composite(Image.fromarray(gl, 'RGBA'))
        base.alpha_composite(full)
    return base, pad


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def sheet(src, root, out, vs='ABC', name='contact-sheet.png'):
    """the current logo and the three variants side by side on the title's night, the same width, then a close-up of
    each ("Cit" at the page's 2x: the pixels)"""
    PW, PH, LW, CH = 720, 640, 600, 380
    cols = [('Current (AI image)', None)] + [(f'{v}  {NAME[v]}', v) for v in vs]
    W = PW * len(cols)
    sh = Image.new('RGB', (W, PH + CH), (10, 12, 20))
    d = ImageDraw.Draw(sh)
    f = font(26)
    for i, (label, v) in enumerate(cols):
        bg = night(PW, PH, 1)
        if v is None:
            logo, pad = current_logo(root, LW)
            bg.alpha_composite(logo, ((PW - logo.width) // 2, round(PH * 0.42 - logo.height / 2)))
            big, bpad = current_logo(root, 1240)
        else:
            layers = build(src, v)
            x0, y0, x1, y1 = logo_box(layers)
            s = max(1, round(LW / (x1 - x0)))
            logo, pad = compose(layers, s)
            place(bg, logo, pad, s, LW, PH * 0.42)
            big, bpad = compose(layers, max(1, round(1240 / (x1 - x0))))
        bw, bh = big.width - 2 * bpad, big.height - 2 * bpad
        close = big.crop((bpad + round(bw * 0.02), bpad + round(bh * 0.12), bpad + round(bw * 0.36), bpad + round(bh * 0.52)))
        sh.paste(bg.convert('RGB'), (i * PW, 0))
        d.text((i * PW + 20, 16), label, fill=(243, 234, 210), font=f)
        cb = Image.new('RGBA', (PW, CH), NAVY + (255,))
        k = min((PW - 20) / close.width, (CH - 20) / close.height)
        cl = close.resize((round(close.width * k), round(close.height * k)), Image.NEAREST)
        cb.alpha_composite(cl, ((PW - cl.width) // 2, (CH - cl.height) // 2))
        sh.paste(cb.convert('RGB'), (i * PW, PH))
        d.line((i * PW, 0, i * PW, PH + CH), fill=(10, 12, 20), width=4)
    p = os.path.join(out, name)
    sh.save(p, optimize=True)
    return p


NAME = {'A': 'thin tubes', 'B': 'filled, neon rim', 'C': 'bold tubes, rich skyline', 'D': 'his logo, cleaned up', 'D2': 'D, a thicker red rim'}


def save_smallest(im, path_no_ext):
    out = {}
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); out['.png'] = b.getvalue()
    b = io.BytesIO(); im.save(b, 'WEBP', lossless=True, quality=100, method=6); out['.webp'] = b.getvalue()
    ext = min(out, key=lambda k: len(out[k]))
    for k in out:
        p = path_no_ext + k
        if k == ext:
            with open(p, 'wb') as fh:
                fh.write(out[k])
        elif os.path.exists(p):
            os.remove(p)
    return os.path.basename(path_no_ext) + ext, len(out[ext])


def write_layers(layers, scale, out, prefix, install, glow=True):
    """each lit layer cropped to its own box (its glow included), the unlit sign, and the table for titlelogo.js"""
    pad = int(GLOWS[-1][0] * scale * 2)
    unlit, _ = compose(layers, scale, lit=False)
    full, _ = compose(layers, scale, lit=True)
    x0, y0, _, _ = logo_box(layers)
    BW, BH = full.size
    name = (lambda k: os.path.join(out, k)) if install else (lambda k: os.path.join(out, f'{prefix}-{k}'))
    table = []
    uname, usize = save_smallest(unlit, name('unlit')) if install else (os.path.basename(name('unlit')) + '.png', unlit.save(name('unlit') + '.png', optimize=True) or os.path.getsize(name('unlit') + '.png'))
    for L in layers:
        im = render_layer(L, scale, pad, glow=glow)
        # into the logo's box (the same crop as compose: the tubes' box plus the glow's room), then to its own box
        im = im.crop((x0 * scale, y0 * scale, x0 * scale + BW, y0 * scale + BH))
        bb = im.getchannel('A').point(lambda q: 255 if q >= 4 else 0).getbbox()
        im = im.crop(bb)
        if install:
            fname, size = save_smallest(im, name(L.k))
        else:
            im.save(name(L.k) + '.png', optimize=True)
            fname, size = os.path.basename(name(L.k)) + '.png', os.path.getsize(name(L.k) + '.png')
        table.append({'k': L.k, 'f': fname, 'x': round(bb[0] / BW * 100, 3), 'y': round(bb[1] / BH * 100, 3), 'w': round((bb[2] - bb[0]) / BW * 100, 3), 'px': [bb[2] - bb[0], bb[3] - bb[1]], 'c': '#%02x%02x%02x' % L.col, 'bytes': size})
    return {'box': [BW, BH], 'unlit': [uname, usize], 'layers': table}


def main():
    args = sys.argv[1:]
    src = args[0]
    opt = lambda k, d=None: args[args.index(k) + 1] if k in args else d
    root = opt('--root', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    out = opt('--out', '.')
    os.makedirs(out, exist_ok=True)
    if '--sheet' in args:
        vs = opt('--sheet')
        vs = vs.upper().split(',') if vs and not vs.startswith('--') else list('ABC')
        print(sheet(src, root, out, vs, opt('--name', 'contact-sheet.png')))
        return
    v = opt('--variant', 'A').upper()
    scale = int(opt('--scale', 5))
    layers = build(src, v)
    if '--install' in args:
        out = os.path.join(root, 'assets', 'logo')
        os.makedirs(out, exist_ok=True)
    res = write_layers(layers, scale, out, v, '--install' in args, glow='--no-glow' not in args)
    x0, y0, x1, y1 = logo_box(layers)
    res['art'] = [int(x1 - x0), int(y1 - y0)]
    if '--preview' in args:
        res['previews'] = previews(layers, out, v)
    print(json.dumps(res, indent=1))


if __name__ == '__main__':
    main()
