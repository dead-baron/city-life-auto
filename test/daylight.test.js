// The day's light in art v2 (client/art2/game/host.js _preset; lightgame.js PRESETS_GAME, sunKeep, godRays): nothing
// jumps as the clock runs - the sun's place, the light on the ground and on walls, the ambient, the god rays and the
// dust - in clear weather, rain or fog; the night is long and dark; and the god rays come only with a low, strong sun.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World2 } from '../client/art2/game/host.js';
import * as L from '../client/art2/game/lightgame.js';
import { skyAt } from '../client/render/atmos.js';
import { gameClock, DAY_LOOP_S, DAY_PART_S } from '../shared/constants.js';

const luma = (c) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
const STEP = 0.05;   // real seconds
// one loop of the clock, sampled every STEP s: what the renderer would light with
function sweep(rain = 0, fogK = 0) {
  const fake = { L, S: { rainK: rain }, presetA: {}, presetB: {}, presetC: {}, map: null, _nature: () => 1 };
  const rows = [];
  for (let t = 0; t < DAY_LOOP_S; t += STEP) {
    const clk = gameClock(t), sky = skyAt(0, clk.minutes, rain);
    sky.fog = { k: fogK, spread: 0.4 };
    const p = World2.prototype._preset.call(fake, { sky, now: t });
    const d = p.sunDir, l = Math.hypot(d[0], d[1], d[2]), SD = [d[0] / l, d[1] / l, d[2] / l];
    const R = L.godRays(p, SD[2], 1, true, rain, fogK, {});
    rows.push({ t, m: clk.minutes, SD, ground: luma(p.sunCol) * Math.max(0, SD[2]), wall: luma(p.sunCol) * Math.hypot(SD[0], SD[1]), amb: luma(p.ambSky), shaftK: R.shaftK, beamK: R.beamK, moteK: R.moteK });
  }
  return rows;
}
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

for (const [name, rain, fog] of [['clear', 0, 0], ['rain', 0.6, 0], ['a storm', 1, 0], ['fog', 0, 0.45]]) {
  test(`${name}: the light changes smoothly through the day - no jumps at sunrise, sunset or anywhere`, () => {
    const rows = sweep(rain, fog);
    for (const k of ['ground', 'wall', 'amb', 'shaftK', 'beamK', 'moteK']) {
      const mx = Math.max(...rows.map((r) => r[k]));
      if (mx < 1e-6) continue;
      let worst = 0, at = 0;
      for (let i = 1; i < rows.length; i++) { const d = Math.abs(rows[i][k] - rows[i - 1][k]) / STEP / mx; if (d > worst) { worst = d; at = rows[i].m; } }
      // (before: the sun's colour and place switched at a threshold - six times the whole range in a step)
      assert.ok(worst < 0.35, `${k}: ${(worst * 100).toFixed(0)}% of its range in a second at ${hm(at)}`);
    }
    let turn = 0, at = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i].SD, b = rows[i - 1].SD, deg = Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI / STEP;
      if (deg > turn) { turn = deg; at = rows[i].m; }
    }
    assert.ok(turn < 15, `the light's direction turns ${turn.toFixed(1)} deg/s at ${hm(at)}`);
  });
}

test('the night is long and dark: only the lamps, windows and headlights light it', () => {
  const rows = sweep();
  const deep = rows.filter((r) => r.m >= 1260 || r.m <= 270);
  for (const r of deep) assert.ok(r.amb + r.ground < 0.06, `${hm(r.m)}: ambient ${r.amb.toFixed(3)} + moonlight ${r.ground.toFixed(3)}`);
  const darkS = rows.filter((r) => r.amb + r.ground < 0.07).length * STEP, nightS = DAY_LOOP_S - DAY_PART_S;
  assert.ok(darkS >= nightS * 0.85, `dark for ${darkS.toFixed(0)} s of the ${nightS} s night part`);
  // and the day stays as bright as it was
  const noon = rows.filter((r) => r.m > 700 && r.m < 800);
  assert.ok(Math.min(...noon.map((r) => r.ground)) > 0.9, 'full sun at noon');
});

test('god rays and dust only with a low, strong sun: in the morning and at golden hour, never at noon or night', () => {
  const rows = sweep();
  const at = (a, b) => rows.filter((r) => r.m >= a && r.m <= b);
  for (const r of [...at(700, 900), ...at(1240, 1440), ...at(0, 300)]) {
    assert.equal(r.shaftK, 0, `no rays at ${hm(r.m)}`);
    assert.equal(r.beamK, 0, `no canopy beams at ${hm(r.m)}`);
    assert.equal(r.moteK, 0, `no dust at ${hm(r.m)}`);
  }
  for (const r of at(1100, 1140)) assert.ok(r.beamK > 0.5 && r.shaftK > 0.2 && r.moteK > 0.5, `golden hour ${hm(r.m)}: beams ${r.beamK.toFixed(2)} rays ${r.shaftK.toFixed(2)} dust ${r.moteK.toFixed(2)}`);
  for (const r of at(385, 420)) assert.ok(r.beamK > 0.5, `after sunrise ${hm(r.m)}: beams ${r.beamK.toFixed(2)}`);
  // rain thins the dust away
  const wet = sweep(0.8).filter((r) => r.m >= 1100 && r.m <= 1140);
  for (const r of wet) assert.ok(r.moteK < 0.1, `no dust in the rain (${r.moteK.toFixed(2)})`);
});
