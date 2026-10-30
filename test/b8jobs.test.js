// Batch 8a's jobs (the owner's notes part 2): the taxi a player hails (server/systems/taxijob.js playerHail), Crazy Taxi
// (crazytaxi.js), the trucker and the big rigs (truckjob.js, rigs.js) and the mail carrier (mailjob.js). Each on the phone's
// job list and at its place; each run end to end - picked up, carried, set down, paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { CAB, CRAZY, RIG, MAILJOB } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { K } from '../shared/constants.js';

const cab = await import('../server/systems/taxijob.js');
const crazy = await import('../server/systems/crazytaxi.js');
const rigs = await import('../server/systems/rigs.js');
const truck = await import('../server/systems/truckjob.js');
const mail = await import('../server/systems/mailjob.js');
const phone = await import('../server/systems/phone.js');
const players = await import('../server/systems/players.js');
const { openNear } = await import('../server/systems/firefighter.js');
const { kerbFor } = await import('../server/systems/kerbdrive.js');

const w = makeWorld();
run(w, 0.2);
const put = (e, x, y, a = e.a) => { e.x = x; e.y = y; e.a = a; e.vx = 0; e.vy = 0; e.av = 0; e.lz = 0; w.place(e); };
const steps = (n) => { for (let i = 0; i < n; i++) w.step(); };
function seat(p, v) { const ped = p.ped; if (ped.vehId) return; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; ped.x = v.x; ped.y = v.y; w.place(ped); }
function unseat(p) { const v = w.get(p.ped.vehId); if (v) { const i = v.seats.indexOf(p.ped.id); if (i >= 0) v.seats[i] = 0; } p.ped.vehId = 0; p.ped.seat = -1; }
function onJob(id, at) {
  const { p, prof, conn } = joinPlayer(w);
  if (at) put(p.ped, at.x, at.y);
  const r = phone.handle(w, p, { a: 'take', id });
  assert.equal(r.err, null, `${id}: signed on (${r.err})`);
  return { p, prof, conn };
}
// drive v (and what rides it) to (x, y) in hops, a step each
function driveTo(v, x, y, hop = 300) {
  for (let i = 0; i < 600; i++) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < 5) break;
    const k = Math.min(1, hop / d);
    put(v, v.x + (x - v.x) * k, v.y + (y - v.y) * k, Math.atan2(y - v.y, x - v.x));
    for (const s of v.seats) { const q = s && w.get(s); if (q) { q.x = v.x; q.y = v.y; w.place(q); } }
    rigs.straighten(w, v);
    w.step();
    v.vx = 0; v.vy = 0;
  }
}
// a long straight street (its middle, its heading)
function street() {
  const e = w.map.net.edges.find((q) => q.lvl === 0 && q.len > 900 && q.pts.length === 2 && q.kind !== 'hwy' && !q.bridge);
  const a = Math.atan2(e.pts[1].y - e.pts[0].y, e.pts[1].x - e.pts[0].x);
  return { x: (e.pts[0].x + e.pts[1].x) / 2, y: (e.pts[0].y + e.pts[1].y) / 2, a };
}

test('the jobs are on the phone\'s list with their cards', () => {
  const { p } = joinPlayer(w);
  const ids = phone.handle(w, p, { a: 'board' }).jobs.map((j) => j.id);
  for (const id of ['cab', 'crazy', 'haul', 'mail', 'mailwalk']) assert.ok(ids.includes(id), `${id} on the list`);
  const j = phone.handle(w, p, { a: 'board' }).jobs.find((q) => q.id === 'haul');
  assert.ok(j.lo > 0 && j.hi >= j.lo && j.step, 'a card: the pay and the first step');
  // the rank's card offers Crazy Taxi as its "or"
  const r = cab.ranksOf(w.map)[0];
  put(p.ped, r.x + 10, r.y + 10);
  const act = cab.interaction(w, p);
  assert.ok(act.card.alt && act.card.alt.id === 'crazy');
  phone.offerCard(w, p, act.card);
  const sent = p.conn.sent.filter((m) => m.t === 'jobcard').pop();
  assert.ok(sent && sent.alt && sent.alt.id === 'crazy', 'the card carries the alternative');
  const res = phone.handle(w, p, { a: 'take', id: 'crazy', card: 1 });
  assert.equal(res.err, null);
  assert.equal(p.job.type, 'crazy', 'took the alternative from the card');
  phone.handle(w, p, { a: 'cancel' });
});

