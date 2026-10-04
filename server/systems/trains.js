// Trains. Two trains run one big loop around the city - over the trestle off the west coast,
// through the channels, under Downtown in the subway tunnel and across the open fields of
// Refuge Island - stopping at every station. Nothing stops them and nothing hurts them: a car on
// the line gets shoved along in front of the engine and blows up if it can't get off; people get
// thrown. Anyone can ride: players, NPC commuters (seated or standing), and cops who come aboard
// at the next station for a wanted passenger. Level crossings drop their gates when a train is
// coming; most drivers wait, a few gamble, and you can smash straight through the arms.
// The mail train carries a strongbox: the long Refuge Island run is robbery country.
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { railAt, TRAIN_CARS, COACH_SEATS, COACH_STAND, MAIL_BOX, MAIL_POSTS, CROSSING_ARM, PED_BLOCK, isSwimming } from '../../shared/map.js';
import { obbVsObb, circleVsObb, localToWorld, clamp } from '../../shared/math.js';
import { TRAIN_SPEED, TRAIN_DWELL_S, TRAIN_DRAG_EXPLODE_S, CROSSING_WARN_PX, TRAIN_JOB_PAY, STRONGBOX_CRACK_S, TRAIN_ALARM_STARS } from '../../shared/rules.js';
import { STAR_HEAT } from '../../shared/constants.js';
import { mulberry32 } from '../../shared/rng.js';
import * as vehicles from './vehicles.js';
import * as combat from './combat.js';
import * as law from './law.js';
import * as cargo from './cargo.js';
import { spawnNpc, despawnNpc } from './npc.js';

const rng = mulberry32(8080);
const GAP = 10, ACC = 70, DEC = 110;
const CONSISTS = [['loco', 'coach', 'coach', 'mail'], ['loco', 'coach', 'coach', 'coach']];
const CAR_IDX = { loco: 0, coach: 1, mail: 2 };
const WALK = 95, RUN = 150;
const POP_NEAR = 1500, POP_FAR = 2600;
const BOX_RESET_S = 300;
const COMMUTERS = ['casual', 'casual', 'executive', 'socialite', 'senior', 'athlete', 'construction', 'hustler'];

const mod = (a, n) => ((a % n) + n) % n;
const half = (c) => c.def.L / 2 - 12;

// ---- setup ------------------------------------------------------------------------------------
export function init(world) {
  world.trains = [];
  world.xing = [];
  const rail = world.map.rail;
  if (!rail) return;
  const sts = rail.stations;
  CONSISTS.forEach((cons, ti) => {
    const cars = [];
    let off = 0;
    cons.forEach((kind, ci) => {
      const def = TRAIN_CARS[CAR_IDX[kind]];
      const e = world.add({ id: world.newId(), kind: K.TRAIN, x: 0, y: 0, a: 0, vx: 0, vy: 0, train: ti, car: ci, carType: CAR_IDX[kind], sub: false, cx: -1, cy: -1 });
      cars.push({ kind, def, off: off + def.L / 2, id: e.id });
      off += def.L + GAP;
    });
    const len = off - GAP;
    const si = Math.floor(ti * sts.length / CONSISTS.length);
    const t = {
      i: ti, cars, len, s: mod(sts[si].s + len / 2, rail.len), v: 0, stop: si, dwellUntil: world.time + TRAIN_DWELL_S * (ti ? 0.6 : 1),
      riders: new Set(), boarding: new Set(), mail: cons.indexOf('mail'), boxReadyAt: 0, hornUntil: 0, hornedFor: -1, hadPlayer: false,
    };
    world.trains.push(t);
    placeCars(world, t);
  });
  world.xing = rail.crossings.map(() => ({ down: false, eta: 99, closure: 0, broken: [0, 0] }));
}

// ---- per tick ---------------------------------------------------------------------------------
export function update(world, dt) {
  if (!world.trains || !world.trains.length) return;
  for (const t of world.trains) {
    stepTrain(world, t, dt);
    placeCars(world, t);
    stepRiders(world, t, dt);
    stepBoarding(world, t, dt);
    collide(world, t, dt);
    hornForCrossings(world, t);
  }
  updateCrossings(world);
  if (world.tick % 20 === 7) for (const t of world.trains) populate(world, t);
  stepCracking(world);
  updateJobs(world);
}

function stepTrain(world, t, dt) {
  const rail = world.map.rail, sts = rail.stations, now = world.time;
  if (t.dwellUntil) {
    t.v = 0;
    if (now >= t.dwellUntil) { t.dwellUntil = 0; t.stop = (t.stop + 1) % sts.length; t.hornUntil = now + 0.9; departed(world, t); }
    return;
  }
  const target = sts[t.stop].s + t.len / 2;
  const d = mod(target - t.s, rail.len);
  const want = Math.min(TRAIN_SPEED, Math.sqrt(2 * DEC * Math.max(0, d - 1)));
  if (t.v < want) t.v = Math.min(want, t.v + ACC * dt); else t.v = Math.max(want, t.v - DEC * 1.6 * dt);
  if (d > 2 && t.v < 14) t.v = 14; // crawl the last few metres into the platform
  const step = Math.min(d, t.v * dt);
  t.s = mod(t.s + step, rail.len);
  if (d - step < 1.5) { t.s = mod(target, rail.len); t.v = 0; t.dwellUntil = now + TRAIN_DWELL_S; arrived(world, t); }
}

function carPose(rail, t, c) {
  const sc = t.s - c.off, h = c.def.L * 0.4;
  const f = railAt(rail, sc + h), b = railAt(rail, sc - h), m = railAt(rail, sc);
  return { x: (f.x + b.x) / 2, y: (f.y + b.y) / 2, a: Math.atan2(f.y - b.y, f.x - b.x), sub: m.under };
}

function placeCars(world, t) {
  const rail = world.map.rail, now = world.time;
  const lit = world.clock.dark > 0.3;
  for (const c of t.cars) {
    const e = world.get(c.id);
    if (!e) continue;
    const q = carPose(rail, t, c);
    e.x = q.x; e.y = q.y; e.a = q.a;
    e.vx = Math.cos(q.a) * t.v; e.vy = Math.sin(q.a) * t.v;
    e.sub = q.sub;
    e.doors = !!t.dwellUntil;
    e.horn = now < t.hornUntil;
    e.lit = lit || q.sub;
    e.boxGone = e.carType === 2 && now < t.boxReadyAt;
  }
}

