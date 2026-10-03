import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, players } from './helpers.js';
import { generateCity, PED_BLOCK } from '../shared/map.js';
import { gameClock, K, T, STAR_HEAT } from '../shared/constants.js';
import { encodeInput, decodeInput, SnapshotWriter, decodeSnapshot } from '../shared/protocol.js';
import { vehStep, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { IN } from '../shared/input.js';
import { issueToken, verifyToken } from '../server/auth.js';
import * as law from '../server/systems/law.js';
import * as cargo from '../server/systems/cargo.js';
import * as economy from '../server/systems/economy.js';
import * as jobs from '../server/systems/jobs.js';
import * as combat from '../server/systems/combat.js';
import * as vehicles from '../server/systems/vehicles.js';
import { spawnNpc } from '../server/systems/npc.js';

test('city generation is deterministic and spawns are walkable', () => {
  const a = generateCity(1337), b = generateCity(1337);
  assert.deepEqual(Buffer.from(a.tiles), Buffer.from(b.tiles));
  assert.equal(a.pois.length, b.pois.length);
  assert.equal(JSON.stringify(a.props), JSON.stringify(b.props), 'props identical on server and client');
  assert.equal(JSON.stringify(a.prefabs), JSON.stringify(b.prefabs));
  for (const s of Object.values(a.spawns)) assert.equal(PED_BLOCK[a.tileAtPx(s.x, s.y)], 0);
  assert.ok(a.hospitals.length >= 3, 'several hospitals to respawn at');
  assert.ok(a.homes.length >= 20, 'buyable homes');
  for (const kind of ['hospital', 'police', 'bank', 'gunshop', 'pawn', 'fence', 'garage', 'clothing', 'dealer', 'warehouse', 'farm', 'grocery', 'fishmarket', 'marina', 'courthouse'])
    assert.ok(a.pois.some((p) => p.kind === kind), `missing POI ${kind}`);
});

test('chrono loop: 15 min day then 5 min night', () => {
  assert.equal(gameClock(300).isNight, false);
  assert.equal(gameClock(1000).isNight, true);
  assert.equal(gameClock(1000).dark, 1);
});

test('protocol round-trips inputs and snapshots', () => {
  const dv = new DataView(encodeInput(42, 0b101, 127, -127, 16384));
  const inp = decodeInput(dv);
  assert.equal(inp.seq, 42); assert.equal(inp.bits, 5); assert.equal(inp.mx, 1); assert.equal(inp.my, -1);
  const w = new SnapshotWriter(10);
  w.begin(7, 41, 123.5, 1, 1, 99, { x: 10, y: 20, a: 1, vx: 2, vy: 3, stamina: 50 }, 3, 8);
  w.add(5, K.PED, 9, 100.5, 200.25, 1.5, 0.5, 0, 7);
  const u8 = w.finish();
  const s = decodeSnapshot(new DataView(u8.buffer, u8.byteOffset, u8.byteLength));
  assert.equal(s.tick, 7); assert.equal(s.ack, 41); assert.equal(s.ctrlId, 99); assert.equal(s.ents.length, 1);
  assert.equal(s.ents[0].id, 5); assert.ok(Math.abs(s.ents[0].a - 1.5) < 0.001); assert.equal(s.ents[0].extra, 7);
});

test('guest tokens are signed and tamper-proof', () => {
  const tok = issueToken('0123456789abcdef01234567');
  assert.equal(verifyToken(tok).pid, '0123456789abcdef01234567');
  const bad = tok.slice(0, -2) + (tok.endsWith('A') ? 'BB' : 'AA');
  assert.equal(verifyToken(bad), null);
  assert.equal(verifyToken('garbage'), null);
});

test('ghost state: disconnect keeps body 30s, then drops loot bag and despawns', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 750 });
  const ped = p.ped;
  players.leave(w, p);
  run(w, 10);
  assert.ok(w.entities.has(ped.id), 'ghost body still in world after 10s');
  run(w, 21);
  assert.ok(!w.entities.has(ped.id), 'body despawned after 30s');
  assert.equal(prof.cash, 0);
  const bags = [...w.entities.values()].filter((e) => e.kind === K.BAG);
  assert.equal(bags.length, 1);
  assert.equal(bags[0].cash, 750);
  assert.equal(bags[0].tier, 2);
});

test('ghost state: reconnecting inside the window resumes the same body', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 300 });
  const id = p.ped.id;
  players.leave(w, p);
  run(w, 12);
  const p2 = players.join(w, { open: true, buffered: 0, sendJSON() {}, sendText() {}, sendBinary() {} }, prof);
  assert.equal(p2.ped.id, id);
  run(w, 25);
  assert.ok(w.entities.has(id));
  assert.equal(prof.cash, 300);
});

