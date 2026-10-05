// Art v2 buildings: a footprint (w x d world px) raised `H` px, drawn in the game projection as its
// roof (top face) and its south face, with the facade painted per style: stucco, brick, painted
// block, terracotta-roofed house. Storefronts get awnings, big lit windows, an open door with the
// interior and a clerk behind the counter.
//
// makeBuilding(spec) -> GBuf, with .ax/.ay = the footprint's south-west corner on the ground.
//   spec: { w, d, floors, style, seed, shop: { kind, awning, door: 'left'|'right'|x, open: true },
//           night: 0..1 (how many windows are lit / lamps on), roof: 'tar'|'gravel'|'tile'|'terrace',
//           sign: { icon, neon: [r,g,b] } }
import { MAT, ramp } from './palette.js';
import { GBuf, hash, vnoise, bayer, step, F_GLASS, F_NOCAST } from './gbuf.js';

const S_N = [0, 1, 0], UP = [0, 0, 1];
const FLOOR = 66;

function wallColor(style, u, v, seed, x, y) {
  const big = vnoise(u, v, 30, seed), mid = vnoise(u, v, 8, seed + 1), h = hash(u, v, seed);
  if (style === 'brick' || style === 'brickDark') {
    const R = style === 'brick' ? MAT.brick : MAT.brickDark;
    const row = Math.floor(v / 4), off = (row & 1) * 4, col = Math.floor((u + off) / 8);
    const mortar = v % 4 === 0 || (u + off) % 8 === 0;
    if (mortar) return step(MAT.concrete, 0.35 + (mid - 0.5) * 0.2, x, y, 0.4);
    const b = hash(col, row, seed + 7);
    return step(R, 0.45 + (b - 0.5) * 0.35 + (big - 0.5) * 0.25 + (h > 0.92 ? 0.15 : 0), x, y, 0.5);
  }
  const R = style === 'purple' ? MAT.stuccoPurple : style === 'peach' ? MAT.stuccoPeach : style === 'teal' ? MAT.stuccoTeal : MAT.stucco;
  let t = 0.55 + (big - 0.5) * 0.22 + (mid - 0.5) * 0.12 + (h > 0.95 ? 0.1 : 0) - (h < 0.03 ? 0.12 : 0);
  // grime streaks under windows and at the base
  if (v < 6) t -= 0.12 * (1 - v / 6);
  return step(R, t, x, y, 0.7);
}

