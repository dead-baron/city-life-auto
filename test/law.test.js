// The police by your stars (the owner, 11-07: "make it a bit harder to get arrested and have cops be more lenient
// building up to a 1 star ... cops at low star wanted should be a little less good at driving ... wait for 4 to 5 star
// wanted levels before the cops get better" - shared/rules.js LENIENCY, COP_LEVEL; server/systems/law.js tallied,
// police.js, struggle.js): a lesser crime with no stars yet is a warning before it's a star, serious ones are stars at
// once; the per-star table and what it does to the police's driving and running; the struggle's odds at 1 star and 5,
// mashing or holding the button.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { STAR_HEAT, LENIENCY, COP_LEVEL, copLevel, STRUGGLE_CUFF_S } from '../shared/rules.js';
import { IN } from '../shared/input.js';
import { mulberry32 } from '../shared/rng.js';
import * as law from '../server/systems/law.js';
import * as police from '../server/systems/police.js';
import * as players from '../server/systems/players.js';
import * as struggle from '../server/systems/struggle.js';
import { spawnNpc } from '../server/systems/npc.js';

const DT = 0.05;
function listen(w) {
  const log = new Map(), notify = w.notify.bind(w);
  w.notify = (q, text, tone) => { if (q) { if (!log.has(q)) log.set(q, []); log.get(q).push(text); } return notify(q, text, tone); };
  return (q, re) => (log.get(q) || []).some((t) => re.test(t));
}
// a quiet spot with nobody about and no camera, and someone who always calls it in looking at you
function scene(w, p, who = 'casual') {
  teleport(w, p.ped, 94, 94);
  for (const e of [...w.entities.values()]) if (e.npc) w.remove(e);
  const e = spawnNpc(w, who, p.ped.x + 120, p.ped.y, who === 'cop' ? 'cop' : 'civ');
  e.a = Math.PI; e.npc.snitch = 9;
  return e;
}

test('leniency before the first star: a car stolen is a warning, the third in a while a star; in front of an officer the second', () => {
  const w = makeWorld(), told = listen(w);
  const { p } = joinPlayer(w);
  scene(w, p);
  const theft = law.CRIMES.theft.heat, n = Math.ceil(LENIENCY.star / theft);
  for (let i = 1; i < n; i++) {
    law.crime(w, p.ped, 'theft', null);
    assert.equal(p.wanted, 0, `${i} seen: no star yet`);
    assert.ok(Math.abs(law.tallyOf(w, p) - i * theft) < 0.01, `on the tally (${law.tallyOf(w, p)})`);
  }
  assert.ok(told(p, /police have your description/), 'told the police have your description');
  assert.ok(told(p, /Once more/), 'and warned before the one that makes the star');
  assert.ok(!w.dispatch || !w.dispatch.some((d) => d.who === p.pid), 'nobody sent yet');
  law.crime(w, p.ped, 'theft', null);
  assert.equal(p.wanted, 1, `the ${n}th: a star`);
  assert.ok(!law.soft(p), 'the usual chase');
  assert.ok(p.heat >= STAR_HEAT[1] && law.tallyOf(w, p) === 0, 'the tally spent');
  // wanted already: a theft is heat at once, as ever
  const h = p.heat;
  law.crime(w, p.ped, 'theft', null);
  assert.ok(p.heat > h, 'wanted: straight on the heat');
  // the tally fades in a quiet while
  law.clearWanted(w, p);
  law.crime(w, p.ped, 'theft', null);
  w.time += LENIENCY.holdS + theft / LENIENCY.fade + 1;
  assert.equal(law.tallyOf(w, p), 0, 'gone after a quiet while');
  // in front of an officer it counts LENIENCY.cop times
  const { p: q } = joinPlayer(w);
  scene(w, q, 'cop');
  law.crime(w, q.ped, 'theft', null);
  assert.equal(q.wanted, 0, 'an officer saw one: a warning');
  assert.ok(told(q, /an officer saw that/));
  law.crime(w, q.ped, 'theft', null);
  assert.equal(q.wanted, 1, 'the second in front of them: a star');
});

test('serious crimes are stars at once, with no warning: murder, an assault, striking or killing an officer', () => {
  const w = makeWorld();
  for (const [type, stars] of [['murder', 2], ['assault', 1], ['copPunch', 2], ['copAssault', 2], ['copMurder', 3], ['robbery', 1]]) {
    const { p } = joinPlayer(w);
    scene(w, p);
    law.crime(w, p.ped, type, null);
    assert.ok(p.wanted >= stars, `${type}: ${p.wanted} stars at once`);
  }
  for (const type of ['theft', 'hitrun', 'carjack', 'brandish', 'cargoTheft']) assert.ok(!law.CRIMES[type].felony && !law.CRIMES[type].now && !law.CRIMES[type].minor, `${type}: on the tally`);
});

