// The desert's small plants (the art pass, 2026-11-25; concepts NA1-C, NS1-C, SC3-F: dry scrub, a cactus here and
// there, bloom a rare patch). Counted that day: a bloom patch was 22.8% of the desert and 39% of its small plants were
// flower beds; reeds stood in Dusty Hollow's gravel street; a desert river's green strip grew meadow flowers; a
// seep's ring was the marsh's dark mud. The rules, by their code and by counting over the desert's box.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESERT_BLOOM, desertCover } from '../client/art2/game/statics.js';
import { tinaPx } from '../client/art2/game/groundbake.js';
import { vnoise, hash } from '../client/art2/gbuf.js';

const TILE = 32, SRC = readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8');

test('bloom is a rare patch: few flower beds among the scrub, brittlebush first', () => {
  const n = {}; let tiles = 0, zone = 0;
  for (let ty = 300; ty < 2700; ty += 3) for (let tx = 4300; tx < 6100; tx += 3) {   // (the Red Rock Desert's box, tiles)
    const x = tx * TILE + 16, y = ty * TILE + 16, pa = vnoise(x, y, 170, 7105), pb = vnoise(x, y, 90, 7107), h = hash(tx, ty, 7101), h2 = vnoise(x, y, 70, 7103) * 0.75 + hash(tx, ty, 7103) * 0.25;
    tiles++; if (pa > DESERT_BLOOM.zone) zone++;
    const r = desertCover(pa, pb, h, h2); if (r) n[r[0]] = (n[r[0]] || 0) + 1;
  }
  const all = Object.values(n).reduce((a, b) => a + b, 0), beds = (n.dFlowers || 0) + (n.dPoppies || 0);
  assert.ok(zone / tiles > 0.02 && zone / tiles < 0.09, `a bloom patch is 2-9% of the desert (${(zone / tiles * 100).toFixed(1)}%)`);
  assert.ok(beds > 0 && beds / all < 0.06, `flower beds are under 6% of the small plants, and there are some (${(beds / all * 100).toFixed(1)}%)`);
  assert.ok((n.dFlowers || 0) < (n.dPoppies || 0), 'the many-coloured bed is the rarest bloom');
  assert.ok(n.brittle > beds && n.creosote > beds && n.dryGrass > beds, `each of the scrub's main plants outnumbers the beds (${n.creosote}, ${n.brittle}, ${n.dryGrass}; ${beds})`);
  assert.ok(all / tiles > 0.1 && all / tiles < 0.2, `a plant on 10-20% of the tiles (${(all / tiles * 100).toFixed(1)}%)`);
});

test('gravel and the river strip in the desert and its towns: scrub and rushes, no reeds in a street, no meadow flowers', () => {
  assert.match(SRC, /const dry = M\.dist\[i\] === 50 \|\| \(DISTRICTS\[M\.dist\[i\]\] \|\| \{\}\)\.isl === 'Red Rock Desert' \|\| \(\(M\.reserve\[i\] & 128\) && \[\[5, 0\], \[-5, 0\], \[0, 5\], \[0, -5\]\]\.some\(/, "the desert, its towns, and a bank whose land five tiles off is the desert's (a river's bank is the water's district: 13 at the dam's wash)");
  assert.match(SRC, /if \(t === T\.SAND\) return h < 0\.07 \? \[pickW\(dry \? NAT_SP\.desert : NAT_SP\.shore, h2\), 1\] : null/);
  assert.match(SRC, /if \(dry\) return h < 0\.3 \? \[pickW\(NAT_SP\.desertBank, h2\), 1\] : null;[^\n]*\n\s*if \(pa > 0\.6 && h < 0\.34\)/, 'the dry rule comes before the meadow drifts');
  const bank = SRC.match(/desertBank: (\[\[.*?\]\]),/)[1];
  assert.ok(!/lupines|poppies|daisies|fern|berry|foxglove/.test(bank), `no meadow or forest plants on a desert bank (${bank})`);
});

test("a seep's ring is the desert's cracked mud, a tinaja's bowl its red rock", () => {
  const G = readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
  assert.match(G, /return e\.k \? M_\.CRACKED : M_\.REDROCK;/);
  const seep = tinaPx([{ x: 0, y: 0, r: 60, ring: 50, k: 1 }], 70, 0, 5), bowl = tinaPx([{ x: 0, y: 0, r: 60, ring: 50 }], 70, 0, 5);
  assert.ok(seep >= 0 && bowl >= 0 && seep !== bowl, 'both paint, each its own ground');
  assert.equal(tinaPx([{ x: 0, y: 0, r: 60, ring: 50, k: 1 }], 400, 0, 5), -1, 'nothing far from the water');
});
