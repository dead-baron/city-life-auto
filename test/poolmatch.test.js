// Pool against someone (shared/pool.js, server/systems/poolmatch.js; the owner, 11-06: "is it built to let other people
// join?... other players can come up and play against you (but not necessarily interrupt your current game if you're
// playing against PC)"): the eight-ball rules, sitting in, playing the computer, watching, whose shot it is, and
// leaving - a game against a player forfeited, one against the computer lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeConn } from './helpers.js';
import { ARCADE } from '../shared/rules.js';
import { rack, judge, playShot, cpuShot, groupOf, physics, STEP } from '../shared/pool.js';
import * as pm from '../server/systems/poolmatch.js';

function fakeWorld() {
  const w = { time: 0, players: new Map(), said: [], notify(p, text) { w.said.push([p.name, text]); } };
  return w;
}
let n = 0;
function player(w, name, cash = 100) {
  const p = { pid: `p${n++}`, name, conn: fakeConn(), profile: { cash, bank: 0, tickets: 0 }, ped: { x: 0, y: 0 }, near: true };
  w.players.set(p.pid, p);
  return p;
}
const opt = (tickets = true) => ({ fee: ARCADE.pool, tickets, cpu: 'the CPU', at: (q) => q.near });
const last = (p) => p.conn.sent.filter((m) => m.t === 'pool').at(-1);
const tick = (w, s) => { for (let i = 0; i < s * 20; i++) { w.time += 0.05; pm.update(w); } };

test('eight-ball: the break, the groups set by the first ball down, a foul gives the turn away, the 8 early loses, last wins', () => {
  const b = rack('eight');
  assert.equal(b.length, 16, 'fifteen and the cue ball');
  assert.equal(groupOf(3), 's'); assert.equal(groupOf(12), 't'); assert.equal(groupOf(8), null);
  const st = { groups: [null, null], breakShot: false };
  // open table: a solid down first - seat 1 has solids, shoots again
  let J = judge(st, b, 1, { potted: [3], first: 3 });
  assert.deepEqual(J.assign, ['t', 's']); assert.ok(J.keep && !J.foul);
  // a scratch: a foul, the turn goes
  J = judge({ groups: ['s', 't'] }, b, 0, { potted: [0], first: 2 });
  assert.ok(J.foul && !J.keep && J.win === -1);
  // the wrong group first: a foul
  J = judge({ groups: ['s', 't'] }, b, 0, { potted: [], first: 12 });
  assert.ok(J.foul && /wrong ball/.test(J.why));
  // the 8 down with your balls still up: the other player wins
  J = judge({ groups: ['s', 't'] }, b, 0, { potted: [8], first: 1 });
  assert.equal(J.win, 1, 'the 8 early loses');
  // the 8 down once your group is gone, fairly: you win
  for (const q of b) if (groupOf(q.n) === 's') q.in = true;
  J = judge({ groups: ['s', 't'] }, b, 0, { potted: [8], first: 8 });
  assert.equal(J.win, 0, 'the 8 last wins');
  // a shot played out on the table: the cue ball off, the first ball it meets, it stops
  const t = rack('eight'), r = playShot(t, 0, 0.9);
  assert.ok(r.first >= 1 && r.secs > 0.5 && t.every((q) => q.vx === 0 && q.vy === 0), `the break: hit ${r.first} first, ${r.secs.toFixed(1)} s`);
  // the computer aims at one of its own and the pocket
  let seed = 3; const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = cpuShot(rack('eight'), 't', rng);
  assert.ok(Number.isFinite(s.aim) && s.power > 0.2 && s.power < 1);
  assert.equal(typeof physics(rack('nine'), STEP, () => {}), 'boolean');
});

