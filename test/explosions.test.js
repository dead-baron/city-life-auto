// Explosions that make you go whoa (task #363) and being hit by a car - run over, onto the hood (task #361); huge blasts,
// chain reactions and people flung (task #398); the debug menu's explosion tests (task #382).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad, fakeConn, store, run } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { boomPlan, blastSize, PIECES, pieceCodes, wheelCount } from '../shared/explosions.js';
import { wheelPlan, wheelPath, WHEEL_F, WHEEL_DT, WHEEL_MAX, WF } from '../shared/wheelpath.js';
import { CAR_BLOCK } from '../shared/map.js';
import { mulberry32 } from '../shared/rng.js';
import { RUNOVER_LEFT, TANKER_BLAST, EXPLOSIVES_BLAST, BLAST_FLING, CHAIN_DELAY_S, CHAIN_GAP_S, CHAIN_GENS, CHAIN_MAX } from '../shared/rules.js';

const vehicles = await import('../server/systems/vehicles.js');
const carhits = await import('../server/systems/carhits.js');
const explosions = await import('../server/systems/explosions.js');
const combat = await import('../server/systems/combat.js');
const cargo = await import('../server/systems/cargo.js');
const { spawnNpc } = await import('../server/systems/npc.js');
const dev = await import('../server/dev.js');
const devmode = await import('../server/devmode.js');
const { createSession } = await import('../server/session.js');
const { newPlayerId } = await import('../server/auth.js');

// a clear stretch of road with nothing else on it, a player close by (keeps it simulated)
function scene() {
  const w = makeWorld();
  const p = joinPlayer(w).p;
  const road = straightRoad(w.map, 1600);
  teleport(w, p.ped, road.x + 60, road.y - road.hw - 60);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && e !== p.ped)) && Math.abs(e.y - road.y) < 400) w.remove(e);
  // every event, kept (a step clears the world's own list), and when it happened (w.at)
  const emit = w.emit.bind(w);
  w.seen = []; w.at = new WeakMap();
  w.emit = (x, y, ev) => { w.seen.push(ev); w.at.set(ev, w.time); emit(x, y, ev); };
  return { w, p, road };
}
const lastEvent = (w, kind) => { const l = w.seen.filter((ev) => ev.e === kind); return l.length ? l[l.length - 1] : null; };

test('an explosion\'s plan comes from its seed: the same seed, the same pieces and the same arc; bigger vehicles, bigger blasts', () => {
  const sedan = VEHICLES.sedan;
  for (const seed of [1, 7, 12345, 99999]) assert.deepEqual(boomPlan(seed, sedan), boomPlan(seed, sedan));
  let launch = 0, pieces = 0, plain = 0;
  for (let s = 1; s <= 300; s++) {
    const pl = boomPlan(s, sedan);
    if (pl.k === 'launch') { launch++; assert.ok(pl.launch && pl.launch.t >= 0.8 && pl.launch.h > 20 && pl.launch.d >= 30); }
    else if (pl.k === 'pieces') { pieces++; assert.ok(pl.pieces.length >= 5, 'blown apart: five or more pieces'); }
    else plain++;
    for (const pc of pl.pieces) assert.ok(PIECES[pc.c] && pc.sp > 0 && pc.vz > 0);
  }
  assert.ok(launch > 40 && pieces > 40 && plain > 20, `launch ${launch} pieces ${pieces} plain ${plain}`);
  assert.equal(boomPlan(5, VEHICLES.tanker).k, 'pieces', 'a tanker always blows apart');
  assert.ok(blastSize(VEHICLES.tanker).r > blastSize(VEHICLES.boxtruck).r && blastSize(VEHICLES.boxtruck).r > blastSize(VEHICLES.sedan).r && blastSize(VEHICLES.sedan).r > blastSize(VEHICLES.bike).r);
});

test('a vehicle explosion\'s event carries the seed and the pieces; launched, the wreck lands where the server says', () => {
  const { w, road } = scene();
  let launched = 0, apart = 0;
  for (let i = 0; i < 40 && (launched < 2 || apart < 1); i++) {
    const car = w.spawnVehicle('sedan', road.x + 300 + (i % 8) * 150, road.y, 0, { npcOwned: false });
    vehicles.explode(w, car, null);
    const ev = lastEvent(w, 'explode');
    assert.ok(ev && ev.s > 0 && ev.id === car.id && ev.m === car.def.i, 'the seed and the vehicle');
    const plan = boomPlan(ev.s, car.def);
    assert.equal(ev.pc, pieceCodes(plan), 'the pieces, as the seed makes them');
    assert.equal(ev.r, blastSize(car.def).r);
    if (ev.k === 'pieces') apart++;
    if (ev.k === 'launch') {
      launched++;
      assert.ok(car.fly && Number.isFinite(ev.lx) && Number.isFinite(ev.ly));
      for (let t = 0; t < 40 && car.fly; t++) w.step();
      assert.ok(!car.fly, 'down again');
      assert.equal(car.x, ev.lx); assert.equal(car.y, ev.ly);
      assert.ok(lastEvent(w, 'wreckland') && lastEvent(w, 'wreckland').id === car.id, 'it slams down');
      w.step();
      assert.ok(Math.hypot(car.x - ev.lx, car.y - ev.ly) < 1, 'and stays where it landed');
    }
    w.remove(car);
    w.seen.length = 0;
  }
  assert.ok(launched >= 2 && apart >= 1, `launched ${launched}, blown apart ${apart}`);
});

