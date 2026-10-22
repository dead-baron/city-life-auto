// Horses (#325): ridden like a bike, but four legs (shared/vehicles.js horse; its gaits and wind: shared/physics.js; the
// numbers: shared/rules.js HORSE).
//  - The farms' horses (wildlife.js LIVESTOCK, each in its own coat - COATS) can be ridden off bareback: press the vehicle
//    button beside one and you're up - it's the farm's, so that's horse theft (law.js horseTheft), seen or not.
//  - The farm co-ops keep riding horses (economy.js 'farm' menu): hire one saddled for HORSE.hireS (bring it back to a
//    co-op, or leave it and it finds its own way home; still on it well past the time and it's reported stolen), or buy
//    one of the three in their paddock today - yours then, kept with your vehicles, saddled up at any co-op (or your
//    garage).
//  - A horse doesn't burn or blow up: out of health (shot, run into hard) it throws whoever's on it and bolts - off at a
//    gallop away from whatever hurt it, gone once nobody's watching (a hired one goes home, yours is back at the co-op).
// v.variant: the coat (0 .. COATS - 1) + BARE when it's a farm horse ridden bareback (the pages draw 'horse:s<coat>'
// saddled, 'horse:c<coat>' bare - client/art2/animals.js).
import { K } from '../../shared/constants.js';
import { HORSE } from '../../shared/rules.js';
import { HORSE_BLOCK } from '../../shared/mapcore.js';
import { mulberry32 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as vehicles from './vehicles.js';
import * as homes from './homes.js';

export const COATS = 6;
export const BARE = 8;
export const COAT_NAMES = ['chestnut', 'bay', 'black', 'grey', 'palomino', 'paint'];
const BOLT_S = 5;           // s it gallops off for before it slows (gone once nobody's watching)
const RETURN_R = 340;       // a hired horse ridden within this of a co-op can be handed back
const WARN_BEFORE_S = 60;
const rng = mulberry32(3251);

export const coatOf = (v) => (v.variant | 0) & 7;
export const isBare = (v) => ((v.variant | 0) & BARE) !== 0;
export const coatName = (v) => COAT_NAMES[coatOf(v) % COATS];
const farms = (world) => world.map.pois.filter((q) => q.kind === 'farm');

// ---- a farm's horse, ridden off -----------------------------------------------------------------------------------
// the livestock horse beside ped (on foot, within reach), or null
export function farmHorseNear(world, ped, r = 46) {
  let best = null, bd = r;
  for (const e of world.query(ped.x, ped.y, r + 20, K.PED)) {
    if (!e.wild || !e.wild.livestock || e.wild.kind !== 'horse' || e.dead || e.removed) continue;
    const d = Math.hypot(e.x - ped.x, e.y - ped.y) - (e.r || 12);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// the animal swapped for a riding horse where it stood (the farm's: npcOwned - taking it is horse theft, vehicles.js)
export function fromLivestock(world, a) {
  const v = world.spawnVehicle('horse', a.x, a.y, a.a || 0, { variant: ((a.wild.coat | 0) % COATS) | BARE, npcOwned: true });
  v.despawnable = true; v.farmHorse = true;
  world.remove(a);
  return v;
}

// ---- bolting ------------------------------------------------------------------------------------------------------
// out of health: whoever's on it thrown, and off it goes at a gallop, away from whatever hurt it
export function bolt(world, v, attackerPed = null) {
  if (v.bolt || v.removed) return;
  const sp = Math.hypot(v.vx, v.vy);
  for (const sid of [...v.seats]) {
    const ped = sid && world.get(sid);
    if (!ped) continue;
    vehicles.ejectPed(world, ped, true);
    const a = v.a + (rng() - 0.5) * 1.2;
    vehicles.fling(world, ped, Math.cos(a) * (sp * 0.7 + 60), Math.sin(a) * (sp * 0.7 + 60), null, 'crash');
    if (ped.player) world.notify(ped.player, 'Your horse threw you and bolted!', 'bad');
  }
  const away = attackerPed && !attackerPed.removed ? Math.atan2(v.y - attackerPed.y, v.x - attackerPed.x) : v.a;
  v.bolt = { until: world.time + BOLT_S, a: away };
  v.hp = Math.max(1, v.def.hp * 0.3);
  v.dead = false; v.deadBoomAt = 0; v.deadFireAt = 0; v.burnUntil = 0;
  v.parked = false;
  world.emit(v.x, v.y, { e: 'whinny', x: Math.round(v.x), y: Math.round(v.y), id: v.id });
  // a hired one's hire is over; yours waits at the co-op
  for (const p of world.players.values()) {
    if (p.horseHire && p.horseHire.vid === v.id) { p.horseHire = null; p.meDirty = true; world.notify(p, 'Your hired horse bolted for home - the hire is over.', 'info'); }
    if (v.owner === p.pid) { world.notify(p, 'Your horse bolted - saddle it up again at any farm co-op.', 'info'); if (p.activeVehicle === v.id) p.activeVehicle = 0; }
  }
}
// its stick while it bolts (vehicles.update: nobody on it): flat out away, swerving off what it runs into
export function boltInput(world, v) {
  const B = v.bolt, now = world.time;
  if (now > B.until) { v.input.throttle = 0; v.input.steer = 0; v.input.gallop = false; return; }
  // a wall or the water ahead: it veers
  const ax = v.x + Math.cos(v.a) * 70, ay = v.y + Math.sin(v.a) * 70;
  if (HORSE_BLOCK[world.map.tileAtPx(ax, ay)]) B.a += (B.turn ||= rng() < 0.5 ? -1 : 1) * 0.9;
  let d = B.a - v.a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  v.input.throttle = 1; v.input.steer = Math.max(-1, Math.min(1, d * 2)); v.input.hb = false; v.input.gallop = true;
}

// ---- the co-op's horses -------------------------------------------------------------------------------------------
// today's three in the paddock: their coats (the same all day at each co-op)
export function paddock(world, poi) {
  const day = world.day | 0, r = mulberry32((poi.id * 7919 + day * 104729) >>> 0), out = [];
  while (out.length < 3) { const c = Math.floor(r() * COATS); if (!out.includes(c)) out.push(c); }
  return out;
}
export const hired = (world, p) => {
  const v = p.horseHire ? world.get(p.horseHire.vid) : null;
  if (!v || v.removed || v.rentedBy !== p.pid) { p.horseHire = null; return null; }
  return v;
};
// where a horse is brought round to at a co-op: open ground beside it
export function spotAt(world, poi) {
  const m = world.map;
  for (let k = 0; k < 24; k++) {
    const a = k * 0.9, d = 70 + k * 9, x = poi.x + Math.cos(a) * d, y = poi.y + Math.sin(a) * d;
    let ok = true;
    for (const [dx, dy] of [[0, 0], [24, 0], [-24, 0], [0, 12], [0, -12]]) if (HORSE_BLOCK[m.tileAtPx(x + dx, y + dy)]) { ok = false; break; }
    if (ok) return { x, y, a: 0 };
  }
  return { x: poi.x, y: poi.y + 90, a: 0 };
}
export function menuOpts(world, p, poi) {
  const prof = p.profile, out = hired(world, p), opts = [];
  opts.push({ id: 'horse:hire', label: 'Hire a horse', price: HORSE.hire, note: `${Math.round(HORSE.hireS / 60)} min`, dis: !!out });
  if (out) opts.push({ id: 'horse:back', label: `Hand back the ${coatName(out)} horse`, dis: Math.hypot(out.x - poi.x, out.y - poi.y) > RETURN_R });
  for (const c of paddock(world, poi)) opts.push({ id: `horse:buy:${c}`, label: `Buy the ${COAT_NAMES[c]} horse`, price: HORSE.price, note: 'yours to keep' });
  prof.vehicles.forEach((ov, i) => { if (ov.model === 'horse') opts.push({ id: `vg:${i}`, label: `Saddle up your ${COAT_NAMES[(ov.variant | 0) % COATS]} horse` }); });
  return opts;
}
export function hire(world, p, poi, pay) {
  if (hired(world, p)) return 'Bring back the horse you have out first.';
  if (!pay(p, HORSE.hire)) return `You need $${HORSE.hire} (cash + bank).`;
  const s = spotAt(world, poi), coat = paddock(world, poi)[Math.floor(rng() * 3)];
  for (const e of world.query(s.x, s.y, 50, K.VEH)) if (!e.seats.some((q) => q) && e.def.horse && !e.owner) world.remove(e);
  const v = world.spawnVehicle('horse', s.x, s.y, s.a, { variant: coat, npcOwned: false });
  v.rentedBy = p.pid; v.despawnable = false;
  p.horseHire = { vid: v.id, until: world.time + HORSE.hireS, warned: false, overdue: false, poi: poi.id };
  world.notify(p, `A ${COAT_NAMES[coat]} horse, saddled and waiting by the co-op - ${Math.round(HORSE.hireS / 60)} minutes. Sprint to gallop; it tires.`, 'good');
  p.meDirty = true;
  return null;
}
export function giveBack(world, p) {
  const v = hired(world, p);
  if (!v) return 'You have no hired horse out.';
  if (!farms(world).some((q) => Math.hypot(v.x - q.x, v.y - q.y) < RETURN_R)) return 'Ride it back to a farm co-op to hand it in.';
  for (const sid of [...v.seats]) { const ped = sid && world.get(sid); if (ped) vehicles.ejectPed(world, ped, false); }
  world.remove(v);
  p.horseHire = null; p.meDirty = true;
  world.notify(p, 'Horse handed back. Thanks for riding!', 'good');
  return null;
}
export function buy(world, p, poi, coat, pay) {
  const prof = p.profile;
  if (!paddock(world, poi).includes(coat)) return 'That one has gone.';
  if (prof.vehicles.length >= homes.garageCap(world, prof)) return `No room (${prof.vehicles.length}/${homes.garageCap(world, prof)} vehicles). Buy a home for more.`;
  if (!pay(p, HORSE.price)) return `You need $${HORSE.price.toLocaleString()} (cash + bank).`;
  prof.vehicles.push({ model: 'horse', paint: 0, variant: coat });
  store.touch();
  world.notify(p, `The ${COAT_NAMES[coat]} horse is yours! Saddled and waiting by the co-op - saddle it up again at any co-op.`, 'good');
  return homes.spawnOwnedAt(world, p, prof.vehicles.length - 1, spotAt(world, poi));
}
// riding a hired horse up to a co-op: the Act prompt hands it back
export function vehicleInteraction(world, p) {
  const v = hired(world, p);
  if (!v || p.ped.vehId !== v.id || p.ped.seat !== 0) return null;
  if (!farms(world).some((q) => Math.hypot(v.x - q.x, v.y - q.y) < RETURN_R)) return null;
  if (Math.hypot(v.vx, v.vy) > 80) return { label: 'Slow down to hand the horse back', run: () => {} };
  return { label: 'Hand back the horse', run: () => { const e = giveBack(world, p); if (e) world.notify(p, e, 'warn'); } };
}

// the page's: your horse's wind while you're on one (the HUD's bar; the page's own prediction of its gait)
export function meInfo(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || !v.def.horse) return null;
  return { st: Math.round((v.stam ?? 1) * 100) / 100, bl: v.blown ? 1 : 0, hire: p.horseHire && p.horseHire.vid === v.id ? Math.max(0, Math.ceil(p.horseHire.until - world.time)) : null };
}

export function update(world) {
  const now = world.time;
  if (world.tick % 10 === 7) {
    for (const p of world.players.values()) {
      if (!p.horseHire) continue;
      const v = hired(world, p);
      if (!v) continue;
      const H = p.horseHire, left = H.until - now, aboard = v.seats.some((s) => s);
      if (!H.warned && left <= WARN_BEFORE_S && left > 0) { H.warned = true; world.notify(p, 'One minute left on your horse - ride it back to a farm co-op.', 'warn'); }
      if (left > 0) continue;
      if (!aboard) { world.remove(v); p.horseHire = null; world.notify(p, 'Your horse hire is over - it found its own way home.', 'info'); continue; }
      if (!H.overdue) { H.overdue = true; world.notify(p, `Your hire is up! Get the horse back to a co-op in ${HORSE.graceS} seconds or it's reported stolen.`, 'bad'); }
      else if (left < -HORSE.graceS) {
        v.rentedBy = 0; v.despawnable = true; v.npcOwned = true;
        (v.stolenBy ||= new Set()).add(p.pid);
        p.horseHire = null;
        const drv = world.get(v.seats[0]);
        if (drv && drv.player === p) law.crime(world, drv, 'horseTheft', null, v.x, v.y);
        world.notify(p, 'The co-op reported your horse stolen.', 'bad');
      }
    }
  }
  // a bolted horse, its run over, gone once nobody's watching
  if (world.tick % 20 === 11) {
    for (const v of world.entities.values()) {
      if (v.kind !== K.VEH || !v.bolt || now < v.bolt.until || v.seats.some((s) => s)) continue;
      if (!inAnyView(world, v.x, v.y, 60)) world.remove(v);
    }
  }
}
// a player who leaves for good: the hired horse goes home
export function onPlayerGone(world, p) {
  const v = p.horseHire ? world.get(p.horseHire.vid) : null;
  if (v && !v.seats.some((s) => s)) world.remove(v);
  p.horseHire = null;
}
