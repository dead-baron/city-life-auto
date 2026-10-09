// Fighting back (the owner's note 2026-10-09 05:01; server/systems/struggle.js): tackled or grabbed by an officer, a wanted
// player struggles instead of being pinned and cuffed on the spot. Mashing the attack button fills the meter and throws
// the officer off (down a moment, you up with a grace from the next tackle); not fighting gets you cuffed; the odds by
// stars, health and who's on you (simulated struggles); two officers are harder; once cuffed there's no struggle;
// punching the officer afterwards is assaulting an officer; the HUD and the descriptor carry it to the client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { STAR_HEAT, K, PF } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { mulberry32 } from '../shared/rng.js';
import { STRUGGLE_CUFF_S, STRUGGLE_GRACE_S, STRUGGLE_KNOCK_S } from '../shared/rules.js';
import * as players from '../server/systems/players.js';
import * as law from '../server/systems/law.js';
import * as struggle from '../server/systems/struggle.js';
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

test('the odds: by stars, by health, by who is on you - mashing well (about 7 presses a second)', () => {
  const w = makeWorld({ rand: mulberry32(11) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  const share = {};
  for (const s of [1, 2, 3, 4, 5]) share[s] = odds(w, p, { stars: s, seed: s });
  const pc = (x) => `${Math.round(x * 100)}%`;
  const said = `by stars: ${[1, 2, 3, 4, 5].map((s) => `${s}: ${pc(share[s])}`).join(', ')}`;
  if (process.env.DBG) console.log(said);
  assert.ok(share[1] >= 0.65, `1 star: free most of the time (${said})`);
  assert.ok(share[2] >= 0.5 && share[2] <= share[1], `2 stars (${said})`);
  assert.ok(share[3] >= 0.3 && share[3] <= 0.62, `3 stars: about half the time (${said})`);
  assert.ok(share[4] <= 0.2, `4 stars: rarely (${said})`);
  assert.ok(share[5] <= 0.08, `5 stars: hardly ever (${said})`);
  // worn down: much harder
  const half = odds(w, p, { stars: 1, hp: 50, seed: 21 }), low = odds(w, p, { stars: 1, hp: 30, seed: 22 });
  if (process.env.DBG) console.log(`1 star: half health ${pc(half)}, a third ${pc(low)}`);
  assert.ok(half <= share[1] - 0.25 && low <= 0.3 && low <= half, `half health ${pc(half)}, a third ${pc(low)} (full ${pc(share[1])})`);
  // a hearty meal's extra health: a little stronger
  assert.ok(odds(w, p, { stars: 3, hp: 130, seed: 23 }) > share[3], 'more health, stronger');
  // who's on you: SWAT and soldiers hold harder than a cop, an agent a little
  const swat = odds(w, p, { stars: 3, who: ['swat'], seed: 31 }), agent = odds(w, p, { stars: 3, who: ['agent'], seed: 32 });
  if (process.env.DBG) console.log(`3 stars: an agent ${pc(agent)}, SWAT ${pc(swat)}`);
  assert.ok(swat < share[3] - 0.2 && agent < share[3] && swat < agent, `3 stars: a cop ${pc(share[3])}, an agent ${pc(agent)}, SWAT ${pc(swat)}`);
  // and not fighting at all is never enough
  assert.equal(odds(w, p, { stars: 1, gap: null, n: 20, seed: 41 }), 0, 'no presses: always cuffed');
  // mashing harder pays
  assert.ok(odds(w, p, { stars: 3, gap: [2, 3], seed: 42 }) > share[3], 'mashing harder: better odds');
});

test('two officers on you are harder: a second one joins in and pushes too', () => {
  const w = makeWorld({ rand: mulberry32(12) });
  const { p } = joinPlayer(w);
  teleport(w, p.ped, corner(w).x + 32, corner(w).y + 32);
  const one = odds(w, p, { stars: 1, seed: 51 }), two = odds(w, p, { stars: 1, who: ['cop', 'cop'], seed: 52 });
  if (process.env.DBG) console.log(`1 star: one cop ${Math.round(one * 100)}%, two ${Math.round(two * 100)}%`);
  assert.ok(two <= one * 0.7 && two >= 0.15, `one cop ${Math.round(one * 100)}%, two ${Math.round(two * 100)}%: harder, still a chance`);
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
