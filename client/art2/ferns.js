// The fern kit (the redwood overhaul, 2026-11-24; the owner, 18:00: "I'd really love to improve the ferns and make a lot
// of variety of ferns"). Until now the woods had two ferns - flora.js fern (a half fan of fronds, in green and as
// bracken) and redwoods.js swordFernArt (a rosette) - so every fern bed was one plant repeated. Nine kinds here, each
// with a build of its own, all made at the art pixel like the sword fern (ap2: 1 px = 2 world px), lit from the upper
// left, outlined by the one rule (a dark tone of the neighbouring colour):
//   sword      a rosette of long narrow fronds, a fishbone of short leaflets (the redwood floor's own)
//   lady       a tall shuttlecock: upright lacy fronds widest in the middle, a light yellow-green
//   maidenhair fans of small round leaflets in tiers on thin black stems
//   bracken    single tall stalks with a broad three-part frond held flat; green, and gone gold and russet
//   deer       a low rosette of evenly combed fronds lying out flat, thin dark fertile fronds standing in its middle
//   chain      the giant: coarse arching fronds with big leaflets, a dark glossy green
//   fiddle     a young crown: coiled croziers, some half unrolled
//   clump      an old sword-fern tussock: several crowns grown into one mound
//   licorice   a small one-sided tuft of short fronds - the fern that grows on a log or a mossy rock
// Each maker (seed, size) -> a GBuf with ax, ay (its foot) and ap2 = 2; size is its width in world px. A seed gives its
// own plant: the number of fronds, their lengths, lean and lift all vary (the variety test: twelve shapes a kind).
// Not in the bake yet (statics.js SPECIES): shown to the owner first; test/ferns.test.js holds the kit.
import { GBuf, F_LEAF, hash, bayer, mulberry32 } from './gbuf.js';
import { natRamp as ramp } from './palette.js';
import { FOL } from './flora.js';

const PI = Math.PI;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (Rm, t, x, y, d = 0.4) => Rm[Math.max(0, Math.min(Rm.length - 1, Math.round(t * (Rm.length - 1) + bayer(x, y) * d)))];
const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
// the greens (from the anchor's foliage ramp, flora.js FOL): [body, in the sun, in shade]
const PAL = {
  sword: [FOL('#3f8a2c'), FOL('#5e9c2a'), FOL('#2c6a2c')],
  lady: [FOL('#5a9a30'), FOL('#86b436'), FOL('#3a7a2e')],
  maiden: [FOL('#4c9a38'), FOL('#74b440'), FOL('#2f7432')],
  bracken: [FOL('#4e8a2c'), FOL('#739e2c'), FOL('#33692a')],
  gold: [FOL('#a8842c', { cool: 20, shiftD: 0.5, warm: 30, shift: 0.4 }), FOL('#c8a436', { cool: 20, shiftD: 0.5, warm: 30, shift: 0.4 }), FOL('#7a5a2a', { cool: 20, shiftD: 0.5, warm: 30, shift: 0.4 })],
  deer: [FOL('#357a30'), FOL('#4f9234'), FOL('#255a2c')],
  chain: [FOL('#2f7a30'), FOL('#4a9430'), FOL('#205428')],
  fiddle: [FOL('#6a9a34'), FOL('#93b43c'), FOL('#3f7430')],
};
const STEM = ramp('#3a2a22', 5, 2, { dark: 0.5, light: 0.4 }), STALK = ramp('#8a7a3e', 5, 2, { dark: 0.55, light: 0.4 }), FERTILE = ramp('#5a4028', 5, 2, { dark: 0.5, light: 0.4 });

const canvas = (w, h, below) => { const G = new GBuf(Math.ceil(w), Math.ceil(h)); G.ax = G.w >> 1; G.ay = G.h - Math.ceil(below); return G; };
// (thin: what is drawn after the outline, so it keeps its one pixel - a wiry stem, a stalk, a fertile frond)
const finish = (G, thin = null) => { G.outline(0.5, true, 50); if (thin) thin(); G.ax *= 2; G.ay *= 2; G.ap2 = 2; return G; };
const leaf = (G, x, y, R, t, z, n) => { const X = Math.round(x), Y = Math.round(y); if (G.inside(X, Y)) G.put(X, Y, pick(R, clamp(t), X, Y), n || [0, 0.3, 0.95], Math.max(1, Math.round(z)), null, F_LEAF); };

