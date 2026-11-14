// NPCs playing a real game of pool, and every game at a table out in the world shown to the pages near it (the owner,
// 2026-11-13: "Balls should move on the table if possible"; a game watchable from outside the minigame):
// server/systems/poolnpc.js (the NPCs' game), pooltables.js (the tables, the broadcast), poolmatch.js steer (a
// player's game round the bar's table), client/poolview.js (the page playing each shot out the same).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K } from '../shared/constants.js';
import { mulberry32 } from '../shared/rng.js';
import { POOL_NPC } from '../shared/rules.js';
import { rack, playOut, unpackBalls, packBalls, standAt, waitAt, feltPt, T as TBL } from '../shared/pool.js';
import * as poolnpc from '../server/systems/poolnpc.js';
import * as tabs from '../server/systems/pooltables.js';
import * as pm from '../server/systems/poolmatch.js';
import { poolInteraction } from '../server/systems/arcade.js';
import { spotsOf, fill, ACT_DROP } from '../server/systems/activities.js';
import { PoolView } from '../client/poolview.js';

// ---- the NPCs' game on its own: a fake world, the two walking straight to their places -------------------------------
const TB = { key: 'tk', b: 0, x0: 1000, y0: 1000, x1: 1100, y1: 1052, cx: 1050, cy: 1026, f: [1005, 1005, 1095, 1047, 21] };
function game(seed, secs) {
  const ents = new Map(), page = { pid: 'pg', conn: { open: true }, evq: [] };
  const w = { time: 0, players: new Map([['pg', page]]), get: (id) => ents.get(id), place() {} };
  for (const [id, seat] of [[1, 0], [2, 1]]) ents.set(id, { id, x: 0, y: 0, npc: { act: { pool: seat, x: 0, y: 0 } } });
  const g = { k: 'pool', ids: [1, 2], table: TB }, rng = mulberry32(seed);
  tabs.stateOf(w, TB).subs.set('pg', page.conn);
  poolnpc.begin(w, g, rng);
  const log = [], strikes = [];
  for (let i = 0; i < secs * 20; i++) {
    w.time += 0.05;
    for (const e of ents.values()) { e.x = e.npc.act.x; e.y = e.npc.act.y; }
    const n = page.evq.length;
    poolnpc.step(w, g, rng);
    for (const ev of page.evq.slice(n)) { log.push(ev); if (ev.e === 'pshot') { const e = ents.get(ev.by); strikes.push({ ev, at: { x: e.x, y: e.y }, gt: e.npc.act.gt }); } }
    if (g.pg.frames >= 1 && secs > 600) break;
  }
  return { g, log, strikes, w };
}

test('the NPCs\' game: the break, shots taken from behind the cue ball, balls potted, the frame ends and is racked again', () => {
  const { g, log, strikes } = game(4242, 4000);
  assert.ok(strikes.length >= 10, `shots taken (${strikes.length})`);
  assert.equal(strikes[0].ev.b.length / 3, 16, 'the break: all fifteen and the cue ball');
  for (const s of strikes.slice(0, 30)) {
    const balls = unpackBalls(s.ev.b), aim = Math.atan2(s.ev.v[1], s.ev.v[0]), sp = standAt(TB.f, TB, balls[0], aim), c = feltPt(TB.f, balls[0].x, balls[0].y);
    assert.equal(s.gt, 'cue', 'bent over the cue at the strike');
    assert.ok(Math.hypot(s.at.x - sp.x, s.at.y - sp.y) < 1, 'stood where the shot is taken from');
    assert.ok((c.x - s.at.x) * Math.cos(sp.a) + (c.y - s.at.y) * Math.sin(sp.a) > 0, 'behind the cue ball, the line going away from him');
    const rimD = Math.hypot(Math.max(TB.x0 - s.at.x, 0, s.at.x - TB.x1), Math.max(TB.y0 - s.at.y, 0, s.at.y - TB.y1));
    assert.ok(rimD > 10 && rimD < 19, 'just off the rail (a person is 11 px round)');
  }
  const fewest = Math.min(...strikes.map((s) => s.ev.b.length / 3));
  assert.ok(fewest < 12, `balls potted (down to ${fewest} on the table)`);
  assert.ok(g.pg.frames >= 1, 'a frame finished');
  const racks = log.filter((ev) => ev.e === 'ptab' && ev.b.length / 3 === 16);
  assert.ok(racks.length >= 1, 'racked again after the frame: the pages are sent the rack');
  assert.ok(new Set(strikes.map((s) => s.ev.by)).size === 2, 'both of them shoot');
});

