"""Build the game's pixel font, CLA Pixel (assets/fonts/CLAPixel-Regular.woff and CLAPixel-Bold.woff).

An original 5 x 7 pixel face drawn for City Life Auto (the UI concepts, docs/art-v2/targets/U*.png, set their menus,
map labels and HUD figures in a chunky pixel type). Every glyph is a little bitmap below: '#' is a pixel. Rows run
from the top of the capitals (row 0) to the baseline (row 6); rows 7 and 8 are the descenders. A pixel is 100 font
units (1000 to the em), so at font-size 20px a pixel is 2 CSS px. Bold widens every stroke one pixel to the right.
The font is the project's own: no third-party glyphs. Needs fontTools (pip install fonttools):
    python3 tools/build-pixelfont.py
"""
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PX = 100

# rows: a list of strings, row 0 = cap height top; a glyph shorter than 7 rows starts at its 'top' row
G = {}


def g(ch, rows, top=0):
    G[ch] = (rows, top)


def grid(s):
    return [r for r in s.strip('\n').split('\n')]


# ---- capitals ----------------------------------------------------------------------------------------------------
CAPS = {
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
    'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.',
    'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
    'E': '#####|#....|#....|####.|#....|#....|#####',
    'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####',
    'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '###|.#.|.#.|.#.|.#.|.#.|###',
    'J': '..###|...#.|...#.|...#.|#..#.|#..#.|.##..',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
    'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
    'N': '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
    'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
    'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.####|#....|#....|.###.|....#|....#|####.',
    'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
    'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
    'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
    'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
}
DIGITS = {
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
    '1': '.#.|##.|.#.|.#.|.#.|.#.|###',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
    '3': '####.|....#|....#|.###.|....#|....#|####.',
    '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
    '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
    '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
    '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
}
# lowercase: 9 rows (ascender row 0 .. baseline row 6, descenders 7-8)
LOWER = {
    'a': '.....|.....|.###.|....#|.####|#...#|.####',
    'b': '#....|#....|####.|#...#|#...#|#...#|####.',
    'c': '.....|.....|.###.|#....|#....|#....|.###.',
    'd': '....#|....#|.####|#...#|#...#|#...#|.####',
    'e': '.....|.....|.###.|#...#|#####|#....|.###.',
    'f': '..##|.#..|####|.#..|.#..|.#..|.#..',
    'g': '.....|.....|.####|#...#|#...#|#...#|.####|....#|.###.',
    'h': '#....|#....|####.|#...#|#...#|#...#|#...#',
    'i': '#|.|#|#|#|#|#',
    'j': '..#|...|..#|..#|..#|..#|..#|#.#|.#.',
    'k': '#...|#...|#..#|#.#.|##..|#.#.|#..#',
    'l': '#|#|#|#|#|#|#',
    'm': '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#.#.#',
    'n': '.....|.....|####.|#...#|#...#|#...#|#...#',
    'o': '.....|.....|.###.|#...#|#...#|#...#|.###.',
    'p': '.....|.....|####.|#...#|#...#|#...#|####.|#....|#....',
    'q': '.....|.....|.####|#...#|#...#|#...#|.####|....#|....#',
    'r': '....|....|#.##|##..|#...|#...|#...',
    's': '.....|.....|.####|#....|.###.|....#|####.',
    't': '.#..|.#..|####|.#..|.#..|.#..|..##',
    'u': '.....|.....|#...#|#...#|#...#|#...#|.####',
    'v': '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
    'w': '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
    'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
    'y': '.....|.....|#...#|#...#|#...#|#...#|.####|....#|.###.',
    'z': '.....|.....|#####|...#.|..#..|.#...|#####',
}
PUNCT = {
    '!': '#|#|#|#|#|.|#',
    '"': '#.#|#.#',
    '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
    '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
    '%': '##..#|##.#.|...#.|..#..|.#...|.#.##|#..##',
    '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
    "'": '#|#',
    '(': '..#|.#.|#..|#..|#..|.#.|..#',
    ')': '#..|.#.|..#|..#|..#|.#.|#..',
    '*': '.....|..#..|#.#.#|.###.|#.#.#|..#..|.....',
    '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    ',': '.....|.....|.....|.....|.....|.#|.#|#.',
    '-': '....|....|....|####',
    '.': '.|.|.|.|.|.|#',
    '/': '....#|...#.|...#.|..#..|.#...|.#...|#....',
    ':': '.|.|#|.|.|.|#',
    ';': '..|..|.#|..|..|..|.#|#.',
    '<': '...#|..#.|.#..|#...|.#..|..#.|...#',
    '=': '.....|.....|#####|.....|#####',
    '>': '#...|.#..|..#.|...#|..#.|.#..|#...',
    '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
    '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.###.',
    '[': '###|#..|#..|#..|#..|#..|###',
    '\\': '#....|.#...|.#...|..#..|...#.|...#.|....#',
    ']': '###|..#|..#|..#|..#|..#|###',
    '^': '..#..|.#.#.|#...#',
    '_': '.....|.....|.....|.....|.....|.....|.....|#####',
    '`': '#.|.#',
    '{': '..#|.#.|.#.|#..|.#.|.#.|..#',
    '|': '#|#|#|#|#|#|#|#|#',
    '}': '#..|.#.|.#.|..#|.#.|.#.|#..',
    '~': '.....|.....|.#...|#.#.#|...#.',
    # extras the UI writes
    '·': '.|.|.|#',                         # middle dot
    '–': '.....|.....|.....|#####',          # en dash
    '—': '.......|.......|.......|#######',  # em dash
    '…': '.....|.....|.....|.....|.....|.....|#.#.#',
    '×': '.....|#...#|.#.#.|..#..|.#.#.|#...#',
    '’': '#|#', '‘': '#|#', '“': '#.#|#.#', '”': '#.#|#.#',
    '★': '...#...|...#...|#######|.#####.|..###..|.##.##.|.#...#.',   # star
    '▶': '#....|##...|###..|####.|###..|##...|#....',
    '◀': '....#|...##|..###|.####|..###|...##|....#',
    '▲': '.....|.....|..#..|.###.|#####',
    '▼': '.....|.....|#####|.###.|..#..',
    '✕': '.....|#...#|.#.#.|..#..|.#.#.|#...#',
    '✖': '.....|#...#|.#.#.|..#..|.#.#.|#...#',
    '£': '..##.|.#..#|.#...|####.|.#...|.#...|#####',
    '€': '..###|.#...|####.|.#...|####.|.#...|..###',
    '°': '.#.|#.#|.#.',
}
for d in (CAPS, DIGITS, LOWER, PUNCT):
    for ch, s in d.items():
        G[ch] = (s.split('|'), 0)


