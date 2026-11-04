// Standing still (the owner, 2026-11-04: the NPC idle "just looks like they're sitting back and forward over and over"):
// the idle's breath fills the chest only - the head and the feet keep their pixels, so nobody bobs or
// squats - and each person keeps their own clock (client/art2/game/peds.js idleFrame): a slow breath, a glance aside
// now and then, a crowd never in step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Pd from '../client/art2/game/peds.js';
import { recipeLook } from '../server/systems/npclooks.js';
import { encodeLook } from '../shared/look.js';

const looks = [['casual', 3], ['executive', 11], ['senior', 5], ['athlete', 9], ['construction', 33]].map(([a, s]) => Pd.adaptApp({ lk: encodeLook(recipeLook(a, s, 'commercial', false).look) }));
// a sprite's rows, keyed by their height over the feet (the anchor)
// (each pixel by its place from the anchor: the sprites are cropped tight, so a frame's box may differ)
const rows = (G) => { const r = new Map(); for (let y = 0; y < G.h; y++) { let s = ''; for (let X = -40; X < 40; X++) { const x = X + Math.round(G.ax); if (x < 0 || x >= G.w) { s += '.'; continue; } const q = (y * G.w + x) * 4; s += G.col[q + 3] >= 128 ? `${G.col[q]},${G.col[q + 1]},${G.col[q + 2]};` : '.'; } r.set(y - G.ay, s); } return r; };
const top = (G) => { for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3] >= 128) return y - G.ay; return 0; };

test('standing: the breath moves the chest, never the head or the feet', () => {
  assert.equal(Pd.PED_POSES.idle, 4, 'idle: rest, breath, a glance either way');
  const bad = [];
  let moved = 0, all = 0;
  for (const [k, A] of looks.entries()) for (let d = 0; d < 8; d++) {
    const G0 = Pd.pedSprite(A, 'idle', d, 0, 0), G1 = Pd.pedSprite(A, 'idle', d, 1, 0), R0 = rows(G0), R1 = rows(G1), h = -top(G0);
    if (top(G1) !== top(G0)) bad.push(`look ${k} heading ${d}: the head's top ${top(G0)} -> ${top(G1)}`);
    // the head (the top rows, down to the hair on the shoulders) and the feet (the lowest rows) keep every pixel
    // (the feet: the middle of the lowest rows - a big man's arms hang down beside them)
    const mid = (r) => (r || '').split(/(?<=;)|(?<=\.)/).slice(40 - 8, 40 + 8).join('');
    for (const [y, s] of R1) if ((y < -h * 0.85 ? R0.get(y) !== s : y > -3 && mid(R0.get(y)) !== mid(s))) { bad.push(`look ${k} heading ${d}: row ${y} of ${-h} changed`); break; }
    // a small change: the chest, not the whole body
    let n = 0, ch = 0;
    for (const [y, s] of R1) { const s0 = R0.get(y) || ''; const a = s.split(/(?<=;)|(?<=\.)/), b = s0.split(/(?<=;)|(?<=\.)/); for (let i = 0; i < a.length; i++) { if (a[i] !== '.') n++; if (a[i] !== b[i]) ch++; } }
    moved += ch; all += n;
    if (!ch) bad.push(`look ${k} heading ${d}: no breath`);
  }
  assert.ok(moved < all * 0.08, `the breath changes ${moved} of ${all} pixels`);
  assert.deepEqual(bad, []);
});

test('standing: each person on their own clock - a slow breath, a glance now and then, a crowd never in step', () => {
  assert.equal(typeof Pd.idleFrame, 'function');
  const ids = Array.from({ length: 12 }, (_, i) => 1000 + i * 7);
  const DT = 0.1, T = 120;
  let inStep = 0, samples = 0;
  for (const id of ids) {
    let last = Pd.idleFrame(id, 0), since = 0, shortest = 1e9, glances = 0, glanceT = 0, first = true;   // (first: the hold cut short at t = 0)
    for (let t = DT; t < T; t += DT) {
      const f = Pd.idleFrame(id, t);
      assert.ok(f >= 0 && f < Pd.PED_POSES.idle, `frame ${f}`);
      if (f >= 2) glanceT += DT;
      if (f !== last) { if (!first) shortest = Math.min(shortest, since + DT); first = false; if (f >= 2) glances++; last = f; since = 0; } else since += DT;
    }
    assert.ok(shortest >= 0.75, `id ${id}: a frame held only ${shortest.toFixed(1)} s (no flicker)`);
    assert.ok(glances >= 4 && glances <= 10, `id ${id}: ${glances} glances in ${T} s (every 13-22 s)`);
    assert.ok(glanceT < T * 0.15, `id ${id}: glancing ${glanceT.toFixed(1)} s of ${T}`);
  }
  // the crowd: at any moment, not everyone breathing in step
  for (let t = 0; t < T; t += 0.5) { samples++; const fs = ids.map((id) => Pd.idleFrame(id, t)); if (fs.every((f) => f === fs[0])) inStep++; }
  assert.ok(inStep <= samples * 0.02, `the crowd all on one frame ${inStep} times of ${samples}`);
});
