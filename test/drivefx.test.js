// Shooting from a car (the owner, 11-06: "you'll see the muzzle flash way outside of the car like lagging behind it by
// itself"): the flash and the tracer start at the window on the side aimed at - or over the roof aiming ahead or behind -
// of the car where it's drawn (client/render/fx.js windowMuzzle; main.js 'shot' and collectLights).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { windowMuzzle } from '../client/render/fx.js';

const L = 100, W = 48;
// the point in the car's own frame: x ahead, y to its right
const local = (m, cx, cy, ca) => { const dx = m.x - cx, dy = m.y - cy; return { x: dx * Math.cos(ca) + dy * Math.sin(ca), y: -dx * Math.sin(ca) + dy * Math.cos(ca) }; };

test('aiming to a side: out of that side\'s window, on the car wherever it is and however it faces', () => {
  for (const ca of [0, 0.7, Math.PI / 2, 2.5, -1.9]) {
    const cx = 1234, cy = -567;
    const r = local(windowMuzzle(cx, cy, ca, L, W, ca + Math.PI / 2, false, 0), cx, cy, ca);
    assert.ok(Math.abs(r.y - (W / 2 + 1)) < 1e-6, 'the right-hand window');
    assert.ok(r.x > 0 && r.x < L / 4, 'the front row');
    const l = local(windowMuzzle(cx, cy, ca, L, W, ca - Math.PI / 2, false, 0), cx, cy, ca);
    assert.ok(Math.abs(l.y + (W / 2 + 1)) < 1e-6, 'the left-hand window');
    const b = local(windowMuzzle(cx, cy, ca, L, W, ca + Math.PI / 2, true, 0), cx, cy, ca);
    assert.ok(b.x < 0, 'a back seat: the back window');
  }
});

test('aiming ahead or behind: over the roof, never outside the car body', () => {
  const ahead = windowMuzzle(0, 0, 0, L, W, 0.1, false, 0);
  assert.ok(ahead.roof && Math.abs(ahead.y) < 1e-6 && ahead.x > 0 && ahead.x < L / 2);
  const behind = windowMuzzle(0, 0, 0, L, W, Math.PI, false, 0);
  assert.ok(behind.roof && behind.x < 0 && behind.x > -L / 2);
});

test('the barrel: a few px along the aim, so the flash is just outside the window', () => {
  const a = Math.PI / 2, m0 = windowMuzzle(50, 50, 0, L, W, a, false, 0), m = windowMuzzle(50, 50, 0, L, W, a, false, 6);
  assert.ok(Math.abs(m.y - m0.y - 6) < 1e-6 && Math.abs(m.x - m0.x) < 1e-6);
  assert.ok(Math.hypot(m.x - 50, m.y - 50) < L / 2, 'stays with the car - not trailing behind it');
});
