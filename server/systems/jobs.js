// Professions & extraction loops: courier contracts, Refuge Island harvests (GDD §5),
// contraband drops for the black market / evidence locker, and the deep-sim fishing loop.
import { K, T } from '../../shared/constants.js';
import { ITEMS, FISH_TABLE, OFFSHORE_FISH } from '../../shared/items.js';
import { POACH_PAY, NET_TIME_S, DEEPSEA_CATCH, DEEPSEA_PAY } from '../../shared/rules.js';
import * as law from './law.js';
import { RIVER_X0, RIVER_X1, CAR_SPAWN_BLOCK } from '../../shared/map.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';

const rng = mulberry32(5150);
const BAIT_ORDER = ['squid', 'glowlure', 'shrimp', 'lure', 'worms'];

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
    if (p.job && p.job.type === 'poach') stepPoach(world, p, 0.05);
    const ped = p.ped;
    if (ped && ped.fishing && ped.vehId) { const bv = world.get(ped.vehId); if (!bv || Math.hypot(bv.vx, bv.vy) > 60) cancelFishing(world, p, 'You pulled your line in.'); }
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
  const truck = workTruck(world, p, pad, 'flatbed');
  world.notify(p, (opts.dest ? `Job accepted: pick up the ${name} at ${poi.label} - it's marked on your map.` : 'Contract accepted. Your crate is on the loading pad.') + (truck ? ' A company flatbed is parked by the crate - it\'s yours to use.' : ''), 'good');
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
  // a co-op flatbed waits nearby to help haul (taking it isn't theft)
  workTruck(world, p, pad, 'flatbed', true);
  p.job = { type: 'farm', crates: ids, dest: grocery.id, tx: grocery.x, ty: grocery.y, expires: world.time + 1200, text: `Haul 4 Produce Boxes to ${grocery.label} in the city`, pickupText: `Load the 4 Produce Boxes at ${poi.label}` };
  world.notify(p, 'Harvest contract! 4 Produce Boxes are in the field by the farm road. A co-op flatbed is parked next to them - take it, it is not stealing.', 'good');
  return null;
}