test('the NPCs\' game is deterministic with a seed, and a page plays each shot out exactly as the server did', () => {
  const a = game(77, 300), b = game(77, 300), c = game(78, 300);
  assert.deepEqual(a.log, b.log, 'the same seed: the same game');
  assert.notDeepEqual(a.log, c.log, 'another seed: another game');
  const S = { ents: new Map(), map: { buildings: [] } }, V = new PoolView(S);
  V.event({ e: 'ptab', k: 'tk', f: TB.f, bi: 0, b: packBalls(rack('eight')), r: 0 });
  for (const s of a.strikes.slice(0, 12)) {
    V.event(s.ev);
    V.tick(performance.now() / 1000 + 60);   // (the whole shot rolled out)
    const mine = V.tabs.get('tk').balls, srv = unpackBalls(s.ev.b);
    srv[0].vx = s.ev.v[0]; srv[0].vy = s.ev.v[1];
    playOut(srv);
    assert.deepEqual(mine.map((q) => [q.n, q.x, q.y, q.in]), srv.map((q) => [q.n, q.x, q.y, q.in]), 'the page\'s table at rest is the server\'s, bit for bit');
  }
});

// ---- in the world: the Rusty Spur ---------------------------------------------------------------------------------------
const w = makeWorld(), m = w.map;
const T = tabs.tablesOf(m).find((t) => t.spur), spot = spotsOf(m).list.find((s) => s.k === 'pool' && s.table.key === 'spur');
const clear = () => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); w.acts = new Map(); w.actRest = new Map(); w.poolMatches = new Map(); };
const evs = (conn, e) => conn.sent.map((q) => (typeof q === 'string' && q.startsWith('{"t":"ev"') ? JSON.parse(q) : q)).filter((q) => q && q.t === 'ev').flatMap((q) => q.l).filter((q) => q.e === e);   // (net.js sends the events as text)
const shots = () => (w.poolShots ? w.poolShots.n : 0);

test('the tables out in the world: the Rusty Spur\'s, its felt inside the rim, a pool spot at each; a modest rate in rules.js', () => {
  assert.ok(T, 'the Rusty Spur\'s table');
  for (const t of tabs.tablesOf(m)) {
    assert.ok(t.f[0] > t.x0 && t.f[2] < t.x1 && t.f[1] > t.y0 && t.f[3] < t.y1 && t.f[4] > 0, `${t.key}: the felt inside the rim, up on the rail`);
    assert.ok(spotsOf(m).list.some((s) => s.k === 'pool' && s.table === t), `${t.key}: NPCs can play at it`);
  }
  assert.ok(POOL_NPC.bar.day < 0.5 && POOL_NPC.bar.night < 0.5, 'a bar\'s table empty more often than not');
  assert.ok(POOL_NPC.spur.night >= POOL_NPC.bar.night && POOL_NPC.spur.day >= POOL_NPC.bar.day, 'the Spur the likeliest');
});

test('an NPC game is played only while someone is near; the pages near get the table and its shots, a page far away nothing', () => {
  clear();
  const { p, conn } = joinPlayer(w), far = joinPlayer(w);
  teleport(w, p.ped, T.cx, T.y1 + 40);
  teleport(w, far.p.ped, T.cx + 6000, T.cy);
  const g = fill(w, spot, { seen: true });
  assert.ok(g && g.pg, 'a real game at the table');
  const s0 = shots();
  run(w, 40);
  assert.ok(shots() > s0, `shots taken (${shots() - s0})`);
  assert.ok(evs(conn, 'ptab').some((e) => e.k === 'spur'), 'the page near is sent the table');
  const ps = evs(conn, 'pshot');
  assert.ok(ps.length >= 1 && ps.every((e) => Array.isArray(e.b) && e.v.length === 2), 'and each shot: the balls, the cue ball\'s velocity');
  assert.ok(JSON.stringify(ps[0]).length < 400, 'a shot is a few hundred bytes');
  assert.equal(evs(far.conn, 'ptab').length + evs(far.conn, 'pshot').length, 0, 'a page far away: nothing');
  teleport(w, p.ped, T.cx + 5000, T.cy);
  run(w, 3);
  assert.ok(![...w.acts.values()].some((q) => q.k === 'pool'), 'nobody near: the game packed up');
  const s1 = shots();
  run(w, 30);
  assert.equal(shots(), s1, 'no cost for an empty bar: no shots played');
});

