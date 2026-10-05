// Art v2 buildings: a footprint (w x d world px) raised H px, drawn in the game projection as its roof
// (top face) and its south face. Facades are painted per style:
//   brick     walk-up: cornice with dentils, stone lintels and sills, window boxes, a stone band over
//             the ground floor, a stoop door, fire escapes with potted plants
//   stucco / concrete / teal / peach  plain painted blocks
//   diner     cream walls, a red neon band along the top, booth windows with diners inside
//   shop      big lit windows with goods and a clerk at the counter, an open glass door, a striped
//             awning and a striped fascia band
// Roofs are flat membranes with a parapet (the rooftop kit is placed separately), or terracotta tile.
//
// makeBuilding(spec) -> GBuf, with .ax/.ay = the footprint's south-west corner on the ground.
//   spec: { w, d, floors, style, seed, night 0..1, roof: 'flat'|'tile'|'terrace',
//           shop: { kind: 'mart'|'cafe'|'diner', awning: [colA, colB] | null, band: [colA, colB],
//                   door: 'left'|'right'|x, clerk, clerkShirt, people }, fireEscape: [x, w],
//           neon: { icon: 'cup'|'palm', col: [r,g,b], x, y }, trim: [r,g,b] (diner neon band) }
import { MAT, ramp } from './palette.js';
import { GBuf, hash, vnoise, bayer, step, F_GLASS } from './gbuf.js';

const S_N = [0, 1, 0], UP = [0, 0, 1];
export const FLOOR = 56, SHOP_FLOOR = 64;

const setC = (G, x, y, c) => { if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255; };
const setN = (G, x, y, n) => { if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; G.nrm[j] = (n[0] * 0.5 + 0.5) * 255; G.nrm[j + 1] = (n[1] * 0.5 + 0.5) * 255; G.nrm[j + 2] = (n[2] * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; };
const glow = (G, x, y, e) => G.glow(x, y, e);

function wallColor(style, u, v, seed, x, y) {
  const big = vnoise(u, v, 30, seed), mid = vnoise(u, v, 8, seed + 1), h = hash(u, v, seed);
  if (style === 'brick' || style === 'brickDark') {
    const R = style === 'brick' ? MAT.brick : MAT.brickDark;
    const row = Math.floor(v / 4), off = (row & 1) * 4, col = Math.floor((u + off) / 8);
    const mortar = v % 4 === 0 || (u + off) % 8 === 0;
    if (mortar) return step(MAT.concrete, 0.3 + (mid - 0.5) * 0.2, x, y, 0.4);
    const b = hash(col, row, seed + 7);
    return step(R, 0.48 + (b - 0.5) * 0.4 + (big - 0.5) * 0.22 + (h > 0.93 ? 0.15 : 0) - (v < 8 ? 0.12 : 0), x, y, 0.5);
  }
  const R = style === 'diner' ? MAT.diner : style === 'purple' ? MAT.stuccoPurple : style === 'peach' ? MAT.stuccoPeach : style === 'teal' ? MAT.stuccoTeal : style === 'concrete' ? MAT.concrete : MAT.stucco;
  let t = 0.55 + (big - 0.5) * 0.22 + (mid - 0.5) * 0.12 + (h > 0.95 ? 0.1 : 0) - (h < 0.03 ? 0.12 : 0);
  if (v < 6) t -= 0.12 * (1 - v / 6);
  return step(R, t, x, y, 0.7);
}

// a sash window: frame, two panes with a reflection streak (or warm light when lit), a curtain
function sash(G, x0, y0, w, h, lit, seed, opt = {}) {
  const fr = opt.frame || MAT.metalDark, warm = hash(x0, y0, seed) > 0.22;
  const curtain = hash(x0, y0, seed + 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (!G.inside(X, Y)) continue;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1, mid = y === (h >> 1);
    if (edge || mid) { setC(G, X, Y, step(fr, (x === 0 || y === 0) ? 0.2 : 0.55, X, Y, 0)); continue; }
    const streak = ((x + (h - y)) % 9) < 2;
    let c;
    if (lit) {
      c = step(warm ? ramp('#d8964e', 5, 2) : ramp('#5a8ec0', 5, 2), 0.45 + (y / h) * 0.35 + (streak ? 0.15 : 0), X, Y, 0.6);
      const e = warm ? [255, 200, 120] : [150, 210, 255];
      glow(G, X, Y, [e[0], e[1], e[2], 90 + (y / h) * 60]);
    } else c = step(MAT.glassDark, 0.3 + (streak ? 0.45 : 0) + (y < 3 ? 0.18 : 0), X, Y, 0.4);
    // curtains drawn to one side
    if (curtain > 0.5 && (curtain > 0.75 ? x < 3 : x > w - 4)) c = step(curtain > 0.85 ? ramp('#c86a6a', 5, 2) : ramp('#e0d8c8', 5, 2), lit ? 0.75 : 0.45, X, Y, 0.3);
    setC(G, X, Y, c);
    G.flag[Y * G.w + X] |= F_GLASS;
  }
  // stone lintel and sill (they face up: the sill catches light)
  for (let x = -2; x < w + 2; x++) {
    for (let k = 0; k < 3; k++) { setC(G, x0 + x, y0 - 3 + k, step(MAT.stone, 0.75 - k * 0.18, x0 + x, k, 0.3)); }
    setC(G, x0 + x, y0 + h, step(MAT.stone, 0.9, x0 + x, 0, 0)); setN(G, x0 + x, y0 + h, [0, 0.5, 0.86]);
    setC(G, x0 + x, y0 + h + 1, MAT.stone[1]);
  }
}
function windowBox(G, x0, y0, w, seed) {
  for (let x = -1; x <= w; x++) for (let k = 0; k < 6; k++) {
    const X = x0 + x, Y = y0 + k;
    if (k < 3) { const fl = hash(X, k, seed); if (fl > 0.3) setC(G, X, Y - 1, fl > 0.85 ? [226, 80, 110] : fl > 0.7 ? [240, 200, 70] : MAT.leaf[3 + (fl > 0.5 ? 1 : 0)]); }
    else setC(G, X, Y, step(MAT.woodDark, 0.55 - (k - 3) * 0.12, X, Y, 0.3));
  }
}
function acBox(G, x0, y0) { for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) setC(G, x0 + x, y0 + y, y === 0 ? MAT.metal[5] : x === 12 || y === 8 ? MAT.metal[1] : (y > 2 && x > 1 && x < 11 && y % 2 === 0) ? MAT.metal[2] : MAT.metal[3]); }

