// The forklift driver (the owner's notes 2: "Jobs - Forklift driver"; the brief: "at the port / warehouses, move
// pallets with a drivable forklift (lift, carry, stack) to marked spots, paid per load"). Sign on at a yard - the
// forklifts parked about the port's container yard and the warehouses, or a warehouse's door (Act there: the job's card)
// or from the phone's Jobs app - and the yard's forklift is issued like a work truck (jobs.js workTruck: yours, the
// green ring). A row of pallets waits on the yard's open ground and a row of bays is marked a little way off, two
// pallets to a bay, the second stacked on the first. Drive the fork tips up to a pallet and Act: the forks go under it
// and lift it; drive it to the marked bay and Act again: the forks rise to the stack's height if there's one there and
// set it down. Paid per pallet (shared/rules-work.js FORK), more for one stacked, a bonus for the lot.
//   start(world, p, yard)          sign on -> error | null
//   interaction(world, p)          on foot at a yard: sign on (the card)
//   vehicleInteraction(world, p)   at the forklift's wheel: lift a pallet / set it down
//   update(world, dt)              the forks rising and falling (world.js SYSTEMS)
//   target(world, p, j)            the job tracker's target (phone.js jobTarget)
//   yardFor(world, x, y)           the yard nearest (x, y)
//   forkStage(v)                   the forks' height as the wire carries it (net.js: a forklift's extra byte, bits 3-4)
import { K, T } from '../../shared/constants.js';
import { CAR_SPAWN_BLOCK } from '../../shared/map.js';
import { FORK } from '../../shared/rules-work.js';
import { slotWorld } from './cargo.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';

// ---- the yards -----------------------------------------------------------------------------------------------------------
// the forklifts the map parks about its yards (props), one yard for any within 500 px of each other; the warehouses' doors
const YARDS = new WeakMap();
export function yardsOf(m) {
  let L = YARDS.get(m);
  if (L) return L;
  L = [];
  for (const q of m.props || []) {
    if (!q || q.t !== 'forklift' || L.some((y) => Math.hypot(y.x - q.x, y.y - q.y) < 500)) continue;
    const d = m.districtAt(q.x, q.y);
    if (d && d.style === 'airport') continue;   // (the airport apron's ground crews' forklifts: not a yard)
    L.push({ x: q.x, y: q.y, name: `the ${d && d.name ? d.name + ' ' : ''}yard` });
  }
  for (const q of m.pois || []) if (q.kind === 'warehouse' && !L.some((y) => Math.hypot(y.x - q.x, y.y - q.y) < 500)) L.push({ x: q.x, y: q.y, name: q.label, poi: true });
  YARDS.set(m, L);
  return L;
}
export function yardFor(world, x, y) {
  const L = yardsOf(world.map);
  return L.length ? L.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)) : null;
}

// open ground a forklift drives on, nothing parked on it
const open = (world, x, y, r = 30) => {
  const m = world.map;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) { const t = m.tileAtPx(x + dx, y + dy); if (CAR_SPAWN_BLOCK[t] || t === T.WATER || t === T.DEEP || t === T.BRIDGE) return false; }
  return !world.query(x, y, r + 20, K.VEH).length && !world.query(x, y, r, K.CRATE).length;
};
// the yard's layout for a shift: a row of pallets along one axis and a row of bays parallel to it FORK.yard px off, each
// with room in front for the forks to come at it -> { pallets: [{x, y}], bays: [{x, y}], a (the way the forks face them) }
export function layout(world, yard) {
  const n = FORK.pallets, nb = Math.ceil(n / 2);
  for (let r = 0; r <= 640; r += 40) for (let k = 0; k < (r ? 16 : 1); k++) {
    const cx = yard.x + Math.cos(k * Math.PI / 8) * r, cy = yard.y + Math.sin(k * Math.PI / 8) * r;
    for (const [ax, ay] of [[1, 0], [0, 1]]) for (const D of [FORK.yard[0], (FORK.yard[0] + FORK.yard[1]) / 2, FORK.yard[1]]) for (const s of [1, -1]) {
      const px = -ay * s, py = ax * s;   // (the way across the rows: pallets at the centre, bays D px that way)
      const row = (x0, y0, m, gap) => Array.from({ length: m }, (_, i) => ({ x: x0 + ax * (i - (m - 1) / 2) * gap, y: y0 + ay * (i - (m - 1) / 2) * gap }));
      const P = row(cx, cy, n, FORK.rowGap), B = row(cx + px * D, cy + py * D, nb, FORK.bayGap);
      // (each pallet faced from the bays' side, each bay from the pallets' side: room for the forklift there)
      if (P.every((q) => open(world, q.x, q.y, 18) && open(world, q.x + px * 60, q.y + py * 60, 26)) && B.every((q) => open(world, q.x, q.y, 22) && open(world, q.x - px * 60, q.y - py * 60, 26)))
        return { pallets: P, bays: B.map((q) => ({ ...q, n: 0, top: 0 })), a: Math.atan2(-py, -px) };
    }
  }
  return null;
}

