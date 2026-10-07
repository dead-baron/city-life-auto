// Art v2 flora: every plant on the E3 biome vegetation sheets (docs/art-v2/targets/E3a-E3f), drawn as
// upright G-buffer sprites (anchor at the foot, height per pixel = how far above the foot it stands, so
// they cast proper shadows; foliage flagged F_LEAF so low sun glows through it; dark hue-tinted outline)
// or, for hard lumps like boulders and logs, as Vox models. Every maker takes a seed so each call varies.
//
// The painters underneath:
//   limb       a tapered, curved branch or trunk with cylinder shading and bark grain (redwood fluting,
//              birch marks, palm rings)
//   clusters   the foliage engine: a crown is a mass (ellipse lobes, a box, a cone) sampled into small
//              leaf clusters, painted back to front; each cluster is lit on its upper left with a bright
//              tip and falls into a dark pocket on its lower right, so a crown reads as crisp clumps
//              rather than a soft blob; a dark core shows through the gaps with the branches in it
//   sprays     conifer boughs: drooping fans of needles on whorled branches, lit along their tops
//   blade      grass blades and strap leaves (yucca, agave, corn, iris, palm leaflets)
//   bigLeaf    broad leaves with midrib, veins, splits and tears (banana, monstera, elephant ear, squash)
//   bloom      flower heads (daisy, poppy, rose, cup, trumpet, spike, bell, puff) and fruit
//
//   FLORA = { name: (seed) => sprite | Vox }   plus every maker exported by name.
import { GBuf, F_LEAF, F_GROUND, F_WET, F_WATER, hash, mulberry32, step } from './gbuf.js';
import { ramp } from './palette.js';
import { Vox } from './voxel.js';

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// foliage ramps: 8 steps from deep blue-green pockets through saturated mids to warm yellow lit tips, the
// hue swinging hard toward yellow as it brightens and staying saturated (the concept sheets' clumps)
function hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  return [(mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60, s, l];
}
function rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(clamp(v, 0, 1) * 255));
}
const toward = (a, b, k) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
export function FOL(c, o = {}) {
  const [h, s, l] = hsl(typeof c === 'string' ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : c);
  const n = o.n ?? 8, k = o.k ?? 3, out = [], cool = o.cool ?? 195, warm = o.warm ?? 54;
  for (let i = 0; i < n; i++) {
    const t = i - k;
    if (t < 0) { const u = -t / k; out.push(rgb(toward(h, cool, (o.shiftD ?? 0.42) * u), Math.min(1, s * (1 + 0.15 * u)), l * (1 - (o.dark ?? 0.72) * u))); }
    else if (t > 0) { const u = t / (n - 1 - k); out.push(rgb(toward(h, warm, (o.shift ?? 0.8) * u), Math.min(1, s * (1 + 0.05 * u)) * (1 - (o.desat ?? 0.1) * u), l + (1 - l) * (o.light ?? 0.5) * u)); }
    else out.push(rgb(h, s, l));
  }
  return out;
}
const RR = (c, n = 6, k = 3, o = {}) => ramp(c, n, k, o);
const BARK = RR('#6a4a32', 7, 3, { dark: 0.66, light: 0.45 });
const BARK_RED = RR('#9a4e2e', 7, 3, { dark: 0.68, light: 0.5, shift: 0.2 });
const BARK_GREY = RR('#8a8478', 7, 3, { dark: 0.6, light: 0.5, shift: 0.18 });
const BARK_PALE = RR('#c8c0b0', 7, 3, { dark: 0.55, light: 0.4, shift: 0.15 });
const BARK_BIRCH = RR('#e0ddd2', 6, 3, { dark: 0.5, light: 0.3, shift: 0.15 });
const STONE = RR('#a49c90', 7, 3, { dark: 0.55, light: 0.45, shift: 0.18 });
const IRON = RR('#3a3a44', 6, 3, { dark: 0.5, light: 0.6, shift: 0.15 });
const SOIL = RR('#6a4a32', 6, 3, { dark: 0.55, light: 0.4 });
const SNOW = RR('#dce6f4', 6, 3, { dark: 0.35, light: 0.7, shift: 0.1 });
const G_LEAF = FOL('#4f8a2c'), G_DARK = FOL('#3a6e34'), G_YEL = FOL('#7a9a2a');
// floraScale(k, fn): run a maker with the tree engines (broadleaf, conifer, pine tufts, palms, groves, redwood,
// saguaro, joshua tree) grown k times taller and wider - true-to-life heights for the live world - while leaf
// clusters only grow by sqrt(k), so a bigger crown is made of more clusters rather than coarser ones
let SIZE = 1, BARE = false;
export function floraScale(k, fn) { const o = SIZE; SIZE = k; try { return fn(); } finally { SIZE = o; } }
// floraBare(fn): the city trees (street, flowering, young, ginkgo, cherry, magnolia, red maple) without their grate
// or planter, for trees planted in a lawn or a yard
export function floraBare(fn) { const o = BARE; BARE = true; try { return fn(); } finally { BARE = o; } }
const sq = () => Math.sqrt(SIZE), tk = () => Math.pow(SIZE, 0.8);

// ---- canvas, pixels, finishing -------------------------------------------------------------------------
// a sprite canvas: foot (anchor) at the middle of the bottom, `below` rows left under it for bases
function sprite(w, h, below = 4) {
  const G = new GBuf(Math.ceil(w), Math.ceil(h));
  G.ax = G.w >> 1; G.ay = G.h - 1 - below; G.lz = new Int16Array(G.w * G.h).fill(-1);
  return G;
}
// one pixel with its colour, normal (any length), flags and (optionally) an explicit height
function px(G, x, y, c, n, f = F_LEAF, z = -1) { pxn(G, x, y, c, n[0], n[1], n[2], f, z); }
// the same with the normal as three numbers (no array per pixel in the hot loops)
function pxn(G, x, y, c, nx, ny, nz, f = F_LEAF, z = -1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
  if (z < 0 && G.root) z = Math.max(1, Math.round(G.root.b + G.root.y - y));   // standing on raised or flat ground
  const i = y * G.w + x, j = i * 4, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255;
  G.nrm[j] = (nx / l * 0.5 + 0.5) * 255; G.nrm[j + 1] = (ny / l * 0.5 + 0.5) * 255; G.nrm[j + 2] = (nz / l * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255;
  G.emi[j + 3] = 0; G.flag[i] = f; if (G.lz) G.lz[i] = z;
}
const has = (G, x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < G.w && y < G.h && G.col[(y * G.w + x) * 4 + 3] > 0; };
// GBuf.outline(dark, true) without per-pixel allocations: each empty pixel left of, right of or above the shape
// (not under its bottom edge) takes a dark, violet-shifted copy of that neighbour
function outline(G, dark) {
  const { w, h, col, nrm, z, flag } = G, pairs = new Int32Array(w * h * 2);
  let n = 0;
  const solid = (k) => col[k * 4 + 3] === 255 && !(flag[k] & F_GROUND);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (col[i * 4 + 3]) continue;
    const q = x > 0 && solid(i - 1) ? i - 1 : x < w - 1 && solid(i + 1) ? i + 1 : y < h - 1 && solid(i + w) ? i + w : -1;
    if (q >= 0) { pairs[n++] = i; pairs[n++] = q; }
  }
  for (let k = 0; k < n; k += 2) {
    const d = pairs[k], q = pairs[k + 1], dj = d * 4, sj = q * 4;
    col[dj] = col[sj] * dark * 0.85 + 6; col[dj + 1] = col[sj + 1] * dark * 0.8 + 4; col[dj + 2] = col[sj + 2] * dark * 0.95 + 18; col[dj + 3] = 255;
    nrm[dj] = nrm[sj]; nrm[dj + 1] = nrm[sj + 1]; nrm[dj + 2] = nrm[sj + 2]; nrm[dj + 3] = nrm[sj + 3];
    z[d] = z[q]; flag[d] = flag[q] & ~F_GROUND;
  }
}
// outline, heights (upright pixels stand as high as they are above the foot; ground bits keep theirs), crop
function done(G, ol = 0.42) {
  if (ol) outline(G, ol);
  const n = G.w * G.h;
  for (let i = 0; i < n; i++) if (G.col[i * 4 + 3]) G.z[i] = G.lz && G.lz[i] >= 0 ? G.lz[i] : Math.max(1, G.ay - Math.floor(i / G.w));
  return crop(G);
}
function crop(G) {
  let x0 = G.w, y0 = G.h, x1 = -1, y1 = -1;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) if (G.col[(y * G.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return G;
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(G.w - 1, x1 + 1); y1 = Math.min(G.h - 1, Math.max(y1 + 1, G.ay));
  if (x0 === 0 && y0 === 0 && x1 === G.w - 1 && y1 === G.h - 1) return G;
  const O = new GBuf(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < O.h; y++) {
    const s = (y + y0) * G.w + x0, d = y * O.w;
    O.col.set(G.col.subarray(s * 4, (s + O.w) * 4), d * 4); O.nrm.set(G.nrm.subarray(s * 4, (s + O.w) * 4), d * 4); O.emi.set(G.emi.subarray(s * 4, (s + O.w) * 4), d * 4);
    O.z.set(G.z.subarray(s, s + O.w), d); O.flag.set(G.flag.subarray(s, s + O.w), d);
  }
  O.ax = G.ax - x0; O.ay = G.ay - y0;
  return O;
}
// lay finished sprites (or rendered Vox) together: parts [[spr, dx, dy, dz]] in paint order, offsets of
// each part's anchor from the result's anchor (dy on screen, dz raises its heights)
export function compose(parts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [s, dx, dy] of parts) { x0 = Math.min(x0, dx - s.ax); y0 = Math.min(y0, dy - s.ay); x1 = Math.max(x1, dx - s.ax + s.w); y1 = Math.max(y1, dy - s.ay + s.h); }
  const G = new GBuf(x1 - x0, y1 - y0); G.ax = -x0; G.ay = -y0;
  for (const [s, dx, dy, dz = 0] of parts) G.blit(s, Math.round(G.ax + dx - s.ax), Math.round(G.ay + dy - s.ay), dz);
  return G;
}
const vr = (m, hd = 0) => m.render(hd);
// a sphere point seen by this camera (u right, v down the screen, w toward the viewer) -> world normal
const sN = (u, v, w) => [u, 0.8 * v + 0.6 * w, -0.6 * v + 0.8 * w];

// ---- limbs: trunks and branches ----------------------------------------------------------------------------
// a tapered limb along the quadratic curve p0 -> p1 (control) -> p2, half widths w0 -> w1.
// o: k (base shade), flare (root flare at the start), tex ('bark' | 'flute' | 'birch' | 'smooth' | 'ring' |
// 'diamond'), seed, f (flags), z (explicit height for limbs lying on the ground)
function limb(G, p0, p1, p2, w0, w1, B, o = {}) {
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  const n = Math.ceil(len * 1.4) + 2, seed = o.seed ?? 1, k0 = o.k ?? 0.55, tex = o.tex || 'bark';
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    const x = a * p0[0] + b * p1[0] + c * p2[0], y = a * p0[1] + b * p1[1] + c * p2[1];
    let tx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]), ty = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;                                                   // across the limb
    let w = w0 + (w1 - w0) * t;
    if (o.flare) w *= 1 + o.flare * Math.max(0, 1 - t / 0.16) ** 2;
    const s = t * len, R = Math.ceil(w + 0.5);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > w * w + 0.6) continue;
      const u = (dx * nx + dy * ny) / Math.max(0.7, w), su = nx < 0 ? -u : u;      // su: -1 on the screen-left side
      let sh = k0 - su * 0.3 - (Math.abs(nx) < 0.5 ? (ny < 0 ? -u : u) * 0.1 : 0);
      const X = Math.round(x + dx), Y = Math.round(y + dy);
      if (tex === 'bark') { const g = hash(Math.round(u * w * 0.9 + 40), Math.floor(s / 3), seed); sh += g > 0.8 ? -0.2 : g < 0.12 ? 0.12 : 0; }
      else if (tex === 'flute') { sh += Math.sin(su * w * 1.1 + seed) * 0.16 + (hash(Math.round(su * w * 1.1), Math.floor(s / 4), seed) > 0.75 ? -0.18 : 0); }
      else if (tex === 'birch') { if (hash(Math.round(u * 3), Math.floor(s / 2), seed + 3) > 0.82 && Math.abs(u) < 0.95) sh = 0.04; else if (hash(0, Math.floor(s / 3), seed) > 0.86) sh -= 0.25; }
      else if (tex === 'ring') { if (Math.floor(s) % 4 === 0) sh -= 0.25; else if (Math.floor(s) % 4 === 1 && su > 0) sh -= 0.1; }
      else if (tex === 'diamond') { if ((Math.round(s) + Math.round(u * w * 1.6) + 400) % 5 < 2 || (Math.round(s) - Math.round(u * w * 1.6) + 400) % 5 < 2) sh -= 0.28; }
      const N = [nx * u * 0.9, 0.5 + ny * u * 0.4, 0.3 - ny * u * 0.5];
      px(G, X, Y, step(B, sh, X, Y, 0.35), N, o.f ?? 0, o.z ?? -1);
    }
  }
}
// a bezier point helper for branch tips
const qpt = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]];

// ---- the foliage engine -------------------------------------------------------------------------------------
// masses -> clusters {x, y, d (paint order), r, g (shade 0..1), n (base normal), w (front-ness), gu, gv}
function massEll(lobes, rnd, cs, dens = 1.3) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const b of lobes) { const ry = b.ry ?? b.r; x0 = Math.min(x0, b.x - b.r); x1 = Math.max(x1, b.x + b.r); y0 = Math.min(y0, b.y - ry); y1 = Math.max(y1, b.y + ry); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hw = Math.max(1, (x1 - x0) / 2), hh = Math.max(1, (y1 - y0) / 2), out = [];
  for (const b of lobes) {
    const ry = b.ry ?? b.r, n = Math.max(3, Math.round(PI * b.r * ry / (cs * cs) * dens));
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, q = Math.sqrt(rnd()) * 1.02, u = Math.cos(a) * q, v = Math.sin(a) * q, w = Math.sqrt(Math.max(0, 1 - q * q));
      const x = b.x + u * b.r, y = b.y + v * ry, gu = (x - mx) / hw, gv = (y - my) / hh;
      out.push({ x, y, d: y + w * b.r * 0.9 + (b.dz || 0), r: cs * (0.72 + rnd() * 0.5), g: 0.37 - gu * 0.1 - gv * 0.12 + (w - 0.5) * 0.28 + (rnd() - 0.5) * 0.14 + (b.dg || 0), n: sN(gu * 0.75 + u * 0.25, gv * 0.6 + v * 0.3, w), w, gu, gv, ph: rnd() * TAU, edge: q > 0.84 });
    }
  }
  return out;
}
// a clipped box of foliage (hedge): front face x0..x1 from yTop+dTop down to yBot, top face above it
function massBox(x0, x1, yTop, dTop, yBot, rnd, cs, dens = 1.5) {
  const out = [], W = x1 - x0;
  const nTop = Math.round(W * dTop / (cs * cs) * dens), nFr = Math.round(W * (yBot - yTop - dTop) / (cs * cs) * dens);
  for (let i = 0; i < nTop; i++) { const x = x0 + rnd() * W, y = yTop + rnd() * dTop, gu = (x - x0) / W * 2 - 1; out.push({ x, y, d: y, r: cs * (0.7 + rnd() * 0.5), g: 0.72 - gu * 0.12 + (rnd() - 0.5) * 0.14, n: [gu * 0.25, -0.15, 1], w: 0.8, gu, gv: -1, ph: rnd() * TAU, edge: y < yTop + 2 }); }
  for (let i = 0; i < nFr; i++) { const x = x0 + rnd() * W, y = yTop + dTop + rnd() * (yBot - yTop - dTop), gu = (x - x0) / W * 2 - 1, gv = (y - yTop - dTop) / (yBot - yTop - dTop); out.push({ x, y, d: y + 100, r: cs * (0.7 + rnd() * 0.5), g: 0.5 - gu * 0.14 - gv * 0.2 + (rnd() - 0.5) * 0.14, n: [gu * 0.3, 0.85, 0.45 - gv * 0.2], w: 0.8, gu, gv, ph: rnd() * TAU, edge: Math.abs(gu) > 0.94 }); }
  return out;
}
// a cone (topiary, cypress flame): apex at (cx, yTop), base half width rb at yBot
function massCone(cx, yTop, yBot, rb, rnd, cs, dens = 1.4, round = 0.25) {
  const out = [], H = yBot - yTop, n = Math.round(rb * H / (cs * cs) * dens);
  for (let i = 0; i < n; i++) {
    const t = Math.sqrt(rnd()), y = yTop + t * H, r = rb * Math.min(1, t * (1 + round) - round * t * t), u = rnd() * 2 - 1, x = cx + u * r, w = Math.sqrt(1 - u * u);
    out.push({ x, y, d: y + w * r, r: cs * (0.7 + rnd() * 0.5), g: 0.55 - u * 0.24 - t * 0.12 + (w - 0.5) * 0.3 + (rnd() - 0.5) * 0.12, n: sN(u * 0.85, t * 0.6 - 0.3, w), w, gu: u, gv: t * 2 - 1, ph: rnd() * TAU, edge: Math.abs(u) > 0.85 });
  }
  return out;
}
// one cluster: a leafy clump lit on the upper left, falling into a dark pocket at the lower right
function cluster(G, c, R, o, seed) {
  const r = c.r, rr = Math.ceil(r * 1.25 + 1), shape = o.leaf || 'round';
  for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    const lx = dx / r, ly = dy / r, q = Math.sqrt(lx * lx + ly * ly), a = Math.atan2(ly, lx);
    let lim;
    if (shape === 'round') lim = 0.86 + 0.16 * Math.sin(a * 5 + c.ph) + (hash(dx + 9, dy + 9, seed) - 0.5) * 0.18;
    else if (shape === 'maple') lim = 0.55 + 0.6 * Math.max(0, Math.cos(a * 5 + c.ph)) ** 1.5;
    else if (shape === 'fine') lim = 0.78 + 0.22 * Math.sin(a * 7 + c.ph) - (hash(c.x + dx | 0, c.y + dy | 0, seed + 4) > 0.86 ? 0.5 : 0);
    else if (shape === 'needle') lim = 0.3 + 0.85 * Math.max(0, Math.cos(a * 6 + c.ph)) ** 5;
    else if (shape === 'scale') lim = 0.9 + 0.12 * Math.sin(a * 3 + c.ph) - (ly > 0.3 ? (hash(dx + 30, 0, seed) > 0.5 ? 0 : 0.25) : 0);
    else lim = 0.9;
    if (q > lim) continue;
    const X = Math.round(c.x + dx), Y = Math.round(c.y + dy), e = q / lim;
    let t = c.g + (-lx * 0.5 - ly * 0.62) * (o.contrast ?? 0.4);
    if (e > 0.62 && lx + ly > 0.15) t -= 0.3;                                 // the shaded rim: dark pockets where clumps overlap
    else if (e > 0.55 && lx + ly < -0.55) t += 0.22;                          // the lit tip
    const hh = hash(X, Y, seed + 1);
    if (hh > 0.94 && ly < 0.2) t += 0.12; else if (hh < 0.03) t -= 0.12;      // single leaves catching or losing the light
    const lz = Math.sqrt(Math.max(0, 1 - Math.min(1, q * q)));
    if (c.snow && ly < -0.1 + (hash(X, 0, seed + 8) - 0.5) * 0.5) { px(G, X, Y, step(SNOW, 0.55 - lx * 0.3 - ly * 0.3 + (hh > 0.9 ? -0.2 : 0), X, Y, 0.3), [lx * 0.3 - 0.1, -0.25, 1], 0, o.z ?? -1); continue; }
    pxn(G, X, Y, step(c.R || R, t, X, Y, o.dither ?? 0.22), c.n[0] * 0.45 + lx * 0.7, c.n[1] * 0.45 + (0.8 * ly + 0.6 * lz) * 0.7, c.n[2] * 0.45 + (-0.6 * ly + 0.8 * lz) * 0.7, F_LEAF, o.z ?? -1);
  }
  // leaf tips sticking out of the silhouette
  if (c.edge && o.tips !== false) {
    const k = 1 + (hash(c.x | 0, c.y | 0, seed) * 3 | 0);
    for (let i = 0; i < k; i++) {
      const a = Math.atan2(c.gv || -0.3, c.gu || 0.01) + (hash(i, c.x | 0, seed + 2) - 0.5) * 1.6, L = 1 + hash(i, c.y | 0, seed + 3) * 2;
      for (let s = 0; s <= L; s++) { const X = c.x + Math.cos(a) * (r * 0.8 + s), Y = c.y + Math.sin(a) * (r * 0.8 + s); px(G, X, Y, step(c.R || R, c.g + 0.12 - s * 0.05 + (Math.cos(a) + Math.sin(a) < 0 ? 0.12 : -0.15), X | 0, Y | 0, 0), sN(Math.cos(a), Math.sin(a), 0.5), F_LEAF, o.z ?? -1); }
    }
  }
}
// paint a crown: dark core, back clusters, then whatever goes in between (trunk and branches), then the
// front clusters with holes in the lower middle so the branches show. o: R, leaf, seed, core, mid(),
// holes (0..1), skip(c), flowers {R, k, kind, size}, fruit {R, n, r}
function paintClusters(G, cls, o) {
  const seed = o.seed ?? 1, rnd = mulberry32(seed * 31 + 5), R = o.R;
  cls.sort((a, b) => a.d - b.d);
  if (o.core) for (const c of cls) {
    const r = c.r * 1.05;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) { const X = Math.round(c.x + dx), Y = Math.round(c.y + dy); if (!has(G, X, Y)) px(G, X, Y, step(c.R || R, 0.06 + (hash(X, Y, seed) > 0.8 ? 0.12 : 0), X, Y, 0.5), sN(c.gu * 0.5, 0.5, 0.4), F_LEAF, o.z ?? -1); }
  }
  const back = cls.filter((c) => c.w < (o.backW ?? 0.32)), front = cls.filter((c) => c.w >= (o.backW ?? 0.32));
  for (const c of back) cluster(G, { ...c, g: c.g - 0.18 }, R, o, seed);
  if (o.mid) o.mid();
  if (o.snow) for (const c of front) c.snow = c.gv < 0.4 && rnd() < o.snow;
  for (const c of front) {
    if (o.holes && c.gv > 0.2 && Math.abs(c.gu) < 0.45 && rnd() < o.holes * (1 - Math.abs(c.gu) * 1.6) * Math.min(1, (c.gv - 0.2) * 3)) continue;
    if (o.skip && o.skip(c)) continue;
    cluster(G, c, R, o, seed);
  }
  if (o.flowers) { const F = o.flowers; for (const c of front) if (c.w > 0.25 && rnd() < F.k) bloom(G, c.x - c.r * 0.3 + (rnd() - 0.5) * c.r, c.y - c.r * 0.3 + (rnd() - 0.5) * c.r, F.kind || 'dot', F.R, F.size || 1, seed + (c.x | 0), o.z); }
  if (o.fruit) { const F = o.fruit; const fr = front.filter((c) => c.w > 0.35 && c.gv > -0.7); for (let i = 0; i < F.n && fr.length; i++) { const c = fr[Math.floor(rnd() * fr.length)]; fruit(G, c.x + (rnd() - 0.5) * 2, c.y + c.r * 0.3, F.r || 1.8, F.R); } }
}

// ---- flowers and fruit ------------------------------------------------------------------------------------
// a flower head at (x, y). kind: dot | star | daisy | poppy | rose | cup | magnolia | trumpet | ball | bell
function bloom(G, x, y, kind, R, s = 1, seed = 1, z = -1) {
  const P = (X, Y, t, n = [-0.2, 0.3, 0.9], f = F_LEAF) => px(G, x + X, y + Y, step(R, t, Math.round(x + X), Math.round(y + Y), 0.2), n, f, z);
  const C = (X, Y, c) => px(G, x + X, y + Y, c, [-0.2, 0.3, 0.9], F_LEAF, z);
  if (kind === 'dot') { P(0, 0, 0.75); P(1, 0, 0.55); P(0, 1, 0.45); if (s > 1) P(1, 1, 0.3); }
  else if (kind === 'star') { P(0, -1, 0.85); P(-1, 0, 0.9); P(1, 0, 0.6); P(0, 1, 0.55); P(0, 0, 1); C(0, 0, [236, 200, 90]); }
  else if (kind === 'daisy') { for (const [a, b] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, 1]]) P(a, b, a + b < 0 ? 0.9 : 0.6); C(0, 0, [232, 180, 40]); if (s > 1) { P(0, -2, 0.85); P(-2, 0, 0.85); P(2, 0, 0.6); P(0, 2, 0.55); } }
  else if (kind === 'poppy') { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) P(a, b, 0.6 - (a + b) * 0.15); P(-1, -2, 0.75); P(1, -2, 0.6); C(0, 0, [40, 24, 30]); if (s > 1) { P(-2, 0, 0.7); P(2, 0, 0.45); P(0, 2, 0.4); } }
  else if (kind === 'rose') { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) P(a, b, 0.55 - (a + b) * 0.16); P(0, 0, 0.25); P(-1, -1, 0.85); P(1, 0, 0.35); if (s > 1) { P(-2, 0, 0.6); P(2, 0, 0.35); P(0, -2, 0.7); P(0, 2, 0.3); P(-1, 1, 0.45); } }
  else if (kind === 'cup') { const w = s > 1 ? 2 : 1; for (let b = -2 - (s > 1 ? 1 : 0); b <= 1; b++) for (let a = -w; a <= w; a++) { if (s > 1 && Math.abs(a) === 2 && b < -2) continue; P(a, b, 0.62 - a / w * 0.22 - b * 0.06 + (b <= -2 && a === 0 ? -0.35 : 0)); } C(0, 2, [60, 120, 40]); }
  else if (kind === 'magnolia') { for (let b = -2; b <= 1; b++) for (let a = -2; a <= 2; a++) { if (Math.abs(a) + Math.abs(b) > 3) continue; P(a, b, 0.7 - a * 0.12 - b * 0.08 + (b === 1 && Math.abs(a) < 2 ? -0.35 : 0)); } P(0, -1, 0.2); P(-1, -2, 0.95); P(1, -2, 0.85); }
  else if (kind === 'trumpet') { for (const [a, b] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) P(a, b, 0.75 - (a + b) * 0.08); C(0, 0, [236, 150, 40]); C(1, 0, [200, 110, 30]); }
  else if (kind === 'ball') { const r = 2.6 * s; for (let b = -Math.ceil(r); b <= r; b++) for (let a = -Math.ceil(r); a <= r; a++) { const q = Math.hypot(a, b) / r; if (q > 1) continue; const fl = hash(Math.round(x + a), Math.round(y + b), seed) > 0.5; P(a, b, 0.62 - (a + b) / r * 0.28 + (fl ? 0.12 : -0.1) - (q > 0.8 && a + b > 0 ? 0.25 : 0), sN(a / r, b / r, Math.sqrt(Math.max(0, 1 - q * q)))); } }
  else if (kind === 'bell') { P(0, 0, 0.7); P(1, 0, 0.45); P(0, 1, 0.35); P(1, 1, 0.2); }
}
function fruit(G, x, y, r, R, z = -1) {
  const n = Math.ceil(r);
  for (let b = -n; b <= n; b++) for (let a = -n; a <= n; a++) { const q = Math.hypot(a, b) / r; if (q > 1.05) continue; const w = Math.sqrt(Math.max(0, 1 - q * q)); px(G, x + a, y + b, step(R, 0.55 - (a + b) / r * 0.3 + (a === -1 && b === -1 ? 0.35 : 0), Math.round(x + a), Math.round(y + b), 0.2), sN(a / r, b / r, w), 0, z); }
}

