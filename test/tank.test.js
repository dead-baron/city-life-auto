// The tank (H58, server/systems/tank.js) and the explosion tester (server/systems/boomtest.js): a tracked hull that turns
// on the spot and shoves cars aside, small arms barely scratching it, a turret that turns to the driver's aim on its own
// and shells that fly and go up where they land; a dev weapon whose shot sets off the explosion kind picked (the reload
// key steps through them) where it lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad, run } from './helpers.js';
import { K } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { vehStep } from '../shared/physics.js';
import { TANK, BOOM_TEST_KINDS } from '../shared/rules.js';
import { WEAPONS } from '../shared/items.js';
import { IN } from '../shared/input.js';

const tank = await import('../server/systems/tank.js');
const boomtest = await import('../server/systems/boomtest.js');
const combat = await import('../server/systems/combat.js');
const burning = await import('../server/systems/burning.js');
const net = await import('../server/net.js');
const { spawnNpc } = await import('../server/systems/npc.js');

function scene() {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const road = straightRoad(w.map, 1600);
  teleport(w, p.ped, road.x + 60, road.y);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && e !== p.ped)) && Math.abs(e.y - road.y) < 500) w.remove(e);
  const emit = w.emit.bind(w);
  w.seen = [];
  w.emit = (x, y, ev) => { w.seen.push(ev); emit(x, y, ev); };
  return { w, p, road };
}
const seat = (ped, v) => { ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id; };

test('the tank turns on the spot (a car can\'t), and never slides', () => {
  const map = { tileAtPx: () => 3, tileAt: () => 3, solidProps: new Map(), w: 512 };
  for (const [id, turns] of [['tank', true], ['sedan', false]]) {
    const s = { x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0 };
    for (let t = 0; t < 1; t += 0.05) vehStep(s, { throttle: 0, steer: 1, hb: false, drv: true }, 0.05, map, VEHICLES[id], {});
    if (turns) { assert.ok(Math.abs(s.a) > 0.8, `the tank pivots (${s.a.toFixed(2)} rad)`); assert.ok(Math.hypot(s.x, s.y) < 2, 'on the spot'); }
    else assert.ok(Math.abs(s.a) < 0.05, 'a car standing still can\'t turn');
  }
  assert.ok(VEHICLES.tank.mass > VEHICLES.bus.mass * 2, 'heavier than anything else on the road');
});

test('the turret turns to the driver\'s aim on its own, and the clients get its angle', () => {
  const { w, p, road } = scene();
  const v = w.spawnVehicle('tank', road.x + 400, road.y, 0, { npcOwned: false });
  seat(p.ped, v);
  p.ped.aimAngle = Math.PI / 2; p.lastInput = { ...p.lastInput, aim: Math.PI / 2 };
  run(w, 0.2);
  const part = tank.turretRel(v);
  assert.ok(part > 0.2 && part < Math.PI / 2, `on its way round (${part.toFixed(2)})`);
  run(w, 1);
  assert.ok(Math.abs(tank.turretRel(v) - Math.PI / 2) < 0.02, `pointing where the driver aims (${tank.turretRel(v).toFixed(2)})`);
  assert.ok(Math.abs(v.a) < 0.01, 'the hull stays put');
  const word = net._fields(w, v)[2];
  assert.ok(Math.abs(tank.byteRel(word >>> 24) - Math.PI / 2) < 0.03, 'its angle on the wire (the damage word\'s top byte)');
  assert.equal(word & 0xffffff, net._fields(w, v)[2] & 0xffffff, 'the damage under it untouched');
});

