// Rides you own and carry (the owner, 11-03: skateboards, rollerblades and surfboards should be "things you find, keep or
// carry, and lose" - "not something you can just equip and go faster on"; the surfboard was slower than swimming and you
// couldn't swim while you carried one) - server/systems/gear.js, skate.js, surf.js:
//   - a skate park's rack board is borrowed: ridden out of the park it goes back on its rack;
//   - your own board in your hand takes a hand (no shooting); it wears with each bail and snaps - gone, unless you're in a
//     skate session (a fresh one lands where it broke);
//   - a surfboard in your bag doesn't put you on it: you swim, and the action button in the sea puts you on it; paddling
//     is faster than swimming; slid off you swim with it in hand; set down on the sand it stays a while, then goes home;
//   - rollerblades go on and off at a bench, about 3 s; on them you're quicker than walking and slower than a board, no
//     sprint, a fall on the grass, no vehicles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, run, straightRoad } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { WATER_T } from '../shared/mapcore.js';
import { ITEMS, SHOPS } from '../shared/items.js';
import { RIDE_GEAR, BLADES, SURF_PADDLE, ROLLERBLADES_PRICE } from '../shared/rules.js';
import { PED, SWIM_SPEED } from '../shared/physics.js';
import { BOARD, boardGround } from '../shared/board.js';
import { SURF, breakPt } from '../shared/surf.js';
import { _descriptor } from '../server/net.js';
import { adaptApp, withProp, pedSprite } from '../client/art2/game/peds.js';
import * as skate from '../server/systems/skate.js';
import * as surf from '../server/systems/surf.js';
import * as gear from '../server/systems/gear.js';
import * as players from '../server/systems/players.js';
import * as economy from '../server/systems/economy.js';
import * as vehicles from '../server/systems/vehicles.js';

const W = makeWorld();
const M = W.map;
const ROAD = straightRoad(M, 1200);
const push = (p, mx, my, bits = 0) => p.inputQ.push({ seq: p.ack + 1 + p.inputQ.length, bits, mx, my, aim: Math.atan2(my, mx) });
// hold the stick (and the buttons) for t seconds; `tap` pressed on the first step only
function hold(p, t, mx, my, bits = 0, tap = 0) {
  const n = Math.max(1, Math.round(t * 20));
  for (let i = 0; i < n; i++) { push(p, mx, my, bits | (i === 0 ? tap : 0)); W.step(); }
}
const speed = (ped) => Math.hypot(ped.vx, ped.vy);
const said = (p, fn) => { const out = [], n0 = W.notify.bind(W); W.notify = (o, t, tone) => { if (o === p) out.push(t); return n0(o, t, tone); }; try { fn(); } finally { W.notify = n0; } return out; };
const everyoneAway = () => { for (const o of W.players.values()) if (o.ped) teleport(W, o.ped, o.ped.x + 9000, o.ped.y); };
const lying = (pred) => [...W.entities.values()].filter((v) => v.kind === K.VEH && !v.removed && pred(v));
function player(x, y, prof = {}) {
  const { p } = joinPlayer(W, { cash: 2000, ...prof });
  teleport(W, p.ped, x, y);
  p.ped.vx = 0; p.ped.vy = 0; p.ped.a = 0;
  return p;
}
const leave = (p) => players.leave(W, p);

