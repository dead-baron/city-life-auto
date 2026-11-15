// Racers: drivers flat out through the city - the director's street race and its getaway car (the owner, 2026-11-14,
// after the first shot list: "Street racing: the cars just drive in a cluster then stop at stop lights, they don't act like
// they're racing - they should be swerving in and out of traffic and pedestrians should be jumping out of the way";
// "the car chase scene just had a car driving in an alley ... and the car ended up crashing into something").
//   - The way: along the roads (the lane graph, wide streets first: wideRoute - never an alley, a tunnel or a ramp while
//     a wide way exists), its corners cut (the racer steers for a point well down the road, not each waypoint).
//   - No lights, no stop signs, no queues: each tick the racer looks down the road across its whole width - both
//     directions' lanes - for the line with the most room ahead (the traffic, the other racers, anyone on foot, by how
//     soon it closes on them), keeps to the line it's on while that's clear, and swings out round whatever's in it: lane
//     changes, near-misses, overtakes. Only with every line shut does it brake.
//   - Each racer its own pace (skill): the pack strings out, the quicker ones from the back work through it.
//   - Anyone on foot in its path dives out of the way (npc.js diveFrom: the dive roll); a car it shaves past brakes and
//     honks (traffic.js startle). Blocked (wedged, boxed in), it backs off and takes the other side, then a new way.
import { K, T, DT } from '../../shared/constants.js';
import { lanePath, turnPath, nearestEdge } from '../../shared/roads.js';
import { pointAt, project, measure } from '../../shared/geom.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { RACERS } from '../../shared/rules.js';
import { driveToward, enterEdge } from './traffic.js';
import { diveFrom, spawnNpc } from './npc.js';

const ROADISH = (t) => t === T.ROAD || t === T.BRIDGE || t === T.LOT;
// a wide street at ground level (two lanes or more each way, or a boulevard) - not an alley, a ramp, a tunnel, a deck
// (World v3's kinds: 'ave', 'blvd', 'art' and the wider streets; never 'alley', 'dirt' or a 'ramp' / deck - lvl)
const POOR = new Set(['alley', 'dirt', 'rural', 'ramp']);
export const wideEdge = (e) => !!e && !e.lvl && !e.tunnel && !POOR.has(e.kind) && (e.w || 0) >= RACERS.wideW;
const groundEdge = (e) => !!e && !e.lvl && !e.tunnel;

