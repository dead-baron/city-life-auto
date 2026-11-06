// The first-time experience (server/systems/ftue.js; the owner, 11-04: "short and sweet and give people general
// direction"): a new character arrives at the starter car's station, answers one question and does a first goal of
// three steps; skippable at every point; existing characters untouched; kept across a rejoin; the first-time moments
// once each, ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, fakeConn, players, store } from './helpers.js';
import { PROGRESS_EPOCH, resetOldEpochs } from '../server/store.js';
import * as homes from '../server/systems/homes.js';
import { FTUE, STAR_HEAT, STARTER } from '../shared/rules.js';
import { K } from '../shared/constants.js';
import { DAY_PART_S } from '../shared/constants.js';
import { STEP_CTL, ASK_POI, ANSWERS, MOMENTS, goalFor } from '../server/systems/ftue.js';
import * as ftue from '../server/systems/ftue.js';
import * as starter from '../server/systems/starter.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import * as mailjob from '../server/systems/mailjob.js';
import * as jobs from '../server/systems/jobs.js';
import * as fishing from '../server/systems/fishing.js';
import * as combat from '../server/systems/combat.js';
import { FTUE_STEPS } from '../server/analytics.js';

// a world with the analytics' funnel listened to (server/launch.js world.track)
function world() {
  const w = makeWorld(), steps = [];
  w.track = (kind, p, d) => { if (kind === 'ftue') steps.push(d.step); };
  return { w, steps };
}
// a new character, look picked (the creator's done: the FTUE begins)
function newcomer(w) {
  const j = joinPlayer(w);
  j.prof.lookPicked = true;
  return j;
}
const sent = (conn, f) => conn.sent.filter((m) => typeof m === 'object' && f(m));
const me = (w, p) => players.buildMe(w, p);
// the arrival stations' card up, then skipped (the default station) - every new character's in the world
const toPick = (w) => run(w, 0.6);
const toArrival = (w) => { toPick(w); for (const p of w.players.values()) if (p.profile.ftue && p.profile.ftue.st === 'pick') ftue.handle(w, p, { a: 'skip' }); };
const toQuestion = (w) => run(w, FTUE.arriveS + 4.6);   // (the page says when its scene is over; else the server's own timeout)
// drive (by teleport) to the goal: the car moved with you in it
function arriveAtGoal(w, p) {
  const g = p.profile.ftue.goal, v = p.ped.vehId ? w.get(p.ped.vehId) : null;
  if (v) { teleport(w, v, g.x + 40, g.y); } else teleport(w, p.ped, g.x + 40, g.y);
  run(w, 0.6);
}

