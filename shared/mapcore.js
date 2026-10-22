// The map's runtime: what reads a built city - the CityMap class and its methods, the tile tables (PED_BLOCK...),
// SURFACE, DISTRICTS, ISLANDS, the queries (isSwimming, nearestLand, isTurf, waterKind...), the trains' constants,
// mapSignature, cityData / cityFromData. The page imports this, never the generator: the city comes from the server
// or the browser's copy (client/worldgen.js), and the generator (shared/map.js, with naturesites.js, worldmask.js,
// countryside.js, islands.js, metro.js, citylayout.js) loads only where a city is built. shared/map.js re-exports all
// of this, so what imports it from there (the server, the tools, the tests) is unchanged. Moved here from map.js as it
// was (test/perf.test.js: no generator module in the page's code).
//
// Deterministic like the generator (CLAUDE.md): nothing computed while this module loads uses Math.sin & co.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { hash2 } from './rng.js';
import { Z } from './layoutcore.js';
import { TERRAIN_CELL } from './worldmask-dims.js';
import { coverAtPx } from './tunnels.js';
import { EDGE_OUT } from './border.js';
import { barsRay } from './cells.js';
const EDGE_T = Math.ceil(EDGE_OUT / TILE) + 2;   // tiles of open sea past the map's edge (border.js), then the wall

