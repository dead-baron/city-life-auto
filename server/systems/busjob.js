// The bus driver (H72; the owner, 2026-10-11: "Let's add more jobs for players trying to make an honest living"). Sign
// on at any stop of a bus line (Act by its shelter) or from the phone's job list (the line nearest you): a City Bus in
// the line's livery is issued on the line's street just before that stop (yours like a work truck: jobs.js - the ring,
// the arrows). Drive the line's loop (transit.js busLines: its stops in order; the job tracker points to the next one,
// with when it's due). People wait at the next stop's shelter (BUSJOB.wait of them, each going a few stops on); pull up
// at the stop (stopped within haltR) and the doors open: whoever's for this stop gets off, the ones waiting walk over and
// board (each pays perPax - the fare), and after dwellS with everyone aboard it's on to the next. A stop made on time
// (by its timetable - the leg at BUSJOB.speed, the dwell, late s grace) pays perStop; late, nothing for the stop. Once
// round the loop, the shift's done (the bus back to where it was issued: the return bonus).
//   update(world, dt)           the shifts (world.js SYSTEMS)
//   start(world, p, L, k)       sign on for line L (default: the nearest) at its stop k -> error | null
//   interaction(world, p)       Act at a stop: sign on
//   target(world, p, j)         the job tracker's target (phone.js jobTarget)
//   lineFor(world, p)           { L, k } the line and stop nearest p
import { K } from '../../shared/constants.js';
import { BUSJOB } from '../../shared/rules.js';
import { lanePath } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { openNear } from './firefighter.js';
import { busLines } from './transit.js';
import * as jobs from './jobs.js';

export function lineFor(world, p) {
  let best = null, bd = Infinity;
  const at = p.ped || { x: 0, y: 0 };
  for (const L of busLines(world)) L.stops.forEach((s, k) => { const d = Math.hypot(s.sx - at.x, s.sy - at.y); if (d < bd) { bd = d; best = { L, k, d }; } });
  return best;
}

// where the bus pulls up for stop k: { x, y, a } (on its kerb lane, the way the line runs)
export function stopPose(world, L, k) {
  const net = world.map.net, st = L.stops[k], e = net.edges[st.edge], q = pointAt(lanePath(net, e, st.from, 0), st.s);
  return { x: q.x, y: q.y, a: Math.atan2(q.ty, q.tx) };
}
// the bus on the line's street a little before stop k (or the stop before's street), clear of traffic
function placeBus(world, L, k) {
  const net = world.map.net, st = L.stops[k];
  const tries = [];
  L.steps.forEach((s, i) => { if (s.stops.includes(k)) tries.push([i, Math.max(40, st.s - 260)]); });
  for (let i = 0; i < L.steps.length; i++) { const e = net.edges[L.steps[i].edge]; if (e.len > 260) tries.push([i, e.len / 2]); }
  for (const [i, s] of tries.slice(0, 40)) {
    const step = L.steps[i], e = net.edges[step.edge], lp = lanePath(net, e, step.from, 0), q = pointAt(lp, Math.min(s, lp[lp.length - 1].s - 30));
    if (world.query(q.x, q.y, 130, K.VEH).length) continue;
    return world.spawnVehicle('bus', q.x, q.y, Math.atan2(q.ty, q.tx), { npcOwned: false, paint: L.paint });
  }
  return null;
}

