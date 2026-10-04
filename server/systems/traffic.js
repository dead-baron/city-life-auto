// NPC traffic (GDD §10): drivers follow lanes along the road network - straight, diagonal and
// curved streets, the one-way frontage roads, the elevated ring highway and its ramps - turn
// through junctions on smooth paths, obey 2- and 3-phase signals, keep their distance, slow for
// bends, pull over for sirens and panic when attacked; parked cars and docked boats near players.
// Also exports the shared driving controller + route planner used by police and EMS.
import { K, T } from '../../shared/constants.js';
import { lanePath, turnPath, exitsFrom, signalFor, edgeZ, nearestEdge } from '../../shared/roads.js';
import { pointAt, measure } from '../../shared/geom.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { TRAFFIC_MIX, PARKED_MIX } from '../../shared/vehicles.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { mulberry32, hash2 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { crossingLimit } from './trains.js';
import { inAnyView } from '../view.js';
import { HIGHWAY_SPEED } from '../../shared/rules.js';

const rng = mulberry32(4242);

function weighted(mix) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let r = rng() * total;
  for (const [id, w] of mix) { r -= w; if (r <= 0) return id; }
  return mix[0][0];
}

// cruising speed by road class (px/s)
const CRUISE = { hwy: HIGHWAY_SPEED, ramp: 330, ave: 290, blvd: 290, front: 290, st: 245, drive: 255, minor: 170, rural: 330 };

function nearestAnchor(world, x, y) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    if (!p.ped || p.ped.dead) continue;
    const d = (p.ped.x - x) ** 2 + (p.ped.y - y) ** 2;
    if (d < bd) { bd = d; best = p.ped; }
  }
  return best ? { a: best, d: Math.sqrt(bd) } : null;
}

// Pick the next road at a junction: mostly straight on, sometimes a turn; drivers that have
// wandered far from every player drift back toward the action.
function chooseExit(world, n, inEdge) {
  const net = world.map.net;
  const opts = exitsFrom(net, n, inEdge);
  if (!opts.length) return null;
  const near = nearestAnchor(world, n.x, n.y);
  if (near && near.d > 900 && rng() < 0.7) {
    let best = null, bd = Infinity;
    for (const o of opts) {
      const m = net.nodes[o.to];
      const dd = (m.x - near.a.x) ** 2 + (m.y - near.a.y) ** 2;
      if (dd < bd) { bd = dd; best = o; }
    }
    if (best) return best;
  }
  const straight = opts.filter((o) => Math.abs(o.turn) < 0.4);
  if (straight.length && rng() < 0.55) return straight[Math.floor(rng() * straight.length)];
  // highway drivers mostly stay on the highway
  if (n.lvl === 1 && straight.length && rng() < 0.6) return straight[0];
  return opts[Math.floor(rng() * opts.length)];
}

// Lane for a road we are about to enter, given the turn into it (right turns from the kerb lane,
// left turns from the inside lane, straight on keeps its lane).
function laneFor(e, turn, cur) {
  if (e.nl <= 1) return 0;
  if (turn > 0.5) return 0;                 // right turn (screen coords: +angle = clockwise = right)
  if (turn < -0.5) return e.nl - 1;
  return Math.min(e.nl - 1, cur ?? Math.floor(rng() * e.nl));
}

