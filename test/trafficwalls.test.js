// Traffic and the buildings (the owner, 2026-10-17: "Vehicles are still turning and getting stuck on buildings" - NPC
// cars up on the pavement at a junction corner by a diner, nosed into its front and the building beside it, round two
// ambulances and a burning wreck in the road; tools/trafficbuildings.mjs measures it on World v3). What these hold
// (server/systems/traffic.js, roadends.js, reroute.js):
//  - a lane's waypoints keep its corners: a street that turns in one point (Mill Lane here; Gull Lane in Sandpiper Bay,
//    Assay Street, Company Row in World v3) is driven round its corner, not across the block;
//  - nothing an NPC drives pushes on into a building: a car up on the pavement nose to a shop front, its lane behind it,
//    backs out and drives on; a panicking driver brakes short of the wall;
//  - giving way to a siren, a car eases over along the road - it used to keep turning toward the kerb, up the pavement;
//  - a car stopped behind a street blocked across both lanes, a queue behind it, doesn't turn round into the shop fronts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { CAR_BLOCK } from '../shared/map.js';
import { lanePath, laneOffset } from '../shared/roads.js';
import { measure, pointAt, project } from '../shared/geom.js';
import { VEHICLES } from '../shared/vehicles.js';
import { spawnNpc } from '../server/systems/npc.js';
import * as traffic from '../server/systems/traffic.js';

function car(w, model, x, y, a = 0) {
  const v = w.spawnVehicle(model, x, y, a, {});
  const d = spawnNpc(w, 'casual', v.x, v.y, 'driver'); d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  return v;
}
// how a vehicle's body sits against the buildings and walls: 'in' (3 px inside its outline is on one), 'touch' (4 px
// out from it is), or ''
function contact(m, v) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  let touch = false;
  for (const [inset, res] of [[-3, 'in'], [4, 'touch']]) {
    const hl = v.def.L / 2 + inset, hw = v.def.W / 2 + inset;
    for (const f of [-1, -0.5, 0, 0.5, 1]) for (const l of [-1, 0, 1]) {
      if (CAR_BLOCK[m.tileAtPx(v.x + c * f * hl - s * l * hw, v.y + s * f * hl + c * l * hw)]) { if (res === 'in') return 'in'; touch = true; }
    }
  }
  return touch ? 'touch' : '';
}
const segD = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)); return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y); };
// the furthest a lane's points stray from the waypoints a car is given for it, entered at arc length s0 (traffic.js
// enterEdge: the lane's points from the first one past s0 on)
function stray(lp, s0) {
  let i0 = 0;
  while (i0 < lp.length - 1 && lp[i0 + 1].s <= s0) i0++;
  const pts = traffic.stride(lp, i0 + 1);
  const a = lp[i0], b = lp[i0 + 1], t = (s0 - a.s) / Math.max(1, b.s - a.s);
  const poly = [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ...pts];
  let dev = 0;
  for (let i = i0 + 1; i < lp.length; i++) { let d = Infinity; for (let j = 1; j < poly.length; j++) d = Math.min(d, segD(lp[i], poly[j - 1], poly[j])); dev = Math.max(dev, d); }
  return dev;
}

test('a lane\'s waypoints keep its corners: a street that turns in one point, and every lane of the map', () => {
  // an L: 1000 px east, then 800 px south - the corner is the first point past the start
  const L = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }];
  measure(L);
  const pts = traffic.stride(L, 1);
  assert.ok(pts.some((p) => p.x === 1000 && p.y === 0), `the corner is kept (${JSON.stringify(pts)})`);
  assert.ok(stray(L, 0) < 1 && stray(L, 400) < 1, 'nothing strays off the L');
  // every lane of every street, entered at its start and part way along
  const w = makeWorld(), net = w.map.net;
  let n = 0, worst = 0, at = null;
  for (const e of net.edges) for (const from of e.oneway ? [e.a] : [e.a, e.b]) for (let k = 0; k < e.nl; k++) {
    const lp = lanePath(net, e, from, k);
    for (const s0 of [0, ...lp.slice(1, -1).map((p) => p.s - 60)]) {
      if (s0 < 0) continue;
      const d = stray(lp, s0);
      n++;
      if (d > worst) { worst = d; at = `${e.name} (${e.kind}, edge ${e.id})`; }
    }
  }
  assert.ok(n > 3000, `${n} lane entries`);
  assert.ok(worst <= 24, `the waypoints stray at most 24 px from their lane (${Math.round(worst)} px on ${at})`);
});

