// Skateboarding, part 1 (the owner, 2026-10-17): a skateboard bought at a skate, sports or surf shop and carried in the
// bag; the vehicle button hops you on where there's no car to get into, and off again. On the board: push, carve, coast,
// brake and ollie (shared/physics.js BOARD - the page predicts it the same); faster than running, not as fast as a bike;
// it rolls on anything paved, and on grass you step off. Run into a wall hard and you bail. The rider's look on the wire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, straightRoad } from './helpers.js';
import { T, TILE, PF } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { SKATEBOARD_PRICE } from '../shared/rules.js';
import { pedStep, newPedState, PED, boardOn } from '../shared/physics.js';
import { BOARD, KICK, boardGround, boardOut, boardIn } from '../shared/board.js';
import * as SK from '../shared/skate.js';
import { SnapshotWriter, decodeSnapshot, CTRL } from '../shared/protocol.js';
import { POSES } from '../client/art2/people.js';
import { pedSprite } from '../client/art2/game/peds.js';
import * as skate from '../server/systems/skate.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';
import { _descriptor } from '../server/net.js';

const W = makeWorld();
const M = W.map;
const ROAD = straightRoad(M, 1200);
const push = (p, mx, my, bits = 0) => p.inputQ.push({ seq: p.ack + 1 + p.inputQ.length, bits, mx, my, aim: Math.atan2(my, mx) });
function rider(x, y, opts = {}) {
  const { p } = joinPlayer(W, { cash: 500 });
  if (opts.board !== false) p.profile.inventory.skateboard = 1;
  teleport(W, p.ped, x, y);
  p.ped.vx = 0; p.ped.vy = 0; p.ped.a = 0;
  return p;
}
// hold the stick (and the buttons) for t seconds; the buttons pressed on the first step only when `tap`
function hold(p, t, mx, my, bits = 0, tap = 0) {
  const n = Math.round(t * 20);
  for (let i = 0; i < n; i++) { push(p, mx, my, bits | (i === 0 ? tap : 0)); W.step(); }
}
const speed = (ped) => Math.hypot(ped.vx, ped.vy);
const leave = (p) => players.leave(W, p);