const stride = (pts, from, step = 72) => {
  const out = [];
  let acc = 0;
  for (let i = from; i < pts.length; i++) {
    if (i > from) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (i === pts.length - 1 || acc >= step) { out.push({ x: pts[i].x, y: pts[i].y }); acc = 0; }
  }
  return out;
};
const endDir = (pts) => { const a = pts[Math.max(0, pts.length - 2)], b = pts[pts.length - 1]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const startDir = (pts) => { const a = pts[0], b = pts[Math.min(pts.length - 1, 1)]; const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };

// Queue the waypoints for the current edge from arc length s on, ending at its stop line, and
// decide which way to go at its far end.
function enterEdge(world, v, edgeId, from, lane, s0 = 0) {
  const net = world.map.net;
  const ai = v.ai;
  const e = net.edges[edgeId];
  ai.edge = edgeId; ai.from = from; ai.lane = lane;
  const lp = lanePath(net, e, from, lane);
  let i0 = 0;
  while (i0 < lp.length - 1 && lp[i0 + 1].s <= s0) i0++;
  const pts = stride(lp, i0 + 1);
  const to = e.a === from ? e.b : e.a;
  const stop = pts[pts.length - 1] || { x: lp[lp.length - 1].x, y: lp[lp.length - 1].y };
  Object.assign(stop, { stop: true, node: to, edge: edgeId });
  if (!pts.length) pts.push(stop);
  ai.pts = pts;
  ai.kindSpeed = CRUISE[e.kind] || 250;
  ai.next = chooseExit(world, net.nodes[to], edgeId);
  ai.turning = !!ai.next && Math.abs(ai.next.turn) > 0.5;
}

// Through the junction at the end of the current edge onto the chosen next one.
function crossJunction(world, v) {
  const net = world.map.net;
  const ai = v.ai;
  const e = net.edges[ai.edge];
  const to = e.a === ai.from ? e.b : e.a;
  const nx = ai.next || chooseExit(world, net.nodes[to], ai.edge);
  if (!nx) { v.ai = null; v.despawnable = true; return; }
  const ne = net.edges[nx.edge];
  const lane = laneFor(ne, nx.turn, ai.lane);
  const a = lanePath(net, e, ai.from, ai.lane), b = lanePath(net, ne, to, lane);
  const turn = turnPath(a[a.length - 1], endDir(a), b[0], startDir(b), Math.abs(nx.turn) > 0.5 ? 6 : 3);
  enterEdge(world, v, nx.edge, to, lane, 0);
  ai.pts.unshift(...turn.map((p) => ({ x: p.x, y: p.y })));
}

// ---- shared driving controller ----------------------------------------------------
export function driveToward(world, v, wx, wy, desired, opts = {}) {
  const fwd = vehForwardSpeed(v);
  const want = Math.atan2(wy - v.y, wx - v.x);
  const diff = angleDiff(v.a, want);
  let steer = clamp(diff * 2.4, -1, 1);
  let speed = desired;
  if (Math.abs(diff) > 0.9) speed = Math.min(speed, 140);
  if (!opts.ignoreObstacles) speed = Math.min(speed, obstacleSpeed(world, v, fwd));
  if (!opts.ignoreCrossings && (v.lz || 0) < 0.3) speed = Math.min(speed, crossingLimit(world, v, fwd)); // level-crossing gates down: stop (or gamble)
  let throttle = clamp((speed - fwd) / 90, -1, 1);
  if (speed < 6 && fwd < 12) throttle = 0;
  // reverse out when wedged
  const ai = v.ai;
  if (ai) {
    if (Math.abs(fwd) < 12 && desired > 60 && speed > 40) ai.stuck = (ai.stuck || 0) + 0.05; else ai.stuck = Math.max(0, (ai.stuck || 0) - 0.1);
    if (ai.stuck > 2.5) { ai.reverseUntil = world.time + 1.3; ai.stuck = 0; }
    if (ai.reverseUntil && world.time < ai.reverseUntil) { throttle = -0.8; steer = -steer; }
  }
  v.input.throttle = throttle; v.input.steer = steer; v.input.hb = false;
}

function obstacleSpeed(world, v, fwd) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const look = v.def.L / 2 + 50 + Math.max(0, fwd) * 0.7;
  let limit = Infinity;
  for (const e of world.query(v.x + c * look / 2, v.y + s * look / 2, look / 2 + 40)) {
    if (e === v) continue;
    if (e.kind === K.PED) { if (e.vehId || e.dead) continue; }
    else if (e.kind !== K.VEH) continue;
    if (!sameLevel(e.lz, v.lz)) continue; // traffic up on the deck doesn't brake for the street below
    const dx = e.x - v.x, dy = e.y - v.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const halfOther = e.kind === K.VEH ? e.def.W / 2 : 10;
    if (lx < 0 || lx > look + 40 || Math.abs(ly) > v.def.W / 2 + halfOther - 4) continue;
    const gap = lx - v.def.L / 2 - (e.kind === K.VEH ? e.def.L / 2 : 10) - 10;
    limit = Math.min(limit, Math.max(0, gap * 1.8));
  }
  return limit;
}

