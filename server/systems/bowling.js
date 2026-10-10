// Pinwheel Lanes (the alley and the physics: shared/bowling.js). Rent a lane at the shoe counter for a small fee, walk
// onto its approach and pick up a ball: where you stand and the way you face aim it, the action button picks a little
// hook, and the attack button sets the power (hold, let go - the meter swings like golf's). The ball rolls down the lane
// and the pins it takes are worked out from its line and speed; ten frames with strikes and spares on the lane's score
// card. Others can join your lane (they pay too) and take their turns; NPC groups bowl on the other lanes while anyone
// is near. Walk out of the building and your game ends.
import { K, DT } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { swingMeter } from '../../shared/golf.js';
import { BOWL, ALL_PINS, rollBall, knockPins, pinCount, nextBall, totalScore, approachAt, lanePt } from '../../shared/bowling.js';
import { mulberry32 } from '../../shared/rng.js';
import { payFrom } from './economy.js';
import { spawnNpc, despawnNpc } from './npc.js';
import { store } from '../store.js';

const rng = mulberry32(1010);
const HOOKS = ['none', 'a little left', 'a little right'], HOOK_DIR = [0, -1, 1];
const SETTLE_S = 1.6, NEAR_PX = 1100, FAR_PX = 1500, NPC_LANES = 3, MAX_BOWLERS = 4;
const alley = (world) => world.map.bowling || null;

export function init(world) {
  const A = alley(world);
  world.bowl = { lanes: A ? A.lanes.map(() => ({ game: null })) : [], npcOn: false };
}
const st = (world) => (world.bowl ||= { lanes: (alley(world) ? alley(world).lanes : []).map(() => ({ game: null })), npcOn: false });

// whose turn it is on a lane
const upNext = (G) => G.bowlers[G.turn] || null;
function newGame(npc) { return { bowlers: [], turn: 0, up: ALL_PINS, ball: 0, roll: null, settleAt: 0, npc: !!npc }; }

export function interaction(world, p) {
  const A = alley(world), ped = p.ped;
  if (!A || !ped || ped.vehId || ped.hidden || ped.dead) return null;
  const S = st(world), mine = p.bowl, li = approachAt(A, ped.x, ped.y);
  if (mine && li === mine.lane) {
    const G = S.lanes[li].game;
    if (!G) return null;
    if (G.roll || G.settleAt) return { label: 'Watch it roll...', passive: true, run: () => {} };
    const up = upNext(G);
    if (!up || up.pid !== p.pid) return { label: `${up ? up.name : 'Someone'}'s turn`, passive: true, run: () => {} };
    if (!mine.ball) return { label: 'Pick up a ball', run: () => { mine.ball = true; p.meDirty = true; world.notify(p, 'Stand where you want to let go and face down the lane. Action: a little hook. Hold attack and let go to roll - the meter sets the power.', 'info'); } };
    return { label: `Hook: ${HOOKS[mine.hook]} - change`, run: () => { mine.hook = (mine.hook + 1) % 3; p.meDirty = true; } };
  }
  // (the counter first: its front is on the nearest lanes' approaches)
  const c = A.counter, atCounter = Math.hypot(ped.x - c.x, ped.y - c.y) < 32;
  if (atCounter && !mine) return { label: `Rent a lane and shoes - $${BOWL.FEE}`, run: () => { const e = rent(world, p); if (e) world.notify(p, e, 'bad'); } };
  if (li >= 0 && !mine) {
    const G = S.lanes[li].game;
    if (G && !G.npc && G.bowlers.length < MAX_BOWLERS) return { label: `Join this lane's game - $${BOWL.FEE}`, run: () => { const e = join(world, p, li); if (e) world.notify(p, e, 'bad'); } };
  }
  if (atCounter) return { label: 'Hand your shoes back (end your game)', run: () => leave(world, p, true) };
  return null;
}