// ---- the physics on its own (shared, the page runs the same) -------------------------------------------------------
test('the board: as fast as a bike pushing, kick by kick; coasts a long way; brakes; stops on grass; carves wider at speed', () => {
  const mods = { canMove: true, canSprint: true, speedMul: 1, analog: true, board: true, canSwim: true };
  const at = (tile) => ({ w: 1e5, h: 1e5, tileAt: () => tile, tileAtPx: () => tile, solidProps: new Map(), levels: null, inside: () => true, idx: () => 0, frame: null });
  const step = (s, m, inp, t, md = mods) => { for (let i = 0; i < Math.round(t * 20); i++) pedStep(s, inp, 0.05, m, md); return s; };
  const road = at(T.ROAD), grass = at(T.GRASS);
  const fwd = { bits: 0, mx: 1, my: 0, aim: 0, seq: 0 }, none = { bits: 0, mx: 0, my: 0, aim: 0 }, back = { bits: 0, mx: -1, my: 0, aim: 0 };
  let s = step(newPedState(3000, 3000), road, fwd, 4);
  // a kick cycle at cruising speed: the speed peaks just after the foot plants and eases off a touch till the next
  const cyc = []; for (let i = 0; i < Math.round(KICK.T * 20); i++) { pedStep(s, fwd, 0.05, road, mods); cyc.push([speed(s), s.kp]); }
  const sp = cyc.map((c) => c[0]), cruise = sp.reduce((a, b) => a + b, 0) / sp.length, hi = Math.max(...sp), lo = Math.min(...sp);
  assert.ok(cruise > BOARD.push * 0.95 && cruise <= BOARD.push * BOARD.surge + 1, `pushing: ${Math.round(cruise)} px/s, a bike's (the commuter bike does 330)`);
  assert.ok(hi - lo > BOARD.push * 0.015 && hi - lo < BOARD.push * 0.1, `each kick a little surge, the roll after it easing off a touch: ${Math.round(lo)}-${Math.round(hi)} px/s`);
  const peakAt = cyc[sp.indexOf(hi)][1];
  assert.ok(peakAt >= KICK.reach && peakAt < KICK.back, `the speed peaks in the kick (at phase ${peakAt.toFixed(2)})`);
  assert.ok(cyc.every((c) => c[1] >= 0) && s.push === true, 'pushing all along: the kicks one after another');
  const hard = speed(step(newPedState(3000, 3000), road, { ...fwd, bits: IN.SPRINT }, 4));
  assert.ok(hard > cruise + 30 && hard < 430, `pushing hard: ${Math.round(hard)} px/s (the road bike does 430)`);
  // from a standstill: kick by kick - a shove each time the foot's down, none while it's off the ground
  const k0 = newPedState(3000, 3000), gains = [];
  for (let i = 0; i < 12; i++) { const v0 = speed(k0); pedStep(k0, fwd, 0.05, road, mods); gains.push([speed(k0) - v0, k0.kp]); }
  assert.ok(gains.filter(([g, kp]) => kp > KICK.reach && kp < KICK.drive).every(([g]) => g > 2), 'the foot on the ground: speed');
  assert.ok(gains.filter(([g, kp]) => kp >= KICK.back).every(([g]) => g <= 0), 'the foot back on the deck: rolling on');
  // let go mid-kick: the kick finishes (the foot back on the tail), then no more
  const r = step(newPedState(3000, 3000), road, fwd, 0.3);
  assert.ok(r.kp > 0 && r.kp < KICK.back);
  pedStep(r, none, 0.05, road, mods);
  assert.ok(r.kp > 0, 'let go mid-kick: the foot comes back first');
  step(r, road, none, 0.6);
  assert.equal(r.kp, -1, 'then rolling, not kicking');
  const x0 = s.x; step(s, road, none, 3);
  assert.ok(s.x - x0 > 500 && speed(s) > 150, `let go, it coasts: ${Math.round(s.x - x0)} px in 3 s, still ${Math.round(speed(s))} px/s`);
  let slowest = 1e9;
  for (let i = 0; i < 30; i++) { step(s, road, back, 0.05); slowest = Math.min(slowest, speed(s)); }
  assert.ok(slowest < 15, `pulled back: the foot brakes it all but to a stop (${Math.round(slowest)} px/s)`);
  assert.ok(Math.cos(s.a) < -0.9 && s.vx < 0, 'then a kick-turn round, and pushing off back the other way');
  const g = step(newPedState(3000, 3000), road, fwd, 3); step(g, grass, fwd, 0.5);
  assert.ok(speed(g) < 40, `onto the grass the wheels dig in (${Math.round(speed(g))} px/s)`);
  assert.equal(boardGround(T.ROAD), 0); assert.equal(boardGround(T.SIDEWALK), 0); assert.equal(boardGround(T.PLAZA), 0); assert.equal(boardGround(T.DOCK), 1);
  assert.equal(boardGround(T.GRASS), 2); assert.equal(boardGround(T.SAND), 2); assert.equal(boardGround(T.DIRT), 2);
  // a turn: the deck comes round slower at full speed than rolling slowly
  const turnRate = (v) => { const q = newPedState(3000, 3000); q.vx = v; const a0 = q.a; step(q, road, { bits: 0, mx: 0, my: 1, aim: 0 }, 0.2); return Math.abs(q.a - a0) / 0.2; };
  assert.ok(turnRate(240) < turnRate(60), `carves wider at speed (${turnRate(240).toFixed(2)} rad/s at 240, ${turnRate(60).toFixed(2)} at 60)`);
  // the ollie: up for its air time, the speed carried, the stick can't push in the air
  const o = step(newPedState(3000, 3000), road, fwd, 3), v0 = speed(o);
  pedStep(o, { ...fwd, bits: IN.DIVE }, 0.05, road, mods);
  assert.ok(o.rollT > 0, 'the dive button pops an ollie');
  step(o, road, fwd, 0.3);
  assert.ok(o.rollT > 0 && Math.abs(speed(o) - v0) < 15, 'in the air: carried on at the same speed');
  step(o, road, fwd, 0.4);
  assert.equal(o.rollT, 0, 'and down again');
  // in the rain the wheels let a carve slide
  const slide = (wet) => { const q = step(newPedState(3000, 3000), road, fwd, 3, mods); step(q, road, { bits: 0, mx: 0, my: 1, aim: 0 }, 0.4, { ...mods, wet }); return Math.abs(Math.sin(Math.atan2(q.vy, q.vx) - q.a)) * speed(q); };
  assert.ok(slide(true) > slide(false) * 1.5, 'wet: the carve slides more');
});

