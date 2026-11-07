// The first car is earned, by the path you pick (the owner, 11-06 22:49 - it replaces the free starter car, which stays
// only with the players who have one: server/systems/starter.js). The FTUE (server/systems/ftue.js) asks "What brings
// you to town?" and the answer decides how you get your first car:
//   - honest work, the great outdoors: cash (FTUE.cash, added to a new character's own) and the used lot by the station -
//     a small cheap stock (FTUE.lot: the Rusty Compact, the Rusty Pickup; the outdoors goes for the pickup) - where the
//     first step sends you; the car you buy is parked on the lot, a space of its own;
//   - a little hustle: no cash, but a car of your own to steal in the alley by the station - spawned for you on a space
//     of its own (markCar), and nobody calls this one in (vehicles.js: law.crime's `gentle`);
//   - just let me roam: the cash, and the used lot set as your waypoint.
// The owner: "stock and stealable cars must be plentiful or per-player, so many new players at once each get one" - each
// bought car and each car to steal goes on a free space (freeSpot): the lot's or the alley's own, then the overflow round
// it (starter.js overflowNear: the nearest parking spaces, an open field, further spaces), each taken at once, so no
// two ever share one.
// Where (placesFor): per arrival station, its used lot (a 'usedlot' place - World v3's hand-built ones by each arrival
// station, shared/world3-firstcars.js - else the nearest dealership) and its steal alley (m.stealAlleys, else the
// station's car park).
// The marker (players.js buildMe me.car, client main.js drawMyCar): "YOUR CAR" now marks the car you bought or stole
// first - full until you've first driven it, then (a bought one: your car out in the world) a small plate when near.
// The arrival stations themselves (arrivalChoices, arrivalFor): World v3's arrival lines (m.arrivals), else up to four
// stations with a car park, spread out; the default (FTUE.arriveDefault's region) first.
import { K } from '../../shared/constants.js';
import { VEHICLES, PAINTS } from '../../shared/vehicles.js';
import { FTUE, STARTER } from '../../shared/rules.js';
import { store } from '../store.js';
import * as homes from './homes.js';
import { overflowNear } from './starter.js';

// ---- the arrival stations -------------------------------------------------------------------------------------------
// a point's car-park spaces within R (not a home's own, not a golf cart's path), nearest first
export function spacesNear(m, x, y, R) {
  const lots = homes.homeLotSpots(m), R2 = R * R, out = [];
  (m.parking || []).forEach((sp, i) => {
    if (lots.has(i) || sp.model) return;
    const dx = sp.x - x, dy = sp.y - y, d = dx * dx + dy * dy;
    if (d <= R2) out.push({ x: sp.x, y: sp.y, a: sp.a ?? 0, d });
  });
  return out.sort((a, b) => a.d - b.d).map(({ x, y, a }) => ({ x, y, a }));
}
// [{ poi, name, key (World v3's region: 'city', 'coast', 'desert', 'country'; null on a map without arrival lines),
//    line (the arrival line's index in map.arrivals, or -1), def (the default: true for one) }], the default first
const CHOICES = new WeakMap();
export function arrivalChoices(world) {
  const m = world.map;
  let out = CHOICES.get(m);
  if (out) return out;
  out = [];
  for (const a of m.arrivals || []) {
    const poi = m.pois[a.poi];
    if (poi && !out.some((c) => c.poi === poi.id)) out.push({ poi: poi.id, name: poi.label, key: a.key || null, line: a.id });
  }
  if (!out.length) {   // (no arrival lines: up to four stations with a car park, the nearest where new characters wake first, then each the furthest from those taken)
    const gs = m.pois.filter((q) => q.kind === 'station' && !q.sub && spacesNear(m, q.x, q.y, STARTER.lotR).length);
    const sp = m.spawns && (m.spawns.default || m.spawns.hospital);
    const near = (x, y) => gs.reduce((b, q) => (!b || Math.hypot(q.x - x, q.y - y) < Math.hypot(b.x - x, b.y - y) ? q : b), null);
    const first = sp ? near(sp.x, sp.y) : gs[0];
    if (first) out.push({ poi: first.id, name: first.label, key: null, line: -1 });
    while (out.length < Math.min(4, gs.length)) {
      let best = null, bd = -1;
      for (const q of gs) {
        if (out.some((c) => c.poi === q.id)) continue;
        const d = Math.min(...out.map((c) => Math.hypot(m.pois[c.poi].x - q.x, m.pois[c.poi].y - q.y)));
        if (d > bd) { bd = d; best = q; }
      }
      if (!best) break;
      out.push({ poi: best.id, name: best.label, key: null, line: -1 });
    }
  }
  const di = Math.max(0, out.findIndex((c) => c.key === FTUE.arriveDefault));
  if (di) out.unshift(out.splice(di, 1)[0]);
  out.forEach((c, i) => { c.def = i === 0; });
  CHOICES.set(m, out);
  return out;
}
export const defaultArrival = (world) => arrivalChoices(world)[0] || null;
// A player's arrival station { poi, name }: the one their FTUE record keeps (profile.ftue.stn: picked, or the default
// kept), else the default - kept, so the train, the lot and the alley are always the same station's
export function arrivalFor(world, p) {
  const f = p.profile.ftue, cs = arrivalChoices(world);
  if (f && f.stn != null) { const c = cs.find((q) => q.poi === f.stn); if (c) return c; }
  const c = cs[0] || null;
  if (c && f && f.st !== 'done') { f.stn = c.poi; store.touch(); }
  return c;
}

