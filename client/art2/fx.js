// Art v2 effects, modelled on the FX1-A / FX1-B concept sheets (docs/art-v2/targets): muzzle flashes,
// tracers, bullet impacts, the big explosion (fireball that cools into a rising, drifting smoke column
// with embers, FX1-B), fire, smoke, exhaust, skid marks, water, dust, glass, leaves, sparkles, blood.
// Same house style as the sprites: 4-7 step ramps, ordered (Bayer) dither between steps and for
// dissolving, round puffs lit from the upper left, a dark warm outline (never black) on solid stuff.
//
// Every maker is deterministic from its seed and returns an array of frames; each frame is a GBuf with
// .ax/.ay (the anchor: muzzle point, bullet head, ground contact, decal centre). Glowing pixels (flash,
// fire, sparks, tracers, embers, glints) carry emissive colour + strength so the Lighter blooms them;
// smoke, dust, debris, blood, glass, leaves are plain albedo. No effect pixel casts a shadow (F_NOCAST);
// standing effects get a z height (height above their anchor's ground point), decals are F_GROUND, z 0.
// Frames that light their surroundings carry .light = { x, y (offsets from the anchor), z, r, k, col }.
//
//   fxFrames(name)   memoised frames of a named effect from FX (built once, then shared)
//   memo(fn, ...a)   memoised frames of any maker + arguments
//   new FxPool(n)    fixed pool of n effect slots: spawn(name, x, y, variant) / update(dt) / forEach(fn)
// The p* entries are single pooled particles (smoke, steam, flame, spark, drops, paper, leaves; each set
// ordered by age) and the d* entries ground decals for the live game (scorch, blood pool, oil, litter, skid
// dabs); wakeBoat / wakeSmall are looping boat wakes (wakeFrames(L, W, heading) for any hull).
import { GBuf, F_GROUND, F_NOCAST, F_WATER, mulberry32, hash, bayer, step, vnoise, norm } from './gbuf.js';

// ---- ramps (dark -> light) ---------------------------------------------------------------------------
const FIRE = [[84, 16, 26], [150, 32, 26], [206, 64, 26], [240, 118, 34], [252, 172, 56], [255, 222, 120], [255, 248, 214]];
const SPARK = [[176, 70, 24], [236, 132, 40], [255, 200, 84], [255, 236, 160], [255, 252, 232]];
const SPARKB = [[70, 96, 170], [120, 158, 226], [178, 210, 250], [226, 240, 255], [255, 255, 255]];
const TRACE_O = [[110, 34, 22], [196, 76, 26], [246, 140, 44], [255, 206, 112], [255, 246, 214]];
const TRACE_W = [[56, 70, 124], [112, 140, 204], [172, 200, 246], [224, 236, 255], [255, 255, 255]];
const SMOKE_D = [[28, 25, 33], [42, 38, 47], [58, 54, 63], [76, 72, 81], [98, 94, 104]];
const SMOKE_L = [[92, 92, 108], [126, 125, 139], [160, 158, 170], [192, 190, 200], [222, 220, 228]];
const DUST = [[92, 66, 48], [128, 94, 66], [166, 128, 90], [198, 162, 118], [224, 194, 150]];
const PEBBLE = [[56, 52, 60], [86, 82, 88], [120, 116, 120], [150, 146, 146]];
const DEBRIS = [[30, 26, 30], [52, 44, 46], [78, 68, 66]];
const SCORCH = [[20, 18, 22], [30, 27, 31], [40, 36, 40], [52, 47, 50]];
const RUBBER = [[20, 20, 26], [30, 30, 37], [42, 42, 50]];
const WATER = [[44, 96, 150], [74, 142, 204], [124, 190, 238], [184, 226, 252], [236, 250, 255]];
const GLASS = [[48, 86, 138], [84, 140, 196], [132, 190, 230], [190, 228, 248], [240, 250, 255]];
const GOLD = [[140, 74, 18], [206, 134, 36], [246, 194, 74], [255, 232, 150], [255, 252, 228]];
const BLOOD = [[46, 8, 14], [74, 12, 18], [104, 18, 24], [134, 26, 30], [164, 46, 46], [188, 84, 78]];
const LEAF_G = [[38, 62, 30], [64, 98, 34], [100, 138, 42], [146, 178, 62], [190, 210, 98]];
const LEAF_O = [[100, 42, 20], [158, 74, 26], [204, 116, 36], [234, 164, 64], [250, 206, 120]];
const PETAL = [[160, 64, 104], [206, 104, 146], [236, 152, 184], [250, 200, 220], [255, 234, 242]];

const LX = -0.55, LY = -0.62, LZ = 0.56;               // light from the upper left, toward the viewer
const NUP = norm([0, 0.35, 0.94]);
const TAU = Math.PI * 2;
const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// ordered-dither fade: true when this pixel is dropped at level k (0 none .. 1 all) - soft edges, rims
const dith = (x, y, k) => k > 0 && bayer(x, y) + 0.5 < k;
// clumpy dissolve for clouds breaking up: chunky noise first, the dither only nibbles the clump edges
const gone = (x, y, k, s = 0) => k > 0 && vnoise(x, y, 2.3, 77 + s) * 0.72 + (bayer(x, y) + 0.5) * 0.28 < k;

// ---- painter ---------------------------------------------------------------------------------------
// stand: z = height above the anchor's ground row (smoke, sparks); otherwise z is the constant z0
// (a muzzle flash at gun height, a decal on the ground).
function frame(w, h, ax, ay, z0 = 0, stand = true) {
  const G = new GBuf(w, h);
  G.ax = ax; G.ay = ay; G.z0 = z0; G.stand = stand; G.ol = new Uint8Array(w * h);
  return G;
}
// one effect pixel: colour c, glow strength e (0 = not emissive), ol = gets the dark outline
function dot(G, x, y, c, e = 0, ol = 1, flag = 0, n = NUP, a = 255) {
  x = Math.floor(x); y = Math.floor(y);
  if (!G.inside(x, y)) return;
  const z = flag & F_GROUND ? 0 : G.z0 + (G.stand ? Math.max(1, G.ay - y) : 0);
  G.put(x, y, c, n, z, e ? [c[0], c[1], c[2], e] : null, flag | F_NOCAST, a);
  G.ol[y * G.w + x] = ol;
}
// add the dark, warm, hue-tinted outline round every pixel marked ol, then drop the scratch map
function finish(G) {
  const { w, h, col, ol } = G, add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (col[i * 4 + 3]) continue;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = yy * w + xx;
      if (ol[k] && col[k * 4 + 3] === 255 && !(G.flag[k] & F_GROUND)) { add.push(i, k); break; }
    }
  }
  for (let j = 0; j < add.length; j += 2) {
    const d = add[j], s = add[j + 1], dj = d * 4, sj = s * 4;
    col[dj] = col[sj] * 0.3 + 18; col[dj + 1] = col[sj + 1] * 0.2 + 9; col[dj + 2] = col[sj + 2] * 0.28 + 20; col[dj + 3] = 255;
    for (let c = 0; c < 4; c++) G.nrm[dj + c] = G.nrm[sj + c];
    G.emi[dj + 3] = 0; G.z[d] = G.z[s]; G.flag[d] = G.flag[s];
  }
  G.ol = null;
  return G;
}
// a round puff lit from the upper left. paint(x, y, lit, u, v, w) -> [colour, glow] or null (skip)
// lump > 0 bites a few soft bumps out of the rim (cauliflower smoke) - ph picks where
function puff(G, cx, cy, r, paint, ol = 1, lump = 0, ph = 0) {
  if (r < 0.8) return;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cy) / r, q = u * u + v * v;
    if (q > 1) continue;
    if (lump && Math.sqrt(q) > 1 - lump * (0.5 + 0.5 * Math.sin(Math.atan2(v, u) * 5 + ph)) ** 2) continue;
    const w = Math.sqrt(1 - q), lit = u * LX + v * LY + w * LZ;
    const p = paint(x, y, lit, u, v, w);
    if (p) dot(G, x, y, p[0], p[1] || 0, ol, 0, norm([u * 0.85, v * 0.6 + 0.15, w + 0.35]));
  }
}
// a line of pixels; fn(t 0..1 from start to end, x, y) -> [colour, glow] or null
function line(G, x0, y0, x1, y1, fn, ol = 0, flag = 0) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = Math.floor(lerp(x0, x1, t)), y = Math.floor(lerp(y0, y1, t));
    const p = fn(t, x, y);
    if (p) dot(G, x, y, p[0], p[1] || 0, ol, flag);
  }
}
// filled ellipse on the ground (decals, flashes); fn(d 0 centre..1 rim, x, y) -> [colour, glow, alpha] or null
function groundEllipse(G, cx, cy, rx, ry, fn, extra = 0) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, d = Math.sqrt(u * u + v * v);
    if (d > 1) continue;
    const p = fn(d, x, y, u, v);
    if (p) dot(G, x, y, p[0], p[1] || 0, 0, F_GROUND | extra, NUP, p[2] ?? 255);
  }
}
// ballistic particle at time t: start (x, h), velocity (vx, vh), gravity g; lands and stays at h = 0
function fly(p, t, g) {
  let h = p.h + p.vh * t - 0.5 * g * t * t, x = p.x + p.vx * t, landed = false;
  if (h <= 0) {
    // solve for the landing time and stop there
    const a = 0.5 * g, b = -p.vh, c = -p.h, tl = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
    x = p.x + p.vx * tl; h = 0; landed = true;
  }
  return [x, h, landed];
}

