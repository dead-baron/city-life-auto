// Art v2 ground: roads, kerbs, sidewalks, crossings, sand, surf, water, grass and dirt, painted
// straight into a scene G-buffer (normal up, height 0, flagged as ground so rain can wet it).
//
// paintGround(G, kindAt, seed): kindAt(x, y) -> a ground kind name for every pixel; then the
// decorators below add markings, kerbs, drains and wear on top.
//
// World materials (the live game's chunk baker, client/art2/game/groundbake.js): GSHADE[name](x, y, seed)
// shades one pixel of an E1-sheet material in world coordinates, without allocating (see the section at
// the end); coverSprite(kind, variant) makes the tiny upright plants, stones and shells strewn on top.
import { MAT, ramp, hex } from './palette.js';
import { drawText } from './font.js';
import { GBuf, F_GROUND, F_WATER, F_WET, F_LEAF, F_NOCAST, hash, vnoise, bayer, step, norm } from './gbuf.js';

const UP = [0, 0, 1];
const pick = (R, i) => R[Math.max(0, Math.min(R.length - 1, i))];

// per-pixel ground colour by kind
export function groundPixel(kind, x, y, seed) {
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
    case 'shallow': {                                            // bright turquoise shallows over sand
      const sw = Math.sin(y * 0.22 + vnoise(x, y, 19, seed + 9) * 5 + x * 0.04), net = Math.sin(x * 0.4 + Math.sin(y * 0.3) * 2) + Math.sin(y * 0.36 + Math.sin(x * 0.2) * 2.2);
      let t = 0.55 + (big - 0.5) * 0.25 + sw * 0.08 + (net > 1.3 ? 0.25 : 0);
      return { c: step(SHALLOW, t, x, y, 0.6), water: true, e: net > 1.6 && h > 0.6 ? [230, 255, 250, 70] : null, n: norm([sw * 0.06, Math.cos(y * 0.22) * 0.12, 1]) };
    }
    case 'ballast': {                                            // railway ballast: dark angular stone, rust
      let t = 0.45 + (h - 0.5) * 0.5 + (hash(x >> 1, y >> 1, seed + 2) > 0.8 ? 0.2 : 0) + (mid - 0.5) * 0.2;
      if (hash(x, y, seed + 4) > 0.97) return { c: step(DIRT, 0.5, x, y, 0) };
      return { c: step(BALLAST, t, x, y, 0.7) };
    }
    case 'yard': {                                               // industrial concrete apron: big worn slabs, stains
      const S = 56, lx = x % S, ly = y % S;
      let t = 0.45 + (hash(Math.floor(x / S), Math.floor(y / S), seed + 7) - 0.5) * 0.16 + (big - 0.5) * 0.2 + (mid - 0.5) * 0.12 + (h > 0.95 ? 0.1 : h < 0.05 ? -0.12 : 0);
      if (lx === 0 || ly === 0) t -= 0.25;
      if (vnoise(x, y, 14, seed + 33) > 0.74) t -= 0.14;
      return { c: step(YARD, t, x, y, 0.7) };
    }
    case 'dirtRoad': {                                           // packed dirt and gravel, darker where wheels run
      let t = 0.55 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.25 + (h > 0.9 ? 0.2 : h < 0.08 ? -0.22 : 0);
      if (hash(x >> 1, y >> 1, seed + 3) > 0.94) t += 0.25;
      return { c: step(DIRTROAD, t, x, y, 0.9) };
    }
    case 'wheat': {                                              // a ripe field: rows, wind sheen, bright ears
      const row = y % 7, sheen = vnoise(x * 0.5, y, 30, seed + 13);
      let t = 0.5 + (row < 2 ? -0.25 : row === 3 ? 0.15 : 0) + (sheen - 0.5) * 0.4 + (h > 0.86 ? 0.2 : 0);
      return { c: step(WHEAT, t, x, y, 0.8) };
    }
    case 'plowed': {                                             // furrows of dark turned earth
      const f = x % 8;
      let t = 0.45 + (f < 2 ? -0.25 : f < 4 ? 0.15 : 0) + (mid - 0.5) * 0.25 + (h > 0.9 ? 0.15 : 0);
      return { c: step(MAT.soil, t, x, y, 0.7) };
    }
    case 'desert': {                                             // orange desert sand, pebbles, faint cracks
      let t = 0.55 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.25 + (h > 0.93 ? 0.2 : h < 0.05 ? -0.2 : 0);
      if (hash(x >> 1, y >> 1, seed + 5) > 0.96) return { c: step(ROCKRED, 0.4 + h * 0.3, x, y, 0.3) };
      if (vnoise(x, y, 5, seed + 9) > 0.86 && vnoise(x + 1, y, 5, seed + 9) < 0.86) t -= 0.25;
      return { c: step(DESERT, t, x, y, 0.9) };
    }
    case 'tileWhite': case 'tileGreen': {                        // glazed wall-style floor tile, small, bright grout
      const S = 12, lx = x % S, ly = y % S, R = kind === 'tileWhite' ? TILEW : TILEG;
      let t = 0.6 + (hash(Math.floor(x / S), Math.floor(y / S), seed + 3) - 0.5) * 0.12 + (mid - 0.5) * 0.08;
      if (lx === 0 || ly === 0) t -= 0.28; else if (lx === 1 || ly === 1) t += 0.08;
      if (vnoise(x, y, 9, seed + 41) > 0.82) t -= 0.12;
      return { c: step(R, t, x, y, 0.4) };
    }
    case 'platform': {                                           // big grey station tiles, scuffed and shiny
      const S = 28, lx = x % S, ly = y % S;
      let t = 0.5 + (hash(Math.floor(x / S), Math.floor(y / S), seed + 5) - 0.5) * 0.16 + (big - 0.5) * 0.15 + (h > 0.96 ? 0.12 : 0);
      if (lx === 0 || ly === 0) t -= 0.22;
      return { c: step(PLATF, t, x, y, 0.5) };
    }
    case 'checker': {                                            // canteen / diner floor
      const on = (Math.floor(x / 16) + Math.floor(y / 16)) & 1;
      return { c: step(on ? CHECKA : CHECKB, 0.55 + (mid - 0.5) * 0.12 + (h > 0.95 ? 0.08 : 0), x, y, 0.4) };
    }
    case 'rubber': {                                             // gym rubber flooring in big tiles
      const S = 40, lx = x % S, ly = y % S;
      let t = 0.45 + (h > 0.9 ? 0.15 : h < 0.1 ? -0.1 : 0) + (mid - 0.5) * 0.12;
      if (lx === 0 || ly === 0) t -= 0.2;
      return { c: step(RUBBER, t, x, y, 0.6) };
    }
    case 'woodFloor': {                                          // planks along x
      const row = Math.floor(y / 6), off = (row * 37) % 60, lx = (x + off) % 60;
      let t = 0.55 + (hash(Math.floor((x + off) / 60), row, seed + 9) - 0.5) * 0.25 + (mid - 0.5) * 0.1;
      if (y % 6 === 0 || lx === 0) t -= 0.25;
      return { c: step(MAT.woodDock, t, x, y, 0.4) };
    }
    case 'bedrock': {                                            // the dark ground round an underground cut-away
      let t = 0.35 + (big - 0.5) * 0.3 + (mid - 0.5) * 0.2 + (h > 0.95 ? 0.12 : 0);
      if (((x >> 4) + (y >> 4)) % 7 === 0 && (x % 16 === 0 || y % 16 === 0)) t -= 0.12;
      return { c: step(BEDROCK, t, x, y, 0.6) };
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
    default: {                                                   // the world materials (GSHADE, below)
      const f = GSHADE[kind];
      if (!f) return null;
      gsReset();
      const c = f(x, y, seed);
      return { c, n: GS.nx || GS.ny ? norm([GS.nx, GS.ny, 1]) : null, water: GS.water };
    }
  }
}
const SHALLOW = ramp('#3cc0c4', 6, 3, { dark: 0.45, light: 0.6, shift: 0.1 });
const BALLAST = ramp('#6a6660', 6, 3, { dark: 0.55, light: 0.4, shift: 0.15 });
const YARD = ramp('#9a9890', 6, 3, { dark: 0.55, light: 0.42, shift: 0.15 });
const DIRTROAD = ramp('#b08a5e', 6, 3, { dark: 0.5, light: 0.4 });
const WHEAT = ramp('#d8a840', 7, 3, { dark: 0.55, light: 0.55, shift: 0.2 });
const DESERT = ramp('#d09a62', 6, 3, { dark: 0.5, light: 0.45, shift: 0.2 });
const ROCKRED = ramp('#a8543a', 6, 3, { dark: 0.55, light: 0.45 });
const TILEW = ramp('#d8d6cc', 6, 3, { dark: 0.45, light: 0.4, shift: 0.15 });
const TILEG = ramp('#5e8a7a', 6, 3, { dark: 0.5, light: 0.4 });
const PLATF = ramp('#8a8a88', 6, 3, { dark: 0.5, light: 0.45, shift: 0.15 });
const CHECKA = ramp('#c8c4b8', 5, 2, { dark: 0.4 }), CHECKB = ramp('#5a6a6a', 5, 2);
const RUBBER = ramp('#3a3a40', 6, 3, { dark: 0.5, light: 0.35 });
const BEDROCK = ramp('#3a3638', 6, 3, { dark: 0.5, light: 0.35, shift: 0.15 });
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
    for (let k = 1; k <= 6 && d === 99; k++) for (const [dx, dy] of [[0, k], [0, -k], [k, 0], [-k, 0]]) if (G.inside(x + dx, y + dy) && !isWater(x + dx, y + dy)) { d = k; break; }
    if (d > 6) continue;
    const on = d < 2 ? hash(x, y, seed) > 0.2 : hash(x, y, seed) > 0.45 + d * 0.08 || vnoise(x, y, 4, seed) > 0.8 - d * 0.04;
    if (on) paint(G, x, y, step(MAT.foam, 0.85 - d * 0.08, x, y, 0.5));
  }
}

