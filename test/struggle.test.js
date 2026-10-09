// Fighting back (the owner's note 2026-10-09 05:01; server/systems/struggle.js): tackled or grabbed by an officer, a wanted
// player struggles instead of being pinned and cuffed on the spot. Mashing the attack button fills the meter and throws
// the officer off (down a moment, you up with a grace from the next tackle); not fighting gets you cuffed; the odds by
// stars, health and who's on you (simulated struggles); two officers are harder; once cuffed there's no struggle;
// punching the officer afterwards is assaulting an officer; the HUD and the descriptor carry it to the client. And the
// tackle before it (the owner's note 07:06, "1 or 2 stars should give you a good chance of getting away"): at low stars
// often only a trip, a shorter knockdown on the face or the back, moving gets you up sooner, the officer who dove is down a
// moment too, and the others walk up to you on the ground.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { STAR_HEAT, K, PF } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { mulberry32 } from '../shared/rng.js';
import { STRUGGLE_CUFF_S, STRUGGLE_GRACE_S, STRUGGLE_KNOCK_S, TACKLE_TRIP_SHARE, TACKLE_TRIP_S, TACKLE_DOWN_BY_STARS, TACKLE_DOWN_S, TACKLE_RECOVER_S, TACKLE_APPROACH } from '../shared/rules.js';
import { PED } from '../shared/physics.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as struggle from '../server/systems/struggle.js';
import * as police from '../server/systems/police.js';
import { spawnNpc } from '../server/systems/npc.js';
import { _descriptor } from '../server/net.js';

const DT = 0.05;
function corner(w) { return w.map.nodes.find((q) => q.lvl === 0 && Math.hypot(q.x - 26000, q.y - 17000) < 2500); }
function wanted(w, p, stars) { law.addHeat(w, p, STAR_HEAT[stars] + 2 - p.heat, p.ped.x, p.ped.y); }
function until(w, cond, seconds) { for (let i = 0; i < seconds * 20; i++) { w.step(); if (cond()) return true; } return false; }
// the events the world emits (they're cleared every tick)
function hear(w) {
  const log = [], emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { log.push(ev); return emit(x, y, ev); };
  return (kind) => log.some((ev) => ev.e === kind);
}
// an officer of a police unit (police.js drives them), right by the player
function officer(w, p, who = 'cop', dx = 18, dy = 0) {
  const v = w.spawnVehicle('police', p.ped.x + 260, p.ped.y + 40, 0, {});
  v.despawnable = false;
  const c = spawnNpc(w, who, p.ped.x + dx, p.ped.y + dy, 'cop');
  c.npc.unit = v.id;
  v.ai = { kind: 'police', target: p.pid, mode: 'foot', route: null, routeAt: 0, force: 'police', footAt: w.time };
  (w.police ??= new Set()).add(v.id);
  return c;
}
// one input a tick: the attack button pressed every `gap` ticks (0: never), the stick swung left and right every 4 ticks
function pad(p, i, gap, wriggle = false) {
  const bits = gap && i % gap === 0 ? IN.FIRE : 0;
  const mx = wriggle ? (Math.floor(i / 4) % 2 ? 1 : -1) : 0;
  p.inputQ.push({ seq: p.ack + 1, bits, mx, my: 0, aim: 0 });
}

test('a tackle starts a struggle, not an instant pin: the officer on you, you down and thrashing, no cuffs yet', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  wanted(w, p, 1);
  assert.ok(until(w, () => p.struggle || p.custody, 60), 'the police came and took them down');
  assert.ok(p.struggle && !p.custody && !p.ped.cuffed, 'a struggle - not cuffed');
  const c = w.get(p.struggle.by[0]);
  assert.ok(c && c.npc && c.npc.role === 'cop' && c.pinning === p.ped.id, 'an officer on them');
  w.step();
  assert.ok(p.struggle, 'still struggling');
  assert.ok(players.pedFlags(w, p.ped) & PF.DOWN, 'down on the ground');
  assert.ok(players.pedFlags(w, c) & PF.KNEEL, 'the officer kneeling on them');
  assert.ok(Math.hypot(c.x - p.ped.x, c.y - p.ped.y) < 24, 'right on them');
  assert.equal(_descriptor(p.ped).sg, 1, 'everyone sees them struggle');
});

