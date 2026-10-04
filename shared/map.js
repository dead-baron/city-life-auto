// Deterministic world generator + tile queries. Server and client both call generateCity(seed)
// and get byte-identical maps, so the map is never sent over the wire.
//
// The world follows the world map concept (tools/data/worldmap-concept.webp, one pixel = one
// tile): a big central island and wild islands around it. On the central island stands Metro
// City (see citylayout.js for the plan): a street grid with a diagonal boulevard, an elevated
// ring highway with slip ramps, curving coast and river drives, wealth tiers that blend into
// each other from the downtown towers and Bayside Heights' crescents to the rough Yards and
// Southside; across the river the winding streets of Southbank, east of town the farms of Dry
// Creek. Pelican Key and Smuggler's Rock are boat-only islands. The other islands are wild for
// now (built one by one in later rounds), reached over long bridges.
//
// Roads are polylines at any angle (roads.js); tiles are rasterized from them for collision and
// surfaces, and the renderer draws the roads as curves.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { PREFABS } from './prefab-data.js';
import { LAND, TERRAIN, TERRAIN_CELL } from './worldmask.js';
import { buildNetwork, stampEdge, stampLine, edgeZ } from './roads.js';
import { measure, pointAt, rounded, project, cubic, quad } from './geom.js';
import {
  Z, BAND, GRID_X, GRID_Y, AVE_X, AVE_Y, RIVER_BRIDGES, PARK, CRESCENT, BROADWAY, SEEDS,
  clipLine, offsetLoop, contours, smoothLine, ringLine, rampSites, slipRamp, acrossWater,
} from './citylayout.js';
import { buildLevels } from './levels.js';

export { Z };

// Islands / parts of the world shown in the tour and on the map. box: tile rect [x0, y0, x1, y1)
// (filled in by the generator from the zone map); zone: the map.zone value.
export const ISLANDS = {
  D: { name: 'Metro City', box: [559, 251, 1045, 745], zone: Z.CITY },
  R: { name: 'Southbank', box: [770, 655, 1045, 900], zone: Z.SOUTH },
  F: { name: 'Dry Creek', box: [1045, 251, 1296, 958], zone: Z.EAST },
  P: { name: 'Pelican Key', box: [542, 305, 682, 403], zone: Z.KEY, boatOnly: true },
  C: { name: "Smuggler's Rock", box: [1205, 953, 1259, 1004], zone: Z.ROCK, boatOnly: true, gang: 'syndicate' },
};
// The wild islands (built up in later rounds): a land point on each and its district.
const WILD_ISLES = [
  { at: [300, 500], d: 19 }, { at: [800, 150], d: 20 }, { at: [620, 1000], d: 21 },
  { at: [120, 1020], d: 22 }, { at: [1120, 1070], d: 22 },
];

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
// Districts. tier: wealth (lux, mid, low, rough, red, neon, suburb, rural, industrial, wild) -
// it drives pedestrians, police presence, litter and graffiti. walk / plaza / road: ground
// textures; ground: default tile inside blocks; isl: the part of the world shown under the name.
export const DISTRICTS = [
  { id: 0, name: 'Pine Hills', isl: 'Southbank', style: 'houses', tier: 'suburb', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 1, name: 'Midtown', isl: 'Metro City', style: 'commercial', tier: 'mid', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 2, name: 'Northgate', isl: 'Metro City', style: 'apartments', tier: 'mid', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 3, name: 'The Yards', isl: 'Metro City', style: 'industrial', tier: 'rough', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: true },
  { id: 4, name: 'Downtown', isl: 'Metro City', style: 'towers', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 5, name: 'Civic Center', isl: 'Metro City', style: 'civic', tier: 'mid', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 6, name: 'Southside', isl: 'Southbank', style: 'southside', tier: 'rough', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: true },
  { id: 7, name: 'Neon Strip', isl: 'Metro City', style: 'nightlife', tier: 'neon', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 8, name: 'Harbor', isl: 'Metro City', style: 'harbor', tier: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 9, name: 'Dry Creek', isl: 'Dry Creek', style: 'rural', tier: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 10, name: 'Sunset Beach', isl: 'Metro City', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 11, name: 'Ironworks', isl: 'Metro City', style: 'factory', tier: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 12, name: 'Greenfield Park', isl: 'Metro City', style: 'park', tier: 'mid', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 13, name: 'Liberty Bay', isl: '', style: 'water', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.WATER, turf: false },
  { id: 14, name: 'Pelican Key', isl: 'Pelican Key', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 15, name: "Smuggler's Rock", isl: "Smuggler's Rock", style: 'rocky', tier: 'rough', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: true },
  { id: 16, name: 'Bayside Heights', isl: 'Metro City', style: 'luxury', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 17, name: 'The Pink Mile', isl: 'Metro City', style: 'redlight', tier: 'red', walk: 'brick', plaza: 'brick', road: 'asphalt_worn', ground: T.PLAZA, turf: false },
  { id: 18, name: 'Old Town', isl: 'Metro City', style: 'oldtown', tier: 'low', walk: 'brick', plaza: 'brick', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 19, name: 'Westward Isle', isl: 'The wild islands', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 20, name: 'Pike Island', isl: 'The wild islands', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 21, name: 'Cedar Isle', isl: 'The wild islands', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 22, name: 'Gull Isles', isl: 'The wild islands', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
];
const WATER_D = 13;
export const WILD_DISTRICTS = new Set([19, 20, 21, 22]);

// Subdivision + fill parameters per style. gen: generic prefab weights.
const STYLE = {
  houses: { minW: 16, minH: 18, gen: { house1: 3, house2: 3, house3: 3, apt2: 0.6, rest2: 0.3 }, filler: 'park', roof: 0.06, roofKinds: ['tile'] },
  commercial: { minW: 12, minH: 12, gen: { conv: 2, rest1: 2, rest2: 2, gas: 1, apt1: 1, club: 0.5, tower2: 1 }, filler: 'parking', roof: 0.5, roofKinds: ['tar', 'gravel'] },
  apartments: { minW: 14, minH: 14, gen: { apt1: 3, apt2: 3, house2: 1, conv: 1, tower2: 1 }, filler: 'park', roof: 0.4, roofKinds: ['tar', 'gravel'] },
  industrial: { minW: 14, minH: 13, gen: { warehouse: 3, industrial: 2, repair: 1 }, filler: 'yard', roof: 0.45, roofKinds: ['metal', 'tar'] },
  factory: { minW: 14, minH: 13, gen: { industrial: 3, warehouse: 2, repair: 1, gas: 0.4 }, filler: 'yard', roof: 0.6, roofKinds: ['metal', 'metal', 'tar'] },
  towers: { minW: 11, minH: 11, gen: { tower1: 3, tower2: 3, apt1: 1, hotel: 1 }, filler: 'plaza', roof: 0.78, roofKinds: ['glass', 'gravel', 'tar'] },
  civic: { minW: 14, minH: 14, gen: { apt1: 1, tower2: 1, house1: 1, conv: 1, rest1: 1, church: 0.3 }, filler: 'park', roof: 0.35, roofKinds: ['gravel', 'tile'] },
  southside: { minW: 14, minH: 14, gen: { house1: 2, house3: 2, warehouse: 1, industrial: 1, apt2: 1, conv: 0.5 }, filler: 'yard', roof: 0.3, roofKinds: ['tar', 'metal'] },
  nightlife: { minW: 12, minH: 12, gen: { club: 3, rest1: 2, rest2: 2, hotel: 1, conv: 1 }, filler: 'plaza', roof: 0.5, roofKinds: ['tar', 'tile', 'gravel'] },
  harbor: { minW: 14, minH: 13, gen: { warehouse: 4, industrial: 1, repair: 1 }, filler: 'yard', roof: 0.55, roofKinds: ['metal', 'tar'] },
  luxury: { minW: 14, minH: 14, gen: { house1: 2, house2: 2, house3: 1, hotel: 1, rest2: 0.6, tower2: 0.5 }, filler: 'park', roof: 0.2, roofKinds: ['tile', 'glass'] },
  redlight: { minW: 12, minH: 12, gen: { club: 3, rest1: 1, conv: 1, hotel: 1, apt2: 1 }, filler: 'parking', roof: 0.45, roofKinds: ['tar', 'tile'] },
  oldtown: { minW: 12, minH: 12, gen: { apt2: 2, house1: 1, house3: 1, conv: 1.5, rest1: 1.5, club: 0.4, repair: 0.6 }, filler: 'yard', roof: 0.5, roofKinds: ['tar', 'tile', 'gravel'] },
  beach: { minW: 14, minH: 14, gen: { house1: 2, house2: 2, rest2: 1.5, rest1: 1, hotel: 0.6, conv: 0.5 }, filler: 'plaza', roof: 0.15, roofKinds: ['tile'] },
  park: { minW: 14, minH: 14, gen: { rest2: 1 }, filler: 'park', roof: 0, roofKinds: ['tile'] },
};

// Every business the game systems rely on, placed in a specific district.
// strip prefabs host one business per storefront door.
const SPECIALS = [
  { d: 5, prefab: 'hospital', biz: ['hospital'], names: ['St. Neon General'] },
  { d: 0, prefab: 'hospital', biz: ['hospital'], names: ['Southbank Medical'] },
  { d: 10, prefab: 'hospital', biz: ['hospital'], names: ['Westside Clinic'] },
  { d: 18, prefab: 'hospital', biz: ['hospital'], names: ['Old Town Infirmary'] },
  { d: 4, prefab: 'police', biz: ['police'], names: ['Metro City PD - HQ'] },
  { d: 0, prefab: 'police', biz: ['police'], names: ['Southbank Precinct'] },
  { d: 4, prefab: 'bank', biz: ['bank'], names: ['First Pixel Bank'] },
  { d: 5, prefab: 'bank', biz: ['courthouse'], names: ['Hall of Justice'] },
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
  { d: 17, prefab: 'club', biz: ['delivery'], names: ['The Pink Pussycat Lounge'] },
  { d: 17, prefab: 'hotel', biz: ['delivery'], names: ['Hourly Hearts Motel'] },
  { d: 18, prefab: 'conv', biz: ['delivery'], names: ['Rusty Anchor Motel'] },
  { d: 16, prefab: 'hotel', biz: ['delivery'], names: ['The Bayside Ritz'] },
];

const GENERIC_NAMES = {
  conv: ['Quick Mart', 'Corner Deli', '24/7 Market', 'Speedy Stop'], rest1: ['Pizza Planet Express', 'Hot Wok', 'Taco Loco', 'Burger Barn'],
  rest2: ['Cafe Retro', 'Noodle House', 'The Brick Oven'], club: ['Club Neon', 'Bass Cave', 'Pink Flamingo'], gas: ['Gas-N-Go', 'Fuel Stop'],
  tower1: ['Office Tower'], tower2: ['Glass Tower'], hotel: ['Hotel'], warehouse: ['Warehouse'], industrial: ['Factory'], repair: ['Auto Repair'],
  apt1: ['Apartments'], apt2: ['Apartments'], house1: ['Residence'], house2: ['Residence'], house3: ['Residence'], church: ['Chapel'],
};

// ---------------------------------------------------------------------------
export class CityMap {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.w = MAP_W; this.h = MAP_H;
    const N = MAP_W * MAP_H;
    this.tiles = new Uint8Array(N);
    this.dist = new Uint8Array(N).fill(WATER_D);
    this.zone = new Uint8Array(N);
    this.river = new Uint8Array(N);       // 1 = river water (fishing, bridges)
    this.reserve = new Uint8Array(N);     // bit flags: 1 highway band, 2 railway, 4 waterfront strip, 8 under a ramp
    this.deck = new Uint8Array(N);        // 1 = under the elevated highway
    this.lvl0Block = new Uint8Array(N);   // 1 = solid at ground level (a ramp's embankment)
    this.roadAxis = new Uint8Array(N);    // bit1 vertical-ish road, bit2 horizontal-ish, 3 = junction box
    this.bld = new Int16Array(N).fill(-1);
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
    this.gates = []; // sliding gates (police motor pools, the Syndicate compound)
    this.venues = []; // mini-game venues: soccer pitch, beach volleyball courts
    this.dropSites = [];
    this.cameras = [];
    this.nodes = [];
    this.edges = [];
    this.lamps = [];
    this.fields = [];
    this.roofs = [];
    this.hospitals = [];
    this.spawns = {};
    this.pillars = [];
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
  zoneAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return Z.SEA;
    return this.zone[ty * MAP_W + tx];
  }
  // Which island / part of the world a point is in (ISLANDS key) or null at sea.
  islandAt(x, y) {
    const z = this.zoneAt(x, y);
    for (const [k, I] of Object.entries(ISLANDS)) if (I.zone === z) return k;
    return null;
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
  // Nearest ground-level junction (the highway deck and its merges excluded unless asked).
  nearestNode(x, y, anyLevel = false) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      if (!anyLevel && n.lvl !== 0) continue;
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

// Swimming: in open water, or under a bridge deck having swum in. Up on the highway deck you
// are never swimming, whatever is below.
export function isSwimming(map, ped) {
  if ((ped.lz || 0) > 0.35) return false;
  const t = map.tileAtPx(ped.x, ped.y);
  return WATER_T[t] === 1 || (t === T.BRIDGE && !!ped.under);
}

// Nearest walkable land to a point (for swimmers heading ashore), ring search in tiles.
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

// Syndicate gang territory: The Yards, Southside and Smuggler's Rock (whole districts).
let turfMap = null;
export function isTurf(x, y) {
  if (!turfMap) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
  return !!DISTRICTS[turfMap[ty * MAP_W + tx]].turf;
}

// Fishing water: 'river', 'deep' sea or 'shore' shallows.
export function waterKind(map, tx, ty) {
  const i = ty * MAP_W + tx;
  if (map.river[i]) return 'river';
  return map.tiles[i] === T.DEEP ? 'deep' : 'shore';
}

// ---------------------------------------------------------------------------
export function generateCity(seed = 1337) {
  const m = new CityMap(seed);
  const rand = mulberry32(seed);
  terrain(m);
  paintDistricts(m);
  turfMap = m.dist;
  const lines = layoutRoads(m, rand);
  const net = buildNetwork(lines, seed);
  m.net = net; m.nodes = net.nodes; m.edges = net.edges; m.roads = net.edges;
  rasterRoads(m);
  const railPts = m.railPts;
  reserveRail(m, railPts);
  waterfrontStrip(m);

  // --- blocks -> rows -> concept-art lots and rooftops ------------------------------------------
  findBlocks(m);
  const rows = [];
  const estateRows = [];
  // the mansion takes the biggest lot in Bayside Heights that opens north onto a street
  const mlot = m.blocks.filter((b) => b.d === 16 && b.w >= MANSION_SIZE[0] + 1 && b.h >= MANSION_SIZE[1] + 1 && facesStreet(m, { x: b.x + Math.floor((b.w - MANSION_SIZE[0]) / 2), y: b.y, w: MANSION_SIZE[0], h: 1 }, 'N')).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (mlot) mlot.mansion = true;
  // Sunset Beach's volleyball court takes a whole block by the sea
  const clot = m.blocks.filter((b) => b.d === 10 && !b.mansion && b.w >= 18 && b.h >= 10).sort((a, b) => m.distSea[(a.y + (a.h >> 1)) * MAP_W + a.x] - m.distSea[(b.y + (b.h >> 1)) * MAP_W + b.x])[0];
  if (clot) clot.court = true;
  for (const b of m.blocks) {
    const st = STYLE[DISTRICTS[b.d].style];
    b.ix = b.x; b.iy = b.y; b.iw = b.w; b.ih = b.h;
    if (b.court) {
      m.fill(b.x, b.y, b.w, b.h, T.SAND);
      volleyCourt(m, 'Sunset Beach Volleyball', b.x + ((b.w - 16) >> 1), b.y + ((b.h - 8) >> 1), 16, 8);
      continue;
    }
    if (b.mansion) {
      m.fill(b.x, b.y, b.w, b.h, T.GRASS);
      // the rest of the block around the walled lot stays garden
      const gr = mulberry32(seed ^ 0x6d61);
      for (let k = 0; k < (b.w * b.h) / 40; k++) { const tx = b.x + 1 + Math.floor(gr() * (b.w - 2)), ty = b.y + 1 + Math.floor(gr() * (b.h - 2)); const mx = b.x + Math.floor((b.w - MANSION_SIZE[0]) / 2); if (tx >= mx - 1 && tx <= mx + MANSION_SIZE[0] && ty <= b.y + MANSION_SIZE[1] + 1) continue; addProp(m, gr() < 0.6 ? 'tree_a' : 'shrub_a', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12); }
      continue;
    }
    if (!st) { m.fill(b.x, b.y, b.w, b.h, DISTRICTS[b.d].ground === T.WATER ? T.GRASS : DISTRICTS[b.d].ground); continue; }
    m.fill(b.x, b.y, b.w, b.h, DISTRICTS[b.d].ground);
    if (b.park) continue;
    const minH = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].th));
    const minW = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].tw));
    const fS = facesStreet(m, b, 'S'), fN = facesStreet(m, b, 'N');
    if (b.h < minH || b.w < minW || (!fS && !fN)) {
      // too small (or nowhere for a door): one solid building or a pocket park / plaza
      const row = { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S' };
      const rr = mulberry32(seed ^ (b.x * 131 + b.y * 7));
      if (st.roof && b.w >= 4 && b.h >= 4 && rr() < (st.roof >= 0.4 ? 0.85 : st.roof * 2)) roofBuilding(m, row, b.x, b.y, b.w, b.h, st, rr);
      else if (!fS && !fN && b.w >= 12 && b.h >= 12 && (b.w > 30 || b.h > 30)) { const half = { ...b }; splitBlock(m, half, st, rr); }
      else filler(m, row, b.x, b.w, st, rr);
      continue;
    }
    if (fS && fN && b.h >= minH * 2 + 1) {
      const hs = Math.ceil(b.h / 2);
      rows.push({ b, d: b.d, x: b.x, y: b.y + b.h - hs, w: b.w, h: hs, face: 'S', iv: [[b.x, b.x + b.w]] });
      rows.push({ b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h - hs, face: 'N', iv: [[b.x, b.x + b.w]] });
    } else {
      rows.push({ b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: fS ? 'S' : 'N', iv: [[b.x, b.x + b.w]] });
    }
  }
  placeSpecials(m, rows, rand);
  claimEstates(m, rows, estateRows, rand);
  for (const row of rows) fillRow(m, row, mulberry32(seed ^ (row.x * 31 + row.y * 977)));
  for (const b of m.blocks) if (b.park) buildPark(m, b, mulberry32(seed ^ (b.x * 13 + b.y)), b.park);
  for (const [type, key, x, y, south] of estateRows) estateHouse(m, rand, type, key, x, y, south);
  m.garages ||= []; m.mansions ||= [];
  if (mlot) mansion(m, rand, mlot.x + Math.floor((mlot.w - MANSION_SIZE[0]) / 2), mlot.y);

  // --- waterfronts, farms, islands, street furniture, traffic graph ------------------------------
  buildWaterfronts(m, rand);
  buildFarm(m, rand);
  buildEstates(m, rand);
  buildWilds(m, rand);
  buildStreetProps(m);
  buildBanking(m);
  buildGangHQs(m);
  buildTackleShops(m);
  buildPaintShops(m);
  buildMotorPools(m);
  buildCornerStores(m);
  buildInteriors(m);
  buildDealerLots(m);
  buildRailway(m, railPts);
  buildOffshore(m, rand);
  aimLamps(m);
  m.levels = buildLevels(m);
  buildCameras(m, rand);

  const hosp = m.pois.find((p) => p.kind === 'hospital' && m.zoneAt(p.x, p.y) === Z.CITY) || m.pois.find((p) => p.kind === 'hospital');
  const pd = m.pois.find((p) => p.kind === 'police');
  m.hospitals = m.pois.filter((p) => p.kind === 'hospital').map((p) => ({ id: p.id, name: p.label, x: p.x, y: p.y + 44 }));
  m.spawns.hospital = { x: hosp.x, y: hosp.y + 44 };
  m.spawns.police = { x: pd.x, y: pd.y + 44 };
  m.spawns.default = m.spawns.hospital;
  return m;
}

