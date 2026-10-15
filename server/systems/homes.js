// Player homes: buyable houses/apartments that act as respawn points and garages.
// Ownership is persisted on profiles (profile.homes) and indexed in world.homeOwner.
import { K, WORLD_VERSION } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { PED_BLOCK } from '../../shared/map.js';
import { HIDE_TIME_S, SPAWN_PROTECT_S } from '../../shared/rules.js';
import { lobbyKey } from '../../shared/homelayout.js';
import { store } from '../store.js';
import { LEGACY_HOMES } from './legacy-homes.js';
import * as homeinside from './homeinside.js';

const BASE_GARAGE = 2;
const FALLBACK_PRICE = 25000; // a home of an old world with no deed and no record: bought back at a house's price

export function init(world) {
  world.homeOwner = new Map();
  buildUnits(world);   // (the apartment blocks' units: homes of their own, kept off the map - below)
  for (const prof of store.all()) {
    if (checkWorld(world, prof)) continue; // homes from an older world: released, nothing to register
    for (const id of prof.homes || []) {
      if (homeById(world, id) && !world.homeOwner.has(id)) world.homeOwner.set(id, prof.pid);
    }
  }
}

// ---- apartment blocks: several homes in one building (H65) ------------------------------------------------------------
// The owner, 2026-10-11: "can we get more of the owning a house features up?" - and the concept art's apartment
// buildings (docs/art-v2/targets/HO5): a lobby, stairs, doors along the landings. Each of the city's apartment blocks
// (a map home of kind 'apartment') is a building of units: the map's home is unit 1 (the ground floor - its owners keep
// it), and units 2.. are homes of their own, found from the built map when the server starts - nothing is added to the
// map (its hash and signature stay as they are), and they're keyed by their building's home, never by where it stands,
// so World v3 can move the buildings. A unit's id is UNIT0 + the building's home id * 16 + its number: an id like any
// home's (profile.homes, the respawn point, the garage, the inside), but out of the map's range. Several players can
// own homes in one building; the lobby door lists them (economy.js buildMenu). Each unit is an apartment plan furnished
// by its price (shared/homelayout.js): a studio, a flat a floor up, the penthouse at the top.
export const UNIT0 = 1000000;
export const unitId = (baseId, n) => UNIT0 + baseId * 16 + n;
export const isUnit = (id) => Number(id) >= UNIT0;
// a home by its id: the map's, or an apartment block's unit
export function homeById(world, id) {
  if (id == null) return null;
  const n = Number(id);
  if (n >= UNIT0) return (world.units && world.units.get(n)) || (world.lobbies && world.lobbies.get(n)) || null;   // (a block's lobby: H71)
  return (world.map.homes && world.map.homes[n]) || null;
}
// how many homes an apartment block holds: by its footprint (an 8x11 walk-up: 6), 4 to 8
export function unitCount(map, h) {
  const b = h && h.b != null ? map.buildings[h.b] : null;
  if (!b) return 1;
  return Math.max(4, Math.min(8, Math.round((b.tw * b.th) / 15)));
}
// unit n of a building (2..): its floor, its plan and its price from the building's (the map's ground-floor flat's)
export function unitOf(base, n, count) {
  const floor = 1 + Math.floor((n - 1) / 3);   // (three doors a landing - HO5)
  const top = n === count && count >= 5;
  const plan = top ? 'penthouse' : n % 3 === 2 ? 'studio' : 'apartment';
  const price = Math.round((top ? base.price * 2.5 : plan === 'studio' ? base.price * 0.7 : base.price * (1 + 0.12 * (floor - 1))) / 500) * 500;
  const what = top ? 'penthouse' : plan === 'studio' ? 'studio' : 'apartment';
  return {
    id: unitId(base.id, n), kind: 'apartment', plan, name: `${base.name}, unit ${n}`, price, slots: plan === 'studio' ? 1 : top ? 3 : 2,
    x: base.x, y: base.y, garage: base.garage, b: base.b, lobby: base.id, unit: n, floor, what,
  };
}
function buildUnits(world) {
  world.units = new Map();
  world.unitsOf = new Map();   // the building's home id -> its homes' ids, unit 1 (the map's) first
  world.lobbies = new Map();   // (H71) the building's lobby, a place of its own to walk into (id: unit 0's)
  for (const h of world.map.homes || []) {
    if (!h || h.gone || h.kind !== 'apartment') continue;
    const n = unitCount(world.map, h);
    if (n < 2) continue;
    const ids = [h.id];
    for (let k = 2; k <= n; k++) { const u = unitOf(h, k, n); world.units.set(u.id, u); ids.push(u.id); }
    world.unitsOf.set(h.id, ids);
    const lob = { id: unitId(h.id, 0), isLobby: 1, block: h.id, kind: 'lobby', plan: lobbyKey(n), name: `${h.name} - the lobby`, price: h.price, x: h.x, y: h.y, slots: 0 };
    world.lobbies.set(lob.id, lob);
  }
}
// (H71) the building a home stands in (its lobby's block id; null: a home of its own), and a building's lobby
export function blockOf(world, h) { const b = h ? (h.isLobby ? h.block : h.lobby ?? h.id) : null; return b != null && world.unitsOf && world.unitsOf.has(b) ? b : null; }
export const lobbyOf = (world, blockId) => (world.lobbies ? world.lobbies.get(unitId(blockId, 0)) || null : null);
// the homes in the building whose lobby door is poi (null: a home of its own)
export const unitsAt = (world, poi) => (poi && poi.kind === 'home' && world.unitsOf ? world.unitsOf.get(poi.home) || null : null);
// The home a menu at poi (a home's door) is about: the one you're inside (a unit of that building, or the place you're
// touring), else the map's home at that door
export function homeFor(world, p, poi) {
  const ped = p && p.ped;
  if (ped && ped.hidden && ped.inside != null) {
    const h = homeById(world, ped.inside);
    if (h && (h.lobby ?? h.id) === poi.home) return h;
  }
  return world.map.homes[poi.home];
}