// Islands / parts of the world shown in the tour and on the map. box: tile rect [x0, y0, x1, y1)
// (filled in by the generator from the zone map); zone: the map.zone value.
export const ISLANDS = {
  D: { name: 'Metro City', box: [559, 251, 1045, 745], zone: Z.CITY },
  R: { name: 'Southbank', box: [770, 655, 1045, 900], zone: Z.SOUTH },
  F: { name: 'Dry Creek', box: [1045, 251, 1296, 958], zone: Z.EAST },
  P: { name: 'Pelican Key', box: [542, 305, 682, 403], zone: Z.KEY },
  C: { name: "Smuggler's Rock", box: [1205, 953, 1259, 1004], zone: Z.ROCK, boatOnly: true, gang: 'syndicate' },
  W: { name: 'Westport', box: [31, 71, 497, 917], zone: Z.WEST },
  N: { name: 'Northshore', box: [459, 17, 1207, 287], zone: Z.NORTH },
  S: { name: 'Cedar Isle', box: [270, 784, 991, 1158], zone: Z.ISLE },
  G: { name: 'Gull Isles', box: [40, 939, 1197, 1142], zone: Z.GULL, boatOnly: true },
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
// ROCK_BLOCK: where a sure-footed animal can't go (a mountain goat: server/systems/wildlife.js) - as PED_BLOCK, but the
// wilds' bare rock (WALL flagged 32: the cliffs, crags and scree a person can't climb) is its ground (physics.js blockedAt)
export const ROCK_BLOCK = PED_BLOCK.slice();
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
  { id: 8, name: 'Harbor', isl: 'Metro City', style: 'harbor', tier: 'industrial', walk: 'concrete', plaza: 'brick', road: 'asphalt_worn', ground: T.LOT, turf: false },
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
  { id: 19, name: 'Lighthouse Rock', isl: '', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 20, name: 'The Islets', isl: '', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 21, name: 'The Islets', isl: '', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 22, name: 'Gull Isles', isl: 'Gull Isles', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 23, name: 'Westport Center', isl: 'Westport', style: 'towers', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 24, name: 'Lakeview', isl: 'Westport', style: 'luxury', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 25, name: 'Stadium District', isl: 'Westport', style: 'commercial', tier: 'mid', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 26, name: 'Port Westport', isl: 'Westport', style: 'harbor', tier: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: true },
  { id: 27, name: 'Westport International', isl: 'Westport', style: 'airport', tier: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.LOT, turf: false },
  { id: 28, name: 'West Hills', isl: 'Westport', style: 'houses', tier: 'suburb', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 29, name: 'Highland Woods', isl: 'Westport', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 30, name: 'Old Quarter', isl: 'Westport', style: 'oldtown', tier: 'low', walk: 'brick', plaza: 'brick', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 31, name: 'Northshore', isl: 'Northshore', style: 'commercial', tier: 'mid', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 32, name: 'North Point', isl: 'Northshore', style: 'apartments', tier: 'mid', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 33, name: 'Granite Peaks', isl: 'Northshore', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 34, name: 'The Bluffs', isl: 'Northshore', style: 'luxury', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 35, name: 'Cedar Falls', isl: 'Cedar Isle', style: 'houses', tier: 'suburb', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 36, name: 'Falls Center', isl: 'Cedar Isle', style: 'commercial', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 37, name: 'Lake District', isl: 'Cedar Isle', style: 'luxury', tier: 'lux', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 38, name: 'Cedar Farms', isl: 'Cedar Isle', style: 'rural', tier: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 39, name: 'South Port', isl: 'Cedar Isle', style: 'harbor', tier: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 40, name: 'Cedar Hills', isl: 'Cedar Isle', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false },
  { id: 41, name: 'Dry Creek Desert', isl: 'Dry Creek', style: 'desert', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false },
  { id: 42, name: 'Dry Creek Airstrip', isl: 'Dry Creek', style: 'airport', tier: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 43, name: 'Gull Harbor', isl: 'Gull Isles', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 44, name: 'Coral Cay', isl: 'Gull Isles', style: 'beach', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
  { id: 45, name: 'Paradise Cay', isl: '', style: 'wild', tier: 'wild', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.SAND, turf: false },
  // where Bayside Heights' crescents used to wheel round a green: galleries, studios, cafes and lofts in painted brick
  // between the Civic Center and the bay, the Metro Museum of Art and The Playhouse among them
  { id: 46, name: 'Arts District', isl: 'Metro City', style: 'arts', tier: 'mid', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.PLAZA, turf: false },
];
// World v3's (docs/WORLD-V3.md 8.3, shared/world3-land.js DISTRICTS3): the mainland round today's places, Prison Island
// and the Egret Rocks - only a v3 build paints them
for (const [name, isl, style, tier, g] of [['Highland Woods', 0, 'wild', 'wild', 'G'], ['Granite Peaks', 0, 'wild', 'wild', 'D'], ['Willow Valley', 0, 'rural', 'rural', 'G'], ['Red Rock Desert', 0, 'desert', 'wild', 'D'], ['North Ridge', 0, 'rocky', 'wild', 'D'], ['Sandpiper Coast', 0, 'beach', 'mid', 'S'], ['Egret Coast', 0, 'wild', 'wild', 'G'], ['Northshore Beaches', 'Northshore', 'beach', 'mid', 'S'], ['Prison Island', 0, 'rocky', 'rough', 'D'], ['Egret Rocks', 'Egret Coast', 'rocky', 'wild', 'D']]) {
  const b = style === 'beach';
  DISTRICTS.push({ id: DISTRICTS.length, name, isl: isl || name, style, tier, walk: b ? 'brick' : 'concrete', plaza: b ? 'brick' : 'concrete', road: b ? 'asphalt' : 'asphalt_worn', ground: g === 'G' ? T.GRASS : g === 'S' ? T.SAND : T.DIRT, turf: false });
}
// World v3's first mainland towns (docs/WORLD-V3.md 8.13, shared/world3-towns.js): 57-59, only a v3 build paints them
for (const [name, isl, style, tier] of [['Timber Bend', 'Highland Woods', 'oldtown', 'rural'], ['Willow Crossing', 'Willow Valley', 'oldtown', 'rural'], ['Sandpiper Bay', 'Sandpiper Coast', 'beach', 'mid']]) {
  const b = style === 'beach';
  DISTRICTS.push({ id: DISTRICTS.length, name, isl, style, tier, walk: b ? 'brick' : 'concrete', plaza: b ? 'brick' : 'concrete', road: b ? 'asphalt' : 'asphalt_worn', ground: b ? T.SAND : T.GRASS, turf: false });
}
// World v3's casino city, Lucky Mesa (docs/WORLD-V3.md 8.15, shared/world3-mesa.js): 60-62, only a v3 build paints them
for (const [name, style, tier, ground] of [['The Strip', 'nightlife', 'lux', T.PLAZA], ['Old Downtown', 'nightlife', 'low', T.PLAZA], ['Mesa Flats', 'houses', 'suburb', T.DIRT]]) {
  DISTRICTS.push({ id: DISTRICTS.length, name, isl: 'Red Rock Desert', style, tier, walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground, turf: false });
}
// World v3's mining town and ghost town in the Red Rock Desert (docs/WORLD-V3.md 8.18, shared/world3-desert.js): 63-64,
// only a v3 build paints them (Dusty Hollow a desert district: the generator builds nothing there, its ruins are built whole)
for (const [name, style, tier] of [['Copper Gulch', 'oldtown', 'low'], ['Dusty Hollow', 'desert', 'wild']]) {
  DISTRICTS.push({ id: DISTRICTS.length, name, isl: 'Red Rock Desert', style, tier, walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.DIRT, turf: false });
}
// 65: World v3's fishing village (8.20, shared/world3-west.js: built whole)
DISTRICTS.push({ id: DISTRICTS.length, name: 'Egret Point', isl: 'Egret Coast', style: 'wild', tier: 'low', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: false });
export const WATER_D = 13;   // (the open sea's district: the generator's too)
// Districts nobody builds in: woods, hills, mountains, farmland, desert, airfields.
export const WILD_STYLES = new Set(['wild', 'rural', 'desert', 'airport', 'water', 'rocky']);
export const WILD_DISTRICTS = new Set(DISTRICTS.filter((d) => WILD_STYLES.has(d.style)).map((d) => d.id));

// ---------------------------------------------------------------------------
export class CityMap {
  constructor(seed, w = MAP_W, h = MAP_H) {
    this.seed = seed >>> 0;
    // its extent in world tiles: x0, y0 (0: on the prototype), w, h - the frame it's built in; a window: shared/mapwindow.js
    this.w = w; this.h = h;
    const N = this.w * this.h;
    this.tiles = new Uint8Array(N);
    this.dist = new Uint8Array(N).fill(WATER_D);
    this.zone = new Uint8Array(N);
    this.river = new Uint8Array(N);       // 1 = river water (fishing, bridges)
    this.reserve = new Uint8Array(N);     // bit flags: 1 highway band, 2 railway, 4 waterfront strip, 8 under a ramp, 16 kept open (Pelican Key beach),
                                           // 32 a designed nature place (naturesites.js), 64 jungle floor (Coral Cay)
    this.deck = new Uint8Array(N);        // 1 = under the elevated highway
    this.lvl0Block = new Uint8Array(N);   // 1 = solid at ground level (a ramp's embankment)
    this.roadAxis = new Uint8Array(N);    // bit1 vertical-ish road, bit2 horizontal-ish, 3 = junction box
    this.roadRank = new Uint8Array(N);    // 1 = an alley's asphalt, 2 = any other road's (a street wins where they meet), 3 = a highway's at grade (no lot fronts it)
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
    this.brickWalls = [];                            // brick walls along the street between buildings: { tx, ty, tw }
    this.fields = [];
    this.roofs = [];
    this.hospitals = [];
    this.spawns = {};
    this.pillars = [];
  }
  // a tile's index in the layers: idx === row(ty) + col(tx) (a loop along a row takes row(ty) once; never step with i++)
  idx(tx, ty) { return (ty - this.y0) * this.w + (tx - this.x0); }
  row(ty) { return (ty - this.y0) * this.w; }
  col(tx) { return tx - this.x0; }
  inside(tx, ty) { return tx >= this.x0 && ty >= this.y0 && tx < this.x0 + this.w && ty < this.y0 + this.h; }
  // Past the world's edge: open sea for a way (softEdge, set once the world is built: border.js slows you there and
  // stops you at its end), then a wall. While the world is being built, a wall right at the edge, as it always was.
  // Outside a window, inside the world: a wall.
  tileAt(tx, ty) {
    if (!this.inside(tx, ty)) {
      if (!this.softEdge) return T.WALL;
      const F = this.frame;   // (the world's frame, which a window carries: past its edge, the open sea)
      return (tx < 0 || ty < 0 || tx >= F.w || ty >= F.h) && tx >= -EDGE_T && ty >= -EDGE_T && tx < F.w + EDGE_T && ty < F.h + EDGE_T ? T.DEEP : T.WALL;
    }
    return this.tiles[this.idx(tx, ty)];
  }
  tileAtPx(x, y) { return this.tileAt(Math.floor(x / TILE), Math.floor(y / TILE)); }
  set(tx, ty, t) { if (this.inside(tx, ty)) this.tiles[this.idx(tx, ty)] = t; }
  fill(tx, ty, w, h, t) { for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.set(x, y, t); }
  setDist(tx, ty, w, h, d) {
    const x1 = Math.min(this.x0 + this.w, tx + w);
    for (let y = Math.max(this.y0, ty); y < Math.min(this.y0 + this.h, ty + h); y++) { const r = this.row(y); for (let x = Math.max(this.x0, tx); x < x1; x++) this.dist[r + this.col(x)] = d; }
  }
  districtAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.inside(tx, ty)) return DISTRICTS[WATER_D];
    return DISTRICTS[this.dist[this.idx(tx, ty)]];
  }
  zoneAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.inside(tx, ty)) return Z.SEA;
    return this.zone[this.idx(tx, ty)];
  }
  // Which island / part of the world a point is in (ISLANDS key) or null at sea.
  islandAt(x, y) {
    const z = this.zoneAt(x, y);
    for (const [k, I] of Object.entries(ISLANDS)) if (I.zone === z) return k;
    return null;
  }
  buildingAtPx(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!this.inside(tx, ty)) return null;
    const b = this.bld[this.idx(tx, ty)];
    return b >= 0 ? this.buildings[b] : null;
  }
  addSolidProp(x, y, r) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const k = this.idx(tx, ty);
    let arr = this.solidProps.get(k);
    if (!arr) { arr = []; this.solidProps.set(k, arr); }
    const e = { x, y, r, pi: -1, off: false };
    arr.push(e);
    return e;
  }
  // Line of sight across tiles (buildings block sight; a cell's bars don't).
  los(x1, y1, x2, y2) { return this.rayTiles(x1, y1, x2, y2, true) >= 1; }
  // Ray to first blocking tile; returns distance fraction t in [0,1] (1 = no hit). A bullet (not sight) stops on the
  // bars of a police station's cells too (shared/cells.js).
  rayTiles(x1, y1, x2, y2, sight = false) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    if (d < 1) return 1;
    const tb = !sight && this.cellBlocks ? barsRay(this, x1, y1, x2, y2) : 1;
    const steps = Math.ceil(d / 8);
    const cv = sight ? this.cover : null, c0 = cv ? coverAtPx(this, x1, y1) : 0;   // (sight doesn't cross a tunnel's roof: shared/tunnels.js)
    for (let i = 1; i <= steps && i / steps <= tb; i++) {
      const t = i / steps, px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      const tt = this.tileAtPx(px, py);
      if (tt === T.BUILDING || tt === T.WALL || (cv && coverAtPx(this, px, py) !== c0)) return Math.max(0, (i - 1) / steps);
    }
    return tb;
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
      if (!p || (kind && p.kind !== kind)) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d <= p.r * p.r && d < bd) { bd = d; best = p; }
    }
    return best;
  }
  poisOf(kind) { return this.pois.filter((p) => p.kind === kind); }
}
// (on the prototype: the whole map's data - the world hash, the kept city - has no new fields; a window has its own)
CityMap.prototype.x0 = 0;
CityMap.prototype.y0 = 0;
// The world's frame { w, h } (tiles, origin 0, 0): what "the whole world" means - its edge (the open sea past it,
// border.js), the camera's bounds, the chunk grids, the map pictures. A whole map's frame is its own extent (kept on
// it, unlisted, once asked: the city as data has no new field); a window (mapwindow.js) carries the world's.
Object.defineProperty(CityMap.prototype, 'frame', {
  get() { const f = { w: this.x0 + this.w, h: this.y0 + this.h }; Object.defineProperty(this, 'frame', { value: f, writable: true, configurable: true, enumerable: false }); return f; },
  set(f) { Object.defineProperty(this, 'frame', { value: f, writable: true, configurable: true, enumerable: true }); },
  configurable: true,
});

