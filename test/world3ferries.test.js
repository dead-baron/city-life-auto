// World v3's ferries (docs/WORLD-V3.md 8.17, H42): the piers, terminals, ramps and pontoons the world build lays where
// each route of the skeleton calls (shared/world3-ferries.js), the routes planned per corridor on the v3 map within the
// planner's time, a boat on each route calling at every stop on its timetable, riders carried (on foot round the walk-on
// loop - World v3b's Gulf Water Bus; a car on the car ferry). One world build (about 30-40 s here, today's world and the land
// before it); the World runs on it with the ferries asked for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { FERRIES } from '../shared/world3-skeleton.js';
import { FERRY3, boatWater } from '../shared/world3-ferries.js';
import { prepare } from '../tools/world3-build.mjs';
import { World } from '../server/world.js';
import * as ferries from '../server/systems/ferries.js';
import * as vehicles from '../server/systems/vehicles.js';
import { findInteraction } from '../server/systems/players.js';
import { joinPlayer, teleport, run } from './helpers.js';

let M = null;
const map = () => {
  if (!M) { const prep = prepare(); M = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today }); }
  return M;
};
const tileAt = (m, x, y) => m.tiles[Math.floor(y / TILE) * m.w + Math.floor(x / TILE)];
const wet = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE;
const wetAt = (m, x, y) => boatWater(m, Math.floor(y / TILE) * m.w + Math.floor(x / TILE));

test('World v3 ferries: every route\'s stops built - the terminals, the car ferry\'s ramps, the pontoons', { timeout: 300000 }, () => {
  const m = map(), list = m.world3.ferries;
  console.log('ferry stops', JSON.stringify(list.map((F) => [F.name, F.stops.map((s) => [s.name, s.kind, s.shore])])), 'missing', JSON.stringify(list.missing));
  assert.deepEqual(list.map((F) => F.name), FERRIES.map((F) => F.name), 'the skeleton\'s six routes');
  assert.deepEqual(list.missing, [], 'every stop found its shore');
  for (const F of list) {
    const R = FERRY3.find((q) => q.name === F.name);
    assert.equal(F.stops.length, R.stops.length, `${F.name}: every stop`);
    for (const st of F.stops) {
      const [tx, ty] = FERRIES.find((q) => q.name === F.name).pts[st.pt];
      const d = Math.hypot(st.shore[0] - tx, st.shore[1] - ty);
      assert.ok(d < 250, `${F.name} - ${st.name}: ${Math.round(d)} tiles from the skeleton's point`);
      // the pier: boards from the shore to its end, the boat's water beyond it
      for (let k = 1; k <= 3; k++) assert.equal(tileAt(m, st.x - st.ox * (k - 0.5) * TILE, st.y - st.oy * (k - 0.5) * TILE), T.DOCK, `${st.name}: the pier's boards`);
      for (let k = 1; k <= 8; k++) assert.ok(wet(tileAt(m, st.x + st.ox * (k - 0.5) * TILE, st.y + st.oy * (k - 0.5) * TILE)), `${st.name}: open water off the pier's end`);
      if (st.kind === 'terminal') {
        const b = m.buildings[st.building];
        assert.ok(b && b.kind === 'terminal' && b.name.includes(st.name), `${st.name}: its waiting room`);
        assert.equal(m.tiles[(b.ty + 1) * m.w + b.tx + 1], T.BUILDING);
        assert.equal(m.tiles[st.shore[1] * m.w + st.shore[0]], T.PLAZA, `${st.name}: the forecourt`);
      } else if (st.kind === 'ramp') {
        assert.ok(st.land && tileAt(m, st.land.x, st.land.y) === T.LOT, `${st.name}: the marshalling lot`);
        assert.equal(m.buildings[st.building].kind, 'booth', `${st.name}: the ticket booth`);
      } else assert.equal(m.tiles[st.shore[1] * m.w + st.shore[0]], T.DOCK, `${st.name}: the pontoon's gangway ashore`);
    }
  }
  const terminals = list.flatMap((F) => F.stops).filter((s) => s.kind === 'terminal').map((s) => s.name);
  assert.deepEqual(terminals, FERRY3.flatMap((R) => R.stops).filter((s) => s.kind === 'terminal').map((s) => s.name), 'the walk-on terminals');
  for (const R of FERRY3.filter((q) => q.car)) assert.equal(list.find((F) => F.name === R.name).stops.filter((s) => s.kind === 'ramp').length, 2, `${R.name}: a ramp each end`);
});