// Route over the road network (BFS on junctions, any level - police and ambulances take the
// highway too): world waypoints along the lanes, ending at the target.
export function planRoute(world, fromX, fromY, toX, toY) {
  const m = world.map, net = m.net;
  const start = m.nearestNode(fromX, fromY), goal = m.nearestNode(toX, toY);
  if (!start || !goal || !net) return [{ x: toX, y: toY, final: true }];
  const prev = new Map([[start.id, null]]);
  const q = [start.id];
  for (let qi = 0; qi < q.length; qi++) {
    const id = q[qi];
    if (id === goal.id) break;
    for (const [eid, nid] of Object.entries(net.nodes[id].links)) if (!prev.has(nid)) { prev.set(nid, { id, e: +eid }); q.push(nid); }
  }
  const chain = [];
  let cur = goal.id;
  while (cur !== undefined && cur !== start.id) { const p = prev.get(cur); if (!p) break; chain.unshift({ from: p.id, e: p.e }); cur = p.id; }
  const pts = [];
  let last = null;
  for (const step of chain) {
    const e = net.edges[step.e];
    const lp = lanePath(net, e, step.from, 0);
    if (last) for (const p of turnPath(last.p, last.d, lp[0], startDir(lp), 4)) pts.push({ x: p.x, y: p.y });
    for (const p of stride(lp, 0, 96)) pts.push(p);
    last = { p: lp[lp.length - 1], d: endDir(lp) };
  }
  pts.push({ x: toX, y: toY, final: true });
  return pts;
}

// ---- traffic update ----------------------------------------------------------
export function update(world, dt) {
  if (world.tick % 15 === 3) manage(world);
  const loopT = world.loopTime;
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.ai || v.ai.kind !== 'traffic') continue;
    const driver = v.seats[0] ? world.get(v.seats[0]) : null;
    if (!driver || driver.dead || !driver.npc) { v.ai = null; v.despawnable = true; continue; }
    if (v.wreckAt) continue;
    steerTraffic(world, v, loopT);
  }
  void dt;
}

function steerTraffic(world, v, t) {
  const ai = v.ai;
  const now = world.time;
  const net = world.map.net;
  const panic = ai.panicUntil && now < ai.panicUntil;
  if (!ai.pts || !ai.pts.length) { crossJunction(world, v); if (!v.ai) return; }
  let wp = ai.pts[0];
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  // orbit guard: a waypoint inside the turning circle makes a car loop around it forever.
  if (ai.lastA === undefined) ai.lastA = v.a;
  let da = v.a - ai.lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ai.lastA = v.a;
  ai.turned = (ai.turned || 0) + Math.abs(da);
  const beside = d < 50 && Math.abs(angleDiff(v.a, Math.atan2(wp.y - v.y, wp.x - v.x))) > 1.25;
  if (ai.turned > Math.PI * 3.6) { replanFromHere(world, v); ai.turned = 0; return; }
  if (d < 30 || passed(v, wp) || beside || ai.turned > Math.PI * 1.9) {
    ai.turned = 0;
    ai.pts.shift();
    if (wp.stop) { crossJunction(world, v); if (!v.ai) return; ai.replans = 0; }
    if (!ai.pts.length) { crossJunction(world, v); if (!v.ai) return; }
    wp = ai.pts[0];
  }
  let desired = panic ? 520 : Math.min(ai.kindSpeed || 250, v.model === 'bus' ? 220 : 999);
  // slow for bends: how sharply the path ahead turns
  const ahead = ai.pts[Math.min(ai.pts.length - 1, 2)];
  if (ahead) {
    const bend = Math.abs(angleDiff(v.a, Math.atan2(ahead.y - v.y, ahead.x - v.x)));
    if (bend > 0.35) desired = Math.min(desired, Math.max(120, 420 - bend * 300));
  }
  const stopIdx = ai.pts.findIndex((p) => p.stop);
  const stop = stopIdx >= 0 ? ai.pts[stopIdx] : null;
  if (stop && !panic) {
    const n = net.nodes[stop.node];
    const st = signalFor(n, stop.edge, t);
    const ds = Math.hypot(stop.x - v.x, stop.y - v.y);
    if (st === 'R' || (st === 'Y' && ds > 60)) desired = Math.min(desired, Math.max(0, (ds - 14) * 1.6));
    else if (ai.turning && ds < 260) desired = Math.min(desired, 150 + ds * 0.4);
  }
  if (!panic && (world.tick + v.id) % 4 === 0) ai.yieldUntil = sirenBehind(world, v) ? now + 1.5 : ai.yieldUntil;
  if (!panic && ai.yieldUntil && now < ai.yieldUntil) {
    // an emergency vehicle with its siren on is coming: ease over toward the curb and slow
    // right down. Only ever onto empty road - never up onto the pavement or into people.
    const c = Math.cos(v.a), sn = Math.sin(v.a);
    const rx = -sn, ry = c;
    const up = (v.lz || 0) > 0.3;
    const solidNear = (x, y) => {
      if (up) return false;
      const k0x = Math.floor(x / 32), k0y = Math.floor(y / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = world.map.solidProps.get((k0y + dy) * world.map.w + k0x + dx);
        if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 10) return true;
      }
      return false;
    };
    const curbOk = (x, y) => { if (up) return true; const tt = world.map.tileAtPx(x, y); return tt === T.ROAD || tt === T.BRIDGE || tt === T.SIDEWALK || tt === T.LOT || tt === T.PLAZA; };
    let shift = 0;
    const strip = (k) => { // the car's outer edge from its tail to 70 px past its nose
      for (let along = -v.def.L / 2; along <= v.def.L / 2 + 70; along += 14) {
        const ox = v.x + c * along + rx * (k + v.def.W / 2), oy = v.y + sn * along + ry * (k + v.def.W / 2);
        if (!curbOk(ox, oy) || solidNear(ox, oy)) return false;
      }
      return true;
    };
    for (let k = 4; k <= (up ? 14 : 26); k += 2) { if (!strip(k)) break; shift = k; }
    const room = shift >= 6;
    const tx = v.x + c * 50 + rx * shift, ty = v.y + sn * 50 + ry * shift;
    const busy = room && world.query(v.x + c * 40 + rx * (shift + v.def.W / 2), v.y + sn * 40 + ry * (shift + v.def.W / 2), 70, K.PED).some((e) => !e.dead && !e.vehId && sameLevel(e.lz, v.lz));
    driveToward(world, v, room && !busy ? tx : wp.x, room && !busy ? ty : wp.y, Math.min(desired, 40), {});
    return;
  }
  driveToward(world, v, wp.x, wp.y, desired, { ignoreObstacles: panic });
}

