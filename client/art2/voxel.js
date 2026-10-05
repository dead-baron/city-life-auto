// Art v2: voxel models rendered to pixel-art sprites in the game projection (screen x = X,
// y = Y - Z), at any heading. Cars turn freely, so they are small 3D block models (1 voxel = 1 world
// px) drawn again for each heading; props use the same path so everything shares one look.
//
//   const m = new Vox(w, d, h);        // x along the model's front (east at heading 0), y across, z up
//   const body = m.mat({ ramp, emi, flag, k });
//   m.box(x0, y0, z0, x1, y1, z1, body);  m.fill(fn);  m.cyl(...);  m.ell(...)
//   const g = m.render(heading)  -> GBuf, anchor at (g.ax, g.ay) = model centre on the ground
//
// Each visible pixel gets the voxel's material colour (with baked ambient occlusion and edge
// highlights, the hand-shaded look), the surface normal (smoothed from the voxel occupancy) turned to
// world space, its height and any glow. A dark hue-tinted outline goes round the silhouette and along
// depth breaks.
import { GBuf, bayer, F_NOCAST } from './gbuf.js';

export class Vox {
  constructor(w, d, h) {
    this.w = w | 0; this.d = d | 0; this.h = h | 0;
    this.v = new Uint8Array(this.w * this.d * this.h);
    this.mats = [null];
    this.prepared = false;
  }
  mat(m) { this.mats.push({ k: 3, emi: null, flag: 0, gloss: 0, ...m }); return this.mats.length - 1; }
  idx(x, y, z) { return (z * this.d + y) * this.w + x; }
  get(x, y, z) { return x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h ? 0 : this.v[this.idx(x, y, z)]; }
  set(x, y, z, m) { x |= 0; y |= 0; z |= 0; if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.d || z >= this.h) return; this.v[this.idx(x, y, z)] = m; this.prepared = false; }
  box(x0, y0, z0, x1, y1, z1, m) { for (let z = Math.max(0, z0 | 0); z < Math.min(this.h, z1); z++) for (let y = Math.max(0, y0 | 0); y < Math.min(this.d, y1); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1); x++) this.v[this.idx(x, y, z)] = m; this.prepared = false; }
  // fn(x, y, z) -> material or -1 to leave as is, over a bounding box (whole model by default)
  fill(fn, x0 = 0, y0 = 0, z0 = 0, x1 = this.w, y1 = this.d, z1 = this.h) {
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const m = fn(x + 0.5, y + 0.5, z + 0.5); if (m >= 0) this.v[this.idx(x, y, z)] = m; }
    this.prepared = false;
  }
  // a cylinder along axis 'x' | 'y' | 'z' centred at (cx, cy, cz), radius r, from a0 to a1 on the axis
  cyl(axis, cx, cy, cz, r, a0, a1, m, inner = 0, innerMat = 0) {
    const r2 = r * r, i2 = inner * inner;
    if (axis === 'z') this.fill((x, y) => { const q = (x - cx) ** 2 + (y - cy) ** 2; return q <= r2 ? (q < i2 ? innerMat : m) : -1; }, Math.floor(cx - r), Math.floor(cy - r), a0 | 0, Math.ceil(cx + r), Math.ceil(cy + r), a1 | 0);
    else if (axis === 'y') this.fill((x, y, z) => { const q = (x - cx) ** 2 + (z - cz) ** 2; return q <= r2 ? (q < i2 ? innerMat : m) : -1; }, Math.floor(cx - r), a0 | 0, Math.floor(cz - r), Math.ceil(cx + r), a1 | 0, Math.ceil(cz + r));
    else this.fill((x, y, z) => { const q = (y - cy) ** 2 + (z - cz) ** 2; return q <= r2 ? (q < i2 ? innerMat : m) : -1; }, a0 | 0, Math.floor(cy - r), Math.floor(cz - r), a1 | 0, Math.ceil(cy + r), Math.ceil(cz + r));
  }
  ell(cx, cy, cz, rx, ry, rz, m) { this.fill((x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1 ? m : -1, Math.floor(cx - rx), Math.floor(cy - ry), Math.floor(cz - rz), Math.ceil(cx + rx), Math.ceil(cy + ry), Math.ceil(cz + rz)); }

  // normals and occlusion per voxel (once)
  prepare(smooth = 1) {
    if (this.prepared) return;
    const { w, d, h } = this, n = w * d * h;
    this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n); this.ao = new Float32Array(n);
    const occ = (x, y, z) => (this.get(x, y, z) ? 1 : 0);
    for (let z = 0; z < h; z++) for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const i = this.idx(x, y, z);
      if (!this.v[i]) continue;
      // only surface voxels matter
      if (occ(x + 1, y, z) && occ(x - 1, y, z) && occ(x, y + 1, z) && occ(x, y - 1, z) && occ(x, y, z + 1) && occ(x, y, z - 1)) continue;
      let gx = 0, gy = 0, gz = 0, filled = 0, tot = 0;
      for (let dz = -smooth; dz <= smooth; dz++) for (let dy = -smooth; dy <= smooth; dy++) for (let dx = -smooth; dx <= smooth; dx++) {
        const o = occ(x + dx, y + dy, z + dz);
        gx -= dx * o; gy -= dy * o; gz -= dz * o; filled += o; tot++;
      }
      let l = Math.hypot(gx, gy, gz);
      if (l < 1e-4) { gx = 0; gy = 0; gz = 1; l = 1; }
      this.nx[i] = gx / l; this.ny[i] = gy / l; this.nz[i] = gz / l;
      // ambient occlusion from a wider look upward and around
      let open = 0, cnt = 0;
      for (const [dx, dy, dz] of [[0, 0, 2], [2, 0, 1], [-2, 0, 1], [0, 2, 1], [0, -2, 1], [0, 0, 4], [3, 3, 2], [-3, 3, 2], [3, -3, 2], [-3, -3, 2]]) { cnt++; if (!occ(x + dx, y + dy, z + dz)) open++; }
      this.ao[i] = open / cnt;
    }
    this.prepared = true;
  }

  // Draw the model at a heading (radians; 0 = model x pointing east, positive turns toward south).
  render(heading = 0, opt = {}) {
    this.prepare(opt.smooth ?? this.smooth ?? 1);
    const { w, d, h } = this;
    const R = Math.ceil(Math.hypot(w, d) / 2) + 2;
    const G = new GBuf(2 * R, 2 * R + h + 2);
    G.ax = R; G.ay = R + h;  // where the model's centre on the ground lands
    const c = Math.cos(heading), s = Math.sin(heading);
    const depth = new Float32Array(G.w * G.h).fill(-1e9);
    for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
      const X = px - R + 0.5, sy = py - G.ay + 0.5;
      for (let Z = h - 1; Z >= 0; Z--) {
        const Y = sy + Z + 0.5;
        const mx = c * X + s * Y + w / 2, my = -s * X + c * Y + d / 2;
        if (mx < 0 || my < 0 || mx >= w || my >= d) continue;
        const vi = this.idx(mx | 0, my | 0, Z), m = this.v[vi];
        if (!m) continue;
        const M = this.mats[m];
        // normal into world space
        let nx = this.nx[vi], ny = this.ny[vi], nz = this.nz[vi];
        if (!nx && !ny && !nz) nz = 1;
        const wx = c * nx - s * ny, wy = s * nx + c * ny;
        // baked shading: occlusion darkens, up-facing edges catch a highlight, dithered between steps
        const R5 = M.ramp;
        let t = M.k + (this.ao[vi] - 0.75) * 2.2 + (nz > 0.7 ? 0.5 : 0) + (M.shade ? M.shade(mx, my, Z, vi) : 0);
        t += bayer(px, py) * (opt.dither ?? 0.5);
        const col = R5[Math.max(0, Math.min(R5.length - 1, Math.round(t)))];
        G.put(px, py, col, [wx, wy, nz], Z, M.emi, M.flag | (opt.flag || 0));
        depth[py * G.w + px] = Y + Z;
        break;
      }
    }
    // dark lines along depth breaks (a roof edge over a door, a wheel arch)
    if (opt.inner !== false) {
      for (let py = 1; py < G.h; py++) for (let px = 1; px < G.w - 1; px++) {
        const i = py * G.w + px, j = i * 4;
        if (!G.col[j + 3]) continue;
        const me = depth[i];
        const up = depth[i - G.w], lf = depth[i - 1], rt = depth[i + 1];
        if ((up > -1e8 && up - me > 5) || (lf > -1e8 && lf - me > 5) || (rt > -1e8 && rt - me > 5)) {
          G.col[j] *= 0.62; G.col[j + 1] *= 0.6; G.col[j + 2] = G.col[j + 2] * 0.66 + 8;
        }
      }
    }
    if (opt.outline !== false) G.outline(0.42, true);
    return G;
  }
}

// a material that doesn't cast a shadow (thin glass, wires) - convenience
export const NOCAST = F_NOCAST;
