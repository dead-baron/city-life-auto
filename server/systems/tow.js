// The city's tow service (task #314): tow trucks clear burnt-out wrecks, broken-down or jammed cars and abandoned ones
// that block a lane. A truck comes from out of sight (kerbdrive.js) and tows it off out of sight, where both are gone.
// Backing up to it (task #414, the owner: "Tow trucks should back up to a vehicle that needs towing if possible so it
// touches the vehicle with the back of its truck and then pulls it up and tows it away from there"): the truck comes
// along the vehicle's lane, goes round it on the side with room and pulls in ahead of it, lined up with it (backPlan),
// then reverses - steering its tail onto the vehicle's line - until its tail touches the vehicle's nose (or its tail, if
// it's facing the other way: whichever end is ahead in the lane). It works the winch, the hook takes the weight and the
// vehicle rides behind it with that end up on the wheel lift (v.towEnd: the wire's extra byte, so the clients draw it
// tilted - art v2 actors.js renderCompact opt.lift, the classic view main.js drawVehicleEnt). Where there's no room for
// that (the street ends just ahead, a wall or another vehicle in the way, the vehicle across the lane, or the truck held
// up getting round it), it does what it always did: pulls up just ahead and winches the vehicle round onto the hook.
//
// A vehicle a player has driven is never towed unless it's left in the street, untouched by any player for
// TOW_IDLE_S (5 minutes) and blocking traffic (in a lane of the carriageway). Its owner gets a phone message: their own
// car (out of their garage) is back in the garage for TOW_FEE; a car they took is just gone.
// Like any vehicle a tow truck can be stolen: the driver's seat taken, the hook lets go and it's anyone's truck.
import { K, T } from '../../shared/constants.js';
import { TOW_WRECK_S, TOW_STUCK_S, TOW_IDLE_S, TOW_FEE } from '../../shared/rules.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { lanePath } from '../../shared/roads.js';
import { project, pointAt } from '../../shared/geom.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import { sameLevel } from '../../shared/levels.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import { kerbFor, planTo, follow, halt, exitNode, sinceProgress } from './kerbdrive.js';
import { trimBehind } from './custody.js';
import { planRoute } from './traffic.js';
import { store } from '../store.js';

const MAX_TRUCKS = 2;
const HOOK_S = 3.2;            // working the winch
const rng = mulberry32(3140);
// backing up to it
const TL = VEHICLES.towtruck.L, TW = VEHICLES.towtruck.W;
const BACK_ROOMS = [160, 120, 90];   // px: the truck pulls in this far ahead of the vehicle's end to back up from (less where the street ends sooner)
const PASS_GAP = 22;           // px between the two going round it
const BACK_SPEED = 60;         // px/s reversing (slower as it closes)
const TOUCH = 3;               // px: its tail this close - touching
const BACK_KE = 1.2, BACK_GAIN = 1.4;   // reversing: how hard it steers back onto the line from the side, and the wheel for the error
const BACK_STALL_S = 6;        // no nearer for this long backing up: hooked from where it is, winched round (the old way)
const ROUND_STALL_S = 9;       // no nearer for this long getting round it: the old way

