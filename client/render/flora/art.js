// Procedural vegetation in the 16-bit style: grass, wildflowers, crops, bushes, flower beds, trees
// and palms, all painted pixel by pixel from small rules - limited palettes (5-6 step ramps, cool
// shadows, warm highlights), light from the top left, ordered (Bayer) dithering between tones and
// dark outlines - so they sit with the hand-painted concept art. Nothing is loaded from disk.
//
// Every plant is made in frames: grass, crops and bushes in 11 lean frames (-5..5, the wind and
// whoever is pushing through), three squash levels (standing, trodden, flattened by a car) and a
// few variants, packed into one sheet per kind. Each frame also gets a "glow" twin: the thin parts
// (blade tips, leaf rims) the low sun shines through - drawn additively at golden hour, it's the
// subsurface-scattering look. Trees and palms get a crown and a trunk drawn apart (the crown sways)
// plus glow masks for light from the left and from the right.
import { mulberry32 } from '../../../shared/rng.js';

export const S = 2;               // canvas px per world px (the concept art's pixel size)
export const BENDS = 11;          // lean frames -5..5
export const SQUASH = 3;          // standing, trodden, flattened
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const ramp = (list) => list.map(hex);

// ---- palettes (dark -> light) ------------------------------------------------------------------
export const RAMPS = {
  lush: ramp(['#16301f', '#244a2a', '#336a30', '#4c8a36', '#72aa42', '#a6cc5c']),
  lawn: ramp(['#18341f', '#275226', '#3a7430', '#56943a', '#7cb44a', '#acd462']),
  meadow: ramp(['#26381e', '#3a5a24', '#58802c', '#7ea234', '#a8c048', '#d4dc78']),
  forest: ramp(['#10261f', '#1a3b28', '#28572e', '#3e7436', '#5e9242', '#86b052']),
  dry: ramp(['#332f1c', '#504a28', '#726a34', '#988c44', '#bcae5e', '#ded08a']),
  dune: ramp(['#384024', '#55602e', '#78823c', '#9ca452', '#c2c472', '#e2e0a2']),
  wheat: ramp(['#4a3416', '#73521e', '#a07a28', '#c8a038', '#e4c254', '#f6e092']),
  barley: ramp(['#4a4020', '#6e622c', '#98883a', '#bcae52', '#d8cc72', '#efe8a8']),
  corn: ramp(['#14301c', '#204a24', '#2f682c', '#468836', '#68a644', '#98c45a']),
  cabbage: ramp(['#16362a', '#245236', '#367044', '#4f9050', '#78b064', '#aed088']),
  oak: ramp(['#10261c', '#1b3d26', '#2a5a2e', '#3f7a34', '#5f9a3e', '#8ebc54']),
  maple: ramp(['#132a1c', '#204426', '#30622c', '#4a8232', '#70a23a', '#a2c450']),
  pine: ramp(['#0c2222', '#143430', '#1e4a3a', '#2c6444', '#3f7e4c', '#62985a']),
  birch: ramp(['#203c22', '#2f5a2e', '#467e38', '#62a042', '#8cbe52', '#bcd874']),
  blossom: ramp(['#4a2238', '#783454', '#ac4c74', '#d87494', '#f2a4bc', '#ffd6e2']),
  palm: ramp(['#123222', '#1c4a2a', '#2a6830', '#3e8836', '#5ea63e', '#8cc650']),
  shrub: ramp(['#12281e', '#1d3e26', '#2c582c', '#407634', '#5c943c', '#86b44c']),
  olive: ramp(['#262e1e', '#3a4428', '#525e32', '#6c7a3c', '#8c984c', '#b6bc70']),
  bark: ramp(['#26180e', '#3e2814', '#5a3c1e', '#7a5428', '#9a6e38', '#b88c50']),
  birchbark: ramp(['#3a3a38', '#7a7a74', '#b4b2a8', '#d8d6cc', '#ecebe2', '#ffffff']),
  palmbark: ramp(['#3a2a1a', '#5a4226', '#7a5c34', '#9a7844', '#b89458', '#d4b072']),
  soil: ramp(['#2e2014', '#45301c', '#5e4226', '#785632', '#926c40', '#ad8854']),
};
const FLOWERS = [hex('#f6f2e8'), hex('#ffd84a'), hex('#e2507a'), hex('#9a6ad8'), hex('#f08a3a'), hex('#5aa0ec'), hex('#ff6a6a')];
const GLOW_GRASS = hex('#f2f08a'), GLOW_LEAF = hex('#ffd468'), GLOW_PETAL = hex('#ffe6c0');

// ---- tiny pixel canvas helpers -------------------------------------------------------------------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// A pixel buffer we paint into, then put on a canvas once.
class Px {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255 || this.d[i + 3] === 0) { this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; return; }
    const k = a / 255; // over an existing pixel
    this.d[i] = this.d[i] * (1 - k) + c[0] * k; this.d[i + 1] = this.d[i + 1] * (1 - k) + c[1] * k; this.d[i + 2] = this.d[i + 2] * (1 - k) + c[2] * k; this.d[i + 3] = Math.max(this.d[i + 3], a);
  }
  alpha(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[(y * this.w + x) * 4 + 3]; }
  to(g, ox, oy) { g.putImageData(new ImageData(this.d, this.w, this.h), ox, oy); }
}

// ---- grass and wildflowers -------------------------------------------------------------------------
// A "patch" is a tuft of blades over a 16x6 world px footprint (the cell is 30x24 world px so the
// blades can lean out of it). bend: -5..5, squash: 0 standing / 1 trodden / 2 flattened.
export const GRASS = {
  lawn: { ramp: 'lawn', n: [9, 13], h: [5, 10], flowers: 0.02, thin: 0.3 },
  lush: { ramp: 'lush', n: [9, 14], h: [8, 17], flowers: 0.05, thin: 0.4 },
  park: { ramp: 'lush', n: [10, 15], h: [9, 19], flowers: 0.14, thin: 0.4 },
  meadow: { ramp: 'meadow', n: [12, 18], h: [12, 30], flowers: 0.3, thin: 0.55 },
  forest: { ramp: 'forest', n: [8, 12], h: [10, 24], flowers: 0.04, thin: 0.5, fern: 0.35 },
  dry: { ramp: 'dry', n: [5, 9], h: [8, 20], flowers: 0.03, thin: 0.75 },
  dune: { ramp: 'dune', n: [4, 8], h: [14, 26], flowers: 0, thin: 0.9 },
};
export const GRASS_CELL = { w: 30, h: 24 };      // world px
const GW = GRASS_CELL.w * S, GH = GRASS_CELL.h * S;

