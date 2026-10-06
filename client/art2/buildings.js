// Art v2 buildings: a footprint (w x d world px) raised H px, drawn in the game projection as its roof
// (top face) and its south face. Facades are painted per style:
//   brick     walk-up: cornice with dentils, stone lintels and sills, window boxes, a stone band over
//             the ground floor, a stoop door, fire escapes with potted plants
//   stucco / concrete / teal / peach  plain painted blocks
//   diner     cream walls, a red neon band along the top, booth windows with diners inside
//   shop      big lit windows with goods and a clerk at the counter, an open glass door, a striped
//             awning and a striped fascia band
// Roofs are flat membranes with a parapet (the rooftop kit is placed separately), or terracotta tile.
// With spec.roofMat a flat roof is a deck sunk below its parapet (the north parapet's inner face shows, the
// coping matches the walls): 'tar' | 'gravel' | 'membrane' | 'metal' (standing seams) | 'paver' | 'deck'
// (planks) | 'green' (sedum) | 'rubber', with seams, patches, drains and ponding stains.
//
// makeBuilding(spec) -> GBuf, with .ax/.ay = the footprint's south-west corner on the ground.
//   spec: { w, d, floors, style, seed, night 0..1, roof: 'flat'|'tile'|'terrace',
//           shop: { kind: 'mart'|'cafe'|'diner', awning: [colA, colB] | null, band: [colA, colB],
//                   door: 'left'|'right'|x, doorW, clerk, clerkShirt, people }, fireEscape: [x, w],
//           neon: { icon: 'cup'|'palm', col: [r,g,b], x, y }, trim: [r,g,b] (diner neon band),
//           blades: [{ text, x, v, col }] (vertical neon signs), plaques: [{ text, x, v, sx, bg, fg, lit }],
//           roofMat, lip (parapet height above the deck, px), rimW (parapet thickness), pads: [[x, y, w, h]]
//           (walkway pads on the deck), groundH (ground floor height; 0 = every floor is an upper floor,
//           for a volume standing on another's roof), glowOnly (lit windows keep their glass albedo and
//           carry their light in the emissive only, for bakes lit at every time of day) }
//   roofDeckZ(spec): the height of a flat roof's deck (where rooftop kit stands)
import { MAT, ramp as ramp0 } from './palette.js';
import { GBuf, hash, vnoise, bayer, step, F_GLASS, F_LEAF } from './gbuf.js';
import { drawText, textWidth } from './font.js';

const S_N = [0, 1, 0], UP = [0, 0, 1];
// ramp() is pure but not free, and the painters below call it per pixel: memoise the plain calls
const RAMPS = new Map();
function ramp(base, n = 6, k = Math.floor((n - 1) / 2), opt) {
  if (opt) return ramp0(base, n, k, opt);
  const key = (typeof base === 'string' ? base : base.join(',')) + ':' + n + ':' + k;
  let r = RAMPS.get(key);
  if (!r) { r = ramp0(base, n, k); if (RAMPS.size > 4000) RAMPS.clear(); RAMPS.set(key, r); }
  return r;
}
export const FLOOR = 56, SHOP_FLOOR = 64;
// the height of a building's walls (its flat roof level), as makeBuilding lays it out
export function buildingH(spec) {
  if (spec.height) return spec.height;
  const floors = spec.floors || 1, gH = spec.groundH ?? (spec.shop ? SHOP_FLOOR : FLOOR), cornice = (spec.style || 'stucco') === 'brick' ? 10 : 6;
  return gH + (floors - 1) * FLOOR + cornice + (spec.parapet || 0);
}
export const roofDeckZ = (spec) => buildingH(spec) - (spec.roofMat && spec.roof !== 'tile' && !spec.pitch ? spec.lip ?? 6 : 0);