// In a lane of a street (not pulled over into a parking bay, not on a lot, the pavement or the grass)?
export function blocking(world, v) {
  if ((v.lz || 0) > 0.3) return false;
  const m = world.map, t = m.tileAtPx(v.x, v.y);
  if (t !== T.ROAD && t !== T.BRIDGE) return false;
  const c = v._blocking;
  if (c && Math.abs(c.x - v.x) < 4 && Math.abs(c.y - v.y) < 4) return c.r;   // (worked out once while it stands there)
  const k = kerbFor(world, v.x, v.y);
  const r = !!k.e && (Math.hypot(k.x - v.x, k.y - v.y) < 6 || distToLine(k.e, v.x, v.y) < (k.e.hw || 24) - 10);
  v._blocking = { x: v.x, y: v.y, r };
  return r;
}
function distToLine(e, x, y) {
  let bd = Infinity;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    bd = Math.min(bd, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return bd;
}

const playerIn = (world, v) => v.seats.some((s) => s && world.get(s)?.player);

// Why a vehicle should be towed now (or null): 'wreck', 'stuck' (an NPC car broken down or jammed), 'left' (a player's)
export function towReason(world, v, now = world.time) {
  if (v.kind !== K.VEH || v.def.kind !== 'car' || v.towedBy || v.towCall || v.ai && v.ai.kind === 'tow' || v.fly || v.onDeck || v.parked) return null;
  if (playerIn(world, v) || (v.ai && v.ai.kind !== 'traffic')) return null;   // (someone in it; police, ambulances, scripted)
  if (v.wreckAt) return now - v.wreckAt > TOW_WRECK_S && !v.seats.some((s) => s) ? 'wreck' : null;
  if (v.byPlayer || v.owner) return now - (v.touchAt || 0) >= TOW_IDLE_S && Math.hypot(v.vx, v.vy) < 5 && blocking(world, v) ? 'left' : null;
  // (an NPC car stopped in the road: traffic.js manage keeps the clock - v.stillSince - for its own clean-up out of sight)
  if (v.stillSince === undefined || now - v.stillSince < TOW_STUCK_S || v.seats.some((s) => s && !world.get(s)?.npc)) return null;
  return blocking(world, v) ? 'stuck' : null;
}

export function update(world, dt) {
  const now = world.time;
  world.tows ??= new Set();
  // who's touched what: a player in a vehicle (or right beside it) - it's theirs to come back to for 5 minutes
  const near = world.tick % 10 === 4;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead) continue;
    if (ped.vehId) { const v = world.get(ped.vehId); if (v) { v.touchAt = now; v.byPlayer = true; } continue; }
    if (near) for (const v of world.query(ped.x, ped.y, 70, K.VEH)) if (v.byPlayer || v.owner) v.touchAt = now;
  }
  if (world.tick % 20 === 7 && world.tows.size < MAX_TRUCKS) dispatch(world, now);
  for (const id of [...world.tows]) {
    const t = world.get(id);
    if (!t) { world.tows.delete(id); continue; }
    runTruck(world, t, dt, now);
  }
  after(world);
}

function dispatch(world, now) {
  let best = null, bd = Infinity;
  for (const p of world.players.values()) {
    if (!p.ped) continue;
    for (const v of world.query(p.ped.x, p.ped.y, 1400, K.VEH)) {
      const why = towReason(world, v, now);
      if (!why) continue;
      const d = Math.hypot(v.x - p.ped.x, v.y - p.ped.y);
      if (d < bd) { bd = d; best = { v, why }; }
    }
  }
  if (best) send(world, best.v, best.why);
}

// Send a truck for v: from a junction out of everyone's sight on the same island. The truck or null.
export function send(world, v, why = 'wreck') {
  world.tows ??= new Set();
  const m = world.map, now = world.time, zone = m.zoneAt(v.x, v.y);
  let cands = [];
  for (const [lo, hi] of [[700, 1600], [500, 2600]]) {
    cands = m.nodes.filter((n) => n.lvl === 0 && m.zoneAt(n.x, n.y) === zone && Math.hypot(n.x - v.x, n.y - v.y) > lo && Math.hypot(n.x - v.x, n.y - v.y) < hi && !inAnyView(world, n.x, n.y, 160));
    if (cands.length) break;
  }
  if (!cands.length) return null;
  // (backing up to it: from the end of its street the lane comes from, so the truck comes along the lane behind it -
  // not from the far end, to turn round in the junction just behind it)
  const back = backPlan(world, v), up = back ? m.net.nodes[back.from] : v, down = back ? m.net.nodes[back.e.a === back.from ? back.e.b : back.e.a] : null;
  const dist = (n, q) => Math.hypot(n.x - q.x, n.y - q.y);
  if (down) { const near = cands.filter((n) => dist(n, up) < dist(n, down)); if (near.length) cands = near; }
  cands.sort((a, b) => dist(a, up) - dist(b, up));
  const n = cands[Math.floor(rng() * Math.min(5, cands.length))];
  const hook = hookPoint(world, v);
  const t = world.spawnVehicle('towtruck', n.x, n.y, Math.atan2(hook.y - n.y, hook.x - n.x), {});
  t.despawnable = false; t.npcOwned = true;
  const d = spawnNpc(world, 'construction', t.x, t.y, 'driver');
  d.vehId = t.id; d.seat = 0; t.seats[0] = d.id;
  t.ai = { kind: 'tow', mode: 'drive', target: v.id, why, since: now, kerb: hook, route: null, replans: 0, back };
  t.ai.route = back ? planBack(world, t, back) : planTo(world, t, hook);
  if (t.ai.route.length > 1) t.a = Math.atan2(t.ai.route[1].y - t.y, t.ai.route[1].x - t.x);
  v.towCall = t.id;
  world.tows.add(t.id);
  return t;
}

