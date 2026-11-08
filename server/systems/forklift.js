// The forklift driver (the owner's notes 2: "Jobs - Forklift driver"; the brief: "at the port / warehouses, move
// pallets with a drivable forklift (lift, carry, stack) to marked spots, paid per load"; the owner, 11-06: "We should have
// it make you take the pallets further away into a clear marked loading bay area"). Sign on at a yard - by its forklift
// or its pallets, a warehouse's door (Act there: the job's card) or from the phone's Jobs app - and the yard's forklift
// is issued like a work truck (jobs.js markIssued: yours, the ring). The yard's pallets wait in their row and its
// loading bay is across the yard, a short real drive away (shared/loadbays.js: the generator plans both, and the way
// between, clear of everything, for every yard - m.loadBays; the art paints the bay's numbered slots, its hazard stripes
// and LOADING BAY, and stands its sign and its floodlight), two pallets to a slot, the second stacked on the first.
// Drive the fork tips up to a pallet and Act: the forks go under it and lift it; drive it to the bay and Act at the slot
// lit up for you (the server picks it - target's slot; client/jobway.js draws it): the forks rise to the stack's height
// if there's one there and set it down. Paid per pallet by how far the bay is (shared/rules-work.js FORK), more for one
// stacked, a bonus for the lot. Quit from the phone (the HUD's job card opens it): the pallets and the forklift go back.
//   start(world, p, yard)          sign on -> error | null
//   interaction(world, p)          on foot at a yard: sign on (the card)
//   vehicleInteraction(world, p)   at the forklift's wheel: lift a pallet / set it down
//   update(world, dt)              the forks rising and falling (world.js SYSTEMS)
//   target(world, p, j)            the job tracker's target (phone.js jobTarget): the pallet, then the slot (slot: its box)
//   yardFor(world, x, y)           the yard nearest (x, y)
//   palletPay(yard)                what a pallet pays at that yard (FORK.perLoad + FORK.perTile a tile of the way)
//   endShift(world, j)             the job's pallets cleared away (quit, lost, over: jobs.js failJob)
//   forkStage(v)                   the forks' height as the wire carries it (net.js: a forklift's extra byte, bits 4-5; bit 3 is a hitched trailer)
import { K } from '../../shared/constants.js';
import { FORK } from '../../shared/rules-work.js';
import { BAY, routeTiles } from '../../shared/loadbays.js';
import { slotWorld } from './cargo.js';
import { store } from '../store.js';
import * as jobs from './jobs.js';

// ---- the yards -----------------------------------------------------------------------------------------------------------
// one for each loading bay the map has (m.loadBays: shared/loadbays.js) - { x, y, name, poi, bay (its index), len }
const YARDS = new WeakMap();
export function yardsOf(m) {
  let L = YARDS.get(m);
  if (L) return L;
  L = (m.loadBays || []).map((b, i) => ({ ...b.yard, bay: i, len: b.len }));
  YARDS.set(m, L);
  return L;
}
export function yardFor(world, x, y) {
  const L = yardsOf(world.map);
  return L.length ? L.reduce((a, b) => (Math.hypot(b.x - x, b.y - y) < Math.hypot(a.x - x, a.y - y) ? b : a)) : null;
}
export const palletPay = (yard) => FORK.perLoad + Math.round(FORK.perTile * (yard ? yard.len : BAY.aim));
const bayOf = (world, yard) => (world.map.loadBays || [])[yard.bay] || null;

// open ground a forklift drives on, nothing parked on it (a pallet's spot, the forklift's place)
const open = (world, x, y, r) => !world.query(x, y, r + 20, K.VEH).some((v) => !v.removed && !v.wreckAt && Math.hypot(v.vx, v.vy) < 30) && !world.query(x, y, r, K.CRATE).some((c) => !c.removed && c.state === 'ground');
// the yard's layout for a shift: its pallets' row and its bay's slots (m.loadBays) -> { pallets, bays, a (the way the forks
// face the pallets), park ({ x, y, a }: the forklift's place on the apron, its fork tips just short of the row) } | null
export function layout(world, yard) {
  const B = bayOf(world, yard);
  if (!B) return null;
  const P = B.pick, a = Math.atan2(P.fy, P.fx), back = 72;
  if (!P.pallets.every((q) => open(world, q.x, q.y, 18))) return null;
  return { pallets: P.pallets, bays: B.bay.slots.map((q) => ({ x: q.x, y: q.y, n: 0, top: 0 })), a, park: { x: P.x - P.fx * back, y: P.y - P.fy * back, a } };
}
// a yard's bay in use: another driver's shift there
const busy = (world, yard, p) => [...world.players.values()].some((q) => q !== p && q.job && q.job.type === 'forklift' && q.job.bay === yard.bay);