export function makeBuilding(spec) {
  const { w, d } = spec, seed = spec.seed || 1, style = spec.style || 'stucco';
  const floors = spec.floors || 1, gH = spec.shop ? SHOP_FLOOR : FLOOR, cornice = style === 'brick' ? 10 : 6;
  const H = gH + (floors - 1) * FLOOR + cornice + (spec.parapet || 0);
  const G = new GBuf(w, d + H);
  G.ax = 0; G.ay = d + H;
  const night = spec.night || 0;
  // ---- roof
  if (spec.roof === 'tile') {
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const row = Math.floor(y / 5), cx = (x + (row & 1) * 3) % 7;
      G.put(x, y, step(MAT.terracotta, 0.62 - (y % 5) * 0.08 + (cx === 0 ? -0.25 : cx === 1 ? 0.1 : 0) + (vnoise(x, y, 9, seed) - 0.5) * 0.15, x, y, 0.4), [0, 0.35, 0.94], H, null, 0);
    }
  } else {
    for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
      const rimW = 4, rim = x < rimW || y < rimW || x >= w - rimW || y >= d - rimW;
      let c;
      if (rim) {
        const top = x === 0 || y === 0 || x === w - 1 || y === d - 1;
        const lit = (x < rimW || y < rimW) && !(x >= w - rimW || y >= d - rimW);
        c = step(MAT.stone, top ? 0.85 : lit ? 0.6 : 0.42, x, y, 0.3);
        G.put(x, y, c, UP, H, null, 0);
      } else {
        const g = vnoise(x, y, 18, seed + 4), hh = hash(x, y, seed + 2);
        let t = 0.55 + (g - 0.5) * 0.25 + (hh > 0.93 ? 0.15 : 0) - (hh < 0.05 ? 0.15 : 0);
        if (spec.roof === 'terrace') { const pl = x % 6; t = 0.55 + (hash(Math.floor(x / 6), Math.floor(y / 30), seed) - 0.5) * 0.25 + (pl === 0 ? -0.3 : 0); c = step(MAT.woodDock, t, x, y, 0.5); }
        else {
          if ((x - rimW) % 24 === 0 || (y - rimW) % 30 === 0) t -= 0.12;                  // membrane seams
          if (vnoise(x, y, 11, seed + 9) > 0.78) t -= 0.14;                                  // water stains
          c = step(MAT.roofTar, t, x, y, 0.7);
        }
        // the parapet shades the roof on its north and west sides
        if (x < rimW + 4 || y < rimW + 4) c = c.map((v) => v * 0.84);
        G.put(x, y, c, UP, H - 3, null, 0);
      }
    }
  }
  // ---- south face
  for (let r = 0; r < H; r++) for (let x = 0; x < w; x++) {
    const y = d + r, v = H - r;
    G.put(x, y, wallColor(style, x, v, seed, x, y), S_N, v, null, 0);
  }
  const fy = (v) => d + H - v;                                      // facade height -> sprite row
  // cornice: a projecting band at the top (dentils on brick)
  for (let k = 0; k < cornice; k++) for (let x = 0; x < w; x++) {
    const v = H - k, Y = fy(v);
    let c;
    if (style === 'brick') c = k < 2 ? MAT.stone[k ? 2 : 4] : k < 4 ? MAT.brickDark[3] : (k < 7 && x % 4 < 2) ? MAT.stone[3] : MAT.brickDark[1];
    else if (style === 'diner') c = k < 2 ? MAT.chrome[3] : MAT.dinerRed[3 - (k > 3 ? 1 : 0)];
    else c = step(MAT.stone, 0.75 - k * 0.1, x, k, 0.3);
    setC(G, x, Y, c);
    if (k < 2) setN(G, x, Y, [0, 0.4, 0.92]);
  }
  // diner neon band along the top of the facade
  if (spec.trim) for (let x = 1; x < w - 1; x++) for (const k of [cornice + 2, cornice + 4]) { const Y = fy(H - k); setC(G, x, Y, spec.trim.map((c) => Math.min(255, c * 0.7 + 80))); glow(G, x, Y, [...spec.trim, 120 + night * 135]); }
  // ---- upper floors
  for (let f = 1; f < floors; f++) {
    const base = gH + (f - 1) * FLOOR;
    const ww = style === 'brick' ? 18 : 16, wh = style === 'brick' ? 30 : 26, gap = style === 'brick' ? 20 : 22;
    const n = Math.max(1, Math.floor((w - 16) / (ww + gap)));
    const span = n * ww + (n - 1) * gap, x0 = Math.floor((w - span) / 2);
    for (let i = 0; i < n; i++) {
      const px = x0 + i * (ww + gap), py = fy(base + 12 + wh);
      const lit = hash(i, f, seed + 13) < night * 0.75 + (night > 0 ? 0.08 : 0);
      sash(G, px, py, ww, wh, lit, seed + f * 7 + i);
      if (hash(i, f, seed + 21) > 0.62) windowBox(G, px, py + wh + 2, ww, seed + i);
      else if (hash(i, f, seed + 23) > 0.82) acBox(G, px + 1, py + wh - 8);
    }
  }
  // stone band over the ground floor
  if (style === 'brick' && floors > 1) for (let k = 0; k < 4; k++) for (let x = 0; x < w; x++) setC(G, x, fy(gH + 2 - k), step(MAT.stone, 0.8 - k * 0.15, x, k, 0.3));
  // ---- ground floor
  if (spec.shop) storefront(G, w, d, H, gH, spec, seed, night, fy);
  else {
    const dx = Math.floor(w * 0.22);
    door(G, dx, fy(46), 18, 46, false, night, seed, true);
    for (let k = 0; k < 3; k++) for (let x = -3; x < 21; x++) setC(G, dx + x, fy(3 - k), step(MAT.stone, 0.7 - k * 0.15, x, k, 0.3));   // stoop
    sash(G, w - 34, fy(40), 16, 22, hash(0, 0, seed) < night * 0.6, seed + 3);
    sash(G, Math.floor(w * 0.52), fy(40), 16, 22, hash(1, 0, seed) < night * 0.6, seed + 4);
  }
  if (spec.fireEscape) fireEscape(G, spec.fireEscape, d + H, gH, floors, seed);
  if (spec.neon) neonIcon(G, spec.neon.x ?? Math.floor(w / 2) - 14, d - 6 + (spec.neon.y || 0), spec.neon.icon || 'cup', spec.neon.col, night);
  return G;
}

