// World v3's arrival lines (shared/world3-arrivals.js; the owner, 11-06: "multiple stations to choose from ... on their own
// track and it comes out of a tunnel and then goes to the station then leaves station and goes into another tunnel"):
// one line for each region new players pick from - the city's by hand beside Greenfield Park (the owner, 11-06 22:49:
// shared/world3-firstcars.js parkWest3), the others beside a main-line station - each a straight run between two bores
// (the portal facing the platform, the far end blind), on its own - no main-line track near it, no road on or across it -
// with a platform you can walk off to the street, and a used lot and a steal alley a short walk away (the first car:
// server/systems/firstcar.js). The park block's places at the ends of the lists, seen from the camera, no traffic into
// it. Then the arrival on one: the page's train on its line, the newcomer out of everyone else's sight until the doors
// open; each path's first step at each station; fifty new players at the park at once. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE, K } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/mapcore.js';
import { ARRIVAL_PICKS, ARRIVAL } from '../shared/world3-arrivals.js';
import { World } from '../server/world.js';
import * as starter from '../server/systems/starter.js';
import * as firstcar from '../server/systems/firstcar.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import { PARK_WEST } from '../shared/world3-firstcars.js';
import * as ftue from '../server/systems/ftue.js';
import * as net from '../server/net.js';
import { FTUE } from '../shared/rules.js';
import { joinPlayer, run, teleport } from './helpers.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });
const segDist = (x, y, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)); return Math.hypot(a.x + dx * t - x, a.y + dy * t - y); };

test('World v3: an arrival line for each region - the city\'s by Greenfield Park, the others beside a main-line station - on its own track between two tunnels', () => {
  const A = M.arrivals;
  assert.ok(Array.isArray(A) && A.length === ARRIVAL_PICKS.length, `a line for each region (${A && A.map((a) => a.key)})`);
  assert.deepEqual(A.map((a) => a.key), ARRIVAL_PICKS.map((p) => p.key));
  const city = A.find((a) => a.key === 'city'), cp = M.pois[city.poi];
  assert.equal(cp.label, 'Greenfield Park Station'); assert.equal(cp.kind, 'delivery', 'its stop: no timetable, no menu');
  const park = M.places ? null : null; void park;
  const pwt = M.buildings.find((b) => b.name === 'Park West Tower');
  assert.ok(cp.x > (pwt.tx + pwt.tw) * TILE && cp.x - (pwt.tx + pwt.tw) * TILE < 50 * TILE && cp.y > pwt.ty * TILE && cp.y < (pwt.ty + pwt.th + 10) * TILE, 'across Park West Avenue from Park West Tower');
  assert.ok(Math.abs(city.a) > 3, 'the train runs west: its platform on the lane\'s (north) side');
  for (const a of A) {
    const poi = M.pois[a.poi], st = a.stations[0], P = a.pts;
    if (a.key !== 'city') { assert.equal(poi.kind, 'station'); assert.ok(!poi.sub, `${a.name}: a main-line station`); }
    assert.ok(Math.hypot(st.platform.x - poi.x, st.platform.y - poi.y) <= ARRIVAL.reach + 120, `${a.name}: its platform near the station`);
    // straight, along a grid axis, every 8 px, the ends inside the hills
    const ca = Math.cos(a.a), sa = Math.sin(a.a);
    assert.ok(Math.abs(ca) < 1e-9 || Math.abs(sa) < 1e-9, `${a.name}: along x or y`);
    P.forEach((p, i) => { assert.ok(Math.abs(p.s - i * 8) < 1e-6); assert.ok(Math.abs(p.x - (P[0].x + ca * p.s)) < 1e-6 && Math.abs(p.y - (P[0].y + sa * p.s)) < 1e-6); });
    assert.ok(P[0].under && P[P.length - 1].under && P.slice(1, -1).every((p) => !p.under));
    // the platform on the right of the way the train runs, a train long, paved, in the open between the portals
    assert.equal(st.side, 1); assert.ok(st.arrival);
    const [pin, pout] = a.portals;
    assert.ok(pin.s < st.s - st.half && pout.s > st.s + st.half, `${a.name}: the platform between the portals`);
    for (let u = -st.half + 16; u < st.half - 16; u += 32) {
      const x = P[0].x + ca * (st.s + u) - sa * 80, y = P[0].y + sa * (st.s + u) + ca * 80;
      assert.equal(M.tileAtPx(x, y), T.PLAZA, `${a.name}: the platform paved at ${u}`);
    }
    // two bores: the hill over each end (cover), the portal facing the platform, the far end blind and walled
    assert.equal(a.tunnels.length, 2);
    a.tunnels.forEach((id, j) => {
      const t = M.tunnels[id];
      assert.ok(t && t.kind === 'rail' && t.arrival, `${a.name}: bore ${j}`);
      const open = t.mouths.filter((mo) => !mo.blind), blind = t.mouths.filter((mo) => mo.blind);
      assert.equal(open.length, 1); assert.equal(blind.length, 1);
      const port = j ? pout : pin;
      assert.ok(Math.hypot(open[0].x - port.x, open[0].y - port.y) < 1, `${a.name}: the portal at the open stretch's end`);
      const s = j ? (pout.s + a.len) / 2 : pin.s / 2, x = P[0].x + ca * s, y = P[0].y + sa * s;
      assert.equal(M.cover[M.idx(Math.floor(x / TILE), Math.floor(y / TILE))], id + 1, `${a.name}: the hill over bore ${j}`);
      const e = j ? a.len - 12 : 12, ex = P[0].x + ca * e, ey = P[0].y + sa * e;
      assert.equal(M.tileAtPx(ex, ey), T.WALL, `${a.name}: rock across the far end of bore ${j}`);
    });
  }
});

