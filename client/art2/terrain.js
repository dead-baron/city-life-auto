// Art v2 terrain: raised ground for the rocky biomes (canyons, mountains, sea cliffs, caves), drawn as a
// height field in the game projection (screen x = X, screen y = Y - Z). Every world pixel has a height;
// rows are painted from north to south, each one drawing its top surface at Y - h and, where the next row
// south is lower, the cliff face that drops to it (the faces we can see all look south-ish). Every pixel
// gets its true height in z, so the Lighter's cast shadows work and props interleave correctly with the
// rows (finishTerrain sorts the scene's sprites in between them).
//
//   const T = new Terrain(w, h, { seed, below })     below: extra rows south of the screen (they still show)
//   T.plateau(shape, { style, h | tiers: [[inset, h]...], top, rim, jag, block, veg, hang, moss, snow, dome })
//   T.dome(cx, cy, rx, ry, h, opt)   a boulder / knoll        T.carve(shape, { h, top })   cut down to h
//   T.road(path, width, heights, opt)  a graded track (height along the path)     T.arch(path, width, h, thick, opt)
//   T.build()  ->  T.heightAt(x, y);   scree(G, T)  pebbles at cliff feet;   finishTerrain(scene, T) -> { G, lights }
//   shapes: { poly: [[x,y]..] } | { blob: { cx, cy, rx, ry, seed, wob } } | { circle: [cx, cy, r] } |
//           { rect: [x, y, w, h, r] } | { path: [[x,y]..], width }
//   styles: 'sandstone' (red strata, stepped blocky ledges), 'granite' (grey jointed blocks, lichen),
//           'basalt' (dark columns, barnacles), 'cave' (lumpy dark walls, stalactite fringes, black beyond)
//   tops:   'rock' (the style's own top) | 'keep' (lift whatever ground the scene painted there) | 'snow' |
//           'scree' | any ground.js kind;  rim: px of rock lip kept round the edge of a non-rock top
//   veg:    { kind: 'grass'|'shrub'|'flowers'|'dry', density, band, inner }   tufts on ledges and tops
//   hang:   { kind: 'moss'|'vine'|'kelp', amount }   growth hanging down the faces from their lips
// Sprites: boulder, outcrop, rockSprite, stalagmite, crystals (emissive), seaStack.
import { GBuf, F_GROUND, F_WATER, F_WET, F_LEAF, F_NOCAST, hash, vnoise, bayer } from './gbuf.js';
import { ramp } from './palette.js';
import { distSq } from './scene.js';
import { groundPixel } from './ground.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pickR = (R, t, x, y, d = 0.7) => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1) + bayer(x, y) * d)))];
const nz3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const OUTC = (c) => [c[0] * 0.42 * 0.85 + 6, c[1] * 0.42 * 0.8 + 4, c[2] * 0.42 * 0.95 + 18];

// ---- rock styles ---------------------------------------------------------------------------------------
const RO = (c, o = {}) => ramp(c, 7, 3, { dark: 0.64, light: 0.48, shift: 0.24, ...o });
export const ROCK = {
  sandstone: { id: 0, face: [RO('#b05238'), RO('#923c34', { dark: 0.62 }), RO('#c06c46'), RO('#a04a3a')], top: RO('#a45a40', { light: 0.36 }), jag: 9, block: 13, blocky: 0.75, fine: 1.5 },
  granite: { id: 1, face: [RO('#a39b92', { shift: 0.2 }), RO('#8f8a86', { shift: 0.2 }), RO('#b0a796', { shift: 0.2 })], top: RO('#aca598', { shift: 0.2 }), jag: 10, block: 18, blocky: 0.45, fine: 1.5 },
  basalt: { id: 2, face: [RO('#5e5248', { shift: 0.28 }), RO('#4e4744', { shift: 0.28 }), RO('#6a5c4c', { shift: 0.28 })], top: RO('#5c5046', { shift: 0.28 }), jag: 6, block: 9, blocky: 0.5, fine: 1.2 },
  cave: { id: 3, face: [RO('#786a74', { dark: 0.68 }), RO('#665a68', { dark: 0.68 }), RO('#847466', { dark: 0.68 })], top: RO('#6e6270', { dark: 0.7 }), jag: 12, block: 11, blocky: 0.25, fine: 2 },
};
const STYLE_LIST = ['sandstone', 'granite', 'basalt', 'cave'];
const STAL = RO('#ab9a8a', { light: 0.42 }), LICHEN = RO('#a8a248'), LICHEN2 = RO('#c8843a'), MOSS = RO('#5e8a32', { shift: 0.34 }), KELP = RO('#9a8e2c', { shift: 0.3 }), VINE = RO('#3e6e34', { shift: 0.3 });
const BARN = RO('#d4cec0', { dark: 0.5 }), MUSSEL = RO('#2e3040'), SNOW = ramp('#e8eef8', 6, 4, { dark: 0.38, light: 0.6, shift: 0.42 });
const LEAF = RO('#6a9230', { shift: 0.38 }), SHRUB = RO('#4e7a30', { shift: 0.36 }), DRY = RO('#a89a4a', { shift: 0.28 }), SAGEV = RO('#7e8a5a', { shift: 0.3 });
const VOID = [14, 12, 18];
const FLOWERS = [[150, 120, 220], [232, 196, 64], [240, 236, 228], [226, 110, 150]];

// jittered-grid cells (Worley): nearest and second-nearest distances, the nearest centre and its id
const CL = { d1: 0, d2: 0, cx: 0, cy: 0, id: 0 };
function cell(x, y, s, seed) {
  const gx = Math.floor(x / s), gy = Math.floor(y / s);
  let d1 = 1e9, d2 = 1e9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const X = gx + i, Y = gy + j, px = (X + 0.15 + hash(X, Y, seed) * 0.7) * s, py = (Y + 0.15 + hash(X, Y, seed + 1) * 0.7) * s;
    const d = (x - px) ** 2 + (y - py) ** 2;
    if (d < d1) { d2 = d1; d1 = d; CL.cx = px; CL.cy = py; CL.id = hash(X, Y, seed + 2); } else if (d < d2) d2 = d;
  }
  CL.d1 = Math.sqrt(d1); CL.d2 = Math.sqrt(d2);
  return CL;
}
function segD2(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0; t = clamp(t);
  return [(px - a[0] - t * dx) ** 2 + (py - a[1] - t * dy) ** 2, t];
}