test('a new character: the arrival at the starter car\'s station, the question, three steps, done', () => {
  const { w, steps } = world();
  const { p, prof, conn } = newcomer(w);
  assert.equal(prof.ftue.st, 'new', 'a new character\'s record');
  // where to arrive: the card of the arrival stations, the default first; one picked - not the default - and the starter
  // car's lot follows it
  toPick(w);
  assert.equal(prof.ftue.st, 'pick');
  const card = sent(conn, (m) => m.t === 'ftue' && m.a === 'pick')[0];
  const choices = starter.arrivalChoices(w);
  assert.ok(card && card.opts.length >= 2 && card.opts.length <= 4, 'a short card of stations');
  assert.deepEqual(card.opts.map((o) => o.id), choices.map((c) => c.poi));
  assert.ok(card.opts[0].def && card.opts.slice(1).every((o) => !o.def), 'the default first, marked');
  for (const o of card.opts) assert.ok(o.name && o.region && w.map.pois[o.id].kind === 'station', `${o.name}: a station, its region`);
  const car0 = starter.carOf(w, prof.pid), d0 = w.map.pois[card.opts[0].id];
  assert.ok(car0 && Math.hypot(car0.x - d0.x, car0.y - d0.y) <= STARTER.lotR, 'the car waits at the default till then');
  assert.deepEqual(me(w, p).ftue, { st: 'pick' });
  const choice = card.opts[card.opts.length - 1];
  ftue.handle(w, p, { a: 'pick', stn: choice.id });
  assert.equal(prof.ftue.st, 'arrive');
  assert.equal(prof.ftue.stn, choice.id, 'the profile remembers the station');
  // the arrival: on the platform of the station whose car park has the starter car (one function: starter.arrivalFor)
  const g = starter.arrivalFor(w, p), st = w.map.pois[g.poi], car = starter.carOf(w, prof.pid);
  assert.equal(prof.ftue.stn, g.poi);
  assert.ok(Math.hypot(p.ped.x - st.x, p.ped.y - st.y) < 900, 'off the train at the arrival station');
  assert.ok(car && Math.hypot(car.x - st.x, car.y - st.y) <= STARTER.lotR, 'the starter car in that station\'s car park');
  const arr = sent(conn, (m) => m.t === 'ftue' && m.a === 'arrive')[0];
  assert.ok(arr && arr.name === st.label && arr.s === FTUE.arriveS && arr.from.length === 2, 'the page plays the arrival');
  assert.deepEqual(me(w, p).ftue, { st: 'arrive' });
  assert.equal(me(w, p).job, null, 'no goal yet');
  // the scene plays out: the question
  toQuestion(w);
  assert.equal(prof.ftue.st, 'ask');
  const q = sent(conn, (m) => m.t === 'menu' && m.poi === ASK_POI).pop();
  assert.equal(q.title, 'What brings you to town?');
  assert.deepEqual(q.opts.map((o) => o.label), ['Honest work', 'A little hustle', 'The great outdoors', 'Just let me roam']);
  assert.ok(q.ask && q.opts.every((o) => o.price === undefined), 'the conversation screen\'s kit: four answers, no prices');
  // honest work: the first goal
  economy.handleMenu(w, p, ASK_POI, 'work');
  assert.equal(prof.ftue.st, 'goal');
  assert.equal(prof.ftue.ans, 'work');
  const goal = prof.ftue.goal;
  assert.ok(goal.k === 'mail' || goal.k === 'courier', goal.k);   // (World v3: a post office's walking round; a city with none, a depot's courier work)
  assert.ok(mailjob.officesOf(w.map).some((o) => o.id === goal.poi), 'a post office (or the depot standing in for one)');
  // step 1: walk to the car
  let m = me(w, p);
  assert.equal(prof.ftue.step, 1);
  assert.deepEqual(m.ftue, { st: 'goal', step: 1, ctl: 'move', line: 'Your car\'s in the lot - walk over to it', ans: 'work' });
  assert.equal(m.job.k, 'First goal'); assert.deepEqual(m.job.step, [1, 3]);
  assert.deepEqual(m.job.veh, [Math.round(car.x), Math.round(car.y), car.def.i], 'the way to the car: its ring and arrows');
  teleport(w, p.ped, car.x + 70, car.y);
  run(w, 0.6);
  // step 2: get in and drive
  m = me(w, p);
  assert.equal(m.ftue.step, 2); assert.equal(m.ftue.ctl, 'vehicle');
  assert.match(m.ftue.line, /^Get in and drive to /);
  assert.deepEqual([m.job.x, m.job.y], [goal.x, goal.y], 'the way on to the post office');
  for (const e of w.query(car.x, car.y, 160, K.VEH)) if (e !== car) w.remove(e);   // (not the parked car beside it)
  teleport(w, p.ped, car.x, car.y + car.def.W / 2 + 8);
  assert.ok(vehicles.tryEnter(w, p.ped), 'in the car');
  assert.equal(p.ped.vehId, car.id);
  arriveAtGoal(w, p);
  // step 3: the action - take the round
  m = me(w, p);
  assert.equal(m.ftue.step, 3); assert.equal(m.ftue.ctl, 'action');
  assert.match(m.ftue.line, goal.k === 'mail' ? /^Take a mail round at / : /^Sign on for work at /);
  vehicles.ejectPed(w, p.ped, true);
  const cash0 = prof.cash;
  conn.sent.length = 0;
  assert.equal(goal.k === 'mail' ? mailjob.start(w, p, w.map.pois[goal.poi], 'walk') : jobs.startCourier(w, p, w.map.pois[goal.poi]), null);
  run(w, 0.6);
  assert.equal(prof.ftue.st, 'done'); assert.equal(prof.ftue.how, 'goal');
  assert.equal(prof.cash, cash0 + FTUE.reward, 'the reward');
  const end = sent(conn, (m2) => m2.t === 'ftue' && m2.a === 'end')[0];
  assert.ok(end && end.title === 'FIRST GOAL DONE' && end.sub.startsWith(`+$${FTUE.reward}`), 'the big moment');
  assert.equal(me(w, p).ftue, null);
  assert.equal(me(w, p).job.k, goal.k === 'mail' ? 'Mail carrier' : 'Courier', 'the job itself now');
  assert.deepEqual(steps, ['ftue_pick', 'ftue_arrive', 'ftue_answer_work', 'ftue_step1', 'ftue_step2', 'ftue_step3', 'ftue_done']);
  for (const s of steps) assert.ok(FTUE_STEPS.includes(s), `${s}: a funnel step the analytics keep`);
  // under three minutes of play from the platform to done, by the timings kept
  const at = prof.ftue.at;
  assert.ok(at.arrive && at.done >= at.arrive);
});