// a window seen on the south face: frame, glass (sky reflection by day, warm light when lit), sill
function window_(G, x0, y0, w, h, lit, opt, seed) {
  const fr = opt.frame || MAT.woodDark, gl = MAT.glassDark;
  const warm = hash(x0, y0, seed) > 0.25;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (!G.inside(X, Y)) continue;
    const j = (Y * G.w + X) * 4;
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    const mull = !edge && (x === (w >> 1) || y === Math.round(h * 0.42));
    if (edge || mull) { setC(G, X, Y, step(fr, edge && (y === 0 || x === 0) ? 0.25 : 0.5, X, Y, 0)); G.nrm[j + 1] = 200; continue; }
    // glass: a diagonal sky streak by day
    const streak = ((x + (h - y)) % 9) < 2;
    if (lit) {
      const c = warm ? [255, 196, 120] : [150, 220, 255];
      setC(G, X, Y, step(warm ? ramp('#c98a48', 5, 2) : ramp('#4d8ab0', 5, 2), 0.5 + (y / h) * 0.3 + (streak ? 0.2 : 0), X, Y, 0.6));
      G.glow(X, Y, [c[0], c[1], c[2], 70 + (y / h) * 60]);
    } else setC(G, X, Y, step(gl, 0.35 + (streak ? 0.45 : 0) + (y < 3 ? 0.15 : 0), X, Y, 0.4));
    G.flag[Y * G.w + X] |= F_GLASS;
  }
  // sill: a lighter ledge that faces up
  for (let x = -1; x <= w; x++) { const X = x0 + x, Y = y0 + h; if (G.inside(X, Y)) { setC(G, X, Y, opt.sill || MAT.concrete[4]); setN(G, X, Y, [0, 0.55, 0.83]); } if (G.inside(X, Y + 1)) setC(G, X, Y + 1, MAT.concrete[1]); }
}
const setC = (G, x, y, c) => { const j = (y * G.w + x) * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255; };
const setN = (G, x, y, n) => { const j = (y * G.w + x) * 4; G.nrm[j] = (n[0] * 0.5 + 0.5) * 255; G.nrm[j + 1] = (n[1] * 0.5 + 0.5) * 255; G.nrm[j + 2] = (n[2] * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; };

export function makeBuilding(spec) {
  const { w, d } = spec, seed = spec.seed || 1, style = spec.style || 'stucco';
  const floors = spec.floors || 1, gH = spec.shop ? 76 : FLOOR, H = gH + (floors - 1) * FLOOR + 6;  // +parapet
  const G = new GBuf(w, d + H);
  G.ax = 0; G.ay = d + H;
  const night = spec.night || 0;
  // ---- roof (top face, rows 0..d-1, height H)
  const roofR = spec.roof === 'tile' ? MAT.terracotta : spec.roof === 'gravel' ? MAT.roofGravel : MAT.roofTar;
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const rim = x < 3 || y < 3 || x >= w - 3 || y >= d - 3;
    let c;
    if (spec.roof === 'tile') {
      const row = Math.floor(y / 5), cx = (x + (row & 1) * 3) % 7;
      c = step(roofR, 0.62 - (y % 5) * 0.08 + (cx === 0 ? -0.25 : cx === 1 ? 0.1 : 0) + (vnoise(x, y, 9, seed) - 0.5) * 0.15, x, y, 0.4);
      G.put(x, y, c, [0, 0.35, 0.94], H, null, 0);
      continue;
    }
    if (rim) {
      // parapet: lit top on the north/west edges, shaded inner faces
      const t = (x < 3 || y < 3) ? 0.82 : 0.6;
      c = wallColor(style === 'brick' ? 'stucco' : style, x, y, seed, x, y);
      c = step(MAT.concrete, t, x, y, 0.4);
      G.put(x, y, c, UP, H, null, 0);
    } else {
      const g = vnoise(x, y, 14, seed + 4), hh = hash(x, y, seed + 2);
      let t = 0.5 + (g - 0.5) * 0.3 + (hh > 0.9 ? 0.18 : 0) - (hh < 0.06 ? 0.15 : 0);
      if (spec.roof === 'terrace') { // decking
        const pl = x % 6; t = 0.55 + (hash(Math.floor(x / 6), Math.floor(y / 30), seed) - 0.5) * 0.25 + (pl === 0 ? -0.3 : 0);
        c = step(MAT.woodDock, t, x, y, 0.5);
      } else c = step(roofR, t, x, y, 0.8);
      // inner shadow under the parapet (north/west)
      if (x < 5 || y < 5) c = c.map((v) => v * 0.82);
      G.put(x, y, c, UP, H - 4, null, 0);
    }
  }
  // ---- south face (rows d .. d+H-1): v = height above ground
  for (let r = 0; r < H; r++) for (let x = 0; x < w; x++) {
    const y = d + r, v = H - r;
    let c = wallColor(style, x, v, seed, x, y);
    if (v > H - 6) c = step(MAT.concrete, 0.7 - (H - v) * 0.06, x, y, 0.3);      // parapet cap
    else if (v === H - 6) c = MAT.concrete[1];
    G.put(x, y, c, S_N, v, null, 0);
  }
  const face = (u, v) => [u, d + H - v];  // facade coords -> sprite pixel
  // ---- upper floors: windows (and a balcony or fire escape)
  for (let f = 1; f < floors; f++) {
    const base = gH + (f - 1) * FLOOR;
    const ww = style.startsWith('brick') ? 14 : 16, wh = style.startsWith('brick') ? 28 : 24, gap = style.startsWith('brick') ? 12 : 22;
    const n = Math.max(1, Math.floor((w - 12) / (ww + gap)));
    const span = n * ww + (n - 1) * gap, x0 = Math.floor((w - span) / 2);
    for (let i = 0; i < n; i++) {
      const [px, py] = face(x0 + i * (ww + gap), base + 16 + wh);
      const lit = hash(i, f, seed + 13) < night * 0.75 + (night > 0 ? 0.1 : 0);
      if (style.startsWith('brick')) {
        // brick lintel above
        for (let x = -2; x < ww + 2; x++) for (let k = 0; k < 3; k++) if (G.inside(px + x, py - 3 + k)) setC(G, px + x, py - 3 + k, step(MAT.concrete, 0.55 - k * 0.1, px + x, k, 0.3));
      }
      window_(G, px, py, ww, wh, lit, { frame: style === 'stucco' ? MAT.woodDark : MAT.metalDark }, seed + f * 7 + i);
      // window boxes with flowers on some
      if (hash(i, f, seed + 21) > 0.55) for (let x = -1; x <= ww; x++) for (let k = 0; k < 4; k++) {
        const X = px + x, Y = py + wh + 2 + k;
        if (!G.inside(X, Y)) continue;
        if (k === 0) { const fl = hash(X, f, seed) ; setC(G, X, Y - 1, fl > 0.7 ? [214, 72, 110] : fl > 0.45 ? [236, 200, 70] : MAT.leaf[4]); setC(G, X, Y, MAT.leaf[3]); }
        else setC(G, X, Y, step(MAT.terracotta, 0.45 - k * 0.08, X, Y, 0.3));
      }
    }
    if (spec.balcony && f === 1) balcony(G, Math.floor(w * 0.18), face(0, base + 2)[1], Math.floor(w * 0.5));
  }
  // ---- ground floor
  if (spec.shop) storefront(G, w, d, H, gH, spec, seed, night);
  else {
    const [px, py] = face(Math.floor(w / 2) - 9, 46);
    door(G, px, py, 18, 46, false, night, seed);
    const ww = 16, wh = 24;
    if (w > 70) { window_(G, ...face(10, 20 + wh), ww, wh, hash(1, 0, seed) < night, {}, seed + 1); window_(G, ...face(w - 10 - ww, 20 + wh), ww, wh, hash(2, 0, seed) < night, {}, seed + 2); }
  }
  if (spec.fireEscape) fireEscape(G, spec.fireEscape, d + H, gH, floors);
  if (spec.mural) mural(G, spec.mural, d + H, seed);
  return G;
}

