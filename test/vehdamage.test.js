// Vehicle damage you can see (task #402): hits land on a vehicle's body (its rotated box), weapons damage vehicles (the
// strong ones a lot), the plasma blade cuts one in two, and the damage travels to the clients as one word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, straightRoad } from './helpers.js';
import { K } from '../shared/constants.js';
import { VDMG, VZ, VPART, packVehDamage, unpackVehDamage, damageStage, hitZone } from '../shared/vehicles.js';
import { PLASMA_CUT, VEHICLE_WEAPON } from '../shared/rules.js';
const vehicles = await import('../server/systems/vehicles.js');
const combat = await import('../server/systems/combat.js');
const net = await import('../server/net.js');

// a clear stretch of road, a player beside it (keeps it simulated); every event kept
function scene() {
  const w = makeWorld();
  const p = joinPlayer(w).p;
  const road = straightRoad(w.map, 1600);
  teleport(w, p.ped, road.x + 60, road.y - road.hw - 60);
  for (const e of [...w.entities.values()]) if ((e.kind === K.VEH || (e.kind === K.PED && e !== p.ped)) && Math.abs(e.y - road.y) < 400) w.remove(e);
  const emit = w.emit.bind(w);
  w.seen = [];
  w.emit = (x, y, ev) => { w.seen.push(ev); emit(x, y, ev); };
  p.ped.protectUntil = 0;
  return { w, p, road };
}
const events = (w, kind) => w.seen.filter((ev) => ev.e === kind);
// arm the player and swing / fire once at aim (cooldowns cleared)
function attack(w, ped, weapon, aim) {
  ped.weapon = weapon; ped.nextAttack = 0; ped.reloadUntil = 0; ped.protectUntil = 0;
  if (ped.player) { ped.mag = ped.mag || {}; ped.mag[weapon] = 99; ped.player.profile.weapons[weapon] = 99; }
  return combat.tryAttack(w, ped, aim);
}

test('the damage word: stage, sides, holes, parts and the cut round-trip; the stage follows health', () => {
  const o = { stage: VDMG.HANGING, zones: VZ.F | VZ.R, holes: 5, off: VPART.BUMPER_F | VPART.DOOR_R | VPART.WHEEL, cut: 131 };
  assert.deepEqual(unpackVehDamage(packVehDamage(o)), o);
  assert.equal(unpackVehDamage(0).stage, VDMG.NEW);
  assert.deepEqual([1, 0.8, 0.5, 0.2].map((h) => damageStage(h, false, false)), [VDMG.NEW, VDMG.SCUFFED, VDMG.DENTED, VDMG.CRUMPLED]);
  assert.equal(damageStage(0, true, false), VDMG.HANGING);
  assert.equal(damageStage(0, true, true), VDMG.BURNT);
  // sides: heading 0 faces east, its right side south
  assert.equal(hitZone(0, 0, 0, 50, 24, 60, 0), VZ.F);
  assert.equal(hitZone(0, 0, 0, 50, 24, -55, 3), VZ.B);
  assert.equal(hitZone(0, 0, 0, 50, 24, 10, 30), VZ.R);
  assert.equal(hitZone(0, 0, 0, 50, 24, 10, -30), VZ.L);
  assert.equal(hitZone(0, 0, Math.PI / 2, 50, 24, 0, 60), VZ.F, 'turned south: its nose is south');
});

test('a blow lands on a vehicle\'s body, not its middle: a bat at its nose, well away from its centre, dents the front', () => {
  const { w, p, road } = scene();
  const car = w.spawnVehicle('sedan', road.x + 400, road.y, 0, { npcOwned: false });
  // 30 px in front of the nose (80 px from its middle - out of a bat's reach of the centre), facing it
  teleport(w, p.ped, car.x + car.def.L / 2 + 26, car.y + 6);
  const hp0 = car.hp;
  attack(w, p.ped, 'bat', Math.PI);
  assert.ok(car.hp < hp0, 'the bat hit it');
  assert.equal(car.dz & VZ.F, VZ.F, 'dented at the front');
  // at its tail, from behind: the back
  teleport(w, p.ped, car.x - car.def.L / 2 - 26, car.y - 8);
  attack(w, p.ped, 'bat', 0);
  assert.equal(car.dz & VZ.B, VZ.B, 'and at the back');
  // a swing at the air beside it misses
  const hp1 = car.hp;
  teleport(w, p.ped, car.x, car.y - car.def.W / 2 - 30);
  attack(w, p.ped, 'bat', -Math.PI / 2);
  assert.equal(car.hp, hp1, 'facing away: no hit');
});

