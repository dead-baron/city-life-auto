// Art v2 raised roads: highways on embankments, elevated decks on pillars, bridges and ramps that climb
// from the street to the highway. A deck follows a polyline path with a width and a height profile along
// its length; its top is road surface with lane markings and a concrete parapet at each edge, and its
// south-facing sides drop to the ground as a concrete wall, a grass embankment or (over a road or water)
// just the deck's edge girder, so you can see under it.
//
//   deck({ path: [[x, y], ...], width, z: number | [z0, z1] | fn(t), lanes, median, oneway, centre,
//          surface, face: 'wall'|'grass'|'girder'|fn(x, y) -> one of those, parapet, edgeLines, seed })
//     -> { spr, x, y, base, zAt(x, y) }  (place with sc.addWorld(spr, x, y, 0, base); world coordinates)
//   lanes   number of lanes across the whole width (lane lines between them); median: px of raised
//           concrete barrier down the middle; centre: 'yellow' (double yellow line) | 'dash' | null
import { GBuf, hash, step, bayer, F_GROUND, F_WET } from './gbuf.js';
import { groundPixel } from './ground.js';
import { MAT, ramp } from './palette.js';

const UP = [0, 0, 1], SOUTH = [0, 1, 0];
const CONC = ramp('#b8b2a6', 6, 3, { dark: 0.5, light: 0.4, shift: 0.15 });
const GRASS = MAT.grass;

function nearest(path, cum, px, py) {
  let best = { d2: Infinity, s: 0, u: 0 };
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    const tc = Math.max(0, Math.min(1, t));
    const qx = ax + dx * tc, qy = ay + dy * tc, d2 = (px - qx) ** 2 + (py - qy) ** 2;
    // extend the end segments a little past their ends so ramp ends are square
    if (d2 < best.d2) { const L = Math.sqrt(L2); best = { d2, s: cum[i - 1] + tc * L, u: ((px - ax) * -dy + (py - ay) * dx) / L, t, i, end: (i === 1 && t < 0) || (i === path.length - 1 && t > 1) }; }
  }
  return best;
}