function door(G, x0, y0, w, h, open, night, seed, gated = false) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    const frame = x < 2 || x >= w - 2 || y < 2;
    if (frame) { setC(G, X, Y, step(MAT.stone, x < 2 || y < 2 ? 0.75 : 0.45, X, Y, 0)); continue; }
    if (open) {
      const leaf = x < 6;
      if (leaf) setC(G, X, Y, step(MAT.glass, 0.5 - x * 0.05 + (y % 7 === 0 ? 0.3 : 0), X, Y, 0.3));
      else { setC(G, X, Y, step(ramp('#b88a52', 5, 2), 0.35 + (y / h) * 0.45, X, Y, 0.7)); glow(G, X, Y, [255, 196, 120, 20 + night * 90]); }
    } else if (gated) {
      const bar = x % 3 === 0 || y % 6 === 0;
      setC(G, X, Y, bar ? MAT.metalDark[1] : step(MAT.glassDark, 0.35 + (y < 6 ? 0.2 : 0), X, Y, 0.3));
      if (!bar && hash(X, Y, 3) < night * 0.6) glow(G, X, Y, [255, 190, 110, 80]);
    } else setC(G, X, Y, step(MAT.woodDark, (x === 4 || x === w - 5 || y === Math.round(h * 0.45)) ? 0.3 : 0.6, X, Y, 0.3));
  }
}

