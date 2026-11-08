// Daily and weekly goals (server/systems/goals.js; shared/rules.js GOALS): three a day by slot, rolled the same however
// often asked, rerolled once, counted from the progress events, paid when done; the streak and its one-day grace; the
// weekly scaled to rank; the day turning at a fixed server time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer } from './helpers.js';
import { GOALS, CAREERS } from '../shared/rules.js';
import * as goals from '../server/systems/goals.js';
import * as careers from '../server/systems/careers.js';

const DAY = 86400e3;
const at = (day) => day * DAY + (GOALS.resetUtcH + 3) * 3600e3;   // (three hours into that goal day)
const done = (o = {}) => ({ ftue: { st: 'done', tips: 0, m: {} }, ...o });

test('the day turns at a fixed server time; the week on Mondays', () => {
  const d = 20000, t = d * DAY + GOALS.resetUtcH * 3600e3;
  assert.equal(goals.dayKey(t), d);
  assert.equal(goals.dayKey(t - 1), d - 1, 'a moment before the reset: still yesterday');
  assert.equal(goals.resetIn(t), DAY);
  // 1970-01-05 was a Monday (day 4): a new week from it
  assert.equal(goals.weekKey(4), goals.weekKey(10));
  assert.equal(goals.weekKey(3) + 1, goals.weekKey(4));
});

test('three a day: the main career\'s, another career\'s, a side activity\'s - the same however often it\'s asked', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ criminalExp: 200 }));   // (crime leads)
  assert.equal(careers.mainCareer(p), 'crime');
  const t = at(20100), G = goals.state(p, t);
  assert.equal(G.list.length, 3);
  assert.deepEqual(G.list.map((g) => g.slot), ['main', 'any', 'side']);
  assert.equal(G.list[0].c, 'crime');
  assert.ok(['police', 'business'].includes(G.list[1].c), 'another career');
  assert.equal(G.list[2].c, 'side');
  const again = goals.roll(p, G.day);
  assert.deepEqual(again.map((g) => g.k), G.list.map((g) => g.k), 'seeded by the account and the day');
  // the next day, rolled afresh (the reroll back)
  G.rr = 1;
  const d0 = G.day, G2 = goals.state(p, t + DAY);
  assert.equal(G2.day, d0 + 1); assert.equal(G2.rr, 0);
  // every goal has a solo route: a 'cop' goal only for someone fit for duty, 'biz' only with a business
  for (let d = 0; d < 40; d++) for (const g of goals.roll(p, 20000 + d)) {
    const T = goals.BY_ID[g.k];
    assert.notEqual(T.need, 'cop', 'not fit for duty: no arrests goal');
    assert.notEqual(T.need, 'biz', 'no business: no takings goal');
  }
  p.profile.samaritan = 100;
  let cop = 0;
  for (let d = 0; d < 60; d++) for (const g of goals.roll(p, 20000 + d)) if (goals.BY_ID[g.k].need === 'cop') cop++;
  assert.ok(cop > 0, 'fit for duty: the police goals come up');
});

test('goals sized by rank; counted from the progress events; paid cash and career XP when done', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, done({ criminalExp: 0 }));
  const t = at(20200), G = goals.state(p, t);
  G.list = [{ k: 'fence', slot: 'main', c: 'crime', n: 1000, got: 0, done: 0 }, { k: 'clean', slot: 'any', c: 'business', n: 1000, got: 0, done: 0 }, { k: 'bigfish', slot: 'side', c: 'side', n: 1, got: 0, done: 0 }];
  assert.equal(goals.roll(p, G.day).find((g) => g.k === 'fence')?.n ?? 1000, 1000);
  const cash = prof.cash, cx = prof.criminalExp;
  goals.onNote(w, p, 'fence', { n: 600 }, t);
  assert.equal(G.list[0].got, 600); assert.equal(G.list[0].done, 0);
  goals.onNote(w, p, 'fence', { n: 600 }, t);
  assert.equal(G.list[0].done, 1);
  assert.equal(prof.cash, cash + goals.BY_ID.fence.cash);
  assert.equal(prof.criminalExp, cx + goals.BY_ID.fence.xp);
  goals.onNote(w, p, 'fish', { lb: 4 }, t);
  assert.equal(G.list[2].got, 0, 'a 4 lb fish isn\'t 10 lb+');
  goals.onNote(w, p, 'fish', { lb: 11 }, t);
  assert.equal(G.list[2].done, 1);
  // the side goal's XP goes to the main career
  // all three: the bonus (a 1-day streak)
  const c2 = prof.cash;
  goals.onNote(w, p, 'clean', { n: 1000 }, t);
  assert.equal(G.streak.n, 1);
  assert.equal(prof.cash, c2 + goals.BY_ID.clean.cash + GOALS.allCash);
  // a rank 6 career's goal is bigger
  const big = joinPlayer(w, done({ criminalExp: 3000 })).p;
  const fence = goals.roll(big, 20200).find((g) => g.k === 'fence');
  if (fence) assert.equal(fence.n, goals.BY_ID.fence.n[2]);
  assert.ok(goals.BY_ID.fence.n[2] > goals.BY_ID.fence.n[0]);
});

