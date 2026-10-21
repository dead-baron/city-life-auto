// World v3 8.22 (H48): the land's relief - a height field for the v3 frame, its cliff bands, and the layer the art
// bakes its hillshade from (docs/WORLD-V3.md 8.22).
//
// The land was flat: the falls a low weir, Lookout Hill an orchard, North Cape no headland, the desert's mesas 4-7 tile
// towers. Now every tile of the frame has a height (metres; a tile is a metre), from the skeleton's BIOMES and
// LANDMARKS plus a little noise:
//   - the biomes' ground on a coarse grid (8 tiles), blurred so their borders become slopes: Granite Peaks high
//     (world3-biomes.js peakHeight, the snow's own field: 70-250 m) with crags (stepped cliff bands) above the tree
//     line; the North Ridge a ridge (its crest along the polygon's middle, 30-110 m); Highland Woods rolling hills
//     rising to the peaks; Willow Valley low; the Red Rock Desert a plateau; the coasts low, down to the sea;
//   - Lookout Hill a round hill above Kestrel Lake; the headlands (North Cape, Egret Point, Sandpiper Point, Toll Point)
//     high ground that ends at the sea in cliffs behind the beach;
//   - the desert's mesas and buttes as big raised tables (a mesa 60-190 tiles across, a butte 28-60) with cliff sides
//     and a talus apron, where nothing is built (the lookout's mesa by Dusty Hollow is one, its jeep track the ramp);
//   - the gorge the Highland Highway crosses on the Gorge Bridge (a deep cut under the deck); an escarpment at each
//     falls (Silver Thread Falls, Summit Tarn's, any nature site with `falls`) with the gorge below it, walled on
//     three sides round the pool.
// Roads keep their grade: a road's height is the land's averaged along the road (the road tiles round it), and the
// land beside it comes back to its own over GRADE_R tiles - cuttings through the tables and hills, embankments over
// the hollows; nothing steep is made a cliff there. A cliff band is open wild ground (no road, no place, no water)
// steeper than CLIFF_SLOPE: the tiles become solid rock (T.WALL, reserve 32: rubble under the faces) and each run of
// south-facing band gets its face (`cliff`: granite or sandstone; `cliffwall`: basalt on the coasts).
// m.relief: one byte per tile (metres, ordered-dithered so a small box of tiles averages back to the decimetres),
// what client/art2/game/groundbake.js shades the ground by. Deterministic (integer hashing, sqrt, no Math.random;
// built inside generateCity, under withDeterministicMath). Only the world build imports it (shared/world3-world.js).
import { TILE, T } from './constants.js';
import { BIOMES, LANDMARKS, HIGHWAYS } from './world3-skeleton.js';
import { WATER3 } from './world3-land.js';
import { peakHeight, TREE_LINE } from './world3-biomes.js';
import { DISTRICTS } from './mapcore.js';
import { GROUND3 } from './world3-layout.js';
import { AIRSTRIPS3 } from './world3-wild.js';   // (the tables keep off Lucky Mesa's strip: used in the build only - the two modules import each other)

export const RELIEF_CELL = 8;      // the coarse grid of the biomes' ground (tiles)
export const CLIFF_SLOPE = 2.2;    // m per tile: steeper (on open wild ground) is a cliff band
export const GRADE_R = 14;         // tiles over which the land beside a road comes back to its own height
const GRADE_CELL = 4, GRADE_AVG = 6;   // the road grade: the road tiles' heights averaged in 4-tile cells, 6 cells round
const BIO = Object.fromEntries(BIOMES.map((b, k) => [b.key, k + 1]));   // (the land layer's biome numbers)
const LM = (name) => LANDMARKS.find((l) => l.name === name)?.at;
// the places on high ground (the tests check each): [name, at, radius (tiles) round which it stands highest]
export const HIGH_SPOTS = [
  ['Lookout Hill', LM('Lookout Hill'), 110, 34, false],
  ['North Cape', [520, 830], 95, 22, true],
  ['Egret Point', LM('Egret Point Light'), 80, 20, true],
  ['Sandpiper Point', LM('Sandpiper Point Light'), 85, 18, true],
];
export const LOOKOUT_MESA = { at: [5414, 1632], rx: 50, ry: 34, h: 32 };   // (v3b: south-west of Route 9, which ran over its top at 5456, 1674)   // (the track from Dusty Hollow climbs its south rim)   // (8.18's lookout stands on it)
// (v3b) the gorge below the woods' big falls: the creek's cut from the falls' lake south-east (world3-layout.js STREAMS3)
export const GORGE = [[1850, 1140], [1900, 1215], [1990, 1228], [2070, 1250]];
// (v3b, docs/WORLD-V3.md part 9) the owner's mountains (world3-layout.js GROUND3.mount): each raises the coarse ground
// towards its middle (MOUNT_H metres at MOUNT_IN tiles in from its edge and beyond), so the hillshade, the crags and
// the snow follow the sketch's grey masses whatever biome the land layer gives them
export const MOUNT_H = 150, MOUNT_IN = 90;
let MOUNTS = null;
const mounts = () => (MOUNTS ||= GROUND3.mount.map((poly) => { const b = [1e9, 1e9, -1e9, -1e9]; for (const [x, y] of poly) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return { poly, b }; }));
const inPoly = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// how far (tiles) the point is inside a mountain, 0 outside
export function mountDepth(x, y) {
  let d = 0;
  for (const M of mounts()) if (x >= M.b[0] && y >= M.b[1] && x <= M.b[2] && y <= M.b[3] && inPoly(M.poly, x, y)) d = Math.max(d, polyEdgeDist(M.poly, x, y));
  return d;
}

// ---- noise: integer hashing, value noise -----------------------------------------------------------------------
const hash = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const fade = (t) => t * t * (3 - 2 * t);
function vn(x, y, sc, s) {
  const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy), u = fade(fx - ix), v = fade(fy - iy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
const sstep = (a, b, x) => { const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1), ex = px - ax - dx * t, ey = py - ay - dy * t;
  return Math.sqrt(ex * ex + ey * ey);
}
const polyEdgeDist = (poly, x, y) => { let d = 1e9; for (let k = 0; k < poly.length; k++) { const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length]; d = Math.min(d, segDist(x, y, ax, ay, bx, by)); } return d; };