// A profile saved in an older world (shared/constants.js WORLD_VERSION): its homes are indices into a
// map that no longer exists, and its saved spot may now be inside a building across town. Everything
// world-bound is released - each home bought back at what was paid for it (its deed, or the old
// world's price list for homes bought before deeds were kept), paid into the bank - and the player
// wakes at a hospital. Cars, the stash, money and everything else are kept (a new home opens the
// garage and the stash again). Returns the note shown when they next play (also kept on the profile
// as worldNote until then), or null when the profile is already in this world.
export function checkWorld(world, prof) {
  const wv = prof.wv ?? 1; // profiles from before versions were kept belong to world v1
  if (wv === WORLD_VERSION) return null;
  const old = LEGACY_HOMES[wv] || [];
  let refund = 0;
  const names = [];
  for (const id of prof.homes || []) {
    const paid = prof.deeds && prof.deeds[id] !== undefined ? prof.deeds[id] : old[id] ? old[id][0] : FALLBACK_PRICE;
    refund += Math.max(0, Math.round(paid) || 0);
    if (old[id]) names.push(old[id][1]);
  }
  const n = (prof.homes || []).length;
  for (const [id, pid] of [...(world.homeOwner || [])]) if (pid === prof.pid) world.homeOwner.delete(id);
  prof.bank = (prof.bank || 0) + refund;
  prof.homes = [];
  prof.deeds = {};
  if (prof.loans) prof.loans = {};   // (a mortgage's home gone with the old streets: the refund is what was paid - H65)
  for (const id of Object.keys(prof.decor || {})) stowDecor(prof, id);   // (H67: the furniture back in storage)
  prof.spawnHome = null;
  prof.pos = null; // the streets moved: wake up at a hospital, not inside whatever stands there now
  // ...and the other places kept in the old world's pixels (WORLD-V3.md 8.23, step 1): the last wake-up spot (a hospital
  // by its index - another one now), where hot money was stolen, where a wanted player was last seen
  prof.lastSpawn = null;
  if (prof.hotAt) prof.hotAt = null;
  if (prof.bountySeen) prof.bountySeen = null;
  prof.wv = WORLD_VERSION;
  const note = { from: wv, homes: n, refund, names: names.slice(0, 4) };
  prof.worldNote = note;
  store.touch();
  return note;
}

