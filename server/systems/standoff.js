// The police standoff at a robbery (the owner's notes, task #323: "Police at a robbery: pull up out front, take cover
// behind their cars with weapons drawn, surround the building, then go in after you" - they used to ram the building
// over and over). A wanted suspect inside the walk-in they robbed (robbery.js p.robbedAt) isn't driven at: police.js
// runUnit hands its units to this.
// - Each car drives to its own spot round the building, not at the suspect: the first to the street by the door, the
//   next spread along the street out front so they don't stack, then the sides and the back where there's road. It
//   stops there at an angle and the crew gets out. A car that can't get to its spot parks where it got to: it never
//   drives at the building.
// - One officer a car takes cover behind it, on the side away from the door, weapon drawn (a pistol at least, whatever
//   the stars) and aimed at the door; the others take posts round the building's walls, so it's surrounded.
// - After STANDOFF_S out there, or once STANDOFF_READY officers are in position, the ones at the walls go in through
//   the door after the suspect (police.js: the walk-in pursuit). One a car stays in cover.
// - Nobody in cover or at a post fires unless the suspect has been shooting at the police or is on 4 stars or more.
// - It's over when the suspect is cuffed, dead or no longer wanted, comes out (the usual chase and arrest from there:
//   tackles at low stars and so on) or slips away unseen for STANDOFF_LOST_S. The units go back to their usual ways.
//   world.standoffs: pid -> { key, pid, u (the walk-in unit), b (its building), bid, wi (its door: npc.js walkInAt), door,
//     since, outAt (the first crew out), spots [{x, y}] (round the building), taken (vid -> spot), posts [[{x, y}, ...]]
//     (the way to each post round the walls), postTaken (cop id -> post), cover (vid -> cop id), inPlace, goIn, hotAt }
import { TILE, MAP_W } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { pedStep } from '../../shared/physics.js';
import { IN } from '../../shared/input.js';
import { WEAPONS } from '../../shared/items.js';
import { mulberry32 } from '../../shared/rng.js';
import { STANDOFF_S, STANDOFF_READY, STANDOFF_LOST_S } from '../../shared/rules.js';
import { walkInAt, seek, sidestep } from './npc.js';
import { driveToward, planRoute } from './traffic.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as players from './players.js';

const rng = mulberry32(2323);
let seq = 0;

// ---- is there one? -------------------------------------------------------------------------------------------------------
// The standoff over this suspect, if they're holed up in the place they robbed (worked out once a tick); null if not -
// and one that's over is wound up.
export function of(world, p) {
  const m = (world.standoffs ??= new Map());
  let so = m.get(p.pid) || null;
  if (so && so.tick === world.tick) return so.live ? so : null;
  const now = world.time, R = p.robbedAt, t = p.ped;
  let live = !!R && now < R.until && !!t && !t.dead && !p.custody && p.wanted > 0 && !t.vehId;
  if (live) {
    const seen = now - p.seenAt < 3;
    const x = seen ? t.x : p.lastSeenX, y = seen ? t.y : p.lastSeenY;
    const wi = walkInAt(world.map, x, y);
    live = !!wi && wi.u === R.u && now - p.seenAt < STANDOFF_LOST_S;
    if (live && !so) so = begin(world, p, R, wi);
    // surrounded: once the police are out there, they know you're still inside
    if (live && so.outAt) { const at = walkInAt(world.map, t.x, t.y); if (at && at.u === R.u) { p.seenAt = now; p.lastSeenX = t.x; p.lastSeenY = t.y; } }
  }
  if (!live) { if (so) m.delete(p.pid); return null; }
  so.tick = world.tick; so.live = true;
  if (!so.goIn && so.outAt && (now - so.outAt >= STANDOFF_S || so.inPlace >= STANDOFF_READY)) so.goIn = true;
  return so;
}
// (players gone: their standoffs with them)
export function prune(world) {
  if (!world.standoffs || world.tick % 40) return;
  for (const pid of [...world.standoffs.keys()]) if (!world.players.has(pid)) world.standoffs.delete(pid);
}

