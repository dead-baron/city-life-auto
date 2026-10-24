// Skateboarding, part 1 (the owner, 2026-10-17; 2026-10-24: "just making it like other vehicles would work best"): a
// skateboard is a vehicle lying in the world - a rack at each skate park, a few by the skate shops and the boardwalks,
// yours bought at a skate, surf or sports shop and set down by the door; the vehicle button by one steps you on, and again
// off (it's left at your feet). On the board: push, carve, coast, brake and ollie (shared/physics.js BOARD - the page
// predicts it the same); faster than running, not as fast as a bike; it rolls on anything paved, and on grass you step
// off. Run into a wall hard and you bail. The rider's look on the wire. A board in an old bag: your own board now.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, straightRoad } from './helpers.js';
import { T, TILE, PF } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { SKATEBOARD_PRICE } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { K } from '../shared/constants.js';
import * as traffic from '../server/systems/traffic.js';
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
// a player at (x, y) with a skateboard lying at their feet (opts.board false: none)
function rider(x, y, opts = {}) {
  const { p } = joinPlayer(W, { cash: 500 });
  teleport(W, p.ped, x, y);
  p.ped.vx = 0; p.ped.vy = 0; p.ped.a = 0;
  if (opts.board !== false) { const v = W.spawnVehicle('skateboard', x, y + 14, 0, { npcOwned: false }); v.parked = false; }
  return p;
}
const boardsNear = (x, y, r = 60) => W.query(x, y, r, K.VEH).filter((v) => v.def.board && !v.removed);
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
test('a skateboard on the ground: the vehicle button gets you on it (taken up off the ground), off again (left at your feet); the rider\'s look and flags on the wire', () => {
  assert.ok(ROAD, 'a long straight road');
  assert.ok(VEHICLES.skateboard && VEHICLES.skateboard.board && !ITEMS.skateboard, 'a vehicle, not a thing in the bag');
  assert.ok(!SHOPS.sports.buy.some((o) => o.id === 'skateboard'), 'not on a shop\'s shelf of things');
  const p = rider(ROAD.x + 300, ROAD.y);
  const ped = p.ped, v0 = ped.appVer || 0;
  assert.equal(boardsNear(ped.x, ped.y).length, 1, 'a board lying there');
  assert.equal(players.findInteraction(W, p).label, 'Get on the skateboard', 'the prompt');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(ped), 'on the board');
  assert.equal(boardsNear(ped.x, ped.y).length, 0, 'taken up off the ground');
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
  hold(p, 1.5, -1, 0);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(ped), 'off again');
  const d2 = _descriptor(ped);
  assert.ok(!d2.bd && d2.gt !== 'skate' && d2.pp !== 'board', 'the look back to walking');
  const [b] = boardsNear(ped.x, ped.y, 40);
  assert.ok(b && Math.hypot(b.x - ped.x, b.y - ped.y) < 30, 'the board left at your feet');
  assert.ok(b.despawnable && !b.owner && !b.parked, 'a park\'s board, nobody\'s: gone once nobody\'s about');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(ped), 'and back on it');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  leave(p);
});

test('no board, no ride; not on grass, in the water or indoors; a car beside you takes you off the board and into it', () => {
  const p = rider(ROAD.x + 600, ROAD.y, { board: false });
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(p.ped), 'no skateboard by you: nothing (the bag has none to use)');
  // rough ground, the water, indoors
  const find = (pred) => { for (let ty = M.y0 + 10; ty < M.y0 + M.h - 10; ty += 3) for (let tx = M.x0 + 10; tx < M.x0 + M.w - 10; tx += 3) if (pred(M.tileAt(tx, ty))) return [(tx + 0.5) * TILE, (ty + 0.5) * TILE]; return null; };
  for (const [what, t, re] of [['grass', T.GRASS, /rough/], ['water', T.WATER, /water/], ['a shop floor', T.FLOOR, /indoors/]]) {
    const at = find((q) => q === t);
    if (!at) continue;
    teleport(W, p.ped, at[0], at[1]);
    assert.match(skate.blocked(W, p, p.ped) || '', re, `${what}: not here`);
    const v = W.spawnVehicle('skateboard', at[0], at[1], 0, { npcOwned: false });
    assert.ok(!skate.mount(W, p, p.ped, v) && !v.removed, `${what}: the board stays where it lies`);
    W.remove(v);
  }
  // a car right there: off the board and in (the board left lying)
  teleport(W, p.ped, ROAD.x + 600, ROAD.y);
  const v = W.spawnVehicle('skateboard', p.ped.x, p.ped.y, 0, { npcOwned: false });
  assert.ok(skate.mount(W, p, p.ped, v));
  const car = W.spawnVehicle('sedan', p.ped.x + 40, p.ped.y, 0, { parked: true });
  car.owner = p.pid;   // (your own: no Safety mode prompt)
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(p.ped), 'off the board');
  assert.equal(p.ped.vehId, car.id, 'and into the car');
  assert.equal(boardsNear(car.x, car.y, 90).length, 1, 'the board left on the ground');
  vehicles.exitVehicle(W, p.ped); W.remove(car);
  for (const b of boardsNear(car.x, car.y, 120)) W.remove(b);
  leave(p);
});

