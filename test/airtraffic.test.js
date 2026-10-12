// Aircraft about the world (server/systems/airtraffic.js, H66): a light plane's take-off roll from the runway and its
// climb away; one coming in from far out on the runway's line, gliding down, landing softly on the runway and rolling
// to a stop; the news helicopter circling over a chase. NPC pilots (v.autopilot: aircraft.js steps their sticks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run } from './helpers.js';
import { STAR_HEAT } from '../shared/constants.js';
import { AIR_TRAFFIC } from '../shared/rules.js';
import { onStrip, FLY } from '../shared/flight.js';
import { VEHICLES } from '../shared/vehicles.js';
const airtraffic = await import('../server/systems/airtraffic.js');
const law = await import('../server/systems/law.js');

const w = makeWorld();
run(w, 0.2);
const rws = airtraffic.runways(w.map);
const A = (w.airTraffic ||= { flights: new Map(), nextAt: 1e9, newsAt: 1e9 });
A.nextAt = 1e9; A.newsAt = 1e9;   // (only the flights the tests start)
const flightOf = (v) => A.flights.get(v.id);

test('the runways and airstrips the planes use', () => {
  assert.ok(rws.length >= 2, `the airport's runway and an airstrip (${rws.map((r) => r.name).join(', ')})`);
  assert.ok(rws.every((r) => r.len > 600), 'long enough');
});

test('a light plane takes off from the runway and flies away', () => {
  const r = rws.find((q) => !q.strip) || rws[0];
  const v = airtraffic.planeFlight(w, A, { rw: r, mode: 'out', force: true, seen: true });
  assert.ok(v, 'a departure');
  assert.equal(v.def.i, VEHICLES.plane.i, 'the Larkspur');
  assert.ok(v.autopilot && v.seats[0], 'a pilot at the controls');
  assert.ok(onStrip(w.map, v.x, v.y), 'on the runway');
  let top = 0, rolled = 0;
  const x0 = v.x, y0 = v.y;
  for (let i = 0; i < 40 * 20 && !v.removed; i++) { w.step(); top = Math.max(top, v.alt || 0); rolled = Math.max(rolled, Math.hypot(v.x - x0, v.y - y0)); }
  assert.ok(!v.wreckAt, 'no crash');
  assert.ok(top > 250, `up and away (${Math.round(top)} px up)`);
  assert.ok(rolled > 1500 || v.removed, `flown off (${Math.round(rolled)} px)`);
});

test('a light plane comes in, glides down the runway\'s line and lands softly, rolling to a stop on it', () => {
  const r = rws.find((q) => !q.strip) || rws[0];
  const v = airtraffic.planeFlight(w, A, { rw: r, mode: 'land', force: true });
  assert.ok(v, 'an arrival');
  assert.ok(v.alt > 200, 'far out and up');
  const f = flightOf(v);
  let sink = 0;
  for (let i = 0; i < 60 * 20 && f.mode !== 'stopped' && !v.removed; i++) { w.step(); if (v.landAt === w.time) sink = Math.max(sink, v.landSink || 0); }
  assert.ok(!v.wreckAt, 'no crash');
  assert.equal(f.mode, 'stopped', 'down and stopped');
  assert.ok((v.alt || 0) <= 0.5, 'on its wheels');
  assert.ok(onStrip(w.map, v.x, v.y), 'on the runway');
  assert.ok(sink < FLY.HARD_SINK, `a soft touchdown (${Math.round(sink)} px/s)`);
  assert.ok(v.hp > v.def.hp * 0.95, 'unhurt');
  const x1 = v.x, y1 = v.y;
  for (let i = 0; i < 3 * 20; i++) w.step();
  assert.ok(Math.hypot(v.x - x1, v.y - y1) < 6, 'stopped, it stays put (no creeping back)');
});

test('someone on the runway: it goes round instead of landing on them; stopped, it stays put', () => {
  const r = rws.find((q) => !q.strip) || rws[0];
  for (const f0 of [...A.flights.values()]) { const q = w.get(f0.vid); A.flights.delete(f0.vid); if (q) { for (const id of q.seats) { const c = id && w.get(id); if (c) w.remove(c); } w.remove(q); } }
  const { p } = joinPlayer(w);
  const v = airtraffic.planeFlight(w, A, { rw: r, mode: 'land', force: true, dir: 1 });
  const f = flightOf(v);
  p.ped.x = f.tx + f.ux * 250; p.ped.y = f.ty + f.uy * 250; w.place(p.ped);
  const hp0 = p.ped.hp;
  for (let i = 0; i < 20 * 20 && f.mode === 'approach'; i++) w.step();
  assert.equal(f.mode, 'climb', 'gone round');
  assert.ok(f.round, '(for them)');
  for (let i = 0; i < 4 * 20; i++) w.step();
  assert.equal(p.ped.hp, hp0, 'unhurt');
  assert.ok(!v.wreckAt, 'no crash');
});