// ---- rails, quays, pitches, parking -----------------------------------------------------------------
// a railway or tram track. horizontal: rails run along x from (x0, y0); the track is gauge + 14 wide.
// embedded: tram rails set into the road (no sleepers, a dark groove beside each rail).
export function railTrack(G, x0, y0, len, horizontal = true, opt = {}) {
  const gauge = opt.gauge || 30, wood = MAT.woodDark;
  const P = (a, b) => (horizontal ? [x0 + a, y0 + b] : [x0 + b, y0 + a]);
  if (!opt.embedded) for (let a = 0; a < len; a++) {
    if (a % 10 > 4) continue;                                  // sleepers
    for (let b = -4; b < gauge + 10; b++) { const [x, y] = P(a, b); paint(G, x, y, step(wood, 0.45 + (a % 10 === 0 ? 0.2 : 0) - (b > gauge + 6 ? 0.15 : 0) + (hash(Math.floor(a / 10), b >> 3, 3) - 0.5) * 0.2, x, y, 0.4)); }
  }
  for (const r of [3, gauge + 3]) for (let a = 0; a < len; a++) {
    if (opt.embedded) { const [gx, gy] = P(a, r + 3); paint(G, gx, gy, MAT.asphalt[0]); const [hx, hy] = P(a, r - 1); paint(G, hx, hy, MAT.asphalt[1]); }
    for (let k = 0; k < 3; k++) { const [x, y] = P(a, r + k); if (G.inside(x, y)) G.put(x, y, k === 0 ? MAT.chrome[4] : k === 1 ? MAT.metal[3] : MAT.metalDark[1], [0, horizontal ? 0.4 : 0, 0.92], opt.embedded ? 0 : 2, null, 1 | 8); }
  }
}
// a quay edge: the hazard-striped coping and, below it, the quay wall's face (it faces the viewer)
// down to the water, with tyre fenders. The quay runs along x at y (the edge), wall h px tall.
export function quayEdge(G, x0, y, len, h = 20, seed = 5) {
  for (let x = x0; x < x0 + len; x++) {
    for (let k = 0; k < 5; k++) paint(G, x, y - 5 + k, k < 1 ? MAT.concrete[4] : (Math.floor((x + k) / 8) & 1) ? [228, 186, 52] : [40, 38, 44]);
    for (let k = 0; k < h; k++) {
      const Y = y + k; if (!G.inside(x, Y)) continue;
      let c = step(MAT.concrete, 0.32 - k / h * 0.18 + (vnoise(x, Y, 6, seed) - 0.5) * 0.15 + (x % 40 === 0 ? -0.1 : 0), x, Y, 0.5);
      if (k > h - 5) c = step(MAT.leafDark, 0.25 + hash(x, k, seed) * 0.2, x, Y, 0.3);        // weed and slime line
      G.put(x, Y, c, [0, 1, 0], h - k, null, 1 | 8);
    }
    const fx = (x - x0) % 48;                                   // tyre fenders
    if (fx > 18 && fx < 30) for (let k = 3; k < 15; k++) { const d = Math.hypot(fx - 24, k - 9); if (d < 6 && d > 2.5) paint(G, x, y + k, d > 5 ? [20, 20, 24] : [44, 44, 50]); }
  }
}
// football pitch markings in a rectangle (touchlines, halfway line, centre circle, boxes)
export function pitchLines(G, x0, y0, w, h) {
  const W = MAT.paintWhite, p = (x, y) => paint(G, Math.round(x), Math.round(y), step(W, 0.7, x | 0, y | 0, 0.3));
  for (let x = x0; x <= x0 + w; x++) { p(x, y0); p(x, y0 + 1); p(x, y0 + h); p(x, y0 + h - 1); }
  for (let y = y0; y <= y0 + h; y++) { p(x0, y); p(x0 + 1, y); p(x0 + w, y); p(x0 + w - 1, y); p(x0 + w / 2, y); }
  for (let a = 0; a < 6.28; a += 0.02) p(x0 + w / 2 + Math.cos(a) * h * 0.16, y0 + h / 2 + Math.sin(a) * h * 0.16);
  const bw = w * 0.14, bh = h * 0.5;
  for (const side of [0, 1]) { const bx = side ? x0 + w - bw : x0; for (let y = y0 + (h - bh) / 2; y <= y0 + (h + bh) / 2; y++) p(side ? bx : bx + bw, y); for (let x = bx; x <= bx + bw; x++) { p(x, y0 + (h - bh) / 2); p(x, y0 + (h + bh) / 2); } }
}
// parking bay lines: n bays from (x0, y0), each `bay` wide and `len` deep (vertical: bays side by side
// along x, lines running down y)
export function parkingLines(G, x0, y0, n, bay = 56, len = 110, opt = {}) {
  const R = opt.yellow ? MAT.paintYellow : MAT.paintWhite;
  for (let i = 0; i <= n; i++) for (let k = 0; k < len; k++) for (let t = 0; t < 2; t++) { const x = x0 + i * bay + t, y = y0 + k; if (hash(x, y, 5) > 0.12) paint(G, x, y, step(R, 0.6, x, y, 0.3)); }
}
// a painted bus pictogram on a bus lane
export function busSymbol(G, cx, y0, s = 2) {
  const W = MAT.paintWhite, plot = (x, y) => { for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) paint(G, cx + x * s + a, y0 + y * s + b, step(W, 0.65, x, y, 0.2)); };
  for (let y = 0; y < 16; y++) for (let x = -9; x <= 9; x++) {
    const edge = Math.abs(x) === 9 || y === 0 || y === 12, win = y === 4 && Math.abs(x) < 8, wheel = y > 12 && (Math.abs(x + 5) < 2 || Math.abs(x - 5) < 2);
    if (edge || win || wheel || (y === 9 && Math.abs(x) > 5 && Math.abs(x) < 8)) plot(x, y);
  }
}
// lily pads on a pond where test(x, y) allows
export function lilyPads(G, test, count = 30, seed = 101) {
  for (let i = 0; i < count; i++) {
    const cx = Math.floor(hash(i, 1, seed) * G.w), cy = Math.floor(hash(i, 2, seed) * G.h);
    if (!test(cx, cy)) continue;
    const r = 3 + hash(i, 3, seed) * 3, notch = hash(i, 4, seed) * 6.28;
    for (let y = -r; y <= r; y++) for (let x = -r * 1.3; x <= r * 1.3; x++) {
      const d = (x / 1.3) ** 2 + y * y, a = Math.atan2(y, x);
      if (d > r * r || Math.abs(((a - notch + 9.42) % 6.28) - 3.14) < 0.3 || !test(cx + x | 0, cy + y | 0)) continue;
      paint(G, (cx + x) | 0, (cy + y) | 0, step(MAT.leaf, 0.35 + (y < 0 ? 0.25 : 0) + (d > r * r * 0.7 ? -0.15 : 0), x | 0, y | 0, 0.4));
    }
    if (hash(i, 5, seed) > 0.7) { paint(G, cx, cy - 1, [244, 200, 220]); paint(G, cx + 1, cy - 1, [250, 236, 240]); }
  }
}
// a beach towel or picnic blanket (stripes or a check) lying on the ground
export function towel(G, x0, y0, w, h, cols, check = false) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = check ? ((Math.floor(x / 4) + Math.floor(y / 4)) & 1) : Math.floor(y / Math.max(2, Math.floor(h / (cols.length * 2)))) % cols.length;
    const c = check ? (i ? cols[0] : cols[1] || [240, 236, 228]) : cols[i];
    paint(G, x0 + x, y0 + y, (y === h - 1 || x === w - 1) ? c.map((v) => v * 0.7) : c);
  }
}

// tyre ruts along a dirt track: two darker, compacted lines either side of a path's centre
export function ruts(G, path, gap = 22, seed = 111) {
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = path[i - 1], [bx, by] = path[i], L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let s = 0; s < L; s++) for (const side of [-1, 1]) for (let w = -3; w <= 3; w++) {
      const x = Math.round(ax + (bx - ax) * s / L + nx * (side * gap / 2 + w)), y = Math.round(ay + (by - ay) * s / L + ny * (side * gap / 2 + w));
      if (!G.inside(x, y) || hash(x, y, seed) < 0.2) continue;
      const j = (y * G.w + x) * 4, k = Math.abs(w) < 2 ? 0.8 : 0.9;
      G.col[j] *= k; G.col[j + 1] *= k; G.col[j + 2] *= k;
    }
  }
}

// paint one ground kind over a rectangle (interiors: floors laid room by room)
export function paintRect(G, x0, y0, w, h, kind, seed = 1) {
  for (let y = Math.max(0, y0 | 0); y < Math.min(G.h, (y0 + h) | 0); y++) for (let x = Math.max(0, x0 | 0); x < Math.min(G.w, (x0 + w) | 0); x++) {
    const p = groundPixel(kind, x, y, seed);
    if (p) G.put(x, y, p.c, p.n || UP, 0, p.e || null, F_GROUND | (p.water ? F_WATER : F_WET));
  }
}

// ---- road markings ----------------------------------------------------------------------------------
// a painted arrow (dir: 'up'|'down'|'left'|'right' = the way traffic goes; turn: 'straight'|'left'|'right'|
// 'straightLeft'|'straightRight'), about 16 x 44 px, centred on (cx, cy)
export function arrowMark(G, cx, cy, dir = 'up', turn = 'straight', opt = {}) {
  const R = opt.yellow ? MAT.paintYellow : MAT.paintWhite, pts = [];
  const shaft = (x0, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0 - 1; x <= x0 + 1; x++) pts.push([x, y]); };
  const head = (x0, y0, d) => { for (let k = 0; k < 9; k++) for (let x = -k; x <= k; x++) pts.push([x0 + x, y0 + d * k]); };
  if (turn === 'straight' || turn.startsWith('straight')) { shaft(0, -12, 20); head(0, -20, 1); }
  for (const side of ['left', 'right']) {
    if (turn !== side && turn !== 'straight' + side[0].toUpperCase() + side.slice(1)) continue;
    const s = side === 'left' ? -1 : 1;
    shaft(turn === side ? 0 : 0, -2, 20);
    for (let k = 0; k < 12; k++) for (let w = -1; w <= 1; w++) pts.push([s * k, -2 + w]);
    for (let k = 0; k < 7; k++) for (let w = -k; w <= k; w++) pts.push([s * (12 + 7 - k), -2 + w]);
  }
  const rot = { up: (x, y) => [x, y], down: (x, y) => [-x, -y], left: (x, y) => [y, -x], right: (x, y) => [-y, x] }[dir];
  for (const [x, y] of pts) { const [rx, ry] = rot(x, y); const X = Math.round(cx + rx), Y = Math.round(cy + ry); if (hash(X, Y, 9) > 0.08) paint(G, X, Y, step(R, 0.6, X, Y, 0.3)); }
}
// diagonal hatching inside a polygon (gore areas, no-stopping boxes), with a solid border
export function hatchPoly(G, poly, opt = {}) {
  const R = opt.yellow ? MAT.paintYellow : MAT.paintWhite, sp = opt.spacing || 14, wd = opt.width || 4;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
    if (!inside(x + 0.5, y + 0.5)) continue;
    const edge = !inside(x - 2.5, y + 0.5) || !inside(x + 3.5, y + 0.5) || !inside(x + 0.5, y - 2.5) || !inside(x + 0.5, y + 3.5);
    const d = opt.chevron ? Math.abs(((x - opt.chevron[0]) * 0.7 + Math.abs(y - opt.chevron[1])) % sp) : ((x + (opt.dir || 1) * y) % sp + sp) % sp;
    if ((edge || d < wd) && hash(x, y, 3) > 0.08) paint(G, x, y, step(R, 0.6, x, y, 0.3));
  }
}

