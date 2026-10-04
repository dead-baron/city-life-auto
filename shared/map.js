// Deterministic GTA1/GTA2-style city generator + tile queries. Server and client both call
// generateCity(seed) and get byte-identical maps, so the map is never sent over the wire.
//
// Layout (after the GTA2 level maps): three city islands separated by water channels and
// joined by bridges - the Industrial island (north-west), the Residential island (south-west)
// and Downtown (east) - plus rural Refuge Island off Downtown's south shore. Each island has a
// coast ring road with a waterfront strip outside it (quays, promenades, beach, piers) and a
// hand-laid avenue network inside (full crossings, T-junction stubs, a big park cell). Every
// rectangular cell between avenues is cut into irregular blocks by recursive subdivision with
// mixed street widths, then blocks are lined with concept-art building lots and packed with
// procedural rooftops so the city reads dense, like the originals.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { PREFABS } from './prefab-data.js';

// The channel between the west islands and Downtown (fishing calls it the "river").
export const RIVER_X0 = 200, RIVER_X1 = 213;

// Island outlines (tile rects [x0, y0, x1, y1), exclusive ends) and their coast ring roads.
export const ISLANDS = {
  I: { name: 'Industrial', box: [8, 8, 200, 160], ring: [14, 14, 194, 154] },
  R: { name: 'Residential', box: [8, 174, 200, 388], ring: [14, 180, 194, 364] },
  D: { name: 'Downtown', box: [214, 36, 408, 330], ring: [220, 42, 402, 320] },
  F: { name: 'Refuge Island', box: [232, 346, 410, 396], ring: null },
};

export const PED_BLOCK = new Uint8Array(16);
export const CAR_BLOCK = new Uint8Array(16);
export const BOAT_BLOCK = new Uint8Array(16).fill(1);
// PED_BLOCK: where people can't *walk* (NPC pathing, spawns, exits). Players can still swim
// (SWIM_BLOCK). Cars can drive onto docks and off the edge into water (they sink); spawns use
// CAR_SPAWN_BLOCK so nothing is ever placed in the water.
export const SWIM_BLOCK = new Uint8Array(16);
export const CAR_SPAWN_BLOCK = new Uint8Array(16);
export const WATER_T = new Uint8Array(16);
WATER_T[T.WATER] = 1; WATER_T[T.DEEP] = 1;
for (const t of [T.WALL, T.BUILDING, T.WATER, T.DEEP, T.COUNTER]) PED_BLOCK[t] = 1;
for (const t of [T.WALL, T.BUILDING, T.COUNTER]) SWIM_BLOCK[t] = 1;
for (const t of [T.WALL, T.BUILDING, T.FLOOR, T.COUNTER]) CAR_BLOCK[t] = 1;
for (const t of [T.WALL, T.BUILDING, T.WATER, T.DEEP, T.FLOOR, T.COUNTER]) CAR_SPAWN_BLOCK[t] = 1;
BOAT_BLOCK[T.WATER] = 0; BOAT_BLOCK[T.DEEP] = 0; BOAT_BLOCK[T.BRIDGE] = 0;

// Surface handling multipliers: [speedMul, gripMul, isAsphalt]
export const SURFACE = [];
SURFACE[T.WALL] = [1, 1, 0];
SURFACE[T.GRASS] = [0.6, 0.7, 0];
SURFACE[T.SIDEWALK] = [0.95, 0.95, 1];
SURFACE[T.ROAD] = [1, 1, 1];
SURFACE[T.PLAZA] = [0.95, 0.95, 1];
SURFACE[T.BUILDING] = [1, 1, 0];
SURFACE[T.WATER] = [0.3, 0.35, 0]; // a car that drove off the edge wallows and sinks
SURFACE[T.DEEP] = [0.3, 0.35, 0];
SURFACE[T.SAND] = [0.5, 0.6, 0];
SURFACE[T.DOCK] = [0.9, 0.9, 0];
SURFACE[T.DIRT] = [0.85, 0.8, 0];
SURFACE[T.FLOOR] = [1, 1, 0];
SURFACE[T.COUNTER] = [1, 1, 0];
SURFACE[T.FIELD] = [0.5, 0.65, 0];
SURFACE[T.BRIDGE] = [1, 1, 1];
SURFACE[T.LOT] = [1, 1, 1];

// ---------------------------------------------------------------------------
// Districts. Materials pick concept textures in the renderer; isl = island shown under the title.
// walk: sidewalk texture, plaza: interior plaza texture, road: asphalt variant, ground: default interior tile
export const DISTRICTS = [
  { id: 0, name: 'Pine Hills', isl: 'Residential', style: 'houses', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 1, name: 'Midtown', isl: 'Downtown', style: 'commercial', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 2, name: 'Northgate', isl: 'Residential', style: 'apartments', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 3, name: 'The Yards', isl: 'Industrial', style: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: true },
  { id: 4, name: 'Downtown', isl: 'Downtown', style: 'towers', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 5, name: 'Civic Center', isl: 'Downtown', style: 'civic', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 6, name: 'Southside', isl: 'Residential', style: 'southside', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: true },
  { id: 7, name: 'Neon Strip', isl: 'Downtown', style: 'nightlife', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 8, name: 'Harbor', isl: 'Industrial', style: 'harbor', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 9, name: 'Refuge Island', isl: 'Rural', style: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 10, name: 'Sunset Beach', isl: 'Residential', style: 'beach', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 11, name: 'Ironworks', isl: 'Industrial', style: 'factory', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.LOT, turf: false },
  { id: 12, name: 'Greenfield Park', isl: 'Industrial', style: 'park', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 13, name: 'Liberty Bay', isl: '', style: 'water', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.WATER, turf: false },
];
const WATER_D = 13;

// District paint order per island (later rects override earlier ones).
const DIST_RECTS = [
  [11, 0, 0, 205, 168], [12, 73, 0, 133, 83], [8, 133, 0, 205, 83], [3, 0, 83, 133, 168],
  [0, 0, 168, 137, 303], [2, 137, 168, 205, 400], [6, 0, 303, 137, 364], [10, 0, 364, 205, 416],
  [5, 207, 30, 343, 113], [4, 273, 113, 343, 253], [4, 343, 30, 432, 183], [1, 207, 113, 273, 253], [7, 207, 253, 432, 336], [7, 343, 183, 432, 253],
  [9, 226, 340, 432, 416],
];
// Syndicate turf (tiles): The Yards and Southside.
const TURF_RECTS = [[0, 83, 133, 168], [0, 303, 137, 364]];
// Big park cells (tiles) - left as parks instead of being subdivided.
const PARK_CELLS = [{ x: 76, y: 18, label: 'Greenfield Park', pond: true }, { x: 276, y: 46, label: 'Central Park', pond: false }];

// Subdivision + fill parameters per style. gen: generic prefab weights.
const STYLE = {
  houses: { minW: 16, minH: 18, maxW: 38, maxH: 34, streets: [4, 3, 3], gen: { house1: 3, house2: 3, house3: 3, apt2: 1, rest2: 0.4 }, filler: 'park', roof: 0.08, roofKinds: ['tile'] },
  commercial: { minW: 12, minH: 12, maxW: 40, maxH: 34, streets: [4, 4, 3], gen: { conv: 2, rest1: 2, rest2: 2, gas: 1, apt1: 1, club: 0.5, tower2: 1 }, filler: 'parking', roof: 0.5, roofKinds: ['tar', 'gravel'] },
  apartments: { minW: 14, minH: 14, maxW: 38, maxH: 36, streets: [4, 3], gen: { apt1: 3, apt2: 3, house2: 1, conv: 1, tower2: 1 }, filler: 'park', roof: 0.4, roofKinds: ['tar', 'gravel'] },
  industrial: { minW: 14, minH: 13, maxW: 44, maxH: 34, streets: [4, 3], gen: { warehouse: 3, industrial: 2, repair: 1 }, filler: 'yard', roof: 0.45, roofKinds: ['metal', 'tar'] },
  factory: { minW: 14, minH: 13, maxW: 46, maxH: 34, streets: [4, 4, 3], gen: { industrial: 3, warehouse: 2, repair: 1, gas: 0.4 }, filler: 'yard', roof: 0.6, roofKinds: ['metal', 'metal', 'tar'] },
  towers: { minW: 11, minH: 11, maxW: 38, maxH: 36, streets: [4, 4, 3], gen: { tower1: 3, tower2: 3, apt1: 1, hotel: 1 }, filler: 'plaza', roof: 0.75, roofKinds: ['glass', 'gravel', 'tar'] },
  civic: { minW: 14, minH: 14, maxW: 42, maxH: 38, streets: [4, 3], gen: { apt1: 1, tower2: 1, house1: 1, conv: 1, rest1: 1 }, filler: 'park', roof: 0.35, roofKinds: ['gravel', 'tile'] },
  southside: { minW: 14, minH: 14, maxW: 40, maxH: 34, streets: [3, 3, 4], gen: { house1: 2, house3: 2, warehouse: 1, industrial: 1, apt2: 1 }, filler: 'yard', roof: 0.3, roofKinds: ['tar', 'metal'] },
  nightlife: { minW: 12, minH: 12, maxW: 40, maxH: 36, streets: [4, 3], gen: { club: 3, rest1: 2, rest2: 2, hotel: 1, conv: 1 }, filler: 'plaza', roof: 0.5, roofKinds: ['tar', 'tile', 'gravel'] },
  harbor: { minW: 14, minH: 13, maxW: 46, maxH: 34, streets: [4, 3], gen: { warehouse: 4, industrial: 1, repair: 1 }, filler: 'yard', roof: 0.55, roofKinds: ['metal', 'tar'] },
};

