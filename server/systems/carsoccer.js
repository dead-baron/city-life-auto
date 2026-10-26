// Car soccer at the Waves Arena (the owner, 10-16: "Rocket League-style car soccer arena (boosts, banked walls, a giant
// ball)"): the match at each of the map's arenas (m.arenas: shared/carsoccer.js), the giant ball the server simulates.
//   - Join at the gate on Stadium Way (on foot: "Join car soccer"). The first to join opens the lobby; CARSOCCER.lobbyS s
//     later the match starts: the players split between ORANGE (defending the west goal) and BLUE (the east), the city's
//     drivers filling each side to teamMin (up to teamMax a side with more players); everyone is put at the wheel of an
//     arena car in the team's paint on the kick-off spots inside the walls.
//   - Kick-off: kickS s held on the spots (v.frz - the page holds its own car too, shared/carsoccer.js local), the ball
//     in the middle; then play: matchS s on the clock (stopped for goals and kick-offs); the Sprint button at the wheel
//     boosts while there's boost (v.bok: drained while held, the pads fill it - the small ones a little, the big ones
//     all of it, each back after a while); the banked walls pull a car back down (shared/carsoccer.js carStep, in every
//     vehicle step - the page predicts it). The ball (stepBall): pushed by the cars, off the walls, the posts and the
//     floor; the whole of it over a goal's line is a goal - the goal's replay (the ball's last seconds) and the crowd,
//     goalS s, then kick-off again. Most goals when the clock runs out wins; a draw goes to overtime - the next goal wins.
//   - The result overS s, prize dollars into the bank of every player on the winning side; then everyone's out at the
//     gate on foot and the arena cars and their drivers are gone. The vehicle button at the wheel leaves the match (out
//     at the gate; one of the city's drivers takes the car); so does dying or logging off.
//   - The arena cars are never damaged and their knocks are no crime (vehicles.js: v.arena); no shooting from them.
// The page hears it all as 'soc' messages (to everyone within nearR of an arena; client/carsoccer.js draws the ball,
// the pads, the score and the clock, predicts the ball between them). world.soccer: [state per arena].
import { K } from '../../shared/constants.js';
import { CARSOCCER as C } from '../../shared/rules-games.js';
import { TEAMS, TEAM_PAINT, newBall, stepBall, carOf, padAt, carStep, arenaAt } from '../../shared/carsoccer.js';
import { setArena } from '../../shared/physics.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc } from './npc.js';
import * as vehicles from './vehicles.js';
import * as traffic from './traffic.js';
import { protect } from './homes.js';
import * as homeinside from './homeinside.js';

setArena(carStep);   // (the banks and the boost in every vehicle step the server takes - shared/physics.js)

const REPLAY_S = 3, HIST_EVERY = 2;   // (the goal's replay: the ball's last REPLAY_S s, a frame every HIST_EVERY ticks)
const LEAVE_R = 700;                  // (a player waiting in the lobby who wanders this far from the gate is out of it)

const stOf = (world, i) => (world.soccer ||= []) && (world.soccer[i] ||= { i, phase: 'idle', t: 0, queue: [], slots: [], score: [0, 0], clock: C.matchS, ot: false, ball: null, pads: [], hist: [], last: null, rp: null, goal: null, ver: 0 });
const arenas = (world) => world.map.arenas || [];
const tell = (world, st, text, tone = 'info') => { for (const s of st.slots) { const q = s.pid && world.players.get(s.pid); if (q) world.notify(q, text, tone); } };
const inMatch = (st, pid) => st.slots.some((s) => s.pid === pid);
// the match a player is in (or waiting for), with its arena: { st, a, slot } or null
export function matchOf(world, p) {
  for (const a of arenas(world)) {
    const st = stOf(world, arenas(world).indexOf(a));
    const slot = st.slots.find((s) => s.pid === p.pid);
    if (slot || st.queue.includes(p.pid)) return { st, a, slot: slot || null };
  }
  return null;
}