function blade(p, glow, R, bx, by, h, lean, bend, sq, wide, flower, rnd) {
  // the blade's path from its base up: it leans, then the wind / a passer-by bends the top over;
  // trodden and flattened blades lie down toward their lean
  const side = bend !== 0 ? Math.sign(bend) : lean >= 0 ? 1 : -1;
  const lie = sq === 0 ? 0 : sq === 1 ? 0.45 : 0.85;
  const hh = h * (1 - lie * 0.85);
  const span = h * lie * 0.95 * side;
  const dark = sq === 2 ? 1 : 0;
  let px = bx, py = by;
  const steps = Math.max(2, Math.ceil(Math.max(hh, Math.abs(span)) + 1));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(bx + lean * t * t + bend * 2.1 * Math.pow(t, 1.7) * (1 - lie) + span * Math.pow(t, 0.8));
    const y = Math.round(by - hh * t);
    const ci = Math.max(0, Math.min(5, Math.round(1 + t * 4.2 - dark + (rnd() - 0.5) * 0.4)));
    // fill any gap from the last point (keeps lying blades continuous)
    const n = Math.max(Math.abs(x - px), Math.abs(y - py));
    for (let k = 1; k <= n || k === 1; k++) {
      const xx = Math.round(px + (x - px) * (k / Math.max(1, n))), yy = Math.round(py + (y - py) * (k / Math.max(1, n)));
      p.set(xx, yy, R[ci]);
      if (wide && t < 0.75) p.set(xx + 1, yy, R[Math.max(0, ci - 1)]); // the shaded side
      if (glow && t > 0.45 && sq < 2) glow.set(xx, yy, GLOW_GRASS, Math.round(255 * Math.min(1, (t - 0.45) * 2.2)));
      if (n === 0) break;
    }
    px = x; py = y;
  }
  const tip = [px, py];
  if (flower && sq < 2) {
    const c = flower, hi = c.map((v) => Math.min(255, v + 50)), lo = c.map((v) => v * 0.6);
    p.set(px - 1, py, lo); p.set(px + 1, py, c); p.set(px, py - 1, hi); p.set(px, py + 1, c); p.set(px, py, hex('#ffe88a'));
    if (glow) { glow.set(px, py - 1, GLOW_PETAL, 200); glow.set(px - 1, py, GLOW_PETAL, 120); }
  }
  return tip;
}
// a small fern frond (forest floor): a rib with leaflets
function fern(p, glow, R, bx, by, len, dir, bend, sq, rnd) {
  const lie = sq === 0 ? 1 : sq === 1 ? 0.6 : 0.3;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const x = Math.round(bx + dir * i * 0.9 + bend * 1.6 * t * t), y = Math.round(by - i * 0.55 * lie);
    const ci = Math.min(5, 1 + Math.round(t * 3 + (sq === 2 ? -1 : 0)));
    p.set(x, y, R[ci]);
    if (i % 2 === 0 && i > 1) { const l = Math.round((1 - t) * 3) + 1; for (let k = 1; k <= l; k++) { p.set(x + dir * k * 0.3, y - k, R[Math.min(5, ci + 1)]); p.set(x - dir * k * 0.2, y + k * 0.6, R[Math.max(0, ci - 1)]); } }
    if (glow && t > 0.5 && sq < 2) glow.set(x, y - 1, GLOW_GRASS, 150);
  }
  void rnd;
}

// One sheet per grass kind: rows = variant * SQUASH + squash, columns = the 11 bends.
// bends: which lean frames to make (static vegetation only needs the upright one).
export function grassSheet(kind, variants, bends = null, glowOn = true) {
  const G = GRASS[kind], R = RAMPS[G.ramp];
  const cols = bends || [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const cv = canvas(GW * cols.length, GH * variants * SQUASH);
  const gc = glowOn ? canvas(cv.width, cv.height) : null;
  const g = cv.getContext('2d'), gg = gc && gc.getContext('2d');
  for (let v = 0; v < variants; v++) {
    // the blades of this variant (the same blades in every frame)
    const rnd = mulberry32(0x6a55 + v * 977 + kind.length * 131);
    const n = G.n[0] + Math.floor(rnd() * (G.n[1] - G.n[0] + 1));
    const blades = [];
    for (let i = 0; i < n; i++) {
      const bx = GW / 2 - 16 + rnd() * 32, by = GH - 3 - rnd() * 10;
      const h = G.h[0] + rnd() * (G.h[1] - G.h[0]) * (0.55 + 0.45 * (1 - Math.abs(bx - GW / 2) / 16));
      blades.push({ bx, by, h, lean: (rnd() - 0.5) * 7, wide: rnd() > G.thin, flower: rnd() < G.flowers ? FLOWERS[Math.floor(rnd() * FLOWERS.length)] : null, fern: G.fern && rnd() < G.fern / 3, dir: rnd() < 0.5 ? -1 : 1, seed: rnd() * 1e9 });
    }
    blades.sort((a, b) => a.by - b.by);
    for (let sq = 0; sq < SQUASH; sq++) for (let c = 0; c < cols.length; c++) {
      const p = new Px(GW, GH), q = glowOn ? new Px(GW, GH) : null;
      for (const b of blades) {
        const r2 = mulberry32(b.seed | 0);
        if (b.fern) fern(p, q, R, b.bx, b.by, Math.round(b.h * 0.7), b.dir, cols[c], sq, r2);
        else blade(p, q, R, b.bx, b.by, b.h, b.lean, cols[c], sq, b.wide, b.flower, r2);
      }
      p.to(g, c * GW, (v * SQUASH + sq) * GH);
      if (q) q.to(gg, c * GW, (v * SQUASH + sq) * GH);
    }
  }
  return { cv, glow: gc, cw: GW, ch: GH, cols: cols.length, bends: cols, variants };
}

// ---- undergrowth ---------------------------------------------------------------------------------
// Walk-through plants that grow among the grass, in the same 30x24 cell and the same sheet layout
// (variants x squash rows, bend columns), so they sway, part and flatten exactly like it:
//   fern     - a fan of arching fronds (forest floor)
//   flowers  - a drift of wildflowers; each variant is one kind (daisies, poppies, lupins, buttercups)
//   shrublet - a low leafy mound (forest edges, meadows), sometimes with berries
//   dryshrub - a sparse grey-green scrub with twigs showing (dry country)
//   reeds    - tall rushes with cattail heads (where grass meets water)
export const PLANTS = {
  fern: { ramp: 'forest', variants: 3 },
  flowers: { ramp: 'lush', variants: 4 },
  shrublet: { ramp: 'shrub', variants: 3 },
  dryshrub: { ramp: 'olive', variants: 2 },
  reeds: { ramp: 'lush', variants: 2 },
};
const FLOWER_KINDS = [
  { head: 'daisy', c: [hex('#fbfaf2'), hex('#d8d6cc')], mid: hex('#ffcf3a') },
  { head: 'poppy', c: [hex('#ff5a4a'), hex('#c02a2a')], mid: hex('#2a1a1a') },
  { head: 'spike', c: [hex('#a07ae8'), hex('#6a4ab8')], mid: hex('#d8c4ff') },
  { head: 'cup', c: [hex('#ffe04a'), hex('#d8a020')], mid: hex('#fff6b0') },
];
const lieOf = (sq) => (sq === 0 ? 1 : sq === 1 ? 0.55 : 0.22);

// one arching frond: a rib from the base with leaflets either side, shorter toward the tip
function frond(p, glow, R, bx, by, ang, len, bend, sq, droop) {
  const lie = lieOf(sq), dk = sq === 2 ? 1 : 0;
  const dx = Math.cos(ang) * len * (sq ? 1.15 : 1), dy = Math.sin(ang) * len;
  let px = bx, py = by;
  for (let i = 1; i <= len; i++) {
    const t = i / len;
    const x = Math.round(bx + dx * t + bend * 2 * Math.pow(t, 1.6) * lie);
    const y = Math.round(by + (dy * t + droop * t * t * len) * lie);
    const ci = Math.max(0, Math.min(5, 2 + Math.round(t * 2) - dk));
    p.set(x, y, R[ci]);
    if (Math.abs(x - px) > 1 || Math.abs(y - py) > 1) p.set((x + px) >> 1, (y + py) >> 1, R[ci]);
    if (i % 2 === 0 && t < 0.95) {
      // perpendicular to the rib, tilted toward the tip
      const tx = x - px, ty = y - py, tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl, ny = tx / tl;
      const l = Math.max(1, Math.round((1 - t) * 5.5 + 1.2));
      for (let k = 1; k <= l; k++) {
        const fx = (tx / tl) * k * 0.45;
        p.set(x + nx * k + fx, y + ny * k * lie + (tx / tl) * 0, R[Math.min(5, ci + 1)]);      // the lit side
        p.set(x - nx * k + fx, y - ny * k * lie, R[Math.max(0, ci - 1)]);                     // the shaded side
        if (glow && sq < 2 && k >= l - 1) { glow.set(x + nx * k + fx, y + ny * k * lie, GLOW_LEAF, 170); glow.set(x - nx * k + fx, y - ny * k * lie, GLOW_LEAF, 110); }
      }
    }
    px = x; py = y;
  }
}

// a leafy mound: leaf clusters over a half-dome, lit from the top left, the top swaying most
function mound(p, glow, R, cx, by, rx, ry, n, bend, sq, rnd, opt = {}) {
  const lie = lieOf(sq), spread = sq ? 1 + (1 - lie) * 0.5 : 1;
  const leaves = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI, r = Math.sqrt(rnd());
    const ux = Math.cos(a) * r, uy = -Math.sin(a) * r;          // inside the upper half disc
    leaves.push({ ux, uy, s: rnd(), w: rnd() < 0.5 ? 2 : 3 });
  }
  leaves.sort((a, b) => a.uy - b.uy || a.ux - b.ux);
  const pos = (L) => {
    const hf = -L.uy;
    return [Math.round(cx + L.ux * rx * spread + bend * 1.5 * Math.pow(hf, 1.4) * lie), Math.round(by + L.uy * ry * lie)];
  };
  // a dark underlayer first: the mound's own shadow and outline
  for (const L of leaves) { const [x, y] = pos(L); for (let k = 0; k < L.w; k++) { p.set(x + k, y + 1, R[0]); p.set(x + k + 1, y + 1, R[0]); } }
  if (opt.twigs) for (let i = 0; i < opt.twigs; i++) {
    const a = -0.4 - rnd() * 2.3, l = 4 + rnd() * ry * lie;
    for (let k = 0; k < l; k++) p.set(cx + Math.cos(a) * k * spread + bend * 0.12 * k * lie, by + Math.sin(a) * k * lie, k < 2 ? opt.twigs2[0] : opt.twigs2[1]);
  }
  for (const L of leaves) {
    const [x, y] = pos(L);
    const lit = 0.5 + (-L.ux * 0.45 - L.uy * 0.55) * 0.55 + (L.s - 0.5) * 0.35 - (sq === 2 ? 0.25 : 0);
    const ci = Math.max(1, Math.min(5, Math.round(lit * 5)));
    for (let k = 0; k < L.w; k++) p.set(x + k, y, R[ci]);
    p.set(x, y - 1, R[Math.min(5, ci + 1)]);
    if (glow && sq < 2 && (Math.hypot(L.ux, L.uy) > 0.72)) glow.set(x, y - 1, GLOW_LEAF, Math.round(120 + 100 * Math.abs(L.ux)));
  }
  if (opt.berries && sq < 2) for (let i = 0; i < opt.berries; i++) {
    const L = leaves[Math.floor(rnd() * leaves.length)], [x, y] = pos(L);
    p.set(x, y, opt.berry); p.set(x + 1, y, opt.berry.map((v) => v * 0.7)); p.set(x, y - 1, opt.berry.map((v) => Math.min(255, v + 60)));
  }
}

