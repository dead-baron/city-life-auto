// Biker clubs (concept sheets NP4, MC2, MC5; task #366). Three clubs of five (shared/clubs.js: the Ashcrows in red and
// black, the Dust Drifters in denim, the Velvet Jackals in purple) live at the Rusty Spur, the roadhouse out on the
// Desert Highway (shared/countryside.js): their bikes lined up nose-in along the porch, members standing round them, at
// the burn barrel, on the porch and inside at the bar.
//   - Now and then one club mounts up and rides out two by two - the leader on the traffic system's route
//     (traffic.planRoute / driveToward), the rest in pairs on the leader's line behind - to a filling station or a
//     store in town and back again, and parks along the porch.
//   - They're tough (the gang role: gang.js / gangwar.js fights, steady under fire, they fight the police too): hurt
//     one and every member near piles in (npc.startFight), and the club holds a grudge - if you get away on wheels they
//     mount up and come after you.
//   - The bike thief (MC5): now and then someone walks up to a club bike outside the Spur and rides off on it; the
//     owners pour out, mount up and chase him down. Knock him off it yourself and the club pays you. A player who
//     takes a club bike gets the same treatment.
// Everything here exists only while a player is near the Spur or near a riding club.
import { K } from '../../shared/constants.js';
import { CLUBS } from '../../shared/clubs.js';
import { PAINTS } from '../../shared/vehicles.js';
import {
  CLUB_SIZE, CLUB_RIDE_EVERY_S, CLUB_RIDE_MAX_S, CLUB_FIGHT_PX, CLUB_GRUDGE_S, BIKE_THIEF_EVERY_S, BIKE_THIEF_REWARD, BIKE_THIEF_RESPECT,
} from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { ARCHETYPES } from '../entities.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc, startFight } from './npc.js';
import { planRoute, driveToward } from './traffic.js';
import * as vehicles from './vehicles.js';
import * as events from './events.js';
import * as gangwar from './gangwar.js';

let rng = mulberry32(3660);
export function setRng(r) { rng = r; }

// the club member's look on the wire (entities.js makeAppearance): a dark top, jeans, boots; app.club picks the cut and
// the patch (client art2 game/peds.js adaptApp, people.js)
ARCHETYPES.biker ??= {
  reflex: 0.5, fight: 1.0, speed: 1.0, hp: 140, cash: [20, 120], item: null, gang: true, day: 0, night: 0,
  look: (r) => ({ t: 3, tc: '#1c1a1e', tc2: '#5a5a60', l: '#2a3a5a', sh: '#6b4a2a', ht: r() < 0.3 ? 4 : 0, htc: '#1a1a1e', b: 0 }),
};
const WEAPONS_BY_RANK = ['pistol', 'bat', 'knife', 'crowbar', 'fists'];   // the president carries; the rest swing what they have

const NEAR_PX = 2200, FAR_PX = 3400;          // the clubs turn up when a player is this close to the Spur, go when none is this close
const SIDE = 30;                              // the formation: the pair this far apart side by side (rows: rowGap)
const CRUISE = 300;                           // a club ride's pace on the open road (px/s)

const spur = (world) => world.map.roadhouse || null;
const alive = (e) => !!(e && !e.removed && !e.dead);
const players = (world) => [...world.players.values()].filter((p) => p.ped && !p.ped.dead);
const nearestPlayer = (world, x, y) => { let d = Infinity; for (const p of players(world)) d = Math.min(d, Math.hypot(p.ped.x - x, p.ped.y - y)); return d; };
const S = (world) => (world.bikers ??= { up: false, clubs: [], nextRide: 0, nextThief: 0, thief: null, grudges: new Map() });

export function update(world, dt) {
  const R = spur(world);
  if (!R) return;
  const st = S(world);
  if (world.tick % 10 === 4) manage(world, st, R);
  if (!st.up) return;
  for (const c of st.clubs) { drive(world, st, R, c, dt); paths(world, c); }
  if (st.thief) thiefStep(world, st, R);
  if (world.tick % 10 === 7) { watchBikes(world, st, R); grudges(world, st, R); }
}

