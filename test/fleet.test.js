// The batch-4 fleet and the horse (the owner's shipping notes: "Add more vehicle and boat types", "Add more helicopter
// and plane looks", "Horse animations could be better"): every new type is a valid vehicle with a model (client/art2/
// fleet.js, aircraft.js), the open beds and decks carry crates, the models stay out of the startup code (loaded when one
// is first seen), the boats are the boaters' and the marinas' (big water: test/world3fleet.test.js), and the horse is a
// model of its own whose gait is picked by its speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VEHICLES, TRUCK_MODELS } from '../shared/vehicles.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { BOAT_RENTAL_PRICE } from '../shared/rules.js';
import { closure } from '../tools/perf.mjs';
import { ENGINE_CLASS } from '../client/sound/vehicles.js';
import * as A from '../client/art2/game/actors.js';
import { VEHICLE_DIMS, vehicleModel, vehicleAnchors } from '../client/art2/vehicles.js';
import { DISTRICT_MIX, trafficMix, parkedMix } from '../server/systems/traffic.js';
import { MODELS as BOATERS } from '../server/systems/boats.js';
import { RENTAL_MODELS } from '../server/systems/rentals.js';
import { COATS, COAT_NAMES } from '../server/systems/horses.js';

const CARS = ['convertible', 'lowrider', 'muscle', 'hothatch', 'jeep', 'movingvan', 'icecream'];
const BOATS = ['sailboat', 'pontoon', 'trawler', 'cabincruiser', 'rib'];
const AIR = ['newsheli', 'medheli', 'seaplane'];
const OPEN = { jeep: 2, pontoon: 4, trawler: 4 };   // (the open beds and decks: crates ride there)
const solid = (m) => { let n = 0; for (let i = 0; i < m.v.length; i++) if (m.v[i]) n++; return n; };
void ITEMS;

test('the new types: valid vehicles, each its own index, sound, a classic stand-in; the open beds carry crates', async () => {
  const idx = Object.values(VEHICLES).map((d) => d.i);
  assert.equal(new Set(idx).size, idx.length, 'indexes unique');
  for (const id of [...CARS, ...BOATS, ...AIR]) {
    const d = VEHICLES[id];
    assert.ok(d && d.seats >= 1 && d.slots.length >= 1 && d.max > 0 && d.hp > 0, `${id}: a vehicle`);
    assert.equal(d.kind, CARS.includes(id) ? 'car' : BOATS.includes(id) ? 'boat' : 'air', id);
    assert.ok(ENGINE_CLASS[id], `${id}: its engine's sound`);
    if (d.kind !== 'air') assert.ok(d.sprite, `${id}: the classic view's stand-in`);
    for (const [f, r] of d.slots) assert.ok(Math.abs(f) <= d.L / 2 && Math.abs(r) <= d.W / 2, `${id}: its crate slots on it`);
    for (const [f, r] of d.crew || []) assert.ok(Math.abs(f) <= d.L / 2 && Math.abs(r) <= d.W / 2, `${id}: its crew aboard`);
  }
  for (const [id, n] of Object.entries(OPEN)) assert.ok(VEHICLES[id].slots.length >= n, `${id}: an open bed or deck - ${n} crate slots`);
  assert.ok(TRUCK_MODELS.has('movingvan'), 'the moving van is a truck (kept off the dirt roads)');
  // the floatplane takes off from the water: it lifts off below what the water lets it roll at (shared/flight.js rollOf 0.4)
  assert.ok(VEHICLES.seaplane.floats && VEHICLES.seaplane.vr < VEHICLES.seaplane.max * 0.4);
  // sold and hired where the pattern is: the dealer, the marina, the rental docks
  const buys = (k) => SHOPS[k].buy.map((o) => o.id);
  for (const id of CARS) assert.ok(buys('dealer').includes(id) && VEHICLES[id].price > 0, `${id} at the dealer`);
  for (const id of BOATS) assert.ok(buys('marina').includes(id) && VEHICLES[id].price > 0, `${id} at the marina`);
  for (const id of RENTAL_MODELS) assert.ok(BOAT_RENTAL_PRICE[id] > 0, `${id}: its hire price`);
  // the debug menu spawns each
  const { DEV_SECTIONS } = await import('../client/devcats.js');
  const dev = new Set(DEV_SECTIONS.flatMap((sec) => sec.items).filter(([, c, x]) => c === 'car' && x && x.m).map(([, , x]) => x.m));
  for (const id of [...CARS, ...BOATS, ...AIR]) assert.ok(dev.has(id), `${id} in the debug menu`);
});

