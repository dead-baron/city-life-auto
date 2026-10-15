// World v3's land (docs/WORLD-V3.md 8.2): the skeleton's polygons and lines (shared/world3-skeleton.js) turned into the
// per-tile layers a build of the v3 frame starts from - what is land and what is water (and which water), the biome,
// the terrain class, the district and the zone of every tile. Nothing live imports it yet: tools/world3-land.mjs draws
// it (docs/world-v3-land.png) and test/world3land.test.js checks it; the generator at the v3 frame will build on it.
//
// buildLand3(today) -> { w, h, layers: { land, water, biome, terrain, dist, zone }, districts, zones }. World v3b (part
// 9): nothing of today's world is copied (`today` is accepted and unused): the mainland in its biomes, the islands as
// meadow (the city generator, shared/world3-city.js, paints the city's districts over the land's), the sketch's ground
// classes (GROUND3: forest, fields, desert, canyon floors, mesas, mountains, the built areas) over the biomes' own.
// Deterministic (CLAUDE.md): integer tiles, + - * / and Math.floor / ceil / min / max only, no random numbers.
import { Z } from './citylayout.js';
import { DISTRICTS } from './mapcore.js';
import { FRAME_W, FRAME_H } from './world3.js';
import { MAINLAND, BIOMES, ISLANDS, RIVER, STREAMS, LAKES } from './world3-skeleton.js';
import { GROUND3 } from './world3-layout.js';

// The `water` layer: 0 on land, else which water.
export const WATER3 = { LAND: 0, SEA: 1, DEEP: 2, LAKE: 3, RIVER: 4, CANAL: 5, STREAM: 6 };
// The `terrain` layer: today's wild classes (map.js decodeTerrain: W G F D R S) and three new ones.
export const TERRAIN3 = { WATER: 0, GRASS: 1, FOREST: 2, DESERT: 3, ROCK: 4, SAND: 5, FARM: 6, MARSH: 7, SCRUB: 8 };
// The sea within this many quarter tiles of land is shallow (T.WATER), beyond it deep (T.DEEP): today's rule
// (map.js: `toLand <= 12 ? T.WATER : T.DEEP`, a chamfer distance in quarter tiles).
export const SHALLOW_Q = 12;
const WATER_D = 13;   // today's district of the open sea (Liberty Bay)

// The new zones: one per mainland region (today's run 0-10, shared/citylayout.js Z). Northshore's beach towns stay in
// today's Z.NORTH, Port Westport in Z.WEST.
export const ZONES3 = [
  { id: 11, key: 'woods', name: 'Highland Woods' },
  { id: 12, key: 'peaks', name: 'Granite Peaks' },
  { id: 13, key: 'valley', name: 'Willow Valley' },
  { id: 14, key: 'desert', name: 'Red Rock Desert' },
  { id: 15, key: 'ridge', name: 'North Ridge' },
  { id: 16, key: 'sandpiper', name: 'Sandpiper Coast' },
  { id: 17, key: 'egret', name: 'Egret Coast' },
  { id: 18, key: 'prison', name: 'Prison Island' },
];
// The new districts (ids from 47 on, after today's shared/map.js DISTRICTS, shaped as they are): one per biome for the
// mainland round today's places, Prison Island and the Egret Rocks.
export const DISTRICTS3 = DISTRICTS.slice(47);   // (they are shared/mapcore.js DISTRICTS' from 47 on: the page knows them)
// Each biome's ground: its terrain class, how wide its beaches are along the sea (tiles; today's wild coasts have a
// 2-3 tile strip of sand), its district and its zone.
export const BIOME3 = {
  woods: { cls: TERRAIN3.GRASS, beach: 10, dist: 47, zone: 11 },   // (its meadows: the forest is GROUND3's)
  peaks: { cls: TERRAIN3.ROCK, beach: 0, dist: 48, zone: 12 },
  valley: { cls: TERRAIN3.GRASS, beach: 6, dist: 49, zone: 13 },   // (meadows: the fields are GROUND3's)
  desert: { cls: TERRAIN3.DESERT, beach: 0, dist: 50, zone: 14 },
  ridge: { cls: TERRAIN3.SCRUB, beach: 0, dist: 51, zone: 15 },
  sandpiper: { cls: TERRAIN3.GRASS, beach: 40, dist: 52, zone: 16 },
  egret: { cls: TERRAIN3.MARSH, beach: 24, dist: 53, zone: 17 },
  northshore: { cls: TERRAIN3.GRASS, beach: 30, dist: 54, zone: Z.NORTH },
};
// The islands' own ground (by key; the rest are rocks and islets): the city islands, the ferry island and the key in
// Willow Valley's meadow district and zone until the city generator paints them, with a beach; Prison Island its own.
const ISLE3 = {
  prison: { d: 55, z: 18, c: TERRAIN3.GRASS, beach: 4 },
  city: { d: 49, z: 13, c: TERRAIN3.GRASS, beach: 12 },
  rock: { d: 56, z: 17, c: TERRAIN3.ROCK, beach: 0 },
};
const isleOf = (key) => (key === 'prison' ? ISLE3.prison : /^(rock|islet)/.test(key) ? ISLE3.rock : ISLE3.city);
// GROUND3's classes, painted over the biomes' own in this order (a later one wins): the built areas stay grass (the
// city generator's ground), the canyon floors are sand, the mesas and the mountains rock.
export const GROUND_CLS = {
  city: TERRAIN3.GRASS, forest: TERRAIN3.FOREST, field: TERRAIN3.FARM, desert: TERRAIN3.DESERT, canyon: TERRAIN3.SAND, mesa: TERRAIN3.ROCK, mount: TERRAIN3.ROCK,
};
// The shapes are smoothed (Chaikin's corner cutting, this many rounds): the traced outlines are within 4 tiles of the
// sketch's, so a little rounding takes their corners off.
export const SMOOTH = { mainland: 2, biome: 3, lake: 2, gulf: 1, isle: 2, river: 3, ground: 1 };

