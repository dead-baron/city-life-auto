// Art v2 giant redwoods and the old-growth forest floor (concepts N1-A, N1-B, N1-E, E3b): built for the game's
// Highland Woods, from the N1 grove study (biomescenes.js bigTrunk). Pure and worker-safe (statics.js makes them in
// the bake workers). Light comes from the upper left, like every other sprite.
//
//   giantRedwood(seed, H, hw, o)  a coast redwood: a fluted, flared column hw px half-wide rising H px (z up = screen
//                                 up), root flares and moss on the ground, burls, now and then a fire-scarred hollow
//                                 at its foot ("goosepen"), the crown in the top half: feathery sprays hanging from
//                                 short boughs, thicker toward a ragged top. Anchor at the middle of its foot.
//   oldStump(seed, r)             an old-growth stump, sawn long ago: a ring of bark round a punky, mossy, charred top
//   nurseLog(seed, len, r)        a fallen giant lying east-west, mossed over, ferns and seedlings growing on it
//   sorrel(seed, w)               a patch of redwood sorrel: clover leaves carpeting the floor, a few pale flowers
import { GBuf, F_LEAF, F_GROUND, hash, vnoise, bayer, mulberry32 } from './gbuf.js';
import { ramp } from './palette.js';
import { FOL } from './flora.js';

const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (Rm, t, x, y, d = 0.6) => Rm[Math.max(0, Math.min(Rm.length - 1, Math.round(t * (Rm.length - 1) + bayer(x, y) * d)))];
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

// cinnamon-red bark (fibrous, deep vertical furrows), charcoal for old fire scars, the moss and the sprays
const BARK = ramp('#8a4428', 8, 3, { dark: 0.72, light: 0.52, shift: 0.24 });
const CHAR = ramp('#3a2a26', 5, 2, { dark: 0.5, light: 0.35 });
const MOSS = FOL('#5a8a2a');
const SPRAY = FOL('#5c9428'), SPRAY_DK = FOL('#3f7430'), SPRAY_SUN = FOL('#7aa62a');
const PUNK = ramp('#a86a3e', 6, 3, { dark: 0.6, light: 0.45 });
const SORREL = FOL('#5a9a34'), SORREL_FL = [[236, 222, 232], [222, 196, 214], [248, 240, 244]];

// a feathery spray: a drooping stem with short flat needles in pairs along it, leaning toward the tip (redwood
// foliage: a fishbone, not a leaf), lit 0..1
function sprig(G, x, y, len, ang, R, lit, seed, zAt) {
  const droop = 0.025 + hash(seed, 1, 3) * 0.03, ca = Math.cos(ang), sa = Math.sin(ang);
  let k = 0;
  for (let s = 0; s < len; s += 0.7, k++) {
    const X = x + ca * s, Y = y + sa * s + droop * s * s, t = s / len;
    const base = lit + (hash(Math.round(X), Math.round(Y), seed) - 0.5) * 0.22 - t * 0.06;
    const sx = Math.round(X), sy = Math.round(Y);
    if (G.inside(sx, sy)) G.put(sx, sy, pick(R, clamp(base - 0.08), sx, sy, 0.4), [0, 0.35, 0.94], zAt(sy), null, F_LEAF);
    if (k % 2) continue;
    const nl = 3.3 * (1 - t * 0.55) * (0.8 + hash(k, 3, seed) * 0.4);
    for (let side = -1; side <= 1; side += 2) for (let q = 1; q <= nl; q++) {
      const xx = Math.round(X - sa * q * side + ca * q * 0.42), yy = Math.round(Y + ca * q * side * 0.6 + sa * q * 0.42 + q * 0.3);
      if (!G.inside(xx, yy)) continue;
      G.put(xx, yy, pick(R, clamp(base + (side < 0 ? 0.1 : -0.12) + (q > nl - 1 ? 0.07 : 0)), xx, yy, 0.4), nrm(side < 0 ? -0.3 : 0.2, 0.3, 0.9), zAt(yy), null, F_LEAF);
    }
  }
}
// a clump of sprays round (cx, cy), lit from the upper left; sun: how much of it catches the light. A dark mass
// of foliage behind them first, so the clump reads thick and the gaps between its sprays are deep shade.
function clump(G, cx, cy, rx, ry, seed, zAt, sun = 0.5, n = 0) {
  const rnd = mulberry32(seed * 31 + 1), N = n || Math.max(4, Math.round(rx * ry / 6)), pts = [];
  const mx = rx * 0.72, my = ry * 0.72;
  for (let y = Math.floor(cy - my); y <= cy + my; y++) for (let x = Math.floor(cx - mx); x <= cx + mx; x++) {
    const u = (x - cx) / mx, v = (y - cy) / my;
    if (u * u + v * v > 1 - hash(x, y, seed) * 0.35 || !G.inside(x, y)) continue;
    G.put(x, y, pick(SPRAY_DK, clamp(0.16 - u * 0.08 - v * 0.08 + (hash(x, y, seed + 5) - 0.5) * 0.12), x, y, 0.5), [-0.1, 0.25, 0.96], Math.max(1, zAt(y) - 3), null, F_LEAF);
  }
  for (let i = 0; i < N; i++) { const a = rnd() * PI * 2, q = Math.sqrt(rnd()); pts.push([cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]); }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pts) {
    const lit = clamp(0.55 - (x - cx) / rx * 0.2 - (y - cy) / ry * 0.24 + (rnd() - 0.5) * 0.15);
    const R = lit > 0.6 && rnd() < sun ? SPRAY_SUN : lit < 0.38 ? SPRAY_DK : SPRAY;
    sprig(G, x, y, 6 + rnd() * 7, (rnd() < 0.5 ? PI : 0) + (rnd() - 0.5) * 1.0 + (rnd() < 0.5 ? 0.35 : -0.25), R, lit, seed + Math.round(x * 3 + y), zAt);
  }
}