// ---- spawning ---------------------------------------------------------------------------------------------------------
function manage(world, st, R) {
  const d = nearestPlayer(world, R.x, R.y);
  const out = st.clubs.some((c) => c.mode !== 'hang');
  const nearRiders = out && st.clubs.some((c) => c.members.some((id) => { const m = world.get(id); return m && nearestPlayer(world, m.x, m.y) < NEAR_PX; }));
  if (!st.up && d < NEAR_PX) spawnAll(world, st, R);
  else if (st.up && d > FAR_PX && !nearRiders && !st.thief) {
    const seen = st.clubs.some((c) => [...c.members, ...c.bikes].some((id) => { const e = world.get(id); return e && inAnyView(world, e.x, e.y, 60); }));
    if (!seen) despawnAll(world, st);
  }
  if (!st.up) return;
  // a ride out now and then (one club at a time; none while there's trouble)
  if (!st.nextRide) st.nextRide = world.time + CLUB_RIDE_EVERY_S[0] * 0.5 + rng() * (CLUB_RIDE_EVERY_S[1] - CLUB_RIDE_EVERY_S[0]);
  if (world.time >= st.nextRide) {
    st.nextRide = world.time + CLUB_RIDE_EVERY_S[0] + rng() * (CLUB_RIDE_EVERY_S[1] - CLUB_RIDE_EVERY_S[0]);
    const idle = st.clubs.filter((c) => c.mode === 'hang' && c.members.every((id) => alive(world.get(id)) && world.get(id).npc.state !== 'fight'));
    if (idle.length && !st.clubs.some((c) => c.mode !== 'hang') && !st.thief) startRide(world, st, R, idle[Math.floor(rng() * idle.length)]);
  }
  // the bike thief (a player at the Spur, everyone at home)
  if (!st.nextThief) st.nextThief = world.time + BIKE_THIEF_EVERY_S[0] * 0.5 + rng() * (BIKE_THIEF_EVERY_S[1] - BIKE_THIEF_EVERY_S[0]);
  if (world.time >= st.nextThief) {
    st.nextThief = world.time + BIKE_THIEF_EVERY_S[0] + rng() * (BIKE_THIEF_EVERY_S[1] - BIKE_THIEF_EVERY_S[0]);
    if (d < 1500 && !st.thief && st.clubs.every((c) => c.mode === 'hang')) startBikeThief(world);
  }
}

// where a member hangs out: k 0-1 by the bikes, 2 at the burn barrel, 3 on the porch, 4 inside at the bar
function hangSpot(world, R, ci, k) {
  const slot = R.slots[ci * CLUB_SIZE + k] || R.slots[0];
  if (k === 2) { const a = (ci * 2.1 + 0.4); return { x: R.barrel.x + Math.cos(a) * 30, y: R.barrel.y + Math.sin(a) * 30, a: a + Math.PI }; }
  if (k === 3) return { x: R.x - 220 + ci * 200 + rng() * 40, y: R.y - 6, a: Math.PI / 2 };
  if (k === 4) {
    const b = world.map.buildings[R.b], u = b && b.walkIn && b.walkIn.units[0];
    if (u) { const T = 32, y0 = (u.counterRow + 1.6) * T, x = (u.x0 + 1.5 + ci * 4 + rng() * 2) * T; return { x, y: y0 + rng() * T * 2.5, a: -Math.PI / 2 }; }
  }
  return { x: slot.x + (k ? 20 : -20), y: slot.y + 44, a: -Math.PI / 2 + (rng() - 0.5) };
}

function spawnAll(world, st, R) {
  st.up = true;
  st.clubs = CLUBS.map((C, ci) => {
    const c = { i: ci, id: C.id, mode: 'hang', members: [], bikes: [], since: world.time };
    for (let k = 0; k < CLUB_SIZE; k++) {
      const slot = R.slots[ci * CLUB_SIZE + k] || R.slots[R.slots.length - 1];
      const v = world.spawnVehicle(C.bikes[k], slot.x, slot.y, slot.a, { parked: true, paint: C.paint[k] % PAINTS.length, variant: ci * 7 + k * 3, npcOwned: true });
      v.despawnable = false; v.club = C.id; v.clubSlot = ci * CLUB_SIZE + k;
      c.bikes.push(v.id);
      const h = hangSpot(world, R, ci, k);
      const m = spawnNpc(world, 'biker', h.x, h.y, 'gang');
      m.app = { ...m.app, club: ci };
      m.name = `${C.short} ${k === 0 ? 'president' : 'member'}`;
      m.npc.club = C.id; m.npc.keep = true; m.npc.fight = 1; m.npc.guard = { x: h.x, y: h.y, a: h.a };
      m.weapon = WEAPONS_BY_RANK[k];
      if (m.weapon === 'pistol') m.ammo = { pistol: 60 };
      m.bike = v.id; m.a = h.a;
      c.members.push(m.id);
    }
    return c;
  });
}