export function carEntity(world, t, ci) { return world.get(t.cars[ci].id); }
export function trainOf(world, ped) { return ped && ped.onTrain ? world.trains[ped.onTrain.t] : null; }

// ---- riders -----------------------------------------------------------------------------------
const passable = (t, ci) => ci >= 1 && ci < t.cars.length;

// Move a rider along the train: dU backwards (towards the tail) and dO sideways. Walking past
// the end of a car takes you through the gangway into the next one (never into the cab).
function walk(t, r, dU, dO) {
  let ox = r.ox - dU;
  const h = half(t.cars[r.c]);
  if (ox < -h && passable(t, r.c + 1)) { r.c++; ox = half(t.cars[r.c]); }
  else if (ox > h && passable(t, r.c - 1)) { r.c--; ox = -half(t.cars[r.c]); }
  const h2 = half(t.cars[r.c]);
  r.ox = clamp(ox, -h2, h2);
  const w2 = t.cars[r.c].def.W / 2 - 12;
  r.oy = clamp(r.oy + dO, -w2, w2);
}
const uOf = (t, r) => t.cars[r.c].off - r.ox; // distance back from the engine's nose

function stepRiders(world, t, dt) {
  const now = world.time;
  for (const id of t.riders) {
    const p = world.get(id);
    if (!p || p.removed || !p.onTrain || p.onTrain.t !== t.i) { t.riders.delete(id); continue; }
    const r = p.onTrain;
    if (p.npc && p.dead) world.bodies.delete(p); // no ambulance chases a moving train: carried off at the next stop
    if (p.npc && !p.dead && now >= p.downUntil && now >= p.stunUntil) npcRide(world, t, p, dt);
    const e = world.get(t.cars[r.c].id);
    const [x, y] = localToWorld(e.x, e.y, e.a, r.ox, r.oy);
    p.x = x; p.y = y; p.vx = e.vx; p.vy = e.vy; p.sub = e.sub; p.under = false; p.rollT = 0; p.tumbleUntil = 0; p.airUntil = 0;
    if (p.npc && !p.dead && r.la !== undefined) p.a = e.a + r.la;
    if (p.player) {
      const inMail = r.c === t.mail;
      if (inMail && !r.mailSince) { r.mailSince = now; world.notify(p.player, 'MAIL CAR - authorised staff only. The guards are armed!', 'warn'); }
      else if (!inMail) r.mailSince = 0;
    }
  }
}

function seatTaken(world, t, ci, ox, oy) {
  for (const id of t.riders) { const q = world.get(id); if (q && q.onTrain && q.onTrain.c === ci && Math.abs(q.onTrain.ox - ox) < 10 && Math.abs(q.onTrain.oy - oy) < 10) return true; }
  return false;
}
function freeSpot(world, t, ci, preferSeat) {
  const lists = preferSeat ? [COACH_SEATS, COACH_STAND] : [COACH_STAND, COACH_SEATS];
  for (const list of lists) {
    const start = Math.floor(rng() * list.length);
    for (let k = 0; k < list.length; k++) { const [ox, oy] = list[(start + k) % list.length]; if (!seatTaken(world, t, ci, ox, oy)) return { ox, oy, seat: list === COACH_SEATS }; }
  }
  return null;
}

export function board(world, ped, t, ci, ox, oy, la) {
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  if (ped.carrying) cargo.dropCrate(world, ped);
  if (ped.fishing && ped.player) ped.fishing = null;
  t.riders.add(ped.id);
  t.boarding.delete(ped.id);
  ped.onTrain = { t: t.i, c: ci, ox, oy, la };
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  if (ped.npc) ped.npc.boardTrain = null;
  if (ped.player) { ped.player.meDirty = true; world.emit(ped.x, ped.y, { e: 'door', x: ped.x, y: ped.y }); }
}

export function alight(world, ped, x, y) {
  const t = trainOf(world, ped);
  if (t) t.riders.delete(ped.id);
  ped.onTrain = null; ped.sub = false;
  ped.x = x; ped.y = y;
  world.place(ped);
  if (ped.player) { ped.player.meDirty = true; ped.player.crack = null; }
}

// Door on the side facing the platform (or a side you can step out onto).
function doorSide(world, t, ci, st) {
  const e = world.get(t.cars[ci].id);
  const nx = -Math.sin(e.a), ny = Math.cos(e.a);
  if (st && !st.under) return Math.sign((st.platform.x - e.x) * nx + (st.platform.y - e.y) * ny) || 1;
  for (const sd of [1, -1]) { const x = e.x + nx * sd * 56, y = e.y + ny * sd * 56; if (!PED_BLOCK[world.map.tileAtPx(x, y)]) return sd; }
  return 1;
}
function doorPoint(world, t, ci, side, out) {
  const e = world.get(t.cars[ci].id);
  const [x, y] = localToWorld(e.x, e.y, e.a, 0, side * (t.cars[ci].def.W / 2 + out)); // doors are mid-car
  return { x, y };
}
const stationAt = (world, t) => (t.dwellUntil ? world.map.rail.stations[t.stop] : null);

// Step off at a station (onto the platform, or up the stairs to the street for the subway).
function alightAtStation(world, t, ped) {
  const st = stationAt(world, t);
  if (!st) return false;
  if (st.under) { const a = rng() * 6.28; alight(world, ped, st.platform.x + Math.cos(a) * 14, st.platform.y + Math.sin(a) * 14); }
  else { const pt = doorPoint(world, t, ped.onTrain.c, doorSide(world, t, ped.onTrain.c, st), 22 + rng() * 12); alight(world, ped, pt.x, pt.y); }
  if (ped.npc) { ped.npc.state = 'wander'; ped.npc.until = 0; ped.npc.wx = ped.x; ped.npc.wy = ped.y; }
  return true;
}

