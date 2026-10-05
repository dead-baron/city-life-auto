"""Hand-designed city blocks: cut each block out of the designer's paintings and fit it to the
block it was painted over (shared/handblocks.js).

Usage: python3 tools/build_blocks.py <concept_dir> [repo_root=.] [--preview <dir>]

Outputs
  assets/blocks<i>.webp + blocks<i>_glow.webp   the fitted blocks, 1 art px per world px
  shared/block-data.js                            generated: atlas rects per block

How a block is fitted
  * A rectangular block is cropped at the outer edge of its painted curb. The painting is never
    the exact shape of the game's block, so it is first scaled uniformly (to the geometric mean of
    the two stretch factors) and the remaining difference is taken up by seam carving: rows and
    columns of the least eventful pixels (paving, flat roof) are added or removed, so signs,
    windows, lamps and trees keep their shape instead of being squashed.
  * A plaza cut in two by a diagonal avenue (Broadway) is two painted triangles, each warped onto
    the game's triangle of pavement.
  * Tiles that are road in the game are cut out of the art: the game's own streets, crosswalks
    and curbs are drawn there.
  * Paint-outs: things the game draws itself (its subway entrance, the motor pool's gate) are
    painted out of the art first, by tiling a clean sample of the paving next to them.
  * Signs whose words differ from the shop's name in the game are repainted with that name.
"""
import json
import os
import subprocess
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_art import shelf_pack, paint_out  # noqa: E402
from scipy import ndimage  # noqa: E402

SRC = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '.'
ROOT = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else os.path.join(os.path.dirname(__file__), '..')
PREVIEW = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
ASSETS = os.path.join(ROOT, 'assets')
TILE = 32
FONT = os.path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.woff')

# The downtown concept paintings (spectator screenshot of Midtown / Northgate / Downtown, painted over)
STRIP3 = '6798e892-image.png'    # Fresh Coat Garage, Bean Machine Coffee, South Port Cannery
CIVIC = '390d1fba-image.png'     # Westpoint General, Broadway plaza, Cedar Falls Clinic / plaza, police, City Hall
HARDW = 'cb2ec2d4-image.png'     # Hardware, City General, Electronics, plaza with the bus stop
SHOPS4 = 'c98ce2f5-image.png'    # Fresh Mart, Pharmacy, Fitness, Books
VELL = 'ecf8162e-image.png'      # Vellori + Downtown Station, The Daily Fork, Broadway plaza

# key: sheet, crop box (outer edge of the painted curb, source px), paint-outs, sign repaints
BLOCKS = {
    'mt_garage': dict(sheet=STRIP3, box=(20, 118, 665, 646)),
    'mt_coffee': dict(sheet=STRIP3, box=(783, 118, 1302, 648)),
    'ng_cannery': dict(sheet=STRIP3, box=(1415, 118, 1955, 648)),
    # the game draws its own Downtown Station entrance on this block's subway plaza
    'dt_vellori': dict(sheet=VELL, box=(75, 90, 590, 668), paint=[((345, 485, 542, 615), (360, 612, 440, 642))]),
    'dt_dailyfork': dict(sheet=VELL, box=(678, 90, 1215, 670)),
    'mt_grocery': dict(sheet=SHOPS4, box=(55, 42, 617, 575), signs=[((146, 397, 321, 429), ['FRESHHUB GROCERY'], (244, 244, 236))]),
    'mt_pharmacy': dict(sheet=SHOPS4, box=(722, 25, 1285, 572), signs=[((938, 394, 1096, 427), ['MEDIMART PHARMACY'], (245, 245, 250))]),
    'mt_hardware': dict(sheet=HARDW, box=(62, 38, 575, 607), signs=[((200, 362, 362, 393), ['FALLS HARDWARE'], (246, 234, 208))]),
    'dt_citygeneral': dict(sheet=HARDW, box=(675, 38, 1200, 607)),
    'dt_clinic': dict(sheet=CIVIC, box=(1060, 22, 1517, 472)),
    # Midtown Station's entrance moves to the front of this block (shared/handblocks.js subway)
    'mt_fitness': dict(sheet=SHOPS4, box=(38, 655, 617, 1120), paint=[((300, 1000, 525, 1098), (238, 1035, 292, 1088))]),
    'mt_books': dict(sheet=SHOPS4, box=(720, 655, 1287, 1117)),
    'mt_electronics': dict(sheet=HARDW, box=(55, 710, 580, 1200)),
    'dt_police': dict(sheet=CIVIC, box=(422, 535, 1012, 978)),
    'dt_cityhall': dict(sheet=CIVIC, box=(1063, 535, 1512, 978)),
}
# key: sheet, [(source triangle, game triangle in tiles from the block's corner)]
PLAZAS = {
    'dt_plaza1': dict(sheet=VELL, tris=[(((1295, 90), (1755, 90), (1295, 465)), ((0, 0), (15, 0), (0, 14))),
                                        (((1812, 345), (1812, 692), (1500, 692)), ((22, 6), (22, 20), (7, 20)))]),
    'dt_plaza2': dict(sheet=CIVIC, tris=[(((603, 45), (912, 45), (603, 345)), ((0, 0), (17, 0), (0, 16))),
                                         (((1010, 155), (1010, 468), (718, 468)), ((24, 6), (24, 22), (7, 22)))]),
    'dt_plaza3': dict(sheet=CIVIC, tris=[(((28, 546), (338, 546), (28, 862)), ((0, 0), (15, 0), (0, 14))),
                                         (((392, 690), (392, 968), (158, 968)), ((22, 6), (22, 20), (7, 20)))]),
}


