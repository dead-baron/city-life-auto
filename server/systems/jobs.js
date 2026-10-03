// Professions & extraction loops: courier contracts, Refuge Island harvests (GDD §5),
// contraband drops for the black market / evidence locker, and the deep-sim fishing loop.
import { K, T } from '../../shared/constants.js';
import { ITEMS, FISH_TABLE } from '../../shared/items.js';
import { RIVER_X0, RIVER_X1 } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';

const rng = mulberry32(5150);

export function init(world) {
  world.nextDropAt = world.time + 90;
  world.dropRumor = null;
}

export function update(world) {
  const now = world.time;
  // contraband drops: rare iron vaults / carbon-gold cases at a random drop site
  if (now >= world.nextDropAt) {
    world.nextDropAt = now + 240 + rng() * 120;
    const online = [...world.players.values()].filter((p) => p.conn);
    let active = 0;
    for (const e of world.entities.values()) if (e.kind === K.CRATE && e.contraband) active++;
    if (online.length && active < 3) spawnDrop(world);
  }
  if (world.dropRumor && now > world.dropRumor.until) world.dropRumor = null;
  // jobs: expiry
  for (const p of world.players.values()) {
    if (p.job && now > p.job.expires) failJob(world, p, 'Contract expired.');
    const ped = p.ped;
    if (ped && ped.fishing) {
      const f = ped.fishing;
      if (!f.notified && now >= f.biteAt) { f.notified = true; p.meDirty = true; world.emit(f.x, f.y, { e: 'bite', x: f.x, y: f.y }); }
      if (now > f.biteAt + f.window) { cancelFishing(world, p, 'The fish got away... cast again.'); }
    }
  }
}

export function spawnDrop(world, forceTier = 0) {
  const sites = world.map.dropSites;
  const site = sites[Math.floor(rng() * sites.length)];
  const tier = forceTier || (rng() < 0.25 ? 4 : 3);
  const c = world.spawnCrate(tier, site.x + (rng() - 0.5) * 40, site.y + (rng() - 0.5) * 40, { contraband: true });
  c.expires = world.time + 900;
  const name = tier === 4 ? 'Legendary Carbon-Gold Case' : 'Secure Iron Vault';
  world.dropRumor = { x: site.x, y: site.y, until: world.time + 120, tier };
  events.add(world, { kind: 'drop', x: site.x, y: site.y, until: world.time + 120 });
  world.broadcast({ e: 'toast', text: `Rumor: a ${name} was spotted near ${site.name}. Fence it, or turn it in.`, tone: 'warn' });
  return c;
}

function pickDestination(world, from, minDist) {
  const dests = world.map.pois.filter((q) => q.kind === 'delivery' && Math.hypot(q.x - from.x, q.y - from.y) > minDist);
  return dests[Math.floor(rng() * dests.length)] || world.map.pois.find((q) => q.kind === 'delivery');
}

// opts (from the phone board): { dest, pay, limit, tier } - pickup is at that storefront's door
export function startCourier(world, p, poi, opts = {}) {
  const pad = poi.cargoPad || { x: poi.x + 18, y: poi.y + 14 };
  const tier = opts.pay ? (opts.pay >= 400 ? 2 : 1) : (rng() < 0.7 ? 1 : 2);
  const c = world.spawnCrate(tier, pad.x, pad.y, { owner: p.pid, job: { type: 'courier', pid: p.pid }, ...(opts.pay ? { value: opts.pay } : {}) });
  const dest = opts.dest || pickDestination(world, pad, 1200);
  const name = tier === 1 ? 'Wood Box' : 'Steel Barrel';
  p.job = {
    type: 'courier', crates: [c.id], dest: dest.id, tx: dest.x, ty: dest.y, expires: world.time + (opts.limit || 900),
    text: `Deliver the ${name} ($${c.value}) to ${dest.label}`,
    pickupText: `Pick up the ${name} at ${poi.label}`,
  };
  c.job.dest = dest.id;
  world.notify(p, opts.dest ? `Job accepted: pick up the ${name} at ${poi.label} - it's marked on your map.` : 'Contract accepted. Your crate is on the loading pad - grab a vehicle with open cargo slots.', 'good');
  return null;
}

