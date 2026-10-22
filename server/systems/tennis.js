// Tennis (the owner, 10-16: "Tennis" - the courts stood in the handcrafted districts with no game on them). On any
// tennis court, the action button calls the club pro out for a game: you on the half you're standing on, the pro across
// the net. You serve; press the attack button with the ball in reach to hit it - over the net, deep into the far half,
// left or right the way you aim. The pro runs it down and sends it back (not always: the further it has to run, the
// likelier a miss). The rules, kept simple: a hit must clear the net and land in the far half; a second bounce on your
// side, or a ball you put in the net or out, is the other side's point. Points count as tennis does - 15, 30, 40,
// deuce, advantage - and the first to win four, two clear, wins the game (the pro pays up if it's you: rules.js TENNIS).
// Walk off the court and the pro takes the game. The ball's a K.BALL (ballKind 'tennis', wire t 6: net.js); the pro a
// civilian the game drives (npc.driven: npc.js leaves it alone).
import { K } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { TENNIS } from '../../shared/rules.js';
import { pedStep } from '../../shared/physics.js';
import { mulberry32 } from '../../shared/rng.js';
import { spawnNpc } from './npc.js';
import * as players from './players.js';

const rng = mulberry32(4040);
const GRAV = 620, NET_H = 22, REACH = 38, REACH_Z = 80;

// the courts (map props: t 'court', k 'tennis' - the court anchored at the middle of its north edge, w across, d down;
// the run-off round the lines 10% / 8% in; the net across the middle): { x0, x1, y0, y1, net, cx }
export function courts(world) {
  if (world.tennisCourts) return world.tennisCourts;
  const out = [];
  for (const p of world.map.props || []) {
    if (!p || p.t !== 'court' || p.k !== 'tennis' || !p.w || !p.d) continue;
    const mx = Math.round(p.w * 0.1), my = Math.round(p.d * 0.08);
    out.push({ i: out.length, x0: p.x - p.w / 2 + mx, x1: p.x + p.w / 2 - mx, y0: p.y + my, y1: p.y + p.d - my, net: p.y + p.d / 2, cx: p.x });
  }
  return (world.tennisCourts = out);
}
const onCourt = (c, x, y, pad = 0) => x > c.x0 - pad && x < c.x1 + pad && y > c.y0 - pad && y < c.y1 + pad;
const sideOf = (c, y) => (y < c.net ? 0 : 1);   // 0 the north half, 1 the south
export const courtAt = (world, x, y, pad = 24) => courts(world).find((c) => onCourt(c, x, y, pad)) || null;
const games = (world) => (world.tennis ||= new Map());   // court index -> the game on it

// ---- the prompt, starting a game ------------------------------------------------------------------------------------
export function interaction(world, p) {
  const ped = p.ped, G = p.tennis && games(world).get(p.tennis.c);
  if (!ped || ped.dead || ped.vehId || ped.hidden) return null;
  if (G) return G.phase === 'serve' && G.server === 0 ? { label: 'Serve: the attack button, the way you aim', passive: true } : null;
  const c = courtAt(world, ped.x, ped.y, 0);
  if (!c || games(world).has(c.i)) return null;
  return { label: 'Play tennis with the club pro', run: () => start(world, p, c) };
}

export function start(world, p, c) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying || games(world).has(c.i)) return 'Not right now.';
  const mine = sideOf(c, ped.y), ny = mine === 0 ? c.y1 - 14 : c.y0 + 14;
  const pro = spawnNpc(world, 'athlete', c.cx, ny, 'civ');
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
  if (!b || !c) return true;
  const aim = (inp.bits & IN.AIMING) ? inp.aim : ped.a;
  if (G.phase === 'serve' && G.server === 0) { b.x = ped.x; b.y = ped.y; b.z = 34; hit(world, G, c, b, 0, aim, 0); G.phase = 'rally'; return true; }
  if (G.phase !== 'rally' || G.hitBy === 0) return true;
  const d = Math.hypot(b.x - ped.x, b.y - ped.y);
  if (d > REACH || b.z > REACH_Z || sideOf(c, b.y) !== G.side) { world.emit(ped.x, ped.y, { e: 'swish', id: ped.id }); return true; }   // (a swing at the air)
  hit(world, G, c, b, 0, aim, d / REACH);
  return true;
}

