// Police station interiors, armory, motor pool + gate, sirens clearing traffic, company
// flatbeds, police motorcycles and livelier idle pedestrians.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import * as traffic from '../server/systems/traffic.js';
import { K, T } from '../shared/constants.js';
import { CAR_BLOCK } from '../shared/map.js';
import * as players from '../server/systems/players.js';
import { VEHICLES } from '../shared/vehicles.js';
import { WEAPONS } from '../shared/items.js';
import { POLICE_ARMORY, ENFORCER_MIN_SAMARITAN } from '../shared/rules.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as jobs from '../server/systems/jobs.js';
import * as station from '../server/systems/station.js';
import * as homes from '../server/systems/homes.js';
import { spawnNpc } from '../server/systems/npc.js';

const hq = (w) => w.map.pois.find((q) => q.kind === 'police' && /HQ/.test(q.label));
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
  assert.equal(w.map.tileAtPx(st.x, st.y), T.FLOOR, 'the front desk is inside the building');
  economy.openMenu(w, p, st);
  assert.ok(!p.ped.hidden, 'the lobby is a real room - you are still in the world');
  const lobby = p.conn.sent.filter((m) => m && m.t === 'menu').pop();
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
  assert.ok(w.gateState[w.map.motorPools[st.pool].gateIdx].open, 'gate open for an officer');
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
  const out = mp.south ? 70 : -70; // the gate faces the street on whichever side the lot has one
  teleport(w, p.ped, mp.gate.x, mp.gate.y + out);
  run(w, 1);
  assert.ok(!w.gateState[w.map.motorPools[st.pool].gateIdx].open, 'closed to a civilian');
  // someone already inside can leave
  teleport(w, p.ped, mp.gate.x, mp.gate.y - out);
  run(w, 0.5);
  assert.ok(w.gateState[w.map.motorPools[st.pool].gateIdx].open, 'opens to let people out');
  const car = poolVehicles(w, st.pool).find((v) => v.model === 'police');
  teleport(w, p.ped, car.x + 40, car.y);
  spawnNpc(w, 'casual', car.x + 120, car.y, 'civ').a = Math.PI;
  const heat0 = p.heat;
  vehicles.tryEnter(w, p.ped);
  assert.ok(p.heat > heat0 || p.profile.felonies > 0 || p.wanted > 0, 'stealing a police car is a crime');
});

test('walk-in buildings: doors, floor, counter, a clerk behind it, and the desk menu inside', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const shop = w.map.pois.find((q) => q.kind === 'gunshop');
  const b = w.map.buildings[shop.b];
  assert.ok(b.walkIn, 'gun shop is walk-in');
  const u = b.walkIn.units.find((q) => q.poi === shop.id);
  for (let k = 0; k < u.door.w; k++) assert.equal(w.map.tileAt(u.door.tx + k, u.door.ty), T.FLOOR, 'doorway open');
  assert.equal(w.map.tileAt(Math.floor(u.clerk.x / 32), u.counterRow), T.COUNTER);
  // walk in through the door
  const dx = (u.door.tx + 1) * 32, outY = (u.door.ty + (b.walkIn.south ? 1.6 : -0.6)) * 32;
  teleport(w, p.ped, dx, outY);
  for (let i = 0; i < 40; i++) players.queueInput(p, { seq: i + 1, bits: 0, mx: 0, my: b.walkIn.south ? -1 : 1, aim: 0 });
  run(w, 1.6);
  assert.equal(w.map.tileAtPx(p.ped.x, p.ped.y), T.FLOOR, 'walked inside');
  run(w, 1.2);
  const clerk = [...w.entities.values()].find((e) => e.kind === K.PED && e.npc && e.npc.desk && Math.hypot(e.x - u.clerk.x, e.y - u.clerk.y) < 20);
  assert.ok(clerk, 'clerk behind the counter');
  teleport(w, p.ped, shop.x, shop.y);
  economy.openMenu(w, p, shop);
  assert.ok(p.conn.sent.some((m) => m && m.t === 'menu' && m.poi === shop.id));
  // cars can't drive in
  assert.equal(CAR_BLOCK[T.FLOOR], 1);
  // the hospital ER mat is inside by the desk
  const hosp = w.map.pois.find((q) => q.kind === 'hospital');
  const mat = w.map.pois.find((q) => q.kind === 'reception' && Math.hypot(q.x - hosp.x, q.y - hosp.y) < 120);
  assert.ok(mat && w.map.tileAtPx(mat.x, mat.y) === T.FLOOR);
});