const setC = (G, x, y, c) => { if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = 255; };
const setN = (G, x, y, n) => { if (!G.inside(x, y)) return; const j = (y * G.w + x) * 4; G.nrm[j] = (n[0] * 0.5 + 0.5) * 255; G.nrm[j + 1] = (n[1] * 0.5 + 0.5) * 255; G.nrm[j + 2] = (n[2] * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255; };
const glow = (G, x, y, e) => G.glow(x, y, e);

let WALLC = null;   // a custom wall ramp for the building being made (spec.wallColor)
let GLOW_ONLY = false; // spec.glowOnly: lit windows keep their glass albedo and carry the light in the emissive
                       // map only (the game bakes a chunk once for every time of day; the Lighter scales emi)
// (big and mid: vnoise(u, v, 30, seed) and vnoise(u, v, 8, seed + 1) when the caller has them precomputed)
function wallColor(style, u, v, seed, x, y, big = vnoise(u, v, 30, seed), mid = vnoise(u, v, 8, seed + 1)) {
  const h = hash(u, v, seed);
  if (style === 'brick' || style === 'brickDark') {
    const R = style === 'brick' ? MAT.brick : MAT.brickDark;
    const row = Math.floor(v / 4), off = (row & 1) * 4, col = Math.floor((u + off) / 8);
    const mortar = v % 4 === 0 || (u + off) % 8 === 0;
    if (mortar) return step(MAT.concrete, 0.3 + (mid - 0.5) * 0.2, x, y, 0.4);
    const b = hash(col, row, seed + 7);
    return step(R, 0.48 + (b - 0.5) * 0.4 + (big - 0.5) * 0.22 + (h > 0.93 ? 0.15 : 0) - (v < 8 ? 0.12 : 0), x, y, 0.5);
  }
  if (style === 'siding') {                                                   // painted wood siding, lit board edges
    const R = WALLC || MAT.stucco, b = v % 5;
    return step(R, 0.55 + (b === 4 ? 0.22 : b === 0 ? -0.3 : 0) + (big - 0.5) * 0.15 + (h > 0.97 ? -0.15 : 0), x, y, 0.4);
  }
  if (style === 'corrugated') {
    const R = WALLC || MAT.metal, r = u % 4;
    return step(R, 0.5 + (r === 0 ? 0.25 : r === 2 ? -0.22 : 0) + (big - 0.5) * 0.2 - (vnoise(u, v, 14, seed + 3) > 0.75 ? 0.2 : 0), x, y, 0.3);
  }
  if (style === 'stone') {
    const row = Math.floor(v / 7), off = (row & 1) * 9, col = Math.floor((u + off) / 18);
    if (v % 7 === 0 || (u + off) % 18 === 0) return step(MAT.stone, 0.22, x, y, 0.3);
    return step(WALLC || MAT.stone, 0.5 + (hash(col, row, seed) - 0.5) * 0.3 + (big - 0.5) * 0.15, x, y, 0.5);
  }
  if (style === 'glass') {
    const mull = u % 16 === 0 || v % 22 === 0;
    if (mull) return step(MAT.metalDark, 0.45, x, y, 0);
    return step(MAT.glass, 0.35 + ((u + (40 - v % 40)) % 40 < 8 ? 0.35 : 0) + (big - 0.5) * 0.2, x, y, 0.4);
  }
  const R = WALLC ? WALLC : style === 'diner' ? MAT.diner : style === 'purple' ? MAT.stuccoPurple : style === 'peach' ? MAT.stuccoPeach : style === 'teal' ? MAT.stuccoTeal : style === 'concrete' ? MAT.concrete : MAT.stucco;
  let t = 0.55 + (big - 0.5) * 0.22 + (mid - 0.5) * 0.12 + (h > 0.95 ? 0.1 : 0) - (h < 0.03 ? 0.12 : 0);
  if (v < 6) t -= 0.12 * (1 - v / 6);
  return step(R, t, x, y, 0.7);
}

const GLASS_WARM = ramp('#4a4038', 6, 3);     // glass with a warm room behind it (glowOnly mode)
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
    if (lit && GLOW_ONLY) {
      c = step(warm ? GLASS_WARM : MAT.glassDark, 0.34 + (streak ? 0.38 : 0) + (y < 3 ? 0.14 : 0), X, Y, 0.4);
      const e = warm ? [255, 196, 118] : [176, 212, 244];
      glow(G, X, Y, [e[0], e[1], e[2], 114 + (y / h) * 66]);
    } else if (lit) {
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
function balconyRail(G, x0, yb, len, seed) {
  for (let x = 0; x < len; x++) {
    for (let k = 0; k < 3; k++) setC(G, x0 + x, yb - k, k === 0 ? MAT.stone[1] : MAT.stone[k === 1 ? 3 : 4]);   // slab edge
    setC(G, x0 + x, yb - 12, MAT.metalDark[3]); setC(G, x0 + x, yb - 11, MAT.metalDark[1]);
    if (x % 3 === 0) for (let k = 3; k < 11; k++) setC(G, x0 + x, yb - k, MAT.metalDark[1]);
  }
  if (hash(x0, yb, seed) > 0.4) for (let k = 0; k < 18; k++) { const lx = x0 + 3 + Math.floor(hash(k, 1, seed) * (len - 6)), ly = yb - 4 - Math.floor(hash(k, 2, seed) * 9); setC(G, lx, ly, MAT.leaf[2 + (k % 4)]); }
}
function acBox(G, x0, y0) { for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) setC(G, x0 + x, y0 + y, y === 0 ? MAT.metal[5] : x === 12 || y === 8 ? MAT.metal[1] : (y > 2 && x > 1 && x < 11 && y % 2 === 0) ? MAT.metal[2] : MAT.metal[3]); }

export function makeBuilding(spec) {
  const { w, d } = spec, seed = spec.seed || 1, style = spec.style || 'stucco';
  WALLC = spec.wallColor ? ramp(spec.wallColor, 6, 3) : null;
  GLOW_ONLY = !!spec.glowOnly;
  const floors = spec.floors || 1, gH = spec.groundH ?? (spec.shop ? SHOP_FLOOR : FLOOR), cornice = style === 'brick' ? 10 : 6;
  const H = buildingH(spec);
  const G = new GBuf(w, d + H);
  G.ax = 0; G.ay = d + H;
  const night = spec.night || 0;
  // ---- roof
  if (spec.roofMat && spec.roof !== 'tile' && !spec.pitch) roofDeck(G, spec, w, d, H, seed, style);
  else if (spec.roof === 'tile') {
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
  const NB = noiseField(w, H + 1, 30, 30, seed), NM = noiseField(w, H + 1, 8, 8, seed + 1);
  for (let r = 0; r < H; r++) for (let x = 0; x < w; x++) {
    const y = d + r, v = H - r;
    G.put(x, y, wallColor(style, x, v, seed, x, y, NB[v * w + x], NM[v * w + x]), S_N, v, null, 0);
    // office towers: some panes lit after dark (glowOnly: whole office floors lit, a few late panes elsewhere)
    if (style === 'glass' && night > 0 && v > gH && x % 16 && v % 22) {
      const fl = Math.floor(v / 22), pane = x >> 4, j = (y * G.w + x) * 4;
      if (GLOW_ONLY) {
        const on = hash(fl, 3, seed + 5) < night * 0.22 ? hash(pane, fl, seed + 6) < 0.7 : hash(pane, fl, seed + 7) < night * 0.07;
        if (on) { const k = v % 22 < 4 ? 0.8 : 1; G.col[j] = G.col[j] * 0.66 + 32 * k; G.col[j + 1] = G.col[j + 1] * 0.66 + 25 * k; G.col[j + 2] = G.col[j + 2] * 0.62 + 12 * k; G.glow(x, y, [255, 210, 148, 54 + night * 30]); }
      } else if (hash(pane, fl, seed + 5) < night * night * 0.45) { G.col[j] = 236; G.col[j + 1] = 206; G.col[j + 2] = 140; G.glow(x, y, [255, 214, 150, 70 + night * 60]); }
    }
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
  for (let f = 1; f < floors && style !== 'glass'; f++) {
    const base = gH + (f - 1) * FLOOR;
    const ww = style === 'brick' ? 18 : 16, wh = style === 'brick' ? 30 : 26, gap = style === 'brick' ? 20 : 22;
    const n = Math.max(1, Math.floor((w - 16) / (ww + gap)));
    const span = n * ww + (n - 1) * gap, x0 = Math.floor((w - span) / 2);
    for (let i = 0; i < n; i++) {
      const px = x0 + i * (ww + gap), py = fy(base + 12 + wh);
      const lit = hash(i, f, seed + 13) < night * 0.75 + (night > 0 ? 0.08 : 0);
      if (spec.boarded && hash(i, f, seed + 41) < spec.boarded) { boards(G, px, py, ww, wh, seed + i * 5 + f); continue; }
      sash(G, px, py, ww, wh, lit, seed + f * 7 + i);
      if (spec.shutters) shutters(G, px, py, ww, wh, spec.shutters);
      if (spec.balconies) balconyRail(G, px - 6, py + wh + 3, ww + 12, seed + i * 3 + f);
      else if (hash(i, f, seed + 21) > 0.62) windowBox(G, px, py + wh + 2, ww, seed + i);
      else if (hash(i, f, seed + 23) > 0.82) acBox(G, px + 1, py + wh - 8);
    }
  }
  // stone band over the ground floor
  if (style === 'brick' && floors > 1 && gH > 0) for (let k = 0; k < 4; k++) for (let x = 0; x < w; x++) setC(G, x, fy(gH + 2 - k), step(MAT.stone, 0.8 - k * 0.15, x, k, 0.3));
  // ---- ground floor
  if (spec.blank) { /* a plain wall: no doors or windows */ }
  else if (spec.shop) storefront(G, w, d, H, gH, spec, seed, night, fy);
  else if (spec.doors) {
    for (const dd of spec.doors) {
      const dh = dd.h || (dd.kind === 'garage' || dd.kind === 'roller' ? 48 : 46);
      if (dd.kind === 'garage' || dd.kind === 'roller') bigDoor(G, dd.x, fy(dh), dd.w, dh, dd.kind, dd.open, night);
      else door(G, dd.x, fy(dh), dd.w || 18, dh, !!dd.open, night, seed);
    }
    for (const wx of spec.windows || []) {
      if (spec.boarded && hash(wx, 7, seed) < spec.boarded) { boards(G, wx, fy(42), 16, 24, seed + wx); continue; }
      sash(G, wx, fy(42), 16, 24, hash(wx, 0, seed) < night * 0.6, seed + wx);
      if (spec.shutters) shutters(G, wx, fy(42), 16, 24, spec.shutters);
    }
    if (spec.porchLight) for (const dd of spec.doors) if (dd.kind !== 'garage' && dd.kind !== 'roller') { const lx = dd.x + (dd.w || 18) + 3, ly = fy(36); for (let k = 0; k < 4; k++) for (let q = 0; q < 3; q++) { setC(G, lx + q, ly + k, k === 0 ? MAT.metalDark[1] : [250, 226, 160]); if (k) glow(G, lx + q, ly + k, [255, 210, 140, 120 + night * 135]); } }
  } else {
    const dx = Math.floor(w * 0.22);
    door(G, dx, fy(46), 18, 46, false, night, seed, true);
    for (let k = 0; k < 3; k++) for (let x = -3; x < 21; x++) setC(G, dx + x, fy(3 - k), step(MAT.stone, 0.7 - k * 0.15, x, k, 0.3));   // stoop
    sash(G, w - 34, fy(40), 16, 22, hash(0, 0, seed) < night * 0.6, seed + 3);
    sash(G, Math.floor(w * 0.52), fy(40), 16, 22, hash(1, 0, seed) < night * 0.6, seed + 4);
  }
  if (spec.grime) grime(G, w, d, H, spec.grime, seed);
  if (spec.fireEscape) fireEscape(G, spec.fireEscape, d + H, gH, floors, seed);
  if (spec.graffiti) for (let i = 0; i < spec.graffiti; i++) tag(G, Math.floor(hash(i, 1, seed + 61) * Math.max(1, w - 60)) + 4, d + H - 10 - Math.floor(hash(i, 2, seed + 61) * 18), seed + i * 17, spec.tagText && i === 0 ? spec.tagText : null);
  if (spec.ivy) ivy(G, w, d, H, spec.ivy, seed);
  if (spec.mural) mural(G, spec.mural, d + H, seed);
  if (spec.portico) portico(G, spec.portico, d, H, cornice);
  for (const a of spec.arches || []) arch(G, a, d + H, night, seed);
  if (spec.rose) rose(G, spec.rose.x, d + H - spec.rose.v, spec.rose.r || 14, night);
  for (const pq of spec.plaques || []) plaque(G, pq, d + H, night);
  for (const bl of spec.blades || []) blade(G, bl, d + H, night);
  if (spec.cross) redCross(G, spec.cross.x, d + H - spec.cross.v, spec.cross.s || 22, night);
  if (spec.neon) neonIcon(G, spec.neon.x ?? Math.floor(w / 2) - 14, d - 6 + (spec.neon.y || 0), spec.neon.icon || 'cup', spec.neon.col, night);
  return spec.pitch ? pitched(G, spec, w, d, H, seed) : G;
}

// ---- flat roof decks (spec.roofMat) ------------------------------------------------------------------
const DECK = { tar: ramp('#615c5c', 6, 3), gravel: ramp('#7c756c', 6, 3), membrane: ramp('#a29f99', 6, 3), metal: ramp('#7a838c', 6, 3),
  paver: ramp('#908376', 6, 3), deck: MAT.woodDock, green: ramp('#5a7a3c', 6, 3), rubber: ramp('#4c494c', 6, 3) };
const RUST = ramp('#8a5a3a', 6, 3), PAD = ramp('#b6b0a4', 6, 3);
const SEDUM = [ramp('#6e8e3a', 6, 3), ramp('#8e6c3a', 6, 3), ramp('#4a6e3c', 6, 3), ramp('#9a5c4c', 6, 3)];
// the parapet's coping: stone on brick and stone, metal on glass and sheds, the wall's own colour on render
function coping(style) {
  if (style === 'glass' || style === 'corrugated') return MAT.metal;
  if (style === 'concrete') return MAT.concrete;
  if (style === 'brick' || style === 'brickDark' || style === 'stone') return MAT.stone;
  return WALLC || MAT.stucco;
}
// The deck sits `lip` px below the parapet's top: rows y + lip of the sprite. Painter's order: the deck, then the
// north parapet's inner face (it faces the camera), then the coping all round (it covers the strip of deck
// hidden behind the south parapet); the south face drawn after covers the rest.
// vnoise (gbuf.js) over a whole w x h grid at once (x scale sx, y scale sy): the cell corners are hashed once
export function noiseField(w, h, sx, sy, seed) {
  const F = new Float32Array(w * h), cw = Math.floor((w - 1) / sx) + 2, chh = Math.floor((h - 1) / sy) + 2, C = new Float32Array(cw * chh);
  for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) C[j * cw + i] = hash(i, j, seed);
  for (let y = 0; y < h; y++) {
    const fy = y / sy, iy = Math.floor(fy); let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    const r0 = iy * cw, r1 = r0 + cw;
    for (let x = 0; x < w; x++) {
      const fx = x / sx, ix = Math.floor(fx); let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      const a = C[r0 + ix], b = C[r0 + ix + 1], c = C[r1 + ix], d = C[r1 + ix + 1];
      F[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return F;
}
function roofDeck(G, spec, w, d, H, seed, style) {
  const mat = spec.roofMat, L = Math.max(0, spec.lip ?? 6), rw = Math.max(2, spec.rimW ?? 4), zD = H - L, C = coping(style);
  const rn = (i, k) => hash(i, k, seed + 313), iw = w - 2 * rw, id = d - 2 * rw;
  if (iw > 0 && id > 0) {
    // per deck pixel: a shade (T) and which ramp (RI: 0 the material, 1 rust, 2 walkway pads, 3 gravel, 4-7 sedum)
    const RS = [DECK[mat] || DECK.tar, RUST, PAD, DECK.gravel, SEDUM[0], SEDUM[1], SEDUM[2], SEDUM[3]], DI = [mat === 'gravel' || mat === 'paver' ? 0.3 : 0.5, 0.5, 0.5, 0.3, 0.6, 0.6, 0.6, 0.6];
    const T = new Float32Array(iw * id), RI = new Uint8Array(iw * id), F = (sx, sy, s) => noiseField(w, d, sx, sy, s);
    const each = (fn) => { for (let v = 0, i = 0; v < id; v++) for (let u = 0; u < iw; u++, i++) fn(u, v, i, u + rw, v + rw); };
    switch (mat) {
      case 'gravel': { const A = F(4, 4, seed + 5), B = F(40, 40, seed); each((u, v, i, x, y) => { const j = y * w + x, h1 = hash(x, y, seed + 2); T[i] = 0.46 + (A[j] - 0.5) * 0.3 + (h1 > 0.82 ? 0.22 : h1 < 0.14 ? -0.22 : 0) + (B[j] - 0.5) * 0.12; }); break; }
      case 'membrane': { const A = F(30, 30, seed + 4); each((u, v, i, x, y) => { const h1 = hash(x, y, seed + 2), s = u % 46; T[i] = 0.56 + (A[y * w + x] - 0.5) * 0.12 + (h1 > 0.97 ? 0.08 : 0) + (s === 0 ? 0.12 : s === 1 ? -0.08 : 0); }); break; }
      case 'metal': {
        const A = F(26, 26, seed), B = F(10, 42, seed + 9);
        each((u, v, i, x, y) => { const r = u % 9, j = y * w + x; T[i] = 0.5 + (r === 0 ? 0.3 : r === 1 ? 0.14 : r === 8 ? -0.2 : 0) + (A[j] - 0.5) * 0.14 + (v % 120 === 0 ? -0.15 : 0); if (r > 1 && r < 8 && B[j] > 0.9 && hash(x, y, seed + 2) > 0.45) { RI[i] = 1; T[i] -= 0.12; } });
        break;
      }
      case 'paver': each((u, v, i) => { const px = u % 20, py = v % 20; T[i] = px === 0 || py === 0 ? 0.24 : 0.5 + (hash(Math.floor(u / 20), Math.floor(v / 20), seed) - 0.5) * 0.24 + (px === 1 || py === 1 ? 0.06 : 0); }); break;
      case 'deck': each((u, v, i) => { const pl = v % 6; T[i] = 0.55 + (hash(Math.floor(u / 48 + (Math.floor(v / 6) & 1) * 0.5), Math.floor(v / 6), seed) - 0.5) * 0.25 + (pl === 0 ? -0.3 : pl === 1 ? 0.08 : 0); }); break;
      case 'green': {                                                          // a sedum mat, a gravel margin and one service path
        const A = F(9, 9, seed + 8), B = F(4, 4, seed + 7);
        each((u, v, i, x, y) => {
          const h1 = hash(x, y, seed + 2);
          if (Math.min(u, v, iw - 1 - u, id - 1 - v) < 7 || Math.abs(u - (iw >> 1)) < 4) { RI[i] = 3; T[i] = 0.5 + (h1 > 0.8 ? 0.2 : h1 < 0.15 ? -0.2 : 0); return; }
          const j = y * w + x, pv = A[j], tuft = hash(x >> 1, y >> 1, seed + 6);
          RI[i] = h1 > 0.985 ? 7 : pv > 0.72 ? 6 : pv < 0.2 && tuft > 0.5 ? 5 : 4; T[i] = h1 > 0.985 ? 0.75 : 0.42 + (tuft - 0.5) * 0.3 + (B[j] - 0.5) * 0.2;
        });
        break;
      }
      default: {                                                               // tar, rubber: lapped sheets, stains
        const A = F(22, 22, seed + 4), B = F(12, 12, seed + 9);
        each((u, v, i, x, y) => { const j = y * w + x, h1 = hash(x, y, seed + 2), s = v % 32; T[i] = 0.5 + (A[j] - 0.5) * 0.18 + (h1 > 0.96 ? 0.1 : h1 < 0.03 ? -0.1 : 0) + (s === 0 ? 0.13 : s === 1 ? -0.09 : 0) - (B[j] > 0.8 ? 0.08 : 0); });
      }
    }
    // patches of newer membrane, drains with ponding stains round them, walkway pads
    const np = mat === 'tar' || mat === 'rubber' || mat === 'membrane' ? Math.round(w * d / 15000) : 0;
    for (let k = 0; k < np; k++) {
      const pw = 16 + rn(k, 1) * 40 | 0, ph = 12 + rn(k, 2) * 30 | 0; if (iw - 12 - pw <= 0 || id - 12 - ph <= 0) continue;
      const pu = 6 + rn(k, 3) * (iw - 12 - pw) | 0, pv = 6 + rn(k, 4) * (id - 12 - ph) | 0;
      for (let v = pv; v < pv + ph; v++) for (let u = pu; u < pu + pw; u++) T[v * iw + u] += u === pu || v === pv ? 0.14 : -0.06;
    }
    const nd = mat === 'green' || mat === 'deck' || iw < 40 || id < 40 ? 0 : 1 + Math.round(w * d / 40000);
    for (let k = 0; k < nd; k++) {
      const du = 12 + rn(k, 5) * (iw - 24) | 0, dv = 12 + rn(k, 6) * (id - 24) | 0;
      for (let v = Math.max(0, dv - 13); v <= Math.min(id - 1, dv + 13); v++) for (let u = Math.max(0, du - 13); u <= Math.min(iw - 1, du + 13); u++) { const dd = Math.sqrt((u - du) * (u - du) + (v - dv) * (v - dv)); if (dd < 14) T[v * iw + u] -= dd < 2.5 ? 0.45 : (1 - dd / 14) * 0.14; }
    }
    for (const [px, py, pw, ph] of spec.pads || []) for (let y = Math.max(rw, py); y < Math.min(d - rw, py + ph); y++) for (let x = Math.max(rw, px); x < Math.min(w - rw, px + pw); x++) {
      const i = (y - rw) * iw + x - rw, a = (x - px) % 14, b = (y - py) % 14; RI[i] = 2; T[i] = a > 11 || b > 11 ? 0.2 : 0.55 + (a === 0 || b === 0 ? 0.12 : 0);
    }
    for (let v = 0, i = 0; v < id; v++) for (let u = 0; u < iw; u++, i++) {
      const x = u + rw, y = v + rw, e = Math.min(v, u, iw - 1 - u), ri = RI[i];             // the parapets' inner shadow
      G.put(x, y + L, step(RS[ri], T[i] - (e < 6 && L > 0 ? (6 - e) * 0.03 : 0), x, y, DI[ri]), UP, zD, null, 0);
    }
  }
  for (let k = 0; k < L; k++) for (let x = rw; x < w - rw; x++) {
    let c = wallColor(style === 'glass' ? 'concrete' : style, x, L - k + 3, seed, x, rw + k);
    if (k === L - 1) c = c.map((q) => q * 0.72);
    G.put(x, rw + k, c, S_N, H - k, null, 0);
  }
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    if (x >= rw && y >= rw && x < w - rw && y < d - rw) continue;
    const outer = x === 0 || y === 0 || x === w - 1 || y === d - 1, inner = x === rw - 1 || y === rw - 1 || x === w - rw || y === d - rw;
    G.put(x, y, step(C, outer ? 0.86 : inner ? 0.42 : 0.66 + (hash(x >> 3, y >> 3, seed) - 0.5) * 0.1, x, y, 0.3), UP, H, null, 0);
  }
}

// A hip or gable roof over the walls. Each roof pixel stands q * k above the eaves (q = its distance
// in from the nearest eave), drawn north to south so nearer slopes cover farther ones; each face is
// shaded by which way it slopes, with shingle courses or barrel tiles running along it.
function pitched(G0, spec, w, d, H, seed) {
  const k = spec.slope ?? 0.75, gable = spec.pitch === 'gable', ns = gable && spec.ridge === 'ns';
  const E = Math.ceil((ns ? w / 2 : gable ? d / 2 : Math.min(w, d) / 2) * k) + 2;
  const G = new GBuf(w, G0.h + E);
  G.ax = 0; G.ay = G0.ay + E;
  G.blit(G0, 0, E);
  const R = spec.roofColor ? ramp(spec.roofColor, 6, 3) : spec.roof === 'tile' ? MAT.terracotta : MAT.roofShingle || ramp('#5a5c66', 6, 3);
  const tile = spec.roof === 'tile';
  const FACE = { w: [-0.7, 0, 0.7], e: [0.7, 0, 0.7], n: [0, -0.7, 0.7], s: [0, 0.7, 0.7] };
  const LIT = { w: 0.68, n: 0.58, s: 0.5, e: 0.32 };
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const dW = x, dE = w - 1 - x, dN = y, dS = d - 1 - y;
    let q, f;
    if (ns) { q = Math.min(dW, dE); f = dW < dE ? 'w' : 'e'; }
    else if (gable) { q = Math.min(dN, dS); f = dN < dS ? 'n' : 's'; }
    else { q = Math.min(dW, dE, dN, dS); f = q === dS ? 's' : q === dN ? 'n' : q === dW ? 'w' : 'e'; }
    const z = q * k, row = Math.round(E + y - z);
    // courses run parallel to the eave: shingle tabs in staggered courses of 4, tiles as barrels across
    const along = f === 'n' || f === 's' ? x : y, course = Math.floor(q / 4);
    let t = LIT[f] + (vnoise(x, y, 13, seed) - 0.5) * 0.14;
    if (tile) {                                                                         // barrel tiles: courses, gaps, odd tiles, weathering
      const th = hash(Math.floor((along + (course & 1) * 3) / 6), course, seed + 5);
      t += (q % 4 === 0 ? -0.24 : q % 4 === 1 ? 0.06 : 0) + ((along + (course & 1) * 3) % 6 < 2 ? -0.18 : (along % 6 === 3 ? 0.1 : 0)) + (th - 0.5) * 0.14 + (th > 0.96 ? -0.22 : 0) - (vnoise(x, y, 7, seed + 11) > 0.72 ? 0.1 : 0);
    }
    else {
      const qc = q % 4, tab = Math.floor((along + (course & 1) * 4) / 8), th = hash(tab, course, seed);
      t += (qc === 0 ? -0.3 : qc === 1 ? 0.07 : 0) + ((along + (course & 1) * 4) % 8 === 0 && qc ? -0.16 : 0) + th * 0.16 - 0.08 + (th > 0.95 ? 0.14 : th < 0.04 ? -0.16 : 0);
    }
    const ridge = ns ? Math.abs(dW - dE) <= 1 : gable ? Math.abs(dN - dS) <= 1 : (Math.abs(dN - dS) <= 1 && q === Math.min(dN, dS)) || (q > 2 && Math.abs(Math.min(dW, dE) - Math.min(dN, dS)) < 0.6);
    if (ridge) t += 0.2;
    if (q < 2) t -= 0.14;                                                               // eave shadow line
    let c = step(R, t, x, row, 0.45), fl = 0;
    // solar panels on the sunny slope, a skylight on another (spec.solar, spec.skylight)
    if (spec.solar && f === (ns ? 'w' : 's')) {
      const span = ns ? d : w, a0 = Math.round(span * 0.16), a1 = Math.round(span * 0.56), q0 = 4, q1 = Math.min(Math.round(E / k) - 6, 40);
      if (along >= a0 && along < a1 && q >= q0 && q < q1) { const fr = along === a0 || along === a1 - 1 || q === q0 || q === q1 - 1; c = fr ? MAT.metal[4] : (along - a0) % 7 === 0 || (q - q0) % 9 === 0 ? [74, 88, 112] : ((along + q) % 11 < 2 ? [70, 92, 136] : [38, 52, 86]); fl = F_GLASS; }
    }
    if (spec.skylight && f === (ns ? 'e' : 'n')) {
      const span = ns ? d : w, a0 = Math.round(span * 0.62), q0 = 6;
      if (along >= a0 && along < a0 + 14 && q >= q0 && q < q0 + 11) { const fr = along === a0 || along === a0 + 13 || q === q0 || q === q0 + 10; c = fr ? MAT.metalDark[3] : step(MAT.glass, 0.35 + ((along + q) % 6 < 2 ? 0.3 : 0), x, row, 0); fl = F_GLASS; }
    }
    for (let r = row; r <= row + (f === 's' ? 1 : 0); r++) G.put(x, r, c, FACE[f], H + z, null, fl);
  }
  // the gable end over the front wall (ridge running north-south): a triangle of wall with a round vent
  if (ns) for (let x = 0; x < w; x++) {
    const top = Math.round(E + d - 1 - Math.min(x, w - 1 - x) * k);
    for (let r = top + 1; r < E + d; r++) {
      const v = H + (E + d - r);
      let c = wallColor(spec.style || 'stucco', x, v, seed, x, r);
      if (Math.hypot(x - w / 2, r - (E + d - (w / 2) * k * 0.45)) < 4) c = Math.hypot(x - w / 2, r - (E + d - (w / 2) * k * 0.45)) < 3 ? MAT.glassDark[2] : MAT.stone[4];
      G.put(x, r, c, [0, 1, 0], v, null, 0);
    }
  }
  // a chimney on some houses
  if (spec.chimney) { const cx = Math.floor(w * 0.7), cy = Math.floor(d * 0.35), q = Math.min(cx, w - cx, cy, d - cy) * k; for (let yy = 0; yy < 14; yy++) for (let xx = 0; xx < 8; xx++) G.put(cx + xx, Math.round(E + cy - q - 10 + yy), step(MAT.brick, xx < 2 ? 0.7 : 0.45, xx, yy, 0.3), [0, 1, 0], H + q + 10, null, 0); }
  return G;
}

// garage door (panels) or roller shutter (slats); open shows the lit garage inside
function bigDoor(G, x0, y0, w, h, kind, open, night) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (x < 2 || x >= w - 2 || y < 2) { setC(G, X, Y, step(MAT.stone, x < 2 || y < 2 ? 0.7 : 0.45, X, Y, 0)); continue; }
    if (open && y > h * 0.25) {
      // a dim garage: shelves at the back, the rear of a parked car
      let c = step(ramp('#7a6a58', 5, 2), 0.2 + (y / h) * 0.35 + ((y - Math.round(h * 0.25)) % 7 === 0 && y < h * 0.6 ? 0.2 : 0), X, Y, 0.7);
      const cx = x - w / 2, cy = y - h * 0.62;
      if (Math.abs(cx) < w * 0.36 && cy > -h * 0.2 && cy < h * 0.32) { c = step(ramp('#6a6e78', 5, 2), 0.45 - cy / h, X, Y, 0.4); if (Math.abs(Math.abs(cx) - w * 0.28) < 3 && Math.abs(cy) < 2) c = [200, 40, 36]; if (cy < -h * 0.08) c = step(MAT.glassDark, 0.4, X, Y, 0.3); }
      setC(G, X, Y, c); G.glow(X, Y, [255, 196, 120, 6 + night * 40]); continue;
    }
    const c = kind === 'roller' ? step(MAT.metal, y % 3 === 0 ? 0.25 : 0.55, X, Y, 0.3) : step(ramp('#e2e0d8', 6, 3), (y % 10 === 0 || (x - 2) % Math.max(8, Math.floor(w / 4)) === 0) ? 0.3 : 0.6, X, Y, 0.3);
    setC(G, X, Y, c);
  }
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
  const doorW = shop.doorW || 22, doorX = shop.door === 'right' ? w - doorW - 10 : shop.door === 'left' ? 10 : (shop.door | 0);
  // windows with the interior
  for (let y = winTop; y < winBot; y++) for (let x = 4; x < w - 4; x++) {
    if (x >= doorX - 2 && x < doorX + doorW + 2) continue;
    const mull = (x - 4) % 30 === 0 || y === winTop || y === winBot - 1;
    if (mull) { setC(G, x, y, step(MAT.metalDark, y === winTop ? 0.25 : 0.55, x, y, 0)); continue; }
    const iy = y - winTop, H2 = winBot - winTop;
    let c;
    if (shop.kind === 'arcade') {                                                                   // arcade cabinets with glowing screens
      c = step(ramp('#3a2a5a', 5, 2), 0.3 + (iy / H2) * 0.3, x, y, 0.8);
      const cab = Math.floor((x - 4) / 16), lx = (x - 4) % 16;
      if (lx > 2 && lx < 13 && iy > H2 * 0.2) { const hue = [[255, 80, 200], [80, 220, 255], [255, 220, 80], [120, 255, 140]][cab % 4]; c = iy < H2 * 0.55 && lx > 4 && lx < 11 ? hue : [40, 30, 60]; if (iy < H2 * 0.55 && lx > 4 && lx < 11) glow(G, x, y, [...hue, 100 + night * 120]); }
    } else if (shop.kind === 'bar') {                                                               // a dim bar: a pool table, bottles, warm lamps
      c = step(ramp('#6a4228', 5, 2), 0.3 + (iy / H2) * 0.3, x, y, 0.8);
      if (iy < 4 && (x % 30) < 8) c = [255, 210, 130];
      if (iy > H2 * 0.55 && iy < H2 * 0.8 && Math.abs(((x - 4) % 60) - 30) < 16) c = (Math.abs(((x - 4) % 60) - 30) > 13 || iy < H2 * 0.58 || iy > H2 * 0.77) ? [90, 56, 30] : [40, 120, 70];
      if (iy > H2 * 0.15 && iy < H2 * 0.4 && x % 3 === 0 && (x % 60) > 40) c = [[60, 130, 70], [150, 90, 40], [200, 200, 210]][x % 9 / 3 | 0];
    } else if (shop.kind === 'lobby') {                                                                    // hotel lobby: marble, gold light
      c = step(ramp('#d8b07a', 5, 2), 0.5 + (iy / H2) * 0.3 + ((x >> 3) % 3 === 0 ? -0.1 : 0), x, y, 0.8);
      if (iy < 3) c = step(ramp('#f4e2b0', 5, 2), 0.8, x, y, 0);
      if (iy > 3 && iy < 9 && Math.abs(((x - 4) % 60) - 30) < 6 - (iy - 3)) c = [255, 236, 170];   // chandeliers
      if (iy > H2 * 0.7) c = step(ramp('#7a5236', 5, 2), 0.5, x, y, 0.4);                           // desk / floor
    } else if (shop.kind === 'liquor') {                                                            // rows of bottles
      c = step(ramp('#6a5a4a', 5, 2), 0.35 + (iy / H2) * 0.3, x, y, 0.8);
      const shelf = iy % 11;
      if (shelf === 0) c = MAT.metal[3];
      else if (shelf > 2 && (x % 3) < 2) { const g = hash(x >> 1, (iy / 11) | 0, seed + 3); const B = g > 0.75 ? [60, 130, 70] : g > 0.5 ? [150, 90, 40] : g > 0.3 ? [210, 160, 60] : g > 0.15 ? [200, 210, 214] : [120, 40, 50]; c = shelf === 6 ? [230, 226, 210] : shelf < 4 ? B.map((v) => v * 0.7) : B; }
    } else if (shop.kind === 'pawn') {                                                              // guitars, TVs, gold
      c = step(ramp('#7a6a58', 5, 2), 0.35 + (iy / H2) * 0.3, x, y, 0.8);
      const cell = Math.floor((x - 4) / 14), row = Math.floor(iy / 14), g = hash(cell, row, seed + 5), lx = (x - 4) % 14, ly = iy % 14;
      if (ly === 0) c = MAT.metalDark[3];
      else if (g > 0.66 && lx > 2 && lx < 12 && ly > 2 && ly < 11) { c = (lx === 3 || ly === 3 || lx === 11 || ly === 10) ? [40, 40, 46] : [70, 120, 170]; if (c[2] === 170) glow(G, x, y, [120, 180, 255, 60 + night * 80]); }
      else if (g > 0.4 && Math.abs(lx - 7) < (ly > 7 ? 4 : 2) && ly > 1) c = ly < 7 ? [96, 60, 36] : [176, 100, 44];
      else if (g < 0.15 && ly > 8 && (x + iy) % 3 === 0) c = [240, 206, 90];
    } else if (shop.kind === 'diner' || shop.kind === 'cafe') {
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
  // security grille over the glass (bars), and a neon OPEN sign in the window
  if (shop.grille) for (let y = winTop; y < winBot; y++) for (let x = 4; x < w - 4; x++) {
    if (x >= doorX - 2 && x < doorX + doorW + 2) continue;
    if ((x - 4) % 5 === 0 || (y - winTop) % 15 === 0) setC(G, x, y, step(MAT.metalDark, (x - 4) % 5 === 0 ? 0.55 : 0.75, x, y, 0));
  }
  if (shop.openSign) {
    const ox = shop.openSign.x ?? (shop.door === 'right' ? doorX - 30 : doorX + doorW + 8), oy = winTop + 6, col = shop.openSign.col || [255, 60, 70];
    for (let y = -2; y < 9; y++) for (let x = -2; x < 18; x++) if (y === -2 || y === 8 || x === -2 || x === 17) { setC(G, ox + x, oy + y, [70, 140, 255]); glow(G, ox + x, oy + y, [70, 140, 255, 140 + night * 115]); }
    drawText((px, py) => { setC(G, px, py, col.map((v) => Math.min(255, v * 0.6 + 110))); glow(G, px, py, [...col, 170 + night * 85]); }, 'OPEN', ox, oy, { sx: 1, gap: 1 });
  }
  // people inside the windows (busts), and the clerk at the counter
  const people = shop.people ?? (shop.kind === 'diner' ? 4 : 0);
  for (let i = 0; i < people; i++) { const px = 16 + ((i * 37 + seed * 11) % Math.max(20, w - 40)); if (px > doorX - 12 && px < doorX + doorW + 12) continue; bust(G, px, winTop + 10, [ [180, 60, 60], [60, 110, 180], [230, 200, 80], [90, 150, 90] ][i % 4], seed + i * 3, 0.8); }
  if (shop.clerk !== false && shop.kind !== 'diner') bust(G, shop.door === 'right' ? doorX - 30 : doorX + doorW + 30, winTop + 9, shop.clerkShirt || [40, 130, 110], seed + 99, 1);
  // stall riser under the windows
  for (let y = winBot; y < y0; y++) for (let x = 2; x < w - 2; x++) if (!(x >= doorX && x < doorX + doorW)) setC(G, x, y, step(shop.kind === 'diner' ? MAT.dinerRed : MAT.stone, 0.4 + (y === winBot ? 0.35 : 0), x, y, 0.4));
  door(G, doorX, y0 - 50, doorW, 50, shop.open !== false, night, seed);
  if (shop.sign) signBoard(G, shop.sign, shop.sign.x ?? 4, winTop - 24, shop.sign.w ?? w - 8, 22, night);
  // striped fascia band above the windows
  else if (shop.band) for (let y = winTop - 22; y < winTop - 2; y++) for (let x = 2; x < w - 2; x++) { const k = y - (winTop - 22); setC(G, x, y, k < 3 || k > 17 ? MAT.paintWhiteCar[k < 3 ? 4 : 2] : step(ramp(shop.band[Math.floor((k - 3) / 5) & 1], 5, 2), 0.6 - ((k - 3) % 5 === 4 ? 0.2 : 0), x, y, 0)); }
  // awning: sloped canvas strip, scalloped, in stripes
  if (shop.awning) {
    const [ca, cb] = shop.awning.map((h) => ramp(h, 6, 3));
    // its true height: it leaves the wall just above the windows and slopes down as it reaches out over
    // the pavement (so people under it are covered and it casts its shadow from the right height)
    const top = winTop - 2, depth = 13, vTop = y0 - top + 2;
    for (let y = 0; y < depth; y++) for (let x = 0; x < w; x++) {
      const Y = top + y, stripe = Math.floor(x / 6) % 2 === 1;
      G.put(x, Y, step(stripe ? cb : ca, 0.8 - y / depth * 0.4, x, Y, 0.5), [0, 0.6, 0.8], vTop - y * 0.3, null, 0);
    }
    for (let x = 0; x < w; x++) { const s = x % 6, len = s === 0 || s === 5 ? 1 : 3; const stripe = Math.floor(x / 6) % 2 === 1; for (let k = 0; k < len; k++) { const Y = top + depth + k; G.put(x, Y, step(stripe ? cb : ca, 0.3 - k * 0.06, x, Y, 0), [0, 1, 0.2], vTop - depth * 0.3 - k, null, 0); } }
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

// ---- weathering, graffiti and signs -----------------------------------------------------------------
// plywood boards nailed over a window
function boards(G, x0, y0, w, h, seed) {
  for (let y = -1; y < h + 1; y++) for (let x = -1; x < w + 1; x++) {
    const X = x0 + x, Y = y0 + y, plank = Math.floor((y + 1) / 6), ly = (y + 1) % 6;
    let t = 0.55 + (hash(plank, 0, seed) - 0.5) * 0.3 + (vnoise(X, Y, 5, seed) - 0.5) * 0.15;
    if (ly === 0) t -= 0.3; if (ly === 1) t += 0.1;
    if ((x === 1 || x === w - 2) && ly === 3) t = 0.05;                    // nail heads
    setC(G, X, Y, step(ramp('#a8865a', 6, 3), t, X, Y, 0.4));
  }
}
function shutters(G, x0, y0, w, h, color) {
  const R = ramp(color, 5, 2);
  for (const sx of [x0 - 7, x0 + w + 1]) for (let y = 0; y < h; y++) for (let x = 0; x < 6; x++) {
    const edge = x === 0 || x === 5 || y === 0 || y === h - 1;
    setC(G, sx + x, y0 + y, step(R, edge ? 0.25 : y % 3 === 0 ? 0.35 : 0.65, sx + x, y, 0));
  }
}
// streaks of dirt washing down from the roof and sills, and a grimy base
function grime(G, w, d, H, k, seed) {
  for (let x = 0; x < w; x++) {
    const streak = vnoise(x, 0, 3, seed + 71) > 1 - k * 0.45 ? vnoise(x, 1, 7, seed + 72) * H * 0.7 : 0;
    for (let r = 0; r < H; r++) {
      const Y = d + r, j = (Y * G.w + x) * 4;
      if (!G.col[j + 3] || (G.flag[Y * G.w + x] & F_GLASS)) continue;
      let m = 1;
      if (r < streak) m -= (1 - r / streak) * 0.22 * k;
      if (r > H - 12) m -= ((r - (H - 12)) / 12) * 0.25 * k;
      if (vnoise(x, r, 6, seed + 73) > 0.8) m -= 0.1 * k;
      G.col[j] *= m; G.col[j + 1] *= m; G.col[j + 2] *= m * 1.02;
    }
  }
}
const SPRAY = [[156, 92, 210], [70, 180, 200], [226, 80, 84], [244, 236, 224], [244, 206, 70], [96, 206, 120], [240, 120, 180]];
// a graffiti piece: bubble letters (text) or a scribbled tag, with outline, highlight and drips
function tag(G, x0, yb, seed, text) {
  const W = 96, Hh = 34, M = new Uint8Array(W * Hh);
  const disc = (cx, cy, r) => { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if (x >= 0 && y >= 0 && x < W && y < Hh && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) M[y * W + x] = 1; };
  if (text) {
    const sx = Math.min(5, Math.floor((W - 8) / Math.max(1, text.length * 4)));
    drawText((px, py) => disc(px + 0.5, py + 0.5 + Math.sin(px * 0.3 + seed) * 1.5, sx * 0.62), text, 4, 4, { sx, sy: 5, gap: 1 });
  } else {
    let x = 6, y = 18;
    const n = 30 + Math.floor(hash(seed, 1, 3) * 30);
    for (let i = 0; i < n; i++) { const a = Math.sin(i * 0.7 + seed) * 1.9 + (hash(i, seed, 5) - 0.5) * 1.5; x += 2.2; y += Math.sin(a) * 3.2; y = Math.max(6, Math.min(Hh - 8, y)); disc(x, y, 2 + (i % 9 === 0 ? 1.5 : 0)); if (x > W - 10) break; }
  }
  const fill = SPRAY[Math.floor(hash(seed, 2, 7) * SPRAY.length)], line = [28, 22, 38], hi = fill.map((v) => Math.min(255, v + 70));
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && M[y * W + x];
  for (let y = -1; y < Hh + 6; y++) for (let x = -1; x <= W; x++) {
    const X = x0 + x, Y = yb - Hh + y;
    if (!G.inside(X, Y) || !G.col[(Y * G.w + X) * 4 + 3] || (G.flag[Y * G.w + X] & F_GLASS)) continue;
    let c = null;
    if (at(x, y)) c = !at(x - 1, y - 1) ? hi : step(ramp(fill, 5, 2), 0.7 - y / Hh * 0.35, X, Y, 0.5);
    else if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) c = line;
    else if (y >= Hh - 6 && hash(x, 0, seed) > 0.86 && at(x, Hh - 8) && y < Hh - 6 + hash(x, 1, seed) * 10) c = fill;   // drips
    if (c) setC(G, X, Y, c);
  }
}
// ivy climbing from the pavement and trailing from the roofline
function ivy(G, w, d, H, k, seed) {
  const leaf = (X, Y) => { if (!G.inside(X, Y) || !G.col[(Y * G.w + X) * 4 + 3]) return; setC(G, X, Y, MAT.leaf[Math.min(6, 1 + Math.floor(hash(X, Y, seed) * 4))]); setN(G, X, Y, [0, 0.75, 0.66]); G.flag[Y * G.w + X] |= F_LEAF; };
  const n = Math.round(w / 60 * k * 3) + 1;
  for (let v = 0; v < n; v++) {
    let x = hash(v, 1, seed + 81) * w, y = d + H - 1;
    const up = H * (0.35 + hash(v, 2, seed + 81) * 0.6);
    for (let s = 0; s < up; s++) {
      x += (hash(s, v, seed + 82) - 0.5) * 1.6; y -= 1;
      for (let q = 0; q < 3; q++) if (hash(s, q, seed + v) > 0.45) leaf(Math.round(x + (hash(q, s, v) - 0.5) * 7), Math.round(y + (hash(s, q, 9) - 0.5) * 3));
    }
  }
  for (let x = 0; x < w; x++) if (vnoise(x, 0, 9, seed + 83) > 1 - k * 0.6) { const len = vnoise(x, 2, 4, seed + 84) * 26 * k; for (let r = 0; r < len; r++) if (hash(x, r, seed) > 0.25) leaf(x, d + 8 + r); }
}
// a painted mural: a sunset with palms (x, w on the facade, h tall, standing on the pavement)
function mural(G, m, yGround, seed) {
  const { x: x0, w, h } = m;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = yGround - h + y, t = y / h;
    let c = t < 0.6 ? [255 - t * 120, 120 + t * 80, 140 - t * 60] : [70, 50 + t * 40, 110];
    const sun = Math.hypot(x - w * 0.6, y - h * 0.58);
    if (sun < h * 0.22 && t < 0.62) c = [255, 210 - sun, 90];
    if (t > 0.6 && t < 0.63) c = [255, 170, 90];
    for (const px of [w * 0.2, w * 0.82]) { if (Math.abs(x - px - (h - y) * 0.08) < 1.5 && t > 0.3) c = [30, 24, 40]; if (Math.abs(y - h * 0.3) < 4 - Math.abs(x - px) * 0.25 && Math.abs(x - px) < 14) c = [30, 24, 40]; }
    if (m.text && t > 0.72) c = [44, 30, 70];
    setC(G, X, Y, c.map((v) => Math.max(0, Math.min(255, v | 0))));
  }
  if (m.text) drawText((px, py) => setC(G, px, py, [250, 236, 210]), m.text, x0 + 6, yGround - Math.round(h * 0.24), { sx: 2, sy: 2, gap: 1 });
}
// a shop sign board with lettering (lit from inside at night when sign.lit)
function signBoard(G, sign, x0, y0, w, h, night) {
  const bg = ramp(sign.bg || '#2c2c34', 5, 2), fg = sign.fg || [240, 220, 150];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2;
    setC(G, x0 + x, y0 + y, edge ? (y < 2 || x < 2 ? MAT.metal[4] : MAT.metalDark[1]) : step(bg, 0.5 + (y < h / 2 ? 0.08 : -0.05), x0 + x, y0 + y, 0.4));
    if (sign.lit && !edge) glow(G, x0 + x, y0 + y, [...bg[3], 30 + night * 40]);
  }
  const text = sign.text || '';
  let sx = Math.max(1, Math.min(3, Math.floor((w - 10) / Math.max(1, text.length * 4))));
  const sy = Math.max(1, Math.min(3, Math.floor((h - 6) / 5)));
  const tw = textWidth(text, { sx, gap: 1 });
  const tx = x0 + Math.floor((w - tw) / 2), ty = y0 + Math.floor((h - 5 * sy) / 2);
  drawText((px, py, k) => { setC(G, px, py, k ? [20, 16, 24] : fg); if (!k && (sign.lit || sign.neon)) glow(G, px, py, [...fg, (sign.neon ? 150 : 60) + night * 100]); }, text, tx, ty, { sx, sy, gap: 1, shadow: true });
  if (sign.icon === 'badge') { const cx = x0 + 10, cy = y0 + h / 2; for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const a = Math.atan2(y, x), r = Math.hypot(x, y), star = 4 + 4 * Math.max(0, Math.cos(5 * (a + Math.PI / 2))) ** 2; if (r < star) { setC(G, cx + x, cy + y, r < 3 ? [180, 140, 50] : [236, 200, 90]); glow(G, cx + x, cy + y, [255, 210, 110, 40 + night * 100]); } } }
  if (sign.icon === 'crown') { const cx = x0 + w - 16, cy = y0 + 5; for (let y = 0; y < 10; y++) for (let x = 0; x < 13; x++) { const on = y > 6 || ((x === 0 || x === 6 || x === 12) && y > 0) || (y > 3 && (x < 3 || (x > 4 && x < 8) || x > 9)); if (on) { setC(G, cx + x, cy + y, [236, 196, 80]); glow(G, cx + x, cy + y, [255, 200, 80, 40 + night * 120]); } } }
}

// a classical portico on the facade: columns standing proud of a shaded recess, an entablature with an
// inscription and a pediment above (p: { x, w, cols, text })
function portico(G, p, d, H, cornice) {
  const yG = d + H, top = H - cornice, entH = 16, pedH = Math.min(30, Math.floor(p.w * 0.16)), ent0 = top - pedH - entH;
  const S = ramp('#d8cfbc', 6, 3);
  // recess behind the columns
  for (let v = 4; v < ent0; v++) for (let x = p.x + 4; x < p.x + p.w - 4; x++) { const Y = yG - v, j = (Y * G.w + x) * 4; if (G.inside(x, Y)) { G.col[j] *= 0.62; G.col[j + 1] *= 0.6; G.col[j + 2] *= 0.66; } }
  const n = p.cols || 4, cw = 12, gap = (p.w - 8 - n * cw) / Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    const cx = p.x + 4 + i * (cw + gap);
    for (let v = 0; v < ent0; v++) for (let x = 0; x < cw; x++) {
      const u = (x + 0.5) / cw * 2 - 1, cap = v > ent0 - 6, base = v < 6, fl = (x % 3 === 1) && !cap && !base;
      const w = cap || base ? 1 : 0.86;
      if (Math.abs(u) > w + (cap || base ? 0.2 : 0)) continue;
      setC(G, cx + x, yG - v, step(S, 0.66 - u * 0.36 + (cap ? 0.15 : 0) - (fl ? 0.12 : 0), cx + x, v, 0.4));
      setN(G, cx + x, yG - v, [u * 0.8, 0.6, 0]);
    }
  }
  // entablature with lettering
  for (let v = ent0; v < ent0 + entH; v++) for (let x = p.x; x < p.x + p.w; x++) setC(G, x, yG - v, step(S, v === ent0 || v === ent0 + entH - 1 ? 0.35 : 0.62, x, v, 0.3));
  if (p.text) { const sx = 2, tw = textWidth(p.text, { sx, gap: 1 }); drawText((px, py) => setC(G, px, py, S[1]), p.text, p.x + Math.floor((p.w - tw) / 2), yG - ent0 - entH + 3, { sx, sy: 2, gap: 1 }); }
  // pediment
  for (let v = ent0 + entH; v < top; v++) { const t = (v - ent0 - entH) / pedH, half = (p.w / 2) * (1 - t); for (let x = Math.round(p.x + p.w / 2 - half); x < p.x + p.w / 2 + half; x++) { const edge = x < p.x + p.w / 2 - half + 3 || x > p.x + p.w / 2 + half - 3 || v === ent0 + entH; setC(G, x, yG - v, step(S, edge ? 0.75 : 0.45, x, v, 0.3)); } }
}
// a plaque or lettered panel on the wall (p: { text, x, v height above the pavement, sx, bg, fg, lit })
function plaque(G, p, yG, night) {
  const sx = p.sx || 2, sy = p.sy || sx, tw = textWidth(p.text, { sx, gap: 1 }), w = p.w || tw + 10, h = 5 * sy + 8, x0 = p.x, y0 = yG - p.v - h;
  if (p.bg) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { setC(G, x0 + x, y0 + y, (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? MAT.metalDark[2] : ramp(p.bg, 5, 2)[2]); if (p.lit) G.glow(x0 + x, y0 + y, [...ramp(p.bg, 5, 2)[3], 30 + night * 60]); }
  drawText((px, py) => { setC(G, px, py, p.fg || [60, 54, 48]); if (p.lit) G.glow(px, py, [...(p.fg || [255, 255, 255]), 80 + night * 120]); }, p.text, x0 + Math.floor((w - tw) / 2), y0 + 4, { sx, sy, gap: 1 });
}
// a vertical neon blade sign: letters stacked top to bottom in a dark frame with a lit border, on two brackets
// (b: { text, x, v (bottom height above the pavement), col: [r,g,b] })
function blade(G, b, yG, night) {
  const t = String(b.text || '').slice(0, 8), sx = 2, w = 5 * sx + 10, h = t.length * (5 * sx + 4) + 10, x0 = b.x, y0 = yG - b.v - h, col = b.col || [255, 80, 200];
  for (let k = 0; k < 2; k++) for (let x = -3; x < 2; x++) setC(G, x0 + x, y0 + 8 + k * (h - 18), MAT.metalDark[1]);      // brackets
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = x === 0 || y === 0 || x === w - 1 || y === h - 1, e2 = x === 2 || y === 2 || x === w - 3 || y === h - 3;
    if (e) setC(G, x0 + x, y0 + y, MAT.metalDark[2]);
    else if (e2) { setC(G, x0 + x, y0 + y, col.map((v) => Math.min(255, v * 0.5 + 120))); glow(G, x0 + x, y0 + y, [...col, 150 + night * 100]); }
    else setC(G, x0 + x, y0 + y, [24, 20, 32]);
  }
  for (let i = 0; i < t.length; i++) drawText((px, py) => { setC(G, px, py, col.map((v) => Math.min(255, v * 0.55 + 115))); glow(G, px, py, [...col, 170 + night * 85]); }, t[i], x0 + 5, y0 + 6 + i * (5 * sx + 4), { sx, sy: sx, gap: 1 });
}
function redCross(G, x0, y0, s, night) {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const c = s / 2, arm = s * 0.18, inX = Math.abs(x - c + 0.5) < arm, inY = Math.abs(y - c + 0.5) < arm, inner = x > 2 && y > 2 && x < s - 3 && y < s - 3;
    const col = (inX || inY) && inner && Math.abs(x - c) < s * 0.38 && Math.abs(y - c) < s * 0.38 ? [212, 40, 44] : [244, 242, 236];
    setC(G, x0 + x, y0 + y, col); G.glow(x0 + x, y0 + y, [...col, 30 + night * 120]);
  }
}