// Chaikin's corner cutting (the picture's `smooth`): each round puts two points at 1/4 and 3/4 of every edge; an open
// line keeps its ends.
export function chaikin(pts, closed, it) {
  for (let r = 0; r < it; r++) {
    const out = [], n = pts.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    pts = closed ? out : [pts[0], ...out, pts[n - 1]];
  }
  return pts;
}
// A polygon smoothed, but its stretches along the frame's edges kept straight (the world's edge is not a coast): the
// chains between its vertices on the edge are smoothed as open lines.
export function smoothPoly(poly, it, W = FRAME_W, H = FRAME_H) {
  const onEdge = (p) => p[0] <= 0 || p[1] <= 0 || p[0] >= W - 1 || p[1] >= H - 1;
  const n = poly.length, k0 = poly.findIndex(onEdge);
  if (k0 < 0) return chaikin(poly, true, it);
  const out = [];
  let chain = [poly[k0]];
  for (let s = 1; s <= n; s++) {
    const p = poly[(k0 + s) % n];
    chain.push(p);
    if (onEdge(p)) { const c = chain.length > 2 ? chaikin(chain, false, it) : chain; out.push(...c.slice(0, -1)); chain = [p]; }
  }
  return out;
}
// A line smoothed as the picture draws it, as a path ({ pts, s, length }, like linePath's) for pointAt / nearestOnPath.
export function smoothPath(line, it = SMOOTH.river) {
  const pts = chaikin(line.pts, false, it), s = [0];
  for (let j = 1; j < pts.length; j++) { const dx = pts[j][0] - pts[j - 1][0], dy = pts[j][1] - pts[j - 1][1]; s.push(s[j - 1] + Math.sqrt(dx * dx + dy * dy)); }
  return { pts, s, length: s[s.length - 1] };
}

// A polygon vertex on the frame's last tile is on its edge (the mainland's east side is drawn at x = 5039).
const snap = (v, n) => (v >= n - 1 ? n : v);

// Scanline fill: span(y, x0, x1) for each run of tiles [x0, x1) in row y whose centres are inside the polygon
// (even-odd), clipped to W x H.
export function scanPoly(poly, W, H, span) {
  const n = poly.length, px = new Float64Array(n), py = new Float64Array(n);
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < n; i++) {
    px[i] = snap(poly[i][0], W); py[i] = snap(poly[i][1], H);
    if (py[i] < ymin) ymin = py[i];
    if (py[i] > ymax) ymax = py[i];
  }
  const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(H - 1, Math.ceil(ymax));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ay = py[j], by = py[i];
      if ((ay > cy) !== (by > cy)) xs.push(px[j] + (cy - ay) * (px[i] - px[j]) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W, Math.ceil(xs[k + 1] - 0.5));
      if (b > a) span(y, a, b);
    }
  }
}

// A thick line: put(i) for each tile whose centre is within hw of the path (the path's segments as capsules).
export function stampPath(pts, hw, W, H, put) {
  const r2 = hw * hw;
  for (let j = 1; j < pts.length; j++) {
    const ax = pts[j - 1][0], ay = pts[j - 1][1], dx = pts[j][0] - ax, dy = pts[j][1] - ay, L2 = dx * dx + dy * dy;
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - hw)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, ax + dx) + hw));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - hw)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, ay + dy) + hw));
    for (let y = y0; y <= y1; y++) {
      const cy = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        let w = L2 ? ((cx - ax) * dx + (cy - ay) * dy) / L2 : 0;
        w = w < 0 ? 0 : w > 1 ? 1 : w;
        const qx = ax + dx * w - cx, qy = ay + dy * w - cy;
        if (qx * qx + qy * qy < r2) put(y * W + x);
      }
    }
  }
}