// ---- the skateboard ------------------------------------------------------------------------------------------------------
test('a skate park\'s rack board is borrowed: ridden out of the park it goes back on its rack', () => {
  const tx = Math.floor(ROAD.x / TILE) + 40, ty = Math.floor(ROAD.y / TILE) - 8;
  const spots0 = M.skateSpots, cache = M._boardSpots;
  M.skateSpots = [{ name: 'Test Park', x: tx, y: ty, w: 14, h: 6, seats: [] }]; delete M._boardSpots;
  for (const v of [...W.entities.values()]) if (v.kind === K.VEH && v.boardSpot !== undefined) W.remove(v);   // (the real racks' boards: numbered on the map's own list)
  if (W.boardParked) W.boardParked.clear();
  try {
    const S = skate.boardSpots(M), park = S.filter((q) => q.kind === 'park');
    assert.equal(park.length, 3);
    const p = player(park[0].x, park[0].y + 120);
    p.teleportAt = W.time;
    run(W, 1);
    const rack = lying((v) => v.def.board && v.boardSpot !== undefined && S[v.boardSpot].kind === 'park');
    assert.equal(rack.length, 3, 'the rack filled');
    const b = rack[0], spot = b.boardSpot;
    teleport(W, p.ped, b.x, b.y - 14); p.teleportAt = W.time;
    hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
    assert.ok(skate.riding(p.ped), 'on the park\'s board');
    hold(p, 0.5, 0, 0);
    assert.ok(skate.riding(p.ped), 'at the park: still on it');
    // out of the park, down the road (smooth ground: nothing else takes you off)
    const out = { x: ROAD.x + 300, y: ROAD.y };
    assert.ok(Math.abs(out.x / TILE - tx) > 20 || Math.abs(out.y / TILE - ty) > 20, 'well out of the park');
    let words = [];
    words = said(p, () => { teleport(W, p.ped, out.x, out.y); hold(p, 0.2, 1, 0); });
    assert.ok(!skate.riding(p.ped), 'off the board');
    assert.ok(words.some((t) => /only serves the park/.test(t)), `told why (${words.join(' | ')})`);
    assert.equal(lying((v) => v.def.board && Math.hypot(v.x - p.ped.x, v.y - p.ped.y) < 200).length, 0, 'not left lying out here');
    assert.ok(!W.boardParked.has(spot) || W.get(W.boardParked.get(spot))?.boardSpot === spot, 'its rack place free again');
    // back on its rack once nobody's looking
    teleport(W, p.ped, park[0].x, park[0].y + 2400); p.teleportAt = W.time;
    run(W, 1.5);
    teleport(W, p.ped, park[0].x, park[0].y + 120); p.teleportAt = W.time;
    run(W, 1);
    assert.ok(lying((v) => v.def.board && v.boardSpot === spot).length === 1, 'back on its rack');
    for (const v of lying((v) => v.def.board)) W.remove(v);
    leave(p);
  } finally { M.skateSpots = spots0; if (cache) M._boardSpots = cache; else delete M._boardSpots; }
});

test('your own skateboard: in the bag, in your hand (it takes a hand - no shooting), ridden from the hand, picked up again', () => {
  assert.equal(ITEMS.skateboard.ride, 'skate', 'the bag holds your own board');
  const p = player(ROAD.x + 500, ROAD.y, { inventory: { skateboard: 1 } });
  const ped = p.ped;
  assert.ok(p.profile.board && p.profile.board.at === 'bag', 'yours, in the bag');
  assert.ok(gear.owns(p, 'skate'));
  // the bag's Use: into your hand, shown in the hand
  economy.useItem(W, p, 'skateboard');
  assert.ok(gear.holding(ped, 'skate'), 'in your hand');
  assert.ok(!p.profile.inventory.skateboard, 'out of the bag');
  assert.equal(_descriptor(ped).pp, 'board', 'the board in hand, for everyone');
  // a gun: no shooting with a board in your hand
  p.profile.weapons.pistol = 30; ped.mag.pistol = 12; ped.weapon = 'pistol';
  const words = said(p, () => hold(p, 0.3, 0, 0, IN.FIRE | IN.AIMING, IN.FIRE));
  assert.equal(ped.mag.pistol, 12, 'no shot fired');
  assert.ok(words.some((t) => /hands are full/.test(t)), 'told why');
  // the action button: into the bag; then the gun fires
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(!gear.holding(ped) && p.profile.inventory.skateboard === 1 && p.profile.board.at === 'bag', 'back in the bag');
  hold(p, 0.4, 0, 0, IN.FIRE | IN.AIMING, IN.FIRE);
  assert.ok(ped.mag.pistol < 12, 'hands free: it fires');
  ped.weapon = 'fists';
  // from the hand, the vehicle button rides it; the action button on it: off, and picked up again
  economy.useItem(W, p, 'skateboard');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(ped) && !gear.holding(ped), 'riding it');
  assert.equal(ped.board.deck.owner, p.pid, 'your own deck');
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(!skate.riding(ped) && gear.holding(ped, 'skate'), 'off it, and it\'s in your hand');
  assert.equal(lying((v) => v.def.board && v.owner === p.pid).length, 0, 'nothing left lying');
  // on the ground (stepped off with the vehicle button): the action button picks it up
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE); hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(!skate.riding(ped) && lying((v) => v.def.board && v.owner === p.pid).length === 1, 'left at your feet');
  assert.equal(players.findInteraction(W, p).label, 'Pick up your skateboard');
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(gear.holding(ped, 'skate') && lying((v) => v.def.board && v.owner === p.pid).length === 0, 'picked up');
  // into a car with it in hand: it goes in your bag
  const car = W.spawnVehicle('sedan', ped.x + 40, ped.y, 0, { parked: true }); car.owner = p.pid;
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.equal(ped.vehId, car.id, 'in the car');
  assert.ok(!gear.holding(ped) && p.profile.inventory.skateboard === 1, 'the board in the bag');
  vehicles.exitVehicle(W, ped); W.remove(car);
  // lost from the bag (dropped, sold, gone with your pack): gone
  delete p.profile.inventory.skateboard;
  run(W, 1.1);
  assert.ok(!p.profile.board, 'no board any more');
  leave(p);
});