function begin(world, p, R, wi) {
  const b = world.map.buildings[R.bid];
  const so = {
    key: ++seq, pid: p.pid, u: R.u, b, bid: R.bid, wi, door: { x: wi.x, y: wi.outY }, south: !!b.walkIn.south,
    since: world.time, outAt: 0, taken: new Map(), postTaken: new Map(), cover: new Map(), inPlace: 0, goIn: false, hotAt: -99, tick: -1, live: false,
  };
  so.spots = spotsFor(world, so);
  so.posts = postsFor(world, so);
  world.standoffs.set(p.pid, so);
  return so;
}

// ---- where the cars go -------------------------------------------------------------------------------------------------
// The nearest point of a street to (x, y) (ground level), with the street's direction and half-width there
function street(m, x, y) {
  let best = null, bd = Infinity;
  for (const e of m.edges || []) {
    if (e.lvl !== 0) continue;
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], q = e.pts[i], dx = q.x - a.x, dy = q.y - a.y, L2 = dx * dx + dy * dy || 1;
      if (Math.min(a.x, q.x) - x > bd || x - Math.max(a.x, q.x) > bd || Math.min(a.y, q.y) - y > bd || y - Math.max(a.y, q.y) > bd) continue;
      const s = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
      const px = a.x + dx * s, py = a.y + dy * s, d = Math.hypot(px - x, py - y);
      if (d < bd) { const L = Math.sqrt(L2); bd = d; best = { x: px, y: py, dx: dx / L, dy: dy / L, hw: e.hw || 40, d }; }
    }
  }
  return best;
}
// a car's spot on the street near (x, y): over on the building's side of the road (by the kerb), not in the middle
function kerbSpot(m, x, y, toward) {
  const s = street(m, x, y);
  if (!s) return null;
  let nx = -s.dy, ny = s.dx;
  if ((toward.x - s.x) * nx + (toward.y - s.y) * ny < 0) { nx = -nx; ny = -ny; }
  const off = Math.max(0, s.hw - 34);
  return { x: s.x + nx * off, y: s.y + ny * off, dx: s.dx, dy: s.dy, d: s.d };
}
// In order: the street by the door, along it either way, the sides and the back where there's road, then further along
function spotsFor(world, so) {
  const m = world.map, b = so.b, c = { x: (b.tx + b.tw / 2) * TILE, y: (b.ty + b.th / 2) * TILE };
  const out = [], free = (q) => q && !out.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 95);
  const front = kerbSpot(m, so.door.x, so.door.y, so.door);
  if (!front) return [{ x: so.door.x, y: so.door.y + (so.south ? 120 : -120) }];
  out.push(front);
  const along = (j) => { const q = kerbSpot(m, front.x + front.dx * 125 * j, front.y + front.dy * 125 * j, c); if (q && q.d < 140 && free(q)) out.push(q); };
  along(1); along(-1);
  const x0 = b.tx * TILE, x1 = (b.tx + b.tw) * TILE, yB = so.south ? b.ty * TILE : (b.ty + b.th) * TILE;
  for (const w of [{ x: x0 - 40, y: c.y }, { x: x1 + 40, y: c.y }, { x: c.x, y: yB + (so.south ? -40 : 40) }]) {
    const q = kerbSpot(m, w.x, w.y, c);
    if (q && q.d < 300 && free(q) && Math.hypot(q.x - front.x, q.y - front.y) > 160) out.push(q);
  }
  for (const j of [2, -2, 3, -3, 4, -4]) along(j);
  return out;
}
// The first car takes the street by the door; the next, the nearest spot still free (so they don't cut across each other)
function freeSpot(so, v) {
  const used = new Set(so.taken.values());
  if (!used.has(0)) return 0;
  let best = -1, bd = Infinity;
  for (let i = 1; i < so.spots.length; i++) { const d = Math.hypot(so.spots[i].x - v.x, so.spots[i].y - v.y); if (!used.has(i) && d < bd) { bd = d; best = i; } }
  return best >= 0 ? best : so.taken.size % so.spots.length;
}