test('the per-star table: worse at 1-3 stars, the old sharp police at 4-5', () => {
  for (let s = 1; s <= 5; s++) assert.equal(copLevel(s), COP_LEVEL[s]);
  assert.equal(copLevel(0), COP_LEVEL[1]); assert.equal(copLevel(9), COP_LEVEL[5]);
  for (let s = 2; s <= 5; s++) {
    const a = COP_LEVEL[s - 1], b = COP_LEVEL[s];
    assert.ok(b.drive >= a.drive && b.foot >= a.foot && b.react <= a.react && b.cuffS <= a.cuffS && b.lostS >= a.lostS && b.cool <= a.cool && b.exitS <= a.exitS && b.drain <= a.drain, `${s} stars at least as sharp as ${s - 1}`);
  }
  for (const s of [1, 2, 3]) {
    const L = COP_LEVEL[s];
    assert.ok(L.drive < 0.9 && L.react > 0 && !L.ram && L.foot < 1 && L.cuffS > STRUGGLE_CUFF_S && L.lostS < 20 && L.cool > 1, `${s} star: easier`);
  }
  for (const s of [4, 5]) {
    const L = COP_LEVEL[s];
    assert.ok(L.drive === 1 && L.react === 0 && L.ram && L.foot === 1 && L.cuffS === STRUGGLE_CUFF_S && L.lostS === 20 && L.cool === 1, `${s} stars: as they were`);
  }
});

// A unit after a player in a car down a straight road: how fast it wants to go, where it steers for, and whether it brakes
// for the car right in front (driveToward's ai.ctl - what it asked of the pedals this tick)
function chase(stars, gap) {
  const w = makeWorld();
  const r = straightRoad(w.map, 1400);
  const { p } = joinPlayer(w);
  for (const e of [...w.entities.values()]) if (e.npc) w.remove(e);
  const car = w.spawnVehicle('sedan', r.x + 200 + gap, r.y, 0, {});
  car.seats[0] = p.ped.id; p.ped.vehId = car.id; p.ped.seat = 0;
  teleport(w, p.ped, car.x, car.y);
  law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, car.x, car.y);
  const v = w.spawnVehicle('police', r.x + 200, r.y, 0, {});
  v.despawnable = false;
  for (let i = 0; i < 2; i++) { const c = spawnNpc(w, 'cop', v.x, v.y, 'cop'); c.npc.unit = v.id; c.vehId = v.id; c.seat = i; v.seats[i] = c.id; }
  v.ai = { kind: 'police', target: p.pid, mode: 'drive', route: null, routeAt: 0, force: 'police' };
  (w.police ??= new Set()).add(v.id);
  p.seenAt = w.time;
  return { w, p, v, car };
}
test('the police drive by your stars: slower, late on your turns and never ramming at 1-3; flat out and leaning on you at 4-5', () => {
  const step = (o) => { o.p.seenAt = o.w.time; police.update(o.w, DT); o.w.time += DT; o.w.tick++; };
  const want = {};
  for (const s of [1, 4]) {
    const o = chase(s, 420);
    step(o);
    want[s] = o.v.ai.ctl.speed;
    // the car swerves across the road: at 1 star they steer for where it was a moment ago
    const y0 = o.car.y;
    o.car.y += 60; o.w.place(o.car); o.p.ped.y = o.car.y; o.w.place(o.p.ped);
    for (let i = 0; i < 4; i++) step(o);
    const aim = o.v.ai.ctl.wy;
    if (s === 1) assert.ok(Math.abs(aim - y0) < 5, `1 star: still steering for where you were (${(aim - y0).toFixed(1)} px off)`);
    else assert.ok(Math.abs(aim - o.car.y) < 5, `4 stars: steering for where you are (${(aim - o.car.y).toFixed(1)} px off)`);
  }
  assert.ok(Math.abs(want[1] - 720 * COP_LEVEL[1].drive) < 1 && Math.abs(want[4] - 720) < 1, `top speed asked: ${want[1]} at 1 star, ${want[4]} at 4`);
  // right on the car's bumper: at 1 star they brake for it, at 4 they drive into it (the PIT)
  const brake = {};
  for (const s of [1, 4]) { const o = chase(s, 130); o.v.vx = 300; step(o); brake[s] = o.v.ai.ctl.speed; }
  assert.ok(brake[1] < 200 && brake[4] >= 600, `close behind: ${brake[1].toFixed(0)} px/s at 1 star, ${brake[4].toFixed(0)} at 4`);
});

