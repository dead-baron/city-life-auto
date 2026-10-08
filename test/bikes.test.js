// Bicycles (design notes 2026-10-07, "More bicycles"): six kinds, each with its own feel - the beach cruiser steady and
// slowest, the mountain bike the one that copes off-road, the road bike fastest on tarmac and poor off it, the BMX small
// and nimble, the commuter bike, the cargo bike that carries two crates - all faster than running on a road. NPC
// cyclists ride in traffic (never on the highway), bikes stand locked at the street racks, and stealing one is a crime
// people notice from less far than a car theft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { VEHICLES, PEDAL_BIKES } from '../shared/vehicles.js';
import { vehStep, newVehState, PED } from '../shared/physics.js';
import * as law from '../server/systems/law.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as traffic from '../server/systems/traffic.js';
import * as economy from '../server/systems/economy.js';
import { spawnNpc } from '../server/systems/npc.js';

// flat ground of one kind as far as the eye can see
const flat = (t) => ({ w: 4096, h: 4096, tileAt: () => t, tileAtPx: () => t, solidProps: new Map(), levels: null });
// top speed on that ground, flat out for a few seconds
function topSpeed(id, t) {
  const def = VEHICLES[id], s = newVehState(15000, 15000, 0), m = flat(t);
  let top = 0;
  for (let i = 0; i < 20 * 6; i++) { vehStep(s, { throttle: 1, steer: 0, hb: false, slide: false, drv: true }, 0.05, m, def, { rain: false }); top = Math.max(top, Math.hypot(s.vx, s.vy)); }
  return top;
}

test('bicycles: six kinds, all faster than running on the road; the mountain bike keeps its speed on rough ground, the road bike loses it', () => {
  assert.deepEqual(PEDAL_BIKES.sort(), ['bicycle', 'bmx', 'cargobike', 'cruiser', 'mtb', 'roadbike']);
  const run = PED.aSprint;
  const road = {}, grass = {}, sand = {};
  for (const id of PEDAL_BIKES) { road[id] = topSpeed(id, T.ROAD); grass[id] = topSpeed(id, T.GRASS); sand[id] = topSpeed(id, T.SAND); }
  for (const id of PEDAL_BIKES) assert.ok(road[id] > run * 1.2, `${id}: ${Math.round(road[id])} px/s on the road, faster than a sprint (${run})`);
  assert.equal(Math.max(...Object.values(road)), road.roadbike, 'the road bike is fastest on tarmac');
  assert.equal(Math.min(...Object.values(road)), road.cargobike, 'the loaded-down cargo bike slowest...');
  assert.ok(road.cruiser < road.bicycle && road.cruiser < road.mtb, '...and the cruiser is a slow, easy ride');
  assert.equal(Math.max(...Object.values(grass)), grass.mtb, 'off-road the mountain bike is fastest');
  assert.ok(grass.mtb > road.mtb * 0.85, 'and hardly slows on grass');
  assert.ok(grass.roadbike < road.roadbike * 0.5 && grass.roadbike < grass.bicycle, 'the road bike is poor off it');
  assert.ok(sand.cruiser > sand.bicycle && sand.cruiser > sand.roadbike, 'the beach cruiser\'s fat tyres take the sand');
  assert.equal(VEHICLES.cargobike.slots.length, 2, 'the cargo bike carries two crates');
  assert.ok(VEHICLES.bmx.turn > VEHICLES.bicycle.turn && VEHICLES.bmx.L < VEHICLES.bicycle.L, 'the BMX: small and nimble');
  // in the water every bike is as stuck as a car: nobody pedals faster through the sea on knobby tyres
  assert.ok(Math.abs(topSpeed('mtb', T.WATER) / VEHICLES.mtb.max - topSpeed('bicycle', T.WATER) / VEHICLES.bicycle.max) < 0.02);
});