// A unit driving in (police.js runUnit, drive mode): to its spot, not at the suspect; there (or as near as it gets),
// it stops at an angle and the crew gets out
export function drive(world, v, crew, so, dt) {
  const ai = v.ai, now = world.time;
  if (ai.soKey !== so.key) { ai.soKey = so.key; ai.soPark = false; ai.route = null; ai.soStill = 0; }
  if (!so.taken.has(v.id)) so.taken.set(v.id, freeSpot(so, v));
  const sp = so.spots[so.taken.get(v.id)] || so.spots[0];
  const driver = v.seats[0] ? world.get(v.seats[0]) : null;
  const d = Math.hypot(sp.x - v.x, sp.y - v.y), fwd = v.vx * Math.cos(v.a) + v.vy * Math.sin(v.a);
  // stuck short of it (something in the way - never the building: the spot is on the street) - park where it is
  if (Math.abs(fwd) < 20) ai.soStill = (ai.soStill || 0) + dt; else ai.soStill = 0;
  if (!driver || driver.dead || d < 70 || (d < 220 && ai.soStill > 2.5)) ai.soPark = true;
  if (ai.soPark) {
    if (Math.abs(fwd) > 30 && driver && !driver.dead) { v.input = { throttle: fwd > 0 ? -1 : 1, steer: (v.id & 1 ? 0.8 : -0.8), hb: true }; return; }   // (pulled up at an angle)
    v.input = { throttle: 0, steer: 0, hb: true };
    ai.mode = 'foot'; ai.footAt = now;
    so.outAt ||= now;
    for (const c of crew) { if (c.vehId) vehicles.ejectPed(world, c, true); c.npc.state = 'chase'; }
    return;
  }
  if (d < 420 && world.map.los(v.x, v.y, sp.x, sp.y)) { driveToward(world, v, sp.x, sp.y, Math.max(110, Math.min(380, d)), {}); return; }
  if (!ai.route || now - ai.routeAt > 3) { ai.route = planRoute(world, v.x, v.y, sp.x, sp.y); ai.routeAt = now; }
  while (ai.route.length > 1 && Math.hypot(ai.route[0].x - v.x, ai.route[0].y - v.y) < 60) ai.route.shift();
  const wp = ai.route[0] || sp;
  driveToward(world, v, wp.x, wp.y, 480, {});
}

// ---- where the officers go -----------------------------------------------------------------------------------------------
// Posts round the walls: the front corners, the sides, the back (each with the way there, round the outside), only where an
// officer can stand (a shop in a row: none inside the next one)
function postsFor(world, so) {
  const m = world.map, b = so.b, o = 30;
  const x0 = b.tx * TILE - o, x1 = (b.tx + b.tw) * TILE + o;
  const yF = so.south ? (b.ty + b.th) * TILE + o : b.ty * TILE - o, yB = so.south ? b.ty * TILE - o : (b.ty + b.th) * TILE + o;
  const cy = (yF + yB) / 2, cx = (x0 + x1) / 2;
  const fl = { x: x0, y: yF }, fr = { x: x1, y: yF }, ml = { x: x0, y: cy }, mr = { x: x1, y: cy }, bl = { x: x0, y: yB }, br = { x: x1, y: yB }, bm = { x: cx, y: yB };
  const ok = (q) => {
    const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE), id = m.bld ? m.bld[ty * MAP_W + tx] : -1;
    return !PED_BLOCK[m.tileAtPx(q.x, q.y)] && !(id >= 0 && id !== so.bid);
  };
  return [[fl], [fr], [fl, ml], [fr, mr], [fl, ml, bl], [fr, mr, br], [fl, ml, bl, bm]].filter((path) => path.every(ok));
}
// Behind the car, on its far side from the door (slot: side by side, for a second officer there)
function coverSpot(v, so, slot) {
  const dx = v.x - so.door.x, dy = v.y - so.door.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const fx = Math.cos(v.a), fy = Math.sin(v.a);
  const ext = (Math.abs(ux * fx + uy * fy) * v.def.L) / 2 + (Math.abs(-ux * fy + uy * fx) * v.def.W) / 2;
  const lat = slot ? (slot % 2 ? 1 : -1) * 24 * Math.ceil(slot / 2) : 0;
  return { x: v.x + ux * (ext + 16) - uy * lat, y: v.y + uy * (ext + 16) + ux * lat };
}
// Who does what: one a car in cover (a car parked out front), the rest at the walls - or straight in, once they're going in
function role(world, c, v, so) {
  const near = !v.wreckAt && !v.dead && Math.hypot(v.x - so.door.x, v.y - so.door.y) < 560;
  const held = so.cover.get(v.id), coverer = held ? world.get(held) : null;
  if (near && (!coverer || coverer.dead || coverer.removed || !coverer.npc || !coverer.npc.so || coverer.npc.so.k !== so.key)) { so.cover.set(v.id, c.id); return { k: so.key, role: 'cover', slot: 0 }; }
  if (so.goIn) return { k: so.key, role: 'entry' };
  const used = new Set(so.postTaken.values());
  for (let i = 0; i < so.posts.length; i++) if (!used.has(i)) { so.postTaken.set(c.id, i); return { k: so.key, role: 'post', post: i, leg: 0 }; }
  return near ? { k: so.key, role: 'cover', slot: 1 + (c.id % 3) } : { k: so.key, role: 'entry' };
}

