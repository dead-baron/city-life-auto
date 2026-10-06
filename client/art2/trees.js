// Art v2 trees and plants, drawn as upright sprites (heights per pixel = how far above the foot it
// stands, so they throw proper shadows) with normals worked out from their shapes: palm crowns from
// each frond's direction, broadleaf crowns from clumps of leafy spheres. Leaves are flagged so low
// sun glows through their edges.
import { GBuf, F_LEAF, hash, mulberry32, step, bayer } from './gbuf.js';
import { MAT, ramp } from './palette.js';

const nrm = (G, x, y, n) => { x |= 0; y |= 0; if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; const l = Math.hypot(n[0], n[1], n[2]) || 1; G.nrm[j] = (n[0] / l * 0.5 + 0.5) * 255; G.nrm[j + 1] = (n[1] / l * 0.5 + 0.5) * 255; G.nrm[j + 2] = (n[2] / l * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; };

function finishUpright(G, foot) {
  for (let i = 0; i < G.z.length; i++) if (G.col[i * 4 + 3]) G.z[i] = Math.max(1, foot - Math.floor(i / G.w));
}

// ---- palm -------------------------------------------------------------------------------------------
export function palm(seed = 1, height = 110) {
  const rnd = mulberry32(seed * 7919 + 11);
  const crownR = 30;
  const W = crownR * 2 + 24, H = height + crownR + 10, foot = H - 3;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = foot;
  const lean = (rnd() - 0.5) * 18, bend = (rnd() - 0.3) * 10;
  const trunkX = (t) => W / 2 + lean * t + bend * Math.sin(t * Math.PI);    // t: 0 foot .. 1 top
  const topY = foot - height;
  // trunk
  for (let y = topY; y <= foot; y++) {
    const t = (foot - y) / height, cx = trunkX(t), w = 3.2 - t * 1.2;
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
      const u = (x + 0.5 - cx) / w;
      if (Math.abs(u) > 1) continue;
      const ring = (foot - y) % 5 === 0 || (foot - y) % 5 === 1 && u > 0;
      const c = step(MAT.palmTrunk, 0.62 - u * 0.35 - (ring ? 0.3 : 0), x, y, 0.4);
      G.put(x, y, c, null, 0);
      nrm(G, x, y, [u * 0.9, 0.45, 0.2]);
    }
  }
  // coconuts / dead frond skirt under the crown
  const cxTop = trunkX(1);
  for (let k = 0; k < 5; k++) { const a = rnd() * 6.28, r = 2 + rnd() * 3, x = cxTop + Math.cos(a) * r, y = topY + 3 + Math.abs(Math.sin(a)) * 3; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx * dx + dy * dy < 2) { G.put(x + dx, y + dy, step(ramp('#7a5a28', 5, 2), 0.6 - dx * 0.15 - dy * 0.1, x, y, 0)); nrm(G, x + dx, y + dy, [dx, 0.5, -dy]); } }
  // fronds: back ones first (pointing up/away), front ones last
  const n = 17 + Math.floor(rnd() * 5);
  const fronds = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rnd() * 0.4;
    fronds.push({ a, len: crownR * (0.62 + rnd() * 0.4), droop: 0.5 + rnd() * 0.6, lift: Math.sin(a) });
  }
  fronds.sort((p, q) => p.lift - q.lift);
  for (const f of fronds) {
    const dx = Math.cos(f.a), dyw = Math.sin(f.a);                // direction on the ground plane
    const steps = Math.round(f.len * 1.4);
    let px = cxTop, py = topY;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      // the frond arcs up a little then droops; seen in this projection its ground y and its height
      // both move it on screen
      const along = f.len * t;
      const hgt = 6 * Math.sin(t * Math.PI * 0.6) - f.droop * along * t * 0.9;
      const X = cxTop + dx * along, Y = topY + dyw * along * 0.75 - hgt;
      // leaflets on both sides, longest mid-frond, angled toward the tip and down
      const ll = Math.round(Math.sin(Math.min(1, t * 1.15) * Math.PI) * 7.5 + 1.5);
      const px2 = -dyw, py2 = dx * 0.75;                            // perpendicular on screen
      for (const sgn of [-1, 1]) for (let k = 1; k <= ll; k++) {
        const qx = X + px2 * k * sgn + dx * k * 0.35, qy = Y + py2 * k * sgn + k * 0.45 + dyw * k * 0.2;
        const top = sgn * (px2 + py2) < 0;                          // upper-left side catches light
        const c = step(MAT.palmLeaf, 0.5 + (top ? 0.25 : -0.15) - k / ll * 0.2 + (t < 0.15 ? -0.2 : 0), qx | 0, qy | 0, 0.6);
        G.put(qx, qy, c, null, 0, null, F_LEAF);
        nrm(G, qx, qy, [px2 * sgn * 0.6, 0.35, 0.75]);
      }
      G.put(X, Y, step(MAT.palmLeaf, 0.3, X | 0, Y | 0, 0), null, 0, null, F_LEAF);
      nrm(G, X, Y, [dx * 0.3, 0.4, 0.85]);
      px = X; py = Y;
    }
  }
  G.outline(0.42, true);
  finishUpright(G, foot);
  return G;
}

