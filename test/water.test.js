// Islands by boat, the Syndicate and Smuggler's Rock, poaching runs, deep-sea charters, NPC and
// police boats, and the water races.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import { ISLANDS, PED_BLOCK, isSwimming } from '../shared/map.js';
import { pointAt } from '../shared/geom.js';
import { GANG_JOIN_FEE, NET_TIME_S, DEEPSEA_CATCH, DEEPSEA_PAY, POACH_PAY } from '../shared/rules.js';
import { OFFSHORE_FISH } from '../shared/items.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as players from '../server/systems/players.js';
import * as jobs from '../server/systems/jobs.js';
import * as boats from '../server/systems/boats.js';
import * as cargo from '../server/systems/cargo.js';
import { COUNTDOWN_S } from '../server/systems/races.js';

const poiOf = (w, kind) => w.map.pois.find((q) => q.kind === kind);
function board(w, p, v) { p.ped.vehId = v.id; p.ped.seat = 0; v.seats[0] = p.ped.id; p.ped.x = v.x; p.ped.y = v.y; }

test('Pelican Key (a bridge from Westport, a charter dock) and Smuggler\'s Rock (boat only, the Den)', () => {
  const w = makeWorld();
  for (const k of ['P', 'C']) {
    const [x0, y0, x1, y1] = ISLANDS[k].box;
    let land = 0, road = 0, bridge = 0;
    for (let ty = y0 - 6; ty < y1 + 6; ty++) for (let tx = x0 - 6; tx < x1 + 6; tx++) { const t = w.map.tileAt(tx, ty); if (t === T.ROAD) road++; if (t === T.BRIDGE) bridge++; if (t !== T.WATER && t !== T.DEEP) land++; }
    assert.ok(land > 1000, `${ISLANDS[k].name} has land`);
    if (k === 'C') assert.equal(road + bridge, 0, `${ISLANDS[k].name} has no road or bridge to it`);
    else assert.ok(road > 200 && bridge > 50, 'Pelican Key: streets, and the bridge over from Westport');
  }
  assert.ok(poiOf(w, 'charter') && poiOf(w, 'smuggler'));
  assert.ok(w.map.offshore.length > 50, 'offshore fishing grounds');
  for (const r of w.map.races) if (r.kind !== 'wheels') for (const c of [r.start, ...r.cps]) assert.ok([T.WATER, T.DEEP].includes(w.map.tileAtPx(c.x, c.y)), `${r.name} buoy on water`);
  assert.ok(w.map.marina.some((m) => m.kind === 'jetski'), 'jet skis at the Pelican Key jetty');
});

test('join the Syndicate: the Rock gate opens for members only; guards shoot outsiders', () => {
  const w = makeWorld();
  const outsider = joinPlayer(w).p;
  const { p, prof } = joinPlayer(w, { cash: 0, bank: 2000 });
  const hq = poiOf(w, 'gang');
  teleport(w, p.ped, hq.x, hq.y);
  economy.handleMenu(w, p, hq.id, 'gjoin');
  assert.equal(prof.gang, 'syndicate');
  assert.equal(prof.bank, 2000 - GANG_JOIN_FEE);
  const gi = w.map.gates.findIndex((g) => g.rule === 'gang');
  const g = w.map.gates[gi];
  teleport(w, outsider.ped, g.x - 90, g.y);
  outsider.ped.hp = 5000; outsider.ped.maxHp = 5000; // survive long enough to watch
  run(w, 1);
  assert.ok(!w.gateState[gi].open, 'shut to outsiders');
  assert.ok(outsider.rockWarnedAt, 'warned first');
  run(w, 3.5);
  const guards = w.rockGuards.map((id) => w.get(id));
  assert.ok(guards.length >= 4, 'guards posted');
  assert.ok(guards.some((q) => q.npc.state === 'fight' && q.npc.target === outsider.ped.id), 'guards go for the outsider');
  teleport(w, outsider.ped, hq.x, hq.y); outsider.ped.hp = 100;
  for (const q of guards) { q.npc.state = 'wander'; q.npc.target = 0; }
  teleport(w, p.ped, g.x - 90, g.y);
  run(w, 0.5);
  assert.ok(w.gateState[gi].open, 'opens for a member');
  assert.ok(!guards.some((q) => q.npc.state === 'fight' && q.npc.target === p.ped.id), 'members are welcome');
});

