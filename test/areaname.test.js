// The place name on the HUD's title card (client/areaname.js): the water doesn't change it (the owner, 2026-10-15:
// "passing over any water like on the train says you're in the bay for a second"). On small maps made here: two
// districts either side of a channel of sea, a river through a district, the open sea far from land, a coast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CityMap, DISTRICTS, WATER_D } from '../shared/mapcore.js';
import { TILE, T } from '../shared/constants.js';
import { AreaTracker, AREA, landNear } from '../client/areaname.js';

const A = 1, B = 4, BAY = DISTRICTS[WATER_D].name;   // (Midtown, Downtown)
// a map w x h tiles: land of district A where a(tx, ty), of B where b(tx, ty), river where r(tx, ty), else the sea
function makeMap(w, h, a, b = () => false, r = () => false) {
  const m = new CityMap(1, w, h);
  for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
    const i = m.idx(tx, ty);
    if (r(tx, ty)) { m.tiles[i] = T.WATER; m.river[i] = 1; m.dist[i] = a(tx, ty) || b(tx, ty) ? (a(tx, ty) ? A : B) : WATER_D; }
    else if (a(tx, ty)) { m.tiles[i] = T.GRASS; m.dist[i] = A; }
    else if (b(tx, ty)) { m.tiles[i] = T.GRASS; m.dist[i] = B; }
    else { m.tiles[i] = T.WATER; m.dist[i] = WATER_D; }
  }
  m.softEdge = true;
  return m;
}
// go along a path of tile points at speed px/s: every name put up on the card, in order
function travel(m, path, { speed = 420, o = {}, tracker = new AreaTracker(), t0 = 0 } = {}) {
  const shown = [];
  let now = t0;
  for (let k = 0; k < path.length; k++) {
    const [tx, ty] = path[k];
    if (k) now += Math.hypot(tx - path[k - 1][0], ty - path[k - 1][1]) * TILE / speed;
    const a = tracker.update(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE, now, o);
    if (a) shown.push(a.name);
  }
  // (and a while standing at the end)
  for (let s = 0; s < 40; s++) { now += 0.1; const [tx, ty] = path[path.length - 1]; const a = tracker.update(m, (tx + 0.5) * TILE, (ty + 0.5) * TILE, now, o); if (a) shown.push(a.name); }
  return shown;
}
const line = (x0, y0, x1, y1, n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) => Array.from({ length: n + 1 }, (_, k) => [Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n)]);

test('over a channel of sea between two districts (a bridge, the train): never the bay', () => {
  // A west of x 100, B east of x 160: 60 tiles of sea between (wider than the widest rail crossing's middle: 43 tiles out)
  const m = makeMap(260, 60, (x) => x < 100, (x) => x >= 160);
  for (const o of [{}, { train: true }]) assert.deepEqual(travel(m, line(20, 30, 240, 30), { o }), [DISTRICTS[A].name, DISTRICTS[B].name], JSON.stringify(o));
  // slowly too (walking a footbridge): still not
  assert.deepEqual(travel(m, line(20, 30, 240, 30), { speed: 90 }), [DISTRICTS[A].name, DISTRICTS[B].name]);
});

test('a river through a district keeps its name; one between two keeps the one you came from until the far bank', () => {
  // A all over, a river 12 tiles wide down the middle (its tiles the sea's district - a canal as the old city has them)
  const m = makeMap(200, 60, () => true, () => false, (x) => x >= 94 && x < 106);
  for (let ty = 0; ty < 60; ty++) for (let tx = 94; tx < 106; tx++) m.dist[m.idx(tx, ty)] = WATER_D;
  assert.deepEqual(travel(m, line(20, 30, 180, 30)), [DISTRICTS[A].name]);
  // and swimming along it a long way: still A
  assert.deepEqual(travel(m, line(100, 2, 100, 58), { speed: 60, o: { afloat: true } }), [DISTRICTS[A].name]);
  // a river between A (west) and B (east), its water each side's own: A, then B once you're on B's bank
  const m2 = makeMap(200, 60, (x) => x < 100, (x) => x >= 100, (x) => x >= 94 && x < 106);
  assert.deepEqual(travel(m2, line(20, 30, 180, 30)), [DISTRICTS[A].name, DISTRICTS[B].name]);
});

test('well out at sea the bay comes up - after a moment - and stays till you are back by the shore', () => {
  // A on the west 40 tiles; open sea east of it, 200 tiles of it
  const m = makeMap(260, 120, (x) => x < 40);
  // by boat, out from the shore: A, then the bay once past AREA.AFLOAT_T tiles out (and SEA_S seconds)
  const T1 = new AreaTracker();
  const out = travel(m, line(30, 60, 200, 60), { speed: 200, o: { afloat: true }, tracker: T1 });
  assert.deepEqual(out, [DISTRICTS[A].name, BAY]);
  // back toward the shore: the bay till right by it (BACK_T), then A
  const back = travel(m, line(200, 60, 30, 60), { speed: 200, o: { afloat: true }, tracker: T1, t0: 100 });
  assert.deepEqual(back, [DISTRICTS[A].name]);
  // a car's ferry, a long bridge out there (not afloat): only past AREA.NEAR_T
  assert.deepEqual(travel(m, line(30, 60, 40 + AREA.NEAR_T - 4, 60), { speed: 300 }), [DISTRICTS[A].name], 'short of NEAR_T: still A');
  assert.deepEqual(travel(m, line(30, 60, 200, 60), { speed: 300 }), [DISTRICTS[A].name, BAY]);
  // on a train: never
  assert.deepEqual(travel(m, line(30, 60, 200, 60), { speed: 300, o: { train: true } }), [DISTRICTS[A].name]);
  // a quick dash out past the line and back doesn't flash it up (SEA_S)
  const T2 = new AreaTracker();
  travel(m, line(30, 60, 39, 60), { tracker: T2 });
  const dash = travel(m, [...line(39, 60, 40 + AREA.AFLOAT_T + 6, 60), ...line(40 + AREA.AFLOAT_T + 6, 60, 39, 60)], { speed: 600, o: { afloat: true }, tracker: T2, t0: 50 });
  assert.deepEqual(dash, []);
});

test('along a ragged coast: no back and forth', () => {
  // A's coast at x ~100, wobbling 3 tiles every few rows: walk down it on the waterline
  const m = makeMap(200, 200, (x, y) => x < 100 + ((y >> 2) & 1) * 3);
  assert.deepEqual(travel(m, line(101, 5, 101, 195), { speed: 120 }), [DISTRICTS[A].name]);
  // starting out on the water by the coast with nothing shown yet: the nearest land's name
  const T3 = new AreaTracker();
  assert.deepEqual(travel(m, [[110, 100]], { tracker: T3 }), [DISTRICTS[A].name]);
});

test('landNear: the nearest land of a district within reach, on the window only', () => {
  const m = makeMap(120, 40, (x) => x < 20);
  assert.equal(landNear(m, 30, 20, 48).id, A);
  assert.ok(Math.abs(landNear(m, 30, 20, 48).d - 11) <= AREA.STEP_T, 'about 11 tiles off');
  assert.equal(landNear(m, 100, 20, 48), null, '80 tiles out: none within 48');
  assert.equal(landNear(m, 19, 20, 4).d, 0, 'on land: right here');
});