test('witness network: unseen crimes stay unreported, witnessed crimes raise heat + 3s flare', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  // move to an empty grass area with no cameras
  const spot = { x: 30, y: 30 };
  teleport(w, ped, spot.x * 1 + 64, spot.y + 64);
  law.crime(w, ped, 'assault', null);
  assert.equal(p.heat, 0, 'no witnesses -> no heat');
  const npc = spawnNpc(w, 'casual', ped.x + 120, ped.y, 'civ');
  npc.a = Math.PI; // facing the crime
  law.crime(w, ped, 'assault', null);
  assert.ok(p.heat >= 15);
  assert.equal(p.wanted, 1);
  assert.ok(ped.flareUntil > w.time && ped.flareUntil <= w.time + 3.01);
});

test('immunity matrix: self-defense against an aggressor is not a crime', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  teleport(w, ped, 96, 96);
  const witness = spawnNpc(w, 'casual', ped.x + 100, ped.y, 'civ'); witness.a = Math.PI;
  const thug = spawnNpc(w, 'casual', ped.x + 20, ped.y, 'civ');
  combat.damage(w, ped, 5, thug, 'melee', 0); // thug strikes first
  law.crime(w, ped, 'assault', thug);
  assert.equal(p.heat, 0);
});

test('disguise system: outfit clears public wanted but a witnessed infraction spikes back to peak', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 1000 });
  const ped = p.ped;
  law.addHeat(w, p, STAR_HEAT[3] + 1, ped.x, ped.y);
  assert.equal(p.wanted, 3);
  p.seenAt = w.time - 10;
  const shop = w.map.pois.find((q) => q.kind === 'clothing');
  teleport(w, ped, shop.x, shop.y);
  economy.handleMenu(w, p, shop.id, 'outfit');
  assert.equal(p.wanted, 0);
  assert.equal(p.disguised, true);
  assert.equal(prof.peakWanted, 3);
  law.addHeat(w, p, 6, ped.x, ped.y); // a minor public infraction
  assert.equal(p.wanted, 3, 'heat spikes straight back to the cached peak');
  assert.equal(p.disguised, false);
});

test('open cargo: carry slows by 40%, crates load into visible vehicle slots and fall off in crashes', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  const v = w.spawnVehicle('pickup', ped.x + 80, ped.y, 0, { npcOwned: false });
  const c = w.spawnCrate(2, ped.x + 10, ped.y);
  cargo.pickUp(w, ped, c);
  assert.equal(ped.carrying, c.id);
  assert.ok(Math.abs(players.pedMods(w, ped).speedMul - 0.6) < 1e-9);
  const [sx, sy] = cargo.slotWorld(v, 0);
  teleport(w, ped, sx - 30, sy);
  const slot = cargo.findFreeSlot(w, ped);
  assert.ok(slot && slot.v === v);
  cargo.loadCrate(w, ped, slot.v, slot.i);
  assert.equal(v.cargo[slot.i], c.id);
  run(w, 0.2);
  assert.equal(c.state, 'loaded');
  const [cx, cy] = cargo.slotWorld(v, slot.i);
  assert.ok(Math.hypot(c.x - cx, c.y - cy) < 1, 'crate rendered at its slot');
  w.rand = () => 0; // force knock-off
  cargo.knockOff(w, v, 700);
  assert.equal(c.state, 'ground');
  assert.equal(v.cargo[slot.i], 0);
});

test('rain: asphalt braking distance roughly doubles', () => {
  const m = generateCity(1337);
  const def = VEHICLES.sedan;
  const ave = m.roads.find((r) => r.axis === 'h' && r.y === 80); // Bay Bridge avenue, 6 tiles wide
  const brake = (rain) => {
    const s = newVehState(20 * 32, (ave.y + 4.5) * 32, 0);
    s.vx = 400;
    let d = 0;
    for (let i = 0; i < 400 && Math.hypot(s.vx, s.vy) > 5; i++) { const x0 = s.x; vehStep(s, { throttle: -1, steer: 0, hb: false }, 0.05, m, def, { rain }); d += s.x - x0; }
    return d;
  };
  const dry = brake(false), wet = brake(true);
  assert.ok(wet / dry > 1.7 && wet / dry < 2.3, `wet/dry ratio ${wet / dry}`);
});

test('EMS hard memory despawn removes bodies that nobody can reach within 45s', () => {
  const w = makeWorld();
  const body = spawnNpc(w, 'casual', 200, 200, 'civ');
  combat.kill(w, body, null, 'melee', 0);
  assert.ok(w.bodies.has(body));
  run(w, 44);
  assert.ok(w.entities.has(body.id));
  run(w, 2);
  assert.ok(!w.entities.has(body.id));
});