// Every business the game systems rely on, placed in a specific district.
// strip prefabs host one business per storefront door.
const SPECIALS = [
  { d: 5, prefab: 'hospital', biz: ['hospital'], names: ['St. Neon General'] },
  { d: 0, prefab: 'hospital', biz: ['hospital'], names: ['Westside Medical'] },
  { d: 11, prefab: 'hospital', biz: ['hospital'], names: ['Ironworks Clinic'] },
  { d: 4, prefab: 'police', biz: ['police'], names: ['Metro City PD - HQ'] },
  { d: 4, prefab: 'bank', biz: ['bank'], names: ['First Pixel Bank'] },
  { d: 4, prefab: 'bank', biz: ['courthouse'], names: ['Hall of Justice'] },
  { d: 4, prefab: 'hotel', biz: ['delivery'], names: ['Grand Neon Hotel'] },
  { d: 1, prefab: 'strip', biz: ['gunshop', 'sports', 'hardware', 'clothing'], names: ['Iron Sights Arms', 'Home Run Sports', 'Nail & Gear Hardware', 'Threads Outfitters'] },
  { d: 1, prefab: 'market', biz: ['grocery'], names: ['FreshHub Grocery'] },
  { d: 1, prefab: 'conv', biz: ['pharmacy'], names: ['MediMart Pharmacy'] },
  { d: 1, prefab: 'rest2', biz: ['coffee'], names: ['Bean Machine Coffee'] },
  { d: 1, prefab: 'dealer', biz: ['dealer'], names: ['Motor Row Dealership'] },
  { d: 1, prefab: 'repair', biz: ['garage'], names: ['Fresh Coat Garage'] },
  { d: 6, prefab: 'strip', biz: ['pawn', 'delivery', 'delivery', 'delivery'], names: ['Second Chance Pawn', 'Lucky Laundromat', 'Cut & Fade', 'Quick Mart 24/7'] },
  { d: 3, prefab: 'club', biz: ['fence'], names: ['Back-Alley Exchange'] },
  { d: 3, prefab: 'construction', biz: ['construction'], names: ['Construction Site'] },
  { d: 8, prefab: 'warehouse', biz: ['warehouse'], names: ['Portside Logistics'] },
  { d: 8, prefab: 'rest1', biz: ['fishmarket'], names: ['Dockside Fish Market'] },
  { d: 8, prefab: 'conv', biz: ['marina'], names: ['Harbor Marina (boats)'] },
  { d: 2, prefab: 'school', biz: ['delivery'], names: ['Northgate High'] },
  { d: 2, prefab: 'fire', biz: ['delivery'], names: ['Fire Station 7'] },
  { d: 5, prefab: 'church', biz: ['delivery'], names: ['St. Pixel Chapel'] },
  { d: 7, prefab: 'club', biz: ['delivery'], names: ['Club Ultraviolet'] },
  { d: 7, prefab: 'club', biz: ['delivery'], names: ['The Velvet Room'] },
  { d: 7, prefab: 'hotel', biz: ['delivery'], names: ['Neon Palms Hotel'] },
];

const GENERIC_NAMES = {
  conv: ['Quick Mart', 'Corner Deli', '24/7 Market', 'Speedy Stop'], rest1: ['Pizza Planet Express', 'Hot Wok', 'Taco Loco', 'Burger Barn'],
  rest2: ['Cafe Retro', 'Noodle House', 'The Brick Oven'], club: ['Club Neon', 'Bass Cave', 'Pink Flamingo'], gas: ['Gas-N-Go', 'Fuel Stop'],
  tower1: ['Office Tower'], tower2: ['Glass Tower'], hotel: ['Hotel'], warehouse: ['Warehouse'], industrial: ['Factory'], repair: ['Auto Repair'],
  apt1: ['Apartments'], apt2: ['Apartments'], house1: ['Residence'], house2: ['Residence'], house3: ['Residence'],
};

// ---------------------------------------------------------------------------
export class CityMap {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.w = MAP_W; this.h = MAP_H;
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.dist = new Uint8Array(MAP_W * MAP_H).fill(WATER_D);
    this.roadAxis = new Uint8Array(MAP_W * MAP_H); // bit1 vertical road, bit2 horizontal road
    this.bld = new Int16Array(MAP_W * MAP_H).fill(-1);
    this.buildings = [];
    this.prefabs = [];
    this.roads = [];
    this.blocks = [];
    this.pois = [];
    this.homes = [];
    this.props = [];
    this.solidProps = new Map(); // tile index -> [{x,y,r,pi,off}]
    this.propSolid = new Map();  // prop index -> its solid entry (toggled when the prop is smashed)
    this.parking = [];
    this.stalls = [];
    this.marina = [];
    this.dropSites = [];
    this.cameras = [];
    this.nodes = [];
    this.lamps = [];
    this.fields = [];
    this.roofs = [];
    this.hospitals = [];
    this.spawns = {};
  }
  idx(tx, ty) { return ty * MAP_W + tx; }
  tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T.WALL;
    return this.tiles[ty * MAP_W + tx];
  }
  tileAtPx(x, y) { return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  set(tx, ty, t) { if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) this.tiles[ty * MAP_W + tx] = t; }
  fill(tx, ty, w, h, t) { for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.set(x, y, t); }
  setDist(tx, ty, w, h, d) {
    for (let y = Math.max(0, ty); y < Math.min(MAP_H, ty + h); y++) for (let x = Math.max(0, tx); x < Math.min(MAP_W, tx + w); x++) this.dist[y * MAP_W + x] = d;
  }
  districtAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return DISTRICTS[WATER_D];
    return DISTRICTS[this.dist[ty * MAP_W + tx]];
  }
  buildingAtPx(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return null;
    const b = this.bld[ty * MAP_W + tx];
    return b >= 0 ? this.buildings[b] : null;
  }
  addSolidProp(x, y, r) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const k = ty * MAP_W + tx;
    let arr = this.solidProps.get(k);
    if (!arr) { arr = []; this.solidProps.set(k, arr); }
    const e = { x, y, r, pi: -1, off: false };
    arr.push(e);
    return e;
  }
  // Line of sight across tiles (buildings block sight).
  los(x1, y1, x2, y2) { return this.rayTiles(x1, y1, x2, y2) >= 1; }
  // Ray to first blocking tile; returns distance fraction t in [0,1] (1 = no hit).
  rayTiles(x1, y1, x2, y2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1) return 1;
    const steps = Math.ceil(d / 8);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const tt = this.tileAtPx(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      if (tt === T.BUILDING || tt === T.WALL) return Math.max(0, (i - 1) / steps);
    }
    return 1;
  }
  isWater(x, y) { const t = this.tileAtPx(x, y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; }
  isWalkable(x, y) { return !PED_BLOCK[this.tileAtPx(x, y)]; }
  nearestNode(x, y) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  poiNear(x, y, kind = null) {
    let best = null, bd = Infinity;
    for (const p of this.pois) {
      if (kind && p.kind !== kind) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d <= p.r * p.r && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  poisOf(kind) { return this.pois.filter((p) => p.kind === kind); }
}

// Nearest walkable land to a point (for swimmers heading ashore), ring search in tiles.
export function isSwimming(map, ped) {
  const t = map.tileAtPx(ped.x, ped.y);
  return WATER_T[t] === 1 || (t === T.BRIDGE && !!ped.under);
}

export function nearestLand(map, x, y, maxTiles = 24) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r <= maxTiles; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t = map.tileAt(cx + dx, cy + dy);
      if (PED_BLOCK[t] || t === T.BRIDGE) continue;
      const px = (cx + dx + 0.5) * TILE, py = (cy + dy + 0.5) * TILE, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return null;
}

export function isTurf(x, y) { // syndicate gang territory (pixels): The Yards + Southside
  const tx = x / TILE, ty = y / TILE;
  for (const [x0, y0, x1, y1] of TURF_RECTS) if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Traffic lights: deterministic from the shared chrono-loop time.
export const LIGHT_CYCLE = 24; // divides the 1200 s chrono loop evenly
export function lightState(node, tSec) {
  if (!node.light) return { ns: 'G', ew: 'G' };
  const t = ((tSec + node.phase) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (t < 9) return { ns: 'G', ew: 'R' };
  if (t < 11) return { ns: 'Y', ew: 'R' };
  if (t < 12) return { ns: 'R', ew: 'R' };
  if (t < 21) return { ns: 'R', ew: 'G' };
  if (t < 23) return { ns: 'R', ew: 'Y' };
  return { ns: 'R', ew: 'R' };
}

export const DIRS = {
  N: { dx: 0, dy: -1, opp: 'S' }, S: { dx: 0, dy: 1, opp: 'N' },
  E: { dx: 1, dy: 0, opp: 'W' }, W: { dx: -1, dy: 0, opp: 'E' },
};

// Coast wobble so islands don't read as perfect rectangles (stays within +-2 tiles).
function wob(t, k) { return Math.round(1.3 * Math.sin(t / 6.1 + k) + 0.8 * Math.sin(t / 2.3 + k * 2.7)); }
function onIsland(box, tx, ty, k) {
  const [x0, y0, x1, y1] = box;
  if (tx < x0 + wob(ty, k) || tx >= x1 + wob(ty, k + 1) || ty < y0 + wob(tx, k + 2) || ty >= y1 + wob(tx, k + 3)) return false;
  const r = 6; // rounded corners
  const cx = tx < x0 + r ? x0 + r : tx >= x1 - r ? x1 - r - 1 : tx;
  const cy = ty < y0 + r ? y0 + r : ty >= y1 - r ? y1 - r - 1 : ty;
  return (tx - cx) ** 2 + (ty - cy) ** 2 <= r * r + 2;
}

export function generateCity(seed = 1337) {
  const m = new CityMap(seed);
  const rand = mulberry32(seed);
  const isl = Object.values(ISLANDS);

  // --- terrain: open water, islands, shallows -------------------------------------------
  m.fill(0, 0, MAP_W, MAP_H, T.DEEP);
  isl.forEach((I, k) => {
    const [x0, y0, x1, y1] = I.box;
    for (let ty = y0 - 3; ty < y1 + 3; ty++) for (let tx = x0 - 3; tx < x1 + 3; tx++) if (onIsland(I.box, tx, ty, k * 1.7)) m.set(tx, ty, I.ring ? T.SIDEWALK : T.GRASS);
  });
  const land = (t) => t !== T.DEEP && t !== T.WATER;
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (m.tileAt(tx, ty) !== T.DEEP) continue;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (land(m.tileAt(tx + dx, ty + dy)) && m.tileAt(tx + dx, ty + dy) !== T.WALL) { near = true; break; }
    if (near) m.set(tx, ty, T.WATER);
  }
  for (const [d, x0, y0, x1, y1] of DIST_RECTS) for (let ty = y0; ty < Math.min(MAP_H, y1); ty++) for (let tx = x0; tx < Math.min(MAP_W, x1); tx++) {
    if (land(m.tileAt(tx, ty))) m.dist[ty * MAP_W + tx] = d;
  }

  // --- roads ---------------------------------------------------------------------------------
  const road = (x, y, w, h, width, axis, kind = 'ave') => {
    const r = { id: m.roads.length, x, y, w, h, width, axis, kind };
    m.roads.push(r);
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      const cur = m.tileAt(tx, ty);
      m.set(tx, ty, cur === T.WATER || cur === T.DEEP || cur === T.BRIDGE ? T.BRIDGE : T.ROAD);
      m.roadAxis[ty * MAP_W + tx] |= axis === 'v' ? 1 : 2;
    }
    return r;
  };
  const ring = ([x0, y0, x1, y1]) => {
    road(x0, y0, 4, y1 - y0, 4, 'v', 'st'); road(x1 - 4, y0, 4, y1 - y0, 4, 'v', 'st');
    road(x0, y0, x1 - x0, 4, 4, 'h', 'st'); road(x0, y1 - 4, x1 - x0, 4, 4, 'h', 'st');
  };
  for (const I of isl) if (I.ring) ring(I.ring);
  // Industrial island: two full avenues each way, a stub west of the Yards, a street east.
  road(70, 14, 6, 170, 6, 'v');                // Foundry Ave, crosses the north channel to Residential
  road(130, 14, 6, 140, 6, 'v');               // Mill St
  road(14, 80, 210, 6, 6, 'h');                // Bay Bridge: Industrial -> Downtown
  road(14, 118, 62, 6, 6, 'h');                // Yards Rd (T at Foundry Ave)
  road(160, 80, 4, 104, 4, 'v', 'st');         // Dock St, crosses to Residential (second north bridge)
  // Residential island
  road(78, 180, 6, 184, 6, 'v');               // Pine Ave
  road(134, 180, 6, 184, 6, 'v');              // Elm Ave
  road(14, 240, 210, 6, 6, 'h');               // Hill Bridge: Residential -> Downtown
  road(14, 300, 210, 6, 6, 'h');               // Southside Bridge: Residential -> Downtown
  road(134, 330, 60, 4, 4, 'h', 'st');         // Northgate Ln
  road(46, 180, 4, 66, 4, 'v', 'st');          // Cedar St
  // Downtown island
  road(270, 42, 6, 278, 6, 'v');               // Broadway
  road(340, 42, 6, 322, 6, 'v');               // Neon Blvd, continues over the causeway to Refuge Island
  road(220, 110, 182, 6, 6, 'h');              // Capitol Ave
  road(220, 180, 182, 6, 6, 'h');              // Market St
  road(220, 250, 182, 6, 6, 'h');              // Sunset Blvd
  road(305, 110, 4, 76, 4, 'v', 'st');         // Wall St
  road(340, 285, 62, 4, 4, 'h', 'st');         // Marina Way
  // Refuge Island farm road
  road(236, 360, 170, 4, 4, 'h', 'rural');

  // --- cells between avenues -> blocks ---------------------------------------------------------
  for (const I of isl) {
    if (!I.ring) continue;
    const [x0, y0, x1, y1] = I.ring;
    const seen = new Uint8Array(MAP_W * MAP_H);
    for (let ty = y0 + 4; ty < y1 - 4; ty++) for (let tx = x0 + 4; tx < x1 - 4; tx++) {
      if (seen[ty * MAP_W + tx] || m.tileAt(tx, ty) === T.ROAD) continue;
      // flood the cell
      let minx = tx, maxx = tx, miny = ty, maxy = ty, n = 0;
      const st = [[tx, ty]];
      seen[ty * MAP_W + tx] = 1;
      while (st.length) {
        const [cx, cy] = st.pop();
        n++;
        minx = Math.min(minx, cx); maxx = Math.max(maxx, cx); miny = Math.min(miny, cy); maxy = Math.max(maxy, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (seen[ny * MAP_W + nx] || m.tileAt(nx, ny) === T.ROAD || m.tileAt(nx, ny) === T.BRIDGE) continue;
          seen[ny * MAP_W + nx] = 1;
          st.push([nx, ny]);
        }
      }
      const rc = { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
      if (rc.w * rc.h !== n) throw new Error(`city generator: cell at ${tx},${ty} is not rectangular`);
      const d = m.dist[(miny + (rc.h >> 1)) * MAP_W + minx + (rc.w >> 1)];
      const park = PARK_CELLS.find((p) => p.x === minx && p.y === miny);
      if (park) { m.blocks.push({ ...rc, d, park }); continue; }
      subdivide(m, road, rc, STYLE[DISTRICTS[d].style], mulberry32(seed ^ (minx * 7919 + miny * 104729)), d, 0);
    }
  }

  // --- fill blocks with prefabs + rooftops ----------------------------------------------------
  const rows = [];
  for (const b of m.blocks) {
    const st = STYLE[DISTRICTS[b.d].style];
    paveBlock(m, b);
    const ix = b.x + 2, iy = b.y + 2, iw = b.w - 4, ih = b.h - 4;
    b.ix = ix; b.iy = iy; b.iw = iw; b.ih = ih;
    m.fill(ix, iy, iw, ih, DISTRICTS[b.d].ground);
    if (b.park) continue;
    const minH = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].th));
    const minW = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].tw));
    if (ih < minH || iw < minW) {
      // too small for a concept lot: one solid building (GTA-style city block) or a pocket park/plaza
      const row = { b, d: b.d, x: ix, y: iy, w: iw, h: ih, face: 'S' };
      if (st.roof) roofBuilding(m, row, ix, iy, iw, ih, st, mulberry32(seed ^ (ix * 131 + iy * 7)));
      else filler(m, row, ix, iw, st, mulberry32(seed ^ (ix * 131 + iy * 7)));
      continue;
    }
    if (ih >= minH * 2 + 1) {
      const hs = Math.ceil(ih / 2);
      rows.push({ b, d: b.d, x: ix, y: iy + ih - hs, w: iw, h: hs, face: 'S', iv: [[ix, ix + iw]] });
      rows.push({ b, d: b.d, x: ix, y: iy, w: iw, h: ih - hs, face: 'N', iv: [[ix, ix + iw]] });
    } else {
      rows.push({ b, d: b.d, x: ix, y: iy, w: iw, h: ih, face: 'S', iv: [[ix, ix + iw]] });
    }
  }
  placeSpecials(m, rows, rand);
  for (const row of rows) fillRow(m, row, mulberry32(seed ^ (row.x * 31 + row.y * 977)));
  for (const b of m.blocks) if (b.park) buildPark(m, b, mulberry32(seed ^ (b.x * 13 + b.y)), b.park);

  // --- waterfronts, Refuge Island, street furniture, traffic graph -----------------------------
  buildWaterfronts(m, rand);
  buildRefuge(m, rand);
  buildEstates(m, rand);
  buildStreetProps(m);
  buildBanking(m);
  buildGangHQs(m);
  buildTackleShops(m);
  buildPaintShops(m);
  buildMotorPools(m);
  buildInteriors(m);
  buildDealerLots(m);
  aimLamps(m);
  buildLaneGraph(m);
  buildCameras(m, rand);

  const hosp = m.pois.find((p) => p.kind === 'hospital');
  const pd = m.pois.find((p) => p.kind === 'police');
  m.hospitals = m.pois.filter((p) => p.kind === 'hospital').map((p) => ({ id: p.id, name: p.label, x: p.x, y: p.y + 44 }));
  m.spawns.hospital = { x: hosp.x, y: hosp.y + 44 };
  m.spawns.police = { x: pd.x, y: pd.y + 44 };
  m.spawns.default = m.spawns.hospital;
  return m;
}