// a ramp from a ramp or a list of ramps
const pickR = (P, rnd) => (Array.isArray(P[0]) && Array.isArray(P[0][0]) ? P[Math.floor(rnd() * P.length)] : P);

// ---- strap leaves and grass blades --------------------------------------------------------------------------
// from (x, y) heading ang (0 east, -PI/2 up), length len, half width w at the base; droop turns it toward
// the ground as it goes. o: k (shade), shape(t) width profile, tipK, edge (dark margin), stripe (midrib),
// f (flags), teeth (agave edge spines)
function blade(G, x, y, ang, len, w, droop, R, o = {}) {
  const n = Math.ceil(len * 1.7) + 1, dl = len / n, k0 = o.k ?? 0.5;
  let X = x, Y = y, a = ang;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = w * (o.shape ? o.shape(t) : (1 - t) ** 0.65), nx = -Math.sin(a), ny = Math.cos(a);
    const litSide = (nx + ny) < 0 ? 1 : -1, W2 = Math.max(0, ww);
    for (let k = -Math.ceil(W2); k <= Math.ceil(W2); k += 0.5) {
      if (Math.abs(k) > W2 + 0.25) continue;
      const side = W2 > 0.6 ? k / W2 : 0;
      let sh = k0 + (t - 0.5) * (o.tipK ?? 0.35) + side * litSide * 0.2;
      if (o.stripe && Math.abs(k) < 0.6 && W2 > 1.2) sh += o.stripe;
      if (o.edge && W2 > 1.2 && Math.abs(side) > 0.75) sh -= o.edge;
      if (o.teeth && Math.abs(side) > 0.9 && i % 4 === 0) sh -= 0.4;
      const PX = X + nx * k, PY = Y + ny * k;
      px(G, PX, PY, step(R, sh, Math.round(PX), Math.round(PY), o.dither ?? 0.3), [nx * side * 0.7 + Math.cos(a) * 0.2, 0.4 + ny * side * 0.3, 0.75], o.f ?? F_LEAF, o.z ?? -1);
    }
    X += Math.cos(a) * dl; Y += Math.sin(a) * dl;
    if (droop) { const tgt = PI / 2, d = ((tgt - a + PI * 3) % TAU) - PI; a += Math.sign(d) * Math.min(Math.abs(d), droop * dl); }
  }
  return [X, Y];
}
// a thin stem (1 px) from (x, y) up to (x2, y2) with a slight bow
function stem(G, x, y, x2, y2, R, k = 0.35, bow = 0, z = -1) {
  const n = Math.ceil(Math.hypot(x2 - x, y2 - y) * 1.3) + 1;
  for (let i = 0; i <= n; i++) { const t = i / n, X = x + (x2 - x) * t + Math.sin(t * PI) * bow, Y = y + (y2 - y) * t; px(G, X, Y, step(R, k + t * 0.15, Math.round(X), Math.round(Y), 0.3), [-0.3, 0.5, 0.6], F_LEAF, z); }
}

// ---- broad leaves -------------------------------------------------------------------------------------------
// a broad leaf from its stalk end (x, y) heading ang, length len, half width wid. o: shape ('oval' | 'lance' |
// 'heart' | 'paddle' | 'round'), droop, split (monstera), tears (banana), vein spacing, k, flat (lying on the
// ground: height z), fold (how much darker the far half is)
function bigLeaf(G, x, y, ang, len, wid, R, o = {}) {
  const n = Math.ceil(len * 2) + 1, dl = len / n, shape = o.shape || 'oval', seed = o.seed ?? 1, k0 = o.k ?? 0.52;
  const prof = (t) => shape === 'lance' ? Math.sin(PI * Math.min(1, t * 1.1)) ** 0.8 * (1 - t * 0.3) : shape === 'heart' ? (t < 0.35 ? 0.75 + t * 0.7 : Math.max(0, 1 - (t - 0.35) / 0.65) ** 0.8) : shape === 'paddle' ? Math.min(1, t * 6) * (t > 0.85 ? (1 - t) / 0.15 : 1) * 0.9 + 0.1 * (t < 0.95) : shape === 'round' ? Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) : Math.sin(PI * t) ** 0.75;
  let X = x, Y = y, a = ang;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ww = wid * prof(t), nx = -Math.sin(a), ny = Math.cos(a), lit = (nx + ny) < 0 ? 1 : -1;
    for (let k = -Math.ceil(ww); k <= ww; k += 0.5) {
      const side = k / Math.max(0.5, ww), as = Math.abs(side);
      if (Math.abs(k) > ww + 0.2) continue;
      if (o.split && as > 0.3 && ((t * len * 0.55 + as * 1.4) % 2.6) < 0.55 && t > 0.12 && t < 0.92) continue;
      if (o.split && as > 0.25 && as < 0.5 && Math.abs(((t * len) % 7) - 3.5) < 0.9 && t > 0.2 && t < 0.8) continue;
      if (o.tears && as > 0.35 && hash(Math.floor(t * len * 0.9), Math.sign(k), seed) > 0.72 && ((t * len) % 1.4) < 0.5) continue;
      let sh = k0 + side * lit * (o.fold ?? 0.16) + (t - 0.4) * 0.12;
      if (as < 0.12 && ww > 1.5) sh += 0.22;                                          // the midrib
      else if (o.vein && ((t * len + as * ww * 0.9) % o.vein) < 0.8) sh -= 0.12;      // veins
      if (as > 0.82) sh -= 0.3;
      const PX = X + nx * k, PY = Y + ny * k;
      const N = o.flat ? [nx * side * 0.25, 0.05, 1] : [nx * side * 0.5 + Math.cos(a) * 0.25, 0.45 + ny * side * 0.3 + Math.sin(a) * 0.2, 0.7];
      px(G, PX, PY, step(R, sh, Math.round(PX), Math.round(PY), 0.3), N, o.f ?? F_LEAF, o.z ?? -1);
    }
    X += Math.cos(a) * dl; Y += Math.sin(a) * dl;
    if (o.droop) { const d = ((PI / 2 - a + PI * 3) % TAU) - PI; a += Math.sign(d) * Math.min(Math.abs(d), o.droop * dl); }
  }
}

// ---- conifer sprays ---------------------------------------------------------------------------------------
// a drooping fan of needles {x, y (centre top), w (half length), h (depth), s (-1 left, 1 right, 0 front), g, k}
function spray(G, s, R, o, seed) {
  const w = s.w, h = s.h;
  for (let dx = -Math.ceil(w); dx <= w; dx++) {
    const u = dx / w, tip = s.s ? clamp((u * s.s + 1) / 2, 0, 1) : 1 - Math.abs(u);
    const X = Math.round(s.x + dx);
    const top = -h * 0.45 * (1 - u * u) + (s.s ? tip * tip * h * (o.droop ?? 0.6) : 0) - (o.upturn && tip > 0.8 ? (tip - 0.8) * h * 3 : 0) + (hash(X, s.k + 7, seed) > 0.7 ? 1 : 0);
    const hang = hash(X, s.k, seed) > 0.35 ? 1 + Math.floor(hash(X, s.k + 1, seed) * (o.fringe ?? 3)) : 0;
    const bot = top + h * (0.45 + 0.45 * (1 - Math.abs(u))) + hang;
    for (let dy = Math.floor(top); dy <= bot; dy++) {
      const Y = Math.round(s.y + dy), v = (dy - top) / Math.max(1, bot - top);
      let t = v < 0.24 ? s.g + 0.46 - v * 0.7 : s.g + 0.14 - v * 0.42;
      t += (tip > 0.7 ? 0.08 : 0) + (hash(X, Y >> 1, seed + 2) > 0.75 ? 0.1 : 0) - (hash(X, s.k + 3, seed) < 0.25 && v > 0.3 ? 0.14 : 0);
      if (o.snow && v < 0.42 && hash(X >> 1, s.k, seed + 9) < o.snow + (1 - Math.abs(u)) * 0.3) { px(G, X, Y, step(SNOW, 0.7 - v * 1.1 - (s.s > 0 ? 0.2 : 0) + (hash(X, Y, 3) > 0.8 ? 0.1 : 0), X, Y, 0.3), [s.s * 0.15 - 0.2, -0.3, 1], 0); continue; }
      px(G, X, Y, step(s.R || R, t, X, Y, 0.25), [s.s * 0.35 + u * 0.3 - 0.1, 0.1 + v * 0.8, 0.95 - v * 0.8], F_LEAF);
    }
  }
}

// ---- broadleaf trees ----------------------------------------------------------------------------------------
// o: h (foot to crown top), cw / ch (crown half width / height), R, leaf, cs, dens, B (bark), tw (trunk half
// width), tex, lean, lobes (count), form ('round' | 'spread' | 'oval' | 'vase' | 'flat' | 'weep'), holes,
// base ({ kind: 'grate' | 'planter', w }), flowers, fruit, litter (colours), stems (multi-trunk count),
// kmin/kmax (branch reach), twist
export function broadleaf(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 7919 + (o.k || 0) * 13 + 3);
  const h = (o.h ?? 110) * SIZE, cw = (o.cw ?? 38) * SIZE, ch = (o.ch ?? 36) * SIZE, base = BARE ? null : o.base, bw = base ? base.w ?? 15 : 0;
  const G = sprite(cw * 2 + 30, h + 24, base ? Math.ceil(bw * 0.5) + 4 : 5);
  const cx = G.ax + (o.dx || 0) * SIZE, foot = G.ay, R = o.R || G_LEAF, B = o.B || BARK, tw = (o.tw ?? 4) * tk();
  if (base) treeBase(G, cx, foot, base, seed);
  if (o.litter) litter(G, cx, foot, bw + 10, o.litter, seed, 26);
  const ccx = cx + (o.lean || 0) * SIZE, ccy = foot - h + ch, fork = ccy + ch * (o.form === 'vase' ? 0.8 : o.form === 'spread' ? 0.5 : 0.62);
  // lobes round the crown, each fed by a branch from the fork; the lower middle is left open so the
  // branches show in the shade under the canopy
  const flat = o.form === 'flat' ? 0.5 : 1, lobes = [{ x: ccx, y: ccy - ch * 0.22, r: cw * 0.6, ry: ch * 0.55 * flat }], tips = [];
  const nl = o.lobes ?? 12, span = o.span ?? (o.form === 'spread' ? 1.85 : o.form === 'oval' ? 1.65 : 1.8);
  for (let i = 0; i < nl; i++) {
    const a = -PI / 2 + ((i + 0.5) / nl - 0.5) * TAU * span / 2 + (rnd() - 0.5) * 0.25;
    const reach = (o.kmin ?? 0.5) + rnd() * ((o.kmax ?? 0.64) - (o.kmin ?? 0.5));
    const low = Math.sin(a) > 0.2, lx = ccx + Math.cos(a) * cw * reach * (low ? 1.05 : 1), ly = ccy + Math.sin(a) * ch * reach * flat * (low ? 1.2 : 1);
    const r = cw * (0.24 + rnd() * 0.14) * (o.form === 'oval' ? 0.85 : 1) * (low ? 0.9 : 1);
    lobes.push({ x: lx, y: ly, r, ry: r * 0.92 * flat, dz: low ? -4 : 0 });
    tips.push([lx, ly + r * 0.2]);
  }
  if (o.extra) lobes.push(...o.extra(ccx, ccy));
  const cls = massEll(lobes, rnd, (o.cs ?? 4.4) * sq(), o.dens ?? 1.3);
  const stems = o.stems || 1, bk = o.bk ?? 0.55, btex = o.tex === 'birch' ? 'birch' : o.tex === 'smooth' ? 'smooth' : 'bark';
  // trunk(s) up to the fork, then two or three main limbs in a Y, each feeding the lobe tips on its side
  const mid = () => {
    for (let s = 0; s < stems; s++) {
      const off = stems > 1 ? (s - (stems - 1) / 2) * (o.spread ?? 5) : 0, sx = cx + off, topx = ccx + off * 1.6 + (o.twist ? Math.sin(seed + s) * o.twist : 0);
      const fy = fork - (stems > 1 ? rnd() * ch * 0.4 : 0), tw0 = tw * (stems > 1 ? 0.75 : 1);
      limb(G, [sx, foot + 1], [sx + (o.twist ? (rnd() - 0.5) * o.twist * 2 : (rnd() - 0.5) * 3), (foot + fy) / 2], [topx, fy], tw0, tw0 * 0.8, B, { flare: o.flare ?? 0.45, seed: seed + s, tex: o.tex || 'bark', k: bk });
      const nm = stems > 1 ? 2 : 2 + (rnd() < 0.5 ? 1 : 0), mains = [];
      for (let m = 0; m < nm; m++) {
        const u = nm === 2 ? (m ? 1 : -1) * (0.55 + rnd() * 0.2) : (m - 1) * 0.75 + (rnd() - 0.5) * 0.2;
        const ex = topx + u * cw * 0.42 * (stems > 1 ? 0.6 : 1), ey = ccy - ch * (0.05 + rnd() * 0.25) + Math.abs(u) * ch * 0.15;
        mains.push([ex, ey, u]);
        limb(G, [topx + u * tw0 * 0.4, fy + 1], [topx + u * cw * 0.12, (fy + ey) / 2 + 3], [ex, ey], tw0 * 0.62, Math.max(0.8, tw0 * 0.28), B, { seed: seed + m * 7 + s, tex: btex, k: bk - 0.05 });
      }
      for (let i = s; i < tips.length; i += stems) {
        const [tx, ty] = tips[i];
        let best = mains[0]; for (const mm of mains) if (Math.abs(mm[0] - tx) + Math.abs(mm[1] - ty) * 0.5 < Math.abs(best[0] - tx) + Math.abs(best[1] - ty) * 0.5) best = mm;
        const st = qpt([topx, fy], [topx + best[2] * cw * 0.12, (fy + best[1]) / 2 + 3], [best[0], best[1]], 0.45 + rnd() * 0.4);
        limb(G, st, [(st[0] + tx) / 2 + (rnd() - 0.5) * 5, (st[1] + ty) / 2 + 2], [tx, ty], Math.max(0.9, tw0 * 0.3), 0.6, B, { seed: seed + i, tex: btex, k: bk - 0.12 });
      }
    }
  };
  paintClusters(G, cls, { R, leaf: o.leaf, seed, core: !o.airy, mid, holes: o.holes ?? 0.55, flowers: o.flowers, fruit: o.fruit, dither: o.dither, skip: o.airy ? () => rnd() < o.airy : null });
  if (o.weep) weepCurtains(G, ccx, ccy, cw, ch, foot, R, seed, o.weep);
  return done(G);
}
// a willow's hanging curtains of fine leaves from the crown's edge down toward the ground
function weepCurtains(G, cx, cy, cw, ch, foot, R, seed, k = 1) {
  const rnd = mulberry32(seed * 41 + 9), n = Math.round(cw * 3.6 * k);
  const strands = [];
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1; strands.push({ u, d: Math.sqrt(1 - u * u) * rnd() }); }
  strands.sort((a, b) => a.d - b.d);
  for (const st of strands) {
    const u = st.u, sx = cx + u * cw * 1.02, y0 = cy - ch * 0.35 + Math.abs(u) * ch * 0.55 + rnd() * ch * 0.4;
    const len = (foot - 6 - y0) * (0.45 + rnd() * 0.5) * (1 - Math.abs(u) * 0.25), sway = (rnd() - 0.5) * 4 + u * 3;
    const g = 0.5 - u * 0.2 + st.d * 0.25 - 0.1;
    for (let k2 = 0; k2 < len; k2++) {
      const t = k2 / len, x = sx + sway * t * t, y = y0 + k2;
      if (hash(Math.round(x), Math.round(y), seed) < 0.12) continue;
      const leafy = (k2 + (rnd() * 3 | 0)) % 3 === 0;
      const tt = g + (leafy ? 0.22 : 0) - t * 0.18 + (hash(Math.round(x), Math.round(y), seed + 3) > 0.85 ? 0.15 : 0);
      px(G, x, y, step(R, tt, Math.round(x), Math.round(y), 0.4), [u * 0.5 - 0.15, 0.55, 0.55], F_LEAF);
      if (leafy) px(G, x + (u < 0 ? -1 : 1), y + 1, step(R, tt - 0.12, Math.round(x), Math.round(y), 0.4), [u * 0.6, 0.6, 0.5], F_LEAF);
    }
  }
}
// tree base: a square iron grate on the pavement, or a low stone planter with soil and small plants
function treeBase(G, cx, foot, b, seed) {
  const s = b.w ?? 15, d = Math.round(s * 0.62);
  if (b.kind === 'grate') {
    for (let y = -d; y <= d; y++) for (let x = -s; x <= s; x++) {
      const e = Math.max(Math.abs(x) / s, Math.abs(y) / d), ring = Math.max(Math.abs(x), Math.abs(y) * s / d);
      const edge = Math.abs(x) >= s - 1 || Math.abs(y) >= d - 1, inner = e < 0.3;
      const c = inner ? step(SOIL, 0.25 + hash(x, y, seed) * 0.3, x, y, 0.5) : edge ? step(IRON, 0.55 - y / d * 0.2, x, y, 0) : (Math.round(ring) % 3 === 0 || (Math.abs(x) === Math.abs(Math.round(y * s / d)) && e > 0.35)) ? step(IRON, 0.4, x, y, 0) : step(IRON, 0.05, x, y, 0);
      px(G, cx + x, foot + y, c, [0, 0, 1], F_GROUND | F_WET, 0);
    }
    return;
  }
  const hp = b.h ?? 4;
  for (let y = -d - hp; y <= d; y++) for (let x = -s; x <= s; x++) {
    const X = cx + x, Y = foot + y, front = y > d - hp, rim = !front && (Math.abs(x) >= s - 1 || y <= -d - hp + 1 || y >= d - hp);
    if (front) { const row = d - y, joint = ((x + (row > 2 ? 4 : 0)) % 8 + 8) % 8 === 0 || row === 2; px(G, X, Y, step(STONE, 0.36 - (row < 2 ? 0.08 : 0) - (joint ? 0.16 : 0) - x / s * 0.08, X, Y, 0.3), [0, 0.9, 0.35], 0, row); }
    else if (rim) px(G, X, Y, step(STONE, 0.56 - x / s * 0.1 + (hash(X, Y, seed) > 0.85 ? -0.12 : 0) + (y <= -d - hp + 1 ? 0.08 : 0), X, Y, 0.3), [0, -0.1, 1], 0, hp);
    else px(G, X, Y, step(SOIL, 0.25 + hash(X, Y, seed) * 0.25, X, Y, 0.4), [0, 0, 1], F_GROUND, hp - 1);
  }
  // low leafy plants round the trunk
  const rnd = mulberry32(seed + 77), cls = [];
  for (let i = 0; i < s * 1.3; i++) { const x = cx + (rnd() * 2 - 1) * (s - 3), y = foot - hp + (rnd() * 2 - 1) * (d - 2.5); if (Math.abs(x - cx) < 3.5) continue; cls.push({ x, y: y - 1.5, d: y, r: 1.6 + rnd() * 1.1, g: 0.55 - (x - cx) / s * 0.15 + (rnd() - 0.5) * 0.2, n: [0, 0.3, 1], w: 0.8, gu: (x - cx) / s, gv: -0.5, ph: rnd() * TAU, edge: rnd() < 0.4 }); }
  paintClusters(G, cls, { R: G_LEAF, seed, leaf: 'maple', z: hp + 2 });
}
// fallen leaves / petals on the ground round a base
function litter(G, cx, foot, r, cols, seed, n = 30) {
  const rnd = mulberry32(seed * 3 + 11);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, q = 0.4 + rnd() * 0.75, x = Math.round(cx + Math.cos(a) * r * q * 1.2), y = Math.round(foot + Math.sin(a) * r * q * 0.55); if (has(G, x, y)) continue; const c = cols[Math.floor(rnd() * cols.length)]; px(G, x, y, c, [0, 0, 1], F_GROUND, 0); if (rnd() > 0.5 && !has(G, x + 1, y)) px(G, x + 1, y, c.map((v) => v * 0.78), [0, 0, 1], F_GROUND, 0); }
}

// ---- conifers ---------------------------------------------------------------------------------------------
// o: h, r (half width at the bottom whorl), R, B, tw, form ('cone' | 'narrow' | 'column' | 'redwood' | 'larch' |
// 'cedar'), sp (whorl spacing), sw (spray half length), bare (bottom fraction without boughs), snow, sparse,
// droop, upturn, fringe
export function conifer(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 3301 + (o.k || 0) * 7 + 9);
  const h = (o.h ?? 120) * SIZE, r = (o.r ?? 30) * SIZE, form = o.form || 'cone', R = o.R || FOL('#33663a'), B = o.B || BARK;
  const G = sprite(r * 2 + 30, h + 16, 5), cx = G.ax, foot = G.ay, top = foot - h, tw = (o.tw ?? 2.6) * tk();
  const sp = (o.sp ?? 5) * Math.pow(SIZE, 0.6), bare = o.bare ?? 0.12, sprays = [];
  const prof = (t) => form === 'narrow' ? Math.pow(1 - t, 0.75) * (0.75 + 0.25 * Math.min(1, t * 6)) : form === 'column' ? (1 - t ** 3) * 0.75 : form === 'redwood' ? 0.45 + 0.25 * Math.sin(t * 9 + seed) : form === 'cedar' ? Math.pow(1 - t, 0.8) * (0.8 + 0.2 * Math.min(1, t * 4)) : Math.pow(1 - t, 0.95);
  let tier = 0;
  const twigsB = [], twigsF = [];
  for (let y = foot - h * bare; y > top + 3; y -= sp * (0.85 + rnd() * 0.3)) {
    const t = (foot - y) / h, Rw = r * prof(t) + 2;
    const nb = form === 'redwood' ? (rnd() < 0.45 ? 0 : 1 + (rnd() * 2 | 0)) : 2 + (rnd() < 0.7 ? 1 : 0) + (Rw > 14 && rnd() < 0.6 ? 1 : 0);
    for (let b = 0; b < nb; b++) {
      if (o.sparse && rnd() < o.sparse) continue;
      const side = b === 0 ? -1 : b === 1 ? 1 : rnd() < 0.5 ? -1 : 1, depth = b < 2 ? (rnd() - 0.5) * 0.5 : b === 2 ? 0.8 : -0.8;
      const L = Rw * (b < 2 ? 0.62 + rnd() * 0.5 : 0.35 + rnd() * 0.4), sw = (o.sw ?? clamp(2.6 + Rw / SIZE * 0.11, 2.8, 5.4)) * Math.pow(SIZE, 0.6), dy = (o.droop ?? 0.35) * L * 0.45;
      const ns = Math.max(1, Math.round(L / (sw * 1.6)));
      const ex = cx + side * L * (b < 2 ? 1 : 0.85), ey = y + dy + (depth > 0 ? 2 : 0);
      (depth > 0 ? twigsF : twigsB).push([[cx, y], [(cx + ex) / 2, y + dy * 0.2], [ex - side * sw, ey]]);
      for (let i = 0; i < ns; i++) {
        const q = (i + 1) / ns, x = cx + side * (q * L - sw * 0.6) * (b < 2 ? 1 : 0.85), yy = y + dy * q * q + (depth > 0 ? 2 : 0) + (rnd() - 0.5) * 1.4;
        const gu = (x - cx) / Math.max(8, r);
        sprays.push({ x, y: yy, w: sw * (0.8 + rnd() * 0.3) * (0.7 + 0.3 * q), h: sw * (0.8 + rnd() * 0.3), s: i === 0 && L < sw * 1.5 ? 0 : side, g: (o.g ?? 0.3) - gu * 0.12 + t * 0.08 + depth * 0.1 + (rnd() - 0.5) * 0.12, k: tier * 31 + b * 7 + i, tier, depth });
      }
    }
    tier++;
  }
  // a leader at the top
  sprays.push({ x: cx, y: top + 3, w: 1.6, h: 5, s: 0, g: (o.g ?? 0.3) + 0.25, k: 999, tier: tier + 1, depth: 0 });
  const backS = sprays.filter((s) => s.depth < -0.2), frontS = sprays.filter((s) => s.depth >= -0.2);
  const order = (a, b) => (a.tier - b.tier) || (a.depth - b.depth);
  backS.sort(order); frontS.sort(order);
  for (const s of backS) spray(G, { ...s, g: s.g - 0.15 }, R, o, seed);
  for (const [a, b, c] of twigsB) limb(G, a, b, c, 0.9, 0.5, B, { seed, k: 0.3 });
  limb(G, [cx, foot + 1], [cx + (rnd() - 0.5) * 2, foot - h * 0.5], [cx, top + 4], tw, Math.max(0.6, tw * 0.25), B, { flare: o.flare ?? 0.7, seed, tex: o.tex || 'bark' });
  for (const [a, b, c] of twigsF) limb(G, a, b, c, 0.9, 0.5, B, { seed, k: 0.3 });
  if (o.roots) for (const s of [-1, 1, -0.5, 0.6]) limb(G, [cx + s * tw * 0.6, foot - tw * 1.2], [cx + s * tw * 1.4, foot - 2], [cx + s * (tw * 1.9 + 3), foot + 1], tw * 0.45, 1, B, { seed: seed + 5, tex: o.tex || 'bark' });
  for (const s of frontS) spray(G, s, R, o, seed);
  if (o.base) o.base(G, cx, foot);
  return done(G);
}