test('World v3: the arrival lines cross and join nothing - no main-line track near, no road on them or across them, apart from each other', () => {
  const main = (M.rails || []).filter((r) => !r.subway);
  for (const a of M.arrivals) {
    const P = a.pts;
    for (const r of main) for (let i = 0; i < r.pts.length; i += 2) {
      const q = r.pts[i];
      if (q.under) continue;
      if (Math.abs(q.x - P[0].x) > a.len + 400 && Math.abs(q.x - P[P.length - 1].x) > a.len + 400) continue;
      assert.ok(segDist(q.x, q.y, P[0], P[P.length - 1]) > 4 * TILE, `${a.name}: the main line (${r.name}) stays clear`);
    }
    // no road tile on the track bed or the platform; no road edge across or along the line
    for (const p of P) for (const o of [-48, -24, 0, 24, 48, 72, 96]) {
      const x = p.x - Math.sin(a.a) * o, y = p.y + Math.cos(a.a) * o, t = M.tileAtPx(x, y);
      assert.ok(t !== T.ROAD && t !== T.BRIDGE, `${a.name}: no road at ${Math.round(x)},${Math.round(y)}`);
    }
    for (const e of M.edges) {
      if (!e || e.lvl) continue;
      for (let k = 1; k < e.pts.length; k++) {
        const u = e.pts[k - 1], v = e.pts[k];
        if (Math.max(u.x, v.x) < Math.min(P[0].x, P[P.length - 1].x) - 200 || Math.min(u.x, v.x) > Math.max(P[0].x, P[P.length - 1].x) + 200) continue;
        for (let f = 0; f <= 8; f++) { const x = u.x + (v.x - u.x) * f / 8, y = u.y + (v.y - u.y) * f / 8; assert.ok(segDist(x, y, P[0], P[P.length - 1]) > (e.hw || 32) + 40, `${a.name}: road edge ${e.id} clear of the line`); }
      }
    }
    for (const b of M.arrivals) if (b !== a) assert.ok(Math.hypot(b.stations[0].x - a.stations[0].x, b.stations[0].y - a.stations[0].y) > 3000, `${a.name} and ${b.name} apart`);
  }
});

