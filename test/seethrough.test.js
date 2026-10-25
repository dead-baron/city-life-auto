// See-through buildings (the owner, 10-23: "watching half a building disappear this abruptly isn't the best look"; a
// mast's hut "half of it disappears"): client/art2/game/host.js _fades picks the buildings whose picture covers you and
// eases them in and out; engine.js STATIC_FS (seeThrough, its rule in JS) draws one as a ghost with a clear space round
// you - never the whole of what's outside its footprint gone at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2, FADE_IN, FADE_OUT, CLR_FOOT, CLR_OTHER, CLR_VEH_MAX } from '../client/art2/game/host.js';
import { seeThrough, GHOST, GHOST_THIN } from '../client/art2/game/engine.js';

// a host with buildings in one chunk: [b, x0, y0, x1, y1 (its picture), base y]
function host(blds, pred = null) {
  return { S: { pred, me: null, myPedId: 1 }, fades: new Map(), _gz: () => 0, chunkState: new Map([[0, { blds }]]) };
}
const WIDE = [7, 1000, 600, 1400, 1000, 1000];        // a block 400 px wide, its picture up to 400 px north of its base
const HUT = [8, 2000, 900, 2060, 1000, 1000];         // a hut 60 px wide (a mast's)
const step = (h, x, y, n, dt = 0.05, peds = []) => { for (let i = 0; i < n; i++) World2.prototype._fades.call(h, { dt, peds }, { x, y, z: 0 }); };

test('a building fades only while its picture covers you, eased in and out (a smoothstep, not a snap)', () => {
  const h = host([WIDE]);
  step(h, 1200, 800, 1);
  const f1 = h.fades.get(7);
  assert.ok(f1 > 0 && f1 < 0.15, `starts gently (${f1})`);
  step(h, 1200, 800, 1);
  assert.ok(h.fades.get(7) - f1 > f1, 'then speeds up (eased in)');
  step(h, 1200, 800, Math.ceil(FADE_IN / 0.05));
  assert.equal(h.fades.get(7), 1, `all the way in ${FADE_IN} s`);
  step(h, 1200, 1100, 1);
  const o1 = h.fades.get(7);
  assert.ok(o1 > 0.9, `starts leaving gently (${o1})`);
  step(h, 1200, 1100, Math.ceil(FADE_OUT / 0.05) + 1);
  assert.ok(!h.fades.has(7), 'gone again once you are in front of it');
  const h2 = host([WIDE]);
  step(h2, 1470, 800, 10);
  assert.ok(!h2.fades.has(7), '70 px clear of its side: kept (the old box faded it)');
  step(h2, 1200, 560, 10);
  assert.ok(!h2.fades.has(7), 'north of its picture: kept');
});

test('in a vehicle the clear space takes in the whole of it, and grows as you get in', () => {
  const h = host([WIDE], { kind: 'veh', def: { L: 100 } });
  step(h, 1200, 800, 1);
  assert.ok(h.clr[2] >= 84, `round a car (${h.clr[2]})`);
  const big = host([WIDE], { kind: 'veh', def: { L: 160 } });
  step(big, 1200, 800, 1);
  assert.ok(big.clr[2] > h.clr[2] && big.clr[2] <= CLR_VEH_MAX, `round a tanker (${big.clr[2]})`);
  // a car's front 45 px east of you still fades a building whose picture starts there
  const side = host([[9, 1240, 600, 1500, 1000, 1000]], { kind: 'veh', def: { L: 100 } });
  step(side, 1200, 800, 4);
  assert.ok(side.fades.get(9) > 0, 'the building over its bonnet fades');
  // getting out: the space shrinks smoothly back to the one on foot
  const g = host([WIDE], { kind: 'veh', def: { L: 100 } });
  step(g, 1200, 800, 4);
  g.S.pred = { kind: 'ped' };
  step(g, 1200, 800, 1);
  assert.ok(g.clr[2] > CLR_FOOT + 4, 'not at once');
  step(g, 1200, 800, 30);
  assert.ok(Math.abs(g.clr[2] - CLR_FOOT) < 1, 'back to the one on foot');
});

test('a thin one (a hut by its mast) fades less: a negative fade, the lighter ghost', () => {
  const h = host([HUT]);
  step(h, 2030, 960, 10);
  assert.ok(h.fades.get(8) < -0.9, `thin (${h.fades.get(8)})`);
  assert.ok(GHOST_THIN < GHOST && GHOST < 0.7, 'semi-transparent, never gone');
});

test('the ghost: fully clear only round you (and the players near you), the edge soft', () => {
  const h = host([WIDE]);
  step(h, 1200, 800, 20, 0.05, [{ id: 2, d: { pl: 1 }, flags: 0, rx: 1300, ry: 760 }, { id: 3, d: {}, flags: 0, rx: 1250, ry: 760 }]);
  const C = h.clr, f = h.fades.get(7);
  assert.deepEqual([...C.slice(0, 4)], [1200, 778, CLR_FOOT, 1], 'round you, from your middle');
  assert.deepEqual([...C.slice(4, 8)], [1300, 738, CLR_OTHER, 1], 'round another player');
  assert.equal(C[10], 0, 'not round a passer-by');
  assert.ok(seeThrough(f, 1200, 778, C) > 0.95, 'clear where you stand');
  const ghost = seeThrough(f, 1100, 650, C);
  assert.ok(ghost > 0.5 && ghost < 0.7, `a ghost elsewhere (${ghost}): its shape kept, the street through it`);
  // the edge feathered: from clear to the ghost over a wide band, never a step
  let prev = 1, maxStep = 0;
  for (let d = 0; d <= CLR_FOOT + 4; d += 4) { const v = seeThrough(f, 1200 + d, 778, C); maxStep = Math.max(maxStep, prev - v); prev = v; }
  assert.ok(maxStep < 0.06, `no hard edge (largest step over 4 px: ${maxStep})`);
  const edge = seeThrough(f, 1200 + CLR_FOOT * 0.7, 778, C);
  assert.ok(edge > ghost + 0.05 && edge < 0.95, `a soft edge (${edge})`);
  assert.ok(seeThrough(-f, 1100, 650, C) < ghost, 'a thin one: lighter still');
});
