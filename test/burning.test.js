// Fire on people (H58, server/systems/burning.js): what sets people alight - a blast, their vehicle blowing up with them
// in it, a fire arrow, walking into fire (a burning wreck, a lit campfire, someone else alight); a player puts it out
// fastest with dive rolls, slower running about, at once in the water, and the rain helps; burning NPCs run, stop, drop
// and roll, fall and burn, or run for the water; the death screen names it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad, run } from './helpers.js';
import { K, WEATHER } from '../shared/constants.js';
import { VEHICLES } from '../shared/vehicles.js';
import { blastSize } from '../shared/explosions.js';
import { BURN } from '../shared/rules.js';
import { WATER_T, PED_BLOCK } from '../shared/map.js';

const burning = await import('../server/systems/burning.js');
const explosions = await import('../server/systems/explosions.js');
const vehicles = await import('../server/systems/vehicles.js');
const campfires = await import('../server/systems/campfires.js');
const { spawnNpc } = await import('../server/systems/npc.js');
const net = await import('../server/net.js');

function scene() {
  const w = makeWorld();
  const p = joinPlayer(w).p;
  const road = straightRoad(w.map, 1600);
  teleport(w, p.ped, road.x + 60, road.y);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && e !== p.ped)) && Math.abs(e.y - road.y) < 500) w.remove(e);
  const emit = w.emit.bind(w);
  w.seen = [];
  w.emit = (x, y, ev) => { w.seen.push(ev); emit(x, y, ev); };
  return { w, p, road };
}
// how long a fire on the player lasts, doing what each step does (only the fire's own clock runs)
function burnsFor(w, ped, each) {
  ped.hp = ped.maxHp;
  assert.ok(burning.ignite(w, ped, null), 'alight');
  let t = 0;
  while (burning.burning(ped) && t < 40) { each(ped); w.time += 0.05; w.tick++; burning.update(w, 0.05); t += 0.05; }
  return t;
}

test('a player on fire: it hurts, the dive roll puts it out fastest, running slower, standing still slowest; rain helps; water at once', () => {
  const { w, p } = scene();
  const ped = p.ped;
  const still = burnsFor(w, ped, (q) => { q.vx = 0; q.vy = 0; q.rollT = 0; });
  assert.ok(Math.abs(still - BURN.secs) < 0.2, `left alone it burns BURN.secs (${still.toFixed(2)})`);
  assert.ok(ped.hp < ped.maxHp - 10, `and it hurts (${ped.hp.toFixed(1)})`);
  assert.ok(w.seen.some((e) => e.e === 'ignite' && e.id === ped.id) && w.seen.some((e) => e.e === 'scream'), 'the whoomph and the screams');
  const running = burnsFor(w, ped, (q) => { q.vx = 200; q.vy = 0; q.rollT = 0; });
  const rolling = burnsFor(w, ped, (q) => { q.vx = 0; q.vy = 0; q.rollT = 0.3; });
  assert.ok(rolling < running && running < still, `rolling ${rolling.toFixed(2)} < running ${running.toFixed(2)} < standing ${still.toFixed(2)}`);
  assert.ok(rolling < 1.5, 'a couple of rolls and it\'s out');
  w.weather = WEATHER.RAIN;
  const wet = burnsFor(w, ped, (q) => { q.vx = 0; q.vy = 0; q.rollT = 0; });
  assert.ok(wet < still / 1.8, `the rain puts it out faster (${wet.toFixed(2)})`);
  w.weather = WEATHER.CLEAR;
  // jumping in the water: out at once, with a hiss
  const wat = burning.waterNear(w.map, ped.x, ped.y, 6000);
  assert.ok(wat, 'water somewhere');
  burning.ignite(w, ped, null);
  teleport(w, ped, wat.x, wat.y);
  w.tick++; burning.update(w, 0.05);
  assert.ok(!burning.burning(ped), 'out in the water');
  assert.ok(w.seen.some((e) => e.e === 'douse'), 'the hiss');
  assert.ok(!burning.ignite(w, ped, null), 'nobody catches fire in the water');
});

