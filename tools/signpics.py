#!/usr/bin/env python3
"""tools/signpics.py - the hanging picture signs' pictures (the owner's pick of 11-26, report-92: today's name boards
and, on some shops, a picture sign hung out over the front - after the concept BF2).

Each picture is 14 x 14 at the art pixel, drawn here with a few shapes in a fixed palette and written out as rows of
palette letters ('.' clear) - the table client/art2/signfont.js PICS holds (paste what this prints between its marks).

  python3 tools/signpics.py [SHEET.png]      # prints the table; a sheet of them, eight times up, if a path is given
"""
import sys
from PIL import Image, ImageDraw

PAL = {'k': (16, 19, 28), 'w': (250, 248, 240), 'c': (243, 234, 210), 'g': (150, 156, 170), 'd': (90, 96, 110), 'r': (214, 60, 60), 'R': (150, 36, 44),
       'o': (226, 160, 74), 'O': (112, 60, 36), 'y': (226, 189, 87), 'Y': (168, 126, 44), 'G': (96, 176, 80), 'n': (40, 110, 62), 'b': (84, 156, 226),
       'B': (38, 92, 168), 'p': (240, 130, 170), 'u': (150, 100, 220), 's': (200, 230, 255)}
C = {k: v + (255,) for k, v in PAL.items()}
# the ground each hangs on (the sign's panel), by picture
GROUND = {'book': 'n', 'cup': 'O', 'burger': 'c', 'balls': 'k', 'record': 'c', 'washer': 'B', 'pole': 'c', 'bottle': 'c', 'glass': 'k', 'apple': 'c', 'plate': 'R',
          'dress': 'c', 'hammer': 'c', 'palette': 'k', 'flower': 'c', 'pretzel': 'c', 'cross': 'w', 'sight': 'k', 'bag': 'c', 'fish': 'B', 'ring': 'k'}