// Swimming: in open water, or under a bridge deck having swum in. Up on the highway deck you
// are never swimming, whatever is below.
export function isSwimming(map, ped) {
  if ((ped.lz || 0) > 0.35 || ped.sky) return false;   // (sky: falling from an aircraft, up over it - server skydive.js)
  const t = map.tileAtPx(ped.x, ped.y);
  return WATER_T[t] === 1 || (t === T.BRIDGE && !!ped.under);
}

// Soaking: swimming in one of the hot springs' pools (map.springs ellipses, Granite Hot Springs).
export function inHotSpring(map, ped) {
  const sp = map.springs;
  if (!sp || ped.vehId) return false;
  for (const s of sp) {
    const dx = (ped.x - s.x) / s.rx, dy = (ped.y - s.y) / s.ry;
    if (dx * dx + dy * dy <= 1) return isSwimming(map, ped);
  }
  return false;
}

// Nearest walkable land to a point (for swimmers heading ashore), ring search in tiles.
export function nearestLand(map, x, y, maxTiles = 24, skip = null) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r <= maxTiles; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t = map.tileAt(cx + dx, cy + dy);
      if (PED_BLOCK[t] || t === T.BRIDGE || t === T.DOCK) continue; // a pier stands up out of the water: swim for real shore
      if (skip && skip.has(map.idx(cx + dx, cy + dy))) continue; // tried that bit of shore: couldn't get up there
      const px = (cx + dx + 0.5) * TILE, py = (cy + dy + 0.5) * TILE, d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bd) { bd = d; best = { x: px, y: py }; }
    }
    if (best) return best;
  }
  return null;
}