test('the wire carries it (the parent field\'s top bit), and a death by fire says so', () => {
  const { w, p, road } = scene();
  burning.ignite(w, p.ped, null);
  const f = net._fields(w, p.ped);
  assert.ok(f[2] >= 0x80000000, 'the burn bit');
  assert.equal(f[2] - 0x80000000, 0, 'the parent under it');
  // burn to death (standing still, low on health)
  p.ped.hp = 3;
  for (let i = 0; i < 40 && !p.ped.dead; i++) { w.time += 0.05; w.tick++; burning.update(w, 0.05); }
  assert.ok(p.ped.dead, 'burned to death');
  assert.equal(p.deathCause, 'Burned to death.');
  // set alight by someone: named
  const { w: w2, p: p2, road: r2 } = scene();
  const q = spawnNpc(w2, 'thug', r2.x + 120, r2.y);
  burning.ignite(w2, p2.ped, q);
  p2.ped.hp = 2;
  for (let i = 0; i < 40 && !p2.ped.dead; i++) { w2.time += 0.05; w2.tick++; burning.update(w2, 0.05); }
  assert.ok(/^Burned to death - set alight by /.test(p2.deathCause || ''), p2.deathCause);
  void road;
});

test('what sets people alight: a blast, their car blowing up with them in it, a fire arrow, a burning wreck, a campfire, someone alight', () => {
  const { w, p, road } = scene();
  // a blast: people near its heart catch fire (most of them)
  const crowd = [];
  for (let i = 0; i < 12; i++) { const q = spawnNpc(w, 'casual', road.x + 600 + (i % 4) * 14 - 21, road.y + Math.floor(i / 4) * 14 - 14); if (q) { q.hp = q.maxHp = 400; crowd.push(q); } }
  explosions.blastAt(w, road.x + 600, road.y, blastSize(VEHICLES.sedan));
  const lit = crowd.filter((q) => burning.burning(q)).length;
  assert.ok(lit >= 6, `a blast sets those near it alight (${lit} of ${crowd.length})`);
  // their own car blowing up with them in it: thrown clear on fire (when they live through it)
  let thrown = false;
  for (let k = 0; k < 30 && !thrown; k++) {
    const v = w.spawnVehicle('sedan', road.x + 1000, road.y, 0, { npcOwned: false });
    const ped = p.ped;
    if (ped.dead) break;
    burning.douse(w, ped);
    ped.hp = ped.maxHp; ped.vehId = v.id; ped.seat = 0; v.seats[0] = ped.id;
    vehicles.explode(w, v, null);
    if (!ped.dead) { thrown = burning.burning(ped); assert.ok(thrown, 'thrown clear, on fire'); }
    else { const pl = p; pl.ped.dead = false; pl.ped.hp = pl.ped.maxHp; }
    w.remove(v);
  }
  assert.ok(thrown, 'someone lived through it, on fire');
  // a fire arrow
  const target = spawnNpc(w, 'casual', road.x + 1400, road.y);
  target.hp = target.maxHp = 500;
  const shooter = spawnNpc(w, 'thug', road.x + 1300, road.y);
  shooter.weapon = 'firebow';
  const proj = w.spawnProjectile(shooter.id, shooter.x + 20, shooter.y, 0, 900, 560, 'firebow');
  for (let i = 0; i < 20 && w.get(proj.id); i++) w.step();
  assert.ok(burning.burning(target) || target.dead, 'a fire arrow sets them alight');
  // a burning wreck: walk into it and you catch
  const wreck = w.spawnVehicle('sedan', road.x + 300, road.y + 200, 0, { npcOwned: false });
  wreck.wreckAt = w.time; wreck.hp = 0;
  const walker = spawnNpc(w, 'casual', 0, 0);
  walker.npc.desk = null;
  let caught = false;
  for (let i = 0; i < 200 && !caught; i++) { teleport(w, walker, wreck.x + wreck.def.L / 2 + 4, wreck.y); walker.vx = -80; w.tick++; w.time += 0.05; burning.update(w, 0.05); caught = burning.burning(walker); }
  assert.ok(caught, 'brushing against a burning wreck');
  // a lit campfire
  const i = w.map.props.findIndex((q) => q && q.t === 'campfire');
  campfires.setLit(w, i, true);
  const c = w.map.props[i], camper = spawnNpc(w, 'casual', c.x, c.y);
  caught = false;
  for (let k = 0; k < 200 && !caught && camper; k++) { teleport(w, camper, c.x + 4, c.y); camper.vx = 60; w.tick++; w.time += 0.05; burning.update(w, 0.05); caught = burning.burning(camper); }
  assert.ok(caught, 'walking into a campfire');
  // standing still beside a burning wreck: no (everyone else out of the way first: the walker is still stood where it
  // caught, moving - it'd catch again, and someone alight brushing past lights you)
  for (const b of [...w.burning]) burning.douse(w, b);
  for (const q of [walker, camper, target, shooter, ...crowd]) if (q && !q.removed) w.remove(q);
  wreck.wreckAt = w.time;
  const still = spawnNpc(w, 'casual', 0, 0);
  for (let i = 0; i < 100; i++) { teleport(w, still, wreck.x + wreck.def.L / 2 + 4, wreck.y); still.vx = 0; still.vy = 0; w.tick++; w.time += 0.05; burning.update(w, 0.05); }
  assert.ok(!burning.burning(still), 'standing still beside a fire you don\'t catch');
});

