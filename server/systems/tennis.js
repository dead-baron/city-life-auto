// Tennis (the owner, 10-16: "Tennis" - the courts stood in the handcrafted districts with no game on them). On any
// tennis court, the action button calls the club pro out for a game: you on the half you're standing on, the pro across
// the net. You serve; press the attack button with the ball in reach to hit it - over the net, deep into the far half,
// left or right the way you aim. The pro runs it down and sends it back (not always: the further it has to run, the
// likelier a miss). The rules, kept simple: a hit must clear the net and land in the far half; a second bounce on your
// side, or a ball you put in the net or out, is the other side's point. Points count as tennis does - 15, 30, 40,
// deuce, advantage - and the first to win four, two clear, wins the game (the pro pays up if it's you: rules.js TENNIS).
// Walk off the court and the pro takes the game. The ball's a K.BALL (ballKind 'tennis', wire t 6: net.js); the pro a
// civilian the game drives (npc.driven: npc.js leaves it alone). Courts lie either way round - the net across them east-
// west, or north-south (World v3's wide courts): the game works along the court (u, across the net) and across it (v).
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { TENNIS } from '../../shared/rules.js';
import { pedStep } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc } from './npc.js';
import * as players from './players.js';

const rng = mulberry32(4040);
const GRAV = 620, NET_H = 22, REACH = 38, REACH_Z = 80;

// a court's lines, x0..x1 by y0..y1, played along x (ax 1: the net north-south, the halves west and east) or along y
// (ax 0: the net east-west, the halves north and south): { i, x0, x1, y0, y1, ax, u0, u1, v0, v1, vc, net, cx, cy }
export function courtFrom(i, x0, x1, y0, y1, ax) {
  const c = { i, x0, x1, y0, y1, ax, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  [c.u0, c.u1, c.v0, c.v1] = ax ? [x0, x1, y0, y1] : [y0, y1, x0, x1];
  c.net = (c.u0 + c.u1) / 2; c.vc = (c.v0 + c.v1) / 2;
  return c;
}
// the courts (map props: t 'court', k 'tennis' - the court anchored at the middle of its north edge, w across, d down;
// its net a 'tnet' prop at the middle, a 0 strung north-south; the run-off round the lines 8% in at the baselines, 10%
// at the sides)
export function courts(world) {
  if (world.tennisCourts) return world.tennisCourts;
  const out = [], props = world.map.props || [];
  for (const p of props) {
    if (!p || p.t !== 'court' || p.k !== 'tennis' || !p.w || !p.d) continue;
    const cy = p.y + p.d / 2, r = Math.min(p.w, p.d) / 2;
    const n = props.find((q) => q && q.t === 'tnet' && Math.abs(q.x - p.x) < r && Math.abs(q.y - cy) < r);
    const ax = n ? (Math.abs(Math.cos(n.a || 0)) > 0.7 ? 1 : 0) : (p.w > p.d ? 1 : 0);
    const mx = Math.round(p.w * (ax ? 0.08 : 0.1)), my = Math.round(p.d * (ax ? 0.1 : 0.08));
    out.push(courtFrom(out.length, p.x - p.w / 2 + mx, p.x + p.w / 2 - mx, p.y + my, p.y + p.d - my, ax));
  }
  return (world.tennisCourts = out);
}
const onCourt = (c, x, y, pad = 0) => x > c.x0 - pad && x < c.x1 + pad && y > c.y0 - pad && y < c.y1 + pad;
const U = (c, x, y) => (c.ax ? x : y);   // along the court: across the net
const V = (c, x, y) => (c.ax ? y : x);   // across it, sideline to sideline
const spot = (c, u, v) => (c.ax ? { x: u, y: v } : { x: v, y: u });
const sideOf = (c, x, y) => (U(c, x, y) < c.net ? 0 : 1);   // 0 the north (west) half, 1 the south (east)
export const courtAt = (world, x, y, pad = 24) => courts(world).find((c) => onCourt(c, x, y, pad)) || null;
const games = (world) => (world.tennis ||= new Map());   // court index -> the game on it

// ---- the prompt, starting a game ------------------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped, G = p.tennis && games(world).get(p.tennis.c);
  if (!ped || ped.dead || ped.vehId || ped.hidden) return null;
  if (G) return G.phase === 'serve' && G.server === 0 ? { label: 'Serve: the attack button, the way you aim', passive: true, run: () => {} } : null;
  const c = courtAt(world, ped.x, ped.y, 0);
  if (!c || games(world).has(c.i)) return null;
  return { label: 'Play tennis with the club pro', run: () => { const no = start(world, p, c); if (no) world.notify(p, no, 'warn'); } };
}

