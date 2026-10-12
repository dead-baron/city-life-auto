// The firefighter (H68, server/systems/firefighter.js): signing on at a fire station or from the phone issues a fire
// engine (a work truck) whose siren the H key works; the calls (a car on fire, a burning wreck, someone on fire, a grass
// fire, a dumpster, a kitchen) each from the built map; the hose (the fire button on foot near the engine) puts out a
// burning car before it blows and a person on fire; a grass fire spreads tile to tile, stops at the water and dies in
// the rain; the pay (the kind, how fast, what was saved); a fire left alone blows up or spreads; the page's messages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { K, TILE, WEATHER } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { FIRE, BURN } from '../shared/rules.js';

const ff = await import('../server/systems/firefighter.js');
const phone = await import('../server/systems/phone.js');
const burning = await import('../server/systems/burning.js');

const w = makeWorld();
run(w, 0.2);
const S = ff.sitesOf(w.map);
let seq = 0;
const send = (p, bits, secs = 0.05, aim = 0) => { for (let t = 0; t < secs - 1e-6; t += 0.05) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim }); w.step(); } };
const put = (e, x, y) => { e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.lz = 0; w.place(e); };
function onShift() {
  const { p, prof, conn } = joinPlayer(w);
  const st = S.stations[0];
  put(p.ped, st.x + 20, st.y + 20);
  const r = phone.handle(w, p, { a: 'take', id: 'fire' });
  assert.equal(r.err, null, 'signed on');
  p.job.nextAt = 1e9;   // (the calls come when the test says)
  return { p, prof, conn, v: w.get(p.job.truck) };
}
// stand dist px from (x, y) where the water has a clear line to it (no wall between), the engine parked behind you; aim
// at it and hold fire
const BLOCK = new Set([0, 5]);   // (T.WALL, T.BUILDING: they stop the water)
function spotFor(x, y, dist) {
  for (const d of [dist, dist * 0.7, dist * 1.3, 60]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
    let ok = true;
    for (let u = 0; u <= d + 120 && ok; u += 8) { const t = w.map.tileAtPx(x + Math.cos(a) * u, y + Math.sin(a) * u); if (BLOCK.has(t) && u > 20) ok = false; }
    const tb = w.map.tileAtPx(x + Math.cos(a) * (d + 90), y + Math.sin(a) * (d + 90));
    if (ok && !BLOCK.has(w.map.tileAtPx(sx, sy)) && tb !== 6 && tb !== 7) return { sx, sy, aim: a + Math.PI, bx: x + Math.cos(a) * (d + 90), by: y + Math.sin(a) * (d + 90) };
  }
  return { sx: x - dist, sy: y, aim: 0, bx: x - dist - 90, by: y };
}
function hoseAt(p, v, x, y, secs, dist = 110) {
  const s = spotFor(x, y, dist);
  put(v, s.bx, s.by);
  put(p.ped, s.sx, s.sy);
  send(p, IN.FIRE | IN.AIMING, secs, s.aim);
  send(p, 0);
}
const clearRound = (x, y, r) => { for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && !e.player)) && Math.hypot(e.x - x, e.y - y) < r && !e.fireCall) w.remove(e); };

test('signing on at a fire station or from the phone issues a fire engine, marked; its siren works; the job is on the list', () => {
  assert.ok(S.stations.length >= 1, 'fire stations found on the built map');
  const { p } = joinPlayer(w);
  const board = phone.handle(w, p, { a: 'board' });
  assert.ok(board.jobs.some((j) => j.id === 'fire' && /Firefighter/.test(j.title)), 'on the phone\'s job list');
  const st = S.stations[0];
  put(p.ped, st.x + 10, st.y + 10);
  const players = w.players;
  assert.ok(players.has(p.pid));
  const act = ff.interaction(w, p);
  assert.ok(act && /firefighter/.test(act.label), 'Act at the station offers it');
  act.run();
  assert.equal(p.job.type, 'fire');
  const v = w.get(p.job.truck);
  assert.equal(v.model, 'firetruck', 'a fire engine issued');
  assert.equal(v.issuedTo, p.pid);
  assert.ok(!v.despawnable, 'kept while the job is on');
  const t = phone.jobTarget(w, p);
  assert.ok(t.veh, 'the engine marked (the ring and the arrows)');
  put(p.ped, v.x + 40, v.y);
  send(p, IN.VEHICLE); send(p, 0);
  assert.equal(p.ped.vehId, v.id, 'in at the first press: it\'s yours');
  send(p, IN.HORN); send(p, 0);
  assert.ok(v.sirenOn && v.siren, 'H puts the siren on (traffic pulls over for it)');
  phone.handle(w, p, { a: 'cancel' });
});