// ---- muzzle flash ----------------------------------------------------------------------------------
// size 0 pistol (~12 px), 1 SMG/revolver (~20 px), 2 shotgun/rifle (~30 px). Points along ang (0 = +x);
// anchor = the muzzle. 5 frames: full star, fuller, breaking up, embers + smoke wisp, last wisps.
export function muzzleFlash(size = 0, seed = 1, ang = 0) {
  const L = [14, 21, 30][size], Wd = [9, 12, 17][size], n = 5, rnd = mulberry32(seed * 7919 + size * 31 + 5);
  const square = ang !== 0;
  const w = square ? 2 * L + 12 : L + 10, h = square ? 2 * L + 12 : Wd + 10;
  const ax = square ? L + 6 : 1, ay = square ? L + 6 : h >> 1;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // a star of sharp spikes round a hot core: long ones forward, short ones to the sides and back
  const spikes = [{ a: 0, l: 1, b: 1 + size * 0.25 }];
  for (let i = 0; i < 4 + size * 3; i++) { const a = (rnd() - 0.5) * 1.1; spikes.push({ a, l: 0.6 + rnd() * 0.35 - Math.abs(a) * 0.3, b: 0.7 + rnd() * 0.5 }); }
  for (const sg of [-1, 1]) {
    spikes.push({ a: sg * (0.75 + rnd() * 0.35), l: 0.42 + rnd() * 0.15, b: 0.7 });
    spikes.push({ a: sg * (1.45 + rnd() * 0.3), l: 0.3 + rnd() * 0.12, b: 0.6 });
    spikes.push({ a: sg * (2.35 + rnd() * 0.35), l: 0.17 + rnd() * 0.06, b: 0.5 });
  }
  const embers = [];
  for (let i = 0; i < 5 + size * 4; i++) { const a = (rnd() - 0.5) * 1.6; embers.push({ a, s: (0.55 + rnd() * 0.6) * L, k: rnd() }); }
  const wisps = [];
  for (let i = 0; i < 2 + size * 2; i++) wisps.push({ x: L * (0.25 + rnd() * 0.45), y: (rnd() - 0.5) * Wd * 0.4, r: 1.4 + rnd() * (1 + size * 0.8) });
  const S = [0.85, 1, 0.8, 0.55, 0.32], HEAT = [1.1, 1.0, 0.78, 0.58, 0.4], BREAK = [0, 0.08, 0.3, 0.52, 0.75];
  const out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay, 16, false), C = L * (0.22 + size * 0.04) * S[f] + 1;
    // local coordinates: p along the barrel, q across
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gx = x + 0.5 - ax, gy = y + 0.5 - (ay + 0.5);
      const bx = gx * ca + gy * sa, px = bx - C, py = -gx * sa + gy * ca;
      let best = -1;
      const ce = 1 - (px / (L * 0.12 * S[f] + 0.9)) ** 2 - (py / (Wd * 0.15 * S[f] + 0.8)) ** 2;
      if (ce > 0) best = 0.9 + ce * 0.3;
      // the bigger guns push a cone of flame out of the barrel
      if (size > 0) { const cl0 = L * 0.78 * S[f], cq = 0.6 + bx * (0.2 + size * 0.07); if (bx > 0 && bx < cl0 && Math.abs(py) < cq * (1 - (bx / cl0) ** 2 * 0.6)) best = Math.max(best, 0.82 - bx / cl0 * 0.55 - Math.abs(py) / cq * 0.25); }
      for (const sp of spikes) {
        const ux = Math.cos(sp.a), uy = Math.sin(sp.a), p = px * ux + py * uy, q = Math.abs(-px * uy + py * ux);
        const len = sp.l * L * S[f] * 0.8;
        if (p < 0 || p > len) continue;
        const half = sp.b * (1.1 + Wd * 0.07) * (1 - p / len) * S[f] + 0.3;
        if (q > half) continue;
        best = Math.max(best, (1 - p / len) * 0.82 + (1 - q / half) * 0.12);
      }
      if (best < 0) continue;
      if (BREAK[f] && vnoise(x, y, 2.2, seed + f * 13) * 0.9 + best * 0.35 < BREAK[f] * (size ? 0.95 : 0.75)) continue;
      const hv = cl(best * HEAT[f]);
      dot(G, x, y, step(FIRE, cl(hv * 0.82 + 0.2), x, y, 0.7), 110 + hv * hv * 145, 0);
    }
    // embers flying on
    if (f >= 1) for (const e of embers) {
      if (e.k < (f - 1) * 0.2) continue;
      const d = e.s * (0.45 + f * 0.22) + C, ex = Math.cos(e.a) * d, ey = Math.sin(e.a) * d * 0.8;
      const x = ax + ex * ca - ey * sa, y = ay + ex * sa + ey * ca, c = step(SPARK, cl(1 - f * 0.2 + e.k * 0.2), x | 0, y | 0);
      dot(G, x, y, c, 230 - f * 30, 0);
      if (size === 2 && f < 3) dot(G, x - ca, y - sa, step(SPARK, 0.3, 0, 0), 160, 0);
    }
    // a little gun smoke
    if (f >= 3) for (const s of wisps) {
      const k = f - 3, cx = ax + (s.x + k * 2) * ca - (s.y - k) * sa, cy = ay + (s.x + k * 2) * sa + (s.y - k) * ca;
      puff(G, cx, cy, s.r * (1 + k * 0.35), (x, y, lit) => gone(x, y, 0.35 + k * 0.3) ? null : [step(SMOKE_L, cl(0.3 + lit * 0.35), x, y)], 0);
    }
    G.light = { x: (C + L * 0.2) * ca, y: (C + L * 0.2) * sa, z: 16, r: [46, 70, 100][size] * HEAT[f], k: 1.5 * HEAT[f] * HEAT[f], col: [1, 0.66, 0.32] };
    out.push(finish(G));
  }
  return out;
}

// ---- tracer ----------------------------------------------------------------------------------------
// A bullet streak along ang (0 = +x), anchor = the bullet head. 6 frames: full hot streak, then it
// shortens, dims and breaks into dashes.
export function tracer(kind = 'orange', seed = 1, ang = 0) {
  const R = kind === 'white' ? TRACE_W : TRACE_O, n = 6, LEN = [30, 28, 24, 19, 13, 7], BR = [1, 0.92, 0.8, 0.66, 0.5, 0.36];
  const square = ang !== 0, Lm = 32;
  const w = square ? 2 * Lm + 6 : Lm + 4, h = square ? 2 * Lm + 6 : 5, ax = square ? Lm + 3 : w - 2, ay = square ? Lm + 3 : 2;
  const ca = Math.cos(ang), sa = Math.sin(ang), out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay, 16, false), len = LEN[f], back = f * 1.2;
    for (let i = 0; i <= len * 1.4; i++) {
      const d = i / 1.4, t = d / len;
      if (f >= 2 && ((d + seed * 3 + f * 2) % (11 - f)) < f - 1.2) continue; // dashes
      const v = Math.pow(cl(1 - t), 0.75) * BR[f], x = ax - (d + back) * ca, y = ay - (d + back) * sa;
      const c = step(R, cl(v), Math.floor(x), Math.floor(y), 0.8);
      dot(G, x, y, c, 120 + v * 135, 0);
      // a 3 px thick hot core near the head on the first frames
      if (f < 3 && t < 0.35) { const k = cl(v * 0.55); dot(G, x + sa, y - ca, step(R, k, 0, 0), 120, 0); if (f === 0 && t < 0.15) dot(G, x - sa, y + ca, step(R, k, 0, 0), 120, 0); }
    }
    if (f < 2) dot(G, ax - back * ca, ay - back * sa, R[R.length - 1], 255, 0);
    out.push(finish(G));
  }
  return out;
}

// ---- impacts ---------------------------------------------------------------------------------------
// A ground-contact burst: a splayed fan of rays shooting up out of the hit point, flying sparks that
// fall back, pebbles and a scorch mark. Shared by impactSpark (metal) and impactGlass.
function impactBurst(seed, R, glass) {
  const n = 6, w = 34, h = 30, ax = 17, ay = 25, rnd = mulberry32(seed * 104729 + (glass ? 7 : 3));
  const rays = [];
  for (let i = 0; i < (glass ? 9 : 10); i++) {
    const side = i % 2 ? 1 : -1, a = -Math.PI / 2 + side * (rnd() * (i < 3 ? 0.45 : 1.25)) + (i === 0 ? 0 : 0);
    rays.push({ a, l: (i < 4 ? 11 : 6) + rnd() * 8 * (1 - Math.abs(a + Math.PI / 2) * 0.3) });
  }
  rays.push({ a: Math.PI - 0.15, l: 4 }, { a: 0.15, l: 4 });
  const sparks = [];
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, s = 24 + rnd() * 26; sparks.push({ x: 0, h: 2, vx: Math.cos(a) * s, vh: -Math.sin(a) * s, k: rnd() }); }
  const peb = [];
  for (let i = 0; i < 3; i++) peb.push({ x: (rnd() - 0.5) * 18, y: (rnd() - 0.3) * 4, r: 1 + rnd() * 1.2 });
  const shards = [];
  if (glass) for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, s = 18 + rnd() * 20; shards.push({ x: 0, h: 3, vx: Math.cos(a) * s, vh: -Math.sin(a) * s, k: rnd() }); }
  const RL = [0.7, 1, 0.8, 0.55, 0.32, 0.12], RB = [1, 1, 0.82, 0.66, 0.5, 0.34], out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay), cy = ay - 1;
    // scorch / chip mark and pebbles
    groundEllipse(G, ax, ay + 0.5, 6 + f * 0.3, 2.2, (d, x, y) => d > 0.7 && dith(x, y, 0.5) ? null : [step(SCORCH, d * 0.8, x, y), 0, 230]);
    for (const p of peb) puff(G, ax + p.x * (0.6 + f * 0.08), ay + p.y - p.r * 0.6, p.r, (x, y, lit) => [step(PEBBLE, cl(0.45 + lit * 0.5), x, y)]);
    // ground glow under the hit
    if (f < 3) groundEllipse(G, ax, ay + 0.5, 7 - f * 2, 2, (d, x, y) => dith(x, y, d * 0.8 + f * 0.2) ? null : [step(R, cl(0.6 - d * 0.5 - f * 0.15), x, y), 200 - f * 50]);
    // rays
    for (const r of rays) {
      const L = r.l * RL[f];
      if (L < 1) continue;
      const x1 = ax + Math.cos(r.a) * L, y1 = cy + Math.sin(r.a) * L * 0.95;
      line(G, ax, cy, x1, y1, (t, x, y) => {
        if (f >= 3 && t < (f - 2) * 0.22) return null;                 // rays detach from the hit point
        if (glass && f >= 2 && dith(x, y, 0.2)) return null;
        const v = cl((1.05 - t * 0.8) * RB[f]);
        return [step(R, v, x, y, 0), 70 + v * v * 185];
      });
      if (f < 2) dot(G, x1, y1, R[R.length - 2], 200, 0);
    }
    // core star
    if (f < 3) {
      const s = 2 - f;
      for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) if (Math.abs(dx) + Math.abs(dy) <= s) dot(G, ax + dx, cy + dy, R[cl(R.length - 1 - Math.abs(dx) - Math.abs(dy), 0, 9)], 255, 0);
    }
    // sparks: short streaks that arc out and fall
    if (f >= 1) for (const s of sparks) {
      if (s.k < (f - 3) * 0.3) continue;
      const t = f * 0.075, [x, hh, landed] = fly(s, t, 260), [xp, hp] = fly(s, t - 0.03, 260);
      if (landed && f > 3) continue;
      const v = cl(1 - f * 0.16 + s.k * 0.2);
      line(G, ax + xp, ay - hp, ax + x, ay - hh, (tt, px, py) => [step(R, cl(v * (0.5 + tt * 0.5)), px, py), 120 + 135 * v * tt]);
    }
    // glass: little shards tumbling out
    if (glass && f >= 1) for (const s of shards) {
      const [x, hh] = fly(s, f * 0.08, 240), px = ax + x, py = ay - hh;
      dot(G, px, py, GLASS[3], 0, 1); dot(G, px + 1, py, GLASS[2], 0, 1);
      if (s.k > 0.5) dot(G, px, py - 1, GLASS[4], f < 3 ? 160 : 0, 1);
    }
    if (f < 3) G.light = { x: 0, y: 0, z: 4, r: 40 - f * 10, k: 1.1 - f * 0.3, col: glass ? [0.7, 0.85, 1] : [1, 0.75, 0.4] };
    out.push(finish(G));
  }
  return out;
}
export const impactSpark = (seed = 1) => impactBurst(seed, SPARK, false);
export const impactGlass = (seed = 1) => impactBurst(seed, SPARKB, true);