// ---- the gate --------------------------------------------------------------------------------------------------------
// On foot at an arena's gate: join (or, waiting, how long till it starts)
export function gateInteraction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying) return null;
  for (const a of arenas(world)) {
    if (Math.hypot(ped.x - a.gate.x, ped.y - a.gate.y) > C.joinR) continue;
    const st = stOf(world, arenas(world).indexOf(a));
    if (st.queue.includes(p.pid)) return { label: `Car soccer at ${a.name}: kick-off in ${Math.max(0, Math.ceil(st.t - world.time))} s - ${st.queue.length} player${st.queue.length === 1 ? '' : 's'} in`, passive: true, run: () => {} };
    if (st.phase !== 'idle' && st.phase !== 'lobby') return { label: `${a.name}: a match is on - ${TEAMS[0]} ${st.score[0]} - ${st.score[1]} ${TEAMS[1]} (join the next one here)`, passive: true, run: () => {} };
    if (st.queue.length >= 2 * C.teamMax) return { label: `${a.name}: the next match is full`, passive: true, run: () => {} };
    return { label: `Join car soccer at ${a.name} (${C.teamMin}v${C.teamMin} or more - winners +$${C.prize})`, run: () => join(world, p, a) };
  }
  return null;
}
export function join(world, p, a) {
  const i = arenas(world).indexOf(a), st = stOf(world, i), ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return 'Not right now.';
  if (st.phase !== 'idle' && st.phase !== 'lobby') return 'A match is on - join the next one.';
  if (p.wanted > 0) { world.notify(p, 'Not with the police after you.', 'warn'); return 'Wanted.'; }
  if (st.queue.includes(p.pid)) return null;
  if (st.queue.length >= 2 * C.teamMax) return 'The next match is full.';
  st.queue.push(p.pid);
  if (st.phase === 'idle') { st.phase = 'lobby'; st.t = world.time + C.lobbyS; }
  world.notify(p, `You're in: car soccer at ${a.name}. Kick-off in ${Math.ceil(st.t - world.time)} s - wait by the gate. At the wheel the Sprint button boosts.`, 'good');
  for (const q of world.players.values()) if (q !== p && q.ped && Math.hypot(q.ped.x - a.cx, q.ped.y - a.cy) < C.nearR) world.notify(q, `${p.name} is up for car soccer at ${a.name} - join at the gate.`, 'info');
  return null;
}

