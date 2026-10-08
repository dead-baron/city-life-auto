// The island ferries (server/systems/ferries.js): routes worked out from the map (a pier on the mainland, one on the
// island, the way across on open water), the boats keeping their timetable, walking aboard, driving aboard the car ferry
// and off at the far side.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import * as ferries from '../server/systems/ferries.js';
import * as vehicles from '../server/systems/vehicles.js';
import { findInteraction } from '../server/systems/players.js';
import { FERRY_FARE, FERRY_CAR_FARE } from '../shared/rules.js';
import { T } from '../shared/constants.js';

const routeTo = (world, island) => ferries.ferryRoutes(world).find((R) => R.island === island);
// the boat on a route, once it's out (the ferries spawn on the first ticks)
function boatOf(world, R) {
  for (let t = 0; t < 40 && !(world.ferries && world.ferries[R.id].v); t++) world.step();
  const F = world.ferries[R.id];
  return { F, v: world.get(F.v) };
}
// on to the next part of the trip at once (the test doesn't wait out the timetable)
function skip(world, F) { F.t0 = world.time - F.dur - 0.01; world.step(); }
function skipTo(world, F, phase, end) { for (let k = 0; k < 12 && !(F.phase === phase && F.end === end); k++) skip(world, F); assert.equal(F.phase, phase); assert.equal(F.end, end); }

test('ferry routes: the car ferry to Gull Harbor, water buses to the small islands, every way across on open water', () => {
  const world = makeWorld();
  const routes = ferries.ferryRoutes(world);
  assert.ok(routes.length >= 3, `only ${routes.length} routes`);
  const gull = routes.find((R) => R.island === 'Gull Harbor');
  assert.ok(gull && gull.car && gull.model === 'ferry', 'a car ferry to Gull Harbor');
  assert.ok(routes.some((R) => !R.car && R.model === 'waterbus'), 'water buses for foot passengers');
  const m = world.map, water = (x, y) => { const t = m.tileAtPx(x, y); return t === T.WATER || t === T.DEEP; };
  for (const R of routes) {
    assert.ok(R.mainland && R.island, `${R.name}: both piers named`);
    for (const e of R.ends) {
      // lying at the pier: its stern by a dock (or for a car ferry, a street's end at the water), the boat on the water,
      // the way out to its turning point clear, and room to turn round there
      let dock = false;
      for (let dy = -40; dy <= 40 && !dock; dy += 8) for (let dx = -40; dx <= 40 && !dock; dx += 8) { const t = m.tileAtPx(e.sx + dx, e.sy + dy); if (t === T.DOCK || (R.car && (t === T.ROAD || t === T.LOT || t === T.PLAZA))) dock = true; }
      assert.ok(dock, `${R.name}: a dock at the stern`);
      assert.ok(water(e.x, e.y), `${R.name}: the boat on the water`);
      for (let f = 0.05; f <= 1; f += 0.05) assert.ok(water(e.x + (e.turn.x - e.x) * f, e.y + (e.turn.y - e.y) * f), `${R.name}: the way out of the pier is water`);
      const half = (R.car ? 470 : 240) / 2;
      for (let a = 0; a < 6.28; a += 0.2) assert.ok(water(e.turn.x + Math.cos(a) * half, e.turn.y + Math.sin(a) * half), `${R.name}: room to turn`);
      if (R.car) assert.ok(e.land && !water(e.land.x, e.land.y), `${R.name}: a landing for the cars`);
    }
    // across: every point of the way on water, with water either side of the hull
    const W = R.car ? 75 : 38;
    for (let i = 1; i < R.way.length; i++) {
      const a = R.way[i - 1], b = R.way[i], L = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
      for (let s = 0; s <= L; s += 32) for (const side of [-W, 0, W]) {
        const x = a.x + (b.x - a.x) * (s / L) + nx * side, y = a.y + (b.y - a.y) * (s / L) + ny * side;
        assert.ok(water(x, y), `${R.name}: dry land on the way across at ${Math.round(x / 32)},${Math.round(y / 32)}`);
      }
    }
  }
  // not two routes from one pier
  for (const A of routes) for (const B of routes) if (A !== B) for (const e of A.ends) for (const f of B.ends) assert.ok(Math.hypot(e.x - f.x, e.y - f.y) > 500, `${A.name} and ${B.name} share a pier`);
});

