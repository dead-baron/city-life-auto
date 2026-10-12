// The paramedic (H68; the owner, 2026-10-11: "more jobs for players trying to make an honest living"). Sign on at a
// hospital (Act at its doors) or from the phone's job list: an ambulance (shared/vehicles.js ambulance) is issued like a
// work truck (jobs.js workTruck: yours, the ring and the arrows; H for the siren - traffic pulls over). A shift of calls
// (shared/rules.js MEDIC), each from the built map (firefighter.js sitesOf / openNear: by the shops, in the parks):
//   minor    someone who's had a fall - hold Act by them to treat them on the spot; up they get
//   serious  someone hit by a car or collapsed - treat them (hold Act) to stabilise them, then bring the ambulance
//            alongside (they're helped aboard) and drive them to a hospital (within MEDIC.hospitalR of its doors, stopped):
//            they're handed over. Untreated they last lifeS; aboard, rideS more.
//   player   a player down near you (revive.js isDowned) - revive them (hold Act: revive.js's own; a Revive Kit's quicker)
// Paid by the call: its kind, how fast, the drive to the hospital; Samaritan points.
//   update(world, dt)            the shifts (world.js SYSTEMS)
//   start(world, p, hospital)    sign on -> error | null
//   interaction(world, p)        Act: signing on at a hospital; treating a patient (hold)
//   target(world, p, j)          the job tracker's target (phone.js jobTarget)
//   hospitalFor(world, p)        the hospital nearest p
//   callAt(world, p, k, site)    a call of kind k at a site { x, y, name } (tests, the dev menu)
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { MEDIC } from '../../shared/rules.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { sitesOf, openNear } from './firefighter.js';
import { isDowned } from './revive.js';
import * as combat from './combat.js';
import * as jobs from './jobs.js';

export const KINDS = ['minor', 'serious', 'player'];
const SAY = {
  minor: (w) => `someone's had a fall ${w} - treat them on the spot`,
  serious: (w) => `someone's badly hurt ${w} - stabilise them and get them to a hospital`,
  player: (w) => `a player's down ${w} - get them back on their feet`,
};
const NAMES = ['a cyclist', 'a jogger', 'a shopper', 'a pensioner', 'a delivery rider', 'a tourist', 'a dog walker', 'a builder'];
let seq = 1;

const hospitals = (m) => m.pois.filter((q) => q.kind === 'hospital');
export function hospitalFor(world, p) {
  const L = hospitals(world.map);
  if (!L.length) return null;
  if (!p.ped) return L[0];
  return L.reduce((a, b) => (Math.hypot(b.x - p.ped.x, b.y - p.ped.y) < Math.hypot(a.x - p.ped.x, a.y - p.ped.y) ? b : a));
}