test('fishing: reeling inside the bite window lands a fish; too early spooks it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.weapons.rod = 0;
  const pier = w.map.marina[0];
  const ped = p.ped;
  teleport(w, ped, pier.x - 3 * 32, pier.y); // on the dock beside water
  ped.a = 0;
  let spot = jobs.fishingSpot(w, ped);
  for (let a = 0; !spot && a < 8; a++) { ped.a = a * Math.PI / 4; spot = jobs.fishingSpot(w, ped); }
  assert.ok(spot, 'water within casting range');
  jobs.castLine(w, p, spot);
  jobs.reelIn(w, p);
  assert.equal(ped.fishing, null, 'too early cancels');
  jobs.castLine(w, p, spot);
  w.time = ped.fishing.biteAt + 0.2;
  jobs.reelIn(w, p);
  const fish = ['bass', 'catfish', 'salmon', 'tuna'].reduce((s, k) => s + (prof.inventory[k] || 0), 0);
  assert.equal(fish, 1);
});

test('economy: bank deposit protects money, purchases draw from wallet then bank', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 300, bank: 1000 });
  const ped = p.ped;
  const bank = w.map.pois.find((q) => q.kind === 'bank');
  teleport(w, ped, bank.x, bank.y);
  economy.handleMenu(w, p, bank.id, 'dep:100');
  assert.equal(prof.cash, 200); assert.equal(prof.bank, 1100);
  const gun = w.map.pois.find((q) => q.kind === 'gunshop');
  teleport(w, ped, gun.x, gun.y);
  economy.handleMenu(w, p, gun.id, 'w:pistol:450');
  assert.ok(prof.weapons.pistol > 0);
  assert.equal(prof.cash + prof.bank, 1300 - 450);
  combat.kill(w, ped, null, 'melee', 0);
  assert.equal(prof.cash, 0);
  assert.equal(prof.bank, 850, 'bank balance survives death');
});

test('enforcer badge needs Samaritan points; misconduct gets you fired', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { samaritan: 5 });
  assert.match(law.goOnDuty(w, p), /Samaritan/);
  prof.samaritan = 30;
  assert.equal(law.goOnDuty(w, p), null);
  assert.equal(p.badge, true);
  const ped = p.ped;
  teleport(w, ped, 96, 96);
  const victim = spawnNpc(w, 'casual', ped.x + 20, ped.y, 'civ');
  law.crime(w, ped, 'assault', victim);
  assert.equal(p.badge, false, 'dropping below the threshold triggers server-firing');
  assert.ok(prof.firedUntil > Date.now());
});

test('bounty: robbed citizen can place a bounty, criminals cannot', () => {
  const w = makeWorld();
  const a = joinPlayer(w, { bank: 2000 });
  const b = joinPlayer(w);
  assert.match(law.placeBounty(w, a.p, b.p.pid, 500), /recently/);
  a.p.robbedBy.set(b.p.pid, w.time);
  assert.equal(law.placeBounty(w, a.p, b.p.pid, 500), null);
  assert.equal(b.p.bounty, 500);
  law.addHeat(w, a.p, 20, 0, 0);
  assert.match(law.placeBounty(w, a.p, b.p.pid, 100), /Criminals/);
});

test('vehicle entry from foot and wreck ejection', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ped = p.ped;
  const v = w.spawnVehicle('sedan', ped.x + 40, ped.y, 0, { npcOwned: false });
  assert.ok(vehicles.tryEnter(w, ped));
  assert.equal(ped.vehId, v.id);
  vehicles.explode(w, v, null);
  assert.equal(ped.vehId, 0);
  assert.equal(ped.dead, true);
  assert.ok(v.wreckAt > 0);
});

test('world tick stays fast with NPC population around players', () => {
  const w = makeWorld({ npcBudget: 700 });
  for (let i = 0; i < 6; i++) joinPlayer(w);
  run(w, 20);
  const t0 = performance.now();
  run(w, 10);
  const ms = (performance.now() - t0) / 200;
  assert.ok(ms < 20, `avg tick ${ms.toFixed(2)} ms`);
  let npcs = 0; for (const e of w.entities.values()) if (e.npc) npcs++;
  assert.ok(npcs > 10, 'city is populated');
  void T;
});