// ---------------------------------------------------------------------------
function subdivide(m, road, rc, st, rand, d, depth) {
  const canV = rc.w >= st.minW * 2 + 3, canH = rc.h >= st.minH * 2 + 3;
  const needV = rc.w > st.maxW, needH = rc.h > st.maxH;
  const big = rc.w > st.maxW * 0.75 || rc.h > st.maxH * 0.8;
  const chance = !needV && !needH ? (big && depth < 4 ? 0.55 : depth < 3 ? 0.3 : 0) : 1;
  if ((!canV && !canH) || rand() >= chance) {
    m.blocks.push({ x: rc.x, y: rc.y, w: rc.w, h: rc.h, d });
    return;
  }
  let vertical;
  if (!needV && !needH) vertical = canV && (!canH || rand() < 0.5);
  else if (needV && canV && (!needH || !canH)) vertical = true;
  else if (needH && canH && (!needV || !canV)) vertical = false;
  else vertical = rand() < rc.w / (rc.w + rc.h * 1.1);
  if (vertical && !canV) vertical = false;
  if (!vertical && !canH) vertical = true;
  const sw = st.streets[Math.floor(rand() * st.streets.length)];
  const kind = sw >= 4 ? 'st' : 'minor';
  if (vertical) {
    const lo = st.minW, hi = rc.w - st.minW - sw;
    const p = lo + Math.floor(rand() * (hi - lo + 1));
    road(rc.x + p, rc.y - 1, sw, rc.h + 2, sw, 'v', kind);
    subdivide(m, road, { x: rc.x, y: rc.y, w: p, h: rc.h }, st, rand, d, depth + 1);
    subdivide(m, road, { x: rc.x + p + sw, y: rc.y, w: rc.w - p - sw, h: rc.h }, st, rand, d, depth + 1);
  } else {
    const lo = st.minH, hi = rc.h - st.minH - sw;
    const p = lo + Math.floor(rand() * (hi - lo + 1));
    road(rc.x - 1, rc.y + p, rc.w + 2, sw, sw, 'h', kind);
    subdivide(m, road, { x: rc.x, y: rc.y, w: rc.w, h: p }, st, rand, d, depth + 1);
    subdivide(m, road, { x: rc.x, y: rc.y + p + sw, w: rc.w, h: rc.h - p - sw }, st, rand, d, depth + 1);
  }
}

function paveBlock(m, b) {
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const t = m.tileAt(x, y);
    if (t === T.ROAD || t === T.BRIDGE || t === T.WATER || t === T.DEEP) continue;
    m.set(x, y, T.SIDEWALK);
  }
}

// ---------------------------------------------------------------------------
// Back rows face north (prefab rotated 180) so every door opens onto a street.
function rowFits(row, pf, iv) {
  if (PREFABS[pf].th > row.h) return false;
  return iv[1] - iv[0] >= PREFABS[pf].tw;
}

function placeSpecials(m, rows, rand) {
  const order = SPECIALS.map((s, i) => ({ ...s, i })).sort((a, b) => PREFABS[b.prefab].tw - PREFABS[a.prefab].tw);
  for (const sp of order) {
    let cands = [];
    for (const pass of [0, 1]) {
      for (const row of rows) {
        if (pass === 0 && row.d !== sp.d) continue;
        if (row.face !== 'S') continue;
        for (let k = 0; k < row.iv.length; k++) if (rowFits(row, sp.prefab, row.iv[k])) cands.push([row, k]);
      }
      if (cands.length) break;
    }
    if (!cands.length) throw new Error(`city generator: no room for ${sp.prefab} (${sp.names[0]})`);
    const [row, k] = cands[Math.floor(rand() * cands.length)];
    const iv = row.iv[k];
    const pf = PREFABS[sp.prefab];
    const slack = iv[1] - iv[0] - pf.tw;
    const x = iv[0] + (rand() < 0.5 ? 0 : slack);
    placePrefab(m, row, sp.prefab, x, sp, rand);
    row.iv.splice(k, 1, [iv[0], x], [x + pf.tw, iv[1]]);
    row.iv = row.iv.filter((v) => v[1] - v[0] > 0);
  }
}

function fillRow(m, row, rand) {
  const st = STYLE[DISTRICTS[row.d].style];
  const keys = Object.keys(st.gen);
  for (const [a, b] of row.iv) {
    let x = a;
    while (x < b) {
      const rem = b - x;
      if (rem >= 6 && rand() < 0.12) { const gw = Math.min(rem, 4 + Math.floor(rand() * 4)); filler(m, row, x, gw, st, rand); x += gw; continue; }
      const fits = keys.filter((k) => rowFits(row, k, [x, b]));
      if (!fits.length) { filler(m, row, x, rem, st, rand); break; }
      let tot = 0;
      for (const k of fits) tot += st.gen[k];
      let r = rand() * tot, pick = fits[0];
      for (const k of fits) { r -= st.gen[k]; if (r <= 0) { pick = k; break; } }
      placePrefab(m, row, pick, x, null, rand);
      x += PREFABS[pick].tw;
    }
  }
}

