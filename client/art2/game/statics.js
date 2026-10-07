// Art v2 in the game: the static world of a chunk as G-buffer sprites (docs/art-v2/GAME-RENDERER.md,
// "Statics: statics.js"). Everything that stands up off the ground and never moves:
//   buildings    every map.buildings entry, styled by kind, prefab, district and wealth with art2's
//                makeBuilding (storefronts carrying their business names, lit windows, signs, neon and blade
//                signs, fire escapes, porticoes, pitched roofs), split into sections where a footprint is long
//                (houses get a garage wing, paint shops their drive-in bay); flat roofs are decks of tar, gravel,
//                membrane, standing-seam metal, pavers, planks or sedum sunk behind their parapets, some with a
//                setback volume on top, and carry a laid-out rooftop kit (air handlers in rows with walkway pads,
//                stair huts, tanks, chimneys, skylights, dishes, roof bars with umbrellas and festoon lights, neon
//                roof signs); a cut-away variant (no roof, walls cut low, the shop floor) for walk-ins
//   lot dressing gas canopies and pumps, house yards (fences, hedges, beds along the front wall, a yard tree,
//                pools), shopfront pots, sandwich boards and cafe tables, parking wheel stops, motor pool fences
//                and gate posts, construction cranes, barns and silos, brick walls, security camera poles
//   props        all map.props kinds as voxel models (street furniture, street lights, poles and wires, signs,
//                country set pieces), trees and plants chosen by biome, district and zone (flora.js), and a
//                debris version of anything smashed; undergrowth, scrub and wild flowers the map does not place
//                (decoration only: low enough to walk through, trees only away from every path)
//   signals      mast arms with their head housings; the lit lamps are live (items carry `heads`)
//   decks        the elevated ring and its ramps cut into per-chunk pieces with their true heights, pillars
//   rail         platform canopies, benches, lamps, name boards; tunnel portals; crossing signal posts
//   set pieces   airport towers, venues, quarry terraces, the Rock's walls and towers, Paradise Cay ...
//
//   staticItems(M, cx, cy, opt) -> [{ key, recipe, x, y, z0, ext, ... }]
//        every static whose screen rectangle can overlap chunk (cx, cy) (screen y = Y - Z), sorted by ground y.
//        ext = [left, up, right, down]: the sprite's extent round its anchor on screen. opt.cutaway = a
//        building index: that walk-in's sections are swapped for their cut-away recipe. Extras: b (building
//        index), pi (prop index), heads (signal lamps: [{ x, y, z, node, edge }]), xing (crossing posts).
//   makeStatic(recipe) -> GBuf    anchor (.ax, .ay) = the item's ground point; z = true height above it
//   staticLights(M, cx, cy) -> [{ x, y, z, r, col: [0..1 x3], k, kind, night }]   the lights of statics
//        anchored in the chunk (street lights, lit windows, shopfronts, neon, signs, fires, runway lights)
// M is the CityMap from shared/map.js generateCity(seed) or its structured clone (same fields, no methods).
// Deterministic: every choice is hashed from positions and indices. The index over the whole map is built
// once per M (a WeakMap); the worker caches sprites by key (identical keys = identical sprites).
import { GBuf, hash, mulberry32, bayer, vnoise, F_GROUND, F_WATER, F_NOCAST, F_WET, F_LEAF, F_GLASS } from '../gbuf.js';
import { MAT, ramp, LIGHT } from '../palette.js';
import { makeBuilding, buildingH, roofDeckZ } from '../buildings.js';
import { Vox } from '../voxel.js';
import * as P from '../props.js';
import * as D from '../props-district.js';
import * as K from '../props-kit.js';
import * as RD from '../props-road.js';
import * as U from '../props-rural.js';
import * as TW from '../props-town.js';
import * as X from '../props-transit.js';
import * as WL from '../props-wild.js';
import * as PK from '../props-park.js';
import * as GD from '../props-garden.js';
import * as WT from '../water.js';
import * as FL from '../flora.js';
import * as TR from '../trees.js';
import { boulder as rockLump, outcrop, rockSprite, seaStack } from '../terrain.js';
import { distSq } from '../scene.js';
import { SCENE_MASKS } from '../../../shared/interior-art.js';
import { groundPixel } from '../ground.js';
import { drawText, textWidth } from '../font.js';
import { T, TILE } from '../../../shared/constants.js';
import { DISTRICTS, terrainAt, railAt, SEA_ISLES, wildBiome } from '../../../shared/map.js';
import { PREFABS } from '../../../shared/prefab-data.js';
import { DECK_LIFT } from '../../../shared/levels.js';

export const STATIC_CHUNK = 768;
const CH = 768, PI = Math.PI, TAU = PI * 2;
const NIGHT = 0.7;                 // how many windows are lit in the bake (their light is emissive only)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hh = (x, y, s = 0) => hash(Math.floor(x), Math.floor(y), s);
const rndOf = (a, b = 0) => mulberry32((Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ 0x5bd1e995) >>> 0);
const pick = (arr, u) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(u * arr.length)))];
const qa = (a, n = 32) => (((Math.round((((a % TAU) + TAU) % TAU) / TAU * n) % n) + n) % n) * TAU / n;   // quantised heading
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const L01 = (h) => hexRgb(h).map((v) => v / 255);

// ================================================================================================
// G-buffer helpers
// ================================================================================================
// Composite src into dst with the depth rule: src's anchor goes to dst pixel (ax, ay) (where its ground point
// would be at height 0), raised dz; the nearer surface (larger Z) wins, ties go to src. Exported for the
// chunk baker and the preview.
export function zPut(dst, src, ax, ay, dz = 0, flagOr = 0) {
  const ox = Math.round(ax - src.ax), oy = Math.round(ay - src.ay - dz), dzi = Math.round(dz);
  const x0 = Math.max(0, -ox), y0 = Math.max(0, -oy), x1 = Math.min(src.w, dst.w - ox), y1 = Math.min(src.h, dst.h - oy);
  const sc = src.col, dc = dst.col, sn = src.nrm, dn = dst.nrm, se = src.emi, de = dst.emi, sz = src.z, dZ = dst.z, sf = src.flag, df = dst.flag;
  for (let y = y0; y < y1; y++) {
    let si = y * src.w + x0, di = (y + oy) * dst.w + x0 + ox;
    for (let x = x0; x < x1; x++, si++, di++) {
      const a = sc[si * 4 + 3];
      if (!a) continue;
      const z = sz[si] + dzi;
      if (dc[di * 4 + 3] && dZ[di] > z) continue;
      const s4 = si * 4, d4 = di * 4;
      if (a < 255) { const k = a / 255; dc[d4] = dc[d4] * (1 - k) + sc[s4] * k; dc[d4 + 1] = dc[d4 + 1] * (1 - k) + sc[s4 + 1] * k; dc[d4 + 2] = dc[d4 + 2] * (1 - k) + sc[s4 + 2] * k; continue; }
      dc[d4] = sc[s4]; dc[d4 + 1] = sc[s4 + 1]; dc[d4 + 2] = sc[s4 + 2]; dc[d4 + 3] = 255;
      dn[d4] = sn[s4]; dn[d4 + 1] = sn[s4 + 1]; dn[d4 + 2] = sn[s4 + 2]; dn[d4 + 3] = sn[s4 + 3];
      de[d4] = se[s4]; de[d4 + 1] = se[s4 + 1]; de[d4 + 2] = se[s4 + 2]; de[d4 + 3] = se[s4 + 3];
      dZ[di] = z; df[di] = sf[si] | flagOr;
    }
  }
}
// a copy of G with margins added round it (the anchor moves with the content)
function grow(G, l, t, r, b) {
  l = Math.max(0, Math.ceil(l)); t = Math.max(0, Math.ceil(t)); r = Math.max(0, Math.ceil(r)); b = Math.max(0, Math.ceil(b));
  if (!l && !t && !r && !b) return G;
  const O = new GBuf(G.w + l + r, G.h + t + b);
  O.ax = G.ax + l; O.ay = G.ay + t;
  for (let y = 0; y < G.h; y++) {
    const s = y * G.w, d = (y + t) * O.w + l;
    O.col.set(G.col.subarray(s * 4, (s + G.w) * 4), d * 4); O.nrm.set(G.nrm.subarray(s * 4, (s + G.w) * 4), d * 4); O.emi.set(G.emi.subarray(s * 4, (s + G.w) * 4), d * 4);
    O.z.set(G.z.subarray(s, s + G.w), d); O.flag.set(G.flag.subarray(s, s + G.w), d);
  }
  return O;
}
// lay sprites together into one: parts [[spr, dx, dy, dz]] with each anchor's offset from the result's anchor
// (ground plane, world px) and raise; depth-tested
function group(parts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [s, dx, dy, dz = 0] of parts) { x0 = Math.min(x0, dx - s.ax); y0 = Math.min(y0, dy - dz - s.ay); x1 = Math.max(x1, dx - s.ax + s.w); y1 = Math.max(y1, dy - dz - s.ay + s.h); }
  const G = new GBuf(Math.ceil(x1 - x0), Math.ceil(y1 - y0)); G.ax = Math.round(-x0); G.ay = Math.round(-y0);
  for (const [s, dx, dy, dz = 0] of parts) zPut(G, s, G.ax + dx, G.ay + dy, dz);
  return G;
}
const EMPTY = (() => { const G = new GBuf(1, 1); G.ax = 0; G.ay = 0; return G; })();

// a small memo for sub-sprites shared by many statics (rooftop kit, pumps, chairs)
const MEMO = new Map();
function memo(key, fn) {
  let s = MEMO.get(key);
  if (s) { MEMO.delete(key); MEMO.set(key, s); return s; }
  s = fn(); MEMO.set(key, s);
  if (MEMO.size > 220) MEMO.delete(MEMO.keys().next().value);
  return s;
}
// Vox.render (voxel.js) with the same output, faster: each pixel's ray only visits the heights where it is
// inside the model's footprint (long thin models - mast arms, fences, portals - are mostly empty)
function vrender(m, heading = 0, opt = {}) {
  m.prepare(opt.smooth ?? m.smooth ?? 1);
  const { w, d, h } = m, R = Math.ceil(Math.hypot(w, d) / 2) + 2, G = new GBuf(2 * R, 2 * R + h + 2);
  G.ax = R; G.ay = R + h;
  const c = Math.cos(heading), s = Math.sin(heading), depth = new Float32Array(G.w * G.h).fill(-1e9), dith = opt.dither ?? 0.5;
  // the Z interval where lo <= a + b * Z < hi
  const span = (a, b, lo, hi, z0, z1) => { if (Math.abs(b) < 1e-9) return a >= lo && a < hi ? [z0, z1] : null; let p = (lo - a) / b, q = (hi - a) / b; if (p > q) { const t = p; p = q; q = t; } return [Math.max(z0, p), Math.min(z1, q)]; };
  for (let py = 0; py < G.h; py++) for (let px = 0; px < G.w; px++) {
    const X = px - R + 0.5, sy = py - G.ay + 0.5;
    // mx = c X + s (sy + Z + .5) + w/2, my = -s X + c (sy + Z + .5) + d/2
    const ax = c * X + s * (sy + 0.5) + w / 2, ay = -s * X + c * (sy + 0.5) + d / 2;
    const i1 = span(ax, s, 0, w, 0, h - 1); if (!i1 || i1[0] > i1[1] + 1) continue;
    const i2 = span(ay, c, 0, d, i1[0], i1[1]); if (!i2 || i2[0] > i2[1] + 1) continue;
    const zTop = Math.min(h - 1, Math.ceil(i2[1]) + 1), zBot = Math.max(0, Math.floor(i2[0]) - 1);
    for (let Z = zTop; Z >= zBot; Z--) {
      const Y = sy + Z + 0.5, mx = c * X + s * Y + w / 2, my = -s * X + c * Y + d / 2;
      if (mx < 0 || my < 0 || mx >= w || my >= d) continue;
      const vi = m.idx(mx | 0, my | 0, Z), mt = m.v[vi];
      if (!mt) continue;
      const M = m.mats[mt];
      let nx = m.nx[vi], ny = m.ny[vi], nz = m.nz[vi];
      if (!nx && !ny && !nz) nz = 1;
      const wx = c * nx - s * ny, wy = s * nx + c * ny, R5 = M.ramp;
      let t = M.k + (m.ao[vi] - 0.75) * 2.2 + (nz > 0.7 ? 0.5 : 0) + (M.shade ? M.shade(mx, my, Z, vi) : 0);
      t += bayer(px, py) * dith;
      G.put(px, py, R5[Math.max(0, Math.min(R5.length - 1, Math.round(t)))], [wx, wy, nz], Z, M.emi, M.flag | (opt.flag || 0));
      depth[py * G.w + px] = Y + Z;
      break;
    }
  }
  if (opt.inner !== false) for (let py = 1; py < G.h; py++) for (let px = 1; px < G.w - 1; px++) {
    const i = py * G.w + px, j = i * 4;
    if (!G.col[j + 3]) continue;
    const me = depth[i], up = depth[i - G.w], lf = depth[i - 1], rt = depth[i + 1];
    if ((up > -1e8 && up - me > 5) || (lf > -1e8 && lf - me > 5) || (rt > -1e8 && rt - me > 5)) { G.col[j] *= 0.62; G.col[j + 1] *= 0.6; G.col[j + 2] = G.col[j + 2] * 0.66 + 8; }
  }
  if (opt.outline !== false) outline(G, 0.42);
  return G;
}
// GBuf.outline(dark, true) without its per-pixel allocations: each empty pixel next to the shape (left, right or
// below it; not under its bottom edge) takes a dark, violet-shifted copy of that neighbour
function outline(G, dark) {
  const { w, h, col, nrm, z, flag } = G, pairs = new Int32Array(w * h * 2);
  let n = 0;
  const solid = (k) => col[k * 4 + 3] === 255 && !(flag[k] & F_GROUND);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (col[i * 4 + 3]) continue;
    const s = x > 0 && solid(i - 1) ? i - 1 : x < w - 1 && solid(i + 1) ? i + 1 : y < h - 1 && solid(i + w) ? i + w : -1;
    if (s >= 0) { pairs[n++] = i; pairs[n++] = s; }
  }
  for (let k = 0; k < n; k += 2) {
    const d = pairs[k], s = pairs[k + 1], dj = d * 4, sj = s * 4;
    col[dj] = col[sj] * dark * 0.85 + 6; col[dj + 1] = col[sj + 1] * dark * 0.8 + 4; col[dj + 2] = col[sj + 2] * dark * 0.95 + 18; col[dj + 3] = 255;
    nrm[dj] = nrm[sj]; nrm[dj + 1] = nrm[sj + 1]; nrm[dj + 2] = nrm[sj + 2]; nrm[dj + 3] = nrm[sj + 3];
    z[d] = z[s]; flag[d] = flag[s] & ~F_GROUND;
  }
}
// render a Vox at a heading, with its anchor moved to model point (pvx, pvy) (default: the model centre)
function voxSprite(m, hd = 0, pv = null) {
  const G = vrender(m, hd);
  if (pv) {
    const u = pv[0] - m.w / 2, v = pv[1] - m.d / 2, c = Math.cos(hd), s = Math.sin(hd);
    G.ax += Math.round(c * u - s * v); G.ay += Math.round(s * u + c * v);
  }
  return G;
}

// ================================================================================================
// map access
// ================================================================================================
function ctxOf(M) {
  const W = M.w, H = M.h;
  const tile = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= H ? T.WALL : M.tiles[ty * W + tx]);
  const at = (x, y) => tile(Math.floor(x / TILE), Math.floor(y / TILE));
  const di = (x, y) => { const tx = clamp(Math.floor(x / TILE), 0, W - 1), ty = clamp(Math.floor(y / TILE), 0, H - 1); return M.dist[ty * W + tx]; };
  const dist = (x, y) => DISTRICTS[di(x, y)] || DISTRICTS[13];
  const zone = (x, y) => { const tx = clamp(Math.floor(x / TILE), 0, W - 1), ty = clamp(Math.floor(y / TILE), 0, H - 1); return M.zone[ty * W + tx]; };
  const biome = (x, y) => (M.terrainCls ? wildBiome(di(x, y), terrainAt(M.terrainCls.cls, M.terrainCls.cw, Math.floor(x / TILE), Math.floor(y / TILE))) : 1);
  const deckAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < W && ty < H && M.deck && M.deck[ty * W + tx]; };
  // direction (radians) from (x, y) to the nearest road tile within r tiles along the axes, or null
  const roadDir = (x, y, r = 3) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (let k = 1; k <= r; k++) for (const [dx, dy, a] of [[0, 1, PI / 2], [0, -1, -PI / 2], [1, 0, 0], [-1, 0, PI]]) { const t = tile(tx + dx * k, ty + dy * k); if (t === T.ROAD || t === T.BRIDGE) return a; }
    return null;
  };
  // the mast arm standing on each sigpole prop, found by position (map.signals[].pi goes stale when props are
  // re-indexed after the signals are built)
  const pk = (x, y) => Math.round(x) + ',' + Math.round(y), sigPole = new Map(), armed = new Set();
  M.props.forEach((p, i) => { if (p && p.t === 'sigpole') sigPole.set(pk(p.x, p.y), i); });
  for (const sg of M.signals || []) if (!sg.wire && sigPole.has(pk(sg.x, sg.y))) armed.add(sigPole.get(pk(sg.x, sg.y)));
  const poleOf = (sg) => sigPole.get(pk(sg.x, sg.y));
  return { M, W, H, tile, at, di, dist, zone, biome, deckAt, roadDir, armed, poleOf };
}

// ================================================================================================
// the index: every static item of the map, bucketed by the chunks its screen rectangle touches
// ================================================================================================
const INDEX = new WeakMap();
export function staticIndex(M) {
  let I = INDEX.get(M);
  if (!I) {
    I = { cells: new Map(), lights: new Map(), byB: new Map(), garages: new Map(), fronts: [], n: 0 };
    const c = ctxOf(M);
    I.c = c;
    addBuildings(c, I);
    addLots(c, I);
    addProps(c, I);
    addSignals(c, I);
    addDecks(c, I);
    addRail(c, I);
    addSetPieces(c, I);
    addNature(c, I);
    addCameras(c, I);
    addYards(c, I);
    addFrontage(c, I);
    addGreenery(c, I);
    I.fronts = null; I.garages = null;
    INDEX.set(M, I);
  }
  return I;
}
const ck = (cx, cy) => cy * 4096 + cx;
// register an item: { key, recipe, x, y, z0, ext: [L, U, R, D] } (+ extras)
function put(I, it) {
  it.z0 = it.z0 || 0;
  const e = it.ext, sx0 = it.x - e[0], sx1 = it.x + e[2], sy0 = it.y - it.z0 - e[1], sy1 = it.y - it.z0 + e[3];
  for (let cy = Math.floor(sy0 / CH); cy <= Math.floor(sy1 / CH); cy++) for (let cx = Math.floor(sx0 / CH); cx <= Math.floor(sx1 / CH); cx++) {
    const k = ck(cx, cy); let l = I.cells.get(k);
    if (!l) I.cells.set(k, (l = []));
    l.push(it);
  }
  if (it.b !== undefined) { let l = I.byB.get(it.b); if (!l) I.byB.set(it.b, (l = [])); l.push(it); }
  I.n++;
  return it;
}
// a light, filed under the chunk its ground point is in
function lightAt(I, x, y, z, r, col, k, kind = 'lamp', night = 1) {
  const key = ck(Math.floor(x / CH), Math.floor(y / CH));
  let l = I.lights.get(key);
  if (!l) I.lights.set(key, (l = []));
  l.push({ x: Math.round(x), y: Math.round(y), z: Math.round(z), r: Math.round(r), col, k, kind, night });
}

export function staticItems(M, cx, cy, opt = {}) {
  const I = staticIndex(M);
  const list = I.cells.get(ck(cx, cy)) || [], props = propItemsIn(I.c, I, ck(cx, cy));
  const out = [];
  for (const it of props ? list.concat(props) : list) {
    let o = it;
    if (it.pi !== undefined && M.props[it.pi] && M.props[it.pi].broken) o = brokenVariant(it, M.props[it.pi]);
    else if (opt.cutaway !== undefined && opt.cutaway !== null && it.b === opt.cutaway && it.cut) o = it.cut();
    if (!o) continue;
    out.push(o);
  }
  if (!opt.noCover) for (const it of coverItems(I.c, I, cx, cy)) out.push(it);
  out.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  return out;
}
export function staticLights(M, cx, cy) {
  const I = staticIndex(M);
  return (I.lights.get(ck(cx, cy)) || []).slice();
}

// ================================================================================================
// makeStatic: recipe -> sprite
// ================================================================================================
export function makeStatic(r) {
  switch (r.t) {
    case 'b': return makeBld(r);
    case 'cut': return makeCut(r);
    case 'v': return voxSprite(voxModel(r.m, r.a || []), r.hd || 0, r.pv || null);
    case 'f': return makeFlora(r);
    case 'deck': return makeDeck(r);
    case 'sg': return makeSignal(r);
    case 'span': return makeSpan(r);
    case 'wire': return makeWire(r);
    case 'flat': return makeFlat(r);
    case 'grp': return group(r.parts.map(([q, dx, dy, dz]) => [makeStatic(q), dx, dy, dz || 0]));
    case 'sign': return makeSignBoard(r);
    case 'debris': return makeDebris(r);
    case 'rock': return makeRock(r);
    case 'fall': return WT.waterfall({ kind: r.kind || 'ledge', width: r.w, drop: r.drop, seed: r.seed || 5, frame: 0, mist: r.mist });
    case 'curtain': return WL.waterfall(r.w || 18, r.h || 90, r.seed || 4);
    case 'festoon': return makeFestoon(r);
    case 'outcrop': return outcrop(r.s + 7, r.w, r.d, r.h, r.style || 'granite', { veg: { kind: 'grass', density: 0.06, band: 2 }, moss: 0.1 });
    case 'towel': return makeTowel(r);
    case 'stack': return seaStack(r.s || 1, r.r || 26, r.h || 150, 'basalt', { hang: { kind: 'kelp', amount: 0.5 }, veg: { kind: 'grass', density: 0.1, band: 2 } });
    case 'sealrock': return outcrop(r.s || 3, r.w || 120, r.d || 70, r.h || 26, 'basalt', { barnacles: 0.8, wet: 12, hang: { kind: 'kelp', amount: 0.6 }, tiers: [[0, (r.h || 26) * 0.7], [8, r.h || 26]] });
    case 'crit': return r.k === 'starfish' ? WL.starfish(r.col || '#d8583a', 5, r.s || 1) : r.k === 'urchin' ? WL.urchin(4, r.s || 1, r.col || '#3a2448') : WL.anemone(4, r.s || 1);
    case 'mesas': return makeMesas(r);
    default: return EMPTY;
  }
}