def find_src(name):
    for d in (SRC, '/mnt/user-data/uploads'):
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


# ----------------------------------------------------------------------------- seam carving
def _energy(a):
    g = a.astype(np.float32).mean(-1)
    gx = np.abs(np.diff(g, axis=1, append=g[:, -1:]))
    gy = np.abs(np.diff(g, axis=0, append=g[-1:, :]))
    e = gx + gy
    # blur a touch so seams keep clear of edges instead of threading between them
    from scipy import ndimage
    return ndimage.uniform_filter(e, 3)


def _seam(e):
    """Lowest-energy top-to-bottom seam: one column index per row."""
    H, W = e.shape
    M = e.copy()
    back = np.zeros((H, W), np.int16)
    for y in range(1, H):
        prev = M[y - 1]
        l = np.concatenate(([np.inf], prev[:-1]))
        r = np.concatenate((prev[1:], [np.inf]))
        stack = np.stack([l, prev, r])
        k = np.argmin(stack, 0)
        M[y] += stack[k, np.arange(W)]
        back[y] = k - 1
    s = np.zeros(H, np.int32)
    s[-1] = int(np.argmin(M[-1]))
    for y in range(H - 1, 0, -1):
        s[y - 1] = s[y] + back[y, s[y]]
    return np.clip(s, 0, W - 1)


def carve_width(a, target):
    """Change the width of an HxWx3 array to `target` by removing / duplicating seams."""
    H, W, _ = a.shape
    if target == W:
        return a
    if target < W:
        for _ in range(W - target):
            s = _seam(_energy(a))
            keep = np.ones(a.shape[:2], bool)
            keep[np.arange(H), s] = False
            a = a[keep].reshape(H, a.shape[1] - 1, 3)
        return a
    # insertion: find the k cheapest seams on a shrinking copy (tracking original columns), then
    # duplicate them all at once (each new column the average of its neighbours)
    k = target - W
    idx = np.tile(np.arange(W), (H, 1))
    work = a.copy()
    seams = []
    for _ in range(k):
        s = _seam(_energy(work))
        seams.append(idx[np.arange(H), s])
        keep = np.ones(work.shape[:2], bool)
        keep[np.arange(H), s] = False
        work = work[keep].reshape(H, work.shape[1] - 1, 3)
        idx = idx[keep].reshape(H, idx.shape[1] - 1)
    dup = np.zeros((H, W), np.int32)
    for s in seams:
        dup[np.arange(H), s] += 1
    out = np.zeros((H, target, 3), a.dtype)
    for y in range(H):
        row, d = a[y], dup[y]
        reps = 1 + d
        o = np.repeat(row, reps, axis=0).astype(np.float32)
        # blend the duplicates with the next column so they don't read as stripes
        pos = np.cumsum(reps) - 1
        nxt = np.vstack([row[1:], row[-1:]]).astype(np.float32)
        for j in np.nonzero(d)[0]:
            for t in range(1, d[j] + 1):
                o[pos[j] - d[j] + t] = row[j] * (1 - t / (d[j] + 1)) + nxt[j] * (t / (d[j] + 1))
        out[y] = o[:target]
    return out


def retarget(img, W, H):
    """Fit a painted block to W x H world px: uniform scale, then seam carving for the rest."""
    w, h = img.size
    s = ((W / w) * (H / h)) ** 0.5
    sw, sh = max(1, round(w * s)), max(1, round(h * s))
    a = np.asarray(img.convert('RGB').resize((sw, sh), Image.LANCZOS))
    a = carve_width(a, W)
    a = carve_width(a.transpose(1, 0, 2), H).transpose(1, 0, 2)
    return Image.fromarray(np.ascontiguousarray(a)).filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=2))