// a free lane (not one a player has): the nearest to the counter; an NPC group gives theirs up if it must
export function rent(world, p) {
  const A = alley(world), S = st(world);
  if (!A) return 'There\'s no bowling alley.';
  if (p.bowl) return 'You have a lane already.';
  const order = A.lanes.map((L) => L.i).sort((a, b) => Math.abs(A.lanes[a].cx - A.counter.x) - Math.abs(A.lanes[b].cx - A.counter.x));
  let li = order.find((i) => !S.lanes[i].game);
  if (li === undefined) li = order.find((i) => S.lanes[i].game && S.lanes[i].game.npc);
  if (li === undefined) return 'Every lane is taken - try again in a bit.';
  if (!payFrom(p, BOWL.FEE)) return `A lane is $${BOWL.FEE}.`;
  if (S.lanes[li].game) endNpcGame(world, li);
  S.lanes[li].game = newGame(false);
  addBowler(world, p, li);
  world.notify(p, `Lane ${li + 1} is yours. Walk up to it and pick up a ball.`, 'good');
  return null;
}
export function join(world, p, li) {
  const G = st(world).lanes[li] && st(world).lanes[li].game;
  if (!G || G.npc) return 'Nobody\'s bowling here.';
  if (G.bowlers.length >= MAX_BOWLERS) return 'This lane is full.';
  if (p.bowl) return 'You have a lane already.';
  if (!payFrom(p, BOWL.FEE)) return `It's $${BOWL.FEE} to bowl.`;
  addBowler(world, p, li);
  for (const b of G.bowlers) { const q = b.pid && world.players.get(b.pid); if (q && q !== p) world.notify(q, `${p.name} joins your lane.`, 'info'); }
  world.notify(p, `You join lane ${li + 1}. Wait for your turn.`, 'good');
  return null;
}
function addBowler(world, p, li) {
  const G = st(world).lanes[li].game;
  G.bowlers.push({ pid: p.pid, name: p.name, rolls: [] });
  p.bowl = { lane: li, ball: false, hook: 0, charge: -1 };
  p.meDirty = true;
}
export function leave(world, p, say) {
  const B = p.bowl;
  if (!B) return;
  p.bowl = null; p.meDirty = true;
  const G = st(world).lanes[B.lane] && st(world).lanes[B.lane].game;
  if (!G) return;
  const k = G.bowlers.findIndex((b) => b.pid === p.pid);
  if (k >= 0) {
    const sc = totalScore(G.bowlers[k].rolls);
    if (say) world.notify(p, `You hand your shoes back. ${G.bowlers[k].rolls.length ? `Your score: ${sc}.` : ''}`, 'info');
    G.bowlers.splice(k, 1);
    if (k < G.turn) G.turn--;
    if (G.turn >= G.bowlers.length) G.turn = 0;
  }
  if (!G.bowlers.length) { if (G.ball) { const b = world.get(G.ball); if (b) world.remove(b); } st(world).lanes[B.lane].game = null; }
}

// The attack button with a ball in your hands on your turn (players.js applyInput, like hoops): press, hold, let go.
export function input(world, p, ped, inp, pressed, dt = DT) {
  const B = p.bowl;
  if (!B || !B.ball || ped.vehId || ped.hidden) return false;
  const A = alley(world), G = st(world).lanes[B.lane].game;
  if (!A || !G || G.roll || G.settleAt || approachAt(A, ped.x, ped.y) !== B.lane || (upNext(G) || {}).pid !== p.pid) return false;
  const held = !!(inp.bits & IN.FIRE);
  if (B.charge >= 0) {
    if (held) {
      if (inp.seq === undefined) B.charge += dt;
      else if (inp.seq !== B.lastSeq) { B.lastSeq = inp.seq; B.charge = (inp.seq - B.pressSeq) * DT; }
      return true;
    }
    const power = swingMeter(B.charge);
    B.charge = -1;
    roll(world, B.lane, ped, power, HOOK_DIR[B.hook]);
    B.ball = false; p.meDirty = true;
    return true;
  }
  if (pressed & IN.FIRE) { B.charge = 0; B.pressSeq = B.lastSeq = inp.seq; return true; }
  return held;
}