// ---- the burning wheel (task #412) ----
// a wheel's path as frames: x, y, z, h, lean, spin, what happened
function frames(P) {
  const out = [];
  for (let i = 0; i < P.n; i++) { const j = i * WHEEL_F; out.push({ x: P.f[j], y: P.f[j + 1], z: P.f[j + 2], h: P.f[j + 3], lean: P.f[j + 4], spin: P.f[j + 5], fl: P.f[j + 6] }); }
  return out;
}
// a made-up map: road everywhere but where `at` says otherwise
const flatMap = (at = () => T.ROAD) => ({ w: 4000, tileAtPx: at, solidProps: new Map() });

test('now and then a burning wheel comes off and rolls away: not every explosion, never off a boat, never more wheels than it has', () => {
  for (const id of ['sedan', 'bus', 'tanker', 'bike', 'trike']) {
    const def = VEHICLES[id];
    let rolls = 0;
    for (let s = 1; s <= 600; s++) {
      const pl = boomPlan(s, def), roll = wheelPlan(s, def, pl), thrown = pl.pieces.filter((p) => p.c === 'w').length;
      assert.ok(thrown + (roll ? 1 : 0) <= wheelCount(def), `${id} (seed ${s}): no more wheels off it than it has`);
      if (roll) { rolls++; assert.ok(roll.sp > 0 && roll.vz > 0 && roll.drag > 0 && roll.burn > 0); }
    }
    assert.ok(rolls > 600 * 0.08 && rolls < 600 * 0.6, `${id}: now and then (${rolls} of 600)`);
  }
  // a motorbike that threw both its wheels has none left to roll
  let both = 0;
  for (let s = 1; s <= 3000; s++) { const pl = boomPlan(s, VEHICLES.bike); if (pl.pieces.filter((p) => p.c === 'w').length === 2) { both++; assert.equal(wheelPlan(s, VEHICLES.bike, pl), null, `seed ${s}`); } }
  assert.ok(both > 10, `some threw both (${both})`);
  // a boat, a jet ski: no wheels at all
  for (const id of ['speedboat', 'dinghy', 'jetski', 'policeboat']) {
    assert.equal(wheelCount(VEHICLES[id]), 0);
    for (let s = 1; s <= 400; s++) { assert.equal(wheelPlan(s, VEHICLES[id]), null, `${id}: no wheel`); assert.ok(!pieceCodes(boomPlan(s, VEHICLES[id])).includes('w'), `${id}: none blown off it either`); }
  }
  // the same seed, the same wheel
  for (const s of [3, 77, 12345]) assert.deepEqual(wheelPlan(s, VEHICLES.sedan), wheelPlan(s, VEHICLES.sedan));
});

test('the explosion says when a wheel rolls (on the ground only), and every client rolls it the same way: flung off, it bounces, rolls away slowing, and comes to rest flat a while later', () => {
  const { w, road } = scene();
  let seen = 0, up = false;
  for (let i = 0; i < 300 && (seen < 3 || !up); i++) {
    const car = w.spawnVehicle('sedan', road.x + 300 + (i % 8) * 150, road.y, 0, { npcOwned: false });
    if (seen >= 3) car.lz = 1;   // (up on the highway: never - it would roll along the ground under it)
    vehicles.explode(w, car, null);
    const ev = lastEvent(w, 'explode'), roll = wheelPlan(ev.s, car.def);
    w.remove(car); w.seen.length = 0;
    if (car.lz) { if (roll) { assert.ok(!ev.wh, 'not up on the highway'); up = true; } continue; }
    assert.equal(!!ev.wh, !!roll, 'the event says so when its seed has a wheel come off');
    if (!ev.wh) continue;
    seen++;
    // every client works it out from the event and the map: the same frames
    const P = wheelPath(roll, car.def, ev.x, ev.y, ev.a, w.map), Q = wheelPath(roll, car.def, ev.x, ev.y, ev.a, w.map);
    assert.deepEqual([...P.f.subarray(0, P.n * WHEEL_F)], [...Q.f.subarray(0, Q.n * WHEEL_F)], 'the same path every time');
    const fr = frames(P), last = fr[fr.length - 1];
    assert.ok(Math.hypot(fr[0].x - ev.x, fr[0].y - ev.y) < car.def.L / 2 + 4, 'off the car');
    assert.ok(Math.max(...fr.slice(0, 30).map((q) => q.z)) > 15, 'flung up');
    assert.ok(fr.some((q) => q.fl === WF.BOUNCE), 'it bounces');
    let len = 0;
    for (let k = 1; k < fr.length; k++) len += Math.hypot(fr[k].x - fr[k - 1].x, fr[k].y - fr[k - 1].y);
    assert.ok(len > 150, `rolls away (${len | 0} px)`);
    assert.ok(fr.every((q) => !CAR_BLOCK[w.map.tileAtPx(q.x, q.y)]), 'never into a wall');
    // rolling on the ground it slows down: its last second before it goes over slower than its first on the ground
    const ground = fr.map((q, k) => (k && q.z === 0 && fr[k - 1].z === 0 && Math.abs(q.lean) < 1 ? Math.hypot(q.x - fr[k - 1].x, q.y - fr[k - 1].y) / WHEEL_DT : -1)).filter((v) => v >= 0);
    if (ground.length > 40 && !P.sunk) {
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      assert.ok(avg(ground.slice(-30)) < avg(ground.slice(0, 30)), `slowing (${avg(ground.slice(0, 30)) | 0} px/s, then ${avg(ground.slice(-30)) | 0})`);
    }
    // at rest a while later: flat on its side on the ground (or sunk)
    assert.ok(P.n < WHEEL_MAX && P.n * WHEEL_DT > 1.5, `stops after a while (${(P.n * WHEEL_DT).toFixed(1)} s)`);
    if (!P.sunk) assert.ok(last.z === 0 && Math.abs(Math.abs(last.lean) - Math.PI / 2) < 0.01, 'lying flat');
  }
  assert.ok(seen >= 3 && up, `wheels seen rolling: ${seen}`);
});

