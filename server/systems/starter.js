// The starter car (the owner, 11-03: "A starter vehicle: low-level, waiting in the arrival station's lot ... and always
// available from public garages if lost or despawned, unless you own a property with a garage"). Kept for the players who
// have one: since 11-06 (the owner, 22:49) the first car is earned by the path you pick (server/systems/firstcar.js) and a
// new character gets no starter car. A profile with a starter record (prof.starter, made on a join from 11-04 to 11-06)
// keeps everything below; one still waiting for its first day (starter { first }: a reset character who hadn't joined
// since) is a new character, and gets the first car's way instead (onJoin drops the record).
// A rusty compact (shared/vehicles.js 'starter': slow, soft), registered to you (v.owner, v.starter: your pid). It's never
// one of the cars you own (profile.vehicles): it takes no garage slot, no garage of anyone else's takes it in. It has no
// lock - stealing it is as easy as any parked car - and there's never more than one per player in the world (spawnAt).
// The numbers: shared/rules.js STARTER.
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
// - Logged off: put away where it was parked (onPlayerGone), back there on rejoining.
// overflowNear (a place's parking overflow: the nearest spaces, an open field, further spaces) and fieldSpots serve the
// first car's lots and alleys too (firstcar.js).
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

// The station with a car park nearest a point (a starter put away coming back to a space taken: the nearest lot's)
export function arrivalStation(world, x, y) {
  let best = null, bd = Infinity;
  for (const g of publicGarages(world.map)) {
    if (!g.station) continue;
    const poi = world.map.pois[g.poi], d = Math.hypot(poi.x - x, poi.y - y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}
// a profile that has a starter car: a record made on a join (not one still waiting for a first day that never came)
export const hasStarter = (prof) => !!(prof && prof.starter && !prof.starter.first);

// A space on a garage's lot for it: a free one, else one with only empty, nobody's cars in it (moved off); null if full.
// A station's lot full (many new players at once - the owner, 11-06): the nearest parking spaces beyond it, a street's
// kerb bays or another lot, out as far as it takes (overflowOf) - a new character is never left without a car, and two
// cars never share a space (each taken at once: the query sees the one just put there).
function freeSpot(world, g, except = null) {
  const near = (sp) => world.query(sp.x, sp.y, 56, K.VEH).filter((e) => e !== except && !e.removed);
  const lists = g.station ? [g.spots, overflowOf(world.map, g)] : [g.spots];
  for (const L of lists) {
    for (const sp of L) if (!near(sp).length) return sp;
    for (const sp of L) {
      const vs = near(sp);
      if (vs.every((e) => !e.owner && !e.forSale && !e.onEvent && !e.towedBy && !e.ftueMark && !e.seats.some((s) => s))) { for (const e of vs) world.remove(e); return sp; }
    }
  }
  return null;
}
// a station's overflow, in order: the parking spaces within twice the lot's reach; then an overflow field on open ground
// near the station (fieldSpots: the lawn, the dirt, the sand - in rows, clear of every building, prop, track, platform,
// road and arrival line); then every other parking space by distance - the nearest STARTER.overflow of them all
export const overflowOf = (map, g) => { const poi = map.pois[g.poi]; return overflowNear(map, `g${g.poi}`, poi.x, poi.y, g.spots); };
// the same round any point (key: the place's, for the cache; own: its own spaces, left out) - the first car's lots and
// alleys too (firstcar.js)
const OVERFLOW = new WeakMap();
export function overflowNear(map, key, x, y, own = []) {
  let per = OVERFLOW.get(map);
  if (!per) OVERFLOW.set(map, (per = new Map()));
  let L = per.get(key);
  if (L) return L;
  const lots = homes.homeLotSpots(map), mine = new Set(own.map((sp) => `${sp.x},${sp.y}`)), park = [];
  (map.parking || []).forEach((sp, i) => { if (!lots.has(i) && !sp.model && !mine.has(`${sp.x},${sp.y}`)) park.push({ x: sp.x, y: sp.y, a: sp.a ?? 0, d: Math.hypot(sp.x - x, sp.y - y) }); });
  park.sort((a, b) => a.d - b.d);
  const near = park.filter((q) => q.d <= 2 * STARTER.lotR), far = park.filter((q) => q.d > 2 * STARTER.lotR);
  L = near.concat(fieldSpots(map, x, y), far).slice(0, STARTER.overflow).map(({ x, y, a }) => ({ x, y, a }));
  per.set(key, L);
  return L;
}
// Open ground near (x, y) a car can be left on: rows of spaces (FIELD.dx apart along a row, facing east; FIELD.dy between
// rows) whose whole footprint, and a margin, is grass, dirt, sand or a car park's paving - no building, wall, water,
// road, plaza (forecourts, platforms, paths), track or kept-open ground (reserve), nothing over it (cover, deck), no
// solid prop and no parking space within reach, clear of the arrival lines - nearest first
const FIELD = { r: 1400, dx: 176, dy: 104, hl: 92, hw: 44 };
const FIELD_T = new Set([1, 8, 10, 13]);   // (T.GRASS, T.SAND, T.DIRT, T.LOT)
export function fieldSpots(map, x, y) {
  const out = [], T0 = 32, res = map.reserve, pk = map.parking || [];
  const okTile = (tx, ty) => { if (!map.inside(tx, ty)) return false; const i = map.idx(tx, ty); return FIELD_T.has(map.tiles[i]) && !(res && res[i] & ~16) && !(map.cover && map.cover[i]) && !(map.deck && map.deck[i]) && map.bld[i] < 0; };
  const solidNear = (px, py, r) => { for (let ty = Math.floor((py - r) / T0); ty <= Math.floor((py + r) / T0); ty++) for (let tx = Math.floor((px - r) / T0); tx <= Math.floor((px + r) / T0); tx++) { if (!map.inside(tx, ty)) continue; const a = map.solidProps.get(map.idx(tx, ty)); if (a && a.some((e) => !e.off && Math.abs(e.x - px) < FIELD.hl + 8 + e.r && Math.abs(e.y - py) < FIELD.hw + 8 + e.r)) return true; } return false; };
  const lines = (map.arrivals || []).map((A) => [A.pts[0], A.pts[A.pts.length - 1]]);
  const nearLine = (px, py) => lines.some(([a, b]) => { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)); return Math.hypot(a.x + dx * t - px, a.y + dy * t - py) < 200; });
  for (let cy = y - FIELD.r; cy <= y + FIELD.r; cy += FIELD.dy) for (let cx = x - FIELD.r; cx <= x + FIELD.r; cx += FIELD.dx) {
    const gx = Math.round(cx / 8) * 8, gy = Math.round(cy / 8) * 8;
    if (Math.hypot(gx - x, gy - y) > FIELD.r) continue;
    let ok = true;
    for (let ty = Math.floor((gy - FIELD.hw - 8) / T0); ok && ty <= Math.floor((gy + FIELD.hw + 8) / T0); ty++) for (let tx = Math.floor((gx - FIELD.hl - 8) / T0); ok && tx <= Math.floor((gx + FIELD.hl + 8) / T0); tx++) if (!okTile(tx, ty)) ok = false;
    if (!ok || nearLine(gx, gy) || solidNear(gx, gy, 0) || pk.some((q) => Math.abs(q.x - gx) < 150 && Math.abs(q.y - gy) < 90)) continue;
    out.push({ x: gx, y: gy, a: 0, d: Math.hypot(gx - x, gy - y) });
  }
  return out.sort((a, b) => a.d - b.d);
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
  if (!hasStarter(p.profile)) return 'You have no starter car.';
  const g = garageAt(world, poi);
  if (!g) return 'There is no garage here.';
  const h = homeGarage(world, p.profile);
  if (h) return `Your starter car lives in your garage at ${h.name} now.`;
  return deliver(world, p, (v) => freeSpot(world, g, v), g.station ? `in the parking lot at ${g.name}` : `out front at ${g.name}`);
}
// At your home (economy.js menu: 'hstarter'): out of the garage onto the driveway (as homes.spawnOwnedAt: what's parked
// there empty is moved off - a home's lot is its owner's)
export function fromHome(world, p, h) {
  if (!hasStarter(p.profile)) return 'You have no starter car.';
  if (!h || !h.garage || !homeGarage(world, p.profile)) return 'This place has no garage.';
  const spot = { ...h.garage, home: h.id };
  return deliver(world, p, (v) => { for (const e of world.query(spot.x, spot.y, 80, K.VEH)) if (e !== v && !e.seats.some((s) => s) && (!e.owner || e.owner === p.pid) && !e.forSale) world.remove(e); return spot; }, `in the driveway at ${h.name}`);
}