test('poaching run: net the haul from a cargo boat, bring it to the Den for cash', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { cash: 0, gang: 'syndicate' });
  const den = poiOf(w, 'smuggler');
  teleport(w, p.ped, den.x, den.y);
  economy.handleMenu(w, p, den.id, 'poach:turtle');
  assert.equal(p.job.type, 'poach');
  const boat = w.spawnVehicle('dinghy', p.job.tx, p.job.ty, 0, { npcOwned: false });
  board(w, p, boat);
  run(w, NET_TIME_S + 0.5);
  assert.equal(p.job.stage, 'deliver', 'haul netted');
  const crate = w.get(boat.cargo.find((c) => c));
  assert.ok(crate && crate.contraband && /Turtle/.test(crate.label), 'loaded on the boat');
  // tie up, carry it to the Den
  vehicles.exitVehicle(w, p.ped);
  crate.state = 'ground'; crate.parent = 0; boat.cargo[crate.slot] = 0;
  teleport(w, p.ped, den.x, den.y); crate.x = den.x; crate.y = den.y + 10; w.place(crate);
  cargo.pickUp(w, p.ped, crate);
  const act = players.findInteraction(w, p);
  assert.ok(act && /Den/.test(act.label), act && act.label);
  act.run();
  assert.equal(prof.cash, POACH_PAY.turtle);
  assert.equal(p.job, null);
});

test('deep-sea charter: fish over the side far from land, land the catch for the bonus', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 0 });
  prof.weapons.rod = 0;
  const desk = poiOf(w, 'charter');
  teleport(w, p.ped, desk.x, desk.y);
  economy.handleMenu(w, p, desk.id, 'deepsea');
  assert.equal(p.job.type, 'deepsea');
  const boat = w.spawnVehicle('speedboat', p.job.tx, p.job.ty, 0, { npcOwned: false });
  board(w, p, boat);
  for (let k = 0; k < DEEPSEA_CATCH; k++) {
    const act = players.findInteraction(w, p);
    assert.ok(act && /offshore/i.test(act.label), act && act.label);
    act.run();
    p.ped.fishing.biteAt = w.time - 0.1;
    jobs.reelIn(w, p);
  }
  assert.equal(OFFSHORE_FISH.reduce((n, id) => n + (prof.inventory[id] || 0), 0), DEEPSEA_CATCH);
  assert.equal(prof.bank, DEEPSEA_PAY);
  assert.equal(p.job, null);
});

test('boats on the bay: NPC boaters cruise, a police patrol boat chases a wanted swimmer', () => {
  const w = makeWorld({ npcBudget: 60 });
  const { p } = joinPlayer(w);
  // (a point out at sea with open water all the way to where the patrol boat starts, 700 px east: the middle of the
  // offshore list or the next one along that has it - the list moves whenever the world changes)
  const open = (q) => { for (let dx = 0; dx <= 800; dx += 40) if (w.map.tileAtPx(q.x + dx, q.y) !== T.DEEP) return false; return true; };
  const mid = Math.floor(w.map.offshore.length / 2);
  const sp = w.map.offshore.slice(mid).find(open) || w.map.offshore[mid];
  teleport(w, p.ped, sp.x, sp.y);
  run(w, 3);
  const all = [...w.entities.values()].filter((e) => e.kind === K.VEH && e.ai);
  assert.ok(all.some((v) => v.ai.kind === 'boater'), 'NPC boaters');
  const pb = all.find((v) => v.ai.kind === 'pboat') || boats.spawnPatrol(w, { x: sp.x + 700, y: sp.y });
  assert.equal(pb.model, 'policeboat');
  pb.x = sp.x + 700; pb.y = sp.y; w.place(pb);
  p.heat = 40; p.wanted = 2; p.seenAt = w.time;
  const d0 = Math.hypot(pb.x - p.ped.x, pb.y - p.ped.y);
  for (let i = 0; i < 6; i++) { p.seenAt = w.time; run(w, 0.5); }
  assert.ok(Math.hypot(pb.x - p.ped.x, pb.y - p.ped.y) < d0 - 150, 'closing in');
  assert.ok(pb.sirenOn);
});

