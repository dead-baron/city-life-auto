// Air hockey against someone (the owner, 11-07: "id prefer it is 2 player"). At an arcade's air hockey table (arcade.js
// hallInteraction, its '4' pieces) the action button pays the table and opens the screen (client/airhockey.js) on a
// choice, as pool's does (poolmatch.js): wait for a player, or play the machine.
//   - Waiting, anyone walking up is offered "Play air hockey with <you>": they pay and take the other end, first to
//     ARCADE.hockey.to. A game against the machine (played on the page as it always was - client/airhockey.js, its
//     goals to arcade.js onScore) or two players at it: someone walking up can only watch.
//   - The puck is the server's. Each page sends where its mallet is, stamped with the step it was there (its clock kept
//     to the table's: 'ping' / pong), 30 times a second: { t: 'hockey', m: [k, x, y] } (tenths of a px). The table is
//     played here (shared/airhockey.js advance, 120 steps a second) up to the last step both players' mallets are known
//     for - so a strike comes out here as the page that made it played it - but never more than LAG_S behind the clock
//     (a page gone quiet is held where it last was). Every tick (20 a second) both pages and the watchers are sent the
//     table at that step: { t: 'hockey', s: pack(...) } (shared/airhockey.js), about 70 bytes; the page predicts on from
//     it (client/hockeynet.js). The stuck-puck failsafe runs here too.
//   - The screen closed (Esc, the X), the table walked away from, gone: a game against a player is forfeited (the other
//     wins); a watcher just goes. A win pays tickets (ARCADE.match.win), and goes on your record (profile.hockeyRec).
//   - A game against the machine: its page sends the table to show the watchers ({ t: 'hockey', v: [...] }, ten a second,
//     only while someone watches - told { t: 'hockey', watch: n }).
// On the wire: { t: 'arcade', game: 'hockey', id, mp: 1 } opens the screen; { t: 'hockey', st, ... } the table's players
// and score; { t: 'hockey', close: 1 } shuts it. The page sends { t: 'hockey', a: 'cpu' | 'again' | 'leave' | 'state' |
// 'ping' } and its mallet (m).
import { ARCADE } from '../../shared/rules.js';
import { newTable, advance, pack, clampMallet, HZ, TO } from '../../shared/airhockey.js';
import { payFrom as pay } from './economy.js';
import { store } from '../store.js';
import * as arcade from './arcade.js';

let clock = () => performance.now() / 1000;
export function setClock(f) { clock = f; }   // (tests: the network simulated)
export const LAG_S = 0.35, AHEAD_S = 0.25, START_S = 1.5;
const LAG_K = Math.round(LAG_S * HZ), AHEAD_K = Math.round(AHEAD_S * HZ), KEEP = 96;
const matches = (world) => (world.hockeyMatches ||= new Map());
const human = (o) => !!o && !!o.pid;
const playerOf = (world, o) => (human(o) ? world.players.get(o.pid) || null : null);
const nameOf = (o) => (!o ? 'nobody' : o.name);
export const matchOf = (world, p) => (p && p.hockey ? matches(world).get(p.hockey.key) || null : null);
const nowK = (M) => (clock() - M.t0) * HZ;