// ---- signing on --------------------------------------------------------------------------------------------------------
export function start(world, p, h = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  h = h || hospitalFor(world, p);
  if (!h) return 'No hospital takes on paramedics today.';
  p.job = { type: 'medic', stage: 'wait', truck: 0, base: { x: h.x, y: h.y, name: h.label }, nextAt: world.time + MEDIC.firstS, expires: world.time + MEDIC.shiftS, done: 0, call: null, text: 'Paramedic: waiting for a call' };
  const v = jobs.workTruck(world, p, h, 'ambulance', h);
  if (!v) { p.job = null; return 'No room to park the ambulance there.'; }
  v.sirenOn = false;
  world.notify(p, `You're a paramedic out of ${h.label}: your ambulance is the green ring. Calls come over the phone - H for the siren; hold Act by a patient to treat them.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped, j = p.job;
  if (!ped || ped.dead || ped.vehId) return null;
  if (j && j.type === 'medic') {
    const c = j.call, q = c && c.k !== 'player' && !c.treated && world.get(c.patient);
    if (!q || q.dead || Math.hypot(q.x - ped.x, q.y - ped.y) > MEDIC.treatR) return null;
    return { label: `Hold: treat ${c.who}`, run: () => {} };   // (held: update counts it)
  }
  if (j) return null;
  const h = hospitals(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 150);
  if (!h) return null;
  return { label: 'Sign on as a paramedic (an ambulance is issued)', run: () => { const err = start(world, p, h); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the calls ---------------------------------------------------------------------------------------------------------
function pickSite(world, list, ped) {
  const ring = list.filter((q) => { const d = Math.hypot(q.x - ped.x, q.y - ped.y); return d >= MEDIC.minD && d <= MEDIC.maxD; });
  const L = ring.length ? ring : list;
  return L.length ? L[Math.floor(world.rand() * L.length)] : null;
}
function downedNear(world, p) {
  for (const q of world.players.values()) {
    if (q === p || !q.ped || !isDowned(q.ped)) continue;
    if (Math.hypot(q.ped.x - p.ped.x, q.ped.y - p.ped.y) <= MEDIC.maxD && !(world.medicFor && world.medicFor.has(q.pid))) return q;
  }
  return null;
}
function newCall(world, p) {
  const down = downedNear(world, p);
  if (down) { callAt(world, p, 'player', { x: down.ped.x, y: down.ped.y, name: placeIn(world, down.ped.x, down.ped.y), pid: down.pid }); return; }
  const S = sitesOf(world.map), k = world.rand() < 0.5 ? 'minor' : 'serious';
  const list = world.rand() < 0.6 ? S.shops : S.grass;
  const site = pickSite(world, list.length ? list : S.shops, p.ped);
  if (!site || !callAt(world, p, k, site)) p.job.nextAt = world.time + 10;
}
const placeIn = (world, x, y) => { const d = world.map.districtAt(x, y); return d ? `in ${d.name}` : 'out in the country'; };
// a call of kind k at site { x, y, name, pid? } -> the call | null
export function callAt(world, p, k, site) {
  const j = p.job, now = world.time;
  const c = { id: seq++, k, x: site.x, y: site.y, at: now, d: p.ped ? Math.hypot(site.x - p.ped.x, site.y - p.ped.y) : 0, patient: 0, pid: '', who: '', treat: 0, treated: false, aboard: false, onAt: 0 };
  if (k === 'player') {
    const q = world.players.get(site.pid);
    if (!q || !q.ped || !isDowned(q.ped)) return null;
    c.pid = q.pid; c.patient = q.ped.id; c.who = q.name || 'a player';
    (world.medicFor ||= new Map()).set(q.pid, p.pid);
  } else {
    const at = openNear(world.map, site.x, site.y);
    if (!at) return null;
    const q = spawnNpc(world, 'casual', at.x, at.y, 'civ');
    q.npc.sar = p.pid; q.npc.keep = true; q.vx = 0; q.vy = 0;
    q.downUntil = now + 1e5; q.hp = Math.min(q.hp, q.maxHp ? q.maxHp * 0.3 : 30); q.bleeding = false;
    c.patient = q.id; c.who = NAMES[Math.floor(world.rand() * NAMES.length)]; c.x = q.x; c.y = q.y;
  }
  j.call = c; j.stage = 'go';
  const where = k === 'player' ? site.name : site.name ? `outside ${site.name}` : placeIn(world, c.x, c.y);
  j.text = `Medical call: ${SAY[k](where)}`;
  world.notify(p, `Medical call! ${SAY[k](where)[0].toUpperCase()}${SAY[k](where).slice(1)}. Siren on (H).`, 'good');
  p.meDirty = true;
  return c;
}
function endCall(world, p, ok, msg, extra = 0) {
  const j = p.job, c = j && j.call;
  if (!c) return;
  const now = world.time;
  if (c.pid && world.medicFor) world.medicFor.delete(c.pid);
  if (c.k !== 'player') {
    const q = world.get(c.patient);
    if (q && !q.removed) {
      if (q.vehId) { const v = world.get(q.vehId); if (v) { const i = v.seats.indexOf(q.id); if (i >= 0) v.seats[i] = 0; } q.vehId = 0; q.seat = -1; }
      if (q.dead || c.aboard) despawnNpc(world, q);
      else { q.npc.sar = 0; q.npc.keep = false; q.npc.state = 'wander'; q.downUntil = Math.min(q.downUntil, now + 1); }
    }
  }
  let pay = 0;
  if (ok) {
    const P = MEDIC.pay, par = P.parS + c.d / P.kmS, took = now - c.at;
    const fast = Math.max(0, Math.min(1, (par * 1.8 - took) / (par * 0.8)));
    pay = Math.round((P[c.k] * (1 + P.fast * fast) + extra) / 5) * 5;
    p.profile.cash += pay; p.profile.samaritan = (p.profile.samaritan || 0) + P.samaritan;
    j.done++;
    j.expires = Math.max(j.expires, now + MEDIC.shiftS / 3);
    if (p.ped) world.emit(p.ped.x, p.ped.y, { e: 'cash', x: p.ped.x, y: p.ped.y });
    store.touch();
  }
  j.lastPay = { pay, k: c.k };
  j.call = null; j.stage = 'wait'; j.nextAt = now + MEDIC.gapS; j.text = 'Paramedic: waiting for the next call';
  world.notify(p, ok ? `${msg} +$${pay}, +${MEDIC.pay.samaritan} Samaritan.` : msg, ok ? 'good' : 'bad');
  p.meDirty = true;
}
function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped;
  const v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { endCall(world, p, false, 'The ambulance is lost.'); jobs.failJob(world, p, 'The ambulance is lost. You\'re off the rota.'); return; }
  const c = j.call;
  if (!c) {
    if (now >= j.expires) { world.notify(p, `Shift over: ${j.done} call${j.done === 1 ? '' : 's'} answered.`, 'good'); jobs.jobDone(world, p); return; }
    if (now >= j.nextAt && ped && !ped.dead) newCall(world, p);
    return;
  }
  const q = world.get(c.patient);
  if (c.k === 'player') {
    const pl = world.players.get(c.pid);
    if (p.giveTo && p.giveTo.pid === c.pid) { endCall(world, p, true, `${c.who} is back on their feet.`); return; }
    if (!pl || !pl.ped || !isDowned(pl.ped)) { endCall(world, p, false, `${c.who} isn't down any more - someone else got there.`); return; }
    if (now - c.at > MEDIC.callS) endCall(world, p, false, 'Too late for that one.');
    return;
  }
  if (!q || q.removed) { endCall(world, p, false, 'The patient is gone.'); return; }
  if (q.dead) { endCall(world, p, false, `${c.who[0].toUpperCase()}${c.who.slice(1)} didn't make it.`); return; }
  if (j.stage === 'go' && ped && Math.hypot(ped.x - q.x, ped.y - q.y) < 400) { j.stage = 'scene'; p.meDirty = true; }
  // treating: Act held by them, on foot
  if (!c.treated) {
    const held = ped && !ped.vehId && !ped.dead && ((p.prevBits || 0) & IN.ACTION) && Math.hypot(ped.x - q.x, ped.y - q.y) <= MEDIC.treatR;
    c.treat = held ? c.treat + dt : Math.max(0, c.treat - dt * 0.5);
    if (c.treat >= MEDIC.treatS) {
      c.treated = true; q.hp = q.maxHp || 100;
      world.emit(q.x, q.y, { e: 'heal', x: q.x, y: q.y });
      if (c.k === 'minor') { endCall(world, p, true, `You patched up ${c.who} - they're on their way.`); return; }
      c.onAt = now; j.text = `Medical call: ${c.who} is stable - bring the ambulance alongside, then to a hospital`;
      world.notify(p, `${c.who[0].toUpperCase()}${c.who.slice(1)} is stable. Bring the ambulance alongside to get them aboard.`, 'good');
      p.meDirty = true;
    } else if (now - c.at > (c.k === 'serious' ? MEDIC.lifeS.serious : MEDIC.lifeS.minor)) {
      if (c.k === 'serious') { q.hp = 0; combat.kill(world, q, null, 'wounds'); }
      else endCall(world, p, false, `${c.who[0].toUpperCase()}${c.who.slice(1)} gave up waiting and limped off.`);
      return;
    }
    return;
  }
  // stable: aboard when the ambulance is alongside, then to a hospital
  if (!c.aboard) {
    if (Math.hypot(v.x - q.x, v.y - q.y) < 160 && Math.hypot(v.vx, v.vy) < 40) {
      const seat = v.seats.findIndex((s, i) => i > 0 && !s);
      if (seat < 0) return;
      v.seats[seat] = q.id; q.vehId = v.id; q.seat = seat; q.downUntil = 0;
      c.aboard = true; c.onAt = now; c.from = { x: q.x, y: q.y };
      world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
      const h = hospitalFor(world, p);
      j.text = `Medical call: get ${c.who} to a hospital${h ? ` - ${h.label} is nearest` : ''}`;
      p.meDirty = true;
    }
    return;
  }
  if (q.vehId !== v.id) { endCall(world, p, false, 'The patient left the ambulance.'); return; }
  if (now - c.onAt > MEDIC.rideS) { endCall(world, p, false, `${c.who[0].toUpperCase()}${c.who.slice(1)} didn't make it to the hospital.`); return; }
  if (Math.hypot(v.vx, v.vy) > 30) return;
  const h = hospitals(world.map).find((o) => Math.hypot(o.x - v.x, o.y - v.y) < MEDIC.hospitalR);
  if (!h) return;
  const km = Math.hypot(h.x - c.from.x, h.y - c.from.y) / 1000;
  endCall(world, p, true, `${c.who[0].toUpperCase()}${c.who.slice(1)} is handed over at ${h.label}.`, MEDIC.pay.perKm * km);
}