test('a car on fire: left alone it blows; the hose on it in time puts it out - saved, paid with the bonus', () => {
  const { p, prof, v } = onShift();
  const site = S.kerb[5];
  clearRound(site.x, site.y, 400);
  const c = ff.callAt(w, p, 'car', site);
  assert.ok(c, 'a car call');
  const car = w.get(c.veh);
  run(w, 0.2);
  assert.ok(car.burnUntil > w.time, 'it burns');
  const cash0 = prof.cash;
  run(w, FIRE.car.boomS + 1);
  assert.ok(car.wreckAt, 'left alone it blew up');
  assert.equal(p.job.call, null, 'the call is over');
  assert.equal(prof.cash, cash0, 'unpaid');
  // a second: the water on it
  const site2 = S.kerb[40];
  clearRound(site2.x, site2.y, 400);
  const c2 = ff.callAt(w, p, 'car', site2);
  const car2 = w.get(c2.veh);
  run(w, 0.5);
  hoseAt(p, v, car2.x, car2.y, FIRE.car.douseS + 0.5);
  assert.ok(car2.fireOut && !car2.wreckAt, 'out, not blown');
  assert.ok(!(car2.burnUntil > w.time), 'no flames');
  assert.equal(p.job.call, null, 'the call is done');
  assert.ok(p.job.lastPay.saved && p.job.lastPay.pay >= FIRE.pay.car + FIRE.pay.saved, `paid with the saved bonus ($${p.job.lastPay.pay})`);
  assert.equal(prof.cash, cash0 + p.job.lastPay.pay);
  run(w, FIRE.car.boomS + 2);
  assert.ok(!car2.wreckAt, 'and it never blows');
  phone.handle(w, p, { a: 'cancel' });
});

test('someone on fire: they catch as the crew pulls up; the hose puts them out - a life saved; left burning they die', () => {
  const { p, v } = onShift();
  const site = S.shops[3];
  clearRound(site.x, site.y, 300);
  const c = ff.callAt(w, p, 'person', site);
  const q = w.get(c.victim);
  run(w, 1);
  assert.ok(!burning.burning(q), 'not alight while the crew is far off');
  put(v, q.x - 200, q.y); put(p.ped, q.x - 110, q.y);
  run(w, 0.2);
  assert.ok(c.lit && burning.burning(q), 'alight as the crew pulls up');
  hoseAt(p, v, q.x, q.y, 0.5);
  assert.ok(!burning.burning(q) && !q.dead, 'doused, alive');
  assert.equal(p.job.call, null);
  assert.ok(p.job.lastPay.saved && p.job.lastPay.pay >= FIRE.pay.person + FIRE.pay.life, `a life saved pays ($${p.job.lastPay.pay})`);
  // left to burn
  const site2 = S.shops[12];
  clearRound(site2.x, site2.y, 300);
  const c2 = ff.callAt(w, p, 'person', site2);
  const q2 = w.get(c2.victim);
  put(v, q2.x - 300, q2.y); put(p.ped, q2.x - 260, q2.y);
  run(w, FIRE.person.lifeS + 4);
  assert.ok(q2.dead, 'they burned to death');
  assert.equal(p.job.lastPay.pay, 0, 'unpaid');
  phone.handle(w, p, { a: 'cancel' });
});

test('a grass fire spreads tile to tile, leaves scorched ground, stops where the water is; out, it pays less the more burned', () => {
  w.weather = WEATHER.CLEAR; w.nextWeatherRoll = w.time + 1e6;
  const { p, v } = onShift();
  const said = [];
  const notify = w.notify.bind(w);
  w.notify = (pl, text, tone) => { if (pl === p) said.push(text); return notify(pl, text, tone); };
  const site = S.grass[Math.floor(S.grass.length / 2)];
  const c = ff.callAt(w, p, 'grass', site);
  assert.ok(c && ff.burningTiles(w, c.id).length >= 2, 'lit');
  run(w, 14);
  assert.ok(c.burned > FIRE.grass.start + 3, `it spread (${c.burned} tiles)`);
  assert.ok(w.tfire.scorch.size > 0, 'scorched ground behind it');
  // the page hears of it
  const { p: near, conn } = joinPlayer(w);
  put(near.ped, site.x, site.y);
  run(w, 0.6);
  const msg = conn.sent.filter((m) => m && m.t === 'fires').pop();
  assert.ok(msg && msg.f.length >= 4 && msg.s.length >= 2, 'the fires and the scorch sent to the page nearby');
  // the hose along the front, tile by tile, until it's out
  for (let k = 0; k < 200 && p.job && ff.burningTiles(w, c.id).length; k++) {
    const f = ff.burningTiles(w, c.id)[0];
    hoseAt(p, v, f.tx * TILE + 16, f.ty * TILE + 16, 0.5, 90);
  }
  w.notify = notify;
  assert.ok(p.job, `still on the job (${said.slice(-3).join(' / ')})`);
  assert.equal(ff.burningTiles(w, c.id).length, 0, 'out');
  assert.equal(p.job.call, null, 'the call is done');
  const pay = p.job.lastPay.pay;
  assert.ok(pay > 0 && pay < FIRE.pay.grass * (1 + FIRE.pay.fast), `paid, less what burned ($${pay}, ${p.job.lastPay.burned} tiles)`);
  // a wet tile won't catch
  const fw = [...w.tfire.wet.keys()][0];
  assert.ok(fw !== undefined, 'the water left wet ground');
  phone.handle(w, p, { a: 'cancel' });
  for (const id of [...w.players.keys()]) if (w.players.get(id) === near) w.players.delete(id);
});