test('World v3: off each arrival platform on foot - to the street, and on to its used lot and its alley, a short walk', () => {
  const W = M.w;
  for (const a of M.arrivals) {
    const w = { map: M, players: new Map() }, spot = ftue.arrivalSpot(w, a);
    const P = firstcar.placesFor(w, a.poi);
    assert.ok(P.lot && M.pois[P.lot.poi].kind === 'usedlot' && M.pois[P.lot.poi].stn === a.poi, `${a.name}: its own used lot`);
    assert.ok(M.stealAlleys.some((q) => q.stn === a.poi && q.name === P.alley.name), `${a.name}: its own alley`);
    const goals = [P.lot, ...P.alley.spots].map((q) => M.idx(Math.floor(q.x / TILE), Math.floor(q.y / TILE)));
    const goal = new Set([goals[0]]), alley = new Set(goals.slice(1));
    let al = -1;
    const s0 = M.idx(Math.floor(spot.x / TILE), Math.floor(spot.y / TILE));
    assert.ok(!PED_BLOCK[M.tiles[s0]], `${a.name}: you step off onto something you can stand on`);
    // breadth first over what people can walk on, the track's bed left out (the way off is the platform's back)
    const bed = new Set();
    for (const p of a.pts) for (const o of [-32, 0, 32]) bed.add(M.idx(Math.floor((p.x - Math.sin(a.a) * o) / TILE), Math.floor((p.y + Math.cos(a.a) * o) / TILE)));
    const seen = new Map([[s0, 0]]), q = [s0];
    let street = -1, lot = -1;
    while (q.length && (street < 0 || lot < 0 || al < 0) && seen.size < 400000) {
      const i = q.shift(), d = seen.get(i), t = M.tiles[i];
      if (street < 0 && (t === T.SIDEWALK || t === T.ROAD || t === T.LOT)) street = d;
      if (lot < 0 && goal.has(i)) lot = d;
      if (al < 0 && alley.has(i)) al = d;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = M.idx(x + dx, y + dy);
        if (seen.has(j) || bed.has(j) || PED_BLOCK[M.tiles[j]]) continue;
        seen.set(j, d + 1); q.push(j);
      }
    }
    assert.ok(street >= 0 && street <= ARRIVAL.exitMax + 6, `${a.name}: the street ${street} tiles off the platform`);
    assert.ok(lot >= 0 && lot < 110, `${a.name}: the used lot ${lot} tiles' walk away`);
    assert.ok(al >= 0 && al < 110, `${a.name}: the alley ${al} tiles' walk away`);
    console.log(`# ${a.name}: the street ${street}, ${P.lot.name} ${lot}, ${P.alley.name} ${al} tiles' walk off the platform`);
  }
});

