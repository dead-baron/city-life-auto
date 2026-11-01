// The red rock desert by hand (the nature showcase, 2026-10-31: shared/redrock.js, shared/mapcore.js CANYON; concepts N4,
// NT1-B, SC3-F): Red Rock Canyon's rock from its shapes (the mask the map reads), the oasis pool under the tower mass
// with its spring and palms, the wash walkable under the arch; every tinaja a waterhole in a dry wash; the trailhead on
// the highway with its gate, ramada, board, water tower, cairns and 4x4s; the kit's stacks solid and standing on open
// ground; the ground bake's wash bed (washPx). One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, T } from '../shared/constants.js';
import { SCENE_MASKS } from '../shared/interior-art.js';
import { CANYON, inCanyonRock } from '../shared/mapcore.js';
import { washPx, MATERIALS as M_ } from '../client/art2/game/groundbake.js';
import { buildWorld3 } from '../server/world3.js';

test('the canyon\'s mask is made from its shapes', () => {
  const mk = SCENE_MASKS.canyon;
  assert.equal(mk.w, CANYON.w); assert.equal(mk.h, CANYON.h); assert.equal(mk.rows.length, CANYON.h);
  let rock = 0;
  for (let y = 0; y < mk.h; y++) for (let x = 0; x < mk.w; x++) { assert.equal(mk.rows[y][x] === '#', inCanyonRock(x + 0.5, y + 0.5)); if (mk.rows[y][x] === '#') rock++; }
  assert.ok(rock > 600, `rock tiles ${rock}`);
  // the wash runs clear under the arch, the pool's basin is open
  for (let y = 0; y < 22; y++) assert.equal(mk.rows[y][37], 's', `the wash under the arch, row ${y}`);
  assert.equal(mk.rows[Math.floor(CANYON.pool.y)][Math.floor(CANYON.pool.x)], 's');
});

test('a dry wash\'s bed in the ground bake: gravel and mud along its line, nothing off it', () => {
  const list = [{ pts: [[1000, 1000], [1000, 1600], [1300, 2000]], hw: 80, bb: [880, 880, 1420, 2120] }];
  let bed = 0, mud = 0, off = 0;
  for (let y = 1000; y < 1600; y += 4) { const q = washPx(list, 1000, y, 7); if (q === M_.WASH) bed++; else if (q === M_.CRACKED) mud++; }
  for (let y = 1000; y < 1600; y += 20) if (washPx(list, 1200, y, 7) !== -1) off++;
  assert.ok(bed > 60, `gravel down its middle (${bed})`);
  assert.ok(mud >= 1, `mud where water stood (${mud})`);
  assert.equal(off, 0, 'nothing 200 px off it');
});

test('World v3: the red rock desert by hand - the canyon oasis, the waterholes, the trailhead', { timeout: 600000 }, async () => {
  const { map: m } = await buildWorld3(1337, { log: () => {} });
  const tileAt = (x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  const solidNear = (x, y, r) => { for (let ty = Math.floor((y - r - 64) / TILE); ty <= Math.floor((y + r + 64) / TILE); ty++) for (let tx = Math.floor((x - r - 64) / TILE); tx <= Math.floor((x + r + 64) / TILE); tx++) for (const e of m.solidProps.get(ty * m.w + tx) || []) if (Math.hypot(e.x - x, e.y - y) <= r + e.r) return true; return false; };
  const R = m.world3.redrock;
  // the canyon
  const o = m.natureSites.find((s) => s.kind === 'oasis'), pt = m.paintings.find((p) => p.key === 'canyon');
  assert.ok(o && pt && R.canyon, 'the oasis');
  assert.equal(tileAt(o.x, o.y), T.WATER, 'its pool you can swim in');
  assert.equal(m.lake[m.idx(Math.floor(o.x / TILE), Math.floor(o.y / TILE))], 2, 'still water');
  assert.ok(m.waters.lk.some((L) => L.t === 'alpine' && o.x / TILE >= L.box[0] && o.x / TILE < L.box[2]), 'clear turquoise');
  assert.equal(tileAt(o.spring.x, o.spring.y - 40), T.WALL, 'the spring falls down the rock');
  const near = (t, x, y, r) => m.props.filter((q) => q && q.t === t && Math.hypot(q.x - x, q.y - y) < r);
  assert.ok(near('palm_a', o.x, o.y, 260).length >= 4, 'palms round the pool');
  assert.ok(near('boulder', o.x, o.y, 160).filter((q) => tileAt(q.x, q.y) === T.WATER).length >= 2, 'boulders in the water');
  for (let y = 0; y < 20; y++) assert.notEqual(m.tiles[m.idx(Math.round(pt.x / TILE) + 37, Math.round(pt.y / TILE) + y)], T.WALL, 'the wash walkable under the arch');
  assert.ok(near('roadrunner', pt.x + pt.w / 2, pt.y + pt.h / 2, 1400).length && near('lizard', pt.x + pt.w / 2, pt.y + pt.h / 2, 1400).length, 'the roadrunner and the lizard');
  assert.ok(m.parking.some((p) => p.model === 'pickup' && Math.hypot(p.x - o.x, p.y - o.y) < 500), 'the pickup at the turnaround');
  // the waterholes
  const tin = m.natureSites.filter((s) => s.kind === 'tinaja');
  assert.equal(R.waterholes.length, tin.length);
  for (const s of tin) {
    assert.ok(m.washes.some((w) => Math.hypot(w.pts[0][0] - s.x, w.pts[0][1] - s.y) < 200), 'a wash from the waterhole');
    assert.ok(near('tree_a', s.x, s.y, 160).some((q) => q.sp === 'mesquite'), 'the shade tree over it');
  }
  // the trailhead
  const th = R.trailhead;
  assert.ok(th, 'the trailhead is laid');
  const [gx, gy] = th.gate;
  assert.equal(near('rgate', gx, gy, 10).length, 1, 'the ranch gate');
  for (const t of ['ramada', 'picnic', 'mapboard', 'watertower']) assert.ok(near(t, gx, gy, 20 * TILE).length >= 1, `the ${t}`);
  assert.ok(near('rcairn', gx, gy, 30 * TILE).length >= 3, 'cairns up the trail');
  assert.ok(m.natureSites.some((q) => q.kind === 'trailhead' && q.trailhead), 'the trailhead on the map');
  assert.ok(m.parking.filter((p) => (p.model === 'jeep' || p.model === 'rescue4x4') && Math.hypot(p.x - th.lot[0], p.y - th.lot[1]) < 8 * TILE).length === 2, 'the 4x4s in the lot');
  for (const p of m.parking.filter((q) => q.model === 'jeep' && Math.hypot(q.x - th.lot[0], q.y - th.lot[1]) < 8 * TILE)) assert.notEqual(tileAt(p.x, p.y), T.ROAD, 'parked off the road');
  // the stacks: on open ground, solid at their middle, never on a road
  const st = m.props.filter((q) => q && q.t === 'rstack');
  assert.ok(st.length >= 15, `stacks (${st.length})`);
  for (const q of st) { assert.ok([T.DIRT, T.SAND, T.GRASS].includes(tileAt(q.x, q.y)), `a stack on open ground at ${q.x / TILE | 0}, ${q.y / TILE | 0}`); assert.ok(solidNear(q.x, q.y, 4), 'a stack is solid'); }
});
