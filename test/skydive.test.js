// Jumping out of an aircraft (the owner, 10-16: "Jumping out of an aircraft: fall all the way down (splat or bounce); a
// parachute to equip" - server/systems/skydive.js): you fall all the way down, steering; a parachute opens with the action
// button and floats you down to a soft landing (used up); without one, the ground from high up is the end of you, the
// water you live through. The fall rides on the wire in the ped's parent word.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport, calmWater, players } from './helpers.js';
import { T, TILE, K } from '../shared/constants.js';
import { IN } from '../shared/input.js';
import { WATER_T } from '../shared/mapcore.js';
import { SKYDIVE } from '../shared/rules.js';
import { SHOPS } from '../shared/items.js';
import { CTRL } from '../shared/protocol.js';
import * as skydive from '../server/systems/skydive.js';
import * as aircraft from '../server/systems/aircraft.js';
import * as net from '../server/net.js';

// open ground: a spot whose tiles all round are kind, far enough in from the edge
function spotOf(m, ok) {
  for (let ty = m.y0 + 40; ty < m.y0 + m.h - 40; ty += 7) for (let tx = m.x0 + 40; tx < m.x0 + m.w - 40; tx += 7) {
    let all = true;
    for (let dy = -9; dy <= 9 && all; dy++) for (let dx = -9; dx <= 9 && all; dx++) if (!ok(m.tiles[m.idx(tx + dx, ty + dy)])) all = false;
    if (all) return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }
  return null;
}
let seq = 0;
const send = (w, p, bits, mx = 0, my = 0) => { p.inputQ.push({ seq: ++seq, bits, mx, my, aim: 0 }); w.step(); };

test('the parachute: sold at the sports shops; opened with the action button, a slow float down, a soft landing - and it\'s used up', () => {
  assert.ok(SHOPS.sports.buy.some((o) => o.id === 'parachute'), 'on the sports shops\' shelves');
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.parachute = 1;
  const at = spotOf(w.map, (t) => t === T.GRASS || t === T.PLAZA || t === T.SIDEWALK || t === T.ROAD || t === T.LOT);
  assert.ok(at, 'open ground');
  teleport(w, p.ped, at.x, at.y);
  skydive.start(w, p.ped, { alt: 900, vx: 0, vy: 0 });
  assert.ok(p.ped.sky, 'up in the sky');
  // a moment of free fall, then the prompt and the action button
  for (let i = 0; i < 6; i++) send(w, p, 0);
  assert.ok(p.ped.sky && p.ped.sky.z < 900 && p.ped.sky.vz > 50, 'falling, faster and faster');
  const act = players.findInteraction(w, p);
  assert.ok(act && /parachute/i.test(act.label), act && act.label);
  // on the wire: up, how high, canopy shut - and the page doesn't predict it (the server steps the fall)
  let [, , word] = net._fields(w, p.ped);
  assert.ok(word & 0x20000000 && !(word & 0x10000000) && Math.abs((word & 0xfff) - p.ped.sky.z) < 2, 'the parent word: up, the height');
  send(w, p, IN.ACTION); send(w, p, 0);
  assert.ok(p.ped.sky.open, 'the canopy out');
  assert.ok(!prof.inventory.parachute, 'used up');
  [, , word] = net._fields(w, p.ped);
  assert.ok(word & 0x10000000, 'the canopy on the wire');
  // floating down slowly, steering east
  run(w, SKYDIVE.openS + 1.5);
  assert.ok(Math.abs(p.ped.sky.vz - SKYDIVE.chuteFall) < 25, `a slow sink (${p.ped.sky.vz.toFixed(0)} px/s)`);
  const x0 = p.ped.x, hp = p.ped.hp;
  for (let i = 0; i < 40; i++) send(w, p, 0, 1, 0);
  assert.ok(p.ped.x > x0 + 60, 'steered east');
  let n = 0; while (p.ped.sky && n++ < 20 * 30) send(w, p, 0);
  assert.ok(!p.ped.sky, 'down');
  assert.ok(!p.ped.dead && p.ped.hp >= hp - 1, 'unhurt');
});

