// Pool against someone (the owner, 11-06: "Pool looks like it's just single player, is it built to let other people
// join? Can we have ways to make games with other players or NPCs?" - "make sure everything (that can be) is available for
// multiplayer like other players can come up and play against you (but not necessarily interrupt your current game if
// you're playing against PC)"). At a pool table - the Rusty Spur's (arcade.js poolInteraction), an arcade's (arcade.js
// hallInteraction, its 'x' pieces) - the action button pays the table and opens the pool screen (client/pool.js) on a
// choice: wait for a player, play the computer, or a frame alone (the old game: nine balls in as few shots as you can).
//   - Waiting, anyone walking up to the table is offered "Play pool with <you>": they pay and sit in, and it's eight-ball
//     (shared/pool.js judge: solids and stripes, the 8 last, fouls give the turn away).
//   - Playing the computer (a regular at the bar, the CPU at an arcade), or two players at it: someone walking up can only
//     watch - never take a seat in a game going on.
//   - Every shot is the server's: the page sends the aim and the power, the table is played out here (shared/pool.js
//     playShot), the rules decide whose turn it is, and both pages (and anyone watching) are sent the shot to animate
//     and the table as it ends. The computer thinks its shot here too (cpuShot).
//   - The screen closed (Esc, the X), the table walked away from, gone: a game against a player is forfeited (the other
//     wins), against the computer it's lost; a watcher just goes.
//   - A win in an arcade pays tickets (ARCADE.match), anywhere it goes on your record (profile.poolRec).
// On the wire: { t: 'arcade', game: 'pool', id, mp: 1 } opens the screen; { t: 'pool', ... } the table and its players
// (with shot: { aim, pow, by } and from: the balls before it, when a shot was played); { t: 'pool', close: 1 } shuts it.
// The page sends { t: 'pool', a: 'cpu' | 'solo' | 'shot' | 'again' | 'leave' | 'state' }.
import { ARCADE } from '../../shared/rules.js';
import { rack, playShot, judge, spotCue, cpuShot, groupOf, leftOf } from '../../shared/pool.js';
import { mulberry32 } from '../../shared/rng.js';
import { payFrom as pay } from './economy.js';
import { store } from '../store.js';
import * as arcade from './arcade.js';

let rng = mulberry32(8088);
export function setRng(r) { rng = r; }   // (tests)
const matches = (world) => (world.poolMatches ||= new Map());
const human = (o) => !!o && !!o.pid;
const playerOf = (world, o) => (human(o) ? world.players.get(o.pid) || null : null);
const nameOf = (o) => (!o ? 'nobody' : o.name);
export const matchOf = (world, p) => (p && p.pool ? matches(world).get(p.pool.key) || null : null);

// the action button at a table (key: which table; o: { fee, tickets (an arcade's: a win pays tickets), cpu (the computer's
// name), at(q) (q still at the table), poi (the arcade's place, for a frame alone), free (a frame alone pays nothing) })
export function interaction(world, p, key, o) {
  if (p.pool) return null;
  const M = matches(world).get(key);
  if (!M) return { label: `Play pool - $${o.fee} (a player, the computer, or a frame alone)`, run: () => sitDown(world, p, key, o) };
  const free = M.st === 'wait' && !M.seats[1];
  if (free) return { label: `Play pool with ${nameOf(M.seats[0])} - $${o.fee}`, run: () => join(world, p, M) };
  return { label: `Watch the pool game - ${nameOf(M.seats[0])} v ${nameOf(M.seats[1])}`, run: () => watch(world, p, M) };
}
function open(world, p, M, seat) {
  p.pool = { key: M.key, seat };
  if (p.conn) p.conn.sendJSON({ t: 'arcade', game: 'pool', id: `pool:${M.key}`, mp: 1, best: p.profile.poolBest || 0 });
  push(world, M);
}
function sitDown(world, p, key, o) {
  if (!pay(p, o.fee)) { world.notify(p, 'Not enough money.', 'warn'); return; }
  const M = { key, o, seats: [{ pid: p.pid, name: p.name }, null], watch: new Set(), st: 'wait', balls: rack('eight'), turn: 0, groups: [null, null], breakShot: true, busy: 0, at: world.time, line: 'Waiting for a player', win: -1, cpuAt: 0, shots: 0 };
  matches(world).set(key, M);
  open(world, p, M, 0);
}
function join(world, p, M) {
  if (M.st !== 'wait' || M.seats[1]) return;
  if (!pay(p, M.o.fee)) { world.notify(p, 'Not enough money.', 'warn'); return; }
  M.seats[1] = { pid: p.pid, name: p.name };
  const q = playerOf(world, M.seats[0]);
  if (q) world.notify(q, `${p.name} sits in for a game of pool.`, 'info');
  open(world, p, M, 1);
  begin(world, M);
}
function watch(world, p, M) {
  M.watch.add(p.pid);
  open(world, p, M, -1);
}
function begin(world, M, breaker = rng() < 0.5 ? 0 : 1) {
  Object.assign(M, { st: 'play', balls: rack('eight'), turn: breaker, groups: [null, null], breakShot: true, busy: world.time + 0.5, at: world.time, win: -1, shots: 0, cpuAt: 0 });
  M.line = `Eight-ball: ${nameOf(M.seats[breaker])} breaks`;
  push(world, M);
}

