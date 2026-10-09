// Public transport (the user's notes, 2026-10-08): the bus lines you can ride and the taxis you hail or call. Everything
// here is worked out on the server from the map; the client is told what it needs to show (the Transit phone app, the
// lines on the map, the ride on the HUD).
//
// Both drive with the NPC traffic driver (traffic.js) on a route: a list of steps (an edge and the end it's entered
// from) that it follows instead of picking turns, with the places it pulls up at (halts) on them - a bus's stops, a
// taxi's pick-up and drop-off. traffic.js asks here how fast it may go (haltCap), tells it when it reaches a halt
// (haltAt), and asks it back onto its route when it's lost its way (rejoin).
//
// Buses: lines worked out from the city's bus shelters (map props 'busstop'). The shelters of each town zone are put
// in a loop - the nearest one next, the loop straightened out - and the road between them found on the street network
// (the ground level, through streets only, one-way streets one way): each line is a loop of steps (an edge and the
// end it is entered from) with its stops on them, at the kerb on the bus's side of the road. Each line runs a bus or
// three, spread round it; a bus keeps to the kerb lane, pulls up at every stop for BUS_DWELL_S and goes on (the NPC
// traffic driver, traffic.js, takes its turns from the line and its speed cap from here). Standing at a stop while a bus
// waits there, interact boards it, free (a passenger seat; the camera rides along). Get off with the vehicle key
// while it waits at a stop (on the move you bail out, as from any vehicle). A bus that is taken or wrecked leaves its
// line; a new one comes into service a minute later, out of sight.
import { K } from '../../shared/constants.js';
import { lanePath, exitsFrom, nearestEdge } from '../../shared/roads.js';
import { project, pointAt } from '../../shared/geom.js';
import { BUS_DWELL_S, TAXI_FLAG, TAXI_PER_KM, TAXI_WAIT_S, TAXI_REFUSE_STARS } from '../../shared/rules.js';
import { PAINTS } from '../../shared/vehicles.js';
import { spawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import { payFrom } from './economy.js';
import { ejectPed } from './vehicles.js';
import * as traffic from './traffic.js';
import { isBlocked } from './reroute.js';

export const BUS_ROADS = new Set(['ave', 'art', 'blvd', 'st', 'front', 'minor', 'drive']);
// line names and liveries (PAINTS index) by the zone they serve (shared/citylayout.js Z)
const ZONE_LINE = {
  1: ['Metro Loop', 0], 2: ['Southside Line', 5], 7: ['Westport Line', 1], 8: ['Northshore Line', 6], 9: ['Cedar Isle Line', 9],
  3: ['East Line', 7], 5: ['Key Line', 4], 10: ['Gull Line', 12],
};
const MAX_STOPS = 9, MIN_STOPS = 3;
const BUS_SPEED = 170;      // px/s a bus averages round its loop, lights and corners included (the arrival times)
const STOP_REACH = 120;     // stand this near a stop's shelter for its prompt
const STOP_IN = 230;        // a stop is at least this far along its kerb lane (a bus's length and its turn in, done)
const DOOR_REACH = 90;      // board from this near the bus's side

// ---- the lines -----------------------------------------------------------------------------------------------------
// A stop on the street network: the shelter's prop, the edge it stands beside, the end the bus enters that edge from
// (so the stop is at its kerb), and how far along the kerb lane it is (s).
function stopOf(net, p, pi) {
  const ne = nearestEdge(net, p.x, p.y, (e) => e.lvl === 0 && BUS_ROADS.has(e.kind));
  if (!ne || ne.d > ne.e.hw + 90) return null;   // (on the pavement beside it)
  const e = ne.e, t = pointAt(e.pts, ne.s);
  const right = t.tx * (p.y - ne.y) - t.ty * (p.x - ne.x) > 0;   // (screen y down: the right of a→b, where its kerb lane runs)
  if (e.oneway && !right) return null;
  const from = right ? e.a : e.b;
  const lp = lanePath(net, e, from, 0), pr = project(lp, p);
  if (!pr) return null;
  // the bus pulls up straight, clear of the junction behind it: a shelter by the corner gets its stop a little on
  const s = Math.max(pr.s, STOP_IN);
  if (s > lp[lp.length - 1].s - 60) return null;
  const q = pointAt(lp, s);
  return { pi, x: Math.round(q.x), y: Math.round(q.y), sx: p.x, sy: p.y, edge: e.id, from, s, name: '' };
}

// The quickest way along the roads (those ok() allows) from A to B ({ edge, from, s }: on the kerb lane, going A's way
// to B's): a list of steps [{ edge, from }] from A's edge to B's, or null. B behind A on the same stretch: the way
// round the block.
const BUS_OK = (e) => e.lvl === 0 && BUS_ROADS.has(e.kind);
const TAXI_OK = (e) => e.kind !== 'alley';
function route(net, A, B, ok = BUS_OK) {
  if (A.edge === B.edge && A.from === B.from && B.s > A.s + 60) return [{ edge: A.edge, from: A.from }];
  const key = (e, f) => e * 2 + (net.edges[e].a === f ? 0 : 1);
  const dist = new Map(), prev = new Map(), open = [];
  const relax = (k, d, pk) => { if (d < (dist.get(k) ?? Infinity)) { dist.set(k, d); prev.set(k, pk); open.push([d, k]); } };
  const e0 = net.edges[A.edge], to0 = e0.a === A.from ? e0.b : e0.a;
  for (const x of exitsFrom(net, net.nodes[to0], A.edge)) if (ok(net.edges[x.edge])) relax(key(x.edge, to0), e0.len - A.s + 30 + Math.abs(x.turn) * 40, -1);
  const goal = key(B.edge, B.from);
  let found = false;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [d, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (d > dist.get(k)) continue;
    if (k === goal) { found = true; break; }
    if (d > 160000) break;
    const eid = k >> 1, e = net.edges[eid], from = (k & 1) ? e.b : e.a, to = from === e.a ? e.b : e.a;
    for (const x of exitsFrom(net, net.nodes[to], eid)) if (ok(net.edges[x.edge])) relax(key(x.edge, to), d + e.len + 30 + Math.abs(x.turn) * 40, k);
  }
  if (!found) return null;
  const out = [];
  for (let k = goal; k !== -1; k = prev.get(k)) { const eid = k >> 1, e = net.edges[eid]; out.unshift({ edge: eid, from: (k & 1) ? e.b : e.a }); if (out.length > 4000) return null; }
  out.unshift({ edge: A.edge, from: A.from });
  return out;
}

// A tour through the stops (nearest next, then 2-opt), as a list of indexes into stops
function tour(stops) {
  const n = stops.length, d = (a, b) => Math.hypot(stops[a].x - stops[b].x, stops[a].y - stops[b].y);
  let start = 0;
  for (let i = 1; i < n; i++) if (stops[i].x < stops[start].x) start = i;
  const order = [start], used = new Set([start]);
  while (order.length < n) {
    const last = order[order.length - 1];
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!used.has(i) && d(last, i) < bd) { bd = d(last, i); best = i; }
    order.push(best); used.add(best);
  }
  for (let pass = 0; pass < 6; pass++) {
    let better = false;
    for (let i = 0; i < n - 1; i++) for (let j = i + 2; j < n; j++) {
      if (j + 1 === n && i === 0) continue;
      const a = order[i], b = order[i + 1], c = order[j], e = order[(j + 1) % n];
      if (d(a, c) + d(b, e) < d(a, b) + d(c, e) - 1) { order.splice(i + 1, j - i, ...order.slice(i + 1, j + 1).reverse()); better = true; }
    }
    if (!better) break;
  }
  return order;
}