// ---------------------------------------------------------------------------
// Terrain: land and sea from the world map, shallows, beaches, wild ground; distances to the
// sea and to the river; which part of the world each tile belongs to.
function decodeLand() {
  const land = new Uint8Array(MAP_W * MAP_H);
  LAND.split('|').forEach((row, y) => {
    if (y >= MAP_H) return;
    let x = 0, v = 0;
    for (const r of row.split(',')) { const n = parseInt(r, 36); if (v) land.fill(1, y * MAP_W + x, y * MAP_W + Math.min(MAP_W, x + n)); x += n; v ^= 1; }
  });
  return land;
}
function decodeTerrain() {
  const cw = Math.floor(MAP_W / TERRAIN_CELL), ch = Math.floor(MAP_H / TERRAIN_CELL);
  const cls = new Uint8Array(cw * ch);
  const code = { w: 0, g: 1, f: 2, d: 3, r: 4, s: 5 };
  TERRAIN.split('|').forEach((row, y) => {
    let x = 0;
    for (const m of row.matchAll(/([a-z])([0-9a-z]+)/g)) { const n = parseInt(m[2], 36); cls.fill(code[m[1]], y * cw + x, y * cw + x + n); x += n; }
  });
  return { cls, cw, ch };
}

// Chamfer distance (in quarter tiles, capped at 255) to the tiles where src is set.
function chamfer(src, cap = 255) {
  const W = MAP_W, H = MAP_H;
  const d = new Uint8Array(W * H).fill(cap);
  for (let i = 0; i < W * H; i++) if (src[i]) d[i] = 0;
  const A = 4, B = 6; // 1 tile, a diagonal (~1.41)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let v = d[i];
    if (x > 0 && d[i - 1] + A < v) v = d[i - 1] + A;
    if (y > 0) {
      if (d[i - W] + A < v) v = d[i - W] + A;
      if (x > 0 && d[i - W - 1] + B < v) v = d[i - W - 1] + B;
      if (x < W - 1 && d[i - W + 1] + B < v) v = d[i - W + 1] + B;
    }
    d[i] = Math.min(cap, v);
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x;
    let v = d[i];
    if (x < W - 1 && d[i + 1] + A < v) v = d[i + 1] + A;
    if (y < H - 1) {
      if (d[i + W] + A < v) v = d[i + W] + A;
      if (x < W - 1 && d[i + W + 1] + B < v) v = d[i + W + 1] + B;
      if (x > 0 && d[i + W - 1] + B < v) v = d[i + W - 1] + B;
    }
    d[i] = Math.min(cap, v);
  }
  return d;
}

function components(land) {
  const W = MAP_W, N = W * MAP_H;
  const lab = new Int32Array(N).fill(-1);
  const comps = [];
  const st = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    if (!land[i] || lab[i] >= 0) continue;
    let sp = 0; st[sp++] = i; lab[i] = comps.length;
    let n = 0, x0 = W, y0 = MAP_H, x1 = 0, y1 = 0;
    while (sp) {
      const j = st[--sp]; n++;
      const x = j % W, y = (j / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && land[j - 1] && lab[j - 1] < 0) { lab[j - 1] = comps.length; st[sp++] = j - 1; }
      if (x < W - 1 && land[j + 1] && lab[j + 1] < 0) { lab[j + 1] = comps.length; st[sp++] = j + 1; }
      if (y > 0 && land[j - W] && lab[j - W] < 0) { lab[j - W] = comps.length; st[sp++] = j - W; }
      if (y < MAP_H - 1 && land[j + W] && lab[j + W] < 0) { lab[j + W] = comps.length; st[sp++] = j + W; }
    }
    comps.push({ n, box: [x0, y0, x1 + 1, y1 + 1] });
  }
  return { lab, comps };
}

function terrain(m) {
  const W = MAP_W, N = W * MAP_H;
  const land = decodeLand();
  m.land = land;
  const { lab, comps } = components(land);
  const compAt = (x, y) => lab[y * W + x];
  const main = compAt(800, 500);
  // the river: the channel of sea that cuts into the central island from the south-west.
  // Trace its centre column by column (water runs between the north city and Southbank).
  const riverMid = new Map();
  let prev = 690;
  for (let x = 772; x <= 1016; x++) {
    let best = null;
    for (let y = 560; y < 760; y++) {
      if (land[y * W + x]) continue;
      let y2 = y; while (y2 < 760 && !land[y2 * W + x]) y2++;
      const mid = (y + y2 - 1) / 2;
      if (y2 - y < 60 && (!best || Math.abs(mid - prev) < Math.abs(best.mid - prev))) best = { y0: y, y1: y2 - 1, mid };
      y = y2;
    }
    if (!best) continue;
    prev = best.mid;
    riverMid.set(x, best.mid);
    for (let y = best.y0; y <= best.y1; y++) m.river[y * W + x] = 1;
  }
  const yRiver = (x) => {
    if (x < 772) return Infinity;
    if (x > 1016) return 600;
    for (let k = 0; k < 12; k++) { if (riverMid.has(x - k)) return riverMid.get(x - k); if (riverMid.has(x + k)) return riverMid.get(x + k); }
    return 690;
  };
  m.yRiver = yRiver;
  // zones
  const keyComp = compAt(600, 360), rockComp = compAt(1230, 978);
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const c = lab[i], x = i % W, y = (i / W) | 0;
    if (c === main) m.zone[i] = x >= 1045 ? Z.EAST : y < yRiver(x) ? Z.CITY : Z.SOUTH;
    else if (c === keyComp) m.zone[i] = Z.KEY;
    else if (c === rockComp) m.zone[i] = Z.ROCK;
    else m.zone[i] = Z.WILD;
  }
  // island boxes for the tour and the map
  const box = {};
  for (let y = 0; y < MAP_H; y += 2) for (let x = 0; x < W; x += 2) {
    const z = m.zone[y * W + x];
    if (!z) continue;
    const b = box[z] ||= [W, MAP_H, 0, 0];
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x + 2 > b[2]) b[2] = x + 2; if (y + 2 > b[3]) b[3] = y + 2;
  }
  for (const I of Object.values(ISLANDS)) if (box[I.zone]) I.box = box[I.zone];
  // distances to the sea and to the river (quarter tiles)
  const sea = new Uint8Array(N), riv = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (!land[i]) { if (m.river[i]) riv[i] = 1; else sea[i] = 1; }
  m.distSea = chamfer(sea);
  m.distRiver = chamfer(riv);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = land[i] ? 0 : 1;
  const toLand = chamfer(land, 40);
  // tiles: deep sea, shallows near land, land by its wild terrain (the city paints over it)
  const { cls, cw } = decodeTerrain();
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (!land[i]) { m.tiles[i] = toLand[i] <= 12 || m.river[i] ? T.WATER : T.DEEP; continue; }
    const c = cls[Math.min(cls.length - 1, ((y / TERRAIN_CELL) | 0) * cw + ((x / TERRAIN_CELL) | 0))];
    const nearSea = m.distSea[i] <= 10;
    const z = m.zone[i];
    if (z === Z.CITY || z === Z.SOUTH) { m.tiles[i] = T.GRASS; continue; }
    if (nearSea && (z !== Z.EAST || c !== 4)) { m.tiles[i] = T.SAND; continue; }
    m.tiles[i] = c === 3 ? (hash2(x >> 2, y >> 2, 5) < 0.3 ? T.SAND : T.DIRT) : c === 4 ? T.DIRT : T.GRASS;
  }
  m.terrainCls = { cls, cw };
  // districts outside the city: farm country, the wild islands, the two boat islands
  for (let i = 0; i < N; i++) {
    const z = m.zone[i];
    if (z === Z.EAST) m.dist[i] = 9;
    else if (z === Z.KEY) m.dist[i] = 14;
    else if (z === Z.ROCK) m.dist[i] = 15;
    else if (z === Z.WILD) m.dist[i] = 22;
  }
  for (const wi of WILD_ISLES) {
    const c = compAt(wi.at[0], wi.at[1]);
    if (c < 0) continue;
    const [x0, y0, x1, y1] = comps[c].box;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (lab[y * W + x] === c) m.dist[y * W + x] = wi.d;
  }
  m.comps = comps; m.compLab = lab;
}

