// The pixel font (tools/build-pixelfont.py): bold widens every stroke a pixel to the right, so marks drawn one pixel apart
// run together - the ellipsis' three dots became a bar that read as "_" on every cut-off line (11-23). The marks that are
// their separate dots - the ellipsis, the quotes - keep them apart in bold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../tools/build-pixelfont.py', import.meta.url), 'utf8');
const glyphs = [...src.matchAll(/'(\\\\|\\'|[^'])': '([.#|]+)'/g)].map((m) => [m[1].replace(/^\\/, ''), m[2].split('|')]);
const bold = (rows) => { const w = Math.max(...rows.map((r) => r.length)); return rows.map((r) => { r = r.padEnd(w, '.'); let o = ''; for (let i = 0; i <= w; i++) o += r[i] === '#' || (i > 0 && r[i - 1] === '#') ? '#' : '.'; return o; }); };
const DOTS = ['…', '"', '“', '”', ':', '·'];
const runs = (r) => (r.match(/#+/g) || []).length;

test('bold keeps the ellipsis\' and the quotes\' dots apart', () => {
  assert.ok(glyphs.length > 80, `glyphs read (${glyphs.length})`);
  assert.deepEqual(DOTS.filter((c) => !glyphs.some((g) => g[0] === c)), [], 'all in the font');
  const bad = [];
  for (const [c, rows] of glyphs) {
    if (!DOTS.includes(c)) continue;
    const b = bold(rows);
    rows.forEach((r, i) => { if (runs(b[i]) < runs(r)) bad.push(`${c} row ${i}: ${r} -> ${b[i]}`); });
  }
  assert.deepEqual(bad, []);
});