// ---- the giant ---------------------------------------------------------------------------------------------
// o: flare (how far the foot spreads), lean (px the top drifts), crown (0..1 how full), scar (fire hollow), snag (a
// dead top), burls. The giants in the game have neither a scar nor a snag (task #399, the owner: the fire hollow read
// as "the grey triangle at the bottom of all the redwood trees", the dead top as "a small grey cone"): a flared,
// rooted, mossy foot, and a trunk that rises into its crown, the sprays closing over its tip.
export function giantRedwood(seed = 1, H = 520, hw = 30, o = {}) {
  const rnd = mulberry32(seed * 977 + 3), flare = o.flare ?? 0.6, bulge = 0.5, cone = !!o.cone;
  // (a dead top, only when asked for: a silver spike standing out of the crown)
  const snag = !!o.snag && !cone, Ht = snag ? H * 1.06 : H;
  const lean = o.lean ?? (hash(seed, 7, 2) - 0.5) * hw * 0.7, crownW = hw * 2.6 + 30;
  const Wd = Math.ceil(Math.max(hw * 2 * (1 + flare), crownW * 2) + 40 + Math.abs(lean) * 2), Hh = Math.ceil(Ht + hw * (1 + flare) * bulge + 40);
  const G = new GBuf(Wd, Hh);
  G.ax = Wd >> 1; G.ay = Hh - Math.ceil(hw * (1 + flare) * bulge) - 16;
  const cx = G.ax, foot = G.ay, nfl = Math.max(6, Math.round(hw / 3.6));
  // the column: wide flared foot, a gentle taper, a slight wobble, narrowing to a spire in the crown; xAt: its
  // middle at height z (the lean)
  const rad = (z) => hw * (1 + flare * Math.max(0, 1 - z / (hw * 1.7)) ** 2) * (1 + 0.03 * Math.sin(z * 0.04 + seed)) * (1 - Math.min(1, z / Ht) * 0.42) * (1 - clamp((z - Ht * 0.68) / (Ht * 0.32)) ** 1.6 * 0.86);
  const xAt = (z) => cx + lean * (z / H) ** 1.6;
  const SNAG = ramp('#8c8274', 6, 3, { dark: 0.62, light: 0.38 });
  const scar = !!o.scar, scarH = hw * (1.1 + hash(seed, 10, 4) * 0.9), scarW = 0.38 + hash(seed, 11, 4) * 0.2;
  const burls = [];
  for (let i = 0; i < (o.burls ?? (1 + Math.floor(hash(seed, 12, 4) * 3))); i++) burls.push([(hash(seed, 13 + i, 4) - 0.5) * 1.4, hw * 0.8 + hash(seed, 20 + i, 4) * H * 0.35, hw * (0.18 + hash(seed, 27 + i, 4) * 0.16)]);
  // roots spreading over the floor (the back ones first, the front ones after the trunk)
  const root = (front) => {
    for (let i = 0; i < 7; i++) {
      const a = PI * (0.06 + 0.88 * hash(i, 1, seed)) + (i % 2 ? 0 : PI), fr = Math.sin(a) > 0.2;
      if (fr !== front) continue;
      const L = hw * (0.5 + hash(i, 2, seed) * 0.6), r0 = hw * 0.9, w0 = hw * 0.24;
      for (let s = 0; s < L; s += 0.6) {
        const wv = w0 * (1 - s / L) + 1, X = cx + Math.cos(a) * (r0 + s), Y = foot + Math.sin(a) * (r0 + s) * 0.62;
        for (let q = -wv; q <= wv; q++) for (let zz = 0; zz <= wv * 0.8; zz++) {
          const xx = Math.round(X - Math.sin(a) * q), yy = Math.round(Y - zz + Math.cos(a) * q * 0.6);
          if (!G.inside(xx, yy)) continue;
          const u = q / wv, mo = vnoise(xx, yy, 4, seed + 9) > 0.52;
          G.put(xx, yy, mo ? pick(MOSS, 0.35 + zz / wv * 0.3, xx, yy, 0.5) : pick(BARK, 0.36 - u * 0.2 + zz / wv * 0.25 + (hash(xx, yy, seed) > 0.85 ? -0.2 : 0), xx, yy, 0.5), nrm(-Math.sin(a) * u * 0.6, Math.cos(a) * u * 0.6 + 0.3, 0.7), zz, null, mo ? F_LEAF : 0);
        }
      }
    }
  };
  root(false);
  // (the trunk ends a little under the top of the crown, so the sprays close over its tip)
  const top = snag ? Ht : H - 7;
  for (let y = 0; y < G.h; y++) {
    const zEst = foot - y;
    if (zEst > top) continue;
    const zc = Math.max(0, zEst), mx = xAt(zc);
    // (the dead top: broken and splintered, narrowing in jerks)
    const r = rad(zc) * (snag && zEst > H * 0.92 ? 0.7 + hash(Math.round(zEst / 3), 0, seed) * 0.5 : 1);
    for (let x = Math.floor(mx - r - 2); x <= mx + r + 2; x++) {
      let u = (x + 0.5 - mx) / r;
      // burls: knobby swellings on the bark
      let bump = 0;
      for (const [bu, bz, br] of burls) { const d = Math.hypot((u - bu) * r, zEst - bz); if (d < br) bump = Math.max(bump, Math.sqrt(1 - (d / br) ** 2)); }
      const rr = r * (1 + bump * 0.12);
      u = (x + 0.5 - mx) / rr;
      if (Math.abs(u) > 1) continue;
      const dep = rr * Math.sqrt(1 - u * u), z = zEst + dep * bulge;
      if (z < 0) continue;
      const phi = Math.asin(u), fl = Math.sin(phi * nfl + vnoise(zc * 0.5, phi * 3, 9, seed) * 2.4 + seed);
      const streak = hash(Math.round(phi * hw * 0.5), Math.floor(zc / (4 + hash(Math.round(phi * hw * 0.5), 0, seed) * 6)), seed);
      const plate = hash(Math.round(phi * hw * 0.35), Math.floor((zc + hash(Math.round(phi * hw * 0.35), 1, seed) * 30) / 26), seed + 3);
      // lit from the left: the left flank warm, the right in shade; furrows dark, ridges catch the light
      let t = 0.47 - u * 0.26 + (fl > 0.5 ? 0.14 : fl < -0.45 ? -0.28 : 0) + (streak > 0.84 ? -0.2 : streak < 0.12 ? 0.12 : 0) + (plate - 0.5) * 0.16 + (z < 6 ? -0.15 : 0) + bump * 0.18;
      let c = snag && zEst > H * 0.94 ? pick(SNAG, clamp(t + 0.1), x, y, 0.55) : pick(BARK, clamp(t), x, y, 0.55), f = 0, nx = u + Math.cos(phi * nfl) * 0.22, nz = 0.12;
      // the fire hollow at its foot (dark, charred, in the face toward the viewer)
      if (scar && zEst < scarH * (1 - (Math.abs(u) / scarW) ** 2) && Math.abs(u) < scarW) { c = pick(CHAR, 0.3 + zEst / scarH * 0.4 + (hash(x, y, seed) - 0.5) * 0.3, x, y, 0.5); nx *= 0.3; nz = 0.6; }
      else {
        // moss low down, more on the shaded right flank
        const mz = hw * 1.8 * (0.6 + vnoise(phi * 9, 0, 3, seed) * 0.8) * (u > 0 ? 1.3 : 0.75);
        if (zEst < mz && vnoise(x * 1.6, y * 0.22, 5, seed + 2) * 0.7 + vnoise(x, y, 3, seed + 4) * 0.3 > 0.42 + zEst / mz * 0.35) { c = pick(MOSS, 0.36 - u * 0.15 + (hash(x, y, seed) - 0.5) * 0.3, x, y, 0.5); f = F_LEAF; }
      }
      G.put(x, y, c, nrm(nx, Math.sqrt(1 - u * u) * 0.95, nz), z, null, f);
    }
  }
  root(true);
  // the crown: boughs all the way up from low (about half way) to the top, each a dark limb hung with clumps of
  // sprays along its outer part, the biggest at its end. An old giant's crown is a ragged column, fullest a third
  // of the way up it; a young tree's (o.cone) a cone. Then a thick tuft round the spire (or, a dead top, below it).
  const zAt = (yy) => Math.max(1, foot - yy + 8), low = H * (o.low ?? 0.55), full = o.crown ?? 0.62, span = H - low;
  const boughs = Math.round(span / 7 * (0.9 + full));
  for (let i = 0; i < boughs; i++) {
    const zz = low + Math.pow(rnd(), 0.85) * (span - 4), up = (zz - low) / span, side = rnd() < 0.5 ? -1 : 1, r = rad(zz), mx = xAt(zz);
    const env = cone ? (1 - up) * 0.95 + 0.08 : (0.45 + 0.55 * Math.sin(Math.min(1, up * 1.4 + 0.1) * PI)) * (0.55 + rnd() * 0.6);
    const reach = r * 0.6 + 3 + env * crownW * 0.5 * (0.5 + rnd() * 0.5), y = foot - zz;
    for (let s = r * 0.8; s < reach; s += 0.7) { const xx = Math.round(mx + side * s), yy = Math.round(y + Math.max(0, s - r) * 0.1 + Math.max(0, s - reach * 0.7) * 0.25); if (G.inside(xx, yy)) G.put(xx, yy, pick(BARK, 0.22, xx, yy, 0.4), [0, 0.4, 0.9], zAt(yy) - 2); }
    const nC = Math.max(1, Math.round((reach - r * 0.6) / 6));
    for (let k = 0; k < nC; k++) {
      const f = 1 - k / nC, ex = mx + side * (r * 0.6 + (reach - r * 0.6) * f), ey = y + 2 + f * 2 + Math.max(0, f - 0.7) * 3;
      clump(G, ex, ey, 3.5 + f * 5 + rnd() * 3, 2.5 + f * 2.5 + rnd() * 2, seed + i * 7 + k * 131, zAt, 0.62 - up * 0.2);
    }
  }
  const tz = snag ? H * 0.9 : H - 4;
  for (let i = 0; i < 5; i++) { const zz = tz - i * 9, mx = xAt(zz); clump(G, mx + (hash(seed, 40 + i, 5) - 0.5) * 10, foot - zz, 5 + i * 2.2, 4 + i * 0.8, seed + 90 + i, zAt, 0.75); }
  G.outline(0.42, true);
  return G;
}