export function start(world, p, c) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || games(world).has(c.i)) return 'Not right now.';
  const mine = sideOf(c, ped.x, ped.y), at = spot(c, mine === 0 ? c.u1 - 14 : c.u0 + 14, c.vc);
  const pro = spawnNpc(world, 'athlete', at.x, at.y, 'civ');
  if (!pro) return 'The pro is busy.';
  pro.npc.driven = true; pro.npc.keep = true; pro.weapon = 'fists';
  const ball = world.add({ id: world.newId(), kind: K.BALL, x: ped.x, y: ped.y, a: 0, z: 30, vx: 0, vy: 0, vz: 0, ballKind: 'tennis', cx: -1, cy: -1 });
  const G = { c: c.i, pid: p.pid, pro: pro.id, ball: ball.id, side: mine, score: [0, 0], server: 0, phase: 'serve', t: world.time, hitBy: -1, bounces: 0, aim: null };
  games(world).set(c.i, G);
  p.tennis = { c: c.i };
  p.meDirty = true;
  world.notify(p, 'The pro jogs out across the net. You serve: the attack button with the ball in your hand, the way you aim. First to four points, two clear.', 'info');
  return null;
}

// ---- your swing ---------------------------------------------------------------------------------------------------------
// true while you're in a game (the attack button is your racket, not a punch)
export function input(world, p, ped, inp, pressed) {
  if (!p.tennis) return false;
  const G = games(world).get(p.tennis.c);
  if (!G) { p.tennis = null; return false; }
  if (!(pressed & IN.FIRE)) return true;
  const b = world.get(G.ball), c = courts(world)[G.c];
  if (!b || !c || world.time < (ped.downUntil || 0) || world.time < (ped.stunUntil || 0)) return true;   // (floored: no swing)
  const aim = (inp.bits & IN.AIMING) ? inp.aim : ped.a;
  if (G.phase === 'serve' && G.server === 0) { b.x = ped.x; b.y = ped.y; b.z = 34; hit(world, G, c, b, 0, aim, 0); G.phase = 'rally'; return true; }
  if (G.phase !== 'rally' || G.hitBy === 0) return true;
  const d = Math.hypot(b.x - ped.x, b.y - ped.y);
  if (d > REACH || b.z > REACH_Z || sideOf(c, b.x, b.y) !== G.side) { world.emit(ped.x, ped.y, { e: 'swish', id: ped.id }); return true; }   // (a swing at the air)
  hit(world, G, c, b, 0, aim, d / REACH);
  return true;
}

// a hit by `who` (0 you, 1 the pro) toward the far half: deep, left or right the way aimed (your aim; the pro's pick),
// off by `err` (0..1: how stretched the hit was) - flat enough to be quick, high enough to clear the net
function hit(world, G, c, b, who, aim, err) {
  const far = who === 0 ? 1 - G.side : G.side, w = c.v1 - c.v0;
  const depth = 0.55 + rng() * 0.35;   // (of the way from the net to the far baseline)
  let tu = far === 0 ? c.net - (c.net - c.u0) * depth : c.net + (c.u1 - c.net) * depth;
  const lat = aim === null ? (rng() - 0.5) * 0.8 : Math.max(-1, Math.min(1, (c.ax ? Math.sin(aim) : Math.cos(aim)) * 1.4));
  let tv = c.vc + lat * w * 0.38;
  const miss = err * err * TENNIS.spray;   // (stretched: the shot strays - wide, long, or into the net)
  tv += (rng() - 0.5) * 2 * miss; tu += (rng() - 0.5) * 2 * miss * 0.8;
  const { x: tx, y: ty } = spot(c, tu, tv), bu = U(c, b.x, b.y);
  const dist = Math.hypot(tx - b.x, ty - b.y);
  let T = Math.max(0.55, dist / TENNIS.pace);
  // clear the net: the ball's height where it crosses at least NET_H + a little (lob it more if it would not)
  const tn = Math.abs((c.net - bu) / (tu - bu || 1)) * T;
  for (let k = 0; k < 6; k++) {
    const vz = (0.5 * GRAV * T * T - b.z) / T, zn = b.z + vz * tn - 0.5 * GRAV * tn * tn;
    if (zn > NET_H + 6 || miss > 30) break;
    T *= 1.12;
  }
  b.vx = (tx - b.x) / T; b.vy = (ty - b.y) / T; b.vz = (0.5 * GRAV * T * T - b.z) / T;
  G.hitBy = who; G.bounces = 0; G.netted = false; G.whiff = false;
  world.emit(b.x, b.y, { e: 'thwock', x: Math.round(b.x), y: Math.round(b.y) });
}