export function startFarm(world, p, poi) {
  const pad = poi.cargoPad || { x: poi.x, y: poi.y + 60 };
  const grocery = world.map.pois.find((q) => q.kind === 'grocery');
  const ids = [];
  for (let i = 0; i < 4; i++) {
    const c = world.spawnCrate(1, pad.x + (i % 2) * 34 - 17, pad.y + Math.floor(i / 2) * 34, { owner: p.pid, label: 'Produce Box', value: 140, contraband: false, job: { type: 'farm', pid: p.pid } });
    ids.push(c.id);
  }
  // a farm pickup waits nearby to help haul
  const truck = world.spawnVehicle('pickup', pad.x + 110, pad.y, -Math.PI / 2, { npcOwned: false });
  truck.issuedTo = p.pid; truck.despawnable = true;
  p.job = { type: 'farm', crates: ids, dest: grocery.id, tx: grocery.x, ty: grocery.y, expires: world.time + 1200, text: `Haul 4 Produce Boxes to ${grocery.label} in the city`, pickupText: `Load the 4 Produce Boxes at ${poi.label}` };
  world.notify(p, 'Harvest contract! 4 Produce Boxes are in the field by the farm road. A co-op pickup is parked next to them.', 'good');
  return null;
}

export function failJob(world, p, msg) {
  if (!p.job) return;
  for (const id of p.job.crates || []) { const c = world.get(id); if (c && c.job) c.job = null; }
  p.job = null;
  world.notify(p, msg, 'bad');
  p.meDirty = true;
}

// While carrying a crate: which delivery zone (if any) are we standing in?
export function deliveryZoneFor(world, p, crate) {
  if (!crate) return null;
  const ped = p.ped;
  const near = (kind, r = 70) => world.map.pois.find((q) => q.kind === kind && Math.hypot(q.x - ped.x, q.y - ped.y) < r);
  if (crate.job && crate.job.type === 'courier' && crate.job.pid === p.pid) {
    const dest = world.map.pois[crate.job.dest];
    if (dest && Math.hypot(dest.x - ped.x, dest.y - ped.y) < 70) return { label: `Deliver (+$${crate.value})`, run: () => deliverLegit(world, p, crate, 'courier') };
  }
  if (crate.label === 'Produce Box' && near('grocery', 80)) return { label: `Sell produce to FreshHub (+$${crate.value})`, run: () => deliverLegit(world, p, crate, 'farm') };
  if (crate.contraband) {
    if (near('fence')) return { label: `Sell to the Black Market (+$${crate.value})`, run: () => fence(world, p, crate, 1) };
    if (near('evidence') || near('police')) return { label: `Turn in as evidence (+$${Math.round(crate.value * 0.5)}, +15 Samaritan)`, run: () => evidence(world, p, crate) };
  } else if (crate.job && crate.job.pid !== p.pid && near('fence')) {
    return { label: `Fence stolen cargo (+$${Math.round(crate.value * 0.6)})`, run: () => fence(world, p, crate, 0.6) };
  }
  return null;
}

function consume(world, p, crate) {
  p.ped.carrying = 0;
  world.remove(crate);
  world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
  p.meDirty = true;
}

function deliverLegit(world, p, crate, type) {
  const prof = p.profile;
  prof.cash += crate.value;
  prof.samaritan += 2;
  prof.stats.deliveries++;
  consume(world, p, crate);
  world.notify(p, `Delivered! +$${crate.value}, +2 Samaritan.`, 'good');
  const owner = crate.job ? world.players.get(crate.job.pid) : null;
  if (owner && owner.job) {
    owner.job.crates = owner.job.crates.filter((id) => id !== crate.id);
    if (!owner.job.crates.length) {
      const bonus = type === 'farm' ? 200 : 0;
      if (owner === p && bonus) { prof.cash += bonus; world.notify(p, `Harvest complete! Bonus +$${bonus}.`, 'good'); }
      owner.job = null; owner.meDirty = true;
    } else if (owner === p) world.notify(p, `${owner.job.crates.length} box(es) left.`, 'info');
  }
  store.touch();
}