test('burning NPCs: some run, some stop, drop and roll (and live), some fall and burn to death; near water many run in', () => {
  const { w, road } = scene();
  const plans = {}, by = new Map();
  for (let i = 0; i < 60; i++) {
    const q = spawnNpc(w, 'casual', road.x + 200 + (i % 20) * 60, road.y + (Math.floor(i / 20) - 1) * 20);
    if (!q || burning.waterNear(w.map, q.x, q.y, BURN.waterPx)) { if (q) w.remove(q); continue; }
    q.hp = q.maxHp = 100;
    burning.ignite(w, q, null);
    const k = q.npc.burn.k;
    plans[k] = (plans[k] || 0) + 1;
    by.set(q, k);
  }
  assert.ok(plans.run > 3 && plans.roll > 3 && plans.fall > 3, JSON.stringify(plans));
  run(w, 14);
  let rolledOut = 0, fellDead = 0, fallers = 0, rollers = 0;
  for (const [q, k] of by) {
    if (k === 'roll') { rollers++; if (!q.dead && !burning.burning(q)) rolledOut++; }
    if (k === 'fall') { fallers++; if (q.dead) fellDead++; }
  }
  assert.ok(rolledOut >= rollers * 0.7, `the rollers put themselves out (${rolledOut} of ${rollers})`);
  assert.ok(fellDead >= fallers - 1, `the ones who fell burned to death (${fellDead} of ${fallers}; one may have run indoors first)`);
  // near the water: many run for it and jump in
  const wat = burning.waterNear(w.map, road.x, road.y, 8000);
  let land = null;
  for (let a = 0; a < 16 && !land; a++) for (const d of [120, 160, 200]) {
    const x = wat.x + Math.cos(a * 0.39) * d, y = wat.y + Math.sin(a * 0.39) * d;
    if (!PED_BLOCK[w.map.tileAtPx(x, y)] && !WATER_T[w.map.tileAtPx(x, y)]) { land = { x, y }; break; }
  }
  assert.ok(land, 'dry land by the water');
  let toWater = 0, n = 0;
  for (let i = 0; i < 20; i++) { const q = spawnNpc(w, 'casual', land.x, land.y); if (!q) continue; n++; burning.ignite(w, q, null); if (q.npc.burn && q.npc.burn.k === 'water') toWater++; }
  assert.ok(toWater >= n * 0.4, `near water many run for it (${toWater} of ${n})`);
});