// Every bus line, worked out once per map: [{ id, name, paint, zone, stops: [stop], steps: [{ edge, from, stops: [k] }], len }]
// (a step's stops in the order the bus comes to them)
export function busLines(world) {
  const m = world.map;
  if (m._busLines) return m._busLines;
  const net = m.net, lines = [];
  Object.defineProperty(m, '_busLines', { value: lines, enumerable: false, configurable: true });
  if (!net) return lines;
  const byZone = new Map();
  m.props.forEach((p, pi) => {
    if (p.t !== 'busstop') return;
    const z = m.zoneAt(p.x, p.y);
    if (!ZONE_LINE[z]) return;
    const st = stopOf(net, p, pi);
    if (!st) return;
    st.name = m.districtAt(p.x, p.y).name;
    if (!byZone.has(z)) byZone.set(z, []);
    byZone.get(z).push(st);
  });
  for (const [z, all] of [...byZone].sort((a, b) => a[0] - b[0])) {
    if (all.length < MIN_STOPS) continue;
    // too many stops for one loop: keep a spread of them (farthest-point picking from the westmost)
    let stops = all;
    if (stops.length > MAX_STOPS) {
      const pick = [stops.reduce((a, b) => (b.x < a.x ? b : a))];
      while (pick.length < MAX_STOPS) {
        let best = null, bd = -1;
        for (const s of stops) { if (pick.includes(s)) continue; let dd = Infinity; for (const q of pick) dd = Math.min(dd, Math.hypot(s.x - q.x, s.y - q.y)); if (dd > bd) { bd = dd; best = s; } }
        pick.push(best);
      }
      stops = pick;
    }
    // the loop: legs between consecutive stops along the streets (a stop that can't be reached is left out)
    let order = tour(stops).map((i) => stops[i]);
    for (let tries = 0; tries < 4 && order.length >= MIN_STOPS; tries++) {
      const legs = [];
      let bad = -1;
      for (let i = 0; i < order.length; i++) { const r = route(net, order[i], order[(i + 1) % order.length]); if (!r) { bad = (i + 1) % order.length; break; } legs.push(r); }
      if (bad >= 0) { order = order.filter((_, i) => i !== bad); continue; }
      // the steps end to end (each leg starts on the step the one before ended on; the last ends where the first began)
      const steps = [];
      for (const leg of legs) leg.forEach((st, j) => { if (j === 0 && steps.length) return; steps.push({ edge: st.edge, from: st.from, stops: [] }); });
      steps.pop();
      if (steps.length < 2) break;
      // each stop on the step its own leg starts from (the last leg one step long: its stop is on the first step, the
      // loop come round)
      let at = 0;
      legs.forEach((leg, i) => { steps[at % steps.length].stops.push(i); at += leg.length - 1; });
      let len = 0;
      for (const st of steps) len += net.edges[st.edge].len;
      const [name, paint] = ZONE_LINE[z];
      // stops named by their district; a district with more than one gets them numbered
      const names = order.map((s) => s.name), seen = new Map();
      names.forEach((n) => seen.set(n, (seen.get(n) || 0) + 1));
      const count = new Map();
      lines.push({
        id: lines.length, name, paint, zone: z, steps, len: Math.round(len),
        stops: order.map((s) => { const n = seen.get(s.name) > 1 ? `${s.name} ${(count.set(s.name, (count.get(s.name) || 0) + 1)).get(s.name)}` : s.name; return { ...s, name: n }; }),
      });
      break;
    }
  }
  return lines;
}