// an arched opening on the facade: a door (wood double leaves), a lancet window (stained glass) or a
// plain round-headed window. a: { x, w, h, v (sill height), kind: 'door'|'lancet'|'window' }
function arch(G, a, yG, night, seed) {
  const r = a.w / 2, v0 = a.v || 0;
  for (let v = v0; v < v0 + a.h; v++) for (let x = 0; x < a.w; x++) {
    const top = v0 + a.h - r, dx = x + 0.5 - r, inside = v < top || Math.hypot(dx, (v - top) * (a.kind === 'lancet' ? 0.75 : 1)) < r - (a.kind === 'lancet' ? Math.abs(dx) * 0.2 : 0);
    if (!inside) continue;
    const X = a.x + x, Y = yG - v, edge = Math.abs(dx) > r - 2 || (v >= top && Math.hypot(dx, v - top) > r - 2.2);
    let c;
    if (edge) c = step(MAT.stone, 0.75 - (dx > 0 ? 0.25 : 0), X, Y, 0.3);
    else if (a.kind === 'door') { c = step(MAT.woodDark, 0.5 + (Math.abs(dx) < 1 ? -0.35 : 0) + ((v - v0) % 12 === 0 ? -0.2 : 0), X, Y, 0.4); if (Math.abs(dx) < 4 && Math.abs(v - v0 - a.h * 0.45) < 1) c = [200, 160, 70]; }
    else if (a.kind === 'lancet') { const cell = hash(Math.floor(x / 3), Math.floor((v - v0) / 4), seed); c = (x % 3 === 0 || (v - v0) % 4 === 0) ? [40, 34, 44] : cell > 0.7 ? [200, 60, 60] : cell > 0.45 ? [60, 100, 190] : cell > 0.25 ? [230, 190, 70] : [80, 150, 90]; G.glow(X, Y, [...c, 30 + night * 140]); }
    else { c = step(MAT.glassDark, 0.35 + ((x + v) % 7 < 2 ? 0.3 : 0), X, Y, 0.4); if (hash(a.x, v0, seed) < night * 0.7) { c = [236, 190, 120]; G.glow(X, Y, [255, 200, 130, 120]); } }
    setC(G, X, Y, c);
  }
}
// a rose window: concentric tracery round a hub, stained glass between
function rose(G, cx, cy, r, night) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y); if (d > r) continue;
    const a = Math.atan2(y, x), petal = Math.round(a / (Math.PI / 6)), dp = Math.abs(a - petal * Math.PI / 6) * d;
    let c;
    if (d > r - 2.2) c = step(MAT.stone, 0.75 - (x > 0 ? 0.2 : 0), x, y, 0.3);
    else if (d < 3 || dp < 0.9 || Math.abs(d - r * 0.55) < 0.8) c = [52, 44, 54];
    else { c = (petal & 1) ? (d > r * 0.55 ? [70, 110, 200] : [220, 70, 70]) : (d > r * 0.55 ? [230, 190, 80] : [90, 160, 110]); G.glow(cx + x, cy + y, [...c, 40 + night * 150]); }
    setC(G, cx + x, cy + y, c);
  }
}
