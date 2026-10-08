// Art v2 core: a "G-buffer" raster. Every v2 sprite, and the scene layers the renderer lights, is four
// maps of the same size:
//   col  albedo RGBA (alpha = coverage)
//   nrm  world normal, RGB = n * 0.5 + 0.5 (X east, Y south, Z up), A = 255 where set
//   z    height above the ground in world px (Uint16) - what cast shadows and reflections use
//   emi  emissive RGB + strength in A (lamps, lit windows, neon, headlights)
//   flag bits: 1 ground, 2 water, 4 casts no shadow, 8 wet-able, 16 thin (characters, posts), 32 foliage
// Projection (docs/art-v2/SPEC.md): screen x = X, screen y = Y - Z.

export const F_GROUND = 1, F_WATER = 2, F_NOCAST = 4, F_WET = 8, F_CHAR = 16, F_LEAF = 32, F_GLASS = 64, F_AIR = 128; // F_AIR: up in the air (birds): no mirror image in wet ground or water
// F_THIN (= F_CHAR): a thin upright thing - a person, a lamp post, a sign. The shadow march treats every other
// pixel as the front of a solid that runs well back behind it, so a tall thin post smeared a wedge from its top
// down to its foot; a thin pixel only blocks the sun for rays that pass just behind it (lightgame.js THIN_D), so
// a post casts its own shape along the ground from its base.
export const F_THIN = F_CHAR;

// One half of a sprite cut through (the plasma blade's kill): the pixels on one side ('a' or 'b') of the line through
// their middle across their long axis, moved gap/2 px away from the other half, the cut edge glowing (a seared
// wound). The anchor stays on the same world point, so both halves draw at the body's own position.
export function cutGBuf(G, which, gap = 5, glow = [255, 170, 90, 210]) {
  const { w, h } = G;
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (G.col[(y * w + x) * 4 + 3]) { n++; sx += x + 0.5; sy += y + 0.5; }
  if (!n) return G;
  const cx = sx / n, cy = sy / n;
  let xx = 0, yy = 0, xy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (G.col[(y * w + x) * 4 + 3]) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const th = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(th), uy = Math.sin(th), sgn = which === 'a' ? -1 : 1;
  const gp = Math.ceil(gap / 2) + 1, ox = gp + Math.round(sgn * ux * gap / 2), oy = gp + Math.round(sgn * uy * gap / 2);
  const O = new GBuf(w + gp * 2, h + gp * 2);
  O.ax = (G.ax || 0) + gp; O.ay = (G.ay || 0) + gp;
  if (G.ap) O.ap = G.ap;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = i * 4;
    if (!G.col[j + 3]) continue;
    const s = (x + 0.5 - cx) * ux + (y + 0.5 - cy) * uy;
    if ((s < 0) !== (which === 'a')) continue;
    const X = x + ox, Y = y + oy, k = Y * O.w + X, q = k * 4;
    for (let c = 0; c < 4; c++) { O.col[q + c] = G.col[j + c]; O.nrm[q + c] = G.nrm[j + c]; O.emi[q + c] = G.emi[j + c]; }
    O.z[k] = G.z[i]; O.flag[k] = G.flag[i];
    if (Math.abs(s) < 1.4) { O.emi[q] = glow[0]; O.emi[q + 1] = glow[1]; O.emi[q + 2] = glow[2]; O.emi[q + 3] = glow[3]; O.col[q] = Math.min(255, O.col[q] * 0.6 + 90); O.col[q + 1] *= 0.55; O.col[q + 2] *= 0.45; }
  }
  return O;
}