test('World v3 ferries: the routes planned per corridor on the v3 map, in time, every way on water', { timeout: 300000 }, () => {
  const m = map();
  const t0 = performance.now(), routes = ferries.ferryRoutes({ map: m }), ms = performance.now() - t0;
  console.log(`planned in ${Math.round(ms)} ms:`, routes.map((R) => `${R.name} (${R.stops.map((s) => s.name).join(' - ')}${R.loop ? ', round' : ''}: ${Math.round(R.len / TILE)} m)`).join('; '));
  if (routes.failed.length) {
    // (what stands in the way: the tiles round the water a leg's start reaches, nearest its far stop)
    const R3 = m.world3.ferries;
    for (const f of routes.failed) {
      const F = R3.find((q) => f.startsWith(q.name)), [a, b] = f.slice(F.name.length + 2).split(' - ').map((nm) => F.stops.find((s) => s.name === nm));
      const W = m.w, seen = new Set(), q = [[Math.floor((a.x + a.ox * 400) / TILE), Math.floor((a.y + a.oy * 400) / TILE)]], bt = [Math.floor(b.x / TILE), Math.floor(b.y / TILE)];
      let best = [1e9, null];
      for (let h = 0; h < q.length && h < 2e6; h++) { const [x, y] = q[h]; const d = Math.hypot(x - bt[0], y - bt[1]); if (d < best[0]) best = [d, [x, y]]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = ny * W + nx; if (nx < 0 || ny < 0 || nx >= W || ny >= m.h || seen.has(k) || !boatWater(m, k)) continue; seen.add(k); q.push([nx, ny]); } }
      const types = {}, [cx, cy] = best[1];
      for (let y = cy - 30; y <= cy + 30; y++) for (let x = cx - 30; x <= cx + 30; x++) { const k = y * W + x; if (!seen.has(k) && !boatWater(m, k)) { const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((y + dy) * W + x + dx)); if (nb) { const t = m.tiles[k] + (m.land[k] ? '' : '/wet'); types[t] = (types[t] || 0) + 1; } } }
      console.log(`no way: ${f}; the water from its start reaches ${Math.round(best[0])} tiles from it, at ${cx},${cy}; what stands round there (tile/wet: count):`, JSON.stringify(types));
    }
  }
  assert.ok(ms < 5000, `the planner took ${Math.round(ms)} ms`);
  assert.deepEqual(routes.map((R) => R.name), FERRIES.map((F) => F.name), 'every route planned');
  for (const R of routes) {
    assert.equal(R.legs.length, R.loop ? R.stops.length : R.stops.length - 1, `${R.name}: a leg between each stop`);
    for (const L of R.legs) {
      const w = L.way;
      assert.ok(Math.hypot(w[0].x - L.ends[0].turn.x, w[0].y - L.ends[0].turn.y) < 1 && Math.hypot(w[w.length - 1].x - L.ends[1].turn.x, w[w.length - 1].y - L.ends[1].turn.y) < 1, `${R.name}: ${L.mainland} - ${L.island} from turning point to turning point`);
      for (let i = 1; i < w.length; i++) {
        const n = Math.ceil(Math.hypot(w[i].x - w[i - 1].x, w[i].y - w[i - 1].y) / 16);
        for (let k = 0; k <= n; k++) { const x = w[i - 1].x + (w[i].x - w[i - 1].x) * k / n, y = w[i - 1].y + (w[i].y - w[i - 1].y) * k / n; assert.ok(wetAt(m, x, y), `${R.name}: ${L.mainland} - ${L.island} on the water at ${Math.round(x / TILE)},${Math.round(y / TILE)}`); }
      }
    }
  }
  assert.ok(routes.find((R) => R.name === 'Prison Boat').custody, 'the Prison Boat: custody only');
});

// on to the next part of the trip at once (the test doesn't wait out the timetable)
function skip(world, F) { F.t0 = world.time - F.dur - 0.01; world.step(); }
function boatOf(world, R) {
  for (let t = 0; t < 60 && !(world.ferries && world.ferries[R.id].v); t++) world.step();
  const F = world.ferries[R.id];
  return { F, v: world.get(F.v) };
}
// skip until in at stop `k` (by its name)
function skipToStop(world, R, F, name) {
  for (let n = 0; n < 80; n++) {
    if (F.phase === 'dock' && ferries.ferryInfo(world).find((q) => q.id === R.id).boat.in >= 0 && R.stops[ferries.ferryInfo(world).find((q) => q.id === R.id).boat.in].name === name) return;
    skip(world, F);
  }
  assert.fail(`${R.name} never in at ${name}`);
}

