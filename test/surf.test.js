// Surfing (the owner's #312 - server/systems/surf.js, shared/surf.js): the breaks on the map's sandy beaches facing the
// open sea; the waves in sets, the same arithmetic on the page and the server; a surfboard in the bag: in the sea you're on
// it, paddling; paddling for the beach as a wave comes you're up, riding it; carving along the face for the points; the
// white water behind the break gets you; riding it in counts the ride and keeps your best.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { SURF, SET_S, LIFE_S, RIDE_S, wavesAt, onBreak, breakPt, broken, findBreaks, crestD, heightAt, gapAt, runupAt, brkOf } from '../shared/surf.js';
import { pieceOf, sizeClass, PIECE_KINDS } from '../client/art2/game/surfart.js';
import { DT, T, TILE } from '../shared/constants.js';
import { WATER_T } from '../shared/mapcore.js';
import { IN } from '../shared/input.js';
import * as surf from '../server/systems/surf.js';
import * as players from '../server/systems/players.js';

let seq = 1;
const steer = (w, p, mx, my, bits = 0, n = 1) => { for (let i = 0; i < n; i++) { players.queueInput(p, { seq: seq++, bits: i === 0 ? bits : 0, mx, my, aim: 0 }); w.step(); } };

test('the waves: sets rolling in, breaking from one end, the break peeling along; the same at the same tick', () => {
  const B = { id: 3, x: 0, y: 0, nx: 0, ny: -1, half: 400, ph: 2.5, side: 1 };
  let seen = 0, broke = 0;
  for (let t = 0; t < SET_S * 2; t += 0.5) {
    for (const w of wavesAt(B, t)) {
      seen++;
      assert.ok(w.d <= SURF.start && w.age >= 0 && w.age <= LIFE_S);
      assert.equal(w.wash, w.d < SURF.shore);
      if (w.green) assert.ok(w.d > w.brk - 1 && w.edge === null);
      else { broke++; assert.ok(broken(B, w, -B.half) && (w.edge < B.half ? !broken(B, w, B.half) : true), 'from its end, along'); }
    }
  }
  assert.ok(seen > 40 && broke > 10);
  assert.deepEqual(wavesAt(B, 12.3).map((w) => w.id), wavesAt(B, 12.3).map((w) => w.id));
  const q = onBreak(B, 50, -300), P = breakPt(B, q.a, q.d);
  assert.ok(Math.abs(P.x - 50) < 1e-9 && Math.abs(P.y + 300) < 1e-9, 'along and out, and back');
});

test('the breaks: on the sandy beaches facing the open sea, straight enough, the water open in front', () => {
  const w = makeWorld();
  const L = surf.breaksOf(w).list;
  assert.ok(L.length >= 10, `${L.length} breaks`);
  for (const b of L.slice(0, 10)) {
    const out = breakPt(b, 0, SURF.start / 2), inn = breakPt(b, 0, -0.7 * TILE);
    assert.ok([T.WATER, T.DEEP].includes(w.map.tileAtPx(out.x, out.y)), 'sea out in front');
    assert.equal(w.map.tileAtPx(inn.x, inn.y), T.SAND, 'the beach behind');
    assert.ok(b.half >= 7 * TILE);
  }
});