test('mashing fills the meter and breaks free: the officer thrown down, you up, a grace from the next tackle', () => {
  const w = makeWorld({ rand: mulberry32(5) }), heard = hear(w);
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  p.ped.downUntil = w.time + 2.5;
  assert.ok(struggle.grab(w, cop, p.ped), 'grabbed: a struggle');
  const m0 = p.struggle.m;
  pad(p, 0, 1); w.step(); pad(p, 1, 0); w.step();
  assert.ok(p.struggle.m > m0, 'a press fills the meter');
  // the stick swung left and right fills it a little too
  const m1 = p.struggle.m;
  for (let i = 0; i < 2; i++) { p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: i ? 1 : -1, my: 0, aim: 0 }); players.processInputs(w, DT); }
  assert.ok(p.struggle.m > m1, 'a wriggle fills it a little');
  let i = 2;
  for (; i < 100 && p.struggle; i++) { pad(p, i, 2, true); w.step(); }
  assert.ok(!p.struggle && !p.custody && !p.ped.cuffed, `broke free (after ${(i * DT).toFixed(1)} s)`);
  assert.ok(heard('breakfree') && heard('knockdown') && heard('struggle'), 'grunts, a scuffle, the officer down');
  assert.ok(w.time >= p.ped.downUntil, 'on their feet');
  assert.ok(cop.downUntil - w.time > STRUGGLE_KNOCK_S[1] - 0.3, 'the officer thrown down - a moment to get up (1 star)');
  assert.ok(p.ped.graceUntil - w.time > STRUGGLE_GRACE_S - 0.3, 'a grace from the next tackle');
  assert.equal(_descriptor(p.ped).sg, undefined, 'not struggling any more');
  // they can run: the player moves off at once (the officer still down)
  const x0 = p.ped.x;
  for (let k = 0; k < 10; k++) { p.inputQ.push({ seq: p.ack + 1, bits: IN.SPRINT, mx: -1, my: 0, aim: Math.PI }); w.step(); }
  assert.ok(p.ped.x < x0 - 40, 'up and running');
  // the grace: a second officer right on them can't take them straight down again
  const cop2 = officer(w, p, 'cop', 14, 0);
  cop2.npc.nextDive = 0;
  for (let k = 0; k < 10; k++) { p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step(); }
  assert.ok(!p.struggle && w.time >= p.ped.downUntil, 'no tackle lands during the grace');
});

