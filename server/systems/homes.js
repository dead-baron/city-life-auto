// Player homes: buyable houses/apartments that act as respawn points and garages.
// Ownership is persisted on profiles (profile.homes) and indexed in world.homeOwner.
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { PED_BLOCK } from '../../shared/map.js';
import { HIDE_TIME_S, SPAWN_PROTECT_S } from '../../shared/rules.js';
import { store } from '../store.js';

const BASE_GARAGE = 2;

export function init(world) {
  world.homeOwner = new Map();
  for (const prof of store.all()) {
    for (const id of prof.homes || []) {
      if (world.map.homes[id] && !world.homeOwner.has(id)) world.homeOwner.set(id, prof.pid);
    }
  }
}

export function ownedHomes(world, prof) {
  return (prof.homes || []).filter((id) => world.homeOwner.get(id) === prof.pid).map((id) => world.map.homes[id]);
}

export function garageCap(world, prof) {
  let cap = BASE_GARAGE;
  for (const h of ownedHomes(world, prof)) cap += h.slots;
  return Math.min(60, cap);
}

export function buy(world, p, home, pay) {
  const prof = p.profile;
  if (world.homeOwner.has(home.id)) return 'Someone already owns this place.';
  if (!pay(p, home.price)) return `You need $${home.price.toLocaleString()} (cash + bank).`;
  (prof.homes ||= []).push(home.id);
  world.homeOwner.set(home.id, prof.pid);
  if (prof.spawnHome == null) prof.spawnHome = home.id;
  store.touch();
  world.notify(p, prof.spawnHome === home.id ? `You bought ${home.name}! It's your respawn point now, and its garage holds ${home.slots} more vehicles.` : `You bought ${home.name}! +${home.slots} garage spaces - your cars can be taken out at any home you own.`, 'good');
  return null;
}

export function sell(world, p, home) {
  const prof = p.profile;
  if (world.homeOwner.get(home.id) !== prof.pid) return 'You do not own this place.';
  world.homeOwner.delete(home.id);
  prof.homes = prof.homes.filter((id) => id !== home.id);
  if (prof.spawnHome === home.id) prof.spawnHome = prof.homes.length ? prof.homes[0] : null;
  const back = Math.round(home.price * 0.6);
  prof.bank += back;
  while (prof.vehicles.length > garageCap(world, prof)) prof.vehicles.pop();
  store.touch();
  world.notify(p, `Sold ${home.name} for $${back.toLocaleString()} (paid into your bank).`, 'info');
  return null;
}

// ---- respawn ------------------------------------------------------------------
export function spawnOptions(world, p) {
  const opts = world.map.hospitals.map((h, i) => ({ id: `h:${i}`, label: h.name, kind: 'hospital' }));
  for (const h of ownedHomes(world, p.profile)) opts.unshift({ id: `home:${h.id}`, label: h.name, kind: 'home' });
  return opts;
}

// The pre-selected wake-up spot shown on the death screen: your chosen home, else a random
// hospital away from where you died (same rule resolveSpawn uses).
export function defaultChoice(world, p, deathPos) {
  const prof = p.profile;
  if (prof.spawnHome != null && world.homeOwner.get(prof.spawnHome) === prof.pid) return `home:${prof.spawnHome}`;
  const hs = world.map.hospitals;
  let cands = hs.map((h, i) => ({ h, i })).filter(({ h }) => h.name !== p.lastSpawnName);
  if (!cands.length) cands = hs.map((h, i) => ({ h, i }));
  if (deathPos) cands = cands.sort((a, b) => Math.hypot(b.h.x - deathPos.x, b.h.y - deathPos.y) - Math.hypot(a.h.x - deathPos.x, a.h.y - deathPos.y)).slice(0, 2);
  return `h:${cands[Math.floor(world.rand() * cands.length)].i}`;
}