// ---- broadleaf street tree (and bushes) -----------------------------------------------------------
export function leafyTree(seed = 1, height = 120, crown = 34, opt = {}) {
  const rnd = mulberry32(seed * 104729 + 3);
  const W = crown * 2 + 12, H = height + 8, foot = H - 3;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = foot;
  const R = opt.ramp || MAT.leaf, cx = W / 2;
  const crownCy = foot - height + crown * 0.95;
  const trunkTop = crownCy + crown * 0.3;
  // trunk with a fork
  if (!opt.bush) for (let y = Math.floor(trunkTop - 10); y <= foot; y++) {
    const t = (foot - y) / (foot - trunkTop), w = 2.6 - t * 0.6 + (y > foot - 3 ? 1 : 0);
    const cxx = cx + Math.sin(t * 2.2 + seed) * 1.5;
    for (let x = Math.floor(cxx - w); x <= Math.ceil(cxx + w); x++) { const u = (x + 0.5 - cxx) / w; if (Math.abs(u) > 1) continue; G.put(x, y, step(MAT.bark, 0.6 - u * 0.35 + (hash(x, y, seed) > 0.85 ? -0.2 : 0), x, y, 0.4)); nrm(G, x, y, [u, 0.5, 0.1]); }
  }
  // clumps
  const blobs = [];
  const nb = 16 + Math.floor(rnd() * 6);
  for (let i = 0; i < nb; i++) {
    const a = rnd() * 6.283, r = Math.sqrt(rnd()) * crown * 0.62;
    blobs.push({ x: cx + Math.cos(a) * r * 1.1, y: crownCy + Math.sin(a) * r * 0.8 - crown * 0.08, r: crown * (0.26 + rnd() * 0.16) });
  }
  blobs.push({ x: cx, y: crownCy - crown * 0.15, r: crown * 0.55 });
  paintBlobs(G, blobs, R, seed, opt);
  G.outline(0.4, true);
  finishUpright(G, foot);
  return G;
}
// the leafy crown: for each pixel, the front-most clump surface (largest projected depth)
function paintBlobs(G, blobs, R, seed, opt = {}) {
  const W = G.w, H = G.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = null, bz = -1e9;
    for (const b of blobs) {
      const u = (x + 0.5 - b.x) / b.r, v = (y + 0.5 - b.y) / b.r, q = u * u + v * v;
      if (q > 1) continue;
      // leafy, ragged edge
      const edge = 1 - q;
      if (edge < 0.18 && hash(x >> 1, y >> 1, seed) > edge * 5) continue;
      const w = Math.sqrt(1 - q);
      const depth = b.y + w * b.r * 0.6;
      if (depth > bz) { bz = depth; best = [u, v, w]; }
    }
    if (!best) continue;
    const [u, v, w] = best;
    // leaf texture: little clusters lit on their upper-left
    const cl = hash(x >> 1, y >> 1, seed + 5), cl2 = hash((x + 1) >> 1, (y + 1) >> 1, seed + 6);
    let t = 0.5 - u * 0.3 - v * 0.34 + (w - 0.45) * 0.55 + (cl > 0.72 ? 0.2 : cl < 0.2 ? -0.22 : 0) + (cl2 > 0.9 ? 0.15 : 0);
    if (opt.flowers && hash(x, y, seed + 9) > 0.93) { G.put(x, y, step(ramp(opt.flowers, 5, 2), 0.7, x, y, 0), null, 0, null, F_LEAF); nrm(G, x, y, [u, 0.4 + w * 0.3, -v + 0.3]); continue; }
    G.put(x, y, step(R, t, x, y, 0.8), null, 0, null, F_LEAF);
    nrm(G, x, y, [u * 0.9, 0.35 + w * 0.4, -v * 0.9 + 0.25]);
  }
}