// the action button at a table (key: which table; o: { fee, tickets, poi (the arcade's place), at(q) (q still there) })
export function interaction(world, p, key, o) {
  if (p.hockey || p.pool) return null;
  const M = matches(world).get(key);
  if (!M) return { label: `Air hockey - $${o.fee}: play someone, or the machine`, run: () => sitDown(world, p, key, o) };
  if (M.st === 'wait' && !M.seats[1]) return { label: `Play air hockey with ${nameOf(M.seats[0])} - $${o.fee}`, run: () => join(world, p, M) };
  return { label: M.st === 'cpu' ? `Watch ${nameOf(M.seats[0])} play the machine` : `Watch the air hockey - ${nameOf(M.seats[0])} v ${nameOf(M.seats[1])}`, run: () => watch(world, p, M) };
}
function open(world, p, M, seat) {
  p.hockey = { key: M.key, seat };
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'hockey', id: `hockey:${M.key}`, mp: 1, best: p.profile.hockeyWins || 0 });
  push(world, M);
}
function sitDown(world, p, key, o) {
  if (!pay(p, o.fee)) { world.notify(p, 'Not enough money.', 'warn'); return; }
  const M = { key, o, seats: [{ pid: p.pid, name: p.name }, null], watch: new Set(), st: 'wait', Tb: newTable(), k: 0, t0: clock(), S: [[], []], line: 'Waiting for a player', win: -1, at: world.time, sent: null, sentAt: 0, v: null };
  matches(world).set(key, M);
  open(world, p, M, 0);
}
function join(world, p, M) {
  if (M.st !== 'wait' || M.seats[1]) return;
  if (!pay(p, M.o.fee)) { world.notify(p, 'Not enough money.', 'warn'); return; }
  M.seats[1] = { pid: p.pid, name: p.name };
  const q = playerOf(world, M.seats[0]);
  if (q) world.notify(q, `${p.name} takes the other end of the air hockey table.`, 'info');
  p.hockey = { key: M.key, seat: 1 };
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'hockey', id: `hockey:${M.key}`, mp: 1, best: p.profile.hockeyWins || 0 });
  begin(world, M);
}
function watch(world, p, M) {
  M.watch.add(p.pid);
  open(world, p, M, -1);
  tellWatched(world, M);
}
// a game: the table fresh, its clock from now, the puck dropped after a moment
function begin(world, M) {
  const Tb = newTable();
  Tb.wait = START_S;
  Object.assign(M, { st: 'play', Tb, k: 0, hits: [], t0: clock(), S: [[], []], win: -1, at: world.time, sent: null, sentAt: 0, line: `First to ${TO}` });
  push(world, M);
}

// the page's word (session.js)
export function onMsg(world, p, msg) {
  const M = matchOf(world, p);
  if (!M) { if (msg.a === 'leave' || msg.a === 'state') p.hockey = null; return; }
  const me = p.hockey.seat;
  if (msg.m) { mallet(M, me, msg.m); return; }
  if (msg.v) { relay(world, M, me, msg.v); return; }
  switch (msg.a) {
    case 'ping': if (p.conn) p.conn.sendJSON({ t: 'hockey', pong: Number(msg.c) || 0, now: +nowK(M).toFixed(2) }); return;
    case 'cpu': {   // (the machine: the page's own game, as it always was - its goals to arcade.js onScore)
      if (M.st !== 'wait' || me !== 0 || M.seats[1]) return;
      M.st = 'cpu'; M.seats[1] = { cpu: 1, name: 'the machine' }; M.Tb = newTable(); M.v = null;
      M.line = `${nameOf(M.seats[0])} v the machine`;
      arcade.play(world, p, false, M.o.poi || null, 'hockey', { tbl: 1 });
      return;
    }
    case 'again': if (M.st === 'over' && me >= 0 && human(M.seats[0]) && human(M.seats[1])) begin(world, M); return;
    case 'leave': leave(world, p, 'left'); return;
    case 'state': push(world, M, p); return;
    default:
  }
}
// a mallet's sample: in order, on its own half, not before the table's step (a late one counts from now) nor far past
// the clock
function mallet(M, seat, m) {
  if (M.st !== 'play' || seat < 0 || !Array.isArray(m)) return;
  let k = Math.floor(Number(m[0]));
  const x = Number(m[1]) / 10, y = Number(m[2]) / 10, S = M.S[seat], last = S[S.length - 1];
  if (!Number.isFinite(k) || !Number.isFinite(x) || !Number.isFinite(y) || k > nowK(M) + AHEAD_K) return;
  k = Math.max(k, M.k + 1);
  if (last && k <= last[0]) return;
  const [cx, cy] = clampMallet(seat, x, y);
  S.push([k, Math.round(cx * 10), Math.round(cy * 10)]);
  if (S.length > KEEP) S.shift();
}
// a game against the machine shown to its watchers: the page's table (the puck, the mallets) and the score
function relay(world, M, seat, v) {
  if (M.st !== 'cpu' || seat !== 0 || !Array.isArray(v) || v.length !== 8 || !v.every(Number.isFinite)) return;
  const sc = [Math.max(0, Math.min(TO, v[6] | 0)), Math.max(0, Math.min(TO, v[7] | 0))];
  const out = { t: 'hockey', v: v.slice(0, 6).map((n) => Math.round(Math.max(0, Math.min(2600, n)))) };
  if (!M.v || sc[0] !== M.Tb.us || sc[1] !== M.Tb.them) { M.Tb.us = sc[0]; M.Tb.them = sc[1]; out.sc = sc; }
  M.v = out.v;
  for (const id of M.watch) { const w = world.players.get(id); if (w && w.conn) w.conn.sendJSON(out); }
}
function tellWatched(world, M) {
  const q = playerOf(world, M.seats[0]);
  if (M.st === 'cpu' && q && q.conn) q.conn.sendJSON({ t: 'hockey', watch: M.watch.size });
}

