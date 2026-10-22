// The race book (#310 - server/systems/racebook.js, shared/racebook.js): a race every few minutes at Lucky Mesa's casinos;
// its field and odds the same for anyone; win bets till the off; the race run from the book's seed drawn at the off, the
// same here as on every page; the winners paid at their odds as their horse crosses the line; the house's edge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run as runWorld } from './helpers.js';
import { DT } from '../shared/constants.js';
import { RACEBOOK } from '../shared/rules.js';
import { fieldOf, oddsOf, run, payout } from '../shared/racebook.js';
import * as racebook from '../server/systems/racebook.js';
import * as casino from '../server/systems/casino.js';
import * as economy from '../server/systems/economy.js';
import { store } from '../server/store.js';

test('the races: a field of six, the same for anyone; one race run alike from its seed; the book keeps its edge', () => {
  const F = fieldOf(42);
  assert.equal(F.length, RACEBOOK.field);
  assert.deepEqual(fieldOf(42), F, 'race 42 is race 42');
  assert.equal(new Set(F.map((h) => h.name)).size, F.length, 'six different horses');
  const a = run(F, 123456789), b = run(F, 123456789);
  assert.deepEqual(a.order, b.order); assert.deepEqual(a.t, b.t);
  assert.ok(a.t.every((x) => x > RACEBOOK.runS * 0.8 && x < RACEBOOK.runS * 1.35), `about ${RACEBOOK.runS} s round (${a.t.map((x) => x.toFixed(1))})`);
  assert.ok(a.at(a.order[0], 0) === 0 && a.at(a.order[0], a.t[a.order[0]] + 1) === 1, 'from the gate to the post');
  // over many races, betting every runner: about the book's take comes back; the favourite wins often, not always
  let back = 0, staked = 0, fav = 0, races = 0;
  for (let n = 0; n < 80; n++) {
    const f = fieldOf(n), o = oddsOf(f, n), fi = o.map((x, i) => [x[0] / x[1], i]).sort((p, q) => p[0] - q[0])[0][1];
    for (let k = 0; k < 25; k++) {
      const r = run(f, (Math.imul(n * 31 + k, 2654435761) >>> 0) || 1);
      races++; if (r.order[0] === fi) fav++;
      for (let i = 0; i < f.length; i++) { staked += 10; if (r.order[0] === i) back += payout(10, o[i]); }
    }
  }
  const rtp = back / staked;
  assert.ok(rtp > 0.72 && rtp < 0.97, `the house's edge (${rtp.toFixed(3)} back)`);
  assert.ok(fav / races > 0.2 && fav / races < 0.6, `favourites win ${(fav / races * 100).toFixed(0)}%`);
});

test('betting: open till the off, three a race, the stake taken; at the off the seed drawn; the winners paid in cash at their odds', () => {
  const w = makeWorld();
  racebook.seedLuck(7);
  const A = joinPlayer(w), B = joinPlayer(w);
  A.prof.cash = 5000; B.prof.cash = 5000;
  // to the start of a race's betting
  const n0 = racebook.raceNo(w.tick * DT) + 1;
  while (w.tick * DT < racebook.postAt(n0) + 1) w.step();
  const R = racebook.current(w);
  assert.equal(R.n, n0); assert.equal(racebook.phase(R, w.tick * DT), 'betting');
  assert.equal(R.seed, null, 'no seed before the off');
  // A backs every runner (three bets at most), B one
  const pay = economy.payFrom;
  for (let i = 0; i < 3; i++) assert.equal(racebook.bet(w, A.p, i, 50, pay), null);
  assert.match(racebook.bet(w, A.p, 3, 50, pay), /3 bets/);
  assert.equal(A.prof.cash, 5000 - 150);
  assert.equal(racebook.bet(w, B.p, 5, 250, pay), null);
  assert.match(racebook.bet(w, B.p, 5, 77, pay), /stake/);
  // the off: betting closed, the seed drawn, the race run
  while (w.tick * DT < racebook.offAt(n0) + 0.5) w.step();
  assert.ok(R.seed && R.res, 'the seed drawn at the off');
  assert.match(racebook.bet(w, B.p, 1, 50, pay), /closed/);
  assert.equal(racebook.phase(R, w.tick * DT), 'running');
  // B leaves before the finish: paid all the same (into the account)
  const bPid = B.p.pid;
  for (const [k, q] of w.players) if (q === B.p) w.players.delete(k);   // (gone: not on the server)
  const win = R.res.order[0];
  const cashA = A.prof.cash, cashB = B.prof.cash;
  while (w.tick * DT < racebook.offAt(n0) + R.res.t[win] + 1) w.step();
  assert.ok(R.paid, 'settled');
  const expA = win < 3 ? payout(50, R.odds[win]) : 0, expB = win === 5 ? payout(250, R.odds[5]) : 0;
  assert.equal(A.prof.cash - cashA, expA, `A paid ${expA} (winner ${win})`);
  assert.equal(store.get(bPid).cash - cashB, expB, `B paid ${expB}`);
  // the screen's view of it, as the page gets it
  const sc = racebook.screen(w, A.p);
  assert.equal(sc.n, n0); assert.equal(sc.seed, R.seed); assert.equal(sc.mine.length, 3);
  assert.deepEqual(run(sc.field, sc.seed).order, R.res.order, 'the page runs the same race');
  runWorld(w, RACEBOOK.everyS);
  assert.equal(racebook.current(w).n, n0 + 1, 'the next race posted');
});

test('the casino floor: the race book among the games; a bet from the menu', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.cash = 2000;
  const poi = { id: 9999, kind: 'casino', casino: true, label: 'Test Casino', x: p.ped.x, y: p.ped.y };
  casino.open(w, p, poi);
  assert.ok(casino.menu(w, p, poi).opts.some((o) => o.id === 'cs:race'), 'the race book on the floor');
  casino.execute(w, p, poi, 'cs:race', economy.payFrom);
  // wait for betting to open
  while (racebook.phase(racebook.current(w), w.tick * DT) !== 'betting') w.step();
  const m = casino.menu(w, p, poi), bets = m.opts.filter((o) => o.id.startsWith('cs:rbet:'));
  assert.equal(bets.length, RACEBOOK.field, 'a bet on each runner');
  assert.equal(m.board.length, RACEBOOK.field, 'the field on the board');
  assert.equal(casino.execute(w, p, poi, 'cs:rbet:2', economy.payFrom), null);
  assert.equal(prof.cash, 2000 - RACEBOOK.stakes[0]);
});