// ---- backing up to it ---------------------------------------------------------------------------------------------------
// The plan for backing up to v, or null when there's no room to (then the old way). Its lane (the nearest lane path,
// either way along its street) and the way that runs; the end of v ahead in it (end 1: its nose, -1: its tail - a
// wreck spun round) and the line out from that end (ux, uy); where the truck pulls in, lined up on that line a good way
// ahead of it (x, y: BACK_ROOM, or less where the street ends sooner), and how it gets there: along the lane to behind
// v, round it on whichever side has room (pass: beside it, past it, then onto the line short of where it stops - in
// straight, so it backs up straight).
export function backPlan(world, v) {
  const m = world.map, net = m.net;
  if (!net || (v.lz || 0) > 0.3 || v.onDeck) return null;
  const k = kerbFor(world, v.x, v.y), e = k.e;
  if (!e) return null;
  let best = null;
  for (const from of e.oneway ? [e.a] : [e.a, e.b]) for (let ln = 0; ln < Math.max(1, e.nl || 1); ln++) {
    const lp = lanePath(net, e, from, ln), pr = project(lp, v);
    if (pr && (!best || pr.d < best.pr.d)) best = { from, ln, lp, pr };
  }
  if (!best || best.pr.d > 60) return null;   // (not in a lane of it)
  const q = pointAt(best.lp, best.pr.s), c = Math.cos(v.a), s = Math.sin(v.a), along = c * q.tx + s * q.ty;
  if (Math.abs(along) < 0.8) return null;      // (across the lane: nothing to line up with)
  const end = along > 0 ? 1 : -1, ux = c * end, uy = s * end, nx = -uy, ny = ux;
  const hl = v.def.L / 2, laneEnd = best.lp[best.lp.length - 1].s;
  // how far ahead it pulls in: as far as BACK_ROOM, in the street (not out past its end in the junction: the nose may
  // just poke into it), the strip from v's end to past there road all the way with nothing in it
  let room = 0;
  for (const r of BACK_ROOMS) {
    const D = hl + r + TL / 2;
    if (best.pr.s + D <= laneEnd - 10 && stripOk(world, v, v.x, v.y, ux, uy, 0, hl, D + TL / 2 + 10, TW + 6)) { room = r; break; }
  }
  if (!room) return null;
  const D = hl + room + TL / 2;
  // round it: the side with room - the next lane over or the other side of the road - beside it and on past its end
  const off = v.def.W / 2 + TW / 2 + PASS_GAP;
  let side = 0;
  for (const sd of [-1, 1]) {   // (n is the right of the way it's going: -1, the left - the road's middle, in right-hand traffic)
    if (stripOk(world, v, v.x, v.y, ux, uy, sd * off, -hl - TL / 2 - 20, D - 40, TW)) { side = sd; break; }
  }
  if (!side) return null;
  const at = (a, o) => ({ x: v.x + ux * a + nx * o * side, y: v.y + uy * a + ny * o * side });
  const pass = [at(-hl - TL - 60, off * 0.3), at(-hl - TL / 2 - 10, off), at(hl + TL / 2 + 30, off)];   // (fully over before its nose reaches it, its tail well past it before it pulls in)
  if (room >= 120) pass.push(at(D - 40, 0));   // (onto the line short of the stop: in straight)
  return { end, ux, uy, room, e, from: best.from, ln: best.ln, lp: best.lp, sCar: best.pr.s, x: v.x + ux * D, y: v.y + uy * D, vx: v.x, vy: v.y, va: v.a, ignore: new Set([v.id]), pass };
}
// a strip along the line from (x, y) out along (ux, uy), from a to b px, `off` px to its left, w wide: road, nothing solid,
// no vehicle but v and no person in it
function stripOk(world, v, x, y, ux, uy, off, a, b, w) {
  const m = world.map, nx = -uy, ny = ux;
  for (let t = a; t <= b; t += 16) for (const o of [-w / 2 + 4, 0, w / 2 - 4]) {
    const px = x + ux * t + nx * (off + o), py = y + uy * t + ny * (off + o), tl = m.tileAtPx(px, py);
    if (tl !== T.ROAD && tl !== T.BRIDGE) return false;
    const arr = m.solidProps.get(Math.floor(py / 32) * m.w + Math.floor(px / 32));
    if (arr) for (const p of arr) if (!p.off && Math.hypot(p.x - px, p.y - py) < p.r + 6) return false;
  }
  const cx = x + ux * (a + b) / 2 + nx * off, cy = y + uy * (a + b) / 2 + ny * off, hl = (b - a) / 2;
  for (const e of world.query(cx, cy, hl + w + 60)) {
    if (e === v || !sameLevel(e.lz, v.lz) || (e.kind !== K.VEH && !(e.kind === K.PED && !e.vehId && !e.dead && !e.hidden))) continue;
    const dx = e.x - cx, dy = e.y - cy, la = dx * ux + dy * uy, lo = dx * nx + dy * ny;
    const r = e.kind === K.VEH ? Math.max(e.def.L, e.def.W) / 2 : 12;
    if (Math.abs(la) < hl + r && Math.abs(lo) < w / 2 + r) return false;
  }
  return true;
}
// along the lane to behind it, round it, and in ahead of it
function planBack(world, t, B) {
  const net = world.map.net, n = net.nodes[B.from];
  const r = planRoute(world, t.x, t.y, n.x, n.y);
  r.pop();   // (its last point is the junction itself: the street from it follows)
  const upTo = B.sCar - (TL + 160);
  for (const q of B.lp) { if (q.s >= upTo) break; r.push({ x: q.x, y: q.y }); }
  for (const p of B.pass) r.push({ x: p.x, y: p.y });
  r.push({ x: B.x, y: B.y, final: true });
  return trimBehind(r, t);
}
// The gap (px) between the truck's back bumper and v's body
function tailGap(t, v) {
  const c = Math.cos(t.a), s = Math.sin(t.a), rx = t.x - c * t.def.L / 2, ry = t.y - s * t.def.L / 2;
  const vc = Math.cos(v.a), vs = Math.sin(v.a), hl = v.def.L / 2, hw = v.def.W / 2;
  let g = Infinity;
  for (const o of [-t.def.W / 2 + 3, -t.def.W / 4, 0, t.def.W / 4, t.def.W / 2 - 3]) {
    const px = rx - s * o - v.x, py = ry + c * o - v.y, lx = px * vc + py * vs, ly = -px * vs + py * vc;
    g = Math.min(g, Math.hypot(Math.max(0, Math.abs(lx) - hl), Math.max(0, Math.abs(ly) - hw)));
  }
  return g;
}
// Reversing onto it: the tail steered onto the line out from the end it's backing onto, so it comes up to it square,
// slower as it closes. 'touch', 'back' or 'stuck' (no nearer for a while: something in the way).
function backStep(world, t, v, ai) {
  const B = ai.back, now = world.time;
  const gap = tailGap(t, v);
  if (gap <= TOUCH) return 'touch';
  if (ai.bestGap === undefined || gap < ai.bestGap - 3) { ai.bestGap = gap; ai.bestAt = now; }
  if (now - ai.bestAt > BACK_STALL_S) return 'stuck';
  const c = Math.cos(v.a), s = Math.sin(v.a), ux = c * B.end, uy = s * B.end;
  const ex = v.x + ux * v.def.L / 2, ey = v.y + uy * v.def.L / 2;
  // steering it as if its tail were its nose (a Stanley controller backwards: the heading onto the line, plus the way
  // back onto it from the side), the wheel the other way round in reverse
  const ca = Math.cos(t.a), sa = Math.sin(t.a), rx = t.x - ca * (t.def.L / 2 - 20), ry = t.y - sa * (t.def.L / 2 - 20);
  const lineA = Math.atan2(-uy, -ux), nlx = -Math.sin(lineA), nly = Math.cos(lineA);
  const off = (rx - ex) * nlx + (ry - ey) * nly, speed = Math.abs(vehForwardSpeed(t));
  let psi = lineA - (t.a + Math.PI);
  psi = Math.atan2(Math.sin(psi), Math.cos(psi));
  const cmd = psi - Math.atan2(BACK_KE * off, speed + 15);
  const steer = -Math.max(-1, Math.min(1, cmd * BACK_GAIN)), want = -Math.min(BACK_SPEED, 10 + gap * 1.1);
  const fwd = vehForwardSpeed(t);
  if (fwd > 4) t.input = { throttle: 0, steer: 0, hb: true };   // (still rolling forward: stop first)
  else t.input = { throttle: fwd > want ? -Math.min(0.9, 0.35 + (fwd - want) / 50) : fwd < want - 12 ? 0.3 : 0, steer, hb: false };
  return 'back';
}
// where the truck stops: just ahead of the vehicle, the way it faces (on the road)
function hookPoint(world, v) {
  const L = v.def.L / 2 + 134 / 2 + 8, c = Math.cos(v.a), s = Math.sin(v.a);
  for (const sg of [1, -1]) {
    const x = v.x + c * L * sg, y = v.y + s * L * sg, t = world.map.tileAtPx(x, y);
    if (t === T.ROAD || t === T.BRIDGE) { const k = kerbFor(world, x, y); return { ...k, x, y, back: sg < 0 }; }
  }
  return kerbFor(world, v.x, v.y);
}

