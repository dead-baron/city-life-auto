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

export const RELIEF_CELL = 8;      // the coarse grid of the biomes' ground (tiles)
export const CLIFF_SLOPE = 2.2;    // m per tile: steeper (on open wild ground) is a cliff band
export const GRADE_R = 14;         // tiles over which the land beside a road comes back to its own height
const GRADE_CELL = 4, GRADE_AVG = 6;   // the road grade: the road tiles' heights averaged in 4-tile cells, 6 cells round
const BIO = Object.fromEntries(BIOMES.map((b, k) => [b.key, k + 1]));   // (the land layer's biome numbers)
const LM = (name) => LANDMARKS.find((l) => l.name === name)?.at;
// the places on high ground (the tests check each): [name, at, radius (tiles) round which it stands highest]
export const HIGH_SPOTS = [
  ['Lookout Hill', LM('Lookout Hill'), 110, 34, false],
  ['North Cape', [210, 900], 95, 22, true],
  ['Egret Point', LM('Egret Point Light'), 80, 20, true],
  ['Sandpiper Point', LM('Sandpiper Point Light'), 85, 18, true],
  ['Toll Point', [3880, 2520], 70, 12, true],
];
export const LOOKOUT_MESA = { at: [4342, 860], rx: 50, ry: 34, h: 32 };   // (the track from Dusty Hollow climbs its south rim)   // (8.18's lookout stands on it)
const GORGE = [[1250, 690], [1330, 770], [1450, 870], [1530, 945]];      // across the Gorge Bridge (the Highland Highway's [1230, 900]-[1430, 640]), clear of Silver Thread Falls

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
  if (b === BIO.peaks) return 175 * peakHeight(tx, ty);
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

// The height field (decimetres, one per tile) of the built map m on the land layers L, before the cliffs: what the
// cliffs and m.relief are made from. Pure: the same map and land give the same field (the tests build it twice).
export function reliefOf3(m, L) {
  const W = m.w, H = m.h, C = RELIEF_CELL, gw = Math.ceil(W / C) + 1, gh = Math.ceil(H / C) + 1;
  // 1. the coarse ground: the biomes', blurred; inland water a little lower (valleys); the sea -2
  const g = new Float32Array(gw * gh), g2 = new Float32Array(gw * gh), sea = new Uint8Array(gw * gh);
  for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) {
    const tx = Math.min(W - 1, cx * C), ty = Math.min(H - 1, cy * C), i = ty * W + tx, w = L.water[i], k = cy * gw + cx;
    if (w === WATER3.SEA || w === WATER3.DEEP) { g[k] = -2; sea[k] = 1; continue; }
    g[k] = biomeBase(L.biome[i], tx, ty) - (w ? 4 : 0); g2[k] = biomeShape(L.biome[i], tx, ty);
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
  for (const t of tables) table(z, W, H, t);
  gorge(m, z, W, H);
  for (const f of fallsOf3(m)) escarpment(m, z, W, H, f);
  return { z, tables };
}