// ---- on and off, the look on the wire ------------------------------------------------------------------------------
test('the vehicle button: on the board where there\'s no car to get into, off again; the rider\'s look and flags on the wire', () => {
  assert.ok(ROAD, 'a long straight road');
  const p = rider(ROAD.x + 300, ROAD.y);
  const ped = p.ped, v0 = ped.appVer || 0;
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(ped), 'on the board');
  const d = _descriptor(ped);
  assert.equal(d.gt, 'skate'); assert.equal(d.pp, 'board'); assert.equal(d.bd, 1);
  assert.ok((ped.appVer || 0) > v0, 'the look sent again');
  assert.ok(players.pedMods(W, ped).board, 'the step rides the board');
  hold(p, 2, 1, 0);
  assert.ok(speed(ped) > PED.aSprint, `pushing along the road: ${Math.round(speed(ped))} px/s`);
  assert.ok(players.pedFlags(W, ped) & PF.SPRINT, 'pushing: the SPRINT flag (the pushing frames)');
  hold(p, 0.1, 1, 0, 0, IN.DIVE);
  assert.ok(players.pedFlags(W, ped) & PF.ROLL, 'an ollie: the ROLL flag');
  hold(p, 0.8, 0, 0);
  assert.ok(!(players.pedFlags(W, ped) & PF.ROLL), 'landed');
  assert.ok(!(players.pedFlags(W, ped) & PF.SPRINT) && speed(ped) > 100, 'coasting: no push frames, still rolling');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(ped), 'off again');
  const d2 = _descriptor(ped);
  assert.ok(!d2.bd && d2.gt !== 'skate' && d2.pp !== 'board', 'the look back to walking');
  assert.equal(p.profile.inventory.skateboard, 1, 'the board still in the bag');
  // from the bag: on, and off
  economy.useItem(W, p, 'skateboard');
  assert.ok(skate.riding(ped), 'used from the bag: on');
  economy.useItem(W, p, 'skateboard');
  assert.ok(!skate.riding(ped), 'and off');
  leave(p);
});

test('no board, no ride; not on grass, in the water or indoors; a car beside you takes you off the board and into it', () => {
  const p = rider(ROAD.x + 600, ROAD.y, { board: false });
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(p.ped), 'no skateboard in the bag: nothing');
  assert.match(skate.blocked(W, p, p.ped), /need a skateboard/);
  p.profile.inventory.skateboard = 1;
  // rough ground, the water, indoors
  const find = (pred) => { for (let ty = M.y0 + 10; ty < M.y0 + M.h - 10; ty += 3) for (let tx = M.x0 + 10; tx < M.x0 + M.w - 10; tx += 3) if (pred(M.tileAt(tx, ty))) return [(tx + 0.5) * TILE, (ty + 0.5) * TILE]; return null; };
  for (const [what, t, re] of [['grass', T.GRASS, /rough/], ['water', T.WATER, /water/], ['a shop floor', T.FLOOR, /indoors/]]) {
    const at = find((q) => q === t);
    if (!at) continue;
    teleport(W, p.ped, at[0], at[1]);
    assert.match(skate.blocked(W, p, p.ped) || '', re, `${what}: not here`);
  }
  // a car right there: off the board and in
  teleport(W, p.ped, ROAD.x + 600, ROAD.y);
  assert.ok(skate.hopOn(W, p, p.ped));
  const car = W.spawnVehicle('sedan', p.ped.x + 30, p.ped.y, 0, { parked: true });
  car.owner = p.pid;   // (your own: no Safety mode prompt)
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(p.ped), 'off the board');
  assert.equal(p.ped.vehId, car.id, 'and into the car');
  vehicles.exitVehicle(W, p.ped); W.remove(car);
  leave(p);
});

