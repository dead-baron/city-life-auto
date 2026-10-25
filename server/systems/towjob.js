// The tow truck driver (H72; the owner, 2026-10-11: "Let's add more jobs for players trying to make an honest living").
// Sign on at a police station's impound lot (Act by its doors) or from the phone's job list: a Tow Truck is issued
// like a work truck (jobs.js workTruck: yours, the ring, the arrows). Calls, one after another (shared/rules.js TOWJOB):
// a wreck or a car broken down in the street that the city's own tow service would come for (tow.js towReason), or,
// with none about, a car that's broken down at the kerb. Drive there and back up to it - stopped with your tail
// touching either end of it (within touch px: tow.js tailGap, as the NPC trucks do) - and the winch takes it up onto
// the wheel lift (hookS; tow.js carry hangs it behind the boom, that end up). Tow it to the nearest impound lot (a
// police station: stopped within yardR) and it's paid: pay + perKm a 1000 px towed.
//   update(world, dt)         the shifts (world.js SYSTEMS)
//   start(world, p, yard)     sign on -> error | null
//   interaction(world, p)     Act at an impound lot: sign on
//   target(world, p, j)       the job tracker's target (phone.js jobTarget)
//   yardFor(world, x, y)      the impound lot nearest (x, y)
//   callAt(world, p, v)       a call to tow vehicle v (tests, the dev menu)
import { K } from '../../shared/constants.js';
import { TOWJOB } from '../../shared/rules.js';
import { store } from '../store.js';
import { despawnNpc } from './npc.js';
import { towReason, tailGap, carry } from './tow.js';
import { sitesOf } from './firefighter.js';
import { kerbFor } from './kerbdrive.js';
import * as jobs from './jobs.js';

export const yardsOf = (m) => m.pois.filter((q) => q.kind === 'police').map((q) => ({ x: q.x, y: q.y, name: `the impound at ${q.label}` }));
export function yardFor(world, x, y) {
  const L = yardsOf(world.map);
  return L.length ? L.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)) : null;
}
const CARS = ['sedan', 'compact', 'van', 'pickup', 'sedan'];