// ---- the park block (shared/world3-firstcars.js parkWest3) -----------------------------------------------------------
// What's drawn over a point from the camera: the 3/4 view draws a thing of height h standing at ground y from y - h up to
// y on the screen, the things further south over the ones behind - so a thing south of the point (in front) whose top
// reaches above it hides it. Buildings (their floors), the tall props (trees, masts), the tunnels' hills, the arrival
// platforms' canopies. -> [what]
const PROP_H = { tree_a: 170, tree_b: 170, palm_a: 200, redwood: 420, ymast: 150, bleachers: 60, gazebo: 80, foodcart: 40 };
function over(x, y, z0, half = 40) {
  const out = [];
  for (const b of M.buildings) {
    if (!b || b.gone || (b.tx + b.tw) * TILE < x - half || b.tx * TILE > x + half) continue;
    const ys = (b.ty + b.th) * TILE, h = ((b.art && b.art.spec && b.art.spec.floors) || b.floors || 1) * 56 + 24;
    if (ys > y + 2 && b.ty * TILE - h < y - 4) out.push(`building ${b.name || b.id}`);
  }
  for (const p of M.props) {
    const h = PROP_H[p.t] ? PROP_H[p.t] * (p.k || 1) : 0;
    if (!h || p.y <= y + 2 || Math.abs(p.x - x) > half + 40) continue;
    if (p.y - h < y - 4) out.push(`${p.t} at ${Math.round(p.x / TILE)},${Math.round(p.y / TILE)}`);
  }
  for (let ty = Math.floor(y / TILE) + 1; ty < Math.floor(y / TILE) + 6; ty++) for (let tx = Math.floor((x - half) / TILE); tx <= Math.floor((x + half) / TILE); tx++) if (M.cover && M.cover[M.idx(tx, ty)] && ty * TILE - 80 < y - 4) out.push(`a hill at ${tx},${ty}`);
  for (const a of M.arrivals) for (const st of a.stations) for (const f of [-0.42, 0.42]) {
    const L = st.half, cl = L * 0.7, u = st.s + f * L, q = { x: a.pts[0].x + Math.cos(a.a) * u, y: a.pts[0].y + Math.sin(a.a) * u }, cx = q.x - Math.sin(a.a) * 80, cy = q.y + Math.cos(a.a) * 80;
    if (Math.abs(cx - x) > cl / 2 + half || cy + 20 <= y + 2) continue;
    if (cy - 20 - 62 < y - 4) out.push(`the canopy of ${a.name}`);
  }
  return out;
}
test('World v3: the park block - the station\'s board, Park West Motors and its alley in plain sight; the shops; no traffic into it; its places last', () => {
  const city = M.arrivals.find((a) => a.key === 'city'), st = city.stations[0], w = { map: M, players: new Map() };
  const P = firstcar.placesFor(w, city.poi), lot = M.pois[P.lot.poi];
  assert.equal(lot.label, 'Park West Motors');
  assert.ok(M.dealerLots.some((d) => d.poi === lot.id && d.used && d.slots.length >= 6), 'beaters on display');
  // the station's name board: drawn at the platform's middle, 50 px toward it (client/art2/game/statics.js addRailLoop),
  // only on a line along x - nothing in front of it from the camera, nor of where you step off
  assert.ok(Math.abs(Math.cos(st.a)) > 0.6, 'a line along x: the board is drawn');
  const bx = st.x - Math.sin(st.a) * 50, by = st.y + Math.cos(st.a) * 50;
  assert.deepEqual(over(bx, by, 70, 80), [], 'the board');
  const spot = ftue.arrivalSpot(w, city);
  assert.deepEqual(over(spot.x, spot.y, 50, 6), [], 'where you step off (between the two canopies)');
  // the lot: its office's front and every display space; the alley's spaces
  const office = M.buildings[lot.b];
  assert.deepEqual(over((office.tx + office.tw / 2) * TILE, (office.ty + office.th) * TILE - 4, 60, office.tw * TILE / 2), [], 'the lot\'s office');
  for (const sp of M.dealerLots.find((d) => d.poi === lot.id).slots) assert.deepEqual(over(sp.x, sp.y, 40, 30), [], `the lot's space at ${sp.x},${sp.y}`);
  for (const sp of P.alley.spots) assert.deepEqual(over(sp.x, sp.y, 40, 30), [], `the alley's space at ${sp.x},${sp.y}`);
  // the shops facing the lane
  for (const name of ['Lane Mart', 'Park West Coffee', 'Greenfield Flowers']) {
    const q = M.pois.find((o) => o.label === name);
    assert.ok(q && M.buildings[q.b] && M.buildings[q.b].art.shop.sign, `${name}: its shopfront`);
    assert.deepEqual(over(q.x, q.y - 24, 60, 60), [], `${name}'s front`);
  }
  // no road in it - the lane and the alley are paving, so no traffic routes in - and no road edge into it
  const [X0, X1] = [PARK_WEST.x0, PARK_WEST.x1], Y0 = PARK_WEST.lot[1], Y1 = PARK_WEST.walk;
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) assert.notEqual(M.tiles[M.idx(x, y)], T.ROAD, `no road at ${x},${y}`);
  for (const e of M.edges) if (e && e.pts) for (const q of e.pts) assert.ok(!(q.x >= X0 * TILE && q.x <= (X1 + 1) * TILE && q.y >= Y0 * TILE && q.y <= (Y1 + 1) * TILE), `road edge ${e.id} into the block`);
  // its buildings and places at the ends of the lists: nothing before them renumbered
  const first = Math.min(city.poi, ...M.pois.filter((q) => q.kind === 'usedlot').map((q) => q.id));
  const ours = new Set(['Greenfield Park Station', 'Lane Mart', 'Park West Coffee', 'Greenfield Flowers']);
  for (const q of M.pois.slice(first)) assert.ok(q.kind === 'usedlot' || ours.has(q.label), `${q.kind} ${q.label} (${q.id}) is the block's or a used lot's`);
  assert.ok(M.buildings.slice(office.id).every((b) => b.whole && (b.business === 'usedlot' || ['Lane Mart', 'Park West Coffee', 'Greenfield Flowers'].includes(b.name))), 'the block\'s buildings last');
});