function storefront(G, w, d, H, gH, spec, seed, night, fy) {
  const shop = spec.shop, y0 = d + H;
  const winTop = fy(gH - 18), winBot = y0 - 7;
  const doorW = 22, doorX = shop.door === 'right' ? w - doorW - 10 : shop.door === 'left' ? 10 : (shop.door | 0);
  // windows with the interior
  for (let y = winTop; y < winBot; y++) for (let x = 4; x < w - 4; x++) {
    if (x >= doorX - 2 && x < doorX + doorW + 2) continue;
    const mull = (x - 4) % 30 === 0 || y === winTop || y === winBot - 1;
    if (mull) { setC(G, x, y, step(MAT.metalDark, y === winTop ? 0.25 : 0.55, x, y, 0)); continue; }
    const iy = y - winTop, H2 = winBot - winTop;
    let c;
    if (shop.kind === 'diner' || shop.kind === 'cafe') {
      c = step(ramp('#c08a50', 5, 2), 0.4 + (iy / H2) * 0.35, x, y, 0.8);
      if (iy > H2 * 0.62) c = step(MAT.dinerRed, 0.4 + (x % 16 < 2 ? -0.2 : 0), x, y, 0.4);            // booth seats
      if (iy > H2 * 0.55 && iy < H2 * 0.62) c = MAT.chrome[3];                                          // table tops
      if (iy < 4) c = step(ramp('#e8d8b0', 5, 2), 0.6, x, y, 0.3);                                     // pendant lamps
    } else {
      c = step(ramp('#a88a64', 5, 2), 0.35 + (iy / H2) * 0.35, x, y, 0.8);
      const shelf = iy % 10;
      if (shelf === 0) c = MAT.metalDark[3];
      else if (shelf < 7) { const g = hash(x >> 1, (iy / 10) | 0, seed); c = g > 0.72 ? [204, 72, 64] : g > 0.52 ? [236, 200, 80] : g > 0.32 ? [76, 146, 204] : g > 0.16 ? [116, 180, 100] : [226, 224, 214]; }
    }
    if (((x + (winBot - y)) % 26) < 3) c = c.map((v) => Math.min(255, v + 36));
    setC(G, x, y, c);
    glow(G, x, y, [255, 200, 132, 8 + night * 60]);
    G.flag[y * G.w + x] |= F_GLASS;
  }
  // people inside the windows (busts), and the clerk at the counter
  const people = shop.people ?? (shop.kind === 'diner' ? 4 : 0);
  for (let i = 0; i < people; i++) { const px = 16 + ((i * 37 + seed * 11) % Math.max(20, w - 40)); if (px > doorX - 12 && px < doorX + doorW + 12) continue; bust(G, px, winTop + 10, [ [180, 60, 60], [60, 110, 180], [230, 200, 80], [90, 150, 90] ][i % 4], seed + i * 3, 0.8); }
  if (shop.clerk !== false && shop.kind !== 'diner') bust(G, shop.door === 'right' ? doorX - 30 : doorX + doorW + 30, winTop + 9, shop.clerkShirt || [40, 130, 110], seed + 99, 1);
  // stall riser under the windows
  for (let y = winBot; y < y0; y++) for (let x = 2; x < w - 2; x++) if (!(x >= doorX && x < doorX + doorW)) setC(G, x, y, step(shop.kind === 'diner' ? MAT.dinerRed : MAT.stone, 0.4 + (y === winBot ? 0.35 : 0), x, y, 0.4));
  door(G, doorX, y0 - 50, doorW, 50, shop.open !== false, night, seed);
  // striped fascia band above the windows
  if (shop.band) for (let y = winTop - 22; y < winTop - 2; y++) for (let x = 2; x < w - 2; x++) { const k = y - (winTop - 22); setC(G, x, y, k < 3 || k > 17 ? MAT.paintWhiteCar[k < 3 ? 4 : 2] : step(ramp(shop.band[Math.floor((k - 3) / 5) & 1], 5, 2), 0.6 - ((k - 3) % 5 === 4 ? 0.2 : 0), x, y, 0)); }
  // awning: sloped canvas strip, scalloped, in stripes
  if (shop.awning) {
    const [ca, cb] = shop.awning.map((h) => ramp(h, 6, 3));
    const top = winTop - 2, depth = 13;
    for (let y = 0; y < depth; y++) for (let x = 0; x < w; x++) {
      const Y = top + y, stripe = Math.floor(x / 6) % 2 === 1;
      G.put(x, Y, step(stripe ? cb : ca, 0.8 - y / depth * 0.4, x, Y, 0.5), [0, 0.6, 0.8], H - (y0 - Y) + 6, null, 0);
    }
    for (let x = 0; x < w; x++) { const s = x % 6, len = s === 0 || s === 5 ? 1 : 3; const stripe = Math.floor(x / 6) % 2 === 1; for (let k = 0; k < len; k++) { const Y = top + depth + k; G.put(x, Y, step(stripe ? cb : ca, 0.3 - k * 0.06, x, Y, 0), [0, 1, 0.2], y0 - Y, null, 0); } }
  }
}

