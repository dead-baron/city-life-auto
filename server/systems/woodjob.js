// Firewood orders (the owner's notes 2, 10-24, of the bundles of firewood cut off a felled tree: "you can deliver that
// somewhere that purchases wood, or is part of a job"). At a sawmill or a lumber yard (Act there: the job's card) or on
// the phone's Jobs board, an order: a diner, a cafe, a bar, a hotel or a camp wants a few bundles for its stove or its
// fire - fell a tree and cut it up (felling.js), or take bundles off the stack in your garage (homeups.js), and bring
// them there, carried or on the back of a truck: paid per bundle (more than the mill pays), a bonus for the lot.
//   p.job: { type: 'wood', n, done, to (the customer's poi id), tx, ty, pay (per bundle), expires, text }
//   p.woodOffer: the order on offer to you (the card and the board show the same one)
import { WOODJOB } from '../../shared/rules-play.js';
import { store } from '../store.js';
import * as phone from './phone.js';

// who buys firewood, by their kind of place: what they burn it in
const BURNS = { diner: 'its wood-fired grill', cafe: 'its bread oven', bar: 'the fire in the snug', hotel: 'the lobby\'s fireplaces', camp: 'the campfires', hut: 'its stove', clubhouse: 'the fireplace in the lounge' };
const MILL = /sawmill|lumber|timber yard/i;
const lists = new WeakMap();
export function customers(map) {
  let l = lists.get(map);
  if (!l) lists.set(map, (l = map.pois.filter((q) => BURNS[q.kind] && q.label)));
  return l;
}
// the sawmill or lumber yard you're at (on foot), or null
export function millAt(world, x, y) {
  for (const q of world.map.pois) if (MILL.test(q.label || '') && Math.abs(q.x - x) < 140 && Math.abs(q.y - y) < 140 && Math.hypot(q.x - x, q.y - y) < 140) return q;
  return null;
}
// the order on offer to you from (x, y): kept a while so the card and the board agree; a new one once it's taken or old
export function offerFor(world, p, x, y) {
  const o = p.woodOffer;
  if (o && world.time - o.at < 600 && world.map.pois[o.to]) return o;
  const all = customers(world.map);
  if (!all.length) return null;
  const far = all.filter((q) => Math.hypot(q.x - x, q.y - y) > WOODJOB.minD), pool = far.length ? far : all;
  pool.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  const to = pool[Math.floor(world.rand() * Math.min(6, pool.length))];
  const n = WOODJOB.n[0] + Math.floor(world.rand() * (WOODJOB.n[1] - WOODJOB.n[0] + 1));
  p.woodOffer = { at: world.time, to: to.id, n, pay: WOODJOB.per };
  return p.woodOffer;
}
const what = (q) => BURNS[q.kind] || 'its fire';
// the phone's Jobs board and the card: one entry
export function boardEntry(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const o = offerFor(world, p, ped.x, ped.y), to = o && world.map.pois[o.to];
  if (!to) return null;
  const lo = o.n * o.pay;
  return { id: 'wood', kind: 'wood', icon: '🪵', sub: `${to.label} wants firewood for ${what(to)}: fell a tree, cut it into bundles (or take them from your garage) and bring them - carried or on a truck's bed`, pay: lo + WOODJOB.bonus, title: `Firewood order - ${o.n} bundles for ${to.label}`, x: Math.round(to.x), y: Math.round(to.y), lo, hi: lo + WOODJOB.bonus, per: 'the order', step: `Cut ${o.n} bundles of firewood` };
}
export function start(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const o = offerFor(world, p, ped.x, ped.y), to = o && world.map.pois[o.to];
  if (!to) return 'No orders just now.';
  p.woodOffer = null;
  p.job = { type: 'wood', n: o.n, done: 0, to: to.id, tx: to.x, ty: to.y, pay: o.pay, expires: world.time + WOODJOB.limitS, text: `Bring ${o.n} bundles of firewood to ${to.label}` };
  world.notify(p, `Firewood order: ${o.n} bundles for ${to.label} - $${o.pay} a bundle, $${WOODJOB.bonus} more for the lot. Fell a tree and cut it up, or take bundles from your garage.`, 'info');
  p.meDirty = true;
  return null;
}
// at a sawmill or a lumber yard, on foot, nothing in your hands: the order's card (players.findInteraction)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || p.job) return null;
  const mill = millAt(world, ped.x, ped.y);
  if (!mill) return null;
  return { label: `Firewood orders at ${mill.label}`, card: { id: 'wood', where: mill.label, start: () => start(world, p) }, run: () => { if (!phone.offerCard(world, p, { id: 'wood', where: mill.label, start: () => start(world, p) })) { const e = start(world, p); if (e) world.notify(p, e, 'bad'); } } };
}
const left = (j) => j.n - j.done;
const atDoor = (world, j, x, y) => { const q = world.map.pois[j.to]; return q && Math.hypot(q.x - x, q.y - y) < WOODJOB.r ? q : null; };
// carrying a bundle at the customer's door: hand it over (players.findInteraction, before selling it)
export function carryInteraction(world, p, crate) {
  const j = p.job, ped = p.ped;
  if (!j || j.type !== 'wood' || !crate || !crate.wood) return null;
  const q = atDoor(world, j, ped.x, ped.y);
  if (!q) return null;
  return { label: `Hand over the firewood for the order (${j.done + 1}/${j.n}, +$${j.pay})`, run: () => deliver(world, p, [crate]) };
}
// at the wheel by the customer with firewood on the back: unload what the order still wants
export function vehicleInteraction(world, p) {
  const j = p.job, ped = p.ped, v = ped && world.get(ped.vehId);
  if (!j || j.type !== 'wood' || !v || !v.cargo || ped.seat !== 0) return null;
  const wood = v.cargo.map((id) => (id ? world.get(id) : null)).filter((c) => c && c.wood);
  if (!wood.length || !atDoor(world, j, v.x, v.y) || Math.hypot(v.vx, v.vy) > 60) return null;
  const n = Math.min(left(j), wood.length);
  return { label: `Unload ${n} bundle${n === 1 ? '' : 's'} of firewood for the order (+$${n * j.pay}${n === left(j) ? ` +$${WOODJOB.bonus}` : ''})`, run: () => deliver(world, p, wood.slice(0, n)) };
}
function deliver(world, p, crates) {
  const j = p.job, ped = p.ped, prof = p.profile;
  if (!j || j.type !== 'wood') return;
  const take = crates.slice(0, left(j));
  for (const c of take) {
    if (ped.carrying === c.id) ped.carrying = 0;
    const v = c.state === 'loaded' ? world.get(c.parent) : null;
    if (v && v.cargo) v.cargo[c.slot] = 0;
    world.remove(c);
  }
  j.done += take.length;
  let pay = take.length * j.pay;
  const q = world.map.pois[j.to];
  if (!left(j)) {
    pay += WOODJOB.bonus;
    prof.cash += pay; prof.samaritan = (prof.samaritan || 0) + 2;
    (prof.stats ||= {}).woodOrders = (prof.stats.woodOrders || 0) + 1;
    p.job = null;
    world.notify(p, `Order filled: ${q ? q.label : 'they'} thank${q ? 's' : ''} you. +$${pay} (the bonus for the lot too), +2 Samaritan.`, 'good');
  } else {
    prof.cash += pay;
    world.notify(p, `+$${pay} - ${left(j)} more bundle${left(j) === 1 ? '' : 's'} to go.`, 'good');
  }
  world.emit(ped.x, ped.y, { e: 'cash', x: ped.x, y: ped.y });
  p.meDirty = true;
  store.touch();
}
// the HUD's target: cut the wood first (nothing with you), then take it there
export function target(world, p, j) {
  const ped = p.ped, v = ped && ped.vehId ? world.get(ped.vehId) : null;
  const have = (ped && ped.carrying && (world.get(ped.carrying) || {}).wood) || (v && v.cargo && v.cargo.some((id) => id && (world.get(id) || {}).wood));
  const q = world.map.pois[j.to];
  return have ? { text: `Bring the firewood to ${q ? q.label : 'the customer'} (${j.done}/${j.n})`, x: Math.round(j.tx), y: Math.round(j.ty), stage: 'go' }
    : { text: `Cut firewood: ${left(j)} bundle${left(j) === 1 ? '' : 's'} for ${q ? q.label : 'the order'} - fell a tree and cut it up, or take bundles from your garage`, x: Math.round(j.tx), y: Math.round(j.ty), stage: 'gather' };
}