test('a table: one waits, a second sits in and pays; a third can only watch; shots only on your turn; leaving forfeits', () => {
  const w = fakeWorld(), A = player(w, 'Ann'), B = player(w, 'Bob'), C = player(w, 'Cy');
  const a1 = pm.interaction(w, A, 'k1', opt());
  assert.match(a1.label, /^Play pool - \$/);
  a1.run();
  assert.equal(A.profile.cash, 100 - ARCADE.pool, 'the table paid for');
  assert.equal(A.conn.sent.find((m) => m.t === 'arcade').mp, 1, 'the screen opens on the choice');
  assert.equal(last(A).st, 'wait');
  assert.equal(pm.interaction(w, A, 'k1', opt()), null, 'sat already');
  const b1 = pm.interaction(w, B, 'k1', opt());
  assert.match(b1.label, /Play pool with Ann/, 'offered the empty seat');
  b1.run();
  assert.equal(B.profile.cash, 100 - ARCADE.pool);
  assert.equal(last(A).st, 'play'); assert.equal(last(B).me, 1);
  const c1 = pm.interaction(w, C, 'k1', opt());
  assert.match(c1.label, /Watch the pool game - Ann v Bob/, 'a game going on: only to watch');
  c1.run();
  assert.equal(C.profile.cash, 100, 'watching is free');
  assert.equal(last(C).me, -1);
  // only the one whose turn it is can shoot, and not while the last shot is still rolling
  w.time += 1;
  const M = pm.matchOf(w, A), up = M.turn === 0 ? A : B, other = up === A ? B : A;
  pm.onMsg(w, other, { t: 'pool', a: 'shot', aim: 0, pow: 1 });
  assert.equal(M.shots, 0, 'not your turn');
  pm.onMsg(w, C, { t: 'pool', a: 'shot', aim: 0, pow: 1 });
  assert.equal(M.shots, 0, 'a watcher can\'t shoot');
  pm.onMsg(w, up, { t: 'pool', a: 'shot', aim: 0, pow: 1 });
  assert.equal(M.shots, 1, 'the break');
  const sent = last(C);
  assert.ok(sent.shot && sent.shot.from.length === 16, 'everyone at the table sent the shot to animate');
  pm.onMsg(w, M.turn === 0 ? A : B, { t: 'pool', a: 'shot', aim: 0, pow: 1 });
  assert.equal(M.shots, 1, 'not till the balls have stopped');
  // Bob closes the screen mid-game: Ann wins by forfeit - tickets at an arcade's table, on both records
  pm.onMsg(w, B, { t: 'pool', a: 'leave' });
  assert.equal(B.pool, null);
  assert.equal(A.profile.poolRec.w, 1); assert.equal(B.profile.poolRec.l, 1);
  assert.equal(A.profile.tickets, ARCADE.match.win, 'a win against a player');
  assert.ok(w.said.some(([nm, t]) => nm === 'Ann' && /Bob left the table/.test(t)));
  assert.equal(C.pool, null, 'the watcher sent away');
  assert.ok(C.conn.sent.some((m) => m.t === 'pool' && m.close));
  assert.equal(pm.matchOf(w, A).st, 'wait', 'Ann waits on for someone else');
});

test('against the computer: nobody can take the seat, they can watch; the computer shoots; leaving loses; walking off gets you up', () => {
  const w = fakeWorld(), A = player(w, 'Ann'), B = player(w, 'Bob');
  pm.interaction(w, A, 'k2', opt()).run();
  pm.onMsg(w, A, { t: 'pool', a: 'cpu' });
  const M = pm.matchOf(w, A);
  assert.equal(M.st, 'play'); assert.ok(M.seats[1].cpu, 'the computer sat in');
  const b1 = pm.interaction(w, B, 'k2', opt());
  assert.match(b1.label, /^Watch/, 'no seat to take - never interrupting a game against the computer');
  b1.run();
  assert.equal(M.seats[1].cpu, 1, 'still the computer');
  // Ann breaks; the computer takes its shot when its turn comes (thought out on the server)
  w.time += 1;
  pm.onMsg(w, A, { t: 'pool', a: 'shot', aim: 0.01, pow: 0.9 });
  assert.equal(M.shots, 1);
  M.turn = 1; M.busy = w.time; M.st = 'play';
  tick(w, 6);
  assert.ok(M.shots >= 2, 'the computer shot');
  assert.ok(last(B).shot && last(B).shot.by === 1, 'the watcher sees it');
  // walking away from the table: up you get, and against the computer it's a loss
  M.st = 'play';
  const l0 = (A.profile.poolRec && A.profile.poolRec.l) || 0;
  A.near = false; tick(w, 0.2);
  assert.equal(A.pool, null, 'got up');
  assert.equal(A.profile.poolRec.l, l0 + 1, 'a loss');
  assert.ok(A.conn.sent.some((m) => m.t === 'pool' && m.close), 'the screen shut');
  assert.ok(!w.poolMatches.has('k2'), 'the table free again');
  assert.equal(B.pool, null, 'the watcher too');
  // a frame alone: the old game, from the same choice
  const C = player(w, 'Cy');
  pm.interaction(w, C, 'k3', { ...opt(), free: true }).run();
  assert.equal(last(C).st, 'wait');
  pm.onMsg(w, C, { t: 'pool', a: 'solo' });
  const solo = C.conn.sent.filter((m) => m.t === 'arcade').at(-1);
  assert.ok(solo.game === 'pool' && !solo.mp && C.arcade, 'a frame alone: the nine-ball game');
  assert.ok(!w.poolMatches.has('k3') && !C.pool);
});