test('the hustle and the great outdoors: a contact to talk to; a rod, bait and a bank to cast from', () => {
  const { w, steps } = world();
  // the hustle: the fence's menu opened is the contact talked to
  const a = newcomer(w);
  toArrival(w); toQuestion(w);
  economy.handleMenu(w, a.p, ASK_POI, 'hustle');
  const g = a.prof.ftue.goal;
  assert.ok(g.k === 'fence' || g.k === 'gang', g.k);
  a.prof.ftue.step = 3;
  teleport(w, a.p.ped, w.map.pois[g.poi].x, w.map.pois[g.poi].y);
  economy.openMenu(w, a.p, w.map.pois[g.poi]);
  assert.equal(a.prof.ftue.st, 'done');
  assert.equal(a.prof.ftue.how, 'goal');
  // the great outdoors: a cane pole and worms (none of their own), a bank that isn't a park's koi pond
  const b = newcomer(w);
  toArrival(w); toQuestion(w);
  assert.equal(fishing.canFish(b.p), false);
  economy.handleMenu(w, b.p, ASK_POI, 'outdoors');
  const f = b.prof.ftue.goal;
  assert.equal(f.k, 'fish');
  assert.equal(b.prof.inventory[FTUE.rod], 1); assert.equal(b.prof.inventory[FTUE.bait[0]], FTUE.bait[1]);
  assert.ok(fishing.canFish(b.p));
  const hab = fishing.habitatAt(w, f.x + Math.cos(f.a) * 48, f.y + Math.sin(f.a) * 48);
  assert.notEqual(hab.spot, 'lily', 'never the koi pond');
  b.prof.ftue.step = 3;
  teleport(w, b.p.ped, f.x, f.y); b.p.ped.a = f.a;
  const spot = fishing.spotFor(w, b.p.ped);
  assert.ok(spot, 'water in front of you at the goal');
  fishing.begin(w, b.p, spot);
  b.p.ped.fishing.P = {}; b.p.ped.fishing.fish = 'bluegill';   // (the line out: the cast landed)
  run(w, 0.6);
  assert.equal(b.prof.ftue.st, 'done');
  // roam: no goal, the one line
  const c = newcomer(w);
  toArrival(w); toQuestion(w);
  c.conn.sent.length = 0; c.p.toasts.length = 0;
  economy.handleMenu(w, c.p, ASK_POI, 'roam');
  assert.equal(c.prof.ftue.st, 'done'); assert.equal(c.prof.ftue.how, 'roam');
  assert.ok(c.p.toasts.some((t) => t.text === ftue.ROAM_LINE));
  assert.equal(me(w, c.p).job, null);
  assert.ok(steps.includes('ftue_answer_hustle') && steps.includes('ftue_answer_outdoors') && steps.includes('ftue_answer_roam'));
  // every answer finds a goal from every arrival station in the world
  for (const gg of starter.publicGarages(w.map).filter((q) => q.station).slice(0, 6)) {
    const st = w.map.pois[gg.poi];
    for (const ans of ['work', 'hustle', 'outdoors']) assert.ok(goalFor(w, ans, st.x, st.y), `${ans} from ${st.label}`);
  }
  assert.deepEqual(ANSWERS.map((x) => x.id), ['work', 'hustle', 'outdoors', 'roam']);
  assert.deepEqual(STEP_CTL.slice(1), ['move', 'vehicle', 'action'], 'move, get in, act');
});

