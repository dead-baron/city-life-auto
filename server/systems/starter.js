// The starter car (the owner, 11-03: "A starter vehicle: low-level, waiting in the arrival station's lot ... and always
// available from public garages if lost or despawned, unless you own a property with a garage"). A rusty compact
// (shared/vehicles.js 'starter': slow, soft, no price), registered to you (v.owner, v.starter: your pid). It's never one
// of the cars you own (profile.vehicles): it takes no garage slot, no dealer sells it, no garage of anyone else's takes it
// in. It has no lock - stealing it is as easy as any parked car - and there's never more than one per player in the
// world (spawnAt). The numbers: shared/rules.js STARTER.
//
// - First day: a new character (store.js defaultProfile: starter { first }) finds it in the car park of the arrival
//   station - arrivalStation(), the station nearest where they woke up (the FTUE, arriving by train at a station you
//   pick, replaces that one function).
// - Public garages: what the map already has, nothing added to the world. Every train station with a car park (its
//   parking spaces within STARTER.lotR of the station's board - the main line's lots in the countryside and World v3's
//   station car parks, the street spaces by a station in town), the Fresh Coat Garage(s) and the dealerships (they bring
//   a car you own round already: economy.js 'vg'). At one: your starter, free, if it's been lost and STARTER.cooldownS
//   has passed since; still out somewhere and empty, it's brought round as it is; out with someone else in it, it isn't.
// - Lost: wrecked, sunk, towed, or taken away by anything (a despawn, a logoff tidy-up): update() sees it gone and the
//   cooldown starts (kept on the profile too - readyAt - so it holds across a restart and a rejoin). A starter someone
//   else drove off in (strayed) and left empty, out of everyone's sight STARTER.strayS, is taken away: lost, free again.
// - Own a home with a garage and it lives there: the home's menu takes it out (homeOpts / fromHome), the public garages
//   point you home, and parking it in your garage puts it away (homes.storeVehicle: no cooldown). Buying the home moves
//   it there (onHome).
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { STARTER } from '../../shared/rules.js';
import { store } from '../store.js';
import { inAnyView } from '../view.js';
import * as homes from './homes.js';

const MODEL = 'starter';
const S = (world) => (world.starter ||= { car: new Map(), lostAt: new Map() });   // pid -> the starter's vehicle id; pid -> world.time it was lost
const rec = (prof) => (prof.starter ||= {});
const mmss = (s) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const NAME = () => VEHICLES[MODEL].name;

// ---- the public garages (from the built map, once per map) -----------------------------------------------------------
const GARAGES = new WeakMap();
const KINDS = new Set(['garage', 'dealer']);
// [{ poi, name, station, spots: [{ x, y, a }] }]: the stations with a car park, the Fresh Coat Garages, the dealerships
export function publicGarages(map) {
  let gs = GARAGES.get(map);
  if (gs) return gs;
  gs = [];
  const lots = homes.homeLotSpots(map), R2 = STARTER.lotR * STARTER.lotR;
  for (const poi of map.pois) {
    if (poi.kind === 'station' && !poi.sub) {
      const spots = [];
      (map.parking || []).forEach((sp, i) => {
        if (lots.has(i) || sp.model) return;   // (a home's own spaces; a golf course's cart path)
        const dx = sp.x - poi.x, dy = sp.y - poi.y;
        if (dx * dx + dy * dy <= R2) spots.push({ x: sp.x, y: sp.y, a: sp.a ?? 0, d: dx * dx + dy * dy });
      });
      if (!spots.length) continue;
      spots.sort((a, b) => a.d - b.d);
      gs.push({ poi: poi.id, name: poi.label, station: true, spots: spots.slice(0, 16).map(({ x, y, a }) => ({ x, y, a })) });
    } else if (KINDS.has(poi.kind)) {
      const L = poi.spawnLot || { x: poi.x, y: poi.y + 90, a: -Math.PI / 2 }, a = L.a ?? 0;   // (where economy.js spawnOwned brings a car round)
      gs.push({ poi: poi.id, name: poi.label, station: false, spots: [0, 60, -60].map((k) => ({ x: L.x - Math.sin(a) * k, y: L.y + Math.cos(a) * k, a })) });   // (and a space either side of it)
    }
  }
  GARAGES.set(map, gs);
  return gs;
}
export const garageAt = (world, poi) => (poi ? publicGarages(world.map).find((g) => g.poi === poi.id) || null : null);