test('a burning wheel glances off a wall and rolls back; into the water it sinks', () => {
  const def = VEHICLES.sedan, roll = { fr: 1, sd: 1, a: 0, sp: 300, vz: 120, drag: 40, curl: 0.1, burn: 10 };
  // a building from x 400 on: thrown at it from x 200
  const walled = flatMap((x) => (x >= 400 ? T.BUILDING : T.ROAD));
  const P = frames(wheelPath(roll, def, 200, 500, 0, walled));
  const knock = P.findIndex((q) => q.fl === WF.KNOCK);
  assert.ok(knock > 0, 'it knocks into the wall');
  assert.ok(P.every((q) => q.x < 400), 'never through it');
  assert.ok(P[P.length - 1].x < P[knock].x - 20, `and rolls back off it (${P[knock].x | 0} -> ${P[P.length - 1].x | 0})`);
  // the harbour from x 400 on
  const wet = wheelPath(roll, def, 200, 500, 0, flatMap((x) => (x >= 400 ? T.WATER : T.ROAD)));
  const W = frames(wet);
  assert.ok(wet.sunk && W[W.length - 1].fl === WF.SUNK && W[W.length - 1].x >= 400, 'into the water: it sinks there');
  // on grass it doesn't get as far as on the road
  const onRoad = frames(wheelPath({ ...roll, a: 0 }, def, 200, 500, 0, flatMap()));
  const onGrass = frames(wheelPath({ ...roll, a: 0 }, def, 200, 500, 0, flatMap(() => T.GRASS)));
  assert.ok(onGrass[onGrass.length - 1].x - 200 < (onRoad[onRoad.length - 1].x - 200) * 0.7, 'grass slows it more');
});

test('a launched wreck landing on a car sets it off (a chain reaction)', () => {
  const { w, road } = scene();
  let done = false;
  for (let i = 0; i < 80 && !done; i++) {
    const car = w.spawnVehicle('sedan', road.x + 500, road.y, 0, { npcOwned: false });
    vehicles.explode(w, car, null);
    if (!car.fly) { w.remove(car); continue; }
    // a car parked right where it comes down
    const other = w.spawnVehicle('sedan', car.fly.x1, car.fly.y1, 0, { npcOwned: false });
    for (let t = 0; t < 40 && car.fly; t++) w.step();
    assert.ok(other.chain && other.chain.g === car.chain.g + 1 && other.dead, 'the car it landed on is set off: the next link of its chain (task #398)');
    for (let t = 0; t < 20 && !other.wreckAt; t++) w.step();
    assert.ok(other.wreckAt, 'and goes up a beat later');
    done = true;
  }
  assert.ok(done, 'a wreck was launched');
});

// a car driving at a person standing in its path: x px ahead of its nose, at speed px/s
function drive(w, model, road, speed, opts = {}) {
  const v = w.spawnVehicle(model, road.x + 400, road.y, 0, { npcOwned: false });
  const ped = w.spawnPed(v.x + v.def.L / 2 + 12, road.y + (opts.dy || 0), { hp: 100, archetype: 'casual', name: 'Pat' });
  v.vx = speed;
  return { v, ped };
}

test('hit by a car: run over (lying low, or under a heavy vehicle), up onto the hood (a low front, moderate speed), knocked flying otherwise', () => {
  const { w, road } = scene();
  // lying in the road already: the car goes right over
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    ped.downUntil = w.time + 5;
    assert.equal(carhits.outcome(w, v, ped, 260), 'under');
    w.remove(v); w.remove(ped);
  }
  // a bus or a truck: often under it, never up on its hood
  {
    const { v, ped } = drive(w, 'bus', road, 260);
    let under = 0, hood = 0;
    for (let i = 0; i < 60; i++) { const o = carhits.outcome(w, v, ped, 260); if (o === 'under') under++; if (o === 'hood') hood++; }
    assert.ok(under > 15 && hood === 0, `bus: under ${under}, hood ${hood}`);
    w.remove(v); w.remove(ped);
  }
  // a low car at a moderate speed, hitting with its nose: up onto the hood, often
  {
    const { v, ped } = drive(w, 'sports', road, 260);
    let hood = 0, fling = 0;
    for (let i = 0; i < 60; i++) { const o = carhits.outcome(w, v, ped, 260); if (o === 'hood') hood++; if (o === 'fling') fling++; }
    assert.ok(hood > 15 && fling > 5, `sports: hood ${hood}, fling ${fling}`);
    // too fast for the hood: flying (or under)
    for (let i = 0; i < 30; i++) assert.notEqual(carhits.outcome(w, v, ped, 520), 'hood');
    w.remove(v); w.remove(ped);
  }
  // a motorbike: knocked flying
  {
    const { v, ped } = drive(w, 'bike', road, 260);
    for (let i = 0; i < 20; i++) assert.equal(carhits.outcome(w, v, ped, 260), 'fling');
    w.remove(v); w.remove(ped);
  }
});

