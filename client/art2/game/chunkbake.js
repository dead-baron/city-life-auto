// Art v2 live renderer: one baked chunk of the static world (docs/art-v2/GAME-RENDERER.md).
//
//   bakeChunk(M, cx, cy, opt) -> { g, under, blds, lights, gh, live, ms, n }
//   bakeSteps(M, cx, cy, opt) -> the same bake as a generator that yields every few ms (worker.js pauses at
//                                each yield, so other jobs get answered in between)
//     under   RGBA8: the chunk before its buildings (rgb) and, in alpha, the local number (1..63) of the building
//             whose surface is on top at that pixel (0: none); blds: [building index, x0, y0, x1, y1, base y,
//             fx0, fy0, fx1, fy1] per local number (its screen rectangle in world px, then its footprint), for
//             fading whole buildings (only where they cover ground outside their footprint)
//     g       the chunk G-buffer, CHUNK x CHUNK, ax = ay = 0: world X [cx*768, cx*768+768) and screen
//             Y (= world Y - Z) [cy*768, cy*768+768)
//     lights  the static light sources anchored in the chunk (statics.staticLights)
//     live    what the host animates on top, from the items anchored in the chunk: heads (signal heads
//             with their lens positions, see signalLenses), xing (level crossing posts), flags ([kind, x, y,
//             z0] of a bare flagpole: its flag flies live, liveart.js)
//     gh      ground heights under world positions (see below), for standing moving things on kerbs and
//             bridge decks
//   The ground comes from groundbake.bakeGround (flat colours by tile type while that module is missing,
//   or opt.groundCol: the v1 ground chunk's pixels). Every static sprite whose screen rectangle reaches
//   the chunk (statics.staticItems) is made once (statics.makeStatic, cached by key) and composited with
//   the depth rule: screen y = Y - Z, so at one screen pixel the nearer surface is the taller one; a
//   pixel lands where its height (sprite z + item z0) is at least what is already there (later items
//   win ties). Flat ground is a little forgiving (GROUND_TOL) so things standing on a 3 px kerb keep
//   their feet.
//   Placement: an item's anchor goes to world (x, y) raised by z0, so sprite pixel (i, j) lands on
//   screen (x - ax + i, y - z0 - ay + j) with height z[i, j] + z0.
//
//   gh: Uint8Array GH_W x GH_H, cells of GH_CELL world px over world X [ox, ox + 768) and world Y
//   [oy, oy + 768 + GH_EXTRA): the top of the flat ground (not ground cover) at each cell. Ground drawn
//   high (a bridge deck) shows on the screen rows of the chunk to the north of where it stands, so a
//   chunk's grid runs GH_EXTRA px past its south edge; groundZ() reads the chunk and its northern
//   neighbour.
//
// Providers are optional modules loaded at run time (loadProviders): a missing or broken one is
// reported, not fatal. Pure and worker-safe (no DOM, no WebGL).
import { GBuf, hash, F_GROUND, F_WATER, F_WET, F_LEAF } from '../gbuf.js';
import { T, MAP_W, MAP_H, TILE } from '../../../shared/constants.js';

export const CHUNK = 768;
export const DECK_Z = 88;           // height of the elevated highway deck (lz = 1); shared/levels.js DECK_LIFT
export const GROUND_TOL = 4;        // flat ground this much higher than a sprite pixel still lets it through
export const GH_CELL = 4, GH_EXTRA = 64;
export const GH_W = CHUNK / GH_CELL, GH_H = (CHUNK + GH_EXTRA) / GH_CELL;

// ---- providers ---------------------------------------------------------------------------------------
export const providers = { ground: null, statics: null, errors: {} };
export async function loadProviders() {
  const load = async (name, file, must) => {
    try {
      const m = await import(file);
      if (must.every((k) => typeof m[k] === 'function')) return m;
      providers.errors[name] = `missing ${must.filter((k) => typeof m[k] !== 'function').join(', ')}`;
    } catch (e) { providers.errors[name] = String((e && e.message) || e); }
    return null;
  };
  const [gm, sm] = await Promise.all([load('ground', './groundbake.js', ['bakeGround']), load('statics', './statics.js', ['staticItems', 'makeStatic'])]);
  providers.ground = gm; providers.statics = sm;
  return { ground: !!gm, statics: !!sm, errors: providers.errors };
}