test('small arms barely scratch it; a shell flies, goes up where it lands and wrecks a car; one shell per reload', () => {
  const { w, p, road } = scene();
  const v = w.spawnVehicle('tank', road.x + 300, road.y, 0, { npcOwned: false });
  const shooter = spawnNpc(w, 'thug', road.x + 300, road.y + 160);
  shooter.weapon = 'rifle';
  for (let i = 0; i < 30; i++) { shooter.nextAttack = 0; combat.tryAttack(w, shooter, Math.atan2(v.y - shooter.y, v.x - shooter.x)); }
  assert.ok(v.hp > v.def.hp * 0.97, `thirty rifle rounds: a scratch (${Math.round(v.hp)} of ${v.def.hp})`);
  seat(p.ped, v);
  p.ped.aimAngle = 0;
  v.turA = 0;
  const car = w.spawnVehicle('sedan', road.x + 300 + 420, road.y, 0, { npcOwned: false });
  assert.ok(tank.fire(w, v, p.ped), 'fired');
  assert.ok(!tank.fire(w, v, p.ped), 'not again until it\'s reloaded');
  assert.ok(w.seen.some((e) => e.e === 'tankfire'), 'the muzzle flash and the boom');
  run(w, 1);
  assert.ok(w.seen.some((e) => e.e === 'explode' && Math.abs(e.x - car.x) < 140), 'the shell went up at the car');
  assert.ok(car.wreckAt || car.chain || car.dead, 'and the car with it');
  w.time += TANK.reload;
  assert.ok(tank.fire(w, v, p.ped), 'reloaded');
});

test('it shoves cars aside', () => {
  const { w, p, road } = scene();
  const v = w.spawnVehicle('tank', road.x + 300, road.y, 0, { npcOwned: false });
  const car = w.spawnVehicle('sedan', road.x + 300 + 140, road.y, Math.PI / 2, { npcOwned: false });
  const x0 = car.x;
  seat(p.ped, v);
  v.vx = 240;
  let seq = p.ack || 0;
  for (let i = 0; i < 30; i++) { p.inputQ.push({ seq: ++seq, bits: IN.TANK, mx: 0, my: -1, aim: 0 }); w.step(); }
  assert.ok(car.x - x0 > 60, `the car pushed along (${Math.round(car.x - x0)} px)`);
  assert.ok(Math.hypot(v.vx, v.vy) > 100, 'the tank hardly slowed');
});

test('the Boom Tester: a dev weapon whose shot sets off the kind picked where it lands; reload steps the kinds', () => {
  const { w, p, road } = scene();
  const W = WEAPONS.boomtest;
  assert.ok(W && W.dev && W.i === 29, 'in the weapons table (index 29)');
  p.profile.weapons.boomtest = 0; p.ped.weapon = 'boomtest';
  assert.equal(boomtest.kindOf(p), BOOM_TEST_KINDS[0]);
  combat.reload(w, p.ped);
  assert.equal(boomtest.kindOf(p), BOOM_TEST_KINDS[1], 'reload: the next kind');
  for (let i = 1; i < BOOM_TEST_KINDS.length; i++) combat.reload(w, p.ped);
  assert.equal(boomtest.kindOf(p), BOOM_TEST_KINDS[0], 'round again');
  // fired down the road: it goes up where it lands (the end of its range)
  p.ped.nextAttack = 0;
  assert.ok(combat.tryAttack(w, p.ped, 0), 'fired');
  run(w, 1);
  const ev = w.seen.find((e) => e.e === 'explode');
  assert.ok(ev && Math.abs(ev.x - (p.ped.x + 20 + W.range)) < 60, `where it landed (${ev && ev.x - p.ped.x})`);
  // each kind goes off as it says
  for (const k of BOOM_TEST_KINDS) {
    w.seen.length = 0;
    const x = road.x + 900, y = road.y;
    const ppl = k === 'fire' ? [spawnNpc(w, 'casual', x + 20, y), spawnNpc(w, 'casual', x - 20, y + 10)] : [];
    boomtest.boom(w, k, x, y, 0, 0);
    const ex = w.seen.find((e) => e.e === 'explode');
    assert.ok(ex, `${k}: an explosion`);
    if (k === 'tanker' || k === 'truck') assert.ok(ex.b >= 3, `${k}: a huge one (${ex.b})`);
    if (k === 'launch') assert.equal(ex.k, 'launch');
    if (k === 'pieces') assert.equal(ex.k, 'pieces');
    if (k === 'wheel') assert.equal(ex.wh, 1);
    if (k === 'fire') assert.ok(ppl.every((q) => q && burning.burning(q)), 'fire: those close by alight');
    for (const e of [...w.entities.values()]) if (e.kind === K.VEH) w.remove(e);
    run(w, 0.1);
  }
});
