// Professions & extraction loops: courier contracts, Dry Creek harvests (GDD §5),
// contraband drops for the black market / evidence locker, and the deep-sea charter (the fishing itself: fishing.js).
import { K } from '../../shared/constants.js';
import { ITEMS } from '../../shared/items.js';
import { POACH_PAY, NET_TIME_S, DEEPSEA_CATCH, DEEPSEA_PAY, WORK_TRUCK, WORK_TRUCK_RETURN, RECALL } from '../../shared/rules.js';
import { FLY } from '../../shared/flight.js';
import * as cargo from './cargo.js';
import * as law from './law.js';
import { CAR_SPAWN_BLOCK } from '../../shared/map.js';
import * as fishing from './fishing.js';
import { VEHICLES, vehicleWord } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as npc from './npc.js';
import * as events from './events.js';
import * as trains from './trains.js';
import { pointGrid } from '../pointgrid.js';
import * as vehicles from './vehicles.js';

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
  // a job's truck whose driver left the game: the company collects it (tidied away like any parked car - workTruck)
  if (world.tick % 200 === 57) for (const v of world.entities.values()) if (v.workTruck && !v.despawnable && !world.players.has(v.issuedTo)) v.despawnable = true;
  // jobs: expiry
  for (const p of world.players.values()) {
    if (p.job && now > p.job.expires) failJob(world, p, 'Contract expired.');
    if (p.truckReturn) checkReturn(world, p);
    if (p.job && p.job.type === 'poach') stepPoach(world, p, 0.05);
  }
  if (world.recalls && world.recalls.size) stepRecalls(world);   // (the jobs' vehicles going back: recall)
  fishing.tick(world);   // (a line out: a boat driven off, a cast left - fishing.js)
}

export function spawnDrop(world, forceTier = 0) {
  const sites = world.map.dropSites;
  const site = sites[Math.floor(rng() * sites.length)];
  const tier = forceTier || (rng() < 0.25 ? 4 : 3);
  const c = world.spawnCrate(tier, site.x + (rng() - 0.5) * 40, site.y + (rng() - 0.5) * 40, { contraband: true });
  c.expires = world.time + 900;
  const name = tier === 4 ? 'Legendary Carbon-Gold Case' : 'Secure Iron Vault';
  world.dropRumor = { x: site.x, y: site.y, until: world.time + 120, tier };
  events.add(world, { kind: 'drop', x: site.x, y: site.y, until: world.time + 120, text: `Rumor: a ${name} near ${site.name}` });
  events.tellNear(world, site.x, site.y, `Rumor: a ${name} was spotted near ${site.name}. Fence it, or turn it in.`, 'warn');
  return c;
}

function pickDestination(world, from, minDist) {
  const dests = world.map.pois.filter((q) => (q.kind === 'delivery' || q.kind === 'convenience' || q.kind === 'gasstation' || q.kind === 'airport') && Math.hypot(q.x - from.x, q.y - from.y) > minDist);
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
  const truck = workTruck(world, p, pad, 'flatbed', poi);
  world.notify(p, (opts.dest ? `Job accepted: pick up the ${name} at ${poi.label} - it's marked on your map.` : 'Contract accepted. Your crate is on the loading pad.') + (truck ? ' A company flatbed is parked by the crate (the green ring) - it\'s yours to use.' : ''), 'good');
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
  p.job = { type: 'farm', crates: ids, dest: grocery.id, tx: grocery.x, ty: grocery.y, expires: world.time + 1200, text: `Haul 4 Produce Boxes to ${grocery.label} in the city`, pickupText: `Load the 4 Produce Boxes at ${poi.label}` };
  // a co-op flatbed waits nearby to help haul (taking it isn't theft)
  workTruck(world, p, pad, 'flatbed', poi);
  world.notify(p, 'Harvest contract! 4 Produce Boxes are in the field by the farm road. A co-op flatbed is parked next to them - take it, it is not stealing.', 'good');
  return null;
}