// A line's route as a polyline for the map (every ~120 px along its streets), and the stops' order along it
function linePath(world, L) {
  if (L._path) return L._path;
  const net = world.map.net, out = [];
  let acc = 999;
  for (const st of L.steps) {
    const e = net.edges[st.edge], pts = e.a === st.from ? e.pts : e.pts.slice().reverse();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = out[out.length - 1];
      if (q) acc += Math.hypot(p.x - q[0], p.y - q[1]);
      if (acc >= 120 || i === pts.length - 1) { out.push([Math.round(p.x), Math.round(p.y)]); acc = 0; }
    }
  }
  Object.defineProperty(L, '_path', { value: out, enumerable: false });
  return out;
}

// ---- running the buses ---------------------------------------------------------------------------------------------
const busesFor = (L) => Math.max(1, Math.min(3, Math.round(L.len / 6000)));

// a bus into service on line L at step k (s along it), with a driver
export function spawnBus(world, L, k, s = 60) {
  const net = world.map.net, st = L.steps[k], e = net.edges[st.edge];
  const lp = lanePath(net, e, st.from, 0), sc = Math.min(Math.max(20, s), lp[lp.length - 1].s - 20), p = pointAt(lp, sc);
  if (world.query(p.x, p.y, 120, K.VEH).length) return null;
  const v = world.spawnVehicle('bus', p.x, p.y, Math.atan2(p.ty, p.tx), { despawnable: false, paint: L.paint });
  v.npcOwned = true;
  const d = spawnNpc(world, 'casual', p.x, p.y, 'driver');
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  v.bus = { line: L.id, dwellUntil: 0, atStop: -1, served: -1 };
  v.ai = { kind: 'traffic', lane: 0, route: { line: L.id, i: k, loop: true } };
  traffic.enterRoute(world, v, k, sc + 30);
  return v;
}

// The stops along step i in the order a bus comes to them: [{ s, k }]
export function routeStops(world, v, i) {
  const L = busLines(world)[v.bus ? v.bus.line : -1];
  if (!L) return [];
  return L.steps[i].stops.map((k) => ({ s: L.stops[k].s, k })).sort((a, b) => a.s - b.s);
}

// The next stop a bus comes to (its index in the line), from where it is on its loop
function nextStopIdx(world, v) {
  const L = busLines(world)[v.bus.line], r = v.ai && v.ai.route;
  if (!L || !r) return -1;
  const wp = v.ai.pts && v.ai.pts.find((q) => q.halt !== undefined);
  if (wp) return wp.halt;
  for (let j = 1; j <= L.steps.length; j++) {
    const st = L.steps[(r.i + j) % L.steps.length];
    if (st.stops.length) return routeStops(world, v, (r.i + j) % L.steps.length)[0].k;
  }
  return -1;
}
export function nextStopOf(world, v) {
  const k = nextStopIdx(world, v), L = busLines(world)[v.bus.line];
  return k >= 0 && L ? L.stops[k] : null;
}

// ---- routes (traffic.js asks) --------------------------------------------------------------------------------------
// the steps of a route: a taxi's own, or a bus's line
export function routeSteps(world, r) { return r.steps || busLines(world)[r.line].steps; }
// the halts on step i of a vehicle's route: [{ s, k }] (k: a bus's stop; -1 a taxi's pick-up or drop-off)
export function haltsOn(world, v, i) {
  if (v.bus) return routeStops(world, v, i);
  if (v.taxi && v.ai.route && i === v.ai.route.steps.length - 1) return [{ s: v.taxi.halt.s, k: -1 }];
  return [];
}
// how fast it may go: easing up to the next halt, standing there (a bus's doors open, a taxi waiting), or Infinity
export function haltCap(world, v) {
  if (v.bus && v.bus.dwellUntil > world.time) return 0;
  if (v.taxi && TAXI_STILL.has(v.taxi.st)) return 0;
  const wp = v.ai && v.ai.pts && v.ai.pts.find((q) => q.halt !== undefined);
  if (!wp) return Infinity;
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  return d < 340 ? Math.max(28, (d - 10) * 1.3) : Infinity;
}
// it has come to a halt (reached its waypoint)
export function haltAt(world, v, k) {
  if (v.bus) arriveAt(world, v, k);
  else if (v.taxi) taxiArrived(world, v);
}
// lost its way: back onto its route from the kerb lane of edge e (entered from `from`) at s - true if it could
export function rejoin(world, v, e, from, s) {
  const ai = v.ai;
  if (v.taxi) return taxiRoute(world, v, v.taxi.halt, { edge: e.id, from, s });
  if (v.bus && ai.route.line !== undefined) {
    const steps = routeSteps(world, ai.route), n = steps.length;
    for (let k = 0; k < n; k++) { const q = (ai.route.i + k) % n; if (steps[q].edge === e.id && steps[q].from === from) { traffic.enterRoute(world, v, q, s); return true; } }
    v.despawnable = true;   // (off its line for good: out of service, and another bus comes into service)
  }
  return false;
}

// the bus has come to its stop k: the doors open
function arriveAt(world, v, k) {
  const b = v.bus, L = busLines(world)[b.line];
  if (!L) return;
  b.dwellUntil = world.time + BUS_DWELL_S; b.atStop = k; b.served = k;
  for (let i = 1; i < v.seats.length; i++) {
    const q = v.seats[i] ? world.get(v.seats[i]) : null;
    if (q && q.player) { q.player.meDirty = true; world.notify(q.player, `${L.stops[k].name} - get off here with the vehicle key.`, 'info'); }
  }
}