// One frond from (cx, cy) out along azimuth a (0 east, PI/2 toward the viewer), len art px long. It rises and arches
// over (o.h: its lift as a share of its length; o.arch: how soon it comes over), a midrib with leaflets in pairs:
//   o.pin(t)  a leaflet's length at t along the frond (art px)      o.gap  half-steps between pairs
//   o.lace    a leaflet's own little side teeth (a twice-cut frond)  o.rib  the midrib's ramp (default the frond's)
//   o.bare    the share of the frond at its foot with no leaflets (a stalk)
function frond(G, cx, cy, a, len, P, seed, o = {}) {
  const ca = Math.cos(a), sa = Math.sin(a), toSun = clamp(0.48 - ca * 0.2 - sa * 0.16), h = o.h ?? 0.3, arch = o.arch ?? 1.25, gap = o.gap ?? 3, bare = o.bare ?? 0.04;
  let k = 0, px = cx, py = cy;
  for (let s = 1; s < len; s += 0.5, k++) {
    const t = s / len, z = len * h * Math.sin(Math.min(1, t * arch) * PI * 0.9) * (1 - t * (o.sag ?? 0.3));
    const X = cx + ca * s * (o.reach ?? 1), Y = cy + sa * s * 0.62 * (o.reach ?? 1) - z, dx = X - px, dy = Y - py, dl = Math.hypot(dx, dy) || 1;
    px = X; py = Y;
    const ux = -dy / dl, uy = dx / dl, lit = toSun + t * 0.16 - (t < 0.25 ? 0.12 : 0) + (hash(k, 1, seed) - 0.5) * 0.1;
    const R = t > 0.5 && toSun > 0.5 ? P[1] : t < 0.18 ? P[2] : P[0];
    leaf(G, X, Y, o.rib || R, o.rib ? 0.35 + t * 0.2 : lit - 0.14, z + 3);
    if (k % gap || t < bare) continue;
    const pl = o.pin(t), alt = (k / gap) % 2 ? 0.06 : -0.04;
    for (let side = -1; side <= 1; side += 2) for (let q = 1; q <= pl; q++) {
      const lx = X + ux * q * side + dx / dl * q * 0.35, ly = Y + uy * q * side + q * 0.25, up = side * uy < 0;
      const li = lit + alt + (up ? 0.08 : -0.1) + (q > pl - 1 ? 0.05 : 0);
      leaf(G, lx, ly, R, li, z + 3, nrm(up ? -0.25 : 0.15, 0.3, 0.9));
      // (a lacy frond: every other pixel of the leaflet has a tooth forward and back)
      if (o.lace && q % 2 === 0 && q < pl) { leaf(G, lx + dx / dl, ly + dy / dl, R, li + 0.06, z + 3); leaf(G, lx - dx / dl, ly - dy / dl, R, li - 0.08, z + 3); }
    }
  }
}
// a crown's dark heart
const heart = (G, cx, cy, R, rx = 4, ry = 2.5) => { for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -rx; x <= rx; x++) if (x * x / (rx * rx) + y * y / (ry * ry) < 1) leaf(G, cx + x, cy + y - 1, R, 0.12, 3); };
// the fronds of a crown, the back ones (up the screen) drawn first
const rosette = (rnd, n, from = 0, to = PI * 2) => { const fr = []; for (let i = 0; i < n; i++) fr.push({ a: from + (i + 0.5) / n * (to - from) + (rnd() - 0.5) * (to - from) / n * 0.9, u: rnd(), v: rnd() }); return fr.sort((p, q) => Math.sin(p.a) - Math.sin(q.a)); };

