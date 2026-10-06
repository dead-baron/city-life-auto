// Art v2 ground: roads, kerbs, sidewalks, crossings, sand, surf, water, grass and dirt, painted
// straight into a scene G-buffer (normal up, height 0, flagged as ground so rain can wet it).
//
// paintGround(G, kindAt, seed): kindAt(x, y) -> a ground kind name for every pixel; then the
// decorators below add markings, kerbs, drains and wear on top.
import { MAT, ramp } from './palette.js';
import { drawText } from './font.js';
import { F_GROUND, F_WATER, F_WET, hash, vnoise, bayer, step, norm } from './gbuf.js';

const UP = [0, 0, 1];
const pick = (R, i) => R[Math.max(0, Math.min(R.length - 1, i))];

// per-pixel ground colour by kind
function groundPixel(kind, x, y, seed) {
  const h = hash(x, y, seed), big = vnoise(x, y, 46, seed + 3), mid = vnoise(x, y, 11, seed + 5);
  switch (kind) {
    case 'asphalt': case 'asphaltWorn': {
      const R = kind === 'asphalt' ? MAT.asphalt : MAT.asphaltWorn;
      let t = 0.5 + (big - 0.5) * 0.35 + (mid - 0.5) * 0.25;
      if (h > 0.94) t += 0.28; else if (h < 0.05) t -= 0.25;      // aggregate speckle
      if (h > 0.985) return { c: step(MAT.pebble, 0.4 + hash(x, y, seed + 1) * 0.6, x, y, 0) };   // warm pebbles
      return { c: step(R, t, x, y, 0.8) };
    }
    case 'sidewalk': case 'paver': {
      const R = kind === 'sidewalk' ? MAT.concrete : MAT.paver, S = kind === 'sidewalk' ? 22 : 16;
      const sx = Math.floor(x / S), sy = Math.floor(y / S), lx = x - sx * S, ly = y - sy * S;
      const slab = hash(sx, sy, seed + 9);
      let t = 0.55 + (slab - 0.5) * 0.18 + (mid - 0.5) * 0.12 + (h > 0.93 ? 0.12 : 0) - (h < 0.04 ? 0.12 : 0);
      if (lx === 0 || ly === 0) t -= 0.2;                       // seams
      else if (lx === 1 || ly === 1) t += 0.08;                 // the lit lip of each slab
      if (vnoise(x, y, 7, seed + 77) > 0.83 && slab > 0.6) t -= 0.12; // stains
      return { c: step(R, t, x, y, 0.6) };
    }
    case 'sand': {
      let t = 0.58 + (big - 0.5) * 0.25 + (mid - 0.5) * 0.2 + (h > 0.9 ? 0.15 : 0) - (h < 0.08 ? 0.15 : 0);
      return { c: step(MAT.sand, t, x, y, 1) };
    }
    case 'sandWet': return { c: step(MAT.sandWet, 0.5 + (mid - 0.5) * 0.3, x, y, 1) };
    case 'grass': {
      let t = 0.5 + (big - 0.5) * 0.4 + (mid - 0.5) * 0.3;
      if ((x + (y >> 1) * 3) % 5 === 0 && h > 0.5) t += 0.25;   // blade strokes
      if (h < 0.06) t -= 0.3;
      return { c: step(MAT.grass, t, x, y, 1) };
    }
    case 'soil': return { c: step(MAT.soil, 0.5 + (mid - 0.5) * 0.4 + (h > 0.9 ? 0.2 : 0), x, y, 1) };
    case 'water': case 'waterDeep': {
      const R = kind === 'water' ? MAT.water : MAT.waterDeep;
      // swells: soft bands of lighter and darker water, broken into short crests by noise
      const sw = Math.sin(y * 0.16 + vnoise(x, y, 23, seed + 7) * 5 + x * 0.03);
      const br = vnoise(x, y * 2, 9, seed + 11);
      let t = 0.42 + (big - 0.5) * 0.35 + sw * 0.1;
      if (sw > 0.82 && br > 0.55) t += 0.3;                       // a crest catching light
      if (sw < -0.85 && br < 0.4) t -= 0.18;
      const glint = h > 0.982 && sw > 0.5;
      return { c: step(R, t, x, y, 0.7), water: true, e: glint ? [255, 248, 225, 140] : null, n: norm([sw * 0.08, Math.cos(y * 0.16) * 0.18, 1]) };
    }
    case 'dock': {
      const plank = Math.floor(x / 7), lx = x % 7;
      let t = 0.5 + (hash(plank, Math.floor(y / 40), seed) - 0.5) * 0.3 + (mid - 0.5) * 0.15;
      if (lx === 0) t = 0.05;                                   // gaps between planks
      if (lx === 1) t += 0.15;
      if ((y + plank * 13) % 40 === 0) t -= 0.3;                // butt joints
      if (hash(x >> 1, y >> 1, seed + 3) > 0.985) t = 0.1;      // nail heads
      return { c: step(MAT.woodDock, t, x, y, 0.6) };
    }
    case 'asphaltRed': {                                         // a painted bus lane
      let t = 0.5 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.2 + (h > 0.94 ? 0.2 : h < 0.05 ? -0.2 : 0);
      return { c: step(BUSLANE, t, x, y, 0.8) };
    }
    case 'driveway': {                                           // poured concrete, big slabs, tyre stains
      const S = 38, lx = x % S, ly = y % S;
      let t = 0.5 + (mid - 0.5) * 0.14 + (big - 0.5) * 0.1 + (h > 0.95 ? 0.1 : 0) - (h < 0.04 ? 0.1 : 0);
      if (lx === 0 || ly === 0) t -= 0.22;
      if (vnoise(x, y, 9, seed + 31) > 0.8) t -= 0.1;
      return { c: step(MAT.concrete, t, x, y, 0.6) };
    }
    case 'cobble': {                                             // rounded setts in offset rows
      const row = Math.floor(y / 6), ox = (row & 1) * 4, cx = Math.floor((x + ox) / 8);
      const lx = (x + ox) % 8, ly = y % 6, st = hash(cx, row, seed + 13);
      const edge = lx === 0 || ly === 0, lit = lx === 1 || ly === 1, low = lx === 7 || ly === 5;
      let t = 0.5 + (st - 0.5) * 0.3 + (big - 0.5) * 0.12 + (lit ? 0.18 : 0) - (low ? 0.12 : 0);
      if (edge) t = 0.12;
      return { c: step(COBBLE, t, x, y, 0.4) };
    }
    case 'brick': {                                              // herringbone brick paving
      const u = x + y, v = x - y, a = Math.floor(u / 8), b = Math.floor(v / 4), hb = (a + b) & 1;
      const lx = hb ? u % 8 : v % 4;
      let t = 0.5 + (hash(a, b, seed + 17) - 0.5) * 0.3 + (mid - 0.5) * 0.12;
      if (lx === 0 || (hb ? v % 4 === 0 : u % 8 === 0)) t -= 0.3;
      return { c: step(PAVEBRICK, t, x, y, 0.4) };
    }
    case 'gravel': {
      let t = 0.5 + (mid - 0.5) * 0.25 + (h > 0.7 ? 0.2 : h < 0.25 ? -0.2 : 0) + (hash(x >> 1, y >> 1, seed) > 0.85 ? 0.15 : 0);
      return { c: step(GRAVEL, t, x, y, 0.8) };
    }
    case 'dirt': case 'rubble': {
      let t = 0.5 + (big - 0.5) * 0.35 + (mid - 0.5) * 0.25 + (h > 0.92 ? 0.25 : 0) - (h < 0.06 ? 0.25 : 0);
      if (kind === 'rubble') {                                   // broken concrete, brick bits, glass glints
        const ch = vnoise(x, y, 5, seed + 41);
        if (ch > 0.74) return { c: step(MAT.concrete, 0.3 + (ch - 0.74) * 2.2 + (hash(x, y, seed + 2) > 0.7 ? 0.15 : 0), x, y, 0.5) };
        if (ch < 0.14) return { c: step(MAT.brick, 0.45 + (h - 0.5) * 0.3, x, y, 0.5) };
        if (h > 0.996) return { c: [190, 230, 220], e: [200, 255, 240, 60] };
      }
      return { c: step(DIRT, t, x, y, 0.9) };
    }
    case 'mulch': {
      const ch = hash(x >> 1, y >> 1, seed + 3);
      return { c: step(MAT.soil, 0.25 + ch * 0.45 + (h > 0.9 ? 0.15 : 0), x, y, 0.6) };
    }
    case 'lawn': {                                               // mown in broad stripes
      const stripe = Math.floor(x / 16) & 1;
      let t = 0.5 + (stripe ? 0.06 : -0.04) + (big - 0.5) * 0.25 + (mid - 0.5) * 0.2;
      if ((x + (y >> 1) * 3) % 5 === 0 && h > 0.55) t += 0.2;
      if (h < 0.05) t -= 0.25;
      return { c: step(MAT.grass, t, x, y, 1) };
    }
    case 'grassDry': {                                           // patchy, burnt-out, dirt showing
      if (vnoise(x, y, 13, seed + 51) < 0.32) return { c: step(DIRT, 0.45 + (mid - 0.5) * 0.3, x, y, 0.9) };
      let t = 0.5 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.3 + (h > 0.85 ? 0.2 : h < 0.1 ? -0.25 : 0);
      return { c: step(GRASSDRY, t, x, y, 1) };
    }
    case 'courtBlue': case 'courtGreen': {
      const t = 0.5 + (mid - 0.5) * 0.08 + (h > 0.97 ? 0.06 : 0);
      return { c: step(kind === 'courtBlue' ? COURTB : COURTG, t, x, y, 0.5) };
    }
    case 'pool': {                                               // bright pool water with caustic net
      const cz = Math.sin(x * 0.35 + Math.sin(y * 0.22) * 2.1) + Math.sin(y * 0.31 + Math.sin(x * 0.18) * 2.3);
      let t = 0.5 + (cz > 1.35 ? 0.35 : cz > 1.1 ? 0.15 : 0) + (big - 0.5) * 0.12;
      return { c: step(POOL, t, x, y, 0.5), water: true, e: cz > 1.55 ? [220, 255, 255, 50] : null, n: norm([Math.cos(x * 0.35) * 0.06, Math.cos(y * 0.31) * 0.06, 1]) };
    }
    case 'stoneTile': case 'plaza': {                            // large light limestone, or patterned plaza
      const S = kind === 'plaza' ? 20 : 26, sx = Math.floor(x / S), sy = Math.floor(y / S), lx = x - sx * S, ly = y - sy * S;
      const R = kind === 'plaza' && (sx % 6 === 3 || sy % 6 === 3) ? PLAZA2 : STONETILE;
      let t = 0.58 + (hash(sx, sy, seed + 21) - 0.5) * 0.14 + (mid - 0.5) * 0.08 + (h > 0.96 ? 0.08 : 0);
      if (lx === 0 || ly === 0) t -= 0.24; else if (lx === 1 || ly === 1) t += 0.06;
      return { c: step(R, t, x, y, 0.5) };
    }
    case 'rock': {                                               // craggy coastal rock
      const cr = vnoise(x, y, 9, seed + 61), fine = vnoise(x, y, 3, seed + 63);
      let t = 0.45 + (cr - 0.5) * 0.7 + (fine - 0.5) * 0.3;
      if (vnoise(x + 1, y + 1, 9, seed + 61) < cr - 0.04) t += 0.2;    // lit facets
      return { c: step(ROCK, t, x, y, 0.6) };
    }
    default: return null;
  }
}
const BUSLANE = ramp('#7a4a48', 6, 3, { dark: 0.55, light: 0.35, shift: 0.14 });
const COBBLE = ramp('#a8a094', 6, 3, { dark: 0.55, light: 0.45, shift: 0.18 });
const PAVEBRICK = ramp('#a86a52', 6, 3, { dark: 0.5, light: 0.4 });
const GRAVEL = ramp('#b0a690', 6, 3, { dark: 0.45, light: 0.4, shift: 0.15 });
const DIRT = ramp('#8a6c4c', 6, 3, { dark: 0.5, light: 0.4 });
const GRASSDRY = ramp('#9a9446', 6, 3, { dark: 0.55, light: 0.4, shift: 0.3 });
const COURTB = ramp('#3e6a9a', 5, 2, { dark: 0.4, light: 0.3 });
const COURTG = ramp('#3e7a5a', 5, 2, { dark: 0.4, light: 0.3 });
const POOL = ramp('#2fb4c8', 6, 3, { dark: 0.45, light: 0.6, shift: 0.1 });
const STONETILE = ramp('#d6ccb6', 6, 3, { dark: 0.42, light: 0.45, shift: 0.15 });
const PLAZA2 = ramp('#b49a7a', 6, 3, { dark: 0.42, light: 0.4, shift: 0.15 });
const ROCK = ramp('#6e645a', 7, 3, { dark: 0.62, light: 0.45, shift: 0.2 });

