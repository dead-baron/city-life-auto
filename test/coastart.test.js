// The coast's art (the art pass, 2026-11-25; concepts NS1-F "coast and beach set pieces", NR1-C "basalt coast rocks").
// Looked at that day: a wild beach was plain sand to the water - no tideline; shells lay thick everywhere (the owner,
// 11-23: "shells too thick"); a tidepool shelf was the rocky shore's pale rounded cobbles; reeds stood on the sea's
// shingle. The rules, by their code and by counting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRACK, wrackW, MATERIALS as M_ } from '../client/art2/game/groundbake.js';
import { groundPixel } from '../client/art2/ground.js';

const GB = readFileSync(new URL('../client/art2/game/groundbake.js', import.meta.url), 'utf8');
const ST = readFileSync(new URL('../client/art2/game/statics.js', import.meta.url), 'utf8');

test('the tideline: a band of wrack above the swash, wandering, on sea beaches only', () => {
  let lo = 1e9, hi = 0; const mids = [];
  for (let X = 0; X < 6000; X += 5) { let a = -1, b = -1; for (let nd = 0; nd < 60; nd += 0.25) if (wrackW(nd, X, 900, 7) > 0) { if (a < 0) a = nd; b = nd; } assert.ok(a >= 0, `a band at X ${X}`); lo = Math.min(lo, a); hi = Math.max(hi, b); mids.push((a + b) / 2); assert.ok(b - a <= WRACK.w * 2 + 0.5, `the band is narrow (${b - a} px)`); }
  assert.ok(lo > 22, `never in the swash's sand (lowest ${lo} px from the water; the swash runs to about 20)`);
  assert.ok(hi < 46, `nor far up the beach (highest ${hi} px)`);
  assert.ok(Math.max(...mids) - Math.min(...mids) > 6, `it wanders (${(Math.max(...mids) - Math.min(...mids)).toFixed(1)} px)`);
  assert.equal(wrackW(WRACK.at, 0, 0, 1) > 0 || wrackW(WRACK.at + WRACK.wander / 2, 0, 0, 1) > 0 || wrackW(WRACK.at - WRACK.wander / 2, 0, 0, 1) > 0, true);
  assert.match(GB, /if \(m === M_\.BEACH && nd < 60 && M\.distSea\) \{ const ww = wrackW\(nd, X, Y, seed\)[^\n]*M\.distSea\[M\.idx\(tx, ty\)\] < WRACK\.sea/, 'laid by the decals pass, on sand within reach of the sea');
  const shell = +GB.match(/cov\('BEACH', \[\['shell', 4, ([0-9.]+)\]/)[1];
  assert.ok(shell <= 0.008, `shells thin on the open sand (${shell} a cell; it was 0.02)`);
});

test('a tidepool shelf is dark basalt, the rocky shore keeps its cobbles; the materials before it keep their numbers', () => {
  const lum = (k) => { let s = 0, n = 0; for (let y = 0; y < 80; y += 2) for (let x = 0; x < 120; x += 2) { const c = groundPixel(k, 300 + x, 500 + y, 7).c; s += (c[0] + c[1] + c[2]) / 3; n++; } return s / n; };
  const basalt = lum('basaltShelf'), cobble = lum('rockShore');
  assert.ok(basalt < 70 && basalt > 30, `the shelf is dark, not black (${Math.round(basalt)})`);
  assert.ok(cobble > basalt + 25, `the rocky shore is lighter (${Math.round(cobble)} to ${Math.round(basalt)})`);
  assert.match(GB, /if \(\(b\.tres\[k\] & 192\) === 192\) m = M_\.BASALT;/);
  assert.equal(M_.BASALT, Object.keys(M_).length - 1, 'added last');
  assert.equal(M_.FLAGS, M_.BASALT - 1);
});

test("no reeds on the sea's shingle", () => {
  assert.match(ST, /if \(t === T\.SAND\) return h < 0\.07 && !\(M\.distSea && M\.distSea\[i\] < 16 && !dry\) \?/);
});