// a hit by `who` (0 you, 1 the pro) toward the far half: deep, left or right the way aimed (your aim; the pro's pick),
// off by `err` (0..1: how stretched the hit was) - flat enough to be quick, high enough to clear the net
function hit(world, G, c, b, who, aim, err) {
  const far = who === 0 ? 1 - G.side : G.side, w = c.x1 - c.x0;
  const depth = 0.55 + rng() * 0.35;   // (of the way from the net to the far baseline)
  const by = far === 0 ? c.net - (c.net - c.y0) * depth : c.net + (c.y1 - c.net) * depth;
  const lat = aim === null ? (rng() - 0.5) * 0.8 : Math.max(-1, Math.min(1, Math.cos(aim) * 1.4));
  let tx = (c.x0 + c.x1) / 2 + lat * w * 0.38, ty = by;
  const miss = err * err * TENNIS.spray;   // (stretched: the shot strays - wide, long, or into the net)
  tx += (rng() - 0.5) * 2 * miss; ty += (rng() - 0.5) * 2 * miss * 0.8;
  const dist = Math.hypot(tx - b.x, ty - b.y);
  let T = Math.max(0.55, dist / TENNIS.pace);
  // clear the net: the ball's height where it crosses at least NET_H + a little (lob it more if it would not)
  const tn = Math.abs((c.net - b.y) / (ty - b.y || 1)) * T;
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
  if (G.phase === 'serve') { b.x = ped.x + 8; b.y = ped.y; b.z = 30; b.vx = b.vy = b.vz = 0; }
  if (G.phase === 'rally') ball(world, G, c, b, dt);
  if (!games(world).has(G.c)) return;   // (the game's over)
  proStep(world, G, c, b, pro, dt);
  world.place(b);
}

function ball(world, G, c, b, dt) {
  const py = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.vz -= GRAV * dt; b.z += b.vz * dt;
  b.a += Math.hypot(b.vx, b.vy) * dt * 0.1;
  // into the net: it drops dead on the hitter's side
  if ((py < c.net) !== (b.y < c.net) && b.z < NET_H && b.x > c.x0 - 10 && b.x < c.x1 + 10) { b.y = py; b.vx *= 0.15; b.vy = -b.vy * 0.15; G.netted = true; }
  if (b.z <= 0 && b.vz < 0) {
    b.z = 0; b.vz = -b.vz * 0.72; b.vx *= 0.88; b.vy *= 0.88;
    world.emit(b.x, b.y, { e: 'bounce', x: Math.round(b.x), y: Math.round(b.y) });
    const s = sideOf(c, b.y), hitter = G.hitBy, other = 1 - hitter;
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
  const proSide = 1 - G.side, base = proSide === 0 ? c.y0 + 14 : c.y1 - 14;
  let tx = (c.x0 + c.x1) / 2, ty = base;
  if (G.phase === 'rally' && G.hitBy === 0 && !G.netted) {
    // where it'll be a third of a second after it bounces (the flight to the ground, then its hop)
    const tDown = (b.vz + Math.sqrt(Math.max(0, b.vz * b.vz + 2 * GRAV * b.z))) / GRAV, t = G.bounces ? 0.05 : tDown + 0.3;
    tx = b.x + b.vx * t; ty = b.y + b.vy * t;
    if (sideOf(c, ty) !== proSide) { tx = (c.x0 + c.x1) / 2; ty = base; }
  }
  const dx = tx - pro.x, dy = ty - pro.y, d = Math.hypot(dx, dy);
  const run = d > 6, k = run ? 1 / d : 0;
  const inp = { bits: d > 60 ? IN.SPRINT : 0, mx: dx * k, my: dy * k, aim: Math.atan2(b.y - pro.y, b.x - pro.x) };
  pro.npc.state = 'idle';
  const mods = players.pedMods(world, pro); mods.speedMul *= TENNIS.proSpeed; mods.analog = true;
  pedStep(pro, inp, dt, world.map, mods);
  world.place(pro);
  // its swing: the ball in reach, on its side, after the bounce (or a volley low enough)
  if (G.phase === 'rally' && G.hitBy === 0 && !G.netted && !G.whiff && sideOf(c, b.y) === proSide && b.z < REACH_Z) {
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
