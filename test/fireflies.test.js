// Fireflies (client/render/fireflies.js; task #342, concept FX2): rare, at night, in natural places and parks and
// round the campfires out in the wilds; the same scatter for everyone on a night, a few at a time, pooled, none on
// Low, none by day or in the rain; loaded lazily (never in main.js's static imports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeWorld } from './helpers.js';
import { DISTRICTS } from '../shared/map.js';
import { T, TILE, MAP_W, MAP_H } from '../shared/constants.js';
import { hash2 } from '../shared/rng.js';
import { Fireflies, FLIES } from '../client/render/fireflies.js';

// (no canvas in node: a stand-in for the glow sprite's and the overlay's)
globalThis.OffscreenCanvas ??= class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, set fillStyle(v) {} }; } };
const fakeG = () => { const g = { draws: 0, save() {}, restore() {}, drawImage() { g.draws++; }, fillRect() {}, globalAlpha: 1, globalCompositeOperation: '', fillStyle: '' }; return g; };
const HIGH = { particles: 1, lighting: 2 }, MED = { particles: 1, lighting: 1 }, LOW = { particles: 0, lighting: 0 };

const m = makeWorld().map;
const viewAt = (x, y) => ({ x0: x - 700, y0: y - 450, x1: x + 700, y1: y + 450 });
const run = (ff, g, F, s) => { for (let k = 0; k < s * 30; k++) ff.draw(g, { ...F, dt: 1 / 30 }, F.gfx); };

test('fireflies: at a rest spot on a night they are out, a few blinking and drifting round it; the cap holds', () => {
  // (a rest spot out in the green: none in the desert)
  const spot = m.restSpots.find((s) => ['wild', 'rural', 'park', 'rocky'].includes(DISTRICTS[m.dist[Math.floor(s.y / TILE) * MAP_W + Math.floor(s.x / TILE)]].style));
  // a night they are out, and out at this spot
  let n = 0;
  for (; n < 400; n++) if (hash2(n, 17, 930) < FLIES.nights && hash2(Math.round(spot.x) + n * 31, Math.round(spot.y), 935) < 0.7) break;
  const S = { map: m, day: n, rainK: 0, loopTime: 600 }, ff = new Fireflies(S), g = fakeG();
  const F = { view: viewAt(spot.x, spot.y), sky: { night: 1 }, gfx: HIGH };
  run(ff, g, F, 8);
  assert.ok(ff.live.length > 0, 'fireflies round the fire');
  assert.ok(ff.live.length <= FLIES.max.high * 2, `never many at once (${ff.live.length})`);
  assert.ok(ff.live.filter((f) => f.out < 0).length <= FLIES.max.high, 'the cap');
  assert.ok(g.draws > 0, 'they blink');
  const near = ff.live.filter((f) => f.g.x === spot.x && f.g.y === spot.y);
  assert.ok(near.length >= 2, `some at the fire (${near.length})`);
  for (const f of near) { const d = Math.hypot(f.x - spot.x, f.y - spot.y); assert.ok(d > 20 && d < 220, `round the fire, not in it (${d.toFixed(0)})`); }
  // morning: they fade away and go back to the pool
  const pooled = ff.pool.length;
  run(ff, g, { ...F, sky: { night: 0 } }, 3);
  assert.equal(ff.live.length, 0, 'gone by day');
  assert.ok(ff.pool.length > pooled, 'back in the pool');
  // the same night again: the same flies come back from the pool (no new objects)
  const before = ff.pool.length;
  run(ff, g, F, 3);
  assert.ok(ff.live.length > 0 && ff.pool.length < before, 'reused');
  // Medium: fewer; Low: none at all; rain: none
  const ffM = new Fireflies({ map: m, day: n, rainK: 0, loopTime: 600 }); run(ffM, fakeG(), { ...F, gfx: MED }, 4);
  assert.ok(ffM.live.filter((f) => f.out < 0).length <= FLIES.max.medium, 'fewer on Medium');
  const ffL = new Fireflies({ map: m, day: n, rainK: 0, loopTime: 600 }), gL = fakeG(); run(ffL, gL, { ...F, gfx: LOW }, 4);
  assert.equal(ffL.live.length + gL.draws, 0, 'none on Low');
  const ffR = new Fireflies({ map: m, day: n, rainK: 1, loopTime: 600 }), gR = fakeG(); run(ffR, gR, F, 4);
  assert.equal(gR.draws, 0, 'none in the rain');
});

test('fireflies: rare, only in natural places, the same for everyone on a night and different the next', () => {
  const ff = new Fireflies({ map: m, day: 0 });
  const C = FLIES.cell;
  for (const n of [3, 4]) {
    let grass = 0, glades = 0;
    for (let cy = 0; cy < MAP_H / C; cy++) for (let cx = 0; cx < MAP_W / C; cx++) {
      const tx = cx * C + 6, ty = cy * C + 6;
      if (tx >= MAP_W || ty >= MAP_H) continue;
      const i = ty * MAP_W + tx, d = DISTRICTS[m.dist[i]];
      if (m.tiles[i] === T.GRASS && d && ['wild', 'rural', 'park', 'rocky'].includes(d.style)) grass++;
      const gl = ff.gladeAt(m, cx, cy, n);
      if (!gl) continue;
      glades++;
      const j = Math.floor(gl.y / TILE) * MAP_W + Math.floor(gl.x / TILE);
      assert.equal(m.tiles[j], T.GRASS, 'on grass');
      assert.ok(['wild', 'rural', 'park', 'rocky'].includes(DISTRICTS[m.dist[j]].style), `in a natural place (${DISTRICTS[m.dist[j]].style})`);
      assert.deepEqual(ff.gladeAt(m, cx, cy, n), gl, 'the same for everyone');
    }
    assert.ok(glades > 3 && glades < grass * 0.03, `rare (${glades} glades over ${grass} grass cells)`);
  }
  let same = 0, all = 0;
  for (let cy = 0; cy < MAP_H / C; cy++) for (let cx = 0; cx < MAP_W / C; cx++) { const a = ff.gladeAt(m, cx, cy, 3), b = ff.gladeAt(m, cx, cy, 4); if (a) { all++; if (b) same++; } }
  assert.ok(same < all * 0.3, 'a different scatter the next night');
});

test('fireflies load lazily: not in main.js\'s static imports', () => {
  const src = readFileSync(new URL('../client/main.js', import.meta.url), 'utf8');
  assert.ok(!/^import [^(]*fireflies/m.test(src), 'no static import');
  assert.ok(/import\('\.\/render\/fireflies\.js'\)/.test(src), 'loaded on the first night');
});
