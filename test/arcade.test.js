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
  assert.ok(!prof.poolBest, 'cleared the moment it started: not a frame');
  arcade.play(w, p, true, null, 'pool');
  run(w, 90);
  arcade.onScore(w, p, { id: lastOf(conn, 'arcade').id, score: 17, secs: 90 });
  assert.equal(prof.poolBest, 17);
});

test('skee-ball and air hockey: the lane\'s rings, the table\'s puck, and their tickets', async () => {
  const S = (await import('../client/skeeball.js'))._test;
  assert.equal(S.pointsAt(S.RING.x, S.RING.y), 50, 'the cup');
  assert.equal(S.pointsAt(S.POCKETS[0][0], S.POCKETS[0][1]), 100, 'a corner pocket');
  assert.equal(S.pointsAt(S.RING.x, S.RING.y + S.RING.r[3] - 2), 20);
  assert.equal(S.pointsAt(S.RING.x, -10), 10, 'over the top: back into the 10');
  // straight up the middle: from short of the rings, through the cup, to over the top as the power rises
  const seen = new Set();
  for (let p = 0; p <= 1.0001; p += 0.05) { const L = S.landing(0, p); seen.add(S.pointsAt(L.x, L.y)); }
  assert.ok(seen.has(50) && seen.has(40) && seen.has(10), [...seen].join(','));
  // a pocket can be reached: the aim and power for it
  let pocket = false;
  for (let a = -0.42; a <= 0.42 && !pocket; a += 0.01) for (let p = 0; p <= 1 && !pocket; p += 0.01) { const L = S.landing(a, p); if (S.pointsAt(L.x, L.y) === 100) pocket = true; }
  assert.ok(pocket, 'a 100 pocket reachable');
  // air hockey: a puck struck toward the machine's goal goes in; the machine's mallet goes after a puck on its half
  const Hk = (await import('../client/airhockey.js'))._test;
  const Tb = Hk.newTable();
  Tb.puck.x = 100; Tb.puck.y = Hk.CY; Tb.me.x = 86; Tb.me.y = Hk.CY; Tb.me.vx = 500; Tb.me.vy = 0;
  assert.ok(Hk.strike(Tb.puck, Tb.me) && Tb.puck.vx > 200, 'struck');
  let r = null;
  for (let k = 0; k < 600 && r !== 'us'; k++) r = Hk.glide(Tb.puck, 1 / 120);
  assert.equal(r, 'us', 'in the machine\'s goal');
  const T2 = Hk.newTable(); T2.puck.x = 200; T2.puck.y = Hk.T.y0 + 20;
  const y0 = T2.cpu.y;
  for (let k = 0; k < 60; k++) Hk.cpuMove(T2, 1 / 120);
  assert.ok(T2.cpu.y < y0, 'the machine goes for it');
  // the server: points into tickets, if they could be true
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 50 });
  arcade.play(w, p, false, null, 'skee');
  let c = lastOf(conn, 'arcade');
  assert.equal(c.game, 'skee');
  arcade.onScore(w, p, { id: c.id, score: 450, secs: 3 });
  assert.ok(!prof.tickets, 'too quick');
  arcade.play(w, p, false, null, 'skee'); c = lastOf(conn, 'arcade');
  run(w, ARCADE.skee.minS + 1);
  arcade.onScore(w, p, { id: c.id, score: 905, secs: 30 });
  assert.ok(!prof.tickets, 'no such score');
  arcade.play(w, p, false, null, 'skee'); c = lastOf(conn, 'arcade');
  run(w, ARCADE.skee.minS + 1);
  arcade.onScore(w, p, { id: c.id, score: 450, secs: 30 });
  assert.equal(prof.tickets, Math.floor(450 / ARCADE.skee.perTicket));
  assert.equal(prof.skeeBest, 450);
  const t0 = prof.tickets;
  arcade.play(w, p, false, null, 'hockey'); c = lastOf(conn, 'arcade');
  run(w, 2);
  arcade.onScore(w, p, { id: c.id, score: 7, win: 1, secs: 60 });
  assert.equal(prof.tickets, t0, 'a win in two seconds: no');
  arcade.play(w, p, false, null, 'hockey'); c = lastOf(conn, 'arcade');
  run(w, ARCADE.hockey.minS + 1);
  arcade.onScore(w, p, { id: c.id, score: 7, them: 4, win: 1, secs: 60 });
  assert.equal(prof.tickets, t0 + ARCADE.hockey.win, 'a win');
  assert.equal(prof.hockeyWins, 1);
  arcade.play(w, p, false, null, 'hockey'); c = lastOf(conn, 'arcade');
  run(w, 10);
  arcade.onScore(w, p, { id: c.id, score: 3, them: 7, win: 0, secs: 60 });
  assert.equal(prof.tickets, t0 + ARCADE.hockey.win + 3 * ARCADE.hockey.perGoal, 'a loss: the goals');
});