// Syndicate gang territory: The Yards, Southside and Smuggler's Rock (whole districts).
export function isTurf(map, x, y) {
  if (!map) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!map.inside(tx, ty)) return false;
  return !!DISTRICTS[map.dist[map.idx(tx, ty)]].turf;
}

// Fishing water: 'river', 'deep' sea or 'shore' shallows.
export function waterKind(map, tx, ty) {
  if (!map.inside(tx, ty)) return 'deep';   // (out past the map's edge)
  const i = map.idx(tx, ty);
  if (map.river[i]) return 'river';
  return map.tiles[i] === T.DEEP ? 'deep' : 'shore';
}

// The world as plain data (what a worker sends or the browser's cache keeps: a structured clone keeps no methods
// and no functions) - and back. client/worldgen.js builds the city off the page's thread and keeps it.
export function cityData(m) {
  const o = {};
  for (const k of Object.keys(m)) if (typeof m[k] !== 'function') o[k] = m[k];
  return o;
}
export function cityFromData(o) {
  Object.setPrototypeOf(o, CityMap.prototype);
  // (what the nature sites hang on it, which a clone drops: the wild biome at a tile)
  if (o.terrainCls && !o.terrainCls.at) Object.defineProperty(o.terrainCls, 'at', { value: (tx, ty) => wildBiome(o.dist[o.idx(tx, ty)], terrainAt(o.terrainCls.cls, o.terrainCls.cw, tx, ty)), enumerable: false });
  return o;
}