export function deck(o) {
  const path = o.path, W = o.width, hw = W / 2, seed = o.seed ?? 3;
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = cum[cum.length - 1];
  const zOf = typeof o.z === 'function' ? o.z : Array.isArray(o.z) ? (t) => { const e = t * t * (3 - 2 * t); return o.z[0] + (o.z[1] - o.z[0]) * e; } : () => o.z ?? 40;
  const xs = path.map((p) => p[0]), ys = path.map((p) => p[1]);
  const bx = Math.floor(Math.min(...xs) - hw - 2), by = Math.floor(Math.min(...ys) - hw - 2), ex = Math.ceil(Math.max(...xs) + hw + 2), ey = Math.ceil(Math.max(...ys) + hw + 2);
  const w = ex - bx, h = ey - by;
  const zmax = Math.ceil(Math.max(...Array.from({ length: 21 }, (_, k) => zOf(k / 20)))) + 14;
  const Z = new Float32Array(w * h).fill(-1), U = new Float32Array(w * h), S = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = nearest(path, cum, bx + x + 0.5, by + y + 0.5);
    if (n.end || Math.abs(n.u) > hw) continue;
    const i = y * w + x; Z[i] = zOf(Math.max(0, Math.min(1, n.s / total))); U[i] = n.u; S[i] = n.s;
  }
  const G = new GBuf(w, h + zmax); G.ax = 0; G.ay = zmax;
  const lanes = o.lanes ?? 2, med = o.median ?? 0, par = o.parapet ?? 6, parH = 8;
  const faceAt = typeof o.face === 'function' ? o.face : () => o.face || 'wall';
  const surf = o.surface || 'asphalt';
  // south faces first (they sit behind nothing nearer), then the top, row by row north to south
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = Z[i];
    if (z < 0) continue;
    const below = y + 1 < h ? Z[i + w] : -1;
    if (below >= 0 && below >= z - 1) continue;
    const kind = faceAt(bx + x, by + y), drop = Math.round(z - Math.max(0, below));
    const depth = kind === 'girder' ? Math.min(drop, 10) : drop;
    for (let k = 1; k <= depth; k++) {
      const r = y + zmax - Math.round(z) + k; if (r < 0 || r >= G.h) continue;
      const v = z - k;
      let c;
      if (kind === 'grass') c = step(GRASS, 0.5 + (hash(bx + x, r, seed) - 0.5) * 0.4 - k / Math.max(1, drop) * 0.15, x, r, 0.8);
      else c = step(CONC, 0.42 - (k / Math.max(8, drop)) * 0.18 + (k <= 2 ? 0.2 : 0) + (((bx + x) % 40) === 0 ? -0.15 : 0) + (hash(x >> 2, r >> 2, seed) > 0.9 ? -0.1 : 0), x, r, 0.4);
      G.put(x, r, c, kind === 'grass' ? [0, 0.6, 0.8] : SOUTH, v, null, kind === 'grass' ? F_WET : 0);
    }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, z = Z[i];
    if (z < 0) continue;
    const u = U[i], s = S[i], au = Math.abs(u) , X = bx + x, Y = by + y;
    let c, zz = z, n = UP, flag = F_GROUND | F_WET;
    if (au > hw - par) { zz = z + parH; c = step(CONC, au > hw - 1.5 ? 0.35 : 0.68 + (u < 0 ? 0.1 : -0.05), X, Y, 0.3); n = [0, 0, 1]; flag = 0; }
    else if (med && au < med / 2) { zz = z + parH + 2; c = step(CONC, au > med / 2 - 1.5 ? 0.4 : 0.72, X, Y, 0.3); flag = 0; }
    else {
      const p = groundPixel(surf, X, Y, seed); c = p.c;
      const inner = hw - par, sh = o.shoulder ?? 6, edge = inner - au;
      const paint = (R) => { c = step(R, 0.62, X, Y, 0.2); };
      const dash = s % 48 < 26;
      if (o.edgeLines !== false && Math.abs(edge - sh) < 1.6) paint(med && au < hw / 2 ? MAT.paintYellow : MAT.paintWhite);
      else if (med && Math.abs(au - med / 2 - 5) < 1.4) paint(MAT.paintYellow);
      else if (!med && o.centre === 'yellow' && (Math.abs(u - 3) < 1.2 || Math.abs(u + 3) < 1.2)) paint(MAT.paintYellow);
      else if (!med && o.centre === 'dash' && au < 1.4 && dash) paint(MAT.paintWhite);
      else if (med) { const per = lanes / 2, lw = (inner - med / 2 - 5 - sh) / per, a = au - med / 2 - 5; for (let k = 1; k < per; k++) if (Math.abs(a - k * lw) < 1.3 && dash) paint(MAT.paintWhite); }
      else if (!o.centre) { const lw = (2 * inner - 2 * sh) / lanes, a = u + inner - sh; for (let k = 1; k < lanes; k++) if (Math.abs(a - k * lw) < 1.3 && dash) paint(MAT.paintWhite); }
      if (hash(X >> 3, Y >> 3, seed + 7) > 0.97) c = c.map((v) => v * 0.85);
    }
    const r = y + zmax - Math.round(zz);
    G.put(x, r, c, n, zz, null, flag);
    if (zz > z) for (let k = 1; k <= Math.round(zz - z); k++) { const rr = r + k; if (rr < G.h && (y + 1 >= h || Z[i + w] < 0 || Math.abs(U[i + w]) <= hw - par)) G.put(x, rr, step(CONC, 0.4, X, rr, 0.3), SOUTH, zz - k, null, 0); }
  }
  // the base: draw after things at ground level within the deck's span, before things south of it
  const zAt = (X, Y) => { const x = Math.round(X - bx), y = Math.round(Y - by); if (x < 0 || y < 0 || x >= w || y >= h) return 0; const z = Z[y * w + x]; return z < 0 ? 0 : z; };
  return { spr: G, x: bx, y: by + zmax - zmax, base: ey - 0.5, zAt, bx, by, w, h };
}
