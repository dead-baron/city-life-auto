# World v3b: draw every regional place (tools/world3b/regions.mjs) over the owner's map in frame tiles
# (docs/world-v3b/frame-grid-all.png, 4 tiles a pixel) -> docs/world-v3b/regions-plan.png (2 tiles a pixel).
#   node tools/world3b/regions.mjs > plan.json && python3 tools/world3b/regions_plan.py plan.json
import json, sys
from PIL import Image, ImageDraw

plan = json.load(open(sys.argv[1]))
base = Image.open('docs/world-v3b/frame-grid-all.png').convert('RGB')
S = 2   # tiles a pixel in the output
im = base.resize((base.size[0] * 2, base.size[1] * 2), Image.NEAREST)
d = ImageDraw.Draw(im)
f = lambda x, y: (x / S, y / S)
COL = {'town': (200, 0, 160), 'street': (255, 255, 255), 'road': (120, 40, 0), 'place': (230, 0, 0), 'relief': (120, 60, 20),
       'water': (0, 40, 160), 'wild': (0, 90, 0), 'moved': (0, 140, 140), 'track': (150, 90, 30), 'airstrip': (60, 60, 60),
       'skeleton-town': (0, 0, 0), 'landmark': (255, 220, 0)}
for o in plan:
    c = COL.get(o['group'], (255, 0, 0))
    if o['kind'] == 'box':
        a, b, cc, dd = o['b']; d.rectangle([f(a, b), f(cc, dd)], outline=c, width=2)
    elif o['kind'] == 'line':
        d.line([f(x, y) for x, y in o['pts']], fill=c, width=3 if o['group'] == 'road' else 2)
for o in plan:
    if o['kind'] != 'pt': continue
    c = COL.get(o['group'], (255, 0, 0)); x, y = f(*o['p']); r = 5 if o['group'] in ('skeleton-town', 'landmark') else 3
    d.ellipse([x - r, y - r, x + r, y + r], fill=c, outline=(0, 0, 0))
    if o['group'] in ('skeleton-town', 'landmark', 'wild', 'moved'):
        d.text((x + 6, y - 6), o['name'], fill=(0, 0, 0))
im.save('docs/world-v3b/regions-plan.png')
print(im.size)