test('a car down a street that turns in one point drives round the corner on the road, never into the block', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  // the street with the sharpest one-point corner whose chord (start to end) crosses a building
  let pick = null;
  for (const e of net.edges) {
    if (e.lvl !== 0 || e.pts.length !== 3 || e.oneway || e.kind === 'alley') continue;
    const [a, b, c] = e.pts;
    let turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn < 0.6) continue;
    const L = Math.hypot(c.x - a.x, c.y - a.y);
    let blocked = false;
    for (let s = 0; s < L && !blocked; s += 12) blocked = !!CAR_BLOCK[m.tileAtPx(a.x + (c.x - a.x) * s / L, a.y + (c.y - a.y) * s / L)];
    if (blocked && (!pick || turn > pick.turn)) pick = { e, turn };
  }
  assert.ok(pick, 'a street with a one-point corner, a building inside it');
  const { e } = pick;
  for (const from of [e.a, e.b]) {
    const lp = lanePath(net, e, from, 0), p = lp[0], end = lp[lp.length - 1];
    const { p: pl } = joinPlayer(w);
    teleport(w, pl.ped, e.pts[1].x + 220, e.pts[1].y + 220);
    const v = car(w, 'sedan', p.x, p.y, Math.atan2(lp[1].y - p.y, lp[1].x - p.x));
    traffic.joinTraffic(w, v);
    assert.ok(v.ai && v.ai.edge === e.id, 'in traffic on it');
    v.vx = Math.cos(v.a) * 120; v.vy = Math.sin(v.a) * 120;
    let touched = 0, offRoad = 0, closest = Infinity;
    for (let t = 0; t < 30 * 20; t++) {
      w.step();
      if (!v.ai) break;
      if (contact(m, v)) touched++;
      const tt = m.tileAtPx(v.x, v.y);
      if (tt !== T.ROAD && tt !== T.BRIDGE && tt !== T.LOT) offRoad++;
      closest = Math.min(closest, Math.hypot(v.x - end.x, v.y - end.y));
      if (closest < 40) break;
    }
    assert.ok(closest < 40, `${e.name} from ${from}: it got round the corner to the far end (${Math.round(closest)} px from it)`);
    assert.equal(touched, 0, `${e.name} from ${from}: never against a building`);
    assert.ok(offRoad <= 10, `${e.name} from ${from}: on the road (${offRoad} ticks off it)`);
    traffic.removeVehicle(w, v);
  }
});

// a straight east-west two-way street (one edge, no junction along it) with a building face along its north pavement
// from x for 160 px, and 700 px of the street east of x: { r: { y, hw }, e, x, wallY, kerb } - the building's south face
// at wallY, the road's tiles ending at kerb
function streetByBuilding(m) {
  for (const e of m.edges) {
    if (e.lvl !== 0 || e.oneway || e.bridge || !['st', 'minor'].includes(e.kind)) continue;
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    if (e.pts.some((p) => Math.abs(p.y - a.y) > 2) || Math.abs(b.x - a.x) < 1100) continue;
    for (let x = Math.min(a.x, b.x) + 220; x < Math.max(a.x, b.x) - 820; x += 16) {
      let kerb = a.y;   // (where the road's tiles end, north of its middle)
      while (kerb > a.y - 260 && m.tileAtPx(x, kerb - 1) === T.ROAD) kerb -= 4;
      let wallY = null;
      for (let y = kerb - 8; y > kerb - 130; y -= 4) if (CAR_BLOCK[m.tileAtPx(x, y)]) { wallY = Math.floor(y / TILE) * TILE + TILE; break; }
      if (wallY === null || kerb - wallY < 48) continue;
      let ok = true;
      for (let dx = -40; dx <= 160 && ok; dx += 8) ok = !!CAR_BLOCK[m.tileAtPx(x + dx, wallY - 4)] && !CAR_BLOCK[m.tileAtPx(x + dx, wallY + 4)] && m.tileAtPx(x + dx, kerb - 6) !== T.ROAD && m.tileAtPx(x + dx, kerb + 6) === T.ROAD;
      for (let dx = 0; dx <= 700 && ok; dx += 16) ok = m.tileAtPx(x + dx, kerb - 6) !== T.ROAD;   // (no side street along it)
      if (ok) return { r: { y: a.y, hw: e.hw }, e, x, wallY, kerb };
    }
  }
  return null;
}