// ================================================================================================
// buildings
// ================================================================================================
// map building kind -> archetype (the look); generic 'roof' buildings go by roof kind and district
const KIND_ARCH = {
  house1: 'house', house2: 'house', house3: 'house', house4: 'house', house5: 'house', house7: 'house', house8: 'house', house9: 'house', house6: 'villa',
  apt1: 'walkup', apt2: 'walkup', apt3: 'condo', apt4: 'condo', shanty1: 'shack', shanty2: 'shack', shanty3: 'shack', shack: 'shack', farmstead: 'farmhouse',
  tower1: 'office', tower2: 'glass', hotel: 'hotel', bank: 'bank', bank2: 'bank', hospital: 'hospital', police: 'police', police2: 'police', police3: 'police',
  fire: 'fire', school: 'school', church: 'church', theatre: 'theatre', club: 'club', clubnova: 'club', clubeclipse: 'club', arcade: 'arcade', tattoo: 'tattoo',
  conv: 'mart', quickstop: 'mart', liquor: 'liquor', market: 'mart', rest1: 'restaurant', rest2: 'cafe', diner: 'diner', redawning: 'cafe', greenbistro: 'cafe',
  gas: 'gas', fuel: 'gas', strip: 'strip', shops1: 'strip', shops2: 'strip', boutique: 'boutique', royale: 'boutique', vellori: 'boutique', monarch: 'boutique',
  diamond: 'boutique', crown: 'boutique', trail: 'outfitter', motors: 'showroom', dealer: 'showroom', warehouse: 'warehouse', industrial: 'factory', repair: 'garage',
  junkyard: 'yardoffice', construction: 'construction', pool: 'poolhouse', tackle2: 'bait', beachbar: 'beachbar', charter: 'charter', hangar: 'hangar',
  terminal: 'terminal', ranger: 'cabin', restrooms: 'block', hut: 'hut', office: 'siteoffice', snackbar: 'snackbar', grandstand: 'grandstand', pits: 'pits',
  lighthouse: 'lighthouse', den: 'den', mansion: 'mansion', civic: 'cityhall', shop: 'handshop', courthouse: 'court',
};
// names that are not worth a sign
const NOSIGN = new Set(['BUILDING', 'RESIDENCE', 'APARTMENTS', 'VILLA', 'SHACK', 'STOREFRONTS', 'HOMESTEAD', 'OFFICE TOWER', 'GLASS TOWER', 'WAREHOUSE', 'FACTORY', 'MOTOR POOL', 'HOTEL', 'TRANSMITTER HUT', 'CHAPEL', 'AUTO REPAIR', 'FARMSTEAD']);
// sign text: upper case, the font's characters only, at most n characters (cut at a word break when one is near)
const clean = (t, n = 22) => {
  t = String(t || '').toUpperCase().replace(/[/:]/g, '-').replace(/[^A-Z0-9 &'!$+.-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n + 1), sp = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('-'));
  return (sp >= n * 0.5 ? cut.slice(0, sp) : t.slice(0, n)).replace(/[ &.-]+$/, '');
};
const signName = (b) => { const t = clean(b.name, 26); return t && !NOSIGN.has(t) ? t : null; };

const WALLS = {
  towers: ['#bdb6aa', '#a9a59c', '#c9c1b2', '#9c9a93', '#d2cab9', '#b4ab9c'], commercial: ['#c8b494', '#b8a888', '#d8c8a8', '#a89878', '#c8a888', '#d4c4a4', '#bfae92'],
  apartments: ['#c4ab8c', '#b89a7c', '#d0bca0', '#bca488'], oldtown: ['#d9a98a', '#d8b45a', '#e0c08a', '#c8a07a', '#d8c4a4', '#e2b896', '#c48a6a', '#d4a070'],
  southside: ['#a89e8c', '#9a9284', '#8e9a8a', '#a49484', '#b0a490'], nightlife: ['#3a2a4a', '#2a2c3a', '#4a2a3a', '#2e3a44', '#3a3040'],
  redlight: ['#4a2a44', '#5a2a3a', '#3a2a4a', '#5a3a4a'], luxury: ['#ece2d0', '#e8dcc6', '#f0e8da', '#e2d4bc', '#dccfb6'],
  beach: ['#8ec8c0', '#e8a0b4', '#f0d890', '#e8e0d0', '#a8d0e0', '#f0c0a0'], houses: ['#e6d9bf', '#d8c6a2', '#c8d4da', '#e8e1d2', '#d6b598', '#bfcfb4', '#cdc2ac', '#d8cfc0', '#c6c0b4'],
  civic: ['#d4c8b0', '#c8bca4', '#d8d0bc', '#cfc6b0'], industrial: ['#7a8a94', '#8a7a6a', '#6a7a6a', '#9a9a8e', '#7e848a', '#8a8478'], rural: ['#e4e0d4', '#d8ccb4', '#c8b8a0', '#e8dcc4'],
};
const ROOFC = ['#5e6270', '#585c68', '#6a5a50', '#4e5a66', '#6a6e78', '#5a4e4a', '#46505a', '#4a5a50', '#6a4e44'];
const TILEC = ['#94503a', '#8a4a3c', '#9c5a3a', '#7e4436', '#946446', '#8a5640'];
const SHUT = ['#3a4a5c', '#2e5a4a', '#56606a', '#6a3a34', '#2e4a6a', '#4a5a3a'];
const SIGNC = [['#2a2c38', [236, 206, 120]], ['#e8e0cc', [180, 40, 46]], ['#1e3a5e', [240, 236, 220]], ['#f0ece4', [40, 110, 80]], ['#2f6a4e', [240, 232, 200]],
  ['#8a2a2e', [250, 230, 190]], ['#232838', [236, 214, 150]], ['#e8c040', [40, 40, 50]], ['#2a4a7a', [250, 250, 240]], ['#f4f0e8', [40, 60, 120]]];
const AWN = [['#2f7a5c', '#f0ece4'], ['#a8343a', '#f0ece4'], ['#2a3e7a', '#e8e4dc'], ['#c8503a', '#f0ece4'], ['#e0b040', '#f0ece4'], ['#2f6a4e', '#2f6a4e'],
  ['#a8343a', '#a8343a'], ['#3a3a44', '#e8e4dc'], ['#6a3a8a', '#f0ece4'], ['#2e6a8a', '#f0ece4'], ['#1e2a3a', '#1e2a3a']];
const NEONC = [[255, 70, 220], [90, 230, 255], [255, 90, 190], [180, 110, 255], [255, 200, 80], [120, 255, 150], [255, 120, 60]];
// invented names for the shops that have none (generic words only, never brands)
const SHOPNAMES = {
  mart: ['CORNER MART', 'QUICK STOP', 'LUCKY MART', '24-7 MARKET', 'SPEEDY STOP', 'CITY DELI', 'FRESH MART', 'MINI MART', 'GOOD FOOD', 'DAILY GROCER'],
  cafe: ['GOOD DAYS', 'BEAN THERE', 'CAFE RETRO', 'DAILY GRIND', 'BREW HAVEN', 'SUNNY SIDE', 'THE COZY CUP', 'MORNING BELL', 'TEA HOUSE', 'BAKERY'],
  diner: ['CITY DINER', 'EAT DRINK', 'BLUE PLATE', 'STARLITE DINER', 'MOM & POP', 'ROUTE DINER'],
  rest: ['NOODLE HOUSE', 'HOT WOK', 'TACO LOCO', 'BURGER BARN', 'PIZZA EXPRESS', 'THE BRICK OVEN', 'GOLDEN DRAGON', 'MAMA ROSA', 'SUSHI BAR', 'GYRO KING'],
  bar: ['THE LAST CALL', 'NIGHT OWL', 'TAP ROOM', 'RUSTY NAIL', 'BLUE NOTE', 'THE ANCHOR', 'DIVE BAR', 'LOUNGE'],
  shop: ['PALM & CO', 'RIVERTON SUPPLY', 'THREADS', 'URBAN WEAR', 'BOOK NOOK', 'PIXEL TECH', 'HOME GOODS', 'FLORIST', 'HARDWARE', 'VINTAGE', 'RECORDS', 'BARBER', 'LAUNDROMAT', 'PHARMACY', 'SHOE REPAIR', 'OPTICIAN', 'GIFTS', 'TOYS & GAMES'],
  liquor: ['LIQUOR', 'BEER WINE SPIRITS', 'CORNER LIQUOR', 'SPIRITS & MORE'], pawn: ['PAWN', 'GOLD & PAWN', 'CASH 4 GOLD', 'SECOND CHANCE'],
  surf: ['SURF', 'SURF SHOP', 'BEACH GEAR', 'COCO BITES', 'ICE CREAM', 'SUNSET SNACKS'],
};
// the shop a strip unit (or a generic ground floor) holds: storefront interior kind and invented name pool
const UNIT = { convenience: ['mart', 'mart'], coffee: ['cafe', 'cafe'], clothing: ['lobby', 'shop'], pharmacy: ['mart', 'shop'], pawn: ['pawn', 'pawn'], gunshop: ['pawn', 'shop'],
  sports: ['mart', 'shop'], hardware: ['mart', 'shop'], grocery: ['mart', 'mart'], fence: ['bar', 'bar'], club: ['bar', 'bar'], delivery: ['mart', 'shop'], fishmarket: ['mart', 'mart'], marina: ['mart', 'shop'], tackle: ['mart', 'shop'] };
const shopKindOf = (name) => { const n = (name || '').toUpperCase(); return /PIZZA|BURGER|WOK|TACO|DINER|FORK|FOOD|GRILL|NOODLE/.test(n) ? 'diner' : /COFFEE|CAFE|BEAN|BREW|BISTRO|BAKERY/.test(n) ? 'cafe' : /BAR|LOUNGE|PUB/.test(n) ? 'bar' : /PAWN/.test(n) ? 'pawn' : /LIQUOR|SPIRITS/.test(n) ? 'liquor' : /ARCADE/.test(n) ? 'arcade' : /BOUTIQUE|FASHION|THREAD|WEAR|COUTURE|BOOKS|TECH|FLORIST/.test(n) ? 'lobby' : 'mart'; };

function archOf(c, b) {
  const D = c.dist((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE), st = D.style;
  const r = b.roof >= 0 ? c.M.roofs[b.roof] : null, rk = r ? r.kind : null;
  if (b.business === 'courthouse') return 'court';
  if (b.kind === 'shop') { const n = (b.name || '').toUpperCase(); return /AUTO/.test(n) ? 'garage' : /FITNESS/.test(n) ? 'gym' : 'handshop'; }
  if (KIND_ARCH[b.kind]) return KIND_ARCH[b.kind];
  if (rk === 'glass') return st === 'towers' ? 'glass' : st === 'luxury' ? 'condo' : st === 'airport' ? 'terminal' : 'office';
  if (rk === 'metal') return st === 'southside' ? 'shed' : st === 'airport' ? 'hangar' : 'warehouse';
  if (rk === 'tile') return st === 'houses' || st === 'rural' ? 'house' : st === 'luxury' || st === 'beach' ? 'villa' : 'townhouse';
  return { towers: 'office', commercial: 'mixed', apartments: 'walkup', oldtown: 'oldrow', southside: 'rough', nightlife: 'nightrow', redlight: 'nightrow', industrial: 'warehouse',
    factory: 'warehouse', harbor: 'warehouse', civic: 'civicblock', luxury: 'condo', beach: 'beachblock', houses: 'house', park: 'pavilion', airport: 'hangar', rural: 'house' }[st] || 'mixed';
}
// the archetypes that are many little buildings when the footprint is big (each part its own height)
const GENERIC = new Set(['mixed', 'walkup', 'oldrow', 'rough', 'nightrow', 'office', 'glass', 'condo', 'civicblock', 'beachblock', 'townhouse', 'house', 'villa', 'warehouse', 'shed']);

// split a building into sections: x into shop units (strips) or parts no wider than ~16 tiles, y into rows
// no deeper than ~16 tiles (only the south row has the street front)
function sectionsOf(c, b, A) {
  const rnd = rndOf(b.id, 77), xs = [], ys = [];
  const units = (b.walkIn && b.walkIn.units.length) ? b.walkIn.units.map((u) => ({ cx: (u.x0 + u.x1 + 1) / 2, kind: u.kind, door: u.door })) : null;
  if (A === 'strip' || (units && units.length > 1)) {
    // one section per business: walk-in units, else the sign positions, else the prefab's doors
    let cuts = [];
    if (units && units.length > 1) cuts = units.map((u) => u.cx);
    else if (b.signs && b.signs.length > 1) cuts = b.signs.map((s) => s.x / TILE);
    else if (b.prefab >= 0 && PREFABS[c.M.prefabs[b.prefab].key]) { const p = c.M.prefabs[b.prefab]; cuts = PREFABS[p.key].doors.map((f) => p.tx + f * p.tw); }
    cuts.sort((a, q) => a - q);
    let x = b.tx;
    for (let i = 0; i < cuts.length; i++) {
      const nx = i === cuts.length - 1 ? b.tx + b.tw : Math.round((cuts[i] + cuts[i + 1]) / 2);
      if (nx - x >= 2) xs.push([x, nx - x, i]);
      x = nx;
    }
    if (!xs.length) xs.push([b.tx, b.tw, 0]);
    else { const last = xs[xs.length - 1]; last[1] = b.tx + b.tw - last[0]; }
  } else if (A === 'house' && b.tw >= 10 && b.tw <= 18 && b.th <= 14) {
    // a house and its garage wing (lower, its own roof) on the side away from the front door
    const ww = clamp(Math.round(b.tw * 0.32), 3, 5), doorL = b.door ? b.door.tx < b.tx + b.tw / 2 : rnd() < 0.5;
    if (doorL) xs.push([b.tx, b.tw - ww, 0], [b.tx + b.tw - ww, ww, 1, 'wing']);
    else xs.push([b.tx, ww, 1, 'wing'], [b.tx + ww, b.tw - ww, 0]);
  } else if (b.tw > (GENERIC.has(A) ? 18 : 26)) {
    let x = b.tx, k = 0;
    while (x < b.tx + b.tw) { let w = GENERIC.has(A) ? 7 + Math.floor(rnd() * 7) : 16; if (b.tx + b.tw - x - w < 5) w = b.tx + b.tw - x; xs.push([x, w, k++]); x += w; }
  } else xs.push([b.tx, b.tw, 0]);
  if (b.th > 18 && GENERIC.has(A)) {
    let y = b.ty;
    while (y < b.ty + b.th) { let h = 9 + Math.floor(rnd() * 6); if (b.ty + b.th - y - h < 6) h = b.ty + b.th - y; ys.push([y, h]); y += h; }
  } else ys.push([b.ty, b.th]);
  // a drive-in bay cut into the front (the paint shops): the walls step back round it
  const bays = (c.M.bays || []).filter((q) => q.tx >= b.tx && q.tx + q.tw <= b.tx + b.tw && q.ty >= b.ty && q.ty + q.th === b.ty + b.th);
  for (const q of bays) for (const X of [q.tx, q.tx + q.tw]) {
    const i = xs.findIndex(([x, w]) => X > x && X < x + w);
    if (i >= 0) { const [x, w, ui, role] = xs[i]; xs.splice(i, 1, [x, X - x, ui, role], [X, x + w - X, 60 + xs.length, role]); }
  }
  const out = [];
  ys.forEach(([ty, th0], ri) => xs.forEach(([tx, tw, ui, role]) => {
    const bay = ri === ys.length - 1 ? bays.find((q) => q.tx <= tx && q.tx + q.tw >= tx + tw) : null, th = bay ? th0 - bay.th : th0;
    if (th <= 0) return;
    const sec = { tx, ty, tw, th, row: ri, rows: ys.length, k: ri * 31 + ui, unit: ui, south: ri === ys.length - 1, role: role || null, parts: xs.length, mid: tx <= b.tx + b.tw / 2 && tx + tw > b.tx + b.tw / 2, bay };
    if (sec.south) {
      // what's in front of it: a street front gets doors and shops; a wall behind another building stays plain
      let open = 0; for (let x = tx; x < tx + tw; x++) { const t = c.tile(x, ty + th); if (t !== T.BUILDING && t !== T.WALL && t !== T.WATER && t !== T.DEEP) open++; }
      // (b.back: a World v2 building whose front faces north, away from the camera: its south wall is a plain back)
      sec.front = !b.back && (open >= tw * 0.5 || b.prefab >= 0 || !!b.hand || !!b.walkIn);
      if (units) { const u = units.find((q) => q.door && q.door.tx >= tx && q.door.tx < tx + tw); if (u) { sec.walk = u; sec.doorX = (u.door.tx - tx) * TILE + 4; sec.doorW = (u.door.w || 2) * TILE - 8; } }
      if (sec.doorX === undefined && b.door && b.door.tx >= tx && b.door.tx < tx + tw) sec.doorX = (b.door.tx - tx) * TILE + 7;
      if (b.signs && b.signs.length) { const s = b.signs.find((q) => q.x >= tx * TILE && q.x < (tx + tw) * TILE) || (xs.length === 1 ? b.signs[0] : null); if (s) sec.sign = clean(s.text, 26); }
      if (units && sec.walk) sec.ukind = sec.walk.kind;
    }
    out.push(sec);
  }));
  return out;
}

// the rooftop kit: [kind, x, y] (footprint centre, from the section's north-west corner); a kind ending in '@' is
// turned a quarter (its footprint swapped). KITS: [w, d, h] at heading 0
const KITS = { ac: [30, 22, 16], acs: [18, 14, 11], hvac: [44, 30, 22], vent: [10, 10, 12], pipe: [8, 8, 22], sky: [24, 18, 7], dish: [18, 14, 18], tank: [26, 26, 44],
  plant: [30, 12, 10], palm: [22, 22, 40], solar: [30, 20, 8], heli: [82, 82, 3], hut: [34, 26, 36], ant: [14, 14, 63], stack: [18, 18, 72], bill: [130, 12, 118],
  hatch: [16, 16, 9], chim: [12, 12, 39], line: [60, 4, 30], umb: [30, 30, 30], table: [14, 14, 12], lounge: [34, 14, 16], cool: [36, 36, 36], duct: [64, 10, 11],
  skyL: [24, 18, 7], string: [60, 4, 30], neon: [110, 6, 48] };
// 'neon|TEXT|c' is a lit sign standing at the roof's front edge (c: its NEONC colour)
const kitBase = (k) => k.replace(/@$/, '').split('|')[0];
function kitModel(k) {
  switch (k) {
    case 'ac': return P.roofAC(true); case 'acs': return P.roofAC(false); case 'hvac': return P.hvacUnit(); case 'vent': return P.roofVent(); case 'pipe': return P.ventStack(22);
    case 'sky': return P.skylight(); case 'dish': return P.dish(); case 'tank': return P.waterTank(); case 'plant': return P.roofPlanter(30); case 'palm': return P.pottedPalm();
    case 'solar': return TW.solarPanel(30, 20); case 'heli': return U.helipad(40); case 'hut': return P.roofHut(34, 26, 30); case 'ant': return P.antennaMast(60); case 'stack': return P.smokeStack(70, 7);
    case 'hatch': return P.roofHatch(); case 'chim': return P.chimney(34); case 'line': return P.laundryLine(60); case 'umb': return P.umbrella('#f0ece4', '#2f7a5c'); case 'table': return P.cafeTable();
    case 'lounge': return D.lounger('#f0eee8'); case 'cool': return P.coolingTower(36, 30); case 'duct': return P.duct(64);
    case 'skyL': return P.skylight(1); case 'string': return P.stringLights(60, 1);
    default: return P.roofVent();
  }
}
const kitSprite = (k) => memo('kit:' + k, () => {
  if (kitBase(k) === 'neon') { const [, text, ci] = k.split('|'); return makeSignBoard({ t: 'sign', text, sx: 2, bg: '#16141e', fg: NEONC[+ci % NEONC.length], lit: true, z: 22, posts: true }); }
  return voxSprite(kitModel(kitBase(k)), k.endsWith('@') ? PI / 2 : 0);
});
// Lay out a roof's kit: pieces stay clear of each other, of the parapets (margin m) and of `avoid` rects; rows of
// units get a walkway of pads along their south side (painted on the deck)
function layout(w, d, rnd, m, avoid = []) {
  const occ = avoid.map((q) => q.slice()), out = [], pads = [];
  const dims = (k, rot) => { const [a, b] = KITS[kitBase(k)]; return rot ? [b, a] : [a, b]; };
  const fits = (x, y, kw, kd, g = 5, mm = m) => x >= mm && y >= mm && x + kw <= w - mm && y + kd <= d - mm && !occ.some(([ox, oy, ow, od]) => x < ox + ow + g && x + kw + g > ox && y < oy + od + g && y + kd + g > oy);
  const add = (k, x, y, kw, kd, rot) => { occ.push([x, y, kw, kd]); out.push([rot ? k + '@' : k, Math.round(x + kw / 2), Math.round(y + kd / 2)]); };
  const L = {
    out, pads,
    free(k, n, north = false, rotP = 0) {                 // anywhere (north: the back 55% of the roof)
      for (let t = 0, got = 0; t < n * 14 && got < n; t++) {
        const rot = rnd() < rotP, [kw, kd] = dims(k, rot), sx = w - 2 * m - kw, sy = north ? (d - 2 * m) * 0.55 - kd : d - 2 * m - kd;
        if (sx < 0 || sy < 0) continue;
        const x = m + rnd() * sx, y = m + rnd() * sy;
        if (fits(x, y, kw, kd)) { add(k, x, y, kw, kd, rot); got++; }
      }
      return L;
    },
    row(k, n, rot = false, gap = 6) {                      // a block of units in one or two rows, a walkway in front
      if (n <= 0) return L;
      const [kw, kd] = dims(k, rot), rows = n > 3 && rnd() < 0.5 ? 2 : 1, per = Math.ceil(n / rows), bw = per * kw + (per - 1) * gap, bd = rows * kd + (rows - 1) * gap;
      if (w - 2 * m - bw < 0 || d - 2 * m - bd - 16 < 0) return n > 1 ? L.row(k, n - 1, rot, gap) : L;
      for (let t = 0; t < 24; t++) {
        const x = m + rnd() * (w - 2 * m - bw), y = m + rnd() * (d - 2 * m - bd - 16);
        if (!fits(x, y, bw, bd + 14)) continue;
        for (let i = 0; i < n; i++) add(k, x + (i % per) * (kw + gap), y + Math.floor(i / per) * (kd + gap), kw, kd, rot);
        pads.push([Math.round(x) - 2, Math.round(y + bd + 3), Math.round(bw) + 4, 12]); occ.push([x, y + bd, bw, 14]);
        return L;
      }
      return n > 1 ? L.row(k, n - 1, rot, gap) : L;
    },
    edge(k, n) {                                           // against the north, west or east parapet
      const mm = Math.max(3, m - 5);
      for (let t = 0, got = 0; t < n * 10 && got < n; t++) {
        const side = Math.floor(rnd() * 3), rot = side > 0, [kw, kd] = dims(k, rot);
        if (w - 2 * mm - kw < 0 || d - 2 * mm - kd < 0) continue;
        const x = side === 1 ? mm : side === 2 ? w - mm - kw : mm + rnd() * (w - 2 * mm - kw), y = side === 0 ? mm : mm + rnd() * (d - 2 * mm - kd);
        if (fits(x, y, kw, kd, 4, mm)) { add(k, x, y, kw, kd, rot); got++; }
      }
      return L;
    },
    grid(k, nx, ny, gap = 3) {                             // panels in a block (solar arrays, skylight rows)
      const [kw, kd] = dims(k, false), bw = nx * kw + (nx - 1) * gap, bd = ny * kd + (ny - 1) * gap;
      if (w - 2 * m - bw < 0 || d - 2 * m - bd < 0) return nx > 1 ? L.grid(k, nx - 1, ny, gap) : L;
      for (let t = 0; t < 16; t++) {
        const x = m + rnd() * (w - 2 * m - bw), y = m + rnd() * (d - 2 * m - bd);
        if (!fits(x, y, bw, bd)) continue;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) add(k, x + i * (kw + gap), y + j * (kd + gap), kw, kd, false);
        return L;
      }
      return L;
    },
    front(k) {                                             // along the front parapet, facing the street (signs)
      const [kw, kd] = dims(k, false), mm = Math.max(3, m - 4);
      for (let t = 0; t < 8; t++) { const x = mm + rnd() * (w - 2 * mm - kw), y = d - mm - kd - 2; if (w - 2 * mm - kw >= 0 && fits(x, y, kw, kd, 4, mm)) { add(k, x, y, kw, kd, false); return L; } }
      return L;
    },
    corner(k, rot = false) {                               // in a corner of the roof (stair huts, tanks)
      const [kw, kd] = dims(k, rot), cs = [[m, m], [w - m - kw, m], [m, d - m - kd - 12], [w - m - kw, d - m - kd - 12]];
      for (let t = 0; t < 4; t++) { const [x, y] = cs[(t + Math.floor(rnd() * 4)) % 4]; if (fits(x, y, kw, kd)) { add(k, x, y, kw, kd, rot); return L; } }
      return L;
    },
  };
  return L;
}
// the kit for a flat roof by archetype (counts grow with the roof's area): { kit, pads }
function kitFor(A, w, d, rnd, tier, spec, avoid = null) {
  if (w < 64 || d < 56) return { kit: [], pads: [] };
  const area = w * d - (avoid ? avoid[2] * avoid[3] : 0), n = clamp(Math.round(area / 15000), 1, 6), r = rnd, big = area > 40000, rough = tier === 'rough';
  const L = layout(w, d, r, (spec.rimW || 4) + 6, avoid ? [avoid] : []);
  switch (A) {
    case 'glass': case 'office': case 'hotel': case 'terminal':
      if (area > 70000 && A !== 'hotel' && r() < 0.3) L.free('heli', 1);
      L.corner('hut'); if (big && r() < 0.5) L.free('cool', 1 + (r() < 0.4 ? 1 : 0), true);
      L.row('ac', n + 1, r() < 0.3); if (big) L.row('hvac', 1 + (r() < 0.5 ? 1 : 0), true);
      if (r() < 0.35) L.free('ant', 1, true); if (r() < 0.4) L.free('dish', 1);
      L.free('vent', 2 + (n >> 1)); L.free('pipe', 2); if (r() < 0.5) L.free('skyL', 1 + (r() < 0.5 ? 1 : 0));
      if (A === 'hotel' && r() < 0.5) L.front(`neon|${clean(spec.signText || 'HOTEL', 10)}|${(spec.seed >> 3) % 7}`);
      if (A === 'hotel' && r() < 0.6) { L.edge('plant', 3); L.free('umb', 2); L.free('lounge', 2, false, 0.5); if (r() < 0.5) L.free('string', 1); }
      break;
    case 'hospital': L.free('heli', 1); L.row('hvac', 2); L.row('ac', n); L.corner('hut'); L.free('vent', 3); break;
    case 'police': case 'fire': L.free('ant', 1, true); L.free('dish', 2); L.row('ac', n); L.corner('hut'); L.free('vent', 2); break;
    case 'walkup': case 'rough':
      if (r() < 0.55) L.free('tank', 1, true); if (r() < 0.4) L.corner('hut'); else L.free('hatch', 1);
      L.edge('chim', 1 + (r() * 3 | 0)); L.row('acs', Math.max(1, n - 1)); L.free('vent', 2); L.free('pipe', 1 + (r() < 0.5 ? 1 : 0));
      if (rough || A === 'rough' || r() < 0.3) L.free('dish', 1 + (r() < 0.4 ? 1 : 0));
      if (r() < (A === 'rough' ? 0.55 : 0.35)) L.free('line', 1, false, 0.5);
      if (r() < 0.3) L.edge('plant', 2);
      break;
    case 'condo': case 'beachblock': case 'villa':
      L.edge('plant', 2 + (n >> 1)); L.free('palm', 1 + (n >> 2));
      if (r() < 0.6) { L.free('umb', 1 + (r() < 0.5 ? 1 : 0)); L.free('lounge', 2, false, 0.5); L.free('table', 1); if (r() < 0.35) L.free('string', 1); }
      L.row('acs', Math.max(1, n >> 1)); if (r() < 0.5) L.corner('hut'); if (r() < 0.4) L.free('skyL', 1);
      break;
    case 'oldrow': case 'townhouse':
      if (r() < 0.35) L.free('tank', 1, true); L.edge('chim', 1 + (r() * 2 | 0)); L.edge('plant', 1 + (r() < 0.5 ? 1 : 0)); L.row('acs', n); L.free('vent', 1);
      if (r() < 0.25) L.free('line', 1, false, 0.5); L.free('hatch', 1);
      break;
    case 'warehouse': case 'factory': case 'shed': case 'hangar': case 'pits':
      if (A === 'factory') L.free('stack', 1 + (r() < 0.5 ? 1 : 0), true);
      if (A === 'warehouse' || A === 'hangar') L.grid('sky', Math.max(1, Math.floor((w - 40) / 64)), d > 200 ? 2 : 1, 34);
      L.row('vent', Math.min(6, n + 2), false, 18); L.row('hvac', 1);
      if (A === 'factory') { if (r() < 0.5) L.free('tank', 1); L.free('duct', 1 + (r() < 0.5 ? 1 : 0), false, 0.5); }
      break;
    case 'school': L.grid('solar', 3, 2); L.row('ac', n); L.free('vent', 2); L.corner('hut'); break;
    case 'bank': case 'court': case 'cityhall': case 'civicblock': case 'theatre':
      L.row('hvac', 1); L.row('ac', n); if (r() < 0.5) L.free('skyL', 2); L.corner('hut'); L.free('vent', 2); if (r() < 0.5) L.edge('plant', 2);
      break;
    case 'nightrow': case 'club': case 'arcade': case 'tattoo':
      if (r() < 0.45) L.front(`neon|${pick(['BAR', 'LIVE', 'DANCE', 'COCKTAILS', 'CLUB', 'KARAOKE', 'LOUNGE', 'MOTEL'], r())}|${Math.floor(r() * 7)}`);
      L.row('ac', n); L.free('vent', 2);
      if (r() < 0.5) { L.free('umb', 2); L.free('table', 2); L.edge('plant', 2); L.free('string', 1 + (r() < 0.5 ? 1 : 0), false, 0.5); }
      if (r() < 0.5) L.free('dish', 1); L.free('hatch', 1);
      break;
    case 'garage': case 'yardoffice': case 'den': case 'block': case 'hut': case 'siteoffice': case 'poolhouse':
      L.row('acs', Math.min(2, n)); L.free('vent', 1 + (n >> 1)); if (rough && r() < 0.5) L.free('dish', 1);
      break;
    case 'grandstand': L.free('vent', 2); break;
    case 'house': case 'cottage':                          // a sun deck over the garage
      L.edge('plant', 2); L.free('umb', 1); L.free('table', 1); if (r() < 0.5) L.free('lounge', 1, false, 0.5);
      break;
    default:                                               // shops, mixed blocks and strips
      if (A === 'mixed' && w >= 150 && r() < 0.18) L.free('bill', 1, true);
      if (big && r() < 0.5) L.row('hvac', 1); L.row('ac', n, r() < 0.3); L.free('acs', n >> 1); L.free('vent', 1 + (n >> 1)); if (r() < 0.3) L.free('sky', 1);
      if (r() < 0.15) L.grid('solar', 2 + (r() * 3 | 0), 2); if (A === 'mixed' && r() < 0.2) L.free('tank', 1, true); L.free('hatch', 1); if (r() < 0.2) L.edge('plant', 2);
  }
  return { kit: L.out, pads: L.pads };
}
// the roof deck's material, parapet height and thickness by archetype (spec.roofMat, lip, rimW)
function roofOf(A, D, rnd, spec) {
  if (spec.roofMat) return;
  const r = rnd(), rough = D.tier === 'rough';
  let m, lip = 8, rw = 4;
  switch (A) {
    case 'glass': case 'office': case 'terminal': case 'hotel': m = r < 0.5 ? 'gravel' : r < 0.85 ? 'membrane' : 'green'; lip = 10; rw = 5; break;
    case 'condo': case 'beachblock': m = r < 0.4 ? 'paver' : r < 0.6 ? 'deck' : r < 0.75 ? 'green' : 'membrane'; lip = 10; break;
    case 'walkup': case 'rough': m = rough || A === 'rough' ? (r < 0.5 ? 'rubber' : 'tar') : r < 0.7 ? 'tar' : 'gravel'; lip = 10 + (rnd() * 4 | 0); break;
    case 'oldrow': case 'townhouse': m = r < 0.6 ? 'tar' : 'gravel'; lip = 10; break;
    case 'warehouse': case 'factory': case 'shed': case 'hangar': case 'pits': case 'grandstand': m = spec.style === 'corrugated' || r < 0.5 ? 'metal' : 'membrane'; lip = 3; rw = 3; break;
    case 'garage': case 'yardoffice': case 'den': case 'block': case 'hut': case 'siteoffice': case 'poolhouse': case 'shack': m = r < 0.5 ? 'tar' : 'gravel'; lip = 5; rw = 3; break;
    case 'hospital': case 'school': case 'police': case 'fire': m = r < 0.6 ? 'membrane' : 'gravel'; lip = 8; rw = 5; break;
    case 'bank': case 'court': case 'cityhall': case 'civicblock': case 'theatre': m = r < 0.6 ? 'gravel' : r < 0.8 ? 'membrane' : 'green'; lip = 10; rw = 5; break;
    case 'nightrow': case 'club': case 'arcade': case 'tattoo': m = r < 0.6 ? 'tar' : 'rubber'; break;
    default: m = r < 0.4 ? 'gravel' : r < 0.8 ? 'tar' : 'membrane';
  }
  if (rough && m === 'tar') m = 'rubber';
  Object.assign(spec, { roofMat: m, lip, rimW: rw });
}
// a setback: a smaller volume standing on the roof (offices step back, walk-ups have a taller rear, condos a
// penthouse), with windows on every floor and its own roof
const UPPER = { glass: 0.85, office: 0.75, hotel: 0.6, condo: 0.55, terminal: 0.5, hospital: 0.6, walkup: 0.35, mixed: 0.35, oldrow: 0.25, nightrow: 0.3, civicblock: 0.5,
  beachblock: 0.4, bank: 0.3, court: 0.4, cityhall: 0.5, school: 0.3, police: 0.4, theatre: 0.3 };
function upperOf(A, D, rnd, spec, w, d) {
  const p = UPPER[A] || 0;
  if (!p || w < 150 || d < 150 || rnd() >= p) return null;
  const rw = spec.rimW || 4, inS = 34 + Math.round(rnd() * Math.min(80, d * 0.3)), inN = rnd() < 0.4 ? 0 : rw + 6 + Math.round(rnd() * 20);
  const inW = rnd() < 0.5 ? Math.round(rnd() * w * 0.3) + rw + 6 : rw + 6, inE = rnd() < 0.5 ? Math.round(rnd() * w * 0.3) + rw + 6 : rw + 6;
  const uw = w - inW - inE, ud = d - inS - inN;
  if (uw < 90 || ud < 70) return null;
  const tall = A === 'glass' || A === 'office' || A === 'hotel' || A === 'condo' || A === 'terminal' || A === 'hospital';
  const fl = tall ? 1 + Math.floor(rnd() * (D.style === 'towers' ? 5 : 3)) : 1 + (rnd() < 0.3 ? 1 : 0);
  const us = { w: uw, d: ud, seed: spec.seed + 17, glowOnly: true, night: NIGHT, floors: fl + 1, groundH: 0, blank: true, style: spec.style, wallColor: spec.wallColor, parapet: 4,
    balconies: !!spec.balconies && rnd() < 0.5, shutters: spec.shutters || null, roof: 'flat' };
  roofOf(A, D, rnd, us);
  return { spec: us, x: inW, y: inN };
}
const winXs = (w, avoid = [], gap = 36, m = 10) => { const out = []; for (let x = m; x + 16 <= w - m; x += gap) if (!avoid.some(([a, b]) => x + 16 > a - 5 && x < b + 5)) out.push(x); return out; };

// the makeBuilding spec, rooftop kit and lights of one section. lights: [dx, dy, z, r, col, k, kind] from the
// section's south-west corner (dy south of the front wall)
function specOf(c, b, A, s, D) {
  const rnd = rndOf(b.id * 31 + s.k, 911), w = s.tw * TILE, d = s.th * TILE, seed = ((b.id * 7919 + s.k * 131) >>> 0) % 100000 + 7;
  const st = D.style, tier = D.tier, rough = tier === 'rough', low = tier === 'low' || tier === 'red';
  const lights = [], WARM = LIGHT.warmWindow;
  const wall = (pal) => pick(WALLS[pal] || WALLS.commercial, rnd());
  const named = s.sign || signName(b);
  const front = s.south && s.front;
  const doorX = clamp(s.doorX ?? Math.round(w * (0.3 + rnd() * 0.4)) - 9, 6, Math.max(6, w - 30));
  const spec = { w, d, seed, glowOnly: true, night: NIGHT, roof: 'flat' };
  let kit = null, pitched = false;
  const shopName = (pool) => named || pick(SHOPNAMES[pool] || SHOPNAMES.shop, rnd());
  const sc = () => pick(SIGNC, rnd());
  // a storefront on the ground floor: kind (storefront interior), sign text, awning (null = band/sign only)
  const shop = (kind, text, o = {}) => {
    const [bg, fg] = o.sc || sc();
    const sh = { kind, door: s.doorX !== undefined ? doorX : rnd() < 0.5 ? 'left' : 'right', open: true, people: o.people ?? (rnd() < 0.6 ? 1 + (rnd() * 3 | 0) : 0), clerkShirt: o.shirt };
    if (s.doorW) sh.doorW = s.doorW;
    if (text) sh.sign = { text: clean(text, Math.max(4, Math.floor((w - 14) / 4))), bg, fg, lit: true, icon: o.icon };
    if (o.awning !== null && (o.awning || rnd() < 0.55)) sh.awning = o.awning || pick(AWN, rnd());
    if (!sh.sign && !sh.awning) sh.band = pick(AWN, rnd());
    if (o.grille) sh.grille = true;
    if (o.openSign) sh.openSign = { col: [255, 60, 70] };
    spec.shop = sh;
    const dx = typeof sh.door === 'number' ? sh.door + (sh.doorW || 22) / 2 : sh.door === 'left' ? 21 : w - 21;
    shopSpill(lights, w, dx);
    if (sh.sign) lights.push([w / 2, 10, 70, 90, L01(bg).map((v) => 0.4 + v * 0.6), 0.5, 'sign']);
  };
  const plainDoors = (o = {}) => {
    const dw = o.dw || 22;
    spec.doors = [{ x: doorX, w: dw, kind: 'door', open: o.open ?? rnd() < 0.25 }];
    spec.windows = winXs(w, [[doorX, doorX + dw]], o.gap || 36);
    spec.porchLight = o.porch ?? true;
    if (spec.porchLight) lights.push([doorX + dw + 4, 8, 34, 56, [1, 0.8, 0.5], 0.8, 'window']);
  };
  const upperLights = (floors, cool = 0.15) => {
    if (floors < 2) return;
    const n = w > 220 ? 2 : 1;
    for (let i = 0; i < n; i++) lights.push([w * (n === 1 ? 0.5 : i ? 0.75 : 0.25), 8, 40 + floors * 18, 70 + floors * 16, rnd() < cool ? LIGHT.coolWindow : WARM, 0.32 + floors * 0.05, 'window']);
  };
  // a vertical blade sign at one end of the facade (on the upper floors)
  const blade = (text, col, v) => { const x = rnd() < 0.5 ? 10 : w - 32; if (w < 90) return; (spec.blades ||= []).push({ text, x, v, col }); lights.push([x + 11, 10, v + 40, 130, col.map((q) => q / 255), 1.3, 'neon']); };
  const neon = (text, col, v) => { const t = clean(text, clamp(Math.floor((w - 24) / 8), 4, 20)); (spec.plaques ||= []).push({ text: t, x: Math.max(4, Math.round(w / 2 - textWidth(t, { sx: 2, gap: 1 }) / 2) - 5), v, sx: 2, bg: '#1c1a28', fg: col, lit: true }); lights.push([w / 2, 14, v + 8, 150, col.map((q) => q / 255), 1.6, 'neon']); };
  switch (A) {
    case 'house': case 'cottage': {
      // the choices a house's parts share come from the building; the garage wing is one storey under its own roof
      const br = rndOf(b.id, 912), tile = st === 'beach' || st === 'luxury' || st === 'oldtown' || br() < 0.22, style = tile ? 'stucco' : br() < 0.6 ? 'siding' : 'stucco';
      const wc = pick(WALLS[st === 'beach' ? 'beach' : 'houses'], br()), rc = tile ? pick(TILEC, br()) : pick(ROOFC, br()), sh = br() < 0.45 ? pick(SHUT, br()) : null, two = br() < (st === 'luxury' ? 0.7 : 0.4);
      if (s.role === 'wing') {
        const gw = clamp(w - 24, 48, 112);
        spec.doors = front ? [{ x: Math.round((w - gw) / 2), w: gw, kind: 'garage', open: rnd() < 0.3 }] : [];
        Object.assign(spec, { floors: 1, style, wallColor: wc, roof: tile ? 'tile' : 'shingle', roofColor: rc, blank: !front, porchLight: front, windows: [] });
        if (rnd() < 0.3 && !tile) { spec.roof = 'flat'; spec.roofMat = 'deck'; spec.lip = 6; spec.rimW = 3; s.deck = true; } else { Object.assign(spec, { pitch: 'gable', ridge: rnd() < 0.6 ? 'ns' : 'ew', slope: 0.42 }); pitched = true; }
        break;
      }
      const solo = s.parts === 1, gw = solo && w >= 220 && d >= 96 && rnd() < 0.75 ? 56 : 0, gx = doorX < w / 2 ? w - gw - 12 : 12;
      spec.doors = [{ x: doorX, w: 18, kind: 'door', open: rnd() < 0.15 }];
      if (gw) spec.doors.push({ x: gx, w: gw, kind: 'garage', open: rnd() < 0.3 });
      Object.assign(spec, { floors: two && w >= 150 ? 2 : 1, style, wallColor: wc, pitch: br() < 0.62 ? 'hip' : 'gable', roof: tile ? 'tile' : 'shingle', roofColor: rc, slope: 0.48 + br() * 0.2,
        chimney: !tile && br() < 0.45, windows: winXs(w, spec.doors.map((q) => [q.x, q.x + q.w]), 38), porchLight: true, shutters: sh, solar: !tile && rnd() < 0.25, skylight: rnd() < 0.3 });
      if (spec.pitch === 'gable' && rnd() < 0.5) spec.ridge = 'ns';
      pitched = true; s.garage = gw ? [gx, gw] : null;
      lights.push([doorX + 22, 8, 34, 60, [1, 0.8, 0.5], 0.9, 'window']); upperLights(spec.floors, 0.1);
      break;
    }
    case 'villa': case 'mansion': {
      const fl = A === 'mansion' ? 3 : 2;
      const dw = A === 'mansion' ? 36 : 30;
      spec.doors = [{ x: clamp(Math.round(w / 2 - dw / 2), 6, w - dw - 6), w: dw, kind: 'door', open: true }];
      Object.assign(spec, { floors: fl, style: A === 'mansion' ? 'stone' : 'stucco', wallColor: A === 'mansion' ? '#dccfb6' : wall('luxury'), pitch: 'hip', roof: 'tile', roofColor: pick(TILEC, rnd()), slope: 0.45,
        balconies: true, shutters: pick(['#3a5a6a', '#2e4a5a', '#5a6a5a'], rnd()), windows: winXs(w, [[spec.doors[0].x, spec.doors[0].x + dw]], 40), porchLight: true });
      if (A === 'mansion' && w >= 260) spec.portico = { x: Math.round(w / 2 - 70), w: 140, cols: 4 };
      pitched = true;
      lights.push([w / 2, 10, 40, 90, [1, 0.82, 0.55], 1.1, 'window']); upperLights(fl, 0.1);
      break;
    }
    case 'farmhouse': {
      Object.assign(spec, { floors: 2, style: 'siding', wallColor: '#e4e0d4', pitch: 'gable', ridge: 'ns', slope: 0.6, roof: 'shingle', roofColor: '#5a5e6a', chimney: true, shutters: '#3a4a5a' });
      plainDoors({ dw: 18, open: true }); pitched = true; upperLights(2, 0);
      break;
    }
    case 'cabin': {
      Object.assign(spec, { style: 'siding', wallColor: '#7a5a40', pitch: 'gable', slope: 0.5, roof: 'shingle', roofColor: '#3e6a5a', chimney: true });
      plainDoors({ dw: 18, open: true });
      if (named) spec.plaques = [{ text: clean(named.replace(/^.*RANGER/, 'RANGER'), 16), x: 6, v: 46, sx: 1, bg: '#2e5a3e', fg: [240, 236, 214] }];
      pitched = true; break;
    }
    case 'shack': {
      Object.assign(spec, { style: rnd() < 0.6 ? 'corrugated' : 'siding', wallColor: pick(['#8a7a6a', '#7a8a8a', '#9a8a70', '#6a7a7a', '#8a6a5a'], rnd()), height: 46 + (rnd() * 12 | 0), roof: 'metal',
        boarded: 0.5, grime: 0.8, graffiti: rough && rnd() < 0.5 ? 1 : 0 });
      plainDoors({ dw: 18, porch: false });
      break;
    }
    case 'walkup': case 'rough': {
      const fl = A === 'rough' ? 1 + Math.floor(rnd() * 3) : st === 'apartments' ? 3 + Math.floor(rnd() * 3) : st === 'southside' ? 2 + Math.floor(rnd() * 2) : 3 + Math.floor(rnd() * 2);
      const style = rnd() < 0.6 ? 'brick' : rnd() < 0.55 ? 'brickDark' : pick(['stucco', 'peach', 'concrete'], rnd());
      Object.assign(spec, { floors: fl, style, wallColor: wall(st === 'southside' ? 'southside' : 'apartments'), parapet: 6 + (rnd() * 4 | 0),
        grime: rough ? 0.8 : low ? 0.45 : 0.18, graffiti: rough ? 1 + (rnd() < 0.5 ? 1 : 0) : low && rnd() < 0.3 ? 1 : 0, tagText: rough && rnd() < 0.5 ? pick(['SOUTH', 'RATS', 'VIBE', 'KING', 'ZONE', 'REBEL', 'OMEN', 'CREW'], rnd()) : null,
        boarded: rough ? 0.22 : 0, ivy: (st === 'oldtown' || st === 'apartments') && rnd() < 0.3 ? 0.4 : 0 });
      if (fl >= 2 && w >= 130 && rnd() < 0.55) spec.fireEscape = [clamp(Math.round(w * (0.5 + rnd() * 0.25)) - 25, 8, w - 60), 50];
      else if (fl >= 3 && rnd() < 0.25) spec.balconies = true;
      if (front && (A === 'rough' || st === 'commercial' || st === 'southside' || rnd() < 0.3)) {
        const k = A === 'rough' ? pick(['liquor', 'pawn', 'mart', 'mart', 'bar'], rnd()) : pick(['mart', 'cafe', 'mart', 'liquor', 'pawn'], rnd());
        shop(k, shopName(k === 'mart' ? 'mart' : k === 'cafe' ? 'cafe' : k === 'bar' ? 'bar' : k), { grille: rough && rnd() < 0.6, openSign: rough || rnd() < 0.3, awning: rough && rnd() < 0.6 ? null : undefined, icon: k === 'pawn' ? 'crown' : null });
      } else if (front) plainDoors({ dw: 22 });
      else spec.blank = true;
      upperLights(fl);
      break;
    }
    case 'condo': case 'beachblock': {
      const fl = A === 'beachblock' ? 2 + Math.floor(rnd() * 2) : st === 'luxury' ? 3 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 3);
      Object.assign(spec, { floors: fl, style: rnd() < 0.7 ? 'stucco' : 'concrete', wallColor: wall(A === 'beachblock' ? 'beach' : st === 'luxury' ? 'luxury' : 'commercial'), balconies: true, parapet: 6 });
      if (front && A === 'beachblock') shop(pick(['cafe', 'mart', 'diner'], rnd()), shopName('surf'), {});
      else if (front) shop('lobby', named, { awning: null, people: 1 });
      else spec.blank = true;
      upperLights(fl, 0.2);
      break;
    }
    case 'office': case 'glass': case 'terminal': {
      const fl = A === 'terminal' ? 3 : A === 'glass' ? (st === 'towers' ? 7 + Math.floor(rnd() * 5) : 5 + Math.floor(rnd() * 3)) : (st === 'towers' ? 5 + Math.floor(rnd() * 5) : 3 + Math.floor(rnd() * 3));
      Object.assign(spec, { floors: fl, style: A === 'office' ? (rnd() < 0.55 ? 'concrete' : 'stone') : 'glass', wallColor: wall('towers'), parapet: 4 + (rnd() * 6 | 0) });
      if (front) shop('lobby', s.mid ? (A === 'terminal' ? named || 'TERMINAL' : named) : null, { awning: null, people: 2, sc: ['#232838', [236, 214, 150]] });
      else spec.blank = true;
      upperLights(fl, 0.35);
      break;
    }
    case 'hotel': {
      const fl = 5 + Math.floor(rnd() * 4);
      Object.assign(spec, { floors: fl, style: rnd() < 0.5 ? 'stone' : 'stucco', wallColor: wall('luxury'), balconies: rnd() < 0.5, parapet: 8 });
      shop('lobby', s.mid ? named || 'HOTEL' : null, { awning: null, people: 3, sc: ['#232838', [236, 214, 150]] });
      spec.signText = /HOTEL|INN|MOTEL/.test(named || '') ? (named.match(/HOTEL|INN|MOTEL/) || ['HOTEL'])[0] : 'HOTEL';
      if (s.mid && (st === 'nightlife' || st === 'redlight' || st === 'beach' || rnd() < 0.3)) blade(spec.signText, st === 'nightlife' || st === 'redlight' ? pick(NEONC, rnd()) : [255, 210, 120], 90);
      upperLights(fl, 0.1);
      break;
    }
    case 'mixed': case 'oldrow': case 'townhouse': case 'nightrow': case 'civicblock': case 'pavilion': case 'handshop': {
      const town = A === 'oldrow' || A === 'townhouse';
      const fl = A === 'pavilion' ? 1 : A === 'civicblock' ? 2 + Math.floor(rnd() * 2) : A === 'nightrow' ? 2 + Math.floor(rnd() * 2) : town ? 2 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
      const style = A === 'nightrow' ? pick(['brickDark', 'stucco', 'stucco', 'brick'], rnd()) : A === 'civicblock' ? pick(['stone', 'concrete'], rnd()) : town ? pick(['peach', 'stucco', 'stucco', 'brick'], rnd()) : pick(['stucco', 'brick', 'concrete', 'stucco', 'brickDark'], rnd());
      Object.assign(spec, { floors: fl, style, wallColor: wall(A === 'nightrow' ? (st === 'redlight' ? 'redlight' : 'nightlife') : A === 'civicblock' ? 'civic' : town ? 'oldtown' : 'commercial'), parapet: 6 + (rnd() * 6 | 0) });
      if (town) { if (rnd() < 0.6) spec.shutters = pick(SHUT, rnd()); if (fl >= 2 && rnd() < 0.4) spec.balconies = true; if (rnd() < 0.3) spec.ivy = 0.35; if (A === 'townhouse' && s.th <= 10 && s.tw <= 14) { Object.assign(spec, { pitch: rnd() < 0.6 ? 'hip' : 'gable', roof: 'tile', roofColor: pick(TILEC, rnd()), slope: 0.42 }); pitched = true; } }
      if (low) { spec.grime = 0.35; if (rnd() < 0.3) spec.graffiti = 1; }
      if (front && A !== 'civicblock') {
        if (A === 'nightrow') {
          const k = pick(['bar', 'bar', 'arcade', 'mart'], rnd()); shop(k, shopName(k === 'arcade' ? 'bar' : k === 'mart' ? 'liquor' : 'bar'), { awning: rnd() < 0.4 ? ['#2a1e3a', '#2a1e3a'] : null, people: 3 });
          if (rnd() < 0.7) neon(pick(['BAR', 'OPEN', 'LIVE', 'CLUB', 'DANCE', 'COCKTAILS', 'KARAOKE', 'POOL'], rnd()), pick(NEONC, rnd()), (fl - 1) * 56 + 30);
          if (fl >= 2 && rnd() < 0.65) blade(pick(['MOTEL', 'BAR', 'HOTEL', 'LIVE', 'GIRLS', 'DINER', 'CLUB', 'JAZZ', 'LOUNGE'], rnd()), pick(NEONC, rnd()), 74);
        }
        else { const k = A === 'handshop' ? shopKindOf(b.name) : town ? pick(['cafe', 'cafe', 'mart', 'diner', 'lobby'], rnd()) : pick(['mart', 'cafe', 'lobby', 'diner', 'mart', 'pawn'], rnd()); shop(k, A === 'handshop' ? (named || shopName('shop')) : shopName(k === 'lobby' ? 'shop' : k === 'diner' ? 'rest' : k)); }
      } else if (front) plainDoors({ dw: A === 'civicblock' ? 30 : 22 });
      else spec.blank = true;
      upperLights(fl);
      break;
    }
    case 'mart': case 'liquor': case 'gas': case 'outfitter': case 'bait': case 'charter': {
      const fl = A === 'mart' && st !== 'commercial' && rnd() < 0.4 ? 2 : 1;
      Object.assign(spec, { floors: fl, style: A === 'bait' || A === 'charter' ? 'siding' : pick(['stucco', 'concrete', 'brick'], rnd()), wallColor: A === 'bait' || A === 'charter' ? pick(['#9aaab4', '#e8e4dc', '#8ab0c0'], rnd()) : wall(st === 'southside' ? 'southside' : 'commercial'), parapet: 8 });
      if (A === 'bait') { spec.pitch = 'gable'; spec.slope = 0.45; spec.roof = 'shingle'; spec.roofColor = '#5a6a7a'; pitched = true; }
      const k = A === 'liquor' ? 'liquor' : 'mart';
      shop(k, named || (A === 'liquor' ? 'LIQUOR' : A === 'gas' ? 'FUEL & FOOD' : shopName('mart')), { grille: rough, openSign: true, awning: A === 'gas' ? null : undefined, sc: A === 'gas' ? ['#d8343a', [250, 246, 236]] : undefined });
      if (A === 'gas' && !spec.shop.sign) spec.shop.band = ['#d8343a', '#f0ece4'];
      upperLights(fl);
      break;
    }
    case 'cafe': case 'restaurant': case 'diner': case 'snackbar': case 'beachbar': {
      if (A === 'diner' || A === 'snackbar') { Object.assign(spec, { style: 'diner', trim: [255, 70, 90], neon: { icon: 'cup', col: [255, 240, 220], x: clamp(Math.round(w / 2) - 14, 4, w - 32), y: -6 } }); shop('diner', named || 'DINER', { awning: null, people: 4 }); lights.push([w / 2, 10, 60, 130, [1, 0.35, 0.45], 1.2, 'neon']); break; }
      if (A === 'beachbar') { Object.assign(spec, { style: 'siding', wallColor: pick(['#8a6a4a', '#5a8a8a', '#7a5a3a'], rnd()), pitch: 'hip', roof: 'shingle', roofColor: '#6a5040', slope: 0.45 }); pitched = true; shop('diner', named || 'BEACH BAR', { awning: null, people: 4 }); break; }
      const fl = rnd() < 0.5 ? 2 : 1;
      Object.assign(spec, { floors: fl, style: pick(['stucco', 'brick', 'peach', 'stucco'], rnd()), wallColor: wall(st === 'oldtown' ? 'oldtown' : 'commercial'), parapet: 8, shutters: fl > 1 && rnd() < 0.4 ? pick(SHUT, rnd()) : null });
      const aw = b.kind === 'redawning' ? ['#a8343a', '#a8343a'] : b.kind === 'greenbistro' ? ['#2f6a4e', '#f0ece4'] : undefined;
      shop(A === 'restaurant' ? (rnd() < 0.5 ? 'diner' : 'cafe') : 'cafe', named || shopName(A === 'restaurant' ? 'rest' : 'cafe'), { awning: aw, people: 3 });
      upperLights(fl);
      break;
    }
    case 'strip': case 'gym': {
      const k = A === 'gym' ? 'lobby' : s.ukind ? (UNIT[s.ukind] || UNIT.delivery)[0] : shopKindOf(s.sign || b.name);
      Object.assign(spec, { floors: 1, style: pick(['stucco', 'brick', 'concrete', 'stucco'], rnd()), wallColor: wall(st === 'oldtown' ? 'oldtown' : 'commercial'), parapet: 10 });
      shop(k, s.sign || (A === 'gym' ? 'FITNESS' : named) || shopName(s.ukind ? (UNIT[s.ukind] || UNIT.delivery)[1] : 'shop'), { people: 2 });
      break;
    }
    case 'boutique': case 'showroom': {
      const fl = A === 'showroom' ? 1 + (rnd() < 0.4 ? 1 : 0) : 2 + (rnd() < 0.4 ? 1 : 0);
      Object.assign(spec, { floors: fl, style: A === 'showroom' ? 'glass' : rnd() < 0.5 ? 'stone' : 'stucco', wallColor: wall('luxury'), parapet: 8, balconies: A === 'boutique' && fl > 1 && rnd() < 0.4 });
      shop('lobby', named || 'BOUTIQUE', { awning: A === 'boutique' && rnd() < 0.5 ? ['#1e2a3a', '#e8e0cc'] : null, sc: ['#1c1c24', [236, 206, 120]], people: 2 });
      upperLights(fl, 0.2);
      break;
    }
    case 'club': case 'arcade': case 'tattoo': {
      Object.assign(spec, { floors: 2, style: rnd() < 0.5 ? 'brickDark' : 'stucco', wallColor: wall(st === 'redlight' ? 'redlight' : 'nightlife'), parapet: 8, grime: 0.3 });
      const col = pick(NEONC, rnd());
      shop(A === 'arcade' ? 'arcade' : 'bar', null, { awning: rnd() < 0.5 ? ['#2a1e3a', '#2a1e3a'] : null, people: A === 'club' ? 4 : 2 });
      neon(named || (A === 'arcade' ? 'ARCADE' : A === 'tattoo' ? 'TATTOO' : 'CLUB'), col, 72);
      if (A === 'club' && rnd() < 0.6) blade(pick(['CLUB', 'DANCE', 'LIVE', 'OPEN'], rnd()), pick(NEONC, rnd()), 70);
      break;
    }
    case 'theatre': {
      Object.assign(spec, { floors: 3, style: 'stone', wallColor: '#b89a7a', parapet: 10 });
      shop('lobby', null, { awning: null, people: 3 });
      neon(named || 'THEATRE', [255, 210, 120], 96); (spec.plaques ||= []).push({ text: 'TONIGHT', x: Math.max(4, Math.round(w / 2) - 30), v: 128, sx: 2, bg: '#2a1e1a', fg: [255, 236, 190], lit: true });
      blade('CINEMA', [255, 200, 90], 70);
      break;
    }
    case 'bank': case 'court': case 'cityhall': {
      const fl = A === 'bank' ? 2 + (rnd() < 0.5 ? 1 : 0) : 2;
      Object.assign(spec, { floors: fl, style: 'stone', wallColor: pick(['#d4c8b0', '#c8bca4', '#dcd2bc'], rnd()), parapet: 8 });
      const pw = clamp(Math.round(w * 0.46), 90, 160);
      if (w >= 140) spec.portico = { x: Math.round(w / 2 - pw / 2), w: pw, cols: 4, text: A === 'court' ? 'COURTHOUSE' : A === 'cityhall' ? 'CITY HALL' : 'BANK' };
      spec.doors = [{ x: Math.round(w / 2 - 14), w: 28, kind: 'door', h: 50, open: A === 'bank' }];
      spec.windows = winXs(w, [[w / 2 - pw / 2, w / 2 + pw / 2]], 30);
      if (A === 'bank' && named && w >= 120) spec.plaques = [{ text: clean(named, 18), x: 6, v: 70, sx: 1, bg: '#2a3a2a', fg: [236, 214, 150], lit: true }];
      lights.push([w / 2, 12, 40, 110, [1, 0.85, 0.6], 1, 'window']);
      upperLights(fl, 0);
      break;
    }
    case 'hospital': case 'police': case 'fire': case 'school': {
      const fl = A === 'hospital' ? 3 + (rnd() < 0.5 ? 1 : 0) : A === 'school' ? 2 + (rnd() < 0.5 ? 1 : 0) : 2;
      Object.assign(spec, { floors: fl, style: A === 'hospital' ? 'concrete' : A === 'police' ? pick(['concrete', 'brick'], rnd()) : 'brick', wallColor: A === 'hospital' ? '#e4e2da' : '#c8c4bc', parapet: 6 });
      if (A === 'fire') {
        const n = clamp(Math.floor((w - 60) / 70), 1, 3), dws = [];
        for (let i = 0; i < n; i++) dws.push({ x: 14 + i * 70, w: 58, kind: 'garage', open: i === 0, h: 54 });
        spec.doors = [...dws, { x: w - 30, w: 18, kind: 'door' }];
        spec.windows = [];
        spec.plaques = [{ text: clean(named || 'FIRE STATION', 16), x: 10, v: 64, sx: 1, bg: '#a8282c', fg: [250, 240, 230], lit: true }];
      } else {
        spec.doors = [{ x: Math.round(w / 2 - 25), w: 50, kind: 'door', open: true, h: 48 }];
        spec.windows = winXs(w, [[w / 2 - 25, w / 2 + 25]], 30);
        const txt = A === 'hospital' ? 'HOSPITAL' : A === 'police' ? 'POLICE' : clean(named || 'SCHOOL', 18);
        spec.plaques = [{ text: txt, x: Math.max(4, Math.round(w / 2 - textWidth(txt, { sx: 2, gap: 1 }) / 2) - 5), v: 66, sx: 2, bg: A === 'police' ? '#1d3a8a' : A === 'school' ? '#2a4a3a' : null, fg: A === 'hospital' ? [60, 54, 48] : [250, 250, 240], lit: A !== 'hospital' }];
        if (A === 'hospital') { spec.plaques.push({ text: 'EMERGENCY', x: Math.round(w / 2 - 25), v: 52, sx: 1, bg: '#c8343a', fg: [250, 246, 240], lit: true }); spec.cross = { x: 14, v: 80, s: 22 }; lights.push([w / 2, 14, 40, 140, [1, 0.5, 0.5], 1.2, 'sign']); }
        if (A === 'police') lights.push([w / 2, 14, 60, 120, [0.4, 0.6, 1], 1, 'sign']);
      }
      lights.push([w / 2, 12, 34, 110, [1, 0.9, 0.75], 1, 'window']); upperLights(fl, 0.4);
      break;
    }
    case 'church': {
      Object.assign(spec, { floors: 2, style: 'stone', wallColor: '#a8a49a', pitch: 'gable', ridge: 'ns', slope: 0.7, roof: 'tile', blank: true });
      const cx = Math.round(w / 2);
      spec.arches = [{ x: cx - 20, w: 40, h: 62, kind: 'door' }];
      if (w >= 150) spec.arches.push({ x: Math.round(w * 0.14), w: 18, h: 52, v: 36, kind: 'lancet' }, { x: Math.round(w * 0.86) - 18, w: 18, h: 52, v: 36, kind: 'lancet' });
      spec.rose = { x: cx, v: 92, r: 14 }; pitched = true;
      lights.push([cx, 12, 40, 100, [1, 0.8, 0.5], 0.9, 'window']);
      break;
    }
    case 'warehouse': case 'factory': case 'shed': case 'hangar': case 'pits': case 'garage': case 'yardoffice': case 'den': case 'block': case 'hut': case 'siteoffice': case 'poolhouse': case 'grandstand': {
      const H = { warehouse: 84 + (rnd() * 30 | 0), factory: 104 + (rnd() * 34 | 0), shed: 52 + (rnd() * 12 | 0), hangar: 128 + (rnd() * 24 | 0), pits: 58, garage: 66, yardoffice: 50, den: 60, block: 48, hut: 44, siteoffice: 52, poolhouse: 54, grandstand: 92 }[A];
      const style = A === 'factory' ? pick(['concrete', 'brick'], rnd()) : A === 'garage' || A === 'block' || A === 'den' || A === 'poolhouse' || A === 'grandstand' ? (A === 'poolhouse' ? 'stucco' : 'concrete') : A === 'siteoffice' ? 'siding' : 'corrugated';
      Object.assign(spec, { height: H, style, wallColor: A === 'poolhouse' ? '#e8e4dc' : A === 'siteoffice' ? '#d8ccb0' : wall('industrial'), roof: style === 'corrugated' || A === 'factory' || A === 'grandstand' ? 'metal' : 'flat', grime: A === 'poolhouse' ? 0 : rough || A === 'den' ? 0.75 : 0.4 });
      const doors = [];
      if (A === 'hangar') doors.push({ x: Math.round(w * 0.18), w: Math.round(w * 0.64), kind: 'roller', open: rnd() < 0.5, h: Math.min(H - 20, 96) });
      else if (A === 'pits') for (let x = 10; x + 52 <= w - 10; x += 62) doors.push({ x, w: 52, kind: 'roller', open: rnd() < 0.5 });
      else if (A === 'garage') { for (let x = 10, i = 0; x + 56 <= w - 30 && i < 3; x += 66, i++) doors.push({ x, w: 56, kind: 'garage', open: rnd() < 0.6 }); doors.push({ x: w - 26, w: 18, kind: 'door' }); }
      else if (A === 'warehouse' || A === 'factory' || A === 'shed') { const n = clamp(Math.floor(w / 110), 1, 3); for (let i = 0; i < n; i++) doors.push({ x: Math.round((i + 0.5) * w / n - 26), w: 52, kind: 'roller', open: rnd() < 0.3, h: Math.min(H - 16, 56) }); if (w > 90) doors.push({ x: Math.max(4, Math.round(w / n / 2) - 52), w: 18, kind: 'door' }); }
      else doors.push({ x: doorX, w: 18, kind: 'door', open: A === 'poolhouse' });
      if (A === 'block') doors.push({ x: clamp(doorX + 40, 6, w - 24), w: 18, kind: 'door' });
      spec.doors = doors.filter((q) => q.x >= 2 && q.x + q.w <= w - 2);
      spec.windows = A === 'warehouse' || A === 'hangar' || A === 'pits' || A === 'grandstand' ? [] : winXs(w, spec.doors.map((q) => [q.x, q.x + q.w]), 40);
      const label = A === 'block' ? 'RESTROOMS' : A === 'pits' ? 'PITS' : A === 'garage' ? (named || 'AUTO REPAIR') : A === 'poolhouse' ? (named || 'POOL') : A === 'grandstand' ? named : A === 'den' ? null : named;
      if (label) { const t = clean(label, Math.max(4, Math.floor((w - 16) / 8))), sx = w >= 200 ? 2 : 1; spec.plaques = [{ text: t, x: Math.max(4, Math.round(w / 2 - textWidth(t, { sx, gap: 1 }) / 2) - 5), v: Math.min(H - 5 * sx - 14, A === 'garage' ? 54 : 58), sx, bg: A === 'garage' ? '#2a4a7a' : A === 'grandstand' ? '#2a3e8a' : '#3a3e46', fg: [240, 236, 220], lit: A === 'garage' || A === 'grandstand' }]; }
      if (A === 'den') { spec.graffiti = 2; spec.tagText = 'NO TRESPASSING'; }
      if (A === 'grandstand') s.stands = true;
      if (doors.length) lights.push([w / 2, 10, 50, 90, [1, 0.85, 0.65], 0.7, 'window']);
      break;
    }
    case 'construction': s.frame = true; break;
    case 'lighthouse': s.vox = true; break;
    default: { Object.assign(spec, { floors: 2, style: 'stucco', wallColor: wall('commercial') }); if (front) plainDoors(); else spec.blank = true; }
  }
  // a bank branch moved into a shop unit: stone front, a marble lobby behind the glass, a green and gold sign
  if (spec.shop && spec.shop.sign && /\bBANK\b/.test(spec.shop.sign.text)) {
    Object.assign(spec, { style: 'stone', wallColor: pick(['#d4c8b0', '#c8bca4', '#dcd2bc'], rnd()), grime: 0, graffiti: 0, tagText: null, boarded: 0 });
    Object.assign(spec.shop, { kind: 'lobby', awning: null, band: null, grille: false, openSign: null, people: 2 });
    Object.assign(spec.shop.sign, { bg: '#1e3a2e', fg: [236, 214, 150] });
  }
  if (s.bay) {   // the bay's back wall: an open roller door into the lit booth, a sign over it
    delete spec.shop; delete spec.portico; delete spec.arches;
    Object.assign(spec, { blank: false, windows: [], doors: [{ x: 6, w: w - 12, kind: 'roller', open: true, h: 62 }], plaques: [{ text: 'PAINT', x: Math.max(4, Math.round(w / 2 - 26)), v: 66, sx: 2, bg: '#2a3a6a', fg: [250, 236, 200], lit: true }] });
    lights.push([w / 2, 6, 40, 110, [1, 0.88, 0.7], 1.1, 'window']);
  }
  // a building whose look the map sets (the hero corner, map.js buildHeroCorner): its spec, shopfront and roof kit
  const ART = b.art || null;
  if (ART) {
    const had = !!spec.shop;
    if (ART.spec) Object.assign(spec, ART.spec);
    if (ART.noShop) delete spec.shop;
    else if (ART.shop) {
      spec.shop = { ...(spec.shop || {}), ...ART.shop };
      if (ART.shop.sign === null) delete spec.shop.sign;
      if (!had) shopSpill(lights, w, spec.shop.door === 'left' ? 21 : w - 21);
    }
    if (ART.lights) lights.push(...ART.lights);
  }
  let up = null;
  if (!pitched && !s.frame && !s.vox) {
    roofOf(A, D, rnd, spec);
    up = ART ? null : upperOf(A, D, rnd, spec, w, d);
    const K = ART && ART.kit ? { kit: ART.kit.filter(([k, x, y]) => KITS[kitBase(k)] && x < w && y < d), pads: [] } : kitFor(A, w, d, rnd, tier, spec, up ? [up.x, up.y, up.spec.w, up.spec.d] : null);
    kit = K.kit; if (K.pads.length) spec.pads = K.pads;
    if (up) { const KU = kitFor(A, up.spec.w, up.spec.d, rnd, tier, up.spec); up.kit = KU.kit; if (KU.pads.length) up.spec.pads = KU.pads; }
    // the lit kit lights its roof: festoons, neon signs, skylights
    const zD = roofDeckZ(spec), kl = (list, ox, oy, z) => { for (const [k, rx, ry] of list) { const b = kitBase(k), X = ox + rx, Y = oy + ry - d;
      if (b === 'string') lights.push([X, Y, z + 26, 110, [1, 0.76, 0.42], 1.1, 'lamp']);
      else if (b === 'neon') lights.push([X, Y + 6, z + 40, 160, NEONC[+k.split('|')[2] % NEONC.length].map((q) => q / 255), 1.4, 'neon']);
      else if (b === 'skyL') lights.push([X, Y, z + 8, 56, [1, 0.84, 0.6], 0.45, 'window']); } };
    kl(kit, 0, 0, zD);
    if (up) kl(up.kit, up.x, up.y, zD + roofDeckZ(up.spec));
  }
  return { spec, kit: kit || [], lights, pitched, up };
}

function addBuildings(c, I) {
  const M = c.M;
  M.buildings.forEach((b, bi) => {
    if (!b || b.gone || b.kind === 'motorpool') return;
    const A = archOf(c, b);
    const D = c.dist((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE);
    const secs = sectionsOf(c, b, A);
    for (const s of secs) {
      const { spec, kit, lights, up } = specOf(c, b, A, s, D);
      const x0 = s.tx * TILE, y1 = (s.ty + s.th) * TILE, w = s.tw * TILE, d = s.th * TILE;
      let it;
      if (s.vox) {   // the lighthouse: a voxel tower on its rock
        it = { key: 'lh', recipe: { t: 'v', m: 'lighthouse', a: [170, 1] }, x: x0 + w / 2, y: y1 - d / 2, ext: [46, 250, 46, 46] };
        lightAt(I, x0 + w / 2, y1 - d / 2, 170, 360, [1, 0.92, 0.7], 2.2, 'lamp', 1);
      } else if (s.frame) {
        const fl = 3 + (b.id % 3);
        it = { key: `fr:${w}:${d}:${fl}:${b.id % 7}`, recipe: { t: 'b', frame: true, w, d, floors: fl, seed: b.id }, x: x0, y: y1, ext: [0, d + fl * 56 + 120, w, 4] };
      } else {
        const H = buildingH(spec), E = spec.pitch ? Math.ceil((spec.pitch === 'gable' && spec.ridge === 'ns' ? w / 2 : spec.pitch === 'gable' ? d / 2 : Math.min(w, d) / 2) * (spec.slope ?? 0.75)) + 18 : 0;
        const zD = roofDeckZ(spec), kTop = (list, z) => list.reduce((m, [k]) => Math.max(m, z + KITS[kitBase(k)][2] + 24), 0);
        let top = Math.max(H + E, kTop(kit, zD));
        if (up) { const zU = zD + roofDeckZ(up.spec); top = Math.max(top, zD + buildingH(up.spec) + 4, kTop(up.kit, zU)); }
        const key = `b:${bi}:${s.k}`;
        it = { key, recipe: { t: 'b', spec, kit, up, stands: !!s.stands }, x: x0, y: y1, ext: [2, d + top + 4, w + 2, 4] };
        if (b.walkIn && s.walk) {
          const sec = s, bld = b, base = it;
          it.cut = () => base._cut || (base._cut = { ...base, key: 'cut:' + base.key, recipe: cutRecipe(c, bld, sec, spec), ext: [2, d + Math.min(buildingH(spec), 120) + 12, w + 2, 4] });
        }
      }
      it.b = bi; it.fp = [x0, y1 - d, x0 + w, y1];   // (fp: the section's footprint; a fading building keeps it covered)
      put(I, it);
      for (const [dx, dy, z, r, col, k, kind] of lights) lightAt(I, x0 + dx, y1 + dy, z, r, col, k, kind, 1);
      // garage doors (the yard keeps their driveways clear), shopfronts (dressed later)
      for (const q of spec.doors || []) if (q.kind === 'garage' && s.south) { let l = I.garages.get(bi); if (!l) I.garages.set(bi, (l = [])); l.push([x0 + q.x - 10, x0 + q.x + q.w + 10]); }
      if (spec.shop && s.south && !s.vox && !s.frame) { const sh = spec.shop, dw = sh.doorW || 22, dx = typeof sh.door === 'number' ? sh.door : sh.door === 'right' ? w - dw - 10 : 10; I.fronts.push({ x0, y1, w, dx, dw, kind: sh.kind, A, st: D.style, b: bi }); }
    }
  });
}

// ---- the building sprite: makeBuilding plus the rooftop kit, or an unfinished frame -------------------------
function makeBld(r) {
  if (r.frame) return makeFrame(r);
  let G = makeBuilding(r.spec);
  if (r.stands) standsOn(G, r.spec);
  // what stands on the roof: [sprite, x, y (its ground point from the section's north-west corner), z, kind]
  const d = r.spec.d, zD = roofDeckZ(r.spec), layers = [];
  if (r.up) {
    const u = r.up, zU = zD + roofDeckZ(u.spec);
    layers.push([makeBuilding(u.spec), u.x, u.y + u.spec.d, zD, 'up']);
    for (const [k, rx, ry] of u.kit || []) layers.push([kitSprite(k), u.x + rx, u.y + ry, zU, k]);
  }
  for (const [k, rx, ry] of r.kit || []) layers.push([kitSprite(k), rx, ry, zD, k]);
  if (!layers.length) return G;
  let top = 0;
  for (const [s, , ry, z, k] of layers) top = Math.max(top, -(G.ay - d + ry - z - (k === 'bill' ? 128 : s.ay)));
  G = grow(G, 0, top, 0, 0);
  for (const [s, rx, ry, z, k] of layers) { if (k === 'bill') billboardOnRoof(G, rx, G.ay - d + ry, z, r.spec.seed); else zPut(G, s, G.ax + rx, G.ay - d + ry, z); }
  return G;
}
// a billboard standing on the roof: two posts and an advert face (invented ads only)
const ADS = [['A BRIGHTER', 'METRO CITY', '#2a3a7a', 'sun'], ['GOOD PEOPLE', 'BETTER DAYS', '#2a6a8a', 'palm'], ['FLY WESTPORT', 'INTERNATIONAL', '#3a6ab0', 'plane'], ['FRESH COLA', 'ICE COLD', '#b82a30', 'bottle'],
  ['SUNSET BEACH', 'GET AWAY', '#e07a3a', 'sun'], ['NOODLE HOUSE', 'OPEN LATE', '#c8343a', 'bowl'], ['DRIVE SAFE', 'ARRIVE ALIVE', '#2a5a3a', 'car'], ['BEAN MACHINE', 'COFFEE', '#4a3020', 'cup'],
  ['CEDAR ISLE', 'COME VISIT', '#3a7a4a', 'palm'], ['NEON NIGHTS', 'THE STRIP', '#5a2a7a', 'star']];
function adFace(w, h, ad, seed) {
  const [l1, l2, bg, icon] = ad, G = new GBuf(w, h), R = ramp(bg, 5, 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = x < 2 || y < 2 || x >= w - 2 || y >= h - 2, t = y / h;
    let c = edge ? MAT.metalDark[2] : (icon === 'sun' && t > 0.45 ? [255 - t * 100, 130 + t * 30, 80] : R[t < 0.5 ? 2 : 1]);
    if (!edge && icon === 'sun' && Math.hypot(x - w * 0.8, y - h * 0.55) < h * 0.2) c = [255, 214, 110];
    if (!edge && icon === 'palm' && Math.abs(x - w * 0.82 - (h - y) * 0.08) < 1.5 && y > h * 0.3) c = [30, 24, 40];
    if (!edge && icon === 'palm' && Math.abs(y - h * 0.3) < 4 - Math.abs(x - w * 0.82) * 0.25 && Math.abs(x - w * 0.82) < 14) c = [30, 34, 40];
    if (!edge && icon === 'bottle' && Math.abs(x - w * 0.84) < (y < h * 0.4 ? 2 : 5) && y > h * 0.2 && y < h * 0.85) c = [240, 236, 228];
    if (!edge && icon === 'cup' && Math.abs(x - w * 0.84) < 7 - (y - h * 0.45) * 0.1 && y > h * 0.45 && y < h * 0.8) c = [240, 236, 228];
    if (!edge && icon === 'star' && Math.hypot(x - w * 0.84, y - h * 0.5) < 9 && (Math.round(Math.atan2(y - h * 0.5, x - w * 0.84) * 5 / PI) & 1)) c = [255, 210, 90];
    G.put(x, y, c, [0, 1, 0.1], 0, edge ? null : [...c, 26], 0);
  }
  drawText((px, py, k) => G.put(px, py, k ? [20, 16, 24] : [250, 244, 228], [0, 1, 0.1], 0, k ? null : [255, 250, 230, 60], 0), l1, 6, Math.round(h * 0.18), { sx: 2, sy: 2, gap: 1, shadow: true });
  drawText((px, py, k) => G.put(px, py, k ? [20, 16, 24] : [255, 226, 140], [0, 1, 0.1], 0, k ? null : [255, 220, 140, 60], 0), l2, 6, Math.round(h * 0.55), { sx: 2, sy: 2, gap: 1, shadow: true });
  return G;
}
function billboardOnRoof(G, rx, ay, H, seed) {
  const ad = ADS[seed % ADS.length], fw = 120, fh = 44, lift = 30;
  const frame = memo('bbframe:roof', () => voxSprite(TW.billboardFrame(fw, fh, lift)));
  zPut(G, frame, rx, ay, H);
  zPut(G, upright(adFace(fw, fh, ad, seed), lift), rx, ay + 2, H);
}
// stand a flat face upright: each row's height is its height above the ground point (plus lift), anchor at the
// bottom middle of where it would meet the ground
function upright(F, lift = 0) {
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) F.z[y * F.w + x] = lift + F.h - y;
  F.ax = Math.round(F.w / 2); F.ay = F.h + lift;
  return F;
}
// grandstand seating painted over a facade: rows of seats stepping up with aisles, a roof edge on top
function standsOn(G, spec) {
  const { w, d } = spec, H = buildingH(spec), seats = [[214, 60, 60], [60, 110, 190], [230, 200, 80], [240, 238, 230]];
  for (let v = 14; v < H - 10; v++) for (let x = 4; x < w - 4; x++) {
    const Y = d + H - v, row = Math.floor((v - 14) / 6), ly = (v - 14) % 6, aisle = x % 90 < 6;
    let c;
    if (aisle) c = MAT.concrete[ly < 2 ? 2 : 3];
    else if (ly < 2) c = MAT.concrete[1 + (ly & 1)];
    else c = seats[(Math.floor(x / 90) + row) % 4].map((q) => q * (ly === 2 ? 1.1 : 0.85 - (hash(x >> 1, row, 3) > 0.85 ? 0.3 : 0)));
    const j = (Y * G.w + x) * 4; if (!G.inside(x, Y)) continue;
    G.col[j] = Math.min(255, c[0]); G.col[j + 1] = Math.min(255, c[1]); G.col[j + 2] = Math.min(255, c[2]);
  }
}
// a building going up: floor slabs on columns, open dark floors, rebar on top, scaffolding up one side
function makeFrame(r) {
  const { w, d, floors, seed } = r, FH = 56, H = floors * FH, G = new GBuf(w, d + H + 30); G.ax = 0; G.ay = d + H + 30;
  const CON = ramp('#a8a49c', 6, 3), DARK = ramp('#4a4844', 5, 2), STEEL = ramp('#c87830', 5, 2), NET = ramp('#3a8a5a', 5, 2), y1 = G.ay;
  const put = (x, Y, c, n, z, f = 0) => { if (!G.inside(x, Y)) return; const i = Y * G.w + x; if (G.col[i * 4 + 3] && G.z[i] > z) return; G.put(x, Y, c, n, z, null, f); };
  // the top slab (fresh concrete, formwork joints, puddles) and the facade: slabs at each floor, columns every
  // 48 px, dark floor plates between
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    const j = x % 48 === 0 || y % 40 === 0, wet = hash(x >> 4, y >> 4, seed + 3) > 0.9 && hash(x >> 2, y >> 2, seed) > 0.3;
    put(x, y1 - d - H + y, step2(CON, (j ? 0.38 : 0.52) + (hash(x >> 4, y >> 4, seed) - 0.5) * 0.08 - (wet ? 0.16 : 0), x, y), [0, 0, 1], H);
  }
  for (let v = 0; v < H; v++) for (let x = 0; x < w; x++) {
    const slab = v % FH > FH - 7, col = x % 48 < 6 || x > w - 7;
    put(x, y1 - v, slab ? step2(CON, 0.62 - (v % FH === FH - 1 ? -0.15 : 0), x, v) : col ? step2(CON, 0.45, x, v) : step2(DARK, 0.3 + (v % FH) / FH * 0.3, x, v), [0, 1, 0], v);
  }
  // rebar sticking up from the columns on the top slab
  for (let x = 2; x < w - 4; x += 48) for (let y = 4; y < d - 4; y += 40) for (const [ox, oy] of [[0, 0], [3, 0], [0, 3], [3, 3]]) for (let k = 0; k < 9; k++) put(x + ox, y1 - d - H + y + oy - k, STEEL[k > 6 ? 3 : 1], [0, 1, 0], H + k);
  // scaffolding with a green safety net over the west third of the facade
  const sw = Math.round(w * 0.38);
  for (let v = 0; v < H + 8; v++) for (let x = 0; x < sw; x++) {
    const pipe = x % 24 === 0 || v % 28 === 0, net = (x + v) % 3 !== 0;
    if (pipe) put(x, y1 - v - 6, MAT.metal[v % 28 === 0 ? 4 : 3], [0, 1, 0], v + 6);
    else if (net && v > 6) put(x, y1 - v - 6, step2(NET, 0.4 + ((x * 3 + v) % 7) / 20, x, v), [0, 1, 0], v + 6, F_NOCAST);
  }
  return G;
}
const step2 = (R, t, x, y) => R[clamp(Math.round(t * (R.length - 1) + (((x & 3) * 4 + (y & 3)) % 5 - 2) * 0.12), 0, R.length - 1)];

