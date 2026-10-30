// The park and the camp (batch 8c, the owner's notes part 2): chess at the park's tables (shared/chess.js, the park
// regular - server/systems/chessai.js - and server/systems/chess.js), feeding the ducks grapes (ducks.js), fireworks
// (fireworks.js, shared/leisure.js fwShow) and a campfire of your own (campfires.js build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, DAY_PART_S } from '../shared/constants.js';
import { PED_BLOCK } from '../shared/mapcore.js';
import * as C from '../shared/chess.js';
import { bestMove, think } from '../server/systems/chessai.js';
import * as chess from '../server/systems/chess.js';
import * as ducks from '../server/systems/ducks.js';
import * as fireworks from '../server/systems/fireworks.js';
import * as campfires from '../server/systems/campfires.js';
import * as economy from '../server/systems/economy.js';
import * as burning from '../server/systems/burning.js';
import { spawnAnimal } from '../server/systems/wildlife.js';
import { fill, spotsOf } from '../server/systems/activities.js';
import { fwShow, campSeats, LEISURE_ITEMS } from '../shared/leisure.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { DUCKS, FIREWORKS, CAMPKIT } from '../shared/rules-leisure.js';
import { BURN } from '../shared/rules.js';
import { mulberry32 } from '../shared/rng.js';

const perft = (s, d) => { if (!d) return 1; let n = 0; for (const m of C.legal(s)) { const u = C.make(s, m); n += perft(s, d - 1); C.unmake(s, m, u); } return n; };
const mv = (s, a, b) => { const m = C.find(s, C.sqOf(a), C.sqOf(b)); assert.ok(m, `${a}-${b} legal`); C.make(s, m); return m; };