// ---- a size-capped LRU of generated sprites (bytes, not entries) ----------------------------------------
export const gbufBytes = (g) => (g && g.w ? g.w * g.h * 15 : 0);
export class SpriteCache {
  constructor(maxBytes) { this.max = maxBytes; this.bytes = 0; this.m = new Map(); this.hits = 0; this.misses = 0; }
  get(key, make) {
    let v = this.m.get(key);
    if (v) { this.m.delete(key); this.m.set(key, v); this.hits++; return v; }
    this.misses++;
    v = make();
    if (!v) return v;
    this.m.set(key, v); this.bytes += gbufBytes(v);
    while (this.bytes > this.max && this.m.size > 1) { const k = this.m.keys().next().value; this.bytes -= gbufBytes(this.m.get(k)); this.m.delete(k); }
    return v;
  }
  clear() { this.m.clear(); this.bytes = 0; }
}

// ---- fallback ground: flat colours by tile type (used while groundbake.js is missing) ----------------------
const TILE_COL = {
  [T.WALL]: [62, 62, 70], [T.GRASS]: [86, 124, 62], [T.SIDEWALK]: [166, 162, 154], [T.ROAD]: [72, 74, 80], [T.PLAZA]: [176, 158, 138],
  [T.BUILDING]: [104, 98, 96], [T.WATER]: [50, 96, 138], [T.DEEP]: [34, 70, 110], [T.SAND]: [212, 194, 148], [T.DOCK]: [126, 94, 64],
  [T.DIRT]: [138, 110, 78], [T.FIELD]: [148, 138, 72], [T.BRIDGE]: [118, 116, 110], [T.LOT]: [94, 94, 98], [T.FLOOR]: [188, 178, 158], [T.COUNTER]: [138, 100, 70],
};
export function flatGround(M, cx, cy, opt = {}) {
  const G = new GBuf(CHUNK, CHUNK); G.ax = 0; G.ay = 0;
  const ox = cx * CHUNK, oy = cy * CHUNK, tiles = M.tiles, src = opt.groundCol;
  G.nrm.fill(255);
  for (let i = 0; i < CHUNK * CHUNK; i++) { G.nrm[i * 4] = 128; G.nrm[i * 4 + 1] = 128; }
  for (let y = 0; y < CHUNK; y++) {
    const ty = Math.min(MAP_H - 1, ((oy + y) / TILE) | 0);
    for (let x = 0; x < CHUNK; x++) {
      const tx = Math.min(MAP_W - 1, ((ox + x) / TILE) | 0);
      const t = tiles ? tiles[ty * MAP_W + tx] : T.GRASS;
      const i = y * CHUNK + x, j = i * 4, water = t === T.WATER || t === T.DEEP;
      if (src) { G.col[j] = src[j]; G.col[j + 1] = src[j + 1]; G.col[j + 2] = src[j + 2]; }
      else {
        const c = TILE_COL[t] || TILE_COL[T.GRASS], n = (hash((ox + x) >> 2, (oy + y) >> 2, 7) - 0.5) * 12;
        G.col[j] = c[0] + n; G.col[j + 1] = c[1] + n; G.col[j + 2] = c[2] + n;
      }
      G.col[j + 3] = 255;
      G.flag[i] = F_GROUND | (water ? F_WATER : F_WET);
    }
  }
  return G;
}

// ---- compositing ---------------------------------------------------------------------------------------------
// Sprite s with its top-left at chunk pixel (sx, sy), heights raised by z0, depth-tested into G.
export function compositeDepth(G, s, sx, sy, z0 = 0, bid = null, k = 0) {
  if (s.ap2) return compositeDepth2(G, s, sx, sy, z0, bid, k);
  const x0 = Math.max(0, -sx), y0 = Math.max(0, -sy), x1 = Math.min(s.w, G.w - sx), y1 = Math.min(s.h, G.h - sy);
  if (x1 <= x0 || y1 <= y0) return 0;
  const sc = s.col, sn = s.nrm, se = s.emi, sz = s.z, sf = s.flag, dc = G.col, dn = G.nrm, de = G.emi, dz = G.z, df = G.flag;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    let si = y * s.w + x0, di = (y + sy) * G.w + x0 + sx;
    for (let x = x0; x < x1; x++, si++, di++) {
      const sj = si * 4, a = sc[sj + 3];
      if (!a) continue;
      const hz = sz[si] + z0;
      const top = dz[di], ground = df[di] & F_GROUND;
      if (hz < (ground ? top - GROUND_TOL : top)) continue;   // something nearer (taller) is already there
      const dj = di * 4;
      if (a < 255) { // soft edge: blend the colour, keep the rest
        const k = a / 255;
        dc[dj] += (sc[sj] - dc[dj]) * k; dc[dj + 1] += (sc[sj + 1] - dc[dj + 1]) * k; dc[dj + 2] += (sc[sj + 2] - dc[dj + 2]) * k;
        continue;
      }
      dc[dj] = sc[sj]; dc[dj + 1] = sc[sj + 1]; dc[dj + 2] = sc[sj + 2]; dc[dj + 3] = 255;
      dn[dj] = sn[sj]; dn[dj + 1] = sn[sj + 1]; dn[dj + 2] = sn[sj + 2]; dn[dj + 3] = sn[sj + 3];
      de[dj] = se[sj]; de[dj + 1] = se[sj + 1]; de[dj + 2] = se[sj + 2]; de[dj + 3] = se[sj + 3];
      dz[di] = Math.min(65535, Math.max(hz, 0)); df[di] = sf[si];
      if (bid) bid[di] = k;
      n++;
    }
  }
  return n;
}