test('every type has a model: the fleet loaded when first seen, out of the renderer\'s and the bake workers\' startup code', async () => {
  // before it's in: a stand-in, keyed as the stand-in (no wrong sprite kept under the new type's key)
  const d0 = { m: VEHICLES.sailboat.i, p: 1, vr: 0 };
  assert.equal(A.vehType(d0), 'speedboat');
  assert.ok(A.needsArt('animal', ['horse:s1']) === false, 'nothing to load until told how');
  A.artFrom({ fleet: () => import('../client/art2/fleet.js'), horse: () => import('../client/art2/horse.js') });
  assert.ok(A.needsArt('vehicle', [d0, {}, 0, 32]) && A.needsArt('animal', ['horse:s1']), 'a worker waits for the art a sprite needs');
  await A.loadArt();
  assert.ok(!A.needsArt('vehicle', [d0, {}, 0, 32]) && !A.needsArt('animal', ['horse:s1']));
  for (const id of [...CARS, ...BOATS]) {
    assert.ok(VEHICLE_DIMS[id], `${id}: its size`);
    assert.equal(A.vehType({ m: VEHICLES[id].i }), id, `${id}: drawn as itself`);
    const m = vehicleModel(id, { variant: 3 });
    assert.ok(solid(m) > 3000, `${id}: a model (${solid(m)} voxels)`);
    const a = vehicleAnchors(id);
    assert.ok(a.seat && a.fire.length, `${id}: its seat and fire points`);
    if (BOATS.includes(id)) assert.ok(a.wake, `${id}: its wake`); else assert.ok(a.head.length >= 2 && a.tail.length >= 2, `${id}: its lamps`);
    const g = A.vehicleSprite({ m: VEHICLES[id].i, p: 3, vr: 1 }, { lights: true }, 5, 32);
    assert.ok(g.w > 10 && g.h > 10, `${id}: a sprite`);
    // the states: a wreck, dented
    assert.ok(solid(vehicleModel(id, { state: 'burnt' })) > 1000 && solid(vehicleModel(id, { damage: { stage: 3, zones: 1, holes: 2, off: 1 } })) > 2000, `${id}: wrecked and dented`);
  }
  // the open-top 4x4 shows its crates in the tub
  assert.ok(vehicleAnchors('jeep').bed > 0);
  // the aircraft's looks: the new ones and the liveries
  const AM = await import('../client/art2/aircraft.js');
  for (const id of AIR) assert.ok(AM.TYPES[id] && solid(AM.bodyModel(id)) > 10000, `${id}: its model`);
  for (const [t, L] of Object.entries(AM.LIVERIES)) {
    assert.ok(L.length >= 3, `${t}: liveries`);
    const a = AM.bodySprite(t, 4, 32, 2, 2, false, 0), b = AM.bodySprite(t, 4, 32, 2, 2, false, 1);
    let diff = 0;
    for (let i = 0; i < Math.min(a.col.length, b.col.length); i += 4) diff += Math.abs(a.col[i] - b.col[i]);
    assert.ok(diff > 1000, `${t}: a livery looks different`);
  }
  assert.ok(AM.liveryOf('heli', 7) !== AM.liveryOf('heli', 8) && AM.liveryOf('policeheli', 5) === 0, 'by the variant; the police keep theirs');
  // out of the startup code: neither the renderer nor a bake worker loads them before its first job
  const rend = closure(['client/art2/game/host.js', 'client/art2/game/engine.js', 'client/art2/game/lightgame.js', 'client/art2/game/actors.js', 'client/art2/game/peds.js']);
  const bake = closure(['client/art2/game/worker.js'], { dynamic: true });
  for (const f of ['client/art2/fleet.js', 'client/art2/horse.js']) assert.ok(!rend.includes(f) && !bake.includes(f), `${f}: loaded when first needed`);
  const host = readFileSync(new URL('../client/art2/game/host.js', import.meta.url), 'utf8'), pool = readFileSync(new URL('../client/art2/game/pool.js', import.meta.url), 'utf8');
  assert.ok(/import\('\.\.\/fleet\.js'\)/.test(host) && /'\.\.\/fleet\.js', import\.meta\.url/.test(pool), 'the host and the workers know where the fleet is');
});