// Districts inside the city and Southbank: nearest seed in the same zone, borders wobbled with a
// little noise so they don't run along straight lines; the park is a hard rectangle.
function paintDistricts(m) {
  const W = MAP_W;
  const seeds = SEEDS.map(([d, x, y]) => ({ d, x, y, z: m.zone[y * W + x] }));
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const z = m.zone[i];
    if (z !== Z.CITY && z !== Z.SOUTH) continue;
    if (x >= PARK.x0 + 3 && x < PARK.x1 - 3 && y >= PARK.y0 + 3 && y < PARK.y1 - 3) { m.dist[i] = 12; continue; }
    const wx = x + 7 * Math.sin(y / 17.3) + 4 * Math.sin((x + y) / 9.1), wy = y + 7 * Math.sin(x / 15.7) + 4 * Math.cos((x - y) / 8.3);
    let best = null, bd = Infinity;
    for (const s of seeds) {
      if (s.z !== z) continue;
      const d = (s.x - wx) ** 2 + (s.y - wy) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    if (best) m.dist[i] = best.d;
  }
}

// ---------------------------------------------------------------------------
// Road lines (px) for the network builder.
function layoutRoads(m, rand) {
  const W = MAP_W;
  const lines = [];
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= MAP_H ? -1 : Math.floor(y) * W + Math.floor(x));
  const isLand = (x, y) => { const i = at(x, y); return i >= 0 && !!m.land[i]; };
  const zoneOf = (x, y) => { const i = at(x, y); return i < 0 ? 0 : m.zone[i]; };
  const distOf = (x, y) => { const i = at(x, y); return i < 0 ? WATER_D : m.dist[i]; };
  const seaD = (x, y) => { const i = at(x, y); return i < 0 ? 0 : m.distSea[i] / 4; };
  const rivD = (x, y) => { const i = at(x, y); return i < 0 ? 0 : m.distRiver[i] / 4; };
  const inPark = (x, y) => x > PARK.x0 + 2 && x < PARK.x1 - 2 && y > PARK.y0 + 2 && y < PARK.y1 - 2;

  // ring highway, its distance field and the frontage roads
  const ring = ringLine();
  m.ring = ring;
  // distance to the ring (tiles) and which way it runs there (1 east-west, 2 north-south)
  const core = new Uint8Array(W * MAP_H);
  stampLine(ring, 20, (tx, ty) => { const i = at(tx, ty); if (i >= 0) core[i] = 1; });
  const cd = chamfer(core);
  const ringD = new Uint8Array(W * MAP_H).fill(255);
  const ringH = new Uint8Array(W * MAP_H);
  for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    const i = ty * W + tx;
    if (cd[i] >= 255) continue;
    ringD[i] = Math.round(cd[i] / 4);
    ringH[i] = Math.abs(cd[i + W] - cd[i - W]) >= Math.abs(cd[i + 1] - cd[i - 1]) ? 1 : 2;
  }
  m.ringD = ringD;
  m.railPts = railLine(m);
  const rD = (x, y) => { const i = at(x, y); return i < 0 ? 255 : ringD[i]; };
  lines.push({ pts: ring, kind: 'hwy', lvl: 1, name: 'Metro Ring' });
  const inner = offsetLoop(ring, BAND * TILE);
  const outer = offsetLoop(ring, -BAND * TILE).reverse();
  const frontOk = (x, y) => isLand(x, y) && (zoneOf(x, y) === Z.CITY) && !m.river[at(x, y)];
  const innerPieces = clipLine(inner, frontOk, 10 * TILE);
  const outerPieces = clipLine(outer, (x, y) => frontOk(x, y) && seaD(x, y) >= 3, 10 * TILE);
  for (const p of innerPieces) lines.push({ pts: p, kind: 'front', lvl: 0, name: 'Ring Road (inner)' });
  for (const p of outerPieces) lines.push({ pts: p, kind: 'front', lvl: 0, name: 'Ring Road (outer)' });

  // street grid
  const gridLines = [];
  const okGrid = (vertical, c, ave) => (x, y) => {
    const i = at(x, y);
    if (i < 0) return false;
    if (!m.land[i]) return vertical && RIVER_BRIDGES.has(c) && !!m.river[i];
    const z = m.zone[i];
    if (z !== Z.CITY && z !== Z.SOUTH) return false;
    if (m.distSea[i] < 8 * 4) return false;
    if (m.distRiver[i] < 6 * 4 && !(vertical && RIVER_BRIDGES.has(c))) return false;
    if (inPark(x, y)) return false;
    const rd = ringD[i];
    if (rd < BAND - 1 && !ave) return false;
    // never run alongside the highway close to it (the frontage road already does)
    if (rd < BAND + 13 && ringH[i] === (vertical ? 2 : 1)) return false;
    const d = m.dist[i];
    if (z === Z.SOUTH) {
      if (vertical && RIVER_BRIDGES.has(c)) return true;
      return d === 6; // Southside keeps a grid; Pine Hills winds
    }
    if (!ave && d === 16) return false; // Bayside Heights: crescents instead
    return true;
  };
  for (const x of GRID_X) {
    const ave = AVE_X.has(x);
    for (const pts of clipLine([{ x: x * TILE, y: 200 * TILE }, { x: x * TILE, y: 900 * TILE }], okGrid(true, x, ave), 8 * TILE)) {
      gridLines.push({ pts, kind: ave ? 'ave' : 'st', lvl: 0, name: `${ave ? 'Avenue' : 'Street'} ${x}` , vx: x });
    }
  }
  for (const y of GRID_Y) {
    const ave = AVE_Y.has(y);
    for (const pts of clipLine([{ x: 520 * TILE, y: y * TILE }, { x: 1060 * TILE, y: y * TILE }], okGrid(false, y, ave), 8 * TILE)) {
      gridLines.push({ pts, kind: ave ? 'ave' : 'st', lvl: 0, name: `${ave ? 'Avenue' : 'Street'} ${y}`, hy: y });
    }
  }
  lines.push(...gridLines);
  // Broadway: the diagonal through the core, between the inner frontage at both ends
  const bw = clipLine(BROADWAY.map(([x, y]) => ({ x: x * TILE, y: y * TILE })), (x, y) => isLand(x, y) && rD(x, y) >= BAND - 1 && zoneOf(x, y) === Z.CITY && !inPark(x, y), 8 * TILE, 8);
  for (const p of bw) lines.push({ pts: p, kind: 'blvd', lvl: 0, name: 'Broadway' });
  // Bayside Heights: two crescents round a green, spokes out to the avenues
  for (const r of CRESCENT.r) {
    const circ = [];
    for (let k = 0; k <= 72; k++) { const a = (k / 72) * Math.PI * 2; circ.push({ x: (CRESCENT.x + Math.cos(a) * r) * TILE, y: (CRESCENT.y + Math.sin(a) * r) * TILE }); }
    for (const p of clipLine(circ, (x, y) => isLand(x, y) && rD(x, y) >= BAND - 1 && zoneOf(x, y) === Z.CITY && seaD(x, y) >= 8, 10 * TILE, 12)) lines.push({ pts: p, kind: 'drive', lvl: 0, name: 'Bayside Crescent' });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const r0 = CRESCENT.r[0], r1 = CRESCENT.r[1] + 10;
    const sp = [{ x: (CRESCENT.x + Math.cos(a) * r0) * TILE, y: (CRESCENT.y + Math.sin(a) * r0) * TILE }, { x: (CRESCENT.x + Math.cos(a) * r1) * TILE, y: (CRESCENT.y + Math.sin(a) * r1) * TILE }];
    for (const p of clipLine(sp, (x, y) => isLand(x, y) && rD(x, y) >= BAND - 1 && zoneOf(x, y) === Z.CITY && seaD(x, y) >= 8, 6 * TILE, 8)) lines.push({ pts: p, kind: 'st', lvl: 0, name: 'Bayside Walk' });
  }
  // coast drives (around the city and Southbank, away from the ring) and river drives
  const coastOk = (x, y) => { const z = zoneOf(x, y); return (z === Z.CITY || z === Z.SOUTH) && rD(x, y) >= BAND + 1 && !inPark(x, y); };
  for (const c of contours(m.distSea, W, MAP_H, 9 * 4, (x, y) => { const z = m.zone[y * W + x]; return z === Z.CITY || z === Z.SOUTH; }, 540, 220, 1060, 920)) {
    for (const p of clipLine(smoothLine(c, 40), coastOk, 14 * TILE, 12)) lines.push({ pts: p, kind: 'drive', lvl: 0, name: 'Coast Drive' });
  }
  for (const c of contours(m.distRiver, W, MAP_H, 8 * 4, (x, y) => { const z = m.zone[y * W + x]; return (z === Z.CITY || z === Z.SOUTH) && m.distSea[y * W + x] > 10 * 4; }, 700, 540, 1060, 800)) {
    for (const p of clipLine(smoothLine(c, 40), coastOk, 14 * TILE, 12)) lines.push({ pts: p, kind: 'drive', lvl: 0, name: 'Riverside Drive' });
  }
  // Pine Hills: winding collectors with cul-de-sacs off them
  const phOk = (x, y) => isLand(x, y) && zoneOf(x, y) === Z.SOUTH && distOf(x, y) !== 6 && seaD(x, y) >= 8 && rivD(x, y) >= 7;
  const collectors = [
    cubic({ x: 790, y: 735 }, { x: 830, y: 690 }, { x: 880, y: 790 }, { x: 935, y: 715 }, 24),
    cubic({ x: 795, y: 790 }, { x: 850, y: 830 }, { x: 870, y: 740 }, { x: 932, y: 780 }, 24),
    cubic({ x: 845, y: 700 }, { x: 860, y: 740 }, { x: 830, y: 770 }, { x: 850, y: 815 }, 18),
  ].map((c) => c.map((p) => ({ x: p.x * TILE, y: p.y * TILE })));
  for (const c of collectors) {
    for (const p of clipLine(c, phOk, 12 * TILE, 12)) {
      lines.push({ pts: p, kind: 'drive', lvl: 0, name: 'Pine Hills Drive' });
      // cul-de-sacs every ~26 tiles, alternating sides
      const L = measure(p);
      let side = 1;
      for (let s = 12 * TILE; s < L - 10 * TILE; s += 26 * TILE) {
        const q = pointAt(p, s);
        const nx = -q.ty * side, ny = q.tx * side;
        side = -side;
        const len = (14 + rand() * 8) * TILE;
        const bend = (rand() - 0.5) * 0.6;
        const c2 = { x: q.x + nx * len * 0.6 + q.tx * len * bend, y: q.y + ny * len * 0.6 + q.ty * len * bend };
        const end = { x: q.x + nx * len, y: q.y + ny * len };
        const sac = quad({ x: q.x, y: q.y }, c2, end, 10);
        // stop short of anything else (it must stay a dead end)
        const ok = (x, y) => phOk(x, y) && (Math.hypot(x * TILE - q.x, y * TILE - q.y) < 4 * TILE || !nearLine(lines, x * TILE, y * TILE, 9 * TILE, p));
        const piece = clipLine(sac, ok, 8 * TILE, 12)[0];
        if (piece && Math.hypot(piece[0].x - q.x, piece[0].y - q.y) < 2 * TILE) lines.push({ pts: piece, kind: 'minor', lvl: 0, name: 'Court', culdesac: true });
      }
    }
  }

  // highway slip ramps: diamond-free "Texas" style onto the one-way frontage roads
  const crossS = [];
  for (const g of gridLines.filter((q) => q.kind === 'ave')) {
    for (let k = 0; k + 1 < g.pts.length; k++) {
      for (let j = 0; j + 1 < ring.length; j++) {
        const a = g.pts[k], b = g.pts[k + 1], c = ring[j], d = ring[j + 1];
        const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(den) < 1e-9) continue;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
        const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) crossS.push(c.s + (d.s - c.s) * u);
      }
    }
  }
  m.ringCross = crossS;
  const keep = crossS.concat(m.railRingCross || []);
  const sites = rampSites(ring, crossS, keep);
  m.ramps = [];
  for (const s of sites) {
    for (const dir of [1, -1]) {
      const front = dir > 0 ? innerPieces : outerPieces;
      if (!front.length) continue;
      for (const off of [true, false]) {
        const r = slipRamp(ring, front, s, dir, off);
        if (!r) continue;
        // the ground end must land on a frontage road on land, and the low half of the ramp
        // (an embankment) can't stand in the water
        const g = off ? r.pts[r.pts.length - 1] : r.pts[0];
        if (!isLand(g.x / TILE, g.y / TILE)) continue;
        const low = off ? r.pts.slice(Math.floor(r.pts.length / 2)) : r.pts.slice(0, Math.ceil(r.pts.length / 2));
        if (low.some((q) => !isLand(q.x / TILE, q.y / TILE) || !isLand(q.x / TILE + 2, q.y / TILE) || !isLand(q.x / TILE - 2, q.y / TILE))) continue;
        lines.push({ pts: r.pts, kind: 'ramp', lvl: 'ramp', z0: r.z0, z1: r.z1, name: off ? 'Exit ramp' : 'On-ramp' });
        m.ramps.push({ s, dir, off });
      }
    }
  }

  // bridges out to the wild islands (ground level, over the water) and roads into the farms
  const extend = (match, dx, dy, name) => {
    const g = gridLines.find(match);
    if (!g) return;
    const end = dx + dy > 0 ? g.pts[g.pts.length - 1] : g.pts[0];
    const ex = end.x / TILE, ey = end.y / TILE;
    const w = acrossWater((x, y) => isLand(x, y), ex, ey, dx, dy, 300);
    if (!w) return;
    const far = { x: (w.x + dx * 4) * TILE, y: (w.y + dy * 4) * TILE };
    lines.push({ pts: [{ x: end.x, y: end.y }, far], kind: g.kind, lvl: 0, name });
    // a country road on into the island
    const into = [far, { x: far.x + dx * 30 * TILE + dy * 12 * TILE, y: far.y + dy * 30 * TILE + dx * 12 * TILE }, { x: far.x + dx * 60 * TILE - dy * 6 * TILE, y: far.y + dy * 60 * TILE - dx * 6 * TILE }];
    for (const p of clipLine(into, (x, y) => isLand(x, y) && zoneOf(x, y) === Z.WILD, 10 * TILE, 12).slice(0, 1)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: `${name} Road` });
  };
  extend((q) => q.hy === 556 && q.pts[0].x < 640 * TILE, -1, 0, 'Westward Bridge');
  extend((q) => q.vx === 958 && q.pts[0].y < 380 * TILE, 0, -1, 'Pike Island Bridge');
  extend((q) => q.vx === 868 && q.pts[q.pts.length - 1].y > 760 * TILE, 0, 1, 'Cedar Isle Bridge');
  // Dry Creek: the county road east, the farm road north-south, back into Southside
  const ruralOk = (x, y) => isLand(x, y) && seaD(x, y) >= 6;
  const county = [{ x: 1036 * TILE, y: 528 * TILE }, { x: 1140 * TILE, y: 528 * TILE }, { x: 1200 * TILE, y: 514 * TILE }];
  for (const p of clipLine(county, ruralOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'County Road' });
  const farmRd = [{ x: 1140 * TILE, y: 452 * TILE }, { x: 1140 * TILE, y: 690 * TILE }, { x: 1110 * TILE, y: 730 * TILE }, { x: 1040 * TILE, y: 734 * TILE }];
  for (const p of clipLine(rounded(farmRd, 18 * TILE), ruralOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Farm Road' });
  void rand;
  return lines;
}

function nearLine(lines, x, y, r, except) {
  for (const l of lines) {
    if (l.pts === except || l.lvl === 1 || l.lvl === 'ramp') continue;
    const p0 = l.pts[0];
    if (l.pts.length === 2 && Math.abs(p0.x - x) > 20000 && Math.abs(l.pts[1].x - x) > 20000) continue;
    for (let k = 0; k + 1 < l.pts.length; k++) {
      const a = l.pts[k], b = l.pts[k + 1];
      if (Math.min(a.x, b.x) - r > x || Math.max(a.x, b.x) + r < x || Math.min(a.y, b.y) - r > y || Math.max(a.y, b.y) + r < y) continue;
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
      if (Math.hypot(a.x + dx * t - x, a.y + dy * t - y) < r) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tiles from the road network: asphalt (bridge decks over water), sidewalks along city roads,
// the strip under and beside the elevated highway, ramp embankments, pillars.
const CITY_KINDS = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front']);
function rasterRoads(m) {
  const W = MAP_W;
  const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= MAP_H ? -1 : ty * W + tx);
  const isWet = (t) => t === T.WATER || t === T.DEEP;
  const ground = m.edges.filter((e) => e.lvl === 0);
  // sidewalks first (roads win where they overlap)
  for (const e of ground) {
    if (!CITY_KINDS.has(e.kind)) continue;
    stampEdge(e, e.hw + 2 * TILE + 4, (tx, ty, d) => {
      const i = at(tx, ty);
      if (i < 0 || d <= e.hw) return;
      const t = m.tiles[i];
      if (isWet(t) || t === T.ROAD || t === T.BRIDGE) return;
      m.tiles[i] = T.SIDEWALK;
    });
  }
  for (const e of ground) {
    stampEdge(e, e.hw, (tx, ty, d, horiz) => {
      const i = at(tx, ty);
      if (i < 0) return;
      const t = m.tiles[i];
      if (isWet(t) || t === T.BRIDGE) { m.tiles[i] = T.BRIDGE; e.bridge = true; } else m.tiles[i] = T.ROAD;
      m.roadAxis[i] |= horiz ? 2 : 1;
      m.reserve[i] &= ~1;
    });
    if (e.kind === 'rural') stampEdge(e, e.hw + 20, (tx, ty, d) => { const i = at(tx, ty); if (i >= 0 && d > e.hw && m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; });
  }
  // cul-de-sac bulbs at dead ends
  for (const n of m.nodes) {
    if (n.lvl !== 0 || n.edges.length !== 1) continue;
    const e = m.edges[n.edges[0]];
    if (e.kind !== 'minor') continue;
    const cx = n.x / TILE, cy = n.y / TILE;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const i = at(Math.floor(cx + dx), Math.floor(cy + dy));
      if (i < 0 || !m.land[i]) continue;
      const d = Math.hypot(dx, dy);
      if (d <= 3.6) m.tiles[i] = T.ROAD;
      else if (d <= 5.6 && m.tiles[i] !== T.ROAD) m.tiles[i] = T.SIDEWALK;
    }
    n.culdesac = true;
  }
  // junction boxes (no lane markings across them)
  for (const n of m.nodes) {
    if (n.lvl !== 0 || n.edges.length < 3) continue;
    const r = Math.min(n.half, 10 * TILE);
    for (let ty = Math.floor((n.y - r) / TILE); ty <= Math.floor((n.y + r) / TILE); ty++) for (let tx = Math.floor((n.x - r) / TILE); tx <= Math.floor((n.x + r) / TILE); tx++) {
      const i = at(tx, ty);
      if (i >= 0 && (m.tiles[i] === T.ROAD || m.tiles[i] === T.BRIDGE) && Math.hypot((tx + 0.5) * TILE - n.x, (ty + 0.5) * TILE - n.y) < r) m.roadAxis[i] = 3;
    }
  }
  // the highway band: everything between the two frontage roads is kept clear of buildings
  for (let i = 0; i < W * MAP_H; i++) {
    if (!m.ringD || m.ringD[i] > BAND - 3 || !m.land[i]) continue;
    const t = m.tiles[i];
    if (t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK) continue;
    m.reserve[i] |= 1;
    m.tiles[i] = m.ringD[i] <= 8 ? T.LOT : T.GRASS;
  }
  // under the deck (and its ramps' upper reaches): no walls through it, pillars to hold it up
  for (const e of m.edges) {
    if (e.lvl === 1) {
      stampEdge(e, e.hw + 6, (tx, ty) => { const i = at(tx, ty); if (i >= 0) m.deck[i] = 1; });
      for (let s = 3 * TILE; s < e.len; s += 7 * TILE) {
        const q = pointAt(e.pts, s);
        for (const o of [-(e.hw - 16), 0, e.hw - 16]) { // near the edges, so they show under the deck
          const x = q.x - q.ty * o, y = q.y + q.tx * o;
          const t = m.tileAtPx(x, y);
          if (t === T.ROAD || t === T.BRIDGE || t === T.SIDEWALK) continue;
          const p = m.addSolidProp(x, y, 11);
          p.pillar = true;
          m.pillars.push({ x, y, wet: t === T.WATER || t === T.DEEP });
        }
      }
    } else if (e.lvl === 'ramp') {
      stampEdge(e, e.hw + 4, (tx, ty, d, horiz, s) => {
        const i = at(tx, ty);
        if (i < 0) return;
        const z = edgeZ(e, e.a, s);
        if (z <= 0.4) {
          if (d > e.hw) return;
          m.tiles[i] = m.land[i] ? T.ROAD : T.BRIDGE;
          m.roadAxis[i] |= horiz ? 2 : 1;
          return;
        }
        m.deck[i] = 1;
        if (m.land[i] && m.tiles[i] !== T.ROAD && m.tiles[i] !== T.BRIDGE) { m.lvl0Block[i] = 1; m.reserve[i] |= 8; if (m.tiles[i] !== T.SIDEWALK) m.tiles[i] = T.GRASS; }
      });
    }
  }
}

// Keep the land along every shore free for promenades, beaches and quays.
function waterfrontStrip(m) {
  const W = MAP_W;
  for (let i = 0; i < W * MAP_H; i++) {
    const z = m.zone[i];
    if (z !== Z.CITY && z !== Z.SOUTH) continue;
    if (!m.land[i] || m.reserve[i]) continue;
    const t = m.tiles[i];
    if (t !== T.GRASS) continue;
    const ds = m.distSea[i] / 4, dr = m.distRiver[i] / 4;
    if (ds > 5.5 && dr > 4.5) continue;
    m.reserve[i] |= 4;
    const st = DISTRICTS[m.dist[i]].style;
    if (dr <= 4.5 && ds > 5.5) m.tiles[i] = dr <= 1.2 ? T.PLAZA : (st === 'houses' || st === 'park' || st === 'luxury' ? T.GRASS : T.PLAZA);
    else if (st === 'beach') m.tiles[i] = T.SAND;
    else if (st === 'harbor' || st === 'industrial' || st === 'factory') m.tiles[i] = T.LOT;
    else if (st === 'houses' || st === 'southside') m.tiles[i] = ds <= 2.5 ? T.SAND : T.GRASS;
    else m.tiles[i] = T.PLAZA;
  }
}

// Building land: what's left between the streets, cut into rectangles (biggest first). Irregular
// corners left over become pocket parks, plazas or yards.
function findBlocks(m) {
  const W = MAP_W;
  const free = new Uint8Array(W * MAP_H);
  for (let i = 0; i < W * MAP_H; i++) {
    const z = m.zone[i];
    if ((z === Z.CITY || z === Z.SOUTH) && m.tiles[i] === T.GRASS && !m.reserve[i]) free[i] = 1;
  }
  const lab = new Int32Array(W * MAP_H).fill(-1);
  const st = new Int32Array(W * MAP_H);
  let nreg = 0;
  m.leftover = [];
  for (let i0 = 0; i0 < W * MAP_H; i0++) {
    if (!free[i0] || lab[i0] >= 0) continue;
    let sp = 0; st[sp++] = i0; lab[i0] = nreg;
    let x0 = W, y0 = MAP_H, x1 = 0, y1 = 0, n = 0;
    while (sp) {
      const j = st[--sp]; n++;
      const x = j % W, y = (j / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const k of [j - 1, j + 1, j - W, j + W]) if (k >= 0 && k < W * MAP_H && free[k] && lab[k] < 0 && Math.abs((k % W) - x) <= 1) { lab[k] = nreg; st[sp++] = k; }
    }
    // biggest rectangles first (histogram method), down to a minimum lot
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const hgt = new Int32Array(bw);
    for (let guard = 0; guard < 40; guard++) {
      let best = null;
      hgt.fill(0);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) { const i = y * W + x; hgt[x - x0] = free[i] && lab[i] === nreg ? hgt[x - x0] + 1 : 0; }
        const stack = [];
        for (let k = 0; k <= bw; k++) {
          const h = k < bw ? hgt[k] : 0;
          let start = k;
          while (stack.length && stack[stack.length - 1][1] >= h) {
            const [sk, sh] = stack.pop();
            const w = k - sk;
            const area = sh * w;
            if (sh >= 5 && w >= 5 && (!best || area > best.area)) best = { x: x0 + sk, y: y - sh + 1, w, h: sh, area };
            start = sk;
          }
          stack.push([start, h]);
        }
      }
      if (!best || best.area < 36) break;
      for (let y = best.y; y < best.y + best.h; y++) for (let x = best.x; x < best.x + best.w; x++) free[y * W + x] = 0;
      const d = m.dist[(best.y + (best.h >> 1)) * W + best.x + (best.w >> 1)];
      const blk = { x: best.x, y: best.y, w: best.w, h: best.h, d };
      if (d === 12 && best.w >= 30 && best.h >= 30 && !m.blocks.some((q) => q.park)) blk.park = { label: PARK.label, pond: true, pitch: true };
      m.blocks.push(blk);
    }
    nreg++;
  }
  // leftover scraps: greenery or paving by district
  for (let i = 0; i < W * MAP_H; i++) {
    if (!free[i]) continue;
    const x = i % W, y = (i / W) | 0;
    const stl = DISTRICTS[m.dist[i]].style;
    m.tiles[i] = stl === 'towers' || stl === 'nightlife' || stl === 'redlight' || stl === 'commercial' ? T.PLAZA : stl === 'industrial' || stl === 'harbor' || stl === 'factory' ? T.LOT : T.GRASS;
    m.leftover.push(i);
    void x; void y;
  }
}

// A block side "faces a street" when the tiles just outside it are mostly pavement or road.
function facesStreet(m, b, face) {
  const y = face === 'S' ? b.y + b.h : b.y - 1;
  let ok = 0;
  for (let x = b.x; x < b.x + b.w; x++) {
    const t = m.tileAt(x, y), t2 = m.tileAt(x, face === 'S' ? y + 1 : y - 1);
    if (t === T.SIDEWALK || t === T.ROAD || t === T.PLAZA || t2 === T.ROAD) ok++;
  }
  return ok >= b.w * 0.35;
}

// A big block with no street on its north or south side (between curving roads): a courtyard
// of greenery or paving with low buildings round it.
function splitBlock(m, b, st, rand) {
  const row = { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S' };
  filler(m, row, b.x, b.w, { ...st, roof: 0 }, rand);
  if (st.roof) {
    const w = Math.min(10, Math.floor(b.w / 3)), h = Math.min(10, Math.floor(b.h / 3));
    if (w >= 4 && h >= 4) {
      roofBuilding(m, { d: b.d }, b.x + 1, b.y + 1, w, h, st, rand);
      roofBuilding(m, { d: b.d }, b.x + b.w - w - 1, b.y + b.h - h - 1, w, h, st, rand);
    }
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
    for (const pass of [0, 1, 2, 3]) {
      for (const row of rows) {
        if (pass <= 1 && row.d !== sp.d) continue;
        if (pass === 2 && m.zoneAt(row.x * TILE, row.y * TILE) !== m.zoneAt(...seedOf(sp.d))) continue;
        if (row.face !== 'S' && pass !== 1) continue;
        for (let k = 0; k < row.iv.length; k++) if (rowFits(row, sp.prefab, row.iv[k])) cands.push([row, k]);
      }
      if (cands.length) break;
    }
    if (!cands.length) throw new Error(`city generator: no room for ${sp.prefab} (${sp.names[0]})`);
    // prefer lots near the heart of the district
    const [sx, sy] = seedOf(sp.d);
    cands.sort((a, b) => Math.hypot(a[0].x * TILE - sx, a[0].y * TILE - sy) - Math.hypot(b[0].x * TILE - sx, b[0].y * TILE - sy));
    const [row, k] = cands[Math.floor(rand() * Math.min(cands.length, 4))];
    const iv = row.iv[k];
    const pf = PREFABS[sp.prefab];
    const slack = iv[1] - iv[0] - pf.tw;
    const x = iv[0] + (rand() < 0.5 ? 0 : slack);
    placePrefab(m, row, sp.prefab, x, sp, rand);
    row.iv.splice(k, 1, [iv[0], x], [x + pf.tw, iv[1]]);
    row.iv = row.iv.filter((v) => v[1] - v[0] > 0);
  }
}
function seedOf(d) {
  const s = SEEDS.filter((q) => q[0] === d);
  if (!s.length) return [800 * TILE, 500 * TILE];
  return [s.reduce((a, q) => a + q[1], 0) / s.length * TILE, s.reduce((a, q) => a + q[2], 0) / s.length * TILE];
}

// Estates inside the city: beach houses on Sunset Beach's rows (a house plus its garage).
function claimEstates(m, rows, out, rand) {
  const want = [['beach', 'house2'], ['beach', 'house1'], ['beach', 'house3']];
  const used = [];
  for (const [type, key] of want) {
    const pf = PREFABS[key];
    const need = pf.tw + 4;
    const cands = [];
    for (const row of rows) {
      if (row.d !== 10 || row.h < pf.th) continue;
      for (let k = 0; k < row.iv.length; k++) if (row.iv[k][1] - row.iv[k][0] >= need) cands.push([row, k]);
    }
    const ok = cands.filter(([row]) => used.every((q) => Math.hypot(q.x - row.x, q.y - row.y) > 30));
    const pick = (ok.length ? ok : cands)[Math.floor(rand() * Math.max(1, (ok.length ? ok : cands).length))];
    if (!pick) continue;
    const [row, k] = pick;
    const iv = row.iv[k];
    const x = iv[0];
    const y = row.face === 'S' ? row.y + row.h - pf.th : row.y;
    out.push([type, key, x, y, row.face === 'S', row.d]);
    used.push({ x: row.x, y: row.y });
    row.iv.splice(k, 1, [x + need, iv[1]]);
    row.iv = row.iv.filter((v) => v[1] - v[0] > 0);
  }
}

// Fill a row with the district's buildings. Near a border the neighbour's style creeps in, so
// wealth tiers blend into each other instead of changing at a line.
function fillRow(m, row, rand) {
  let st = STYLE[DISTRICTS[row.d].style];
  const near = [];
  for (const [dx, dy] of [[-14, 0], [14 + row.w, 0], [row.w / 2, -12], [row.w / 2, row.h + 12], [-10, row.h / 2], [row.w + 10, row.h / 2]]) {
    const d = m.dist[Math.max(0, Math.min(MAP_H - 1, Math.floor(row.y + dy))) * MAP_W + Math.max(0, Math.min(MAP_W - 1, Math.floor(row.x + dx)))];
    if (d !== row.d && STYLE[DISTRICTS[d].style] && DISTRICTS[d].style !== 'park') near.push(STYLE[DISTRICTS[d].style]);
  }
  for (const [a, b] of row.iv) {
    let x = a;
    while (x < b) {
      const rem = b - x;
      const sty = near.length && rand() < 0.3 ? near[Math.floor(rand() * near.length)] : st;
      if (rem >= 6 && rand() < 0.12) { const gw = Math.min(rem, 4 + Math.floor(rand() * 4)); filler(m, row, x, gw, sty, rand); x += gw; continue; }
      const keys = Object.keys(sty.gen);
      const fits = keys.filter((k) => rowFits(row, k, [x, b]));
      if (!fits.length) { filler(m, row, x, rem, st, rand); break; }
      let tot = 0;
      for (const k of fits) tot += sty.gen[k];
      let r = rand() * tot, pick = fits[0];
      for (const k of fits) { r -= sty.gen[k]; if (r <= 0) { pick = k; break; } }
      placePrefab(m, row, pick, x, null, rand);
      x += PREFABS[pick].tw;
    }
  }
  void st;
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
    const price = apt ? (dist.tier === 'lux' ? 30000 : dist.tier === 'low' || dist.tier === 'rough' ? 11000 : 15000) : (dist.turf ? 12000 : dist.tier === 'lux' ? 60000 : 25000);
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

// Bank branches (one per part of the world that lacks one) and street ATMs (up to two per
// district), made from existing storefronts so the city layout doesn't move.
function buildBanking(m) {
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const walk = (x, y) => { const t = m.tileAtPx(x, y); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.GRASS; };
  const addAtm = (x, y) => { m.props.push({ t: 'atm', x, y: y - 14 }); m.pois.push({ id: m.pois.length, kind: 'atm', label: 'ATM', x, y, r: 36 }); };
  const shops = () => m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined);
  // a branch in each part of the world, and in the outlying neighbourhoods of the big city
  const areas = Object.values(ISLANDS).filter((I) => !I.boatOnly).map((I) => ({ name: I.name, box: I.box, inside: (p) => m.zoneAt(p.x, p.y) === I.zone }));
  for (const d of [18, 10, 6, 2]) areas.push({ name: DISTRICTS[d].name, box: null, inside: (p) => distOf(p) === d, d });
  for (const I of areas) {
    const inIsl = I.inside;
    if (m.pois.some((p) => p.kind === 'bank' && inIsl(p))) continue;
    if (!I.box) { let sx = 0, sy = 0, n = 0; for (const p of shops()) if (inIsl(p)) { sx += p.x / TILE; sy += p.y / TILE; n++; } if (!n) continue; I.box = [sx / n, sy / n, sx / n, sy / n]; }
    const [x0, y0, x1, y1] = I.box;
    const cx = (x0 + x1) / 2 * TILE, cy = (y0 + y1) / 2 * TILE;
    const heavy = (p) => /warehouse|factory|depot|plant|yard/i.test(p.label) ? 1 : 0; // a bank in a factory would be odd
    const c = shops().filter((p) => inIsl(p) && (walk(p.x - 40, p.y) || walk(p.x + 40, p.y))).sort((a, b) => heavy(a) - heavy(b) || Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (!c) continue;
    const side = walk(c.x - 40, c.y) ? -40 : 40;
    const old = c.label;
    const dname = DISTRICTS[distOf(c)] ? DISTRICTS[distOf(c)].name : I.name;
    c.kind = 'bank'; c.label = `First Pixel Bank - ${dname}`; c.r = 48;
    const b = m.buildings[c.b];
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'First Pixel Bank';
    addAtm(c.x + side, c.y + 6);
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
// Farmhouses and cottages out in Dry Creek, the mansion up in Bayside Heights, beach houses on
// Sunset Beach. Each has a detached garage (a door that opens for its owner) and a driveway.
export const ESTATE_TYPES = {
  farmhouse: { name: 'Farmhouse', price: 18000, slots: 3 },
  cottage: { name: 'Creekside Cottage', price: 30000, slots: 2 },
  beach: { name: 'Beach House', price: 45000, slots: 3 },
  mansion: { name: 'Hilltop Mansion', price: 150000, slots: 6 },
};
const MANSION_SIZE = [26, 24];

function buildEstates(m, rand) {
  m.garages ||= [];
  m.mansions ||= [];
  // Dry Creek: either side of the county road
  const plan = [
    ['farmhouse', 'house2', 1112, 512, true], ['cottage', 'house1', 1124, 512, true], ['farmhouse', 'house3', 1172, 498, true],
    ['cottage', 'house3', 1146, 534, false], ['farmhouse', 'house1', 1182, 532, false],
  ];
  for (const [type, key, x, y, south] of plan) {
    const pf = PREFABS[key];
    m.fill(x - 1, y - 1, pf.tw + 6, pf.th + 2, T.GRASS);
    estateHouse(m, rand, type, key, x, y, south);
  }
  // no lot for it in town: the mansion goes up on the hill above Dry Creek
  if (!m.mansions.length) {
    m.fill(1196, 480, MANSION_SIZE[0], MANSION_SIZE[1], T.GRASS);
    mansion(m, rand, 1196, 480);
  }
}

// Remove whatever stands in a rectangle (buildings, their POIs and homes, props) - used to
// make room for a set piece after the general fill.
function clearArea(m, x, y, w, h) {
  const inside = (tx, ty) => tx >= x && tx < x + w && ty >= y && ty < y + h;
  for (const b of m.buildings) {
    if (b.gone || !(b.tx < x + w && b.tx + b.tw > x && b.ty < y + h && b.ty + b.th > y)) continue;
    b.gone = true;
    for (let ty = b.ty; ty < b.ty + b.th; ty++) for (let tx = b.tx; tx < b.tx + b.tw; tx++) { m.set(tx, ty, T.GRASS); m.bld[ty * MAP_W + tx] = -1; }
    if (b.roof >= 0 && m.roofs[b.roof]) m.roofs[b.roof].gone = true;
    if (b.prefab >= 0 && m.prefabs[b.prefab]) m.prefabs[b.prefab].gone = true;
    for (const p of m.pois) if (p.b === b.id) p.gone = true;
    if (b.home !== undefined && m.homes[b.home]) m.homes[b.home].gone = true;
  }
  m.pois = m.pois.filter((p) => !p.gone);
  m.pois.forEach((p, i) => { p.id = i; });
  // homes are referenced by index: keep the list, but a gone home is never offered
  m.prefabs = m.prefabs.map((p) => (p.gone ? { ...p, tw: 0, th: 0 } : p));
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) if (m.tiles[ty * MAP_W + tx] !== T.BUILDING) m.set(tx, ty, T.GRASS);
  const keep = [];
  const remap = new Map();
  m.props.forEach((p, i) => { if (inside(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) return; remap.set(i, keep.length); keep.push(p); });
  if (keep.length !== m.props.length) {
    const gone = new Set(m.props.filter((p, i) => !remap.has(i)));
    m.props = keep;
    m.lamps = m.lamps.filter((l) => !gone.has(l));
    m.propSolid = new Map();
    for (const [k, arr] of m.solidProps) {
      const kept = arr.filter((e) => (e.pi < 0 ? !inside(Math.floor(e.x / TILE), Math.floor(e.y / TILE)) : remap.has(e.pi)));
      for (const e of kept) if (e.pi >= 0) { e.pi = remap.get(e.pi); m.propSolid.set(e.pi, e); }
      if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k);
    }
  }
  m.parking = m.parking.filter((s) => !inside(Math.floor(s.x / TILE), Math.floor(s.y / TILE)));
  m.stalls = m.stalls.filter((s) => !inside(Math.floor(s.x / TILE), Math.floor(s.y / TILE)));
}

const nearestDist = (m, x, y) => m.dist[Math.min(MAP_H - 1, y) * MAP_W + Math.min(MAP_W - 1, x)];

// carve a driveway from (x0..x0+w-1, y) toward the road, straight up or down
function driveway(m, x0, w, y, dir) {
  for (let k = 0; k < 24; k++) {
    const yy = y + k * dir;
    if ([...Array(w).keys()].some((i) => { const t = m.tileAt(x0 + i, yy); return t === T.ROAD || t === T.BRIDGE; })) return true;
    for (let i = 0; i < w; i++) { const t = m.tileAt(x0 + i, yy); if (t !== T.WATER && t !== T.DEEP && t !== T.BUILDING && t !== T.SIDEWALK) m.set(x0 + i, yy, T.LOT); }
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
  m.garages ||= [];
  m.mansions ||= [];
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
      if (t !== T.GRASS && t !== T.SAND && t !== T.DIRT && t !== T.PLAZA) continue;
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
  // front terrace + walk to the gate (door faces north, toward the street)
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
  const isl = (p) => m.zoneAt(p.x, p.y);
  // one per part of the world first, then anywhere
  for (const pass of [0, 1]) for (const c of cands) {
    if (picked.length >= 4) break;
    if (picked.includes(c) || picked.some((q) => distOf(q) === distOf(c) || Math.hypot(q.x - c.x, q.y - c.y) < 4000)) continue;
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
      if (b.gone || b.prefab !== -1 || b.kind !== 'roof' || used.has(b.id) || b.tw < 8 || b.tw > 14 || b.th < 10) continue;
      const gapX = Math.max(0, b.tx - (sb.tx + sb.tw), sb.tx - (b.tx + b.tw));
      const gapY = Math.max(0, b.ty - (sb.ty + sb.th), sb.ty - (b.ty + b.th));
      if (gapX > 3 || gapY > 3) continue;
      // the gate goes on the short side that faces a road
      const south = [1, 2, 3, 4].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty + b.th - 1 + k));
      const north = [1, 2, 3, 4].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty - k));
      if (!south && !north) continue;
      const d = Math.hypot(b.tx + b.tw / 2 - (sb.tx + sb.tw / 2), b.ty + b.th / 2 - (sb.ty + sb.th / 2));
      if (d < bd) { bd = d; best = { b, south }; }
    }
    if (!best) {
      // no plain building next door: take the yard beside the station instead
      best = carvePoolLot(m, sb);
      if (!best) continue;
    }
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
    for (let k = 1; k <= 4; k++) {
      const yy = south ? gy + k : gy - k;
      if (isRoad(x0 + Math.floor(w / 2), yy)) break;
      for (let tx = x0 + 1; tx < x0 + w - 1; tx++) { const t = m.tileAt(tx, yy); if (t !== T.ROAD && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP) m.set(tx, yy, T.LOT); }
    }
    const gate = { x: (x0 + w / 2) * TILE, y: (gy + 0.5) * TILE, w: (w - 2) * TILE, south, props: [], rule: 'police', rect: { tx: x0, ty: y0, tw: w, th: h } };
    m.gates.push(gate);
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
    m.motorPools.push({ station: st.id, b: b.id, tx: x0, ty: y0, tw: w, th: h, south, gate, gateIdx: m.gates.length - 1, spots, exit });
    st.pool = m.motorPools.length - 1;
  }
}
// A lot for the motor pool right beside a station that has no plain building next to it.
function carvePoolLot(m, sb) {
  for (const side of [1, -1]) {
    const w = 8, h = 12;
    const x0 = side > 0 ? sb.tx + sb.tw + 1 : sb.tx - w - 1;
    for (const y0 of [sb.ty + sb.th - h, sb.ty]) {
      let ok = true;
      for (let ty = y0; ty < y0 + h && ok; ty++) for (let tx = x0; tx < x0 + w; tx++) { const t = m.tileAt(tx, ty); if (t === T.ROAD || t === T.BRIDGE || t === T.WATER || t === T.DEEP || m.bld[ty * MAP_W + tx] >= 0 && m.buildings[m.bld[ty * MAP_W + tx]].kind !== 'roof') ok = false; }
      if (!ok) continue;
      const south = [1, 2, 3, 4].some((k) => { const t = m.tileAt(x0 + 4, y0 + h - 1 + k); return t === T.ROAD; });
      const north = [1, 2, 3, 4].some((k) => { const t = m.tileAt(x0 + 4, y0 - k); return t === T.ROAD; });
      if (!south && !north) continue;
      clearArea(m, x0, y0, w, h);
      const bid = m.buildings.length;
      const b = { id: bid, prefab: -1, roof: -1, tx: x0, ty: y0, tw: w, th: h, kind: 'roof', name: 'Lot', business: null, signs: [] };
      m.buildings.push(b);
      return { b, south };
    }
  }
  return null;
}