function door(G, x0, y0, w, h, open, night, seed, interior = null) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (!G.inside(X, Y)) continue;
    const frame = x < 2 || x >= w - 2 || y < 2;
    if (frame) { setC(G, X, Y, step(MAT.woodDark, x < 2 || y < 2 ? 0.3 : 0.55, X, Y, 0)); continue; }
    if (open) {
      // the open doorway: a warm lit interior, the door leaf swung in on one side
      const leaf = x < 6;
      if (leaf) setC(G, X, Y, step(MAT.woodDark, 0.7 - x * 0.05, X, Y, 0.3));
      else { setC(G, X, Y, step(ramp('#a8743e', 5, 2), 0.35 + (y / h) * 0.45, X, Y, 0.7)); G.glow(X, Y, [255, 190, 110, 30 + night * 90]); }
    } else {
      const panel = (x === 4 || x === w - 5 || y === Math.round(h * 0.45)) ? 0.3 : 0.6;
      setC(G, X, Y, step(MAT.woodDark, panel, X, Y, 0.3));
      if (x === w - 5 && y === Math.round(h * 0.55)) setC(G, X, Y, MAT.chrome[3]);
    }
  }
}

function storefront(G, w, d, H, gH, spec, seed, night) {
  const shop = spec.shop, y0 = d + H;                        // ground line in sprite rows
  const winTop = y0 - 58, winBot = y0 - 6;
  const doorW = 20, doorX = shop.door === 'right' ? w - doorW - 8 : shop.door === 'left' ? 8 : (shop.door | 0);
  // big shop windows (interior: shelves, warm light, a couple of shapes)
  for (let y = winTop; y < winBot; y++) for (let x = 6; x < w - 6; x++) {
    if (x >= doorX - 2 && x < doorX + doorW + 2) continue;
    const mull = (x - 6) % 34 === 0 || y === winTop || y === winBot - 1;
    if (mull) { setC(G, x, y, step(MAT.metalDark, y === winTop ? 0.3 : 0.55, x, y, 0)); continue; }
    const iy = y - winTop, ix = x;
    // interior: shelves rows of goods
    let c;
    const shelf = iy % 11;
    if (shop.kind === 'cafe') {
      c = step(ramp('#b0703a', 5, 2), 0.35 + (iy / 52) * 0.4, x, y, 0.8);
      if (iy > 30 && iy < 34) c = MAT.woodDark[3];                                 // counter top
      if (iy > 34) c = step(MAT.woodDark, 0.45, x, y, 0.5);
    } else {
      c = step(ramp('#9a7a5a', 5, 2), 0.35 + (iy / 52) * 0.35, x, y, 0.8);
      if (shelf === 0) c = MAT.metalDark[3];
      else if (shelf < 7) { const g = hash(ix >> 1, (iy / 11) | 0, seed); c = g > 0.7 ? [196, 64, 64] : g > 0.5 ? [232, 196, 72] : g > 0.3 ? [72, 140, 196] : g > 0.15 ? [112, 176, 96] : [220, 220, 210]; }
    }
    // glass reflection band
    if (((x + (winBot - y)) % 23) < 3) c = c.map((v) => Math.min(255, v + 40));
    setC(G, x, y, c);
    G.glow(x, y, [255, 196, 128, 10 + night * 70]);
    G.flag[y * G.w + x] |= F_GLASS;
  }
  // stall riser under the windows
  for (let y = winBot; y < y0; y++) for (let x = 4; x < w - 4; x++) if (!(x >= doorX && x < doorX + doorW)) setC(G, x, y, step(MAT.concrete, 0.4 + (y === winBot ? 0.3 : 0), x, y, 0.5));
  // door, open, with the interior lit
  door(G, doorX, y0 - 48, doorW, 48, shop.open !== false, night, seed);
  // the clerk at the counter, seen through the glass (a little bust)
  if (shop.clerk !== false) {
    const cx = shop.door === 'right' ? doorX - 30 : doorX + doorW + 26, cy = winTop + 14;
    bust(G, cx, cy, shop.clerkShirt || [46, 120, 92], seed);
  }
  // awning: a sloped canvas strip over the windows (faces up and out), scalloped edge
  if (shop.awning) {
    const R = shop.awning === 'red' ? MAT.awningRed : shop.awning === 'cream' ? MAT.awningCream : MAT.awningGreen;
    const R2 = MAT.awningCream;
    const top = winTop - 14, depth = 14;
    for (let y = 0; y < depth; y++) for (let x = 2; x < w - 2; x++) {
      const Y = top + y;
      const stripe = shop.stripes && Math.floor(x / 7) % 2 === 1;
      const c = step(stripe ? R2 : R, 0.75 - y / depth * 0.35, x, Y, 0.6);
      G.put(x, Y, c, [0, 0.62, 0.78], H - (y0 - Y) + 4, null, 0);
    }
    for (let x = 2; x < w - 2; x++) {                                       // scallops
      const s = (x % 7);
      const len = s === 0 || s === 6 ? 1 : s === 3 ? 4 : 3;
      for (let k = 0; k < len; k++) { const Y = top + depth + k; const stripe = shop.stripes && Math.floor(x / 7) % 2 === 1; G.put(x, Y, step(stripe ? R2 : R, 0.3 - k * 0.05, x, Y, 0), [0, 1, 0.2], y0 - Y, null, 0); }
    }
  }
  // sign board or neon icon
  if (spec.sign) {
    const sx = Math.floor(w / 2) - 12, sy = winTop - (shop.awning ? 30 : 18);
    if (spec.sign.neon) neonIcon(G, sx, sy, spec.sign.icon || 'palm', spec.sign.neon, night);
  }
}