test('jet ski race: enter at the start buoy, checkpoint to checkpoint, prize at the finish', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 0 });
  const race = w.map.races.find((r) => r.kind === 'jetski');
  const ski = w.spawnVehicle('jetski', race.start.x, race.start.y, 0, { npcOwned: false });
  board(w, p, ski);
  run(w, 0.5);
  assert.equal(w.raceState[race.id].phase, 'countdown');
  assert.ok(/starts in/.test(players.buildMe(w, p).job.text));
  run(w, COUNTDOWN_S + 0.5);
  assert.equal(w.raceState[race.id].phase, 'running');
  for (const cp of race.cps) { ski.x = cp.x; ski.y = cp.y; ski.vx = 0; ski.vy = 0; w.place(ski); run(w, 0.4); }
  assert.ok(prof.bank > 0, 'prize paid');
  assert.equal(w.raceState[race.id].racers.get(p.pid).place, 1);
});

test('the Westport Raceway: three laps of the oval for anything with wheels, from the grid behind the chequered line', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { bank: 0 });
  const race = w.map.races.find((r) => r.kind === 'wheels');
  assert.ok(race && race.laps === 3 && race.cps.length === race.laps * race.lapLen, 'three laps');
  for (const c of [race.start, ...race.cps]) assert.equal(w.map.tileAtPx(c.x, c.y), T.LOT, 'on the track');
  const rw = w.map.raceways[0];
  assert.ok(race.start.x > rw.start.x && Math.abs(race.cps[race.lapLen - 1].x - (rw.start.x + rw.start.w / 2)) < 2, 'the grid behind the line; each lap ends on it');
  // a boat doesn't qualify; a car does
  const car = w.spawnVehicle('sports', race.start.x, race.start.y, Math.PI, { npcOwned: false });
  board(w, p, car);
  run(w, 0.5);
  assert.equal(w.raceState[race.id].phase, 'countdown');
  assert.ok(/stay at the start line/.test(players.buildMe(w, p).job.text), 'the HUD');
  run(w, COUNTDOWN_S + 0.5);
  assert.equal(w.raceState[race.id].phase, 'running');
  for (const cp of race.cps.slice(0, race.lapLen)) { car.x = cp.x; car.y = cp.y; car.vx = 0; car.vy = 0; w.place(car); run(w, 0.4); }
  assert.ok(/lap 2\/3/.test(players.buildMe(w, p).job.text), `lap two (${players.buildMe(w, p).job.text})`);
  for (const cp of race.cps.slice(race.lapLen)) { car.x = cp.x; car.y = cp.y; car.vx = 0; car.vy = 0; w.place(car); run(w, 0.4); }
  assert.equal(w.raceState[race.id].racers.get(p.pid).place, 1, 'first');
  assert.ok(prof.bank > 0, 'prize paid');
});

