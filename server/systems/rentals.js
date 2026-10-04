// Boat hire: pay at a rental dock for a jet ski, a dock motorboat or a speedboat. It's yours for
// BOAT_RENTAL_S; bring it back to any rental dock (or just leave it - an empty hire boat is towed
// back when the time is up). Still out on it after the grace period and the company reports it
// stolen.
import { K } from '../../shared/constants.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { BOAT_RENTAL_S, BOAT_RENTAL_GRACE_S, BOAT_RENTAL_PRICE } from '../../shared/rules.js';
import * as law from './law.js';

export const RENTAL_MODELS = ['jetski', 'dinghy', 'speedboat'];
const RETURN_R = 260;     // drive within this of a rental dock to hand the boat back
const WARN_BEFORE_S = 60; // "a minute left" nudge

export const rentalFor = (world, poi) => world.map.rentals.find((r) => r.poi === poi.id);
export const modelsAt = (rental) => (rental.lake ? ['jetski', 'dinghy'] : RENTAL_MODELS);

// The hire boat this player has out right now (or null).
export function current(world, p) {
  const v = p.rental ? world.get(p.rental.vid) : null;
  if (!v || v.wreckAt || v.rentedBy !== p.pid) { p.rental = null; return null; }
  return v;
}

export function menuOpts(world, p, poi) {
  const r = rentalFor(world, poi);
  const opts = [];
  if (!r) return opts;
  const out = current(world, p);
  const left = out ? Math.max(0, Math.ceil(p.rental.until - world.time)) : 0;
  for (const id of modelsAt(r)) {
    opts.push({ id: `rent:${id}`, label: `Hire a ${VEHICLES[id].name}`, price: BOAT_RENTAL_PRICE[id], note: `${Math.round(BOAT_RENTAL_S / 60)} min`, dis: !!out });
  }
  if (out) opts.push({ id: 'rentback', label: `Hand back the ${out.def.name}`, note: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} left`, dis: nearDock(world, out) === null });
  return opts;
}

export function subFor(world, p, poi) {
  const r = rentalFor(world, poi);
  const out = current(world, p);
  if (out) return `You've got a ${out.def.name} out. Bring it back to any rental dock before the time runs out - overdue boats get reported stolen.`;
  return `Hire a boat for ${Math.round(BOAT_RENTAL_S / 60)} minutes. It's waiting at the end of the pier. Return it to any rental dock, or leave it and we'll tow it back.${r && r.lake ? ' Lake craft only here.' : ''}`;
}

// Find a free berth at this dock (clearing empty boats tied up there).
function freeBerth(world, r) {
  for (const s of r.spots) {
    let busy = false;
    for (const e of world.query(s.x, s.y, 50, K.VEH)) { if (e.seats.some((q) => q)) busy = true; }
    if (!busy) return s;
  }
  return r.spots[0];
}

export function rent(world, p, poi, model, pay) {
  const r = rentalFor(world, poi);
  if (!r || !modelsAt(r).includes(model)) return 'Not for hire here.';
  if (current(world, p)) return 'Bring back the boat you already have out first.';
  const price = BOAT_RENTAL_PRICE[model];
  if (!pay(p, price)) return `You need $${price} (cash + bank).`;
  const s = freeBerth(world, r);
  for (const e of world.query(s.x, s.y, 60, K.VEH)) if (!e.seats.some((q) => q)) world.remove(e);
  const v = world.spawnVehicle(model, s.x, s.y, s.a, { npcOwned: false });
  v.rentedBy = p.pid;
  v.despawnable = false;
  p.rental = { vid: v.id, until: world.time + BOAT_RENTAL_S, warned: false, overdue: false };
  world.notify(p, `Your ${v.def.name} is at the end of the pier - ${Math.round(BOAT_RENTAL_S / 60)} minutes on the clock.`, 'good');
  p.meDirty = true;
  return null;
}

// The rental dock a boat is close enough to hand back at (or null).
export function nearDock(world, v) {
  for (const r of world.map.rentals) if (Math.hypot(r.dock.x - v.x, r.dock.y - v.y) < RETURN_R) return r;
  return null;
}

export function giveBack(world, p) {
  const v = current(world, p);
  if (!v) return 'You have no hire boat out.';
  const r = nearDock(world, v);
  if (!r) return 'Bring it back to a rental dock first.';
  if (v.seats.some((s, i) => s && i > 0 && world.get(s))) return 'Passengers have to get off first.';
  const ped = p.ped;
  if (ped && ped.vehId === v.id) {
    v.seats[ped.seat] = 0;
    ped.vehId = 0; ped.seat = -1;
    ped.x = r.dock.x; ped.y = r.dock.y;
    ped.vx = 0; ped.vy = 0;
    world.place(ped);
  }
  world.remove(v);
  p.rental = null;
  p.meDirty = true;
  world.notify(p, 'Boat returned - thanks for hiring!', 'good');
  return null;
}

// In-vehicle interaction: pull up to a rental dock in your hire boat to hand it back.
export function vehicleInteraction(world, p) {
  const v = current(world, p);
  if (!v || p.ped.vehId !== v.id || p.ped.seat !== 0) return null;
  if (!nearDock(world, v)) return null;
  if (Math.hypot(v.vx, v.vy) > 80) return { label: 'Slow down to hand the boat back', run: () => {} };
  return { label: `Hand back the ${v.def.name}`, run: () => { const e = giveBack(world, p); if (e) world.notify(p, e, 'warn'); } };
}

export function update(world) {
  if (world.tick % 10 !== 3) return;
  const now = world.time;
  for (const p of world.players.values()) {
    if (!p.rental) continue;
    const v = current(world, p);
    if (!v) continue;
    const left = p.rental.until - now;
    const aboard = v.seats.some((s) => s);
    if (!p.rental.warned && left <= WARN_BEFORE_S && left > 0) {
      p.rental.warned = true;
      world.notify(p, `One minute left on your ${v.def.name} hire - head back to a rental dock.`, 'warn');
    }
    if (left > 0) continue;
    if (!aboard) {
      // left lying about: the hire company tows it home
      world.remove(v);
      p.rental = null;
      world.notify(p, 'Your boat hire is over - the company towed it back.', 'info');
      continue;
    }
    if (!p.rental.overdue) {
      p.rental.overdue = true;
      world.notify(p, `Your hire is up! Get the ${v.def.name} back to a rental dock in ${BOAT_RENTAL_GRACE_S} seconds or it's reported stolen.`, 'bad');
    } else if (left < -BOAT_RENTAL_GRACE_S) {
      // reported stolen: it becomes an ordinary (stolen) boat
      v.rentedBy = 0;
      v.despawnable = true;
      v.npcOwned = true;
      (v.stolenBy ||= new Set()).add(p.pid);
      p.rental = null;
      const drv = world.get(v.seats[0]);
      if (drv && drv.player === p) law.crime(world, drv, 'theft', null, v.x, v.y, { silentCheck: false });
      world.notify(p, 'The hire company reported your boat stolen.', 'bad');
    }
  }
}

// A player who leaves for good: their hire boat goes back to the dock.
export function onPlayerGone(world, p) {
  const v = p.rental ? world.get(p.rental.vid) : null;
  if (v && !v.seats.some((s) => s)) world.remove(v);
  p.rental = null;
}