// ================================================================================================
// voxel models: recipe { t: 'v', m: name, a: [args], hd, pv: [x, y] (anchor = that model point) }
// ================================================================================================
function voxModel(m, a) {
  switch (m) {
    case 'hydrant': return P.hydrant(); case 'bin': return P.bin(a[0] ?? true); case 'wireBin': return P.wireBin(); case 'newsBox': return P.newsBox(a[0]);
    case 'bench': return P.bench(); case 'bollard': return P.bollard(a[0] || 12); case 'acUnit': return P.acUnit(); case 'planter': return P.planter(a[0] ?? true);
    case 'pottedPalm': return P.pottedPalm(); case 'umbrella': return P.umbrella(a[0], a[1]); case 'dumpster': return dumpster(a[0]); case 'crate': return P.crate(a[0] || 1);
    case 'hotdogCart': return P.hotdogCart(a[0] || 0); case 'armLamp': return P.armLamp(a[0], a[1], a[2]); case 'streetLamp': return P.streetLamp(a[0]);
    case 'lampPost': return P.lampPost(a[0], a[1]); case 'bannerLamp': return D.bannerLamp(a[0], a[1]); case 'twinLamp': return K.twinLamp(a[0]); case 'wallLamp': return RD.wallLamp(a[0], a[1]);
    case 'busShelter': return D.busShelter(a[0], a[1]); case 'phoneBooth': return K.phoneBooth(a[0]); case 'atmWall': return K.atmWall(a[0]); case 'vending': return K.vendingMachine(a[0], a[1]);
    case 'mailbox': return D.mailbox(a[0]); case 'wheelieBin': return D.wheelieBin(a[0]); case 'tires': return D.tires(a[0] || 3); case 'trashBags': return trashBags(a[0] || 3, a[1] || 1);
    case 'pallets': return pallets(a[0] || 1, a[1] || 1); case 'oilDrum': return D.oilDrum(a[0], a[1]); case 'cableSpool': return K.cableSpool(); case 'bikeRack': return X.bikeRack(a[0] || 3);
    case 'cone': return X.cone(); case 'planterBox': return D.planterBox(a[0], a[1], a[2] ?? true); case 'fountain': return D.fountain(a[0], a[1]); case 'flowerBed': return P.flowerBed(a[0]);
    case 'powerPole': return D.powerPole(a[0], a[1]); case 'tent': return U.tent(a[0]); case 'domeTent': return K.domeTent(a[0], a[1]); case 'campfire': return U.campfire(a[0]);
    case 'picnic': return U.picnicTable(); case 'pumpJack': return U.pumpJack(a[0]); case 'turbine': return U.windTurbine(a[0], a[1], a[2]); case 'flare': return U.flareStack(a[0]);
    case 'tank': return X.storageTank(a[0], a[1], a[2]); case 'cellTower': return K.cellTower(a[0]); case 'screen': return K.outdoorScreen(a[0], a[1]); case 'solar': return TW.solarPanel(a[0], a[1]);
    case 'runwayLight': return RD.runwayLight(a[0]); case 'viewer': return D.viewer(); case 'wheelbarrow': return U.wheelbarrow(); case 'airliner': return RD.airliner(a[0], a[1], a[2]);
    case 'lighthouse': return WL.lighthouse(a[0], a[1]); case 'pillar': return RD.pillar(a[0], a[1], a[2]); case 'canopy': return U.fuelCanopy(a[0], a[1], a[2], a[3]); case 'fuelPump': return U.fuelPump(a[0], a[1]);
    case 'platformCanopy': return RD.platformCanopy(a[0], a[1], a[2]); case 'stationEntrance': return RD.stationEntrance(a[0], a[1]); case 'crossingSignal': return RD.crossingSignal(a[0], a[1]);
    case 'controlTower': return RD.controlTower(a[0], a[1]); case 'fence': return D.fence(a[0], a[1], a[2] || {}); case 'fenceKind': return K.fenceKind(a[0], a[1]); case 'gatePillar': return D.gatePillar(a[0], a[1]);
    case 'compoundWall': return TW.compoundWall(a[0], a[1], a[2]); case 'guardTower': return TW.guardTower(a[0], a[1]); case 'hedge': return P.hedge(a[0], a[1]); case 'volleyNet': return P.volleyNet(a[0]);
    case 'soccerGoal': return PK.soccerGoal(a[0], a[1], a[2]); case 'terrace': return U.terrace(a[0], a[1], a[2], a[3]); case 'hayBale': return U.hayBale(a[0]); case 'scarecrow': return U.scarecrow();
    case 'windmill': return U.windmill(a[0]); case 'waterTower': return U.waterTower(a[0]); case 'piling': return P.piling(a[0]); case 'mooring': return X.mooringBollard(); case 'lounger': return D.lounger(a[0]);
    case 'hammock': return TW.hammock(a[0]); case 'boulder': return D.boulder(a[0], a[1], a[2]); case 'statue': return PK.statue(); case 'flagpole': return U.flagpole(a[0], a[1]); case 'jersey': return K.jerseyBarrier(a[0], a[1]);
    case 'forklift': return X.forklift(a[0], a[1]); case 'container': return X.container(a[0], a[1]); case 'clockPost': return RD.clockPost(); case 'stopPole': return X.stopPole(a[0]); case 'gazebo': return PK.gazebo();
    case 'beachChair': return PK.beachChair(a[0]); case 'lifeguard': return P.lifeguardTower(); case 'cafeTable': return P.cafeTable(); case 'chalkboard': return P.chalkboard(); case 'topiary': return D.topiary(a[0], a[1]);
    case 'trough': return U.trough(); case 'woodpile': return U.woodpile(); case 'propane': return U.propaneTank(); case 'barrierArm': return U.barrierArm(a[0], a[1]); case 'gantryCrane': return X.gantryCrane(a[0], a[1], a[2]);
    case 'dome': return obsDome(a[0] || 90); case 'marquee': return marquee(); case 'speaker': return speakerPost(); case 'portal': return portal(a[0] || 100); case 'wheelStop': return wheelStop();
    case 'gravel': return gravelPile(a[0] || 1); case 'rubble': return rubblePile(a[0] || 1); case 'trashPile': return trashPile(a[0] || 1); case 'pipes': return pipeStack(a[0] || 1); case 'lumber': return lumberStack(a[0] || 1, a[1] || 0);
    case 'crates': return crateStack(a[0] || 1); case 'signal': return signalModel(a[0], a[1] || []); case 'silo': return silo(a[0] || 90); case 'craneTower': return towerCrane(a[0] || 200, a[1] || 120);
    case 'bbframe': return TW.billboardFrame(a[0] || 132, a[1] || 54, a[2] || 36); case 'cctv': return P.cctvPole(a[0] || 64);
    case 'creekRail': return creekRail(a[0] || 200);
    case 'logCabin': return WL.logCabin(a[0] || 96, a[1] || 60, a[2] ?? 0.6); case 'lookout': return WL.lookoutTower(a[0] || 110, a[1] ?? 0.6);
    case 'chair': return U.campChair(['#2e6a3e', '#2f5a9a', '#b8402e', '#d89a2a'][a[0] || 0]); case 'cooler': return PK.cooler(['#2f6ab0', '#c8342e', '#e8e4dc'][a[0] || 0]);
    case 'surfboard': return P.surfboard(['#e8a040', '#2f8ac8', '#e85a7a'][a[0] || 0]); case 'tiki': return tikiTorch(); case 'post': return woodPost(a[0] || 46);
    case 'cottage': return WL.cottage(a[0] || 84, a[1] || 54, a[2] ?? 0.5); case 'seal': return WL.seal(a[0] || 0, ['#8a8a92', '#6e6e78', '#9a9088'][a[1] || 0]); case 'gull': return WL.gull(false);
    case 'crab': return WL.crab(); case 'driftwood': return WL.driftwood(a[0] || 50, a[1] || 1);
    case 'footbridge': return WT.footbridge(a[0] || 140, a[1] || 26, a[2] || 8);
    case 'mapBoard': return U.mapBoard();
    case 'lantern': return WL.lantern(a[0] || 'post', a[1] ?? 1);
    case 'fallenLog': return GD.fallenLog(a[0] || 110, a[1] || 11, a[2] || 1, a[3] ? { moss: 0.45, mossCol: '#4a7028', stubs: 2 } : { moss: 0.1, stubs: 2, bark: '#8a5a3a' });
    case 'cabbages': return K.cabbages(a[0] || 3, a[1] || 3); case 'cornRow': return U.cornField(120, 60, (a[0] || 0) + 1); case 'wheatRow': return K.wheatPatch(120, 50, (a[0] || 0) + 1); case 'ropeLine': return TW.ropeLine(a[0] || 60);
    default: return EMPTY_VOX();
  }
}
const EMPTY_VOX = () => new Vox(1, 1, 1);
// model sizes [w, d, h] for each name (used for the chunk extents without building the model)
function vdim(m, a) {
  switch (m) {
    case 'hydrant': return [10, 10, 16]; case 'bin': case 'wireBin': case 'wheelieBin': return [12, 12, 20]; case 'newsBox': return [10, 9, 18]; case 'bench': return [32, 10, 14];
    case 'bollard': return [6, 6, a[0] || 12]; case 'acUnit': return [18, 14, 12]; case 'planter': return [24, 14, 22]; case 'pottedPalm': return [22, 22, 40]; case 'umbrella': return [30, 30, 30];
    case 'dumpster': return [32, 18, 20]; case 'crate': return [14, 14, 13]; case 'hotdogCart': return [40, 24, 56]; case 'armLamp': return [a[0] + 12, 10, 102]; case 'streetLamp': return [14, 14, 94];
    case 'lampPost': return a[0] === 'cast' || a[0] === 'iron' ? [12, 12, 84] : [30, 12, 106]; case 'bannerLamp': return [22, 12, 90]; case 'twinLamp': return [46, 12, 98]; case 'wallLamp': return [8, 12, (a[1] || 46) + 4];
    case 'busShelter': return [a[0] || 64, 22, 46]; case 'phoneBooth': return [20, 20, 58]; case 'atmWall': return [36, 12, 52]; case 'vending': return [24, 16, 46]; case 'mailbox': return [12, 8, 20];
    case 'tires': return [18, 18, 16]; case 'trashBags': return [30, 24, 16]; case 'pallets': return [28, 24, 6 + 6 * (a[1] || 1)]; case 'oilDrum': return [12, 12, 18]; case 'cableSpool': return [24, 18, 26];
    case 'bikeRack': return [40, 10, 14]; case 'cone': return [10, 10, 16]; case 'planterBox': return [a[0] || 34, a[1] || 34, 26]; case 'fountain': return [(a[0] || 30) * 2 + 2, (a[0] || 30) * 2 + 2, 56];
    case 'flowerBed': return [a[0] || 30, 12, 10]; case 'powerPole': return [(a[1] || 16) * 2 + 4, 10, (a[0] || 120) + 4]; case 'tent': return [40, 34, 28]; case 'domeTent': return [36, 30, 22];
    case 'campfire': return [28, 28, 26]; case 'picnic': return [44, 36, 18]; case 'pumpJack': return [70, 20, 60]; case 'turbine': return [((a[1] || 80) * 2) + 8, 24, (a[0] || 260) + (a[1] || 80) + 6];
    case 'flare': return [14, 14, 90]; case 'tank': return [(a[0] || 44) * 2 + 4, (a[0] || 44) * 2 + 4, (a[1] || 120) + 26]; case 'cellTower': return [30, 30, (a[0] || 150) + 6]; case 'screen': return [(a[0] || 120) + 16, 12, (a[1] || 56) + 26];
    case 'solar': return [a[0] || 30, a[1] || 20, 8]; case 'runwayLight': return [4, 4, 6]; case 'viewer': return [14, 10, 40]; case 'wheelbarrow': return [30, 14, 14]; case 'airliner': return [a[0] || 460, a[1] || 420, 140];
    case 'lighthouse': return [48, 48, (a[0] || 140) + 36]; case 'pillar': return [(a[1] || 30) + 4, a[2] || 90, a[0] || 90]; case 'canopy': return [a[0] || 150, a[1] || 80, (a[2] || 52) + 10]; case 'fuelPump': return [12, 10, 34];
    case 'platformCanopy': return [a[0] || 200, a[1] || 40, 62]; case 'stationEntrance': return [70, 44, 54]; case 'crossingSignal': return [24, 8, 70]; case 'controlTower': return [70, 70, (a[0] || 220) + 50];
    case 'fence': return [a[1] || 60, 6, ({ picket: 16, wood: 30, chain: 32, iron: 28, stone: 12 }[a[0]] || 20) + 6]; case 'fenceKind': return [a[1] || 60, 6, 26]; case 'gatePillar': return [14, 14, (a[1] || 36) + 16];
    case 'compoundWall': return [a[0] || 80, 10, (a[1] || 40) + 8]; case 'guardTower': return [40, 40, (a[0] || 70) + 40]; case 'hedge': return [a[0] || 40, 10, (a[1] || 12) + 3]; case 'volleyNet': return [a[0] || 70, 4, 26];
    case 'soccerGoal': return [a[2] || 18, a[0] || 60, a[1] || 32]; case 'terrace': return [a[0] || 300, a[1] || 60, a[2] || 40]; case 'hayBale': return [24, 16, 16]; case 'scarecrow': return [30, 8, 56];
    case 'windmill': return [40, 40, (a[0] || 120) + 26]; case 'waterTower': return [40, 40, (a[0] || 90) + 40]; case 'piling': return [8, 8, a[0] || 20]; case 'mooring': return [14, 14, 16]; case 'lounger': return [34, 14, 16];
    case 'hammock': return [a[0] || 40, 10, 22]; case 'boulder': return [Math.ceil((a[1] || 22) * 1.2) + 4, Math.ceil((a[1] || 22) * 1.2) + 4, Math.ceil((a[1] || 22) * 0.9) + 2]; case 'statue': return [24, 24, 84];
    case 'flagpole': return [46, 8, (a[0] || 110) + 4]; case 'jersey': return [a[0] || 48, 14, 18]; case 'forklift': return [46, 26, 50]; case 'container': return [a[1] || 130, 54, 58]; case 'clockPost': return [16, 10, 64];
    case 'stopPole': return [14, 8, 60]; case 'gazebo': return [74, 74, 86]; case 'beachChair': return [26, 14, 16]; case 'lifeguard': return [34, 30, 46]; case 'cafeTable': return [14, 14, 12]; case 'chalkboard': return [12, 8, 18];
    case 'topiary': return [16, 16, 30]; case 'trough': return [36, 16, 12]; case 'woodpile': return [30, 12, 16]; case 'propane': return [60, 24, 30]; case 'barrierArm': return [a[0] || 70, 10, 30];
    case 'gantryCrane': return [70, a[0] || 170, (a[1] || 200) + 6]; case 'dome': return [(a[0] || 90) + 10, (a[0] || 90) + 10, (a[0] || 90) * 0.8 + 30]; case 'marquee': return [84, 10, 80]; case 'speaker': return [10, 10, 22];
    case 'portal': return [74, (a[0] || 100) + 4, 48]; case 'wheelStop': return [26, 6, 4]; case 'gravel': case 'rubble': return [40, 32, 14]; case 'trashPile': return [38, 28, 16]; case 'pipes': return [48, 24, 16];
    case 'fallenLog': return [(a[0] || 110) + 4, (a[1] || 11) * 2 + 6, (a[1] || 11) * 2 + 10];
    case 'creekRail': return [a[0] || 200, 10, 26]; case 'footbridge': return [a[0] || 140, a[1] || 26, (a[2] || 8) + 22];
    case 'logCabin': return [(a[0] || 96) + 8, (a[1] || 60) + 18, 72]; case 'lookout': return [68, 68, (a[0] || 110) + 46];
    case 'chair': return [12, 12, 20]; case 'cooler': return [16, 10, 12]; case 'surfboard': return [8, 4, 34]; case 'tiki': return [8, 8, 48]; case 'post': return [6, 6, (a[0] || 46) + 2];
    case 'cottage': return [(a[0] || 84) + 4, (a[1] || 54) + 6, 64]; case 'seal': return [46, 22, 18]; case 'gull': return [16, 8, 14]; case 'crab': return [16, 14, 6]; case 'driftwood': return [a[0] || 50, 16, 10];
    case 'mapBoard': return [40, 12, 50]; case 'lantern': return [12, 12, 40];
    case 'lumber': return [60, 24, 18]; case 'crates': return [32, 28, 30]; case 'cctv': return [22, 8, (a[0] || 64) + 2]; case 'signal': return [(a[0] || 70) + 10, 14, 92]; case 'bbframe': return [a[0] || 132, 10, (a[1] || 54) + (a[2] || 36) + 6]; case 'cabbages': return [(a[0] || 3) * 18, (a[1] || 3) * 18, 14]; case 'cornRow': return [120, 60, 36]; case 'wheatRow': return [120, 50, 22]; case 'ropeLine': return [a[0] || 60, 6, 20]; case 'silo': return [44, 44, (a[0] || 90) + 22]; case 'craneTower': return [(a[1] || 120) + 40, 30, (a[0] || 200) + 16];
    default: return [24, 24, 24];
  }
}
// an item for a voxel model at (x, y): heading hd, anchored at model point pv (default the centre)
function vitem(key, m, a, x, y, hd = 0, pv = null, extra = null) {
  const [w, d, h] = vdim(m, a), R = Math.ceil(Math.hypot(w, d) / 2) + 2;
  const off = pv ? Math.hypot(pv[0] - w / 2, pv[1] - d / 2) : 0;
  const it = { key, recipe: { t: 'v', m, a, hd, pv }, x, y, ext: [R + off + 2, R + h + off + 4, R + off + 2, R + off + 4] };
  if (extra) Object.assign(it, extra);
  return it;
}