// ---- the height field ---------------------------------------------------------------------------------
export class Terrain {
  constructor(w, h, opt = {}) {
    this.w = w | 0; this.vis = h | 0; this.h = (h + (opt.below ?? 0)) | 0; this.seed = opt.seed ?? 1;
    const n = this.w * this.h;
    this.H = new Float32Array(n); this.U = new Uint16Array(n); this.O = new Uint8Array(n).fill(255);
    this.ops = [];
    // stratum boundaries (shared by every sandstone face, so ledges line up) and basalt column widths
    this.band = new Int16Array(1024); this.bandTop = new Int16Array(1024); this.bandBot = new Int16Array(1024);
    for (let z = 0, b = 0; z < 1024; b++) { const bh = 8 + Math.floor(hash(b, 3, this.seed + 17) * 8); for (let k = 0; k < bh && z + k < 1024; k++) { this.band[z + k] = b; this.bandBot[z + k] = z; this.bandTop[z + k] = z + bh - 1; } z += bh; }
    this.col0 = new Int16Array(this.w + 32); this.colW = new Uint8Array(this.w + 32);
    for (let x = 0, c = 0; x < this.w + 32; c++) { const cw = 6 + Math.floor(hash(c, 5, this.seed + 3) * 6); for (let k = 0; k < cw && x + k < this.w + 32; k++) { this.col0[x + k] = x; this.colW[x + k] = cw; } x += cw; }
  }
  _op(o) {
    const st = ROCK[o.style || 'granite'];
    const op = { style: o.style || 'granite', st, top: o.top || 'rock', rim: o.rim ?? (o.top && o.top !== 'rock' ? 3 : 0), veg: o.veg || null, hang: o.hang || null, moss: o.moss || 0, snow: o.snow || 0, seed: o.seed ?? (this.ops.length * 37 + this.seed), keepKind: o.keepKind || 'dirt', barnacles: o.barnacles || 0, dome: !!o.dome, lit: o.lit ?? 0, wet: o.wet || 0, snowTop: o.snowTop || 0, fade: o.fade, blocky: o.blocky };
    this.ops.push(op);
    if (this.ops.length > 254) throw new Error('terrain: too many ops');
    return this.ops.length - 1;
  }
  // signed distance into a shape (+ inside), over its bounding box
  _shape(s, pad) {
    const W = this.w, Hh = this.h;
    let bb, f;
    if (s.poly) {
      const P = s.poly, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad)), y0 = Math.max(0, Math.floor(Math.min(...ys) - pad)), x1 = Math.min(W, Math.ceil(Math.max(...xs) + pad)), y1 = Math.min(Hh, Math.ceil(Math.max(...ys) + pad));
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), ins = new Uint8Array(bw * bh), out = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const px = x0 + x + 0.5, py = y0 + y + 0.5; let c = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > py) !== (P[j][1] > py) && px < (P[j][0] - P[i][0]) * (py - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
        ins[y * bw + x] = c ? 1 : 0; out[y * bw + x] = c ? 0 : 1;
      }
      const dIn = distSq(out, bw, bh), dOut = distSq(ins, bw, bh), g = new Float32Array(bw * bh);
      for (let i = 0; i < bw * bh; i++) g[i] = ins[i] ? Math.sqrt(dIn[i]) - 0.5 : 0.5 - Math.sqrt(dOut[i]);
      bb = [x0, y0, x1, y1]; f = (x, y) => g[(y - y0) * bw + (x - x0)];
    } else if (s.blob) {
      const b = s.blob, wo = b.wob ?? 0.25, sd = b.seed || 0, r = Math.min(b.rx, b.ry);
      bb = [b.cx - b.rx * (1 + wo) - pad, b.cy - b.ry * (1 + wo) - pad, b.cx + b.rx * (1 + wo) + pad, b.cy + b.ry * (1 + wo) + pad];
      f = (x, y) => { const a = Math.atan2(y + 0.5 - b.cy, x + 0.5 - b.cx), w = 1 + wo * (Math.sin(a * 3 + sd) * 0.6 + Math.sin(a * 5 + sd * 2.3) * 0.4); return (w - Math.hypot((x + 0.5 - b.cx) / b.rx, (y + 0.5 - b.cy) / b.ry)) * r; };
      s._r = r;
    } else if (s.circle) {
      const [cx, cy, r] = s.circle; bb = [cx - r - pad, cy - r - pad, cx + r + pad, cy + r + pad];
      f = (x, y) => r - Math.hypot(x + 0.5 - cx, y + 0.5 - cy); s._r = r;
    } else if (s.rect) {
      const [rx, ry, rw, rh, rr = 0] = s.rect; bb = [rx - pad, ry - pad, rx + rw + pad, ry + rh + pad];
      f = (x, y) => { const qx = Math.abs(x + 0.5 - rx - rw / 2) - rw / 2 + rr, qy = Math.abs(y + 0.5 - ry - rh / 2) - rh / 2 + rr; return rr - (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)); };
      s._r = Math.min(rw, rh) / 2;
    } else if (s.path) {
      const P = s.path, hw = s.width / 2, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
      bb = [Math.min(...xs) - hw - pad, Math.min(...ys) - hw - pad, Math.max(...xs) + hw + pad, Math.max(...ys) + hw + pad];
      f = (x, y) => { let m = 1e12; for (let i = 1; i < P.length; i++) m = Math.min(m, segD2(x + 0.5, y + 0.5, P[i - 1], P[i])[0]); return hw - Math.sqrt(m); };
      s._r = hw;
    }
    bb = [Math.max(0, Math.floor(bb[0])), Math.max(0, Math.floor(bb[1])), Math.min(W, Math.ceil(bb[2])), Math.min(Hh, Math.ceil(bb[3]))];
    return { bb, f };
  }
  _jag(x, y, k, amp, bw, seed, st) {
    if (!amp) return 0;
    const sm = vnoise(x, y, bw * 1.7, seed + k * 7) - 0.5, bl = hash(Math.floor((x + k * 5) / bw), Math.floor((y + k * 3) / bw), seed + k) - 0.5;
    return amp * (st.blocky * bl + (1 - st.blocky) * sm * 1.5) + (hash(x >> 1, y >> 1, seed + k) - 0.5) * st.fine;
  }
  // a raised block of rock (or ground) - tiers step it up in ledges
  plateau(shape, o = {}) {
    const id = this._op(o), op = this.ops[id], st = op.st, amp = o.jag ?? st.jag, bw = o.block ?? st.block;
    const tiers = o.tiers || [[0, o.h ?? 40]], S = this._shape(shape, amp + 2), [x0, y0, x1, y1] = S.bb, w = this.w;
    const r = o.r ?? shape._r ?? 20;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d = S.f(x, y); if (d < -amp - 2) continue;
      let hh = 0;
      if (o.dome) {
        const dd = d + this._jag(x, y, 0, amp * 0.5, bw, op.seed, st);
        if (dd <= 0) continue;
        const t = clamp(dd / r), fac = (hash(Math.floor(x / (r * 0.45 + 2)), Math.floor(y / (r * 0.45 + 2)), op.seed + 9) - 0.5) * 0.22;
        hh = o.h * (Math.sqrt(1 - (1 - t) ** 2) * (1 + fac * t)) * (o.flat ? Math.min(1, 1.15 - (1 - t) * 0.15) : 1);
        if (o.flat) hh = Math.min(hh, o.h * o.flat);
      } else for (let k = 0; k < tiers.length; k++) if (d + this._jag(x, y, k, amp, bw, op.seed, st) >= tiers[k][0]) hh = tiers[k][1];
      if (hh < 1) continue;
      const i = y * w + x;
      if (o.replace || hh > this.H[i]) { this.H[i] = hh; this.O[i] = id; this.U[i] = 0; }
    }
    return this;
  }
  dome(cx, cy, rx, ry, h, o = {}) { return this.plateau({ blob: { cx, cy, rx, ry, seed: o.seed ?? (cx * 3 + cy), wob: o.wob ?? 0.18 } }, { jag: 2, ...o, h, dome: true, r: Math.min(rx, ry) }); }
  // cut everything inside down to height h (a canyon floor, a cave chamber, a pool)
  carve(shape, o = {}) {
    const id = this._op(o), op = this.ops[id], amp = o.jag ?? op.st.jag * 0.6, S = this._shape(shape, amp + 2), [x0, y0, x1, y1] = S.bb, h = o.h ?? 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (S.f(x, y) + this._jag(x, y, 3, amp, o.block ?? op.st.block, op.seed, op.st) < 0) continue;
      const i = y * this.w + x;
      if (this.H[i] > h || o.force) { this.H[i] = h; this.O[i] = id; this.U[i] = 0; }
    }
    return this;
  }
  // a graded road or track: the height runs along the path through `heights` (one per point)
  road(path, width, heights, o = {}) {
    const id = this._op({ top: 'keep', rim: 0, ...o }), S = this._shape({ path, width }, 1), [x0, y0, x1, y1] = S.bb, hw = width / 2;
    const segL = []; let tot = 0; for (let i = 1; i < path.length; i++) { segL.push(tot); tot += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let best = 1e12, hh = 0;
      for (let i = 1; i < path.length; i++) { const [d2, t] = segD2(x + 0.5, y + 0.5, path[i - 1], path[i]); if (d2 < best) { best = d2; hh = heights[i - 1] + (heights[i] - heights[i - 1]) * t; } }
      if (best > hw * hw) continue;
      const i = y * this.w + x;
      this.H[i] = hh; this.O[i] = id; this.U[i] = 0;
    }
    return this;
  }
  // a natural arch: a slab at height h along the path, open underneath (thick px deep at its crown)
  arch(path, width, h, thick, o = {}) {
    const id = this._op(o), S = this._shape({ path, width }, 2), [x0, y0, x1, y1] = S.bb, hw = width / 2;
    const L = []; let tot = 0; for (let i = 1; i < path.length; i++) { L.push(tot); tot += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      let best = 1e12, along = 0;
      for (let i = 1; i < path.length; i++) { const [d2, t] = segD2(x + 0.5, y + 0.5, path[i - 1], path[i]); if (d2 < best) { best = d2; along = L[i - 1] + t * Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); } }
      const j = (hash(x >> 2, y >> 2, 71) - 0.5) * 3;
      if (Math.sqrt(best) > hw + j) continue;
      const t = along / tot, i = y * this.w + x, under = Math.max(0, (h - thick) * Math.pow(Math.sin(Math.PI * clamp(t)), 0.55) - (hash(x >> 1, 9, 3) * 2));
      if (h >= this.H[i]) { this.H[i] = h + (hash(x >> 3, y >> 3, 5) - 0.5) * 3; this.O[i] = id; this.U[i] = under > 3 ? under : 0; }
    }
    return this;
  }
  build() {
    const { w, h } = this, n = w * h;
    this.Hi = new Int16Array(n);
    for (let i = 0; i < n; i++) this.Hi[i] = Math.max(0, Math.round(this.H[i]));
    const Hi = this.Hi, drop = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = Hi[i]; if (!v) continue;
      if ((x > 0 && v - Hi[i - 1] > 4) || (x < w - 1 && v - Hi[i + 1] > 4) || (y > 0 && v - Hi[i - w] > 4) || (y < h - 1 && v - Hi[i + w] > 4)) drop[i] = 1;
    }
    const d = distSq(drop, w, h); this.dE = new Float32Array(n);
    for (let i = 0; i < n; i++) this.dE[i] = Math.sqrt(d[i]);
    // a blurred copy for the faces' facing
    const t = new Float32Array(n), b = new Float32Array(n), R = 3;
    for (let y = 0; y < h; y++) { let s = 0; for (let x = -R; x <= R; x++) s += Hi[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * R + 1); s += Hi[y * w + Math.min(w - 1, x + R + 1)] - Hi[y * w + Math.max(0, x - R)]; } }
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -R; y <= R; y++) s += t[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { b[y * w + x] = s / (2 * R + 1); s += t[Math.min(h - 1, y + R + 1) * w + x] - t[Math.max(0, y - R) * w + x]; } }
    this.Hb = b;
    return this;
  }
  heightAt(x, y) { x = clamp(Math.round(x), 0, this.w - 1); y = clamp(Math.round(y), 0, this.h - 1); return this.Hi ? this.Hi[y * this.w + x] : Math.round(this.H[y * this.w + x]); }
  // the highest point in a small disc (to sit a wide prop on uneven rock)
  heightNear(x, y, r = 4) { let m = 0; for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) m = Math.max(m, this.heightAt(x + dx, y + dy)); return m; }
  styleAt(x, y) { const o = this.O[clamp(Math.round(y), 0, this.h - 1) * this.w + clamp(Math.round(x), 0, this.w - 1)]; return o === 255 ? null : this.ops[o].style; }

  // ---- painting ---------------------------------------------------------------------------------------
  // ground AO at the feet of cliffs, then a snapshot of the scene's ground for 'keep' tops
  prepare(G) {
    const { w, Hi } = this, rows = Math.min(G.h, this.h);
    for (let y = 1; y < rows; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, v = Hi[i];
      for (let k = 1; k <= 4; k++) { if (y - k < 0) break; if (Hi[i - k * w] - v > 8) { const j = (y * G.w + x) * 4, f = 0.58 + k * 0.09; G.col[j] *= f; G.col[j + 1] *= f; G.col[j + 2] *= f * 1.04; break; } }
    }
    this.snap = { col: G.col.slice(), nrm: G.nrm.slice(), emi: G.emi.slice(), flag: G.flag.slice(), w: G.w, h: G.h };
  }
  _faceN(i, x, y) {
    const { w, h, Hb } = this, xa = Math.max(0, x - 3), xb = Math.min(w - 1, x + 3), ya = Math.max(0, y - 3), yb = Math.min(h - 1, y + 3);
    let gx = Hb[y * w + xb] - Hb[y * w + xa], gy = Hb[yb * w + x] - Hb[ya * w + x];
    let ox = -gx, oy = -gy; const l = Math.hypot(ox, oy);
    if (l < 0.5) return [0, 1];
    ox /= l; oy /= l; if (oy < 0.3) { oy = 0.3; const k = Math.hypot(ox, oy); ox /= k; oy /= k; }
    return [ox, oy];
  }
  // one row of the field: faces, then tops, then the tufts that stand on them. oy shifts it down the
  // target (sprites), snap is the ground snapshot for 'keep' tops
  paintRow(G, Y, oy = 0) {
    const { w, Hi, U, O } = this, row = Y * w;
    if (Y < 0 || Y >= this.h) return;
    for (let X = 0; X < w && X < G.w; X++) {
      const i = row + X, h = Hi[i];
      if (h <= 0) continue;
      const sy = Y - h + oy;
      if (sy >= G.h) continue;
      const op = this.ops[O[i]] || this.ops[0];
      const hn = Y + 1 < this.h ? Hi[i + w] : 0;
      let lo = hn; if (U[i] && hn < h - 1) lo = Math.max(hn, U[i]);
      if (h - lo > 1) {
        const [ox, oyN] = this._faceN(i, X, Y);
        for (let z = h - 1; z >= lo; z--) {
          const s = Y - z + oy; if (s < 0) continue; if (s >= G.h) break;
          this._face(G, op, X, Y, s, z, h, lo, ox, oyN);
          if (this.mask) this.mask[s * G.w + X] = 1;
        }
      }
      if (sy >= 0) { this._top(G, op, X, Y, sy, i, h); if (this.mask) this.mask[sy * G.w + X] = 1; }
      // a one-pixel step down to the next row would leave a hole: repeat the top into it
      if (h - lo === 1 && sy + 1 >= 0 && sy + 1 < G.h) { const a = (sy * G.w + X), b = a + G.w; if (sy >= 0) { for (let c = 0; c < 4; c++) { G.col[b * 4 + c] = G.col[a * 4 + c]; G.nrm[b * 4 + c] = G.nrm[a * 4 + c]; G.emi[b * 4 + c] = G.emi[a * 4 + c]; } G.z[b] = h - 1; G.flag[b] = G.flag[a]; if (this.mask) this.mask[b] = 1; } }
    }
    for (let X = 0; X < w && X < G.w; X++) {
      const i = row + X, h = Hi[i];
      if (h <= 0 || O[i] === 255) continue;
      const op = this.ops[O[i]], v = op.veg;
      if (!v) continue;
      if (op.top === 'keep' && this.snap && Y < this.snap.h && (this.snap.flag[Y * this.snap.w + X] & F_WATER)) continue;
      const band = v.band ?? 3, e = this.dE[i];
      const p = e <= band ? v.density : (v.inner || 0);
      if (!p || hash(X, Y, op.seed + 77) > p) continue;
      if (e > band && op.top !== 'rock' && op.top !== 'keep' && op.top !== 'scree' && v.onlyRock) continue;
      tuft(G, X, Y - h + oy, h, v.kind || 'grass', hash(X, Y, op.seed + 78), v);
    }
  }
  _top(G, op, X, Y, sy, i, h) {
    const st = op.st, w = this.w, Hi = this.Hi, e = this.dE[i];
    let c, n = null, em = null, flag = F_GROUND | F_WET, k = op.top;
    // the rock lip round a non-rock top, ragged
    if (k !== 'rock' && op.rim && e < op.rim + (hash(X >> 1, Y >> 1, op.seed) - 0.5) * 3) k = 'rock';
    if (k === 'keep') {
      const sn = this.snap;
      if (sn && Y < sn.h && X < sn.w) {
        const j = Y * sn.w + X, j4 = j * 4;
        G.put(X, sy, [sn.col[j4], sn.col[j4 + 1], sn.col[j4 + 2]], null, h, sn.emi[j4 + 3] ? [sn.emi[j4], sn.emi[j4 + 1], sn.emi[j4 + 2], sn.emi[j4 + 3]] : null, sn.flag[j]);
        const q = (sy * G.w + X) * 4; for (let c2 = 0; c2 < 4; c2++) G.nrm[q + c2] = sn.nrm[j4 + c2];
        if (!G.nrm[q + 3]) { G.nrm[q] = 128; G.nrm[q + 1] = 128; G.nrm[q + 2] = 255; G.nrm[q + 3] = 255; }
        return;
      }
      k = op.keepKind;
    }
    let bx = 0, by = 0, lift = 0;
    if (k === 'rock' || k === 'scree' || k === 'snow') {
      const r = rockTop(st, op, k, X, Y, e);
      c = r.c; bx = r.nx; by = r.ny; em = r.e;
      if (r.dark !== undefined) c = [c[0] * r.dark + VOID[0] * (1 - r.dark), c[1] * r.dark + VOID[1] * (1 - r.dark), c[2] * r.dark + VOID[2] * (1 - r.dark)];
    } else {
      const p = groundPixel(k, X, Y, op.seed);
      if (!p) return;
      c = p.c; em = p.e || null; if (p.water) flag = F_GROUND | F_WATER;
      if (p.n) { bx = p.n[0]; by = p.n[1]; }
    }
    // gentle slopes and the bevelled rim (lit lip toward the light, shaded on the far side)
    const hc = (j) => (j < 0 || j >= Hi.length || Math.abs(Hi[j] - h) > 6 ? h : Hi[j]);
    let gx = (hc(X < w - 1 ? i + 1 : i) - hc(X > 0 ? i - 1 : i)) * 0.5, gy = (hc(i + w) - hc(i - w)) * 0.5;
    if (e < 3.5 && !(flag & F_WATER)) {
      const de = this.dE, ex = (X < w - 1 ? de[i + 1] : e) - (X > 0 ? de[i - 1] : e), ey = (i + w < de.length ? de[i + w] : e) - (i - w >= 0 ? de[i - w] : e), l = Math.hypot(ex, ey) || 1;
      const k2 = (3.5 - e) * 0.32; bx -= ex / l * k2; by -= ey / l * k2;
      if (e < 1.2) lift = 0.12;
    }
    n = nz3(-gx * 0.9 + bx, -gy * 0.9 + by, 1);
    if (lift) c = [Math.min(255, c[0] * (1 + lift) + 6), Math.min(255, c[1] * (1 + lift) + 5), Math.min(255, c[2] * (1 + lift) + 3)];
    G.put(X, sy, c, n, h, em, flag);
  }
  // a dark hue-tinted line wherever terrain stands in front of something much farther away (left, right
  // or above on screen): depth along the view is sy + 2z
  outlinePass(G, mask) {
    const { w, h, z, col } = G, add = [];
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      const me = y + 2 * z[i];
      for (const k of [i - w, i - 1, i + 1]) if (col[k * 4 + 3] && me - ((k / w | 0) + 2 * z[k]) > 9) { add.push(i); break; }
    }
    for (const i of add) { const j = i * 4, o = OUTC([col[j], col[j + 1], col[j + 2]]); col[j] = o[0]; col[j + 1] = o[1]; col[j + 2] = o[2]; }
  }
  _face(G, op, X, Y, s, z, h0, h1, ox, oy) {
    const r = rockFace(this, op, X, Y, z, h0, h1);
    let c = r.c;
    // hanging growth from the lip
    const hg = op.hang;
    if (hg && !r.noHang) {
      const v = h0 - z, cov = vnoise(X, Y * 2, hg.kind === 'kelp' ? 6 : 9, op.seed + 50);
      if (cov > 1 - (hg.amount ?? 0.4)) {
        const L = (hash(X >> 1, Y, op.seed + 51) * 0.6 + 0.4) * (h0 - h1) * (hg.kind === 'kelp' ? 0.85 : 0.45) * (0.4 + (cov - (1 - (hg.amount ?? 0.4))) * 3);
        if (v < L && hash(X, z, op.seed + 52) > 0.12) {
          const R = hg.kind === 'kelp' ? KELP : hg.kind === 'vine' ? VINE : MOSS, t = 0.6 - v / Math.max(1, L) * 0.35 + (hash(X, z >> 1, op.seed) - 0.5) * 0.35 + ((X + (z >> 2)) % 3 === 0 ? -0.15 : 0);
          G.put(X, s, pickR(R, clamp(t), X, s), nz3(ox * 0.6, oy * 0.6, 0.7), z, null, F_LEAF);
          return;
        }
      }
    }
    const tx = oy, ty = -ox;                                    // along the face, to the right
    const n = nz3(ox * 0.8 + tx * r.ft, oy * 0.8 + ty * r.ft, 0.5 + r.fu);
    G.put(X, s, c, n, z, r.e || null, r.flag ?? 0);
  }
}

