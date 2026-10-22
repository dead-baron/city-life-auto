// The desert's waters on the page (shared/world3-tinajas.js lays them in World v3: test/world3desert.test.js checks the
// build): the ground bake draws a tinaja's bowl of slickrock (red rock) round its water and a seep's ring of damp mud
// (client/art2/game/groundbake.js tinaPx), per pixel and round - not a square of tiles - out to a ragged edge, and
// nothing past it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinaPx, MATERIALS as M_ } from '../client/art2/game/groundbake.js';

test('a tinaja\'s slickrock and a seep\'s damp mud round their water: round, ragged, nothing past them', () => {
  const list = [{ x: 1000, y: 1000, r: 70, ring: 77, k: 0 }, { x: 3000, y: 1000, r: 60, ring: 51, k: 1 }];
  for (const e of list) {
    const want = e.k ? M_.MUD : M_.REDROCK;
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