// Jump off a moving train: out of the door and tumbling along the ground.
function jumpOff(world, ped) {
  const t = trainOf(world, ped);
  const r = ped.onTrain;
  const e = world.get(t.cars[r.c].id);
  const side = doorSide(world, t, r.c, null);
  const nx = -Math.sin(e.a) * side, ny = Math.cos(e.a) * side;
  const [x, y] = localToWorld(e.x, e.y, e.a, r.ox, side * (t.cars[r.c].def.W / 2 + 14));
  alight(world, ped, x, y);
  if (t.v > 40) vehicles.fling(world, ped, e.vx * 0.75 + nx * 120, e.vy * 0.75 + ny * 120, null, 'bail');
  else { ped.vx = nx * 60; ped.vy = ny * 60; }
}

// NPC behaviour on board: commuters sit or stand and glance around; spooked ones run down the
// train; cops hunt their suspect through the cars; the mail guards hold their posts and shoot
// anyone who comes into the mail car.
function npcRide(world, t, p, dt) {
  const n = p.npc, r = p.onTrain, now = world.time;
  if (n.role === 'cop' || n.role === 'railguard') {
    let target = n.target ? world.get(n.target) : null;
    if (n.role === 'railguard') {
      if (!target || target.dead || !target.onTrain || target.onTrain.t !== t.i) {
        target = null;
        for (const id of t.riders) { const q = world.get(id); if (q && q.player && !q.dead && q.onTrain.c === t.mail && now - (q.onTrain.mailSince || now) > 2) { target = q; break; } }
      }
    } else if (target && (target.dead || !target.player || target.player.wanted <= 0)) target = null;
    if (target && target.onTrain && target.onTrain.t === t.i) {
      n.target = target.id;
      const du = uOf(t, target.onTrain) - uOf(t, r);
      const dist = Math.hypot(target.x - p.x, target.y - p.y);
      if (Math.abs(du) > 70 && (n.role === 'cop' || Math.abs(du) < 260)) { walk(t, r, Math.sign(du) * Math.min(Math.abs(du) - 60, RUN * dt), clamp((target.onTrain.oy - r.oy) * 0.2, -2, 2)); r.la = du > 0 ? Math.PI : 0; }
      if (dist < 300) {
        const aim = Math.atan2(target.y - p.y, target.x - p.x);
        p.aimUntil = now + 0.3; p.aimAngle = aim; r.la = aim - world.get(t.cars[r.c].id).a;
        combat.tryAttack(world, p, aim);
      }
      return;
    }
    n.target = 0;
    if (n.role === 'railguard' && n.post) { const du = (t.cars[n.post.c].off - n.post.ox) - uOf(t, r); if (Math.abs(du) > 4) walk(t, r, Math.sign(du) * Math.min(Math.abs(du), WALK * dt), clamp((n.post.oy - r.oy) * 0.2, -2, 2)); }
    if (now >= (n.lookAt || 0)) { r.la = (r.la || 0) + (rng() - 0.5) * 1.6; n.lookAt = now + 1.5 + rng() * 2.5; }
    return;
  }
  // commuters
  if (n.state === 'flee' || n.state === 'fight') {
    if (now > n.until) { n.state = 'wander'; return; }
    const away = (n.fx ?? p.x) - p.x, awayY = (n.fy ?? p.y) - p.y;
    const e = world.get(t.cars[r.c].id);
    const along = away * Math.cos(e.a) + awayY * Math.sin(e.a); // threat ahead (+) or behind (-)
    walk(t, r, along >= 0 ? RUN * dt : -RUN * dt, 0);
    r.la = along >= 0 ? Math.PI : 0;
    r.seat = false;
    return;
  }
  if (now >= (n.lookAt || 0)) {
    r.la = r.seat ? (r.ox < 0 ? 0 : Math.PI) + (rng() - 0.5) * 0.9 : rng() * 6.28;
    n.lookAt = now + 2 + rng() * 4;
  }
}

// ---- stations: who gets off, who gets on ------------------------------------------------------
function playerNear(world, x, y, r) { for (const p of world.players.values()) if (p.ped && !p.ped.dead && Math.hypot(p.ped.x - x, p.ped.y - y) < r) return true; return false; }
function playerAboard(world, t) { for (const id of t.riders) { const q = world.get(id); if (q && q.player) return true; } return false; }

function arrived(world, t) {
  const st = world.map.rail.stations[t.stop];
  const loco = world.get(t.cars[0].id);
  world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 1 });
  // the dead are carried off at the next stop
  for (const id of [...t.riders]) { const q = world.get(id); if (q && q.npc && q.dead) { t.riders.delete(id); world.bodies.delete(q); despawnNpc(world, q); } }
  if (!playerNear(world, st.platform.x, st.platform.y, POP_NEAR) && !playerAboard(world, t)) return;
  for (const id of [...t.riders]) {
    const q = world.get(id);
    if (!q || !q.npc || q.dead) continue;
    const n = q.npc;
    if (n.role === 'civ' && (q.onTrain.dest === t.stop || rng() < 0.15)) alightAtStation(world, t, q);
    else if (n.role === 'cop' && !n.target && rng() < 0.7) { alightAtStation(world, t, q); n.beat = true; }
  }
  // police come aboard for a wanted passenger
  for (const id of t.riders) {
    const q = world.get(id);
    if (!q || !q.player || q.dead || q.player.wanted <= 0) continue;
    let cops = 0;
    for (const cid of t.riders) { const c = world.get(cid); if (c && c.npc && c.npc.role === 'cop' && !c.dead) cops++; }
    const want = Math.min(4, 1 + q.player.wanted) - cops;
    for (let k = 0; k < want; k++) {
      const ci = 1 + Math.floor(rng() * (t.cars.length - 1));
      const pt = st.under ? st.platform : doorPoint(world, t, ci, doorSide(world, t, ci, st), 20);
      const cop = spawnNpc(world, q.player.wanted >= 4 ? 'swat' : 'cop', pt.x, pt.y, 'cop');
      cop.weapon = q.player.wanted >= 4 ? 'pshotgun' : 'pistol';
      cop.npc.target = q.id; cop.npc.trainCop = true;
      board(world, cop, t, ci, 0, k % 2 ? 12 : -12, 0);
    }
    if (want > 0) world.notify(q.player, `Police boarding the train at ${st.name}!`, 'bad');
    break;
  }
  // new commuters walk up to the doors
  const n = st.under ? 1 + Math.floor(rng() * 3) : Math.floor(rng() * 4);
  for (let k = 0; k < n; k++) {
    const ci = 1 + Math.floor(rng() * (t.cars.length - 1));
    if (ci === t.mail) continue;
    const arche = COMMUTERS[Math.floor(rng() * COMMUTERS.length)];
    if (st.under) { const spot = freeSpot(world, t, ci, true); if (!spot) continue; const q = spawnNpc(world, arche, st.platform.x, st.platform.y, 'civ'); board(world, q, t, ci, spot.ox, spot.oy, 0); q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t); continue; }
    const side = doorSide(world, t, ci, st);
    const pt = doorPoint(world, t, ci, side, 50 + rng() * 50);
    const e = world.get(t.cars[ci].id);
    const along = (rng() - 0.5) * 120;
    const x = pt.x + Math.cos(e.a) * along, y = pt.y + Math.sin(e.a) * along;
    if (PED_BLOCK[world.map.tileAtPx(x, y)]) continue;
    const q = spawnNpc(world, arche, x, y, 'civ');
    q.npc.boardTrain = { t: t.i, c: ci, side };
    t.boarding.add(q.id);
  }
}