def draw(kind):
    im = Image.new('RGBA', (14, 14), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    P = lambda x, y, c: im.putpixel((x, y), C[c])
    L = lambda pts, c: d.line(pts, fill=C[c])
    if kind == 'book':
        d.polygon([(0, 3), (6, 4), (6, 12), (0, 11)], fill=C['c'], outline=C['k']); d.polygon([(13, 3), (7, 4), (7, 12), (13, 11)], fill=C['w'], outline=C['k'])
        for y in (6, 8): L([(2, y), (4, y)], 'd'); L([(9, y), (11, y)], 'd')
        L([(6, 3), (7, 3)], 'k'); L([(1, 12), (12, 12)], 'R')
    elif kind == 'cup':
        d.rectangle([3, 5, 9, 10], fill=C['w'], outline=C['k']); L([(4, 6), (8, 6)], 'O'); d.arc([8, 6, 12, 10], -90, 90, fill=C['w']); L([(1, 12), (11, 12)], 'c'); L([(2, 11), (10, 11)], 'w')
        for x in (5, 7): P(x, 3, 'c'); P(x + 1, 2, 'c'); P(x, 1, 'c')
    elif kind == 'burger':
        d.pieslice([1, 1, 12, 12], 180, 360, fill=C['o'], outline=C['k']); L([(1, 7), (12, 7)], 'G'); L([(2, 8), (11, 8)], 'y')
        d.rectangle([1, 9, 12, 10], fill=C['O']); d.rectangle([1, 11, 12, 12], fill=C['o']); L([(1, 13), (12, 13)], 'k')
        for x, y in ((4, 3), (7, 2), (9, 4)): P(x, y, 'c')
    elif kind == 'balls':
        L([(3, 1), (10, 1)], 'y'); L([(6, 1), (6, 4)], 'y'); L([(7, 1), (7, 4)], 'y')
        for cx, cy in ((3, 5), (10, 5), (6, 9)): d.ellipse([cx - 2, cy - 1, cx + 2, cy + 3], fill=C['y'], outline=C['Y']); P(cx - 1, cy, 'c')
    elif kind == 'record':
        d.ellipse([0, 0, 13, 13], fill=C['k']); d.arc([2, 2, 11, 11], 200, 290, fill=C['d']); d.arc([3, 3, 10, 10], 20, 100, fill=C['d'])
        d.ellipse([4, 4, 9, 9], fill=C['r']); d.rectangle([6, 6, 7, 7], fill=C['c'])
    elif kind == 'washer':
        d.rectangle([1, 0, 12, 13], fill=C['w'], outline=C['k']); L([(2, 3), (11, 3)], 'g'); P(3, 2, 'r'); P(5, 2, 'b'); L([(8, 2), (10, 2)], 'd')
        d.ellipse([3, 5, 10, 12], fill=C['b'], outline=C['k']); d.arc([4, 6, 9, 11], 180, 300, fill=C['s'])
    elif kind == 'pole':
        d.rectangle([4, 0, 9, 1], fill=C['y'], outline=C['k']); d.rectangle([4, 12, 9, 13], fill=C['y'], outline=C['k'])
        for y in range(2, 12):
            for x in range(5, 9): k = (x + y) % 6; P(x, y, 'r' if k < 2 else 'w' if k < 4 else 'B')
        L([(4, 2), (4, 11)], 'k'); L([(9, 2), (9, 11)], 'k')
    elif kind == 'bottle':
        d.rectangle([6, 0, 7, 1], fill=C['y']); d.rectangle([6, 2, 7, 4], fill=C['n'], outline=None); d.polygon([(6, 4), (7, 4), (9, 7), (9, 13), (4, 13), (4, 7)], fill=C['n'], outline=C['k'])
        d.rectangle([5, 8, 8, 11], fill=C['c']); L([(6, 9), (7, 9)], 'R'); L([(5, 2), (5, 4)], 'k'); L([(8, 2), (8, 4)], 'k')
    elif kind == 'glass':
        d.polygon([(1, 1), (12, 1), (7, 7), (6, 7)], fill=C['s'], outline=C['c']); L([(3, 3), (10, 3)], 'r'); L([(6, 7), (6, 11)], 'c'); L([(7, 7), (7, 11)], 'c'); L([(3, 12), (10, 12)], 'c')
        P(9, 0, 'G'); P(10, 0, 'G'); P(10, 1, 'G')
    elif kind == 'apple':
        d.ellipse([1, 3, 12, 13], fill=C['r'], outline=C['k']); P(4, 6, 'p'); P(4, 7, 'p'); L([(6, 3), (7, 1)], 'O'); d.polygon([(8, 1), (11, 0), (10, 3)], fill=C['G']); L([(6, 4), (7, 4)], 'R')
    elif kind == 'plate':
        d.ellipse([3, 2, 10, 11], fill=C['w'], outline=C['g']); d.ellipse([5, 4, 8, 9], outline=C['g'])
        L([(1, 1), (1, 12)], 'c'); L([(0, 1), (0, 4)], 'c'); L([(2, 1), (2, 4)], 'c'); L([(12, 1), (12, 12)], 'c'); L([(13, 1), (13, 6)], 'c')
    elif kind == 'dress':
        L([(5, 0), (8, 0)], 'd'); P(6, 1, 'd'); P(7, 1, 'd'); d.polygon([(4, 2), (9, 2), (8, 6), (12, 13), (1, 13), (5, 6)], fill=C['p'], outline=C['k']); L([(5, 6), (8, 6)], 'R'); P(3, 12, 'w'); P(6, 12, 'w'); P(9, 12, 'w')
    elif kind == 'hammer':
        d.rectangle([1, 1, 10, 4], fill=C['g'], outline=C['k']); d.rectangle([10, 2, 12, 3], fill=C['d']); d.rectangle([5, 5, 7, 13], fill=C['o'], outline=C['k']); L([(2, 2), (9, 2)], 'w')
    elif kind == 'palette':
        d.ellipse([0, 2, 13, 12], fill=C['o'], outline=C['Y']); d.ellipse([8, 7, 10, 9], fill=C['k'])
        for x, y, c in ((3, 5, 'r'), (6, 4, 'y'), (9, 4, 'b'), (3, 8, 'G'), (5, 10, 'u')): d.rectangle([x, y, x + 1, y + 1], fill=C[c])
    elif kind == 'flower':
        for dx, dy in ((0, -3), (3, -1), (2, 3), (-2, 3), (-3, -1)): d.ellipse([6 + dx - 2, 5 + dy - 2, 6 + dx + 2, 5 + dy + 2], fill=C['p'], outline=C['R'])
        d.ellipse([5, 4, 8, 7], fill=C['y']); L([(6, 9), (6, 13)], 'n'); L([(7, 9), (7, 13)], 'n'); P(4, 11, 'G'); P(5, 12, 'G'); P(9, 11, 'G'); P(8, 12, 'G')
    elif kind == 'pretzel':
        d.ellipse([0, 1, 7, 9], outline=C['O']); d.ellipse([6, 1, 13, 9], outline=C['O']); d.arc([1, 4, 12, 13], 20, 160, fill=C['O'])
        d.ellipse([1, 2, 6, 8], outline=C['o']); d.ellipse([7, 2, 12, 8], outline=C['o']); d.arc([2, 5, 11, 12], 20, 160, fill=C['o'])
        for x, y in ((2, 3), (10, 3), (6, 10), (4, 9), (9, 9)): P(x, y, 'w')
    elif kind == 'cross':
        d.rectangle([5, 1, 8, 12], fill=C['n']); d.rectangle([1, 5, 12, 8], fill=C['n']); L([(6, 2), (6, 11)], 'G'); L([(2, 6), (11, 6)], 'G')
    elif kind == 'sight':
        d.ellipse([1, 1, 12, 12], outline=C['c']); L([(6, 0), (6, 4)], 'c'); L([(7, 0), (7, 4)], 'c'); L([(6, 9), (6, 13)], 'c'); L([(7, 9), (7, 13)], 'c'); L([(0, 6), (4, 6)], 'c'); L([(0, 7), (4, 7)], 'c'); L([(9, 6), (13, 6)], 'c'); L([(9, 7), (13, 7)], 'c')
        d.rectangle([6, 6, 7, 7], fill=C['r'])
    elif kind == 'bag':
        d.rectangle([2, 4, 11, 13], fill=C['r'], outline=C['k']); d.arc([4, 0, 9, 7], 180, 360, fill=C['k']); L([(3, 6), (10, 6)], 'R'); d.rectangle([5, 8, 8, 10], fill=C['w'])
    elif kind == 'fish':
        d.ellipse([0, 4, 9, 10], fill=C['s'], outline=C['w']); d.polygon([(9, 7), (13, 3), (13, 11)], fill=C['s'], outline=C['w']); P(2, 6, 'k'); L([(5, 5), (5, 9)], 'b')
    elif kind == 'ring':
        d.ellipse([2, 4, 11, 13], outline=C['y']); d.ellipse([3, 5, 10, 12], outline=C['Y']); d.polygon([(5, 3), (8, 3), (9, 1), (4, 1)], fill=C['s'], outline=C['w'])
    return im

def rows(im):
    inv = {v: k for k, v in C.items()}; out = []
    for y in range(14):
        r = ''
        for x in range(14):
            p = im.getpixel((x, y)); r += '.' if p[3] < 128 else inv.get(p, 'k')
        out.append(r)
    return out

if __name__ == '__main__':
    print("export const PIC_PAL = { " + ', '.join("%s: [%d, %d, %d]" % (k, *v) for k, v in PAL.items()) + " };")
    print("export const PICS = {")
    for k in GROUND: print("  %s: ['%s', '%s']," % (k, GROUND[k], '|'.join(rows(draw(k)))))
    print("};")
    if len(sys.argv) > 1:
        ks = list(GROUND); S = 8; sh = Image.new('RGB', (len(ks) * (18 * S + 6) + 6, 18 * S + 12), (30, 30, 36))
        for i, k in enumerate(ks):
            t = Image.new('RGB', (18, 18), PAL['k']); ImageDraw.Draw(t).rectangle([1, 1, 16, 16], fill=PAL[GROUND[k]], outline=PAL['y']); p = draw(k); t.paste(p, (2, 2), p)
            sh.paste(t.resize((18 * S, 18 * S), Image.NEAREST), (6 + i * (18 * S + 6), 6))
        sh.save(sys.argv[1]); print('//', sys.argv[1], sh.size)