// ---- top surfaces --------------------------------------------------------------------------------------
const TR = { c: null, nx: 0, ny: 0, e: null, dark: undefined };
function rockTop(st, op, kind, x, y, e) {
  const seed = op.seed, R = st.top, h = hash(x, y, seed + 4);
  TR.e = null; TR.dark = undefined; TR.nx = 0; TR.ny = 0;
  if (kind === 'snow') {
    const drift = Math.sin(x * 0.08 + y * 0.21 + vnoise(x, y, 30, seed) * 6), poke = vnoise(x, y, 16, seed + 3);
    if (poke > 0.74 && e > 2) return rockTop(st, op, 'rock', x, y, e);
    let t = 0.72 + drift * 0.08 + (vnoise(x, y, 7, seed + 5) - 0.5) * 0.18 - (poke > 0.66 ? 0.25 : 0);
    TR.nx = Math.cos(y * 0.21) * 0.1; TR.ny = drift * 0.12;
    TR.c = pickR(SNOW, clamp(t), x, y, 0.8);
    if (h > 0.993) TR.e = [255, 255, 255, 90];
    return TR;
  }
  if (kind === 'scree') {
    const C = cell(x, y * 1.2, 4.5, seed + 31), gap = C.d2 - C.d1 < 0.9;
    TR.nx = (x - C.cx) / 4.5 * 0.8; TR.ny = (y * 1.2 - C.cy) / 4.5 * 0.8;
    TR.c = pickR(st.face[Math.floor(C.id * st.face.length) % st.face.length], gap ? 0.12 : 0.42 + (C.id - 0.5) * 0.3 - TR.nx * 0.2 - TR.ny * 0.15, x, y, 0.4);
    return TR;
  }
  let t = 0.5;
  switch (st.id) {
    case 0: { // sandstone: flat slabs split by cracks, a little sand in the joints
      const C = cell(x, y * 1.2, 19, seed + 21), cd = C.d2 - C.d1, crack = cd < 1.1 && hash(Math.floor(C.id * 997), 3, seed) > 0.25;
      t = 0.5 + (C.id - 0.5) * 0.24 + (vnoise(x, y, 6, seed) - 0.5) * 0.16 + (h > 0.93 ? 0.12 : h < 0.05 ? -0.14 : 0) - (y * 1.2 - C.cy) / 19 * 0.12;
      if (crack) t = 0.24 + h * 0.08; else if (cd < 2.2) t += 0.1;
      TR.nx = (hash(Math.floor(C.id * 999), 1, seed) - 0.5) * 0.3; TR.ny = (hash(Math.floor(C.id * 999), 2, seed) - 0.5) * 0.3;
      if (vnoise(x, y, 9, seed + 7) > 0.74 && !crack) { TR.c = pickR(st.face[2], 0.55 + (h - 0.5) * 0.3, x, y); return TR; }
      break;
    }
    case 1: { // granite: rounded domes and slabs, lichen and specks
      const C = cell(x, y * 1.1, 20, seed + 23), crack = C.d2 - C.d1 < 1.4;
      TR.nx = (x - C.cx) / 20 * 0.7; TR.ny = (y * 1.1 - C.cy) / 20 * 0.7;
      t = 0.55 + (C.id - 0.5) * 0.18 - TR.nx * 0.18 - TR.ny * 0.12 + (h > 0.9 ? 0.18 : h < 0.07 ? -0.2 : 0);
      if (crack) t = 0.14;
      const li = vnoise(x, y, 5, seed + 9);
      if (!crack && li > 0.74) { TR.c = pickR(li > 0.86 ? LICHEN2 : LICHEN, 0.45 + (h - 0.5) * 0.4, x, y); return TR; }
      break;
    }
    case 2: { // basalt: lumpy dark rock, barnacles and mussels
      const C = cell(x, y * 1.2, 9, seed + 25), crack = C.d2 - C.d1 < 1.1;
      TR.nx = (x - C.cx) / 9 * 0.95; TR.ny = (y * 1.2 - C.cy) / 9 * 0.95;
      t = 0.5 + (C.id - 0.5) * 0.2 - TR.nx * 0.22 - TR.ny * 0.14 + (h > 0.92 ? 0.15 : 0);
      if (crack) t = 0.08;
      if (op.barnacles) {
        const bz = vnoise(x, y, 5, seed + 61);
        if (bz > 1 - op.barnacles * 0.6 && !crack) {
          const b = hash(x >> 1, y >> 1, seed + 62);
          if (b > 0.55) { TR.c = pickR(BARN, ((x & 1) + (y & 1)) ? 0.7 - (h > 0.6 ? 0.25 : 0) : 0.25, x, y, 0.3); return TR; }
          if (b < 0.12) { TR.c = pickR(MUSSEL, 0.4 + h * 0.3, x, y); return TR; }
        }
      }
      break;
    }
    case 3: { // cave: lumps fading into darkness away from the edge
      const sz = e < 24 ? 14 : 10, C = cell(x, y * 1.25, sz, seed + 27), crack = C.d2 - C.d1 < 1.6;
      const bx = (x - C.cx) / sz, by = (y * 1.25 - C.cy) / sz, bd = Math.min(1, Math.hypot(bx, by) * 1.4);
      TR.nx = bx * 1.3; TR.ny = by * 1.3;
      t = 0.5 + (C.id - 0.5) * 0.22 - bx * 0.45 - by * 0.35 - bd * bd * 0.18 + (h > 0.9 ? 0.1 : 0);
      if (crack) t = 0.06;
      TR.dark = clamp(1 - (e - 10) / (op.fade ?? 60)) ** 1.3;
      break;
    }
  }
  if (op.moss && st.id !== 3) {
    const m = vnoise(x, y, 8, seed + 41);
    if (m > 1 - op.moss) { TR.c = pickR(MOSS, 0.4 + (m - 1 + op.moss) * 1.4 + (h - 0.5) * 0.3, x, y); return TR; }
  }
  if (op.snowTop && st.id !== 3 && vnoise(x, y, 12, seed + 43) > 1 - op.snowTop) { TR.c = pickR(SNOW, 0.7 + (h - 0.5) * 0.2, x, y); return TR; }
  TR.c = pickR(R, clamp(t), x, y, 0.6);
  return TR;
}

