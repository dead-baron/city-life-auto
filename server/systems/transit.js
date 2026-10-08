// Public transport (the user's notes, 2026-10-08): the bus lines you can ride. Everything here is worked out on the
// server from the map; the client is told what it needs to show (the Transit phone app, the lines on the map, the ride
// on the HUD).
//
// Buses: lines worked out from the city's bus shelters (map props 'busstop'). The shelters of each town zone are put
// in a loop - the nearest one next, the loop straightened out - and the road between them found on the street network
// (the ground level, through streets only, one-way streets one way): each line is a loop of steps (an edge and the
// end it is entered from) with its stops on them, at the kerb on the bus's side of the road. Each line runs a bus or
// three, spread round it; a bus keeps to the kerb lane, pulls up at every stop for BUS_DWELL_S and goes on (the NPC
// traffic driver, traffic.js, takes its turns from the line and its speed cap from here). Standing at a stop while a bus
// waits there, interact boards it for BUS_FARE (a passenger seat; the camera rides along). Get off with the vehicle key
// while it waits at a stop (on the move you bail out, as from any vehicle). A bus that is taken or wrecked leaves its
// line; a new one comes into service a minute later, out of sight.
import { K } from '../../shared/constants.js';
import { lanePath, exitsFrom, nearestEdge } from '../../shared/roads.js';
import { project, pointAt } from '../../shared/geom.js';
import { BUS_FARE, BUS_DWELL_S } from '../../shared/rules.js';
import { PAINTS } from '../../shared/vehicles.js';
import { spawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import { payFrom } from './economy.js';
import * as traffic from './traffic.js';

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

// The quickest way along the streets from stop A to stop B (both on the kerb lane, A's direction to B's): a list of
// steps [{ edge, from }] from A's edge to B's, or null. B behind A on the same stretch: the way round the block.
function route(net, A, B) {
  if (A.edge === B.edge && A.from === B.from && B.s > A.s + 60) return [{ edge: A.edge, from: A.from }];
  const key = (e, f) => e * 2 + (net.edges[e].a === f ? 0 : 1);
  const ok = (e) => e.lvl === 0 && BUS_ROADS.has(e.kind);
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
    if (d > 60000) break;
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
  v.ai = { kind: 'traffic', lane: 0, route: { line: L.id, i: k } };
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
  const wp = v.ai.pts && v.ai.pts.find((q) => q.busStop !== undefined);
  if (wp) return wp.busStop;
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

// traffic.js asks before each move: how fast a bus may go (easing up to its stop, waiting there), or Infinity
export function busCap(world, v) {
  const b = v.bus;
  if (!b) return Infinity;
  if (b.dwellUntil > world.time) return 0;
  const wp = v.ai && v.ai.pts && v.ai.pts.find((q) => q.busStop !== undefined);
  if (!wp) return Infinity;
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  return d < 340 ? Math.max(28, (d - 10) * 1.3) : Infinity;
}

// traffic.js: the bus has come to its stop k (reached its waypoint): the doors open
export function arriveAt(world, v, k) {
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
  if (world.opts.transit === false || (!world.npcBudget && !world.opts.transit) || !world.players.size || world.tick % 20 !== 7) return;
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
  if (!payFrom(p, BUS_FARE)) { world.notify(p, `The fare is $${BUS_FARE}.`, 'warn'); return false; }
  if (ped.carrying) { world.notify(p, 'Put the crate down first - no freight on the bus.', 'warn'); return false; }
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat; ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  v.bus.dwellUntil = Math.max(v.bus.dwellUntil, world.time + 2);   // (the driver waits while you sit down)
  const L = busLines(world)[v.bus.line], nx = nextStopOf(world, v);
  world.notify(p, `On the ${L.name} ($${BUS_FARE}).${nx ? ` Next stop: ${nx.name}.` : ''}`, 'good');
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
  const v = busToBoard(world, ped);
  if (!v) return null;
  const L = busLines(world)[v.bus.line];
  return { label: `Board the ${L.name} bus ($${BUS_FARE})`, run: () => boardBus(world, p, v) };
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
export function transitInfo(world) {
  return {
    t: 'transit', fare: BUS_FARE,
    lines: busLines(world).map((L) => ({
      id: L.id, name: L.name, col: PAINTS[L.paint], len: L.len, path: linePath(world, L),
      stops: L.stops.map((s, k) => ({ x: s.x, y: s.y, n: s.name, eta: stopEta(world, L, k) })),
      buses: ((world.buses && world.buses.get(L.id)) || []).map((id) => world.get(id)).filter(Boolean).map((v) => ({ x: Math.round(v.x), y: Math.round(v.y), a: +v.a.toFixed(2), stop: v.bus.dwellUntil > world.time })),
    })),
  };
}