test('skip works at every point: the arrival, the question, the goal - and nothing lingers', () => {
  const { w, steps } = world();
  // the arrival skipped: straight to the question
  const a = newcomer(w);
  toArrival(w);
  ftue.handle(w, a.p, { a: 'skip' });
  assert.equal(a.prof.ftue.st, 'ask');
  assert.ok(sent(a.conn, (m) => m.t === 'menu' && m.poi === ASK_POI).length, 'asked at once');
  // the question closed unanswered: done, no goal
  economy.handleMenu(w, a.p, ASK_POI, 'close');
  assert.equal(a.prof.ftue.st, 'done'); assert.equal(a.prof.ftue.how, 'skip');
  assert.equal(me(w, a.p).ftue, null); assert.equal(me(w, a.p).job, null);
  // the goal skipped, at each step
  for (const step of [1, 2, 3]) {
    const b = newcomer(w);
    toArrival(w); toQuestion(w);
    economy.handleMenu(w, b.p, ASK_POI, 'work');
    b.prof.ftue.step = step;
    assert.equal(me(w, b.p).ftue.step, step);
    ftue.handle(w, b.p, { a: 'skip' });
    assert.equal(b.prof.ftue.st, 'done', `skipped at step ${step}`);
    assert.equal(me(w, b.p).job, null, 'the way and the card gone');
  }
  // the arrival played out on the page: on to the question too
  const c = newcomer(w);
  toArrival(w);
  ftue.handle(w, c.p, { a: 'arrived' });
  assert.equal(c.prof.ftue.st, 'ask');
  assert.equal(steps.filter((s) => s === 'ftue_skip').length, 4);
});