// tan dust puff with pebbles thrown up and falling back (a bullet hitting dirt, sand or a wall)
export function impactDirt(seed = 1) {
  const n = 6, w = 36, h = 34, ax = 18, ay = 30, rnd = mulberry32(seed * 6151 + 11), out = [];
  const puffs = [];
  for (let i = 0; i < 11; i++) { const x = (rnd() - 0.5) * 15; puffs.push({ x, h: 1 + rnd() * 9 * (1 - Math.abs(x) / 9), r: 3 + rnd() * 2.4, vx: x * 0.12 + (rnd() - 0.5), vh: 0.8 + rnd() * 1.6, k: rnd() }); }
  const peb = [];
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, s = 22 + rnd() * 26; peb.push({ x: 0, h: 1, vx: Math.cos(a) * s, vh: -Math.sin(a) * s, big: rnd() < 0.35, k: rnd() }); }
  const RS = [0.45, 0.85, 1.05, 1.1, 1.05, 0.9], DIS = [0, 0, 0.08, 0.25, 0.45, 0.65];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    groundEllipse(G, ax, ay + 0.5, 6 + f * 0.6, 2, (d, x, y) => dith(x, y, d * 0.7 + f * 0.08) ? null : [step(DUST, 0.15 + d * 0.2, x, y), 0, 210]);
    const sorted = puffs.slice().sort((a, b) => a.h - b.h).reverse();
    for (const p of sorted) {
      if (p.k < DIS[f] * 0.6) continue;
      const r = p.r * RS[f] * (0.8 + p.k * 0.3), hh = p.h * (0.5 + f * 0.25) + p.vh * f;
      puff(G, ax + p.x * (0.6 + f * 0.2) + p.vx * f, ay - hh - r * 0.6, r, (x, y, lit) => gone(x, y, DIS[f]) ? null : [step(DUST, cl(0.5 + lit * 0.45 - f * 0.03), x, y, 0.6)]);
    }
    for (const p of peb) {
      const t = f * 0.075 + 0.02, [x, hh, landed] = fly(p, t, 280);
      if (landed && p.k < 0.5) continue;
      const px = ax + x, py = ay - hh;
      dot(G, px, py, step(p.k < 0.5 ? PEBBLE : DUST, 0.3, 0, 0), 0, 1);
      if (p.big) { dot(G, px + 1, py, step(PEBBLE, 0.6, 0, 0), 0, 1); dot(G, px, py - 1, step(PEBBLE, 0.9, 0, 0), 0, 1); }
    }
    out.push(finish(G));
  }
  return out;
}

// ---- explosion -------------------------------------------------------------------------------------
// FX1-B: a white-yellow core swells into a cauliflower fireball of lit puffs; the puffs cool from the
// top and the outside into dark smoke with glowing cracks and a hot underside, and the column rises up
// off the ground, drifts right and thins out. Debris specks and embers fly; the ground flashes, then a
// scorch mark stays. ~110 px wide at its biggest, the smoke column ~125 px tall. Anchor: ground centre.
export function explosion(seed = 1) {
  const n = 10, w = 132, h = 156, ax = 58, ay = 144, rnd = mulberry32(seed * 15485863 + 1);
  const E = [0.28, 0.58, 0.8, 0.92, 1, 1.04, 1.06, 1.08, 1.1, 1.1];
  const RS = [0.55, 0.88, 1.05, 1.14, 1.18, 1.18, 1.14, 1.08, 0.98, 0.86];
  const HF = [5, 18, 30, 38, 42, 44, 46, 47, 48, 48];
  const RISE = [0, 0, 2, 6, 14, 25, 37, 49, 60, 70];
  const HEAT = [1.4, 1.3, 1.1, 0.82, 0.58, 0.42, 0.3, 0.2, 0.12, 0.06];
  const DRIFT = [0, 0, 0, 1, 2, 4, 7, 10, 14, 18];
  const DIE = [0, 0, 0, 0, 0, 0, 0.05, 0.14, 0.26, 0.4];
  const puffs = [];
  for (let i = 0; i < 46; i++) {
    const core = i < 6;
    const bx = core ? (rnd() - 0.5) * 0.5 : (rnd() + rnd() + rnd() - 1.5) / 1.5 * 1.05;
    const bh = core ? rnd() * 0.25 : rnd();
    puffs.push({ bx, bh, r: (core ? 10 : 7) + rnd() * 5.5 - bh * 1.5, rise: 0.2 + bh * 0.8 * (0.85 + rnd() * 0.2), dep: (rnd() - 0.5) * 10,
      heat: 1 + (core ? 0.25 : 0) - Math.abs(bx) * 0.22 + rnd() * 0.12, die: rnd() * (1 - bh * 0.4), crack: rnd() * 100 });
  }
  const debris = [], embers = [];
  for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6, s = 70 + rnd() * 90; debris.push({ x: (rnd() - 0.5) * 8, h: 6, vx: Math.cos(a) * s, vh: -Math.sin(a) * s * 0.9, big: rnd() < 0.4 }); }
  for (let i = 0; i < 20; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2, s = 50 + rnd() * 80; embers.push({ x: (rnd() - 0.5) * 10, h: 10 + rnd() * 20, vx: Math.cos(a) * s, vh: -Math.sin(a) * s, k: rnd() }); }
  const out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    // ground: flash, then scorch with a few embers
    if (f >= 1) {
      const rx = 22 + Math.min(f, 4) * 3.5, ry = 6 + Math.min(f, 4) * 0.8;
      groundEllipse(G, ax + 2, ay + 0.5, rx, ry, (d, x, y) => {
        const nz = vnoise(x, y, 3, seed + 9) * 0.4;
        if (d + nz * 0.5 > 0.95 || (d > 0.6 && dith(x, y, (d - 0.6) * 2.2 + nz))) return null;
        if (f >= 2 && f <= 6 && hash(x, y, seed) < 0.035 * (7 - f) / 5) return [step(FIRE, 0.45, x, y), 180];
        return [step(SCORCH, cl(d * 0.75 + nz - 0.1), x, y), 0, 235];
      });
    }
    if (f < 3) {
      const rx = [30, 44, 50][f], ry = [5, 7, 7][f];
      groundEllipse(G, ax, ay + 0.5, rx, ry, (d, x, y) => dith(x, y, d * 0.9 + f * 0.18) ? null : [step(FIRE, cl(1 - d * 0.8 - f * 0.25), x, y), 230 - f * 50]);
    }
    // debris specks (behind the cloud, so only the ones flung clear show)
    if (f >= 1) for (const d of debris) {
      const [x, hh] = fly(d, f * 0.085, 330), px = ax + x, py = ay - hh;
      dot(G, px, py, DEBRIS[1], 0, 0);
      if (d.big) { dot(G, px + 1, py, DEBRIS[0], 0, 0); dot(G, px, py - 1, DEBRIS[2], 0, 0); }
    }
    // puffs, back (higher on screen) first
    const list = [];
    for (const p of puffs) {
      if (p.die < DIE[f]) continue;
      const hh = HF[f] * p.bh * (1 - Math.abs(p.bx) * 0.25) + RISE[f] * p.rise;
      const r = p.r * RS[f] * (1 + 0.3 * p.rise * RISE[f] / 70);
      const x = p.bx * 46 * E[f] * (1 - 0.3 * p.bh * cl(RISE[f] / 40)) + DRIFT[f] * cl(hh / 90, 0, 1.4);
      const cy = ay - hh - r * 0.72 + p.dep * 0.35;
      const heat = p.heat * HEAT[f] - p.bh * 0.32 * cl((f - 1) / 3) - (hh > 70 ? 0.15 : 0);
      list.push({ p, x: ax + x, cy, r, heat });
    }
    list.sort((a, b) => a.cy + a.r - (b.cy + b.r));
    const dis = f >= 8 ? (f - 7) * 0.18 : 0;
    for (const q of list) {
      const { p, heat } = q;
      puff(G, q.x, q.cy, q.r, (x, y, lit, u, v, w) => {
        if (dis && gone(x, y, dis * (1.2 - w))) return null;
        // fire: hottest where the puff faces us and the light; cools from the crown and the centre out
        const hot = heat + (1 - w) * 0.22 * cl((1.1 - heat) * 2) + v * 0.12 + lit * 0.08;
        if (hot + bayer(x, y) * 0.18 > 0.62) {
          // each puff keeps a darker red rim on its shadow side so the cauliflower reads
          if (w < 0.42 && lit < 0.05) return [step(FIRE, cl(0.18 + heat * 0.12), x, y, 0.6), 90];
          // white-yellow at the heart of the fireball, orange to red outward
          const core = cl(1 - Math.hypot(x - ax, (y - (ay - HF[f] * 0.45 - 10)) * 1.2) / (12 + 34 * E[f])) * cl((heat - 0.55) * 1.5);
          const t = cl(Math.min(heat, 1.3) * 0.26 + (lit * 0.5 + 0.5) * 0.48 + w * 0.12 - (1 - w) * 0.3 + core * 0.34);
          return [step(FIRE, t, x, y, 0.8), 50 + t * t * 160];
        }
        // smoke, with glowing cracks and an ember underside while it is still warm
        const cr = Math.abs(vnoise(x - q.x + p.crack, y - q.cy, 5.5, seed) - 0.5);
        if (heat > 0.04 && cr < 0.02 + heat * 0.045 && w > 0.3 && v > -0.35) {
          const k = cl(heat * 1.6 + 0.1);
          return [step(FIRE, cl(0.22 + k * 0.4), x, y, 0.5), 110 + k * 120];
        }
        if (heat > 0.16 && v > 0.5 && hot + bayer(x, y) * 0.3 > 0.52) return [step(FIRE, 0.28, x, y), 130];
        return [step(SMOKE_D, cl(0.45 + lit * 0.58 + (f >= 6 ? 0.05 : 0)), x, y, 0.6)];
      }, 1, heat < 0.6 ? 0.22 : 0.1, p.crack);
    }
    if (f >= 1 && f <= 7) for (const e of embers) {
      if (e.k < (f - 3) * 0.2) continue;
      const [x, hh, landed] = fly(e, f * 0.08, 180);
      if (landed) continue;
      dot(G, ax + x, ay - hh, step(SPARK, cl(1 - f * 0.11 + e.k * 0.2), 0, 0), 230 - f * 18, 0);
    }
    if (f < 7) G.light = { x: 0, y: 0, z: 30 + f * 4, r: [90, 150, 170, 160, 130, 100, 70][f], k: [1.3, 1.4, 1.2, 0.95, 0.7, 0.45, 0.25][f], col: [1, 0.58, 0.24] };
    out.push(finish(G));
  }
  return out;
}