// ---- cliff faces ---------------------------------------------------------------------------------------
const FR = { c: null, ft: 0, fu: 0, e: null, flag: 0, noHang: false };
function rockFace(T, op, X, Y, z, h0, h1) {
  const st = op.st, seed = op.seed, v = h0 - z, zb = z - h1, H = h0 - h1, hs = hash(X, z, seed + 2);
  FR.e = null; FR.flag = 0; FR.noHang = false; FR.ft = 0; FR.fu = 0;
  let t = 0.5, R = st.face[0];
  switch (st.id) {
    case 0: { // sandstone: strata of blocks, lit top edges, dark beds and joints
      const zc = Math.min(1023, z), b = T.band[zc], bt = T.bandTop[zc], bbm = T.bandBot[zc], vb = bt - z, bh = bt - bbm + 1;
      R = st.face[Math.floor(hash(b, 1, 77) * st.face.length)];
      const cw = 12 + Math.floor(hash(b, 0, 79) * 14), u = (X + hash(b, 2, 81) * cw + Y * 0.0) / cw, blk = Math.floor(u), lu = u - blk;
      const joint = lu * cw < 1 && hash(blk, b, 83) > 0.22;
      t = 0.52 + (hash(b, 5, 85) - 0.5) * 0.16 + (hash(blk, b, 87) - 0.5) * 0.14 + (0.5 - lu) * 0.2 + (vnoise(X, z * 1.5, 5, seed) - 0.5) * 0.16 + (hs > 0.94 ? 0.12 : hs < 0.05 ? -0.15 : 0);
      FR.ft = (lu - 0.5) * 1.1;
      if (vb < 1) { t += 0.3; FR.fu = 0.9; } else if (vb < 2) { t += 0.12; FR.fu = 0.3; }
      if (vb >= bh - 1) { t -= 0.3; FR.fu = -0.4; }
      if (joint) { t -= 0.32; FR.ft = 0; }
      if (vnoise(X * 0.6, z, 7, seed + 3) > 0.8) t -= 0.22;                 // eroded pockets
      if (vnoise(X, z * 0.08, 3, seed + 5) > 0.76) t -= 0.1;                // desert-varnish streaks
      if (op.snow && vb < 1 && hs < op.snow) { FR.c = pickR(SNOW, 0.7, X, z); FR.fu = 1; return FR; }
      break;
    }
    case 1: { // granite: tall jointed blocks, rounded, lichen on the upper parts
      const zc = Math.min(1023, z), bi = T.band[Math.min(1023, Math.floor(zc * 0.5))], bt = T.bandTop[Math.min(1023, Math.floor(zc * 0.5))] * 2 + 1, vb = bt - z;
      R = st.face[Math.floor(hash(bi, 1, 91) * st.face.length)];
      const cw = 16 + Math.floor(hash(bi, 0, 93) * 18), sl = (hash(bi, 3, 95) - 0.5) * 0.5, u = (X + hash(bi, 2, 97) * cw + vb * sl) / cw, blk = Math.floor(u), lu = u - blk;
      const joint = lu * cw < 1.2 && hash(blk, bi, 99) > 0.15;
      t = 0.54 + (hash(blk, bi, 101) - 0.5) * 0.18 + (0.5 - lu) * 0.3 + (vnoise(X, z, 4, seed) - 0.5) * 0.14 + (hs > 0.91 ? 0.2 : hs < 0.07 ? -0.22 : 0);
      FR.ft = (lu - 0.5) * 1.4;
      if (vb < 1.5) { t += 0.28; FR.fu = 0.8; }
      if (vb > 2 && T.band[Math.min(1023, Math.floor((z - 1) * 0.5))] !== bi) { t -= 0.28; FR.fu = -0.4; }
      if (joint) { t -= 0.36; FR.ft = 0; }
      if (vnoise(X, z * 0.12, 3, seed + 11) > 0.8) t -= 0.12;               // water streaks
      if (op.snow && vb < 2 && hash(blk, bi, 7) < op.snow) { FR.c = pickR(SNOW, 0.66 + hs * 0.2, X, z); FR.fu = 1; return FR; }
      const li = vnoise(X, z, 5, seed + 9);
      if (li > 0.76 && vb < 10 && !joint) { FR.c = pickR(li > 0.86 ? LICHEN2 : LICHEN, 0.4 + (0.5 - lu) * 0.4 + (hs - 0.5) * 0.3, X, z); return FR; }
      break;
    }
    case 2: { // basalt: blocky columns broken by cross joints, wet and barnacled near the bottom
      const xc = Math.max(0, X), c0 = T.col0[xc], cw = T.colW[xc], col = c0;
      const per = (op.blocky ? 7 : 9) + Math.floor(hash(col, 2, 105) * 12), off = Math.floor(hash(col, 3, 107) * per), seg = Math.floor((z + off) / per), lz = ((z + off) % per) / per;
      const merge = hash(col, seg, 119) < (op.blocky ?? 0.45), c1 = merge ? (T.col0[Math.max(0, c0 - 1)]) : c0, cw2 = merge ? cw + T.colW[Math.max(0, c0 - 1)] : cw, lu = (X - c1 + 0.5) / cw2;
      R = st.face[Math.floor(hash(c1, seg, 103) * st.face.length)];
      t = 0.5 + (hash(c1, seg, 109) - 0.5) * 0.22 + (0.5 - lu) * 0.3 + (0.5 - lz) * 0.1 + (vnoise(X, z, 4, seed) - 0.5) * 0.16 + (hs > 0.93 ? 0.15 : hs < 0.06 ? -0.15 : 0);
      FR.ft = (lu - 0.5) * 1.2;
      if ((X - c1) < 1 && hash(c1, seg, 121) > 0.2) { t = 0.1; FR.ft = 0; }
      if (lz * per < 1) { t -= 0.3; FR.fu = -0.3; } else if (lz * per < 2) { t += 0.2; FR.fu = 0.6; }
      if (v < 1.5) { t += 0.2; FR.fu = 0.8; }
      if (op.wet && zb < op.wet) {
        t -= 0.15 * (1 - zb / op.wet);
        if (op.barnacles && hash(X >> 1, z >> 1, seed + 8) > 0.6 && zb > 1) { FR.c = pickR(BARN, ((X + z) & 1) ? 0.62 : 0.22, X, z, 0.3); return FR; }
        if (zb < 3) { FR.c = pickR(MOSS, 0.2 + hs * 0.2, X, z); return FR; }
      }
      break;
    }
    case 3: { // cave: a lumpy lip, a fringe of stalactites over a dark recess, lumpy wall below
      const xc = Math.max(0, X), c0 = T.col0[xc], cw = T.colW[xc], cx = c0 + cw / 2 + (hash(c0, 7, 111) - 0.5) * 2;
      const lip = 3 + Math.floor(hash(X >> 2, Y >> 3, 113) * 3), sc = clamp(H / 70, 0.25, 1.2);
      const L = (6 + Math.pow(hash(c0, 8, 115), 1.8) * 40) * sc, hw = cw * 0.5 * (0.6 + hash(c0, 9, 117) * 0.5), fr = Math.max(14, 44 * sc);
      if (v < lip) { const C = cell(X, z * 1.4, 6, seed + 5); t = 0.5 + (C.id - 0.5) * 0.2 - (X - C.cx) / 6 * 0.2; FR.fu = 0.6; FR.ft = (X - C.cx) / 6 * 0.6; break; }
      const vv = v - lip;
      if (vv < L && H > 18) {
        const wv = hw * Math.pow(1 - vv / L, 0.8);
        if (Math.abs(X + 0.5 - cx) < wv + 0.3) {
          R = STAL; const a = (X + 0.5 - cx) / Math.max(0.8, wv);
          t = 0.58 - a * 0.28 + (vv % 5 === 0 ? -0.1 : 0) + (hs - 0.5) * 0.12 - vv / L * 0.12;
          FR.ft = a * 0.9; FR.fu = -0.1; FR.noHang = true;
          break;
        }
      }
      if (vv < fr && H > 18) { R = st.face[1]; t = 0.06 + (vv / fr) * 0.18 + (hs - 0.5) * 0.1; FR.fu = -0.3; FR.noHang = true; break; }
      const C = cell(X, z * 1.3, 9, seed + 29), crack = C.d2 - C.d1 < 1.5;
      R = st.face[Math.floor(C.id * 3) % 3];
      const dx = (X - C.cx) / 9, dz = (z * 1.3 - C.cy) / 9;
      t = 0.42 - dx * 0.3 + dz * 0.18 + (C.id - 0.5) * 0.2;
      FR.ft = dx * 1.1; FR.fu = dz * 0.9;
      if (crack) t = 0.06;
      break;
    }
  }
  if (zb < 10 && st.id !== 3) t -= (10 - zb) * 0.025;                       // contact darkening at the foot
  if (st.id === 3 && zb < 8) t -= (8 - zb) * 0.03;
  if (v < 2 && st.id !== 3) t += 0.1;
  FR.c = pickR(R, clamp(t), X, z, 0.55);
  return FR;
}