test('sirens: traffic ahead slows and eases over; no siren, no yielding', () => {
  const w = makeWorld({ npcBudget: 40 });
  const { p } = joinPlayer(w);
  const road = straightRoad(w.map, 2600, { kind: 'rural' }); // the long straight county road
  const n = { x: road.x + 300, y: road.y };
  teleport(w, p.ped, n.x, n.y - 400);
  const mk = (model, x, role) => {
    const v = w.spawnVehicle(model, x, n.y + 32, 0, {}); // eastbound lane
    const d = spawnNpc(w, role === 'cop' ? 'cop' : 'casual', v.x, v.y, role); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
    return v;
  };
  const car = mk('sedan', n.x + 260, 'driver');
  traffic.joinTraffic(w, car); car.vx = 200;
  const cop = mk('police', car.x - 220, 'cop');
  const drive = (secs) => { for (let i = 0; i < secs * 20; i++) { cop.vx = car.x - cop.x > 170 ? 340 : Math.max(0, car.vx); cop.vy = 0; cop.input = { throttle: 0, steer: 0, hb: false }; w.step(); } };
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
  // somewhere with pavement all round (a random spot can be a dead end between buildings)
  let spot = { x: p.ped.x + 200, y: p.ped.y };
  outer: for (let r = 160; r < 900; r += 32) for (let k = 0; k < 24; k++) {
    const x = p.ped.x + Math.cos(k / 24 * 6.283) * r, y = p.ped.y + Math.sin(k / 24 * 6.283) * r;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) if (![T.SIDEWALK, T.PLAZA, T.GRASS].includes(w.map.tileAtPx(x + dx * 32, y + dy * 32))) ok = false;
    if (ok) { spot = { x, y }; break outer; }
  }
  const ped = spawnNpc(w, 'casual', spot.x, spot.y, 'civ');
  ped.npc.state = 'idle'; ped.npc.until = w.time + 3; ped.npc.lookAt = w.time;
  const a0 = ped.a, x0 = ped.x, y0 = ped.y;
  run(w, 1);
  assert.notEqual(ped.a, a0, 'looks around');
  let moved = false;
  for (let k = 0; k < 40 && !moved; k++) { run(w, 0.5); moved = Math.hypot(ped.x - x0, ped.y - y0) > 20; } // (a walker can stop to look round twice in a row: up to 7 s each)
  assert.ok(moved, 'walks off eventually');
  const drv = spawnNpc(w, 'casual', p.ped.x - 200, p.ped.y, 'driver');
  run(w, 0.2);
  assert.equal(drv.npc.role, 'civ');
});

test('pepper spray blinds whoever is in front of you; a spike strip shreds the tyres of a car driven over it', async () => {
  const combat = await import('../server/systems/combat.js');
  const { SPIKE_STRIP_S } = await import('../shared/rules.js');
  const w = makeWorld();
  const road = straightRoad(w.map, 1200);
  const { p, prof } = joinPlayer(w, { cash: 500 });
  teleport(w, p.ped, road.x + 300, road.y);
  // pepper spray (bought at a sports shop)
  const sports = w.map.pois.find((q) => q.kind === 'sports');
  assert.ok(economy.buildMenu(w, p, sports).opts.some((o) => o.label === WEAPONS.pepper.name), 'sold at the sports shop');
  prof.weapons.pepper = 6; p.ped.mag.pepper = 6; p.ped.weapon = 'pepper';
  const victim = spawnNpc(w, 'casual', p.ped.x + 50, p.ped.y, 'civ');
  w.time += 2;
  assert.ok(combat.tryAttack(w, p.ped, 0));
  assert.ok(victim.stunUntil > w.time + 2, 'blinded');
  assert.ok(!victim.dead && victim.hp > victim.maxHp * 0.9, 'non-lethal');
  // spike strip: police only
  p.ped.weapon = 'spikes'; prof.weapons.spikes = 0;
  w.time += 2;
  combat.tryAttack(w, p.ped, 0);
  assert.ok(!(w.spikes || []).length, 'civilians cannot lay one');
  p.badge = true;
  w.time += 3;
  assert.ok(combat.tryAttack(w, p.ped, 0));
  assert.equal(w.spikes.length, 1);
  const s = w.spikes[0];
  // a car driven over it at speed
  const car = w.spawnVehicle('sedan', s.x - 160, s.y, 0, { npcOwned: true });
  for (let k = 0; k < 40 && !car.flat; k++) { car.vx = 380; car.vy = 0; car.a = 0; car.y = s.y; car.input = { throttle: 1, steer: 0, hb: false }; w.step(); }
  assert.ok(car.flat, 'tyres shredded');
  // flat tyres cap the speed
  const { vehStep } = await import('../shared/physics.js');
  const a = { x: road.x + 40, y: road.y, a: 0, vx: 0, vy: 0, av: 0 }, b = { ...a, flat: true };
  for (let k = 0; k < 40; k++) { for (const s2 of [a, b]) { vehStep(s2, { throttle: 1, steer: 0 }, 1 / 20, w.map, VEHICLES.sedan, {}); s2.y = road.y; s2.x = road.x + 40; } }
  assert.ok(Math.hypot(b.vx, b.vy) < Math.hypot(a.vx, a.vy) * 0.6, 'flat tyres: much slower');
  // the strip is picked up after its time
  w.time += SPIKE_STRIP_S + 1; w.step(); w.step();
  assert.equal(w.spikes.length, 0);
});

