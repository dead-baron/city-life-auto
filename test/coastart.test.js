// The coast's art (the art pass, 2026-11-25; concepts NS1-F "coast and beach set pieces", NR1-C "basalt coast rocks").
// Looked at that day: a wild beach was plain sand to the water - no tideline; shells lay thick everywhere (the owner,
// 11-23: "shells too thick"); a tidepool shelf was the rocky shore's pale rounded cobbles; reeds stood on the sea's
// shingle. The rules, by their code and by counting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { WRACK, wrackW, MATERIALS as M_ } from '../client/art2/game/groundbake.js';
import { groundPixel } from '../client/art2/ground.js';
import { makeStatic } from '../client/art2/game/statics.js';
import { STACKS3, inLine3 } from '../shared/world3-coast.js';

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

test('sea stacks: three in a line is told from three that are not; each seed its own rock, broad and narrow', () => {
  assert.equal(inLine3([491.5, 1095.5], [491.5, 1103.5], [491.5, 1117.5]), true, 'the four off Redwood Cove stood on one column of tiles');
  assert.equal(inLine3([662, 2552], [658, 2565], [658, 2572]), true, 'the Egret coves\' three, 1.4 tiles off a line');
  assert.equal(inLine3([490, 1095], [497, 1103], [488, 1112]), false);
  assert.equal(inLine3([0, 0], [100, 0], [200, 0]), false, 'far apart is no line to the eye');
  assert.ok(STACKS3.shapes >= 12 && STACKS3.r[1] / STACKS3.r[0] >= 1.6, 'sizes are mixed');
  const sigs = new Set(), wide = [];
  for (let sd = 1; sd <= 12; sd++) { const G = makeStatic({ t: 'stack', s: sd, r: 26, h: 150 }); let n = 0, sig = 0, x0 = 1e9, x1 = -1; for (let i = 0; i < G.w * G.h; i++) if (G.col[i * 4 + 3]) { n++; sig = (Math.imul(sig, 31) + i) | 0; const x = i % G.w; if (x < x0) x0 = x; if (x > x1) x1 = x; } assert.ok(n > 1500, `seed ${sd}: it draws (${n} px)`); sigs.add(sig); wide.push(x1 - x0 + 1); }
  assert.equal(sigs.size, 12, 'twelve seeds, twelve rocks');
  assert.ok(Math.max(...wide) >= Math.min(...wide) * 1.25, `broad and narrow at one size (${Math.min(...wide)} to ${Math.max(...wide)} px)`);
});

test("a rock standing alone - the sea cave's - is a headland of crags, not a drum of rings", () => {
  const prof = (G) => { const top = []; for (let x = 0; x < G.w; x++) { let y = 0; while (y < G.h && !G.col[(y * G.w + x) * 4 + 3]) y++; top.push(y); } return top; };
  const drum = prof(makeStatic({ t: 'cliff', w: 512, d: 224, h: 132, s: 37, st: 'basalt' })), crag = prof(makeStatic({ t: 'cliff', w: 512, d: 224, h: 132, s: 37, st: 'basalt', rg: 1 }));
  const rough = (t) => { const mid = t.slice(Math.floor(t.length * 0.2), Math.floor(t.length * 0.8)); let s = 0; for (let i = 4; i < mid.length; i++) s += Math.abs(mid[i] - mid[i - 4]); return s / mid.length; };
  assert.ok(rough(crag) > rough(drum) * 1.25, `its skyline goes up and down (${rough(crag).toFixed(2)} to the drum's ${rough(drum).toFixed(2)})`);
  const cx = Math.floor(crag.length / 2), high = Math.min(...crag.slice(cx - 20, cx + 20)), side = Math.min(...crag.slice(10, 50));
  assert.ok(high < side, 'its tallest crag at the middle of its front, where the way in is');
  assert.match(readFileSync(new URL('../shared/world3-caves.js', import.meta.url), 'utf8'), /P\('cliff', MX, face, 0, \{ w: CW, d: CD, h: CH, s: CS, st: 'basalt', rough: 1 \}\)/);
  assert.match(GB, /const darkRock = propsNear\(C, 340\)\.filter\(\(p\) => p\.t === 'cliff' && \(p\.st === 'basalt' \|\| p\.st === 'lava'\)\);/, 'the ground under a dark rock is dark basalt, not the crags\' pale slabs');
  assert.match(GB, /darkRock\.some\([^\n]*\? M_\.BASALT : M_\.CRAG\)/);
});