// ---- your car, marked (the owner, 11-06: "make sure there's a visual indicator that it's your car to take") -----------
// me.car (players.js buildMe) - this player's alone, so nobody else ever sees it: [x, y, model index, full] while you're
// on foot and your starter is parked and empty; full (1) until you've first driven it - the rings, the "YOUR CAR" plate,
// the arrow at the screen's edge, a dot on the maps (client/main.js drawMyCar) - then 0: a small plate when it's near.
// Not while the first goal's step 1 marks it already (me.job.veh: ftue.js target), nor in a home's garage.
export function marker(world, p) {
  const ped = p.ped, v = carOf(world, p.pid);
  if (!v || !ped || ped.dead || ped.vehId || ped.hidden || ped.interior || ped.onTrain || ped.ug || ped.ftueHid) return null;
  if (v.seats.some((s) => s) || v.towedBy || v.onDeck || v.scripted || v.wreckAt || v.sinkAt) return null;
  const f = p.profile.ftue;
  if (f && f.st === 'goal' && f.step === 1) return null;
  return [Math.round(v.x), Math.round(v.y), v.def.i, rec(p.profile).drove ? 0 : 1];
}

// ---- the menus' rows ------------------------------------------------------------------------------------------------
// a public garage's (economy.js buildMenu: station, garage, dealer)
export function menuOpts(world, p, poi, opts) {
  if (!hasStarter(p.profile) || !garageAt(world, poi)) return;
  const h = homeGarage(world, p.profile);
  if (h) { opts.push({ id: 'starter', label: `Your starter car: in your garage at ${h.name}`, dis: true, note: 'home' }); return; }
  opts.push(row(world, p, 'starter', 'here'));
}
// your home's (with a garage): take it out
export function homeOpts(world, p, h, opts) {
  if (!hasStarter(p.profile) || !h || !h.garage || !homeGarage(world, p.profile)) return;
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
  if (!hasStarter(p.profile) || !garageAt(world, poi) || homeGarage(world, p.profile)) return '';
  return state(world, p).k === 'ready' ? ' · your starter car' : '';
}