// ---- signing on ---------------------------------------------------------------------------------------------------------
export function start(world, p, yard = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - quit it first (tap the job card).';
  yard = yard || yardFor(world, p.ped.x, p.ped.y);
  if (!yard) return 'No yard is taking on drivers today.';
  if (busy(world, yard, p)) return `Another driver's working the bay at ${yard.name} - try another yard, or come back in a bit.`;
  clearBay(world, yard);   // (the last shift's pallets: the yard's crew has taken them in)
  const L = layout(world, yard);
  if (!L) return 'The yard is too busy to take anyone on just now.';
  const pay = palletPay(yard);
  p.job = { type: 'forklift', stage: 'pickup', truck: 0, bay: yard.bay, yard: { x: yard.x, y: yard.y, name: yard.name }, pallets: [], bays: L.bays, pay, done: 0, earned: 0, aboard: false, expires: world.time + FORK.shiftS, text: '' };
  const v = issue(world, p, L, yard);
  if (!v) { p.job = null; return 'No room to park a forklift there.'; }
  for (const q of L.pallets) {
    const c = world.spawnCrate(1, q.x, q.y, { owner: p.pid, label: 'Pallet', value: pay, contraband: false, job: { type: 'forklift', pid: p.pid } });
    c.heavy = true; c.a = L.a + Math.PI / 2; c.expires = world.time + FORK.shiftS + 120;   // (too heavy to lift by hand: cargo.js nearestCrate)
    p.job.pallets.push(c.id);
  }
  setText(world, p);
  world.notify(p, `Forklift shift at ${yard.name}: your forklift's by the pallets. Lift one on the forks, carry it across the yard to the loading bay and set it down in the slot that's lit - two to a slot, the second stacked. $${pay} a pallet. Tap the job card to quit.`, 'good', 'Forklift: pallets to the loading bay');
  p.meDirty = true;
  store.touch();
  return null;
}
// the yard's forklift, parked on the apron facing the pallets (or the nearest free one, or one parked near: jobs.js)
function issue(world, p, L, yard) {
  const k = L.park, label = { label: yard.name };
  if (open(world, k.x, k.y, 30)) { const v = world.spawnVehicle('forklift', k.x, k.y, k.a, { npcOwned: false }); if (v) return jobs.markIssued(world, p, v, label); }
  return jobs.workTruck(world, p, k, 'forklift', label);
}
// the pallets a shift before left in the bay's slots: gone (taken in by the yard's crew)
function clearBay(world, yard) {
  const B = bayOf(world, yard);
  if (!B) return;
  for (const s of B.bay.slots) for (const c of world.query(s.x, s.y, 40, K.CRATE)) if (c.heavy && c.placed && c.label === 'Pallet' && c.state === 'ground') world.remove(c);
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const y = yardsOf(world.map).find((q) => { const B = bayOf(world, q); return Math.hypot(q.x - ped.x, q.y - ped.y) < (q.poi ? 110 : 90) || (B && Math.hypot(B.pick.x - ped.x, B.pick.y - ped.y) < 150); });
  if (!y) return null;
  return { label: 'Sign on as a forklift driver (a forklift is issued)', card: { id: 'forklift', where: y.name, start: () => start(world, p, y) }, run: () => { const err = start(world, p, y); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the work ------------------------------------------------------------------------------------------------------------
const left = (world, j) => j.pallets.map((id) => world.get(id)).filter((c) => c && !c.removed && !c.placed);
function setText(world, p) {
  const j = p.job, n = j.done, of = FORK.pallets, v = world.get(j.truck);
  j.aboard = !!(v && p.ped && p.ped.vehId === v.id);
  j.text = j.stage === 'carry' ? `Forklift: take it to the loading bay - slot ${nextBay(j) + 1} (${n}/${of})`
    : !j.aboard && !n ? 'Forklift: get on your forklift - tap this card to quit'
    : !j.aboard ? `Forklift: back on your forklift (${n}/${of})`
    : `Forklift: lift a pallet with the forks (${n}/${of})`;
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
    if (bi >= 0) return { label: j.bays[bi].n ? `Stack the pallet in slot ${bi + 1}` : `Set the pallet down in slot ${bi + 1}`, run: () => setDown(world, p, v, bi) };
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
  if (p.job && p.job.type === 'forklift') { p.job.stage = 'carry'; setText(world, p); p.meDirty = true; }
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
    const pay = (j.pay || palletPay(null)) + (op.on ? FORK.stack : 0);
    p.profile.cash += pay; j.done++; j.earned += pay;
    world.emit(fx, fy, { e: 'cash', x: fx, y: fy });
    if (!left(world, j).length) {
      p.profile.cash += FORK.bonus;
      world.notify(p, `All ${FORK.pallets} pallets in the bay! +$${pay} and a $${FORK.bonus} bonus - $${j.earned + FORK.bonus} this shift.`, 'good');
      store.touch();
      jobs.jobDone(world, p);
      return;
    }
    world.notify(p, `${op.on ? 'Stacked' : 'Set down'} in slot ${op.bay + 1}. +$${pay}.`, 'good');
    store.touch();
  }
  j.stage = 'pickup'; setText(world, p); p.meDirty = true;
}

// ---- every tick: the forks rising or falling, the pallet on them with them ---------------------------------------------
export function update(world, dt) {
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'forklift') continue;
    const v = world.get(j.truck);
    if (!v || v.removed || v.wreckAt) { jobs.failJob(world, p, 'The forklift is wrecked. Shift over.'); continue; }
    if (world.time > j.expires - 1) { world.notify(p, `Shift over: ${j.done} pallet${j.done === 1 ? '' : 's'} moved, $${j.earned}.`, j.done ? 'good' : 'info'); endShift(world, j); jobs.jobDone(world, p); continue; }
    // (a pallet knocked off the forks or lost: back to the row's count)
    if (j.stage === 'carry' && !v.cargo[0] && !v.forkOp) { j.stage = 'pickup'; setText(world, p); p.meDirty = true; }
    if (j.aboard !== !!(p.ped && p.ped.vehId === v.id)) { setText(world, p); p.meDirty = true; }   // (on the forklift, or off it: the line says so)
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
// The shift's over (quit, the forklift lost, its time up): its pallets not in the bay go (the one on the forks too - off
// them, the forks down), those set down stay a while (the yard's crew takes them in: clearBay). jobs.js failJob calls it
// for every way a job ends undone (the forklift's recalled there).
export function endShift(world, j) {
  const v = j.truck ? world.get(j.truck) : null;
  if (v && !v.removed && v.cargo && v.cargo[0] && j.pallets.includes(v.cargo[0])) { v.cargo[0] = 0; v.forkOp = { k: 'lower', to: 0 }; }
  for (const id of j.pallets || []) { const c = world.get(id); if (c && !c.removed && !c.placed) world.remove(c); else if (c && c.placed) c.expires = Math.min(c.expires || Infinity, world.time + 90); }
}
jobs.onFailSet('forklift', endShift);
// the forks' height for the wire: 0 down, 1 carrying, 2 up a pallet's height (the stack's second), 3 higher (net.js)
export const forkStage = (v) => { const z = v.forkZ || 0; return z < 1.5 ? 0 : z < FORK.palletH / 2 ? 1 : z < FORK.palletH * 1.5 ? 2 : 3; };

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------
export function target(world, p, j) {
  const v = world.get(j.truck);
  if (j.stage === 'carry') {
    const i = Math.max(0, nextBay(j)), b = j.bays[i], B = (world.map.loadBays || [])[j.bay];
    // (the slot lit up for you: its middle, the way the forks go in, its size - client/jobway.js draws it)
    return { text: j.text, x: Math.round(b.x), y: Math.round(b.y), stage: 'go', slot: [Math.round(b.x), Math.round(b.y), B ? B.bay.fx : 0, B ? B.bay.fy : -1, BAY.slotW, BAY.slotD, i + 1] };
  }
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
  // k 'lift': the forks under the nearest pallet, lifted; 'bay': carried up to the next slot
  const at = (x, y, a) => { const f = v.def.slots[0][0]; v.x = x - Math.cos(a) * f; v.y = y - Math.sin(a) * f; v.a = a; v.vx = v.vy = 0; world.place(v); ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); };
  const B = (world.map.loadBays || [])[p.job.bay];
  if (v && (k === 'lift' || k === 'bay' || k === 'drive') && !v.cargo[0]) { const t = target(world, p, p.job); at(t.x, t.y, B ? Math.atan2(B.pick.fy, B.pick.fx) : Math.PI / 2); const q = palletAtForks(world, v, p.job); if (q) lift(world, p, v, q); }
  // 'drive': a pallet on the forks, half way along the way to the bay (shared/loadbays.js route), heading along it
  if (v && k === 'drive' && B && v.cargo[0]) { const R = routeTiles(B.route), i = R.length >> 1, a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i)], h = Math.atan2(b[1] - a[1], b[0] - a[0]) || 0, f = v.def.slots[0][0]; at((a[0] + 0.5) * 32 + Math.cos(h) * f, (a[1] + 0.5) * 32 + Math.sin(h) * f, h); }
  if (v && k === 'bay' && v.cargo[0]) { const b = p.job.bays[Math.max(0, nextBay(p.job))]; at(b.x, b.y, B ? Math.atan2(B.bay.fy, B.bay.fx) : -Math.PI / 2); }
  return null;
}