export function paintGround(G, kindAt, seed = 1) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const k = kindAt(x, y);
    if (!k) continue;
    const p = groundPixel(k, x, y, seed);
    if (!p) continue;
    G.put(x, y, p.c, p.n || UP, 0, p.e || null, F_GROUND | (p.water ? F_WATER : F_WET));
  }
}

// ---- decorators -----------------------------------------------------------------------------------
const paint = (G, x, y, c) => { if (G.inside(x, y)) { const j = (y * G.w + x) * 4; G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; } };

// dashed or solid painted line along x (horizontal) or y (vertical); worn paint shows asphalt through
export function laneLine(G, x0, y0, len, horizontal, opt = {}) {
  const R = opt.yellow ? MAT.paintYellow : MAT.paintWhite, wdt = opt.width || 2, dash = opt.dash || 0, gap = opt.gap || 0, seed = opt.seed || 5;
  for (let s = 0; s < len; s++) {
    if (dash && (s % (dash + gap)) >= dash) continue;
    for (let k = 0; k < wdt; k++) {
      const x = horizontal ? x0 + s : x0 + k, y = horizontal ? y0 + k : y0 + s;
      if (hash(x, y, seed) < (opt.wear ?? 0.12)) continue;
      paint(G, x, y, step(R, 0.55 + bayer(x, y) * 0.3, x, y, 0));
    }
  }
}
// zebra crossing across a road: bars run along the direction of travel
export function zebra(G, x0, y0, w, h, alongX, seed = 7) {
  const bar = 7, gap = 6;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const s = alongX ? (x - x0) : (y - y0);   // bars run along the road, spaced across it
    if (s % (bar + gap) >= bar) continue;
    if (hash(x, y, seed) < 0.05 || vnoise(x, y, 5, seed) < 0.12) continue;   // worn
    paint(G, x, y, step(MAT.paintWhite, 0.6, x, y, 0.4));
  }
}
// A raised sidewalk's edge: the kerb top (lighter) and, on its south side, the 3 px kerb face that
// shows in this projection. side: which side of the sidewalk faces the road ('n','s','e','w').
export function kerb(G, x0, y0, len, side, opt = {}) {
  const R = opt.red ? MAT.kerbRed : MAT.concrete;
  for (let s = 0; s < len; s++) {
    if (side === 's' || side === 'n') {
      const x = x0 + s;
      // top edge stone
      for (let k = 0; k < 3; k++) paint(G, x, y0 + (side === 's' ? -3 + k : k), step(R, 0.75 - k * 0.08, x, y0 + k, 0.5));
      if (side === 's') for (let k = 0; k < 3; k++) {             // face, in shade, facing the viewer
        const y = y0 + k;
        if (G.inside(x, y)) G.put(x, y, step(R, 0.25 - k * 0.05, x, y, 0.4), [0, 1, 0], 3 - k, null, F_GROUND | F_WET);
      }
    } else {
      const y = y0 + s;
      for (let k = 0; k < 3; k++) paint(G, x0 + (side === 'e' ? -3 + k : k), y, step(R, side === 'w' ? 0.85 - k * 0.1 : 0.45 + k * 0.1, x0 + k, y, 0.5));
    }
  }
}
// round manhole cover
export function manhole(G, cx, cy, r = 7) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y * 1.0);
    if (d > r + 0.3) continue;
    let t = d > r - 1.2 ? 0.1 : ((x + y) & 3) === 0 ? 0.55 : 0.35;
    if (d > r - 2.2 && d <= r - 1.2) t = 0.65;
    paint(G, cx + x, cy + y, step(MAT.metalDark, t, x, y, 0.3));
  }
}
// kerbside drain grate
export function drain(G, x0, y0, w = 14, h = 6) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    paint(G, x0 + x, y0 + y, edge ? MAT.metalDark[3] : (x % 3 === 0 ? MAT.metalDark[0] : MAT.metalDark[2]));
  }
}
// meandering cracks, a few patches of newer asphalt and a pothole or two
export function wear(G, x0, y0, w, h, amount = 1, seed = 11) {
  const R = MAT.asphalt;
  const rng = (i) => hash(i, seed, 31);
  for (let p = 0; p < Math.round(3 * amount); p++) {            // patches
    const pw = 20 + rng(p) * 40, ph = 12 + rng(p + 9) * 26, px = x0 + rng(p + 3) * (w - pw), py = y0 + rng(p + 5) * (h - ph);
    for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) {
      const edge = x - px < 1 || y - py < 1 || px + pw - x < 1 || py + ph - y < 1;
      paint(G, x | 0, y | 0, edge ? R[2] : step(R, 0.45 + (hash(x | 0, y | 0, seed) > 0.9 ? 0.2 : 0), x | 0, y | 0, 0.7));
    }
  }
  for (let c = 0; c < Math.round(7 * amount); c++) {            // cracks
    let x = x0 + rng(c + 20) * w, y = y0 + rng(c + 40) * h, a = rng(c + 60) * 6.28;
    const len = 20 + rng(c + 80) * 60;
    for (let s = 0; s < len; s++) {
      a += (hash(s, c, seed) - 0.5) * 0.9;
      x += Math.cos(a); y += Math.sin(a);
      if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) break;
      paint(G, x | 0, y | 0, R[0]);
      if (hash(s, c, seed + 1) > 0.7) paint(G, (x | 0) + 1, y | 0, R[1]);
    }
  }
  for (let p = 0; p < Math.round(1.5 * amount); p++) {          // potholes (they fill with water in the rain)
    const cx = x0 + 20 + rng(p + 100) * (w - 40), cy = y0 + 10 + rng(p + 110) * (h - 20), rx = 5 + rng(p + 120) * 6, ry = 3 + rng(p + 130) * 3;
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x / rx) ** 2 + (y / ry) ** 2;
      if (d > 1) continue;
      paint(G, (cx + x) | 0, (cy + y) | 0, d > 0.6 ? R[1] : y < 0 ? R[0] : R[2]);
    }
  }
}
// foam where the surf meets the sand, following an edge function
export function surf(G, edgeX, y0, y1, seed = 21) {
  for (let y = y0; y < y1; y++) {
    const ex = edgeX(y);
    for (let k = -3; k < 9; k++) {
      const x = Math.round(ex + k);
      if (!G.inside(x, y)) continue;
      const on = k < 2 ? hash(x, y, seed) > 0.25 : hash(x, y, seed) > 0.55 + k * 0.05;
      if (on) paint(G, x, y, step(MAT.foam, 0.8 - k * 0.06, x, y, 0.5));
    }
  }
}