function despawnAll(world, st) {
  for (const c of st.clubs) {
    for (const id of c.members) { const m = world.get(id); if (m && !m.removed) { if (m.vehId) vehicles.ejectPed(world, m, false); despawnNpc(world, m); } }
    for (const id of c.bikes) { const v = world.get(id); if (v && !v.removed && !v.seats.some((s) => s && world.get(s)?.player)) world.remove(v); }
  }
  if (st.thief) { const t = world.get(st.thief.ped); if (t && !t.removed) despawnNpc(world, t); }
  st.clubs = []; st.up = false; st.thief = null;
}

// ---- walking about the Spur: in or out of the bar goes by its door ----------------------------------------------------------
function doorPts(world, R) {
  const b = world.map.buildings[R.b], u = b && b.walkIn && b.walkIn.units[0];
  if (!u) return null;
  const x = (u.door.tx + 1) * 32, fy = u.door.ty;
  return { b, in: { x, y: (fy - 0.5) * 32 }, out: { x, y: (fy + 1.6) * 32 } };
}
function walkTo(world, R, m, dest, run = false, via = null) {
  const D = doorPts(world, R);
  const inside = (x, y) => !!D && x > D.b.tx * 32 && x < (D.b.tx + D.b.tw) * 32 && y > D.b.ty * 32 && y < (D.b.ty + D.b.th) * 32;
  const path = [];
  if (D && inside(m.x, m.y) !== inside(dest.x, dest.y)) { if (inside(m.x, m.y)) path.push(D.in, D.out); else path.push(D.out, D.in); }
  if (via) path.push(via);
  path.push(dest);
  m.npc.path = path.slice(1).map((q) => ({ x: q.x, y: q.y, a: dest.a }));
  m.npc.guard = { x: path[0].x, y: path[0].y, a: dest.a ?? -Math.PI / 2, run };
}
function paths(world, c) {
  for (const id of c.members) {
    const m = world.get(id), n = m && m.npc;
    if (!n || !n.path || !n.path.length || !n.guard || m.vehId) continue;
    if (Math.hypot(m.x - n.guard.x, m.y - n.guard.y) < 14) { const q = n.path.shift(); n.guard = { x: q.x, y: q.y, a: q.a ?? n.guard.a, run: n.guard.run }; }
  }
}

// to a bike in the row: round by the lot, then up beside it
const toBike = (world, R, m, v, run = false) => walkTo(world, R, m, { x: v.x + v.def.W / 2 + 9, y: v.y + 6, a: Math.PI }, run, { x: v.x + v.def.W / 2 + 9, y: v.y + v.def.L / 2 + 26 });

// ---- riding -------------------------------------------------------------------------------------------------------------
function mount(world, m, v) {
  if (!alive(m) || !v || v.removed || v.wreckAt || v.seats[0]) return false;
  if (m.sit) { m.sit = null; m.appVer = (m.appVer || 0) + 1; }
  m.vehId = v.id; m.seat = 0; v.seats[0] = m.id; m.vx = 0; m.vy = 0;
  v.parked = false; v.lastDriver = m.id; v.ai = { kind: m.npc && m.npc.thief ? 'thief' : 'club' };
  return true;
}
function dismount(world, m, post) {
  if (m.vehId) vehicles.ejectPed(world, m, false);
  if (post) m.npc.guard = { x: post.x, y: post.y, a: post.a ?? -Math.PI / 2 };
}

// the ride out: the members walk to their bikes, mount, and the leader plans the route to a stop in town
export function startRide(world, st, R, c, dest = null) {
  const cands = world.map.pois.filter((p) => (p.kind === 'gasstation' || p.kind === 'convenience') && Math.hypot(p.x - R.x, p.y - R.y) > 2400 && Math.hypot(p.x - R.x, p.y - R.y) < 14000);
  const to = dest || (cands.length ? cands[Math.floor(rng() * cands.length)] : { x: R.x - 6000, y: R.y });
  c.mode = 'mount'; c.since = world.time; c.dest = { x: to.outside ? to.outside.x : to.x, y: to.outside ? to.outside.y : to.y };
  c.members.forEach((id, k) => { const m = world.get(id), v = world.get(c.bikes[k]); if (alive(m) && v) toBike(world, R, m, v); });
  return c;
}