// Pick where a player wakes up. choice: 'h:<i>' | 'home:<id>' | null (default).
export function resolveSpawn(world, p, choice, deathPos) {
  const prof = p.profile;
  const hs = world.map.hospitals;
  if (choice && choice.startsWith('home:')) {
    const h = world.map.homes[Number(choice.slice(5))];
    if (h && world.homeOwner.get(h.id) === prof.pid) return { x: h.x, y: h.y + 8, name: h.name };
  }
  if (choice && choice.startsWith('h:')) {
    const h = hs[Number(choice.slice(2))];
    if (h) return h;
  }
  if (prof.spawnHome != null && world.homeOwner.get(prof.spawnHome) === prof.pid) {
    const h = world.map.homes[prof.spawnHome];
    return { x: h.x, y: h.y + 8, name: h.name };
  }
  // default: a hospital other than the one you just woke at, preferring one away from where you died
  let cands = hs.filter((h) => h.name !== p.lastSpawnName);
  if (!cands.length) cands = hs;
  if (deathPos) cands = [...cands].sort((a, b) => Math.hypot(b.x - deathPos.x, b.y - deathPos.y) - Math.hypot(a.x - deathPos.x, a.y - deathPos.y)).slice(0, 2);
  return cands[Math.floor(world.rand() * cands.length)];
}

// ---- garage -----------------------------------------------------------------------
export function nearOwnGarage(world, p, x, y, r = 170) {
  for (const h of ownedHomes(world, p.profile)) if (Math.hypot(h.garage.x - x, h.garage.y - y) < r) return h;
  return null;
}

export function vehicleInteraction(world, p) {
  const ped = p.ped;
  const v = world.get(ped.vehId);
  if (!v || ped.seat !== 0 || v.wreckAt || v.def.kind === 'boat') return null;
  if (v.def.police || v.model === 'ambulance' || v.model === 'swat') return null;
  const h = nearOwnGarage(world, p, v.x, v.y);
  if (!h) return null;
  if (Math.hypot(v.vx, v.vy) > 60) return { label: 'Slow down to park in your garage', run: () => {} };
  return { label: `Park ${v.def.name} in your garage`, run: () => storeVehicle(world, p, v, h) };
}

export function storeVehicle(world, p, v, home) {
  const prof = p.profile;
  if (prof.vehicles.length >= garageCap(world, prof)) { world.notify(p, `Garage full (${prof.vehicles.length}/${garageCap(world, prof)}). Buy another home for more space.`, 'warn'); return; }
  if (v.seats.some((s, i) => i > 0 && s)) { world.notify(p, 'Passengers have to get out first.', 'warn'); return; }
  for (const cid of v.cargo) if (cid) { const c = world.get(cid); if (c) { c.state = 'ground'; c.parent = 0; c.x = home.garage.x + 60; c.y = home.garage.y; } }
  const ped = p.ped;
  world.emit(v.x, v.y, { e: 'garagedoor', home: home.id });
  ped.vehId = 0; ped.seat = -1;
  ped.x = home.x; ped.y = home.y + 10;
  prof.vehicles.push({ model: v.model, paint: v.paint, variant: v.variant });
  if (p.activeVehicle === v.id) p.activeVehicle = 0;
  world.remove(v);
  store.touch();
  p.meDirty = true;
  world.notify(p, `${v.def.name} stored in your garage (${prof.vehicles.length}/${garageCap(world, prof)}).`, 'good');
}

// Spawn an owned vehicle at a garage / lot spot, clearing empty parked cars there.
export function spawnOwnedAt(world, p, idx, spot) {
  const prof = p.profile;
  const ov = prof.vehicles[idx];
  if (!ov || !VEHICLES[ov.model]) return 'No such vehicle.';
  const old = world.get(p.activeVehicle);
  if (old && !old.wreckAt && old.owner === p.pid) {
    if (old.seats.some((s) => s && s !== p.ped.id)) return 'Your other vehicle is occupied.';
    world.remove(old);
  }
  for (const e of world.query(spot.x, spot.y, 80, K.VEH)) if (!e.seats.some((s) => s)) world.remove(e);
  const v = world.spawnVehicle(ov.model, spot.x, spot.y, spot.a ?? 0, { paint: ov.paint, variant: ov.variant, owner: p.pid, ownerName: p.name, npcOwned: false });
  v.despawnable = false;
  if (spot.home != null) world.emit(spot.x, spot.y, { e: 'garagedoor', home: spot.home });
  p.activeVehicle = v.id;
  return null;
}