// ---- shrubs and masses ------------------------------------------------------------------------------------
// a rounded shrub: o: w (half width), h (height), R, leaf, cs, flowers, fruit, twigs (bare twigs poking out),
// lobes, stems (visible woody stems under it), flat (mound)
export function shrub(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 1201 + (o.k || 0) * 5 + 7);
  const w = o.w ?? 14, h = o.h ?? 18, G = sprite(w * 2 + 16, h + 14, 5), cx = G.ax, foot = G.ay, R = o.R || G_LEAF;
  const lobes = [{ x: cx, y: foot - h * 0.5, r: w * 0.8, ry: h * 0.48 }];
  for (let i = 0; i < (o.lobes ?? 5); i++) { const a = -PI + (i + 0.5) / (o.lobes ?? 5) * PI + (rnd() - 0.5) * 0.4, rr = Math.min(w, h) * (0.38 + rnd() * 0.18); lobes.push({ x: cx + Math.cos(a) * w * 0.55, y: foot - h * 0.5 + Math.sin(a) * h * 0.38, r: rr, ry: rr * (o.squash ?? 0.9) }); }
  const cls = massEll(lobes, rnd, o.cs ?? 3, o.dens ?? 1.4);
  const mid = () => {
    if (o.stems) for (let i = 0; i < o.stems; i++) { const x = cx + (rnd() * 2 - 1) * w * 0.5; limb(G, [cx + (rnd() - 0.5) * 3, foot], [(cx + x) / 2, foot - h * 0.25], [x, foot - h * (0.45 + rnd() * 0.3)], 1.1, 0.5, o.B || BARK, { seed: seed + i, k: 0.4 }); }
  };
  paintClusters(G, cls, { R, leaf: o.leaf, seed, core: !o.airy, mid, holes: o.holes ?? 0, flowers: o.flowers, fruit: o.fruit, snow: o.snowClumps, skip: o.airy ? () => rnd() < o.airy : null });
  if (o.twigs) for (let i = 0; i < o.twigs; i++) { const a = -PI * (0.15 + rnd() * 0.7), L = w * (0.3 + rnd() * 0.35), x0 = cx + Math.cos(a) * w * 0.6, y0 = foot - h * 0.55 + Math.sin(a) * h * 0.4; limb(G, [x0, y0], [x0 + Math.cos(a) * L * 0.5, y0 + Math.sin(a) * L * 0.5 - 1], [x0 + Math.cos(a) * L, y0 + Math.sin(a) * L], 0.7, 0.4, o.twigR || RR('#8a3a2e', 6, 3), { seed, tex: 'smooth' }); }
  if (o.snow) snowCap(G, o.snow, seed);
  if (o.after) o.after(G, cx, foot);
  return done(G);
}
// snow resting on the tops of a sprite's foliage: pixels whose pixel above is empty (or snow) turn white
function snowCap(G, k = 0.6, seed = 1) {
  const W = G.w, H = G.h, mark = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H; y++) {
      const i = y * W + x, a = G.col[i * 4 + 3];
      if (!a) { run = 0; continue; }
      if (run === 0 && (G.flag[i] & F_LEAF) && hash(x >> 1, y >> 2, seed) < k) run = 2 + (hash(x, y, seed + 1) * 2.5 | 0);
      if (run > 0) { mark[i] = run; run--; if (run === 0) run = -1; }
    }
  }
  for (let i = 0; i < W * H; i++) if (mark[i]) { const x = i % W, y = (i / W) | 0; px(G, x, y, step(SNOW, 0.45 + mark[i] * 0.12 - (hash(x, y, 2) > 0.85 ? 0.15 : 0), x, y, 0.3), [-0.15, -0.2, 1], 0, G.lz[i]); }
}

// ---- city plants (E3a) ---------------------------------------------------------------------------------------
const LIT_GOLD = [[220, 170, 50], [196, 132, 40], [232, 196, 80]], LIT_PINK = [[240, 180, 200], [226, 150, 176], [250, 222, 230]], LIT_RED = [[196, 52, 40], [160, 40, 36], [220, 96, 56]];
export const streetTree = (seed = 1, base = 'planter') => broadleaf(seed, { h: 112, cw: 40, ch: 47, R: FOL('#4a8428'), cs: 5.2, dens: 0.9, base: { kind: base, w: 15 }, litter: LIT_GOLD });
export const flowerTree = (seed = 1) => broadleaf(seed, { h: 110, cw: 39, ch: 46, R: FOL('#55882c'), cs: 5, dens: 0.9, base: { kind: 'planter', w: 15 }, flowers: { R: RR('#f8f4ea', 5, 3, { dark: 0.3, light: 0.7 }), k: 0.2, kind: 'star' }, litter: [[240, 236, 220], [220, 210, 190]], k: 1 });
export const youngTree = (seed = 1) => broadleaf(seed, { h: 104, cw: 21, ch: 42, R: FOL('#5a8a2a'), cs: 3.6, base: { kind: 'grate', w: 14 }, form: 'oval', tw: 1.8, lobes: 7, holes: 0.85, dens: 1.0, kmin: 0.5, kmax: 0.8, k: 2 });
export const ginkgo = (seed = 1) => broadleaf(seed, { h: 110, cw: 36, ch: 47, dens: 0.95, R: FOL('#e8a818', { cool: 12, shiftD: 0.5, dark: 0.66 }), cs: 4.4, leaf: 'maple', base: { kind: 'planter', w: 15 }, litter: LIT_GOLD, form: 'oval', k: 3 });
export const cherryTree = (seed = 1) => broadleaf(seed, { h: 106, cw: 39, ch: 45, dens: 0.95, R: FOL('#e890b6', { cool: 290, shiftD: 0.3, warm: 20, shift: 0.3, light: 0.6, dark: 0.6 }), cs: 4.4, leaf: 'maple', base: { kind: 'planter', w: 15 }, flowers: { R: RR('#fff2f6', 4, 2), k: 0.3, kind: 'dot' }, litter: LIT_PINK, holes: 0.7, k: 4 });
export const magnoliaTree = (seed = 1) => broadleaf(seed, { h: 106, cw: 37, ch: 45, R: FOL('#2e6a34'), cs: 5, dens: 0.9, base: { kind: 'planter', w: 15 }, flowers: { R: RR('#f6eee2', 5, 2, { dark: 0.4 }), k: 0.28, kind: 'magnolia' }, litter: [[240, 232, 220], [226, 200, 200]], k: 5 });
export const redMaple = (seed = 1) => broadleaf(seed, { h: 106, cw: 37, ch: 45, dens: 0.95, R: FOL('#c42c22', { cool: 320, shiftD: 0.35, warm: 36, shift: 0.6 }), cs: 4.4, leaf: 'maple', base: { kind: 'planter', w: 15 }, litter: LIT_RED, k: 6 });
// a clipped hedge on a low stone curb
export function hedge(seed = 1, len = 64, hgt = 26, o = {}) {
  const rnd = mulberry32(seed * 17 + 3), d = 12, G = sprite(len + 12, hgt + d + 14, 6), cx = G.ax, foot = G.ay;
  const x0 = cx - len / 2, x1 = cx + len / 2, curb = o.curb ?? 3;
  if (curb) for (let y = foot - 1 - curb; y <= foot + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) { const top = y < foot - curb + 1; px(G, x, y, step(STONE, top ? 0.7 : 0.38 - (x % 9 === 0 ? 0.15 : 0), x, y, 0.3), top ? [0, -0.1, 1] : [0, 0.9, 0.35], 0, top ? curb : foot + 2 - y); }
  const yb = foot - curb - 1, yt = yb - hgt - d;
  const cls = massBox(x0 + 2, x1 - 2, yt + 2, d, yb - 1, rnd, o.cs ?? 2.6, 1.7);
  paintClusters(G, cls, { R: o.R || FOL('#3e7626'), seed, core: true, flowers: o.flowers, leaf: o.leaf });
  return done(G);
}
// a square planter (stone or wooden) whose soil top sits `h` above the ground: returns [G, soil y, foot]
function planterSprite(G, cx, foot, w, d, h, kind = 'stone', seed = 1) {
  const M = kind === 'wood' ? RR('#8a6440', 6, 3) : kind === 'terracotta' ? RR('#b8603e', 6, 3) : STONE;
  for (let y = foot - h - d; y <= foot; y++) for (let x = cx - w; x <= cx + w; x++) {
    const front = y > foot - h, rim = !front && (Math.abs(x - cx) >= w - 1 || y <= foot - h - d + 1 || y >= foot - h - 1);
    if (front) { const row = foot - y; let t = 0.45 - (x - cx) / w * 0.1 - (row < 2 ? 0.12 : 0) + (row === h - 1 ? 0.18 : 0); if (kind === 'stone' && ((row % 4 === 0) || ((x + (Math.floor(row / 4) % 2) * 5) % 10 === 0))) t -= 0.14; if (kind === 'wood' && row % 3 === 0) t -= 0.18; px(G, x, y, step(M, t, x, y, 0.3), [0, 0.92, 0.35], 0, row); }
    else if (rim) px(G, x, y, step(M, 0.72 - (x - cx) / w * 0.1, x, y, 0.3), [0, -0.1, 1], 0, h);
    else px(G, x, y, step(SOIL, 0.25 + hash(x, y, seed) * 0.25, x, y, 0.3), [0, 0, 1], 0, h - 1);
  }
  return foot - h - d / 2;
}
export function topiaryBall(seed = 1) {
  const rnd = mulberry32(seed * 23 + 1), G = sprite(40, 64, 5), cx = G.ax, foot = G.ay;
  const soil = planterSprite(G, cx, foot, 10, 8, 12, 'stone', seed);
  limb(G, [cx, soil + 2], [cx, soil - 6], [cx, soil - 10], 1.2, 1, BARK, { seed });
  paintClusters(G, massEll([{ x: cx, y: soil - 20, r: 13, ry: 12.5 }], rnd, 2.6, 1.7), { R: FOL('#4c8a2a'), seed, core: true });
  return done(G);
}
export function topiaryCone(seed = 1) {
  const rnd = mulberry32(seed * 29 + 1), G = sprite(40, 74, 5), cx = G.ax, foot = G.ay;
  const soil = planterSprite(G, cx, foot, 10, 8, 10, 'stone', seed);
  paintClusters(G, massCone(cx, soil - 50, soil + 1, 10.5, rnd, 2.5, 1.8, 0.1), { R: FOL('#3e7a30'), seed, core: true });
  return done(G);
}
export const roseBush = (seed = 1) => shrub(seed, { w: 17, h: 26, R: FOL('#3a7228'), cs: 3, flowers: { R: RR('#c8243a', 6, 3, { light: 0.55 }), k: 0.13, kind: 'rose', size: 1 } });
export const hydrangea = (seed = 1) => shrub(seed, { w: 20, h: 25, R: FOL('#3a7230'), cs: 3.2, flowers: { R: RR('#5a6ad8', 6, 3, { light: 0.6, shift: 0.15 }), k: 0.075, kind: 'ball', size: 1.25 }, k: 1 });
export function lavender(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 37 + 5), G = sprite(64, 60, 5), cx = G.ax, foot = G.ay;
  const L = FOL('#7a9a7a', { shift: 0.2 }), P = RR(o.flower || '#8a62c8', 6, 3, { light: 0.55, shift: 0.12 });
  for (let i = 0; i < 60; i++) { const a = -PI / 2 + (rnd() - 0.5) * 2.4; blade(G, cx + (rnd() - 0.5) * 10, foot - 1, a, 10 + rnd() * 10, 0.8, 0.02, L, { k: 0.35 + rnd() * 0.3 }); }
  for (let i = 0; i < (o.n ?? 30); i++) {
    const a = -PI / 2 + (rnd() - 0.5) * 1.6, len = 24 + rnd() * 16, x0 = cx + (rnd() - 0.5) * 8;
    const [ex, ey] = blade(G, x0, foot - 2, a, len * 0.7, 0.4, 0, L, { k: 0.3 });
    for (let k = 0; k < 11; k++) { const X = ex + Math.cos(a) * k * 0.9, Y = ey + Math.sin(a) * k * 0.9; px(G, X, Y, step(P, 0.75 - k * 0.04 + (k % 2 ? -0.25 : 0), X | 0, Y | 0, 0), [-0.3, 0.3, 0.9]); if (k % 2 === 0) px(G, X + 1, Y, step(P, 0.4, X | 0, Y | 0, 0), [0.4, 0.4, 0.8]); }
  }
  return done(G);
}
// flowers on stems out of a planter or the ground. o: n, kind (bloom kind), R (flower ramp), h (stem
// height), spread, leaves ('blade' | 'clump'), planter (w, d, h, kind)
export function flowerBed(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 43 + (o.k || 0)), sw = o.spread ?? 16, G = sprite(sw * 2 + 22, (o.h ?? 14) + 34, 6), cx = G.ax, foot = G.ay;
  let soil = foot, pz = 0;
  if (o.planter) { soil = planterSprite(G, cx, foot, o.planter.w, o.planter.d, o.planter.h, o.planter.kind, seed) + o.planter.d * 0.3; pz = o.planter.h; }
  const L = o.L || FOL('#3e8030');
  const stems = [];
  for (let i = 0; i < (o.n ?? 9); i++) stems.push({ x: cx + (i / Math.max(1, (o.n ?? 9) - 1) * 2 - 1) * sw * 0.85 + (rnd() - 0.5) * 3, y: soil - (rnd() * (o.planter ? o.planter.d * 0.5 : 6)), h: (o.h ?? 14) * (0.75 + rnd() * 0.4) });
  stems.sort((a, b) => a.y - b.y);
  for (const s of stems) {
    if (o.leaves !== 'clump') { for (const sg of [-1, 1]) blade(G, s.x, s.y, -PI / 2 + sg * (0.35 + rnd() * 0.3), s.h * (0.45 + rnd() * 0.25), o.lw ?? 1.2, 0.03, L, { k: 0.45, z: pz >= 0 ? -1 : -1 }); }
    stem(G, s.x, s.y, s.x + (rnd() - 0.5) * 3, s.y - s.h, L, 0.35);
  }
  if (o.leaves === 'clump') { const cls = massEll([{ x: cx, y: soil - 4, r: sw, ry: 6 }], rnd, 2.6, 1.4); paintClusters(G, cls, { R: L, seed, core: true }); }
  for (const s of stems) { const R = pickR(o.R, rnd); bloom(G, s.x + (rnd() - 0.5) * 2, s.y - s.h, o.kind || 'cup', R, o.size || 1, seed); }
  if (o.after) o.after(G, cx, foot, soil);
  return done(G);
}
export const tulipPlanter = (seed = 1) => flowerBed(seed, { n: 10, kind: 'cup', size: 2, R: [RR('#e0302a', 5, 2, { light: 0.6 }), RR('#e8902a', 5, 2), RR('#d8243a', 5, 2)], h: 19, spread: 20, lw: 1.6, planter: { w: 22, d: 9, h: 7, kind: 'stone' } });
export const daffodilPlanter = (seed = 1) => flowerBed(seed, { n: 10, kind: 'trumpet', R: [RR('#f0d040', 5, 2, { light: 0.6 }), RR('#f4f0e0', 5, 2, { dark: 0.4 })], h: 18, spread: 20, lw: 1.5, planter: { w: 22, d: 9, h: 7, kind: 'stone' }, k: 1 });
// window / flower box: 'stone' (trailing ivy, mixed flowers) or 'iron' (black frame with a terracotta trough)
export function flowerBox(seed = 1, kind = 'stone') {
  const rnd = mulberry32(seed * 47 + 3), G = sprite(70, 46, 5), cx = G.ax, foot = G.ay, w = 29, d = 9;
  const fl = kind === 'stone' ? [RR('#e040a0', 5, 2), RR('#f4f0ec', 5, 2, { dark: 0.4 }), RR('#b048c0', 5, 2), RR('#e86aa0', 5, 2)] : [RR('#d8282a', 5, 2, { light: 0.55 })];
  let top;
  if (kind === 'iron') {
    const hh = 11, y0 = foot - hh;
    for (let y = y0 - d; y <= foot; y++) for (let x = cx - w; x <= cx + w; x++) {
      const front = y > y0, X = x - cx;
      if (front) { const row = foot - y; if (row < 3) { if (Math.abs(X) === w || Math.abs(X) === w - 6 || row === 2 || (X % 8 === 0)) px(G, x, y, step(IRON, 0.45, x, y, 0), [0, 0.9, 0.3], 0, row); continue; } if (Math.abs(X) > w - 2) { px(G, x, y, step(IRON, 0.4, x, y, 0), [0, 0.9, 0.3], 0, row); continue; } px(G, x, y, step(RR('#b85a36', 6, 3), 0.48 - X / w * 0.1 - (row === hh - 1 ? -0.2 : 0) - (row < 5 ? 0.15 : 0), x, y, 0.3), [0, 0.92, 0.35], 0, row); }
      else if (Math.abs(X) >= w - 1 || y <= y0 - d + 1) px(G, x, y, step(IRON, 0.5, x, y, 0), [0, -0.1, 1], 0, hh);
      else px(G, x, y, step(SOIL, 0.3, x, y, 0.3), [0, 0, 1], 0, hh - 1);
    }
    top = y0 - d / 2;
  } else top = planterSprite(G, cx, foot, w, d, 14, 'stone', seed);
  const cls = massEll([{ x: cx, y: top - 3, r: w - 2, ry: 6.5 }, { x: cx - 12, y: top - 5, r: 9 }, { x: cx + 12, y: top - 5, r: 9 }], rnd, 2.5, 1.5);
  paintClusters(G, cls, { R: FOL('#3e7a2c'), seed, core: true });
  for (let i = 0; i < 16; i++) { const x = cx - w + 3 + rnd() * (w * 2 - 6), y = top - 4 - rnd() * 8; bloom(G, x, y, kind === 'iron' ? 'rose' : 'daisy', fl[Math.floor(rnd() * fl.length)], 1, seed); }
  if (kind === 'stone') for (let i = 0; i < 7; i++) { const x = cx - w + 2 + rnd() * (w * 2 - 4); for (let k = 0; k < 4 + rnd() * 9; k++) { const X = x + Math.sin(k * 0.6 + i) * 1.2, Y = top + 2 + k; px(G, X, Y, step(G_DARK, 0.5 + (k % 2 ? 0.15 : -0.1), X | 0, Y, 0.3), [-0.2, 0.6, 0.6]); if (k % 2) px(G, X + 1, Y, step(G_DARK, 0.35, X | 0, Y, 0.3), [0.2, 0.6, 0.6]); } }
  return done(G);
}
// a stone wall (front face + coping) for climbers: returns the wall's face rectangle
function stoneWall(G, cx, foot, w, h, seed) {
  const d = 6;
  for (let y = foot - h - d; y <= foot; y++) for (let x = cx - w; x <= cx + w; x++) {
    const front = y > foot - h, X = x - cx;
    if (front) {
      const row = foot - y, course = Math.floor(row / 5), lx = ((X + 200 + (course % 2) * 6) % 12), ly = row % 5;
      let t = 0.48 - X / w * 0.08 + (hash(Math.floor((X + 200 + (course % 2) * 6) / 12), course, seed) - 0.5) * 0.18;
      if (ly === 0 || lx === 0) t -= 0.25; else if (ly === 4 || lx === 1) t += 0.08;
      if (row >= h - 2) t += 0.12;
      px(G, x, y, step(STONE, t, x, y, 0.3), [0, 0.92, 0.35], 0, row);
    } else px(G, x, y, step(STONE, 0.74 - X / w * 0.1 + (hash(x >> 2, y, seed) > 0.8 ? -0.12 : 0) + (y === foot - h - d ? -0.1 : 0), x, y, 0.3), [0, -0.15, 1], 0, h);
  }
}
export function ivyWall(seed = 1) {
  const rnd = mulberry32(seed * 53 + 1), w = 44, h = 50, G = sprite(w * 2 + 16, h + 30, 5), cx = G.ax, foot = G.ay;
  stoneWall(G, cx, foot, w, h, seed);
  const V = RR('#6a5030', 5, 2), L = FOL('#3a7a2a');
  const cls = [];
  for (let i = 0; i < 14; i++) {
    let x = cx - w + 4 + i * 6.4 + (rnd() - 0.5) * 6, y = foot - h - 4 - rnd() * 3; const len = 16 + rnd() * (h * 0.9);
    for (let k = 0; k < len; k++) { x += Math.sin(k * 0.3 + i * 2) * 0.6; y += 1; if (y > foot) break; px(G, x, y, step(V, 0.4, x | 0, y | 0, 0), [-0.2, 0.8, 0.4], 0, foot - y); if (k % 2 === 0) cls.push({ x: x + (rnd() - 0.5) * 8, y: y + (rnd() - 0.5) * 3, d: y, r: 2.4 + rnd() * 1.2, g: 0.55 + (rnd() - 0.5) * 0.25 - (x - cx) / w * 0.1, n: [0, 0.85, 0.55], w: 0.7, gu: 0, gv: 0, ph: rnd() * TAU, edge: false }); }
  }
  for (let i = 0; i < 26; i++) cls.push({ x: cx - w + rnd() * w * 2, y: foot - h - 6 + rnd() * 8, d: 0, r: 2.6 + rnd(), g: 0.66, n: [0, 0.2, 1], w: 0.7, gu: 0, gv: -1, ph: rnd() * TAU, edge: true });
  paintClusters(G, cls, { R: L, seed, leaf: 'maple' });
  return done(G);
}
export function wisteriaWall(seed = 1) {
  const rnd = mulberry32(seed * 59 + 1), w = 50, h = 48, G = sprite(w * 2 + 16, h + 30, 5), cx = G.ax, foot = G.ay;
  stoneWall(G, cx, foot, w, h, seed);
  const V = RR('#6a4a30', 6, 3), P = RR('#9a6ad8', 7, 3, { light: 0.6, shift: 0.15 }), L = FOL('#5a8a2e');
  // twisting trunks climbing the face
  for (const [x0, x1] of [[cx - 20, cx - 6], [cx + 18, cx + 30]]) limb(G, [x0, foot + 1], [x0 + 14, foot - h * 0.4], [x1, foot - h - 4], 1.8, 1, V, { seed, k: 0.5 });
  const cls = [];
  for (let i = 0; i < 40; i++) cls.push({ x: cx - w + rnd() * w * 2, y: foot - h - 5 + rnd() * 9, d: 0, r: 2.4 + rnd(), g: 0.6, n: [0, 0.3, 1], w: 0.7, gu: 0, gv: -1, ph: rnd() * TAU, edge: true });
  paintClusters(G, cls, { R: L, seed, leaf: 'fine' });
  // hanging racemes
  for (let i = 0; i < 13; i++) {
    const x = cx - w + 5 + i * 7.5 + (rnd() - 0.5) * 3, y = foot - h - 2 + rnd() * 4, len = 10 + rnd() * 16;
    for (let k = 0; k < len; k++) { const wd = Math.max(0.5, 2.6 * (1 - k / len)); for (let q = -Math.ceil(wd); q <= wd; q++) { if (hash(x + q | 0, y + k | 0, seed) < 0.18) continue; const X = x + q + Math.sin(k * 0.4) * 0.6, Y = y + k; px(G, X, Y, step(P, 0.6 - q / wd * 0.28 - k / len * 0.15 + ((k + q) % 2 ? 0.12 : -0.08), X | 0, Y, 0.2), sN(q / (wd + 1), 0.3, 0.8), F_LEAF, Math.max(1, foot - Y)); } }
  }
  for (let i = 0; i < 14; i++) px(G, cx - w + rnd() * w * 2.2 - 4, foot + 1 + rnd() * 3, P[4 + (rnd() * 2 | 0)], [0, 0, 1], F_GROUND, 0);
  return done(G);
}
export function roseArch(seed = 1) {
  const rnd = mulberry32(seed * 61 + 1), w = 44, h = 74, G = sprite(w * 2 + 24, h + 24, 6), cx = G.ax, foot = G.ay;
  const posts = [cx - w + 4, cx + w - 4], ry = h - w + 4;
  // the iron frame: two posts and the half-round top, front and back rails
  const ironPt = (x, y) => px(G, x, y, step(IRON, 0.45, x | 0, y | 0, 0), [-0.3, 0.5, 0.8], 0);
  for (const off of [-3, 0]) {
    for (const p of posts) for (let y = foot - ry; y <= foot + off; y++) { ironPt(p + off * 0.3, y + off); ironPt(p + 4 + off * 0.3, y + off); }
    for (let a = PI; a <= TAU; a += 0.01) { const r = w - 4; ironPt(cx + Math.cos(a) * r + off * 0.3, foot - ry + Math.sin(a) * r * 1.05 + off); ironPt(cx + Math.cos(a) * (r - 4) + off * 0.3, foot - ry + Math.sin(a) * (r - 4) * 1.05 + off); }
  }
  // climbing foliage along it, with roses
  const cls = [];
  const along = (t) => { if (t < 0.3) return [posts[0] + 2, foot - (t / 0.3) * ry]; if (t > 0.7) return [posts[1] + 2, foot - ((1 - t) / 0.3) * ry]; const a = PI + (t - 0.3) / 0.4 * PI; return [cx + Math.cos(a) * (w - 6), foot - ry + Math.sin(a) * (w - 6) * 1.05]; };
  for (let i = 0; i < 210; i++) { const t = rnd(), [x, y] = along(t); cls.push({ x: x + (rnd() - 0.5) * 9, y: y + (rnd() - 0.5) * 7, d: rnd(), r: 2.4 + rnd() * 1.2, g: 0.55 - (x - cx) / w * 0.18 + (rnd() - 0.5) * 0.15, n: sN((x - cx) / w * 0.6, 0.2, 0.8), w: 0.6 + rnd() * 0.4, gu: (x - cx) / w, gv: (y - foot + h / 2) / h, ph: rnd() * TAU, edge: rnd() < 0.3 }); }
  paintClusters(G, cls, { R: FOL('#3a7a2a'), seed, flowers: { R: RR('#d0304a', 6, 3, { light: 0.6 }), k: 0.32, kind: 'rose', size: 1 } });
  for (let i = 0; i < 10; i++) px(G, cx - w + rnd() * w * 2, foot + 1 + rnd() * 4, [200, 50, 70], [0, 0, 1], F_GROUND, 0);
  return done(G);
}
export function pampasGrass(seed = 1) {
  const rnd = mulberry32(seed * 67 + 1), G = sprite(110, 100, 5), cx = G.ax, foot = G.ay;
  const L = FOL('#6a8a2a', { shift: 0.35 }), P = RR('#e0c89a', 6, 3, { light: 0.5, dark: 0.45 });
  const bl = [];
  for (let i = 0; i < 170; i++) bl.push({ a: -PI / 2 + (rnd() - 0.5) * 2.5, l: 20 + rnd() * 34, x: cx + (rnd() - 0.5) * 14, d: rnd() });
  bl.sort((p, q) => p.d - q.d);
  for (const b of bl) blade(G, b.x, foot - 1, b.a, b.l, 0.9, 0.03 + rnd() * 0.03, L, { k: 0.3 + b.d * 0.35 });
  for (let i = 0; i < 11; i++) {
    const a = -PI / 2 + (i / 10 - 0.5) * 1.4 + (rnd() - 0.5) * 0.15, len = 46 + rnd() * 20, x0 = cx + (rnd() - 0.5) * 8;
    const [ex, ey] = blade(G, x0, foot - 2, a, len, 0.5, 0.004, RR('#a89a5a', 5, 2), { k: 0.5 });
    // the feathery plume, leaning with the stalk and drooping a little
    for (let k = 0; k < 20; k++) { const wd = 3.4 * Math.sin(PI * Math.min(1, (k + 2) / 20)); const X0 = ex + Math.cos(a) * k * 0.9 + (k / 16) ** 2 * (a + PI / 2) * 6, Y0 = ey + Math.sin(a) * k * 0.9; for (let q = -Math.ceil(wd); q <= wd; q++) { if (hash(X0 + q | 0, Y0 | 0, seed) < 0.2) continue; px(G, X0 + q, Y0, step(P, 0.6 - q / (wd + 1) * 0.3 + (hash(q, k, seed) > 0.6 ? 0.15 : -0.05), X0 + q | 0, Y0 | 0, 0.3), sN(q / (wd + 1), -0.2, 0.9)); } }
  }
  return done(G);
}
// a raised patch of meadow lawn with wildflowers and a dirt edge
export function wildflowerLawn(seed = 1, w = 64, d = 34) {
  const rnd = mulberry32(seed * 71 + 1), G = sprite(w * 2 + 10, d + 22, 6), cx = G.ax, foot = G.ay, hh = 2;
  const GR = FOL('#5a8a2a', { shift: 0.35 }), y0 = foot - hh - d;
  for (let y = y0; y <= foot; y++) for (let x = cx - w; x <= cx + w; x++) {
    const ragged = hash(x, 0, seed) * 2 | 0, front = y > foot - hh - ragged;
    if (front) { px(G, x, y, step(SOIL, 0.45 - (foot - y) * 0.1 + (hash(x, y, seed) > 0.8 ? 0.2 : 0), x, y, 0.4), [0, 0.9, 0.4], 0, foot - y); continue; }
    if (Math.abs(x - cx) > w - 1 - hash(0, y, seed) * 2) continue;
    const g = 0.42 + (hash(x >> 2, y >> 2, seed) - 0.5) * 0.2 + ((x + (y >> 1) * 3) % 4 === 0 && hash(x, y, seed + 1) > 0.4 ? 0.25 : 0) - (hash(x, y, seed + 2) < 0.08 ? 0.25 : 0);
    px(G, x, y, step(GR, g, x, y, 0.6), [0, 0.1, 1], 0, hh);
  }
  const tufts = []; for (let i = 0; i < w * d / 9; i++) tufts.push([cx - w + 2 + rnd() * (w * 2 - 4), y0 + 3 + rnd() * (d - 3)]);
  tufts.sort((a, b) => a[1] - b[1]);
  const FC = [RR('#f4f0e8', 5, 2, { dark: 0.4 }), RR('#f0c030', 5, 2), RR('#e8e0c8', 5, 2)];
  for (const [x, y] of tufts) { G.root = { y, b: hh }; blade(G, x, y, -PI / 2 + (rnd() - 0.5) * 0.9, 2 + rnd() * 5, 0.6, 0, GR, { k: 0.4 + rnd() * 0.3 }); if (rnd() < 0.15) { const s = 3 + rnd() * 3; stem(G, x, y, x, y - s, GR, 0.4); bloom(G, x, y - s - 1, 'daisy', FC[(rnd() * 3) | 0], 1, seed); } }
  G.root = null;
  for (let i = 0; i < 40; i++) px(G, cx - w - 2 + rnd() * (w * 2 + 4), foot + 1 + rnd() * 2, step(SOIL, 0.5, 0, 0, 0), [0, 0, 1], F_GROUND, 0);
  return done(G);
}
// cracked flagstone paving with weeds in the joints (lies flat)
export function crackedPaving(seed = 1, w = 62, d = 26) {
  const rnd = mulberry32(seed * 73 + 1), G = sprite(w * 2 + 10, d * 2 + 24, d + 4), cx = G.ax, foot = G.ay;
  const P = RR('#a8a296', 7, 3, { dark: 0.45, light: 0.4, shift: 0.12 });
  const sites = []; for (let i = 0; i < 9; i++) sites.push([cx - w + rnd() * w * 2, foot - d + rnd() * d * 2]);
  const crack = [];
  for (let y = foot - d; y <= foot + d; y++) for (let x = cx - w; x <= cx + w; x++) {
    if ((Math.abs(x - cx) > w - 1 || Math.abs(y - foot) > d - 1) && hash(x, y, seed) > 0.6) continue;
    let b1 = 1e9, b2 = 1e9, id = 0; for (let k = 0; k < sites.length; k++) { const q = Math.hypot((x - sites[k][0]) * 0.8, y - sites[k][1]); if (q < b1) { b2 = b1; b1 = q; id = k; } else if (q < b2) b2 = q; }
    const seam = b2 - b1 < 1.4;
    if (seam) crack.push([x, y]);
    const t = seam ? 0.08 : 0.55 + (hash(id, 0, seed) - 0.5) * 0.2 + (hash(x >> 1, y >> 1, seed + 1) - 0.5) * 0.14 + (b2 - b1 < 3 ? 0.12 : 0);
    px(G, x, y, seam ? step(RR('#4a4440', 5, 2), 0.3, x, y, 0) : step(P, t, x, y, 0.4), [0, 0, 1], F_GROUND | F_WET, 0);
  }
  const spots = []; for (let i = 0; i < 16; i++) spots.push(crack[Math.floor(rnd() * crack.length)]);
  spots.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of spots) { G.root = { y, b: 0 }; const n = 3 + rnd() * 4; for (let k = 0; k < n; k++) blade(G, x, y, -PI / 2 + (k / (n - 1) - 0.5) * 2.6, 2.5 + rnd() * 3, 1, 0.08, FOL('#5a8a2a'), { k: 0.45 + rnd() * 0.2 }); }
  G.root = null;
  return done(G);
}