test('a ride: on the board in the sea, paddling for the beach as a wave comes, up and riding it, carving, counted', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const B = surf.breaksOf(w).list[0];
  // in the water by the break, no board: just swimming
  const at = breakPt(B, 0, SURF.brk + 40);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.3);
  assert.equal(p.ped.surf, undefined, 'no board: swimming');
  prof.inventory.surfboard = 1;
  run(w, 0.2);
  assert.equal(p.ped.surf && p.ped.surf.st, 'pad', 'on the board');
  assert.equal(players.buildMe(w, p).surf.b[0][0], B.id, 'the break near, for the page');
  // a wave's crest about to reach you: paddle for the beach and you're up
  const t = w.tick * DT;
  let wave = null, k = 0;
  for (; k < 400 && !wave; k++) { const ws = wavesAt(B, (w.tick + k) * DT); wave = ws.find((q) => q.green && Math.abs(crestD(B, q, 0) - (SURF.brk + 40)) < 4 && !gapAt(B, q, 0) && heightAt(B, q, 0) > Math.max(SURF.minH, q.size * SURF.gapK) + 0.03) || null; }
  assert.ok(wave, 'a wave comes');
  const inX = -B.nx, inY = -B.ny;
  steer(w, p, 0, 0, 0, Math.max(0, k - 6));
  teleport(w, p.ped, at.x, at.y);
  for (let i = 0; i < 30 && p.ped.surf.st === 'pad'; i++) steer(w, p, inX, inY);
  assert.equal(p.ped.surf.st, 'ride', `up on the wave (t ${t.toFixed(1)})`);
  // ride away from where it breaks, carving back once: points
  const away = B.side, tx = -B.ny * away, ty = B.nx * away;
  for (let i = 0; i < 40 && p.ped.surf.st === 'ride'; i++) steer(w, p, tx, ty);
  assert.ok(p.ped.surf.pts > 50, `points (${Math.round(p.ped.surf.pts)})`);
  const a0 = p.ped.surf.a;
  steer(w, p, tx, ty, IN.ACTION);
  assert.equal(p.ped.surf.st, 'air', 'up off the lip');
  let dry = 0;
  for (let i = 0; i < 400 && p.ped.surf && (p.ped.surf.st === 'ride' || p.ped.surf.st === 'air'); i++) { steer(w, p, tx * 0.6, ty * 0.6); if (WATER_T[w.map.tileAtPx(p.ped.x, p.ped.y)] !== 1) dry++; }
  assert.equal(dry, 0, 'carried along on the water, never up onto the beach');
  assert.ok(p.ped.surf && (p.ped.surf.st === 'pad' || p.ped.surf.st === 'wipe'), `the ride over (${p.ped.surf && p.ped.surf.st})`);
  assert.ok(prof.surfRides === 1 && prof.surfBest > SURF.pts.air, `counted, the air in it (${prof.surfBest})`);
  assert.ok(Math.abs(p.ped.surf.a - a0) > 40 || p.ped.surf.st === 'wipe', 'rode along the face');
  // up the beach: off the board, it's in the bag
  const beach = breakPt(B, 0, -3 * TILE);
  teleport(w, p.ped, beach.x, beach.y);
  run(w, 0.2);
  assert.ok(!p.ped.surf && prof.inventory.surfboard === 1, 'on the sand: off it');
});

test('paddling in early: the wave rolls in faster than you paddle, catches you up and you are up', () => {
  assert.ok(SURF.speed > SURF.paddle * 1.1, 'a wave outruns a paddle');
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.surfboard = 1;
  const B = surf.breaksOf(w).list[0];
  const at = breakPt(B, 0, SURF.start - 60);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.2);
  assert.equal(p.ped.surf && p.ped.surf.st, 'pad');
  // wait out where the waves rise for the next one to start, then paddle in straight away - well ahead of its crest
  let k = 0;
  for (; k < 1200; k++) { steer(w, p, 0, 0); teleport(w, p.ped, at.x, at.y); const ws = wavesAt(B, w.tick * DT); if (ws.some((q) => q.age > 0 && q.age < 0.1)) break; }
  const d0 = onBreak(B, p.ped.x, p.ped.y).d;
  let i = 0;
  for (; i < 200 && p.ped.surf.st === 'pad'; i++) steer(w, p, -B.nx, -B.ny);
  assert.equal(p.ped.surf.st, 'ride', `caught up and up (${i} ticks, from ${Math.round(d0)} px out to ${Math.round(onBreak(B, p.ped.x, p.ped.y).d)})`);
});

