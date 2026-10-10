// The bus lines (server/systems/transit.js): lines worked out from the city's bus shelters, buses running them and
// calling at every stop in turn, boarding one at a stop (the fare), riding it and getting off at the next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import * as transit from '../server/systems/transit.js';
import * as vehicles from '../server/systems/vehicles.js';
import { findInteraction } from '../server/systems/players.js';
import { BUS_DWELL_S } from '../shared/rules.js';
import { deadWays } from '../server/systems/roadends.js';
import { exitsFrom } from '../shared/roads.js';
import { ferryRoutes } from '../server/systems/ferries.js';

test('bus lines: loops through each town zone\'s shelters, joined end to end along the streets', () => {
  const world = makeWorld();
  const lines = transit.busLines(world);
  assert.ok(lines.length >= 3, `only ${lines.length} lines`);
  const net = world.map.net;
  for (const L of lines) {
    assert.ok(L.stops.length >= 3, `${L.name}: ${L.stops.length} stops`);
    // every step starts where the one before ended (round the loop), and every stop is on exactly one step
    L.steps.forEach((st, i) => {
      const prev = L.steps[(i - 1 + L.steps.length) % L.steps.length], e = net.edges[prev.edge];
      assert.equal(st.from, e.a === prev.from ? e.b : e.a, `${L.name}: step ${i} doesn't follow on`);
      assert.equal(net.edges[st.edge].lvl, 0);
    });
    const on = L.steps.flatMap((st) => st.stops).sort((a, b) => a - b);
    assert.deepEqual(on, L.stops.map((_, k) => k), `${L.name}: stops on its steps`);
    for (const s of L.stops) assert.ok(s.name, 'every stop has a name');
  }
});

// The owner, 2026-10-10: "southside bus route is getting jammed up because it turns into a deadend street and the buses
// get stuck there. Lets rethink the route so that the buses go in a full loop."
test('every bus line is a closed loop on through streets: never a dead end, a cul-de-sac or a U-turn', () => {
  const world = makeWorld();
  const net = world.map.net, dead = deadWays(net);
  const lines = transit.busLines(world);
  assert.ok(lines.length >= 4, `${lines.length} lines`);
  for (const L of lines) {
    const n = L.steps.length;
    assert.ok(n >= 4, `${L.name}: ${n} steps`);
    L.steps.forEach((st, i) => {
      const e = net.edges[st.edge], nx = L.steps[(i + 1) % n];
      assert.ok(st.from === e.a || st.from === e.b, `${L.name}: step ${i} enters its street from one of its ends`);
      const to = e.a === st.from ? e.b : e.a;
      // the legs join up, and the last step comes round to the first (the loop closes)
      assert.equal(nx.from, to, `${L.name}: step ${(i + 1) % n} doesn't start where step ${i} ends`);
      assert.ok(!dead.has(st.edge * 2) && !dead.has(st.edge * 2 + 1), `${L.name}: step ${i} is down a street that leads only to a road's end (${e.name})`);
      assert.ok(!e.culdesac, `${L.name}: step ${i} is a cul-de-sac (${e.name})`);
      assert.ok(net.nodes[to].edges.length > 1, `${L.name}: step ${i} runs into a road's end`);
      assert.ok(!e.oneway || st.from === e.a, `${L.name}: step ${i} the wrong way down a one-way street`);
      assert.notEqual(nx.edge, st.edge, `${L.name}: a U-turn after step ${i} (${e.name})`);
      assert.ok(exitsFrom(net, net.nodes[to], st.edge).some((x) => x.edge === nx.edge), `${L.name}: step ${i} to ${(i + 1) % n} isn't a turn a driver can take`);
      assert.ok(transit.busRoad(net, e), `${L.name}: step ${i} isn't a through street a bus may use (${e.kind} ${e.name})`);
    });
    // every stop on the step it's on, at the kerb a bus pulls up at (its stretch, the way it runs)
    L.steps.forEach((st) => { for (const k of st.stops) { assert.equal(L.stops[k].edge, st.edge); assert.equal(L.stops[k].from, st.from); } });
  }
  // Southside (the owner's): a full loop, round and back to the start along no street twice
  const S = lines.find((L) => L.name === 'Southside Line');
  assert.ok(S, 'the Southside Line runs');
  const seen = new Set();
  for (const st of S.steps) { assert.ok(!seen.has(st.edge), `Southside Line: along ${net.edges[st.edge].name} twice`); seen.add(st.edge); }
});