// The toast for a profile whose world changed (players.join shows it once, then forgets it).
export function worldNoteText(note) {
  const base = 'The city has been rebuilt since you were last here - new streets, new buildings.';
  if (!note || !note.homes) return `${base} You're starting out from a hospital.`;
  const what = note.homes === 1 ? `Your home${note.names[0] ? ` (${note.names[0]})` : ''} went` : `Your ${note.homes} homes went`;
  return `${base} ${what} with the old streets: bought back for $${note.refund.toLocaleString()}, paid into your bank. Your cars and your stash are kept - buy a new place to get at them.`;
}

export function ownedHomes(world, prof) {
  return (prof.homes || []).filter((id) => world.homeOwner.get(id) === prof.pid).map((id) => homeById(world, id));
}

export function garageCap(world, prof) {
  let cap = BASE_GARAGE;
  for (const h of ownedHomes(world, prof)) cap += h.slots;
  return Math.min(60, cap);
}

export function buy(world, p, home, pay) {
  if (world.homeOwner.has(home.id)) return 'Someone already owns this place.';
  if (!pay(p, home.price)) return `You need $${home.price.toLocaleString()} (cash + bank).`;
  claim(world, p, home, home.price);
  return null;
}
// (H65) a home released: back on the market (the bank taking it back - mortgage.js)
export function release(world, prof, home) {
  if (world.homeOwner.get(home.id) !== prof.pid) return;
  world.homeOwner.delete(home.id);
  prof.homes = (prof.homes || []).filter((id) => id !== home.id);
  if (prof.deeds) delete prof.deeds[home.id];
  if (prof.spawnHome === home.id) prof.spawnHome = prof.homes.length ? prof.homes[0] : null;
  stowDecor(prof, home.id);
  store.touch();
}
// (H67) a home's furniture back into storage (it's sold, or taken back): placed in your next home
export function stowDecor(prof, id) {
  const d = prof.decor && prof.decor[id];
  if (!d) return;
  prof.furn ||= {};
  for (const q of d.it || []) prof.furn[q.k] = (prof.furn[q.k] || 0) + 1;
  delete prof.decor[id];
}
// the home is yours (paid: what you've paid for it - the price, or a mortgage's deposit; mortgage.js)
export function claim(world, p, home, paid) {
  const prof = p.profile;
  (prof.homes ||= []).push(home.id);
  (prof.deeds ||= {})[home.id] = paid; // what it cost: bought back at that if the world is ever rebuilt under it
  world.homeOwner.set(home.id, prof.pid);
  if (prof.spawnHome == null) { prof.spawnHome = home.id; prof.lastSpawn = `home:${home.id}`; }   // (your first home: where you wake up from now on)
  store.touch();
  world.notify(p, prof.spawnHome === home.id ? `You bought ${home.name}! It's your respawn point now, and its garage holds ${home.slots} more vehicles.` : `You bought ${home.name}! +${home.slots} garage spaces - your cars can be taken out at any home you own.`, 'good');
  return null;
}