// ---- ground bits shared by many plants ------------------------------------------------------------------------
// small rounded stones round a plant's foot (low heights, so they sit on the ground)
function pebbles(G, cx, foot, n, spread, seed, R = STONE, big = 3.2) {
  const rnd = mulberry32(seed * 13 + 101), st = [];
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, q = 0.45 + rnd() * 0.6; st.push([cx + Math.cos(a) * spread * q, foot + Math.sin(a) * spread * q * 0.3 + 1, 1.2 + rnd() * (big - 1.2)]); }
  st.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of st) for (let b = -Math.ceil(r * 0.8); b <= 0; b++) for (let a = -Math.ceil(r); a <= r; a++) {
    const u = a / r, v = b / (r * 0.8); if (u * u + v * v > 1) continue;
    px(G, x + a, y + b, step(R, 0.6 - u * 0.25 - v * 0.3 + (u + v < -0.9 ? 0.2 : 0), Math.round(x + a), Math.round(y + b), 0.3), sN(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))), 0, Math.round(-b + 1));
  }
}
// grass tufts at a plant's foot
function tufts(G, cx, foot, n, spread, seed, R = G_LEAF, hgt = 5) {
  const rnd = mulberry32(seed * 17 + 103);
  for (let i = 0; i < n; i++) { const x = cx + (rnd() * 2 - 1) * spread, y = foot + rnd() * 2 - 1; G.root = { y, b: 0 }; for (let k = 0; k < 4; k++) blade(G, x + (rnd() - 0.5) * 2, y, -PI / 2 + (rnd() - 0.5) * 1.6, hgt * (0.5 + rnd() * 0.6), 0.6, 0.03, R, { k: 0.35 + rnd() * 0.35 }); }
  G.root = null;
}
// a ferny frond: an arching rachis with paired leaflets, lit along their tops
function frond(G, x, y, ang, len, R, o = {}) {
  const n = Math.ceil(len * 1.5), dl = len / n; let X = x, Y = y, a = ang;
  for (let i = 0; i <= n; i++) {
    const t = i / n, ll = (o.leaf ?? 4.5) * Math.sin(PI * Math.min(1, t * 1.05 + 0.08)) * (1 - t * 0.25);
    px(G, X, Y, step(R, 0.3 + t * 0.1, X | 0, Y | 0, 0), [-0.2, 0.4, 0.9]);
    if (i % 2 === 0) for (const sg of [-1, 1]) {
      const la = a + sg * (PI / 2 - 0.45), cxs = Math.cos(la), sny = Math.sin(la) + 0.12;
      const top = (sg * Math.sin(a) < 0) !== (Math.cos(a) < 0);
      for (let k = 1; k <= ll; k++) { const qx = X + cxs * k, qy = Y + sny * k * 0.8 + (k / ll) ** 2 * 0.8; px(G, qx, qy, step(R, (o.k ?? 0.5) + (top ? 0.18 : -0.12) - k / ll * 0.18 + (k === 1 ? -0.1 : 0) + (hash(i, k, o.seed || 1) > 0.85 ? 0.15 : 0), qx | 0, qy | 0, 0.25), [cxs * 0.4, 0.3, 0.85]); }
    }
    X += Math.cos(a) * dl; Y += Math.sin(a) * dl;
    const d = ((PI / 2 - a + PI * 3) % TAU) - PI; a += Math.sign(d) * Math.min(Math.abs(d), (o.droop ?? 0.035) * dl);
  }
}
export function fern(seed = 1, size = 30, R = FOL('#4a8a2c'), o = {}) {
  const rnd = mulberry32(seed * 811 + 7), G = sprite(size * 2.6 + 12, size * 1.5 + 12, 5), cx = G.ax, foot = G.ay;
  const fr = [];
  for (let i = 0; i < (o.n ?? 15); i++) { const a = -PI + 0.05 + (i / ((o.n ?? 15) - 1)) * (PI - 0.1) + (rnd() - 0.5) * 0.2; fr.push({ a, len: size * (0.7 + rnd() * 0.35) * (0.75 + 0.25 * Math.abs(Math.cos(a))), d: Math.abs(Math.cos(a)) }); }
  fr.sort((p, q) => q.d - p.d);
  for (const f of fr) frond(G, cx + Math.cos(f.a) * 2, foot - 2, f.a, f.len, R, { leaf: size * 0.15, droop: (o.droop ?? 0.045) * 16 / size, seed, k: o.k });
  return done(G);
}
export const swordFern = (seed = 1) => fern(seed, 38, FOL('#3e8a2a'), { n: 19 });
export const deadBracken = (seed = 1) => fern(seed, 36, FOL('#b8642a', { cool: 20, shiftD: 0.5, warm: 48, shift: 0.5 }), { droop: 0.05, n: 18 });

// ---- rocks and logs (Vox) ------------------------------------------------------------------------------------
// a boulder: o: color, moss / lichen / snow (0..1 coverage), tall (height / size), seed
export function rock(seed = 1, size = 20, o = {}) {
  const tall = o.tall ?? 0.75, m = new Vox(size + 4, size + 4, Math.ceil(size * tall) + 3), c = size / 2 + 2, rx = size / 2, rz = size * tall;
  const nz = (x, y, z, sc, k) => hash(Math.round(x / sc), Math.round(y / sc) + Math.round(z / sc) * 57, seed + k);
  const vn = (x, y) => { const fx = x / 4.5, fy = y / 4.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, a = hash(ix, iy, seed + 21), b = hash(ix + 1, iy, seed + 21), c = hash(ix, iy + 1, seed + 21), d = hash(ix + 1, iy + 1, seed + 21); return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty; };
  const st = m.mat({ ramp: RR(o.color || '#868890', 7, 3, { dark: 0.6, light: 0.45, shift: 0.18 }), k: 3, shade: (x, y, z) => (nz(x, y, z, 3, 1) - 0.5) * 1.4 + (nz(x, y, z, 1, 2) > 0.85 ? 0.6 : 0) });
  const ms = m.mat({ ramp: FOL('#557f26'), k: 3, flag: F_LEAF, shade: (x, y, z) => (nz(x, y, z, 1, 3) > 0.75 ? 1 : 0) - (nz(x, y, z, 1, 4) < 0.2 ? 0.8 : 0) });
  const lc = m.mat({ ramp: RR('#c0c83a', 6, 3, { light: 0.4 }), k: 3, shade: (x, y, z) => (nz(x, y, z, 1, 5) - 0.5) * 1.2 });
  const sn = m.mat({ ramp: SNOW, k: 4, shade: (x, y, z) => (nz(x, y, z, 1, 6) > 0.8 ? -0.8 : 0.3) });
  m.fill((x, y, z) => {
    const a = Math.atan2(y - c, x - c), wob = 1 + Math.sin(a * 3 + seed) * 0.13 + Math.sin(a * 5 + seed * 2) * 0.08 + (vn(x * 1.3, y * 1.3 + z) - 0.5) * 0.22;
    const q = ((x - c) / (rx * wob)) ** 2 + ((y - c) / (rx * wob * (o.deep ?? 0.9))) ** 2, qz = Math.pow((z + 2) / rz, 1.7);
    if (q + qz > 1) return -1;
    const ztop = rz * Math.pow(Math.max(0, 1 - q), 1 / 1.7) - 2;
    if (z > ztop - 1.8) { if (o.snow && q < o.snow * 0.5 + (vn(x, y) - 0.5) * 0.5) return sn; if (o.moss && q < o.moss * 0.5 + (vn(x, y) - 0.5) * 0.6) return ms; }
    if (o.moss && z > ztop - 3 && q < o.moss * 0.4 && vn(x, y) < 0.5) return ms;
    if (o.lichen && vn(x + z * 0.7, y - z * 1.3) < o.lichen) return lc;
    return st;
  });
  m.smooth = 2;
  return m;
}
// a log lying east-west: o: moss, bleach (driftwood), broken, stubs
function logVox(seed, len, r, o = {}) {
  const m = new Vox(len + 4, Math.ceil(r * 2) + 8, Math.ceil(r * 2) + (o.stubs ? 16 : 4)), cy = m.d / 2, cz = r;
  const B = o.bleach ? BARK_PALE : RR('#6a4a32', 7, 3, { dark: 0.62 });
  const bark = m.mat({ ramp: B, k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(Math.atan2(z - cz, y - cy) * 4), seed) - 0.5) * 1.6 + (Math.round(Math.atan2(z - cz, y - cy) * 5) % 2 ? -0.5 : 0) });
  const ring = m.mat({ ramp: RR(o.bleach ? '#d8d0bc' : '#b8865a', 6, 3), k: 3, shade: (x, y, z) => (Math.round(Math.hypot(y - cy, z - cz)) % 2 ? -0.7 : 0.3) });
  const moss = m.mat({ ramp: FOL('#4e8228'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), seed + 3) > 0.7 ? 1.2 : 0) - (hash(Math.round(x / 2), Math.round(y), seed + 4) < 0.2 ? 1 : 0) });
  m.fill((x, y, z) => {
    if (x < 2 || x > len + 1) return -1;
    const rr = r * (1 + Math.sin(x * 0.27 + seed) * 0.05) * (o.taper ? 1 - (x / len) * o.taper : 1), d = Math.hypot(y - cy, z - cz);
    if (d > rr) return -1;
    if (o.broken && x > len - 6 && hash(Math.round(y), Math.round(z), seed) * 6 < x - (len - 6)) return -1;
    if (x < 4 && d < rr - 1.2) return ring;
    if (o.moss && z > cz + rr * 0.35 && hash(Math.round(x / 2), Math.round(y / 2), seed + 1) < o.moss) return moss;
    return bark;
  });
  if (o.stubs) for (let i = 0; i < o.stubs; i++) { const x = 10 + hash(i, 1, seed) * (len - 20), l = 6 + hash(i, 2, seed) * 9; for (let k = 0; k < l; k++) m.box(x + k * 0.5, cy - 1 + (i % 2 ? -1 : 1) * k * 0.15, cz + r - 1 + k, x + k * 0.5 + 2, cy + 1, cz + r + k, bark); }
  m.smooth = 1;
  return m;
}
export function mossyLog(seed = 1) {
  const rnd = mulberry32(seed * 91 + 1), L = vr(logVox(seed, 84, 8, { moss: 0.4, broken: true }), 0.12);
  const parts = [[fern(seed + 1, 13, FOL('#4a8a2c')), -26, -4]];
  parts.push([L, 0, 0]);
  for (let i = 0; i < 3; i++) parts.push([fern(seed + 5 + i, 9 + rnd() * 3, FOL('#5a9a2c')), -20 + i * 22 + rnd() * 6, 6 + rnd() * 2]);
  return compose(parts);
}
export const driftwoodLog = (seed = 1) => compose([[vr(logVox(seed, 96, 7.5, { bleach: true, stubs: 3, broken: true, taper: 0.3 }), -0.25), 0, 0], [tuftSprite(seed + 3, 12, FOL('#7a9a3a')), -34, 10], [tuftSprite(seed + 5, 10, FOL('#8a9a3a')), 30, -6]]);
// a moss-topped rock group / boulders
export const mossMounds = (seed = 1) => compose([[vr(rock(seed, 32, { moss: 0.9, color: '#7a7870' })), 8, -8], [vr(rock(seed + 1, 20, { moss: 1 })), -24, 4], [vr(rock(seed + 2, 13, { moss: 1, tall: 0.6 })), 28, 10], [fern(seed + 3, 12), -4, 12], [vr(rock(seed + 4, 9, { moss: 1, tall: 0.5 })), -36, 14]]);
export const lichenBoulder = (seed = 1) => compose([[vr(rock(seed, 58, { lichen: 0.26, color: '#8a8c94', tall: 0.62 })), 0, 0], [tuftSprite(seed + 1, 14, FOL('#6a9a2a')), -30, 10], [tuftSprite(seed + 2, 12, FOL('#8a9a2a')), 28, 12], [tuftSprite(seed + 5, 10, FOL('#7a9a2a')), 4, 22]]);
export const mossyCreekRocks = (seed = 1) => compose([[vr(rock(seed, 30, { moss: 0.7, tall: 0.5 })), -18, -14], [vr(rock(seed + 1, 34, { moss: 0.75, color: '#7a7c7e', tall: 0.55 })), 20, -9], [vr(rock(seed + 2, 26, { moss: 0.8, tall: 0.5 })), -28, 11], [vr(rock(seed + 3, 28, { moss: 0.7, tall: 0.45 })), 22, 16], [vr(rock(seed + 4, 12, { moss: 0.9, tall: 0.5 })), 0, 6]]);
export const snowyRocks = (seed = 1) => compose([[twigs(seed + 3, 24, RR('#8a3a2e', 6, 3)), 26, -6], [vr(rock(seed, 40, { snow: 0.75, color: '#7a7c80', tall: 0.6 })), 0, -6], [vr(rock(seed + 1, 22, { snow: 0.8, tall: 0.6 })), -26, 8], [vr(rock(seed + 2, 16, { snow: 0.7, tall: 0.6 })), 26, 10], [twigs(seed + 4, 18, RR('#8a3a2e', 6, 3)), -32, 4]]);
// bare red twigs (dogwood) poking up
function twigs(seed, h, B) {
  const rnd = mulberry32(seed * 3 + 5), G = sprite(h + 10, h + 8, 3), cx = G.ax, foot = G.ay;
  for (let i = 0; i < 6; i++) { const a = -PI / 2 + (rnd() - 0.5) * 1.4, L = h * (0.5 + rnd() * 0.5), ex = cx + Math.cos(a) * L, ey = foot + Math.sin(a) * L; limb(G, [cx, foot], [(cx + ex) / 2 + (rnd() - 0.5) * 3, (foot + ey) / 2], [ex, ey], 0.6, 0.4, B, { tex: 'smooth' }); }
  return done(G);
}
// a tuft of grass as its own sprite
function tuftSprite(seed, h, R) {
  const rnd = mulberry32(seed * 5 + 1), G = sprite(h * 2 + 8, h + 8, 3), cx = G.ax, foot = G.ay;
  for (let i = 0; i < 14; i++) blade(G, cx + (rnd() - 0.5) * 4, foot, -PI / 2 + (rnd() - 0.5) * 1.8, h * (0.5 + rnd() * 0.5), 0.6, 0.03, R, { k: 0.3 + rnd() * 0.4 });
  return done(G);
}
// a little conifer sapling
export const sapling = (seed = 1, h = 26) => conifer(seed, { h, r: h * 0.3, R: FOL('#3e7034'), sp: 3, sw: 2.6, tw: 1, bare: 0.1, droop: 0.3 });