function drive(world, st, R, c, dt) {
  const now = world.time;
  if (c.mode === 'hang') return;
  if (c.mode === 'mount') {
    let ready = 0, total = 0;
    c.members.forEach((id, k) => {
      const m = world.get(id), v = world.get(c.bikes[k]);
      if (!alive(m) || !v || v.removed || v.wreckAt) return;
      total++;
      if (m.vehId === v.id) { ready++; return; }
      if (m.npc.state === 'fight') return;
      const close = Math.hypot(m.x - v.x, m.y - v.y) < v.def.L / 2 + 26;
      if (close || (now - c.since > 14 && !inAnyView(world, m.x, m.y, 40)) || now - c.since > 30) { if (mount(world, m, v)) ready++; }
    });
    if (total && ready === total) { c.mode = 'ride'; c.since = now; c.trail = []; c.gap = rowGap(world, c); c.route = planRoute(world, R.lot ? (R.lot.x0 + R.lot.x1) / 2 : R.x, R.lot ? R.lot.y1 : R.y, c.dest.x, c.dest.y); }
    else if (now - c.since > 40) toHang(world, R, c);
    return;
  }
  // riding out or home in formation, or chasing: anyone who came off picks himself up and gets back on
  if (world.tick % 10 === 2) c.members.forEach((id, k) => {
    const m = world.get(id), v = world.get(c.bikes[k]);
    if (!alive(m) || m.vehId || !v || v.removed || v.wreckAt || v.seats[0] || m.npc.state === 'fight' || now < m.downUntil) return;
    const d = Math.hypot(m.x - v.x, m.y - v.y);
    if (d < v.def.L / 2 + 26 || (!inAnyView(world, m.x, m.y, 30) && !inAnyView(world, v.x, v.y, 30))) mount(world, m, v);
    else if (d < 400 && (!m.npc.guard || Math.hypot(m.npc.guard.x - v.x, m.npc.guard.y - v.y) > 40)) { m.npc.path = []; m.npc.guard = { x: v.x, y: v.y, a: v.a, run: true }; }
  });
  const riders = c.members.map((id, k) => ({ m: world.get(id), v: world.get(c.bikes[k]), k })).filter((r) => alive(r.m) && r.v && r.m.vehId === r.v.id && !r.v.wreckAt);
  if (c.mode === 'chase') return chase(world, st, R, c, riders);
  if (c.mode === 'park') return parkStep(world, R, c, riders);
  if (!riders.length) { toHang(world, R, c); return; }
  const lead = riders[0];
  // the leader: along the route, looking a little ahead
  const route = c.route || [];
  while (route.length > 1 && Math.hypot(route[0].x - lead.v.x, route[0].y - lead.v.y) < 70) route.shift();
  const wp = route[0] || c.dest;
  const home = c.mode === 'home', dEnd = Math.hypot(wp.x - lead.v.x, wp.y - lead.v.y);
  // followers falling behind: the leader eases off
  const lag = riders.slice(1).reduce((mx, r) => Math.max(mx, slotError(c, r, riders.indexOf(r))), 0);
  const pace = Math.min(CRUISE, lead.v.def.max * 0.8) * (lag > 140 ? 0.6 : lag > 70 ? 0.85 : 1);
  driveToward(world, lead.v, wp.x, wp.y, route.length <= 1 && dEnd < 260 ? Math.max(60, dEnd) : pace, { ignore: c.ignore || (c.ignore = new Set(c.bikes)) });
  // the trail the pairs follow: the leader's line, a point every 6 px
  const tr = c.trail || (c.trail = []);
  const last = tr[0];
  if (!last || Math.hypot(last.x - lead.v.x, last.y - lead.v.y) > 6) { tr.unshift({ x: lead.v.x, y: lead.v.y, a: lead.v.a }); if (tr.length > 160) tr.length = 160; }
  const leadSp = Math.hypot(lead.v.vx, lead.v.vy);
  for (let i = 1; i < riders.length; i++) follow(world, c, riders[i], i, leadSp);
  // there: turn for home; home: park along the porch
  if (!home && (route.length <= 2 || now - c.since > CLUB_RIDE_MAX_S / 2)) { c.mode = 'home'; c.since = now; c.trail = []; c.route = planRoute(world, lead.v.x, lead.v.y, R.lot ? (R.lot.x0 + R.lot.x1) / 2 : R.x, R.lot ? R.lot.y1 - 40 : R.y + 120); }
  else if (home && (Math.hypot(lead.v.x - R.x, lead.v.y - R.y) < 360 || now - c.since > CLUB_RIDE_MAX_S)) park(world, R, c, riders);
}