test('the news helicopter comes to circle a chase, then flies off', () => {
  const { p } = joinPlayer(w);
  const r = rws[0];
  p.ped.x = r.x + 2000; p.ped.y = r.y; w.place(p.ped);
  law.addHeat(w, p, STAR_HEAT[AIR_TRAFFIC.newsStars] - p.heat + 1, p.ped.x, p.ped.y);
  A.newsAt = 0;
  for (const f of [...A.flights.values()]) if (f.kind === 'news') A.flights.delete(f.vid);
  for (let i = 0; i < 25 && ![...A.flights.values()].some((f) => f.kind === 'news'); i++) w.step();
  const f = [...A.flights.values()].find((q) => q.kind === 'news');
  assert.ok(f, 'the news helicopter is sent');
  const v = w.get(f.vid);
  assert.equal(v.def.livery, 'news', 'the Skylark in its news colours');
  // (only the helicopters at work: the squad cars sent for them taken off the board, so nobody's cuffed meanwhile)
  const noCars = () => {
    for (const vid of [...(w.police || [])]) { const q = w.get(vid); if (q) { for (const id of q.seats) { const c = id && w.get(id); if (c) w.remove(c); } w.remove(q); } w.police.delete(vid); }
    for (const e of [...w.entities.values()]) if (e.npc && e.npc.role === 'cop' && !e.npc.air) w.remove(e);
    if (w.stops) w.stops.clear();
  };
  for (let i = 0; i < 25 * 20; i++) { noCars(); p.seenAt = w.time; w.step(); }
  const d = Math.hypot(v.x - p.ped.x, v.y - p.ped.y);
  assert.ok(d < AIR_TRAFFIC.newsR * 2, `circling over them (${Math.round(d)} px off; ${f.mode}, ${Math.round(v.alt)} up, wreck ${!!v.wreckAt}, removed ${!!v.removed}, at ${Math.round(v.x)},${Math.round(v.y)} them ${Math.round(p.ped.x)},${Math.round(p.ped.y)} centre ${Math.round(f.x)},${Math.round(f.y)})`);
  assert.ok(v.alt > FLY.HIGH, 'up in the air');
  law.clearWanted(w, p);
  for (let i = 0; i < 3 * 20; i++) w.step();
  assert.equal(f.mode, 'leave', 'the chase over: off it goes');
});

test('the news helicopter keeps its height clear of the police helicopter over a chase downtown - they never collide (H69)', async () => {
  const policeair = await import('../server/systems/policeair.js');
  const { POLICE_AIR } = await import('../shared/rules.js');
  const w2 = makeWorld();
  run(w2, 0.2);
  const A2 = (w2.airTraffic ||= { flights: new Map(), nextAt: 1e9, newsAt: 1e9 });
  const pad = policeair.hqPad(w2.map);
  const { p } = joinPlayer(w2);
  p.ped.x = pad.x + 1500; p.ped.y = pad.y + 300; w2.place(p.ped);   // (downtown: the roofs push both up to the same height)
  const noCars = () => {
    for (const vid of [...(w2.police || [])]) { const v = w2.get(vid); if (v) { for (const id of v.seats) { const c = id && w2.get(id); if (c) w2.remove(c); } w2.remove(v); } w2.police.delete(vid); }
    for (const e of [...w2.entities.values()]) if (e.npc && e.npc.role === 'cop' && !e.npc.air) w2.remove(e);
    if (w2.stops) w2.stops.clear();
  };
  law.addHeat(w2, p, STAR_HEAT[3] - p.heat + 1, p.ped.x, p.ped.y);
  for (let i = 0; i < 30; i++) { noCars(); w2.step(); }
  const u = w2.policeAir.get(p.pid), pv = w2.get(u.vid);
  const nv = airtraffic.news(w2, A2, p);
  let closest = Infinity;
  for (let i = 0; i < 40 * 20; i++) {
    noCars(); p.seenAt = w2.time; w2.step();
    if (Math.hypot(pv.x - nv.x, pv.y - nv.y) < 300 && (pv.alt || 0) > FLY.HIGH) closest = Math.min(closest, Math.abs(pv.alt - nv.alt));
  }
  assert.ok(!pv.wreckAt && !nv.wreckAt, 'neither came down');
  assert.ok(closest > 50, `never near each other at one height (${closest === Infinity ? 'never near' : Math.round(closest)} px apart when close)`);
  assert.ok(nv.alt >= pv.alt + POLICE_AIR.sep - 40, `the news one above the police one (${Math.round(nv.alt)} vs ${Math.round(pv.alt)})`);
});