test('riding onto grass you step off; into a wall hard you bail - down, a little hurt, the board flying off, still yours', () => {
  // a pavement or plaza run of 10 tiles ending at a building's wall, and one ending at grass
  const runTo = (end) => {
    for (let ty = M.y0 + 20; ty < M.y0 + M.h - 20; ty++) for (let tx = M.x0 + 20; tx < M.x0 + M.w - 20; tx++) {
      if (!end(M.tileAt(tx, ty))) continue;
      let ok = true;
      for (let k = 1; k <= 10 && ok; k++) for (const dy of [-1, 0, 1]) if (boardGround(M.tileAt(tx - k, ty + dy)) !== 0) ok = false;
      if (ok) return [(tx - 10 + 0.5) * TILE, (ty + 0.5) * TILE];
    }
    return null;
  };
  const toGrass = runTo((t) => t === T.GRASS);
  if (toGrass) {
    const p = rider(toGrass[0], toGrass[1]);
    hold(p, 0.1, 1, 0, 0, IN.VEHICLE);
    assert.ok(skate.riding(p.ped));
    hold(p, 3, 1, 0);
    assert.ok(!skate.riding(p.ped), 'rolled onto the grass: stepped off');
    assert.ok(!(W.time < p.ped.downUntil), 'on your feet');
    leave(p);
  }
  const toWall = runTo((t) => t === T.BUILDING);
  assert.ok(toWall, 'a run up to a wall');
  const p = rider(toWall[0], toWall[1]);
  const hp0 = p.ped.hp;
  hold(p, 0.1, 1, 0, 0, IN.VEHICLE);
  const seen = [];
  const emit = W.emit.bind(W);
  W.emit = (x, y, ev) => { seen.push(ev.e); return emit(x, y, ev); };
  hold(p, 3, 1, 0, IN.SPRINT);
  W.emit = emit;
  assert.ok(!skate.riding(p.ped), 'thrown off');
  assert.ok(seen.includes('bail'), 'the bail: the board flies off');
  assert.ok(p.ped.hp < hp0, `hurt a little (${hp0} -> ${p.ped.hp})`);
  assert.ok(hp0 - p.ped.hp <= 25, 'only a little');
  assert.equal(p.profile.inventory.skateboard, 1, 'the board is still yours');
  run(W, 2);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(p.ped), 'up again, and back on it');
  leave(p);
});

test('knocked down on the board: off it; the shops sell boards; the poses build', () => {
  const p = rider(ROAD.x + 900, ROAD.y);
  hold(p, 0.1, 1, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(p.ped));
  p.ped.downUntil = W.time + 1;
  hold(p, 0.1, 0, 0);
  assert.ok(!skate.riding(p.ped), 'knocked down: off the board');
  leave(p);
  // where you buy one
  assert.ok(ITEMS.skateboard && ITEMS.skateboard.tool && ITEMS.skateboard.board);
  assert.ok(SHOPS.sports.buy.some((o) => o.id === 'skateboard' && o.price === SKATEBOARD_PRICE), 'the sports shops');
  const q = joinPlayer(W, { cash: 500 }).p;
  for (const store of ['kickflip', 'surf']) {
    const menu = economy.buildMenu(W, q, { id: 9999, kind: 'clothing', store, label: 'Test', x: 0, y: 0 });
    assert.ok(menu.opts.some((o) => o.id === `i:skateboard:${SKATEBOARD_PRICE}:1`), `the ${store} shop sells a board`);
  }
  leave(q);
  // the rider's poses: the kick (8), rolling (1), the ollie (3) - each frame its own
  assert.equal(POSES.skate, 8); assert.equal(POSES.skatec, 1); assert.equal(POSES.skateair, 3);
  const app = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee', bd: 1 };
  const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h; };
  const frames = new Set([sum(pedSprite(app, 'skatec', 2, 0, 0, { ar: 'casual' })), ...[0, 1, 2].map((f) => sum(pedSprite(app, 'skateair', 2, f, 0, { ar: 'casual' })))]);
  assert.equal(frames.size, 4, 'rolling and the three ollie frames all differ');
});