// ---- the places by each station: its used lot, its steal alley --------------------------------------------------------
// { lot: { poi, name, x, y, spots }, alley: { key, name, x, y, spots } } - spots: its own spaces (the overflow: spotsOf)
const PLACES = new WeakMap();
export function placesFor(world, stn) {
  const m = world.map;
  let per = PLACES.get(m);
  if (!per) PLACES.set(m, (per = new Map()));
  let P = per.get(stn);
  if (P) return P;
  const st = m.pois[stn];
  if (!st) return null;
  const d = (q) => Math.hypot(q.x - st.x, q.y - st.y);
  const nearest = (list) => list.reduce((b, q) => (!b || d(q) < d(b) ? q : b), null);
  // the lot: this station's used lot (the world's own pick: poi.stn), else the nearest within reach, else a dealership
  const used = m.pois.filter((q) => q.kind === 'usedlot');
  const lp = used.find((q) => q.stn === stn) || nearest(used.filter((q) => d(q) <= FTUE.lotR)) || nearest(m.pois.filter((q) => q.kind === 'dealer'));
  const lot = lp ? { poi: lp.id, name: lp.label, x: lp.x, y: lp.y, spots: lotSpots(lp) } : null;
  // the alley: this station's (m.stealAlleys), else the nearest within reach, else the station's own car park
  const al = m.stealAlleys || [];
  const ap = al.find((q) => q.stn === stn) || nearest(al.filter((q) => d(q) <= FTUE.lotR));
  const alley = ap ? { key: `a${al.indexOf(ap)}`, name: ap.name, x: ap.x, y: ap.y, spots: ap.spots }
    : { key: `s${stn}`, name: `the parking lot at ${st.label}`, x: st.x, y: st.y, spots: spacesNear(m, st.x, st.y, STARTER.lotR).slice(0, 16) };
  P = { lot, alley };
  per.set(stn, P);
  return P;
}
// a lot's own spaces: a used lot's (poi.lot, the world's), else the dealership's spot out front and one either side
function lotSpots(poi) {
  if (poi.lot && poi.lot.length) return poi.lot;
  const L = poi.spawnLot || { x: poi.x, y: poi.y + 90, a: -Math.PI / 2 }, a = L.a ?? 0;
  return [0, 60, -60, 120, -120].map((k) => ({ x: L.x - Math.sin(a) * k, y: L.y + Math.cos(a) * k, a }));
}
// a place's spaces in order: its own, then its overflow (starter.js overflowNear)
const spotsOf = (world, P, key) => [P.spots || [], overflowNear(world.map, key, P.x, P.y, P.spots || [])];
// A free space for a car: the first with no vehicle near; else one with only empty nobody's cars on it (moved off - a
// parked car of the world's); null if there's none. Each taken at once (the query sees the one just put there), so no two
// cars share one.
function freeSpot(world, lists, except = null) {
  const near = (sp) => world.query(sp.x, sp.y, 56, K.VEH).filter((e) => e !== except && !e.removed);
  for (const L of lists) {
    for (const sp of L) if (!near(sp).length) return sp;
    for (const sp of L) {
      const vs = near(sp);
      if (vs.every((e) => !e.owner && !e.forSale && !e.onEvent && !e.towedBy && !e.ftueMark && !e.starter && !e.seats.some((s) => s))) { for (const e of vs) world.remove(e); return sp; }
    }
  }
  return null;
}
// a dealership's or a used lot's space for a car you own brought round (economy.js spawnOwned): its own, then the overflow
export function spotAt(world, poi, except = null) {
  const P = { x: poi.x, y: poi.y, spots: lotSpots(poi) };
  return freeSpot(world, spotsOf(world, P, `lot:${poi.id}`), except);
}