// where rider i belongs: row i>>1 behind the leader on the trail, the odd ones a little to the side
function slotPoint(c, i) {
  const tr = c.trail || [];
  if (tr.length < 2) return null;
  const back = (i >> 1) * (c.gap || 60);
  let acc = 0, p = tr[0];
  for (let j = 1; j < tr.length; j++) { const q = tr[j], d = Math.hypot(q.x - p.x, q.y - p.y); if (acc + d >= back) { const t = (back - acc) / (d || 1); p = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, a: q.a }; acc = back; break; } acc += d; p = q; }
  if (acc < back - 1) return null;   // (the leader hasn't gone that far yet: wait your turn)
  const side = i & 1 ? -SIDE : 0;   // (the pair rides on the centre-line side of the leader's line)
  return { x: p.x - Math.sin(p.a) * side, y: p.y + Math.cos(p.a) * side, a: p.a };
}
// rows of the formation: the longest bike in the club and a little room behind it
export function rowGap(world, c) { let L = 0; for (const id of c.bikes) { const v = world.get(id); if (v) L = Math.max(L, v.def.L); } return L + 14; }
function slotError(c, r, i) { const s = slotPoint(c, i); return s ? Math.hypot(s.x - r.v.x, s.y - r.v.y) : 0; }
function follow(world, c, r, i, leadSp) {
  const s = slotPoint(c, i);
  if (!s) {   // pulling out one after another: hold still until the leader has gone far enough, then take the line
    const tr = c.trail || [], o = tr[tr.length - 1];
    if (!o || tr.length < 8 + i * 6) { r.v.input.throttle = 0; r.v.input.steer = 0; r.v.input.hb = true; return; }
    driveToward(world, r.v, o.x, o.y, 160, { ignoreObstacles: true }); return;
  }
  // aim a little ahead of the slot along the line; ride faster when behind it, ease off when ahead
  const ax = s.x + Math.cos(s.a) * 34, ay = s.y + Math.sin(s.a) * 34;
  const along = (s.x - r.v.x) * Math.cos(s.a) + (s.y - r.v.y) * Math.sin(s.a);
  const want = Math.max(0, Math.min(r.v.def.max * 0.95, leadSp + along * 1.6));
  driveToward(world, r.v, ax, ay, want, { ignoreObstacles: true });
}

// back at the Spur: each bike rolls to its own place along the porch, the rider gets off and goes back to hanging out
function park(world, R, c, riders) { c.mode = 'park'; c.since = world.time; void riders; void R; }
function parkStep(world, R, c, riders) {
  const now = world.time, late = now - c.since;
  for (const r of riders) {
    const slot = R.slots[r.v.clubSlot] || R.slots[0], d = Math.hypot(r.v.x - slot.x, r.v.y - slot.y);
    if (d < 70 || (late > 12 && !inAnyView(world, r.v.x, r.v.y, 60)) || late > 25) {
      // in its place: square to the porch (nose in or backed in, whichever way it came), off, and back to the others
      r.v.x = slot.x; r.v.y = slot.y; r.v.a = Math.sin(r.v.a) < 0 ? -Math.PI / 2 : Math.PI / 2; r.v.vx = 0; r.v.vy = 0; r.v.av = 0; world.place(r.v);
      r.v.parked = true; r.v.ai = null; r.v.input = { throttle: 0, steer: 0, hb: true };
      dismount(world, r.m, null);
      walkTo(world, R, r.m, hangSpot(world, R, c.i, r.k));
      continue;
    }
    driveToward(world, r.v, slot.x, slot.y + 40, Math.min(150, 30 + d * 1.2), { ignoreObstacles: true });
  }
  if (!riders.length) toHang(world, R, c);
}
function toHang(world, R, c) {
  c.mode = 'hang'; c.since = world.time; c.target = 0; c.trail = []; c.route = null;
  c.members.forEach((id, k) => {
    const m = world.get(id), v = world.get(c.bikes[k]);
    // a bike left out on the road, out of sight: it was ridden home after all
    const slot = R.slots[c.i * CLUB_SIZE + k];
    if (v && !v.removed && !v.wreckAt && !v.seats[0] && slot && Math.hypot(v.x - slot.x, v.y - slot.y) > 30 && !inAnyView(world, v.x, v.y, 60) && !inAnyView(world, slot.x, slot.y, 60)) {
      v.x = slot.x; v.y = slot.y; v.a = slot.a; v.vx = 0; v.vy = 0; v.av = 0; v.parked = true; v.ai = null; world.place(v);
    }
    if (alive(m) && !m.vehId && Math.hypot(m.x - R.x, m.y - R.y) > 1200 && !inAnyView(world, m.x, m.y, 40)) { const h = hangSpot(world, R, c.i, k); m.x = h.x; m.y = h.y; world.place(m); }
    if (!alive(m)) return;
    if (m.vehId) {
      const bike = world.get(m.vehId);
      if (bike) { bike.parked = true; bike.input = { throttle: 0, steer: 0, hb: true }; bike.ai = null; }
      dismount(world, m, null);
    }
    walkTo(world, R, m, hangSpot(world, R, c.i, k));
    if (v && !v.removed && !v.seats[0]) { v.parked = true; v.ai = null; }
  });
}

