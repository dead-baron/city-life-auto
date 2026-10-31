// The park regular's chess (server/systems/chess.js asks it for a move; the rules: shared/chess.js): a small
// alpha-beta search - CHESS.depth plies, then the captures played out to the end so it doesn't leave a piece hanging -
// over material and where the pieces stand (the usual piece-square tables), with a little whim (CHESS.noise
// centipawns) so he doesn't play the same game twice. A node cap keeps a move inside a tick's time on the server.
import { legal, make, unmake, inCheck, typeOf, colorOf, PAWN, KING } from '../../shared/chess.js';
import { CHESS } from '../../shared/rules-leisure.js';

const VAL = [0, 100, 320, 330, 500, 900, 0];
// the tables, from white's side (a8 first, as they read on the page): bonuses for a piece on that square
const T = {
  1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],   // (the king once the queens are off: to the middle)
};
// the table's entry for a piece on sq (white's tables read a8 first: flip the rank for white)
const pst = (ty, col, sq, end) => T[ty === KING && end ? 7 : ty][col ? sq : (7 - (sq >> 3)) * 8 + (sq & 7)];

// how good it is for the side to move (centipawns)
export function evaluate(s) {
  let score = 0, queens = 0, minor = 0;
  for (let i = 0; i < 64; i++) { const t = typeOf(s.b[i]); if (t === 5) queens++; else if (t === 2 || t === 3 || t === 4) minor++; }
  const end = queens === 0 || (queens <= 2 && minor <= 2);
  for (let i = 0; i < 64; i++) {
    const pc = s.b[i];
    if (!pc) continue;
    const ty = typeOf(pc), col = colorOf(pc), v = VAL[ty] + pst(ty, col, i, end);
    score += col ? -v : v;
  }
  return s.w ? -score : score;
}

const order = (ms) => ms.sort((a, b) => (b.x ? VAL[typeOf(b.x)] * 10 - 1 : 0) + (b.p ? 800 : 0) - ((a.x ? VAL[typeOf(a.x)] * 10 - 1 : 0) + (a.p ? 800 : 0)));
const MATE = 100000;
function quiet(s, a, b, ctx, d) {
  ctx.nodes++;
  const stand = evaluate(s);
  if (stand >= b) return stand;
  if (stand > a) a = stand;
  if (d <= 0 || ctx.nodes > ctx.max) return a;
  for (const m of order(legal(s, true))) {
    const u = make(s, m), v = -quiet(s, -b, -a, ctx, d - 1);
    unmake(s, m, u);
    if (v >= b) return v;
    if (v > a) a = v;
  }
  return a;
}
function search(s, depth, a, b, ctx, ply) {
  ctx.nodes++;
  if (ctx.nodes > ctx.max) return evaluate(s);
  const ms = legal(s);
  if (!ms.length) return inCheck(s) ? -MATE + ply : 0;
  if (s.h >= 100) return 0;
  if (depth <= 0) return quiet(s, a, b, ctx, 4);
  for (const m of order(ms)) {
    const u = make(s, m), v = -search(s, depth - 1, -b, -a, ctx, ply + 1);
    unmake(s, m, u);
    if (v >= b) return v;
    if (v > a) a = v;
  }
  return a;
}

// his thinking, a root move at a time (a generator: server/systems/chess.js steps it a few milliseconds a tick, so a
// slow machine never stalls the world for him): yields until it returns the move he plays in s (a copy is searched;
// s isn't changed) - rng for his whim; depth / noise / nodes to override
export function* think(s0, rng = Math.random, o = {}) {
  const s = { b: s0.b.slice(), w: s0.w, c: s0.c, ep: s0.ep, h: s0.h, n: s0.n, k: s0.k.slice() };
  const depth = o.depth ?? CHESS.depth, noise = o.noise ?? CHESS.noise, ctx = { nodes: 0, max: o.nodes ?? CHESS.nodes };
  const ms = order(legal(s));
  if (!ms.length) return null;
  let best = null, bv = -Infinity;
  for (const m of ms) {
    const u = make(s, m);
    let v = -search(s, depth - 1, -MATE - 1, MATE + 1, ctx, 1);
    unmake(s, m, u);
    if (Math.abs(v) < MATE - 100) v += (rng() - 0.5) * 2 * noise;   // (his whim - never over a mate)
    if (typeOf(s.b[m.f]) === PAWN && s.n < 4 && ((m.f & 7) === 3 || (m.f & 7) === 4)) v += 8;   // (the centre pawns first, as a man of the park does)
    if (v > bv) { bv = v; best = m; }
    yield ctx.nodes;
  }
  return best;
}
// the whole think at once (the tests)
export function bestMove(s, rng = Math.random, o = {}) {
  const it = think(s, rng, o);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