export class GBuf {
  constructor(w, h) {
    this.w = w | 0; this.h = h | 0;
    const n = this.w * this.h;
    this.col = new Uint8ClampedArray(n * 4);
    this.nrm = new Uint8ClampedArray(n * 4);
    this.z = new Uint16Array(n);
    this.emi = new Uint8ClampedArray(n * 4);
    this.flag = new Uint8Array(n);
  }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  // put one pixel. c [r,g,b], n [x,y,z] (unit), z height, e [r,g,b,strength] or null
  put(x, y, c, n, z = 0, e = null, flag = 0, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x, j = i * 4;
    this.col[j] = c[0]; this.col[j + 1] = c[1]; this.col[j + 2] = c[2]; this.col[j + 3] = a;
    if (n) { this.nrm[j] = (n[0] * 0.5 + 0.5) * 255; this.nrm[j + 1] = (n[1] * 0.5 + 0.5) * 255; this.nrm[j + 2] = (n[2] * 0.5 + 0.5) * 255; this.nrm[j + 3] = 255; }
    this.z[i] = Math.max(0, Math.round(z));
    if (e) { this.emi[j] = e[0]; this.emi[j + 1] = e[1]; this.emi[j + 2] = e[2]; this.emi[j + 3] = e[3] ?? 255; }
    else this.emi[j + 3] = 0;
    this.flag[i] = flag;
  }
  alpha(x, y) { return this.inside(x, y) ? this.col[(y * this.w + x) * 4 + 3] : 0; }
  // add glow without changing the surface (a lit window, a neon tube)
  glow(x, y, e) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return;
    const j = (y * this.w + x) * 4;
    this.emi[j] = e[0]; this.emi[j + 1] = e[1]; this.emi[j + 2] = e[2]; this.emi[j + 3] = Math.max(this.emi[j + 3], e[3] ?? 255);
  }
  // Copy another buffer in at (ox, oy) (its top-left), raising its heights by dz. Painter's order:
  // later blits cover earlier ones.
  blit(s, ox, oy, dz = 0, flagOr = 0) {
    ox |= 0; oy |= 0;
    const x0 = Math.max(0, -ox), y0 = Math.max(0, -oy), x1 = Math.min(s.w, this.w - ox), y1 = Math.min(s.h, this.h - oy);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const si = y * s.w + x, sj = si * 4, a = s.col[sj + 3];
        if (!a) continue;
        const di = (y + oy) * this.w + x + ox, dj = di * 4;
        if (a < 255) { // partial: blend colour, keep the rest of the destination
          const k = a / 255;
          for (let c = 0; c < 3; c++) this.col[dj + c] = this.col[dj + c] * (1 - k) + s.col[sj + c] * k;
          continue;
        }
        for (let c = 0; c < 4; c++) { this.col[dj + c] = s.col[sj + c]; this.nrm[dj + c] = s.nrm[sj + c]; this.emi[dj + c] = s.emi[sj + c]; }
        this.z[di] = s.z[si] + dz;
        this.flag[di] = s.flag[si] | flagOr;
      }
    }
  }
  // A 1 px outline around the shape, in a dark, hue-tinted shade of the colour it borders (16-bit
  // selective outline). Only fills transparent pixels; `skipBottom` leaves the base open so objects
  // sit on the ground.
  outline(dark = 0.45, skipBottom = false) {
    const { w, h, col } = this;
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (col[(y * w + x) * 4 + 3]) continue;
      let best = -1;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        if (skipBottom && dy === -1) continue; // pixel below the shape's bottom edge
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const k = yy * w + xx;
        if (col[k * 4 + 3] === 255 && !(this.flag[k] & F_GROUND)) { best = k; break; }
      }
      if (best >= 0) add.push(y * w + x, best);
    }
    for (let i = 0; i < add.length; i += 2) {
      const d = add[i], s = add[i + 1], dj = d * 4, sj = s * 4;
      const r = col[sj], g = col[sj + 1], b = col[sj + 2];
      // darker and shifted toward violet-blue
      col[dj] = r * dark * 0.85 + 6; col[dj + 1] = g * dark * 0.8 + 4; col[dj + 2] = b * dark * 0.95 + 18; col[dj + 3] = 255;
      for (let c = 0; c < 4; c++) this.nrm[dj + c] = this.nrm[sj + c];
      this.z[d] = this.z[s]; this.flag[d] = this.flag[s] & ~F_GROUND;
    }
  }
  // Normals for hand-drawn (2D) sprites from their silhouette: a height field grown from the edges
  // (chamfer distance, softened), tilted toward `base` (the way the sprite faces as a whole).
  autoNormals(base = [0, 0.55, 0.835], depth = 4, onlyUnset = true, mask = null) {
    const { w, h } = this;
    const INF = 1e9, d = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) d[i] = this.col[i * 4 + 3] && (!mask || mask[i]) ? INF : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!d[i]) continue; let m = d[i]; if (x) m = Math.min(m, d[i - 1] + 1); if (y) m = Math.min(m, d[i - w] + 1); if (x && y) m = Math.min(m, d[i - w - 1] + 1.4); if (y && x < w - 1) m = Math.min(m, d[i - w + 1] + 1.4); d[i] = m; }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!d[i]) continue; let m = d[i]; if (x < w - 1) m = Math.min(m, d[i + 1] + 1); if (y < h - 1) m = Math.min(m, d[i + w] + 1); if (x < w - 1 && y < h - 1) m = Math.min(m, d[i + w + 1] + 1.4); if (y < h - 1 && x) m = Math.min(m, d[i + w - 1] + 1.4); d[i] = m; }
    const hf = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : Math.sqrt(Math.min(d[y * w + x], depth) / depth);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, j = i * 4;
      if (!this.col[j + 3] || (mask && !mask[i])) continue;
      if (onlyUnset && this.nrm[j + 3]) continue;
      const gx = hf(x + 1, y) - hf(x - 1, y), gy = hf(x, y + 1) - hf(x, y - 1);
      let nx = base[0] - gx * 1.6, ny = base[1], nz = base[2] + gy * 1.6;
      // the bottom of a rounded shape faces down-and-forward
      const l = Math.hypot(nx, ny, nz) || 1;
      this.nrm[j] = (nx / l * 0.5 + 0.5) * 255; this.nrm[j + 1] = (ny / l * 0.5 + 0.5) * 255; this.nrm[j + 2] = (nz / l * 0.5 + 0.5) * 255; this.nrm[j + 3] = 255;
    }
  }
  // draw the albedo onto a 2D canvas (for previews)
  toCanvas(layer = 'col', scale = 1) {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const g = c.getContext('2d');
    const id = g.createImageData(this.w, this.h);
    if (layer === 'col' || layer === 'nrm' || layer === 'emi') id.data.set(this[layer]);
    else if (layer === 'z') for (let i = 0; i < this.w * this.h; i++) { const v = Math.min(255, this.z[i]); id.data[i * 4] = v; id.data[i * 4 + 1] = v; id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = this.col[i * 4 + 3]; }
    if (layer === 'emi') for (let i = 0; i < this.w * this.h; i++) id.data[i * 4 + 3] = 255;
    g.putImageData(id, 0, 0);
    if (scale === 1) return c;
    const s = document.createElement('canvas'); s.width = this.w * scale; s.height = this.h * scale;
    const sg = s.getContext('2d'); sg.imageSmoothingEnabled = false; sg.drawImage(c, 0, 0, s.width, s.height);
    return s;
  }
}