// ---- the way: a route over the lane graph, the wide streets first ------------------------------------------------------
// Dijkstra on the junctions (a narrow street costs RACERS.narrowK times its length, a tunnel, a ramp or a deck far more):
// waypoints along the outer lane's line, the turns through the junctions, ending at (tx, ty). null: no way by road.
function heapPush(h, item) { h.push(item); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function heapPop(h) { const top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } } return top; }
export function wideRoute(world, fx, fy, tx, ty) {
  const net = world.map.net;
  if (!net) return null;
  const s0 = nearestEdge(net, fx, fy, groundEdge), g0 = nearestEdge(net, tx, ty, groundEdge);
  if (!s0 || !g0) return null;
  // (from the end of the start's edge it faces - the way to the goal - and to whichever end of the goal's edge is nearer)
  const e0 = s0.e, starts = [e0.a, e0.b], goal = new Set([g0.e.a, g0.e.b]);
  const cost = (e) => e.len * (wideEdge(e) ? 1 : groundEdge(e) && !POOR.has(e.kind) ? RACERS.narrowK : 40);
  const dist = new Map(), prev = new Map(), h = [];
  for (const n of starts) { const d = Math.hypot(net.nodes[n].x - fx, net.nodes[n].y - fy) + Math.max(0, -((net.nodes[n].x - fx) * (tx - fx) + (net.nodes[n].y - fy) * (ty - fy)) / Math.max(1, Math.hypot(tx - fx, ty - fy))) * 4; dist.set(n, d); prev.set(n, null); heapPush(h, [d, n]); }
  let end = -1;
  while (h.length) {
    const [d, n] = heapPop(h);
    if (d > (dist.get(n) ?? Infinity)) continue;
    if (goal.has(n)) { end = n; break; }
    for (const [eid, nid] of Object.entries(net.nodes[n].links)) {
      const e = net.edges[+eid], nd = d + cost(e);
      if (nd < (dist.get(nid) ?? Infinity)) { dist.set(nid, nd); prev.set(nid, { id: n, e: +eid }); heapPush(h, [nd, nid]); }
    }
  }
  if (end < 0) return null;
  const chain = [];
  for (let cur = end; prev.get(cur); cur = prev.get(cur).id) chain.unshift({ from: prev.get(cur).id, e: prev.get(cur).e });
  const pts = [{ x: fx, y: fy }];
  let last = null;
  for (const step of chain) {
    const e = net.edges[step.e], lp = lanePath(net, e, step.from, 0);
    if (last) for (const p of turnPath(last.p, last.d, lp[0], dirAt(lp, 0), 4)) pts.push({ x: p.x, y: p.y });
    for (let s = 0; s < lp[lp.length - 1].s; s += 96) { const q = pointAt(lp, s); pts.push({ x: q.x, y: q.y }); }
    const q = lp[lp.length - 1];
    pts.push({ x: q.x, y: q.y });
    last = { p: q, d: dirAt(lp, lp[lp.length - 1].s) };
  }
  pts.push({ x: tx, y: ty });
  measure(pts);
  return pts;
}
const dirAt = (lp, s) => { const q = pointAt(lp, Math.max(0, Math.min(lp[lp.length - 1].s, s))); return { x: q.tx, y: q.ty }; };