// ---- fire (loop) -----------------------------------------------------------------------------------
// A burning patch: a body of flame with licking tongues, scrolling noise and a few rising embers.
// 5 frames that loop seamlessly. size 0 small (~20 px tall), 1 medium (~30), 2 large (~44).
export function fire(seed = 1, size = 1) {
  const n = 5, sc = [0.7, 1, 1.45][size], H = 25 * sc, W2 = 10.5 * sc;
  const w = Math.ceil(W2 * 2 + 10), h = Math.ceil(H * 1.25 + 8), ax = w >> 1, ay = h - 3;
  const rnd = mulberry32(seed * 3301 + size), tongues = [];
  for (let i = 0; i < 4; i++) tongues.push({ ox: (i - 1.5) * W2 * 0.42 + (rnd() - 0.5) * 2, th: (0.78 + rnd() * 0.25) * (i === 1 || i === 2 ? 1.1 : 0.8), p: rnd() * TAU, wd: (3 + rnd() * 1.4) * sc });
  const embers = [];
  for (let i = 0; i < 3 + size; i++) embers.push({ x: (rnd() - 0.5) * W2 * 1.3, p: rnd(), sw: rnd() * TAU });
  const D = H * 0.9;
  const loopNoise = (x, y, k) => {
    const a = vnoise(x, y + k * D, 3.2 * sc, seed), b = vnoise(x, y + (k - 1) * D, 3.2 * sc, seed);
    return ((a * (1 - k) + b * k) - 0.5) / Math.hypot(1 - k, k) + 0.5;
  };
  const out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay), k = f / n, ph = k * TAU;
    // glowing base on the ground
    groundEllipse(G, ax, ay + 0.5, W2 + 2, 2.2 * sc, (d, x, y) => dith(x, y, d * 0.9) ? null : [step(FIRE, cl(0.62 - d * 0.5), x, y), 210]);
    for (let y = 0; y < ay + 1; y++) for (let x = 0; x < w; x++) {
      const yy = (ay - y) / H;
      if (yy < 0 || yy > 1.25) continue;
      const dx = x + 0.5 - ax;
      const hw = W2 * Math.pow(Math.max(0, 1 - yy * 1.55), 0.55) * Math.min(1, 0.72 + yy * 2) * (0.9 + 0.1 * Math.sin(ph + yy * 4));
      const sway = Math.sin(yy * 3.2 - ph) * 1.3 * sc * yy;
      let I = hw > 0.6 ? 1 - Math.abs(dx - sway) / hw : -1;
      for (const t of tongues) {
        const th = t.th * (0.85 + 0.15 * Math.sin(ph + t.p));
        if (yy > th) continue;
        const tx = t.ox * (1 - yy * 0.5) + Math.sin(ph + t.p + yy * 3) * 1.4 * sc * yy;
        I = Math.max(I, (1 - Math.abs(dx - tx) / (t.wd * Math.pow(1 - yy / th, 0.38) * Math.min(1, 0.75 + yy * 1.5) + 0.3)) * 0.92);
      }
      I += (loopNoise(x, y, k) - 0.5) * (0.5 + yy * 0.6) - yy * 0.15;
      if (I <= 0.1 + yy * 0.22) continue;
      const t = cl(I * 0.7 + (1 - yy) * 0.4 - 0.1, 0.2);
      dot(G, x, y, step(FIRE, t, x, y, 0.8), 80 + t * t * 175, 1);
    }
    for (const e of embers) {
      const u = (k + e.p) % 1, ex = ax + e.x + Math.sin(e.sw + u * 6) * 1.5, ey = ay - H * (0.7 + u * 0.65);
      if (u < 0.85) dot(G, ex, ey, step(SPARK, 1 - u, 0, 0), 230 - u * 100, 0);
    }
    G.light = { x: 0, y: 0, z: H * 0.4, r: 70 * sc * (0.94 + 0.06 * Math.sin(ph * 2)), k: 1.4 * (0.9 + 0.1 * Math.sin(ph)), col: [1, 0.58, 0.24] };
    out.push(finish(G));
  }
  return out;
}

// ---- smoke puffs -----------------------------------------------------------------------------------
// A cluster that billows up, rises and drifts right, the puffs shrinking and parting until a few
// wisps are left. light: white-grey (steam, a tyre burnout); heavy: black with embers (a burning car).
function smoke(seed, heavy) {
  const n = 6, w = 56, h = 72, ax = 22, ay = 68, rnd = mulberry32(seed * 2909 + (heavy ? 17 : 3));
  const R = heavy ? SMOKE_D : SMOKE_L, puffs = [];
  // the body: a heap of big puffs; the tail: small puffs trailing down to the ground on the right
  for (let i = 0; i < 9; i++) {
    const a = rnd() * TAU, d = Math.sqrt(rnd());
    puffs.push({ x: Math.cos(a) * d * 11 - 2, h: 15 + Math.sin(a) * d * 9, r: 6.5 + rnd() * 3.5, vx: 0.8 + rnd() * 1.2, vh: 3 + rnd() * 2.5,
      die: 4 + rnd() * 2.6, ember: heavy && rnd() < 0.6, c: rnd() * 100 });
  }
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 5;
    puffs.push({ x: 4 + t * 12 + rnd() * 2, h: 7 - t * 6 + rnd() * 2, r: 4.6 - t * 2.4 + rnd(), vx: 1 + rnd(), vh: 2 + rnd() * 2, die: 2.2 + rnd() * 1.8 - t * 0.6, ember: false, c: rnd() * 100 });
  }
  const sparks = [];
  if (heavy) for (let i = 0; i < 5; i++) sparks.push({ x: (rnd() - 0.5) * 16, h: 6 + rnd() * 18, vx: rnd() * 2, vh: 4 + rnd() * 4 });
  const out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay), list = [];
    for (const p of puffs) {
      if (f >= p.die) continue;
      const life = cl((p.die - f) / 2.2, 0.2, 1);
      const r = p.r * (1 + f * 0.06) * life, hh = p.h + p.vh * f * (1 + f * 0.12), x = ax + p.x + p.vx * f * (1 + f * 0.1);
      list.push({ p, x, cy: ay - hh - r * 0.7, r, life });
    }
    list.sort((a, b) => a.cy + a.r - (b.cy + b.r));
    for (const q of list) {
      const heat = q.p.ember ? cl(1 - f * 0.2) : 0;
      puff(G, q.x, q.cy, q.r, (x, y, lit, u, v, w) => {
        if (q.life < 0.6 && gone(x, y, (0.6 - q.life) * 1.3 * (1.1 - w))) return null;
        if (heat > 0.1) {
          const cr = Math.abs(vnoise(x - q.x + q.p.c, y - q.cy, 3.6, seed) - 0.5);
          if (cr < 0.012 + heat * 0.028 && w > 0.35 && v > -0.4) return [step(FIRE, cl(0.22 + heat * 0.38), x, y, 0.5), 110 + heat * 120];
        }
        return [step(R, cl(0.45 + lit * 0.55 + (heavy ? 0 : 0.05)), x, y, 0.6)];
      }, 1, 0.2, q.p.c);
    }
    for (const s of sparks) {
      const x = ax + s.x + s.vx * f, y = ay - s.h - s.vh * f;
      if (f < 5) dot(G, x, y, step(SPARK, cl(0.8 - f * 0.15), 0, 0), 220 - f * 30, 0);
    }
    out.push(finish(G));
  }
  return out;
}
export const smokeLight = (seed = 1) => smoke(seed, false);
export const smokeHeavy = (seed = 1) => smoke(seed, true);

// ---- exhaust / dust trail --------------------------------------------------------------------------
// A low cloud pushed out from the anchor (the exhaust pipe, a skidding wheel), drifting +x along the
// ground and breaking up into dithered specks. kind 'grey' (exhaust) | 'dust' (tan, dirt roads).
export function exhaust(kind = 'grey', seed = 1) {
  const n = 6, w = 70, h = 34, ax = 4, ay = 30, R = kind === 'dust' ? DUST : SMOKE_L, rnd = mulberry32(seed * 4421 + (kind === 'dust' ? 1 : 0));
  const puffs = [];
  for (let i = 0; i < 11; i++) { const s = i / 10; puffs.push({ s, x: 3 + s * 26 + rnd() * 3, h: 1 + s * 5 + rnd() * 3, r: 3 + s * 4.5 + rnd() * 2, vx: 2.5 + s * 3.5 + rnd(), k: rnd() }); }
  const out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay), list = [];
    for (const p of puffs) {
      const dis = cl((f - 1.2) / 4.2 + p.s * 0.25 - 0.1 + p.k * 0.15);
      if (dis >= 0.98) continue;
      const r = p.r * (1 + f * 0.12) * (f === 0 ? 0.6 + p.s * 0.4 : 1), hh = p.h + f * 0.9 * (0.5 + p.s);
      list.push({ x: ax + p.x + p.vx * f, cy: ay - hh - r * 0.7, r, dis, p });
    }
    list.sort((a, b) => a.cy + a.r - (b.cy + b.r));
    for (const q of list) puff(G, q.x, q.cy, q.r, (x, y, lit, u, v, w) => {
      if (gone(x, y, q.dis * (1.25 - w * 0.5) + (hash(x, y, seed + f) - 0.5) * 0.3 * q.dis)) return null;
      return [step(R, cl(0.5 + lit * 0.42 - q.dis * 0.25), x, y)];
    }, q.dis < 0.3 ? 1 : 0);
    out.push(finish(G));
  }
  return out;
}

// ---- skid marks (static ground decals) ---------------------------------------------------------------
// 4 variants: 0 straight pair (braking), 1 curved pair (a slide), 2 S-curve (fishtail), 3 donut arc.
// Each track is a 4 px band of tread striations that fades in (dithered) where the tyre started to slip.
export function skidMarks(seed = 1) {
  const S = 56, out = [], rnd = mulberry32(seed * 911 + 4);
  // centre line (t 0 where the slide starts .. 1) and the offsets of its tracks (a pair = rear wheels)
  const paths = [
    { c: (t) => [0, 22 - t * 44], offs: [-6, 6] },
    { c: (t) => [-20 + t * 38, 20 - t * 36 + t * t * 18], offs: [-6, 6] },
    { c: (t) => [Math.sin(t * TAU * 0.9) * 9, 24 - t * 48], offs: [0] },
    { c: (t) => { const a = TAU * (0.1 + t * 0.75); return [Math.cos(a) * 17, Math.sin(a) * 15]; }, offs: [0] },
  ];
  for (const { c: P, offs } of paths) {
    const G = frame(S, S, S >> 1, S >> 1, 0, false), wob = rnd() * 10;
    for (const off of offs) {
      const steps = 500;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, [x2, y2] = P(Math.min(1, t + 0.01)), [x0, y0] = P(Math.max(0, t - 0.01));
        let dx = x2 - x0, dy = y2 - y0; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        const [cx, cy] = P(t), x = cx - dy * off, y = cy + dx * off;
        const I = cl(t * 2.4 + 0.08) * (0.88 + 0.12 * Math.sin(t * 20 + wob + off));
        for (let o = -1.5; o <= 1.5; o += 0.5) {
          const px = Math.floor(G.ax + x - dy * o), py = Math.floor(G.ay + y + dx * o);
          if (dith(px, py, 1 - I + (Math.abs(o) > 1 ? 0.2 : 0))) continue;
          const stripe = (Math.round((o + 1.5) * 2) % 3) === 0;
          dot(G, px, py, RUBBER[stripe ? 0 : Math.abs(o) > 1 ? 2 : 1], 0, 0, F_GROUND, NUP, stripe ? 235 : 205);
        }
      }
    }
    out.push(finish(G));
  }
  return out;
}