function runTruck(world, t, dt, now) {
  const ai = t.ai;
  const drv = t.seats[0] ? world.get(t.seats[0]) : null;
  if (!ai || t.wreckAt || !drv || drv.dead || drv.player) { release(world, t); return; }   // (stolen, wrecked, driver gone: the hook lets go)
  const v = world.get(ai.target);
  if (ai.mode === 'drive') {
    if (!v || v.removed || playerIn(world, v) || v.towedBy) { ai.mode = 'leave'; if (v && v.towCall === t.id) v.towCall = 0; return; }
    if ((v.byPlayer || v.owner) && now - (v.touchAt || 0) < TOW_IDLE_S) { ai.mode = 'leave'; v.towCall = 0; return; }   // (its driver came back to it)
    if (ai.back) {   // backing up to it: along its lane, round it, pulled in ahead of it lined up - then back
      const B = ai.back, dk = Math.hypot(B.x - t.x, B.y - t.y);
      if (Math.hypot(v.x - B.vx, v.y - B.vy) > 30 || Math.abs(Math.sin(v.a - B.va)) > 0.3) { ai.back = null; ai.noBack = true; ai.route = planTo(world, t, ai.kerb); ai.bestD = undefined; return; }   // (it's been moved)
      if (follow(world, t, dk < 600 ? 200 : 420, 30, false, B.ignore) || dk < 30) { halt(t); ai.mode = 'back'; ai.at = now; ai.bestGap = undefined; return; }
      if (sinceProgress(world, t, B.x, B.y) > ROUND_STALL_S) { ai.back = null; ai.noBack = true; ai.route = planTo(world, t, ai.kerb); ai.bestD = undefined; }   // (held up getting round it: the old way)
      if (now - ai.since > 150) { ai.mode = 'leave'; v.towCall = 0; }
      return;
    }
    const k = ai.kerb, dk = Math.hypot(k.x - t.x, k.y - t.y), dv = Math.hypot(v.x - t.x, v.y - t.y);
    // (no room to back up to it when it was sent - traffic going by, most likely: look again now and then on the way)
    if (!ai.noBack && dv > 450 && world.tick % 20 === (t.id % 20)) {
      const b = backPlan(world, v);
      if (b) { ai.back = b; ai.route = planBack(world, t, b); ai.bestD = undefined; return; }
    }
    const stalled = sinceProgress(world, t, k.x, k.y);
    // (come up behind it: round it to pull up in front - only hooked from where it is if it can't get round)
    const behind = (v.x - t.x) * Math.cos(t.a) + (v.y - t.y) * Math.sin(t.a) > 0;
    let there = dk < 40 || (stalled > (behind ? 12 : 5) && dv < 260);
    // (held up: a new way, backing off a little first - stopped mid-turn nose-on to something that won't move, a car with
    // someone sat in it, it would wait there for good: reversing, traffic.js swings its nose round to where it's going)
    if (!there && stalled > 9) { if (ai.replans < 2) { ai.replans++; ai.route = planTo(world, t, k); t.ai.bestD = undefined; ai.reverseUntil = now + 1.3; } else there = dv < 400; }
    if (there) { halt(t); ai.mode = 'hook'; ai.at = now; world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id }); return; }
    follow(world, t, dk < 500 ? 220 : 420, 34, true);
    if (now - ai.since > 150) { ai.mode = 'leave'; v.towCall = 0; }
    return;
  }
  if (ai.mode === 'back') {   // reversing until its tail touches the end of it ahead in the lane
    t.beaconOn = true;
    if (!v || v.removed || playerIn(world, v) || v.towedBy) { halt(t); ai.mode = 'leave'; t.beaconOn = false; if (v && v.towCall === t.id) v.towCall = 0; return; }
    const r = backStep(world, t, v, ai);
    if (r === 'back') return;
    halt(t); ai.mode = 'hook'; ai.at = now;
    ai.end = ai.back.end;   // (that end goes up on the lift - touching, or winched in from where it stopped if it couldn't get there)
    world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id });
    return;
  }
  if (ai.mode === 'hook') {
    halt(t); t.beaconOn = true;
    if (!v || v.removed || playerIn(world, v)) { ai.mode = 'leave'; t.beaconOn = false; if (v) v.towCall = 0; return; }
    if (now - ai.at < HOOK_S) return;
    // hooked: whoever was still at the wheel of a dead car gets out, the vehicle hangs behind the boom
    for (const sid of v.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
    v.seats.fill(0);
    if (v.ai) v.ai = null;
    v.towedBy = t.id; v.despawnable = false; v.parked = false;
    v.towEnd = ai.end || 1;   // (which end is up on the wheel lift: 1 its nose, -1 its tail)
    v.towFrom = { x: v.x, y: v.y, a: v.a, at: now };   // (winched round onto the hook over a second, not jumped there)
    ai.towing = v.id; ai.mode = 'leave'; t.beaconOn = false;
    world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id, hooked: 1 });
    carry(t, v, now);
    return;
  }
  // leave: off to a junction away from everyone, gone (with what it's towing) once nobody can see it
  let seen = inAnyView(world, t.x, t.y, 160);
  if (!seen) for (const p of world.players.values()) if (p.ped && Math.hypot(p.ped.x - t.x, p.ped.y - t.y) < 900) { seen = true; break; }
  if (!seen) { finish(world, t); return; }
  if (!ai.exit) {
    const n = exitNode(world, t, ai.badExit);
    ai.exit = n ? { x: n.x, y: n.y, id: n.id } : { x: t.x + Math.cos(t.a) * 1500, y: t.y + Math.sin(t.a) * 1500, id: -1 };
    ai.route = trimBehind(planRoute(world, t.x, t.y, ai.exit.x, ai.exit.y), t); ai.bestD = undefined;
  }
  if (follow(world, t, ai.towing ? 260 : 360, 34, true)) ai.exit = null;
  else if (sinceProgress(world, t, ai.exit.x, ai.exit.y) > 8) { ai.badExit = ai.exit.id; ai.exit = null; }   // (stuck: another way out)
}

