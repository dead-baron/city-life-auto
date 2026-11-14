// NPCs playing a real game of pool (the owner, 2026-11-13: "Balls should move on the table if possible"): the two at a
// table (activities.js 'pool') play eight-ball on the table's own balls with the minigame's physics and rules
// (shared/pool.js), each shot timed to them - the shot thought out, round the table to stand behind the cue ball (the
// line it's going down), bent over the cue a moment, the strike, the balls rolling while he stands up to watch them; the
// next shot his again if he potted one of his, else the other's; the frame won (the 8 down), the balls racked again and
// the loser breaks. The other one waits his turn off the far end of the table, his cue up. Their shots: the computer's
// (cpuShot - a ball toward a pocket, the cut it can make) with an NPC's error on it; the break straight at the rack.
// Every shot goes to the pages near the table (pooltables.js shot) - they roll the balls themselves; nothing else is
// sent. It only runs while the group's there - someone near (activities.js fills and empties it): no cost for an empty bar.
// A player who wants the table (poolmatch.js sitDown) gets it: the NPCs finish the shot rolling and stand back, cues up,
// watching; once the player's game is over and gone they rack up and play on.
//   g.pg: { balls, groups, turn, breakShot, ph ('plan' | 'walk' | 'aim' | 'roll' | 'over' | 'yield'), until, shot, J,
//   shots, frames, skill [2] }
import { POOL_NPC } from '../../shared/rules.js';
import { rack, playOut, judge, spotCue, cpuShot, settle, packBalls, cueVel, standAt, waitAt, qz, FOOT } from '../../shared/pool.js';
import * as tabs from './pooltables.js';

export const LAG = 0.15;   // s: the stroke on the page before the cue ball goes (client/poolview.js STRIKE)
const span = (r, [a, b]) => a + r() * (b - a);
const seatsOf = (world, g) => {
  const out = [null, null];
  for (const id of g.ids) { const e = world.get(id); if (e && !e.removed && !e.dead && e.npc && e.npc.act && e.npc.act.pool >= 0) out[e.npc.act.pool] = e; }
  return out;
};
const busy = (world, T) => !!(world.poolMatches && world.poolMatches.has(T.key));
// where the break's taken from: behind the cue ball on the head spot, straight up the table at the rack
export function breakSpot(T) { return standAt(T.f, T, rack('eight')[0], 0); }

// the game at a table just filled (activities.js fill): racked, the first break planned - he's already at it
export function begin(world, g, rng) {
  const T = g.table;
  g.pg = { balls: rack('eight'), groups: [null, null], turn: 0, breakShot: true, ph: busy(world, T) ? 'yield' : 'plan', until: world.time + span(rng, POOL_NPC.aimS), shot: null, J: null, shots: 0, frames: 0, skill: [span(rng, POOL_NPC.skill), span(rng, POOL_NPC.skill)] };
  if (g.pg.ph === 'plan') tabs.publish(world, T, g.pg.balls);
}

// the shot for whoever's up: the break, or the computer's choice with a miss in it
function plan(world, g, rng, seats) {
  const P = g.pg, T = g.table, cb = P.balls[0];
  let aim, pow;
  if (P.breakShot) { aim = Math.atan2(FOOT.y - cb.y, FOOT.x - cb.x) + (rng() - 0.5) * 0.04; pow = 0.85 + rng() * 0.15; }
  else { const k = P.skill[P.turn], s = cpuShot(P.balls, P.groups[P.turn], rng, k); aim = s.aim + (rng() - 0.5) * 2 * POOL_NPC.miss * (1 - k); pow = s.power; }
  P.shot = { aim: qz(aim, 1e4), pow: qz(pow, 1e3) };
  const sp = standAt(T.f, T, cb, P.shot.aim), w = waitAt(T, sp);
  place(seats[P.turn], { x: sp.x, y: sp.y, a: sp.a, gt: 'cue', pp: null, watch: null });
  place(seats[P.turn ^ 1], { x: w.x, y: w.y, a: w.a, gt: null, pp: 'cueup', watch: null });
  P.ph = 'walk'; P.until = world.time + 7;
}
const place = (e, o) => { if (e) Object.assign(e.npc.act, o); };
const at = (e) => Math.hypot(e.x - e.npc.act.x, e.y - e.npc.act.y) < 5;

