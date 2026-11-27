// Vehicles in the water (the owner, 11-24 21:40; shared/physics.js wade, server/systems/vehicles.js wade): very shallow water
// splashed through without slowing, shallower than a vehicle fords waded (slowed; the engine floods and stalls if it
// stays in, then tries again), deeper sinks it - and an off-road vehicle fords deeper and holds out longer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport } from './helpers.js';
import * as vehicles from '../server/systems/vehicles.js';
import { waterDepth, wadeBand, fordOf, offroad, WB } from '../shared/physics.js';
import { WADE } from '../shared/rules.js';
import { VEHICLES } from '../shared/vehicles.js';
import { T, VF } from '../shared/constants.js';
import { IN } from '../shared/input.js';

const w = makeWorld(), m = w.map;
// a water tile by its depth: the first (from the top) whose middle's depth d satisfies ok(d) (a vehicle's band is read
// at its middle)
function spot(ok) {
  for (let ty = m.y0 + 2; ty < m.y0 + m.h - 2; ty++) for (let tx = m.x0 + 2; tx < m.x0 + m.w - 2; tx++) {
    const t = m.tileAt(tx, ty);
    if (t !== T.WATER) continue;
    const d = waterDepth(m, tx * 32 + 16, ty * 32 + 16);
    if (!ok(d)) continue;
    return { x: tx * 32 + 16, y: ty * 32 + 16, d };
  }
  return null;
}

test('the depth: dry is 0, the open deep and off a quay are deep at once, the shallows shelve from the bank', () => {
  let dock = null, deep = null;
  for (let ty = m.y0 + 1; ty < m.y0 + m.h - 1 && !(dock && deep); ty++) for (let tx = m.x0 + 1; tx < m.x0 + m.w - 1; tx++) {
    const t = m.tileAt(tx, ty);
    if (!deep && t === T.DEEP) deep = [tx, ty];
    if (!dock && t === T.WATER && m.tileAt(tx - 1, ty) === T.DOCK && !m.river[m.idx(tx, ty)]) dock = [tx, ty];
  }
  assert.ok(dock && deep);
  assert.equal(waterDepth(m, deep[0] * 32 + 16, deep[1] * 32 + 16), Infinity, 'open deep water');
  assert.equal(waterDepth(m, dock[0] * 32 + 16, dock[1] * 32 + 16), Infinity, 'off a dock: deep at once (a car driven off the end still goes down)');
  for (let ty = m.y0; ty < m.y0 + m.h; ty += 7) for (let tx = m.x0; tx < m.x0 + m.w; tx += 7) if (m.tileAt(tx, ty) === T.ROAD) { assert.equal(waterDepth(m, tx * 32 + 16, ty * 32 + 16), 0); break; }
  const s = spot((d) => d > 0 && d < 0.2);
  assert.ok(s, 'shallows by a bank');
});

test('who fords what: an off-road vehicle deepest, trucks over cars, bikes less, boards barely', () => {
  assert.ok(fordOf(VEHICLES.jeep) >= WADE.ford.offroad && offroad(VEHICLES.jeep), 'the Trailcat 4x4');
  assert.ok(offroad(VEHICLES.tractor) && offroad(VEHICLES.dirtbike) && offroad(VEHICLES.tank));
  assert.ok(fordOf(VEHICLES.dumptruck) > fordOf(VEHICLES.sedan), 'a truck over a car');
  assert.ok(fordOf(VEHICLES.sedan) > fordOf(VEHICLES.bike), 'a car over a motorbike');
  assert.ok(fordOf(VEHICLES.skateboard) < WADE.splash, 'a skateboard barely');
  const s = spot((d) => d > WADE.ford.car && d <= WADE.ford.offroad);
  assert.ok(s, `water between a car's ford and a 4x4's (${WADE.ford.car}-${WADE.ford.offroad} m)`);
  assert.equal(wadeBand(m, s.x, s.y, VEHICLES.sedan), WB.DEEP, 'a sedan sinks there');
  assert.equal(wadeBand(m, s.x, s.y, VEHICLES.jeep), WB.WADE, 'the 4x4 wades');
});