function placePrefab(m, row, key, x, special, rand) {
  const pf = PREFABS[key];
  const rot = row.face === 'N' ? 2 : 0;
  const y = row.face === 'S' ? row.y + row.h - pf.th : row.y;
  // dress the leftover strip behind a shorter building (back lots, yards, gardens)
  const left = row.h - pf.th;
  if (left >= 2 && STYLE[DISTRICTS[row.d].style]) {
    const back = { d: row.d, y: row.face === 'S' ? row.y : row.y + pf.th, h: left, face: row.face === 'S' ? 'N' : 'S' };
    filler(m, back, x, pf.tw, STYLE[DISTRICTS[row.d].style], rand, true);
  }
  // the lot sits on the district's own paving/lawn so its feathered edges melt into the block
  const dg = DISTRICTS[row.d].ground;
  const groundT = pf.ground === 'dirt' ? T.DIRT : pf.ground === 'grass' ? T.GRASS : dg === T.SAND || dg === T.WATER ? T.PLAZA : dg;
  m.fill(x, y, pf.tw, pf.th, groundT);
  let [sx0, sy0, sx1, sy1] = pf.solid;
  if (rot === 2) [sx0, sy0, sx1, sy1] = [pf.tw - sx1, pf.th - sy1, pf.tw - sx0, pf.th - sy0];
  const pi = m.prefabs.length;
  m.prefabs.push({ key, tx: x, ty: y, tw: pf.tw, th: pf.th, rot, d: row.d });
  const names = special ? special.names : (GENERIC_NAMES[key] || ['Building']);
  const bid = m.buildings.length;
  const b = {
    id: bid, prefab: pi, tx: x + sx0, ty: y + sy0, tw: sx1 - sx0, th: sy1 - sy0, kind: key,
    name: special ? special.names[0] : names[Math.floor(rand() * names.length)], business: special ? special.biz[0] : null,
    signs: [],
  };
  m.buildings.push(b);
  for (let ty = b.ty; ty < b.ty + b.th; ty++) for (let tx = b.tx; tx < b.tx + b.tw; tx++) {
    m.set(tx, ty, T.BUILDING);
    m.bld[ty * MAP_W + tx] = bid;
  }
  // doors -> points of interest just outside the footprint
  const doors = pf.doors.map((fx) => {
    const fxr = rot === 2 ? 1 - fx : fx;
    const dx = x + Math.min(pf.tw - 1, Math.floor(fxr * pf.tw));
    const px = (dx + 0.5) * TILE;
    const py = rot === 0 ? (b.ty + b.th + 0.7) * TILE : (b.ty - 0.7) * TILE;
    return { tx: dx, px, py };
  });
  b.door = { tx: doors[0].tx, ty: rot === 0 ? b.ty + b.th : b.ty - 1 };
  const isHome = !special && (key.startsWith('house') || key.startsWith('apt'));
  if (special) {
    special.biz.forEach((kind, i) => {
      const dd = doors[Math.min(i, doors.length - 1)];
      const label = special.names[i] || special.names[0];
      if (kind === 'construction') { m.dropSites.push({ x: (x + pf.tw * 0.15) * TILE, y: (y + pf.th * 0.85) * TILE, name: 'the construction site' }); return; }
      const poi = { id: m.pois.length, kind, label, x: dd.px, y: dd.py, r: kind === 'delivery' ? 40 : 48, b: bid };
      m.pois.push(poi);
      b.signs.push({ x: dd.px, y: rot === 0 ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: label });
      const front = rot === 0 ? (y + pf.th + 2.6) * TILE : (y - 2.6) * TILE;
      if (kind === 'police' || kind === 'dealer' || kind === 'garage') poi.spawnLot = { x: (x + pf.tw * 0.8) * TILE, y: (y + pf.th - 2) * TILE, a: -Math.PI / 2 };
      if (kind === 'warehouse') poi.cargoPad = { x: (x + pf.tw * 0.25) * TILE, y: (y + pf.th - 1.2) * TILE };
      if (kind === 'police') m.pois.push({ id: m.pois.length, kind: 'evidence', label: 'Evidence Locker', x: (x + pf.tw - 1) * TILE, y: dd.py, r: 56, b: bid });
      if (kind === 'hospital') {
        m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: dd.px, y: dd.py, r: 36, b: bid });
        // forecourt like the reference: paved apron, tree planters either side of the doors, lamps, benches
        const fy0 = rot === 0 ? b.ty + b.th : y, fy1 = rot === 0 ? y + pf.th : b.ty;
        m.fill(x, fy0, pf.tw, fy1 - fy0, T.PLAZA);
        const py = ((fy0 + fy1) / 2) * TILE;
        for (const fx of [0.16, 0.36, 0.64, 0.84]) addProp(m, 'planter_g', (x + pf.tw * fx) * TILE, py, 12);
        for (const fx of [0.06, 0.94]) addProp(m, 'lamp', (x + pf.tw * fx) * TILE, py);
        addProp(m, 'bench_m', (x + pf.tw * 0.26) * TILE, py + 6, 0);
        addProp(m, 'bench_m', (x + pf.tw * 0.74) * TILE, py + 6, 0);
      }
      if (kind === 'bank') {
        const ax = dd.px - 64;
        m.props.push({ t: 'atm', x: ax, y: dd.py - 8 });
        m.pois.push({ id: m.pois.length, kind: 'atm', label: 'ATM', x: ax, y: dd.py + 6, r: 36 });
      }
      if (kind === 'coffee' || kind === 'sports' || kind === 'pharmacy') {
        const vx = dd.px + 56, vy = dd.py + 12;
        m.props.push({ t: 'vend_cola', x: vx, y: vy });
        m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: vx, y: vy + 18, r: 32 });
      }
      if (kind === 'fence') m.dropSites.push({ x: (x + 2) * TILE, y: front, name: 'the Syndicate yards' });
      void front;
    });
  } else if (isHome) {
    const id = m.homes.length;
    const dd = doors[0];
    const apt = key.startsWith('apt');
    const dist = DISTRICTS[row.d];
    const price = apt ? 15000 : (dist.turf ? 12000 : 25000);
    const gx = (x + (rot === 0 ? pf.tw * 0.22 : pf.tw * 0.78)) * TILE;
    const gy = rot === 0 ? (y + pf.th - 2.2) * TILE : (y + 2.2) * TILE;
    const home = { id, kind: apt ? 'apartment' : 'house', name: `${dist.name} ${apt ? 'Apt' : 'House'} #${id + 1}`, price, slots: apt ? 2 : 3, x: dd.px, y: dd.py, garage: { x: gx, y: gy, a: rot === 0 ? -Math.PI / 2 : Math.PI / 2 }, b: bid };
    m.homes.push(home);
    m.pois.push({ id: m.pois.length, kind: 'home', home: id, label: home.name, x: dd.px, y: dd.py, r: 40, b: bid });
    b.home = id;
  } else if (key !== 'gas' && key !== 'construction') {
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: b.name, x: doors[0].px, y: doors[0].py, r: 40, b: bid });
  }
  if (key === 'construction') m.dropSites.push({ x: (x + 1.5) * TILE, y: (y + pf.th - 1.5) * TILE, name: 'the construction site' });
  if (key === 'industrial' && row.d === 3 && !m.dropSites.some((s) => s.name === 'the industrial yards')) m.dropSites.push({ x: (x + pf.tw / 2) * TILE, y: (rot === 0 ? y + pf.th - 1 : y + 1) * TILE, name: 'the industrial yards' });
  return b;
}

// Procedural flat-roof building filling a leftover lot (GTA-style dense blocks). The renderer
// draws the roof (parapet, texture, AC units, vents, skylights, helipads) from r.kind + r.seed.
function roofBuilding(m, row, x, y, w, h, st, rand) {
  const kinds = st.roofKinds || ['tar'];
  const kind = kinds[Math.floor(rand() * kinds.length)];
  const bid = m.buildings.length;
  const r = { tx: x, ty: y, tw: w, th: h, kind, seed: Math.floor(rand() * 1e9), d: row.d, b: bid };
  m.roofs.push(r);
  m.buildings.push({ id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind: 'roof', name: 'Building', business: null, signs: [] });
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * MAP_W + tx] = bid; }
}

// Bank branches (one per island that lacks one) and street ATMs (up to two per district), made
// from existing storefronts so the city layout doesn't move. Deterministic, like everything here.
function buildBanking(m) {
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const walk = (x, y) => { const t = m.tileAtPx(x, y); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT; };
  const addAtm = (x, y) => { m.props.push({ t: 'atm', x, y: y - 14 }); m.pois.push({ id: m.pois.length, kind: 'atm', label: 'ATM', x, y, r: 36 }); };
  const shops = () => m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined);
  const main = m.pois.find((p) => p.kind === 'bank');
  for (const I of Object.values(ISLANDS)) {
    const [x0, y0, x1, y1] = I.box;
    const inIsl = (p) => p.x / TILE >= x0 && p.x / TILE < x1 && p.y / TILE >= y0 && p.y / TILE < y1;
    if (main && inIsl(main)) continue;
    const cx = (x0 + x1) / 2 * TILE, cy = (y0 + y1) / 2 * TILE;
    const heavy = (p) => /warehouse|factory|depot|plant|yard/i.test(p.label) ? 1 : 0; // a bank in a factory would be odd
    const c = shops().filter((p) => inIsl(p) && walk(p.x - 40, p.y)).sort((a, b) => heavy(a) - heavy(b) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (!c) continue;
    const old = c.label;
    const dname = DISTRICTS[distOf(c)] ? DISTRICTS[distOf(c)].name : I.name;
    c.kind = 'bank'; c.label = `First Pixel Bank - ${dname}`; c.r = 48;
    const b = m.buildings[c.b];
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'First Pixel Bank';
    addAtm(c.x - 40, c.y + 6);
  }
  DISTRICTS.forEach((d, di) => {
    const cands = shops().filter((p) => distOf(p) === di && walk(p.x + 40, p.y));
    cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 17) - hash2(b.x | 0, b.y | 0, 17));
    const picked = [];
    for (const c of cands) {
      if (picked.length >= 2) break;
      if (picked.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 1200)) continue;
      if (m.pois.some((q) => q.kind === 'atm' && Math.hypot(q.x - c.x, q.y - c.y) < 600)) continue;
      picked.push(c);
      addAtm(c.x + 40, c.y + 6);
    }
  });
}

// ---- estates: homes outside the city grid -----------------------------------------------------
// Farmhouses and a mansion out on Refuge Island, cottages on its north shore, beach houses on
// Sunset Beach. Each has a detached garage (a door that opens for its owner) and a driveway.
export const ESTATE_TYPES = {
  farmhouse: { name: 'Farmhouse', price: 18000, slots: 3 },
  cottage: { name: 'Bayview Cottage', price: 30000, slots: 2 },
  beach: { name: 'Beach House', price: 45000, slots: 3 },
  mansion: { name: 'Hilltop Mansion', price: 150000, slots: 6 },
};
const HOUSE_KEYS = ['house1', 'house2', 'house3'];

