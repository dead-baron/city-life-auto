// World v3b: the owner's traced layout (shared/world3-layout.js) as plain per-tile layers, for checking the regional
// places in isolation before the frame's land (shared/world3-land.js) is rebuilt on it: what is land, which water, and
// the sketch's ground class. Tools and tests only (the world build reads the land layers, not this).
//   layers3b() -> { W, H, land, water, ground, at(x, y) }
//   water: 0 land, 1 sea, 3 lake, 6 stream; ground: 0 none (plain land), GROUND3B ids below.
import { MAINLAND3, ISLANDS3, LAKES3, STREAMS3, GROUND3 } from '../../shared/world3-layout.js';

export const W3B = 6552, H3B = 4032;
export const GROUND3B = { forest: 1, field: 2, desert: 3, canyon: 4, mesa: 5, mount: 6, city: 7 };

// even-odd scanline fill of a polygon (tile centres), calling put(x, y) for each tile inside
export function fillPoly(poly, W, H, put) {
  let y0 = H, y1 = 0;
  for (const [, y] of poly) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + (cy - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) put(x, y);
    }
  }
}

// a thick line (half width hw) through pts
export function stampLine(pts, hw, W, H, put) {
  for (let j = 1; j < pts.length; j++) {
    const [ax, ay] = pts[j - 1], [bx, by] = pts[j], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hw)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + hw));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - hw)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + hw));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2)), ex = x + 0.5 - ax - t * dx, ey = y + 0.5 - ay - t * dy;
      if (ex * ex + ey * ey <= hw * hw) put(x, y);
    }
  }
}

let CACHE = null;
export function layers3b() {
  if (CACHE) return CACHE;
  const W = W3B, H = H3B, N = W * H;
  const land = new Uint8Array(N), water = new Uint8Array(N).fill(1), ground = new Uint8Array(N);
  const setLand = (x, y) => { const i = y * W + x; land[i] = 1; water[i] = 0; };
  fillPoly(MAINLAND3, W, H, setLand);
  for (const I of ISLANDS3) fillPoly(I.poly, W, H, setLand);
  for (const L of LAKES3) fillPoly(L.poly, W, H, (x, y) => { const i = y * W + x; land[i] = 0; water[i] = 3; });
  for (const S of STREAMS3) stampLine(S.pts, S.width / 2, W, H, (x, y) => { const i = y * W + x; if (land[i]) { land[i] = 0; water[i] = 6; } });
  for (const k of ['forest', 'field', 'desert', 'canyon', 'mesa', 'mount', 'city']) for (const P of GROUND3[k]) fillPoly(P, W, H, (x, y) => { ground[y * W + x] = GROUND3B[k]; });
  const at = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); if (tx < 0 || ty < 0 || tx >= W || ty >= H) return { land: 0, water: 1, ground: 0 }; const i = ty * W + tx; return { land: land[i], water: water[i], ground: land[i] ? ground[i] : 0 }; };
  CACHE = { W, H, land, water, ground, at };
  return CACHE;
}
