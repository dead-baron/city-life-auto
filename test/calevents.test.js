// The event calendar's other four (server/systems/calevents.js; the numbers: shared/rules.js GANGWAR_EVENT, CRACKDOWN_EVENT,
// RACENIGHT_EVENT, SOCCERCUP_EVENT): when they come round, joining and the sides, who's paid what, one player can do each,
// and nothing of them is about with none on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, store, players } from './helpers.js';
import { T } from '../shared/constants.js';
import { EVENTS, GANGWAR_EVENT as GW, CRACKDOWN_EVENT as CD, RACENIGHT_EVENT as RN, SOCCERCUP_EVENT as SC } from '../shared/rules.js';
import { CARSOCCER } from '../shared/rules-games.js';
import { arenaOf, arenaTile, bankRamps } from '../shared/carsoccer.js';
import { EVENT_KINDS } from '../shared/worldevents.js';
import { guideSections } from '../shared/guide.js';
const [calendar, cal, evhooks, events, law, custody, careers, soc, npc] = await Promise.all(['calendar', 'calevents', 'eventhooks', 'events', 'law', 'custody', 'careers', 'carsoccer', 'npc'].map((n) => import(`../server/systems/${n}.js`)));

const EV = (id) => EVENTS.find((e) => e.id === id);
function setup() {
  const w = makeWorld({ npcBudget: 120 });
  const { p } = joinPlayer(w);
  run(w, 0.2);
  w.street = { live: [], nextAt: 1e9, last: '' };
  w.nextHappenAt = 1e9; w.nextPetAt = 1e9; w.nextDropAt = 1e9; w.nextShootout = 1e9;
  p.profile.ftue = { st: 'done' };
  return { w, p };
}
const fed = (w, re) => events.feedFor(w).items.some((f) => re.test(f.text));
const liveRun = (w, id) => calendar.liveRuns(w).find((r) => r.id === id && !r.over);

test('the four on the calendar: gang war 3 a day, the crackdown daily for an hour, race night in the evening, the cup on Saturdays', () => {
  for (const id of ['gangwar', 'crackdown', 'racenight', 'soccercup']) { assert.ok(EV(id).on, id); assert.ok(EVENT_KINDS[id] && EVENT_KINDS[id].label, `${id}: on the radar`); }
  assert.equal(86400 / EV('gangwar').periodS, 3);
  assert.equal(EV('crackdown').periodS, 86400); assert.equal(EV('crackdown').durationS, 3600);
  const night = new Date(calendar.nextOccurrence(EV('racenight'), Date.UTC(2026, 10, 10, 12)).start);
  assert.equal(night.getUTCHours(), 1, '01:00 UTC: evening in the Americas');
  assert.ok(EV('racenight').durationS >= RN.races * RN.gapS - RN.gapS + RN.signupS + RN.maxS, 'room for the whole chain');
  for (let wk = 0; wk < 3; wk++) assert.equal(new Date(calendar.nextOccurrence(EV('soccercup'), Date.UTC(2026, 10, 10 + 7 * wk)).start).getUTCDay(), 6, 'a Saturday');
  // what's coming up, with a waypoint: a card in What's next from 10 minutes before
  const { w, p } = setup();
  const at = calendar.nextOccurrence(EV('gangwar'), Date.now()).start;
  const cards = calendar.eventCards(p, at - 5 * 60e3, w);
  const gw = cards.find((c) => c.id === 'event:gangwar');
  assert.ok(gw && gw.etaS === 300 && Number.isFinite(gw.action.x), 'the gang war\'s card, 5 minutes out');
  for (const id of ['crackdown', 'racenight']) assert.ok(cards.find((c) => c.id === `event:${id}`), id);
  // nothing of them with none on: no mods, no offers, no tracker
  assert.equal(evhooks.mult(w, p.ped.x, p.ped.y, 'heat'), 1);
  assert.equal(evhooks.units(w, p.ped.x, p.ped.y, 3), 3);
  for (const f of evhooks.interactions) assert.equal(f(w, p), null);
  assert.equal(evhooks.first('target', w, p), null);
});