test('the rain: a grass fire hardly spreads and dies out fast', () => {
  const dry = { done: 0 }, wet = { done: 0 };
  for (const [weather, out] of [[WEATHER.CLEAR, dry], [WEATHER.RAIN, wet]]) {
    w.weather = weather; w.rainUntil = w.time + 1e6; w.nextWeatherRoll = w.time + 1e6;
    w.tfire.on.clear(); w.tfire.scorch.clear(); w.tfire.wet.clear();
    const site = S.grass[(weather ? 7 : 11) % S.grass.length];
    const tx = Math.floor(site.x / TILE), ty = Math.floor(site.y / TILE);
    for (let n = 0; n < 4; n++) ff.light(w, tx + (n % 2), ty + (n >> 1), 0, 0);
    let t = 0;
    while (w.tfire.on.size && t < 60) { run(w, 1); t++; }
    out.t = t; out.n = w.tfire.scorch.size;
  }
  w.weather = WEATHER.CLEAR;
  assert.ok(wet.t < dry.t / 2, `out sooner in the rain (${wet.t}s vs ${dry.t}s)`);
  assert.ok(wet.n < dry.n / 2, `burns far less (${wet.n} vs ${dry.n} tiles)`);
  w.tfire.on.clear(); w.tfire.scorch.clear(); w.tfire.wet.clear();
});

test('a burning wreck, a dumpster and a kitchen fire: the hose puts each out and it pays; a kitchen left alone grows', () => {
  const { p, v, prof } = onShift();
  const kerb = S.kerb[80];
  clearRound(kerb.x, kerb.y, 400);
  const c = ff.callAt(w, p, 'wreck', kerb);
  const wr = w.get(c.veh);
  run(w, 30);
  assert.ok(wr.wreckAt && wr.burnUntil > w.time && !wr.removed, 'a wreck burning, not tidied away');
  hoseAt(p, v, wr.x, wr.y, FIRE.wreck.douseS + 0.5);
  assert.ok(wr.fireOut && p.job.call === null && p.job.lastPay.pay > 0, 'the wreck is out, paid');
  const shop = S.shops.find((q) => q.dump) || S.shops[0];
  const c2 = ff.callAt(w, p, 'dumpster', shop);
  const f = ff.burningTiles(w, c2.id)[0];
  assert.ok(f && f.k === 1, 'a dumpster fire');
  hoseAt(p, v, f.tx * TILE + 16, f.ty * TILE + 16, FIRE.spot.dumpster * FIRE.spot.max + 1, 90);
  assert.equal(p.job.call, null, 'the dumpster is out');
  const food = S.food[2];
  const c3 = ff.callAt(w, p, 'kitchen', food);
  const k = ff.burningTiles(w, c3.id)[0];
  assert.equal(k.k, 2, 'a kitchen fire');
  const h0 = k.h;
  run(w, 10);
  assert.ok(k.h > h0, 'left alone it grows');
  const cash0 = prof.cash;
  hoseAt(p, v, k.tx * TILE + 16, k.ty * TILE + 16, FIRE.spot.kitchen * FIRE.spot.max + 1, 90);
  assert.equal(p.job.call, null, 'the kitchen fire is out');
  assert.ok(prof.cash > cash0, 'paid');
  phone.handle(w, p, { a: 'cancel' });
});

test('the hose: only within its length of the engine; drawn for everyone (the hose event); faster pays more', () => {
  const { p, v } = onShift();
  const seen = [];
  const emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { seen.push(ev); emit(x, y, ev); };
  const st = S.stations[0];
  put(v, st.x, st.y + 300); put(p.ped, st.x + 40, st.y + 300);
  send(p, IN.FIRE | IN.AIMING, 0.3, 0); send(p, 0);
  const ev = seen.find((e) => e.e === 'hose' && e.id === p.ped.id);
  assert.ok(ev && ev.l > 0 && Number.isFinite(ev.a) && Number.isFinite(ev.tx), 'the hose event: who, where, the angle, the reach, the engine');
  seen.length = 0;
  put(p.ped, v.x + FIRE.hose.len + 60, v.y);
  send(p, IN.FIRE | IN.AIMING, 0.3, 0); send(p, 0);
  assert.ok(!seen.some((e) => e.e === 'hose'), 'too far from the engine: no water');
  w.emit = emit;
  // the pay: quick beats slow
  const pays = [];
  for (const late of [0, 200]) {
    const site = S.kerb[120 + late / 10];
    clearRound(site.x, site.y, 400);
    const c = ff.callAt(w, p, 'dumpster', S.shops[5 + late / 100]);
    c.at -= late;
    const f = ff.burningTiles(w, c.id)[0];
    hoseAt(p, v, f.tx * TILE + 16, f.ty * TILE + 16, FIRE.spot.dumpster * FIRE.spot.max + 1, 90);
    pays.push(p.job.lastPay.pay);
  }
  assert.ok(pays[0] > pays[1], `a quick call pays more ($${pays[0]} vs $${pays[1]})`);
  phone.handle(w, p, { a: 'cancel' });
});
