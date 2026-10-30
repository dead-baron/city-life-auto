// Chess at the park (the owner's notes part 2: "Chess at the park (chess tables you can play against NPCs or other
// players that come up to it)"). The tables are the ones the old men play at (activities.js spotsOf: k 'chess' - a
// park's, a square's, a cafe's on a plaza): a seat either side of the board, west and east.
//   - Walk up to one and the action button sits you down. Two of the city's people already at it: challenge them - one
//     gets up for you and the other plays you. Nobody there: you sit and wait for someone to come and sit across from
//     you (another player's prompt: "Play chess with <you>"), or call the park's regular over to play you (an old man
//     who sits down across: server/systems/chessai.js thinks for him, a root move at a time, a few milliseconds a tick).
//   - Every move is the server's: the page sends from, to and a promotion, and only a legal move (shared/chess.js) is
//     made. Check, mate, stalemate, the fifty-move rule, a draw by repetition, not enough left to mate, resigning, a draw
//     offered and taken - all decided here, the result told to both and kept on your record (profile.chess).
//   - Sat at the table you hold the 'sit' pose facing the board (the west seat's player has the board in front of them:
//     the descriptor's pp 'chess', as the old men's games show it), so anyone passing sees the game going on.
//   - The board screen (client/leisure/chess.js, on the arcade's overlay: its keys are the game's) is what you play
//     on; closing it gets you up - a game against someone else in progress is resigned, against the regular it's left.
// On the wire: { t: 'arcade', game: 'chess', id } opens the screen; { t: 'chess', ... } (state) every change, to the
// players at the table; 'chessmv' (a piece set down: its click) near the table.
import { start, find, make, san, status, key, boardStr, inCheck, STATUS_WORDS, DRAWN } from '../../shared/chess.js';
import { CHESS } from '../../shared/rules-leisure.js';
import { mulberry32 } from '../../shared/rng.js';
import { think, evaluate } from './chessai.js';
import { spotsOf, leave as leaveAct } from './activities.js';
import { spawnNpc } from './npc.js';
import { store } from '../store.js';

let rng = mulberry32(64064);
export function setRng(r) { rng = r; }   // (tests)
const THINK_MS = 3;   // a tick's share of the regular's thinking

const TABLES = new WeakMap();
export function tables(map) {
  let L = TABLES.get(map);
  if (!L) { L = spotsOf(map).list.filter((s) => s.k === 'chess').map((s) => ({ id: s.id, x: s.x, y: s.y, sd: s.seat || 15 })); TABLES.set(map, L); }
  return L;
}
const games = (world) => (world.chess ||= new Map());
const seatPos = (T, i) => ({ x: T.x + (i ? T.sd : -T.sd), y: T.y, a: i ? Math.PI : 0 });
const occName = (world, o) => (!o ? '' : o.pid ? (world.players.get(o.pid) || {}).name || 'someone' : 'the park regular');
const playerOf = (world, o) => (o && o.pid ? world.players.get(o.pid) || null : null);
const npcOf = (world, o) => (o && o.npc ? world.get(o.npc) || null : null);
const say = (world, e, text) => world.emit(e.x, e.y, { e: 'say', id: e.id, x: Math.round(e.x), y: Math.round(e.y), text });

export function tableNear(world, x, y, r = CHESS.reach) {
  let best = null, bd = r;
  for (const T of tables(world.map)) {
    if (Math.abs(T.x - x) > r + T.sd || Math.abs(T.y - y) > r) continue;
    const d = Math.min(Math.hypot(T.x - x, T.y - y), Math.hypot(T.x - T.sd - x, T.y - y), Math.hypot(T.x + T.sd - x, T.y - y));
    if (d < bd) { bd = d; best = T; }
  }
  return best;
}

// ---- the prompt by a table (players.js findInteraction) -------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || ped.hidden || ped.interior || p.chess) return null;
  const T = tableNear(world, ped.x, ped.y);
  if (!T) return null;
  const G = games(world).get(T.id);
  if (G) {
    const free = G.seats.indexOf(null);
    if (free < 0) return null;
    const other = G.seats[free ^ 1];
    if (other && other.pid) return { label: `Play chess with ${occName(world, other)}`, run: () => sit(world, p, T, free) };
    return null;
  }
  const A = world.acts && world.acts.get(T.id);
  if (A && A.k === 'chess') {
    const sat = A.ids.map((i) => world.get(i)).filter((e) => e && !e.dead && e.npc && e.npc.act && e.npc.act.gt === 'sit');
    if (sat.length === 2) return { label: 'Challenge the chess players to a game', run: () => challenge(world, p, T, sat) };
    return null;
  }
  return { label: 'Sit down at the chess table', run: () => sit(world, p, T, 0) };
}