test('the white water: stay where the wave has broken and it gets you', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.surfboard = 1;
  const B = surf.breaksOf(w).list[1];
  const at = breakPt(B, 0, SURF.brk + 20);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.2);
  // straight into the white water: a ride on a wave already broken where you are
  const s = p.ped.surf;
  let wave = null;
  for (let k = 0; k < 800 && !wave; k++) { w.step(); wave = wavesAt(B, w.tick * DT).find((q) => !q.green && broken(B, q, -B.side * (B.half - 40)) && q.d > SURF.shore + 120) || null; }
  assert.ok(wave);
  s.st = 'ride'; s.w = wave.id; s.a = -B.side * (B.half - 40); s.va = 0; s.pts = 0; s.b = B.id;
  steer(w, p, 0, 0, 0, 3);
  assert.equal(p.ped.surf.st, 'wipe', 'tumbling');
  assert.equal(prof.surfRides, 1);
  run(w, SURF.wipeS + 0.2);
  assert.equal(p.ped.surf.st, 'pad', 'back on the board');
});

test('airs: one a second at most, and landing in the white water still gets you; never carried far past the beach', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.surfboard = 1;
  const B = surf.breaksOf(w).list[0];
  const at = breakPt(B, 0, SURF.brk + 200);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.2);
  let k = 0, wave = null;
  for (; k < 800 && !wave; k++) wave = wavesAt(B, (w.tick + k) * DT).find((q) => q.green && Math.abs(crestD(B, q, 0) - (SURF.brk + 200)) < 4 && !gapAt(B, q, 0) && heightAt(B, q, 0) > Math.max(SURF.minH, q.size * SURF.gapK) + 0.03) || null;
  steer(w, p, 0, 0, 0, Math.max(0, k - 6));
  teleport(w, p.ped, at.x, at.y);
  for (let i = 0; i < 30 && p.ped.surf.st === 'pad'; i++) steer(w, p, -B.nx, -B.ny);
  assert.equal(p.ped.surf.st, 'ride');
  // carving back toward where it broke, the action button held down: airs one after another, as fast as they come
  const tx = -B.ny * -B.side, ty = B.nx * -B.side;
  let airs = 0, was = 'ride', maxA = 0, n = 0;
  for (; n < 600 && p.ped.surf && (p.ped.surf.st === 'ride' || p.ped.surf.st === 'air'); n++) {
    steer(w, p, tx, ty, p.ped.surf.st === 'ride' ? IN.ACTION : 0);
    if (p.ped.surf.st === 'air' && was !== 'air') airs++;
    was = p.ped.surf.st; maxA = Math.max(maxA, Math.abs(p.ped.surf.a));
  }
  assert.ok(p.ped.surf && p.ped.surf.st !== 'ride' && p.ped.surf.st !== 'air', `the ride over (${n} ticks)`);
  assert.ok(airs <= Math.ceil(n * DT / (SURF.airS + SURF.airGap)) + 1, `airs no faster than one a second (${airs} in ${(n * DT).toFixed(1)} s)`);
  assert.ok(maxA <= B.half + 40, `kept to the beach (${Math.round(maxA)} of ${B.half})`);
});

test('lying on the board: the vehicle button still boards a boat beside you', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.surfboard = 1;
  const B = surf.breaksOf(w).list[0];
  const at = breakPt(B, 0, SURF.start + 100);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.3);
  assert.equal(p.ped.surf && p.ped.surf.st, 'pad');
  const v = w.spawnVehicle('speedboat', at.x + 20, at.y, 0, { npcOwned: false });
  v.issuedTo = p.pid;
  steer(w, p, 0, 0, IN.VEHICLE); steer(w, p, 0, 0, 0, 20);
  assert.equal(p.ped.vehId, v.id, 'aboard');
  assert.ok(!p.ped.surf && prof.inventory.surfboard === 1, 'the board in the bag');
});