// A company truck for a cargo job (the owner, 2026-10-11: "Delivery jobs that are supposed to give you a flatbed to use
// don't always seem to spawn a flatbed for you"): every job that promises one gets one. A free truck of that model
// already waiting by the pickup is issued to you; otherwise one is parked on open ground near the pickup, searching
// further out (WORK_TRUCK.searchR) until there's room. Taking it isn't theft; the job keeps it for you (it isn't
// tidied away - accepted from the phone across town, it's still there when you arrive), it's marked for you (a ring,
// an arrow at the screen's edge and on the minimap: phone.jobTarget's veh) until you're in it, a garage won't keep it
// (homes.js storeVehicle), and brought back to where it was issued once the job's done it pays WORK_TRUCK_RETURN
// (truckInteraction / returnTruck). poi: the place it belongs to (named when you bring it back).
export function workTruck(world, p, pad, model = 'flatbed', poi = null) {
  const def = VEHICLES[model];
  let v = null;
  for (const q of world.query(pad.x, pad.y, 320, K.VEH)) {   // a free one already here: yours now
    if (q.model !== model || q.wreckAt || q.sinkAt || q.seats.some((x) => x) || q.cargo.some((c) => c) || q.owner || q.rentedBy || q.forSale || q.onEvent || q.towedBy) continue;
    if (q.issuedTo && q.issuedTo !== p.pid) continue;   // (someone else's job truck: theirs)
    if ((q.lz || 0) > 0.3) continue;
    v = q; break;
  }
  for (let r = 70; !v && r <= WORK_TRUCK.searchR; r += 30) {
    const n = Math.max(12, Math.round(r / 20));
    for (let k = 0; k < n && !v; k++) {
      const a = (k / n) * Math.PI * 2;
      const x = pad.x + Math.cos(a) * r, y = pad.y + Math.sin(a) * r;
      const heading = Math.abs(Math.cos(a)) > 0.7 ? Math.PI / 2 : 0;
      const ok = [-0.5, 0, 0.5].every((f) => [-0.5, 0.5].every((g) => {
        const px = x + Math.cos(heading) * def.L * f - Math.sin(heading) * def.W * g, py = y + Math.sin(heading) * def.L * f + Math.cos(heading) * def.W * g;
        return !CAR_SPAWN_BLOCK[world.map.tileAtPx(px, py)];
      }));
      if (!ok || world.query(x, y, def.L, K.VEH).length) continue;
      v = world.spawnVehicle(model, x, y, heading, { npcOwned: false });
    }
  }
  if (!v) return null;
  v.npcOwned = false; v.parked = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;   // (kept while the job's on: releaseTruck lets it go)
  v.recall = null;   // (one on its way back, issued again for this job: kept)
  v.returnTo = { x: Math.round(v.x), y: Math.round(v.y), label: poi ? poi.label : 'the yard' };
  if (world.parked) for (const [i, id] of world.parked) if (id === v.id) world.parked.delete(i);   // (a parked one taken over: not the spawner's any more)
  if (p.job) p.job.truck = v.id;
  p.meDirty = true;
  return v;
}

// The job's over: done (the return bonus is on offer for a while: checkReturn), or not (the company takes it back: recall).
function releaseTruck(world, p, done) {
  const v = p.job && p.job.truck ? world.get(p.job.truck) : null;
  if (!v || v.removed) return;
  if (v.wreckAt) { v.despawnable = true; return; }   // (a wreck: cleared away as wrecks are)
  if (done && v.returnTo) {
    p.truckReturn = { id: v.id, until: world.time + WORK_TRUCK.returnS };
    world.notify(p, `Bring the ${v.def.name} back to ${v.returnTo.label} for a $${WORK_TRUCK_RETURN} bonus - it's marked on your map.`, 'info');
  } else recall(world, v, p);
}
function checkReturn(world, p) {
  const r = p.truckReturn, v = world.get(r.id);
  if (v && !v.removed && !v.wreckAt && world.time < r.until && !p.job) return;
  if (v && !v.removed && !(p.job && p.job.truck === v.id)) { if (v.wreckAt) v.despawnable = true; else recall(world, v, p); }   // (taken on again for a new job: kept)
  p.truckReturn = null; p.meDirty = true;
}