// The owner, 2026-10-10: "Lets make sure buses are hitting the ferry terminals on the mainlands too so players can take a
// bus and get off at a ferry terminal if they want."
test('every mainland ferry terminal has a stop on a bus line, named for its ferry', () => {
  const world = makeWorld();
  const routes = ferryRoutes(world), lines = transit.busLines(world);
  assert.ok(routes.length >= 4);
  for (const R of routes) {
    const L = lines.find((q) => q.stops.some((s) => s.ferry === R.id));
    assert.ok(L, `${R.name}: no bus line calls at its mainland pier`);
    const s = L.stops.find((q) => q.ferry === R.id), pier = R.ends[0];
    assert.equal(s.name, `${R.island} Ferry`);
    assert.ok(Math.hypot(s.x - pier.sx, s.y - pier.sy) < 9000, `${R.name}: its stop is ${Math.round(Math.hypot(s.x - pier.sx, s.y - pier.sy) / 32)} m from the pier`);
    assert.ok(L.steps.some((st) => st.stops.includes(L.stops.indexOf(s))), 'on the line\'s loop');
  }
  // the ones with a street by the pier: a stop right there
  for (const name of ['Coral Cay', 'Paradise Cay']) {
    const R = routes.find((q) => q.island === name), s = lines.flatMap((L) => L.stops).find((q) => q.ferry === R.id);
    assert.ok(Math.hypot(s.sx - R.ends[0].sx, s.sy - R.ends[0].sy) < 1200, `${name}: by the pier`);
  }
});

test('a shelter the line passes across the street from: told where the bus stops', () => {
  const world = makeWorld({ transit: true });
  const { p } = joinPlayer(world);
  const L = transit.busLines(world).find((q) => q.across && q.across.length);
  if (!L) return;   // (no facing shelters on this map)
  const a = L.across[0];
  teleport(world, p.ped, a.sx, a.sy);
  run(world, 1);
  const note = transit.stopNote(world, p);
  assert.match(note.label, /across the street/);
});

test('buses run their lines, calling at every stop in turn', () => {
  const world = makeWorld({ transit: true });
  joinPlayer(world);
  run(world, 2);
  const lines = transit.busLines(world);
  for (const L of lines) assert.ok((world.buses.get(L.id) || []).length >= 1, `${L.name} has a bus out`);
  // watch one bus on the shortest line round its stops
  const L = lines.slice().sort((a, b) => a.len - b.len)[0];
  const v = world.get(world.buses.get(L.id)[0]);
  const calls = [];
  // (it stops at every red light on the way, behind the line: a few minutes round)
  for (let t = 0; t < 600 && calls.length < L.stops.length + 1; t++) {
    run(world, 0.5);
    if (v.bus.atStop >= 0 && calls[calls.length - 1] !== v.bus.atStop) calls.push(v.bus.atStop);
  }
  assert.ok(calls.length >= L.stops.length, `${L.name}: called at ${calls.length} stops`);
  for (let i = 1; i < calls.length; i++) assert.equal(calls[i], (calls[i - 1] + 1) % L.stops.length, `${L.name}: stops in order (${calls})`);
});

test('board a bus at its stop (free), ride it and get off at the next stop', () => {
  const world = makeWorld({ transit: true });
  const { p } = joinPlayer(world, { cash: 50 });
  const L = transit.busLines(world).slice().sort((a, b) => a.len - b.len)[0];
  const st = L.stops[0];
  teleport(world, p.ped, st.sx, st.sy);
  // the stop's note says when the next bus comes; then the bus pulls up and waits
  run(world, 2);
  let bus = null;
  for (let t = 0; t < 400 && !bus; t++) { run(world, 0.5); teleport(world, p.ped, st.sx, st.sy); bus = transit.busToBoard(world, p.ped); }
  assert.ok(bus, 'a bus pulled up at the stop');
  assert.equal(bus.bus.atStop, 0);
  const act = findInteraction(world, p);
  assert.match(act.label, /Board the .* bus/);
  act.run();
  assert.equal(p.ped.vehId, bus.id);
  assert.ok(p.ped.seat > 0, 'a passenger seat');
  assert.equal(p.profile.cash, 50, 'free');
  assert.equal(transit.rideInfo(world, p).line, L.name);
  // off it goes; at the next stop, get off
  let at = -1;
  for (let t = 0; t < 400; t++) { run(world, 0.5); if (bus.bus.atStop > 0 && bus.bus.dwellUntil > world.time) { at = bus.bus.atStop; break; } }
  assert.equal(at, 1, 'the bus came to the next stop');
  assert.equal(transit.rideInfo(world, p).at, L.stops[1].name);
  vehicles.exitVehicle(world, p.ped);
  assert.equal(p.ped.vehId, 0);
  assert.ok(Math.hypot(p.ped.x - L.stops[1].sx, p.ped.y - L.stops[1].sy) < 220, 'off at the stop');
  assert.ok(p.ped.hp >= p.ped.maxHp, 'stepped off, not thrown');
  void BUS_DWELL_S;
});

test('no money needed: the buses are free', () => {
  const world = makeWorld({ transit: true });
  const { p } = joinPlayer(world, { cash: 0, bank: 0 });
  const L = transit.busLines(world)[0];
  run(world, 2);
  const v = world.get(world.buses.get(L.id)[0]);
  v.bus.dwellUntil = world.time + 5;
  teleport(world, p.ped, v.x, v.y + 80);
  assert.equal(transit.boardBus(world, p, v), true);
  assert.equal(p.ped.vehId, v.id);
});

// ---- taxis -----------------------------------------------------------------------------------------------------------
import { TAXI_FLAG, TAXI_REFUSE_STARS } from '../shared/rules.js';
import * as traffic from '../server/systems/traffic.js';
import { spawnNpc } from '../server/systems/npc.js';