test('on foot at 1-3 stars an officer is a step slower than you and tires sooner; at 4-5 as before', () => {
  const w = makeWorld();
  const c = spawnNpc(w, 'cop', 200, 200, 'cop');
  const m1 = police.copMods(w, c, 1), m4 = police.copMods(w, c, 4), mNpc = police.copMods(w, c);
  assert.ok(Math.abs(m1.speedMul - COP_LEVEL[1].foot) < 1e-9 && m1.speedMul < 1, `1 star: ${m1.speedMul} of the pace`);
  assert.equal(m4.speedMul, 1);
  assert.ok(m1.drainMul > m4.drainMul && m4.drainMul === 0.35, 'they tire sooner at 1 star; at 4 they sprint long as ever');
  assert.deepEqual([mNpc.speedMul, mNpc.drainMul], [m4.speedMul, m4.drainMul], 'after an NPC crook: as ever');
});

// ---- the struggle's odds, simulated (the struggle and the inputs only) ----------------------------------------------
function odds(w, p, { stars = 1, who = ['cop'], gap = [2, 4], hold = false, n = 160, seed = 1 }) {
  const r = mulberry32(seed);
  let free = 0;
  for (let k = 0; k < n; k++) {
    p.wanted = stars; p.heat = STAR_HEAT[stars] + 2;
    p.ped.hp = 100; p.ped.downUntil = w.time + 2.5; p.ped.graceUntil = 0;
    const cops = who.map((a, i) => { const c = spawnNpc(w, a, p.ped.x + 18, p.ped.y + i * 10, 'cop'); c.npc.unit = 1; return c; });
    for (const c of cops) struggle.grab(w, c, p.ped);
    let next = 1;
    for (let i = 1; i < 200 && p.struggle; i++) {
      let press = false;
      if (gap && i >= next) { press = true; next = i + gap[0] + Math.floor(r() * (gap[1] - gap[0] + 1)); }
      p.inputQ.push({ seq: p.ack + 1, bits: hold || press ? IN.FIRE : 0, mx: Math.floor(i / 4) % 2 ? 1 : -1, my: 0, aim: 0 });
      w.time += DT; w.tick++;
      players.processInputs(w, DT);
      struggle.update(w, DT);
    }
    if (!p.custody) free++;
    p.custody = null; p.ped.cuffed = false; p.struggle = null; p.ped.downUntil = 0;
    for (const c of cops) w.remove(c);
  }
  return free / n;
}
test('the struggle at 1 star favours you - mashing, two officers on you, or holding the button on a phone; at 5 stars hardly ever', () => {
  const w = makeWorld({ rand: mulberry32(71) });
  const { p } = joinPlayer(w);
  const n = w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  const pc = (x) => `${Math.round(x * 100)}%`;
  const one1 = odds(w, p, { stars: 1, seed: 1 }), two1 = odds(w, p, { stars: 1, who: ['cop', 'cop'], seed: 2 });
  const hold1 = odds(w, p, { stars: 1, hold: true, gap: null, seed: 3 }), hold2 = odds(w, p, { stars: 1, hold: true, gap: null, who: ['cop', 'cop'], seed: 4 });
  const one5 = odds(w, p, { stars: 5, seed: 5 }), two5 = odds(w, p, { stars: 5, who: ['cop', 'cop'], seed: 6 }), hold5 = odds(w, p, { stars: 5, hold: true, gap: null, seed: 7 });
  const said = `1 star: one cop ${pc(one1)}, two ${pc(two1)}, holding ${pc(hold1)} (two: ${pc(hold2)}); 5 stars: one ${pc(one5)}, two ${pc(two5)}, holding ${pc(hold5)}`;
  if (process.env.DBG) console.log(said);
  assert.ok(one1 >= 0.9 && two1 >= 0.7, `mashing at 1 star: nearly always free, and still most of the time with two on you (${said})`);
  assert.ok(hold1 >= 0.45 && hold1 < one1, `holding it down at 1 star: a fair chance, less than mashing (${said})`);
  assert.ok(one5 <= 0.08 && two5 <= 0.03 && hold5 <= 0.02, `5 stars: hardly ever (${said})`);
  // the HUD: the time to the cuffs is the star's, and whether you're winning it
  p.wanted = 1; p.heat = STAR_HEAT[1] + 2; p.ped.downUntil = w.time + 2.5;
  const c = spawnNpc(w, 'cop', p.ped.x + 18, p.ped.y, 'cop'); c.npc.unit = 1;
  struggle.grab(w, c, p.ped);
  assert.equal(struggle.meInfo(w, p).left, COP_LEVEL[1].cuffS);
  for (let i = 0; i < 6; i++) { p.inputQ.push({ seq: p.ack + 1, bits: i % 2 ? 0 : IN.FIRE, mx: 0, my: 0, aim: 0 }); w.time += DT; w.tick++; players.processInputs(w, DT); struggle.update(w, DT); }
  assert.equal(struggle.meInfo(w, p).up, 1, 'mashing: the meter rising - "you\'re winning"');
});
