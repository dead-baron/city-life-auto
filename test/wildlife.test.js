// The open country: few people (and only ones who belong out there), quiet roads, and the
// animals - deer, rabbits, coyotes and raccoons in the woods and hills, the farms' livestock - that
// bolt from people, cars and gunfire, and can be run over without the police caring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T } from '../shared/constants.js';
import { DISTRICTS } from '../shared/map.js';
import * as wildlife from '../server/systems/wildlife.js';
import * as combat from '../server/systems/combat.js';
import * as players from '../server/systems/players.js';
import { APOSE } from '../shared/fauna.js';

// a ground point near the middle of a district
function middleOf(w, name) {
  const m = w.map;
  let sx = 0, sy = 0, n = 0;
  const pts = [];
  for (let ty = 0; ty < m.h; ty += 4) for (let tx = 0; tx < m.w; tx += 4) {
    if (DISTRICTS[m.dist[ty * m.w + tx]].name !== name) continue;
    sx += tx; sy += ty; n++;
    const t = m.tiles[ty * m.w + tx];
    if (t === T.GRASS || t === T.DIRT || t === T.SIDEWALK || t === T.PLAZA) pts.push([tx, ty]);
  }
  assert.ok(n > 0, name);
  const cx = sx / n, cy = sy / n;
  pts.sort((a, b) => (a[0] - cx) ** 2 + (a[1] - cy) ** 2 - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
  // the open country: the nearest such spot to the middle that is well away from any business or home (a roadside
  // stop or a cottage brings its own people)
  const far = pts.find(([tx, ty]) => m.pois.every((q) => Math.hypot(q.x - tx * 32, q.y - ty * 32) > 1700)) || pts[0];
  return { x: far[0] * 32 + 16, y: far[1] * 32 + 16 };
}
function clear(w) { for (const e of [...w.entities.values()]) if ((e.kind === K.PED && !e.player) || (e.kind === K.VEH && !e.owner)) w.remove(e); }

test('out in the wilds: animals round you, a few people who belong there, quiet roads; in town: no animals', () => {
  const w = makeWorld({ npcBudget: 200 });
  const { p } = joinPlayer(w);
  const COUNTRY_FOLK = new Set(['hiker', 'camper', 'farmer', 'nomad', 'casual', 'construction', 'senior']);
  for (const name of ['Highland Woods', 'Granite Peaks', 'Cedar Farms']) {
    clear(w);
    const at = middleOf(w, name);
    assert.ok(wildlife.wildStyle(w.map, at.x, at.y), `${name} is open country`);
    teleport(w, p.ped, at.x, at.y);
    run(w, 25);
    const animals = w.query(at.x, at.y, 1400, K.PED).filter((e) => e.wild);
    assert.ok(animals.length >= 4, `${name}: animals about (${animals.length})`);
    const walkers = w.query(at.x, at.y, 1200, K.PED).filter((e) => e.npc && !e.dead && !e.vehId);
    assert.ok(walkers.length <= 5, `${name}: only a few people (${walkers.length})`);
    for (const q of walkers) assert.ok(COUNTRY_FOLK.has(q.npc.archetype), `${name}: a ${q.npc.archetype} out here?`);
    const cars = w.query(at.x, at.y, 1400, K.VEH).filter((v) => v.ai && v.ai.kind === 'traffic');
    assert.ok(cars.length <= 3, `${name}: quiet roads (${cars.length} cars)`);
  }
  // round the farms, the livestock
  clear(w);
  const farm = w.map.pois.find((q) => q.kind === 'farm');
  teleport(w, p.ped, farm.x, farm.y + 120);
  run(w, 25);
  const herd = w.query(farm.x, farm.y, 1500, K.PED).filter((e) => e.wild && ['cow', 'sheep', 'horse', 'goat', 'pig'].includes(e.wild.kind));
  assert.ok(herd.length >= 2, `livestock round the farm (${herd.length})`);
  // downtown: people everywhere, no deer
  clear(w);
  const dt = middleOf(w, 'Downtown');
  teleport(w, p.ped, dt.x, dt.y);
  run(w, 20);
  assert.equal(w.query(dt.x, dt.y, 1400, K.PED).filter((e) => e.wild).length, 0, 'no animals in town');
  assert.ok(w.query(dt.x, dt.y, 1200, K.PED).filter((e) => e.npc && !e.dead && !e.vehId).length >= 10, 'a busy street');
  // walk away and they're cleared
  clear(w);
  const wood = middleOf(w, 'Highland Woods');
  teleport(w, p.ped, wood.x, wood.y);
  run(w, 10);
  assert.ok(wildlife.animals(w).length > 0);
  teleport(w, p.ped, dt.x, dt.y);
  run(w, 3);
  assert.equal(wildlife.animals(w).filter((a) => Math.hypot(a.x - wood.x, a.y - wood.y) < 1500).length, 0, 'gone once nobody is near');
});

// walk a player along (mx, my) for secs (or until stop() says so); returns the closest it got to `to`
let seq = 1;
function walk(w, p, mx, my, secs, to = null, stop = () => false) {
  let closest = Infinity;
  for (let i = 0; i < secs * 20 && !stop(); i++) {
    players.queueInput(p, { seq: seq++, bits: 0, mx, my, aim: Math.atan2(my, mx) });
    w.step();
    if (to) closest = Math.min(closest, Math.hypot(to.x - p.ped.x, to.y - p.ped.y));
  }
  return closest;
}

test('animals bolt from you (the herd runs together); hitting one with a car or a bullet is no crime', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = middleOf(w, 'Highland Woods');
  clear(w);
  teleport(w, p.ped, at.x + 900, at.y);
  const a = wildlife.spawnAnimal(w, 'deer', at.x, at.y, 77), b = wildlife.spawnAnimal(w, 'deer', at.x + 30, at.y + 10, 77);
  b.wild.lead = false; a.wild.lead = true;
  w.windHold = { a: Math.PI / 2, s: 0.6 };   // (a cross wind: no scent either way)
  run(w, 1);
  assert.ok(Math.hypot(a.vx, a.vy) < 80, 'grazing while nobody is near');
  // walk straight up on them in plain sight: they see you coming and bolt before you're close
  teleport(w, p.ped, a.x - 560, a.y);
  const closest = walk(w, p, 0.85, 0, 8, a, () => a.wild.state === 'flee');
  assert.equal(a.wild.state, 'flee', 'the deer bolts');
  assert.ok(closest > 200, `long before you're on top of it (${Math.round(closest)} px)`);
  assert.equal(b.wild.state, 'flee', 'and the rest of the herd with it');
  walk(w, p, 0, 0, 0.1);   // (stop walking)
  const d0 = Math.hypot(a.x - p.ped.x, a.y - p.ped.y);
  run(w, 1.2);
  assert.ok(Math.hypot(a.vx, a.vy) > 200, `running (${Math.round(Math.hypot(a.vx, a.vy))} px/s)`);
  assert.ok(Math.hypot(a.x - p.ped.x, a.y - p.ped.y) > d0 + 150, 'away from you');
  // shoot one: it dies, nobody calls it in, no ambulance comes for it
  const c = wildlife.spawnAnimal(w, 'coyote', p.ped.x + 60, p.ped.y);
  combat.damage(w, c, 999, p.ped, 'pistol');
  assert.ok(c.dead);
  assert.equal(p.wanted, 0, 'no crime');
  assert.equal(p.heat || 0, 0);
  assert.ok(!w.bodies.has(c), 'no ambulance for a coyote');
  // run one over
  const r = wildlife.spawnAnimal(w, 'rabbit', p.ped.x + 200, p.ped.y);
  // (a clear run for the car: no tree or rock in the lane)
  for (const arr of w.map.solidProps.values()) for (const e of arr) if (Math.abs(e.y - p.ped.y) < 70 && e.x > p.ped.x - 20 && e.x < p.ped.x + 700) e.off = true;
  const car = w.spawnVehicle('sedan', p.ped.x + 120, p.ped.y, 0, { npcOwned: false });
  p.ped.vehId = car.id; p.ped.seat = 0; car.seats[0] = p.ped.id;
  car.vx = 400;
  for (let i = 0; i < 20 && !r.dead && r.hp === r.maxHp; i++) w.step();
  assert.ok(r.dead || r.hp < r.maxHp, 'hit');
  assert.equal(p.wanted, 0, 'roadkill is no crime');
});

