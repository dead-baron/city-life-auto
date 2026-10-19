// Lakeside Greens, handcrafted (shared/world3-lakeside.js, 2026-10-19): the links on the Lake District's headland
// between Magnolia Street, 15th Street and the sea. Magnolia and 15th Streets stay the grid's; every hole's tee, line
// and green sit inside the course, the greens apart, each par fitting its length (the old course's yardsticks: a par 3
// about 18 tiles, a par 4 26 to 40). (The course built in the whole world, and played: test/world3world.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAKESIDE, LX, LY, HOLES, COURSE } from '../shared/world3-lakeside.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';

test('Lakeside Greens: the streets round it stay the grid\'s; four holes inside the course, each par fitting its length', () => {
  assert.ok(HAND_PLANS.includes(LAKESIDE));
  for (let y = 2300; y < LY.fifteenth - 4; y += 7) assert.equal(handPlanAt(LX.magnolia, y), null, `Magnolia Street at ${y}`);
  for (let x = LX.magnolia + 6; x < LX.pinecrest - 4; x += 9) assert.equal(handPlanAt(x, LY.fifteenth), null, `15th Street at ${x}`);
  assert.equal(handPlanAt(4250, 2320), LAKESIDE);
  const [x0, y0, x1, y1] = COURSE, inside = ([x, y]) => x > x0 + 2 && y > y0 + 2 && x < x1 - 2 && y < y1 - 2;
  assert.equal(HOLES.length, 4);
  HOLES.forEach((h, k) => {
    for (const p of [h.tee, ...h.way, h.green]) assert.ok(inside(p), `hole ${k + 1}: ${p}`);
    const len = Math.hypot(h.green[0] - h.tee[0], h.green[1] - h.tee[1]);
    assert.ok(h.par === 3 ? len >= 14 && len <= 24 : len >= 24 && len <= 42, `hole ${k + 1}: ${len.toFixed(1)} tiles for a par ${h.par}`);
    for (let j = 0; j < k; j++) assert.ok(Math.hypot(h.green[0] - HOLES[j].green[0], h.green[1] - HOLES[j].green[1]) > 12, `greens ${j + 1} and ${k + 1} apart`);
  });
});