// ---- water -----------------------------------------------------------------------------------------
// Crown splash (something landing in water): a ring of spikes and flying drops, the crown falls, a
// rebound jet pops up, rings spread over the surface. Anchor = the water surface point.
export function waterSplash(seed = 1) {
  const n = 7, w = 44, h = 36, ax = 22, ay = 29, rnd = mulberry32(seed * 7717 + 2), out = [];
  const spikes = [];
  for (let i = 0; i < 11; i++) spikes.push({ a: (i / 11) * TAU + rnd() * 0.3, hl: 0.6 + rnd() * 0.5, lean: 0.25 + rnd() * 0.35 });
  const drops = [];
  for (let i = 0; i < 9; i++) { const a = rnd() * TAU; drops.push({ x: Math.cos(a) * 4, h: 4, vx: Math.cos(a) * (14 + rnd() * 16), vh: 34 + rnd() * 22, y: Math.sin(a) * 2 }); }
  const HS = [9, 15, 13, 8, 3, 0, 0], RC = [4, 6, 7, 8, 8, 8, 8], JET = [0, 0, 0, 0, 5, 9, 4];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    // rings on the surface
    for (const [r0, k] of [[5 + f * 2.6, 1], [2 + f * 1.8, 0.7]]) {
      if (f === 0 && k < 1) continue;
      const rx = r0, ry = r0 * 0.34, fade = f / (n - 1);
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * TAU, x = Math.floor(ax + Math.cos(a) * rx), y = Math.floor(ay + Math.sin(a) * ry);
        if (dith(x, y, fade * 0.85 + (k < 1 ? 0.15 : 0))) continue;
        dot(G, x, y, step(WATER, cl(0.85 - fade * 0.45 - (Math.sin(a) < 0 ? 0.2 : 0)), x, y), 0, 0, F_GROUND | F_WATER, NUP, 230);
      }
    }
    const crown = (front) => {
      if (HS[f] <= 0) return;
      for (const s of spikes) {
        if ((Math.sin(s.a) >= 0) !== front) continue;
        const bx = ax + Math.cos(s.a) * RC[f], by = ay + Math.sin(s.a) * RC[f] * 0.34, hh = HS[f] * s.hl;
        const tx = bx + Math.cos(s.a) * hh * s.lean, ty = by - hh;
        line(G, bx, by, tx, ty, (t, x, y) => [step(WATER, cl((front ? 0.55 : 0.3) + t * 0.45), x, y), t > 0.8 ? 70 : 0]);
        if (f < 3) line(G, bx + 1, by, tx + 0.5, ty + hh * 0.35, (t, x, y) => [step(WATER, front ? 0.45 : 0.25, x, y)]);
        if (f >= 1 && f < 4) dot(G, tx + Math.cos(s.a), ty - 2 - f, WATER[4], 80, 0);
      }
    };
    crown(false);
    // the low dome of disturbed water in the middle
    if (f < 5) groundEllipse(G, ax, ay, RC[f] + 0.5, RC[f] * 0.36 + 0.6, (d, x, y) => [step(WATER, cl(0.65 - d * 0.35), x, y), 0, 255], F_WATER);
    if (JET[f]) {
      line(G, ax, ay, ax, ay - JET[f], (t, x, y) => [step(WATER, cl(0.6 + t * 0.4), x, y), t > 0.7 ? 80 : 0]);
      dot(G, ax, ay - JET[f] - 2, WATER[4], 90, 0);
    }
    crown(true);
    for (const d of drops) {
      if (f === 0 || f > 4) continue;
      const [x, hh, landed] = fly(d, f * 0.07, 380);
      if (landed) continue;
      dot(G, ax + x, ay + d.y - hh, WATER[4], 80, 0); dot(G, ax + x, ay + d.y - hh + 1, WATER[2], 0, 0);
    }
    out.push(finish(G));
  }
  return out;
}

// A raindrop landing in a puddle: the falling streak, a tiny crown, then rings spreading and fading.
export function rainRipple(seed = 1) {
  const n = 6, w = 32, h = 22, ax = 16, ay = 15, out = [];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    const rings = f === 0 ? [] : [[2 + (f - 1) * 2.8, 0], [(f - 2) * 2.2, 0.2], [(f - 3) * 1.8, 0.35]];
    for (const [r, k] of rings) {
      if (r < 1.5) continue;
      const fade = (f - 1) / (n - 1) + k;
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * TAU, x = Math.floor(ax + Math.cos(a) * r), y = Math.floor(ay + Math.sin(a) * r * 0.36);
        if (dith(x, y, fade * 0.8)) continue;
        dot(G, x, y, step(WATER, cl(0.8 - fade * 0.4 - (Math.sin(a) < 0 ? 0.25 : 0)), x, y), 0, 0, F_GROUND | F_WATER, NUP, 220);
      }
    }
    if (f === 0) { line(G, ax, ay - 12, ax, ay - 6, (t, x, y) => [step(WATER, cl(0.5 + t * 0.5), x, y), t > 0.6 ? 90 : 0]); dot(G, ax, ay, WATER[3], 40, 0, F_GROUND | F_WATER); }
    if (f === 1 || f === 2) {
      const s = f === 1 ? 3 : 2;
      for (const dx of [-1, 0, 1]) line(G, ax + dx * 0.6, ay, ax + dx * (s - 0.5), ay - s - (dx ? 0 : 1), (t, x, y) => [step(WATER, cl(0.55 + t * 0.45), x, y), t > 0.6 ? 70 : 0]);
      if (f === 2) dot(G, ax, ay - 5, WATER[4], 80, 0);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- dust puff (footstep, landing, a dropped bag) -----------------------------------------------------
export function dustPuff(seed = 1) {
  const n = 6, w = 36, h = 20, ax = 18, ay = 16, rnd = mulberry32(seed * 3571 + 9), out = [];
  const puffs = [];
  for (let i = 0; i < 7; i++) { const s = i % 2 ? 1 : -1; puffs.push({ s, sp: (0.5 + rnd() * 0.8) * (i < 1 ? 0.2 : 1), r: 2.4 + rnd() * 1.6, h: rnd() * 2, vh: 0.4 + rnd() * 0.6, k: rnd() }); }
  const specks = [];
  for (let i = 0; i < 6; i++) specks.push({ x: (rnd() - 0.5) * 4, h: 1, vx: (rnd() - 0.5) * 40, vh: 12 + rnd() * 16 });
  const RS = [0.6, 0.95, 1.1, 1.1, 1, 0.85], DIS = [0, 0, 0.1, 0.3, 0.5, 0.7];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay), list = [];
    for (const p of puffs) {
      if (p.k < DIS[f] * 0.5) continue;
      const r = p.r * RS[f] * (1 + f * 0.08), x = ax + p.s * (1.5 + p.sp * (2 + f * 2.2)), hh = p.h + p.vh * f;
      list.push({ x, cy: ay - hh - r * 0.6, r });
    }
    list.sort((a, b) => a.cy + a.r - (b.cy + b.r));
    for (const q of list) puff(G, q.x, q.cy, q.r, (x, y, lit, u, v, w) => gone(x, y, DIS[f] * (1.3 - w * 0.6)) ? null : [step(DUST, cl(0.52 + lit * 0.42), x, y)], DIS[f] < 0.35 ? 1 : 0);
    if (f >= 1 && f < 5) for (const s of specks) { const [x, hh] = fly(s, f * 0.06, 300); dot(G, ax + x, ay - hh, DUST[1], 0, 0); }
    out.push(finish(G));
  }
  return out;
}

// ---- glass shatter ---------------------------------------------------------------------------------
// A pane breaking at ~18 px up (a car window, a shop window): the crack star, then shards that tumble
// out, fall and settle on the ground. Anchor = ground point under the break.
export function glassShatter(seed = 1) {
  const n = 7, w = 60, h = 54, ax = 30, ay = 44, H0 = 18, rnd = mulberry32(seed * 9973 + 6), out = [];
  const shards = [];
  for (let i = 0; i < 11; i++) {
    const a = rnd() * TAU, s = 22 + rnd() * 34, big = i < 5;
    const verts = [];
    for (let j = 0; j < 3; j++) { const va = (j / 3) * TAU + (rnd() - 0.5) * 1.2; verts.push([Math.cos(va) * (big ? 4.6 : 2.8) * (j === 0 ? 1.6 : 1), Math.sin(va) * (big ? 3.2 : 2)]); }
    shards.push({ dy: (rnd() - 0.45) * 14, x: Math.cos(a) * 3, h: H0 + Math.sin(a) * 3, vx: Math.cos(a) * s, vh: 6 + Math.sin(a) * s * 0.5 + rnd() * 14, rot: rnd() * TAU, spin: (rnd() - 0.5) * 3, flip: rnd() * TAU, fs: 1 + rnd() * 2, verts });
  }
  const cracks = [];
  for (let i = 0; i < 9; i++) cracks.push({ a: (i / 9) * TAU + rnd() * 0.4, l: 7 + rnd() * 8 });
  // rasterise one triangle shard; returns nothing, paints into G
  const tri = (G, cx, cy, s, ang, fl) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), k = Math.max(0.5, Math.abs(Math.cos(fl)));
    const P = s.verts.map(([vx, vy]) => [cx + vx * ca - vy * k * sa, cy + vx * sa + vy * k * ca]);
    const minx = Math.floor(Math.min(...P.map((p) => p[0]))), maxx = Math.ceil(Math.max(...P.map((p) => p[0])));
    const miny = Math.floor(Math.min(...P.map((p) => p[1]))), maxy = Math.ceil(Math.max(...P.map((p) => p[1])));
    const ins = (x, y) => {
      let s1 = 0, s2 = 0;
      for (let j = 0; j < 3; j++) { const [x0, y0] = P[j], [x1, y1] = P[(j + 1) % 3], c = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0); if (c >= 0) s1++; if (c <= 0) s2++; }
      return s1 === 3 || s2 === 3;
    };
    const tone = 0.42 + 0.3 * Math.cos(fl);
    let any = false;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      if (!ins(x + 0.5, y + 0.5)) continue;
      any = true;
      const edge = !ins(x + 0.5, y - 0.5) && hash(x, y, 5) < 0.65;
      dot(G, x, y, edge ? GLASS[4] : step(GLASS, tone, x, y), 0, 1);
    }
    if (!any) dot(G, cx, cy, GLASS[3], 0, 1);
  };
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    if (f === 0) {
      for (const c of cracks) line(G, ax, ay - H0, ax + Math.cos(c.a) * c.l, ay - H0 + Math.sin(c.a) * c.l * 0.9, (t, x, y) => [step(GLASS, cl(1 - t * 0.6), x, y), t < 0.3 ? 160 : 0]);
      for (let i = -2; i <= 2; i++) { dot(G, ax + i, ay - H0, GLASS[4], 230 - Math.abs(i) * 50, 0); dot(G, ax, ay - H0 + i, GLASS[4], 230 - Math.abs(i) * 50, 0); }
    } else {
      // shards on the ground first, then the ones in the air
      const t = (f - 0.4) * 0.085, list = [];
      for (const s of shards) { const [x, hh, landed] = fly(s, t, 300); list.push({ s, x, hh, landed, gy: ay + s.dy * cl(t * 5) }); }
      // painter's order: farther (higher ground row) first, airborne over grounded
      list.sort((a, b) => (a.hh > 0) - (b.hh > 0) || a.gy - b.gy);
      for (const q of list) {
        const ang = q.landed ? q.s.rot + q.s.spin * 0.2 : q.s.rot + q.s.spin * t * 4;
        tri(G, ax + q.x, q.gy - q.hh, q.s, ang, q.landed ? 0.9 + q.s.flip * 0.05 : q.s.flip + q.s.fs * f);
      }
      if (f < 3) for (const q of list.slice(-3)) dot(G, ax + q.x, q.gy - q.hh - 2, GLASS[4], 200 - f * 60, 0);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- leaves and petals -----------------------------------------------------------------------------
// A few leaves (green and autumn orange) or blossom petals drifting down and sideways, fluttering
// (they turn edge-on and flip as they fall), settling on the ground. 8 frames.
function drift(seed, petals) {
  const n = 8, w = 48, h = 48, ax = 20, ay = 44, rnd = mulberry32(seed * 6007 + (petals ? 3 : 1)), out = [];
  const items = [];
  for (let i = 0; i < (petals ? 7 : 5); i++) {
    items.push({ x: (rnd() - 0.5) * 30, h: 14 + rnd() * 24, fall: 2.4 + rnd() * 2, dx: 1 + rnd() * 1.6, sw: rnd() * TAU, rot: rnd() * TAU, spin: (rnd() - 0.5) * 1.4, fl: rnd() * TAU,
      len: petals ? 3 + rnd() * 1 : 4.4 + rnd() * 1.6, wid: petals ? 2 + rnd() * 0.5 : 2.3 + rnd() * 0.6, R: petals ? PETAL : rnd() < 0.55 ? LEAF_G : LEAF_O });
  }
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay);
    for (const it of items) {
      const hh = Math.max(0, it.h - it.fall * f), onGround = hh === 0;
      const tf = onGround ? it.h / it.fall : f;
      const cx = ax + it.x + it.dx * tf + Math.sin(it.sw + tf * 0.9) * 3, cy = ay - hh;
      const ang = it.rot + it.spin * tf, fk = onGround ? 0.9 : Math.cos(it.fl + tf * 1.1);
      const ca = Math.cos(ang), sa = Math.sin(ang), wd = it.wid * Math.max(0.35, Math.abs(fk)), L = it.len;
      const front = fk >= 0;
      for (let y = Math.floor(cy - L - 1); y <= Math.ceil(cy + L + 1); y++) for (let x = Math.floor(cx - L - 1); x <= Math.ceil(cx + L + 1); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
        const tt = lx / L;
        if (Math.abs(tt) > 1) continue;
        // leaf: pointed both ends; petal: round at the tip, narrow at the base
        const prof = petals ? Math.sqrt(Math.max(0, 1 - tt * tt)) * (0.55 + 0.45 * (tt + 1) / 2) * 1.25 : Math.pow(Math.max(0, 1 - tt * tt), 0.8);
        if (Math.abs(ly) > wd * prof + 0.15) continue;
        const rib = !petals && Math.abs(ly) < 0.45 && Math.abs(tt) < 0.85;
        const v = cl((front ? 0.62 : 0.36) - ly / (wd + 0.01) * 0.18 * (front ? 1 : -1) - (rib ? 0.22 : 0) + (petals ? (1 - Math.abs(tt)) * 0.15 : 0));
        dot(G, x, y, step(it.R, v, x, y, 0.7), 0, petals ? 0 : 1, onGround ? F_GROUND : 0);
      }
      if (!petals) { const sx = cx - ca * (L + 0.8), sy = cy - sa * (L + 0.8); dot(G, sx, sy, it.R[0], 0, 0, onGround ? F_GROUND : 0); }
    }
    out.push(finish(G));
  }
  return out;
}
export const leaves = (seed = 1) => drift(seed, false);
export const petals = (seed = 1) => drift(seed, true);

