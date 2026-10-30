// The phone: a job board you can browse from anywhere (deliveries priced by distance, farm
// harvests, and for on-duty officers, patrol calls), taking / cancelling a job, and the live
// waypoint for the job you're on. Place-finding (nearest hospital, bank, ...) is done on the
// client from the shared map; only jobs need the server.
import { K } from '../../shared/constants.js';
import { PED_BLOCK, DISTRICTS } from '../../shared/map.js';
import { mulberry32 } from '../../shared/rng.js';
import { JOB_TIERS, PATROL_PAY, PATROL_SEARCH_S, WORK_TRUCK_RETURN, SAR, CHARTER, COAST, DUST } from '../../shared/rules.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';
import * as events from './events.js';
import { spawnNpc } from './npc.js';
import * as law from './law.js';
import * as police from './police.js';
import * as bounties from './bounties.js';
import * as transit from './transit.js';
import * as ferries from './ferries.js';
import * as dance from './dance.js';
import * as sar from './sar.js';
import * as charter from './charter.js';
import * as dusting from './dusting.js';
import * as coastguard from './coastguard.js';
import * as farming from './farming.js';
import * as firefighter from './firefighter.js';
import * as paramedic from './paramedic.js';
import { FARM } from '../../shared/rules.js';
import { FIRE, MEDIC } from '../../shared/rules.js';
import * as realestate from './realestate.js';
import * as taxijob from './taxijob.js';
import * as busjob from './busjob.js';
import * as towjob from './towjob.js';
import * as skills from './skills.js';
import * as workout from './workout.js';
import * as crews from './crews.js';
import { CAB, BUSJOB, TOWJOB, CRAZY, RIG, MAILJOB } from '../../shared/rules.js';
import * as crazytaxi from './crazytaxi.js';
import * as truckjob from './truckjob.js';
import * as mailjob from './mailjob.js';

const rng = mulberry32(7331);
const BOARD_SIZE = 7;          // civilian deliveries kept on the board
const DROP_KINDS = new Set(['delivery', 'convenience', 'gasstation', 'airport']); // storefronts that take deliveries
const PATROLS = 3;             // police patrol calls kept on the board
const REFRESH_S = 75;          // stale offers rotate out

function tierFor(d) {
  for (let i = JOB_TIERS.length - 1; i >= 0; i--) if (d >= JOB_TIERS[i].minDist) return i;
  return 0;
}