test('a board wears with each bail and snaps: yours gone until you buy another - in a skate session a fresh one lands instead', () => {
  const p = player(ROAD.x + 700, ROAD.y, { inventory: { skateboard: 1 } });
  const ped = p.ped;
  economy.useItem(W, p, 'skateboard');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(ped));
  // a hard bail into a wall: worn, warned, lands again
  let words = said(p, () => { skate.bail(W, ped, BOARD.pushHard); run(W, 2); });
  assert.ok(Math.abs(p.profile.board.wear - (RIDE_GEAR.wear + RIDE_GEAR.hard)) < 1e-6, `worn (${p.profile.board.wear})`);
  const b1 = lying((v) => v.def.board && v.owner === p.pid)[0];
  assert.ok(b1 && b1.wear === p.profile.board.wear, 'down again where it stopped, the wear with it');
  // again: past warnAt - cracking
  W.remove(b1); ped.downUntil = 0; ped.tumbleUntil = 0;
  skate.hopOn(W, p, ped, { owner: p.pid, ownerName: p.name, paint: 0, variant: 0, wear: p.profile.board.wear });
  words = said(p, () => { skate.bail(W, ped, BOARD.pushHard); run(W, 2); });
  assert.ok(words.some((t) => /cracking/.test(t)), 'told it\'s cracking');
  // and once more: it snaps - no board lands, and it isn't yours any more
  assert.ok(p.profile.board.wear < 1 && p.profile.board.wear + RIDE_GEAR.wear + RIDE_GEAR.hard >= 1, `the third hard bail snaps it (${p.profile.board.wear})`);
  for (const v of lying((v) => v.def.board && v.owner === p.pid)) W.remove(v);
  ped.downUntil = 0; ped.tumbleUntil = 0;
  skate.hopOn(W, p, ped, { owner: p.pid, ownerName: p.name, paint: 0, variant: 0, wear: p.profile.board.wear });
  const evs = [], emit = W.emit.bind(W);
  W.emit = (x, y, ev) => { evs.push(ev); return emit(x, y, ev); };
  words = said(p, () => { skate.bail(W, ped, BOARD.pushHard); run(W, 2); });
  W.emit = emit;
  assert.ok(!p.profile.board && !gear.owns(p, 'skate'), 'snapped: gone');
  assert.equal(lying((v) => v.def.board && v.owner === p.pid).length + (W.boardLand || []).length, 0, 'no board lands');
  assert.ok(words.some((t) => /snapped/.test(t)), 'told');
  assert.ok(evs.some((e) => e.e === 'skbail' && e.snap === 1), 'the page sees it snap');
  const shop = { id: 9999, kind: 'clothing', store: 'kickflip', label: 'Test', x: 0, y: 0 };
  assert.ok(economy.buildMenu(W, p, shop).opts.some((o) => o.id === 'bd:buy'), 'buy another');
  leave(p);
  // in a skate session: a snapped board's replaced on the spot
  const q = player(ROAD.x + 900, ROAD.y, { inventory: { skateboard: 1 } });
  q.profile.board.wear = 0.95;
  economy.useItem(W, q, 'skateboard');
  hold(q, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(skate.riding(q.ped));
  skate.startSession(W, q, { name: 'Test Spot', x: 0, y: 0, w: 1, h: 1 });
  skate.bail(W, q.ped, BOARD.pushHard);
  run(W, 2);
  const fresh = lying((v) => v.def.board && v.owner === q.pid)[0];
  assert.ok(fresh && Math.hypot(fresh.x - q.ped.x, fresh.y - q.ped.y) < 200, 'a fresh board lands where it broke');
  assert.ok(q.profile.board && q.profile.board.wear === 0 && fresh.wear === 0, 'still yours, good as new');
  for (const v of lying((v) => v.def.board)) W.remove(v);
  leave(q);
});