// ---- sparkle (pickup glint) ------------------------------------------------------------------------
// A four-point star that flares and fades, with two smaller twinkles out of phase. blue adds the halo
// ring of FX1-B. Anchor = centre (float it above the pickup).
function sparkleFx(seed, R, ring) {
  const n = 6, w = 24, h = 24, ax = 12, ay = 12, rnd = mulberry32(seed * 1237 + (ring ? 5 : 2)), out = [];
  const LEN = [2, 5, 8, 6, 3, 1], small = [];
  for (let i = 0; i < 2; i++) small.push({ x: Math.round((rnd() - 0.5) * 16), y: Math.round((rnd() - 0.5) * 16), ph: 2 + i * 2 });
  const star = (G, cx, cy, L, k) => {
    if (L <= 0) return;
    const core = L >= 4 ? 1 : 0;
    for (let d = -L; d <= L; d++) {
      const t = Math.abs(d) / (L + 1), c = step(R, cl(k * (1 - t * 0.9)), cx + d, cy, 0.4), e = 255 * k * (1 - t * 0.5);
      dot(G, cx + d, cy, c, e, 0); dot(G, cx, cy + d, c, e, 0);
    }
    if (core) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) dot(G, cx + dx, cy + dy, step(R, cl(k * 0.75), 0, 0), 200 * k, 0);
    if (L >= 6) for (const [dx, dy] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) dot(G, cx + dx, cy + dy, step(R, cl(k * 0.45), 0, 0), 150 * k, 0);
    dot(G, cx, cy, R[R.length - 1], 255, 0);
  };
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay, 6, true);
    star(G, ax, ay, LEN[f], f < 4 ? 1 : 0.75);
    for (const s of small) { const l = [0, 1, 2, 3, 2, 1, 0][Math.abs(f - s.ph + 3) % 7]; star(G, ax + s.x, ay + s.y, l > 2 ? 2 : l, 0.8); }
    if (ring && (f === 2 || f === 3)) {
      const r = f === 2 ? 5.5 : 7;
      for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, x = Math.floor(ax + Math.cos(a) * r + 0.5), y = Math.floor(ay + Math.sin(a) * r + 0.5); if (!dith(x, y, f === 3 ? 0.5 : 0)) dot(G, x, y, R[2], 170, 0); }
    }
    out.push(finish(G));
  }
  return out;
}
export const sparkle = (seed = 1) => sparkleFx(seed, GOLD, false);
export const sparkleBlue = (seed = 1) => sparkleFx(seed, SPARKB, true);

// ---- blood -----------------------------------------------------------------------------------------
// Ground splats (3 variants, big / medium / small): an irregular pool with radial streaks and droplets,
// a glossy highlight up-left. Deep, dark red - not cartoon bright. Static decals, anchor = centre.
export function bloodSplat(seed = 1) {
  const out = [];
  [[7.5, 9], [5.5, 7], [3.5, 5]].forEach(([r0, nSp], vi) => {
    const rnd = mulberry32(seed * 3463 + vi * 101), S = Math.ceil(r0 * 4.6), G = frame(S, Math.ceil(S * 0.8), S >> 1, Math.ceil(S * 0.8) >> 1, 0, false);
    const ph = rnd() * 10, cx = G.ax, cy = G.ay, sq = 0.62;
    const R = (a) => r0 * (0.82 + 0.4 * vnoise(Math.cos(a) * 3 + ph, Math.sin(a) * 3 + ph, 1.2, seed + vi));
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) / sq, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), rr = R(a);
      if (d > rr) continue;
      const hl = (dx / rr) * LX + (dy / rr) * LY;
      const v = cl(0.42 - (d / rr) * 0.3 + hl * 0.18 + (d < rr * 0.55 && hl > 0.32 ? 0.35 : 0));
      dot(G, x, y, step(BLOOD, v, x, y, 0.6), 0, 0, F_GROUND);
    }
    for (let i = 0; i < nSp; i++) {
      const a = rnd() * TAU, l = r0 * (1.15 + rnd() * 0.9), wd = 0.8 + rnd() * 0.9;
      // tapered streak out of the pool and a droplet at its end
      for (let s = r0 * 0.6; s < l; s += 0.4) {
        const t = (s - r0 * 0.6) / (l - r0 * 0.6), half = wd * (1 - t) + 0.2;
        for (let o = -half; o <= half; o += 0.5) dot(G, cx + Math.cos(a) * s - Math.sin(a) * o, cy + (Math.sin(a) * s + Math.cos(a) * o) * sq, step(BLOOD, 0.3 - t * 0.12, 0, 0), 0, 0, F_GROUND);
      }
      const dd = l + 1 + rnd() * r0 * 0.5, dr = 0.6 + rnd() * 0.9, dx = cx + Math.cos(a) * dd, dy = cy + Math.sin(a) * dd * sq;
      groundEllipse(G, dx, dy, dr + 0.3, dr * 0.8 + 0.2, (d, x, y) => [step(BLOOD, cl(0.35 - d * 0.2), x, y)]);
    }
    for (let i = 0; i < nSp + 2; i++) { const a = rnd() * TAU, dd = r0 * (1.6 + rnd() * 1.2); dot(G, cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * sq, BLOOD[1], 0, 0, F_GROUND); }
    out.push(finish(G));
  });
  return out;
}

// A spray burst from a hit (biased toward +x, the way the bullet went; anchor = the hit point, ~20 px
// up): a lumpy burst with spiky splatter, then droplets flying out and dropping. 4 frames.
export function bloodSpray(seed = 1) {
  const n = 4, w = 46, h = 38, ax = 16, ay = 18, rnd = mulberry32(seed * 8269 + 1), out = [];
  const drops = [];
  for (let i = 0; i < 20; i++) {
    const a = rnd() < 0.7 ? (rnd() - 0.5) * 1.8 : rnd() * TAU, s = 40 + rnd() * 80;
    drops.push({ vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, big: rnd() < 0.4, k: rnd() });
  }
  const spikes = [];
  for (let i = 0; i < 9; i++) spikes.push({ a: (i / 9) * TAU + rnd() * 0.5, l: 4 + rnd() * 5 });
  const BR = [3.6, 4.6, 3.2, 1.6], SL = [1, 1.25, 0.7, 0];
  for (let f = 0; f < n; f++) {
    const G = frame(w, h, ax, ay, 20, false), r = BR[f];
    // the burst: a lumpy blob with tapering splatter spikes
    for (const sp of spikes) {
      const L = r + sp.l * SL[f];
      if (SL[f] > 0) line(G, ax, ay, ax + Math.cos(sp.a) * L, ay + Math.sin(sp.a) * L * 0.8, (t, x, y) => f >= 2 && gone(x, y, 0.4 + t * 0.3) ? null : [step(BLOOD, cl(0.45 - t * 0.2), x, y)], 1);
    }
    puff(G, ax, ay, r, (x, y, lit, u, v, w) => {
      if (f >= 2 && gone(x, y, (f - 1) * 0.3 * (1.2 - w))) return null;
      return [step(BLOOD, cl(0.38 + lit * 0.32 + (lit > 0.55 ? 0.3 : 0)), x, y, 0.5)];
    });
    for (const d of drops) {
      if (d.k < (f - 2) * 0.4) continue;
      const t = (f + 0.6) * 0.05, x = ax + d.vx * t, y = ay + d.vy * t + 160 * t * t;
      dot(G, x, y, BLOOD[3], 0, 1); if (d.big) { dot(G, x + 1, y, BLOOD[2], 0, 1); dot(G, x, y + 1, BLOOD[1], 0, 1); }
      if (f < 2) dot(G, x - d.vx * 0.025, y - d.vy * 0.025, BLOOD[1], 0, 1);
    }
    out.push(finish(G));
  }
  return out;
}

