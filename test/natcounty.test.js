// Willow Valley's county roads made the concept (the nature showcase, SC3-E: shared/world3-countyroad.js) - the hero
// stretch of Orchard Road and the kit along three more - and their life (server/systems/countyroad.js): the farmer and
// his pickup at the gate, the combine on the half-cut wheat. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world.js';
import { joinPlayer, run, teleport } from './helpers.js';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { COUNTY3 } from '../shared/world3-countyroad.js';
import { prepare } from '../tools/world3-build.mjs';
import * as farming from '../server/systems/farming.js';

test('the county roads: the canal, the culvert, the fence and gate, sunflowers, the pond and windmill, the half-cut wheat, the farm and the combine', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const out = m.world3.countyRoads;
  console.log('county', JSON.stringify(out));
  assert.equal(out.stretches, COUNTY3.stretches.length, `missed: ${out.missed.join(', ')}`);
  assert.ok(out.canal > 300 && out.posts > 40 && out.sunflowers > 25 && out.ponds >= 2 && out.cut >= 3, JSON.stringify(out));
  const tileAt = (x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  const near = (t, x, y, r) => m.props.filter((p) => p.t === t && Math.hypot(p.x - x, p.y - y) < r);
  for (const R of m.countyRoads) {
    // the gate open from the road (its lane dirt), the canal beside the road, the culvert at the crossing, the poles
    assert.ok([T.DIRT, T.GRASS].includes(tileAt(R.gate.x, R.gate.y)), `${R.name}: the gate's ground walkable`);
    assert.ok(near('culvert', R.x, R.y, 30 * TILE).length === 1, `${R.name}: the culvert over the canal`);
    assert.ok(near('upole', R.x, R.y, 26 * TILE).length >= 4 && near('fenceline', R.x, R.y, 26 * TILE).length >= 4, `${R.name}: poles and fence`);
    let water = 0;
    for (const p of near('post', R.x, R.y, 30 * TILE)) if (p.h === 28) water++;
    assert.ok(water >= 10, `${R.name}: posts along the road's edge`);
    // the half-cut field: its cut inside it
    if (R.field >= 0) { const f = m.fields[R.field]; assert.ok(f.cut && f.cut[0] >= f.x && f.cut[2] <= f.x + f.w && f.cut[1] >= f.y && f.cut[3] <= f.y + f.h, `${R.name}: the cut`); }
  }
  const H = m.countyRoads.find((q) => q.hero);
  assert.ok(H && H.pond && H.field >= 0 && H.corn >= 0, 'the hero stretch: pond, wheat, corn');
  assert.ok(near('windmill', H.pond.x, H.pond.y, 12 * TILE).length === 1 && near('stocktank', H.pond.x, H.pond.y, 12 * TILE).length === 1, 'the windmill pump and its round trough');
  assert.equal(tileAt(H.pond.x, H.pond.y), T.WATER);
  // the canal is water and the road is untouched beside it
  let canal = 0, road = 0;
  for (let ty = Math.floor(H.y / TILE) - 10; ty <= Math.floor(H.y / TILE) + 10; ty++) { const t = m.tiles[m.idx(Math.floor(H.x / TILE) + 3, ty)]; if (t === T.WATER || t === T.DEEP) canal++; if (t === T.ROAD) road++; }
  assert.ok(canal >= 2 && road >= 4, `across the road: canal ${canal}, road ${road}`);

  // the life: the field half stubble, half ripe; someone near - the pickup, the farmer, the combine at work
  const world = new World(m, { npcBudget: 0, throwErrors: true });
  const F = farming.fieldsOf(world)[H.field];
  // (its rows along the road: each ripe, its stretches in the cut done - or, rows across it, those in the cut stubble)
  const st = F.rows.map((r) => r.s), sm = F.rows.map((r) => `${r.s}:${r.m}`);
  assert.ok(F.rows.filter((r) => r.s === farming.ROW.STUBBLE || r.m).length >= 3 && F.rows.filter((r) => r.s === farming.ROW.RIPE && (r.m & r.ok) !== r.ok).length >= 3, `rows ${sm.join(' ')}`);
  const { p } = joinPlayer(world);
  teleport(world, p.ped, H.x, H.y);
  run(world, 3);
  const S = world.countyRoads[m.countyRoads.indexOf(H)];
  const truck = world.get(S.truck), farmer = world.get(S.farmer);
  assert.ok(truck && truck.model === 'pickup' && Math.hypot(truck.x - H.pickup.x, truck.y - H.pickup.y) < 60, 'the pickup at the gate');
  assert.ok(farmer && Math.hypot(farmer.x - H.farmer.x, farmer.y - H.farmer.y) < 60, 'the farmer by it');
  assert.ok(S.combine && !S.combine.done, 'the combine at work');
  const cv = world.get(S.combine.main);
  run(world, 25);
  assert.ok(cv && F.rows.map((r) => `${r.s}:${r.m}`).join() !== sm.join(), 'cutting as it goes');
  // everyone gone: the farm packs up, the field as it was
  teleport(world, p.ped, H.x + 200 * TILE, H.y);
  run(world, 2);
  assert.ok(!world.get(S.farmer) && !world.get(S.truck), 'gone home');
  assert.deepEqual(F.rows.map((r) => `${r.s}:${r.m}`), sm);
});
