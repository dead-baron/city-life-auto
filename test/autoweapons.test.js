// Fully automatic weapons (task #318; the owner, 10-15: "flamethrower and fully automatic assault rifles in the debug
// menu"): the assault rifle fires as long as the trigger's held, ten shots a second; the flamethrower's cone of fire
// sets people alight and scorches cars, but only in front. Both are past the wire's five weapon bits: in hand they show
// as the police assault rifle and the bazooka (net.js handIndex).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { SHOPS, WEAPONS } from '../shared/items.js';
import { burning } from '../server/systems/burning.js';
import * as net from '../server/net.js';

function openGround(m, r = 10) {
  const ok = (t) => t === T.ROAD || t === T.PLAZA || t === T.LOT || t === T.GRASS || t === T.SIDEWALK;
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 5) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 5) {
    let all = true;
    for (let dy = -r; dy <= r && all; dy++) for (let dx = -r; dx <= r && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
let seq = 0;
const hold = (w, p, bits, n) => { for (let i = 0; i < n; i++) { p.inputQ.push({ seq: ++seq, bits, mx: 0, my: 0, aim: 0 }); w.step(); } };

test('the assault rifle: hold the trigger and it keeps firing, about ten shots a second; in hand, the police rifle', () => {
  assert.ok(SHOPS.fence.buy.some((o) => o.id === 'arifle') && SHOPS.smuggler.buy.some((o) => o.id === 'flamer'), 'for sale where the illegal guns are');
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.profile.weapons.arifle = 90; p.ped.weapon = 'arifle'; p.ped.mag.arifle = 30;
  hold(w, p, IN.FIRE | IN.AIMING, 20);   // (a second)
  const fired = 30 - p.ped.mag.arifle;
  assert.ok(fired >= 8 && fired <= 12, `${fired} shots in a second`);
  const [, , , extra] = net._fields(w, p.ped);
  assert.equal(extra & 31, WEAPONS.passault.i, 'shown as the police assault rifle');
});

test('the flamethrower: everyone in the cone in front set alight and hurt, nobody behind; a car in front scorched', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const at = openGround(w.map);
  teleport(w, p.ped, at.x, at.y);
  p.ped.a = 0;
  const { p: front } = joinPlayer(w), { p: back } = joinPlayer(w);
  teleport(w, front.ped, at.x + 90, at.y + 6);
  teleport(w, back.ped, at.x - 90, at.y);
  const car = w.spawnVehicle('sedan', at.x + 60, at.y + 70, 0, { parked: true });
  const hpF = front.ped.hp, hpB = back.ped.hp, hpC = car.hp;
  p.profile.weapons.flamer = 120; p.ped.weapon = 'flamer'; p.ped.mag.flamer = 60;
  hold(w, p, IN.FIRE | IN.AIMING, 6);
  assert.ok(burning(front.ped) && front.ped.hp < hpF, 'in front: alight');
  assert.ok(!burning(back.ped) && back.ped.hp === hpB, 'behind: untouched');
  // (the car, off to one side of the jet: aimed at it)
  const a = Math.atan2(car.y - p.ped.y, car.x - p.ped.x);
  for (let i = 0; i < 6; i++) { p.inputQ.push({ seq: ++seq, bits: IN.FIRE | IN.AIMING, mx: 0, my: 0, aim: a }); w.step(); }
  assert.ok(car.hp < hpC, 'the car scorched');
  const [, , , extra] = net._fields(w, p.ped);
  assert.equal(extra & 31, WEAPONS.rocket.i, 'shown as the bazooka\'s tube');
});