// (the owner's notes 2, p7: "smaller waves and bigger waves, have them swell and curl over and behave more like real waves")
test('sets of small and big waves: each set its own size, building to the biggest in the middle; a big wave breaks further out', () => {
  const B = { id: 5, x: 0, y: 0, nx: 0, ny: -1, half: 480, ph: 1.5, side: -1 };
  const sizes = [], setMax = [];
  for (let n = 0; n < 40; n++) {
    let mx = 0;
    for (let k = 0; k < SURF.waves; k++) {
      const t = B.ph + n * SET_S + k * SURF.gapS + 0.5;
      const w = wavesAt(B, t).find((q) => q.age < 1);
      if (!w) continue;
      sizes.push(w.size); mx = Math.max(mx, w.size);
      assert.ok(w.size >= SURF.size[0] && w.size <= SURF.size[1]);
      assert.equal(w.brk, brkOf(w.size));
    }
    setMax.push(mx);
  }
  assert.ok(Math.min(...sizes) < 0.65 && Math.max(...sizes) > 1.25, `small and big waves (${Math.min(...sizes)} .. ${Math.max(...sizes)})`);
  assert.ok(Math.min(...setMax) < 0.9 && Math.max(...setMax) > 1.2, 'small sets and big sets');
  assert.ok(brkOf(1.5) > brkOf(0.5) + 80, 'a big wave breaks further out');
  const counts = new Set();
  for (let n = 0; n < 30; n++) { let c = 0; for (let k = 0; k < SURF.waves; k++) if (wavesAt(B, B.ph + n * SET_S + k * SURF.gapS + 0.2).some((q) => q.age < 0.5)) c++; counts.add(c); }
  assert.ok(counts.size >= 2, `sets of different lengths (${[...counts]})`);
});

test('the crest: curved and broken, not a ruler line; it straightens as it comes in', () => {
  const B = { id: 2, x: 0, y: 0, nx: 0, ny: 1, half: 500, ph: 0, side: 1 };
  const w = wavesAt(B, 2).find((q) => q.age > 1.5);
  assert.ok(w && w.green);
  const ds = [], hs = [];
  for (let a = -B.half; a <= B.half; a += 20) { ds.push(crestD(B, w, a)); hs.push(heightAt(B, w, a)); }
  const spread = Math.max(...ds) - Math.min(...ds);
  assert.ok(spread > 12, `the crest wanders (${spread.toFixed(1)} px)`);
  assert.ok(crestD(B, w, B.half) > crestD(B, w, 0) - SURF.bend * 1.6, 'bowed back toward the ends');
  for (let i = 1; i < ds.length; i++) assert.ok(Math.abs(ds[i] - ds[i - 1]) < 9, 'smooth along its length');
  // (a wave of good size: some sections stand high, some are low enough to be gaps)
  let big = null;
  for (let t = 0; t < SET_S * 6 && !big; t += 0.5) big = wavesAt(B, t).find((q) => q.size > 0.95 && q.age > 1) || null;
  const H = []; for (let a = -B.half; a <= B.half; a += 10) H.push(heightAt(B, big, a) / big.size);
  assert.ok(Math.max(...H) - Math.min(...H) > 0.2, 'higher and lower along it');
  const far = { ...w, d: SURF.start }, nearIn = { ...w, d: SURF.shore + 40 };
  const sp = (q) => { const L = []; for (let a = -B.half; a <= B.half; a += 20) L.push(crestD(B, q, a) - q.d); return Math.max(...L) - Math.min(...L); };
  assert.ok(sp(nearIn) < sp(far) * 0.6, 'straighter near the beach');
  assert.ok(Number.isFinite(runupAt(B, w, 0)) && runupAt(B, w, 0) > 10);
});