// Corner stores: the convenience-store storefronts become real shops you can walk into (and
// rob). A few of them, out on the main roads, are Gas 'n Go stations with pumps out front.
function buildCornerStores(m) {
  const conv = m.pois.filter((p) => p.kind === 'delivery' && m.buildings[p.b] && m.buildings[p.b].kind === 'conv');
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  m.pumps = [];
  const gas = [];
  for (const p of [...conv].sort((a, b) => hash2(a.x | 0, a.y | 0, 41) - hash2(b.x | 0, b.y | 0, 41))) {
    if (gas.length >= 6 || gas.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 3500)) continue;
    // needs open paving in front for the pumps
    const ok = [-48, 48].every((dx) => [40, 64].every((dy) => { const t = m.tileAtPx(p.x + dx, p.y + (p.y > m.buildings[p.b].ty * TILE ? dy : -dy)); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT; }));
    if (ok) gas.push(p);
  }
  for (const p of conv) {
    const d = DISTRICTS[distOf(p)];
    if (gas.includes(p)) {
      p.kind = 'gasstation'; p.label = `Gas 'n Go - ${d.name}`;
      const south = p.y > m.buildings[p.b].ty * TILE;
      for (const dx of [-48, 48]) {
        const x = p.x + dx, y = p.y + (south ? 52 : -52);
        m.pumps.push({ x, y });
        m.addSolidProp(x, y, 9);
      }
    } else p.kind = 'convenience';
    for (const s of m.buildings[p.b].signs) if (s.text === p.label || gas.includes(p)) s.text = gas.includes(p) ? "Gas 'n Go" : s.text;
  }
}