test('a car up on the pavement nose to a shop front, its lane behind it, backs out and drives on - never pushing into the wall', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a street with a building along its pavement');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x + 400, S.r.y + S.r.hw + 120);
  // facing the building, its nose 5 px off the wall, a little across (heading north-east: its lane runs east)
  const v = car(w, 'sedan', S.x, S.wallY + 40, -Math.PI / 2 + 0.5);
  v.y = S.wallY + 5 + (v.def.L / 2) * Math.cos(0.5) + (v.def.W / 2) * Math.sin(0.5);
  w.place(v);
  traffic.joinTraffic(w, v);
  assert.ok(v.ai, 'in traffic');
  let pressed = 0, maxPressed = 0, inside = 0, outAt = -1;
  for (let t = 0; t < 20 * 20; t++) {
    w.step();
    if (!v.ai) break;
    const ct = contact(m, v);
    if (ct === 'in') inside++;
    // pushing on it: touching it with the throttle open, not backing away
    if (ct && v.input.throttle > 0.1) { pressed++; maxPressed = Math.max(maxPressed, pressed); } else pressed = 0;
    const tt = m.tileAtPx(v.x, v.y);
    if (outAt < 0 && tt === T.ROAD && Math.abs(Math.cos(v.a)) > 0.8 && !contact(m, v)) outAt = w.time;
  }
  assert.equal(inside, 0, 'its body never in the building');
  assert.ok(maxPressed <= 10, `never pushing against the wall for long (${maxPressed} ticks at most)`);
  assert.ok(outAt > 0 && outAt < 8, `back on the road, along it, within 8 s (${outAt.toFixed(1)} s)`);
  assert.ok((w.wallBackouts || 0) >= 1, 'it backed out');
});

test('a panicking driver heading at a building brakes short of the wall', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a street with a building along its pavement');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x + 400, S.r.y + S.r.hw + 120);
  // in the road, heading straight up at the building; its waypoints on beyond it (a waypoint across the block)
  const v = car(w, 'sedan', S.x, S.kerb + 60, -Math.PI / 2);
  traffic.joinTraffic(w, v);
  v.ai.pts = [{ x: S.x + 30, y: S.wallY - 400 }];
  v.ai.panicUntil = w.time + 30;
  v.vx = 0; v.vy = -200;
  let inside = 0, hardest = 0, pressed = 0, maxPressed = 0;
  for (let t = 0; t < 8 * 20; t++) {
    w.step();
    if (!v.ai) break;
    v.ai.panicUntil = w.time + 30;
    v.ai.pts = [{ x: S.x + 30, y: S.wallY - 400 }];
    const ct = contact(m, v);
    if (ct === 'in') inside++;
    if (ct && v.input.throttle > 0.1) { pressed++; maxPressed = Math.max(maxPressed, pressed); } else pressed = 0;
    hardest = Math.max(hardest, v.hardHit && v.hardHitAt === w.time ? v.hardHit : 0);
  }
  assert.equal(inside, 0, 'its body never in the building');
  assert.ok(hardest < 160, `no crash into it (${Math.round(hardest)} px/s)`);
  assert.ok(maxPressed <= 10, `never pushing against it for long (${maxPressed} ticks)`);
});