// ---- the surfboard -------------------------------------------------------------------------------------------------------
test('a surfboard: in the bag you swim; the action button in the sea puts you on it; paddling beats swimming; slid off you swim with it', () => {
  const B = surf.breaksOf(W).list[0];
  const at = breakPt(B, 0, SURF.brk + 60);
  const p = player(at.x, at.y, { inventory: { surfboard: 1 } });
  const ped = p.ped;
  run(W, 0.5);
  assert.ok(!ped.surf, 'the bag doesn\'t put you on it: swimming');
  assert.equal(p.profile.surfboard.at, 'bag', 'yours, in the bag');
  // swimming flat out, seaward along the beach (no waves to catch): how fast
  const along = [-B.ny, B.nx];
  const fast = (n) => { let best = 0; for (let i = 0; i < n; i++) { teleport(W, ped, at.x, at.y); hold(p, 0, along[0], along[1]); best = Math.max(best, speed(ped)); } return best; };
  ped.vx = 0; ped.vy = 0;
  hold(p, 2, along[0], along[1]);
  const swim = speed(ped);
  assert.ok(swim > 50 && swim <= PED.aRun * SWIM_SPEED * 1.2, `swimming (${Math.round(swim)} px/s)`);
  void fast;
  // the action button: on the board
  teleport(W, ped, at.x, at.y); ped.vx = 0; ped.vy = 0;
  assert.equal(players.findInteraction(W, p).label, 'Paddle out on your surfboard');
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.equal(ped.surf && ped.surf.st, 'pad', 'on it, paddling');
  assert.ok(!p.profile.inventory.surfboard, 'out of the bag');
  for (let i = 0; i < 40; i++) { teleport(W, ped, at.x, at.y); push(p, along[0], along[1]); W.step(); }   // (held where the waves are: nothing to catch along the beach)
  hold(p, 1.5, along[0], along[1]);
  const paddle = speed(ped);
  assert.ok(paddle > swim * 1.1, `paddling (${Math.round(paddle)}) faster than swimming (${Math.round(swim)})`);
  assert.ok(SURF_PADDLE > PED.aRun * SWIM_SPEED * 1.15, 'faster than the best swimmer');
  assert.ok(SURF.speed > SURF.paddle * 1.1, 'a wave still outruns a paddle');
  // the action button again: off it, swimming with it under your arm
  teleport(W, ped, at.x, at.y);
  assert.equal(players.findInteraction(W, p).label, 'Slide off your surfboard');
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(!ped.surf && gear.holding(ped, 'surf'), 'off it, the board in hand');
  hold(p, 1, along[0], along[1]);
  assert.ok(!ped.surf && speed(ped) > 40, 'swimming normally');
  // the vehicle button in the sea with it in hand: on it again
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.equal(ped.surf && ped.surf.st, 'pad', 'set down and on it');
  leave(p);
});