test('everyone goes through it once: a profile from an older progress epoch is reset to a new character as the store loads - the account kept, idempotent', () => {
  const { w } = world();
  const { p, prof } = newcomer(w);
  toArrival(w); toQuestion(w);
  economy.handleMenu(w, p, ASK_POI, 'roam');
  // a tester's character from before the FTUE: money, a home, a crew, a role and sign-ins on the account, no epoch
  const h = w.map.homes.find((q) => !w.homeOwner.has(q.id));
  homes.claim(w, p, h, 0);
  const { p: mate } = joinPlayer(w);
  store.kept.crews = { c1: { lead: prof.pid, members: [prof.pid, mate.pid], names: { [prof.pid]: prof.name, [mate.pid]: mate.name } }, c2: { lead: mate.pid, members: [mate.pid, 'x'], names: {} } };
  store.kept.fishRecords = { bluegill: [2, prof.name] };
  prof.acct = { v: 1, kind: 'member', role: 'admin', logins: [{ p: 'google' }], passkeys: [{ id: 'k' }], ban: null, mute: { until: 9 } };
  Object.assign(prof, { cash: 99999, bank: 123456, criminalExp: 500, felonies: 3, vehicles: [{ model: 'compact' }], loans: { [h.id]: { owed: 1 } }, biz: {}, bounties: [{ id: 'b', amount: 500, takers: [] }], ftue: { st: 'done', how: 'roam', m: { wanted: 1 } }, starter: {} });
  delete prof.epoch;
  players.leave(w, p);
  for (const q of [...store.all()]) if (q !== prof) q.epoch = PROGRESS_EPOCH;
  // the store loads: older profiles reset (server/file-store.js calls this before the world is built)
  assert.equal(resetOldEpochs(store), 1);
  assert.equal(prof.epoch, PROGRESS_EPOCH);
  assert.deepEqual({ cash: prof.cash, bank: prof.bank, cexp: prof.criminalExp, fel: prof.felonies, homes: prof.homes, vehicles: prof.vehicles, loans: prof.loans, bounties: prof.bounties }, { cash: 200, bank: 500, cexp: 0, fel: 0, homes: [], vehicles: [], loans: {}, bounties: undefined });
  assert.deepEqual(prof.ftue, { st: 'new', tips: 1, m: {} }, 'the FTUE not started');
  assert.equal(prof.starter.first, true, 'the starter car\'s first day to come');
  assert.equal(prof.acct.role, 'admin'); assert.equal(prof.acct.logins.length, 1); assert.equal(prof.acct.passkeys.length, 1); assert.deepEqual(prof.acct.mute, { until: 9 }, 'the account kept');
  assert.ok(prof.name && prof.look, 'the name and the look kept');
  assert.equal(store.kept.crews.c1, undefined, 'its crew of two broken up');
  assert.ok(store.kept.crews.c2, 'a crew it wasn\'t in untouched');
  assert.deepEqual(store.kept.fishRecords, {}, 'the records board starts again');
  // a second load resets nothing
  prof.cash = 4321;
  assert.equal(resetOldEpochs(store), 0);
  assert.equal(prof.cash, 4321);
  prof.cash = 200;
  // back in a new world: the arrival, and the starter car in the lot; the home on the market again
  const w2 = makeWorld({ keepKept: true });
  assert.equal(w2.homeOwner.get(h.id), undefined, 'its home back on the market');
  const conn = fakeConn();
  const p2 = players.join(w2, conn, prof);
  const car = starter.carOf(w2, prof.pid);
  assert.ok(car, 'the starter car in the lot');
  toArrival(w2);
  assert.equal(prof.ftue.st, 'arrive');
  const st = w2.map.pois[starter.arrivalFor(w2, p2).poi];
  assert.ok(Math.hypot(car.x - st.x, car.y - st.y) <= STARTER.lotR && Math.hypot(p2.ped.x - st.x, p2.ped.y - st.y) < 900, 'both at the arrival station');
});

test('the epoch checked again on joining: an old profile that reaches a running world is reset there, its home let go', () => {
  const { w } = world();
  const { p, prof } = newcomer(w);
  const h = w.map.homes.find((q) => !w.homeOwner.has(q.id));
  homes.claim(w, p, h, 0);
  prof.cash = 5555; prof.epoch = PROGRESS_EPOCH - 1;
  players.leave(w, p);
  const w2 = makeWorld({ keepKept: true });   // (its homes claimed from the profiles as they stand)
  assert.equal(w2.homeOwner.get(h.id), prof.pid);
  players.join(w2, fakeConn(), prof);
  assert.equal(prof.epoch, PROGRESS_EPOCH); assert.equal(prof.cash, 200);
  assert.equal(w2.homeOwner.get(h.id), undefined, 'let go');
  assert.equal(prof.ftue.st, 'new');
  // a profile with no FTUE record at all (none should be left): a new character's
  const { prof: q } = joinPlayer(w2, { ftue: undefined });
  q.lookPicked = true;
  toArrival(w2);
  assert.equal(q.ftue.st, 'arrive');
});

