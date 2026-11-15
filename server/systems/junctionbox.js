// The junction box (the owner, 11-14: "Looks like traffic jams are still happening" - a city four-way knotted solid: a
// box truck, a delivery van, a dump truck, a long bus and cars wedged across it at all angles, nobody able to move).
// What had let it happen (test/gridlocksim.js, the four-way harness): a driver waiting at the line went in anyway after
// 6 s whatever was crossing the box, and after 20 s into a road backed up past the junction; a long truck swung its
// turn across lanes others had just driven into; and once a few were wedged in the box nobody was in a "ring" the
// breakRing looked for (each stopped for a different one), nobody had room behind to back into, and nothing cleared it
// while anyone watched. Now, at every ground junction of three roads or more:
//  - the vehicles in the box are known (enterBox: as each one crosses its line - where from, where to, how it turns,
//    whether it's long), and one only goes in when nothing in there crosses its way (conflict), never "anyway";
//  - who goes first among those waiting is who's waited longest (an all-way stop's order: the waiters, ready to go - their
//    road out has room - in the order they came up to the line): nobody's shut out for good, and nobody pushes in;
//  - a long vehicle turning (LONG_L and over: the trucks, a bus) sweeps the lanes either side of its way: it waits for the
//    box to be clear of anyone it could catch, and nobody else goes in while it's turning;
//  - knots (untie): anything stopped in a box KNOT_S with something in its way - one goes first (the leader: the one with
//    the fewest in its way, all of which can back off), along its own way or, realigned, out by whichever road it can get
//    to from how it faces now; what stands in its way backs straight off out of it (no room behind: the one queued
//    behind it backs off first), the rest in the box hold still till it's out, then the next.
// (The last resort, unchanged: a vehicle stood still a long while is cleared away once nobody's looking - traffic.js
// manage. And a road out that's backed up: traffic.js junctionClear waits for room - a car's length past the mouth for
// it and for each one in the box already bound that way - and after EXIT_SWAP_S takes another road out with room.)
import { K, T } from '../../shared/constants.js';
import { lanePath, turnPath, exitsFrom } from '../../shared/roads.js';
import { angleDiff } from '../../shared/math.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { clearance } from './roadends.js';
import { enterEdge } from './traffic.js';
import { obbVsObb } from '../../shared/math.js';

export const LONG_L = 120;         // px: a long vehicle (a box truck 149, a dump truck 139, a bus 164; a van 102 is not)
export const KNOT_S = 4;           // s stopped in a box, something in its way: a knot to untie
const WAIT_STALE = 0.4;            // s: a waiter not heard from in this long has gone (or isn't at its line any more)

// Junctions that have a box: on the ground, three roads or more, not the highway's merges
export const boxed = (n) => !!n && n.lvl === 0 && !n.merge && n.edges.length >= 3;
// how far the box reaches from the junction's middle: to the furthest mouth (where the lanes stop)
export function boxR(n) {
  if (n._boxR) return n._boxR;
  let r = n.half || 40;
  for (const id of n.edges) r = Math.max(r, n.trim[id] || 0);
  return (n._boxR = r + 6);
}
function boxOf(world, nid) {
  const B = (world.boxes ??= new Map());
  let b = B.get(nid);
  if (!b) B.set(nid, (b = { occ: new Map(), wait: new Map() }));
  return b;
}
const cls = (turn) => (turn > 0.5 ? 'R' : turn < -0.5 ? 'L' : 'S');   // (screen angles: + is clockwise, a right turn)
// Do two ways through junction n cross (or meet)? A way: { in, out, turn, long } (the road in, the road out).
export function conflict(a, b, n) {
  if (a.in === b.in) return false;          // (one behind the other off the same road: the car in front, as on any road)
  if (a.out === b.out) return true;         // (both into the same road)
  const ca = cls(a.turn), cb = cls(b.turn);
  if ((a.long && ca !== 'S') || (b.long && cb !== 'S')) return true;   // (a long one turning sweeps the lanes either side)
  if (ca === 'R' || cb === 'R') return false;   // (a right turn keeps to its corner: it only meets what's going its way)
  const opp = Math.abs(angleDiff(n.dirs[a.in] ?? 0, n.dirs[b.in] ?? Math.PI)) > 2.4;
  if (opp) return !(ca === 'S' && cb === 'S');   // (from facing roads: straight past each other; a left across the other's way, no - nor two lefts at once: in a box a lane wide each way they meet nose to nose)
  return true;                              // (from roads at an angle: straight on or left, they cross)
}

