// The fishing boat (the owner's notes 2: "Jobs - Fishing boat"; the brief: "crew or skipper a fishing boat - head out,
// fish/haul nets or pots at spots, bring the catch back to the dock to sell (fishing already exists for players with rods
// - reuse its fish)"). Sign on at a fish market (Act by its door: the job's card) or from the phone's Jobs app: the
// market's trawler is issued at its quay (yours for the trip, the green ring). Out at sea there are fishing grounds in turn
// (shared/rules-work.js FISHBOAT): a net (Act to shoot it, then keep the boat moving through the ground at trawling speed
// till it's hauled) or a string of pots by their buoys (Act to haul them, the boat held still). Each haul is a Fish Box on
// the deck - a haul of one of the sea's own fish (shared/fish.js: the ones that swim in shoals near the coast and offshore),
// priced as the fish market buys them; the pots bring up crabs and lobsters. Back at the quay, stopped, Act sells the
// catch; anyone else aboard (the crew) is paid a share by the market. The boxes are on an open deck: rivals can take them.
//   start(world, p, mk)            sign on -> error | null
//   interaction(world, p)          on foot at a fish market: sign on (the card)
//   vehicleInteraction(world, p)   at the trawler's wheel: shoot the net / haul the pots / sell the catch
//   update(world, dt)              the hauls (world.js SYSTEMS)
//   target(world, p, j)            the job tracker's target (phone.js jobTarget)
//   marketFor(world, x, y)         the fish market nearest (x, y), with its quay
import { K } from '../../shared/constants.js';
import { WATER_T, BOAT_BLOCK } from '../../shared/mapcore.js';
import { FISH } from '../../shared/fish.js';
import { FISHBOAT } from '../../shared/rules-work.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { seaSites } from './coastguard.js';
import { slotWorld } from './cargo.js';
import * as jobs from './jobs.js';

const rng = mulberry32(8181);
// what a net brings up: the shoaling fish of the coast and the open sea (common and uncommon, the market's price under $100)
const NET_FISH = FISH.filter((f) => f.rare <= 2 && f.pay < 100 && f.waters.some((w) => w === 'shore' || w === 'offshore' || w === 'pier'));

// ---- the markets and their quays ----------------------------------------------------------------------------------------
// a berth for the trawler near a fish market: open water round a hull its size (four headings tried), on the sea
const QUAYS = new WeakMap();
function quayOf(world, mk) {
  let Q = QUAYS.get(world.map);
  if (!Q) QUAYS.set(world.map, (Q = new Map()));
  if (Q.has(mk.id)) return Q.get(mk.id);
  const m = world.map, sea = seaSites(m);
  let best = null;
  for (let r = 60; r <= 2000 && !best; r += 40) for (let k = 0, n = Math.max(8, Math.round(r / 30)); k < n && !best; k++) {
    const x = mk.x + Math.cos(k / n * Math.PI * 2) * r, y = mk.y + Math.sin(k / n * Math.PI * 2) * r;
    if (!WATER_T[m.tileAtPx(x, y)] || BOAT_BLOCK[m.tileAtPx(x, y)]) continue;
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const c = Math.cos(a), s = Math.sin(a);
      if ([[-95, -50], [-95, 50], [95, -50], [95, 50], [0, -50], [0, 50], [-95, 0], [95, 0], [-45, -50], [45, -50], [-45, 50], [45, 50]].some(([f, g]) => { const t = m.tileAtPx(x + c * f - s * g, y + s * f + c * g); return !WATER_T[t] || BOAT_BLOCK[t]; })) continue;
      if (sea.length && !sea.some((q) => Math.hypot(q.x - x, q.y - y) < 6000)) continue;   // (the sea, not a pond behind the market)
      best = { x, y, a };
      break;
    }
  }
  Q.set(mk.id, best);
  return best;
}
const marketsOf = (m) => m.pois.filter((q) => q.kind === 'fishmarket');
export function marketFor(world, x, y) {
  const L = marketsOf(world.map).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  for (const mk of L.slice(0, 4)) { const q = quayOf(world, mk); if (q) return { mk, quay: q }; }
  return null;
}
// the grounds for a trip: FISHBOAT.spots of the sea's points dist[0]-dist[1] px off the quay, apart from each other; net,
// pots, net...
function grounds(world, quay) {
  const S = seaSites(world.map).filter((q) => { const d = Math.hypot(q.x - quay.x, q.y - quay.y); return d >= FISHBOAT.dist[0] && d <= FISHBOAT.dist[1]; });
  const out = [];
  for (let k = 0; k < 60 && out.length < FISHBOAT.spots && S.length; k++) {
    const q = S[Math.floor(rng() * S.length)];
    if (out.some((o) => Math.hypot(o.x - q.x, o.y - q.y) < 500)) continue;
    out.push({ x: Math.round(q.x), y: Math.round(q.y), k: out.length % 2 ? 'pots' : 'net', done: false });
  }
  return out;
}