// ==== World materials ================================================================================
// One shader per material of the E1 ground sheet, plus the district and biome variants the live map needs,
// all in world coordinates so neighbouring chunks meet without a seam. GSHADE[name](x, y, seed) returns a
// ramp colour (a shared array: copy it, never write to it) and leaves its extras in GS: nx, ny (a tilt of
// the normal: relief the low sun picks out), h (px above the surface: grain stalks, crop leaves) and water
// (1: a puddle, flag it F_WATER). Call gsReset() before each pixel. groundPixel(name, ...) serves them too.
export const GS = { nx: 0, ny: 0, h: 0, water: 0 };
export function gsReset() { GS.nx = 0; GS.ny = 0; GS.h = 0; GS.water = 0; }
// world ramps: hex steps dark -> light, with extra contrast laid on (E1's materials have far brighter sunlit
// highlights than a plain ramp: the upper steps lift and warm, the lowest dips a little)
const RP = (s) => { const R = s.split(' ').map(hex), n = R.length; return R.map((c, k) => { const u = n > 1 ? k / (n - 1) : 0, f = 0.94 + 0.5 * u * u; return [Math.min(255, Math.round(c[0] * f * (1 + 0.06 * u))), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f * (1 - 0.06 * u)))]; }); };
// a fast integer hash -> 0..1 (integer arguments; the world shaders' own, cheaper than gbuf's hash())
export const hh = (x, y, s) => { let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const BAY = new Float32Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5 + 1 / 32));
const at = (R, k) => R[k <= 0 ? 0 : k >= R.length - 1 ? R.length - 1 : k | 0];
// a 0..1 shade to a ramp step through the ordered dither (step() inlined for the hot loops)
const sd = (R, t, x, y, d = 0.6) => { const v = t * (R.length - 1) + BAY[(y & 3) * 4 + (x & 3)] * d; return R[v <= 0 ? 0 : v >= R.length - 1 ? R.length - 1 : Math.round(v)]; };
export { sd as shadeStep };

// Worley cells: distance to the nearest and second-nearest jittered cell centre, that cell's hash and the
// offset from its centre (allocation free: the result lives in WC until the next call)
export const WC = { d1: 0, d2: 0, h: 0, dx: 0, dy: 0, gx: 0, gy: 0 };
// The jittered centres of the 3 x 3 cells around the last cell looked up are kept per (size, seed, jitter)
// slot, so a row of pixels re-hashes only when it crosses into the next cell (same results as without).
const WK = new Float64Array(32 * 32);
export function worley(x, y, sz, seed, jit = 0.8) {
  const cx = Math.floor(x / sz), cy = Math.floor(y / sz), o = ((seed * 5 + sz * 3 + jit * 40) & 31) * 32;
  if (WK[o] !== sz || WK[o + 1] !== seed || WK[o + 2] !== cx || WK[o + 3] !== cy || WK[o + 4] !== jit) {
    WK[o] = sz; WK[o + 1] = seed; WK[o + 2] = cx; WK[o + 3] = cy; WK[o + 4] = jit;
    for (let j = -1, q = o + 5; j <= 1; j++) for (let i = -1; i <= 1; i++, q += 3) {
      const gx = cx + i, gy = cy + j, h = hh(gx, gy, seed);
      WK[q] = (gx + 0.5 + (h - 0.5) * jit) * sz; WK[q + 1] = (gy + 0.5 + (hh(gy, gx, seed + 1) - 0.5) * jit) * sz; WK[q + 2] = h;
    }
  }
  let b = 1e18, b2 = 1e18, bk = 0;
  for (let k = 0, q = o + 5; k < 9; k++, q += 3) {
    const dx = x - WK[q], dy = y - WK[q + 1], d = dx * dx + dy * dy;
    if (d < b) { b2 = b; b = d; bk = k; } else if (d < b2) b2 = d;
  }
  const q = o + 5 + bk * 3;
  WC.h = WK[q + 2]; WC.dx = x - WK[q]; WC.dy = y - WK[q + 1]; WC.gx = cx + (bk % 3) - 1; WC.gy = cy + ((bk / 3) | 0) - 1;
  WC.d1 = Math.sqrt(b); WC.d2 = Math.sqrt(b2);
  return WC;
}
// value noise (identical to vnoise) that keeps the corner hashes of the last cell per (scale, seed) slot
const VK = new Float64Array(64 * 8);
export function vnc(x, y, sc, seed = 0) {
  const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), o = ((seed * 7 + sc * 13) & 63) * 8;
  if (VK[o] !== sc || VK[o + 1] !== seed || VK[o + 2] !== ix || VK[o + 3] !== iy) {
    VK[o] = sc; VK[o + 1] = seed; VK[o + 2] = ix; VK[o + 3] = iy;
    VK[o + 4] = hh(ix, iy, seed); VK[o + 5] = hh(ix + 1, iy, seed); VK[o + 6] = hh(ix, iy + 1, seed); VK[o + 7] = hh(ix + 1, iy + 1, seed);
  }
  const a = VK[o + 4], b = VK[o + 5], c = VK[o + 6], d = VK[o + 7];
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
// one stone of a pebble field: its shade 0..1 (lit on the upper left, a dark rim) or -1 between stones
function stone(x, y, sz, seed, fill, jit = 0.8) {
  const w = worley(x + 0.5, y + 0.5, sz, seed, jit), r = sz * fill * (0.6 + 0.8 * w.h);
  if (w.d1 > r) return -1;
  const u = w.dx / r, v = w.dy / r;
  GS.nx = u * 0.55; GS.ny = v * 0.55;
  return 0.56 + (w.h - 0.5) * 0.3 - (u + v) * 0.26 - (w.d1 > r - 1.1 ? 0.22 : 0);
}
// grass blades: short slanted strokes (one column of strokes per blade lean, phased by hash), bright at the
// tip, dark in the gaps between - returns the row within the stroke (0 = tip, >= 3 or so = gap)
function bladeRow(x, y, s, per) {
  const lean = ((vnc(x, y, 41, s + 71) * 3) | 0) - 1;
  const c = x + (y >> 1) * lean, hb = hh(c, (y + ((c * 7) & 15)) >> 4, s);
  GS.nx = lean * 0.16;
  return (y + ((hb * 1013) | 0)) % (per + ((hb * 3) | 0));
}
function grass(R, x, y, s, per, stripes = 0) {
  const t = bladeRow(x, y, s, per);
  let k = t === 0 ? 6 : t === 1 ? 5 : t === 2 ? 4 : t === 3 && per > 4 ? 3 : 1;
  const big = vnc(x, y, 52, s + 3), cl = vnc(x, y, 8, s + 5);
  k += (big > 0.62 ? 1 : big < 0.36 ? -1 : 0) + (cl > 0.7 ? 1 : cl < 0.28 ? -1 : 0);
  if (stripes && ((((x + ((vnc(x, y, 90, s) * 14) | 0)) / 34) | 0) & 1)) k -= 1;
  if (hh(x, y, s + 9) < 0.05) k -= 2;
  if (t > 2) GS.nx = 0;
  return at(R, k);
}
// a clover patch: small three-lobed leaves lit on the upper left, with a white flower head now and then
function clover(x, y, s, dens) {
  if (vnc(x, y, 23, s + 31) < 1 - dens) return null;
  const w = worley(x + 0.5, y + 0.5, 5, s + 33, 0.9);
  if (w.d1 > 2.7) return null;
  if (w.h > 0.84 && w.d1 < 1.6) return at(FLWR, w.dy < 0 ? 1 : 0);
  GS.nx = w.dx * 0.15; GS.ny = w.dy * 0.15;
  return at(CLOV, 3 - Math.round((w.dx + w.dy) * 0.6) + (w.h > 0.5 ? 1 : 0));
}
const DIRS = Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 16), Math.sin(i * Math.PI / 16)]);
// pine needles: a few straight strokes in each 4 px cell, at random angles (the 3 x 3 block of needles
// around the last cell is kept, as for worley())
const NK = new Float64Array(3 + 9 * 5);
function needle(x, y, s) {
  const cx = x >> 2, cy = y >> 2;
  if (NK[0] !== cx || NK[1] !== cy || NK[2] !== s) {
    NK[0] = cx; NK[1] = cy; NK[2] = s;
    for (let j = -1, q = 3; j <= 1; j++) for (let i = -1; i <= 1; i++, q += 5) {
      const gx = cx + i, gy = cy + j, h = hh(gx, gy, s), dr = DIRS[(h * 20) & 15];
      NK[q] = h; NK[q + 1] = dr[0]; NK[q + 2] = dr[1]; NK[q + 3] = gx * 4 + 2 + (hh(gy, gx, s) - 0.5) * 3; NK[q + 4] = gy * 4 + 2 + (hh(gx + 7, gy, s) - 0.5) * 3;
    }
  }
  for (let q = 3; q < 48; q += 5) {
    const h = NK[q];
    if (h > 0.8) continue;
    const px = x - NK[q + 3], py = y - NK[q + 4], al = px * NK[q + 1] + py * NK[q + 2], ac = py * NK[q + 1] - px * NK[q + 2], L = 3 + h * 4;
    if (h < 0.62 && ac > -0.6 && ac < 0.6 && al > -L && al < L) return h;
  }
  return -1;
}
// a herringbone of bricks at 45 degrees (2 x 1 dominoes, half of them turned): mortar, brick id, row
function herring(x, y, w) {
  const P = (x + y) * 0.7071 / w + 4096, Q = (y - x) * 0.7071 / w + 4096, i = Math.floor(P), j = Math.floor(Q), fp = P - i, fq = Q - j, d = (i + j) & 3, m = 0.75 / w;
  let mort, id;
  if (d < 2) { mort = fq < m || (d === 0 && fp < m); id = (i - d) * 7919 + j; HB.u = (d + fp) / 2; HB.v = fq; }
  else { mort = fp < m || (d === 2 && fq < m); id = i * 7919 + j - (d - 2); HB.u = fp; HB.v = (d - 2 + fq) / 2; }
  HB.id = id; return mort;
}
const HB = { id: 0, u: 0, v: 0 };
// a crack across a slab: from one edge to another, with a jitter; true on the crack line
function slabCrack(lx, ly, S, sh, x, y) {
  const a0 = sh * 4 | 0, a = (a0 + 1 + (sh * 13 | 0) % 3) & 3, p0 = (sh * 97 % 1) * S, p1 = (sh * 31 % 1) * S;
  const ax = a0 === 0 ? p0 : a0 === 1 ? S : a0 === 2 ? p0 : 0, ay = a0 === 0 ? 0 : a0 === 1 ? p0 : a0 === 2 ? S : p0;
  const bx = a === 0 ? p1 : a === 1 ? S : a === 2 ? p1 : 0, by = a === 0 ? 0 : a === 1 ? p1 : a === 2 ? S : p1;
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, d = ((lx - ax) * dy - (ly - ay) * dx) / L;
  if (d > 2.2 || d < -2.2) return false;
  return Math.abs(d + (vnc(x, y, 5, 77) - 0.5) * 3) < 0.6;
}