// ---- the club comes after someone --------------------------------------------------------------------------------------
// npc.onAttacked hands a hurt member here: every member near fights back together, the club holds a grudge, a cop's
// colleagues are drawn in (gangwar.js)
export function clubAttacked(world, ped, attacker) {
  const st = S(world), c = st.clubs.find((q) => q.id === ped.npc.club);
  if (!c || !attacker || attacker === ped || (attacker.npc && attacker.npc.club === ped.npc.club)) return;
  let n = 0;
  for (const id of c.members) {
    const m = world.get(id);
    if (!alive(m)) continue;
    const d = Math.hypot(m.x - attacker.x, m.y - attacker.y);
    if (d > CLUB_FIGHT_PX) continue;
    if (m.vehId && d < 520) { const v = world.get(m.vehId); if (!v || Math.hypot(v.vx, v.vy) < 80 || m === ped) dismount(world, m, null); }
    if (!m.vehId) { startFight(world, m, attacker, 45); n++; }
  }
  st.grudges.set(attacker.id, { club: c.id, until: world.time + CLUB_GRUDGE_S });
  if (attacker.npc && attacker.npc.role === 'cop') gangwar.copAttackedByGang(world, attacker, ped);
  const p = attacker.player;
  if (p && world.time - (p.clubWarnAt || -99) > 20) { p.clubWarnAt = world.time; world.notify(p, `You hurt one of the ${CLUBS[c.i].name}. The whole club is coming for you!`, 'bad'); }
  return n;
}