export function sell(world, p, home) {
  const prof = p.profile;
  if (world.homeOwner.get(home.id) !== prof.pid) return 'You do not own this place.';
  world.homeOwner.delete(home.id);
  prof.homes = prof.homes.filter((id) => id !== home.id);
  if (prof.deeds) delete prof.deeds[home.id];
  if (prof.spawnHome === home.id) prof.spawnHome = prof.homes.length ? prof.homes[0] : null;
  const loan = prof.loans && prof.loans[home.id], owed = loan ? loan.owed : 0;   // (a mortgage: what's owed comes out of the sale first - H65)
  if (loan) delete prof.loans[home.id];
  stowDecor(prof, home.id);
  const back = Math.max(0, Math.round(home.price * 0.6) - owed);
  prof.bank += back;
  while (prof.vehicles.length > garageCap(world, prof)) prof.vehicles.pop();
  store.touch();
  world.notify(p, `Sold ${home.name} for $${back.toLocaleString()} (paid into your bank${owed ? ` - the mortgage's $${owed.toLocaleString()} paid off first` : ''}).`, 'info');
  return null;
}

// ---- respawn ------------------------------------------------------------------
export function spawnOptions(world, p) {
  const opts = world.map.hospitals.map((h, i) => ({ id: `h:${i}`, label: h.name, kind: 'hospital' }));
  if (p.policeKill) return opts;   // (killed by the police: a hospital - custody.js / players.onPedDeath)
  for (const h of ownedHomes(world, p.profile)) opts.unshift({ id: `home:${h.id}`, label: h.name, kind: 'home' });
  return opts;
}
// the hospital nearest a spot ('h:<i>')
function nearestHospital(world, pos) {
  let best = 0, bd = Infinity;
  world.map.hospitals.forEach((h, i) => { const d = Math.hypot(h.x - pos.x, h.y - pos.y); if (d < bd) { bd = d; best = i; } });
  return `h:${best}`;
}

// a wake-up spot that's still on offer: a hospital, or a home you still own
function offered(world, p, id) {
  if (typeof id !== 'string') return false;
  if (id.startsWith('h:')) return !!world.map.hospitals[Number(id.slice(2))];
  if (id.startsWith('home:')) return !p.policeKill && world.homeOwner.get(Number(id.slice(5))) === p.profile.pid;
  return false;
}
// The pre-selected wake-up spot shown on the death screen: where you last woke up (the user, 2026-10-08: it stays
// your spot until you pick another), else your chosen home, else a random hospital away from where you died (same rule
// resolveSpawn uses).
export function defaultChoice(world, p, deathPos) {
  const prof = p.profile;
  if (p.policeKill && deathPos) return nearestHospital(world, deathPos);   // killed by the police: the nearest hospital
  if (offered(world, p, prof.lastSpawn)) return prof.lastSpawn;
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
  if (p.policeKill && !(choice && choice.startsWith('h:'))) choice = deathPos ? nearestHospital(world, deathPos) : null;   // (no waking at home)
  // (where you wake is remembered: the next death screen offers it first - defaultChoice)
  if (choice && choice.startsWith('home:')) {
    const h = homeById(world, choice.slice(5));
    if (h && world.homeOwner.get(h.id) === prof.pid) { prof.lastSpawn = `home:${h.id}`; return { x: h.x, y: h.y + 8, name: h.name }; }
  }
  if (choice && choice.startsWith('h:')) {
    const h = hs[Number(choice.slice(2))];
    if (h) { prof.lastSpawn = choice; return h; }
  }
  if (prof.spawnHome != null && world.homeOwner.get(prof.spawnHome) === prof.pid && !p.policeKill) {
    const h = homeById(world, prof.spawnHome);
    prof.lastSpawn = `home:${h.id}`;
    return { x: h.x, y: h.y + 8, name: h.name };
  }
  // default: a hospital other than the one you just woke at, preferring one away from where you died
  let cands = hs.filter((h) => h.name !== p.lastSpawnName);
  if (!cands.length) cands = hs;
  if (deathPos) cands = [...cands].sort((a, b) => Math.hypot(b.x - deathPos.x, b.y - deathPos.y) - Math.hypot(a.x - deathPos.x, a.y - deathPos.y)).slice(0, 2);
  const h = cands[Math.floor(world.rand() * cands.length)];
  prof.lastSpawn = `h:${hs.indexOf(h)}`;
  return h;
}

// ---- home lots -------------------------------------------------------------------------------
// The parking spots (map.parking) on a home's lot, its driveway or in its garage: no NPC or world car is parked there -
// only the home's owner's own (spawnOwnedAt). The owner, 2026-10-11: "Owned player properties have vehicles parked
// halfway in the garages ... Should just not have outside vehicles parked in properties of people [who] don't own them
// so they don't get in trouble for taking a vehicle on their property." traffic.js's parked-car spawner skips them.
const lotCache = new WeakMap();
export function homeLotSpots(map) {
  let set = lotCache.get(map);
  if (set) return set;
  set = new Set();
  const T = 32, rects = [], pts = [];
  for (const h of map.homes || []) {
    if (!h || h.gone) continue;
    const b = h.b != null ? map.buildings[h.b] : null, pf = b && b.prefab >= 0 && map.prefabs ? map.prefabs[b.prefab] : null;
    const mn = b && b.prefab < 0 && map.mansions ? map.mansions.find((q) => q.tx === b.tx && q.ty === b.ty) : null;
    const lot = pf || (mn && mn.lot) || b;   // (the house's whole lot: its prefab, a mansion's walled grounds)
    if (lot) rects.push([lot.tx * T - 16, lot.ty * T - 16, (lot.tx + lot.tw) * T + 16, (lot.ty + lot.th) * T + 16]);
    for (const g of map.garages || []) if (g.home === h.id) rects.push([g.tx * T - 32, g.ty * T - 32, (g.tx + g.tw) * T + 32, (g.ty + g.th) * T + 32]);
    if (h.garage) pts.push(h.garage);
    if (h.garageDoor) pts.push(h.garageDoor);
  }
  (map.parking || []).forEach((sp, i) => {
    if (rects.some((r) => sp.x >= r[0] && sp.x <= r[2] && sp.y >= r[1] && sp.y <= r[3]) || pts.some((q) => Math.hypot(q.x - sp.x, q.y - sp.y) < 90)) set.add(i);
  });
  lotCache.set(map, set);
  return set;
}

// ---- garage -----------------------------------------------------------------------
export function nearOwnGarage(world, p, x, y, r = 170) {
  for (const h of ownedHomes(world, p.profile)) if (Math.hypot(h.garage.x - x, h.garage.y - y) < r) return h;
  return null;
}

// A waterfront home of yours whose boathouse is within reach of (x, y).
export function nearOwnDock(world, p, x, y, r = 150) {
  for (const h of ownedHomes(world, p.profile)) if (h.dock && Math.hypot(h.dock.x - x, h.dock.y - y) < r) return h;
  return null;
}

export function vehicleInteraction(world, p) {
  const ped = p.ped;
  const v = world.get(ped.vehId);
  if (!v || ped.seat !== 0 || v.wreckAt) return null;
  if (v.def.kind === 'boat') {
    if (v.def.police || v.rentedBy) return null;
    const h = nearOwnDock(world, p, v.x, v.y);
    if (!h) return null;
    if (Math.hypot(v.vx, v.vy) > 60) return { label: 'Slow down to moor in your boathouse', run: () => {} };
    return { label: `Moor ${v.def.name} in your boathouse`, run: () => storeVehicle(world, p, v, h) };
  }
  if (v.def.police || v.model === 'ambulance' || v.model === 'rescue4x4' || v.model === 'rescueboat' || v.model === 'swat') return null;
  const h = nearOwnGarage(world, p, v.x, v.y);
  if (!h) return null;
  if (v.workTruck) return { label: `A company ${v.def.name} - your garage won't keep it`, run: () => storeVehicle(world, p, v, h) };   // (storeVehicle says why)
  if (Math.hypot(v.vx, v.vy) > 60) return { label: 'Slow down to park in your garage', run: () => {} };
  return { label: `Park ${v.def.name} in your garage`, run: () => storeVehicle(world, p, v, h) };
}

export function storeVehicle(world, p, v, home) {
  const prof = p.profile;
  // a company's work truck (jobs.js workTruck): drive it, paint it, keep it out - but a garage won't keep it (the owner,
  // 2026-10-11: "you can't just park a work truck in your garage and keep it")
  if (v.workTruck) { world.notify(p, `That ${v.def.name} belongs to the company - your garage won't keep it. Bring it back where you got it for a bonus.`, 'warn'); return 'work truck'; }
  if (v.def.kind === 'air') { world.notify(p, `A garage can't take the ${v.def.name} - leave it on a helipad or an airfield.`, 'warn'); return 'aircraft'; }   // (flying: shared/flight.js)
  if (v.owner !== p.pid && prof.vehicles.length >= garageCap(world, prof)) { world.notify(p, `Garage full (${prof.vehicles.length}/${garageCap(world, prof)}). Buy another home for more space.`, 'warn'); return; }
  if (v.seats.some((s, i) => i > 0 && s)) { world.notify(p, 'Passengers have to get out first.', 'warn'); return; }
  const boat = v.def.kind === 'boat';
  const drop = boat ? home.dock.walk : { x: home.garage.x + 60, y: home.garage.y };
  for (const cid of v.cargo) if (cid) { const c = world.get(cid); if (c) { c.state = 'ground'; c.parent = 0; c.x = drop.x; c.y = drop.y; } }
  const ped = p.ped;
  if (!boat) world.emit(v.x, v.y, { e: 'garagedoor', home: home.id });
  ped.vehId = 0; ped.seat = -1;
  if (boat) { ped.x = home.dock.walk.x; ped.y = home.dock.walk.y; } else { ped.x = home.x; ped.y = home.y + 10; }
  // one of your own (taken out of a garage, or bought) is already on your list; anything else is added
  if (v.owner !== p.pid) prof.vehicles.push({ model: v.model, paint: v.paint, variant: v.variant, ...(v.tint !== undefined ? { tint: v.tint } : {}) });
  else { const ov = prof.vehicles.find((o) => o.model === v.model && o.variant === v.variant) || prof.vehicles.find((o) => o.model === v.model); if (ov) { ov.paint = v.paint; ov.variant = v.variant; if (v.tint !== undefined) ov.tint = v.tint; } }
  if (p.activeVehicle === v.id) p.activeVehicle = 0;
  world.remove(v);
  store.touch();
  p.meDirty = true;
  world.notify(p, `${v.def.name} ${boat ? 'moored in your boathouse' : 'stored in your garage'} (${prof.vehicles.length}/${garageCap(world, prof)}).`, 'good');
}

// Take a boat out of a waterfront home's boathouse: it's waiting in the slip and you're at the
// helm (from inside the house you walk straight down to it).
export function boatOut(world, p, h, idx) {
  const ped = p.ped;
  const ov = p.profile.vehicles[idx];
  if (!ped || ped.dead || !ov || !VEHICLES[ov.model] || VEHICLES[ov.model].kind !== 'boat') return 'No such boat.';
  if (!h.dock) return 'This place has no boat dock.';
  const wasInside = !!ped.hidden;
  const err = spawnOwnedAt(world, p, idx, h.dock);
  if (err) return err;
  const v = world.get(p.activeVehicle);
  // you head down to the slip and take the helm
  if (wasInside) { ped.inside = null; ped.hidden = false; }
  if (!ped.vehId) {
    v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0;
    ped.x = v.x; ped.y = v.y; ped.vx = 0; ped.vy = 0;
    v.lastDriver = ped.id; p.lastVehicle = v.id;
    world.place(ped);
    protect(world, ped);
    p.meDirty = true;
  }
  world.notify(p, `Your ${v.def.name} is out of the boathouse.`, 'good');
  return null;
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
  if (ov.tint !== undefined) v.tint = ov.tint;
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
export const homePoi = (world, h) => world.map.pois.find((q) => q.kind === 'home' && q.home === (h.isLobby ? h.block : h.lobby ?? h.id));   // (a unit's, the lobby's: its building's front door)

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

export function goInside(world, p, h) {
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
  homeinside.enter(world, p, h);   // (the rooms to walk round: homeinside.js)
}

export function openInside(world, p) {
  const ped = p.ped;
  const h = ped && ped.hidden ? homeById(world, ped.inside) : null;
  if (!h || !p.conn) return;
  const poi = homePoi(world, h);
  if (poi) { p.menu = { poi: poi.id }; p.conn.sendJSON({ ...menuBuilder(world, p, poi), inside: true }); }
}
// (economy.js hands its builder over as it loads - in an import cycle that can come before this module's own body has
// run (homes.js -> homeinside.js -> economy.js), when a `let` here would still be uninitialised: so it's kept on the
// function, whose binding is ready from the start)
export function setMenuBuilder(fn) { setMenuBuilder.fn = fn; }
const menuBuilder = (world, p, poi) => (setMenuBuilder.fn ? setMenuBuilder.fn(world, p, poi) : { t: 'menu', opts: [] });

export function leaveHome(world, p) {
  const ped = p.ped;
  if (!ped || !ped.hidden) return;
  const h = homeById(world, ped.inside);
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
    const h = homeById(world, ped.entering.home);
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