// The giant made at the art pixel (half size: 1 px of it = 2 world px, chunkbake.js composites it at 2x, its
// heights doubled): twice the tree for the same pixels, and the dither lands on the art grid instead of being
// averaged away. H and hw in world px.
export function giantRedwoodArt(seed = 1, H = 620, hw = 54, o = {}) {
  const G = giantRedwood(seed, H / 2, hw / 2, o);
  G.ax *= 2; G.ay *= 2; G.ap2 = 2;
  return G;
}

// ---- an old-growth stump ------------------------------------------------------------------------------------
export function oldStump(seed = 1, r = 26) {
  const h = Math.round(r * 0.9), W = Math.ceil(r * 2 + 24), Hh = Math.ceil(h + r + 24), G = new GBuf(W, Hh);
  G.ax = W >> 1; G.ay = Hh - Math.ceil(r * 0.62) - 8;
  const cx = G.ax, foot = G.ay;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const u = (x + 0.5 - cx) / r;
    if (Math.abs(u) > 1) continue;
    const e = Math.sqrt(1 - u * u) * r * 0.62, top = foot - h - (hash(Math.round(u * 9), 0, seed) * 6);   // (a ragged, broken top edge)
    // the top face: an ellipse round (cx, top)
    const dy = y - top;
    if (Math.abs(dy) <= e) {
      const rr = Math.hypot(u, dy / (r * 0.62));
      const c = rr > 0.86 ? pick(BARK, 0.6 - u * 0.2, x, y) : vnoise(x, y, 5, seed) > 0.55 ? pick(MOSS, 0.5 + (hash(x, y, seed) - 0.5) * 0.3, x, y) : rr < 0.4 && hash(seed, 3, 1) < 0.5 ? pick(CHAR, 0.4, x, y) : pick(PUNK, 0.55 - rr * 0.25 + (Math.round(rr * 8) % 2 ? -0.1 : 0), x, y);
      G.put(x, y, c, [0, 0.1, 1], h + (dy < 0 ? -dy * 0.3 : 0), null, rr <= 0.86 && vnoise(x, y, 5, seed) > 0.55 ? F_LEAF : 0);
      continue;
    }
    // the side
    if (y > top && y <= foot + e) {
      const z = foot - y + e;
      if (z < 0) continue;
      const fl = Math.sin(Math.asin(u) * 9 + seed);
      const mo = foot - y < r * 0.5 && vnoise(x * 1.4, y * 0.3, 4, seed + 2) > 0.5;
      G.put(x, y, mo ? pick(MOSS, 0.4 - u * 0.15, x, y) : pick(BARK, 0.45 - u * 0.25 + (fl > 0.5 ? 0.12 : fl < -0.4 ? -0.22 : 0), x, y), nrm(u, Math.sqrt(1 - u * u), 0.1), z, null, mo ? F_LEAF : 0);
    }
  }
  G.outline(0.42, true);
  return G;
}