function departed(world, t) {
  const loco = world.get(t.cars[0].id);
  world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 1 });
  for (const id of t.boarding) { const q = world.get(id); if (q && q.npc) { q.npc.boardTrain = null; q.npc.state = 'wander'; q.npc.until = 0; } }
  t.boarding.clear();
}

function pickDest(world, t) { const n = world.map.rail.stations.length; return (t.stop + 1 + Math.floor(rng() * (n - 1))) % n; }

// Commuters on the platform walk to the nearest door and step aboard.
function stepBoarding(world, t, dt) {
  if (!t.boarding.size) return;
  for (const id of t.boarding) {
    const q = world.get(id);
    if (!q || q.dead || q.removed || !q.npc || !q.npc.boardTrain) { t.boarding.delete(id); continue; }
    if (world.time < q.downUntil) continue;
    const bt = q.npc.boardTrain;
    const door = doorPoint(world, t, bt.c, bt.side, 6);
    const dx = door.x - q.x, dy = door.y - q.y, d = Math.hypot(dx, dy);
    if (d < 14) {
      const spot = freeSpot(world, t, bt.c, rng() < 0.7);
      if (!spot) { q.npc.boardTrain = null; q.npc.state = 'wander'; t.boarding.delete(id); continue; }
      board(world, q, t, bt.c, spot.ox, spot.oy, spot.seat ? (spot.ox < 0 ? 0 : Math.PI) : rng() * 6.28);
      q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t);
      continue;
    }
    const sp = WALK * q.npc.speed * 1.1;
    q.vx = dx / d * sp; q.vy = dy / d * sp; q.a = Math.atan2(dy, dx);
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
}

// Keep the trains peopled while someone is around to see them; empty them out when nobody is.
function populate(world, t) {
  let near = playerAboard(world, t), close = near;
  if (!near) for (const c of t.cars) { const e = world.get(c.id); if (playerNear(world, e.x, e.y, POP_FAR)) { near = true; if (playerNear(world, e.x, e.y, POP_NEAR)) close = true; break; } }
  if (!near) {
    for (const id of [...t.riders]) { const q = world.get(id); if (q && q.npc) { t.riders.delete(id); world.bodies.delete(q); despawnNpc(world, q); } }
    return;
  }
  if (playerAboard(world, t) && !t.dwellUntil) return; // nobody pops into existence in front of a passenger
  if (!close && t.riders.size) return;
  if (world.npcCount + world.trafficCount > world.npcBudget) return;
  for (let ci = 1; ci < t.cars.length; ci++) {
    if (ci === t.mail) {
      let guards = 0;
      for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.npc.role === 'railguard' && !q.dead && q.onTrain.c === ci) guards++; }
      for (let k = guards; k < MAIL_POSTS.length && world.time >= t.boxReadyAt - BOX_RESET_S + 60; k++) {
        const [ox, oy] = MAIL_POSTS[k];
        const e = world.get(t.cars[ci].id);
        const g = spawnNpc(world, 'cop', e.x, e.y, 'railguard');
        g.weapon = 'pistol'; g.app.tc = '#3a3a3e'; g.app.tc2 = '#d9a21b'; g.app.htc = '#3a3a3e';
        g.npc.post = { c: ci, ox, oy };
        board(world, g, t, ci, ox, oy, Math.PI);
      }
      continue;
    }
    let count = 0;
    for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.onTrain.c === ci) count++; }
    const want = 2 + Math.floor(rng() * 4);
    for (let k = count; k < want; k++) {
      const spot = freeSpot(world, t, ci, rng() < 0.75);
      if (!spot) break;
      const e = world.get(t.cars[ci].id);
      const q = spawnNpc(world, COMMUTERS[Math.floor(rng() * COMMUTERS.length)], e.x, e.y, 'civ');
      board(world, q, t, ci, spot.ox, spot.oy, spot.seat ? (spot.ox < 0 ? 0 : Math.PI) : rng() * 6.28);
      q.onTrain.seat = spot.seat; q.onTrain.dest = pickDest(world, t);
    }
  }
}