test('giving way to a siren, a car eases over along the road - no further than a wheel up the kerb, never round to the pavement', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a street with a building along its pavement');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x + 300, S.r.y + S.r.hw + 140);
  // westbound along the street (its kerb is the north side, the buildings' side) from its east end, giving way all along
  const e = S.e, east = e.pts[0].x > e.pts[e.pts.length - 1].x ? e.a : e.b, lp = lanePath(m.net, e, east, 0);
  assert.ok(lp[lp.length - 1].s > 500, 'a long enough street');
  const p0 = pointAt(lp, 30), y0 = p0.y;
  const v = car(w, 'sedan', p0.x, p0.y, Math.PI);
  traffic.joinTraffic(w, v);
  v.vx = -120;
  let worstA = 0, overKerb = 0, touched = 0, offRoad = 0, secs = 0;
  for (let t = 0; t < 12 * 20; t++) {
    v.ai.yieldUntil = w.time + 1.5;
    w.step();
    if (!v.ai) break;
    // (along this street: not into the junction at its end, where it turns)
    const stop = v.ai.pts && v.ai.pts.find((p) => p.stop);
    if (!stop || Math.hypot(stop.x - v.x, stop.y - v.y) < 140 || Math.abs(stop.y - y0) > 40) break;
    secs = t / 20;
    worstA = Math.max(worstA, Math.abs(Math.sin(v.a)));
    // its north (outer) side: how far past the kerb
    const outer = v.y - (Math.abs(Math.cos(v.a)) * v.def.W / 2 + Math.abs(Math.sin(v.a)) * v.def.L / 2);
    overKerb = Math.max(overKerb, S.kerb - outer);
    if (contact(m, v)) touched++;
    if (m.tileAtPx(v.x, v.y) !== T.ROAD) offRoad++;
  }
  assert.ok(secs > 6, `it gave way along the street for a while (${secs.toFixed(1)} s)`);
  assert.ok(worstA < 0.55, `it stays along the road (turned ${Math.round(Math.asin(worstA) * 57.3)} degrees off it at most)`);
  assert.ok(overKerb <= 14, `a wheel up the kerb at most (${Math.round(overKerb)} px over it)`);
  assert.equal(offRoad, 0, 'its middle never off the road');
  assert.equal(touched, 0, 'never near the building');
});

test('stopped behind a street blocked across both lanes, a queue behind it: nobody turns round into the shop fronts', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a street with a building along its pavement');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x, S.r.y + S.r.hw + 150);
  // across both lanes: two vans nobody's driving (the screenshot's two ambulances at a scene), with the building's
  // pavement on the westbound side
  const yW = S.r.y - laneOffset(S.e, 0), yE = S.r.y + laneOffset(S.e, 0);
  for (const y of [yW, yE]) { const b = w.spawnVehicle('van', S.x, y, Math.PI, {}); b.despawnable = false; }
  // westbound traffic queued behind them, along the building
  const cars = [];
  let qx = S.x + 40;
  for (const model of ['sedan', 'boxtruck', 'van', 'garbage', 'taxi']) {
    const v = car(w, model, qx, yW, Math.PI);
    v.x = qx + v.def.L / 2 + 50; qx = v.x + v.def.L / 2;
    w.place(v);
    traffic.joinTraffic(w, v);
    v.vx = -60;
    cars.push(v);
  }
  const pressed = new Map(), worst = new Map();
  let inside = 0;
  for (let t = 0; t < 40 * 20; t++) {
    w.step();
    for (const v of cars) {
      if (!v.ai || v.removed) continue;
      const ct = contact(m, v);
      if (ct === 'in') inside++;
      const p = ct ? (pressed.get(v.id) || 0) + 1 : 0;
      pressed.set(v.id, p); worst.set(v.id, Math.max(worst.get(v.id) || 0, p));
    }
  }
  const longest = Math.max(0, ...worst.values());
  assert.equal(inside, 0, 'no body ever in a building');
  assert.ok(longest <= 40, `nobody against a building for more than 2 s (${(longest / 20).toFixed(1)} s)`);
  assert.ok((w.turnsHeld || 0) > 0, 'they waited their turn instead');
});

