// A kayak is paddled (the pre-beta list C, "Kayak: sitting in it, paddle strokes"; shared/physics.js PADDLE): strokes
// left and right in turn - a surge as each blade pulls, a glide between - slow to turn, even on the spot; no engine.
// The page draws the rider low in the cockpit, the legs out of sight, the double paddle stroking (people.js 'paddle').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vehStep, newVehState } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { PADDLE } from '../shared/rules.js';
import { T } from '../shared/constants.js';
import { CityMap } from '../shared/mapcore.js';

const def = VEHICLES.kayak, map = new CityMap(1, 400, 400);
map.tiles.fill(T.WATER);
const run = (inp, secs, s = newVehState(3200, 3200, 0)) => {
  const sp = [];
  for (let i = 0; i < secs * 30; i++) { vehStep(s, { drv: true, hb: false, slide: false, ...inp }, 1 / 30, map, def, { rain: false }); sp.push(Math.hypot(s.vx, s.vy)); }
  return { s, sp };
};
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

test('paddled flat out: a surge each stroke and a glide between, at a paddler\'s pace - not a motorboat\'s', () => {
  const { sp } = run({ throttle: 1, steer: 0 }, 10), last = sp.slice(-90);
  const hi = Math.max(...last), lo = Math.min(...last), mean = avg(last);
  assert.ok(mean > 120 && mean < 220, `cruising ${mean.toFixed(0)} px/s`);
  assert.ok(hi - lo > mean * 0.1, `it surges and eases with the strokes (${lo.toFixed(0)}-${hi.toFixed(0)})`);
  assert.ok(mean < def.max * 0.8, 'well under the old motorboat top speed');
  const light = avg(run({ throttle: 0.3, steer: 0 }, 10).sp.slice(-90));
  assert.ok(light < mean * 0.5, `a light push paddles gently (${light.toFixed(0)})`);
});
test('let go and it glides on, slowing; backpaddling takes it astern', () => {
  const g = run({ throttle: 1, steer: 0 }, 8), v0 = g.sp[g.sp.length - 1];
  const { sp } = run({ throttle: 0, steer: 0 }, 3, g.s);
  assert.ok(sp[29] > v0 * 0.45 && sp[29] < v0 * 0.9, `a second on it's still going (${v0.toFixed(0)} -> ${sp[29].toFixed(0)})`);
  assert.ok(sp[89] < sp[29] * 0.6, 'and slowing');
  const a = run({ throttle: -1, steer: 0 }, 8);
  const fwd = a.s.vx * Math.cos(a.s.a) + a.s.vy * Math.sin(a.s.a);
  assert.ok(fwd < -30 && fwd > -120, `astern, slowly (${fwd.toFixed(0)})`);
});
test('slow to turn: a stroke on one side swings it round even standing still - slowly', () => {
  const r = run({ throttle: 0, steer: 1 }, 4), deg = Math.abs(r.s.a) * 180 / Math.PI;
  assert.ok(deg > 40 && deg < 200, `round on the spot ${deg.toFixed(0)} degrees in 4 s`);
  assert.ok(Math.hypot(r.s.x - 3200, r.s.y - 3200) < 30, 'without going anywhere much');
  const rate = (d) => {   // degrees a second, on average, turning under way (the kayak's comes in pulses, a stroke at a time)
    const s = newVehState(3200, 3200, 0); let tot = 0;
    for (let i = 0; i < 180; i++) { vehStep(s, { drv: true, throttle: 1, steer: i < 60 ? 0 : 1 }, 1 / 30, map, d, { rain: false }); if (i >= 60) tot += s.av / 30; }
    return tot * 180 / Math.PI / 4;
  };
  assert.ok(rate(def) < rate(VEHICLES.speedboat), `turns slower than a speedboat under way (${rate(def).toFixed(0)} vs ${rate(VEHICLES.speedboat).toFixed(0)} deg/s)`);
});
test('the stroke phase goes round only while paddling (the page draws the paddle by it, the self record carries it)', () => {
  const s = newVehState(3200, 3200, 0);
  run({ throttle: 0, steer: 0 }, 2, s);
  assert.ok(!s.pph, 'sitting still: the paddle rests');
  run({ throttle: 1, steer: 0 }, 1 / PADDLE.rate / 2, s);
  assert.ok(s.pph > 0.3 && s.pph < 0.7, `a stroke a side in a pair (${s.pph.toFixed(2)})`);
});
test('the rider: low in the cockpit, the double paddle - four frames, every facing', async () => {
  const { person } = await import('../client/art2/people.js');
  const LK = await import('../shared/look.js');
  const A = LK.lookArt(structuredClone(LK.STARTERS[0].look));
  const keys = new Set();
  for (const d of [0, 2, 4, 6]) for (let f = 0; f < 4; f++) {
    const g = person(A, d, 'paddle', f, { tight: true });
    assert.ok(g && g.w > 0 && g.h > 0, `drawn: dir ${d} frame ${f}`);
    keys.add(`${g.w}x${g.h}:${g.ax},${g.ay}`);
  }
  assert.ok(keys.size > 2, 'the frames differ - the paddle moves');
  const sit = person(A, 0, 'paddle', 0, { tight: true }), stand = person(A, 0, 'idle', 0, { tight: true });
  assert.ok(sit.ay < stand.ay - 6, `sat low, the legs out of sight (${sit.ay} vs ${stand.ay} standing)`);
});