export function update(world, dt) {
  void dt;
  if (world.tick % 20 !== 7) return;
  updateTaxis(world);
  if (world.opts.transit === false || (!world.npcBudget && !world.opts.transit) || !world.players.size) return;
  const lines = busLines(world), now = world.time;
  world.buses ??= new Map();   // line id -> [vehicle ids]
  world.busNext ??= new Map(); // line id -> when the next bus may come into service
  for (const L of lines) {
    // a bus that left its line (taken, wrecked, its driver gone) is out of service from here
    const ids = (world.buses.get(L.id) || []).filter((id) => { const v = world.get(id); return v && v.bus && v.ai && v.ai.route && !v.wreckAt; });
    world.buses.set(L.id, ids);
    if (ids.length >= busesFor(L) || (world.busNext.get(L.id) || 0) > now) continue;
    // spread round the loop: the step farthest (by order) from the buses already on it, out of everyone's sight
    const at = ids.map((id) => world.get(id).ai.route.i);
    const n = L.steps.length;
    let best = -1, bd = -1;
    for (let k = 0; k < n; k++) {
      const st = L.steps[k], e = world.map.net.edges[st.edge];
      if (e.len < 200) continue;
      const mid = pointAt(e.pts, e.len / 2);
      if (inAnyView(world, mid.x, mid.y, 240)) continue;
      let dd = n;
      for (const a of at) dd = Math.min(dd, (k - a + n) % n, (a - k + n) % n);
      if (dd > bd) { bd = dd; best = k; }
    }
    if (best >= 0) { const v = spawnBus(world, L, best, world.map.net.edges[L.steps[best].edge].len / 2); if (v) ids.push(v.id); }
    world.busNext.set(L.id, now + (ids.length < busesFor(L) && now < 60 ? 1 : 60));
  }
  // the doors close: off it goes
  for (const ids of world.buses.values()) for (const id of ids) {
    const v = world.get(id);
    if (v && v.bus && v.bus.dwellUntil && v.bus.dwellUntil <= now) { v.bus.dwellUntil = 0; v.bus.atStop = -1; for (const s of v.seats) { const q = s ? world.get(s) : null; if (q && q.player) q.player.meDirty = true; } }
  }
}

// ---- arrival times -------------------------------------------------------------------------------------------------
// How long until a bus of line L reaches its stop k (s), counting the stops it calls at on the way: null with no bus out
export function stopEta(world, L, k) {
  const net = world.map.net, n = L.steps.length;
  let stepOf = -1;
  for (let i = 0; i < n && stepOf < 0; i++) if (L.steps[i].stops.includes(k)) stepOf = i;
  let best = null;
  for (const id of (world.buses && world.buses.get(L.id)) || []) {
    const v = world.get(id);
    if (!v || !v.ai || !v.ai.route) continue;
    const r = v.ai.route, e = net.edges[L.steps[r.i].edge];
    if (r.i === stepOf && v.bus.dwellUntil > world.time && v.bus.atStop === k) return 0;
    // what is left of the step it's on (from how far along it is), the steps between, and the stop's own way in
    const lp = lanePath(net, e, L.steps[r.i].from, 0), pr = project(lp, v), left = Math.max(0, lp[lp.length - 1].s - (pr ? pr.s : 0));
    const ahead = r.i === stepOf && pr && pr.s < L.stops[k].s - 10;
    let dist = ahead ? L.stops[k].s - pr.s : left, stops = 0;
    if (!ahead) {
      for (let j = 1; j <= n; j++) {
        const i = (r.i + j) % n;
        if (i === stepOf) { dist += L.stops[k].s; stops += L.steps[i].stops.filter((q) => L.stops[q].s < L.stops[k].s).length; break; }
        dist += net.edges[L.steps[i].edge].len;
        stops += L.steps[i].stops.length;
      }
    }
    const t = dist / BUS_SPEED + stops * (BUS_DWELL_S + 4) + Math.max(0, v.bus.dwellUntil - world.time);
    if (best === null || t < best) best = t;
  }
  return best === null ? null : Math.round(best);
}

// ---- riding -------------------------------------------------------------------------------------------------------
// the bus waiting at a stop a player stands by (within reach of its doors), or null
export function busToBoard(world, ped) {
  if (!world.buses || ped.vehId) return null;
  for (const v of world.query(ped.x, ped.y, 220, K.VEH)) {
    if (!v.bus || !v.ai || !v.ai.route || v.bus.dwellUntil <= world.time || v.wreckAt) continue;
    // how far from the bus's body (along it, clamped to its length; then out to the side)
    const c = Math.cos(v.a), sn = Math.sin(v.a), dx = ped.x - v.x, dy = ped.y - v.y;
    const along = Math.max(-v.def.L / 2, Math.min(v.def.L / 2, dx * c + dy * sn));
    if (Math.hypot(dx - c * along, dy - sn * along) > v.def.W / 2 + DOOR_REACH) continue;
    if (!v.seats.some((s, i) => i > 0 && !s)) continue;
    return v;
  }
  return null;
}
export function boardBus(world, p, v) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead || !v || !v.bus || v.wreckAt) return false;
  const seat = v.seats.findIndex((s, i) => i > 0 && !s);
  if (seat < 0) { world.notify(p, 'The bus is full.', 'warn'); return false; }
  if (ped.carrying) { world.notify(p, 'Put the crate down first - no freight on the bus.', 'warn'); return false; }
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat; ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  v.bus.dwellUntil = Math.max(v.bus.dwellUntil, world.time + 2);   // (the driver waits while you sit down)
  const L = busLines(world)[v.bus.line], nx = nextStopOf(world, v);
  world.notify(p, `On the ${L.name}.${nx ? ` Next stop: ${nx.name}.` : ''}`, 'good');
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  p.meDirty = true;
  return true;
}

// the stop nearest a player on foot (within reach of its shelter): { L, k } or null
function stopNear(world, ped) {
  let best = null, bd = STOP_REACH;
  for (const L of busLines(world)) L.stops.forEach((s, k) => { const d = Math.hypot(s.sx - ped.x, s.sy - ped.y); if (d < bd) { bd = d; best = { L, k }; } });
  return best;
}

