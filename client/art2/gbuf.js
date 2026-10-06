// Art v2 core: a "G-buffer" raster. Every v2 sprite, and the scene layers the renderer lights, is four
// maps of the same size:
//   col  albedo RGBA (alpha = coverage)
//   nrm  world normal, RGB = n * 0.5 + 0.5 (X east, Y south, Z up), A = 255 where set
//   z    height above the ground in world px (Uint16) - what cast shadows and reflections use
//   emi  emissive RGB + strength in A (lamps, lit windows, neon, headlights)
//   flag bits: 1 ground, 2 water, 4 casts no shadow, 8 wet-able, 16 character, 32 foliage
// Projection (docs/art-v2/SPEC.md): screen x = X, screen y = Y - Z.

export const F_GROUND = 1, F_WATER = 2, F_NOCAST = 4, F_WET = 8, F_CHAR = 16, F_LEAF = 32, F_GLASS = 64, F_AIR = 128; // F_AIR: up in the air (birds): no mirror image in wet ground or water

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