// ---- parts 2 and 3: the tricks (shared/skate.js - the page predicts them the same), their score, the sessions ---------
// a map of its own: a road north of tile row 100, a pavement south of it (the kerb between), the props given
function kerbMap(props = []) {
  const tileAt = (tx, ty) => (ty < 100 ? T.ROAD : T.SIDEWALK);
  return { w: 1e5, h: 1e5, tileAt, tileAtPx: (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE)), inside: () => true, idx: (x, y) => y * 100000 + x, solidProps: new Map(), propSolid: new Map(), levels: null, frame: null, props };
}
const RIDE = { canMove: true, canSprint: true, speedMul: 1, analog: true, board: true, canSwim: true };
const steps = (s, m, inp, n) => { for (let i = 0; i < n; i++) pedStep(s, typeof inp === 'function' ? inp(s) : inp, 0.05, m, RIDE); return s; };
const evs = (s) => s.skEv.map((e) => e.e);
const grinding = (s) => s.bm === 1 || s.bm === 3;

test('tricks: an ollie along the kerb lands on it and grinds - the stick across it keeps the balance, without it you fall; off the end you drop', () => {
  assert.ok(boardOn(), 'the board\'s step and its tricks are in (shared/board.js: server/systems/skate.js loads it)');
  const m = kerbMap(), go = { bits: 0, mx: 1, my: 0, aim: 0 };
  const ride = () => { const s = newPedState(3000, 100 * TILE + 6); s.skEv = []; steps(s, m, go, 60); pedStep(s, { ...go, bits: IN.DIVE }, 0.05, m, RIDE); return s; };
  // balanced: the stick pushed away from the way it tips (shared/skate.js balance: + to the left of the way you go)
  const s = ride();
  let on = 0, t = 0;
  for (let i = 0; i < 160 && !s.skFall; i++) { pedStep(s, { ...go, my: grinding(s) ? Math.sign(s.bb) * Math.min(1, Math.abs(s.bb) * 3) : 0 }, 0.05, m, RIDE); if (grinding(s)) { on += 0.05; assert.ok(Math.abs(s.y - 100 * TILE) < 0.01, 'on the kerb\'s line'); } t += 0.05; }
  assert.ok(on > 2, `grinding the kerb ${on.toFixed(1)} s, on along its runs from chunk to chunk`);
  assert.ok(!s.skFall, 'balanced: no fall');
  assert.deepEqual(evs(s).slice(0, 3), ['grind', 'grindEnd', 'land'], 'onto it, off it when it\'s too slow, down');
  assert.equal(SK.trickOf(s.skEv[0].k).kind, 'grind');
  // left alone the balance tips over
  const q = ride();
  for (let i = 0; i < 160 && !q.skFall; i++) pedStep(q, go, 0.05, m, RIDE);
  assert.equal(q.skFall, 'grind', 'no help on the stick: you fall off the rail');
  // a ledge's end: off it and down
  const L = kerbMap([{ t: 'ledge', x: 3200, y: 120 * TILE, w: 160 }]), r = newPedState(2300, 120 * TILE + 4); r.skEv = [];
  steps(r, L, go, 40); while (r.x < 3080) pedStep(r, go, 0.05, L, RIDE);
  pedStep(r, { ...go, bits: IN.DIVE }, 0.05, L, RIDE);
  for (let i = 0; i < 40 && !r.skFall; i++) pedStep(r, { ...go, my: grinding(r) ? Math.sign(r.bb) : 0 }, 0.05, L, RIDE);
  assert.ok(evs(r).includes('grind') && r.skEv.find((e) => e.e === 'grindEnd').why === 'end', 'up on the ledge, along it, off its end');
  assert.ok(r.x > 3200 + 75 && !grinding(r), 'past it');
});