test('no parachute: a long fall - the ground from high up is a splat; into the water you live', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ground = spotOf(w.map, (t) => t === T.GRASS || t === T.PLAZA || t === T.SIDEWALK || t === T.ROAD || t === T.LOT);
  teleport(w, p.ped, ground.x, ground.y);
  skydive.start(w, p.ped, { alt: 900, vx: 0, vy: 0 });
  run(w, 1);
  assert.ok(p.ped.sky && !p.ped.dead, 'still falling after a second');
  run(w, 4);
  assert.ok(!p.ped.sky && p.ped.dead, 'splat');
  // the water
  const w2 = makeWorld();
  const { p: q } = joinPlayer(w2);
  calmWater(w2, 0);
  const sea = spotOf(w2.map, (t) => !!WATER_T[t]);
  assert.ok(sea, 'open water');
  teleport(w2, q.ped, sea.x, sea.y);
  skydive.start(w2, q.ped, { alt: 900, vx: 0, vy: 0 });
  const hp = q.ped.hp;
  run(w2, 5);
  assert.ok(!q.ped.sky && !q.ped.dead, 'alive in the water');
  assert.ok(q.ped.hp < hp, 'it stung');
});

test('out of a helicopter high up you fall; the camera follows you down (no prediction)', async () => {
  const w = makeWorld();
  run(w, 0.2);
  const { p } = joinPlayer(w);
  const v = [...w.entities.values()].find((e) => e.kind === K.VEH && e.def.id === 'heli');
  assert.ok(v, 'a helicopter');
  const ground = spotOf(w.map, (t) => t === T.GRASS || t === T.PLAZA || t === T.SIDEWALK || t === T.ROAD || t === T.LOT);
  v.x = ground.x; v.y = ground.y; v.alt = 600; w.place(v);
  // (sat at its controls)
  p.ped.vehId = v.id; p.ped.seat = 0; v.seats = v.seats || []; v.seats[0] = p.ped.id; v.driver = p.ped.id;
  p.ped.jumpArmAt = w.time;
  assert.ok(aircraft.leaveInAir(w, p.ped, v), 'out');
  assert.equal(p.ped.vehId, 0);
  assert.ok(p.ped.sky && Math.abs(p.ped.sky.z - 600) < 1, 'falling from its height');
  // the snapshot's controller: the ped, not predicted
  const sent = [];
  const conn = p.conn; const keep = conn.sendBinary; conn.sendBinary = (b) => sent.push(b);
  net.send(w);
  conn.sendBinary = keep;
  const { decodeSnapshot } = await import('../shared/protocol.js');
  const b = sent[sent.length - 1], snap = b ? decodeSnapshot(b instanceof ArrayBuffer ? new DataView(b) : new DataView(b.buffer, b.byteOffset, b.byteLength)) : null;
  assert.ok(snap && snap.ctrlKind === CTRL.RIDER && snap.ctrlId === p.ped.id, 'a rider: the server moves you');
});

test('no parachute, but a car under you: you bounce off its roof - dented, and you live', () => {
  const w = makeWorld();
  const { p } = joinPlayer(w);
  const ground = spotOf(w.map, (t) => t === T.ROAD || t === T.LOT || t === T.PLAZA);
  const car = w.spawnVehicle('sedan', ground.x, ground.y, 0, { parked: true });
  const hp0 = car.hp;
  teleport(w, p.ped, ground.x, ground.y);
  skydive.start(w, p.ped, { alt: 900, vx: 0, vy: 0 });
  // (a car that drives under someone falling doesn't hit them: they're up in the air)
  let n = 0; while (p.ped.sky && n++ < 20 * 10) { car.x = ground.x; car.y = ground.y; w.step(); }
  assert.ok(!p.ped.sky && !p.ped.dead, 'bounced, alive');
  assert.ok(car.hp < hp0, 'the roof took it');
  assert.ok(Math.hypot(p.ped.x - car.x, p.ped.y - car.y) > car.def.W / 2, 'thrown off beside it');
});