// ---- forest trees (E3b) -----------------------------------------------------------------------------------
export function redwood(seed = 1, h = 150) {
  h *= SIZE;
  // (a giant: a trunk two strides across, flared at the foot; dense sprays of foliage up the top two thirds)
  const rnd = mulberry32(seed * 271 + 1), G = sprite(132 * SIZE, h + 16, 5), cx = G.ax, foot = G.ay, tw = 17 * tk(), top = foot - h, lobes = [], stubs = [];
  for (let y = foot - h * 0.36; y > top + 6; y -= 6 + rnd() * 4) for (const side of [-1, 1]) {
    if (rnd() < 0.12) continue;
    const up = (foot - y) / h, r = (7 + rnd() * 5) * (1.15 - up * 0.45), x = cx + side * (tw * (1 - up * 0.45) + 3 + rnd() * 13 * (1.1 - up * 0.6));
    lobes.push({ x, y, r, ry: r * 0.74, dz: rnd() < 0.3 ? 30 : 0 }); stubs.push([[cx + side * tw * 0.5, y + 2], [(cx + x) / 2, y + 2], [x, y + 1]]);
    if (rnd() < 0.6) lobes.push({ x: x + side * (r + 2), y: y + 3, r: r * 0.72, ry: r * 0.55 });
  }
  lobes.push({ x: cx, y: top + 9, r: 13, ry: 10 }, { x: cx - 11, y: top + 17, r: 9.5, ry: 7 }, { x: cx + 11, y: top + 18, r: 9.5, ry: 7 });
  const cls = massEll(lobes, rnd, 3.2, 1.7), R = FOL('#467a2c');
  const mid = () => {
    limb(G, [cx, foot + 1], [cx + 1, foot - h * 0.5], [cx, top + 4], tw, tw * 0.5, BARK_RED, { flare: 1.25, seed, tex: 'flute', k: 0.58 });
    for (const s2 of [-1, 1, -0.45, 0.5]) limb(G, [cx + s2 * tw * 0.5, foot - tw * 1.2], [cx + s2 * tw * 1.3, foot - 3], [cx + s2 * (tw * 1.8 + 4), foot + 1], tw * 0.38, 1.2, BARK_RED, { seed: seed + 5, tex: 'flute' });
    for (const [p0, p1, p2] of stubs) limb(G, p0, p1, p2, 1.2, 0.7, BARK_RED, { seed, k: 0.3 });
  };
  paintClusters(G, cls, { R, seed, core: false, mid, backW: 0.5, leaf: 'round' });
  return compose([[done(G), 0, 0], [fern(seed + 1, 14, FOL('#4a8a2c')), -20, 2], [fern(seed + 2, 12, FOL('#5a9a2c')), 19, 3]]);
}
export const douglasFir = (seed = 1) => conifer(seed, { h: 124, r: 32, R: FOL('#356a32'), tw: 3, sp: 5.4, bare: 0.08, droop: 0.5, sw: 4.6 });
export const westernRedCedar = (seed = 1) => conifer(seed, { h: 126, r: 34, form: 'cedar', R: FOL('#46782a'), tw: 3.4, B: BARK_RED, droop: 0.95, upturn: true, fringe: 3.5, sp: 4.6, sw: 4.8, k: 2 });
export const blueSpruce = (seed = 1) => conifer(seed, { h: 112, r: 28, R: FOL('#4c7a7c', { cool: 225, warm: 150, shift: 0.35, desat: 0.25 }), tw: 2.6, droop: 0.15, sp: 4.8, sw: 4.4, fringe: 1.8, k: 3 });
// pines with tufted needle clumps on sparse side branches: ponderosa, mountain pine, whitebark (twisted)
export function pineTufts(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 233 + (o.k || 0)), h = (o.h ?? 122) * SIZE, cw = (o.cw ?? 32) * SIZE, G = sprite(cw * 2 + 30, h + 14, 5), cx = G.ax, foot = G.ay;
  const B = o.B || RR('#9a5a30', 7, 3, { dark: 0.62, light: 0.45 }), R = o.R || FOL('#4a7a2a'), tw = o.tw ?? 3.4, lobes = [], branches = [];
  const twist = o.twist || 0, topX = cx + (o.lean || 0);
  const trunkPts = [[cx, foot + 1], [cx + twist * 1.6, foot - h * 0.5], [topX, foot - h + 6]];
  const lowest = o.low ?? 0.38;
  for (let i = 0; i < (o.n ?? 9); i++) {
    const t = lowest + (i / ((o.n ?? 9) - 1)) * (0.97 - lowest), side = i % 2 ? 1 : -1, p = qpt(trunkPts[0], trunkPts[1], trunkPts[2], t);
    const L = cw * (0.35 + rnd() * 0.5) * (1 - t * 0.55) * (o.flatTop ? 1.2 : 1), ex = p[0] + side * L, ey = p[1] - L * (o.rise ?? 0.25) + (rnd() - 0.5) * 4;
    branches.push([p, [(p[0] + ex) / 2, p[1] - L * 0.1 + (o.twist ? (rnd() - 0.5) * 6 : 0)], [ex, ey], tw * (1 - t) * 0.6 + 0.6]);
    const r = (o.tuft ?? 7.5) * (0.8 + rnd() * 0.45);
    lobes.push({ x: ex, y: ey - r * 0.2, r, ry: r * (o.flat ?? 0.75) });
    if (L > 8) lobes.push({ x: (p[0] + ex * 2) / 3, y: (p[1] + ey * 2) / 3 - 2, r: r * 0.75, ry: r * 0.6 * (o.flat ?? 0.75) / 0.75 });
  }
  lobes.push({ x: topX, y: foot - h + 6, r: (o.tuft ?? 7.5) * 1.1, ry: (o.tuft ?? 7.5) });
  const cls = massEll(lobes, rnd, o.cs ?? 3.4, o.dens ?? 1.6);
  const mid = () => {
    limb(G, trunkPts[0], trunkPts[1], trunkPts[2], tw, tw * 0.35, B, { flare: o.flare ?? 0.6, seed, tex: o.tex || 'bark', k: 0.6 });
    for (const [a, b, c, w] of branches) limb(G, a, b, c, w, 0.7, B, { seed, k: 0.45 });
  };
  paintClusters(G, cls, { R, leaf: o.leaf || 'needle', seed, core: true, mid, backW: 0.45 });
  if (o.rocks) pebbles(G, cx, foot, o.rocks, cw * 0.6, seed);
  if (o.grass) tufts(G, cx, foot, o.grass, cw * 0.5, seed, FOL('#6a8a2a'));
  return done(G);
}
export const ponderosaPine = (seed = 1) => pineTufts(seed, { h: 122, cw: 32, tw: 3.6, n: 11, tuft: 8, R: FOL('#4e7e2c'), grass: 5 });
export const bigOak = (seed = 1) => broadleaf(seed, { h: 118, cw: 58, ch: 50, form: 'spread', tw: 6, flare: 0.5, R: FOL('#477a26'), cs: 5.4, dens: 0.9, lobes: 14, holes: 0.8, kmin: 0.5, kmax: 0.68, k: 7 });
export const mapleGreen = (seed = 1) => broadleaf(seed, { h: 98, cw: 44, ch: 45, leaf: 'maple', R: FOL('#4a8428'), cs: 5, dens: 0.95, tw: 4.5, k: 8 });
export const mapleAutumn = (seed = 1) => broadleaf(seed, { h: 98, cw: 44, ch: 45, leaf: 'maple', dens: 0.95, R: FOL('#d24a1c', { cool: 330, shiftD: 0.3, warm: 46, shift: 0.55 }), cs: 4.8, tw: 4.5, litter: LIT_RED.concat([[220, 120, 40]]), k: 9 });
// a clump of slim pale trunks fanning out from one spot, foliage in clumps up their tops: birch, aspen
export function grove(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 281 + (o.k || 0)), h = (o.h ?? 94) * SIZE, cw = (o.cw ?? 38) * SIZE, n = o.n ?? 5, G = sprite(cw * 2 + 30, h + 16, 5), cx = G.ax, foot = G.ay;
  const B = o.B || BARK_BIRCH, R = o.R || FOL('#76a032'), stems = [], lobes = [];
  for (let i = 0; i < n; i++) {
    const u = (i - (n - 1) / 2) / Math.max(1, (n - 1) / 2), bx = cx + u * 7 + (rnd() - 0.5) * 2, tx = cx + u * cw * 0.8 + (rnd() - 0.5) * 6, ty = foot - h * (0.78 + rnd() * 0.22) + Math.abs(u) * 8;
    stems.push([[bx, foot + 1], [(bx * 2 + tx) / 3, (foot + ty) / 2], [tx, ty], 1.3 + rnd() * 0.5, rnd()]);
    for (let k = 0; k < 6; k++) { const t = 0.45 + k * 0.11, p = qpt([bx, foot], [(bx * 2 + tx) / 3, (foot + ty) / 2], [tx, ty], t), r = (o.r ?? 7.5) * (0.8 + rnd() * 0.4) * (1 - k * 0.05); lobes.push({ x: p[0] + (rnd() - 0.5) * 12 + u * 4, y: p[1] - r * 0.3, r, ry: r * 0.85 }); }
  }
  const cls = massEll(lobes, rnd, o.cs ?? 3.6, o.dens ?? 0.95);
  const mid = () => {
    stems.sort((a, b) => a[4] - b[4]);
    for (const [a, b, c, w] of stems) { limb(G, a, b, c, w, w * 0.55, B, { tex: 'birch', seed: seed + (a[0] | 0), k: 0.62, flare: 0.3 }); for (let k = 0; k < 3; k++) { const p = qpt(a, b, c, 0.45 + k * 0.18), sg = k % 2 ? 1 : -1; limb(G, p, [p[0] + sg * 4, p[1] - 3], [p[0] + sg * (6 + rnd() * 4), p[1] - 6 - rnd() * 4], 0.7, 0.4, RR('#5a4a40', 5, 2), { seed, k: 0.4 }); } }
  };
  paintClusters(G, cls, { R, leaf: o.leaf || 'round', seed, mid, backW: 0.65, skip: () => rnd() < 0.2 });
  if (o.litter) litter(G, cx, foot, 18, o.litter, seed, 30);
  tufts(G, cx, foot, 5, 14, seed, FOL('#5a8a2a'), 6);
  return done(G);
}
export const birchClump = (seed = 1) => grove(seed, { h: 96, cw: 40, n: 6, R: FOL('#78a032'), leaf: 'fine', r: 8 });
export const aspenGrove = (seed = 1) => grove(seed, { h: 98, cw: 40, n: 7, R: FOL('#e2ae22', { cool: 25, shiftD: 0.45 }), r: 7.5, litter: LIT_GOLD, k: 1 });
// a huge old stump with moss and ferns, young firs growing out of its top
export function nurseStump(seed = 1) {
  const m = new Vox(46, 40, 32), cx = 23, cy = 20;
  const B = m.mat({ ramp: RR('#6a4430', 7, 3, { dark: 0.62 }), k: 3, shade: (x, y, z) => (Math.round(Math.atan2(y - cy, x - cx) * 7) % 2 ? -0.6 : 0.2) + (hash(Math.round(Math.atan2(y - cy, x - cx) * 9), Math.round(z / 3), seed) - 0.5) });
  const top = m.mat({ ramp: RR('#8a5a3a', 6, 3), k: 3, shade: (x, y) => (Math.round(Math.hypot(x - cx, y - cy)) % 3 ? 0 : -0.7) });
  const moss = m.mat({ ramp: FOL('#5e8e28'), k: 4, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), z | 0) > 0.7 ? 1 : 0) });
  m.fill((x, y, z) => {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, (y - cy) * 1.1), r = 16 + Math.sin(a * 5 + seed) * 1.6 + Math.max(0, 6 - z) * 0.9 + (z < 3 ? Math.max(0, Math.cos(a * 4 + seed)) * 4 : 0);
    const H = 22 + Math.sin(a * 3 + seed) * 4 + hash(Math.round(a * 6), 0, seed) * 4;
    if (d > r || z > H) return -1;
    if (z > H - 2) return d < r - 3 ? top : moss;
    if (hash(Math.round(a * 8), Math.round(z / 2), seed + 2) > 0.78 || (z < 4 && hash(Math.round(x / 2), Math.round(y / 2), seed + 5) > 0.5)) return moss;
    return B;
  });
  m.smooth = 1;
  const S = vr(m);
  return compose([[fern(seed + 1, 13), -20, -2], [S, 0, 0], [sapling(seed + 2, 30), -6, -27, 22], [sapling(seed + 3, 24), 8, -25, 21], [sapling(seed + 7, 18), 1, -22, 22], [sapling(seed + 6, 16), 22, 4], [fern(seed + 4, 12), -16, 10], [fern(seed + 5, 11), 18, 12]]);
}
// ---- forest floor --------------------------------------------------------------------------------------------
export const salal = (seed = 1) => shrub(seed, { w: 26, h: 30, R: FOL('#3a7430'), cs: 3.4, flowers: { R: RR('#f0d8d8', 5, 2), k: 0.06, kind: 'bell' }, k: 2 });
export const huckleberry = (seed = 1) => shrub(seed, { w: 24, h: 28, R: FOL('#4a7a2c'), cs: 2.6, leaf: 'fine', fruit: { R: RR('#3a3a8a', 5, 2, { light: 0.6 }), n: 12, r: 1.1 }, stems: 4, k: 3 });
export const wildBerry = (seed = 1) => shrub(seed, { w: 24, h: 30, R: FOL('#4a7c2c'), cs: 2.8, fruit: { R: RR('#c8282a', 5, 2, { light: 0.6 }), n: 14, r: 1.2 }, flowers: { R: RR('#f4f0e8', 5, 3, { dark: 0.3 }), k: 0.05, kind: 'star' }, k: 4 });
// tall flower spikes over a basal rosette: foxglove, lupine, paintbrush. o: n, h, R (flower ramp), kind
// ('bells' | 'pea' | 'brush'), L (leaf ramp), leaves ('broad' | 'palm' | 'fine'), rocks, w
export function spikes(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 151 + (o.k || 0)), w = o.w ?? 16, G = sprite(w * 2 + 18, (o.h ?? 30) + 18, 5), cx = G.ax, foot = G.ay;
  const L = o.L || FOL('#3e7a2a'), P = o.R;
  if (o.leaves === 'broad') for (let i = 0; i < 9; i++) { const a = -PI / 2 + (i / 8 - 0.5) * 2.8; bigLeaf(G, cx + Math.cos(a) * 3, foot - 2, a, 9 + rnd() * 4, 2.6, L, { shape: 'lance', droop: 0.06, seed, vein: 2.4 }); }
  else { const cls = massEll([{ x: cx, y: foot - 5, r: w * 0.85, ry: 5.5 }], rnd, o.leaves === 'fine' ? 2.2 : 2.8, 1.5); paintClusters(G, cls, { R: L, seed, leaf: o.leaves === 'palm' ? 'maple' : o.leaves === 'fine' ? 'fine' : 'round', core: true }); }
  const n = o.n ?? 5, sp = [];
  for (let i = 0; i < n; i++) sp.push({ x: cx + (i / Math.max(1, n - 1) * 2 - 1) * w * 0.72 + (rnd() - 0.5) * w * 0.3, h: (o.h ?? 30) * (0.55 + rnd() * 0.5), y: foot - 2 - rnd() * 6 });
  sp.sort((a, b) => a.y - b.y);
  for (const s of sp) {
    const top = s.y - s.h, R = pickR(P, rnd);
    stem(G, s.x, s.y, s.x, top + 2, L, 0.4);
    const len = o.kind === 'brush' ? s.h * 0.35 : s.h * 0.55;
    for (let k = 0; k < len; k++) {
      const Y = top + k, t = k / len, wd = o.kind === 'brush' ? 1.6 + t * 1.2 : (o.kind === 'pea' ? 0.6 + t * 1.8 : 1.2 + t * 1.6);
      for (let q = -Math.ceil(wd); q <= wd; q++) {
        if (o.kind === 'bells' && (k % 3 === 2 || (Math.abs(q) > wd - 0.8 && k % 3 === 0))) continue;
        if (o.kind === 'brush' && hash(q, k, seed) < 0.15) continue;
        const sh = 0.62 - q / (wd + 1) * 0.3 + (k % 2 && o.kind === 'pea' ? -0.15 : 0) + (o.kind === 'bells' && k % 3 === 1 ? -0.25 : 0) - (o.kind === 'pea' ? t * 0.2 : 0) + (k < 2 ? 0.1 : 0);
        px(G, s.x + q, Y, step(R, sh, s.x + q | 0, Y, 0.2), sN(q / (wd + 1), 0.2, 0.9));
      }
    }
    if (o.kind === 'pea' || o.kind === 'bells') px(G, s.x, top - 1, step(L, 0.6, 0, 0, 0), [0, 0, 1]);
  }
  if (o.rocks) pebbles(G, cx, foot, o.rocks, w, seed);
  return done(G);
}
export const foxglove = (seed = 1) => spikes(seed, { n: 6, h: 50, w: 22, R: [RR('#d0508a', 6, 3, { light: 0.55 }), RR('#c84a9a', 6, 3, { light: 0.55 })], kind: 'bells', leaves: 'broad' });
export function trillium(seed = 1) {
  const rnd = mulberry32(seed * 157 + 1), G = sprite(80, 40, 5), cx = G.ax, foot = G.ay, L = FOL('#3a7a2c'), W = RR('#f4f2ea', 5, 3, { dark: 0.3, light: 0.6 });
  const pl = []; for (let i = 0; i < 6; i++) pl.push([cx + (i / 5 - 0.5) * 50 + (rnd() - 0.5) * 6, foot - 1 - rnd() * 7, rnd() < 0.6]);
  pl.sort((a, b) => a[1] - b[1]);
  for (const [x, y, fl] of pl) {
    for (let k = 0; k < 3; k++) { const a = -PI / 2 + (k - 1) * 2.0 + (rnd() - 0.5) * 0.3; bigLeaf(G, x, y - 5, a + PI * 0.15 * (k - 1), 11 + rnd() * 2, 5, L, { shape: 'oval', droop: 0.08, seed, vein: 2.5 }); }
    if (fl) for (let k = 0; k < 3; k++) { const a = -PI / 2 + (k - 1) * 2.1; for (let s = 0; s < 5; s++) { const X = x + Math.cos(a) * s * 1.1, Y = y - 9 + Math.sin(a) * s * 0.8; px(G, X, Y, step(W, 0.7 - s * 0.08 - (a > -PI / 2 ? 0.2 : 0), X | 0, Y | 0, 0), [-0.2, 0.2, 0.95]); px(G, X + 1, Y, step(W, 0.45, X | 0, Y | 0, 0), [0.3, 0.3, 0.9]); } px(G, x, y - 9, [232, 200, 80], [0, 0, 1]); }
  }
  return done(G);
}
// sticks lying on the ground
export function fallenBranches(seed = 1) {
  const rnd = mulberry32(seed * 163 + 1), G = sprite(100, 44, 22), cx = G.ax, foot = G.ay, B = RR('#8a6a4e', 7, 3, { dark: 0.6, light: 0.5 });
  const sticks = [[-40, -10, 28, -16, 2.2], [-34, 8, 40, 2, 2.6], [-6, 16, 18, -6, 1.6]];
  for (const [x0, y0, x1, y1, w] of sticks) {
    const p0 = [cx + x0, foot + y0], p2 = [cx + x1, foot + y1], p1 = [(p0[0] + p2[0]) / 2 + (rnd() - 0.5) * 6, (p0[1] + p2[1]) / 2 - 2];
    limb(G, p0, p1, p2, w, w * 0.55, B, { seed, z: 2, k: 0.55 });
    for (let k = 0; k < 3; k++) { const t = 0.25 + k * 0.25, p = qpt(p0, p1, p2, t), sg = k % 2 ? 1 : -1; limb(G, p, [p[0] + 4, p[1] + sg * 3], [p[0] + 8 + rnd() * 5, p[1] + sg * (4 + rnd() * 3)], 0.8, 0.4, B, { seed, z: 1 }); }
    // lichen and moss flecks
    for (let k = 0; k < 6; k++) { const p = qpt(p0, p1, p2, rnd()); px(G, p[0], p[1] - 1, step(FOL('#7a9a3a'), 0.6, 0, 0, 0), [0, 0, 1], F_LEAF, 3); }
  }
  return done(G);
}
export function pineCones(seed = 1) {
  const rnd = mulberry32(seed * 167 + 1), G = sprite(44, 30, 14), cx = G.ax, foot = G.ay, C = RR('#7a4a2a', 7, 3, { dark: 0.62, light: 0.5 });
  const pts = [[-13, -7], [8, -11], [-3, 6], [16, 3]];
  for (const [ox, oy] of pts) {
    const x = cx + ox, y = foot + oy, rx = 5.6 + rnd(), ry = 4.2 + rnd() * 0.6;
    for (let b = -Math.ceil(ry) - 1; b <= ry; b++) for (let a = -Math.ceil(rx); a <= rx; a++) {
      const u = a / rx, v = (b + 0.5) / ry; if (u * u + v * v > 1) continue;
      const scale = ((a + 20 + (b & 1) * 1) % 2 === 0) && (b % 2 === 0);
      px(G, x + a, y + b, step(C, 0.55 - u * 0.25 - v * 0.25 + (scale ? 0.22 : -0.08) + (u * u + v * v > 0.7 && u + v > 0 ? -0.2 : 0), x + a, y + b, 0.2), sN(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))), 0, Math.max(1, Math.round(-b + 2)));
    }
  }
  for (let i = 0; i < 10; i++) { const x = cx + (rnd() - 0.5) * 36, y = foot + (rnd() - 0.5) * 18; for (let k = 0; k < 4; k++) px(G, x + k, y + k * 0.3 * (i % 2 ? 1 : -1), [150, 100, 50], [0, 0, 1], F_GROUND, 0); }
  return done(G);
}
// a scatter of fallen leaves (lies on the ground)
export function leafLitter(seed = 1, r = 30, cols = null) {
  const rnd = mulberry32(seed * 173 + 1), G = sprite(r * 2 + 10, r + 12, r * 0.5 + 6), cx = G.ax, foot = G.ay;
  const C = cols || [RR('#b8702a', 5, 2), RR('#9a4a28', 5, 2), RR('#c89a3a', 5, 2), RR('#7a5030', 5, 2)];
  for (let i = 0; i < r * 9; i++) {
    const a = rnd() * TAU, q = Math.sqrt(rnd()), x = cx + Math.cos(a) * q * r, y = foot + Math.sin(a) * q * r * 0.42;
    if (q > 0.85 && rnd() < 0.6) continue;
    const R = C[Math.floor(rnd() * C.length)], big = rnd() < 0.3;
    px(G, x, y, step(R, 0.55 + (rnd() - 0.5) * 0.4, x | 0, y | 0, 0), [0, 0, 1], F_GROUND, 0);
    px(G, x + 1, y, step(R, 0.35, x | 0, y | 0, 0), [0, 0, 1], F_GROUND, 0);
    if (big) { px(G, x, y - 1, step(R, 0.75, x | 0, y | 0, 0), [0, 0, 1], F_GROUND, 1); px(G, x + 1, y + 1, step(R, 0.2, x | 0, y | 0, 0), [0, 0, 1], F_GROUND, 0); }
  }
  const B = RR('#7a5a40', 5, 2);
  for (let i = 0; i < 2; i++) { const x0 = cx + (rnd() - 0.5) * r, y0 = foot + (rnd() - 0.5) * r * 0.3; limb(G, [x0, y0], [x0 + 5, y0 - 1], [x0 + 10, y0 + (rnd() - 0.5) * 4], 0.7, 0.5, B, { z: 1, seed }); }
  return done(G, 0);
}

// a starburst of stiff blades round a dark core (joshua tree heads, yucca tops)
function spikeBall(G, x, y, r, R, seed) {
  const rnd = mulberry32(seed * 7 + 3), sp = [];
  for (let i = 0; i < r * 9; i++) { const a = rnd() * TAU, d = rnd(); sp.push({ a, d, L: r * (0.55 + rnd() * 0.5) * (0.7 + 0.3 * d) }); }
  sp.sort((p, q) => p.d - q.d);
  for (let b = -r * 0.4; b <= r * 0.4; b++) for (let a = -r * 0.45; a <= r * 0.45; a++) px(G, x + a, y + b, step(R, 0.05, 0, 0, 0), [0, 0.5, 0.8]);
  for (const s of sp) { const ca = Math.cos(s.a), sa = Math.sin(s.a) * 0.9, lit = ca + sa < 0; for (let k = 1; k <= s.L; k++) { const t = k / s.L, X = x + ca * k, Y = y + sa * k + t * t * 1.2; px(G, X, Y, step(R, 0.12 + t * 0.55 + s.d * 0.18 + (lit ? 0.14 : -0.06), X | 0, Y | 0, 0.2), [ca * 0.7, sa * 0.5 + 0.2, 0.6]); } }
}