test('a ferry keeps its timetable: in at the pier, out bow first, swung round, across, turned round, backed in at the far pier', () => {
  const world = makeWorld({ ferries: true });
  const R = ferries.ferryRoutes(world).slice().sort((a, b) => a.len - b.len)[0];   // the shortest crossing
  const { F, v } = boatOf(world, R);
  assert.ok(v && v.ferry, 'the boat is out');
  const phases = [F.phase];
  let last = { x: v.x, y: v.y, a: v.a }, maxStep = 0, maxTurn = 0;
  for (let t = 0; t < 20 * 120; t++) {
    world.step();
    maxStep = Math.max(maxStep, Math.hypot(v.x - last.x, v.y - last.y));
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(v.a - last.a), Math.cos(v.a - last.a))));
    last = { x: v.x, y: v.y, a: v.a };
    if (phases[phases.length - 1] !== F.phase) phases.push(F.phase);
    if (F.phase === 'dock' && F.end === 1) break;
  }
  assert.deepEqual(phases, ['dock', 'leave', 'swing', 'cross', 'turn', 'back', 'dock'], 'the trip in order');
  assert.ok(maxStep < 20, `smooth: no jumps (${maxStep.toFixed(1)} px in a tick)`);
  assert.ok(maxTurn < 0.1, `smooth: no sudden swings (${maxTurn.toFixed(2)} rad in a tick)`);
  const e = R.ends[1];
  assert.ok(Math.hypot(v.x - e.x, v.y - e.y) < 1, 'in at the far pier');
  assert.ok(Math.abs(Math.atan2(Math.sin(v.a - e.a), Math.cos(v.a - e.a))) < 0.01, 'stern to the dock');
  // it can't be taken or hurt
  const hp = v.hp;
  vehicles.damageVehicle(world, v, 1e6, null, true, true);
  assert.equal(v.hp, hp);
  assert.ok(!v.wreckAt && !v.dead);
  const { p } = joinPlayer(world);
  teleport(world, p.ped, e.sx - e.ox * 30, e.sy - e.oy * 30);
  assert.equal(vehicles.tryEnter(world, p.ped), false, 'not taken');
});

test('walk aboard for the fare, ride across, get off at the far pier', () => {
  const world = makeWorld({ ferries: true });
  const R = ferries.ferryRoutes(world).find((q) => !q.car);
  const { F, v } = boatOf(world, R);
  const { p } = joinPlayer(world, { cash: 40 });
  const e0 = R.ends[0];
  teleport(world, p.ped, e0.sx - e0.ox * 30, e0.sy - e0.oy * 30);
  const act = findInteraction(world, p);
  assert.match(act && act.label, new RegExp(`Board the ${R.name} to ${R.island}`));
  act.run();
  assert.equal(p.ped.vehId, v.id);
  assert.ok(p.ped.seat > 0, 'a passenger seat');
  assert.equal(p.profile.cash, 40 - FERRY_FARE);
  assert.equal(ferries.rideInfo(world, p).k, 'ferry');
  // across (a little of the crossing for real), in at the island
  skipTo(world, F, 'cross', 0);
  run(world, 2);
  const info = ferries.rideInfo(world, p);
  assert.equal(info.at, null);
  assert.match(info.next, new RegExp(R.island));
  assert.ok(info.eta > 0);
  assert.ok(Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 1, 'aboard');
  skipTo(world, F, 'dock', 1);
  assert.match(ferries.rideInfo(world, p).at, new RegExp(R.island));
  vehicles.exitVehicle(world, p.ped);
  assert.equal(p.ped.vehId, 0);
  const e1 = R.ends[1], t = world.map.tileAtPx(p.ped.x, p.ped.y);
  assert.ok(t !== T.WATER && t !== T.DEEP, 'off onto the pier, not into the sea');
  assert.ok(Math.hypot(p.ped.x - e1.sx, p.ped.y - e1.sy) < 120, 'at the island pier');
});

