// Car-style keyboard driving (the owner's notes, 2026-10-10): on a keyboard at the wheel W is the gas, S brakes then
// reverses, A / D steer - the wheel eased over, not snapped - and the old point-the-way scheme is "Controls 2" in
// Settings. (Touch's aim stick and its FIRE toggle went with UI-2: FIRE is dragged to aim - test/touchslots.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IN, easeSteer, KB_STEER } from '../shared/input.js';
import { vehStep, driveInput, vehForwardSpeed } from '../shared/physics.js';
import { VEHICLES } from '../shared/vehicles.js';
import { KB } from '../shared/controls.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const map = { tileAtPx: () => 3, tileAt: () => 3, solidProps: new Map(), w: 512 };
// drive def for secs with the keys held (w/s/a/d booleans), the wheel eased as the client does; returns the state
function drive(def, keys, secs, s = { x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0 }, log = null) {
  let wheel = 0;
  for (let t = 0; t < secs; t += 1 / 30) {
    wheel = easeSteer(wheel, (keys.d ? 1 : 0) - (keys.a ? 1 : 0), 1 / 30);
    const inp = { bits: IN.TANK, mx: wheel, my: (keys.s ? 1 : 0) - (keys.w ? 1 : 0), aim: 0 };
    vehStep(s, driveInput(s, inp), 1 / 30, map, def, {});
    if (log) log.push(vehForwardSpeed(s));
  }
  return s;
}

test('keyboard driving: car-style is the default (W gas, S brake / reverse, A/D steer); the point-the-way scheme is the other choice', () => {
  const input = src('client/input.js'), page = src('index.html');
  assert.match(input, /settings = \{ kbDrive: 'car'/, 'the default');
  assert.match(input, /kbDriveV !== 2\) \{ settings\.kbDrive = 'car'/, 'everyone starts this build on it, once');
  assert.match(page, /<option value="car">Car: W gas, S brake\/reverse, A\/D steer<\/option><option value="direction">/, 'Settings: car first, then Controls 2');
  assert.equal(KB.gas, 'W'); assert.equal(KB.brake, 'S');
  // W + D: full gas AND full lock (the two axes are separate - no diagonal shrinking either)
  const both = driveInput({ x: 0, y: 0, a: 0, vx: 0, vy: 0 }, { bits: IN.TANK, mx: 1, my: -1, aim: 0 });
  assert.equal(both.throttle, 1); assert.equal(both.steer, 1);
});

test('keyboard driving: the wheel eases over and back - no snapping', () => {
  let w = 0, n = 0;
  const dt = 1 / 60;
  for (let t = 0; t < KB_STEER.in * 0.45; t += dt) { const nw = easeSteer(w, 1, dt); assert.ok(nw - w <= dt / KB_STEER.in + 1e-9, 'a little each tick'); w = nw; }
  assert.ok(w > 0.2 && w < 0.6, `part way over after a short press (${w.toFixed(2)})`);
  while (w < 1 && n++ < 100) w = easeSteer(w, 1, dt);
  assert.equal(w, 1, 'full lock');
  assert.ok(n * dt < KB_STEER.in, 'in about a fifth of a second');
  n = 0; while (w > 0 && n++ < 100) w = easeSteer(w, 0, dt);
  assert.equal(w, 0); assert.ok(n * dt <= KB_STEER.out + dt, 'back to straight quicker');
  w = 1; n = 0; while (w > 0 && n++ < 100) w = easeSteer(w, -1, dt);
  assert.ok(n * dt <= KB_STEER.out + dt, 'turning the other way swings back through the middle at the quick rate');
  // the car's yaw builds smoothly: a tap of D at speed turns it a little, holding it turns it a lot
  const d = VEHICLES.sedan, fast = () => ({ x: 0, y: 0, a: 0, vx: d.max * 0.6, vy: 0, av: 0 });
  const tap = drive(d, { w: true, d: true }, 0.08, fast()), hold = drive(d, { w: true, d: true }, 0.6, fast());
  assert.ok(Math.abs(tap.a) < 0.1 && hold.a > 4 * Math.abs(tap.a), `tap ${tap.a.toFixed(3)} vs hold ${hold.a.toFixed(2)} rad`);
});

test('keyboard driving: W drives off, S brakes to a stop and then reverses; steering in reverse swings the car the other way, like a real car', () => {
  for (const id of ['sedan', 'pickup', 'bike', 'bicycle']) {
    const d = VEHICLES[id];
    if (!d) continue;
    const go = drive(d, { w: true }, 2);
    assert.ok(vehForwardSpeed(go) > 100, `${id}: W drives off (${vehForwardSpeed(go).toFixed(0)})`);
    // S from a standstill reverses
    const back = drive(d, { s: true }, 2);
    assert.ok(vehForwardSpeed(back) < -40, `${id}: S from a stop reverses (${vehForwardSpeed(back).toFixed(0)})`);
    // S while rolling forward: brakes to a stop first, then backs up
    const log = [];
    drive(d, { s: true }, 3, { x: 0, y: 0, a: 0, vx: d.max * 0.5, vy: 0, av: 0 }, log);
    const firstBack = log.findIndex((v) => v < -5);
    assert.ok(firstBack > 0 && log.slice(0, firstBack).every((v, i) => i === 0 || v <= log[i - 1] + 1e-6), `${id}: slows all the way down before reversing`);
    assert.ok(log[log.length - 1] < -40, `${id}: and then reverses`);
  }
  // the wheel turned right going forward turns the nose right (clockwise on screen); going backwards, the same wheel
  // swings the nose the other way
  const d = VEHICLES.sedan;
  const fwd = drive(d, { w: true, d: true }, 0.7), rev = drive(d, { s: true, d: true }, 1.5);
  assert.ok(fwd.a > 0.3, `forward + right: turns clockwise (${fwd.a.toFixed(2)})`);
  assert.ok(rev.a < -0.1, `reverse + right: turns the other way (${rev.a.toFixed(2)})`);
  // the old scheme still works: pointing the move vector somewhere drives there (no IN.TANK)
  const s = { x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0 };
  for (let t = 0; t < 2; t += 1 / 30) vehStep(s, driveInput(s, { bits: 0, mx: 0, my: 1, aim: 0 }), 1 / 30, map, d, {});
  assert.ok(Math.sin(s.a) > 0.5 || vehForwardSpeed(s) < -20, 'Controls 2: S points it down the screen');
});

test('touch: the aim stick and its FIRE toggle are gone, cleanly - FIRE is dragged to aim (UI-2)', () => {
  const page = src('index.html'), input = src('client/input.js'), main = src('client/main.js');
  assert.doesNotMatch(page, /id="firetog"|id="stick-r"|id="s-edgefire"/);
  assert.doesNotMatch(input, /touchEdgeFire: true|fixedStick|showFireToggle/);
  assert.match(input, /delete settings\.touchEdgeFire;/, 'the old setting dropped from what a browser kept');
  assert.doesNotMatch(main, /touchEdgeFire|s-edgefire/);
  assert.equal(typeof IN.BLOCK, 'number', 'the guard: a BLOCK button now (shared/controls.js TOUCH_STATES)');
});