test('tricks: the trick button pops a flip (the stick picks it), a flip not round when you land bails you; a manual; a kicker\'s air and a grab held', () => {
  const m = kerbMap(), go = { bits: 0, mx: 1, my: 0, aim: 0 };
  const s = newPedState(3000, 120 * TILE); s.skEv = [];
  steps(s, m, go, 40);
  // (from the ground: ahead, left, right - the stick pulled back on the ground is a manual; in an ollie, a heelflip)
  for (const [mx, my, k, oll] of [[1, 0, 'kickflip'], [0.1, -1, 'shoveit'], [0.1, 1, 'treflip'], [-1, 0, 'heelflip', 1]]) {
    s.skEv = [];
    if (oll) { pedStep(s, { ...go, bits: IN.DIVE }, 0.05, m, RIDE); pedStep(s, { bits: 0, mx: 1, my: 0, aim: 0 }, 0.05, m, RIDE); }
    pedStep(s, { bits: IN.FIRE, mx, my, aim: 0 }, 0.05, m, RIDE);
    assert.ok(s.rollT > 0, 'popped');
    steps(s, m, { bits: 0, mx: 0.1, my: 0 }, 16);
    assert.ok(!s.skFall, `${k}: landed`);
    const tr = s.skEv.find((e) => e.e === 'trick');
    assert.equal(tr && SK.trickOf(tr.k).id, k, `the stick ${mx},${my}: a ${k}`);
    steps(s, m, go, 10);
  }
  // a flip popped too late in an ollie: not round when you land
  pedStep(s, { ...go, bits: IN.DIVE }, 0.05, m, RIDE);
  steps(s, m, go, 8);
  pedStep(s, { ...go, bits: IN.FIRE }, 0.05, m, RIDE);
  steps(s, m, go, 6);
  assert.equal(s.skFall, 'flip', 'landed mid-flip: a bail');
  // a manual: the trick button with the stick pulled back, held on by the stick along the deck; the dive button pops out
  const q = newPedState(3000, 120 * TILE); q.skEv = [];
  steps(q, m, go, 40);
  pedStep(q, { bits: IN.FIRE, mx: -1, my: 0, aim: 0 }, 0.05, m, RIDE);
  assert.equal(q.bm, 2, 'on the back wheels');
  steps(q, m, (z) => { const f = Math.max(-1, Math.min(1, z.bb * 3)); return { bits: 0, mx: Math.cos(z.a) * f, my: Math.sin(z.a) * f, aim: 0 }; }, 30);
  assert.equal(q.bm, 2, 'balanced: still in it');
  pedStep(q, { ...go, bits: IN.DIVE }, 0.05, m, RIDE);
  assert.ok(q.bm === 0 && q.rollT > 0 && q.skEv.some((e) => e.e === 'manualEnd'), 'popped out of it into an ollie');
  // a kicker ridden at speed: a big air, and in it a grab held, let go before the landing
  const K2 = kerbMap([{ t: 'kicker', x: 3000, y: 140 * TILE }]), k = newPedState(3000, 140 * TILE + 320); k.a = -Math.PI / 2; k.skEv = [];
  const up = { bits: 0, mx: 0, my: -1, aim: 0 };
  for (let i = 0; i < 60 && !(k.rollT > 0); i++) pedStep(k, up, 0.05, K2, RIDE);
  assert.ok(k.airK === 1 && k.airT > SK.SKATE.grab, `off the kicker: ${k.airT.toFixed(2)} s up`);
  steps(k, K2, { ...up, bits: IN.FIRE }, 6);
  assert.ok(SK.trickOf(k.tk) && SK.trickOf(k.tk).kind === 'grab', 'held: a grab');
  while (k.rollT > 0.25) pedStep(k, { ...up, bits: IN.FIRE }, 0.05, K2, RIDE);
  steps(k, K2, up, 8);
  assert.ok(!k.skFall && evs(k).includes('grabEnd') && evs(k).includes('land'), 'let go, and down on the wheels');
});