test('kept across a rejoin: a goal half done carries on; a question unanswered is asked again', () => {
  const { w } = world();
  const { p, prof, conn } = newcomer(w);
  toArrival(w); toQuestion(w);
  economy.handleMenu(w, p, ASK_POI, 'work');
  const car = starter.carOf(w, prof.pid);
  teleport(w, p.ped, car.x + 60, car.y);
  run(w, 0.6);
  assert.equal(prof.ftue.step, 2);
  // a restart: the profile as saved, a new world
  const saved = JSON.parse(JSON.stringify(prof));
  players.leave(w, p); void conn;
  const w2 = makeWorld({ keepKept: true });
  const prof2 = Object.assign(prof, saved);
  const conn2 = fakeConn();
  const p2 = players.join(w2, conn2, prof2);
  run(w2, 0.6);
  assert.equal(prof2.ftue.st, 'goal'); assert.equal(prof2.ftue.step, 2);
  assert.deepEqual(me(w2, p2).ftue.ctl, 'vehicle');
  assert.deepEqual(me(w2, p2).job.step, [2, 3]);
  arriveAtGoal(w2, p2);
  assert.equal(prof2.ftue.step, 3);
  // and one who left at the question: asked again on coming back
  const b = newcomer(w2);
  toArrival(w2); toQuestion(w2);
  assert.equal(b.prof.ftue.st, 'ask');
  const s2 = JSON.parse(JSON.stringify(b.prof));
  players.leave(w2, b.p);
  const w3 = makeWorld({ keepKept: true });
  const c3 = fakeConn();
  players.join(w3, c3, Object.assign(b.prof, s2));
  run(w3, 2.2);
  assert.ok(sent(c3, (m) => m.t === 'menu' && m.poi === ASK_POI).length, 'asked again');
});

test('the first-time moments fire once each, ever: wanted, knocked down, a shop, transit, night, hurt', () => {
  const { w, steps } = world();
  const { p, prof, conn } = newcomer(w);
  toArrival(w); toQuestion(w);
  economy.handleMenu(w, p, ASK_POI, 'roam');
  const tips = () => sent(conn, (m) => m.t === 'ftue' && m.a === 'tip').map((m) => m.id);
  const gap = () => { w.time += FTUE.tipGapS + 1; run(w, 0.6); };
  w.loopTime = 60;   // (broad day: night on its own turn)
  prof.ftue.m.transit = 1;   // (off the train on a platform: transit on its own turn, below)
  const wanted = (n) => { p.heat = n ? STAR_HEAT[n] + 8 : 0; p.wanted = n; };
  // not during the gap after the FTUE
  wanted(1); run(w, 0.6);
  assert.deepEqual(tips(), [], 'nothing straight after the FTUE');
  gap();
  assert.deepEqual(tips(), ['wanted']);
  wanted(0); gap(); wanted(2); gap();
  assert.deepEqual(tips(), ['wanted'], 'once');
  wanted(0);
  // hurt
  p.ped.hp = p.ped.maxHp * (FTUE.hurtAt - 0.1); gap();
  assert.deepEqual(tips(), ['wanted', 'hurt']);
  p.ped.hp = p.ped.maxHp;
  // a shop's counter
  const shop = w.map.pois.find((q) => q.kind === 'convenience');
  gap(); economy.openMenu(w, p, shop);
  assert.deepEqual(tips(), ['wanted', 'hurt', 'shop']);
  gap(); economy.openMenu(w, p, shop);
  assert.equal(tips().filter((t) => t === 'shop').length, 1);
  // a station's platform (a stop for transit)
  const st = w.map.pois.find((q) => q.kind === 'station');
  delete prof.ftue.m.transit;
  teleport(w, p.ped, st.x + 20, st.y); gap();
  assert.ok(tips().includes('transit'));
  // the night
  teleport(w, p.ped, shop.x + 600, shop.y + 600);
  w.loopTime = DAY_PART_S + 30; gap();
  assert.ok(tips().includes('night'));
  // knocked down
  combat.damage(w, p.ped, 9999, null, 'test');
  assert.ok(p.ped.dead);
  p.ftueTipAt = -1e9; run(w, 0.6);   // (no clock jump: that would wake them before the moment's look)
  assert.ok(tips().includes('down'));
  const all = tips();
  assert.deepEqual([...all].sort(), Object.keys(MOMENTS).sort(), 'all six, once each');
  // each line names its Guide section, and the profile remembers them
  for (const m of sent(conn, (x) => x.t === 'ftue' && x.a === 'tip')) assert.ok(['around', 'earn', 'law', 'places', 'activities', 'property', 'items'].includes(m.sec), m.id);
  assert.deepEqual(Object.keys(prof.ftue.m).sort(), Object.keys(MOMENTS).sort());
  for (let i = 0; i < 6; i++) { wanted(1); if (!p.ped.dead) p.ped.hp = 10; gap(); }
  assert.equal(tips().length, all.length, 'never again');
  // "Show tips again" (the Guide): they come back
  ftue.handle(w, p, { a: 'tips' });
  run(w, 4);
  assert.ok(tips().length > all.length, 'back on');
  assert.ok(steps.includes('moment_wanted') && steps.includes('moment_down'));
});