// ---- signing on ---------------------------------------------------------------------------------------------------------
export function start(world, p, at = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  at = at || marketFor(world, p.ped.x, p.ped.y);
  if (!at) return 'No fish market with a quay near here.';
  const G = grounds(world, at.quay);
  if (!G.length) return 'No fishing grounds within reach of this quay.';
  if (world.query(at.quay.x, at.quay.y, 100, K.VEH).length) return 'The quay is full of boats just now - try again in a minute.';
  const v = world.spawnVehicle('trawler', at.quay.x, at.quay.y, at.quay.a, { npcOwned: false });
  v.parked = false; v.npcOwned = false;
  v.issuedTo = p.pid; v.workTruck = true; v.despawnable = false;
  v.returnTo = { x: Math.round(v.x), y: Math.round(v.y), label: `${at.mk.label}'s quay` };
  p.job = { type: 'fishboat', stage: 'go', truck: v.id, mk: at.mk.id, market: at.mk.label, quay: { x: at.quay.x, y: at.quay.y }, spots: G, i: 0, haul: 0, hauling: false, boxes: [], expires: world.time + FISHBOAT.shiftS, text: '' };
  setText(world, p);
  world.notify(p, `Fishing trip from ${at.mk.label}: the trawler is at the quay (the green ring). Take her out to the marked grounds - shoot the net and keep moving, or stop by the buoys and haul the pots - then bring the catch back to sell. Friends can crew for a share.`, 'good', 'Fishing boat: your trawler is the green ring');
  p.meDirty = true;
  store.touch();
  return null;
}
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  // (on the quayside by the trawler's berth: the market's own door is its shop - economy.js)
  let mk = null, q = null;
  for (const m of marketsOf(world.map)) { if (Math.hypot(m.x - ped.x, m.y - ped.y) > 1300) continue; const b = quayOf(world, m); if (b && Math.hypot(b.x - ped.x, b.y - ped.y) < 230) { mk = m; q = b; break; } }
  if (!mk) return null;
  return { label: 'Sign on as a fishing boat skipper (a trawler is issued)', card: { id: 'fishboat', where: mk.label, start: () => start(world, p, { mk, quay: q }) }, run: () => { const err = start(world, p, { mk, quay: q }); if (err) world.notify(p, err, 'bad'); } };
}