// v has crossed its line into junction n's box, on its way from road `inEdge` to `nx` (traffic.js crossJunction)
export function enterBox(world, v, n, inEdge, nx) {
  if (!boxed(n) || !nx || !v.ai) return;
  const b = boxOf(world, n.id);
  b.occ.set(v.id, { in: inEdge, out: nx.edge, turn: nx.turn, long: v.def.L >= LONG_L, at: world.time });
  b.wait.delete(v.id);
  v.ai.boxNode = n.id;
}
// Is q (in the box on its way out by road o.out) already out of where the ways cross - its tail past the cross street,
// lined up with its lane: only what's going its way is held up by it now (one stopped just past the mouth, its queue
// backed up to there, held up the whole junction)
function pastCrossing(world, n, q, o) {
  const out = n.dirs[o.out];
  if (out === undefined || Math.abs(angleDiff(q.a, out)) > 0.35) return false;
  let hw = 40;
  for (const id of n.edges) if (id !== o.out) hw = Math.max(hw, world.map.net.edges[id].hw || 40);
  return (q.x - n.x) * Math.cos(out) + (q.y - n.y) * Math.sin(out) - q.def.L / 2 > hw + 4;
}
// What's in n's box now (the map of them; those gone out of it, or off on other business, dropped)
export function occupants(world, n) {
  const b = world.boxes && world.boxes.get(n.id);
  if (!b) return null;
  const R = boxR(n), now = world.time;
  for (const [id, o] of b.occ) {
    const v = world.get(id);
    const inside = v && v.ai && v.ai.boxNode === n.id && Math.hypot(v.x - n.x, v.y - n.y) < R + v.def.L / 2 + 8 && now - o.at < 90;
    if (!inside) { b.occ.delete(id); if (v && v.ai && v.ai.boxNode === n.id) v.ai.boxNode = undefined; }
  }
  return b.occ;
}

// May v, waiting at its line on road `inEdge` (ready: its road out has room), go into n's box now on its way to nx?
// Not while anything in there crosses its way, nor while someone who came up to their line before it - and is ready -
// would cross its way.
export function boxFree(world, v, n, inEdge, nx, ready) {
  const b = boxOf(world, n.id), now = world.time, ai = v.ai;
  const me = { in: inEdge, out: nx.edge, turn: nx.turn, long: v.def.L >= LONG_L };
  const w0 = b.wait.get(v.id);
  b.wait.set(v.id, { ...me, at: ai.waitAt, seen: now, ready: ready ? now : (w0 ? w0.ready : -1e9) });
  if (!ready) return false;
  for (const [id, o] of occupants(world, n)) if (id !== v.id && conflict(me, o, n) && (o.out === me.out || !pastCrossing(world, n, world.get(id), o))) return false;
  for (const [id, q] of b.wait) {
    if (id === v.id) continue;
    if (now - q.seen > WAIT_STALE) { b.wait.delete(id); continue; }
    if (now - q.ready > WAIT_STALE) continue;   // (held for room on its own way out: not holding anyone else up)
    const first = q.at < ai.waitAt || (q.at === ai.waitAt && id < v.id);   // (one order for everyone: who came up first, then the lower id)
    if (first && conflict(me, q, n)) return false;
  }
  return true;
}
// The safety valve: v waiting at its line a long while (the box's books say no - one in there across its way stuck
// behind an ambulance at work, a police car that pulled up in the corner): is its whole way through - from where it
// stands across the box and its own length into its road out - clear of everything, right now? Then it may go.
export const PATH_WAIT_S = 12;
export function pathClear(world, v, n, inEdge, nx) {
  const net = world.map.net, e = net.edges[inEdge], ai = v.ai;
  const a = lanePath(net, e, ai.from, Math.min(ai.lane || 0, (e.nl || 1) - 1)), b = lanePath(net, net.edges[nx.edge], n.id, 0);
  if (a.length < 2 || b.length < 2) return false;
  const p0 = a[a.length - 1], q0 = a[a.length - 2], l0 = Math.hypot(p0.x - q0.x, p0.y - q0.y) || 1, p1 = b[0], l1 = Math.hypot(b[1].x - p1.x, b[1].y - p1.y) || 1;
  const pts = [{ x: p0.x, y: p0.y }, ...turnPath(p0, { x: (p0.x - q0.x) / l0, y: (p0.y - q0.y) / l0 }, p1, { x: (b[1].x - p1.x) / l1, y: (b[1].y - p1.y) / l1 }, 6), { x: p1.x, y: p1.y }];
  for (let i = 1; i < b.length && b[i].s < v.def.L + 40; i++) pts.push({ x: b[i].x, y: b[i].y });
  const way = sweep(v.x, v.y, pts, Math.hypot(p0.x - v.x, p0.y - v.y) + boxR(n) * 2 + v.def.L + 40);
  for (const q of world.query(n.x, n.y, boxR(n) + v.def.L + 120, K.VEH)) {
    if (q === v || !sameLevel(q.lz, v.lz) || (q.alt || 0) > 40) continue;
    if (hitsWay(way, v, q)) return false;
  }
  return true;
}