// interact at a stop: board the bus waiting there
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const mine = taxiOf(world, p);
  if (mine && mine.taxi.st === 'wait' && sideDist(mine, ped) < mine.def.W / 2 + DOOR_REACH) return taxiInteraction(world, p);   // (the taxi you called, before a bus there)
  const v = busToBoard(world, ped);
  if (!v) return taxiInteraction(world, p);
  const L = busLines(world)[v.bus.line];
  return { label: `Board the ${L.name} bus`, run: () => boardBus(world, p, v) };
}
// ...and when there's no bus: a note of the line and when the next one comes (a prompt with no button)
export function stopNote(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || !world.buses) return null;
  const at = stopNear(world, ped);
  if (!at) return null;
  const eta = stopEta(world, at.L, at.k);
  return { label: `Bus stop · ${at.L.name}${eta === null ? '' : eta < 20 ? ' · the bus is nearly here' : ` · next bus about ${eta < 90 ? `${eta}s` : `${Math.round(eta / 60)} min`}`}`, passive: true, run: () => {} };
}

// what the HUD shows while riding a bus: the line, the next stop, whether it's waiting at one now
export function rideInfo(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || !v.bus || ped.seat <= 0) return null;
  const L = busLines(world)[v.bus.line];
  const at = v.bus.dwellUntil > world.time && v.bus.atStop >= 0 && L ? L.stops[v.bus.atStop] : null, nx = nextStopOf(world, v);
  return { k: 'bus', line: L ? L.name : 'Bus', col: PAINTS[L ? L.paint : 0], at: at ? at.name : null, next: nx ? nx.name : '' };
}

// The Transit app and the map: the lines (their streets and stops), where their buses are, when each stop's next comes
export function transitInfo(world, p = null) {
  return {
    t: 'transit', taxi: p ? taxiInfo(world, p) : null, taxiFlag: TAXI_FLAG, taxiKm: TAXI_PER_KM,
    lines: busLines(world).map((L) => ({
      id: L.id, name: L.name, col: PAINTS[L.paint], len: L.len, path: linePath(world, L),
      stops: L.stops.map((s, k) => ({ x: s.x, y: s.y, n: s.name, eta: stopEta(world, L, k) })),
      buses: ((world.buses && world.buses.get(L.id)) || []).map((id) => world.get(id)).filter(Boolean).map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), a: +v.a.toFixed(2), stop: v.bus.dwellUntil > world.time })),
    })),
  };
}

// ---- taxis ---------------------------------------------------------------------------------------------------------
// Any taxi in traffic (an NPC at the wheel, nobody in the back) can be hailed as it passes (interact within
// TAXI_HAIL_PX) or called from the phone (the nearest free one, or one sent from out of sight nearby). It drives to the
// kerb nearest you and waits TAXI_WAIT_S; interact gets you in the back. Where to: your waypoint (the client sends it
// while you have a taxi; set one on the map or the phone, and a new one on the way re-routes the cab). The meter runs
// from the flag fall by the distance driven with you aboard; at the kerb by the destination it pulls up, and getting
// out (the vehicle key, anywhere) pays the fare - cash, then the bank, as far as it goes. No skipping the ride (design
// notes 2026-10-08): you sit back and watch the city go by. Not for anyone the police are after.
const TAXI_HAIL_PX = 260, TAXI_CALL_PX = 3200;
const TAXI_STILL = new Set(['wait', 'dest', 'there']);
const fareOf = (px) => Math.round(TAXI_FLAG + (px / 32 / 1000) * TAXI_PER_KM);   // (1 m = a tile = 32 px)

// where a taxi pulls up for a spot: the kerb of the nearest street on its side, clear of the corners (and of a bus
// stop there: a cab length past it, or before it)
function kerbAt(world, x, y) {
  const net = world.map.net;
  const ne = nearestEdge(net, x, y, (e) => e.lvl === 0 && TAXI_OK(e) && e.kind !== 'hwy');
  if (!ne) return null;
  const e = ne.e, t = pointAt(e.pts, ne.s);
  let right = t.tx * (y - ne.y) - t.ty * (x - ne.x) > 0;
  if (e.oneway) right = true;
  const from = right ? e.a : e.b;
  const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s, pr = project(lp, { x, y });
  let s = L < 160 ? L / 2 : Math.max(Math.min(STOP_IN, L * 0.4), Math.min(L - 50, pr ? pr.s : L / 2));
  for (const B of busLines(world)) for (const st of B.stops) {
    if (st.edge !== e.id || st.from !== from || Math.abs(st.s - s) > 170) continue;
    s = st.s + 180 <= L - 50 ? st.s + 180 : Math.max(40, st.s - 180);
  }
  const q = pointAt(lp, s);
  return { edge: e.id, from, s, x: q.x, y: q.y, a: Math.atan2(q.ty, q.tx), d: Math.hypot(q.x - x, q.y - y) };
}
// where a vehicle is on the network: { edge, from, s } (its own lane when in traffic)
function whereOn(world, v) {
  const net = world.map.net, ai = v.ai;
  if (ai && ai.edge !== undefined && ai.from !== undefined) {
    const lp = lanePath(net, net.edges[ai.edge], ai.from, Math.min(ai.lane || 0, net.edges[ai.edge].nl - 1)), pr = project(lp, v);
    return { edge: ai.edge, from: ai.from, s: pr ? pr.s : 0 };
  }
  const ne = nearestEdge(net, v.x, v.y, (e) => TAXI_OK(e) && e.lvl === 0);
  if (!ne) return null;
  const e = ne.e, t = pointAt(e.pts, ne.s), fwd = Math.cos(v.a) * t.tx + Math.sin(v.a) * t.ty >= 0;
  const from = e.oneway || fwd ? e.a : e.b;
  return { edge: e.id, from, s: from === e.a ? ne.s : e.len - ne.s };
}
// set a taxi on its way to the kerb point K (from where it is, or from `at`): false when there's no way there
function taxiRoute(world, v, K, at = null) {
  const net = world.map.net, here = at || whereOn(world, v);
  if (!here || !K) return false;
  const steps = route(net, here, K, (q) => TAXI_OK(q) && !isBlocked(world, q.id)) || route(net, here, K, TAXI_OK);   // (round a road remembered as blocked: reroute.js)
  if (!steps) return false;
  let len = Math.max(0, net.edges[steps[0].edge].len - here.s);
  for (let i = 1; i < steps.length - 1; i++) len += net.edges[steps[i].edge].len;
  len += steps.length > 1 ? K.s : 0;
  v.taxi.halt = K; v.taxi.left = len;
  v.ai.route = { steps, i: 0, loop: false };
  traffic.enterRoute(world, v, 0, Math.min(here.s + 20, lanePath(net, net.edges[steps[0].edge], steps[0].from, 0).slice(-1)[0].s - 5));
  return true;
}