// ---- desert (E3c) ---------------------------------------------------------------------------------------------
const CACTUS = FOL('#4f8a3a', { warm: 70, shift: 0.5, desat: 0.25, cool: 190 });
// a ribbed cactus column from yb (base) up to yt, half width r
function column(G, x, yb, yt, r, R, seed, cap = true) {
  for (let y = Math.floor(yt - (cap ? r * 0.9 : 0)); y <= yb; y++) {
    const capT = cap && y < yt ? (yt - y) / (r * 0.9) : 0, w = cap && y < yt ? r * Math.sqrt(Math.max(0, 1 - capT * capT)) : r;
    for (let dx = -Math.ceil(w); dx <= w; dx++) {
      const u = dx / Math.max(1, r), rib = Math.cos((u * 1.4 + 1) * PI * (r > 3 ? 2.5 : 1.5));
      let sh = 0.55 - u * 0.32 + (rib > 0.55 ? 0.16 : rib < -0.6 ? -0.2 : 0) + (capT > 0 ? capT * 0.2 : 0);
      if (hash(x + dx, y, seed) > 0.93 && rib > 0.3) sh += 0.3;                                           // spines catching the light
      px(G, x + dx, y, step(R, sh, x + dx, y, 0.25), sN(u, capT > 0 ? -capT : 0.1, Math.sqrt(Math.max(0, 1 - u * u))), 0);
    }
  }
}
export function saguaro(seed = 1, h = 100) {
  h *= SIZE;
  const rnd = mulberry32(seed * 181 + 1), r = Math.max(3, h * 0.065), G = sprite(h * 0.8 + 20, h + 14, 5), cx = G.ax, foot = G.ay;
  const arms = h > 60 ? [[-1, 0.42 + rnd() * 0.1, 0.32], [1, 0.52 + rnd() * 0.12, 0.3]] : h > 45 ? [[-1, 0.35, 0.28], [1, 0.48, 0.26]] : [];
  column(G, cx, foot, foot - h + r, r, CACTUS, seed);
  for (const [s, t, len] of arms) {
    const y0 = foot - h * t, ax = cx + s * (r + 5), ar = r * 0.78;
    limb(G, [cx + s * r * 0.4, y0], [ax, y0 + 1], [ax, y0 - 4], ar, ar, CACTUS, { tex: 'smooth', k: 0.5 });
    column(G, ax, y0 - 3, y0 - h * len, ar, CACTUS, seed + 3);
  }
  // flowers / fruit on the crown
  if (h > 60) for (let k = -1; k <= 1; k++) px(G, cx + k * 2, foot - h + r * 0.1 - 1, [236, 200, 80], [0, 0, 1], 0);
  pebbles(G, cx, foot, 5, h * 0.25, seed); tufts(G, cx, foot, 4, h * 0.2, seed, FOL('#8a9a3a'));
  return done(G);
}
export const saguaroBig = (seed = 1) => saguaro(seed, 102), saguaroMid = (seed = 1) => saguaro(seed, 70), saguaroSmall = (seed = 1) => saguaro(seed, 44);
export function joshuaTree(seed = 1) {
  const rnd = mulberry32(seed * 191 + 1), G = sprite(110 * SIZE, 118 * SIZE, 5), cx = G.ax, foot = G.ay, B = RR('#7a5a3e', 7, 3, { dark: 0.6, light: 0.45 });
  const lobes = [], limbs = [];
  const grow = (p, a, L, w, depth) => {
    const e = [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L], c = [(p[0] + e[0]) / 2 + (rnd() - 0.5) * 6, (p[1] + e[1]) / 2 + 3];
    limbs.push([p, c, e, w, w * 0.7]);
    if (depth === 0) { lobes.push({ x: e[0], y: e[1] - 3, r: 10 + rnd() * 2.5, ry: 9 }); return; }
    const n = 2 + (rnd() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) grow(e, a + (i / (n - 1) - 0.5) * 1.5 + (rnd() - 0.5) * 0.3, L * (0.62 + rnd() * 0.2), w * 0.7, depth - 1);
  };
  grow([cx, foot + 1], -PI / 2 + (rnd() - 0.5) * 0.2, 40 * SIZE, 5 * tk(), 2);
  for (const [a, b, c, w0, w1] of limbs) limb(G, a, b, c, w0, w1, B, { seed, k: 0.5, flare: a[1] > foot ? 0.6 : 0 });
  // the dead-leaf shag on the branches just under each head, then the spiky heads
  for (const l of lobes) for (let k = 0; k < 14; k++) { const x = l.x + (rnd() - 0.5) * 5, y = l.y + 4 + rnd() * 6; px(G, x, y, step(RR('#8a7048', 5, 2), 0.2 + rnd() * 0.5, x | 0, y | 0, 0), [0, 0.6, 0.5]); }
  lobes.sort((a, b) => a.y - b.y);
  for (const l of lobes) spikeBall(G, l.x, l.y, l.r, FOL('#7a9a2a', { warm: 60 }), seed + (l.x | 0));
  pebbles(G, cx, foot, 6, 24, seed); tufts(G, cx, foot, 5, 18, seed, FOL('#8a9a3a'));
  return done(G);
}
export function ocotillo(seed = 1) {
  const rnd = mulberry32(seed * 193 + 1), G = sprite(70, 100, 5), cx = G.ax, foot = G.ay, B = RR('#6a6a3e', 6, 3), Lf = FOL('#5a8a2a'), Fl = RR('#e8402a', 6, 3, { light: 0.6 });
  for (let i = 0; i < 16; i++) {
    const a = -PI / 2 + (i / 15 - 0.5) * 0.9 + (rnd() - 0.5) * 0.1, L = 60 + rnd() * 28, ex = cx + Math.cos(a) * L, ey = foot + Math.sin(a) * L, x0 = cx + (rnd() - 0.5) * 3;
    limb(G, [x0, foot], [(x0 + ex) / 2 + (rnd() - 0.5) * 4, (foot + ey) / 2], [ex, ey], 1.1, 0.6, B, { tex: 'smooth', seed });
    for (let k = 0; k < L * 0.8; k += 2) { const t = k / L, X = x0 + (ex - x0) * t + (k % 4 ? 1 : -1), Y = foot + (ey - foot) * t; if (rnd() < 0.7) px(G, X, Y, step(Lf, 0.4 + rnd() * 0.4, X | 0, Y | 0, 0), [k % 4 ? 0.5 : -0.5, 0.4, 0.8]); }
    for (let k = 0; k < 6; k++) { const X = ex + Math.cos(a) * k * 0.6 + (k % 2), Y = ey - k; px(G, X, Y, step(Fl, 0.7 - k * 0.05 + (k % 2 ? -0.2 : 0), X | 0, Y | 0, 0), [-0.3, 0.2, 0.9]); }
  }
  pebbles(G, cx, foot, 5, 20, seed); tufts(G, cx, foot, 4, 16, seed, FOL('#8a9a3a'));
  return done(G);
}
export const paloVerde = (seed = 1) => broadleaf(seed, { h: 100, cw: 52, ch: 34, form: 'spread', twist: 3, tw: 3.4, B: RR('#8a9a4a', 7, 3, { dark: 0.6, light: 0.45 }), tex: 'smooth', leaf: 'fine', R: FOL('#a0b428', { warm: 56 }), cs: 3, holes: 0.9, dens: 0.32, airy: 0.25, lobes: 12, flowers: { R: RR('#f0d030', 5, 2), k: 0.3, kind: 'dot' }, k: 12 });
export const mesquite = (seed = 1) => broadleaf(seed, { h: 102, cw: 50, ch: 34, form: 'spread', stems: 2, spread: 5, tw: 4, B: RR('#6a4430', 7, 3, { dark: 0.62 }), twist: 4, leaf: 'fine', R: FOL('#5a7a2e', { desat: 0.15 }), cs: 3.2, holes: 0.9, dens: 0.4, airy: 0.2, lobes: 12, k: 13 });
export function pricklyPear(seed = 1) {
  const rnd = mulberry32(seed * 197 + 1), G = sprite(90, 70, 5), cx = G.ax, foot = G.ay, R = FOL('#5e9a4a', { warm: 70, shift: 0.5, desat: 0.2 }), Fl = RR('#e0307a', 6, 3, { light: 0.55 });
  const pads = [];
  const add = (x, y, a, r, depth) => { pads.push({ x, y, a, r, d: depth }); if (depth > 2 || r < 5) return; const n = depth === 0 ? 3 : 1 + (rnd() < 0.6 ? 1 : 0); for (let i = 0; i < n; i++) { const na = a + (i - (n - 1) / 2) * 0.8 + (rnd() - 0.5) * 0.3, tx = x + Math.sin(na) * r * 1.5, ty = y - Math.cos(na) * r * 1.5; add(tx, ty, na, r * (0.8 + rnd() * 0.12), depth + 1); } };
  add(cx - 12, foot - 9, -0.3, 8.5, 0); add(cx + 12, foot - 9, 0.35, 8.5, 1); add(cx + 30, foot - 7, 0.6, 6.5, 2); add(cx - 30, foot - 7, -0.6, 6.5, 2);
  pads.sort((p, q) => q.d - p.d || p.y - q.y);
  for (const p of pads) {
    const rx = p.r * 0.78, ry = p.r, ca = Math.cos(p.a), sa = Math.sin(p.a);
    for (let b = -Math.ceil(ry) - 1; b <= ry + 1; b++) for (let a = -Math.ceil(ry) - 1; a <= ry + 1; a++) {
      const u = (a * ca + b * sa) / rx, v = (-a * sa + b * ca) / ry; if (u * u + v * v > 1) continue;
      const X = p.x + a, Y = p.y + b, edge = u * u + v * v > 0.72;
      let sh = 0.52 - u * 0.25 - v * 0.15 + (edge && a + b > 0 ? -0.22 : 0) + (edge && a + b < 0 ? 0.15 : 0);
      if ((Math.round(u * 3) + Math.round(v * 4)) % 2 === 0 && hash(Math.round(u * 3), Math.round(v * 4), seed) > 0.4 && !edge && (a + b) % 3 === 0) sh += 0.35;   // areoles
      px(G, X, Y, step(R, sh, X | 0, Y | 0, 0.2), sN(u * 0.6, -0.2, 0.8), 0);
    }
    if (rnd() < 0.55) { const fa = p.a + (rnd() - 0.5) * 1.2, fx = p.x + Math.sin(fa) * p.r * 0.95, fy = p.y - Math.cos(fa) * p.r * 0.95; bloom(G, fx, fy - 1, 'poppy', Fl, 1, seed); }
  }
  pebbles(G, cx, foot, 6, 34, seed); tufts(G, cx, foot, 4, 30, seed, FOL('#8a9a3a'));
  return done(G);
}
export function barrelCacti(seed = 1) {
  const rnd = mulberry32(seed * 199 + 1), G = sprite(70, 50, 5), cx = G.ax, foot = G.ay, R = FOL('#4e8a3a', { warm: 70, shift: 0.45, desat: 0.2 }), Fl = RR('#f0b020', 6, 3, { light: 0.55 });
  for (const [ox, oy, r] of [[-9, -2, 11], [9, 2, 8.5]]) {
    const x = cx + ox, y = foot + oy - r * 1.05;
    for (let b = -Math.ceil(r * 1.15); b <= r * 1.05; b++) for (let a = -Math.ceil(r); a <= r; a++) {
      const u = a / r, v = b / (r * 1.1); if (u * u + v * v > 1) continue;
      const w = Math.sqrt(1 - u * u - v * v), lon = Math.atan2(u, w), rib = Math.cos(lon * 7);
      let sh = 0.55 - u * 0.3 - v * 0.2 + (rib > 0.6 ? 0.15 : rib < -0.6 ? -0.22 : 0);
      if (rib > 0.6 && hash(x + a, y + b, seed) > 0.75) sh += 0.35;                                  // yellow-red spines
      px(G, x + a, y + b, step(R, sh, x + a, y + b, 0.25), sN(u, v, w), 0);
    }
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; bloom(G, x + Math.cos(a) * r * 0.32, y - r * 1.05 + Math.sin(a) * 1.4, 'dot', Fl, 1, seed); }
  }
  pebbles(G, cx, foot, 7, 26, seed); tufts(G, cx, foot, 3, 22, seed, FOL('#8a9a3a'));
  return done(G);
}
export function cholla(seed = 1) {
  const rnd = mulberry32(seed * 211 + 1), G = sprite(70, 70, 5), cx = G.ax, foot = G.ay, B = RR('#5a4a32', 6, 3), S = RR('#d8cc8a', 7, 3, { dark: 0.55, light: 0.45, shift: 0.25 });
  const segs = [];
  const grow = (x, y, a, d) => { const L = 7 + rnd() * 3, ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L; segs.push([x, y, ex, ey, d]); if (d < 4) { const n = d === 0 ? 4 : 1 + (rnd() < 0.7 ? 1 : 0); for (let i = 0; i < n; i++) grow(ex, ey, a + (i - (n - 1) / 2) * 0.9 + (rnd() - 0.5) * 0.4, d + 1); } };
  grow(cx, foot, -PI / 2, 0);
  limb(G, [cx, foot + 1], [cx, foot - 6], [cx, foot - 9], 2.6, 2.2, B, { seed });
  for (const [x0, y0, x1, y1, d] of segs) {
    if (d === 0) continue;
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) { const t = i / n, X = x0 + (x1 - x0) * t, Y = y0 + (y1 - y0) * t; for (let b = -3; b <= 3; b++) for (let a = -3; a <= 3; a++) { if (a * a + b * b > 7.5) continue; const sp = hash(Math.round(X + a), Math.round(Y + b), seed) > 0.55; px(G, X + a, Y + b, step(S, 0.55 - a * 0.1 - b * 0.08 + (sp ? 0.28 : -0.08) - (a * a + b * b > 4.5 && a + b > 0 ? 0.25 : 0), Math.round(X + a), Math.round(Y + b), 0.25), sN(a / 2.4, b / 2.4, 0.6), F_LEAF); } }
  }
  pebbles(G, cx, foot, 7, 22, seed); tufts(G, cx, foot, 5, 20, seed, FOL('#8a9a3a'));
  return done(G);
}
export function agave(seed = 1) {
  const rnd = mulberry32(seed * 223 + 1), G = sprite(80, 56, 5), cx = G.ax, foot = G.ay, R = FOL('#6a9aa2', { cool: 230, warm: 150, shift: 0.3, desat: 0.3 });
  const lv = [];
  for (let i = 0; i < 17; i++) { const a = -PI / 2 + (i / 16 - 0.5) * 3.0 + (rnd() - 0.5) * 0.15; lv.push({ a, l: 20 + rnd() * 10 - Math.abs(a + PI / 2) * 3, d: -Math.abs(a + PI / 2) }); }
  lv.sort((p, q) => p.d - q.d);
  for (const l of lv) { const [tx, ty] = blade(G, cx + Math.cos(l.a) * 2, foot - 2, l.a, l.l, 3.6, 0.01, R, { k: 0.5, edge: 0.18, teeth: true, stripe: 0.1, tipK: 0.1 }); px(G, tx, ty, [60, 40, 40], [0, 0, 1], 0); }
  pebbles(G, cx, foot, 6, 28, seed); tufts(G, cx, foot, 4, 26, seed, FOL('#8a9a3a'));
  return done(G);
}
export function yucca(seed = 1, bloomOn = true) {
  const rnd = mulberry32(seed * 227 + 1), G = sprite(80, 76, 5), cx = G.ax, foot = G.ay, R = FOL('#4e7a34', { warm: 66, desat: 0.2 }), W = RR('#f0ead0', 6, 3, { dark: 0.4, light: 0.6 });
  const lv = [];
  for (let i = 0; i < 80; i++) { const a = -PI / 2 + (rnd() - 0.5) * 2.7; lv.push({ a, l: 22 + rnd() * 12 - Math.abs(a + PI / 2) * 3, d: -Math.abs(a + PI / 2) + rnd() * 0.3 }); }
  lv.sort((p, q) => p.d - q.d);
  for (const l of lv) blade(G, cx + Math.cos(l.a) * 2, foot - 4, l.a, l.l, 1.2, 0.006, R, { k: 0.3 + (l.d + 1.5) * 0.18, tipK: 0.35 });
  if (bloomOn) { stem(G, cx, foot - 10, cx + 1, foot - 52, RR('#8a8a4a', 5, 2), 0.4); for (let k = 0; k < 20; k++) { const y = foot - 50 + k, w = 1 + Math.sin(PI * k / 20) * 3; for (let q = -Math.ceil(w); q <= w; q++) if (hash(q, k, seed) > 0.25) px(G, cx + q, y, step(W, 0.6 - q / (w + 1) * 0.3 + (k % 2 ? -0.12 : 0.05), cx + q, y, 0.2), sN(q / (w + 1), 0.2, 0.9)); } }
  pebbles(G, cx, foot, 6, 26, seed); tufts(G, cx, foot, 4, 24, seed, FOL('#8a9a3a'));
  return done(G);
}
const DRY = FOL('#8a8a3a', { warm: 50, desat: 0.2 });
export const creosote = (seed = 1) => shrub(seed, { w: 32, h: 40, R: FOL('#6e8a2a', { warm: 56 }), leaf: 'fine', cs: 2.6, holes: 0.5, airy: 0.25, dens: 0.22, stems: 12, B: RR('#5a3e2e', 6, 3), dens: 1.15, k: 5, after: (G, cx, foot) => pebbles(G, cx, foot, 5, 22, seed) });
export const sagebrush = (seed = 1) => shrub(seed, { w: 32, h: 32, airy: 0.15, dens: 0.75, R: FOL('#869a80', { warm: 80, shift: 0.25, desat: 0.35, cool: 210, dark: 0.6 }), leaf: 'fine', cs: 2.6, stems: 4, k: 6, after: (G, cx, foot) => pebbles(G, cx, foot, 5, 22, seed) });
export const brittlebush = (seed = 1) => shrub(seed, { w: 30, h: 32, R: FOL('#7a8a3a', { warm: 60 }), leaf: 'fine', cs: 2.6, stems: 9, airy: 0.25, dens: 0.28, flowers: { R: RR('#f0c020', 5, 2), k: 0.12, kind: 'dot' }, k: 7, after: (G, cx, foot) => pebbles(G, cx, foot, 5, 22, seed) });
export const whiteBursage = (seed = 1) => shrub(seed, { w: 30, h: 28, airy: 0.15, dens: 0.75, stems: 6, R: FOL('#a0a698', { warm: 60, shift: 0.2, desat: 0.4, cool: 220, dark: 0.6 }), leaf: 'fine', cs: 2.4, k: 8, after: (G, cx, foot) => pebbles(G, cx, foot, 5, 22, seed) });
export const desertPoppies = (seed = 1) => flowerBed(seed, { n: 14, kind: 'poppy', R: [RR('#f08a20', 6, 3, { light: 0.55 }), RR('#f0a030', 6, 3)], h: 12, spread: 28, size: 2, leaves: 'clump', L: FOL('#5e8a3a'), after: (G, cx, foot) => pebbles(G, cx, foot, 5, 24, seed), k: 2 });
export function desertFlowers(seed = 1) {
  const a = flowerBed(seed, { n: 12, kind: 'poppy', R: [RR('#f07a1a', 6, 3, { light: 0.55 }), RR('#e86020', 6, 3)], h: 12, spread: 26, size: 2, leaves: 'clump', L: FOL('#5e8a3a'), k: 3, after: (G, cx, foot) => pebbles(G, cx, foot, 5, 24, seed) });
  const b = spikes(seed + 1, { n: 5, h: 30, w: 12, R: RR('#7a5ac8', 6, 3, { light: 0.55 }), kind: 'pea', leaves: 'palm', L: FOL('#5e8a3a') });
  return compose([[b, -16, -2], [a, 4, 2]]);
}
export function dryGrass(seed = 1, size = 1) {
  const rnd = mulberry32(seed * 229 + 1), h = 22 * size + 6, G = sprite(h * 3 + 10, h + 12, 5), cx = G.ax, foot = G.ay, R = FOL('#c8a040', { warm: 52, cool: 30, shiftD: 0.4, dark: 0.6 });
  const bl = []; for (let i = 0; i < 40 * size + 12; i++) bl.push({ a: -PI / 2 + (rnd() - 0.5) * 1.6, l: h * (0.5 + rnd() * 0.55), x: cx + (rnd() - 0.5) * h * 0.3, d: rnd() });
  bl.sort((p, q) => p.d - q.d);
  for (const b of bl) blade(G, b.x, foot - 1, b.a, b.l, 0.6, 0.02, R, { k: 0.3 + b.d * 0.45 });
  pebbles(G, cx, foot, 3, h * 0.8, seed);
  return done(G);
}
export function tumbleweed(seed = 1, r = 14) {
  const rnd = mulberry32(seed * 233 + 1), G = sprite(r * 2 + 12, r * 2 + 12, 4), cx = G.ax, cyc = G.ay - r, R = RR('#a8845a', 7, 3, { dark: 0.6, light: 0.5 });
  const pts = [];
  for (let i = 0; i < 13; i++) {
    const ax = rnd() * TAU, ay = rnd() * TAU, ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay), rr = r * (0.75 + rnd() * 0.3);
    for (let t = 0; t < TAU; t += 0.05) { if (hash(i, Math.round(t * 6), seed) < 0.35) continue; let x = Math.cos(t) * rr, y = Math.sin(t) * rr, z = 0; [y, z] = [y * ca - z * sa, y * sa + z * ca]; [x, z] = [x * cb - z * sb, x * sb + z * cb]; pts.push([x, y, z]); }
  }
  pts.sort((a, b) => a[2] - b[2]);
  for (const [x, y, z] of pts) px(G, cx + x, cyc + y * 0.95, step(R, 0.45 + z / r * 0.35 - (x + y) / r * 0.15, Math.round(cx + x), Math.round(cyc + y), 0.2), sN(x / r, y / r, Math.max(0, z / r)), 0, Math.round(r - y));
  return done(G);
}
export function deadSnag(seed = 1) {
  const rnd = mulberry32(seed * 239 + 1), G = sprite(90, 80, 5), cx = G.ax, foot = G.ay, B = RR('#9a8a78', 7, 3, { dark: 0.6, light: 0.45, shift: 0.18 });
  const grow = (p, a, L, w, d) => { const e = [p[0] + Math.cos(a) * L, p[1] + Math.sin(a) * L], c = [(p[0] + e[0]) / 2 + (rnd() - 0.5) * L * 0.4, (p[1] + e[1]) / 2 + (rnd() - 0.5) * 4]; limb(G, p, c, e, w, w * 0.65, B, { seed, flare: d === 0 ? 0.8 : 0, k: 0.55 }); if (d < 3) { const n = d === 0 ? 2 : 1 + (rnd() < 0.6 ? 1 : 0); for (let i = 0; i < n; i++) grow(e, a + (i - (n - 1) / 2) * 0.9 + (rnd() - 0.5) * 0.5, L * (0.55 + rnd() * 0.2), w * 0.62, d + 1); } };
  grow([cx - 4, foot + 1], -PI / 2 - 0.25, 30, 4, 0); grow([cx + 5, foot + 1], -PI / 2 + 0.3, 26, 3.4, 1);
  pebbles(G, cx, foot, 7, 22, seed); tufts(G, cx, foot, 4, 20, seed, FOL('#8a9a3a'));
  return done(G);
}

// ---- palms ----------------------------------------------------------------------------------------------------
// o: h, lean (crown offset), bend, r (frond length), n (fronds), R, B, tex ('ring' | 'diamond' | 'smooth'),
// tw, shaft (green crownshaft: royal palm), nuts (coconuts), dates, fan (fan palm), skirt (dead frond skirt
// as a fraction of the trunk), squat
export function palmTree(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 307 + (o.k || 0)), h = (o.h ?? 120) * SIZE, r = (o.r ?? 40) * SIZE, lean = (o.lean ?? 0) * SIZE, G = sprite(r * 2.6 + Math.abs(lean) * 2 + 20, h + r + 16, 6);
  const cx = G.ax, foot = G.ay, tx = cx + lean, ty = foot - h, R = o.R || FOL('#4e8a2a'), B = o.B || RR('#8a6a48', 7, 3, { dark: 0.6, light: 0.45 }), tw = (o.tw ?? 3.6) * tk();
  const p1 = [cx + (o.bend ?? (o.lean ?? 0) * 0.15) * SIZE, foot - h * 0.55];
  // dead frond skirt behind and round the upper trunk
  const skirt = () => { if (!o.skirt) return; const S = RR('#9a7448', 7, 3, { dark: 0.6, light: 0.45 }), sl = h * o.skirt; for (let i = 0; i < 70; i++) { const u = rnd() * 2 - 1, x0 = tx + u * (tw + 6), len = sl * (0.5 + rnd() * 0.5) * (1 - Math.abs(u) * 0.3); for (let k = 0; k < len; k++) { const X = x0 + u * k * 0.25 + Math.sin(k * 0.3 + i) * 0.4, Y = ty + 2 + k; px(G, X, Y, step(S, 0.45 - u * 0.25 - k / len * 0.25 + (hash(i, k >> 1, seed) > 0.7 ? 0.2 : 0) - (i % 3 === 0 ? 0.2 : 0), X | 0, Y | 0, 0.3), [u * 0.6, 0.6, 0.5], 0); } } };
  if (o.skirt) skirt();
  limb(G, [cx, foot + 1], p1, [tx, ty], tw * (o.squat ? 1.6 : 1), tw * (o.squat ? 1.3 : 0.75), B, { seed, tex: o.tex || 'ring', flare: o.flare ?? 0.5, k: 0.55 });
  if (o.skirt) { const S = RR('#8a6438', 7, 3, { dark: 0.6 }); for (let i = 0; i < 40; i++) { const u = rnd() * 2 - 1, x0 = tx + u * (tw + 4), len = h * o.skirt * (0.4 + rnd() * 0.5); if (Math.abs(u) < 0.35) continue; for (let k = 0; k < len; k++) { const X = x0 + u * k * 0.3, Y = ty + 4 + k; px(G, X, Y, step(S, 0.5 - u * 0.3 - k / len * 0.3 + (hash(i, k, seed) > 0.75 ? 0.2 : 0), X | 0, Y | 0, 0.3), [u * 0.6, 0.6, 0.5], 0); } } }
  if (o.shaft) limb(G, [tx, ty + h * 0.16], [tx, ty + h * 0.08], [tx, ty - 2], tw * 0.95, tw * 0.85, FOL('#5a8a3a'), { tex: 'smooth', seed, k: 0.55 });
  // fronds round the crown, the ones leaning away from the camera first
  const fr = [];
  const n = o.n ?? 16;
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rnd() * 0.35; fr.push({ a, L: r * (0.75 + rnd() * 0.32), up: 0.22 + rnd() * 0.35 - Math.max(0, Math.sin(a)) * 0.1, droop: (o.droop ?? 0.6) * (0.75 + rnd() * 0.5) + Math.max(0, Math.sin(a)) * 0.15, d: Math.sin(a) }); }
  fr.sort((p, q) => p.d - q.d);
  const front = fr.filter((f) => f.d > 0.25), back = fr.filter((f) => f.d <= 0.25);
  const drawF = (f) => (o.fan ? fanFrond(G, tx, ty, f, R, seed) : featherFrond(G, tx, ty, f, R, o, seed));
  back.forEach(drawF);
  if (o.nuts) { const NR = RR('#8a6a2a', 5, 2, { light: 0.5 }); for (let k = 0; k < o.nuts; k++) fruit(G, tx + (rnd() - 0.5) * 7, ty + 3 + rnd() * 3, 2.3, NR); }
  if (o.dates) { const DR = RR('#c86a20', 6, 3, { light: 0.5 }); for (let k = 0; k < o.dates; k++) { const x0 = tx + (k - (o.dates - 1) / 2) * 5, y0 = ty + 4; for (let q = 0; q < 26; q++) { const X = x0 + (rnd() - 0.5) * 5, Y = y0 + rnd() * 9 + q * 0.12; px(G, X, Y, step(DR, 0.3 + rnd() * 0.5 - (Y - y0) * 0.02, X | 0, Y | 0, 0), [-0.3, 0.5, 0.7], 0); } } }
  front.forEach(drawF);
  if (o.ground) tufts(G, cx, foot, 6, 16, seed, FOL('#6a8a2a'));
  return done(G);
}
function featherFrond(G, tx, ty, f, R, o, seed) {
  const ca = Math.cos(f.a), sa = Math.sin(f.a), n = Math.ceil(f.L * 1.6), lit0 = (o.g ?? 0.5) + (ca < -0.3 ? 0.08 : ca > 0.4 ? -0.06 : 0) - (sa < -0.4 ? 0.12 : 0);
  let prevX = tx, prevY = ty;
  for (let i = 0; i <= n; i++) {
    const s = i / n, along = s * f.L, lift = (f.up * Math.sin(PI * s * 0.8) - f.droop * s * s * 0.55) * f.L;
    const X = tx + ca * along, Y = ty + sa * along * 0.42 - lift;
    let dx = X - prevX, dy = Y - prevY; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl; prevX = X; prevY = Y;
    const ll = (o.leaf ?? 11) * sq() * Math.sin(PI * Math.min(1, s * 1.05 + 0.05)) * (s < 0.1 ? 0.35 : 1);
    const ph = i % 4; if (ph >= 2 || i === 0) { px(G, X, Y, step(R, lit0 - 0.15, X | 0, Y | 0, 0), [ca * 0.3, 0.3, 0.9], F_LEAF); continue; }
    const side = ph === 0 ? -1 : 1;
    let lx = -dy * side * 0.85 + dx * 0.45, ly = dx * side * 0.85 + dy * 0.45 + 0.32; const l2 = Math.hypot(lx, ly) || 1; lx /= l2; ly /= l2;
    const up = (-dy * side) * 0 + (dx * side) < 0, bright = hash(i, side, seed + (f.a * 100 | 0)) > 0.5;
    for (let k = 1; k <= ll; k++) {
      const qx = X + lx * k, qy = Y + ly * k + (k / ll) ** 2 * 1.8;
      const t = lit0 + (up ? 0.18 : -0.1) + (bright ? 0.08 : -0.08) - k / ll * 0.12 + (k > ll - 2 ? 0.14 : 0) + (s > 0.65 ? 0.06 : 0);
      px(G, qx, qy, step(R, t, qx | 0, qy | 0, 0.25), [lx * 0.5 + ca * 0.3, 0.3 + ly * 0.25, 0.75], F_LEAF);
    }
    px(G, X, Y, step(R, lit0 - 0.15, X | 0, Y | 0, 0), [ca * 0.3, 0.3, 0.9], F_LEAF);
  }
}
function fanFrond(G, tx, ty, f, R, seed) {
  const ca = Math.cos(f.a), sa = Math.sin(f.a) * 0.6, fx = tx + ca * f.L * 0.45, fy = ty + sa * f.L * 0.45 - (1 - Math.abs(Math.sin(f.a))) * 3 - (sa < 0 ? 6 : 0);
  stem(G, tx, ty, fx, fy, R, 0.25);
  const nb = 12, dir = Math.atan2(sa - 0.6, ca);
  for (let b = 0; b < nb; b++) {
    const ang = dir + (b / (nb - 1) - 0.5) * 2.4, len = f.L * 0.6 * (1 - Math.abs(b / (nb - 1) - 0.5) * 0.5);
    for (let k = 0; k < len; k++) {
      const t = k / len, X = fx + Math.cos(ang) * k, Y = fy + Math.sin(ang) * k * 0.8 + t * t * len * 0.18;
      const sh = 0.5 + (b % 2 ? 0.12 : -0.12) - t * 0.12 + (Math.cos(ang) + Math.sin(ang) < 0 ? 0.12 : -0.08) - (f.d < -0.3 ? 0.12 : 0) + (t > 0.85 ? 0.12 : 0);
      px(G, X, Y, step(R, sh, X | 0, Y | 0, 0.3), [Math.cos(ang) * 0.4, 0.3, 0.85], F_LEAF);
      if (t < 0.35) px(G, X + 1, Y, step(R, sh - 0.08, X | 0, Y | 0, 0.3), [Math.cos(ang) * 0.4, 0.3, 0.85], F_LEAF);
    }
  }
}
export const coconutPalm = (seed = 1) => palmTree(seed, { h: 98, lean: 10, bend: 18, r: 58, n: 13, leaf: 10, R: FOL('#4a8a2a'), nuts: 5, tex: 'ring', ground: true });
export const royalPalm = (seed = 1) => palmTree(seed, { h: 102, lean: 0, bend: 0, r: 52, n: 13, leaf: 10, R: FOL('#4e8a2a'), B: RR('#b0a898', 7, 3, { dark: 0.55, light: 0.4 }), tex: 'smooth', shaft: true, tw: 4, ground: true, k: 1 });
export const fanPalmSkirt = (seed = 1) => palmTree(seed, { h: 82, lean: 0, r: 48, n: 13, fan: true, R: FOL('#4e8a2c'), B: RR('#7a5a3a', 7, 3), tex: 'diamond', tw: 6, skirt: 0.32, ground: true, k: 2 });
export const leaningPalm = (seed = 1) => palmTree(seed, { h: 84, lean: 50, bend: 4, r: 54, n: 13, leaf: 10, R: FOL('#4a8a2a'), tex: 'ring', ground: true, droop: 0.75, k: 3 });
export const datePalm = (seed = 1) => palmTree(seed, { h: 52, lean: 0, r: 38, n: 16, R: FOL('#4e8a2a'), B: RR('#8a5a34', 7, 3), tex: 'diamond', tw: 5.5, dates: 3, ground: true, leaf: 6, droop: 0.4, k: 4 });
export const desertFanPalm = (seed = 1) => palmTree(seed, { h: 40, lean: 0, r: 34, n: 11, fan: true, R: FOL('#6a9a2a'), B: RR('#8a6438', 7, 3), tex: 'diamond', tw: 7, skirt: 0.45, squat: true, ground: true, k: 5 });

