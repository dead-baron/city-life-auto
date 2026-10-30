// The trucker (b8a; the owner's notes part 2: "Jobs - Trucker job, long hauls across the world on the highway", "Big rig
// trucks on highways, truck driving jobs available to haul goods across the world"). At a freight depot - the yards'
// warehouses, the port's, Portside Logistics (depotsOf: from the built map) - or from the phone's job list: a big rig is
// issued at the kerb outside, a flatbed trailer hitched behind it with the load on it as open crates (RIG.crates, the
// depot's goods: lumber, steel, produce, freight) - anyone can see them, and anyone can take one (cargo theft, and the
// fence pays for it). Haul them to a buyer far across the world (buyersOf, RIG.haul px off) and stop in its yard: paid
// by the distance, times the share of the crates still on the trailer, less RIG.hitCut a hard knock (the load's
// condition). The rig's then the company's to bring back for the return bonus (jobs.js). The rigs and the hitch:
// rigs.js. The offer on the card is the one you get (offerFor: kept a while for you).
//   update(world, dt)       the hauls (world.js SYSTEMS), and job trailers left behind cleared away
//   start(world, p, depot)  sign on -> error | null
//   interaction(world, p)   Act at a depot: its card
//   offerFor(world, p)      { from, to, d, pay, goods } - the haul the board and the card show you
//   target(world, p, j)     the job tracker's target (phone.js)
//   devHaul(world, p)       dev: a rig hitched beside you, the buyer a short way off
import { K } from '../../shared/constants.js';
import { RIG } from '../../shared/rules.js';
import { VEHICLES } from '../../shared/vehicles.js';
import { CAR_SPAWN_BLOCK } from '../../shared/map.js';
import { store } from '../store.js';
import { kerbFor } from './kerbdrive.js';
import * as jobs from './jobs.js';
import * as rigs from './rigs.js';
import * as vehicles from './vehicles.js';

const FREIGHT = /Freight|Logistics|Cold Stor|Lumber|Produce|Steel|Cartage|Parcel|Moving & Storage|Paper (Co|Stock)|Textile Mill|Glassworks|Lakes Glass|Tire\b|Aggregates|Ironworks|Brewing Supply|Box & Crate|Pallet Co|Feed & Grain|Stoneworks|Pipe & Valve|Wire & Cable|Fisheries|Express Agency|Couriers|Restaurant Supply|Bakery Supply|Hardware Wholesale|Steel Store|Salvage Parts/;   // (the yards' and the port's warehouses: shared/world3-yards.js)
const BUYER_KINDS = new Set(['grocery', 'market', 'hardware', 'construction', 'farm', 'fishmarket', 'gasstation', 'roadhouse', 'lodge', 'winery', 'warehouse', 'butcher', 'farmstand']);
const GOODS = [[/Lumber|Pallet|Crate|Paper|Mill/, 'Lumber', 1], [/Steel|Iron|Pipe|Wire|Glass|Tire|Stone|Aggregates|Bolt/, 'Steel', 2], [/Produce|Feed|Fisheries|Cold|Brewing|Bakery/, 'Produce', 1]];
const cache = (m, k, f) => m[k] || Object.defineProperty(m, k, { value: f(), enumerable: false })[k];
export const depotsOf = (m) => cache(m, '_rigDepots', () => { const L = m.pois.filter((q) => q.kind === 'warehouse' || (q.kind === 'delivery' && FREIGHT.test(q.label || ''))); return L; });
const buyersOf = (m) => cache(m, '_rigBuyers', () => m.pois.filter((q) => BUYER_KINDS.has(q.kind) || (q.kind === 'delivery' && FREIGHT.test(q.label || ''))));
const goodsOf = (depot) => { for (const [re, g, tier] of GOODS) if (re.test(depot.label || '')) return { name: g, tier }; return { name: 'Freight', tier: 2 }; };
export const payOf = (d) => Math.round((RIG.base + (d / 1000) * RIG.perKm) / 5) * 5;
const near = (p, L) => L.reduce((a, b) => (Math.hypot(b.x - p.x, b.y - p.y) < Math.hypot(a.x - p.x, a.y - p.y) ? b : a));

// the haul on offer to p: from the depot nearest them to a buyer across the world (kept RIG offer s, or till taken)
export function offerFor(world, p) {
  const m = world.map, D = depotsOf(m);
  if (!D.length || !p.ped) return null;
  const from = near(p.ped, D), o = p.haulOffer;
  if (o && o.from === from.id && world.time < o.until) return o;
  const B = buyersOf(m).filter((q) => { const d = Math.hypot(q.x - from.x, q.y - from.y); return q !== from && d >= RIG.haul[0] && d <= RIG.haul[1]; });
  const far = B.length ? B : buyersOf(m).filter((q) => q !== from).sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y)).slice(0, 5);
  if (!far.length) return null;
  const to = far[Math.floor(world.rand() * far.length)], d = Math.hypot(to.x - from.x, to.y - from.y);
  return (p.haulOffer = { from: from.id, to: to.id, d, pay: payOf(d), goods: goodsOf(from).name, until: world.time + 180 });
}

