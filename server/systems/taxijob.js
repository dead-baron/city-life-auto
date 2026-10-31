// The taxi driver (H72; the owner, 2026-10-11: "Let's add more jobs for players trying to make an honest living"). Sign
// on at a taxi rank - the rail stations and the airports (ranksOf: from the built map) - or from the phone's job list:
// a Checker Taxi is issued like a work truck (jobs.js workTruck: yours, the ring and the arrows). A shift of fares
// (shared/rules.js CAB), one after another:
//   hail   someone at the kerb near you with an arm up (pp 'hail') - pull up by them
//   call   someone further off who rang for a cab (on the phone at their ear: pp 'call')
// Stop beside them and they get in the back; the meter runs while they're aboard (j.text shows it) and the job tracker
// points to where they want to go (a place from the built map, trip px away). Stop at the kerb by it (dropR) and they
// pay: the flag fall and the distance (the meter, at most 1.6x the straight line), and a tip for a quick, smooth ride -
// every crash (a hard hit: vehicles.js hardHit over bump), anyone hit and the police after you cost it. Scare them
// `bail` times and they want out: they get out at the next stop without paying.
//   update(world, dt)          the shifts (world.js SYSTEMS)
//   start(world, p, rank)      sign on -> error | null
//   interaction(world, p)      Act at a rank: sign on
//   target(world, p, j)        the job tracker's target (phone.js jobTarget)
//   rankFor(world, p)          the rank nearest p
//   fareAt(world, p, k, a, b)  a fare of kind k waiting at a ({ x, y }) for b ({ x, y, name }) (tests, the dev menu)
import { CAB } from '../../shared/rules.js';
import { HEAVY_PROPS } from '../../shared/mapcore.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { openNear } from './firefighter.js';
import { kerbFor } from './kerbdrive.js';
import * as jobs from './jobs.js';
import * as crazytaxi from './crazytaxi.js';
import * as transit from './transit.js';
import { payFrom } from './economy.js';
import { CABHAIL } from '../../shared/rules.js';

const NAMES = ['a nurse off shift', 'a tourist', 'a banker', 'a student', 'a chef', 'a salesman', 'a night owl', 'a musician', 'a pensioner', 'a lawyer', 'a builder', 'a bride-to-be'];
const GOES = new Set(['delivery', 'convenience', 'coffee', 'clothing', 'pharmacy', 'hospital', 'club', 'bank', 'cinema', 'bowling', 'gasstation', 'station', 'airport', 'market', 'barber', 'grocery', 'home', 'courthouse', 'marina']);
const SCARE = ['"Whoa - easy!"', '"Are you trying to kill us?"', '"That\'s it, let me out at the next corner!"'];
let seq = 1;

export function ranksOf(m) {
  return m.pois.filter((q) => q.kind === 'station' || q.kind === 'airport').map((q) => ({ x: q.x, y: q.y, name: q.label }));
}
export function rankFor(world, p) {
  const L = ranksOf(world.map);
  if (!L.length) return null;
  if (!p.ped) return L[0];
  return L.reduce((a, b) => (Math.hypot(b.x - p.ped.x, b.y - p.ped.y) < Math.hypot(a.x - p.ped.x, a.y - p.ped.y) ? b : a));
}

