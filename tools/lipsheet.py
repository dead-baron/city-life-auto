# lipsheet.py IN.json OUT.png: the soft lip colour's pick sheet (tools/lipsheet.mjs) - each starting look's head at 8x
# (facing the camera, and turned a little), a row a variant; under it the same figures whole at 3x
import sys, json, base64
from PIL import Image, ImageDraw, ImageFont
D = json.load(open(sys.argv[1])); F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
tags = []; names = []
for o in D:
    if o['tag'] not in tags: tags.append(o['tag'])
    if o['name'] not in names: names.append(o['name'])
Z = 8; HW, HH = 15, 14; CW = HW * Z + 6; CH = HH * Z + 6; LW = 190
im = Image.new('RGB', (LW + len(names) * 2 * CW + 8, len(tags) * (CH + 4) + 30), (70, 74, 84)); d = ImageDraw.Draw(im)
for k, n in enumerate(names): d.text((LW + k * 2 * CW + 4, 6), n.replace('The ', ''), font=F, fill=(255, 255, 255))
for o in D:
    r = tags.index(o['tag']); c = names.index(o['name']) * 2 + o['dir']
    s = Image.frombytes('RGBA', (o['w'], o['h']), base64.b64decode(o['px'])); cx = int(o['ax'])
    h = s.crop((cx - 7, 1, cx + 8, 1 + HH)).resize((HW * Z, HH * Z), Image.NEAREST)
    im.paste(h, (LW + c * CW, 30 + r * (CH + 4)), h)
for r, t in enumerate(tags): d.text((6, 30 + r * (CH + 4) + CH // 2 - 8), t, font=F, fill=(255, 236, 170))
im.save(sys.argv[2]); print(sys.argv[2], im.size)