test('rigs: the trailer follows the fifth wheel round a turn, never shoved by its own tractor; unhitched and hitched again', () => {
  const s = street();
  const t = w.spawnVehicle('semi', s.x, s.y, s.a, {});
  t.despawnable = false;   // (no one about in the test: the street's tidy-up would take it)
  const tr = rigs.attachTrailer(w, t, 'trailer', { anyGround: true, ignore: [] });
  assert.ok(tr, 'a trailer behind it');
  assert.equal(tr.hitchTo, t.id);
  const kp = () => ({ x: tr.x + Math.cos(tr.a) * tr.def.hitch, y: tr.y + Math.sin(tr.a) * tr.def.hitch });
  const gap = () => { const H = rigs.fifthWheel(t), k = kp(); return Math.hypot(H.x - k.x, H.y - k.y); };
  // forward 400 px, then turning 90 degrees: the trailer swings round after
  for (let i = 0; i < 20; i++) { put(t, t.x + Math.cos(t.a) * 20, t.y + Math.sin(t.a) * 20, t.a); t.vx = Math.cos(t.a) * 400; t.vy = Math.sin(t.a) * 400; w.step(); }
  assert.ok(gap() < 2, `hitched at the kingpin (${gap().toFixed(1)})`);
  assert.ok(Math.abs(tr.a - t.a) < 0.05, 'straight behind');
  const a0 = t.a;
  for (let i = 0; i < 30; i++) { const a = a0 + (Math.PI / 2) * Math.min(1, (i + 1) / 15); put(t, t.x + Math.cos(a) * 20, t.y + Math.sin(a) * 20, a); w.step(); }
  const rel = Math.abs(((tr.a - t.a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  assert.ok(rel > 0.1 && rel <= RIG.jack + 1e-6, `it lags round the turn (${rel.toFixed(2)})`);
  assert.ok(gap() < 2, 'still on the fifth wheel');
  // stopped, at the wheel: unhitch it, back under it again: hitch
  const { p } = joinPlayer(w);
  seat(p, t);
  const un = rigs.interaction(w, p);
  assert.match(un.label, /Unhitch/);
  un.run();
  assert.equal(tr.hitchTo, 0);
  const H = rigs.fifthWheel(t);
  for (let i = 0; i < 10; i++) w.step();
  const k = kp();
  put(t, t.x + (k.x - H.x) * 0.5, t.y + (k.y - H.y) * 0.5, tr.a);
  const on = rigs.interaction(w, p);
  assert.ok(on && /Hitch/.test(on.label), 'backed under it: hitch');
  on.run();
  assert.equal(tr.hitchTo, t.id);
  assert.equal(players.findInteraction(w, p).label, on.label.replace('Hitch', 'Unhitch'), 'and the prompt says so');
  unseat(p);
  // the city's rig: gone, its trailer with it
  tr.npcRig = true;
  w.remove(t);
  w.step();
  assert.ok(tr.removed || !w.get(tr.id), 'the trailer went with it');
});

test('trucker: a rig and a trailer of crates at the depot; hauled to the buyer and paid by the distance, the crates still on and the knocks', () => {
  const D = truck.depotsOf(w.map)[0];
  const { p, prof } = onJob('haul', openNear(w.map, D.x, D.y + 60) || D);
  const j = p.job, t = w.get(j.truck), tr = w.get(j.trailer);
  assert.equal(t.model, 'semi'); assert.equal(tr.model, 'trailer');
  assert.equal(tr.hitchTo, t.id, 'hitched');
  assert.equal(tr.cargo.filter(Boolean).length, Math.min(RIG.crates, VEHICLES.trailer.slots.length), 'the load on the trailer');
  assert.ok(phone.jobTarget(w, p).veh, 'the rig marked');
  assert.ok(j.d >= Math.min(RIG.haul[0], j.d), 'a haul');
  // (out on a long straight street: the buyer at its far end, so the hops stay on land)
  const s = street();
  put(t, s.x - Math.cos(s.a) * 400, s.y - Math.sin(s.a) * 400, s.a); rigs.straighten(w, t);
  j.to = { x: s.x + Math.cos(s.a) * 400, y: s.y + Math.sin(s.a) * 400, name: 'the far end' };
  seat(p, t);
  steps(2);
  assert.equal(j.stage, 'go');
  assert.equal(phone.jobTarget(w, p).x, Math.round(j.to.x), 'to the buyer');
  // a hard knock and a crate gone on the way
  t.hardHitAt = w.time; t.hardHit = RIG.bump + 80;
  const gone = w.get(tr.cargo[0]); tr.cargo[0] = 0; gone.state = 'ground'; gone.parent = 0;
  steps(2);
  assert.equal(j.hits, 1);
  const to = j.to;
  const cash = prof.cash;
  driveTo(t, to.x, to.y, 400);
  for (let i = 0; i < 60 && p.job; i++) { t.vx = 0; t.vy = 0; w.step(); }
  assert.equal(p.job, null, 'delivered: ' + p.toasts.map((x) => x.text).join(' / '));
  const want = Math.round((j.pay * ((j.n - 1) / j.n) * (1 - RIG.hitCut)) / 5) * 5;
  assert.equal(prof.cash - cash, want, `paid by the crates and the condition ($${prof.cash - cash}) ${p.toasts.map((x) => x.text).join(' / ')}`);
  assert.ok(tr.removed || !w.get(tr.id), 'the trailer handed over');
  assert.ok(p.truckReturn, 'the rig to bring back for the bonus');
  unseat(p);
});

test('trucker: the city\'s rigs pull box trailers on the highway', () => {
  const t = w.spawnVehicle('semi', 0, 0, 0, {});
  const s = street();
  put(t, s.x, s.y, s.a);
  const tr = rigs.attachTrailer(w, t, 'boxtrailer', { npc: true, anyGround: true });
  assert.ok(tr && tr.npcRig && tr.model === 'boxtrailer');
  assert.ok(VEHICLES.trailer.trailer && VEHICLES.boxtrailer.trailer, 'trailers are trailers');
  const { p } = joinPlayer(w);
  put(p.ped, tr.x, tr.y + tr.def.W / 2 + 10);
  const it = players.findInteraction(w, p);
  assert.ok(!it || !/Enter|Get in|Steal|Take/.test(it.label) || !/Trailer/.test(it.label), 'no way into a trailer');
  w.remove(t); w.step();
});

test('Crazy Taxi: the clock starts in the cab; a fare from a ring, there in time pays and puts seconds back; tips; time up: the summary', () => {
  const r = cab.ranksOf(w.map)[0];
  const { p, prof, conn } = onJob('crazy', openNear(w.map, r.x + 100, r.y + 100) || r);
  const j = p.job, v = w.get(j.truck);
  assert.equal(j.stage, 'ready', 'waiting for you to get in');
  const s = street();
  put(v, s.x, s.y, s.a);
  seat(p, v);
  steps(2);
  assert.equal(j.stage, 'pickup');
  assert.ok(Math.abs(j.clockAt - w.time - CRAZY.startS) < 1, 'the clock going');
  for (let i = 0; i < 80 && j.waiting.length < CRAZY.waiting; i++) w.step();
  assert.ok(j.waiting.length >= 1, `fares waving (${j.waiting.length})`);
  const t0 = phone.jobTarget(w, p);
  assert.ok(t0.crazy && t0.marks.length === j.waiting.length && t0.marks.every((m) => 'gyr'.includes(m[2])), 'their rings, coloured by the trip');
  const info = phone.jobTarget(w, p);
  assert.equal(info.s, 'clock'); assert.ok(info.left > 0, 'the HUD card has the clock');
  const wt = j.waiting[0], q = w.get(wt.cust);
  assert.equal(q.pp, 'hail');
  put(v, q.x + 60, q.y, 0);
  for (let i = 0; i < 20 && !j.fare; i++) { v.vx = 0; v.vy = 0; w.step(); }
  assert.ok(j.fare, 'in');
  assert.equal(q.vehId, v.id);
  // a near miss on the way: a car just past the cab's side at speed
  const o = w.spawnVehicle('sedan', v.x, v.y + v.def.W / 2 + VEHICLES.sedan.W / 2 + 12, v.a, {});
  v.vx = Math.cos(v.a) * 500; v.vy = Math.sin(v.a) * 500;
  w.step();
  assert.ok(j.fare.tips >= CRAZY.nearTip, `a near-miss tip ($${j.fare.tips})`);
  assert.equal(j.combo, 1);
  w.remove(o);
  const clock = j.clockAt, cash = prof.cash, tips = j.fare.tips, tier = j.fare.tier;
  const dest = openNear(w.map, j.fare.to.x, j.fare.to.y) || j.fare.to;
  put(v, dest.x, dest.y, v.a); for (const sid of v.seats) { const e = sid && w.get(sid); if (e) { e.x = v.x; e.y = v.y; } }
  steps(2);
  assert.equal(j.fare, null, 'set down');
  assert.equal(j.done, 1);
  assert.equal(prof.cash - cash, CRAZY.tiers[tier].pay + tips, 'a speedy fare: the full pay and the tips');
  assert.equal(Math.round(j.clockAt - clock), CRAZY.tiers[tier].bonus, 'seconds back on the clock');
  // time up
  j.clockAt = w.time;
  steps(2);
  assert.equal(p.job, null, 'over');
  const end = conn.sent.find((m) => m.t === 'crazyend');
  assert.ok(end && end.fares === 1 && end.cash === CRAZY.tiers[tier].pay + tips && /^[SABCDE]$/.test(end.rank), 'the summary card');
  assert.equal(prof.crazyBest, end.cash, 'your best run kept');
  assert.ok(end.record);
  // again, from the summary: the same cab
  const again = phone.handle(w, p, { a: 'take', id: 'crazyagain' });
  assert.equal(again.err, null);
  assert.equal(p.job.truck, v.id, 'the same cab');
  phone.handle(w, p, { a: 'cancel' });
  unseat(p);
});

test('a player hails a cab: the on-duty player cab is sent, the rider gets in, picks where, and pays the meter to the driver', () => {
  const s = street();
  const { p: drv, prof: dprof } = onJob('cab');
  drv.job.nextAt = 1e9;
  const v = w.get(drv.job.truck);
  put(v, s.x, s.y, s.a);
  seat(drv, v);
  const { p: rider, prof: rprof } = joinPlayer(w, { cash: 1000 });
  const at = openNear(w.map, s.x + Math.cos(s.a) * 600, s.y + Math.sin(s.a) * 600);
  put(rider.ped, at.x, at.y);
  phone.handle(w, rider, { a: 'taxi', op: 'call' });
  const f = drv.job.fare;
  assert.ok(f && f.k === 'player' && f.rider === rider.pid, 'the player cab sent');
  assert.equal(rider.ped.pp, 'hail', 'an arm up');
  assert.equal(phone.jobTarget(w, drv).stage, 'pickup');
  assert.ok(Math.abs(phone.jobTarget(w, drv).x - Math.round(rider.ped.x)) < 2, 'the rider marked');
  // pulled up by them
  put(v, rider.ped.x + 70, rider.ped.y, s.a);
  const get = players.findInteraction(w, rider);
  assert.match(get.label, /cab/i);
  get.run();
  assert.equal(rider.ped.vehId, v.id, 'in the back');
  assert.ok(f.aboard);
  assert.ok(!(w.cabHails && w.cabHails.has(rider.pid)), 'the hail over');
  const ti = phone.handle(w, rider, { a: 'transit' }).taxi;
  assert.ok(ti && ti.st === 'dest', 'the rider sees the ride (where to?)');
  const far = openNear(w.map, at.x + 2500, at.y) || { x: at.x + 2500, y: at.y };
  phone.handle(w, rider, { a: 'taxi', op: 'dest', x: far.x, y: far.y, label: 'the far end' });
  steps(2);
  assert.ok(f.to && f.to.name === 'the far end', 'where to');
  driveTo(v, far.x, far.y);
  assert.ok(f.meter > 2000, 'the meter ran');
  steps(2);
  assert.ok(f.there, 'there');
  const fare = Math.round((CAB.flag + (f.meter / 1000) * CAB.perKm) / 5) * 5, d0 = dprof.cash, r0 = rprof.cash + rprof.bank;
  unseat(rider);
  steps(2);
  assert.equal(dprof.cash - d0, fare, `the driver paid ($${fare})`);
  assert.equal(r0 - rprof.cash - rprof.bank, fare, 'by the rider');
  assert.equal(drv.job.fare, null);
  phone.handle(w, drv, { a: 'cancel' });
  unseat(drv);
});

test('mail: a van round - letters posted from the window, parcels carried to the door, the bonus for the round; a walking round', () => {
  const o = mail.officesOf(w.map)[0];
  const { p, prof } = onJob('mail', openNear(w.map, o.x, o.y + 60) || o);
  const j = p.job, v = w.get(j.truck);
  assert.equal(v.model, 'van');
  assert.ok(j.stops.length >= 3 && j.stops.length <= MAILJOB.van, `a round (${j.stops.length} stops)`);
  const parcels = j.stops.filter((s) => s.parcel);
  assert.equal(parcels.length, MAILJOB.parcels);
  assert.equal(v.cargo.filter(Boolean).length, MAILJOB.parcels, 'the parcels in the back');
  const cash = prof.cash;
  seat(p, v);
  for (const s of j.stops.filter((q) => !q.parcel)) {
    if (s.box) {
      put(v, s.x + 40, s.y, 0);
      const it = mail.vanInteraction(w, p);
      assert.ok(it, 'post from the window');
      it.run();
    } else {
      unseat(p); put(p.ped, s.x, s.y);
      const it = players.findInteraction(w, p);
      assert.match(it.label, /letters/);
      it.run();
      seat(p, v);
    }
    assert.ok(s.done);
  }
  for (const s of parcels) {
    put(v, s.x + 100, s.y, 0);
    unseat(p); put(p.ped, s.x + 100, s.y + 10);
    const c = w.get(v.cargo.find(Boolean));
    w.get(p.ped.id).carrying = c.id; c.state = 'carried'; c.parent = p.ped.id; v.cargo[c.slot] = 0;
    put(p.ped, s.x, s.y);
    const it = players.findInteraction(w, p);
    assert.match(it.label, /doorstep/);
    it.run();
    assert.ok(s.done && !p.ped.carrying);
    if (p.job) seat(p, v);
  }
  assert.equal(p.job, null, 'round done');
  assert.equal(prof.cash - cash, (j.stops.length - MAILJOB.parcels) * MAILJOB.letter + MAILJOB.parcels * MAILJOB.parcel + MAILJOB.bonus);
  unseat(p);
  // on foot
  put(p.ped, o.x, o.y + 60);
  assert.equal(phone.handle(w, p, { a: 'take', id: 'mailwalk' }).err, null);
  assert.equal(p.job.mode, 'walk'); assert.equal(p.job.truck, 0);
  assert.ok(p.job.stops.every((s) => !s.parcel), 'letters only');
  phone.handle(w, p, { a: 'cancel' });
  void K; void kerbFor;
});

test('the rigs\' models: the tractor, the flatbed and the box van trailers - loaded with the fleet, each drawn as itself', async () => {
  const A = await import('../client/art2/game/actors.js');
  const { vehicleModel, vehicleAnchors } = await import('../client/art2/vehicles.js');
  A.artFrom({ fleet: () => import('../client/art2/fleet.js'), horse: () => import('../client/art2/horse.js') });
  await A.loadArt();
  const { ENGINE_CLASS } = await import('../client/sound/vehicles.js');
  for (const id of ['semi', 'trailer', 'boxtrailer']) {
    assert.equal(A.vehType({ m: VEHICLES[id].i }), id);
    const m = vehicleModel(id, { variant: 3 });
    let n = 0; for (const x of m.v) if (x) n++;
    assert.ok(n > 20000, `${id}: a model (${n} voxels)`);
    assert.ok(vehicleAnchors(id).tail.length >= 2, `${id}: its tail lamps`);
    const g = A.vehicleSprite({ m: VEHICLES[id].i, p: 3, vr: 1 }, { lights: true }, 5, 32);
    assert.ok(g.w > 10 && g.h > 10, `${id}: a sprite`);
    assert.ok(ENGINE_CLASS[id] && VEHICLES[id].sprite, `${id}: its sound, its classic stand-in`);
  }
  assert.ok(vehicleAnchors('semi').head.length >= 2, 'the tractor\'s headlamps');
  assert.ok(vehicleAnchors('trailer').bed > 0, 'the flatbed\'s deck: the crates ride on it');
  // the fifth wheel and the kingpin meet over the tractor's back, the trailer's front clear of the cab
  const S = VEHICLES.semi, T = VEHICLES.trailer;
  assert.ok(S.hitch < 0 && S.hitch > -S.L / 2 && T.hitch > 0 && T.hitch < T.L / 2);
  assert.ok(S.hitch + (T.L / 2 - T.hitch) < S.L / 2 - 50, 'the trailer\'s nose behind the cab');
});