# ----------------------------------------------------------------------------- plazas
def warp_tri(src, s_tri, d_tri, size):
    """Warp source triangle s_tri onto destination triangle d_tri (px) in a size canvas (RGBA)."""
    # affine (dest -> source) for PIL: x_s = a*x + b*y + c, y_s = d*x + e*y + f
    A = np.array([[x, y, 1] for x, y in d_tri], np.float64)
    bx = np.array([p[0] for p in s_tri], np.float64)
    by = np.array([p[1] for p in s_tri], np.float64)
    a, b, c = np.linalg.solve(A, bx)
    d, e, f = np.linalg.solve(A, by)
    out = src.convert('RGBA').transform(size, Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)
    mask = Image.new('L', size, 0)
    # a little past the edge so the two halves and the road's curb overlap without a gap
    cx, cy = sum(p[0] for p in d_tri) / 3, sum(p[1] for p in d_tri) / 3
    grown = [(x + (x - cx) * 0.03, y + (y - cy) * 0.03) for x, y in d_tri]
    ImageDraw.Draw(mask).polygon(grown, fill=255)
    out.putalpha(mask)
    return out


# ----------------------------------------------------------------------------- signs
def repaint_sign(img, box, lines, fg, bg=None, pad=0.12):
    """Paint over a sign's lettering (box in source px) with the shop's real name."""
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(img)
    if bg is None:
        a = np.asarray(img.crop(box).convert('RGB')).reshape(-1, 3)
        # the panel colour: the most common darkish colour on it
        q = (a // 16) * 16
        vals, counts = np.unique(q, axis=0, return_counts=True)
        bg = tuple(int(v) + 8 for v in vals[np.argmax(counts)])
    d.rectangle(box, fill=bg)
    W, H = x1 - x0, y1 - y0
    S = 4  # draw big, then shrink: crisp, anti-aliased letters
    big = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(big)
    lh = (H * S * (1 - 2 * pad)) / len(lines)
    for i, ln in enumerate(lines):
        size = int(lh * 1.05)
        while size > 6:
            font = ImageFont.truetype(FONT, size)
            l, t, r, b = bd.textbbox((0, 0), ln, font=font)
            if r - l <= W * S * (1 - 2 * pad * 0.6) and b - t <= lh * 0.92:
                break
            size -= 2
        l, t, r, b = bd.textbbox((0, 0), ln, font=font)
        tx = (W * S - (r - l)) / 2 - l
        ty = H * S * pad + i * lh + (lh - (b - t)) / 2 - t
        bd.text((tx + S, ty + S), ln, font=font, fill=(0, 0, 0, 140))
        bd.text((tx, ty), ln, font=font, fill=fg)
    small = big.resize((W, H), Image.LANCZOS)
    img.paste(small, (x0, y0), small)
    return img


def paint_rects(img, rects):
    """Tile a clean sample over each box: (box, sample box)."""
    return paint_out(img, rects) if rects else img


# ----------------------------------------------------------------------------- night
def block_glow(art):
    """Night layer: the painting is already a dusk scene, so lit windows, shop signs and lamp heads
    are its bright warm and neon pixels - keep those (and a soft halo), nothing else."""
    a = np.asarray(art.convert('RGB'), np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    v = a.max(-1)
    s = (v - a.min(-1)) / np.maximum(v, 1e-3)
    warm = (r > 0.82) & (g > 0.62) & (b < 0.62) & (s > 0.3)
    neon = (s > 0.62) & (v > 0.8)
    m = ndimage.binary_opening(warm | neon, np.ones((2, 2)))
    out = np.where(m[..., None], a, 0)
    halo = np.stack([ndimage.gaussian_filter(out[..., k], 5) for k in range(3)], -1)
    res = np.clip(out * 0.75 + halo * 0.9, 0, 1)
    res *= (np.asarray(art.getchannel('A'), np.float32) / 255)[..., None]
    return Image.fromarray((res * 255).astype(np.uint8), 'RGB')


def find_lamps(art, rects):
    """Painted street lamps: small, round, very bright warm blobs out on the pavement (lit
    windows are inside the buildings' footprints and don't count). Returns lamp heads (px)."""
    a = np.asarray(art.convert('RGB'), np.float32)
    al = np.asarray(art.getchannel('A'))
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hot = (r >= 248) & (g >= 180) & (b <= 120) & (al > 0)
    for x, y, w, h in rects:
        hot[y * TILE:(y + h) * TILE, x * TILE:(x + w) * TILE] = False
    # a lit lamp has a white-hot core inside its yellow glow (yellow curb pads and flowers don't)
    core = (r >= 246) & (g >= 232) & (b >= 130)
    lab, n = ndimage.label(ndimage.binary_dilation(hot, np.ones((3, 3))))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        hgt, wid = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        blob = lab[sl] == i + 1
        area = int(blob.sum())
        if area < 8 or area > 300 or wid > 28 or hgt > 28:
            continue
        if int((core[sl] & ndimage.binary_dilation(blob, np.ones((5, 5)))).sum()) < 2:
            continue
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        if any(abs(cx - x) < 26 and abs(cy - y) < 26 for x, y in out):
            continue
        out.append((round(cx), round(cy)))
    return out


# ----------------------------------------------------------------------------- main
def road_mask(info, W, H):
    m = Image.new('L', (W, H), 255)
    d = ImageDraw.Draw(m)
    for j, row in enumerate(info['road']):
        for i, c in enumerate(row):
            if c == '1':
                d.rectangle([i * TILE, j * TILE, (i + 1) * TILE - 1, (j + 1) * TILE - 1], fill=0)
    return m


def preview(img, key, info):
    g = img.convert('RGBA').copy()
    d = ImageDraw.Draw(g)
    W, H = g.size
    for x in range(0, W + 1, TILE):
        d.line([(x, 0), (x, H)], fill=(0, 255, 255, 110) if x % (TILE * 5) else (255, 0, 255, 200))
    for y in range(0, H + 1, TILE):
        d.line([(0, y), (W, y)], fill=(0, 255, 255, 110) if y % (TILE * 5) else (255, 0, 255, 200))
    for i in range(0, W // TILE + 1, 5):
        d.text((i * TILE + 2, 2), str(i), fill=(255, 255, 0, 255))
    for j in range(0, H // TILE + 1, 5):
        d.text((2, j * TILE + 2), str(j), fill=(255, 255, 0, 255))
    g.save(os.path.join(PREVIEW, f'{key}.png'))


def main():
    mask = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'hand-mask.mjs')], cwd=ROOT))
    sheets = {}
    def sheet(n):
        if n not in sheets:
            sheets[n] = Image.open(find_src(n)).convert('RGB')
        return sheets[n]
    items, glows, meta = [], {}, {}
    for key, info in mask.items():
        tw, th = info['area'][2], info['area'][3]
        W, H = tw * TILE, th * TILE
        if key in BLOCKS:
            spec = BLOCKS[key]
            src = sheet(spec['sheet']).copy()
            src = paint_rects(src, spec.get('paint', []))
            for sg in spec.get('signs', []):
                src = repaint_sign(src, *sg)
            art = retarget(src.crop(spec['box']), W, H).convert('RGBA')
        elif key in PLAZAS:
            spec = PLAZAS[key]
            src = sheet(spec['sheet']).copy()
            src = paint_rects(src, spec.get('paint', []))
            art = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            for s_tri, d_tri in spec['tris']:
                piece = warp_tri(src, s_tri, [(x * TILE, y * TILE) for x, y in d_tri], (W, H))
                art = Image.alpha_composite(art, piece)
        else:
            print('  (no art for', key, '- skipped)')
            continue
        # the game's streets show through where the art had road
        rm = road_mask(info, W, H)
        al = np.minimum(np.asarray(art.getchannel('A')), np.asarray(rm))
        art.putalpha(Image.fromarray(al))
        print('  block', key, tw, th)
        items.append((key, art))
        glows[key] = block_glow(art)
        lamps = find_lamps(art, info.get('buildings', []))
        # the post's foot stands about a tile below its lamp head
        meta[key] = {'tw': tw, 'th': th, 'lamps': [[x, min(H - 4, y + 34), x, y] for x, y in lamps]}
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            preview(art, key, info)
            pv = Image.open(os.path.join(PREVIEW, f'{key}.png'))
            d = ImageDraw.Draw(pv)
            for x, y in lamps:
                d.ellipse([x - 9, y - 9, x + 9, y + 9], outline=(255, 0, 0, 255), width=3)
            pv.save(os.path.join(PREVIEW, f'{key}.png'))
    frames, packed = shelf_pack(items, width=2048)
    for i, sh in enumerate(packed):
        sh.save(os.path.join(ASSETS, f'blocks{i}.webp'), quality=92, method=6)
        gl = Image.new('RGB', sh.size, (0, 0, 0))
        for k, f in frames.items():
            if f['a'] == i:
                gl.paste(glows[k], (f['x'], f['y']))
        gl.save(os.path.join(ASSETS, f'blocks{i}_glow.webp'), quality=85, method=6)
    for k, f in frames.items():
        meta[k]['src'] = [f['a'], f['x'], f['y'], f['w'], f['h']]
    js = ('// GENERATED by tools/build_blocks.py - do not edit by hand.\n'
          '// Hand-designed blocks (shared/handblocks.js) cut from the designer\'s paintings and fitted\n'
          '// to their block: src is [sheet, x, y, w, h] inside assets/blocks<sheet>.webp, 1 art px per world px.\n'
          f'export const BLOCK_SHEETS = {len(packed)};\n'
          f'export const BLOCK_ART = {json.dumps(meta)};\n')
    with open(os.path.join(ROOT, 'shared', 'block-data.js'), 'w') as f:
        f.write(js)
    print('blocks', len(meta), 'sheets', len(packed))


if __name__ == '__main__':
    main()
