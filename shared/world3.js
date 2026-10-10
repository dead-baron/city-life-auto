// World v3's frame and its regions (docs/WORLD-V3.md part 4). Nothing live imports this yet: it is the engine's first
// piece for the bigger world - the frame's size, the regions it is cut into, where a tile or a chunk falls, a region's
// own seed, and where today's islands are placed in the frame (part 2's offsets, not approved yet). Pure integer
// arithmetic, so every JS engine gets the same answers (CLAUDE.md: shared code is deterministic).
import { CHUNK_TILES } from './constants.js';

// The frame: 5040 x 4032 tiles (1 tile = 1 m), 10 x 8 regions of 504 x 504 tiles, each 21 x 21 net chunks of 24 tiles
// (the art v2 bake chunk is the same 24 tiles, 768 px). A 3 x 3 window of regions (1.5 km square) is about today's
// whole map.
export const REGION_CHUNKS = 21;
export const REGION_TILES = REGION_CHUNKS * CHUNK_TILES;   // 504
export const REGIONS_X = 10;
export const REGIONS_Y = 8;
export const REGION_COUNT = REGIONS_X * REGIONS_Y;          // 80
export const FRAME_W = REGIONS_X * REGION_TILES;            // 5040 tiles
export const FRAME_H = REGIONS_Y * REGION_TILES;            // 4032 tiles
export const FRAME_CHUNKS_X = REGIONS_X * REGION_CHUNKS;    // 210
export const FRAME_CHUNKS_Y = REGIONS_Y * REGION_CHUNKS;    // 168

export const inFrame = (tx, ty) => tx >= 0 && ty >= 0 && tx < FRAME_W && ty < FRAME_H;

// A region's index (row-major) from its column and row, or -1 outside the frame.
export function regionIndex(rx, ry) {
  return rx >= 0 && ry >= 0 && rx < REGIONS_X && ry < REGIONS_Y ? ry * REGIONS_X + rx : -1;
}
export function regionXY(ri) {
  return { rx: ri % REGIONS_X, ry: (ri / REGIONS_X) | 0 };
}
// Its name as a key (the browser's store, logs): 'r3-5' is column 3, row 5.
export const regionKey = (ri) => `r${ri % REGIONS_X}-${(ri / REGIONS_X) | 0}`;
// The region a tile is in, or -1 outside the frame (Math.floor: tiles left of or above the frame are outside too).
export function regionAt(tx, ty) {
  if (!inFrame(tx, ty)) return -1;
  return regionIndex(Math.floor(tx / REGION_TILES), Math.floor(ty / REGION_TILES));
}
// The tiles it covers: [x0, y0, x1, y1) in frame tiles.
export function regionBounds(ri) {
  const { rx, ry } = regionXY(ri);
  return [rx * REGION_TILES, ry * REGION_TILES, (rx + 1) * REGION_TILES, (ry + 1) * REGION_TILES];
}
// A tile's index inside its region's own grids (REGION_TILES square), the way `ty * MAP_W + tx` indexes today's map.
export function localIndex(ri, tx, ty) {
  const { rx, ry } = regionXY(ri);
  return (ty - ry * REGION_TILES) * REGION_TILES + (tx - rx * REGION_TILES);
}
// Net chunks (CHUNK_TILES) of the frame: a region holds REGION_CHUNKS x REGION_CHUNKS whole chunks, so a chunk is in
// exactly one region.
export const chunkRegion = (cx, cy) => regionIndex(Math.floor(cx / REGION_CHUNKS), Math.floor(cy / REGION_CHUNKS));
// The regions a tile rectangle [x0, y0, x1, y1) touches, clipped to the frame, row by row.
export function regionsInRect(x0, y0, x1, y1) {
  const out = [];
  const rx0 = Math.max(0, Math.floor(x0 / REGION_TILES)), rx1 = Math.min(REGIONS_X - 1, Math.floor((x1 - 1) / REGION_TILES));
  const ry0 = Math.max(0, Math.floor(y0 / REGION_TILES)), ry1 = Math.min(REGIONS_Y - 1, Math.floor((y1 - 1) / REGION_TILES));
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) out.push(regionIndex(rx, ry));
  return out;
}
// The regions within r of the one a tile is in (r = 1: the 3 x 3 window the client keeps), clipped to the frame.
export function regionsAround(tx, ty, r = 1) {
  const ri = regionAt(tx, ty);
  if (ri < 0) return [];
  const { rx, ry } = regionXY(ri);
  const out = [];
  for (let y = ry - r; y <= ry + r; y++) for (let x = rx - r; x <= rx + r; x++) { const k = regionIndex(x, y); if (k >= 0) out.push(k); }
  return out;
}