const G_LAWN = RP('#122a20 #183825 #20482b #2b592f #396932 #4b7a34 #618a39 #809d41');
const G_PARK = RP('#122d22 #193c27 #234c2d #2e5d31 #3d6c33 #507c36 #698e3c #87a246');
const G_GREEN = RP('#1a4424 #24562a #2f6a30 #3c7c36 #4c8e3c #5ea044 #74b24e #8ec45c');   // a putting green: short, even, bright
const G_MEAD = RP('#0f201b #142d1e #1c3b22 #284b25 #385827 #4c662c #677633 #888a42');
const G_DRY = RP('#2a3426 #3a442c #4c5432 #5e6438 #727240 #86824a #9c9458 #b4aa6c');
const G_ALP = RP('#1e2e2c #283c32 #344a38 #42583c #546640 #687448 #808452 #9a9862');
const CLOV = RP('#143327 #1b432c #255432 #336638 #46783e #5e8b47');
const FLWR = RP('#d8d2c0 #f2eedf'), FLWY = RP('#c8902a #ecc848');
const SOIL_F = RP('#121012 #1d181a #292121 #362c2c #453937 #574945 #685b57');
const NEEDLE = RP('#2c2420 #40352a #564837 #6c5a44 #806d55 #928167');
const MOSS = RP('#1e3a2a #284c30 #345e36 #42703c');
const MUD = RP('#231d20 #312829 #403432 #50423c #625248 #766456 #8a7866');
const PUD = RP('#1e3450 #2c4a6e #46689a #6a8ec0 #9cbce6');
const GRV_C = RP('#1a232a #2f3840 #404953 #4d5762 #636c73 #727c80 #7c8687');
const GRV_W = RP('#3a3432 #4e4642 #645a54 #7a6e66 #908478 #a69a8c');
const DIRT2 = RP('#3c3028 #524236 #685444 #7c6652 #8e7660 #a0886e #b29a80');
const PLOW = RP('#211b1e #2e2526 #3c302e #4c3c38 #5c4a42 #6e5a4e #82705e');
const SPROUT = RP('#2e5a32 #4a7e3a #6aa044');
const DUNE = RP('#896d52 #9a7c5a #a98963 #b5956d #bd9f75 #c5a97f #cbb289');
const DESR = RP('#5a4a3c #6e5a48 #826c54 #947c62 #a48c70 #b49c80 #c2ac90');
const REDS = RP('#382325 #4d2d2d #623835 #72433d #835046 #905d53 #9c6c60');
const REDST = RP('#3f2527 #563131 #6c3c39 #7e4741 #90544a #9f6357 #ad7466');
const CRACK = RP('#4a3a32 #62503e #78644e #8a745c #9a846a #aa947a #b8a48a');
const BEACH = RP('#7e7a6e #989383 #aea997 #beb8a4 #cac4af #d3ceba #dad6c5');
const WETS = RP('#4e4c48 #605c54 #726c62 #847c70 #948a7c #a49884');
const PEBG = RP('#2c2e34 #44464c #5c5e64 #76787c #929494');
const SETT = RP('#1c2327 #383f46 #515963 #646d79 #737b84 #7c8489 #818a8c');
const SETTW = RP('#3a3230 #4c4240 #605450 #746660 #887870 #9a8a80');
const BRK = RP('#2d202d #472d37 #5e3840 #6f4046 #744b49 #75524b #73564b');
const MORT = RP('#28262e #3c3a42 #58565a');
const HBR = RP('#24262f #423b43 #5b4e55 #6f5c63 #726363 #726660 #6f675d');
const SLAB = RP('#4f5561 #5c6370 #6a717e #757d8b #808895 #8a929f #919aa7 #98a1ae');
const STONE2 = RP('#585c5f #676c71 #787d81 #848a8f #90969c #99a0a7 #a2a9b1');
const PAVE2 = RP('#6a6258 #7e766a #92887a #a49a8a #b4aa98 #c2b8a6 #cec4b2');
const ASPF = RP('#19232e #242e3a #2c3744 #333d4b #3f4855 #46505c #4b5560');
const ASPO = RP('#222a33 #2c353f #353e49 #3b4450 #48505b #505962 #555d66');
const AGG = RP('#7e8084 #939292 #aaa6a1');
const YARDC = RP('#3a3d44 #4b4f56 #5d626b #6f747e #80858f #9096a0 #a0a6b0');
const WOOD = RP('#2e2420 #40322a #544234 #68523e #7a624a #8c7256 #9e8466');
const WOODG = RP('#3a3836 #4e4a46 #625c56 #766e66 #8a8076 #9c9286 #aea496');
const SCREE = RP('#2a2c32 #3a3c42 #4c4e52 #5e6064 #727476 #868886 #9a9a98');
const QUAR = RP('#575a5c #6b6e6f #7f8181 #939494 #a5a6a5 #b4b6b3 #c4c4c2');
const GRAIN = RP('#5a4c2a #746236 #8e7842 #a68c4e #b89e5c #c8b06c #d6c080');
const CORN = RP('#183026 #20402c #2a5232 #386438 #4a763e #608846 #789a50');
const VEGL = RP('#1e3c38 #284e44 #34644e #447a58 #589062 #6ea66e');
const HAY = RP('#40462c #565c34 #6e723e #848648 #9a9a54 #aeac62 #c0bc74');
const FOUND = RP('#2b2c2f #333437 #3b3c3f #444548 #4d4e50');
const PATHG = RP('#555454 #6a6867 #7e7d7b #90908d #a1a19e #b1b1af #bdbebd');
const BALL = RP('#2c2c30 #3c3a3c #4c4a4a #5e5a58 #706a66 #847c76');
const RUST = RP('#4a2e22 #6a3e2a #8a5234');