// [type, house prefab, x, y, door faces south?]
const ESTATE_PLAN = [
  ['farmhouse', 'house2', 250, 366, false], ['farmhouse', 'house1', 320, 366, false], ['farmhouse', 'house3', 262, 346, true],
  ['cottage', 'house1', 382, 346, true], ['cottage', 'house3', 240, 346, true],
  ['beach', 'house2', 64, 366, false], ['beach', 'house1', 128, 366, false], ['beach', 'house3', 186, 366, false],
];
const MANSION_AT = [362, 366], MANSION_SIZE = [26, 24];
// Estate lots (house + garage), so earlier passes don't dress them with beach umbrellas and palms.
function inEstateLot(tx, ty) {
  for (const [, key, x, y] of ESTATE_PLAN) { const pf = PREFABS[key]; if (tx >= x - 1 && tx <= x + pf.tw + 3 && ty >= y - 1 && ty <= y + pf.th) return true; }
  return tx >= MANSION_AT[0] - 1 && tx <= MANSION_AT[0] + MANSION_SIZE[0] && ty >= MANSION_AT[1] - 1 && ty <= MANSION_AT[1] + MANSION_SIZE[1];
}

function buildEstates(m, rand) {
  m.garages = [];
  m.mansions = [];
  for (const [type, key, x, y, south] of ESTATE_PLAN) estateHouse(m, rand, type, key, x, y, south);
  mansion(m, rand, MANSION_AT[0], MANSION_AT[1]);
}

const nearestDist = (m, x, y) => m.dist[Math.min(MAP_H - 1, y) * MAP_W + Math.min(MAP_W - 1, x)];

// carve a driveway from (x0..x0+w-1, y) toward the road, straight up or down
function driveway(m, x0, w, y, dir) {
  for (let k = 0; k < 24; k++) {
    const yy = y + k * dir;
    if ([...Array(w).keys()].some((i) => { const t = m.tileAt(x0 + i, yy); return t === T.ROAD || t === T.BRIDGE; })) return true;
    for (let i = 0; i < w; i++) { const t = m.tileAt(x0 + i, yy); if (t !== T.WATER && t !== T.DEEP && t !== T.BUILDING) m.set(x0 + i, yy, T.LOT); }
  }
  return false;
}

function addGarage(m, home, tx, ty, south, w = 3) {
  for (let y = ty; y < ty + 3; y++) for (let x = tx; x < tx + w; x++) m.set(x, y, T.BUILDING);
  const g = { tx, ty, tw: w, th: 3, south, home: home.id };
  m.garages.push(g);
  // pull up in front of the door
  home.garage = { x: (tx + w / 2) * TILE, y: (south ? ty + 4.2 : ty - 1.2) * TILE, a: south ? Math.PI / 2 : -Math.PI / 2 };
  home.garageDoor = { x: (tx + w / 2) * TILE, y: (south ? ty + 3 : ty) * TILE, w: w * TILE };
  driveway(m, tx, w, south ? ty + 3 : ty - 1, south ? 1 : -1);
}

function estateHouse(m, rand, type, key, x, y, south) {
  const pf = PREFABS[key];
  const d = nearestDist(m, x + 3, y + 7);
  const before = m.homes.length;
  placePrefab(m, { d, y, h: pf.th, face: south ? 'S' : 'N' }, key, x, null, rand);
  const home = m.homes[before];
  if (!home) return;
  const T_ = ESTATE_TYPES[type];
  const n = m.homes.filter((h) => h.kind === type).length + 1;
  home.kind = type; home.name = `${T_.name} #${n}`; home.price = T_.price; home.slots = T_.slots;
  const poi = m.pois.find((q) => q.kind === 'home' && q.home === home.id);
  if (poi) poi.label = home.name;
  // the house's own walk to its door connects to the road too
  driveway(m, Math.floor(home.x / TILE), 1, Math.floor(home.y / TILE) + (south ? 1 : -1), south ? 1 : -1);
  addGarage(m, home, x + pf.tw, south ? y + pf.th - 3 : y, south);
  // yard dressing
  const yard = type === 'beach' ? ['palm_a', 'palm_b', 'umbrella_r', 'umbrella_y'] : type === 'farmhouse' ? ['tree_a', 'pallet', 'drum', 'wheelbarrow'] : ['tree_b', 'shrub_a', 'flowers_a', 'bush_c'];
  for (let k = 0; k < 4; k++) {
    // somewhere open in the yard - never on the roof, the path or the driveway
    for (let tries = 0; tries < 16; tries++) {
      const px = (x + 0.8 + rand() * (pf.tw - 1.6)) * TILE, py = (y + 0.8 + rand() * (pf.th - 1.6)) * TILE;
      const t = m.tileAtPx(px, py);
      if (t !== T.GRASS && t !== T.SAND && t !== T.DIRT) continue;
      if ([[-14, 0], [14, 0], [0, -14], [0, 14]].some(([dx, dy]) => m.tileAtPx(px + dx, py + dy) === T.BUILDING)) continue;
      addProp(m, yard[k], px, py, yard[k].startsWith('tree') || yard[k].startsWith('palm') ? 12 : 0);
      break;
    }
  }
}

// A mansion: big hip-roofed house on a walled lawn with a fountain, pool, hedges and a
// three-car garage at the end of a long driveway.
function mansion(m, rand, x, y) {
  const [W, H] = MANSION_SIZE;
  const d = nearestDist(m, x + 8, y + 8);
  m.fill(x, y, W, H, T.GRASS);
  const bx = x + 7, by = y + 9, bw = 12, bh = 8; // the house
  for (let yy = by; yy < by + bh; yy++) for (let xx = bx; xx < bx + bw; xx++) m.set(xx, yy, T.BUILDING);
  const bid = m.buildings.length;
  const b = { id: bid, prefab: -1, roof: -1, tx: bx, ty: by, tw: bw, th: bh, kind: 'mansion', name: 'Mansion', business: null, signs: [] };
  m.buildings.push(b);
  for (let yy = by; yy < by + bh; yy++) for (let xx = bx; xx < bx + bw; xx++) m.bld[yy * MAP_W + xx] = bid;
  m.mansions.push({ tx: bx, ty: by, tw: bw, th: bh, lot: { tx: x, ty: y, tw: W, th: H } });
  // front terrace + walk to the gate (door faces north, toward the island road)
  m.fill(bx + 4, y + 1, 4, by - y - 1, T.PLAZA);
  const id = m.homes.length;
  const T_ = ESTATE_TYPES.mansion;
  const door = { x: (bx + 6) * TILE, y: (by - 1.5) * TILE }; // on the terrace, in front of the portico
  const home = { id, kind: 'mansion', name: `${T_.name}`, price: T_.price, slots: T_.slots, x: door.x, y: door.y, garage: null, b: bid };
  m.homes.push(home);
  m.pois.push({ id: m.pois.length, kind: 'home', home: id, label: home.name, x: door.x, y: door.y, r: 44, b: bid });
  b.home = id;
  driveway(m, bx + 5, 2, y - 1, -1);
  // three-car garage to the side, its own driveway out to the road
  addGarage(m, home, x + W - 6, y + 2, false, 5);
  // grounds: fountain, pool deck, hedges around the lot, trees, lamps
  addProp(m, 'fountain', (bx + 6) * TILE, (y + 5) * TILE, 36);
  m.fill(x + 2, by + 1, 4, 6, T.PLAZA);
  m.mansions[m.mansions.length - 1].pool = { tx: x + 2.5, ty: by + 1.5, tw: 3, th: 5 };
  for (let k = 0; k < W; k += 3) { addProp(m, 'shrub_a', (x + k + 0.5) * TILE, (y + H - 0.6) * TILE, 0); }
  for (let k = 3; k < H - 2; k += 3) { addProp(m, 'shrub_b', (x + 0.6) * TILE, (y + k) * TILE, 0); addProp(m, 'shrub_b', (x + W - 0.6) * TILE, (y + k) * TILE, 0); }
  for (const [tx, ty] of [[x + 3, y + 3], [x + 20, y + 20], [x + 3, y + 21], [x + 22, y + 13], [x + 14, y + 20], [x + 9, y + 21]]) addProp(m, rand() < 0.5 ? 'tree_a' : 'tree_b', tx * TILE, ty * TILE, 12);
  for (const fy of [y + 2, y + 5]) { addProp(m, 'lamp', (bx + 3.6) * TILE, fy * TILE); addProp(m, 'lamp', (bx + 8.4) * TILE, fy * TILE); }
  addProp(m, 'flowers_big', (bx + 2) * TILE, (by - 1.5) * TILE, 0);
  addProp(m, 'flowers_big', (bx + 10) * TILE, (by - 1.5) * TILE, 0);
  void d;
}

// Paint shops ("Spray & Go"): a storefront gets a 3x3-tile drive-in bay carved into its front.
// Drive in, and if nobody is watching the shutter comes down and the car gets a new colour.
function buildPaintShops(m) {
  m.bays = [];
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const road = (tx, ty) => { const t = m.tileAt(tx, ty); return t === T.ROAD || t === T.LOT || t === T.SIDEWALK || t === T.PLAZA; };
  const cands = m.pois.filter((p) => {
    if (p.kind !== 'delivery' || p.b === undefined) return false;
    const b = m.buildings[p.b];
    return b && b.tw >= 5 && b.th >= 5;
  });
  cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 31) - hash2(b.x | 0, b.y | 0, 31));
  const picked = [];
  const isl = (p) => Object.keys(ISLANDS).find((k) => { const [x0, y0, x1, y1] = ISLANDS[k].box; return p.x / TILE >= x0 && p.x / TILE < x1 && p.y / TILE >= y0 && p.y / TILE < y1; });
  // one per island first, then anywhere
  for (const pass of [0, 1]) for (const c of cands) {
    if (picked.length >= 3) break;
    if (picked.includes(c) || picked.some((q) => distOf(q) === distOf(c) || Math.hypot(q.x - c.x, q.y - c.y) < 2500)) continue;
    if (pass === 0 && picked.some((q) => isl(q) === isl(c))) continue;
    const b = m.buildings[c.b];
    const south = c.y > (b.ty + b.th / 2) * TILE; // door on the south edge
    const dtx = Math.floor(c.x / TILE);
    const tx0 = Math.max(b.tx, Math.min(b.tx + b.tw - 3, dtx - 1));
    const ty0 = south ? b.ty + b.th - 3 : b.ty;
    // the tiles in front of the bay must be drivable
    const fy = south ? b.ty + b.th : b.ty - 1;
    if (![0, 1, 2].every((k) => road(tx0 + k, fy))) continue;
    picked.push(c);
    for (let y = ty0; y < ty0 + 3; y++) for (let x = tx0; x < tx0 + 3; x++) m.set(x, y, T.LOT);
    const old = c.label;
    c.kind = 'paint'; c.label = `Spray & Go - ${DISTRICTS[distOf(c)].name}`;
    c.x = (tx0 + 1.5) * TILE; c.y = south ? (ty0 + 3.6) * TILE : (ty0 - 0.6) * TILE;
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'Spray & Go';
    m.bays.push({ poi: c.id, tx: tx0, ty: ty0, tw: 3, th: 3, south });
  }
}