// the page's word (session.js)
export function onMsg(world, p, msg) {
  const M = matchOf(world, p);
  if (!M) { if (msg.a === 'leave' || msg.a === 'state') p.pool = null; return; }
  const me = p.pool.seat;
  switch (msg.a) {
    case 'cpu': if (M.st === 'wait' && me === 0 && !M.seats[1]) { M.seats[1] = { cpu: 1, name: M.o.cpu }; begin(world, M, 0); } return;
    case 'solo': {   // (a frame alone, the old game: the table's paid for)
      if (M.st !== 'wait' || me !== 0 || M.seats[1]) return;
      matches(world).delete(M.key); p.pool = null;
      arcade.play(world, p, !!M.o.free, M.o.poi || null, 'pool');
      return;
    }
    case 'shot': {
      if (M.st !== 'play' || M.turn !== me || world.time < M.busy) return;
      const aim = Number(msg.aim), pow = Number(msg.pow);
      if (!Number.isFinite(aim) || !Number.isFinite(pow)) return;
      shoot(world, M, me, aim, Math.max(0, Math.min(1, pow)));
      return;
    }
    case 'again': {   // (a rematch: whoever lost breaks)
      if (M.st !== 'over' || me < 0 || !M.seats[0] || !M.seats[1]) return;
      begin(world, M, M.win === 0 ? 1 : 0);
      return;
    }
    case 'leave': leave(world, p, 'left'); return;
    case 'state': push(world, M, p); return;
    default:
  }
}

// a shot: played out, judged, sent to everyone at the table
function shoot(world, M, me, aim, pow) {
  const from = M.balls.map((b) => [b.n, +b.x.toFixed(2), +b.y.toFixed(2), b.in ? 1 : 0]);
  const res = playShot(M.balls, aim, pow), J = judge(M, M.balls, me, res), who = nameOf(M.seats[me]), them = nameOf(M.seats[me ^ 1]);
  M.shots++; M.at = world.time;
  if (J.respot) spotCue(M.balls, 8);
  if (res.potted.includes(0) && J.win < 0) spotCue(M.balls);
  if (J.assign) M.groups = J.assign;
  M.breakShot = false;
  M.busy = world.time + Math.min(res.secs, 12) + 0.6;
  const pots = res.potted.filter((n) => n);
  if (J.win >= 0) end(world, M, J.win, J.win === me ? `${who} sinks the 8` : `${who}: ${J.why}`);
  else {
    if (!J.keep) M.turn = me ^ 1;
    M.line = J.foul ? `Foul (${J.why}) - ${them}'s shot` : J.assign ? `${who} has ${J.assign[me] === 's' ? 'solids' : 'stripes'}` : J.keep ? `${who} pots ${pots.length > 1 ? `${pots.length} balls` : `the ${pots[0]}`} - shoots again` : `${them}'s shot`;
    push(world, M, null, { aim, pow, by: me, from });
    return;
  }
  push(world, M, null, { aim, pow, by: me, from });
}
function end(world, M, win, how) {
  M.st = 'over'; M.win = win; M.at = world.time;
  M.line = `${how} - ${nameOf(M.seats[win])} wins`;
  M.seats.forEach((o, i) => {
    const q = playerOf(world, o);
    if (!q) return;
    const rec = (q.profile.poolRec ||= { w: 0, l: 0 });
    if (i === win) rec.w++; else rec.l++;
    let t = 0;
    if (i === win && M.o.tickets) { t = M.seats[i ^ 1] && M.seats[i ^ 1].cpu ? ARCADE.match.cpu : ARCADE.match.win; q.profile.tickets = (q.profile.tickets || 0) + t; }
    world.notify(q, `${how}. ${i === win ? 'You win' : `${nameOf(M.seats[win])} wins`}${t ? ` - ${t} tickets (${q.profile.tickets} in all)` : ''}. (Pool: ${rec.w}-${rec.l})`, i === win ? 'good' : 'info');
    q.meDirty = true;
  });
  store.touch();
}

