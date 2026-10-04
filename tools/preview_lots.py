"""Contact sheets of the scene lots as cut from the concept art (after people / car paint-out),
with a source-px grid, the crop box and the door sill line - for checking door alignment.

Usage: python3 tools/preview_lots.py <concept_dir> <out_dir> [keys...]"""
import os
import sys
from PIL import Image, ImageDraw

out_dir = sys.argv[2]
keys = [k for k in sys.argv[3:] if k != '--full']
FULL = '--full' in sys.argv
sys.argv = sys.argv[:2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_art as B  # noqa: E402

os.makedirs(out_dir, exist_ok=True)
tiles = []
for key, (sheet, box, solid, doors, ground, rot, tw) in B.SCENE_PREFABS.items():
    if keys and key not in keys:
        continue
    full = Image.open(B.find_src(sheet)).convert('RGB')
    if key in B.SCENE_PATCHES:
        full = B.paint_out(full, B.SCENE_PATCHES[key])
    if sheet in B.NPC_PAINT:
        full = B.paint_people(full, B.NPC_PAINT[sheet])
    cbox, th, sy0, sy1 = B.lot_geometry(key, box, solid, tw, full.height)
    x0, y0, x1, y1 = cbox
    m = 30
    ytop = y0 + (y1 - y0) * (0.0 if FULL else 0.45)
    ex = (max(0, int(x0) - m), max(0, int(ytop) - m), min(full.width, int(x1) + m), min(full.height, int(y1) + m))
    im = full.crop(ex)
    sc = (520 if FULL else 1040) / im.width
    im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    for gx in range((ex[0] // 20 + 1) * 20, ex[2], 20):
        X = (gx - ex[0]) * sc
        d.line([X, 0, X, im.height], fill=(0, 160, 160) if gx % 100 else (0, 255, 255))
        if gx % 100 == 0:
            d.text((X + 2, 2), str(gx), fill=(255, 255, 0))
    for gy in range((ex[1] // 20 + 1) * 20, ex[3], 20):
        Y = (gy - ex[1]) * sc
        d.line([0, Y, im.width, Y], fill=(160, 0, 160) if gy % 100 else (255, 0, 255))
        d.text((2, Y + 1), str(gy), fill=(255, 255, 0))
    u = (x1 - x0) / tw
    d.rectangle([(x0 - ex[0]) * sc, (y0 - ex[1]) * sc, (x1 - ex[0]) * sc, (y1 - ex[1]) * sc], outline=(0, 255, 0), width=2)
    dy = (y0 + sy1 * u - ex[1]) * sc
    d.line([0, dy, im.width, dy], fill=(255, 40, 40), width=2)
    for fx in doors:
        X = (x0 + fx * (x1 - x0) - ex[0]) * sc
        d.line([X, dy - 14, X, dy + 4], fill=(255, 40, 40), width=3)
    d.text((im.width - 120, 4), f'{key} {tw}x{th}', fill=(255, 80, 80))
    tiles.append((key, im))
for i in range(0, len(tiles), 4):
    group = tiles[i:i + 4]
    W = 1050
    rows = [group[:2], group[2:]] if FULL else [[t] for t in group]
    H = sum(max(t[1].height for t in r) for r in rows if r)
    sheet = Image.new('RGB', (W, H + 4), (0, 0, 0))
    y = 0
    for r in rows:
        if not r:
            continue
        x = 0
        for _, t in r:
            sheet.paste(t, (x, y))
            x += 530
        y += max(t[1].height for t in r)
    sheet.save(os.path.join(out_dir, f'lots{i // 4:02d}.png'))
    print(os.path.join(out_dir, f'lots{i // 4:02d}.png'), [k for k, _ in group])