test('run over slowly: critically hurt but alive, lying face down or on the back a few seconds', () => {
  const { w, road } = scene();
  let alive = 0;
  for (let i = 0; i < 12; i++) {
    const { v, ped } = drive(w, 'sedan', road, 200);
    w.seen.length = 0;
    const killed = carhits.apply(w, v, ped, 170, 'under', null);
    const ev = lastEvent(w, 'runover');
    assert.ok(ev && ev.id === ped.id && (ev.k === 'F' || ev.k === 'B') && ev.d >= 2.5);
    if (!killed && !ped.dead) {
      alive++;
      assert.ok(ped.hp > 0 && ped.hp <= ped.maxHp * RUNOVER_LEFT * 1.4 + 1, `critically hurt: ${ped.hp}`);
      assert.ok(ped.downUntil - w.time > 2.5, 'lying there a few seconds');
    }
    w.remove(v); w.remove(ped);
  }
  assert.ok(alive >= 10, `a slow run-over rarely kills: ${alive} / 12 alive`);
});

test('onto the hood: carried along, thrown off when the time is up or it brakes; moving rolls you off sooner', () => {
  const { w, road } = scene();
  // riding until the time runs out (driving straight on), then thrown
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    carhits.apply(w, v, ped, 260, 'hood', null);
    assert.equal(ped.hoodOf, v.id);
    const until = ped.hoodUntil;
    let t = 0;
    while (ped.hoodOf && t++ < 60) {
      v.vx = 260; v.vy = 0; v.av = 0; v.input.throttle = 1;
      w.step();
      if (ped.hoodOf) {
        const lx = (ped.x - v.x) * Math.cos(v.a) + (ped.y - v.y) * Math.sin(v.a);
        assert.ok(lx > 0 && lx < v.def.L / 2, 'on the hood');
      }
    }
    assert.ok(!ped.hoodOf && t <= Math.ceil((until - w.time + t / 20) * 20) + 2, 'thrown off when the ride is over');
    assert.ok(lastEvent(w, 'hoodoff'), 'thrown off');
    assert.ok(w.time < ped.downUntil, 'down on the ground after');
    w.remove(v); w.remove(ped);
  }
  // braking hard throws you off forwards at once
  {
    const { v, ped } = drive(w, 'sedan', road, 260);
    carhits.apply(w, v, ped, 260, 'hood', null);
    ped.hoodUntil = w.time + 5;
    v.vx = 0; v.vy = 0;
    w.step();
    assert.ok(!ped.hoodOf, 'off at once');
    assert.equal(lastEvent(w, 'hoodoff').k, 'brake');
    assert.ok(ped.x > v.x + v.def.L / 2 - 4, 'thrown off over the nose');
    w.remove(v); w.remove(ped);
  }
  // a player rolls off sooner by moving
  {
    const { w: w2, p, road: r2 } = scene();
    const v = w2.spawnVehicle('sedan', r2.x + 400, r2.y, 0, { npcOwned: false });
    teleport(w2, p.ped, v.x + v.def.L / 2 + 12, r2.y);
    v.vx = 260;
    carhits.apply(w2, v, p.ped, 260, 'hood', null);
    p.ped.hoodUntil = w2.time + 5;
    for (let t = 0; t < 6; t++) { v.vx = 260; v.av = 0; w2.step(); }
    assert.equal(p.ped.hoodOf, v.id, 'still riding');
    carhits.hoodInput(w2, p.ped, { mx: 0, my: 1 });
    v.vx = 260; w2.step();
    assert.ok(!p.ped.hoodOf, 'rolled off');
    assert.equal(lastEvent(w2, 'hoodoff').k, 'steer');
    assert.ok(p.ped.vy > 60, 'off toward the side they moved');
  }
});

// ---- huge blasts, chain reactions, people flung (task #398) ----
// step until done() (at most s seconds); whether it is
function until(w, s, done) { for (let i = 0; i < s * 20 && !done(); i++) w.step(); return done(); }
const boomOf = (w, v) => w.seen.find((ev) => ev.e === 'explode' && ev.id === v.id);

