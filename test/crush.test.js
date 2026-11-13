// Crops flattened (the owner, 10-06 / 10-15: "crops ... part round people and flatten under tyres"): on the art v2
// page a vehicle rolling through a field leaves a swath of flattened crop under each rear wheel and someone walking
// through one a trodden track (client/main.js vehVisual / pedVisual -> render/fx.js crush, drawn by
// client/art2/game/host.js _decals from client/art2/fx.js dCrush). The marks keep a ring of their own, so a tractor
// working a field never pushes the blood and the skid marks out of the decals'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FX } from '../client/render/fx.js';
import { fxFrames } from '../client/art2/fx.js';
import { FX_FOR_V1, fxKey } from '../client/art2/game/actors.js';

test('the crush marks: a wheel swath and a trodden track at eight angles, dark with pale laid stalks, see-through', () => {
  const fr = fxFrames('dCrush');
  assert.equal(fr.length, 16);
  const px = (g) => { let n = 0, a = 0; for (let i = 3; i < g.col.length; i += 4) if (g.col[i]) { n++; a += g.col[i]; } return [n, n ? a / n : 0]; };
  for (let k = 0; k < 8; k++) {
    const [nb, ab] = px(fr[k]), [ns] = px(fr[8 + k]);
    assert.ok(nb > 60 && ns > 25 && nb > ns * 1.5, `angle ${k}: the swath (${nb} px) wider and longer than the track (${ns} px)`);
    assert.ok(ab <= 200, 'see-through: the crop shows under it');
  }
  // dark broken stalks and ground, pale laid stalks streaking along it
  const g = fr[0];
  let pale = 0, dark = 0;
  for (let i = 0; i < g.col.length; i += 4) if (g.col[i + 3]) { if (g.col[i] > 170 && g.col[i] > g.col[i + 2] + 40) pale++; else if (g.col[i] < 110) dark++; }
  assert.ok(dark > 30 && pale > 3, `the dark swath (${dark}) and its pale streaks (${pale})`);
  assert.equal(FX_FOR_V1.decal[7].name, 'dCrush');
  assert.ok(fxKey('dCrush', 3).includes('dCrush'));
});

test('their own ring: a field of marks never pushes the decals out', () => {
  const fx = new FX();
  fx.decal(1, 10, 10, 0, 6, '#7a0d12', 0, 0.9);
  for (let i = 0; i < 2000; i++) fx.crush(i * 12, 50, 0.3, i & 1, 1, 0.8);
  assert.ok(fx.d.some((d) => d.on && d.type === 1), 'the blood still there');
  const on = fx.c.filter((c) => c.on);
  assert.ok(on.length > 500 && on.every((c) => c.small === 0 || c.small === 1), `${on.length} marks kept`);
  assert.ok(on.some((c) => c.x === 1999 * 12), 'the newest kept, the oldest gone first');
});

// (11-13) the crush ring had the flying chunks' index: a field walked through, then a lamp post knocked down, threw
test('the crush ring and the flying chunks keep their own places', () => {
  const fx = new FX();
  for (let i = 0; i < 300; i++) fx.crush(i, 0, 0, 0, 1);
  assert.doesNotThrow(() => fx.chunk(null, 0, 0, 4, 4, 8, 8, 10, 10, 0, 0, 0, 0));
  assert.ok(fx.chunks.some((c) => c.on));
  fx.crush(5, 5, 0, 1, 2);
  assert.ok(fx.c.some((c) => c.on && c.x === 5 && c.small === 1));
});

// The owner, 11-13: "vehicles going through vegetation ... have the bush get knocked down or ruffled or just burst
// apart": a vehicle driven through a bush (the map's shrub and bush props - never a tree) throws a burst of its leaves
// (the pooled particles) and knocks it aside for a while (host.js _bushes -> _push's last four slots)
test('a car through a bush: a burst of leaves, the bush knocked aside a while; a tree, a parked car: nothing', async () => {
  const { World2 } = await import('../client/art2/game/host.js');
  const { VEHICLE_BY_INDEX } = await import('../shared/vehicles.js');
  const m = VEHICLE_BY_INDEX.findIndex((d) => d && d.id === 'sedan');
  const fx = new FX();
  const map = { props: [{ t: 'shrub_a', x: 1000, y: 500, sp: 'sage' }, { t: 'tree_a', x: 1300, y: 500 }, { t: 'bush_b', x: 3000, y: 500 }] };
  const h = Object.create(World2.prototype);
  Object.assign(h, { S: { fx, pred: null, ents: new Map() }, map, q: 2, vx0: 0, vx1: 4000, vy0: 0, vy1: 1000 });
  const v = { id: 7, d: { m }, flags: 0, rx: 900, ry: 500, ra: 0, rz: 0 };
  const parts = () => fx.p.filter((p) => p.on && p.type === 8).length;
  for (let t = 0; t <= 30; t++) { v.rx = 900 + t * 15; h._bushes({ now: t / 60, dt: 1 / 60, vehs: [v] }); }   // (15 px a frame: 900 px/s, past the bush and the tree)
  assert.ok(parts() >= 6, `the leaves (${parts()})`);
  assert.equal(h.knocks.length, 1, 'the one bush knocked aside - not the tree');
  // knocked aside: one of the push slots round it, easing back up
  const sp = { x: 900, y: 500 };
  h._push({ now: 1, peds: [], vehs: [] }, sp);
  assert.ok(h.pushA[16] === 1000 && h.pushA[19] > 4, 'pushed aside round it just after');
  h._push({ now: 15, peds: [], vehs: [] }, sp);
  const later = h.pushA[19];
  assert.ok(later > 0 && later < 2, `standing back up (${later})`);
  h._push({ now: 30, peds: [], vehs: [] }, sp);
  assert.equal(h.pushA[19], 0, 'up again');
  // a car standing in a bush: nothing more
  const before = parts();
  const w = { id: 8, d: { m }, flags: 0, rx: 3000, ry: 500, ra: 0, rz: 0 };
  for (let t = 0; t < 10; t++) h._bushes({ now: 40 + t / 60, dt: 1 / 60, vehs: [w] });
  assert.equal(parts(), before);
});