// Walk-in buildings: shops, banks, hospitals, the courthouse and police stations get a real
// interior behind their front door - a one-tile wall ring, a floor, partition walls between the
// units of a strip mall, and a counter with a clerk behind it. The roof art fades out while you
// are inside (client). The place's interaction point moves in front of its counter.
export const WALK_IN = new Set(['convenience', 'gasstation', 'hospital', 'gunshop', 'sports', 'hardware', 'clothing', 'grocery', 'pawn', 'bank', 'courthouse', 'pharmacy', 'police', 'fence', 'fishmarket', 'coffee', 'tackle']);
const HELPER_POIS = new Set(['reception', 'evidence', 'atm']);
function buildInteriors(m) {
  m.walkIns = [];
  const byB = new Map();
  for (const p of m.pois) if (p.b !== undefined) { if (!byB.has(p.b)) byB.set(p.b, []); byB.get(p.b).push(p); }
  const bays = new Set((m.bays || []).map((bay) => m.bld[bay.ty * MAP_W + bay.tx]));
  for (const [bid, list] of byB) {
    const b = m.buildings[bid];
    if (!b || b.gone || b.prefab < 0 || b.tw < 5 || b.th < 5 || bays.has(bid)) continue;
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

// A sand volleyball court with a net across the middle (net posts are solid).
function volleyCourt(m, name, x, y, w, h) {
  m.fill(x - 1, y - 1, w + 2, h + 2, T.SAND);
  const rect = { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE };
  const netX = rect.x + rect.w / 2;
  m.addSolidProp(netX, rect.y - 6, 5); m.addSolidProp(netX, rect.y + rect.h + 6, 5);
  m.venues.push({ id: m.venues.length, kind: 'volley', name, rect, netX });
}

// ---- the metro ------------------------------------------------------------------------------
// One loop through the middle of the city: under Midtown, Downtown and the Civic Center in a
// subway tunnel, up into the open past the ring highway, a long rural run through the fields of
// Dry Creek (train robbery country), back west at street level through Southside and Pine Hills,
// over the river on a bridge and in past The Yards. Trains follow `rail.pts` by arc length;
// stations, crossings and the tunnel are positions along it.
export const RAIL_GAUGE = 52;         // px between the outer rails' ties (track bed width ~2 tiles)
// Rolling stock (wire index = position here). Coaches: seat rows either side of the aisle, doors
// in the middle; the mail car carries the strongbox at its back end.
export const TRAIN_CARS = [
  { kind: 'loco', name: 'Locomotive', L: 196, W: 70 },
  { kind: 'coach', name: 'Passenger coach', L: 212, W: 76 },
  { kind: 'mail', name: 'Mail car', L: 188, W: 76 },
];
export const COACH_SEATS = [-84, -60, -36, 36, 60, 84].flatMap((ox) => [[ox, -23], [ox, 23]]);
export const COACH_STAND = [[-7, -18], [7, -18], [-7, 18], [7, 18], [-72, 0], [-48, 0], [48, 0], [72, 0]];
export const MAIL_BOX = { ox: -58, oy: 0 };              // the strongbox (towards the back of the mail car)
export const MAIL_POSTS = [[40, -18], [40, 18]];          // where the guards stand
export const CROSSING_ARM = 66;                          // gate arms this far either side of the track centre
const RAIL_ROUTE = [ // [tx, ty, flag] corners, clockwise; flag 'sub' = underground between two such corners
  [700, 514, 'sub'], [960, 514, 'sub'], [1052, 505, 'sub'], [1094, 540], [1094, 700], [1060, 732], [960, 766], [850, 766], [800, 742], [776, 694], [744, 658], [708, 628, 'sub'],
];
const RAIL_STATIONS = [ // [name, tx, ty] nearest point on the line becomes the stop
  ['Midtown', 700, 560], ['Downtown', 806, 505], ['Civic Center', 912, 505], ['Dry Creek', 1095, 600],
  ['Southside', 985, 766], ['Pine Hills', 870, 766], ['Riverside', 806, 744], ['The Yards', 760, 676],
];
export const RAIL_MAX_BRIDGE_TILES = 40; // the longest stretch of open water the line may cross (on a bridge)

function railLine(m) {
  const C = RAIL_ROUTE.map(([x, y, f]) => ({ x: x * TILE, y: y * TILE, sub: f === 'sub' }));
  const loop = rounded(C, 12 * TILE, true, 14);
  // carry the underground flag: a point is on a 'sub' stretch when the corners either side are
  const pts = [];
  const n = C.length;
  const flagAt = (p) => {
    // nearest corner-to-corner segment decides
    let best = null, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const a = C[i], b = C[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      if (d < bd) { bd = d; best = a.sub && b.sub; }
    }
    return best;
  };
  for (let k = 0; k < loop.length - 1; k++) {
    const a = loop[k], b = loop[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let j = 0; j < steps; j++) { const t = j / steps; const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; p.sub = flagAt(p); pts.push(p); }
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  const wet = (x, y) => { const t = m.tileAtPx(x, y); return t === T.WATER || t === T.DEEP; };
  for (const p of pts) p.under = !!p.sub && !wet(p.x, p.y);
  // where the at-grade line passes under the ring highway (slip ramps keep clear of it)
  m.railRingCross = [];
  if (m.ring) for (const p of pts) if (!p.under && m.ringD && m.ringD[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === 0) { const pr = project(m.ring, p); if (pr && !m.railRingCross.some((q) => Math.abs(q - pr.s) < 600)) m.railRingCross.push(pr.s); }
  return pts;
}

// Keep the at-grade track bed free of buildings (roads it crosses stay roads: level crossings).
function reserveRail(m, pts) {
  for (const p of pts) {
    if (p.under) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(p.x / TILE) + dx, ty = Math.floor(p.y / TILE) + dy;
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if (Math.hypot((tx + 0.5) * TILE - p.x, (ty + 0.5) * TILE - p.y) > 62) continue;
      const i = ty * MAP_W + tx;
      m.reserve[i] |= 2;
      const t = m.tiles[i];
      if (t === T.GRASS || t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.SAND) m.tiles[i] = T.DIRT;
    }
  }
}

function buildRailway(m, pts) {
  const total = pts[pts.length - 1].s + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  // Where the line meets open water: a long run of water under the centre line is a crossing (a
  // bridge deck); anything else - the ragged edge of a bank - is filled in as embankment.
  const wetT = (t) => t === T.WATER || t === T.DEEP;
  let run = [];
  const closeRun = () => { const len = run.length ? run[run.length - 1].s - run[0].s : 0; for (const q of run) q.bridge = len > 5 * TILE; run = []; };
  for (const p of pts) { if (!p.under && wetT(m.tileAtPx(p.x, p.y))) run.push(p); else closeRun(); }
  closeRun();
  for (let i = 0; i < pts.length; i++) if (pts[i].bridge) for (let k = -6; k <= 6; k++) { const q = pts[(i + k + pts.length) % pts.length]; if (!q.under) q.deck = true; }
  // lay the track bed: ballast (dirt) on land and embankment, a deck on the bridges; road crossings stay road
  const crossings = [];
  const OFFS = [[-24, -24], [24, -24], [-24, 24], [24, 24], [0, 0], [-24, 0], [24, 0], [0, -24], [0, 24]];
  for (const p of pts) {
    if (p.under) continue;
    for (const [dx, dy] of OFFS) {
      const tx = Math.floor((p.x + dx) / TILE), ty = Math.floor((p.y + dy) / TILE);
      const t = m.tileAt(tx, ty);
      if (t === T.ROAD || (t === T.BRIDGE && m.roadAxis[ty * MAP_W + tx])) {
        const last = crossings[crossings.length - 1];
        if (!last || p.s - last.s1 > 40) crossings.push({ s0: p.s, s1: p.s, x: p.x, y: p.y });
        else { last.s1 = p.s; }
        continue;
      }
      if (wetT(t)) m.set(tx, ty, p.deck ? T.BRIDGE : T.DIRT);
      else if (t !== T.BRIDGE && t !== T.DOCK && t !== T.BUILDING && t !== T.WALL) m.set(tx, ty, T.DIRT);
    }
    if (!p.deck) for (const [dx, dy] of [[-40, 0], [40, 0], [0, -40], [0, 40]]) { const tx = Math.floor((p.x + dx) / TILE), ty = Math.floor((p.y + dy) / TILE); if (wetT(m.tileAt(tx, ty))) m.set(tx, ty, T.GRASS); }
  }
  clearPropsOnRail(m, pts);
  for (const c of crossings) {
    const mid = (c.s0 + c.s1) / 2; const q = railAt({ pts, len: total }, mid); c.s = mid; c.x = q.x; c.y = q.y; c.a = q.a;
    const onRoad = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = m.tileAt(tx, ty); return t === T.ROAD || (t === T.BRIDGE && !!m.roadAxis[ty * MAP_W + tx]); };
    let hw = 16;
    for (const sg of [-1, 1]) { let d = 0; while (d < 260 && onRoad(q.x + Math.cos(q.a) * sg * (d + 8), q.y + Math.sin(q.a) * sg * (d + 8))) d += 8; hw = Math.max(hw, d + 4); }
    c.hw = hw;
  }
  for (const c of crossings.filter((q) => q.hw < 28)) {
    for (const p of pts) if (p.s > c.s0 - 48 && p.s < c.s1 + 48) for (const [dx, dy] of OFFS) { const tx = Math.floor((p.x + dx) / TILE), ty = Math.floor((p.y + dy) / TILE); if (m.tileAt(tx, ty) === T.ROAD) { m.set(tx, ty, T.DIRT); m.roadAxis[ty * MAP_W + tx] = 0; } }
    crossings.splice(crossings.indexOf(c), 1);
  }
  // stations: platform beside the track, joined to the nearest land
  const stations = [];
  for (const [name, tx, ty] of RAIL_STATIONS) {
    let best = null, bd = Infinity;
    for (const p of pts) { const d = Math.hypot(p.x - tx * TILE, p.y - ty * TILE); if (d < bd) { bd = d; best = p; } }
    const q = railAt({ pts, len: total }, best.s);
    const nx = -Math.sin(q.a), ny = Math.cos(q.a);
    const landDist = (sx) => { for (let d = 40; d < 900; d += 16) { const t = m.tileAtPx(q.x + nx * sx * d, q.y + ny * sx * d); if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE) return d; } return 9999; };
    const bad = (sd) => { let n = 0; for (let along = -112; along <= 112; along += 16) for (let off = 40; off <= 88; off += 16) { const t = m.tileAtPx(q.x + Math.cos(q.a) * along + nx * sd * off, q.y + Math.sin(q.a) * along + ny * sd * off); if (t === T.ROAD || t === T.BUILDING || t === T.WALL || t === T.BRIDGE) n++; } return n; };
    const side = best.under ? 1 : bad(1) !== bad(-1) ? (bad(1) < bad(-1) ? 1 : -1) : landDist(1) <= landDist(-1) ? 1 : -1;
    const st = { name: `${name} Station`, s: best.s, x: q.x, y: q.y, a: q.a, side, under: !!best.under };
    if (!best.under) {
      const ax = Math.cos(q.a), ay = Math.sin(q.a);
      for (let along = -112; along <= 112; along += 16) for (let off = 40; off <= 88; off += 16) {
        const x = q.x + ax * along + nx * side * off, y = q.y + ay * along + ny * side * off;
        const t = m.tileAtPx(x, y);
        if (t === T.WATER || t === T.DEEP) m.set(Math.floor(x / TILE), Math.floor(y / TILE), T.DOCK);
        else if (t !== T.BUILDING && t !== T.WALL && t !== T.ROAD && t !== T.BRIDGE) m.set(Math.floor(x / TILE), Math.floor(y / TILE), T.PLAZA);
      }
      const far = landDist(side) < 400 ? landDist(side) : 0;
      for (let d = 88; d <= far + 16; d += 16) for (const w of [-16, 0, 16]) {
        const x = q.x + nx * side * d + ax * w, y = q.y + ny * side * d + ay * w;
        const t = m.tileAtPx(x, y);
        if (t === T.WATER || t === T.DEEP) m.set(Math.floor(x / TILE), Math.floor(y / TILE), T.DOCK);
      }
      st.platform = { x: q.x + nx * side * 64, y: q.y + ny * side * 64 };
    } else {
      let ent = null;
      for (let r = 32; r < 700 && !ent; r += 16) for (let k = 0; k < 16; k++) {
        const x = q.x + Math.cos(k / 16 * 6.283) * r, y = q.y + Math.sin(k / 16 * 6.283) * r;
        if (m.tileAtPx(x, y) === T.SIDEWALK && !m.deck[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)]) { ent = { x, y }; break; }
      }
      st.platform = ent || { x: q.x, y: q.y };
    }
    st.poi = m.pois.length;
    m.pois.push({ id: m.pois.length, kind: 'station', label: st.name, x: st.platform.x, y: st.platform.y, r: 70, station: stations.length });
    stations.push(st);
  }
  stations.sort((a, b) => a.s - b.s);
  stations.forEach((st, i) => { m.pois[st.poi].station = i; });
  // the long rural run: the stretch of line through Dry Creek's fields
  const ruralIdx = pts.map((p, i) => (!p.under && m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === 9 ? i : -1)).filter((i) => i >= 0);
  let rural = null;
  if (ruralIdx.length) {
    let bestRun = null, cur = [ruralIdx[0]];
    for (let k = 1; k < ruralIdx.length; k++) { if (ruralIdx[k] === ruralIdx[k - 1] + 1) cur.push(ruralIdx[k]); else { if (!bestRun || cur.length > bestRun.length) bestRun = cur; cur = [ruralIdx[k]]; } }
    if (!bestRun || cur.length > bestRun.length) bestRun = cur;
    rural = { s0: pts[bestRun[0]].s + 200, s1: pts[bestRun[bestRun.length - 1]].s - 100 };
  }
  m.rail = { pts, len: total, stations, crossings, rural };
}