test('a fuel tanker or a load of explosives goes up huge: a far bigger blast than a car\'s, bigger the more crates (task #398)', () => {
  const car = blastSize(VEHICLES.sedan), truck = blastSize(VEHICLES.boxtruck), tanker = blastSize(VEHICLES.tanker);
  assert.deepEqual(tanker, { r: TANKER_BLAST.r, dmg: TANKER_BLAST.dmg, big: 3 });
  assert.ok(tanker.r > 2 * car.r && tanker.dmg > 2 * car.dmg && tanker.r > truck.r && tanker.dmg > truck.dmg, 'a tanker: far bigger than a car, bigger than a truck');
  let last = truck.r;
  for (let n = 1; n <= 10; n++) {
    const s = blastSize(VEHICLES.flatbed, n);
    assert.ok(s.r > truck.r && s.r >= last && s.r <= EXPLOSIVES_BLAST.max && s.dmg > truck.dmg, `${n} crates: ${s.r} px`);
    assert.equal(s.big, s.r > tanker.r ? 4 : 3, 'huge - and a load that outreaches a tanker the biggest of all');
    last = s.r;
  }
  assert.equal(blastSize(VEHICLES.flatbed, VEHICLES.flatbed.slots.length).r, EXPLOSIVES_BLAST.max, 'a full load: the biggest there is');
  // the explosion's event says how big; a huge one always blows apart (every client makes the same pieces, from b)
  const { w, road } = scene();
  const tk = w.spawnVehicle('tanker', road.x + 500, road.y, 0, { npcOwned: false });
  vehicles.explode(w, tk, null);
  let ev = lastEvent(w, 'explode');
  assert.ok(ev.id === tk.id && ev.r === tanker.r && ev.b === 3 && ev.k === 'pieces', JSON.stringify(ev));
  assert.equal(ev.pc, pieceCodes(boomPlan(ev.s, tk.def, ev.b)));
  // a flatbed with four crates of explosives aboard: they go up with it (none left lying about), its other load is thrown off
  const fb = w.spawnVehicle('flatbed', road.x + 1300, road.y, 0, { npcOwned: false });
  assert.equal(cargo.loadExplosives(w, fb, 4), 4);
  const boxes = fb.cargo.filter(Boolean).map((id) => w.get(id));
  assert.ok(boxes.every((c) => c.label === explosions.EXPLOSIVES && c.state === 'loaded' && c.value === 0 && !c.contraband), 'marked crates, worth nothing to anyone');
  const other = w.spawnCrate(1, fb.x, fb.y, { contraband: false });
  other.state = 'loaded'; other.parent = fb.id; other.slot = 7; fb.cargo[7] = other.id;
  vehicles.explode(w, fb, null);
  ev = lastEvent(w, 'explode');
  assert.ok(ev.id === fb.id && ev.r === blastSize(fb.def, 4).r && ev.b === 3 && ev.r > blastSize(fb.def).r, JSON.stringify(ev));
  assert.equal(ev.pc, pieceCodes(boomPlan(ev.s, fb.def, ev.b)));
  assert.ok(boxes.every((c) => c.removed), 'the explosives went up with it');
  assert.ok(!other.removed && other.state === 'ground', 'its other cargo is thrown off');
});

test('people in a huge blast are thrown harder, higher and further the closer they stood, harder than by an ordinary one, and hurt by how close (task #398)', () => {
  const { w, road } = scene();
  w.rand = mulberry32(398);
  const tk = w.spawnVehicle('tanker', road.x + 700, road.y, 0, { npcOwned: false });
  const ds = [90, 150, 210, 270];
  const people = ds.map((d) => { const q = spawnNpc(w, 'casual', tk.x + d, road.y); q.hp = q.maxHp = 5000; return q; });
  const pl = joinPlayer(w).p;
  teleport(w, pl.ped, tk.x - 150, road.y);
  vehicles.explode(w, tk, null);
  const t0 = w.time, sp = people.map((q) => Math.hypot(q.vx, q.vy)), air = people.map((q) => q.airUntil - t0), hurt = people.map((q) => 5000 - q.hp);
  assert.ok(air.every((a) => a > 0), 'everyone in its reach is thrown');
  for (let i = 1; i < ds.length; i++) assert.ok(sp[i] < sp[i - 1] && air[i] < air[i - 1] && hurt[i] < hurt[i - 1], `the closer, the harder: ${sp.map(Math.round)} px/s, ${air.map((a) => a.toFixed(2))} s up, ${hurt.map(Math.round)} hurt`);
  assert.ok(pl.ped.dead || pl.ped.airUntil > t0, 'a player standing in it is thrown too');
  // and further: where each one comes to rest
  const moved = people.map(() => null);
  for (let i = 0; i < 100 && moved.some((m) => m === null); i++) {
    w.step();
    people.forEach((q, j) => { if (moved[j] === null && w.time >= q.tumbleUntil) moved[j] = Math.hypot(q.x - tk.x, q.y - tk.y) - ds[j]; });
  }
  for (let i = 1; i < ds.length; i++) assert.ok(moved[i] < moved[i - 1], `the closer, the further: ${moved.map(Math.round)} px`);
  assert.ok(moved[0] > 400, `thrown a long way (${Math.round(moved[0])} px)`);
  // an ordinary blast of the same reach, at the same distance, throws gentler (BLAST_FLING)
  const plain = spawnNpc(w, 'casual', road.x + 400, road.y), huge = spawnNpc(w, 'casual', road.x + 1300, road.y);
  for (const q of [plain, huge]) q.hp = q.maxHp = 5000;
  combat.blast(w, plain.x - 150, plain.y, TANKER_BLAST.r, TANKER_BLAST.dmg, null, 0, false, 0, explosions.newLink(), 1);
  combat.blast(w, huge.x - 150, huge.y, TANKER_BLAST.r, TANKER_BLAST.dmg, null, 0, false, 0, explosions.newLink(), 3);
  const ratio = Math.hypot(huge.vx, huge.vy) / Math.hypot(plain.vx, plain.vy);
  assert.ok(Math.abs(ratio - BLAST_FLING) < 0.01 && huge.airUntil > plain.airUntil, `huge: ${ratio.toFixed(2)}x as hard, longer in the air`);
  // a car's blast, at the same distance as the tanker's nearest person, barely reaches
  const byCar = spawnNpc(w, 'casual', road.x + 2000, road.y);
  const car = w.spawnVehicle('sedan', byCar.x - ds[0], road.y, 0, { npcOwned: false });
  vehicles.explode(w, car, null);
  assert.ok(Math.hypot(byCar.vx, byCar.vy) < sp[0] / 2, 'a car going up throws you far less');
});