// a player at the wheel of a fresh vehicle of this model, put down at (x, y) heading east
function drive(model, at) {
  const { p } = joinPlayer(w);
  teleport(w, p.ped, at.x - 40, at.y);
  const v = w.spawnVehicle(model, at.x, at.y, 0, { npcOwned: false });
  assert.ok(vehicles.tryEnter(w, p.ped), 'in');
  return { p, v };
}
const step = (p, n, bits = 0, mx = 0, my = 0) => { let seq = p.ack; for (let i = 0; i < n; i++) { p.inputQ.push({ seq: ++seq, bits, mx, my, aim: 0 }); w.step(); } };

test('very shallow: splashed through, nothing lost; wading: the engine floods after a while, stalls, then tries again', () => {
  const sh = spot((d) => d > 0 && d <= WADE.splash);
  assert.ok(sh, 'very shallow water');
  { const { p, v } = drive('sedan', sh);
    step(p, 60);
    assert.ok(!v.sinkAt && w.get(v.id), 'a car in very shallow water: still there');
    assert.ok(!v.stalled, 'and its engine never floods there');
    vehicles.ejectPed(w, p.ped, true); w.remove(v); }
  const wd = spot((d) => d > WADE.splash + 0.02 && d < WADE.ford.car - 0.02);
  assert.ok(wd, 'water a car can wade');
  const { p, v } = drive('sedan', wd);
  step(p, Math.round(WADE.holdS * 20) - 10);
  assert.ok(!v.sinkAt && !v.stalled, `a car wading: running for ${WADE.holdS} s`);
  step(p, 30);
  assert.ok(v.stalled && !v.sinkAt, 'then the engine floods - stalled, not sunk');
  assert.ok(vehicles.vehFlags(w, v) & VF.STALL, 'the page is told (VF.STALL)');
  assert.ok(p.ped.vehId === v.id, 'the driver stays in');
  // no power while stalled: full throttle and it doesn't go
  const x0 = v.x; v.vx = 0; v.vy = 0;
  step(p, 20, IN.TANK, 0, -1);
  assert.ok(Math.abs(v.x - x0) < 4, 'no power');
  step(p, Math.round(WADE.restartS * 20));
  assert.ok(!v.stalled, `it tries again after ${WADE.restartS} s`);
  assert.ok(!(vehicles.vehFlags(w, v) & VF.STALL));
  vehicles.ejectPed(w, p.ped, true); w.remove(v);
});

test('an off-road vehicle wades where a car sinks, and holds out longer before it floods', () => {
  const s = spot((d) => d > WADE.ford.car + 0.05 && d < WADE.ford.offroad - 0.05);
  assert.ok(s);
  { const { p, v } = drive('sedan', s); step(p, 4); assert.ok(v.sinkAt, 'the sedan sinks'); step(p, 80); }
  const { p, v } = drive('jeep', s);
  step(p, Math.round(WADE.holdS * 20) + 20);
  assert.ok(!v.sinkAt && !v.stalled, `the 4x4 still running past a car's ${WADE.holdS} s`);
  step(p, Math.round((WADE.offroadHoldS - WADE.holdS) * 20));
  assert.ok(v.stalled, `floods after ${WADE.offroadHoldS} s`);
  vehicles.ejectPed(w, p.ped, true); w.remove(v);
});

test('splashing through is not slowed; wading is', () => {
  const sh = spot((d) => d > 0 && d <= WADE.splash), wd = spot((d) => d > WADE.splash + 0.05 && d < WADE.ford.offroad - 0.05);
  const speedIn = (at) => { const { p, v } = drive('jeep', at); v.vx = 300; v.vy = 0; step(p, 6, IN.TANK, 0, -1); const sp = Math.hypot(v.vx, v.vy); vehicles.ejectPed(w, p.ped, true); w.remove(v); return sp; };
  const a = speedIn(sh), b = speedIn(wd);
  assert.ok(a > 250, `splashing: kept its speed (${a.toFixed(0)} px/s)`);
  assert.ok(b < a * 0.85, `wading: slower (${b.toFixed(0)} against ${a.toFixed(0)})`);
});