test('no fare, no ferry; and none once it has gone', () => {
  const world = makeWorld({ ferries: true });
  const R = ferries.ferryRoutes(world).find((q) => !q.car);
  const { F } = boatOf(world, R);
  const { p } = joinPlayer(world, { cash: 0, bank: 0 });
  const e0 = R.ends[0];
  teleport(world, p.ped, e0.sx - e0.ox * 30, e0.sy - e0.oy * 30);
  const act = ferries.interaction(world, p);
  assert.ok(act);
  assert.equal(act.run(), false);
  assert.equal(p.ped.vehId, 0);
  skip(world, F);   // (out it goes)
  assert.equal(ferries.interaction(world, p), null);
});

test('drive aboard the car ferry: the car rides on the deck and comes off on the landing at the far side', () => {
  const world = makeWorld({ ferries: true });
  const R = routeTo(world, 'Gull Harbor');
  const { F, v } = boatOf(world, R);
  const { p } = joinPlayer(world, { cash: 100 });
  const e0 = R.ends[0];
  const car = world.spawnVehicle('sedan', e0.land.x, e0.land.y, Math.atan2(e0.oy, e0.ox), { npcOwned: false });
  teleport(world, p.ped, car.x + 40, car.y);
  assert.ok(vehicles.tryEnter(world, p.ped), 'in the car');
  run(world, 1);
  assert.equal(p.ped.vehId, car.id);
  const act = findInteraction(world, p);
  assert.match(act && act.label, /Drive aboard the Gull Harbor Ferry/);
  act.run();
  assert.equal(p.profile.cash, 100 - FERRY_CAR_FARE);
  assert.ok(car.onDeck && car.onDeck.f === v.id, 'on the deck');
  world.step();
  // on the deck: inside the hull, up at the deck's height, going where the boat goes
  const c = Math.cos(v.a), s = Math.sin(v.a), dx = car.x - v.x, dy = car.y - v.y;
  assert.ok(Math.abs(dx * c + dy * s) < v.def.L / 2 && Math.abs(-dx * s + dy * c) < v.def.W / 2, 'on the boat');
  assert.equal(car.lz, ferries.DECK_LZ);
  assert.ok(ferries.rideInfo(world, p).car, 'the HUD knows');
  // changed your mind: drive off again at this pier
  const off = ferries.interaction(world, p);
  assert.equal(off && off.label, 'Drive off the ferry');
  off.run();
  assert.equal(car.onDeck, null);
  assert.ok(Math.hypot(car.x - e0.land.x, car.y - e0.land.y) < 320 && car.lz === 0, 'back on the landing');
  // aboard again, and across
  ferries.interaction(world, p).run();
  assert.ok(car.onDeck);
  skipTo(world, F, 'cross', 0);
  run(world, 3);
  assert.ok(car.onDeck && !car.sinkAt && !car.wreckAt && !car.dead, 'riding the deck over the water, dry');
  assert.equal(p.ped.vehId, car.id);
  skipTo(world, F, 'dock', 1);
  const e1 = R.ends[1];
  assert.equal(car.onDeck, null, 'driven off at the far side');
  assert.equal(car.lz, 0);
  const t = world.map.tileAtPx(car.x, car.y);
  assert.ok(t !== T.WATER && t !== T.DEEP, 'on land');
  assert.ok(Math.hypot(car.x - e1.land.x, car.y - e1.land.y) < 320, 'on the island landing');
  assert.equal(p.ped.vehId, car.id, 'still at the wheel');
  run(world, 2);
  assert.ok(!car.sinkAt, 'and stays dry');
});