// the strike: the balls settled, the shot sent to the pages near, played out here, judged as a match's (poolmatch.js shoot)
function strike(world, g, seats) {
  const P = g.pg, T = g.table, me = P.turn, sh = seats[me];
  settle(P.balls);
  const from = packBalls(P.balls), v = cueVel(P.shot.aim, P.shot.pow);
  tabs.shot(world, T, P.balls, from, v, sh ? sh.id : 0);
  P.balls[0].vx = v[0]; P.balls[0].vy = v[1];
  const res = playOut(P.balls), J = judge(P, P.balls, me, res);
  if (J.respot) spotCue(P.balls, 8);
  if (res.potted.includes(0) && J.win < 0) spotCue(P.balls);
  if (J.assign) P.groups = J.assign;
  J.moved = !!J.respot || res.potted.includes(0);
  P.breakShot = false; P.shots++;
  P.J = J; P.ph = 'roll';
  P.standAt = world.time + LAG + 0.75; P.until = world.time + LAG + res.secs + 0.9;
}
function rerack(world, g, rng, breaker) {
  const P = g.pg;
  Object.assign(P, { balls: rack('eight'), groups: [null, null], turn: breaker, breakShot: true, shots: 0, J: null, ph: 'plan', until: world.time + span(rng, [2, 4]) });
  P.frames++;
  tabs.publish(world, g.table, P.balls);
}
// both stand back from the table and watch (a player's game on it; the frame over)
function standBack(world, g, seats) {
  const T = g.table;
  seats.forEach((e, i) => { if (!e) return; const w = waitAt(T, { x: i ? T.x0 - 40 : T.x1 + 40 }); place(e, { x: w.x, y: w.y + (i ? 10 : -4), a: w.a, gt: null, pp: 'cueup', watch: { x: T.cx, y: T.cy } }); });
}

// each tick (activities.js update): the game at the table, a step at a time
export function step(world, g, rng) {
  const P = g.pg;
  if (!P) return;
  const T = g.table, now = world.time, seats = seatsOf(world, g);
  if (busy(world, T) && P.ph !== 'yield' && !(P.ph === 'roll' && now < P.until)) { P.ph = 'yield'; P.until = now + 4; standBack(world, g, seats); return; }   // (a player's game on it: the table's theirs)
  if (P.ph === 'yield') { if (busy(world, T)) P.until = now + 4; else if (now >= P.until) rerack(world, g, rng, rng() < 0.5 ? 0 : 1); return; }   // (a little while after the player's done: racked up again)
  if (!seats[0] || !seats[1]) return;   // (one of them gone off - scared away, stopped to watch a fight: the game waits)
  const sh = seats[P.turn];
  switch (P.ph) {
    case 'plan': if (now >= P.until) plan(world, g, rng, seats); return;
    case 'walk':
      if (at(sh)) { P.ph = 'aim'; P.until = now + span(rng, POOL_NPC.aimS); }
      else if (now >= P.until) { sh.x = sh.npc.act.x; sh.y = sh.npc.act.y; world.place && world.place(sh); P.ph = 'aim'; P.until = now + 1; }   // (held up on the way round: there)
      return;
    case 'aim':
      if (now < P.until) return;
      if (!at(sh)) { sh.x = sh.npc.act.x; sh.y = sh.npc.act.y; sh.vx = sh.vy = 0; world.place(sh); }   // (nudged off his spot - a chair, someone passing: back on it for the stroke)
      strike(world, g, seats);
      return;
    case 'roll':
      if (P.standAt && now >= P.standAt) { P.standAt = 0; place(sh, { gt: null, watch: { x: T.cx, y: T.cy } }); }   // (up off the cue, watching them roll)
      if (now < P.until) return;
      if (P.J.win >= 0 || P.shots >= POOL_NPC.frameShots) { P.ph = 'over'; P.until = now + span(rng, [2.5, 4.5]); P.win = P.J.win >= 0 ? P.J.win : P.turn; standBack(world, g, seats); return; }
      if (P.J.moved) tabs.publish(world, T, P.balls);   // (the cue ball back on the spot, the 8 on its own: the pages get the table)
      if (!P.J.keep) P.turn ^= 1;
      P.ph = 'plan'; P.until = now + 0.3 + rng() * 0.9;
      return;
    case 'over': if (now >= P.until) rerack(world, g, rng, P.win ^ 1); return;   // (the loser breaks)
    default:
  }
}