// The wild terrain class at a tile: the 4x4-tile cells of the map concept, sampled through a
// wobble of smooth and fine noise so the patches of desert, rock and forest get ragged, natural
// edges instead of square blocks.
export function terrainAt(cls, cw, x, y) {
  const n1 = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) + Math.sin(y * 0.13 + Math.sin(x * 0.05) * 2);
  const n2 = Math.sin(x * 0.09 - y * 0.05 + 1.7) + Math.cos(y * 0.1 + x * 0.04);
  const jx = x + n1 * 3.2 + (hash2(x, y, 11) - 0.5) * 3, jy = y + n2 * 3.2 + (hash2(x, y, 13) - 0.5) * 3;
  const cx = Math.max(0, Math.min(cw - 1, Math.floor(jx / TERRAIN_CELL))), ch = Math.floor(cls.length / cw);
  const cy = Math.max(0, Math.min(ch - 1, Math.floor(jy / TERRAIN_CELL)));
  return cls[cy * cw + cx];
}

// ---- the railway's rolling stock (map.js lays the line: railLine, buildRailway) ------------------------------
export const RAIL_GAUGE = 52;         // px between the outer rails' ties (track bed width ~2 tiles)
// Rolling stock (wire index = position here). Coaches: seat rows either side of the aisle, doors
// in the middle; the mail car carries the strongbox at its back end. The front car ('loco') is a
// cab car: the driver's cab in the nose, closed off by a bulkhead, and seats behind it like a coach.
export const TRAIN_CARS = [
  { kind: 'loco', name: 'Front car', L: 196, W: 76 },
  { kind: 'coach', name: 'Passenger coach', L: 212, W: 76 },
  { kind: 'mail', name: 'Mail car', L: 188, W: 76 },
];
// What a train is made of (by kind; every third train swaps its last coach for the mail car).
export const CONSIST = ['loco', 'coach', 'coach']; // short enough to stand between two streets at a station
export const CAR_GAP = 10;               // px between coupled cars
export const TRAIN_LEN = CONSIST.reduce((a, k) => a + TRAIN_CARS.find((c) => c.kind === k).L, 0) + CAR_GAP * (CONSIST.length - 1);
export const COACH_SEATS = [-84, -60, -36, 36, 60, 84].flatMap((ox) => [[ox, -23], [ox, 23]]);
export const COACH_STAND = [[-7, -18], [7, -18], [-7, 18], [7, 18], [-72, 0], [-48, 0], [48, 0], [72, 0]];
export const CAB_OX = 50;                                 // the front car's cab bulkhead (riders stay behind it)
export const LOCO_SEATS = [-84, -60, -36, 36].flatMap((ox) => [[ox, -23], [ox, 23]]);
export const LOCO_STAND = [[-7, -18], [7, -18], [-7, 18], [7, 18], [-72, 0], [-48, 0], [22, 0]];
export const MAIL_BOX = { ox: -58, oy: 0 };              // the strongbox (towards the back of the mail car)
export const MAIL_POSTS = [[40, -18], [40, 18]];          // where the guards stand
export const CROSSING_ARM = 66;                          // gate arms this far either side of the track centre