test('not fighting back: the cuffs go on - as before', () => {
  const w = makeWorld(), heard = hear(w);
  const { p } = joinPlayer(w);
  const n = corner(w);
  teleport(w, p.ped, n.x + 32, n.y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  p.ped.downUntil = w.time + 2.5;
  struggle.grab(w, cop, p.ped);
  let i = 0;
  for (; i < (STRUGGLE_CUFF_S + 1) * 20 && !p.custody; i++) { pad(p, i, 0); w.step(); }
  assert.ok(p.custody && p.custody.stage === 'held' && p.ped.cuffed, `cuffed (after ${(i * DT).toFixed(1)} s)`);
  assert.equal(p.custody.holder, cop.id, 'held by the officer who was on them');
  assert.ok(!p.struggle && !cop.pinning, 'the struggle is over');
  assert.ok(heard('cuffs'), 'the cuffs click shut');
  assert.equal(players.buildMe(w, p).fight, null);
});

// ---- the odds: struggles simulated on one world (the struggle and the inputs only: nothing else needs to run) --------
function odds(w, p, { stars = 1, hp = 100, who = ['cop'], gap = [2, 4], n = 160, seed = 1 }) {
  const r = mulberry32(seed);
  let free = 0;
  for (let k = 0; k < n; k++) {
    p.wanted = stars; p.heat = STAR_HEAT[stars] + 2;
    p.ped.hp = hp; p.ped.maxHp = Math.max(100, hp); p.ped.downUntil = w.time + 2.5; p.ped.graceUntil = 0;
    const cops = who.map((a, i) => { const c = spawnNpc(w, a, p.ped.x + 18, p.ped.y + i * 10, 'cop'); c.npc.unit = 1; return c; });
    for (const c of cops) struggle.grab(w, c, p.ped);
    let next = 1;
    for (let i = 1; i < 120 && p.struggle; i++) {
      const press = gap && i >= next;
      if (press) next = i + gap[0] + Math.floor(r() * (gap[1] - gap[0] + 1));
      p.inputQ.push({ seq: p.ack + 1, bits: press ? IN.FIRE : 0, mx: Math.floor(i / 4) % 2 ? 1 : -1, my: 0, aim: 0 });
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

test('the odds: by stars, by health, by who is on you - punching well (about 7 a second) and working the stick', () => {
  const w = makeWorld({ rand: mulberry32(11) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  const share = {};
  for (const s of [1, 2, 3, 4, 5]) share[s] = odds(w, p, { stars: s, seed: s });
  const pc = (x) => `${Math.round(x * 100)}%`;
  const said = `by stars: ${[1, 2, 3, 4, 5].map((s) => `${s}: ${pc(share[s])}`).join(', ')}`;
  if (process.env.DBG) console.log(said);
  // 1-2 stars a good chance (the owner, 07:06), 3 about half, 4 rarely, 5 hardly ever
  assert.ok(share[1] >= 0.9, `1 star: nearly always free (${said})`);
  assert.ok(share[2] >= 0.8 && share[2] <= share[1], `2 stars: a good chance (${said})`);
  assert.ok(share[3] >= 0.3 && share[3] <= 0.65, `3 stars: about half the time (${said})`);
  assert.ok(share[4] <= 0.2, `4 stars: rarely (${said})`);
  assert.ok(share[5] <= 0.08, `5 stars: hardly ever (${said})`);
  // punching only half as fast: still a good chance at 1 star, less of one
  const lazy = odds(w, p, { stars: 1, gap: [4, 7], seed: 24 });
  if (process.env.DBG) console.log(`1 star, punching half as fast: ${pc(lazy)}`);
  assert.ok(lazy >= 0.5 && lazy < share[1], `1 star, punching half as fast: ${pc(lazy)} (full speed ${pc(share[1])})`);
  // worn down: harder
  const half = odds(w, p, { stars: 1, hp: 50, seed: 21 }), low = odds(w, p, { stars: 1, hp: 30, seed: 22 });
  if (process.env.DBG) console.log(`1 star: half health ${pc(half)}, a third ${pc(low)}`);
  assert.ok(half <= share[1] - 0.12 && low <= 0.6 && low < half, `half health ${pc(half)}, a third ${pc(low)} (full ${pc(share[1])})`);
  // a hearty meal's extra health: a little stronger
  assert.ok(odds(w, p, { stars: 3, hp: 130, seed: 23 }) > share[3], 'more health, stronger');
  // who's on you: SWAT and soldiers hold harder than a cop, an agent a little
  const swat = odds(w, p, { stars: 3, who: ['swat'], seed: 31 }), agent = odds(w, p, { stars: 3, who: ['agent'], seed: 32 });
  if (process.env.DBG) console.log(`3 stars: an agent ${pc(agent)}, SWAT ${pc(swat)}`);
  assert.ok(swat < share[3] - 0.2 && agent < share[3] && swat < agent, `3 stars: a cop ${pc(share[3])}, an agent ${pc(agent)}, SWAT ${pc(swat)}`);
  // the stick alone is never enough: you have to fight
  assert.equal(odds(w, p, { stars: 1, gap: null, n: 20, seed: 41 }), 0, 'no punches, only the stick: always cuffed');
  // punching harder pays
  assert.ok(odds(w, p, { stars: 3, gap: [2, 3], seed: 42 }) > share[3], 'punching harder: better odds');
});

test('two officers on you are harder: a second one joins in and pushes too', () => {
  const w = makeWorld({ rand: mulberry32(12) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  const one = odds(w, p, { stars: 1, seed: 51 }), two = odds(w, p, { stars: 1, who: ['cop', 'cop'], seed: 52 });
  if (process.env.DBG) console.log(`1 star: one cop ${Math.round(one * 100)}%, two ${Math.round(two * 100)}%`);
  // (a patrol car brings two: at 1 star still a good chance)
  assert.ok(two <= one - 0.08 && two >= 0.5, `one cop ${Math.round(one * 100)}%, two ${Math.round(two * 100)}%: harder, still a good chance`);
  const three = odds(w, p, { stars: 3, who: ['cop', 'cop'], seed: 53 });
  assert.ok(three <= 0.25, `3 stars, two on you: ${Math.round(three * 100)}% - rarely`);
  // in the world: the second officer to reach them joins the struggle; a third stands by
  wanted(w, p, 1);
  const a = officer(w, p), b = officer(w, p, 'cop', -16, 4), c3 = officer(w, p, 'cop', 4, -18);
  p.ped.downUntil = w.time + 2.5;
  struggle.grab(w, a, p.ped);
  pad(p, 0, 0); w.step();
  assert.equal(players.buildMe(w, p).fight.n, 2, 'two of them on you');
  assert.ok(b.pinning === p.ped.id && !c3.pinning, 'the second on them, the third standing by');
  assert.ok(!p.custody, 'the third didn\'t cuff them on the spot');
});

test('once cuffed there is no struggle: only the ways out custody.js has', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  p.ped.downUntil = w.time + 3;
  law.arrest(w, cop, p.ped);   // (cuffed: as a player officer does it, or a struggle lost)
  assert.ok(p.custody && p.ped.cuffed);
  assert.equal(struggle.grab(w, officer(w, p, 'cop', -16, 0), p.ped), false, 'nothing to struggle out of');
  for (let i = 0; i < 40; i++) { pad(p, i, 2, true); w.step(); }
  assert.ok(p.custody && p.ped.cuffed && !p.struggle, 'mashing does nothing: still cuffed');
  assert.equal(players.buildMe(w, p).fight, null);
});

test('broke free and punched the officer: assaulting an officer - more heat', () => {
  const w = makeWorld({ rand: mulberry32(7) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  p.ped.downUntil = w.time + 2.5;
  struggle.grab(w, cop, p.ped);
  for (let i = 0; i < 100 && p.struggle; i++) { pad(p, i, 2); w.step(); }
  assert.ok(!p.struggle && !p.custody, 'broke free');
  const heat = p.heat, stars = p.wanted;
  // over to the officer on the ground, and a few punches
  let hit = false;
  for (let i = 0; i < 60 && !hit; i++) {
    const a = Math.atan2(cop.y - p.ped.y, cop.x - p.ped.x), d = Math.hypot(cop.x - p.ped.x, cop.y - p.ped.y);
    p.inputQ.push({ seq: p.ack + 1, bits: d < 26 && i % 2 ? IN.FIRE | IN.AIMING : 0, mx: d < 22 ? 0 : Math.cos(a), my: d < 22 ? 0 : Math.sin(a), aim: a });
    const hp = cop.hp;
    w.step();
    hit = cop.hp < hp;
  }
  assert.ok(hit, 'punched the officer');
  assert.ok(p.heat >= heat + 30 && p.wanted > stars, `assaulting an officer: heat ${Math.round(heat)} -> ${Math.round(p.heat)}, ${stars} -> ${p.wanted} stars`);
});

test('the HUD and the descriptor: the meter, how many are on you, the time to the cuffs; the thrashing', () => {
  const w = makeWorld({ rand: mulberry32(3) });
  const { p, conn } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 2);
  const cop = officer(w, p);
  p.ped.downUntil = w.time + 2.5;
  struggle.grab(w, cop, p.ped);
  for (let i = 0; i < 6; i++) { pad(p, i, 2); w.step(); }
  const f = players.buildMe(w, p).fight;
  assert.ok(f && f.m > 0 && f.m < 1 && f.n === 1 && f.left > 0 && f.left < STRUGGLE_CUFF_S, `me.fight ${JSON.stringify(f)}`);
  const sent = conn.sent.filter((s) => typeof s === 'string' && s.includes('"t":"me"')).map((s) => JSON.parse(s));
  assert.ok(sent.some((m) => m.fight && m.fight.m > 0), 'the meter went out to the client');
  assert.equal(_descriptor(p.ped).sg, 1, 'the descriptor says they\'re struggling (the client draws them thrashing)');
  assert.ok(players.pedFlags(w, p.ped) & PF.DOWN, 'down');
  assert.equal(players.findInteraction(w, p), null, 'no prompt meanwhile: the struggle bar says what to press');
  for (let i = 0; i < 100 && p.struggle; i++) { pad(p, i, 2); w.step(); }
  assert.equal(players.buildMe(w, p).fight, null, 'over: gone from the HUD');
});

test('NPC crooks the police take down get a dice roll: now and then they shake the officer off', () => {
  const w = makeWorld({ rand: mulberry32(9) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  let free = 0;
  for (let k = 0; k < 200; k++) {
    const crook = spawnNpc(w, 'mugger', p.ped.x + 300, p.ped.y, 'mugger'), cop = spawnNpc(w, 'cop', crook.x + 20, crook.y, 'cop');
    crook.stunUntil = w.time + 2.5; crook.downUntil = w.time + 2.5;
    if (struggle.npcBreaksFree(w, cop, crook)) {
      free++;
      assert.ok(w.time >= crook.downUntil && cop.downUntil > w.time, 'up, the officer down');
    }
    assert.equal(struggle.npcBreaksFree(w, cop, crook), false, 'one roll a takedown');
    w.remove(crook); w.remove(cop);
  }
  assert.ok(free > 30 && free < 110, `${free} of 200 shook them off`);
  void K;
});

// ---- the tackle at low stars (the owner's note 2026-10-09 07:06) ---------------------------------------------------
// the knockdown events a tackle emits
function knocks(w) {
  const log = [], emit = w.emit.bind(w);
  w.emit = (x, y, ev) => { if (ev.e === 'knockdown') log.push(ev); return emit(x, y, ev); };
  return log;
}
// set up a fresh tackle: the player right in front of the officer, nobody down
function lineUp(w, p, c, facing) {
  p.ped.downUntil = 0; p.ped.rollT = 0; p.ped.graceUntil = 0; p.ped.protectUntil = 0; p.ped.scrambleUntil = 0; p.ped.vx = 0; p.ped.vy = 0;
  c.downUntil = 0; c.rollT = 0;
  p.ped.x = c.x + 18; p.ped.y = c.y; p.ped.a = facing;
}

test('a tackle at 1-2 stars: often only a trip, a shorter knockdown on the face or the back, the officer who dove down too', () => {
  const w = makeWorld({ rand: mulberry32(13) }), log = knocks(w);
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  const near = (a, b) => Math.abs(a - b) < 0.01;
  let trips = 0;
  const ks = { R: 0, F: 0, B: 0 };
  for (let i = 0; i < 200; i++) {
    lineUp(w, p, cop, i % 2 ? 0 : Math.PI);   // (running away from the officer, or facing them)
    assert.ok(police._tackleHit(w, cop, p.ped), 'the tackle lands');
    const left = p.ped.downUntil - w.time, ev = log[log.length - 1];
    ks[ev.k]++;
    if (near(left, TACKLE_TRIP_S)) { trips++; assert.equal(ev.k, 'R', 'a trip: a tumble'); }
    else {
      assert.ok(near(left, TACKLE_DOWN_BY_STARS[1]), `down ${left.toFixed(2)} s`);
      assert.equal(ev.k, i % 2 ? 'F' : 'B', 'taken from behind: on the face; head on: on the back');
      assert.ok(near(ev.d, TACKLE_DOWN_BY_STARS[1]), 'the event says how long (the client: pushing up at the end)');
    }
    assert.ok(near(cop.downUntil - w.time, TACKLE_RECOVER_S[1]), 'the officer who dove is down a moment too');
  }
  const share = trips / 200;
  assert.ok(Math.abs(share - TACKLE_TRIP_SHARE[1]) < 0.1, `trips: ${Math.round(share * 100)}% (about ${TACKLE_TRIP_SHARE[1] * 100}%)`);
  assert.ok(ks.F > 30 && ks.B > 30, `on the face ${ks.F}, on the back ${ks.B}`);
  // at 4 stars no trips, the full knockdown, and the officer straight on them
  wanted(w, p, 4);
  for (let i = 0; i < 40; i++) {
    lineUp(w, p, cop, 0);
    police._tackleHit(w, cop, p.ped);
    assert.ok(near(p.ped.downUntil - w.time, TACKLE_DOWN_BY_STARS[4]) && log[log.length - 1].k !== 'R', '4 stars: no trip');
    assert.ok(w.time >= cop.downUntil, '4 stars: the officer isn\'t down');
  }
  // an NPC crook: as before
  const crook = spawnNpc(w, 'mugger', cop.x + 18, cop.y, 'mugger');
  crook.npc.state = 'idle';
  assert.ok(police._tackleHit(w, cop, crook));
  assert.ok(near(crook.downUntil - w.time, TACKLE_DOWN_S), 'an NPC: down the usual time');
});

test('down from a tackle: moving gets you up sooner - before the officer who dove - lying still, the full time', () => {
  const w = makeWorld({ rand: mulberry32(14) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 1);
  const cop = officer(w, p);
  const r0 = w.rand;
  const upAfter = (move) => {
    lineUp(w, p, cop, 0);
    w.rand = () => 0.99;   // (a real tackle, not a trip)
    police._tackleHit(w, cop, p.ped);
    w.rand = r0;
    const t0 = w.time;
    for (let i = 0; i < 80 && w.time < p.ped.downUntil; i++) {
      p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: move ? (i % 8 < 4 ? 1 : -1) : 0, my: move ? 0.4 : 0, aim: 0 });
      w.time += DT; w.tick++;
      players.processInputs(w, DT);
    }
    return w.time - t0;
  };
  const still = upAfter(false), moving = upAfter(true);
  assert.ok(Math.abs(still - TACKLE_DOWN_BY_STARS[1]) <= DT + 1e-6, `lying still: down ${still.toFixed(2)} s`);
  assert.ok(moving < still * 0.6, `moving: up after ${moving.toFixed(2)} s (still: ${still.toFixed(2)} s)`);
  assert.ok(moving < TACKLE_RECOVER_S[1], 'up before the officer who dove is');
  // moving doesn't help once an officer has you (that's the struggle: struggle.input)
  lineUp(w, p, cop, 0);
  p.ped.downUntil = w.time + 2.5;
  struggle.grab(w, cop, p.ped);
  const until0 = p.ped.downUntil;
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 1, my: 0, aim: 0 });
  players.processInputs(w, DT);
  assert.equal(p.ped.downUntil, until0, 'held down: no scrambling up');
});

test('at 1-2 stars the others walk up to you on the ground, the one who dove gets up first: lie there and they pin you', () => {
  const w = makeWorld({ rand: mulberry32(15) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  wanted(w, p, 1);
  const diver = officer(w, p, 'cop', 18, 0), partner = officer(w, p, 'cop', -130, 0);
  for (const c of [diver, partner]) { c.npc.tactic = 'tackle'; c.weapon = 'baton'; c.npc.nextDive = w.time + 9; }
  lineUp(w, p, diver, 0);
  const r0 = w.rand;
  w.rand = () => 0.99;   // (a real tackle)
  police._tackleHit(w, diver, p.ped);
  w.rand = r0;
  const t0 = w.time;
  let fastest = 0, pinnedAt = -1, by = 0;
  for (let i = 0; i < 60 && pinnedAt < 0; i++) {
    p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 });
    w.step();
    if (w.time < p.ped.downUntil || p.struggle) fastest = Math.max(fastest, Math.hypot(partner.vx, partner.vy));
    if (p.struggle) { pinnedAt = w.time - t0; by = p.struggle.by[0]; }
  }
  assert.ok(fastest <= PED.walk * TACKLE_APPROACH * 1.1, `the partner came on at a walk (${Math.round(fastest)} px/s; a sprint is ${PED.sprint})`);
  assert.ok(pinnedAt >= TACKLE_RECOVER_S[1] - DT, `nobody on them while the officer who dove was down (pinned after ${pinnedAt.toFixed(2)} s)`);
  assert.ok(pinnedAt > 0 && pinnedAt <= TACKLE_DOWN_BY_STARS[1], 'lying there: pinned before they were up');
  assert.equal(by, diver.id, 'the officer who dove, once up, right there');
});