export const GSHADE = {
  // --- grass --------------------------------------------------------------------------------------------
  grassLawn: (x, y, s) => grass(G_LAWN, x, y, s, 4, 1),                         // mown, in broad stripes

  grassPark(x, y, s) { const c = clover(x, y, s, 0.14); return c || (hh(x, y, s + 21) > 0.9994 ? at(FLWR, 1) : grass(G_PARK, x, y, s, 4)); },
  grassClover(x, y, s) { return clover(x, y, s, 0.62) || grass(G_PARK, x, y, s, 4); },
  grassMeadow(x, y, s) { const h = hh(x, y, s + 23); if (h > 0.994) return at(FLWY, h > 0.997 ? 1 : 0); return grass(G_MEAD, x, y, s, 5); },
  grassDry(x, y, s) {
    const p = vnc(x, y, 17, s + 51);
    if (p < 0.3) return GSHADE.dirtPebbly(x, y, s);
    if (p < 0.36 && hh(x, y, s) > 0.5) return at(DIRT2, 3);
    return grass(G_DRY, x, y, s, 4);
  },
  grassAlpine(x, y, s) { const p = stone(x, y, 11, s + 61, 0.32); if (p >= 0) return sd(SCREE, p, x, y, 0.4); GS.nx = GS.ny = 0; return grass(G_ALP, x, y, s, 4); },
  grassGreen(x, y, s) { const ck = (((x / 14) | 0) + ((y / 14) | 0)) & 1, n = hh(x, y, s + 3), b = vnc(x, y, 40, s + 7); return at(G_GREEN, 5 - ck + (n > 0.94 ? 1 : n < 0.04 ? -1 : 0) + (b > 0.7 ? 1 : 0)); },   // (mown in a checker)
  grassGolf(x, y, s) { const k = (((x + y * 0.2) / 44) | 0) & 1; const c = grass(G_PARK, x, y, s, 3); return k ? c : at(G_PARK, G_PARK.indexOf(c) - 1); },
  pasture(x, y, s) { const c = clover(x, y, s, 0.18); return c || grass(G_MEAD, x, y, s, 4); },
  // --- earth --------------------------------------------------------------------------------------------
  forestFloor(x, y, s) {
    const m = vnc(x, y, 14, s + 7);
    if (m > 0.56) return at(MOSS, 1 + ((hh(x, y, s) * 3) | 0) + (m > 0.66 ? 0 : -1));   // (a mossy floor: green under the trees)
    const n = needle(x, y, s + 11);
    if (n >= 0) return at(NEEDLE, n < 0.35 ? 1 : n < 0.6 ? 3 : 4 + (n > 0.72 ? 1 : 0));
    const big = vnc(x, y, 33, s + 3), h = hh(x, y, s + 5);
    return sd(SOIL_F, 0.42 + (big - 0.5) * 0.4 + (h > 0.9 ? 0.15 : h < 0.1 ? -0.15 : 0), x, y, 0.8);
  },
  forestDirt(x, y, s) {
    const n = needle(x, y, s + 11);
    if (n >= 0 && n < 0.45) return at(NEEDLE, n < 0.2 ? 2 : 3);
    const p = stone(x, y, 10, s + 15, 0.18); if (p >= 0) return sd(SCREE, p, x, y, 0.4);
    GS.nx = GS.ny = 0;
    const big = vnc(x, y, 33, s + 3), h = hh(x, y, s + 5);
    return sd(SOIL_F, 0.5 + (big - 0.5) * 0.4 + (vnc(x, y, 5, s) - 0.5) * 0.25 + (h > 0.9 ? 0.12 : h < 0.1 ? -0.14 : 0), x, y, 0.8);
  },
  mudRuts(x, y, s) {
    const big = vnc(x, y, 29, s + 3), fine = vnc(x, y, 5, s + 5), h = hh(x, y, s);
    if (big > 0.72 && fine > 0.36) { GS.water = 1; return sd(PUD, fine < 0.4 ? 0.62 : 0.12 + (fine - 0.4) * 0.8 + (h > 0.95 ? 0.35 : 0), x, y, 0.4); }
    const p = stone(x, y, 9, s + 13, 0.18); if (p >= 0) return sd(PEBG, p, x, y, 0.4);
    GS.nx = GS.ny = 0;
    let t = 0.42 + (big - 0.5) * 0.35 + (fine - 0.5) * 0.3 + (h > 0.92 ? 0.2 : h < 0.06 ? -0.2 : 0);
    if (fine > 0.66 && big > 0.5) t += 0.18;
    return sd(MUD, t, x, y, 0.8);
  },
  gravelGrey(x, y, s) {                                       // fine gravel (a few px per stone at game scale)
    const p = stone(x, y, 4, s + 17, 0.6, 0.9);
    if (p < 0) { GS.nx = GS.ny = 0; return sd(GRV_C, 0.12 + hh(x, y, s) * 0.16, x, y, 0.3); }
    return sd(WC.h > 0.84 ? GRV_W : GRV_C, p, x, y, 0.35);
  },
  dirtPebbly(x, y, s) {
    const p = stone(x, y, 9, s + 19, 0.2);
    if (p >= 0) return sd(WC.h > 0.6 ? PEBG : DIRT2, p * 0.9 + 0.05, x, y, 0.4);
    GS.nx = GS.ny = 0;
    const big = vnc(x, y, 38, s + 3), fine = vnc(x, y, 4, s + 5), h = hh(x, y, s);
    return sd(DIRT2, 0.52 + (big - 0.5) * 0.3 + (fine - 0.5) * 0.28 + (h > 0.9 ? 0.14 : h < 0.08 ? -0.16 : 0), x, y, 0.7);
  },
  soilPlowed: (x, y, s) => plow(y, x, x, y, s, 0),      // furrows running along x
  soilPlowedV: (x, y, s) => plow(x, y, x, y, s, 1),     // furrows running along y
  sandDune(x, y, s) {
    const wob = vnc(x, y, 31, s + 3) * 14 + vnc(x, y, 9, s + 4) * 3, r = (x * 0.55 + y * 0.83 + wob) / 9, f = r - Math.floor(r);
    if (hh(x, y, s) > 0.994) return at(PEBG, 2);
    GS.nx = f < 0.25 ? -0.22 : f > 0.75 ? 0.18 : 0; GS.ny = GS.nx * 1.4;
    return sd(DUNE, 0.5 + (f < 0.16 ? 0.28 : f < 0.3 ? 0.12 : f > 0.8 ? -0.2 : 0) + (vnc(x, y, 60, s) - 0.5) * 0.3, x, y, 0.6);
  },
  desertGround(x, y, s) {
    let p = stone(x, y, 13, s + 27, 0.15);
    if (p >= 0 && WC.h < 0.55) return sd(WC.h > 0.3 ? REDST : PEBG, p * 0.8 + 0.1, x, y, 0.4);
    GS.nx = GS.ny = 0;
    const big = vnc(x, y, 40, s + 3), f = vnc(x, y, 5, s + 2), h = hh(x, y, s + 3);
    let t = 0.55 + (big - 0.5) * 0.3 + (f - 0.5) * 0.25 + (h > 0.92 ? 0.14 : h < 0.06 ? -0.18 : 0);
    // baked hardpan in patches: thin polygonal cracks, each plate curling up a little at its edges
    const pan = vnc(x, y, 83, s + 29);
    if (pan > 0.56) {
      const w = worley(x + 0.5, y + 0.5, 17, s + 25, 0.8), e = w.d2 - w.d1;
      if (e < 0.75 + (pan - 0.56) * 1.2) return sd(DESR, t - 0.32, x, y, 0.4);
      if (e < 2) t += 0.08;
      GS.nx = w.dx / 40; GS.ny = w.dy / 40;
    }
    return sd(DESR, t, x, y, 0.8);
  },
  redRock(x, y, s) {
    let p = stone(x, y, 19, s + 21, 0.28);
    if (p >= 0 && WC.h < 0.35) { GS.nx *= 0.5; GS.ny *= 0.5; return sd(REDST, p * 0.8 + 0.12, x, y, 0.35); }
    p = stone(x, y, 8, s + 23, 0.2);
    if (p >= 0 && WC.h < 0.5) { GS.nx *= 0.5; GS.ny *= 0.5; return sd(REDST, p * 0.7 + 0.1, x, y, 0.4); }
    GS.nx = GS.ny = 0;
    const big = vnc(x, y, 33, s), f = vnc(x, y, 5, s + 2), h = hh(x, y, s + 3);
    return sd(REDS, 0.5 + (big - 0.5) * 0.35 + (f - 0.5) * 0.25 + (h > 0.92 ? 0.15 : h < 0.07 ? -0.18 : 0), x, y, 0.7);
  },
  earthCracked(x, y, s) {
    const w = worley(x + 0.5, y + 0.5, 19, s + 25, 0.75), e = w.d2 - w.d1;
    if (e < 1.3) return at(CRACK, e < 0.7 ? 0 : 1);
    GS.nx = w.dx / 34; GS.ny = w.dy / 34;
    if (hh(x, y, s + 5) > 0.996) return at(PEBG, 2);
    return sd(CRACK, 0.62 + (w.h - 0.5) * 0.2 - (w.dx + w.dy) / 70 + (e < 1.8 ? -0.1 : 0) + (vnc(x, y, 4, s) - 0.5) * 0.18, x, y, 0.5);
  },
  scree(x, y, s) {                                           // mountain ground: grey soil, stones of all sizes, lichen
    let p = stone(x, y, 17, s + 29, 0.3);
    if (p >= 0 && WC.h < 0.5) return sd(SCREE, p * 0.9 + 0.12, x, y, 0.35);
    p = stone(x, y, 7, s + 31, 0.3);
    if (p >= 0 && WC.h < 0.6) return sd(SCREE, p * 0.8 + 0.02, x, y, 0.4);
    GS.nx = GS.ny = 0;
    if (vnc(x, y, 11, s + 33) > 0.72) return at(G_ALP, 2 + (hh(x, y, s) > 0.5 ? 1 : 0));
    return sd(DIRT2, 0.28 + vnc(x, y, 9, s) * 0.22 + (hh(x, y, s) - 0.5) * 0.14, x, y, 0.6);
  },
  quarryRock(x, y, s) {
    const bench = ((y + ((vnc(x, y, 40, s) * 10) | 0)) % 56);
    if (bench < 2) return at(QUAR, bench === 0 ? 0 : 1);
    if (bench < 5) return at(QUAR, 5);
    const p = stone(x, y, 5, s + 33, 0.45);
    if (p >= 0) return sd(QUAR, p, x, y, 0.4);
    GS.nx = GS.ny = 0;
    return sd(QUAR, 0.42 + (hh(x, y, s) - 0.5) * 0.2 + (vnc(x, y, 23, s + 1) - 0.5) * 0.25, x, y, 0.6);
  },
  rockShore(x, y, s) {                                       // a rocky shore: big rounded boulders, wet dark gaps, weed
    let p = stone(x, y, 15, s + 41, 0.44, 0.9);
    if (p >= 0) return sd(WC.h > 0.75 ? GRV_W : SCREE, p * 0.9 + 0.08, x, y, 0.35);
    p = stone(x, y, 6, s + 43, 0.4);
    if (p >= 0) return sd(PEBG, p * 0.8, x, y, 0.4);
    GS.nx = GS.ny = 0;
    return vnc(x, y, 9, s + 45) > 0.68 ? at(MOSS, 1 + (hh(x, y, s) > 0.5 ? 1 : 0)) : at(SCREE, hh(x, y, s) > 0.6 ? 1 : 0);
  },
  pebbleBeach(x, y, s) {                                     // shingle: sand between packed pebbles
    const p = stone(x, y, 6, s + 47, 0.46, 0.9);
    if (p >= 0) return sd(WC.h > 0.6 ? GRV_W : PEBG, p * 0.85 + 0.1, x, y, 0.35);
    GS.nx = GS.ny = 0;
    return GSHADE.sandBeach(x, y, s);
  },
  // --- sand ---------------------------------------------------------------------------------------------
  sandBeach(x, y, s) {
    const big = vnc(x, y, 44, s + 3), f = vnc(x, y, 3, s + 5), h = hh(x, y, s);
    if (h > 0.9965) return at(PEBG, 1 + ((hh(x, y, s + 1) * 3) | 0));
    return sd(BEACH, 0.6 + (big - 0.5) * 0.22 + (f - 0.5) * 0.3 + (h > 0.85 ? 0.1 : h < 0.12 ? -0.12 : 0), x, y, 0.9);
  },
  sandWet(x, y, s) { const h = hh(x, y, s); if (h > 0.995) return at(PEBG, 2); return sd(WETS, 0.5 + (vnc(x, y, 7, s + 5) - 0.5) * 0.4 + (h > 0.88 ? 0.15 : 0), x, y, 0.8); },
  // --- paving -------------------------------------------------------------------------------------------
  cobbleSett(x, y, s) {
    const H = 13, Wd = 14, row = Math.floor(y / H), ox = (row & 1) * 7 + ((hh(row, 0, s) * 3) | 0);
    const col = Math.floor((x + ox) / Wd), lx = x + ox - col * Wd, ly = y - row * H, sh = hh(col, row, s + 13);
    const ix = lx < 3 ? 3 - lx : lx > Wd - 4 ? lx - (Wd - 4) : 0, iy = ly < 3 ? 3 - ly : ly > H - 4 ? ly - (H - 4) : 0, d = Math.sqrt(ix * ix + iy * iy);
    if (d > 2.7 || lx === 0 || ly === 0) {
      if (hh(x, y, s + 3) > 0.86 && vnc(x, y, 13, s + 41) > 0.55) return at(G_MEAD, 3 + ((hh(x, y, s + 4) * 3) | 0));
      return at(SETT, 0);
    }
    const u = (lx - Wd / 2) / (Wd / 2), v = (ly - H / 2) / (H / 2);
    GS.nx = u * 0.3; GS.ny = v * 0.3;
    return sd(sh > 0.82 ? SETTW : SETT, 0.54 + (sh - 0.5) * 0.36 - (u + v) * 0.15 - d * 0.12 + (hh(x, y, s + 7) - 0.5) * 0.14, x, y, 0.4);
  },
  brickRun(x, y, s) {
    const H = 7, Wd = 16, row = Math.floor(y / H), ox = (row & 1) * 8, col = Math.floor((x + ox) / Wd), lx = x + ox - col * Wd, ly = y - row * H, bh = hh(col, row, s + 17);
    if (ly === 0 || lx === 0) return at(MORT, hh(x, y, s) > 0.85 ? 1 : 0);
    let t = 0.55 + (bh - 0.5) * 0.4 + (ly === 1 ? 0.12 : ly === H - 1 ? -0.12 : 0) + (lx === 1 ? 0.06 : lx === Wd - 1 ? -0.08 : 0) + (hh(x, y, s + 5) - 0.5) * 0.2;
    if (bh > 0.93) t -= 0.25;
    return sd(BRK, t, x, y, 0.4);
  },
  brickHerring(x, y, s) {
    if (herring(x, y, 5.5)) return at(MORT, hh(x, y, s) > 0.88 ? 1 : 0);
    const bh = hh(HB.id, 3, s + 19);
    return sd(HBR, 0.55 + (bh - 0.5) * 0.42 + (HB.u < 0.12 || HB.v < 0.14 ? 0.12 : HB.u > 0.9 || HB.v > 0.86 ? -0.1 : 0) + (hh(x, y, s + 5) - 0.5) * 0.18, x, y, 0.4);
  },
  slabConcrete: (x, y, s) => slab(SLAB, x, y, s, 34, 0, 0),
  slabDrive(x, y, s) {                                         // a driveway: poured concrete, big slabs, tyre grime
    const S = 40, lx = x % S, ly = y % S;
    if (lx === 0 || ly === 0) return at(SLAB, 1);
    let t = 0.62 + (vnc(x, y, 9, s + 5) - 0.5) * 0.12 + (vnc(x, y, 31, s + 7) - 0.5) * 0.12 + (hh(x, y, s) > 0.95 ? 0.06 : 0);
    if (vnc(x, y, 7, s + 31) > 0.78) t -= 0.14;
    return sd(SLAB, t, x, y, 0.5);
  },
  slabCracked: (x, y, s) => slab(SLAB, x, y, s, 34, 1, 0),
  slabStone(x, y, s) {                                         // pale limestone, long slabs in running bond
    const H = 28, Wd = 44, row = Math.floor(y / H), ox = (row & 1) * 22, col = Math.floor((x + ox) / Wd), lx = x + ox - col * Wd, ly = y - row * H, sh = hh(col, row, s + 23);
    if (lx === 0 || ly === 0) return at(STONE2, 1);
    let t = 0.62 + (sh - 0.5) * 0.16 + (vnc(x, y, 13, s + 5) - 0.5) * 0.1 + (lx === 1 || ly === 1 ? 0.06 : 0) + (hh(x, y, s) > 0.96 ? 0.06 : 0);
    if (vnc(x, y, 7, s + 43) > 0.86 && sh > 0.4) t -= 0.12;
    return sd(STONE2, t, x, y, 0.4);
  },
  slabPlaza(x, y, s) {                                         // plaza pavers, an accent band every few
    const S = 22, sx = Math.floor(x / S), sy = Math.floor(y / S), lx = x - sx * S, ly = y - sy * S, sh = hh(sx, sy, s + 9);
    const R = SLAB;
    if (lx === 0 || ly === 0) return at(R, 1);
    return sd(R, 0.62 + (sh - 0.5) * 0.16 + (vnc(x, y, 11, s + 5) - 0.5) * 0.1 + (lx === 1 || ly === 1 ? 0.06 : 0) + (hh(x, y, s) > 0.95 ? 0.07 : 0), x, y, 0.45);
  },
  // (asphalt reads as one calm surface, as in the concepts: broad tone, a fleck of aggregate here and there - the
  // cracks, patches, stains and paint carry the detail)
  asphaltFresh(x, y, s) {
    const h = hh(x, y, s), big = vnc(x, y, 61, s + 3), m = vnc(x, y, 13, s + 5);
    if (hh(x >> 1, y >> 1, s + 7) > 0.998) return at(AGG, ((x & 1) === 0 && (y & 1) === 0) ? 1 : 0);
    if (h > 0.995) return at(AGG, (hh(x, y, s + 1) * 2) | 0);
    return sd(ASPF, 0.5 + (big - 0.5) * 0.2 + (m - 0.5) * 0.12 + (h < 0.08 ? -0.1 : h > 0.86 ? 0.06 : 0), x, y, 0.45);
  },
  asphaltOld(x, y, s) {
    const h = hh(x, y, s), big = vnc(x, y, 47, s + 3), m = vnc(x, y, 11, s + 5);
    if (h > 0.994) return at(AGG, (hh(x, y, s + 1) * 2) | 0);
    return sd(ASPO, 0.5 + (big - 0.5) * 0.28 + (m - 0.5) * 0.16 + (h < 0.07 ? -0.12 : h > 0.88 ? 0.07 : 0), x, y, 0.5);
  },
  lotAsphalt(x, y, s) {
    const h = hh(x, y, s), big = vnc(x, y, 37, s + 3), m = vnc(x, y, 9, s + 5);
    if (h > 0.992) return at(AGG, (hh(x, y, s + 1) * 3) | 0);
    let t = 0.52 + (big - 0.5) * 0.3 + (m - 0.5) * 0.16 + (h < 0.07 ? -0.1 : h > 0.88 ? 0.06 : 0);
    if (vnc(x, y, 19, s + 47) > 0.78) t -= 0.18;              // oil and tyre grime
    return sd(ASPO, t, x, y, 0.5);
  },
  yardSlab(x, y, s) {
    const S = 64, lx = x % S, ly = y % S, sh = hh(Math.floor(x / S), Math.floor(y / S), s + 7);
    if (lx === 0 || ly === 0) return at(YARDC, 0);
    let t = 0.5 + (sh - 0.5) * 0.18 + (vnc(x, y, 40, s) - 0.5) * 0.2 + (vnc(x, y, 7, s + 1) - 0.5) * 0.14 + (hh(x, y, s) > 0.95 ? 0.08 : 0) + (lx === 1 || ly === 1 ? 0.05 : 0);
    if (vnc(x, y, 9, s + 33) > 0.8) t -= 0.13;
    return sd(YARDC, t, x, y, 0.7);
  },
  apron(x, y, s) {
    const lx = x % 96, ly = y % 48, sh = hh(Math.floor(x / 96), Math.floor(y / 48), s + 7);
    if (lx === 0 || ly === 0) return at(YARDC, 2);
    return sd(YARDC, 0.66 + (sh - 0.5) * 0.12 + (vnc(x, y, 30, s) - 0.5) * 0.14 + (hh(x, y, s) > 0.96 ? 0.06 : 0) - (vnc(x, y, 14, s + 33) > 0.8 ? 0.14 : 0), x, y, 0.5);
  },
  pathGravel(x, y, s) {                                     // a park path: fine compacted gravel, a few larger stones
    const p = stone(x, y, 6, s + 39, 0.22);
    if (p >= 0 && WC.h < 0.4) return sd(PATHG, p * 0.7 + 0.2, x, y, 0.4);
    GS.nx = GS.ny = 0;
    const h = hh(x, y, s);
    return sd(PATHG, 0.58 + (vnc(x, y, 21, s + 3) - 0.5) * 0.18 + (vnc(x, y, 4, s + 5) - 0.5) * 0.18 + (h > 0.9 ? 0.12 : h < 0.1 ? -0.14 : 0), x, y, 0.7);
  },
  planks: (x, y, s) => plank(x, y, s, WOOD, 7, 52),            // boards running along y (laid across an E-W pier)
  planksX: (x, y, s) => plank(y, x, s, WOOD, 7, 52),           // boards running along x
  boardwalk: (x, y, s) => plank(y, x, s, WOODG, 8, 70),
  boardwalkV: (x, y, s) => plank(x, y, s, WOODG, 8, 70),
  ballastStone(x, y, s) {
    const p = stone(x, y, 4, s + 37, 0.6, 0.9);
    if (p < 0) { GS.nx = GS.ny = 0; return at(BALL, 0); }
    if (WC.h > 0.9) return sd(RUST, p, x, y, 0.4);
    return sd(BALL, p, x, y, 0.4);
  },
  // --- crops --------------------------------------------------------------------------------------------
  cropWheat(x, y, s) {                                       // rows of ripe ears, bright on top, dark between the rows
    const wy = y + ((vnc(x, y, 47, s + 1) * 5) | 0), P = 6, row = Math.floor(wy / P), ly = wy - row * P;
    const col = (x + row * 3) >> 1, ch = hh(col, row, s + 3), sheen = vnc(x * 0.7, y, 41, s + 13);
    let k;
    if (ch < 0.78 && ly <= 3 - (ch > 0.6 ? 1 : 0)) { k = ly === 0 ? 6 : ly === 1 ? 5 : 4; if ((x + row) & 1) k -= 1; GS.h = 5 - ly; }
    else { k = ly >= 4 ? 1 : 2; GS.h = 2; }
    k += sheen > 0.64 ? 1 : sheen < 0.34 ? -1 : 0;
    return at(GRAIN, k);
  },
  cropCorn: (x, y, s) => corn(x, y, s, 0),
  cropCornV: (x, y, s) => corn(y, x, s, 1),
  cropVeg(x, y, s) {
    const P = 13, row = Math.floor(y / P), ly = y - row * P, pi = Math.floor((x + (row & 1) * 6) / 12), lx = x + (row & 1) * 6 - pi * 12;
    const dx = lx - 6, dy = ly - 6.5, r2 = dx * dx + dy * dy, ph = hh(pi, row, s + 5);
    if (r2 < 20 + ph * 6) { GS.nx = dx * 0.08; GS.ny = dy * 0.08; GS.h = 3; return sd(VEGL, 0.62 - (dx + dy) * 0.06 + (ph - 0.5) * 0.3 - (r2 > 16 ? 0.15 : 0) + ((dx * dy > 0) !== (Math.abs(dx) > Math.abs(dy)) ? 0.08 : -0.04), x, y, 0.4); }
    return plow(y, x, x, y, s, 0);
  },
  cropHay(x, y, s) {
    const w = (y + ((vnc(x, y, 60, s) * 8) | 0)) % 26;
    if (w < 5) { GS.h = w < 3 ? 2 : 1; return sd(HAY, 0.75 + (hh(x >> 1, y, s) - 0.5) * 0.4 - (w === 4 ? 0.3 : 0), x, y, 0.6); }
    return grass(G_DRY, x, y, s, 3);
  },
  // --- built ground -------------------------------------------------------------------------------------
  foundation(x, y, s) { const lx = x & 31, ly = y & 31; return (lx === 0 || ly === 0) ? at(FOUND, 0) : sd(FOUND, 0.55 + (hh(x, y, s) - 0.5) * 0.3 + (vnc(x, y, 23, s) - 0.5) * 0.3, x, y, 0.5); },
  underDeck(x, y, s) { const v = vnc(x, y, 21, s + 9); if (v > 0.6) return GSHADE.gravelGrey(x, y, s); const c = GSHADE.dirtPebbly(x, y, s); return v < 0.3 && hh(x, y, s) > 0.4 ? at(MUD, 2) : c; },
  counterTop(x, y, s) { return sd(WOOD, 0.35 + (y % 6 === 0 ? -0.25 : 0) + (hh(x >> 3, y, s) - 0.5) * 0.2, x, y, 0.4); },
};
function slab(R, x, y, s, S, cracked) {
  const sx = Math.floor(x / S), sy = Math.floor(y / S), lx = x - sx * S, ly = y - sy * S, sh = hh(sx, sy, s + 9);
  if (lx === 0 || ly === 0) return at(R, 1);
  let t = 0.6 + (sh - 0.5) * 0.14 + (vnc(x, y, 11, s + 5) - 0.5) * 0.12 + (lx === 1 || ly === 1 ? 0.07 : lx === S - 1 || ly === S - 1 ? -0.05 : 0);
  const h = hh(x, y, s); t += h > 0.95 ? 0.08 : h < 0.04 ? -0.1 : 0;
  if (vnc(x, y, 6, s + 41) > 0.84 && sh > 0.35) t -= 0.16;                    // stains
  if (cracked && sh > 0.35 && slabCrack(lx, ly, S, sh, x, y)) return at(R, 0);
  if (cracked && sh < 0.12 && lx + ly < 9) t -= 0.18;                            // a broken corner
  return sd(R, t, x, y, 0.5);
}
function plow(u, w, x, y, s, vert) {
  const P = 16, f = ((u % P) + P) % P;
  if (f >= 4 && f <= 5 && ((w % 9) + 9) % 9 < 2 && hh(Math.floor(w / 9), Math.floor(u / P), s + 3) > 0.42) { GS.h = 1; return at(SPROUT, f === 4 ? 2 : 1); }
  let t = f < 2 ? 0.3 : f < 3 ? 0.5 : f < 8 ? 0.66 + (f === 4 ? 0.08 : 0) : f < 12 ? 0.42 : 0.12;
  t += (hh(Math.floor(w / 3), Math.floor(u / 2), s) - 0.5) * 0.26 + (vnc(x, y, 23, s) - 0.5) * 0.2;
  const tilt = f < 5 ? -0.3 : f > 9 ? 0.3 : 0;
  if (vert) GS.nx = tilt; else GS.ny = tilt;
  return sd(PLOW, t, x, y, 0.5);
}
function plank(u, w, s, R, P, L) {
  const pl = Math.floor(u / P), lu = u - pl * P, off = (hh(pl, 1, s) * L) | 0, seg = Math.floor((w + off) / L), lw = w + off - seg * L, ph = hh(pl, seg, s + 3);
  if (lu === 0) return at(R, 0);
  if (lw === 0) return at(R, 1);
  if ((lw === 3 || lw === L - 3) && (lu === 2 || lu === P - 2)) return at(R, 1);    // nail heads
  return sd(R, 0.55 + (ph - 0.5) * 0.36 + (lu === 1 ? 0.14 : lu === P - 1 ? -0.1 : 0) + (vnc(u, w * 0.3, 9, s + 7) - 0.5) * 0.2 + (hh(u, w, s) > 0.93 ? -0.12 : 0), u, w, 0.4);
}
function corn(x, y, s, vert) {
  const P = 16, row = Math.floor(y / P), ly = y - row * P, pi = Math.floor(x / 11), lx = x - pi * 11, ph = hh(pi, row, s + 9);
  const dx = lx - 5.5 + (ph - 0.5) * 2, dy = ly - 8, ad = Math.abs(dx), ady = Math.abs(dy), r = Math.max(ad, ady);
  const leaf = r < 7.5 && (Math.abs(ad - ady * (0.7 + ph * 0.6)) < 1.3 || ad < 1.1 || (ady < 1.2 && ad < 5));
  if (leaf) {
    GS.h = Math.max(1, 9 - Math.round(r));
    if (vert) { GS.nx = dy * 0.06; GS.ny = dx * 0.06; } else { GS.nx = dx * 0.06; GS.ny = dy * 0.06; }
    return sd(CORN, 0.68 - r * 0.05 - (dx + dy) * 0.03 + (ph - 0.5) * 0.2 + (r < 2 ? 0.15 : 0), x, y, 0.4);
  }
  if (ady > 6) return at(PLOW, 1 + ((hh(x, y, s) * 2) | 0));
  return sd(CORN, 0.12 + hh(x, y, s + 1) * 0.15, x, y, 0.4);
}