// Police motor pools: a fenced lot beside each police station, carved out of a neighbouring
// plain building. Cruisers and police motorcycles wait inside; the sliding gate on the street
// side opens only for officers. Officers who sign up walk out of the armory into the lot.
export const POOL_MODELS = ['police', 'police', 'police', 'policebike', 'policebike'];
function buildMotorPools(m) {
  m.motorPools = [];
  const isRoad = (tx, ty) => { const t = m.tileAt(tx, ty); return t === T.ROAD || t === T.BRIDGE; };
  for (const st of m.pois.filter((q) => q.kind === 'police')) {
    const sb = m.buildings[st.b];
    if (!sb) continue;
    const used = new Set(m.pois.map((q) => q.b).filter((b) => b !== undefined));
    let best = null, bd = Infinity;
    for (const b of m.buildings) {
      if (b.prefab !== -1 || b.kind !== 'roof' || used.has(b.id) || b.tw < 6 || b.tw > 12 || b.th < 10) continue;
      const gapX = Math.max(0, b.tx - (sb.tx + sb.tw), sb.tx - (b.tx + b.tw));
      const gapY = Math.max(0, b.ty - (sb.ty + sb.th), sb.ty - (b.ty + b.th));
      if (gapX > 2 || gapY > 2) continue;
      // the gate goes on the short side that faces a road
      const south = [1, 2, 3].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty + b.th - 1 + k));
      const north = [1, 2, 3].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty - k));
      if (!south && !north) continue;
      const d = Math.hypot(b.tx + b.tw / 2 - (sb.tx + sb.tw / 2), b.ty + b.th / 2 - (sb.ty + sb.th / 2));
      if (d < bd) { bd = d; best = { b, south }; }
    }
    if (!best) continue;
    const { b, south } = best;
    if (b.roof >= 0 && m.roofs[b.roof]) m.roofs[b.roof].gone = true;
    b.kind = 'motorpool'; b.name = 'Motor Pool'; b.roof = -1;
    const x0 = b.tx, y0 = b.ty, w = b.tw, h = b.th;
    for (let ty = y0; ty < y0 + h; ty++) for (let tx = x0; tx < x0 + w; tx++) {
      m.bld[ty * MAP_W + tx] = -1;
      const edge = tx === x0 || tx === x0 + w - 1 || ty === (south ? y0 : y0 + h - 1);
      m.set(tx, ty, edge ? T.WALL : T.LOT);
    }
    // the gate: the whole street-side end between the corner posts
    const gy = south ? y0 + h - 1 : y0;
    for (let tx = x0 + 1; tx < x0 + w - 1; tx++) m.set(tx, gy, T.LOT);
    // apron out to the road so cars can get in and out
    for (let k = 1; k <= 3; k++) {
      const yy = south ? gy + k : gy - k;
      if (isRoad(x0 + Math.floor(w / 2), yy)) break;
      for (let tx = x0 + 1; tx < x0 + w - 1; tx++) { const t = m.tileAt(tx, yy); if (t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP) m.set(tx, yy, T.LOT); }
    }
    const gate = { x: (x0 + w / 2) * TILE, y: (gy + 0.5) * TILE, w: (w - 2) * TILE, south, props: [] };
    for (let px = (x0 + 1) * TILE + 8; px <= (x0 + w - 1) * TILE - 8; px += 14) {
      const e = m.addSolidProp(px, gate.y, 10);
      e.gate = m.motorPools.length;
      gate.props.push(e);
    }
    // vehicles: cruisers down the far wall, nose to the gate; bikes in the second column
    const dir = south ? 1 : -1, heading = south ? Math.PI / 2 : -Math.PI / 2;
    const far = south ? y0 + 1 : y0 + h - 2; // first interior row away from the gate
    const spots = [];
    const colA = (x0 + 1) * TILE + 30, colB = (x0 + 1) * TILE + 30 + 64;
    let ya = (far + 0.5) * TILE + dir * 46, yb = ya;
    for (const model of POOL_MODELS) {
      if (model === 'police') { spots.push({ x: colA, y: ya, a: heading, model }); ya += dir * 104; }
      else { spots.push({ x: colB, y: yb, a: heading, model }); yb += dir * 64; }
    }
    // where a new officer walks out of the armory: the station-side corner, away from the cars
    const exit = { x: (x0 + w - 2) * TILE, y: (far + 0.5) * TILE + dir * 20 };
    m.motorPools.push({ station: st.id, b: b.id, tx: x0, ty: y0, tw: w, th: h, south, gate, spots, exit });
    st.pool = m.motorPools.length - 1;
  }
}

// Walk-in buildings: shops, banks, hospitals, the courthouse and police stations get a real
// interior behind their front door - a one-tile wall ring, a floor, partition walls between the
// units of a strip mall, and a counter with a clerk behind it. The roof art fades out while you
// are inside (client). The place's interaction point moves in front of its counter.
export const WALK_IN = new Set(['hospital', 'gunshop', 'sports', 'hardware', 'clothing', 'grocery', 'pawn', 'bank', 'courthouse', 'pharmacy', 'police', 'fence', 'fishmarket', 'coffee', 'tackle']);
const HELPER_POIS = new Set(['reception', 'evidence', 'atm']);
function buildInteriors(m) {
  m.walkIns = [];
  const byB = new Map();
  for (const p of m.pois) if (p.b !== undefined) { if (!byB.has(p.b)) byB.set(p.b, []); byB.get(p.b).push(p); }
  const bays = new Set((m.bays || []).map((bay) => m.bld[bay.ty * MAP_W + bay.tx]));
  for (const [bid, list] of byB) {
    const b = m.buildings[bid];
    if (!b || b.prefab < 0 || b.tw < 5 || b.th < 5 || bays.has(bid)) continue;
    const main = list.filter((p) => WALK_IN.has(p.kind) || p.kind === 'delivery');
    if (!main.some((p) => WALK_IN.has(p.kind)) || list.some((p) => !WALK_IN.has(p.kind) && !HELPER_POIS.has(p.kind) && p.kind !== 'delivery')) continue;
    const south = m.prefabs[b.prefab].rot === 0;
    const x0 = b.tx + 1, x1 = b.tx + b.tw - 2, y0 = b.ty + 1, y1 = b.ty + b.th - 2; // interior (inclusive)
    main.sort((a, c) => a.x - c.x);
    const depth = y1 - y0 + 1;
    const back = south ? y0 : y1, dir = south ? 1 : -1;
    const counterRow = back + dir * Math.max(1, Math.min(3, Math.floor(depth * 0.3)));
    const units = [];
    main.forEach((p, i) => {
      const dc = Math.max(x0, Math.min(x1, Math.floor(p.x / TILE)));
      const ux0 = i === 0 ? x0 : Math.floor((Math.floor(main[i - 1].x / TILE) + dc) / 2) + 1;
      const ux1 = i === main.length - 1 ? x1 : Math.floor((dc + Math.floor(main[i + 1].x / TILE)) / 2) - 1;
      if (!WALK_IN.has(p.kind) || ux1 - ux0 < 1) return; // other storefronts in the row stay closed
      for (let ty = y0; ty <= y1; ty++) for (let tx = ux0; tx <= ux1; tx++) m.set(tx, ty, T.FLOOR);
      // the doorway: two tiles of the front wall
      const fy = south ? b.ty + b.th - 1 : b.ty;
      const d2 = dc - 1 >= ux0 ? dc - 1 : dc + 1;
      const dx0 = Math.min(dc, d2);
      m.set(dc, fy, T.FLOOR); if (d2 <= ux1) m.set(d2, fy, T.FLOOR);
      // the counter, with a gap at the far end so staff could get round (not on tiny units)
      const cw = ux1 - ux0 + 1;
      for (let tx = ux0; tx <= ux1; tx++) if (cw < 4 || tx !== ux1) m.set(tx, counterRow, T.COUNTER);
      const cx = (ux0 + ux1 + 1) / 2 * TILE;
      const staffY = (counterRow - dir + 0.5) * TILE, frontY = (counterRow + dir + 0.55) * TILE;
      p.outside = { x: p.x, y: p.y };
      p.x = cx; p.y = frontY; p.r = Math.max(p.r || 40, 40);
      units.push({ poi: p.id, kind: p.kind, x0: ux0, x1: ux1, counterRow, clerk: { x: cx, y: staffY, a: south ? Math.PI / 2 : -Math.PI / 2 }, door: { tx: dx0, ty: fy, w: 2 } });
      // a hospital's ER mat sits beside its desk
      for (const q of list) if (q.kind === 'reception') { q.x = cx - 48; q.y = frontY + dir * 10; }
    });
    if (!units.length) continue;
    b.walkIn = { south, units, x0, x1, y0, y1 };
    m.walkIns.push(bid);
  }
}

// Dealership display lots: parking spaces on the open lot around each dealership where cars
// in stock wait with price tags. Walk up to one to buy it.
function buildDealerLots(m) {
  m.dealerLots = [];
  const L = 108, W = 62; // a parking space (a little bigger than a sedan)
  for (const d of m.pois.filter((q) => q.kind === 'dealer')) {
    const b = m.buildings[d.b];
    if (!b) continue;
    const slots = [];
    const free = (x, y, a) => {
      const hl = (a ? W : L) / 2, hw = (a ? L : W) / 2;
      for (let yy = y - hw; yy <= y + hw; yy += 8) for (let xx = x - hl; xx <= x + hl; xx += 8) if (m.tileAtPx(xx, yy) !== T.LOT) return false;
      return !slots.some((s) => Math.abs(s.x - x) < ((s.a ? W : L) + (a ? W : L)) / 2 + 4 && Math.abs(s.y - y) < ((s.a ? L : W) + (a ? L : W)) / 2 + 4);
    };
    const cands = [];
    for (let y = (b.ty - 8) * TILE; y <= (b.ty + b.th + 8) * TILE; y += 16) for (let x = (b.tx - 8) * TILE; x <= (b.tx + b.tw + 8) * TILE; x += 16) cands.push({ x, y, d: Math.hypot(x - d.x, y - d.y) });
    cands.sort((a, c) => a.d - c.d);
    for (const c of cands) {
      if (slots.length >= 6) break;
      if (free(c.x, c.y, 0)) slots.push({ x: c.x, y: c.y, a: 0 });
      else if (free(c.x, c.y, 1)) slots.push({ x: c.x, y: c.y, a: 1 });
    }
    m.dealerLots.push({ poi: d.id, slots: slots.map((s) => ({ x: s.x, y: s.y, a: s.a ? Math.PI / 2 : 0 })) });
    m.parking = m.parking.filter((s) => !slots.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < 80)); // the lot is the dealer's now
  }
}