test('gang war: two gangs on the block while someone\'s near, a side to join, takedowns and the win paid, standing, the block held', () => {
  const { w, p } = setup();
  const r = calendar.startNow(w, 'gangwar');
  assert.ok(r, 'started');
  const b = r.plan.block, [A, B] = r.plan.sides;
  assert.equal(A, 'syndicate', 'the Syndicate holds it the first time');
  assert.ok(B !== A);
  assert.ok(fed(w, new RegExp(`Gang war: .* ${b.district}`)), 'announced with the block\'s district');
  assert.equal(r.members.length, 0, 'nobody near: nobody spawned');
  teleport(w, p.ped, b.x, b.y + GW.radius * 0.3);
  run(w, 2);
  assert.equal(r.members.length, 2 * GW.side, 'both sides on the block');
  const side = (s) => r.members.map((id) => w.get(id)).filter((e) => e && e.npc.warSide === s + 1);
  assert.equal(side(0).length, GW.side); assert.equal(side(1).length, GW.side);
  // join the challengers at their end of the block
  const rp = r.rally[1];
  teleport(w, p.ped, rp.x, rp.y);
  const offer = players.findInteraction(w, p);
  assert.match(offer.label, /fight for/i);
  offer.run();
  assert.equal(p.warSide, 2);
  // their own side won't turn on them
  const friend = side(1)[0], foe = side(0)[0];
  friend.npc.state = 'wander';
  npc.startFight(w, friend, p.ped, 10);
  assert.notEqual(friend.npc.state === 'fight' && friend.npc.target === p.ped.id, true, 'no fight with their own fighter');
  // a takedown: paid, crime XP, standing
  const bank0 = p.profile.bank, cx0 = p.profile.criminalExp || 0;
  foe.lastHitBy = p.ped.id; foe.dead = true; foe.hp = 0;
  run(w, 1.2);
  assert.equal(r.score[1], 1);
  assert.equal(p.profile.bank, bank0 + GW.killPay);
  assert.equal(p.profile.criminalExp, cx0 + GW.killXp);
  assert.equal(cal.standing(p, B), GW.standKill);
  assert.equal(side(0).length, GW.side, 'a reserve comes on');
  // police it: an arrest on the block pays copXp times; a downed fighter can be cuffed
  const { p: cop } = joinPlayer(w);
  cop.badge = true; teleport(w, cop.ped, b.x, b.y);
  assert.equal(evhooks.mult(w, b.x, b.y, 'copXp'), GW.copXp);
  assert.equal(evhooks.mult(w, b.x + GW.radius * 3, b.y, 'copXp'), 1, 'only on the block');
  const down = side(0)[0];
  down.downUntil = w.time + 5;
  assert.ok(law.arrestable(w, down));
  const pts0 = cop.profile.policePts || 0;
  law.arrest(w, cop.ped, down);
  assert.equal(cop.profile.policePts, pts0 + 4 * GW.copXp);
  // the end: the side with more takedowns takes the block, its fighters paid
  r.score = [0, 3];
  const bank1 = p.profile.bank;
  r.end = Date.now() - 1;
  run(w, 1.2);
  assert.ok(r.over);
  assert.equal(r.winner, B);
  assert.equal(p.profile.bank, bank1 + GW.winPay);
  assert.equal(cal.standing(p, B), GW.standKill + GW.standWin);
  assert.equal(cal.standing(p, A), GW.standLose, 'the other gang thinks less of you');
  assert.equal(store.kept.gangHolds[b.key], B, 'the block is theirs');
  assert.ok(fed(w, /took the block from/), 'the result in the city feed');
  assert.equal(p.warSide, 0);
  assert.equal(evhooks.mult(w, b.x, b.y, 'copXp'), 1, 'the mod gone');
  assert.equal(calendar.liveRuns(w).filter((q) => q.id === 'gangwar').length, 0);
  // the next war over that block: its new holder defends it
  const B2 = cal.warBlocks(w), k2 = r.k + B2.length;
  assert.equal(cal.warPlan(w, k2).sides[0], B);
  // nobody about all along: the dice decide, nobody spawned
  const r2 = calendar.startNow(w, 'gangwar');
  teleport(w, p.ped, b.x + 9000, b.y); teleport(w, cop.ped, b.x + 9000, b.y);
  r2.end = Date.now() - 1;
  run(w, 1.2);
  assert.ok(r2.over && !r2.ever && r2.winner);
});

