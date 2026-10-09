// The wind (client/render/flora/wind.js) and what moves with it in art v2: the redwood canopy's dappled light
// (lightgame.js canopyCover, wind.air - task #388).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Wind, AIR_P } from '../client/render/flora/wind.js';
import { CAN_N } from '../client/art2/game/lightgame.js';
import { DAY_LOOP_S } from '../shared/constants.js';

// the shortest way from a to b on a ring of size P
const ringD = (a, b, P) => { const d = ((b - a) % P + P * 1.5) % P - P / 2; return d; };

// A session on the client: frames of dt seconds, the shared clock wrapping every loop, the rain coming and going,
// and now and then a hitch or the tab in the background (a long gap). Returns the fastest the canopy's leaf clumps
// moved (px/s), both as the shader saw them before (the clock times the wind's speed now) and as they move now.
function session(hours, fps, { gaps = true } = {}) {
  const w = new Wind(), dt0 = 1 / fps;
  let loop = 60, clock = 0, rain = 0, worstNew = 0, worstOld = 0, prevOld = null, inRange = true;
  const oldAt = (t) => { const k = (t % 4096) * (3 + w.strength * 12); return [w.dx * k, w.dy * k]; };
  for (let f = 0; clock < hours * 3600; f++) {
    // (every few minutes a long gap: a tab in the background - the client's dt is clamped to 0.1 s, the shared
    // clock jumps when the next snapshot comes)
    const gap = gaps && f % (fps * 400) === fps * 399;
    const dt = gap ? 0.1 : dt0, real = gap ? 95 : dt0;
    // (the old drift is only measured between jumps of its clocks: what it did while the wind merely changed)
    const jump = gap || Math.floor(clock / 4096) !== Math.floor((clock + dt) / 4096) || loop + real >= DAY_LOOP_S;
    clock += dt; loop = (loop + real) % DAY_LOOP_S;
    rain = Math.max(0, Math.min(1, rain + ((Math.floor(clock / 300) % 3 === 0 ? 1 : 0) - rain) * (1 - Math.exp(-dt / 8))));
    const a0 = w.air[0], a1 = w.air[1];
    w.update(loop, rain, dt);
    const d = Math.hypot(ringD(a0, w.air[0], AIR_P), ringD(a1, w.air[1], AIR_P));
    worstNew = Math.max(worstNew, d / dt);
    if (!(w.air[0] >= 0 && w.air[0] < AIR_P && w.air[1] >= 0 && w.air[1] < AIR_P)) inRange = false;
    const o = oldAt(clock);
    if (prevOld && !jump) worstOld = Math.max(worstOld, Math.hypot(o[0] - prevOld[0], o[1] - prevOld[1]) / dt);
    prevOld = o;
  }
  return { worstNew, worstOld, inRange };
}

test('the canopy\'s dappled light drifts slowly however long the session, at any frame rate, after the tab was away', () => {
  for (const fps of [20, 60, 144]) {
    const r = session(fps === 144 ? 1.5 : 3, fps);
    // (the air moves 3 px/s in calm air, 15 in a gale)
    assert.ok(r.worstNew <= 15.01, `${fps} fps: the clumps drift at most 15 px/s (${r.worstNew.toFixed(2)})`);
    assert.ok(r.inRange, `${fps} fps: the drift stays inside its ring (precise however long the session)`);
    // what the floor did before: the whole pattern raced whenever the wind changed late in a session
    assert.ok(r.worstOld > 200, `${fps} fps: the old clock-times-speed drift raced (${r.worstOld.toFixed(0)} px/s)`);
  }
});

test('the air eases round when the wind turns or picks up, and a long gap or a jumping clock moves it a tenth of a second at most', () => {
  const w = new Wind();
  w.update(100, 0, 1 / 60);
  // the loop wrapping (the wind's direction and mood jump there) and the server's clock snapping
  const v0 = [w.vx, w.vy];
  w.update(5, 1, 1 / 60);
  assert.ok(Math.hypot(w.vx - v0[0], w.vy - v0[1]) < 0.2, 'the velocity eases, it does not jump with the wind');
  const a = [...w.air];
  w.update(800, 1, 120);   // (two minutes in the background)
  assert.ok(Math.hypot(ringD(a[0], w.air[0], AIR_P), ringD(a[1], w.air[1], AIR_P)) <= 1.6, 'a long gap: 0.1 s of drift');
  w.update(800, 1, -5);    // (a clock going backwards: nothing)
  assert.ok(Math.hypot(ringD(a[0], w.air[0], AIR_P), ringD(a[1], w.air[1], AIR_P)) <= 1.6);
});

test('the canopy noise repeats over the air\'s ring, so its wrap never shows', () => {
  // octave 1 moves with the air over CAN_N[0] cells in 8192 px, octave 2 back at half speed over CAN_N[1] in 4096
  for (const [n, span, k] of [[CAN_N[0], 8192, 1], [CAN_N[1], 4096, 0.5]]) {
    const shift = AIR_P * k * (n / span);   // lattice cells moved when the air wraps
    assert.ok(Number.isInteger(n) && Number.isInteger(shift / n), `the wrap moves a whole number of periods (${shift / n})`);
  }
});