// Is a vehicle running its siren coming up behind us (or straight at us down the same road)?
function sirenBehind(world, v) {
  for (const e of world.query(v.x, v.y, 460, K.VEH)) {
    if (e === v || !e.siren || !sameLevel(e.lz, v.lz)) continue;
    const sp = Math.hypot(e.vx, e.vy);
    if (sp < 60) continue;
    const ux = e.vx / sp, uy = e.vy / sp;
    const dx = v.x - e.x, dy = v.y - e.y;
    const ahead = dx * ux + dy * uy;
    const lateral = Math.abs(-dx * uy + dy * ux);
    if (ahead > 0 && ahead < 380 + sp * 0.4 && lateral < 90) return true;
  }
  return false;
}

// Rejoin the network on the nearest lane of our level, going the way the car faces (how a lost
// driver "gets themselves out" of a loop).
function replanFromHere(world, v) {
  const ai = v.ai;
  const net = world.map.net;
  const up = (v.lz || 0) > 0.5;
  const ne = nearestEdge(net, v.x, v.y, (e) => (up ? e.lvl === 1 || e.lvl === 'ramp' : e.lvl === 0));
  if (!ne) return;
  const e = ne.e;
  const tang = pointAt(e.pts, ne.s);
  const fwdOk = Math.cos(v.a) * tang.tx + Math.sin(v.a) * tang.ty >= 0;
  let from = fwdOk ? e.a : e.b;
  if (e.oneway) from = e.a;
  const s = from === e.a ? ne.s : e.len - ne.s;
  enterEdge(world, v, e.id, from, Math.min(ai.lane || 0, e.nl - 1), s + 40);
  ai.replans = (ai.replans || 0) + 1;
  if (ai.replans > 4) { v.ai = null; v.despawnable = true; } // hopeless: park it and let the cleanup take it
}

// Put a vehicle (already driven by an NPC) into traffic on the nearest lane, going the way it
// faces.
export function joinTraffic(world, v) {
  v.ai = { kind: 'traffic', lane: 0 };
  replanFromHere(world, v);
  if (v.ai) v.ai.replans = 0;
}

function passed(v, wp) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  return (wp.x - v.x) * c + (wp.y - v.y) * s < -10 && Math.hypot(wp.x - v.x, wp.y - v.y) < 90;
}

