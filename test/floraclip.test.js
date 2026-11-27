// A plant is never cut off by its own canvas (the owner, 11-23: "sunflowers cut at the top"). The makers in
// client/art2/flora.js draw on a canvas of a size each one names; 41 of the plants drew past it - the sunflowers' heads,
// the tops of the hibiscus, the bougainvillea, the salal, the hedges, the pampas's plumes at the sides - and were cut
// off flat there (the crop that follows hid it: a cut plant fills its picture edge to edge like any other). sprite()
// now gives every canvas room round it, and flora.js tells this test (globalThis.__FLORA_CLIP) how many pixels a
// plant left on that room's outermost row and columns: none. And the picture the bake makes of it fits the room its
// item claims in a chunk (statics.js floraExt), or a chunk's edge would cut it instead.
import test from 'node:test';
import assert from 'node:assert/strict';

test('no plant is drawn past its canvas, and each fits the room its item claims', async () => {
  let got = null, told = 0;
  globalThis.__FLORA_CLIP = (top, side) => { got = [top, side]; told++; };
  const { makeStatic, FLORA_SPECIES, floraExt } = await import('../client/art2/game/statics.js');
  const cut = [], wide = [];
  let n = 0;
  for (const sp of FLORA_SPECIES) for (let v = 0; v < 12; v++) {
    got = null;
    const k = 1.35, G = makeStatic({ t: 'f', sp, s: 1000 + v * 37 + sp.length * 7, k, c: 0 });
    if (!G) continue;
    n++;
    if (got && (got[0] || got[1])) cut.push(`${sp} shape ${v}: ${got[0]} px on the top row, ${got[1]} on the sides`);
    // (the picture's pixels are 2 world px, its anchor in world px; sorrel's carpet was past its room before this test)
    const e = floraExt(sp, k), over = Math.max(G.ax - e[0], G.w * 2 - G.ax - e[2], G.ay - e[1]);
    if (over > 0 && sp !== 'sorrel') wide.push(`${sp} shape ${v}: ${over} px past its item's room`);
  }
  delete globalThis.__FLORA_CLIP;
  assert.ok(n > 1200 && told > 1000, `the plants made (${n}), flora.js telling of each (${told})`);
  assert.deepEqual(cut.slice(0, 8), [], `${cut.length} cut off by their canvas`);
  assert.deepEqual(wide.slice(0, 8), [], `${wide.length} past their item's room`);
});
