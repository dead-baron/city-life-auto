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
