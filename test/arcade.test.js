// The arcades (the owner, 10-08 / 10-16: "Arcade: walk in and play our own 8-bit games... tickets for prizes" - server
// arcade.js, client/arcade.js): a credit at an arcade's door, the score back from the page worth tickets (checked against
// the time it took), the prize counter; the mansion's cabinet free, no tickets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { ARCADE } from '../shared/rules.js';
import * as arcade from '../server/systems/arcade.js';
import * as economy from '../server/systems/economy.js';
import * as A from '../client/arcade.js';

const lastOf = (conn, t) => [...conn.sent].reverse().find((m) => m && m.t === t);

test('the game\'s own rules: a wave of forty, three kinds, boxes that meet', () => {
  const W = A._test.newWave(0);
  assert.equal(W.en.length, 40);
  assert.deepEqual([...new Set(W.en.map((e) => e.k))].sort(), ['a1', 'a2', 'a3']);
  assert.ok(A._test.newWave(3).v > W.v, 'faster each wave');
  assert.ok(A._test.hit(0, 0, 4, 4, 3, 3, 4, 4) && !A._test.hit(0, 0, 4, 4, 5, 5, 4, 4));
});

test('an arcade: a credit, the score worth tickets (and no more than the time allows), the prize counter', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 50, bank: 0 });
  let poi = w.map.pois.find((q) => arcade.isArcade(w, q));
  if (!poi) {   // (the old city's arcade, or one made here)
    const b = w.map.buildings.find((q) => q && q.tw >= 2);
    b.key = 'arcade';
    poi = { id: w.map.pois.length, kind: 'delivery', label: 'Test Arcade', x: p.ped.x + 10, y: p.ped.y, r: 40, b: w.map.buildings.indexOf(b) };
    w.map.pois.push(poi);
  }
  assert.ok(arcade.isArcade(w, poi));
  teleport(w, p.ped, poi.x, poi.y);
  economy.openMenu(w, p, poi);
  let m = lastOf(conn, 'menu');
  assert.ok(m.opts.some((o) => o.id === 'ar:play' && o.price === ARCADE.price && o.shut), 'a credit');
  economy.handleMenu(w, p, poi.id, 'ar:play');
  assert.equal(prof.cash, 50 - ARCADE.price, 'paid');
  const credit = lastOf(conn, 'arcade');
  assert.ok(credit && credit.game === 'starfall' && credit.id && !credit.free, 'the page told to play');
  // a wrong credit: nothing
  arcade.onScore(w, p, { id: 'nope', score: 5000, secs: 100 });
  assert.ok(!prof.tickets);
  // two minutes of play, 3,000 points
  run(w, 120);
  arcade.onScore(w, p, { id: credit.id, score: 3000, secs: 120 });
  assert.equal(prof.tickets, Math.min(ARCADE.maxTickets, 30), '30 tickets');
  assert.equal(prof.arcadeBest, 3000);
  arcade.onScore(w, p, { id: credit.id, score: 3000, secs: 120 });
  assert.equal(prof.tickets, 30, 'a credit counts once');
  // a score the time can't have made: cut to what it could
  economy.handleMenu(w, p, poi.id, 'ar:play');
  const c2 = lastOf(conn, 'arcade');
  run(w, 2);
  arcade.onScore(w, p, { id: c2.id, score: 99999, secs: 2 });
  assert.ok(prof.tickets - 30 <= Math.floor(4 * ARCADE.maxRate / ARCADE.perTicket), `no more than the time allows (${prof.tickets - 30})`);
  // the prize counter
  prof.tickets = 60;
  economy.handleMenu(w, p, poi.id, 'ar:prizes');
  m = lastOf(conn, 'menu');
  assert.match(m.sub, /60 tickets/);
  const i = ARCADE.prizes.findIndex((q) => q.item === 'energy');
  assert.ok(!m.opts.find((o) => o.id === `ar:prize:${i}`).dis);
  economy.handleMenu(w, p, poi.id, `ar:prize:${i}`);
  assert.equal(prof.tickets, 60 - ARCADE.prizes[i].t);
  assert.equal(prof.inventory.energy, 1, 'won: an energy drink');
  const sk = ARCADE.prizes.findIndex((q) => q.item === 'skateboard');
  assert.ok(lastOf(conn, 'menu').opts.find((o) => o.id === `ar:prize:${sk}`).dis, 'not enough for the board');
});

test('the mansion\'s cabinet: free, no tickets, the high score', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w);
  arcade.play(w, p, true);
  const c = lastOf(conn, 'arcade');
  assert.ok(c.free);
  run(w, 60);
  arcade.onScore(w, p, { id: c.id, score: 1500, secs: 60 });
  assert.ok(!prof.tickets, 'no tickets');
  assert.equal(prof.arcadeBest, 1500);
});

test('a frame of pool: the rack, the break spreading them, a pocket, everything coming to rest; the shots back to the server', async () => {
  const P = await import('../client/pool.js');
  const { rack, physics, POCKETS } = P._test;
  const balls = rack();
  assert.equal(balls.length, 10);
  // the break: the cue ball hard at the rack
  const cb = balls[0];
  cb.vx = 420; cb.vy = 3;
  const potted = [];
  let t = 0, moving = true;
  for (; t < 30 && moving; t += 1 / 120) moving = physics(balls, 1 / 120, (b) => potted.push(b.n));
  assert.ok(!moving, `everything at rest (${t.toFixed(1)} s)`);
  const spread = Math.max(...balls.filter((b) => b.n && !b.in).map((b) => b.x)) - Math.min(...balls.filter((b) => b.n && !b.in).map((b) => b.x));
  assert.ok(spread > 30, `the rack broken up (${spread.toFixed(0)} px across)`);
  for (const b of balls) if (!b.in) assert.ok(b.x > 18 && b.x < 238 && b.y > 20 && b.y < 140, 'on the table');
  // a ball rolled at a corner pocket drops
  const lone = [{ n: 1, x: POCKETS[0][0] + 30, y: POCKETS[0][1] + 30, vx: -150, vy: -150, in: false }];
  const got = [];
  for (let k = 0; k < 240; k++) physics(lone, 1 / 120, (b) => got.push(b.n));
  assert.deepEqual(got, [1], 'potted');
  // the server: a frame's shots kept as the best, nothing for an impossible one
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w);
  arcade.play(w, p, true, null, 'pool');
  const c = lastOf(conn, 'arcade');
  assert.equal(c.game, 'pool');
  arcade.onScore(w, p, { id: c.id, score: 4, secs: 60 });
  assert.ok(!prof.poolBest, 'fewer than nine shots: not a frame');
  arcade.play(w, p, true, null, 'pool');
  run(w, 90);
  arcade.onScore(w, p, { id: lastOf(conn, 'arcade').id, score: 17, secs: 90 });
  assert.equal(prof.poolBest, 17);
});
