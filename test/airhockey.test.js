// Air hockey against someone (the owner, 11-07: "id prefer it is 2 player"): the table's physics shared by the server
// and the page (shared/airhockey.js), the server's games (server/systems/hockeymatch.js) - seats, watching, the
// machine, forfeits, the stuck puck faced off - and the page's prediction (client/hockeynet.js) over a network with
// 100-150 ms of latency and jitter: the puck it draws stays near the server's, and your own strikes are the server's too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeConn } from './helpers.js';
import { ARCADE } from '../shared/rules.js';
import * as Hk from '../shared/airhockey.js';
import * as hm from '../server/systems/hockeymatch.js';
import * as net from '../client/hockeynet.js';
import { simulate } from './hockeysim.js';

function fakeWorld() {
  const w = { time: 0, players: new Map(), said: [], notify(p, text) { w.said.push([p.name, text]); } };
  return w;
}
let n = 0;
function player(w, name, cash = 100, conn = fakeConn()) {
  const p = { pid: `h${n++}`, name, conn, profile: { cash, bank: 0, tickets: 0 }, ped: { x: 0, y: 0 }, near: true };
  w.players.set(p.pid, p);
  return p;
}
const opt = () => ({ fee: ARCADE.hockey.price, tickets: true, poi: null, at: (q) => q.near });
const last = (p, f = () => true) => p.conn.sent.filter((m) => m.t === 'hockey' && f(m)).at(-1);

test('the physics is one: the same samples played on the server and on the page come out the same, to the bit', () => {
  assert.equal(Hk.TO, ARCADE.hockey.to, 'first to the rule\'s number');
  // two mallets' paths (as their pages would send them) and a puck sent off
  const A = [], B = [];
  for (let k = 0; k <= 1200; k += 4) {
    A.push([k, Math.round((60 + 40 * Math.sin(k / 50)) * 10), Math.round((117 + 70 * Math.sin(k / 37)) * 10)]);
    B.push([k, Math.round((196 + 40 * Math.cos(k / 45)) * 10), Math.round((117 + 70 * Math.cos(k / 29)) * 10)]);
  }
  const play = (from) => { const Tb = Hk.newTable(); Tb.puck.vx = 380; Tb.puck.vy = 170; const evs = []; Hk.advance(Tb, from, 1200, A, B, true, (e, k) => e && evs.push(`${e}@${k}`)); return { Tb, evs }; };
  const a = play(0), b = play(0);
  assert.deepEqual(a.Tb, b.Tb); assert.deepEqual(a.evs, b.evs);
  assert.ok(a.evs.filter((e) => e.startsWith('hit')).length > 3, `the mallets met the puck: ${a.evs.slice(0, 8)}`);
  // the page plays on from the server's word (packed: tenths) - the same as the server, within the wire's rounding
  const srv = Hk.newTable(); srv.puck.vx = 380; srv.puck.vy = 170;
  Hk.advance(srv, 0, 300, A, B, true);
  const page = Hk.unpack(Hk.pack(srv, 300));
  Hk.advance(srv, 300, 420, A, B, true); Hk.advance(page, 300, 420, A, B, false);
  assert.ok(Math.hypot(srv.puck.x - page.puck.x, srv.puck.y - page.puck.y) < 1, `the page's prediction: ${page.puck.x.toFixed(2)},${page.puck.y.toFixed(2)} v ${srv.puck.x.toFixed(2)},${srv.puck.y.toFixed(2)}`);
  // a mallet along its samples, kept to its half and no faster than FOLLOW
  const m = { x: 60, y: 117, vx: 0, vy: 0 };
  Hk.moveTo(m, 400, 117, Hk.FOLLOW, Hk.STEP, 0);
  assert.ok(m.x <= Hk.MID - Hk.MAL_R && m.x - 60 <= Hk.FOLLOW * Hk.STEP + 1e-9);
  assert.deepEqual(Hk.pathAt([[10, 100, 200], [14, 140, 240]], 12, [0, 0]), [12, 22]);
  assert.deepEqual(Hk.pathAt([[10, 100, 200]], 30, [0, 0]), [10, 20], 'held at the last');
});