// H78 (the owner's FI1 concept: catching, running, stop-drop-and-roll, lying smouldering, up singed, into the water, burned
// to death): the page picks the frame from what the record already carries - the burn bit, DOWN, MOVING, DEAD, the swim
// bit - plus the charred bit (the parent field's next bit) on someone burned to death.
test('the burning states on the wire: rolling, lying, getting up, in the water, burned to death (charred)', async () => {
  const { PF } = await import('../shared/constants.js');
  const combat = await import('../server/systems/combat.js');
  const { w, road } = scene();
  const rec = (q) => { const f = net._fields(w, q); return { fl: f[0], burn: f[2] >= 0x80000000, char: (f[2] & 0x40000000) !== 0, swim: (f[3] & 128) !== 0 }; };
  const pick = (k, x0) => {   // (the two well apart: a faller running about on fire beside the roller lights it again)
    for (let i = 0; i < 40; i++) {
      const q = spawnNpc(w, 'casual', road.x + x0 + i * 12, road.y);
      if (!q) continue;
      q.hp = q.maxHp = 100; burning.ignite(w, q, null);
      if (q.npc.burn && q.npc.burn.k === k) return q;
      burning.douse(w, q); w.remove(q);
    }
    return null;
  };
  const roller = pick('roll', 200), faller = pick('fall', 1000);
  assert.ok(roller && faller, 'a roller and a faller');
  const r0 = rec(roller);
  assert.ok(r0.burn && !(r0.fl & PF.DOWN) && !r0.char, 'catching: alight, on their feet');
  let sawRoll = false, sawLie = false, sawUp = false, sawChar = false;
  for (let i = 0; i < 400; i++) {
    w.time += 0.05; w.tick++; burning.update(w, 0.05);
    const a = rec(roller), b = rec(faller);
    if (a.burn && (a.fl & PF.DOWN) && (a.fl & PF.MOVING)) sawRoll = true;                       // rolling it out
    if (!a.burn && sawRoll && (a.fl & PF.DOWN) && !(a.fl & PF.DEAD)) sawUp = true;               // out, still down: getting up
    if (b.burn && (b.fl & PF.DOWN) && !(b.fl & PF.MOVING) && !(b.fl & PF.DEAD)) sawLie = true;   // lying, burning
    if (b.char) { sawChar = true; assert.ok(b.fl & PF.DEAD, 'only a body is charred'); }
  }
  assert.ok(sawRoll, 'rolling: burning, down and moving');
  assert.ok(sawUp, 'put out and still down a moment: getting up');
  assert.ok(sawLie, 'the faller lies burning, still');
  assert.ok(sawChar && faller.dead, 'burned to death: the charred bit');
  assert.ok(!rec(roller).char && !rec(roller).burn, 'the roller lives, not charred');
  // into the water: the swim bit, the burn bit gone, a 'douse' to hiss and steam
  const wat = burning.waterNear(w.map, road.x, road.y, 8000);
  const s = spawnNpc(w, 'casual', road.x + 40, road.y);
  burning.ignite(w, s, null);
  teleport(w, s, wat.x, wat.y);
  w.seen.length = 0;
  w.tick++; burning.update(w, 0.05);
  const c = rec(s);
  assert.ok(c.swim && !c.burn && !c.char, 'in the water: swimming, out');
  assert.ok(w.seen.some((e) => e.e === 'douse'), 'the douse (the steam)');
  // killed some other way: never charred
  const z = spawnNpc(w, 'casual', road.x + 80, road.y);
  combat.kill(w, z, null, 'vehicle');
  assert.ok(!rec(z).char, 'not charred by anything but fire');
});

// H78: the frames the page draws someone on fire with (client/main.js pedLook: flailing, running, rolling, lying, pushing
// up, swimming, dead) build in art v2 (client/art2/game/peds.js), and the machines the concepts redrew (the green combine,
// the tractor, the tank, the grey gunship) still build
test('the fire frames\' poses and the redrawn machines build in art v2', async () => {
  const Pd = await import('../client/art2/game/peds.js');
  const { vehicleModel } = await import('../client/art2/vehicles.js');
  const AM = await import('../client/art2/aircraft.js');
  const app = Pd.adaptApp({ s: 2, h: 1, hc: '#2a1a10', t: 1, tc: '#3f5a2a', tc2: '#dddddd', l: '#1d2a5a', sh: '#e8e8e8', ht: 1, htc: '#c8262b', bd: 1 }, 'casual');
  for (const pose of ['stagger', 'walk3', 'roll', 'down', 'downF', 'swim', 'dead']) {
    const G = Pd.pedSprite(app, pose, 2, Pd.pedFrame(pose, 1), 0, {});
    let n = 0;
    for (let i = 3; i < G.col.length; i += 4) if (G.col[i] > 128) n++;
    assert.ok(n > 60, `${pose}: ${n} px`);
  }
  for (const t of ['combine', 'tractor', 'tank']) assert.ok(vehicleModel(t).anchors, t);
  assert.ok(AM.bodyModel('gunship'), 'the gunship');
  assert.equal(AM.TYPES.gunship.body, '#646a70', 'grey (MV1)');
});