// ---- a fallen giant -----------------------------------------------------------------------------------------
// lying east-west (the item can be mirrored); len px long, r px round; moss over its top, ferns and redwood
// seedlings growing out of it, the torn root plate at the west end
export function nurseLog(seed = 1, len = 200, r = 18, flip = 0) {
  const W = Math.ceil(len + r * 3 + 20), Hh = Math.ceil(r * 3.2 + 40), G = new GBuf(W, Hh);
  G.ax = W >> 1; G.ay = Hh - 12;
  const cx = G.ax, foot = G.ay, x0 = cx - len / 2;
  // the root plate: a ragged disc standing up at the west end
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const dx = (x - (x0 - r * 0.2)) / (r * 0.55), dz = (foot - y - r * 1.1) / (r * 1.5);
    const q = dx * dx + dz * dz + (hash(x, y, seed) - 0.5) * 0.25;
    if (q < 1) G.put(x, y, q > 0.7 ? pick(BARK, 0.3, x, y) : pick(ramp('#6a4a32', 6, 3), 0.35 + (hash(x >> 1, y >> 1, seed) - 0.5) * 0.5, x, y), nrm(-0.6, 0.3, 0.7), Math.round(foot - y) + 2);
  }
  // the log: a cylinder along x, its top at height ~2r
  for (let x = Math.round(x0); x < x0 + len; x++) {
    const t = (x - x0) / len, rr = r * (1 - t * 0.25);
    for (let v = -rr; v <= rr; v++) {
      const w = v / rr, h = rr + Math.sqrt(Math.max(0, 1 - w * w)) * rr, y = Math.round(foot - rr + v * 0.62 - h + rr);
      if (!G.inside(x, y)) continue;
      const top = w < -0.2, mo = top && vnoise(x, y, 6, seed) > 0.38;
      const fl = Math.sin(w * 7 + x * 0.05 + seed);
      const c = mo ? pick(MOSS, 0.45 - w * 0.2 + (hash(x, y, seed) - 0.5) * 0.25, x, y) : pick(BARK, 0.42 - w * 0.25 + (fl > 0.5 ? 0.1 : fl < -0.5 ? -0.2 : 0), x, y);
      G.put(x, y, c, nrm(0, -w * 0.8 + 0.2, Math.sqrt(Math.max(0.05, 1 - w * w))), Math.round(h), null, mo ? F_LEAF : 0);
    }
  }
  // the broken east end: a jagged face of pale heartwood
  const xe = Math.round(x0 + len), re = r * 0.75;
  for (let v = -re; v <= re; v++) for (let k = 0; k < 4; k++) { const y = Math.round(foot - re + v * 0.62 - re * 0.5), x = xe + k - (hash(Math.round(v), k, seed) * 4 | 0); if (G.inside(x, y)) G.put(x, y, pick(PUNK, 0.6 - Math.abs(v) / re * 0.3, x, y), [0.8, 0.2, 0.5], Math.round(re * 1.5)); }
  // ferns and seedlings on its back
  const rnd = mulberry32(seed * 13 + 7), zAt = (yy) => Math.max(1, foot - yy + 4);
  for (let i = 0; i < Math.round(len / 40); i++) {
    const x = x0 + 20 + rnd() * (len - 40), y = foot - r * 2.1;
    if (rnd() < 0.6) for (let k = 0; k < 7; k++) { const a = -PI / 2 + (k - 3) * 0.42, L = 8 + rnd() * 5; for (let s = 0; s < L; s += 0.7) { const X = Math.round(x + Math.cos(a) * s), Y = Math.round(y + Math.sin(a) * s * 0.8 + s * s * 0.02); if (G.inside(X, Y)) G.put(X, Y, pick(SPRAY, 0.4 + s / L * 0.3 - (a > -PI / 2 ? 0.1 : 0), X, Y), [Math.cos(a) * 0.4, 0.3, 0.85], zAt(Y), null, F_LEAF); } }
    else clump(G, x, y - 6, 5, 7, seed + i, zAt, 0.4, 6);
  }
  G.outline(0.42, true);
  return flip ? mirror(G) : G;
}
// the same picture the other way round (the light stays on the left: only the shape flips, the normals turn back)
function mirror(S) {
  const G = new GBuf(S.w, S.h); G.ax = S.w - 1 - S.ax; G.ay = S.ay;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const i = y * S.w + x, j = y * S.w + (S.w - 1 - x);
    for (let c = 0; c < 4; c++) { G.col[j * 4 + c] = S.col[i * 4 + c]; G.nrm[j * 4 + c] = S.nrm[i * 4 + c]; G.emi[j * 4 + c] = S.emi[i * 4 + c]; }
    if (S.col[i * 4 + 3]) G.nrm[j * 4] = 255 - S.nrm[i * 4];
    G.z[j] = S.z[i]; G.flag[j] = S.flag[i];
  }
  return G;
}

