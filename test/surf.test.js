// Surfing (the owner's #312 - server/systems/surf.js, shared/surf.js): the breaks on the map's sandy beaches facing the
// open sea; the waves in sets, the same arithmetic on the page and the server; a surfboard in the bag: in the sea you're on
// it, paddling; paddling for the beach as a wave comes you're up, riding it; carving along the face for the points; the
// white water behind the break gets you; riding it in counts the ride and keeps your best.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { SURF, SET_S, LIFE_S, wavesAt, onBreak, breakPt, broken, findBreaks } from '../shared/surf.js';
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
      assert.ok(w.d <= SURF.start && w.d >= SURF.shore - 1 && w.age >= 0 && w.age <= LIFE_S);
      if (w.green) assert.ok(w.d > SURF.brk - 1 && w.edge === null);
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
  for (; k < 400 && !wave; k++) { const ws = wavesAt(B, (w.tick + k) * DT); wave = ws.find((q) => q.green && Math.abs(q.d - (SURF.brk + 40)) < 4) || null; }
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