// ---- small custom models ---------------------------------------------------------------------------------
function dumpster(col = '#2f6a54') {
  const m = new Vox(32, 18, 20), R = (h) => ramp(h, 6, 3);
  const g = m.mat({ ramp: R(col), k: 3, shade: (x, y, z) => (Math.round(x) % 8 === 0 ? -0.6 : 0) }), lid = m.mat({ ramp: R('#2a2e30'), k: 3 }), w = m.mat({ ramp: MAT.tyre, k: 2 });
  m.box(1, 1, 2, 31, 17, 16, g); m.box(0, 0, 16, 32, 18, 18, lid); for (const x of [4, 26]) m.cyl('y', x, 0, 2, 2, 1, 17, w);
  return m;
}
function trashBags(n = 3, seed = 1) {
  const m = new Vox(30, 24, 16), cols = ['#2a2a30', '#3a3a44', '#2e3a2e', '#2a2a30'];
  for (let i = 0; i < n; i++) { const r = mulberry32(seed * 31 + i); const mt = m.mat({ ramp: ramp(cols[i % 4], 6, 3), k: 3 }); m.ell(8 + r() * 14, 7 + r() * 10, 6, 6 + r() * 2, 5 + r() * 2, 5 + r() * 3, mt); }
  return m;
}
function pallets(seed = 1, n = 1) {
  const m = new Vox(28, 24, 6 + 6 * n), w = m.mat({ ramp: ramp('#a8865a', 6, 3), k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.8 : 0) });
  for (let i = 0; i < n; i++) { const z = i * 6; m.box(1, 2, z, 27, 22, z + 1, w); for (const y of [2, 11, 20]) m.box(1, y, z + 1, 27, y + 2, z + 4, w); m.box(1, 2, z + 4, 27, 22, z + 5, w); }
  return m;
}
function gravelPile(seed = 1) {
  const m = new Vox(40, 32, 14), mats = ['#9c968a', '#8a847a', '#b0aa9e', '#7a746a'].map((c) => m.mat({ ramp: ramp(c, 6, 3), k: 3 }));
  m.fill((x, y, z) => { const d = Math.hypot((x - 20) / 18, (y - 16) / 13); return d < 1 && z < 12 * (1 - d) ** 1.2 + 1 ? mats[Math.floor(hash(x | 0, (y | 0) + z * 7, seed) * 4)] : -1; });
  return m;
}
function rubblePile(seed = 1) {
  const m = new Vox(40, 32, 14), mats = ['#9a8a7a', '#8e4a3c', '#b8b2a6', '#6a645a'].map((c) => m.mat({ ramp: ramp(c, 6, 3), k: 3 }));
  m.fill((x, y, z) => { const d = Math.hypot((x - 20) / 17, (y - 16) / 13), b = hash(Math.floor(x / 4), Math.floor(y / 4), seed); return d < 1 && z < (9 + b * 5) * (1 - d * 0.8) ? mats[Math.floor(b * 4)] : -1; });
  return m;
}
function trashPile(seed = 1) {
  const m = new Vox(38, 28, 16), mats = ['#2a2a30', '#c8b896', '#8a6a4a', '#3a5a3a', '#d8d4cc', '#5a4a6a'].map((c) => m.mat({ ramp: ramp(c, 6, 3), k: 3 }));
  m.fill((x, y, z) => { const d = Math.hypot((x - 19) / 17, (y - 14) / 12), b = hash(Math.floor(x / 3), Math.floor(y / 3), seed + Math.floor(z / 4)); return d < 1 && z < (8 + b * 7) * (1 - d * 0.7) ? mats[Math.floor(b * 6)] : -1; });
  return m;
}
function pipeStack(seed = 1) {
  const m = new Vox(48, 24, 16), p = m.mat({ ramp: ramp(seed % 2 ? '#8a5a3a' : '#7a8a94', 6, 3), k: 3 }), hole = m.mat({ ramp: ramp('#2a2a30', 5, 2), k: 1 });
  for (const [y, z] of [[5, 4], [12, 4], [19, 4], [8.5, 10.5], [15.5, 10.5]]) m.cyl('x', 0, y, z, 3.5, 1, 47, p, 2, hole);
  return m;
}
function lumberStack(seed = 1, planks = 0) {
  const m = new Vox(60, 24, 18), w = m.mat({ ramp: ramp(planks ? '#b89a6a' : '#c8a070', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 || Math.round(y) % 6 === 0 ? -0.7 : 0) }), s = m.mat({ ramp: MAT.woodDark, k: 2 });
  for (const x of [6, 30, 52]) m.box(x, 2, 0, x + 3, 22, 3, s);
  m.box(1, 2, 3, 59, 22, 11 + (seed % 3) * 2, w);
  return m;
}
function crateStack(seed = 1) {
  const m = new Vox(32, 28, 30), cols = ['#a0703c', '#8a6a42', '#b08048'];
  const c = (i) => m.mat({ ramp: ramp(cols[i % 3], 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 7 === 0 || Math.round(x) % 7 === 0 ? -0.6 : 0) });
  m.box(1, 1, 0, 15, 15, 14, c(0)); m.box(16, 3, 0, 30, 17, 14, c(1)); m.box(8, 12, 0, 22, 26, 14, c(2)); if (seed % 2) m.box(4, 4, 14, 18, 18, 28, c(1));
  return m;
}
// a tiki torch: a bamboo pole, a woven cup and a flame (the beach bonfire, concept N11)
function tikiTorch() {
  const m = new Vox(8, 8, 48), bam = m.mat({ ramp: ramp('#b8945a', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -0.9 : 0) });
  const cup = m.mat({ ramp: ramp('#7a5a34', 6, 3), k: 3 }), fl = m.mat({ ramp: ramp('#f8a030', 5, 3), k: 4, emi: [255, 150, 50, 255], flag: F_NOCAST });
  m.box(3, 3, 0, 5, 5, 38, bam); m.box(2, 2, 37, 6, 6, 42, cup);
  m.fill((x, y, z) => (Math.hypot(x - 4, y - 4) < 2.2 - (z - 42) * 0.3 ? fl : -1), 1, 1, 42, 7, 7, 48);
  return m;
}
// a plain timber post (festoon lights hang from these)
function woodPost(h = 46) { const m = new Vox(6, 6, h + 2), w = m.mat({ ramp: ramp('#7a5434', 6, 3), k: 3 }); m.box(1, 1, 0, 5, 5, h, w); m.box(0, 0, h - 2, 6, 6, h, w); return m; }
// festoon lights: a sagging wire from the item's anchor (height h) to (tx, ty) (height h), warm bulbs every 10 px
function makeFestoon(r) {
  const { tx, ty, h } = r, G = new GBuf(Math.abs(tx) + 24, Math.abs(ty) + h + 24); G.ax = Math.max(0, -tx) + 12; G.ay = Math.max(0, -ty) + h + 12;
  wireLine(G, 0, 0, h, tx, ty, h, 10, [40, 36, 34]);
  const n = Math.max(2, Math.round(Math.hypot(tx, ty) / 10)), cols = [[255, 214, 140], [255, 190, 110], [255, 232, 170]];
  for (let i = 1; i < n; i++) {
    const t = i / n, X = tx * t, Y = ty * t, Z = h - 10 * 4 * t * (1 - t) - 2, px = Math.round(G.ax + X), py = Math.round(G.ay + Y - Z), c = cols[i % 3];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (G.inside(px + dx, py + dy)) G.put(px + dx, py + dy, c, [0, 0.3, 0.95], Z, [c[0], c[1], c[2], 255], F_NOCAST);
  }
  return G;
}
// a beach towel laid on the sand
function makeTowel(r) {
  const w = 18, h = 34, G = new GBuf(w, h); G.ax = w / 2; G.ay = h / 2;
  const a = [[216, 70, 60], [60, 120, 200], [240, 190, 60]][r.v || 0], b = [244, 240, 228];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G.put(x, y, Math.floor(y / 5) % 2 ? a : b, [0, 0, 1], 1, null, F_GROUND);
  return G;
}
// a creek bridge's rail: a stone kerb with timber posts and two rails (Redwood Creek, concepts N1-C/D)
function creekRail(len = 200) {
  const m = new Vox(len, 10, 26), st = m.mat({ ramp: ramp('#8e877a', 6, 3), k: 3, shade: (x, y, z) => ((Math.round(x) % 14 === 0 || Math.round(z) === 5) ? -0.8 : 0) + (hash(Math.round(x / 3), Math.round(z), 11) - 0.5) * 0.6 });
  const moss = m.mat({ ramp: ramp('#5a7a34', 6, 3), k: 3, flag: F_LEAF }), wd = m.mat({ ramp: ramp('#7a5434', 6, 3), k: 3, shade: (x) => (hash(Math.round(x), 2, 7) - 0.5) * 0.6 });
  m.box(0, 1, 0, len, 9, 10, st);
  for (let x = 2; x < len; x += 9) if (hash(x, 3, 5) > 0.55) m.box(x, 1, 9, x + 3 + hash(x, 4, 5) * 4, 9, 11, moss);
  for (let x = 6; x < len - 2; x += 30) m.box(x, 3, 10, x + 4, 7, 26, wd);
  m.box(2, 4, 17, len - 2, 6, 19, wd); m.box(2, 4, 23, len - 2, 6, 25, wd);
  return m;
}
function wheelStop() { const m = new Vox(26, 6, 4), c = m.mat({ ramp: ramp('#c8c4ba', 6, 3), k: 3 }), y = m.mat({ ramp: ramp('#e0b030', 6, 3), k: 3 }); m.box(1, 1, 0, 25, 5, 3, c); m.box(4, 1, 3, 8, 5, 4, y); m.box(18, 1, 3, 22, 5, 4, y); return m; }
function speakerPost() { const m = new Vox(10, 10, 22), p = m.mat({ ramp: MAT.metalDark, k: 2 }), b = m.mat({ ramp: ramp('#5a5e66', 6, 3), k: 3 }); m.box(4, 4, 0, 6, 6, 16, p); m.box(1, 3, 13, 9, 7, 21, b); return m; }
function marquee() {
  const m = new Vox(84, 10, 80), p = m.mat({ ramp: ramp('#2a2c34', 6, 3), k: 3 }), face = m.mat({ ramp: ramp('#e8e0c8', 6, 3), k: 4, emi: [255, 236, 190, 160], shade: (x, y, z) => ((Math.round(x) % 6 < 4 && z > 50 && z < 54) || (Math.round(x) % 5 < 3 && z > 40 && z < 44) ? -3 : 0) });
  const bulbs = m.mat({ ramp: ramp('#ffd070', 5, 3), k: 4, emi: [255, 210, 110, 255], flag: F_NOCAST });
  for (const x of [10, 72]) m.box(x, 4, 0, x + 3, 7, 70, p);
  m.box(2, 3, 34, 82, 8, 64, face); for (let x = 2; x < 82; x += 4) { m.box(x, 2, 64, x + 2, 3, 66, bulbs); m.box(x, 2, 32, x + 2, 3, 34, bulbs); }
  m.box(0, 3, 64, 84, 9, 70, p);
  return m;
}
function obsDome(r = 90) {
  const m = new Vox(r + 10, r + 10, Math.round(r * 0.8) + 30), c = (r + 10) / 2;
  const wall = m.mat({ ramp: ramp('#d8d4cc', 6, 3), k: 3 }), dome = m.mat({ ramp: ramp('#c8ccd4', 6, 3), k: 4, shade: (x, y) => (Math.round(Math.atan2(y - c, x - c) * 10) % 4 === 0 ? -0.5 : 0) }), slit = m.mat({ ramp: ramp('#2a2c34', 5, 2), k: 1 });
  m.cyl('z', c, c, 0, r / 2, 0, 28, wall);
  m.fill((x, y, z) => { const dd = Math.hypot(x - c, y - c, (z - 28) * 1.1); if (dd > r / 2 || z < 28) return -1; return Math.abs(x - c) < 5 && y > c ? slit : dome; }, 0, 0, 28, r + 10, r + 10, Math.round(r * 0.8) + 30);
  return m;
}
function portal(w = 100) {
  w = Math.min(w, 84);
  const m = new Vox(74, w + 4, 48), c = m.mat({ ramp: ramp('#8e8c84', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 10 === 0 ? -0.5 : 0) }), cap = m.mat({ ramp: ramp('#a9a9a2', 6, 3), k: 4 });
  const hole = m.mat({ ramp: ramp('#0c0d10', 4, 1), k: 0 }), haz = m.mat({ ramp: ramp('#ffd400', 5, 2), k: 3 });
  // retaining walls along the cutting, then the headwall with its black mouth
  m.box(0, 0, 0, 60, 8, 14, c); m.box(0, w - 4, 0, 60, w + 4, 14, c);
  m.box(60, 0, 0, 74, w + 4, 42, c); m.box(58, 0, 42, 74, w + 4, 46, cap);
  m.fill((x, y, z) => (y > 18 && y < w - 14 && z < 34 && x >= 60 ? (z > 31 && Math.round(y) % 8 < 4 ? haz : hole) : -1), 60, 0, 0, 74, w + 4, 34);
  return m;
}
function silo(h = 90) {
  const m = new Vox(44, 44, h + 22), s = m.mat({ ramp: ramp('#b8bcc0', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 ? -0.5 : 0) }), cap = m.mat({ ramp: ramp('#9aa0a6', 6, 3), k: 4 });
  m.cyl('z', 22, 22, 0, 19, 0, h, s); m.fill((x, y, z) => (Math.hypot(x - 22, y - 22) < 19 - (z - h) * 0.9 ? cap : -1), 0, 0, h, 44, 44, h + 22);
  return m;
}
function towerCrane(h = 200, jib = 120) {
  const m = new Vox(jib + 40, 30, h + 16), y = m.mat({ ramp: ramp('#e0b030', 6, 3), k: 3 }), cw = m.mat({ ramp: ramp('#8a8a86', 6, 3), k: 3 }), cab = m.mat({ ramp: ramp('#e8e4dc', 6, 3), k: 3 });
  const bx = 30;
  for (let z = 0; z < h; z++) for (const [x, yy] of [[bx - 5, 10], [bx + 4, 10], [bx - 5, 19], [bx + 4, 19]]) m.box(x, yy, z, x + 2, yy + 2, z + 1, y);
  for (let z = 0; z < h; z += 10) { m.box(bx - 5, 10, z, bx + 6, 11, z + 1, y); m.box(bx - 5, 20, z + 5, bx + 6, 21, z + 6, y); }
  m.box(2, 12, h, jib + 38, 18, h + 4, y); m.box(2, 11, h - 2, 26, 19, h, cw); m.box(bx - 6, 9, h - 10, bx + 7, 21, h, cab);
  m.box(bx - 1, 14, h + 4, bx + 2, 16, h + 15, y);
  return m;
}
// a mast-arm signal: pole at model (6, 7), arm along +x (length L) at z 82, a head on the pole and one housing
// per head distance in `heads` hanging from the arm; lenses unlit (the live signal colours are the host's)
function signalModel(L = 70, heads = []) {
  const m = new Vox(L + 10, 14, 92), R = (h) => ramp(h, 6, 3);
  const pole = m.mat({ ramp: MAT.metalDark, k: 2 }), box = m.mat({ ramp: R('#2c2c30'), k: 2 }), back = m.mat({ ramp: R('#d8b030'), k: 3 });
  const lens = ['#7a2a26', '#7a6420', '#246a3a'].map((c) => m.mat({ ramp: ramp(c, 5, 2), k: 1, flag: F_NOCAST }));
  m.cyl('z', 6, 7, 0, 3, 0, 4, pole); m.cyl('z', 6, 7, 0, 2, 4, 86, pole); m.box(6, 6, 82, L + 6, 8, 85, pole);
  const hd = (hx, z0) => { m.box(hx, 4, z0, hx + 7, 11, z0 + 22, box); m.box(hx - 1, 3, z0 - 1, hx + 8, 4, z0 + 23, back); for (let i = 0; i < 3; i++) m.box(hx + 2, 10, z0 + 16 - i * 7, hx + 5, 12, z0 + 20 - i * 7, lens[i]); };
  hd(10, 44);
  for (const d of heads) hd(clamp(Math.round(d) + 3, 14, L), 60);
  return m;
}