// A company truck for a cargo job: parked on open ground near the pickup, free to take (not
// theft), and tidied away like any parked car once nobody is around. Skipped when a free truck
// with open cargo slots is already waiting there.
export function workTruck(world, p, pad, model = 'flatbed', always = false) {
  if (!always) {
    for (const v of world.query(pad.x, pad.y, 320, K.VEH)) {
      if (v.wreckAt || v.seats.some((x) => x) || !v.def.slots.length || v.cargo.every((c) => c)) continue;
      if (!v.npcOwned || v.issuedTo === p.pid) return null; // a free one is already here
    }
  }
  const def = VEHICLES[model];
  for (let r = 70; r <= 260; r += 30) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = pad.x + Math.cos(a) * r, y = pad.y + Math.sin(a) * r;
    const heading = Math.abs(Math.cos(a)) > 0.7 ? Math.PI / 2 : 0;
    const ok = [-0.5, 0, 0.5].every((f) => [-0.5, 0.5].every((g) => {
      const px = x + Math.cos(heading) * def.L * f - Math.sin(heading) * def.W * g, py = y + Math.sin(heading) * def.L * f + Math.cos(heading) * def.W * g;
      return !CAR_SPAWN_BLOCK[world.map.tileAtPx(px, py)];
    }));
    if (!ok || world.query(x, y, def.L, K.VEH).length) continue;
    const v = world.spawnVehicle(model, x, y, heading, { npcOwned: false });
    v.issuedTo = p.pid; v.despawnable = true; v.workTruck = true;
    return v;
  }
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
  if (crate.job && crate.job.type === 'poach' && near('smuggler', 80)) return { label: `Sell the haul to the Den (+$${crate.value})`, run: () => deliverPoach(world, p, crate) };
  if (crate.label === 'Produce Box' && near('grocery', 80)) return { label: `Sell produce to FreshHub (+$${crate.value})`, run: () => deliverLegit(world, p, crate, 'farm') };
  if (crate.contraband) {
    if (near('fence') || near('smuggler', 80)) return { label: `Sell to the Black Market (+$${crate.value})`, run: () => fence(world, p, crate, 1) };
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
  const offshore = f.kind === 'offshore';
  const w = [...FISH_TABLE[f.kind]];
  if (world.clock.isNight && !offshore) w[1] = 35; // catfish spike at night
  // bait: your chosen one if you have it, otherwise the best you're carrying
  const ids = offshore ? OFFSHORE_FISH : ['bass', 'catfish', 'salmon', 'tuna'];
  const night = world.clock.isNight;
  const usable = (id) => (prof.inventory[id] || 0) > 0 && ITEMS[id] && ITEMS[id].bait && (!ITEMS[id].night || night);
  const bait = usable(prof.bait) ? prof.bait : BAIT_ORDER.find(usable) || null;
  if (bait) { for (const [fish, m] of Object.entries(ITEMS[bait].bait)) if (ids.includes(fish)) w[ids.indexOf(fish)] *= m; prof.inventory[bait]--; }
  if (offshore && bait === 'squid') w[2] *= 2; // marlin love squid
  const total = w.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  let caught = ids[0];
  for (let i = 0; i < ids.length; i++) { r -= w[i]; if (r <= 0) { caught = ids[i]; break; } }
  prof.inventory[caught] = (prof.inventory[caught] || 0) + 1;
  prof.stats.fish++;
  ped.fishing = null;
  world.emit(f.x, f.y, { e: 'catch', x: f.x, y: f.y, fish: caught });
  world.notify(p, `Caught a ${ITEMS[caught].name}!${bait ? ` (${ITEMS[bait].name} used)` : ''} Sell it at a bait shop or the fish market.`, 'good');
  if (offshore && p.job && p.job.type === 'deepsea') {
    p.job.got++;
    if (p.job.got >= p.job.need) { prof.bank += p.job.pay; prof.samaritan += 2; world.notify(p, `Charter complete! +$${p.job.pay} to your bank. Sell the catch at the charter dock or the fish market.`, 'good'); p.job = null; }
    else p.job.text = `Deep-sea charter: ${p.job.got}/${p.job.need} offshore fish`;
  }
  p.meDirty = true;
  store.touch();
}

// ---- out on the water ------------------------------------------------------------------------
const TILE_PX = 32;
const isWaterT = (t) => t === T.WATER || t === T.DEEP;
// Far enough out at sea for the big ones: no land within ~12 tiles.
export function offshoreAt(world, x, y) {
  const tx = Math.floor(x / TILE_PX), ty = Math.floor(y / TILE_PX);
  for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) if (!isWaterT(world.map.tileAt(tx + dx, ty + dy))) return false;
  return true;
}
// Fishing over the side of a boat that's sitting still out at sea.
export function boatFishingSpot(world, ped) {
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (!v || v.def.kind !== 'boat' || Math.hypot(v.vx, v.vy) > 40) return null;
  if (!offshoreAt(world, v.x, v.y)) return null;
  const a = v.a + Math.PI / 2;
  return { x: v.x + Math.cos(a) * (v.def.W / 2 + 20), y: v.y + Math.sin(a) * (v.def.W / 2 + 20), kind: 'offshore', a };
}
function nearestOffshore(world, x, y, minD, maxD) {
  const list = (world.map.offshore || []).filter((q) => { const d = Math.hypot(q.x - x, q.y - y); return d >= minD && d <= maxD; });
  return list.length ? list[Math.floor(rng() * list.length)] : (world.map.offshore || [])[0];
}