// A station's route board (the owner, 10-16: "An information board or map sign at stations showing where the train
// goes"): on an open-air platform, near its back edge towards one end - past the canopy, clear of the footbridge and
// the name sign in the middle - where the ground's the platform's: { x, y }, or null (a subway's, the El's, or a street
// there). tileAt(x, y): the tile at a world px. client/art2/game/statics.js draws it; server/systems/trains.js reads it.
// (up on the El's platform, st.deck: past its east canopy, up at the deck - { x, y, el: true })
export const ROUTE_BOARD_OFF = 92, ROUTE_BOARD_ALONG = -0.8, ROUTE_BOARD_EL = 330;
export function routeBoardAt(rail, st, tileAt) {
  if (st && st.deck) return { x: Math.round((st.deck.x0 + st.deck.x1) / 2 + ROUTE_BOARD_EL), y: Math.round(st.deck.y + 6), el: true };
  if (!st || st.under || st.el || !rail || !rail.pts) return null;
  const q = railAt(rail, st.s + ROUTE_BOARD_ALONG * (st.half || 112)), sd = st.side || 1;
  const x = q.x - Math.sin(q.a) * sd * ROUTE_BOARD_OFF, y = q.y + Math.cos(q.a) * sd * ROUTE_BOARD_OFF, t = tileAt(x, y);
  // (on the platform wherever it's drawn: not where a street, a building or a bridge cuts it - and at an angle to the grid
  // the platform is drawn over the ground under it, paved or not: shared/map.js buildRailway)
  return t !== T.ROAD && t !== T.BUILDING && t !== T.WALL && t !== T.BRIDGE && t !== T.WATER && t !== T.DEEP ? { x: Math.round(x), y: Math.round(y) } : null;
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
  // (World v3's El, shared/world3-rail.js EL: the track up on its viaduct is `under` to the generator but not below
  // ground - ez, how high it stands, 0..1 of its deck's height)
  const ez = (a.ez || 0) + ((b.ez || 0) - (a.ez || 0)) * t;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x), under: !!(a.under && b.under && !a.elevated && !b.elevated), ez, i: lo };
}