test('tricks: up a quarter pipe straight and back down the way you came; the score - combos banked as you roll on, a gap, the special meter, a bail loses the combo', () => {
  const Q = kerbMap([{ t: 'qpipe', x: 3000, y: 140 * TILE, w: 192 }]), s = newPedState(3000, 140 * TILE + 260); s.a = -Math.PI / 2; s.skEv = [];
  let top = 1e9, wasUp = false;
  for (let i = 0; i < 80; i++) { pedStep(s, { bits: 0, mx: 0, my: s.rollT > 0 || wasUp ? 0 : -1, aim: 0 }, 0.05, Q, RIDE); top = Math.min(top, s.y); if (s.airK === 2) wasUp = true; }
  assert.ok(wasUp && top < 140 * TILE && top > 140 * TILE - 51, `up the ramp to ${Math.round(140 * TILE - top)} px past its middle, short of the wall behind it`);
  assert.ok(s.vy > 0 && Math.sin(s.a) > 0.9, 'and back down it, the deck turned round');
  // the server's score: a flip and a manual in one combo, banked once you roll on
  const p = rider(ROAD.x + 300, ROAD.y);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  hold(p, 2, 1, 0);
  const sk = () => skate.meInfo(W, p);
  hold(p, 0.05, 1, 0, 0, IN.FIRE);
  hold(p, 0.7, 0.1, 0);
  assert.ok(sk().c && sk().c.n === 1 && sk().c.l[0] === 'Kickflip', `the combo going: ${JSON.stringify(sk().c)}`);
  hold(p, 0.05, -1, 0, 0, IN.FIRE);
  assert.equal(p.ped.bm, 2, 'into a manual');
  for (let i = 0; i < 16 && p.ped.bm === 2; i++) { const f = Math.max(-1, Math.min(1, p.ped.bb * 3)); hold(p, 0.05, Math.cos(p.ped.a) * f, Math.sin(p.ped.a) * f); }
  hold(p, 0.05, 1, 0, 0, IN.DIVE);
  hold(p, 1.4, 0.1, 0);
  assert.ok(!sk().c && sk().s > 0, `rolled on: banked (${sk().s})`);
  const banked = sk().s;
  assert.ok(banked >= (SK.TRICKS[1].pts + SK.TRICKS[SK.MANUAL].pts) * 2, `the points times the tricks: ${banked}`);
  assert.ok(sk().sp > 0, 'the special meter filling');
  assert.equal(p.profile.skateBest, banked, 'the best combo kept');
  // a trick done again in one combo is worth half; a bail loses the combo
  hold(p, 0.05, 1, 0, 0, IN.FIRE); hold(p, 0.65, 0.1, 0);
  hold(p, 0.05, 1, 0, 0, IN.FIRE); hold(p, 0.45, 0.1, 0);
  const c = sk().c;
  assert.ok(c && c.n === 2 && c.p === Math.round(SK.TRICKS[1].pts * 1.5), `two kickflips: ${JSON.stringify(c)}`);
  skate.bail(W, p.ped, 0, false);
  assert.ok(!skate.riding(p.ped) && p.sk.combo === null && p.sk.score === banked, 'bailed: off the board, the combo gone, the score kept');
  // a street gap: an ollie from a pavement over a road to the pavement across (shared/skate.js roadTilesBetween)
  const fakeW = { map: kerbMap() };
  assert.ok(SK.roadTilesBetween(fakeW.map, 3000, 100 * TILE + 8, 3000, 95 * TILE) >= 4 && SK.walkway(fakeW.map, 3000, 100 * TILE + 8) && !SK.walkway(fakeW.map, 3000, 95 * TILE));
  leave(p);
});

