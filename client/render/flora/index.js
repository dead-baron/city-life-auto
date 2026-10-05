// The living vegetation layer: grass, wildflowers, crops, bushes, flower beds, trees and palms,
// all drawn from the procedural art in ./art.js, moved by the universal wind (./wind.js), pushed
// aside and flattened by whoever goes through it, and lit through at golden hour.
//
// Modes (gfx.flora):
//   off     - the new ground art, trees and bushes stand still, no grass tufts (cheapest)
//   static  - grass tufts and crops baked into the ground chunks, still (no per-frame cost)
//   live    - tufts and crops drawn each frame: sway, trodden paths, tyre-flattened tracks,
//             golden-hour glow, legs hidden in tall wheat
// The tiles and props are the server's; this only decides how they look. Placement comes from
// hashes of world position, so it's the same for everyone and the same every visit.
import { T, TILE, CHUNK_PX, MAP_W, MAP_H } from '../../../shared/constants.js';
import { DISTRICTS, WILD_STYLES, terrainAt } from '../../../shared/map.js';
import { PROP_SIZES } from '../../../shared/prefab-data.js';
import { hash2 } from '../../../shared/rng.js';
import { LOW_MEM } from '../../platform.js';
import { wind } from './wind.js';
import { S as AS, GRASS, GRASS_CELL, CROPS, CROP_CELL, BENDS, PLANTS, grassSheet, cropSheet, plantSheet, treeSprite, palmSprite, bushSprite, flowerSprite, paintGroundTile } from './art.js';

export { wind };

const GKINDS = ['lawn', 'lush', 'park', 'meadow', 'forest', 'dry', 'dune'];
const CKINDS = Object.keys(CROPS);
const PKINDS = Object.keys(PLANTS);                 // undergrowth, coded 50 + index in the patch arrays
const PK = Object.fromEntries(PKINDS.map((k, i) => [k, 50 + i]));
// undergrowth per tile, by ground kind: [plant, chance]; drifts follow their own slow noise
const UNDER = {
  forest: [['fern', 0.42], ['shrublet', 0.2], ['flowers', 0.025]],
  meadow: [['flowers', 0.3], ['shrublet', 0.04]],
  park: [['flowers', 0.05], ['shrublet', 0.02]],
  lush: [['flowers', 0.035], ['shrublet', 0.025], ['fern', 0.015]],
  dry: [['dryshrub', 0.09], ['flowers', 0.012]],
  dune: [['dryshrub', 0.03]],
  lawn: [],
};
// how often a 16 px spot of each grass kind has a tuft (before the clumping noise and the density setting)
const DENS = { lawn: 0.14, lush: 0.26, park: 0.3, meadow: 0.6, forest: 0.45, dry: 0.26, dune: 0.22 };
const TALL = { meadow: 1, forest: 1, dune: 1 };     // tall enough to hide your feet
const TEX = 512;                                    // the ground texture repeats every 512 px (hidden under a broad tint)

// vegetation props drawn by this layer, and how
const TREE_PROPS = new Set(['tree_a', 'tree_b']);
const PALM_PROPS = new Set(['palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s']);
const BUSH_PROPS = new Set(['shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c']);
const FLOWER_PROPS = new Set(['flowers_a', 'flowers_big']);
export const FLORA_PROPS = new Set([...TREE_PROPS, ...PALM_PROPS, ...BUSH_PROPS, ...FLOWER_PROPS]);

let inst = null;
export function flora() { return inst; }