// (World v3, Midtown station: a pickup turning the corner by the station's bike rack had a bike parked there in its
// look-ahead box - straight ahead of it, so over the kerb on the bend - and stopped in the bend for good, the queues
// behind it both ways locking the corner; test/calmstreets.test.js)
test('a bike parked on the pavement beside a car\'s way never stops it; one standing in the road does', () => {
  const w = makeWorld(), m = w.map;
  // a straight kerb: a run of road with the pavement along its north side
  let spot = null;
  for (let ty = m.y0 + 2; ty < m.y0 + m.h - 4 && !spot; ty++) for (let tx = m.x0 + 2; tx < m.x0 + m.w - 16; tx++) {
    let ok = true;
    for (let k = 0; k < 12 && ok; k++) ok = m.tileAt(tx + k, ty - 1) === T.SIDEWALK && m.tileAt(tx + k, ty) === T.ROAD && m.tileAt(tx + k, ty + 1) === T.ROAD;
    if (ok) { spot = { x: (tx + 3) * TILE, kerb: ty * TILE }; break; }
  }
  assert.ok(spot, 'a kerb');
  const pick = car(w, 'pickup', spot.x, spot.kerb + 19, 0);
  // the bike: wholly on the pavement, 28 px across from the pickup's middle (inside its look-ahead box)
  const bike = w.spawnVehicle('cruiser', spot.x + 150, spot.kerb - 9, 0, {});
  assert.equal(m.tileAtPx(bike.x, bike.y + bike.def.W / 2), T.SIDEWALK);
  traffic.driveToward(w, pick, spot.x + 400, pick.y, 200);
  assert.equal(pick._blk, 0, 'the bike on the pavement is not in its way');
  // the same bike out in the road, just off the kerb: it is
  bike.y = spot.kerb + 10; w.place(bike);
  traffic.driveToward(w, pick, spot.x + 400, pick.y, 200);
  assert.equal(pick._blk, bike.id, 'a bike standing in the road is');
});

// (World v3, Midtown station: a car out of the bend nose to nose with a tanker coming up the other lane, a car close
// behind each - neither with room to back off, the corner locked for minutes; test/calmstreets.test.js)
test('two cars nose to nose with a car close behind each: one of those behind backs off to make room', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a straight street');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x + 300, S.r.y + S.r.hw + 150);
  const y = S.r.y + laneOffset(S.e, 0), x0 = S.x + 300;
  const mk = (model, x, a) => { const v = car(w, model, x, y, a); v.despawnable = false; traffic.joinTraffic(w, v); return v; };
  // A heads west in the eastbound lane, B east in it: nose to nose; A2 and B2 close behind them
  const A = mk('sedan', x0 + 70, Math.PI), B = mk('sedan', x0 - 70, 0);
  const A2 = mk('sedan', A.x + A.def.L + 16, Math.PI), B2 = mk('sedan', B.x - B.def.L - 16, 0);
  const a2x = A2.x, b2x = B2.x;
  A.ai.sideN = B.ai.sideN = 2; A.ai.sideAt = B.ai.sideAt = 1e9;   // (A's edging back into its lane tried twice already: sidestep - the next test)
  let backed = false;
  for (let t = 0; t < 20 * 20 && !backed; t++) {
    w.step();
    backed = (w.ringRoomMade || 0) > 0 && (A2.x > a2x + 10 || B2.x < b2x - 10);
  }
  assert.ok(backed, `one of the cars behind backed off (A2 ${(A2.x - a2x).toFixed(0)} px, B2 ${(b2x - B2.x).toFixed(0)} px)`);
});

// (World v3, by Midtown station: a car come round into the other lane, nose to nose with one in its own lane there,
// a car close behind each - backing off and coming on again only met it again, for minutes)
test('nose to nose with a car in the other lane: the one out of its lane edges back into it and they pass', () => {
  const w = makeWorld(), m = w.map;
  const S = streetByBuilding(m);
  assert.ok(S, 'a straight street');
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, S.x + 300, S.r.y + S.r.hw + 150);
  const yE = S.r.y + laneOffset(S.e, 0), yW = S.r.y - laneOffset(S.e, 0), x0 = S.x + 300;
  const mk = (model, x, y, a) => { const v = car(w, model, x, y, a); v.despawnable = false; traffic.joinTraffic(w, v); return v; };
  const A = mk('sedan', x0 + 70, yE, Math.PI), B = mk('sedan', x0 - 70, yE, 0);
  mk('sedan', A.x + A.def.L + 16, yE, Math.PI); mk('sedan', B.x - B.def.L - 16, yE, 0);
  let passed = false;
  for (let t = 0; t < 30 * 20 && !passed; t++) { w.step(); passed = A.x < B.x - 60; }
  assert.ok((w.sidesteps || 0) > 0, 'the one out of its lane edged over');
  assert.ok(passed, `they got past each other (A ${Math.round(A.x - x0)}, B ${Math.round(B.x - x0)})`);
  assert.ok(Math.abs(A.y - yW) < Math.abs(A.y - yE), 'A in its own lane');
});