// Clear street furniture standing on the track bed (and re-index what's left: props are
// referenced by index on the wire, and both ends build the map the same way).
function clearPropsOnRail(m, pts) {
  const grid = new Set();
  for (const p of pts) if (!p.under) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) grid.add((Math.floor(p.y / TILE) + dy) * MAP_W + Math.floor(p.x / TILE) + dx);
  const near = (x, y) => { if (!grid.has(Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE))) return false; for (const p of pts) if (!p.under && Math.abs(p.x - x) < 46 && Math.abs(p.y - y) < 46 && Math.hypot(p.x - x, p.y - y) < 46) return true; return false; };
  const keep = [], remap = new Map(), gone = new Set();
  m.props.forEach((pr, i) => { if (near(pr.x, pr.y)) { gone.add(pr); return; } remap.set(i, keep.length); keep.push(pr); });
  if (!gone.size) return;
  m.props = keep;
  m.lamps = m.lamps.filter((l) => !gone.has(l));
  m.propSolid = new Map();
  for (const [k, arr] of m.solidProps) {
    const kept = arr.filter((e) => e.pi < 0 ? !near(e.x, e.y) : remap.has(e.pi));
    for (const e of kept) if (e.pi >= 0) { e.pi = remap.get(e.pi); m.propSolid.set(e.pi, e); }
    if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k);
  }
}

