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
// (planks) | 'green' (a roof garden's paving: slabs, decking or brick, a gravel strip along the parapets - statics.js
// lays the beds on it) | 'sedum' (trays of it in a grid) | 'rubber', with seams, patches, drains and ponding stains.
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
import { DOOR_COLS } from '../../shared/doors.js';
import { dressFacade } from './facadedress.js';

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
let GLASSC = null;  // a glass tower's own tint (spec.glassTint: Lucky Mesa's gold towers; none: the city's blue glass)
let BRICKC = null;  // a brick building's own tone (spec.brickTone: brown, buff, cream, painted...; none: the red brick ramp)
let GLOW_ONLY = false; // spec.glowOnly: lit windows keep their glass albedo and carry the light in the emissive
                       // map only (the game bakes a chunk once for every time of day; the Lighter scales emi)
// (big and mid: vnoise(u, v, 30, seed) and vnoise(u, v, 8, seed + 1) when the caller has them precomputed)
function wallColor(style, u, v, seed, x, y, big = vnoise(u, v, 30, seed), mid = vnoise(u, v, 8, seed + 1)) {
  const h = hash(u, v, seed);
  if (style === 'brick' || style === 'brickDark') {
    const R = BRICKC || (style === 'brick' ? MAT.brick : MAT.brickDark);
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
    return step(GLASSC || MAT.glass, 0.35 + ((u + (40 - v % 40)) % 40 < 8 ? 0.35 : 0) + (big - 0.5) * 0.2, x, y, 0.4);
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
  const curtain = hash(x0, y0, seed + 3), thing = hash(x0, y0, seed + 9);
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
    // curtains drawn to one side (or both: open in the middle)
    if (curtain > 0.5 && (curtain > 0.93 ? x < 3 || x > w - 4 : curtain > 0.75 ? x < 3 : x > w - 4)) c = step(curtain > 0.85 ? ramp('#c86a6a', 5, 2) : ramp('#e0d8c8', 5, 2), lit ? 0.75 : 0.45, X, Y, 0.3);
    // what's in the window (facadedress.js has the rest of the dressing): blinds half down, a plant, a cat on the sill,
    // a lamp, a flag or a poster stuck to the glass
    else if (thing < 0.14 && y < h * 0.45 && y % 3) c = step(ramp('#e8e2d2', 5, 2), lit ? 0.8 : 0.5, X, Y, 0.3);
    else if (thing < 0.24 && y > h - 7 && Math.abs(x - w / 2) < (y > h - 3 ? 2 : 3 + (x & 1))) c = y > h - 3 ? MAT.terracotta[3] : MAT.leaf[2 + ((x + y) & 3)];
    else if (thing < 0.31 && y > h - 7 && x > 1 && x < 7 && !(y === h - 7 && (x === 3 || x === 4)) && !(y < h - 4 && x > 5)) c = [30, 26, 30];
    else if (thing < 0.38 && x > w - 7 && x < w - 2 && (y > h - 4 || (y > h - 10 && y < h - 6))) c = y > h - 4 ? [60, 50, 44] : [250, 220, 160];
    else if (thing < 0.44 && y > 2 && y < 8 && x > 1 && x < 9) c = thing < 0.41 ? [[200, 50, 50], [240, 240, 236], [50, 80, 160]][Math.floor((y - 3) / 2) % 3] : [226, 190, 80];
    setC(G, X, Y, c);
    G.flag[Y * G.w + X] |= F_GLASS;
  }
  // stone lintel and sill (they face up: the sill catches light)
  for (let x = -2; x < w + 2; x++) {
    if (!opt.noLintel) for (let k = 0; k < 3; k++) { setC(G, x0 + x, y0 - 3 + k, step(MAT.stone, 0.75 - k * 0.18, x0 + x, k, 0.3)); }
    setC(G, x0 + x, y0 + h, step(MAT.stone, 0.9, x0 + x, 0, 0)); setN(G, x0 + x, y0 + h, [0, 0.5, 0.86]);
    setC(G, x0 + x, y0 + h + 1, MAT.stone[1]);
  }
}
// a plain stone lintel over an opening (a three-light window's: one across all three)
function lintel(G, x0, y0, w) { for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) setC(G, x0 + x, y0 + k, step(MAT.stone, 0.75 - k * 0.18, x0 + x, k, 0.3)); }
// a round-headed window's arch over its sash: the fanlight (glass, lit with the room) under a ring of voussoirs - brick
// headers in a brick wall, stone in any other
function archHead(G, x0, y0, w, style, lit, night) {
  const r = w / 2, cx = x0 + r, R = style === 'brick' ? (BRICKC || MAT.brick) : MAT.stone;
  for (let y = -Math.ceil(r) - 3; y <= 0; y++) for (let x = -3; x < w + 3; x++) {
    const X = x0 + x, Y = y0 + y, d = Math.hypot(X + 0.5 - cx, y + 0.5);
    if (d > r + 2.6) continue;
    if (d > r) { setC(G, X, Y, step(R, 0.32 + (Math.floor(Math.atan2(y, X + 0.5 - cx) * 4) & 1 ? 0.18 : 0), X, Y, 0.3)); if (y < -r) setN(G, X, Y, [0, 0.45, 0.89]); continue; }
    if (d > r - 1.2 || y === 0) { setC(G, X, Y, MAT.metalDark[2]); continue; }
    const rib = Math.abs(X + 0.5 - cx) < 0.6;
    setC(G, X, Y, rib ? MAT.metalDark[2] : lit ? [236, 190, 120] : step(MAT.glassDark, 0.42 + ((X + y) % 6 < 2 ? 0.3 : 0), X, Y, 0.4));
    if (lit) G.glow(X, Y, [255, 200, 130, 90 + night * 60]);
    G.flag[Y * G.w + X] |= F_GLASS;
  }
}
// a factory loft's window: a steel frame of small panes, a hopper open now and then
function loftWin(G, x0, y0, w, h, lit, seed) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (!G.inside(X, Y)) continue;
    const bar = x === 0 || y === 0 || x === w - 1 || y === h - 1 || x % 8 === 0 || y % 7 === 0;
    if (bar) { setC(G, X, Y, step(MAT.metalDark, x === 0 || y === 0 ? 0.25 : 0.5, X, Y, 0)); continue; }
    const pane = hash(Math.floor(x / 8), Math.floor(y / 7), seed), streak = ((x + (h - y)) % 11) < 2;
    let c = lit ? step(ramp('#d8964e', 5, 2), 0.5 + (y / h) * 0.3, X, Y, 0.5) : step(MAT.glassDark, 0.28 + (streak ? 0.4 : 0) + (pane > 0.86 ? 0.25 : 0), X, Y, 0.4);
    if (!lit && pane < 0.06) c = [36, 32, 34];   // (a hopper tipped open)
    setC(G, X, Y, c);
    if (lit) G.glow(X, Y, [255, 196, 120, 100]);
    G.flag[Y * G.w + X] |= F_GLASS;
  }
  for (let x = -2; x < w + 2; x++) { setC(G, x0 + x, y0 + h, step(MAT.concrete, 0.8, x0 + x, 0, 0)); setC(G, x0 + x, y0 + h + 1, MAT.concrete[1]); }
}
// an oriel up the middle of the upper floors: a painted bay standing out from the wall - three windows a floor (its
// sides in shade), panels under them, its own cornice and a lead cap
function oriel(G, x0, w, fy, gH, floors, night, seed, style) {
  const Pn = style === 'brick' ? ramp(hash(seed, 3, 9) < 0.5 ? '#d8cfbc' : '#3a4a5a', 6, 3) : ramp(hash(seed, 3, 9) < 0.5 ? '#efe6d2' : '#5a6a52', 6, 3);
  const top = gH + (floors - 1) * FLOOR + 4, bot = gH + 6, side = Math.round(w * 0.2);
  for (let v = bot; v < top; v++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = fy(v), sh = x < side ? 0.3 : x >= w - side ? 0.18 : 0.62, e = x === side || x === w - side - 1;
    setC(G, X, Y, step(Pn, sh + (e ? 0.2 : 0), X, Y, 0.3));
    setN(G, X, Y, x < side ? [-0.6, 0, 0.8] : x >= w - side ? [0.6, 0, 0.8] : [0, 0, 1]);
  }
  for (let f = 1; f < floors; f++) {
    const base = gH + (f - 1) * FLOOR, wh = 28, py = fy(base + 12 + wh), lit = hash(f, 7, seed + 17) < night * 0.75;
    sash(G, x0 + side + 3, py, w - 2 * side - 6, wh, lit, seed + f * 11, { noLintel: true });
    for (const sx of [2, w - side + 1]) sash(G, x0 + sx, py + 2, side - 3, wh - 4, lit && hash(f, sx, seed) < 0.6, seed + f * 13 + sx, { noLintel: true });
    for (let x = 1; x < w - 1; x++) for (let k = 0; k < 2; k++) setC(G, x0 + x, fy(base + 8 - k * 4), step(Pn, 0.82 - k * 0.3, x0 + x, k, 0.2));   // the panel rails
  }
  // its cornice and the lead cap over it
  for (let x = -2; x < w + 2; x++) for (let k = 0; k < 6; k++) { setC(G, x0 + x, fy(top + k), k < 3 ? step(Pn, 0.9 - k * 0.15, x0 + x, k, 0.2) : step(MAT.metal, 0.4 + (k - 3) * 0.12, x0 + x, k, 0.2)); if (k >= 3) setN(G, x0 + x, fy(top + k), [0, 0.5, 0.86]); }
  // its shadow on the wall beside it (the light from the west: on the east side)
  for (let v = bot; v < top + 4; v++) for (let k = 0; k < 3; k++) { const X = x0 + w + k, Y = fy(v); if (!G.inside(X, Y)) continue; const j = (Y * G.w + X) * 4; G.col[j] *= 0.72 + k * 0.08; G.col[j + 1] *= 0.72 + k * 0.08; G.col[j + 2] *= 0.74 + k * 0.08; }
}
// the cornice's character (spec.cornice): 'bracket' corbels under the band, 'dentil' a row of teeth, 'step' a raised
// panel in the middle of the parapet (spec.date: the year on its datestone), 'plain' as it is
function corniceDress(G, spec, w, d, H, cornice, fy) {
  const k = spec.cornice, S = MAT.stone;
  if (k === 'bracket') for (let x = 6; x < w - 6; x += 16) for (let v = H - cornice - 7; v < H - cornice; v++) for (let q = 0; q < 4; q++) { const t = v - (H - cornice - 7); if (q < 4 - Math.floor((7 - t) / 3)) setC(G, x + q, fy(v), step(S, 0.7 - q * 0.12 - (q === 3 ? 0.2 : 0), x + q, v, 0.2)); }
  else if (k === 'dentil') for (let x = 2; x < w - 2; x++) for (let v = H - cornice - 4; v < H - cornice; v++) setC(G, x, fy(v), x % 6 < 3 ? step(S, 0.8, x, v, 0.2) : step(S, 0.35, x, v, 0.2));
  else if (k === 'step') {
    const sw = Math.max(40, Math.round(w * 0.32)), x0 = Math.round(w / 2 - sw / 2), sh = 12;
    for (let v = H; v < H + sh; v++) for (let x = x0; x < x0 + sw; x++) {
      const Y = fy(v), top = v >= H + sh - 3;
      const c = top ? step(S, v === H + sh - 1 ? 0.88 : 0.6, x, v, 0.2) : wallColor(spec.style || 'stucco', x, v, spec.seed || 1, x, Y);
      setC(G, x, Y, c); setN(G, x, Y, top ? [0, 0.45, 0.89] : [0, 0, 1]);
    }
    if (spec.date) { const t = String(spec.date).slice(0, 4), tw = textWidth(t, { sx: 1, gap: 1 }), px = Math.round(w / 2 - tw / 2) - 3; for (let y = 0; y < 9; y++) for (let x = 0; x < tw + 6; x++) setC(G, px + x, fy(H + 1) - y, (x === 0 || y === 0 || x === tw + 5 || y === 8) ? S[2] : S[4]); drawText((qx, qy) => setC(G, qx, qy, S[1]), t, px + 3, fy(H + 1) - 7, { sx: 1, gap: 1 }); }
  }
}
// scaffolding up the front (spec.scaffold: a building having its brickwork repointed - the skip and the van are the
// plan's props): steel standards and ledgers, a deck of boards at each lift, a brace, debris netting over the top lift
function scaffold(G, w, d, H, gH, floors, seed) {
  const yG = d + H, top = Math.min(H - 4, gH + (floors - 1) * FLOOR + 30), bays = Math.max(1, Math.round((w - 8) / 44)), bw = (w - 8) / bays;
  const tube = (X, Y, t) => setC(G, X, Y, step(MAT.metal, 0.35 + t * 0.4, X, Y, 0.2));
  for (let i = 0; i <= bays; i++) { const X = Math.round(4 + i * bw); for (let v = 0; v < top; v++) { tube(X, yG - v, 0.8); tube(X + 1, yG - v, 0.2); } }
  for (let lift = gH; lift < top; lift += FLOOR) {
    for (let x = 2; x < w - 2; x++) {
      tube(x, yG - lift - 30, 0.7);                                                                              // the guard rail
      for (let k = 0; k < 3; k++) setC(G, x, yG - lift + k, step(MAT.woodDark, 0.7 - k * 0.2 + (hash(Math.floor(x / 12), lift, seed) - 0.5) * 0.2, x, k, 0.3));   // the boards
      setC(G, x, yG - lift - 1, step(MAT.woodDark, 0.85, x, 0, 0)); setN(G, x, yG - lift - 1, [0, 0.6, 0.8]);
    }
  }
  // a brace across the first bay, the netting over the top lift
  for (let t = 0; t < 1; t += 1 / (bw * 2)) { const X = Math.round(4 + t * bw), Y = Math.round(yG - gH - t * FLOOR); tube(X, Y, 0.6); }
  const nt = Math.max(gH, top - FLOOR);
  for (let v = nt; v < top; v++) for (let x = 2; x < w - 2; x++) if ((x + v) % 3 !== 0) { const Y = yG - v, j = (Y * G.w + x) * 4; if (!G.inside(x, Y)) continue; G.col[j] = G.col[j] * 0.35 + 40; G.col[j + 1] = G.col[j + 1] * 0.35 + 92; G.col[j + 2] = G.col[j + 2] * 0.35 + 64; }
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
  GLASSC = spec.glassTint ? ramp(spec.glassTint, 6, 3, { light: 0.65 }) : null;
  BRICKC = spec.brickTone ? ramp(spec.brickTone, 6, 3, { dark: 0.55 }) : null;
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
    if (style === 'brick') { const BD = BRICKC ? [BRICKC[0], BRICKC[1], BRICKC[1], BRICKC[2]] : MAT.brickDark; c = k < 2 ? MAT.stone[k ? 2 : 4] : k < 4 ? BD[3] : (k < 7 && x % 4 < 2) ? MAT.stone[3] : BD[1]; }
    else if (style === 'diner') c = k < 2 ? MAT.chrome[3] : MAT.dinerRed[3 - (k > 3 ? 1 : 0)];
    else if (style === 'adobe') c = step(WALLC || MAT.stucco, 0.66 - k * 0.04 + (k < 2 ? 0.1 : 0), x, k, 0.4);   // (the parapet's rounded lip, in the wall's own render)
    else c = step(MAT.stone, 0.75 - k * 0.1, x, k, 0.3);
    setC(G, x, Y, c);
    if (k < 2) setN(G, x, Y, [0, 0.4, 0.92]);
  }
  if (spec.cornice) corniceDress(G, spec, w, d, H, cornice, fy);
  // the vigas: the roof beams' ends out through the wall under the parapet (an adobe's, spec.vigas)
  if (spec.vigas) for (let x = 9; x + 4 < w - 6; x += 18) for (let k = 0; k < 4; k++) for (let q = 0; q < 4; q++) { const Y = fy(H - cornice - (spec.parapet || 0) + 2 - k); setC(G, x + q, Y, step(MAT.woodDark, 0.62 - k * 0.1 - q * 0.07, x + q, k, 0.3)); }
  // diner neon band along the top of the facade
  if (spec.trim) for (let x = 1; x < w - 1; x++) for (const k of [cornice + 2, cornice + 4]) { const Y = fy(H - k); setC(G, x, Y, spec.trim.map((c) => Math.min(255, c * 0.7 + 80))); glow(G, x, Y, [...spec.trim, 120 + night * 135]); }
  // ---- upper floors. spec.win, the rhythm of the windows (World v3's handcrafted streets: no two neighbours alike):
  // 'even' (the default) evenly spaced sashes; 'pair' in pairs; 'triple' three-light windows; 'tall' taller and fewer;
  // 'arch' round-headed under brick arches; 'loft' wide steel-framed factory windows; 'bay' an oriel up the middle
  const WIN = spec.win || 'even';
  let bay = null;
  if (WIN === 'bay' && floors > 1 && w >= 110 && style !== 'glass') { const bw = w >= 220 ? 62 : 50; bay = [Math.round(w / 2 - bw / 2), bw]; }
  const WL = [];   // (the upper floors' windows, for the dressing: facadedress.js)
  for (let f = 1; f < floors && style !== 'glass' && !spec.motel; f++) {
    const base = gH + (f - 1) * FLOOR;
    let ww = style === 'brick' ? 18 : 16, wh = style === 'brick' ? 30 : 26, gap = style === 'brick' ? 20 : 22;
    if (WIN === 'tall') { wh += 6; gap += 12; } else if (WIN === 'loft') { ww = 38; wh = 32; gap = 14; } else if (WIN === 'arch') { wh -= 4; gap += 4; }
    const L = [];   // the floor's windows: [x, w]
    if (WIN === 'pair') {
      const pw = 2 * ww + 4, pg = 30, n = Math.max(1, Math.floor((w - 16 + pg) / (pw + pg))), x0 = Math.floor((w - (n * pw + (n - 1) * pg)) / 2);
      for (let i = 0; i < n; i++) { L.push([x0 + i * (pw + pg), ww]); L.push([x0 + i * (pw + pg) + ww + 4, ww]); }
    } else if (WIN === 'triple') {
      const tw = 40, tg = 26, n = Math.max(1, Math.floor((w - 16 + tg) / (tw + tg))), x0 = Math.floor((w - (n * tw + (n - 1) * tg)) / 2);
      for (let i = 0; i < n; i++) L.push([x0 + i * (tw + tg), tw]);
    } else {
      const n = Math.max(1, Math.floor((w - 16) / (ww + gap))), x0 = Math.floor((w - (n * ww + (n - 1) * gap)) / 2);
      for (let i = 0; i < n; i++) L.push([x0 + i * (ww + gap), ww]);
    }
    L.forEach(([px, pw], i) => {
      if (bay && px + pw > bay[0] - 4 && px < bay[0] + bay[1] + 4) return;   // (the oriel takes the middle)
      const py = fy(base + 12 + wh);
      const lit = hash(i, f, seed + 13) < night * 0.75 + (night > 0 ? 0.08 : 0);
      if (spec.boarded && hash(i, f, seed + 41) < spec.boarded) { boards(G, px, py, pw, wh, seed + i * 5 + f); return; }
      WL.push([px, py, pw, wh, f]);
      if (WIN === 'loft') loftWin(G, px, py, pw, wh, lit, seed + f * 7 + i);
      else if (WIN === 'triple') { for (let k = 0; k < 3; k++) sash(G, px + k * 13 + (k ? 1 : 0), py, 13 + (k === 1 ? 0 : 0), wh, lit, seed + f * 7 + i * 3 + k, { noLintel: k > 0 }); lintel(G, px - 2, py - 3, pw + 4); }
      else sash(G, px, py, pw, wh, lit, seed + f * 7 + i, WIN === 'arch' || style === 'adobe' ? { noLintel: true, ...(style === 'adobe' ? { frame: MAT.woodDark } : {}) } : undefined);
      if (style === 'adobe') for (let x = -2; x < pw + 2; x++) for (let k = 0; k < 3; k++) setC(G, px + x, py - 3 + k, step(MAT.woodDark, 0.6 - k * 0.15, px + x, k, 0.3));   // (a timber lintel)
      if (WIN === 'arch') archHead(G, px, py, pw, style, lit, night);
      if (spec.shutters && WIN !== 'loft' && WIN !== 'triple') shutters(G, px, py, pw, wh, spec.shutters);
      if (spec.balconies) balconyRail(G, px - 6, py + wh + 3, pw + 12, seed + i * 3 + f);
      else if (WIN !== 'loft' && hash(i, f, seed + 21) > 0.62) windowBox(G, px, py + wh + 2, pw, seed + i);
      else if (hash(i, f, seed + 23) > 0.82) acBox(G, px + 1, py + wh - 8);
    });
  }
  if (bay) oriel(G, bay[0], bay[1], fy, gH, floors, night, seed, style);
  // stone band over the ground floor
  if (style === 'brick' && floors > 1 && gH > 0) for (let k = 0; k < 4; k++) for (let x = 0; x < w; x++) setC(G, x, fy(gH + 2 - k), step(MAT.stone, 0.8 - k * 0.15, x, k, 0.3));
  // ---- ground floor
  if (spec.blank) { /* a plain wall: no doors or windows */ }
  else if (spec.motel) motelFront(G, w, gH, floors, spec, seed, night, fy);
  else if (spec.shop) storefront(G, w, d, H, gH, spec, seed, night, fy);
  else if (spec.doors) {
    for (const dd of spec.doors) {
      const dh = dd.h || (dd.kind === 'garage' || dd.kind === 'roller' ? 48 : 46);
      if (dd.kind === 'garage' || dd.kind === 'roller') bigDoor(G, dd.x, fy(dh), dd.w, dh, dd.kind, dd.open, night);
      else if (dd.live) liveDoor(G, dd.x, fy(dh), dd.w || 18, dh, dd.live, night, dd.c | 0);
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
  if (spec.scaffold) scaffold(G, w, d, H, gH, floors, seed);
  if (spec.graffiti) for (let i = 0; i < spec.graffiti; i++) tag(G, Math.floor(hash(i, 1, seed + 61) * Math.max(1, w - 60)) + 4, d + H - 10 - Math.floor(hash(i, 2, seed + 61) * 18), seed + i * 17, spec.tagText && i === 0 ? spec.tagText : null);
  if (spec.ivy) ivy(G, w, d, H, spec.ivy, seed);
  if (spec.mural) mural(G, spec.mural, d + H, seed);
  if (spec.dress) dressFacade(G, spec, WL, w, d, H, gH, fy, seed);
  if (spec.portico) portico(G, spec.portico, d, H, cornice);
  for (const a of spec.arches || []) arch(G, a, d + H, night, seed);
  if (spec.rose) rose(G, spec.rose.x, d + H - spec.rose.v, spec.rose.r || 14, night);
  for (const pq of spec.plaques || []) plaque(G, pq, d + H, night);
  for (const bl of spec.blades || []) blade(G, bl, d + H, night);
  if (spec.cross) medSign(G, spec.cross.x, d + H - spec.cross.v, spec.cross.s || 22, night, spec.cross.k);
  if (spec.neon) neonIcon(G, spec.neon.x ?? Math.floor(w / 2) - 14, d - 6 + (spec.neon.y || 0), spec.neon.icon || 'cup', spec.neon.col, night);
  return spec.pitch ? pitched(G, spec, w, d, H, seed) : G;
}

// ---- flat roof decks (spec.roofMat) ------------------------------------------------------------------
const DECK = { tar: ramp('#615c5c', 6, 3), gravel: ramp('#7c756c', 6, 3), membrane: ramp('#a29f99', 6, 3), metal: ramp('#7a838c', 6, 3),
  paver: ramp('#908376', 6, 3), deck: MAT.woodDock, green: ramp('#aca392', 6, 3), sedum: ramp('#4a4846', 6, 3), rubber: ramp('#4c494c', 6, 3), seats: ramp('#b02a2e', 6, 3), parking: ramp('#8c8984', 6, 3), adobe: ramp('#cbb595', 6, 3) };
// (a parking garage's top deck: the bays' paint, the parked cars' bodies, their glass - RS 13, 14-19, 20)
const BAYPAINT = ramp('#ecebe2', 5, 2), CARS = ['#c8342e', '#2a5aa8', '#ecebe6', '#34383f', '#a8acb4', '#2a7a4a'].map((c) => ramp(c, 6, 3)), CARGLASS = ramp('#2a3444', 5, 2);
const RUST = ramp('#8a5a3a', 6, 3), PAD = ramp('#b6b0a4', 6, 3);
const SEDUM = [ramp('#6e8e3a', 6, 3), ramp('#8e6c3a', 6, 3), ramp('#4a6e3c', 6, 3), ramp('#9a5c4c', 6, 3)];
const GPAVE = [ramp('#8e7258', 6, 3), ramp('#9a705c', 6, 3), ramp('#d870a0', 5, 2), ramp('#e8c848', 5, 2)];   // (a garden's decking, its clay pavers; sedum in flower)
// a stadium's stand (roofMat 'seats'): the club's seats (red, navy), the cantilever roof's sheeting and its white steel,
// the advertising boards along the front, the people sat here and there - skin, shirts - and the concrete of the steps
const STAND = [ramp('#b42a2e', 6, 3), ramp('#22345e', 6, 3), ramp('#c9ccd0', 6, 3), ramp('#eef0f0', 5, 2), ramp('#2a7a4a', 5, 2), ramp('#e8c040', 5, 2),
  ramp('#e2b48c', 5, 2), ramp('#8a5a3c', 5, 2), ramp('#c08a62', 5, 2), ramp('#3a6ab0', 5, 2), ramp('#ecebe6', 5, 2), ramp('#34363c', 5, 2), ramp('#b0aca4', 6, 3)];
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
    // per deck pixel: a shade (T) and which ramp (RI: 0 the material, 1 rust, 2 walkway pads, 3 gravel, 4-7 sedum, 8 decking,
    // 9 clay pavers, 10-11 sedum flowers, 12 membrane)
    const RS = [DECK[mat] || DECK.tar, RUST, PAD, DECK.gravel, SEDUM[0], SEDUM[1], SEDUM[2], SEDUM[3], ...GPAVE, DECK.membrane, BAYPAINT, ...CARS, CARGLASS, ...STAND], DI = [mat === 'gravel' || mat === 'paver' || mat === 'green' ? 0.3 : 0.5, 0.5, 0.5, 0.3, 0.6, 0.6, 0.6, 0.6, 0.5, 0.35, 0.3, 0.3, 0.5, 0.2, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.2, ...STAND.map(() => 0.15)];
    // (ZO: a deck pixel's height over the deck - the stand's rows stepping up from the pitch, its roof over the back rows)
    const T = new Float32Array(iw * id), RI = new Uint8Array(iw * id), ZO = mat === 'seats' ? new Int8Array(iw * id) : null, F = (sx, sy, s) => noiseField(w, d, sx, sy, s);
    const each = (fn) => { for (let v = 0, i = 0; v < id; v++) for (let u = 0; u < iw; u++, i++) fn(u, v, i, u + rw, v + rw); };
    switch (mat) {
      case 'gravel': { const A = F(4, 4, seed + 5), B = F(40, 40, seed); each((u, v, i, x, y) => { const j = y * w + x, h1 = hash(x, y, seed + 2); T[i] = 0.5 + (A[j] - 0.5) * 0.2 + (h1 > 0.86 ? 0.12 : h1 < 0.1 ? -0.12 : 0) + (B[j] - 0.5) * 0.12; }); break; }   // (calm: the art pixel shows the stones)
      case 'adobe': { const A = F(26, 26, seed + 6), B = F(7, 7, seed + 7); each((u, v, i, x, y) => { const j = y * w + x; T[i] = 0.6 + (A[j] - 0.5) * 0.12 + (B[j] - 0.5) * 0.05; }); break; }   // (an adobe's earthen roof: packed and smoothed, softly mottled)
      case 'membrane': { const A = F(30, 30, seed + 4); each((u, v, i, x, y) => { const h1 = hash(x, y, seed + 2), s = u % 46; T[i] = 0.56 + (A[y * w + x] - 0.5) * 0.12 + (h1 > 0.97 ? 0.08 : 0) + (s === 0 ? 0.12 : s === 1 ? -0.08 : 0); }); break; }
      case 'metal': {
        const A = F(26, 26, seed), B = F(10, 42, seed + 9);
        each((u, v, i, x, y) => { const r = u % 9, j = y * w + x; T[i] = 0.5 + (r === 0 ? 0.3 : r === 1 ? 0.14 : r === 8 ? -0.2 : 0) + (A[j] - 0.5) * 0.14 + (v % 120 === 0 ? -0.15 : 0); if (r > 1 && r < 8 && B[j] > 0.9 && hash(x, y, seed + 2) > 0.45) { RI[i] = 1; T[i] -= 0.12; } });
        break;
      }
      case 'paver': each((u, v, i) => { const px = u % 20, py = v % 20; T[i] = px === 0 || py === 0 ? 0.24 : 0.5 + (hash(Math.floor(u / 20), Math.floor(v / 20), seed) - 0.5) * 0.24 + (px === 1 || py === 1 ? 0.06 : 0); }); break;
      case 'deck': each((u, v, i) => { const pl = v % 6; T[i] = 0.55 + (hash(Math.floor(u / 48 + (Math.floor(v / 6) & 1) * 0.5), Math.floor(v / 6), seed) - 0.5) * 0.25 + (pl === 0 ? -0.3 : pl === 1 ? 0.08 : 0); }); break;
      case 'green': {                                                          // a roof garden's paving, a gravel strip along the parapets and its edging
        // (spec.gzone [x0, y0, x1, y1]: a big roof's garden is a terrace on part of it - the rest is membrane)
        const f = hash(seed, 3, 41), A = F(30, 30, seed + 4), Z = spec.gzone;
        each((u, v, i, x, y) => {
          const h1 = hash(x, y, seed + 2);
          if (Z && (x < Z[0] || y < Z[1] || x >= Z[2] || y >= Z[3])) { const s = u % 46; RI[i] = 12; T[i] = 0.56 + (A[y * w + x] - 0.5) * 0.12 + (h1 > 0.97 ? 0.08 : 0) + (s === 0 ? 0.12 : s === 1 ? -0.08 : 0); return; }
          const e = Z ? Math.min(u, v, iw - 1 - u, id - 1 - v, x - Z[0], y - Z[1], Z[2] - 1 - x, Z[3] - 1 - y) : Math.min(u, v, iw - 1 - u, id - 1 - v), p = u - 8, q = v - 8;
          if (e < 6) { RI[i] = 3; T[i] = 0.5 + (h1 > 0.8 ? 0.2 : h1 < 0.15 ? -0.2 : 0); return; }
          if (e < 8) { RI[i] = 2; T[i] = e === 6 ? 0.66 : 0.38; return; }
          if (f < 0.55) {                                                      // big slabs in a stretcher bond
            const row = Math.floor(q / 24), sx = p + (row & 1) * 12, a = sx % 24, b = q % 24;
            T[i] = a < 2 || b < 2 ? 0.2 : 0.55 + (hash(Math.floor(sx / 24), row, seed) - 0.5) * 0.22 + (a === 2 || b === 2 ? 0.08 : 0) + (A[y * w + x] - 0.5) * 0.1;
          } else if (f < 0.85) {                                               // decking, the butt joints staggered
            const b = Math.floor(q / 6), pl = q % 6, sx = p + (b & 3) * 37;
            RI[i] = 8; T[i] = 0.55 + (hash(Math.floor(sx / 54), b, seed) - 0.5) * 0.24 + (pl === 0 ? -0.3 : pl === 1 ? 0.08 : 0) + (sx % 54 === 0 ? -0.25 : 0);
          } else {                                                             // clay pavers in a basket weave
            const cx = Math.floor(p / 12), cy = Math.floor(q / 12), hz = (cx + cy) & 1, a = hz ? q % 12 : p % 12, b = hz ? p % 12 : q % 12;
            RI[i] = 9; T[i] = a % 4 === 0 || b === 0 ? 0.36 : 0.54 + (hash(cx * 3 + Math.floor(a / 4), cy, seed) - 0.5) * 0.16 + (A[y * w + x] - 0.5) * 0.12;
          }
        });
        break;
      }
      case 'sedum': {                                                          // a sedum roof: trays of it in a grid, a gravel margin, a path of pads
        const B = F(4, 4, seed + 7), alongX = iw >= id;
        each((u, v, i, x, y) => {
          const e = Math.min(u, v, iw - 1 - u, id - 1 - v), h1 = hash(x, y, seed + 2), pc = Math.abs(alongX ? v - (id >> 1) : u - (iw >> 1));
          if (e < 9) { RI[i] = 3; T[i] = 0.5 + (h1 > 0.8 ? 0.2 : h1 < 0.15 ? -0.2 : 0); return; }
          if (pc < 7) { const a = (alongX ? u : v) % 14; RI[i] = 2; T[i] = a > 11 || pc === 6 ? 0.22 : 0.55; return; }
          const p = u - 9, q = v - 9, tx = Math.floor(p / 26), ty = Math.floor(q / 26), a = p % 26, b = q % 26;
          if ((a < 2 || b < 2) && hash(x >> 1, y >> 1, seed + 12) > 0.3) { T[i] = a === 1 || b === 1 ? 0.48 : 0.26; return; }   // the trays' rims (the sedum spilling over them here and there)
          const th = hash(tx, ty, seed + 11), pv = vnoise(tx, ty, 3, seed + 3) + (th - 0.5) * 0.3;   // (greens mostly, ochre and red in patches across trays)
          RI[i] = pv < 0.5 ? 4 : pv < 0.66 ? 6 : pv < 0.8 ? 5 : 7; T[i] = 0.42 + (hash(x >> 1, y >> 1, seed + 6) - 0.5) * 0.34 + (B[y * w + x] - 0.5) * 0.2 - (a === 2 || b === 2 ? 0.14 : 0);
          if (th > 0.78 && hash(x >> 1, y >> 1, seed + 9) > 0.88) { RI[i] = 10 + ((tx + ty) & 1); T[i] = 0.6; }       // (in flower)
        });
        break;
      }
      case 'seats': {
        // A stadium's stand from above (spec.seatTo 'N' 'S' 'E' 'W': toward the pitch). The owner, 10-23: "Stadium seating
        // looks weird. Hard to tell what it is ... we should just have rows of seats with occasional NPCs sitting in them
        // ... The outside wall (facing us) is super thin too, maybe we have less seating areas so we can add some thickness
        // to the stadium structure. Or just put a stadium roof/cover over the seating areas but make it so you can still
        // see all of the field": from the pitch back - the advertising boards along the front wall, then the rows of
        // seats stepping up (each row: its concrete step, the seat pans, the seat backs, the riser's shadow; seats in the
        // club's red with navy bands, aisles of steps with yellow nosings every so often), a few people sat about (spec.crowd
        // scales how many: a quiet day's handful), the way-in tunnels (vomitories) half way up, and over the back third
        // the cantilever roof - pale sheeting on white steel ribs, its fascia casting a shadow on the rows below it - the
        // stand's thick back, never out over the pitch.
        const to = spec.seatTo || 'S', ax = to === 'E' || to === 'W', n = ax ? iw : id, along = ax ? id : iw, full = spec.crowd ?? 0.6;
        const S0 = 21, RED = S0, NAVY = S0 + 1, SHEET = S0 + 2, STEEL = S0 + 3, ADS = [S0 + 4, S0 + 5, S0 + 10, S0 + 1], SKIN = [S0 + 6, S0 + 7, S0 + 8], SHIRT = [S0 + 9, S0 + 10, S0, S0 + 5, S0 + 4, S0 + 11], CONC = S0 + 12;
        const FRONT = 8, ROOF = Math.round(n * 0.3), RP = 10, SP = 8, AISLE = 128, seatEnd = n - ROOF, rows = Math.floor((seatEnd - FRONT) / RP), vom = Math.floor(rows / 2);
        const sit = full * 0.18;   // (how many are sat: about a sixth of crowd's old "how full" - a quiet day's one seat in ten)
        each((u, v, i) => {
          const f = to === 'S' ? id - 1 - v : to === 'N' ? v : to === 'E' ? iw - 1 - u : u, a = ax ? v : u;
          ZO[i] = Math.round(-36 * (1 - Math.min(1, f / seatEnd)));                                     // (stepping up from the front)
          if (f < FRONT) {                                                                               // the front wall: its cap, the boards
            ZO[i] = -32;
            if (f < 2 || f === FRONT - 1) { RI[i] = CONC; T[i] = f === 0 ? 0.8 : 0.55; return; }
            const bd = Math.floor(a / 72), ba = a % 72;
            RI[i] = ADS[bd % 4]; T[i] = ba < 2 ? 0.2 : (f === 3 && ba % 9 < 6 && ba > 8 && ba < 64) ? 0.95 : 0.55;   // (a board, a line of its lettering)
            return;
          }
          if (f >= seatEnd) {                                                                            // the roof over the back rows
            const g = f - seatEnd;
            ZO[i] = 4;
            if (g < 3) { RI[i] = STEEL; T[i] = g === 0 ? 0.35 : 0.85; return; }          // (its fascia)
            if (a % 48 < 3) { RI[i] = STEEL; T[i] = a % 48 === 1 ? 0.9 : 0.6; return; }                   // (a rib)
            RI[i] = SHEET; T[i] = 0.56 + (g % 6 === 0 ? -0.14 : g % 6 === 1 ? 0.06 : 0) + (g < 10 ? -0.04 : 0);   // (the sheeting's corrugations, along the fascia)
            return;
          }
          const q = f - FRONT, row = Math.floor(q / RP), r = q % RP;
          const shade = seatEnd - f < 14 ? -0.18 * (1 - (seatEnd - f) / 14) : 0;                         // (under the roof's edge)
          if (row === vom && a % 400 > 180 && a % 400 < 228) { RI[i] = 20; T[i] = r < 2 ? 0.5 : 0.2; if (a % 400 < 183 || a % 400 > 225) { RI[i] = CONC; T[i] = 0.7; } return; }   // (a tunnel's mouth)
          if (a % AISLE < 8) { RI[i] = CONC; T[i] = (r < 1 ? 0.85 : r < 5 ? 0.6 : 0.45) + shade; if (r === 0) { RI[i] = S0 + 5; T[i] = 0.6; } return; }   // (the aisle's steps, their yellow nosings)
          if (r < 3) { RI[i] = CONC; T[i] = (r === 0 ? 0.3 : 0.62) + shade; return; }                   // the step in front of the row
          const sa = a % SP, seat = Math.floor(a / SP), col = row < 2 || row === vom + 1 || row === vom + 2 ? NAVY : RED;   // (navy bands: the front rows, the two over the tunnels)
          if (sa === SP - 1) { RI[i] = CONC; T[i] = 0.35 + shade; return; }                              // (between two seats)
          // somebody sat in this one: their shirt over the seat, their head above it (on screen: toward the back of a
          // stand facing the camera, toward the front of one facing away - seen from behind)
          const who = hash(seat, row, seed + 61);
          if (who < sit) {
            const k = (hash(seat, row, seed + 62) * 64) | 0, rr = to === 'N' ? 12 - r : r;
            if (rr >= 7 && sa > 0 && sa < SP - 2) { RI[i] = SKIN[k % 3]; T[i] = 0.55 + (rr === 9 ? -0.1 : 0.08) + shade; if (k % 7 === 0 && rr === 9) { RI[i] = SHIRT[(k >> 3) % 6]; T[i] = 0.5; } return; }   // (a head, some in a cap)
            if (rr >= 3 && rr < 7) { RI[i] = SHIRT[(k >> 2) % 6]; T[i] = 0.42 + (sa === 0 || sa === SP - 2 ? -0.1 : 0.06) + shade; return; }
          }
          RI[i] = col; T[i] = (r < 5 ? 0.6 : r < 8 ? 0.42 : 0.28) + (sa === 0 ? -0.08 : 0) + shade;     // the seat: its pan, its back, the riser's shadow
        });
        break;
      }
      case 'parking': {                                                        // a parking garage's top deck (Westport International's, Airport-A1): bays
        // in double rows across it, the drive aisles between, a car in most bays - its body, the windscreen and the back
        // window darker, the roof a shade lighter
        const A = F(30, 30, seed + 4), BW = 60, BD = 96, AI = 110, P = 2 * BD + AI, m0 = 14;
        each((u, v, i, x, y) => {
          T[i] = 0.52 + (A[y * w + x] - 0.5) * 0.12 + (hash(x, y, seed + 2) > 0.97 ? 0.06 : 0);
          if (u < m0 || v < m0 || u >= iw - m0 || v >= id - m0) return;
          const q = (v - m0) % P, row = Math.floor((v - m0) / P);
          if (q >= 2 * BD) { if (Math.abs(q - 2 * BD - AI / 2) < 1.5 && (u >> 4) % 2 === 0) { RI[i] = 13; T[i] = 0.5; } return; }   // (the aisle's dashed centre line)
          if (row * P + 2 * BD > id - 2 * m0) return;   // (no double row cut off at the far end)
          const half = q >= BD ? 1 : 0, bv = q - half * BD, bay = Math.floor((u - m0) / BW), bu = (u - m0) % BW;
          if (bu < 2 || (half === 0 && bv < 2) || (half === 1 && bv > BD - 3)) { RI[i] = 13; T[i] = 0.55; return; }   // (the bays' lines)
          const k = row * 2 + half;
          if (hash(bay, k, seed + 31) > 0.74 || bu < 9 || bu > BW - 8 || bv < 8 || bv > BD - 9) return;
          const n = half ? BD - 1 - bv : bv, r = Math.min(bu - 9, BW - 8 - bu);   // (n: from the nose, which faces the aisle)
          RI[i] = 14 + ((hash(bay, k, seed + 32) * 6) | 0);
          T[i] = 0.5 + (r < 2 ? -0.16 : 0) + (n > BD - 34 && n < BD - 22 ? 0.12 : 0);
          if ((n > BD - 46 && n < BD - 34 && r >= 2) || (n > BD - 22 && n < BD - 16 && r >= 2)) { RI[i] = 20; T[i] = 0.4; }   // (the windscreen, the back window)
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
    const nd = mat === 'green' || mat === 'sedum' || mat === 'deck' || mat === 'seats' || iw < 40 || id < 40 ? 0 : 1 + Math.round(w * d / 40000);
    for (let k = 0; k < nd; k++) {
      const du = 12 + rn(k, 5) * (iw - 24) | 0, dv = 12 + rn(k, 6) * (id - 24) | 0;
      for (let v = Math.max(0, dv - 13); v <= Math.min(id - 1, dv + 13); v++) for (let u = Math.max(0, du - 13); u <= Math.min(iw - 1, du + 13); u++) { const dd = Math.sqrt((u - du) * (u - du) + (v - dv) * (v - dv)); if (dd < 14) T[v * iw + u] -= dd < 2.5 ? 0.45 : (1 - dd / 14) * 0.14; }
    }
    for (const [px, py, pw, ph] of spec.pads || []) for (let y = Math.max(rw, py); y < Math.min(d - rw, py + ph); y++) for (let x = Math.max(rw, px); x < Math.min(w - rw, px + pw); x++) {
      const i = (y - rw) * iw + x - rw, a = (x - px) % 14, b = (y - py) % 14; RI[i] = 2; T[i] = a > 11 || b > 11 ? 0.2 : 0.55 + (a === 0 || b === 0 ? 0.12 : 0);
    }
    for (let v = 0, i = 0; v < id; v++) for (let u = 0; u < iw; u++, i++) {
      const x = u + rw, y = v + rw, e = Math.min(v, u, iw - 1 - u), ri = RI[i];             // the parapets' inner shadow
      G.put(x, y + L, step(RS[ri], T[i] - (e < 6 && L > 0 ? (6 - e) * 0.03 : 0), x, y, DI[ri]), UP, zD + (ZO ? ZO[i] : 0), null, 0);
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
  if (spec.pitch === 'mansard') return mansard(G0, spec, w, d, H, seed);
  // (spec.pitch 'saw': a sawtooth - teeth across the width, each rising west to east to its glazed north light; the
  // front wall's top a row of triangles, a tall window in each: the Arts District's warehouses, WC239)
  const saw = spec.pitch === 'saw', TW = Math.max(24, spec.tooth || 64);
  const k = spec.slope ?? (saw ? 0.5 : 0.75), gable = spec.pitch === 'gable', ns = gable && spec.ridge === 'ns';
  const E = Math.ceil((saw ? TW - 1 : ns ? w / 2 : gable ? d / 2 : Math.min(w, d) / 2) * k) + 2;
  const G = new GBuf(w, G0.h + E);
  G.ax = 0; G.ay = G0.ay + E;
  G.blit(G0, 0, E);
  const R = spec.roofColor ? ramp(spec.roofColor, 6, 3) : spec.roof === 'tile' ? MAT.terracotta : MAT.roofShingle || ramp('#5a5c66', 6, 3);
  const tile = spec.roof === 'tile', glazed = spec.roof === 'glass';
  const FACE = { w: [-0.7, 0, 0.7], e: [0.7, 0, 0.7], n: [0, -0.7, 0.7], s: [0, 0.7, 0.7] };
  const LIT = { w: 0.68, n: 0.58, s: 0.5, e: 0.32 };
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const dW = x, dE = w - 1 - x, dN = y, dS = d - 1 - y;
    let q, f;
    if (saw) { q = x % TW; f = 'w'; }
    else if (ns) { q = Math.min(dW, dE); f = dW < dE ? 'w' : 'e'; }
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
    const ridge = saw ? q >= TW - 2 : ns ? Math.abs(dW - dE) <= 1 : gable ? Math.abs(dN - dS) <= 1 : (Math.abs(dN - dS) <= 1 && q === Math.min(dN, dS)) || (q > 2 && Math.abs(Math.min(dW, dE) - Math.min(dN, dS)) < 0.6);
    if (ridge) t += 0.2;
    if (q < 2) t -= 0.14;                                                               // eave shadow line
    let c = step(R, t, x, row, 0.45), fl = 0;
    // a glazed roof (spec.roof 'glass': the glasshouses) - panes between white-grey iron ribs; the sawtooth's north lights
    if (glazed || (saw && q > TW * 0.7)) {
      const rib = glazed ? (along % 16 === 0 || q % 12 === 0 || ridge || q < 2) : (q === Math.ceil(TW * 0.7) + 1 || y % 18 === 0);
      c = rib ? step(ramp('#e4e6e0', 5, 2), 0.72 + (f === 'e' ? -0.22 : 0), x, row, 0) : step(ramp(glazed ? '#3e6e70' : '#7ab0b8', 6, 3), 0.3 + LIT[f] * 0.4 + (vnoise(x, y, 9, seed) - 0.5) * 0.2, x, row, 0.3);
      if (!rib) fl = F_GLASS;
    }
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
  // the sawtooth's end over the front wall: a triangle of wall to each tooth, a tall window in it
  if (saw) for (let x = 0; x < w; x++) {
    const lx = x % TW, top = Math.round(E + d - 1 - lx * k);
    for (let r = top + 1; r < E + d; r++) {
      const v = H + (E + d - r);
      let c = wallColor(spec.style || 'brick', x, v, seed, x, r);
      if (lx > TW * 0.42 && lx < TW * 0.82 && r > top + 3 && r < E + d - 3) c = (lx - Math.round(TW * 0.42)) % 6 === 0 ? MAT.metalDark[2] : MAT.glassDark[2];
      G.put(x, r, c, [0, 1, 0], v, null, 0);
    }
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

// A mansard roof (World v3's Midtown, Garden Crescent: the owner's WC338/341 - cream terraces under slate mansards):
// steep slate slopes up from the eaves for spec.mans px (slope spec.slope, steep), then a flat top with a lead curb
// at the break; dormer windows set in the south slope every 30 px, each a little window in a white frame under its
// own cap. Drawn north to south like the hip roof, each face shaded by which way it slopes.
function mansard(G0, spec, w, d, H, seed) {
  const k = spec.slope ?? 1.6, M = Math.min(spec.mans || 14, Math.floor(Math.min(w, d) / 2) - 1);
  const E = Math.ceil(M * k) + 2, rows = Math.ceil(1 + k);
  const G = new GBuf(w, G0.h + E);
  G.ax = 0; G.ay = G0.ay + E;
  G.blit(G0, 0, E);
  const R = spec.roofColor ? ramp(spec.roofColor, 6, 3) : ramp('#4a5260', 6, 3), lead = ramp('#7a828a', 5, 3), frame = ramp('#ece6d8', 5, 2);
  const FACE = { w: [-0.85, 0, 0.5], e: [0.85, 0, 0.5], n: [0, -0.85, 0.5], s: [0, 0.85, 0.5], t: [0, 0.25, 0.97] };
  const LIT = { w: 0.66, n: 0.56, s: 0.5, e: 0.34, t: 0.6 };
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const dW = x, dE = w - 1 - x, dN = y, dS = d - 1 - y, q = Math.min(dW, dE, dN, dS);
    let f = q >= M ? 't' : q === dS ? 's' : q === dN ? 'n' : q === dW ? 'w' : 'e';
    const z = Math.min(q, M) * k, row = Math.round(E + y - z);
    let t = LIT[f] + (vnoise(x, y, 11, seed) - 0.5) * 0.12, c;
    if (f === 't') c = q <= M + 1 ? step(lead, 0.7, x, row, 0.3) : step(R, t + 0.06 + ((x >> 3) + (y >> 3)) % 2 * 0.03, x, row, 0.4);   // (the lead curb at the break, then the flat)
    else {
      // slates in courses up the slope, a dark line at the eave
      t += (q % 3 === 0 ? -0.16 : 0) + (((f === 's' || f === 'n' ? x : y) + (Math.floor(q / 3) & 1) * 3) % 6 === 0 ? -0.08 : 0) + (q < 1 ? -0.18 : 0);
      c = step(R, t, x, row, 0.45);
      // a dormer in the south slope: its white frame, the glass, a cap over it
      if (f === 's' && w >= 26 && q >= 2 && q < M - 1) {
        const a = (x - Math.floor((w % 30) / 2) + 30) % 30;
        if (a >= 9 && a < 21 && x > 3 && x < w - 4) {
          const edge = a === 9 || a === 20 || q === M - 2, glass = !edge && q >= 3 && q < M - 3;
          c = glass ? step(MAT.glassDark, 0.4 + (a === 14 ? 0.2 : 0), x, row, 0.2) : edge && q === M - 2 ? step(R, 0.3, x, row, 0.3) : step(frame, 0.7, x, row, 0.2);
          f = 's';
        }
      }
    }
    for (let r = row; r <= row + (f === 's' ? rows : 0); r++) G.put(x, r, c, FACE[f], H + z, null, 0);
  }
  if (spec.chimney) { for (const fx of [0.22, 0.78]) { const cx = Math.floor(w * fx), cy = Math.floor(d * 0.3), z = M * k; for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 7; xx++) G.put(cx + xx, Math.round(E + cy - z - 12 + yy), step(MAT.brick, xx < 2 ? 0.7 : 0.45, xx, yy, 0.3), [0, 1, 0], H + z + 12, null, 0); } }
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

// A door that opens live (shared/doors.js: spec.shop.live / spec.doors[i].live 'slide' | 'hinge'), baked shut - the page
// draws it opening over this as someone comes up to it (client/art2/game/doorart.js, the same leaves): sliding glass in
// a steel frame, the shop dim behind it; or a painted door (DOOR_COLS[c]) with a glass light, a brass knob, a kick plate
export function liveDoor(G, x0, y0, w, h, style, night, c = 0) {
  const P = ramp(DOOR_COLS[c % DOOR_COLS.length], 5, 2), slide = style === 'slide', mid = w >> 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (x < 2 || x >= w - 2 || y < 2) { setC(G, X, Y, step(slide ? MAT.metal : MAT.stone, x < 2 || y < 2 ? 0.75 : 0.45, X, Y, 0)); continue; }
    if (slide) {
      const rail = y < 5 || y >= h - 3 || x < 4 || x >= w - 4 || Math.abs(x - mid + 0.5) < 1.5;
      if (rail) { setC(G, X, Y, step(MAT.metal, y < 5 ? 0.35 : Math.abs(x - mid + 0.5) < 0.6 ? 0.15 : 0.55, X, Y, 0)); continue; }
      const streak = ((x + (h - y)) % 17) < 3, back = y > h * 0.62 ? 0.5 : 0.3;
      setC(G, X, Y, step(MAT.glass, back + (streak ? 0.3 : 0) - (y / h) * 0.1, X, Y, 0.3)); glow(G, X, Y, [255, 200, 130, 12 + night * 60]);
    } else {   // (a wide doorway: a pair, meeting in the middle - the hinges at the sides)
      const dbl = w >= 34, lx = dbl && x >= mid ? w - 1 - x : x, LW = dbl ? mid : w;
      if (dbl && Math.abs(x - mid + 0.5) < 1) { setC(G, X, Y, step(P, 0.1, X, Y, 0)); continue; }
      const pane = y >= 6 && y < Math.round(h * 0.46) && lx >= 5 && lx < LW - (dbl ? 3 : 5), knob = lx === LW - (dbl ? 3 : 6) && Math.abs(y - Math.round(h * 0.56)) < 1;
      if (pane) { setC(G, X, Y, step(MAT.glassDark, 0.4 + (y === 6 ? 0.3 : 0), X, Y, 0.3)); glow(G, X, Y, [255, 196, 120, 18 + night * 80]); continue; }
      if (knob) { setC(G, X, Y, [214, 176, 80]); continue; }
      if (y >= h - 5) { setC(G, X, Y, step(MAT.metal, 0.5, X, Y, 0)); continue; }   // (the kick plate)
      const inset = (lx === 4 || lx === LW - 5) && y > h * 0.5 || y === Math.round(h * 0.5) || y === Math.round(h * 0.75) && lx > 3 && lx < LW - 4;
      setC(G, X, Y, step(P, inset ? 0.25 : lx === 2 || lx === 3 ? 0.35 : 0.6, X, Y, 0.3));
    }
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
    } else if (shop.kind === 'books') {                                                             // shelves of spines, a table of new ones
      c = step(ramp('#5a3e2a', 5, 2), 0.35, x, y, 0.6);
      const shelf = iy % 9;
      if (shelf === 0) c = step(ramp('#7a5434', 5, 2), 0.6, x, y, 0);
      else if (iy < H2 * 0.7 && shelf > 1) { const g = hash(x >> 1, (iy / 9) | 0, seed + 7); c = g > 0.12 ? [[150, 50, 44], [40, 70, 120], [60, 110, 70], [200, 180, 120], [110, 60, 90], [210, 120, 50]][Math.floor(g * 60) % 6].map((v) => v * (shelf < 3 ? 0.7 : 1)) : c; }
      else if (iy >= H2 * 0.78) c = (x >> 3) % 2 ? [226, 214, 190] : [120, 150, 180];
    } else if (shop.kind === 'records') {                                                           // posters up top, the bins of sleeves below
      c = step(ramp('#3a3440', 5, 2), 0.35 + (iy / H2) * 0.2, x, y, 0.8);
      const px2 = Math.floor((x - 4) / 22);
      if (iy > 2 && iy < H2 * 0.42 && (x - 4) % 22 > 3 && (x - 4) % 22 < 19) { const g = hash(px2, 1, seed + 9); c = [[220, 70, 60], [240, 200, 70], [60, 160, 200], [230, 120, 180], [90, 200, 120]][Math.floor(g * 5)]; if (((x + iy) % 7) < 2) c = c.map((v) => v * 0.6); }
      else if (iy > H2 * 0.58 && iy < H2 * 0.85) { const g = hash(x >> 2, 3, seed + 11); c = (x % 4) === 0 ? [30, 26, 34] : [[200, 60, 50], [40, 40, 44], [230, 220, 200], [60, 110, 170], [220, 170, 60]][Math.floor(g * 5)]; }
      else if (iy >= H2 * 0.85) c = [120, 84, 52];
    } else if (shop.kind === 'laundry') {                                                           // a row of washers, their round doors, dryers above
      c = step(ramp('#cfd6d8', 5, 2), 0.6, x, y, 0.5);
      const lx = (x - 4) % 20, row = iy < H2 * 0.48 ? 0 : 1, ly = row ? iy - H2 * 0.5 : iy - 2, cy = row ? H2 * 0.23 : H2 * 0.2;
      if (lx < 2) c = [150, 158, 164];
      else if (Math.hypot(lx - 10, ly - cy) < 6) c = Math.hypot(lx - 10, ly - cy) < 4.6 ? (row ? [70, 110, 150] : [60, 64, 72]) : [190, 196, 200];
      else c = row ? [236, 238, 236] : [214, 218, 220];
    } else if (shop.kind === 'clothes') {                                                           // racks of clothes on hangers, a mannequin
      c = step(ramp('#e4dccc', 5, 2), 0.55 + (iy / H2) * 0.15, x, y, 0.6);
      if (iy === 5) c = MAT.chrome[2];
      else if (iy > 5 && iy < H2 * 0.75) { const g = hash(x >> 2, 5, seed + 13); if (g > 0.18) c = [[150, 40, 50], [40, 50, 90], [210, 200, 180], [60, 90, 70], [190, 140, 80], [30, 30, 36], [170, 120, 160]][Math.floor(g * 70) % 7].map((v) => v * (iy > H2 * 0.7 ? 0.8 : 1)); }
      if (Math.abs(((x - 4) % 90) - 70) < 4 && iy > 3) c = iy < 8 ? [230, 214, 196] : [240, 236, 228];
    } else if (shop.kind === 'florist') {                                                           // buckets of flowers, greenery behind
      c = step(ramp('#4a7040', 5, 2), 0.35 + (iy / H2) * 0.25, x, y, 0.8);
      if (iy > H2 * 0.3 && iy < H2 * 0.8 && hash(x >> 1, iy >> 1, seed + 15) > 0.45) c = [[230, 70, 90], [250, 210, 70], [245, 245, 240], [200, 90, 200], [250, 140, 60]][Math.floor(hash(x >> 2, iy >> 2, seed + 16) * 5)];
      if (iy >= H2 * 0.8) c = ((x >> 3) & 1) ? [90, 90, 96] : [150, 110, 70];
    } else if (shop.kind === 'gallery') {                                                           // white walls, canvases hung in a line under the track lights, a plinth
      c = step(ramp('#f2f0ea', 5, 2), 0.62 + (iy / H2) * 0.1, x, y, 0.3);
      const lx = (x - 4) % 46, cw2 = 16 + Math.floor(hash(Math.floor((x - 4) / 46), 2, seed + 17) * 14), g = hash(Math.floor((x - 4) / 46), 3, seed + 19);
      if (iy < 3) c = (x % 12) < 3 ? [255, 240, 200] : [60, 60, 66];                                 // the track and its spots
      else if (lx >= 8 && lx < 8 + cw2 && iy > H2 * 0.18 && iy < H2 * 0.62) {                          // a canvas: bold blocks of colour, a thin frame
        const fr = lx === 8 || lx === 7 + cw2 || iy < H2 * 0.18 + 1.5 || iy > H2 * 0.62 - 1.5;
        const P = [[220, 70, 60], [40, 90, 170], [240, 200, 70], [30, 30, 36], [90, 170, 140], [230, 130, 160]], k = Math.floor(g * 6);
        c = fr ? [40, 36, 34] : (lx - 8) < cw2 * (0.3 + g * 0.4) ? P[k] : (iy > H2 * 0.4 ? P[(k + 2) % 6] : P[(k + 4) % 6]);
      } else if (g > 0.6 && Math.abs(lx - 38) < 4 && iy > H2 * 0.55) c = iy < H2 * 0.7 ? [180, 90, 60] : [236, 234, 228];   // a sculpture on its plinth
      if (iy >= H2 * 0.88) c = step(ramp('#b8b0a4', 5, 2), 0.55, x, y, 0.2);                          // the polished floor
    } else if (shop.kind === 'salon') {                                                             // mirrors along the back, the chairs in front of them
      c = step(ramp('#e8e2dc', 5, 2), 0.6, x, y, 0.4);
      const lx = (x - 4) % 30;
      if (lx > 6 && lx < 24 && iy > 3 && iy < H2 * 0.55) c = (lx > 8 && lx < 22 && iy > 5) ? step(ramp('#a8c0cc', 5, 2), 0.6 - iy / H2 * 0.4, x, y, 0.3) : [200, 170, 110];
      else if (lx > 9 && lx < 21 && iy > H2 * 0.6 && iy < H2 * 0.9) c = [40, 36, 40];
      else if (iy >= H2 * 0.9) c = (((x >> 2) + (iy >> 2)) & 1) ? [30, 30, 32] : [230, 230, 226];
    } else {
      c = step(ramp('#a88a64', 5, 2), 0.35 + (iy / H2) * 0.35, x, y, 0.8);
      const shelf = iy % 10;
      if (shelf === 0) c = MAT.metalDark[3];
      else if (shelf < 7) { const g = hash(x >> 1, (iy / 10) | 0, seed); c = g > 0.72 ? [204, 72, 64] : g > 0.52 ? [236, 200, 80] : g > 0.32 ? [76, 146, 204] : g > 0.16 ? [116, 180, 100] : [226, 224, 214]; }
    }
    if (((x + (winBot - y)) % 26) < 3) c = c.map((v) => Math.min(255, v + 36));
    setC(G, x, y, c);
    // lit from inside: the glow carries the room's own colours (warmed), so after dark the interior reads through the
    // glass - shelves, the counter, the booths - rather than one flat bright pane (2026-10-09, R1-C/E)
    glow(G, x, y, [Math.min(255, c[0] * 0.75 + 50), Math.min(255, c[1] * 0.7 + 36), Math.min(255, c[2] * 0.6 + 18), 22 + night * 74]);
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
  if (shop.live) liveDoor(G, doorX, y0 - 50, doorW, 50, shop.live, night, shop.doorC | 0);
  else door(G, doorX, y0 - 50, doorW, 50, shop.open !== false, night, seed);
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

// A motel's front (spec.motel = { room: px per room, door: its doors' colour, stair: 'left' | 'right' - the end its stair
// climbs at; the Pink Mile's motels, World v3): every room a door, a window and the AC box under it, a lamp by the door,
// on both floors; the upper floor's open gallery - the slab's edge, the rail, its posts, the columns down between the
// rooms, its shade on the rooms under it - and the stair up to it at one end
function motelFront(G, w, gH, floors, spec, seed, night, fy) {
  const M = spec.motel, SB = 46, stairL = M.stair === 'left', x0 = stairL ? SB : 6, x1 = stairL ? w - 6 : w - SB;
  const n = Math.max(1, Math.round((x1 - x0) / (M.room || 96))), rw = (x1 - x0) / n, DC = ramp(M.door || '#2e8a8a', 5, 2);
  const darken = (x, Y, k) => { if (!G.inside(x, Y)) return; const j = (Y * G.w + x) * 4; G.col[j] *= k; G.col[j + 1] *= k; G.col[j + 2] *= k; };
  for (let f = 0; f < floors; f++) {
    const base = f === 0 ? 0 : gH + (f - 1) * FLOOR;
    for (let i = 0; i < n; i++) {
      const rx = Math.round(x0 + i * rw), dx = rx + 10, wx = rx + Math.round(rw * 0.5) - 2, top = fy(base + 44);
      for (let y = 0; y < 44; y++) for (let x = 0; x < 18; x++) { const X = dx + x, Y = top + y, fr = x < 2 || x >= 16 || y < 2; setC(G, X, Y, fr ? step(MAT.stone, 0.72, X, Y, 0) : step(DC, x === 4 || x === 13 || y === 20 ? 0.3 : 0.62, X, Y, 0.3)); }
      setC(G, dx + 13, top + 24, MAT.chrome ? MAT.chrome[4] : [220, 220, 210]);   // (the knob)
      const lit = hash(i, f, seed + 51) < night * 0.7 + (night > 0 ? 0.1 : 0);
      sash(G, wx, fy(base + 40), 28, 22, lit, seed + i * 3 + f * 17);
      if (rw >= 80) acBox(G, wx + 7, fy(base + 13));
      const lx = dx + 21, ly = fy(base + 38);
      for (let k = 0; k < 4; k++) for (let q = 0; q < 3; q++) { setC(G, lx + q, ly + k, k === 0 ? MAT.metalDark[1] : [250, 226, 160]); if (k) glow(G, lx + q, ly + k, [255, 210, 140, 110 + night * 135]); }
    }
  }
  for (let f = 1; f < floors; f++) {
    const yb = fy(gH + (f - 1) * FLOOR) + 1;   // (the slab's top row)
    for (let k = 1; k <= 12; k++) for (let x = 0; x < w; x++) darken(x, yb + 3 + k, 0.62 + 0.38 * (k / 12));   // (the gallery's shade)
    for (let x = 2; x < w - 2; x++) {
      for (let k = 0; k < 4; k++) setC(G, x, yb + k, step(MAT.stone, k === 0 ? 0.88 : 0.55 - k * 0.08, x, k, 0.3));
      setC(G, x, yb - 15, MAT.metal[4]); setC(G, x, yb - 14, MAT.metal[2]);
      if (x % 5 === 0) for (let k = 1; k < 14; k++) setC(G, x, yb - k, MAT.metal[2]);
    }
    // the columns under the slab, between the rooms
    for (let i = 0; i <= n; i++) { const cx = Math.round(x0 + i * rw) - 2; for (let Y = yb + 4; Y < fy(0); Y++) for (let q = 0; q < 4; q++) setC(G, cx + q, Y, step(MAT.stone, q === 0 ? 0.8 : 0.5, cx + q, Y, 0.2)); }
  }
  // the stair: from the pavement at the building's end up across its bay to the gallery
  if (floors > 1) {
    const yTop = fy(gH) + 1, yBot = fy(0), dir = stairL ? 1 : -1, xa = stairL ? 4 : w - 5, steps = Math.round(gH / 7);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps, X = Math.round(xa + dir * t * (SB - 10)), Y = Math.round(yBot - t * (yBot - yTop));
      for (let q = -3; q <= 3; q++) setC(G, X + q, Y, step(MAT.stone, 0.8, X + q, Y, 0.2));   // (a tread)
      for (let k = 1; k < 3; k++) setC(G, X + dir * 3, Y + k, MAT.metalDark[1]);              // (its riser's shadow)
      for (let k = 12; k < 14; k++) setC(G, X, Y - k, MAT.metal[k === 12 ? 2 : 4]);            // (the handrail)
      if (s % 2 === 0) for (let k = 1; k < 12; k++) setC(G, X, Y - k, MAT.metal[2]);
    }
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
  } else if (icon === 'skull') {   // a bull skull (the Rusty Spur, task #366): horns sweeping up and out, the long face, two eyes
    for (let t = 0; t <= 1.0001; t += 0.08) { const hx = Math.round(9 * t), hy = Math.round(9 - 7 * t + 5 * t * t * -1 + 3 * t); pts.push([8 - hx, hy], [16 + hx, hy]); }
    for (let y = 8; y <= 24; y++) { const hw = Math.round(5 - (y - 8) * 0.19); pts.push([12 - hw, y], [12 + hw, y]); }
    for (let x = 7; x <= 17; x++) pts.push([x, 8]);
    for (let x = 10; x <= 14; x++) pts.push([x, 24]);
    for (const ex of [9, 15]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pts.push([ex - 1 + dx, 13 + dy]);
    pts.push([11, 21], [13, 21]);
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
  const { x: x0, w, h } = m, k = m.kind || 'sunset';
  const cl = (c) => c.map((v) => Math.max(0, Math.min(255, v | 0)));
  // (MU1's kinds, invented: a sunset over palms, a breaking wave, big flowers, bold chevrons, a tiger, a night skyline,
  // koi in a pond - painted on the wall, edge to edge)
  const fl = [[230, 70, 90], [250, 190, 60], [240, 240, 236], [190, 90, 210], [250, 130, 50]], geo = [[226, 176, 60], [40, 140, 140], [230, 110, 90], [36, 50, 90], [240, 230, 210]];
  const blooms = [], fish = [], blds = [];
  if (k === 'flowers') for (let i = 0; i < Math.max(3, Math.floor(w / 46)); i++) blooms.push([12 + hash(i, 1, seed) * (w - 24), 12 + hash(i, 2, seed) * (h - 24), 9 + hash(i, 3, seed) * 9, fl[i % fl.length]]);
  if (k === 'koi') for (let i = 0; i < Math.max(2, Math.floor(w / 60)); i++) fish.push([20 + hash(i, 4, seed) * (w - 40), 14 + hash(i, 5, seed) * (h - 28), hash(i, 6, seed) * 6.28, i % 3]);
  if (k === 'skyline') for (let x = 0; x < w;) { const bw = 10 + Math.floor(hash(x, 7, seed) * 18); blds.push([x, bw, h * (0.3 + hash(x, 8, seed) * 0.45)]); x += bw + 1; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = yGround - h + y, t = y / h;
    let c;
    if (k === 'waves') {
      const v = y + Math.sin(x * 0.07 + seed) * h * 0.12 + Math.sin(x * 0.19) * 3, band = Math.floor(v / (h / 6)), f = (v % (h / 6)) / (h / 6);
      c = [[24, 50, 110], [30, 80, 150], [40, 110, 180], [60, 150, 200], [30, 80, 150], [20, 40, 90], [20, 40, 90]][Math.max(0, Math.min(6, band))];
      if (f < 0.14 && band > 0) c = [236, 242, 246];
      if (t < 0.18) c = [240, 220, 180];
    } else if (k === 'flowers') {
      c = (x + y) % 9 < 2 ? [40, 90, 60] : [30, 70, 50];
      for (const [bx, by, r, col] of blooms) { const dx = x - bx, dy = y - by, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx); if (d < r * (0.62 + 0.38 * Math.abs(Math.cos(a * 2.5)))) c = d < r * 0.28 ? [250, 210, 60] : col.map((v) => v * (0.8 + 0.2 * (1 - d / r))); }
    } else if (k === 'geo') {
      const v = Math.floor((x + Math.abs((y % 40) - 20) * 1.4) / 18);
      c = geo[((v % 5) + 5) % 5];
      if (((x + Math.abs((y % 40) - 20) * 1.4) % 18) < 2) c = [30, 26, 34];
    } else if (k === 'tiger') {
      c = [232, 128, 40];
      const st = Math.sin(x * 0.23 + Math.sin(y * 0.11 + seed) * 2.2);
      if (st > 0.72 && Math.abs(x - w / 2) > w * 0.08) c = [26, 20, 22];
      if (Math.abs(x - w / 2) < w * 0.12 && t > 0.45) c = [244, 236, 220];
      for (const ex of [w / 2 - w * 0.13, w / 2 + w * 0.13]) { const d = Math.hypot((x - ex) / 1.6, y - h * 0.34); if (d < 5) c = d < 2.2 ? [20, 20, 20] : [200, 230, 70]; }
      if (Math.hypot(x - w / 2, (y - h * 0.62) * 1.4) < 4) c = [190, 80, 90];
    } else if (k === 'skyline') {
      c = [70 + t * 170, 50 + t * 80, 120 - t * 40];
      if (hash(x, y, seed) > 0.992 && t < 0.5) c = [250, 246, 220];
      if (Math.hypot(x - w * 0.78, y - h * 0.22) < 8) c = [250, 240, 200];
      for (const [bx, bw, bh] of blds) if (x >= bx && x < bx + bw && y > h - bh) c = (x - bx) % 4 === 1 && (y % 6) === 2 && hash(x, y, seed + 3) > 0.35 ? [250, 210, 110] : [40, 30, 62];
    } else if (k === 'koi') {
      c = [40, 120 + Math.sin((x + y) * 0.2) * 12, 130];
      if (Math.sin(Math.hypot(x - w * 0.3, y - h * 0.4) * 0.5) > 0.94) c = [90, 170, 170];
      if (Math.hypot(x - w * 0.82, y - h * 0.7) < 9 || Math.hypot(x - w * 0.12, y - h * 0.25) < 7) c = [60, 140, 60];
      for (const [fx, fy, a, v] of fish) { const dx = (x - fx) * Math.cos(a) + (y - fy) * Math.sin(a), dy = -(x - fx) * Math.sin(a) + (y - fy) * Math.cos(a); if ((dx / 11) ** 2 + (dy / 4.5) ** 2 < 1 || (dx < -9 && dx > -15 && Math.abs(dy) < (-9 - dx) * 0.8)) c = v === 1 || (v === 2 && dx > 2) ? [244, 240, 232] : [240, 110, 40]; }
    } else {
      c = t < 0.6 ? [255 - t * 120, 120 + t * 80, 140 - t * 60] : [70, 50 + t * 40, 110];
      const sun = Math.hypot(x - w * 0.6, y - h * 0.58);
      if (sun < h * 0.22 && t < 0.62) c = [255, 210 - sun, 90];
      if (t > 0.6 && t < 0.63) c = [255, 170, 90];
      for (const px of [w * 0.2, w * 0.82]) { if (Math.abs(x - px - (h - y) * 0.08) < 1.5 && t > 0.3) c = [30, 24, 40]; if (Math.abs(y - h * 0.3) < 4 - Math.abs(x - px) * 0.25 && Math.abs(x - px) < 14) c = [30, 24, 40]; }
    }
    if (m.text && t > 0.72) c = [44, 30, 70];
    setC(G, X, Y, cl(c));
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
  if (b.paint) {   // a painted sign hung off the wall (a shop's, by day): its own colours, no tubes
    const bg = ramp(b.bg || '#2a3a5a', 5, 2), fg = b.fg || [240, 232, 210];
    for (let k = 0; k < 2; k++) for (let x = -3; x < 2; x++) setC(G, x0 + x, y0 + 8 + k * (h - 18), MAT.metalDark[1]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = x === 0 || y === 0 || x === w - 1 || y === h - 1; setC(G, x0 + x, y0 + y, e ? MAT.metalDark[2] : x === 1 || y === 1 ? bg[3] : bg[2]); }
    for (let i = 0; i < t.length; i++) drawText((px, py) => setC(G, px, py, fg), t[i], x0 + 5, y0 + 6 + i * (5 * sx + 4), { sx, sy: sx, gap: 1 });
    return;
  }
  for (let k = 0; k < 2; k++) for (let x = -3; x < 2; x++) setC(G, x0 + x, y0 + 8 + k * (h - 18), MAT.metalDark[1]);      // brackets
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const e = x === 0 || y === 0 || x === w - 1 || y === h - 1, e2 = x === 2 || y === 2 || x === w - 3 || y === h - 3;
    if (e) setC(G, x0 + x, y0 + y, MAT.metalDark[2]);
    else if (e2) { setC(G, x0 + x, y0 + y, col.map((v) => Math.min(255, v * 0.5 + 120))); glow(G, x0 + x, y0 + y, [...col, 150 + night * 100]); }
    else setC(G, x0 + x, y0 + y, [24, 20, 32]);
  }
  for (let i = 0; i < t.length; i++) drawText((px, py) => { setC(G, px, py, col.map((v) => Math.min(255, v * 0.55 + 115))); glow(G, px, py, [...col, 170 + night * 85]); }, t[i], x0 + 5, y0 + 6 + i * (5 * sx + 4), { sx, sy: sx, gap: 1 });
}
// the medical sign (the owner, 2026-10-18: never the red cross, a protected emblem): a hospital's red letter H on a white
// panel; a clinic's white cross on a green one (k 'clinic'), the pharmacy sign of the Midtown concepts
function medSign(G, x0, y0, s, night, k = 'hospital') {
  const clinic = k === 'clinic';
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const a = s * 0.24, b = s * 0.76, t = s * 0.17, c = s / 2, inner = y > s * 0.18 && y < s * 0.82;
    const h = clinic ? (Math.abs(x + 0.5 - c) < s * 0.13 || Math.abs(y + 0.5 - c) < s * 0.13) && Math.abs(x + 0.5 - c) < s * 0.36 && Math.abs(y + 0.5 - c) < s * 0.36
      : inner && ((x + 0.5 > a && x + 0.5 < a + t) || (x + 0.5 > b - t && x + 0.5 < b) || (x + 0.5 >= a && x + 0.5 <= b && Math.abs(y + 0.5 - c) < t * 0.55));
    const col = clinic ? (h ? [246, 246, 240] : [34, 128, 84]) : h ? [212, 40, 44] : [244, 242, 236];
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