// ---- spawn spots ----------------------------------------------------------------------
// Every spawn location has a handful of spots (centre, left, right, behind, the side street):
// you wake up at a random free one, preferring spots with no other player standing right there,
// so nobody can camp a single doorway.
const SPOT_OFFSETS = [[0, 0], [-90, 0], [90, 0], [0, 80], [-150, 50], [150, 50], [0, -70], [-60, 110], [60, 110]];
export function spawnSpot(world, x, y, rand = world.rand) {
  const ok = [];
  for (const [dx, dy] of SPOT_OFFSETS) {
    const sx = x + dx, sy = y + dy;
    if (PED_BLOCK[world.map.tileAtPx(sx, sy)] || PED_BLOCK[world.map.tileAtPx(sx + 8, sy)] || PED_BLOCK[world.map.tileAtPx(sx - 8, sy)]) continue;
    let crowd = 0;
    for (const q of world.players.values()) if (q.ped && !q.ped.dead && Math.hypot(q.ped.x - sx, q.ped.y - sy) < 160) crowd++;
    ok.push({ x: sx, y: sy, crowd });
  }
  if (!ok.length) return { x, y };
  const least = Math.min(...ok.map((o) => o.crowd));
  const best = ok.filter((o) => o.crowd === least);
  const o = best[Math.floor(rand() * best.length)];
  return { x: o.x + (rand() - 0.5) * 16, y: o.y + (rand() - 0.5) * 12 };
}

// Spawn / step-out protection: blinking, can move, can't shoot, can't be hurt.
export function protect(world, ped, s = SPAWN_PROTECT_S) { ped.protectUntil = world.time + s; }
export const isProtected = (world, ped) => !!ped && (!!ped.hidden || world.time < (ped.protectUntil || 0));

// ---- going inside -----------------------------------------------------------------------
export const homePoi = (world, h) => world.map.pois.find((q) => q.kind === 'home' && q.home === h.id);

export function beginEnter(world, p, h) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return 'Not right now.';
  if (world.homeOwner.get(h.id) !== p.pid) return 'You do not own this place.';
  if (ped.carrying) return 'Set the crate down first.';
  if (p.wanted > 0 && world.time - (p.seenAt || -99) < 1.5) return 'Not with the police watching you!';
  ped.entering = { home: h.id, at: world.time, x: ped.x, y: ped.y };
  ped.vx = 0; ped.vy = 0;
  world.notify(p, 'Unlocking the door... (stand still)', 'info');
  return null;
}

function goInside(world, p, h) {
  const ped = p.ped;
  ped.entering = null;
  ped.inside = h.id; ped.hidden = true;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  ped.x = h.x; ped.y = h.y;
  ped.fishing = null;
  world.place(ped);
  world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y });
  world.notify(p, `You're inside ${h.name}. Nobody can see or hurt you in here.`, 'good');
  p.meDirty = true;
  openInside(world, p);
}

export function openInside(world, p) {
  const ped = p.ped;
  const h = ped && ped.hidden ? world.map.homes[ped.inside] : null;
  if (!h || !p.conn) return;
  const poi = homePoi(world, h);
  if (poi) { p.menu = { poi: poi.id }; p.conn.sendJSON({ ...menuBuilder(world, p, poi), inside: true }); }
}
let menuBuilder = () => ({ t: 'menu', opts: [] });
export function setMenuBuilder(fn) { menuBuilder = fn; }