// ---- one racer -----------------------------------------------------------------------------------------------------------
// R: its state - route (measured points), s (how far along it, px), off (its line: px to the side of the route's, + right),
// top (its pace, px/s), stuck (s), done
export function racer(world, v, route, { skill = 1, goal = null } = {}) {
  const pr = project(route, v);
  return { route, s: pr ? pr.s : 0, off: pr ? sideOf(route, pr.s, v) : 0, top: v.def.max * RACERS.pace * skill, skill, stuck: 0, backUntil: 0, side: 0, done: false, goal: goal || route[route.length - 1], replans: 0, near: new Set() };
}
const sideOf = (route, s, v) => { const q = pointAt(route, s); return -(v.x - q.x) * q.ty + (v.y - q.y) * q.tx; };
// the obstacles: everyone and everything on the road near the racer (not itself; on its level)
function around(world, v, reach) {
  const out = [];
  for (const e of world.query(v.x + Math.cos(v.a) * reach * 0.5, v.y + Math.sin(v.a) * reach * 0.5, reach * 0.6 + 60)) {
    if (e === v || e.removed) continue;
    if (e.kind === K.PED) { if (e.vehId || e.dead || e.hidden) continue; }
    else if (e.kind !== K.VEH) continue;
    if (e.kind === K.VEH && (e.alt || 0) > 60) continue;
    if (!sameLevel(e.lz, v.lz)) continue;
    out.push(e);
  }
  return out;
}
// Room ahead on a line: from the racer to the point `look` px down the route, `o` px to the side of it - the first thing
// in the way along that corridor (its distance, less how fast they close), or the corridor's length (and some) when clear.
// Also false when the line leaves the road (a kerb, a wall: the line isn't there).
function roomOn(world, v, R, o, look, obs, fwd) {
  const q = pointAt(R.route, Math.min(R.route[R.route.length - 1].s, R.s + look)), tx = q.x - q.ty * o, ty = q.y + q.tx * o;
  const m = world.map;
  for (const k of [0.35, 0.7, 1]) if (!ROADISH(m.tileAtPx(v.x + (tx - v.x) * k, v.y + (ty - v.y) * k))) return { free: -1, tx, ty };
  const dx = tx - v.x, dy = ty - v.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  let free = L + 200;
  for (const e of obs) {
    const ex = e.x - v.x, ey = e.y - v.y, along = ex * ux + ey * uy, across = Math.abs(-ex * uy + ey * ux);
    if (along < -10 || along > L + 140) continue;
    const half = e.kind === K.VEH ? Math.abs(Math.sin(e.a - Math.atan2(uy, ux))) * e.def.L / 2 + Math.abs(Math.cos(e.a - Math.atan2(uy, ux))) * e.def.W / 2 : 12;
    if (across > v.def.W / 2 + half + RACERS.margin) continue;
    const closing = Math.max(0, fwd - ((e.vx || 0) * ux + (e.vy || 0) * uy));   // (one coming the other way closes fast)
    const gap = along - v.def.L / 2 - (e.kind === K.VEH ? Math.abs(Math.cos(e.a - Math.atan2(uy, ux))) * e.def.L / 2 : 10) - closing * 0.35;
    if (gap < free) free = gap;
  }
  return { free, tx, ty };
}
// a step of the racer: its line, its speed, then the wheel and the pedals (traffic.js driveToward: never into a wall)
export function raceStep(world, v, R) {
  if (R.done || v.wreckAt || v.dead) return;
  const now = world.time, fwd = Math.max(0, vehForwardSpeed(v)), route = R.route, Ls = route[route.length - 1].s;
  // how far along: the route near where it was (never back to an earlier bend of it)
  const win = []; let i0 = 0;
  while (i0 < route.length - 1 && route[i0 + 1].s < R.s - 200) i0++;
  for (let i = i0; i < route.length && route[i].s < R.s + 700; i++) win.push(route[i]);
  if (win.length >= 2) { const pr = project(win, v); if (pr && pr.s >= R.s - 50) R.s = Math.max(R.s, pr.s); }
  if (Ls - R.s < 140) { R.done = true; return; }
  // backing off something it's wedged against
  if (R.backUntil > now) { v.ai.ctl = null; v.input = { throttle: -0.9, steer: R.side ? -R.side : 0.6, hb: false }; return; }
  const look = Math.min(RACERS.lookMax, RACERS.look + fwd * 0.42);   // (a long look: the corners cut, the gaps seen early)
  const obs = around(world, v, look + 160);
  // its line across the road: kept while clear, else the clearest - one to the side swung out to early
  const lanes = [];
  for (let o = -RACERS.width; o <= RACERS.width; o += RACERS.step) lanes.push(o);
  let best = null;
  for (const o of lanes) {
    const r = roomOn(world, v, R, o, look, obs, fwd);
    if (r.free < 0) continue;
    const score = Math.min(r.free, look + 200) - Math.abs(o - R.off) * RACERS.stick - Math.abs(o) * 0.08 + (R.side && Math.sign(o) === R.side ? 60 : 0);
    if (!best || score > best.score) best = { o, score, ...r };
  }
  if (!best) best = { o: 0, free: 0, ...roomOn(world, v, R, 0, look, obs, fwd) };
  const st = Math.min(1, RACERS.swing * DT / Math.max(1, Math.abs(best.o - R.off)));
  R.off += (best.o - R.off) * st;
  const tgt = pointAt(route, Math.min(Ls, R.s + look)), tx = tgt.x - tgt.ty * R.off, ty = tgt.y + tgt.tx * R.off;
  // the pace: its top, less for a sharp bend coming, less still when every line ahead is shut
  let speed = R.top;
  const far = pointAt(route, Math.min(Ls, R.s + look + 220)), bend = Math.abs(Math.atan2(Math.sin(Math.atan2(far.y - v.y, far.x - v.x) - v.a), Math.cos(Math.atan2(far.y - v.y, far.x - v.x) - v.a)));
  if (bend > 0.45) speed = Math.min(speed, Math.max(RACERS.cornerMin, R.top * (1.25 - bend * 0.55)));
  const stopD = (fwd * fwd) / (2 * RACERS.brake) + 20;
  if (best.free < stopD) speed = Math.min(speed, Math.max(0, best.free * 2.2));
  driveToward(world, v, tx, ty, speed, { ignoreObstacles: true, ignoreCrossings: true });
  v.dirDrive = world.tick;
  // anyone on foot about to be hit: the dive; a car it shaves past: a brake and a honk
  for (const e of obs) {
    const ex = e.x - v.x, ey = e.y - v.y, c = Math.cos(v.a), s = Math.sin(v.a), lx = ex * c + ey * s, ly = -ex * s + ey * c;
    if (e.kind === K.PED) {
      if (!e.player && fwd > 150 && lx > v.def.L / 2 - 6 && lx < v.def.L / 2 + fwd * 0.7 && Math.abs(ly) < v.def.W / 2 + 26 && diveFrom(world, e, v)) world.racerDives = (world.racerDives || 0) + 1;
    } else if (e.ai && e.ai.kind === 'traffic' && fwd > 200 && Math.abs(lx) < v.def.L && Math.abs(ly) < v.def.W / 2 + e.def.W / 2 + RACERS.shave && !R.near.has(e.id)) {
      R.near.add(e.id);
      e.ai.startleUntil = now + RACERS.startleS;
      e.hornUntil = now + 0.7;
      world.racerShaves = (world.racerShaves || 0) + 1;
    }
  }
  // stuck: back off, then the other side; again and again: a new way from here
  if (speed > 120 && fwd < 40) R.stuck += DT; else R.stuck = Math.max(0, R.stuck - DT * 2);
  if (R.stuck > RACERS.stuckS) {
    R.stuck = 0; R.backUntil = now + 0.8; R.side = R.off >= 0 ? -1 : 1; R.replans++;
    if (R.replans % 3 === 0) { const r = wideRoute(world, v.x, v.y, R.goal.x, R.goal.y); if (r) { R.route = r; R.s = 0; R.off = 0; } }
  }
}