test('a player wants the table: the NPCs stand back; a match moves the shooter behind the cue ball, the other back off the end; pages near see it', () => {
  clear();
  const A = joinPlayer(w, { cash: 500 }), B = joinPlayer(w, { cash: 500 }), C = joinPlayer(w);
  teleport(w, A.p.ped, T.cx - 20, T.y1 + 20); teleport(w, B.p.ped, T.cx + 20, T.y1 + 20); teleport(w, C.p.ped, T.x0 - 60, T.y1 + 50);
  const g = fill(w, spot, { seen: true });
  run(w, 1);
  const ia = poolInteraction(w, A.p);
  assert.match(ia.label, /regulars let you have it/, 'the regulars give the table up');
  ia.run();
  assert.ok(w.poolMatches.has('spur'));
  run(w, 15);
  assert.equal(g.pg.ph, 'yield', 'the NPC game stops');
  const shooters = g.ids.map((i) => w.get(i)).filter((e) => e && e.npc && e.npc.act && e.npc.act.pool >= 0);
  for (const e of shooters) assert.ok(e.pp === 'cueup' && !e.gt, 'stood back, cue up, watching');
  const s0 = shots();
  run(w, 10);
  assert.equal(shots(), s0, 'no NPC shots while the player has the table');
  poolInteraction(w, B.p).run();   // (sits in: eight-ball)
  const M = pm.matchOf(w, A.p);
  assert.equal(M.st, 'play');
  run(w, 4);
  const up = [A.p, B.p][M.turn], other = [A.p, B.p][M.turn ^ 1];
  const cb = M.balls[0], aim = 0.2;
  pm.onMsg(w, up, { t: 'pool', a: 'aim', aim });
  run(w, 3);
  const sp = standAt(T.f, T, cb, aim);
  assert.ok(Math.hypot(up.ped.x - sp.x, up.ped.y - sp.y) < 4, 'the shooter walked round to the cue ball, back along his aim');
  assert.equal(up.ped.gt, 'cue', 'bent over the cue');
  const wt = waitAt(T, up.ped);
  assert.ok(Math.hypot(other.ped.x - wt.x, other.ped.y - wt.y) < 4 && other.ped.pp === 'cueup', 'the other waits off the far end, cue up');
  const n0 = evs(C.conn, 'pshot').length;
  pm.onMsg(w, up, { t: 'pool', a: 'shot', aim, pow: 0.8 });
  run(w, 0.5);
  const got = evs(C.conn, 'pshot').slice(n0);
  assert.equal(got.length, 1, 'a page near (not in the minigame) gets the shot');
  assert.equal(got[0].by, up.ped.id, 'his stroke');
  assert.equal(got[0].b.length / 3, 16, 'the balls as they lay');
  assert.ok(A.conn.sent.some((q) => q.t === 'pool' && q.shot), 'the minigame still gets its shot as before');
  // done: the table back to the regulars
  pm.leave(w, A.p); pm.leave(w, B.p);
  assert.ok(!A.p.ped.gt && !A.p.ped.pp && !B.p.ped.gt && !B.p.ped.pp, 'up from the table: the pose put down');
  const s1 = shots();
  run(w, 30);
  assert.ok(shots() > s1, 'the regulars rack up and play on');
});

test('far from the table: nothing posed, no steering', () => {
  clear();
  const { p } = joinPlayer(w);
  teleport(w, p.ped, T.cx + 3000, T.cy);
  assert.equal(pm.steer(w, p, p.ped), null);
  assert.ok(ACT_DROP > 0 && TBL.x1 > TBL.x0);
});