test('district crackdown: twice the units (capped), heat faster, bail and fines up, officers paid more - in that district only', () => {
  const { w, p } = setup();
  const r = calendar.startNow(w, 'crackdown');
  assert.ok(r);
  const D = r.d, other = cal.crackdownDistricts(w).find((d) => d.name !== D.name);
  assert.equal(cal.crackdownPlan(w, r.k).name, D.name);
  assert.notEqual(cal.crackdownPlan(w, r.k + 1).name, D.name, 'a different one the next day');
  assert.ok(fed(w, new RegExp(`crackdown in ${D.name}`)));
  assert.equal(evhooks.units(w, D.x, D.y, 1), 2, 'twice');
  assert.equal(evhooks.units(w, D.x, D.y, 4), 4 + CD.extraUnits, 'at most extraUnits more');
  assert.equal(evhooks.units(w, other.x, other.y, 3), 3, 'not elsewhere');
  // heat
  p.heat = 0; p.wanted = 0; law.addHeat(w, p, 10, D.x, D.y);
  const inHeat = p.heat;
  p.heat = 0; p.wanted = 0; law.addHeat(w, p, 10, other.x, other.y);
  assert.ok(Math.abs(inHeat - p.heat * CD.heat) < 0.01, `${inHeat} vs ${p.heat}`);
  p.heat = 0; p.wanted = 0;
  // cuffed there: bail and the fine up
  teleport(w, p.ped, D.x, D.y);
  p.wanted = 2; p.heat = 60;
  custody.start(w, p, null);
  assert.equal(p.custody.feeK, CD.fee);
  p.custody = null; law.clearWanted(w, p); p.ped.cuffed = false;
  // an officer's arrest there
  assert.equal(evhooks.mult(w, D.x, D.y, 'copPay'), CD.copPay);
  assert.equal(evhooks.mult(w, other.x, other.y, 'copPay'), 1);
  // more officers on foot about a player there (capped), gone at the end
  teleport(w, p.ped, D.x, D.y);
  run(w, 12);
  assert.ok(r.cops.length >= 1 && r.cops.length <= CD.beat, `${r.cops.length} more officers`);
  for (const id of r.cops) assert.equal(w.get(id).npc.role, 'cop');
  r.end = Date.now() - 1;
  run(w, 1.2);
  assert.ok(r.over);
  assert.equal(evhooks.units(w, D.x, D.y, 1), 1, 'over: back to normal');
  assert.ok(fed(w, /crackdown in .* is over/));
});

test('street race night: one player and the city\'s racers on the grid, checkpoints, points, the pot paid at the end', () => {
  const { w, p } = setup();
  let now = Date.now();
  calendar.setClock(() => now);
  try {
    const r = calendar.startNow(w, 'racenight');
    assert.ok(r && r.races.length === RN.races);
    for (const R of r.races) { assert.ok(R.course.cps.length >= 2); assert.ok(R.course.len >= RN.runPx[0] && R.course.len <= RN.runPx[1]); }
    assert.ok(fed(w, /Street race night/));
    run(w, 1.2);
    const R = r.races[0], c = R.course;
    assert.equal(R.phase, 'signup');
    // a car on the line
    const v = w.spawnVehicle('sports', c.start.x, c.start.y, 0, {});
    Object.assign(p.ped, { vehId: v.id, seat: 0 }); v.seats[0] = p.ped.id;
    teleport(w, p.ped, v.x, v.y);
    run(w, 2);
    assert.ok(R.grid.has(p.pid), 'on the grid');
    assert.match(evhooks.first('target', w, p).text, /stay on the line/);
    now += RN.signupS * 1000 + 500;
    run(w, 1.2);
    assert.equal(R.phase, 'running');
    assert.equal(R.npcs.length, RN.grid - 1, 'the city\'s racers fill the grid');
    assert.equal(r.pot, RN.pot + RN.perEntrant, 'the pot grows with the entrant');
    // through every checkpoint to the finish
    for (const cp of c.cps) { v.x = cp.x; v.y = cp.y; v.vx = 0; v.vy = 0; w.place(v); run(w, 0.35); }
    assert.equal(R.phase, 'done', 'everyone in: the race is over');
    assert.equal(R.order[0].pid, p.pid, 'first');
    assert.equal(R.order.length, RN.grid, 'the city\'s racers placed too');
    assert.equal(r.points.get(`p:${p.pid}`).pts, RN.points[0]);
    assert.ok(fed(w, new RegExp(`race 1 of ${RN.races}: ${p.name} took it`)));
    // the night over: the pot to the top three on points - the player's share
    const bank0 = p.profile.bank;
    now = r.end + 1000;
    run(w, 1.2);
    assert.ok(r.over);
    assert.equal(p.profile.bank, bank0 + Math.round((RN.pot + RN.perEntrant) * RN.share[0] / 10) * 10);
    assert.ok(fed(w, /Street race night is over/));
    for (const q of R.npcs) { const nv = w.get(q.id); assert.ok(!nv || nv.despawnable, 'the racers back to traffic'); }
  } finally { calendar.setClock(null); }
});