test('World v3: the arrival on a line - the page\'s train, the newcomer unseen by others until the doors open', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const coast = M.arrivals.find((a) => a.key === 'coast');
  const j = joinPlayer(w);
  j.prof.lookPicked = true;
  run(w, 0.6);
  assert.equal(j.prof.ftue.st, 'pick');
  const card = j.conn.sent.find((m) => m.t === 'ftue' && m.a === 'pick');
  assert.deepEqual(card.opts.map((o) => o.id), M.arrivals.map((a) => a.poi), 'the card: the arrival lines\' stations');
  assert.equal(card.opts.find((o) => o.def).id, M.arrivals.find((a) => a.key === FTUE.arriveDefault).poi, 'the default: the city');
  assert.ok(card.opts.every((o) => o.region && o.vibe));
  ftue.handle(w, j.p, { a: 'pick', stn: coast.poi });
  const arr = j.conn.sent.find((m) => m.t === 'ftue' && m.a === 'arrive');
  assert.ok(arr.line && arr.line.len === coast.len && arr.line.in === coast.portals[0].s && arr.line.out === coast.portals[1].s, 'the line for the page\'s train');
  assert.ok(arr.stop < arr.door && arr.door < arr.leave && arr.s <= 14, 'in, the doors, out - 14 s at most');
  const spot = ftue.arrivalSpot(w, coast);
  assert.ok(Math.hypot(j.p.ped.x - spot.x, j.p.ped.y - spot.y) < 1, 'on the platform at the doors');
  assert.equal(starter.carOf(w, j.prof.pid), null, 'no starter car: the first car is earned');
  // someone on the platform already: the newcomer appears as the doors open
  const o = joinPlayer(w, { ftue: { st: 'done', m: {}, tips: 0 } });
  teleport(w, o.p.ped, spot.x + 120, spot.y);
  net.send(w);
  assert.ok(j.p.ped.ftueHid && !o.p.known.has(j.p.ped.id), 'not seen while the train pulls in');
  assert.ok(j.p.known.has(j.p.ped.id), 'yourself, yes');
  run(w, FTUE.doorS + 0.6);
  net.send(w);
  assert.ok(!j.p.ped.ftueHid && o.p.known.has(j.p.ped.id), 'seen once the doors open');
  // no server train on it: the arrival lines are none of the main line's loops, which the trains run
  assert.ok(M.rails.every((r) => !M.arrivals.some((a) => a.pts === r.pts) && !(r.stations || []).some((st) => st.arrival)), 'not a loop the trains run');
  for (const e of w.entities.values()) if (e.kind === K.TRAIN) assert.ok(segDist(e.x, e.y, coast.pts[0], coast.pts[coast.pts.length - 1]) > 4 * TILE, 'no train on the line');
});

