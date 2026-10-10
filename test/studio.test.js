// The music studio's mastering (tools/music/): the loudness meter, the limiter and the warmth stage that
// replaced the hard saturation which made round 2's songs come out distorted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SR, lufs, limit, truePeak, warm, warmChannels } from '../tools/music/dsp.js';

const sine = (amp, f, secs) => { const n = Math.round(SR * secs), x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / SR); return x; };

test('the loudness meter reads a 1 kHz tone as LUFS should (within half a dB), and silence as the floor', () => {
  const a = sine(0.5, 1000, 4);
  assert.ok(Math.abs(lufs(a, a) - -6.02) < 0.5, `both channels at -6 dBFS: ${lufs(a, a).toFixed(2)}`);
  assert.ok(Math.abs(lufs(a, new Float32Array(a.length)) - -9.03) < 0.5, 'one channel: 3 dB less');
  const q = sine(0.05, 1000, 4);
  assert.ok(Math.abs(lufs(q, q) - lufs(a, a) + 20) < 0.1, 'a tenth of the level reads 20 dB down');
  assert.equal(lufs(new Float32Array(SR * 2), new Float32Array(SR * 2)), -70);
  // the deep sub counts for less than the middle (K-weighting): 30 Hz at the same level reads quieter
  const s = sine(0.5, 30, 4);
  assert.ok(lufs(s, s) < lufs(a, a) - 3, 'a 30 Hz tone reads well under a 1 kHz one');
});

test('the limiter holds every peak under its ceiling, between samples too, and leaves quiet sound alone', () => {
  const n = SR * 3, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = R[i] = (i > SR && i < 2 * SR ? 2 : 0.3) * Math.sin(2 * Math.PI * 220 * i / SR);
  const quiet = L.slice(0, Math.round(SR * 0.5));
  const gr = limit(L, R, 0.84);
  assert.ok(Math.abs(gr - 20 * Math.log10(2 / 0.84)) < 0.3, `turned down ${gr.toFixed(2)} dB for a peak 7.5 dB over`);
  assert.ok(truePeak(L, R) <= 0.8401, `nothing past the ceiling (${truePeak(L, R).toFixed(4)})`);
  for (let i = 0; i < quiet.length; i++) assert.ok(Math.abs(L[i] - quiet[i]) < 1e-6, 'before the loud stretch: untouched');
  // it comes back up after the loud stretch (by the end, the quiet tone is at its own level again)
  let pk = 0; for (let i = n - SR / 4; i < n; i++) pk = Math.max(pk, Math.abs(L[i]));
  assert.ok(pk > 0.29 && pk <= 0.3001, `recovered: ${pk.toFixed(3)}`);
  // and the gain never jumps: no step bigger than a ramp over the look-ahead would make
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i > SR && i < 2 * SR ? 2 : 0.3) * Math.sin(2 * Math.PI * 220 * i / SR); g[i] = Math.abs(x) > 0.05 ? L[i] / x : NaN; }
  let worst = 0, prev = NaN;
  for (let i = 0; i < n; i++) { if (!Number.isNaN(g[i]) && !Number.isNaN(prev)) worst = Math.max(worst, Math.abs(g[i] - prev)); if (!Number.isNaN(g[i])) prev = g[i]; else prev = NaN; }
  assert.ok(worst < 0.05, `the gain moves smoothly (largest step ${worst.toFixed(4)})`);
});

test('warmth leaves quiet sound alone and only rounds off the peaks, never folding back', () => {
  for (const amt of [0.2, 0.5, 1]) {
    assert.ok(Math.abs(warm(0.05, amt) - 0.05) < 1e-4, 'quiet: unchanged');
    assert.ok(warm(1, amt) < 1 && warm(1, amt) >= Math.tanh(1) - 1e-9, `full scale rounded off by at most 2.4 dB (${amt})`);
    let prev = -Infinity;
    for (let x = -1.5; x <= 1.5; x += 0.01) { const y = warm(x, amt); assert.ok(y > prev, 'rises all the way'); prev = y; }
  }
  assert.equal(warm(0.7, 5), warm(0.7, 1), 'the amount is capped at 1');
  // a part at any level is warmed the same: set to peak at 1 first
  const a = sine(3, 110, 0.2), b = sine(0.03, 110, 0.2);
  warmChannels([a], 0.5); warmChannels([b], 0.5);
  for (let i = 0; i < a.length; i += 37) assert.ok(Math.abs(a[i] / 100 - b[i]) < 1e-6, 'the same shape at 40 dB apart');
});