const taxiOf = (world, p) => { const v = p.taxi ? world.get(p.taxi) : null; return v && v.taxi && v.taxi.pid === p.pid ? v : null; };
const freeTaxi = (world, v) => v.model === 'taxi' && !v.taxi && v.ai && v.ai.kind === 'traffic' && !v.wreckAt && v.seats[0] && !v.seats.some((s, i) => i > 0 && s) && world.get(v.seats[0])?.npc;
const refuse = (p) => (p.wanted >= TAXI_REFUSE_STARS ? `No taxi will stop for you with ${p.wanted} stars on you.` : null);

// a taxi on its way to pick player p up: null, or why it can't
function sendTaxi(world, p, v) {
  const ped = p.ped, K = kerbAt(world, ped.x, ped.y);
  if (!K) return 'No street near enough here for a taxi.';
  v.taxi = { pid: p.pid, st: 'pickup', halt: K, meter: 0, left: 0, until: world.time + 150, lx: v.x, ly: v.y, dest: null };
  if (!taxiRoute(world, v, K)) { delete v.taxi; return 'No taxi can get to you here by road.'; }
  v.despawnable = false;
  p.taxi = v.id; p.meDirty = true;
  (world.taxis ??= new Set()).add(v.id);
  return null;
}
// the taxi goes back to its rounds (and the player is told why, if anything)
function releaseTaxi(world, v, why = null, tone = 'info') {
  const T = v.taxi;
  if (!T) return;
  const p = world.players.get(T.pid);
  if (p && p.taxi === v.id) { p.taxi = 0; p.meDirty = true; if (why) world.notify(p, why, tone); }
  delete v.taxi;
  if (world.taxis) world.taxis.delete(v.id);
  if (v.ai) { delete v.ai.route; v.ai.next = null; if (v.ai.pts) for (const q of v.ai.pts) delete q.halt; }
  v.despawnable = true;
}
// out of the cab: the fare (as far as the money goes)
function payFare(world, p, v) {
  const T = v.taxi, fare = fareOf(T.meter);
  if (T.meter < 32) return;   // (never got going: no charge)
  const prof = p.profile;
  if (payFrom(p, fare)) world.notify(p, `Taxi fare: $${fare}.`, 'info');
  else { const had = prof.cash + prof.bank; prof.cash = 0; prof.bank = 0; p.meDirty = true; world.notify(p, `The fare was $${fare} - you only had $${had}. The driver took it all.`, 'warn'); }
}

// called from a phone: the nearest free taxi, or one sent from out of sight nearby
function callTaxi(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not now.';
  if (taxiOf(world, p)) return 'A taxi is already coming for you.';
  const no = refuse(p);
  if (no) return no;
  let best = null, bd = TAXI_CALL_PX;
  for (const v of world.query(ped.x, ped.y, TAXI_CALL_PX, K.VEH)) { if (!freeTaxi(world, v)) continue; const d = Math.hypot(v.x - ped.x, v.y - ped.y); if (d < bd) { bd = d; best = v; } }
  if (!best) best = spawnTaxi(world, ped.x, ped.y);
  if (!best) return 'No taxis free round here right now - try again in a moment.';
  const err = sendTaxi(world, p, best);
  if (err) return err;
  world.notify(p, `A taxi is on its way (about ${Math.max(10, Math.round(best.taxi.left / 200 / 5) * 5)}s) - it's the yellow square on your map.`, 'good');
  return null;
}
// a taxi with a driver on a lane out of everyone's sight, 600-1800 px from (x, y)
function spawnTaxi(world, x, y) {
  const net = world.map.net;
  const cands = net.edges.filter((e) => e.lvl === 0 && TAXI_OK(e) && e.kind !== 'dirt' && e.len > 200 && (e.bb || (e.bb = bboxOf(e.pts))).x1 > x - 1800 && e.bb.x0 < x + 1800 && e.bb.y1 > y - 1800 && e.bb.y0 < y + 1800);
  for (let tries = 0; tries < 24 && cands.length; tries++) {
    const e = cands[Math.floor(world.rand() * cands.length)], from = e.oneway || world.rand() < 0.5 ? e.a : e.b;
    const lp = lanePath(net, e, from, 0), L = lp[lp.length - 1].s;
    if (L < 120) continue;
    const p = pointAt(lp, 40 + world.rand() * (L - 80)), d = Math.hypot(p.x - x, p.y - y);
    if (d < 600 || d > 1800 || inAnyView(world, p.x, p.y, 160) || world.query(p.x, p.y, 90, K.VEH).length) continue;
    const v = world.spawnVehicle('taxi', p.x, p.y, Math.atan2(p.ty, p.tx), {});
    const drv = spawnNpc(world, 'casual', p.x, p.y, 'driver');
    drv.vehId = v.id; drv.seat = 0; v.seats[0] = drv.id;
    v.ai = { kind: 'traffic', lane: 0 };
    traffic.joinTraffic(world, v);
    return v.ai ? v : null;
  }
  return null;
}
const bboxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { x0, y0, x1, y1 }; };