// ---------------------------------------------------------------------------
// Lying low in the wilds, and units that roll in from out of sight.
import * as law from '../server/systems/law.js';
import * as police from '../server/systems/police.js';
import { wildStyle } from '../server/systems/wildlife.js';
import { viewRect } from '../server/view.js';
import { STAR_HEAT, TILE, MAP_W } from '../shared/constants.js';
import { WILD_SIGHT, COVER_SIGHT, WILD_COOL, WILD_UNITS } from '../shared/rules.js';

// An open spot out in the wilds (no cover within a few tiles, no buildings for 500 px east of it).
function openWildSpot(w) {
  const m = w.map;
  for (const n of m.nodes) {
    if (n.lvl !== 0 || wildStyle(m, n.x, n.y) !== 'wild') continue;
    const x = n.x + 32, y = n.y + 32;
    if (law.sightFactor(m, x, y) !== WILD_SIGHT) continue;
    if (!m.los(x, y, x + 500, y) || !m.isWalkable(x, y)) continue;
    return { x, y };
  }
  return null;
}
// A spot deep in a grove: trees all round.
function groveSpot(w) {
  const m = w.map;
  let best = null, bf = 1;
  for (const k of m.solidProps.keys()) {
    const tx = k % MAP_W, ty = Math.floor(k / MAP_W);
    if ((tx + ty) % 7) continue;
    const x = tx * TILE + 16, y = ty * TILE + 16;
    if (!wildStyle(m, x, y)) continue;
    const f = law.sightFactor(m, x, y);
    if (f < bf) { bf = f; best = { x, y, f }; }
  }
  return best;
}

test('wilds: the police see less far out there, less again in the trees, and lose you faster', () => {
  const w = makeWorld();
  const town = hq(w);
  assert.equal(law.sightFactor(w.map, town.x, town.y), 1, 'in town the police see the full range');
  const open = openWildSpot(w);
  assert.ok(open, 'an open spot out in the wilds');
  const grove = groveSpot(w);
  assert.ok(grove && grove.f < WILD_SIGHT * (1 - COVER_SIGHT * 0.6), `thick cover in a grove (${grove && grove.f.toFixed(2)})`);
  assert.equal(law.sightFactor(w.map, grove.x, grove.y, false), WILD_SIGHT, 'a vehicle gets no cover from the trees');

  // a cop 350 px off with a clear view: spotted in town range, not out in the wilds
  const { p } = joinPlayer(w);
  teleport(w, p.ped, open.x, open.y);
  law.addHeat(w, p, STAR_HEAT[2] + 5, open.x, open.y);
  p.seenAt = w.time - 10;
  const cop = spawnNpc(w, 'cop', open.x + 350, open.y, 'cop');
  law.update(w, 0.05);
  assert.ok(w.time - p.seenAt > 5, 'the cop at 350 px misses you out in the wilds');
  teleport(w, cop, open.x + 250, open.y);
  law.update(w, 0.05);
  assert.ok(w.time - p.seenAt < 1, 'closer in, he spots you');
  w.remove(cop);

  // heat cools faster out of sight in the wilds than in town
  const cool = (x, y) => {
    teleport(w, p.ped, x, y);
    p.heat = STAR_HEAT[3] + 20; p.wanted = 3; p.seenAt = w.time - 10;
    const before = p.heat;
    w.tick = 1; // off the camera-check ticks: no traffic camera pings either
    for (let i = 0; i < 40; i++) law.update(w, 0.05);
    return before - p.heat;
  };
  const wildDrop = cool(open.x, open.y);
  let tx = town.x, ty = town.y + 400;
  for (const n of w.map.nodes) if (n.lvl === 0 && !wildStyle(w.map, n.x, n.y) && law.sightFactor(w.map, n.x + 32, n.y + 32) === 1 && !w.query(n.x + 32, n.y + 32, 500, K.PED).some((e) => e.npc && e.npc.role === 'cop')) { tx = n.x + 32; ty = n.y + 32; break; }
  const townDrop = cool(tx, ty);
  assert.ok(Math.abs(wildDrop / townDrop - WILD_COOL) < 0.05, `cools ${WILD_COOL}x faster (${wildDrop.toFixed(2)} vs ${townDrop.toFixed(2)})`);
});