test('out of the car on the deck: up to a seat aboard; the car comes off at the far side by itself', () => {
  const world = makeWorld({ ferries: true });
  const R = routeTo(world, 'Gull Harbor');
  const { F, v } = boatOf(world, R);
  const { p } = joinPlayer(world, { cash: 100 });
  const e0 = R.ends[0];
  const car = world.spawnVehicle('pickup', e0.land.x, e0.land.y, 0, { npcOwned: false });
  teleport(world, p.ped, car.x + 40, car.y);
  vehicles.tryEnter(world, p.ped);
  run(world, 1);
  ferries.interaction(world, p).run();
  skipTo(world, F, 'cross', 0);
  vehicles.exitVehicle(world, p.ped);
  assert.equal(p.ped.vehId, v.id, 'up in a seat on the ferry');
  assert.ok(car.onDeck, 'the car stays on the deck');
  skipTo(world, F, 'dock', 1);
  assert.equal(car.onDeck, null);
  const t = world.map.tileAtPx(car.x, car.y);
  assert.ok(t !== T.WATER && t !== T.DEEP, 'the car is on the island landing');
});

test('a bus is too long for the car deck', () => {
  const world = makeWorld({ ferries: true });
  const R = routeTo(world, 'Gull Harbor');
  boatOf(world, R);
  const { p } = joinPlayer(world, { cash: 100 });
  const e0 = R.ends[0];
  const bus = world.spawnVehicle('bus', e0.land.x, e0.land.y, 0, { npcOwned: false });
  teleport(world, p.ped, bus.x + 40, bus.y);
  vehicles.tryEnter(world, p.ped);
  run(world, 1);
  const act = ferries.interaction(world, p);
  assert.match(act.label, /won't fit/);
  assert.equal(act.run(), false);
  assert.equal(p.profile.cash, 100);
  assert.ok(!bus.onDeck);
});

test('the Transit app: each route, its piers, when its boat next leaves each, and where the boat is', () => {
  const world = makeWorld({ ferries: true });
  boatOf(world, ferries.ferryRoutes(world)[0]);
  const info = ferries.ferryInfo(world);
  assert.equal(info.length, ferries.ferryRoutes(world).length);
  for (const R of info) {
    assert.equal(R.piers.length, 2);
    assert.ok(R.path.length >= 3);
    assert.ok(R.boat, `${R.name}: its boat`);
    assert.equal(R.boat.in, 0, 'in at the mainland pier to start');
    assert.ok(R.leaves[0] <= 20 && R.leaves[1] > R.leaves[0], `${R.name}: leaves ${R.leaves}`);
  }
});

// ---- the look --------------------------------------------------------------------------------------------------------
import { vehicleModel, vehicleAnchors } from '../client/art2/vehicles.js';
import { compactVox, halveVox, renderCompact } from '../client/art2/game/actors.js';

test('the ferries\' models: kept at half resolution in the game (a phone can hold the car ferry), drawn the same size', () => {
  for (const t of ['ferry', 'waterbus']) {
    const half = compactVox(halveVox(vehicleModel(t, { dry: true }), 2));
    assert.ok(half.bytes < (t === 'ferry' ? 8e6 : 2e6), `${t}: ${(half.bytes / 1e6).toFixed(1)} MB packed`);
    const full = compactVox(vehicleModel(t, {}));
    for (const hi of [0, 5]) {
      const a = renderCompact(full, hi * Math.PI / 16, { px: 2 }), b = renderCompact(half, hi * Math.PI / 16, { px: 2 });
      assert.ok(Math.abs(a.w - b.w) <= 2 && Math.abs(a.h - b.h) <= 2, `${t}: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
      let na = 0, nb = 0;
      for (let i = 3; i < a.col.length; i += 4) if (a.col[i]) na++;
      for (let i = 3; i < b.col.length; i += 4) if (b.col[i]) nb++;
      assert.ok(Math.abs(na - nb) / na < 0.08, `${t}: as much of it drawn (${na} vs ${nb} px)`);
    }
    // its lamps and the like come without building it (the page asks while lighting the scene)
    const A = vehicleAnchors(t);
    assert.equal(A.L, VEHICLE_DIMS_OF(t)[0]);
  }
});
const VEHICLE_DIMS_OF = (t) => ({ ferry: [470, 150], waterbus: [240, 76] })[t];
