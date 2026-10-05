"""Art v2: derive a first master palette from the approved target images.

Samples every target in docs/art-v2/targets (R1-*), clusters the colours in CIELAB space
(k-means, k=64 by default), then groups the result into hue families sorted dark to light.
Writes docs/art-v2/palette-v0.json and a swatch sheet docs/art-v2/palette-v0.png.

    python3 tools/art2/extract_palette.py [k]
"""
import json, sys, glob, colorsys
import numpy as np
from PIL import Image, ImageDraw
from sklearn.cluster import KMeans

K = int(sys.argv[1]) if len(sys.argv) > 1 else 64
ROOT = 'docs/art-v2'

def srgb_to_lab(rgb):
    c = rgb / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], 1)

files = sorted(glob.glob(f'{ROOT}/targets/R1-*.png'))
px = []
rng = np.random.default_rng(1)
for f in files:
    im = np.asarray(Image.open(f).convert('RGB'), dtype=np.float64)
    if 'palette' in f:                       # skip the AI-drawn swatch rows; keep the material samples
        im = im[int(im.shape[0] * 0.31):]
    a = im.reshape(-1, 3)
    px.append(a[rng.choice(len(a), min(len(a), 120000), replace=False)])
px = np.concatenate(px)
lab = srgb_to_lab(px)
km = KMeans(n_clusters=K, n_init=4, random_state=0).fit(lab)
cent = np.array([px[km.labels_ == i].mean(0) for i in range(K)])
count = np.bincount(km.labels_, minlength=K)

FAMILIES = [('neutral', None), ('red', (345, 15)), ('orange', (15, 40)), ('yellow', (40, 70)), ('green', (70, 165)),
            ('cyan', (165, 200)), ('blue', (200, 255)), ('violet', (255, 300)), ('magenta', (300, 345))]
def family(c):
    h, l, s = colorsys.rgb_to_hls(*(c / 255))
    if s < 0.16 or (max(c) - min(c)) < 22: return 'neutral'
    hd = h * 360
    for name, rg in FAMILIES[1:]:
        lo, hi = rg
        if (lo <= hd < hi) if lo < hi else (hd >= lo or hd < hi): return name
    return 'neutral'
groups = {n: [] for n, _ in FAMILIES}
for c, n in zip(cent, count):
    groups[family(c)].append((float(colorsys.rgb_to_hls(*(c / 255))[1]), c, int(n)))
out = {}
for k in groups: groups[k].sort(key=lambda t: t[0]); out[k] = ['#%02x%02x%02x' % tuple(int(round(v)) for v in c) for _, c, _ in groups[k]]
json.dump({'source': [f.split('/')[-1] for f in files], 'k': K, 'families': out}, open(f'{ROOT}/palette-v0.json', 'w'), indent=1)

S = 40
rows = [k for k in out if out[k]]
W = 120 + S * max(len(out[k]) for k in rows)
img = Image.new('RGB', (W, S * len(rows) + 10), (40, 40, 44))
d = ImageDraw.Draw(img)
for r, k in enumerate(rows):
    d.text((8, r * S + 14), k, fill=(220, 220, 220))
    for i, hx in enumerate(out[k]):
        d.rectangle([110 + i * S, r * S + 4, 110 + i * S + S - 4, r * S + S], fill=hx)
img.save(f'{ROOT}/palette-v0.png')
print({k: len(v) for k, v in out.items()})
