#!/usr/bin/env python3
"""tools/uistyle/glyphgrid.py - the menus' pixel icons (the UI's look C, the owner's pick of 11-26).

Every line icon of the touch family (client/touchicons.js VG, client/bag.js addGlyphs: Lucide's paths on a 24 grid)
drawn on a grid of 12 x 12 - two of the line set's units to a pixel, one pixel to a line - and written back beside its
path as a bitmap (36 hex digits: 12 rows of 12 bits, the top row first). The picture is made by the browser's own path
drawing, read as coverage per cell; of the four half-pixel shifts the one with the fewest half-covered cells is kept,
so a line drawn on a cell's edge lands in one cell and not two; a dot (a stroke of no length) is a pixel of its own. A glyph in OWN below is drawn by hand and kept as it is.

  python3 tools/uistyle/glyphgrid.py OUT.json [SHEET.png]     # (reads the paths with node; needs playwright's Chromium)
  python3 tools/uistyle/glyphgrid.py OUT.json --write          # and writes the bitmaps into the two modules
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
OWN = []   # (glyphs redrawn by hand in the modules: kept as they are when the rest is made again)
G, S = 12, 8
DUMP = r"""
import * as T from './client/touchicons.js';
const n0 = T.GLYPH_NAMES.length;
try { await import('./client/bag.js'); } catch (e) {}
const out = {}; for (const n of T.GLYPH_NAMES) { const m = /<path class="ln" d="([^"]+)"\/>/.exec(T.glyph(n)) || /<path d="([^"]+)"\/>/.exec(T.glyph(n)); out[n] = m[1]; }
console.log(JSON.stringify({ base: T.GLYPH_NAMES.slice(0, n0), all: out }));
"""
RASTER = r"""
(paths) => {
  const G = 12, S = 8, cv = document.createElement('canvas'); cv.width = cv.height = G * S;
  const g = cv.getContext('2d', { willReadFrequently: true }), out = {};
  for (const [name, d] of Object.entries(paths)) {
    let best = null;
    for (const [ox, oy] of [[1, 1], [0, 0], [1, 0], [0, 1]]) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, G * S, G * S);
      g.setTransform(S / 2, 0, 0, S / 2, ox * S / 2, oy * S / 2);
      g.lineWidth = 2; g.lineCap = 'butt'; g.lineJoin = 'miter'; g.strokeStyle = '#000'; g.stroke(new Path2D(d));
      /* (a dot - the line set draws one as a stroke of no length with a round cap - is a pixel of its own) */
      g.setTransform(1, 0, 0, 1, 0, 0);
      for (const m of [...d.matchAll(/M\s*(-?[\d.]+)[ ,]?(-?[\d.]+)\s*[hv]-?0?\.0+1(?![\d])/g), ...d.matchAll(/M\s*(-?[\d.]+)[ ,]?(-?[\d.]+)\s*L\s*-?[\d]+\.01[ ,]?-?[\d.]+/g)]) {
        const cx = Math.max(0, Math.min(G - 1, Math.floor((+m[1] + ox - 0.5) / 2))), cy = Math.max(0, Math.min(G - 1, Math.floor((+m[2] + oy - 0.5) / 2)));
        g.fillRect(cx * S, cy * S, S, S);
      }
      const px = g.getImageData(0, 0, G * S, G * S).data, cov = [];
      let amb = 0, ink = 0;
      for (let cy = 0; cy < G; cy++) for (let cx = 0; cx < G; cx++) {
        let a = 0;
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) a += px[((cy * S + y) * G * S + cx * S + x) * 4 + 3];
        const c = a / (255 * S * S); cov.push(c); amb += Math.min(c, 1 - c); ink += c;
      }
      if (!best || amb < best.amb - 1e-6) best = { amb, cov, ox, oy, ink };
    }
    out[name] = { cov: best.cov.map((c) => Math.round(c * 100)), off: [best.ox, best.oy], amb: Math.round(best.amb * 10) / 10 };
  }
  return out;
}
"""

def bits(cov, th=47):
    rows = []
    for y in range(G):
        v = 0
        for x in range(G): v = (v << 1) | (1 if cov[y * G + x] >= th else 0)
        rows.append(v)
    return rows
hexof = lambda rows: ''.join('%03x' % r for r in rows)

def main():
    out = sys.argv[1]
    D = json.loads(subprocess.run(['node', '--input-type=module', '-e', DUMP], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip().split('\n')[-1])
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(); page.set_content('<html><body></body></html>')
        R = page.evaluate(RASTER, D['all']); b.close()
    res = {n: hexof(bits(r['cov'])) for n, r in R.items()}
    json.dump({'base': D['base'], 'px': res, 'amb': {n: r['amb'] for n, r in R.items()}}, open(out, 'w'))
    print(len(res), 'glyphs; the most half-covered:', sorted(((r['amb'], n) for n, r in R.items()), reverse=True)[:8])
    if '--write' in sys.argv:
        import re
        def block(names):
            lines, cur = [], '  '
            for n in names:
                item = (n if re.match(r'^[a-z][a-zA-Z0-9]*$', n) else "'" + n + "'") + ": '" + res[n] + "', "
                if len(cur) + len(item) > 150: lines.append(cur.rstrip()); cur = '  '
                cur += item
            lines.append(cur.rstrip()); return '\n'.join(lines)
        for f, names in (('client/touchicons.js', D['base']), ('client/bag.js', [n for n in res if n not in D['base']])):
            p = os.path.join(ROOT, f); t = open(p).read(); a, z = t.index('/* px:begin */'), t.index('/* px:end */')
            old = dict(re.findall(r"'?([a-zA-Z0-9-]+)'?: '([0-9a-f]{36})'", t[a:z]))
            for n in OWN:
                if n in old: res[n] = old[n]
            open(p, 'w').write(t[:a] + '/* px:begin */\n' + block(names) + '\n' + t[z:]); print('wrote', f, len(names))
    if len(sys.argv) > 2 and sys.argv[2].endswith('.png'):
        from PIL import Image, ImageDraw
        names = list(res); K = 4; cell = G * K + 14; cols = 16; rows_n = (len(names) + cols - 1) // cols
        im = Image.new('RGB', (cols * cell + 8, rows_n * (cell + 10) + 8), (17, 27, 56)); dr = ImageDraw.Draw(im)
        for i, n in enumerate(names):
            x0 = 8 + (i % cols) * cell; y0 = 8 + (i // cols) * (cell + 10); rows = [int(res[n][k * 3:k * 3 + 3], 16) for k in range(G)]
            for y in range(G):
                for x in range(G):
                    if rows[y] >> (G - 1 - x) & 1: dr.rectangle([x0 + x * K, y0 + y * K, x0 + x * K + K - 1, y0 + y * K + K - 1], fill=(243, 234, 210))
            dr.text((x0, y0 + G * K), n[:9], fill=(120, 130, 160))
        im.save(sys.argv[2]); print(sys.argv[2], im.size)

if __name__ == '__main__':
    main()