// ---- tufts on ledges -----------------------------------------------------------------------------------
function tuft(G, x, sy, h, kind, r, v) {
  const put = (px, py, c, up, n = [0, 0.3, 0.95]) => { if (!G.inside(px, py)) return; G.put(px, py, c, n, h + up, null, F_LEAF); };
  if (kind === 'shrub' || kind === 'sage' || kind === 'flowers' && r < 0.3) {
    const rad = 1 + Math.floor(r * (v.size ?? 3)), R = kind === 'shrub' ? SHRUB : kind === 'sage' ? (r > 0.5 ? SAGEV : DRY) : LEAF;
    for (let dy = -rad * 2; dy <= 1; dy++) for (let dx = -rad - 1; dx <= rad + 1; dx++) {
      const qx = dx / (rad + 0.5), qy = (dy + rad) / (rad + 0.5), d = qx * qx + qy * qy;
      if (d > 1 + (hash(x + dx, sy + dy, 5) - 0.5) * 0.5) continue;
      const t = 0.55 - qx * 0.25 - qy * 0.25 + (hash(x + dx, sy + dy, 7) > 0.8 ? 0.2 : 0) - (d > 0.75 ? 0.15 : 0);
      put(x + dx, sy + dy, pickR(R, clamp(t), x + dx, sy + dy), nz3(qx, qy * 0.6, 0.8), Math.max(0, -dy));
    }
    if (kind === 'flowers' || (v.bloom && r > 0.15)) put(x + (r > 0.5 ? 1 : -1), sy - rad, FLOWERS[Math.floor(r * 40) % FLOWERS.length], rad);
    return;
  }
  if (kind === 'kelp') {
    const n = 3 + Math.floor(r * 4);
    for (let b = 0; b < n; b++) { let bx = x + Math.round((hash(x, b, 21) - 0.5) * 6), by = sy - 1 + Math.round(hash(b, x, 23) * 2); const len = 4 + Math.floor(hash(b, sy, 25) * 7), dir = hash(sy, b, 27) > 0.5 ? 1 : -1; for (let k = 0; k < len; k++) { put(bx, by + k, pickR(KELP, clamp(0.75 - k / len * 0.45 + (b & 1) * 0.1), bx, by + k, 0.3), [dir * 0.2, 0.4, 0.85], 1); if (k % 3 === 2) bx += dir; } }
    return;
  }
  const R = kind === 'dry' ? DRY : LEAF, n = 3 + Math.floor(r * 4);
  for (let b = 0; b < n; b++) {
    const bx = x + Math.round((hash(x, b, 11) - 0.5) * 5), len = 2 + Math.floor(hash(b, sy, 13) * (v.size ?? 4)), lean = hash(x, b, 15) > 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) put(bx + (k > len / 2 ? lean : 0), sy - k, pickR(R, clamp(0.3 + k / len * 0.5 + (b & 1) * 0.12), bx, sy - k, 0.3), [lean * 0.3, 0.3, 0.9], k);
    if (kind === 'flowers' && b === 0) put(bx + lean, sy - len, FLOWERS[Math.floor(r * 97) % FLOWERS.length], len);
  }
}