// (World v3, by Midtown station: a long lorry and a car coming round a tight bend the two ways at once locked it)
test('a tight bend on a street with a lane each way: a long vehicle and a car the other way both get round it', () => {
  const w = makeWorld(), m = w.map, net = m.net;
  let pick = null;
  for (const e of net.edges) {
    if (e.lvl !== 0 || e.pts.length !== 3 || e.oneway || (e.nl || 1) > 1 || e.kind === 'alley') continue;
    const [a, b, c] = e.pts;
    let turn = Math.abs(Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn < 0.9 || Math.hypot(b.x - a.x, b.y - a.y) < 300 || Math.hypot(c.x - b.x, c.y - b.y) < 300) continue;
    if (!pick || turn > pick.turn) pick = { e, turn };
  }
  assert.ok(pick, 'a street with a sharp one-point corner');
  const { e } = pick;
  const { p: pl } = joinPlayer(w);
  teleport(w, pl.ped, e.pts[1].x + 200, e.pts[1].y + 200);
  const go = (model, from) => {
    const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s, sc = project(lp, e.pts[1]).s, q = pointAt(lp, Math.max(0, sc - 300));
    const v = car(w, model, q.x, q.y, Math.atan2(q.ty, q.tx)); v.despawnable = false;
    traffic.joinTraffic(w, v);
    v.vx = q.tx * 100; v.vy = q.ty * 100;
    return { v, end: lp[lp.length - 1], L };
  };
  const T1 = go('tanker', e.a), C1 = go('sedan', e.b);
  assert.ok(T1.v.ai && T1.v.ai.edge === e.id && C1.v.ai && C1.v.ai.edge === e.id, 'both in traffic on it');
  let claimed = false;
  const near = (o) => Math.hypot(o.v.x - o.end.x, o.v.y - o.end.y) < 60;
  let tDone = false, cDone = false;
  for (let t = 0; t < 45 * 20 && !(tDone && cDone); t++) {
    w.step();
    claimed ||= !!(w.bends && w.bends.size);
    tDone ||= !T1.v.ai || T1.v.ai.edge !== e.id || near(T1); cDone ||= !C1.v.ai || C1.v.ai.edge !== e.id || near(C1);
  }
  assert.ok(claimed, 'the long one claimed the bend');
  assert.ok(tDone && cDone, `both got round (tanker ${tDone}, car ${cDone})`);
});

// (World v3, by Midtown station: a flatbed parked in the last bay before the junction stuck out into the street across)
test('a kerb bay\'s room: as far as the kerb runs beside it - a bay at the street\'s end takes a car, not a flatbed', () => {
  // a wide road (x < 288) running north into a street across it (y < 0); the pavement east of the road, south of the street
  const m = { tileAtPx: (x, y) => (y < 0 && y > -128) || (x >= 0 && x < 288) ? T.ROAD : T.SIDEWALK };
  const end = traffic.bayRoom(m, { x: 272, y: 45, a: -Math.PI / 2, kerb: true }, 0);
  assert.ok(end >= VEHICLES.sedan.L && end < VEHICLES.van.L && end < VEHICLES.flatbed.L, `the last bay: room for ${end} px - a sedan, not a van or a flatbed`);
  assert.equal(traffic.bayRoom(m, { x: 272, y: 600, a: -Math.PI / 2, kerb: true }, 1), Infinity, 'one along the kerb: any');
  assert.equal(traffic.bayRoom(m, { x: 400, y: 600, a: 0 }, 2), Infinity, 'one off the road: any');
});