// An officer on foot at the standoff (police.js runUnit's foot loop): in cover or at a post - true; going in after the
// suspect - false (the usual pursuit then: in through the door). hot: the suspect has been hitting this unit's crew.
export function hold(world, c, v, so, p, hot, dt) {
  const n = c.npc, now = world.time, t = p.ped;
  if (!n.so || n.so.k !== so.key) n.so = role(world, c, v, so);
  const r = n.so;
  // going in: from a post at the side or the back, round the outside the way they came to the front first (there's no
  // path finding on foot) - then in through the door like the rest
  if (r.role === 'post' && so.goIn) { r.role = 'back'; so.postTaken.delete(c.id); }
  if (r.role === 'back') {
    const path = so.posts[r.post];
    r.leg = Math.min(r.leg, path.length - 1);
    if (Math.hypot(path[r.leg].x - c.x, path[r.leg].y - c.y) < 18) { if (r.leg === 0) r.role = 'entry'; else r.leg--; }
  }
  if (r.role === 'entry') return false;
  if (hot || now - (t.lastBrandish ?? -99) < 8) so.hotAt = now;
  const fire = now - so.hotAt < 15 || p.wanted >= 4;
  let at;
  if (r.role === 'cover') at = coverSpot(v, so, r.slot);
  else if (r.role === 'back') at = so.posts[r.post][r.leg];
  else {
    const path = so.posts[r.post];
    at = path[Math.min(r.leg, path.length - 1)];
    if (r.leg < path.length - 1 && Math.hypot(at.x - c.x, at.y - c.y) < 18) { r.leg++; at = path[r.leg]; }
  }
  const d = Math.hypot(at.x - c.x, at.y - c.y), there = d < 12 && (r.role === 'cover' || (r.role === 'post' && r.leg >= so.posts[r.post].length - 1));
  if (there && !r.placed) { r.placed = true; so.inPlace++; }
  // weapons drawn: a pistol at least
  const w = WEAPONS[c.weapon];
  if (!w || w.type !== 'gun') c.weapon = 'pistol';
  const dt2 = Math.hypot(t.x - c.x, t.y - c.y), los = dt2 < 460 && world.map.los(c.x, c.y, t.x, t.y);
  const inp = there ? { bits: 0, mx: 0, my: 0, aim: 0 } : seek(c, at.x, at.y, d > 50);
  const aim = fire && los ? t : r.role === 'cover' ? so.door : { x: (so.b.tx + so.b.tw / 2) * TILE, y: (so.b.ty + so.b.th / 2) * TILE };
  inp.aim = Math.atan2(aim.y - c.y, aim.x - c.x); inp.bits |= IN.AIMING;
  if (fire && los && now > (n.nextShot || 0)) { inp.bits |= IN.FIRE; n.nextShot = now + 0.35 + rng() * 0.7; }
  if (now >= c.downUntil && now >= c.stunUntil) {
    if (there) { c.vx = 0; c.vy = 0; }
    pedStep(c, there ? inp : sidestep(world, c, inp, dt), dt, world.map, { ...players.pedMods(world, c), drainMul: 0.35 });
    c.aimUntil = now + 0.3;   // (the aim pose: weapon up)
    if (inp.bits & IN.FIRE) combat.tryAttack(world, c, inp.aim);
  }
  return true;
}