// ================================================================================================
// trees and plants: recipe { t: 'f', sp: species, s: seed, k: scale }
// ================================================================================================
// species: [maker(seed), sprite half-width, height at scale 1]
const LEAF_GOLD = [[220, 170, 50], [196, 132, 40], [232, 196, 80]];
const SPECIES = {
  street: [(s) => FL.streetTree(s, 'grate'), 46, 128], streetPl: [(s) => FL.streetTree(s, 'planter'), 46, 128], ginkgo: [FL.ginkgo, 40, 124], redMaple: [FL.redMaple, 44, 122],
  young: [FL.youngTree, 26, 114], flowerTree: [FL.flowerTree, 42, 124], magnolia: [FL.magnoliaTree, 44, 118], cherry: [FL.cherryTree, 42, 118], maple: [FL.mapleGreen, 48, 106],
  mapleAutumn: [FL.mapleAutumn, 48, 104], oak: [FL.bigOak, 66, 124], birch: [FL.birchClump, 48, 110], aspen: [FL.aspenGrove, 48, 112], willow: [FL.weepingWillow, 44, 106],
  apple: [FL.appleTree, 40, 92], orange: [FL.orangeTree, 40, 90], olive: [(s) => TR.olive(s, 92, 42), 48, 94], cypress: [(s) => TR.cypress(s, 112, 13), 18, 108],
  fir: [FL.douglasFir, 38, 134], cedar: [FL.westernRedCedar, 38, 138], pondPine: [FL.ponderosaPine, 32, 138], spruce: [FL.blueSpruce, 34, 122], redwood: [(s) => FL.redwood(s, 230), 70, 250],
  mtnPine: [FL.mountainPine, 36, 150], mtnFir: [FL.mountainFir, 40, 157], whitePine: [FL.whitebarkPine, 50, 114], larch: [FL.goldenLarch, 38, 154],
  mesquite: [FL.mesquite, 48, 116], paloVerde: [FL.paloVerde, 54, 115], joshua: [FL.joshuaTree, 52, 101], deadSnag: [FL.deadSnag, 38, 77],
  coconut: [FL.coconutPalm, 76, 151], royal: [FL.royalPalm, 56, 150], leaning: [FL.leaningPalm, 110, 133], fanSkirt: [FL.fanPalmSkirt, 52, 126], date: [FL.datePalm, 40, 92], desertFan: [FL.desertFanPalm, 38, 78],
  smallPalm: [(s) => TR.fanPalm(s, 46), 36, 76], coastCypress: [FL.coastalCypress, 80, 98], banana: [FL.banana, 60, 99],
  // shrubs, bushes and flowers
  hedge: [FL.hedge, 38, 51], topBall: [FL.topiaryBall, 20, 57], topCone: [FL.topiaryCone, 17, 66], rose: [FL.roseBush, 24, 41], hydrangea: [FL.hydrangea, 27, 41], lavender: [FL.lavender, 28, 45],
  tulips: [FL.tulipPlanter, 26, 41], daffodils: [FL.daffodilPlanter, 27, 41], boxStone: [(s) => FL.flowerBox(s, 'stone'), 34, 41], boxIron: [(s) => FL.flowerBox(s, 'iron'), 33, 38], pampas: [FL.pampasGrass, 56, 89],
  fern: [FL.swordFern, 38, 40], bracken: [FL.deadBracken, 36, 38], salal: [FL.salal, 33, 44], huckle: [FL.huckleberry, 32, 43], berry: [FL.wildBerry, 30, 45], foxglove: [FL.foxglove, 21, 63],
  creosote: [FL.creosote, 39, 56], sage: [FL.sagebrush, 34, 48], brittle: [FL.brittlebush, 35, 48], bursage: [FL.whiteBursage, 35, 44], dPoppies: [FL.desertPoppies, 35, 30], dFlowers: [FL.desertFlowers, 36, 48],
  dryGrass: [FL.dryGrass, 28, 38], tumble: [FL.tumbleweed, 18, 32], agave: [FL.agave, 29, 39], yucca: [FL.yucca, 33, 62], pear: [FL.pricklyPear, 46, 57], barrel: [FL.barrelCacti, 23, 36], cholla: [FL.cholla, 36, 52],
  ocotillo: [FL.ocotillo, 36, 93], saguaroBig: [(s) => FL.saguaro(s, 128), 34, 140], saguaroMid: [FL.saguaroMid, 18, 80], saguaroSmall: [FL.saguaroSmall, 12, 52],
  hibiscus: [FL.hibiscus, 41, 58], bougain: [FL.bougainvillea, 41, 74], monstera: [FL.monstera, 35, 58], elephant: [FL.elephantEar, 33, 51], bird: [FL.birdOfParadise, 45, 83],
  duneGrass: [FL.duneGrass, 48, 61], beachGrass: [FL.beachGrass, 43, 45], icePlant: [FL.icePlant, 56, 33], flHedge: [FL.floweringHedge, 62, 55], poppies: [FL.poppies, 33, 45], lupines: [FL.lupines, 27, 64],
  daisies: [FL.daisies, 35, 37], tallGrass: [FL.tallGrass, 51, 57], cattails: [FL.cattails, 27, 69], reeds: [FL.reeds, 26, 70], juniper: [FL.juniperMat, 63, 53], twisted: [FL.twistedShrub, 46, 73],
  berryShrub: [FL.berryShrub, 40, 56], aLupine: [FL.alpineLupine, 27, 60], paintbrush: [FL.paintbrush, 27, 51], heather: [FL.heather, 31, 36], aDaisies: [FL.alpineDaisies, 31, 33],
  sunflowers: [FL.sunflowers, 35, 69], wildflowers: [(s) => FL.wildflowerLawn(s), 68, 47],
};
const BASED = new Set(['street', 'streetPl', 'flowerTree', 'young', 'ginkgo', 'cherry', 'magnolia', 'redMaple']);   // drawn with a grate or planter
function makeFlora(r) {
  const sp = SPECIES[r.sp];
  if (!sp) return EMPTY;
  const k = r.k || 1, mk = () => (r.bare ? FL.floraBare(() => sp[0](r.s)) : sp[0](r.s));
  let G = k !== 1 && FL.floraScale ? FL.floraScale(k, mk) : mk();
  if (G && G.render) G = G.render(0);
  return G;
}
function fitem(key, sp, seed, x, y, k = 1, extra = null, bare = false) {
  const S = SPECIES[sp] || [null, 30, 60];
  if (bare && BASED.has(sp)) key += ':n'; else bare = false;
  const it = { key, recipe: bare ? { t: 'f', sp, s: seed, k, bare: 1 } : { t: 'f', sp, s: seed, k }, x, y, ext: [Math.ceil(S[1] * k) + 10, Math.ceil(S[2] * k) + 16, Math.ceil(S[1] * k) + 10, 30] };
  if (extra) Object.assign(it, extra);
  return it;
}
// the species for a planted prop by where it stands: biome (terrain class), district style and zone
const WILDS = new Set(['wild', 'rural', 'desert', 'airport', 'water', 'rocky']);
function plantFor(c, p) {
  if (p.sp) return [p.sp, p.k ?? 1.3];   // (the species set by the map: the hero corner's trees)
  const D = c.dist(p.x, p.y), st = D.style, bio = c.biome(p.x, p.y), u = hh(p.x, p.y, 41), u2 = hh(p.y, p.x, 43), t = p.t;
  const di = c.di(p.x, p.y), tile = c.at(p.x, p.y), wild = WILDS.has(st);
  // the terrain classes only mean something out of town: in the city the district decides
  const desert = st === 'desert' || di === 41 || (wild && bio === 3 && !SEA_ISLES.has(di)), mountain = di === 33 || (wild && bio === 4), sand = tile === T.SAND || (wild && bio === 5), forest = wild && bio === 2;
  const coastal = st === 'beach' || di === 14 || di === 43 || di === 44 || di === 45 || (c.M.distSea && c.M.distSea[Math.floor(p.y / TILE) * c.W + Math.floor(p.x / TILE)] < 24);
  const paved = tile === T.SIDEWALK || tile === T.PLAZA;
  if (t === 'tree_a' || t === 'tree_b') {
    if (desert) return [pick(['mesquite', 'paloVerde', 'joshua', 'joshua', 'deadSnag', 'mesquite'], u), 1.15];
    if (mountain && (p.g ?? -1) < 0) return [pick(['mtnPine', 'mtnFir', 'whitePine', 'mtnFir', 'mtnPine', 'larch', 'mtnFir', 'mtnPine', 'whitePine', 'mtnPine'], u), 1.4]; // (no snowy species: no snow biome for now)
    // (p.g: the stand the map put it in - one kind of tree over a wide area: 0 conifers, 1 mixed, 2 broadleaf,
    // 3 birch and aspen)
    const g = p.g ?? -1;
    if (di === 29 && wild && forest) return g === 2 ? [pick(['maple', 'oak', 'maple'], u), 1.4 + u2 * 0.2] : g === 3 ? [pick(['birch', 'aspen'], u), 1.35] : [pick(['redwood', 'redwood', 'cedar', 'redwood', 'fir'], u), u < 0.45 ? 1.1 : 1.4];
    if (wild && forest) {
      if (g === 0) return [pick(['fir', 'cedar', 'pondPine', 'fir', 'spruce'], u), 1.45 + u2 * 0.3];
      if (g === 2) return [pick(['oak', 'maple', 'oak', 'mapleAutumn', 'maple'], u), 1.4 + u2 * 0.25];
      if (g === 3) return [pick(['birch', 'aspen', 'birch'], u), 1.35 + u2 * 0.2];
      return [pick(['fir', 'cedar', 'pondPine', 'fir', 'oak', 'birch', 'aspen', 'spruce'], u), 1.45 + u2 * 0.3];
    }
    if (mountain) return g === 3 ? ['aspen', 1.3] : g === 2 ? [pick(['larch', 'whitePine'], u), 1.4] : [pick(['mtnPine', 'mtnFir', 'whitePine', 'mtnFir', 'mtnPine'], u), 1.4];
    if (sand || (coastal && wild)) return [pick(['coconut', 'leaning', 'coastCypress'], u), 1.25];
    if (wild) {
      const wet = c.M.distRiver && c.M.distRiver[Math.floor(p.y / TILE) * c.W + Math.floor(p.x / TILE)] < 20;
      if (wet && g >= 2) return [pick(['willow', 'willow', 'birch'], u), 1.35];
      return g === 0 ? [pick(['pondPine', 'cedar'], u), 1.4] : g === 3 ? [pick(['birch', 'aspen', 'apple'], u), 1.3] : [pick(['oak', 'maple', 'oak', 'apple'], u), 1.35 + u2 * 0.25];
    }
    if (st === 'park') return [pick(c.M.lake && c.M.lake[Math.floor(p.y / TILE) * c.W + Math.floor(p.x / TILE)] ? ['willow'] : ['oak', 'maple', 'oak', 'willow', 'cherry', 'mapleAutumn', 'redMaple'], u), 1.4 + u2 * 0.2];
    if (st === 'beach' || coastal) return [pick(['coconut', 'royal', 'leaning', 'fanSkirt'], u), 1.25];
    if (st === 'luxury') return [t === 'tree_a' ? pick(['royal', 'royal', 'cypress', 'olive', 'magnolia'], u) : pick(['magnolia', 'flowerTree', 'cypress', 'olive'], u), 1.3];
    if (st === 'oldtown') return [pick(['cherry', 'olive', 'cypress', 'magnolia', 'flowerTree', 'street'], u), 1.3];
    if (st === 'houses' || st === 'rural') return [pick(t === 'tree_a' ? ['oak', 'maple', 'birch', 'mapleAutumn', 'flowerTree', 'apple'] : ['cherry', 'magnolia', 'maple', 'oak', 'redMaple'], u), 1.35];
    if (st === 'southside' || st === 'industrial' || st === 'factory' || st === 'harbor') return [pick(['young', 'maple', 'young', 'street', 'deadSnag'], u), 1.25];
    if (st === 'nightlife' || st === 'redlight') return [pick(['royal', 'street', 'ginkgo', 'coconut'], u), 1.3];
    return [paved ? pick(t === 'tree_a' ? ['street', 'street', 'ginkgo', 'young', 'redMaple'] : ['street', 'flowerTree', 'magnolia', 'ginkgo'], u) : pick(['streetPl', 'maple', 'flowerTree', 'oak'], u), 1.3];
  }
  if (t.startsWith('palm')) {
    if (desert) return [t === 'palm_s' ? 'desertFan' : pick(['date', 'desertFan', 'date'], u), 1.4];
    if (t === 'palm_s') return [pick(['smallPalm', 'smallPalm', 'banana', 'bird'], u), 1];
    if (t === 'palm_d') return [pick(['fanSkirt', 'date', 'fanSkirt'], u), 1.2];
    if (t === 'palm_c') return ['leaning', 1.3];
    return [t === 'palm_b' ? 'royal' : pick(['coconut', 'coconut', 'leaning'], u), 1.3 + u2 * 0.25];
  }
  if (t === 'cactus') return [pick(['saguaroBig', 'saguaroMid', 'pear', 'barrel', 'cholla', 'ocotillo', 'saguaroSmall', 'agave', 'yucca'], u), 1];
  if (t === 'shrub_a' || t === 'shrub_b' || t === 'bush_a' || t === 'bush_b' || t === 'bush_c') {
    const a = t === 'shrub_a' || t === 'bush_a';
    if (desert) return [pick(a ? ['creosote', 'sage', 'brittle', 'agave', 'yucca'] : ['bursage', 'dryGrass', 'tumble', 'sage', 'pear'], u), 1];
    if (mountain) return [pick(a ? ['juniper', 'twisted', 'heather', 'berryShrub'] : ['berryShrub', 'juniper', 'heather', 'twisted'], u), 1];
    if (wild && forest) return [pick(a ? ['salal', 'huckle', 'fern', 'berry', 'fern'] : ['fern', 'bracken', 'salal', 'foxglove', 'berry'], u), 1.1];
    if (sand || st === 'beach' || coastal) return [pick(a ? ['hibiscus', 'bougain', 'duneGrass', 'monstera'] : ['beachGrass', 'icePlant', 'duneGrass', 'elephant'], u), 1];
    if (wild) return [pick(a ? ['berryShrub', 'tallGrass', 'salal', 'berry'] : ['tallGrass', 'pampas', 'berry', 'fern'], u), 1.1];
    if (st === 'luxury') return [pick(a ? ['topBall', 'topCone', 'hydrangea', 'rose'] : ['topBall', 'lavender', 'rose', 'flHedge'], u), 1];
    if (st === 'houses') return [pick(a ? ['rose', 'hydrangea', 'lavender', 'topBall', 'flHedge'] : ['hydrangea', 'rose', 'berryShrub', 'lavender'], u), 1.05];
    if (st === 'park') return [pick(['hydrangea', 'rose', 'flHedge', 'pampas', 'lavender', 'berryShrub'], u), 1.1];
    if (st === 'southside' || st === 'industrial' || st === 'harbor' || st === 'factory') return [pick(['tallGrass', 'dryGrass', 'berryShrub', 'pampas'], u), 1];
    if (t === 'bush_b') return [pick(['monstera', 'elephant', 'hibiscus'], u), 1];
    return [pick(a ? ['topBall', 'hydrangea', 'rose', 'flHedge', 'lavender'] : ['flHedge', 'topBall', 'rose', 'lavender'], u), 1];
  }
  if (t === 'flowers_a' || t === 'flowers_big') {
    if (desert) return [pick(['dFlowers', 'dPoppies', 'dFlowers'], u), 1];
    if (mountain) return [pick(['aLupine', 'paintbrush', 'aDaisies', 'heather'], u), 1];
    if (wild) return [pick(['poppies', 'lupines', 'daisies', 'wildflowers', 'sunflowers'], u), 1];
    if (t === 'flowers_big') return [pick(['boxStone', 'bougain', 'rose', 'sunflowers', 'boxIron'], u), 1];
    return [pick(paved ? ['tulips', 'daffodils', 'boxStone', 'boxIron'] : ['poppies', 'daisies', 'lupines', 'tulips', 'lavender'], u), 1];
  }
  return null;
}
const PLANTS = new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'flowers_a', 'flowers_big', 'cactus']);
const NV5 = new Set(['street', 'streetPl', 'oak', 'fir', 'cedar', 'coconut', 'royal', 'mtnPine', 'maple']), NV = (sp) => (NV5.has(sp) ? 4 : 3);