// Bloody shoe prints, walking north: [left, right] fresh, [left, right] half worn, [left, right] faint.
// Rotate in the renderer if needed - prints are tiny and read fine at 4 headings by mirroring/flipping.
export function footprints() {
  const out = [];
  for (const k of [1, 0.6, 0.32]) for (const side of [-1, 1]) {
    const G = frame(8, 14, 4, 7, 0, false);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 8; x++) {
      const fx = x + 0.5 - 4 - side * 0.4 * ((13 - y) / 13), arch = side * (y > 5 && y < 9 ? 0.6 : 0);
      const fore = ((fx + arch * 0.5) / 2.6) ** 2 + ((y + 0.5 - 4.2) / 4.2) ** 2 <= 1;
      const heel = (fx / 2.2) ** 2 + ((y + 0.5 - 11) / 2.3) ** 2 <= 1;
      if (!fore && !heel) continue;
      if ((y % 2 === 1 && (fore ? y > 1 : y < 13)) && hash(x, y, 3) < 0.8) continue;           // tread bars
      if (dith(x, y, 1 - k + hash(x * 3, y * 7, 11) * 0.25 * (1 - k))) continue;
      dot(G, side > 0 ? x : 7 - x, y, step(BLOOD, cl(0.38 * k + 0.08), x, y), 0, 0, F_GROUND, NUP, 235);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- single particles (the live game's pooled particles) ---------------------------------------------
// One sprite per particle, so a pool of hundreds of them stays cheap. Every set is ordered by age (frame 0
// young .. last old), so a particle's frame is just floor(age / life * frames). Anchors are the particle's
// ground point; z is the height above it, so the renderer lifts them by their flight height.
const SMOKE_M = [[58, 56, 68], [82, 80, 92], [108, 106, 118], [136, 134, 146], [166, 164, 174]];
// smoke / steam puffs over a life: 8 frames growing (r 3 -> 10) and breaking up. kind 'dark' (a burning
// car), 'light' (steam, tyre smoke) or 'mid' (when the source isn't known)
export function puffFrames(kind = 'mid') {
  const R = kind === 'dark' || kind === true ? SMOKE_D : kind === 'light' ? SMOKE_L : SMOKE_M, out = [];
  const RS = [3, 4, 5, 6, 7, 8, 9, 10], DIS = [0, 0, 0.08, 0.18, 0.32, 0.46, 0.6, 0.74];
  RS.forEach((r, f) => {
    const S = Math.ceil(r * 2 + 6), G = frame(S, S, S >> 1, S - 2), k = DIS[f];
    puff(G, G.ax, G.ay - r - 1, r, (x, y, lit, u, v, w) => (k && gone(x, y, k * (1.25 - w * 0.5), r) ? null : [step(R, cl(0.42 + lit * 0.55 + (kind === 'light' ? 0.06 : 0) - k * 0.15), x, y, 0.6)]), k < 0.3 ? 1 : 0, 0.18, r);
    out.push(finish(G));
  });
  return out;
}
// a flame over its life: 8 frames, a full flickering tongue (~15 px) that shrinks and gutters out
export function flameFrames() {
  const out = [], SC = [1.2, 1.2, 1.05, 0.9, 0.8, 0.65, 0.5, 0.4];
  SC.forEach((sc, fi) => {
    const H = 12 * sc, W2 = 4.2 * sc, w = Math.ceil(W2 * 2 + 6), h = Math.ceil(H * 1.3 + 5), ax = w >> 1, ay = h - 2, ph = fi / 4 * TAU;
    const G = frame(w, h, ax, ay);
    for (let y = 0; y <= ay; y++) for (let x = 0; x < w; x++) {
      const yy = (ay - y) / H; if (yy > 1.3) continue;
      const hw = W2 * Math.pow(Math.max(0, 1 - yy * 0.85), 0.6) * Math.min(1, 0.6 + yy * 2.5), sway = Math.sin(yy * 3 - ph) * 1.1 * sc * yy;
      const I = 1 - Math.abs(x + 0.5 - ax - sway) / Math.max(0.5, hw) + (vnoise(x, y + fi * 5, 2.4, 7) - 0.5) * 0.6 - yy * 0.25 - fi * 0.03;
      if (I <= 0.12) continue;
      const t = cl(I * 0.75 + (1 - yy) * 0.35 - 0.05 - fi * 0.04, 0.15);
      dot(G, x, y, step(FIRE, t, x, y, 0.7), 90 + t * t * 165, 1);
    }
    G.light = { x: 0, y: 0, z: H * 0.5, r: 30 * sc + 10, k: 0.9 * (1 - fi * 0.08), col: [1, 0.58, 0.24] };
    out.push(finish(G));
  });
  return out;
}
// sparks: a hot 3 px streak, a 2 px one, a dying dot
export function sparkFrames() {
  return [3, 2, 1].map((n, i) => {
    const G = frame(7, 5, 3, 2, 0, false);
    for (let k = 0; k < n; k++) dot(G, 3 - k, 2, SPARK[Math.max(0, 4 - i - k)], 255 - i * 60 - k * 30, 0);
    return finish(G);
  });
}
// droplets over a flight: blood (dark red, a glossy fleck) or water (blue-white, a glint), thinning 2.3 -> 1 px
export function dropFrames(blood = false) {
  const R = blood ? BLOOD : WATER;
  return [2.3, 1.6, 1].map((r) => {
    const S = Math.ceil(r * 2 + 4), G = frame(S, S, S >> 1, S - 1);
    puff(G, G.ax, G.ay - r - 0.5, r, (x, y, lit) => [step(R, cl((blood ? 0.35 : 0.55) + lit * 0.45), x, y, 0.4), blood ? 0 : lit > 0.5 ? 60 : 0], 1);
    return finish(G);
  });
}
// chunks of concrete knocked off a highway barrier (main.js 'barrier'): a jagged grey lump, 4 frames tumbling over
export function rubbleFrames() {
  const R = [[92, 90, 86], [128, 124, 116], [164, 160, 150], [196, 192, 182]], out = [];
  for (let f = 0; f < 4; f++) {
    const G = frame(9, 8, 4, 6), a = f * 0.8;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
      const dx = x + 0.5 - 4.5, dy = y + 0.5 - 4, lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      const r = Math.max(Math.abs(lx) / 3.2, Math.abs(ly) / 2.3) + (vnoise(x + f * 3, y, 1.6, 41) - 0.5) * 0.5;
      if (r < 1) dot(G, x, y, step(R, cl(0.7 - ly * 0.12 - (r > 0.8 ? 0.35 : 0)), x, y, 0.5), 0, 1);
    }
    out.push(finish(G));
  }
  return out;
}
// paper scraps and leaves fluttering: 4 frames turning edge-on and back (paper white, leaf green, leaf orange)
export function flutterFrames(kind = 'paper') {
  const R = kind === 'paper' ? [[150, 146, 140], [196, 192, 184], [226, 222, 212], [246, 244, 236]] : kind === 'leaf' ? LEAF_G : LEAF_O, out = [];
  for (let f = 0; f < 4; f++) {
    const G = frame(10, 9, 5, 7), k = [1, 0.55, 0.15, 0.6][f], a = f * 0.7;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 10; x++) {
      const dx = x + 0.5 - 5, dy = y + 0.5 - 4, lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
      const inside = kind === 'paper' ? Math.abs(lx) < 3.2 && Math.abs(ly) < 2.2 * k + 0.4 : (lx / 3.6) ** 2 + (ly / (1.8 * k + 0.45)) ** 2 < 1;
      if (inside) dot(G, x, y, step(R, cl(0.6 - ly * 0.08 + (f === 2 ? -0.2 : 0)), x, y, 0.5), 0, 1);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- boat wake ------------------------------------------------------------------------------------------
// Foam for a boat L x W heading along ang (0 = +x): spray curling off the bow along both sides of the hull,
// a churned patch at the stern and a widening V trail behind, broken up by dither. 4 frames that loop.
// Anchor = the boat's centre; it lies on the water (F_GROUND | F_WATER) under the hull sprite.
export function wakeFrames(L = 104, W = 48, ang = 0) {
  const tail = Math.round(L * 0.7 + 30), R = Math.ceil(Math.hypot(L / 2 + tail, W / 2 + 22)) + 2, out = [];
  const FOAM = [[150, 196, 220], [196, 226, 240], [232, 246, 252], [252, 255, 255]];
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let f = 0; f < 4; f++) {
    const G = frame(R * 2, R * 2, R, R, 0, false);
    for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
      const gx = x + 0.5 - R, gy = y + 0.5 - R, u = gx * ca + gy * sa, v = -gx * sa + gy * ca, av = Math.abs(v);
      let k = 0;
      // bow spray hugging the hull: a white collar that widens toward the stern
      if (u < L / 2 + 3 && u > -L / 2 - 2) {
        const hw = (W / 2) * Math.min(1, (L / 2 + 3 - u) / (L * 0.3)), d = av - hw, wdt = 2.5 + (L / 2 - u) * 0.07;
        if (d > -1.5 && d < wdt) k = Math.max(k, 1 - Math.max(0, d) / (wdt + 1));
      }
      // the churned stern patch and the V trail spreading behind
      if (u < -L / 2 + 4) {
        const b = -L / 2 + 4 - u, arm = W * 0.38 + b * 0.45, edge = Math.abs(av - arm), fade = 1 - b / tail;
        if (b < tail) {
          if (edge < 3 + b * 0.05) k = Math.max(k, (1 - edge / (3.5 + b * 0.05)) * fade);
          const core = W * 0.42 * (1 - b / (tail * 0.75));
          if (av < core) k = Math.max(k, (1 - av / core * 0.5) * fade * 1.05);
        }
      }
      if (k <= 0.05) continue;
      const n = vnoise(u - f * 6, v * 1.3, 2.6, 41) * 0.65 + hash(x, y, f + 5) * 0.35;
      if (n * 0.75 > k * 1.15 || dith(x, y, 0.85 - k)) continue;
      dot(G, x, y, FOAM[Math.max(0, Math.min(3, Math.floor(k * 3.4 + n * 0.6 - 0.3)))], 0, 0, F_GROUND | F_WATER, NUP, 240);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- ground decals for the live game ---------------------------------------------------------------------
// scorch: a sooty blotch with ragged spatter (3 sizes, r 10, 20, 34)
export function scorchFrames() {
  return [10, 20, 34].map((r, vi) => {
    const S = Math.ceil(r * 2.6), Hh = Math.ceil(S * 0.8), G = frame(S, Hh, S >> 1, Hh >> 1, 0, false), rnd = mulberry32(vi * 977 + 3);
    groundEllipse(G, G.ax, G.ay, r * 1.15, r * 0.82, (d, x, y) => {
      const nz = vnoise(x, y, 3 + vi, 5 + vi) * 0.45;
      if (d + nz * 0.6 > 1 || (d > 0.55 && dith(x, y, (d - 0.55) * 2 + nz * 0.5))) return null;
      return [step(SCORCH, cl(d * 0.8 + nz - 0.15), x, y), 0, 235];
    });
    for (let i = 0; i < 8 + vi * 6; i++) { const a = rnd() * TAU, dd = r * (1.05 + rnd() * 0.5); groundEllipse(G, G.ax + Math.cos(a) * dd, G.ay + Math.sin(a) * dd * 0.72, 0.8 + rnd() * 1.4, 0.6 + rnd(), () => [SCORCH[1], 0, 220]); }
    return finish(G);
  });
}
// a glossy pool: blood (dark red) or oil (near black with a faint sheen); 3 sizes
export function poolFrames(oil = false) {
  const R = oil ? [[14, 12, 18], [22, 20, 28], [32, 30, 40], [58, 56, 76], [96, 92, 120]] : BLOOD;
  return [5, 9, 14].map((r, vi) => {
    const S = Math.ceil(r * 2.6 + 4), Hh = Math.ceil(S * 0.8), G = frame(S, Hh, S >> 1, Hh >> 1, 0, false), ph = vi * 1.7 + (oil ? 3 : 0);
    for (let y = 0; y < Hh; y++) for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - G.ax, dy = (y + 0.5 - G.ay) / 0.72, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const rr = r * (0.84 + 0.3 * vnoise(Math.cos(a) * 2.5 + ph, Math.sin(a) * 2.5 + ph, 1.1, 31));
      if (d > rr) continue;
      const hl = (dx / rr) * LX + (dy / rr) * LY;
      const v = cl(0.3 - (d / rr) * 0.15 + (d < rr * 0.6 && hl > 0.35 ? 0.4 : 0) + (oil && Math.abs(Math.sin(d * 0.9 + a)) < 0.12 ? 0.35 : 0));
      dot(G, x, y, step(R, v, x, y, 0.4), 0, 0, F_GROUND, NUP, 240);
    }
    return finish(G);
  });
}
// litter: a paper scrap, a crushed can, a cup, a wrapper, a folded newspaper, a bottle cap (6 variants)
export function litterFrames() {
  const PAPER = [[150, 146, 140], [200, 196, 186], [232, 228, 218]], CAN = [[120, 30, 32], [176, 50, 46], [214, 96, 86]], CUP = [[200, 196, 186], [236, 232, 224], [176, 60, 50]];
  const WRAP = [[46, 92, 150], [76, 132, 196], [214, 180, 60]], NEWS = [[120, 118, 112], [170, 168, 160], [210, 208, 200]], CAP = [[150, 140, 120], [196, 186, 160], [230, 220, 196]];
  const shapes = [[PAPER, 5, 3.5, 0.4], [CAN, 4, 2, 0.9], [CUP, 3, 2.5, -0.3], [WRAP, 4, 2, 0.2], [NEWS, 6, 4, -0.5], [CAP, 1.6, 1.4, 0]];
  return shapes.map(([R, rx, ry, a], vi) => {
    const G = frame(16, 12, 8, 6, 0, false), ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 6, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > rx || Math.abs(ly) > ry) continue;
      const band = vi === 1 ? (Math.abs(lx) > rx - 1 ? 2 : 1) : vi === 3 ? (Math.abs(lx) < 1 ? 2 : 1) : vi === 4 ? ((Math.round(ly) & 1) ? 0 : 1) : vi === 2 ? (Math.abs(ly) < 0.8 ? 2 : 1) : (hash(x, y, vi) > 0.8 ? 0 : 1);
      dot(G, x, y, R[Math.min(R.length - 1, band + (lx < 0 && vi !== 4 ? 0 : 0))], 0, 0, F_GROUND, NUP, 250);
    }
    return finish(G);
  });
}
// a short skid dab (one tyre, ~12 x 4 px) at 8 angles, for marks laid along a wheel's path
export function skidDabFrames() {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI, ca = Math.cos(a), sa = Math.sin(a), G = frame(16, 16, 8, 8, 0, false);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - 8, dy = y + 0.5 - 8, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > 6 || Math.abs(ly) > 2) continue;
      if (dith(x, y, Math.abs(lx) > 4.5 ? 0.5 : 0.1)) continue;
      dot(G, x, y, RUBBER[(Math.round(ly + 2) % 3 === 0) ? 0 : 1], 0, 0, F_GROUND, NUP, 215);
    }
    out.push(finish(G));
  }
  return out;
}

