// Finding your way on a job (batch 4, the owner's notes, 10-23): every job with somewhere to go tells the page where
// (phone.js jobTarget -> the self record's job: client/jobway.js draws the arrow at the screen's edge and the GPS line,
// the minimap and the map their marks) - the server decides it, per job and per stage; the siren clears the road ahead
// (traffic gives way from further off, people get out of the road at a run - further ahead than for a horn); search and
// rescue calls only out in the wilderness, near the base you signed on at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, straightRoad } from './helpers.js';
import { IN } from '../shared/input.js';
import { T, TILE } from '../shared/constants.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { SAR } from '../shared/rules.js';
import { spawnNpc } from '../server/systems/npc.js';

const phone = await import('../server/systems/phone.js');
const players = await import('../server/systems/players.js');
const pm = await import('../server/systems/paramedic.js');
const ff = await import('../server/systems/firefighter.js');
const cab = await import('../server/systems/taxijob.js');
const sar = await import('../server/systems/sar.js');
const traffic = await import('../server/systems/traffic.js');

const w = makeWorld();
run(w, 0.2);
const put = (e, x, y, a = e.a) => { e.x = x; e.y = y; e.a = a; e.vx = 0; e.vy = 0; e.av = 0; e.lz = 0; w.place(e); };
function seat(p, v) { const ped = p.ped; if (ped.vehId) return; v.seats[0] = ped.id; ped.vehId = v.id; ped.seat = 0; put(ped, v.x, v.y); }
const finite = (t) => t && Number.isFinite(t.x) && Number.isFinite(t.y) && typeof t.text === 'string' && t.text.length > 0;
let seq = 0;
const send = (p, bits, secs = 0.05) => { for (let t = 0; t < secs - 1e-6; t += 0.05) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: 0 }); w.step(); } };

test('every job on the phone\'s list sends the page a target: the job\'s vehicle first, then where the job is - in the self record', () => {
  run(w, 1);   // (the board's deliveries: phone.js update, once a second)
  const { p } = joinPlayer(w);
  const ids = phone.boardFor(w, p).jobs.map((j) => String(j.id)).filter((id, i, all) => all.indexOf(id) === i);
  for (const need of ['medic', 'fire', 'cab', 'bus', 'towjob', 'sar']) assert.ok(ids.includes(need), `${need} on the list`);
  assert.ok(ids.some((id) => /^\d+$/.test(id)), 'a courier delivery on the list');
  const bad = [];
  for (const id of ids) {
    const { p: q } = joinPlayer(w);
    const r = phone.handle(w, q, { a: 'take', id: /^\d+$/.test(id) ? Number(id) : id });
    if (r.err) { if (!/taken/.test(r.err)) bad.push(`${id}: ${r.err}`); continue; }
    const t = phone.jobTarget(w, q);
    if (!finite(t)) { bad.push(`${id}: no target (${JSON.stringify(t)})`); continue; }
    const v = q.job && q.job.truck ? w.get(q.job.truck) : null;
    if (v) {
      if (!t.veh) bad.push(`${id}: its vehicle not marked`);
      seat(q, v);
      const t2 = phone.jobTarget(w, q);
      if (!finite(t2) || t2.veh) bad.push(`${id}: in it, the target (${JSON.stringify(t2)})`);
    }
    const me = players.buildMe(w, q);
    if (!me.job || me.job.x !== phone.jobTarget(w, q).x || me.job.y !== phone.jobTarget(w, q).y) bad.push(`${id}: not in the self record`);
    phone.handle(w, q, { a: 'cancel' });
  }
  assert.deepEqual(bad, []);
});