test('guns damage vehicles where the rounds go in, the strong ones a lot: a rifle round tears in far more than a pistol\'s', () => {
  const { w, p, road } = scene();
  const a = w.spawnVehicle('sedan', road.x + 400, road.y, 0, { npcOwned: false });
  const b = w.spawnVehicle('sedan', road.x + 900, road.y, 0, { npcOwned: false });
  // from the side (south of it), a few steps off: the right side
  teleport(w, p.ped, a.x, a.y + 90);
  attack(w, p.ped, 'pistol', -Math.PI / 2);
  const pistol = a.def.hp - a.hp;
  teleport(w, p.ped, b.x, b.y + 90);
  attack(w, p.ped, 'rifle', -Math.PI / 2);
  const rifle = b.def.hp - b.hp;
  assert.ok(pistol > 0 && rifle > pistol * 2.5, `pistol ${pistol.toFixed(1)} rifle ${rifle.toFixed(1)}`);
  assert.equal(b.dz, VZ.R, 'holed on the right side');
  assert.ok(b.holes >= 1);
  // a sedan's engine dies after about ten rifle rounds or five shotgun blasts
  const per = 28 * VEHICLE_WEAPON.rifle / vehicles.toughOf(b.def);
  assert.ok(b.def.hp / per > 7 && b.def.hp / per < 13);
  const c = w.spawnVehicle('sedan', road.x + 1300, road.y, 0, { npcOwned: false });
  teleport(w, p.ped, c.x, c.y + 70);
  let blasts = 0;
  while (!c.dead && blasts < 20) { attack(w, p.ped, 'shotgun', -Math.PI / 2); blasts++; }
  assert.ok(c.dead && blasts <= 8, `shotgun blasts to kill it: ${blasts}`);
  // it goes onto the wire: shot up, holed on the right
  const d = unpackVehDamage(net._fields(w, c)[2]);
  assert.equal(d.stage, VDMG.HANGING);
  assert.ok(d.holes >= 3 && (d.zones & VZ.R));
});

test('the plasma blade cuts a car in two in a few hits: the halves on the wire, everyone out, and it explodes', () => {
  const { w, p, road } = scene();
  const car = w.spawnVehicle('sedan', road.x + 400, road.y, 0, { npcOwned: false });
  teleport(w, p.ped, car.x + 4, car.y - car.def.W / 2 - 22);   // beside it, by its middle
  const need = vehicles.plasmaCuts(car.def);
  assert.equal(need, PLASMA_CUT.car);
  for (let i = 0; i < need - 1; i++) attack(w, p.ped, 'plasma', Math.PI / 2);
  assert.ok(!car.cutQ && !car.wreckAt, 'not yet');
  attack(w, p.ped, 'plasma', Math.PI / 2);
  assert.ok(car.cutQ > 0 && car.dead, 'cut through: its engine dead');
  const cut = events(w, 'vcut');
  assert.equal(cut.length, 1);
  assert.equal(cut[0].id, car.id);
  const d = unpackVehDamage(net._fields(w, car)[2]);
  assert.ok(Math.abs(d.cut - 128) < 40, `cut near where the blade went in (${d.cut})`);
  assert.equal(d.zones & VZ.L, VZ.L, 'from its left side');
  // the halves slide apart, then it goes up (stand well back)
  teleport(w, p.ped, car.x + 700, car.y - 300);
  for (let t = 0; t < PLASMA_CUT.boomS + 0.5 && !car.wreckAt; t += 0.05) w.step(0.05);
  assert.ok(car.wreckAt, 'it exploded');
  assert.equal(unpackVehDamage(net._fields(w, car)[2]).cut, d.cut, 'the wreck stays in two');
  assert.equal(events(w, 'explode').filter((ev) => ev.id === car.id).length, 1);
  // a motorbike: one stroke
  const bike = w.spawnVehicle('bike', road.x + 1100, road.y, 0, { npcOwned: false });
  teleport(w, p.ped, bike.x, bike.y - 30);
  assert.ok(!p.ped.dead);
  attack(w, p.ped, 'plasma', Math.PI / 2);
  assert.ok(bike.cutQ > 0, 'a motorbike, cut in one');
});

