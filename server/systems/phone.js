// The phone: a job board you can browse from anywhere (deliveries priced by distance, farm
// harvests, and for on-duty officers, patrol calls), taking / cancelling a job, and the live
// waypoint for the job you're on. Place-finding (nearest hospital, bank, ...) is done on the
// client from the shared map; only jobs need the server.
import { K } from '../../shared/constants.js';
import { PED_BLOCK, DISTRICTS } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { JOB_TIERS, PATROL_PAY, PATROL_SEARCH_S } from '../../shared/rules.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';
import * as events from './events.js';
import { spawnNpc } from './npc.js';
import * as law from './law.js';
import * as police from './police.js';
import * as bounties from './bounties.js';
import * as transit from './transit.js';
import * as ferries from './ferries.js';

const rng = mulberry32(7331);
const BOARD_SIZE = 7;          // civilian deliveries kept on the board
const DROP_KINDS = new Set(['delivery', 'convenience', 'gasstation', 'airport']); // storefronts that take deliveries
const PATROLS = 3;             // police patrol calls kept on the board
const REFRESH_S = 75;          // stale offers rotate out

function tierFor(d) {
  for (let i = JOB_TIERS.length - 1; i >= 0; i--) if (d >= JOB_TIERS[i].minDist) return i;
  return 0;
}

function districtCentre(map, di) {
  map._dcentre ??= new Map();
  if (map._dcentre.has(di)) return map._dcentre.get(di);
  const c = districtCentre0(map, di);
  map._dcentre.set(di, c);
  return c;
}
function districtCentre0(map, di) {
  let sx = 0, sy = 0, n = 0;
  for (let ty = 0; ty < map.h; ty += 3) for (let tx = 0; tx < map.w; tx += 3) if (map.dist[ty * map.w + tx] === di && !PED_BLOCK[map.tileAt(tx, ty)]) { sx += tx; sy += ty; n++; }
  return n ? { x: (sx / n + 0.5) * 32, y: (sy / n + 0.5) * 32 } : null;
}

// Where a delivery's crate waits: the storefront's cargo pad (same spot jobs.startCourier uses).
const pickupAt = (poi) => poi.cargoPad || { x: poi.x + 18, y: poi.y + 14 };

function newDelivery(world) {
  const shops = world.map.pois.filter((q) => DROP_KINDS.has(q.kind) || q.kind === 'warehouse');
  const from = shops[Math.floor(rng() * shops.length)];
  // aim for an even spread of $, $$ and $$$ jobs
  const want = Math.floor(rng() * JOB_TIERS.length);
  const t = JOB_TIERS[want];
  const fp = pickupAt(from);
  const dests = world.map.pois.filter((q) => DROP_KINDS.has(q.kind) && q !== from && (() => { const d = Math.hypot(q.x - fp.x, q.y - fp.y); return d >= t.minDist && d < t.maxDist; })());
  const to = dests.length ? dests[Math.floor(rng() * dests.length)] : null;
  if (!to) return null;
  const d = Math.hypot(to.x - fp.x, to.y - fp.y);
  const tier = tierFor(d);
  const pay = Math.round((JOB_TIERS[tier].base + d * JOB_TIERS[tier].perPx) / 10) * 10;
  return { id: ++world.jobSeq, kind: 'delivery', tier, pay, from: from.id, to: to.id, limit: JOB_TIERS[tier].limit, until: world.time + REFRESH_S * (2 + rng()) };
}

function newPatrol(world) {
  const ds = DISTRICTS.map((d, i) => i).filter((i) => !['water', 'wild', 'rural', 'rocky', 'desert', 'airport'].includes(DISTRICTS[i].style) && !DISTRICTS[i].turf && DISTRICTS[i].isl !== 'Pelican Key' && districtCentre(world.map, i));
  const di = ds[Math.floor(rng() * ds.length)];
  const c = districtCentre(world.map, di);
  if (!c) return null;
  const pay = PATROL_PAY[0] + Math.round(rng() * (PATROL_PAY[1] - PATROL_PAY[0]) / 10) * 10;
  return { id: ++world.jobSeq, kind: 'patrol', district: di, x: c.x, y: c.y, pay, until: world.time + REFRESH_S * (2 + rng()) };
}

export function update(world) {
  if (world.tick % 20 !== 11) return;
  world.jobSeq ??= 0;
  world.jobBoard ??= [];
  const now = world.time;
  world.jobBoard = world.jobBoard.filter((j) => j.until > now);
  let civ = world.jobBoard.filter((j) => j.kind === 'delivery').length;
  for (let k = 0; civ < BOARD_SIZE && k < 20; k++) { const j = newDelivery(world); if (j) { world.jobBoard.push(j); civ++; } }
  let pat = world.jobBoard.filter((j) => j.kind === 'patrol').length;
  for (let k = 0; pat < PATROLS && k < 10; k++) { const j = newPatrol(world); if (j) { world.jobBoard.push(j); pat++; } }
  for (const p of world.players.values()) if (p.job && p.job.type === 'patrol') stepPatrol(world, p);
  // phones put away: in a vehicle, down, gone, or out for five minutes (a page that never said it closed)
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (ped && ped.phoneOut && (!p.conn || ped.dead || ped.vehId || ped.hidden || now - ped.phoneOut > 300)) phoneOut(world, p, false);
  }
}

