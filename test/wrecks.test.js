// Wrecks under the water (shared/world3-wrecks.js lays them in World v3: test/world3coast.test.js checks the build;
// the owner, 10-16: "see-through clear water ... underwater rocks and wrecks"): the page draws a sunken boat into the
// water's bed (client/art2/water.js wreckPx) - its planks, the gunwale's dark rim, holes with the ribs and the bed
// showing through, weed; a rowboat's thwart; a sloop's mast fallen beside it - and nothing where no wreck lies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wreckPx } from '../client/art2/water.js';
import { WRECKS3 } from '../shared/world3-wrecks.js';

test('a sunken boat in the bed: its hull, its rim, holes through it, a sloop\'s mast - and the bed elsewhere', () => {
  for (const kind of Object.keys(WRECKS3.kinds)) {
    const [len, beam] = WRECKS3.kinds[kind], w = { x: 1000, y: 1000, a: 0.4, len, beam, kind, v: 1 };
    let hull = 0, holes = 0, dark = 0, far = 0;
    const ca = Math.cos(w.a), sa = Math.sin(w.a);
    for (let lx = -len / 2 + 1; lx < len / 2; lx += 1) for (let ly = -beam / 2; ly <= beam / 2; ly += 1) {
      const X = w.x + lx * ca - ly * sa, Y = w.y + lx * sa + ly * ca, c = wreckPx([w], X, Y, 7);
      if (Math.abs(ly) < beam * 0.25 && Math.abs(lx) < len * 0.3) { if (c) hull++; else holes++; }
      if (c && c[0] < 90) dark++;
    }
    for (let k = 0; k < 200; k++) if (wreckPx([w], w.x + len * 2 + k, w.y - len * 2, 7)) far++;
    assert.ok(hull > holes * 2 && holes > 0, `${kind}: mostly hull (${hull}), holes through it (${holes})`);
    assert.ok(dark > 10, `${kind}: the rim and the ribs dark (${dark})`);
    assert.equal(far, 0, `${kind}: nothing where it isn't`);
    const c = wreckPx([w], w.x, w.y, 7) || wreckPx([w], w.x + 4, w.y + 2, 7);
    assert.ok(c && c[0] > c[2], `${kind}: wood-brown`);
  }
  // the sloop's mast lies out beside the hull
  const [len, beam] = WRECKS3.kinds.sloop, w = { x: 0, y: 0, a: 0, len, beam, kind: 'sloop', v: 0 };
  let mast = 0;
  for (let t = len * 0.3; t < len * 0.8; t += 2) { const px = -len * 0.025 + Math.cos(-0.65) * t, py = -beam * 0.25 + Math.sin(-0.65) * t; if (Math.abs(py) > beam / 2 + 2 && wreckPx([w], px, py, 7)) mast++; }
  assert.ok(mast > 5, `the mast beside it (${mast})`);
});