// ---- registry, memo and pool -------------------------------------------------------------------------
const CACHE = new Map();
// memoised frames of any maker + arguments (frames are built once and shared; never mutate them)
export function memo(fn, ...args) {
  const key = (fn.fxName || fn.name) + '|' + JSON.stringify(args);
  let fr = CACHE.get(key);
  if (!fr) { fr = fn(...args); CACHE.set(key, fr); }
  return fr;
}
const M = (fn, ...a) => () => memo(fn, ...a);
// name -> { make, frames, fps, loop, decal (static variants: pick one, it holds for `hold` seconds) }
export const FX = {
  muzzleSmall: { make: M(muzzleFlash, 0), frames: 5, fps: 30 },
  muzzleMedium: { make: M(muzzleFlash, 1), frames: 5, fps: 30 },
  muzzleLarge: { make: M(muzzleFlash, 2), frames: 5, fps: 26 },
  tracerOrange: { make: M(tracer, 'orange'), frames: 6, fps: 40 },
  tracerWhite: { make: M(tracer, 'white'), frames: 6, fps: 40 },
  impactSpark: { make: M(impactSpark), frames: 6, fps: 24 },
  impactGlass: { make: M(impactGlass), frames: 6, fps: 24 },
  impactDirt: { make: M(impactDirt), frames: 6, fps: 20 },
  explosion: { make: M(explosion), frames: 10, fps: 10 },
  fire: { make: M(fire, 1, 1), frames: 5, fps: 10, loop: true },
  fireSmall: { make: M(fire, 2, 0), frames: 5, fps: 11, loop: true },
  fireLarge: { make: M(fire, 3, 2), frames: 5, fps: 9, loop: true },
  smokeLight: { make: M(smokeLight), frames: 6, fps: 8 },
  smokeHeavy: { make: M(smokeHeavy), frames: 6, fps: 7 },
  exhaust: { make: M(exhaust, 'grey'), frames: 6, fps: 12 },
  dustTrail: { make: M(exhaust, 'dust'), frames: 6, fps: 12 },
  skidMarks: { make: M(skidMarks), frames: 4, decal: true, hold: 30 },
  waterSplash: { make: M(waterSplash), frames: 7, fps: 14 },
  rainRipple: { make: M(rainRipple), frames: 6, fps: 14 },
  dustPuff: { make: M(dustPuff), frames: 6, fps: 14 },
  glassShatter: { make: M(glassShatter), frames: 7, fps: 14 },
  leaves: { make: M(leaves), frames: 8, fps: 6 },
  petals: { make: M(petals), frames: 8, fps: 6 },
  sparkle: { make: M(sparkle), frames: 6, fps: 12, loop: true },
  sparkleBlue: { make: M(sparkleBlue), frames: 6, fps: 12, loop: true },
  bloodSplat: { make: M(bloodSplat), frames: 3, decal: true, hold: 40 },
  bloodSpray: { make: M(bloodSpray), frames: 4, fps: 20 },
  footprints: { make: M(footprints), frames: 6, decal: true, hold: 20 },
  // single pooled particles and live-game decals (frame layouts in each maker's comment)
  pSmoke: { make: M(puffFrames, 'mid'), frames: 8, particle: true },
  pSmokeDark: { make: M(puffFrames, 'dark'), frames: 8, particle: true },
  pSteam: { make: M(puffFrames, 'light'), frames: 8, particle: true },
  pFlame: { make: M(flameFrames), frames: 8, particle: true },
  pSpark: { make: M(sparkFrames), frames: 3, particle: true },
  pBlood: { make: M(dropFrames, true), frames: 3, particle: true },
  pWater: { make: M(dropFrames, false), frames: 3, particle: true },
  pPaper: { make: M(flutterFrames, 'paper'), frames: 4, particle: true },
  pRubble: { make: M(rubbleFrames), frames: 4, particle: true },
  pLeaf: { make: M(flutterFrames, 'leaf'), frames: 4, particle: true },
  pLeafAutumn: { make: M(flutterFrames, 'autumn'), frames: 4, particle: true },
  dScorch: { make: M(scorchFrames), frames: 3, decal: true, hold: 240 },
  dBloodPool: { make: M(poolFrames, false), frames: 3, decal: true, hold: 240 },
  dOil: { make: M(poolFrames, true), frames: 3, decal: true, hold: 240 },
  dLitter: { make: M(litterFrames), frames: 6, decal: true, hold: 240 },
  dSkid: { make: M(skidDabFrames), frames: 8, decal: true, hold: 240 },
  wakeBoat: { make: M(wakeFrames, 104, 48, 0), frames: 4, fps: 10, loop: true },
  wakeSmall: { make: M(wakeFrames, 46, 22, 0), frames: 4, fps: 12, loop: true },
};
for (const [k, fn] of Object.entries({ muzzleFlash, tracer, impactSpark, impactGlass, impactDirt, explosion, fire, smokeLight, smokeHeavy, exhaust, skidMarks, waterSplash, rainRipple, dustPuff, glassShatter, leaves, petals, sparkle, sparkleBlue, bloodSplat, bloodSpray, footprints, puffFrames, flameFrames, sparkFrames, dropFrames, flutterFrames, scorchFrames, poolFrames, litterFrames, skidDabFrames, wakeFrames })) fn.fxName = k;
export const fxFrames = (name) => FX[name].make();

// A fixed set of effect slots, allocated once: spawning reuses a free slot (or the oldest one when
// all are busy), update/forEach allocate nothing. forEach(fn) calls fn(slot, gbufFrame) for live slots.
export class FxPool {
  constructor(n = 96) {
    this.slots = [];
    for (let i = 0; i < n; i++) this.slots.push({ name: '', frame: 0, x: 0, y: 0, t: 0, on: false, frames: null, fps: 0, loop: false, hold: 0, born: 0 });
    this.clock = 0;
  }
  spawn(name, x, y, variant = 0) {
    const def = FX[name];
    if (!def) return null;
    let s = null, old = null;
    for (const c of this.slots) { if (!c.on) { s = c; break; } if (!old || c.born < old.born) old = c; }
    s = s || old;
    s.name = name; s.frames = def.make(); s.x = x; s.y = y; s.t = 0; s.on = true; s.born = this.clock++;
    s.fps = def.fps || 0; s.loop = !!def.loop; s.hold = def.decal ? def.hold : 0;
    s.frame = def.decal ? ((variant % s.frames.length) + s.frames.length) % s.frames.length : 0;
    return s;
  }
  update(dt) {
    for (const s of this.slots) {
      if (!s.on) continue;
      s.t += dt;
      if (s.hold) { if (s.t >= s.hold) s.on = false; continue; }
      let f = Math.floor(s.t * s.fps);
      if (f >= s.frames.length) { if (s.loop) f %= s.frames.length; else { s.on = false; continue; } }
      s.frame = f;
    }
  }
  forEach(fn) { for (const s of this.slots) if (s.on) fn(s, s.frames[s.frame]); }
  kill(s) { s.on = false; }
  clear() { for (const s of this.slots) s.on = false; }
  get live() { let n = 0; for (const s of this.slots) if (s.on) n++; return n; }
}