// ---- traffic for them to weave through --------------------------------------------------------------------------------------
// n cars on the streets along the route ahead (both ways, and across its junctions): the city's own traffic from then.
// Returns the vehicles.
export function trafficAlong(world, route, n, from = 300) {
  const net = world.map.net, out = [];
  if (!net || !route || !n) return out;
  const Ls = route[route.length - 1].s, span = Math.max(200, (Ls - from) / n);
  const MODELS = ['sedan', 'compact', 'pickup', 'van', 'taxi', 'sedan', 'suv'];
  for (let k = 0; k < n; k++) {
    const s = from + span * (k + 0.5), q = pointAt(route, Math.min(Ls - 60, s));
    const ne = nearestEdge(net, q.x, q.y, groundEdge);
    if (!ne || ne.d > 80) continue;
    const e = ne.e, fwdWay = k % 3 !== 1, from0 = fwdWay ? e.a : e.b;   // (most the racers' way, some coming toward them)
    const lane = Math.min(e.nl - 1, k % 2), lp = lanePath(net, e, from0, lane), pr = project(lp, q);
    if (!pr || pr.s < 20 || pr.s > lp[lp.length - 1].s - 40) continue;
    const p = pointAt(lp, pr.s), model = MODELS[k % MODELS.length];
    if (world.query(p.x, p.y, 60, K.VEH).length) continue;
    const v = world.spawnVehicle(model, p.x, p.y, Math.atan2(p.ty, p.tx), {});
    if (!v) continue;
    v.lz = 0;
    const sp0 = Math.min(v.def.max * 0.3, 180);
    v.vx = p.tx * sp0; v.vy = p.ty * sp0;
    const d = spawnNpc(world, 'casual', p.x, p.y, 'driver');
    d.vehId = v.id; d.seat = 0; v.seats[0] = d.id; d.lz = 0;
    v.ai = { kind: 'traffic', lane };
    enterEdge(world, v, e.id, from0, lane, pr.s + 30);
    world.trafficCount = (world.trafficCount || 0) + 1;
    out.push({ v, e, from: from0, lane, s: pr.s });
  }
  return out;
}