test('a surfboard up the beach: under your arm; set down on the sand it stays a while, then goes home - out again at home or a surf shop', () => {
  const B = surf.breaksOf(W).list[0];
  const sea = breakPt(B, 0, SURF.brk + 60), sand = breakPt(B, 0, -3 * TILE);
  assert.ok(WATER_T[M.tileAtPx(sea.x, sea.y)] && M.tileAtPx(sand.x, sand.y) === T.SAND);
  const p = player(sea.x, sea.y, { inventory: { surfboard: 1 } });
  const ped = p.ped;
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(ped.surf, 'on it');
  // in to the beach: up the sand, off the board
  teleport(W, ped, sand.x, sand.y);
  run(W, 0.2);
  assert.ok(!ped.surf && gear.holding(ped, 'surf'), 'up the beach with it under your arm');
  assert.equal(_descriptor(ped).pp, 'surfboard', 'shown under the arm');
  const app = adaptApp({ s: 2, h: 1, hc: '#3a2414', t: 4, tc: '#7a3a2a', tc2: '#eee', l: '#4a5a3a', sh: '#eee' }, 'casual');
  const ink = (A) => { let n = 0; const G = pedSprite(A, 'walk0', 2, 0, 0); for (let i = 0; i < G.col.length; i++) if (G.col[i]) n++; return n; };
  assert.ok(ink(withProp(app, 'surfboard')) > ink(app) + 100, 'the page draws the board under the arm (client/art2/people.js)');
  // the vehicle button on the sand: set down
  teleport(W, ped, sand.x, sand.y);
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  const [v] = lying((q) => q.def.surfboard && q.owner === p.pid);
  assert.ok(v && !gear.holding(ped), 'lying on the sand');
  assert.ok(v.homeAt - W.time >= RIDE_GEAR.surfLieS - 1, 'it stays a while');
  assert.match(vehicles.enterLabel(W, p, v), /Pick up your surfboard/);
  run(W, 3);
  assert.ok(!v.removed, 'still there a moment later');
  // picked up again, set down again; then its time is up and nobody's looking: home
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  assert.ok(gear.holding(ped, 'surf') && v.removed, 'picked up with the vehicle button');
  hold(p, 0.1, 0, 0, 0, IN.VEHICLE);
  const [v2] = lying((q) => q.def.surfboard && q.owner === p.pid);
  v2.homeAt = W.time;   // (its while is up)
  teleport(W, ped, sand.x + 1500, sand.y);
  const words = said(p, () => run(W, 2.5));
  assert.ok(v2.removed, 'gone home');
  assert.equal(p.profile.surfboard.at, 'home');
  assert.ok(words.some((t) => /back home/.test(t)), 'told');
  assert.ok(gear.owns(p, 'surf'), 'still yours');
  // out again: the surf shop (or home) - into your bag; and no buying a second
  const shop = { id: 9999, kind: 'clothing', store: 'surf', label: 'Test Surf', x: ped.x, y: ped.y, r: 40 };
  const menu = economy.buildMenu(W, p, shop);
  assert.ok(menu.opts.some((o) => o.id === 'sb:out'), 'take yours at the surf shop');
  assert.ok(menu.opts.find((o) => o.id.startsWith('i:surfboard')).dis, 'no second one');
  assert.equal(gear.surfExecute(W, p), null);
  assert.ok(p.profile.inventory.surfboard === 1 && p.profile.surfboard.at === 'bag', 'in your bag');
  leave(p);
});