test('as it gets worse parts come off: the bumper on the end that took the hits, then the bonnet and a door left hanging', () => {
  const { w, road } = scene();
  const car = w.spawnVehicle('sedan', road.x + 400, road.y, 0, { npcOwned: false });
  vehicles.damageVehicle(w, car, car.def.hp * 0.2, null, true, false, VZ.B);
  assert.equal(events(w, 'vpart').length, 0, 'scuffed: nothing off yet');
  vehicles.damageVehicle(w, car, car.def.hp * 0.5, null, true, false, VZ.B);
  const off = events(w, 'vpart');
  assert.equal(off.length, 1);
  assert.equal(off[0].k, VPART.BUMPER_B, 'hit from behind: the rear bumper');
  assert.ok(off[0].x < car.x, 'it falls at the back');
  vehicles.damageVehicle(w, car, car.def.hp, null, true, false, VZ.L);   // the engine dies
  const d = unpackVehDamage(net._fields(w, car)[2]);
  assert.equal(d.stage, VDMG.HANGING);
  assert.ok(d.off & VPART.DOOR_L, 'the left door hangs');
  assert.ok(d.off & VPART.BUMPER_B);
  assert.equal(d.zones, VZ.B | VZ.L);
});

test('a rocket by the tail of a bus destroys it: the blast is measured to its body, not its middle', () => {
  const { w, p, road } = scene();
  const bus = w.spawnVehicle('bus', road.x + 500, road.y, 0, { npcOwned: false });
  const tailX = bus.x - bus.def.L / 2 - 20;   // 115 px from its middle, 20 px from its tail
  combat.blast(w, tailX, bus.y, 110, 130, p.ped, 0, true);
  assert.ok(bus.wreckAt || bus.hp <= 0, 'blown up');
});

test('art v2 draws the damage into the model from the word: a few looks per stage, keyed and cached; a cut car\'s halves', async () => {
  const A = await import('../client/art2/game/actors.js');
  const { vehicleModel } = await import('../client/art2/vehicles.js');
  const d = { m: 1, p: 3, vr: 1, tn: -1 };
  const key = (o, hp = 1, flags = 0, half) => A.vehicleKey(d, { ...A.vehState(flags, 1, hp, packVehDamage({ stage: 0, zones: 0, holes: 0, off: 0, cut: 0, ...o })), ...(half ? { half } : null) }, 0, 32);
  const keys = new Set([key({}), key({ stage: 1, zones: VZ.F }), key({ stage: 2, zones: VZ.F }), key({ stage: 3, zones: VZ.F, off: VPART.BUMPER_F }), key({ stage: 4, zones: VZ.F, off: VPART.BONNET | VPART.DOOR_L })]);
  assert.equal(keys.size, 5, 'each stage its own look');
  assert.equal(key({ stage: 2, zones: VZ.F, holes: 1 }), key({ stage: 2, zones: VZ.F, holes: 2 }), 'holes in steps: one look for 1-2');
  assert.equal(key({ stage: 0 }, 1, 16), key({ stage: 5, zones: VZ.F, holes: 7, off: 63 }, 0, 16), 'the burnt shell: one look');
  assert.notEqual(key({ stage: 4, cut: 128 }, 0, 0, 'a'), key({ stage: 4, cut: 128 }, 0, 0, 'b'));
  const count = (m) => { let n = 0; for (let i = 0; i < m.v.length; i++) if (m.v[i]) n++; return n; };
  const clean = vehicleModel('sedan', { paint: '#2f6f73', dry: true });
  const crumpled = vehicleModel('sedan', { paint: '#2f6f73', dry: true, damage: { stage: 3, zones: VZ.F, holes: 0, off: VPART.BUMPER_F } });
  assert.ok(count(crumpled) < count(clean) * 0.97, 'the front crumpled in, the bumper gone');
  const a = vehicleModel('sedan', { paint: '#2f6f73', dry: true, half: 'a', cut: 128 }), b = vehicleModel('sedan', { paint: '#2f6f73', dry: true, half: 'b', cut: 128 });
  assert.ok(Math.abs(count(a) + count(b) - count(clean)) < count(clean) * 0.01, 'two halves make the car');
  let glowing = 0;
  for (let i = 0; i < a.v.length; i++) if (a.v[i] && a.mats[a.v[i]].emi) glowing++;
  assert.ok(glowing > 50, 'the cut face glows');
});