// ---- a sword fern ------------------------------------------------------------------------------------------
// A rosette of long narrow fronds from one crown (concepts N1-A, N1-B: the ferns that fill the redwood floor),
// made at the art pixel like the giants (ap2: 1 px = 2 world px), so every leaflet is a crisp art pixel. Each
// frond arches up out of the crown and down again toward its tip, a rachis with short paired leaflets that
// shrink toward the tip; the back fronds first, the front ones over them. Lit from the upper left: the fronds
// reaching that way and the tips catch the light, the heart of the crown is deep shade. size: across, world px.
const FERN = FOL('#3f8a2c'), FERN_SUN = FOL('#5e9c2a'), FERN_DK = FOL('#2c6a2c');
export function swordFernArt(seed = 1, size = 84) {
  const r = size / 4, W = Math.ceil(r * 2.3 + 10), Hh = Math.ceil(r * 1.7 + 12), G = new GBuf(W, Hh), rnd = mulberry32(seed * 613 + 5);
  G.ax = W >> 1; G.ay = Hh - Math.ceil(r * 0.7) - 4;
  const cx = G.ax, cy = G.ay, n = 18 + Math.floor(rnd() * 7), fr = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2 + (rnd() - 0.5) * 0.3; fr.push({ a, len: r * (0.8 + rnd() * 0.35), h: 0.24 + rnd() * 0.14 }); }
  fr.sort((p, q) => Math.sin(p.a) - Math.sin(q.a));                  // back (up the screen) first
  // the dark heart of the crown
  for (let y = -3; y <= 2; y++) for (let x = -4; x <= 4; x++) if (x * x / 16 + y * y / 6 < 1) G.put(cx + x, cy + y - 2, pick(FERN_DK, 0.12, cx + x, cy + y), [0, 0.3, 0.95], 3, null, F_LEAF);
  for (const f of fr) {
    const ca = Math.cos(f.a), sa = Math.sin(f.a), toSun = clamp(0.48 - ca * 0.2 - sa * 0.16);
    let k = 0, px = cx, py = cy - 2;
    for (let s = 1; s < f.len; s += 0.5, k++) {
      const t = s / f.len, z = f.len * f.h * Math.sin(Math.min(1, t * 1.25) * PI * 0.9) * (1 - t * 0.3);
      const X = cx + ca * s, Y = cy + sa * s * 0.62 - z, dx = X - px, dy = Y - py, dl = Math.hypot(dx, dy) || 1;
      px = X; py = Y;
      const ux = -dy / dl, uy = dx / dl, lit = toSun + t * 0.16 - (t < 0.25 ? 0.12 : 0) + (hash(k, 1, seed) - 0.5) * 0.1, zz = Math.round(z + 3);
      const R = t > 0.55 && toSun > 0.52 ? FERN_SUN : t < 0.2 ? FERN_DK : FERN;
      const rx = Math.round(X), ry = Math.round(Y);
      if (G.inside(rx, ry)) G.put(rx, ry, pick(R, clamp(lit - 0.14), rx, ry, 0.4), [0, 0.3, 0.95], zz, null, F_LEAF);
      if (k % 3) continue;
      // a pair of leaflets, alternately lighter and darker down the frond (its fishbone)
      const pl = 2.7 * (1 - t * 0.7) * (t < 0.06 ? 0.4 : 1), alt = (k / 3) % 2 ? 0.06 : -0.04;
      for (let side = -1; side <= 1; side += 2) for (let q = 1; q <= pl; q++) {
        const xx = Math.round(X + ux * q * side + dx / dl * q * 0.35), yy = Math.round(Y + uy * q * side + q * 0.25);
        if (!G.inside(xx, yy)) continue;
        const up = side * uy < 0;                                     // the leaflet on the upper side of the frond
        G.put(xx, yy, pick(R, clamp(lit + alt + (up ? 0.08 : -0.1) + (q > pl - 1 ? 0.05 : 0)), xx, yy, 0.4), nrm(up ? -0.25 : 0.15, 0.3, 0.9), zz, null, F_LEAF);
      }
    }
  }
  G.outline(0.5, true);
  G.ax *= 2; G.ay *= 2; G.ap2 = 2;
  return G;
}