// let the ball go from where the bowler stands, the way they face
export function roll(world, li, ped, power, hook) {
  const A = alley(world), L = A.lanes[li], G = st(world).lanes[li].game;
  const down = L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
  let ang = (ped.a || 0) - down;
  while (ang > Math.PI) ang -= Math.PI * 2;
  while (ang < -Math.PI) ang += Math.PI * 2;
  const u0 = (ped.x - L.cx) * L.right;
  const r = rollBall(L, u0, ang, power, hook);
  const k = r.gutter ? { down: 0, flights: [] } : knockPins(G.up, r.entry.u, r.entry.slope, r.speed);
  const at = lanePt(L, r.pts[0][0], 0);
  const b = world.add({ id: world.newId(), kind: K.BALL, x: at.x, y: at.y, a: 0, z: 0, vx: 0, vy: 0, vz: 0, ballKind: 'bowl', cx: -1, cy: -1 });
  G.ball = b.id;
  G.roll = { pts: r.pts, speed: r.speed, t0: world.time, gutter: r.gutter, down: k.down & G.up, flights: k.flights, bowler: G.turn };
  ped.attackAnimUntil = world.time + 0.3;
  return G.roll;
}

// the ball along its line (6 px apart, at its speed); at the pins, the pins
function stepRoll(world, li, G) {
  const A = alley(world), L = A.lanes[li], R = G.roll, b = world.get(G.ball);
  const s = (world.time - R.t0) * R.speed, pts = R.pts;
  // distance along the line
  let acc = 0, i = 1;
  for (; i < pts.length; i++) { const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + seg >= s) break; acc += seg; }
  if (i >= pts.length) { if (b) world.remove(b); G.ball = 0; G.roll = null; settle(world, li, G, R); return; }
  const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) || 1, f = (s - acc) / seg;
  const u = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, v = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f;
  if (b) { const at = lanePt(L, u, v); b.x = at.x; b.y = at.y; b.a = (b.a || 0) + 0.4; }
}

