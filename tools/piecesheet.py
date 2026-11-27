# piecesheet.py IN.json OUT.png [tile]: the clothing pictures (tools/piecesheet.mjs) as a sheet, by slot - each piece in
# a tile at the largest whole scale that fits (small pieces enlarged so they read), its name under it
import sys, json, base64
from PIL import Image, ImageDraw, ImageFont
src, out = sys.argv[1], sys.argv[2]; TILE = int(sys.argv[3]) if len(sys.argv) > 3 else 64
D = json.load(open(src)); F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 9); FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
slots = []
for o in D:
    if o['slot'] not in slots: slots.append(o['slot'])
COLS = 13; CW = TILE + 34; CH = TILE + 26
rows = sum((len([o for o in D if o['slot'] == s]) + COLS - 1) // COLS for s in slots)
im = Image.new('RGB', (COLS * CW + 12, rows * CH + len(slots) * 26 + 10), (34, 36, 44)); d = ImageDraw.Draw(im); y = 6
for s in slots:
    L = [o for o in D if o['slot'] == s]
    d.text((8, y + 2), f'{s} ({len(L)})', font=FB, fill=(240, 220, 150)); y += 26
    for k, o in enumerate(L):
        cx = 6 + (k % COLS) * CW; cy = y + (k // COLS) * CH
        d.rectangle((cx + 16, cy, cx + 16 + TILE, cy + TILE), fill=(58, 62, 74), outline=(214, 178, 90))
        if o['w']:
            sp = Image.frombytes('RGBA', (o['w'], o['h']), base64.b64decode(o['px'])); sc = max(1, min(6, (TILE - 6) // max(o['w'], o['h'])))
            if max(o['w'], o['h']) > TILE - 6: k = (TILE - 6) / max(o['w'], o['h']); sp = sp.resize((max(1, int(o['w'] * k)), max(1, int(o['h'] * k))), Image.NEAREST); o = dict(o, w=sp.width, h=sp.height); sc = 1
            sp = sp.resize((o['w'] * sc, o['h'] * sc), Image.NEAREST); im.paste(sp, (cx + 16 + (TILE - sp.width) // 2, cy + (TILE - sp.height) // 2), sp)
        else: d.text((cx + 30, cy + TILE // 2 - 6), 'none', font=F, fill=(255, 90, 90))
        nm = o['name']; nm = nm if len(nm) <= 17 else nm[:16] + '…'
        d.text((cx + 16 + TILE // 2 - d.textlength(nm, font=F) / 2, cy + TILE + 3), nm, font=F, fill=(220, 220, 226))
    y += ((len(L) + COLS - 1) // COLS) * CH
im.save(out); print(out, im.size)