// ---- patrols ------------------------------------------------------------------------------
function stepPatrol(world, p) {
  const j = p.job, ped = p.ped, now = world.time;
  if (!ped || ped.dead) return;
  if (!p.badge) { jobs.failJob(world, p, 'Patrol cancelled - you are off duty.'); return; }
  if (j.stage === 'go' && Math.hypot(ped.x - j.ax, ped.y - j.ay) < 700) {
    j.stage = 'search'; j.crimeAt = now + PATROL_SEARCH_S[0] + rng() * (PATROL_SEARCH_S[1] - PATROL_SEARCH_S[0]);
    j.text = `Patrolling ${DISTRICTS[j.district].name} - keep your eyes open`;
    p.meDirty = true;
  } else if (j.stage === 'search' && now >= j.crimeAt) {
    if (!stageCrime(world, p)) j.crimeAt = now + 3;
  } else if (j.stage === 'crime') {
    const thief = world.get(j.thief);
    if (!thief) { jobs.failJob(world, p, 'The suspect got away. Patrol over.'); return; }
    j.tx = thief.x; j.ty = thief.y;
    if (thief.npc && thief.npc.state === 'wander' && !thief.npc.hasPurse && !thief.dead && Math.hypot(thief.x - ped.x, thief.y - ped.y) > 1400) { jobs.failJob(world, p, 'The suspect got away. Patrol over.'); return; }
  }
}

function stageCrime(world, p) {
  const ped = p.ped;
  for (let k = 0; k < 16; k++) {
    const a = rng() * Math.PI * 2, d = 300 + rng() * 200;
    const vx = ped.x + Math.cos(a) * d, vy = ped.y + Math.sin(a) * d;
    const mx = vx + Math.cos(a + 1.2) * 220, my = vy + Math.sin(a + 1.2) * 220;
    if (PED_BLOCK[world.map.tileAtPx(vx, vy)] || PED_BLOCK[world.map.tileAtPx(mx, my)]) continue;
    const victim = spawnNpc(world, 'socialite', vx, vy, 'civ');
    victim.npc.keep = true;
    const thief = spawnNpc(world, 'mugger', mx, my, 'mugger');
    thief.npc.state = 'mug'; thief.npc.target = victim.id; thief.npc.until = world.time + 60; thief.npc.keep = true;
    thief.npc.patrolFor = p.pid;
    const j = p.job;
    j.stage = 'crime'; j.thief = thief.id; j.tx = thief.x; j.ty = thief.y;
    j.text = 'Purse snatcher! Knock them down and cuff them';
    world.notify(p, 'Dispatch: purse snatching in progress right near you!', 'warn');
    p.meDirty = true;
    return true;
  }
  return false;
}

// called by law.arrest / body booking: the patrol's suspect was stopped
export function onCriminalStopped(world, copPed, target) {
  const pid = target && target.npc ? target.npc.patrolFor : null;
  if (!pid) return;
  const p = world.players.get(pid);
  if (!p || !p.job || p.job.type !== 'patrol' || p.job.thief !== target.id) return;
  p.profile.bank += p.job.pay;
  p.profile.samaritan += 5;
  world.notify(p, `Patrol complete! Suspect stopped. +$${p.job.pay} to your bank.`, 'good');
  p.job = null; p.meDirty = true;
  store.touch();
  void copPed;
}

// ---- board / take / cancel -----------------------------------------------------------------
function describe(world, j) {
  const pois = world.map.pois;
  if (j.kind === 'delivery') {
    const a = pois[j.from], b = pois[j.to];
    const pa = pickupAt(a);
    return { id: j.id, kind: j.kind, tier: j.tier, pay: j.pay, title: `${a.label} → ${b.label}`, x: pa.x, y: pa.y, tx: b.x, ty: b.y, limit: j.limit };
  }
  if (j.kind === 'patrol') return { id: j.id, kind: j.kind, pay: j.pay, title: `Patrol ${DISTRICTS[j.district].name}`, x: j.x, y: j.y };
  return null;
}

// The farm that takes harvest contracts nearest to you (Dry Creek's co-op, the Cedar Farms stand).
const nearestFarm = (world, p) => world.map.pois.filter((q) => q.kind === 'farm').sort((a, b) => Math.hypot(a.x - p.ped.x, a.y - p.ped.y) - Math.hypot(b.x - p.ped.x, b.y - p.ped.y))[0];