// the pins fall: the count goes on the card, the pinsetter clears them (or sets a new rack) in a moment
function settle(world, li, G, R) {
  const A = alley(world), L = A.lanes[li], bw = G.bowlers[R.bowler];
  const n = pinCount(R.down), head = lanePt(L, 0, L.len);
  G.up &= ~R.down;
  world.emit(head.x, head.y, { e: 'bowl', lane: li, x: head.x, y: head.y, down: R.down, up: G.up, n, fl: R.flights.map((q) => [q.i, q.du, q.dw]) });
  if (!bw) { G.settleAt = world.time + SETTLE_S; return; }
  const before = nextBall(bw.rolls);
  bw.rolls.push(n);
  const after = nextBall(bw.rolls);
  const strike = n === 10 && before.up === 10, spare = !strike && n === before.up && before.ball > 0;
  const q = bw.pid && world.players.get(bw.pid);
  const say = strike ? 'Strike!' : spare ? 'Spare!' : R.gutter ? 'Gutter ball.' : n ? `${n} pin${n > 1 ? 's' : ''}.` : 'Missed them all.';
  if (q) {
    world.notify(q, `${say} ${after.done ? `Game over: ${totalScore(bw.rolls)}.` : ''}`, strike || spare ? 'good' : 'info');
    for (const o of G.bowlers) { const op = o.pid && o.pid !== bw.pid && world.players.get(o.pid); if (op && (strike || spare)) world.notify(op, `${bw.name}: ${say}`, 'info'); }
    if (strike) world.emit(head.x, head.y, { e: 'bowlx', lane: li, x: head.x, y: head.y });
  }
  G.settleAt = world.time + SETTLE_S;
  G.next = { frameDone: after.done || after.frame !== before.frame, reset: after.up === 10 };
}
function afterSettle(world, li, G) {
  const nx = G.next || { frameDone: true, reset: true };
  G.settleAt = 0; G.next = null;
  if (nx.reset || nx.frameDone) {
    G.up = ALL_PINS;
    const L = alley(world).lanes[li], head = lanePt(L, 0, L.len);
    world.emit(head.x, head.y, { e: 'bowlset', lane: li, x: head.x, y: head.y, up: ALL_PINS });   // (the pinsetter sets a new rack)
  }
  if (!nx.frameDone) return;
  // the next bowler who isn't done; nobody left: the game's over
  for (let k = 1; k <= G.bowlers.length; k++) {
    const t = (G.turn + k) % G.bowlers.length;
    if (!nextBall(G.bowlers[t].rolls).done) { G.turn = t; announce(world, G); return; }
  }
  finish(world, li, G);
}
function announce(world, G) {
  const up = upNext(G);
  for (const b of G.bowlers) { const q = b.pid && world.players.get(b.pid); if (q) { q.meDirty = true; if (b === up && G.bowlers.length > 1) world.notify(q, 'Your turn - pick up a ball.', 'info'); } }
}
function finish(world, li, G) {
  if (G.npc) { for (const b of G.bowlers) b.rolls = []; G.turn = 0; G.up = ALL_PINS; return; }   // (they go again)
  const ranked = G.bowlers.map((b) => ({ b, s: totalScore(b.rolls) })).sort((a, c) => c.s - a.s);
  for (const { b, s } of ranked) {
    const q = b.pid && world.players.get(b.pid);
    if (!q) continue;
    const prof = q.profile, best = !prof.bowlBest || s > prof.bowlBest;
    if (best) prof.bowlBest = s;
    world.notify(q, `Final: ${ranked.map((r) => `${r.b.name} ${r.s}`).join(', ')}${best ? ' - your best game' : ''}. Rent again at the counter.`, 'good');
    q.bowl = null; q.meDirty = true;
  }
  store.touch();
  st(world).lanes[li].game = null;
}

// ---- NPCs bowling on the other lanes while anyone's near -----------------------------------------------------------------
function npcSpot(L, k) { return lanePt(L, (k ? 8 : -8), -BOWL.APPROACH_T * 32 + 14); }
function startNpcGame(world, li) {
  const A = alley(world), L = A.lanes[li], G = newGame(true);
  for (let k = 0; k < 2; k++) {
    const s = npcSpot(L, k), c = spawnNpc(world, 'casual', s.x, s.y, 'civ');
    c.npc.desk = { x: s.x, y: s.y, a: L.dir > 0 ? -Math.PI / 2 : Math.PI / 2 }; c.npc.keep = true; c.npc.bowler = li;
    c.a = c.npc.desk.a;
    G.bowlers.push({ npc: c.id, name: 'NPC', rolls: [], wait: world.time + 2 + k * 3 + rng() * 3 });
  }
  st(world).lanes[li].game = G;
}
function endNpcGame(world, li) {
  const G = st(world).lanes[li].game;
  if (!G) return;
  for (const b of G.bowlers) { const c = b.npc && world.get(b.npc); if (c && !c.removed) despawnNpc(world, c); }
  if (G.ball) { const b = world.get(G.ball); if (b) world.remove(b); }
  st(world).lanes[li].game = null;
}
function npcTurn(world, li, G) {
  const up = upNext(G);
  if (!up) return;
  const c = world.get(up.npc);
  if (!c || c.dead || c.removed) { endNpcGame(world, li); return; }   // (hurt or gone: the group leaves)
  if (world.time < (up.wait || 0)) return;
  const L = alley(world).lanes[li];
  // they step up to the line, aim at the pocket more or less, roll
  const s = lanePt(L, -4 + rng() * 14, -8);
  c.x = s.x; c.y = s.y;
  c.a = (L.dir > 0 ? -Math.PI / 2 : Math.PI / 2) + (rng() - 0.5) * 0.08;
  roll(world, li, c, 0.45 + rng() * 0.5, rng() < 0.6 ? -1 : 0);
  up.wait = world.time + 4 + rng() * 4;
  const back = npcSpot(L, G.turn % 2);
  c.npc.desk.x = back.x; c.npc.desk.y = back.y;
}

