// Islands by boat, the Syndicate and Smuggler's Rock, poaching runs, deep-sea charters, NPC and
// police boats, and the water races.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { ISLANDS } from '../shared/map.js';
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

test('Pelican Key and Smuggler\'s Rock: boat-only islands with a charter dock and the Den', () => {
  const w = makeWorld();
  for (const k of ['P', 'C']) {
    const [x0, y0, x1, y1] = ISLANDS[k].box;
    let land = 0, road = 0;
    for (let ty = y0 - 6; ty < y1 + 6; ty++) for (let tx = x0 - 6; tx < x1 + 6; tx++) { const t = w.map.tileAt(tx, ty); if (t === T.ROAD || t === T.BRIDGE) road++; if (t !== T.WATER && t !== T.DEEP) land++; }
    assert.ok(land > 1000, `${ISLANDS[k].name} has land`);
    assert.equal(road, 0, `${ISLANDS[k].name} has no road or bridge to it`);
  }
  assert.ok(poiOf(w, 'charter') && poiOf(w, 'smuggler'));
  assert.ok(w.map.offshore.length > 50, 'offshore fishing grounds');
  for (const r of w.map.races) for (const c of [r.start, ...r.cps]) assert.ok([T.WATER, T.DEEP].includes(w.map.tileAtPx(c.x, c.y)), `${r.name} buoy on water`);
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
  const sp = w.map.offshore[Math.floor(w.map.offshore.length / 2)];
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