// ---- the used lot: buying a beater -------------------------------------------------------------------------------------
// what a lot stocks (its poi.stock, the world's: a farm stand's lot only the pickup) - [model, price]
export const stockOf = (poi) => Object.entries(FTUE.lot).filter(([id]) => !poi.stock || poi.stock.includes(id));
// the menu's rows (economy.js buildMenu: a used lot's; a dealership's too, under its own stock)
export function menuOpts(world, p, poi, opts) {
  for (const [id, price] of stockOf(poi)) {
    const d = VEHICLES[id];
    opts.push({ id: `ub:${id}`, label: `${d.name}, used (${d.slots.length} cargo slot${d.slots.length > 1 ? 's' : ''})`, price, note: id === 'rustpickup' ? 'a bed for your gear; tired but it goes' : 'cheap and cheerful; tired but it goes', shut: 1 });
  }
}
// bought (economy.js 'ub'): one of your cars, out on a space of its own on the lot (or round it, when it's full)
export function buy(world, p, poi, model, pay) {
  const prof = p.profile, row = stockOf(poi).find(([id]) => id === model);
  if (!row || !VEHICLES[model]) return 'Not for sale here.';
  const cap = homes.garageCap(world, prof);
  if (prof.vehicles.length >= cap) return `Garage full (${prof.vehicles.length}/${cap}). Buy a home for more garage space.`;
  const spot = spotAt(world, poi);
  if (!spot) return 'The lot is full right now - try again in a moment.';
  if (!pay(p, row[1])) return 'Not enough money (cash + bank).';
  prof.vehicles.push({ model, paint: Math.floor(world.rand() * PAINTS.length), tint: STARTER.paint });
  store.touch();
  const err = homes.spawnOwnedAt(world, p, prof.vehicles.length - 1, spot, { keep: true });
  const v = err ? null : world.get(p.activeVehicle);
  if (v) firstOf(p, v, 'buy');
  const far = v && Math.hypot(v.x - poi.x, v.y - poi.y) > 600;
  world.notify(p, `You bought a ${VEHICLES[model].name}! It's ${far ? 'parked down the street - follow its marker' : 'parked on the lot'}. Yours, in your garage list too.`, 'good');
  p.meDirty = true;
  return null;
}

