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
// The page sends { t: 'pool', a: 'cpu' | 'solo' | 'shot' | 'again' | 'leave' | 'state' | 'aim' }.
// (2026-11-13, the owner) A game at a table out in the world (o.T: the Rusty Spur's, a bar's - pooltables.js) is played
// for everyone near to see as well, without the minigame: the balls roll on the bar's table on their pages (the same
// broadcast as the NPCs' games: pooltables.js publish / shot), and the players are moved round it by the server
// (steer: players.js puts it in place of their own input while the game's on) - whoever's up walks round to stand
// behind the cue ball, back along the line he's aiming down (his page sends the aim as he lines it up: 'aim'), bent over
// the cue; the stroke when he shoots; the one waiting stands back off the far end, his cue up. An NPC game at the table
// gives it up when a player sits down (poolnpc.js: the shot rolling out, the regulars stand back and watch).
import { ARCADE } from '../../shared/rules.js';
import { rack, playOut, judge, spotCue, cpuShot, groupOf, leftOf, settle, packBalls, cueVel, standAt, waitAt, qz } from '../../shared/pool.js';
import { mulberry32 } from '../../shared/rng.js';
import { payFrom as pay } from './economy.js';
import { store } from '../store.js';
import * as arcade from './arcade.js';
import * as tabs from './pooltables.js';

let rng = mulberry32(8088);
export function setRng(r) { rng = r; }   // (tests)
const matches = (world) => (world.poolMatches ||= new Map());
const human = (o) => !!o && !!o.pid;
const playerOf = (world, o) => (human(o) ? world.players.get(o.pid) || null : null);
const nameOf = (o) => (!o ? 'nobody' : o.name);
export const matchOf = (world, p) => (p && p.pool ? matches(world).get(p.pool.key) || null : null);

// the action button at a table (key: which table; o: { fee, tickets (an arcade's: a win pays tickets), cpu (the computer's
// name), at(q) (q still at the table), poi (the arcade's place, for a frame alone), free (a frame alone pays nothing),
// T (a table out in the world: pooltables.js) })
const npcGame = (world, key) => { for (const g of (world.acts && world.acts.values()) || []) if (g.k === 'pool' && g.pg && g.table && g.table.key === key) return g; return null; };
export function interaction(world, p, key, o) {
  if (p.pool) return null;
  const M = matches(world).get(key);
  if (!M && npcGame(world, key)) return { label: `The pool table - $${o.fee}: the regulars let you have it (play someone, the computer, or a frame alone)`, run: () => sitDown(world, p, key, o) };
  if (!M) return { label: `The pool table - $${o.fee}: play someone, the computer, or a frame alone`, run: () => sitDown(world, p, key, o) };
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
  matches(world).set(key, M);   // (an NPC game at it stands back: poolnpc.js)
  open(world, p, M, 0);
  show(world, M);
}
// the table's balls to the pages near it (a table out in the world)
const show = (world, M) => { if (M.o.T) tabs.publish(world, M.o.T, M.balls); };
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
  show(world, M);
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
    case 'aim': { const a = Number(msg.aim); if (Number.isFinite(a) && me >= 0) p.pool.aim = a; return; }   // (lining it up: where he stands - steer)
    case 'leave': leave(world, p, 'left'); return;
    case 'state': push(world, M, p); return;
    default:
  }
}

// a shot: played out, judged, sent to everyone at the table
function shoot(world, M, me, aim, pow) {
  aim = qz(aim, 1e4); pow = qz(pow, 1e3);
  settle(M.balls);   // (the balls as the pages have them, to the 0.01 px: the world's pages play the shot from these - pool.js)
  const from = M.balls.map((b) => [b.n, b.x, b.y, b.in ? 1 : 0]), v = cueVel(aim, pow);
  if (M.o.T) {   // (out in the world: he's at the cue ball, the stroke, the balls rolling on the bar's table for everyone near)
    const q = playerOf(world, M.seats[me]), ped = q && q.ped;
    if (ped) { const sp = standAt(M.o.T.f, M.o.T, M.balls[0], aim); if (Math.hypot(ped.x - sp.x, ped.y - sp.y) > 10) { ped.x = sp.x; ped.y = sp.y; world.place(ped); } ped.a = sp.a; pose(q, 'cue', null); }
    tabs.shot(world, M.o.T, M.balls, packBalls(M.balls), v, ped ? ped.id : 0);
  }
  M.balls[0].vx = v[0]; M.balls[0].vy = v[1];
  const res = playOut(M.balls), J = judge(M, M.balls, me, res), who = nameOf(M.seats[me]), them = nameOf(M.seats[me ^ 1]);
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
  if (at && at.posed) pose(p, null, null);
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
  show(world, M);
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

// ---- round the table out in the world (players.js: in place of the player's own input while his game's on) ------------
// p's character's pose at the table: gt 'cue' bent over it, pp 'cueup' waiting his turn (the pages draw both:
// client/art2/game/peds.js) - p.pool.posed while it's ours, put down when he gets up
function pose(p, gt, pp) {
  const ped = p.ped;
  if (!ped) return;
  if ((ped.gt || null) !== gt || (ped.pp || null) !== pp) { ped.gt = gt; ped.pp = pp; ped.appVer = (ped.appVer || 0) + 1; }
  if (p.pool) p.pool.posed = !!(gt || pp);
}
const HOLD = { bits: 0, mx: 0, my: 0, aim: 0 };
// the input for p's character this tick: walked round to his place (null: his own input - no game on, watching, in a car)
export function steer(world, p, ped) {
  const M = matchOf(world, p), at = p.pool, T = M && M.o.T;
  if (!T || !at || at.seat < 0 || M.st !== 'play' || ped.vehId || ped.dead) { if (at && at.posed) pose(p, null, null); return null; }
  const mine = M.turn === at.seat, rolling = world.time < M.busy;
  let goal = null;
  if (mine && !rolling) {   // up: behind the cue ball, back along his aim (or at the nearest ball till he's lined one up)
    const cb = M.balls[0];
    let aim = at.aim;
    if (!Number.isFinite(aim)) { let best = null; for (const b of M.balls) if (b.n && !b.in && (!best || Math.hypot(b.x - cb.x, b.y - cb.y) < Math.hypot(best.x - cb.x, best.y - cb.y))) best = b; aim = best ? Math.atan2(best.y - cb.y, best.x - cb.x) : 0; }
    goal = { ...standAt(T.f, T, cb, aim), gt: 'cue', pp: null };
  } else if (!mine) {        // waiting his turn, off the far end from the one shooting
    const o = playerOf(world, M.seats[M.turn]), w = waitAt(T, o && o.ped);
    goal = { ...w, gt: null, pp: 'cueup' };
  }
  if (!goal) { pose(p, null, null); ped.a = Math.atan2(T.cy - ped.y, T.cx - ped.x); return HOLD; }   // (his shot rolling: stood up, watching)
  const dx = goal.x - ped.x, dy = goal.y - ped.y, d = Math.hypot(dx, dy);
  if (d < 3) { ped.vx = ped.vy = 0; ped.a = goal.a; pose(p, goal.gt, goal.pp); return HOLD; }
  if (ped.gt === 'cue') pose(p, null, null);
  const k = Math.min(1, d / 20) * 0.6;
  return { bits: 0, mx: dx / d * k, my: dy / d * k, aim: Math.atan2(dy, dx) };
}
export const _test = { groupOf, leftOf };