test('World v3 ferries: a boat on each route calling at every stop; riders carried on foot and by car', { timeout: 300000 }, () => {
  const m = map(), world = new World(m, { npcBudget: 0, ferries: true, throwErrors: true });
  const routes = ferries.ferryRoutes(world);
  // every boat round its whole timetable: in at each stop, lying at its berth
  for (const R of routes) {
    if (R.custody) { for (let t = 0; t < 30; t++) world.step(); assert.ok(!world.ferries[R.id].v, 'no boat for custody'); continue; }
    const { F, v } = boatOf(world, R);
    assert.ok(v, `${R.name}: its boat`);
    const seen = [];
    for (let n = 0; n < 6 * (R.stops.length + 1) * 2 && seen.length < (R.loop ? R.stops.length + 1 : 2 * R.stops.length - 1); n++) {
      if (F.phase === 'dock') {
        const info = ferries.ferryInfo(world).find((q) => q.id === R.id), at = info.boat.in, e = R.stops[at];
        if (seen[seen.length - 1] !== e.name) {
          seen.push(e.name);
          assert.ok(Math.hypot(v.x - e.x, v.y - e.y) < 2, `${R.name}: lying at ${e.name}'s pier`);
          assert.ok(info.leaves.every((s) => s !== null && s >= 0), `${R.name}: the timetable has every stop`);
        }
      }
      skip(world, F);
    }
    const want = R.loop ? [...R.stops.map((s) => s.name), R.stops[0].name] : [...R.stops.map((s) => s.name), ...R.stops.slice(0, -1).reverse().map((s) => s.name)];
    console.log(`${R.name}: ${seen.join(' > ')}`);
    assert.deepEqual(seen, want, `${R.name} calls at every stop in turn`);
  }
  // on foot round the walk-on loop (World v3b's Gulf Water Bus): aboard at its first stop, past the second, off at the third
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  {
    const R = routes.find((q) => q.loop && !q.car && !q.custody && q.stops.length >= 3), F = world.ferries[R.id], v = world.get(F.v);
    const [e0, e1, e2] = R.stops;
    skipToStop(world, R, F, e0.name);
    F.t0 = world.time;   // (the whole dwell to walk aboard)
    const { p } = joinPlayer(world);
    teleport(world, p.ped, e0.sx - e0.ox * 30, e0.sy - e0.oy * 30);
    const act = findInteraction(world, p);
    assert.match(act && act.label, new RegExp(`Board the ${esc(R.name)} to ${esc(e1.name)}`));
    act.run();
    assert.equal(p.ped.vehId, v.id);
    skipToStop(world, R, F, e1.name);
    assert.match(ferries.rideInfo(world, p).at, new RegExp(esc(e1.name)));
    assert.equal(p.ped.vehId, v.id, `stays aboard past ${e1.name}`);
    skipToStop(world, R, F, e2.name);
    assert.match(ferries.rideInfo(world, p).at, new RegExp(esc(e2.name)));
    vehicles.exitVehicle(world, p.ped);
    assert.equal(p.ped.vehId, 0);
    const t = m.tileAtPx(p.ped.x, p.ped.y);
    assert.ok(t !== T.WATER && t !== T.DEEP, 'off onto the pier, not into the water');
    assert.ok(Math.hypot(p.ped.x - e2.sx, p.ped.y - e2.sy) < 120, `at ${e2.name}`);
  }
  // a car over on the car ferry and off onto the far side's lot
  {
    const R = routes.find((q) => q.car), F = world.ferries[R.id], v = world.get(F.v);
    skipToStop(world, R, F, R.stops[0].name);
    F.t0 = world.time;
    const { p } = joinPlayer(world);
    const e0 = R.stops[0];
    const car = world.spawnVehicle('sedan', e0.land.x, e0.land.y, Math.atan2(-e0.oy, -e0.ox), { npcOwned: false });
    teleport(world, p.ped, car.x + 40, car.y);
    assert.ok(vehicles.tryEnter(world, p.ped), 'in the car');
    run(world, 1);
    car.x = e0.sx - e0.ox * 120; car.y = e0.sy - e0.oy * 120; world.place(car);
    const act = findInteraction(world, p);
    const e1 = R.stops[1];
    assert.match(act && act.label, new RegExp(`Drive aboard the ${esc(R.name)} to ${esc(e1.name)}`));
    act.run();
    assert.ok(car.onDeck && car.onDeck.f === v.id, 'on the deck');
    skipToStop(world, R, F, e1.name);
    assert.equal(car.onDeck, null, `driven off at ${e1.name}`);
    assert.ok(Math.hypot(car.x - e1.land.x, car.y - e1.land.y) < 400 && car.lz === 0, `on ${e1.name}'s lot`);
    assert.equal(p.ped.vehId, car.id);
  }
});
