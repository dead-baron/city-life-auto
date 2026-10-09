// The city's tow service (task #314): tow trucks clear burnt-out wrecks, broken-down or jammed cars and abandoned ones
// that block a lane. A truck comes from out of sight (kerbdrive.js), pulls up just ahead of the vehicle facing the same
// way, works the winch, hooks it (the vehicle hangs behind the boom: tow.update keeps it there after the physics) and
// tows it off out of sight, where both are gone.
//
// A vehicle a player has driven is never towed unless it's left in the street, untouched by any player for
// TOW_IDLE_S (5 minutes) and blocking traffic (in a lane of the carriageway). Its owner gets a phone message: their own
// car (out of their garage) is back in the garage for TOW_FEE; a car they took is just gone.
// Like any vehicle a tow truck can be stolen: the driver's seat taken, the hook lets go and it's anyone's truck.
import { K, T } from '../../shared/constants.js';
import { TOW_WRECK_S, TOW_STUCK_S, TOW_IDLE_S, TOW_FEE } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { inAnyView } from '../view.js';
import { kerbFor, planTo, follow, halt, exitNode, sinceProgress } from './kerbdrive.js';
import { planRoute } from './traffic.js';
import { store } from '../store.js';

const MAX_TRUCKS = 2;
const HOOK_S = 3.2;            // working the winch
const rng = mulberry32(3140);

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
  cands.sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y));
  const n = cands[Math.floor(rng() * Math.min(5, cands.length))];
  const hook = hookPoint(world, v);
  const t = world.spawnVehicle('towtruck', n.x, n.y, Math.atan2(hook.y - n.y, hook.x - n.x), {});
  t.despawnable = false; t.npcOwned = true;
  const d = spawnNpc(world, 'construction', t.x, t.y, 'driver');
  d.vehId = t.id; d.seat = 0; t.seats[0] = d.id;
  t.ai = { kind: 'tow', mode: 'drive', target: v.id, why, since: now, kerb: hook, route: null, replans: 0 };
  t.ai.route = planTo(world, t, hook);
  if (t.ai.route.length > 1) t.a = Math.atan2(t.ai.route[1].y - t.y, t.ai.route[1].x - t.x);
  v.towCall = t.id;
  world.tows.add(t.id);
  return t;
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
    const k = ai.kerb, dk = Math.hypot(k.x - t.x, k.y - t.y), dv = Math.hypot(v.x - t.x, v.y - t.y);
    const stalled = sinceProgress(world, t, k.x, k.y);
    // (come up behind it: round it to pull up in front - only hooked from where it is if it can't get round)
    const behind = (v.x - t.x) * Math.cos(t.a) + (v.y - t.y) * Math.sin(t.a) > 0;
    let there = dk < 40 || (stalled > (behind ? 12 : 5) && dv < 260);
    if (!there && stalled > 9) { if (ai.replans < 2) { ai.replans++; ai.route = planTo(world, t, k); t.ai.bestD = undefined; } else there = dv < 400; }
    if (there) { halt(t); ai.mode = 'hook'; ai.at = now; world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id }); return; }
    follow(world, t, dk < 500 ? 220 : 420, 34, true);
    if (now - ai.since > 150) { ai.mode = 'leave'; v.towCall = 0; }
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
    const n = exitNode(world, t);
    ai.exit = n ? { x: n.x, y: n.y } : { x: t.x + Math.cos(t.a) * 1500, y: t.y + Math.sin(t.a) * 1500 };
    ai.route = planRoute(world, t.x, t.y, ai.exit.x, ai.exit.y); ai.bestD = undefined;
  }
  if (follow(world, t, ai.towing ? 260 : 360) || sinceProgress(world, t, ai.exit.x, ai.exit.y) > 12) ai.exit = null;
}

// the towed vehicle hangs behind the truck's boom, the same way round (its front wheels up on the lift)
const WINCH_S = 1.2;
function carry(t, v, now = 0) {
  const c = Math.cos(t.a), s = Math.sin(t.a), off = t.def.L / 2 + v.def.L / 2 + 4;
  let x = t.x - c * off, y = t.y - s * off, a = t.a;
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