test('a wave through its life: swell, steepening, curling ahead of the break, white water, the swash up the sand and back', () => {
  const B = { id: 4, x: 0, y: 0, nx: 0, ny: -1, half: 400, ph: 0, side: 1 };
  const seen = new Set(), kinds = new Set();
  let swashUp = 0, swashBack = 0;
  for (let t = 0; t < SET_S * 2; t += 0.1) for (const w of wavesAt(B, t)) for (const a of [-300, -100, 0, 150, 300]) {
    const e = 10, P = pieceOf(B, w, a, e);
    if (!P.stage) continue;
    seen.add(P.stage);
    for (const [k, c, d] of P.list) { kinds.add(k); assert.ok(PIECE_KINDS.includes(k) && c >= 0 && c <= 2); if (k === 'swash') { assert.ok(d <= e + 0.01, 'the swash on the sand'); if (d < e - 20) swashUp++; } if (k === 'wet') swashBack++; }
    if (P.stage === 'curl') assert.ok(w.edge !== null && !broken(B, w, a) && B.side * (a - w.edge) < 110, 'the curl just ahead of the break');
    if (P.stage === 'white') assert.ok(broken(B, w, a) || P.d < e + 40, 'white water behind the break, or breaking on the beach');
    assert.ok(Math.abs(P.d - crestD(B, w, a)) < 1e-9, 'drawn where the server has it');
  }
  for (const st of ['swell', 'steep', 'curl', 'white', 'swash']) assert.ok(seen.has(st), `stage ${st}`);
  for (const k of ['back', 'face', 'lip', 'curl', 'white', 'lace', 'swash', 'wet']) assert.ok(kinds.has(k), `piece ${k}`);
  assert.ok(swashUp > 5 && swashBack > 5, 'up the sand and draining back');
  assert.equal(sizeClass(0.5), 0); assert.equal(sizeClass(0.9), 1); assert.equal(sizeClass(1.4), 2);
  assert.ok(LIFE_S > RIDE_S + SURF.swashUp, 'a wave lives on through its swash');
});

test('riding: the server keeps you on the face of the crest the page draws, and you can only catch it where it stands high', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.inventory.surfboard = 1;
  const B = surf.breaksOf(w).list[0];
  const at = breakPt(B, 0, SURF.brk + 120);
  teleport(w, p.ped, at.x, at.y);
  run(w, 0.2);
  let k = 0, wave = null;
  for (; k < 1600 && !wave; k++) wave = wavesAt(B, (w.tick + k) * DT).find((q) => q.green && Math.abs(crestD(B, q, 0) - (SURF.brk + 120)) < 4 && !gapAt(B, q, 0) && heightAt(B, q, 0) > Math.max(SURF.minH, q.size * SURF.gapK) + 0.03) || null;
  assert.ok(wave, 'a catchable wave comes');
  steer(w, p, 0, 0, 0, Math.max(0, k - 6));
  teleport(w, p.ped, at.x, at.y);
  for (let i = 0; i < 30 && p.ped.surf.st === 'pad'; i++) steer(w, p, -B.nx, -B.ny);
  assert.equal(p.ped.surf.st, 'ride');
  for (let i = 0; i < 12 && p.ped.surf.st === 'ride'; i++) {
    steer(w, p, -B.ny * B.side, B.nx * B.side);
    if (p.ped.surf.st !== 'ride') break;
    const q = wavesAt(B, w.tick * DT).find((x) => x.id === p.ped.surf.w), P = breakPt(B, p.ped.surf.a, crestD(B, q, p.ped.surf.a) - SURF.face);
    assert.ok(Math.hypot(P.x - p.ped.x, P.y - p.ped.y) < 0.5, 'on the face of the drawn crest');
  }
  // a gap in the lip: no catching it there
  let gap = null, ga = 0;
  for (let t = 0; t < SET_S * 8 && !gap; t += 0.25) for (const q of wavesAt(B, t)) { if (!q.green) continue; for (let a = -B.half + 60; a < B.half - 60; a += 12) if (gapAt(B, q, a)) { gap = q; ga = a; break; } if (gap) break; }
  assert.ok(gap, 'a low section somewhere');
  const P = pieceOf(B, gap, ga, -200);
  assert.ok(!P.list.some(([k]) => k === 'lip'), 'drawn as a gap in the lip');
  // and sections along a good wave: some lip, some gaps - a broken crest, not one line
  let lip = 0, gaps = 0;
  for (let a = -B.half + 60; a < B.half - 60; a += 13) (gapAt(B, gap, a) ? gaps++ : lip++);
  assert.ok(lip > 5 && gaps > 2, `sections (${lip} lip, ${gaps} gaps)`);
});