// ---- small helpers used by every generator ---------------------------------------------------------
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function hash(x, y, s = 0) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5 + 1 / 32;
// pick a ramp step from a 0..1 shade with ordered dithering (the 16-bit way to blend two steps)
export function step(R, t, x, y, dither = 1) { const v = t * (R.length - 1) + bayer(x, y) * dither; return R[Math.max(0, Math.min(R.length - 1, Math.round(v)))]; }
export function vnoise(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
export const N_UP = [0, 0, 1], N_SOUTH = [0, 1, 0], N_WEST = [-1, 0, 0], N_EAST = [1, 0, 0];
export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

// ---- GPU packing for the game renderer (client/art2/game/engine.js). Worker-safe. ----------------
// A G-buffer texel becomes three RGBA8 texels (12 bytes instead of 15):
//   P0 [albedo r, g, b, coverage]
//   P1 [z low byte, z high byte, flags, octahedral normal x]      <- height + flags in one fetch
//   P2 [emissive r, g, b premultiplied by (strength/255)^(1/2.2), octahedral normal y]
// Octahedral normals are stored as 0..254 so the up normal (0, 0, 1) is exactly (127, 127); a texel
// whose normal was never set (nrm alpha 0) gets the up normal, as the Lighter assumes.
export const OCT_MID = 127;
const EMI_PRE = new Float32Array(256);
for (let a = 0; a < 256; a++) EMI_PRE[a] = Math.pow(a / 255, 1 / 2.2);
// unit normal -> [x, y] in 0..254 (written to out[o], out[o + 1])
export function octEncode(nx, ny, nz, out = [0, 0], o = 0) {
  const s = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
  if (s < 1e-6) { out[o] = OCT_MID; out[o + 1] = OCT_MID; return out; }
  let x = nx / s, y = ny / s;
  if (nz < 0) { const fx = (1 - Math.abs(y)) * (x >= 0 ? 1 : -1); y = (1 - Math.abs(x)) * (y >= 0 ? 1 : -1); x = fx; }
  out[o] = Math.round((x + 1) * 127); out[o + 1] = Math.round((y + 1) * 127);
  return out;
}
// g: a GBuf or any {w, h, col, nrm, z, emi, flag}. The planes may be passed in (each at least w*h*4
// bytes, e.g. reused scratch buffers) and are returned as { w, h, ax, ay, p0, p1, p2 }.
export function packGBuf(g, p0 = null, p1 = null, p2 = null) {
  const n = g.w * g.h, n4 = n * 4;
  p0 = p0 ? p0.subarray(0, n4) : new Uint8Array(n4); p1 = p1 ? p1.subarray(0, n4) : new Uint8Array(n4); p2 = p2 ? p2.subarray(0, n4) : new Uint8Array(n4);
  const { col, nrm, z, emi, flag } = g, oe = [OCT_MID, OCT_MID];
  p0.set(col.length === n4 ? col : col.subarray(0, n4));
  let lr = -1, lg = -1, lb = -1;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const zz = z[i];
    p1[j] = zz & 255; p1[j + 1] = zz >> 8; p1[j + 2] = flag[i];
    if (nrm[j + 3] < 128) { p1[j + 3] = OCT_MID; p2[j + 3] = OCT_MID; }
    else {
      const r = nrm[j], gg = nrm[j + 1], b = nrm[j + 2];
      if (r !== lr || gg !== lg || b !== lb) { lr = r; lg = gg; lb = b; octEncode(r / 127.5 - 1, gg / 127.5 - 1, b / 127.5 - 1, oe); }
      p1[j + 3] = oe[0]; p2[j + 3] = oe[1];
    }
    const ea = emi[j + 3];
    if (ea) { const k = EMI_PRE[ea]; p2[j] = emi[j] * k + 0.5; p2[j + 1] = emi[j + 1] * k + 0.5; p2[j + 2] = emi[j + 2] * k + 0.5; }
    else { p2[j] = 0; p2[j + 1] = 0; p2[j + 2] = 0; }
  }
  return { w: g.w, h: g.h, ax: g.ax ?? 0, ay: g.ay ?? 0, p0, p1, p2 };
}