// The arrival station: where a new character's starter waits on their first day. Until the FTUE (arriving by train at a
// station you pick) exists, the station with a car park nearest where a new character first wakes up (a hospital:
// homes.resolveSpawn). The FTUE replaces this function.
export function arrivalStation(world, x, y) {
  let best = null, bd = Infinity;
  for (const g of publicGarages(world.map)) {
    if (!g.station) continue;
    const poi = world.map.pois[g.poi], d = Math.hypot(poi.x - x, poi.y - y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// A space on a garage's lot for it: a free one, else one with only empty, nobody's cars in it (moved off); null if full
function freeSpot(world, g, except = null) {
  const near = (sp) => world.query(sp.x, sp.y, 56, K.VEH).filter((e) => e !== except && !e.removed);
  for (const sp of g.spots) if (!near(sp).length) return sp;
  for (const sp of g.spots) {
    const vs = near(sp);
    if (vs.every((e) => !e.owner && !e.forSale && !e.onEvent && !e.towedBy && !e.seats.some((s) => s))) { for (const e of vs) world.remove(e); return sp; }
  }
  return null;
}

// ---- where it is ----------------------------------------------------------------------------------------------------
export function carOf(world, pid) {
  const id = S(world).car.get(pid), v = id ? world.get(id) : null;
  return v && !v.removed && v.starter === pid ? v : null;
}
// your home with a garage it lives in (the first), or null
export const homeGarage = (world, prof) => homes.ownedHomes(world, prof).find((h) => h && h.garage) || null;
// seconds until a lost one's free again (0: it is)
export function waitLeft(world, pid) {
  const t = S(world).lostAt.get(pid);
  return t === undefined ? 0 : Math.max(0, t + STARTER.cooldownS - world.time);
}
const takenBy = (world, v, pid) => v.seats.some((s) => { const q = s && world.get(s); return q && !(q.player && q.player.pid === pid); });
// 'out' (yours to fetch: in the world, nobody else in it), 'taken' (someone else in it, or out of reach - on a tow
// truck's hook, a ferry's deck), 'wait' (lost: the cooldown), 'ready'
export function state(world, p) {
  const v = carOf(world, p.pid);
  if (v) return { k: takenBy(world, v, p.pid) || v.towedBy || v.onDeck || v.scripted ? 'taken' : 'out', v };
  const w = waitLeft(world, p.pid);
  return w > 0 ? { k: 'wait', secs: w } : { k: 'ready' };
}

// ---- out it comes -----------------------------------------------------------------------------------------------------
// One per player: any other starter of theirs goes first (empty: taken away; someone in it: theirs now, nobody's
// starter - as with Start fresh's cars, players.wipeAccount).
function dropOld(world, pid) {
  for (const e of [...world.entities.values()]) {
    if (e.kind !== K.VEH || e.starter !== pid) continue;
    if (!e.seats.some((s) => s)) world.remove(e);
    else { e.starter = 0; e.owner = null; e.ownerName = null; e.despawnable = true; e.descVer = (e.descVer || 0) + 1; }
  }
}
function spawnAt(world, p, spot) {
  dropOld(world, p.pid);
  const v = world.spawnVehicle(MODEL, spot.x, spot.y, spot.a ?? 0, { paint: STARTER.paint, variant: Math.floor(world.rand() * 1000), owner: p.pid, ownerName: p.name, npcOwned: false, despawnable: false });
  v.tint = STARTER.paint;   // (the rust: over the Hatchback's bodywork - client art2 actors.js vehLook, render/sprites.js tinted)
  v.starter = p.pid;
  const St = S(world);
  St.car.set(p.pid, v.id); St.lostAt.delete(p.pid);
  delete rec(p.profile).readyAt;
  store.touch();
  if (spot.home != null) world.emit(spot.x, spot.y, { e: 'garagedoor', home: spot.home });
  p.meDirty = true;
  return v;
}
// brought round as it is (dents, fuel and all): the attendant fetched it
function bringRound(world, v, spot) {
  v.x = spot.x; v.y = spot.y; v.a = spot.a ?? 0; v.vx = 0; v.vy = 0; v.av = 0; v.lz = 0; v.input = { throttle: 0, steer: 0, hb: false };
  v.strayed = false; v.emptyAt = undefined;
  world.place(v);
  if (spot.home != null) world.emit(spot.x, spot.y, { e: 'garagedoor', home: spot.home });
}
// spotFor(v): where it goes (v: the one out already, brought round) - asked only once it's coming
function deliver(world, p, spotFor, where) {
  const st = state(world, p);
  if (st.k === 'taken') return `Your starter car is out with someone else - it turns up again once it's left somewhere.`;
  if (st.k === 'wait') return `Your starter car will be ready in ${mmss(st.secs)}.`;
  const spot = spotFor(st.v || null);
  if (!spot) return 'The lot is full right now - try again in a moment.';
  if (st.k === 'out') { bringRound(world, st.v, spot); world.notify(p, `Your ${NAME()} has been brought around - ${where}.`, 'good'); return null; }
  spawnAt(world, p, spot);
  world.notify(p, `Your starter car is ${where}: a ${NAME()}, registered to you. Free, as ever.`, 'good');
  return null;
}
// At a public garage (economy.js menu: 'starter')
export function fetch(world, p, poi) {
  const g = garageAt(world, poi);
  if (!g) return 'There is no garage here.';
  const h = homeGarage(world, p.profile);
  if (h) return `Your starter car lives in your garage at ${h.name} now.`;
  return deliver(world, p, (v) => freeSpot(world, g, v), g.station ? `in the parking lot at ${g.name}` : `out front at ${g.name}`);
}
// At your home (economy.js menu: 'hstarter'): out of the garage onto the driveway (as homes.spawnOwnedAt: what's parked
// there empty is moved off - a home's lot is its owner's)
export function fromHome(world, p, h) {
  if (!h || !h.garage || !homeGarage(world, p.profile)) return 'This place has no garage.';
  const spot = { ...h.garage, home: h.id };
  return deliver(world, p, (v) => { for (const e of world.query(spot.x, spot.y, 80, K.VEH)) if (e !== v && !e.seats.some((s) => s) && (!e.owner || e.owner === p.pid) && !e.forSale) world.remove(e); return spot; }, `in the driveway at ${h.name}`);
}

// ---- the menus' rows ------------------------------------------------------------------------------------------------
// a public garage's (economy.js buildMenu: station, garage, dealer)
export function menuOpts(world, p, poi, opts) {
  if (!garageAt(world, poi)) return;
  const h = homeGarage(world, p.profile);
  if (h) { opts.push({ id: 'starter', label: `Your starter car: in your garage at ${h.name}`, dis: true, note: 'home' }); return; }
  opts.push(row(world, p, 'starter', 'here'));
}
// your home's (with a garage): take it out
export function homeOpts(world, p, h, opts) {
  if (!h || !h.garage || !homeGarage(world, p.profile)) return;
  opts.push(row(world, p, 'hstarter', 'garage'));
}
function row(world, p, id, at) {
  const st = state(world, p);
  if (st.k === 'taken') return { id, label: 'Your starter car: someone else has it', dis: true, note: 'back once it\'s left' };
  if (st.k === 'wait') return { id, label: `Your starter car: ready in ${mmss(st.secs)}`, dis: true, note: 'free' };
  if (st.k === 'out') return { id, label: `Bring your starter car around (${where(world, st.v)})`, note: 'free', shut: 1 };
  return { id, label: at === 'garage' ? `Take out your ${NAME()} (starter car)` : `Your starter car: a ${NAME()}`, note: 'free', shut: 1 };
}
const where = (world, v) => (world.map.districtAt && world.map.districtAt(v.x, v.y)?.name) || 'out in the world';
// a few words after a public garage's prompt (economy.js poiLabel) when your starter's waiting there for you
export function promptTag(world, p, poi) {
  if (!garageAt(world, poi) || homeGarage(world, p.profile)) return '';
  return state(world, p).k === 'ready' ? ' · your starter car' : '';
}

// ---- joining, homes --------------------------------------------------------------------------------------------------
// players.join (a new session; not a reconnect within the ghost window)
export function onJoin(world, p) {
  const prof = p.profile, r = rec(prof), St = S(world);
  // lost before a restart or a logoff: the cooldown carries on where it was
  if (r.readyAt && !St.lostAt.has(p.pid) && !carOf(world, p.pid)) {
    const left = (r.readyAt - Date.now()) / 1000;
    if (left > 0) St.lostAt.set(p.pid, world.time - (STARTER.cooldownS - Math.min(STARTER.cooldownS, left)));
    else delete r.readyAt;
  }
  if (!r.first) { store.touch(); return; }
  delete r.first;
  store.touch();
  if (carOf(world, p.pid) || homeGarage(world, prof) || !p.ped) return;
  const g = arrivalStation(world, p.ped.x, p.ped.y), sp = g && freeSpot(world, g);
  if (!sp) { world.notify(p, 'Your starter car - a rusty compact, registered to you - is free at any public garage: a station parking lot, the Fresh Coat Garage or a dealership.', 'info'); return; }
  spawnAt(world, p, sp);
  world.notify(p, `Your starter car is waiting in the parking lot at ${g.name}: a ${NAME()}, registered to you. Lose it and another is free at any public garage.`, 'good');
}
// homes.claim: a home with a garage - the starter lives there from now on (out and empty: moved in now)
export function onHome(world, p, home) {
  if (!home || !home.garage || homeGarage(world, p.profile) !== home) return;   // (only the first: it moves once)
  const v = carOf(world, p.pid);
  if (v && !v.seats.some((s) => s) && !v.towedBy && !v.onDeck) { putAway(world, p.pid); world.remove(v); }
  world.notify(p, `Your starter car lives in the garage at ${home.name} now.`, 'info');
}
// homes.storeVehicle: parked in your own garage - put away, not lost (no cooldown)
export function putAway(world, pid) { S(world).car.delete(pid); }
// players.wipeAccount: a new character - none of the old one's
export function forget(world, pid) { const St = S(world); St.car.delete(pid); St.lostAt.delete(pid); }

// ---- lost, strayed --------------------------------------------------------------------------------------------------
function lose(world, pid, v) {
  const St = S(world);
  St.car.delete(pid);
  St.lostAt.set(pid, world.time);
  if (v && !v.removed && v.starter === pid) v.starter = 0;   // (a burnt shell, a sinking wreck: no longer the starter)
  const prof = store.get(pid);
  if (prof) { rec(prof).readyAt = Date.now() + STARTER.cooldownS * 1000; store.touch(); }
  const p = world.players.get(pid);
  if (!p) return;
  const why = v && v.wreckAt ? 'wrecked' : v && v.sinkAt ? 'sunk' : 'gone';
  const h = prof && homeGarage(world, prof);
  world.notify(p, `Your starter car is ${why}. Another one is free ${h ? `in your garage at ${h.name}` : 'at any public garage'} in ${Math.round(STARTER.cooldownS / 60)} minutes.`, 'warn');
  p.meDirty = true;
}
export function update(world) {
  if (world.tick % 10 !== 3) return;
  const St = world.starter;
  if (!St || !St.car.size) return;
  for (const [pid, id] of [...St.car]) {
    const v = world.get(id);
    if (!v || v.removed || v.starter !== pid || v.wreckAt || v.sinkAt) { lose(world, pid, v); continue; }
    const d = v.seats[0] ? world.get(v.seats[0]) : null;
    if (d) v.strayed = !(d.player && d.player.pid === pid);
    if (v.strayed && !v.seats.some((s) => s) && !v.towedBy && !v.onDeck) {
      v.emptyAt ??= world.time;
      if (world.time - v.emptyAt >= STARTER.strayS && !inAnyView(world, v.x, v.y, 64)) { world.remove(v); lose(world, pid, v); }
    } else v.emptyAt = undefined;
  }
}