// ---- the first car at each station, on the real world (server/systems/firstcar.js) -------------------------------------
function toQuestion(w, stn) {
  const j = joinPlayer(w);
  j.prof.lookPicked = true;
  run(w, 0.6);
  ftue.handle(w, j.p, { a: 'pick', stn });
  ftue.handle(w, j.p, { a: 'arrived' });
  return j;
}
const answer = (w, p, a) => economy.handleMenu(w, p, ftue.ASK_POI, a);
function buy(w, p, poiId, model) { const poi = M.pois[poiId]; teleport(w, p.ped, poi.x, poi.y); p.toasts.length = 0; economy.handleMenu(w, p, poiId, `ub:${model}`); return p.toasts.map((t) => t.text).join(' | '); }
function steal(w, p) { const v = firstcar.markOf(w, p); assert.ok(v, 'a car left in the alley'); teleport(w, p.ped, v.x, v.y + v.def.W / 2 + 8); vehicles.tryEnter(w, p.ped); return v; }
test('World v3: each path\'s first step at each of the four stations - buy, steal, the pickup, roam', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  for (const a of M.arrivals) {
    const P = firstcar.placesFor(w, a.poi);
    const { p: b } = toQuestion(w, a.poi);
    assert.equal(b.profile.ftue.stn, a.poi);
    answer(w, b, 'work');
    assert.equal(b.profile.ftue.car.poi, P.lot.poi, `${a.name}: work, step 1 its used lot`);
    const [m0] = firstcar.stockOf(M.pois[P.lot.poi])[0];
    assert.match(buy(w, b, P.lot.poi, m0), /You bought a Rusty/, `${a.name}: bought`);
    run(w, 0.6); assert.equal(b.profile.ftue.step, 2);
    const { p: s } = toQuestion(w, a.poi);
    answer(w, s, 'hustle');
    const v = steal(w, s);
    assert.equal(s.ped.vehId, v.id, `${a.name}: stolen`); assert.equal(s.wanted, 0, 'nobody called it in');
    assert.ok(P.alley.spots.some((sp) => Math.hypot(sp.x - v.x, sp.y - v.y) < 1), `${a.name}: it was in its alley`);
    run(w, 0.6); assert.equal(s.profile.ftue.step, 2);
    const { p: o } = toQuestion(w, a.poi);
    answer(w, o, 'outdoors');
    if (o.profile.ftue.st === 'goal' && firstcar.stockOf(M.pois[P.lot.poi]).some(([id]) => id === 'rustpickup')) {
      assert.match(buy(w, o, P.lot.poi, 'rustpickup'), /You bought a Rusty Pickup/, `${a.name}: the pickup`);
      run(w, 0.6); assert.equal(o.profile.ftue.step, 2);
    }
    const { p: r, conn } = toQuestion(w, a.poi);
    answer(w, r, 'roam');
    assert.ok(conn.sent.some((m) => m && m.t === 'ftue' && m.a === 'mark' && m.label === P.lot.name), `${a.name}: roam, the lot on the map`);
  }
});
test('World v3: fifty new players at the park station inside a minute - each a car by their path, no two on one space', () => {
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const city = M.arrivals.find((a) => a.key === 'city'), P = firstcar.placesFor(w, city.poi), cars = [];
  for (let i = 0; i < 50; i++) {
    const { p } = toQuestion(w, city.poi);
    if (i % 2) { answer(w, p, 'hustle'); const v = steal(w, p); assert.equal(p.ped.vehId, v.id); vehicles.ejectPed(w, p.ped, true); cars.push(v); }
    else { answer(w, p, 'work'); assert.match(buy(w, p, P.lot.poi, i % 4 ? 'starter' : 'rustpickup'), /You bought/); cars.push(w.get(p.activeVehicle)); }
    run(w, 0.6);
  }
  assert.equal(new Set(cars.map((v) => v.id)).size, 50);
  assert.ok(cars.every((v) => !v.removed), 'none taken away by the next');
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) assert.ok(Math.hypot(cars[i].x - cars[j].x, cars[i].y - cars[j].y) >= 40, `cars ${i} and ${j} on one space`);
  const st = M.pois[city.poi];
  console.log(`# Greenfield Park: 50 cars, the furthest ${Math.round(Math.max(...cars.map((v) => Math.hypot(v.x - st.x, v.y - st.y))) / TILE)} tiles from the station`);
});