// ---- the game -------------------------------------------------------------------------------------------------------
export function update(world, dt) {
  const all = world.tennis;
  if (!all || !all.size) return;
  for (const G of all.values()) step(world, G, dt);
}

function end(world, G, text, tone) {
  games(world).delete(G.c);
  const p = world.players.get(G.pid), b = world.get(G.ball), pro = world.get(G.pro);
  if (b) world.remove(b);
  if (pro && pro.npc) { pro.npc.driven = false; pro.npc.state = 'wander'; pro.npc.keep = false; }
  if (p) { p.tennis = null; p.meDirty = true; if (text) world.notify(p, text, tone); }
}

const CALL = ['love', '15', '30', '40'];
function call(s) {
  const [a, b] = s;
  if (a >= 3 && b >= 3) return a === b ? 'Deuce' : a > b ? 'Advantage, you' : 'Advantage, the pro';
  return `${CALL[a]}-${CALL[b]}`;
}
function point(world, G, winner, why) {
  const p = world.players.get(G.pid);
  G.score[winner]++;
  G.phase = 'point'; G.t = world.time;
  const [a, b] = G.score, over = (a >= 4 || b >= 4) && Math.abs(a - b) >= 2;
  if (over) {
    if (a > b && p) { p.profile.bank = (p.profile.bank || 0) + TENNIS.prize; p.meDirty = true; }
    end(world, G, a > b ? `${why} Game - you beat the pro! ($${TENNIS.prize})` : `${why} Game to the pro. Another?`, a > b ? 'good' : 'info');
    return;
  }
  if (p) world.notify(p, `${why} ${call(G.score)}.`, winner === 0 ? 'good' : 'warn');
}

function step(world, G, dt) {
  const p = world.players.get(G.pid), ped = p && p.ped, c = courts(world)[G.c], b = world.get(G.ball), pro = world.get(G.pro);
  if (!p || !ped || ped.dead || ped.vehId || !b || !pro || pro.dead) { end(world, G, ped && !ped.dead ? 'The game\'s off.' : null, 'info'); return; }
  if (!onCourt(c, ped.x, ped.y, TENNIS.leave)) { end(world, G, 'You walked off the court - the pro takes the game.', 'warn'); return; }
  // between points: back to the baseline, the ball to the server
  if (G.phase === 'point') {
    b.vx = b.vy = b.vz = 0;
    if (world.time - G.t > TENNIS.between) { G.phase = 'serve'; G.hitBy = -1; G.t = world.time; }
  }
  // the pro floored, on fire, in a car: the game's off (anyone hitting the club pro ends it)
  if (pro.vehId || pro.burnT > 0 || world.time < (pro.downUntil || 0) || world.time < (pro.stunUntil || 0)) { end(world, G, 'The pro\'s in no state to play - the game\'s off.', 'info'); return; }
  if (G.phase === 'serve') {
    if (world.time - G.t > TENNIS.serveWait) { end(world, G, 'The pro got tired of waiting for your serve.', 'info'); return; }
    b.x = ped.x + 8; b.y = ped.y; b.z = 30; b.vx = b.vy = b.vz = 0;
  }
  if (G.phase === 'rally') ball(world, G, c, b, dt);
  if (!games(world).has(G.c)) return;   // (the game's over)
  proStep(world, G, c, b, pro, dt);
  world.place(b);
}

