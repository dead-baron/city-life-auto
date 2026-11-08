// The "What's next" app (server/systems/whatsnext.js; shared/rules.js NEXT): three cards by slot, ranked by fit, distance,
// novelty and pay per time; a card skipped twice gone for the day; one card in five never tried; the registry of card
// sources; the phone's messages; the HUD's dot and the session's one line; off until the first-time experience is done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, players } from './helpers.js';
import { NEXT } from '../shared/rules.js';
// (after the world's modules: whatsnext.js reaches the job board's, which load in the world's order)
const nx = await import('../server/systems/whatsnext.js');
const careers = await import('../server/systems/careers.js');

const done = (o = {}) => ({ ftue: { st: 'done', tips: 0, m: {} }, ...o });
const card = (id, o = {}) => ({ id, slot: 'career', title: id, btn: { k: 'way', label: 'Go' }, ...o });
const ctx = (o = {}) => ({ main: 'business', at: { x: 0, y: 0 }, tried: {}, skips: {}, ...o });

test('ranking: fit to the main career, distance, novelty, pay per time', () => {
  const C = ctx({ tried: { fish: 1, cab: 1 } });
  const s = (o) => nx.score(card('x', o), C);
  assert.ok(s({ career: 'business' }) > s({ career: 'crime' }), 'the main career fits best');
  assert.ok(s({ career: 'crime' }) < s({ career: null }) || NEXT.fitAny < 0.5, 'another career: half');
  assert.ok(s({ x: 100, y: 0 }) > s({ x: 20000, y: 0 }), 'nearer is better');
  assert.ok(s({ act: 'bowl' }) > s({ act: 'fish' }), 'never tried beats done before');
  assert.ok(s({ pay: 1000, mins: 5 }) > s({ pay: 100, mins: 5 }), 'more pay for the time');
  assert.ok(s({ pay: 1000, mins: 5 }) > s({ pay: 1000, mins: 50 }), 'less time for the pay');
  assert.ok(nx.score(card('x'), ctx({ skips: { x: 1 } })) < nx.score(card('x'), C), 'skipped once: lower');
});

test('three cards, one a slot; a slot with nothing takes the best card left (never a goal\'s)', () => {
  const cands = [card('a', { career: 'business', pay: 500 }), card('b', { career: 'crime' }), card('g', { slot: 'goal' }), card('n', { slot: 'near', x: 10, y: 0 })];
  const three = nx.pickThree(cands, ctx(), { shown: 0, last: [] });
  assert.deepEqual(three.map((c) => c.id), ['a', 'g', 'n']);
  const two = nx.pickThree([card('a'), card('b'), card('g', { slot: 'goal' })], ctx(), { shown: 0, last: [] });
  assert.deepEqual(two.map((c) => c.id), ['a', 'g', 'b'], 'no happening near: the next best career card');
  const noGoal = nx.pickThree([card('a'), card('n', { slot: 'near' })], ctx(), { shown: 0, last: [] });
  assert.deepEqual(noGoal.map((c) => c.id), ['a', 'n']);
});

test('a card skipped twice drops for the day', () => {
  const cands = () => [card('a', { career: 'business', pay: 900 }), card('b', { career: 'business' })];
  assert.equal(nx.pickThree(cands(), ctx({ skips: { a: 1 } }), { shown: 0 })[0].id, 'a', 'once: still shown if it\'s still the best');
  const after = nx.pickThree(cands(), ctx({ skips: { a: NEXT.skipDrop } }), { shown: 0 });
  assert.ok(!after.some((c) => c.id === 'a'));
});

test('one card in five shown is something never tried', () => {
  const st = { shown: 0, last: [] };
  let novel = 0, total = 0;
  for (let i = 0; i < 25; i++) {
    const cands = [card(`c${i}`, { career: 'business', pay: 900, act: 'cab' }), card(`n${i}`, { slot: 'near', act: 'cab' }), card(`new${i}`, { act: 'bowl', career: null })];
    for (const c of nx.pickThree(cands, ctx({ tried: { cab: 1 } }), st)) { total++; if (c.novel) novel++; }
  }
  assert.equal(total, 50);
  assert.equal(novel, 50 / NEXT.novelEvery, 'every fifth new card');
});