test('the target follows the job: the ambulance\'s patient then the hospital, the fire, the taxi\'s fare then the drop, the rescue\'s circle then the spot', () => {
  // paramedic: the call's patient
  const { p: a } = joinPlayer(w);
  const H = w.map.pois.filter((q) => q.kind === 'hospital');
  put(a.ped, H[0].x + 20, H[0].y + 20);
  assert.equal(phone.handle(w, a, { a: 'take', id: 'medic' }).err, null);
  a.job.nextAt = 1e9;
  const site = ff.sitesOf(w.map).kerb[30];
  const c = pm.callAt(w, a, 'serious', { x: site.x, y: site.y, name: 'the test' });
  assert.ok(c, 'a call');
  seat(a, w.get(a.job.truck));
  const t = phone.jobTarget(w, a), pat = w.get(c.patient);
  assert.ok(Math.hypot(t.x - pat.x, t.y - pat.y) < 2, 'the patient marked');
  assert.ok(w.get(a.job.truck).sirenOn, 'the siren on for the call');
  phone.handle(w, a, { a: 'cancel' });
  // firefighter: the fire
  const { p: b } = joinPlayer(w);
  assert.equal(phone.handle(w, b, { a: 'take', id: 'fire' }).err, null);
  b.job.nextAt = 1e9;
  const fs = ff.sitesOf(w.map).kerb[60], fc = ff.callAt(w, b, 'dumpster', fs);
  if (fc) { const ft = phone.jobTarget(w, b); assert.ok(Math.hypot(ft.x - fc.x, ft.y - fc.y) < 400, 'the fire marked'); assert.ok(w.get(b.job.truck).sirenOn, 'the siren on for the call'); }
  phone.handle(w, b, { a: 'cancel' });
  // taxi: the fare, then where they go
  const { p: c2 } = joinPlayer(w);
  assert.equal(phone.handle(w, c2, { a: 'take', id: 'cab' }).err, null);
  c2.job.nextAt = 1e9;
  const L = w.map.pois.filter((q) => q.kind === 'convenience' || q.kind === 'delivery');
  let f = null;
  for (const x of L) { const y = L.find((q) => Math.hypot(q.x - x.x, q.y - x.y) > 3000); if (y && (f = cab.fareAt(w, c2, 'hail', x, { x: y.x, y: y.y, name: y.label }))) break; }
  assert.ok(f, 'a fare');
  const ct = phone.jobTarget(w, c2), cust = w.get(f.cust);
  assert.equal(ct.stage, 'pickup');
  assert.ok(Math.hypot(ct.x - cust.x, ct.y - cust.y) < 40, 'the fare marked');
  assert.ok(ct.dest, 'and where they\'re going, on the minimap');
  phone.handle(w, c2, { a: 'cancel' });
  // search and rescue: the circle (not the spot), then them
  const { p: d } = joinPlayer(w);
  assert.equal(phone.handle(w, d, { a: 'take', id: 'sar' }).err, null);
  const s = sar.sitesOf(w.map).open[10], sc = sar.callAt(w, d, 'ground', s.x, s.y);
  const st = phone.jobTarget(w, d);
  assert.ok(st.area && st.area[2] === SAR.circleR && st.x === st.area[0] && st.y === st.area[1], 'the waypoint is the search circle\'s middle');
  sc.found = true;
  const st2 = phone.jobTarget(w, d);
  assert.ok(!st2.area && Math.hypot(st2.x - s.x, st2.y - s.y) < 2, 'found: them');
  phone.handle(w, d, { a: 'cancel' });
});

test('search and rescue calls come only from the wilderness - never a park or a town - and near the base you signed on at', () => {
  const S = sar.sitesOf(w.map), all = [...S.open, ...S.rough];
  assert.ok(S.open.length > 20 && S.rough.length > 10 && S.water.length > 20, `places (${S.open.length}, ${S.rough.length}, ${S.water.length})`);
  const bad = new Set();
  for (const s of all) { const d = DISTRICTS[w.map.dist[w.map.idx(Math.floor(s.x / TILE), Math.floor(s.y / TILE))]]; if (!sar.wildDistrict(d)) bad.add(d && d.name); }
  assert.deepEqual([...bad], [], 'only wild districts');
  for (const d of DISTRICTS) if (d.style === 'park' || d.tier === 'lux' || d.style === 'commercial' || d.style === 'houses') assert.ok(!sar.wildDistrict(d), `${d.name} is no wilderness`);
  // away from the towns: no more than a couple of buildings round any of them
  const near = (s) => w.map.buildings.filter((b) => b && Math.hypot((b.tx + b.tw / 2) * TILE - s.x, (b.ty + b.th / 2) * TILE - s.y) < 24 * TILE).length;
  for (let i = 0; i < all.length; i += Math.max(1, Math.floor(all.length / 200))) assert.ok(near(all[i]) <= 2, `a call spot by a town (${Math.round(all[i].x / TILE)}, ${Math.round(all[i].y / TILE)})`);
  // the water's: off a wild shore
  for (let i = 0; i < S.water.length; i += Math.max(1, Math.floor(S.water.length / 100))) assert.ok(near(S.water[i]) <= 2, 'a water call by a town');
  // near the base: of the spots in range, the nearest of a few drawn - never one far off when there are near ones
  const base = S.open[Math.floor(S.open.length / 2)];
  for (let k = 0; k < 20; k++) {
    const s = sar.pick(S.open, base.x, base.y), d = Math.hypot(s.x - base.x, s.y - base.y);
    assert.ok(d >= SAR.dist[0] && d <= SAR.dist[1], `within reach of the base (${Math.round(d)} px)`);
  }
});