// the tables: a jittered grid over the desert (230 tiles), a mesa or a butte in most cells - where nothing is built
// and no water lies under it - and the lookout's mesa (8.18) by Dusty Hollow
function tablesOf3(m, L, z) {
  const W = m.w, H = m.h, out = [{ ...LOOKOUT_MESA, x: LOOKOUT_MESA.at[0], y: LOOKOUT_MESA.at[1], mesa: true, s: 1, lookout: true }];
  const P = BIOMES[BIO.desert - 1].poly, S = 230;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const graded = (i) => GRADED(m, i);
  for (let gy = Math.floor(y0 / S); gy * S < y1; gy++) for (let gx = Math.floor(x0 / S); gx * S < x1; gx++) {
    const u = hash(gx, gy, 7201);
    if (u < 0.12) continue;
    const mesa = u > 0.5, cx = Math.round((gx + 0.22 + 0.56 * hash(gx, gy, 7202)) * S), cy = Math.round((gy + 0.22 + 0.56 * hash(gx, gy, 7203)) * S);
    let rx = mesa ? 50 + 60 * hash(gx, gy, 7204) : 16 + 16 * hash(gx, gy, 7204), ry = mesa ? rx * (0.55 + 0.3 * hash(gx, gy, 7205)) : rx * (0.8 + 0.3 * hash(gx, gy, 7205));
    const h = mesa ? 30 + 20 * hash(gx, gy, 7206) : 26 + 18 * hash(gx, gy, 7206);
    // (shrunk once, then given up, if it would cover anything built, reserved or wet - or leave the desert)
    for (let tries = 0; tries < 3; tries++, rx *= 0.72, ry *= 0.72) {
      let bad = 0, n = 0;
      for (let y = Math.floor(cy - ry - 16); y <= cy + ry + 16; y += 3) for (let x = Math.floor(cx - rx - 16); x <= cx + rx + 16; x += 3) {
        if (x < 0 || y < 0 || x >= W || y >= H) { bad += 99; continue; }
        const i = y * W + x; n++;
        const t = m.tiles[i];   // (a road may cross it - a cutting - but nothing built, kept or wet may stand on it)
        if (L.biome[i] !== BIO.desert || L.water[i] || (graded(i) && t !== T.ROAD && !(m.reserve[i] & 2)) || (m.reserve[i] & ~2) || t === T.WATER) bad++;
      }
      if (bad <= n * 0.01 && !out.some((o) => Math.abs(o.x - cx) < o.rx + rx + 30 && Math.abs(o.y - cy) < o.ry + ry + 30)) { out.push({ x: cx, y: cy, rx: Math.round(rx), ry: Math.round(ry), h: Math.round(h), mesa, s: gx * 31 + gy }); break; }
    }
  }
  return out;
}
// a table: a flat top inside a ragged superellipse rim, a cliff 3 tiles wide down to its talus, the apron 11 more
function table(z, W, H, t) {
  const R = Math.min(t.rx, t.ry), pad = 16;
  for (let y = Math.max(0, Math.floor(t.y - t.ry - pad)); y <= Math.min(H - 1, t.y + t.ry + pad); y++) for (let x = Math.max(0, Math.floor(t.x - t.rx - pad)); x <= Math.min(W - 1, t.x + t.rx + pad); x++) {
    const ax = (x - t.x) / t.rx, ay = (y - t.y) / t.ry, a2 = ax * ax, b2 = ay * ay;
    const q = Math.sqrt(Math.sqrt(a2 * a2 + b2 * b2)) * (1 + 0.16 * (vn(x, y, 21, 7301 + t.s) - 0.5) + 0.06 * (vn(x, y, 7, 7302 + t.s) - 0.5));
    const e = (q - 1) * R;
    let add;
    if (e <= 0) add = t.h + 2 * vn(x, y, 40, 7303 + t.s);
    else if (e <= 3) add = t.h * (1 - 0.7 * e / 3);
    else if (e <= 14) { const f = 1 - (e - 3) / 11; add = t.h * 0.3 * f * f; }
    else continue;
    const i = y * W + x;
    if (z[i] > 0) z[i] += add;
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
// each falls: the land north of its lip raised (the band a real cliff across the creek, 70 tiles either side, fading
// by 120), and its gorge below: the ground beside the pool and the creek raised as walls, open to the south (90 tiles)
export function fallsOf3(m) {
  const out = [];
  const head = m.world3?.west?.built?.falls?.head;
  if (head) out.push({ x: head[0], y: head[1] - 3, name: 'Silver Thread Falls', w: 16 });
  for (const s of m.natureSites || []) {
    if (s.falls && Number.isFinite(s.falls.x) && Number.isFinite(s.falls.y)) out.push({ x: Math.floor(s.falls.x / TILE), y: Math.floor((s.falls.y - (s.falls.drop || 40)) / TILE), name: s.name || s.kind, w: Math.ceil((s.falls.w || 64) / TILE / 2) + 2 });
  }
  return out.filter((f) => f.x >= 0 && f.y >= 0 && f.x < m.w && f.y < m.h && m.dist[f.y * m.w + f.x] >= 47);
}
function escarpment(m, z, W, H, f) {
  const HF = 22;
  for (let y = Math.max(0, f.y - 140); y <= Math.min(H - 1, f.y + 100); y++) for (let x = Math.max(0, f.x - 130); x <= Math.min(W - 1, f.x + 130); x++) {
    const i = y * W + x, dx = Math.abs(x - f.x), dy = y - f.y;
    if (L_WET(m, i) && dy > 0) continue;
    // north of the lip: the cliff top (the lip's line wobbles a little east-west)
    const lip = 1.5 * (vn(x, 0, 23, 7501) - 0.5), across = sstep(0, 1, 1 - (dx - 70) / 50);
    let add = 0;
    if (dy <= lip) add = HF * across;
    else if (dy < lip + 3) add = HF * across * (1 - (dy - lip) / 3) * 0.25;
    // below it, the gorge's walls either side of the pool and the creek
    if (dy > 0 && dy < 90) {
      const open = f.w + 4 + dy * 0.05, wall = open + 4;
      const k = dx <= open ? 0 : dx >= wall ? 1 : (dx - open) / 4;
      add = Math.max(add, HF * k * (1 - dy / 90) * sstep(0, 1, 1 - (dx - 60) / 40));
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

// The relief laid on the built map (World v3's dress hook, before the biomes' dressing - shared/world3-world.js):
// the height field, the roads' grades, the cliff bands and their faces, m.relief. Returns its summary.
export function buildRelief3(m, L, addProp) {
  const W = m.w, H = m.h, N = W * H;
  const { z, tables } = reliefOf3(m, L);
  // the roads' grade: their tiles' heights averaged round each (GRADE_CELL cells, GRADE_AVG round), and each tile's
  // distance to the nearest road tile (chessboard, capped)
  const gc = GRADE_CELL, cw = Math.ceil(W / gc) + 1, chh = Math.ceil(H / gc) + 1, S = new Float32Array(cw * chh), Cn = new Float32Array(cw * chh);
  const near = new Uint8Array(N).fill(255);
  for (let i = 0; i < N; i++) if (GRADED(m, i)) { const x = i % W, y = (i / W) | 0, k = ((y / gc) | 0) * cw + ((x / gc) | 0); S[k] += z[i]; Cn[k]++; near[i] = 0; }
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
  // (a lone tile or a pair is no band: dropped)
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!cliff[i]) continue; let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += cliff[i + dy * W + dx]; if (n < 3) { cliff[i] = 0; cliffs--; } }
  for (let i = 0; i < N; i++) if (cliff[i]) { m.tiles[i] = T.WALL; m.reserve[i] |= 32; }
  CLIFFS.set(m, cliff);
  // the faces: each run (up to 8 tiles) of band whose south neighbour is lower open ground, its face on that edge
  let faces = 0;
  for (let y = 1; y < H - 1; y++) {
    let run = 0, drop = 0, depth = 0;
    for (let x = 1; x < W; x++) {
      const i = y * W + x, foot = x < W - 1 && cliff[i] && !cliff[i + W] && z[i - W] - z[i + W] > 3;
      if (foot && run < 8) { run++; drop = Math.max(drop, z[i - W * Math.min(3, y)] - z[i + W]); let dd = 1; while (dd < 5 && y - dd > 0 && cliff[i - dd * W]) dd++; depth = Math.max(depth, dd); continue; }
      if (run >= 2) {
        const x0 = x - run, st = (DISTRICTS[m.dist[y * W + x0]] || {}).style, cx = (x0 + run / 2) * TILE, cy = (y + 1) * TILE, h = Math.round(clamp(40 + drop * 3, 50, 160) / 10) * 10;
        if (st === 'desert' || st === 'rocky' || m.dist[y * W + x0] === 48) addProp(m, 'cliff', cx, cy, 0, { w: run * TILE, d: depth * TILE, h, s: (x0 * 7 + y) % 50 + 1, relief: 1 });
        else addProp(m, 'cliffwall', cx, cy - 0.4 * TILE, 0, { len: run * TILE, h, d: 64, s: x0 + y, relief: 1 });
        faces++;
      }
      run = foot ? 1 : 0; drop = foot ? z[i - W] - z[i + W] : 0; depth = foot ? 1 : 0;
    }
  }
  // m.relief: metres per tile, ordered-dithered
  const rel = new Uint8Array(N);
  let top = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, h = z[i]; if (h > top) top = h; rel[i] = clamp(Math.floor(h + BAYER[(y & 3) * 4 + (x & 3)]), 0, 255); }
  m.relief = rel;
  return { cell: RELIEF_CELL, top: Math.round(top), tables: tables.length, mesas: tables.filter((t) => t.mesa).length, tableList: tables.map((t) => ({ x: t.x, y: t.y, rx: t.rx, ry: t.ry, h: t.h, mesa: t.mesa })), cliffs, faces, cut, fill, falls: fallsOf3(m).map((f) => f.name) };
}