// ---- kerbs from a sidewalk mask (any shape, rounded corners included) ---------------------------
// isWalk(x, y): raised pavement. Pavement pixels within 3 px of the road become the kerb stone (lit
// on top); road pixels just below a pavement edge show the kerb's 3 px face (it faces the viewer).
// red(x, y): where the kerb is painted red.
export function kerbs(G, isWalk, red = () => false) {
  const R = MAT.curb, RR = MAT.kerbRed;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const w = isWalk(x, y);
    if (w) {
      let edge = 99;
      for (let k = 1; k <= 3 && edge === 99; k++) for (const [dx, dy] of [[0, k], [0, -k], [k, 0], [-k, 0]]) if (!isWalk(x + dx, y + dy) && G.inside(x + dx, y + dy)) { edge = k; break; }
      if (edge <= 3) {
        const RC = red(x, y) ? RR : R;
        const t = edge === 1 ? 0.45 : edge === 2 ? 0.85 : 0.7;
        paint(G, x, y, step(RC, t + (hash(x >> 3, y >> 3, 5) - 0.5) * 0.1, x, y, 0.3));
      }
    } else {
      // kerb face below a pavement edge
      for (let k = 1; k <= 3; k++) if (isWalk(x, y - k)) {
        const RC = red(x, y - k) ? RR : R;
        if (G.inside(x, y)) G.put(x, y, step(RC, 0.22 - (k - 1) * 0.06, x, y, 0.3), [0, 1, 0], 4 - k, null, F_GROUND | F_WET);
        break;
      }
    }
  }
}
// weeds and grass tufts sprouting along an edge test: edgeAt(x, y) true where cracks meet pavement
export function weeds(G, edgeAt, density = 0.05, seed = 41) {
  for (let y = 2; y < G.h - 2; y++) for (let x = 2; x < G.w - 2; x++) {
    if (!edgeAt(x, y) || hash(x, y, seed) > density) continue;
    const n = 2 + Math.floor(hash(x, y, seed + 1) * 4);
    for (let b = 0; b < n; b++) {
      const bx = x + Math.round((hash(x, b, seed + 2) - 0.5) * 4), h = 2 + Math.floor(hash(b, y, seed + 3) * 3);
      for (let k = 0; k < h; k++) paint(G, bx + (k > 1 ? Math.sign(bx - x) : 0), y - k, MAT.leaf[Math.min(6, 2 + k + (b & 1))]);
    }
  }
}
// fallen leaves scattered on pavement (warm yellow and brown) around tree positions
export function leafLitter(G, trees, radius = 60, seed = 51) {
  const cols = [[214, 168, 52], [190, 120, 40], [150, 160, 50], [226, 196, 90]];
  for (const [tx, ty] of trees) for (let i = 0; i < 70; i++) {
    const a = hash(i, tx, seed) * 6.28, r = Math.sqrt(hash(i, ty, seed + 1)) * radius;
    const x = Math.round(tx + Math.cos(a) * r * 1.2), y = Math.round(ty + Math.sin(a) * r * 0.8);
    const c = cols[Math.floor(hash(i, i, seed + 2) * 4)];
    paint(G, x, y, c); if (hash(i, 3, seed) > 0.5) paint(G, x + 1, y, c.map((v) => v * 0.8));
  }
}
// square iron tree grate
export function treeGrate(G, cx, cy, s = 14) {
  for (let y = -s; y <= s; y++) for (let x = -s; x <= s; x++) {
    const edge = Math.abs(x) === s || Math.abs(y) === s, ring = Math.max(Math.abs(x), Math.abs(y)) % 3 === 0;
    paint(G, cx + x, cy + y, edge ? MAT.metalDark[3] : ring ? MAT.metalDark[1] : MAT.soil[1]);
  }
}
// a dark puddle (it mirrors the sky and lights when wet; flagged as water)
export function puddle(G, cx, cy, rx, ry, seed = 61) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2 + (vnoise(cx + x, cy + y, 5, seed) - 0.5) * 0.6;
    if (d > 1) continue;
    const X = cx + x, Y = cy + y;
    if (!G.inside(X, Y)) continue;
    G.put(X, Y, step(MAT.water, d > 0.7 ? 0.15 : 0.32 + (y < 0 ? 0.15 : 0), X, Y, 0.4), [0, 0, 1], 0, null, F_GROUND | F_WATER | F_WET);
  }
}
// tyre skid arcs
export function skid(G, cx, cy, r, a0, a1) {
  for (let a = a0; a < a1; a += 0.01) for (const off of [-7, 7]) { const x = Math.round(cx + Math.cos(a) * (r + off)), y = Math.round(cy + Math.sin(a) * (r + off) * 0.8); if (hash(x, y, 3) > 0.3) paint(G, x, y, MAT.asphalt[1]); }
}