// a taxi held up on its way to a pick-up: on to the start of a later step of its route, out of everyone's sight
function cutAhead(world, v) {
  const r = v.ai && v.ai.route, net = world.map.net, T = v.taxi;
  if (!r) return;
  for (let j = r.steps.length - 1; j > r.i; j--) {
    const st = r.steps[j], lp = lanePath(net, net.edges[st.edge], st.from, 0), q = pointAt(lp, Math.min(30, lp[lp.length - 1].s / 2));
    if (j === r.steps.length - 1 && T.halt.s - 30 < 120) continue;   // (not right on top of the pick-up)
    if (inAnyView(world, q.x, q.y, 160) || world.query(q.x, q.y, 90, K.VEH).some((o) => o !== v)) continue;
    v.x = q.x; v.y = q.y; v.a = Math.atan2(q.ty, q.tx); v.vx = 0; v.vy = 0; v.av = 0; v.lz = 0;
    world.place(v);
    for (const sid of v.seats) { const o = sid ? world.get(sid) : null; if (o) { o.x = v.x; o.y = v.y; o.lz = 0; world.place(o); } }
    v.ai.stuck = 0; v.ai.turned = 0;
    traffic.enterRoute(world, v, j, 40);
    T.best = Infinity; T.bestAt = world.time;
    return;
  }
}

// the cab has pulled up at its halt: at the pick-up it waits for you; at the drop-off you're there
function taxiArrived(world, v) {
  const T = v.taxi, p = world.players.get(T.pid);
  if (T.st === 'pickup') { T.st = 'wait'; T.until = world.time + TAXI_WAIT_S; if (p) { p.meDirty = true; world.notify(p, 'Your taxi is here - get in the back (interact by the cab).', 'good'); } }
  else if (T.st === 'ride') { T.st = 'there'; T.idle = world.time + 90; if (p) { p.meDirty = true; world.notify(p, `Here we are${T.dest && T.dest.label ? ` - ${T.dest.label}` : ''}. $${fareOf(T.meter)}: get out with the vehicle key.`, 'good'); } }
}
// the passenger told us where to (their waypoint): off we go
function taxiGo(world, p, v) {
  const T = v.taxi;
  if (!T.dest) { T.st = 'dest'; T.idle = world.time + 90; return; }
  const K = kerbAt(world, T.dest.x, T.dest.y);
  if (!K || K.d > 1200) { T.st = 'dest'; T.idle = world.time + 90; world.notify(p, 'The driver can\'t get you anywhere near there by road - pick a waypoint by a street (the islands without a bridge: the ferry).', 'warn'); return; }
  T.st = 'ride';
  if (!taxiRoute(world, v, K)) { T.st = 'dest'; T.idle = world.time + 90; world.notify(p, 'The driver knows no way there by road - pick another waypoint.', 'warn'); return; }
  world.notify(p, `To ${T.dest.label || 'your waypoint'}: about ${Math.round(T.left / 32)} m, ~$${fareOf(T.meter + T.left)}.`, 'info');
  p.meDirty = true;
}
function boardTaxi(world, p, v) {
  const ped = p.ped, T = v.taxi;
  if (!ped || ped.vehId || ped.dead || !T || T.pid !== p.pid) return false;
  const no = refuse(p);
  if (no) { world.notify(p, no, 'warn'); releaseTaxi(world, v); return false; }
  if (ped.carrying) { world.notify(p, 'Put the crate down first - it won\'t fit in the back.', 'warn'); return false; }
  const seat = [2, 3, 1].find((i) => i < v.seats.length && !v.seats[i]);
  if (seat === undefined) return false;
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat; ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  T.meter = 0; T.lx = v.x; T.ly = v.y; T.dest = p.taxiDest || null;
  if (!T.dest) world.notify(p, 'Where to? Set a waypoint (the map, or the phone\'s places) and the driver takes you there.', 'info');
  taxiGo(world, p, v);
  p.meDirty = true;
  return true;
}
// the meter, the clocks, passengers getting out (transit.update, once a second)
function updateTaxis(world) {
  if (!world.taxis || !world.taxis.size) return;
  const now = world.time;
  for (const id of [...world.taxis]) {
    const v = world.get(id), T = v && v.taxi;
    if (!T) { world.taxis.delete(id); continue; }
    const p = world.players.get(T.pid), ped = p && p.ped;
    const aboard = ped && ped.vehId === v.id && ped.seat > 0;
    if (!v.ai || v.wreckAt || !v.seats[0] || !world.get(v.seats[0])?.npc) {   // the driver's gone (taken, shot, the cab wrecked)
      if (aboard && T.st !== 'wait') payFare(world, p, v);
      releaseTaxi(world, v, 'Your taxi ride is over.', 'warn');
      continue;
    }
    if (!p || !ped || ped.dead) { releaseTaxi(world, v); continue; }
    // standing at the kerb: where it stopped (pushed far off it - rammed, or the driver panicked - it's gone)
    if (T.anchor !== T.st) { T.anchor = T.st; T.sx = v.x; T.sy = v.y; }   // (where it was when this stage began)
    if (TAXI_STILL.has(T.st) && Math.hypot(v.x - T.sx, v.y - T.sy) > 200) {
      if (aboard) payFare(world, p, v);
      releaseTaxi(world, v, 'Your taxi took off.', 'warn');
      continue;
    }
    // on the way but off its route (it lost its way): a new way there
    if ((T.st === 'pickup' || T.st === 'ride') && !v.ai.route && !taxiRoute(world, v, T.halt)) {
      if (aboard) payFare(world, p, v);
      releaseTaxi(world, v, 'Your taxi can\'t find the way.', 'warn');
      continue;
    }
    if (T.st === 'pickup' || T.st === 'wait') {
      if (now > T.until) { releaseTaxi(world, v, T.st === 'wait' ? 'Your taxi gave up waiting and drove off.' : 'Your taxi couldn\'t get to you.', 'warn'); continue; }
      // held up on the way (a jam, a tangle at a junction): out of everyone's sight it takes a short cut on along its route
      if (T.st === 'pickup') {
        const dh = Math.hypot(v.x - T.halt.x, v.y - T.halt.y);
        if (dh < (T.best ?? Infinity) - 40) { T.best = dh; T.bestAt = now; }
        else if (now - (T.bestAt ?? now) > 12 && !inAnyView(world, v.x, v.y, 120)) cutAhead(world, v);
      }
      continue;
    }
    if (!aboard) { payFare(world, p, v); releaseTaxi(world, v); continue; }   // out of the cab: pay up, and off it goes
    if (T.st === 'ride') { const d = Math.hypot(v.x - T.lx, v.y - T.ly); T.meter += d; T.left = Math.max(0, T.left - d); }
    T.lx = v.x; T.ly = v.y;
    // sat there going nowhere (no destination, or there and not getting out): the driver asks you out
    if ((T.st === 'dest' || T.st === 'there') && now > (T.idle || Infinity)) {
      ejectPed(world, ped, false, { x: v.x - Math.sin(v.a) * 120, y: v.y + Math.cos(v.a) * 120 });
      payFare(world, p, v);
      releaseTaxi(world, v, T.st === 'dest' ? 'The driver asked you to get out - no destination.' : 'The driver asked you to get out.', 'info');
      continue;
    }
    // a new waypoint on the way: there instead
    const D = p.taxiDest;
    if ((T.st === 'dest' && D) || (T.st === 'ride' && D && T.dest && (D.x !== T.dest.x || D.y !== T.dest.y))) { T.dest = D; taxiGo(world, p, v); }
  }
}