// a grudge against someone who got away on wheels (or took a club bike): the club mounts up and rides them down
function grudges(world, st, R) {
  for (const [id, g] of st.grudges) {
    const t = world.get(id);
    if (!alive(t) || world.time > g.until) { st.grudges.delete(id); continue; }
    const c = st.clubs.find((q) => q.id === g.club);
    if (!c || c.mode === 'chase' || c.mode === 'mount') continue;
    const fighting = c.members.some((mid) => { const m = world.get(mid); return alive(m) && m.npc.state === 'fight' && m.npc.target === id && Math.hypot(m.x - t.x, m.y - t.y) < 500; });
    if (t.vehId && !fighting && Math.hypot(t.x - R.x, t.y - R.y) < 6000) startChase(world, st, c, t);
  }
}
export function startChase(world, st, c, target) {
  c.mode = 'chase'; c.target = target.id; c.since = world.time;
  // everyone on foot near their bike gets on it (the bar empties out after him)
  c.members.forEach((id, k) => {
    const m = world.get(id), v = world.get(c.bikes[k]);
    if (!alive(m) || m.vehId || !v || v.removed || v.wreckAt || v.seats[0]) return;
    if (Math.hypot(m.x - v.x, m.y - v.y) < 70 || !inAnyView(world, m.x, m.y, 30)) mount(world, m, v);
    else toBike(world, spur(world), m, v, true);   // ...run to it first
  });
}
function chase(world, st, R, c, riders) {
  const t = world.get(c.target), now = world.time;
  // stragglers still running to their bikes hop on when they get there
  c.members.forEach((id, k) => { const m = world.get(id), v = world.get(c.bikes[k]); if (alive(m) && !m.vehId && v && !v.seats[0] && !v.wreckAt && m.npc.state !== 'fight' && Math.hypot(m.x - v.x, m.y - v.y) < v.def.L / 2 + 26) mount(world, m, v); });
  const over = !alive(t) || now - c.since > 150 || Math.hypot(t.x - R.x, t.y - R.y) > 9000;
  if (over) { rideHome(world, R, c); return; }
  const tv = t.vehId ? world.get(t.vehId) : null, tsp = tv ? Math.hypot(tv.vx, tv.vy) : 0;
  // on foot beside him while he sits there: dragged off it (the gang fight itself never pulls a driver out: npc.js)
  if (tv && tsp < 50) for (const id of c.members) {
    const m = world.get(id);
    if (!alive(m) || m.vehId || Math.hypot(m.x - t.x, m.y - t.y) > tv.def.L / 2 + 26 || now - (c.draggedAt || -9) < 4) continue;
    c.draggedAt = now;
    vehicles.ejectPed(world, t, true); t.downUntil = now + 0.8;
    if (t.player) world.notify(t.player, `The ${CLUBS[c.i].short} dragged you off the bike!`, 'bad');
    break;
  }
  for (const r of riders) {
    const d = Math.hypot(r.v.x - t.x, r.v.y - t.y);
    // caught up: knock a thief off his bike; off and at them once they're on foot or stopped
    if (tv && tv.def.kind === 'bike' && d < 75 && t.npc) { vehicles.bikeCrash(world, tv, 330); continue; }
    if (d < 130 && (!tv || tsp < 70)) { dismount(world, r.m, null); startFight(world, r.m, t, 45); continue; }
    driveToward(world, r.v, t.x, t.y, Math.min(r.v.def.max * 0.95, d < 300 ? Math.max(120, tsp + 60) : r.v.def.max), { ignore: c.ignore || (c.ignore = new Set(c.bikes)) });
  }
}
function rideHome(world, R, c) {
  // whoever's on foot gets back on their own bike if it's to hand; then home in formation
  c.members.forEach((id, k) => { const m = world.get(id), v = world.get(c.bikes[k]); if (alive(m) && !m.vehId && v && !v.removed && !v.wreckAt && !v.seats[0] && (Math.hypot(m.x - v.x, m.y - v.y) < 300 || !inAnyView(world, m.x, m.y, 30))) mount(world, m, v); });
  const lead = c.members.map((id) => world.get(id)).find((m) => alive(m) && m.vehId);
  if (!lead) { toHang(world, R, c); return; }
  c.mode = 'home'; c.since = world.time; c.trail = []; c.target = 0; c.gap = rowGap(world, c);
  c.route = planRoute(world, lead.x, lead.y, R.lot ? (R.lot.x0 + R.lot.x1) / 2 : R.x, R.lot ? R.lot.y1 - 40 : R.y + 120);
}

// ---- club bikes taken ---------------------------------------------------------------------------------------------------
function watchBikes(world, st, R) {
  for (const c of st.clubs) c.bikes.forEach((bid) => {
    const v = world.get(bid);
    if (!v || v.removed) return;
    const d = v.seats[0] ? world.get(v.seats[0]) : null;
    if (!d || (d.npc && d.npc.club === c.id)) return;
    if (st.thief && st.thief.ped === d.id) return;   // (the bike thief: thiefStep has him)
    if (v.ai) v.ai = null;   // (not the club's to steer any more)
    if (st.grudges.has(d.id)) return;
    st.grudges.set(d.id, { club: c.id, until: world.time + CLUB_GRUDGE_S });
    if (d.player) world.notify(d.player, `That's an ${CLUBS[c.i].short} bike. The ${CLUBS[c.i].name} is coming after you!`, 'bad');
    startChase(world, st, c, d);
  });
}