// ---- lot and street dressing ----------------------------------------------------------------------
// tennis / sports court lines inside a court rectangle (a doubles tennis layout, scaled to fit)
export function courtLines(G, x0, y0, w, h, net = true) {
  const W = MAT.paintWhite;
  const line = (ax, ay, bx, by) => { for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) paint(G, x, y, step(W, 0.7, x, y, 0.3)); };
  const m = 8, ix = x0 + m, iy = y0 + m, iw = w - 2 * m, ih = h - 2 * m;
  line(ix, iy, ix + iw, iy + 1); line(ix, iy + ih - 1, ix + iw, iy + ih); line(ix, iy, ix + 1, iy + ih); line(ix + iw - 1, iy, ix + iw, iy + ih);
  const al = Math.round(ih * 0.12);
  line(ix, iy + al, ix + iw, iy + al + 1); line(ix, iy + ih - al - 1, ix + iw, iy + ih - al);
  const sv = Math.round(iw * 0.23);
  line(ix + sv, iy + al, ix + sv + 1, iy + ih - al); line(ix + iw - sv - 1, iy + al, ix + iw - sv, iy + ih - al);
  line(ix + sv, iy + (ih >> 1), ix + iw - sv, iy + (ih >> 1) + 1);
  if (net) line(ix + (iw >> 1), iy - 3, ix + (iw >> 1) + 1, iy + ih + 3);
}
// the inside of a pool's north wall (it faces the viewer): tiles in shade, a waterline of light tiles
export function poolWall(G, x0, y0, w, depth = 6) {
  for (let k = 0; k < depth; k++) for (let x = x0; x < x0 + w; x++) {
    const tile = (x % 6 === 0) || k === 0;
    const c = k === 0 ? [236, 240, 236] : tile ? [70, 120, 136] : k < 2 ? [104, 180, 196] : [88, 160, 182];
    if (G.inside(x, y0 + k)) G.put(x, y0 + k, c, [0, 1, 0], 0, null, F_GROUND | F_WET);
  }
}
// litter: paper scraps, cans, cigarette ends where test(x, y) allows
export function litter(G, test, density = 0.002, seed = 71) {
  const cols = [[226, 222, 210], [200, 60, 50], [70, 120, 190], [236, 200, 80], [120, 120, 126], [190, 160, 120]];
  for (let y = 1; y < G.h - 2; y++) for (let x = 1; x < G.w - 2; x++) {
    if (hash(x, y, seed) > density || !test(x, y)) continue;
    const c = cols[Math.floor(hash(x, y, seed + 1) * cols.length)], kind = hash(x, y, seed + 2);
    if (kind < 0.5) { paint(G, x, y, c); paint(G, x + 1, y, c); paint(G, x, y + 1, c.map((v) => v * 0.75)); paint(G, x + 1, y + 1, c.map((v) => v * 0.6)); }
    else if (kind < 0.8) { paint(G, x, y, c); paint(G, x + 1, y, MAT.metal[4]); paint(G, x + 2, y, c.map((v) => v * 0.7)); }
    else paint(G, x, y, [236, 230, 214]);
  }
}
// hairline cracks and broken slabs across pavement where test(x, y) allows
export function pavementCracks(G, test, count = 20, seed = 81) {
  for (let c = 0; c < count; c++) {
    let x = hash(c, 1, seed) * G.w, y = hash(c, 2, seed) * G.h, a = hash(c, 3, seed) * 6.28;
    const len = 12 + hash(c, 4, seed) * 40;
    for (let s = 0; s < len; s++) {
      a += (hash(s, c, seed) - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a);
      if (!test(x | 0, y | 0)) break;
      paint(G, x | 0, y | 0, MAT.concrete[0]);
      if (hash(s, c, seed + 5) > 0.75) paint(G, (x | 0) + 1, (y | 0) + 1, MAT.concrete[1]);
    }
  }
}
// an oil stain or wet patch
export function stain(G, cx, cy, rx, ry, seed = 91, dark = 0.7) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x / rx) ** 2 + (y / ry) ** 2 + (vnoise(cx + x, cy + y, 4, seed) - 0.5) * 0.7;
    if (d > 1 || !G.inside(cx + x, cy + y)) continue;
    const j = ((cy + y) * G.w + cx + x) * 4, k = dark + d * (1 - dark);
    G.col[j] *= k; G.col[j + 1] *= k; G.col[j + 2] *= k * 1.04;
  }
}
// words painted on the road (BUS ONLY, STOP, SLOW), stretched along the direction of travel
export function roadText(G, text, x, y, opt = {}) {
  const R = opt.yellow ? MAT.paintYellow : MAT.paintWhite;
  drawText((px, py) => { if (hash(px, py, 13) > 0.1) paint(G, px, py, step(R, 0.6, px, py, 0.3)); }, text, x, y, { sx: opt.sx || 3, sy: opt.sy || 6, gap: 1 });
}
// a darker, damp edge where grass or beds meet paving (soil kicked up, shade under the lawn's lip)
export function lawnEdge(G, isLawn) {
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) {
    if (isLawn(x, y)) continue;
    if (isLawn(x, y - 1) || isLawn(x - 1, y) || isLawn(x + 1, y)) { const j = (y * G.w + x) * 4; G.col[j] *= 0.78; G.col[j + 1] *= 0.76; G.col[j + 2] *= 0.82; }
  }
}
// foam and dark wet rock where water meets a shore mask
export function shoreFoam(G, isWater, seed = 23) {
  for (let y = 1; y < G.h - 1; y++) for (let x = 1; x < G.w - 1; x++) {
    if (!isWater(x, y)) continue;
    let d = 99;
    for (let k = 1; k <= 6 && d === 99; k++) for (const [dx, dy] of [[0, k], [0, -k], [k, 0], [-k, 0]]) if (!isWater(x + dx, y + dy)) { d = k; break; }
    if (d > 6) continue;
    const on = d < 2 ? hash(x, y, seed) > 0.2 : hash(x, y, seed) > 0.45 + d * 0.08 || vnoise(x, y, 4, seed) > 0.8 - d * 0.04;
    if (on) paint(G, x, y, step(MAT.foam, 0.85 - d * 0.08, x, y, 0.5));
  }
}
