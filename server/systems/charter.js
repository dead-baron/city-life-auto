// Charter pilot (H59; the owner, 2026-10-11: "Private helicopter pilot for rich billionaire customers flying around the
// world from location to location"). Take it from the phone's job list: a charter company's helicopter (the Skylark,
// shared/vehicles.js heli) is issued to you at the nearest helipad (like a work truck: jobs.js - yours, the ring and the
// arrows). Bookings, one after another (shared/rules.js CHARTER): a rich customer (invented names) waiting at one of the
// places a helicopter goes - a helipad, the airport's apron, an airstrip, a mansion's lawn in the rich districts, the
// islands (placesOf: from the built map, never coordinates) - wants flying to another one far off. Land near them and
// they climb in; land at the destination and they step out: the fare by the distance, and a tip for a smooth flight -
// no hard landings, no knocks or gunfire on the way (the helicopter's health), and quick.
//   update(world, dt)       the bookings (world.js SYSTEMS)
//   start(world, p)         sign on -> error | null
//   target(world, p, j)     the job tracker's target (phone.js jobTarget)
//   placesOf(m)             [{ x, y, name, kind }] where customers wait and go
//   bookAt(world, p, a, b)  a booking from place a to place b (tests, the dev menu)
import { K, T, TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/mapcore.js';
import { airfields, findPadSpot, floorAt, FLY } from '../../shared/flight.js';
import { CHARTER } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import * as jobs from './jobs.js';

const rng = mulberry32(7272);
const FIRST = ['Sterling', 'Margaux', 'Thaddeus', 'Celestine', 'Barnaby', 'Ottoline', 'Lucian', 'Imogen', 'Cornelius', 'Seraphina', 'Ambrose', 'Delphine'];
const LAST = ['Vanderholt', 'Ellery-Price', 'Ashcombe', 'Fairbrook', 'Montclair', 'Wexley', 'Harrowgate', 'Pemberton-Lyle', 'Castellane', 'Redmayne'];
const WHY = ['a board meeting', 'lunch on the islands', 'a yacht party', 'a charity gala', 'a round of golf', 'a property viewing', 'a polo match', 'the opera', 'a wine tasting', 'a spa weekend'];
const ISLAND = /Key|Isle|Island/;
const NOT_THERE = new Set(["Smuggler's Rock", 'Prison Island']);

// ---- where customers wait and go (once per map; nothing added to the map) ------------------------------------------------
const PLACES = new WeakMap();
export function placesOf(m) {
  let L = PLACES.get(m);
  if (L) return L;
  L = [];
  const af = airfields(m);
  for (const p of af.pads) if (!p.roof && p.kind === 'airport') L.push({ x: p.x, y: p.y, name: p.name, kind: 'pad' });
  for (const a of af.aprons) if (!L.some((q) => q.name === a.name)) L.push({ x: a.x, y: a.y, name: a.name, kind: 'apron' });
  // a mansion's lawn in each rich district; a landing spot on each island (the first clear ground a sweep finds)
  const seen = new Set();
  for (let ty = m.y0 + 3; ty < m.y0 + m.h - 3; ty += 6) for (let tx = m.x0 + 3; tx < m.x0 + m.w - 3; tx += 6) {
    const di = m.dist[m.idx(tx, ty)], d = DISTRICTS[di];
    if (!d || seen.has(di) || NOT_THERE.has(d.isl)) continue;
    const lawn = d.style === 'luxury', isle = ISLAND.test(d.isl || '');
    if (!lawn && !isle) continue;
    const t = m.tileAt(tx, ty);
    if (t !== T.GRASS && t !== T.SAND && t !== T.DIRT && t !== T.PLAZA) continue;
    const x = tx * TILE + TILE / 2, y = ty * TILE + TILE / 2;
    if (!findPadSpot(m, x, y, 70, 0)) continue;
    seen.add(di);
    L.push({ x, y, name: lawn ? `a mansion's lawn in ${d.name}` : `${d.name} on ${d.isl}`, kind: lawn ? 'lawn' : 'island' });
  }
  PLACES.set(m, L);
  return L;
}

// ---- signing on ------------------------------------------------------------------------------------------------------------
export function start(world, p) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const m = world.map, ped = p.ped;
  const pads = airfields(m).pads.filter((q) => !q.roof);
  if (!pads.length || placesOf(m).length < 2) return 'No charters today.';
  const pad = pads.reduce((a, b) => (Math.hypot(b.x - ped.x, b.y - ped.y) < Math.hypot(a.x - ped.x, a.y - ped.y) ? b : a));
  const avoid = world.query(pad.x, pad.y, 900, K.VEH).map((q) => ({ x: q.x - 110, y: q.y - 110, w: 220, h: 220 }));
  const spot = findPadSpot(m, pad.x, pad.y, 64, 900, avoid) || findPadSpot(m, pad.x, pad.y, 48, 1400);
  if (!spot) return 'No room to park a helicopter there.';
  const v = world.spawnVehicle('heli', spot.x, spot.y, -Math.PI / 2, { npcOwned: false });
  v.alt = 0; v.parked = false; v.npcOwned = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;   // (the company's: yours to fly, not theft)
  v.returnTo = { x: spot.x, y: spot.y, label: pad.name };
  p.job = { type: 'charter', stage: 'wait', truck: v.id, nextAt: world.time + CHARTER.firstS, expires: world.time + CHARTER.shiftS, flown: 0, text: 'Charter pilot: waiting for a booking' };
  world.notify(p, `You fly charters now: the company's helicopter is by ${pad.name} (the green ring). Bookings come over the phone - pick the customer up, fly them there smoothly and they tip.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}

// a booking from place a to place b
export function bookAt(world, p, a, b) {
  const j = p.job;
  const spot = findPadSpot(world.map, a.x + 60, a.y + 60, 14, 200) || { x: a.x + 60, y: a.y + 60 };
  const ped = spawnNpc(world, 'executive', spot.x, spot.y, 'civ');
  ped.npc.sar = p.pid; ped.npc.keep = true;   // (stays put, waiting: npc.js leaves them to us)
  ped.vx = 0; ped.vy = 0;
  const name = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`, why = WHY[Math.floor(rng() * WHY.length)];
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const fare = Math.round((CHARTER.base + (dist / 1000) * CHARTER.perKm) / 5) * 5;
  j.trip = { a: { x: a.x, y: a.y, name: a.name }, b: { x: b.x, y: b.y, name: b.name }, who: name, why, cust: ped.id, fare, dist, at: world.time, aboard: false, boardedAt: 0, hard: 0, hurt: 0, hp0: 0, landAt: 0, board: 0 };
  j.stage = 'pickup';
  (world.charterCust ||= new Map()).set(p.pid, ped.id);
  j.text = `Charter: pick up ${name} at ${a.name} (to ${b.name})`;
  world.notify(p, `Booking: ${name} is waiting at ${a.name} - ${why} at ${b.name}. Fare $${fare}, and they tip for a smooth ride.`, 'good');
  p.meDirty = true;
  return j.trip;
}
function newBooking(world, p) {
  const L = placesOf(world.map), ped = p.ped;
  const near = L.filter((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < CHARTER.pickupMax);
  const a = (near.length ? near : L)[Math.floor(rng() * (near.length || L.length))];
  const far = L.filter((q) => q !== a && Math.hypot(q.x - a.x, q.y - a.y) >= CHARTER.minTrip);
  const b = far.length ? far[Math.floor(rng() * far.length)] : L.find((q) => q !== a);
  if (!a || !b) { p.job.nextAt = world.time + 30; return null; }
  return bookAt(world, p, a, b);
}
function endTrip(world, p, msg, tone) {
  const j = p.job, t = j && j.trip;
  if (t) { const c = world.get(t.cust); if (c && !c.removed) dropCust(world, c); }
  if (world.charterCust) world.charterCust.delete(p.pid);
  if (j) { j.trip = null; j.stage = 'wait'; j.nextAt = world.time + CHARTER.gapS; j.text = 'Charter pilot: waiting for the next booking'; }
  if (msg) world.notify(p, msg, tone || 'info');
  p.meDirty = true;
}
function dropCust(world, c) {
  if (c.vehId) { const v = world.get(c.vehId); if (v) { const i = v.seats.indexOf(c.id); if (i >= 0) v.seats[i] = 0; } c.vehId = 0; c.seat = -1; }
  despawnNpc(world, c);
}

// ---- every tick ------------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.charterCust) for (const [pid, id] of world.charterCust) {
    const p = world.players.get(pid);
    if (p && p.job && p.job.type === 'charter' && p.job.trip && p.job.trip.cust === id) continue;
    const c = world.get(id);
    if (c && !c.removed) dropCust(world, c);
    world.charterCust.delete(pid);
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'charter') step(world, p, dt);
}
const landed = (world, v) => (v.alt || 0) <= floorAt(world.map, v.x, v.y) + 1 && Math.hypot(v.vx, v.vy) < 30;
function step(world, p, dt) {
  const j = p.job, now = world.time;
  const v = world.get(j.truck);
  if (!v || v.removed || v.wreckAt) { jobs.failJob(world, p, 'The charter helicopter is lost. You\'re off the books.'); return; }
  if (!j.trip) { if (now >= j.nextAt && p.ped && !p.ped.dead) newBooking(world, p); return; }
  const t = j.trip, c = world.get(t.cust);
  if (!c || c.removed || c.dead) { endTrip(world, p, 'The booking fell through.', 'bad'); return; }
  if (!t.aboard) {
    if (now - t.at > CHARTER.waitS) { endTrip(world, p, `${t.who} got tired of waiting and booked someone else.`, 'bad'); return; }
    const d = Math.hypot(v.x - c.x, v.y - c.y);
    c.a = Math.atan2(v.y - c.y, v.x - c.x);
    if (!(landed(world, v) && d < CHARTER.landR)) { t.board = 0; return; }
    t.board += dt;
    const k = Math.min(1, (80 * dt) / Math.max(1, d - 40));
    if (d > 46) { c.x += (v.x - c.x) * k; c.y += (v.y - c.y) * k; world.place(c); }
    if (d > 46 && t.board < CHARTER.boardS + d / 80) return;
    const seat = v.seats.findIndex((s, i) => i > 0 && !s);
    if (seat < 0) { if (!t.warned) { t.warned = true; world.notify(p, 'No free seat for your customer - let your passengers off.', 'warn'); } return; }
    v.seats[seat] = c.id; c.vehId = v.id; c.seat = seat; c.vx = 0; c.vy = 0;
    t.aboard = true; t.boardedAt = now; t.hp0 = v.hp; t.landAt = v.landAt || 0; j.stage = 'go';
    j.text = `Charter: fly ${t.who} to ${t.b.name}`;
    world.notify(p, `${t.who} is aboard. "${t.b.name}, please - and do keep it smooth."`, 'good');
    world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
    p.meDirty = true;
    return;
  }
  if (c.vehId !== v.id) { endTrip(world, p, `${t.who} got out. No fare.`, 'bad'); return; }
  // the ride: hard landings, knocks and gunfire (the helicopter's health) cost the tip
  if ((v.landAt || 0) > t.landAt) { t.landAt = v.landAt; if (v.landSink > FLY.HARD_SINK) { t.hard++; world.notify(p, `${t.who}: "Good heavens! Must you land like that?"`, 'warn'); } }
  if (v.hp < t.hp0 - 1) { t.hurt += t.hp0 - v.hp; t.hp0 = v.hp; }
  if (!landed(world, v) || Math.hypot(v.x - t.b.x, v.y - t.b.y) > CHARTER.destR) return;
  // there: the fare and the tip
  const par = CHARTER.parS + t.dist / CHARTER.perKmS, took = now - t.boardedAt;
  const quick = Math.max(0, Math.min(1, (par * 1.6 - took) / (par * 0.6)));
  const smooth = t.hard ? 0 : Math.max(0, 1 - t.hurt / CHARTER.hurtHp);
  const tip = Math.round((t.fare * CHARTER.tip * smooth * (0.4 + 0.6 * quick)) / 5) * 5;
  const prof = p.profile;
  prof.cash += t.fare + tip;
  j.flown++;
  j.lastPay = { fare: t.fare, tip, hard: t.hard, hurt: Math.round(t.hurt) };
  j.expires = Math.max(j.expires, now + CHARTER.shiftS / 2);
  world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
  const say = tip ? (tip >= t.fare * CHARTER.tip * 0.8 ? '"Splendid flight. Keep the change."' : '"Adequate. Here\'s a little something."') : t.hard ? '"I\'ll be speaking to your company about that landing."' : smooth < 0.5 ? '"That was hardly a smooth ride."' : '"You took your time."';
  endTrip(world, p, `${t.who} steps out at ${t.b.name}. ${say} Fare $${t.fare}${tip ? ` + $${tip} tip` : ', no tip'}.`, tip ? 'good' : 'info');
  store.touch();
}

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------------
export function target(world, p, j) {
  const t = j.trip, v = world.get(j.truck);
  if (!t) { const at = v || p.ped || { x: 0, y: 0 }; return { text: j.text, x: Math.round(at.x), y: Math.round(at.y), stage: 'wait' }; }
  if (!t.aboard) { const c = world.get(t.cust); return { text: j.text, x: Math.round(c ? c.x : t.a.x), y: Math.round(c ? c.y : t.a.y), stage: 'pickup', dest: [Math.round(t.b.x), Math.round(t.b.y)] }; }
  return { text: j.text, x: Math.round(t.b.x), y: Math.round(t.b.y), stage: 'go' };
}