test('the vehicles round it go up too, one after another a beat apart and the nearest first - each its own explosion (task #398)', () => {
  const { w, road } = scene();
  const tk = w.spawnVehicle('tanker', road.x + 700, road.y, 0, { npcOwned: false });
  // four cars parked round it, their near ends in the near half of its reach (they always go)
  const cars = [[128, 0], [-150, 0], [0, 100], [60, -100]].map(([dx, dy]) => w.spawnVehicle('sedan', tk.x + dx, tk.y + dy, 0, { npcOwned: false }));
  vehicles.explode(w, tk, null);
  const t0 = w.time, ev0 = lastEvent(w, 'explode');
  for (const c of cars) assert.ok(c.chain && c.chain.g === 1 && c.dead && !c.wreckAt && c.deadFireAt <= t0, 'set off: its engine dead, on fire at once, still in one piece');
  // when they go up: a beat after the blast, the nearest first, never two at once
  const order = [...cars].sort((a, b) => explosions.bodyDist(a, ev0.x, ev0.y) - explosions.bodyDist(b, ev0.x, ev0.y));
  const due = order.map((c) => c.deadBoomAt - t0);
  assert.ok(due[0] >= CHAIN_DELAY_S[0] - 1e-9 && due[0] <= CHAIN_DELAY_S[1], `the first a beat later (${due[0].toFixed(2)} s)`);
  for (let i = 1; i < due.length; i++) assert.ok(due[i] - due[i - 1] >= CHAIN_GAP_S - 1e-9, `one after another, the nearest first: ${due.map((t) => t.toFixed(2))} s`);
  // and so they do, each through the ordinary explosion (its own event, seed and blast), on its time
  assert.ok(until(w, 4, () => cars.every((c) => c.wreckAt)), 'all four went up');
  const evs = order.map((c) => boomOf(w, c)), went = evs.map((ev) => w.at.get(ev) - t0);
  assert.ok(evs.every((ev) => ev.s > 0 && ev.r === blastSize(VEHICLES.sedan).r && ev.b === 1), 'each its own explosion');
  assert.equal(new Set(evs.map((ev) => ev.s)).size, evs.length, 'each from its own seed');
  for (let i = 0; i < went.length; i++) assert.ok(went[i] >= due[i] - 1e-9 && went[i] < due[i] + 0.051, `on its time: ${went.map((t) => t.toFixed(2))} s`);
});

test('a tanker set off by another explosion makes its own huge blast; a crate of explosives caught in a blast goes up too (task #398)', () => {
  const { w, road } = scene();
  const car = w.spawnVehicle('sedan', road.x + 600, road.y, 0, { npcOwned: false });
  const tk = w.spawnVehicle('tanker', car.x + car.def.L / 2 + 14 + VEHICLES.tanker.L / 2, road.y, 0, { npcOwned: false });
  vehicles.explode(w, car, null);   // an ordinary car going up, parked right behind it
  assert.equal(lastEvent(w, 'explode').b, 1, 'an ordinary blast');
  assert.ok(tk.chain && tk.dead && !tk.wreckAt, 'the tanker catches');
  assert.ok(until(w, 2, () => tk.wreckAt), 'and goes up');
  const ev = boomOf(w, tk);
  assert.ok(ev.r === TANKER_BLAST.r && ev.b === 3, `huge: ${JSON.stringify(ev)}`);
  // a crate of explosives lying in the road near a car going up
  const box = w.spawnCrate(2, road.x + 1500, road.y, { label: explosions.EXPLOSIVES, value: 0, contraband: false });
  const car2 = w.spawnVehicle('sedan', box.x - 85, road.y, 0, { npcOwned: false });
  vehicles.explode(w, car2, null);
  assert.ok(box.boomAt > w.time && !box.removed, 'the crate is set off');
  w.seen.length = 0;
  assert.ok(until(w, 2, () => box.removed), 'and goes up a beat later');
  const bev = lastEvent(w, 'explode');
  assert.ok(bev && bev.r === blastSize(null, 1).r && bev.b === 3 && !bev.id, `huge: ${JSON.stringify(bev)}`);
});