test('the siren clears the road: traffic ahead gives way and people step out of the road at a run - further ahead than for a horn', () => {
  const r = straightRoad(w.map, 1600, { kind: 'st' });
  assert.ok(r, 'a long straight street');
  const { p } = joinPlayer(w);
  const x0 = r.x + 200;
  const amb = w.spawnVehicle('ambulance', x0, r.y + 12, 0, {});
  put(p.ped, amb.x, amb.y); seat(p, amb); amb.issuedTo = p.pid;
  // a car ahead in its lane, in traffic
  const car = w.spawnVehicle('sedan', x0 + 420, r.y + 12, 0, {});
  const drv = spawnNpc(w, 'casual', car.x, car.y, 'driver'); drv.vehId = car.id; drv.seat = 0; car.seats[0] = drv.id;
  traffic.joinTraffic(w, car);
  assert.ok(car.ai, 'in traffic');
  // someone standing about in the road further on
  const ped = spawnNpc(w, 'casual', x0 + 330, r.y, 'civ');
  ped.npc.state = 'watch'; ped.npc.until = w.time + 60; ped.vx = 0; ped.vy = 0;
  const go = (secs) => { for (let i = 0; i < secs * 20; i++) { amb.vx = 160; amb.vy = 0; amb.a = 0; w.step(); } };
  // no siren: nothing gives way
  go(0.5);
  assert.ok(!(car.ai.yieldUntil > w.time), 'no siren: the car carries on');
  assert.notEqual(ped.npc.clearFor, amb.id, 'no siren: they stay put');
  // the siren (H)
  send(p, IN.HORN); send(p, 0);
  assert.ok(amb.sirenOn && amb.siren, 'H: the siren on');
  put(amb, x0, r.y + 12, 0); put(car, x0 + 420, r.y + 12, 0); traffic.joinTraffic(w, car);
  put(ped, Math.min(amb.x + 330, car.x - 60), r.y); ped.npc.state = 'watch'; ped.npc.until = w.time + 60;
  go(0.6);
  assert.ok(car.ai && car.ai.yieldUntil > w.time, 'the car ahead gives way');
  assert.equal(ped.npc.clearFor, amb.id, 'they get out of its way');
  assert.ok(ped.npc.hurryUntil > w.time, 'at a run');
  assert.notEqual(w.map.tileAtPx(ped.npc.wx, ped.npc.wy), T.ROAD, 'off the road');
  // a horn: only someone just in front, at a walk
  send(p, IN.HORN); send(p, 0);
  assert.ok(!amb.sirenOn, 'H again: off');
  const sedan = w.spawnVehicle('sedan', r.x + 900, r.y - 12, 0, {});
  const { p: h } = joinPlayer(w);
  put(h.ped, sedan.x, sedan.y); seat(h, sedan);
  const far = spawnNpc(w, 'casual', sedan.x + 330, r.y - 12, 'civ'), close = spawnNpc(w, 'casual', sedan.x + 130, r.y - 12, 'civ');
  for (const q of [far, close]) { q.npc.state = 'watch'; q.npc.until = w.time + 60; q.vx = 0; q.vy = 0; }
  for (let i = 0; i < 12; i++) { put(sedan, r.x + 900, r.y - 12, 0); h.inputQ.push({ seq: ++seq, bits: IN.HORN, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.equal(close.npc.clearFor, sedan.id, 'the horn: the one just in front steps aside');
  assert.ok(!(close.npc.hurryUntil > w.time), 'at a walk');
  assert.notEqual(far.npc.clearFor, sedan.id, 'the horn doesn\'t reach as far as the siren');
});