function newGame(T) { return { id: T.id, T, seats: [null, null], white: 0, s: start(), seen: {}, sans: [], last: null, st: 'wait', res: '', win: -1, offer: -1, at: 0, think: null, moveAt: 0, gameN: 0 }; }
function begin(world, G) {
  G.s = start(); G.seen = { [key(G.s)]: 1 }; G.sans = []; G.last = null; G.st = 'play'; G.res = ''; G.win = -1; G.offer = -1; G.at = world.time; G.think = null; G.gameN++;
  for (const o of G.seats) { const q = playerOf(world, o); if (q) world.notify(q, `A game of chess: you play ${colorWord(G, G.seats.indexOf(o))}. ${G.white === G.seats.indexOf(o) ? 'White moves first.' : `${occName(world, G.seats[G.white])} has white.`}`, 'info'); }
  push(world, G);
}
const colorWord = (G, seat) => (seat === G.white ? 'white' : 'black');
// whose seat moves now
const toMove = (G) => (G.s.w === 0 ? G.white : G.white ^ 1);

// sit p down in seat i at table T (a game made if there's none)
function sit(world, p, T, i) {
  const ped = p.ped, A = games(world);
  let G = A.get(T.id);
  if (!G) A.set(T.id, G = newGame(T));
  if (G.seats[i]) return false;
  const pos = seatPos(T, i);
  ped.x = pos.x; ped.y = pos.y; ped.vx = ped.vy = 0; ped.a = pos.a;
  world.place(ped);
  ped.gt = 'sit'; ped.pp = i === 0 ? 'chess' : null; ped.cv = null; ped.appVer = (ped.appVer || 0) + 1;
  G.seats[i] = { pid: p.pid };
  p.chess = { g: T.id, seat: i };
  p.meDirty = true;
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'chess', id: `chess${T.id}` });
  const other = G.seats[i ^ 1];
  if (other) { G.white = rng() < 0.5 ? 0 : 1; begin(world, G); }
  else { G.st = 'wait'; push(world, G); world.notify(p, 'You sit down at the board. Wait for someone to sit across from you - or call the park regular over.', 'info'); }
  return true;
}

// two of the city's people at the table: the one in the west seat gets up for you, the other plays you
function challenge(world, p, T, sat) {
  const west = sat.find((e) => e.x < T.x) || sat[0], east = sat.find((e) => e !== west);
  leaveAct(west);
  west.npc.state = 'wander'; west.npc.until = 0;
  hold(world, T, east, 1);
  if (!sit(world, p, T, 0)) return;
  const G = games(world).get(T.id);
  G.seats[1] = { npc: east.id, sat: true };
  G.white = 0;
  say(world, east, 'Sit, sit. White\'s yours.');
  begin(world, G);
}
// keep one of the city's people sat in seat i (activities.js steers them: n.act - k 'chessp' isn't rained off)
function hold(world, T, ped, i) {
  const pos = seatPos(T, i);
  ped.npc.act = { g: -1, k: 'chessp', x: pos.x, y: pos.y, a: pos.a, ride: null, gt: 'sit', pp: i === 0 ? 'chess' : null, fish: false, watch: null, chat: false, chop: false, patrol: null, leg: 1, hoop: -1, pool: -1, cv: null, route: null, pace: 0, kneel: false, ranger: false };
  ped.npc.state = 'idle'; ped.npc.until = world.time + 9999;
  ped.gt = 'sit'; ped.pp = i === 0 ? 'chess' : null; ped.cv = null; ped.appVer = (ped.appVer || 0) + 1;
}
// the park regular called over to an empty seat: an old man walks up from out of the way and sits down
function callRegular(world, p, G) {
  const i = G.seats.indexOf(null);
  if (i < 0 || G.st !== 'wait') return;
  const pos = seatPos(G.T, i), from = { x: pos.x + (i ? 70 : -70), y: pos.y + 60 };
  const ped = spawnNpc(world, 'senior', from.x, from.y, 'civ');
  if (!ped) return;
  hold(world, G.T, ped, i);
  G.seats[i] = { npc: ped.id, sat: false, at: world.time };
  G.white = i ^ 1;   // (you're white against him)
  world.notify(p, 'The park regular shuffles over and sits down across from you. "White\'s yours. Let\'s see what you\'ve got."', 'info');
  begin(world, G);
}

