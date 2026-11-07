// The public chess tables (the owner, 11-06: "The chess table in the park ... should put a few tables in the world too"):
// six more out in the open - Westport Center's fountain court, the Sunset Boardwalk, Greenfield Park's fountain plaza -
// each a table the chess system plays at (server/systems/chess.js tables: a seat either side), none under a tree, a lamp
// or anything taller drawn over it; and at a table in use - against the regular - a second player can only watch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { TILE } from '../shared/constants.js';
import * as chess from '../server/systems/chess.js';

// what stands tall enough to be drawn over a table south of it (or round it, a tree's crown): [kind, half-width, reach
// south, reach north] in tiles
const TALL = [[/^(tree|palm|pine|oak|maple|birch|cypress|willow)/, 3, 5, 1.5], [/^(lamp|umbrella|textsign|parksign|statue|ymast|festoon|bleachers|foodcart|ferris|clock)/, 1.4, 3, 0.3]];
test('the new public chess tables: out in the open, nothing tall drawn over them, each one the chess system plays at', () => {
  const w = makeWorld(), m = w.map, T = chess.tables(m);
  const open = m.props.filter((p) => p.t === 'cafetable' && p.chess && p.open);
  assert.ok(open.length >= 5, `at least five new tables (${open.length})`);
  const where = new Set();
  for (const p of open) {
    const t = T.find((q) => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
    assert.ok(t, `the table at ${(p.x / TILE).toFixed(1)}, ${(p.y / TILE).toFixed(1)} is a chess table`);
    for (const q of m.props) {
      if (q === p) continue;
      for (const [re, hw, south, north] of TALL) {
        if (!re.test(q.t)) continue;
        const dx = Math.abs(q.x - p.x) / TILE, dy = (q.y - p.y) / TILE;
        assert.ok(!(dx < hw && dy > -north && dy < south), `${q.t} at ${(q.x / TILE).toFixed(1)}, ${(q.y / TILE).toFixed(1)} over the table at ${(p.x / TILE).toFixed(1)}, ${(p.y / TILE).toFixed(1)}`);
      }
    }
    const b = m.buildings.find((q) => q && !q.gone && p.x >= q.tx * TILE - 2 * TILE && p.x < (q.tx + q.tw + 2) * TILE && p.y >= q.ty * TILE && p.y < (q.ty + q.th + 3) * TILE);
    assert.ok(!b, `not against a building's face (${b && b.name})`);
    where.add(Math.round(p.x / 4096) + ',' + Math.round(p.y / 4096));
  }
  assert.ok(where.size >= 3, 'in three places round the world');
});

test('a chess table: sit down and play the computer - a second player walking up can only watch, and goes when they walk off', () => {
  const w = makeWorld({ npcBudget: 50 }), m = w.map, p0 = m.props.find((p) => p.t === 'cafetable' && p.chess && p.open);
  const T = chess.tables(m).find((q) => Math.abs(q.x - p0.x) < 1 && Math.abs(q.y - p0.y) < 1);
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