test('bicycles: the dealer sells all six; bikes stand at the street racks', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  const dealer = w.map.pois.find((q) => q.kind === 'dealer');
  const opts = economy.buildMenu(w, p, dealer).opts.map((o) => o.id);
  for (const id of PEDAL_BIKES) assert.ok(opts.includes(`vb:${id}`), `the dealer sells the ${VEHICLES[id].name}`);
  // the racks: a bike or so locked up at about half of them, on the pavement, front wheel to the rack
  const racks = w.map.props.filter((q) => q.t === 'bikerack');
  assert.ok(racks.length > 20, `${racks.length} street bike racks`);
  let withBikes = 0;
  for (const r of racks.slice(0, 16)) {
    teleport(w, p.ped, r.x, r.y + 70); p.teleportAt = w.time;
    for (let i = 0; i < 16; i++) w.step();
    const bikes = w.query(r.x, r.y, 50, K.VEH).filter((v) => v.def.pedal);
    if (!bikes.length) continue;
    withBikes++;
    for (const v of bikes) {
      assert.ok(v.parked && !v.seats[0], 'parked, nobody on it');
      assert.ok(Math.abs(Math.abs(v.a) - Math.PI / 2) < 0.01, 'standing at right angles to the rack');
      const t = w.map.tileAtPx(v.x, v.y);
      assert.ok(t !== T.ROAD && !w.map.isWater(v.x, v.y), 'off the road');
    }
  }
  assert.ok(withBikes >= 4 && withBikes <= 14, `bikes at ${withBikes} of 16 racks`);
});

test('bicycles: an NPC cyclist rides in traffic at their own pace, at the kerb, and never up on the highway', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const road = w.map.net.edges.filter((e) => e.kind === 'ave' && e.lvl === 0 && e.len > 500)[0];
  const pt = road.pts[Math.floor(road.pts.length / 2)];
  teleport(w, p.ped, pt.x + 200, pt.y + 200);
  const v = w.spawnVehicle('bicycle', pt.x, pt.y, 0, {});
  const d = spawnNpc(w, 'casual', pt.x, pt.y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  traffic.joinTraffic(w, v);
  let top = 0, dist = 0, highest = 0;
  for (let i = 0; i < 20 * 60 && v.ai; i++) {
    w.step();
    const sp = Math.hypot(v.vx, v.vy);
    top = Math.max(top, sp); dist += sp / 20; highest = Math.max(highest, v.lz || 0);
    if (v.ai && v.ai.edge !== undefined) { const e = w.map.net.edges[v.ai.edge]; assert.ok(e.kind !== 'hwy' && e.kind !== 'ramp' && e.lvl === 0, `on a ${e.kind}`); assert.equal(v.ai.lane, 0, 'at the kerb'); }
    if (i % 20 === 0) teleport(w, p.ped, v.x + 300, v.y + 300);   // (keep it near a player)
  }
  assert.ok(dist > 4000, `rode ${Math.round(dist)} px in a minute`);
  assert.ok(top < VEHICLES.bicycle.max * 0.85 && top > PED.aRun, `at a cyclist's pace (${Math.round(top)} px/s)`);
  assert.equal(highest, 0, 'never up on the deck');
});

test('bicycles: stealing one is a lesser crime than a car, and people notice it from less far', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const r = straightRoad(w.map, 900);   // (a long straight street: nothing in the way along it)
  const x = r.x + 200, y = r.y;
  teleport(w, p.ped, x, y);
  const saved = w.map.cameras; w.map.cameras = [];
  try {
    // an officer facing it, 300 px off: a car theft they see, a bike lifted they miss
    const cop = spawnNpc(w, 'cop', x + 300, y, 'cop');
    cop.a = Math.PI; cop.x = x + 300; cop.y = y;
    assert.ok(law.witnesses(w, x, y, p.ped, null, false, 'theft').count >= 1, 'a car theft: seen');
    assert.equal(law.witnesses(w, x, y, p.ped, null, false, 'bikeTheft').count, 0, 'a bike theft: missed at that range');
    cop.x = x + 150;
    assert.ok(law.witnesses(w, x, y, p.ped, null, false, 'bikeTheft').count >= 1, 'closer: seen');
    w.remove(cop);
    assert.ok(law.CRIMES.bikeTheft.heat < law.CRIMES.theft.heat && law.CRIMES.bikejack.heat < law.CRIMES.carjack.heat && !law.CRIMES.bikejack.felony);
    // riding off on a parked bike is bike theft
    const bike = w.spawnVehicle('mtb', x + 30, y, 0, { parked: true });
    const exp0 = p.profile.criminalExp;
    assert.ok(vehicles.tryEnter(w, p.ped));
    assert.equal(p.ped.vehId, bike.id);
    assert.equal(p.profile.criminalExp - exp0, Math.round(law.CRIMES.bikeTheft.heat / 2), 'booked as a bike theft');
  } finally { w.map.cameras = saved; }
});