// ================================================================================================
// props
// ================================================================================================
// a lit shopfront's light on the pavement: from the door, and on a wide front from along its windows too
function shopSpill(lights, w, dx) {
  if (w < 200) { lights.push([dx, 16, 26, 150, [1, 0.8, 0.52], 1.5, 'window']); return; }
  for (const x of [w * 0.28, w * 0.72]) lights.push([x, 18, 26, 160, [1, 0.8, 0.52], 1.4, 'window']);
}
const LAMP_LIGHT = { cobra: [1, 0.93, 0.8], green: [1, 0.86, 0.62], sodium: [1, 0.7, 0.38], cast: [1, 0.8, 0.52], iron: [1, 0.62, 0.3], banner: [1, 0.84, 0.58], twin: [1, 0.9, 0.72] };
function lampStyle(c, p) {
  if (p.style) return p.style;   // (set by the map: the hero corner's black iron lamps)
  const st = c.dist(p.x, p.y).style;
  if (st === 'oldtown' || st === 'civic' || st === 'park' || st === 'luxury') return 'cast';
  if (st === 'towers') return 'banner';
  if (st === 'nightlife' || st === 'redlight' || st === 'beach') return 'twin';
  if (st === 'southside' || st === 'industrial' || st === 'harbor' || st === 'factory' || st === 'rural' || WILDS.has(st)) return 'sodium';
  if (st === 'commercial' || st === 'apartments') return 'green';
  return 'cobra';
}
function propItems(c, p, pi, I) {
  const t = p.t, x = p.x, y = p.y, u = hh(x, y, 7), seed = Math.floor(hh(x, y, 9) * 6);
  const V = (key, m, a, hd = 0, pv = null, extra = null) => put(I, vitem(key, m, a, x, y, hd, pv, { pi, ...(extra || {}) }));
  if (PLANTS.has(t)) {
    const r = plantFor(c, p);
    if (!r) return;
    const [sp, k0] = r, k = Math.round(k0 * 5) / 5, v = Math.floor(hh(x, y, 13) * NV(sp)), tl = c.at(x, y);
    put(I, fitem(`f:${sp}:${v}:${k}`, sp, 1000 + v * 37 + sp.length * 7, x, y, k, { pi }, tl !== T.SIDEWALK && tl !== T.PLAZA));
    return;
  }
  switch (t) {
    case 'lamp': case 'plamp': {
      if (p.wall) { V(`wl:${qa(p.a ?? 0, 8).toFixed(2)}`, 'wallLamp', [1, 46], qa((p.a ?? 0) - PI / 2, 8)); const hx = x + Math.cos(p.a ?? 0) * 8, hy = y + Math.sin(p.a ?? 0) * 8; lightAt(I, hx, hy, 44, 140, [1, 0.85, 0.6], 2.2, 'lamp'); return; }
      const style = lampStyle(c, p), a = t === 'plamp' ? Math.atan2(p.hy - y, p.hx - x) : (p.a ?? -PI / 2);
      if (style === 'cast' || style === 'iron' || style === 'banner') {
        const post = style !== 'banner', m = post ? 'lampPost' : 'bannerLamp', args = post ? [style, 1] : [1, pick(['#2a3e7a', '#7a2a3a', '#2a5a4a'], hh(x >> 8, y >> 8, 5))];
        V(`lp:${style}:${args[1]}`, m, args, 0, style === 'banner' ? [6, 6] : null);
        lightAt(I, x, y + 2, post ? 76 : 84, style === 'iron' ? 175 : 200, LAMP_LIGHT[style], style === 'iron' ? 6 : 3.4, 'lamp');   // (iron: the hero corner's deep amber pools, crisp edged)
        return;
      }
      if (style === 'twin') { const h = qa(a + PI / 2, 8); V(`lp:twin:${h.toFixed(2)}`, 'twinLamp', [1], h); lightAt(I, x, y + 2, 92, 220, LAMP_LIGHT.twin, 3.6, 'lamp'); return; }
      const arm = t === 'plamp' ? clamp(Math.round(Math.hypot(p.hx - x, p.hy - y) / 4) * 4, 16, 40) : 28, hd = qa(a, 32);
      V(`lp:${style}:${arm}:${hd.toFixed(3)}`, 'armLamp', [arm, 1, style], hd, [3.5, 5]);
      lightAt(I, x + Math.cos(a) * (arm + 4), y + Math.sin(a) * (arm + 4), 90, 220, LAMP_LIGHT[style], 3.6, 'lamp');
      return;
    }
    case 'sigpole': if (!c.armed.has(pi)) V(`sgp:${qa(p.a || 0, 16).toFixed(2)}`, 'signal', [60, [48]], qa(p.a || 0, 16), [6, 7]); return;
    case 'hydrant': V('hyd', 'hydrant', []); return;
    case 'trashcan': V(`bin:${seed & 1}`, seed & 1 ? 'bin' : 'wireBin', [true]); return;
    case 'dump_g': case 'dump_b': case 'dump_o': { const col = { dump_g: '#2f6a54', dump_b: '#2f4a7a', dump_o: '#b8682a' }[t], hd = c.roadDir(x, y) !== null ? qa(c.roadDir(x, y) - PI / 2, 4) : 0; V(`dmp:${t}:${hd.toFixed(2)}`, 'dumpster', [col], hd); return; }
    case 'tires': V(`tir:${seed % 3}`, 'tires', [2 + seed % 3]); return;
    case 'mailbox': V(`mb:${seed % 3}`, 'mailbox', [pick(['#2c3a66', '#3a3a40', '#8a2a2e'], seed / 6)]); return;
    case 'bench_a': case 'bench_b': case 'bench_m': case 'pbench': { const rd = c.roadDir(x, y, 3), hd = rd !== null ? qa(rd - PI / 2, 4) : qa(Math.floor(u * 4) * PI / 2, 4); V(`bn:${hd.toFixed(2)}`, 'bench', [], hd); return; }
    case 'bags': V(`bags:${seed % 3}`, 'trashBags', [2 + seed % 3, seed]); return;
    case 'phonebox': V('phone', 'phoneBooth', [1]); lightAt(I, x, y + 4, 48, 70, [0.85, 1, 0.85], 0.9, 'sign'); return;
    case 'atmw': { const col = { neon: '#e83a9a', kiosk: '#3a6ab0' }[p.v] || null; V('atm', 'atmWall', [1]); lightAt(I, x, y + 8, 32, 60, [0.5, 0.8, 1], 0.9, 'sign'); void col; return; }
    case 'trashpile': V(`tp:${seed % 3}`, 'trashPile', [seed % 3]); return;
    case 'mosaic': put(I, { key: `mos:${seed % 3}`, recipe: { t: 'flat', k: 'mosaic', w: 56, h: 44, s: seed % 3 }, x, y, ext: [30, 26, 30, 26], pi }); return;
    case 'pallet': case 'pallet_b': case 'pallet_s': V(`pal:${t}:${seed % 2}`, 'pallets', [seed, t === 'pallet_s' ? 1 : t === 'pallet_b' ? 3 : 2], qa(u * TAU, 4)); return;
    case 'drum': V(`drm:${seed % 3}`, 'oilDrum', [pick(['#3a5a8a', '#4a6a3a', '#8a3a2a'], seed / 6), seed % 2]); return;
    case 'planter_g': V('plg', 'planter', [true]); return;
    case 'planter_sq': V('plsq', 'planterBox', [30, 30, true]); return;
    case 'planter_fl': V('plfl', 'planterBox', [44, 22, true]); return;
    case 'potted': V('pot', 'pottedPalm', []); return;
    case 'umbrella_y': case 'umbrella_b': case 'umbrella_r': case 'umbrella_g': { const col = { umbrella_y: '#e8c040', umbrella_b: '#2f6ab0', umbrella_r: '#c8343a', umbrella_g: '#2f7a5c' }[t]; V(`umb:${t}`, 'umbrella', ['#f0ece4', col]); return; }
    case 'rubble': V(`rub:${seed % 3}`, 'rubble', [seed % 3]); return;
    case 'gravel': V(`grv:${seed % 3}`, 'gravel', [seed % 3]); return;
    case 'acunit': V('acu', 'acUnit', []); return;
    case 'news_a': case 'news_b': case 'news_c': V(`nws:${t}`, 'newsBox', [{ news_a: '#c8343a', news_b: '#2f5aa8', news_c: '#e8c040' }[t]]); return;
    case 'busstop': V(`bus:${p.face === 'N' ? 1 : 0}`, 'busShelter', [72, 1], p.face === 'N' ? PI : 0); lightAt(I, x, y + (p.face === 'N' ? -6 : 6), 40, 90, [0.85, 0.92, 1], 1.1, 'sign'); return;
    case 'bollard': V('bol', 'bollard', [12]); return;
    case 'spool': V('spl', 'cableSpool', []); return;
    case 'bikerack': V('bkr', 'bikeRack', [3]); return;
    case 'crates': V(`crt:${seed % 2}`, 'crates', [seed % 2]); return;
    case 'foodcart': V('fc', 'hotdogCart', [1]); lightAt(I, x, y + 6, 40, 70, [1, 0.8, 0.5], 0.8, 'sign'); return;
    case 'tent': { const col = ['#e07b20', '#3f8a3a', '#2f6fc8'][p.v || 0]; V(`tent:${p.v || 0}`, 'tent', [col]); return; }
    case 'campfire': V(`cf:${p.lit ? 1 : 0}`, 'campfire', [p.lit ? 1 : 0]); if (p.lit) lightAt(I, x, y, 14, p.big ? 220 : 150, LIGHT.fire, p.big ? 3 : 2.2, 'fire', 0); return;
    case 'picnic': V('pic', 'picnic', [], qa(u * PI, 2)); return;
    case 'billboard': put(I, { key: `bb:${(p.ad || 0) % ADS.length}`, recipe: { t: 'grp', parts: [[{ t: 'v', m: 'bbframe', a: [] }, 0, 0, 0], [{ t: 'sign', k: 'ad', ad: (p.ad || 0) % ADS.length, w: 132, h: 54, z: 36 }, 0, 2, 0]] }, x, y, ext: [82, 170, 82, 76], pi }); lightAt(I, x, y + 8, 110, 140, [1, 0.96, 0.85], 1.2, 'sign'); return;
    case 'pipes': V(`pip:${seed % 2}`, 'pipes', [seed % 2], qa(u * PI, 2)); return;
    case 'lumber': case 'planks': V(`lum:${t}:${seed % 3}`, 'lumber', [seed % 3, t === 'planks' ? 1 : 0], qa(u * PI, 2)); return;
    case 'pumpjack': V(`pj:${Math.floor((p.ph || 0) * 4)}`, 'pumpJack', [Math.floor((p.ph || 0) * 4) / 4]); return;
    case 'fountain': V('fnt', 'fountain', [30, 2]); return;
    case 'cone': V('cone', 'cone', []); return;
    case 'turbine': V(`trb:${Math.floor((p.ph || 0) * 6)}`, 'turbine', [230, 70, (p.ph || 0) * TAU]); lightAt(I, x, y, 236, 60, [1, 0.15, 0.1], 1.2, 'sign', 1); return;
    case 'vend_cola': V('vend', 'vending', ['#c8242a', 1]); lightAt(I, x, y + 6, 30, 60, [1, 0.6, 0.55], 0.9, 'sign'); return;
    case 'wheelbarrow': V('whb', 'wheelbarrow', [], qa(u * TAU, 4)); return;
    case 'plane': V(`pln:${qa(p.a ?? -PI / 2, 8).toFixed(2)}`, 'airliner', [300, 270, pick(['#c83a30', '#2a5aa8', '#2a8a6a'], u)], qa(p.a ?? -PI / 2, 8)); return;
    case 'radiotower': V('rt', 'cellTower', [190]); lightAt(I, x, y, 196, 70, [1, 0.15, 0.1], 1.4, 'sign', 1); return;
    case 'otank': V('otk', 'tank', [46, 96, '#a8acb0']); return;
    case 'scope': V('scp', 'viewer', []); return;
    case 'dome': V('dome', 'dome', [150]); lightAt(I, x, y + 40, 40, 120, [1, 0.85, 0.6], 1, 'window'); return;
    case 'flare': V('flr', 'flare', [1]); lightAt(I, x, y, 92, 200, LIGHT.fire, 2.4, 'fire', 0); return;
    case 'dscreen': V('dsc', 'screen', [200, 100]); lightAt(I, x, y + 10, 60, 180, [0.7, 0.8, 1], 1.4, 'sign'); return;
    case 'marquee': V('mrq', 'marquee', []); lightAt(I, x, y + 6, 50, 110, [1, 0.84, 0.5], 1.6, 'neon'); return;
    case 'dspeaker': V('spk', 'speaker', []); return;
    case 'upole': {
      const h = 116, hd = p.wx !== undefined ? qa(Math.atan2(p.wy - y, p.wx - x) + PI / 2, 32) : qa(u * PI, 8);
      if (p.wx !== undefined) {
        const dx = Math.round(p.wx - x), dy = Math.round(p.wy - y);
        put(I, { key: `up:${dx}:${dy}:${hd.toFixed(3)}`, recipe: { t: 'wire', h, arm: 14, hd, to: [dx, dy] }, x, y, ext: [Math.max(0, -dx) + 44, h + 44 + Math.max(0, -dy), Math.max(0, dx) + 44, Math.max(0, dy) + 44], pi });
      } else V(`up:${hd.toFixed(3)}`, 'powerPole', [h, 14], hd);
      return;
    }
    case 'solar': V('sol', 'solar', [56, 26]); return;
    case 'rwlight': { const col = { w: '#f0eee0', g: '#3ae070', r: '#e83a30', b: '#3a6ae8' }[p.c] || '#f0eee0'; V(`rw:${p.c}`, 'runwayLight', [col]); lightAt(I, x, y, 6, 50, L01(col), 1.1, 'lamp', 1); return; }
    case 'boulder': {
      const bio = c.biome(x, y), st = c.dist(x, y).style, size = p.s || [20, 26, 34][Math.floor(hh(x, y, 17) * 3)]; // (p.s: an outcrop)
      if (!WILDS.has(st)) { V(`bld:${size}:${seed % 3}`, 'boulder', [seed % 3 + 1, size - 4, pick(['#8a8478', '#7a7068', '#9a9488'], seed / 6)]); return; }
      const isle = SEA_ISLES.has(c.di(x, y)), style = p.style || (isle ? 'basalt' : bio === 3 || st === 'desert' ? 'sandstone' : bio === 5 ? 'basalt' : 'granite'), moss = p.moss || bio === 2 ? 1 : 0, barn = p.barn ? 1 : 0;
      put(I, { key: `rk:${style}:${size}:${seed % 2}:${moss}:${barn}`, recipe: { t: 'rock', style, size, s: seed % 2, moss: moss ? 0.5 : 0, barn }, x, y, ext: [size * 1.4 + 16, size * 1.8 + 24, size * 1.4 + 16, size + 14], pi });
      return;
    }
    case 'mapboard': V('mapb', 'mapBoard', []); return;
    case 'logcabin': V('lcab', 'logCabin', [96, 60, 0.6]); lightAt(I, x, y + 8, 22, 120, [1, 0.78, 0.46], 1.4, 'window'); return;
    case 'lookout': V('lkout', 'lookout', [110, 0.6]); lightAt(I, x, y, 130, 140, [1, 0.82, 0.5], 1.2, 'window'); return;
    case 'outcrop': put(I, { key: `oc:${p.style || 'granite'}:${p.w || 80}:${p.d || 50}:${p.h || 46}:${(p.s || 1) % 4}`, recipe: { t: 'outcrop', style: p.style || 'granite', w: p.w || 80, d: p.d || 50, h: p.h || 46, s: (p.s || 1) % 4 }, x, y, ext: [(p.w || 80) / 2 + 16, (p.h || 46) + (p.d || 50) / 2 + 20, (p.w || 80) / 2 + 16, (p.d || 50) / 2 + 16], pi }); return;
    case 'rail': fenceLine(I, 'rail', x, y, x + (p.tx || 0), y + (p.ty || 0)); return;
    case 'chair': V(`chr:${p.v || 0}:${qa(p.a || 0, 8).toFixed(2)}`, 'chair', [p.v || 0], qa(p.a || 0, 8)); return;
    case 'cooler': V(`col:${p.v || 0}`, 'cooler', [p.v || 0], qa(u * TAU, 4)); return;
    case 'woodpile': V('wpile', 'woodpile', [], qa(u * PI, 2)); return;
    case 'surfboard': V(`surf:${p.v || 0}`, 'surfboard', [p.v || 0], qa(0.3 + u, 8)); return;
    case 'towel': put(I, { key: `towel:${p.v || 0}`, recipe: { t: 'towel', v: p.v || 0 }, x, y, ext: [12, 20, 12, 20], pi }); return;
    case 'torch': V('tiki', 'tiki', []); lightAt(I, x, y, 46, 120, LIGHT.fire, 1.6, 'fire', 0); return;
    case 'post': V(`post:${p.h || 46}`, 'post', [p.h || 46]); return;
    case 'windmill': V('wmill', 'windmill', [120]); return;
    case 'trough': V('trough', 'trough', []); return;
    case 'festoon': {
      const tx = p.tx || 0, ty = p.ty || 0, h = p.h || 40;
      put(I, { key: `fest:${tx}:${ty}:${h}`, recipe: { t: 'festoon', tx, ty, h }, x, y, ext: [Math.max(0, -tx) + 16, h + Math.max(0, -ty) + 16, Math.max(0, tx) + 16, Math.max(0, ty) + 16], pi });
      for (let k = 1; k < 4; k++) lightAt(I, x + tx * k / 4, y + ty * k / 4, h - 6, 90, [1, 0.8, 0.5], 0.9, 'window');
      return;
    }
    case 'cottage': V(`cot:${p.w || 84}:${p.d || 54}`, 'cottage', [p.w || 84, p.d || 54, 0.6]); lightAt(I, x, y + 6, 22, 110, [1, 0.8, 0.5], 1.4, 'window'); return;
    case 'seal': { const coat = Math.floor(hh(x, y, 21) * 3); V(`seal:${p.pose || 0}:${coat}:${qa(p.a || 0, 8).toFixed(2)}`, 'seal', [p.pose || 0, coat], qa(p.a || 0, 8), null, { z0: p.z || 0 }); return; }
    case 'gull': V(`gull:${qa(p.a || 0, 8).toFixed(2)}`, 'gull', [], qa(p.a || 0, 8), null, { z0: p.z || 0 }); return;
    case 'crab': V(`crab:${qa(p.a || 0, 8).toFixed(2)}`, 'crab', [], qa(p.a || 0, 8)); return;
    case 'driftwood': V(`dw:${p.len || 50}:${qa(p.a || 0, 8).toFixed(2)}`, 'driftwood', [p.len || 50, 1], qa(p.a || 0, 8)); return;
    case 'starfish': case 'urchin': case 'anemone': {
      const v = p.v || 0, col = t === 'starfish' ? ['#d8583a', '#e8a040', '#c84a8a', '#d8583a'][v] : t === 'urchin' ? ['#3a2448', '#5a2a5a', '#3a2448', '#2a3a5a'][v] : null;
      put(I, { key: `crit:${t}:${v}`, recipe: { t: 'crit', k: t, col, s: v + 1 }, x, y, ext: [12, 12, 12, 12], pi });
      return;
    }
    case 'seastack': put(I, { key: `stack:${p.s || 1}:${p.r || 26}:${p.h || 150}`, recipe: { t: 'stack', s: p.s || 1, r: p.r || 26, h: p.h || 150 }, x, y, ext: [(p.r || 26) * 1.6 + 10, (p.h || 150) + 40, (p.r || 26) * 1.6 + 10, (p.r || 26) + 20], pi }); return;
    case 'sealrock': put(I, { key: `srock:${p.w || 120}:${p.d || 70}`, recipe: { t: 'sealrock', w: p.w || 120, d: p.d || 70, h: 26, s: 3 }, x, y, ext: [(p.w || 120) / 2 + 16, 80, (p.w || 120) / 2 + 16, (p.d || 70) / 2 + 20], pi }); return;
    case 'lantern': V('lant', 'lantern', ['post', 1]); lightAt(I, x, y, 30, 110, [1, 0.78, 0.46], 1.4, 'lamp'); return;
    case 'log': { // a fallen log at the edge of a grove (mossy in the woods)
      const len = clamp(Math.round((p.len || 110) / 20) * 20, 80, 160), hd = qa(p.a || 0, 8), mossy = p.moss || c.biome(x, y) === 2 ? 1 : 0;
      V(`log:${len}:${hd.toFixed(2)}:${mossy}:${seed % 2}`, 'fallenLog', [len, 11, 1 + (seed % 2), mossy], hd);
      return;
    }
    case 'cart': case 'stall': case 'produce_a': case 'produce_b': V(`stl:${seed % 3}`, 'umbrella', ['#f0ece4', pick(['#c8343a', '#2f7a5c', '#e8c040'], seed / 6)]); return;
    default: V(`misc:${t}`, 'crate', [1]);
  }
}
// The props are many (every tree is one), so their items are not kept: the index only remembers which props show
// in each chunk (I.propCells), and staticItems makes their items again when that chunk is baked. Their lights are
// kept (small, and needed with or without a bake).
function addProps(c, I) {
  const J = { cells: new Map(), lights: I.lights, byB: new Map(), n: 0 };
  I.propCells = new Map();
  c.M.props.forEach((p, pi) => {
    if (!p || p.t === 'painted') return;
    propItems(c, p, pi, J);
    for (const k of J.cells.keys()) { let l = I.propCells.get(k); if (!l) I.propCells.set(k, (l = [])); l.push(pi); }
    I.n += J.n; J.cells.clear(); J.n = 0;
  });
}
// the items of the props showing in chunk key k (their lights go nowhere: the index has them)
function propItemsIn(c, I, k) {
  const pis = I.propCells.get(k);
  if (!pis) return null;
  const J = { cells: new Map(), lights: new Map(), byB: new Map(), n: 0 }, M = c.M;
  for (const pi of pis) { const p = M.props[pi]; if (p) propItems(c, p, pi, J); }
  return J.cells.get(k) || null;
}
// what a smashed prop leaves: a fallen post, a stump, glass and bits (it.pi's prop has .broken)
function brokenVariant(it, p) {
  const a = p.broken && p.broken.a !== undefined ? p.broken.a : 0, kind = p.t === 'lamp' || p.t === 'plamp' ? 'pole' : p.t === 'sigpole' ? 'sigpole' : PLANTS.has(p.t) ? 'tree' : 'bits';
  const q = qa(a, 16);
  return { key: `deb:${kind}:${q.toFixed(2)}:${p.t}`, recipe: { t: 'debris', kind, a: q, prop: p.t }, x: it.x, y: it.y, z0: 0, ext: [68, 58, 68, 58], pi: it.pi };
}
function makeDebris(r) {
  const G = new GBuf(130, 110); G.ax = 65; G.ay = 55;
  const c = Math.cos(r.a), s = Math.sin(r.a), put1 = (x, y, col, z = 1, f = F_GROUND) => { const X = Math.round(G.ax + x), Y = Math.round(G.ay + y - z); if (G.inside(X, Y)) G.put(X, Y, col, [0, 0.2, 1], z, null, f); };
  const DK = ramp('#3a3e48', 5, 2), WD = ramp('#6a4a30', 5, 2), GL = ramp('#9fd3ff', 4, 2);
  if (r.kind === 'pole' || r.kind === 'sigpole') {
    for (let k = 0; k < 52; k++) for (let w = -2; w <= 2; w++) put1(c * k - s * w, s * k + c * w, DK[w === -2 ? 3 : w === 2 ? 0 : 2], 2 + (w < 0 ? 1 : 0), 0);
    for (let k = 0; k < 12; k++) for (let w = -5; w <= 5; w++) put1(c * (50 + k) - s * w, s * (50 + k) + c * w, r.kind === 'sigpole' ? [20, 22, 26] : DK[1], 4, 0);
    for (let i = 0; i < 26; i++) put1(c * 56 + (hash(i, 1, 7) - 0.5) * 30, s * 56 + (hash(i, 2, 7) - 0.5) * 24, GL[hash(i, 3, 7) * 4 | 0], 1);
    for (let w = -4; w <= 4; w++) for (let v = -4; v <= 4; v++) if (w * w + v * v < 18) put1(w, v, DK[1], 3, 0);
  } else if (r.kind === 'tree') {
    for (let w = -5; w <= 5; w++) for (let v = -4; v <= 4; v++) if (w * w + v * v * 1.4 < 26) put1(w, v, WD[w * w + v * v < 8 ? 3 : 1], 5, 0);
    for (let k = 6; k < 60; k++) for (let w = -3; w <= 3; w++) put1(c * k - s * w, s * k + c * w, WD[w < 0 ? 3 : 1], 3, 0);
    const LF = MAT.leaf;
    for (let i = 0; i < 260; i++) { const d = 40 + hash(i, 1, 9) * 34, e = (hash(i, 2, 9) - 0.5) * 34; put1(c * d - s * e, s * d + c * e, LF[1 + (hash(i, 3, 9) * 5 | 0)], 2 + (hash(i, 4, 9) * 6 | 0), F_LEAF); }
  } else {
    const cols = [[120, 120, 128], [80, 84, 92], [200, 60, 50], [230, 226, 214], [60, 110, 170]];
    for (let i = 0; i < 40; i++) { const d = hash(i, 1, 11) * 26, an = r.a + (hash(i, 2, 11) - 0.5) * 2.4; for (let q = 0; q < 3; q++) put1(Math.cos(an) * d + (q % 2), Math.sin(an) * d + (q >> 1), cols[hash(i, 3, 11) * 5 | 0], 1 + (q & 1), 0); }
  }
  return G;
}
function makeRock(r) {
  if (r.style === 'sandstone' && r.size > 28) return outcrop(r.s + 3, r.size * 1.6, r.size * 1.1, r.size * 0.9, 'sandstone', {});
  return rockLump(r.s * 7 + r.size, r.size, r.style, { moss: r.moss || 0, barnacles: r.barn ? 0.85 : 0, hang: r.barn ? { kind: 'kelp', amount: 0.5 } : undefined });
}

// ================================================================================================
// signals: mast arms (static) with the head positions for the host's live lamps
// ================================================================================================
function addSignals(c, I) {
  for (const sg of c.M.signals || []) {
    if (sg.wire) { spanItem(c, I, sg); continue; }
    const L = Math.hypot(sg.hx - sg.x, sg.hy - sg.y), a = Math.atan2(sg.hy - sg.y, sg.hx - sg.x);
    const Lq = clamp(Math.round(L / 4) * 4, 24, 240), hd = qa(a, 64), ux = Math.cos(hd), uy = Math.sin(hd);
    const ds = (sg.hs || [[sg.hx, sg.hy]]).map(([hx, hy]) => clamp(Math.round(((hx - sg.x) * ux + (hy - sg.y) * uy) / 4) * 4, 12, Lq - 4));
    const heads = [{ x: sg.x + ux * 7.5, y: sg.y + uy * 7.5, z: 55, node: sg.node, edge: sg.edge, pole: true }, ...ds.map((dd) => ({ x: Math.round(sg.x + ux * (dd + 0.5)), y: Math.round(sg.y + uy * (dd + 0.5)), z: 71, node: sg.node, edge: sg.edge }))];
    put(I, vitem(`sg:${Lq}:${hd.toFixed(3)}:${ds.join(',')}`, 'signal', [Lq, ds], sg.x, sg.y, hd, [6, 7], { pi: c.poleOf(sg), heads }));
  }
}
// a span-wire junction: poles (or wall brackets) at the corners, wires to the hub, heads hanging off it
function spanItem(c, I, sg) {
  const corners = (sg.corners || []).map((q) => [Math.round(q.x - sg.x), Math.round(q.y - sg.y), q.wall ? 1 : 0]);
  const heads = (sg.heads || []).map((h) => [Math.round(h.x - sg.x), Math.round(h.y - sg.y), +qa(h.a || 0, 8).toFixed(3)]);
  let r = 30; for (const [dx, dy] of corners) r = Math.max(r, Math.abs(dx) + 12, Math.abs(dy) + 12);
  put(I, { key: `span:${sg.node}:${sg.x | 0}`, recipe: { t: 'span', corners, heads }, x: sg.x, y: sg.y, ext: [r, r + 100, r, r + 10], heads: (sg.heads || []).map((h) => ({ x: h.x, y: h.y, z: 66, node: sg.node, edge: h.edge })) });
}
function makeSpan(r) {
  const pole = memo('spanpole', () => { const m = new Vox(8, 8, 90), p = m.mat({ ramp: MAT.metalDark, k: 2 }); m.cyl('z', 4, 4, 0, 2.6, 0, 4, p); m.cyl('z', 4, 4, 0, 1.7, 4, 88, p); return voxSprite(m); });
  const head = (a) => memo('spanhead:' + a, () => { const m = new Vox(8, 26, 14), b = m.mat({ ramp: ramp('#2c2c30', 6, 3), k: 2 }), y = m.mat({ ramp: ramp('#d8b030', 6, 3), k: 3 }), L = ['#7a2a26', '#7a6420', '#246a3a'].map((q) => m.mat({ ramp: ramp(q, 5, 2), k: 1, flag: F_NOCAST })); m.box(0, 0, 0, 8, 26, 12, b); m.box(0, 0, 12, 8, 26, 13, y); for (let i = 0; i < 3; i++) m.box(7, 3 + i * 8, 3, 8, 7 + i * 8, 9, L[i]); return voxSprite(m, a + PI); });
  const parts = [];
  for (const [dx, dy, wall] of r.corners) if (!wall) parts.push([pole, dx, dy, 0]);
  for (const [dx, dy, a] of r.heads) parts.push([head(a), dx, dy, 56]);
  const G = grow(parts.length ? group(parts) : EMPTY, 6, 10, 6, 6);
  // wires: corner tops (z 84, a wall bracket at 70) to the hub (z 76), and the heads' drop lines
  for (const [dx, dy, wall] of r.corners) wireLine(G, dx, dy, wall ? 70 : 84, 0, 0, 76, 4, [27, 29, 34]);
  for (const [dx, dy] of r.heads) wireLine(G, 0, 0, 76, dx, dy, 70, 1, [27, 29, 34]);
  return G;
}
// a sagging wire between two points (ground offsets from G's anchor, heights z0 and z1)
function wireLine(G, x0, y0, z0, x1, y1, z1, sag, col) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0 - (z1 - z0)) * 1.4) + 2;
  for (let i = 0; i <= n; i++) {
    const t = i / n, X = x0 + (x1 - x0) * t, Y = y0 + (y1 - y0) * t, Z = z0 + (z1 - z0) * t - sag * 4 * t * (1 - t);
    const px = Math.round(G.ax + X), py = Math.round(G.ay + Y - Z);
    if (!G.inside(px, py)) continue;
    const k = py * G.w + px;
    if (G.col[k * 4 + 3] && G.z[k] > Z + 2) continue;
    G.put(px, py, col, [0, 0.3, 0.95], Z, null, F_NOCAST);
  }
}
// a utility pole and the four wires back to the previous pole in the line
function makeWire(r) {
  const pole = memo(`upole:${r.h}:${r.arm}:${r.hd}`, () => voxSprite(D.powerPole(r.h, r.arm), r.hd));
  if (!r.to) return pole;
  const [tx, ty] = r.to, c = Math.cos(r.hd), s = Math.sin(r.hd);
  const G = new GBuf(Math.abs(tx) + 80, Math.abs(ty) + r.h + 80); G.ax = Math.max(0, -tx) + 40; G.ay = Math.max(0, -ty) + r.h + 40;
  zPut(G, pole, G.ax, G.ay, 0);
  for (const o of [-r.arm, -6, 6, r.arm]) wireLine(G, o * c, o * s, r.h - 1, tx + o * c, ty + o * s, r.h - 1, 9 + Math.abs(o) * 0.1, [30, 30, 36]);
  return G;
}

// ================================================================================================
// flat things laid on the ground (z ~ 0..2): pools, mosaics, driveways; and upright sign faces
// ================================================================================================
function makeFlat(r) {
  const { w, h } = r, G = new GBuf(w, h); G.ax = Math.round(w / 2); G.ay = Math.round(h / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c, z = 0, f = F_GROUND | F_WET, n = [0, 0, 1];
    if (r.k === 'pool') {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (e < 4) { c = step2(MAT.stone, e < 1 ? 0.45 : 0.75 - e * 0.05, x, y); z = 2; }
      else if (e < 6) { c = MAT.concrete[2]; z = 1; }
      else { const p = groundPixel('pool', x + r.s * 31, y, r.s + 3); c = p.c; f = F_WATER | F_GROUND; }
      if (r.s % 2 && x > w - 14 && x < w - 8 && y > 8 && y < 16) { c = MAT.chrome[3]; z = 6; f = 0; }   // the ladder
    } else if (r.k === 'mosaic') {
      const dx = x - w / 2, dy = (y - h / 2) * 1.25, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
      if (d > w / 2) continue;
      const ring = Math.floor(d / 6), pet = Math.floor((ang + PI) / (TAU / 8));
      c = d > w / 2 - 3 ? MAT.stone[2] : [[200, 90, 60], [230, 200, 120], [70, 120, 170], [236, 232, 222]][(ring + (ring % 2 ? pet : 0) + r.s) % 4].map((q) => q * (0.85 + hash(x >> 1, y >> 1, 5) * 0.2));
    } else if (r.k === 'drive') { const p = groundPixel('driveway', x + r.s * 13, y, 4); c = p.c; }
    else if (r.k === 'path') { const p = groundPixel('paver', x, y, 5); c = p.c; }
    else if (r.k === 'tennis') { const p = groundPixel('courtGreen', x, y, 5); c = p.c; if (x % 60 < 2 || y === 4 || y === h - 5) c = [236, 236, 228]; }
    else continue;
    G.put(x, y, c, n, z, null, f);
  }
  return G;
}
// upright boards: billboard adverts, station name boards, price signs
function makeSignBoard(r) {
  if (r.k === 'ad') return upright(adFace(r.w, r.h, ADS[r.ad % ADS.length], r.ad), r.z || 0);
  const t = clean(r.text, 24), sx = r.sx || 1, w = r.w || textWidth(t, { sx, gap: 1 }) + 12, h = 5 * sx + 8, F = new GBuf(w, h), bg = ramp(r.bg || '#1c2a44', 5, 2), fg = r.fg || [236, 240, 248];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const e = x === 0 || y === 0 || x === w - 1 || y === h - 1; F.put(x, y, e ? MAT.metalDark[2] : bg[y < 2 ? 3 : 2], [0, 1, 0.1], 0, r.lit && !e ? [...bg[3], 40] : null, 0); }
  drawText((px, py) => F.put(px, py, fg, [0, 1, 0.1], 0, r.lit ? [...fg, 140] : null, 0), t, Math.floor((w - textWidth(t, { sx, gap: 1 })) / 2), 4, { sx, sy: sx, gap: 1 });
  const S = upright(F, r.z || 0);
  if (r.posts) { const pole = memo('signpost:' + (r.z || 0), () => { const m = new Vox(4, 4, (r.z || 0) + 2), p = m.mat({ ramp: MAT.metalDark, k: 2 }); m.box(1, 1, 0, 3, 3, (r.z || 0) + 2, p); return voxSprite(m); }); return group([[S, 0, 0, 0], [pole, -Math.round(w * 0.35), -1, 0], [pole, Math.round(w * 0.35), -1, 0]]); }
  return S;
}

// ================================================================================================
// the elevated highway: deck pieces per chunk (true heights), pillars, median lamps
// ================================================================================================
const CONC = ramp('#b8b2a6', 6, 3, { dark: 0.5, light: 0.4, shift: 0.15 });
function addDecks(c, I) {
  const M = c.M, L = M.levels;
  if (!L || !L.segs || !L.segs.length) return;
  const cells = new Map(), TM = DECK_LIFT + 24;
  L.segs.forEach((s, i) => {
    const pad = s.hw + 6, x0 = Math.min(s.ax, s.bx) - pad, x1 = Math.max(s.ax, s.bx) + pad, y0 = Math.min(s.ay, s.by) - pad, y1 = Math.max(s.ay, s.by) + pad;
    for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
      const k = ck(cx, cy); let e = cells.get(k);
      if (!e) cells.set(k, (e = { cx, cy, list: [], bx0: 1e9, by0: 1e9, bx1: -1e9, by1: -1e9 }));
      e.list.push(i); e.bx0 = Math.min(e.bx0, x0); e.by0 = Math.min(e.by0, y0); e.bx1 = Math.max(e.bx1, x1); e.by1 = Math.max(e.by1, y1);
    }
  });
  for (const e of cells.values()) {
    const X0 = Math.max(e.cx * CH, Math.floor(e.bx0)), Y0 = Math.max(e.cy * CH, Math.floor(e.by0)), X1 = Math.min((e.cx + 1) * CH, Math.ceil(e.bx1)), Y1 = Math.min((e.cy + 1) * CH, Math.ceil(e.by1));
    if (X1 <= X0 || Y1 <= Y0) continue;
    const segs = e.list.map((i) => { const s = L.segs[i], ed = M.edges[s.edge] || {}; return [s.ax, s.ay, s.bx, s.by, s.hw, s.za, s.zb, s.ramp ? 1 : 0, ed.nl || 1, ed.median || 0, s.s0 || 0, ed.oneway ? 1 : 0, s.edge]; });
    put(I, { key: `dk:${e.cx}:${e.cy}`, recipe: { t: 'deck', x0: X0, y0: Y0, w: X1 - X0, h: Y1 - Y0, T: TM, segs }, x: X0, y: Y0, z0: 0, ext: [0, TM, X1 - X0, Y1 - Y0] });
  }
  // pillars: short piers under the deck's edges, turned with the deck
  const near = (x, y) => { let best = null, bd = 1e9; for (const s of L.segs) { if (s.ramp) continue; let t = (x - s.ax) * s.ux + (y - s.ay) * s.uy; t = clamp(t, 0, s.len); const d = Math.hypot(x - s.ax - s.ux * t, y - s.ay - s.uy * t); if (d < bd) { bd = d; best = s; } } return best; };
  for (const p of M.pillars || []) { const s = near(p.x, p.y), hd = s ? qa(Math.atan2(s.uy, s.ux), 16) : 0; put(I, vitem(`pil:${hd.toFixed(2)}`, 'pillar', [DECK_LIFT - 8, 22, 34], p.x, p.y, hd)); }
  // lamps on the ring's median barrier, every ~300 px
  for (const ed of M.edges) {
    if (ed.lvl !== 1 || !ed.median) continue;
    for (let sAt = 150; sAt < ed.len - 60; sAt += 300) {
      const q = ptAt(ed.pts, sAt), hd = qa(q.a + PI / 2, 16);
      put(I, vitem(`dl:${hd.toFixed(2)}`, 'twinLamp', [1], q.x, q.y, hd, null, { z0: DECK_LIFT + 10 }));
      lightAt(I, q.x, q.y, DECK_LIFT + 100, 240, LAMP_LIGHT.twin, 3.4, 'lamp');
    }
  }
}
// a point and direction at arc length s along a polyline of {x, y, s}
function ptAt(pts, s) {
  let i = 1; while (i < pts.length - 1 && pts[i].s < s) i++;
  const a = pts[i - 1], b = pts[i], L = (b.s - a.s) || 1, t = clamp((s - a.s) / L, 0, 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
}
function makeDeck(r) {
  const LIFT = DECK_LIFT, PAR = 8, PH = 8, { x0, y0, w, h } = r, TM = r.T, G = new GBuf(w, h + TM); G.ax = 0; G.ay = TM;
  const S = r.segs.map(([ax, ay, bx, by, hw, za, zb, ramp_, nl, med, s0, ow, edge]) => { const len = Math.hypot(bx - ax, by - ay) || 1; return { ax, ay, len, ux: (bx - ax) / len, uy: (by - ay) / len, hw, za, zb, ramp: ramp_, nl, med, s0, ow, edge }; });
  let bz = 0, bs = null, bd = 0, bu = 0, bt = 0, cand = S;
  // candidate segments per 32 px block (most blocks touch one or two)
  const BW = Math.ceil(w / 32), BH = Math.ceil((h + 1) / 32), blocks = [];
  for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
    const X = x0 + bx * 32 + 16, Y = y0 + by * 32 + 16;
    blocks.push(S.filter((s) => { let t = (X - s.ax) * s.ux + (Y - s.ay) * s.uy; t = t < 0 ? 0 : t > s.len ? s.len : t; return Math.hypot(X - s.ax - s.ux * t, Y - s.ay - s.uy * t) <= s.hw + 24; }));
  }
  const asph = asphaltTex();
  // (a segment's surface height runs on past its ends along its own slope: round the bend where the next piece of a
  // sloping ramp takes over, the two meet at the same height instead of stepping - no rings across the ramp)
  const zOf = (s, tt) => Math.max(0, (s.za + (s.zb - s.za) * tt / s.len) * LIFT);
  const at = (X, Y) => {
    bs = null;
    for (const s of cand) {
      const tt = (X - s.ax) * s.ux + (Y - s.ay) * s.uy, t = tt < 0 ? 0 : tt > s.len ? s.len : tt;
      const dx = X - s.ax - s.ux * t, dy = Y - s.ay - s.uy * t, d = Math.sqrt(dx * dx + dy * dy);
      if (d > s.hw) continue;
      const z = zOf(s, tt);
      if (!bs || z > bz + 0.6 || (Math.abs(z - bz) <= 0.6 && d / s.hw < bd / bs.hw)) { bz = z; bs = s; bd = d; bu = s.ux * dy - s.uy * dx; bt = t; }
    }
    return bs;
  };
  // inside another segment's running surface (a ramp joining, or the next piece of the same road past this one's
  // rounded end): no parapet there
  const open = (X, Y, z, me) => { for (const s of cand) { if (s === me) continue; const tt = (X - s.ax) * s.ux + (Y - s.ay) * s.uy, t = tt < 0 ? 0 : tt > s.len ? s.len : tt; const d = Math.hypot(X - s.ax - s.ux * t, Y - s.ay - s.uy * t), zz = zOf(s, tt); if (d < s.hw - PAR && Math.abs(zz - z) < 7) return true; } return false; };
  // per pixel: top height (-1 none), surface height, what it is (1 road, 2 parapet, 3 median barrier), colour
  const W = w, H2 = h + 1, top = new Float32Array(W * H2).fill(-1), surf = new Float32Array(W * H2), kind = new Uint8Array(W * H2), rampF = new Uint8Array(W * H2);
  const pc = new Uint8Array(W * H2 * 3), pf = new Uint8Array(W * H2);  // (each pixel's colour and flags, for the slope fill)
  const NUP = [0, 0, 1], NS = [0, 1, 0], AC = [0, 0, 0], FC = [0, 0, 0];             // shared (G.put copies them)
  for (let yy = 0; yy < H2; yy++) for (let xx = 0; xx < W; xx++) {
    const X = x0 + xx, Y = y0 + yy;
    cand = blocks[(yy >> 5) * BW + (xx >> 5)];
    if (!cand.length || !at(X + 0.5, Y + 0.5)) continue;
    const i = yy * W + xx, s = bs, au = Math.abs(bu);
    let k = 1, zz = bz;
    if (bd > s.hw - PAR && !open(X + 0.5, Y + 0.5, bz, s)) { k = 2; zz = bz + PH; }
    else if (s.med && au < s.med / 2) { k = 3; zz = bz + PH + 2; }
    top[i] = zz; surf[i] = bz; kind[i] = k; rampF[i] = s.ramp;
    if (yy >= h) continue;
    let c, f = 0;
    const n = NUP;
    if (k === 2) c = step2(CONC, bd > s.hw - 1.5 ? 0.35 : 0.68, X, Y);
    else if (k === 3) c = step2(CONC, au > s.med / 2 - 1.5 ? 0.4 : 0.74, X, Y);
    else {
      const ai = ((Y & 255) * 256 + (X & 255)) * 3; AC[0] = asph[ai]; AC[1] = asph[ai + 1]; AC[2] = asph[ai + 2]; c = AC; f = F_GROUND | F_WET;
      const sA = s.s0 + bt, dash = sA % 48 < 26, inner = s.hw - PAR;
      const paint = (R) => { c = step2(R, 0.62, X, Y); };
      if (s.med) {
        const lw = (s.hw - s.med / 2) / Math.max(1, s.nl);
        if (Math.abs(au - s.med / 2 - 5) < 1.4) paint(MAT.paintYellow);
        else if (Math.abs(au - (inner - 6)) < 1.3) paint(MAT.paintWhite);
        else for (let q = 1; q < s.nl; q++) if (Math.abs(au - s.med / 2 - q * lw) < 1.3 && dash) paint(MAT.paintWhite);
      } else if (Math.abs(au - (inner - 4)) < 1.2) paint(MAT.paintWhite);
      else if (!s.ow && au < 3 && Math.abs(au - 2) < 1) paint(MAT.paintYellow);
      if (hash(X >> 3, Y >> 3, 17) > 0.97 && c === AC) { AC[0] *= 0.86; AC[1] *= 0.86; AC[2] *= 0.86; }
    }
    zw(G, xx, yy + TM - Math.round(zz), c, n, zz, f);
    pc[i * 3] = c[0]; pc[i * 3 + 1] = c[1]; pc[i * 3 + 2] = c[2]; pf[i] = f;
  }
  // a ramp sloping down toward the south spreads over more screen rows than it has rows of road: the rows between
  // one row and the next take the upper one's colour (or the ground under the ramp shows through in stripes)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < W; xx++) {
    const i = yy * W + xx, tz = top[i], nz = top[i + W];
    if (tz < 0 || nz < 0 || tz - nz > 2.5) continue;               // (nothing below, or a real step: its face is drawn next)
    const r0 = yy + TM - Math.round(tz), r1 = yy + 1 + TM - Math.round(nz);
    if (r1 <= r0 + 1) continue;
    FC[0] = pc[i * 3]; FC[1] = pc[i * 3 + 1]; FC[2] = pc[i * 3 + 2];
    for (let r = r0 + 1; r < r1; r++) zw(G, xx, r, FC, NUP, tz - (r - r0) * 0.5, pf[i]);
  }
  // south faces: where the next row south is lower (or no deck), the deck's edge (and parapet) drops; a ramp's
  // embankment wall goes down to the ground, the elevated deck shows its slab edge only (it stands on pillars)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < W; xx++) {
    const i = yy * W + xx, tz = top[i];
    if (tz < 0) continue;
    const below = top[i + W], bzz = below < 0 ? 0 : below;
    if (below >= tz - (rampF[i] ? 2.5 : 1)) continue;                       // (ramp pieces meet a hair apart)
    const slab = rampF[i] ? tz : (tz - surf[i]) + 10, depth = Math.min(tz - bzz, slab);
    for (let k = 1; k <= depth; k++) {
      const v = tz - k, row = yy + TM - Math.round(tz) + k;
      zw(G, xx, row, step2(CONC, 0.4 - (k / Math.max(8, depth)) * 0.18 + (k <= 2 ? 0.22 : 0) + (((x0 + xx) % 40) === 0 ? -0.15 : 0), xx, row), NS, v, 0);
    }
  }
  return G;
}
// a 256 px tile of art2 asphalt for the decks
let ASPH = null;
function asphaltTex() {
  if (ASPH) return ASPH;
  ASPH = new Uint8Array(256 * 256 * 3);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const c = groundPixel('asphalt', x, y, 7).c, i = (y * 256 + x) * 3; ASPH[i] = c[0]; ASPH[i + 1] = c[1]; ASPH[i + 2] = c[2]; }
  return ASPH;
}
// write a pixel if it is nearer than what's there
function zw(G, x, y, c, n, z, f) {
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return;
  const i = y * G.w + x;
  if (G.col[i * 4 + 3] && G.z[i] > z) return;
  G.put(x, y, c, n, z, null, f);
}