test('a chain reaction is capped: never more than CHAIN_MAX set off, never more than CHAIN_GENS links deep - the rest are left damaged (task #398)', () => {
  // a car park packed tight round a tanker: left to itself, every car in it would go
  {
    const { w, p, road } = scene();
    w.rand = mulberry32(7);
    const x0 = road.x + 900;
    teleport(w, p.ped, x0, road.y - 700);
    const tk = w.spawnVehicle('tanker', x0, road.y, 0, { npcOwned: false });
    const cars = [];
    for (const dy of [-100, 0, 100]) for (let i = -4; i <= 4; i++) if (dy || i) cars.push(w.spawnVehicle('sedan', x0 + i * 95 + (dy ? 0 : Math.sign(i) * 33), road.y + dy, 0, { npcOwned: false }));
    vehicles.explode(w, tk, null);
    run(w, 6);
    const went = cars.filter((c) => c.wreckAt);
    assert.equal(went.length, CHAIN_MAX, `${went.length} of ${cars.length} went up`);
    assert.equal(tk.chain.c.n, CHAIN_MAX);
    assert.ok(went.every((c) => c.chain && c.chain.g <= CHAIN_GENS));
    const left = cars.filter((c) => !c.wreckAt);
    assert.ok(left.length && left.every((c) => !c.chain && !c.dead && c.hp > 0) && left.some((c) => c.hp < c.def.hp), 'the rest are hurt, still running');
  }
  // past its caps a chain never finishes one off: a car it would have set off is left on CAPPED_LEFT of its health
  {
    const { w, road } = scene();
    const spent = { c: { n: CHAIN_MAX, at: 0, hot: true }, g: 1 };
    const a = w.spawnVehicle('sedan', road.x + 500, road.y, 0, { npcOwned: false }), b = w.spawnVehicle('sedan', road.x + 700, road.y, 0, { npcOwned: false });
    b.hp = 20;
    for (const v of [a, b]) explosions.blastVehicle(w, v, 1, 9999, null, spent, 3);
    assert.ok(!a.chain && !a.dead && a.hp === a.def.hp * explosions.CAPPED_LEFT, `a sound one left on a fifth of its health (${a.hp})`);
    assert.ok(!b.chain && !b.dead && b.hp === 20, 'one already worse off left as it was');
    explosions.blastVehicle(w, a, 1, 9999, null, explosions.newLink(), 3);
    assert.ok(a.chain && a.dead, 'the same blast with room in its chain sets it off');
  }
  // a long line of cars nose to tail from a tanker: each sets off the next, until the chain is CHAIN_GENS links deep
  {
    const { w, p, road } = scene();
    w.rand = mulberry32(11);
    const x0 = road.x + 300;
    teleport(w, p.ped, x0 + 900, road.y - 700);
    const tk = w.spawnVehicle('tanker', x0, road.y, 0, { npcOwned: false });
    const line = [];
    for (let i = 0; i < 14; i++) line.push(w.spawnVehicle('sedan', x0 + 128 + i * 95, road.y, 0, { npcOwned: false }));
    vehicles.explode(w, tk, null);
    run(w, 8);
    const gens = line.filter((c) => c.chain).map((c) => c.chain.g);
    assert.equal(Math.max(...gens), CHAIN_GENS, `the links: ${gens}`);
    assert.ok(tk.chain.c.n < CHAIN_MAX, 'it was how deep it went that stopped it');
    assert.equal(line.filter((c) => c.wreckAt).length, gens.length, 'every one set off went up');
    assert.ok(line.slice(-5).every((c) => !c.wreckAt && !c.chain && !c.dead), 'the far end of the line is still standing');
  }
});

// ---- the debug menu's explosion tests (task #382) ----
// a connection the way server/index.js makes one: not in dev mode
function connect(w) {
  const conn = fakeConn();
  const s = createSession(w, conn, { seed: 1337, dev: false, maxPlayers: 20, login: () => ({ profile: store.create(newPlayerId()), token: 't' }) });
  s.onMessage(JSON.stringify({ t: 'hello' }), false);
  const p = w.players.get(conn.sent.find((m) => m && m.t === 'welcome').pid);
  return { p, send: (k) => s.onMessage(JSON.stringify({ t: 'dev', c: 'blast', k }), false) };
}
// standing in the road at (x, y), facing east, unhurt
function stand(w, p, x, y) {
  teleport(w, p.ped, x, y);
  Object.assign(p.ped, { a: 0, vx: 0, vy: 0, airUntil: 0, tumbleUntil: 0, downUntil: 0, hp: p.ped.maxHp });
}
const spawned = (w, before) => [...w.entities.values()].filter((e) => !before.has(e.id));

test('the debug menu\'s explosion tests: only in dev mode; small, medium, big and ultra go off a little ahead, the game\'s own sizes (task #382)', () => {
  const { w, road } = scene();
  const { p, send } = connect(w);
  stand(w, p, road.x + 600, road.y);
  const before = new Set(w.entities.keys());
  for (const k of ['small', 'ultra', 'car', 'tanker', 'truck', 'row', 'crowd']) send(k);
  assert.equal(w.seen.filter((ev) => ev.e === 'explode').length, 0, 'not in dev mode: nothing goes off');
  assert.equal(spawned(w, before).length, 0, 'and nothing is spawned');
  devmode.enter(w, p, null);
  devmode.setInvincible(w, p, null, true);   // (the blasts reach back to you)
  let last = null;
  for (const k of ['small', 'medium', 'big', 'ultra']) {
    stand(w, p, road.x + 600, road.y);
    w.seen.length = 0;
    send(k);
    const ev = lastEvent(w, 'explode'), want = dev.BLAST_SIZES[k]();
    assert.ok(ev && ev.r === want.r && ev.b === want.big && !ev.id, `${k}: ${JSON.stringify(ev)}`);
    const d = Math.hypot(ev.x - p.ped.x, ev.y - p.ped.y);
    assert.ok(ev.x > p.ped.x && Math.abs(ev.y - p.ped.y) < 1 && d > 60 && d <= 300 && d < want.r, `${k}: a little ahead (${Math.round(d)} px), you at its edge`);
    if (last) assert.ok(want.r > last.r && want.dmg > last.dmg && want.big > last.big, `${k} bigger than the one before`);
    last = want;
  }
  assert.deepEqual(['small', 'medium', 'big', 'ultra'].map((k) => dev.BLAST_SIZES[k]().r), [blastSize(VEHICLES.sedan).r, blastSize(VEHICLES.boxtruck).r, TANKER_BLAST.r, EXPLOSIVES_BLAST.max], 'a car\'s, a truck\'s, a fuel tanker\'s, a full load of explosives\'');
  // what it doesn't know
  const n = w.entities.size;
  send('fireworks');
  assert.ok(w.entities.size === n && /Blast what/.test(p.toasts[p.toasts.length - 1].text), 'told what there is');
});