// ---- pebbles at the foot of cliffs (paint into the scene ground before finishTerrain) --------------------
export function scree(G, T, opt = {}) {
  const reach = opt.reach ?? 14, dens = opt.density ?? 0.05, seed = opt.seed ?? 5, { w, Hi } = T, rows = Math.min(G.h, T.h);
  for (let y = 2; y < rows - 2; y++) for (let x = 2; x < w - 2; x++) {
    if (hash(x, y, seed) > dens) continue;
    const i = y * w + x, v = Hi[i];
    let k = 1; for (; k <= reach; k++) if (Hi[i - k * w] - v > 14 || y - k <= 0) break;
    if (k > reach || hash(x, y, seed + 1) > 1 - k / (reach + 2)) continue;
    const o = T.O[i - k * w], st = o === 255 ? ROCK.granite : T.ops[o].st, R = st.face[Math.floor(hash(x, y, seed + 2) * st.face.length)];
    const rx = 1 + Math.floor(hash(x, y, seed + 3) * (opt.size ?? 3)), ry = Math.max(1, rx - 1);
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      const d = (dx / (rx + 0.3)) ** 2 + (dy / (ry + 0.3)) ** 2; if (d > 1) continue;
      const X = x + dx, Y = y + dy; if (!G.inside(X, Y)) continue;
      G.put(X, Y, pickR(R, clamp(0.55 - dx / rx * 0.25 - dy / ry * 0.25 + (d > 0.7 && dy > 0 ? -0.25 : 0)), X, Y, 0.4), nz3(dx / rx * 0.6, dy / ry * 0.6, 1), d > 0.6 ? 0 : 1, null, F_GROUND | F_WET);
    }
  }
}