// the towed vehicle hangs behind the truck's boom, the end it was hooked by up on the wheel lift: its nose (the same way
// round as the truck) or its tail (the other way round)
const WINCH_S = 1.2;
function carry(t, v, now = 0) {
  const c = Math.cos(t.a), s = Math.sin(t.a), off = t.def.L / 2 + v.def.L / 2 + 4;
  let x = t.x - c * off, y = t.y - s * off, a = v.towEnd === -1 ? t.a + Math.PI : t.a;
  const f = v.towFrom, k = f ? Math.min(1, (now - f.at) / WINCH_S) : 1;
  if (k < 1) {   // still being winched onto the hook: from where it stood
    const u = k * k * (3 - 2 * k);
    let da = a - f.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    x = f.x + (x - f.x) * u; y = f.y + (y - f.y) * u; a = f.a + da * u;
  } else if (f) v.towFrom = null;
  v.x = x; v.y = y; v.a = a; v.vx = 0; v.vy = 0; v.av = 0; v.lz = t.lz || 0;
  v.input = { throttle: 0, steer: 0, hb: false };
}
// after the physics (tow runs after vehicles): every towed vehicle back on its hook
export function after(world) {
  if (!world.tows) return;
  for (const id of world.tows) {
    const t = world.get(id), v = t && t.ai && t.ai.towing && world.get(t.ai.towing);
    if (v) { carry(t, v, world.time); world.place(v); }
  }
}