// a wildflower head at the top of its stem
function flowerHead(p, glow, F, x, y, sq, rnd) {
  const [c, d] = F.c;
  if (sq === 2) { if (rnd() < 0.6) { p.set(x, y, d); p.set(x + 1, y, c); } return; }  // crushed: a few petals in the grass
  if (F.head === 'daisy') { p.set(x - 1, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x, y + 1, d); p.set(x, y, F.mid); if (sq === 0) { p.set(x - 2, y, d); p.set(x + 2, y, c); } }
  else if (F.head === 'poppy') { p.set(x, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x + 1, y - 1, hex('#ff8a6a')); p.set(x, y + 1, d); p.set(x + 1, y + 1, d); if (sq === 0) p.set(x + 1, y, F.mid); }
  else if (F.head === 'spike') { const n = sq === 0 ? 6 : 3; for (let k = 0; k < n; k++) { p.set(x, y - k, k % 2 ? d : c); if (k > 0 && k < n - 1) p.set(x + (k % 2 ? 1 : -1), y - k, k % 2 ? c : d); } p.set(x, y - n, F.mid); }
  else { p.set(x, y, c); p.set(x + 1, y, d); p.set(x, y - 1, F.mid); }
  if (glow) { glow.set(x, y - 1, GLOW_PETAL, 210); glow.set(x + 1, y, GLOW_PETAL, 120); }
}