// A region's own seed, from the world's seed and the region: its generators draw from it alone, so a region comes out
// the same whichever regions were built before it, in whatever order (today's world draws from one stream for the
// whole map). Integer mixing only (a murmur3-style finaliser); never 0.
export function regionSeed(worldSeed, ri) {
  let h = (Math.imul(worldSeed | 0, 0x9e3779b1) ^ Math.imul((ri | 0) + 1, 0x85ebca77)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) || 0x9e3779b1;
}

// Where today's islands go in the frame (part 2's table: v3 tile = today's tile + offset). `from` is the island's
// rectangle in today's map, [x0, y0, x1, y1) in tiles. A draft for the owner to OK: nothing reads it yet but the spike
// (tools/world3-spike.mjs) and the tests.
export const PLACEMENTS = {
  metro: { name: 'Metro City + Southbank + Pelican Key', from: [542, 301, 1046, 948], offset: [1591, 1729] },
  westport: { name: 'Westport', from: [34, 237, 498, 779], offset: [1400, 1800] },
  airport: { name: 'Westport International', from: [68, 614, 391, 918], offset: [1950, 2140] },
  cedar: { name: 'Cedar Isle', from: [270, 784, 992, 1159], offset: [2580, 2066] },
  northshore: { name: 'Northshore, North Point, The Bluffs', from: [748, 29, 1208, 280], offset: [1510, 1560] },
  highland: { name: 'Highland Woods', from: [31, 71, 405, 335], offset: [300, 1000] },
  granite: { name: 'Granite Peaks', from: [459, 17, 819, 288], offset: [600, 150] },
  drycreek: { name: 'Dry Creek', from: [1045, 251, 1298, 960], offset: [2555, 649] },
  gull: { name: 'Gull Harbor', from: [40, 939, 210, 1101], offset: [920, 2181] },
  coral: { name: 'Coral Cay', from: [1040, 997, 1198, 1143], offset: [520, 2423] },
  paradise: { name: 'Paradise Cay', from: [465, 660, 521, 702], offset: [865, 2670] },
  lighthouse: { name: 'Lighthouse Rock', from: [274, 41, 342, 99], offset: [-74, 1639] },
  smuggler: { name: "Smuggler's Rock", from: [1205, 953, 1260, 1005], offset: [2355, 2337] },
};
// A placement's rectangle in the frame, and the regions it touches.
export function placedRect(p) {
  const [x0, y0, x1, y1] = p.from, [ox, oy] = p.offset;
  return [x0 + ox, y0 + oy, x1 + ox, y1 + oy];
}
export const placedRegions = (p) => regionsInRect(...placedRect(p));
// The placed pieces a region holds part of - what has to be built to make it - in PLACEMENTS' order; and the same for
// the regions round a tile (the client's window).
export function placementsIn(ri) {
  const [x0, y0, x1, y1] = regionBounds(ri);
  return Object.keys(PLACEMENTS).filter((k) => { const [a, b, c, d] = placedRect(PLACEMENTS[k]); return a < x1 && c > x0 && b < y1 && d > y0; });
}
export function placementsAround(tx, ty, r = 1) {
  const want = new Set(regionsAround(tx, ty, r).flatMap(placementsIn));
  return Object.keys(PLACEMENTS).filter((k) => want.has(k));
}
export const toFrame = (p, tx, ty) => [tx + p.offset[0], ty + p.offset[1]];
export const fromFrame = (p, fx, fy) => [fx - p.offset[0], fy - p.offset[1]];

// One region's grid of a per-tile layer, cut from a map generated in today's frame (srcW x srcH, like CityMap's
// layers) and placed by p: frame tile (fx, fy) of the region takes today's tile (fx - ox, fy - oy) where `keep` says
// it is the placed island's (keep(i) on today's index; default: inside p.from), else `fill` (the sea). This is how the
// spike puts Metro City into its v3 rectangle; a region generator writes the same grid directly.
export function cutRegion(layer, srcW, srcH, p, ri, fill = 0, keep = null, Out = null) {
  const [x0, y0] = regionBounds(ri), [ox, oy] = p.offset, [fx0, fy0, fx1, fy1] = p.from;
  const out = new (Out || layer.constructor)(REGION_TILES * REGION_TILES);
  if (fill) out.fill(fill);
  for (let ly = 0; ly < REGION_TILES; ly++) {
    const sy = y0 + ly - oy;
    if (sy < fy0 || sy >= fy1 || sy < 0 || sy >= srcH) continue;
    for (let lx = 0; lx < REGION_TILES; lx++) {
      const sx = x0 + lx - ox;
      if (sx < fx0 || sx >= fx1 || sx < 0 || sx >= srcW) continue;
      const i = sy * srcW + sx;
      if (!keep || keep(i)) out[ly * REGION_TILES + lx] = layer[i];
    }
  }
  return out;
}
