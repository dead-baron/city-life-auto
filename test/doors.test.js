// The street fronts' doors (the owner's notes 2, p16: "sliding doors or doors that open ... a bell ring when you walk in"):
// shared/doors.js says which slide and which swing and which shops have a bell; the bake paints them shut
// (client/art2/buildings.js liveDoor) and says where they are (statics.js liveDoors -> the chunk's live.doors); the page
// opens them as someone comes up (client/art2/game/doorart.js) and rings the bell (client/sound/places.js). A door is
// only a picture: the doorway stays the walk-in's floor, nobody is ever stopped by one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doorStyle, unitDoor, rings, DOOR_COLS } from '../shared/doors.js';
import { DOOR, atDoor, stepDoors, doorSprite } from '../client/art2/game/doorart.js';
import { doorSound } from '../client/sound/places.js';
import { makeBuilding, liveDoor } from '../client/art2/buildings.js';
import { GBuf } from '../client/art2/gbuf.js';
import { INSTR } from '../client/sound/instruments.js';

const U = (kind, trade) => ({ kind, trade, door: { tx: 0, ty: 0, w: 2 }, poi: 1 });

test('sliding glass for the marts, banks, clinics and modern shops; hinged doors for the small shops, bars, diners and homes', () => {
  for (const k of ['grocery', 'gasstation', 'pharmacy', 'bank', 'hospital', 'sports', 'clothing', 'police']) assert.equal(unitDoor(U(k)), 'slide', k);
  for (const k of ['convenience', 'pawn', 'barber', 'hardware', 'tackle', 'coffee', 'fence', 'club', 'roadhouse', 'courthouse']) assert.equal(unitDoor(U(k)), 'hinge', k);
  for (const k of ['mart', 'lobby', 'arcade']) assert.equal(doorStyle(k), 'slide', k);
  for (const k of ['diner', 'cafe', 'bar', 'liquor', 'books']) assert.equal(doorStyle(k), 'hinge', k);
  assert.equal(unitDoor(null, 'mart'), 'slide', 'a front with no walk-in: by its look');
  assert.equal(unitDoor(U('delivery', 'mart')), 'hinge', "a hand plan's corner store: a bell, so it swings");
  assert.equal(unitDoor(U('delivery', 'bar')), 'hinge');
});

test('the bell over the door: the corner store, the pawn shop, the diner, the barber, the hardware store, a bakery - not the bank or the supermarket', () => {
  for (const k of ['convenience', 'pawn', 'barber', 'hardware', 'tackle', 'coffee', 'diner', 'bakery', 'fishmarket']) { assert.ok(rings(U(k)), k); assert.equal(doorSound(U(k)), 'doorbell', k); }
  for (const t of ['mart', 'pawn', 'barber', 'bakery']) assert.ok(rings(U('delivery', t)), `trade ${t}`);
  for (const k of ['bank', 'grocery', 'pharmacy', 'hospital', 'gasstation', 'club', 'police', 'gunshop']) assert.ok(!rings(U(k)), k);
  assert.equal(doorSound(U('bank')), 'slidingdoor');
  assert.equal(doorSound(U('gunshop')), 'housedoor', 'a hinged door without a bell: its latch');
  for (const n of ['doorbell', 'slidingdoor', 'housedoor']) assert.ok(INSTR[n], `the ${n} sound is in the synth`);
});

test('a door opens as someone comes up to it and closes behind them; a hinged one not for someone walking past', () => {
  const slide = [100, 200, 52, 46, 1, 0, 3], hinge = [300, 200, 18, 44, 0, 2, 4];
  const st = new Map(), dt = 1 / 30;
  let now = 0;
  const run = (L, peds, s) => { for (let i = 0; i < s / dt; i++) { now += dt; stepDoors(st, L, peds, now, dt); } };
  const o = (d) => st.get(d[0] * 65536 + d[1]).o;
  run([slide, hinge], [], 1);
  assert.equal(o(slide), 0); assert.equal(o(hinge), 0);
  run([slide], [126, 240, 0, -60], DOOR.openS + 0.1);   // (walking up to the glass)
  assert.equal(o(slide), 1, 'slid open');
  run([slide], [126, 170, 0, -60], 0.2);                 // (through it, inside)
  assert.equal(o(slide), 1, 'open while they go through');
  run([slide], [126, 100, 0, -60], DOOR.holdS + DOOR.openS * 1.4);
  assert.equal(o(slide), 0, 'shut behind them');
  // along the pavement past a hinged door: it stays shut; turning in to it: it swings open
  run([hinge], [309, 220, 90, 0], 1);
  assert.equal(o(hinge), 0, 'not for a passer-by');
  run([hinge], [309, 214, 0, -70], DOOR.openS + 0.1);
  assert.equal(o(hinge), 1, 'swung open for someone coming in');
  assert.ok(atDoor(slide, true, 126, 245, 80, 0), 'a sliding door sees anyone near it');
  assert.ok(!atDoor(slide, true, 126, 200 + DOOR.slideReach + 4, 0, 0));
});

test('the opening: each step shows more of the shop behind; the sprites fit the baked door exactly', () => {
  for (const [slide, w, h] of [[true, 52, 46], [false, 18, 44], [false, 24, 48], [false, 52, 48]]) {
    let last = -1;
    for (let k = 1; k <= 4; k++) {
      const G = doorSprite(slide, w, h, 3, k);
      assert.equal(G.w, w); assert.equal(G.h, h); assert.equal(G.ay, h); assert.equal(G.ax, 0);
      let inside = 0;   // (the shop seen through the doorway: at the wall's own height - the leaves stand a pixel proud of it)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (G.z[y * w + x] === h - y) inside++;
      assert.ok(inside > last, `${slide ? 'sliding' : 'hinged'} step ${k}: more of the doorway open (${inside})`);
      last = inside;
      for (let i = 0; i < w * h; i++) assert.equal(G.col[i * 4 + 3], 255, 'the whole doorway covered');
    }
  }
  // baked shut: no glowing square any more - a door, its paint or its glass
  const G = new GBuf(40, 60);
  liveDoor(G, 4, 4, 24, 50, 'hinge', 0, 1);
  liveDoor(G, 4, 4, 24, 50, 'slide', 1, 0);
  assert.ok(DOOR_COLS.length >= 6);
});

test('a shopfront with a live door: baked with the door shut', () => {
  const base = { w: 160, d: 64, floors: 2, style: 'brick', seed: 3, glowOnly: true, night: 0, roof: 'flat' };
  const open = makeBuilding({ ...base, shop: { kind: 'mart', door: 'left', open: true } });
  const shut = makeBuilding({ ...base, shop: { kind: 'mart', door: 'left', open: true, live: 'hinge', doorC: 2 } });
  // (the doorway's middle: lit warm when it was painted open, the door's paint now)
  const x = 10 + 11, y = shut.h - 20, j = (y * shut.w + x) * 4;
  assert.ok(open.emi[j + 3] > 0, 'the old open door glowed');
  assert.notDeepEqual([...shut.col.slice(j, j + 3)], [...open.col.slice(j, j + 3)], 'now a shut door');
});