test('boat hire: rent at a rental dock, it waits at the pier, hand it back; overdue = reported stolen', async () => {
  const { BOAT_RENTAL_S, BOAT_RENTAL_GRACE_S, BOAT_RENTAL_PRICE } = await import('../shared/rules.js');
  const w = makeWorld();
  assert.ok(w.map.rentals.length >= 4, 'several rental docks');
  assert.ok(w.map.rentals.some((r) => r.lake) && w.map.rentals.some((r) => !r.lake), 'on the sea and on the lakes');
  for (const r of w.map.rentals) for (const s of r.spots) assert.ok([T.WATER, T.DEEP].includes(w.map.tileAtPx(s.x, s.y)), `${r.name} berth is in the water`);
  const r = w.map.rentals.find((q) => !q.lake);
  const poi = w.map.pois[r.poi];
  assert.equal(poi.kind, 'rental');
  const { p, prof } = joinPlayer(w, { cash: 1000, bank: 0 });
  teleport(w, p.ped, poi.x, poi.y);
  const menu = economy.buildMenu(w, p, poi);
  assert.ok(menu.opts.some((o) => o.id === 'rent:jetski' && o.price === BOAT_RENTAL_PRICE.jetski));
  assert.equal(economy.handleMenu(w, p, poi.id, 'rent:jetski') ?? null, null);
  assert.equal(prof.cash, 1000 - BOAT_RENTAL_PRICE.jetski);
  const v = w.get(p.rental.vid);
  assert.ok(v && v.model === 'jetski' && v.rentedBy === prof.pid);
  assert.ok(Math.hypot(v.x - poi.x, v.y - poi.y) < 400, 'waiting at the pier');
  teleport(w, p.ped, v.x + 20, v.y);
  assert.ok(vehicles.tryEnter(w, p.ped), 'climb aboard');
  assert.equal(p.heat, 0, 'not stealing');
  const act = players.findInteraction(w, p);
  assert.ok(act && /Hand back/.test(act.label), act && act.label);
  act.run();
  assert.ok(!w.get(v.id), 'returned');
  assert.equal(p.ped.vehId, 0);
  // hire again and stay out past the time
  economy.handleMenu(w, p, poi.id, 'rent:dinghy');
  const v2 = w.get(p.rental.vid);
  board(w, p, v2);
  w.time = p.rental.until + 1; run(w, 1);
  assert.ok(p.rental && p.rental.overdue, 'overdue warning');
  w.time = p.rental.until + BOAT_RENTAL_GRACE_S + 2; run(w, 1);
  assert.equal(p.rental, null);
  assert.equal(v2.rentedBy, 0, 'reported stolen');
  assert.ok(p.wanted >= 1, 'the company tipped off the police');
  void BOAT_RENTAL_S;
});

test('waterfront homes: a private pier and boathouse; moor a boat there and take it out again', () => {
  const w = makeWorld();
  const wf = w.map.homes.filter((h) => h.dock);
  assert.ok(wf.length >= 6, `waterfront homes (${wf.length})`);
  assert.equal(w.map.boathouses.length, wf.length);
  for (const h of wf) {
    assert.ok([T.WATER, T.DEEP].includes(w.map.tileAtPx(h.dock.x, h.dock.y)), `${h.name}: the slip is in the water`);
    assert.equal(w.map.tileAtPx(h.dock.walk.x, h.dock.walk.y), T.DOCK, `${h.name}: the pier starts ashore`);
  }
  const h = wf[0];
  const poi = w.map.pois.find((q) => q.kind === 'home' && q.home === h.id);
  const { p, prof } = joinPlayer(w, { bank: 1e6 });
  teleport(w, p.ped, h.x, h.y);
  economy.handleMenu(w, p, poi.id, 'hbuy');
  assert.ok(w.homeOwner.get(h.id) === prof.pid);
  assert.ok(/waterfront|boat/.test(economy.buildMenu(w, p, poi).sub));
  prof.vehicles.push({ model: 'speedboat', paint: 0 });
  const idx = prof.vehicles.length - 1;
  const m = economy.buildMenu(w, p, poi);
  assert.ok(m.opts.some((o) => o.id === `hboat:${idx}`), 'boats come out of the boathouse');
  assert.equal(economy.handleMenu(w, p, poi.id, `hboat:${idx}`) ?? null, null);
  const v = w.get(p.ped.vehId);
  assert.ok(v && v.model === 'speedboat' && v.owner === prof.pid, 'at the helm of your boat');
  assert.equal(prof.vehicles.length, idx + 1);
  // the stored list keeps the boat; take a spin and moor it back
  v.vx = 0; v.vy = 0;
  const act = players.findInteraction(w, p);
  assert.ok(act && /boathouse/.test(act.label), act && act.label);
  const before = prof.vehicles.length;
  act.run();
  assert.equal(prof.vehicles.length, before, 'moored (still one boat on your list)');
  assert.ok(!w.get(v.id), 'in the boathouse');
  assert.equal(p.ped.vehId, 0);
  assert.equal(w.map.tileAtPx(p.ped.x, p.ped.y), T.DOCK, 'you step off onto the pier');
});