test('the Guide\'s replay: the arrival from where you stand, then the question and a first goal again', () => {
  const { w } = world();
  const { p, prof, conn } = newcomer(w);
  toArrival(w); ftue.handle(w, p, { a: 'skip' });
  economy.handleMenu(w, p, ASK_POI, 'close');
  const x0 = p.ped.x, y0 = p.ped.y;
  conn.sent.length = 0;
  ftue.handle(w, p, { a: 'replay' });
  assert.equal(prof.ftue.st, 'arrive');
  const arr = sent(conn, (m) => m.t === 'ftue' && m.a === 'arrive')[0];
  assert.ok(arr && arr.replay === 1);
  assert.ok(Math.hypot(p.ped.x - x0, p.ped.y - y0) < 1, 'not moved');
  toQuestion(w);
  assert.equal(prof.ftue.st, 'ask');
  economy.handleMenu(w, p, ASK_POI, 'outdoors');
  assert.equal(prof.ftue.st, 'goal');
  // not with a job on
  ftue.handle(w, p, { a: 'skip' });
  p.job = { type: 'courier' }; p.toasts.length = 0;
  ftue.handle(w, p, { a: 'replay' });
  assert.equal(prof.ftue.st, 'done');
  assert.ok(p.toasts.some((t) => /job/.test(t.text)));
});

test('a wiped profile is a new character: after wipeProgress (CLA_FRESH_ON_UPDATE=all) or Start fresh, the arrival and the starter car in the lot', () => {
  const { w } = world();
  // a character who's played: the FTUE done, about the city
  const { p, prof } = newcomer(w);
  toArrival(w); toQuestion(w);
  economy.handleMenu(w, p, ASK_POI, 'roam');
  assert.equal(prof.ftue.st, 'done');
  starter.forget(w, prof.pid);
  for (const e of [...w.entities.values()]) if (e.starter === prof.pid) w.remove(e);
  prof.starter = {};
  prof.build = 'build-1'; prof.pos = { x: p.ped.x, y: p.ped.y };
  const saved = JSON.parse(JSON.stringify(prof));
  players.leave(w, p);
  // the update with everyone reset: a new server on a new build
  const w2 = makeWorld({ keepKept: true });
  w2.build = 'build-2'; w2.freshOnUpdate = 'all';
  const conn = fakeConn();
  const p2 = players.join(w2, conn, Object.assign(prof, saved));
  assert.deepEqual({ st: prof.ftue.st, first: prof.starter.first }, { st: 'new', first: undefined }, 'a new character: the FTUE not started (the car\'s first day spent at once - below)');
  const car = starter.carOf(w2, prof.pid);
  assert.ok(car, 'the starter car in the lot');
  toArrival(w2);
  assert.equal(prof.ftue.st, 'arrive', 'the arrival');
  const g = starter.arrivalFor(w2, p2), st = w2.map.pois[g.poi];
  assert.ok(Math.hypot(car.x - st.x, car.y - st.y) <= STARTER.lotR && Math.hypot(p2.ped.x - st.x, p2.ped.y - st.y) < 900, 'both at the arrival station');
  assert.ok(sent(conn, (m) => m.t === 'ftue' && m.a === 'arrive').length);
  // Start fresh (players.wipeAccount): the same
  const b = newcomer(w2);
  toArrival(w2); toQuestion(w2);
  economy.handleMenu(w2, b.p, ASK_POI, 'roam');
  b.prof.acct = { v: 1, kind: 'guest', logins: [], passkeys: [] };   // (every online profile has its account record: kept)
  players.wipeAccount(w2, b.p);
  assert.equal(b.prof.ftue.st, 'new'); assert.equal(b.prof.starter.first, true);
});