// ---- signing on --------------------------------------------------------------------------------------------------------
export function start(world, p, rank = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  rank = rank || rankFor(world, p);
  if (!rank) return 'No taxi company here.';
  p.job = { type: 'cab', stage: 'wait', truck: 0, base: rank, nextAt: world.time + CAB.firstS, expires: world.time + CAB.shiftS, done: 0, fare: null, text: 'Taxi: cruising for a fare' };
  const v = jobs.workTruck(world, p, rank, 'taxi', { label: rank.name });
  if (!v) { p.job = null; return 'No room to park a cab there.'; }
  world.notify(p, `You drive a cab out of ${rank.name}: your taxi is the green ring. Fares hail you in the street or ring in - pull up by them, then take them where they're going. Quick and smooth earns a tip.`, 'good', 'Taxi shift: your cab is the green ring');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const r = ranksOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 150);
  if (!r) return null;
  return { label: 'Sign on as a taxi driver (a cab is issued)', card: { id: 'cab', where: r.name, start: () => start(world, p, r), alt: { id: 'crazy', start: () => crazytaxi.start(world, p, r) } }, run: () => { const err = start(world, p, r); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the fares ---------------------------------------------------------------------------------------------------------
export const placesOf = (m) => m._cabGo || Object.defineProperty(m, '_cabGo', { value: m.pois.filter((q) => GOES.has(q.kind)), enumerable: false })._cabGo;
export function pick(world, list, x, y, lo, hi) {
  const ring = list.filter((q) => { const d = Math.hypot(q.x - x, q.y - y); return d >= lo && d <= hi; });
  return ring.length ? ring[Math.floor(world.rand() * ring.length)] : null;
}
function newFare(world, p) {
  const v = world.get(p.job.truck), at = v || p.ped, k = world.rand() < 0.6 ? 'hail' : 'call';
  const L = placesOf(world.map), [lo, hi] = k === 'hail' ? CAB.hail : [CAB.hail[1], CAB.trip[1]];
  const a = pick(world, L, at.x, at.y, lo, hi);
  const b = a && pick(world, L, a.x, a.y, CAB.trip[0], CAB.trip[1]);
  if (!a || !b || !fareAt(world, p, k, a, { x: b.x, y: b.y, name: b.label })) p.job.nextAt = world.time + 8;
}
// a fare of kind k ('hail' | 'call') waiting by a for b -> the fare | null
export function fareAt(world, p, k, a, b) {
  const j = p.job, now = world.time, m = world.map;
  const at = kerbSpot(m, a);
  if (!at) return null;
  const q = spawnNpc(world, 'casual', at.x, at.y, 'civ');
  q.npc.sar = p.pid; q.npc.keep = true; q.vx = 0; q.vy = 0;
  q.pp = k === 'hail' ? 'hail' : 'call'; q.appVer = (q.appVer || 0) + 1;   // (an arm up for a cab; on the phone to the company)
  const f = { id: seq++, k, cust: q.id, who: NAMES[Math.floor(world.rand() * NAMES.length)], at: now, aboard: false, onAt: 0, board: 0, to: { x: b.x, y: b.y, name: b.name || 'their stop' }, from: null, direct: 0, meter: 0, lx: 0, ly: 0, crash: 0, hits: 0, cops: 0, scared: 0, bail: false, hitAt: 0 };
  j.fare = f; j.stage = 'pickup';
  (world.cabFares ||= new Map()).set(p.pid, q.id);
  const where = world.map.districtAt(q.x, q.y);
  j.text = k === 'hail' ? `Taxi: ${f.who} is hailing a cab${where ? ` in ${where.name}` : ''}` : `Taxi: a call - pick up ${f.who}${where ? ` in ${where.name}` : ''}`;
  world.notify(p, k === 'hail' ? `Fare! ${f.who[0].toUpperCase()}${f.who.slice(1)} is flagging down a cab nearby - pull up beside them.` : `Dispatch: ${f.who} rang for a cab${where ? ` in ${where.name}` : ''} - it's marked.`, 'good');
  p.meDirty = true;
  return f;
}
// where someone waits for a cab by a: on open ground, not under a tree or against a lamp post (in sight) - or null
export function kerbSpot(m, a) {
  for (const [ox, oy] of [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [80, 0], [-80, 0], [0, 80], [0, -80]]) { const q = openNear(m, a.x + ox, a.y + oy); if (q && !heavyNear(m, q.x, q.y) && outdoors(m, q)) return q; }
  const q = openNear(m, a.x, a.y);
  return q && outdoors(m, q) ? q : null;
}
// not in a building's footprint (a courtyard or a plaza under a roof: out of sight)
function outdoors(m, q) { const tx = Math.floor(q.x / 32), ty = Math.floor(q.y / 32); return m.inside(tx, ty) && m.bld[m.idx(tx, ty)] < 0; }
// a tree, a lamp post, a hydrant... (shared/mapcore.js HEAVY_PROPS) within r px of (x, y)
function heavyNear(m, x, y, r = 44) {
  let g = m._heavyGrid;
  if (!g) {
    g = new Map();
    for (const q of m.props) if (HEAVY_PROPS.has(q.t)) { const k = `${Math.floor(q.x / 64)},${Math.floor(q.y / 64)}`; (g.get(k) || g.set(k, []).get(k)).push(q); }
    Object.defineProperty(m, '_heavyGrid', { value: g, enumerable: false });
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (const q of g.get(`${Math.floor(x / 64) + dx},${Math.floor(y / 64) + dy}`) || []) if (Math.hypot(q.x - x, q.y - y) < r) return true;
  return false;
}
const fareOf = (f) => Math.round((CAB.flag + (Math.min(f.meter, f.direct * 1.6 + 200) / 1000) * CAB.perKm) / 5) * 5;
function endFare(world, p, msg, tone) {
  const j = p.job, f = j && j.fare;
  if (f && f.k !== 'player') {
    const q = world.get(f.cust);
    if (q && !q.removed && (q.vehId || q.npc.sar)) {   // (not one set down at the kerb: off they walk)
      if (q.vehId) { const v = world.get(q.vehId); if (v) { const i = v.seats.indexOf(q.id); if (i >= 0) v.seats[i] = 0; } q.vehId = 0; q.seat = -1; }
      despawnNpc(world, q);
    }
  }
  if (world.cabFares) world.cabFares.delete(p.pid);
  if (j) { j.fare = null; j.stage = 'wait'; j.nextAt = world.time + CAB.gapS; j.text = 'Taxi: cruising for a fare'; }
  if (msg) world.notify(p, msg, tone || 'info');
  p.meDirty = true;
}
// out at the kerb: off they walk (somewhere to be), gone once out of the way
export function setDown(world, v, q) {
  const i = v.seats.indexOf(q.id);
  if (i >= 0) v.seats[i] = 0;
  q.vehId = 0; q.seat = -1;
  const out = openNear(world.map, v.x - Math.sin(v.a) * (v.def.W / 2 + 24), v.y + Math.cos(v.a) * (v.def.W / 2 + 24)) || { x: v.x, y: v.y + v.def.W };
  q.x = out.x; q.y = out.y; q.lz = 0; q.pp = null; q.appVer = (q.appVer || 0) + 1;
  q.npc.sar = 0; q.npc.keep = false; q.npc.state = 'wander';
  world.place(q);
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
}

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped;
  const v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { endFare(world, p); jobs.failJob(world, p, 'Your cab is wrecked. The company takes you off the rota.'); return; }
  const f = j.fare;
  if (!f) {
    if (now >= j.expires) { world.notify(p, `Shift over: ${j.done} fare${j.done === 1 ? '' : 's'}.`, 'good'); jobs.jobDone(world, p); return; }
    if (now >= j.nextAt && ped && !ped.dead) newFare(world, p);
    return;
  }
  if (f.k === 'player') { stepRider(world, p, v, f, dt); return; }   // (a player who hailed a cab: below)
  const q = world.get(f.cust);
  if (!q || q.removed || q.dead) { endFare(world, p, 'The fare\'s off.', 'bad'); return; }
  const driving = ped && ped.vehId === v.id && ped.seat === 0, speed = Math.hypot(v.vx, v.vy);
  if (!f.aboard) {
    if (now - f.at > CAB.waitS) { endFare(world, p, `${f.who[0].toUpperCase()}${f.who.slice(1)} got another cab.`, 'bad'); return; }
    const d = Math.hypot(v.x - q.x, v.y - q.y);
    if (!driving || speed > 30 || d > CAB.boardR) { f.board = 0; return; }
    q.a = Math.atan2(v.y - q.y, v.x - q.x);
    f.board += dt;
    if (d > v.def.W / 2 + 20) { const k = Math.min(1, (90 * dt) / Math.max(1, d - v.def.W / 2)); q.x += (v.x - q.x) * k; q.y += (v.y - q.y) * k; world.place(q); }
    if (f.board < 1.2) return;
    const seat = [2, 3, 1].find((i) => i < v.seats.length && !v.seats[i]);
    if (seat === undefined) { if (!f.warned) { f.warned = true; world.notify(p, 'No seat free in the back for your fare.', 'warn'); } return; }
    v.seats[seat] = q.id; q.vehId = v.id; q.seat = seat; q.vx = 0; q.vy = 0; q.pp = null; q.appVer = (q.appVer || 0) + 1;
    f.aboard = true; f.onAt = now; f.from = { x: v.x, y: v.y }; f.direct = Math.hypot(f.to.x - v.x, f.to.y - v.y); f.lx = v.x; f.ly = v.y;
    f.hitAt = v.hardHitAt || 0; f.cops = p.wanted || 0;
    j.stage = 'go'; j.text = `Taxi: ${f.who} to ${f.to.name} - meter $${fareOf(f)}`;
    world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
    world.notify(p, `${f.who[0].toUpperCase()}${f.who.slice(1)} gets in: "${f.to.name}, please." The meter's running.`, 'good');
    p.meDirty = true;
    return;
  }
  if (q.vehId !== v.id) { endFare(world, p, `${f.who[0].toUpperCase()}${f.who.slice(1)} got out. No fare.`, 'bad'); return; }
  // the meter, and how the ride's going: crashes, people hit, the police after you
  const dm = Math.hypot(v.x - f.lx, v.y - f.ly);
  if (dm < 400) f.meter += dm;
  f.lx = v.x; f.ly = v.y;
  let scare = 0;
  if ((v.hardHitAt || 0) > f.hitAt) { f.hitAt = v.hardHitAt; if (v.hardHit > CAB.bump) { f.crash++; scare++; } }
  for (const e of world.events) {
    const ev = e.ev;
    if (((ev.e === 'runover' || ev.e === 'hood') && ev.v === v.id) || (ev.e === 'fling' && Math.hypot(ev.x - v.x, ev.y - v.y) < v.def.L)) { f.hits++; scare++; }
  }
  if ((p.wanted || 0) > f.cops) { f.cops = p.wanted; scare++; }
  if (scare && !f.bail) {
    f.scared += scare;
    if (f.scared >= CAB.bail) { f.bail = true; j.text = `Taxi: ${f.who} wants out - stop and let them go`; }
    world.notify(p, `${f.who[0].toUpperCase()}${f.who.slice(1)}: ${SCARE[Math.min(SCARE.length - 1, f.scared - 1)]}`, f.bail ? 'bad' : 'warn');
    p.meDirty = true;
  }
  if (f.bail) {
    if (speed > 60) return;
    setDown(world, v, q);
    endFare(world, p, `${f.who[0].toUpperCase()}${f.who.slice(1)} jumps out and storms off without paying.`, 'bad');
    return;
  }
  if (world.tick % 20 === 3) { const t = `Taxi: ${f.who} to ${f.to.name} - meter $${fareOf(f)}`; if (t !== j.text) { j.text = t; p.meDirty = true; } }
  if (speed > 25 || Math.hypot(v.x - f.to.x, v.y - f.to.y) > CAB.dropR) return;
  // there: the fare and the tip
  const fare = fareOf(f), par = CAB.parS + f.direct / CAB.kmS, took = now - f.onAt;
  const quick = Math.max(0, Math.min(1, (par * 1.6 - took) / (par * 0.6)));
  const smooth = f.cops ? 0 : Math.max(0, 1 - f.crash * 0.5 - f.hits);
  const tip = Math.round((fare * CAB.tip * smooth * (0.4 + 0.6 * quick)) / 5) * 5;
  p.profile.cash += fare + tip;
  j.done++;
  j.lastPay = { fare, tip, crash: f.crash, hits: f.hits, cops: f.cops };
  j.expires = Math.max(j.expires, now + CAB.shiftS / 3);
  setDown(world, v, q);
  world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
  const say = tip ? (smooth >= 1 && quick > 0.7 ? '"Great ride - keep the change."' : '"Here, something for you."') : f.cops ? '"Never again. The police were right behind us!"' : f.hits ? '"You hit someone back there!"' : f.crash ? '"I\'ll be feeling that in the morning."' : '"Took your time."';
  endFare(world, p, `${f.who[0].toUpperCase()}${f.who.slice(1)} gets out at ${f.to.name}. ${say} Fare $${fare}${tip ? ` + $${tip} tip` : ', no tip'}.`, tip ? 'good' : 'info');
  store.touch();
}

// ---- every tick --------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.cabHails && world.tick % 10 === 4) for (const [pid, h] of world.cabHails) {   // (hails gone stale: they walked off, got in something, gave up)
    const p = world.players.get(pid), ped = p && p.ped;
    if (!ped || ped.dead || ped.vehId || world.time > h.until || Math.hypot(ped.x - h.x, ped.y - h.y) > CABHAIL.moveR) { if (p) hailOver(world, p, null, 'Your fare didn\'t wait.'); else world.cabHails.delete(pid); }
  }
  if (world.cabFares) for (const [pid, id] of world.cabFares) {
    const p = world.players.get(pid);
    if (p && p.job && p.job.type === 'cab' && p.job.fare && p.job.fare.cust === id) continue;
    const q = world.get(id);
    if (q && !q.removed) { if (q.vehId) { const v = world.get(q.vehId); if (v) { const i = v.seats.indexOf(q.id); if (i >= 0) v.seats[i] = 0; } q.vehId = 0; q.seat = -1; } despawnNpc(world, q); }
    world.cabFares.delete(pid);
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'cab') step(world, p, dt);
}