function fireEscape(G, xs, yGround, gH, floors, seed) {
  const [x0, wdt] = xs;
  for (let f = 1; f < floors; f++) {
    const yb = yGround - (gH + (f - 1) * FLOOR) + 4;
    // platform with railing
    for (let x = 0; x < wdt; x++) {
      for (let k = 0; k < 3; k++) setC(G, x0 + x, yb - k, k === 0 ? MAT.metalDark[0] : x % 2 ? MAT.metalDark[1] : MAT.metalDark[2]);
      for (const k of [14, 15]) setC(G, x0 + x, yb - k, MAT.metalDark[k === 14 ? 1 : 3]);
      if (x % 4 === 0 || x === wdt - 1) for (let k = 3; k < 14; k++) setC(G, x0 + x, yb - k, MAT.metalDark[1]);
    }
    // potted plants on the platform
    for (let p = 0; p < 2; p++) if (hash(f, p, seed) > 0.35) { const px = x0 + 4 + p * (wdt - 14); for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) setC(G, px + x, yb - 3 - y, step(MAT.terracotta, 0.5 - x * 0.05, x, y, 0)); for (let k = 0; k < 14; k++) { const lx = px + 3 + Math.round((hash(k, f, seed + p) - 0.5) * 9), ly = yb - 8 - Math.floor(hash(f, k, seed + p) * 7); setC(G, lx, ly, MAT.leaf[3 + (k % 3)]); } }
    // stair to the floor below
    if (f > 1) for (let s = 0; s < FLOOR - 4; s++) { const X = x0 + 6 + Math.floor(s * (wdt - 14) / FLOOR), Y = yb + s - 1; setC(G, X, Y, MAT.metalDark[0]); setC(G, X + 1, Y, MAT.metalDark[2]); if (s % 4 === 0) { setC(G, X + 2, Y, MAT.metalDark[1]); setC(G, X + 3, Y, MAT.metalDark[1]); } }
    else for (let s = 0; s < 20; s++) setC(G, x0 + wdt - 6, yb + s, MAT.metalDark[s % 3 === 0 ? 0 : 1]);   // drop ladder
  }
  // laundry hanging off one railing
  const y = yGround - gH - 6;
  for (let k = 0; k < 10; k++) for (let x = 0; x < 7; x++) setC(G, x0 + wdt - 12 + x, y + k, ramp('#e8e4dc', 5, 2)[x === 6 ? 1 : 3]);
}