// A bridge is two layers on one tile (map.js T.BRIDGE): the deck, reached from the road, and the water under it,
// reached by swimming in (ped.under). A boat is always down on the water.
test('out of a boat under a bridge: into the water under the deck, swimming - never up on it (task #381)', () => {
  const w = makeWorld();
  const m = w.map;
  const { p } = joinPlayer(w);
  const ped = p.ped;
  const dryNear = (x, y, r) => {
    for (let ty = Math.floor((y - r) / TILE); ty <= Math.floor((y + r) / TILE); ty++) for (let tx = Math.floor((x - r) / TILE); tx <= Math.floor((x + r) / TILE); tx++) {
      const t = m.tileAt(tx, ty);
      if (!PED_BLOCK[t] && t !== T.BRIDGE) return true;
    }
    return false;
  };
  let tried = 0, swam = 0, mid = null;
  for (const e of m.edges) {
    if (e.lvl !== 0 || !e.bridge) continue;
    for (let s = 40; s < e.len - 40; s += 120) {
      const q = pointAt(e.pts, s);
      if (m.tileAtPx(q.x, q.y) !== T.BRIDGE) continue;
      const boat = w.spawnVehicle('dinghy', q.x, q.y, Math.atan2(q.ty, q.tx), { npcOwned: false });
      board(w, p, boat);
      ped.under = false;   // (aboard from a pier)
      vehicles.exitVehicle(w, ped);
      tried++;
      const t = m.tileAtPx(ped.x, ped.y);
      assert.equal(ped.vehId, 0);
      assert.equal(ped.lz || 0, 0, 'at the water\'s level');
      assert.ok(t !== T.BRIDGE || isSwimming(m, ped), `out of a boat under the bridge at (${Math.round(q.x)}, ${Math.round(q.y)}): up on its deck`);
      if (isSwimming(m, ped)) swam++;
      if (!mid && t === T.BRIDGE && !dryNear(q.x, q.y, 200)) mid = q;
      w.remove(boat);
    }
  }
  assert.ok(tried > 40 && swam > tried / 2, `boats under the bridges: ${tried}, out into the water ${swam}`);
  assert.ok(mid, 'a bridge with open water all round');
  // mid-span: over the side, swimming under the deck, and still down there a second later
  const boat = w.spawnVehicle('dinghy', mid.x, mid.y, Math.atan2(mid.ty, mid.tx), { npcOwned: false });
  board(w, p, boat);
  ped.under = false;
  run(w, 0.2);
  vehicles.exitVehicle(w, ped);
  run(w, 1);
  assert.equal(ped.vehId, 0);
  assert.ok(isSwimming(m, ped), 'swimming under the bridge');
  assert.equal(ped.lz || 0, 0);
  // and out of a car on that bridge you're up on its deck, whatever you were doing before
  const car = w.spawnVehicle('sedan', mid.x, mid.y, Math.atan2(mid.ty, mid.tx), { npcOwned: false });
  const q = joinPlayer(w).p;
  board(w, q, car);
  q.ped.under = true;   // (swam under here earlier)
  vehicles.exitVehicle(w, q.ped);
  run(w, 0.5);
  assert.equal(m.tileAtPx(q.ped.x, q.ped.y), T.BRIDGE, 'stepped out onto the deck');
  assert.ok(!isSwimming(m, q.ped), 'out of a car on a bridge: on the deck, not in the water');
});