test('a table: one waits, a second takes the other end and pays; a third only watches; the machine is never interrupted', () => {
  const w = fakeWorld(), A = player(w, 'Ann'), B = player(w, 'Bob'), C = player(w, 'Cy'), D = player(w, 'Di');
  hm.setClock(() => w.time);
  const a = hm.interaction(w, A, 't1', opt());
  assert.match(a.label, /^Air hockey - \$/);
  a.run();
  assert.equal(A.profile.cash, 100 - ARCADE.hockey.price);
  assert.equal(A.conn.sent.find((m) => m.t === 'arcade').mp, 1, 'the screen opens on the choice');
  assert.equal(last(A).st, 'wait');
  const b = hm.interaction(w, B, 't1', opt());
  assert.match(b.label, /^Play air hockey with Ann/);
  b.run();
  assert.equal(B.profile.cash, 100 - ARCADE.hockey.price);
  assert.equal(last(A, (m) => m.st).st, 'play'); assert.equal(last(B, (m) => m.st).me, 1);
  const c = hm.interaction(w, C, 't1', opt());
  assert.match(c.label, /^Watch the air hockey - Ann v Bob/);
  c.run();
  assert.equal(last(C, (m) => m.st).me, -1);
  assert.equal(C.profile.cash, 100, 'watching is free');
  hm.onMsg(w, C, { t: 'hockey', m: [5, 600, 1170] });
  assert.equal(hm.matchOf(w, C).S[0].length + hm.matchOf(w, C).S[1].length, 0, 'a watcher has no mallet');
  assert.equal(hm.interaction(w, A, 't1', opt()), null, 'nothing else to do at the table while you play');
  // the machine: the page's own game (as it always was); someone walking up can only watch it
  const E = player(w, 'Ed');
  hm.interaction(w, D, 't2', opt()).run();
  hm.onMsg(w, D, { t: 'hockey', a: 'cpu' });
  const cr = D.conn.sent.filter((m) => m.t === 'arcade').at(-1);
  assert.ok(cr.game === 'hockey' && !cr.mp && cr.tbl === 1 && cr.id, 'the game against the machine: a credit of its own (tickets for the goals)');
  const e = hm.interaction(w, E, 't2', opt());
  assert.match(e.label, /^Watch Di play the machine/);
  e.run();
  assert.equal(E.profile.cash, 100);
  assert.equal(last(D, (m) => m.watch !== undefined && !m.st).watch, 1, 'the player told someone watches (their page shows them the game)');
  hm.onMsg(w, D, { t: 'hockey', v: [1280, 1170, 600, 1170, 2000, 1170, 2, 1] });
  const v = last(E, (m) => m.v && !m.st);
  assert.deepEqual(v.sc, [2, 1]); assert.equal(v.v.length, 6);
  hm.onMsg(w, E, { t: 'hockey', a: 'cpu' });
  assert.equal(hm.matchOf(w, D).st, 'cpu', 'a watcher can\'t take a seat in it');
  hm.onMsg(w, D, { t: 'hockey', a: 'leave' });
  assert.ok(last(E, (m) => m.close), 'the game done, its watcher\'s screen closes');
  assert.equal(hm._test.matches(w).has('t2'), false, 'the table free');
});