// Out of sight with it: both gone; a player's car impounded (their own: back in their garage for the fee).
function finish(world, t) {
  const v = t.ai && t.ai.towing && world.get(t.ai.towing);
  if (v) { impound(world, v); world.remove(v); }
  for (const sid of t.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
  world.tows.delete(t.id);
  world.remove(t);
}
function impound(world, v) {
  const where = world.map.districtAt(v.x, v.y)?.name || 'the street';
  for (const p of world.players.values()) {
    if (v.owner && v.owner === p.pid) {
      const fee = Math.min(TOW_FEE, Math.max(0, p.profile.bank));
      p.profile.bank -= fee;
      world.notify(p, `🚛 Your ${v.def.name} was towed from ${where} - left blocking traffic. It's back in your garage; the tow cost $${fee} from your bank.`, 'warn');
      p.meDirty = true; store.touch();
    } else if (p.lastVehicle === v.id) {
      world.notify(p, `🚛 The ${v.def.name} you left in ${where} was blocking traffic - it's been towed away.`, 'info');
      p.lastVehicle = 0; p.meDirty = true;
    }
  }
}
// the truck taken (or wrecked): the hook lets go, and it's an ordinary vehicle
function release(world, t) {
  const ai = t.ai;
  const v = ai && (world.get(ai.towing) || world.get(ai.target));
  if (v) { if (v.towedBy === t.id) v.towedBy = 0; if (v.towCall === t.id) v.towCall = 0; v.despawnable = true; }
  world.tows.delete(t.id);
  t.ai = null; t.despawnable = true; t.beaconOn = false;
}
