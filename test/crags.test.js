// The mountains' crags (the owner, 11-25, of a Granite Peaks cliff: "this doesnt look good when we create these
// mountainous areas with a group of 4 similar shaped rocks stacked in a row"; his pick of three looks, 07:19: "B for
// the mountain/cliffs is best, also were not doing snow yet so let's not do any snow for now"). B: each granite cliff
// piece a sheer wall half as tall again, its top the grey of the rock behind it; that rock in big light slabs, rising
// in ledges along the land's contours (groundbake.js reliefOn, LEDGE). The desert's sandstone and the coasts' basalt
// keep their stepped pieces. No snow is drawn on the benches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeStatic, cliffH, CRAG_TALL } from '../client/art2/game/statics.js';
import { GSHADE } from '../client/art2/ground.js';
import { LEDGE } from '../client/art2/game/groundbake.js';

const lum = (c, j = 0) => c[j] * 0.3 + c[j + 1] * 0.59 + c[j + 2] * 0.11;

test('a granite cliff is a sheer wall, taller than its band; sandstone and basalt as they were', () => {
  assert.equal(cliffH({ h: 100, rl: 1 }), Math.round(100 * CRAG_TALL));
  assert.equal(cliffH({ h: 100, st: 'sandstone', rl: 1 }), 100);
  assert.equal(cliffH({ h: 100, st: 'basalt', rl: 1 }), 100);
  assert.equal(cliffH({ h: 100 }), 100, 'a face placed by hand (ground to walk north of it) keeps its height: the rock drawn is the rock that is solid');
  const g = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, rl: 1 }), s = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, st: 'sandstone' });
  assert.ok(g.h >= s.h + 40, `the granite piece's picture is taller (${g.h} px, the sandstone ${s.h})`);
  // sheer: down the piece's middle column the flat tops it passes (runs of 8 rows or more at one height) - a stair
  // has three, a wall one
  const tops = (G) => { const x = G.w >> 1, run = new Map(); for (let y = 0; y < G.h; y++) { const i = y * G.w + x; if (G.col[i * 4 + 3] && G.z[i] > 8) { const k = Math.round(G.z[i] / 3); run.set(k, (run.get(k) || 0) + 1); } } return [...run.values()].filter((n) => n >= 8).length; };
  assert.equal(tops(g), 1, `one wall, not a stair (${tops(g)} flat tops down its middle; the sandstone ${tops(s)})`);
  assert.ok(tops(s) >= 2, `the sandstone keeps its steps (${tops(s)})`);
});

test('the rock behind a crag: big light slabs, the same grey as the wall\'s top', () => {
  let n = 0, sum = 0, crack = 0;
  for (let y = 0; y < 240; y += 2) for (let x = 0; x < 240; x += 2) { const c = GSHADE.crag(4000 + x, 7000 + y, 1337), l = lum(c); n++; sum += l; if (l < 75) crack++; }
  assert.ok(sum / n > 100, `light granite, not dark cobbles (mean ${Math.round(sum / n)} of 255)`);
  assert.ok(crack / n < 0.12, `fine cracks between big slabs (${(crack / n * 100).toFixed(1)}% of it)`);
  const g = makeStatic({ t: 'cliff', w: 256, d: 96, h: 100, s: 3, rl: 1 });
  let tn = 0, ts = 0; for (let y = 0; y < 30; y++) for (let x = 60; x < g.w - 60; x++) { const j = (y * g.w + x) * 4; if (g.col[j + 3] && Math.abs(g.col[j] - g.col[j + 2]) < 24) { tn++; ts += lum(g.col, j); } }
  assert.ok(tn > 200 && Math.abs(ts / tn - sum / n) < 40, `the wall's top (${Math.round(ts / tn)}) and the rock behind it (${Math.round(sum / n)}) are one grey`);
});

test('ledges every few metres of height; no snow painted on them, no trial switch left', () => {
  assert.ok(LEDGE.step >= 3 && LEDGE.step <= 8 && LEDGE.slope > 0.05 && LEDGE.slope < 0.4);
  for (const f of ['client/art2/game/groundbake.js', 'client/art2/game/statics.js', 'client/art2/ground.js']) {
    const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    assert.ok(!/__CRAG/.test(src), `${f}: the trial switch is gone`);
  }
  assert.ok(!/snow lying on the bench/.test(readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8')), 'no snow on the benches');
});