// ---- compose: the scene's sprites sorted in between the terrain rows ------------------------------------
export function finishTerrain(sc, T) {
  const G = sc.G, items = sc.items;
  if (!T.Hi) T.build();
  T.prepare(G);
  // with raised ground about, a sprite must be drawn after every terrain row under its footprint: sort
  // by the southernmost ground row any of its pixels stands over
  for (const it of items) {
    const s = it.spr; let m = -1e9;
    for (let y = s.h - 1; y >= 0; y--) for (let x = 0; x < s.w; x++) { const q = y * s.w + x; if (s.col[q * 4 + 3] && y - s.ay + s.z[q] > m) m = y - s.ay + s.z[q]; }
    it.tb = Math.max(it.base, it.y + Math.min(m, 60));
  }
  items.sort((a, b) => a.tb - b.tb);
  let k = 0;
  const mask = T.mask = new Uint8Array(G.w * G.h);
  const blit = (it) => {
    const s = it.spr, ox = Math.round(it.x - s.ax), oy = Math.round(it.y - s.ay - it.dz);
    G.blit(s, ox, oy, it.dz);
    for (let y = Math.max(0, -oy); y < Math.min(s.h, G.h - oy); y++) for (let x = Math.max(0, -ox); x < Math.min(s.w, G.w - ox); x++) if (s.col[(y * s.w + x) * 4 + 3] === 255) mask[(y + oy) * G.w + x + ox] = 0;
  };
  for (let Y = 0; Y < T.h; Y++) {
    while (k < items.length && items[k].tb < Y) blit(items[k++]);
    T.paintRow(G, Y);
  }
  while (k < items.length) blit(items[k++]);
  T.outlinePass(G, mask); T.mask = null;
  for (const w of sc.wires) {
    const n = Math.ceil(Math.hypot(w.x1 - w.x0, w.y1 - w.y0 - (w.z1 - w.z0)) * 1.5) + 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n, X = w.x0 + (w.x1 - w.x0) * t, Y = w.y0 + (w.y1 - w.y0) * t, Z = w.z0 + (w.z1 - w.z0) * t - w.sag * 4 * t * (1 - t);
      const sx = Math.round(X), sy = Math.round(Y - Z);
      if (!G.inside(sx, sy) || G.z[sy * G.w + sx] > Z + 2) continue;
      G.put(sx, sy, w.col, [0, 0.3, 0.95], Z, null, 0);
    }
  }
  const lights = sc.lights.filter((l) => l.k > 0.02).sort((a, b) => b.k * b.r - a.k * a.r).slice(0, 64);
  return { G, lights };
}
// put a sprite on the terrain at (x, y): raised to the ground height there
export function onTerrain(sc, T, spr, x, y, dz = 0, r = 0) { return sc.add(spr, x, y, (r ? T.heightNear(x, y, r) : T.heightAt(x, y)) + dz, y); }