// ---- tropical and coast (E3d) --------------------------------------------------------------------------------
export function banana(seed = 1) {
  const rnd = mulberry32(seed * 311 + 1), G = sprite(130, 110, 5), cx = G.ax, foot = G.ay, R = FOL('#6a9a2a'), S = RR('#9a9a5a', 6, 3);
  const trunks = [[-8, 50], [5, 60], [16, 40]];
  const leaves = [];
  for (const [ox, th] of trunks) for (let i = 0; i < 4; i++) { const a = -PI / 2 + (i - 1.5) * 0.8 + (rnd() - 0.5) * 0.3; leaves.push({ x: cx + ox, y: foot - th, a, l: 34 + rnd() * 10, d: rnd() }); }
  leaves.sort((a, b) => a.d - b.d);
  for (const [ox, th] of trunks) limb(G, [cx + ox, foot + 1], [cx + ox, foot - th * 0.5], [cx + ox, foot - th], 3, 2.2, S, { tex: 'smooth', seed, k: 0.55 });
  for (const l of leaves) { stem(G, l.x, l.y, l.x + Math.cos(l.a) * 4, l.y + Math.sin(l.a) * 4, S, 0.4); bigLeaf(G, l.x + Math.cos(l.a) * 4, l.y + Math.sin(l.a) * 4, l.a, l.l, 7, R, { shape: 'paddle', droop: 0.03, tears: true, seed: seed + (l.x | 0), vein: 2.2, fold: 0.22 }); }
  tufts(G, cx, foot, 6, 22, seed, FOL('#5a8a2a'));
  return done(G);
}
export function monstera(seed = 1) {
  const rnd = mulberry32(seed * 313 + 1), G = sprite(100, 84, 5), cx = G.ax, foot = G.ay, R = FOL('#2e7a34'), S = FOL('#3a7a2a');
  const lv = []; for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 9 - 0.5) * 2.6; lv.push({ a, h: 24 + rnd() * 24 - Math.abs(i - 4.5) * 2.5, d: rnd() }); }
  lv.sort((a, b) => a.d - b.d);
  for (const l of lv) { const ex = cx + Math.cos(l.a) * l.h * 0.6, ey = foot - 2 + Math.sin(l.a) * l.h * 0.75; stem(G, cx, foot - 1, ex, ey, S, 0.35, (rnd() - 0.5) * 3); bigLeaf(G, ex, ey - 2, l.a + PI * 0.55 * Math.sign(Math.cos(l.a) || 1) * 0.4 + PI * 0.15, 21 + rnd() * 4, 10.5, R, { shape: 'heart', split: true, droop: 0.05, seed, vein: 0, fold: 0.18 }); }
  return done(G);
}
export function elephantEar(seed = 1) {
  const rnd = mulberry32(seed * 317 + 1), G = sprite(100, 90, 5), cx = G.ax, foot = G.ay, R = FOL('#3e8a34'), S = FOL('#4a8a2a');
  const lv = []; for (let i = 0; i < 6; i++) { const a = -PI / 2 + (i / 5 - 0.5) * 2.3; lv.push({ a, h: 40 + rnd() * 14 - Math.abs(i - 2.5) * 5, d: rnd() }); }
  lv.sort((a, b) => a.d - b.d);
  for (const l of lv) { const ex = cx + Math.cos(l.a) * l.h * 0.75, ey = foot - 2 + Math.sin(l.a) * l.h * 0.8; stem(G, cx, foot - 1, ex, ey, S, 0.35, (rnd() - 0.5) * 2); bigLeaf(G, ex, ey - 5, PI / 2 + (ex - cx) * 0.03, 22 + rnd() * 4, 11, R, { shape: 'heart', seed, vein: 2.8, fold: 0.2 }); }
  return done(G);
}
export function birdOfParadise(seed = 1) {
  const rnd = mulberry32(seed * 331 + 1), G = sprite(100, 110, 5), cx = G.ax, foot = G.ay, R = FOL('#3e8040'), O = RR('#f07a20', 6, 3, { light: 0.55 }), Bl = RR('#3a5ab8', 5, 2);
  const lv = []; for (let i = 0; i < 9; i++) { const a = -PI / 2 + (i / 8 - 0.5) * 1.5 + (rnd() - 0.5) * 0.1; lv.push({ a, l: 56 + rnd() * 22 - Math.abs(i - 4) * 4, d: rnd() }); }
  lv.sort((a, b) => a.d - b.d);
  for (const l of lv) { const ex = cx + Math.cos(l.a) * l.l * 0.4, ey = foot + Math.sin(l.a) * l.l * 0.4; stem(G, cx, foot - 1, ex, ey, R, 0.3); bigLeaf(G, ex, ey, l.a, l.l * 0.6, 6, R, { shape: 'lance', droop: 0.02, seed, vein: 0, fold: 0.25 }); }
  for (let k = 0; k < 3; k++) {
    const x = cx - 10 + k * 10 + (rnd() - 0.5) * 3, y = foot - 60 - rnd() * 12 + k * 4; stem(G, x, foot - 6, x, y + 2, R, 0.4);
    for (let q = 0; q < 9; q++) { px(G, x + q * 0.9, y + q * 0.15, step(R, 0.45, 0, 0, 0), [0, 0.3, 0.9]); px(G, x + q * 0.9, y + 1 + q * 0.15, step(R, 0.3, 0, 0, 0), [0, 0.6, 0.6]); }
    for (let q = 0; q < 6; q++) { const X = x + 1 + q * 1.2, Y = y - 1 - (q % 3) * 2 - q * 0.4; for (let m = 0; m < 4; m++) px(G, X + m * 0.3, Y - m, step(O, 0.7 - m * 0.08 - q * 0.03, X | 0, Y | 0, 0), [-0.3, 0.1, 0.95]); }
    px(G, x + 6, y - 1, step(Bl, 0.6, 0, 0, 0), [0, 0.2, 1]); px(G, x + 7, y - 2, step(Bl, 0.4, 0, 0, 0), [0, 0.2, 1]);
  }
  return done(G);
}
export const hibiscus = (seed = 1) => shrub(seed, { w: 32, h: 42, R: FOL('#2e7030'), cs: 3, flowers: { R: RR('#e0202a', 6, 3, { light: 0.55 }), k: 0.12, kind: 'poppy', size: 2 }, k: 9 });
export const bougainvillea = (seed = 1) => shrub(seed, { w: 34, h: 58, R: FOL('#3a7a2a'), cs: 3, leaf: 'fine', holes: 0.5, stems: 6, airy: 0.3, dens: 0.6, flowers: { R: RR('#d81a78', 6, 3, { light: 0.5, shift: 0.1 }), k: 0.35, kind: 'star' }, lobes: 7, squash: 1.1, k: 10, after: (G, cx, foot) => litter(G, cx, foot, 16, [[216, 40, 120], [180, 30, 100]], 5, 16) });
// grasses with seed plumes: dune grass, beach grass, tall meadow grass. o: h, n, R, plume (ramp), spread
export function grassClump(seed = 1, o = {}) {
  const rnd = mulberry32(seed * 337 + (o.k || 0)), h = o.h ?? 30, sp = o.spread ?? 1, G = sprite(h * 2.6 * sp + 14, h + 18, 5), cx = G.ax, foot = G.ay, R = o.R || FOL('#8a9a3a', { warm: 52 });
  const bl = []; for (let i = 0; i < (o.n ?? 70); i++) bl.push({ x: cx + (rnd() - 0.5) * h * 0.5 * sp, a: -PI / 2 + (rnd() - 0.5) * 1.5, l: h * (0.45 + rnd() * 0.55), d: rnd() });
  bl.sort((p, q) => p.d - q.d);
  for (const b of bl) blade(G, b.x, foot - 1, b.a, b.l, o.w ?? 0.75, 0.015, R, { k: 0.28 + b.d * 0.45 });
  if (o.plume) for (let i = 0; i < (o.plumes ?? 5); i++) {
    const x0 = cx + (rnd() - 0.5) * h * 0.45 * sp, a = -PI / 2 + (rnd() - 0.5) * 0.8, L = h * (0.8 + rnd() * 0.35);
    const [ex, ey] = blade(G, x0, foot - 1, a, L, 0.4, 0.008, R, { k: 0.45 });
    const pl = o.plumeLen ?? 9;
    for (let k = 0; k < pl; k++) { const wd = (o.plumeW ?? 1.5) * Math.sin(PI * (k + 1) / (pl + 1)); const X = ex + Math.cos(a) * k * 0.9 + (k / pl) ** 2 * 3 * Math.sign(Math.cos(a) || 0.1), Y = ey + Math.sin(a) * k * 0.9; for (let q = -Math.ceil(wd); q <= wd; q++) px(G, X + q, Y, step(o.plume, 0.6 - q / (wd + 1) * 0.3 + (k % 2 ? -0.1 : 0.08), X + q | 0, Y | 0, 0.2), sN(q / (wd + 1), 0, 0.9)); }
  }
  if (o.after) o.after(G, cx, foot);
  return done(G);
}
export const duneGrass = (seed = 1) => grassClump(seed, { h: 46, n: 110, spread: 1.3, R: FOL('#9aa040', { warm: 50 }), plume: RR('#d8c08a', 6, 3, { dark: 0.45 }), plumes: 6, k: 1 });
export const beachGrass = (seed = 1) => grassClump(seed, { h: 42, n: 140, spread: 1.4, R: FOL('#a0a048', { warm: 48, desat: 0.2 }), k: 2 });
export const tallGrass = (seed = 1) => grassClump(seed, { h: 46, n: 150, spread: 1.1, R: FOL('#6e9230'), plume: RR('#c0a050', 5, 2), plumes: 9, plumeW: 0.6, plumeLen: 6, k: 3 });
export function icePlant(seed = 1) {
  const rnd = mulberry32(seed * 347 + 1), G = sprite(120, 40, 6), cx = G.ax, foot = G.ay, R = FOL('#6aa03a', { warm: 70 }), P = RR('#e8509a', 6, 3, { light: 0.6 });
  const pts = []; for (let i = 0; i < 380; i++) { const a = rnd() * TAU, q = Math.sqrt(rnd()); pts.push([cx + Math.cos(a) * q * 50, foot - 6 + Math.sin(a) * q * 11 - (1 - q) * 5]); }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pts) { G.root = { y: y + 3, b: 0 }; const a = -PI / 2 + (rnd() - 0.5) * 2; blade(G, x, y + 2, a, 4 + rnd() * 4, 1.5, 0, R, { k: 0.35 + rnd() * 0.35, tipK: 0.5 }); }
  for (let i = 0; i < 22; i++) { const [x, y] = pts[Math.floor(rnd() * pts.length)]; G.root = { y: y + 3, b: 0 }; bloom(G, x, y - 2, 'daisy', P, 1, seed); }
  G.root = null;
  return done(G);
}
export function coastalCypress(seed = 1, k = 1.4) {
  const ky = 1.05, rnd = mulberry32(seed * 349 + 1), G = sprite(150 * k, 90 * ky, 5), cx = G.ax, foot = G.ay, B = RR('#6a4a3a', 7, 3), R = FOL('#3a6a2e');
  const tr = [[cx + 12 * k, foot + 1], [cx + 22 * k, foot - 22 * ky], [cx - 4 * k, foot - 40 * ky]], lobes = [], limbs = [];
  for (let i = 0; i < 10; i++) { const t = 0.35 + i * 0.07, p = qpt(tr[0], tr[1], tr[2], Math.min(1, t)), dir = i % 3 === 0 ? 1 : -1, L = (14 + rnd() * 30 * (dir < 0 ? 1.3 : 0.7)) * k, e = [p[0] + dir * L, p[1] - (6 + rnd() * 8) * ky]; limbs.push([p, [(p[0] + e[0]) / 2, p[1] - 6 * ky], e]); lobes.push({ x: e[0], y: e[1] - 3, r: (11 + rnd() * 6) * k, ry: (4.5 + rnd() * 2) * ky }); }
  lobes.push({ x: cx - 4 * k, y: foot - 46 * ky, r: 22 * k, ry: 6 * ky }, { x: cx - 30 * k, y: foot - 42 * ky, r: 18 * k, ry: 5 * ky }, { x: cx + 22 * k, y: foot - 40 * ky, r: 14 * k, ry: 5 * ky });
  const cls = massEll(lobes, rnd, 3.2, 1.5);
  paintClusters(G, cls, { R, seed, leaf: 'round', core: true, backW: 0.4, mid: () => { limb(G, tr[0], tr[1], tr[2], 4 * k, 2 * k, B, { seed, flare: 0.8 }); for (const [a, b, c] of limbs) limb(G, a, b, c, 1.6 * k, 0.8, B, { seed, k: 0.45 }); } });
  const low = massEll([{ x: cx - 22 * k, y: foot - 6 * ky, r: 18 * k, ry: 6 * ky }, { x: cx + 30 * k, y: foot - 5 * ky, r: 14 * k, ry: 5 * ky }], rnd, 2.8, 1.5);
  paintClusters(G, low, { R: FOL('#4a7a2a'), seed: seed + 1, core: true });
  return compose([[done(G), 0, 0], [vr(rock(seed + 2, 18, { color: '#8a8478' })), 6, 5], [vr(rock(seed + 3, 13)), 24, 7], [vr(rock(seed + 4, 12)), -14, 7]]);
}
// beach wrack lying on sand: kelp ropes with bladders, or red seaweed
export function kelpPile(seed = 1) {
  const rnd = mulberry32(seed * 353 + 1), G = sprite(160, 56, 26), cx = G.ax, foot = G.ay, K = RR('#7a6420', 7, 3, { dark: 0.62, light: 0.45 }), Bd = RR('#a07a20', 6, 3, { light: 0.55 });
  for (let i = 0; i < 13; i++) {
    let x = cx + (rnd() - 0.5) * 100, y = foot + (rnd() - 0.5) * 24, a = rnd() * TAU; const len = 26 + rnd() * 36, w = 1.8 + rnd() * 1;
    for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.35; x += Math.cos(a); y += Math.sin(a) * 0.45; for (let q = -w; q <= w; q += 0.5) px(G, x, y + q, step(K, 0.5 - q * 0.2 + (k % 5 === 0 ? 0.15 : 0), x | 0, y | 0, 0.3), [0, -q * 0.3, 1], 0, 2); if (k % 9 === 4) fruit(G, x + 2, y - 1, 1.8, Bd, 3); }
  }
  pebbles(G, cx, foot, 9, 56, seed, RR('#8a8a90', 6, 3), 2.6);
  return done(G);
}
export function seaweed(seed = 1) {
  const rnd = mulberry32(seed * 359 + 1), G = sprite(130, 50, 24), cx = G.ax, foot = G.ay, R = RR('#8a2a1e', 7, 3, { dark: 0.62, light: 0.5 });
  const branch = (x, y, a, len, d) => { for (let k = 0; k < len; k++) { a += (rnd() - 0.5) * 0.4; x += Math.cos(a); y += Math.sin(a) * 0.45; px(G, x, y, step(R, 0.45 + (rnd() - 0.5) * 0.4, x | 0, y | 0, 0.3), [0, 0, 1], 0, 2); px(G, x, y + 1, step(R, 0.2, x | 0, y | 0, 0.3), [0, 0.5, 0.8], 0, 1); if (d < 3 && rnd() < 0.18) branch(x, y, a + (rnd() < 0.5 ? -0.8 : 0.8), len * 0.5, d + 1); } };
  for (let i = 0; i < 20; i++) branch(cx + (rnd() - 0.5) * 76, foot + (rnd() - 0.5) * 20, rnd() * TAU, 16 + rnd() * 16, 0);
  pebbles(G, cx, foot, 4, 36, seed, RR('#8a8a90', 6, 3), 2);
  return done(G);
}
export function mangroves(seed = 1) {
  const rnd = mulberry32(seed * 367 + 1), G = sprite(200, 100, 8), cx = G.ax, foot = G.ay, B = RR('#6a4430', 7, 3, { dark: 0.62 }), R = FOL('#5a8a2a');
  const lobes = []; for (let i = 0; i < 16; i++) { const x = cx + (i / 15 - 0.5) * 160 + (rnd() - 0.5) * 8; lobes.push({ x, y: foot - 42 - rnd() * 8 + Math.abs(x - cx) * 0.1, r: 12 + rnd() * 6, ry: 10 + rnd() * 3 }); }
  const roots = [];
  for (let i = 0; i < 34; i++) { const x0 = cx + (rnd() - 0.5) * 150, y0 = foot - 28 - rnd() * 6, s = rnd() < 0.5 ? -1 : 1, x1 = x0 + s * (8 + rnd() * 10), y1 = foot - 1 + rnd() * 6; roots.push([[x0, y0], [x0 + s * 4, y0 - 8], [x1, y1]]); }
  const cls = massEll(lobes, rnd, 3, 1.4);
  paintClusters(G, cls, { R, seed, leaf: 'round', core: true, backW: 0.3, mid: () => { for (const [a, b, c] of roots) limb(G, a, b, c, 1.4, 1, B, { seed, k: 0.45 }); for (let i = 0; i < 10; i++) { const x = cx + (i / 9 - 0.5) * 140; limb(G, [x, foot - 26], [x + 2, foot - 34], [x + (rnd() - 0.5) * 10, foot - 42], 2, 1.2, B, { seed }); } } });
  // reflections and ripples where the roots meet the water
  for (const r of roots) { const [x, y] = r[2]; for (let k = -2; k <= 2; k++) px(G, x + k, y + 1, [190, 220, 230], [0, 0, 1], F_GROUND | F_WATER, 0); }
  return done(G);
}