// ---- the biomes' ground on the coarse grid ----------------------------------------------------------------------------
// each biome's level (blurred wide: the borders become long slopes) and its own shape on it (blurred a little)
function biomeBase(b, tx, ty) {
  if (b === BIO.peaks) return 70;
  if (b === BIO.woods) return 16 + 30 * clamp(1 - ty / 1500, 0, 1);
  if (b === BIO.valley) return 6;
  if (b === BIO.desert) return 26;
  if (b === BIO.ridge) return 34;
  if (b === BIO.sandpiper || b === BIO.egret || b === BIO.northshore) return 3;
  return 2;   // (the gulf's islands, today's places: flat)
}
function biomeShape(b, tx, ty) {
  if (b === BIO.peaks) {
    // (the peaks rise from their outline over a few hundred metres, the forest's own swell at their foot - not a step
    // at the edge: a cliff band ran along it, straight as the edge - World v3 step 1)
    let d = 0;
    for (const P of BIOMES[BIO.peaks - 1].polys) if (inPoly(P, tx, ty)) d = Math.max(d, polyEdgeDist(P, tx, ty));
    const k = sstep(0, 80, d - 6 + 30 * vn(tx, ty, 70, 7109));
    return 175 * peakHeight(tx, ty) * k + (26 * vn(tx, ty, 320, 7101) + 10 * vn(tx, ty, 110, 7102)) * (1 - k);
  }
  if (b === BIO.woods) return 26 * vn(tx, ty, 320, 7101) + 10 * vn(tx, ty, 110, 7102);
  if (b === BIO.valley) return 6 * vn(tx, ty, 260, 7103);
  if (b === BIO.desert) return 10 * vn(tx, ty, 420, 7104) + 4 * vn(tx, ty, 90, 7105);
  if (b === BIO.ridge) { const P = BIOMES[BIO.ridge - 1].poly, d = polyEdgeDist(P, tx, ty), top = ty < 4 ? 1 : clamp(d / 46, 0, 1); return 76 * top * (2 - top) + 10 * vn(tx, ty, 80, 7106); }
  if (b === BIO.sandpiper || b === BIO.egret || b === BIO.northshore) return 3 * vn(tx, ty, 200, 7107);
  return 0;
}
function blur(g, gw, gh, r, mask) {
  const tmp = new Float32Array(g.length);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { let s = 0, n = 0; for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= gw) continue; s += g[y * gw + xx]; n++; } tmp[y * gw + x] = s / n; }
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { if (mask && !mask[y * gw + x]) continue; let s = 0, n = 0; for (let k = -r; k <= r; k++) { const yy = y + k; if (yy < 0 || yy >= gh) continue; s += tmp[yy * gw + x]; n++; } g[y * gw + x] = s / n; }
}

// The coarse ground (steps 1 and 2 of reliefOf3, on the RELIEF_CELL grid): the biomes' levels and shapes, the hills and
// headlands, the coast down to the sea - from the land layers alone, so the world build's lines hook can read it before
// anything is built (H50: the wild tracks are laid along it, world3-wild.js). Kept per land (the same land, the same field).
const COARSE = new WeakMap();
function coarse3(W, H, L) {
  const hit = COARSE.get(L);
  if (hit && hit.W === W && hit.H === H) return hit;
  const C = RELIEF_CELL, gw = Math.ceil(W / C) + 1, gh = Math.ceil(H / C) + 1;
  // 1. the coarse ground: the biomes', blurred; inland water a little lower (valleys); the sea -2
  const g = new Float32Array(gw * gh), g2 = new Float32Array(gw * gh), sea = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const tx = Math.min(W - 1, cx * C), ty = Math.min(H - 1, cy * C), i = ty * W + tx, w = L.water[i], k = cy * gw + cx;
    if (w === WATER3.SEA || w === WATER3.DEEP) { g[k] = -2; sea[k] = 1; continue; }
    g[k] = biomeBase(L.biome[i], tx, ty) - (w ? 4 : 0); g2[k] = biomeShape(L.biome[i], tx, ty);
    if (!w) { const md = mountDepth(tx, ty); if (md > 0) g2[k] += MOUNT_H * sstep(0, MOUNT_IN, md) * (0.75 + 0.5 * peakHeight(tx, ty)); }   // (v3b: the sketch's mountains)
  }
  for (let p = 0; p < 4; p++) blur(g, gw, gh, 5);
  for (let p = 0; p < 2; p++) blur(g2, gw, gh, 2);
  for (let k = 0; k < gw * gh; k++) g[k] += g2[k];
  // 2. the hills and headlands; the coast comes down to the sea (but at a headland: its cliffs)
  const ds = new Float32Array(gw * gh).fill(1e9);   // (distance to the sea, cells: a chamfer)
  for (let k = 0; k < gw * gh; k++) if (sea[k]) ds[k] = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const k = y * gw + x; if (x) ds[k] = Math.min(ds[k], ds[k - 1] + 1); if (y) ds[k] = Math.min(ds[k], ds[k - gw] + 1, x ? ds[k - gw - 1] + 1.41 : 1e9, x < gw - 1 ? ds[k - gw + 1] + 1.41 : 1e9); }
  for (let y = gh; y--;) for (let x = gw; x--;) { const k = y * gw + x; if (x < gw - 1) ds[k] = Math.min(ds[k], ds[k + 1] + 1); if (y < gh - 1) ds[k] = Math.min(ds[k], ds[k + gw] + 1, x < gw - 1 ? ds[k + gw + 1] + 1.41 : 1e9, x ? ds[k + gw - 1] + 1.41 : 1e9); }
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const k = cy * gw + cx;
    if (sea[k]) continue;
    const tx = cx * C, ty = cy * C;
    let cf = sstep(0, 60, ds[k] * C), add = 0;
    for (const [, at, R, h] of HIGH_SPOTS) {
      if (!at) continue;
      const d = Math.sqrt((tx - at[0]) * (tx - at[0]) + (ty - at[1]) * (ty - at[1])), w = sstep(0, 1, 1 - d / R);
      if (w <= 0) continue;
      add = Math.max(add, h * w); cf = Math.max(cf, sstep(0, 1, 1 - d / (R * 1.15)));
    }
    g[k] = 1 + (g[k] - 1) * cf + add;
  }
  const out = { W, H, g, gw, gh };
  COARSE.set(L, out);
  return out;
}
// The land's height (metres) at tile (x, y) before anything is built (the coarse ground, bilinear): what the wild tracks
// are laid along (H50).
export function landHeight3(W, H, L) {
  const { g, gw, gh } = coarse3(W, H, L), C = RELIEF_CELL;
  return (x, y) => {
    const fx = clamp(x / C, 0, gw - 1.001), fy = clamp(y / C, 0, gh - 1.001), ix = Math.floor(fx), iy = Math.floor(fy), u = fx - ix, v = fy - iy, k = iy * gw + ix;
    return (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + gw] * (1 - u) + g[k + gw + 1] * u) * v;
  };
}