// someone gets up from the table (why: 'left' the screen closed, 'gone' walked off / dead / logged off)
export function leave(world, p, why = 'left') {
  const M = matchOf(world, p), at = p.pool;
  p.pool = null;
  if (p.conn && why !== 'left') p.conn.sendJSON({ t: 'pool', close: 1 });
  if (!M || !at) return;
  if (at.seat < 0) { M.watch.delete(p.pid); return; }
  const other = M.seats[at.seat ^ 1];
  if (M.st === 'play' && other) end(world, M, at.seat ^ 1, `${p.name} left the table`);
  M.seats[at.seat] = null;
  if (!human(M.seats[0]) && !human(M.seats[1])) { close(world, M); return; }
  M.seats = [M.seats[0] || M.seats[1], null];   // (the one left waits on for someone else)
  for (const q of [...M.watch]) { const w = world.players.get(q); if (w) { w.pool = null; if (w.conn) w.conn.sendJSON({ t: 'pool', close: 1 }); } }
  M.watch.clear();
  M.st = 'wait'; M.line = `${p.name} got up - waiting for a player`; M.win = -1; M.balls = rack('eight');
  const q = playerOf(world, M.seats[0]);
  if (q) q.pool.seat = 0;
  push(world, M);
}
function close(world, M) {
  matches(world).delete(M.key);
  for (const id of M.watch) { const w = world.players.get(id); if (w && w.pool && w.pool.key === M.key) { w.pool = null; if (w.conn) w.conn.sendJSON({ t: 'pool', close: 1 }); } }
}

// the table to everyone at it (or just to p): its balls, whose turn, the groups, the players, the last word
function wire(M, seat, shot) {
  const m = {
    t: 'pool', key: M.key, st: M.st, me: seat, turn: M.turn, groups: M.groups, win: M.win, line: M.line, open: M.breakShot,
    seats: M.seats.map((o) => (o ? { n: o.name, cpu: o.cpu ? 1 : 0 } : null)), balls: M.balls.map((b) => [b.n, +b.x.toFixed(2), +b.y.toFixed(2), b.in ? 1 : 0]), watch: M.watch.size,
  };
  if (shot) m.shot = shot;
  return m;
}
function push(world, M, only = null, shot = null) {
  const send = (q, seat) => { if (q && q.conn && (!only || only === q)) q.conn.sendJSON(wire(M, seat, shot)); };
  M.seats.forEach((o, i) => send(playerOf(world, o), i));
  for (const id of M.watch) send(world.players.get(id), -1);
}

// each tick (world.js): the players still at their tables; the computer's shot when it's its turn; an idle game off
export function update(world) {
  const A = world.poolMatches;
  if (!A || !A.size) return;
  for (const M of [...A.values()]) {
    for (const o of [...M.seats]) {
      if (!human(o)) continue;
      const q = world.players.get(o.pid);
      if (!q || !q.conn || !q.pool || q.pool.key !== M.key || !q.ped || q.ped.dead || !M.o.at(q)) { if (q && q.pool && q.pool.key === M.key) leave(world, q, 'gone'); else { const g = { pid: o.pid, name: o.name, pool: { key: M.key, seat: M.seats.indexOf(o) } }; leave(world, g, 'left'); } }
    }
    if (!A.has(M.key)) continue;
    for (const id of [...M.watch]) { const q = world.players.get(id); if (!q || !q.conn || !q.ped || q.ped.dead || !M.o.at(q)) { M.watch.delete(id); if (q && q.pool && q.pool.key === M.key) leave(world, q, 'gone'); } }
    if (M.st === 'play' && world.time - M.at > 300) { M.st = 'over'; M.win = -1; M.line = 'Nobody shot for a long while - the game is off'; push(world, M); continue; }
    const up = M.seats[M.turn];
    if (M.st !== 'play' || !up || !up.cpu || world.time < M.busy) continue;
    if (!M.cpuAt) { M.cpuAt = world.time + 1 + rng() * 1.5; continue; }
    if (world.time < M.cpuAt) continue;
    M.cpuAt = 0;
    const s = cpuShot(M.balls, M.groups[M.turn], rng, M.o.skill ?? 0.6);
    shoot(world, M, M.turn, s.aim, s.power);
  }
}
export const _test = { groupOf, leftOf };