// a rig at the kerb outside (x, y), the trailer behind it: [tractor, trailer] | null
function parkRig(world, x, y) {
  const k = kerbFor(world, x, y), list = [];
  if (k.e) for (const s of [0, 170, -170, 340, -340, 520, -520]) for (const back of [false, true]) {
    const a = (k.a || 0) + (back ? Math.PI : 0), c = Math.cos(k.a || 0), sn = Math.sin(k.a || 0);
    list.push({ x: k.x + c * s, y: k.y + sn * s, a });
  }
  for (let r = 90; r <= 1400 && list.length < 400; r += 45) for (let i = 0, n = Math.round(r / 18); i < n; i++) { const a = (i / n) * Math.PI * 2; list.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, a: Math.abs(Math.cos(a)) > 0.7 ? Math.PI / 2 : 0 }); }
  const S = VEHICLES.semi, TR = VEHICLES.trailer;
  for (const q of list) {
    const c = Math.cos(q.a), s = Math.sin(q.a);
    let ok = true;
    for (let f = S.L / 2; f >= S.hitch - TR.hitch - TR.L / 2 && ok; f -= 30) for (const g of [-0.45, 0.45]) if (CAR_SPAWN_BLOCK[world.map.tileAtPx(q.x + c * f - s * S.W * g, q.y + s * f + c * S.W * g)]) { ok = false; break; }
    if (!ok) continue;
    const mx = q.x - c * 110, my = q.y - s * 110;
    if (world.query(mx, my, 260, K.VEH).some((o) => Math.hypot(o.x - mx, o.y - my) < 200 + o.def.L / 2)) continue;
    const t = world.spawnVehicle('semi', q.x, q.y, q.a, { npcOwned: false });
    const tr = rigs.attachTrailer(world, t, 'trailer', { paint: t.paint });
    if (!tr) { world.remove(t); continue; }
    return [t, tr];
  }
  return null;
}

export function start(world, p, depot = null) {
  if (!p.ped || p.ped.dead) return 'Not right now.';
  if (p.job) return 'You already have a job - cancel it first.';
  const o = offerFor(world, p), m = world.map;
  if (!o) return 'No freight going out round here.';
  const from = depot || m.pois[o.from], to = m.pois[o.to];
  const rig = parkRig(world, from.x, from.y);
  if (!rig) return 'No room to bring a rig round here.';
  const [t, tr] = rig, goods = goodsOf(from), n = Math.min(RIG.crates, tr.def.slots.length), crates = [];
  const each = Math.max(20, Math.round(o.pay / n / 5) * 5);
  for (let i = 0; i < n; i++) {
    const [x, y] = [tr.x, tr.y];
    const c = world.spawnCrate(goods.tier, x, y, { owner: p.pid, label: `${goods.name} Crate`, value: each, contraband: false, job: { type: 'haul', pid: p.pid } });
    c.state = 'loaded'; c.parent = tr.id; c.slot = i; c.a = tr.a; tr.cargo[i] = c.id;
    crates.push(c.id);
  }
  p.job = { type: 'haul', stage: 'pickup', truck: 0, trailer: tr.id, crates, n, from: { x: from.x, y: from.y, name: from.label }, to: { x: to.x, y: to.y, name: to.label }, d: o.d, pay: o.pay, goods: goods.name,
    hits: 0, hitAt: 0, hold: 0, expires: world.time + RIG.limitS + o.d / RIG.pxS, text: `Trucker: get in the rig at ${from.label}` };
  jobs.markIssued(world, p, t, from);
  tr.issuedTo = p.pid; tr.job = { pid: p.pid };
  (world.haulTrailers ||= new Set()).add(tr.id);
  p.haulOffer = null;
  world.notify(p, `Haul on: ${n} crates of ${goods.name.toLowerCase()} for ${to.label}, ${Math.round(o.d / 32000 * 10) / 10} km off. Your rig is the green ring - the load's on the trailer for anyone to see. Every crate there and a clean run pays the most.`, 'good', `Trucker: ${goods.name.toLowerCase()} to ${to.label}`);
  p.meDirty = true;
  store.touch();
  return null;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || p.job) return null;
  const d = depotsOf(world.map).find((q) => Math.hypot(q.x - ped.x, q.y - ped.y) < 160);
  if (!d) return null;
  return { label: `Ask ${d.label} for a haul (a big rig is issued)`, card: { id: 'haul', where: d.label, start: () => start(world, p, d) }, run: () => { const err = start(world, p, d); if (err) world.notify(p, err, 'bad'); } };
}

const loadLeft = (world, j, tr) => j.crates.filter((id) => { const c = world.get(id); return c && !c.removed && c.state === 'loaded' && c.parent === tr.id; }).length;
const condOf = (j) => Math.max(RIG.floor, 1 - j.hits * RIG.hitCut);