// ---- signing on --------------------------------------------------------------------------------------------------------
export function start(world, p, L = null, k = -1) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  if (!L) { const n = lineFor(world, p); if (!n) return 'No bus lines here.'; L = n.L; k = n.k; }
  if (k < 0) k = 0;
  const v = placeBus(world, L, k);
  if (!v) return 'No room for a bus on the line just now - try again in a moment.';
  v.npcOwned = false; v.parked = false; v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;
  v.returnTo = { x: Math.round(v.x), y: Math.round(v.y), label: `the ${L.stops[k].name} stop` };
  p.job = { type: 'bus', stage: 'go', truck: v.id, line: L.id, k, due: 0, served: 0, dwell: 0, atStop: -1, pax: [], wait: [], late: 0, onTime: 0, riders: 0, expires: world.time + 7200, text: '' };
  p.job.due = world.time + 60 + Math.hypot(v.x - L.stops[k].x, v.y - L.stops[k].y) / BUSJOB.speed;
  waitAt(world, p, L, k);
  setText(world, p, L);
  world.notify(p, `You drive the ${L.name} today: your bus is the green ring, on the line by the ${L.stops[k].name} stop. Pull up at each stop to let people off and on - and keep to the timetable.`, 'good');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const n = lineFor(world, p);
  if (!n || n.d > 130) return null;
  return { label: `Sign on to drive the ${n.L.name} (a bus is issued)`, run: () => { const err = start(world, p, n.L, n.k); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the passengers ----------------------------------------------------------------------------------------------------
// people waiting at stop k's shelter, each going 1-3 stops on
function waitAt(world, p, L, k) {
  const j = p.job, st = L.stops[k], [lo, hi] = BUSJOB.wait, n = lo + Math.floor(world.rand() * (hi - lo + 1));
  for (let i = 0; i < n; i++) {
    const at = openNear(world.map, st.sx + (i - n / 2) * 18, st.sy);
    if (!at) continue;
    const q = spawnNpc(world, 'casual', at.x, at.y, 'civ');
    q.npc.sar = p.pid; q.npc.keep = true; q.vx = 0; q.vy = 0;
    q.a = Math.atan2(st.y - q.y, st.x - q.x);
    j.wait.push({ id: q.id, to: (k + 1 + Math.floor(world.rand() * Math.min(3, L.stops.length - 1))) % L.stops.length });
    (world.busRiders ||= new Map()).set(q.id, p.pid);
  }
}
function letGo(world, id) {
  const q = world.get(id);
  if (world.busRiders) world.busRiders.delete(id);
  if (!q || q.removed) return;
  if (q.vehId) { const v = world.get(q.vehId); if (v) { const i = v.seats.indexOf(q.id); if (i >= 0) v.seats[i] = 0; } q.vehId = 0; q.seat = -1; }
  despawnNpc(world, q);
}
function alight(world, v, q, st) {
  const i = v.seats.indexOf(q.id);
  if (i >= 0) v.seats[i] = 0;
  q.vehId = 0; q.seat = -1;
  const out = openNear(world.map, st.sx, st.sy) || { x: st.sx, y: st.sy };
  q.x = out.x; q.y = out.y; q.lz = 0;
  q.npc.sar = 0; q.npc.keep = false; q.npc.state = 'wander';
  if (world.busRiders) world.busRiders.delete(q.id);
  world.place(q);
}
function setText(world, p, L) {
  const j = p.job, st = L.stops[j.k], left = Math.round(j.due - world.time);
  j.text = `Bus: ${L.name} - next stop ${st.name} (${left >= 0 ? `due in ${left}s` : `${-left}s late`}) · ${j.pax.length} aboard`;
}

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped, L = busLines(world)[j.line];
  const v = world.get(j.truck);
  if (!L || !v || v.removed || v.wreckAt) { endShift(world, p); jobs.failJob(world, p, 'The bus is lost. You\'re off the rota.'); return; }
  const st = L.stops[j.k];
  const driving = ped && ped.vehId === v.id && ped.seat === 0, speed = Math.hypot(v.vx, v.vy);
  const at = driving && speed < 25 && Math.hypot(v.x - st.x, v.y - st.y) < BUSJOB.haltR;
  if (!at) {
    if (j.atStop >= 0) { j.atStop = -1; j.dwell = 0; v.doorsOpen = false; }
    if (world.tick % 20 === 5) { const was = j.text; setText(world, p, L); if (was !== j.text) p.meDirty = true; }
    return;
  }
  if (j.atStop !== j.k) {   // pulled up: the doors open, whoever's for here gets off, the stop on time or not
    j.atStop = j.k; j.dwell = 0; v.doorsOpen = true;
    j.arrived = now - j.due;
    const off = j.pax.filter((x) => x.to === j.k);
    for (const x of off) { const q = world.get(x.id); if (q && !q.removed && q.vehId === v.id) alight(world, v, q, st); }
    j.pax = j.pax.filter((x) => x.to !== j.k);
    world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
    if (off.length) world.notify(p, `${st.name}: ${off.length} getting off.`, 'info');
    p.meDirty = true;
  }
  j.dwell += dt;
  // the ones waiting walk over and get on (one at a time, by the door on the kerb side; held up getting there, they squeeze on)
  const c = Math.cos(v.a), sn = Math.sin(v.a), side = (st.sx - v.x) * -sn + (st.sy - v.y) * c >= 0 ? 1 : -1;
  const door = { x: v.x + c * v.def.L * 0.3 - sn * (v.def.W / 2 + 10) * side, y: v.y + sn * v.def.L * 0.3 + c * (v.def.W / 2 + 10) * side };
  let boarded = 0;
  for (const x of j.wait) {
    const q = world.get(x.id);
    if (!q || q.removed || q.dead) { x.gone = true; continue; }
    const d = Math.hypot(door.x - q.x, door.y - q.y);
    if (d > 26 && j.dwell < 14) { const k = Math.min(1, (110 * dt) / d); q.x += (door.x - q.x) * k; q.y += (door.y - q.y) * k; q.a = Math.atan2(door.y - q.y, door.x - q.x); world.place(q); break; }
    const seat = v.seats.findIndex((s, i) => i > 0 && !s);
    if (seat < 0) { if (!j.fullSaid) { j.fullSaid = true; world.notify(p, 'The bus is full - the rest wait for the next one.', 'warn'); } x.gone = true; letGo(world, q.id); continue; }
    v.seats[seat] = q.id; q.vehId = v.id; q.seat = seat; q.vx = 0; q.vy = 0;
    j.pax.push({ id: q.id, to: x.to }); x.gone = true; boarded++;
    p.profile.cash += BUSJOB.perPax; j.riders++;
    break;
  }
  if (boarded) { j.wait = j.wait.filter((x) => !x.gone); world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y }); p.meDirty = true; }
  else j.wait = j.wait.filter((x) => !x.gone);
  if (j.wait.length || j.dwell < BUSJOB.dwellS) return;
  // served: paid for the stop if on time; on to the next
  const onTime = j.arrived <= BUSJOB.late;
  if (onTime) { p.profile.cash += BUSJOB.perStop; j.onTime++; } else j.late++;
  j.served++; j.fullSaid = false;
  world.notify(p, onTime ? `${st.name} on time: +$${BUSJOB.perStop}.` : `${st.name}: ${Math.round(j.arrived)}s late - nothing for the stop.`, onTime ? 'good' : 'warn');
  store.touch();
  if (j.served >= L.stops.length) {
    world.notify(p, `Shift done: round the ${L.name}, ${j.onTime} of ${j.served} stops on time, ${j.riders} passengers.`, 'good');
    endShift(world, p);
    jobs.jobDone(world, p);
    return;
  }
  const nk = (j.k + 1) % L.stops.length, nx = L.stops[nk];
  j.due = now + (Math.hypot(nx.x - st.x, nx.y - st.y) * 1.3) / BUSJOB.speed + 10;
  j.k = nk; j.atStop = -1; j.dwell = 0; v.doorsOpen = false;
  waitAt(world, p, L, nk);
  setText(world, p, L);
  p.meDirty = true;
}
// off shift: everyone off the bus, the waiting go home
function endShift(world, p) {
  const j = p.job;
  if (!j) return;
  for (const x of [...j.pax, ...j.wait]) letGo(world, x.id);
  j.pax = []; j.wait = [];
}

// ---- every tick --------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.busRiders && world.tick % 20 === 11) for (const [id, pid] of [...world.busRiders]) {
    const p = world.players.get(pid);
    if (!p || !p.job || p.job.type !== 'bus') letGo(world, id);
  }
  for (const p of world.players.values()) if (p.job && p.job.type === 'bus') step(world, p, dt);
}

// ---- the page's view of it (phone.js jobTarget) ------------------------------------------------------------------------
export function target(world, p, j) {
  const L = busLines(world)[j.line], st = L && L.stops[j.k];
  return { text: j.text, x: Math.round(st ? st.x : 0), y: Math.round(st ? st.y : 0), stage: 'go' };
}

// ---- dev ('busjob'): on the nearest line, the bus pulled up at its next stop with you at the wheel
export function devBus(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'bus') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const j = p.job, v = world.get(j.truck), L = busLines(world)[j.line];
  if (!v || !L || ped.vehId) return null;
  const at = stopPose(world, L, j.k);
  v.x = at.x; v.y = at.y; v.a = at.a; v.vx = 0; v.vy = 0; world.place(v);
  if (!v.seats[0]) { v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true; }
  return null;
}