test('leaving a game against a player forfeits it: the other wins, the tickets, the record; they wait on', () => {
  const w = fakeWorld(), A = player(w, 'Ann'), B = player(w, 'Bob'), C = player(w, 'Cy');
  hm.setClock(() => w.time);
  hm.interaction(w, A, 't3', opt()).run(); hm.interaction(w, B, 't3', opt()).run(); hm.interaction(w, C, 't3', opt()).run();
  hm.onMsg(w, B, { t: 'hockey', a: 'leave' });
  assert.equal(A.profile.tickets, ARCADE.match.win, 'the win\'s tickets');
  assert.deepEqual(A.profile.hockeyRec, { w: 1, l: 0 }); assert.deepEqual(B.profile.hockeyRec, { w: 0, l: 1 });
  assert.ok(w.said.some(([who, t]) => who === 'Ann' && /you win/.test(t)));
  const M = hm.matchOf(w, A);
  assert.equal(M.st, 'wait', 'Ann waits on for someone else');
  assert.equal(B.hockey, null); assert.equal(C.hockey, null, 'the watcher\'s screen closed');
  assert.ok(last(C, (m) => m.close));
  // walking off: the same
  const D = player(w, 'Di');
  hm.interaction(w, D, 't3', opt()).run();
  D.near = false;
  w.time += 0.05; hm.update(w);
  assert.equal(A.profile.tickets, 2 * ARCADE.match.win);
  assert.ok(last(D, (m) => m.close), 'walked away: the screen shut');
  hm.onMsg(w, A, { t: 'hockey', a: 'leave' });
  assert.equal(hm._test.matches(w).has('t3'), false);
});

test('the stuck puck is faced off on the server too', () => {
  const w = fakeWorld(), A = player(w, 'Ann'), B = player(w, 'Bob');
  hm.setClock(() => w.time);
  hm.interaction(w, A, 't4', opt()).run(); hm.interaction(w, B, 't4', opt()).run();
  const M = hm.matchOf(w, A);
  M.Tb.wait = 0; M.Tb.puck.x = Hk.T.x0 + 8; M.Tb.puck.y = Hk.T.y0 + 8;   // (in the corner behind Ann's mallet, nobody moving)
  let faced = false;
  for (let i = 0; i < 20 * (Hk.STUCK_S + 1.5) && !faced; i++) { w.time += 0.05; hm.update(w); faced = M.Tb.puck.y === Hk.CY; }
  assert.ok(faced, 'back at the middle');
  assert.equal(last(A, (m) => m.st).line, 'Face-off');
  assert.ok(M.Tb.puck.x < Hk.MID, 'on the half it was on');
});

test('over 100-150 ms and jitter: the puck each page draws stays near the server\'s, your own strikes are the server\'s', () => {
  for (const seed of [7, 11]) {
    const R = simulate({ lat: [100, 150], jit: 30, secs: 40, seed });
    const say = R.errs.map((e, i) => `${['Ann', 'Bob', 'watcher'][i]}: median ${R.pct(e, 0.5).toFixed(1)} px, 90% ${R.pct(e, 0.9).toFixed(1)}, 95% ${R.pct(e, 0.95).toFixed(1)} (${e.length})`).join('; ');
    console.log(`  ${say}; error carried at most ${R.worst.ex.toFixed(1)} px; bytes/s ${R.bytes.map((b) => `${b.down.toFixed(0)} down ${b.up.toFixed(0)} up`).join(', ')}; score ${R.M.Tb.us}-${R.M.Tb.them}`);
    R.errs.slice(0, 2).forEach((e) => { assert.ok(e.length > 1000, 'compared'); assert.ok(R.pct(e, 0.5) < 2 && R.pct(e, 0.9) < 15 && R.pct(e, 0.95) < 45, say); });
    assert.ok(R.pct(R.errs[2], 0.9) < 3, `a watcher sees the server's own table, between its words: ${say}`);
    assert.ok(R.worst.ex <= net.SNAP, 'the error carried is bounded');
    // your strikes: each run of them at the puck (an encounter) is the server's too, at about the step your page played it
    for (const g of R.pages.slice(0, 2)) {
      const runs = [];
      for (const k of [...new Set(g.hits)].sort((a, b) => a - b)) { if (runs.length && k - runs.at(-1).at(-1) < 12) runs.at(-1).push(k); else runs.push([k]); }
      const ok = runs.filter((r) => r.some((k) => { for (let d = -8; d <= 8; d++) if (R.srvHits.has(`${k + d}:${g.N.seat}`)) return true; return false; }));
      console.log(`  ${['Ann', 'Bob'][g.i]}: ${ok.length} of ${runs.length} strikes played on the page were the server's`);
      assert.ok(runs.length > 10 && ok.length >= runs.length * 0.75, `${ok.length} / ${runs.length}`);
    }
    for (const b of R.bytes.slice(0, 2)) { assert.ok(b.down < 1600, `down ${b.down} B/s`); assert.ok(b.up < 1300, `up ${b.up} B/s`); }
  }
});