export function boardFor(world, p) {
  const farm = p.ped ? nearestFarm(world, p) : world.map.pois.find((q) => q.kind === 'farm');
  const list = (world.jobBoard || []).filter((j) => j.kind === 'delivery' || (j.kind === 'patrol' && p.badge)).map((j) => describe(world, j));
  if (farm) list.push({ id: 'farm', kind: 'farm', pay: 4 * 140 + 200, title: 'Harvest contract at ' + farm.label, x: farm.x, y: farm.y });
  return { t: 'board', jobs: list, job: p.job ? { text: p.job.text, type: p.job.type } : null, saw: law.sawList(world, p) };
}

// Your phone in your hand while its menu is open, for everyone to see (the descriptor's ph: net.js; drawn held,
// head down, in place of the weapon). Put away on closing it, getting in a vehicle, going down or after five minutes.
export function phoneOut(world, p, on) {
  const ped = p.ped;
  if (!ped) return;
  if (on && (ped.dead || ped.vehId || ped.hidden)) on = false;
  const was = !!ped.phoneOut;
  ped.phoneOut = on ? world.time : 0;
  if (was !== on) ped.appVer = (ped.appVer || 0) + 1;
}

export function handle(world, p, msg) {
  const a = String(msg.a || '');
  if (a === 'board') return boardFor(world, p);
  if (a === 'feed') return events.feedFor(world);
  if (a === 'out') { phoneOut(world, p, !!msg.on); return null; }   // the phone in your hand while its menu is open
  if (a === 'transit') return { ...transit.transitInfo(world, p), ferries: ferries.ferryInfo(world) };   // the Transit app and the lines on the map
  if (a === 'taxi') return transit.taxiPhone(world, p, msg);    // call a taxi / cancel it / where you want to go
  if (a === 'cancel') {
    if (!p.job) return { ...boardFor(world, p), err: 'You have no job.' };
    jobs.failJob(world, p, 'Job cancelled.');
    return boardFor(world, p);
  }
  if (a === 'take') {
    const err = take(world, p, msg.id);
    return { ...boardFor(world, p), err: err || null, ok: !err };
  }
  if (a === 'report') {   // calling in a crime you saw (law.js reportSaw)
    const err = law.reportSaw(world, p, msg.id, police);
    return { ...boardFor(world, p), err: err || null };
  }
  // the Bounties app (bounties.js): the contracts out, taking one, putting one on someone who keeps killing you
  if (a === 'bounties') return bounties.boardFor(world, p);
  if (a === 'btake') { const err = bounties.take(world, p, msg.id); return { ...bounties.boardFor(world, p), err: err || null }; }
  if (a === 'bplace') { const err = bounties.place(world, p, String(msg.pid || ''), Number(msg.amt)); return { ...bounties.boardFor(world, p), err: err || null, ok: !err }; }
  return null;
}

function take(world, p, id) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  if (id === 'farm') return jobs.startFarm(world, p, nearestFarm(world, p));
  const j = (world.jobBoard || []).find((q) => q.id === Number(id));
  if (!j) return 'That job was taken.';
  if (j.kind === 'patrol') {
    if (!p.badge) return 'Patrols are for on-duty officers.';
    p.job = { type: 'patrol', stage: 'go', district: j.district, ax: j.x, ay: j.y, tx: j.x, ty: j.y, pay: j.pay, expires: world.time + 900, text: `Patrol ${DISTRICTS[j.district].name} - reports of trouble` };
  } else {
    const from = world.map.pois[j.from], to = world.map.pois[j.to];
    jobs.startCourier(world, p, from, { dest: to, pay: j.pay, limit: j.limit, tier: j.tier, fromPhone: true });
  }
  world.jobBoard = world.jobBoard.filter((q) => q !== j);
  p.meDirty = true;
  return null;
}

// Live target for the job tracker / waypoint: pickup first, then the drop-off.
export function jobTarget(world, p) {
  const j = p.job;
  if (!j) return null;
  if ((j.type === 'courier' || j.type === 'farm') && j.crates && j.crates.length) {
    const waiting = j.crates.map((id) => world.get(id)).filter((c) => c && c.kind === K.CRATE && c.state === 'ground' && !c.touched);
    if (waiting.length === j.crates.length) {
      const c = waiting[0];
      return { text: j.pickupText || j.text, x: Math.round(c.x), y: Math.round(c.y), stage: 'pickup' };
    }
  }
  if (j.type === 'patrol' && j.stage === 'crime') { const t = world.get(j.thief); if (t) return { text: j.text, x: Math.round(t.x), y: Math.round(t.y), stage: 'crime' }; }
  return { text: j.text, x: Math.round(j.tx), y: Math.round(j.ty), stage: j.stage || 'go' };
}