// ================================================================================================
// railway: stations, portals, crossings
// ================================================================================================
function addRail(c, I) {
  const R = c.M.rail;
  if (!R || !R.pts) return;
  for (const st of R.stations || []) {
    if (st.under) {
      const p = st.kiosk ? { x: st.kiosk.x0 + st.kiosk.w / 2, y: st.kiosk.y0 + st.kiosk.h - 6 } : st.platform;
      if (!p) continue;
      put(I, vitem('ent', 'stationEntrance', [1, '#f28c28'], p.x, p.y, 0));
      lightAt(I, p.x, p.y + 10, 50, 120, [1, 0.85, 0.6], 1.4, 'sign');
      continue;
    }
    const L = st.half || 112, sd = st.side;
    const at = (d, off) => { const q = railAt(R, st.s + d); return { x: q.x - Math.sin(q.a) * sd * off, y: q.y + Math.cos(q.a) * sd * off, a: q.a }; };
    const ok = (p) => { const t = c.at(p.x, p.y); return t !== T.ROAD && t !== T.BUILDING && t !== T.WALL && t !== T.BRIDGE; };
    const cl = Math.round(L * 0.7 / 8) * 8;
    for (const f of [-0.42, 0.42]) { const p = at(f * L, 80); if (!ok(p)) continue; const hd = qa(p.a, 16); put(I, vitem(`pcan:${cl}:${hd.toFixed(2)}`, 'platformCanopy', [cl, 40, 1], p.x, p.y, hd)); lightAt(I, p.x, p.y, 52, 160, [1, 0.94, 0.8], 1.5, 'lamp'); }
    for (const f of [-0.85, -0.12, 0.12, 0.85]) { const p = at(f * L, 62); if (!ok(p)) continue; const n = Math.atan2(Math.cos(p.a) * sd, -Math.sin(p.a) * sd); put(I, vitem(`bn:${qa(n + PI / 2, 8).toFixed(2)}`, 'bench', [], p.x, p.y, qa(n + PI / 2, 8))); }
    for (const f of [-0.96, -0.6, 0.6, 0.96]) { const p = at(f * L, 98); if (!ok(p)) continue; put(I, vitem('lp:cast:1', 'lampPost', ['cast', 1], p.x, p.y)); lightAt(I, p.x, p.y + 2, 76, 180, LAMP_LIGHT.cast, 3, 'lamp'); }
    const mid = at(0, 50);
    if (ok(mid) && Math.abs(Math.cos(mid.a)) > 0.6) put(I, { key: `stb:${st.name}`, recipe: { t: 'sign', text: st.name.replace(/ Station$/, ''), sx: 1, bg: '#1c2a44', lit: true, z: 26, posts: true }, x: mid.x, y: mid.y, ext: [80, 60, 80, 12] });
  }
  // tunnel mouths where the line goes under
  const pts = R.pts, n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    if (!!p.under === !!q.under) continue;
    const a = Math.atan2(q.y - p.y, q.x - p.x) + (p.under ? PI : 0), hd = qa(a, 32);
    put(I, vitem(`ptl:${hd.toFixed(3)}`, 'portal', [100], p.x, p.y, hd, [67, 52]));
  }
  // level crossings: the signal posts (the barrier arms are live: items carry `xing`)
  for (const x of R.crossings || []) {
    const ta = x.a ?? 0, ux = Math.cos(ta), uy = Math.sin(ta), nx = -uy, ny = ux, off = (x.hw || 80) + 24;
    for (const sg of [-1, 1]) {
      const px = x.x + ux * sg * off + nx * sg * 46, py = x.y + uy * sg * off + ny * sg * 46, hd = qa(ta + (sg < 0 ? PI : 0), 16);
      put(I, vitem(`xs:${hd.toFixed(2)}`, 'crossingSignal', [0, 0], px, py, hd, [12, 4], { xing: { x: x.x, y: x.y, a: ta, hw: x.hw, side: sg } }));
      lightAt(I, px, py, 40, 60, [1, 0.2, 0.15], 0.6, 'sign', 1);
    }
  }
}

// ================================================================================================
// set pieces: pumps under their canopies, venues, gates, motor pools, the Rock, airports, quarry, islands...
// ================================================================================================
function fenceLine(I, kind, x0, y0, x1, y1, opt = {}, keyX = '') {
  const ns = Math.abs(x1 - x0) < Math.abs(y1 - y0), len = Math.hypot(x1 - x0, y1 - y0);
  for (let s = 0; s < len - 4; s += 80) {
    const l = Math.round(Math.min(80, len - s)), t = (s + l / 2) / len, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    if (kind === 'wall') put(I, vitem(`cw:${l}`, 'compoundWall', [l, 40, true], x, y, ns ? PI / 2 : 0));
    else if (kind === 'hedge') put(I, vitem(`hg:${l}:${ns ? 1 : 0}`, 'hedge', [l, opt.h || 14], x, y, ns ? PI / 2 : 0));
    else if (kind === 'rail') put(I, vitem(`fk:rail:${l}:${ns ? 1 : 0}`, 'fenceKind', ['rail', l], x, y, ns ? PI / 2 : 0));
    else put(I, vitem(`fn:${kind}:${l}:${ns ? 1 : 0}:${opt.barbed ? 1 : 0}${keyX}`, 'fence', [kind, l, opt], x, y, ns ? PI / 2 : 0));
  }
}
function addSetPieces(c, I) {
  const M = c.M;
  // fuel pumps, and a canopy over each group of them
  const pumps = (M.pumps || []).slice(), used = new Set();
  pumps.forEach((p, i) => {
    put(I, vitem('pump', 'fuelPump', [pick(['#c8342e', '#2f6ab0', '#2f8a5a'], hh(p.x >> 9, p.y >> 9, 3)), 1], p.x, p.y, 0));
    if (used.has(i)) return;
    const grp = pumps.map((q, j) => [q, j]).filter(([q]) => Math.abs(q.x - p.x) < 260 && Math.abs(q.y - p.y) < 160);
    grp.forEach(([, j]) => used.add(j));
    const xs = grp.map(([q]) => q.x), ys = grp.map(([q]) => q.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.round(Math.max(...xs) - Math.min(...xs) + 110), d = Math.round(Math.max(...ys) - Math.min(...ys) + 70);
    put(I, vitem(`fcan:${w}:${d}`, 'canopy', [w, d, 56, 1], cx, cy + 10, 0));
    lightAt(I, cx, cy + 10, 50, 170, [1, 0.97, 0.9], 2, 'lamp');
  });
  // venues: beach volleyball nets, football goals
  for (const v of M.venues || []) {
    const r = v.rect;
    if (v.kind === 'volley') put(I, vitem(`vnet:${r.h - 40}`, 'volleyNet', [Math.min(200, r.h - 40)], v.netX, r.y + r.h / 2, PI / 2));
    else if (v.kind === 'soccer') { const gw = v.goalW || 160; put(I, vitem(`goal:${gw}:0`, 'soccerGoal', [gw * 0.6, 30, 18], r.x + 12, r.y + r.h / 2, 0)); put(I, vitem(`goal:${gw}:1`, 'soccerGoal', [gw * 0.6, 30, 18], r.x + r.w - 12, r.y + r.h / 2, PI)); }
  }
  // sliding gates: the pillars at each end (the gate itself moves: live)
  for (const g of M.gates || []) {
    if (g.club) continue;
    for (const sg of [-1, 1]) put(I, vitem('gp:1', 'gatePillar', [1, 40], g.x + sg * (g.w / 2 + 8), g.y));
  }
  // police motor pools: chain-link round the lot, a gap for the gate
  for (const mp of M.motorPools || []) {
    const x0 = mp.tx * TILE, y0 = mp.ty * TILE, x1 = (mp.tx + mp.tw) * TILE, y1 = (mp.ty + mp.th) * TILE, gate = mp.gate;
    fenceLine(I, 'chain', x0, y0 + 2, x0, y1 - 2, { barbed: true }); fenceLine(I, 'chain', x1, y0 + 2, x1, y1 - 2, { barbed: true });
    for (const yy of [y0 + 2, y1 - 2]) {
      const isGate = gate && Math.abs(gate.y - yy) < 48;
      if (isGate) { fenceLine(I, 'chain', x0, yy, gate.x - gate.w / 2 - 16, yy, { barbed: true }); fenceLine(I, 'chain', gate.x + gate.w / 2 + 16, yy, x1, yy, { barbed: true }); }
      else fenceLine(I, 'chain', x0, yy, x1, yy, { barbed: true });
    }
  }
  // Smuggler's Rock: the compound wall with guard towers
  if (M.rock && M.rock.compound) {
    const cp = M.rock.compound, x0 = cp.tx * TILE + 8, y0 = cp.ty * TILE + 8, x1 = (cp.tx + cp.tw) * TILE - 8, y1 = (cp.ty + cp.th) * TILE - 8;
    const gate = (M.gates || []).find((g) => g.rule === 'gang');
    fenceLine(I, 'wall', x0, y0, x1, y0); fenceLine(I, 'wall', x0, y0, x0, y1); fenceLine(I, 'wall', x1, y0, x1, y1);
    if (gate && Math.abs(gate.y - y1) < 80) { fenceLine(I, 'wall', x0, y1, gate.x - gate.w / 2 - 18, y1); fenceLine(I, 'wall', gate.x + gate.w / 2 + 18, y1, x1, y1); } else fenceLine(I, 'wall', x0, y1, x1, y1);
    for (const [x, y] of [[x0 + 24, y0 + 24], [x1 - 24, y1 - 24]]) { put(I, vitem('gtw', 'guardTower', [70, 1], x, y)); lightAt(I, x, y, 100, 220, [1, 0.95, 0.8], 1.8, 'lamp'); }
  }
  // airports: a control tower by each terminal (or hangar)
  for (const ap of M.airports || []) {
    const box = [ap.runway.x - 1200, ap.runway.y - 600, ap.runway.x + ap.runway.w + 1600, ap.runway.y + ap.runway.h + 600];
    const bl = M.buildings.filter((b) => b && !b.gone && (b.kind === 'terminal' || b.kind === 'hangar') && b.tx * TILE > box[0] && b.tx * TILE < box[2] && b.ty * TILE > box[1] && b.ty * TILE < box[3]);
    const b = bl.find((q) => q.kind === 'terminal') || bl[0];
    if (!b) continue;
    for (const [x, y] of [[(b.tx + b.tw) * TILE + 90, (b.ty + b.th) * TILE - 30], [b.tx * TILE - 90, (b.ty + b.th) * TILE - 30], [(b.tx + b.tw / 2) * TILE, (b.ty + b.th) * TILE + 120]]) {
      const t = c.at(x, y); if (t === T.BUILDING || t === T.ROAD || t === T.WATER || t === T.DEEP || t === T.WALL) continue;
      const big = b.kind === 'terminal';
      put(I, vitem(`ctw:${big ? 1 : 0}`, 'controlTower', [big ? 210 : 120, 1], x, y)); lightAt(I, x, y, big ? 240 : 150, 160, [1, 0.88, 0.6], 1.6, 'window'); break;
    }
  }
  // the quarry: benches stepping down into the pit (shown as terrace walls round its north side)
  for (const q of M.quarries || []) {
    const steps = 3;
    // each bench in 256 px pieces (one model per bench height, reused along it)
    for (let k = 0; k < steps; k++) {
      const w = Math.round(q.w * (0.9 - k * 0.18)), x0 = q.x + q.w / 2 - w / 2, y = q.y + 50 + k * 70;
      for (let s0 = 0; s0 < w - 8; s0 += 256) { const pw = Math.min(256, w - s0); put(I, vitem(`ter:${pw}:${k}`, 'terrace', [pw, 54, 50 - k * 12, 3 + k], Math.round(x0 + s0 + pw / 2), y, 0)); }
    }
    put(I, vitem('crane:q', 'craneTower', [180, 110], q.x + q.w - 120, q.y + q.h - 60, PI));
  }
  // painted places (the concept paintings in v1): Paradise Cay, the golf club, Red Rock Canyon
  for (const pt of M.paintings || []) {
    const rnd = rndOf(pt.x, pt.y);
    const tilesIn = (pred) => { const out = []; for (let ty = Math.floor(pt.y / TILE); ty < Math.ceil((pt.y + pt.h) / TILE); ty++) for (let tx = Math.floor(pt.x / TILE); tx < Math.ceil((pt.x + pt.w) / TILE); tx++) if (pred(c.tile(tx, ty))) out.push([tx, ty]); return out; };
    if (pt.key === 'cay') {
      const walls = tilesIn((t) => t === T.WALL || t === T.BUILDING);
      if (walls.length) {
        const xs = walls.map((q) => q[0]), ys = walls.map((q) => q[1]), tx = Math.min(...xs), ty = Math.min(...ys), tw = Math.max(...xs) - tx + 1, th = Math.max(...ys) - ty + 1;
        const spec = { w: tw * TILE, d: th * TILE, seed: 162, glowOnly: true, night: NIGHT, style: 'siding', wallColor: '#7a5a3a', pitch: 'hip', roof: 'shingle', roofColor: '#6a6e78', slope: 0.45, doors: [{ x: Math.round(tw * TILE / 2) - 9, w: 18, kind: 'door', open: true }], windows: [12, tw * TILE - 34], porchLight: true };
        put(I, { key: 'cay:cabin', recipe: { t: 'b', spec, kit: [] }, x: tx * TILE, y: (ty + th) * TILE, ext: [2, th * TILE + 200, tw * TILE + 2, 4] });
        lightAt(I, (tx + tw / 2) * TILE, (ty + th) * TILE + 10, 30, 90, [1, 0.8, 0.5], 1.2, 'window');
        put(I, vitem('hammock', 'hammock', [40], (tx + tw + 2) * TILE, (ty + th + 1) * TILE));
        put(I, vitem('cf:1', 'campfire', [1], (tx - 2) * TILE, (ty + th + 2) * TILE)); lightAt(I, (tx - 2) * TILE, (ty + th + 2) * TILE, 14, 140, LIGHT.fire, 2, 'fire', 0);
      }
      const sand = tilesIn((t) => t === T.SAND || t === T.GRASS);
      for (let k = 0; k < Math.min(40, sand.length / 12); k++) { const [tx, ty] = sand[Math.floor(rnd() * sand.length)]; const sp = rnd() < 0.7 ? 'coconut' : 'leaning'; put(I, fitem(`f:${sp}:${k % 5}:1.3`, sp, 1000 + (k % 5) * 37 + sp.length * 7, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 1.3)); }
      for (const [tx, ty] of tilesIn((t) => t === T.DOCK).filter((q, i) => i % 3 === 0)) put(I, vitem('pile:22', 'piling', [22], tx * TILE + 2, ty * TILE + 2));
    } else if (pt.key === 'golf') {
      const grass = tilesIn((t) => t === T.GRASS);
      for (let k = 0; k < Math.min(70, grass.length / 30); k++) { const [tx, ty] = grass[Math.floor(rnd() * grass.length)]; const sp = pick(['oak', 'maple', 'cypress', 'oak', 'birch'], rnd()); put(I, fitem(`f:${sp}:${k % 3}:1.3`, sp, 1000 + (k % 3) * 37 + sp.length * 7, (tx + 0.5) * TILE, (ty + 0.5) * TILE, 1.3)); }
      for (let k = 0; k < 5; k++) { const [tx, ty] = grass[Math.floor(rnd() * grass.length)]; put(I, vitem('flag:golf', 'flagpole', [40, '#d8343a'], (tx + 0.5) * TILE, (ty + 0.5) * TILE)); }
    } else if (pt.key === 'canyon') {
      const open = tilesIn((t) => t === T.DIRT || t === T.GRASS || t === T.SAND);
      // the mesas, buttes and the arch: the painting's solid tiles raised as stepped sandstone (one big sprite)
      put(I, { key: 'mesas:canyon', recipe: { t: 'mesas', mask: 'canyon', seed: 41 }, x: pt.x, y: pt.y + pt.h, ext: [0, pt.h + MESA_MAXH * 2 + 8, pt.w, 6] });
      for (let k = 0; k < Math.min(10, open.length / 80); k++) { const [tx, ty] = open[Math.floor(rnd() * open.length)]; const big = rnd() < 0.4; put(I, { key: `can:${k % 6}:${big ? 1 : 0}`, recipe: { t: 'rock', style: 'sandstone', size: big ? 52 : 32, s: k % 6 }, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, ext: [110, 120, 110, 60] }); }
      // desert scrub between the rocks
      for (let k = 0; k < Math.min(90, open.length / 10); k++) { const [tx, ty] = open[Math.floor(rnd() * open.length)]; flora1(I, pick(['creosote', 'sage', 'bursage', 'dryGrass', 'brittle', 'creosote', 'barrel', 'agave', 'ocotillo', 'yucca', 'tumble', 'cholla', 'dFlowers'], rnd()), 1, Math.round((tx + rnd()) * TILE), Math.round((ty + rnd()) * TILE)); }
    }
  }
  // marina slips: mooring piles either side of each berth
  for (const m of M.marina || []) {
    const nx = Math.cos((m.a || 0) + PI / 2), ny = Math.sin((m.a || 0) + PI / 2);
    for (const sg of [-1, 1]) put(I, vitem('pile:20', 'piling', [20], m.x + nx * sg * 34 + Math.cos(m.a || 0) * 40, m.y + ny * sg * 34 + Math.sin(m.a || 0) * 40));
  }
  // boathouses (the roof over the berth fades in v1 when a boat is inside: live) and home garages
  for (const bh of M.boathouses || []) {
    const spec = { w: bh.tw * TILE, d: bh.th * TILE, seed: 300 + bh.home, glowOnly: true, night: NIGHT, style: 'siding', wallColor: pick(['#8a6a4a', '#7a8a94', '#a8a090'], hh(bh.tx, bh.ty, 2)), pitch: 'gable', ridge: bh.dy === 0 ? 'ns' : 'ew', slope: 0.5, roof: 'shingle', roofColor: '#5a5e66', blank: bh.dy !== 1, doors: bh.dy === 1 ? [{ x: 8, w: bh.tw * TILE - 16, kind: 'garage', open: true }] : [] };
    put(I, { key: `bh:${bh.home}`, recipe: { t: 'b', spec, kit: [] }, x: bh.tx * TILE, y: (bh.ty + bh.th) * TILE, ext: [2, bh.th * TILE + 120, bh.tw * TILE + 2, 4] });
  }
  for (const gq of M.garages || []) {
    if (M.bld[gq.ty * c.W + gq.tx] >= 0) continue;
    const spec = { w: gq.tw * TILE, d: gq.th * TILE, seed: 400 + gq.home, glowOnly: true, night: NIGHT, style: 'stucco', wallColor: '#e2d4bc', pitch: 'hip', roof: 'tile', slope: 0.45, blank: !gq.south, doors: gq.south ? [{ x: 10, w: gq.tw * TILE - 20, kind: 'garage' }] : [] };
    put(I, { key: `gar:${gq.home}`, recipe: { t: 'b', spec, kit: [] }, x: gq.tx * TILE, y: (gq.ty + gq.th) * TILE, ext: [2, gq.th * TILE + 120, gq.tw * TILE + 2, 4] });
  }
  // the mansion's pool, hedges and fountain
  for (const ms of M.mansions || []) {
    if (ms.pool) { const p = ms.pool, w = Math.round(p.tw * TILE), h = Math.round(p.th * TILE); put(I, { key: `pool:${w}:${h}:1`, recipe: { t: 'flat', k: 'pool', w, h, s: 1 }, x: (p.tx + p.tw / 2) * TILE, y: (p.ty + p.th / 2) * TILE, ext: [w / 2 + 2, h / 2 + 4, w / 2 + 2, h / 2 + 2] }); for (let k = 0; k < 3; k++) put(I, vitem('loung', 'lounger', ['#f0eee8'], (p.tx + p.tw + 0.8) * TILE, (p.ty + 1 + k * 1.3) * TILE, PI / 2)); }
    const l = ms.lot; if (l) { fenceLine(I, 'hedge', l.tx * TILE + 8, l.ty * TILE + 8, (l.tx + l.tw) * TILE - 8, l.ty * TILE + 8, { h: 16 }); fenceLine(I, 'hedge', l.tx * TILE + 8, l.ty * TILE + 8, l.tx * TILE + 8, (l.ty + l.th) * TILE - 8, { h: 16 }); fenceLine(I, 'hedge', (l.tx + l.tw) * TILE - 8, l.ty * TILE + 8, (l.tx + l.tw) * TILE - 8, (l.ty + l.th) * TILE - 8, { h: 16 }); }
  }
  // wheel stops at the head of every marked parking bay
  for (const p of M.parking || []) {
    if (p.drive || p.sparse) continue;
    const a = p.a || 0;
    put(I, vitem(`ws:${qa(a + PI / 2, 4).toFixed(2)}`, 'wheelStop', [], p.x + Math.cos(a) * 54, p.y + Math.sin(a) * 54, qa(a + PI / 2, 4)));
  }
  // brick walls along the street between buildings
  for (const bw of M.brickWalls || []) {
    const D = c.dist((bw.tx + 0.5) * TILE, (bw.ty + 0.5) * TILE), rough = D.tier === 'rough' || D.tier === 'low', w = bw.tw * TILE;
    const spec = { w, d: 12, seed: 500 + (bw.tx % 7), glowOnly: true, night: NIGHT, style: D.style === 'oldtown' ? 'stone' : 'brick', height: 38, blank: true, graffiti: rough && w >= 96 ? 1 : 0, grime: rough ? 0.6 : 0.2, roof: 'flat' };
    put(I, { key: `bw:${w}:${bw.tx % 7}:${rough ? 1 : 0}`, recipe: { t: 'b', spec, kit: [] }, x: bw.tx * TILE, y: (bw.ty + 1) * TILE - 8, ext: [2, 60, w + 2, 4] });
  }
  // farm fields: rows of crops (corn, wheat or cabbages by field), rail fences round them
  (M.fields || []).forEach((f, fi) => {
    const crop = ['corn', 'wheat', 'corn', 'cab'][fi % 4];
    for (let y = f.y + 40; y < f.y + f.h - 20; y += crop === 'corn' ? 70 : 54) for (let x = f.x + 40; x < f.x + f.w - 40; x += 120) {
      const k = Math.floor(hh(x, y, 5) * 3), tt = c.at(x, y); if (tt !== T.FIELD) continue;
      if (crop === 'cab') put(I, vitem(`cab:${k}`, 'cabbages', [5, 2], x, y));
      else put(I, vitem(`crop:${crop}:${k}`, crop === 'corn' ? 'cornRow' : 'wheatRow', [k], x, y));
    }
    fenceLine(I, 'rail', f.x - 10, f.y - 10, f.x + f.w + 10, f.y - 10);
    put(I, vitem('scare', 'scarecrow', [], f.x + f.w * 0.5, f.y + f.h * 0.4));
    for (let k = 0; k < 3; k++) put(I, vitem('hay:1', 'hayBale', [true], f.x + 30 + k * 34, f.y + f.h + 26));
  });
}

// ================================================================================================
// raised terrain for a masked scene place (Red Rock Canyon, concepts N4, N4-B, N4-C): the mask's solid tiles
// become stepped sandstone mesas and buttes (terrain.js), with a natural arch between two of them. Made at the
// art pixel (half size: 1 px here = 2 world px) as one sprite and composited at 2x (chunkbake ap2).
// ================================================================================================
const MESA_MAXH = 96;   // (half px)
const MESAS = {
  canyon: {
    // tiers [[inset, height]...] in half px, by region in reading order (A: the west butte, B: the tall butte,
    // C: the big north mesa, D and E: low blocks, F: the big south mesa, G: the south-east pillar)
    tiers: [[[0, 30], [6, 58]], [[0, 34], [7, 66], [15, 90]], [[0, 30], [9, 56], [19, 78]], [[0, 16], [4, 28]], [[0, 18], [4, 30]], [[0, 28], [9, 52], [20, 74]], [[0, 24], [5, 46]]],
    // the arch: from the tail of the north mesa east to the low block (tile coords), its height and thickness (half px)
    arch: { path: [[30.1, 11.2], [32.7, 11.7], [35.6, 12.7]], width: 15, h: 60, thick: 14 },
  },
};
function makeMesas(r) {
  const mk = SCENE_MASKS[r.mask], spec = MESAS[r.mask];
  if (!mk || !spec) return EMPTY;
  const S = 2, TS = TILE / S, W = mk.w * TS, D = mk.h * TS;
  // the solid regions of the mask (4-connected, reading order)
  const lab = new Int16Array(mk.w * mk.h).fill(-1), regs = [];
  for (let y = 0; y < mk.h; y++) for (let x = 0; x < mk.w; x++) {
    if (mk.rows[y][x] !== '#' || lab[y * mk.w + x] >= 0) continue;
    const id = regs.length, st = [[x, y]], R = { id, x0: x, y0: y, x1: x, y1: y };
    lab[y * mk.w + x] = id;
    while (st.length) {
      const [a, b] = st.pop();
      R.x0 = Math.min(R.x0, a); R.y0 = Math.min(R.y0, b); R.x1 = Math.max(R.x1, a); R.y1 = Math.max(R.y1, b);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = a + dx, Y = b + dy; if (X >= 0 && Y >= 0 && X < mk.w && Y < mk.h && mk.rows[Y][X] === '#' && lab[Y * mk.w + X] < 0) { lab[Y * mk.w + X] = id; st.push([X, Y]); } }
    }
    regs.push(R);
  }
  const VEG = { kind: 'sage', density: 0.012, band: 3, inner: 0.003, size: 2, bloom: true };
  const G = rockSprite(W, D, MESA_MAXH, (T) => {
    for (const R of regs) {
      const pad = 12, x0 = Math.max(0, R.x0 * TS - pad), y0 = Math.max(0, R.y0 * TS - pad), x1 = Math.min(W, (R.x1 + 1) * TS + pad), y1 = Math.min(D, (R.y1 + 1) * TS + pad);
      const bw = x1 - x0, bh = y1 - y0, ins = new Uint8Array(bw * bh), out = new Uint8Array(bw * bh);
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const tx = Math.floor((x0 + x) / TS), ty = Math.floor((y0 + y) / TS), inside = lab[ty * mk.w + tx] === R.id ? 1 : 0;
        ins[y * bw + x] = inside; out[y * bw + x] = 1 - inside;
      }
      const dIn = distSq(out, bw, bh), dOut = distSq(ins, bw, bh), g = new Float32Array(bw * bh);
      for (let i = 0; i < bw * bh; i++) g[i] = ins[i] ? Math.sqrt(dIn[i]) - 0.5 : 0.5 - Math.sqrt(dOut[i]);
      const f = (x, y) => (x < x0 || y < y0 || x >= x1 || y >= y1 ? -99 : g[(y - y0) * bw + (x - x0)]);
      T.plateau({ sdf: { bb: [x0, y0, x1, y1], f, r: Math.min(bw, bh) / 2 } }, { style: 'sandstone', tiers: spec.tiers[R.id] || [[0, 30], [8, 50]], veg: VEG, seed: (r.seed || 41) + R.id * 7, jag: 12, block: 11 });
    }
    if (spec.arch) { const a = spec.arch; T.arch(a.path.map(([x, y]) => [x * TS, y * TS]), a.width, a.h, a.thick, { style: 'sandstone', veg: { kind: 'dry', density: 0.08, band: 3, inner: 0.002 }, seed: (r.seed || 41) + 99 }); }
  }, 0, D, r.seed || 41);
  G.ax *= S; G.ay *= S; G.ap2 = S;
  return G;
}