function neonIcon(G, x0, y0, icon, col, night) {
  const pts = [];
  if (icon === 'cup') {
    for (let x = 0; x <= 16; x++) { pts.push([x + 4, 12]); }
    for (let y = 12; y <= 22; y++) { const s = Math.round((y - 12) * 0.25); pts.push([4 + s, y], [20 - s, y]); }
    for (let x = 6; x <= 18; x++) pts.push([x, 23]);
    for (let a = -1.5; a <= 1.5; a += 0.3) pts.push([21 + Math.round(Math.cos(a) * 3), 16 + Math.round(Math.sin(a) * 3)]);
    for (let x = 0; x <= 24; x++) pts.push([x, 25]);
    for (const sx of [9, 15]) for (let y = 2; y < 10; y++) pts.push([sx + Math.round(Math.sin(y * 0.9) * 1.5), y]);
  } else {
    for (let k = 0; k < 18; k++) pts.push([12 + Math.round(Math.sin(k / 6)), 22 - k]);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0.3], [1, 0.3], [0, -1.2]]) for (let k = 1; k < 9; k++) pts.push([12 + Math.round(dx * k), 4 + Math.round(dy * k * 0.6 + k * k * 0.06)]);
  }
  // dark backing plate
  for (let y = -2; y < 28; y++) for (let x = -2; x < 28; x++) if (G.inside(x0 + x, y0 + y) && hash(x, y, 1) < 0) setC(G, x0 + x, y0 + y, [30, 30, 40]);
  for (const [x, y] of pts) { const X = x0 + x, Y = y0 + y; setC(G, X, Y, col.map((v) => Math.min(255, v * 0.55 + 115))); glow(G, X, Y, [col[0], col[1], col[2], 170 + night * 85]); }
}

// head and shoulders of someone inside (a clerk at the till, a diner in a booth)
function bust(G, cx, cy, shirt, seed, scale = 1) {
  const skin = MAT.skin[Math.floor(hash(seed, 3, 1) * 5)], hair = MAT.hair[Math.floor(hash(seed, 4, 1) * 4)];
  const sh = ramp(shirt, 5, 2);
  for (let y = 0; y < 22; y++) for (let x = -9; x <= 9; x++) {
    const X = cx + x, Y = cy + y;
    if (!G.inside(X, Y)) continue;
    let c = null;
    const hx = x / 4.8, hy = (y - 5.5) / 5.5;
    if (hx * hx + hy * hy <= 1) c = y < 3 ? hair[2] : step(skin, 0.62 - x * 0.05, X, Y, 0.4);
    if (y < 2 && Math.abs(x) < 5) c = hair[1];
    if (Math.abs(x) >= 4 && y < 6 && hx * hx + hy * hy <= 1) c = hair[1];
    if (y === 6 && (x === -2 || x === 2)) c = [36, 26, 36];
    if (y >= 11 && Math.abs(x) <= 8 - Math.max(0, 13 - y)) c = step(sh, 0.62 - x * 0.04, X, Y, 0.4);
    if (c) setC(G, X, Y, c);
  }
}