export function leaveHome(world, p) {
  const ped = p.ped;
  if (!ped || !ped.hidden) return;
  const h = world.map.homes[ped.inside];
  ped.inside = null; ped.hidden = false;
  ped.vx = 0; ped.vy = 0;
  if (h) { ped.x = h.x + (world.rand() - 0.5) * 20; ped.y = h.y + 10; world.emit(h.x, h.y, { e: 'door', x: h.x, y: h.y }); }
  world.place(ped);
  protect(world, ped);
  p.meDirty = true;
}

export function update(world) {
  stepScripted(world);
  const now = world.time;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped) continue;
    if (ped.dead) { ped.entering = null; continue; }
    if (!ped.entering) continue;
    const h = world.map.homes[ped.entering.home];
    if (!h || ped.vehId || now < ped.downUntil || now < ped.stunUntil || Math.hypot(ped.x - ped.entering.x, ped.y - ped.entering.y) > 14) {
      ped.entering = null;
      world.notify(p, 'You stepped away from the door.', 'warn');
      continue;
    }
    if (p.wanted > 0 && now - (p.seenAt || -99) < 0.2) { ped.entering = null; world.notify(p, 'The police spotted you - no time to get inside!', 'bad'); continue; }
    if (now - ped.entering.at >= HIDE_TIME_S) goInside(world, p, h);
  }
}

// blink state for the wire: 0 none, 1 slow, 2 fast, 3 hidden inside
export function blinkState(world, ped) {
  if (ped.hidden) return 3;
  if (ped.entering) return world.time - ped.entering.at < HIDE_TIME_S * 0.55 ? 1 : 2;
  if (world.time < (ped.protectUntil || 0)) return 2;
  return 0;
}

// ---- driving out of the garage --------------------------------------------------------------
// Pick a car from inside: you're put behind the wheel inside the garage, the door rolls up and the
// car eases out on its own (blinking, untouchable) before you get the controls.
const DRIVE_OUT_S = 2.2;
export function driveOut(world, p, h, idx) {
  const ped = p.ped;
  const ov = p.profile.vehicles[idx];
  if (!ov || !VEHICLES[ov.model] || VEHICLES[ov.model].kind === 'boat') return 'No such car.';
  const g = h.garage;
  const ax = Math.cos(g.a), ay = Math.sin(g.a);
  const len = VEHICLES[ov.model].L;
  const start = h.garageDoor ? { x: h.garageDoor.x - ax * (len / 2 + 6), y: h.garageDoor.y - ay * (len / 2 + 6) } : { x: g.x - ax * 50, y: g.y - ay * 50 };
  ped.inside = null; ped.hidden = false;
  const err = spawnOwnedAt(world, p, idx, { x: start.x, y: start.y, a: g.a, home: h.id });
  if (err) { ped.inside = h.id; ped.hidden = true; return err; }
  const v = world.get(p.activeVehicle);
  v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0;
  ped.x = v.x; ped.y = v.y; ped.vx = 0; ped.vy = 0;
  v.lastDriver = ped.id; p.lastVehicle = v.id;
  v.scripted = { x0: start.x, y0: start.y, x1: g.x, y1: g.y, t0: world.time, dur: DRIVE_OUT_S };
  world.place(ped);
  protect(world, ped, DRIVE_OUT_S);
  p.meDirty = true;
  return null;
}

// Move cars that are easing out of a garage (they ignore the walls they start inside).
export function stepScripted(world) {
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || !v.scripted) continue;
    const s = v.scripted;
    const k = Math.min(1, (world.time - s.t0) / s.dur);
    const e = k * k * (3 - 2 * k);
    const nx = s.x0 + (s.x1 - s.x0) * e, ny = s.y0 + (s.y1 - s.y0) * e;
    v.vx = (nx - v.x) / 0.05; v.vy = (ny - v.y) / 0.05;
    v.x = nx; v.y = ny;
    v.ownStepTick = world.tick; // no physics this tick
    v.input = { throttle: 0, steer: 0, hb: false };
    if (k >= 1) { v.scripted = null; v.vx *= 0.5; v.vy *= 0.5; }
  }
}