// ---- Italian cypress / columnar conifer: a tall, narrow flame of dark foliage -----------------------
export function cypress(seed = 1, height = 96, radius = 11, opt = {}) {
  const rnd = mulberry32(seed * 7717 + 5);
  const W = radius * 2 + 10, H = height + 8, foot = H - 3, cx = W / 2;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = foot;
  for (let y = foot - 8; y <= foot; y++) for (let x = Math.floor(cx - 2); x <= cx + 2; x++) { G.put(x, y, step(MAT.bark, 0.55 - (x - cx) * 0.12, x, y, 0.4)); nrm(G, x, y, [(x - cx) / 2, 0.5, 0.1]); }
  const blobs = [];
  const n = Math.round(height / 6);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = foot - 6 - t * (height - 10);
    const r = radius * (t < 0.15 ? 0.75 + t * 1.6 : 1 - Math.pow((t - 0.15) / 0.85, 1.6) * 0.82);
    blobs.push({ x: cx + (rnd() - 0.5) * radius * 0.5, y, r: Math.max(2.5, r * (0.85 + rnd() * 0.3)) });
  }
  paintBlobs(G, blobs, opt.ramp || MAT.leafDark, seed, opt);
  G.outline(0.4, true);
  finishUpright(G, foot);
  return G;
}

// ---- pine: tiers of drooping dark boughs on a straight trunk -----------------------------------------
export function pine(seed = 1, height = 150, radius = 30) {
  const rnd = mulberry32(seed * 3301 + 9);
  const W = radius * 2 + 12, H = height + 8, foot = H - 3, cx = W / 2;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = foot;
  for (let y = foot - height + 6; y <= foot; y++) { const w = 3 - (foot - y) / height * 2; for (let x = Math.floor(cx - w); x <= cx + w; x++) { G.put(x, y, step(MAT.bark, 0.55 - (x - cx) / w * 0.3, x, y, 0.4)); nrm(G, x, y, [(x - cx) / w, 0.5, 0.1]); } }
  // tiers of drooping boughs: each a fan that widens downward with a ragged, needled edge, drawn from
  // the bottom tier up so the upper ones overlap the lower; lit on the upper left, dark underneath
  const R = ramp('#3a6a3e', 7, 3, { dark: 0.72, light: 0.5, shift: 0.3 });
  const tiers = 6 + Math.floor(rnd() * 3), top = foot - height, bottom = foot - height * 0.18;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1), yb = bottom - t * (bottom - top - 10), th = (bottom - top) / tiers * 1.7, r = radius * (1 - t * 0.8) + 3, lean = (rnd() - 0.5) * 3;
    for (let y = Math.floor(yb - th); y <= yb; y++) {
      const v = (y - (yb - th)) / th;                                      // 0 at the tier's tip, 1 at its hem
      const half = r * Math.pow(v, 0.85);
      for (let x = Math.floor(cx - half - 3); x <= cx + half + 3; x++) {
        const u = (x + 0.5 - cx - lean * v) / Math.max(1, half);
        const rag = hash(x, y >> 1, seed) * 0.35 + (Math.abs(u) > 0.7 ? hash(x >> 1, y, seed + 1) * 0.3 : 0);
        if (Math.abs(u) > 1 + 0.15 - rag * 0.6) continue;
        if (v > 0.82 && hash(x, 0, seed + i) > 0.55 + (1 - v) * 2) continue;   // a jagged, drooping hem
        let k = 0.55 - u * 0.32 - v * 0.28 + (hash(x >> 1, y >> 1, seed + 3) > 0.75 ? 0.18 : 0) + (v < 0.3 ? 0.12 : 0);
        if (Math.abs(u) < 0.12 && v > 0.2) k -= 0.12;                        // the shaded line down the middle
        G.put(x, y, step(R, k, x, y, 0.7), null, 0, null, F_LEAF);
        nrm(G, x, y, [u * 0.75, 0.35 + v * 0.3, 0.7 - v * 0.4]);
      }
    }
  }
  G.outline(0.4, true);
  finishUpright(G, foot);
  return G;
}