// ---- the pixel-art grid (docs/art-v2/SPEC.md "Scale") -------------------------------------------------------
// The live renderer draws every texture at 1 art pixel = ART_PX world px (the 16-bit look: chunky pixels),
// while the lighting stays per world px (smooth light over them). The generators paint at 1 texel per world
// px; downsample2 turns packed planes into art pixels a 2 x 2 block at a time, and every map of an art pixel
// comes from one real texel (height, normal, flags and glow stay consistent):
//   - glow first: a block where some texels glow and some don't takes its brightest glowing texel (small lamps
//     and lit windows survive);
//   - an edge - the block's colour range stands out from its neighbours' (an outline, a kerb line, a window
//     frame, a lane line) - keeps the texel that differs most from its 4 x 4 surroundings, dark or light (ties
//     go to the darker), so one-pixel lines and outlines survive at full strength;
//   - texture and flat colour take the block's average colour (fine noise calms down), with the other maps of
//     its most typical texel;
//   - sprites: a block is drawn when at least 2 of its 4 texels are; a sprite gets a 1 px margin first when
//     its anchor is odd, so the anchor lands on an art pixel corner.
// pk: {w, h, ax, ay, p0, p1?, p2?} (packGBuf planes; p0 alone for an albedo-only image). opts.opaque: every
// texel counts as covered (p0 alpha is a code, not coverage); opts.run: an edge texel needs this many like it in
// the 4 x 4 window (CHUNK_RUN for chunks: lines yes, flecks of texture no; sprites 0). Returns {w, h, ax, ay, p0,
// p1, p2, ap: ART_PX, pick} - pick: the source texel of each art pixel (-1: empty).
export const ART_PX = 2, CHUNK_RUN = 4;
const EDGE_K = 1.5, EDGE_C = 12, GLOW_MIN = 24;
export function downsample2(pk, opts = {}) {
  const W = pk.w | 0, H = pk.h | 0, ax0 = Math.round(pk.ax || 0), ay0 = Math.round(pk.ay || 0);
  const mx = ax0 & 1, my = ay0 & 1;                       // the margin that makes the anchor even
  const w = (W + mx + 1) >> 1, h = (H + my + 1) >> 1, n = w * h;
  const A = pk.p0, B = pk.p1 || null, C = pk.p2 || null, opaque = !!opts.opaque, run = opts.run | 0;
  const p0 = new Uint8Array(n * 4), p1 = B ? new Uint8Array(n * 4) : null, p2 = C ? new Uint8Array(n * 4) : null;
  const pick = new Int32Array(n).fill(-1), R = new Uint8Array(n), T = new Int32Array(4), NB = new Uint8Array(8), dbg = opts.debug ? new Uint8Array(n) : null;
  // pass 1: each block's covered texels and colour range (L1 / 3 over r, g, b: hue edges count, not only brightness)
  const cnt = new Uint8Array(n), tex = new Int32Array(n * 4);
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const o = by * w + bx;
    let c = 0;
    for (let dy = 0; dy < 2; dy++) {
      const y = 2 * by - my + dy;
      if (y < 0 || y >= H) continue;
      for (let dx = 0; dx < 2; dx++) {
        const x = 2 * bx - mx + dx;
        if (x < 0 || x >= W) continue;
        const i = y * W + x;
        if (opaque || A[i * 4 + 3] >= 128) tex[o * 4 + c++] = i;
      }
    }
    cnt[o] = c;
    let r = 0;
    for (let a = 0; a < c; a++) for (let b = a + 1; b < c; b++) {
      const ia = tex[o * 4 + a] * 4, ib = tex[o * 4 + b] * 4;
      const d = (Math.abs(A[ia] - A[ib]) + Math.abs(A[ia + 1] - A[ib + 1]) + Math.abs(A[ia + 2] - A[ib + 2])) / 3;
      if (d > r) r = d;
    }
    R[o] = r;
  }
  // pass 2: pick
  for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
    const o = by * w + bx, c = cnt[o];
    if (c < (opaque ? 1 : 2)) continue;
    for (let k = 0; k < c; k++) T[k] = tex[o * 4 + k];
    let best = -1, avg = false, ar = 0, ag = 0, ab = 0;
    // glow first
    if (C) {
      let ne = 0, be = -1;
      for (let k = 0; k < c; k++) { const j = T[k] * 4, e = C[j] + C[j + 1] + C[j + 2]; if (e > GLOW_MIN) { ne++; if (e > be) { be = e; best = T[k]; } } }
      if (ne === c) best = -1;                             // all glowing: an ordinary block of glow
      else if (dbg && best >= 0) dbg[o] = 2;
    }
    if (best < 0) {
      // the neighbours' typical range (texture), against which an edge stands out: a low one of the eight (the
      // third lowest), so the blocks a line runs on through don't hide it
      let sn = 0;
      for (let yy = by - 1; yy <= by + 1; yy++) {
        if (yy < 0 || yy >= h) continue;
        for (let xx = bx - 1; xx <= bx + 1; xx++) { if (xx < 0 || xx >= w || (xx === bx && yy === by)) continue; NB[sn++] = R[yy * w + xx]; }
      }
      let rn = 0;
      if (sn) {
        const kth = Math.max(0, ((sn * 3) >> 3) - 1);   // (8 neighbours: the 3rd lowest)
        for (let a = 1; a < sn; a++) { const v = NB[a]; let b = a - 1; while (b >= 0 && NB[b] > v) { NB[b + 1] = NB[b]; b--; } NB[b + 1] = v; }
        rn = NB[kth];
      }
      if (c > 1 && R[o] > EDGE_K * rn + EDGE_C) {
        // an edge: the texel that differs most from the 4 x 4 window round the block (ties: the darker)
        let mr = 0, mg = 0, mb = 0, m = 0;
        for (let y = 2 * by - my - 1; y <= 2 * by - my + 2; y++) {
          if (y < 0 || y >= H) continue;
          for (let x = 2 * bx - mx - 1; x <= 2 * bx - mx + 2; x++) {
            if (x < 0 || x >= W) continue;
            const j = (y * W + x) * 4;
            if (!opaque && A[j + 3] < 128) continue;
            mr += A[j]; mg += A[j + 1]; mb += A[j + 2]; m++;
          }
        }
        mr /= m; mg /= m; mb /= m;
        let bs = -1e9, bd = 0;
        for (let k = 0; k < c; k++) {
          const j = T[k] * 4, dm = (Math.abs(A[j] - mr) + Math.abs(A[j + 1] - mg) + Math.abs(A[j + 2] - mb)) / 3, s = dm - (A[j] * 0.3 + A[j + 1] * 0.59 + A[j + 2] * 0.11) * 0.02;
          if (s > bs) { bs = s; best = T[k]; bd = dm; }
        }
        // a big painted surface (a chunk: opts.run) also asks for enough like it in the 4 x 4 window - a line or
        // an outline running through - or it is a fleck of texture (a blade of grass, a flower, a pebble) that
        // would come out four times its size: the block is texture after all. (Sprites keep their one-pixel
        // details: an eye, a button.)
        if (run > 1) {
          const j0 = best * 4;
          let sim = 0;
          for (let y = 2 * by - my - 1; y <= 2 * by - my + 2; y++) {
            if (y < 0 || y >= H) continue;
            for (let x = 2 * bx - mx - 1; x <= 2 * bx - mx + 2; x++) {
              if (x < 0 || x >= W) continue;
              const j = (y * W + x) * 4;
              if (!opaque && A[j + 3] < 128) continue;
              // (on the feature's side: nearer the picked texel than the surroundings - worn or dithered paint counts)
              if (Math.abs(A[j] - A[j0]) + Math.abs(A[j + 1] - A[j0 + 1]) + Math.abs(A[j + 2] - A[j0 + 2]) < Math.abs(A[j] - mr) + Math.abs(A[j + 1] - mg) + Math.abs(A[j + 2] - mb)) sim++;
            }
          }
          if (sim < Math.max(2, Math.ceil(run * m / 16))) best = -1;   // (fewer at a border: the window is cut short)
        }
        if (dbg) dbg[o] = best >= 0 ? 1 : 3;
      }
      if (best < 0) {
        // texture or flat colour: the average, with the most typical texel's other maps
        for (let k = 0; k < c; k++) { const j = T[k] * 4; ar += A[j]; ag += A[j + 1]; ab += A[j + 2]; }
        ar /= c; ag /= c; ab /= c; avg = true;
        let bd = 1e9;
        for (let k = 0; k < c; k++) { const j = T[k] * 4, d = Math.abs(A[j] - ar) + Math.abs(A[j + 1] - ag) + Math.abs(A[j + 2] - ab); if (d < bd) { bd = d; best = T[k]; } }
      }
    }
    pick[o] = best;
    const s = best * 4, d = o * 4;
    if (avg) { p0[d] = ar + 0.5; p0[d + 1] = ag + 0.5; p0[d + 2] = ab + 0.5; } else { p0[d] = A[s]; p0[d + 1] = A[s + 1]; p0[d + 2] = A[s + 2]; }
    p0[d + 3] = A[s + 3];
    if (p1) { p1[d] = B[s]; p1[d + 1] = B[s + 1]; p1[d + 2] = B[s + 2]; p1[d + 3] = B[s + 3]; }
    if (p2) { p2[d] = C[s]; p2[d + 1] = C[s + 1]; p2[d + 2] = C[s + 2]; p2[d + 3] = C[s + 3]; }
  }
  // empty art pixels: no albedo, the up normal (as packGBuf leaves them)
  if (p1) for (let o = 0; o < n; o++) if (pick[o] < 0) { p1[o * 4 + 3] = OCT_MID; p2[o * 4 + 3] = OCT_MID; }
  return { w, h, ax: (ax0 + mx) >> 1, ay: (ay0 + my) >> 1, p0, p1, p2, ap: ART_PX, pick, dbg };
}
// a chunk's "under" layer (RGBA8: rgb the ground before its buildings, alpha the local number of the building on
// top) at art resolution: its own colours by the same rule, the building number of the texel the chunk's art
// pixel came from (pick: downsample2's)
export function downsampleUnder(under, W, H, pick) {
  const d = downsample2({ w: W, h: H, ax: 0, ay: 0, p0: under }, { opaque: true, run: CHUNK_RUN }), out = d.p0;
  for (let o = 0; o < pick.length; o++) out[o * 4 + 3] = pick[o] >= 0 ? under[pick[o] * 4 + 3] : 0;
  return out;
}
