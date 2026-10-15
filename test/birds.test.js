// The pigeons and gulls (client/birds.js): they come and go off screen (the owner, 2026-10-15: "can we have them spawn
// in from off screen so they don't just appear randomly") - every bird is first seen past the edge of the view, flies
// in and lands on its spot, and is let go only out of the view; scared ones take off away from what scared them; the
// same few objects are used over and over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Flock, BIRDS } from '../client/birds.js';
import { PF } from '../shared/constants.js';
import { mulberry32 } from '../shared/rng.js';

// pavement everywhere (sand west of x 0: the gulls')
const map = { tileAtPx: (x) => (x < 0 ? 8 : 2) };
const view = { x0: -600, x1: 600, y0: -400, y1: 400 };   // (the frame's view: the screen and 64 px round it)
const cam = { x: 0, y: 0 };
const offScreen = (b, m = 0) => b.x < view.x0 - m || b.x > view.x1 + m || b.y < view.y0 - m || b.y > view.y1 + m;

test('birds fly in from off screen, land on their spot, and leave off screen', () => {
  const F = new Flock(mulberry32(5)), seen = new Set(), dropped = [];
  const drop = F.drop.bind(F);
  F.drop = (i) => { dropped.push({ ...F.list[i] }); drop(i); };
  let landed = 0, made = 0;
  for (let k = 0; k < 60 * 240; k++) {   // (four minutes at 60 fps)
    const before = new Set(F.list);
    F.tick(1 / 60, view, cam, map, [], []);
    for (const b of F.list) {
      if (!before.has(b)) {   // (a bird that just arrived)
        made++;
        assert.ok(offScreen(b, BIRDS.OUT - 10), `first seen off screen: ${Math.round(b.x)},${Math.round(b.y)}`);
        assert.ok(b.fly > 0 && b.z > 60, 'in the air, high up');
      }
      if (b.st === 2 && !seen.has(b)) { seen.add(b); landed++; assert.equal(b.z, 0); assert.equal(b.fly, 0); assert.ok(!offScreen(b) && Math.hypot(b.x, b.y) >= BIRDS.NEAR_YOU - 40, 'landed in view, not on you'); }
      if (b.st !== 2) seen.delete(b);
    }
    assert.ok(F.list.length <= BIRDS.MAX);
  }
  assert.ok(made > 40 && landed > 30, `they come and land (${made} came, ${landed} landed)`);
  assert.ok(dropped.length > 20, 'and go');
  for (const b of dropped) assert.ok(offScreen(b, 30), `let go off screen: ${Math.round(b.x)},${Math.round(b.y)} (${b.st})`);
  assert.ok(F.list.length + F.free.length <= BIRDS.MAX + 3, `the same few objects over and over (${F.list.length + F.free.length})`);
});

test('a car or a runner scares them off, away from it; gulls on the sand', () => {
  const F = new Flock(mulberry32(9));
  for (let k = 0; k < 60 * 60; k++) F.tick(1 / 60, view, cam, map, [], []);
  const down = F.list.filter((b) => b.st === 2);
  assert.ok(down.length >= 3, 'some on the ground');
  for (const b of F.list) if (b.st === 2) assert.equal(b.gull, b.x < 0 || (b.tx < 0), 'a gull on the sand, a pigeon on the pavement');
  const b = down[0], car = { rx: b.x + 60, ry: b.y, flags: 0 };
  F.tick(1 / 60, view, cam, map, [car], []);
  assert.equal(b.st, 3, 'off it goes');
  assert.ok(b.vx < 0, 'away from the car');
  const c = down[1], walker = { rx: c.x + 20, ry: c.y, flags: 0 }, runner = { rx: c.x + 20, ry: c.y, flags: PF.MOVING };
  F.tick(1 / 60, view, cam, map, [], [walker]);
  assert.equal(c.st, 2, 'someone standing by: they stay');
  F.tick(1 / 60, view, cam, map, [], [runner]);
  assert.equal(c.st, 3, 'someone running by: off');
});
