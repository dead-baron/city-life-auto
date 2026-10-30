// Calm water on the sea, the bays and the lakes (the owner, 10-26, on a beach: "There are still rapid lines on large
// bodies of water"). The white streaks in diagonal rows over the whole sea were the light pass's glints (client/art2/game/
// lightgame.js waterSurf): the still water's surface was swells at fixed angles - sums of sines along the wind - and the
// sun caught their crests where they lined up, a lattice of short white dashes marching over the bay (bending them with
// a noise, 10-23, didn't break the rows up). Now the wind's ripples are two octaves of noise drifting down the wind, and
// the sun catches the odd ripple, in patches: a sparkle here and there, nothing in rows.
// The glints are worked out on the GPU; mirror() below is the shader's arithmetic for the open sea in JS - the test
// first checks the shader still says what the mirror does (SHADER_LINES), then that the mirror's glints don't repeat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../client/art2/game/lightgame.js', import.meta.url), 'utf8');
const still = SRC.slice(SRC.indexOf('  if (still) {'), SRC.indexOf('  int ci = int(code + 0.5);'));
const SHADER_LINES = [
  'vec2 q = vec2(dot(w, d1), dot(w, e1)) * f, r = vec2(q.x * 0.8 + q.y * 0.6, q.y * 0.8 - q.x * 0.6);',
  'vec3 n1 = wnoiseD(vec2(q.x * 0.11 - t * 0.35, q.y * 0.045 + 13.0)), n2 = wnoiseD(vec2(r.x * 0.23 - t * 0.6, r.y * 0.09 + 57.0));',
  'vec2 g = (d1 * (n1.y * 0.11 + (n2.y * 0.184 - n2.z * 0.054) * 0.5) + e1 * (n1.z * 0.045 + (n2.y * 0.138 + n2.z * 0.072) * 0.5)) * (A * (inl ? 9.0 : 20.0) * f);',
  'glint = step(inl ? 0.8 + bayer4(wq) * 0.18 : 0.72 + bayer4(wq) * 0.25, pow(max(dot(nw, H), 0.0), inl ? 200.0 : 60.0)) * (pond ? 0.22 : inl ? 0.4 : 0.5);',
  'glint *= step(0.5, wnoise(w * 0.0053 - d1 * (t * 0.03) + 7.0)) * step(inl ? 0.6 : 0.75, hash2((inl ? wq : ivec2(floor(w * 0.5))) + ivec2(int(t * 3.0) * 131, 7)));',
];

const hash2 = (x, y) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) & 16777215) / 16777216; };
const wnoiseD = (px, py) => {
  const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), e = hash2(ix, iy + 1), k = a - b - e + hash2(ix + 1, iy + 1);
  return [a + (b - a) * ux + (e - a) * uy + k * ux * uy, 6 * fx * (1 - fx) * (b - a + k * uy), 6 * fy * (1 - fy) * (e - a + k * ux)];
};
const wnoise = (px, py) => wnoiseD(px, py)[0];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
const unit = (v) => { const l = Math.hypot(...v); return v.map((q) => q / l); };
// the open sea's glints over a W x H stretch of world px at time t (s): 1 where the sun glints
function mirror(sun, wind, t, X0, Y0, W, H) {
  const d1 = unit([wind[2] + 1e-3, wind[3]]), e1 = [-d1[1], d1[0]], Hv = unit([sun[0], sun[1] + 0.5, sun[2] + 0.866]);
  const A = 0.1 + wind[0] * 0.3, out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = X0 + x, wy = Y0 + y, qx = wx * d1[0] + wy * d1[1], qy = wx * e1[0] + wy * e1[1], rx = qx * 0.8 + qy * 0.6, ry = qy * 0.8 - qx * 0.6;
    const n1 = wnoiseD(qx * 0.11 - t * 0.35, qy * 0.045 + 13), n2 = wnoiseD(rx * 0.23 - t * 0.6, ry * 0.09 + 57);
    const gu = n1[1] * 0.11 + (n2[1] * 0.184 - n2[2] * 0.054) * 0.5, gv = n1[2] * 0.045 + (n2[1] * 0.138 + n2[2] * 0.072) * 0.5;
    const n = unit([(d1[0] * gu + e1[0] * gv) * A * 20, (d1[1] * gu + e1[1] * gv) * A * 20, 1]);
    const s = Math.pow(Math.max(0, n[0] * Hv[0] + n[1] * Hv[1] + n[2] * Hv[2]), 60);
    if (s < 0.72 + BAYER[(wy & 3) * 4 + (wx & 3)] * 0.25) continue;
    if (wnoise(wx * 0.0053 - d1[0] * t * 0.03 + 7, wy * 0.0053 - d1[1] * t * 0.03 + 7) < 0.5) continue;
    if (hash2(Math.floor(wx * 0.5) + Math.floor(t * 3) * 131, Math.floor(wy * 0.5) + 7) < 0.75) continue;
    out[y * W + x] = 1;
  }
  return out;
}
// how much of the glint pattern repeats at its best offset (8 to 60 px away): rows of dashes repeat a third or more
function repeat(m, W, H) {
  let n = 0, best = 0;
  for (let i = 0; i < W * H; i++) n += m[i];
  for (let dy = -60; dy <= 60; dy += 2) for (let dx = -60; dx <= 60; dx += 2) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) continue;
    let c = 0;
    for (let y = Math.max(0, -dy); y < Math.min(H, H - dy); y++) for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x++) if (m[y * W + x] && m[(y + dy) * W + x + dx]) c++;
    best = Math.max(best, c);
  }
  return { n, rep: n ? best / n : 0 };
}

test('the still water\'s surface: noise ripples, no swells at fixed angles', () => {
  assert.ok(still.length > 500, 'the still water\'s branch of waterSurf found');
  for (const L of SHADER_LINES) assert.ok(still.includes(L), `the shader says what the test's mirror does: ${L.slice(0, 60)}...`);
  assert.ok(!/sin\(p[123]\)|cos\(p[123]\)/.test(still), 'no sums of sines along fixed directions');
  assert.ok(/vec3 wnoiseD\(vec2 p\)/.test(SRC));
});

test('the sea glints here and there, never in rows of white dashes', () => {
  // (a phone's view of open sea: mid-morning, noon and afternoon suns; the wind from three ways)
  const suns = [[0.285, -0.603, 0.745], [0.05, -0.45, 0.89], [-0.3, -0.5, 0.81]], winds = [[0.35, 0, 0.8, 0.6], [0.6, 0, -0.2, 1], [0.15, 0, 1, -0.3]];
  let lit = 0;
  for (let i = 0; i < suns.length; i++) for (let j = 0; j < winds.length; j++) {
    const t = 17 + i * 31 + j * 7, m = mirror(suns[i], winds[j], t, 144000 + j * 900, 107000 + i * 700, 220, 260), r = repeat(m, 220, 260);
    if (r.n > 30) { lit++; assert.ok(r.rep < 0.12, `sun ${i} wind ${j}: ${(r.rep * 100).toFixed(1)} % of the glints repeat ${r.n} px - in rows`); }
    assert.ok(r.n < 220 * 260 * 0.03, `sun ${i} wind ${j}: a sparkle, not a sheet (${r.n} px)`);
  }
  assert.ok(lit >= 2, 'the sun still catches the water');
});