export function plantSheet(kind, variants, bends = null, glowOn = true) {
  const P = PLANTS[kind], R = RAMPS[P.ramp];
  const cols = bends || [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const nv = Math.min(variants, P.variants);
  const cv = canvas(GW * cols.length, GH * nv * SQUASH);
  const gc = glowOn ? canvas(cv.width, cv.height) : null;
  const g = cv.getContext('2d'), gg = gc && gc.getContext('2d');
  const cx = GW / 2, by = GH - 5;
  for (let v = 0; v < nv; v++) {
    const seed = 0x51a7 + v * 1231 + kind.length * 97;
    for (let sq = 0; sq < SQUASH; sq++) for (let c = 0; c < cols.length; c++) {
      const p = new Px(GW, GH), q = glowOn ? new Px(GW, GH) : null;
      const rnd = mulberry32(seed), bend = cols[c];
      if (kind === 'fern') {
        const n = 7 + Math.floor(rnd() * 4);
        const fr = [];
        for (let i = 0; i < n; i++) { const u = (i + 0.2 + rnd() * 0.6) / n; fr.push({ ang: -Math.PI * (0.14 + 0.72 * u), len: Math.round((17 + rnd() * 8) * (0.75 + 0.35 * Math.sin(u * Math.PI))), droop: 0.22 + rnd() * 0.25 }); }
        // the back fronds first, the low side fronds last (they're nearest)
        fr.sort((a, b) => Math.abs(Math.sin(b.ang)) - Math.abs(Math.sin(a.ang)));
        for (const f of fr) frond(p, q, R, cx + (rnd() - 0.5) * 3, by, f.ang, f.len, bend, sq, f.droop);
        p.set(cx, by + 1, R[0]); p.set(cx - 1, by + 1, R[0]); p.set(cx + 1, by + 1, R[0]);
      } else if (kind === 'flowers') {
        const F = FLOWER_KINDS[v % FLOWER_KINDS.length], L = RAMPS.lush;
        // a few leaves at the foot, then the stems
        for (let i = 0; i < 6; i++) blade(p, null, L, cx - 10 + rnd() * 20, by + 1 - rnd() * 3, 4 + rnd() * 5, (rnd() - 0.5) * 8, bend * 0.5, sq, true, null, rnd);
        const n = 5 + Math.floor(rnd() * 5), stems = [];
        for (let i = 0; i < n; i++) stems.push({ bx: cx - 12 + rnd() * 24, by: by - rnd() * 6, h: (F.head === 'spike' ? 14 : 10) + rnd() * 12, lean: (rnd() - 0.5) * 6 });
        stems.sort((a, b) => a.by - b.by);
        for (const s of stems) {
          const tip = blade(p, null, L, s.bx, s.by, s.h, s.lean, bend, sq, false, null, rnd);
          flowerHead(p, q, F, tip[0], tip[1], sq, rnd);
        }
      } else if (kind === 'shrublet') {
        const berry = [hex('#d8303a'), hex('#f2f0f4'), null][v % 3];
        mound(p, q, R, cx, by, 15 + rnd() * 4, 15 + rnd() * 4, 130, bend, sq, rnd, berry ? { berries: 9, berry } : {});
      } else if (kind === 'dryshrub') {
        mound(p, q, R, cx, by, 12 + rnd() * 4, 11 + rnd() * 3, 50, bend, sq, rnd, { twigs: 7, twigs2: [RAMPS.bark[1], RAMPS.bark[3]] });
      } else if (kind === 'reeds') {
        const n = 7 + Math.floor(rnd() * 5);
        const st = [];
        for (let i = 0; i < n; i++) st.push({ bx: cx - 9 + rnd() * 18, by: by - rnd() * 4, h: 22 + rnd() * 16, lean: (rnd() - 0.5) * 5, head: rnd() < 0.4 });
        st.sort((a, b) => a.by - b.by);
        for (const s of st) {
          const tip = blade(p, q, R, s.bx, s.by, s.h, s.lean, bend, sq, false, null, rnd);
          if (s.head && sq < 2) { const [x, y] = tip; for (let k = 2; k < 7; k++) { p.set(x, y + k, hex(k < 4 ? '#8a5a2e' : '#5e3a1c')); p.set(x + 1, y + k, hex('#3e2614')); } p.set(x, y + 1, hex('#c8b070')); }
        }
      }
      p.to(g, c * GW, (v * SQUASH + sq) * GH);
      if (q) q.to(gg, c * GW, (v * SQUASH + sq) * GH);
    }
  }
  return { cv, glow: gc, cw: GW, ch: GH, cols: cols.length, bends: cols, variants: nv };
}

// ---- crops ---------------------------------------------------------------------------------------
// A crop cell is two rows of plants 8 world px apart across a 32 world px strip (cell 48x40 world).
export const CROPS = {
  wheat: { ramp: 'wheat', stem: 'wheat', per: 9, h: [26, 34] },
  barley: { ramp: 'barley', stem: 'barley', per: 9, h: [22, 30] },
  corn: { ramp: 'corn', stem: 'corn', per: 5, h: [44, 58] },
  cabbage: { ramp: 'cabbage', stem: 'cabbage', per: 5, h: [8, 12] },
  sunflower: { ramp: 'corn', stem: 'corn', per: 5, h: [40, 52] },
};
export const CROP_CELL = { w: 48, h: 40 };
const CW = CROP_CELL.w * S, CH = CROP_CELL.h * S;

function wheatPlant(p, glow, R, bx, by, h, bend, sq, rnd) {
  const stems = 3 + Math.floor(rnd() * 3);
  for (let k = 0; k < stems; k++) {
    const sx = bx + (k - stems / 2) * 1.6 + (rnd() - 0.5), hh = h * (0.85 + rnd() * 0.2), lean = (rnd() - 0.5) * 4;
    const lie = sq === 0 ? 0 : sq === 1 ? 0.4 : 0.85, side = bend !== 0 ? Math.sign(bend) : lean >= 0 ? 1 : -1;
    const top = hh * (1 - lie * 0.85), span = hh * lie * 0.9 * side;
    let lx = sx, ly = by;
    for (let i = 0; i <= Math.ceil(Math.max(top, Math.abs(span))); i++) {
      const t = i / Math.ceil(Math.max(top, Math.abs(span)) || 1);
      const x = Math.round(sx + lean * t * t + bend * 2.2 * Math.pow(t, 1.8) * (1 - lie) + span * t), y = Math.round(by - top * t);
      p.set(x, y, R[Math.min(4, 1 + Math.round(t * 2.5) - (sq === 2 ? 1 : 0))]);
      lx = x; ly = y;
    }
    // the ear: a plump grain head with whiskers (awns); some riper than others
    const dx = lie > 0.5 ? side : 0, dy = lie > 0.5 ? 0 : -1, ripe = rnd() < 0.3 ? -1 : 0;
    for (let j = 0; j < 6; j++) {
      const x = lx + dx * j, y = ly + dy * j;
      const ci = Math.max(1, (sq === 2 ? 3 : j < 2 ? 3 : j < 4 ? 4 : 5) + ripe);
      p.set(x, y, R[ci]); p.set(x + (dx ? 0 : 1), y + (dx ? 1 : 0), R[ci - 1]);
      if (j % 2 === 1) { p.set(x - (dx ? 0 : 1), y - (dx ? 1 : 0), R[Math.min(5, ci)]); }
      if (glow && sq < 2) glow.set(x, y, GLOW_GRASS, 230);
    }
    if (sq < 2) for (let j = 0; j < 3; j++) p.set(lx + dx * (6 + j) + (dx ? 0 : (j % 2 ? 1 : -1)), ly + dy * (6 + j), R[5], 180);
  }
}
function cornPlant(p, glow, R, bx, by, h, bend, sq, rnd, sun) {
  const lie = sq === 0 ? 0 : sq === 1 ? 0.35 : 0.8, side = bend !== 0 ? Math.sign(bend) : 1;
  const top = h * (1 - lie * 0.85), span = h * lie * 0.85 * side;
  const pt = (t) => [Math.round(bx + bend * 2.6 * Math.pow(t, 1.8) * (1 - lie) + span * t), Math.round(by - top * t)];
  let last = [bx, by];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, [x, y] = pt(t);
    p.set(x, y, R[2 + (t > 0.5 ? 1 : 0) - (sq === 2 ? 1 : 0)]); p.set(x + 1, y, R[1]);
    last = [x, y];
  }
  // long arching leaves, alternate sides
  const leaves = 5;
  for (let k = 0; k < leaves; k++) {
    const t0 = 0.18 + k * 0.14, [x0, y0] = pt(t0), d = k % 2 ? 1 : -1, len = 12 + rnd() * 8;
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const x = Math.round(x0 + d * i * (lie > 0.5 ? 0.4 : 1) + bend * u * 1.4), y = Math.round(y0 - Math.sin(u * 2.4) * 5 * (1 - lie) + u * u * 6);
      p.set(x, y, R[Math.min(5, 2 + Math.round((1 - u) * 2) - (sq === 2 ? 1 : 0))]); p.set(x, y + 1, R[1]);
      if (glow && sq < 2 && u > 0.4) glow.set(x, y, GLOW_GRASS, 170);
    }
  }
  if (sun) {
    // sunflower: a big bright head facing the viewer
    const [hx, hy] = last;
    const Y = hex('#f6c62c'), Y2 = hex('#ffe066'), Br = hex('#5a3418'), Br2 = hex('#3a2010');
    for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; for (let r = 4; r < 7; r++) p.set(hx + Math.cos(an) * r, hy - 3 + Math.sin(an) * r * 0.8, r < 5 ? Y : Y2); }
    for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) if (xx * xx + yy * yy <= 10) p.set(hx + xx, hy - 3 + yy * 0.8, (xx + yy) % 2 ? Br : Br2);
    if (glow && sq < 2) for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; glow.set(hx + Math.cos(an) * 6, hy - 3 + Math.sin(an) * 5, GLOW_PETAL, 220); }
  } else if (sq < 2) {
    // the tassel, and an ear on the stalk
    const [tx, ty] = last, T1 = hex('#e8c860'), T2 = hex('#b8963c');
    for (let j = 0; j < 5; j++) { p.set(tx + (j % 2 ? 1 : -1) * (j >> 1), ty - j, j % 2 ? T1 : T2); if (glow) glow.set(tx, ty - j, GLOW_GRASS, 230); }
    const [ex, ey] = pt(0.55);
    for (let j = 0; j < 6; j++) { p.set(ex + 2, ey + j, hex('#c8d070')); p.set(ex + 3, ey + j, hex('#9aa848')); }
  }
}
function cabbagePlant(p, glow, R, bx, by, h, bend, sq) {
  const r = h * (sq === 2 ? 0.7 : 1), cx = bx + (sq === 0 ? bend * 0.2 : bend * 0.6), cy = by - r * 0.6;
  for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 3; x <= r + 3; x++) {
    const d = Math.hypot(x / 1.15, y);
    if (d > r + 1.5) continue;
    if (d > r) { p.set(cx + x, cy + y, R[0]); continue; }
    const nx = x / r, ny = y / r, l = 0.55 - nx * 0.35 - ny * 0.45;
    const leafLine = Math.abs(Math.atan2(y, x) * 3 % 1) < 0.12 && d > r * 0.35;
    let ci = Math.round(1.5 + l * 3.5 + bayer(x + 8, y + 8));
    if (leafLine) ci -= 1;
    if (sq === 2) ci -= 1;
    p.set(cx + x, cy + y, R[Math.max(0, Math.min(5, ci))]);
    if (glow && sq < 2 && d > r - 1.5 && nx < 0.2) glow.set(cx + x, cy + y, GLOW_GRASS, 110);
  }
}
export function cropSheet(kind, variants, bends = null, glowOn = true) {
  const C = CROPS[kind], R = RAMPS[C.ramp];
  const cols = bends || [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const cv = canvas(CW * cols.length, CH * variants * SQUASH);
  const gc = glowOn ? canvas(cv.width, cv.height) : null;
  const g = cv.getContext('2d'), gg = gc && gc.getContext('2d');
  for (let v = 0; v < variants; v++) {
    const rnd0 = mulberry32(0xc209 + v * 313 + kind.length * 71);
    const plants = [];
    for (const row of [0, 1]) for (let i = 0; i < C.per; i++) {
      plants.push({ bx: CW / 2 - 32 + (i + 0.5) * (64 / C.per) + (rnd0() - 0.5) * (kind === 'cabbage' ? 2 : 4), by: CH - 4 - (1 - row) * 16 - rnd0() * 2, h: C.h[0] + rnd0() * (C.h[1] - C.h[0]), seed: rnd0() * 1e9 });
    }
    plants.sort((a, b) => a.by - b.by);
    for (let sq = 0; sq < SQUASH; sq++) for (let c = 0; c < cols.length; c++) {
      const p = new Px(CW, CH), q = glowOn ? new Px(CW, CH) : null;
      for (const pl of plants) {
        const r = mulberry32(pl.seed | 0);
        if (kind === 'wheat' || kind === 'barley') wheatPlant(p, q, R, pl.bx, pl.by, pl.h, cols[c], sq, r);
        else if (kind === 'cabbage') cabbagePlant(p, q, R, pl.bx, pl.by, pl.h, cols[c], sq);
        else cornPlant(p, q, R, pl.bx, pl.by, pl.h, cols[c], sq, r, kind === 'sunflower');
      }
      p.to(g, c * CW, (v * SQUASH + sq) * CH);
      if (q) q.to(gg, c * CW, (v * SQUASH + sq) * CH);
    }
  }
  return { cv, glow: gc, cw: CW, ch: CH, cols: cols.length, bends: cols, variants };
}

// ---- crowns: trees, palms, bushes ------------------------------------------------------------------
// The crown is a cluster of round leaf masses. Every pixel is shaded as if the masses were domes
// lit from the top left, with darker seams where one mass tucks behind another, leaf-clump noise,
// Bayer dithering between the palette steps, a dark outline, and a few bright leaf glints.
const L3 = (() => { const v = [-0.5, -0.62, 0.6]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
function crownPx(w, h, blobs, R, rnd, opt = {}) {
  const p = new Px(w, h);
  const H = new Float32Array(w * h), ID = new Int16Array(w * h).fill(-1), H2 = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = 0, bi = -1, second = 0;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const ang = Math.atan2(y - b.y, x - b.x);
      const rr = b.r * (1 + (b.serr || 0) * Math.sin(ang * (b.teeth || 9) + b.ph) + 0.06 * Math.sin(ang * 5 + b.ph * 2));
      const d2 = ((x - b.x) ** 2) / (rr * rr) + ((y - b.y) ** 2) / (rr * rr * (b.sy || 1) * (b.sy || 1));
      if (d2 >= 1) continue;
      const hgt = Math.sqrt(1 - d2) * (b.z || 1) + (b.lift || 0);
      if (hgt > best) { second = best; best = hgt; bi = i; } else if (hgt > second) second = hgt;
    }
    if (bi >= 0) { H[y * w + x] = best; ID[y * w + x] = bi; H2[y * w + x] = second; }
  }
  // value noise for leaf clumps
  const cell = opt.clump || 3, nw = Math.ceil(w / cell) + 2, nh = Math.ceil(h / cell) + 2;
  const nz = new Float32Array(nw * nh).map(() => rnd());
  const noise = (x, y) => {
    const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const a = nz[iy * nw + ix], b = nz[iy * nw + ix + 1], c = nz[(iy + 1) * nw + ix], d = nz[(iy + 1) * nw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const glowL = new Px(w, h), glowR = new Px(w, h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (ID[i] < 0) continue;
    const b = blobs[ID[i]];
    // normal of the dome this pixel is on
    const nx = (x - b.x) / b.r, ny = (y - b.y) / (b.r * (b.sy || 1)), nz2 = Math.max(0, 1 - nx * nx - ny * ny), nzz = Math.sqrt(nz2);
    let lit = 0.5 + 0.55 * (nx * L3[0] + ny * L3[1] + nzz * L3[2]);
    lit += (noise(x, y) - 0.5) * (opt.noise ?? 0.45);
    lit += ((b.y - opt.cy) / opt.ry) * -0.12;            // masses higher up the crown catch more light
    if (H[i] - H2[i] < 0.07 && H2[i] > 0) lit -= 0.22;     // the seam where masses overlap
    if (opt.cx !== undefined) lit -= Math.max(0, (x - opt.cx) / opt.rx + (y - opt.cy) / opt.ry) * 0.16; // the crown's own shade, lower right
    let ci = Math.round(0.6 + lit * 4.4 + bayer(x, y) * 0.9);
    ci = Math.max(1, Math.min(5, ci));
    p.set(x, y, R[ci]);
    // the outline: next to the outside
    const out = ID[i - 1] < 0 || ID[i + 1] < 0 || ID[i - w] < 0 || ID[i + w] < 0;
    if (out) { p.set(x, y, R[0]); }
    // glow masks: the rim on the side the sun is on, and a few lit leaf edges inside
    const rimL = ID[i - 1] < 0 || ID[i - 2] < 0 || ID[i - 3] < 0 || ID[i - w] < 0 || ID[i - w - 2] < 0;
    const rimR = ID[i + 1] < 0 || ID[i + 2] < 0 || ID[i + 3] < 0 || ID[i - w] < 0 || ID[i - w + 2] < 0;
    const inner = noise(x * 1.7 + 11, y * 1.7) > 0.72 && ci >= 3;
    if (rimL || inner) glowL.set(x, y, opt.glow || GLOW_LEAF, rimL ? (out ? 150 : 230) : 90);
    if (rimR || inner) glowR.set(x, y, opt.glow || GLOW_LEAF, rimR ? (out ? 150 : 230) : 90);
  }
  // leaf glints and holes
  for (let k = 0; k < (w * h) / 70; k++) {
    const x = 2 + Math.floor(rnd() * (w - 4)), y = 2 + Math.floor(rnd() * (h - 4)), i = y * w + x;
    if (ID[i] < 0 || ID[i - 1] < 0 || ID[i + 1] < 0) continue;
    const nx = (x - blobs[ID[i]].x) / blobs[ID[i]].r, ny = (y - blobs[ID[i]].y) / blobs[ID[i]].r;
    if (nx + ny < -0.3) { p.set(x, y, R[5]); p.set(x + 1, y, R[4]); }
    else if (nx + ny > 0.5 && opt.holes !== false) p.set(x, y, R[0]);
  }
  if (opt.dots) for (let k = 0; k < opt.dots.n; k++) {
    const x = 2 + Math.floor(rnd() * (w - 4)), y = 2 + Math.floor(rnd() * (h - 4)), i = y * w + x;
    if (ID[i] < 0 || ID[i - 1] < 0 || ID[i + 1] < 0 || ID[i - w] < 0) continue;
    const c = opt.dots.cols[Math.floor(rnd() * opt.dots.cols.length)];
    p.set(x, y, c); p.set(x + 1, y, c.map((v) => v * 0.75)); p.set(x, y - 1, c.map((v) => Math.min(255, v + 40)));
    glowL.set(x, y, GLOW_PETAL, 160); glowR.set(x, y, GLOW_PETAL, 160);
  }
  return { p, glowL, glowR, mask: ID };
}
function trunkPx(p, R, cx, top, foot, wd, rnd, kind = 'bark') {
  const B = RAMPS[kind];
  for (let y = top; y <= foot; y++) {
    const t = (y - top) / Math.max(1, foot - top);
    const half = wd / 2 + (t > 0.8 ? (t - 0.8) * 14 : 0);     // the roots flare out at the foot
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const u = (x - (cx - half)) / (2 * half);
      let ci = u < 0.18 ? 0 : u < 0.4 ? 4 : u < 0.7 ? 3 : u < 0.88 ? 2 : 1;
      if (kind === 'bark' && (x * 7 + y * 3) % 11 === 0) ci = Math.max(0, ci - 2);  // bark furrows
      if (kind === 'birchbark' && rnd() < 0.08) ci = 0;                          // birch's dark marks
      if (x === Math.round(cx - half) || x === Math.round(cx + half)) ci = 0;
      p.set(x, y, B[ci]);
    }
  }
}

// Tree kinds: oak, maple, pine, birch, blossom. w, h: the sprite in world px (its prop's size).
export function treeSprite(kind, variant, w, h) {
  const W = w * S, Hh = h * S;
  const rnd = mulberry32(0x7ee0 + variant * 1013 + kind.length * 97);
  const cx = W / 2, foot = Hh - 6;
  const R = RAMPS[kind] || RAMPS.oak;
  let blobs = [], trunkTop, cy, ry;
  if (kind === 'pine') {
    // tiers of spiky skirts, smaller toward the top
    cy = Hh * 0.42; ry = Hh * 0.36;
    const tiers = 5;
    for (let k = 0; k < tiers; k++) {
      const t = k / (tiers - 1);
      blobs.push({ x: cx + (rnd() - 0.5) * 3, y: Hh * 0.72 - t * Hh * 0.56, r: W * (0.42 - t * 0.27), sy: 0.62, serr: 0.16, teeth: 13 + k * 2, ph: rnd() * 6, z: 0.8, lift: t * 0.6 });
    }
    trunkTop = Hh * 0.7;
  } else if (kind === 'birch') {
    cy = Hh * 0.36; ry = Hh * 0.26;
    blobs.push({ x: cx, y: cy, r: W * 0.24, ph: rnd() * 6 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * 6.283 + rnd() * 0.5; blobs.push({ x: cx + Math.cos(a) * W * 0.2, y: cy + Math.sin(a) * Hh * 0.13, r: W * (0.11 + rnd() * 0.06), ph: rnd() * 6, lift: Math.sin(a) < 0 ? 0.2 : 0 }); }
    trunkTop = Hh * 0.42;
  } else {
    // oak, maple, blossom: a broad dome of masses
    cy = Hh * 0.38; ry = Hh * 0.3;
    blobs.push({ x: cx, y: cy, r: W * 0.3, ph: rnd() * 6 });
    const n = 7 + Math.floor(rnd() * 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + rnd() * 0.4;
      blobs.push({ x: cx + Math.cos(a) * W * (0.22 + rnd() * 0.05), y: cy + Math.sin(a) * Hh * (0.15 + rnd() * 0.04), r: W * (0.14 + rnd() * 0.07), ph: rnd() * 6, lift: Math.sin(a) < -0.2 ? 0.25 : 0 });
    }
    if (kind === 'maple') blobs.forEach((b) => { b.serr = 0.1; b.teeth = 7; });
    trunkTop = Hh * 0.5;
  }
  // small clumps over the surface of the big masses break up their outline
  const big = blobs.length;
  if (kind !== 'pine') for (let k = 0; k < big * 3; k++) { const b = blobs[Math.floor(rnd() * big)], a = rnd() * 6.283, d = b.r * (0.55 + rnd() * 0.4); blobs.push({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d * 0.9, r: b.r * (0.28 + rnd() * 0.2), ph: rnd() * 6, lift: (b.lift || 0) + 0.12, z: 0.9 }); }
  const crown = crownPx(W, Hh, blobs, R, rnd, { cx, rx: W * 0.4, cy, ry, clump: 2, dots: kind === 'blossom' ? { n: 60, cols: [hex('#ffffff'), hex('#ffe8f0')] } : null, glow: kind === 'blossom' ? GLOW_PETAL : GLOW_LEAF });
  const trunk = new Px(W, Hh);
  trunkPx(trunk, R, cx, Math.round(trunkTop), foot, kind === 'pine' ? 6 : kind === 'birch' ? 5 : 8, rnd, kind === 'birch' ? 'birchbark' : 'bark');
  if (kind === 'birch') trunkPx(trunk, R, cx + 7, Math.round(trunkTop + 8), foot - 2, 3, rnd, 'birchbark'); // a second slim stem
  return finish({ crown: crown.p, trunk, glowL: crown.glowL, glowR: crown.glowR, W, Hh, pivotY: Math.round(trunkTop + (foot - trunkTop) * 0.2), foot });
}

// Palms: a curving ringed trunk and a burst of drooping fronds with leaflets.
export function palmSprite(variant, w, h, small = false) {
  const W = w * S, Hh = h * S;
  const rnd = mulberry32(0xa1a0 + variant * 733 + (small ? 17 : 0));
  const R = RAMPS.palm, B = RAMPS.palmbark;
  const foot = Hh - 6, lean = (rnd() - 0.5) * W * 0.18;
  const top = [W / 2 + lean, Hh * (small ? 0.42 : 0.34)];
  const trunk = new Px(W, Hh);
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push([W / 2 + lean * t * t, foot - (foot - top[1]) * t]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i], wd = (small ? 3 : 4) + (1 - i / 40) * 2;
    for (let k = -wd; k <= wd; k++) {
      const u = (k + wd) / (2 * wd);
      let ci = u < 0.15 ? 0 : u < 0.4 ? 4 : u < 0.75 ? 3 : 2;
      if (i % 4 === 0) ci = Math.max(0, ci - 2);           // the rings of the trunk
      if (Math.abs(k) === wd) ci = 0;
      trunk.set(x + k, y, B[ci]);
    }
  }
  const crown = new Px(W, Hh), glowL = new Px(W, Hh), glowR = new Px(W, Hh);
  const n = small ? 7 : 9 + Math.floor(rnd() * 3);
  const fronds = [];
  for (let k = 0; k < n; k++) fronds.push({ a: (k / n) * 6.283 + rnd() * 0.3, len: (small ? 0.3 : 0.4) * W * (0.85 + rnd() * 0.3) });
  fronds.sort((a, b) => Math.sin(a.a) - Math.sin(b.a)); // the ones reaching back (up the screen) first
  for (const f of fronds) {
    const dx = Math.cos(f.a), dy = Math.sin(f.a) * 0.6;
    const droop = 0.35 + 0.4 * (dy > 0 ? dy : 0);
    for (let i = 0; i < f.len; i++) {
      const t = i / f.len;
      const x = Math.round(top[0] + dx * i), y = Math.round(top[1] + dy * i - Math.sin(t * Math.PI) * f.len * 0.18 + t * t * f.len * droop);
      const lit = 0.55 - dx * 0.3 - dy * 0.4 + (1 - t) * 0.2;
      const ci = Math.max(1, Math.min(5, Math.round(1 + lit * 4)));
      crown.set(x, y, R[ci]); crown.set(x, y + 1, R[Math.max(0, ci - 2)]);
      if (i > 2 && i % 2 === 0) {
        // leaflets either side, shorter toward the tip
        const ll = Math.round((1 - t) * 7 + 2);
        for (let s = -1; s <= 1; s += 2) for (let j = 1; j <= ll; j++) {
          const lx = x + (-dy * s * j * 0.9) + dx * j * 0.35, ly = y + (dx * s * j * 0.5) + j * 0.55;
          crown.set(lx, ly, R[Math.max(1, ci - (s > 0 ? 1 : 0) - (j > ll - 2 ? 1 : 0))]);
          if (j > ll - 3) { if (dx < 0.3) glowL.set(lx, ly, GLOW_LEAF, 200); if (dx > -0.3) glowR.set(lx, ly, GLOW_LEAF, 200); }
        }
      }
    }
  }
  // coconuts at the heart of the crown
  if (!small) for (let k = 0; k < 3; k++) { const x = top[0] - 3 + k * 3, y = top[1] + 3 + (k % 2); crown.set(x, y, hex('#5a3a1a')); crown.set(x + 1, y, hex('#3a2410')); crown.set(x, y - 1, hex('#8a6030')); }
  return finish({ crown, trunk, glowL, glowR, W, Hh, pivotY: Math.round(foot - (foot - top[1]) * 0.3), foot, palm: true });
}

// Bushes and shrubs: low round crowns, a few kinds. Returned in 5 lean frames (-2..2).
export function bushSprite(kind, variant, w, h) {
  const W = w * S, Hh = h * S;
  const rnd = mulberry32(0xb05b + variant * 571 + kind.length * 59);
  const R = RAMPS[kind === 'flowering' || kind === 'round' ? 'shrub' : kind === 'yellow' ? 'birch' : kind === 'olive' ? 'olive' : 'shrub'];
  const cy = Hh * 0.55, rx = W * 0.4;
  const blobs = [{ x: W / 2, y: cy, r: rx * 0.72, sy: 0.85, ph: rnd() * 6 }];
  const n = 4 + Math.floor(rnd() * 3);
  for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + rnd() * 0.5; blobs.push({ x: W / 2 + Math.cos(a) * rx * 0.45, y: cy + Math.sin(a) * rx * 0.3, r: rx * (0.38 + rnd() * 0.16), sy: 0.85, ph: rnd() * 6, lift: Math.sin(a) < 0 ? 0.2 : 0 }); }
  const dots = kind === 'flowering' ? { n: 26, cols: [FLOWERS[2], FLOWERS[0], FLOWERS[3]].slice(variant % 2, 3) } : null;
  const c = crownPx(W, Hh, blobs, R, rnd, { cy, ry: rx, dots, clump: 2, noise: 0.5 });
  return finish({ crown: c.p, trunk: null, glowL: c.glowL, glowR: c.glowR, W, Hh, pivotY: Hh - 4, foot: Hh - 4, bush: true });
}

// A bed of flowers: leafy stems with bright heads.
export function flowerSprite(variant, w, h, big = false) {
  const W = w * S, Hh = h * S;
  const rnd = mulberry32(0xf10e + variant * 241 + (big ? 7 : 0));
  const p = new Px(W, Hh), gl = new Px(W, Hh);
  const R = RAMPS.lush;
  const cols = [FLOWERS[(variant * 2) % FLOWERS.length], FLOWERS[(variant * 2 + 3) % FLOWERS.length], FLOWERS[0]];
  const n = big ? 26 : 30;
  const items = [];
  for (let i = 0; i < n; i++) items.push({ x: W * 0.12 + rnd() * W * 0.76, y: Hh * (big ? 0.35 : 0.3) + rnd() * Hh * (big ? 0.58 : 0.62), h: (big ? 14 : 8) + rnd() * (big ? 16 : 8), c: cols[Math.floor(rnd() * cols.length)] });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) {
    for (let j = 0; j < it.h; j++) { p.set(it.x + (j > it.h * 0.6 ? 1 : 0), it.y - j, R[1 + Math.round((j / it.h) * 2)]); if (j === Math.round(it.h * 0.4)) { p.set(it.x - 1, it.y - j, R[3]); p.set(it.x - 2, it.y - j + 1, R[2]); p.set(it.x + 1, it.y - j, R[3]); } }
    const tx = it.x + 1, ty = it.y - it.h, c = it.c, hi = c.map((v) => Math.min(255, v + 45)), lo = c.map((v) => v * 0.62);
    for (const [dx, dy, cc] of [[0, -1, hi], [-1, 0, c], [1, 0, c], [0, 1, lo], [0, 0, hex('#ffe070')], [-1, -1, hi], [1, 1, lo], [1, -1, c], [-1, 1, lo]]) p.set(tx + dx, ty + dy, cc);
    gl.set(tx, ty - 1, GLOW_PETAL, 220); gl.set(tx - 1, ty, GLOW_PETAL, 160);
  }
  return finish({ crown: p, trunk: null, glowL: gl, glowR: gl, W, Hh, pivotY: Hh - 3, foot: Hh - 3, bush: true });
}