// ---- the match ---------------------------------------------------------------------------------------------------------
function start(world, a, st) {
  const ps = st.queue.map((pid) => world.players.get(pid)).filter((q) => q && q.ped && !q.ped.dead && !q.ped.vehId && !q.ped.hidden && Math.hypot(q.ped.x - a.gate.x, q.ped.y - a.gate.y) < LEAVE_R);
  st.queue = [];
  if (!ps.length) { st.phase = 'idle'; return; }
  const n = Math.max(C.teamMin, Math.min(C.teamMax, Math.ceil(ps.length / 2)));
  st.slots = []; st.score = [0, 0]; st.clock = C.matchS; st.ot = false; st.last = null; st.rp = null; st.goal = null;
  st.pads = a.pads.map(() => 0);
  for (let k = 0; k < n; k++) for (let t = 0; t < 2; t++) {
    const [x, y, h] = a.spots[t][k];
    const v = world.spawnVehicle(C.model, x, y, h, { paint: TEAM_PAINT[t], variant: 7 + k, npcOwned: true, despawnable: false });
    v.arena = true; v.frz = true; v.bok = false;
    st.slots.push({ team: t, n: k, pid: null, name: '', bot: 0, veh: v.id, boost: C.boost.start });
  }
  // the players, one side then the other; the rest of the seats the city's drivers'
  ps.forEach((q, j) => { const s = st.slots.find((o) => o.team === j % 2 && !o.pid) || st.slots.find((o) => !o.pid); seatPlayer(world, st, s, q); });
  for (const s of st.slots) if (!s.pid) seatBot(world, st, s);
  st.ball = newBall(a);
  st.hist = [];
  kickoff(world, a, st);
  tell(world, st, `Car soccer: ${TEAMS[0]} v ${TEAMS[1]}, ${n} a side - ${Math.round(C.matchS / 60)} minutes. Boost with the Sprint button; the pads fill it.`, 'good');
}
function seatPlayer(world, st, s, q) {
  const v = world.get(s.veh), ped = q.ped;
  if (!v || !ped) return;
  ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id; v.lastDriver = ped.id;
  ped.x = v.x; ped.y = v.y; ped.vx = 0; ped.vy = 0; ped.lz = 0;
  world.place(ped);
  s.pid = q.pid; s.name = q.name; s.bot = 0;
  q.meDirty = true;
  world.emit(v.x, v.y, { e: 'door', x: v.x, y: v.y });
}
function seatBot(world, st, s) {
  const v = world.get(s.veh);
  if (!v || v.seats[0]) return;
  const d = spawnNpc(world, 'athlete', v.x, v.y, 'driver');
  d.npc.keep = true; d.npc.soccer = true; d.name = `${TEAMS[s.team][0]}${TEAMS[s.team].slice(1).toLowerCase()} #${s.n + 1}`;
  d.vehId = v.id; d.seat = 0; v.seats[0] = d.id;
  v.ai = { kind: 'soccer' };
  s.bot = d.id; s.pid = null; s.name = d.name;
}
// everyone on the spots, the ball in the middle, held for kickS s
function kickoff(world, a, st) {
  st.phase = 'kick'; st.t = world.time + C.kickS;
  Object.assign(st.ball, newBall(a));
  for (const s of st.slots) {
    const v = world.get(s.veh);
    if (!v) continue;
    const [x, y, h] = a.spots[s.team][s.n];
    v.x = x; v.y = y; v.a = h; v.vx = 0; v.vy = 0; v.av = 0; v.frz = true; v.bok = false;
    world.place(v);
    s.boost = Math.max(s.boost, C.boost.start);
  }
  st.ver++;
}
// a player out of the match (left the car, died, logged off - or the match over): out at the gate on foot
function release(world, a, st, s, why) {
  const q = s.pid && world.players.get(s.pid), v = world.get(s.veh);
  s.pid = null;
  if (q && q.ped && !q.ped.dead) {
    const ped = q.ped;
    if (ped.vehId && v && ped.vehId === v.id) { v.seats[0] = 0; ped.vehId = 0; ped.seat = -1; v.input = { throttle: 0, steer: 0, hb: false }; }
    if (arenaAt(world.map, ped.x, ped.y) || Math.hypot(ped.x - a.gate.x, ped.y - a.gate.y) < 2 * C.joinR) { ped.x = a.gate.x - 24; ped.y = a.gate.y + (world.rand() - 0.5) * 60; ped.vx = 0; ped.vy = 0; ped.lz = 0; world.place(ped); protect(world, ped, 2); }
    q.meDirty = true;
    if (why) world.notify(q, why, 'info');
    if (q.conn) q.conn.sendJSON({ t: 'soc', a: st.i, off: 1 });
  }
}
export function quit(world, p) {
  const m = matchOf(world, p);
  if (!m) return false;
  const a = arenas(world)[m.st.i];
  if (m.slot) { release(world, a, m.st, m.slot, 'You left the match - one of the city\'s drivers takes your car.'); if (m.st.phase !== 'over') seatBot(world, m.st, m.slot); }
  else m.st.queue = m.st.queue.filter((x) => x !== p.pid);
  return true;
}
function teardown(world, a, st) {
  for (const s of st.slots) {
    if (s.pid) release(world, a, st, s, null);
    const d = s.bot && world.get(s.bot);
    if (d && !d.removed) { d.vehId = 0; d.seat = -1; despawnNpc(world, d); }
    const v = world.get(s.veh);
    if (v && !v.removed) { for (const sid of v.seats) { const o = sid && world.get(sid); if (o) { o.vehId = 0; o.seat = -1; } } world.remove(v); }
  }
  st.slots = []; st.phase = 'idle'; st.ball = null; st.rp = null; st.goal = null; st.ver++;
}
function finish(world, a, st) {
  st.phase = 'over'; st.t = world.time + C.overS; st.rp = null;
  const w = st.score[0] === st.score[1] ? -1 : st.score[0] > st.score[1] ? 0 : 1;
  for (const s of st.slots) {
    const q = s.pid && world.players.get(s.pid);
    if (!q) continue;
    const won = s.team === w;
    if (won) { q.profile.bank += C.prize; store.touch(); q.meDirty = true; }
    world.notify(q, `Full time: ${TEAMS[0]} ${st.score[0]} - ${st.score[1]} ${TEAMS[1]}. ${won ? `You win! +$${C.prize} to your bank.` : w < 0 ? 'A draw.' : 'You lost this one.'}`, won ? 'good' : 'info');
  }
  for (const s of st.slots) { const v = world.get(s.veh); if (v) { v.frz = true; v.bok = false; } }
  st.ver++;
}
function scored(world, a, st, team) {
  st.score[team]++;
  const who = !st.last ? TEAMS[team] : st.last.team === team ? st.last.name : `${st.last.name} (an own goal)`;
  st.goal = { team, who, at: world.time };
  st.rp = st.hist.slice();
  st.phase = 'goal'; st.t = world.time + C.goalS;
  for (const s of st.slots) { const v = world.get(s.veh); if (v) v.bok = false; }
  world.emit(team ? a.ix0 : a.ix1, a.cy, { e: 'goal', x: team ? a.ix0 : a.ix1, y: a.cy, t: team });
  tell(world, st, `GOAL! ${who} - ${TEAMS[0]} ${st.score[0]} - ${st.score[1]} ${TEAMS[1]}`, 'good');
  st.ver++;
}