// ================================================================================================
// designed nature places (shared/naturesites.js): what stands on the map's tiles there
// ================================================================================================
function addNature(c, I) {
  for (const s of c.M.natureSites || []) {
    if (s.kind === 'oasis') {   // the spring down the cliff into the pool
      const f = s.spring;
      put(I, { key: `curt:${f.w}:${f.h}`, recipe: { t: 'curtain', w: f.w, h: f.h, seed: 4 }, x: f.x, y: f.y, ext: [f.w + 20, f.h + 30, f.w + 20, 30] });
      lightAt(I, f.x, f.y + 10, 8, 90, [0.8, 0.95, 1], 0.4, 'sign', 0);
      continue;
    }
    if (s.kind === 'tarn') {   // the tarn spilling over its granite ledge
      const f = s.falls;
      put(I, { key: `fall:t:${f.w}:${f.drop}`, recipe: { t: 'fall', kind: 'twoTier', w: f.w, drop: f.drop, seed: 9, mist: 0.4 }, x: f.x, y: f.y + 8, ext: [f.w / 2 + 60, f.drop + 100, f.w / 2 + 60, 50] });
      continue;
    }
    if (s.kind !== 'creek') continue;
    // the bridge: a rail along each edge of the road where the creek runs under it
    const b = s.bridge, nx = -Math.sin(b.a), ny = Math.cos(b.a), hd = qa(b.a, 64), len = Math.round(b.half * 2);
    for (const side of [-1, 1]) put(I, vitem(`crail:${len}:${hd.toFixed(3)}`, 'creekRail', [len], Math.round(b.x + nx * side * (b.roadHw + 7)), Math.round(b.y + ny * side * (b.roadHw + 7)), hd));
    // the falls: water over a mossy basalt ledge, facing south, its foot on the pool's north shore
    const f = s.falls;
    put(I, { key: `fall:${f.w}:${f.drop}`, recipe: { t: 'fall', w: f.w, drop: f.drop, seed: 5, mist: 0.35 }, x: Math.round(f.x), y: Math.round(f.y + 10), ext: [f.w / 2 + 60, f.drop + 90, f.w / 2 + 60, 40] });
    lightAt(I, f.x, f.y + 20, 10, 120, [0.75, 0.9, 1], 0.5, 'sign', 0);   // (the white water catches the light)
    // the footbridge across the creek below the pool
    const fb = s.footbridge, fh = qa(fb.a, 16);
    put(I, vitem(`fbr:${fb.len}:${fh.toFixed(2)}`, 'footbridge', [fb.len, 30, 6], Math.round(fb.x), Math.round(fb.y), fh));
  }
}

// ================================================================================================
// lot dressing for the painted-lot prefabs: what stood in the v1 paintings round the buildings
// ================================================================================================
function addLots(c, I) {
  const M = c.M;
  M.prefabs.forEach((p, pi) => {
    const pf = PREFABS[p.key];
    if (!pf || p.hero) return;   // (the hero corner dresses itself)
    const x0 = p.tx * TILE, y0 = p.ty * TILE, w = p.tw * TILE, h = p.th * TILE, [sx0, sy0, sx1, sy1] = p.solid || pf.solid, bx0 = x0 + sx0 * TILE, bx1 = x0 + sx1 * TILE, by1 = y0 + sy1 * TILE;   // (a World v2 lot carries its own solid)
    const D = c.dist(x0 + w / 2, y0 + h / 2), rnd = rndOf(pi, 333), front = y0 + h - by1;   // px of lot in front (south) of the building
    const tree = (x, y) => { const pr = plantFor(c, { t: 'tree_a', x, y }); if (pr) flora1(I, pr[0], Math.round(pr[1] * 5) / 5, Math.round(x), Math.round(y)); };
    const key = p.key;
    if (/^house/.test(key)) {
      // a front fence or hedge with a gap at the path, a mailbox, a tree in the yard, beds by the house
      const fy = y0 + h - 6, gapX = bx0 + (M.buildings.find((b) => b.prefab === pi)?.door?.tx - p.tx - sx0 + 0.5 || (sx1 - sx0) / 2) * TILE;
      const kind = D.style === 'luxury' ? 'iron' : rnd() < 0.5 ? 'picket' : 'hedge';
      if (front >= 64) {
        if (kind === 'hedge') { fenceLine(I, 'hedge', x0 + 8, fy, gapX - 26, fy, { h: 12 }); fenceLine(I, 'hedge', gapX + 26, fy, x0 + w - 8, fy, { h: 12 }); }
        else { fenceLine(I, kind, x0 + 8, fy, gapX - 26, fy); fenceLine(I, kind, gapX + 26, fy, x0 + w - 8, fy); }
        put(I, vitem(`mb:${pi % 3}`, 'mailbox', [pick(['#2c3a66', '#3a3a40', '#8a2a2e'], rnd())], gapX + 34, fy + 2));
        tree(x0 + (rnd() < 0.5 ? 40 : w - 40), by1 + front * 0.55);
      }
      if (key === 'house6' || (D.style === 'luxury' && rnd() < 0.5)) { const pw = 120, ph = 64; put(I, { key: `pool:${pw}:${ph}:${pi % 2}`, recipe: { t: 'flat', k: 'pool', w: pw, h: ph, s: pi % 2 }, x: x0 + w - 90, y: y0 + 60, ext: [62, 36, 62, 34] }); }
      return;
    }
    if (key === 'gas' || key === 'fuel') { put(I, { key: 'gas:price', recipe: { t: 'sign', text: 'FUEL 3.29', sx: 1, bg: '#d8343a', lit: true, z: 40, posts: true }, x: x0 + 40, y: y0 + h - 20, ext: [40, 70, 40, 10] }); return; }
    if (key === 'construction') {
      put(I, vitem('crane:c', 'craneTower', [230, 140], bx0 - 40, by1 - 30, 0));
      for (const [t, dx, dy] of [['lumber', 30, h - 40], ['pipes', 80, h - 30], ['pallets', 40, h - 90], ['cone', 120, h - 16], ['cone', 140, h - 16]]) put(I, vitem(`cons:${t}`, t === 'pallets' ? 'pallets' : t, t === 'pallets' ? [2, 3] : t === 'lumber' ? [1, 0] : [1], x0 + dx, y0 + dy, 0));
      fenceLine(I, 'chain', x0 + 4, y0 + h - 4, x0 + w - 4, y0 + h - 4);
      return;
    }
    if (key === 'church') { for (const dx of [24, w - 24]) put(I, fitem(`f:cypress:${dx > w / 2 ? 1 : 0}:1.2`, 'cypress', 1000 + (dx > w / 2 ? 1 : 0) * 37 + 49, x0 + dx, y0 + h - 30, 1.2)); fenceLine(I, 'iron', x0 + 8, y0 + h - 6, x0 + w / 2 - 30, y0 + h - 6); fenceLine(I, 'iron', x0 + w / 2 + 30, y0 + h - 6, x0 + w - 8, y0 + h - 6); return; }
    if (key === 'hospital') { put(I, vitem('hcan', 'canopy', [110, 50, 50, 1], x0 + w / 2, by1 + 30, 0)); return; }
    if (key === 'pool') {
      const pw = w - 5 * TILE - 40, ph = h - 70;
      if (pw > 60) { put(I, { key: `pool:${pw}:${ph}:0`, recipe: { t: 'flat', k: 'pool', w: pw, h: ph, s: 0 }, x: x0 + 5 * TILE + 20 + pw / 2, y: y0 + 30 + ph / 2, ext: [pw / 2 + 2, ph / 2 + 4, pw / 2 + 2, ph / 2 + 2] }); for (let k = 0; k < 4; k++) put(I, vitem('loung', 'lounger', ['#f0eee8'], x0 + 5 * TILE + 40 + k * 44, y0 + h - 18, 0)); }
      fenceLine(I, 'chain', x0 + 4, y0 + 4, x0 + w - 4, y0 + 4);
      return;
    }
    if (key === 'farmstead') {
      const barn = { w: 7 * TILE, d: 5 * TILE, seed: 134 + pi, glowOnly: true, night: NIGHT, style: 'siding', wallColor: '#a8342e', pitch: 'gable', ridge: 'ns', slope: 0.6, roof: 'shingle', roofColor: '#6a6a70', doors: [{ x: 60, w: 104, kind: 'garage', open: true, h: 64 }], windows: [16] };
      put(I, { key: `barn:${pi}`, recipe: { t: 'b', spec: barn, kit: [] }, x: x0 + 2 * TILE, y: y0 + 6 * TILE, ext: [2, 5 * TILE + 200, 7 * TILE + 2, 4] });
      put(I, vitem('silo', 'silo', [110], x0 + 9.5 * TILE, y0 + 3 * TILE));
      for (let k = 0; k < 4; k++) put(I, vitem('hay:1', 'hayBale', [true], x0 + 40 + k * 30, y0 + h - 24));
      put(I, vitem('trough', 'trough', [], x0 + 8 * TILE, y0 + h - 40));
      return;
    }
    if (key === 'junkyard') {
      for (let k = 0; k < 8; k++) put(I, vitem(`tir:${k % 3}`, 'tires', [2 + k % 3], x0 + 150 + rnd() * (w - 190), y0 + 40 + rnd() * (h - 80)));
      for (let k = 0; k < 5; k++) put(I, vitem(`tp:${k % 3}`, 'trashPile', [k % 3], x0 + 150 + rnd() * (w - 190), y0 + 40 + rnd() * (h - 80)));
      fenceLine(I, 'chain', x0 + 4, y0 + 4, x0 + w - 4, y0 + 4, { barbed: true });
      return;
    }
    if (key === 'beachbar' || key === 'rest1' || key === 'rest2' || key === 'redawning' || key === 'greenbistro' || key === 'diner') {
      if (front < 40) return;
      for (let k = 0; k < Math.min(4, Math.floor(w / 110)); k++) { const x = x0 + 50 + k * 110, y = by1 + Math.min(front - 20, 30); put(I, vitem('ctab', 'cafeTable', [], x, y)); put(I, vitem(`umb:${key}`, 'umbrella', ['#f0ece4', key === 'redawning' ? '#a8343a' : key === 'greenbistro' ? '#2f6a4e' : '#2f7a5c'], x, y - 2)); }
      return;
    }
    if (key === 'club' || key === 'clubnova' || key === 'clubeclipse') { if (front >= 40) put(I, vitem('rope', 'ropeLine', [80], x0 + w / 2 - 60, by1 + 26)); return; }
    if (key === 'industrial' || key === 'warehouse' || key === 'repair') {
      if (front < 64) return;
      for (let k = 0; k < 3; k++) put(I, vitem(`pal:p:${k % 2}`, 'pallets', [k, 1 + k % 3], x0 + 40 + rnd() * (w - 80), by1 + 20 + rnd() * (front - 40)));
      if (rnd() < 0.6) put(I, vitem('fork', 'forklift', ['#e0b030', true], x0 + w * 0.7, by1 + front / 2, qa(rnd() * TAU, 8)));
      if (key === 'industrial' && rnd() < 0.7) put(I, vitem(`cont:${pi % 3}`, 'container', [pick(['#a8402e', '#2f5a8a', '#3a7a4a'], rnd()), 130], x0 + 90, by1 + front / 2, 0));
      return;
    }
    if (key === 'tower1' || key === 'tower2' || key === 'hotel' || key === 'bank' || key === 'bank2' || key === 'police' || key === 'police2' || key === 'police3') {
      if (/police/.test(key)) put(I, vitem('flag', 'flagpole', [110, 'stars'], x0 + 30, y0 + h - 14));
      if (key === 'hotel') { put(I, vitem('hcan:h', 'canopy', [96, 34, 46, 1], x0 + w / 2, by1 + 20, 0)); lightAt(I, x0 + w / 2, by1 + 20, 42, 140, [1, 0.85, 0.6], 1.6, 'lamp'); }
    }
  });
}

// ================================================================================================
// greenery the map does not place. Houses get beds along their front walls (clear of doors and driveways) and a
// tree in a deep front yard; the wilds get undergrowth, scrub and wild flowers by terrain, the woods more trees
// away from every path; parks get flower beds. All of it is decoration: the map's own props are what collide,
// so trees only stand where nobody walks and the rest is low enough to walk through.
// ================================================================================================
const YARD = { houses: ['rose', 'hydrangea', 'lavender', 'topBall', 'hydrangea', 'boxStone'], luxury: ['topBall', 'topCone', 'lavender', 'rose', 'topBall'], beach: ['hibiscus', 'bougain', 'bird', 'monstera'],
  rural: ['berryShrub', 'rose', 'lupines', 'hydrangea'], desert: ['agave', 'yucca', 'barrel', 'pear'], southside: ['tallGrass', 'dryGrass', 'berryShrub', 'rose'], oldtown: ['lavender', 'rose', 'boxIron', 'hydrangea'] };
const HOUSEY = new Set(['house', 'villa', 'farmhouse', 'cabin', 'cottage', 'mansion']);
function flora1(I, sp, k, x, y, bare = true) { const v = Math.floor(hh(x, y, 13) * NV(sp)); put(I, fitem(`f:${sp}:${v}:${k}`, sp, 1000 + v * 37 + sp.length * 7, x, y, k, null, bare)); }
function addYards(c, I) {
  c.M.buildings.forEach((b, bi) => {
    if (!b || b.gone || !HOUSEY.has(archOf(c, b))) return;
    const D = c.dist((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE), pool = YARD[D.style] || YARD[WILDS.has(D.style) ? 'rural' : 'houses'], rnd = rndOf(bi, 515);
    const y1 = (b.ty + b.th) * TILE, doorX = b.door ? (b.door.tx + (b.door.w || 1) / 2) * TILE : -1e9, gar = I.garages.get(bi) || [];
    const yardAt = (x, y) => { const t = c.at(x, y); return t === T.LOT || t === T.GRASS || t === T.DIRT; };
    for (let x = b.tx * TILE + 18; x < (b.tx + b.tw) * TILE - 14; x += 24 + rnd() * 18) {
      if (!yardAt(x, y1 + 10) || Math.abs(x - doorX) < 30 || gar.some(([a, q]) => x > a && x < q) || rnd() < 0.2) continue;
      flora1(I, pick(pool, rnd()), 1, Math.round(x), y1 + 11);
    }
    // a tree in a deep front yard (not on the path or the drive)
    let deep = 0;
    for (let k = 0; k < 6 && yardAt((b.tx + b.tw / 2) * TILE, y1 + k * TILE + 16); k++) deep++;
    if (deep >= 4 && rnd() < 0.75) {
      for (let t = 0; t < 4; t++) {
        const x = (b.tx + 1 + rnd() * (b.tw - 2)) * TILE, y = y1 + (2 + rnd() * (deep - 3)) * TILE;
        if (Math.abs(x - doorX) < 70 || gar.some(([a, q]) => x > a - 40 && x < q + 40) || !yardAt(x, y)) continue;
        const pr = plantFor(c, { t: 'tree_a', x, y }); if (pr) flora1(I, pr[0], Math.round(pr[1] * 5) / 5, Math.round(x), Math.round(y));
        break;
      }
    }
  });
}
// the security cameras (map.cameras): a pole on the pavement (moved off the road to the nearest kerb), looking at
// the spot it watches or along the street
function addCameras(c, I) {
  const ok = (t) => t === T.SIDEWALK || t === T.PLAZA || t === T.GRASS || t === T.LOT || t === T.DIRT;
  for (const cam of c.M.cameras || []) {
    let x = cam.x, y = cam.y;
    if (!ok(c.at(x, y))) {
      let best = null;
      for (let r = 1; r <= 5 && !best; r++) for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const X = x + dx * r * TILE, Y = y + dy * r * TILE; if (ok(c.at(X, Y))) { best = [X, Y]; break; } }
      if (!best) continue;
      [x, y] = best;
    }
    const far = Math.hypot(cam.x - x, cam.y - y) > 8, rd = c.roadDir(x, y, 4), hd = qa(far ? Math.atan2(cam.y - y, cam.x - x) : rd !== null ? rd : hh(x, y, 5) * TAU, 8);
    put(I, vitem(`cam:${hd.toFixed(2)}`, 'cctv', [64], Math.round(x), Math.round(y), hd, [3, 4]));
  }
}
// shopfronts: pots either side of the door, a sandwich board, tables out front of cafes where the pavement is wide
const POTS = { luxury: ['topBall', 'topCone'], towers: ['topCone', 'topBall'], oldtown: ['boxIron', 'lavender'], beach: ['pot', 'hibiscus'], nightlife: ['pot', 'topBall'], redlight: ['pot'], commercial: ['plg', 'boxStone', 'topBall'] };
function addFrontage(c, I) {
  for (const f of I.fronts) {
    const { x0, y1, w, dx, dw, kind, st } = f, rnd = rndOf(x0, y1 + 7);
    const paved = (x, dy = 12) => { const t = c.at(x, y1 + dy); return t === T.SIDEWALK || t === T.PLAZA; };
    if (st === 'southside' || st === 'industrial' || st === 'harbor' || st === 'factory') continue;
    const pool = POTS[st] || POTS.commercial;
    for (const px of [x0 + dx - 13, x0 + dx + dw + 13]) {
      if (px < x0 + 8 || px > x0 + w - 8 || !paved(px) || rnd() < 0.3) continue;
      const k = pick(pool, rnd());
      if (k === 'pot') put(I, vitem('pot', 'pottedPalm', [], Math.round(px), y1 + 12));
      else if (k === 'plg') put(I, vitem('plg', 'planter', [true], Math.round(px), y1 + 9));
      else flora1(I, k, 1, Math.round(px), y1 + 11);
    }
    const bx = x0 + dx + dw + 34;
    if ((kind === 'cafe' || kind === 'diner' || kind === 'bar' || kind === 'mart') && bx < x0 + w - 10 && paved(bx, 16) && rnd() < 0.55) put(I, vitem('chalk', 'chalkboard', [], Math.round(bx), y1 + 16));
    if ((kind === 'cafe' || kind === 'diner') && paved(x0 + w / 2, 30) && paved(x0 + w / 2, 76)) {
      for (let k = 0, n = Math.min(3, Math.floor(w / 90)); k < n; k++) {
        const tx = Math.round(x0 + 40 + k * ((w - 80) / Math.max(1, n - 1 || 1))); if (Math.abs(tx - (x0 + dx + dw / 2)) < 30) continue;
        put(I, vitem('ctab', 'cafeTable', [], tx, y1 + 34));
        if (rnd() < 0.5) put(I, vitem(`umb:${kind}`, 'umbrella', ['#f0ece4', kind === 'diner' ? '#c8343a' : '#2f7a5c'], tx, y1 + 33));
      }
    }
  }
}
// Parks keep a few flower beds in the index; the wilds' ground cover is made per chunk (coverItems, below).
function addGreenery(c, I) {
  const M = c.M, W = c.W, H = c.H;
  // tiles next to a map prop (rocks, set pieces, furniture; not the trees and plants - ferns grow under trees):
  // the ground cover leaves room round them
  const taken = new Uint8Array(W * H);
  for (const p of M.props) { if (!p || PLANTS.has(p.t)) continue; const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = tx + dx, y = ty + dy; if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1; } }
  I.taken = taken;
  for (let ty = 1; ty < H - 1; ty += 2) for (let tx = 1; tx < W - 1; tx += 2) {
    const i = ty * W + tx;
    if (M.tiles[i] !== T.GRASS || taken[i] || (M.reserve && M.reserve[i])) continue;
    if ((DISTRICTS[M.dist[i]] || {}).style !== 'park') continue;
    const h = hash(tx, ty, 7001);
    if (h >= 0.05 || !coverClear(c, tx, ty, 1)) continue;
    const x = Math.round((tx + 0.5 + (hash(tx, ty, 7005) - 0.5) * 1.6) * TILE), y = Math.round((ty + 0.5 + (hash(tx, ty, 7007) - 0.5) * 1.6) * TILE);
    flora1(I, pick(['hydrangea', 'rose', 'lavender', 'flHedge', 'tulips', 'daisies', 'berryShrub'], hash(tx, ty, 7003)), 1, x, y);
  }
}
const COVER_HARD = new Set([T.ROAD, T.BRIDGE, T.BUILDING, T.WALL, T.SIDEWALK, T.PLAZA, T.LOT, T.FIELD, T.DOCK, T.WATER, T.DEEP, T.FLOOR, T.COUNTER]);
function coverClear(c, tx, ty, r, dirt = false) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const t = c.tile(tx + dx, ty + dy); if (COVER_HARD.has(t) || (dirt && t === T.DIRT)) return false; }
  return true;
}

// ================================================================================================
// ground cover: what carpets the wild between the map's trees and rocks - fern beds under the woods, drifts of
// one wild flower at a time in the meadows, scrub and dry grass in the desert, heather and alpine flowers on the
// mountains, dune grass behind the beaches, reeds and cattails along the lakes and rivers. A forest floor is
// thousands of plants, so none of it is kept in the index: each chunk makes what stands on it when it is baked
// (deterministic per tile, so neighbouring chunks agree). All of it is walk-through decoration, clear of every
// road, path and building; the map's own props are what collide.
// ================================================================================================
const NAT_SP = {
  // [species, weight] by the patch a tile falls in
  forest: [['fern', 6], ['fern', 6], ['salal', 5], ['huckle', 2], ['berry', 1], ['bracken', 1], ['foxglove', 1]],
  redwood: [['fern', 9], ['salal', 3], ['huckle', 1], ['bracken', 1], ['foxglove', 1]],
  meadowA: [['lupines', 1]], meadowB: [['poppies', 3], ['tallGrass', 1]], meadowC: [['lupines', 1], ['berryShrub', 1]], meadowD: [['poppies', 1], ['lupines', 1], ['tallGrass', 1]],
  meadowGrass: [['tallGrass', 5], ['berryShrub', 1], ['pampas', 1]],
  desert: [['creosote', 4], ['bursage', 3], ['brittle', 2], ['dryGrass', 3], ['sage', 2], ['tumble', 1]],
  desertBloom: [['dFlowers', 2], ['dPoppies', 2], ['brittle', 1]],
  desertCacti: [['barrel', 2], ['pear', 2], ['agave', 2], ['cholla', 1], ['saguaroSmall', 1], ['yucca', 1]],
  alpine: [['heather', 4], ['juniper', 1], ['aDaisies', 3], ['aLupine', 2], ['paintbrush', 1], ['twisted', 1]],
  dune: [['duneGrass', 4], ['beachGrass', 3], ['icePlant', 1]],
  shore: [['reeds', 3], ['cattails', 3], ['tallGrass', 1]],
};
const pickW = (list, u) => { let t = 0; for (const e of list) t += e[1]; let a = u * t; for (const e of list) { a -= e[1]; if (a < 0) return e[0]; } return list[list.length - 1][0]; };
// what a wild tile grows, or null: [species, scale]
function coverAt(c, tx, ty, x, y) {
  const M = c.M, i = ty * c.W + tx, t = M.tiles[i];
  if (t !== T.GRASS && t !== T.DIRT && t !== T.SAND) return null;
  const st = (DISTRICTS[M.dist[i]] || {}).style;
  if (!WILDS.has(st) || st === 'airport') return null;
  const bio = c.biome(x, y), h = hash(tx, ty, 7101), h2 = vnoise(x, y, 70, 7103) * 0.75 + hash(tx, ty, 7103) * 0.25; // (h2: clumps of one plant)
  const pa = vnoise(x, y, 170, 7105), pb = vnoise(x, y, 90, 7107);   // patches: big drifts, smaller clumps
  // water's edge: reeds and cattails in clumps along lakes and rivers (not the sea)
  const nearFresh = (M.distRiver && M.distRiver[i] > 0 && M.distRiver[i] <= 8) || (M.lake && (M.lake[i - 1] || M.lake[i + 1] || M.lake[i - c.W] || M.lake[i + c.W]));
  if (nearFresh && t !== T.SAND) return pb > 0.42 && h < 0.75 ? [pickW(NAT_SP.shore, h2), 1] : null;
  if (t === T.SAND || bio === 5) {
    const back = M.distSea ? M.distSea[i] : 99;   // (quarter tiles) dune grass only behind the wet sand
    return back > 14 && pa > 0.45 && h < 0.35 ? [pickW(NAT_SP.dune, h2), 1] : null;
  }
  if (bio === 2) {                                                      // the woods: a fern bed nearly everywhere
    if (pb < 0.25 && h < 0.8) return null;                              // (sunlit gaps)
    if (h > 0.72) return null;
    return [pickW(c.di(x, y) === 29 ? NAT_SP.redwood : NAT_SP.forest, h2), 1 + (hash(tx, ty, 7109) > 0.6 ? 0.2 : 0)];
  }
  if ((bio === 3 && !SEA_ISLES.has(M.dist[i])) || st === 'desert') {
    if (pa > 0.68 && h < 0.3) return [pickW(NAT_SP.desertBloom, h2), 1];   // after the rains: a bloom
    if (pb > 0.7 && h < 0.08) return [pickW(NAT_SP.desertCacti, h2), 1];
    return h < 0.1 + pb * 0.08 ? [pickW(NAT_SP.desert, h2), 1] : null;
  }
  if (bio === 4) return pb > 0.5 && h < 0.2 ? [pickW(NAT_SP.alpine, h2), 1] : h < 0.03 ? [pickW(NAT_SP.alpine, h2), 1] : null;
  // meadows: a drift of one flower, tall grass between, plain grass most of the way
  if (pa > 0.62 && h < 0.32) return [pickW([NAT_SP.meadowA, NAT_SP.meadowB, NAT_SP.meadowC, NAT_SP.meadowD][Math.floor(vnoise(x, y, 400, 7111) * 4) % 4], h2), 1];
  if (pb > 0.66 && h < 0.22) return [pickW(NAT_SP.meadowGrass, h2), 1];
  return h < 0.015 ? [pickW(NAT_SP.meadowGrass, h2), 1] : null;
}
// every cover plant whose picture can touch chunk (cx, cy): ground points from a little above it (shadows,
// leaves) to a plant's height below it, a plant's half width either side
function coverItems(c, I, cx, cy) {
  const out = [], W = c.W, H = c.H, taken = I.taken;
  const tx0 = Math.max(1, Math.floor((cx * CH - 80) / TILE)), tx1 = Math.min(W - 2, Math.floor(((cx + 1) * CH + 80) / TILE));
  const ty0 = Math.max(1, Math.floor((cy * CH - 40) / TILE)), ty1 = Math.min(H - 2, Math.floor(((cy + 1) * CH + 110) / TILE));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * W + tx;
    if ((taken && taken[i]) || (c.M.reserve && c.M.reserve[i])) continue;
    const x = Math.round((tx + hash(tx, ty, 7005)) * TILE), y = Math.round((ty + hash(tx, ty, 7007)) * TILE); // (anywhere in its tile: no rows)
    const r = coverAt(c, tx, ty, x, y);
    if (!r || !coverClear(c, tx, ty, 1)) continue;
    const [sp, k] = r, v = Math.floor(hash(tx, ty, 13) * NV(sp));
    out.push(fitem(`f:${sp}:${v}:${k}`, sp, 1000 + v * 37 + sp.length * 7, x, y, k));
  }
  return out;
}

// ================================================================================================
// walk-in interiors, cut away: no roof, walls cut low (the back wall stays), the shop floor, counters, shelves
// ================================================================================================
const FLOORK = { convenience: 'tileWhite', pharmacy: 'tileWhite', grocery: 'tileWhite', coffee: 'woodFloor', clothing: 'woodFloor', sports: 'rubber', hardware: 'platform', gunshop: 'platform',
  pawn: 'woodFloor', club: 'checker', fence: 'checker', hospital: 'tileWhite', reception: 'tileWhite', bank: 'stoneTile', courthouse: 'stoneTile', fishmarket: 'tileGreen', tackle: 'woodFloor', police: 'platform' };
function cutRecipe(c, b, s, spec) {
  const W = s.tw * TILE, Dd = s.th * TILE, wi = b.walkIn, units = [];
  for (const u of wi.units) {
    const ux0 = Math.max(u.x0, s.tx), ux1 = Math.min(u.x1, s.tx + s.tw - 1);
    if (ux1 < ux0) continue;
    units.push({ x0: (ux0 - s.tx) * TILE, x1: (ux1 - s.tx + 1) * TILE, cy: (u.counterRow - s.ty) * TILE, kind: u.kind, dx: (u.door.tx - s.tx) * TILE, dw: (u.door.w || 2) * TILE });
  }
  return { t: 'cut', w: W, d: Dd, H: Math.min(buildingH(spec), 120), wall: spec.style || 'stucco', wallColor: spec.wallColor || null, seed: spec.seed, units, inY0: (wi.y0 - s.ty) * TILE, inY1: (wi.y1 - s.ty + 1) * TILE };
}
function makeCut(r) {
  const { w, d, H } = r, CUT = 18, G = new GBuf(w, d + H + 8); G.ax = 0; G.ay = d + H + 8;
  const WR = r.wall === 'brick' ? MAT.brick : r.wall === 'brickDark' ? MAT.brickDark : ramp(r.wallColor || '#d8cfc0', 6, 3), CAP = ramp('#8a8680', 5, 2);
  const gy = (Y, z) => G.ay - d + Y - z;   // sprite row of ground point Y (from the section's north edge) at height z
  const wallAt = (u, v) => (r.wall === 'brick' || r.wall === 'brickDark') ? ((v % 4 === 0 || (u + (Math.floor(v / 4) & 1) * 4) % 8 === 0) ? MAT.concrete[2] : WR[3 - ((hash(u >> 3, v >> 2, r.seed) * 2) | 0)]) : WR[3 + (hash(u >> 2, v >> 2, r.seed) > 0.85 ? -1 : 0)];
  const px = (x, Y, z, c, n, f = 0) => zw(G, x, gy(Y, z), c, n, z, f);
  // floor
  for (const u of r.units) {
    const fk = FLOORK[u.kind] || 'woodFloor';
    for (let Y = r.inY0; Y < r.inY1; Y++) for (let x = u.x0; x < u.x1; x++) px(x, Y, 0, groundPixel(fk, x + r.seed, Y, 3).c, [0, 0, 1], F_GROUND);
  }
  // the back wall: full height, its face toward the camera, its top a cap
  for (let x = 0; x < w; x++) {
    for (let v = 0; v < H; v++) px(x, r.inY0, v, wallAt(x, v), [0, 1, 0]);
    for (let Y = 0; Y < r.inY0; Y++) px(x, Y, H, CAP[Y === 0 ? 4 : 2], [0, 0, 1]);
  }
  // side walls and unit dividers cut low (caps), the front wall cut low with the doorways open
  const capRun = (xa, xb, Ya, Yb) => { for (let Y = Ya; Y < Yb; Y++) for (let x = xa; x < xb; x++) px(x, Y, CUT, CAP[x === xa || x === xb - 1 ? 3 : 2], [0, 0, 1]); for (let x = xa; x < xb; x++) for (let v = 0; v < CUT; v++) px(x, Yb, v, wallAt(x + 400, v), [0, 1, 0]); };
  capRun(0, 32, r.inY0, d); capRun(w - 32, w, r.inY0, d);
  for (let i = 1; i < r.units.length; i++) { const x = r.units[i].x0 - 4; capRun(x, x + 8, r.inY0, r.inY1); }
  for (let x = 32; x < w - 32; x++) {
    if (r.units.some((u) => x >= u.dx && x < u.dx + u.dw)) continue;
    for (let Y = r.inY1; Y < d; Y++) px(x, Y, CUT, CAP[2], [0, 0, 1]);
    for (let v = 0; v < CUT; v++) px(x, d, v, wallAt(x + 800, v), [0, 1, 0]);
  }
  // counters, back shelves with goods, a clerk's till
  for (const u of r.units) {
    const CT = u.kind === 'coffee' || u.kind === 'club' || u.kind === 'fence' ? ramp('#6a4a30', 6, 3) : ramp('#d8d4cc', 6, 3), TOPC = u.kind === 'club' ? ramp('#2a2a34', 5, 2) : ramp('#a8aab0', 5, 2);
    for (let Y = u.cy + 6; Y < u.cy + 26; Y++) for (let x = u.x0 + 6; x < u.x1 - (u.x1 - u.x0 > 128 ? 34 : 6); x++) px(x, Y, 22, TOPC[Y === u.cy + 6 ? 4 : 2], [0, 0, 1]);
    for (let x = u.x0 + 6; x < u.x1 - (u.x1 - u.x0 > 128 ? 34 : 6); x++) for (let v = 0; v < 22; v++) px(x, u.cy + 26, v, CT[v > 18 ? 4 : 2 + ((x >> 3) & 1)], [0, 1, 0]);
    const goods = [[204, 72, 64], [236, 200, 80], [76, 146, 204], [116, 180, 100], [226, 224, 214], [170, 100, 200]];
    for (let x = u.x0 + 4; x < u.x1 - 4; x++) for (let v = 0; v < 52; v++) { const sh = v % 13; px(x, r.inY0 + 10, v, sh < 2 ? MAT.metalDark[2] : goods[Math.floor(hash(x >> 1, v / 13 | 0, r.seed + u.x0) * goods.length)], [0, 1, 0]); }
    for (let Y = r.inY0; Y < r.inY0 + 10; Y++) for (let x = u.x0 + 4; x < u.x1 - 4; x++) px(x, Y, 52, MAT.metalDark[3], [0, 0, 1]);
  }
  return G;
}