def bold(rows):
    w = max(len(r) for r in rows)
    out = []
    for r in rows:
        r = r.ljust(w, '.')
        out.append(''.join('#' if (i < w and r[i] == '#') or (i > 0 and r[i - 1] == '#') else '.' for i in range(w + 1)))
    return out


def glyph_rects(rows):
    """Pixel rows -> rectangles (x0, y0, x1, y1) in font units: runs of a row, merged down while identical."""
    runs = []
    for r, row in enumerate(rows):
        x = 0
        while x < len(row):
            if row[x] == '#':
                x0 = x
                while x < len(row) and row[x] == '#':
                    x += 1
                runs.append([r, x0, x])
            else:
                x += 1
    rects = []
    open_ = {}
    for r, x0, x1 in runs:
        k = (x0, x1)
        if k in open_ and open_[k][1] == r - 1:
            open_[k][1] = r
        else:
            if k in open_:
                rects.append((k, open_[k]))
            open_[k] = [r, r]
    rects += [(k, v) for k, v in open_.items()]
    out = []
    for (x0, x1), (r0, r1) in rects:
        # row r covers y from (6 - r) * PX to (7 - r) * PX (row 6 sits on the baseline)
        out.append((x0 * PX, (6 - r1) * PX, x1 * PX, (7 - r0) * PX))
    return out


def build(style):
    names = ['.notdef', 'space'] + [f'uni{ord(c):04X}' for c in G]
    cmap = {32: 'space'}
    glyphs, metrics = {}, {}
    pen = TTGlyphPen(None)
    for r in ((50, 0, 450, 700),):
        pen.moveTo((r[0], r[1])); pen.lineTo((r[0], r[3])); pen.lineTo((r[2], r[3])); pen.lineTo((r[2], r[1])); pen.closePath()
    glyphs['.notdef'] = pen.glyph(); metrics['.notdef'] = (600, 50)
    glyphs['space'] = TTGlyphPen(None).glyph(); metrics['space'] = (400 if style == 'Regular' else 500, 0)
    for ch, (rows, top) in G.items():
        name = f'uni{ord(ch):04X}'
        cmap[ord(ch)] = name
        if style == 'Bold':
            rows = bold(rows)
        w = max(len(r) for r in rows)
        pen = TTGlyphPen(None)
        rects = glyph_rects(rows)
        for x0, y0, x1, y1 in rects:
            pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0)); pen.closePath()
        glyphs[name] = pen.glyph()
        metrics[name] = ((w + 1) * PX, min((r[0] for r in rects), default=0))
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': 'CLA Pixel', 'styleName': style, 'uniqueFontIdentifier': f'CLAPixel-{style}', 'fullName': f'CLA Pixel {style}',
                       'psName': f'CLAPixel-{style}', 'version': 'Version 1.000', 'copyright': 'City Life Auto - an original pixel face drawn for the game'})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0, usWinAscent=800, usWinDescent=200, sxHeight=500, sCapHeight=700,
                usWeightClass=700 if style == 'Bold' else 400, fsSelection=0x20 if style == 'Bold' else 0x40)
    fb.setupPost()
    fb.font['head'].macStyle = 1 if style == 'Bold' else 0
    fb.font.flavor = 'woff'
    out = os.path.join(ROOT, 'assets', 'fonts', f'CLAPixel-{style}.woff')
    fb.save(out)
    print(out, os.path.getsize(out), 'bytes', len(G), 'glyphs')


for st in ('Regular', 'Bold'):
    build(st)