// every district's middle (its walkable tiles' mean, every third tile each way), all in one pass over the map the
// first time one is asked for (World v3's frame: one pass, not one per district - a 5 s tick at the start); each
// district's sums are added in the same tile order as a pass of its own, so the middles are the same to the bit
function districtCentre(map, di) {
  if (!map._dcentre) {
    const sx = new Float64Array(256), sy = new Float64Array(256), n = new Float64Array(256);
    for (let ty = map.y0; ty < map.y0 + map.h; ty += 3) { const r = map.row(ty); for (let tx = map.x0; tx < map.x0 + map.w; tx += 3) { const d = map.dist[r + map.col(tx)]; if (!PED_BLOCK[map.tileAt(tx, ty)]) { sx[d] += tx; sy[d] += ty; n[d]++; } } }
    map._dcentre = new Map();
    for (let d = 0; d < 256; d++) map._dcentre.set(d, n[d] ? { x: (sx[d] / n[d] + 0.5) * 32, y: (sy[d] / n[d] + 0.5) * 32 } : null);
  }
  return map._dcentre.get(di) ?? null;
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

// The job card's facts (UI-3: client/jobcard.js): what it pays as a range - [lo, hi] for each thing it's paid for (per),
// from the rules' own numbers, the speed bonus in the top - and the first step. A fare by the km takes the rules' usual
// trip lengths.
const r5 = (n) => Math.round(n / 5) * 5;
const card = (lo, hi, per, step) => ({ lo: r5(lo), hi: r5(Math.max(lo, hi)), per, step });
const fireLo = () => Math.min(...['car', 'wreck', 'person', 'grass', 'dumpster', 'kitchen'].map((k) => FIRE.pay[k]));
const fireHi = () => Math.max(...['car', 'wreck', 'person', 'grass', 'dumpster', 'kitchen'].map((k) => FIRE.pay[k])) * (1 + FIRE.pay.fast);

export function boardFor(world, p) {
  const farm = p.ped ? nearestFarm(world, p) : world.map.pois.find((q) => q.kind === 'farm');
  const list = (world.jobBoard || []).filter((j) => j.kind === 'delivery' || (j.kind === 'patrol' && p.badge)).map((j) => describe(world, j));
  if (farm) list.push({ id: 'farm', kind: 'farm', pay: 4 * 140 + 200, title: 'Harvest contract at ' + farm.label, x: farm.x, y: farm.y, ...card(4 * 140 + 200, 4 * 140 + 200, 'the contract', `Load 4 produce boxes at ${farm.label}`) });
  const base = sar.baseFor(world, p);   // search & rescue pilot: a shift of rescue calls from the nearest hospital (sar.js)
  if (base) list.push({ id: 'sar', kind: 'sar', fly: true, icon: '🚁', sub: 'rescue calls: the lost, the hurt, the stranded - a rescue helicopter is issued', pay: SAR.base + 2 * SAR.perKm, title: `Search & rescue pilot - a shift from ${base.name}`, x: base.x, y: base.y, ...card(SAR.base + SAR.perKm, (SAR.base + 4 * SAR.perKm) * (1 + SAR.fast), 'a rescue', `Take the rescue helicopter up from ${base.name}`) });
  const strip = p.ped ? dusting.stripFor(world, p.ped.x, p.ped.y) : null;   // crop dusting from the nearest farm strip (dusting.js)
  if (strip) list.push({ id: 'dusting', kind: 'dusting', fly: true, icon: '🌾', sub: 'fly the co-op\'s crop duster low over the fields and spray them - paid by the field, a bonus for the lot', pay: DUST.fields * DUST.pay + DUST.bonus, title: `Crop duster pilot - out of ${strip.name}`, x: strip.x, y: strip.y, ...card(DUST.fields * DUST.pay, DUST.fields * DUST.pay + DUST.bonus, 'the contract', `Take the crop duster up from ${strip.name}`) });
  list.push({ id: 'charter', kind: 'charter', fly: true, icon: '🛩', sub: 'fly rich customers between helipads, airfields, mansions and the islands - a tip for a smooth ride', pay: CHARTER.base + 4 * CHARTER.perKm, title: 'Charter pilot - VIP helicopter flights', x: 0, y: 0, ...card(CHARTER.base + (CHARTER.minTrip / 1000) * CHARTER.perKm, (CHARTER.base + 8 * CHARTER.perKm) * (1 + CHARTER.tip), 'a flight', 'Fly the helicopter you\'re issued to your first customer') });   // (charter.js)
  list.push({ id: 'coast', kind: 'coast', fly: true, icon: '⚓', sub: 'boat patrol: run down smugglers, board them and seize the cargo; pull people out of the water', pay: COAST.bust + 200, title: 'Coast guard - boat patrol', x: 0, y: 0, ...card(COAST.bust, COAST.bust + 200, 'a bust', 'Get to your patrol boat at the docks') }, { id: 'coastair', kind: 'coast', fly: true, icon: '🚁', sub: 'air patrol: the same from a helicopter - hover over smugglers to stop them, the harness for people in the water', pay: COAST.bust + 200, title: 'Coast guard - air patrol', x: 0, y: 0, ...card(COAST.bust, COAST.bust + 200, 'a bust', 'Take the coast guard helicopter up from the nearest helipad') });   // (coastguard.js)
  if (farm) list.push({ id: 'fieldwork', kind: 'farm', icon: '🚜', sub: 'drive the co-op tractor down the rows: plough, sow, harvest - paid by the row', pay: FARM.rows * FARM.pay.sow + FARM.bonus, title: 'Farm work at ' + farm.label, x: farm.x, y: farm.y, ...card(FARM.rows * FARM.pay.sow, FARM.rows * FARM.pay.harvest + FARM.bonus, 'the contract', `Get on the co-op tractor at ${farm.label}`) });   // (farming.js)
  const fst = firefighter.stationFor(world, p);   // firefighter: a shift of fire calls from the nearest fire station (firefighter.js)
  if (fst) list.push({ id: 'fire', kind: 'fire', icon: '🚒', sub: 'fire calls: cars, wrecks, people, grass, dumpsters, kitchens - a fire engine and its hose are issued', pay: FIRE.pay.grass, title: `Firefighter - a shift from ${fst.name}`, x: fst.x, y: fst.y, ...card(fireLo(), fireHi(), 'a call', `Get in the fire engine at ${fst.name}`) });
  const hosp = paramedic.hospitalFor(world, p);   // paramedic: a shift of medical calls from the nearest hospital (paramedic.js)
  if (hosp) list.push({ id: 'medic', kind: 'medic', icon: '🚑', sub: 'medical calls: treat the hurt on the spot, get the badly hurt to a hospital, revive players down - an ambulance is issued', pay: MEDIC.pay.serious, title: `Paramedic - a shift from ${hosp.label}`, x: hosp.x, y: hosp.y, ...card(MEDIC.pay.minor, MEDIC.pay.serious * (1 + MEDIC.pay.fast), 'a call', `Get in the ambulance at ${hosp.label}`) });
  drivingJobs(world, p, list);   // the taxi, the bus, the tow truck (H72)
  const pj = p.job;
  return { t: 'board', jobs: list, job: pj ? { text: pj.text, type: pj.type, pay: Number.isFinite(pj.pay) ? pj.pay : null } : null, saw: law.sawList(world, p) };
}

function drivingJobs(world, p, list) {
  const rank = taxijob.rankFor(world, p), bus = busjob.lineFor(world, p), yard = p.ped ? towjob.yardFor(world, p.ped.x, p.ped.y) : null;
  if (rank) list.push({ id: 'cab', kind: 'drive', icon: '🚕', sub: 'fares hail you or ring in: pick them up, the meter runs, drop them at the kerb - a tip for a quick, smooth ride', pay: CAB.flag + 3 * CAB.perKm, title: `Taxi driver - a cab from ${rank.name}`, x: rank.x, y: rank.y, ...card(CAB.flag + (CAB.trip[0] / 1000) * CAB.perKm, (CAB.flag + ((CAB.trip[1] * 1.6 + 200) / 1000) * CAB.perKm) * (1 + CAB.tip), 'a fare', `Get in your cab at ${rank.name}`) });
  if (bus) list.push({ id: 'bus', kind: 'drive', icon: '🚌', sub: 'drive the line round its stops: people off and on, keep to the timetable - paid per stop on time and per passenger', pay: bus.L.stops.length * BUSJOB.perStop, title: `Bus driver - the ${bus.L.name}`, x: bus.L.stops[bus.k].x, y: bus.L.stops[bus.k].y, ...card(BUSJOB.perStop, BUSJOB.perStop + 4 * BUSJOB.perPax, 'a stop', `Take the bus out at the ${bus.L.stops[bus.k].name} stop`) });
  if (rank) list.push({ id: 'crazy', kind: 'drive', icon: '🚖', sub: 'against the clock: fares wave from rings - green short, yellow longer, red long - get them there fast for seconds back; near misses, drifts and dashes for tips', pay: CRAZY.tiers[1].pay, title: `Crazy Taxi - a run from ${rank.name}`, x: rank.x, y: rank.y, ...card(CRAZY.tiers[0].pay * 0.7, CRAZY.tiers[2].pay + CRAZY.nearTip * CRAZY.comboMax, 'a fare', `Get in the cab at ${rank.name} - the clock starts`) });
  const haul = p.ped ? truckjob.offerFor(world, p) : null;   // the trucker: a big rig and a trailer of crates to a buyer across the world (truckjob.js)
  if (haul) { const a = world.map.pois[haul.from], b = world.map.pois[haul.to]; list.push({ id: 'haul', kind: 'drive', icon: '🚛', sub: `a big rig and a flatbed trailer of ${haul.goods.toLowerCase()} crates, out in the open: haul them to ${b.label} - paid by the distance, less for crates lost and knocks`, pay: haul.pay, title: `Trucker - ${a.label} to ${b.label}`, x: a.x, y: a.y, ...card(haul.pay * RIG.floor, haul.pay, 'the haul', `Get in the rig at ${a.label}`) }); }
  const post = mailjob.officeFor(world, p);   // the mail carrier: a van round, or a walking one (mailjob.js)
  if (post) list.push({ id: 'mail', kind: 'delivery', icon: '📬', sub: `a van round of ${MAILJOB.van} homes in a neighbourhood: letters from the window at the mailboxes, parcels carried to the door`, pay: MAILJOB.van * MAILJOB.letter + MAILJOB.bonus, title: `Mail carrier - a van round from ${post.label}`, x: post.x, y: post.y, ...card(MAILJOB.letter, MAILJOB.parcel, 'a stop', `Get in the mail van at ${post.label}`) },
    { id: 'mailwalk', kind: 'delivery', icon: '✉', sub: `a walking round of ${MAILJOB.walk} homes near the post office: post the letters by hand`, pay: MAILJOB.walk * MAILJOB.letter + MAILJOB.bonus, title: `Mail carrier - a walking round from ${post.label}`, x: post.x, y: post.y, ...card(MAILJOB.letter, MAILJOB.letter * MAILJOB.walk + MAILJOB.bonus, 'the round', 'Walk to the first mailbox') });
  if (yard) list.push({ id: 'towjob', kind: 'drive', icon: '🛻', sub: 'wrecks and broken-down cars: back up to them, hook them, tow them to the impound - paid per tow', pay: TOWJOB.pay, title: `Tow truck driver - out of ${yard.name.replace(/^the impound at /, '')}`, x: yard.x, y: yard.y, ...card(TOWJOB.pay, TOWJOB.pay + 5 * TOWJOB.perKm, 'a tow', `Get in the tow truck at ${yard.name.replace(/^the impound at /, 'the impound at ')}`) });
}

// Act at a job's place (a hospital's doors, a fire station, a taxi rank, a bus stop, an impound lot, a helipad - the
// interactions' card): the job's card rather than signing straight on (the owner's bar: what it is, what it pays and the
// first step, then one tap). Accepting it ({ a: 'take', card: 1 }) signs on here, as Act used to.
export function offerCard(world, p, c) {
  const job = boardFor(world, p).jobs.find((q) => q.id === c.id);
  if (!job || !p.conn) return false;
  if (c.title) job.title = c.title;
  if (c.step) job.step = c.step;
  if (c.x !== undefined) { job.x = c.x; job.y = c.y; }
  const alt = c.alt ? boardFor(world, p).jobs.find((q) => q.id === c.alt.id) || null : null;   // (a second job from the same place: the card's "or" - Crazy Taxi at a rank, the walking round at the post office)
  if (alt && c.x !== undefined) { alt.x = c.x; alt.y = c.y; }
  p.pendingCard = { id: c.id, start: c.start, alt: alt ? c.alt : null, at: world.time, x: p.ped.x, y: p.ped.y };
  p.conn.sendJSON({ t: 'jobcard', job, where: c.where || null, ...(alt ? { alt } : null) });
  return true;
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
  if (a === 'skills') return skills.panel(world, p);   // the Skills app (skills.js)
  if (a === 'crew') return crews.panel(world, p);   // the Crew app (crews.js)
  if (a === 'crewsay' || a === 'crewleave' || a === 'crewkick') return crews.phone(world, p, msg);
  if (a === 'workout') { phoneOut(world, p, false); const no = workout.start(world, p, String(msg.k || '')); if (no) world.notify(p, no, 'warn'); return null; }   // a set of push-ups or sit-ups (workout.js)
  if (a === 'out') { phoneOut(world, p, !!msg.on); return null; }   // the phone in your hand while its menu is open
  if (a === 'transit') return { ...transit.transitInfo(world, p), ferries: ferries.ferryInfo(world) };   // the Transit app and the lines on the map
  if (a === 'taxi') return transit.taxiPhone(world, p, msg);    // call a taxi / cancel it / where you want to go
  if (a === 'dance') { phoneOut(world, p, false); dance.next(world, p); return null; }   // the Dance button: dance (the next move each press, dance.js)
  if (a === 'cancel') {
    if (!p.job) return { ...boardFor(world, p), err: 'You have no job.' };
    jobs.failJob(world, p, 'Job cancelled.');
    return boardFor(world, p);
  }
  if (a === 'take') {
    const err = msg.card ? takeCard(world, p, String(msg.id || '')) : take(world, p, msg.id);
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
  if (a === 'homes') return realestate.listings(world, p, { sort: String(msg.sort || ''), kind: String(msg.kind || '') });   // the real-estate app (H65: realestate.js)
  return null;
}

// the card from Act at the job's place: signed on there, by that place's own start (still standing by it)
function takeCard(world, p, id) {
  const c = p.pendingCard;
  p.pendingCard = null;
  if (c && c.alt && c.alt.id === id && world.time - c.at <= 300) { if (p.job) return 'You already have a job - cancel it first.'; return c.alt.start() || null; }
  if (!c || c.id !== id || world.time - c.at > 300) return take(world, p, id);
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  if (Math.hypot(p.ped.x - c.x, p.ped.y - c.y) > 400) return 'You walked away from it - go back and Act there again.';
  return c.start() || null;
}

function take(world, p, id) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  if (id === 'farm') return jobs.startFarm(world, p, nearestFarm(world, p));
  if (id === 'sar') return sar.start(world, p, sar.baseFor(world, p));
  if (id === 'charter') return charter.start(world, p);
  if (id === 'dusting') return dusting.start(world, p);
  if (id === 'coast' || id === 'coastair') return coastguard.start(world, p, id === 'coastair' ? 'air' : 'boat');
  if (id === 'fieldwork') return farming.startWork(world, p, nearestFarm(world, p));
  if (id === 'fire') return firefighter.start(world, p, firefighter.stationFor(world, p));
  if (id === 'medic') return paramedic.start(world, p, paramedic.hospitalFor(world, p));
  if (id === 'cab') return taxijob.start(world, p);
  if (id === 'bus') return busjob.start(world, p);
  if (id === 'towjob') return towjob.start(world, p);
  if (id === 'crazy') return crazytaxi.start(world, p);
  if (id === 'crazyagain') return crazytaxi.start(world, p, null, true);
  if (id === 'haul') return truckjob.start(world, p);
  if (id === 'mail' || id === 'mailwalk') return mailjob.start(world, p, null, id === 'mail' ? 'van' : 'walk');
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
  if (!j) {   // the job's done and its truck's still out: bring it back for the bonus (jobs.js returnTruck)
    const ri = jobs.returnInfo(world, p);
    return ri ? { text: `Bonus: bring the ${ri.v.def.name} back to ${ri.label} (+$${WORK_TRUCK_RETURN})`, x: ri.x, y: ri.y, stage: 'return', veh: truckMark(p, ri.v), k: 'Bonus' } : null;
  }
  const t = target(world, p, j), v = j.truck ? world.get(j.truck) : null;
  if (v && !v.removed && !v.wreckAt) t.veh = truckMark(p, v);   // the job's truck, until you're in it: a ring and arrows (main.js, hud.js)
  if (t.stage === 'pickup' && Number.isFinite(j.tx)) t.dest = [Math.round(j.tx), Math.round(j.ty)];   // (and where it goes after: the minimap)
  return Object.assign(t, jobCardInfo(world, j, t));
}
// The HUD's job card (UI-4, client/hudinfo.js): the job's name (k), the call or fare it's on (n, u), the step of it
// (step: [i, of]) and the time left on the shift or the contract (left, s) - beside the objective line (text) and where
// (x, y). A shift waiting for its next call has no step.
const JOB_NAME = { medic: 'Paramedic', fire: 'Firefighter', cab: 'Taxi', bus: 'Bus driver', towjob: 'Tow truck', sar: 'Search & rescue', dusting: 'Crop duster', charter: 'Charter pilot', coast: 'Coast guard', courier: 'Courier', farm: 'Harvest', deepsea: 'Deep-sea charter', poach: 'Poaching run', patrol: 'Patrol', trainjob: 'Mail train', fieldwork: 'Farm work', crazy: 'Crazy Taxi', haul: 'Trucker', mail: 'Mail carrier' };
const JOB_STEPS = { medic: [['go'], ['scene'], ['hospital']], fire: [['go'], ['fight']], cab: [['pickup'], ['go']], towjob: [['pickup'], ['go', 'tow']], charter: [['pickup'], ['go']], sar: [['search'], ['rescue', 'board'], ['deliver']], coast: [['search', 'chase'], ['board', 'rescue'], ['ashore']], courier: [['pickup'], ['go']], farm: [['pickup'], ['go']], trainjob: [['board'], ['grab'], ['crack'], ['fence']], patrol: [['go'], ['crime', 'chase']], poach: [['go'], ['deliver']], haul: [['pickup', 'hitch'], ['go']] };
const JOB_UNIT = { cab: 'Fare', charter: 'Flight', medic: 'Call', fire: 'Call', towjob: 'Call', sar: 'Call', coast: 'Call' };
export function jobCardInfo(world, j, t) {
  const out = { k: JOB_NAME[j.type] || '' };
  const st = j.type === 'medic' && j.call && j.call.aboard ? 'hospital' : t.stage, L = JOB_STEPS[j.type];
  const i = L ? L.findIndex((q) => q.includes(st)) : -1;
  if (i >= 0) out.step = [i + 1, L.length];
  if (JOB_UNIT[j.type] && st !== 'wait') { out.u = JOB_UNIT[j.type]; out.n = (j.done ?? j.flown ?? ((j.saved || 0) + (j.busts || 0))) + 1; }
  if (Number.isFinite(j.expires)) { out.left = Math.max(0, Math.round(j.expires - world.time)); out.s = j.nextAt !== undefined ? 'shift' : 'job'; }
  if (j.type === 'crazy') Object.assign(out, crazytaxi.cardInfo(world, j));   // (the run's clock, the fare's own: crazytaxi.js)
  if (j.type === 'mail') { out.u = 'Stop'; out.n = Math.min(j.stops.length, j.done + 1); }
  return out;
}
const truckMark = (p, v) => (p.ped && p.ped.vehId === v.id ? null : [Math.round(v.x), Math.round(v.y), v.def.i]);   // (the model: the plate over it names it - "YOUR HELICOPTER", client/main.js drawJobTruck)
function target(world, p, j) {
  if (j.type === 'sar') return sar.target(world, p, j);   // (the search circle, the flare, the harness: sar.js)
  if (j.type === 'dusting') return dusting.target(world, p, j);   // (the next field's crops still to spray, then the strip: dusting.js)
  if (j.type === 'charter') return charter.target(world, p, j);   // (the customer, then where they're going: charter.js)
  if (j.type === 'coast') return coastguard.target(world, p, j);   // (the smugglers, the one in the water, ashore: coastguard.js)
  if (j.type === 'fire') return firefighter.target(world, p, j);   // (the fire, the one alight, the grass fire's middle: firefighter.js)
  if (j.type === 'medic') return paramedic.target(world, p, j);   // (the patient, then the nearest hospital: paramedic.js)
  if (j.type === 'cab') return taxijob.target(world, p, j);   // (the fare, then where they're going: taxijob.js)
  if (j.type === 'bus') return busjob.target(world, p, j);   // (the next stop: busjob.js)
  if (j.type === 'towjob') return towjob.target(world, p, j);   // (the car, then the impound: towjob.js)
  if (j.type === 'crazy') return crazytaxi.target(world, p, j);   // (the fares waving, then where they're going: crazytaxi.js)
  if (j.type === 'haul') return truckjob.target(world, p, j);   // (the rig, then the buyer: truckjob.js)
  if (j.type === 'mail') return mailjob.target(world, p, j);   // (the nearest stop not done: mailjob.js)
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