// ---- collisions: nothing stops a train --------------------------------------------------------
function collide(world, t, dt) {
  const now = world.time;
  for (let ci = 0; ci < t.cars.length; ci++) {
    const c = t.cars[ci], e = world.get(c.id);
    if (!e || e.sub) continue;
    const hl = c.def.L / 2, hw = c.def.W / 2;
    const ca = Math.cos(e.a), sa = Math.sin(e.a);
    for (const v of world.query(e.x, e.y, hl + 80, K.VEH)) {
      if (v.removed || v.def.kind === 'boat' || v.sinkAt) continue;
      const hit = obbVsObb(e.x, e.y, e.a, hl, hw, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
      if (!hit) continue;
      const lx = (v.x - e.x) * ca + (v.y - e.y) * sa, ly = -(v.x - e.x) * sa + (v.y - e.y) * ca;
      const ahead = ci === 0 && lx > hl - 8 && t.v > 15;
      v.x -= hit.nx * hit.depth; v.y -= hit.ny * hit.depth;
      const closing = (v.vx - e.vx) * hit.nx + (v.vy - e.vy) * hit.ny; // >0: the train is running into it
      if (closing > 0) {
        const k = ahead ? 1.02 : 1.3;
        v.vx -= hit.nx * closing * k; v.vy -= hit.ny * closing * k;
        if (closing > 120) v.av += (ly >= 0 ? 1 : -1) * Math.min(2, closing / 260);
      }
      const dragging = ahead && now - (v.trainDragAt || -9) < 0.35;
      if (closing > 120 && !dragging && now > (v.trainHitAt || 0) + 0.5) {
        v.trainHitAt = now;
        world.emit(v.x, v.y, { e: 'crash', x: v.x, y: v.y, p: Math.min(1, closing / 400) });
        vehicles.damageVehicle(world, v, (closing - 90) * 0.2, null, true); // a hard knock - the drag is what finishes it
        if (v.def.kind === 'bike') for (const sid of [...v.seats]) { const q = sid && world.get(sid); if (q) { vehicles.ejectPed(world, q, true); vehicles.fling(world, q, v.vx, v.vy, null, 'train'); combat.damage(world, q, closing * 0.3, null, 'train'); } }
      }
      if (ahead) {
        if (v.wreckAt) { v.vx += -sa * (ly >= 0 ? 1 : -1) * 260 * dt * 10; v.vy += ca * (ly >= 0 ? 1 : -1) * 260 * dt * 10; continue; } // shove the burning wreck off the line
        v.trainDrag = now - (v.trainDragAt || -9) < 0.35 ? (v.trainDrag || 0) + dt : dt;
        v.trainDragAt = now;
        // pinned to the nose: it only comes free if someone at the wheel steers (and powers) it off
        if (Math.abs(v.input.throttle) < 0.3) {
          const lat = -v.vx * sa + v.vy * ca, latE = -e.vx * sa + e.vy * ca;
          v.vx -= -sa * (lat - latE) * 0.5; v.vy -= ca * (lat - latE) * 0.5;
          v.av *= 0.6;
        }
        vehicles.damageVehicle(world, v, v.def.hp * 0.09 * dt, null, true);
        if ((world.tick + v.id) % 4 === 0) world.emit(v.x, v.y, { e: 'spark', x: v.x, y: v.y });
        if (v.trainDrag >= TRAIN_DRAG_EXPLODE_S && !v.wreckAt) vehicles.explode(world, v, null);
        const d = v.seats[0] ? world.get(v.seats[0]) : null;
        if (d && d.player && now - (d.player.trainWarnAt || -9) > 2) { d.player.trainWarnAt = now; world.notify(d.player, 'You\'re being dragged by the train - steer off the tracks!', 'bad'); }
      }
    }
    if (t.v < 1) continue;
    for (const p of world.query(e.x, e.y, hl + 30, K.PED)) {
      if (p.onTrain || p.vehId || p.hidden || isSwimming(world.map, p)) continue;
      const h = circleVsObb(p.x, p.y, p.r, e.x, e.y, e.a, hl, hw);
      if (!h) continue;
      p.x += h.nx * h.depth; p.y += h.ny * h.depth;
      if (p.dead) continue;
      const closing = (e.vx - p.vx) * h.nx + (e.vy - p.vy) * h.ny;
      if (t.v > 50 && closing > 40 && now > (p.hitImmuneUntil || 0)) {
        p.hitImmuneUntil = now + 0.8;
        world.emit(p.x, p.y, { e: 'blood', x: p.x, y: p.y, a: e.a, n: 14 });
        world.emit(p.x, p.y, { e: 'crash', x: p.x, y: p.y, p: 0.6 });
        vehicles.fling(world, p, e.vx * 0.9 + h.nx * 230, e.vy * 0.9 + h.ny * 230, null, 'train', 0);
        combat.damage(world, p, 35 + t.v * 0.35, null, 'train', e.a);
      }
    }
  }
  // people on the line get out of the way (most of them)
  if (t.v > 60 && (world.tick + t.i) % 4 === 0) {
    const loco = world.get(t.cars[0].id);
    const ca = Math.cos(loco.a), sa = Math.sin(loco.a);
    for (const p of world.query(loco.x + ca * 260, loco.y + sa * 260, 260, K.PED)) {
      if (!p.npc || p.dead || p.vehId || p.onTrain || p.npc.role !== 'civ' || p.npc.state === 'flee') continue;
      const dx = p.x - loco.x, dy = p.y - loco.y, ly = -dx * sa + dy * ca;
      if (Math.abs(ly) > 50 || dx * ca + dy * sa < 0) continue;
      p.npc.state = 'flee'; p.npc.until = world.time + 2.5;
      p.npc.fx = p.x - (-sa) * (ly >= 0 ? 1 : -1) * 40; p.npc.fy = p.y - ca * (ly >= 0 ? 1 : -1) * 40;
    }
  }
}

// ---- level crossings ----------------------------------------------------------------------------
function updateCrossings(world) {
  const rail = world.map.rail, now = world.time;
  rail.crossings.forEach((c, i) => {
    const st = world.xing[i];
    let down = false, eta = 99;
    for (const t of world.trains) {
      const ahead = mod(c.s - t.s, rail.len), behind = mod(t.s - c.s, rail.len);
      if (behind < t.len + 30) { down = true; eta = 0; continue; }
      if (ahead < CROSSING_WARN_PX) {
        down = true;
        const wait = t.dwellUntil ? t.dwellUntil - now : 0;
        eta = Math.min(eta, wait + ahead / Math.max(80, t.v || 0));
      }
    }
    let changed = down !== st.down;
    if (down && !st.down) st.closure++;
    st.down = down; st.eta = eta;
    if (down) {
      const rx = -Math.sin(c.a), ry = Math.cos(c.a), tx = Math.cos(c.a), ty = Math.sin(c.a);
      for (const v of world.query(c.x, c.y, c.hw + 140, K.VEH)) {
        if (Math.abs(v.vx) + Math.abs(v.vy) < 40 || v.def.kind === 'boat') continue;
        const along = (v.x - c.x) * rx + (v.y - c.y) * ry, across = (v.x - c.x) * tx + (v.y - c.y) * ty;
        if (Math.abs(across) > c.hw + 6) continue;
        for (const side of [0, 1]) {
          const sg = side ? -1 : 1;
          if (st.broken[side] || Math.abs(along - sg * CROSSING_ARM) > v.def.L / 2 + 4) continue;
          st.broken[side] = now; changed = true;
          const bx = c.x + rx * sg * CROSSING_ARM, by = c.y + ry * sg * CROSSING_ARM;
          world.emit(bx, by, { e: 'gatebreak', x: bx, y: by, a: Math.atan2(v.vy, v.vx) });
        }
      }
    } else if ((st.broken[0] && now - st.broken[0] > 40) || (st.broken[1] && now - st.broken[1] > 40)) {
      st.broken = st.broken.map((b) => (b && now - b > 40 ? 0 : b)); changed = true;
    }
    if (changed) world.broadcast({ e: 'xing', i, d: down ? 1 : 0, b: st.broken.map((b) => (b ? 1 : 0)) });
  });
}

export function crossingStates(world) { return (world.xing || []).map((s) => ({ d: s.down ? 1 : 0, b: s.broken.map((b) => (b ? 1 : 0)) })); }

function hornForCrossings(world, t) {
  if (t.v < 80) return;
  const rail = world.map.rail;
  rail.crossings.forEach((c, i) => {
    const ahead = mod(c.s - t.s, rail.len);
    if (ahead < 620 && ahead > 200 && t.hornedFor !== i) {
      t.hornedFor = i; t.hornUntil = world.time + 1.6;
      const loco = world.get(t.cars[0].id);
      world.emit(loco.x, loco.y, { e: 'trainhorn', x: loco.x, y: loco.y, s: 2 });
    }
  });
}

// Drivers' judgement at a crossing whose gates are down: most stop at the arm; a few gamble
// (chasing cops far more often - and some of them misjudge it). Returns a speed cap.
export function crossingLimit(world, v, fwd) {
  if (!world.xing || !world.xing.length) return Infinity;
  const rail = world.map.rail;
  const ca = Math.cos(v.a), sa = Math.sin(v.a);
  let limit = Infinity;
  for (let i = 0; i < rail.crossings.length; i++) {
    const st = world.xing[i];
    if (!st.down) continue;
    const c = rail.crossings[i];
    const dx = c.x - v.x, dy = c.y - v.y;
    const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
    if (lx < 0 || lx > 320 + Math.max(0, fwd) * 0.8 || Math.abs(ly) > c.hw + 40) continue;
    // already past the arm (on the crossing): keep going
    const gap = lx - v.def.L / 2 - CROSSING_ARM - 14;
    if (gap < -6) continue;
    const key = i * 100000 + st.closure;
    if (v.xingKey !== key) {
      v.xingKey = key;
      const chasing = !!(v.ai && (v.ai.kind === 'police' || v.ai.kind === 'ems') && v.siren);
      const needS = (lx + 120) / Math.max(150, fwd, 1) + 0.8;
      const clear = st.eta > needS;
      v.xingGo = chasing ? (clear ? rng() < 0.85 : rng() < 0.3) : (clear ? rng() < 0.1 : rng() < 0.03);
    }
    if (v.xingGo) continue;
    limit = Math.min(limit, Math.max(0, gap * 1.6));
  }
  return limit;
}

// ---- player interactions ------------------------------------------------------------------------
// What E does on or next to a train (null: nothing train-related here).
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || !world.trains) return null;
  const now = world.time;
  if (ped.onTrain) {
    const t = trainOf(world, ped), r = ped.onTrain;
    if (p.crack) return { label: `Cracking the strongbox... ${Math.ceil(p.crack.until - now)}s`, run: () => {} };
    if (r.c === t.mail && now >= t.boxReadyAt && Math.hypot(r.ox - MAIL_BOX.ox, r.oy - MAIL_BOX.oy) < 40) return { label: 'Crack the strongbox', run: () => startCrack(world, p, t) };
    const st = stationAt(world, t);
    if (st) return { label: st.under ? `Get off - up the stairs at ${st.name}` : `Get off at ${st.name}`, key: 'F', run: () => getOff(world, p) };
    return { label: 'Jump off the train', key: 'F', run: () => getOff(world, p) };
  }
  if (ped.vehId) {
    const v = world.get(ped.vehId);
    const hit = v && climbable(world, ped, v.x, v.y, Math.max(v.def.W / 2 + 40, 56), v.vx, v.vy);
    return hit ? { label: `Climb onto the ${hit.t.cars[hit.ci].def.name.toLowerCase()}`, run: () => climbOn(world, ped, hit) } : null;
  }
  for (const t of world.trains) {
    const st = stationAt(world, t);
    if (!st) continue;
    if (st.under) {
      if (Math.hypot(ped.x - st.platform.x, ped.y - st.platform.y) < 80) return { label: `Down the stairs - board the train at ${st.name}`, run: () => boardAtStation(world, ped, t, 1) };
      continue;
    }
    let best = -1, bd = 140;
    for (let ci = 1; ci < t.cars.length; ci++) {
      if (ci === t.mail) continue;
      const d = doorPoint(world, t, ci, doorSide(world, t, ci, st), 14);
      const dd = Math.hypot(ped.x - d.x, ped.y - d.y);
      if (dd < bd) { bd = dd; best = ci; }
    }
    if (best > 0) return { label: `Board the train (next: ${world.map.rail.stations[(t.stop + 1) % world.map.rail.stations.length].name})`, run: () => boardAtStation(world, ped, t, best) };
  }
  const hit = climbable(world, ped, ped.x, ped.y, 48, ped.vx, ped.vy);
  return hit ? { label: `Hop onto the ${hit.t.cars[hit.ci].def.name.toLowerCase()}`, run: () => climbOn(world, ped, hit) } : null;
}