// ---- the bike thief (MC5) ------------------------------------------------------------------------------------------------
// someone walks up to a club bike out front and rides off on it; the club pours out after him
export function startBikeThief(world) {
  const st = S(world), R = spur(world);
  if (!R || !st.up || st.thief) return null;
  const parked = [];
  for (const c of st.clubs) c.bikes.forEach((bid) => { const v = world.get(bid); if (v && !v.removed && !v.wreckAt && !v.seats[0] && v.parked && v.def.max > 500) parked.push({ v, c }); });
  if (!parked.length) return null;
  const { v, c } = parked[Math.floor(rng() * parked.length)];
  // he comes in from the dark edge of the lot
  const sx = v.x + (rng() < 0.5 ? -1 : 1) * (220 + rng() * 80), sy = v.y + 150 + rng() * 60;
  const t = spawnNpc(world, 'mugger', sx, sy, 'civ');
  t.npc.keep = true; t.npc.thief = true; t.npc.guard = { x: v.x + 16, y: v.y + 10, a: -Math.PI / 2 };
  t.name = 'Bike thief';
  st.thief = { ped: t.id, bike: v.id, club: c.id, at: world.time, stage: 'walk' };
  return st.thief;
}
function thiefStep(world, st, R) {
  const T = st.thief, t = world.get(T.ped), v = world.get(T.bike), c = st.clubs.find((q) => q.id === T.club), now = world.time;
  if (!c) { st.thief = null; return; }
  if (T.stage === 'walk') {
    if (!alive(t) || !v || v.removed || v.seats[0]) { endThief(world, st, R, t, false); return; }
    if (Math.hypot(t.x - v.x, t.y - v.y) < 30 || now - T.at > 25) {
      if (t.npc) t.npc.guard = null;
      if (mount(world, t, v)) {
        T.stage = 'ride'; T.rideAt = now;
        const away = world.map.pois.filter((p) => (p.kind === 'gasstation' || p.kind === 'convenience') && Math.hypot(p.x - R.x, p.y - R.y) > 5000);
        const to = away.length ? away[Math.floor(rng() * away.length)] : { x: R.x - 9000, y: R.y };
        T.route = planRoute(world, v.x, v.y + 200, to.x, to.y);
        T.ev = events.add(world, { kind: 'bikethief', x: v.x, y: v.y, until: now + 150, text: `A thief rode off on an ${CLUBS[c.i].short} bike from the Rusty Spur - the club's after him` }).id;
        for (const p of players(world)) if (Math.hypot(p.ped.x - v.x, p.ped.y - v.y) < 1600) world.notify(p, `Someone's riding off on an ${CLUBS[c.i].short} bike! The club is pouring out after him.`, 'warn');
        startChase(world, st, c, t);
      }
    }
    return;
  }
  // riding off: along his route, flat out (but he's no rider: three-quarters of what the bike can do)
  if (!alive(t) || !t.vehId || t.hp < t.maxHp * 0.35 || now - T.rideAt > 150) { endThief(world, st, R, t, true); return; }
  const tv = world.get(t.vehId);
  if (!tv) { endThief(world, st, R, t, true); return; }
  tv.ai = tv.ai && tv.ai.kind === 'thief' ? tv.ai : { kind: 'thief' };
  while (T.route.length > 1 && Math.hypot(T.route[0].x - tv.x, T.route[0].y - tv.y) < 70) T.route.shift();
  const wp = T.route[0];
  if (wp) driveToward(world, tv, wp.x, wp.y, tv.def.max * 0.75, {});
  if (events && T.ev && world.happenings) { const e = world.happenings.find((q) => q.id === T.ev); if (e) { e.x = tv.x; e.y = tv.y; } }
}
function endThief(world, st, R, t, rode) {
  const T = st.thief;
  st.thief = null;
  if (T.ev && world.happenings) world.happenings = world.happenings.filter((e) => e.id !== T.ev);
  if (!t || t.removed) return;
  // knocked off it by a player: the club owes them
  const by = t.lastHitBy ? world.get(t.lastHitBy) : null, p = by && by.player;
  if (rode && p && (t.dead || t.hp < t.maxHp * 0.35 || !t.vehId)) {
    p.profile.cash += BIKE_THIEF_REWARD; p.profile.samaritan += BIKE_THIEF_RESPECT; p.meDirty = true; store.touch();
    world.notify(p, `You stopped the bike thief. The ${CLUBS.find((q) => q.id === T.club).name} owes you one: +$${BIKE_THIEF_REWARD}.`, 'good');
  }
  if (t.vehId) { const tv = world.get(t.vehId); if (tv) tv.ai = null; vehicles.ejectPed(world, t, true); }
  if (!t.dead && t.npc) { t.npc.thief = false; t.npc.guard = null; t.npc.state = 'flee'; t.npc.fx = R.x; t.npc.fy = R.y; t.npc.until = world.time + 20; t.npc.keep = false; }
}

// for the dev menu and the tests: who's who, and a ride out now
export function clubsOf(world) { return S(world).clubs; }
export function rideOut(world, ci = 0, dest = null) { const st = S(world), R = spur(world), c = st.clubs[ci]; return R && c && c.mode === 'hang' ? startRide(world, st, R, c, dest) : null; }
void K;
