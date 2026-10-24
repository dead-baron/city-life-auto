// The harvest on the page (the owner, 10-23: "Hard to tell what is being harvested with the harvester, can we make a
// better visual for harvesting crops?"): client/render/farmart.js - the stubble plainly cut beside the standing crop, a
// swath cut under the machine's header as it goes (not a tenth of the row at once ahead of it), the chaff and straw out
// of a combine's back in the colours art v2 draws as its own (actors.js pChaff / pStraw); the combine's reel turning.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as FA from '../client/render/farmart.js';
import { CHAFF_RGBA, STRAW_HEX, v1ParticleFx, vehicleKey } from '../client/art2/game/actors.js';
import { VEHICLES } from '../shared/vehicles.js';

const mean = (look) => { let r = 0, g = 0, b = 0, n = 0; for (let a = 0; a < 32; a++) for (let q = 0; q < 32; q++) { const c = FA.rowPixel(look, a, q); r += c[0]; g += c[1]; b += c[2]; n++; } return [r / n, g / n, b / n]; };
test('the stubble reads as cut: duller and darker than the ripe crop, with pale stalk ends and a windrow', () => {
  const ripe = mean(6), stub = mean(0), sat = ([r, , b]) => r - b;
  assert.ok(sat(ripe) - sat(stub) > 40, `the ripe gold far more saturated (${ripe.map(Math.round)} vs ${stub.map(Math.round)})`);
  const cols = new Set(); for (let a = 0; a < 8; a++) for (let q = 0; q < 32; q++) cols.add(FA.rowPixel(0, a, q).join());
  assert.ok(cols.size >= 6, 'stalk ends, their shadow, soil, straw');
  assert.equal(FA.rowPixel(0, 3, 16).join(), FA.rowPixel(0, 3, 16).join());
});

test('the particles: the chaff and the straw are drawn as their own art v2 sets', () => {
  assert.equal(FA.CHAFF, CHAFF_RGBA); assert.equal(FA.STRAW, STRAW_HEX);
  assert.equal(v1ParticleFx({ type: 2, color: FA.CHAFF }), 'pChaff');
  assert.equal(v1ParticleFx({ type: 8, color: FA.STRAW }), 'pStraw');
  assert.equal(v1ParticleFx({ type: 2, color: 'rgba(170,170,170,' }), 'pSteam', 'smoke stays smoke');
});

// a field sent by the server: rows along x (v 0), 64 px wide, 10 stretches; row 1 and 2 ripe
const field = () => ({ i: 0, x: 0, y: 0, w: 1000, h: 256, v: 0, rw: 64, segs: 10, r: [0, 0, 0, 1023, 3, 0, 0, 1023, 3, 0, 0, 1023, 2, 50, 0, 1023] });
test('a combine working a ripe row leaves its swath as it goes, blows chaff out of the back; its stretch waits', () => {
  const spawned = [], S = { fields: [field()], fx: { spawn: (...a) => (spawned.push(a), {}) } };
  const art = new FA.FarmArt(S), comb = VEHICLES.combine;
  const v = { d: { m: comb.i ?? 49 }, flags: 0, rx: 100, ry: 128, ra: 0 };
  // driving east along the line between rows 1 and 2
  for (let x = 100; x <= 300; x += 10) { v.rx = x; art._working({ vehs: [v] }); }
  const cuts = art.cuts, n = [...Array(cuts.length / 4).keys()].filter((i) => cuts[i * 4] === cuts[i * 4]).length;
  assert.ok(n >= 15, `a stamp every few px (${n})`);
  const hx = 300 + comb.L / 2 - 12;
  assert.ok(Math.abs(cuts[art.cutN * 4] - hx) < 1, 'under its header, at the front');
  assert.ok(spawned.some((a) => a[0] === 2 && a[7] === FA.CHAFF), 'chaff');
  assert.ok(art._beingCut(S.fields[0], 1, Math.floor(hx / 100)), 'the stretch it is in: its stubble waits for the swath');
  assert.ok(!art._beingCut(S.fields[0], 1, 0), 'one it has left: drawn cut');
  // not on a ripe row: no swath
  const art2 = new FA.FarmArt(S); v.ry = 224 - 10;
  for (let x = 100; x <= 300; x += 10) { v.rx = x; art2._working({ vehs: [v] }); }
  assert.ok(!art2.cuts || !art2.cuts.some((c, i) => i % 4 === 0 && c === c), 'a growing row is not cut');
});

test('the combine\'s reel turns: three looks of it while it works, the same sprite key as ever when it stands', () => {
  const d = { m: 49 };
  const k0 = vehicleKey(d, {}, 0, 32), k1 = vehicleKey(d, { reel: 1 }, 0, 32), k2 = vehicleKey(d, { reel: 2 }, 0, 32);
  assert.ok(k0 !== k1 && k1 !== k2 && k0 === vehicleKey(d, { reel: 3 }, 0, 32));
  assert.equal(vehicleKey({ m: 0 }, { reel: 1 }, 0, 32), vehicleKey({ m: 0 }, {}, 0, 32), 'only a combine has a reel');
});

test('the crop the ground is baked with is the one the combine reports: groundbake.js fieldKindAt = shared/fieldcrop.js fieldKind', async () => {
  const { fieldKindAt } = await import('../client/art2/game/groundbake.js');
  const { fieldKind } = await import('../shared/fieldcrop.js');
  for (const seed of [1337, 7, 65535 + 12, -3]) for (let f = 0; f < 60; f++) assert.equal(fieldKindAt(f, ((seed | 0) & 0xffff)), fieldKind(f, seed));
});
