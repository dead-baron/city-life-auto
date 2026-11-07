// A chess table in use (the owner, 11-06: other players "can come up and play against you (but not necessarily interrupt
// your current game if you're playing against PC)"): against the regular, a second player walking up can only watch.
// (World v3's six new public tables, out in the open: test/world3server.test.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import * as chess from '../server/systems/chess.js';

test('a chess table: sit down and play the computer - a second player walking up can only watch, and goes when they walk off', () => {
  const w = makeWorld({ npcBudget: 50 }), m = w.map, T = chess.tables(m)[0];
  const { p: A } = joinPlayer(w), { p: B } = joinPlayer(w);
  teleport(w, A.ped, T.x - T.sd, T.y + 4);
  const a = players.findInteraction(w, A);
  assert.match(a.label, /Sit down at the chess table/);
  a.run();
  assert.ok(A.chess && A.chess.seat === 0);
  chess.onMsg(w, A, { t: 'chess', a: 'npc' });
  const G = w.chess.get(T.id);
  assert.ok(G && G.seats[1] && G.seats[1].npc && G.st === 'play', 'the regular sits in');
  teleport(w, B.ped, T.x + T.sd + 20, T.y + 10);
  const b = chess.interaction(w, B);
  assert.ok(b && /^Watch the chess game/.test(b.label), `no seat to take: ${b && b.label}`);
  b.run();
  assert.equal(B.chess.seat, -1, 'watching');
  assert.equal(G.seats[1].npc !== undefined, true, 'the regular still plays');
  const seen = B.conn.sent.filter((q) => q.t === 'chess').at(-1);
  assert.ok(seen && seen.watch === 1, 'the watcher is sent the board');
  chess.onMsg(w, B, { t: 'chess', a: 'move', f: 12, to: 28 });
  assert.equal(G.sans.length, 0, 'a watcher can\'t move');
  teleport(w, B.ped, T.x + 900, T.y); w.step();
  assert.equal(B.chess, null, 'walked off: no longer watching');
  // getting up mid-game against the regular: the game's off, the table free again
  chess.onMsg(w, A, { t: 'chess', a: 'leave' });
  assert.equal(A.chess, null);
});