test('riding onto grass you step off; into a wall hard you bail - down, a little hurt, the board flying off and landing where it stops', () => {
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
  run(W, 2);
  const [b] = boardsNear(p.ped.x, p.ped.y, 170);
  assert.ok(b, 'down again where it stopped');
  teleport(W, p.ped, b.x, b.y - 16);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(p.ped), 'up again, and back on it');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  for (const q of boardsNear(p.ped.x, p.ped.y, 80)) W.remove(q);
  leave(p);
});

test('knocked down on the board: off it; the board\'s a short hop, slower than a bike; the poses build', () => {
  const p = rider(ROAD.x + 900, ROAD.y);
  hold(p, 0.1, 1, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(p.ped));
  p.ped.downUntil = W.time + 1;
  hold(p, 0.1, 0, 0);
  assert.ok(!skate.riding(p.ped), 'knocked down: off the board');
  leave(p);
  // (the owner, 2026-10-24: "too powerful ... people will always be using skateboards to get around faster")
  for (const id of ['bicycle', 'cruiser', 'bmx', 'mtb']) assert.ok(BOARD.push < VEHICLES[id].max, `cruising slower than a ${VEHICLES[id].name} (${BOARD.push} < ${VEHICLES[id].max})`);
  assert.ok(BOARD.pushHard < VEHICLES.bicycle.max, 'pushing hard (and tiring) still short of the commuter bike');
  // the rider's poses: the kick (8), rolling (1), the ollie (3) - each frame its own
  assert.equal(POSES.skate, 8); assert.equal(POSES.skatec, 1); assert.equal(POSES.skateair, 3);
  const app = { s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee', bd: 1 };
  const sum = (G) => { let h = 0; for (let i = 0; i < G.col.length; i += 3) h = (Math.imul(h, 31) + G.col[i]) | 0; return h; };
  const frames = new Set([sum(pedSprite(app, 'skatec', 2, 0, 0, { ar: 'casual' })), ...[0, 1, 2].map((f) => sum(pedSprite(app, 'skateair', 2, f, 0, { ar: 'casual' })))]);
  assert.equal(frames.size, 4, 'rolling and the three ollie frames all differ');
});

// ---- the boards lying about, yours, the old bag's ------------------------------------------------------------------
test('the boards set out: a rack at each skate park, one or two by the skate and surf shops and the boardwalks - sparse, never on a road', () => {
  const tx = Math.floor(ROAD.x / TILE) + 40, ty = Math.floor(ROAD.y / TILE) - 8;
  const spots0 = M.skateSpots, cache = M._boardSpots;
  M.skateSpots = [{ name: 'Test Park', x: tx, y: ty, w: 14, h: 6, seats: [] }]; delete M._boardSpots;
  try {
    const S = skate.boardSpots(M);
    const park = S.filter((q) => q.kind === 'park');
    assert.equal(park.length, 3, 'a rack of three at the park');
    for (const q of park) assert.ok(q.x >= tx * TILE && q.x < (tx + 14) * TILE && q.y >= ty * TILE - 40 && q.y < (ty + 6) * TILE + 40, 'at the park');
    assert.ok(Math.hypot(park[1].x - park[0].x, park[1].y - park[0].y) < 20, 'side by side');
    const ROADISH = new Set([T.ROAD, T.BRIDGE]);
    for (const q of S) for (const [dx, dy] of [[-13, -6], [13, -6], [-13, 6], [13, 6], [0, 0]]) {
      const t = M.tileAtPx(q.x + dx, q.y + dy);
      assert.ok(!ROADISH.has(t) && boardGround(t) <= 1, `never on a road (${q.kind} at ${Math.round(q.x)},${Math.round(q.y)})`);
    }
    assert.ok(S.filter((q) => q.kind !== 'park').length <= 2 * M.pois.filter((p) => p.kind === 'clothing' || /boardwalk/i.test(p.label || '')).length, 'one or two a shop at most');
    // put out round a player, where nobody's looking
    const p = rider(park[0].x, park[0].y + 120, { board: false });
    p.teleportAt = W.time;
    run(W, 1);
    const out = [...W.entities.values()].filter((v) => v.kind === K.VEH && v.def.board && v.boardSpot !== undefined && S[v.boardSpot].kind === 'park');
    assert.equal(out.length, 3, 'the rack filled');
    assert.ok(out.every((v) => !v.owner && !v.npcOwned), 'free to take');
    // taken and ridden off: its place empty till it's gone for good
    teleport(W, p.ped, out[0].x, out[0].y - 14); p.teleportAt = W.time;
    hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
    assert.ok(skate.riding(p.ped));
    run(W, 1);
    assert.equal([...W.entities.values()].filter((v) => v.kind === K.VEH && v.def.board && v.boardSpot === out[0].boardSpot).length, 0, 'no new one while it\'s ridden');
    hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
    const left = boardsNear(p.ped.x, p.ped.y, 40)[0];
    assert.ok(left && left.despawnable, 'left lying');
    // nobody about: gone (traffic.js manage), and the rack fills again when someone comes back
    for (const o of W.players.values()) if (o.ped) teleport(W, o.ped, o.ped.x + 4000, o.ped.y);   // (everyone: the ghosts of the tests before too)
    run(W, 2);
    assert.ok(!W.get(left.id), 'gone once nobody\'s about');
    void traffic;
    leave(p);
  } finally { M.skateSpots = spots0; if (cache) M._boardSpots = cache; else delete M._boardSpots; }
});

test('your own board: bought at a skate, surf or sports shop and set down by the door; one at a time, brought out at the shop or at home; left lying, it goes home', () => {
  const { p } = joinPlayer(W, { cash: 500 });
  const shop = M.pois.find((q) => q.kind === 'sports') || { id: 9998, kind: 'sports', label: 'Test Sports', x: ROAD.x + 1400, y: ROAD.y + 60, r: 40 };
  for (const store of ['kickflip', 'surf']) {
    const menu = economy.buildMenu(W, p, { id: 9999, kind: 'clothing', store, label: 'Test', x: 0, y: 0 });
    assert.ok(menu.opts.some((o) => o.id === 'bd:buy' && o.price === SKATEBOARD_PRICE), `the ${store} shop sells a board`);
  }
  assert.ok(economy.buildMenu(W, p, shop).opts.some((o) => o.id === 'bd:buy'), 'the sports shops');
  const at = shop.outside || shop;
  teleport(W, p.ped, shop.x, shop.y);
  const cash0 = p.profile.cash;
  economy.handleMenu(W, p, shop.id, 'bd:buy');
  assert.equal(p.profile.cash, cash0 - SKATEBOARD_PRICE, 'paid');
  assert.ok(p.profile.board, 'yours');
  const mine = () => [...W.entities.values()].filter((v) => v.kind === K.VEH && v.def.board && v.owner === p.pid);
  assert.equal(mine().length, 1, 'set down');
  const b = mine()[0];
  assert.ok(Math.hypot(b.x - at.x, b.y - at.y) < 4.5 * TILE, 'by the door (outside a walk-in shop)');
  assert.ok(![T.ROAD, T.FLOOR, T.COUNTER].includes(M.tileAtPx(b.x, b.y)), 'out on the pavement');
  const m2 = economy.buildMenu(W, p, shop);
  assert.ok(!m2.opts.some((o) => o.id === 'bd:buy') && m2.opts.some((o) => o.id === 'bd:out'), 'one board: bring yours out instead');
  assert.equal(vehicles.enterLabel(W, p, b), 'Get on your skateboard');
  // someone else's: theirs to steal (bike theft)
  const { p: q } = joinPlayer(W);
  teleport(W, q.ped, b.x, b.y - 14);
  assert.equal(vehicles.entryInfo(W, q, b).crime, 'bikeTheft');
  assert.match(vehicles.enterLabel(W, q, b), /Ride off on the skateboard - .*Theft/i);
  leave(q);
  // ridden away and stepped off: still yours
  teleport(W, p.ped, b.x, b.y - 14);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(p.ped));
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.equal(mine().length, 1, 'down again, still yours');
  // brought out at the shop again: the one lying about gone - never two
  const far = mine()[0];
  teleport(W, p.ped, shop.x, shop.y);
  economy.handleMenu(W, p, shop.id, 'bd:out');
  assert.equal(mine().length, 1); assert.ok(!W.get(far.id) || mine()[0].id !== far.id, 'the old one gone, a fresh one by the door');
  // left lying where you're nowhere near: home again (and a word about it)
  teleport(W, p.ped, mine()[0].x + 6000, mine()[0].y);
  const said = [], n0 = W.notify.bind(W);
  W.notify = (o, t, tone) => { if (o === p) said.push(t); return n0(o, t, tone); };
  run(W, 2.5);
  W.notify = n0;
  assert.equal(mine().length, 0, 'gone home');
  assert.ok(said.some((t) => /back home/.test(t)), 'and a word about it');
  // the home menu: take it out by your front door
  const homeOpts = [];
  skate.shopOptions(p, homeOpts, true);
  assert.ok(homeOpts.some((o) => o.id === 'bd:out'), 'at home: take your skateboard out');
  leave(p);
});

