// The bus lines (server/systems/transit.js): lines worked out from the city's bus shelters, buses running them and
// calling at every stop in turn, boarding one at a stop (the fare), riding it and getting off at the next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import * as transit from '../server/systems/transit.js';
import * as vehicles from '../server/systems/vehicles.js';
import { findInteraction } from '../server/systems/players.js';
import { BUS_FARE, BUS_DWELL_S } from '../shared/rules.js';

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
  for (let t = 0; t < 260 && calls.length < L.stops.length + 1; t++) {
    run(world, 0.5);
    if (v.bus.atStop >= 0 && calls[calls.length - 1] !== v.bus.atStop) calls.push(v.bus.atStop);
  }
  assert.ok(calls.length >= L.stops.length, `${L.name}: called at ${calls.length} stops`);
  for (let i = 1; i < calls.length; i++) assert.equal(calls[i], (calls[i - 1] + 1) % L.stops.length, `${L.name}: stops in order (${calls})`);
});

test('board a bus at its stop for the fare, ride it and get off at the next stop', () => {
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
  assert.equal(p.profile.cash, 50 - BUS_FARE);
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

test('no fare, no ride', () => {
  const world = makeWorld({ transit: true });
  const { p } = joinPlayer(world, { cash: 0, bank: 0 });
  const L = transit.busLines(world)[0];
  run(world, 2);
  const v = world.get(world.buses.get(L.id)[0]);
  v.bus.dwellUntil = world.time + 5;
  teleport(world, p.ped, v.x, v.y + 80);
  assert.equal(transit.boardBus(world, p, v), false);
  assert.equal(p.ped.vehId, 0);
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

test('taxi: skip the ride - there at once, for the whole fare', () => {
  const world = makeWorld();
  const { p } = joinPlayer(world, { cash: 300, bank: 0 });
  teleport(world, p.ped, 21648, 18030);
  run(world, 1);
  transit.taxiPhone(world, p, { op: 'call' });
  const v = cabRide(world, p, { x: 31792, y: 25700, label: 'Southside' });
  const est = transit.taxiInfo(world, p).est;
  const act = findInteraction(world, p);
  assert.match(act.label, /Skip the ride/);
  act.run();
  assert.equal(v.taxi.st, 'there');
  assert.ok(Math.hypot(p.ped.x - 31792, p.ped.y - 25700) < 300, 'there');
  run(world, 3);
  assert.ok(Math.hypot(v.x - 31792, v.y - 25700) < 300, 'and it stays put');
  vehicles.exitVehicle(world, p.ped);
  run(world, 1.1);
  assert.ok(Math.abs(p.profile.cash - (300 - est)) <= 2, `charged the whole way: ${300 - p.profile.cash} vs ~${est}`);
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