test('where they turn up: the town\'s traffic and parked cars by district, the country\'s 4x4s, the boaters\' boats', () => {
  for (const id of CARS) assert.ok(Object.values(DISTRICT_MIX).some((mix) => mix.some(([m]) => m === id)), `${id}: in some district's mix`);
  assert.ok(trafficMix('southside').some(([m]) => m === 'lowrider') && parkedMix('beach').some(([m]) => m === 'convertible'));
  assert.ok(trafficMix('wild', 'wild').some(([m]) => m === 'jeep'), 'the 4x4 out in the country');
  for (const id of BOATS) assert.ok(BOATERS.some(([m]) => m === id), `${id}: the boaters take one out (big water only)`);
});

test('the horse: its own model in eight coats, its gait picked by its speed, a cycle of frames for each', async () => {
  const H = await import('../client/art2/horse.js');
  assert.equal(H.HORSE_COATS.length, COATS);
  assert.equal(COAT_NAMES.length, COATS);
  // the gaits by speed: standing, the walk, the trot, the canter (its pace: the def's max x HORSE.canter), the gallop
  const g = (sp, was) => (A.horseGait(sp, was) || { pose: 'idle' }).pose;
  assert.equal(g(0), 'idle');
  assert.equal(g(40), 'stride');
  assert.equal(g(120), 'trot');
  assert.equal(g(VEHICLES.horse.max * 0.62), 'canter');
  assert.equal(g(VEHICLES.horse.max), 'gallop');
  // a little past an edge before it changes: no flicker between two gaits
  assert.equal(g(170, 'trot'), 'trot');
  assert.equal(g(185, 'trot'), 'canter');
  assert.equal(g(165, 'canter'), 'canter');
  assert.equal(g(160, 'canter'), 'trot');
  // the legs' cycle runs by the ground covered: a gallop's stride longer than the walk's
  assert.ok(A.horseGait(VEHICLES.horse.max).rate < A.horseGait(40).rate);
  // a cycle of frames for each gait, every frame its own (the feet move), the riders' saddle at the model's middle
  for (const pose of ['stride', 'trot', 'canter', 'gallop', 'idle']) {
    const n = A.ANIMAL_FRAMES[pose];
    assert.ok(n >= 4, `${pose}: ${n} frames`);
    const sigs = new Set();
    for (let f = 0; f < n; f++) { const m = H.horseModel('horse:s2', pose, f, n); let s = 0; for (let i = 0; i < m.v.length; i++) if (m.v[i]) s = (s * 31 + i) % 1e9; sigs.add(s); }
    assert.equal(sigs.size, n, `${pose}: each frame different`);
  }
  // the gallop has a moment with no foot down; the walk always has two or more
  const down = (m) => { let n = 0; for (const q of [[0, 0.25], [0.25, 0.5], [0.5, 0.75], [0.75, 1]]) { let hit = false; for (let y = 0; y < m.d && !hit; y++) for (let x = Math.floor(m.w * q[0]); x < m.w * q[1] && !hit; x++) if (m.get(x, y, 0)) hit = true; n += hit; } return n; };
  const gal = [...Array(6)].map((_, f) => down(H.horseModel('horse:s1', 'gallop', f, 6)));
  assert.ok(gal.some((n) => n <= 1), `the gallop's moment in the air (${gal})`);
  // the saddle where the rider sits: the model's middle (+ the def's seat), at the people's saddle height
  const m = H.horseModel('horse:s0', 'stand');
  let top = 0;
  for (let z = m.h - 1; z >= 0 && !top; z--) if (m.get(Math.round(m.w / 2 + VEHICLES.horse.seat), Math.floor(m.d / 2), z)) top = z;
  assert.ok(top >= 34 && top <= 40, `the saddle's seat at ${top} px (the rider's: 37)`);
  // the sprites, in coats and poses, through the renderer's provider
  for (const [k, p] of [['horse:c3', 'graze'], ['horse:s7', 'canter'], ['horse:c5', 'dead'], ['horse:s1', 'rear'], ['horse:c0', 'swim']]) {
    const s = A.animalSprite(k, p, 3, 1);
    assert.ok(s.w > 10 && s.h > 10, `${k} ${p}`);
  }
});
