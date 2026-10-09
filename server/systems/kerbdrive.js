// Driving a service vehicle (an ambulance, a tow truck) to the kerb nearest something off the road, and away again
// out of sight. Shared by ems.js and tow.js.
//   kerbFor(world, x, y)      where to pull up for (x, y): the nearest point of a ground-level street, over on that
//                             side of the road - never one across water from it (a beach across the bay from the
//                             coast road), never a bridge unless (x, y) is on one; for someone inside a shop, the
//                             street outside its door
//   planTo(world, v, k)       a route there along the roads: to whichever end of the kerb's street is quicker, then
//                             along the street to the spot (never straight across a block or a park to it)
//   follow(world, v, speed)   drive the route: one plan, waypoints passed or reached are dropped, slower for corners,
//                             and never into the water (waterGuard)
//   exitNode(world, v)        a junction to leave by: well away from every player, on the same island
import { T } from '../../shared/constants.js';
import { lanePath, bbox } from '../../shared/roads.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { driveToward, planRoute } from './traffic.js';
import { walkInAt } from './npc.js';
import { doorKerb, cornerSpeed, segDist, trimBehind, halt } from './custody.js';

export { halt };
const WET = (t) => t === T.WATER || t === T.DEEP;
function wetBetween(m, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 24);
  for (let i = 1; i < n; i++) if (WET(m.tileAtPx(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))) return true;
  return false;
}

export function kerbFor(world, x, y) {
  const m = world.map;
  const wi = walkInAt(m, x, y);
  if (wi) { const k = doorKerb(world, wi); x = k.x; y = k.y; }
  const onBridge = m.tileAtPx(x, y) === T.BRIDGE;
  let best = null;
  for (const e of m.edges || []) {
    if (e.lvl !== 0 || (e.bridge && !onBridge)) continue;
    const bb = e.bb || (e.bb = bbox(e.pts)), lim = best ? best.score : 3000;
    if (x < bb.x0 - lim || x > bb.x1 + lim || y < bb.y0 - lim || y > bb.y1 + lim) continue;
    let s0 = 0;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (L * L)));
      const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(px - x, py - y);
      if (!best || d < best.score) {
        const score = d + (wetBetween(m, x, y, px, py) ? 900 : 0);   // (across the water from it: only if there's nothing else)
        if (!best || score < best.score) best = { score, e, x: px, y: py, tx: dx / L, ty: dy / L, s: s0 + L * t, d };
      }
      s0 += L;
    }
  }
  if (!best) return { x, y, e: null, s: 0 };
  // over on (x, y)'s side of the road, a car's half-width in from the kerb
  const nx = -best.ty, ny = best.tx, side = (x - best.x) * nx + (y - best.y) * ny;
  const off = Math.sign(side) * Math.max(0, Math.min(Math.abs(side), (best.e.hw || 24) - 20));
  return { x: best.x + nx * off, y: best.y + ny * off, e: best.e, s: best.s, a: Math.atan2(best.ty, best.tx) };
}

export function planTo(world, v, k) {
  const net = world.map.net, e = k.e;
  if (!e || !net) return trimBehind(planRoute(world, v.x, v.y, k.x, k.y), v);
  let best = null;
  for (const end of [e.a, e.b]) {
    const n = net.nodes[end];
    if (!n || n.lvl !== 0) continue;
    const r = planRoute(world, v.x, v.y, n.x, n.y);
    r.pop();   // (its last point is the junction itself: the street from it follows)
    const along = end === e.a ? k.s : e.len - k.s;
    let len = along, px = v.x, py = v.y;
    for (const q of r) { len += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
    len += Math.hypot(n.x - px, n.y - py);
    if (!best || len < best.len) best = { r, len, end, along };
  }
  if (!best) return trimBehind(planRoute(world, v.x, v.y, k.x, k.y), v);
  for (const q of lanePath(net, e, best.end, 0)) { if (q.s >= best.along - 40) break; best.r.push({ x: q.x, y: q.y }); }
  best.r.push({ x: k.x, y: k.y, final: true });
  return trimBehind(best.r, v);
}

// Drive v.ai.route at up to `speed` (slowing to a crawl for the last stretch to its end). True when it's there.
export function follow(world, v, speed, arriveAt = 34) {
  const ai = v.ai, r = ai.route;
  if (!r || !r.length) { halt(v); return true; }
  const reach = Math.max(60, Math.min(110, Math.hypot(v.vx, v.vy) * 0.25));
  while (r.length > 1) {
    const a = r[0], b = r[1], d = Math.hypot(a.x - v.x, a.y - v.y);
    const past = (v.x - a.x) * (b.x - a.x) + (v.y - a.y) * (b.y - a.y) > 0 && segDist(v.x, v.y, a, b) < 48;
    if (d < reach || past) ai.routePrev = r.shift(); else break;
  }
  const end = r[r.length - 1], left = r.length === 1 ? Math.hypot(end.x - v.x, end.y - v.y) : Infinity;
  if (left < arriveAt) { halt(v); return true; }
  const wp = r[0];
  driveToward(world, v, wp.x, wp.y, Math.min(cornerSpeed(v, r, speed), left < 320 ? 50 + left * 0.75 : Infinity), { round: left < 260 ? false : undefined });   // (nearly there: pull up behind whatever's stopped, no going round it)
  waterGuard(world, v);
  return false;
}

// Never on into the water (a beach's edge, the end of a slipway, reversing out of a jam): brake instead. True if it braked.
export function waterGuard(world, v) {
  if ((v.lz || 0) > 0.3 || v.def.kind === 'boat') return false;
  const fwd = vehForwardSpeed(v), back = v.input.throttle < -0.1 && fwd < 30;
  const look = v.def.L / 2 + 16 + Math.abs(fwd) * 0.45, sgn = back ? -1 : 1, c = Math.cos(v.a), s = Math.sin(v.a);
  const m = world.map;
  for (const k of [0.5, 1]) if (WET(m.tileAtPx(v.x + c * look * k * sgn, v.y + s * look * k * sgn))) {
    v.input = { throttle: fwd > 6 ? -1 : fwd < -6 ? 1 : 0, steer: v.input.steer, hb: Math.abs(fwd) < 40 };
    if (v.ai) { v.ai.ctl = null; v.ai.wet = (v.ai.wet || 0) + 1; }   // (no re-trim back toward it between the sub-steps)
    return true;
  }
  return false;
}

// A junction to drive off to: on the vehicle's island, 1000-2600 px away, the one furthest from every player.
export function exitNode(world, v) {
  const m = world.map, zone = m.zoneAt(v.x, v.y);
  let best = null, bs = -1;
  for (const n of m.nodes) {
    if (n.lvl !== 0 || m.zoneAt(n.x, n.y) !== zone) continue;
    const d = Math.hypot(n.x - v.x, n.y - v.y);
    if (d < 1000 || d > 2600) continue;
    let near = Infinity;
    for (const p of world.players.values()) if (p.ped) near = Math.min(near, Math.hypot(p.ped.x - n.x, p.ped.y - n.y));
    if (near > bs) { bs = near; best = n; }
  }
  return best;
}

// Has v been getting nearer to (x, y)? ai.bestD / ai.bestAt track it; returns the seconds since it last got 20 px nearer.
export function sinceProgress(world, v, x, y) {
  const ai = v.ai, d = Math.hypot(x - v.x, y - v.y);
  if (ai.bestD === undefined || d < ai.bestD - 20) { ai.bestD = d; ai.bestAt = world.time; }
  return world.time - ai.bestAt;
}