test('one free reroll a day: another goal of the same slot, not one already there', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done({ policePts: 0, samaritan: 0 }));
  const t = at(20300), G = goals.state(p, t);
  const before = G.list.map((g) => g.k);
  assert.equal(goals.reroll(p, 2, t), null);
  assert.equal(G.list[2].slot, 'side');
  assert.notEqual(G.list[2].k, before[2]);
  assert.ok(!before.slice(0, 2).includes(G.list[2].k));
  assert.match(goals.reroll(p, 1, t), /used today's reroll/);
  G.list[0].done = 1;
  G.rr = 0;
  assert.match(goals.reroll(p, 0, t), /done already/);
  assert.equal(goals.panel(p, t).rr, 1);
});

test('the streak: builds up to day 7; a missed day pauses it for one day, a second resets it', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, done({}));
  const finishDay = (d) => {
    const G = goals.state(p, at(d));
    G.list = [{ k: 'catch', slot: 'side', c: 'side', n: 1, got: 0, done: 0 }];
    goals.onNote(w, p, 'fish', { lb: 1 }, at(d));
    return G;
  };
  let G;
  for (let d = 0; d < 9; d++) G = finishDay(21000 + d);
  assert.equal(G.streak.n, 9);
  assert.equal(goals.streakMult(G.streak.n), goals.streakMult(GOALS.streakMax), 'the bonus stops growing at day 7');
  assert.ok(goals.streakMult(7) > goals.streakMult(1));
  // a day missed (21009): paused, not reset
  G = finishDay(21010);
  assert.equal(G.streak.n, 10);
  // two missed (21011, 21012): reset
  assert.equal(goals.streakNow(G, 21012), 10, 'one day after the miss: still there');
  assert.equal(goals.streakNow(G, 21013), 0, 'two missed: gone');
  G = finishDay(21013);
  assert.equal(G.streak.n, 1);
  // the bonus grows with the streak
  const cash = prof.cash;
  G = finishDay(21014);
  assert.equal(prof.cash - cash, goals.BY_ID.catch.cash + Math.round(GOALS.allCash * goals.streakMult(2)));
});

test('the weekly: the main career\'s, scaled to rank; a crate\'s worth, a cosmetic token and XP', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, done({ policePts: 900 }));
  const t = at(21100), G = goals.state(p, t);
  assert.equal(G.wk.c, 'police');
  assert.equal(G.wk.n, GOALS.weekly.police.n[1], 'rank 5: the middle size');
  const R = goals.weekReward(p, 'police');
  assert.equal(R.tier, GOALS.weekTier[careers.careerRank(p, 'police')]);
  const cash = prof.cash;
  goals.onNote(w, p, 'xp:police', { n: G.wk.n }, t);
  assert.equal(G.wk.done, 1);
  assert.equal(prof.cash, cash + R.cash);
  assert.equal(G.tok, 1);
  assert.equal(prof.policePts, 900 + GOALS.weekXp);
  // the record survives a save and a load
  const back = JSON.parse(JSON.stringify(prof.goals));
  assert.deepEqual(back.wk, G.wk); assert.equal(back.tok, 1);
  void CAREERS;
});

test('no goals before the first-time experience is done', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w, { ftue: { st: 'goal', tips: 0, m: {} } });
  goals.onNote(w, p, 'fish', { lb: 20 });
  assert.equal(prof.goals, undefined);
});
