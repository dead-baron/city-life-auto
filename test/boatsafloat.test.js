// Every boat that looks usable is usable (the owner, 11-17: "a beached canoe/rowboat is a real vehicle (get in, push off,
// paddle)"; shared/world3-boats.js): a canoe or rowboat prop on a beach becomes a kayak or rowboat in the water beside it,
// its whole hull on water and off the rocks, bow out; one with no water near stays a prop. The whole world's count:
// test/placementlint.test.js (deadBoat, boats).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TILE } from '../shared/constants.js';
import { boatsAfloat3 } from '../shared/world3-boats.js';
import { VEHICLES } from '../shared/vehicles.js';

// 40 x 20 tiles: sand on the left (x < 20), water on the right
function shore() {
  const w = 40, h = 20, tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles[y * w + x] = x < 20 ? T.SAND : T.WATER;
  const m = { w, h, x0: 0, y0: 0, tiles, props: [], marina: [], inside: (x, y) => x >= 0 && y >= 0 && x < w && y < h, idx: (x, y) => y * w + x };
  m.tileAtPx = (px, py) => { const x = Math.floor(px / TILE), y = Math.floor(py / TILE); return m.inside(x, y) ? tiles[m.idx(x, y)] : -1; };
  return m;
}

test('a beached canoe and rowboat: real boats in the water beside them, bow out; the props gone', () => {
  const m = shore(), lamp = { t: 'lamp', x: 100, y: 100 };
  m.props.push(lamp, { t: 'canoe', x: 19 * TILE, y: 10 * TILE }, { t: 'rowboat', x: 18.5 * TILE, y: 5 * TILE });
  const out = boatsAfloat3(m);
  assert.equal(out.made, 2);
  assert.deepEqual(m.props, [lamp]);
  const [k, r] = m.marina;
  assert.equal(k.kind, 'kayak'); assert.equal(r.kind, 'rowboat');
  for (const b of m.marina) {
    assert.ok(b.beached && Math.abs(Math.cos(b.a)) > 0.9 && Math.cos(b.a) > 0, 'its bow out to the water');
    assert.ok(b.x - VEHICLES[b.kind].L / 2 + 6 >= 20 * TILE, 'its stern off the sand');
    assert.ok(Math.abs(b.x - 20 * TILE) < 5 * TILE, 'beside where it lay');
  }
});

test('no water near, on stands, or a rock in the way: handled', () => {
  const m = shore();
  m.props.push({ t: 'canoe', x: 5 * TILE, y: 10 * TILE }, { t: 'rowboat', x: 19 * TILE, y: 3 * TILE, lift: 12 });
  // a boulder just off the beach where the canoe below would go
  m.props.push({ t: 'canoe', x: 19 * TILE, y: 15 * TILE }, { t: 'boulder', x: 21.5 * TILE, y: 15 * TILE, s: 60 });
  const out = boatsAfloat3(m);
  assert.equal(out.kept, 1, 'the one far from the water stays a prop');
  assert.ok(m.props.some((p) => p.t === 'rowboat' && p.lift), 'stored on stands: left');
  const b = m.marina[0];
  assert.ok(b && Math.hypot(b.x - 21.5 * TILE, b.y - 15 * TILE) > 30 + 32, 'clear of the boulder');
});

test('the moored sailboats, yachts and fishing boats: drivable too (the owner, 11-22 15:03)', () => {
  const m = shore();
  m.props.push({ t: 'sailboat', x: 30 * TILE, y: 10 * TILE, a: 0 }, { t: 'yacht', x: 30 * TILE, y: 4 * TILE, a: 0 }, { t: 'fishboat', x: 30 * TILE, y: 16 * TILE, a: 0 });
  const out = boatsAfloat3(m);
  assert.equal(out.made, 3);
  assert.deepEqual(m.marina.map((b) => b.kind), ['sailboat', 'cabincruiser', 'trawler']);
  assert.equal(m.props.length, 0);
  for (const b of m.marina) assert.ok(VEHICLES[b.kind] && VEHICLES[b.kind].kind === 'boat');
});