// ---- signing on --------------------------------------------------------------------------------------------------------
export function start(world, p, yard = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  yard = yard || yardFor(world, p.ped.x, p.ped.y);
  if (!yard) return 'Nobody needs a tow truck today.';
  p.job = { type: 'towjob', stage: 'wait', truck: 0, base: yard, nextAt: world.time + TOWJOB.firstS, expires: world.time + TOWJOB.shiftS, done: 0, call: null, text: 'Tow truck: waiting for a call' };
  const v = jobs.workTruck(world, p, yard, 'towtruck', { label: yard.name });
  if (!v) { p.job = null; return 'No room to park a tow truck there.'; }
  world.notify(p, `You drive a tow truck out of ${yard.name}: it's the green ring. Calls come over the phone - back up to the car until your tail touches it, and the winch does the rest.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const y = yardsOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 150);
  if (!y) return null;
  return { label: 'Sign on as a tow truck driver (a truck is issued)', card: { id: 'towjob', where: y.name, start: () => start(world, p, y) }, run: () => { const err = start(world, p, y); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the calls ---------------------------------------------------------------------------------------------------------
function newCall(world, p) {
  const t = world.get(p.job.truck), at = t || p.ped;
  let best = null, bd = Infinity;
  for (const v of world.query(at.x, at.y, 4000, K.VEH)) {
    if (v === t || v.towCall || v.towedBy || !towReason(world, v)) continue;
    const d = Math.hypot(v.x - at.x, v.y - at.y);
    if (d > 500 && d < bd) { bd = d; best = v; }
  }
  if (!best) {   // nothing about: a car broken down at the kerb somewhere near
    const S = sitesOf(world.map).kerb.filter((q) => { const d = Math.hypot(q.x - at.x, q.y - at.y); return d > 700 && d < 3500; });
    for (let tries = 0; tries < 8 && S.length && !best; tries++) {
      const q = S[Math.floor(world.rand() * S.length)];
      if (world.query(q.x, q.y, 110, K.VEH).length) continue;
      best = world.spawnVehicle(CARS[Math.floor(world.rand() * CARS.length)], q.x, q.y, q.a || 0, { npcOwned: true });
      best.hp = best.def.hp * 0.2; best.brokeDown = true;
    }
  }
  if (!best || !callAt(world, p, best)) p.job.nextAt = world.time + 10;
}
// a call to tow v -> the call | null
export function callAt(world, p, v) {
  const j = p.job;
  if (!v || v.removed || v.towedBy) return null;
  v.towCall = j.truck; v.despawnable = false; v.parked = false;   // (the city's own trucks leave it to you)
  const c = { veh: v.id, at: world.time, hook: 0, hooked: false, from: null, what: v.wreckAt ? `a burnt-out ${v.def.name}` : `a broken-down ${v.def.name}` };
  j.call = c; j.stage = 'go';
  const where = world.map.districtAt(v.x, v.y);
  j.text = `Tow truck: ${c.what}${where ? ` in ${where.name}` : ''} - back up to it`;
  world.notify(p, `Tow call: ${c.what}${where ? ` in ${where.name}` : ''}. It's marked - back up to it to hook it.`, 'good');
  p.meDirty = true;
  return c;
}
function endCall(world, p, msg, tone) {
  const j = p.job, c = j && j.call;
  if (c) { const v = world.get(c.veh); if (v && !v.removed) { if (v.towedBy === j.truck) v.towedBy = 0; if (v.towCall === j.truck) v.towCall = 0; v.despawnable = true; } }
  if (j) { j.call = null; j.stage = 'wait'; j.nextAt = world.time + TOWJOB.gapS; j.text = 'Tow truck: waiting for the next call'; }
  if (msg) world.notify(p, msg, tone || 'info');
  p.meDirty = true;
}

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped;
  const t = world.get(j.truck);
  if (!t || t.removed || t.wreckAt) { endCall(world, p); jobs.failJob(world, p, 'The tow truck is lost. You\'re off the rota.'); return; }
  const c = j.call;
  if (!c) {
    if (now >= j.expires) { world.notify(p, `Shift over: ${j.done} tow${j.done === 1 ? '' : 's'}.`, 'good'); jobs.jobDone(world, p); return; }
    if (now >= j.nextAt && ped && !ped.dead) newCall(world, p);
    return;
  }
  const v = world.get(c.veh);
  if (!v || v.removed) { endCall(world, p, 'The car\'s gone - someone else dealt with it.', 'bad'); return; }
  if (!c.hooked) {
    if (v.seats.some((s) => s && world.get(s)?.player)) { endCall(world, p, 'Someone drove it off.', 'bad'); return; }
    const driving = ped && ped.vehId === t.id && ped.seat === 0;
    const gap = tailGap(t, v);
    if (!driving || Math.hypot(t.vx, t.vy) > 20 || gap > TOWJOB.touch) { if (c.hook) { c.hook = 0; t.beaconOn = false; } return; }
    if (!c.hook) { world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id }); world.notify(p, 'Touching - working the winch...', 'info'); }
    c.hook += dt; t.beaconOn = true;
    if (c.hook < TOWJOB.hookS) return;
    // hooked: whichever end the tail is at goes up on the wheel lift
    for (const sid of v.seats) { const q = sid && world.get(sid); if (q && q.npc) despawnNpc(world, q); }
    v.seats.fill(0); v.ai = null;
    const ct = Math.cos(t.a), st = Math.sin(t.a), rx = t.x - ct * t.def.L / 2, ry = t.y - st * t.def.L / 2;
    const nose = Math.hypot(v.x + Math.cos(v.a) * v.def.L / 2 - rx, v.y + Math.sin(v.a) * v.def.L / 2 - ry), tail = Math.hypot(v.x - Math.cos(v.a) * v.def.L / 2 - rx, v.y - Math.sin(v.a) * v.def.L / 2 - ry);
    v.towedBy = t.id; v.towEnd = nose <= tail ? 1 : -1; v.towFrom = { x: v.x, y: v.y, a: v.a, at: now };
    c.hooked = true; c.from = { x: v.x, y: v.y }; t.beaconOn = false;
    world.emit(t.x, t.y, { e: 'tow', x: t.x, y: t.y, id: t.id, hooked: 1 });
    const y = yardFor(world, t.x, t.y);
    j.stage = 'tow'; j.text = `Tow truck: take the ${v.def.name} to ${y ? y.name : 'the impound'}`;
    world.notify(p, `Hooked. Tow it to ${y ? y.name : 'the impound'} - it's marked.`, 'good');
    p.meDirty = true;
    return;
  }
  if (v.towedBy !== t.id) { endCall(world, p, 'The car came off the hook.', 'bad'); return; }
  if (Math.hypot(t.vx, t.vy) > 25) return;
  const y = yardFor(world, t.x, t.y);
  if (!y || Math.hypot(t.x - y.x, t.y - y.y) > TOWJOB.yardR) return;
  const pay = Math.round((TOWJOB.pay + (Math.hypot(y.x - c.from.x, y.y - c.from.y) / 1000) * TOWJOB.perKm) / 5) * 5;
  p.profile.cash += pay;
  j.done++; j.lastPay = pay;
  j.expires = Math.max(j.expires, now + TOWJOB.shiftS / 3);
  world.remove(v);
  world.emit(t.x, t.y, { e: 'cash', x: t.x, y: t.y });
  j.call = null;
  endCall(world, p, `The ${v.def.name} is in the impound. +$${pay}.`, 'good');
  store.touch();
}

