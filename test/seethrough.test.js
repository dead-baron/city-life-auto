// See-through buildings (the owner, 10-23: "watching half a building disappear this abruptly isn't the best look"; a
// mast's hut "half of it disappears"): client/art2/game/host.js _fades picks the buildings whose picture covers you and
// eases them in and out; engine.js STATIC_FS (seeThrough, its rule in JS) draws one as a ghost with a clear space round
// you - never the whole of what's outside its footprint gone at once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';
import { seeThrough, GHOST, GHOST_THIN } from '../client/art2/game/engine.js';

// a host with buildings in one chunk: [b, x0, y0, x1, y1 (its picture), base y]
function host(blds) {
  return { S: { pred: null, me: null, myPedId: 1 }, fades: new Map(), _gz: () => 0, chunkState: new Map([[0, { blds }]]) };
}
const WIDE = [7, 1000, 600, 1400, 1000, 1000];        // a block 400 px wide, its picture up to 400 px north of its base
const HUT = [8, 2000, 900, 2060, 1000, 1000];         // a hut 60 px wide (a mast's)
const step = (h, x, y, n, dt = 0.05, peds = []) => { for (let i = 0; i < n; i++) World2.prototype._fades.call(h, { dt, peds }, { x, y, z: 0 }); };

test('a building fades only while its picture covers you, eased in about 0.2 s and out again', () => {
  const h = host([WIDE]);
  step(h, 1200, 800, 1);
  assert.ok(h.fades.get(7) > 0 && h.fades.get(7) < 0.5, 'not all at once');
  step(h, 1200, 800, 3);
  assert.ok(h.fades.get(7) > 0.85, `most of the way in 0.2 s (${h.fades.get(7)})`);
  step(h, 1200, 1100, 10);
  assert.ok(!h.fades.has(7) || h.fades.get(7) < 0.05, 'gone again once you are in front of it');
  const h2 = host([WIDE]);
  step(h2, 1470, 800, 10);
  assert.ok(!h2.fades.has(7), '70 px clear of its side: kept (the old box faded it)');
  step(h2, 1200, 560, 10);
  assert.ok(!h2.fades.has(7), 'north of its picture: kept');
});

test('a thin one (a hut by its mast) fades less: a negative fade, the lighter ghost', () => {
  const h = host([HUT]);
  step(h, 2030, 960, 10);
  assert.ok(h.fades.get(8) < -0.9, `thin (${h.fades.get(8)})`);
  assert.ok(GHOST_THIN < GHOST && GHOST <= 0.5, 'semi-transparent, never gone');
});

test('the ghost: fully clear only round you (and the players near you), the edge soft', () => {
  const h = host([WIDE]);
  step(h, 1200, 800, 20, 0.05, [{ id: 2, d: { pl: 1 }, flags: 0, rx: 1300, ry: 760 }, { id: 3, d: {}, flags: 0, rx: 1250, ry: 760 }]);
  const C = h.clr, f = h.fades.get(7);
  assert.deepEqual([...C.slice(0, 4)], [1200, 778, 40, 1], 'round you, from your middle');
  assert.deepEqual([...C.slice(4, 8)], [1300, 738, 32, 1], 'round another player');
  assert.equal(C[10], 0, 'not round a passer-by');
  assert.ok(seeThrough(f, 1200, 778, C) > 0.95, 'clear where you stand');
  const ghost = seeThrough(f, 1100, 650, C);
  assert.ok(ghost > 0.3 && ghost < 0.55, `a ghost elsewhere (${ghost}): its shape kept, the street through it`);
  const edge = seeThrough(f, 1200 + 34, 778, C);
  assert.ok(edge > ghost && edge < 0.95, `a soft edge (${edge})`);
  assert.ok(seeThrough(-f, 1100, 650, C) < ghost, 'a thin one: lighter still');
});
