// NPC traffic (GDD §10): lane-following drivers on the road graph that obey red/green
// lights, keep distance, panic when attacked; parked cars and docked boats near players.
// Also exports the shared driving controller + route planner used by police and EMS.
import { K, T } from '../../shared/constants.js';
import { DIRS, lightState } from '../../shared/map.js';
import { angleDiff, clamp } from '../../shared/math.js';
import { TRAFFIC_MIX, PARKED_MIX } from '../../shared/vehicles.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { mulberry32, hash2 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';

const rng = mulberry32(4242);

function weighted(mix) {
  let total = 0;
  for (const [, w] of mix) total += w;
  let r = rng() * total;
  for (const [id, w] of mix) { r -= w; if (r <= 0) return id; }
  return mix[0][0];
}

const right = (d) => ({ x: -d.dy, y: d.dx });
// Lane offset (px from road center) for travel leaving node n in direction dir.
const laneOf = (n, dir) => n.lane[dir] ?? n.lane[DIRS[dir].opp] ?? 32;

function laneEntry(n, dir) { const d = DIRS[dir], r = right(d), l = laneOf(n, dir); return { x: n.x + d.dx * (n.half + 16) + r.x * l, y: n.y + d.dy * (n.half + 16) + r.y * l }; }
// stop line when arriving at n while travelling in direction dir
function stopPoint(n, dir) { const d = DIRS[dir], r = right(d), l = laneOf(n, d.opp); return { x: n.x - d.dx * (n.half + 22) + r.x * l, y: n.y - d.dy * (n.half + 22) + r.y * l }; }
function cornerPoint(n, dIn, dOut) {
  const a = DIRS[dIn], b = DIRS[dOut], ra = right(a), rb = right(b);
  const la = laneOf(n, a.opp), lb = laneOf(n, dOut);
  return { x: a.dx === 0 ? n.x + ra.x * la : n.x + rb.x * lb, y: a.dy === 0 ? n.y + ra.y * la : n.y + rb.y * lb };
}

// Waypoints through node `n` arriving with heading dIn and leaving on dOut.
function turnPoints(n, dIn, dOut) {
  const s = stopPoint(n, dIn), e = laneEntry(n, dOut);
  if (dIn === dOut) return [{ ...s, stop: true, node: n.id, axis: dIn }, e];
  const c = cornerPoint(n, dIn, dOut);
  const pts = [{ ...s, stop: true, node: n.id, axis: dIn }];
  for (const t of [0.35, 0.65]) {
    const u = 1 - t;
    pts.push({ x: u * u * s.x + 2 * u * t * c.x + t * t * e.x, y: u * u * s.y + 2 * u * t * c.y + t * t * e.y });
  }
  pts.push(e);
  return pts;
}

function nearestAnchor(world, x, y) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    if (!p.ped || p.ped.dead) continue;
    const d = (p.ped.x - x) ** 2 + (p.ped.y - y) ** 2;
    if (d < bd) { bd = d; best = p.ped; }
  }
  return best ? { a: best, d: Math.sqrt(bd) } : null;
}

function chooseNext(world, n, dIn) {
  const opts = Object.keys(n.links).filter((d) => d !== DIRS[dIn].opp);
  if (!opts.length) return DIRS[dIn].opp;
  // keep streets near players busy: drivers that wander far drift back toward the action
  const near = nearestAnchor(world, n.x, n.y);
  if (near && near.d > 650 && rng() < 0.7) {
    let best = null, bd = Infinity;
    for (const d of opts) {
      const m = world.map.nodes[n.links[d]];
      const dd = (m.x - near.a.x) ** 2 + (m.y - near.a.y) ** 2;
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) return best;
  }
  if (opts.includes(dIn) && rng() < 0.55) return dIn;
  return opts[Math.floor(rng() * opts.length)];
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
    const dx = e.x - v.x, dy = e.y - v.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const halfOther = e.kind === K.VEH ? e.def.W / 2 : 10;
    if (lx < 0 || lx > look + 40 || Math.abs(ly) > v.def.W / 2 + halfOther - 4) continue;
    const gap = lx - v.def.L / 2 - (e.kind === K.VEH ? e.def.L / 2 : 10) - 10;
    limit = Math.min(limit, Math.max(0, gap * 1.8));
  }
  return limit;
}