// A car you could grab onto from here: close alongside and not much faster than you.
function climbable(world, ped, x, y, reach, vx, vy) {
  for (const t of world.trains) {
    for (let ci = 1; ci < t.cars.length; ci++) {
      const e = world.get(t.cars[ci].id);
      if (!e || e.sub || Math.hypot(e.x - x, e.y - y) > t.cars[ci].def.L / 2 + reach) continue;
      const ca = Math.cos(e.a), sa = Math.sin(e.a);
      const lx = (x - e.x) * ca + (y - e.y) * sa, ly = -(x - e.x) * sa + (y - e.y) * ca;
      if (Math.abs(lx) > half(t.cars[ci]) + 8 || Math.abs(ly) > t.cars[ci].def.W / 2 + reach) continue;
      if (Math.hypot(e.vx - vx, e.vy - vy) > 170) continue;
      return { t, ci, ox: clamp(lx, -half(t.cars[ci]), half(t.cars[ci])), oy: ly >= 0 ? 22 : -22 };
    }
  }
  return null;
}

function climbOn(world, ped, hit) {
  if (ped.vehId) vehicles.ejectPed(world, ped, true);
  board(world, ped, hit.t, hit.ci, hit.ox, hit.oy, 0);
  if (ped.player) world.notify(ped.player, hit.ci === hit.t.mail ? 'You\'re on the mail car!' : 'You climbed aboard. F to jump off.', 'info');
}