// a balcony with railings on the first floor
function balcony(G, x0, yBase, len) {
  for (let x = 0; x < len; x++) for (let k = 0; k < 16; k++) {
    const X = x0 + x, Y = yBase - k;
    if (!G.inside(X, Y)) continue;
    if (k < 3) { setC(G, X, Y + 2, step(MAT.concrete, 0.6 - k * 0.15, X, Y, 0)); continue; }
    if (k === 15 || k === 14) setC(G, X, Y, MAT.metalDark[k === 15 ? 3 : 1]);
    else if (x % 4 === 0) setC(G, X, Y, MAT.metalDark[1]);
  }
}
function fireEscape(G, xs, yGround, gH, floors) {
  const [x0, wdt] = xs;
  for (let f = 1; f < floors; f++) {
    const yb = yGround - (gH + (f - 1) * FLOOR) + 2;
    for (let x = 0; x < wdt; x++) {
      for (let k = 0; k < 3; k++) if (G.inside(x0 + x, yb - k)) setC(G, x0 + x, yb - k, k === 0 ? MAT.metalDark[0] : x % 2 ? MAT.metalDark[1] : MAT.metalDark[2]);
      for (const k of [12, 13]) if (G.inside(x0 + x, yb - k)) setC(G, x0 + x, yb - k, MAT.metalDark[k === 12 ? 1 : 3]);
      if (x % 5 === 0) for (let k = 3; k < 12; k++) if (G.inside(x0 + x, yb - k)) setC(G, x0 + x, yb - k, MAT.metalDark[1]);
    }
    // ladder diagonal to the floor below
    for (let s = 0; s < FLOOR - 4; s++) { const X = x0 + 4 + Math.floor(s * (wdt - 10) / FLOOR), Y = yb + s; if (f > 1 && G.inside(X, Y)) { setC(G, X, Y, MAT.metalDark[0]); setC(G, X + 3, Y, MAT.metalDark[2]); } }
  }
}
function mural(G, m, yGround, seed) {
  // a bold painted bird / sunset panel, in a few flat colours with an outline (no text)
  const { x, y, w, h, kind } = m;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i, Y = yGround - y - h + j;
    if (!G.inside(X, Y)) continue;
    const u = i / w, v = j / h;
    let c;
    if (kind === 'sunset') {
      c = v < 0.55 ? (v < 0.2 ? [232, 120, 60] : [246, 170, 80]) : [40, 120, 180];
      const sun = Math.hypot(u - 0.5, (v - 0.55) * 1.4) < 0.18 && v < 0.55;
      if (sun) c = [255, 222, 120];
      if (v > 0.55 && ((i + j) % 6 === 0)) c = [90, 170, 210];
      // palm silhouettes
      if ((Math.abs(u - 0.2) < 0.02 && v > 0.25) || (Math.abs(u - 0.82) < 0.02 && v > 0.15)) c = [28, 48, 80];
      if ((Math.hypot(u - 0.2, v - 0.25) < 0.1 || Math.hypot(u - 0.82, v - 0.15) < 0.1) && hash(i, j, seed) > 0.4) c = [28, 48, 80];
    } else {
      // abstract bird: big swooping shapes in blue / yellow / red
      const a = Math.sin(u * 6 + v * 3), b = Math.cos(v * 7 - u * 2);
      c = a > 0.6 ? [60, 110, 200] : b > 0.7 ? [240, 190, 60] : a < -0.7 ? [200, 70, 60] : null;
      if (!c) continue;
    }
    setC(G, X, Y, c.map((q) => q * (0.9 + bayer(i, j) * 0.15)));
  }
}
function neonIcon(G, x0, y0, icon, col, night) {
  // a simple palm / cup outline in glowing tube, with a dark backing
  const pts = [];
  if (icon === 'palm') {
    for (let k = 0; k < 18; k++) pts.push([12 + Math.round(Math.sin(k / 6) * 1), 22 - k]);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 0.3], [1, 0.3], [0, -1.2]]) for (let k = 1; k < 9; k++) pts.push([12 + Math.round(dx * k), 4 + Math.round(dy * k * 0.6 + (k * k) * 0.06)]);
  } else for (let a = 0; a < 6.28; a += 0.2) pts.push([12 + Math.round(Math.cos(a) * 8), 12 + Math.round(Math.sin(a) * 6)]);
  for (const [x, y] of pts) {
    const X = x0 + x, Y = y0 + y;
    if (!G.inside(X, Y)) continue;
    setC(G, X, Y, col.map((v) => Math.min(255, v * 0.6 + 100)));
    G.glow(X, Y, [col[0], col[1], col[2], 160 + night * 95]);
  }
}
// head and shoulders of someone standing behind a counter
function bust(G, cx, cy, shirt, seed) {
  const skin = MAT.skin[Math.floor(hash(seed, 3, 1) * 5)], hair = MAT.hair[Math.floor(hash(seed, 4, 1) * 4)];
  const sh = ramp(shirt, 5, 2);
  for (let y = 0; y < 22; y++) for (let x = -9; x <= 9; x++) {
    const X = cx + x, Y = cy + y;
    if (!G.inside(X, Y)) continue;
    let c = null;
    const hx = x / 4.5, hy = (y - 5) / 5;
    if (hx * hx + hy * hy <= 1) c = y < 3 ? hair[2] : step(skin, 0.6 - x * 0.04, X, Y, 0.5);
    if (y < 2 && Math.abs(x) < 5) c = hair[1];
    if (y === 6 && (x === -2 || x === 2)) c = [40, 30, 40];             // eyes
    if (y >= 10 && Math.abs(x) <= 8 - Math.max(0, 12 - y)) c = step(sh, 0.6 - x * 0.03, X, Y, 0.5);
    if (c) setC(G, X, Y, c);
  }
}
