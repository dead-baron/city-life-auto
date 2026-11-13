# The touch face buttons' plain symbols (the owner's Direction A, 2026-11-12: a button whose action never changes gets a
# really simple symbol - FIRE the crosshair, ROLL the double chevron, the vehicle button an arrow into a door to get in
# or on and out of it to get off): 24 x 24, white with a 2 px near-black outline, drawn at 2x on the buttons.
# python3 tools/build-hudsymbols.py  ->  assets/ui/s-*.png (and a contact sheet in the working directory)
from PIL import Image
import os
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'ui')
import math
N = 24
def blank(): return [['.'] * N for _ in range(N)]
def rect(g, x0, y0, x1, y1, c='o'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = c
def ring(g, cx, cy, r0, r1):
    for y in range(N):
        for x in range(N):
            if r0 <= math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r1: g[y][x] = 'o'
def cross():
    g = blank(); ring(g, 12, 12, 5.0, 7.2)
    rect(g, 11, 2, 12, 7); rect(g, 11, 16, 12, 21); rect(g, 2, 11, 7, 12); rect(g, 16, 11, 21, 12); return g
def chevrons():
    g = blank()
    for ox in (3, 11):
        for i in range(8):
            rect(g, ox + i // 2 * 0 + (i if i < 4 else 7 - i) * 1, 4 + i * 2, ox + (i if i < 4 else 7 - i) + 3, 5 + i * 2)
    return g
def dot():
    g = blank(); ring(g, 12, 12, 6.0, 8.6); ring(g, 12, 12, 0, 3.2); return g
def enter():
    g = blank()
    rect(g, 15, 3, 21, 4); rect(g, 20, 3, 21, 20); rect(g, 15, 19, 21, 20); rect(g, 15, 3, 16, 6); rect(g, 15, 17, 16, 20)   # the door frame
    rect(g, 2, 11, 9, 12)                                                                      # the arrow's shaft
    for i in range(5): rect(g, 9 + i, 7 + i, 9 + i, 16 - i)                                    # its head, pointing in
    return g
def exitsym():
    # the same door, on the left this time, and the arrow leaving it to the right: out
    g = blank()
    rect(g, 2, 3, 8, 4); rect(g, 2, 3, 3, 20); rect(g, 2, 19, 8, 20); rect(g, 7, 3, 8, 6); rect(g, 7, 17, 8, 20)    # the door frame
    rect(g, 7, 11, 15, 12)                                                                     # the arrow's shaft, from inside
    for i in range(5): rect(g, 15 + i, 7 + i, 15 + i, 16 - i)                                  # its head, pointing out
    return g
def outline(g):
    solid = lambda x, y: 0 <= x < N and 0 <= y < N and g[y][x] in 'ok'
    for nb8 in (True, False):
        add = [(x, y) for y in range(N) for x in range(N) if g[y][x] == '.' and any(solid(x + dx, y + dy) for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)] + ([(-1,-1),(1,-1),(-1,1),(1,1)] if nb8 else []))]
        for x, y in add: g[y][x] = 'k'
    return g
sheet = Image.new('RGBA', (4 * 104, 104), (60, 70, 110, 255))
for i, (n, fn) in enumerate([('cross', cross), ('chev', chevrons), ('enter', enter), ('exit', exitsym)]):
    g = outline(fn()); im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    for y in range(N):
        for x in range(N):
            if g[y][x] == 'o': im.putpixel((x, y), (255, 255, 255, 255))
            elif g[y][x] == 'k': im.putpixel((x, y), (16, 16, 26, 255))
    im.save(os.path.join(OUT, f's-{n}.png')); b = im.resize((96, 96), Image.NEAREST); sheet.paste(b, (4 + i * 104, 4), b)
sheet.save('hudsymbols.png')