function boardAtStation(world, ped, t, ci) {
  if (!t.dwellUntil) return;
  const spot = freeSpot(world, t, ci, false) || { ox: 0, oy: 0 };
  board(world, ped, t, ci, spot.ox, spot.oy, 0);
  if (ped.player) world.notify(ped.player, `All aboard! Next stop ${world.map.rail.stations[(t.stop + 1) % world.map.rail.stations.length].name}. Walk through the cars; F gets you off.`, 'good');
}

export function getOff(world, p) {
  const ped = p.ped, t = trainOf(world, ped);
  if (!t) return;
  p.crack = null;
  if (t.dwellUntil) { alightAtStation(world, t, ped); return; }
  if (world.get(t.cars[ped.onTrain.c].id).sub) { world.notify(p, 'You\'re in the tunnel - the doors stay shut until the next station.', 'warn'); return; }
  jumpOff(world, ped);
}

// Input while riding: walk around inside (and through to the next car), aim and shoot.
export function riderInput(world, p, ped, inp, pressed, dt) {
  const t = trainOf(world, ped);
  if (!t) { ped.onTrain = null; return; }
  if (pressed & IN.VEHICLE) { getOff(world, p); return; }
  if (pressed & IN.ACTION) { const act = interaction(world, p); if (act) act.run(); if (!ped.onTrain) return; }
  const now = world.time;
  const canMove = now >= ped.downUntil && now >= ped.stunUntil && !p.crack;
  const m = Math.hypot(inp.mx, inp.my);
  if (canMove && m > 0.1) {
    const e = world.get(t.cars[ped.onTrain.c].id);
    const sp = (inp.bits & IN.SPRINT ? RUN : WALK) * Math.min(1, m);
    const dx = inp.mx / Math.max(1, m) * sp * dt, dy = inp.my / Math.max(1, m) * sp * dt;
    const ca = Math.cos(e.a), sa = Math.sin(e.a);
    walk(t, ped.onTrain, -(dx * ca + dy * sa), -dx * sa + dy * ca);
    ped.a = Math.atan2(inp.my, inp.mx);
  }
  if (inp.bits & IN.FIRE) combat.tryAttack(world, ped, (inp.bits & IN.AIMING) ? inp.aim : ped.a);
  else if (inp.bits & IN.AIMING) ped.a = inp.aim;
}

// ---- the mail-car strongbox --------------------------------------------------------------------
function startCrack(world, p, t) {
  if (world.get(t.cars[t.mail].id).sub) { world.notify(p, 'Not in the tunnel - wait till you\'re out in the open.', 'warn'); return; }
  p.crack = { t: t.i, until: world.time + STRONGBOX_CRACK_S, t0: world.time };
  world.notify(p, 'Cracking the strongbox - stay with it!', 'warn');
  p.meDirty = true;
}

function stepCracking(world) {
  for (const p of world.players.values()) {
    if (!p.crack) continue;
    const ped = p.ped, t = world.trains[p.crack.t];
    if (!ped || ped.dead || !ped.onTrain || ped.onTrain.t !== t.i || ped.onTrain.c !== t.mail || Math.hypot(ped.onTrain.ox - MAIL_BOX.ox, ped.onTrain.oy - MAIL_BOX.oy) > 50) { p.crack = null; p.meDirty = true; continue; }
    if (world.time < p.crack.until) continue;
    p.crack = null; p.meDirty = true;
    crackOpen(world, p, t);
  }
}

export function onRuralRun(world, t) {
  const r = world.map.rail.rural;
  if (!r) return false;
  const mid = mod(t.s - t.len / 2, world.map.rail.len);
  return mid > r.s0 && mid < r.s1;
}

