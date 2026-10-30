// Chess: the rules (the owner's notes part 2: "Chess at the park (chess tables you can play against NPCs or other
// players that come up to it)"). The server plays every game by these (server/systems/chess.js) - a move is only made
// if it's legal here - and the board screen (client/leisure/chess.js) uses them to show the moves a piece can make.
// The park regular's thinking is server/systems/chessai.js.
//   The board: 64 squares, a1 = 0, b1 = 1 ... h8 = 63 (file = sq & 7, rank = sq >> 3). A piece is its type (1 pawn,
//   2 knight, 3 bishop, 4 rook, 5 queen, 6 king) plus 8 for black; 0 an empty square.
//   A position: { b (the board), w (who's to move: 0 white, 1 black), c (castling still allowed: 1 white short, 2 white
//   long, 4 black short, 8 black long), ep (the square a pawn can take en passant on, or -1), h (moves since a capture
//   or a pawn move, for the fifty-move rule), n (the move number), k ([white king's square, black king's]) }
//   A move: { f (from), t (to), p (what a pawn promotes to, 2-5, else 0), x (the piece taken, 0 none), e (1: en
//   passant, 2: castling, 3: a pawn's double step) }
export const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const LETTER = ' PNBRQK';
const N_OFF = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const K_OFF = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [-1, 1], [1, -1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;
export const typeOf = (pc) => pc & 7;
export const colorOf = (pc) => pc >> 3;
export const sqName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 3) + 1);
export const sqOf = (name) => (name.charCodeAt(0) - 97) + (name.charCodeAt(1) - 49) * 8;

// the opening position
export function start() {
  const b = new Array(64).fill(0), back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
  for (let f = 0; f < 8; f++) { b[f] = back[f]; b[8 + f] = PAWN; b[48 + f] = PAWN + 8; b[56 + f] = back[f] + 8; }
  return { b, w: 0, c: 15, ep: -1, h: 0, n: 1, k: [4, 60] };
}
export function clone(s) { return { b: s.b.slice(), w: s.w, c: s.c, ep: s.ep, h: s.h, n: s.n, k: s.k.slice() }; }

// is sq attacked by side `by`?
export function attacked(s, sq, by) {
  const b = s.b, f = sq & 7, r = sq >> 3, add = by ? 8 : 0;
  const pr = by ? r + 1 : r - 1;   // (a white pawn attacks up the board: it sits a rank below what it attacks)
  for (const df of [-1, 1]) if (on(f + df, pr) && b[pr * 8 + f + df] === PAWN + add) return true;
  for (const [df, dr] of N_OFF) if (on(f + df, r + dr) && b[(r + dr) * 8 + f + df] === KNIGHT + add) return true;
  for (const [df, dr] of K_OFF) if (on(f + df, r + dr) && b[(r + dr) * 8 + f + df] === KING + add) return true;
  for (const [df, dr] of DIAG) for (let i = 1; ; i++) {
    const ff = f + df * i, rr = r + dr * i;
    if (!on(ff, rr)) break;
    const pc = b[rr * 8 + ff];
    if (pc) { if (pc === BISHOP + add || pc === QUEEN + add) return true; break; }
  }
  for (const [df, dr] of ORTH) for (let i = 1; ; i++) {
    const ff = f + df * i, rr = r + dr * i;
    if (!on(ff, rr)) break;
    const pc = b[rr * 8 + ff];
    if (pc) { if (pc === ROOK + add || pc === QUEEN + add) return true; break; }
  }
  return false;
}
export const inCheck = (s, side = s.w) => attacked(s, s.k[side], side ^ 1);