// ---- the alley: a car to steal -----------------------------------------------------------------------------------------
const MARK_MODELS = ['sedan', 'compact', 'pickup', 'compact', 'sedan', 'van'];
// a car of your own to take (the hustle's first step): parked on a free space in the station's alley (or round it),
// unlocked, nobody's - and the one theft nobody calls in (vehicles.js: v.ftueMark). One per player: an older one still
// waiting goes.
export function markCar(world, p, P) {
  dropMark(world, p);
  const spot = P && freeSpot(world, spotsOf(world, P, `alley:${P.key}`));
  if (!spot) return null;
  const model = MARK_MODELS[Math.floor(world.rand() * MARK_MODELS.length)];
  const v = world.spawnVehicle(model, spot.x, spot.y, spot.a ?? 0, { parked: true, paint: Math.floor(world.rand() * PAINTS.length), variant: Math.floor(world.rand() * 1000), despawnable: false });
  v.ftueMark = p.pid;
  p.ftueMarkId = v.id;
  return v;
}
export const markOf = (world, p) => { const v = world.get(p.ftueMarkId); return v && !v.removed && v.ftueMark === p.pid ? v : null; };
// the car to steal let go of (the step skipped or done, logged off): still waiting, nobody in it - taken away
export function dropMark(world, p) {
  const v = markOf(world, p);
  p.ftueMarkId = 0;
  if (!v) return;
  if (!v.seats.some((s) => s)) world.remove(v);
  else { v.ftueMark = 0; v.despawnable = true; }
}
// vehicles.js tryEnter: taken by the one it was left for - the gentle theft (no one calls it in), and it's an ordinary
// stolen car from now on; it's the first car you stole
export function taken(world, p, v) {
  if (!v || v.ftueMark !== p.pid) return false;
  v.ftueMark = 0; v.despawnable = true; p.ftueMarkId = 0;
  firstOf(p, v, 'steal');
  return true;
}

// ---- your first car, marked ------------------------------------------------------------------------------------------
// a car bought off a lot's display (dealer.js buy): your first car, if it is
export const bought = (p, v) => firstOf(p, v, 'buy');
// profile.firstCar { k: 'buy' | 'steal', model, drove } - the first car you bought or stole (kept); p.firstCarId its
// vehicle this session
function firstOf(p, v, k) {
  const prof = p.profile;
  if (prof.firstCar) { if (k === 'buy' && prof.firstCar.k === 'buy' && !prof.firstCar.drove) p.firstCarId = v.id; return; }
  prof.firstCar = { k, model: v.def.id, drove: 0 };
  p.firstCarId = v.id;
  store.touch();
}
// me.car (players.js buildMe): [x, y, model index, full] - your first car, parked and empty, while you're on foot; full
// (1) until you've first driven it (the rings, the "YOUR CAR" plate, the arrow at the screen's edge, a dot on the maps -
// client/main.js drawMyCar), then 0: a small plate when it's near - for a car you own (the one out in the world: your
// active car); a stolen one isn't yours once you've driven it, so its marker ends there. Not while the first goal's
// step marks a car already (me.job.veh: ftue.js target).
export function marker(world, p) {
  const ped = p.ped, fc = p.profile.firstCar;
  if (!fc || !ped || ped.dead || ped.vehId || ped.hidden || ped.interior || ped.onTrain || ped.ug || ped.ftueHid) return null;
  let v = world.get(p.firstCarId);
  if (!v || v.removed) v = null;
  if (fc.drove || !v) { if (fc.k !== 'buy') return null; const a = world.get(p.activeVehicle); v = a && !a.removed && a.owner === p.pid && a.def.kind === 'car' ? a : null; }
  if (!v || v.seats.some((s) => s) || v.towedBy || v.onDeck || v.scripted || v.wreckAt || v.sinkAt) return null;
  if (fc.k === 'steal' && v.owner && v.owner !== p.pid) return null;
  const f = p.profile.ftue;
  if (f && f.st === 'goal' && f.step === 1) return null;
  return [Math.round(v.x), Math.round(v.y), v.def.i, fc.drove ? 0 : 1];
}
// each half second (ftue.js update): first driven - its marker small (or, a stolen one, gone) from now on
export function tick(world, p) {
  const fc = p.profile.firstCar, ped = p.ped;
  if (!fc || fc.drove || !ped || !ped.vehId || ped.seat !== 0) return;
  const v = world.get(ped.vehId);
  if (!v || (p.firstCarId && v.id !== p.firstCarId && !(fc.k === 'buy' && v.owner === p.pid))) return;
  if (Math.hypot(v.vx || 0, v.vy || 0) > 40) { fc.drove = 1; store.touch(); p.meDirty = true; }
}