// ---- joining, homes --------------------------------------------------------------------------------------------------
// players.join (a new session; not a reconnect within the ghost window): a starter's cooldown carried on, one put away
// at logoff back where it was. A record still waiting for its first day (a character reset before 11-06 who hadn't joined
// since) is dropped: a new character - the first car's way (firstcar.js), no starter car.
export function onJoin(world, p) {
  const prof = p.profile;
  if (!prof.starter) return;
  if (prof.starter.first) { delete prof.starter; store.touch(); return; }
  const r = rec(prof), St = S(world);
  // lost before a restart or a logoff: the cooldown carries on where it was
  if (r.readyAt && !St.lostAt.has(p.pid) && !carOf(world, p.pid)) {
    const left = (r.readyAt - Date.now()) / 1000;
    if (left > 0) St.lostAt.set(p.pid, world.time - (STARTER.cooldownS - Math.min(STARTER.cooldownS, left)));
    else delete r.readyAt;
  }
  if (r.away && !carOf(world, p.pid) && !homeGarage(world, prof) && p.ped) {   // (put away when you logged off - onPlayerGone: back where you left it, or the nearest free space)
    const A = r.away, here = { x: A.x, y: A.y, a: A.a }, g = arrivalStation(world, A.x, A.y);
    const spot = !world.query(A.x, A.y, 56, K.VEH).some((e) => !e.removed) ? here : g ? freeSpot(world, g) : null;
    delete r.away;
    if (spot) { const v = spawnAt(world, p, spot); if (A.hp) v.hp = Math.min(v.def.hp, A.hp); }
  }
  store.touch();
}
// (tests, the dev tools: a starter car for p in garage g's lot - as a first day before 11-06 gave one) -> the vehicle
export function grant(world, p, g) {
  rec(p.profile);
  const sp = g && freeSpot(world, g);
  return sp ? spawnAt(world, p, sp) : null;
}
// players.js finalizeLogout: logged off for good (past the ghost window) - a starter parked and empty is put away, not
// lost (no cooldown): it doesn't sit in an arrival station's lot while you're gone (the owner, 11-06: enough parking when
// many new players arrive), and onJoin brings it back where it was (profile.starter.away). Out with someone else in it,
// on a tow truck's hook or a ferry, it stays out as it is.
export function onPlayerGone(world, p) {
  const v = carOf(world, p.pid);
  if (!v || v.seats.some((s) => s) || v.towedBy || v.onDeck || v.wreckAt || v.sinkAt) return;
  rec(p.profile).away = { x: Math.round(v.x), y: Math.round(v.y), a: Math.round((v.a || 0) * 1000) / 1000, hp: Math.round(v.hp) };
  S(world).car.delete(p.pid);
  world.remove(v);
  store.touch();
}
// homes.claim: a home with a garage - the starter lives there from now on (out and empty: moved in now)
export function onHome(world, p, home) {
  if (!hasStarter(p.profile) || !home || !home.garage || homeGarage(world, p.profile) !== home) return;   // (only the first: it moves once)
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
    if (d && !v.strayed && Math.hypot(v.vx || 0, v.vy || 0) > 40) { const prof = d.player.profile; if (prof && !rec(prof).drove) { rec(prof).drove = 1; store.touch(); d.player.meDirty = true; } }   // (first driven: its marker small from now on)
    if (v.strayed && !v.seats.some((s) => s) && !v.towedBy && !v.onDeck) {
      v.emptyAt ??= world.time;
      if (world.time - v.emptyAt >= STARTER.strayS && !inAnyView(world, v.x, v.y, 64)) { world.remove(v); lose(world, pid, v); }
    } else v.emptyAt = undefined;
  }
}