function crackOpen(world, p, t) {
  const ped = p.ped, now = world.time;
  t.boxReadyAt = now + BOX_RESET_S;
  const e = world.get(t.cars[t.mail].id);
  // heave it out of the door onto the ground beside the line
  let spot = null;
  for (const sd of [1, -1]) {
    const [x, y] = localToWorld(e.x, e.y, e.a, MAIL_BOX.ox, sd * (TRAIN_CARS[e.carType].W / 2 + 26));
    if (!PED_BLOCK[world.map.tileAtPx(x, y)] && !isSwimming(world.map, { x, y, under: false })) { spot = { x, y }; break; }
  }
  if (!spot) { const [x, y] = localToWorld(e.x, e.y, e.a, MAIL_BOX.ox - 40, 0); spot = { x, y }; }
  const job = p.job && p.job.type === 'trainjob';
  const crate = world.spawnCrate(3, spot.x, spot.y, { value: job ? TRAIN_JOB_PAY : Math.round(TRAIN_JOB_PAY / 2), contraband: true, label: 'Mail Strongbox' });
  crate.strongbox = p.pid;
  crate.vx = e.vx * 0.25; crate.vy = e.vy * 0.25;
  world.emit(spot.x, spot.y, { e: 'crash', x: spot.x, y: spot.y, p: 0.4 });
  p.profile.criminalExp = (p.profile.criminalExp || 0) + 10;
  if (job) { p.job.stage = 'grab'; p.job.crate = crate.id; }
  world.notify(p, 'The strongbox is out - it went over the side! Jump off, grab it and get it to a fence.', 'good');
  law.crime(world, ped, 'trainRobbery', null, ped.x, ped.y);
  if (!onRuralRun(world, t)) {
    // in town the alarm bell is heard for blocks: the police know
    world.notify(p, 'The mail-car alarm is ringing - in town, everybody heard it!', 'bad');
    const need = STAR_HEAT[TRAIN_ALARM_STARS] + 5 - p.heat;
    if (need > 0) law.addHeat(world, p, need, ped.x, ped.y);
    law.logDispatch(world, 'trainRobbery', ped.x, ped.y, p, p.wanted, 'alarm');
  }
  for (const id of t.riders) { const q = world.get(id); if (q && q.npc && q.npc.role === 'railguard' && !q.dead) { q.npc.target = ped.id; } }
}

// ---- the train-robbery job (offered by the fence) ----------------------------------------------
export function startTrainJob(world, p) {
  if (p.job) return 'You already have a job.';
  const t = world.trains.find((q) => q.mail >= 0);
  if (!t) return 'No mail train running.';
  p.job = { type: 'trainjob', stage: 'board', train: t.i, tx: 0, ty: 0, text: '', failOnDeath: false };
  world.notify(p, 'The mail train carries a strongbox. Get aboard (any station, or climb on from a car alongside), work back to the mail car and crack it - best out on the Refuge Island run between Eastport and Refuge Halt, where nobody hears the alarm.', 'info');
  updateJobs(world);
  return null;
}

export function onFenced(world, p, crate) {
  if (!crate.strongbox || !p.job || p.job.type !== 'trainjob') return;
  p.job = null; p.meDirty = true;
  world.notify(p, 'Train job done - the strongbox is fenced.', 'good');
}

function updateJobs(world) {
  if (world.tick % 5) return;
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'trainjob' || !p.ped) continue;
    const t = world.trains[j.train];
    const mail = world.get(t.cars[t.mail].id);
    const ped = p.ped;
    const crate = j.crate ? world.get(j.crate) : null;
    if (j.stage === 'grab' || j.stage === 'fence') {
      if (!crate || crate.removed) { p.job = null; world.notify(p, 'The strongbox is gone. Train job over.', 'bad'); p.meDirty = true; continue; }
      if (ped.carrying === crate.id || crate.state === 'loaded') {
        j.stage = 'fence';
        let best = null, bd = Infinity;
        for (const q of world.map.pois) if (q.kind === 'fence') { const d = Math.hypot(q.x - ped.x, q.y - ped.y); if (d < bd) { bd = d; best = q; } }
        j.text = 'Get the strongbox to a fence'; j.tx = best ? best.x : ped.x; j.ty = best ? best.y : ped.y;
      } else { j.stage = 'grab'; j.text = 'Grab the strongbox beside the tracks'; j.tx = crate.x; j.ty = crate.y; }
      continue;
    }
    if (ped.onTrain && ped.onTrain.t === t.i) {
      j.stage = 'crack';
      j.text = world.time < t.boxReadyAt ? 'Someone already cracked this one - the next box is loaded later' : onRuralRun(world, t) ? 'Refuge Island run - crack the strongbox NOW' : 'Work back to the mail car - crack it on the Refuge Island run';
    } else { j.stage = 'board'; j.text = 'Get aboard the mail train'; }
    j.tx = mail.x; j.ty = mail.y;
  }
}

// ---- HUD + station boards -----------------------------------------------------------------------
// Seconds until train t pulls in at station si (rough: cruise speed plus the stops in between).
function etaTo(world, t, si) {
  const rail = world.map.rail, sts = rail.stations, now = world.time;
  if (t.dwellUntil && t.stop === si) return 0;
  let s = t.s, eta = t.dwellUntil ? t.dwellUntil - now : 0, k = t.stop;
  for (let guard = 0; guard < sts.length + 1; guard++) {
    const target = sts[k].s + t.len / 2;
    eta += mod(target - s, rail.len) / (TRAIN_SPEED * 0.85);
    if (k === si) return eta;
    eta += TRAIN_DWELL_S; s = target; k = (k + 1) % sts.length;
  }
  return eta;
}

export function stationBoard(world, poi) {
  const si = poi.station, sts = world.map.rail.stations;
  const lines = world.trains.map((t) => {
    const eta = etaTo(world, t, si);
    return `${t.mail >= 0 ? 'Mail train' : 'Commuter'}: ${eta < 1 ? 'AT THE PLATFORM - board now' : `${Math.round(eta)}s`}`;
  });
  return { title: sts[si].name, sub: `${sts[si].under ? 'Subway - take the stairs down when a train is in. ' : ''}Trains run the whole loop: Westside, Channel Street, Northshore, Midtown Underground, Eastport, Refuge Halt, Sunset Pier. ${lines.join(' · ')}` };
}

export function meInfo(world, p) {
  const ped = p.ped;
  if (!ped || !ped.onTrain) return null;
  const t = trainOf(world, ped), sts = world.map.rail.stations;
  const e = world.get(t.cars[ped.onTrain.c].id);
  const next = t.dwellUntil ? sts[t.stop] : sts[t.stop];
  return {
    sub: !!e.sub, car: t.cars[ped.onTrain.c].kind, next: next.name, at: !!t.dwellUntil, eta: Math.round(etaTo(world, t, t.stop)),
    crack: p.crack ? Math.min(1, (world.time - p.crack.t0) / STRONGBOX_CRACK_S) : null, rural: onRuralRun(world, t),
  };
}
