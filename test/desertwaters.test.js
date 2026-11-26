// The desert's waters on the page (shared/world3-tinajas.js lays them in World v3: test/world3desert.test.js checks the
// build): the ground bake draws a tinaja's bowl of slickrock (red rock) round its water and a seep's ring of damp mud
// (client/art2/game/groundbake.js tinaPx), per pixel and round - not a square of tiles - out to a ragged edge, and
// nothing past it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinaPx, tinaTrim, TINA_RIM, MATERIALS as M_ } from '../client/art2/game/groundbake.js';
import { readFileSync } from 'node:fs';

test('a tinaja\'s slickrock and a seep\'s damp mud round their water: round, ragged, nothing past them', () => {
  const list = [{ x: 1000, y: 1000, r: 70, ring: 77, k: 0 }, { x: 3000, y: 1000, r: 60, ring: 51, k: 1 }];
  for (const e of list) {
    const want = e.k ? M_.CRACKED : M_.REDROCK;   // (a seep's ring: the desert's cracked mud, 11-25 - test/desertflora.test.js)
    let inner = 0, edge = new Set(), far = 0;
    for (let a = 0; a < 64; a++) {
      const c = Math.cos(a / 64 * Math.PI * 2), s = Math.sin(a / 64 * Math.PI * 2);
      if (tinaPx(list, e.x + c * (e.r + 10), e.y + s * (e.r + 10), 7) === want) inner++;
      let d = e.r; while (d < e.r * 2 + e.ring * 2 && tinaPx(list, e.x + c * d, e.y + s * d, 7) === want) d++;
      edge.add(Math.round(d / 6));
      if (tinaPx(list, e.x + c * (e.r * 1.3 + e.ring * 1.3 + 4), e.y + s * (e.r * 1.3 + e.ring * 1.3 + 4), 7) !== -1) far++;
    }
    assert.equal(inner, 64, `${e.k ? 'mud' : 'rock'} all round the water`);
    assert.ok(edge.size >= 3, `its edge ragged (${[...edge]})`);
    assert.equal(far, 0, 'nothing past it');
    // as far out on the diagonal as straight out (a circle, not a square)
    const reach = (c, s) => { let d = e.r; while (tinaPx([e], e.x + c * d, e.y + s * d, 7) === want) d++; return d; };
    let axis = 0, diag = 0;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; axis += reach(Math.cos(a), Math.sin(a)); diag += reach(Math.cos(a + Math.PI / 4), Math.sin(a + Math.PI / 4)); }
    assert.ok(diag < axis * 1.2, `round (${axis / 4 | 0} px straight out, ${diag / 4 | 0} on the diagonal)`);
  }
});

test("a desert pool's water keeps its own lobed rim: a tile's square corner is drawn as the ring's ground", () => {
  // (11-25, the water's edges: a seep two tiles across is a 4 x 4 square of water tiles, half-width 64 px, its corners
  // 90 px out; its rim lies near its radius, pulled in and out by the angle)
  const seep = { x: 5000, y: 4000, r: 66, ring: 51, k: 1 }, bowl = { x: 9000, y: 4000, r: 60, ring: 77, k: 0 };
  assert.equal(tinaTrim([seep], 5000, 4000, 7), -1, 'the middle is water');
  assert.equal(tinaTrim([seep], 5000 + 62, 4000 + 62, 7), M_.CRACKED, "a seep's corner: cracked mud");
  assert.equal(tinaTrim([bowl], 9000 - 60, 4000 - 60, 7), M_.REDROCK, "a tinaja's corner: slickrock");
  assert.equal(tinaTrim([seep], 5400, 4000, 7), -1, 'other water is left alone');
  assert.equal(tinaTrim([{ x: 5000, y: 4000, r: 0, ring: 93, k: 1 }], 5010, 4000, 7), -1, 'a playa (no water of its own) trims nothing');
  // not a circle: the rim's distance differs by the way out
  const rim = (e, a) => { let d = 0; while (d < e.r * 2 && tinaTrim([e], e.x + Math.cos(a) * d, e.y + Math.sin(a) * d, 7) < 0) d++; return d; };
  const R = []; for (let k = 0; k < 16; k++) R.push(rim(seep, k * Math.PI / 8));
  assert.ok(Math.max(...R) - Math.min(...R) >= 6, `lobed (${Math.min(...R)} to ${Math.max(...R)} px)`);
  assert.ok(Math.min(...R) > seep.r * 0.8 && Math.max(...R) < seep.r * 1.2, 'near its radius all round');
  assert.ok(TINA_RIM.lobe >= 0.06 && TINA_RIM.lobe <= 0.16);
  assert.match(readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8'), /if \(C\.tina && C\.tina\.length && isWater\(m\)\) \{ const q = tinaTrim\(C\.tina, X, Y, seed\); if \(q >= 0\) m = q; \}/);
});