// Pack a sprite's parts onto canvases: { crown, trunk, glowL, glowR, full (crown over trunk) }.
function finish(o) {
  const mk = (px) => { if (!px) return null; const c = canvas(o.W, o.Hh); px.to(c.getContext('2d'), 0, 0); return c; };
  const crown = mk(o.crown), trunk = mk(o.trunk), glowL = mk(o.glowL), glowR = o.glowR === o.glowL ? glowL : mk(o.glowR);
  const full = canvas(o.W, o.Hh);
  const fg = full.getContext('2d');
  if (trunk) fg.drawImage(trunk, 0, 0);
  fg.drawImage(crown, 0, 0);
  return { crown, trunk, glowL, glowR, full, w: o.W / S, h: o.Hh / S, pivotY: o.pivotY / S, foot: o.foot / S, palm: !!o.palm, bush: !!o.bush };
}

// ---- the ground ------------------------------------------------------------------------------------
// Grass ground, painted per world pixel straight into an ImageData: mottled tones from layered
// value noise, dithered where they meet, little light and dark strokes of grass, clover and
// daisies on lawns, mowing stripes on smart lawns, leaf litter on the forest floor, bare earth in
// dry country. Seamless: everything is in world coordinates.
const GROUND = {
  lawn: { r: 'lawn', base: 2.2, var: 0.9, stripes: true, clover: 0.0015 },
  lush: { r: 'lush', base: 2.1, var: 1.1, clover: 0.001 },
  park: { r: 'lush', base: 2.2, var: 1.1, clover: 0.002 },
  meadow: { r: 'meadow', base: 2, var: 1.3, clover: 0.003 },
  forest: { r: 'forest', base: 1.8, var: 1.3, litter: 0.3 },
  dry: { r: 'dry', base: 2, var: 1.3, earth: 0.35 },
  dune: { r: 'dune', base: 2.3, var: 1 },
  earth: { r: 'dry', base: 2, var: 1, earth: 1 },
};
function h32(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// periodic value noise: repeats every `per` px (per must be a multiple of sc), so the ground texture tiles
function vnoise(x, y, sc, s, per = 512) {
  const n = per / sc, fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const m = (v) => ((v % n) + n) % n;
  const a = h32(m(ix), m(iy), s), b = h32(m(ix + 1), m(iy), s), c = h32(m(ix), m(iy + 1), s), d = h32(m(ix + 1), m(iy + 1), s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// Paint one 32x32 world px tile of ground into data (RGBA, stride sw) at (ox, oy).
// kind: a GROUND key; wx, wy: the tile's world px origin. soil: 'field' paints tilled earth.
export function paintGroundTile(data, sw, ox, oy, wx, wy, kind) {
  if (kind === 'field') return paintSoil(data, sw, ox, oy, wx, wy);
  const G = GROUND[kind] || GROUND.lush, R = RAMPS[G.r];
  const SOIL = RAMPS.soil;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const X = wx + x, Y = wy + y;
    // broad, soft patches of lighter and darker grass
    const n = vnoise(X, Y, 32, 1) * 0.65 + vnoise(X, Y, 8, 2) * 0.35;
    let v = G.base - G.var / 2 + n * G.var;
    if (G.stripes) v += (Math.floor((Y + Math.sin(X * Math.PI / 256) * 6) / 32) % 2 ? 0.3 : -0.2);
    // the grain: short vertical strokes, like blades seen from above, each a few px tall with a
    // lighter tip - the texture that makes it read as grass rather than felt
    const col = h32(X & 511, 0, 5) * 3 | 0;
    const yy = (Y & 511) + col, seg = Math.floor(yy / 3) % 171, inSeg = yy - Math.floor(yy / 3) * 3;
    const st = h32(X & 511, seg, 11);
    if (st > 0.62) v += inSeg === 0 ? 0.95 : 0.45;        // a lit blade
    else if (st < 0.2) v -= inSeg === 2 ? 0.9 : 0.5;      // a shaded gap
    let ci = Math.max(0, Math.min(5, Math.round(v)));
    let c = R[ci];
    const r = h32(X, Y, 7);
    if (G.litter && vnoise(X, Y, 8, 4) > 1 - G.litter * 0.6 && r > 0.55) c = r > 0.8 ? RAMPS.bark[3] : r > 0.68 ? RAMPS.wheat[2] : RAMPS.bark[4];
    if (kind === 'earth') {
      const e = vnoise(X, Y, 16, 5);
      if (e < 0.72 || r < 0.15) c = SOIL[Math.max(1, Math.min(5, Math.round(2.2 + (vnoise(X, Y, 8, 6) - 0.5) * 1.6 + bayer(X, Y) * 0.7)))];
      if (h32(X >> 1, Y >> 1, 12) < 0.012) c = h32(X, Y, 13) < 0.5 ? hex('#8a8478') : hex('#5a554c'); // pebbles
    } else if (G.earth && vnoise(X, Y, 16, 5) > 1 - G.earth * 0.55) {
      const e = vnoise(X, Y, 16, 5) - (1 - G.earth * 0.55);
      if (e > 0.04 || r < e * 20) c = SOIL[2 + Math.round(vnoise(X, Y, 4, 6) * 2)];
    }
    // the odd daisy or buttercup on lawns and meadows: a single bright pixel with a dark foot
    if (G.clover && r < G.clover) c = h32(X, Y, 3) < 0.6 ? FLOWERS[0] : FLOWERS[1];
    const i = ((oy + y) * sw + ox + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
}
function paintSoil(data, sw, ox, oy, wx, wy) {
  const R = RAMPS.soil;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const X = wx + x, Y = wy + y;
    const row = ((Y % 16) + 16) % 16;                       // furrows run east-west, 16 px apart
    let v = row < 3 ? 1 : row < 6 ? 3.4 : row < 12 ? 2.6 : 2;
    v += (vnoise(X, Y, 16, 3) - 0.5) * 1.2 + bayer(X, Y) * 0.6;
    if (h32(X, Y, 8) < 0.06) v += 1;
    const c = R[Math.max(0, Math.min(5, Math.round(v)))];
    const i = ((oy + y) * sw + ox + x) * 4;
    data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
}
export { rgb };