// Street furniture vehicles can smash through. Heavy items slow the car more; everything not
// listed (fountains, dumpsters, ATMs, market stalls, flat beds) stays put.
export const BREAKABLE = new Set([
  'tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c',
  'hydrant', 'hydrant_y', 'trashcan', 'bench_a', 'bench_b', 'bench_m', 'pbench', 'planter_sq', 'planter_g', 'planter_fl', 'potted',
  'news_a', 'news_b', 'news_c', 'mailbox', 'vend_a', 'vend_cola', 'vend_c', 'bikerack', 'cone', 'barrier', 'drum', 'pallet', 'pallet_b',
  'pallet_s', 'umbrella_r', 'umbrella_b', 'umbrella_g', 'umbrella_y', 'lamp', 'foodcart', 'foodcart_b', 'tires', 'bags', 'spool',
  'lumber', 'planks', 'flowers_a', 'flowers_big', 'pipes', 'wheelbarrow', 'sandbags', 'cart', 'produce_a', 'produce_b', 'cactus', 'sigpole',
  'dump_g', 'dump_b', 'dump_o', 'dumpster_s', 'dumpster_m', 'busstop', 'phonebox', 'bollard', 'crates', 'acunit', 'trashpile', 'atm', 'billboard',
  'tent', 'picnic', 'upole', 'dspeaker', 'scope',
]);
export const HEAVY_PROPS = new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'lamp', 'vend_a', 'vend_cola', 'vend_c', 'spool', 'sandbags', 'hydrant', 'hydrant_y', 'sigpole', 'dump_g', 'dump_b', 'dump_o', 'dumpster_s', 'dumpster_m', 'busstop', 'phonebox', 'acunit', 'billboard', 'upole']);

// The terrain class a wild district really grows: the little sea islands (Lighthouse Rock, the Islets) are never
// desert (grassland where the terrain says dry), and Granite Peaks is mountain where it says dry.
export const SEA_ISLES = new Set([19, 20]);
// (Highland Woods is old-growth redwood forest throughout: its meadow, rock and desert patches are forest too -
// only the water and the beaches keep their own)
export const wildBiome = (d, c) => (d === 29 ? (c === 0 || c === 5 ? c : 2) : c === 3 ? (SEA_ISLES.has(d) ? 1 : d === 33 ? 4 : c) : c);

// A fingerprint of the generated world (tiles, props, solid furniture, gates, homes, the railway).
// The server sends its own in the welcome; a browser still running the previous build after an
// update gets a different one and reloads, instead of walking into walls only the server can see.
export function mapSignature(m) {
  if (m._sig) return m._sig;
  let h = 0x811c9dc5;
  const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0; };
  for (let i = 0; i < m.tiles.length; i += 3) mix(m.tiles[i]);
  for (const n of [m.props.length, m.pois.length, m.homes.length, (m.gates || []).length, m.rail ? m.rail.pts.length : 0, m.edges.length]) { mix(n); mix(n >> 8); mix(n >> 16); }
  for (const [, arr] of m.solidProps) for (const e of arr) { mix(e.x | 0); mix(e.y | 0); mix(e.r | 0); }
  m._sig = h.toString(36);
  return m._sig;
}