function fence(world, p, crate, mult) {
  const prof = p.profile;
  const gain = Math.round(crate.value * mult);
  prof.bank += gain; // sales go straight to the bank
  prof.criminalExp += Math.round(gain / 100);
  consume(world, p, crate);
  world.notify(p, `The Exchange wired $${gain} to your bank. +${Math.round(gain / 100)} Criminal EXP.`, 'good');
  if (crate.job) { const owner = world.players.get(crate.job.pid); if (owner && owner.job) failJob(world, owner, 'Your cargo was fenced by a thief. Contract lost.'); }
  store.touch();
}

function evidence(world, p, crate) {
  const prof = p.profile;
  const gain = Math.round(crate.value * 0.5);
  prof.cash += gain;
  prof.samaritan += 15;
  consume(world, p, crate);
  world.notify(p, `Contraband seized as evidence. +$${gain}, +15 Samaritan.`, 'good');
  store.touch();
}

// ---- Snatch-and-grab follow-up ---------------------------------------------------
export function purseVictimNear(world, p) {
  if (!(p.profile.inventory.purse > 0)) return null;
  return npc.nearestRobbedVictim(world, p.ped);
}

export function returnPurse(world, p, victim) {
  const prof = p.profile;
  prof.inventory.purse--;
  const tip = 50 + Math.floor(rng() * 100);
  prof.cash += tip;
  prof.samaritan += 10;
  victim.npc.robbed = false; victim.npc.keep = false; victim.npc.state = 'wander';
  world.emit(victim.x, victim.y, { e: 'thanks', x: victim.x, y: victim.y });
  world.notify(p, `"Thank you so much!" +$${tip} tip, +10 Samaritan.`, 'good');
  p.meDirty = true;
  store.touch();
}

// ---- Fishing (GDD §5) ----------------------------------------------------------------
export function fishingSpot(world, ped) {
  const m = world.map;
  for (const off of [0, 0.6, -0.6, Math.PI / 2, -Math.PI / 2]) {
    const a = ped.a + off;
    for (const d of [30, 48]) {
      const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
      const t = m.tileAtPx(x, y);
      if (t === T.WATER || t === T.DEEP) {
        const tx = Math.floor(x / 32);
        const kind = t === T.DEEP && !(tx >= RIVER_X0 && tx <= RIVER_X1) ? 'deep' : (tx >= RIVER_X0 && tx <= RIVER_X1 ? 'river' : 'shore');
        return { x, y, kind, a };
      }
    }
  }
  return null;
}

export function castLine(world, p, spot) {
  const ped = p.ped;
  ped.a = spot.a;
  ped.fishing = { x: spot.x, y: spot.y, kind: spot.kind, biteAt: world.time + 3 + rng() * 6, window: 1.2, notified: false };
  ped.weapon = 'rod';
  world.emit(spot.x, spot.y, { e: 'cast', x: spot.x, y: spot.y, fx: ped.x, fy: ped.y });
  p.meDirty = true;
}

export function reelIn(world, p) {
  const ped = p.ped;
  const f = ped.fishing;
  if (!f) return;
  const now = world.time;
  if (now < f.biteAt) { cancelFishing(world, p, 'Too early - you spooked the fish.'); return; }
  if (now > f.biteAt + f.window) { cancelFishing(world, p, 'Too slow - it got away.'); return; }
  const prof = p.profile;
  const w = [...FISH_TABLE[f.kind]];
  if (world.clock.isNight) w[1] = 35; // catfish spike at night
  const lure = (prof.inventory.lure || 0) > 0;
  if (lure) { w[2] *= 1.6; w[3] *= 1.8; prof.inventory.lure--; }
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  const ids = ['bass', 'catfish', 'salmon', 'tuna'];
  let caught = ids[0];
  for (let i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) { caught = ids[i]; break; } }
  prof.inventory[caught] = (prof.inventory[caught] || 0) + 1;
  prof.stats.fish++;
  ped.fishing = null;
  world.emit(f.x, f.y, { e: 'catch', x: f.x, y: f.y, fish: caught });
  world.notify(p, `Caught a ${ITEMS[caught].name}!${lure ? ' (lure used)' : ''} Sell at the Dockside Fish Market.`, 'good');
  p.meDirty = true;
  store.touch();
}

export function cancelFishing(world, p, msg) {
  if (!p.ped || !p.ped.fishing) return;
  p.ped.fishing = null;
  if (msg) world.notify(p, msg, 'info');
  p.meDirty = true;
}