// ---- every tick: before the vehicles (the drivers at the wheel, who's still in) -------------------------------------
export function update(world, dt) {
  const A = arenas(world);
  for (let i = 0; i < A.length; i++) {
    const a = A[i], st = stOf(world, i), now = world.time;
    if (st.phase === 'idle') continue;
    if (st.phase === 'lobby') {
      st.queue = st.queue.filter((pid) => { const q = world.players.get(pid); return q && q.ped && !q.ped.dead && !q.ped.vehId && !q.ped.hidden && Math.hypot(q.ped.x - a.gate.x, q.ped.y - a.gate.y) < LEAVE_R; });
      if (!st.queue.length) { st.phase = 'idle'; continue; }
      if (now >= st.t) start(world, a, st);
      continue;
    }
    // who's still at the wheel: one who's left it (died, logged off, got out some other way) is out of the match
    for (const s of st.slots) {
      const v = world.get(s.veh);
      if (!v || v.removed) continue;
      v.hp = v.def.hp; v.wreckAt = 0; v.dead = false; v.burnUntil = 0;   // (the arena's cars take no harm)
      if (s.pid) {
        const q = world.players.get(s.pid);
        if (!q || !q.ped || q.ped.dead || q.ped.vehId !== v.id) { release(world, a, st, s, 'You\'re out of the match.'); if (st.phase !== 'over') seatBot(world, st, s); }
      } else if (s.bot) {
        const d = world.get(s.bot);
        if (!d || d.dead || d.removed || d.vehId !== v.id) { s.bot = 0; if (v.seats[0] === (d && d.id)) v.seats[0] = 0; seatBot(world, st, s); }
      }
    }
    if (!st.slots.some((s) => s.pid)) { teardown(world, a, st); continue; }   // (nobody left playing)
    if (st.phase === 'kick' && now >= st.t) { st.phase = 'play'; for (const s of st.slots) { const v = world.get(s.veh); if (v) v.frz = false; } st.ver++; }
    else if (st.phase === 'goal' && now >= st.t) { if (st.ot) finish(world, a, st); else kickoff(world, a, st); }
    else if (st.phase === 'over' && now >= st.t) { teardown(world, a, st); continue; }
    if (st.phase === 'play') {
      st.clock -= dt;
      if (st.clock <= 0 && !st.ot) {
        if (st.score[0] === st.score[1]) { st.ot = true; st.clock = C.otS; tell(world, st, `Time! All square - OVERTIME: the next goal wins (${C.otS} s, then it's a draw).`, 'info'); st.ver++; }
        else { st.clock = 0; finish(world, a, st); }
      } else if (st.clock <= 0) { st.clock = 0; finish(world, a, st); }   // (overtime run out: a draw)
    }
    // the boost and the pads; the city's drivers after the ball
    for (const s of st.slots) {
      const v = world.get(s.veh);
      if (!v) continue;
      const pi = st.phase === 'play' ? padAt(a, v.x, v.y) : -1;
      if (pi >= 0 && now >= st.pads[pi] && s.boost < 100) { const P = a.pads[pi]; s.boost = Math.min(100, s.boost + (P.big ? C.boost.big : C.boost.small)); st.pads[pi] = now + (P.big ? C.boost.bigS : C.boost.smallS); }
      if (st.phase === 'play' && v.input.gallop && s.boost > 0) s.boost = Math.max(0, s.boost - C.boost.drain * dt);
      v.bok = st.phase === 'play' && s.boost > 0;
      if (!s.pid && s.bot && st.phase === 'play') drive(world, a, st, s, v);
      else if (!s.pid) { v.input.throttle = 0; v.input.steer = 0; v.input.gallop = false; }
    }
  }
}
// a city driver at the wheel: round behind the ball and through it toward the other goal; the second of a side hangs
// back in front of its own goal until the ball comes its way
function drive(world, a, st, s, v) {
  const b = st.ball, gx = s.team ? a.ix0 : a.ix1, ox = s.team ? a.ix1 : a.ix0;
  let ux = gx - b.x, uy = a.cy - b.y;
  const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const keeper = s.n === 1 && Math.abs(b.x - ox) > (a.ix1 - a.ix0) * 0.45;
  let tx, ty;
  if (keeper) { tx = ox + (s.team ? -1 : 1) * 220; ty = a.cy + (b.y - a.cy) * 0.4; }
  else {
    const dx = v.x - b.x, dy = v.y - b.y, ahead = dx * ux + dy * uy, dB = Math.hypot(dx, dy) || 1, line = -ahead / dB;
    if (ahead > -30) {   // (between the ball and the goal it's going for: round to the side of it nearer the car)
      const side = dx * -uy + dy * ux > 0 ? 1 : -1;
      tx = b.x - ux * 170 - uy * side * 150; ty = b.y - uy * 170 + ux * side * 150;
    } else if (line < 0.8 && dB > 150) { tx = b.x - ux * (C.ball.r + 110); ty = b.y - uy * (C.ball.r + 110); }   // (behind it but off the line: onto the line to the goal first)
    else { tx = b.x + ux * 30; ty = b.y + uy * 30; }   // (lined up: through it)
  }
  tx = Math.max(a.ix0 + 60, Math.min(a.ix1 - 60, tx)); ty = Math.max(a.iy0 + 60, Math.min(a.iy1 - 60, ty));
  const d = Math.hypot(tx - v.x, ty - v.y);
  traffic.driveToward(world, v, tx, ty, keeper && d < 60 ? 0 : v.def.max * 0.92, { ignoreObstacles: true, ignoreCrossings: true });
  const aligned = Math.cos(Math.atan2(ty - v.y, tx - v.x) - v.a) > 0.9;
  v.input.gallop = !keeper && aligned && s.boost > 25 && d > 300;
}