function end(world, M, win, how) {
  M.st = 'over'; M.win = win; M.at = world.time;
  const sc = `${Math.max(M.Tb.us, M.Tb.them)}-${Math.min(M.Tb.us, M.Tb.them)}`;
  M.line = `${how ? `${how} - ` : ''}${nameOf(M.seats[win])} wins ${sc}`;
  M.seats.forEach((o, i) => {
    const q = playerOf(world, o);
    if (!q) return;
    const rec = (q.profile.hockeyRec ||= { w: 0, l: 0 });
    if (i === win) rec.w++; else rec.l++;
    let t = 0;
    if (i === win && M.o.tickets) { t = ARCADE.match.win; q.profile.tickets = (q.profile.tickets || 0) + t; }
    world.notify(q, `Air hockey: ${i === win ? 'you win' : `${nameOf(M.seats[win])} wins`} ${sc}${how ? ` (${how})` : ''}${t ? ` - ${t} tickets (${q.profile.tickets} in all)` : ''}. (Air hockey: ${rec.w}-${rec.l})`, i === win ? 'good' : 'info');
    q.meDirty = true;
  });
  store.touch();
  push(world, M);
}

// someone gets up from the table (why: 'left' the screen closed, 'gone' walked off / dead / logged off)
export function leave(world, p, why = 'left') {
  const M = matchOf(world, p), at = p.hockey;
  p.hockey = null;
  if (p.conn && why !== 'left') p.conn.sendJSON({ t: 'hockey', close: 1 });
  if (!M || !at) return;
  if (at.seat < 0) { M.watch.delete(p.pid); tellWatched(world, M); push(world, M); return; }
  if (M.st === 'cpu') { close(world, M); return; }
  const other = M.seats[at.seat ^ 1];
  if (M.st === 'play' && human(other)) end(world, M, at.seat ^ 1, `${p.name} left the table`);
  M.seats[at.seat] = null;
  if (!human(M.seats[0]) && !human(M.seats[1])) { close(world, M); return; }
  M.seats = [M.seats[0] || M.seats[1], null];   // (the one left waits on for someone else)
  for (const id of [...M.watch]) { const w = world.players.get(id); if (w) { w.hockey = null; if (w.conn) w.conn.sendJSON({ t: 'hockey', close: 1 }); } }
  M.watch.clear();
  Object.assign(M, { st: 'wait', line: `${p.name} got up - waiting for a player`, win: -1, Tb: newTable(), S: [[], []], k: 0 });
  const q = playerOf(world, M.seats[0]);
  if (q) q.hockey.seat = 0;
  push(world, M);
}
function close(world, M) {
  matches(world).delete(M.key);
  for (const o of M.seats) { const q = playerOf(world, o); if (q && q.hockey && q.hockey.key === M.key) q.hockey = null; }
  for (const id of M.watch) { const w = world.players.get(id); if (w && w.hockey && w.hockey.key === M.key) { w.hockey = null; if (w.conn) w.conn.sendJSON({ t: 'hockey', close: 1 }); } }
}