// The same for a sprite made at the art pixel (s.ap2 = 2: big terrain made at half size): each of its pixels covers
// 2 x 2 of the chunk's, its heights doubled.
function compositeDepth2(G, s, sx, sy, z0 = 0, bid = null, k = 0) {
  const S = 2, sc = s.col, sn = s.nrm, se = s.emi, sz = s.z, sf = s.flag, dc = G.col, dn = G.nrm, de = G.emi, dz = G.z, df = G.flag;
  const X0 = Math.max(0, Math.floor(-sx / S)), Y0 = Math.max(0, Math.floor(-sy / S)), X1 = Math.min(s.w, Math.ceil((G.w - sx) / S)), Y1 = Math.min(s.h, Math.ceil((G.h - sy) / S));
  let n = 0;
  for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) {
    const si = Y * s.w + X, sj = si * 4, a = sc[sj + 3];
    if (!a) continue;
    const hz = sz[si] * S + z0;
    for (let v = 0; v < S; v++) {
      const y = sy + Y * S + v; if (y < 0 || y >= G.h) continue;
      for (let u = 0; u < S; u++) {
        const x = sx + X * S + u; if (x < 0 || x >= G.w) continue;
        const di = y * G.w + x, top = dz[di], ground = df[di] & F_GROUND;
        if (hz < (ground ? top - GROUND_TOL : top)) continue;
        const dj = di * 4;
        if (a < 255) { const kk = a / 255; dc[dj] += (sc[sj] - dc[dj]) * kk; dc[dj + 1] += (sc[sj + 1] - dc[dj + 1]) * kk; dc[dj + 2] += (sc[sj + 2] - dc[dj + 2]) * kk; continue; }
        dc[dj] = sc[sj]; dc[dj + 1] = sc[sj + 1]; dc[dj + 2] = sc[sj + 2]; dc[dj + 3] = 255;
        dn[dj] = sn[sj]; dn[dj + 1] = sn[sj + 1]; dn[dj + 2] = sn[sj + 2]; dn[dj + 3] = sn[sj + 3];
        de[dj] = se[sj]; de[dj + 1] = se[sj + 1]; de[dj + 2] = se[sj + 2]; de[dj + 3] = se[sj + 3];
        dz[di] = Math.min(65535, Math.max(hz, 0)); df[di] = sf[si];
        if (bid) bid[di] = k;
        n++;
      }
    }
  }
  return n;
}

// The top of the flat ground under world cells (see the header), from a ground-only G-buffer.
export function groundHeights(G, ox, oy) {
  const gh = new Uint8Array(GH_W * GH_H);
  const { w, h, z, flag, col } = G;
  for (let sy = 0; sy < h; sy++) for (let x = 0; x < w; x++) {
    const i = sy * w + x;
    const zz = z[i];
    if (!zz || !col[i * 4 + 3] || !(flag[i] & F_GROUND) || (flag[i] & F_LEAF)) continue;
    const wy = sy + zz; // the world row this surface pixel stands on (screen y = Y - Z)
    if (wy >= GH_H * GH_CELL) continue;
    const k = ((wy / GH_CELL) | 0) * GH_W + ((x / GH_CELL) | 0);
    if (zz > gh[k]) gh[k] = zz > 255 ? 255 : zz;
  }
  void ox; void oy;
  return gh;
}

// a bake worker's working copies (opt.scratch): used up before its next bake, so kept rather than made afresh
const SCR = {};
function scratchCopy(k, src) { let a = SCR[k]; if (!a || a.length !== src.length) a = SCR[k] = new src.constructor(src.length); a.set(src); return a; }
function scratchZero(k, n) { let a = SCR[k]; if (!a || a.length !== n) a = SCR[k] = new Uint8Array(n); else a.fill(0); return a; }

