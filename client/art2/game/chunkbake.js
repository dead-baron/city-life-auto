// Art v2 live renderer: one baked chunk of the static world (docs/art-v2/GAME-RENDERER.md).
//
//   bakeChunk(M, cx, cy, opt) -> { g, under, blds, lights, gh, live, ms, n }
//     under   RGBA8: the chunk before its buildings (rgb) and, in alpha, the local number (1..63) of the building
//             whose surface is on top at that pixel (0: none); blds: [building index, x0, y0, x1, y1, base y]
//             per local number (its screen rectangle in world px), for fading whole buildings
//     g       the chunk G-buffer, CHUNK x CHUNK, ax = ay = 0: world X [cx*768, cx*768+768) and screen
//             Y (= world Y - Z) [cy*768, cy*768+768)
//     lights  the static light sources anchored in the chunk (statics.staticLights)
//     live    what the host animates on top, from the items anchored in the chunk: heads (signal heads
//             with their lens positions, see signalLenses), xing (level crossing posts)
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
export const DECK_Z = 44;           // height of the elevated highway deck (lz = 1); shared/levels.js DECK_LIFT
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

// ---- the bake ---------------------------------------------------------------------------------------------
// opt: { quality 0..3, seed, cutaway (building index), lowMem, groundCol (v1 ground pixels, RGBA) }
// cache: SpriteCache for makeStatic results (one per worker); P: providers (default: the loaded ones)
const isBuilding = (it) => (it.recipe && it.recipe.t === 'b' && !it.recipe.frame ? 1 : 0);
export function bakeChunk(M, cx, cy, opt = {}, cache = null, P = providers) {
  const t0 = now();
  const ox = cx * CHUNK, oy = cy * CHUNK;
  let G = null, groundErr = null;
  if (P.ground && !opt.groundCol) {
    try { G = P.ground.bakeGround(M, cx, cy, opt); } catch (e) { groundErr = String((e && e.stack) || e); G = null; }
    if (G && (G.w !== CHUNK || G.h !== CHUNK)) { groundErr = `bakeGround gave ${G.w}x${G.h}`; G = null; }
  }
  if (!G) G = flatGround(M, cx, cy, opt);
  G.ax = 0; G.ay = 0;
  const gh = groundHeights(G, ox, oy);
  const t1 = now();
  let items = [], lights = [], n = 0, made = 0, staticErr = null, under = null, bid = null;
  const local = new Map(), blds = [];      // building index -> local number; [b, x0, y0, x1, y1, base] per number
  const live = { heads: [], xing: [] };
  if (P.statics) {
    try { items = P.statics.staticItems(M, cx, cy, opt) || []; } catch (e) { staticErr = String((e && e.stack) || e); items = []; }
    // painter's order under the depth test: north to south, then west to east (ties go to the later one).
    // Buildings go last: the albedo just before them is the chunk's "under" layer, which the engine shows
    // through the cut-away hole round the player (the street behind a building).
    items.sort((a, b) => (isBuilding(a) - isBuilding(b)) || a.y - b.y || a.x - b.x);
    let snap = opt.under !== false;
    for (const it of items) {
      if (snap && isBuilding(it)) { under = G.col.slice(); snap = false; bid = new Uint8Array(CHUNK * CHUNK); }
      // each building gets a local number (1..63) in this chunk: the engine fades a whole building by it
      let k = 0;
      if (bid && isBuilding(it) && it.b !== undefined) {
        k = local.get(it.b) || 0;
        if (!k && blds.length < 63) { k = blds.length + 1; local.set(it.b, k); blds.push([it.b, Infinity, Infinity, -Infinity, -Infinity, -Infinity]); }
        if (k) {
          const r = blds[k - 1], e = it.ext || [0, 0, 0, 0];
          r[1] = Math.min(r[1], it.x - e[0]); r[2] = Math.min(r[2], it.y - (it.z0 || 0) - e[1]); r[3] = Math.max(r[3], it.x + e[2]); r[4] = Math.max(r[4], it.y + e[3]); r[5] = Math.max(r[5], it.y);
        }
      }
      let s;
      try {
        s = cache ? cache.get(it.key, () => { made++; return P.statics.makeStatic(it.recipe); }) : (made++, P.statics.makeStatic(it.recipe));
      } catch (e) { staticErr = staticErr || `makeStatic(${it.key}): ${(e && e.message) || e}`; continue; }
      if (!s || !s.w) continue;
      const z0 = it.z0 || 0;
      const sx = Math.round(it.x - (s.ax || 0)) - ox, sy = Math.round(it.y - z0 - (s.ay || 0)) - oy;
      n += compositeDepth(G, s, sx, sy, z0, k ? bid : null, k) ? 1 : 0;
    }
    for (const it of items) { // (once per item: the chunk its anchor is in)
      if (it.x < ox || it.x >= ox + CHUNK || it.y < oy || it.y >= oy + CHUNK) continue;
      if (it.heads) for (let i = 0; i < it.heads.length; i++) live.heads.push(signalLenses(it, it.heads[i], i));
      if (it.xing) live.xing.push(it.xing);
    }
    if (typeof P.statics.staticLights === 'function') {
      try { lights = P.statics.staticLights(M, cx, cy, opt) || []; } catch (e) { staticErr = staticErr || String((e && e.message) || e); lights = []; }
    }
  }
  const t2 = now();
  if (!under && opt.under !== false) under = G.col.slice();   // no buildings here: the whole chunk is "under"
  // the under layer's alpha carries the local building number of the surface on top (0: no building)
  if (under) for (let i = 0, j = 3; i < CHUNK * CHUNK; i++, j += 4) under[j] = bid ? bid[i] : 0;
  return { g: G, under, blds, lights, gh, live, n, items: items.length, made, ms: { ground: t1 - t0, statics: t2 - t1 }, errors: groundErr || staticErr ? { ground: groundErr, statics: staticErr } : null };
}

// A signal head of a statics item as the host lights it: { x, y, z, node, edge, pi (the signal's prop, -1
// none), nx, ny (the way its lenses face), L: [red, amber, green] lens centres [x, y, z] on the lit face }.
// The lens layout follows the statics' models (statics.js signalModel / makeSpan): a mast-arm head's
// lenses stack 7 px apart round the head's z on the model's +y face (rotated by the item's heading), 5 px
// out from the arm line; a span-wire head's sit in a row 8 px apart on its +x face (the head drawn at its
// angle + PI), 4 px below the head's z. A head that brings its own `lenses` ([[x, y, z] x 3]) is taken as is.
export function signalLenses(it, h, i) {
  const r = it.recipe || {}, z = h.z || 0;
  let nx, ny, L;
  if (h.lenses) { L = h.lenses; nx = h.nx ?? 0; ny = h.ny ?? 1; }
  else if (r.t === 'span') {
    const a = (r.heads && r.heads[i] ? r.heads[i][2] : 0) + Math.PI, c = Math.cos(a), s = Math.sin(a);
    nx = c; ny = s;
    L = [0, 1, 2].map((k) => { const v = 8 * k - 8; return [h.x + c * 4 - s * v, h.y + s * 4 + c * v, z - 4]; });
  } else {
    const hd = r.hd || 0;
    nx = -Math.sin(hd); ny = Math.cos(hd);
    const x = h.x + nx * 5, y = h.y + ny * 5;
    L = [[x, y, z + 7], [x, y, z], [x, y, z - 7]];
  }
  return { x: h.x, y: h.y, z, node: h.node, edge: h.edge, pi: it.pi ?? -1, nx, ny, L };
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