// The height field (decimetres, one per tile) of the built map m on the land layers L, before the cliffs: what the
// cliffs and m.relief are made from. Pure: the same map and land give the same field (the tests build it twice).
export function reliefOf3(m, L) {
  const W = m.w, H = m.h, C = RELIEF_CELL, { g, gw } = coarse3(W, H, L);
  // 3. per tile: the coarse ground (bilinear), the peaks' crags, the beaches under the headlands
  const z = new Float32Array(W * H);
  const spotW = (tx, ty) => { let w = 0; for (const [, at, R, , coast] of HIGH_SPOTS) if (at && coast) w = Math.max(w, 1 - Math.sqrt((tx - at[0]) * (tx - at[0]) + (ty - at[1]) * (ty - at[1])) / (R * 1.15)); return w; };
  for (let ty = 0; ty < H; ty++) {
    const fy = ty / C, iy = Math.floor(fy), v = fy - iy;
    for (let tx = 0; tx < W; tx++) {
      const fx = tx / C, ix = Math.floor(fx), u = fx - ix, k = iy * gw + ix, i = ty * W + tx;
      let h = (g[k] * (1 - u) + g[k + 1] * u) * (1 - v) + (g[k + gw] * (1 - u) + g[k + gw + 1] * u) * v;
      const w = L.water[i];
      if (w === WATER3.SEA || w === WATER3.DEEP) { z[i] = 0; continue; }
      if (L.biome[i] === BIO.peaks) {
        const p = peakHeight(tx, ty);
        const crag = p > TREE_LINE - 0.06 ? sstep(0.55, 0.7, vn(tx, ty, 140, 7108)) : 0;   // (crags in patches above the tree line)
        if (crag > 0) { const s = (p - TREE_LINE + 0.06) * 5, f = s - Math.floor(s); h += crag * 24 * (sstep(0.86, 1, f) - f); }   // (each step's rise in its last seventh)
      }
      if (m.tiles[i] === T.SAND && spotW(tx, ty) > 0 && spotW(tx, ty) < 0.7) h = Math.min(h, 1.2);   // (the beach under a headland's cliff; the knoll at its point stays up)
      z[i] = h;
    }
  }
  // 4. the desert's mesas and buttes, the gorge, the falls' escarpments
  const tables = tablesOf3(m, L, z);
  tablesOn(z, W, H, tables);
  canyonCut(m, z, W);
  gorge(m, z, W, H);
  for (const f of fallsOf3(m)) escarpment(m, z, W, H, f);
  return { z, tables };
}