test('homes: buy a house, respawn there, park a car in its garage and take it back out', async () => {
  const homes = await import('../server/systems/homes.js');
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 40000 });
  const home = w.map.homes.find((h) => h.kind === 'house');
  const poi = w.map.pois.find((q) => q.kind === 'home' && q.home === home.id);
  teleport(w, p.ped, poi.x, poi.y);
  economy.handleMenu(w, p, poi.id, 'hbuy');
  assert.equal(w.homeOwner.get(home.id), prof.pid);
  assert.equal(prof.spawnHome, home.id);
  assert.equal(prof.bank, 40000 - home.price);
  // a second player can't buy it
  const other = joinPlayer(w, { bank: 90000 });
  teleport(w, other.p.ped, poi.x, poi.y);
  economy.handleMenu(w, other.p, poi.id, 'hbuy');
  assert.equal(w.homeOwner.get(home.id), prof.pid);
  // die -> wake up at home
  combat.kill(w, p.ped, null, 'melee', 0);
  run(w, 8);
  assert.ok(Math.hypot(p.ped.x - home.x, p.ped.y - home.y) < 60, 'respawned at home');
  // drive a stolen car up to the garage and park it
  const v = w.spawnVehicle('sedan', home.garage.x, home.garage.y, 0, { npcOwned: false });
  assert.ok(vehicles.tryEnter(w, p.ped));
  const act = homes.vehicleInteraction(w, p);
  assert.ok(act && /garage/.test(act.label));
  act.run();
  assert.equal(prof.vehicles.length, 1);
  assert.ok(!w.entities.has(v.id));
  teleport(w, p.ped, poi.x, poi.y);
  economy.handleMenu(w, p, poi.id, 'hcar:0');
  const out = [...w.entities.values()].find((e) => e.def && e.owner === prof.pid);
  assert.ok(out && out.model === 'sedan', 'car comes back out of the garage');
});

test('respawn picker: players can choose any hospital', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  combat.kill(w, p.ped, null, 'melee', 0);
  const target = w.map.hospitals[2];
  p.respawnChoice = 'h:2';
  run(w, 8);
  assert.ok(Math.hypot(p.ped.x - target.x, p.ped.y - target.y) < 60);
});

test('analog movement: light push walks, full push runs, sprint is faster, release glides then stops', async () => {
  const { pedStep, newPedState, analogSpeed, PED } = await import('../shared/physics.js');
  const m = generateCity(1337);
  const sp = m.spawns.hospital;
  const mods = { canMove: true, canSprint: true, speedMul: 1, regenMul: 1, staminaMax: 100, analog: true };
  const run = (mag, bits, secs) => {
    const s = newPedState(sp.x, sp.y);
    for (let i = 0; i < secs * 20; i++) pedStep(s, { bits, mx: 0, my: mag, aim: 0 }, 0.05, m, mods);
    return s;
  };
  assert.ok(analogSpeed(0.3, false) < analogSpeed(0.6, false) && analogSpeed(0.6, false) < analogSpeed(1, false));
  assert.ok(analogSpeed(1, true) > analogSpeed(1, false));
  const walk = Math.hypot(...Object.values((({ vx, vy }) => ({ vx, vy }))(run(0.4, 0, 1))));
  const jog = Math.hypot(...Object.values((({ vx, vy }) => ({ vx, vy }))(run(1, 0, 1))));
  assert.ok(walk > 40 && walk < PED.aWalk, `walk ${walk}`);
  assert.ok(jog > PED.aWalk + 40, `run ${jog}`);
  // release: keeps sliding a little (ease-out), then comes to rest
  const s = run(1, 0, 1);
  const y0 = s.y;
  pedStep(s, { bits: 0, mx: 0, my: 0, aim: 0 }, 0.05, m, mods);
  assert.ok(s.y - y0 > 3, 'glides past release');
  for (let i = 0; i < 40; i++) pedStep(s, { bits: 0, mx: 0, my: 0, aim: 0 }, 0.05, m, mods);
  assert.equal(Math.hypot(s.vx, s.vy), 0);
});

test('direction driving: the car turns toward the stick, light push cruises slower, pulling back reverses', async () => {
  const { driveInput, vehStep, newVehState } = await import('../shared/physics.js');
  const m = generateCity(1337);
  const ave = m.roads.find((r) => r.axis === 'h' && r.y === 80);
  const def = VEHICLES.sedan;
  const drive = (mx, my, secs, s = newVehState((ave.x + 10) * 32, (ave.y + 3) * 32, 0)) => {
    for (let i = 0; i < secs * 20; i++) vehStep(s, driveInput(s, { bits: 0, mx, my, aim: 0 }), 0.05, m, def, { rain: false });
    return s;
  };
  const slow = drive(0.35, 0, 4), fast = drive(1, 0, 4);
  assert.ok(Math.hypot(fast.vx, fast.vy) > Math.hypot(slow.vx, slow.vy) * 1.6, 'analog throttle');
  const di = driveInput(newVehState(0, 0, 0), { bits: 0, mx: 0, my: -1, aim: 0 });
  assert.ok(di.steer < -0.5 && di.throttle > 0, 'stick up while facing east steers left (north)');
  const back = driveInput(newVehState(0, 0, 0), { bits: 0, mx: -1, my: 0, aim: 0 });
  assert.ok(back.throttle < 0, 'stick behind a stopped car reverses');
  const tank = driveInput(newVehState(0, 0, 0), { bits: IN.TANK, mx: 1, my: -1, aim: 0 });
  assert.equal(tank.throttle, 1); assert.equal(tank.steer, 1);
});
