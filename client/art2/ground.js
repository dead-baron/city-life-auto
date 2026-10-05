// Art v2 ground: roads, kerbs, sidewalks, crossings, sand, surf, water, grass and dirt, painted
// straight into a scene G-buffer (normal up, height 0, flagged as ground so rain can wet it).
//
// paintGround(G, kindAt, seed): kindAt(x, y) -> a ground kind name for every pixel; then the
// decorators below add markings, kerbs, drains and wear on top.
import { MAT } from './palette.js';
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
    default: return null;
  }
}

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
      paint(G, x | 0, y | 0, edge ? R[1] : step(R, 0.38 + (hash(x | 0, y | 0, seed) > 0.9 ? 0.2 : 0), x | 0, y | 0, 0.6));
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