// the tables: a jittered grid over the desert (230 tiles), a mesa or a butte in most cells - where nothing is built
// and no water lies under it - and the lookout's mesa (8.18) by Dusty Hollow. tableSpots3: every cell's table at its
// full size, before what's built decides (H50: the wild tracks, laid before the tables, keep round these)
export function tableSpots3(W, H) {
  const out = [{ ...LOOKOUT_MESA, x: LOOKOUT_MESA.at[0], y: LOOKOUT_MESA.at[1], mesa: true, s: 1, lookout: true }];
  // (v3b, docs/WORLD-V3.md part 9) the owner's mesas and buttes (world3-layout.js GROUND3.mesa: the sketch's red
  // tables): each an ellipse in its outline's box, a mesa when it is wide, a butte when small
  GROUND3.mesa.forEach((poly, k) => {
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, mesa = Math.max(rx, ry) > 45, cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) return;
    const h = mesa ? 30 + 20 * hash(k, 3, 7206) : 26 + 18 * hash(k, 3, 7206);
    out.push({ x: cx, y: cy, rx, ry, h, mesa, s: 2 + k });
  });
  return out;
}
// (v3b) The owner's mesas and buttes carved out of the sketch's red areas (world3-layout.js GROUND3.mesa): the areas
// are too big to stand clear of the roads, the towns and the water as one table each, so each is filled with tables of
// the size the room there allows - big tables where it is wide, buttes in the corners, a spire in a gap - each kept
// TABLES.hard tiles off every road, rail, track and place (its cliff band out of the roads' grade: GRADE_R), a few
// tiles off the water and the desert's edge, and a wash (TABLES.gap tiles, by hash) off its neighbours. Greedy on a
// 2-tile grid: the room at each cell is the radius of the free disc round it; the roomiest cell inside a mesa area
// takes the biggest squarish table that fits there (stretched east-west or north-south when the room runs that way),
// its rim and wash then taken from the room, until no butte fits. Deterministic (integer hashing, sqrt).
export const TABLES = { cell: 2, hard: 19, soft: 4, poly: 12, gap: [7, 18], rMin: 9, rMax: 84, rag: 1.13, max: 140 };
const SQ = 1.19;   // (a superellipse of TABLES' shape: its corner 1.19 radii out - the disc a table of radius r needs)
// the chamfer distance (cells) from the set cells of `src` (gw x gh): two passes
function chamfer(src, gw, gh, cap = 1e4) {
  const d = new Float32Array(gw * gh);
  for (let k = 0; k < d.length; k++) d[k] = src[k] ? 0 : cap;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const k = y * gw + x; let v = d[k]; if (!v) continue; if (x) v = Math.min(v, d[k - 1] + 1); if (y) { v = Math.min(v, d[k - gw] + 1); if (x) v = Math.min(v, d[k - gw - 1] + 1.414); if (x < gw - 1) v = Math.min(v, d[k - gw + 1] + 1.414); } d[k] = v; }
  for (let y = gh; y--;) for (let x = gw; x--;) { const k = y * gw + x; let v = d[k]; if (!v) continue; if (x < gw - 1) v = Math.min(v, d[k + 1] + 1); if (y < gh - 1) { v = Math.min(v, d[k + gw] + 1); if (x < gw - 1) v = Math.min(v, d[k + gw + 1] + 1.414); if (x) v = Math.min(v, d[k + gw - 1] + 1.414); } d[k] = v; }
  return d;
}
function carveTables3(m, L, out, z) {
  const W = m.w, H = m.h, C = TABLES.cell, K = TABLES.rag;
  let X0 = W, Y0 = H, X1 = 0, Y1 = 0;
  for (const poly of GROUND3.mesa) for (const [x, y] of poly) { X0 = Math.min(X0, x); Y0 = Math.min(Y0, y); X1 = Math.max(X1, x); Y1 = Math.max(Y1, y); }
  X0 = Math.max(0, X0 - 60); Y0 = Math.max(0, Y0 - 60); X1 = Math.min(W, X1 + 60); Y1 = Math.min(H, Y1 + 60);
  if (X1 <= X0 || Y1 <= Y0) return;
  const gw = Math.ceil((X1 - X0) / C), gh = Math.ceil((Y1 - Y0) / C), N = gw * gh;
  const cellOf = (x, y) => (x < X0 || y < Y0 || x >= X1 || y >= Y1 ? -1 : (((y - Y0) / C) | 0) * gw + (((x - X0) / C) | 0));
  // what a table keeps off: `hard` (roads, rails, tracks, what's built or kept, the towns, the places: TABLES.hard
  // tiles), `soft` (the water, the land past the desert: TABLES.soft tiles), `inP` the mesa areas (a table's rim no
  // more than TABLES.poly tiles past one)
  const hard = new Uint8Array(N), soft = new Uint8Array(N), inP = new Uint8Array(N);
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = y * W + x, c = cellOf(x, y), t = m.tiles[i], d = m.dist[i];
    if (!m.land[i] || L.water[i] || t === T.WATER || t === T.DEEP || L.biome[i] !== BIO.desert) { soft[c] = 1; continue; }
    if (d < 47 || d === 64 || !WILD.has((DISTRICTS[d] || {}).style) || GRADED(m, i) || m.bld[i] >= 0 || (m.reserve[i] & ~128) || !(t === T.GRASS || t === T.DIRT || t === T.SAND)) hard[c] = 1;
  }
  const mark = (x0, y0, x1, y1) => { for (let y = Math.max(Y0, Math.floor(y0)); y < Math.min(Y1, Math.ceil(y1)); y += C) for (let x = Math.max(X0, Math.floor(x0)); x < Math.min(X1, Math.ceil(x1)); x += C) hard[cellOf(x, y)] = 1; };
  for (const e of m.edges || []) if (!(e.lvl < 0)) for (let k = 1; k < e.pts.length; k++) {   // (the road graph: a dirt track has no road tiles)
    const a = e.pts[k - 1], b = e.pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
    for (let j = 0; j <= n; j++) { const c = cellOf(Math.floor((a.x + (b.x - a.x) * j / n) / TILE), Math.floor((a.y + (b.y - a.y) * j / n) / TILE)); if (c >= 0) hard[c] = 1; }
  }
  for (const p of m.pois || []) if (p) mark(p.x / TILE - 4, p.y / TILE - 4, p.x / TILE + 4, p.y / TILE + 4);
  for (const s of m.natureSites || []) if (s && Number.isFinite(s.x)) mark(s.x / TILE - 4, s.y / TILE - 4, s.x / TILE + 4, s.y / TILE + 4);
  for (const r of [...(m.landmarks || []), ...(m.paintings || []), ...(m.quarries || [])]) if (r && Number.isFinite(r.w)) mark(r.x / TILE, r.y / TILE, (r.x + r.w) / TILE, (r.y + r.h) / TILE);
  for (const A of AIRSTRIPS3) { const [a0, b0, a1, b1] = A.runway, [hx, hy, hw, hh] = A.hangar; mark(a0 - 6, b0 - 6, a1 + 6, b1 + 6); mark(hx - 6, hy - 6, hx + hw + 8, hy + hh + 8); }
  const P = GROUND3.mesa.map((poly) => { const b = [1e9, 1e9, -1e9, -1e9]; for (const [x, y] of poly) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } return { poly, b }; });
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const x = X0 + cx * C + C / 2, y = Y0 + cy * C + C / 2;
    for (const p of P) if (x >= p.b[0] && y >= p.b[1] && x <= p.b[2] && y <= p.b[3] && inPoly(p.poly, x, y)) { inP[cy * gw + cx] = 1; break; }
  }
  // the room (tiles): the radius of the free disc round each cell
  const dH = chamfer(hard, gw, gh), dS = chamfer(soft, gw, gh), dQ = chamfer(inP, gw, gh), far = new Uint8Array(N);
  for (let k = 0; k < N; k++) far[k] = dQ[k] * C > TABLES.poly ? 1 : 0;
  const dF = chamfer(far, gw, gh), room = new Float32Array(N);
  for (let k = 0; k < N; k++) room[k] = Math.min(dH[k] * C - TABLES.hard, dS[k] * C - TABLES.soft, dF[k] * C);
  // a table of rim radii (rx, ry) at the cell (cx, cy): its rim (ragged out by TABLES.rag at most) all on room
  const fits = (cx, cy, rx, ry) => {
    const fx = rx * K / C, fy = ry * K / C, x0 = Math.floor(cx - fx), x1 = Math.ceil(cx + fx), y0 = Math.floor(cy - fy), y1 = Math.ceil(cy + fy);
    if (x0 < 0 || y0 < 0 || x1 >= gw || y1 >= gh) return false;
    for (let y = y0; y <= y1; y++) { const b = (y - cy) / fy, b4 = b * b * b * b; if (b4 > 1) continue; for (let x = x0; x <= x1; x++) { const a = (x - cx) / fx; if (a * a * a * a + b4 <= 1 && room[y * gw + x] < 0) return false; } }
    return true;
  };
  // a placed table: its rim and its wash taken from the room round it (the distance to its rim, a local chamfer)
  const take = (t, gap) => {
    const fx = t.rx * K / C, fy = t.ry * K / C, cx = (t.x - X0) / C, cy = (t.y - Y0) / C, R = Math.ceil((TABLES.rMax * SQ * K + TABLES.gap[1]) / C) + 2;
    const bx0 = Math.max(0, Math.floor(cx - fx) - R), bx1 = Math.min(gw - 1, Math.ceil(cx + fx) + R), by0 = Math.max(0, Math.floor(cy - fy) - R), by1 = Math.min(gh - 1, Math.ceil(cy + fy) + R), bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const src = new Uint8Array(bw * bh);
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const a = (x - cx) / fx, b = (y - cy) / fy; if (a * a * a * a + b * b * b * b <= 1) src[(y - by0) * bw + x - bx0] = 1; }
    const d = chamfer(src, bw, bh);
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) { const k = y * gw + x; room[k] = Math.min(room[k], d[(y - by0) * bw + x - bx0] * C - gap); }
  };
  for (const t of out) take(t, TABLES.gap[1]);   // (the lookout's mesa, placed by hand)
  for (let n = 0; n < TABLES.max; n++) {
    // the roomiest cell inside a mesa area (ties to the hash)
    let best = -1, bv = -1;
    for (let k = 0; k < N; k++) if (inP[k] && room[k] > bv + 1e-6) { bv = room[k]; best = k; }
    if (best < 0 || bv < TABLES.rMin * SQ * K) break;
    const cx = best % gw, cy = (best / gw) | 0, s = 2 + out.length + 40;
    // the shape: squarish, or stretched up to 2.4 times its width along a row or a column, as big as fits
    let pick = null;
    for (const a of [1, 1.35, 1.8, 2.4]) for (const along of a === 1 ? [0] : [0, 1]) {
      let lo = 0, hi = TABLES.rMax / a;
      for (let it = 0; it < 9; it++) { const mid = (lo + hi) / 2; if (fits(cx, cy, along ? mid : mid * a, along ? mid * a : mid)) lo = mid; else hi = mid; }
      if (lo < TABLES.rMin) continue;
      const rx = along ? lo : lo * a, ry = along ? lo * a : lo, area = rx * ry * (1 + 0.15 * hash(cx * 3 + along, cy, 7207));
      if (!pick || area > pick.area) pick = { rx, ry, area };
    }
    if (!pick) { room[best] = -1; n--; continue; }   // (this cell's disc was round but no table fits it: try the next)
    const x = X0 + cx * C + C / 2, y = Y0 + cy * C + C / 2, r = Math.max(pick.rx, pick.ry), u = hash(x, y, 7206);
    const mesa = r > 45, h = Math.round(mesa ? 34 + 18 * u : r > 18 ? 26 + 16 * u : 22 + 14 * u);
    const t = { x, y, rx: Math.floor(pick.rx), ry: Math.floor(pick.ry), h, mesa, s }, top = z[y * W + x] + h;
    // its lobes: smaller tables standing out from its rim, their tops at its top - one table of a ragged outline, as
    // the concepts' mesas (up to three, in eight directions by hash, where the room is)
    const own = [t], nl = r >= 24 ? 1 + Math.floor(hash(x, y, 7209) * 3) : 0;
    for (let j = 0, d0 = Math.floor(hash(x, y, 7210) * 8); j < nl; j++) {
      const [ux, uy] = DIRS8[(d0 + j * 3) % 8], q = Math.sqrt(Math.sqrt((ux / t.rx) ** 2 * (ux / t.rx) ** 2 + (uy / t.ry) ** 2 * (uy / t.ry) ** 2)), at = 0.9 / q;
      const lr = Math.min(t.rx, t.ry) * (0.35 + 0.25 * hash(x + j, y, 7211)), st = hash(x, y + j, 7212), lx = Math.round(x + ux * at), ly = Math.round(y + uy * at);
      const lrx = Math.max(12, Math.round(st < 0.33 ? lr * 1.4 : lr)), lry = Math.max(12, Math.round(st > 0.66 ? lr * 1.4 : lr));
      if (lx < X0 || ly < Y0 || lx >= X1 || ly >= Y1 || top - z[ly * W + lx] < h * 0.7 || !fits((lx - X0) / C, (ly - Y0) / C, lrx, lry)) continue;   // (not up a slope: its cliff as tall as the table's)
      own.push({ x: lx, y: ly, rx: lrx, ry: lry, h: Math.round((top - z[ly * W + lx]) * 10) / 10, mesa: false, s: s + 50 * (j + 1), lobe: out.length });
    }
    for (const o of own) out.push(o);
    const gap = TABLES.gap[0] + Math.round(hash(x, y, 7208) * (TABLES.gap[1] - TABLES.gap[0]));
    for (const o of own) take(o, gap);
  }
}
const DIRS8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
function tablesOf3(m, L, z) {
  const [look] = tableSpots3(m.w, m.h), out = [look];
  carveTables3(m, L, out, z);
  return out;
}
// how far (tiles) outside a table's rim a tile lies (negative: on its top) - a ragged superellipse. The bake has a copy
// (client/art2/game/groundbake.js tableEdge: the top's cap rock, the talus at the foot) - keep the two the same
export function tableEdge(t, x, y) {
  const ax = (x - t.x) / t.rx, ay = (y - t.y) / t.ry, a2 = ax * ax, b2 = ay * ay;
  return (Math.sqrt(Math.sqrt(a2 * a2 + b2 * b2)) * (1 + 0.16 * (vn(x, y, 21, 7301 + t.s) - 0.5) + 0.06 * (vn(x, y, 7, 7302 + t.s) - 0.5)) - 1) * Math.min(t.rx, t.ry);
}
// how far (tiles, x and y) from its middle a table reaches out to e tiles past its rim (tableEdge: e runs on the short
// radius, the rim ragged out by an eighth at most)
export const tableReach = (t, e) => { const f = (1 + e / Math.min(t.rx, t.ry)) * 1.13; return [t.rx * f + 1, t.ry * f + 1]; };
// a table: a flat top inside a ragged superellipse rim, a cliff 3 tiles wide down to its talus, the apron 11 more
// (v3b: the tables stand close, a wash between - where two aprons meet the higher holds, they don't add up; a top is
// level, h metres over the ground at its middle, whatever the land does under it - the coast's fall to the sea - and
// its cliff and talus drop from there to the ground round it)
function tablesOn(z, W, H, tables) {
  let X0 = W, Y0 = H, X1 = 0, Y1 = 0;
  for (const t of tables) { const [ex, ey] = tableReach(t, 15); X0 = Math.min(X0, Math.floor(t.x - ex)); Y0 = Math.min(Y0, Math.floor(t.y - ey)); X1 = Math.max(X1, Math.ceil(t.x + ex)); Y1 = Math.max(Y1, Math.ceil(t.y + ey)); }
  X0 = Math.max(0, X0); Y0 = Math.max(0, Y0); X1 = Math.min(W - 1, X1); Y1 = Math.min(H - 1, Y1);
  if (X1 < X0 || Y1 < Y0) return;
  const bw = X1 - X0 + 1, add = new Float32Array(bw * (Y1 - Y0 + 1));
  for (const t of tables) { const [ex, ey] = tableReach(t, 15), top = z[t.y * W + t.x] + t.h; for (let y = Math.max(Y0, Math.floor(t.y - ey)); y <= Math.min(Y1, t.y + ey); y++) for (let x = Math.max(X0, Math.floor(t.x - ex)); x <= Math.min(X1, t.x + ex); x++) {
    const e = tableEdge(t, x, y), i = y * W + x, rise = Math.max(0, top - z[i]);
    let a;
    if (e <= 0) a = rise + 2 * vn(x, y, 40, 7303 + t.s);
    else if (e <= 3) a = rise * (1 - 0.7 * e / 3);
    else if (e <= 14) { const f = 1 - (e - 3) / 11; a = rise * 0.3 * f * f; }
    else continue;
    const k = (y - Y0) * bw + x - X0;
    if (a > add[k]) add[k] = a;
  } }
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) { const i = y * W + x, a = add[(y - Y0) * bw + x - X0]; if (a > 0 && z[i] > 0) z[i] += a; }
}
// Red Rock Canyon (the scene painting's box, 8.19) cut into the plateau: its floor 7 m down, rising to its walls (the
// painting's rock) and its box's edge over 7 tiles - the hillshade draws its sides (H50)
function canyonCut(m, z, W) {
  const pt = (m.paintings || []).find((p) => p.key === 'canyon');
  if (!pt) return;
  const x0 = Math.floor(pt.x / TILE), y0 = Math.floor(pt.y / TILE), x1 = x0 + Math.round(pt.w / TILE), y1 = y0 + Math.round(pt.h / TILE), R = 7;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = y * W + x;
    if (z[i] <= 0) continue;
    let d = Math.min(x - x0, y - y0, x1 - 1 - x, y1 - 1 - y, R);
    for (let dy = -R + 1; dy < R && d > 0; dy++) for (let dx = -R + 1; dx < R; dx++) if (m.tiles[(y + dy) * W + x + dx] === T.WALL) d = Math.min(d, Math.max(Math.abs(dx), Math.abs(dy)) - 1);
    z[i] -= 7 * sstep(0, R, d);
  }
}
// the gorge under the Gorge Bridge: a floor 10 tiles either side of its line, walls up to the land 16-24 tiles out
function gorge(m, z, W, H) {
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const [x, y] of GORGE) { x0 = Math.min(x0, x - 40); y0 = Math.min(y0, y - 40); x1 = Math.max(x1, x + 40); y1 = Math.max(y1, y + 40); }
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
    let d = 1e9, s = 0, best = 0;
    for (let k = 1; k < GORGE.length; k++) { const dd = segDist(x, y, GORGE[k - 1][0], GORGE[k - 1][1], GORGE[k][0], GORGE[k][1]); if (dd < d) { d = dd; best = k; } }
    const [ax, ay] = GORGE[best - 1], [bx, by] = GORGE[best], l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) || 1;
    s = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l / l;
    const ends = best === 1 && s < 0 ? -s * l : best === GORGE.length - 1 && s > 1 ? (s - 1) * l : 0;
    if (ends > 30) continue;
    const half = 10 + 3 * vn(x, y, 30, 7401), wall = half + 6 + 6 * vn(x, y, 17, 7402);
    const depth = 46 * (1 - ends / 30);
    const i = y * W + x;
    if (d >= wall || z[i] <= 0) continue;
    const cut = d <= half ? depth : depth * (1 - (d - half) / (wall - half));
    z[i] = Math.max(1, z[i] - cut);
  }
}
// each falls: the land north of its lip raised and its gorge below - the ground beside the water under the falls raised
// as walls, open to the south (90 tiles). (2026-10-20, the nature program: no straight lines. The lip is the falls' own
// across the stream - `lipAt`, a falls that draws one: Silver Thread Falls' horseshoe - and beyond it an edge that
// bends back upstream as it leaves the falls, wobbling, its height fading 25-85 tiles out, its step sharp at the falls
// and a slope away from them, the high ground behind it coming back down to the land's 40-140 tiles back (no edge where
// its box ends); the gorge's walls follow the water below the falls, not the falls' column.)
export function fallsOf3(m) {
  const out = [];
  const F = m.world3?.west?.built?.falls, head = F?.head;
  for (const s of m.natureSites || []) {
    if (s.falls && Number.isFinite(s.falls.x) && Number.isFinite(s.falls.y)) out.push({ x: Math.floor(s.falls.x / TILE), y: Math.floor((s.falls.y - (s.falls.drop || 40)) / TILE), name: s.name || s.kind, w: Math.ceil((s.falls.w || 64) / TILE / 2) + 2 });
  }
  const own = out.filter((f) => f.x >= 0 && f.y >= 0 && f.x < m.w && f.y < m.h && m.dist[f.y * m.w + f.x] >= 47);
  // (Silver Thread Falls: the woods' own, at the head of its lake - its lip's ends on the lake's water)
  if (head) own.unshift({ x: head[0], y: F.lip ? F.lip.y : head[1] - 3, name: 'Silver Thread Falls', w: F.lip ? Math.ceil((F.lip.x1 - F.lip.x0) / 2) : 16, lip: F.lip || null });
  return own;
}
export const ESC = { HF: 22, BEND: 30, WOB: 7, FULL: 25, GONE: 85, NORTH: [40, 140], GORGE: 90 };
function escarpment(m, z, W, H, f) {
  const { HF, BEND, WOB, FULL, GONE, NORTH, GORGE } = ESC;
  const x0 = Math.max(0, f.x - 150), x1 = Math.min(W - 1, f.x + 150), y0 = Math.max(0, f.y - 160), y1 = Math.min(H - 1, f.y + GORGE + 10);
  const BW = x1 - x0 + 1, BH = y1 - y0 + 1;
  // the lip's row (relative to f.y) at each column
  const lipD = new Float32Array(BW);
  for (let x = x0; x <= x1; x++) {
    const beyond = Math.max(0, Math.abs(x - f.x) - f.w), wob = WOB * (vn(x, 0, 29, 7501) - 0.5) + 3 * (vn(x, 0, 9, 7503) - 0.5);
    let d = -(beyond * beyond) / (2 * BEND) + wob * Math.min(1, beyond / 6);
    if (f.lip && x >= f.lip.x0 && x <= f.lip.x1) d = f.lip.row[x - f.lip.x0] - f.y;
    lipD[x - x0] = d;
  }
  // the water below the lip: each tile's distance to it (a 3-4 chamfer, tiles), for the gorge's walls
  const INF = 1e9, dw = new Float32Array(BW * BH).fill(INF);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (L_WET(m, y * W + x) && y - f.y > lipD[x - x0]) dw[(y - y0) * BW + x - x0] = 0;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { const k = y * BW + x; let v = dw[k]; if (x > 0) v = Math.min(v, dw[k - 1] + 1); if (y > 0) { v = Math.min(v, dw[k - BW] + 1); if (x > 0) v = Math.min(v, dw[k - BW - 1] + 1.4); if (x < BW - 1) v = Math.min(v, dw[k - BW + 1] + 1.4); } dw[k] = v; }
  for (let y = BH - 1; y >= 0; y--) for (let x = BW - 1; x >= 0; x--) { const k = y * BW + x; let v = dw[k]; if (x < BW - 1) v = Math.min(v, dw[k + 1] + 1); if (y < BH - 1) { v = Math.min(v, dw[k + BW] + 1); if (x < BW - 1) v = Math.min(v, dw[k + BW + 1] + 1.4); if (x > 0) v = Math.min(v, dw[k + BW - 1] + 1.4); } dw[k] = v; }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x, adx = Math.abs(x - f.x), beyond = Math.max(0, adx - f.w), dy = y - f.y, lip = lipD[x - x0];
    if (L_WET(m, i) && dy > lip) continue;
    // north of the lip: the cliff top, its height fading away from the falls; the step sharp at the falls, a slope out
    const height = HF * sstep(0, 1, 1 - (beyond - FULL) / (GONE - FULL)) * (1 - sstep(NORTH[0], NORTH[1], lip - dy)) * (0.8 + 0.4 * vn(x, 7, 41, 7505)), soft = 2 + beyond * 0.3;
    let add = dy <= lip ? height : dy < lip + soft ? height * (1 - sstep(0, 1, (dy - lip) / soft)) : 0;
    // below it, the gorge's walls beside the water (open 3 tiles, widening down it), fading south and away
    if (dy > 0 && dy < GORGE) {
      const d = dw[(y - y0) * BW + x - x0], open = 3 + dy * 0.04;
      if (d < INF) add = Math.max(add, HF * sstep(open, open + 6, d) * (1 - sstep(30, 70, d)) * (1 - dy / GORGE) * sstep(0, 10, dy) * sstep(0, 1, 1 - (adx - 50) / 40));   // (rising from the falls' row: no step there)
    }
    if (add > 0 && z[i] > 0) z[i] += add;
  }
}
const L_WET = (m, i) => m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP;
// a road's ground (its grade is the road's): the street and what is built along it, rails and gravel tracks; not a
// bridge (its deck spans the relief) or a pier
const GRADED = (m, i) => { const t = m.tiles[i]; return t === T.ROAD || t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.BUILDING || t === T.FLOOR || t === T.COUNTER || (m.reserve[i] & 2) !== 0 || (m.deck && m.deck[i] && t !== T.BRIDGE); };
const WILD = new Set(['wild', 'rocky', 'desert', 'rural']);
const CLIFFS = new WeakMap();   // (the map -> its cliff bands' mask, for the tests: not kept on the map)
export const reliefCliffs = (m) => CLIFFS.get(m) || null;
export { vn as reliefNoise };