// BFS route over the road graph: returns list of world waypoints (right-hand lanes).
export function planRoute(world, fromX, fromY, toX, toY) {
  const m = world.map;
  const start = m.nearestNode(fromX, fromY), goal = m.nearestNode(toX, toY);
  if (!start || !goal) return [{ x: toX, y: toY }];
  const prev = new Map([[start.id, null]]);
  const q = [start.id];
  while (q.length) {
    const id = q.shift();
    if (id === goal.id) break;
    for (const [dir, nid] of Object.entries(m.nodes[id].links)) if (!prev.has(nid)) { prev.set(nid, { id, dir }); q.push(nid); }
  }
  const chain = [];
  let cur = goal.id;
  while (cur !== undefined && cur !== start.id) { const p = prev.get(cur); if (!p) break; chain.unshift({ id: cur, dir: p.dir }); cur = p.id; }
  const pts = [];
  let dIn = null;
  for (let i = 0; i < chain.length; i++) {
    const n = m.nodes[chain[i].id], d = chain[i].dir;
    const from = m.nodes[i === 0 ? start.id : chain[i - 1].id];
    if (dIn === null) pts.push(laneEntry(from, d));
    else if (dIn !== d) pts.push(cornerPoint(from, dIn, d));
    const st = stopPoint(n, d);
    pts.push({ x: st.x, y: st.y });
    dIn = d;
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
  const panic = ai.panicUntil && now < ai.panicUntil;
  if (!ai.pts || !ai.pts.length) extendRoute(world, v);
  let wp = ai.pts[0];
  const d = Math.hypot(wp.x - v.x, wp.y - v.y);
  // orbit guard: a waypoint inside the turning circle makes a car loop around it forever.
  // Count how far the car has turned since it last reached a waypoint; after ~1 full lap give
  // up on that point, and after ~2 re-plan from the nearest junction in the direction it faces.
  if (ai.lastA === undefined) ai.lastA = v.a;
  let da = v.a - ai.lastA;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  ai.lastA = v.a;
  ai.turned = (ai.turned || 0) + Math.abs(da);
  const beside = d < 50 && Math.abs(angleDiff(v.a, Math.atan2(wp.y - v.y, wp.x - v.x))) > 1.25;
  if (ai.turned > Math.PI * 3.6) { replanFromHere(world, v); ai.turned = 0; return; }
  if (d < 26 || passed(v, wp) || beside || ai.turned > Math.PI * 1.9) {
    ai.turned = 0;
    ai.pts.shift();
    if (wp.last) { ai.from = ai.to; ai.dir = ai.nextDir; ai.replans = 0; extendRoute(world, v); }
    if (!ai.pts.length) extendRoute(world, v);
    wp = ai.pts[0];
  }
  let desired = panic ? 480 : (v.model === 'bus' ? 200 : 255);
  const stop = ai.pts.find((p) => p.stop);
  if (stop && !panic) {
    const n = world.map.nodes[stop.node];
    const ls = lightState(n, t);
    const axisNS = stop.axis === 'N' || stop.axis === 'S';
    const st = axisNS ? ls.ns : ls.ew;
    const ds = Math.hypot(stop.x - v.x, stop.y - v.y);
    if (st === 'R' || (st === 'Y' && ds > 60)) desired = Math.min(desired, Math.max(0, (ds - 14) * 1.6));
    else if (ai.pts.indexOf(stop) === 0 && ai.turning) desired = Math.min(desired, 150);
  }
  if (ai.pts.length > 1 && ai.pts[0].stop && ai.nextDir !== ai.dir) desired = Math.min(desired, 170);
  if (!panic && (world.tick + v.id) % 4 === 0) ai.yieldUntil = sirenBehind(world, v) ? now + 1.5 : ai.yieldUntil;
  if (!panic && ai.yieldUntil && now < ai.yieldUntil) {
    // an emergency vehicle with its siren on is coming: ease over toward the curb and slow
    // right down. Only ever onto empty road - never up onto the pavement or into people.
    const c = Math.cos(v.a), sn = Math.sin(v.a);
    const rx = -sn, ry = c;
    const solidNear = (x, y) => {
      const k0x = Math.floor(x / 32), k0y = Math.floor(y / 32);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const arr = world.map.solidProps.get((k0y + dy) * world.map.w + k0x + dx);
        if (arr) for (const sp of arr) if (!sp.off && Math.hypot(sp.x - x, sp.y - y) < sp.r + 10) return true;
      }
      return false;
    };
    const curbOk = (x, y) => { const t = world.map.tileAtPx(x, y); return t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK || t === T.LOT || t === T.PLAZA; };
    // Slide right until the car's outer edge rides at most ~20 px up onto the kerb - and only
    // where that strip is clear of people, lamp posts, hydrants and walls.
    let shift = 0;
    const strip = (k) => { // the car's outer edge from its tail to 70 px past its nose
      for (let along = -v.def.L / 2; along <= v.def.L / 2 + 70; along += 14) {
        const ox = v.x + c * along + rx * (k + v.def.W / 2), oy = v.y + sn * along + ry * (k + v.def.W / 2);
        if (!curbOk(ox, oy) || solidNear(ox, oy)) return false;
      }
      return true;
    };
    for (let k = 4; k <= 26; k += 2) { if (!strip(k)) break; shift = k; }
    const room = shift >= 6;
    const tx = v.x + c * 50 + rx * shift, ty = v.y + sn * 50 + ry * shift;
    const busy = room && world.query(v.x + c * 40 + rx * (shift + v.def.W / 2), v.y + sn * 40 + ry * (shift + v.def.W / 2), 70, K.PED).some((e) => !e.dead && !e.vehId);
    driveToward(world, v, room && !busy ? tx : wp.x, room && !busy ? ty : wp.y, Math.min(desired, 40), {});
    return;
  }
  driveToward(world, v, wp.x, wp.y, desired, { ignoreObstacles: panic });
}