// ---- after the vehicles have moved: the ball, the goals; what the pages hear ----------------------------------------
export function after(world, dt) {
  const A = arenas(world);
  for (let i = 0; i < A.length; i++) {
    const a = A[i], st = stOf(world, i);
    if (st.ball && (st.phase === 'play' || st.phase === 'kick')) {
      const cars = [];
      for (const e of world.query(a.cx, a.cy, Math.max(a.x1 - a.x0, a.y1 - a.y0) * 0.75, K.VEH)) if (!e.removed && arenaAt(world.map, e.x, e.y)) cars.push(carOf(e.id, e, e.def));
      const touched = (id) => { const s = st.slots.find((o) => o.veh === id); if (s) st.last = { team: s.team, name: s.name }; };
      let g = 0;
      if (st.phase === 'play') for (let k = 0; k < 2 && !g; k++) g = stepBall(st.ball, a, dt / 2, cars, touched);
      if ((world.tick % HIST_EVERY) === 0) { const B = st.ball; st.hist.push([Math.round(B.x), Math.round(B.y), Math.round(B.z)]); if (st.hist.length > REPLAY_S * 20 / HIST_EVERY) st.hist.shift(); }
      if (g) scored(world, a, st, g === 1 ? 1 : 0);
    }
    send(world, a, st);
  }
}
function send(world, a, st) {
  const every = world.tick % 2 === 0, quiet = st.phase === 'idle' || st.phase === 'lobby';
  for (const q of world.players.values()) {
    if (!q.conn || !q.ped) continue;
    const slot = st.slots.find((s) => s.pid === q.pid), near = slot || Math.hypot(q.ped.x - a.cx, q.ped.y - a.cy) < C.nearR;
    if (!near) { if (q.socNear === st.i) { q.socNear = null; q.conn.sendJSON({ t: 'soc', a: st.i, off: 1 }); } continue; }
    const full = q.socNear !== st.i || q.socVer !== st.ver || world.tick % 40 === 0;
    if ((!slot && !every) || (quiet && !full && world.tick % 20)) continue;   // (waiting for a match: now and then)
    q.socNear = st.i; q.socVer = st.ver;
    const B = st.ball, m = { t: 'soc', a: st.i, ph: st.phase, tl: Math.round(Math.max(0, st.phase === 'lobby' || st.phase === 'kick' || st.phase === 'goal' || st.phase === 'over' ? st.t - world.time : st.clock) * 10) / 10 };
    if (B) m.b = [Math.round(B.x), Math.round(B.y), Math.round(B.z), Math.round(B.vx), Math.round(B.vy), Math.round(B.vz), Math.round(B.spin * 100) / 100];
    m.pads = a.pads.reduce((bits, P, k) => bits | (world.time >= (st.pads[k] || 0) ? 1 << k : 0), 0);   // (between matches: all of them lit)
    if (slot) m.me = { team: slot.team, boost: Math.round(slot.boost) };
    if (full) {
      m.sc = st.score; m.ot = st.ot ? 1 : 0; m.clock = Math.round(st.clock);
      m.cars = st.slots.map((s) => [s.veh, s.team, s.name, s.pid ? 1 : 0]);
      m.q = st.queue.length;
      if (st.phase === 'goal' && st.goal) { m.goal = { team: st.goal.team, who: st.goal.who }; m.rp = st.rp; }
    }
    q.conn.sendJSON(m);
  }
}