// interact: get in your taxi (it's waiting by you), or hail one going by
export function taxiInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const mine = taxiOf(world, p);
  if (mine && mine.taxi.st === 'wait' && sideDist(mine, ped) < mine.def.W / 2 + DOOR_REACH) return { label: 'Get in the taxi', run: () => boardTaxi(world, p, mine) };
  if (mine) return null;
  for (const v of world.query(ped.x, ped.y, TAXI_HAIL_PX, K.VEH)) {
    if (!freeTaxi(world, v) || Math.hypot(v.x - ped.x, v.y - ped.y) > TAXI_HAIL_PX) continue;
    return { label: 'Hail the taxi', run: () => { const err = refuse(p) || sendTaxi(world, p, v); if (err) world.notify(p, err, 'warn'); else world.notify(p, 'The taxi\'s pulling over for you.', 'good'); } };
  }
  return null;
}
// riding in your taxi: nothing to press (no skipping the ride), just where you're going and the meter
export function rideInteraction(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || !v.taxi || v.taxi.pid !== p.pid || ped.seat <= 0) return null;
  const T = v.taxi;
  if (T.st === 'ride') return { label: `On the way${T.dest && T.dest.label ? ` to ${T.dest.label}` : ''} (~$${fareOf(T.meter + T.left)})`, passive: true, run: () => {} };
  return null;
}
const sideDist = (v, ped) => {
  const c = Math.cos(v.a), sn = Math.sin(v.a), dx = ped.x - v.x, dy = ped.y - v.y;
  const along = Math.max(-v.def.L / 2, Math.min(v.def.L / 2, dx * c + dy * sn));
  return Math.hypot(dx - c * along, dy - sn * along);
};

// the phone (the Transit app): call a taxi, cancel it, and where you want to go (your waypoint, while you have one)
export function taxiPhone(world, p, msg) {
  const op = String(msg.op || '');
  if (op === 'call') { const err = callTaxi(world, p); if (err) world.notify(p, err, 'warn'); }
  else if (op === 'cancel') { const v = taxiOf(world, p); if (v && !(p.ped && p.ped.vehId === v.id)) releaseTaxi(world, v, 'Taxi cancelled.'); }
  else if (op === 'dest') {
    const x = Number(msg.x), y = Number(msg.y);
    p.taxiDest = Number.isFinite(x) && Number.isFinite(y) && msg.x !== null ? { x: Math.round(x), y: Math.round(y), label: String(msg.label || '').slice(0, 60) } : null;
    return null;
  }
  return transitInfo(world, p);
}
// the HUD while you have a taxi: on its way (where, how long), waiting, where to, the meter, there
export function taxiInfo(world, p) {
  const v = taxiOf(world, p);
  if (!v) return null;
  const T = v.taxi;
  return { st: T.st, x: Math.round(v.x), y: Math.round(v.y), eta: T.st === 'pickup' ? Math.round(T.left / 200) : 0, wait: T.st === 'wait' ? Math.max(0, Math.round(T.until - world.time)) : 0, to: T.dest ? T.dest.label || 'your waypoint' : '', m: Math.round(T.left / 32), fare: fareOf(T.meter), est: fareOf(T.meter + T.left) };
}