// Position + heading at arc length s along the loop (wraps).
export function railAt(rail, s) {
  const pts = rail.pts, L = rail.len;
  s = ((s % L) + L) % L;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = pts[lo], b = pts[(lo + 1) % pts.length];
  const segLen = (lo + 1 < pts.length ? b.s : L) - a.s || 1;
  const t = Math.min(1, (s - a.s) / segLen);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x), under: !!(a.under && b.under), i: lo };
}

// ---- out on the water ------------------------------------------------------------------------
// Two islands you can only reach by boat (Pelican Key: beach, bar, charter dock; Smuggler's Rock:
// the Syndicate's walled compound), open-sea waypoints for boats, offshore fishing grounds and
// the race courses.
function simpleBuilding(m, x, y, w, h, name, kind, d, roofKind = 'tar', sign = null) {
  const bid = m.buildings.length;
  m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (x * 7919 + y * 104729) | 0, d, b: bid });
  const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: [] };
  if (sign) b.signs.push(sign);
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * MAP_W + tx] = bid; }
  return b;
}
const isWater = (t) => t === T.WATER || t === T.DEEP;
function shoreSand(m, box, ground, zone) {
  const [x0, y0, x1, y1] = box;
  for (let ty = y0 - 4; ty < y1 + 4; ty++) for (let tx = x0 - 4; tx < x1 + 4; tx++) {
    const i = ty * MAP_W + tx;
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || m.zone[i] !== zone) continue;
    let near = false;
    for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) if (isWater(m.tileAt(tx + dx, ty + dy))) { near = true; break; }
    m.set(tx, ty, near ? T.SAND : ground);
  }
}
// A jetty from the shore at (sx, sy) heading dx/dy until it is `len` tiles into the water.
function jetty(m, sx, sy, dx, dy, len, w = 3) {
  let x = sx, y = sy, k = 0;
  while (k < 60 && !isWater(m.tileAt(x, y))) { x += dx; y += dy; k++; }
  const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0;
  const tip = { x, y };
  for (let i = -2; i < len; i++) for (let o = 0; o < w; o++) {
    const tx = x + dx * i + px * (o - 1), ty = y + dy * i + py * (o - 1);
    if (isWater(m.tileAt(tx, ty)) || i < 0) m.set(tx, ty, T.DOCK);
    tip.x = x + dx * i; tip.y = y + dy * i;
  }
  return tip;
}

function buildOffshore(m, rand) {
  // --- Pelican Key: beach island with a bar, a charter dock and jetskis -------------------------
  const P = ISLANDS.P;
  shoreSand(m, P.box, T.GRASS, Z.KEY);
  const [px0, py0, px1, py1] = P.box;
  const pcx = Math.floor((px0 + px1) / 2), pcy = Math.floor((py0 + py1) / 2);
  m.fill(pcx - 8, pcy - 2, 16, 4, T.PLAZA); // boardwalk
  const court = [pcx - 30, pcy + 8, 16, 8];
  volleyCourt(m, 'Pelican Key Volleyball', ...court);
  const onCourt = (tx, ty) => tx >= court[0] - 2 && tx <= court[0] + court[2] + 1 && ty >= court[1] - 2 && ty <= court[1] + court[3] + 1;
  m.fill(pcx - 2, pcy - 20, 4, 40, T.PLAZA);
  const bar = simpleBuilding(m, pcx + 3, pcy - 9, 9, 6, 'Pelican Key Beach Bar', 'beachbar', 14, 'tile', { x: (pcx + 7.5) * TILE, y: (pcy - 2.6) * TILE, text: 'Beach Bar' });
  m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Pelican Key Beach Bar', x: (pcx + 7.5) * TILE, y: (pcy - 2.3) * TILE, r: 44, b: bar.id });
  const tip = jetty(m, pcx, pcy, 0, -1, 9);
  const charter = simpleBuilding(m, pcx - 12, pcy - 12, 6, 4, 'Pelican Key Charters', 'charter', 14, 'metal', { x: (pcx - 9) * TILE, y: (pcy - 7.6) * TILE, text: 'Charters' });
  m.pois.push({ id: m.pois.length, kind: 'charter', label: 'Pelican Key Charters', x: (pcx - 9) * TILE, y: (pcy - 7.3) * TILE, r: 44, b: charter.id });
  // jetskis and a speedboat tied up along the jetty (it runs north into the bay)
  for (let k = 0; k < 4; k++) m.marina.push({ x: (tip.x + 2.6) * TILE, y: (tip.y + 2 + k * 2.2) * TILE, a: 0, kind: k < 3 ? 'jetski' : 'speedboat' });
  for (let k = 0; k < 2; k++) m.marina.push({ x: (tip.x - 2.6) * TILE, y: (tip.y + 2 + k * 3.2) * TILE, a: Math.PI, kind: 'jetski' });
  for (let k = 0; k < 120; k++) {
    const tx = px0 + Math.floor(rand() * (px1 - px0)), ty = py0 + Math.floor(rand() * (py1 - py0));
    if (m.zone[ty * MAP_W + tx] !== Z.KEY) continue;
    const t = m.tileAt(tx, ty);
    if (onCourt(tx, ty)) continue;
    if (t === T.SAND && rand() < 0.5) addProp(m, ['palm_a', 'palm_b', 'palm_c', 'umbrella_r', 'umbrella_y'][Math.floor(rand() * 5)], (tx + 0.5) * TILE, (ty + 0.5) * TILE, 0);
    else if (t === T.GRASS) addProp(m, rand() < 0.7 ? 'palm_d' : 'shrub_a', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 10);
  }
  m.pelican = { x: pcx * TILE, y: pcy * TILE, dock: { x: tip.x * TILE, y: tip.y * TILE } };

  // --- Smuggler's Rock: rocky island, walled Syndicate compound, gate for members only --------
  const C = ISLANDS.C;
  shoreSand(m, C.box, T.DIRT, Z.ROCK);
  const [cx0, cy0, cx1, cy1] = C.box;
  const ccx = Math.floor((cx0 + cx1) / 2), ccy = Math.floor((cy0 + cy1) / 2);
  const W = 26, H = 22, wx = ccx - 11, wy = ccy - H / 2;
  m.fill(wx, wy, W, H, T.LOT);
  for (let x = wx; x < wx + W; x++) { m.set(x, wy, T.WALL); m.set(x, wy + H - 1, T.WALL); }
  for (let y = wy; y < wy + H; y++) { m.set(wx, y, T.WALL); m.set(wx + W - 1, y, T.WALL); }
  const gy0 = ccy - 2; // the gate: 4 tiles of the west wall, facing the dock
  for (let y = gy0; y < gy0 + 4; y++) m.set(wx, y, T.LOT);
  m.fill(wx - 14, gy0, 14, 4, T.DIRT); // track down to the dock
  const den = simpleBuilding(m, wx + 12, wy + 3, 11, 7, 'Syndicate Den', 'den', 15, 'metal', { x: (wx + 17.5) * TILE, y: (wy + 10.4) * TILE, text: 'NO TRESPASSING' });
  m.pois.push({ id: m.pois.length, kind: 'smuggler', label: "Smuggler's Den", x: (wx + 17.5) * TILE, y: (wy + 10.8) * TILE, r: 46, b: den.id });
  const ctip = jetty(m, wx - 12, gy0 + 1, -1, 0, 8);
  for (let k = 0; k < 3; k++) m.marina.push({ x: (ctip.x + 2 + k * 3) * TILE, y: (gy0 - 1.6) * TILE, a: -Math.PI / 2, kind: k === 2 ? 'speedboat' : 'dinghy', gang: true });
  for (const [x, y] of [[wx + 4, wy + 14], [wx + 6, wy + 16], [wx + 20, wy + 15], [wx + 3, wy + 3]]) addProp(m, ['pallet', 'drum', 'spool', 'pallet_b'][Math.floor(rand() * 4)], (x + 0.5) * TILE, (y + 0.5) * TILE, 10);
  const gate = { x: (wx + 0.5) * TILE, y: (gy0 + 2) * TILE, w: 4 * TILE, vertical: true, props: [], rule: 'gang', rect: { tx: wx, ty: wy, tw: W, th: H } };
  for (let py = gy0 * TILE + 8; py <= (gy0 + 4) * TILE - 8; py += 14) { const e = m.addSolidProp(gate.x, py, 10); gate.props.push(e); }
  m.gates.push(gate);
  m.rock = { x: ccx * TILE, y: ccy * TILE, compound: { tx: wx, ty: wy, tw: W, th: H }, dock: { x: ctip.x * TILE, y: (gy0 + 1) * TILE },
    guards: [[wx - 3, gy0 - 1], [wx - 3, gy0 + 4], [wx + 3, gy0 + 1], [wx + 8, wy + 5], [wx + 9, wy + H - 4], [ctip.x + 1, gy0 + 1]].map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })) };

  // --- open-sea waypoints, offshore grounds ----------------------------------------------------
  m.seaPoints = []; m.offshore = [];
  for (let ty = 4; ty < MAP_H - 4; ty += 10) for (let tx = 4; tx < MAP_W - 4; tx += 10) {
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) if (!isWater(m.tileAt(tx + dx, ty + dy))) { ok = false; break; }
    if (!ok || m.river[ty * MAP_W + tx]) continue;
    const p = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
    m.seaPoints.push(p);
    let far = true;
    for (let dy = -14; dy <= 14 && far; dy += 2) for (let dx = -14; dx <= 14; dx += 2) { const t = m.tileAt(tx + dx, ty + dy); if (!isWater(t) && t !== T.WALL) { far = false; break; } }
    if (far) m.offshore.push(p);
  }

  // --- race courses: buoys in open water around Pelican Key -------------------------------------
  const ring = (pad, n, phase) => {
    const pts = [];
    const rx = (px1 - px0) / 2 + pad, ry = (py1 - py0) / 2 + pad;
    for (let k = 0; k < n; k++) {
      const a = phase + (k / n) * Math.PI * 2;
      let x = pcx + Math.cos(a) * rx, y = pcy + Math.sin(a) * ry;
      for (let tries = 0; tries < 12 && !(isWater(m.tileAt(Math.floor(x), Math.floor(y))) && isWater(m.tileAt(Math.floor(x) + 2, Math.floor(y))) && isWater(m.tileAt(Math.floor(x) - 2, Math.floor(y)))); tries++) { x += Math.cos(a) * 2; y += Math.sin(a) * 2; }
      x = Math.min(MAP_W - 3, Math.max(2, x)); y = Math.min(MAP_H - 3, Math.max(2, y));
      pts.push({ x: x * TILE, y: y * TILE });
    }
    return pts;
  };
  const jetCourse = ring(8, 8, Math.PI);
  const boatCourse = ring(22, 10, Math.PI);
  m.races = [
    { id: 0, name: 'Pelican Key Jetski Sprint', kind: 'jetski', start: jetCourse[0], cps: jetCourse.slice(1).concat([jetCourse[0]]), prize: 400 },
    { id: 1, name: 'Bay Boat Classic', kind: 'boat', start: boatCourse[0], cps: boatCourse.slice(1).concat([boatCourse[0]]), prize: 700 },
  ];
}