// the table's players and score to everyone at it (or just to p); now: the table's clock (in steps) as this is sent
function wire(M, seat) {
  return { t: 'hockey', key: M.key, st: M.st, me: seat, win: M.win, line: M.line, sc: [M.Tb.us, M.Tb.them], to: TO, watch: M.watch.size, now: +nowK(M).toFixed(2), seats: M.seats.map((o) => (o ? { n: o.name, cpu: o.cpu ? 1 : 0 } : null)), s: pack(M.Tb, M.k), ...(M.v ? { v: M.v } : {}) };
}
function each(world, M, fn) {
  M.seats.forEach((o, i) => { const q = playerOf(world, o); if (q && q.conn && q.hockey && q.hockey.key === M.key) fn(q, i); });
  for (const id of M.watch) { const q = world.players.get(id); if (q && q.conn) fn(q, -1); }
}
function push(world, M, only = null) { each(world, M, (q, seat) => { if (!only || only === q) q.conn.sendJSON(wire(M, seat)); }); }

// a game a tick: played up to the last step both mallets are known for (no more than LAG_S behind the clock), the goals,
// the end; the table sent if it changed (and once a second anyway)
export function play(world, M) {
  const nk = Math.floor(nowK(M)), S = M.S;
  const known = Math.min(S[0].length ? S[0][S[0].length - 1][0] : -1e9, S[1].length ? S[1][S[1].length - 1][0] : -1e9);
  const kh = Math.min(nk, Math.max(known, nk - LAG_K));
  if (kh <= M.k) return;
  let said = false;
  advance(M.Tb, M.k, kh, S[0], S[1], true, (ev, k) => {
    if (M.trace) M.trace(k, M.Tb);   // (tests: the table at every step)
    if (!ev) return;
    if (ev === 'us' || ev === 'them') { M.line = ev === 'us' ? `Goal - ${nameOf(M.seats[0])}` : `Goal - ${nameOf(M.seats[1])}`; said = true; }
    else if (ev === 'face') { M.line = 'Face-off'; said = true; }
    else if (ev === 'hit') { M.hits.push([k, M.Tb.by]); if (M.hits.length > 16) M.hits.shift(); }   // (the strikes lately: tests)
  });
  M.k = kh;
  for (const L of S) while (L.length > 1 && L[1][0] <= M.k) L.shift();   // (the samples gone by: the last one before now kept)
  M.at = world.time;
  if (M.Tb.us >= TO || M.Tb.them >= TO) { end(world, M, M.Tb.us >= TO ? 0 : 1, ''); return; }
  if (said) { push(world, M); M.sent = null; }
  const s = pack(M.Tb, M.k);
  if (M.sent && world.time - M.sentAt < 1 && s.every((v, i) => !i || v === M.sent[i])) return;
  M.sent = s; M.sentAt = world.time;
  const out = { t: 'hockey', s };
  each(world, M, (q) => q.conn.sendJSON(out));
}

// each tick (world.js): the players still at their tables; the games played on
export function update(world) {
  const A = world.hockeyMatches;
  if (!A || !A.size) return;
  for (const M of [...A.values()]) {
    for (const o of [...M.seats]) {
      if (!human(o)) continue;
      const q = world.players.get(o.pid);
      if (!q || !q.conn || !q.hockey || q.hockey.key !== M.key || !q.ped || q.ped.dead || !M.o.at(q)) {
        if (q && q.hockey && q.hockey.key === M.key) leave(world, q, 'gone');
        else leave(world, { pid: o.pid, name: o.name, hockey: { key: M.key, seat: M.seats.indexOf(o) } }, 'left');
      }
    }
    if (!A.has(M.key)) continue;
    for (const id of [...M.watch]) { const q = world.players.get(id); if (!q || !q.conn || !q.ped || q.ped.dead || !M.o.at(q)) { M.watch.delete(id); if (q && q.hockey && q.hockey.key === M.key) leave(world, q, 'gone'); } }
    if (M.st === 'play') play(world, M);
  }
}
export const _test = { matches, nowK };