test('the debug menu\'s explosion tests: a car, a tanker, a truck of explosives burning a few steps away, then going up; a row of cars; a crowd (task #382)', () => {
  const { w, road } = scene();
  const { p, send } = connect(w);
  devmode.enter(w, p, null);
  devmode.setInvincible(w, p, null, true);
  let x = road.x + 400;
  for (const [k, model, crates, size] of [['car', 'sedan', 0, blastSize(VEHICLES.sedan)], ['tanker', 'tanker', 0, blastSize(VEHICLES.tanker)], ['truck', 'flatbed', 4, blastSize(VEHICLES.flatbed, 4)]]) {
    stand(w, p, x, road.y);
    const before = new Set(w.entities.keys());
    send(k);
    const v = spawned(w, before).find((e) => e.kind === K.VEH);
    assert.ok(v && v.def.id === model, `${k}: ${v && v.def.id}`);
    assert.ok(Math.hypot(v.x - p.ped.x, v.y - p.ped.y) < 400, 'a few steps away');
    assert.ok(v.dead && !v.wreckAt && v.deadFireAt <= w.time && Math.abs(v.deadBoomAt - w.time - dev.BLAST_FUSE_S) < 1e-6, 'its engine dead, on fire, going up in a few seconds');
    assert.equal(explosions.explosivesOn(w, v), crates);
    assert.ok(until(w, dev.BLAST_FUSE_S + 0.5, () => v.wreckAt), `${k}: it goes up`);
    const ev = boomOf(w, v);
    assert.ok(ev.r === size.r && ev.b === size.big, `${k}: ${JSON.stringify(ev)}`);
    x += 1100;
  }
  // a row: a burning tanker among parked cars, all in a line; it sets them off, one after another
  stand(w, p, road.x + 4400, road.y);
  let before = new Set(w.entities.keys());
  send('row');
  const row = spawned(w, before).filter((e) => e.kind === K.VEH), tk = row.find((v) => v.def.id === 'tanker');
  assert.ok(tk && row.length >= 5, `a tanker and cars: ${row.map((v) => v.def.id)}`);
  assert.ok(tk.dead && row.every((v) => v === tk || !v.dead), 'the tanker burning, the cars not');
  for (const v of row) assert.ok(Math.abs((v.x - tk.x) * Math.sin(tk.a) - (v.y - tk.y) * Math.cos(tk.a)) < 1 && v.a === tk.a, 'in a row');
  w.seen.length = 0;
  run(w, dev.BLAST_FUSE_S + 3);
  const went = row.filter((v) => v.wreckAt), times = went.map((v) => w.at.get(boomOf(w, v))).sort((a, b) => a - b);
  assert.ok(tk.wreckAt && went.length >= 4, `the chain reaction: ${went.length} of ${row.length} went up`);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] > CHAIN_GAP_S - 0.051, `a beat apart: ${times.map((t) => t.toFixed(2))}`);
  // a crowd round a burning tanker, standing watching it, near and far: it goes up and throws them, the nearest hardest
  stand(w, p, road.x + 5600, road.y);
  before = new Set(w.entities.keys());
  send('crowd');
  const all = spawned(w, before), tk2 = all.find((e) => e.kind === K.VEH), crowd = all.filter((e) => e.kind === K.PED);
  const dist = (q) => Math.hypot(q.x - tk2.x, q.y - tk2.y);
  assert.ok(tk2 && tk2.def.id === 'tanker' && tk2.dead, 'a burning tanker');
  assert.ok(crowd.length >= 10 && crowd.some((q) => dist(q) < 150) && crowd.some((q) => dist(q) > TANKER_BLAST.r), `${crowd.length} people round it, near and far`);
  const spots = crowd.map((q) => ({ x: q.x, y: q.y }));
  assert.ok(until(w, dev.BLAST_FUSE_S + 1.5, () => tk2.wreckAt), 'it goes up');
  crowd.forEach((q, i) => assert.ok(Math.hypot(spots[i].x - q.x, spots[i].y - q.y) < 30 || w.time < q.airUntil, 'they stood there watching'));
  const inside = crowd.filter((q) => dist(q) < TANKER_BLAST.r - 20).sort((a, b) => dist(a) - dist(b)), outside = crowd.filter((q) => dist(q) > TANKER_BLAST.r + 20);
  assert.ok(inside.length >= 6 && inside.every((q) => w.time < q.airUntil), 'everyone in its reach is thrown');
  const sp = inside.map((q) => Math.hypot(q.vx, q.vy));
  for (let i = 1; i < sp.length; i++) assert.ok(sp[i] <= sp[i - 1] + 40, `the nearest hardest: ${sp.map(Math.round)}`);
  assert.ok(sp[0] > sp[sp.length - 1] * 1.4, `the nearest much harder than the furthest: ${sp.map(Math.round)}`);
  assert.ok(outside.length && outside.every((q) => !(w.time < q.airUntil) && !q.dead), 'out of its reach: untouched');
});