// Bait & tackle shops: storefronts close to the water, in different districts, spread apart.
function buildTackleShops(m) {
  const nearWater = (p) => m.distSea[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] < 44 * 4 || m.distRiver[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] < 34 * 4;
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const cands = m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && nearWater(p) && !DISTRICTS[distOf(p)].turf && !/warehouse|factory|hotel|motel|lounge|ritz/i.test(p.label));
  cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 23) - hash2(b.x | 0, b.y | 0, 23));
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 3) break;
    if (picked.some((q) => distOf(q) === distOf(c) || Math.hypot(q.x - c.x, q.y - c.y) < 1600)) continue;
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
  // cross paths, a plaza with a fountain, a ring path
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
  // a full-size pitch across the park's south half (soccer mini-game)
  let pitch = null;
  if (info.pitch) {
    pitch = { x0: ix + 6, y0: cy + 6, x1: ix + iw - 7, y1: iy + ih - 6 };
    m.fill(pitch.x0 - 1, pitch.y0 - 1, pitch.x1 - pitch.x0 + 2, pitch.y1 - pitch.y0 + 2, T.GRASS);
    m.venues.push({ id: m.venues.length, kind: 'soccer', name: `${info.label} Pitch`, rect: { x: pitch.x0 * TILE, y: pitch.y0 * TILE, w: (pitch.x1 - pitch.x0) * TILE, h: (pitch.y1 - pitch.y0) * TILE }, goalW: 5 * TILE });
  }
  const onPitch = (tx, ty) => pitch && tx >= pitch.x0 - 2 && tx <= pitch.x1 + 1 && ty >= pitch.y0 - 2 && ty <= pitch.y1 + 1;
  for (let k = 0; k < (iw * ih) / 12; k++) {
    const tx = ix + 1 + Math.floor(rand() * (iw - 2)), ty = iy + 1 + Math.floor(rand() * (ih - 2));
    if (m.tileAt(tx, ty) !== T.GRASS || onPitch(tx, ty)) continue;
    const t = ['tree_a', 'tree_b', 'tree_a', 'tree_b', 'shrub_a', 'flowers_a', 'flowers_big', 'mosaic'][Math.floor(rand() * 8)];
    addProp(m, t, (tx + 0.5) * TILE, (ty + 0.5) * TILE, t.startsWith('tree') ? 12 : 0);
  }
  for (let x = ix + 6; x < ix + iw - 6; x += 9) { addProp(m, 'lamp', (x + 0.5) * TILE, (iy + 4.5) * TILE); if (!onPitch(x, iy + ih - 5)) addProp(m, 'lamp', (x + 0.5) * TILE, (iy + ih - 4.5) * TILE); }
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
    l.a = best ? Math.atan2(best[1], best[0]) : -Math.PI / 2;
  }
}

// ---------------------------------------------------------------------------
// Shores: promenades with palms and lamps, beaches with umbrellas, the harbor's piers and
// berths, the public fishing pier.
function buildWaterfronts(m, rand) {
  const W = MAP_W;
  for (let ty = 2; ty < MAP_H - 2; ty += 3) for (let tx = 2; tx < W - 2; tx += 3) {
    const i = ty * W + tx;
    if (!(m.reserve[i] & 4)) continue;
    const t = m.tiles[i];
    let nearRoad = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = m.tileAt(tx + dx, ty + dy); if (q === T.ROAD || q === T.BRIDGE) nearRoad = true; }
    if (nearRoad || m.reserve[i] & 3) continue;
    const st = DISTRICTS[m.dist[i]].style;
    const h = hash2(tx, ty, 91);
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (st === 'harbor' || st === 'industrial' || st === 'factory') { if (h < 0.18) addProp(m, ['pallet', 'drum', 'spool', 'pallet_b', 'dump_b', 'pipes'][Math.floor(h * 33) % 6], x, y, 10); }
    else if (t === T.SAND) { if (h < 0.06) addProp(m, ['palm_a', 'palm_b', 'palm_c', 'palm_d'][Math.floor(h * 66) % 4], x, y, 10); else if (h > 0.95) addProp(m, ['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'][Math.floor(h * 400) % 4], x, y, 0); }
    else if (t === T.PLAZA) { if (h < 0.14) addProp(m, ['palm_a', 'palm_b', 'bench_m', 'palm_c', 'planter_sq'][Math.floor(h * 35) % 5], x, y, h < 0.08 ? 10 : 0); else if (h > 0.94) addProp(m, 'lamp', x, y); }
    else if (h < 0.16) addProp(m, h < 0.1 ? 'tree_b' : 'shrub_a', x, y, h < 0.1 ? 12 : 0);
  }
  // seawalls: where a paved shore meets the water the renderer draws a wall; remember those runs
  m.seawall = [];
  // Harbor piers: out from the quays into the bay, boats berthed alongside
  const piers = [];
  for (let ty = 560; ty < 800; ty += 2) for (let tx = 560; tx < 820; tx += 2) {
    const i = ty * W + tx;
    if (piers.length >= 5 || (m.dist[i] !== 8 && m.dist[i] !== 3) || !(m.reserve[i] & 4) || m.reserve[i] & 3) continue;
    if (piers.some((p) => Math.abs(p.tx - tx) + Math.abs(p.ty - ty) < 18)) continue;
    for (const [dx, dy] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      if (!isWater(m.tileAt(tx + dx, ty + dy))) continue;
      let k = 1; while (k < 24 && isWater(m.tileAt(tx + dx * k, ty + dy * k)) && !m.river[(ty + dy * k) * W + tx + dx * k]) k++;
      if (k < 20) continue;
      const tip = jetty(m, tx, ty, dx, dy, 13);
      piers.push({ tx, ty });
      addProp(m, 'lamp', (tip.x + 0.5) * TILE, (tip.y + 0.5) * TILE);
      const px = -dy, py = dx; // either side of the pier
      for (const sd of [-1, 1]) m.marina.push({ x: (tip.x - dx * 4 + px * sd * 2.6 + 0.5) * TILE, y: (tip.y - dy * 4 + py * sd * 2.6 + 0.5) * TILE, a: Math.atan2(dy, dx) });
      break;
    }
  }
  // Sunset Beach: the public fishing pier straight out to sea, plus the volleyball court
  let pier = null;
  for (let ty = 470; ty < 600 && !pier; ty += 2) for (let tx = 560; tx < 640; tx++) {
    const i = ty * W + tx;
    if (m.dist[i] === 10 && m.tiles[i] === T.SAND && isWater(m.tileAt(tx - 1, ty)) && isWater(m.tileAt(tx - 10, ty))) { pier = { tx, ty }; break; }
  }
  if (pier) {
    m.fill(pier.tx - 18, pier.ty, 20, 3, T.DOCK);
    m.fill(pier.tx - 21, pier.ty - 3, 4, 9, T.DOCK);
    for (let y = pier.ty; y < pier.ty + 3; y++) for (let x = pier.tx - 18; x < pier.tx + 2; x++) if (!isWater(m.tileAt(x, y)) && m.tileAt(x, y) !== T.DOCK) m.set(x, y, T.DOCK);
    addProp(m, 'lamp', (pier.tx - 19.5) * TILE, (pier.ty + 1.5) * TILE);
    m.marina.push({ x: (pier.tx - 14) * TILE, y: (pier.ty - 1.6) * TILE, a: Math.PI });
    m.dropSites.push({ x: (pier.tx - 19) * TILE, y: (pier.ty + 1.5) * TILE, name: 'the end of the public pier' });
  }
  // a beach volleyball court on the widest sand
  let court = null;
  for (let ty = 440; ty < 620 && !court; ty += 2) for (let tx = 566; tx < 640; tx += 2) {
    let ok = true;
    for (let y = ty - 2; y < ty + 10 && ok; y++) for (let x = tx - 2; x < tx + 18; x++) { const i = y * W + x; if (m.tiles[i] !== T.SAND || m.dist[i] !== 10) { ok = false; break; } }
    if (ok) court = [tx, ty];
  }
  if (court) volleyCourt(m, 'Sunset Beach Volleyball', court[0], court[1], 16, 8);
  void rand;
}

// Dry Creek: crop fields either side of the railway, the farm co-op on the farm road, woods.
function buildFarm(m, rand) {
  const W = MAP_W;
  const fields = [[1056, 548, 30, 40], [1100, 548, 34, 40], [1056, 594, 32, 40], [1100, 594, 34, 46], [1160, 560, 40, 30], [1146, 600, 50, 34], [1060, 640, 26, 36]];
  for (const [fx, fy, fw, fh] of fields) {
    let n = 0;
    for (let y = fy; y < fy + fh; y++) for (let x = fx; x < fx + fw; x++) {
      const i = y * W + x;
      if (m.zone[i] === Z.EAST && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !m.reserve[i] && m.distSea[i] > 6 * 4) { m.tiles[i] = T.FIELD; n++; }
    }
    if (n > 200) m.fields.push({ x: fx * TILE, y: fy * TILE, w: fw * TILE, h: fh * TILE });
  }
  const pf = PREFABS.house2;
  const fx = 1160, fy = 534;
  m.fill(fx - 4, fy - 1, pf.tw + 8, pf.th + 2, T.DIRT);
  const row = { d: 9, x: fx, y: fy, w: pf.tw, h: pf.th, face: 'N' };
  placePrefab(m, row, 'house2', fx, { biz: ['farm'], names: ['Dry Creek Farm Co-op'] }, rand);
  driveway(m, fx + 3, 2, fy - 2, -1);
  const farm = m.pois.find((p) => p.kind === 'farm');
  farm.cargoPad = { x: (fx - 2.5) * TILE, y: (fy + 3) * TILE };
  // the drop site out in the boonies, and woods
  m.dropSites.push({ x: 1200 * TILE, y: 650 * TILE, name: 'the Dry Creek boonies' });
}

// Wild ground everywhere that isn't built: woods on green land, scrub and rocks in the desert,
// palms on beaches. Kept sparse so the prop list stays light.
function buildWilds(m, rand) {
  const W = MAP_W;
  const { cls, cw } = m.terrainCls;
  for (let ty = 2; ty < MAP_H - 2; ty += 3) for (let tx = 2; tx < W - 2; tx += 3) {
    const i = ty * W + tx;
    const z = m.zone[i];
    if (z !== Z.WILD && z !== Z.EAST) continue;
    if (m.reserve[i] || m.fields.some((f) => tx * TILE >= f.x - 32 && tx * TILE < f.x + f.w + 32 && ty * TILE >= f.y - 32 && ty * TILE < f.y + f.h + 32)) continue;
    const t = m.tiles[i];
    if (t !== T.GRASS && t !== T.DIRT && t !== T.SAND) continue;
    let nearRoad = false;
    for (let dy = -2; dy <= 2 && !nearRoad; dy++) for (let dx = -2; dx <= 2; dx++) { const q = m.tileAt(tx + dx, ty + dy); if (q === T.ROAD || q === T.BRIDGE || q === T.BUILDING || q === T.FIELD || q === T.LOT) { nearRoad = true; break; } }
    if (nearRoad) continue;
    const c = cls[((ty / 4) | 0) * cw + ((tx / 4) | 0)];
    const h = hash2(tx, ty, 61);
    const x = (tx + 0.5 + (hash2(tx, ty, 3) - 0.5)) * TILE, y = (ty + 0.5 + (hash2(tx, ty, 4) - 0.5)) * TILE;
    if (t === T.SAND) { if (h < 0.025) addProp(m, ['palm_a', 'palm_b', 'palm_d'][Math.floor(h * 120) % 3], x, y, 10); continue; }
    if (c === 2) { if (h < 0.22) addProp(m, h < 0.16 ? (h < 0.08 ? 'tree_a' : 'tree_b') : 'shrub_b', x, y, h < 0.16 ? 12 : 0); }
    else if (c === 1) { if (h < 0.035) addProp(m, h < 0.02 ? 'tree_b' : 'bush_c', x, y, h < 0.02 ? 12 : 0); }
    else if (c === 3) { if (h < 0.02) addProp(m, h < 0.01 ? 'rubble' : 'bush_a', x, y, 0); }
    else if (c === 4) { if (h < 0.04) addProp(m, 'gravel', x, y, 0); }
  }
  void rand;
}

function buildStreetProps(m) {
  const doorsNear = new Set();
  for (const p of m.pois) doorsNear.add(`${Math.floor(p.x / TILE)},${Math.floor(p.y / TILE)}`);
  const W = MAP_W;
  for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < W - 1; tx++) {
    if (m.tiles[ty * W + tx] !== T.SIDEWALK) continue;
    if (m.deck[ty * W + tx]) continue; // nothing tall under the highway
    const isRoad = (a, b) => { const q = m.tileAt(a, b); return q === T.ROAD || q === T.BRIDGE; };
    const nearRoad = isRoad(tx + 1, ty) || isRoad(tx - 1, ty) || isRoad(tx, ty + 1) || isRoad(tx, ty - 1);
    const d = DISTRICTS[m.dist[ty * W + tx]];
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
    // inner sidewalk ring: district dressing (the rough end of town gets litter and junk)
    if (h < (d.tier === 'rough' || d.tier === 'low' ? 0.08 : 0.05)) {
      const pool = {
        houses: ['tree_a', 'shrub_a', 'mailbox', 'bush_a'], apartments: ['tree_b', 'bench_a', 'bush_b', 'trashcan'], civic: ['tree_a', 'bench_b', 'planter_sq'],
        towers: ['planter_sq', 'bench_m', 'news_a', 'news_b', 'trashcan', 'palm_s'], commercial: ['news_c', 'trashcan', 'bench_a', 'planter_g', 'bikerack'],
        nightlife: ['palm_s', 'palm_d', 'trashcan', 'news_b', 'foodcart'], industrial: ['dump_g', 'drum', 'pallet_s', 'cone', 'bags'],
        southside: ['bags', 'dump_o', 'tires', 'shrub_b', 'rubble'], harbor: ['drum', 'pallet', 'spool', 'dump_b'], factory: ['dump_g', 'drum', 'pallet_s', 'cone', 'tires'], park: ['tree_a', 'bench_a', 'shrub_a'],
        luxury: ['palm_s', 'planter_sq', 'flowers_a', 'tree_a', 'bench_m'], redlight: ['trashcan', 'bags', 'news_b', 'dump_o', 'palm_s'], oldtown: ['trashcan', 'bags', 'mailbox', 'dump_g', 'news_c', 'tires'],
        beach: ['palm_a', 'palm_d', 'bench_m', 'umbrella_y', 'trashcan'],
      }[d.style] || ['trashcan'];
      const t = pool[Math.floor(hash2(tx, ty, 5) * pool.length)];
      addProp(m, t, x, y, t.startsWith('tree') || t.startsWith('dump') ? 10 : 0);
    }
  }
}

function buildCameras(m, rand) {
  const lit = m.nodes.filter((n) => n.light && n.lvl === 0);
  const picks = [];
  // spread cameras: prefer avenue crossings in each district
  for (let d = 0; d < DISTRICTS.length; d++) {
    const inD = lit.filter((n) => m.districtAt(n.x, n.y).id === d);
    if (!inD.length) continue;
    picks.push(inD[Math.floor(rand() * inD.length)]);
    if ((d === 4 || d === 1) && inD.length > 2) picks.push(inD[Math.floor(rand() * inD.length)]);
  }
  for (const n of picks) m.cameras.push({ id: m.cameras.length, x: n.x + Math.min(n.half, 200) + 20, y: n.y - Math.min(n.half, 200) - 20, r: 300 });
}