// ---- the bake ---------------------------------------------------------------------------------------------
// opt: { quality 0..3, seed, cutaway (building index), lowMem, groundCol (v1 ground pixels, RGBA), artPx (2: the
// statics land on the art grid - the engine draws the chunk at 1 art pixel = 2 world px), scratch (a bake worker:
// the full-size G-buffer, its under layer and building numbers are this worker's working copies, overwritten by the
// next bake - take what you need from them first) }
// cache: SpriteCache for makeStatic results (one per worker); P: providers (default: the loaded ones)
// (and what fades like one: the giant redwoods - statics.js marks them fade, with their own fade id in b)
const isBuilding = (it) => (it.fade || (it.recipe && it.recipe.t === 'b' && !it.recipe.frame) ? 1 : 0);
export function bakeChunk(M, cx, cy, opt = {}, cache = null, P = providers) {
  const it = bakeSteps(M, cx, cy, opt, cache, P);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
// The bake as a generator: it yields between the ground's phases and every ~10 ms while placing the statics,
// and returns what bakeChunk returns. A worker steps through it with a pause at each yield, so the sprites
// that things on screen are waiting for don't queue behind a whole bake (worker.js).
const SLICE_MS = 10;
export function* bakeSteps(M, cx, cy, opt = {}, cache = null, P = providers) {
  const t0 = now();
  const ox = cx * CHUNK, oy = cy * CHUNK, ag = opt.artPx === 2 ? 2 : 1;
  let G = null, groundErr = null;
  if (P.ground && !opt.groundCol) {
    try {
      if (P.ground.groundSteps) {
        const it = P.ground.groundSteps(M, cx, cy, opt);
        let r = it.next();
        while (!r.done) { yield 'ground'; r = it.next(); }
        G = r.value;
      } else G = P.ground.bakeGround(M, cx, cy, opt);
    } catch (e) { groundErr = String((e && e.stack) || e); G = null; }
    if (G && (G.w !== CHUNK || G.h !== CHUNK)) { groundErr = `bakeGround gave ${G.w}x${G.h}`; G = null; }
  }
  if (!G) G = flatGround(M, cx, cy, opt);
  G.ax = 0; G.ay = 0;
  const gh = groundHeights(G, ox, oy);
  const t1 = now();
  let items = [], lights = [], n = 0, made = 0, staticErr = null, under = null, bid = null;
  const local = new Map(), blds = [];      // building index -> local number; [b, x0, y0, x1, y1, base] per number
  const live = { heads: [], xing: [], flags: [] };
  if (P.statics) {
    try { items = P.statics.staticItems(M, cx, cy, opt) || []; } catch (e) { staticErr = String((e && e.stack) || e); items = []; }
    // painter's order under the depth test: north to south, then west to east (ties go to the later one).
    // Buildings go last: the albedo just before them is the chunk's "under" layer, which the engine shows
    // through the cut-away hole round the player (the street behind a building).
    items.sort((a, b) => (isBuilding(a) - isBuilding(b)) || a.y - b.y || a.x - b.x);
    let snap = opt.under !== false, ts = now();
    yield 'items';
    for (const it of items) {
      if (now() - ts > SLICE_MS) { yield 'statics'; ts = now(); }
      if (snap && isBuilding(it)) { under = opt.scratch ? scratchCopy('under', G.col) : G.col.slice(); snap = false; bid = opt.scratch ? scratchZero('bid', CHUNK * CHUNK) : new Uint8Array(CHUNK * CHUNK); }
      // each building gets a local number (1..63) in this chunk: the engine fades a whole building by it
      let k = 0;
      if (bid && isBuilding(it) && it.b !== undefined) {
        k = local.get(it.b) || 0;
        if (!k && blds.length < 63) { k = blds.length + 1; local.set(it.b, k); blds.push([it.b, Infinity, Infinity, -Infinity, -Infinity, -Infinity, Infinity, Infinity, -Infinity, -Infinity]); }
        if (k) {
          const r = blds[k - 1], e = it.fbox || it.ext || [0, 0, 0, 0];   // (fbox: what fades it, when narrower than its picture)
          r[1] = Math.min(r[1], it.x - e[0]); r[2] = Math.min(r[2], it.y - (it.z0 || 0) - e[1]); r[3] = Math.max(r[3], it.x + e[2]); r[4] = Math.max(r[4], it.y + e[3]); r[5] = Math.max(r[5], it.y);
          if (it.fp) { r[6] = Math.min(r[6], it.fp[0]); r[7] = Math.min(r[7], it.fp[1]); r[8] = Math.max(r[8], it.fp[2]); r[9] = Math.max(r[9], it.fp[3]); }
        }
      }
      let s;
      try {
        s = cache ? cache.get(it.key, () => { made++; return P.statics.makeStatic(it.recipe); }) : (made++, P.statics.makeStatic(it.recipe));
      } catch (e) { staticErr = staticErr || `makeStatic(${it.key}): ${(e && e.message) || e}`; continue; }
      if (!s || !s.w) continue;
      const z0 = it.z0 || 0;
      // (on the art grid: whole art pixels of the world, so what a sprite paints in pairs of px stays whole)
      const sx = Math.round((it.x - (s.ax || 0)) / ag) * ag - ox, sy = Math.round((it.y - z0 - (s.ay || 0)) / ag) * ag - oy;
      n += compositeDepth(G, s, sx, sy, z0, k ? bid : null, k) ? 1 : 0;
    }
    for (const it of items) { // (once per item: the chunk its anchor is in)
      if (it.x < ox || it.x >= ox + CHUNK || it.y < oy || it.y >= oy + CHUNK) continue;
      if (it.heads) for (const h of it.heads) live.heads.push(signalLenses(it, h));
      if (it.xing) live.xing.push(it.xing);
      if (it.flag) live.flags.push(it.flag);
    }
    if (typeof P.statics.staticLights === 'function') {
      try { lights = P.statics.staticLights(M, cx, cy, opt) || []; } catch (e) { staticErr = staticErr || String((e && e.message) || e); lights = []; }
    }
  }
  const t2 = now();
  if (!under && opt.under !== false) under = opt.scratch ? scratchCopy('under', G.col) : G.col.slice();   // no buildings here: the whole chunk is "under"
  // the under layer's alpha carries the local building number of the surface on top (0: no building)
  if (under) for (let i = 0, j = 3; i < CHUNK * CHUNK; i++, j += 4) under[j] = bid ? bid[i] : 0;
  return { g: G, under, blds, lights, gh, live, n, items: items.length, made, ms: { ground: t1 - t0, statics: t2 - t1 }, errors: groundErr || staticErr ? { ground: groundErr, statics: staticErr } : null };
}

// A signal head of a statics item as the host lights it: { x, y, z, node, edge, pi, pi2 (the props holding it up:
// the signal's pole, a span wire's two poles; -1 none), nx, ny (the way its lenses face), L: [red, amber, green]
// lens centres [x, y, z] on the lit face }. The lens layout follows the statics' models (statics.js signalModel): a
// mast-arm head's lenses stack 7 px apart round the head's z on the model's +y face (rotated by the item's
// heading), 5 px out from the arm line. A head that brings its own `lenses` ([[x, y, z] x 3], nx, ny) is taken as
// is (a span wire's: statics.js spanItem).
export function signalLenses(it, h) {
  const r = it.recipe || {}, z = h.z || 0;
  let nx, ny, L;
  if (h.lenses) { L = h.lenses; nx = h.nx ?? 0; ny = h.ny ?? 1; }
  else {
    const hd = r.hd || 0;
    nx = -Math.sin(hd); ny = Math.cos(hd);
    const x = h.x + nx * 5, y = h.y + ny * 5;
    L = [[x, y, z + 7], [x, y, z], [x, y, z - 7]];
  }
  return { x: h.x, y: h.y, z, node: h.node, edge: h.edge, pi: h.pi ?? it.pi ?? -1, pi2: h.pi2 ?? -1, nx, ny, L };
}

// The ground height (world px) under world (X, Y): what moving things standing there are raised by.
// grids: (cx, cy) -> gh of a baked chunk (or null).
export function groundZ(grids, X, Y) {
  const cx = Math.floor(X / CHUNK), cy = Math.floor(Y / CHUNK);
  const gx = ((X - cx * CHUNK) / GH_CELL) | 0;
  let z = 0;
  const a = grids(cx, cy);
  if (a) z = a[(((Y - cy * CHUNK) / GH_CELL) | 0) * GH_W + gx];
  const b = Y - (cy - 1) * CHUNK < CHUNK + GH_EXTRA ? grids(cx, cy - 1) : null; // a deck drawn up into the chunk to the north
  if (b) { const v = b[(((Y - (cy - 1) * CHUNK) / GH_CELL) | 0) * GH_W + gx]; if (v > z) z = v; }
  return z;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
