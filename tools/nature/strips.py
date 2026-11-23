# strips.py out.png scale title:file.json [title:file.json ...]: rows of plant strips
import sys, json, base64
from PIL import Image, ImageDraw, ImageFont
out = sys.argv[1]; SC = int(sys.argv[2]); rows = [a.split(':', 1) for a in sys.argv[3:]]
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
data = [(t, json.load(open(f))) for t, f in rows]
import os
BG = tuple(int(v) for v in os.environ.get("BG", "112,112,116").split(","))
W = max(sum(o['w'] * SC + 12 for o in d) for _, d in data) + 12
H = sum(max(o['h'] for o in d) * SC + 34 for _, d in data) + 8
im = Image.new('RGB', (W, H), BG); dr = ImageDraw.Draw(im); y = 4
for t, d in data:
    hh = max(o['h'] for o in d) * SC
    dr.text((8, y + 2), t, font=F, fill=(255, 255, 255)); x = 8
    for o in d:
        a = Image.frombytes('RGBA', (o['w'], o['h']), base64.b64decode(o['px'])).resize((o['w'] * SC, o['h'] * SC), Image.NEAREST)
        im.paste(a, (x, y + 26 + hh - a.height), a); x += a.width + 12
    y += hh + 34
im.save(out); print(out, im.size)