// ---- every tick (after the physics: what you're towing back on the hook) ------------------------------------------------
export function update(world, dt) {
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'towjob') continue;
    step(world, p, dt);
    const c = p.job && p.job.call, t = c && c.hooked && world.get(p.job.truck), v = t && world.get(c.veh);
    if (v && v.towedBy === t.id) { carry(t, v, world.time); world.place(v); }
  }
}

// ---- the page's view of it (phone.js jobTarget) ------------------------------------------------------------------------
export function target(world, p, j) {
  const c = j.call, t = world.get(j.truck);
  if (!c) { const at = t || j.base; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  const v = world.get(c.veh);
  if (c.hooked && t) { const y = yardFor(world, t.x, t.y); if (y) return { text: j.text, x: Math.round(y.x), y: Math.round(y.y), stage: 'go' }; }
  return { text: j.text, x: Math.round(v ? v.x : 0), y: Math.round(v ? v.y : 0), stage: 'pickup' };
}

// ---- dev ('towjob'): on the rota, a broken-down car in the street by you, your truck backed up to it, you at the wheel
export function devTow(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'towjob') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  if (p.job.call) endCall(world, p);
  const t = world.get(p.job.truck), k = kerbFor(world, ped.x, ped.y);
  if (!t || !k.e || ped.vehId) { newCall(world, p); return null; }
  const car = world.spawnVehicle('sedan', k.x, k.y, k.a || 0, { npcOwned: true });
  car.hp = car.def.hp * 0.2; car.brokeDown = true;
  const off = car.def.L / 2 + t.def.L / 2 + 6, c = Math.cos(car.a), s = Math.sin(car.a);
  t.x = car.x + c * off; t.y = car.y + s * off; t.a = car.a; t.vx = 0; t.vy = 0; world.place(t);
  if (!t.seats[0]) { t.seats[0] = ped.id; ped.vehId = t.id; ped.seat = 0; ped.x = t.x; ped.y = t.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true; }
  callAt(world, p, car);
  return null;
}