test('stalking: creep up slowly from downwind and you get much closer than walking up', () => {
  const tryApproach = (creep) => {
    const w = makeWorld();
    const { p } = joinPlayer(w);
    const at = middleOf(w, 'Highland Woods');
    clear(w);
    for (const arr of w.map.solidProps.values()) for (const e of arr) if (Math.abs(e.y - at.y) < 60 && e.x > at.x - 700 && e.x < at.x + 60) e.off = true;
    const a = wildlife.spawnAnimal(w, 'deer', at.x, at.y, 0);
    a.wild.lead = true; a.a = 0;   // grazing, facing east, away from you: you come from the west
    a.wild.until = w.time + 999; a.wild.act = APOSE.graze;
    w.windHold = { a: Math.PI, s: 0.8 };   // the wind blows from the deer toward you (west): no scent of you reaches it
    teleport(w, p.ped, at.x - 600, at.y);
    run(w, 0.5);
    return walk(w, p, creep ? 0.3 : 0.9, 0, creep ? 30 : 10, a, () => a.wild.state === 'flee' || a.wild.state === 'trotoff' || Math.hypot(a.x - p.ped.x, a.y - p.ped.y) < 60);
  };
  const walked = tryApproach(false), crept = tryApproach(true);
  assert.ok(crept < walked - 60, `creeping got closer (${Math.round(crept)} px) than walking (${Math.round(walked)} px)`);
});