// Bait & tackle shops: storefronts close to the water, in different districts, spread apart.
function buildTackleShops(m) {
  const nearWater = (p) => {
    const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE);
    for (let dy = -18; dy <= 18; dy += 2) for (let dx = -18; dx <= 18; dx += 2) { const t = m.tileAt(cx + dx, cy + dy); if (t === T.WATER || t === T.DEEP) return true; }
    return false;
  };
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const cands = m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && nearWater(p) && !DISTRICTS[distOf(p)].turf && !/warehouse|factory/i.test(p.label));
  cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 23) - hash2(b.x | 0, b.y | 0, 23));
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 3) break;
    if (picked.some((q) => distOf(q) === distOf(c) || Math.hypot(q.x - c.x, q.y - c.y) < 2200)) continue;
    picked.push(c);
  }
  for (const c of picked) {
    const old = c.label;
    c.kind = 'tackle'; c.label = `Hook & Line Bait - ${DISTRICTS[distOf(c)].name}`;
    const b = m.buildings[c.b];
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'Bait & Tackle';
  }
}

// One syndicate headquarters per gang-turf district: the storefront nearest the district's heart.
function buildGangHQs(m) {
  DISTRICTS.forEach((d, di) => {
    if (!d.turf) return;
    let sx = 0, sy = 0, n = 0;
    for (let ty = 0; ty < MAP_H; ty += 3) for (let tx = 0; tx < MAP_W; tx += 3) if (m.dist[ty * MAP_W + tx] === di) { sx += tx; sy += ty; n++; }
    if (!n) return;
    const cx = (sx / n) * TILE, cy = (sy / n) * TILE;
    const c = m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === di)
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (!c) return;
    const old = c.label;
    c.kind = 'gang'; c.label = `Syndicate HQ - ${d.name}`;
    const b = m.buildings[c.b];
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'Syndicate HQ';
  });
}

function filler(m, row, x, w, st, rand, backLot = false) {
  if (w <= 0) return;
  const x0 = x, y0 = row.y, h = row.h;
  if (st.roof && w >= 4 && h >= 4 && rand() < (backLot ? Math.max(st.roof, 0.7) : st.roof)) { roofBuilding(m, row, x0, y0, w, h, st, rand); return; }
  let kind = w >= 5 && (st.filler === 'parking' || st.filler === 'yard' || (st.filler === 'plaza' && rand() < 0.4)) ? 'parking' : st.filler;
  if (backLot && kind === 'parking' && h < 4) kind = st.filler === 'parking' ? 'plaza' : st.filler;
  if (backLot && st.filler === 'yard' && rand() < 0.5 && h >= 4) kind = 'parking';
  if (kind === 'parking') {
    m.fill(x0, y0, w, h, T.LOT);
    // stalls along the road-side edge, cars nose-in
    const sy = row.face === 'S' ? y0 + h - 2 : y0 + 2;
    if (h < 4) return;
    for (let sx = x0 + 1; sx + 2 <= x0 + w; sx += 2) {
      m.parking.push({ x: (sx + 1) * TILE, y: sy * TILE, a: row.face === 'S' ? -Math.PI / 2 : Math.PI / 2 });
      m.stalls.push({ x: sx * TILE, y: (sy - 2) * TILE, w: 2 * TILE, h: 4 * TILE });
    }
    if (h >= 9) for (let sx = x0 + 1; sx + 2 <= x0 + w; sx += 2) {
      const yy = row.face === 'S' ? y0 + 2 : y0 + h - 2;
      m.parking.push({ x: (sx + 1) * TILE, y: yy * TILE, a: row.face === 'S' ? Math.PI / 2 : -Math.PI / 2 });
      m.stalls.push({ x: sx * TILE, y: (yy - 2) * TILE, w: 2 * TILE, h: 4 * TILE });
    }
    return;
  }
  if (kind === 'yard') {
    m.fill(x0, y0, w, h, T.LOT);
    const pool = ['pallet', 'pallet_b', 'drum', 'spool', 'pipes', 'dump_g', 'dump_b', 'tires', 'lumber', 'planks'];
    for (let k = 0; k < Math.max(1, (w * h) / 30); k++) {
      const px = (x0 + 1 + rand() * (w - 2)) * TILE, py = (y0 + 1 + rand() * (h - 2)) * TILE;
      const t = pool[Math.floor(rand() * pool.length)];
      addProp(m, t, px, py, t.startsWith('dump') ? 16 : 10);
    }
    return;
  }
  if (kind === 'plaza') {
    m.fill(x0, y0, w, h, T.PLAZA);
    const cx = (x0 + w / 2) * TILE, cy = (y0 + h / 2) * TILE;
    if (w >= 5 && h >= 5 && rand() < 0.5) addProp(m, 'fountain', cx, cy, 36);
    else addProp(m, rand() < 0.5 ? 'flowers_big' : 'planter_fl', cx, cy, 14);
    for (let k = 0; k < 3; k++) addProp(m, ['bench_a', 'bench_m', 'potted', 'trashcan', 'umbrella_r', 'umbrella_b'][Math.floor(rand() * 6)], (x0 + 0.8 + rand() * (w - 1.6)) * TILE, (y0 + 0.8 + rand() * (h - 1.6)) * TILE, 0);
    return;
  }
  // park / greenery
  m.fill(x0, y0, w, h, T.GRASS);
  for (let k = 0; k < Math.max(1, (w * h) / 18); k++) {
    const t = ['tree_a', 'tree_b', 'shrub_a', 'shrub_b', 'bush_c', 'flowers_a'][Math.floor(rand() * 6)];
    addProp(m, t, (x0 + 0.7 + rand() * (w - 1.4)) * TILE, (y0 + 0.7 + rand() * (h - 1.4)) * TILE, t.startsWith('tree') ? 12 : 0);
  }
}

function buildPark(m, b, rand, info) {
  const { ix, iy, iw, ih } = b;
  m.fill(ix, iy, iw, ih, T.GRASS);
  const cx = ix + Math.floor(iw / 2), cy = iy + Math.floor(ih / 2);
  // winding-free GTA park: cross paths, a plaza with a fountain, a ring path
  m.fill(ix, cy - 1, iw, 2, T.PLAZA);
  m.fill(cx - 1, iy, 2, ih, T.PLAZA);
  for (let x = ix + 4; x < ix + iw - 4; x++) { m.set(x, iy + 4, T.PLAZA); m.set(x, iy + ih - 5, T.PLAZA); }
  for (let y = iy + 4; y < iy + ih - 4; y++) { m.set(ix + 4, y, T.PLAZA); m.set(ix + iw - 5, y, T.PLAZA); }
  m.fill(cx - 4, cy - 4, 8, 8, T.PLAZA);
  addProp(m, 'fountain', cx * TILE, cy * TILE, 36);
  for (const [dx, dy] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) addProp(m, 'pbench', (cx + dx) * TILE, (cy + dy) * TILE, 0);
  if (info.pond) {
    // duck pond in the north-east quarter (fishable)
    const px = cx + Math.floor(iw / 4), py = cy - Math.floor(ih / 4), rx = Math.floor(iw / 6), ry = Math.floor(ih / 7);
    for (let y = py - ry; y <= py + ry; y++) for (let x = px - rx; x <= px + rx; x++) {
      const k = ((x - px) / rx) ** 2 + ((y - py) / ry) ** 2;
      if (k <= 1 && m.tileAt(x, y) === T.GRASS) m.set(x, y, k < 0.45 ? T.DEEP : T.WATER);
    }
  }
  for (let k = 0; k < (iw * ih) / 12; k++) {
    const tx = ix + 1 + Math.floor(rand() * (iw - 2)), ty = iy + 1 + Math.floor(rand() * (ih - 2));
    if (m.tileAt(tx, ty) !== T.GRASS) continue;
    const t = ['tree_a', 'tree_b', 'tree_a', 'tree_b', 'shrub_a', 'flowers_a', 'flowers_big', 'mosaic'][Math.floor(rand() * 8)];
    addProp(m, t, (tx + 0.5) * TILE, (ty + 0.5) * TILE, t.startsWith('tree') ? 12 : 0);
  }
  for (let x = ix + 6; x < ix + iw - 6; x += 9) { addProp(m, 'lamp', (x + 0.5) * TILE, (iy + 4.5) * TILE); addProp(m, 'lamp', (x + 0.5) * TILE, (iy + ih - 4.5) * TILE); }
  m.pois.push({ id: m.pois.length, kind: 'delivery', label: info.label, x: cx * TILE, y: (cy + 4.5) * TILE, r: 48 });
}

function addProp(m, t, x, y, solidR = 0, extra = null) {
  const p = { t, x, y };
  if (extra) Object.assign(p, extra);
  m.props.push(p);
  if (t === 'lamp' && !solidR) solidR = 5; // lamp posts are solid poles (and can be knocked down)
  if (solidR > 0) { const e = m.addSolidProp(x, y, solidR); e.pi = m.props.length - 1; e.brk = BREAKABLE.has(t); m.propSolid.set(e.pi, e); }
  if (t === 'lamp') m.lamps.push(p);
  return p;
}

// Street furniture vehicles can smash through. Heavy items slow the car more; everything not
// listed (fountains, dumpsters, ATMs, market stalls, flat beds) stays put.
export const BREAKABLE = new Set([
  'tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c',
  'hydrant', 'hydrant_y', 'trashcan', 'bench_a', 'bench_b', 'bench_m', 'pbench', 'planter_sq', 'planter_g', 'planter_fl', 'potted',
  'news_a', 'news_b', 'news_c', 'mailbox', 'vend_a', 'vend_cola', 'vend_c', 'bikerack', 'cone', 'barrier', 'drum', 'pallet', 'pallet_b',
  'pallet_s', 'umbrella_r', 'umbrella_b', 'umbrella_g', 'umbrella_y', 'lamp', 'foodcart', 'foodcart_b', 'tires', 'bags', 'spool',
  'lumber', 'planks', 'flowers_a', 'flowers_big', 'pipes', 'wheelbarrow', 'sandbags', 'cart', 'produce_a', 'produce_b',
]);
export const HEAVY_PROPS = new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'lamp', 'vend_a', 'vend_cola', 'vend_c', 'spool', 'sandbags', 'hydrant', 'hydrant_y']);

// Point every lamp's arm at the nearest road so the head hangs over the street.
function aimLamps(m) {
  for (const l of m.lamps) {
    const tx = Math.floor(l.x / TILE), ty = Math.floor(l.y / TILE);
    let best = null, bd = 1e9;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = m.tileAt(tx + dx, ty + dy);
      if (t !== T.ROAD && t !== T.BRIDGE) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [dx, dy]; }
    }
    l.a = best ? Math.atan2(Math.abs(best[0]) >= Math.abs(best[1]) ? 0 : best[1], Math.abs(best[0]) >= Math.abs(best[1]) ? best[0] : 0) : -Math.PI / 2;
  }
}