// ---- every tick --------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  for (const p of world.players.values()) if (p.job && p.job.type === 'medic') step(world, p, dt);
}

// ---- the page's view of it (phone.js jobTarget) ------------------------------------------------------------------------
export function target(world, p, j) {
  const c = j.call;
  if (!c) { const v = world.get(j.truck), at = v || j.base; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  if (c.aboard) { const v = world.get(j.truck), h = v ? hospitals(world.map).reduce((a, b) => (Math.hypot(b.x - v.x, b.y - v.y) < Math.hypot(a.x - v.x, a.y - v.y) ? b : a)) : null; if (h) return { text: j.text, x: Math.round(h.x), y: Math.round(h.y), stage: 'go' }; }
  const q = world.get(c.patient);
  return { text: j.text, x: Math.round(q ? q.x : c.x), y: Math.round(q ? q.y : c.y), stage: j.stage };
}

// ---- dev ('medicjob'): on the rota, your ambulance beside you, a call of kind msg.k beside you
export function devMedic(world, p, msg) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  const k = msg.k === 'serious' ? 'serious' : 'minor';
  if (p.job && p.job.type !== 'medic') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const j = p.job;
  if (j.call) endCall(world, p, false, '[dev] call dropped');
  const at = openNear(world.map, ped.x + 50, ped.y) || { x: ped.x + 50, y: ped.y };
  const c = callAt(world, p, k, { x: at.x, y: at.y, name: '' });
  if (!c) return 'no room for a patient here';
  const v = world.get(j.truck), sp = openNear(world.map, ped.x - 120, ped.y);
  if (v && sp && !ped.vehId) { v.x = sp.x; v.y = sp.y; v.vx = 0; v.vy = 0; world.place(v); }
  j.nextAt = world.time + MEDIC.gapS;
  return null;
}