function ball(world, G, c, b, dt) {
  const px = b.x, py = b.y, pu = U(c, px, py);
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.vz -= GRAV * dt; b.z += b.vz * dt;
  b.a += Math.hypot(b.vx, b.vy) * dt * 0.1;
  // into the net: it drops dead on the hitter's side
  const v = V(c, b.x, b.y);
  if ((pu < c.net) !== (U(c, b.x, b.y) < c.net) && b.z < NET_H && v > c.v0 - 10 && v < c.v1 + 10) {
    b.x = px; b.y = py; G.netted = true;
    if (c.ax) { b.vx = -b.vx * 0.15; b.vy *= 0.15; } else { b.vx *= 0.15; b.vy = -b.vy * 0.15; }
  }
  if (b.z <= 0 && b.vz < 0) {
    b.z = 0; b.vz = -b.vz * 0.72; b.vx *= 0.88; b.vy *= 0.88;
    world.emit(b.x, b.y, { e: 'bounce', x: Math.round(b.x), y: Math.round(b.y) });
    const s = sideOf(c, b.x, b.y), hitter = G.hitBy, other = 1 - hitter;
    const sideOfHitter = hitter === 0 ? G.side : 1 - G.side;
    if (G.netted) { point(world, G, other, hitter === 0 ? 'Into the net.' : 'The pro nets it.'); return; }
    if (G.bounces === 0) {
      if (!onCourt(c, b.x, b.y, 4)) { point(world, G, other, hitter === 0 ? 'Out!' : 'The pro hits it out!'); return; }
      if (s === sideOfHitter) { point(world, G, other, hitter === 0 ? 'Short - it didn\'t cross.' : 'The pro hits it short.'); return; }
    } else { point(world, G, hitter, hitter === 0 ? 'Winner! Two bounces.' : 'Two bounces - too slow.'); return; }
    G.bounces++;
  }
  // a ball that got past everyone: long gone off the court
  if (!onCourt(c, b.x, b.y, 160)) point(world, G, G.bounces ? G.hitBy : 1 - G.hitBy, G.bounces ? (G.hitBy === 0 ? 'Winner!' : 'Past you.') : 'Way out!');
}

// the pro: to where the ball will come down on its side (after its bounce), and a swing when it's there
function proStep(world, G, c, b, pro, dt) {
  const proSide = 1 - G.side, home = spot(c, proSide === 0 ? c.u0 + 14 : c.u1 - 14, c.vc);
  let tx = home.x, ty = home.y;
  if (G.phase === 'rally' && G.hitBy === 0 && !G.netted) {
    // where it'll be a third of a second after it bounces (the flight to the ground, then its hop)
    const tDown = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * b.z))) / GRAV, t = G.bounces ? 0.05 : tDown + 0.3;
    tx = b.x + b.vx * t; ty = b.y + b.vy * t;
    if (sideOf(c, tx, ty) !== proSide) { tx = home.x; ty = home.y; }
  }
  const dx = tx - pro.x, dy = ty - pro.y, d = Math.hypot(dx, dy);
  const run = d > 6, k = run ? 1 / d : 0;
  const inp = { bits: d > 60 ? IN.SPRINT : 0, mx: dx * k, my: dy * k, aim: Math.atan2(b.y - pro.y, b.x - pro.x) };
  pro.npc.state = 'idle';
  const mods = players.pedMods(world, pro); mods.speedMul *= TENNIS.proSpeed; mods.analog = true;
  pedStep(pro, inp, dt, world.map, mods);
  world.place(pro);
  // its swing: the ball in reach, on its side, after the bounce (or a volley low enough)
  if (G.phase === 'rally' && G.hitBy === 0 && !G.netted && !G.whiff && sideOf(c, b.x, b.y) === proSide && b.z < REACH_Z) {
    const r = Math.hypot(b.x - pro.x, b.y - pro.y);
    if (r < REACH * 0.85 && (G.bounces > 0 || b.z < 40)) {
      pro.attackAnimUntil = world.time + 0.25;
      if (rng() < TENNIS.proMiss + (r / REACH) * TENNIS.proStretch) { G.whiff = true; world.emit(pro.x, pro.y, { e: 'swish', id: pro.id }); return; }   // (a miss: it goes past)
      hit(world, G, c, b, 1, null, r / REACH);
    }
  }
}

// the page's line about it (players.js me): the score and who serves
export function meInfo(world, p) {
  const G = p.tennis && games(world).get(p.tennis.c);
  return G ? { s: call(G.score), serve: G.phase === 'serve' && G.server === 0 } : null;
}
