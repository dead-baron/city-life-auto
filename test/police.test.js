// Police station interiors, armory, motor pool + gate, sirens clearing traffic, company
// flatbeds, police motorcycles and livelier idle pedestrians.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS } from '../shared/items.js';
import { POLICE_ARMORY, ENFORCER_MIN_SAMARITAN } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as jobs from '../server/systems/jobs.js';
import * as station from '../server/systems/station.js';
import * as homes from '../server/systems/homes.js';
import { spawnNpc } from '../server/systems/npc.js';

const hq = (w) => w.map.pois.find((q) => q.kind === 'police');
const poolVehicles = (w, i) => [...w.entities.values()].filter((e) => e.kind === K.VEH && e.motorPool === i);

test('motor pool: fenced lot beside HQ, stocked with cruisers and police motorcycles', () => {
  const w = makeWorld();
  const st = hq(w);
  assert.ok(st.pool !== undefined, 'HQ has a motor pool');
  const mp = w.map.motorPools[st.pool];
  assert.ok(mp.gate.props.length > 3, 'gate posts');
  const list = poolVehicles(w, st.pool);
  assert.equal(list.length, mp.spots.length);
  assert.ok(list.some((v) => v.model === 'police') && list.some((v) => v.model === 'policebike'));
  assert.ok(VEHICLES.policebike.police && VEHICLES.policebike.kind === 'bike');
});

test('station: walk in, sign up at the desk, pick an armory weapon, out to the motor pool', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { samaritan: ENFORCER_MIN_SAMARITAN + 5, felonies: 0 });
  const st = hq(w);
  teleport(w, p.ped, st.x, st.y);
  economy.openMenu(w, p, st);
  assert.ok(p.ped.hidden && p.ped.interior.kind === 'lobby', 'inside the lobby');
  assert.ok(!w.query(st.x, st.y, 100, K.PED).includes(p.ped), 'out of sight indoors');
  const lobby = p.conn.sent.filter((m) => m && m.t === 'menu').pop();
  assert.equal(lobby.interior, 'lobby');
  assert.ok(lobby.opts.some((o) => o.id === 'duty:on'));
  economy.handleMenu(w, p, st.id, 'duty:on');
  assert.ok(p.badge, 'sworn in');
  assert.equal(p.ped.interior.kind, 'armory', 'locked in the armory');
  assert.ok(!p.ped.vehId, 'no automatic cruiser any more');
  const armory = p.conn.sent.filter((m) => m && m.t === 'menu').pop();
  for (const id of POLICE_ARMORY) assert.ok(armory.opts.some((o) => o.id === `arm:${id}`), `armory offers ${id}`);
  economy.handleMenu(w, p, st.id, 'arm:psniper');
  assert.ok(prof.weapons.psniper !== undefined && p.ped.weapon === 'psniper');
  economy.handleMenu(w, p, st.id, 'arm:passault');
  assert.ok(prof.weapons.passault !== undefined && prof.weapons.psniper === undefined, 'one long gun at a time');
  economy.handleMenu(w, p, st.id, 'armexit');
  const mp = w.map.motorPools[st.pool];
  assert.ok(!p.ped.hidden && station.poolOf(w, p.ped.x, p.ped.y) === st.pool, 'standing in the motor pool');
  assert.ok(homes.isProtected(w, p.ped), 'step-out protection');
  // take a motorcycle: it becomes the duty vehicle, no crime
  const bike = poolVehicles(w, st.pool).find((v) => v.model === 'policebike');
  teleport(w, p.ped, bike.x + 18, bike.y);
  assert.ok(vehicles.tryEnter(w, p.ped));
  assert.equal(p.dutyVehicle, bike.id);
  assert.equal(p.wanted, 0);
  assert.equal(bike.motorPool, undefined);
  // the gate opens for the officer riding up to it
  teleport(w, p.ped, p.ped.x, p.ped.y); bike.x = mp.gate.x; bike.y = mp.gate.y - 60;
  run(w, 0.5);
  assert.ok(w.poolState[st.pool].open, 'gate open for an officer');
  assert.ok(mp.gate.props.every((pr) => pr.off));
  // a fresh bike is waiting for the next recruit
  bike.x = mp.gate.x; bike.y = mp.gate.y + 600; w.place(bike);
  assert.ok(station.refill(w, st.pool, true) >= 1, 'replacement parked');
  // off duty: department weapons handed back
  vehicles.exitVehicle(w, p.ped);
  teleport(w, p.ped, st.x, st.y);
  p.ped.lastHitAt = -99; p.ped.lastCombatAt = -99;
  economy.openMenu(w, p, st);
  economy.handleMenu(w, p, st.id, 'duty:off');
  for (const id of POLICE_ARMORY) assert.equal(prof.weapons[id], undefined);
  void WEAPONS;
});