// ---- a move, a resignation, a draw ----------------------------------------------------------------------------------
function play(world, G, m) {
  const notation = san(G.s, m);
  make(G.s, m);
  G.sans.push(notation);
  if (G.sans.length > 400) G.sans.shift();
  G.last = [m.f, m.t];
  G.at = world.time; G.offer = -1;
  const k = key(G.s);
  G.seen[k] = (G.seen[k] || 0) + 1;
  world.emit(G.T.x, G.T.y, { e: 'chessmv', x: Math.round(G.T.x), y: Math.round(G.T.y), c: m.x ? 1 : 0 });
  const st = status(G.s, G.seen);
  if (st === 'mate') end(world, G, toMove(G) ^ 1, 'Checkmate');
  else if (DRAWN.has(st)) end(world, G, 2, STATUS_WORDS[st]);
  else push(world, G);
}
// the game over: win the seat that won (2 a draw), how
function end(world, G, win, how) {
  G.st = 'over'; G.win = win; G.think = null;
  G.res = win === 2 ? how : `${how} - ${occName(world, G.seats[win])} wins`;
  G.seats.forEach((o, i) => {
    const q = playerOf(world, o);
    if (!q) return;
    const rec = (q.profile.chess ||= { w: 0, l: 0, d: 0 });
    if (win === 2) rec.d++; else if (win === i) rec.w++; else rec.l++;
    world.notify(q, win === 2 ? `${how}. (Your record: ${rec.w}-${rec.l}-${rec.d})` : win === i ? `${how} - you win! (Your record: ${rec.w}-${rec.l}-${rec.d})` : `${how} - ${occName(world, G.seats[win])} wins. (Your record: ${rec.w}-${rec.l}-${rec.d})`, win === i ? 'good' : 'info');
    q.meDirty = true;
  });
  const n = npcOf(world, G.seats[0]) || npcOf(world, G.seats[1]);
  if (n) say(world, n, win === 2 ? 'A fair result.' : G.seats[win] && G.seats[win].npc ? 'Better luck next time, kid.' : 'Well played. Well played.');
  store.touch();
  push(world, G);
}

export function onMsg(world, p, msg) {
  const C = p.chess, G = C && games(world).get(C.g);
  if (!G || !p.ped) return;
  const me = C.seat, other = G.seats[me ^ 1];
  switch (msg.a) {
    case 'move': {
      if (G.st !== 'play' || toMove(G) !== me) return;
      const m = find(G.s, msg.f | 0, msg.to | 0, msg.p | 0);
      if (!m) { push(world, G); return; }   // (not a legal move: the board as it stands, again)
      play(world, G, m);
      return;
    }
    case 'resign': if (G.st === 'play') end(world, G, me ^ 1, `${p.name} resigned`); return;
    case 'draw': {
      if (G.st !== 'play') return;
      if (G.offer === (me ^ 1)) { end(world, G, 2, STATUS_WORDS.agreed); return; }
      if (other && other.npc) {   // (the regular takes a draw when he's worse off, or when there's little left to play for)
        const his = (toMove(G) === (me ^ 1) ? 1 : -1) * evaluate(G.s);
        const n = npcOf(world, other);
        if (his < -60 || G.sans.length > 80) { end(world, G, 2, STATUS_WORDS.agreed); return; }
        if (n) say(world, n, 'No, no. We play on.');
        world.notify(p, 'The park regular shakes his head: he plays on.', 'info');
        return;
      }
      G.offer = me;
      const q = playerOf(world, other);
      if (q) world.notify(q, `${p.name} offers a draw - Draw on the board to take it.`, 'info');
      push(world, G);
      return;
    }
    case 'npc': callRegular(world, p, G); return;
    case 'again': {   // (a rematch: colours swapped)
      if (G.st !== 'over' || !other) return;
      if (other.npc && !npcOf(world, other)) return;
      G.white ^= 1;
      begin(world, G);
      return;
    }
    case 'state': push(world, G); return;
    case 'leave': getUp(world, p, 'left'); return;
    default:
  }
}

// p gets up from the table (why: 'left' the screen closed, 'gone' dead / away / moved)
export function getUp(world, p, why = 'left') {
  const C = p.chess;
  if (!C) return;
  p.chess = null;
  const ped = p.ped;
  if (ped) { ped.gt = null; ped.pp = null; ped.cv = null; ped.appVer = (ped.appVer || 0) + 1; ped.y += 14; if (world.place) world.place(ped); }
  p.meDirty = true;
  if (p.conn && why !== 'left') p.conn.sendJSON({ t: 'chess', close: 1 });
  const G = games(world).get(C.g);
  if (!G) return;
  const other = G.seats[C.seat ^ 1];
  if (G.st === 'play' && other && other.pid) end(world, G, C.seat ^ 1, `${p.name} left the table`);
  G.seats[C.seat] = null;
  if (other && other.npc) { dismiss(world, G, other); G.seats[C.seat ^ 1] = null; }
  if (!G.seats.some(Boolean)) { games(world).delete(G.id); return; }
  G.st = 'wait'; G.think = null;
  const q = playerOf(world, G.seats[C.seat ^ 1]);
  if (q && why !== 'over') world.notify(q, `${p.name} got up from the table. Wait for someone else - or call the park regular over.`, 'info');
  push(world, G);
}
function dismiss(world, G, o) {
  const n = npcOf(world, o);
  if (!n || !n.npc) return;
  say(world, n, G.st === 'play' ? 'Leaving already? Hmph.' : 'Same time tomorrow.');
  leaveAct(n);
  n.npc.state = 'wander'; n.npc.until = 0;
}