// ---- the page's view of it (phone.js jobTarget) ------------------------------------------------------------------------
export function target(world, p, j) {
  const f = j.fare, v = world.get(j.truck);
  if (!f) { const at = v || j.base; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  if (!f.aboard) { const q = world.get(f.cust); return { text: j.text, x: Math.round(q ? q.x : 0), y: Math.round(q ? q.y : 0), stage: 'pickup', ...(f.to ? { dest: [Math.round(f.to.x), Math.round(f.to.y)] } : null) }; }
  if (!f.to) { const v = world.get(j.truck); return { text: j.text, x: Math.round(v ? v.x : 0), y: Math.round(v ? v.y : 0), stage: 'go' }; }
  return { text: j.text, x: Math.round(f.to.x), y: Math.round(f.to.y), stage: 'go' };
}

// ---- dev ('cabjob'): on the rota, your cab beside you (get in: the fare's close enough to climb in), a fare hailing
export function devCab(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'cab') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const j = p.job;
  if (j.fare) endFare(world, p);
  const b = pick(world, placesOf(world.map), ped.x, ped.y, CAB.trip[0], CAB.trip[1]) || { x: ped.x + 2000, y: ped.y, label: 'downtown' };
  // the cab pulled up on the pavement beside you, along the street (out of the traffic's way), the fare a little on
  const v = world.get(j.truck), k = kerbFor(world, ped.x, ped.y), c = Math.cos(k.a || 0), s = Math.sin(k.a || 0);
  const side = (ped.x - k.x) * -s + (ped.y - k.y) * c >= 0 ? 1 : -1;   // (and a little further from the road: a bus pulling in to a stop would shove it along)
  if (v && !ped.vehId) { v.x = ped.x - c * 72 - s * side * 30; v.y = ped.y - s * 72 + c * side * 30; v.a = k.a || 0; v.vx = 0; v.vy = 0; world.place(v); }
  if (!fareAt(world, p, 'hail', { x: ped.x + c * 45, y: ped.y + s * 45 }, { x: b.x, y: b.y, name: b.label })) return 'no room for a fare here';
  j.nextAt = world.time + CAB.gapS;
  return null;
}