// ---- the trip -----------------------------------------------------------------------------------------------------------
const spot = (j) => j.spots[j.i];
function setText(world, p) {
  const j = p.job, s = spot(j), n = j.boxes.length;
  if (j.stage === 'home') { j.text = `Fishing boat: bring the catch back to ${j.market} (${n} box${n === 1 ? '' : 'es'})`; return; }
  const what = s.k === 'net' ? 'shoot the net' : 'haul the pots';
  j.text = j.hauling ? `Fishing boat: ${s.k === 'net' ? 'trawling - keep her moving' : 'hauling the pots - hold her still'} ${Math.round(100 * j.haul / (s.k === 'net' ? FISHBOAT.netS : FISHBOAT.potS))}%`
    : `Fishing boat: head out to the ${s.k === 'net' ? 'fishing ground' : 'pot buoys'} and ${what} (${j.i + 1}/${j.spots.length})`;
}
const atQuay = (v, j) => Math.hypot(v.x - j.quay.x, v.y - j.quay.y) < FISHBOAT.dockR;
const catchAboard = (world, v, p) => v.cargo.map((id) => world.get(id)).filter((c) => c && c.label === 'Fish Box' && c.job && c.job.pid === p.pid);
export function vehicleInteraction(world, p) {
  const ped = p.ped, j = p.job;
  if (!j || j.type !== 'fishboat' || !ped || ped.vehId !== j.truck || ped.seat !== 0) return null;
  const v = world.get(j.truck);
  if (!v) return null;
  const sp = Math.hypot(v.vx, v.vy);
  if (j.stage === 'home' || (j.boxes.length && atQuay(v, j))) {
    if (!atQuay(v, j) || sp > 40) return null;
    const B = catchAboard(world, v, p);
    if (!B.length) return null;
    return { label: `Sell the catch at ${j.market} (${B.length} box${B.length === 1 ? '' : 'es'}, $${B.reduce((a, c) => a + c.value, 0)})`, run: () => sell(world, p, v) };
  }
  const s = spot(j);
  if (j.hauling || !s || Math.hypot(v.x - s.x, v.y - s.y) > (s.k === 'net' ? FISHBOAT.spotR : FISHBOAT.potR)) return null;
  if (s.k === 'pots' && sp > FISHBOAT.potStill) return null;
  return { label: s.k === 'net' ? 'Shoot the net (then keep her moving)' : 'Haul the pots (hold her still)', run: () => { j.hauling = true; j.haul = 0; world.emit(v.x, v.y, { e: 'splash', x: v.x, y: v.y, n: 10 }); setText(world, p); p.meDirty = true; } };
}
function landHaul(world, p, v) {
  const j = p.job, s = spot(j);
  const slot = v.cargo.findIndex((c, i) => !c && i < v.def.slots.length);
  if (slot < 0) { world.notify(p, 'The deck is full - clear a box off to make room for the haul.', 'warn'); j.haul = 0; return; }
  let label, value, n;
  if (s.k === 'pots') { n = FISHBOAT.fish[0] + Math.floor(rng() * (FISHBOAT.fish[1] - FISHBOAT.fish[0] + 1)); value = n * FISHBOAT.pot; label = `${n} crabs and lobsters`; }
  else { const f = NET_FISH[Math.floor(rng() * NET_FISH.length)]; n = FISHBOAT.fish[0] + Math.floor(rng() * (FISHBOAT.fish[1] - FISHBOAT.fish[0] + 1)); value = n * f.pay; label = `${n} ${f.name}`; }
  const [x, y] = slotWorld(v, slot);
  const c = world.spawnCrate(1, x, y, { owner: p.pid, label: 'Fish Box', value, contraband: false, job: { type: 'fishboat', pid: p.pid } });
  c.state = 'loaded'; c.parent = v.id; c.slot = slot; c.what = label; v.cargo[slot] = c.id;
  j.boxes.push(c.id); s.done = true; j.hauling = false; j.haul = 0;
  world.emit(v.x, v.y, { e: 'splash', x: v.x, y: v.y, n: 16 });
  j.i++;
  if (j.i >= j.spots.length) { j.stage = 'home'; world.notify(p, `Hauled in: ${label} ($${value}). That's the last ground - take her back to ${j.market} to sell.`, 'good'); }
  else world.notify(p, `Hauled in: ${label} ($${value}) on the deck. On to the next ${spot(j).k === 'net' ? 'ground' : 'buoys'}.`, 'good');
  setText(world, p); p.meDirty = true;
}
function sell(world, p, v) {
  const j = p.job, B = catchAboard(world, v, p);
  if (!B.length) return;
  const total = B.reduce((a, c) => a + c.value, 0), full = B.length >= j.spots.length ? FISHBOAT.bonus : 0;
  p.profile.cash += total + full;
  for (const c of B) { v.cargo[c.slot] = 0; world.remove(c); }
  for (let i = 1; i < v.seats.length; i++) {   // the crew: a share each from the market
    const q = v.seats[i] ? world.get(v.seats[i]) : null;
    if (!q || !q.player) continue;
    const share = FISHBOAT.crew * B.length;
    q.player.profile.cash += share; q.player.meDirty = true;
    world.notify(q.player, `The market pays the crew: +$${share} for the catch.`, 'good');
  }
  world.emit(v.x, v.y, { e: 'cash', x: v.x, y: v.y });
  world.notify(p, `${j.market} buys the catch: +$${total}${full ? ` and a $${full} bonus for a full deck` : ''}.`, 'good');
  store.touch();
  jobs.jobDone(world, p);
}

