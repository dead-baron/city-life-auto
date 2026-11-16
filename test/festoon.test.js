// Hanging lights (the owner, 2026-11-16: "okay when they had something to hang from ... some slack in the line and
// larger lights/lanterns"): shared/festoon.js on a small made-up map - each run's ends made fast to what stands there or
// a post, a run with an end in the road and nothing there comes down, a long run cut into spans with posts, a low run
// raised over people's heads; and the art (client/art2/game/statics.js makeFestoon): the line sags, a few big bulbs or
// lanterns along it, not a dense string. The whole world's runs: test/placementlint.test.js 'festoons'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, T } from '../shared/constants.js';
import { FESTOON, hangLights3, festoonWorld, festoonWhy, festoonSag, festoonSpan, festoonLow, festoonClear } from '../shared/festoon.js';

// 40 x 20 tiles of plaza; a building in the top-left 6 x 4; a road across rows 12-14
function world() {
  const w = 40, h = 20, tiles = new Uint8Array(w * h).fill(T.PLAZA), bld = new Int16Array(w * h).fill(-1);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) { tiles[y * w + x] = T.BUILDING; bld[y * w + x] = 0; }
  for (let y = 12; y < 15; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = T.ROAD;
  return { w, h, tiles, bld, props: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x };
}
const H = { addProp: (m, t, x, y, r, extra) => { const p = { t, x, y, ...extra }; m.props.push(p); return p; }, removeProps: (m, near) => { m.props = m.props.filter((p) => !near(p.x, p.y)); } };
const fest = (x, y, tx, ty, h = 56, ends, k) => ({ t: 'festoon', x: x * TILE, y: y * TILE, tx: tx * TILE, ty: ty * TILE, h, ...(ends ? { ends } : {}), ...(k ? { k } : {}) });

test('each end made fast: the wall it starts at, the lamp post it reaches, a post of its own on open ground', () => {
  const m = world();
  m.props.push({ t: 'lamp', x: 10 * TILE, y: 4.5 * TILE });
  m.props.push(fest(3, 4.3, 7, 0.2, 60));        // from the building's front to the lamp post
  m.props.push(fest(14, 6, 6, 0, 52));           // over the plaza: nothing at either end
  const o = hangLights3(m, H);
  const [a, b] = m.props.filter((p) => p.t === 'festoon');
  assert.deepEqual(a.ends, ['wall', 'lamp']);
  assert.deepEqual(b.ends, ['pole', 'pole']);
  assert.equal(o.dropped, 0);
  const W = festoonWorld(m);
  for (const f of [a, b]) assert.equal(festoonWhy(W, f), null);
});

test('never a post in the road: a run ending in the road with nothing there comes down; one across it between posts stays', () => {
  const m = world();
  m.props.push(fest(20, 9, 0, 4, 60));          // from the plaza out into the road, nothing at its end
  m.props.push(fest(30, 10.5, 0, 5, 64));       // across the road, plaza to plaza
  const o = hangLights3(m, H);
  const left = m.props.filter((p) => p.t === 'festoon');
  assert.equal(o.dropped, 1);
  assert.equal(left.length, 1);
  assert.deepEqual(left[0].ends, ['pole', 'pole']);
  assert.equal(festoonWhy(festoonWorld(m), { ...left[0], ends: ['pole', 'pole'], y: 12.5 * TILE }) !== null, true, 'a post in the road is a fault');
});

test('slack: 8-12% of the span at the middle, a little variety, over people\'s heads; a long run cut into spans with posts', () => {
  const m = world();
  m.props.push(fest(6, 6, 30, 0, 50));           // 30 tiles over the plaza: cut
  m.props.push(fest(8, 8, 7, 0, 40, null, 'lantern'));   // a low lantern line: raised
  hangLights3(m, H);
  const runs = m.props.filter((p) => p.t === 'festoon');
  assert.ok(runs.length >= 4, `${runs.length} runs`);
  const sags = new Set();
  for (const f of runs) {
    const r = festoonSag(f) / festoonSpan(f);
    sags.add(FESTOON.SAG.indexOf(FESTOON.SAG.reduce((p, q) => (Math.abs(q - r) < Math.abs(p - r) ? q : p))));
    assert.ok(r >= FESTOON.SAG[0] - 0.01 && r <= FESTOON.SAG[2] + 0.01, `sag ${r}`);
    assert.ok(festoonSpan(f) <= FESTOON.SPAN_MAX + 1, `span ${festoonSpan(f)}`);
    assert.ok(festoonLow(f) >= festoonClear(f), `low point ${festoonLow(f)}`);
    assert.ok(f.h <= FESTOON.H_MAX);
    assert.equal(festoonWhy(festoonWorld(m), f), null);
  }
  assert.ok(sags.size >= 2, 'not every run sags the same');
});

test('the art: the line sags in the view, a few big bulbs (not a dense string), lanterns hanging under it', async () => {
  const { makeStatic } = await import('../client/art2/game/statics.js');
  const span = 200, s = festoonSag({ x: 0, y: 0, tx: span, ty: 0 });
  for (const k of [0, 1]) {
    const G = makeStatic({ t: 'festoon', tx: span, ty: 0, h: 60, k, e: 3, s });
    // the wire's row at each column: highest (smallest y) drawn pixel - lower in the middle than near the ends
    const top = (x) => { for (let y = 0; y < G.h; y++) if (G.col[(y * G.w + x) * 4 + 3]) return y; return -1; };
    const xm = Math.round(G.ax + span / 2), xe = Math.round(G.ax + 6);
    assert.ok(top(xm) - top(xe) >= s * 0.8, `sags ${top(xm) - top(xe)} px of ${s}`);
    // the lit pixels in clusters: a handful along the run, each several pixels
    const lit = []; for (let x = 0; x < G.w; x++) { let n = 0; for (let y = 0; y < G.h; y++) if (G.emi[(y * G.w + x) * 4 + 3] > 100) n++; lit.push(n); }
    let groups = 0, inG = false; for (const n of lit) { if (n && !inG) groups++; inG = !!n; }
    const want = Math.round(span / (k ? FESTOON.LANTERN_GAP : FESTOON.BULB_GAP)) - 1;
    assert.equal(groups, want, `${groups} lit bulbs or lanterns`);
    assert.ok(lit.reduce((a, b) => a + b, 0) / groups >= (k ? 60 : 10), 'each one big enough to read');
  }
});