// ---- a player hailing a cab (b8a; the owner: "or even pick up other players if they hail a taxi and you see it you can go
// pick them up if another NPC doesnt do it first") -------------------------------------------------------------------
// Calling a taxi on the phone (transit.js callTaxi), or hailing a player's cab going by, puts out a hail: every on-duty
// cab driver within CABHAIL.hailR with nobody in the back is sent to it (an NPC fare they were on their way to is
// dropped - a player's first). The city's taxi comes too: whichever cab the player gets into first takes the fare, the
// others are stood down. Aboard, their waypoint is where to (the page sends it, as for a city taxi); the meter runs as
// for any fare, and getting out they pay it (CAB.flag + perKm) to the driver - no tip, no company bonus: the money only
// changes hands. world.cabHails: pid -> { pid, x, y, at, until }; the cab's p.job.fare { k: 'player', rider, cust }.
const nameOf = (p) => (p.profile && p.profile.name) || p.name || 'a player';
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
export function playerHail(world, p, only = null) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return 0;
  const H = (world.cabHails ||= new Map());
  H.set(p.pid, { pid: p.pid, x: ped.x, y: ped.y, at: world.time, until: world.time + CABHAIL.hailS });
  ped.pp = 'hail'; ped.appVer = (ped.appVer || 0) + 1;   // (an arm up for a cab, for everyone to see)
  let sent = 0;
  for (const q of world.players.values()) {
    if (q === p || !q.job || q.job.type !== 'cab' || (only && q !== only)) continue;
    const v = world.get(q.job.truck), f = q.job.fare;
    if (!v || Math.hypot(v.x - ped.x, v.y - ped.y) > CABHAIL.hailR || (f && (f.aboard || f.k === 'player'))) continue;
    if (f) endFare(world, q);
    q.job.fare = { id: seq++, k: 'player', rider: p.pid, cust: ped.id, who: nameOf(p), at: world.time, aboard: false, onAt: 0, to: null, meter: 0, lx: 0, ly: 0, there: false };
    q.job.stage = 'pickup';
    const where = world.map.districtAt(ped.x, ped.y);
    q.job.text = `Taxi: ${nameOf(p)} is hailing a cab${where ? ` in ${where.name}` : ''} - beat the city's taxi there`;
    world.notify(q, `Dispatch: ${nameOf(p)} wants a cab${where ? ` in ${where.name}` : ''} - it's marked. First cab there gets the fare.`, 'good');
    q.meDirty = true;
    sent++;
  }
  return sent;
}
// the hail's over (they got in a cab, cancelled, walked off): every cab sent to it stood down but the one that got them
export function hailOver(world, p, by = null, why = 'Your fare took another cab.') {
  if (world.cabHails) world.cabHails.delete(p.pid);
  if (p.ped && p.ped.pp === 'hail') { p.ped.pp = null; p.ped.appVer = (p.ped.appVer || 0) + 1; }
  for (const q of world.players.values()) {
    const f = q.job && q.job.type === 'cab' && q.job.fare;
    if (f && f.k === 'player' && f.rider === p.pid && !f.aboard && q !== by) endFare(world, q, why, 'bad');
  }
}
// on foot: get in a player's cab sent for you and stopped by you; or hail an on-duty player's empty cab going by
export function riderInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return null;
  for (const q of world.players.values()) {
    const j = q.job;
    if (q === p || !j || j.type !== 'cab') continue;
    const v = world.get(j.truck);
    if (!v || v.removed || !q.ped || q.ped.vehId !== v.id) continue;
    const d = Math.hypot(v.x - ped.x, v.y - ped.y), f = j.fare;
    if (f && f.k === 'player' && f.rider === p.pid && !f.aboard && d < CABHAIL.boardR + v.def.L / 2 && Math.hypot(v.vx, v.vy) < 40) return { label: `Get in ${nameOf(q)}'s cab`, run: () => boardRider(world, p, q, v) };
    if (!f && d < 260 && !(world.cabHails && world.cabHails.has(p.pid))) return { label: `Hail ${nameOf(q)}'s cab`, run: () => { if (playerHail(world, p, q)) world.notify(p, `${nameOf(q)} is pulling over for you.`, 'good'); } };
  }
  return null;
}
function boardRider(world, p, q, v) {
  const ped = p.ped, f = q.job && q.job.fare;
  if (!ped || ped.vehId || !f || f.rider !== p.pid || f.aboard) return;
  if (ped.carrying) { world.notify(p, 'Put the crate down first - it won\'t fit in the back.', 'warn'); return; }
  const seat = [2, 3, 1].find((i) => i < v.seats.length && !v.seats[i]);
  if (seat === undefined) { world.notify(p, 'No seat free in the back.', 'warn'); return; }
  v.seats[seat] = ped.id; ped.vehId = v.id; ped.seat = seat; ped.vx = 0; ped.vy = 0; ped.rollT = 0;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
  f.aboard = true; f.onAt = world.time; f.lx = v.x; f.ly = v.y; f.meter = 0;
  q.job.stage = 'go';
  hailOver(world, p, q);
  transit.standDown(world, p, 'You took another cab - the taxi you called drove off.');
  p.cabRide = v.id;
  world.notify(p, `You're in ${nameOf(q)}'s cab. Your waypoint is where to - the meter's running ($${CAB.flag} flag, $${CAB.perKm} a km).${p.taxiDest ? '' : ' Set a waypoint (the map, or the phone\'s places).'}`, 'good');
  world.notify(q, `${nameOf(p)} gets in. ${p.taxiDest ? `"${p.taxiDest.label || 'My waypoint'}, please."` : 'They\'re picking where to.'}`, 'good');
  p.meDirty = true; q.meDirty = true;
}
const meterFare = (f) => Math.round((CAB.flag + (f.meter / 1000) * CAB.perKm) / 5) * 5;
function stepRider(world, q, v, f, dt) {
  const j = q.job, p = world.players.get(f.rider), ped = p && p.ped;
  if (!p || !ped || ped.dead || !p.conn) { if (f.aboard && ped && ped.vehId === v.id) { const i = v.seats.indexOf(ped.id); if (i >= 0) v.seats[i] = 0; ped.vehId = 0; ped.seat = -1; } if (p) hailOver(world, p, q); endFare(world, q, 'The fare\'s off.', 'bad'); return; }
  if (!f.aboard) {
    const h = world.cabHails && world.cabHails.get(p.pid);
    if (!h || world.time > h.until || ped.vehId || Math.hypot(ped.x - h.x, ped.y - h.y) > CABHAIL.moveR) { hailOver(world, p, null, `${f.who} didn't wait.`); if (q.job && q.job.fare === f) endFare(world, q, `${f.who} didn't wait.`, 'bad'); return; }
    return;
  }
  if (ped.vehId !== v.id) {   // out: they pay the meter to you
    const fare = f.meter < 64 ? 0 : meterFare(f);
    let paid = 0;
    if (fare) { if (payFrom(p, fare)) paid = fare; else { paid = Math.max(0, p.profile.cash + p.profile.bank); p.profile.cash = 0; p.profile.bank = 0; } }
    q.profile.cash += paid;
    if (paid) { j.done++; world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y, n: paid }); }
    p.cabRide = 0; p.meDirty = true;
    world.notify(p, paid ? `Taxi fare to ${nameOf(q)}: $${paid}.` : 'You got out before the meter got going - no charge.', 'info');
    endFare(world, q, paid ? `${f.who} gets out and pays the meter: +$${paid}.` : `${f.who} got out.`, paid ? 'good' : 'info');
    store.touch();
    return;
  }
  const dm = Math.hypot(v.x - f.lx, v.y - f.ly);
  if (dm < 400) f.meter += dm;
  f.lx = v.x; f.ly = v.y;
  const D = p.taxiDest;
  if (D && (!f.to || f.to.x !== D.x || f.to.y !== D.y)) { f.to = { x: D.x, y: D.y, name: D.label || 'their waypoint' }; f.there = false; world.notify(q, `${f.who}: "${f.to.name}, please."`, 'info'); }
  if (!D && f.to) f.to = null;
  if (world.tick % 20 === 3) {
    const t = f.to ? `Taxi: ${f.who} to ${f.to.name} - meter $${meterFare(f)}` : `Taxi: ${f.who} is aboard - waiting for where to (their waypoint)`;
    if (t !== j.text) { j.text = t; q.meDirty = true; p.meDirty = true; }
  }
  if (f.to && !f.there && Math.hypot(v.vx, v.vy) < 25 && Math.hypot(v.x - f.to.x, v.y - f.to.y) < CAB.dropR) {
    f.there = true;
    world.notify(p, `Here we are - ${f.to.name}. $${meterFare(f)}: get out with the vehicle key.`, 'good');
    world.notify(q, `You're there. ${f.who} pays the meter getting out.`, 'good');
  }
}
// the passenger's view of it (the HUD's taxi strip, the Transit app: transit.taxiInfo's shape) - waiting for a player's
// cab or riding in one
export function riderInfo(world, p) {
  if (!p.ped) return null;
  for (const q of world.players.values()) {
    const f = q.job && q.job.type === 'cab' && q.job.fare;
    if (!f || f.k !== 'player' || f.rider !== p.pid) continue;
    const v = world.get(q.job.truck);
    if (!v) continue;
    const d = Math.hypot(v.x - p.ped.x, v.y - p.ped.y), m = f.to ? Math.round(Math.hypot(v.x - f.to.x, v.y - f.to.y) / 32) : 0;
    return { tier: 'std', name: `${nameOf(q)}'s cab`, st: !f.aboard ? (d < 300 && Math.hypot(v.vx, v.vy) < 40 ? 'wait' : 'pickup') : !f.to ? 'dest' : f.there ? 'there' : 'ride', x: Math.round(v.x), y: Math.round(v.y), eta: Math.round(d / 250), wait: 0, to: f.to ? f.to.name : '', m, fare: meterFare(f), est: meterFare({ meter: f.meter + m * 32 }), pc: 1 };
  }
  return null;
}
