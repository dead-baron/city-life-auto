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
import { pedStep, newPedState, PED, BOARD, boardGround } from '../shared/physics.js';
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
test('the board: faster than a sprint and slower than a bike pushing; coasts a long way; brakes; stops on grass; carves wider at speed', () => {
  const mods = { canMove: true, canSprint: true, speedMul: 1, analog: true, board: true, canSwim: true };
  const at = (tile) => ({ w: 1e5, h: 1e5, tileAt: () => tile, tileAtPx: () => tile, solidProps: new Map(), levels: null, inside: () => true, idx: () => 0, frame: null });
  const step = (s, m, inp, t, md = mods) => { for (let i = 0; i < Math.round(t * 20); i++) pedStep(s, inp, 0.05, m, md); return s; };
  const road = at(T.ROAD), grass = at(T.GRASS);
  const fwd = { bits: 0, mx: 1, my: 0, aim: 0, seq: 0 }, none = { bits: 0, mx: 0, my: 0, aim: 0 }, back = { bits: 0, mx: -1, my: 0, aim: 0 };
  let s = step(newPedState(3000, 3000), road, fwd, 4);
  const cruise = speed(s);
  assert.ok(cruise > PED.aSprint && cruise <= BOARD.push + 1, `pushing: ${Math.round(cruise)} px/s, faster than a sprint (${PED.aSprint})`);
  assert.ok(s.push === false || s.push === true);
  const hard = speed(step(newPedState(3000, 3000), road, { ...fwd, bits: IN.SPRINT }, 4));
  assert.ok(hard > cruise + 30 && hard < 330, `pushing hard: ${Math.round(hard)} px/s (the commuter bike does 330)`);
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
  // the rider's poses: pushing (4), rolling (1), the ollie (3) - each frame its own
  assert.equal(POSES.skate, 4); assert.equal(POSES.skatec, 1); assert.equal(POSES.skateair, 3);
  const app = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee', bd: 1 };
  const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h; };
  const frames = new Set([sum(pedSprite(app, 'skatec', 2, 0, 0, { ar: 'casual' })), ...[0, 1, 2].map((f) => sum(pedSprite(app, 'skateair', 2, f, 0, { ar: 'casual' })))]);
  assert.equal(frames.size, 4, 'rolling and the three ollie frames all differ');
});