// ---- sword fern: the rosette (as redwoods.js swordFernArt, from this kit's frond) ---------------------------------
export function swordFern(seed = 1, size = 84) {
  const r = size / 4, G = canvas(r * 2.3 + 10, r * 1.7 + 12, r * 0.7 + 4), rnd = mulberry32(seed * 613 + 5), cx = G.ax, cy = G.ay;
  heart(G, cx, cy - 1, PAL.sword[2]);
  for (const f of rosette(rnd, 16 + Math.floor(rnd() * 9))) frond(G, cx, cy - 2, f.a, r * (0.72 + f.u * 0.42), PAL.sword, seed, { h: 0.22 + f.v * 0.16, pin: (t) => 2.7 * (1 - t * 0.7) * (t < 0.06 ? 0.4 : 1) });
  return finish(G);
}
// ---- lady fern: a vase of upright lacy fronds, each a plume widest in its middle ------------------------------
export function ladyFern(seed = 1, size = 76) {
  const r = size / 4, G = canvas(r * 3.2 + 10, r * 3 + 12, r * 0.6 + 4), rnd = mulberry32(seed * 419 + 11), cx = G.ax, cy = G.ay;
  heart(G, cx, cy - 1, PAL.lady[2], 3, 2);
  for (const f of rosette(rnd, 6 + Math.floor(rnd() * 4))) frond(G, cx, cy - 2, f.a, r * (1.0 + f.u * 0.45), PAL.lady, seed, { h: 0.8 + f.v * 0.35, arch: 0.78, sag: 0.1, reach: 0.95, gap: 3, lace: 1, bare: 0.14, pin: (t) => 3.6 * Math.sin(PI * clamp(t * 0.92 + 0.06)) ** 0.8 });
  return finish(G);
}
// ---- maidenhair: little fans of round leaflets in tiers on wiry black stems -----------------------------------
export function maidenhair(seed = 1, size = 64) {
  const r = size / 4, G = canvas(r * 3 + 10, r * 2.1 + 12, r * 0.3 + 5), rnd = mulberry32(seed * 733 + 3), cx = G.ax, cy = G.ay, n = 5 + Math.floor(rnd() * 4), st = [];
  for (let i = 0; i < n; i++) st.push({ x: (i / (n - 1) - 0.5) * r * 1.1 + (rnd() - 0.5) * 3, lean: (i / (n - 1) - 0.5) * 1.3 + (rnd() - 0.5) * 0.3, h: r * (0.6 + rnd() * 0.85), w: r * (0.42 + rnd() * 0.22) });
  st.sort((p, q) => q.h - p.h);                                        // (the tallest behind)
  const stems = [];
  for (const [si, s] of st.entries()) {
    let X = cx + s.x, Y = cy;
    for (let q = 0; q < s.h; q += 0.5) { X += s.lean * 0.25; Y -= 0.5; stems.push([X, Y, q]); }
    // its fan: two arcs of leaflets, each a 2 x 2 dab, the outer arc lightest
    const lit = clamp(0.5 - s.lean * 0.14 + (hash(si, 2, seed) - 0.5) * 0.1);
    for (let ring = 0; ring < 2; ring++) {
      const rr = s.w * (0.5 + ring * 0.5), m = 3 + ring * 3;
      for (let j = 0; j < m; j++) {
        const a = PI + (j + 0.5 + (hash(j, ring + si * 7, seed) - 0.5) * 0.5) / m * PI, lx = X + Math.cos(a) * rr, ly = Y + Math.sin(a) * rr * 0.5 + ring * 0.8;
        const R = ring === 1 && lit > 0.48 ? PAL.maiden[1] : PAL.maiden[0];
        for (const [dx, dy, d] of [[0, 0, 0.1], [1, 0, 0], [0, 1, -0.12], [1, 1, -0.16]]) leaf(G, lx + dx, ly + dy, R, lit + d + ring * 0.08 - Math.cos(a) * 0.1, s.h + 3 - ring, nrm(-0.2, 0.3, 0.9));
      }
    }
  }
  return finish(G, () => { for (const [x, y, q] of stems) { const X = Math.round(x), Y = Math.round(y); if (G.inside(X, Y) && !(G.flag[Y * G.w + X] & F_LEAF && G.col[(Y * G.w + X) * 4 + 1] > 90)) G.put(X, Y, pick(STEM, 0.3, X, Y), [0, 0.3, 0.95], q + 2, null, 0); } });
}
// ---- bracken: a few tall stalks, each with one broad triangle of a frond held out nearly level -----------------
function brackenOf(seed, size, P) {
  const r = size / 4, G = canvas(r * 3.4 + 12, r * 2.9 + 12, r * 0.7 + 4), rnd = mulberry32(seed * 271 + 17), cx = G.ax, cy = G.ay, n = 2 + Math.floor(rnd() * 3), st = [], stalks = [];
  for (let i = 0; i < n; i++) st.push({ x: (rnd() - 0.5) * r * 0.8, y: (rnd() - 0.5) * 4, h: r * (0.5 + rnd() * 0.55), lean: (rnd() - 0.5) * 0.4, w: r * (1.0 + rnd() * 0.4), turn: (i + rnd() * 0.8) / n * PI * 2 });
  st.sort((p, q) => Math.sin(p.turn) - Math.sin(q.turn));
  for (const s of st) {
    let X = cx + s.x, Y = cy + s.y;
    for (let q = 0; q < s.h; q += 0.5) { X += s.lean * 0.25; Y -= 0.5; stalks.push([X, Y, q, s.h]); }
    // (the triangle: long leaflets at its foot shortening to the tip, each cut again)
    frond(G, X, Y, s.turn, s.w, P, seed + Math.round(s.turn * 5), { h: 0.2, arch: 1.3, sag: 0.8, gap: 4, bare: 0.08, pin: (t) => 8 * (1 - t) ** 0.9 + 1 });
  }
  return finish(G, () => { for (const [x, y, q, h] of stalks) { const X = Math.round(x), Y = Math.round(y); if (G.inside(X, Y) && !(G.flag[Y * G.w + X] & F_LEAF)) G.put(X, Y, pick(STALK, 0.3 + q / h * 0.3, X, Y), [0, 0.3, 0.95], q + 2, null, 0); } });
}
export const bracken = (seed = 1, size = 88) => brackenOf(seed, size, PAL.bracken);
export const brackenGold = (seed = 1, size = 88) => brackenOf(seed, size, PAL.gold);
// ---- deer fern: a flat combed rosette, a few thin fertile fronds standing out of its middle -----------------------
export function deerFern(seed = 1, size = 64) {
  const r = size / 4, G = canvas(r * 2.5 + 10, r * 2.2 + 12, r * 0.72 + 4), rnd = mulberry32(seed * 887 + 23), cx = G.ax, cy = G.ay, spikes = [];
  heart(G, cx, cy - 1, PAL.deer[2], 3, 2);
  for (const f of rosette(rnd, 12 + Math.floor(rnd() * 6))) frond(G, cx, cy - 1, f.a, r * (0.85 + f.u * 0.22), PAL.deer, seed, { h: 0.07 + f.v * 0.05, gap: 3, pin: (t) => 2.6 * Math.sin(PI * clamp(t * 0.9 + 0.1)) ** 0.6 });
  for (let i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) spikes.push({ lean: (i / Math.max(1, n - 1) - 0.5) * 1.1 + (rnd() - 0.5) * 0.2, h: r * (0.9 + rnd() * 0.5) });
  return finish(G, () => {
    for (const sp of spikes) { let X = cx, Y = cy - 2; for (let q = 0; q < sp.h; q += 0.5) { X += sp.lean * 0.3; Y -= 0.5; const x = Math.round(X), y = Math.round(Y); if (!G.inside(x, y)) continue; G.put(x, y, pick(FERTILE, 0.35 + q / sp.h * 0.3, x, y), [0, 0.3, 0.95], q + 3, null, 0); if (q > sp.h * 0.4 && Math.round(q * 2) % 3 === 0) for (const sg of [-1, 1]) if (G.inside(x + sg, y)) G.put(x + sg, y, pick(FERTILE, 0.6, x + sg, y), [0, 0.3, 0.95], q + 3, null, 0); } }
  });
}
// ---- chain fern: the giant - coarse arching fronds, big leaflets ---------------------------------------------------
export function chainFern(seed = 1, size = 128) {
  const r = size / 4, G = canvas(r * 2.3 + 12, r * 2.1 + 14, r * 0.6 + 4), rnd = mulberry32(seed * 157 + 29), cx = G.ax, cy = G.ay;
  heart(G, cx, cy - 1, PAL.chain[2], 5, 3);
  for (const f of rosette(rnd, 8 + Math.floor(rnd() * 5))) frond(G, cx, cy - 2, f.a, r * (0.8 + f.u * 0.4), PAL.chain, seed, { h: 0.55 + f.v * 0.3, arch: 1.05, sag: 0.45, gap: 4, bare: 0.1, pin: (t) => 6.2 * Math.sin(PI * clamp(t * 0.85 + 0.12)) ** 0.7 });
  return finish(G);
}
// ---- fiddleheads: a young crown of coiled croziers ---------------------------------------------------------------
export function fiddleheads(seed = 1, size = 52) {
  const r = size / 4, G = canvas(r * 2.4 + 10, r * 2.4 + 12, r * 0.35 + 4), rnd = mulberry32(seed * 947 + 31), cx = G.ax, cy = G.ay, n = 4 + Math.floor(rnd() * 5), st = [];
  for (let i = 0; i < n; i++) st.push({ x: (i / (n - 1) - 0.5) * r * 1.1 + (rnd() - 0.5) * 2, y: (rnd() - 0.5) * 3, h: r * (0.6 + rnd() * 1.0), dir: rnd() < 0.5 ? -1 : 1, open: rnd() });
  st.sort((p, q) => p.y - q.y);
  heart(G, cx, cy, PAL.fiddle[2], 4, 2);
  for (const s of st) {
    // the stalk up, then the coil: a spiral of two turns (a young one) or one with a few leaflets out (half unrolled)
    let X = cx + s.x, Y = cy + s.y;
    for (let q = 0; q < s.h; q += 0.5) { X += s.dir * 0.06; Y -= 0.5; leaf(G, X, Y, PAL.fiddle[0], 0.4 + q / s.h * 0.2, q + 2); leaf(G, X + 1, Y, PAL.fiddle[2], 0.3, q + 2); if (s.open > 0.6 && q > s.h * 0.45 && Math.round(q * 2) % 4 === 0) for (const sg of [-1, 1]) for (let k = 1; k <= 2; k++) leaf(G, X + sg * k, Y + k * 0.4, PAL.fiddle[1], 0.6, q + 2); }
    const R0 = 1.6 + s.h * 0.1;
    for (let a = 0; a < PI * (s.open > 0.6 ? 2.4 : 3.6); a += 0.25) { const rr = R0 * (1 - a / (PI * 4.2)), lx = X + s.dir * (R0 - Math.cos(a) * rr), ly = Y - Math.sin(a) * rr; leaf(G, lx, ly, a > PI * 2 ? PAL.fiddle[1] : PAL.fiddle[0], 0.45 + Math.sin(a) * 0.2, s.h + 3); }
  }
  return finish(G);
}
// ---- an old tussock: several sword-fern crowns grown into one mound -------------------------------------------
export function fernClump(seed = 1, size = 132) {
  const r = size / 4, G = canvas(r * 2.4 + 12, r * 1.8 + 14, r * 0.75 + 4), rnd = mulberry32(seed * 373 + 41), cx = G.ax, cy = G.ay, n = 3 + Math.floor(rnd() * 3), cr = [];
  for (let i = 0; i < n; i++) cr.push({ x: (rnd() - 0.5) * r * 0.9, y: (rnd() - 0.5) * r * 0.5, k: 0.5 + rnd() * 0.25 });
  cr.sort((p, q) => p.y - q.y);
  for (const [ci, c] of cr.entries()) {
    heart(G, cx + c.x, cy + c.y - 1, PAL.sword[2]);
    for (const f of rosette(rnd, 12 + Math.floor(rnd() * 6))) frond(G, cx + c.x, cy + c.y - 2, f.a, r * c.k * (0.78 + f.u * 0.4), PAL.sword, seed + ci * 5, { h: 0.26 + f.v * 0.18, pin: (t) => 2.7 * (1 - t * 0.7) * (t < 0.06 ? 0.4 : 1) });
  }
  return finish(G);
}
// ---- licorice fern: a small one-sided tuft, for a log's back or a mossy rock -----------------------------------
export function licoriceFern(seed = 1, size = 52) {
  const r = size / 4, G = canvas(r * 2.8 + 10, r * 1.8 + 10, r * 0.6 + 4), rnd = mulberry32(seed * 521 + 43), cx = G.ax, cy = G.ay, side = rnd() < 0.5 ? 0 : 1;
  // (its fronds lean out one way and hang: off the side of what it grows on)
  for (const f of rosette(rnd, 4 + Math.floor(rnd() * 3), side ? -PI * 0.15 : PI * 0.45, side ? PI * 0.55 : PI * 1.15)) frond(G, cx, cy - 2, f.a, r * (1.0 + f.u * 0.5), PAL.lady, seed, { h: 0.3 + f.v * 0.25, arch: 1.5, sag: 0.7, gap: 3, pin: (t) => 3.2 * Math.sin(PI * clamp(t * 0.9 + 0.1)) ** 0.7 });
  return finish(G);
}

// the kit, by name: [maker, its width in world px]
export const FERNS = {
  sword: [swordFern, 84], swordS: [swordFern, 56], lady: [ladyFern, 76], maidenhair: [maidenhair, 64], bracken: [bracken, 88], brackenGold: [brackenGold, 88],
  deer: [deerFern, 64], chain: [chainFern, 128], fiddle: [fiddleheads, 52], clump: [fernClump, 132], licorice: [licoriceFern, 52],
};
export const fernArt = (name, seed = 1) => { const [fn, size] = FERNS[name]; return fn(seed, size); };