// every move the side to move could make, ignoring whether it leaves its own king in check (capturesOnly: just the
// captures and promotions - the engine's quiet search)
export function pseudo(s, capturesOnly = false) {
  const b = s.b, me = s.w, out = [];
  const push = (f, t, e = 0, p = 0) => out.push({ f, t, p, x: e === 1 ? PAWN + (me ? 0 : 8) : b[t], e });
  for (let sq = 0; sq < 64; sq++) {
    const pc = b[sq];
    if (!pc || colorOf(pc) !== me) continue;
    const ty = typeOf(pc), f = sq & 7, r = sq >> 3;
    if (ty === PAWN) {
      const dir = me ? -1 : 1, r1 = r + dir, last = me ? 0 : 7, home = me ? 6 : 1;
      if (on(f, r1) && !b[r1 * 8 + f]) {
        if (r1 === last) for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) push(sq, r1 * 8 + f, 0, p);
        else if (!capturesOnly) {
          push(sq, r1 * 8 + f);
          if (r === home && !b[(r + 2 * dir) * 8 + f]) push(sq, (r + 2 * dir) * 8 + f, 3);
        }
      }
      for (const df of [-1, 1]) {
        if (!on(f + df, r1)) continue;
        const t = r1 * 8 + f + df, q = b[t];
        if (q && colorOf(q) !== me) { if (r1 === last) for (const p of [QUEEN, ROOK, BISHOP, KNIGHT]) push(sq, t, 0, p); else push(sq, t); }
        else if (t === s.ep) push(sq, t, 1);
      }
      continue;
    }
    const steps = ty === KNIGHT ? N_OFF : ty === KING ? K_OFF : ty === BISHOP ? DIAG : ty === ROOK ? ORTH : null;
    const slide = ty === BISHOP || ty === ROOK || ty === QUEEN;
    for (const [df, dr] of steps || [...DIAG, ...ORTH]) for (let i = 1; ; i++) {
      const ff = f + df * i, rr = r + dr * i;
      if (!on(ff, rr)) break;
      const t = rr * 8 + ff, q = b[t];
      if (q && colorOf(q) === me) break;
      if (q || !capturesOnly) push(sq, t);
      if (q || !slide) break;
    }
    if (ty === KING && !capturesOnly) {   // castling: the squares between empty, the king not in check, nor crossing one
      const base = me ? 56 : 0, them = me ^ 1;
      if (sq === base + 4 && (s.c & (me ? 4 : 1)) && b[base + 7] === ROOK + (me ? 8 : 0) && !b[base + 5] && !b[base + 6]
        && !attacked(s, base + 4, them) && !attacked(s, base + 5, them) && !attacked(s, base + 6, them)) push(sq, base + 6, 2);
      if (sq === base + 4 && (s.c & (me ? 8 : 2)) && b[base] === ROOK + (me ? 8 : 0) && !b[base + 1] && !b[base + 2] && !b[base + 3]
        && !attacked(s, base + 4, them) && !attacked(s, base + 3, them) && !attacked(s, base + 2, them)) push(sq, base + 2, 2);
    }
  }
  return out;
}

// make a move on s (in place): what's needed to take it back (unmake)
const CASTLE_MASK = new Array(64).fill(15);
CASTLE_MASK[0] = 13; CASTLE_MASK[7] = 14; CASTLE_MASK[4] = 12; CASTLE_MASK[56] = 7; CASTLE_MASK[63] = 11; CASTLE_MASK[60] = 3;
export function make(s, m) {
  const b = s.b, pc = b[m.f], u = { c: s.c, ep: s.ep, h: s.h, k0: s.k[0], k1: s.k[1] };
  b[m.t] = m.p ? m.p + (s.w ? 8 : 0) : pc;
  b[m.f] = 0;
  if (m.e === 1) b[m.t + (s.w ? 8 : -8)] = 0;
  if (m.e === 2) { const base = s.w ? 56 : 0; if (m.t === base + 6) { b[base + 5] = b[base + 7]; b[base + 7] = 0; } else { b[base + 3] = b[base]; b[base] = 0; } }
  if (typeOf(pc) === KING) s.k[s.w] = m.t;
  s.c &= CASTLE_MASK[m.f] & CASTLE_MASK[m.t];
  s.ep = m.e === 3 ? (m.f + m.t) >> 1 : -1;
  s.h = typeOf(pc) === PAWN || m.x ? 0 : s.h + 1;
  if (s.w) s.n++;
  s.w ^= 1;
  return u;
}
export function unmake(s, m, u) {
  s.w ^= 1;
  if (s.w) s.n--;
  const b = s.b, me = s.w;
  b[m.f] = m.p ? PAWN + (me ? 8 : 0) : b[m.t];
  b[m.t] = m.e === 1 ? 0 : m.x;
  if (m.e === 1) b[m.t + (me ? 8 : -8)] = m.x;
  if (m.e === 2) { const base = me ? 56 : 0; if (m.t === base + 6) { b[base + 7] = b[base + 5]; b[base + 5] = 0; } else { b[base] = b[base + 3]; b[base + 3] = 0; } }
  s.c = u.c; s.ep = u.ep; s.h = u.h; s.k[0] = u.k0; s.k[1] = u.k1;
}

// the legal moves: the ones that don't leave your own king in check
export function legal(s, capturesOnly = false) {
  const out = [];
  for (const m of pseudo(s, capturesOnly)) { const u = make(s, m); if (!attacked(s, s.k[s.w ^ 1], s.w)) out.push(m); unmake(s, m, u); }
  return out;
}
// a move from (f, t, promotion) if it's legal, else null (a pawn reaching the last rank without saying: a queen)
export function find(s, f, t, p = 0) {
  const ms = legal(s).filter((m) => m.f === f && m.t === t);
  if (!ms.length) return null;
  return ms.find((m) => m.p === (p || QUEEN)) || ms.find((m) => !m.p) || null;
}