// The relief laid on the built map (World v3's dress hook, before the biomes' dressing - shared/world3-world.js):
// the height field, the roads' grades, the cliff bands and their faces, m.relief. Returns its summary.
export function buildRelief3(m, L, addProp) {
  const W = m.w, H = m.h, N = W * H;
  const { z, tables } = reliefOf3(m, L);
  // (v3b) a table's top and its cliff are rock: the desert's washes and sand sheets there made plain ground (the washes
  // run on between the tables)
  for (const t of tables) {
    const [ex, ey] = tableReach(t, 3);
    for (let y = Math.max(0, Math.floor(t.y - ey)); y <= Math.min(H - 1, t.y + ey); y++) for (let x = Math.max(0, Math.floor(t.x - ex)); x <= Math.min(W - 1, t.x + ex); x++) {
      const i = y * W + x;
      if (m.tiles[i] === T.SAND && !(m.reserve[i] & ~128) && tableEdge(t, x, y) <= 3) { m.tiles[i] = T.DIRT; m.reserve[i] &= ~128; }
    }
  }
  // the roads' grade: their tiles' heights averaged round each (GRADE_CELL cells, GRADE_AVG round), and each tile's
  // distance to the nearest road tile (chessboard, capped)
  const gc = GRADE_CELL, cw = Math.ceil(W / gc) + 1, chh = Math.ceil(H / gc) + 1, S = new Float32Array(cw * chh), Cn = new Float32Array(cw * chh);
  const near = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) if (GRADED(m, i)) { const x = i % W, y = (i / W) | 0, k = ((y / gc) | 0) * cw + ((x / gc) | 0); S[k] += z[i]; Cn[k]++; near[i] = 0; }
  // (H50: a dirt track's line too, wherever its ground is - no cliff band within GRADE_R of a track)
  for (const e of m.edges || []) if (e.kind === 'dirt' && !e.lvl) for (let k = 1; k < e.pts.length; k++) {
    const a = e.pts[k - 1], b = e.pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / TILE));
    for (let j = 0; j <= n; j++) { const x = Math.floor((a.x + (b.x - a.x) * j / n) / TILE), y = Math.floor((a.y + (b.y - a.y) * j / n) / TILE); if (x >= 0 && y >= 0 && x < W && y < H) near[y * W + x] = 0; }
  }
  blur(S, cw, chh, GRADE_AVG); blur(Cn, cw, chh, GRADE_AVG);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!near[i]) continue; let d = near[i]; if (x) d = Math.min(d, near[i - 1] + 1); if (y) { d = Math.min(d, near[i - W] + 1); if (x) d = Math.min(d, near[i - W - 1] + 1); if (x < W - 1) d = Math.min(d, near[i - W + 1] + 1); } near[i] = d; }
  for (let y = H; y--;) for (let x = W; x--;) { const i = y * W + x; if (!near[i]) continue; let d = near[i]; if (x < W - 1) d = Math.min(d, near[i + 1] + 1); if (y < H - 1) { d = Math.min(d, near[i + W] + 1); if (x < W - 1) d = Math.min(d, near[i + W + 1] + 1); if (x) d = Math.min(d, near[i + W - 1] + 1); } near[i] = d; }
  const gradeAt = (x, y) => { const fx = x / gc - 0.5, fy = y / gc - 0.5, ix = clamp(Math.floor(fx), 0, cw - 2), iy = clamp(Math.floor(fy), 0, chh - 2), u = clamp(fx - ix, 0, 1), v = clamp(fy - iy, 0, 1), k = iy * cw + ix;
    const s = (S[k] * (1 - u) + S[k + 1] * u) * (1 - v) + (S[k + cw] * (1 - u) + S[k + cw + 1] * u) * v, n = (Cn[k] * (1 - u) + Cn[k + 1] * u) * (1 - v) + (Cn[k + cw] * (1 - u) + Cn[k + cw + 1] * u) * v;
    return n > 1e-4 ? s / n : null; };
  let cut = 0, fill = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = near[i];
    if (d > GRADE_R || z[i] <= 0) continue;
    const gz = gradeAt(x, y);
    if (gz === null) continue;
    const w = sstep(0, GRADE_R, d), nz = gz + (z[i] - gz) * w;
    if (!d) { if (z[i] > nz + 2) cut++; else if (z[i] < nz - 2) fill++; }
    z[i] = Math.max(0.5, nz);
  }
  // the cliff bands: open wild ground steeper than CLIFF_SLOPE, away from the roads
  const zat = (x, y) => z[y * W + x];
  const free = (i) => { const t = m.tiles[i]; return m.land[i] && !m.reserve[i] && (t === T.GRASS || t === T.DIRT || t === T.SAND) && WILD.has((DISTRICTS[m.dist[i]] || {}).style) && m.dist[i] >= 47; };
  const cliff = new Uint8Array(N);
  let cliffs = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (near[i] <= GRADE_R + 1 || !free(i)) continue;
    const h = z[i], s = Math.max(Math.abs(h - zat(x - 1, y)), Math.abs(h - zat(x + 1, y)), Math.abs(h - zat(x, y - 1)), Math.abs(h - zat(x, y + 1)));
    if (s >= CLIFF_SLOPE && (z[i - 1] > 0 && z[i + 1] > 0 && z[i - W] > 0 && z[i + W] > 0)) { cliff[i] = 1; cliffs++; }
  }
  // (a band less than two tiles thick is no band - a lone tile, a pair, a one-tile line where a slope steepens by a
  // track: dropped; H50)
  const thick = (i) => (cliff[i] && cliff[i + 1] && cliff[i + W] && cliff[i + W + 1]) ? 1 : 0;
  const keepB = new Uint8Array(N);
  for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) { const i = y * W + x; if (thick(i)) keepB[i] = keepB[i + 1] = keepB[i + W] = keepB[i + W + 1] = 1; }
  for (let i = 0; i < N; i++) if (cliff[i] && !keepB[i]) { cliff[i] = 0; cliffs--; }
  // (the forest's steep slopes - the woods, the wild coasts, the islands: not the peaks, the desert or the rocks - are no
  // band of bare cliff with a straight face along it (the owner: "the forest's straight black cliff lines"): the ground
  // stays the forest's, walkable, and a granite outcrop breaks out of the slope here and there - World v3 step 1)
  let outcrops = 0;
  const cell = new Set();   // (one outcrop - a boulder or two - at most in each 11-tile square, at a random spot of the band in it)
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const i = y * W + x;
    if (!cliff[i]) continue;
    const d = m.dist[i], st = (DISTRICTS[d] || {}).style;
    // (the peaks keep their cliffs above the tree line - below it they're the forest's slopes)
    if (st !== 'wild' || ((d === 48 || d === 33) && peakHeight(x, y) >= TREE_LINE)) continue;
    cliff[i] = 0; cliffs--;
    const g = ((x * 73856093) ^ (y * 19349663)) >>> 0, ck = Math.floor(x / 11) * 4096 + Math.floor(y / 11);
    if (cell.has(ck) || (g % 100) >= 9) continue;
    cell.add(ck);
    if (((g >> 7) % 100) >= 45) continue;
    const n = 1 + ((g >> 4) % 3 === 0 ? 1 : 0);
    for (let k = 0; k < n; k++) addProp(m, 'boulder', (x + 0.5 + k * 1.3) * TILE, (y + 0.5 + ((g >> (9 + k)) % 3) - 1) * TILE, 16, { s: 26 + ((g >> (2 + k)) % 19), style: 'granite', moss: (g >> 3) % 3 === 0 ? 1 : 0 });
    outcrops++;
  }
  // (what's left of a band where the forest's part of it went: thinner than two tiles, dropped as before)
  keepB.fill(0);
  for (let y = 1; y < H - 2; y++) for (let x = 1; x < W - 2; x++) { const i = y * W + x; if (thick(i)) keepB[i] = keepB[i + 1] = keepB[i + W] = keepB[i + W + 1] = 1; }
  for (let i = 0; i < N; i++) if (cliff[i] && !keepB[i]) { cliff[i] = 0; cliffs--; }
  for (let i = 0; i < N; i++) if (cliff[i]) { m.tiles[i] = T.WALL; m.reserve[i] |= 32; }
  CLIFFS.set(m, cliff);
  // the desert's tables (H50): red sandstone all round each rim - its band in blocks (a 6-tile grid), each block's face
  // as tall as the table on the south, two thirds of it east and west, a low lip on the north (the face looks away)
  let faces = 0;
  const own = new Uint8Array(N);
  for (const t of tables) {
    const B = 6, [ex, ey] = tableReach(t, 5), bx0 = Math.max(1, Math.floor(t.x - ex)), by0 = Math.max(1, Math.floor(t.y - ey)), bx1 = Math.min(W - 2, Math.ceil(t.x + ex)), by1 = Math.min(H - 2, Math.ceil(t.y + ey));
    for (let gy = by0; gy <= by1; gy += B) for (let gx = bx0; gx <= bx1; gx += B) {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, sx = 0, sy = 0;
      for (let y = gy; y < Math.min(by1 + 1, gy + B); y++) for (let x = gx; x < Math.min(bx1 + 1, gx + B); x++) {
        const i = y * W + x;
        if (!cliff[i] || own[i] || tableEdge(t, x, y) > 4) continue;
        own[i] = 1; n++; sx += x; sy += y; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      if (n < 4) continue;
      const nx = (sx / n - t.x) / t.rx, ny = (sy / n - t.y) / t.ry, nl = Math.sqrt(nx * nx + ny * ny) || 1, f = ny / nl;
      const k = f > 0.45 ? 1 : f > -0.45 ? 0.65 : 0.3, h = Math.round(clamp((40 + t.h * 3) * k, 30, 160) / 10) * 10;
      addProp(m, 'cliff', (x0 + x1 + 1) / 2 * TILE, (y1 + 1) * TILE, 0, { w: (x1 - x0 + 1) * TILE, d: (y1 - y0 + 1) * TILE, h, s: (gx * 7 + gy * 13) % 8 + 1, st: 'sandstone', relief: 1 });
      faces++;
    }
  }
  // the other bands' faces: each run (up to 8 tiles) of band whose south neighbour is lower open ground, its face on
  // that edge
  for (let y = 1; y < H - 1; y++) {
    let run = 0, drop = 0, depth = 0;
    for (let x = 1; x < W; x++) {
      const i = y * W + x, foot = x < W - 1 && cliff[i] && !own[i] && !cliff[i + W] && z[i - W] - z[i + W] > 3;
      if (foot && run < 8) { run++; drop = Math.max(drop, z[i - W * Math.min(3, y)] - z[i + W]); let dd = 1; while (dd < 5 && y - dd > 0 && cliff[i - dd * W]) dd++; depth = Math.max(depth, dd); continue; }
      if (run >= 2) {
        const x0 = x - run, st = (DISTRICTS[m.dist[y * W + x0]] || {}).style, cx = (x0 + run / 2) * TILE, cy = (y + 1) * TILE, h = Math.round(clamp(40 + drop * 3, 50, 160) / 10) * 10;
        if (st === 'desert' || st === 'rocky' || m.dist[y * W + x0] === 48) addProp(m, 'cliff', cx, cy, 0, { w: run * TILE, d: depth * TILE, h, s: (x0 * 7 + y) % 50 + 1, relief: 1, ...(st === 'desert' && { st: 'sandstone' }) });
        else addProp(m, 'cliffwall', cx, cy - 0.4 * TILE, 0, { len: run * TILE, h, d: 64, s: x0 + y, relief: 1 });
        faces++;
      }
      run = foot ? 1 : 0; drop = foot ? z[i - W] - z[i + W] : 0; depth = foot ? 1 : 0;
    }
  }
  // the tables, for the bake (its cap rock on each top, the talus at the foot) and the dressing (no small mesas on them)
  m.tables = tables.map((t) => ({ x: t.x, y: t.y, rx: t.rx, ry: t.ry, s: t.s }));
  // m.relief: metres per tile, ordered-dithered
  const rel = new Uint8Array(N);
  let top = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, h = z[i]; if (h > top) top = h; rel[i] = clamp(Math.floor(h + BAYER[(y & 3) * 4 + (x & 3)]), 0, 255); }
  m.relief = rel;
  return { cell: RELIEF_CELL, top: Math.round(top), tables: tables.length, mesas: tables.filter((t) => t.mesa).length, tableList: tables.map((t) => ({ x: t.x, y: t.y, rx: t.rx, ry: t.ry, h: t.h, mesa: t.mesa, s: t.s })), cliffs, faces, outcrops, cut, fill, falls: fallsOf3(m).map((f) => f.name) };
}