// ---- signing on ---------------------------------------------------------------------------------------------------------
export function start(world, p, yard = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  yard = yard || yardFor(world, p.ped.x, p.ped.y);
  if (!yard) return 'No yard is taking on drivers today.';
  const L = layout(world, yard);
  if (!L) return 'The yard is too busy to take anyone on just now.';
  p.job = { type: 'forklift', stage: 'pickup', truck: 0, yard: { x: yard.x, y: yard.y, name: yard.name }, pallets: [], bays: L.bays, done: 0, earned: 0, expires: world.time + FORK.shiftS, text: '' };
  const v = jobs.workTruck(world, p, L.pallets[0], 'forklift', { label: yard.name });
  if (!v) { p.job = null; return 'No room to park a forklift there.'; }
  for (const q of L.pallets) {
    const c = world.spawnCrate(1, q.x, q.y, { owner: p.pid, label: 'Pallet', value: FORK.perLoad, contraband: false, job: { type: 'forklift', pid: p.pid } });
    c.heavy = true; c.a = L.a + Math.PI / 2; c.expires = world.time + FORK.shiftS + 120;   // (too heavy to lift by hand: cargo.js nearestCrate)
    p.job.pallets.push(c.id);
  }
  setText(p);
  world.notify(p, `Forklift shift at ${yard.name}: your forklift is the green ring. Drive the fork tips up to a pallet and Act to lift it, take it to the marked bay and Act to set it down - two to a bay, the second stacked.`, 'good', 'Forklift: lift a pallet, set it down in the bay');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const y = yardsOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < (q.poi ? 110 : 90));
  if (!y) return null;
  return { label: 'Sign on as a forklift driver (a forklift is issued)', card: { id: 'forklift', where: y.name, start: () => start(world, p, y) }, run: () => { const err = start(world, p, y); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the work ------------------------------------------------------------------------------------------------------------
const left = (world, j) => j.pallets.map((id) => world.get(id)).filter((c) => c && !c.removed && !c.placed);
function setText(p) {
  const j = p.job, n = j.done, of = FORK.pallets;
  j.text = j.stage === 'carry' ? `Forklift: set the pallet down in bay ${nextBay(j) + 1} (${n}/${of})` : `Forklift: lift a pallet with the forks (${n}/${of})`;
}
// the bay the next pallet goes to: the first not full, the stack's second before a new one
const nextBay = (j) => { const i = j.bays.findIndex((b) => b.n === 1); return i >= 0 ? i : j.bays.findIndex((b) => b.n < 2); };
// the job's pallet on the ground in reach of v's fork tips (the top one of a stack)
function palletAtForks(world, v, j) {
  const [fx, fy] = slotWorld(v, 0);
  let best = null;
  for (const c of world.query(fx, fy, FORK.reach + 20, K.CRATE)) {
    if (c.state !== 'ground' || !c.heavy || c.placed || (j && !j.pallets.includes(c.id)) || Math.hypot(c.x - fx, c.y - fy) > FORK.reach) continue;
    if (!best || c.z > best.z) best = c;
  }
  return best;
}
export function vehicleInteraction(world, p) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  if (!v || v.def.id !== 'forklift' || ped.seat !== 0 || v.forkOp) return null;
  const j = p.job && p.job.type === 'forklift' ? p.job : null;
  if (Math.hypot(v.vx, v.vy) > FORK.slowPx) return null;
  const c = v.cargo[0] ? world.get(v.cargo[0]) : null;
  if (c) {
    const bi = j ? bayAtForks(v, j) : -1;
    if (bi >= 0) return { label: j.bays[bi].n ? `Stack the pallet in bay ${bi + 1}` : `Set the pallet down in bay ${bi + 1}`, run: () => setDown(world, p, v, bi) };
    return { label: 'Set the pallet down here', run: () => setDown(world, p, v, -1) };
  }
  const q = palletAtForks(world, v, j);
  if (q) return { label: 'Lift the pallet', run: () => lift(world, p, v, q) };
  return null;
}
function bayAtForks(v, j) {
  const [fx, fy] = slotWorld(v, 0);
  return j.bays.findIndex((b) => b.n < 2 && Math.hypot(b.x - fx, b.y - fy) < FORK.bayR);
}
function lift(world, p, v, c) {
  if (v.cargo[0] || c.state !== 'ground') return;
  for (const q of world.query(c.x, c.y, 30, K.CRATE)) if (q.on === c.id && q.state === 'ground') { world.notify(p, 'There\'s a pallet stacked on that one - take the top one first.', 'warn'); return; }
  c.touched = true; c.state = 'loaded'; c.parent = v.id; c.slot = 0; c.vx = c.vy = c.vz = 0; c.on = 0;
  v.cargo[0] = c.id;
  v.forkZ = c.z || 0; v.forkOp = { k: 'lift', to: FORK.carryZ };
  for (const b of (p.job && p.job.bays) || []) if (b.top === c.id) { b.n = Math.max(0, b.n - 1); b.top = 0; }
  world.emit(v.x, v.y, { e: 'thud', x: c.x, y: c.y });
  if (p.job && p.job.type === 'forklift') { p.job.stage = 'carry'; setText(p); p.meDirty = true; }
}
function setDown(world, p, v, bi) {
  const c = world.get(v.cargo[0]);
  if (!c) return;
  const j = p.job && p.job.type === 'forklift' ? p.job : null, b = bi >= 0 && j ? j.bays[bi] : null;
  const under = b && b.n ? world.get(b.top) : null;
  v.forkOp = { k: 'drop', to: under ? (under.z || 0) + FORK.palletH : 0, bay: bi, on: under ? under.id : 0, pid: p.pid };
}
// the pallet comes off the forks where they are: on the ground, or on the one under it
function release(world, v, op) {
  const c = world.get(v.cargo[0]);
  v.cargo[0] = 0;
  if (!c) return;
  const p0 = world.players.get(op.pid), b0 = op.bay >= 0 && p0 && p0.job && p0.job.bays ? p0.job.bays[op.bay] : null;
  const [fx, fy] = b0 ? [b0.x, b0.y] : slotWorld(v, 0);   // (in a bay: squared up on it, a stack straight)
  c.state = 'ground'; c.parent = 0; c.x = fx; c.y = fy; c.z = op.to; c.vz = 0; c.a = v.a + Math.PI / 2; c.on = op.on || 0;
  world.place(c);
  world.emit(fx, fy, { e: 'thud', x: fx, y: fy });
  const p = world.players.get(op.pid), j = p && p.job && p.job.type === 'forklift' ? p.job : null;
  if (!j) return;
  if (op.bay >= 0 && j.pallets.includes(c.id)) {
    const b = j.bays[op.bay];
    b.n++; b.top = c.id;
    c.placed = true; c.expires = world.time + 240;   // (in its bay: done with - the yard's own crew clears it later)
    const pay = FORK.perLoad + (op.on ? FORK.stack : 0);
    p.profile.cash += pay; j.done++; j.earned += pay;
    world.emit(fx, fy, { e: 'cash', x: fx, y: fy });
    if (!left(world, j).length) {
      p.profile.cash += FORK.bonus;
      world.notify(p, `All ${FORK.pallets} pallets in their bays! +$${pay} and a $${FORK.bonus} bonus - $${j.earned + FORK.bonus} this shift.`, 'good');
      store.touch();
      jobs.jobDone(world, p);
      return;
    }
    world.notify(p, `${op.on ? 'Stacked' : 'Set down'} in bay ${op.bay + 1}. +$${pay}.`, 'good');
    store.touch();
  }
  j.stage = 'pickup'; setText(p); p.meDirty = true;
}

// ---- every tick: the forks rising or falling, the pallet on them with them ---------------------------------------------
export function update(world, dt) {
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'forklift') continue;
    const v = world.get(j.truck);
    if (!v || v.removed || v.wreckAt) { cleanup(world, j); jobs.failJob(world, p, 'The forklift is wrecked. Shift over.'); continue; }
    if (world.time > j.expires - 1) { world.notify(p, `Shift over: ${j.done} pallet${j.done === 1 ? '' : 's'} moved, $${j.earned}.`, j.done ? 'good' : 'info'); cleanup(world, j); jobs.jobDone(world, p); continue; }
    // (a pallet knocked off the forks or lost: back to the row's count)
    if (j.stage === 'carry' && !v.cargo[0] && !v.forkOp) { j.stage = 'pickup'; setText(p); p.meDirty = true; }
    if (!left(world, j).length && !v.cargo[0]) { world.notify(p, 'The pallets are gone - shift over.', 'bad'); jobs.jobDone(world, p); }
  }
  for (const v of world.entities.values()) {
    if (v.kind !== K.VEH || v.def.id !== 'forklift') continue;
    const op = v.forkOp;
    if (op) {
      if (op.k === 'drop' && Math.hypot(v.vx, v.vy) > FORK.slowPx) { v.forkOp = { k: 'lift', to: FORK.carryZ }; continue; }   // (driven off mid-way: the forks back to carrying)
      const rate = (FORK.palletH + FORK.carryZ) / FORK.liftS, z = v.forkZ || 0, d = op.to - z;
      v.forkZ = Math.abs(d) <= rate * dt ? op.to : z + Math.sign(d) * rate * dt;
      if (v.forkZ === op.to) {
        if (op.k === 'drop' && v.cargo[0]) { release(world, v, op); v.forkOp = { k: 'lower', to: 0 }; }
        else v.forkOp = null;
      }
    }
    const c = v.cargo[0] ? world.get(v.cargo[0]) : null;
    if (c) c.z = v.forkZ || 0;
  }
}
// the job's pallets not yet in a bay: gone with the shift
function cleanup(world, j) {
  for (const id of j.pallets || []) { const c = world.get(id); if (c && !c.placed && c.state !== 'loaded') world.remove(c); }
}
// the forks' height for the wire: 0 down, 1 carrying, 2 up a pallet's height (the stack's second), 3 higher (net.js)
export const forkStage = (v) => { const z = v.forkZ || 0; return z < 1.5 ? 0 : z < FORK.palletH / 2 ? 1 : z < FORK.palletH * 1.5 ? 2 : 3; };

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------
export function target(world, p, j) {
  const v = world.get(j.truck);
  if (j.stage === 'carry') { const b = j.bays[Math.max(0, nextBay(j))]; return { text: j.text, x: Math.round(b.x), y: Math.round(b.y), stage: 'go' }; }
  const [fx, fy] = v ? slotWorld(v, 0) : [j.yard.x, j.yard.y];
  const L = left(world, j).filter((c) => c.state === 'ground').sort((a, b) => Math.hypot(a.x - fx, a.y - fy) - Math.hypot(b.x - fx, b.y - fy));
  const c = L[0];
  return { text: j.text, x: Math.round(c ? c.x : j.yard.x), y: Math.round(c ? c.y : j.yard.y), stage: 'pickup' };
}

// ---- dev ('forklift'): on a shift at the nearest yard, at the forklift's wheel ---------------------------------------------
export function devFork(world, p, k = '') {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'forklift') jobs.failJob(world, p, '[dev] job dropped');
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const v = world.get(p.job.truck);
  if (v && !ped.vehId && !v.seats[0]) { v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true; }
  // k 'lift': the forks under the nearest pallet, lifted; 'bay': carried up to the next bay
  const at = (x, y, a) => { const f = v.def.slots[0][0]; v.x = x - Math.cos(a) * f; v.y = y - Math.sin(a) * f; v.a = a; v.vx = v.vy = 0; world.place(v); ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); };
  if (v && (k === 'lift' || k === 'bay') && !v.cargo[0]) { const t = target(world, p, p.job); at(t.x, t.y, Math.PI / 2); const q = palletAtForks(world, v, p.job); if (q) lift(world, p, v, q); }
  if (v && k === 'bay' && v.cargo[0]) { const b = p.job.bays[Math.max(0, nextBay(p.job))]; at(b.x, b.y, -Math.PI / 2); }
  return null;
}