test('pinball: the plunger, the bumpers and the flippers keep it up, a drain; the tickets', async () => {
  const P = (await import('../client/pinball.js'))._test;
  // the plunger sends it up the lane and round into the playfield; flippers raised as it comes down keep it in play
  const T = P.newTable();
  T.ball = { x: 181, y: 210, vx: 0, vy: -650, lane: true };
  const hits = {};
  let t = 0, drained = null, left = false;
  for (; t < 60 && !drained; t += 1 / 240) {
    const b = T.ball;
    if (b && !b.lane) { left = true; T.up[0] = b.y > 175 && b.x < 123 && b.vy > 0; T.up[1] = b.y > 175 && b.x >= 123 && b.vy > 0; }
    if (P.physics(T, 1 / 240, (w) => { hits[w] = (hits[w] || 0) + 1; }) === 'drain') drained = t;
  }
  assert.ok(left, 'out of the shooter lane');
  assert.ok(hits.bumper && hits.flip, `the bumpers and the flippers (${JSON.stringify(hits)})`);
  assert.ok(T.score >= 100, `points (${T.score})`);
  // left alone, a ball falls between the flippers
  const T2 = P.newTable();
  T2.ball = { x: 123, y: 120, vx: 0, vy: 0 };
  let r = null;
  for (let k = 0; k < 240 * 5 && r !== 'drain'; k++) r = P.physics(T2, 1 / 240);
  assert.equal(r, 'drain');
  // a raised flipper hits a ball resting on it up the table
  const T3 = P.newTable(), [ex, ey] = P.flipperEnd(T3.flips[0]);
  T3.ball = { x: (T3.flips[0].px + ex) / 2, y: (T3.flips[0].py + ey) / 2 - 4, vx: 0, vy: 0 };
  T3.up[0] = true;
  for (let k = 0; k < 12; k++) P.physics(T3, 1 / 240);
  assert.ok(T3.ball && T3.ball.vy < -100, `flipped up (${T3.ball && T3.ball.vy.toFixed(0)})`);
  // the server
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 50 });
  arcade.play(w, p, false, null, 'pinball');
  let c = lastOf(conn, 'arcade');
  run(w, 30);
  arcade.onScore(w, p, { id: c.id, score: 8000, secs: 30 });
  assert.equal(prof.tickets, 8, 'a ticket a thousand');
  assert.equal(prof.pinballBest, 8000);
  arcade.play(w, p, false, null, 'pinball'); c = lastOf(conn, 'arcade');
  run(w, ARCADE.pinball.minS + 1);
  arcade.onScore(w, p, { id: c.id, score: 999990, secs: 11 });
  assert.ok(prof.tickets - 8 <= Math.floor((ARCADE.pinball.minS + 3) * ARCADE.pinball.maxRate / ARCADE.pinball.perTicket), 'no faster than a table scores');
});