// ---- a job's vehicle goes back -------------------------------------------------------------------------------------------
// (the owner, 2026-10-23: "Canceling a job should make you have to give up the vehicle like a helicopter so that you can't
// just take a job to steal a helicopter then cancel it and have a helicopter") What a job issued - the flatbeds, the
// cab, the ambulance, the fire engine, the bus, the tow truck, the tractor, the rescue and charter helicopters, the crop
// duster, the coast guard's boat - stays the company's: a job that ends undone (cancelled, quit, expired, lost) or a
// return window run out recalls it (shared/rules.js RECALL). Nobody aboard: it's collected a few seconds later. You at
// the wheel: on the ground you're set down beside it a moment later; a boat waits till it's by a shore or a pier; an
// aircraft till it's down on the ground - never in mid-air. Taken on again for a new job before then (workTruck): kept.
export function recall(world, v, p = null) {
  if (!v || v.removed || v.recall) return;
  v.recall = { pid: p ? p.pid : v.issuedTo || null, at: world.time, empty: null, said: world.time };
  v.despawnable = false;   // (the recall takes it, not the street's tidy-up)
  (world.recalls ||= new Set()).add(v.id);
  if (p && p.ped && p.ped.vehId === v.id) world.notify(p, recallNote(world, v), 'warn');
}
export const recalled = (v) => !!(v && v.recall);
const inAirNow = (v) => v.def.kind === 'air' && (v.alt || 0) > FLY.AIRBORNE;
// where it is that it can't be taken back yet: null when it can (the people aboard set down beside it)
function waitWhy(world, v, ped) {
  if (v.onDeck || v.ferry) return 'deck';
  if (inAirNow(v)) return 'air';
  if (v.def.kind === 'air' && Math.hypot(v.vx, v.vy) > RECALL.slowPx) return 'air';   // (still rolling down the runway)
  if (v.def.kind === 'boat' && (Math.hypot(v.vx, v.vy) > RECALL.slowPx || !vehicles.findExitSpot(world, v, ped, 150))) return 'boat';
  return null;
}
function recallNote(world, v, why = waitWhy(world, v, null)) {
  const w = vehicleWord(v.def);
  if (why === 'air') return `The job's over - the company wants its ${w} back. Set it down on the ground and it's collected.`;
  if (why === 'boat') return `The job's over - the company wants its ${w} back. Bring it in to a shore or a pier and it's collected.`;
  return `The job's over - the company takes its ${w} back. Pull over: you're set down beside it.`;
}
function stepRecalls(world) {
  const now = world.time;
  for (const id of world.recalls) {
    const v = world.get(id), R = v && v.recall;
    if (!v || v.removed || !R) { world.recalls.delete(id); continue; }
    if (v.wreckAt) { v.recall = null; v.despawnable = true; world.recalls.delete(id); continue; }   // (wrecked on the way: cleared as wrecks are)
    const aboard = v.seats.map((s) => (s ? world.get(s) : null)).filter((q) => q && q.player && !q.removed);
    if (aboard.length) {
      R.empty = null;
      const why = waitWhy(world, v, aboard[0]);
      if (why || now - R.at < RECALL.outS) {
        if (why && now - R.said >= RECALL.remindS) { R.said = now; for (const q of aboard) if (q.seat === 0) world.notify(q.player, recallNote(world, v, why), 'warn'); }
        continue;
      }
      v.vx = 0; v.vy = 0; v.av = 0; v.input = { throttle: 0, steer: 0, hb: false };   // (stopped where it is: nobody's thrown out at speed)
      for (const q of aboard) {
        vehicles.exitVehicle(world, q);
        if (q.vehId === v.id) vehicles.ejectPed(world, q, true);   // (whatever kept them in: out)
        world.notify(q.player, `The company's taken the ${vehicleWord(v.def)} back.`, 'info');
      }
      R.empty = now;
      continue;
    }
    if (R.empty === null) { R.empty = now; continue; }
    if (now - R.empty < RECALL.goneS) continue;
    collect(world, v);
    world.recalls.delete(id);
  }
}
// gone: its cargo on the ground where it stood, anyone on its hook let go, whoever was sitting in it (the job's NPCs) with it
function collect(world, v) {
  cargo.spillCargo(world, v);
  for (const e of world.query(v.x, v.y, 400, K.VEH)) if (e.towedBy === v.id) { e.towedBy = 0; e.despawnable = true; }
  for (const s of v.seats) { const q = s ? world.get(s) : null; if (q && q.npc) npc.despawnNpc(world, q); else if (q) vehicles.ejectPed(world, q, true); }
  world.remove(v);
}
// the truck you're returning: { v, x, y, label } (the job tracker: phone.jobTarget)
export function returnInfo(world, p) {
  const r = p.truckReturn, v = r && world.get(r.id);
  return v && !v.removed && v.returnTo ? { v, ...v.returnTo } : null;
}
// Driving it, back where it was issued: hand it in
export function truckInteraction(world, p) {
  const ped = p.ped, ri = returnInfo(world, p);
  if (!ri || ped.vehId !== ri.v.id || ped.seat !== 0) return null;
  if (Math.hypot(ri.v.x - ri.x, ri.v.y - ri.y) > WORK_TRUCK.returnR) return null;
  return { label: `Return the ${ri.v.def.name} to the company (+$${WORK_TRUCK_RETURN} bonus)`, run: () => returnTruck(world, p) };
}
export function returnTruck(world, p) {
  const ri = returnInfo(world, p);
  if (!ri) return 'Nothing to return.';
  const v = ri.v;
  if (v.cargo.some((c) => c)) { world.notify(p, 'Unload the cargo first.', 'warn'); return 'Unload the cargo first.'; }
  if (v.seats.some((s, i) => i > 0 && s)) { world.notify(p, 'Passengers have to get out first.', 'warn'); return 'Passengers have to get out first.'; }
  if (p.ped && p.ped.vehId === v.id) vehicles.exitVehicle(world, p.ped);
  p.profile.cash += WORK_TRUCK_RETURN;
  p.truckReturn = null;
  world.remove(v);
  world.emit(ri.x, ri.y, { e: 'cash', x: ri.x, y: ri.y });
  world.notify(p, `The ${v.def.name} is returned. Bonus +$${WORK_TRUCK_RETURN}.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

export function failJob(world, p, msg) {
  if (!p.job) return;
  releaseTruck(world, p, false);
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
  if (crate.hand && near('farm', 90)) return { label: `Sell the crate to the farm stand (+$${crate.value})`, run: () => deliverLegit(world, p, crate, 'hand') };   // (picked by hand in the rows: farming.js)
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
      releaseTruck(world, owner, true);
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
  trains.onFenced(world, p, crate);
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

// ---- out on the water ------------------------------------------------------------------------
function nearestOffshore(world, x, y, minD, maxD) {
  const list = pointGrid(world.map.offshore || []).within(x, y, minD, maxD);   // (the points near: server/pointgrid.js)
  return list.length ? list[Math.floor(rng() * list.length)] : (world.map.offshore || [])[0];
}

export function startDeepSea(world, p, poi) {
  if (p.job) return 'You already have a job - cancel it first.';
  const spot = nearestOffshore(world, poi.x, poi.y, 900, 3000);
  if (!spot) return 'No charters today.';
  p.job = { type: 'deepsea', need: DEEPSEA_CATCH, got: 0, pay: DEEPSEA_PAY, tx: spot.x, ty: spot.y, expires: world.time + 1500, text: `Deep-sea charter: 0/${DEEPSEA_CATCH} offshore fish` };
  world.notify(p, `Charter booked: take a boat out to the deep water (marked) and land ${DEEPSEA_CATCH} offshore fish - tuna, mahi-mahi, marlin, swordfish after dark. A Big-Game Rod holds the big ones; squid and chum bring them in.`, 'good');
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

// A job done that pays as it goes (the farm work: farming.js): over, its truck's return bonus on offer (releaseTruck)
export function jobDone(world, p) {
  if (!p.job) return;
  releaseTruck(world, p, true);
  p.job = null;
  p.meDirty = true;
}