// Is a vehicle running its siren coming up behind us (or straight at us down the same road)?
function sirenBehind(world, v) {
  for (const e of world.query(v.x, v.y, 460, K.VEH)) {
    if (e === v || !e.siren) continue;
    const sp = Math.hypot(e.vx, e.vy);
    if (sp < 60) continue;
    const ux = e.vx / sp, uy = e.vy / sp;
    const dx = v.x - e.x, dy = v.y - e.y;
    const ahead = dx * ux + dy * uy;           // how far in front of the emergency vehicle we are
    const lateral = Math.abs(-dx * uy + dy * ux);
    if (ahead > 0 && ahead < 380 + sp * 0.4 && lateral < 90) return true;
  }
  return false;
}

// Re-join the road graph at the nearest junction, leaving in the link that best matches the
// car's heading (how a lost driver "gets themselves out" of a loop).
function replanFromHere(world, v) {
  const ai = v.ai;
  const n = world.map.nearestNode(v.x, v.y);
  if (!n) return;
  let best = null, bd = Infinity;
  for (const dir of Object.keys(n.links)) {
    const d = DIRS[dir];
    const diff = Math.abs(angleDiff(v.a, Math.atan2(d.dy, d.dx)));
    if (diff < bd) { bd = diff; best = dir; }
  }
  if (!best) return;
  ai.from = n.id; ai.dir = best; ai.pts = null;
  extendRoute(world, v);
  // skip the stop line behind us at that junction: start from the lane entry ahead
  const e = laneEntry(n, best);
  ai.pts.unshift(e);
  ai.replans = (ai.replans || 0) + 1;
  if (ai.replans > 4) { v.ai = null; v.despawnable = true; } // hopeless: park it and let the cleanup take it
}

