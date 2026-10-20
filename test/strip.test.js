// Lucky Mesa's Strip, handcrafted (shared/world3-strip.js, 2026-10-20, from the owner's LuckyMesa-B2): the district the
// plan's; its resorts' lots inside it, apart, clear of the Strip's pavements and the side streets; the skybridge between
// Mesa Grande and Casa del Sol, clear of their drive loops; the Strip's section a palm-median boulevard. (The Strip built
// in the whole world: test/world3mesa.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../shared/constants.js';
import { STRIP, RESORTS, SKYBRIDGE, STRIP_ROAD, SX, SY } from '../shared/world3-strip.js';
import { HAND_PLANS, handPlanAt } from '../shared/world3-hand.js';
import { MESA } from '../shared/world3-mesa.js';
import { SIDEWALK } from '../shared/roads.js';

test('The Strip: the district the plan\'s; the resorts\' lots inside it, apart, clear of the pavements and the side streets', () => {
  assert.ok(HAND_PLANS.includes(STRIP));
  assert.equal(STRIP.d, 60);
  assert.equal(MESA.resorts, RESORTS, 'Lucky Mesa\'s resorts are the plan\'s');
  for (const [x, y] of [[5360, 580], [5470, 650], [5500, 612]]) assert.equal(handPlanAt(x, y), STRIP, `${x}, ${y}`);
  const [X0, Y0, X1, Y1] = STRIP.rect;
  // the Strip's pavement edges (its section on row SY.strip) and the side streets' (6 tiles and their pavements)
  const half = (STRIP_ROAD.w * TILE) / 2 + SIDEWALK.commercial, cy = (SY.strip + 0.5) * TILE;
  const northEdge = Math.floor((cy - half) / TILE), southEdge = Math.ceil((cy + half) / TILE);
  const st = (c) => [Math.floor(((c + 0.5) * TILE - 3 * TILE - SIDEWALK.commercial) / TILE), Math.ceil(((c + 0.5) * TILE + 3 * TILE + SIDEWALK.commercial) / TILE)];
  const [cw0, cw1] = st(SX.cactus), [sw0, sw1] = st(SX.silver);
  RESORTS.forEach((R, i) => {
    const [x0, y0, x1, y1] = R.lot;
    assert.ok(x0 >= X0 && y0 >= Y0 && x1 <= X1 && y1 <= Y1, `${R.name} inside the plan`);
    assert.ok(R.face === 'S' ? y1 <= northEdge : y0 >= southEdge, `${R.name} clear of the Strip's pavement (${y0}-${y1}; ${northEdge}, ${southEdge})`);
    assert.ok(x0 >= sw1 && !(x0 < cw1 && x1 > cw0 && R.face === 'N'), `${R.name} clear of Silver Street and Cactus Street`);
    for (const Q of RESORTS.slice(i + 1)) { const [a0, b0, a1, b1] = Q.lot; assert.ok(x1 <= a0 || a1 <= x0 || y1 <= b0 || b1 <= y0, `${R.name} apart from ${Q.name}`); }
  });
  assert.equal(new Set(RESORTS.map((R) => R.look)).size, RESORTS.length, 'every resort its own look');
  // the skybridge: from Mesa Grande's forecourt (north) to Casa del Sol's (south), over the Strip
  const MG = RESORTS.find((R) => R.name === 'Mesa Grande'), CS = RESORTS.find((R) => R.name === 'Casa del Sol');
  for (const R of [MG, CS]) assert.ok(SKYBRIDGE.x >= R.lot[0] + 2 && SKYBRIDGE.x < R.lot[2] - 2, `the skybridge lands on ${R.name}`);
  assert.ok(SKYBRIDGE.north + 3 <= northEdge + 1 && SKYBRIDGE.north >= MG.lot[3] - 4 && SKYBRIDGE.south >= southEdge - 1 && SKYBRIDGE.south <= CS.lot[1] + 2, 'its towers on the forecourts either side');
  assert.ok(SKYBRIDGE.z >= 90, 'high over the traffic');
  assert.ok(STRIP_ROAD.w >= 13 && STRIP_ROAD.median >= 96, 'a palm-median boulevard');
  assert.deepEqual(STRIP.streets(), [], 'its streets are Lucky Mesa\'s (world3-mesa.js)');
});