// ---- in a match: what the action button says; the vehicle button leaves -------------------------------------------------
export function interaction(world, p) {
  const m = p.ped && p.ped.vehId ? matchOf(world, p) : null;
  if (!m || !m.slot) return null;
  const st = m.st;
  return { label: `Car soccer - ${TEAMS[0]} ${st.score[0]} - ${st.score[1]} ${TEAMS[1]}${st.ot ? ' (overtime)' : ''}. Sprint: boost (${Math.round(m.slot.boost)}). The vehicle button leaves the match`, passive: true, run: () => {} };
}

// ---- dev (server/dev.js 'soccer'): a match now - msg.bots: only the city's drivers with you; msg.score [a, b]; msg.ball [x, y, vx, vy]
export function devStart(world, p, msg = {}) {
  const a = arenas(world)[0];
  if (!a) return 'No arena on this map.';
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not while you\'re down.';
  if (ped.vehId) vehicles.ejectPed(world, ped, false);
  if (ped.home) homeinside.leave(world, p);   // (inside somewhere: out first)
  if (ped.hidden) return 'Step outside first.';
  const st = stOf(world, 0);
  if (st.phase !== 'idle' && st.phase !== 'lobby') teardown(world, a, st);
  ped.x = a.gate.x - 10; ped.y = a.gate.y; world.place(ped);
  if (!st.queue.includes(p.pid)) st.queue.push(p.pid);
  start(world, a, st);
  if (Array.isArray(msg.score)) st.score = [msg.score[0] | 0, msg.score[1] | 0];
  if (Array.isArray(msg.ball) && st.ball) Object.assign(st.ball, { x: +msg.ball[0], y: +msg.ball[1], vx: +msg.ball[2] || 0, vy: +msg.ball[3] || 0 });
  if (msg.play) { st.t = world.time; }
  return null;
}
export const _test = { stOf, kickoff, start, finish, teardown };