test('skate sessions: the action button at a skate spot on your board starts one (and leaves you on it); banked combos score it; the goals pay; the spot keeps its best', () => {
  const p = rider(ROAD.x + 700, ROAD.y);
  const spots = M.skateSpots;
  M.skateSpots = [{ name: 'Test Spot', x: Math.floor(ROAD.x / TILE) + 15, y: Math.floor(ROAD.y / TILE) - 6, w: 20, h: 12, seats: [] }];
  try {
    hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
    assert.ok(skate.riding(p.ped));
    const it = players.findInteraction(W, p);
    assert.match(it.label, /skate session at Test Spot/);
    hold(p, 0.1, 0, 0, 0, IN.ACTION);
    assert.ok(skate.riding(p.ped), 'still on the board');
    assert.ok(p.skSession && p.skSession.spot === 'Test Spot', 'the session on');
    const cash0 = p.profile.cash;
    hold(p, 1, 1, 0);
    for (let i = 0; i < 5; i++) { hold(p, 0.05, [1, 0.1, 0.1, 1, 0.1][i], [0, -1, 1, 0, -1][i], 0, IN.FIRE); hold(p, 0.65, 0.1, 0); }
    hold(p, 1, 0.1, 0);
    assert.ok(p.skSession.score > 0, `the session's score: ${p.skSession.score}`);
    assert.ok(p.skSession.goals.find((g) => g.k === 'tricks').done && p.profile.cash > cash0, 'a five-trick combo: the goal, paid');
    assert.ok(skate.meInfo(W, p).ses.t > 0, 'its clock on the page');
    p.skSession.until = W.time + 0.1;
    const score = p.skSession.score;
    hold(p, 0.3, 0, 0);
    assert.equal(p.skSession, null, 'time\'s up');
    assert.equal(W.skRecords['Test Spot'].score, score, 'the spot\'s best');
    assert.equal(p.profile.skateSpots['Test Spot'], score, 'and yours');
  } finally { M.skateSpots = spots; leave(p); }
});

test('the kick\'s frames and the tricks\' poses build, each frame its own; the board\'s state rides the snapshot', () => {
  assert.equal(POSES.skate, 8);
  for (const [k, n] of [['skflip', 12], ['skshove', 6], ['sktre', 6], ['skgrab', 4], ['skgrind', 4], ['skmanual', 2]]) assert.equal(POSES[k], n, k);
  const app = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee', bd: 1 };
  const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h; };
  for (const [pose, n] of [['skate', 8], ['skflip', 6], ['skgrab', 4], ['skgrind', 4]]) {
    const set = new Set(); for (let f = 0; f < n; f++) set.add(sum(pedSprite(app, pose, 2, f, 0, { ar: 'casual' })));
    assert.equal(set.size, n, `${pose}: ${n} frames, all different`);
  }
  // the board's state through boardOut / the snapshot / boardIn
  const s = { kp: 0.42, bg: 123456, bm: 3, bb: -0.37, bT: 1.25, airT: 0.9, airH: 33, h0: 12, airK: 1, tk: 9, tt: 0.4, vg: 210, gh: 14 };
  const o = boardOut(s), w = new SnapshotWriter(4);
  w.begin(1, 1, 0, 0, CTRL.PED, 1, { x: 1, y: 2, a: 0, vx: 0, vy: 0, stamina: 50, rollT: 0, speedMul: 1, lz: 0, ...o }, 64, 0);
  const snap = decodeSnapshot(new DataView(w.finish().buffer));
  const back = boardIn({}, snap.self);
  for (const k of Object.keys(s)) assert.ok(Math.abs(back[k] - s[k]) < 1e-3, `${k}: ${back[k]} (sent ${s[k]})`);
});