// ---- farm, garden and wetland (E3e) ----------------------------------------------------------------------------
const WHEAT_G = FOL('#7a9a30'), WHEAT_Y = FOL('#d8b048', { warm: 52, cool: 30, shiftD: 0.35, dark: 0.62 });
// wheat at stage 0 (green shoots), 1 (heading), 2 (ripe)
export function wheat(seed = 1, st = 2) {
  const rnd = mulberry32(seed * 401 + st), h = [14, 27, 33][st], G = sprite(60, h + 20, 5), cx = G.ax, foot = G.ay, R = st === 0 ? WHEAT_G : st === 1 ? FOL('#a8a838', { warm: 50 }) : WHEAT_Y;
  const n = [9, 16, 22][st], sl = [];
  for (let i = 0; i < n; i++) sl.push({ x: cx + (rnd() - 0.5) * 24, a: -PI / 2 + (rnd() - 0.5) * 0.36, l: h * (0.75 + rnd() * 0.3), d: rnd() });
  sl.sort((a, b) => a.d - b.d);
  for (const s2 of sl) {
    blade(G, s2.x, foot - 1, s2.a + (rnd() < 0.5 ? -0.5 : 0.5), s2.l * 0.5, 0.9, 0.05, st === 2 ? FOL('#9a9a40') : WHEAT_G, { k: 0.4 + s2.d * 0.3 });
    const [ex, ey] = blade(G, s2.x, foot - 1, s2.a, s2.l, st === 0 ? 0.9 : 0.5, 0.004, R, { k: 0.35 + s2.d * 0.3 });
    if (st > 0) for (let k = 0; k < 8; k++) { const X = ex + Math.cos(s2.a) * k * 0.8, Y = ey + Math.sin(s2.a) * k * 0.8 + 2; for (const q of [-1, 0, 1]) px(G, X + q, Y, step(R, 0.65 - q * 0.3 + (k % 2 ? -0.2 : 0.05) + s2.d * 0.1, X | 0, Y | 0, 0), [q - 0.2, 0.2, 0.9]); if (k > 4 && st === 2) px(G, X - 1.5, Y - 1, step(R, 0.8, 0, 0, 0), [0, 0, 1]); }
  }
  return done(G);
}
export function corn(seed = 1, st = 2) {
  const rnd = mulberry32(seed * 409 + st), h = [14, 36, 52][st], G = sprite(64, h + 20, 5), cx = G.ax, foot = G.ay, R = FOL('#5e9a2c');
  if (st === 0) { for (let i = 0; i < 5; i++) blade(G, cx, foot - 1, -PI / 2 + (i - 2) * 0.55, 12 + rnd() * 4, 2, 0.06, R, { k: 0.45, stripe: 0.12 }); return done(G); }
  limb(G, [cx, foot + 1], [cx, foot - h * 0.5], [cx, foot - h], 1.6, 1, FOL('#7a9a3a'), { tex: 'smooth', seed });
  const nl = st === 1 ? 6 : 9;
  for (let i = 0; i < nl; i++) { const y = foot - 3 - i * (h * 0.85 / nl), sd = i % 2 ? 1 : -1; blade(G, cx, y, -PI / 2 + sd * (0.5 + rnd() * 0.5), 16 + rnd() * 8 - i * 0.5, 2, 0.08, R, { k: 0.45 + (sd < 0 ? 0.1 : -0.05), stripe: 0.12 }); }
  if (st === 2) {
    const T = RR('#c8a050', 5, 2); for (let i = 0; i < 7; i++) blade(G, cx, foot - h, -PI / 2 + (i - 3) * 0.3, 6 + rnd() * 3, 0.5, 0.08, T, { k: 0.55 });
    for (const [sd, y] of [[1, foot - h * 0.45], [-1, foot - h * 0.6]]) { for (let k = 0; k < 7; k++) for (let q = -1; q <= 1; q++) px(G, cx + sd * 2 + q, y - k, step(RR('#f0c030', 5, 2), 0.55 - q * 0.2 + (k % 2 ? -0.1 : 0.05), 0, 0, 0), [q * 0.5, 0.3, 0.8], 0); blade(G, cx + sd * 1, y + 1, -PI / 2 + sd * 0.3, 8, 1.6, 0, R, { k: 0.4 }); }
  }
  return done(G);
}
export function cabbage(seed = 1, st = 2) {
  const rnd = mulberry32(seed * 419 + st), G = sprite(64, 44, 5), cx = G.ax, foot = G.ay, R = FOL('#5a9a4a', { warm: 90, shift: 0.5 }), H = FOL('#9ac868', { warm: 70 });
  const n = [4, 9, 12][st], L = [8, 13, 17][st];
  const lv = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rnd() * 0.3; lv.push({ a, d: Math.sin(a) }); }
  lv.sort((p, q) => p.d - q.d);
  for (const l of lv) bigLeaf(G, cx, foot - 4, l.a * 0.7 - PI * 0.15 - (l.d < 0 ? 0.3 : 0), L * (l.d < 0 ? 0.8 : 1), L * 0.5, R, { shape: 'round', seed, vein: 2.2, fold: 0.18, droop: 0.04, k: 0.48 + (Math.cos(l.a) < 0 ? 0.08 : -0.05) });
  if (st > 0) { const r = st === 2 ? 8 : 5; for (let b = -r; b <= r * 0.7; b++) for (let a = -r; a <= r; a++) { const u = a / r, v = b / r; if (u * u + v * v > 1) continue; const lam = Math.abs(Math.sin(Math.atan2(v, u) * 2 + Math.hypot(u, v) * 3)); px(G, cx + a, foot - 5 - r * 0.6 + b, step(H, 0.6 - u * 0.25 - v * 0.25 + (lam < 0.15 ? -0.25 : 0), cx + a, b, 0.2), sN(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))), F_LEAF); } }
  return done(G);
}
export function tomato(seed = 1, st = 2) {
  const rnd = mulberry32(seed * 421 + st), h = [14, 38, 46][st], G = sprite(52, h + 20, 5), cx = G.ax, foot = G.ay, W = RR('#8a6438', 6, 3);
  if (st > 0) for (const sx of st === 2 ? [-6, 6] : [3]) for (let y = foot + 1; y > foot - h - 4; y--) { px(G, cx + sx, y, step(W, 0.6, 0, 0, 0), [-0.4, 0.5, 0.7], 0); px(G, cx + sx + 1, y, step(W, 0.35, 0, 0, 0), [0.4, 0.5, 0.7], 0); }
  if (st === 0) { stem(G, cx, foot, cx, foot - 8, FOL('#4e8a2a'), 0.4); for (let i = 0; i < 4; i++) bigLeaf(G, cx, foot - 7, -PI / 2 + (i - 1.5) * 0.9, 7, 3, FOL('#4e8a2a'), { shape: 'oval', seed }); return done(G); }
  const cls = massEll([{ x: cx, y: foot - h * 0.5, r: 12, ry: h * 0.45 }, { x: cx - 5, y: foot - h * 0.75, r: 8 }, { x: cx + 6, y: foot - h * 0.35, r: 8 }], rnd, 3, 1.3);
  paintClusters(G, cls, { R: FOL('#3e7a2a'), leaf: 'maple', seed, core: true, fruit: st === 2 ? { R: RR('#d8281e', 6, 3, { light: 0.6 }), n: 9, r: 2.4 } : null });
  return done(G);
}
function pumpkinBall(G, x, y, r, seed) {
  const R = RR('#e8781e', 7, 3, { light: 0.55 });
  for (let b = -Math.ceil(r * 0.8); b <= r * 0.8; b++) for (let a = -Math.ceil(r * 1.2); a <= r * 1.2; a++) {
    const u = a / (r * 1.2), v = b / (r * 0.8); if (u * u + v * v > 1) continue;
    const w = Math.sqrt(1 - u * u - v * v), rib = Math.cos(Math.atan2(u, w) * 7);
    px(G, x + a, y + b, step(R, 0.55 - u * 0.3 - v * 0.25 + (rib < -0.7 ? -0.25 : rib > 0.5 ? 0.08 : 0), x + a | 0, y + b | 0, 0.2), sN(u, v, w), 0);
  }
  limb(G, [x, y - r * 0.7], [x + 1, y - r - 1], [x + 2, y - r - 2], 1.2, 0.8, RR('#6a7a2a', 5, 2), { tex: 'smooth', seed });
}
export function pumpkin(seed = 1, st = 2) {
  const rnd = mulberry32(seed * 431 + st), G = sprite(84, 50, 6), cx = G.ax, foot = G.ay, R = FOL('#4a8a2c');
  const lv = []; for (let i = 0; i < 8; i++) { const a = rnd() * TAU; lv.push({ x: cx + Math.cos(a) * (10 + rnd() * 16), y: foot - 3 + Math.sin(a) * 8, d: Math.sin(a) }); }
  lv.sort((a, b) => a.d - b.d);
  const vine = FOL('#6a9a3a'); for (let i = 0; i < 3; i++) { let x = cx, y = foot - 2; const a = rnd() * TAU; for (let k = 0; k < 18; k++) { x += Math.cos(a + Math.sin(k * 0.5)); y += Math.sin(a) * 0.4; px(G, x, y, step(vine, 0.4, 0, 0, 0), [0, 0, 1], F_LEAF, 1); } }
  for (const l of lv) { G.root = { y: l.y + 2, b: 0 }; bigLeaf(G, l.x, l.y + 2, -PI / 2 + (rnd() - 0.5) * 0.8, 12, 7.5, R, { shape: 'round', seed, vein: 2.4, fold: 0.15 }); }
  G.root = null;
  if (st === 1) pumpkinBall(G, cx + 3, foot - 4, 5.5, seed);
  if (st === 2) pumpkinBall(G, cx + 2, foot - 8, 11, seed);
  return done(G);
}
export function sunflowers(seed = 1) {
  const rnd = mulberry32(seed * 433 + 1), G = sprite(70, 70, 5), cx = G.ax, foot = G.ay, L = FOL('#4a8a2a'), Y = RR('#f0c020', 6, 3, { light: 0.5 }), D = RR('#6a3a1a', 5, 2);
  const fl = []; for (let i = 0; i < 5; i++) fl.push({ x: cx + (i - 2) * 11 + (rnd() - 0.5) * 5, h: 38 + rnd() * 22, d: rnd(), r: 5.5 + rnd() * 2 });
  fl.sort((a, b) => a.d - b.d);
  for (const f of fl) {
    limb(G, [f.x, foot], [f.x + 1, foot - f.h / 2], [f.x, foot - f.h], 1.1, 0.9, L, { tex: 'smooth', seed });
    for (let k = 0; k < 3; k++) { const y = foot - 8 - k * f.h * (0.22 + rnd() * 0.08), sd = (k + (f.d > 0.5 ? 1 : 0)) % 2 ? 1 : -1; bigLeaf(G, f.x, y, -PI / 2 + sd * (0.7 + rnd() * 0.3), 10 + rnd() * 3, 4.2, L, { shape: 'oval', droop: 0.2, seed: seed + k, vein: 2.2, fold: 0.2 }); }
    const hx = f.x, hy = foot - f.h - 1, r = f.r;
    for (let a = 0; a < 16; a++) { const an = a / 16 * TAU; for (let k = r * 0.55; k <= r + 1.6; k += 0.5) px(G, hx + Math.cos(an) * k, hy + Math.sin(an) * k * 0.9, step(Y, 0.55 + (Math.cos(an) + Math.sin(an) < 0 ? 0.15 : -0.1) - (k > r ? 0.08 : 0), 0, 0, 0), [Math.cos(an) * 0.3, 0.3, 0.9]); }
    for (let b = -r * 0.6; b <= r * 0.6; b++) for (let a = -r * 0.6; a <= r * 0.6; a++) if (a * a + b * b <= r * r * 0.36) px(G, hx + a, hy + b, step(D, 0.45 - (a + b) * 0.08 + ((a + b) % 2 ? 0.1 : -0.1), 0, 0, 0), [0, 0.3, 0.9]);
  }
  return done(G);
}
export const strawberries = (seed = 1) => shrub(seed, { w: 32, h: 17, R: FOL('#3e8a2c'), cs: 2.4, leaf: 'maple', squash: 0.6, lobes: 7, fruit: { R: RR('#e0202a', 6, 3, { light: 0.55 }), n: 12, r: 1.5 }, flowers: { R: RR('#f8f4ea', 5, 3, { dark: 0.3 }), k: 0.08, kind: 'star' }, k: 11 });
export function grapevineTrellis(seed = 1) {
  const rnd = mulberry32(seed * 439 + 1), G = sprite(190, 64, 6), cx = G.ax, foot = G.ay, P = RR('#7a5a3a', 6, 3), Wr = RR('#9a9aa0', 5, 2), V = RR('#6a4a30', 6, 3), L = FOL('#5a9a2a');
  const posts = [-88, -30, 30, 88], wires = [14, 24, 34];
  for (const px0 of posts) for (let y = foot + 1; y > foot - 42; y--) for (let q = -1; q <= 1; q++) px(G, cx + px0 + q, y, step(P, 0.55 - q * 0.22 + (y < foot - 40 ? 0.15 : 0), 0, 0, 0), [q * 0.7, 0.5, 0.6], 0);
  for (const wh of wires) for (let x = -88; x <= 88; x++) { const seg = (x + 88) % 58, sag = Math.sin(PI * seg / 58) * 1.2; px(G, cx + x, foot - wh + sag, step(Wr, 0.55, 0, 0, 0), [0, 0.3, 0.9], 0); }
  [[-59, 0], [0, 1], [59, 2]].forEach(([vx, stg]) => {
    const tx = cx + vx, top = foot - 24;
    limb(G, [tx, foot + 1], [tx + 3, foot - 10], [tx - 1, top], 2, 1.4, V, { seed, k: 0.5 });
    for (const sd of [-1, 1]) limb(G, [tx - 1, top], [tx + sd * 8, top - 2], [tx + sd * (10 + stg * 6), top + 1], 1.2, 0.8, V, { seed, k: 0.45 });
    const cls = [], nlv = [12, 30, 48][stg];
    for (let i = 0; i < nlv; i++) { const x = tx + (rnd() - 0.5) * (14 + stg * 18), y = top - 4 - rnd() * (8 + stg * 6) + Math.abs(x - tx) * 0.1; cls.push({ x, y, d: rnd(), r: 2.6 + rnd() * 1.2, g: 0.5 - (x - tx) / 40 * 0.2 + (rnd() - 0.5) * 0.2, n: [0, 0.4, 0.9], w: 0.6 + rnd() * 0.4, gu: (x - tx) / 30, gv: -0.3, ph: rnd() * TAU, edge: rnd() < 0.4 }); }
    paintClusters(G, cls, { R: L, leaf: 'maple', seed: seed + stg });
    if (stg === 2) for (let g = 0; g < 4; g++) { const gx = tx - 14 + g * 9 + (rnd() - 0.5) * 3, gy = top - 2; for (let k = 0; k < 8; k++) { const wd = 2.4 * (1 - k / 8); for (let q = -wd; q <= wd; q += 1.2) fruit(G, gx + q, gy + k * 1.1, 0.9, RR('#5a2a7a', 5, 2, { light: 0.55 })); } }
  });
  tufts(G, cx, foot, 10, 90, seed, FOL('#6a8a2a'));
  return done(G);
}
const fruitTree = (seed, c, k) => broadleaf(seed, { h: 84, cw: 35, ch: 39, R: FOL('#4e8a2a'), cs: 3.6, tw: 3.6, fruit: { R: RR(c, 6, 3, { light: 0.6 }), n: 16, r: 2 }, k });
export const appleTree = (seed = 1) => fruitTree(seed, '#d0281e', 20), orangeTree = (seed = 1) => fruitTree(seed, '#f0861e', 21), lemonTree = (seed = 1) => fruitTree(seed, '#f0d020', 22);
export const floweringHedge = (seed = 1) => hedge(seed, 112, 34, { curb: 0, R: FOL('#4a7a28'), flowers: { R: RR('#f8f4ea', 5, 3, { dark: 0.3 }), k: 0.06, kind: 'star' } });
export const poppies = (seed = 1) => flowerBed(seed, { n: 13, kind: 'poppy', R: RR('#e0281e', 6, 3, { light: 0.55 }), h: 24, spread: 26, leaves: 'clump', L: FOL('#4a8a2a'), size: 2, k: 4 });
export const lupines = (seed = 1, R = [RR('#6a4ac0', 6, 3, { light: 0.55 }), RR('#5a3aa8', 6, 3, { light: 0.55 })]) => spikes(seed, { n: 7, h: 44, w: 24, R, kind: 'pea', leaves: 'palm', L: FOL('#4a8a2a') });
export const daisies = (seed = 1) => flowerBed(seed, { n: 18, kind: 'daisy', R: RR('#f8f6ee', 5, 3, { dark: 0.3 }), h: 18, spread: 28, size: 2, leaves: 'clump', L: FOL('#4a8a2a'), k: 5 });
export const clover = (seed = 1) => shrub(seed, { w: 32, h: 20, R: FOL('#3e8a34'), cs: 2.3, leaf: 'maple', squash: 0.7, flowers: { R: RR('#f4f0e8', 5, 3, { dark: 0.35 }), k: 0.06, kind: 'ball', size: 0.7 }, k: 12 });
// wetland plants standing in water: cattails, reeds, rushes
export function cattails(seed = 1, kind = 'cattail') {
  const rnd = mulberry32(seed * 443 + (kind === 'reed' ? 3 : kind === 'rush' ? 5 : 1)), h = kind === 'rush' ? 50 : 58, G = sprite(70, h + 20, 6), cx = G.ax, foot = G.ay;
  const R = kind === 'rush' ? FOL('#4e7a2a') : FOL('#5a8a2a'), C = RR('#6a3a1e', 6, 3), Pl = RR('#b08a50', 5, 2);
  const bl = []; for (let i = 0; i < (kind === 'rush' ? 50 : 34); i++) bl.push({ x: cx + (rnd() - 0.5) * 24, a: -PI / 2 + (rnd() - 0.5) * 0.7, l: h * (0.5 + rnd() * 0.5), d: rnd() });
  bl.sort((a, b) => a.d - b.d);
  for (const b of bl) blade(G, b.x, foot - 1, b.a * 0.7 - PI * 0.15, b.l, kind === 'rush' ? 0.6 : 0.9, 0.004, R, { k: 0.3 + b.d * 0.4 });
  for (let i = 0; i < (kind === 'rush' ? 9 : 5); i++) {
    const x0 = cx + (rnd() - 0.5) * 20, a = -PI / 2 + (rnd() - 0.5) * 0.25, L = h * (0.8 + rnd() * 0.3);
    const [ex, ey] = blade(G, x0, foot - 1, a, L, 0.5, 0, R, { k: 0.45 });
    if (kind === 'cattail') { for (let k = 0; k < 8; k++) for (const q of [-1, 0, 1]) px(G, ex + q, ey + 3 + k, step(C, 0.55 - q * 0.25 + (k === 0 ? 0.15 : 0), 0, 0, 0), [q * 0.6, 0.3, 0.8], 0); stem(G, ex, ey + 3, ex, ey - 2, R, 0.5); }
    else if (kind === 'reed') { for (let k = 0; k < 9; k++) { const wd = 1.6 * Math.sin(PI * (k + 1) / 10); for (let q = -Math.ceil(wd); q <= wd; q++) px(G, ex + q + k * 0.25, ey + k, step(Pl, 0.6 - q * 0.2 + (k % 2 ? -0.12 : 0), 0, 0, 0), [q * 0.5, 0.3, 0.8]); } }
    else { for (let k = 0; k < 3; k++) px(G, ex + (k - 1), ey + 6 + (k % 2), step(C, 0.5, 0, 0, 0), [0, 0.3, 0.9], 0); }
  }
  for (let k = -12; k <= 12; k++) if (hash(k, 1, seed) > 0.4) px(G, cx + k, foot + 1, [200, 225, 230], [0, 0, 1], F_GROUND | F_WATER, 0);
  return done(G);
}
export const reeds = (seed = 1) => cattails(seed, 'reed'), rushes = (seed = 1) => cattails(seed, 'rush');
export function lilyPads(seed = 1, n = 8, lotus = 3) {
  const rnd = mulberry32(seed * 449 + 1), G = sprite(90, 50, 22), cx = G.ax, foot = G.ay, R = FOL('#5a9a3a'), P = RR('#f0a0b8', 6, 3, { light: 0.55 });
  const pads = []; for (let i = 0; i < n; i++) { const a = rnd() * TAU, q = Math.sqrt(rnd()); pads.push([cx + Math.cos(a) * q * 32, foot + Math.sin(a) * q * 13, 6.5 + rnd() * 3.5, rnd() * TAU]); }
  pads.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r, notch] of pads) for (let b = -Math.ceil(r * 0.5); b <= r * 0.5; b++) for (let a = -Math.ceil(r); a <= r; a++) {
    const u = a / r, v = b / (r * 0.5), q = u * u + v * v; if (q > 1) continue;
    const an = Math.atan2(v, u); if (Math.abs(((an - notch + PI * 3) % TAU) - PI) < 0.22) continue;
    px(G, x + a, y + b, step(R, 0.5 + (q > 0.7 ? (u + v < 0 ? 0.25 : -0.25) : 0) + (Math.abs(((an * 5) % 1)) < 0.1 ? -0.1 : 0), x + a | 0, y + b | 0, 0.3), [u * 0.15, v * 0.1, 1], 0, 1);
  }
  for (let i = 0; i < lotus; i++) { const [x, y] = pads[Math.floor(rnd() * pads.length)]; for (let k = 0; k < 5; k++) { const a = -PI / 2 + (k - 2) * 0.55; for (let s2 = 0; s2 < 4; s2++) { const X = x + Math.cos(a) * s2 * 0.8, Y = y - 2 + Math.sin(a) * s2; px(G, X, Y, step(P, 0.65 - s2 * 0.05 + (a < -PI / 2 ? 0.1 : -0.1), X | 0, Y | 0, 0), [Math.cos(a) * 0.4, 0.2, 0.9], 0, 3 + s2); } } px(G, x, y - 2, [240, 210, 90], [0, 0, 1], 0, 3); }
  return done(G);
}
export const weepingWillow = (seed = 1) => broadleaf(seed, { h: 92, cw: 34, ch: 24, R: FOL('#7a9a2a', { warm: 60 }), cs: 3.2, tw: 5, flare: 0.9, leaf: 'fine', weep: 1.3, lobes: 8, k: 23 });
export function cypressKnees(seed = 1) {
  const rnd = mulberry32(seed * 457 + 1), G = sprite(70, 50, 8), cx = G.ax, foot = G.ay, B = RR('#7a5a40', 7, 3, { dark: 0.6 });
  const kn = []; for (let i = 0; i < 6; i++) kn.push([cx + (rnd() - 0.5) * 50, foot + (rnd() - 0.5) * 12, 12 + rnd() * 26, 4 + rnd() * 3.5]);
  kn.sort((a, b) => a[1] - b[1]);
  for (const [x, y, h, w] of kn) for (let k = 0; k < h; k++) { const t = k / h, ww = w * (1 - t * 0.75) + Math.sin(k * 0.7 + x) * 0.4; for (let q = -Math.ceil(ww); q <= ww; q++) { const u = q / Math.max(1, ww); px(G, x + q, y - k, step(B, 0.55 - u * 0.3 + (hash(q + 9, k >> 1, seed) > 0.75 ? -0.18 : 0) + (t > 0.85 ? 0.1 : 0), x + q | 0, y - k, 0.3), [u, 0.5, 0.3], 0, k); } for (let q = -w - 1; q <= w + 1; q++) px(G, x + q, y + 1, [190, 215, 225], [0, 0, 1], F_GROUND | F_WATER, 0); }
  tufts(G, cx, foot, 4, 24, seed, FOL('#5a8a2a'), 6);
  return done(G);
}

// ---- mountain (E3f) ----------------------------------------------------------------------------------------
export const mountainFir = (seed = 1) => conifer(seed, { h: 148, r: 33, form: 'narrow', R: FOL('#2e5a32'), tw: 3.4, sp: 5.6, sw: 5, bare: 0.06, droop: 0.4, k: 4, base: (G, cx, foot) => pebbles(G, cx, foot, 6, 28, 41) }); // (no snow dusting: no snow biome for now)
export const mountainPine = (seed = 1) => conifer(seed, { h: 140, r: 30, form: 'narrow', R: FOL('#3e6a2a', { warm: 58 }), tw: 3, sp: 5.4, sw: 4.6, bare: 0.06, droop: 0.3, g: 0.36, k: 5, base: (G, cx, foot) => pebbles(G, cx, foot, 5, 24, 42) });
export const whitebarkPine = (seed = 1) => pineTufts(seed, { h: 98, cw: 44, B: BARK_PALE, tex: 'bark', tw: 4.4, twist: 14, lean: -10, n: 9, low: 0.3, tuft: 7.5, flat: 0.55, rise: 0.05, flatTop: true, leaf: 'round', cs: 3, R: FOL('#3e6e2c', { warm: 60 }), rocks: 6, grass: 5, k: 1 });
export const goldenLarch = (seed = 1) => conifer(seed, { h: 144, r: 36, form: 'narrow', R: FOL('#eaa020', { cool: 15, shiftD: 0.45, dark: 0.62 }), B: RR('#5a4030', 7, 3), tw: 2.8, sp: 5.4, sw: 4.6, sparse: 0.22, droop: 0.25, g: 0.4, k: 6, base: (G, cx, foot) => pebbles(G, cx, foot, 6, 26, 43) });
export const snowySpruce = (seed = 1) => conifer(seed, { h: 100, r: 26, R: FOL('#2e5a3a', { cool: 210 }), tw: 2.4, sp: 5, sw: 4.6, bare: 0.04, droop: 0.2, snow: 0.6, k: 7, base: (G, cx, foot) => { pebbles(G, cx, foot, 6, 22, 44); snowDrift(G, cx, foot, 22, 44); } });
function snowDrift(G, cx, foot, r, seed) {
  const rnd = mulberry32(seed + 5);
  for (let i = 0; i < 7; i++) { const x = cx + (rnd() - 0.5) * r * 2, y = foot + rnd() * 3 - 1, rr = 2 + rnd() * 4; for (let b = -rr * 0.5; b <= 0; b++) for (let a = -rr; a <= rr; a++) { const u = a / rr, v = b / (rr * 0.5); if (u * u + v * v > 1) continue; px(G, x + a, y + b, step(SNOW, 0.6 - u * 0.2 - v * 0.2, x + a | 0, y + b | 0, 0.3), sN(u, v, 0.6), 0, Math.round(-b)); } }
}
export function juniperMat(seed = 1) {
  const rnd = mulberry32(seed * 461 + 1), G = sprite(124, 52, 6), cx = G.ax, foot = G.ay;
  const lobes = []; for (let i = 0; i < 10; i++) { const x = cx + (i / 9 - 0.5) * 92 + (rnd() - 0.5) * 6; lobes.push({ x, y: foot - 18 - rnd() * 10 + Math.abs(x - cx) * 0.2, r: 13 + rnd() * 5, ry: 12 + rnd() * 4 }); }
  paintClusters(G, massEll(lobes, rnd, 3.2, 1.5), { R: FOL('#3a6a2a', { warm: 60 }), leaf: 'needle', seed, core: true, mid: () => { for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1; limb(G, [cx, foot - 2], [cx + s * 20, foot - 6], [cx + s * (30 + rnd() * 20), foot - 4 - rnd() * 6], 1.6, 0.8, BARK, { seed }); } } });
  pebbles(G, cx, foot, 9, 52, seed); tufts(G, cx, foot, 4, 46, seed, FOL('#7a8a2a'));
  return done(G);
}
export const twistedShrub = (seed = 1) => pineTufts(seed, { h: 58, cw: 46, B: BARK_PALE, tw: 3.2, twist: 10, n: 8, low: 0.25, tuft: 8, flat: 0.6, rise: 0.15, flatTop: true, leaf: 'round', cs: 3, R: FOL('#46742c', { warm: 60 }), rocks: 6, grass: 4, k: 2 });
export const snowyShrub = (seed = 1) => shrub(seed, { w: 30, h: 36, R: FOL('#3e6a3a'), cs: 3.6, twigs: 11, snowClumps: 0.55, k: 13, after: (G, cx, foot) => snowDrift(G, cx, foot, 22, seed) });
export const berryShrub = (seed = 1) => shrub(seed, { w: 32, h: 40, R: FOL('#5a7a2a', { warm: 50 }), cs: 2.8, leaf: 'fine', twigs: 6, fruit: { R: RR('#d8301e', 6, 3, { light: 0.55 }), n: 22, r: 1.2 }, k: 14, after: (G, cx, foot) => pebbles(G, cx, foot, 6, 22, seed) });
export const alpineLupine = (seed = 1) => spikes(seed, { n: 6, h: 44, w: 24, R: [RR('#5a4ad0', 6, 3, { light: 0.55 }), RR('#7a5ad8', 6, 3, { light: 0.55 })], kind: 'pea', leaves: 'palm', L: FOL('#3e7a2a'), rocks: 5, k: 1 });
export const paintbrush = (seed = 1) => spikes(seed, { n: 8, h: 34, w: 24, R: RR('#e8401e', 6, 3, { light: 0.55 }), kind: 'brush', leaves: 'fine', L: FOL('#4a7a2a'), rocks: 5, k: 2 });
export function columbine(seed = 1) {
  const rnd = mulberry32(seed * 463 + 1), G = sprite(70, 60, 5), cx = G.ax, foot = G.ay, L = FOL('#4a8a3a'), P = RR('#c8a8e8', 6, 3, { light: 0.6 }), W = RR('#f4f0e8', 5, 3, { dark: 0.3 });
  paintClusters(G, massEll([{ x: cx, y: foot - 8, r: 24, ry: 8 }, { x: cx - 8, y: foot - 12, r: 10 }, { x: cx + 9, y: foot - 11, r: 10 }], rnd, 2.6, 1.5), { R: L, leaf: 'maple', seed, core: true });
  for (let i = 0; i < 7; i++) { const x = cx + (i - 3) * 7 + (rnd() - 0.5) * 3, top = foot - 26 - rnd() * 16; stem(G, x, foot - 4, x + (rnd() - 0.5) * 4, top, L, 0.4, (rnd() - 0.5) * 3); for (let k = 0; k < 5; k++) { const a = -PI / 2 + (k - 2) * 0.75; for (let s2 = 1; s2 < 4; s2++) px(G, x + Math.cos(a) * s2, top + 2 + Math.sin(a) * s2 * 0.7 + 2, step(P, 0.6 - s2 * 0.05 + (a < -PI / 2 ? 0.12 : -0.1), 0, 0, 0), [Math.cos(a) * 0.4, 0.3, 0.9]); } px(G, x, top + 3, step(W, 0.7, 0, 0, 0), [0, 0, 1]); px(G, x, top + 4, [236, 200, 80], [0, 0, 1]); }
  pebbles(G, cx, foot, 5, 18, seed);
  return done(G);
}
export const heather = (seed = 1) => shrub(seed, { w: 28, h: 20, R: FOL('#5a6a3a', { warm: 60 }), cs: 2.2, leaf: 'fine', squash: 0.7, flowers: { R: RR('#c03a8a', 6, 3, { light: 0.5 }), k: 0.6, kind: 'dot' }, k: 15, after: (G, cx, foot) => pebbles(G, cx, foot, 6, 22, seed) });
export const alpineDaisies = (seed = 1) => shrub(seed, { w: 30, h: 17, R: FOL('#4a7a2a'), cs: 2.4, leaf: 'round', squash: 0.7, flowers: { R: RR('#f8f6ee', 5, 3, { dark: 0.3 }), k: 0.3, kind: 'daisy' }, k: 16, after: (G, cx, foot) => pebbles(G, cx, foot, 6, 24, seed) });
export const buttercups = (seed = 1) => shrub(seed, { w: 28, h: 17, R: FOL('#5a8a2a'), cs: 2.3, leaf: 'maple', squash: 0.7, flowers: { R: RR('#f0c818', 5, 2, { light: 0.5 }), k: 0.22, kind: 'cup' }, k: 17, after: (G, cx, foot) => { pebbles(G, cx, foot, 6, 24, seed); } });

// ---- the catalog ---------------------------------------------------------------------------------------------
export const FLORA = {
  // city
  streetTree, streetTreeGrate: (s) => streetTree(s, 'grate'), flowerTree, youngTree, ginkgo, cherryTree, magnoliaTree, redMaple,
  hedge: (s) => hedge(s), topiaryBall, topiaryCone, roseBush, hydrangea, lavender: (s) => lavender(s), tulipPlanter, daffodilPlanter,
  flowerBoxStone: (s) => flowerBox(s, 'stone'), flowerBoxIron: (s) => flowerBox(s, 'iron'), ivyWall, wisteriaWall, roseArch, pampasGrass, wildflowerLawn: (s) => wildflowerLawn(s), crackedPaving: (s) => crackedPaving(s),
  // forest
  redwood: (s) => redwood(s), douglasFir, westernRedCedar, blueSpruce, ponderosaPine, bigOak, mapleGreen, mapleAutumn, birchClump, aspenGrove, nurseStump,
  swordFern, deadBracken, mossMounds, mossyLog, salal, huckleberry, wildBerry, foxglove, trillium, fallenBranches, pineCones, leafLitter: (s) => leafLitter(s), sapling: (s) => sapling(s),
  // desert
  saguaroBig, saguaroMid, saguaroSmall, joshuaTree, ocotillo, paloVerde, mesquite, pricklyPear, barrelCacti, cholla, agave, yucca: (s) => yucca(s),
  creosote, sagebrush, brittlebush, whiteBursage, desertPoppies, desertFlowers, dryGrass: (s) => dryGrass(s), tumbleweed: (s) => tumbleweed(s), deadSnag, datePalm, desertFanPalm,
  // tropical coast
  coconutPalm, royalPalm, fanPalmSkirt, leaningPalm, banana, monstera, elephantEar, birdOfParadise, hibiscus, bougainvillea,
  duneGrass, beachGrass, icePlant, coastalCypress, kelpPile, seaweed, mangroves,
  // farm, garden, wetland
  wheat0: (s) => wheat(s, 0), wheat1: (s) => wheat(s, 1), wheat2: (s) => wheat(s, 2), corn0: (s) => corn(s, 0), corn1: (s) => corn(s, 1), corn2: (s) => corn(s, 2),
  cabbage0: (s) => cabbage(s, 0), cabbage1: (s) => cabbage(s, 1), cabbage2: (s) => cabbage(s, 2), tomato0: (s) => tomato(s, 0), tomato1: (s) => tomato(s, 1), tomato2: (s) => tomato(s, 2),
  pumpkin0: (s) => pumpkin(s, 0), pumpkin1: (s) => pumpkin(s, 1), pumpkin2: (s) => pumpkin(s, 2), sunflowers, strawberries, grapevineTrellis,
  appleTree, orangeTree, lemonTree, floweringHedge, poppies, lupines: (s) => lupines(s), daisies, tallGrass, clover, cattails: (s) => cattails(s), reeds, rushes, lilyPads: (s) => lilyPads(s), weepingWillow, cypressKnees,
  // mountain
  mountainFir, mountainPine, whitebarkPine, goldenLarch, snowySpruce, juniperMat, twistedShrub, snowyShrub, berryShrub,
  alpineLupine, paintbrush, columbine, heather, alpineDaisies, buttercups,
  lichenBoulder, mossyCreekRocks, snowyRocks, driftwoodLog, rock: (s) => rock(s, 20), mossRock: (s) => rock(s, 18, { moss: 0.7 }),
};