// ---- ground cover sprites ------------------------------------------------------------------------------
// coverSprite(kind, variant): a tiny upright thing strewn over the ground by the chunk baker - a tuft of
// grass, a flower, a fern, a reed, a pebble, a pine cone, a shell. Anchored at its root (ax, ay); z is the
// height above the ground it stands on; plants are flagged F_LEAF. Cached: identical calls share a sprite.
const COVERS = new Map();
export function coverSprite(kind, v = 0) {
  const key = kind + ':' + v;
  let g = COVERS.get(key);
  if (!g) { g = makeCover(kind, v); COVERS.set(key, g); }
  return g;
}
export const COVER_KINDS = ['turf', 'tuft', 'tuftTall', 'tuftDry', 'tuftAlp', 'seed', 'wheat', 'corn', 'flower', 'fern', 'reed', 'duneGrass', 'weed', 'pebble', 'rock', 'redStone', 'cone', 'twig', 'shell', 'starfish', 'leaf', 'seaweed', 'mushroom', 'scrub', 'lily', 'clod'];
// turf palettes: lawn, park, meadow, dry, alpine, tall meadow - the last two steps are the sunlit blade tips
const TURF = [
  RP('#132a1a #1a3c21 #234c27 #2e5c2b #3d6d30 #4e7e35 #819d41 #b0b851'),
  RP('#132d21 #1b3f27 #25502d #306333 #3d7338 #4c833d #87a446 #b8bf5c'),
  RP('#0e2019 #152e1e #1d3c24 #294b29 #37592c #486531 #838642 #ada55b'),
  RP('#2a3426 #3a442c #4c5432 #5e6438 #727240 #86824a #aaa262 #c6be7e'),
  RP('#1e2e2c #283c32 #344a38 #42583c #546640 #687448 #98965c #bcb478'),
  RP('#0c1b15 #12271a #193621 #244426 #335228 #435e2d #7e8341 #aba459'),
];
const BLOOMS = ['#ecebe2', '#f0c83a', '#e8823a', '#a868c8', '#d8384a', '#f0a0c0', '#6a8ce8'].map((h) => ramp(h, 4, 2, { dark: 0.45, light: 0.6 }));
function makeCover(kind, v) {
  const S = new GBuf(24, 24); S.ax = 12; S.ay = 20;
  let n = (Math.imul(v + 1, 2654435761) ^ (kind.length * 977 + kind.charCodeAt(0) * 31)) >>> 0;
  const r = () => { n = (n + 0x6D2B79F5) | 0; let t = Math.imul(n ^ (n >>> 15), 1 | n); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const put = (x, y, c, nx, ny, z, f) => { x = Math.round(x); y = Math.round(y); if (!S.inside(x, y)) return; S.put(x, y, c, norm([nx, ny, 1]), Math.max(0, z), null, f); };
  // a blade from the root: lean (px per px of height), height, ramp, base shade
  const blade = (x0, lean, h, R, curve = 0, f = F_LEAF, t0 = 0.15) => {
    for (let k = 0; k < h; k++) {
      const x = S.ax + x0 + lean * k + curve * k * k, t = t0 + (k / Math.max(1, h - 1)) * (0.92 - t0);
      put(x, S.ay - k, R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))], lean * 0.5, 0.45, k, f);
    }
  };
  const rock = (w, h, R, f = 0) => {                       // a small domed stone, outlined at the bottom
    for (let y = -h; y <= 1; y++) for (let x = -w; x <= w; x++) {
      const q = (x / (w + 0.5)) ** 2 + ((y + h / 2) / (h / 2 + 1)) ** 2;
      if (q > 1) continue;
      const rim = q > 0.7 && y > -h / 2;
      const t = rim ? 0.08 : 0.62 - (x / w) * 0.25 - ((y + h / 2) / h) * 0.3 + (r() - 0.5) * 0.15;
      put(S.ax + x, S.ay + y, R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1))))], x / w * 0.5, (y + h / 2) / h * 0.6, Math.round(-y + (h + 1) / 2 - Math.abs(x) * 0.3), f);
    }
  };
  switch (kind) {
    case 'tuft': case 'tuftTall': case 'tuftDry': case 'tuftAlp': {
      const R = kind === 'tuftDry' ? G_DRY : kind === 'tuftAlp' ? G_ALP : kind === 'tuftTall' ? G_MEAD : G_LAWN;
      const nb = kind === 'tuftTall' ? 6 + (r() * 4 | 0) : 4 + (r() * 3 | 0), H = kind === 'tuftTall' ? 6 : kind === 'tuftAlp' ? 3 : 4;
      for (let b = 0; b < nb; b++) { const sp = (b / (nb - 1) - 0.5) * 2; blade(Math.round(sp * 2), sp * (kind === 'tuftDry' ? 0.7 : 0.4) + (r() - 0.5) * 0.3, H + (r() * 3 | 0) - (Math.abs(sp) > 0.6 ? 1 : 0), R, (r() - 0.5) * 0.04); }
      break;
    }
    case 'seed': {
      blade(0, (r() - 0.5) * 0.3, 3, G_MEAD); blade(1, 0.2, 2, G_MEAD);
      const h = 7 + (r() * 4 | 0), lean = (r() - 0.5) * 0.25;
      for (let k = 0; k < h; k++) put(S.ax + lean * k, S.ay - k, k > h - 4 ? GRAIN[5 + (k & 1)] : G_DRY[3 + (k > h / 2 ? 1 : 0)], lean, 0.4, k, F_LEAF);
      put(S.ax + lean * h + 1, S.ay - h + 2, GRAIN[4], 0.3, 0.4, h - 2, F_LEAF);
      break;
    }
    case 'wheat': {                                        // a clump of ripe wheat: 3-4 straw stalks, a golden ear on each
      const ns = 3 + (r() * 2 | 0);
      for (let b = 0; b < ns; b++) {
        const x0 = Math.round((b - (ns - 1) / 2) * 1.4), lean = (b - (ns - 1) / 2) * 0.06 + (r() - 0.5) * 0.12, h = 8 + (r() * 4 | 0);
        for (let k = 0; k < h; k++) {
          const ear = k >= h - 3, c = ear ? GRAIN[(k === h - 1 ? 6 : 5 - ((k + b) & 1))] : G_DRY[3 + Math.min(4, k >> 2)];
          put(S.ax + x0 + lean * k, S.ay - k, c, lean * 0.6, 0.4, k, F_LEAF);
          if (ear && k === h - 2 && (b & 1)) put(S.ax + x0 + lean * k + 1, S.ay - k, GRAIN[3], lean, 0.4, k, F_LEAF); // (an awn)
        }
      }
      break;
    }
    case 'corn': {                                         // a corn plant: a tall stalk, broad leaves arching out, a tassel
      const R = RP('#1e3a1c #2c5426 #3e6e30 #568a3a #74a448 #96bc5c'), h = 13 + (r() * 4 | 0), lean = (r() - 0.5) * 0.08;
      for (let k = 0; k < h; k++) put(S.ax + lean * k, S.ay - k, R[1 + Math.min(3, k >> 2)], lean, 0.45, k, F_LEAF);
      for (let l = 0; l < 4; l++) {
        const k0 = 3 + l * 3, side = l & 1 ? 1 : -1, L = 5 + (r() * 3 | 0);
        for (let j = 1; j <= L; j++) { const droop = (j / L) ** 2 * 3; put(S.ax + lean * k0 + side * j, S.ay - k0 + droop - 1, R[Math.min(5, 2 + (j > L / 2 ? 2 : 1) + (l > 1 ? 1 : 0))], side * 0.5, 0.35, Math.max(1, k0 - droop), F_LEAF); }
      }
      for (let k = 0; k < 3; k++) put(S.ax + lean * h, S.ay - h - k, GRAIN[5 - k], 0, 0.4, h + k, F_LEAF);
      break;
    }
    case 'flower': {
      const B = BLOOMS[v % BLOOMS.length], h = 3 + (r() * 3 | 0);
      blade(-1, -0.3, 3, G_PARK); blade(1, 0.3, 3, G_PARK); blade(0, 0, h, G_PARK);
      const big = r() > 0.5;
      for (let y = -1; y <= (big ? 1 : 0); y++) for (let x = -1; x <= (big ? 1 : 0); x++) if (!(big && Math.abs(x) === 1 && Math.abs(y) === 1)) put(S.ax + x, S.ay - h - y, B[y < 0 || x < 0 ? 3 : 1], x * 0.3, -0.2, h + 1, F_LEAF);
      put(S.ax, S.ay - h, B[2], 0, 0, h + 1, F_LEAF);
      break;
    }
    case 'fern': {
      const R = RP('#14301c #1e4424 #2c5a2a #3e702e #568634 #74a03e'), nf = 5 + (r() * 3 | 0);
      for (let f = 0; f < nf; f++) {
        const a = -Math.PI / 2 + (f / (nf - 1) - 0.5) * 2.6 + (r() - 0.5) * 0.3, L = 6 + r() * 3;
        for (let k = 0; k <= L; k++) {
          const droop = (k / L) ** 2 * 3, x = S.ax + Math.cos(a) * k, y = S.ay + Math.sin(a) * k * 0.6 + droop, z = Math.max(0, Math.round(-Math.sin(a) * k * 0.8 - droop * 0.7));
          const t = 0.3 + k / L * 0.6;
          put(x, y, R[Math.round(t * 5)], Math.cos(a) * 0.4, 0.3, z, F_LEAF);
          if (k > 1 && k < L - 1 && (k & 1)) { put(x - Math.sin(a), y + Math.cos(a) * 0.6, R[Math.round(t * 4)], 0, 0.3, z, F_LEAF); put(x + Math.sin(a), y - Math.cos(a) * 0.6, R[Math.round(t * 5)], 0, 0.3, z, F_LEAF); }
        }
      }
      break;
    }
    case 'reed': {
      const R = RP('#1e3a22 #2c5028 #42682e #5e8034 #7e9840'), nr = 3 + (r() * 3 | 0);
      for (let b = 0; b < nr; b++) blade(Math.round((b - nr / 2) * 1.2), (b - nr / 2) * 0.08 + (r() - 0.5) * 0.12, 8 + (r() * 6 | 0), R, (r() - 0.5) * 0.02);
      if (r() > 0.35) { const h = 10 + (r() * 3 | 0); for (let k = h - 3; k <= h; k++) put(S.ax + 1, S.ay - k, k === h ? RP('#6a4426')[0] : RP('#4a2c1a #5e3820')[k & 1], 0, 0.4, k, F_LEAF); }
      break;
    }
    case 'duneGrass': {
      const R = RP('#2e4a3a #3e5e44 #54744e #6e8a5a #8ea06c'), nb = 5 + (r() * 4 | 0);
      for (let b = 0; b < nb; b++) { const sp = (b / (nb - 1) - 0.5) * 2; blade(Math.round(sp * 2), sp * 0.6, 5 + (r() * 4 | 0), R, sp * 0.03); }
      break;
    }
    case 'weed': {
      const R = RP('#1e3c20 #2e5426 #44702c #62903a');
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + r(); put(S.ax + Math.round(Math.cos(a) * 2), S.ay + Math.round(Math.sin(a) * 1.2), R[1 + (k & 1)], Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0, F_LEAF); }
      blade(0, (r() - 0.5) * 0.5, 2 + (r() * 3 | 0), R); if (r() > 0.5) blade(1, 0.5, 2, R);
      break;
    }
    case 'pebble': rock(1 + (r() * 1.6 | 0), 1 + (r() * 2 | 0), [PEBG, GRV_W, DIRT2][v % 3]); break;
    case 'rock': rock(3 + (r() * 3 | 0), 2 + (r() * 3 | 0), [SCREE, PEBG, GRV_C][v % 3]); break;
    case 'redStone': rock(2 + (r() * 4 | 0), 2 + (r() * 3 | 0), REDST); break;
    case 'cone': {
      const R = RP('#2a1810 #4a2c18 #6a4224 #8a5a30'), a = r() > 0.5;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) { const X = a ? y - 1 : x - 1, Y = a ? x - 1 : y - 2; put(S.ax + X, S.ay + Y, R[((x + y) & 1) ? 1 : 2 + (y === 0 ? 1 : 0)], 0, 0.3, a ? 1 : 3 - y, 0); }
      break;
    }
    case 'twig': {
      const R = RP('#3a2418 #5a3a24 #7a5434'), a = r() * Math.PI, L = 4 + (r() * 5 | 0);
      for (let k = -L / 2; k <= L / 2; k++) put(S.ax + Math.cos(a) * k, S.ay + Math.sin(a) * k * 0.7, R[k > 0 ? 2 : 1], 0, 0, 0, 0);
      if (r() > 0.5) put(S.ax + Math.cos(a + 0.8) * 2, S.ay + Math.sin(a + 0.8) * 1.4, R[1], 0, 0, 0, 0);
      break;
    }
    case 'shell': {                                         // a scallop: a fan of ridges, pale and lit on its upper side
      const R = v & 1 ? RP('#a07868 #d0a898 #f0d4c4') : RP('#9a8c7c #ccc0b0 #f2ece0');
      for (let y = -2; y <= 1; y++) for (let x = -3; x <= 3; x++) {
        if ((x * x) / 9 + ((y + 0.5) * (y + 0.5)) / 3.4 > 1.05) continue;
        const ridge = (x + 9) % 2 === 0;
        put(S.ax + x, S.ay + y, y === 1 ? R[0] : ridge ? R[y < 0 ? 2 : 1] : R[y < 0 ? 1 : 0], x * 0.2, -0.2, y < 0 ? 1 : 0, 0);
      }
      put(S.ax, S.ay + 2, R[0], 0, 0, 0, 0);
      break;
    }
    case 'starfish': {
      const R = RP('#9a3a1a #d0602a #f08a40');
      put(S.ax, S.ay, R[1], 0, 0, 1, 0);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 - Math.PI / 2; for (let d = 1; d <= 2; d++) put(S.ax + Math.cos(a) * d, S.ay + Math.sin(a) * d * 0.8, R[d === 1 ? 2 : 1], 0, 0, 0, 0); }
      break;
    }
    case 'leaf': {
      const C = [[196, 120, 40], [214, 168, 52], [168, 70, 36], [150, 160, 50], [226, 196, 90]][v % 5];
      put(S.ax, S.ay, C, 0, 0, 0, 0); put(S.ax + 1, S.ay, C.map((q) => q * 0.82), 0, 0, 0, 0); if (r() > 0.4) put(S.ax, S.ay - 1, C.map((q) => Math.min(255, q * 1.1)), 0, 0, 0, 0);
      break;
    }
    case 'seaweed': {
      const R = RP('#1e2a1c #2e3c22 #46502a'), L = 5 + (r() * 5 | 0); let x = 0;
      for (let k = 0; k < L; k++) { x += (r() - 0.5) * 1.6; put(S.ax + x, S.ay - k * 0.5, R[(k & 1) + (k > L / 2 ? 1 : 0)], 0, 0, 0, 0); }
      break;
    }
    case 'mushroom': {
      const R = v & 1 ? RP('#7a1e1a #b83a2a #e86a4a') : RP('#5a3a24 #8a6040 #b88c5c');
      put(S.ax, S.ay, [220, 210, 190], 0, 0.4, 1, 0); put(S.ax, S.ay - 1, [200, 190, 170], 0, 0.4, 2, 0);
      for (let x = -1; x <= 1; x++) put(S.ax + x, S.ay - 2, R[x < 0 ? 2 : 1], x * 0.4, -0.3, 3, 0);
      put(S.ax, S.ay - 3, R[2], 0, -0.4, 3, 0);
      break;
    }
    case 'scrub': {                                         // a low dusty desert bush: a mound of tiny leaves
      const R = RP('#2a3022 #3a4428 #4e5a30 #66703a #828848 #9ea05a');
      for (let y = -5; y <= 0; y++) for (let x = -5; x <= 5; x++) {
        const q = (x / 5.5) ** 2 + ((y + 2.5) / 3.2) ** 2;
        if (q > 1 || hh(x, y, v) > 0.8) continue;
        put(S.ax + x, S.ay + y, R[Math.max(0, Math.min(5, Math.round(3.4 - x * 0.25 - (y + 2.5) * 0.4 + (r() - 0.5) * 1.6 - q * 1.2)))], x * 0.1, (y + 2.5) * 0.1, Math.round(-y * 0.8 + 1), F_LEAF);
      }
      break;
    }
    case 'lily': {                                          // a lily pad on the water (flat), now and then a flower
      const R = CLOV, rr = 2.5 + r() * 1.5, notch = r() * 6.28;
      for (let y = -3; y <= 3; y++) for (let x = -4; x <= 4; x++) {
        const d = (x / 1.3) ** 2 + y * y, a = Math.atan2(y, x);
        if (d > rr * rr || Math.abs(((a - notch + 9.42) % 6.28) - 3.14) < 0.35) continue;
        put(S.ax + x, S.ay + y, R[Math.max(0, Math.min(5, Math.round(3 - (x + y) * 0.3 - (d > rr * rr * 0.6 ? 1 : 0))))], 0, 0, 0, F_LEAF);
      }
      if (v % 3 === 0) { put(S.ax, S.ay - 1, [244, 200, 220], 0, 0, 1, F_LEAF); put(S.ax + 1, S.ay - 1, [252, 236, 240], 0, 0, 1, F_LEAF); }
      break;
    }
    case 'clod': rock(2 + (r() * 2 | 0), 1 + (r() * 2 | 0), PLOW); break;
    case 'turf': {                                          // v = (palette * 3 + shade) * 16 + variant: dense lawn / meadow tufts
      const pal = (v >> 4) / 3 | 0, shade = ((v >> 4) % 3) - 1, R = TURF[pal] || TURF[0], tall = pal === 2 || pal === 5 ? 2 : 0;
      const nb = 3 + (r() * 3 | 0), q = (k) => R[Math.max(0, Math.min(7, k + shade))];
      for (let b = 0; b < nb; b++) {
        const sp = nb > 1 ? b / (nb - 1) - 0.5 : 0, h = 4 + tall + (r() * 3 | 0) - (Math.abs(sp) > 0.3 ? 1 : 0), lean = sp * (1 + r() * 0.5), curve = sp * 0.07;
        const lit = r() < 0.18 ? 7 : r() < 0.6 ? 6 : 5, body = 4 + ((b + (r() * 2 | 0)) & 1);
        for (let k = 0; k < h; k++) {
          const x = S.ax + Math.round(sp * 2.2 + lean * k + curve * k * k), y = S.ay - k, tip = h - 1 - k;
          const c = tip === 0 ? (shade < 0 && lit === 7 ? q(6) : R[lit]) : tip === 1 && lit === 7 ? R[5] : k === 0 ? q(2) : k === 1 ? q(3) : q(body);
          put(x, y, c, lean * 0.35, 0.12, k, pal < 2 ? F_LEAF | F_NOCAST : F_LEAF);   // (mown turf: self-shaded, casts no shadow)
        }
      }
      break;
    }
  }
  // crop to the drawn pixels, keeping the anchor
  let x0 = S.w, y0 = S.h, x1 = -1, y1 = -1;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (S.col[(y * S.w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return S;
  const O = new GBuf(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < O.h; y++) for (let x = 0; x < O.w; x++) {
    const si = (y + y0) * S.w + x + x0, di = y * O.w + x;
    for (let c = 0; c < 4; c++) { O.col[di * 4 + c] = S.col[si * 4 + c]; O.nrm[di * 4 + c] = S.nrm[si * 4 + c]; }
    O.z[di] = S.z[si]; O.flag[di] = S.flag[si];
  }
  O.ax = S.ax - x0; O.ay = S.ay - y0;
  return O;
}
// the ground between dense turf tufts (what shows in the gaps): dark, mottled, a clover patch now and then
// (pal: the turf palette, as for coverSprite('turf', pal * 16 + v); clover: patch density 0..1)
export function turfGround(pal, x, y, s, clov = 0) {
  if (clov) { const c = clover(x, y, s, clov); if (c) return c; }
  const R = TURF[pal] || TURF[0], big = vnc(x, y, 37, s + 3), h = hh(x, y, s);
  return R[2 + (big > 0.55 ? 1 : 0) + (h > 0.6 ? 1 : 0) - (h < 0.12 ? 1 : 0) + (h > 0.96 ? 2 : 0)];
}
export const cloverAt = (x, y, s, dens) => vnc(x, y, 23, s + 31) >= 1 - dens;
// grass for the lowest quality (no tufts on top): the turf palette's mid greens mottled, sparse sunlit tips
export function turfFlat(pal, x, y, s) {
  const R = TURF[pal] || TURF[0], big = vnc(x, y, 37, s + 3), h = hh(x, y, s);
  return R[3 + (big > 0.55 ? 1 : 0) + (h > 0.55 ? 1 : 0) - (h < 0.15 ? 2 : 0) + (h > 0.94 ? 2 : 0)];
}