// an arena laid on the test city where there's room (as test/carsoccer.test.js)
function withArena(w) {
  const m = w.map;
  if (m.arenas && m.arenas.length) return m.arenas[0];
  const ok = (t) => t !== T.BUILDING && t !== T.WATER && t !== T.DEEP && t !== T.FLOOR && t !== T.COUNTER && t !== T.BRIDGE;
  let at = null;
  for (let ty = m.y0 + 4; ty < m.y0 + m.h - 40 && !at; ty += 4) row: for (let tx = m.x0 + 4; tx < m.x0 + m.w - 60; tx += 4) {
    for (let y = ty - 1; y < ty + 37; y++) for (let x = tx - 2; x < tx + 56; x++) if (!ok(m.tileAt(x, y)) || m.bld[m.idx(x, y)] >= 0) continue row;
    at = [tx, ty]; break;
  }
  const a = arenaOf(at[0], at[1], 56, 36, 'Test Arena');
  for (let y = at[1]; y < at[1] + 36; y++) for (let x = at[0]; x < at[0] + 56; x++) { m.tiles[m.idx(x, y)] = arenaTile(a, x, y); m.solidProps.delete(m.idx(x, y)); }
  m.tiles[m.idx(at[0] - 1, Math.floor(a.gate.y / 32))] = T.SIDEWALK;
  m.arenas = [a]; (m.jumps ||= []).push(...bankRamps(a));
  return a;
}

test('the car soccer cup: one player and the city\'s drivers, round by round to the cup; a loss knocks you out', () => {
  const { w, p } = setup();
  const a = withArena(w);
  const r = calendar.startNow(w, 'soccercup');
  assert.ok(r);
  assert.ok(fed(w, /car soccer cup is on/));
  teleport(w, p.ped, a.gate.x - 10, a.gate.y);
  assert.match(soc.gateInteraction(w, p).label, /cup, round 1 of/);
  const st = soc._test.stOf(w, 0);
  const play = (win) => {
    assert.equal(soc.devStart(w, p), null);
    const me = st.slots.find((s) => s.pid === p.pid);
    assert.ok(st.slots.filter((s) => s.bot).length >= 2 * CARSOCCER.teamMin - 1, 'the city\'s drivers fill the sides');
    st.score = win ? (me.team ? [0, 2] : [2, 0]) : (me.team ? [2, 0] : [0, 2]);
    soc._test.finish(w, a, st);
    soc._test.teardown(w, a, st);
  };
  const bank0 = p.profile.bank, c = careers.mainCareer(p), xp0 = careers.careerXp(p.profile, c);
  play(true);
  assert.equal(p.profile.bank, bank0 + CARSOCCER.prize + SC.roundPay, 'a round won');
  assert.match(soc.gateInteraction(w, p).label, SC.rounds === 2 ? /the final/ : /round 2/);
  for (let i = 1; i < SC.rounds; i++) play(true);
  assert.equal(p.profile.bank, bank0 + SC.rounds * (CARSOCCER.prize + SC.roundPay) + SC.prize, 'the cup');
  assert.equal(careers.careerXp(p.profile, c), xp0 + SC.xp, 'XP of the main career (toward the week\'s goal)');
  assert.deepEqual(r.champs, [p.name]);
  assert.ok(fed(w, new RegExp(`${p.name} lifted the car soccer cup`)));
  // another player who loses is out
  const { p: q } = joinPlayer(w);
  q.profile.ftue = { st: 'done' };
  const e = r.runs.get(p.pid);
  r.runs.delete(p.pid);
  teleport(w, q.ped, a.gate.x - 10, a.gate.y);
  assert.equal(soc.devStart(w, q), null);
  const me = st.slots.find((s) => s.pid === q.pid);
  st.score = me.team ? [2, 0] : [0, 2];
  soc._test.finish(w, a, st); soc._test.teardown(w, a, st);
  assert.ok(r.runs.get(q.pid).out);
  assert.match(soc.gateInteraction(w, q).label, /out of the cup/);
  r.runs.set(p.pid, e);
  r.end = Date.now() - 1;
  run(w, 1.2);
  assert.ok(r.over && fed(w, /cup .* is over - won by/));
});

test('the Guide has each of them, from the rules', () => {
  const earn = guideSections().find((s) => s.id === 'earn').entries, b = (id) => earn.find((e) => e.id === id).b;
  assert.ok(b('gangwar').includes('$' + GW.winPay.toLocaleString('en-US')));
  assert.ok(b('crackdown').includes(`${Math.round((CD.heat - 1) * 100)}%`));
  assert.ok(b('racenight').includes('$' + RN.pot.toLocaleString('en-US')));
  assert.ok(b('soccercup').includes('$' + SC.prize.toLocaleString('en-US')));
  assert.match(b('gangwar'), /\[\[action\]\]/);
});