// ---- knots -----------------------------------------------------------------------------------------------------
// A box with something in it stopped KNOT_S, something in its way (every half second: traffic.js update): one of them
// is let go first - the leader - along its own way or, realigned, out by another road it can get to from how it faces
// now; whatever stands in its way through the box backs straight off out of it, as far as it takes and no further (one
// with no room behind it gets it from the car queued behind it, which backs off first). The others in the box hold
// still until the leader is out (givingWay), so nobody nips into the room made, then the next one goes. The leader: the
// one with the fewest in its way that can all be moved (none that can't - a player's car, a wreck, an ambulance at
// work), the nearest out of the box among equals. No way out for anyone as things stand: some room is made (shake).
const LEAD_S = 9;          // s a leader has to get out before another is chosen
const LEAD_STALL_S = 2.5;  // s a leader stands still with nothing to be done about it (x2) before another is chosen
function sweep(x, y, pts, len) {   // the poses along a way ahead from (x, y), every 12 px for len px
  const out = [];
  let px = x, py = y, left = len;
  for (const q of pts.slice(0, 12)) {
    const d = Math.hypot(q.x - px, q.y - py);
    if (d < 1) continue;
    const a = Math.atan2(q.y - py, q.x - px);
    for (let s = 12; s <= d && left > 0; s += 12, left -= 12) out.push({ x: px + (q.x - px) * s / d, y: py + (q.y - py) * s / d, a });
    px = q.x; py = q.y;
    if (left <= 0) break;
  }
  return out;
}
const hitsWay = (way, v, b, bx = b.x, by = b.y) => way.some((p) => obbVsObb(p.x, p.y, p.a, v.def.L / 2 + 4, v.def.W / 2, bx, by, b.a, b.def.L / 2 + 1, b.def.W / 2 + 1));
const movable = (world, b) => b.ai && b.ai.kind === 'traffic' && !b.ai.turn && !b.wreckAt && !b.dead && b.seats[0] && world.get(b.seats[0])?.npc;
// the one right behind b (queued at its line), if any
function behindOf(world, b) {
  const c = Math.cos(b.a), s = Math.sin(b.a);
  let best = null, bd = Infinity;
  for (const f of world.query(b.x - c * b.def.L, b.y - s * b.def.L, b.def.L + 60, K.VEH)) {
    if (f === b || !sameLevel(f.lz, b.lz)) continue;
    const dx = f.x - b.x, dy = f.y - b.y, lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (lx > 0 || Math.abs(ly) > (b.def.W + f.def.W) / 2) continue;
    const gap = -lx - b.def.L / 2 - f.def.L / 2;
    if (gap < bd) { bd = gap; best = f; }
  }
  return best;
}
const backTime = (d) => Math.min(2.4, 0.3 + Math.sqrt(d / 55));   // (s backing from a standstill to cover d px, braking included)
// how far v can back straight up on the road (or the pavement: never onto the grass or into a building)
const OPEN_BACK = new Set([T.ROAD, T.BRIDGE, T.LOT, T.SIDEWALK]);
const roomBack = (world, v, look) => clearance(world, v, -1, 0, OPEN_BACK, look).free;
// The way from where w stands now into road o out of n (a smooth turn onto its kerb lane, then on along it): its
// waypoints, or null if it can't get there going forward from how it faces.
function wayTo(world, n, w, o) {
  const net = world.map.net, lp = lanePath(net, net.edges[o.edge], n.id, 0);
  if (lp.length < 2) return null;
  const p1 = lp[0], l1 = Math.hypot(lp[1].x - p1.x, lp[1].y - p1.y) || 1, d1 = { x: (lp[1].x - p1.x) / l1, y: (lp[1].y - p1.y) / l1 };
  if (Math.abs(angleDiff(w.a, Math.atan2(p1.y - w.y, p1.x - w.x))) > 1.6 || Math.hypot(p1.x - w.x, p1.y - w.y) < 20) return null;
  const pts = turnPath({ x: w.x, y: w.y }, { x: Math.cos(w.a), y: Math.sin(w.a) }, p1, d1, 6).map((p) => ({ x: p.x, y: p.y }));
  pts.push({ x: p1.x, y: p1.y });
  for (let i = 1; i < lp.length && lp[i].s < 200; i++) pts.push({ x: lp[i].x, y: lp[i].y });
  return pts;
}
export function untie(world) {
  if (!world.boxes) return;
  const now = world.time, net = world.map.net;
  for (const [nid, b] of world.boxes) {
    if (!b.occ.size) { if (!b.wait.size) world.boxes.delete(nid); b.lead = null; continue; }
    const n = net.nodes[nid], occ = occupants(world, n);
    let knot = false;
    for (const id of occ.keys()) {
      const v = world.get(id), ai = v.ai;
      if (Math.abs(vehForwardSpeed(v)) > 10 || ai.reverseUntil > now) { ai.boxStill = undefined; continue; }
      ai.boxStill ??= now;
      if (now - ai.boxStill >= KNOT_S && v._blk) knot = true;
    }
    const L = b.lead, lv = L && world.get(L.id);
    if (lv && occ.has(L.id) && now - L.at < LEAD_S) {
      clearFor(world, n, lv);
      if (Math.abs(vehForwardSpeed(lv)) > 12) L.moved = now;
      const stall = now - Math.max(L.at, L.moved ?? -1e9), making = [...world.query(n.x, n.y, boxR(n) + 260, K.VEH)].some((q) => q.ai && q.ai.reverseUntil > now);
      if (making || stall < 0.75) continue;   // (on its way, or the way being made)
      // stopped for something after all (it moved into the way; or it's what the bonnet's up against): that backs off
      if (stall < LEAD_STALL_S * 2 && clearWay(world, n, lv)) continue;
      if (stall < LEAD_STALL_S * 2) continue;
      (b.led ??= new Map()).set(L.id, now);   // (getting nowhere: another goes first)
    } else if (L) { b.lead = null; (b.led ??= new Map()).set(L.id, now); }
    if (!knot && !b.lead) continue;
    const plan = leadPlan(world, n, occ, b);
    if (!plan) { shake(world, n, occ, b); continue; }
    if (!b.lead || b.lead.id !== plan.w.id) b.lead = { id: plan.w.id, at: now };
    else b.lead.at = now;
    for (const id of occ.keys()) if (id !== plan.w.id) { const q = world.get(id); if (q.ai && Math.hypot(q.vx, q.vy) < 25) { q.ai.giveWayTo = plan.w.id; q.ai.giveWayUntil = now + LEAD_S; } }
    plan.w.ai.giveWayUntil = 0; plan.w.ai.boxStill = undefined;
    if (plan.o) realign(world, n, plan.w, plan.o, plan.pts, occ);
    clearFor(world, n, plan.w);
    for (const [q, d] of plan.backs) {
      q.ai.reverseUntil = now + backTime(d); q.ai.backStraight = q.ai.reverseUntil; q.ai.stuck = 0; q.ai.ringAt = undefined; q.ai.boxStill = undefined;
      if (!occ.has(q.id)) { q.ai.giveWayTo = plan.w.id; q.ai.giveWayUntil = now + LEAD_S; q.ai.giveWayNode = nid; }
    }
    world.knotsUntied = (world.knotsUntied || 0) + (plan.backs.length || plan.o ? 1 : 0);
  }
}
// Who goes first, and who backs off for it how far: { w, backs: [[vehicle, px]] } (the backs can be the queue behind one
// in the way, when it has no room: then that one's moved the next time round)
function leadPlan(world, n, occ, b) {
  const R = boxR(n), now = world.time;
  let best = null;
  for (const [id, mv] of occ) {
    const w = world.get(id);
    if (!movable(world, w) || w.ai.parkIt) continue;
    // its own way on, or (realigned) any other road out it can get to from how it faces now (not a bus or a taxi on
    // its route)
    const opts = [{ o: null, pts: w.ai.pts || [] }];
    if (!w.ai.route) for (const o of exitsFrom(world.map.net, n, mv.in)) if (o.edge !== mv.out && o.edge !== mv.in) { const pts = wayTo(world, n, w, o); if (pts) opts.push({ o, pts }); }
    for (const op of opts) {
    const way = sweep(w.x, w.y, op.pts, R * 2 + w.def.L);
    if (!way.length) continue;
    const backs = [];
    let ok = true, blocked = 0;
    for (const q of world.query(n.x, n.y, R + 260, K.VEH)) {
      if (q === w || !sameLevel(q.lz, w.lz) || (q.alt || 0) > 40 || Math.hypot(q.vx, q.vy) > 40 || !hitsWay(way, w, q)) continue;
      blocked++;
      if (!movable(world, q)) { ok = false; break; }
      // how far back it must go to be out of the way
      const c = Math.cos(q.a), s = Math.sin(q.a);
      let need = 0;
      for (let d = 16; d <= 200; d += 8) if (!hitsWay(way, w, q, q.x - c * d, q.y - s * d)) { need = d + 6; break; }
      if (!need) { ok = false; break; }
      const room = roomBack(world, q, need + 8);
      if (room >= need) { backs.push([q, need]); continue; }
      const f = behindOf(world, q);   // (no room: the one behind it backs off first)
      if (!f || !movable(world, f)) { ok = false; break; }
      const more = need - room + 14, fr = roomBack(world, f, more + 8);
      if (fr < more) { ok = false; break; }
      backs.push([f, more]); backs.partial = true;
    }
    if (!ok) continue;
    const score = blocked * 10 + (backs.partial ? 5 : 0) + (op.o ? 2 : 0) + (b.led && now - (b.led.get(w.id) ?? -1e9) < 20 ? 30 : 0) - (Math.hypot(w.x - n.x, w.y - n.y) / R);
    if (!best || score < best.score) best = { w, backs, score, o: op.o, pts: op.pts };
    }
  }
  return best;
}
// What the leader needn't brake for: anything near that isn't on its way through (traffic.js obstacleSpeed looks
// straight ahead of the bonnet - askew in the box, that's often at a car it's about to turn away from, and stopped there
// it never would)
function clearFor(world, n, w) {
  const way = sweep(w.x, w.y, w.ai.pts || [], boxR(n) * 2 + w.def.L), ig = new Set();
  for (const q of world.query(w.x, w.y, w.def.L + 160, K.VEH)) if (q !== w && !hitsWay(way, w, q)) ig.add(q.id);
  w.ai.knotIgnore = ig; w.ai.knotIgnoreUntil = world.time + 0.8;
}
// No way out for anyone as things stand (each one's way blocked by more than backing off would clear): make some room -
// the one stuck in the box with the most room behind it backs off as far as it can (straight back, its nose toward its
// way the next time round), else the one queued behind one of them; each once in SHAKE_S at most.
const SHAKE_S = 6;
function shake(world, n, occ, b) {
  const now = world.time;
  b.shook ??= new Map();
  let best = null, br = 23;
  for (const id of occ.keys()) {
    const q = world.get(id);
    if (!movable(world, q) || q.ai.parkIt || Math.abs(vehForwardSpeed(q)) > 10 || now - (b.shook.get(id) ?? -1e9) < SHAKE_S) continue;
    const r = roomBack(world, q, 90);
    if (r > br) { br = r; best = q; }
  }
  if (!best) for (const id of occ.keys()) {
    const f = behindOf(world, world.get(id));
    if (!f || occ.has(f.id) || !movable(world, f) || Math.hypot(f.vx, f.vy) > 10 || now - (b.shook.get(f.id) ?? -1e9) < SHAKE_S) continue;
    const r = roomBack(world, f, 90);
    if (r > br) { br = r; best = f; }
  }
  if (!best) return;
  b.shook.set(best.id, now);
  const d = Math.min(br - 4, 80);
  best.ai.reverseUntil = now + backTime(d); best.ai.backStraight = best.ai.reverseUntil; best.ai.stuck = 0; best.ai.ringAt = undefined; best.ai.boxStill = undefined;
  world.knotsUntied = (world.knotsUntied || 0) + 1; world.knotShakes = (world.knotShakes || 0) + 1;
}
// The leader stopped for something on its way (v._blk: traffic.js obstacleSpeed): that one backs off as far as it takes
// to be out of it (or 48 px, if backing doesn't get it clear), or the one behind it does first. True if one did.
function clearWay(world, n, w) {
  const q = w._blk && world.get(w._blk), now = world.time;
  if (!q || !movable(world, q) || (w.ai.knotIgnore && w.ai.knotIgnore.has(q.id))) return false;
  const way = sweep(w.x, w.y, w.ai.pts || [], boxR(n) * 2 + w.def.L), c = Math.cos(q.a), s = Math.sin(q.a);
  let need = 48;
  for (let d = 16; d <= 200; d += 8) if (!hitsWay(way, w, q, q.x - c * d, q.y - s * d)) { need = d + 6; break; }
  let who = q, d = Math.min(need, roomBack(world, q, need + 8));
  if (d < 20) {
    const f = behindOf(world, q);
    if (!f || !movable(world, f)) return false;
    who = f; d = Math.min(need - d + 14, roomBack(world, f, need + 22));
    if (d < 20) return false;
  }
  who.ai.reverseUntil = now + backTime(d); who.ai.backStraight = who.ai.reverseUntil; who.ai.stuck = 0; who.ai.ringAt = undefined; who.ai.boxStill = undefined;
  who.ai.giveWayTo = w.id; who.ai.giveWayUntil = now + LEAD_S; who.ai.giveWayNode = n.id;
  world.knotsUntied = (world.knotsUntied || 0) + 1;
  return true;
}
// The leader takes the road out it was given (realigned: another than it meant to): its waypoints from where it stands
function realign(world, n, w, o, pts, occ) {
  const ai = w.ai;
  enterEdge(world, w, o.edge, n.id, 0, 0);
  ai.pts.unshift(...pts.slice(0, 6));   // (the turn onto the lane's start; enterEdge has queued the lane on from there)
  ai.lastWp = null; ai.turned = 0;
  const mv = occ.get(w.id);
  if (mv) { mv.out = o.edge; mv.turn = o.turn; }
  world.realigned = (world.realigned || 0) + 1;
}
// Is v holding still for the knot's leader to get out of the box? (traffic.js steerTraffic: it holds.)
export function givingWay(world, v) {
  const ai = v.ai, now = world.time;
  if (!(ai.giveWayUntil > now) || ai.reverseUntil > now) return false;
  const nid = ai.boxNode ?? ai.giveWayNode, b = nid !== undefined && world.boxes && world.boxes.get(nid);
  const lead = b && b.lead && b.lead.id === ai.giveWayTo && world.get(b.lead.id);
  if (!lead || !b.occ.has(lead.id)) { ai.giveWayUntil = 0; ai.giveWayNode = undefined; return false; }
  return true;
}