export function update(world, dt) {
  for (const p of world.players.values()) {
    const j = p.job;
    if (!j || j.type !== 'fishboat') continue;
    const v = world.get(j.truck);
    if (!v || v.removed || v.wreckAt || v.sinkAt) { jobs.failJob(world, p, 'The trawler is lost. Trip over.'); continue; }
    if (world.time > j.expires) { jobs.failJob(world, p, 'Out too long - the market called the trawler back.'); continue; }
    j.boxes = j.boxes.filter((id) => { const c = world.get(id); return c && !c.removed; });
    if (!j.hauling) continue;
    const s = spot(j), ped = p.ped, sp = Math.hypot(v.vx, v.vy);
    const ok = ped && ped.vehId === v.id && ped.seat === 0 && s && (s.k === 'net'
      ? Math.hypot(v.x - s.x, v.y - s.y) < FISHBOAT.spotR * 1.5 && sp >= FISHBOAT.trawl[0] && sp <= FISHBOAT.trawl[1]
      : Math.hypot(v.x - s.x, v.y - s.y) < FISHBOAT.potR && sp <= FISHBOAT.potStill);
    if (!ok) {
      if (s && s.k === 'net' && sp < FISHBOAT.trawl[0] && Math.hypot(v.x - s.x, v.y - s.y) < FISHBOAT.spotR * 1.5) continue;   // (slowed a moment: the net waits)
      if (world.time - (j.warnAt || -99) > 5) { j.warnAt = world.time; world.notify(p, s && s.k === 'net' ? 'Keep her moving through the ground at trawling speed - not too fast.' : 'Hold her still by the buoys while the pots come up.', 'warn'); }
      if (s && Math.hypot(v.x - s.x, v.y - s.y) > FISHBOAT.spotR * 2) { j.hauling = false; j.haul = 0; setText(world, p); p.meDirty = true; }
      continue;
    }
    const was = Math.floor(j.haul);
    j.haul += dt;
    if (j.haul >= (s.k === 'net' ? FISHBOAT.netS : FISHBOAT.potS)) landHaul(world, p, v);
    else if (Math.floor(j.haul) !== was) { setText(world, p); p.meDirty = true; }
  }
}

// ---- the page's view of it (phone.js jobTarget) --------------------------------------------------------------------------
export function target(world, p, j) {
  if (j.stage === 'home') return { text: j.text, x: Math.round(j.quay.x), y: Math.round(j.quay.y), stage: 'home' };
  const s = spot(j);
  return { text: j.text, x: s.x, y: s.y, stage: j.hauling ? 'haul' : 'go' };
}

// ---- dev ('fishboat'): a trip from the nearest market, at the wheel, out on the first ground ------------------------------
export function devFish(world, p, k = '') {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job && p.job.type !== 'fishboat') jobs.failJob(world, p, '[dev] job dropped');
  if (ped.vehId) return 'Out of the vehicle first.';
  if (!p.job) { const err = start(world, p); if (err) return err; }
  const v = world.get(p.job.truck);
  if (v && !v.seats[0]) { v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true; }
  if (v && k === 'haul' && p.job.stage !== 'home') {   // out on the next ground, the haul landed on the deck
    const s = spot(p.job); v.x = s.x; v.y = s.y; v.vx = v.vy = 0; world.place(v); ped.x = v.x; ped.y = v.y; p.teleportAt = world.time; world.place(ped);
    landHaul(world, p, v);
  }
  return null;
}
