#!/usr/bin/env python3
"""Compare two folders of tools/regress/shots.mjs pictures, place by place (package 5).

  python3 tools/regress/diff.py BEFORE AFTER [--min 0.5] [--out DIFFDIR]

Prints every place whose picture changed: the share of pixels that moved by more than a small tolerance, largest first,
and the box round the change (in picture px). With --out, writes a side-by-side (before | after | the change in red) for
each changed place. A place that changed and shouldn't have is the "fixed here, broke there" case: look at it first.
"""
import argparse, os, sys
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('before'); ap.add_argument('after')
ap.add_argument('--min', type=float, default=0.5, help='percent of pixels changed to report (default 0.5)')
ap.add_argument('--tol', type=int, default=24, help='per-channel difference that counts as a change (default 24)')
ap.add_argument('--out', default='')
a = ap.parse_args()
names = sorted(set(os.listdir(a.before)) & set(os.listdir(a.after)))
only = sorted(set(os.listdir(a.before)) ^ set(os.listdir(a.after)))
rows = []
for n in names:
    if not n.endswith('.png'): continue
    A = Image.open(os.path.join(a.before, n)).convert('RGB'); B = Image.open(os.path.join(a.after, n)).convert('RGB')
    if A.size != B.size: rows.append((100.0, n, 'size changed')); continue
    d = ImageChops.difference(A, B).convert('L').point(lambda v: 255 if v > a.tol else 0)
    bb = d.getbbox(); pct = 100.0 * sum(1 for v in d.getdata() if v) / (A.size[0] * A.size[1])
    if pct >= a.min:
        rows.append((pct, n, f'box {bb}'))
        if a.out:
            os.makedirs(a.out, exist_ok=True)
            W, H = A.size; C = Image.new('RGB', (W * 3, H)); C.paste(A, (0, 0)); C.paste(B, (W, 0))
            red = Image.new('RGB', (W, H), (255, 40, 40)); C.paste(Image.composite(red, B.point(lambda v: v // 3), d), (W * 2, 0))
            C.save(os.path.join(a.out, n))
rows.sort(reverse=True)
print(f'{len(names)} places compared; {len(rows)} changed (>= {a.min}%)')
for pct, n, why in rows: print(f'  {pct:6.2f}%  {n[:-4]}  {why}')
if only: print('only in one folder:', ', '.join(only))