function cabRide(world, p, dest) {
  const v = world.get(p.taxi);
  for (let t = 0; t < 400 && v.taxi && v.taxi.st === 'pickup'; t++) run(world, 0.5);
  assert.equal(v.taxi.st, 'wait', 'the taxi pulled up');
  assert.ok(Math.hypot(v.x - p.ped.x, v.y - p.ped.y) < 400, 'by the kerb near you');
  teleport(world, p.ped, v.x - Math.sin(v.a) * 50, v.y + Math.cos(v.a) * 50);
  const act = findInteraction(world, p);
  assert.equal(act && act.label, 'Get in the taxi');
  act.run();
  assert.equal(p.ped.vehId, v.id);
  assert.ok(p.ped.seat >= 2, 'in the back');
  assert.equal(v.taxi.st, 'dest', 'asks where to');
  transit.taxiPhone(world, p, { op: 'dest', ...dest });
  run(world, 1.1);
  assert.equal(v.taxi.st, 'ride');
  return v;
}

test('taxi: call one, it pulls up at the kerb, get in, say where to, ride there, pay getting out', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world, { cash: 300, bank: 0 });
  teleport(world, p.ped, 21648, 18030);   // (Midtown, on the pavement)
  run(world, 1);
  transit.taxiPhone(world, p, { op: 'call' });
  assert.ok(p.taxi, 'a taxi is coming');
  assert.equal(transit.taxiInfo(world, p).st, 'pickup');
  const v = cabRide(world, p, { x: 31792, y: 25700, label: 'Southside' });
  for (let t = 0; t < 800 && v.taxi.st === 'ride'; t++) run(world, 0.5);
  assert.equal(v.taxi.st, 'there');
  assert.ok(Math.hypot(v.x - 31792, v.y - 25700) < 300, 'dropped off by the destination');
  const fare = transit.taxiInfo(world, p).fare;
  assert.ok(fare > TAXI_FLAG, `metered: $${fare}`);
  vehicles.exitVehicle(world, p.ped);
  run(world, 1.1);
  assert.equal(p.profile.cash, 300 - fare, 'paid getting out');
  assert.equal(p.taxi, 0);
  assert.equal(v.taxi, undefined, 'the cab back on its rounds');
});

test('taxi: no skipping the ride (nothing to press on the way)', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world, { cash: 300, bank: 0 });
  teleport(world, p.ped, 21648, 18030);
  run(world, 1);
  transit.taxiPhone(world, p, { op: 'call' });
  const v = cabRide(world, p, { x: 31792, y: 25700, label: 'Southside' });
  const act = findInteraction(world, p);
  assert.ok(act && act.passive && !/Skip/.test(act.label), `just where you're going (${act && act.label})`);
  const at = { x: v.x, y: v.y };
  act.run();
  assert.equal(v.taxi.st, 'ride', 'still riding');
  assert.ok(Math.hypot(v.x - at.x, v.y - at.y) < 60, 'no jump to the end');
});

test('taxi: hail one going by; none for the wanted', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world, { cash: 300 });
  teleport(world, p.ped, 21648, 18030);
  // a cab in traffic going past
  const v = world.spawnVehicle('taxi', 21500, 17918, 0, {});
  const drv = spawnNpc(world, 'casual', v.x, v.y, 'driver');
  drv.vehId = v.id; drv.seat = 0; v.seats[0] = drv.id;
  traffic.joinTraffic(world, v);
  run(world, 0.2);
  p.wanted = TAXI_REFUSE_STARS;
  let act = findInteraction(world, p);
  assert.equal(act && act.label, 'Hail the taxi');
  act.run();
  assert.equal(p.taxi || 0, 0, 'no taxi stops for the wanted');
  p.wanted = 0;
  act = findInteraction(world, p);
  act.run();
  assert.equal(p.taxi, v.id, 'pulling over');
  for (let t = 0; t < 300 && v.taxi.st === 'pickup'; t++) run(world, 0.5);
  assert.equal(v.taxi.st, 'wait');
});

// ---- the phone in your hand ----------------------------------------------------------------------------------------
import * as phoneSys from '../server/systems/phone.js';
test('phone menu open: the phone in your hand for everyone (the descriptor), put away on closing or in a vehicle', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world);
  const v0 = p.ped.appVer || 0;
  phoneSys.handle(world, p, { a: 'out', on: true });
  assert.ok(p.ped.phoneOut, 'out');
  assert.ok((p.ped.appVer || 0) > v0, 'the descriptor goes again');
  phoneSys.handle(world, p, { a: 'out', on: false });
  assert.equal(p.ped.phoneOut, 0);
  phoneSys.handle(world, p, { a: 'out', on: true });
  const car = world.spawnVehicle('sedan', p.ped.x + 30, p.ped.y, 0, { npcOwned: false });
  assert.ok(vehicles.tryEnter(world, p.ped), 'in the car');   // (in a vehicle: put away)
  run(world, 1.1);
  assert.equal(p.ped.phoneOut, 0);
  void car;
});