function passed(v, wp) {
  const c = Math.cos(v.a), s = Math.sin(v.a);
  return (wp.x - v.x) * c + (wp.y - v.y) * s < -10 && Math.hypot(wp.x - v.x, wp.y - v.y) < 90;
}

function extendRoute(world, v) {
  const ai = v.ai;
  const m = world.map;
  const from = m.nodes[ai.from];
  const toId = from.links[ai.dir];
  if (toId === undefined) { ai.dir = Object.keys(from.links)[0]; return extendRoute(world, v); }
  ai.to = toId;
  const to = m.nodes[toId];
  ai.nextDir = chooseNext(world, to, ai.dir);
  const pts = turnPoints(to, ai.dir, ai.nextDir);
  pts[pts.length - 1].last = true;
  ai.turning = ai.nextDir !== ai.dir;
  ai.pts = pts;
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
    const range = isTraffic ? 1700 : 1900;
    if (!v.despawnable || near(v.x, v.y, range)) continue;
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
      if (d2 < 520 * 520 && !fresh) continue;
      if (world.npcCount + world.trafficCount > world.npcBudget) break;
      const v = world.spawnVehicle(weighted(PARKED_MIX), sp.x, sp.y, sp.a + (sp.a === -Math.PI / 2 && hash2(i, 3, 1) < 0.5 ? Math.PI : 0), { parked: true });
      world.parked.set(i, v.id);
    }
    world.marinaParked ??= new Map();
    world.map.marina.forEach((sp, i) => {
      if (world.marinaParked.has(i) && world.get(world.marinaParked.get(i))) return;
      if ((sp.x - a.x) ** 2 + (sp.y - a.y) ** 2 > 1100 * 1100) return;
      const v = world.spawnVehicle(sp.kind || (i % 3 === 0 ? 'speedboat' : i % 3 === 1 ? 'jetski' : 'dinghy'), sp.x, sp.y, sp.a, { parked: true });
      world.marinaParked.set(i, v.id);
    });
  }
  // moving traffic
  const night = world.clock.isNight;
  const target = night ? 9 : 14;
  for (const a of anchors) {
    let count = 0;
    for (const v of world.query(a.x, a.y, 1300, K.VEH)) if (v.ai && v.ai.kind === 'traffic') count++;
    if (count >= target || world.npcCount + world.trafficCount > world.npcBudget) continue;
    for (let tries = 0; tries < 6; tries++) {
      const nodes = world.map.nodes.filter((n) => (n.x - a.x) ** 2 + (n.y - a.y) ** 2 < 1500 * 1500);
      if (!nodes.length) break;
      const n = nodes[Math.floor(rng() * nodes.length)];
      const dirs = Object.keys(n.links);
      const dir = dirs[Math.floor(rng() * dirs.length)];
      const e = laneEntry(n, dir);
      const d = DIRS[dir];
      const along = 40 + rng() * 400;
      const x = e.x + d.dx * along, y = e.y + d.dy * along;
      if (near(x, y, 700)) continue;
      if (world.query(x, y, 90, K.VEH).length) continue;
      const model = weighted(TRAFFIC_MIX);
      const v = world.spawnVehicle(model, x, y, Math.atan2(d.dy, d.dx), {});
      v.vx = d.dx * 150; v.vy = d.dy * 150;
      const driver = spawnNpc(world, rng() < 0.15 ? 'executive' : 'casual', x, y, 'driver');
      driver.vehId = v.id; driver.seat = 0; v.seats[0] = driver.id;
      v.ai = { kind: 'traffic', from: n.id, dir, pts: null };
      world.trafficCount++;
      break;
    }
  }
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