function manage(world) {
  let tc = 0;
  for (const v of world.entities.values()) if (v.kind === K.VEH && v.ai && v.ai.kind === 'traffic') tc++;
  world.trafficCount = tc;
  const anchors = [];
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) anchors.push(p.ped);
  const near = (x, y, r) => { for (const a of anchors) if ((a.x - x) ** 2 + (a.y - y) ** 2 < r * r) return true; return false; };
  // despawn
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH) continue;
    if (v.seats.some((s) => s && world.get(s)?.player)) continue;
    if (v.owner && !v.wreckAt) continue;
    const isTraffic = v.ai && v.ai.kind === 'traffic';
    const range = isTraffic ? 1800 : 1900;
    if (!v.despawnable || near(v.x, v.y, range) || inAnyView(world, v.x, v.y, 64)) continue;
    if (v.ai && v.ai.kind !== 'traffic') continue; // police/ems manage their own
    removeVehicle(world, v);
  }
  // parked cars + boats
  const spots = world.map.parking;
  world.parked ??= new Map();
  for (const [i, vid] of world.parked) { if (!world.get(vid)) world.parked.delete(i); }
  for (const a of anchors) {
    for (let i = 0; i < spots.length; i++) {
      const sp = spots[i];
      if (world.parked.has(i)) continue;
      if (hash2(i, 7, world.map.seed) > 0.7) continue;
      const d2 = (sp.x - a.x) ** 2 + (sp.y - a.y) ** 2;
      if (d2 > 1150 * 1150) continue;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) continue; // never pops in on someone's screen
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      const v = world.spawnVehicle(weighted(PARKED_MIX), sp.x, sp.y, sp.a + (sp.a === -Math.PI / 2 && hash2(i, 3, 1) < 0.5 ? Math.PI : 0), { parked: true });
      world.parked.set(i, v.id);
    }
    world.marinaParked ??= new Map();
    world.map.marina.forEach((sp, i) => {
      if (world.marinaParked.has(i) && world.get(world.marinaParked.get(i))) return;
      if ((sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) return;
      const fresh = world.time - (a.player?.joinedAt ?? -99) < 2 || world.time < 3 || world.time - (a.player?.teleportAt ?? -99) < 2;
      if (!fresh && inAnyView(world, sp.x, sp.y, 80)) return;
      const v = world.spawnVehicle(sp.kind || (i % 3 === 0 ? 'speedboat' : i % 3 === 1 ? 'jetski' : 'dinghy'), sp.x, sp.y, sp.a, { parked: true });
      world.marinaParked.set(i, v.id);
    });
  }
  // moving traffic: placed on a lane somewhere off screen, already rolling
  const net = world.map.net;
  if (!net) return;
  const night = world.clock.isNight;
  const target = night ? 10 : 16;
  for (const a of anchors) {
    let count = 0;
    for (const v of world.query(a.x, a.y, 1400, K.VEH)) if (v.ai && v.ai.kind === 'traffic') count++;
    if (count >= target || world.npcCount + world.trafficCount > world.npcBudget) continue;
    const cands = net.edges.filter((e) => {
      const bb = e.bb || (e.bb = bboxOf(e.pts));
      return bb.x1 > a.x - 1600 && bb.x0 < a.x + 1600 && bb.y1 > a.y - 1600 && bb.y0 < a.y + 1600 && e.len > 200;
    });
    if (!cands.length) continue;
    for (let tries = 0; tries < 10; tries++) {
      const e = cands[Math.floor(rng() * cands.length)];
      const from = e.oneway || rng() < 0.5 ? e.a : e.b;
      const lane = Math.floor(rng() * e.nl);
      const lp = lanePath(net, e, from, lane);
      const L = lp[lp.length - 1].s;
      if (L < 80) continue;
      const s = 20 + rng() * (L - 40);
      const p = pointAt(lp, s);
      if (Math.hypot(p.x - a.x, p.y - a.y) > 1500) continue;
      if (near(p.x, p.y, 300) || inAnyView(world, p.x, p.y, 140)) continue; // spawn off every screen and drive in
      const z = edgeZ(e, from, from === e.a ? s : e.len - s);
      if (z > 0.05 && z < 0.95) continue; // not halfway up a ramp
      if (world.query(p.x, p.y, 90, K.VEH).some((q) => sameLevel(q.lz, z))) continue;
      const model = weighted(e.kind === 'hwy' ? TRAFFIC_MIX.filter(([id]) => id !== 'bike') : TRAFFIC_MIX);
      const v = world.spawnVehicle(model, p.x, p.y, Math.atan2(p.ty, p.tx), {});
      v.lz = z;
      const sp0 = Math.min(CRUISE[e.kind] || 250, 300) * 0.6;
      v.vx = p.tx * sp0; v.vy = p.ty * sp0;
      const driver = spawnNpc(world, rng() < 0.15 ? 'executive' : 'casual', p.x, p.y, 'driver');
      driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id; driver.lz = z;
      v.ai = { kind: 'traffic' };
      enterEdge(world, v, e.id, from, lane, s + 30);
      world.trafficCount++;
      break;
    }
  }
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}

export function removeVehicle(world, v) {
  for (const sid of v.seats) {
    if (!sid) continue;
    const p = world.get(sid);
    if (p && p.npc) despawnNpc(world, p);
  }
  for (const cid of v.cargo) if (cid) { const c = world.get(cid); if (c) world.remove(c); }
  world.remove(v);
}

void measure;