test('a skateboard in an old bag: yours to keep as your own board (no item left, a word about it); the vehicle button never pulls a board from nowhere', () => {
  const { p } = joinPlayer(W, { cash: 50, inventory: { skateboard: 1, medkit: 1 }, quick: ['skateboard', 'medkit', null, null] });
  assert.ok(!p.profile.inventory.skateboard, 'out of the bag');
  assert.equal(p.profile.inventory.medkit, 1, 'the rest of the bag as it was');
  assert.ok(p.profile.board, 'your own board now');
  assert.ok(!p.profile.quick.includes('skateboard'), 'off the quick wheel');
  const menu = economy.buildMenu(W, p, { id: 9999, kind: 'clothing', store: 'kickflip', label: 'Test', x: 0, y: 0 });
  assert.ok(menu.opts.some((o) => o.id === 'bd:out') && !menu.opts.some((o) => o.id === 'bd:buy'), 'brought out free at a skate shop');
  teleport(W, p.ped, ROAD.x + 1100, ROAD.y);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(p.ped), 'no board lying by you: the vehicle button does nothing');
  leave(p);
});

// ---- parts 2 and 3: the tricks (shared/skate.js - the page predicts them the same), their score, the sessions ---------
// a map of its own: a road north of tile row 100, a pavement south of it (the kerb between), the props given
function kerbMap(props = []) {
  const tileAt = (tx, ty) => (ty < 100 ? T.ROAD : T.SIDEWALK);
  return { w: 1e5, h: 1e5, tileAt, tileAtPx: (x, y) => tileAt(Math.floor(x / TILE), Math.floor(y / TILE)), inside: () => true, idx: (x, y) => y * 100000 + x, solidProps: new Map(), propSolid: new Map(), levels: null, frame: null, props };
}
const RIDE = { canMove: true, canSprint: true, speedMul: 1, analog: true, board: true, canSwim: true };
const steps = (s, m, inp, n) => { for (let i = 0; i < n; i++) pedStep(s, typeof inp === 'function' ? inp(s) : inp, 0.05, m, RIDE); return s; };
const evs = (s) => s.skEv.map((e) => e.w);
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
  assert.ok(evs(r).includes('grind') && r.skEv.find((e) => e.w === 'grindEnd').why === 'end', 'up on the ledge, along it, off its end');
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
    const tr = s.skEv.find((e) => e.w === 'trick');
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
  assert.ok(q.bm === 0 && q.rollT > 0 && q.skEv.some((e) => e.w === 'manualEnd'), 'popped out of it into an ollie');
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