export const bush = (seed, size = 18, opt = {}) => leafyTree(seed, size * 1.4, size, { ...opt, bush: true });

// ---- weeping willow: a rounded crown with long curtains of hanging leaves ------------------------------
export function willow(seed = 1, height = 130, crown = 52) {
  const rnd = mulberry32(seed * 5113 + 1);
  const W = crown * 2 + 20, H = height + 8, foot = H - 3, cx = W / 2;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = foot;
  const top = foot - height, crownCy = top + crown * 0.7;
  for (let y = Math.floor(crownCy); y <= foot; y++) { const t = (foot - y) / (foot - crownCy), w = 4 - t * 1.5, x0 = cx + Math.sin(t * 2 + seed) * 3; for (let x = Math.floor(x0 - w); x <= x0 + w; x++) { G.put(x, y, step(MAT.bark, 0.55 - (x - x0) / w * 0.3 + (hash(x, y, seed) > 0.85 ? -0.2 : 0), x, y, 0.4)); nrm(G, x, y, [(x - x0) / w, 0.5, 0.1]); } }
  const blobs = [];
  for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, r = Math.sqrt(rnd()) * crown * 0.6; blobs.push({ x: cx + Math.cos(a) * r * 1.1, y: crownCy + Math.sin(a) * r * 0.55 - crown * 0.1, r: crown * (0.3 + rnd() * 0.15) }); }
  const R = ramp('#86a83a', 7, 3, { dark: 0.7, light: 0.5, shift: 0.38 });
  paintBlobs(G, blobs, R, seed);
  // curtains: strands from the crown's underside down toward the ground, swaying a little
  for (let i = 0; i < crown * 3.2; i++) {
    const u = (rnd() * 2 - 1), sx = cx + u * crown * 1.05, y0 = crownCy - crown * 0.2 + Math.abs(u) * crown * 0.35 + rnd() * 8;
    const len = (foot - y0) * (0.55 + rnd() * 0.4) * (1 - Math.abs(u) * 0.3), sway = (rnd() - 0.5) * 4;
    for (let k = 0; k < len; k++) {
      const x = sx + sway * (k / len) ** 2 + u * k * 0.06, y = y0 + k;
      if (hash(Math.round(x), Math.round(y), seed) < 0.18) continue;
      G.put(x, y, step(R, 0.5 + (u < 0 ? 0.15 : -0.1) - k / len * 0.25 + (hash(i, k >> 2, seed) > 0.7 ? 0.2 : 0), Math.round(x), Math.round(y), 0.6), null, 0, null, F_LEAF);
      nrm(G, x, y, [u * 0.6, 0.6, 0.5]);
    }
  }
  G.outline(0.4, true);
  finishUpright(G, foot);
  return G;
}
// a flowering tree (cherry blossom): the broadleaf generator in pink
export const blossom = (seed = 1, height = 120, crown = 46) => leafyTree(seed, height, crown, { ramp: ramp('#e48aac', 7, 3, { dark: 0.55, light: 0.55, shift: 0.15 }), flowers: '#fff0f4' });