test('police units roll in from off screen and clear of you; lost in the wilds, no more are sent', () => {
  const w = makeWorld();
  const road = straightRoad(w.map, 1400);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, road.x + road.len / 2, road.y);
  law.addHeat(w, p, STAR_HEAT[4] + 5, p.ped.x, p.ped.y);
  p.seenAt = w.time;
  const rect = viewRect(w, p, {});
  const before = new Set(w.police || []);
  for (let i = 0; i < 6; i++) { w.tick = 7 + 20 * i; p.seenAt = w.time; police.update(w, 0.05); }
  const fresh = [...w.police].filter((id) => !before.has(id)).map((id) => w.get(id));
  assert.ok(fresh.length >= 3, `units dispatched (${fresh.length})`);
  for (const v of fresh) {
    const onScreen = v.x > rect.x0 - 100 && v.x < rect.x1 + 100 && v.y > rect.y0 - 100 && v.y < rect.y1 + 100;
    assert.ok(!onScreen, `unit ${v.id} spawned off screen`);
    assert.ok(Math.hypot(v.x - p.ped.x, v.y - p.ped.y) > 650, 'and well clear of you');
  }
  for (const v of fresh) { for (const sid of v.seats) if (sid) w.remove(w.get(sid)); w.police.delete(v.id); w.remove(v); }

  // out in the wilds and out of sight: the search goes on with what's out there, nothing new joins
  const open = openWildSpot(w);
  teleport(w, p.ped, open.x, open.y);
  p.lastSeenX = open.x; p.lastSeenY = open.y; p.seenAt = w.time - 10;
  for (let i = 0; i < 6; i++) { w.tick = 7 + 20 * i; police.update(w, 0.05); }
  const sent = [...w.police].filter((id) => { const v = w.get(id); return v && v.ai && v.ai.target === p.pid; });
  assert.ok(sent.length <= WILD_UNITS, `at most ${WILD_UNITS} unit(s) sent after losing you in the wilds (${sent.length})`);
  for (const id of sent) { const v = w.get(id); assert.ok(Math.hypot(v.x - open.x, v.y - open.y) > 1100, 'from a long way off'); }
});

test('NPC cops go after NPC crooks: a mugger who gets away with a purse is called in; a squad car comes, the crew tases and cuffs them, the purse is dropped', () => {
  const w = makeWorld();
  // a street downtown: a road node with a sidewalk beside it
  const node = w.map.nodes.find((n) => n.lvl === 0 && n.x > 20000 && n.x < 24000 && n.y > 14000 && n.y < 17000);
  assert.ok(node, 'a street');
  const crook = spawnNpc(w, 'mugger', node.x + 32, node.y + 32, 'mugger');
  crook.npc.hasPurse = true; crook.npc.flagged = true; crook.npc.keep = true; crook.npc.state = 'idle';   // (stands about: the chase is the police's, not the crook's running)
  (w.npcCalls ||= []).push({ id: crook.id, at: w.time + 1 });
  let unit = null, purse = false, gone = false;
  for (let s = 0; s < 90 * 2 && !gone; s++) {
    run(w, 0.5);
    for (const vid of w.police || []) { const v = w.get(vid); if (v && v.ai && v.ai.npcTarget === crook.id) unit = v; }
    for (const e of w.entities.values()) if (e.kind === K.BAG && Math.hypot(e.x - crook.x, e.y - crook.y) < 200) purse = true;
    gone = !w.get(crook.id);
  }
  assert.ok(unit, 'a squad car was sent');
  assert.ok(unit.sirenOn !== undefined, 'with its siren');
  assert.ok(gone, 'the crook was taken into custody');
  assert.ok(purse, 'the purse was dropped');
});