// (the owner, b1c: "you can just walk through the quarter pipe ... riding on skateboard it shows you going transparent
// through the quarter pipe instead of being in front of it")
test('a quarter pipe: its tall part is solid on foot and slow; ridden up fast, up its face to the coping, never past it; the ramps\' surfaces', async () => {
  const { qpipeSolids } = await import('../shared/map.js');
  const QY = 140 * TILE, qp = { t: 'qpipe', x: 3000, y: QY, w: 192 };
  const Q = kerbMap([qp]);
  Q.addSolidProp = (x, y, r) => { const k = Q.idx(Math.floor(x / TILE), Math.floor(y / TILE)); let a = Q.solidProps.get(k); if (!a) Q.solidProps.set(k, (a = [])); const e = { x, y, r, pi: -1, off: false }; a.push(e); return e; };
  qpipeSolids(Q, qp);
  // on foot: walking up to it from the south, held in front of its tall part
  const WALK = { canMove: true, canSprint: true, speedMul: 1, analog: true, canSwim: true };
  for (const x0 of [3000, 3010, 2930, 3080]) {
    const w = newPedState(x0, QY + 120);
    let into = 0;
    for (let i = 0; i < 60; i++) { pedStep(w, { bits: 0, mx: 0, my: -1, aim: 0 }, 0.05, Q, WALK); if (Math.abs(w.x - 3000) < 96 && w.y < QY + 3) into++; }
    assert.equal(into, 0, `on foot from ${x0}: never into its tall part (${Math.round(w.x - 3000)}, ${Math.round(w.y - QY)})`);
    if (Math.abs(w.x - 3000) < 90) assert.ok(SK.rampSurface(Q, w.x, w.y) < 6, 'held on its low toe');
  }
  // walking in from the side along its back: held out too
  const sd = newPedState(3000 + 140, QY - 10);
  let side = 0;
  for (let i = 0; i < 60; i++) { pedStep(sd, { bits: 0, mx: -1, my: 0, aim: 0 }, 0.05, Q, WALK); if (Math.abs(sd.x - 3000) < 96 && sd.y < QY + 3) side++; }
  assert.equal(side, 0, `from the side: never into its tall part (${Math.round(sd.x - 3000)}, ${Math.round(sd.y - QY)})`);
  // ridden up it fast: up the face, the coping its top (the deck and the wall behind never), and back down; no bail
  for (const v0 of [200, 380]) {
    const s = newPedState(3000, QY + 200); s.a = -Math.PI / 2; s.vy = -v0; s.skEv = [];
    let top = 1e9, up = false;
    for (let i = 0; i < 80; i++) { pedStep(s, { bits: 0, mx: 0, my: s.rollT > 0 || up ? 0 : -1, aim: 0 }, 0.05, Q, RIDE); top = Math.min(top, s.y); if (s.airK === 2) up = true; }
    assert.ok(up, `${v0} px/s: up it`);
    assert.ok(!s.boardHit && !s.skFall, `${v0} px/s: no bail`);
    assert.ok(top >= QY - 24 + SK.QP.deck, `${v0} px/s: never past its coping (${Math.round(top - QY)})`);
    assert.ok(s.vy > 0, `${v0} px/s: back down`);
  }
  // rolling into it slowly: stopped by it, not through it
  const sl = newPedState(3000, QY + 60); sl.a = -Math.PI / 2; sl.skEv = [];
  for (let i = 0; i < 40; i++) pedStep(sl, { bits: 0, mx: 0, my: -0.25, aim: 0 }, 0.05, Q, RIDE);
  assert.ok(sl.y > QY + 8, `slow: held at its face (${Math.round(sl.y - QY)})`);
  // the surfaces, as the art shapes them
  assert.ok(SK.rampSurface(Q, 3000, QY + 23) < 1, 'its toe: the ground');
  assert.ok(Math.abs(SK.rampSurface(Q, 3000, QY - 20) - SK.QP.h) < 0.01, 'its deck: its full height');
  const K2 = kerbMap([{ t: 'kicker', x: 3000, y: QY }, { t: 'pyramid', x: 3400, y: QY }]);
  assert.ok(SK.rampSurface(K2, 3000, QY - 16) > 11 && SK.rampSurface(K2, 3000, QY + 16) < 1.5, 'a kicker: up to its lip on the north');
  assert.ok(Math.abs(SK.rampSurface(K2, 3400, QY) - 16) < 0.01 && SK.rampSurface(K2, 3400 - 58, QY) < 2, 'a pyramid: its top, its banks');
  assert.equal(SK.rampSurface(K2, 3200, QY), 0, 'off them: nothing');
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