// the state to the players at the table
function wire(world, G, seat) {
  const s = G.s;
  return {
    t: 'chess', id: `chess${G.id}`, b: boardStr(s), w: s.w, c: s.c, ep: s.ep, h: s.h, n: s.n, me: seat === G.white ? 0 : 1,
    names: [occName(world, G.seats[G.white]), occName(world, G.seats[G.white ^ 1])], last: G.last, st: G.st, chk: G.st === 'play' && inCheck(s) ? 1 : 0,
    res: G.res, win: G.win === -1 ? -1 : G.win === 2 ? 2 : (G.win === G.white ? 0 : 1), sans: G.sans.slice(-60), ply: G.sans.length,
    offer: G.offer === -1 ? -1 : G.offer === G.white ? 0 : 1, npc: G.seats.some((o) => o && o.npc) ? 1 : 0, think: G.think ? 1 : 0, come: G.seats.some((o) => o && o.npc && !o.sat) ? 1 : 0,
  };
}
function push(world, G) {
  G.seats.forEach((o, i) => { const q = playerOf(world, o); if (q && q.conn) q.conn.sendJSON(wire(world, G, i)); });
}

export function update(world) {
  const A = world.chess;
  if (!A || !A.size) return;
  const now = world.time;
  for (const G of [...A.values()]) {
    // the players still sat there: held in their seats, facing the board; dead, gone, in a car: up they get
    for (let i = 0; i < 2; i++) {
      const o = G.seats[i];
      if (!o) continue;
      if (o.pid) {
        const q = world.players.get(o.pid), ped = q && q.ped;
        if (!q || !q.conn || !ped || ped.dead || ped.vehId || ped.hidden || !q.chess || q.chess.g !== G.id) { if (q && q.chess && q.chess.g === G.id) getUp(world, q, 'gone'); else { G.seats[i] = null; if (G.st === 'play' && G.seats[i ^ 1] && G.seats[i ^ 1].pid) end(world, G, i ^ 1, 'The other player left'); } continue; }
        const pos = seatPos(G.T, i);
        if (Math.hypot(ped.x - pos.x, ped.y - pos.y) > 12) { getUp(world, q, 'gone'); continue; }
        ped.x = pos.x; ped.y = pos.y; ped.vx = ped.vy = 0; ped.a = pos.a;
      } else {
        const n = npcOf(world, o);
        const pos = seatPos(G.T, i);
        const d = n ? Math.hypot(n.x - pos.x, n.y - pos.y) : 999;
        if (n && !o.sat && d < 6) { o.sat = true; push(world, G); }
        if (!n || n.dead || n.removed || !n.npc || !n.npc.act || n.npc.act.k !== 'chessp' || d > (o.sat ? 40 : 240) || (!o.sat && now - o.at > 25)) {
          G.seats[i] = null;
          const q = playerOf(world, G.seats[i ^ 1]);
          if (G.st === 'play' && q) { G.st = 'over'; G.win = -1; G.res = 'Your opponent ran off - the game is off'; world.notify(q, 'The park regular has gone - the game is off.', 'warn'); }
          G.st = G.st === 'over' ? 'over' : 'wait';
          if (!G.seats.some(Boolean)) { A.delete(G.id); break; }
          push(world, G);
        }
      }
    }
    if (!A.has(G.id)) continue;
    if (!G.seats.some(Boolean)) { A.delete(G.id); continue; }
    if (G.st !== 'play') continue;
    if (now - G.at > CHESS.idleS) { G.st = 'over'; G.win = -1; G.res = 'Nobody moved for a long while - the game is off'; push(world, G); continue; }
    // the regular's move: thought out a few milliseconds a tick, played once he's sat a moment over it
    const o = G.seats[toMove(G)];
    if (!o || !o.npc || !o.sat) continue;
    if (!G.think) { G.think = think(G.s, rng); G.moveAt = now + CHESS.thinkS[0] + rng() * (CHESS.thinkS[1] - CHESS.thinkS[0]); G.mv = null; push(world, G); }
    if (!G.mv) {
      const t0 = performance.now();
      for (;;) { const r = G.think.next(); if (r.done) { G.mv = r.value || 'none'; break; } if (performance.now() - t0 > THINK_MS) break; }
    }
    if (G.mv && now >= G.moveAt) {
      const m = G.mv;
      G.think = null; G.mv = null;
      if (m === 'none') continue;
      play(world, G, m);
    }
  }
}

// a player leaving the game (players.js leave)
export function onLeave(world, p) { if (p.chess) getUp(world, p, 'gone'); }
export const seated = (p) => !!p.chess;
