#!/usr/bin/env python3
"""tools/nature/waterscore.py DIR - score the pictures tools/nature/waterwatch.sh took.
For each place: over the water's pixels (blue-green ones in the first picture), how many jump by more than 40 in
brightness from one picture to the next (flicker: sparkle that blinks, a surface that crawls too fast), how much
the water changes on average, and how much of it is near-white (blown glints, foam drawn as flat white).
Calm water moves a little; a place whose jump share is several times the others' is the one to look at."""
import sys, os, glob, re
from PIL import Image, ImageChops, ImageStat
d = sys.argv[1]
groups = {}
for f in sorted(glob.glob(os.path.join(d, '*.png'))):
    m = re.match(r'(.+)-(\d+)-(\d+)\.png$', os.path.basename(f))
    if m: groups.setdefault((m.group(1), m.group(2)), []).append(f)
print('%-10s %5s  %7s %7s %7s %7s' % ('place', 'time', 'water%', 'jump%', 'change', 'white%'))
for (name, t), fs in sorted(groups.items()):
    ims = [Image.open(f).convert('RGB') for f in fs]
    w, h = ims[0].size
    box = (0, 60, w, h - 110)   # (clear of the HUD's top and bottom rows)
    ims = [im.crop(box) for im in ims]
    r, g, b = ims[0].split()
    # water: blue over red, and not much less blue than green (grass and leaves have little blue)
    mask = ImageChops.multiply(Image.eval(ImageChops.subtract(b, r), lambda v: 255 if v > 12 else 0), Image.eval(ImageChops.subtract(g, b), lambda v: 255 if v < 40 else 0))
    n = ImageStat.Stat(mask).sum[0] / 255 or 1
    jumps, change = [], []
    for a, c in zip(ims, ims[1:]):
        df = ImageChops.difference(a.convert('L'), c.convert('L'))
        jumps.append(ImageStat.Stat(Image.eval(df, lambda v: 255 if v > 40 else 0), mask).sum[0] / 255 / n * 100)
        change.append(ImageStat.Stat(df, mask).mean[0])
    L = ims[0].convert('L')
    white = ImageStat.Stat(Image.eval(L, lambda v: 255 if v > 235 else 0), mask).sum[0] / 255 / n * 100
    print('%-10s %5s  %6.1f%% %6.2f%% %7.2f %6.2f%%' % (name, t, n / (ims[0].width * ims[0].height) * 100, min(jumps or [0]), min(change or [0]), white))   # (the least of the pairs: flicker is there in every pair; a chunk still loading or the camera settling is in one)