test('the gate stays shut for civilians; taking a pool car is police-vehicle theft', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const st = hq(w);
  const mp = w.map.motorPools[st.pool];
  teleport(w, p.ped, mp.gate.x, mp.gate.y + 70);
  run(w, 1);
  assert.ok(!w.poolState[st.pool].open, 'closed to a civilian');
  // someone already inside can leave
  teleport(w, p.ped, mp.gate.x, mp.gate.y - 70);
  run(w, 0.5);
  assert.ok(w.poolState[st.pool].open, 'opens to let people out');
  const car = poolVehicles(w, st.pool).find((v) => v.model === 'police');
  teleport(w, p.ped, car.x + 40, car.y);
  spawnNpc(w, 'casual', car.x + 120, car.y, 'civ').a = Math.PI;
  const heat0 = p.heat;
  vehicles.tryEnter(w, p.ped);
  assert.ok(p.heat > heat0 || p.profile.felonies > 0 || p.wanted > 0, 'stealing a police car is a crime');
});

test('no hiding in the station: not while wanted or straight out of a fight', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const st = hq(w);
  teleport(w, p.ped, st.x, st.y);
  p.ped.lastHitAt = w.time;
  economy.openMenu(w, p, st);
  assert.ok(!p.ped.hidden, 'mid-fight');
  p.ped.lastHitAt = -99; p.ped.lastCombatAt = -99;
  p.wanted = 2; p.heat = 40;
  economy.openMenu(w, p, st);
  assert.ok(!p.ped.hidden, 'wanted');
  p.wanted = 0; p.heat = 0;
  economy.openMenu(w, p, st);
  assert.ok(p.ped.hidden);
  economy.handleMenu(w, p, st.id, 'sleave');
  assert.ok(!p.ped.hidden && Math.hypot(p.ped.x - st.x, p.ped.y - st.y) < 60);
});

test('sirens: traffic ahead slows and eases over; no siren, no yielding', () => {
  const w = makeWorld({ npcBudget: 40 });
  const { p } = joinPlayer(w);
  const n = w.map.nodes.find((q) => q.links.E !== undefined && Math.abs(w.map.nodes[q.links.E].x - q.x) > 900);
  teleport(w, p.ped, n.x, n.y - 400);
  const mk = (model, x, role) => {
    const v = w.spawnVehicle(model, x, n.y + n.lane.E, 0, {});
    const d = spawnNpc(w, role === 'cop' ? 'cop' : 'casual', v.x, v.y, role); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
    return v;
  };
  const car = mk('sedan', n.x + n.half + 260, 'driver');
  car.ai = { kind: 'traffic', from: n.id, dir: 'E', pts: null }; car.vx = 200;
  const cop = mk('police', car.x - 220, 'cop');
  const drive = (secs) => { for (let i = 0; i < secs * 20; i++) { cop.vx = car.x - cop.x > 170 ? 260 : Math.max(0, car.vx); cop.vy = 0; cop.input = { throttle: 0, steer: 0, hb: false }; w.step(); } };
  drive(1);
  assert.ok(!(car.ai.yieldUntil > w.time), 'siren off: carry on');
  cop.sirenOn = true;
  drive(1.5);
  assert.ok(car.ai.yieldUntil > w.time, 'siren on: yielding');
  assert.ok(Math.hypot(car.vx, car.vy) < 90, `slowed right down (${Math.round(Math.hypot(car.vx, car.vy))})`);
});

test('courier jobs come with a company flatbed you can take without stealing', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const wh = w.map.pois.find((q) => q.kind === 'warehouse');
  teleport(w, p.ped, wh.x, wh.y);
  economy.handleMenu(w, p, wh.id, 'job:courier');
  const truck = [...w.entities.values()].find((e) => e.kind === K.VEH && e.workTruck && e.issuedTo === p.pid);
  assert.ok(truck && truck.model === 'flatbed', 'flatbed parked by the job');
  teleport(w, p.ped, truck.x, truck.y + 40);
  assert.ok(vehicles.tryEnter(w, p.ped));
  assert.equal(p.heat, 0, 'not theft');
  void jobs;
});

test('idle pedestrians look around and then walk off; stranded drivers walk away', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = spawnNpc(w, 'casual', p.ped.x + 200, p.ped.y, 'civ');
  ped.npc.state = 'idle'; ped.npc.until = w.time + 3; ped.npc.lookAt = w.time;
  const a0 = ped.a;
  run(w, 1);
  assert.notEqual(ped.a, a0, 'looks around');
  run(w, 3);
  assert.equal(ped.npc.state === 'idle' ? 'idle' : 'moved on', 'moved on');
  const drv = spawnNpc(w, 'casual', p.ped.x - 200, p.ped.y, 'driver');
  run(w, 0.2);
  assert.equal(drv.npc.role, 'civ');
});