test('chess: the moves are the game\'s (perft from the start and two tricky positions)', () => {
  assert.equal(perft(C.start(), 3), 8902);
  assert.equal(perft(C.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'), 2), 2039);   // (castling, en passant, promotions, pins)
  assert.equal(perft(C.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'), 3), 2812);
});

test('chess: check, mate, stalemate, the draws, the notation', () => {
  const s = C.start();
  mv(s, 'f2', 'f3'); mv(s, 'e7', 'e5'); mv(s, 'g2', 'g4');
  const m = C.find(s, C.sqOf('d8'), C.sqOf('h4'));
  assert.equal(C.san(s, m), 'Qh4#');
  C.make(s, m);
  assert.equal(C.status(s), 'mate', "the fool's mate");
  assert.equal(C.status(C.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'stalemate');
  assert.equal(C.status(C.fromFEN('8/8/4k3/8/8/3NK3/8/8 w - - 0 1')), 'material', 'king and knight can\'t mate');
  assert.equal(C.status(C.fromFEN('8/8/4k3/8/8/3RK3/8/8 w - - 100 80')), 'fifty');
  assert.equal(C.find(C.start(), C.sqOf('e2'), C.sqOf('e5')), null, 'no illegal moves');
  const pin = C.fromFEN('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
  assert.equal(C.find(pin, C.sqOf('e2'), C.sqOf('d3')), null, 'a pinned piece stays put');
  const pr = C.fromFEN('8/4P1k1/8/8/8/8/8/4K3 w - - 0 1'), q = C.find(pr, C.sqOf('e7'), C.sqOf('e8'));
  assert.equal(q.p, C.QUEEN, 'a pawn on the last rank: a queen unless told');
  assert.equal(C.san(pr, C.find(pr, C.sqOf('e7'), C.sqOf('e8'), C.KNIGHT)), 'e8=N');
  // three times the same position: a draw
  const r = C.start(), seen = { [C.key(r)]: 1 };
  for (let i = 0; i < 2; i++) for (const [a, b] of [['g1', 'f3'], ['g8', 'f6'], ['f3', 'g1'], ['f6', 'g8']]) { mv(r, a, b); seen[C.key(r)] = (seen[C.key(r)] || 0) + 1; }
  assert.equal(C.status(r, seen), 'repetition');
  const w = C.fromWire({ b: C.boardStr(s), w: s.w, c: s.c, ep: s.ep });
  assert.deepEqual(w.b, s.b, 'the board over the wire and back');
});

test('the park regular: takes a mate, a free queen, and thinks a root move at a time', () => {
  const r = mulberry32(5);
  const p = C.fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4');
  assert.equal(C.san(p, bestMove(p, r)), 'Qxf7#');
  const free = C.fromFEN('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
  assert.equal(C.sqName(bestMove(free, r).t), 'd5', 'the hanging queen taken');
  const it = think(C.start(), r);
  let steps = 0, res;
  while (!(res = it.next()).done) steps++;
  assert.ok(steps === 20 && res.value, 'twenty root moves, one at a time');
  // a game against himself ends, every move legal
  const s = C.start(), seen = {};
  let st = 'play';
  for (let i = 0; i < 160 && (st === 'play' || st === 'check'); i++) { const m = bestMove(s, r); assert.ok(C.find(s, m.f, m.t, m.p)); C.make(s, m); seen[C.key(s)] = (seen[C.key(s)] || 0) + 1; st = C.status(s, seen); }
});

const w = makeWorld();
const tables = chess.tables(w.map);
const clearPeds = () => { for (const e of [...w.entities.values()]) if (e.kind === K.PED && !e.player) w.remove(e); w.acts = new Map(); w.chess = new Map(); };
// an open spot outside near (x, y): no building's floor, wall or water round it
const openSpot = (x, y) => {
  const m = w.map, ok = (px, py) => { const tx = Math.floor(px / 32), ty = Math.floor(py / 32); return m.inside(tx, ty) && m.bld[m.idx(tx, ty)] < 0 && !PED_BLOCK[m.tileAtPx(px, py)] && !m.isWater(px, py); };
  for (let r = 0; r < 3000; r += 24) for (let k = 0; k < 24; k++) { const px = x + Math.cos(k * 0.26) * r, py = y + Math.sin(k * 0.26) * r; if ([[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]].every(([dx, dy]) => ok(px + dx, py + dy))) return [px, py]; }
  return [x, y];
};
const last = (conn, t) => [...conn.sent].reverse().find((m) => m && m.t === t);

test('chess at the park: two players at a table, moves only when legal, mate decides it, the record kept', () => {
  clearPeds();
  assert.ok(tables.length >= 2, `chess tables in the park (${tables.length})`);
  const T = tables[0];
  const A = joinPlayer(w, { name: 'Ana' }), B = joinPlayer(w, { name: 'Ben' });
  teleport(w, A.p.ped, T.x - T.sd - 6, T.y + 8);
  const act = chess.interaction(w, A.p);
  assert.match(act.label, /Sit down at the chess table/);
  act.run();
  assert.ok(A.p.chess && A.p.ped.gt === 'sit' && A.p.ped.pp === 'chess', 'sat facing the board, the board in front');
  assert.equal(last(A.conn, 'arcade').game, 'chess', 'the board screen opens');
  assert.equal(last(A.conn, 'chess').st, 'wait');
  teleport(w, B.p.ped, T.x + T.sd + 8, T.y + 6);
  const join = chess.interaction(w, B.p);
  assert.match(join.label, /Play chess with Ana/);
  join.run();
  const G = w.chess.get(T.id);
  assert.equal(G.st, 'play');
  const white = G.white === 0 ? A : B, black = white === A ? B : A;
  assert.equal(last(white.conn, 'chess').me, 0); assert.equal(last(black.conn, 'chess').me, 1);
  chess.onMsg(w, black.p, { t: 'chess', a: 'move', f: C.sqOf('e7'), to: C.sqOf('e5') });
  assert.equal(G.sans.length, 0, 'not black\'s move');
  chess.onMsg(w, white.p, { t: 'chess', a: 'move', f: C.sqOf('e2'), to: C.sqOf('e5') });
  assert.equal(G.sans.length, 0, 'not a legal move');
  for (const [p, a, b] of [[white, 'f2', 'f3'], [black, 'e7', 'e5'], [white, 'g2', 'g4'], [black, 'd8', 'h4']]) chess.onMsg(w, p.p, { t: 'chess', a: 'move', f: C.sqOf(a), to: C.sqOf(b) });
  assert.equal(G.st, 'over');
  assert.match(G.res, /Checkmate/);
  assert.equal(last(black.conn, 'chess').win, 1, 'black won');
  assert.equal(black.p.profile.chess.w, 1); assert.equal(white.p.profile.chess.l, 1);
  // a rematch, colours swapped; then one walks off mid-game: resigned
  chess.onMsg(w, white.p, { t: 'chess', a: 'again' });
  assert.equal(G.st, 'play'); assert.ok(G.seats[G.white].pid === black.p.pid, 'colours swapped');
  chess.onMsg(w, white.p, { t: 'chess', a: 'leave' });
  assert.ok(!white.p.chess && !white.p.ped.gt, 'up from the table');
  assert.equal(black.p.profile.chess.w, 2, 'leaving a game resigns it');
  chess.onMsg(w, black.p, { t: 'chess', a: 'leave' });
  assert.ok(!w.chess.has(T.id), 'the table free again');
});

test('chess against the park regular: called over, he sits and plays; challenging the old men at a table', () => {
  clearPeds();
  w.npcBudget = 200;
  const T = tables[1];
  const A = joinPlayer(w, { name: 'Cleo' });
  teleport(w, A.p.ped, T.x - T.sd, T.y + 6);
  chess.interaction(w, A.p).run();
  chess.onMsg(w, A.p, { t: 'chess', a: 'npc' });
  const G = w.chess.get(T.id);
  const o = G.seats.find((q) => q && q.npc), npcPed = w.get(o.npc);
  assert.ok(npcPed && npcPed.npc, 'an old man on his way');
  assert.equal(G.seats[G.white].pid, A.p.pid, 'you have white');
  teleport(w, npcPed, T.x + T.sd, T.y);
  run(w, 0.2);
  assert.ok(o.sat, 'sat down');
  chess.onMsg(w, A.p, { t: 'chess', a: 'move', f: C.sqOf('e2'), to: C.sqOf('e4') });
  assert.equal(G.sans.length, 1);
  run(w, 6);
  assert.equal(G.sans.length, 2, 'he answered');
  assert.ok(C.status(G.s) === 'play' || C.status(G.s) === 'check');
  chess.onMsg(w, A.p, { t: 'chess', a: 'leave' });
  assert.ok(!w.chess.has(T.id) && !npcPed.npc.act, 'he gets up and goes on his way');
  // two of the city's people at a table: one gets up for you, the other plays you
  clearPeds();
  const s = spotsOf(w.map).list.find((q) => q.id === T.id);
  const grp = fill(w, s, { seen: true });
  assert.ok(grp);
  const ch = chess.interaction(w, A.p);
  assert.match(ch.label, /Challenge the chess players/);
  ch.run();
  const G2 = w.chess.get(T.id);
  assert.equal(G2.st, 'play');
  assert.ok(G2.seats[1].npc && w.get(G2.seats[1].npc).npc.act.k === 'chessp', 'the east one plays you');
  chess.onMsg(w, A.p, { t: 'chess', a: 'resign' });
  assert.match(G2.res, /resigned/);
  chess.onMsg(w, A.p, { t: 'chess', a: 'leave' });
  w.npcBudget = 0;
});

test('feeding the ducks: grapes bought at a corner store, the ducks come over, Samaritan points with a daily cap', () => {
  clearPeds();
  assert.ok(SHOPS.convenience.buy.some((o) => o.id === 'grapes') && SHOPS.gasstation.buy.some((o) => o.id === 'grapes'), 'grapes on the shelves');
  const A = joinPlayer(w, { name: 'Dot' });
  const x = A.p.ped.x, y = A.p.ped.y;
  for (let k = 0; k < 3; k++) spawnAnimal(w, 'duck', x + 60 + k * 6, y, 0, { tame: true });
  const flock = [...w.entities.values()].filter((e) => e.wild && e.wild.tame);
  for (const d of flock) { d.x = x + 60 + Math.random() * 10; d.y = y; w.place(d); }
  assert.equal(ducks.interaction(w, A.p), null, 'no grapes: no prompt');
  assert.match(A.p.toasts.map((t) => t.text).join(' '), /grapes would do/, 'a hint where to get some');
  A.p.profile.inventory.grapes = 12;
  const act = ducks.interaction(w, A.p);
  assert.match(act.label, /Feed the (ducks|geese)/);
  const s0 = A.p.profile.samaritan;
  act.run();
  assert.equal(A.p.profile.samaritan, s0 + DUCKS.sam);
  assert.equal(A.p.profile.inventory.grapes, 11);
  assert.ok(flock.some((d) => d.wild.state === 'tograpes'), 'over they come');
  assert.equal(ducks.feed(w, A.p), false, 'not straight away again');
  for (let i = 0; i < 8; i++) { A.p.duckFedAt = -99; ducks.feed(w, A.p); }
  assert.equal(A.p.profile.samaritan, s0 + DUCKS.dayCap, 'capped for the day');
  A.p.profile.duckDay = '2000-01-01'; A.p.duckFedAt = -99;
  ducks.feed(w, A.p);
  assert.equal(A.p.profile.samaritan, s0 + DUCKS.dayCap + DUCKS.sam, 'a new day');
  run(w, 3);
  assert.ok(flock.some((d) => d.wild.state === 'nibble' || Math.hypot(d.x - d.wild.wx, d.y - d.wild.wy) < 40), 'they swim over to the grapes');
});

test('fireworks: bought, lit from the bag, the same show for everyone, harmless, a small crime in town after dark', () => {
  clearPeds();
  assert.ok(ITEMS.fwrocket && ITEMS.fwcake && ITEMS.campkit && Object.keys(LEISURE_ITEMS).every((k) => ITEMS[k].desc));
  assert.ok(SHOPS.convenience.buy.some((o) => o.id === 'fwrocket'));
  assert.deepEqual(fwShow(2, 1234), fwShow(2, 1234), 'one seed, one show');
  assert.equal(fwShow(2, 99).shots.length, 12, 'the cake: twelve shots');
  assert.ok(fwShow(1, 5).fountain && !fwShow(0, 5).fountain);
  const A = joinPlayer(w, { name: 'Eve' }), B = joinPlayer(w, { name: 'Finn' });
  teleport(w, A.p.ped, ...openSpot(A.p.ped.x, A.p.ped.y));   // (out under the sky: never a building's floor)
  teleport(w, B.p.ped, A.p.ped.x + 30, A.p.ped.y);
  A.p.profile.inventory.fwrocket = 5;
  const hp = B.p.ped.hp;
  economy.useItem(w, A.p, 'fwrocket');
  assert.equal(A.p.profile.inventory.fwrocket, 4);
  assert.equal(w.fireworks.size, 1);
  economy.useItem(w, A.p, 'fwrocket');
  assert.equal(w.fireworks.size, 1, 'one at a time');
  run(w, FIREWORKS.fuseS + 5);
  assert.equal(B.p.ped.hp, hp, 'nobody hurt');
  assert.equal(w.fireworks.size, 0, 'the show over');
  // a player coming in mid-show sees what's left of it
  economy.useItem(w, A.p, 'fwrocket');
  const C2 = joinPlayer(w, { name: 'Gus' });
  run(w, 0.1);
  assert.ok((C2.p.evq || []).some((e) => e.e === 'fw') || w.fireworks.size === 1);
  // in town after dark: a small crime
  w.clockHold = true; w.loopTime = DAY_PART_S + 60; run(w, 0.1);
  A.p.fwAt = -99; w.fireworks.clear();
  const heat = A.p.heat || 0, cexp = A.p.profile.criminalExp;
  economy.useItem(w, A.p, 'fwrocket');
  assert.ok(A.p.profile.criminalExp > cexp || (A.p.heat || 0) > heat || A.p.toasts.some((t) => /fireworks in town after dark/.test(t.text)), 'fireworks in town after dark: an offence');
  w.clockHold = false;
});

test('a campfire of your own: built from the kit, walk-through, seats, it burns you after a few seconds in it, out when you go', () => {
  clearPeds();
  const A = joinPlayer(w, { name: 'Hal' });
  A.p.profile.inventory.campkit = 2;
  A.p.ped.a = 0;
  economy.useItem(w, A.p, 'campkit');
  let b = [...(w.builtFires || new Map()).values()][0];
  if (!b) {   // (the spawn point's ahead may be a road: a patch of grass)
    for (let k = 0; k < 400 && !b; k++) { teleport(w, A.p.ped, A.p.ped.x + 40, A.p.ped.y + (k % 2 ? 37 : -37)); economy.useItem(w, A.p, 'campkit'); b = [...(w.builtFires || new Map()).values()][0]; }
  }
  assert.ok(b, 'built');
  assert.equal(A.p.profile.inventory.campkit, 1);
  assert.equal(campSeats(b.x, b.y, b.a).length, CAMPKIT.seats);
  // sit on a seat by it, warm up
  const f = campfires.fireNear(w, b.x, b.y, 10);
  assert.ok(f && f.i < 0 && campfires.isLit(w, f.i));
  teleport(w, A.p.ped, b.x + 30, b.y + 10);
  const sit = campfires.interaction(w, A.p);
  assert.match(sit.label, /Sit by the fire/);
  sit.run();
  assert.ok(A.p.ped.sit && campSeats(b.x, b.y, b.a).some((q) => Math.hypot(q.x - A.p.ped.x, q.y - A.p.ped.y) < 1), 'on a log seat');
  campfires.standUp(w, A.p.ped);
  // stand in it: a few seconds, then you catch fire
  teleport(w, A.p.ped, b.x, b.y);
  run(w, BURN.campS * 0.6);
  assert.ok(!burning.burning(A.p.ped), 'not at once');
  run(w, BURN.campS);
  assert.ok(burning.burning(A.p.ped), 'standing in it you catch');
  burning.douse(w, A.p.ped);
  // a second kit puts the first out; walk off and it burns out
  teleport(w, A.p.ped, b.x - 80, b.y);
  economy.useItem(w, A.p, 'campkit');
  assert.ok(w.builtFires.size <= 1, 'one a player');
  const b2 = [...w.builtFires.values()][0] || b;
  teleport(w, A.p.ped, b2.x + CAMPKIT.awayPx + 300, b2.y);
  run(w, CAMPKIT.awayS + 2);
  assert.equal(w.builtFires.size, 0, 'burned out once you walked off');
});

test('the page: the board screen, the stage and the hooks', () => {
  const main = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.match(main, /import\('\.\/leisure\/stage\.js'\)/, 'loaded after the page');
  assert.match(main, /m\.game === 'chess' \? import\('\.\/leisure\/chess\.js'\)/, 'the board on the arcade overlay');
  assert.ok(!/^import .*leisure/m.test(main), 'never at once');
  const host = readFileSync(new URL('../client/art2/game/host.js', import.meta.url), 'utf8');
  assert.match(host, /S\.xlights/, 'their light thrown on the city');
});