test('the registry of card sources: a feature plugs in its own cards (the event calendar\'s way)', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, done());
  nx.registerCardSource('testevents', (world, q, now) => (q === p ? [{ id: 'testevents:truck', title: 'Armored truck leaves First Pixel Bank in 4:00', x: p.ped.x + 50, y: p.ped.y, pay: 99999, mins: 4, career: 'business', accept: () => null, btn: { k: 'accept', label: 'Accept' }, until: w.time + 240 + now * 0 }] : []), { slot: 'near' });
  try {
    assert.ok(nx.sources().includes('testevents'));
    const S = nx.handle(w, p, { a: 'next' });
    const c = S.cards.find((q) => q.id === 'testevents:truck');
    assert.ok(c, 'its card is the happening near you');
    assert.equal(c.slot, 'near');
    assert.equal(c.accept, undefined, 'the server-side accept stays on the server');
    const go = nx.handle(w, p, { a: 'nextgo', id: c.id });
    assert.equal(go.ok, 1);
  } finally { nx.registerCardSource('testevents', () => []); }
});

test('in the game: off until the FTUE is done; then three cards, the rank bars, the goals; skip, waypoint, main career', () => {
  const w = makeWorld();
  const fresh = joinPlayer(w, { ftue: { st: 'goal', tips: 0, m: {} } }).p;
  assert.deepEqual(nx.handle(w, fresh, { a: 'next' }), { t: 'next', on: 0 });
  assert.equal(players.buildMe(w, fresh).nx, undefined, 'no dot before the app takes over');
  const { p, conn } = joinPlayer(w, done());
  const S = nx.handle(w, p, { a: 'next' });
  assert.equal(S.on, 1);
  assert.equal(S.careers.length, 3);
  assert.ok(S.careers.every((c) => c.title && c.next), 'each career: its rank and the next');
  assert.ok(S.cards.length >= 2 && S.cards.length <= 3, `cards: ${S.cards.map((c) => c.id)}`);
  assert.ok(S.cards.some((c) => c.slot === 'goal'), 'a daily goal');
  assert.equal(S.goals.daily.length, 3);
  assert.ok(S.cards.every((c) => c.btn && ['way', 'call', 'accept'].includes(c.btn.k)), 'one button each');
  // skip the first twice: gone for the day
  const id = S.cards[0].id;
  nx.handle(w, p, { a: 'nextskip', id });
  let T = nx.handle(w, p, { a: 'next' });
  if (T.cards.some((c) => c.id === id)) nx.handle(w, p, { a: 'nextskip', id });
  T = nx.handle(w, p, { a: 'next' });
  assert.ok(!T.cards.some((c) => c.id === id), 'skipped twice: dropped');
  // a waypoint card's button: the waypoint back
  const wc = T.cards.find((c) => c.btn.k === 'way');
  if (wc) { const r = nx.handle(w, p, { a: 'nextgo', id: wc.id }); assert.deepEqual([r.way.x, r.way.y], [wc.x, wc.y]); }
  // lead with another career
  const M = nx.handle(w, p, { a: 'nextmain', c: 'crime' });
  assert.equal(M.main, 'crime'); assert.equal(careers.mainCareer(p), 'crime');
  // the HUD: the cards' signature in the self record; the session's one line, once
  run(w, 1.2);
  assert.notEqual(players.buildMe(w, p).nx, undefined);
  run(w, NEXT.everyS + 1);
  const lines = conn.sent.filter((m) => m && m.t === 'ftue' && m.a === 'tip' && m.id === 'next');
  assert.equal(lines.length, 1, 'one line the first time this session');
  assert.equal(lines[0].app, 'next');
});