// ---- rock sprites --------------------------------------------------------------------------------------
// fn(T) adds ops to a w x d field; the result is a sprite anchored at (ax, ay) on the ground
export function rockSprite(w, d, maxH, fn, ax = w / 2, ay = d / 2, seed = 1) {
  const T = new Terrain(w, d, { seed });
  fn(T); T.build();
  const oy = maxH + 2, G = new GBuf(w, d + oy + 1);
  T.mask = new Uint8Array(G.w * G.h);
  for (let Y = 0; Y < d; Y++) T.paintRow(G, Y, oy);
  T.outlinePass(G, T.mask); T.mask = null;
  G.ax = ax; G.ay = ay + oy;
  return G;
}
// a chunky boulder: a faceted dome in one of the rock styles
export function boulder(seed = 1, size = 24, style = 'granite', o = {}) {
  const w = Math.ceil(size * 1.4) + 6, d = Math.ceil(size) + 6, h = Math.round(size * (o.tall ?? 0.55));
  return rockSprite(w, d, h + 4, (T) => {
    T.dome(w / 2, d / 2, size * 0.62, size * 0.42, h, { style, seed, top: 'rock', moss: o.moss || 0, barnacles: o.barnacles || 0, snowTop: o.snow || 0, hang: o.hang, veg: o.veg, wob: 0.22 });
    if (o.cluster !== false && size > 16) T.dome(w / 2 + size * 0.38, d / 2 + size * 0.12, size * 0.3, size * 0.22, h * 0.55, { style, seed: seed + 5, top: 'rock', moss: o.moss || 0, barnacles: o.barnacles || 0 });
  }, w / 2, d / 2 + size * 0.2, seed);
}
// a stepped outcrop: a small plateau with ledges
export function outcrop(seed = 1, w = 60, d = 40, h = 40, style = 'granite', o = {}) {
  const W = w + 16, D = d + 16;
  return rockSprite(W, D, h + 6, (T) => {
    T.plateau({ blob: { cx: W / 2, cy: D / 2, rx: w / 2, ry: d / 2, seed, wob: 0.2 } }, { style, seed, tiers: o.tiers || [[0, h * 0.55], [Math.min(w, d) * 0.18, h * 0.8], [Math.min(w, d) * 0.32, h]], top: o.top || 'rock', veg: o.veg, hang: o.hang, moss: o.moss || 0, barnacles: o.barnacles || 0, wet: o.wet || 0, snowTop: o.snow || 0, jag: o.jag });
  }, W / 2, D / 2 + d * 0.3, seed);
}
// a sea stack / pinnacle: a tall narrow pillar with a few shoulders
export function seaStack(seed = 1, r = 26, h = 150, style = 'basalt', o = {}) {
  const W = Math.ceil(r * 3), D = Math.ceil(r * 2.4);
  return rockSprite(W, D, h + 8, (T) => {
    T.plateau({ blob: { cx: W / 2, cy: D / 2, rx: r * 1.25, ry: r * 0.95, seed, wob: 0.22 } }, { style, seed, tiers: [[0, h * 0.25], [r * 0.25, h * 0.6], [r * 0.5, h * 0.85], [r * 0.7, h]], top: 'rock', veg: o.veg, hang: o.hang, moss: o.moss || 0, wet: o.wet ?? 16, barnacles: o.barnacles ?? 0.6, jag: 5 });
  }, W / 2, D / 2 + r * 0.6, seed);
}

// a stalagmite (or a rock spire): a ringed cone, lit from the left
export function stalagmite(seed = 1, h = 40, r = 8, col = '#7a6c66') {
  const R = RO(col, { dark: 0.7 }), W = Math.ceil(r * 2 + 6), Hh = h + 6, G = new GBuf(W, Hh), foot = Hh - 3, cx = W / 2;
  G.ax = cx; G.ay = foot;
  const lean = (hash(seed, 1, 3) - 0.5) * 4;
  for (let y = foot - h; y <= foot + 1; y++) {
    const t = (foot - y) / h, rad = r * Math.pow(1 - t, 0.85) * (1 + Math.sin(t * 20 + seed) * 0.06) + (y > foot - 2 ? 1.5 : 0), ccx = cx + lean * t;
    for (let x = Math.floor(ccx - rad - 1); x <= ccx + rad + 1; x++) {
      const a = (x + 0.5 - ccx) / Math.max(0.6, rad); if (Math.abs(a) > 1) continue;
      const tt = 0.56 - a * 0.32 + ((foot - y) % 6 === 0 ? -0.12 : (foot - y) % 6 === 1 ? 0.08 : 0) + (hash(x, y, seed) - 0.5) * 0.12 + t * 0.08;
      G.put(x, y, pickR(R, clamp(tt), x, y, 0.5), nz3(a * 0.9, 0.5, 0.35 + t * 0.3), Math.max(1, foot - y));
    }
  }
  G.outline(0.42, true);
  for (let i = 0; i < G.z.length; i++) if (G.col[i * 4 + 3]) G.z[i] = Math.max(1, foot - Math.floor(i / G.w));
  return G;
}
// a cluster of glowing crystals (hexagonal prisms, emissive), col the glow colour
export function crystals(seed = 1, size = 30, col = '#5ac8ff', o = {}) {
  const R = ramp(col, 7, 4, { dark: 0.6, light: 0.7, shift: 0.15 }), W = Math.ceil(size * 1.6) + 8, Hh = Math.ceil(size * 1.3) + 8, G = new GBuf(W, Hh), foot = Hh - 4, cx = W / 2;
  G.ax = cx; G.ay = foot;
  const n = o.n ?? 5 + Math.floor(hash(seed, 1, 5) * 4), list = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (hash(seed, k, 7) - 0.5) * 1.7, len = size * (0.35 + hash(seed, k, 9) * 0.75) * (Math.abs(a + Math.PI / 2) < 0.3 ? 1.1 : 0.8), wd = 2.2 + hash(seed, k, 11) * size * 0.09;
    list.push({ a, len, wd, ox: (hash(seed, k, 13) - 0.5) * size * 0.5, depth: hash(seed, k, 15) });
  }
  list.sort((p, q) => p.depth - q.depth);
  // a rubble base
  for (let y = -3; y <= 1; y++) for (let x = -size * 0.45; x <= size * 0.45; x++) { const d = (x / (size * 0.45)) ** 2 + ((y + 1) / 2.5) ** 2; if (d <= 1) G.put(cx + x, foot + y, pickR(ROCK.cave.face[0], 0.35 - x / size * 0.3, x | 0, y), [0, 0.3, 0.95], 1); }
  for (const c of list) {
    const dx = Math.cos(c.a), dy = Math.sin(c.a), px = -dy, py = dx;
    for (let s = 0; s <= c.len; s += 0.5) {
      const tip = s > c.len - c.wd * 1.6 ? (c.len - s) / (c.wd * 1.6) : 1;
      for (let q = -c.wd; q <= c.wd; q += 0.5) {
        if (Math.abs(q) > c.wd * tip + 0.2) continue;
        const X = cx + c.ox + dx * s + px * q, Y = foot - 1 + dy * s + py * q, u = q / c.wd;
        const facet = u < -0.33 ? 0.82 : u < 0.33 ? 0.6 : 0.36, edge = Math.abs(Math.abs(u) - 0.33) < 0.12 ? 0.12 : 0;
        const t = clamp(facet + edge + (s / c.len) * 0.1 + (Math.abs(u) > 0.88 ? -0.2 : 0));
        G.put(X, Y, pickR(R, t, X | 0, Y | 0, 0.3), nz3(u * 0.8, 0.3, 0.6), Math.max(1, Math.round(-dy * s + 2)), [...R[5], 120 + t * 130], F_NOCAST);
      }
    }
  }
  G.outline(0.5, true);
  return G;
}
export { STYLE_LIST };