export class Flora {
  constructor(map) {
    this.m = map;
    inst = this;
    this.mode = 'static'; this.density = 1; this.windOn = true; this.trampleOn = false; this.sss = false;
    this.biome = new Uint8Array(MAP_W * MAP_H).fill(255);  // per tile: GKINDS index, 254 none (lazily)
    this.cropOf = new Map();                               // field index -> crop kind
    this.sheets = new Map();                               // 'g:lawn' / 'c:wheat' -> sheet
    this.sprites = new Map();                              // 'oak:2' -> tree / bush sprite
    this.chunks = new Map();                               // chunk key -> patches
    this.ground = new Map();                               // biome -> 512 px texture canvas
    this.trample = new Map();                              // 8 px cell -> { p, push, pt, c, cd, ct }
    this.shake = new Map();                                // prop -> { t, a }
    this.leaves = [];                                      // pooled wind-blown leaves
    for (let i = 0; i < 70; i++) this.leaves.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, a: 0, c: 0, life: 0 });
    this.front = [];                                       // tall tufts drawn this frame (for drawing over legs)
    this.excl = null;
    this.t = 0;
    this.drawn = 0;
  }
  configure(g) {
    const mode = g.flora === 'off' ? 'off' : g.flora === 'live' ? 'live' : 'static';
    const changed = mode !== this.mode || g.floraDensity !== this.density || (g.sss && !this.sss);
    this.mode = mode; this.density = g.floraDensity; this.windOn = g.wind; this.trampleOn = g.trample && mode === 'live'; this.sss = g.sss && mode === 'live';
    if (changed) { this.chunks.clear(); this.sheets.clear(); }
    this.variants = LOW_MEM ? 2 : mode === 'live' ? 3 : 2;
    this.budget = mode !== 'live' ? 0 : g.floraDensity >= 1.5 ? 7000 : 4200;
  }

  // ---- what grows where -----------------------------------------------------------------------------
  exclusion() {
    if (this.excl) return this.excl;
    const m = this.m, X = new Uint8Array(MAP_W * MAP_H);
    const mark = (tx, ty, tw, th) => { for (let y = Math.max(0, ty); y < Math.min(MAP_H, ty + th); y++) for (let x = Math.max(0, tx); x < Math.min(MAP_W, tx + tw); x++) X[y * MAP_W + x] = 1; };
    for (const p of m.prefabs || []) if (p.tw) mark(p.tx, p.ty, p.tw, p.th);                      // painted lots have their own gardens
    for (const a of m.handArt || []) mark(Math.floor(a.x / TILE), Math.floor(a.y / TILE), Math.ceil(a.w / TILE), Math.ceil(a.h / TILE));
    for (const a of m.paintings || []) mark(Math.floor(a.x / TILE), Math.floor(a.y / TILE), Math.ceil(a.w / TILE), Math.ceil(a.h / TILE));
    for (const mn of m.mansions || []) if (mn.lot) mark(mn.lot.tx, mn.lot.ty, mn.lot.tw, mn.lot.th);
    for (const s of m.stalls || []) mark(Math.floor(s.x / TILE), Math.floor(s.y / TILE), Math.ceil(s.w / TILE) + 1, Math.ceil(s.h / TILE) + 1);
    return (this.excl = X);
  }
  biomeAt(tx, ty) {
    const i = ty * MAP_W + tx;
    let b = this.biome[i];
    if (b !== 255) return b;
    const m = this.m, t = m.tiles[i];
    const d = DISTRICTS[m.dist[i]];
    if (t === T.SAND) b = m.distSea && m.distSea[i] > 5 * 4 && !this.exclusion()[i] ? 6 : 254;
    else if (t !== T.GRASS || this.exclusion()[i]) b = 254;
    else if (!d) b = 1;
    else if (d.style === 'park') b = 2;
    else if (d.style === 'desert') b = 5;
    else if (WILD_STYLES.has(d.style)) {
      const c = m.terrainCls ? terrainAt(m.terrainCls.cls, m.terrainCls.cw, tx, ty) : 1;
      b = c === 2 ? 4 : c === 3 || c === 4 ? 5 : 3;
    } else if (d.style === 'houses' || d.style === 'luxury' || d.style === 'civic' || d.style === 'beach') b = 0;
    else b = 1;
    this.biome[i] = b;
    return b;
  }
  groundKind(tx, ty) { const b = this.biomeAt(tx, ty); return b < 7 ? GKINDS[b] : null; }
  // the ground art for a tile: grass kinds, bare earth, tilled field, or null (not ours)
  tileKind(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
    const i = ty * MAP_W + tx, t = this.m.tiles[i];
    if (this.exclusion()[i]) return null;
    if (t === T.FIELD) return 'field';
    if (t === T.DIRT) return 'earth';
    if (t === T.GRASS) return this.groundKind(tx, ty);
    return null;
  }
  // the same, at a world point nudged by noise: biome edges wander instead of following tile squares
  kindNear(x, y, fallback) {
    const jx = (smoothNoise(x * 3.1, y * 3.1 + 900) - 0.5) * 44 + (hash2(x >> 2, y >> 2, 71) - 0.5) * 8;
    const jy = (smoothNoise(x * 3.1 + 500, y * 3.1) - 0.5) * 44 + (hash2(x >> 2, y >> 2, 73) - 0.5) * 8;
    const k = this.tileKind(Math.floor((x + jx) / TILE), Math.floor((y + jy) / TILE));
    return k && k !== 'field' ? k : fallback;
  }
  cropAt(x, y) {
    const fs = this.m.fields || [];
    for (let k = 0; k < fs.length; k++) {
      const f = fs[k];
      if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) {
        let c = this.cropOf.get(k);
        if (!c) { const h = hash2(f.x | 0, f.y | 0, 991); c = f.x > 1000 * TILE && f.y < 700 * TILE ? (h < 0.6 ? 'wheat' : h < 0.85 ? 'corn' : 'barley') : CKINDS[Math.floor(h * CKINDS.length)]; this.cropOf.set(k, c); }
        return c;
      }
    }
    return 'wheat';
  }

  // grass touching fresh or sea water (reed beds)
  wet(tx, ty) {
    const m = this.m;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      const t = m.tiles[y * MAP_W + x];
      if (t === T.WATER || t === T.DEEP) return true;
    }
    return false;
  }

  // the tufts and crop rows on a chunk: flat typed arrays [x, y, kind, variant, phase, tall]
  patches(cx, cy) {
    const key = cy * 1000 + cx;
    let P = this.chunks.get(key);
    if (P) return P;
    const m = this.m, N = CHUNK_PX / TILE, xs = [], ys = [], ks = [], vs = [], ph = [], tall = [];
    const dens = this.density;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (tx >= MAP_W || ty >= MAP_H) continue;
      const ti = ty * MAP_W + tx, t = m.tiles[ti];
      if (t === T.FIELD) {
        if (this.exclusion()[ti]) continue;
        const ck = CKINDS.indexOf(this.cropAt(tx * TILE + 16, ty * TILE + 16));
        xs.push(tx * TILE + 16); ys.push(ty * TILE + 28); ks.push(100 + ck); vs.push(Math.floor(hash2(tx, ty, 31) * 9)); ph.push(hash2(tx, ty, 37)); tall.push(1);
        continue;
      }
      if (t !== T.GRASS && t !== T.SAND) continue;
      const b0 = this.biomeAt(tx, ty);
      if (b0 >= 7) continue;
      // clumping: meadows are tall in patches, lawns are mostly mown
      for (let q = 0; q < 4; q++) {
        const sx = tx * TILE + (q & 1) * 16 + 8, sy = ty * TILE + (q >> 1) * 16 + 12;
        const kind = t === T.SAND ? 'dune' : this.kindNear(sx, sy, GKINDS[b0]);
        if (kind === 'earth') continue;
        const b = GKINDS.indexOf(kind);
        const clump = 0.35 + 0.95 * smoothNoise(sx, sy);
        const h = hash2(sx, sy, 17);
        if (h > DENS[kind] * clump * dens) continue;
        xs.push(sx + (hash2(sx, sy, 19) - 0.5) * 10); ys.push(sy + (hash2(sx, sy, 23) - 0.5) * 8);
        ks.push(b); vs.push(Math.floor(hash2(sx, sy, 29) * 9)); ph.push(hash2(sx, sy, 41)); tall.push(TALL[kind] ? 1 : 0);
      }
      // undergrowth: ferns, wildflower drifts, low shrubs - and reeds where the grass meets water
      if (t === T.GRASS) {
        const ux = tx * TILE + 6 + hash2(tx, ty, 201) * 20, uy = ty * TILE + 10 + hash2(tx, ty, 203) * 18;
        const uk = this.kindNear(ux, uy, GKINDS[b0]);
        let plant = null;
        if (this.wet(tx, ty)) { if (hash2(tx, ty, 205) < 0.55 * dens) plant = 'reeds'; }
        else if (UNDER[uk]) {
          const drift = Math.max(0.08, 2.4 * smoothNoise(ux * 1.7 + 3000, uy * 1.7) - 0.3);  // patchy: thick drifts, bare stretches
          let h = hash2(tx, ty, 207);
          for (const [k, c] of UNDER[uk]) { const cc = c * dens * (k === 'flowers' ? drift : 1); if (h < cc) { plant = k; break; } h -= cc; }
        }
        if (plant) {
          xs.push(ux); ys.push(uy); ks.push(PK[plant]); vs.push(Math.floor(hash2(tx, ty, 209) * 12)); ph.push(hash2(tx, ty, 211)); tall.push(plant === 'flowers' ? 0 : 1);
        }
      }
    }
    // back to front, so nearer tufts overlap the ones behind
    const order = xs.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
    P = { n: order.length, x: Float32Array.from(order, (i) => xs[i]), y: Float32Array.from(order, (i) => ys[i]), k: Uint8Array.from(order, (i) => ks[i]), v: Uint8Array.from(order, (i) => vs[i]), ph: Float32Array.from(order, (i) => ph[i]), tall: Uint8Array.from(order, (i) => tall[i]) };
    if (this.chunks.size > 60) this.chunks.delete(this.chunks.keys().next().value);
    this.chunks.set(key, P);
    return P;
  }
  sheet(k) {
    const crop = k >= 100, plant = !crop && k >= 50;
    const name = crop ? CKINDS[k - 100] : plant ? PKINDS[k - 50] : GKINDS[k];
    const key = (crop ? 'c:' : plant ? 'p:' : 'g:') + name;
    let s = this.sheets.get(key);
    if (s) return s;
    const bends = this.mode === 'live' ? null : [0];
    s = crop ? cropSheet(name, this.variants, bends, this.sss) : plant ? plantSheet(name, LOW_MEM ? 2 : 4, bends, this.sss) : grassSheet(name, this.variants, bends, this.sss);
    this.sheets.set(key, s);
    return s;
  }

  // ---- the ground under it ---------------------------------------------------------------------------
  groundTex(kind) {
    let c = this.ground.get(kind);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = TEX;
    const id = new ImageData(TEX, TEX);
    for (let ty = 0; ty < TEX / 32; ty++) for (let tx = 0; tx < TEX / 32; tx++) paintGroundTile(id.data, TEX, tx * 32, ty * 32, tx * 32, ty * 32, kind);
    c.getContext('2d').putImageData(id, 0, 0);
    this.ground.set(kind, c);
    return c;
  }
  // Paint the grass, earth and field tiles of a chunk (called while it's baked, after the old tiles).
  // Where kinds meet, the tile is painted in 4 px blocks, each taking the kind found a noisy step
  // away - so meadow fades into forest floor and grass into bare earth along a ragged edge.
  paintGround(g, cx, cy) {
    const N = CHUNK_PX / TILE;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const tx = cx * N + i, ty = cy * N + j;
      if (tx >= MAP_W || ty >= MAP_H) continue;
      const kind = this.tileKind(tx, ty);
      if (!kind) continue;
      let mixed = false;
      if (kind !== 'field') for (let dy = -1; dy <= 1 && !mixed; dy++) for (let dx = -1; dx <= 1; dx++) { const o = this.tileKind(tx + dx, ty + dy); if (o && o !== kind && o !== 'field') { mixed = true; break; } }
      const X0 = tx * TILE, Y0 = ty * TILE;
      if (!mixed) {
        g.drawImage(this.groundTex(kind), X0 % TEX, Y0 % TEX, TILE, TILE, i * TILE, j * TILE, TILE, TILE);
      } else {
        for (let by = 0; by < TILE; by += 4) for (let bx = 0; bx < TILE; bx += 4) {
          const k = this.kindNear(X0 + bx + 2, Y0 + by + 2, kind);
          g.drawImage(this.groundTex(k), (X0 + bx) % TEX, (Y0 + by) % TEX, 4, 4, i * TILE + bx, j * TILE + by, 4, 4);
        }
      }
      // a broad, slow tint over the repeat: no two screens of grass look alike
      if (kind !== 'field') {
        const n = smoothNoise(X0 * 0.6, Y0 * 0.6) - 0.5;
        g.fillStyle = n > 0 ? `rgba(200,220,120,${(n * 0.14).toFixed(3)})` : `rgba(10,30,20,${(-n * 0.2).toFixed(3)})`;
        g.fillRect(i * TILE, j * TILE, TILE, TILE);
      }
    }
  }
  // static mode: the tufts and crops baked into the chunk, upright (world transform)
  bakeChunk(g, cx, cy) {
    if (this.mode !== 'static') return;
    const P = this.patches(cx, cy);
    for (let i = 0; i < P.n; i++) this.drawPatch(g, P, i, 0, 0);
  }
  drawPatch(g, P, i, bend, sq) {
    const s = this.sheet(P.k[i]);
    const crop = P.k[i] >= 100;
    const v = P.v[i] % s.variants;
    const col = s.cols === 1 ? 0 : Math.max(0, Math.min(s.cols - 1, bend + 5));
    const row = v * 3 + sq;
    const cw = crop ? CROP_CELL.w : GRASS_CELL.w, ch = crop ? CROP_CELL.h : GRASS_CELL.h;
    const img = this.glowLevel > 0 && s.glow ? this.lit(s) : s.cv;
    g.drawImage(img, col * s.cw, row * s.ch, s.cw, s.ch, P.x[i] - cw / 2, P.y[i] - ch + 3, cw, ch);
  }
  // A sheet with the golden-hour light already shining through it, at the current strength (in
  // steps of 0.1, rebuilt when the step changes - a couple of draws per sheet every few seconds of
  // sunset). One draw per tuft either way, instead of a second additive pass over every tuft.
  lit(s) {
    const L = this.glowLevel;
    if (s.litLevel === L) return s.lit;
    const c = s.lit || (s.lit = document.createElement('canvas'));
    if (c.width !== s.cv.width || c.height !== s.cv.height) { c.width = s.cv.width; c.height = s.cv.height; }
    const x = c.getContext('2d');
    x.globalCompositeOperation = 'copy'; x.globalAlpha = 1; x.drawImage(s.cv, 0, 0);
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = L; x.drawImage(s.glow, 0, 0);
    x.globalCompositeOperation = 'destination-in'; x.globalAlpha = 1; x.drawImage(s.cv, 0, 0);   // the light stays on the plants
    x.globalCompositeOperation = 'source-over';
    s.litLevel = L;
    return c;
  }

  // ---- interaction --------------------------------------------------------------------------------
  // people push grass aside as they pass and leave it bent for a few seconds; wheels flatten it
  // (it lies flat for a minute, then slowly stands back up)
  stamp(x, y, r, push, crush, t) {
    const c0x = Math.floor((x - r) / 8), c1x = Math.floor((x + r) / 8), c0y = Math.floor((y - r) / 8), c1y = Math.floor((y + r) / 8);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const k = cy * 16384 + cx;
      let e = this.trample.get(k);
      if (!e) { e = { pt: -99, push: 0, ct: -99, cd: 0 }; this.trample.set(k, e); }
      if (crush) { e.ct = t; e.cd = push; }
      else { e.pt = t; e.push = (cx * 8 + 4) < x ? -1 : 1; }
    }
  }
  update(dt, t, peds, vehs, fx, sky) {
    this.t = t;
    this.sunLeft = !sky || sky.sunDir.x > 0;          // shadows fall right: the sun is on the left
    for (const v of vehs) { if (v._fsx !== undefined) v._sp = Math.hypot(v.rx - v._fsx, v.ry - v._fsy) / Math.max(dt, 1e-3); v._fsx = v.rx; v._fsy = v.ry; }
    if (this.mode === 'off') return;
    if (this.trampleOn) {
      for (const p of peds) {
        if (p.swim || (p.rz || 0) > 0.05 || p.d === undefined) continue;
        if (p._fx === undefined) { p._fx = p.rx; p._fy = p.ry; }
        const moved = Math.hypot(p.rx - p._fx, p.ry - p._fy);
        p._fx = p.rx; p._fy = p.ry;
        if (moved < 0.2 && t - (p._fstill || 0) < 3) continue;
        if (moved >= 0.2) p._fstill = t;
        this.stamp(p.rx, p.ry, 9, 0, false, t);
      }
      for (const v of vehs) {
        if ((v.rz || 0) > 0.05) continue;
        if (v._fx !== undefined && Math.hypot(v.rx - v._fx, v.ry - v._fy) < 0.5) continue;
        v._fx = v.rx; v._fy = v.ry;
        const c = Math.cos(v.ra), s = Math.sin(v.ra), L = v._L || 44, W = v._W || 22;
        for (let a = -L / 2; a <= L / 2; a += 8) for (let b = -W / 2; b <= W / 2; b += 8) this.stamp(v.rx + c * a - s * b, v.ry + s * a + c * b, 4, c >= 0 ? 1 : -1, true, t);
      }
      if (this.trample.size > 24000) { // forget the oldest marks
        for (const [k, e] of this.trample) if (t - Math.max(e.pt, e.ct) > 90) this.trample.delete(k);
        if (this.trample.size > 24000) this.trample.clear();
      }
    }
    // trees shake when a car clips them (and drop a few leaves)
    for (const v of vehs) {
      const sp = v._sp || 0;
      if (sp < 60) continue;
      for (const p of this.nearTrees || []) {
        if (Math.hypot(p.x - v.rx, p.y + 20 - v.ry) < 40) {
          const e = this.shake.get(p);
          if (!e || t - e.t > 0.6) { this.shake.set(p, { t, a: Math.min(1, sp / 300) }); if (fx) fx.flutter(p.x, p.y - 10, 8, ['#3f7a34', '#5f9a3e', '#8ebc54', '#2a5a2e'], Math.random, 90, 120); }
        }
      }
    }
    if (this.shake.size > 50) for (const [p, e] of this.shake) if (t - e.t > 3) this.shake.delete(p);
  }
  // how bent / squashed a tuft at (x, y) is right now: [extra lean, squash 0..2]
  pressed(x, y, t) {
    const e = this.trample.get(Math.floor(y / 8) * 16384 + Math.floor(x / 8));
    if (!e) return null;
    let lean = 0, sq = 0;
    const pa = t - e.pt;
    if (pa < 7) { const k = pa < 0.6 ? 1 : 1 - (pa - 0.6) / 6.4; lean = e.push * Math.round(4 * k); if (pa < 2.5) sq = 1; }
    const ca = t - e.ct;
    if (ca < 75) { sq = ca < 45 ? 2 : 1; lean = e.cd * (ca < 45 ? 5 : 3); }
    return lean || sq ? [lean, sq] : null;
  }

  // ---- drawing, every frame (live mode) ---------------------------------------------------------------
  // view: world rect; sky: atmos; g in world transform. Draws tufts, crops, bushes and flower beds.
  drawLive(g, view, ground, sky) {
    this.front.length = 0;
    this.drawn = 0;
    if (this.mode !== 'live') { this.glowLevel = 0; return; }
    const t = this.t, wOn = this.windOn;
    const cx0 = Math.floor((view.x0 - 32) / CHUNK_PX), cx1 = Math.floor((view.x1 + 32) / CHUNK_PX);
    const cy0 = Math.floor((view.y0 - 16) / CHUNK_PX), cy1 = Math.floor((view.y1 + 48) / CHUNK_PX);
    const x0 = view.x0 - 24, x1 = view.x1 + 24, y0 = view.y0 - 4, y1 = view.y1 + 40;
    let budget = this.budget;
    const glowK = this.sss ? sssStrength(sky) : 0;
    this.glowLevel = glowK > 0.03 ? Math.max(0.1, Math.round(glowK * 10) / 10) : 0;
    const late = this.late || (this.late = []);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0) continue;
      const P = this.patches(cx, cy);
      for (let i = 0; i < P.n; i++) {
        const x = P.x[i], y = P.y[i];
        if (x < x0 || x > x1 || y < y0 || y > y1) continue;
        if (budget-- <= 0) break;
        let bend = wOn ? Math.round(wind.sway(x, y, t, P.ph[i]) * (P.k[i] >= 100 ? 4.4 : 5)) : 0;
        let sq = 0;
        if (this.trampleOn) { const pr = this.pressed(x, y, t); if (pr) { bend = pr[1] === 2 ? pr[0] : Math.max(-5, Math.min(5, bend + pr[0])); sq = pr[1]; } }
        bend = Math.max(-5, Math.min(5, bend));
        // undergrowth goes in a second pass: drawing from one sheet at a time keeps the canvas
        // batching its draws (switching source images every tuft costs several times more)
        if (P.k[i] >= 50 && P.k[i] < 100) late.push(P, i, bend, sq);
        else this.drawPatch(g, P, i, bend, sq);
        this.drawn++;
        if (P.tall[i] && sq === 0) this.front.push(P, i, bend);
      }
    }
    for (const want of PKINDS) {
      const k = PK[want];
      for (let j = 0; j < late.length; j += 4) if (late[j].k[late[j + 1]] === k) this.drawPatch(g, late[j], late[j + 1], late[j + 2], late[j + 3]);
    }
    late.length = 0;
    // bushes and flower beds (props) sway too, and part round you as you walk through
    this.drawBushes(g, view, ground, glowK);
  }
  drawBushes(g, view, ground, glowK) {
    const [cx0, cx1, cy0, cy1] = [Math.floor(view.x0 / CHUNK_PX) - 1, Math.floor(view.x1 / CHUNK_PX) + 1, Math.floor(view.y0 / CHUNK_PX) - 1, Math.floor(view.y1 / CHUNK_PX) + 1];
    const t = this.t;
    for (let cy = Math.max(0, cy0); cy <= cy1; cy++) for (let cx = Math.max(0, cx0); cx <= cx1; cx++) {
      for (const p of ground.lowProps.get(cy * 1000 + cx) || []) {
        if (p.broken || !(BUSH_PROPS.has(p.t) || FLOWER_PROPS.has(p.t))) continue;
        if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 50) continue;
        const sp = this.sprite(p);
        let lean = this.windOn ? wind.sway(p.x, p.y, t, (p.x % 7) / 7) * 1.4 : 0;
        if (this.trampleOn) { const pr = this.pressed(p.x, p.y + sp.h / 2 - 4, t); if (pr) lean += pr[0] * 0.9; }
        this.drawSwaying(g, sp, p.x, p.y, lean * 0.05, glowK, true);
      }
    }
  }
  // the tall tufts in front of a person's feet, drawn again over them (wading through wheat)
  drawFront(g, peds) {
    if (!this.front.length || !peds.length) return;
    for (const p of peds) {
      if (p.swim || (p.rz || 0) > 0.05) continue;
      const fy = p.ry + 6;
      for (let k = 0; k < this.front.length; k += 3) {
        const P = this.front[k], i = this.front[k + 1];
        const x = P.x[i], y = P.y[i];
        if (y <= fy - 1 || y > fy + 18 || Math.abs(x - p.rx) > 20) continue;
        this.drawPatch(g, P, i, this.front[k + 2], 0);
      }
    }
  }

  // ---- trees, palms, bushes, flower beds --------------------------------------------------------------
  kindOf(p) {
    const t = p.t, h = hash2(p.x | 0, p.y | 0, 51);
    if (t === 'tree_a' || t === 'tree_b') {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      const b = this.biomeAt(Math.max(0, Math.min(MAP_W - 1, tx)), Math.max(0, Math.min(MAP_H - 1, ty)));
      if (b === 4) return t === 'tree_b' ? 'pine' : h < 0.5 ? 'oak' : 'pine';      // forest
      if (b === 5) return 'olive';                                               // dry country
      if (t === 'tree_a') return h < 0.7 ? 'oak' : 'maple';
      return h < 0.4 ? 'maple' : h < 0.75 ? 'birch' : h < 0.88 ? 'blossom' : 'oak';
    }
    if (PALM_PROPS.has(t)) return t === 'palm_s' ? 'palm_s' : 'palm';
    if (t === 'shrub_a') return h < 0.3 ? 'flowering' : 'round';
    if (t === 'shrub_b') return h < 0.5 ? 'dark' : 'olive';
    if (t === 'bush_c') return h < 0.25 ? 'flowering' : 'round';
    if (t === 'bush_a' || t === 'bush_b') return h < 0.5 ? 'yellow' : 'round';
    if (t === 'flowers_big') return 'flowersbig';
    return 'flowers';
  }
  sprite(p) {
    const kind = this.kindOf(p);
    const nv = LOW_MEM ? 2 : kind === 'blossom' || kind.startsWith('flowers') ? 3 : 4;
    const v = Math.floor(hash2(p.x | 0, p.y | 0, 53) * nv);
    const key = kind + ':' + v + ':' + p.t;
    let s = this.sprites.get(key);
    if (s) return s;
    const sz = PROP_SIZES[p.t] || [60, 70];
    if (kind === 'palm' || kind === 'palm_s') s = palmSprite(v, sz[0], sz[1], kind === 'palm_s');
    else if (kind === 'flowers' || kind === 'flowersbig') s = flowerSprite(v, sz[0], sz[1], kind === 'flowersbig');
    else if (BUSH_PROPS.has(p.t)) s = bushSprite(kind, v, sz[0], sz[1]);
    else s = treeSprite(kind, v, sz[0], sz[1]);                // olive: a grey-green dome (dry country)
    s.id = this.sprites.size;
    this.sprites.set(key, s);
    return s;
  }
  // Draw a sprite centred on (x, y) like any prop, its crown leaning by `lean` (shear), glow over it.
  drawSwaying(g, s, x, y, lean, glowK, isBush = false) {
    const left = x - s.w / 2, top = y - s.h / 2;
    if (s.trunk) g.drawImage(s.trunk, left, top, s.w, s.h);
    const py = top + s.pivotY;
    if (Math.abs(lean) < 0.004) g.drawImage(s.crown, left, top, s.w, s.h);
    else { g.save(); g.transform(1, 0, -lean, 1, lean * py, 0); g.drawImage(s.crown, left, top, s.w, s.h); g.restore(); }
    if (glowK > 0.03) {
      const gl = this.sunLeft ? s.glowL : s.glowR;
      if (gl) {
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, glowK * (isBush ? 0.7 : 0.9));
        if (Math.abs(lean) >= 0.004) g.transform(1, 0, -lean, 1, lean * py, 0);
        g.drawImage(gl, left, top, s.w, s.h);
        g.restore();
      }
    }
  }
  // a tree or palm in the sorted overhead pass (g: world transform)
  beginFrame() { this.nearTrees = this.treesNow || []; this.treesNow = []; }
  drawTree(g, p, sky = this.sky) {
    const s = this.sprite(p);
    (this.treesNow ||= []).push(p);
    let lean = 0;
    if (this.mode !== 'off' && this.windOn) lean = wind.sway(p.x, p.y, this.t, (p.y % 11) / 11) * (s.palm ? 0.05 : 0.03);
    const sh = this.shake.get(p);
    if (sh) { const a = this.t - sh.t; if (a < 1.4) lean += Math.sin(a * 28) * 0.06 * sh.a * (1 - a / 1.4); }
    this.drawSwaying(g, s, p.x, p.y, lean, this.sss ? sssStrength(sky) : 0);
  }
  // The sprite atlas's art for these props (knocked-down trees, pieces that fly when one is smashed)
  // becomes the procedural art too.
  registerAtlas(atlas) {
    for (const t of FLORA_PROPS) {
      const s = this.sprite({ t, x: 0, y: 0 });
      atlas.imgs.push(s.full);
      atlas.frames['prop_' + t] = { a: atlas.imgs.length - 1, x: 0, y: 0, w: s.full.width, h: s.full.height };
    }
  }
  // a bush or flower bed baked into the ground (static and off modes)
  drawStatic(g, p) { const s = this.sprite(p); g.drawImage(s.full, p.x - s.w / 2, p.y - s.h / 2, s.w, s.h); }
  // what it casts a shadow with (render/shadows.js)
  castFor(p) {
    const s = this.sprite(p);
    return { img: s.full, fr: { a: 'fl' + s.id, x: 0, y: 0, w: s.full.width, h: s.full.height }, x: p.x, base: p.y - s.h / 2 + s.foot, w: s.w, h: s.foot };
  }

  // ---- the wind you can see ---------------------------------------------------------------------------
  // In a breeze or worse, leaves and petals blow across the screen (pooled; world transform).
  leavesFrame(g, view, dt, rough) {
    const s = wind.strength;
    if (this.mode === 'off' || s < 0.3) { if (!this.leaves.some((l) => l.on)) return; }
    const rate = s < 0.3 ? 0 : (s - 0.3) * 40 * (rough ? 0.6 : 1);
    for (let k = 0; k < rate * dt; k++) {
      const l = this.leaves.find((q) => !q.on);
      if (!l) break;
      l.on = true; l.life = 4 + Math.random() * 3;
      const fromLeft = wind.dx > 0;
      l.x = fromLeft ? view.x0 - 20 : view.x1 + 20; l.y = view.y0 + Math.random() * (view.y1 - view.y0);
      l.z = 10 + Math.random() * 30; l.a = Math.random() * 6.28; l.c = Math.floor(Math.random() * 4);
      l.vx = wind.dx * (140 + s * 220) * (0.7 + Math.random() * 0.6); l.vy = wind.dy * 60 + (Math.random() - 0.5) * 40;
    }
    const COLS = ['#3f7a34', '#8ebc54', '#c8a038', '#e88aa8'];
    for (const l of this.leaves) {
      if (!l.on) continue;
      l.life -= dt;
      if (l.life <= 0 || l.x < view.x0 - 60 || l.x > view.x1 + 60) { l.on = false; continue; }
      l.x += l.vx * dt; l.y += l.vy * dt + Math.sin(this.t * 3 + l.a) * 20 * dt; l.a += dt * 6;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(l.x + 3, l.y + 4, 2, 1);
      g.fillStyle = COLS[l.c]; const w = Math.abs(Math.cos(l.a)) * 2 + 1;
      g.fillRect(l.x - w / 2, l.y - l.z * 0.3, w, 2);
    }
  }
}

// golden hour (and a little at sunrise): how strongly light shines through leaves and grass
export function sssStrength(sky) {
  if (!sky || sky.sun <= 0.05) return 0;
  const low = Math.max(0, Math.min(1, (sky.shadowLen - 0.9) / 1.4));
  return Math.min(0.85, sky.sun * (0.12 + 0.75 * Math.max(low, sky.warm || 0)) * (1 - (sky.rain || 0)));
}

// smooth value noise in world px (scale ~180 px), 0..1
function smoothNoise(x, y) {
  const sc = 180, fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(ix, iy, 61), b = hash2(ix + 1, iy, 61), c = hash2(ix, iy + 1, 61), d = hash2(ix + 1, iy + 1, 61);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
void AS; void GRASS; void BENDS;