export function startDeepSea(world, p, poi) {
  if (p.job) return 'You already have a job - cancel it first.';
  const spot = nearestOffshore(world, poi.x, poi.y, 900, 3000);
  if (!spot) return 'No charters today.';
  p.job = { type: 'deepsea', need: DEEPSEA_CATCH, got: 0, pay: DEEPSEA_PAY, tx: spot.x, ty: spot.y, expires: world.time + 1500, text: `Deep-sea charter: 0/${DEEPSEA_CATCH} offshore fish` };
  world.notify(p, `Charter booked: take a boat out to the deep water (marked) and land ${DEEPSEA_CATCH} offshore fish - grouper, swordfish or marlin. Squid brings in the marlin.`, 'good');
  p.meDirty = true;
  return null;
}

export function startPoach(world, p, poi, species) {
  if (p.job) return 'You already have a job - cancel it first.';
  if (!POACH_PAY[species]) return 'No such job.';
  const spot = nearestOffshore(world, poi.x, poi.y, 1200, 3600);
  if (!spot) return 'Nothing out there today.';
  const what = species === 'turtle' ? 'sea turtles' : 'dolphins';
  p.job = { type: 'poach', species, stage: 'go', net: 0, pay: POACH_PAY[species], dest: poi.id, tx: spot.x, ty: spot.y, expires: world.time + 1200, failOnDeath: true, text: `Find the ${what} (marked) - hold a cargo boat still over them to net the haul` };
  world.notify(p, `Job on: a pod of ${what} is out past the reef. Needs a boat with cargo space (dinghy or speedboat). Police boats patrol the bay - don't get seen.`, 'warn');
  p.meDirty = true;
  return null;
}

function stepPoach(world, p, dt) {
  const j = p.job, ped = p.ped;
  if (!ped || ped.dead || j.stage !== 'go') return;
  const v = ped.vehId ? world.get(ped.vehId) : null;
  if (!v || v.def.kind !== 'boat' || ped.seat !== 0 || Math.hypot(v.x - j.tx, v.y - j.ty) > 170 || Math.hypot(v.vx, v.vy) > 70) { if (j.net) { j.net = 0; p.meDirty = true; } return; }
  const slot = v.cargo.findIndex((c, i) => !c && i < v.def.slots.length);
  if (slot < 0) { if (world.time - (j.warnAt || -99) > 8) { j.warnAt = world.time; world.notify(p, 'No room on this boat for the haul - you need a dinghy or speedboat with free cargo space.', 'warn'); } return; }
  j.net += dt;
  if (j.net < NET_TIME_S) return;
  const label = j.species === 'turtle' ? 'Poached Sea Turtles' : 'Dolphin Catch';
  const c = world.spawnCrate(3, v.x, v.y, { label, contraband: true, value: j.pay, owner: p.pid, job: { type: 'poach', pid: p.pid, dest: j.dest } });
  c.state = 'loaded'; c.parent = v.id; c.slot = slot; v.cargo[slot] = c.id;
  j.stage = 'deliver'; j.crates = [c.id];
  const den = world.map.pois[j.dest];
  j.tx = den.x; j.ty = den.y;
  j.text = `Get the ${label.toLowerCase()} to the Smuggler's Den on Smuggler's Rock`;
  law.crime(world, ped, 'poaching', null, v.x, v.y);
  world.emit(v.x, v.y, { e: 'splash', x: v.x, y: v.y, n: 16 });
  world.notify(p, 'Haul netted and loaded. Now get it to the Den - unload it at the door.', 'good');
  p.meDirty = true;
}

export function deliverPoach(world, p, crate) {
  const prof = p.profile;
  prof.cash += crate.value;
  prof.criminalExp = (prof.criminalExp || 0) + 40;
  consume(world, p, crate);
  world.notify(p, `The Den pays out: +$${crate.value} cash. No questions asked.`, 'good');
  if (p.job && p.job.type === 'poach') { p.job = null; p.meDirty = true; }
  store.touch();
}

export function cancelFishing(world, p, msg) {
  if (!p.ped || !p.ped.fishing) return;
  p.ped.fishing = null;
  if (msg) world.notify(p, msg, 'info');
  p.meDirty = true;
}
