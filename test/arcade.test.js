// The arcades (the owner, 10-08 / 10-16: "Arcade: walk in and play our own 8-bit games... tickets for prizes" - server
// arcade.js, client/arcade.js; 2026-10-24: a building you walk into): the floor behind an arcade's door, a cabinet a game,
// a credit, the score back from the page worth tickets (checked against the time it took), the prize counter you walk up
// to; the mansion's cabinet free, no tickets.
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

// (2026-10-24, the owner: "The Arcade should be a building that has an interior you walk into and you can go up to
// different arcades or games to play different things, and the prize counter should be somewhere inside that you walk up
// to and interact with") - the arcade's floor (server arcade.js, shared/homelayout.js 'arcade')
function arcadeDoor(w, p) {
  let poi = w.map.pois.find((q) => arcade.isArcade(w, q));
  if (!poi) {   // (the old city's arcade, or one made here)
    const b = w.map.buildings.find((q) => q && q.tw >= 2);
    b.key = 'arcade';
    poi = { id: w.map.pois.length, kind: 'delivery', label: 'Test Arcade', x: p.ped.x + 10, y: p.ped.y, r: 40, b: w.map.buildings.indexOf(b) };
    w.map.pois.push(poi);
  }
  return poi;
}
// walk to (x, y) on the floor (the server's own steps: homeinside.js input)
async function walkTo(w, p, x, y) {
  for (let k = 0; k < 200; k++) {
    const s = p.ped.home, dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
    if (d < 3) break;
    p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: dx / d, my: dy / d, aim: 0 }); w.step();
  }
  p.inputQ.push({ seq: p.ack + 1, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
}
test('the arcade: a building you walk into - a cabinet for every game along the back wall, the prize counter, out by the door', async () => {
  const players = await import('../server/systems/players.js');
  const { useAt, TILE_IN } = await import('../shared/homelayout.js');
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w, { cash: 50, bank: 0 });
  const poi = arcadeDoor(w, p);
  assert.ok(arcade.isArcade(w, poi));
  teleport(w, p.ped, poi.x, poi.y);
  // at the door: in you go (no credit at the door any more)
  const it = players.findInteraction(w, p);
  assert.match(it.label, /Into .* the arcade/);
  it.run();
  assert.ok(p.ped.hidden && p.ped.home && p.ped.home.arcade, 'on its floor');
  const msg = lastOf(conn, 'home');
  assert.equal(msg.plan, 'arcade', 'the page draws its floor');
  const L = arcade.hallLayout();
  // the plan: a cabinet a game, the prize counter, all within reach of the floor from the door
  const cabs = L.pieces.filter((q) => q.ch === 'j');
  assert.equal(cabs.length, arcade.GAMES.length, 'a cabinet for each game');
  assert.deepEqual([...arcade.GAMES].sort(), ['hockey', 'pinball', 'skee', 'starfall'], 'every arcade game there is');
  assert.ok(L.pieces.some((q) => q.use === 'prizes'), 'the prize counter');
  const seen = new Set(), q = [[Math.floor(L.spawn.x / TILE_IN), Math.floor(L.spawn.y / TILE_IN)]], reach = new Set();
  while (q.length) { const [x, y] = q.pop(); if (seen.has(x + ',' + y) || L.solid(x, y)) continue; seen.add(x + ',' + y); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  for (const c of seen) { const [x, y] = c.split(',').map(Number), px = (x + 0.5) * TILE_IN, py = (y + 0.5) * TILE_IN; const u = useAt(L, px, py, 26); if (u) reach.add(u.use); const cb = arcade.cabinetAt(L, px, py); if (cb) reach.add(cb.game); }
  for (const u of ['door', 'prizes', ...arcade.GAMES]) assert.ok(reach.has(u), `the ${u} within reach`);
  // up to each cabinet: its own game
  const games = [];
  for (const c of cabs) {
    await walkTo(w, p, c.x + c.w / 2, c.y + c.h + 14);
    const a = players.findInteraction(w, p);
    assert.match(a.label, /^Play /, `at the cabinet: ${a.label}`);
    games.push(arcade.cabinetAt(L, p.ped.home.x, p.ped.home.y).game);
  }
  assert.deepEqual(games, arcade.GAMES, 'a different game at each');
  // the first: STARFALL - a credit, the page told to play it, the score worth tickets (no more than the time allows)
  const c0 = cabs[0];
  await walkTo(w, p, c0.x + c0.w / 2, c0.y + c0.h + 14);
  const a0 = players.findInteraction(w, p);
  assert.match(a0.label, new RegExp(`STARFALL - \\$${ARCADE.price}`));
  a0.run();
  assert.equal(prof.cash, 50 - ARCADE.price, 'paid');
  const credit = lastOf(conn, 'arcade');
  assert.ok(credit && credit.game === 'starfall' && credit.id && !credit.free, 'the page told to play');
  arcade.onScore(w, p, { id: 'nope', score: 5000, secs: 100 });
  assert.ok(!prof.tickets, 'a wrong credit: nothing');
  run(w, 120);
  arcade.onScore(w, p, { id: credit.id, score: 3000, secs: 120 });
  assert.equal(prof.tickets, Math.min(ARCADE.maxTickets, 30), '30 tickets');
  assert.equal(prof.arcadeBest, 3000);
  arcade.onScore(w, p, { id: credit.id, score: 3000, secs: 120 });
  assert.equal(prof.tickets, 30, 'a credit counts once');
  a0.run();
  const c2 = lastOf(conn, 'arcade');
  run(w, 2);
  arcade.onScore(w, p, { id: c2.id, score: 99999, secs: 2 });
  assert.ok(prof.tickets - 30 <= Math.floor(4 * ARCADE.maxRate / ARCADE.perTicket), `no more than the time allows (${prof.tickets - 30})`);
  // the skee-ball cabinet: its own credit and its own game on the page
  const c1 = cabs[1], cash1 = prof.cash;
  await walkTo(w, p, c1.x + c1.w / 2, c1.y + c1.h + 14);
  players.findInteraction(w, p).run();
  assert.equal(lastOf(conn, 'arcade').game, 'skee'); assert.equal(prof.cash, cash1 - ARCADE.skee.price);
  // the prize counter: walked up to, Act, the prizes; redeemed
  prof.tickets = 60;
  const G = L.pieces.find((z) => z.use === 'prizes');
  await walkTo(w, p, G.x - 14, G.y + G.h / 2);
  const pc = players.findInteraction(w, p);
  assert.match(pc.label, /prize counter - 60 tickets/);
  pc.run();
  let m = lastOf(conn, 'menu');
  assert.match(m.title, /prize counter/); assert.match(m.sub, /60 tickets/);
  const i = ARCADE.prizes.findIndex((z) => z.item === 'energy');
  assert.ok(!m.opts.find((o) => o.id === `ar:prize:${i}`).dis);
  economy.handleMenu(w, p, poi.id, `ar:prize:${i}`);
  assert.equal(prof.tickets, 60 - ARCADE.prizes[i].t);
  assert.equal(prof.inventory.energy, 1, 'won: an energy drink');
  const sk = ARCADE.prizes.findIndex((z) => z.board);
  assert.ok(lastOf(conn, 'menu').opts.find((o) => o.id === `ar:prize:${sk}`).dis, 'not enough for the skateboard');
  // a skateboard of your own as a prize: yours, set down by the door outside
  prof.tickets = ARCADE.prizes[sk].t;
  economy.handleMenu(w, p, poi.id, `ar:prize:${sk}`);
  assert.ok(prof.board, 'a skateboard of your own');
  const out = [...w.entities.values()].find((v) => v.def && v.def.board && v.owner === p.pid);
  assert.ok(out && Math.hypot(out.x - poi.x, out.y - poi.y) < 160, 'by the door');
  // out by the door: back in the street at the arcade's door
  await walkTo(w, p, L.door.x, L.door.y - 20);
  const d = players.findInteraction(w, p);
  assert.match(d.label, /Out to the street/);
  d.run();
  run(w, 0.2);
  assert.ok(!p.ped.hidden && !p.ped.home, 'outside');
  assert.ok(Math.hypot(p.ped.x - poi.x, p.ped.y - poi.y) < 40, 'at its door');
  assert.equal(lastOf(conn, 'home').off, 1, 'the page back to the street');
  // the old way, a menu at the door: no credits or prizes there - it takes you in
  economy.openMenu(w, p, poi);
  m = lastOf(conn, 'menu');
  assert.ok(!m.opts.some((o) => /^ar:(play|skee|pinball|hockey|prize)/.test(o.id)), 'nothing to play at the door');
  assert.ok(m.opts.some((o) => o.id === 'ar:in'));
  economy.handleMenu(w, p, poi.id, 'ar:in');
  assert.ok(p.ped.home && p.ped.home.arcade, 'and in');
});

test('the arcade\'s floor: open to anyone - two players see each other; not with the police watching; every arcade\'s door leads onto one', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w, { cash: 50 }), { p: q, conn: cq } = joinPlayer(w, { cash: 50 });
  const poi = arcadeDoor(w, p);
  teleport(w, p.ped, poi.x, poi.y); teleport(w, q.ped, poi.x, poi.y);
  arcade.goIn(w, p, poi); arcade.goIn(w, q, poi);
  run(w, 0.1);
  const m = lastOf(cq, 'home');
  assert.ok(m.others.some((o) => o.n === p.name), 'the other player in there with you');
  assert.equal(arcade.hallOf(w, poi).id, p.ped.home.id, 'one floor for its door');
  // wanted, in the police's sight: no way in
  const { p: r } = joinPlayer(w);
  teleport(w, r.ped, poi.x, poi.y);
  r.wanted = 2; r.seenAt = w.time;
  assert.match(arcade.goIn(w, r, poi) || '', /police/);
  assert.ok(!r.ped.hidden);
  // every arcade's door (isArcade) is the way onto a floor of its own
  const all = w.map.pois.filter((z) => arcade.isArcade(w, z));
  for (const z of all) assert.equal(arcade.hallOf(w, z).plan, 'arcade');
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
  arcade.play(w, p, false, null, 'hockey'); c = lastOf(conn, 'arcade');
  run(w, ARCADE.hockey.minS + 1);
  arcade.onScore(w, p, { id: c.id, score: ARCADE.hockey.to, them: 3, win: 0, secs: 60 });
  assert.equal(prof.tickets, t0 + ARCADE.hockey.win + 3 * ARCADE.hockey.perGoal, `${ARCADE.hockey.to} goals is a win, not a loss: no such game`);
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

// (the owner, 10-23: "Tried playing pool and it said you can't do it indoors or something"): round the Rusty Spur's table
// from any side - its ends too - Act racks them up; the vehicle button there (it used to try the skateboard in the bag,
// "Not indoors" - the boards lie in the world now, 2026-10-24) says nothing of the sort
test('the Rusty Spur\'s pool table: from any side of it, Act racks them up; the vehicle button there says nothing about indoors', async () => {
  const players = await import('../server/systems/players.js');
  const { IN } = await import('../shared/input.js');
  const { poolTable } = await import('../server/systems/activities.js');
  const w = makeWorld();
  const T = w.map.roadhouse && poolTable(w.map);
  assert.ok(T, 'the table');
  const { p, conn, prof } = joinPlayer(w, { cash: 50 });
  for (const [x, y, where] of [[T.x1 + 18, T.cy, 'the east end'], [T.x0 - 18, T.cy, 'the west end'], [T.cx, T.y1 + 20, 'the long side']]) {
    teleport(w, p.ped, x, y);
    const it = players.findInteraction(w, p);
    assert.ok(it && /pool table/.test(it.label), `${where}: ${it && it.label}`);
  }
  teleport(w, p.ped, T.x1 + 90, T.cy);
  assert.ok(!/pool table/.test(players.findInteraction(w, p)?.label || ''), 'not from across the room');
  // the vehicle button
  teleport(w, p.ped, T.x1 + 18, T.cy);
  const said = [], n0 = w.notify.bind(w);
  w.notify = (q, t, tone) => { if (q === p) said.push(t); return n0(q, t, tone); };
  const n = conn.sent.filter((m) => m && m.t === 'arcade').length;
  let seq = 9000;
  p.inputQ.push({ seq: ++seq, bits: IN.VEHICLE, mx: 0, my: 0, aim: 0 }); w.step();
  p.inputQ.push({ seq: ++seq, bits: 0, mx: 0, my: 0, aim: 0 }); w.step();
  w.notify = n0;
  assert.ok(!said.some((t) => /indoors/i.test(t)), `no "not indoors" (${said.join(' | ')})`);
  assert.equal(conn.sent.filter((m) => m && m.t === 'arcade').length, n, 'nothing played by it');
  assert.ok(!p.ped.board, 'not on a board');
  players.findInteraction(w, p).run();
  assert.equal(conn.sent.filter((m) => m && m.t === 'arcade' && m.game === 'pool').length, n + 1, 'Act: a frame of pool');
  void prof;
});

// the cabinets' screens drawn at the size they're shown (the owner, 10-23: "Arcade games are really blurry ...
// especially the text"): client/arcscreen.js fitScreen
test('the arcade screen: as many pixels as it covers on the device, pixel art at whole multiples', async () => {
  const { fitScreen } = await import('../client/arcscreen.js');
  const cv = (w) => ({ width: 256, height: 224, getBoundingClientRect: () => ({ width: w }) });
  const g = () => ({ t: null, setTransform(...a) { this.t = a; }, imageSmoothingEnabled: false });
  globalThis.devicePixelRatio = 2;
  try {
    const c = cv(562), G = g();
    fitScreen(c, G, 256, 224);
    assert.equal(c.width, 1124); assert.equal(c.height, Math.round(224 * 1124 / 256));
    assert.ok(Math.abs(G.t[0] - 1124 / 256) < 1e-9 && G.imageSmoothingEnabled, 'scaled to it, smooth curves');
    const p = cv(562), Gp = g();
    fitScreen(p, Gp, 256, 224, true);
    assert.equal(p.width, 256 * 4); assert.equal(Gp.t[0], 4); assert.equal(Gp.imageSmoothingEnabled, false);
    const small = cv(120); fitScreen(small, g(), 256, 224, true);
    assert.equal(small.width, 256, 'never below its own size');
  } finally { delete globalThis.devicePixelRatio; }
});