// Chamfer distance (quarter tiles, 4 along, 6 diagonal, capped) in place: d holds 0 at the sources and cap elsewhere.
function chamfer(d, W, H, cap) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let v = d[i];
    if (!v) continue;
    if (x > 0 && d[i - 1] + 4 < v) v = d[i - 1] + 4;
    if (y > 0) {
      if (d[i - W] + 4 < v) v = d[i - W] + 4;
      if (x > 0 && d[i - W - 1] + 6 < v) v = d[i - W - 1] + 6;
      if (x < W - 1 && d[i - W + 1] + 6 < v) v = d[i - W + 1] + 6;
    }
    d[i] = v < cap ? v : cap;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    let v = d[i];
    if (!v) continue;
    if (x < W - 1 && d[i + 1] + 4 < v) v = d[i + 1] + 4;
    if (y < H - 1) {
      if (d[i + W] + 4 < v) v = d[i + W] + 4;
      if (x < W - 1 && d[i + W + 1] + 6 < v) v = d[i + W + 1] + 6;
      if (x > 0 && d[i + W - 1] + 6 < v) v = d[i + W - 1] + 6;
    }
    d[i] = v < cap ? v : cap;
  }
}

export function buildLand3(today = null) {
  const W = FRAME_W, H = FRAME_H, N = W * H;
  const land = new Uint8Array(N), water = new Uint8Array(N), biome = new Uint8Array(N), terrain = new Uint8Array(N);
  const dist = new Uint8Array(N).fill(WATER_D), zone = new Uint8Array(N);
  const isleBeach = new Uint8Array(N);   // (an island tile's beach width, tiles)

  // 1. The mainland and its biomes (painted in order, a later one winning), each biome's district, zone and ground.
  const main = new Uint8Array(N);
  const mainland = smoothPoly(MAINLAND, SMOOTH.mainland);
  scanPoly(mainland, W, H, (y, a, b) => main.fill(1, y * W + a, y * W + b));
  BIOMES.forEach((B, k) => {
    for (const poly of B.polys || [B.poly]) scanPoly(poly === MAINLAND ? mainland : smoothPoly(poly, SMOOTH.biome), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) if (main[i]) biome[i] = k + 1; });
  });
  const byBiome = BIOMES.map((B) => BIOME3[B.key]);
  for (let i = 0; i < N; i++) {
    if (!main[i]) continue;
    const g = byBiome[biome[i] - 1];
    land[i] = 1; dist[i] = g.dist; zone[i] = g.zone; terrain[i] = g.cls;
  }

  // 2. The islands: their polygons are the land, each in its own ground (isleOf).
  for (const I of ISLANDS) {
    const own = isleOf(I.key);
    scanPoly(smoothPoly(I.poly, I.poly.length > 40 ? SMOOTH.gulf : SMOOTH.isle), W, H, (y, a, b) => {
      for (let i = y * W + a, e = y * W + b; i < e; i++) { land[i] = 1; biome[i] = 0; dist[i] = own.d; zone[i] = own.z; terrain[i] = own.c; isleBeach[i] = own.beach; }
    });
  }

  // 3. The sketch's ground (GROUND3) over the biomes' own classes, on the land only.
  for (const key of ['city', 'forest', 'field', 'desert', 'canyon', 'mesa', 'mount']) {
    const c = GROUND_CLS[key];
    for (const poly of GROUND3[key]) scanPoly(smoothPoly(poly, SMOOTH.ground), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) if (land[i]) terrain[i] = c; });
  }

  // 4. The inland water, cut out of the land (the district and zone under it stay): the lakes, the river, the streams.
  const cut = (kind) => (i) => { if (land[i]) { land[i] = 0; water[i] = kind; terrain[i] = TERRAIN3.WATER; } };
  for (const L of LAKES) { const f = cut(WATER3.LAKE); scanPoly(smoothPoly(L.poly, SMOOTH.lake), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) f(i); }); }
  if (RIVER) stampPath(smoothPath(RIVER).pts, RIVER.width / 2, W, H, cut(WATER3.RIVER));
  for (const S of STREAMS) stampPath(smoothPath(S).pts, S.width / 2, W, H, cut(WATER3.STREAM));

  // 5. The sea: everything else, shallow near land and deep beyond (today's rule), in today's sea district.
  const d = main;   // (reused as the distance grid)
  for (let i = 0; i < N; i++) d[i] = land[i] ? 0 : 255;
  chamfer(d, W, H, 255);
  for (let i = 0; i < N; i++) {
    if (land[i] || water[i]) continue;
    water[i] = d[i] <= SHALLOW_Q ? WATER3.SEA : WATER3.DEEP;
    dist[i] = WATER_D; zone[i] = Z.SEA; biome[i] = 0; terrain[i] = TERRAIN3.WATER;
  }

  // 6. Beaches: sand along the sea where the biome or the island has them, as wide as its `beach` (not on rock).
  for (let i = 0; i < N; i++) d[i] = water[i] === WATER3.SEA || water[i] === WATER3.DEEP ? 0 : 255;
  chamfer(d, W, H, 255);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const beach = biome[i] ? byBiome[biome[i] - 1].beach : isleBeach[i];
    if (beach && d[i] <= beach * 4 && terrain[i] !== TERRAIN3.ROCK) terrain[i] = TERRAIN3.SAND;
  }

  return { w: W, h: H, layers: { land, water, biome, terrain, dist, zone }, districts: DISTRICTS3, zones: ZONES3 };
}

// The district record for an id (today's from shared/map.js's list, the new ones from this file's).
export function district3(districts, id) {
  return id >= 47 ? DISTRICTS3[id - 47] : districts[id];
}
