// Player homes: buyable houses/apartments that act as respawn points and garages.
// Ownership is persisted on profiles (profile.homes) and indexed in world.homeOwner.
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
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
  return Math.min(12, cap);
}

export function buy(world, p, home, pay) {
  const prof = p.profile;
  if (world.homeOwner.has(home.id)) return 'Someone already owns this place.';
  if ((prof.homes || []).length >= 3) return 'You can own up to 3 homes.';
  if (!pay(p, home.price)) return `You need $${home.price.toLocaleString()} (cash + bank).`;
  (prof.homes ||= []).push(home.id);
  world.homeOwner.set(home.id, prof.pid);
  if (prof.spawnHome == null) prof.spawnHome = home.id;
  store.touch();
  world.notify(p, `You bought ${home.name}! It's your respawn point now, and its garage holds ${home.slots} more vehicles.`, 'good');
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
  p.activeVehicle = v.id;
  return null;
}