// ---------------------------------------------------------------------------
// Strip between each coast ring road and the water: Industrial quays, Downtown promenade,
// Residential lawns and Sunset Beach, with piers and marina berths.
function buildWaterfronts(m, rand) {
  const isRoad = (t) => t === T.ROAD || t === T.BRIDGE;
  for (const [key, I] of Object.entries(ISLANDS)) {
    if (!I.ring) continue;
    const [x0, y0, x1, y1] = I.ring;
    const [bx0, by0, bx1, by1] = I.box;
    for (let ty = by0 - 3; ty < by1 + 3; ty++) for (let tx = bx0 - 3; tx < bx1 + 3; tx++) {
      if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) continue;
      const t = m.tileAt(tx, ty);
      if (t !== T.SIDEWALK) continue;
      const out = Math.max(x0 - 1 - tx, tx - x1, y0 - 1 - ty, ty - y1); // tiles beyond the ring road
      if (out < 2) continue;
      if (key === 'R' && ty >= y1) m.set(tx, ty, T.SAND);
      else if (key === 'I') m.set(tx, ty, T.LOT);
      else if (key === 'D') m.set(tx, ty, T.PLAZA);
      else m.set(tx, ty, T.GRASS);
    }
    // dressing along the outer edge of the strip
    for (let ty = by0; ty < by1; ty += 3) for (let tx = bx0; tx < bx1; tx += 3) {
      const t = m.tileAt(tx, ty);
      if (t !== T.LOT && t !== T.PLAZA && t !== T.GRASS && t !== T.SAND) continue;
      if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) continue;
      let nearRoad = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isRoad(m.tileAt(tx + dx, ty + dy))) nearRoad = true;
      if (nearRoad || inEstateLot(tx, ty)) continue;
      const h = hash2(tx, ty, 91);
      const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
      if (key === 'I') { if (h < 0.22) addProp(m, ['pallet', 'drum', 'spool', 'pallet_b', 'dump_b', 'pipes'][Math.floor(h * 27) % 6], x, y, 10); }
      else if (key === 'D') { if (h < 0.18) addProp(m, ['palm_a', 'palm_b', 'bench_m', 'palm_c', 'planter_sq'][Math.floor(h * 28) % 5], x, y, h < 0.1 ? 10 : 0); else if (h > 0.93) addProp(m, 'lamp', x, y); }
      else if (key === 'R' && t === T.SAND) { if (h < 0.08) addProp(m, ['palm_a', 'palm_b', 'palm_c', 'palm_d'][Math.floor(h * 50) % 4], x, y, 10); else if (h > 0.95) addProp(m, ['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'][Math.floor(h * 400) % 4], x, y, 0); }
      else if (h < 0.2) addProp(m, h < 0.12 ? 'tree_b' : 'shrub_a', x, y, h < 0.12 ? 12 : 0);
    }
  }
  // Sunset Beach piers into the open sea (vertical); the first is the public fishing pier
  const R = ISLANDS.R;
  const beachTop = R.ring[3] + 2;
  for (const px of [40, 104, 166]) {
    let bottom = beachTop;
    while (m.tileAt(px + 1, bottom) !== T.DEEP && bottom < MAP_H - 6) bottom++;
    const len = bottom + 8 - beachTop;
    m.fill(px, beachTop, 3, len, T.DOCK);
    m.fill(px - 3, beachTop + len - 3, 9, 3, T.DOCK);
    addProp(m, 'lamp', (px + 1.5) * TILE, (beachTop + len - 2) * TILE);
    const wy = (bottom + 3) * TILE;
    m.marina.push({ x: (px + 5.5) * TILE, y: wy, a: Math.PI / 2 });
    m.marina.push({ x: (px - 2.5) * TILE, y: wy, a: Math.PI / 2 });
  }
  m.dropSites.push({ x: 41.5 * TILE, y: (m.marina[0].y / TILE + 4) * TILE, name: 'the end of the public pier' });
  // Harbor docks: piers from the Industrial quay into the channel (horizontal), boats berthed alongside
  const qx = ISLANDS.I.ring[2] + 2;
  for (const py of [22, 38, 54, 68]) {
    m.fill(qx, py, RIVER_X0 + 7 - qx, 3, T.DOCK);
    addProp(m, 'lamp', (RIVER_X0 + 6) * TILE, (py + 1.5) * TILE);
    m.marina.push({ x: (RIVER_X0 + 4) * TILE, y: (py - 1.6) * TILE, a: 0 });
    m.marina.push({ x: (RIVER_X0 + 4) * TILE, y: (py + 4.6) * TILE, a: 0 });
  }
  // Downtown east-shore marina
  const ex = ISLANDS.D.ring[2] + 2;
  for (const py of [130, 160, 200]) {
    m.fill(ex, py, ISLANDS.D.box[2] + 9 - ex, 3, T.DOCK);
    m.marina.push({ x: (ISLANDS.D.box[2] + 5) * TILE, y: (py - 1.6) * TILE, a: 0 });
    m.marina.push({ x: (ISLANDS.D.box[2] + 5) * TILE, y: (py + 4.6) * TILE, a: 0 });
  }
}

// Rural Refuge Island: farm road, crop fields, the co-op farmhouse and woods.
function buildRefuge(m, rand) {
  const F = ISLANDS.F;
  const fields = [[238, 349, 96, 9], [352, 349, 52, 9], [238, 367, 52, 24], [314, 367, 26, 24], [346, 367, 56, 24]];
  for (const [fx, fy, fw, fh] of fields) {
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) if (m.tileAt(x, y) === T.GRASS) m.set(x, y, T.FIELD);
    m.fields.push({ x: fx * TILE, y: fy * TILE, w: fw * TILE, h: fh * TILE });
  }
  const pf = PREFABS.house2;
  const fx = 296, fy = 366;
  m.fill(fx - 4, fy, pf.tw + 8, pf.th + 2, T.DIRT);
  const row = { d: 9, x: fx, y: fy, w: pf.tw, h: pf.th, face: 'N' };
  placePrefab(m, row, 'house2', fx, { biz: ['farm'], names: ['Refuge Farm Co-op'] }, rand);
  const farm = m.pois.find((p) => p.kind === 'farm');
  farm.cargoPad = { x: (fx - 2.5) * TILE, y: (fy + 3) * TILE };
  for (let k = 0; k < 60; k++) {
    const tx = F.box[0] + Math.floor(rand() * (F.box[2] - F.box[0])), ty = F.box[1] + Math.floor(rand() * (F.box[3] - F.box[1]));
    if (m.tileAt(tx, ty) === T.GRASS) addProp(m, rand() < 0.8 ? 'tree_b' : 'shrub_b', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12);
  }
  m.dropSites.push({ x: 400 * TILE, y: 362 * TILE, name: 'the Refuge Island boonies' });
}

function buildStreetProps(m) {
  const doorsNear = new Set();
  for (const p of m.pois) doorsNear.add(`${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`);
  for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < MAP_W - 1; tx++) {
    if (m.tileAt(tx, ty) !== T.SIDEWALK) continue;
    const isRoad = (a, b) => { const q = m.tileAt(a, b); return q === T.ROAD || q === T.BRIDGE; };
    const nearRoad = isRoad(tx + 1, ty) || isRoad(tx - 1, ty) || isRoad(tx, ty + 1) || isRoad(tx, ty - 1);
    const d = DISTRICTS[m.dist[ty * MAP_W + tx]];
    const h = hash2(tx, ty, 77);
    let skip = false;
    for (let dy = -1; dy <= 1 && !skip; dy++) for (let dx = -2; dx <= 2; dx++) if (doorsNear.has(`${tx + dx},${ty + dy}`)) skip = true;
    if (skip) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (nearRoad) {
      if ((tx * 7 + ty * 13) % 9 === 0 && (tx + ty) % 2 === 0) addProp(m, 'lamp', x, y);
      else if (h < 0.025) addProp(m, 'hydrant', x, y, 6);
      continue;
    }
    // inner sidewalk ring: district dressing
    if (h < 0.05) {
      const pool = {
        houses: ['tree_a', 'shrub_a', 'mailbox', 'bush_a'], apartments: ['tree_b', 'bench_a', 'bush_b', 'trashcan'], civic: ['tree_a', 'bench_b', 'planter_sq'],
        towers: ['planter_sq', 'bench_m', 'news_a', 'news_b', 'trashcan', 'palm_s'], commercial: ['news_c', 'trashcan', 'bench_a', 'planter_g', 'bikerack'],
        nightlife: ['palm_s', 'palm_d', 'trashcan', 'news_b', 'foodcart'], industrial: ['dump_g', 'drum', 'pallet_s', 'cone'],
        southside: ['bags', 'dump_o', 'tires', 'shrub_b'], harbor: ['drum', 'pallet', 'spool', 'dump_b'], factory: ['dump_g', 'drum', 'pallet_s', 'cone', 'tires'], park: ['tree_a', 'bench_a', 'shrub_a'],
      }[d.style] || ['trashcan'];
      const t = pool[Math.floor(hash2(tx, ty, 5) * pool.length)];
      addProp(m, t, x, y, t.startsWith('tree') || t.startsWith('dump') ? 10 : 0);
    }
  }
}

function buildLaneGraph(m) {
  const segs = m.roads.filter((r) => r.width >= 3);
  const V = segs.filter((r) => r.axis === 'v'), H = segs.filter((r) => r.axis === 'h');
  const nodes = [];
  const onSeg = new Map(); // seg id -> [node]
  for (const v of V) for (const h of H) {
    if (v.x + v.w <= h.x || h.x + h.w <= v.x || h.y + h.h <= v.y || v.y + v.h <= h.y) continue;
    const n = {
      id: nodes.length, x: (v.x + v.w / 2) * TILE, y: (h.y + h.h / 2) * TILE, links: {}, lane: {},
      half: Math.max(v.width, h.width) * TILE / 2, light: false, phase: 0, v: v.id, h: h.id,
      kinds: [v.kind, h.kind],
    };
    nodes.push(n);
    (onSeg.get(v.id) || onSeg.set(v.id, []).get(v.id)).push(n);
    (onSeg.get(h.id) || onSeg.set(h.id, []).get(h.id)).push(n);
  }
  for (const r of segs) {
    const list = onSeg.get(r.id) || [];
    list.sort((a, b) => (r.axis === 'v' ? a.y - b.y : a.x - b.x));
    const lane = r.width * TILE / 4;
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i], b = list[i + 1];
      if (r.axis === 'v') { a.links.S = b.id; b.links.N = a.id; a.lane.S = lane; b.lane.N = lane; }
      else { a.links.E = b.id; b.links.W = a.id; a.lane.E = lane; b.lane.W = lane; }
    }
  }
  for (const n of nodes) {
    const deg = Object.keys(n.links).length;
    n.light = deg >= 3 && !n.kinds.includes('rural') && !(n.kinds.includes('minor') && !n.kinds.includes('ave'));
    n.phase = Math.floor(hash2(n.x, n.y, m.seed) * LIGHT_CYCLE);
    n.island = n.kinds.includes('rural');
    delete n.kinds;
  }
  m.nodes = nodes;
}

function buildCameras(m, rand) {
  const lit = m.nodes.filter((n) => n.light);
  const picks = [];
  // spread cameras: prefer avenue crossings in each district
  for (let d = 0; d < DISTRICTS.length; d++) {
    const inD = lit.filter((n) => m.districtAt(n.x, n.y).id === d);
    if (!inD.length) continue;
    picks.push(inD[Math.floor(rand() * inD.length)]);
    if (d === 4 && inD.length > 2) picks.push(inD[Math.floor(rand() * inD.length)]);
  }
  for (const n of picks) m.cameras.push({ id: m.cameras.length, x: n.x + n.half + 20, y: n.y - n.half - 20, r: 300 });
}