test('where to arrive: skipped or left, the default; rejoining mid-choice, the card again; the car\'s lot follows the pick', () => {
  const { w, steps } = world();
  const choices = starter.arrivalChoices(w), def = choices[0];
  assert.ok(choices.length >= 2 && def.def, 'stations to choose from, the default first');
  // skipped (Esc, B, Skip): the default, on to the arrival
  const a = newcomer(w);
  toPick(w);
  ftue.handle(w, a.p, { a: 'skip' });
  assert.equal(a.prof.ftue.st, 'arrive'); assert.equal(a.prof.ftue.stn, def.poi);
  // a station not on the card: the default too
  const b = newcomer(w);
  toPick(w);
  ftue.handle(w, b.p, { a: 'pick', stn: 999999 });
  assert.equal(b.prof.ftue.stn, def.poi);
  // left on the card: the default once FTUE.pickS is up
  const c = newcomer(w);
  toPick(w);
  w.time += FTUE.pickS + 1; run(w, 0.6);
  assert.equal(c.prof.ftue.st, 'arrive'); assert.equal(c.prof.ftue.stn, def.poi);
  assert.equal(steps.filter((s) => s === 'ftue_pick_default').length, 3);
  // left mid-choice and back (a restart): the card again, and the pick still moves the car
  const d = newcomer(w);
  toPick(w);
  const saved = JSON.parse(JSON.stringify(d.prof));
  players.leave(w, d.p);
  const w2 = makeWorld({ keepKept: true });
  const conn2 = fakeConn();
  const p2 = players.join(w2, conn2, Object.assign(d.prof, saved));
  assert.equal(d.prof.ftue.st, 'pick');
  run(w2, 0.6);
  assert.equal(sent(conn2, (m) => m.t === 'ftue' && m.a === 'pick').length, 0, 'not at once');
  run(w2, 1.6);
  const card = sent(conn2, (m) => m.t === 'ftue' && m.a === 'pick');
  assert.equal(card.length, 1, 'the card again');
  assert.equal(d.prof.ftue.st, 'pick', 'still choosing - no default picked while away');
  const far = card[0].opts[card[0].opts.length - 1], st = w2.map.pois[far.id];
  ftue.handle(w2, p2, { a: 'pick', stn: far.id });
  const car = starter.carOf(w2, d.prof.pid);
  assert.equal(d.prof.ftue.stn, far.id);
  assert.ok(car && Math.hypot(car.x - st.x, car.y - st.y) <= STARTER.lotR, 'the starter car in the picked station\'s lot');
  assert.ok(Math.hypot(p2.ped.x - st.x, p2.ped.y - st.y) < 900, 'off the train there');
  assert.equal(starter.arrivalFor(w2, p2).poi, far.id, 'one function for both');
  // a pick after the card is gone does nothing
  ftue.handle(w2, p2, { a: 'pick', stn: def.poi });
  assert.equal(d.prof.ftue.stn, far.id);
});