export function update(world) {
  const A = alley(world);
  if (!A) return;
  const S = st(world);
  S.lanes.forEach((ln, li) => {
    const G = ln.game;
    if (!G) return;
    if (G.roll) stepRoll(world, li, G);
    else if (G.settleAt && world.time >= G.settleAt) afterSettle(world, li, G);
    else if (G.npc && !G.settleAt) npcTurn(world, li, G);
  });
  // players who walked out, went down or left
  for (const p of world.players.values()) {
    if (!p.bowl) continue;
    const ped = p.ped, b = world.map.buildings[A.b];
    const inside = ped && !ped.dead && !ped.removed && !ped.vehId && ped.x >= b.tx * 32 && ped.x < (b.tx + b.tw) * 32 && ped.y >= b.ty * 32 - 16 && ped.y < (b.ty + b.th) * 32 + 16;
    if (!inside) leave(world, p, true);
  }
  for (const ln of S.lanes) if (ln.game && !ln.game.npc) for (const b of [...ln.game.bowlers]) if (b.pid && !world.players.get(b.pid)) { const q = { pid: b.pid, bowl: { lane: S.lanes.indexOf(ln) }, name: b.name }; leave(world, q, false); }
  // the NPC groups: up to three lanes nobody's rented, while a player is near
  if (world.tick % 20 !== 7) return;
  let near = Infinity;
  for (const p of world.players.values()) if (p.ped && !p.ped.dead) near = Math.min(near, Math.hypot(p.ped.x - A.counter.x, p.ped.y - A.counter.y));
  if (near > FAR_PX) { S.lanes.forEach((ln, li) => { if (ln.game && ln.game.npc) endNpcGame(world, li); }); return; }
  if (near > NEAR_PX) return;
  let n = S.lanes.filter((ln) => ln.game && ln.game.npc).length;
  for (const li of [0, 2, 4, 6, 1, 3, 5, 7]) {
    if (n >= NPC_LANES) break;
    if (!S.lanes[li].game) { startNpcGame(world, li); n++; }
  }
}

// for the HUD ('me'): your lane, the card (each bowler's rolls), whose turn, your ball and hook, the pins up
export function meInfo(world, p) {
  const B = p.bowl;
  if (!B) return null;
  const G = st(world).lanes[B.lane] && st(world).lanes[B.lane].game;
  if (!G) return null;
  const up = upNext(G);
  return { lane: B.lane, ball: B.ball, hook: B.hook, mine: !!up && up.pid === p.pid, rolling: !!(G.roll || G.settleAt), up: G.up, card: G.bowlers.map((b) => ({ name: b.name, rolls: b.rolls.slice(), me: b.pid === p.pid })) };
}
// the HUD tracker (the job slot)
export function targetFor(world, p) {
  const B = p.bowl;
  if (!B) return null;
  const A = alley(world), G = st(world).lanes[B.lane].game;
  if (!A || !G) return null;
  const me = G.bowlers.find((b) => b.pid === p.pid), nb = me ? nextBall(me.rolls) : null, L = A.lanes[B.lane];
  return { text: `Bowling, lane ${B.lane + 1}: ${nb && !nb.done ? `frame ${nb.frame + 1}` : 'done'} · ${me ? totalScore(me.rolls) : 0}`, x: L.cx, y: L.foulY, stage: 'bowling' };
}
