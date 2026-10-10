// World v3's land (docs/WORLD-V3.md 8.2): the skeleton's polygons and lines (shared/world3-skeleton.js) turned into the
// per-tile layers a build of the v3 frame starts from - what is land and what is water (and which water), the biome,
// the terrain class, the district and the zone of every tile. Nothing live imports it yet: tools/world3-land.mjs draws
// it (docs/world-v3-land.png) and test/world3land.test.js checks it; the generator at the v3 frame will build on it.
//
// buildLand3(today) -> { w, h, layers: { land, water, biome, terrain, dist, zone }, districts, zones }, where `today` is
// a built city of today's world (generateCity): the gulf's places take their districts from it through their pictures,
// and today's small islands are copied from it whole.
// Deterministic (CLAUDE.md): integer tiles, + - * / and Math.floor / ceil / min / max only, no random numbers.
import { T, MAP_W, MAP_H } from './constants.js';
import { Z } from './citylayout.js';
import { FRAME_W, FRAME_H, PLACEMENTS, islandMask } from './world3.js';
import { MAINLAND, BIOMES, ISLANDS, PIECES, PORT_WESTPORT, CANAL, RIVER, STREAMS, LAKES, linePath } from './world3-skeleton.js';

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
export const DISTRICTS3 = [
  { id: 47, name: 'Highland Woods', isl: 'Highland Woods', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 48, name: 'Granite Peaks', isl: 'Granite Peaks', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
  { id: 49, name: 'Willow Valley', isl: 'Willow Valley', style: 'rural', tier: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 50, name: 'Red Rock Desert', isl: 'Red Rock Desert', style: 'desert', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
  { id: 51, name: 'North Ridge', isl: 'North Ridge', style: 'rocky', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
  { id: 52, name: 'Sandpiper Coast', isl: 'Sandpiper Coast', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 53, name: 'Egret Coast', isl: 'Egret Coast', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 54, name: 'Northshore Beaches', isl: 'Northshore', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 55, name: 'Prison Island', isl: 'Prison Island', style: 'rocky', tier: 'rough', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
  { id: 56, name: 'Egret Rocks', isl: 'Egret Coast', style: 'rocky', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
];
// Each biome's ground: its terrain class, how wide its beaches are along the sea (tiles; today's wild coasts have a
// 2-3 tile strip of sand), its district and its zone.
export const BIOME3 = {
  woods: { cls: TERRAIN3.FOREST, beach: 10, dist: 47, zone: 11 },
  peaks: { cls: TERRAIN3.ROCK, beach: 0, dist: 48, zone: 12 },
  valley: { cls: TERRAIN3.FARM, beach: 0, dist: 49, zone: 13 },
  desert: { cls: TERRAIN3.DESERT, beach: 0, dist: 50, zone: 14 },
  ridge: { cls: TERRAIN3.SCRUB, beach: 0, dist: 51, zone: 15 },
  sandpiper: { cls: TERRAIN3.GRASS, beach: 40, dist: 52, zone: 16 },
  egret: { cls: TERRAIN3.MARSH, beach: 24, dist: 53, zone: 17 },
  northshore: { cls: TERRAIN3.GRASS, beach: 30, dist: 54, zone: Z.NORTH },
};
// The islets are today's (district 20/21), each cut from this rectangle of today's map and put with its top-left at
// the skeleton's `at` (the rectangles the skeleton's picture cuts them from: tools/world-v3-skeleton.py MOVES).
export const ISLET_SOURCES = {
  islet1: [510, 605, 575, 670], islet2: [40, 842, 95, 908], islet3: [722, 313, 776, 367],
  islet4: [40, 379, 90, 427], islet5: [803, 278, 845, 322], islet6: [1230, 1078, 1276, 1126],
};
// The shapes are smoothed as the skeleton's picture draws them (tools/world-v3-skeleton.py `smooth`: Chaikin's corner
// cutting, this many rounds), so the land agrees with docs/world-v3-layout-v2.png; the canal is the skeleton's own
// (inCanal: its path at radius 60).
export const SMOOTH = { mainland: 4, biome: 3, lake: 3, gulf: 1, isle: 2, river: 3 };
const CANAL_R = 60;

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

// Today's tile as a terrain class (the town ground: sand stays sand, dirt reads as desert, the rest grass).
const clsOfTile = (t) => (t === T.SAND ? TERRAIN3.SAND : t === T.DIRT ? TERRAIN3.DESERT : TERRAIN3.GRASS);

export function buildLand3(today) {
  const W = FRAME_W, H = FRAME_H, N = W * H;
  const W0 = today.w || MAP_W, H0 = today.h || MAP_H;
  const tLand = today.land, tDist = today.dist, tZone = today.zone, tTiles = today.tiles;
  const land = new Uint8Array(N), water = new Uint8Array(N), biome = new Uint8Array(N), terrain = new Uint8Array(N);
  const dist = new Uint8Array(N).fill(WATER_D), zone = new Uint8Array(N);
  const ox0 = today.x0 || 0, oy0 = today.y0 || 0;   // (a window of today's map: its origin)
  const tIdx = (x, y) => (y - oy0) * W0 + (x - ox0);
  // a frame tile takes today's tile si: its district and zone, its ground. Today's lakes and ponds inside its places
  // are land here (grass): the generator makes them (map.js LAKES, the parks' ponds) as it builds the places.
  const take = (i, si) => { land[i] = 1; dist[i] = tDist[si]; zone[i] = tZone[si]; terrain[i] = clsOfTile(tTiles[si]); };

  // 1. The mainland and its biomes (painted in order, a later one winning), each biome's district, zone and ground.
  const main = new Uint8Array(N);
  const mainland = smoothPoly(MAINLAND, SMOOTH.mainland);
  scanPoly(mainland, W, H, (y, a, b) => main.fill(1, y * W + a, y * W + b));
  BIOMES.forEach((B, k) => scanPoly(B.poly === MAINLAND ? mainland : smoothPoly(B.poly, SMOOTH.biome), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) if (main[i]) biome[i] = k + 1; }));
  const byBiome = BIOMES.map((B) => BIOME3[B.key]);
  for (let i = 0; i < N; i++) {
    if (!main[i]) continue;
    const g = byBiome[biome[i] - 1];
    land[i] = 1; dist[i] = g.dist; zone[i] = g.zone; terrain[i] = g.cls;
  }

  // 2. Today's places at their gulf positions and sizes, through their pictures: the tile goes back to today's map at
  // from + (tile - at) / scale and takes the district there if it is one of the picture's and land.
  const picture = (pic, x, y) => {
    const sx = pic.from[0] + Math.floor((x + 0.5 - pic.at[0]) / pic.scale), sy = pic.from[1] + Math.floor((y + 0.5 - pic.at[1]) / pic.scale);
    if (sx < pic.from[0] || sy < pic.from[1] || sx >= pic.from[2] || sy >= pic.from[3]) return -1;
    if (sx < ox0 || sy < oy0 || sx >= ox0 + W0 || sy >= oy0 + H0) return -1;
    const si = tIdx(sx, sy);
    return tLand[si] && pic.ids.includes(tDist[si]) ? si : -1;
  };
  const picRect = (pic) => [pic.at[0], pic.at[1], Math.min(W, Math.ceil(pic.at[0] + (pic.from[2] - pic.from[0]) * pic.scale)), Math.min(H, Math.ceil(pic.at[1] + (pic.from[3] - pic.from[1]) * pic.scale))];
  // the pieces on the mainland: only where the picture has one of its districts (round them the biome's)
  for (const P of PIECES) {
    const pic = P.picture, [x0, y0, x1, y1] = picRect(pic);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      if (!main[i]) continue;
      const si = picture(pic, x, y);
      if (si < 0) continue;
      take(i, si);
    }
  }
  // the gulf's islands: their polygon is the land; where the picture has none of its districts (today's coast differs
  // from the new one, Metro City's new east shore) the nearest tile that has one lends it its own (a flood)
  const PEND = 255;
  for (const I of ISLANDS) {
    if (!I.poly) continue;
    if (!I.picture) {
      const own = I.key === 'prison' ? { d: 55, z: 18, c: TERRAIN3.GRASS } : { d: 56, z: 17, c: TERRAIN3.ROCK };
      scanPoly(smoothPoly(I.poly, SMOOTH.isle), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) { land[i] = 1; biome[i] = 0; dist[i] = own.d; zone[i] = own.z; terrain[i] = own.c; } });
      continue;
    }
    const pic = I.picture, queue = [];
    let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
    scanPoly(smoothPoly(I.poly, SMOOTH.gulf), W, H, (y, a, b) => {
      if (a < bx0) bx0 = a; if (b > bx1) bx1 = b; if (y < by0) by0 = y; if (y + 1 > by1) by1 = y + 1;
      for (let x = a; x < b; x++) {
        const i = y * W + x, si = picture(pic, x, y);
        land[i] = 1; biome[i] = 0;
        if (si < 0) { dist[i] = PEND; continue; }
        take(i, si);
        queue.push(i);
      }
    });
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % W;
      const go = (k) => { if (dist[k] === PEND && land[k]) { dist[k] = dist[i]; zone[k] = zone[i]; terrain[k] = terrain[i] || TERRAIN3.GRASS; queue.push(k); } };
      if (x > 0) go(i - 1);
      if (x < W - 1) go(i + 1);
      if (i >= W) go(i - W);
      if (i < N - W) go(i + W);
    }
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) { const i = y * W + x; if (dist[i] === PEND) { dist[i] = pic.ids[0]; zone[i] = 0; terrain[i] = TERRAIN3.GRASS; } }
  }

  // 3. Today's small islands placed whole (shared/world3.js PLACEMENTS: frame tile = today's tile + offset; the land
  // an island build keeps, islandMask), and the islets (today's, by their top-left corner).
  const copy = (si, fx, fy) => {
    if (fx < 0 || fy < 0 || fx >= W || fy >= H) return;
    const i = fy * W + fx;
    biome[i] = 0;
    take(i, si);
  };
  const whole = (ox0 === 0 && oy0 === 0 && W0 === MAP_W && H0 === MAP_H) ? tLand : null;
  for (const I of ISLANDS) {
    if (!I.placement) continue;
    const P = PLACEMENTS[I.placement];
    const keep = whole ? islandMask(whole, W0, H0, I.placement, []) : null;
    const [fx0, fy0, fx1, fy1] = P.from;
    for (let y = Math.max(fy0, oy0); y < Math.min(fy1, oy0 + H0); y++) for (let x = Math.max(fx0, ox0); x < Math.min(fx1, ox0 + W0); x++) {
      const si = tIdx(x, y);
      if (keep ? keep[si] : tLand[si]) copy(si, x + P.offset[0], y + P.offset[1]);
    }
  }
  for (const I of ISLANDS) {
    const src = ISLET_SOURCES[I.key];
    if (!src || !I.at) continue;
    const inIt = (x, y) => { const si = tIdx(x, y); return tLand[si] && (tDist[si] === 20 || tDist[si] === 21); };
    let bx = Infinity, by = Infinity;
    for (let y = src[1]; y < src[3]; y++) for (let x = src[0]; x < src[2]; x++) if (inIt(x, y)) { if (x < bx) bx = x; if (y < by) by = y; }
    if (bx === Infinity) continue;
    for (let y = src[1]; y < src[3]; y++) for (let x = src[0]; x < src[2]; x++) if (inIt(x, y)) copy(tIdx(x, y), x - bx + I.at[0], y - by + I.at[1]);
  }

  // 4. Port Westport: new ground on its rectangle.
  {
    const [x0, y0, x1, y1] = PORT_WESTPORT.rect;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      land[i] = 1; dist[i] = 26; zone[i] = Z.WEST; terrain[i] = TERRAIN3.GRASS;
    }
  }

  // 5. The inland water, cut out of the land (the district and zone under it stay): the lakes, the Long Reach, the
  // streams, the canal through Metro City + Southbank.
  const cut = (kind) => (i) => { if (land[i]) { land[i] = 0; water[i] = kind; terrain[i] = TERRAIN3.WATER; } };
  for (const L of LAKES) { const f = cut(WATER3.LAKE); scanPoly(smoothPoly(L.poly, SMOOTH.lake), W, H, (y, a, b) => { for (let i = y * W + a, e = y * W + b; i < e; i++) f(i); }); }
  stampPath(smoothPath(RIVER).pts, RIVER.width / 2, W, H, cut(WATER3.RIVER));
  for (const S of STREAMS) stampPath(smoothPath(S).pts, S.width / 2, W, H, cut(WATER3.STREAM));
  stampPath(linePath(CANAL, CANAL_R).pts, CANAL.width / 2, W, H, cut(WATER3.CANAL));

  // 6. The sea: everything else, shallow near land and deep beyond (today's rule), in today's sea district.
  const d = main;   // (reused as the distance grid)
  for (let i = 0; i < N; i++) d[i] = land[i] ? 0 : 255;
  chamfer(d, W, H, 255);
  for (let i = 0; i < N; i++) {
    if (land[i] || water[i]) continue;
    water[i] = d[i] <= SHALLOW_Q ? WATER3.SEA : WATER3.DEEP;
    dist[i] = WATER_D; zone[i] = Z.SEA; biome[i] = 0; terrain[i] = TERRAIN3.WATER;
  }

  // 7. Beaches: sand along the sea where the biome has them, as wide as its `beach` (not on today's places).
  for (let i = 0; i < N; i++) d[i] = water[i] === WATER3.SEA || water[i] === WATER3.DEEP ? 0 : 255;
  chamfer(d, W, H, 255);
  for (let i = 0; i < N; i++) {
    if (!land[i] || !biome[i] || dist[i] < 47) continue;
    const g = byBiome[biome[i] - 1];
    if (g.beach && d[i] <= g.beach * 4) terrain[i] = TERRAIN3.SAND;
  }

  return { w: W, h: H, layers: { land, water, biome, terrain, dist, zone }, districts: DISTRICTS3, zones: ZONES3 };
}

// The district record for an id (today's from shared/map.js's list, the new ones from this file's).
export function district3(districts, id) {
  return id >= 47 ? DISTRICTS3[id - 47] : districts[id];
}