test('the reconciling: an error carried smoothly, gone in a few frames; a big one (a goal, a face-off) snapped', () => {
  const N = net.makeNet(0);
  assert.equal(net.correct(N, { x: 100, y: 100 }, { x: 90, y: 104 }), true);
  assert.deepEqual([N.ex, N.ey], [10, -4], 'what was drawn less the new word');
  net.decay(N, net.TAU);
  assert.ok(Math.abs(N.ex - 10 / Math.E) < 1e-9, 'e^-1 after TAU');
  for (let i = 0; i < 20; i++) net.decay(N, 1 / 60);
  assert.ok(Math.hypot(N.ex, N.ey) < 0.3, 'gone in a third of a second');
  net.correct(N, { x: 100, y: 100 }, { x: 20, y: 100 });
  assert.deepEqual([N.ex, N.ey], [0, 0], 'out by more than SNAP: straight there');
  net.correct(N, { x: 100, y: 100 }, { x: 95, y: 100 }, true);
  assert.deepEqual([N.ex, N.ey], [0, 0], 'the puck put back: straight there');
  // errors add up while they last, but never past SNAP
  net.correct(N, { x: 0, y: 0 }, { x: -30, y: 0 }); net.correct(N, { x: 0, y: 0 }, { x: -30, y: 0 });
  assert.deepEqual([N.ex, N.ey], [0, 0]);
  // the clock: the quickest ping wins; half its round trip the way back
  const C = net.makeNet(1);
  net.clockFrom(C, 1000, 500);
  assert.equal(net.present(C, 1000), 500, 'a first guess from the word itself');
  net.onPong(C, 1300, 1000, 540); net.onPong(C, 2120, 2000, 640);
  assert.equal(C.owd, 60);
  assert.equal(net.present(C, 3000), Math.floor(3000 * 0.12 + 640 + 60 * 0.12 - 2120 * 0.12));
  // a sample every SAMPLE-th step, never twice
  assert.equal(net.sample(C, 13, { x: 200, y: 100 }), null);
  assert.deepEqual(net.sample(C, 16, { x: 200.04, y: 100 }), [16, 2000, 1000]);
  assert.equal(net.sample(C, 16, { x: 1, y: 1 }), null);
});

test('a two-player game over the network plays to a result: first to seven, the tickets, the record', () => {
  const R = simulate({ lat: [100, 150], jit: 30, secs: 400, seed: 5, until: (M) => M.st === 'over' });
  const M = R.M;
  assert.equal(M.st, 'over', `played to the end (${M.Tb.us}-${M.Tb.them} after ${(R.T / 1000).toFixed(0)} s)`);
  assert.equal(Math.max(M.Tb.us, M.Tb.them), ARCADE.hockey.to);
  const [W, L] = M.win === 0 ? [R.P[0], R.P[1]] : [R.P[1], R.P[0]];
  assert.equal(W.profile.tickets, ARCADE.match.win, 'the winner\'s tickets');
  assert.deepEqual(W.profile.hockeyRec, { w: 1, l: 0 }); assert.deepEqual(L.profile.hockeyRec, { w: 0, l: 1 });
  assert.match(M.line, /wins 7-\d/);
  console.log(`  ${M.line} in ${(R.T / 1000).toFixed(0)} s`);
});