test('the wilds by habitat: elk and bears in the redwoods, goats on the cliffs, ducks on the water, quail in coveys', () => {
  const w = makeWorld();
  const m = w.map;
  const tagsAt = (name) => { const at = middleOf(w, name); return wildlife.habitatAt(m, at.x, at.y); };
  const hw = tagsAt('Highland Woods');
  assert.ok(hw.forest || hw.meadow, `Highland Woods is forest or meadow (${Object.keys(hw)})`);
  assert.ok(tagsAt('Granite Peaks').mountain, 'Granite Peaks is mountain country');
  assert.ok(tagsAt('Dry Creek Desert').desert, 'the desert');
  // a lake reads as a lake
  const lakeTile = m.tiles.findIndex((t, i) => m.lake[i] && (t === T.WATER || t === T.DEEP) && wildlife.wildStyle(m, (i % m.w) * 32, Math.floor(i / m.w) * 32));
  const lt = wildlife.habitatAt(m, (lakeTile % m.w) * 32 + 16, Math.floor(lakeTile / m.w) * 32 + 16);
  assert.ok(lt.lake || lt.pond, `a lake (${Object.keys(lt)})`);
  // a covey: a cock, a hen and a string of chicks that follow her
  const { p } = joinPlayer(w);
  const at = middleOf(w, 'Highland Woods');
  clear(w);
  teleport(w, p.ped, at.x + 1200, at.y);
  let made = 0;
  for (let k = 0; k < 20 && !made; k++) {
    for (const e of [...w.entities.values()]) if (e.wild) w.remove(e);
    made = wildlife.spawnGroup(w, 'quail', at.x, at.y);
    if (!wildlife.animals(w).some((e) => e.wild.young)) made = 0;
  }
  const covey = wildlife.animals(w).filter((e) => e.wild.kind === 'quail');
  assert.ok(covey.length >= 4 && covey.some((e) => e.wild.young), `a covey with chicks (${covey.length})`);
  const hen = covey.find((e) => !e.wild.young && e.wild.lead);
  run(w, 2);
  for (const c of covey.filter((e) => e.wild.young)) assert.ok(Math.hypot(c.x - hen.x, c.y - hen.y) < 120, 'the chicks keep near the hen');
});

test('shots scare the animals off', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = middleOf(w, 'Granite Peaks');
  clear(w);
  teleport(w, p.ped, at.x + 450, at.y);
  const a = wildlife.spawnAnimal(w, 'rabbit', at.x, at.y);
  run(w, 0.5);
  assert.notEqual(a.wild.state, 'flee');
  w.shotLog.push({ x: at.x + 400, y: at.y, t: w.time });
  run(w, 0.5);
  assert.equal(a.wild.state, 'flee', 'a gunshot nearby');
});