// ---- redwood sorrel ----------------------------------------------------------------------------------------
// a low carpet of three-lobed leaves (F_GROUND: it lies on the floor and lets feet through), a few pale flowers
export function sorrel(seed = 1, w = 44) {
  const h = Math.round(w * 0.62), W = w + 8, Hh = h + 10, G = new GBuf(W, Hh);
  G.ax = W >> 1; G.ay = Hh - 4;
  const cx = G.ax, cy = G.ay - h / 2, rnd = mulberry32(seed * 19 + 3);
  const N = Math.round(w * h / 9);
  for (let i = 0; i < N; i++) {
    const a = rnd() * PI * 2, q = Math.sqrt(rnd()), x = cx + Math.cos(a) * q * w / 2, y = cy + Math.sin(a) * q * h / 2;
    if ((Math.cos(a) * q) ** 2 + (Math.sin(a) * q) ** 2 > 0.9 + vnoise(x, y, 6, seed) * 0.3) continue;
    // three heart-shaped leaflets round a point
    for (let l = 0; l < 3; l++) {
      const la = l * 2.094 + rnd() * 0.5, lx = x + Math.cos(la) * 1.6, ly = y + Math.sin(la) * 1.1;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) {
        const X = Math.round(lx + dx), Y = Math.round(ly + dy);
        if (!G.inside(X, Y)) continue;
        const lit = 0.5 - (X - cx) / w * 0.4 - (Y - cy) / h * 0.3 + (hash(X, Y, seed) - 0.5) * 0.3 + (dy < 0 ? 0.12 : 0);
        G.put(X, Y, pick(SORREL, clamp(lit), X, Y, 0.5), [-0.2, 0.2, 0.95], 2, null, F_LEAF | F_GROUND);
      }
    }
    if (rnd() < 0.05) { const X = Math.round(x), Y = Math.round(y) - 2; if (G.inside(X, Y)) G.put(X, Y, SORREL_FL[i % 3], [0, 0.3, 0.95], 4, null, F_LEAF | F_GROUND); }
  }
  return G;
}