// the position as a key for repetition: the pieces, who's to move, the castling rights, the en passant square
export function key(s) {
  let out = '';
  for (let i = 0; i < 64; i++) out += '.PNBRQK..pnbrqk'[s.b[i]];
  return out + s.w + s.c + ',' + s.ep;
}
// enough left on the board to mate with? (K v K, K+minor v K, K+B v K+B with the bishops on the same colour)
export function insufficient(s) {
  const minors = [];
  for (let i = 0; i < 64; i++) {
    const t = typeOf(s.b[i]);
    if (!t || t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors.push([t, ((i & 7) + (i >> 3)) & 1, colorOf(s.b[i])]);
  }
  if (minors.length <= 1) return true;
  return minors.length === 2 && minors[0][0] === BISHOP && minors[1][0] === BISHOP && minors[0][2] !== minors[1][2] && minors[0][1] === minors[1][1];
}
// how it stands: 'play', 'check', 'mate', 'stalemate', 'fifty', 'material', 'repetition' (seen: { key: times })
export function status(s, seen = null) {
  const moves = legal(s), chk = inCheck(s);
  if (!moves.length) return chk ? 'mate' : 'stalemate';
  if (s.h >= 100) return 'fifty';
  if (insufficient(s)) return 'material';
  if (seen && (seen[key(s)] || 0) >= 3) return 'repetition';
  return chk ? 'check' : 'play';
}
export const DRAWN = new Set(['stalemate', 'fifty', 'material', 'repetition', 'agreed']);
export const STATUS_WORDS = { mate: 'Checkmate', stalemate: 'Stalemate', fifty: 'Draw by the fifty-move rule', material: 'Draw: not enough left to mate', repetition: 'Draw by repetition', agreed: 'Draw agreed', resign: 'Resigned' };

// the move in the usual notation (before it's made on s): Nf3, exd5, O-O, e8=Q, Qxf7#
export function san(s, m) {
  const pc = s.b[m.f], ty = typeOf(pc);
  let out;
  if (m.e === 2) out = (m.t & 7) === 6 ? 'O-O' : 'O-O-O';
  else {
    const cap = m.x ? 'x' : '';
    if (ty === PAWN) out = (cap ? 'abcdefgh'[m.f & 7] + 'x' : '') + sqName(m.t) + (m.p ? '=' + LETTER[m.p] : '');
    else {
      const rivals = legal(s).filter((q) => q.t === m.t && q.f !== m.f && s.b[q.f] === pc);
      let dis = '';
      if (rivals.length) {
        const sameFile = rivals.some((q) => (q.f & 7) === (m.f & 7)), sameRank = rivals.some((q) => (q.f >> 3) === (m.f >> 3));
        dis = !sameFile ? 'abcdefgh'[m.f & 7] : !sameRank ? String((m.f >> 3) + 1) : sqName(m.f);
      }
      out = LETTER[ty] + dis + cap + sqName(m.t);
    }
  }
  const u = make(s, m), st = status(s);
  unmake(s, m, u);
  return out + (st === 'mate' ? '#' : st === 'check' ? '+' : '');
}

// the board as 64 letters ('.' empty; white upper case) for the wire, and back
export function boardStr(s) { let o = ''; for (let i = 0; i < 64; i++) o += '.PNBRQK..pnbrqk'[s.b[i]]; return o; }
export function fromBoardStr(str) {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) { const ch = str[i], j = '.PNBRQK..pnbrqk'.indexOf(ch); b[i] = j > 0 ? j : 0; }
  return b;
}
// a position from the wire's fields (the board screen: the moves a piece has)
export function fromWire(g) {
  const b = fromBoardStr(g.b), k = [b.indexOf(KING), b.indexOf(KING + 8)];
  return { b, w: g.w, c: g.c, ep: g.ep, h: g.h || 0, n: g.n || 1, k };
}
// a position from FEN (the tests; the debug menu's puzzles)
export function fromFEN(fen) {
  const [pos, side, cas, ep, h, n] = fen.trim().split(/\s+/), b = new Array(64).fill(0);
  pos.split('/').forEach((row, i) => { let f = 0; for (const ch of row) { if (ch >= '1' && ch <= '8') f += +ch; else { const t = ' pnbrqk'.indexOf(ch.toLowerCase()); b[(7 - i) * 8 + f++] = t + (ch === ch.toLowerCase() ? 8 : 0); } } });
  let c = 0;
  for (const ch of cas || '') c |= { K: 1, Q: 2, k: 4, q: 8 }[ch] || 0;
  return { b, w: side === 'b' ? 1 : 0, c, ep: ep && ep !== '-' ? sqOf(ep) : -1, h: +h || 0, n: +n || 1, k: [b.indexOf(KING), b.indexOf(KING + 8)] };
}