function step(world, p, dt) {
  const j = p.job, now = world.time, ped = p.ped;
  const t = world.get(j.truck), tr = world.get(j.trailer);
  if (!t || t.removed || t.wreckAt) { jobs.failJob(world, p, 'Your rig is wrecked. The haul is off.'); return; }
  if (!tr || tr.removed || tr.wreckAt) { jobs.failJob(world, p, 'The trailer\'s lost. The haul is off.'); return; }
  const driving = ped && ped.vehId === t.id && ped.seat === 0, hitched = tr.hitchTo === t.id;
  // the knocks the load takes
  for (const v of [t, tr]) if ((v.hardHitAt || 0) > j.hitAt && v.hardHit > RIG.bump) { j.hitAt = v.hardHitAt; j.hits++; if (driving) world.notify(p, `The load took a knock - condition ${Math.round(condOf(j) * 100)}%.`, 'warn'); }
  const left = loadLeft(world, j, tr);
  if (!left) { jobs.failJob(world, p, 'The whole load\'s gone off the trailer. The haul is off.'); return; }
  const stage = driving ? (hitched ? 'go' : 'hitch') : 'pickup';
  const text = stage === 'go' ? `Trucker: ${j.goods.toLowerCase()} to ${j.to.name} - ${left}/${j.n} crates, ${Math.round(condOf(j) * 100)}%` : stage === 'hitch' ? 'Trucker: back up under the trailer and hitch it (Act)' : j.stage === 'pickup' && !j.went ? `Trucker: get in the rig at ${j.from.name}` : 'Trucker: back in the rig';
  if (stage === 'go') j.went = true;
  if (stage !== j.stage || text !== j.text) { j.stage = stage; j.text = text; p.meDirty = true; }
  if (stage !== 'go' || Math.hypot(t.vx, t.vy) > 25 || Math.hypot(tr.x - j.to.x, tr.y - j.to.y) > RIG.dropR && Math.hypot(t.x - j.to.x, t.y - j.to.y) > RIG.dropR) { j.hold = 0; return; }
  j.hold += dt;
  if (j.hold < RIG.dropS) return;
  // delivered: the crates still aboard, the condition
  const pay = Math.round((j.pay * (left / j.n) * condOf(j)) / 5) * 5;
  for (const id of j.crates) { const c = world.get(id); if (c && c.parent === tr.id && c.state === 'loaded') world.remove(c); }
  tr.cargo.fill(0);
  rigs.unhitch(world, tr, true);
  world.remove(tr);
  p.profile.cash += pay;
  p.profile.stats.deliveries = (p.profile.stats.deliveries || 0) + 1;
  world.emit(t.x, t.y, { e: 'cash', x: t.x, y: t.y, n: pay });
  world.notify(p, `${j.to.name} signs for it: ${left}/${j.n} crates, condition ${Math.round(condOf(j) * 100)}%. +$${pay}.`, 'good');
  jobs.jobDone(world, p);
  store.touch();
}

export function update(world, dt) {
  for (const p of world.players.values()) if (p.job && p.job.type === 'haul') step(world, p, dt);
  // a job's trailer whose haul is over (cancelled, lost): left unhitched, it's taken away with what's left on it
  if (world.haulTrailers && world.tick % 20 === 9) for (const id of [...world.haulTrailers]) {
    const tr = world.get(id);
    if (!tr || tr.removed) { world.haulTrailers.delete(id); continue; }
    const p = world.players.get(tr.issuedTo);
    if (p && p.job && p.job.type === 'haul' && p.job.trailer === id) continue;
    if (tr.hitchTo && world.get(tr.hitchTo)) continue;
    for (let i = 0; i < tr.cargo.length; i++) { const c = world.get(tr.cargo[i]); if (c && c.state === 'loaded') world.remove(c); }
    world.haulTrailers.delete(id);
    world.remove(tr);
  }
}

export function target(world, p, j) {
  if (j.stage === 'hitch') { const tr = world.get(j.trailer); if (tr) return { text: j.text, x: Math.round(tr.x), y: Math.round(tr.y), stage: 'hitch' }; }
  return { text: j.text, x: Math.round(j.to.x), y: Math.round(j.to.y), stage: j.stage === 'go' ? 'go' : 'pickup' };
}

// dev ('haul'): a haul from the depot nearest you, the rig at the kerb by you, you at the wheel, the buyer the nearest
// one past 3000 px
export function devHaul(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'On your feet first.';
  if (p.job) jobs.failJob(world, p, '[dev] job dropped');
  if (ped.vehId) vehicles.ejectPed(world, ped, true);   // (out of whatever you're in first)
  const m = world.map, B = buyersOf(m).filter((q) => Math.hypot(q.x - ped.x, q.y - ped.y) > 3000);
  if (!depotsOf(m).length || !B.length) return 'no depots here';
  const to = near(ped, B), from = near(ped, depotsOf(m)), d = Math.hypot(to.x - ped.x, to.y - ped.y);
  p.haulOffer = { from: from.id, to: to.id, d, pay: payOf(d), goods: goodsOf(from).name, until: world.time + 60 };
  const err = start(world, p, { ...from, x: ped.x, y: ped.y });
  if (err) return err;
  const t = world.get(p.job.truck);
  if (t && !ped.vehId) { t.seats[0] = ped.id; ped.vehId = t.id; ped.seat = 0; ped.x = t.x; ped.y = t.y; p.teleportAt = world.time; world.place(ped); p.meDirty = true; }
  return null;
}