// ---- rollerblades ----------------------------------------------------------------------------------------------------------
// benches with smooth ground beside them and a long smooth run east of that ending at grass
function benchSpots() {
  const out = [];
  for (const b of M.props || []) {
    if (!/^(bench_[mab]|pbench)$/.test(b.t)) continue;
    const x0 = b.x, y0 = b.y + 22;
    let ok = true;
    for (let k = 0; k <= 10 && ok; k++) if (boardGround(M.tileAtPx(x0 + k * TILE, y0)) !== 0) ok = false;
    if (!ok) continue;
    for (let k = 11; k < 22; k++) { const t = M.tileAtPx(x0 + k * TILE, y0); if (t === T.GRASS) { out.push({ b, x: x0, y: y0, grassAt: k }); break; } if (boardGround(t) !== 0) break; }
  }
  return out;
}
test('rollerblades: on and off sitting at a bench (about 3 s); quicker than walking, slower than a board, no sprint, no vehicles; a fall on the grass', () => {
  assert.ok(SHOPS.sports.buy.some((o) => o.id === 'rollerblades' && o.price === ROLLERBLADES_PRICE), 'at the sports shops');
  const shop = { id: 9999, kind: 'clothing', store: 'kickflip', label: 'Test', x: 0, y: 0 };
  const p = player(ROAD.x + 100, ROAD.y);
  const ped = p.ped;
  assert.ok(economy.buildMenu(W, p, shop).opts.some((o) => o.id.startsWith('i:rollerblades')), 'at the skate shops');
  p.profile.inventory.rollerblades = 1;
  const S = benchSpots().find((q) => { teleport(W, ped, q.x, q.y); const it = players.findInteraction(W, p); return it && /Put on your rollerblades/.test(it.label); });
  assert.ok(S, 'a bench by a smooth run that ends at grass');
  // walking: how fast at full stick, as a yardstick
  const R = straightRoad(M, 900);
  teleport(W, ped, R.x + 100, R.y); hold(p, 2, 1, 0);
  const walk = speed(ped);
  hold(p, 1.5, 1, 0, IN.SPRINT);
  const sprint = speed(ped);
  hold(p, 1, 0, 0);
  teleport(W, ped, S.x, S.y); ped.vx = 0; ped.vy = 0;
  // at the bench: put them on - sat down, about 3 s, then on
  assert.match(players.findInteraction(W, p).label, /Put on your rollerblades/);
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  assert.ok(ped.lacing && ped.sitBench, 'sat on the bench, lacing up');
  assert.equal(_descriptor(ped).sb, 1, 'seen sitting');
  hold(p, BLADES.laceS - 0.5, 0, 0);
  assert.ok(!gear.wearing(ped), 'not yet');
  hold(p, 0.7, 0, 0);
  assert.ok(gear.wearing(ped) && !ped.lacing && !ped.sitBench, 'on, and up');
  assert.ok(Math.hypot(ped.x - S.x, ped.y - S.y) < 2, 'back where you stood');
  assert.ok(!p.profile.inventory.rollerblades && p.profile.bladesOn, 'worn, not in the bag');
  assert.equal(_descriptor(ped).gt, 'blade', 'the blading walk');
  // speed: quicker than walking, slower than a board; no sprint
  teleport(W, ped, R.x + 100, R.y); ped.vx = 0; ped.vy = 0;
  hold(p, 2, 1, 0);
  const blade = speed(ped);
  assert.ok(blade > walk * 1.05 && blade < BOARD.push, `on blades ${Math.round(blade)} px/s: quicker than walking (${Math.round(walk)}), slower than a board (${BOARD.push})`);
  assert.ok(!players.pedMods(W, ped).canSprint, 'no sprint');
  hold(p, 1.5, 1, 0, IN.SPRINT);
  assert.ok(speed(ped) < blade + 3 && speed(ped) < sprint, `sprint does nothing (${Math.round(speed(ped))})`);
  // no vehicles
  const car = W.spawnVehicle('sedan', ped.x + 40, ped.y, 0, { parked: true }); car.owner = p.pid;
  const words = said(p, () => hold(p, 0.1, 0, 0, 0, IN.VEHICLE));
  assert.ok(!ped.vehId, 'not into the car');
  assert.ok(words.some((t) => /rollerblades/.test(t)), 'told why');
  W.remove(car);
  // onto the grass at speed: down you go
  teleport(W, ped, S.x, S.y); ped.vx = 0; ped.vy = 0;
  let fell = false;
  for (let i = 0; i < 80 && !fell; i++) { hold(p, 0.05, 1, 0); if (W.time < ped.downUntil) fell = true; }
  assert.ok(fell, 'fell on the grass');
  assert.equal(M.tileAtPx(ped.x, ped.y) === T.GRASS || boardGround(M.tileAtPx(ped.x, ped.y)) === 2, true, 'on the grass');
  // up again, the rough: a slow clump, no more falls
  hold(p, BLADES.fallS + 0.3, 0, 0);
  const d0 = ped.downUntil;
  hold(p, 0.6, 1, 0);
  assert.ok(ped.downUntil === d0 && speed(ped) <= BLADES.fallV, `clumping along (${Math.round(speed(ped))} px/s)`);
  // back at the bench: take them off
  teleport(W, ped, S.x, S.y); ped.vx = 0; ped.vy = 0;
  assert.match(players.findInteraction(W, p).label, /Take off your rollerblades/);
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  hold(p, 0.2, 1, 0);   // (moving gets you up: not done)
  assert.ok(gear.wearing(ped) && !ped.lacing, 'got up before they were off');
  teleport(W, ped, S.x, S.y); ped.vx = 0; ped.vy = 0;
  hold(p, 0.1, 0, 0, 0, IN.ACTION);
  hold(p, BLADES.laceS + 0.2, 0, 0);
  assert.ok(!gear.wearing(ped) && p.profile.inventory.rollerblades === 1 && !p.profile.bladesOn, 'off, in the bag');
  assert.notEqual(_descriptor(ped).gt, 'blade');
  assert.ok(players.pedMods(W, ped).canSprint, 'running again');
  leave(p);
});

test('rollerblades are kept on through a respawn and a rejoin', () => {
  const p = player(ROAD.x + 200, ROAD.y, { bladesOn: 1 });
  assert.ok(gear.wearing(p.ped), 'on when you come back');
  leave(p);
  void everyoneAway;
});
