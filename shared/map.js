// Deterministic world generator + tile queries. Server and client both call generateCity(seed)
// and get byte-identical maps, so the map is never sent over the wire.
//
// The world follows the world map concept (tools/data/worldmap-concept.webp, one pixel = one
// tile). On the central island stands Metro City (citylayout.js and metro.js for the plan): avenues,
// each district's own real-sized blocks, Broadway on the diagonal, an elevated ring highway with slip ramps, curving coast and river
// drives, wealth tiers that blend into each other from the downtown towers and Bayside Heights'
// crescents to the rough Yards and Southside; across the river the winding streets of Southbank,
// east of town the farms and desert of Dry Creek. Around it (islands.js): Westport with its port
// and international airport on the west island, Northshore under the Granite Peaks in the north,
// Cedar Isle in the south, the little town on Pelican Key, all joined by highways over long
// bridges; the Gull Isles villages and Smuggler's Rock are reached by boat.
//
// Roads are polylines at any angle (roads.js); tiles are rasterized from them for collision and
// surfaces, and the renderer draws the roads as curves.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { PREFABS } from './prefab-data.js';
import { LAND, TERRAIN, TERRAIN_CELL } from './worldmask.js';
import { buildNetwork, stampEdge, stampLine, edgeZ, ROAD_KINDS, sidewalkPx } from './roads.js';
import { measure, pointAt, rounded, project, cubic, quad, segX } from './geom.js';
import {
  Z, BAND, PARK, CRESCENT, SEEDS,
  clipLine, offsetLoop, contours, smoothLine, ringLine, rampSites, slipRamp, acrossWater,
} from './citylayout.js';
import { metroRoads } from './metro.js';
import { buildLevels } from './levels.js';
import { islandRoads, ISLAND_SEEDS, LAKES, PARKS, AIRPORTS, FIELDS, ISLAND_ESTATES, FARM_STANDS, RINGS, SCENE_SPOTS, SCENE_ISLANDS } from './islands.js';
import { SCENE_MASKS } from './interior-art.js';
import { ROAD_RANK } from './roads.js';
import { countrysideRoads, buildCountryside, buildPowerLines, runwayLights } from './countryside.js';
import './props2.js'; // code-drawn street furniture: its sizes join PROP_SIZES

export { Z };

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
// Which land component is which part of the world: a land point on each.
const ISLAND_AT = [[[300, 500], Z.WEST], [[800, 150], Z.NORTH], [[620, 1000], Z.ISLE], [[120, 1020], Z.GULL], [[1120, 1070], Z.GULL], [[600, 360], Z.KEY], [[1230, 978], Z.ROCK]];

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
];
const WATER_D = 13;
// Districts nobody builds in: woods, hills, mountains, farmland, desert, airfields.
export const WILD_STYLES = new Set(['wild', 'rural', 'desert', 'airport', 'water', 'rocky']);
export const WILD_DISTRICTS = new Set(DISTRICTS.filter((d) => WILD_STYLES.has(d.style)).map((d) => d.id));

// Subdivision + fill parameters per style. gen: generic prefab weights.
const STYLE = {
  houses: { minW: 16, minH: 18, gen: { house1: 3, house2: 3, house3: 3, apt2: 0.6, rest2: 0.3, house4: 2, house5: 2, house7: 2.5, house8: 2.5, house9: 2.5 }, filler: 'park', roof: 0.06, roofKinds: ['tile'] },
  commercial: { minW: 12, minH: 12, gen: { shops1: 0.6, shops2: 0.6, conv: 3, rest1: 2, rest2: 2, gas: 1, apt1: 1, club: 0.3, tower2: 1, trail: 0.6, boutique: 0.6, quickstop: 0.6, fuel: 0.3, motors: 0.3, bank2: 0.3, liquor: 0.5, diner: 1, arcade: 0.5, tattoo: 0.4, redawning: 0.6, greenbistro: 0.5 }, filler: 'parking', roof: 0.5, roofKinds: ['tar', 'gravel'] },
  apartments: { minW: 14, minH: 14, gen: { apt1: 3, apt2: 3, house2: 1, conv: 1.8, tower2: 1, apt3: 1.5, apt4: 1.5 }, filler: 'park', roof: 0.4, roofKinds: ['tar', 'gravel'] },
  industrial: { minW: 14, minH: 13, gen: { warehouse: 3, industrial: 2, repair: 1, junkyard: 0.6, construction: 0.4 }, filler: 'yard', roof: 0.45, roofKinds: ['metal', 'tar'] },
  factory: { minW: 14, minH: 13, gen: { industrial: 3, warehouse: 2, repair: 1, gas: 0.4, junkyard: 0.5, construction: 0.5 }, filler: 'yard', roof: 0.6, roofKinds: ['metal', 'metal', 'tar'] },
  towers: { minW: 11, minH: 11, gen: { tower1: 3, tower2: 3, apt1: 1, hotel: 1, bank2: 0.5, apt3: 0.5, vellori: 0.6, monarch: 0.6, theatre: 0.4, diamond: 0.5 }, filler: 'plaza', roof: 0.78, roofKinds: ['glass', 'gravel', 'tar'] },
  civic: { minW: 14, minH: 14, gen: { apt1: 1, tower2: 1, house1: 1, conv: 1, rest1: 1, church: 0.3, bank2: 0.6, apt4: 0.5, theatre: 0.5, greenbistro: 0.5, house8: 0.6 }, filler: 'park', roof: 0.35, roofKinds: ['gravel', 'tile'] },
  southside: { minW: 14, minH: 14, gen: { house1: 1, house3: 1, warehouse: 1, industrial: 1, apt2: 1, conv: 0.5, quickstop: 1.6, junkyard: 0.5, house5: 0.6, liquor: 0.8, shanty2: 0.5, shanty3: 0.5, tattoo: 0.4 }, filler: 'yard', roof: 0.3, roofKinds: ['tar', 'metal'] },
  nightlife: { minW: 10, minH: 10, gen: { shops1: 0.6, shops2: 0.6, club: 1, rest1: 1, rest2: 1, hotel: 1, conv: 1, clubnova: 1.4, clubeclipse: 1.4, arcade: 0.8, tattoo: 0.6, theatre: 0.6, diner: 0.6 }, filler: 'plaza', roof: 0.5, roofKinds: ['tar', 'tile', 'gravel'] },
  harbor: { minW: 14, minH: 13, gen: { warehouse: 4, industrial: 1, repair: 1, junkyard: 0.3 }, filler: 'yard', roof: 0.55, roofKinds: ['metal', 'tar'] },
  luxury: { minW: 14, minH: 14, gen: { house1: 2, house2: 2, house3: 1, hotel: 1, rest2: 0.6, tower2: 0.5, house6: 1.5, house4: 1, house5: 1, house9: 1.2, royale: 0.6, diamond: 0.6, crown: 0.5 }, filler: 'park', roof: 0.2, roofKinds: ['tile', 'glass'] },
  redlight: { minW: 12, minH: 12, gen: { shops1: 0.6, shops2: 0.6, club: 1, rest1: 1, conv: 1, hotel: 1, apt2: 1, clubnova: 0.6, clubeclipse: 0.8, quickstop: 0.5, liquor: 0.6, tattoo: 0.8, shanty1: 0.4 }, filler: 'parking', roof: 0.45, roofKinds: ['tar', 'tile'] },
  oldtown: { minW: 12, minH: 12, gen: { shops1: 0.6, shops2: 0.6, apt2: 2, house1: 1, house3: 1, conv: 2, rest1: 1.5, club: 0.3, repair: 0.6, quickstop: 1.4, apt3: 0.6, boutique: 0.4, liquor: 0.8, diner: 0.6, greenbistro: 0.5, house7: 0.6 }, filler: 'yard', roof: 0.5, roofKinds: ['tar', 'tile', 'gravel'] },
  beach: { minW: 14, minH: 14, gen: { house1: 2, house2: 2, rest2: 1.5, rest1: 1, hotel: 0.6, conv: 0.5, beachbar: 1.2, house5: 0.6, house9: 0.8, diner: 0.6 }, filler: 'plaza', roof: 0.15, roofKinds: ['tile'] },
  park: { minW: 14, minH: 14, gen: { rest2: 1 }, filler: 'park', roof: 0, roofKinds: ['tile'] },
};

// Every business the game systems rely on, placed in a specific district (alt: where it goes when its
// own district has no lot big enough - Sunset Beach's strip and the harbor's quays are narrow).
// strip prefabs host one business per storefront door.
const SPECIALS = [
  { d: 5, prefab: 'hospital', biz: ['hospital'], names: ['St. Neon General'] },
  { d: 0, prefab: 'hospital', biz: ['hospital'], names: ['Southbank Medical'] },
  { d: 10, alt: [1], prefab: 'hospital', biz: ['hospital'], names: ['Westside Clinic'] },
  { d: 18, prefab: 'hospital', biz: ['hospital'], names: ['Old Town Infirmary'] },
  { d: 4, prefab: 'police', biz: ['police'], names: ['Metro City PD - HQ'] },
  { d: 0, prefab: 'police', biz: ['police'], names: ['Southbank Precinct'] },
  { d: 4, prefab: 'bank', biz: ['bank'], names: ['First Pixel Bank'] },
  { d: 5, prefab: 'bank', biz: ['courthouse'], names: ['Hall of Justice'] },
  { d: 4, prefab: 'hotel', biz: ['delivery'], names: ['Grand Neon Hotel'] },
  { d: 1, prefab: 'strip', biz: ['gunshop', 'sports', 'hardware', 'clothing'], names: ['Iron Sights Arms', 'Home Run Sports', 'Nail & Gear Hardware', 'Threads Outfitters'] },
  { d: 1, prefab: 'strip', biz: ['grocery'], names: ['FreshHub Grocery'] },
  { d: 1, prefab: 'conv', biz: ['pharmacy'], names: ['MediMart Pharmacy'] },
  { d: 1, prefab: 'rest2', biz: ['coffee'], names: ['Bean Machine Coffee'] },
  { d: 1, prefab: 'dealer', biz: ['dealer'], names: ['Motor Row Dealership'] },
  { d: 1, prefab: 'repair', biz: ['garage'], names: ['Fresh Coat Garage'] },
  { d: 6, prefab: 'strip', biz: ['pawn', 'delivery', 'delivery', 'delivery'], names: ['Second Chance Pawn', 'Lucky Laundromat', 'Cut & Fade', 'Quick Mart 24/7'] },
  { d: 3, prefab: 'club', biz: ['fence'], names: ['Back-Alley Exchange'] },
  { d: 3, prefab: 'construction', biz: ['construction'], names: ['Construction Site'] },
  { d: 8, alt: [3, 6], prefab: 'warehouse', biz: ['warehouse'], names: ['Portside Logistics'] },
  { d: 8, prefab: 'rest1', biz: ['fishmarket'], names: ['Dockside Fish Market'] },
  { d: 8, prefab: 'conv', biz: ['marina'], names: ['Harbor Marina (boats)'] },
  { d: 2, prefab: 'school', biz: ['delivery'], names: ['Northgate High'] },
  { d: 2, prefab: 'fire', biz: ['delivery'], names: ['Fire Station 7'] },
  { d: 5, prefab: 'church', biz: ['delivery'], names: ['St. Pixel Chapel'] },
  { d: 7, prefab: 'clubnova', biz: ['delivery'], names: ['Club Ultraviolet'] },
  { d: 7, prefab: 'clubeclipse', biz: ['delivery'], names: ['The Midnight'] },
  { d: 7, prefab: 'club', biz: ['delivery'], names: ['Luna Lounge'] },
  { d: 7, prefab: 'arcade', biz: ['delivery'], names: ['Pixel Arcade'] },
  { d: 17, prefab: 'clubeclipse', biz: ['delivery'], names: ['Pink Moon Lounge'] },
  { d: 4, prefab: 'theatre', biz: ['delivery'], names: ['The Grand Theatre'] },
  { d: 4, prefab: 'vellori', biz: ['delivery'], names: ['Vellori'] },
  { d: 16, prefab: 'monarch', biz: ['delivery'], names: ['Monarch'] },
  { d: 16, prefab: 'diamond', biz: ['delivery'], names: ['Diamond & Co.'] },
  { d: 7, prefab: 'club', biz: ['delivery'], names: ['The Velvet Room'] },
  { d: 7, prefab: 'hotel', biz: ['delivery'], names: ['Neon Palms Hotel'] },
  { d: 17, prefab: 'club', biz: ['delivery'], names: ['The Pink Pussycat Lounge'] },
  { d: 17, prefab: 'hotel', biz: ['delivery'], names: ['Hourly Hearts Motel'] },
  { d: 18, prefab: 'conv', biz: ['delivery'], names: ['Rusty Anchor Motel'] },
  { d: 16, prefab: 'hotel', biz: ['delivery'], names: ['The Bayside Ritz'] },
  // Westport
  { d: 23, prefab: 'hospital', biz: ['hospital'], names: ['Westport General'] },
  { d: 23, prefab: 'police2', biz: ['police'], names: ['Westport PD'] },
  { d: 23, prefab: 'hotel', biz: ['delivery'], names: ['The Westport Grand'] },
  { d: 23, prefab: 'bank', biz: ['delivery'], names: ['Westport Trade Center'] },
  { d: 25, prefab: 'strip', biz: ['delivery'], names: ['Stadium Megastore'] },
  { d: 25, prefab: 'club', biz: ['delivery'], names: ['The Turnstile Bar'] },
  { d: 30, prefab: 'strip', biz: ['delivery', 'delivery', 'delivery', 'delivery'], names: ['Old Quarter Books', 'Salt & Pepper Diner', 'Harborview Tattoo', 'Corner Laundry'] },
  { d: 30, prefab: 'church', biz: ['delivery'], names: ['St. Brine Chapel'] },
  { d: 26, prefab: 'warehouse', biz: ['delivery'], names: ['Westport Freight'] },
  { d: 28, prefab: 'school', biz: ['delivery'], names: ['West Hills Academy'] },
  // Northshore
  { d: 31, prefab: 'hospital', biz: ['hospital'], names: ['Northshore Medical'] },
  { d: 31, prefab: 'police3', biz: ['police'], names: ['Northshore Sheriff'] },
  { d: 31, prefab: 'fire', biz: ['delivery'], names: ['Fire Station 12'] },
  { d: 32, prefab: 'hotel', biz: ['delivery'], names: ['Peakview Lodge Hotel'] },
  // Cedar Isle
  { d: 36, prefab: 'hospital', biz: ['hospital'], names: ['Cedar Falls Clinic'] },
  { d: 36, prefab: 'police3', biz: ['police'], names: ['Cedar Falls Police'] },
  { d: 36, prefab: 'strip', biz: ['delivery', 'delivery', 'delivery', 'delivery'], names: ['Falls Hardware', 'Main Street Diner', 'Cedar Books', 'Pine & Petal Florist'] },
  { d: 35, prefab: 'school', biz: ['delivery'], names: ['Cedar Falls High'] },
  { d: 39, prefab: 'warehouse', biz: ['delivery'], names: ['South Port Cannery'] },
  { d: 37, prefab: 'tackle2', biz: ['tackle'], names: ['Lakeside Bait & Tackle'] },
  { d: 24, prefab: 'pool', biz: ['delivery'], names: ['Lakeview Community Pool'] },
  { d: 25, prefab: 'motors', biz: ['delivery'], names: ['Westport Motors'] },
  { d: 25, prefab: 'trail', biz: ['delivery'], names: ['Trail & Field Outfitters'] },
  { d: 23, prefab: 'boutique', biz: ['delivery'], names: ['Crown Boutique'] },
  { d: 30, prefab: 'clubeclipse', biz: ['delivery'], names: ['Club Eclipse'] },
  { d: 31, prefab: 'clubnova', biz: ['delivery'], names: ['Club Nova'] },
  { d: 35, prefab: 'fuel', biz: ['delivery'], names: ['FuelMax Cedar Falls'] },
  { d: 26, prefab: 'junkyard', biz: ['delivery'], names: ['J&R Salvage'] },
  { d: 30, prefab: 'construction', biz: ['construction'], names: ['Old Quarter Redevelopment'] },
  // storefront rows cut whole from the street paintings: one business behind each door
  { d: 23, prefab: 'shops1', biz: ['delivery', 'delivery', 'delivery', 'clothing', 'coffee'], names: ["Joe's Burgers", 'Riverside Books', 'Pixel Tech', 'Thread & Co.', 'Brew Haven Coffee'] },
  { d: 31, prefab: 'shops1', biz: ['delivery', 'delivery', 'delivery', 'clothing', 'coffee'], names: ["Joe's Burgers North", 'Northshore Books', 'Pixel Tech Northshore', 'Thread & Co. North', 'Brew Haven North'] },
  { d: 36, prefab: 'shops2', biz: ['delivery', 'convenience', 'coffee', 'clothing', 'pharmacy'], names: ['Falls Pizza', '24/7 Mart', 'Bean There Coffee', 'Urban Wear', 'Falls Pharmacy'] },
  { d: 30, prefab: 'shops2', biz: ['delivery', 'convenience', 'coffee', 'clothing', 'pharmacy'], names: ['Old Quarter Pizza', '24/7 Mart Old Quarter', 'Bean There Old Quarter', 'Urban Wear Old Quarter', 'Old Quarter Pharmacy'] },
];

const GENERIC_NAMES = {
  conv: ['Quick Mart', 'Corner Deli', '24/7 Market', 'Speedy Stop'], rest1: ['Pizza Planet Express', 'Hot Wok', 'Taco Loco', 'Burger Barn'],
  rest2: ['Cafe Retro', 'Noodle House', 'The Brick Oven'], club: ['Club Neon', 'Bass Cave', 'Pink Flamingo'], gas: ['Gas-N-Go', 'Fuel Stop'],
  tower1: ['Office Tower'], tower2: ['Glass Tower'], hotel: ['Hotel'], warehouse: ['Warehouse'], industrial: ['Factory'], repair: ['Auto Repair'],
  apt1: ['Apartments'], apt2: ['Apartments'], house1: ['Residence'], house2: ['Residence'], house3: ['Residence'], church: ['Chapel'],
  // lots cut from the concept scene paintings
  fuel: ['FuelMax'], clubnova: ['Club Nova'], clubeclipse: ['Club Eclipse'], motors: ['Riverside Motors'], trail: ['Trail & Field'],
  boutique: ['Crown Boutique'], quickstop: ['Quick Stop'], apt3: ['Pinecrest Apartments'], apt4: ['Apartments'], house4: ['Residence'],
  house5: ['Residence'], house6: ['Villa'], bank2: ['First City Bank'], junkyard: ['J&R Salvage'],
  beachbar: ['Beach Shack'], pool: ['Community Pool'], tackle2: ['Bait & Tackle'], shack: ['Homestead'], farmstead: ['Farmstead'],
  police2: ['Police Station'], police3: ['Police Station'], liquor: ['Liquor Mart', 'Corner Liquor', 'Spirits & More', 'Beer Wine Spirits'],
  shops1: ['Storefronts'], shops2: ['Storefronts'],
  // round 7 lots
  house7: ['Residence'], house8: ['Residence'], house9: ['Residence'], diner: ['City Diner', 'Eat Drink Local'],
  royale: ['Royale Fashion'], vellori: ['Vellori'], monarch: ['Monarch'], shanty1: ['Shack'], shanty2: ['Shack'], shanty3: ['Shack'],
  arcade: ['Pixel Arcade', 'Game Zone'], tattoo: ['Bold Ink Tattoo'], crown: ['Crown Couture'], greenbistro: ['Garden Bistro'],
  theatre: ['The Grand Theatre'], diamond: ['Diamond & Co.'], redawning: ['Cafe Rouge'],
};
// Lots with a nightclub inside: walk in after dark (closed by day)
export const CLUB_LOTS = new Set(['club', 'clubnova', 'clubeclipse']);

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
    this.reserve = new Uint8Array(N);     // bit flags: 1 highway band, 2 railway, 4 waterfront strip, 8 under a ramp, 16 kept open (Pelican Key beach)
    this.deck = new Uint8Array(N);        // 1 = under the elevated highway
    this.lvl0Block = new Uint8Array(N);   // 1 = solid at ground level (a ramp's embankment)
    this.roadAxis = new Uint8Array(N);    // bit1 vertical-ish road, bit2 horizontal-ish, 3 = junction box
    this.roadRank = new Uint8Array(N);    // 1 = an alley's asphalt, 2 = any other road's (a street wins where they meet)
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
export function nearestLand(map, x, y, maxTiles = 24, skip = null) {
  const cx = Math.floor(x / TILE), cy = Math.floor(y / TILE);
  for (let r = 0; r <= maxTiles; r++) {
    let best = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const t = map.tileAt(cx + dx, cy + dy);
      if (PED_BLOCK[t] || t === T.BRIDGE || t === T.DOCK) continue; // a pier stands up out of the water: swim for real shore
      if (skip && skip.has((cy + dy) * MAP_W + cx + dx)) continue; // tried that bit of shore: couldn't get up there
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
  const net = repairRoads(m, lines, seed);
  m.net = net; m.nodes = net.nodes; m.edges = net.edges; m.roads = net.edges;
  rasterRoads(m);
  rampGores(m);
  const railPts = m.railPts;
  reserveRail(m, railPts);
  buildStationLots(m);
  reserveSubwayPlazas(m);
  waterfrontStrip(m);
  // Pelican Key's beach end (the bar, the charter dock, the court) stays open; the town is east of it
  {
    const [px0, py0, px1, py1] = ISLANDS.P.box;
    const pcx = Math.floor((px0 + px1) / 2), pcy = Math.floor((py0 + py1) / 2);
    for (let y = pcy - 20; y < pcy + 24; y++) for (let x = pcx - 34; x < pcx + 16; x++) { const i = y * MAP_W + x; if (m.zone[i] === Z.KEY && m.tiles[i] === T.GRASS) m.reserve[i] |= 16; }
  }

  // --- blocks -> rows -> concept-art lots and rooftops ------------------------------------------
  findBlocks(m);
  const rows = [];
  const estateRows = [];
  // the mansion takes the biggest lot in Bayside Heights that opens north onto a street
  const mlot = m.blocks.filter((b) => b.d === 16 && b.w >= MANSION_SIZE[0] + 1 && b.h >= MANSION_SIZE[1] + 1 && facesStreet(m, { x: b.x + Math.floor((b.w - MANSION_SIZE[0]) / 2), y: b.y, w: MANSION_SIZE[0], h: 1 }, 'N')).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  if (mlot) mlot.mansion = true;
  // Sunset Beach's volleyball court takes a whole block by the sea
  const clot = m.blocks.filter((b) => b.d === 10 && !b.mansion && b.w >= 16 && b.h >= 10).sort((a, b) => m.distSea[(a.y + (a.h >> 1)) * MAP_W + a.x] - m.distSea[(b.y + (b.h >> 1)) * MAP_W + b.x])[0];
  if (clot) clot.court = true;
  for (const b of m.blocks) {
    const st = STYLE[DISTRICTS[b.d].style];
    b.ix = b.x; b.iy = b.y; b.iw = b.w; b.ih = b.h;
    if (b.court) {
      m.fill(b.x, b.y, b.w, b.h, T.SAND);
      volleyCourt(m, 'Sunset Beach Volleyball', b.x + ((b.w - 16) >> 1), b.y + ((b.h - 8) >> 1), 16, 8, b.w >= 18 ? 1 : 0);
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
    if (b.green) { filler(m, { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S' }, b.x, b.w, STYLE.park, mulberry32(seed ^ (b.x * 17 + b.y))); continue; }
    if (v2At(m, b)) { b.v2 = true; v2Block(m, b, rows, mulberry32(seed ^ (b.x * 97 + b.y * 13))); continue; } // World v2: real-sized lots
    const minH = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].th));
    const minW = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].tw));
    const fS = facesStreet(m, b, 'S'), fN = facesStreet(m, b, 'N');
    // land no street reaches (behind the ring roads, along wild coasts): left as greenery
    const sideways = !fS && !fN && (facesStreet(m, b, 'E') || facesStreet(m, b, 'W'));
    if ((!fS && !fN && !sideways) || (sideways && (b.w > 20 || b.h > 20) && ['houses', 'beach', 'luxury'].includes(DISTRICTS[b.d].style))) {
      filler(m, { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S' }, b.x, b.w, STYLE.park, mulberry32(seed ^ (b.x * 29 + b.y * 3)));
      continue;
    }
    if (b.h < minH || b.w < minW || (!fS && !fN)) {
      // too small (or nowhere for a door): one solid building or a pocket park / plaza
      const row = { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S' };
      const rr = mulberry32(seed ^ (b.x * 131 + b.y * 7));
      // with no street along its north side, the shops across that edge may open onto it: keep a
      // strip of paving there in front of their doors
      const gap = !fN && b.h >= 6 ? 2 : 0;
      if (st.roof && b.w >= 4 && b.h - gap >= 4 && rr() < (st.roof >= 0.4 ? 0.85 : st.roof * 2)) roofBuilding(m, row, b.x, b.y + gap, b.w, b.h - gap, st, rr);
      else if (!fS && !fN && b.w >= 12 && b.h >= 12 && (b.w > 30 || b.h > 30)) { const half = { ...b }; splitBlock(m, half, st, rr); }
      else filler(m, row, b.x, b.w, st, rr);
      continue;
    }
    // Every building is painted from the same viewpoint, front at the bottom, so every lot faces
    // south: a block with a street along its south side is one row of fronts as deep as the block
    // (yards and back lots fill in behind shorter buildings); a block reached only from the north
    // gets the backs of buildings - roofs, yards and parking - and no doors.
    if (fS) rows.push({ b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'S', iv: [[b.x, b.x + b.w]] });
    else {
      // (a strip along the north side stays open: it may be the only way to a door across it)
      const row = { b, d: b.d, x: b.x, y: b.y, w: b.w, h: b.h, face: 'N' };
      const rr = mulberry32(seed ^ (b.x * 173 + b.y * 11));
      filler(m, row, b.x, b.w, { ...st, roof: 0 }, rr);
      if (st.roof && b.w >= 6 && b.h >= 8 && rr() < Math.max(0.5, st.roof)) roofBuilding(m, row, b.x + 1, b.y + 3, b.w - 2, b.h - 4, st, rr);
    }
  }
  claimEstates(m, rows, estateRows, rand); // beach houses first: the beach blocks are few
  placeSpecials(m, rows, rand);
  for (const row of rows) (row.v2 ? fillRowV2 : fillRow)(m, row, mulberry32(seed ^ (row.x * 31 + row.y * 977)));
  for (const b of m.blocks) if (b.park) buildPark(m, b, mulberry32(seed ^ (b.x * 13 + b.y)), b.park);
  for (const [type, key, x, y, south, , dims] of estateRows) estateHouse(m, rand, type, key, x, y, south, dims);
  fillScraps(m, mulberry32(seed ^ 0x5c4a)); // the stepped edges along Broadway and the curving streets
  clearDoorways(m);
  m.garages ||= []; m.mansions ||= [];
  if (mlot) mansion(m, rand, mlot.x + Math.floor((mlot.w - MANSION_SIZE[0]) / 2), mlot.y);

  // --- waterfronts, farms, islands, street furniture, traffic graph ------------------------------
  buildWaterfronts(m, rand);
  buildFarm(m, rand);
  buildAirports(m);
  runwayLights(m, { addProp });
  buildCountryside(m, { simpleBuilding, placePrefab, addProp, clearArea });
  buildEstates(m, rand);
  buildOutposts(m, rand);
  buildScenePaintings(m);
  buildWilds(m, rand);
  buildStreetProps(m);
  buildPowerLines(m, { addProp }, (tx, ty) => wildAt(m, tx, ty));
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
  buildBoatDocks(m);
  buildSignals(m);
  buildStreetAtms(m);
  m.atms = m.pois.filter((p) => p.kind === 'atm');
  aimLamps(m);
  m.levels = buildLevels(m);
  buildCameras(m, rand);

  const hosp = m.pois.find((p) => p.kind === 'hospital' && m.zoneAt(p.x, p.y) === Z.CITY) || m.pois.find((p) => p.kind === 'hospital');
  const pd = m.pois.find((p) => p.kind === 'police');
  m.hospitals = m.pois.filter((p) => p.kind === 'hospital').map((p) => ({ id: p.id, name: p.label, x: p.x, y: p.y + 44 }));
  m.spawns.hospital = { x: hosp.x, y: hosp.y + 44 };
  m.spawns.police = { x: pd.x, y: pd.y + 44 };
  m.spawns.default = m.spawns.hospital;
  mapSignature(m); // fingerprint the freshly built world (before anything changes at runtime)
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
  const code = { W: 0, G: 1, F: 2, D: 3, R: 4, S: 5 };
  TERRAIN.split('|').forEach((row, y) => {
    let x = 0;
    for (const m of row.matchAll(/([A-Z])([0-9a-z]+)/g)) { const n = parseInt(m[2], 36); cls.fill(code[m[1]], y * cw + x, y * cw + x + n); x += n; }
  });
  return { cls, cw, ch };
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
  raiseSceneIslands(m, land);
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
  const compZone = new Map(ISLAND_AT.map(([[x, y], z]) => [compAt(x, y), z]));
  for (let i = 0; i < N; i++) {
    if (!land[i]) continue;
    const c = lab[i], x = i % W, y = (i / W) | 0;
    if (c === main) m.zone[i] = x >= 1045 ? Z.EAST : y < yRiver(x) ? Z.CITY : Z.SOUTH;
    else m.zone[i] = compZone.get(c) ?? Z.WILD;
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
    const c = terrainAt(cls, cw, x, y);
    const nearSea = m.distSea[i] <= 10;
    const z = m.zone[i];
    if (z === Z.CITY || z === Z.SOUTH) { m.tiles[i] = T.GRASS; continue; }
    if (nearSea && (z !== Z.EAST || c !== 4)) { m.tiles[i] = T.SAND; continue; }
    m.tiles[i] = c === 3 ? (Math.sin(x * 0.045 + Math.cos(y * 0.06) * 2) + Math.sin(y * 0.05 - x * 0.02) + (hash2(x, y, 5) - 0.5) * 0.5 > 0.9 ? T.SAND : T.DIRT) : c === 4 ? T.DIRT : T.GRASS;
  }
  m.terrainCls = { cls, cw };
  // districts of the places without seeds: Smuggler's Rock, the lighthouse rock, the islets
  const lighthouse = compAt(300, 70);
  for (let i = 0; i < N; i++) {
    const z = m.zone[i];
    if (z === Z.EAST) m.dist[i] = 9;
    else if (z === Z.KEY) m.dist[i] = 14;
    else if (z === Z.ROCK) m.dist[i] = 15;
    else if (z === Z.GULL) m.dist[i] = 22;
    else if (z === Z.WILD) m.dist[i] = lab[i] === lighthouse ? 19 : 20;
  }
  m.comps = comps; m.compLab = lab;
}

// Districts inside the city and Southbank: nearest seed in the same zone, borders wobbled with a
// little noise so they don't run along straight lines; the park is a hard rectangle.
function paintDistricts(m) {
  const W = MAP_W;
  const seeds = SEEDS.concat(ISLAND_SEEDS).map(([d, x, y]) => ({ d, x, y, z: m.zone[y * W + x] })).filter((s) => s.z);
  const seeded = new Set(seeds.map((s) => s.z));
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const z = m.zone[i];
    if (!seeded.has(z)) continue;
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
  // built-up districts start out as plain ground for the streets and lots; the rest keeps its
  // woods, scrub and sand
  for (let i = 0; i < W * MAP_H; i++) {
    if (!m.land[i]) continue;
    const st = DISTRICTS[m.dist[i]].style;
    if (STYLE[st] && st !== 'beach') m.tiles[i] = T.GRASS;
    else if (st === 'beach' && m.zone[i] !== Z.CITY && m.tiles[i] !== T.SAND) m.tiles[i] = T.GRASS;
    else if (st === 'airport') m.tiles[i] = m.distSea[i] <= 8 ? T.SAND : T.GRASS;
  }
  // inland lakes (fresh water: fishable like the river)
  m.lake = new Uint8Array(W * MAP_H);
  for (const [lx, ly, rx, ry] of LAKES) {
    for (let y = Math.floor(ly - ry - 1); y <= ly + ry + 1; y++) for (let x = Math.floor(lx - rx - 1); x <= lx + rx + 1; x++) {
      const k = ((x - lx) / rx) ** 2 + ((y - ly) / ry) ** 2 + 0.12 * Math.sin(x * 0.7 + y * 0.4);
      const i = y * W + x;
      if (k > 1 || !m.land[i]) continue;
      m.lake[i] = 1; m.river[i] = 1;
      m.tiles[i] = k < 0.4 ? T.DEEP : T.WATER;
    }
  }
}

// ---------------------------------------------------------------------------
// Road lines (px) for the network builder.
// Districts with a street plan of their own (no blocks from metro.js): Pine Hills' winding drives and
// courts, Greenfield Park, Bayside Heights' crescents.
const OWN_PLAN = new Set([0, 12, 16]);
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

  // the streets of Metro City (metro.js): the avenues across the island, Broadway, and each district's own
  // irregular blocks, service alleys and plazas between them
  const metro = metroRoads({ m, Z, BAND, at, inPark, lines, ringH, styleOf: (d) => DISTRICTS[d].style, gridded: (d) => !OWN_PLAN.has(d) });
  m.plazas = metro.plazas;
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
  for (const g of metro.aves.filter((q) => q.kind === 'ave' || q.kind === 'blvd')) {
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

  // Dry Creek: the county road east, the farm road north-south, back into Southside
  const ruralOk = (x, y) => isLand(x, y) && seaD(x, y) >= 6;
  const county = [{ x: 1036 * TILE, y: 528 * TILE }, { x: 1140 * TILE, y: 528 * TILE }, { x: 1200 * TILE, y: 514 * TILE }];
  for (const p of clipLine(county, ruralOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'County Road' });
  const farmRd = [{ x: 1140 * TILE, y: 452 * TILE }, { x: 1140 * TILE, y: 690 * TILE }, { x: 1110 * TILE, y: 730 * TILE }, { x: 1040 * TILE, y: 734 * TILE }];
  for (const p of clipLine(rounded(farmRd, 18 * TILE), ruralOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Farm Road' });
  // the Eastern Parkway: where town meets the country, every street from the grid ends on it
  for (const p of clipLine([{ x: 1047 * TILE, y: 296 * TILE }, { x: 1047 * TILE, y: 910 * TILE }], (x, y) => isLand(x, y) && seaD(x, y) >= 4 && !m.river[at(x, y)], 10 * TILE)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Eastern Parkway' });

  // the other islands, the highways and bridges between them (islands.js)
  const ctx = {
    m, lines, rand, Z, isLand, zoneOf, seaD,
    lake: (x, y) => { const i = at(x, y); return i >= 0 && !!m.lake[i]; },
    metroWestEnd: metro.westEnd, metroNorthEnd: metro.northEnd, metroSouthEnd: metro.southEnd,
  };
  m.islandRings = islandRoads(ctx);
  stationAccess(m, lines, isLand, seaD);
  // campgrounds, roadside stops, masts, wind farms... out in the wild, each with its own road in
  const avoid = AIRPORTS.flatMap((A) => [A.runway, A.apron, A.taxi, A.terminal, ...A.hangars].map(([x, y, w, h]) => [x - 5, y - 5, w + 10, h + 10])).concat(FIELDS.map(([x, y, w, h]) => [x - 2, y - 2, w + 4, h + 4]), FARM_FIELDS.map(([x, y, w, h]) => [x - 2, y - 2, w + 4, h + 4]));
  countrysideRoads({ m, lines, isLand, seaD, lake: (x, y) => { const i = at(x, y); return i >= 0 && !!m.lake[i]; }, wildAt: (tx, ty) => wildAt(m, tx, ty), avoid });
  return lines;
}

// The car parks beside the country stations: asphalt, and a row of spaces down each long side
// that parked cars turn up in now and then.
// Subway entrances: before the blocks are cut up, each underground stop claims a small paved
// plaza on the street nearest its platform - room for the entrance kiosk (stairs down, with its
// railings, lamps and sign), the countdown board and a marked queue lane beside the mouth. The
// plaza fronts a street on its south side where it can (the street at the bottom, like the rest
// of the art), else on its north side.
export const SUBWAY_PLAZA = { w: 8, h: 4 };
function reserveSubwayPlazas(m) {
  m.subwayPlazas = [];
  const pts = m.railPts, { w: PW, h: PH } = SUBWAY_PLAZA;
  const free = (i) => m.land[i] && m.tiles[i] === T.GRASS && !m.reserve[i] && !m.deck[i];
  for (const { name, i } of stationIndex(m, pts)) {
    const q = pts[i];
    if (!q.under) continue;
    const cx = Math.floor(q.x / TILE), cy = Math.floor(q.y / TILE);
    let best = null;
    for (let ty = cy - 30; ty <= cy + 30; ty++) for (let tx = cx - 30; tx <= cx + 30; tx++) {
      let ok = true;
      for (let y = 0; y < PH && ok; y++) for (let x = 0; x < PW; x++) if (!free((ty + y) * MAP_W + tx + x)) { ok = false; break; }
      if (!ok) continue;
      let south = true, north = true;
      for (let x = 0; x < PW; x++) {
        if (m.tileAt(tx + x, ty + PH) !== T.SIDEWALK) south = false;
        if (m.tileAt(tx + x, ty - 1) !== T.SIDEWALK) north = false;
      }
      if (!south && !north) continue;
      const d = Math.hypot((tx + PW / 2) * TILE - q.x, (ty + PH / 2) * TILE - q.y) + (south ? 0 : 2000); // the street below it whenever possible
      if (!best || d < best.d) best = { name, x: tx, y: ty, w: PW, h: PH, south, d };
    }
    if (!best) continue;
    for (let y = best.y; y < best.y + PH; y++) for (let x = best.x; x < best.x + PW; x++) { m.tiles[y * MAP_W + x] = T.PLAZA; m.reserve[y * MAP_W + x] |= 16; }
    m.subwayPlazas.push(best);
  }
}

function buildStationLots(m) {
  for (const l of m.stationLots || []) {
    for (let y = l.y; y < l.y + l.h; y++) for (let x = l.x; x < l.x + l.w; x++) {
      const i = y * MAP_W + x;
      if (!m.land[i] || m.tiles[i] === T.ROAD) continue;
      m.tiles[i] = T.LOT; m.reserve[i] |= 16;
    }
    const spots = [];
    if (l.along) for (let x = l.x + 1.5; x < l.x + l.w - 1; x += 2) { spots.push({ x: x * TILE, y: (l.y + 1.3) * TILE, a: Math.PI / 2 }); spots.push({ x: x * TILE, y: (l.y + l.h - 1.3) * TILE, a: -Math.PI / 2 }); }
    else for (let y = l.y + 1.5; y < l.y + l.h - 1; y += 2) { spots.push({ x: (l.x + 1.3) * TILE, y: y * TILE, a: 0 }); spots.push({ x: (l.x + l.w - 1.3) * TILE, y: y * TILE, a: Math.PI }); }
    l.spots = spots;
    for (const sp of spots) m.parking.push({ ...sp, sparse: true }); // a country car park: only a car or two
  }
}

// Stations out in open country (no road anywhere near the platform) get a car park beside the
// track and a county road out to the nearest road of the network, so you can drive to the train
// and maybe find a car to take when you get off.
const STATION_LOT = { w: 14, h: 8 };
function stationAccess(m, lines, isLand, seaD) {
  m.stationLots = [];
  const pts = m.railPts;
  const ok = (l) => l.lvl === 0 && !['hwy', 'ramp', 'front'].includes(l.kind);
  for (const [name, tx, ty] of RAIL_STATIONS) {
    let best = null, bd = Infinity;
    for (const p of pts) { const d = Math.hypot(p.x - tx * TILE, p.y - ty * TILE); if (d < bd) { bd = d; best = p; } }
    if (!best || best.under) continue;
    let near = Infinity, tgt = null;
    for (const l of lines) {
      if (!ok(l)) continue;
      for (let k = 0; k < l.pts.length - 1; k++) {
        const a = l.pts[k], b = l.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((best.x - a.x) * dx + (best.y - a.y) * dy) / l2));
        const x = a.x + dx * t, y = a.y + dy * t, d = Math.hypot(x - best.x, y - best.y);
        if (d < near) { near = d; tgt = { x, y }; }
      }
    }
    if (near < 16 * TILE || !tgt) continue; // in town: the streets come right up to it
    // the car park on the dry side of the track, a little off it
    const i = pts.indexOf(best), q = pts[(i + 1) % pts.length];
    const a = Math.atan2(q.y - best.y, q.x - best.x), nx = -Math.sin(a), ny = Math.cos(a);
    const score = (sd) => { let n = 0; for (let d = 140; d <= 460; d += 32) { const x = best.x + nx * sd * d, y = best.y + ny * sd * d; if (isLand(Math.floor(x / TILE), Math.floor(y / TILE)) && seaD(Math.floor(x / TILE), Math.floor(y / TILE)) > 4) n++; } return n - (Math.sign((tgt.x - best.x) * nx + (tgt.y - best.y) * ny) === sd ? 0 : 0.5); };
    const side = score(1) >= score(-1) ? 1 : -1;
    const cx = best.x + nx * side * (PLATFORM_OUT + 6 * TILE), cy = best.y + ny * side * (PLATFORM_OUT + 6 * TILE);
    const along = Math.abs(Math.cos(a)) >= 0.7; // the long side of the car park lies along the track
    const lw = along ? STATION_LOT.w : STATION_LOT.h, lh = along ? STATION_LOT.h : STATION_LOT.w;
    const lot = { name, x: Math.round(cx / TILE - lw / 2), y: Math.round(cy / TILE - lh / 2), w: lw, h: lh, side, along };
    m.stationLots.push(lot);
    // the access road: from the car park's entrance (its far side from the track) out to the network
    const ex = (lot.x + lot.w / 2) * TILE + nx * side * (STATION_LOT.h / 2 + 1) * TILE, ey = (lot.y + lot.h / 2) * TILE + ny * side * (STATION_LOT.h / 2 + 1) * TILE;
    const road = rounded([{ x: (lot.x + lot.w / 2) * TILE, y: (lot.y + lot.h / 2) * TILE }, { x: ex, y: ey }, { x: tgt.x, y: tgt.y }], 6 * TILE);
    lines.push({ pts: road, kind: 'rural', lvl: 0, name: `${name} Station Road`, culdesac: true });
  }
}

// Make the network hang together: a road that just stops gets joined to the nearest road ahead
// of it of about its own rank (a street to a street or an avenue, a dirt track to a county road;
// only arterials and county roads meet a highway), then the graph is rebuilt. Designed dead ends
// (cul-de-sacs, lanes to the shore) are left alone. Finally a one-way piece you could drive into
// but not out of becomes two-way.
const CONNECT_R = { hwy: 40, ave: 36, blvd: 36, art: 30, front: 30, drive: 28 }; // tiles; everything else 22
const ONTO_HWY = new Set(['ave', 'blvd', 'art', 'rural', 'front']);
// Streets and lanes don't cross a ground-level highway: they stop short of it (and get joined
// to something else or turned into a cul-de-sac); arterials and county roads cross at junctions.
const CROSS_HWY = new Set(['ave', 'blvd', 'art', 'rural', 'front', 'hwy', 'ramp']);
function clipAtHighways(lines) {
  const hw = lines.filter((l) => l.kind === 'hwy' && l.lvl === 0);
  const boxOf = (pts) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; } return { x0, y0, x1, y1 }; };
  for (const h of hw) h.box = boxOf(h.pts);
  const out = [];
  for (const l of lines) {
    if (CROSS_HWY.has(l.kind) || l.lvl !== 0) { out.push(l); continue; }
    const pts = l.pts.map((p) => ({ x: p.x, y: p.y }));
    const L = measure(pts);
    const lb = boxOf(pts);
    const cuts = [];
    for (const h of hw) {
      if (lb.x1 < h.box.x0 - 300 || lb.x0 > h.box.x1 + 300 || lb.y1 < h.box.y0 - 300 || lb.y0 > h.box.y1 + 300) continue;
      for (let i = 0; i + 1 < pts.length; i++) for (let j = 0; j + 1 < h.pts.length; j++) {
        const x = segX(pts[i], pts[i + 1], h.pts[j], h.pts[j + 1]);
        if (x) cuts.push(pts[i].s + (pts[i + 1].s - pts[i].s) * x.t);
      }
    }
    const gap = 14 * TILE / 2 + 3 * TILE;
    // an end that stops right beside a highway is pulled back too (it would snap onto it)
    const near = (q) => hw.some((h) => { if (q.x < h.box.x0 - gap || q.x > h.box.x1 + gap || q.y < h.box.y0 - gap || q.y > h.box.y1 + gap) return false; const pr = project(h.pts, q); return pr && pr.d < gap; });
    if (near(pts[0])) { let s1 = 0; while (s1 < L && near(pointAt(pts, s1))) s1 += 16; cuts.push(Math.min(L, s1) - gap); }
    if (near(pts[pts.length - 1])) { let s1 = L; while (s1 > 0 && near(pointAt(pts, s1))) s1 -= 16; cuts.push(Math.max(0, s1) + gap); }
    if (!cuts.length) { out.push(l); continue; }
    let s0 = 0;
    const keep = [];
    for (const c of cuts.sort((a, b) => a - b)) { if (c - gap > s0) keep.push([s0, c - gap]); s0 = Math.max(s0, c + gap); }
    if (s0 < L) keep.push([s0, L]);
    for (const [a0, a1] of keep) {
      if (a1 - a0 < 6 * TILE) continue;
      const piece = [pointAt(pts, a0)];
      for (const p of pts) if (p.s > a0 && p.s < a1) piece.push({ x: p.x, y: p.y });
      piece.push(pointAt(pts, a1));
      out.push({ ...l, pts: piece.map((p) => ({ x: p.x, y: p.y })) });
    }
  }
  lines.length = 0;
  lines.push(...out);
}

function repairRoads(m, lines, seed) {
  const W = MAP_W;
  clipAtHighways(lines);
  const wetAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx < 0 || ty < 0 || tx >= W || ty >= MAP_H || !m.land[ty * W + tx] || !!m.lake[ty * W + tx]; };
  const lower = (a, b) => { let k = (ROAD_RANK[a] ?? 3) <= (ROAD_RANK[b] ?? 3) ? a : b; if (k === 'hwy' || k === 'ramp') k = k === a ? b : a; if (k === 'hwy' || k === 'ramp') k = 'art'; if (k === 'alley') k = k === a ? b : a; if (k === 'alley') k = 'st'; return k === 'front' ? 'art' : k; };
  let net = null;
  const hwys = lines.filter((l) => l.kind === 'hwy' && l.lvl === 0);
  const crossesHwy = (a, b) => hwys.some((h) => { for (let j = 0; j + 1 < h.pts.length; j++) if (segX(a, b, h.pts[j], h.pts[j + 1])) return true; return false; });
  for (let iter = 0; iter < 4; iter++) {
    net = buildNetwork(lines, seed);
    const add = [];
    for (const n of net.nodes) {
      if (n.lvl !== 0 || n.edges.length !== 1) continue;
      const e = net.edges[n.edges[0]];
      if (e.lvl !== 0 || e.culdesac || e.kind === 'ramp') continue;
      const pts = e.a === n.id ? e.pts : e.pts.slice().reverse();
      let k = 1;
      while (k < pts.length - 1 && Math.hypot(pts[k].x - pts[0].x, pts[k].y - pts[0].y) < 64) k++;
      let ox = pts[0].x - pts[k].x, oy = pts[0].y - pts[k].y;
      const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol;
      const rank = ROAD_RANK[e.kind] ?? 3;
      const R = (CONNECT_R[e.kind] || 22) * TILE;
      let best = null;
      for (const o of net.edges) {
        if (o === e || o.lvl !== 0) continue;
        const ro = ROAD_RANK[o.kind] ?? 3;
        if (o.kind === 'hwy' || e.kind === 'hwy' ? !(ONTO_HWY.has(e.kind) || ONTO_HWY.has(o.kind) || (o.kind === 'hwy' && e.kind === 'hwy')) : Math.abs(ro - rank) > 2) continue;
        const bb = o.bb || (o.bb = { x0: Math.min(...o.pts.map((q) => q.x)), y0: Math.min(...o.pts.map((q) => q.y)), x1: Math.max(...o.pts.map((q) => q.x)), y1: Math.max(...o.pts.map((q) => q.y)) });
        if (n.x < bb.x0 - R || n.x > bb.x1 + R || n.y < bb.y0 - R || n.y > bb.y1 + R) continue;
        const pr = project(o.pts, n);
        if (!pr || pr.d > R || pr.d < 6) continue;
        const dx = pr.x - n.x, dy = pr.y - n.y;
        const cos = (dx * ox + dy * oy) / pr.d;
        if (cos < 0.25) continue;
        let dry = true;
        for (let t = 16; t < pr.d; t += 16) if (wetAt(n.x + dx * t / pr.d, n.y + dy * t / pr.d)) { dry = false; break; }
        if (!dry) continue;
        const kind = lower(e.kind, o.kind);
        if (!CROSS_HWY.has(kind) && o.kind !== 'hwy' && crossesHwy(n, { x: pr.x, y: pr.y })) continue;
        const score = pr.d * (1.8 - cos);
        if (!best || score < best.score) best = { score, x: pr.x + (dx / pr.d) * 4, y: pr.y + (dy / pr.d) * 4, o };
      }
      if (best) add.push({ pts: [{ x: n.x, y: n.y }, { x: best.x, y: best.y }], kind: lower(e.kind, best.o.kind), lvl: 0, name: e.name || best.o.name });
    }
    if (!add.length) break;
    lines.push(...add);
  }
  fixOneWays(net);
  return net;
}

// One-way edges whose ends aren't mutually reachable become two-way (so nothing gets trapped).
function fixOneWays(net) {
  for (let pass = 0; pass < 3; pass++) {
    const N = net.nodes.length;
    const adj = net.nodes.map((n) => Object.values(n.links));
    const radj = net.nodes.map(() => []);
    adj.forEach((l, i) => l.forEach((j) => radj[j].push(i)));
    const order = [], seen = new Uint8Array(N);
    for (let s0 = 0; s0 < N; s0++) {
      if (seen[s0]) continue;
      const st = [[s0, 0]]; seen[s0] = 1;
      while (st.length) { const top = st[st.length - 1]; if (top[1] < adj[top[0]].length) { const v = adj[top[0]][top[1]++]; if (!seen[v]) { seen[v] = 1; st.push([v, 0]); } } else { order.push(top[0]); st.pop(); } }
    }
    const comp = new Int32Array(N).fill(-1);
    let c = 0;
    for (let k = N - 1; k >= 0; k--) { const s0 = order[k]; if (comp[s0] >= 0) continue; const st = [s0]; comp[s0] = c; while (st.length) { const u = st.pop(); for (const v of radj[u]) if (comp[v] < 0) { comp[v] = c; st.push(v); } } c++; }
    let changed = false;
    for (const e of net.edges) {
      if (!e.oneway || e.lvl !== 0 || comp[e.a] === comp[e.b]) continue;
      e.oneway = false; e.nl = 1;
      net.nodes[e.a].links[e.id] = e.b; net.nodes[e.b].links[e.id] = e.a;
      changed = true;
    }
    if (!changed) break;
  }
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
const CITY_KINDS = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front', 'art']);
// The pavement beside a road (px, roads.js sidewalkPx): by the class of the districts it runs through -
// the commonest one along both sides of it - so a block face keeps one width from corner to corner.
function edgeWalk(m, e) {
  const K = ROAD_KINDS[e.kind] || ROAD_KINDS.st;
  if (K.walk !== 'district') return K.walk || 0;
  const votes = new Map();
  for (let s = 0; s <= e.len; s += 3 * TILE) {
    const q = pointAt(e.pts, Math.min(s, e.len));
    for (const side of [-1, 1]) {
      const r = e.hw + 2 * TILE;
      const tx = Math.floor((q.x - q.ty * side * r) / TILE), ty = Math.floor((q.y + q.tx * side * r) / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || !m.land[ty * MAP_W + tx]) continue;
      const w = sidewalkPx(e.kind, DISTRICTS[m.dist[ty * MAP_W + tx]].style);
      votes.set(w, (votes.get(w) || 0) + 1);
    }
  }
  let best = sidewalkPx(e.kind, 'houses'), bn = 0;
  for (const [w, n] of votes) if (n > bn || (n === bn && w > best)) { best = w; bn = n; }
  return best;
}
function rasterRoads(m) {
  const W = MAP_W;
  const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= W || ty >= MAP_H ? -1 : ty * W + tx);
  const isWet = (t) => t === T.WATER || t === T.DEEP;
  const ground = m.edges.filter((e) => e.lvl === 0);
  for (const e of m.edges) e.walk = e.lvl === 0 ? edgeWalk(m, e) : 0;
  // sidewalks first (roads win where they overlap)
  for (const e of ground) {
    if (!CITY_KINDS.has(e.kind) || !e.walk) continue;
    stampEdge(e, e.hw + e.walk + 4, (tx, ty, d) => {
      const i = at(tx, ty);
      if (i < 0 || d <= e.hw) return;
      const t = m.tiles[i];
      if (isWet(t) || t === T.ROAD || t === T.BRIDGE) return;
      m.tiles[i] = T.SIDEWALK;
    });
  }
  for (const e of ground) {
    if (e.kind === 'dirt') { // unpaved: packed dirt, no kerbs
      stampEdge(e, e.hw - 12, (tx, ty) => { const i = at(tx, ty); if (i >= 0 && !isWet(m.tiles[i]) && m.tiles[i] !== T.ROAD && m.tiles[i] !== T.BRIDGE) { m.tiles[i] = T.DIRT; m.reserve[i] &= ~1; } });
      continue;
    }
    // roads with no pavement beside them only take the tiles well inside their edge, so the
    // smooth road drawn over them covers every asphalt tile (no staircase showing at the side)
    const hwT = CITY_KINDS.has(e.kind) || e.kind === 'alley' ? e.hw : e.hw - 14; // (an alley has walls, not kerbs, but its asphalt is all road)
    stampEdge(e, e.hw, (tx, ty, d, horiz) => {
      const i = at(tx, ty);
      if (i < 0) return;
      const t = m.tiles[i];
      if (d > hwT && !isWet(t) && t !== T.BRIDGE) return;
      if (isWet(t) || t === T.BRIDGE) { m.tiles[i] = T.BRIDGE; e.bridge = true; } else m.tiles[i] = T.ROAD;
      m.roadAxis[i] |= horiz ? 2 : 1;
      m.roadRank[i] = Math.max(m.roadRank[i], e.kind === 'alley' ? 1 : 2);
      m.reserve[i] &= ~1;
    });
    if (e.kind === 'rural') stampEdge(e, e.hw + 20, (tx, ty, d) => { const i = at(tx, ty); if (i >= 0 && d > e.hw && m.tiles[i] === T.GRASS) m.tiles[i] = T.DIRT; });
  }
  // cul-de-sac bulbs (turning circles) at the dead ends of town streets
  for (const n of m.nodes) {
    if (n.lvl !== 0 || n.edges.length !== 1) continue;
    const e = m.edges[n.edges[0]];
    if (!CITY_KINDS.has(e.kind)) continue;
    if (!m.land[at(Math.floor(n.x / TILE), Math.floor(n.y / TILE))]) continue;
    const cx = n.x / TILE, cy = n.y / TILE;
    const rr = Math.max(3.6, e.hw / TILE + 0.8), R = rr + 2;
    for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) {
      const i = at(Math.floor(cx + dx), Math.floor(cy + dy));
      if (i < 0 || !m.land[i] || m.deck[i]) continue;
      const d = Math.hypot(dx, dy);
      if (d <= rr) m.tiles[i] = T.ROAD;
      else if (d <= R && m.tiles[i] !== T.ROAD) m.tiles[i] = T.SIDEWALK;
    }
    n.culdesac = true; n.bulb = rr * TILE;
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

// Where a slip ramp comes down beside the frontage road (or leaves it), the two run side by side for a
// stretch: the strip between them is paved road (a painted gore with chevrons, client/render/roads.js),
// not a sliver of pavement, so the ramp joins the street the way a real one does.
function rampGores(m) {
  m.gores = [];
  for (const e of m.edges) {
    if (e.lvl !== 'ramp') continue;
    const groundA = e.za < 0.5, gnode = m.nodes[groundA ? e.a : e.b];
    const road = gnode.edges.map((id) => m.edges[id]).find((o) => o.lvl === 0 && o !== e);
    if (!road) continue;
    const pts = [];
    for (let s = 0; s < e.len; s += 12) {
      const sr = groundA ? s : e.len - s;
      const z = edgeZ(e, e.a, sr);
      if (z > 0.55) break;
      const p = pointAt(e.pts, sr);
      const q = project(road.pts, p);
      if (!q) break;
      if (q.d > road.hw + e.hw + 4 * TILE) break;
      pts.push({ x: p.x, y: p.y, qx: q.x, qy: q.y, d: q.d, z });
    }
    if (pts.length < 3) continue;
    // the gore is road: no pavement, kerb or street furniture in it
    for (const g of pts) {
      const n = Math.ceil(g.d / 12);
      for (let k = 0; k <= n; k++) {
        const x = g.qx + (g.x - g.qx) * (k / n), y = g.qy + (g.y - g.qy) * (k / n);
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), i = ty * MAP_W + tx;
        if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
        const t = m.tiles[i];
        if ((t === T.SIDEWALK || t === T.GRASS || t === T.PLAZA || t === T.DIRT) && m.land[i]) { m.tiles[i] = T.ROAD; m.reserve[i] &= ~1; }
      }
    }
    m.gores.push({ ramp: e.id, road: road.id, pts, hw: e.hw, rhw: road.hw });
  }
}

// Keep the land along every shore free for promenades, beaches and quays.
const BUILT_ZONES = new Set([Z.CITY, Z.SOUTH, Z.WEST, Z.NORTH, Z.ISLE, Z.KEY, Z.GULL]);
const builtAt = (m, i) => BUILT_ZONES.has(m.zone[i]) && !!STYLE[DISTRICTS[m.dist[i]].style];
function waterfrontStrip(m) {
  const W = MAP_W;
  for (let i = 0; i < W * MAP_H; i++) {
    if (!builtAt(m, i) || m.lake[i]) continue;
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
  ALL_PARKS = [{ ...PARK, pond: true, pitch: true }, ...PARKS.map((q) => ({ ...q, pond: !q.lake && !q.pitch }))];
  const free = new Uint8Array(W * MAP_H);
  for (let i = 0; i < W * MAP_H; i++) {
    if (builtAt(m, i) && m.tiles[i] === T.GRASS && !m.reserve[i]) free[i] = 1;
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
      // parks and the stadium: the first big block inside one is laid out; any others stay green
      const pk = ALL_PARKS.find((q) => best.x >= q.x0 - 3 && best.x + best.w <= q.x1 + 3 && best.y >= q.y0 - 3 && best.y + best.h <= q.y1 + 3);
      if (pk) {
        if (!pk.used && best.w >= 24 && best.h >= 24) { pk.used = true; blk.park = { label: pk.label, pond: !!pk.pond, pitch: !!pk.pitch }; } else blk.green = true;
      }
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

let ALL_PARKS = [];

// A block side "faces a street" when the tiles just outside it are mostly pavement or road.
function facesStreet(m, b, face) {
  if (face === 'E' || face === 'W') {
    const x = face === 'E' ? b.x + b.w : b.x - 1;
    let ok = 0;
    for (let y = b.y; y < b.y + b.h; y++) { const t = m.tileAt(x, y), t2 = m.tileAt(face === 'E' ? x + 1 : x - 1, y); if (t === T.SIDEWALK || t === T.ROAD || t === T.PLAZA || t2 === T.ROAD) ok++; }
    return ok >= b.h * 0.35;
  }
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
// A door must open onto open ground. Where two blocks meet with no street between them, a plain
// roofed building across the way can end up right in front of someone's door: it gives up its
// front rows to paving.
function clearDoorways(m) {
  for (const b of m.buildings) {
    if (b.prefab < 0 || !b.door) continue;
    const at = m.bld[b.door.ty * MAP_W + b.door.tx];
    const r = at >= 0 ? m.buildings[at] : null;
    if (!r || r.kind !== 'roof' || r.gone) continue;
    const cut = Math.min(r.th, b.door.ty - r.ty + 2);
    const ground = DISTRICTS[m.dist[r.ty * MAP_W + r.tx]].ground;
    for (let ty = r.ty; ty < r.ty + cut; ty++) for (let tx = r.tx; tx < r.tx + r.tw; tx++) { m.set(tx, ty, ground === T.WATER ? T.PLAZA : ground); m.bld[ty * MAP_W + tx] = -1; }
    r.ty += cut; r.th -= cut;
    const roof = m.roofs[r.roof];
    roof.ty = r.ty; roof.th = r.th;
    if (r.th < 2) { r.gone = true; roof.gone = true; for (let ty = r.ty; ty < r.ty + r.th; ty++) for (let tx = r.tx; tx < r.tx + r.tw; tx++) { m.set(tx, ty, ground === T.WATER ? T.PLAZA : ground); m.bld[ty * MAP_W + tx] = -1; } }
  }
}

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
// A lot of this kind in this row: the painted lot's own size, or (World v2 rows) a real-sized lot -
// at least the kind's narrowest, at most its widest or what's left, as deep as the row allows.
function lotDims(row, key, avail) {
  if (!row.v2) return { tw: PREFABS[key].tw, th: PREFABS[key].th };
  const L = LOT[key] || [PREFABS[key].tw, PREFABS[key].tw, PREFABS[key].th];
  return { tw: Math.min(L[1], Math.max(L[0], avail)), th: Math.min(row.h, L[2]) };
}
function rowFits(row, pf, iv) {
  if (row.v2) { const L = LOT[pf]; return !!L && iv[1] - iv[0] >= L[0] && row.h >= Math.ceil(L[2] * 0.62); }
  if (PREFABS[pf].th > row.h) return false;
  return iv[1] - iv[0] >= PREFABS[pf].tw;
}

function placeSpecials(m, rows, rand) {
  const order = SPECIALS.map((s, i) => ({ ...s, i })).sort((a, b) => PREFABS[b.prefab].tw - PREFABS[a.prefab].tw);
  // Two rounds: first every business looks for a lot in its own district (so a big one from elsewhere
  // can't take the only lot a district has for its own); then the rest look in the districts named as
  // their second home (alt), elsewhere on the same part of the world, then for a smaller lot there, and
  // only then anywhere at all (a World v2 row hosts a special on a real-sized lot: lotDims).
  const later = [];
  for (const sp of order) if (!placeSpecial(m, rows, rand, sp, [0, 1])) later.push(sp);
  for (const sp of later) {
    if (placeSpecial(m, rows, rand, sp, [5]) || placeSpecial(m, rows, rand, sp, [5], 0.75) || placeSpecial(m, rows, rand, sp, [2]) || placeSpecial(m, rows, rand, sp, [0, 2], 0.75)
      || placeSpecial(m, rows, rand, sp, [3, 4]) || placeSpecial(m, rows, rand, sp, [0, 1, 2, 3, 4], 0.6)) continue;
    throw new Error(`city generator: no room for ${sp.prefab} (${sp.names[0]})`);
  }
}
function placeSpecial(m, rows, rand, sp, passes, shrink = 1) {
  const fits = (row, iv) => (shrink < 1 && row.v2 ? !!LOT[sp.prefab] && iv[1] - iv[0] >= Math.ceil(LOT[sp.prefab][0] * shrink) && row.h >= Math.ceil(LOT[sp.prefab][2] * 0.62 * shrink) : rowFits(row, sp.prefab, iv));
  // the boat shop wants the water: any south-facing row in the city near the sea
  const seaSide = sp.biz.includes('marina');
  const nearSea = (row) => m.distSea[Math.min(MAP_H - 1, row.y + row.h) * MAP_W + row.x + (row.w >> 1)] < 24 * 4;
  let cands = [];
  if (seaSide) for (const row of rows) {
    if (row.face !== 'S' || !nearSea(row) || m.zoneAt(row.x * TILE, row.y * TILE) !== Z.CITY) continue;
    for (let k = 0; k < row.iv.length; k++) if (fits(row, row.iv[k])) cands.push([row, k]);
  }
  // a building drawn with its front at the bottom (hospitals, stations, shops...) only goes on the
  // north side of a street, facing south, so it's never upside-down; others may face either way
  const upright = !PREFABS[sp.prefab].rot;
  for (const pass of passes) {
    if (cands.length) break;
    for (const row of rows) {
      if ((pass <= 1 || pass === 4) && row.d !== sp.d) continue;
      if (pass === 5 && !(sp.alt || []).includes(row.d)) continue;
      if (pass === 2 && m.zoneAt(row.x * TILE, row.y * TILE) !== m.zoneAt(...seedOf(sp.d))) continue;
      if (pass === 1 && upright) continue;
      if (row.face !== 'S' && pass !== 1 && pass !== 4) continue;
      for (let k = 0; k < row.iv.length; k++) if (fits(row, row.iv[k])) cands.push([row, k]);
    }
    if (cands.length) break;
  }
  if (!cands.length) return false;
  if (seaSide) { const near = cands.filter(([row]) => nearSea(row)); if (near.length) cands = near; const home = cands.filter(([row]) => row.d === sp.d); if (home.length) cands = home; }
  // prefer lots near the heart of the district
  const [sx, sy] = seedOf(sp.d);
  cands.sort((a, b) => Math.hypot(a[0].x * TILE - sx, a[0].y * TILE - sy) - Math.hypot(b[0].x * TILE - sx, b[0].y * TILE - sy));
  const [row, k] = cands[Math.floor(rand() * Math.min(cands.length, 4))];
  const iv = row.iv[k];
  const pf = lotDims(row, sp.prefab, iv[1] - iv[0]);
  if (row.v2) { pf.tw = Math.min(pf.tw, iv[1] - iv[0]); pf.th = Math.min(pf.th, row.h); }
  const slack = iv[1] - iv[0] - pf.tw;
  const x = iv[0] + (rand() < 0.5 ? 0 : slack);
  placePrefab(m, row, sp.prefab, x, sp, rand, row.v2 ? pf : null);
  row.iv.splice(k, 1, [iv[0], x], [x + pf.tw, iv[1]]);
  row.iv = row.iv.filter((v) => v[1] - v[0] > 0);
  return true;
}
function seedOf(d) {
  const s = SEEDS.filter((q) => q[0] === d);
  if (!s.length) return [800 * TILE, 500 * TILE];
  return [s.reduce((a, q) => a + q[1], 0) / s.length * TILE, s.reduce((a, q) => a + q[2], 0) / s.length * TILE];
}

// Estates inside the city: beach houses on Sunset Beach's rows (a house plus its garage).
function claimEstates(m, rows, out, rand) {
  const want = [['beach', 'house8'], ['beach', 'house3'], ['beach', 'house7']];
  const used = [];
  for (const [type, key] of want) {
    const pf0 = PREFABS[key];
    const cands = [];
    for (const row of rows) {
      const pf = lotDims(row, key, 0);
      const need = pf0.cars ? pf.tw : pf.tw + 4; // a painted house brings its own garage and driveway
      if (DISTRICTS[row.d].style !== 'beach' || row.h < (row.v2 ? Math.ceil(LOT[key][2] * 0.62) : pf.th) || row.face !== 'S') continue;
      for (let k = 0; k < row.iv.length; k++) if (row.iv[k][1] - row.iv[k][0] >= need) cands.push([row, k]);
    }
    const ok = cands.filter(([row]) => used.every((q) => Math.hypot(q.x - row.x, q.y - row.y) > 30));
    const pool0 = ok.length ? ok : cands;
    // Sunset Beach gets one, the other beaches the rest (the strip's blocks are few)
    const sunset = pool0.filter(([row]) => row.d === 10), other = pool0.filter(([row]) => row.d !== 10);
    const pool = !out.some((e) => e[5] === 10) && sunset.length ? sunset : other.length ? other : pool0;
    const pick = pool[Math.floor(rand() * Math.max(1, pool.length))];
    if (!pick) continue;
    const [row, k] = pick;
    const iv = row.iv[k];
    const x = iv[0];
    const pf = lotDims(row, key, 0);
    const need = pf0.cars ? pf.tw : pf.tw + 4;
    const y = row.face === 'S' ? row.y + row.h - pf.th : row.y;
    out.push([type, key, x, y, row.face === 'S', row.d, row.v2 ? pf : null]);
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
      // a long town block is a continuous frontage: few gaps, and a gap is a brick-walled yard or a
      // narrow passage, not an open lot
      const walled = URBAN.has(DISTRICTS[row.d].style) && row.w >= 30;
      if (rem >= 6 && rand() < (walled ? 0.06 : 0.12)) { const gw = Math.min(rem, 4 + Math.floor(rand() * 4)); if (walled) walledGap(m, row, x, gw, rand); else filler(m, row, x, gw, sty, rand); x += gw; continue; }
      const keys = Object.keys(sty.gen);
      const fits = keys.filter((k) => rowFits(row, k, [x, b]) && !(!PREFABS[k].rot && row.face === 'N')); // fronts drawn at the bottom never face north (upside-down)
      if (!fits.length) { if (walled && rem <= 12) walledGap(m, row, x, rem, rand); else filler(m, row, x, rem, st, rand); break; }
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

// dims (World v2): the lot's real size, the building scaled into it the way the prefab sits in its own lot.
function placePrefab(m, row, key, x, special, rand, dims = null) {
  const pf = dims ? scaledPrefab(PREFABS[key], dims.tw, dims.th, key) : PREFABS[key];
  const rot = row.face === 'N' && pf.rot ? 2 : 0; // a painted 3/4 lot is never turned upside-down (out in the country it just faces south)
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
  m.prefabs.push({ key, tx: x, ty: y, tw: pf.tw, th: pf.th, rot, d: row.d, ...(dims ? { solid: pf.solid } : {}) });
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
  const isHome = !special && (key.startsWith('house') || key.startsWith('apt') || key.startsWith('shanty'));
  if (special) {
    special.biz.forEach((kind, i) => {
      const dd = doors[Math.min(i, doors.length - 1)];
      const label = special.names[i] || special.names[0];
      if (kind === 'construction') { m.dropSites.push({ x: (x + pf.tw * 0.15) * TILE, y: (y + pf.th * 0.85) * TILE, name: 'the construction site' }); return; }
      const poi = { id: m.pois.length, kind, label, x: dd.px, y: dd.py, r: kind === 'delivery' ? 40 : 48, b: bid };
      if (key.startsWith('shops')) poi.fixed = true; // a painted storefront keeps the business its sign says
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
        // the branch's cash machine: the one painted beside its door, or one set into the wall
        if (PAINTED_ATM[key] !== undefined && !onSubwayPlaza(m, (x + PAINTED_ATM[key] * pf.tw) * TILE, (b.ty + b.th) * TILE + 26)) m.pois.push({ id: m.pois.length, kind: 'atm', label: 'ATM', x: (x + PAINTED_ATM[key] * pf.tw) * TILE, y: (b.ty + b.th) * TILE + 26, r: 36 });
        else if (![-64, 64, -100, 100].some((dx) => wallAtm(m, b, dd.px + dx, 'bank'))) wallAtm(m, b, dd.px + (dd.px - 64 > b.tx * TILE + 20 ? -64 : 64), 'bank', true);
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
    const shack = key.startsWith('shanty');
    const price = shack ? 6000 : apt ? (dist.tier === 'lux' ? 30000 : dist.tier === 'low' || dist.tier === 'rough' ? 11000 : 15000) : (dist.turf ? 12000 : dist.tier === 'lux' ? 60000 : 25000);
    const gx = (x + (rot === 0 ? pf.tw * 0.22 : pf.tw * 0.78)) * TILE;
    const gy = rot === 0 ? (y + pf.th - 2.2) * TILE : (y + 2.2) * TILE;
    const home = { id, kind: apt ? 'apartment' : shack ? 'shack' : 'house', name: `${dist.name} ${apt ? 'Apt' : shack ? 'Shack' : 'House'} #${id + 1}`, price, slots: apt ? 2 : shack ? 1 : 3, x: dd.px, y: dd.py, garage: { x: gx, y: gy, a: rot === 0 ? -Math.PI / 2 : Math.PI / 2 }, b: bid };
    m.homes.push(home);
    m.pois.push({ id: m.pois.length, kind: 'home', home: id, label: home.name, x: dd.px, y: dd.py, r: 40, b: bid });
    b.home = id;
  } else if (key !== 'gas' && key !== 'construction') {
    m.pois.push({ id: m.pois.length, kind: 'delivery', label: b.name, x: doors[0].px, y: doors[0].py, r: 40, b: bid });
  }
  // a v2 strip mall: its car park in front, bays nose-in toward the shops
  if (dims && key === 'strip' && pf.th - sy1 >= 5) {
    const yy = y + sy1 + 2;
    for (let sx = x + 1; sx + 2 <= x + pf.tw - 1; sx += 2) {
      m.parking.push({ x: (sx + 1) * TILE, y: yy * TILE, a: -Math.PI / 2 });
      m.stalls.push({ x: sx * TILE, y: (yy - 2) * TILE, w: 2 * TILE, h: 4 * TILE });
    }
  }
  // the cars painted on the lot were painted out: their spots are parking where a real one may stand
  if (pf.cars) {
    const spots = pf.cars.map(([fx, fy, a]) => ({ x: (x + fx * pf.tw) * TILE, y: (y + fy * pf.th) * TILE, a, drive: true }));
    for (const sp of spots) m.parking.push(sp);
    const h = b.home !== undefined ? m.homes[b.home] : null;
    if (h && spots.length) h.garage = { x: spots[0].x, y: spots[0].y, a: spots[0].a }; // your car comes out onto the driveway
  }
  if (key === 'construction') m.dropSites.push({ x: (x + 1.5) * TILE, y: (y + pf.th - 1.5) * TILE, name: 'the construction site' });
  if (key === 'industrial' && row.d === 3 && !m.dropSites.some((s) => s.name === 'the industrial yards')) m.dropSites.push({ x: (x + pf.tw / 2) * TILE, y: (rot === 0 ? y + pf.th - 1 : y + 1) * TILE, name: 'the industrial yards' });
  return b;
}

// Procedural flat-roof building filling a leftover lot (GTA-style dense blocks). The renderer
// draws the roof (parapet, texture, AC units, vents, skylights, helipads) from r.kind + r.seed.
function roofBuilding(m, row, x, y, w, h, st, rand) {
  // a long run is never one long building: it's a row of separate buildings of different widths,
  // roofs and heights standing shoulder to shoulder (the widths come from where they stand, so the
  // rest of the city's random draws don't move)
  if (w > 13 && h >= 4) {
    let x0 = x;
    const kinds = st.roofKinds || ['tar'];
    while (x0 < x + w) {
      const left = x + w - x0;
      let bw = left <= 13 ? left : 5 + Math.floor(hash2(x0, y, 301) * 8);
      if (left - bw < 4) bw = left;
      const kind = kinds[Math.floor(hash2(x0, y, 302) * kinds.length)];
      roofOne(m, row, x0, y, bw, h, kind, Math.floor(hash2(x0, y, 303) * 1e9));
      x0 += bw;
    }
    rand(); rand(); // the same draws as one building, so nothing else in the city moves
    return;
  }
  const kinds = st.roofKinds || ['tar'];
  const kind = kinds[Math.floor(rand() * kinds.length)];
  roofOne(m, row, x, y, w, h, kind, Math.floor(rand() * 1e9));
}
function roofOne(m, row, x, y, w, h, kind, seed) {
  const bid = m.buildings.length;
  const r = { tx: x, ty: y, tw: w, th: h, kind, seed, d: row.d, b: bid };
  m.roofs.push(r);
  m.buildings.push({ id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind: 'roof', name: 'Building', business: null, signs: [] });
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * MAP_W + tx] = bid; }
}

// ---------------------------------------------------------------------------
// World v2 lots (docs/WORLD-V2.md): Metro City's blocks are filled with real-sized buildings. A person is
// 42 px (1.75 m), so a metre is 24 px, three quarters of a tile: shopfronts 6-12 m (5-9 tiles), houses
// 10-15 m on their lots, downtown towers 20-40 m (16-30 tiles). LOT: [narrowest, widest, depth] in tiles
// for each kind of building (the prefab's own layout - where the building stands in its lot, the doors,
// the parking - is scaled into the lot).
const LOT = {
  tower1: [16, 24, 22], tower2: [18, 28, 26], hotel: [16, 22, 20], bank: [16, 20, 16], bank2: [14, 18, 14], theatre: [14, 18, 18],
  vellori: [9, 12, 14], monarch: [9, 12, 14], royale: [8, 10, 12], diamond: [8, 11, 12], crown: [8, 11, 12], boutique: [9, 12, 12],
  conv: [7, 10, 12], quickstop: [8, 11, 13], liquor: [7, 10, 12], rest1: [6, 9, 12], rest2: [6, 9, 12], diner: [7, 10, 12],
  redawning: [6, 9, 12], greenbistro: [6, 9, 12], arcade: [7, 9, 13], tattoo: [5, 7, 12], club: [10, 13, 14], clubnova: [12, 16, 14],
  clubeclipse: [12, 16, 14], shops1: [30, 36, 12], shops2: [30, 36, 12], strip: [24, 30, 22], trail: [12, 16, 14], motors: [18, 22, 18],
  dealer: [20, 26, 18], fuel: [16, 20, 12], gas: [14, 18, 14], repair: [12, 15, 14], beachbar: [12, 16, 12],
  apt1: [10, 14, 16], apt2: [10, 14, 16], apt3: [16, 22, 14], apt4: [14, 18, 16],
  house1: [11, 14, 18], house2: [11, 14, 18], house3: [11, 14, 18], house4: [12, 15, 18], house5: [12, 15, 18], house6: [14, 18, 20],
  house7: [11, 14, 18], house8: [11, 14, 18], house9: [11, 14, 18], shanty1: [8, 11, 12], shanty2: [8, 11, 12], shanty3: [8, 11, 12],
  hospital: [26, 32, 22], police: [28, 34, 18], police2: [20, 26, 18], police3: [18, 24, 16], fire: [14, 18, 14], school: [22, 28, 20],
  church: [12, 16, 18], warehouse: [20, 28, 24], industrial: [26, 34, 24], construction: [16, 22, 18], junkyard: [20, 26, 18], pool: [18, 22, 16],
  park: [14, 18, 14], tackle2: [12, 16, 10], shack: [10, 13, 12], farmstead: [18, 22, 14],
};
// How deep a row of fronts is, by district (tiles); and how wide the plain buildings are (the backs
// along a street to the north, the infill).
const V2DEPTH = { towers: [20, 28], civic: [16, 26], commercial: [12, 18], nightlife: [12, 16], redlight: [11, 15], oldtown: [8, 12], apartments: [13, 18],
  southside: [10, 15], industrial: [18, 28], factory: [18, 28], harbor: [18, 28], beach: [12, 18], luxury: [14, 22], houses: [14, 20], park: [10, 14] };
const V2W = { towers: [16, 26], civic: [16, 26], commercial: [6, 12], nightlife: [6, 12], redlight: [6, 10], oldtown: [4, 8], apartments: [10, 16],
  southside: [7, 12], industrial: [18, 32], factory: [18, 32], harbor: [18, 32], beach: [8, 14], luxury: [12, 20], houses: [10, 14], park: [8, 12] };
// Metro City is World v2 (the whole central island north of the river, and Southside south of it).
const v2At = (m, b) => { const i = (b.y + (b.h >> 1)) * MAP_W + b.x + (b.w >> 1); return m.zone[i] === Z.CITY || m.dist[i] === 6; };

// Where the building stands in a v2 lot that needs open ground (fractions of the lot): the police station's
// yard for its motor pool, the car dealer's display lot, the strip mall's car park, the school yard, the
// warehouse's loading yard.
const V2_SOLID = { police: [0, 0, 0.62, 0.78], dealer: [0, 0, 0.6, 0.5], motors: [0, 0, 0.7, 0.55], strip: [0, 0, 1, 0.56], school: [0, 0, 1, 0.66], warehouse: [0, 0, 1, 0.7] };
// A prefab's layout in a lot of another size: the building and its yards scaled with the lot.
function scaledPrefab(pf, tw, th, key = null) {
  const sx = tw / pf.tw, sy = th / pf.th;
  const f = key && V2_SOLID[key];
  const [a, b, c, d] = f ? [f[0] * pf.tw, f[1] * pf.th, f[2] * pf.tw, f[3] * pf.th] : pf.solid;
  const x0 = Math.round(a * sx), y0 = Math.round(b * sy);
  const x1 = Math.max(x0 + 2, Math.round(c * sx)), y1 = Math.max(y0 + 2, Math.round(d * sy));
  return { ...pf, tw, th, solid: [x0, y0, Math.min(tw, x1), Math.min(th, y1)] };
}

// What lies just outside one side of a block: 'street' (pavement, a street's asphalt, a plaza), 'alley'
// (an alley's asphalt) or null (more land, water...).
function frontage(m, b, face) {
  let street = 0, alley = 0, n = 0;
  const look = (tx, ty) => {
    n++;
    const t = m.tileAt(tx, ty);
    if (t === T.SIDEWALK || t === T.PLAZA) street++;
    else if (t === T.ROAD || t === T.BRIDGE) { if (m.roadRank[ty * MAP_W + tx] === 1) alley++; else street++; }
  };
  if (face === 'S' || face === 'N') { const y = face === 'S' ? b.y + b.h : b.y - 1; for (let x = b.x; x < b.x + b.w; x++) look(x, y); }
  else { const x = face === 'E' ? b.x + b.w : b.x - 1; for (let y = b.y; y < b.y + b.h; y++) look(x, y); }
  return street >= n * 0.3 ? 'street' : alley >= n * 0.45 ? 'alley' : null;
}
// Districts built wall to wall: what's left inside a block is built over rather than left open.
const BUILT_UP = new Set(['towers', 'civic', 'commercial', 'nightlife', 'redlight', 'oldtown', 'apartments', 'southside', 'industrial', 'factory', 'harbor']);

// One block of the v2 city. The side on a street to the south is the front: a row of lots facing the
// camera, as deep as the district builds (businesses and homes go there, filled later by placeSpecials
// and fillRowV2). Behind it, or in a block that only reaches a street on its north side, a row of plain
// buildings backs onto that street (their fronts face away from the camera: the backs and roofs of the
// south side of a street). Whatever is left inside is back lots: yards, parking, the odd building.
function v2Block(m, b, rows, rand) {
  const st = DISTRICTS[b.d].style;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  if ((m.plazas || []).some((p) => cx > p.x0 && cx < p.x1 && cy > p.y0 && cy < p.y1)) { plazaFill(m, b, rand); return; }
  const D = V2DEPTH[st] || [12, 18];
  const fS = frontage(m, b, 'S'), fN = frontage(m, b, 'N');
  let y1 = b.y + b.h;
  if (fS === 'street' && b.h >= 6 && b.w >= 5) {
    let depth = Math.min(b.h, D[0] + Math.floor(rand() * (D[1] - D[0] + 1)));
    if (fN === 'street' && b.h >= 2 * D[0] + 2) depth = Math.min(depth, Math.floor(b.h / 2)); // two rows back to back
    if (b.h - depth < 5) depth = b.h;                                                         // no thin strip behind
    rows.push({ b, d: b.d, x: b.x, y: y1 - depth, w: b.w, h: depth, face: 'S', iv: [[b.x, b.x + b.w]], v2: true });
    y1 -= depth;
  }
  const h = y1 - b.y;
  if (h < 3) return;
  const row = { b, d: b.d, x: b.x, y: b.y, w: b.w, h, face: 'N' };
  if (fN === 'street' || (fN === 'alley' && fS !== 'street')) {
    // the backs along the street to the north (plain buildings, fronts facing away)
    const depth = Math.min(h, D[1] + 2);
    roofRowV2(m, row, b.x, b.y, b.w, h - depth < 4 ? h : depth, st, rand, true);
    if (h - depth >= 4) backLots(m, { ...row, y: b.y + depth, h: h - depth }, st, rand);
  } else if (fS !== 'street' && ((frontage(m, b, 'E') || frontage(m, b, 'W')) && b.w <= 40 || (BUILT_UP.has(st) && b.w >= 4 && h >= 4))) {
    roofRowV2(m, row, b.x, b.y, b.w, h, st, rand, true); // a sliver between side streets, the odd corner of a dense block: built over
  } else backLots(m, row, st, rand);
}

// A run of plain buildings, shoulder to shoulder, each its own width by the district (a long run is never
// one long building). back: their fronts face away from the camera (the renderer shows a plain back wall).
function roofRowV2(m, row, x, y, w, h, st, rand, back = false) {
  const W = V2W[st] || [8, 14];
  const kinds = (STYLE[st] && STYLE[st].roofKinds) || ['tar'];
  let x0 = x;
  while (x0 < x + w) {
    const left = x + w - x0;
    let bw = left <= W[1] ? left : W[0] + Math.floor(rand() * (W[1] - W[0] + 1));
    if (left - bw < W[0]) bw = left;
    if (bw < 3) break;
    roofOne(m, row, x0, y, bw, h, kinds[Math.floor(rand() * kinds.length)], Math.floor(rand() * 1e9));
    if (back) m.buildings[m.buildings.length - 1].back = true;
    x0 += bw;
  }
}

// Back lots: the inside of a block behind its buildings - car parks, yards, now and then another building.
function backLots(m, row, st, rand) {
  const S = STYLE[st] || STYLE.commercial;
  const { x, y, w, h } = row;
  // the yards and works of the industrial blocks: sheds and warehouses with their yards between
  if ((st === 'industrial' || st === 'factory' || st === 'harbor') && w >= 10 && h >= 10) {
    const bh = Math.min(h, 14 + Math.floor(rand() * 10));
    roofRowV2(m, row, x, y, w, bh, st, rand, true);
    if (h - bh >= 4) filler(m, { ...row, y: y + bh, h: h - bh, face: 'S' }, x, w, { ...S, roof: 0, filler: 'yard' }, rand, false);
    return;
  }
  if (w >= 6 && h >= 6 && rand() < (BUILT_UP.has(st) ? 0.7 : 0.4)) { roofRowV2(m, row, x, y, w, h, st, rand, true); return; }
  filler(m, { ...row, face: 'S' }, x, w, { ...S, roof: 0, filler: st === 'towers' || st === 'civic' ? 'plaza' : S.filler === 'park' ? 'park' : 'parking' }, rand, false);
}

// The scraps of land the blocks leave along a diagonal or curving street (too small or too ragged for a
// row of lots): in the dense districts of the v2 city, small buildings step along the street's edge the
// way axis-aligned boxes have to (docs/WORLD-V2.md), instead of a sawtooth of empty paving.
function fillScraps(m, rand) {
  const W = MAP_W;
  const free = new Uint8Array(W * MAP_H);
  for (const i of m.leftover) {
    const t = m.tiles[i], st = DISTRICTS[m.dist[i]].style;
    if (m.bld[i] < 0 && !m.reserve[i] && BUILT_UP.has(st) && (t === T.PLAZA || t === T.LOT || t === T.GRASS) && v2At(m, { x: i % W, y: (i / W) | 0, w: 1, h: 1 })) free[i] = 1;
  }
  const order = m.leftover.slice().sort((a, b) => a - b);
  for (const i0 of order) {
    if (!free[i0]) continue;
    const x0 = i0 % W, y0 = (i0 / W) | 0, st = DISTRICTS[m.dist[i0]].style;
    const Wm = (V2W[st] || [8, 14])[1];
    let w = 0;
    while (w < Wm && free[y0 * W + x0 + w]) w++;
    if (w < 4) continue;
    let h = 0;
    while (h < 20) { let ok = true; for (let x = x0; x < x0 + w; x++) if (!free[(y0 + h) * W + x]) { ok = false; break; } if (!ok) break; h++; }
    if (h < 4) continue;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) free[y * W + x] = 0;
    const kinds = (STYLE[st] && STYLE[st].roofKinds) || ['tar'];
    roofOne(m, { d: m.dist[i0] }, x0, y0, w, h, kinds[Math.floor(rand() * kinds.length)], Math.floor(rand() * 1e9));
  }
}

// An open square: paving, a fountain in the middle, trees and benches round it, lamps at the corners.
function plazaFill(m, b, rand) {
  m.fill(b.x, b.y, b.w, b.h, T.PLAZA);
  const cx = (b.x + b.w / 2) * TILE, cy = (b.y + b.h / 2) * TILE;
  if (b.w >= 8 && b.h >= 8) addProp(m, 'fountain', cx, cy, 36);
  for (let k = 0; k < Math.min(10, Math.floor((b.w * b.h) / 60)); k++) {
    const a = (k / 10) * Math.PI * 2 + rand(), r = 0.35 + rand() * 0.1;
    const x = cx + Math.cos(a) * b.w * TILE * r, y = cy + Math.sin(a) * b.h * TILE * r;
    addProp(m, k % 3 === 0 ? 'tree_b' : k % 3 === 1 ? 'bench_m' : 'planter_sq', x, y, k % 3 === 0 ? 12 : 0);
  }
  for (const [fx, fy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) if (b.w >= 10 && b.h >= 10) addProp(m, 'lamp', (b.x + b.w * fx) * TILE, (b.y + b.h * fy) * TILE);
  m.squares ||= [];
  m.squares.push({ x: b.x, y: b.y, w: b.w, h: b.h });
}

// A row of fronts in the v2 city: real-sized lots of the district's kinds side by side, the gaps between
// them walled yards or narrow passages; the neighbouring district's style creeps in near a border.
function fillRowV2(m, row, rand) {
  const style = DISTRICTS[row.d].style;
  const st = STYLE[style];
  const near = [];
  for (const [dx, dy] of [[-14, 0], [14 + row.w, 0], [row.w / 2, -12], [row.w / 2, row.h + 12]]) {
    const d = m.dist[Math.max(0, Math.min(MAP_H - 1, Math.floor(row.y + dy))) * MAP_W + Math.max(0, Math.min(MAP_W - 1, Math.floor(row.x + dx)))];
    if (d !== row.d && STYLE[DISTRICTS[d].style] && DISTRICTS[d].style !== 'park') near.push(STYLE[DISTRICTS[d].style]);
  }
  const minW = Math.min(...Object.keys(st.gen).filter((k) => LOT[k]).map((k) => LOT[k][0]));
  for (const [a, b] of row.iv) {
    let x = a;
    while (x < b) {
      const rem = b - x;
      const sty = near.length && rand() < 0.25 ? near[Math.floor(rand() * near.length)] : st;
      const walled = URBAN.has(style);
      if (rem >= minW + 4 && rand() < (walled ? 0.05 : 0.1)) { const gw = Math.min(rem, 3 + Math.floor(rand() * 3)); if (walled) walledGap(m, row, x, gw, rand); else filler(m, row, x, gw, sty, rand); x += gw; continue; }
      const fits = Object.keys(sty.gen).filter((k) => rowFits(row, k, [x, b]));
      if (!fits.length) {
        if (rem >= 3) roofRowV2(m, row, x, row.y, rem, row.h, style, rand);
        break;
      }
      let tot = 0;
      for (const k of fits) tot += sty.gen[k];
      let r = rand() * tot, pick = fits[0];
      for (const k of fits) { r -= sty.gen[k]; if (r <= 0) { pick = k; break; } }
      const L = LOT[pick];
      let tw = Math.min(rem, L[0] + Math.floor(rand() * (L[1] - L[0] + 1)));
      if (rem - tw < minW) tw = rem - tw < 3 && rem <= L[1] + 4 ? rem : tw; // no sliver left over at the end
      const th = Math.min(row.h, L[2] + Math.floor(rand() * 3));
      placePrefab(m, row, pick, x, null, rand, { tw, th });
      x += tw;
    }
  }
}

// Bank branches (one per part of the world that lacks one) and street ATMs (up to two per
// district), made from existing storefronts so the city layout doesn't move.
function buildBanking(m) {
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  const walk = (x, y) => { const t = m.tileAtPx(x, y); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.GRASS; };
  const addAtm = (b, x, side) => { if (b && ![1.6, -1.6, 2.4, -2.4].some((k) => wallAtm(m, b, x + side * k, 'bank'))) wallAtm(m, b, x + side * 1.6, 'bank', true); };
  const shops = () => m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && !p.fixed);
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
    addAtm(b, c.x, side);
  }
}

// Cash machines. Nearly all of them are set into a building front: against the wall beside a
// shop, bank or bar door, on the pavement in front (wallAtm). Every district with streets gets a
// few - busy districts more - spread out and preferring spots near shops and landmarks; the
// nightclubs and some corner stores have one inside. Only where a district has no building
// front to use at all does a freestanding kiosk go up, at the edge of the pavement. Deposits are
// quick (see server/systems/economy.js), so cash need never be carried far.
const ATM_TARGET = { towers: 5, commercial: 5, nightlife: 4, redlight: 4, oldtown: 4, civic: 4, apartments: 4, southside: 4, houses: 3, luxury: 3, beach: 3, harbor: 3, industrial: 3, factory: 2, park: 2, airport: 2, rural: 2, desert: 2, rocky: 0, wild: 1, water: 0 };
const ATM_SPACING = 700;
// lots with a cash machine painted beside the door: x fraction of the lot (no sprite needed)
const PAINTED_ATM = { bank2: 0.488 };
const ATM_LOOKS = ['blue', 'red', 'green', 'gold', 'grey', 'canopy', 'leaf', 'hood', 'recess', 'cash', 'wood', 'frame'];
const NO_ATM_FRONT = /^(house|apt|shanty|shack|farm|estate|church|school|park|construction|site|junkyard|pool)/;
const FOOT = new Set([T.SIDEWALK, T.PLAZA, T.LOT]);

// Can a cash machine stand against building b's front at x (world px)? Its base is on paving
// right below the wall, clear of doors, other machines and street furniture.
const FOOT_LOOSE = new Set([T.SIDEWALK, T.PLAZA, T.LOT, T.DIRT, T.GRASS, T.SAND]);
function atmSpot(m, b, x, loose = false) {
  const F = loose ? FOOT_LOOSE : FOOT;
  const wy = (b.ty + b.th) * TILE;
  if (onSubwayPlaza(m, x, wy + 8)) return false;
  if (x < b.tx * TILE + 22 || x > (b.tx + b.tw) * TILE - 22) return false;
  for (const dx of [-18, 0, 18]) if (m.tileAtPx(x + dx, wy - 6) !== T.BUILDING || !F.has(m.tileAtPx(x + dx, wy + 8))) return false;
  if (!FOOT_LOOSE.has(m.tileAtPx(x, wy + 36))) return false; // room to stand at it
  for (const p of m.pois) if (Math.abs(p.x - x) < 52 && p.y > wy - 8 && p.y < wy + 60) return false; // a door (or another ATM) right there
  for (const q of m.props) if (Math.abs(q.x - x) < 30 && Math.abs(q.y - wy) < 40) return false;
  for (const pu of m.pumps || []) if (Math.hypot(pu.x - x, pu.y - wy) < 60) return false;
  return true;
}
function wallAtm(m, b, x, look, force = false, loose = false) {
  if (!force && !atmSpot(m, b, x, loose)) return null;
  const wy = (b.ty + b.th) * TILE;
  addProp(m, 'atmw', x, wy + 5, 11, { v: look });
  const poi = { id: m.pois.length, kind: 'atm', label: 'ATM', x, y: wy + 28, r: 36 };
  m.pois.push(poi);
  return poi;
}

function buildStreetAtms(m) {
  const atms = m.pois.filter((p) => p.kind === 'atm');
  const distAt = (x, y) => m.dist[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)];
  // inside: every nightclub, and every other corner store ("ATM inside")
  let shop = 0;
  for (const bid of m.walkIns || []) {
    const b = m.buildings[bid], wi = b.walkIn;
    for (const u of wi.units) {
      if (u.kind !== 'club' && !(u.kind === 'convenience' && shop++ % 2 === 0)) continue;
      const dir = wi.south ? 1 : -1;
      const row = u.counterRow + dir * 2; // in the room, a step out from the counter
      if (row < wi.y0 || row > wi.y1) continue;
      const doorX = u.door.tx + 1;
      const col = Math.abs(u.x0 - doorX) >= 3 ? u.x0 : Math.abs(u.x1 - doorX) >= 3 ? u.x1 : -1;
      if (col < 0) continue;
      const x = (col + 0.5) * TILE + (col === u.x0 ? 2 : -2), y = (row + 1) * TILE - 3;
      addProp(m, 'atmw', x, y, 11, { v: u.kind === 'club' ? 'neon' : 'allday', inside: bid });
      const poi = { id: m.pois.length, kind: 'atm', label: 'ATM', x, y: y + 22, r: 36, b: bid };
      m.pois.push(poi);
      atms.push(poi);
    }
  }
  // building fronts: three spots along each one that isn't a home / chapel / yard
  const cands = DISTRICTS.map(() => []);
  // (out in the country, where the stores front onto dirt and grass, the base may stand on that)
  const strict = DISTRICTS.map(() => 0);
  for (const loose of [false, true]) for (const b of m.buildings) {
    if (b.gone || b.tw < 3 || b.walkIn && b.walkIn.units.some((u) => u.kind === 'club') || NO_ATM_FRONT.test(b.kind)) continue;
    for (const fx of [0.18, 0.5, 0.82]) {
      const x = Math.round((b.tx + fx * b.tw) * 2) / 2 * TILE;
      const di = distAt(x, (b.ty + b.th) * TILE + 8);
      if (loose && (strict[di] || !['rural', 'desert', 'wild', 'park', 'beach', 'airport', 'factory'].includes(DISTRICTS[di].style))) continue;
      if (!atmSpot(m, b, x, loose)) continue;
      cands[di].push({ b, x, y: (b.ty + b.th) * TILE + 28, prefab: b.prefab >= 0, loose });
      if (!loose) strict[di]++;
    }
  }
  const busy = (c) => m.pois.reduce((n, p) => n + (p.kind !== 'atm' && Math.abs(p.x - c.x) < 360 && Math.abs(p.y - c.y) < 360 ? 1 : 0), 0);
  DISTRICTS.forEach((d, di) => {
    const want = ATM_TARGET[d.style] ?? 2;
    let have = atms.filter((p) => distAt(p.x, p.y) === di).length;
    if (have >= want) return;
    const list = cands[di].map((c) => ({ ...c, w: busy(c) + hash2(c.x | 0, c.y | 0, 7) + (c.prefab ? 2 : 0) })).sort((a, b) => b.w - a.w);
    for (const c of list) {
      if (have >= want) break;
      if (atms.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < ATM_SPACING)) continue;
      const look = d.style === 'nightlife' || d.style === 'redlight' ? (hash2(c.x | 0, c.y | 0, 3) < 0.5 ? 'neon' : 'cash')
        : ATM_LOOKS[Math.floor(hash2(c.x | 0, c.y | 0, 5) * ATM_LOOKS.length)];
      const poi = wallAtm(m, c.b, c.x, look, false, c.loose);
      if (!poi) continue;
      atms.push(poi);
      have++;
    }
    if (!have && d.style !== 'wild' && d.style !== 'rocky') kioskAtm(m, di, atms, ['rural', 'desert'].includes(d.style));
  });
}

// A district with streets but not one building front to use (farm country, the desert): a
// freestanding kiosk at the back edge of the pavement or verge, never out in the middle of it.
// The wild places - woods, peaks, the islets - have none.
function kioskAtm(m, di, atms, loose) {
  const F = loose ? FOOT_LOOSE : FOOT;
  for (let ty = 2; ty < MAP_H - 2; ty++) for (let tx = 2; tx < MAP_W - 2; tx++) {
    const i = ty * MAP_W + tx;
    if (m.dist[i] !== di || !F.has(m.tiles[i]) || m.reserve[i] & 3 || m.deck[i] || hash2(tx, ty, 41) > 0.3) continue;
    // pavement with the road in front (south) and no pavement behind it: the back edge
    if (m.tileAt(tx, ty + 2) !== T.ROAD && m.tileAt(tx, ty + 1) !== T.ROAD) continue;
    const back = m.tileAt(tx, ty - 1);
    if ((!loose && FOOT.has(back)) || back === T.ROAD || back === T.WATER || back === T.DEEP) continue;
    if (m.tileAt(tx - 1, ty) === T.ROAD || m.tileAt(tx + 1, ty) === T.ROAD) continue;
    const x = (tx + 0.5) * TILE, y = ty * TILE + 4;
    if (m.props.some((q) => Math.abs(q.x - x) < 40 && Math.abs(q.y - y) < 40)) continue;
    addProp(m, 'atmw', x, y + 20, 11, { v: 'kiosk' });
    const poi = { id: m.pois.length, kind: 'atm', label: 'ATM', x, y: y + 42, r: 36 };
    m.pois.push(poi);
    atms.push(poi);
    return;
  }
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
  // cabins, lodges and farmhouses out on the other islands
  for (const [type, key, x, y, south] of ISLAND_ESTATES) {
    const pf = PREFABS[key];
    clearArea(m, x - 2, y - 2, pf.tw + 8, pf.th + 4);
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

function estateHouse(m, rand, type, key, x, y, south, dims = null) {
  m.garages ||= [];
  m.mansions ||= [];
  const pf = dims ? scaledPrefab(PREFABS[key], dims.tw, dims.th, key) : PREFABS[key];
  if (!pf.rot) south = true; // painted lots face the camera: they only ever front onto a street to their south
  const d = nearestDist(m, x + 3, y + 7);
  const before = m.homes.length;
  placePrefab(m, { d, y, h: pf.th, face: south ? 'S' : 'N' }, key, x, null, rand, dims);
  const home = m.homes[before];
  if (!home) return;
  const T_ = ESTATE_TYPES[type];
  const n = m.homes.filter((h) => h.kind === type).length + 1;
  home.kind = type; home.name = `${T_.name} #${n}`; home.price = T_.price; home.slots = T_.slots;
  const poi = m.pois.find((q) => q.kind === 'home' && q.home === home.id);
  if (poi) poi.label = home.name;
  // the house's own walk to its door connects to the road too
  driveway(m, Math.floor(home.x / TILE), 1, Math.floor(home.y / TILE) + (south ? 1 : -1), south ? 1 : -1);
  if (!pf.cars) addGarage(m, home, x + pf.tw, south ? y + pf.th - 3 : y, south); // (a painted house has its own garage and driveway)
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
    if (p.kind !== 'delivery' || p.b === undefined || p.fixed) return false;
    const b = m.buildings[p.b];
    return b && b.tw >= 5 && b.th >= 5;
  });
  cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 31) - hash2(b.x | 0, b.y | 0, 31));
  const picked = [];
  const isl = (p) => m.zoneAt(p.x, p.y);
  // one per part of the world first, then anywhere
  for (const pass of [0, 1]) for (const c of cands) {
    if (picked.length >= 7) break;
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
      if (b.gone || b.prefab !== -1 || b.kind !== 'roof' || used.has(b.id) || b.tw < 8 || b.tw > 20 || b.th < 7 || (b.th < 12 && b.tw < 14)) continue; // (room for the cars)
      const gapX = Math.max(0, b.tx - (sb.tx + sb.tw), sb.tx - (b.tx + b.tw));
      const gapY = Math.max(0, b.ty - (sb.ty + sb.th), sb.ty - (b.ty + b.th));
      if (gapX > 3 || gapY > 3) continue;
      // the gate goes on the short side that faces a road
      const south = [1, 2, 3, 4, 5, 6].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty + b.th - 1 + k)); // (across a wide pavement)
      const north = [1, 2, 3, 4, 5, 6].some((k) => isRoad(b.tx + Math.floor(b.tw / 2), b.ty - k));
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
    for (let k = 1; k <= 9; k++) {
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
    if (h < 11 && w >= 14) {
      // a wide, shallow lot: everything parked side by side along the far wall, nose to the gate
      let x = (x0 + 1) * TILE + 30;
      for (const model of POOL_MODELS) { spots.push({ x, y: (far + 0.5) * TILE + dir * 34, a: heading, model }); x += model === 'police' ? 76 : 56; }
    } else for (const model of POOL_MODELS) {
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
  // anything standing there may go, unless it's a business or someone's home
  const busy = new Set(m.pois.map((q) => q.b).filter((b) => b !== undefined));
  const keep = (bi) => bi >= 0 && (busy.has(bi) || m.buildings[bi].home !== undefined || bi === sb.id);
  const spots = [];
  // (deep enough for the cruisers parked nose to tail, or wide enough to park them side by side)
  for (const [w, h] of [[14, 12], [12, 12], [8, 12], [16, 10], [14, 10]]) for (const side of [1, -1]) for (const gap of [1, 2, 3, 0]) {
    const x0 = side > 0 ? sb.tx + sb.tw + gap : sb.tx - w - gap;
    for (const y0 of [sb.ty + sb.th - h, sb.ty, sb.ty + sb.th - h + 2, sb.ty - 2, sb.ty + sb.th - h - 2]) spots.push([x0, y0, w, h]);
  }
  // or the yard right behind the station (a wide, shallow lot; never in front of its doors)
  for (const h of [8, 7]) for (const w of [16, 14]) for (const dx of [0, 1, 2]) spots.push([sb.tx + dx, sb.ty - h, w, h]);
  // or across the street, in the next block up or down (a wide, shallow yard)
  for (const dy of [8, 9, 10, 11, 12, 13, 14]) for (const [w, h] of [[16, 8], [14, 8]]) for (const dx of [0, 2, -2, 4]) {
    spots.push([sb.tx + dx, sb.ty + sb.th + dy - 4, w, h]);
    spots.push([sb.tx + dx, sb.ty - dy - h + 4, w, h]);
  }
  for (const [x0, y0, w, h] of spots) {
    {
      let ok = true;
      for (let ty = y0; ty < y0 + h && ok; ty++) for (let tx = x0; tx < x0 + w; tx++) { const t = m.tileAt(tx, ty); if (t === T.ROAD || t === T.BRIDGE || t === T.WATER || t === T.DEEP || keep(m.bld[ty * MAP_W + tx])) ok = false; }
      if (!ok) continue;
      const south = [1, 2, 3, 4, 5, 6, 7, 8, 9].some((k) => { const t = m.tileAt(x0 + 4, y0 + h - 1 + k); return t === T.ROAD; }); // (across a forecourt and a wide pavement)
      const north = [1, 2, 3, 4, 5, 6, 7, 8, 9].some((k) => { const t = m.tileAt(x0 + 4, y0 - k); return t === T.ROAD; });
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
  const conv = m.pois.filter((p) => p.kind === 'delivery' && m.buildings[p.b] && (m.buildings[p.b].kind === 'conv' || m.buildings[p.b].kind === 'liquor' || m.buildings[p.b].kind === 'quickstop'));
  const distOf = (p) => m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)];
  m.pumps = [];
  const gas = [];
  for (const p of [...conv].sort((a, b) => hash2(a.x | 0, a.y | 0, 41) - hash2(b.x | 0, b.y | 0, 41))) {
    if (m.buildings[p.b].kind === 'liquor' || gas.length >= 5 || gas.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 3500)) continue;
    // needs open paving in front for the pumps
    const ok = [-48, 48].every((dx) => [40, 64].every((dy) => { const t = m.tileAtPx(p.x + dx, p.y + (p.y > m.buildings[p.b].ty * TILE ? dy : -dy)); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT || t === T.GRASS; }));
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
export const WALK_IN = new Set(['club', 'convenience', 'gasstation', 'hospital', 'gunshop', 'sports', 'hardware', 'clothing', 'grocery', 'pawn', 'bank', 'courthouse', 'pharmacy', 'police', 'fence', 'fishmarket', 'coffee', 'tackle']);
const HELPER_POIS = new Set(['reception', 'evidence', 'atm']);
function buildInteriors(m) {
  m.walkIns = [];
  // the nightclubs become walk-ins (their doors open after dark)
  for (const p of m.pois) {
    const b = p.b !== undefined ? m.buildings[p.b] : null;
    if (b && p.kind === 'delivery' && CLUB_LOTS.has(b.kind)) p.kind = 'club';
  }
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
      if (p.kind === 'club') {
        // a roller shutter over the club's doors: down all day, up from dusk till dawn
        const gate = { x: (dx0 + 1) * TILE, y: (fy + 0.5) * TILE, w: 2 * TILE, props: [], rule: 'night', club: true, rect: { tx: b.tx, ty: b.ty, tw: b.tw, th: b.th } };
        for (let gx = dx0 * TILE + 8; gx <= (dx0 + 2) * TILE - 8; gx += 14) gate.props.push(m.addSolidProp(gx, gate.y, 9));
        m.gates.push(gate);
        p.gate = m.gates.length - 1;
      }
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
    // the showroom's own forecourt is the display lot
    const own = m.prefabs[b.prefab];
    if (own) for (let ty = own.ty; ty < own.ty + own.th; ty++) for (let tx = own.tx; tx < own.tx + own.tw; tx++) {
      const t = m.tileAt(tx, ty);
      if ((t === T.GRASS || t === T.PLAZA || t === T.DIRT) && m.bld[ty * MAP_W + tx] < 0) m.set(tx, ty, T.LOT);
    }
    // no open lot round the showroom: the plain building next door is knocked down for one
    let lot = 0;
    for (let ty = b.ty - 8; ty < b.ty + b.th + 8; ty++) for (let tx = b.tx - 8; tx < b.tx + b.tw + 8; tx++) if (m.tileAt(tx, ty) === T.LOT) lot++;
    if (lot < 140) {
      const busy = new Set(m.pois.map((q) => q.b).filter((x) => x !== undefined));
      const nb = m.buildings.filter((o) => !o.gone && o.id !== b.id && !busy.has(o.id) && o.home === undefined && Math.max(0, o.tx - (b.tx + b.tw), b.tx - (o.tx + o.tw)) <= 2 && Math.max(0, o.ty - (b.ty + b.th), b.ty - (o.ty + o.th)) <= 2)
        .sort((p2, q2) => q2.tw * q2.th - p2.tw * p2.th)[0];
      if (nb) {
        nb.gone = true;
        if (nb.roof >= 0 && m.roofs[nb.roof]) m.roofs[nb.roof].gone = true;
        if (nb.prefab >= 0 && m.prefabs[nb.prefab]) m.prefabs[nb.prefab] = { ...m.prefabs[nb.prefab], gone: true, tw: 0, th: 0 };
        for (let ty = nb.ty; ty < nb.ty + nb.th; ty++) for (let tx = nb.tx; tx < nb.tx + nb.tw; tx++) { m.bld[ty * MAP_W + tx] = -1; m.set(tx, ty, T.LOT); }
      } else {
        // nothing to knock down: the lawns and paving round the showroom are paved over for the lot
        for (let ty = b.ty - 8; ty < b.ty + b.th + 8; ty++) for (let tx = b.tx - 8; tx < b.tx + b.tw + 8; tx++) {
          const t = m.tileAt(tx, ty);
          if ((t === T.GRASS || t === T.PLAZA || t === T.DIRT) && m.bld[ty * MAP_W + tx] < 0) m.set(tx, ty, T.LOT);
        }
      }
    }
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
function volleyCourt(m, name, x, y, w, h, margin = 1) {
  m.fill(x - margin, y - 1, w + 2 * margin, h + 2, T.SAND);
  const rect = { x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE };
  const netX = rect.x + rect.w / 2;
  m.addSolidProp(netX, rect.y - 6, 5); m.addSolidProp(netX, rect.y + rect.h + 6, 5);
  m.venues.push({ id: m.venues.length, kind: 'volley', name, rect, netX });
}

// ---- the railway -----------------------------------------------------------------------------
// One big loop round the whole map, all of it at grade: out of Westport through the Westport
// Center grid, over the long bay bridge to Granite Peaks, through Northshore and over the channel
// into Old Town, a long rural run down through the Dry Creek fields, back west through Southside
// and Pine Hills, up through the core (Civic Center, Downtown, Midtown) under the elevated Metro
// Ring, down through The Yards and over the river mouth to Cedar Isle, west across Lake District
// and Cedar Falls, and over the strait back to West Hills. Every road it meets is a level
// crossing with gates; the stations are open-air platforms beside the track. Trains follow
// `rail.pts` by arc length; stations and crossings are positions along it.
export const RAIL_GAUGE = 52;         // px between the outer rails' ties (track bed width ~2 tiles)
// Rolling stock (wire index = position here). Coaches: seat rows either side of the aisle, doors
// in the middle; the mail car carries the strongbox at its back end.
export const TRAIN_CARS = [
  { kind: 'loco', name: 'Locomotive', L: 196, W: 70 },
  { kind: 'coach', name: 'Passenger coach', L: 212, W: 76 },
  { kind: 'mail', name: 'Mail car', L: 188, W: 76 },
];
// What a train is made of (by kind; every third train swaps its last coach for the mail car).
export const CONSIST = ['loco', 'coach', 'coach']; // short enough to stand between two streets at a station
export const CAR_GAP = 10;               // px between coupled cars
export const TRAIN_LEN = CONSIST.reduce((a, k) => a + TRAIN_CARS.find((c) => c.kind === k).L, 0) + CAR_GAP * (CONSIST.length - 1);
export const COACH_SEATS = [-84, -60, -36, 36, 60, 84].flatMap((ox) => [[ox, -23], [ox, 23]]);
export const COACH_STAND = [[-7, -18], [7, -18], [-7, 18], [7, 18], [-72, 0], [-48, 0], [48, 0], [72, 0]];
export const MAIL_BOX = { ox: -58, oy: 0 };              // the strongbox (towards the back of the mail car)
export const MAIL_POSTS = [[40, -18], [40, 18]];          // where the guards stand
export const CROSSING_ARM = 66;                          // gate arms this far either side of the track centre
const RAIL_ROUTE = [ // [tx, ty, 'sub'] corners of the one big loop (rounded); between two 'sub' corners it's a subway tunnel
  [302, 620], [302, 240], [362, 165], [482, 143], [545, 141], [560, 212], [640, 212], [800, 212], [880, 216], [975, 216],
  [975, 432], [1094, 440], [1094, 765], [885, 765], [885, 647, 'sub'], [885, 487, 'sub'], [705, 487, 'sub'], [705, 612, 'sub'], [705, 917],
  [372, 917], [372, 850], [330, 790], [326, 700],
];
const RAIL_STATIONS = [ // [name, tx, ty] nearest point on the line becomes the stop
  ['West Hills', 302, 585], ['Westport Center', 302, 325], ['Granite Peaks', 640, 212], ['Northshore', 915, 215],
  ['Old Town', 975, 375], ['Dry Creek', 1094, 510], ['Southside', 995, 765], ['Civic Center', 885, 540],
  ['Downtown', 806, 487], ['Midtown', 705, 540], ['The Yards', 705, 680], ['Cedar Falls', 450, 917],
];
export const UNDERPASS_RAMP = 9 * TILE; // the line dips into a short tunnel this far either side of a highway it meets
export const RAIL_MAX_BRIDGE_TILES = 115; // the longest stretch of open water the line may cross (on a bridge)

function railLine(m) {
  const C = RAIL_ROUTE.map(([x, y, f]) => ({ x: x * TILE, y: y * TILE, sub: f === 'sub' }));
  const loop = rounded(C, 12 * TILE, true, 14);
  // a point is in the subway when the corners either side of its stretch of the route both are
  const subAt = (p) => {
    let best = false, bd = Infinity;
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length];
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const d = Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
      if (d < bd) { bd = d; best = a.sub && b.sub; }
    }
    return best;
  };
  const pts = [];
  for (let k = 0; k < loop.length - 1; k++) {
    const a = loop[k], b = loop[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let j = 0; j < steps; j++) { const t = j / steps; const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; p.under = subAt(p); p.subway = p.under; pts.push(p); }
  }
  let s = 0;
  for (let i = 0; i < pts.length; i++) { if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  // where the line passes under the elevated ring highway (slip ramps keep clear of it)
  m.railRingCross = [];
  if (m.ring) for (const p of pts) if (!p.under && m.ringD && m.ringD[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === 0) { const pr = project(m.ring, p); if (pr && !m.railRingCross.some((q) => Math.abs(q - pr.s) < 600)) m.railRingCross.push(pr.s); }
  return pts;
}

// Keep the at-grade track bed free of buildings (roads it crosses stay roads: level crossings),
// and a platform's worth of room either side of every station.
export const PLATFORM_HALF = Math.ceil(TRAIN_LEN / 2) + 4; // px either side of the station mark - as long as a train
const PLATFORM_IN = 40, PLATFORM_OUT = 104; // the platform runs from this far off the track centre to this far
// Where each station stands on the line: near its named spot, on the stretch between level
// crossings that best fits a whole platform - a train waiting at a station shouldn't sit across
// a street. Stations never share track. Worked out from the road tiles, so the reserve pass
// (before the lots go down) and the build pass agree.
function stationIndex(m, pts) {
  if (m.railStationIdx) return m.railStationIdx;
  const n = pts.length;
  const roadPt = pts.map((p) => {
    if (p.underpass) return 1;
    if (p.under) return 0;
    for (const [dx, dy] of [[0, 0], [-24, 0], [24, 0], [0, -24], [0, 24]]) {
      const tx = Math.floor((p.x + dx) / TILE), ty = Math.floor((p.y + dy) / TILE), t = m.tileAt(tx, ty);
      if (t === T.ROAD || (t === T.BRIDGE && m.roadAxis[ty * MAP_W + tx])) return 1;
    }
    return 0;
  });
  // prefix sums of road points round the loop (doubled, so a window can wrap)
  const pre = new Int32Array(2 * n + 1);
  for (let k = 0; k < 2 * n; k++) pre[k + 1] = pre[k] + roadPt[k % n];
  const half = Math.ceil((PLATFORM_HALF + 4) / 8), WINDOW = 170;
  const used = [];
  const clash = (c) => used.some((u) => { const d = Math.abs(c - u); return Math.min(d, n - d) < 2 * half + 40; });
  const out = RAIL_STATIONS.map(([name, tx, ty]) => {
    let i0 = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.hypot(p.x - tx * TILE, p.y - ty * TILE); if (d < bd) { bd = d; i0 = i; } });
    let best = i0, bc = Infinity;
    for (let k = -WINDOW; k <= WINDOW; k++) {
      const c = (i0 + k + n) % n;
      if (clash(c)) continue;
      const a = (c - half + n) % n;
      const roads = pre[a + 2 * half + 1] - pre[a];
      const cost = roads * 1000 + Math.abs(k);
      if (cost < bc) { bc = cost; best = c; }
    }
    used.push(best);
    return { name, i: best };
  });
  m.railStationIdx = out;
  return out;
}
// Where the line meets a highway at ground level it dips under it in a short tunnel (no level
// crossing on a highway) - unless that would put the tunnel under water or a station.
function markUnderpasses(m, pts) {
  const hwy = new Set();
  for (const e of m.edges || []) {
    if ((e.kind !== 'hwy' && e.kind !== 'ramp') || e.lvl) continue;
    const r = (e.w || 128) / 2 + 20;
    for (let k = 0; k < e.pts.length - 1; k++) {
      const a = e.pts[k], b = e.pts[k + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
      for (let d = 0; d <= len; d += 16) {
        const x = a.x + (b.x - a.x) * d / len, y = a.y + (b.y - a.y) * d / len;
        for (let oy = -r; oy <= r; oy += 16) for (let ox = -r; ox <= r; ox += 16) if (ox * ox + oy * oy <= r * r) hwy.add(Math.floor((y + oy) / TILE) * MAP_W + Math.floor((x + ox) / TILE));
      }
    }
  }
  const n = pts.length, step = Math.ceil(UNDERPASS_RAMP / 8);
  const onHwy = pts.map((p) => !p.under && hwy.has(Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)));
  const wet = (p) => { const t = m.tileAtPx(p.x, p.y); return t === T.WATER || t === T.DEEP || t === T.BRIDGE; };
  for (let i = 0; i < n; i++) {
    if (!onHwy[i] || onHwy[(i - 1 + n) % n]) continue;
    let j = i; while (onHwy[(j + 1) % n] && j - i < n) j++;
    const range = []; for (let k = i - step; k <= j + step; k++) range.push(pts[(k + n) % n]);
    if (range.some(wet)) continue;
    for (const p of range) { p.under = true; p.underpass = true; }
  }
}
function reserveRail(m, pts) {
  markUnderpasses(m, pts);
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
  const n = pts.length;
  for (const { i } of stationIndex(m, pts)) {
    if (pts[i].under) continue; // subway stations need nothing up top but a stairway
    const span = Math.ceil((PLATFORM_HALF + 48) / 8);
    for (let k = -span; k <= span; k++) {
      const p = pts[(i + k + n) % n], q = pts[(i + k + 1 + n) % n];
      const a = Math.atan2(q.y - p.y, q.x - p.x), nx = -Math.sin(a), ny = Math.cos(a);
      for (let off = -PLATFORM_OUT - 16; off <= PLATFORM_OUT + 16; off += 12) {
        const tx = Math.floor((p.x + nx * off) / TILE), ty = Math.floor((p.y + ny * off) / TILE);
        if (tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H) m.reserve[ty * MAP_W + tx] |= 2;
      }
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
  clearPropsOnPlazas(m);
  for (const c of crossings) {
    const mid = (c.s0 + c.s1) / 2; const q = railAt({ pts, len: total }, mid); c.s = mid; c.x = q.x; c.y = q.y; c.a = q.a;
    const onRoad = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), t = m.tileAt(tx, ty); return t === T.ROAD || (t === T.BRIDGE && !!m.roadAxis[ty * MAP_W + tx]); };
    let hw = 16;
    for (const sg of [-1, 1]) { let d = 0; while (d < 260 && onRoad(q.x + Math.cos(q.a) * sg * (d + 8), q.y + Math.sin(q.a) * sg * (d + 8))) d += 8; hw = Math.max(hw, d + 4); }
    c.hw = hw;
  }
  // stations: an open-air platform alongside the track, as long as a train, on whichever side
  // has fewer roads and buildings in the way (over water it stands on piers)
  const stations = [];
  const rail0 = { pts, len: total };
  const along = (s0, fn) => { for (let d = -PLATFORM_HALF; d <= PLATFORM_HALF; d += 16) { const r = railAt(rail0, s0 + d); fn(r, -Math.sin(r.a), Math.cos(r.a), d); } };
  for (const { name, i } of stationIndex(m, pts)) {
    const best = pts[i];
    const q = railAt(rail0, best.s);
    if (best.under) {
      // a subway station: the platform is down below; the way in is a stairway on the nearest
      // pavement up top (not under the elevated highway)
      let ent = null;
      for (let r = 48; r < 700 && !ent; r += 16) for (let k = 0; k < 16; k++) {
        const x = q.x + Math.cos(k / 16 * 6.283) * r, y = q.y + Math.sin(k / 16 * 6.283) * r;
        if (m.tileAtPx(x, y) === T.SIDEWALK && !m.deck[Math.floor(y / TILE) * MAP_W + Math.floor(x / TILE)]) { ent = { x, y }; break; }
      }
      const st = { name: `${name} Station`, s: best.s, x: q.x, y: q.y, a: q.a, side: 1, half: PLATFORM_HALF, inner: PLATFORM_IN, outer: PLATFORM_OUT, under: true, clockD: 0 };
      st.platform = ent || { x: q.x, y: q.y };
      const plaza = (m.subwayPlazas || []).find((pl) => pl.name === name);
      if (plaza) { st.kiosk = subwayKiosk(m, plaza, stations.length); st.platform = st.kiosk.out; }
      st.poi = m.pois.length;
      m.pois.push({ id: m.pois.length, kind: 'station', label: st.name, x: st.platform.x, y: st.platform.y, r: 70, station: stations.length });
      stations.push(st);
      continue;
    }
    const bad = (sd) => { let n = 0; along(best.s, (r, nx, ny) => { for (let off = PLATFORM_IN; off <= PLATFORM_OUT; off += 16) { const t = m.tileAtPx(r.x + nx * sd * off, r.y + ny * sd * off); if (t === T.ROAD || t === T.BUILDING || t === T.WALL || t === T.BRIDGE) n++; else if (t === T.WATER || t === T.DEEP) n += 0.5; } }); return n; };
    const lot = (m.stationLots || []).find((l) => l.name === name);
    const side = lot ? lot.side : bad(1) <= bad(-1) ? 1 : -1;
    along(best.s, (r, nx, ny) => {
      for (let off = PLATFORM_IN; off <= PLATFORM_OUT; off += 12) {
        const x = r.x + nx * side * off, y = r.y + ny * side * off;
        const t = m.tileAtPx(x, y);
        if (t === T.WATER || t === T.DEEP) m.set(Math.floor(x / TILE), Math.floor(y / TILE), T.DOCK);
        else if (t !== T.BUILDING && t !== T.WALL && t !== T.ROAD && t !== T.BRIDGE && t !== T.DOCK) m.set(Math.floor(x / TILE), Math.floor(y / TILE), T.PLAZA);
      }
    });
    const nx = -Math.sin(q.a), ny = Math.cos(q.a);
    const st = { name: `${name} Station`, s: best.s, x: q.x, y: q.y, a: q.a, side, half: PLATFORM_HALF, inner: PLATFORM_IN, outer: PLATFORM_OUT };
    // the platform clock (and the station's map point) stand where the platform isn't a street
    st.clockD = 0;
    for (const d of [0, 110, -110, 220, -220, 330, -330]) {
      const r = railAt(rail0, best.s + d), t = m.tileAtPx(r.x - Math.sin(r.a) * side * 72, r.y + Math.cos(r.a) * side * 72);
      if (t !== T.ROAD && t !== T.BRIDGE) { st.clockD = d; break; }
    }
    const qc = railAt(rail0, best.s + st.clockD);
    st.platform = { x: qc.x - Math.sin(qc.a) * side * 72, y: qc.y + Math.cos(qc.a) * side * 72 };
    st.poi = m.pois.length;
    m.pois.push({ id: m.pois.length, kind: 'station', label: st.name, x: st.platform.x, y: st.platform.y, r: 150, station: stations.length });
    stations.push(st);
  }
  stations.sort((a, b) => a.s - b.s);
  stations.forEach((st, i) => { m.pois[st.poi].station = i; });
  // the long rural run: the stretch of line through Dry Creek's fields, clear of the station
  const nearStation = (p) => stations.some((st) => { const d = Math.abs(p.s - st.s); return Math.min(d, total - d) < PLATFORM_HALF + 900; });
  const RURAL = new Set([9, 41, 42]); // Dry Creek's farms, the desert and the airstrip
  const ruralIdx = pts.map((p, i) => (!p.under && RURAL.has(m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)]) && !nearStation(p) ? i : -1)).filter((i) => i >= 0);
  let rural = null;
  if (ruralIdx.length) {
    let bestRun = null, cur = [ruralIdx[0]];
    for (let k = 1; k < ruralIdx.length; k++) { if (ruralIdx[k] === ruralIdx[k - 1] + 1) cur.push(ruralIdx[k]); else { if (!bestRun || cur.length > bestRun.length) bestRun = cur; cur = [ruralIdx[k]]; } }
    if (!bestRun || cur.length > bestRun.length) bestRun = cur;
    rural = { s0: pts[bestRun[0]].s + 200, s1: pts[bestRun[bestRun.length - 1]].s - 100 };
  }
  m.rail = { pts, len: total, stations, crossings, rural };
}

// The street entrance of a subway stop on its plaza: the kiosk (stairs down inside its railings)
// at one end, its mouth facing a marked queue lane at the other, and the countdown board on a
// post at the back of the lane. Geometry in world px from the kiosk art (SUBWAY_ART: 128 x 95,
// mouth on the left; the mirrored kiosk, flip, has its mouth on the right). The railings are
// solid; the stairwell between them is walkable - people walk in at the mouth, down the steps,
// and are gone below (the client sinks them into the stairwell as they go).
export const SUBWAY_ART = { w: 128, h: 95, pit: [10, 43, 114, 81], rail: [36, 88], mouthY: 62, top: 16, deep: 96 };
function subwayKiosk(m, pl, k) {
  const A = SUBWAY_ART, flip = k % 2 === 1;
  const px0 = pl.x * TILE, py0 = pl.y * TILE, pw = pl.w * TILE;
  const x0 = flip ? px0 + 8 : px0 + pw - A.w - 8, y0 = py0 + 8;
  const lx = (x) => (flip ? x0 + A.w - x : x0 + x); // kiosk-local x -> world (mirrored for flip)
  const my = y0 + A.mouthY, dir = flip ? 1 : -1;  // dir: from the mouth out into the lane
  const pit = flip ? [lx(A.pit[2]), y0 + A.pit[1], lx(A.pit[0]), y0 + A.pit[3]] : [lx(A.pit[0]), y0 + A.pit[1], lx(A.pit[2]), y0 + A.pit[3]];
  const out = { x: lx(0) + dir * 16, y: my };
  const queue = [];
  for (let q = 0; q < 5; q++) queue.push({ x: out.x + dir * (14 + q * 20), y: my + (q % 2 ? 3 : -3) });
  const laneEnd = flip ? px0 + pw - 6 : px0 + 6;
  const lane = [Math.min(out.x, laneEnd), my - 20, Math.max(out.x, laneEnd), my + 20];
  // railings: the back (with the sign and lamps above it), the front, and the closed far end
  for (let x = 4; x <= A.w - 4; x += 10) { m.addSolidProp(lx(x), y0 + A.rail[0], 8); m.addSolidProp(lx(x), y0 + A.rail[1], 8); m.addSolidProp(lx(x), y0 + 16, 10); }
  for (let y = A.rail[0]; y <= A.rail[1]; y += 10) m.addSolidProp(lx(A.w - 6), y0 + y, 8);
  const board = { x: (lane[0] + lane[2]) / 2, y: py0 + 22 };
  m.addSolidProp(board.x, board.y + 10, 5);
  return { x0, y0, w: A.w, h: A.h, flip, pit, out, top: { x: lx(A.top), y: my }, deep: { x: lx(A.deep), y: my + 4 }, queue, lane, board };
}

// Clear street furniture standing on the track bed (and re-index what's left: props are
// referenced by index on the wire, and both ends build the map the same way).
// Nothing stands on a subway plaza but the entrance (benches, lamps and bins from the street
// dressing are cleared off it).
export function onSubwayPlaza(m, x, y) {
  return (m.subwayPlazas || []).some((pl) => x > pl.x * TILE - 8 && x < (pl.x + pl.w) * TILE + 8 && y > pl.y * TILE - 8 && y < (pl.y + pl.h) * TILE + 4);
}
function clearPropsOnPlazas(m) {
  if ((m.subwayPlazas || []).length) removeProps(m, (x, y) => onSubwayPlaza(m, x, y));
}

function removeProps(m, near) {
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
    const t0 = m.tiles[i];
    if (t0 !== T.GRASS && t0 !== T.SAND && t0 !== T.DIRT) continue; // leave streets and lots alone
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
  m.fill(pcx - 2, pcy - 16, 4, 36, T.PLAZA);
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
    if (m.zone[ty * MAP_W + tx] !== Z.KEY || tx > pcx + 14) continue;
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
  const cands = m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && !p.fixed && nearWater(p) && !DISTRICTS[distOf(p)].turf && !/warehouse|factory|hotel|motel|lounge|ritz/i.test(p.label));
  cands.sort((a, b) => hash2(a.x | 0, a.y | 0, 23) - hash2(b.x | 0, b.y | 0, 23));
  const picked = [];
  for (const c of cands) {
    if (picked.length >= 6) break;
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
    let c = m.pois.filter((p) => p.kind === 'delivery' && p.b !== undefined && !p.fixed && m.dist[Math.floor(p.y / TILE) * MAP_W + Math.floor(p.x / TILE)] === di)
      .sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
    if (!c) c = hqInPlainBuilding(m, di, cx, cy); // no storefront on the turf: they hole up in a plain building
    if (!c) return;
    const old = c.label;
    c.kind = 'gang'; c.label = `Syndicate HQ - ${d.name}`;
    const b = m.buildings[c.b];
    if (b) for (const s of b.signs) if (s.text === old) s.text = 'Syndicate HQ';
  });
}

// A door on the street side of an ordinary (procedural-roof) building in district di, nearest
// (cx, cy), made into a delivery-style POI the caller can take over.
function hqInPlainBuilding(m, di, cx, cy) {
  const used = new Set(m.pois.map((q) => q.b).filter((b) => b !== undefined));
  const walk = (tx, ty) => { const t = m.tileAt(tx, ty); return t === T.SIDEWALK || t === T.PLAZA || t === T.LOT; };
  const cands = [];
  for (const b of m.buildings) {
    if (b.gone || b.kind !== 'roof' || used.has(b.id) || b.tw < 5 || b.th < 5) continue;
    if (m.dist[(b.ty + (b.th >> 1)) * MAP_W + b.tx + (b.tw >> 1)] !== di) continue;
    const mx = b.tx + (b.tw >> 1);
    const side = walk(mx, b.ty + b.th) ? 1 : walk(mx, b.ty - 1) ? -1 : 0;
    if (!side) continue;
    const x = (mx + 0.5) * TILE, y = side > 0 ? (b.ty + b.th + 0.7) * TILE : (b.ty - 0.7) * TILE;
    cands.push({ b, x, y, d: Math.hypot(x - cx, y - cy) });
  }
  cands.sort((a, b) => a.d - b.d);
  const best = cands[0];
  if (!best) return null;
  const poi = { id: m.pois.length, kind: 'delivery', label: 'Building', x: best.x, y: best.y, r: 44, b: best.b.id };
  m.pois.push(poi);
  return poi;
}

function filler(m, row, x, w, st, rand, backLot = false) {
  if (w <= 0) return;
  // in town the yards and car parks behind the buildings are walled off from the back street
  if (backLot && URBAN.has(DISTRICTS[row.d].style) && row.h >= 3) {
    const before = m.brickWalls.length;
    fillerInner(m, row, x, w, st, rand, backLot);
    if (m.brickWalls.length === before && !(m.tileAt(x, row.y) === T.BUILDING)) streetWall(m, x, row.face === 'S' ? row.y + row.h - 1 : row.y, w, rand, w >= 6);
    return;
  }
  fillerInner(m, row, x, w, st, rand, backLot);
}
// Town styles where the street frontage runs on in brick between the buildings.
const URBAN = new Set(['commercial', 'oldtown', 'nightlife', 'redlight', 'southside', 'industrial', 'factory', 'harbor', 'towers', 'apartments']);
// A brick wall along a row of tiles (1 tile deep) - with a gateway somewhere along it when asked.
function streetWall(m, x, y, w, rand, gate) {
  if (w < 2) return;
  const gx = gate ? x + 1 + Math.floor(rand() * Math.max(1, w - 3)) : -99; // a 2-tile gateway
  let run = null;
  for (let tx = x; tx <= x + w; tx++) {
    const i = y * MAP_W + tx;
    const ok = tx < x + w && (tx < gx || tx > gx + 1) && m.bld[i] < 0 && !(m.reserve[i] & 16) && m.tiles[i] !== T.ROAD && m.tiles[i] !== T.BUILDING;
    if (ok) { m.tiles[i] = T.WALL; if (run) run.tw++; else run = { tx, ty: y, tw: 1 }; continue; }
    if (run) { m.brickWalls.push(run); run = null; }
  }
}
// A gap in a long frontage: a narrow paved passage between the buildings, or a yard behind a
// brick wall (with a gateway) - so the street side stays a continuous run of brick and storefronts.
function walledGap(m, row, x, w, rand) {
  const y0 = row.y, h = row.h;
  if (w <= 3) { m.fill(x, y0, w, h, T.PLAZA); addProp(m, rand() < 0.5 ? 'dump_g' : 'dump_b', (x + w / 2) * TILE, (y0 + 2) * TILE, 16); return; }
  m.fill(x, y0, w, h, T.LOT);
  const pool = ['pallet', 'pallet_b', 'drum', 'dump_g', 'dump_b', 'tires', 'planks'];
  for (let k = 0; k < Math.max(1, (w * h) / 40); k++) {
    const t = pool[Math.floor(rand() * pool.length)];
    addProp(m, t, (x + 1 + rand() * (w - 2)) * TILE, (y0 + 1 + rand() * Math.max(1, h - 4)) * TILE, t.startsWith('dump') ? 16 : 10);
  }
  streetWall(m, x, row.face === 'S' ? y0 + h - 1 : y0, w, rand, w >= 5);
}
function fillerInner(m, row, x, w, st, rand, backLot = false) {
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
  'lumber', 'planks', 'flowers_a', 'flowers_big', 'pipes', 'wheelbarrow', 'sandbags', 'cart', 'produce_a', 'produce_b', 'cactus', 'sigpole',
  'dump_g', 'dump_b', 'dump_o', 'dumpster_s', 'dumpster_m', 'busstop', 'phonebox', 'bollard', 'crates', 'acunit', 'trashpile', 'atm', 'billboard',
  'tent', 'picnic', 'upole', 'dspeaker', 'scope',
]);
export const HEAVY_PROPS = new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'lamp', 'vend_a', 'vend_cola', 'vend_c', 'spool', 'sandbags', 'hydrant', 'hydrant_y', 'sigpole', 'dump_g', 'dump_b', 'dump_o', 'dumpster_s', 'dumpster_m', 'busstop', 'phonebox', 'acunit', 'billboard', 'upole']);

// Point every lamp's arm at the nearest road so the head hangs over the street.
function aimLamps(m) {
  for (const l of m.lamps) {
    if (l.wall || l.hx !== undefined) continue; // aimed already (alley wall lamps, painted lamps)
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
  const perD = new Map();
  for (let ty = 2; ty < MAP_H - 2; ty += 2) for (let tx = 2; tx < W - 2; tx += 2) {
    const i = ty * W + tx;
    const dd = m.dist[i];
    if ((DISTRICTS[dd].style !== 'harbor' && dd !== 3) || (perD.get(dd) || 0) >= 5 || !(m.reserve[i] & 4) || m.reserve[i] & 3) continue;
    if (piers.some((p) => Math.abs(p.tx - tx) + Math.abs(p.ty - ty) < 18)) continue;
    for (const [dx, dy] of [[-1, 0], [0, 1], [1, 0], [0, -1]]) {
      if (!isWater(m.tileAt(tx + dx, ty + dy))) continue;
      let k = 1; while (k < 24 && isWater(m.tileAt(tx + dx * k, ty + dy * k)) && !m.river[(ty + dy * k) * W + tx + dx * k]) k++;
      if (k < 20) continue;
      const tip = jetty(m, tx, ty, dx, dy, 13);
      piers.push({ tx, ty });
      perD.set(dd, (perD.get(dd) || 0) + 1);
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
    m.publicPier = { x: pier.tx * TILE, y: (pier.ty + 1.5) * TILE };
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
const FARM_FIELDS = [[1056, 548, 30, 40], [1100, 548, 34, 40], [1056, 594, 32, 40], [1100, 594, 34, 46], [1160, 560, 40, 30], [1146, 600, 50, 34], [1060, 640, 26, 36]];
// open country (the woods, hills, desert, farmland and the airfields), not town
function wildAt(m, tx, ty) {
  const d = DISTRICTS[m.dist[ty * MAP_W + tx]];
  return !!d && WILD_STYLES.has(d.style) && d.style !== 'water';
}
function buildFarm(m, rand) {
  const W = MAP_W;
  const fields = FARM_FIELDS;
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
  m.dropSites.push({ x: 1176 * TILE, y: 760 * TILE, name: 'the Dry Creek boonies' });
  // Cedar Farms: fields between the section roads and a market stand that takes harvests
  for (const [fx2, fy2, fw, fh] of FIELDS) {
    let n = 0;
    for (let y = fy2; y < fy2 + fh; y++) for (let x = fx2; x < fx2 + fw; x++) {
      const i = y * W + x;
      if (m.dist[i] === 38 && (m.tiles[i] === T.GRASS || m.tiles[i] === T.DIRT || m.tiles[i] === T.SAND) && !m.reserve[i] && !m.lake[i]) { m.tiles[i] = T.FIELD; n++; }
    }
    if (n > 200) m.fields.push({ x: fx2 * TILE, y: fy2 * TILE, w: fw * TILE, h: fh * TILE });
  }
  for (const [sx, sy, name, south] of FARM_STANDS) {
    // the farmstead from the concept painting: farmhouse, barn, silos, paddock
    const pf2 = PREFABS.farmstead || PREFABS.house2, key = PREFABS.farmstead ? 'farmstead' : 'house2';
    clearArea(m, sx, sy, pf2.tw, pf2.th);
    m.fill(sx, sy, pf2.tw, pf2.th, T.DIRT);
    placePrefab(m, { d: m.dist[sy * W + sx], x: sx, y: sy, w: pf2.tw, h: pf2.th, face: south ? 'S' : 'N' }, key, sx, { biz: ['farm'], names: [name] }, rand);
    const st = m.pois.filter((p) => p.kind === 'farm').pop();
    st.cargoPad = { x: (sx + 3) * TILE, y: (south ? sy + pf2.th - 1.5 : sy + 1.5) * TILE };
  }
}

// Out at the end of the dirt tracks: a cabin for sale in the woods and hills, a homestead
// shack in the desert, a lighthouse on Lighthouse Rock. Gives every track somewhere to go.
function buildOutposts(m, rand) {
  const W = MAP_W;
  const free = (x, y, w, h) => {
    for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= MAP_H) return false;
      const i = ty * W + tx, t = m.tiles[i];
      if (!m.land[i] || m.lake[i] || m.reserve[i] || t === T.ROAD || t === T.BRIDGE || t === T.BUILDING || t === T.WATER || t === T.DEEP || t === T.FIELD || t === T.LOT) return false;
    }
    return true;
  };
  let cabins = 0;
  for (const n of m.nodes) {
    if (n.lvl !== 0 || n.edges.length !== 1) continue;
    const e = m.edges[n.edges[0]];
    if (e.kind !== 'dirt' || e.culdesac) continue;
    const tx = Math.floor(n.x / TILE), ty = Math.floor(n.y / TILE);
    if ((m.countrySites || []).some((s) => tx > s.x - 8 && tx < s.x + s.w + 8 && ty > s.y - 8 && ty < s.y + s.h + 8)) continue;
    const st = DISTRICTS[m.dist[ty * W + tx]].style;
    const desert = st === 'desert' || (m.terrainCls && terrainAt(m.terrainCls.cls, m.terrainCls.cw, tx, ty) === 3);
    const key = desert ? 'shack' : cabins % 2 ? 'house3' : 'house1';
    const pf = PREFABS[key];
    if (!pf) continue;
    // the lot beside the end of the track, its front facing it
    const spots = [[tx - (pf.tw >> 1), ty - pf.th - 1, true], [tx - (pf.tw >> 1), ty + 2, false], [tx + 2, ty - (pf.th >> 1), true], [tx - pf.tw - 2, ty - (pf.th >> 1), true]];
    const spot = spots.find(([x, y]) => free(x - 1, y - 1, pf.tw + (desert ? 2 : 6), pf.th + 2));
    if (!spot) continue;
    const [x, y, south] = spot;
    m.fill(x - 1, y - 1, pf.tw + (desert ? 2 : 6), pf.th + 2, desert ? T.DIRT : T.GRASS);
    if (desert) {
      placePrefab(m, { d: m.dist[ty * W + tx], x, y, w: pf.tw, h: pf.th, face: south ? 'S' : 'N' }, key, x, null, rand);
      for (const [dx, dy, t] of [[-2, 2, 'drum'], [pf.tw + 1, 3, 'tires'], [pf.tw + 1, pf.th - 2, 'pallet']]) addProp(m, t, (x + dx) * TILE, (y + dy) * TILE, 10);
    } else {
      estateHouse(m, rand, 'cottage', key, x, y, south);
      cabins++;
    }
    for (let k = 0; k < Math.min(6, Math.abs(Math.round((south ? y + pf.th : y) - ty))); k++) m.set(tx, south ? ty - 1 - k : ty + 1 + k, T.DIRT); // the track runs up to the door
  }
  // the lighthouse on its rock off the north-west coast
  const comp = m.compLab[70 * W + 300];
  if (comp >= 0) {
    const [x0, y0, x1, y1] = m.comps[comp].box;
    const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
    m.fill(cx - 6, cy - 6, 12, 12, T.PLAZA);
    simpleBuilding(m, cx - 2, cy - 2, 5, 5, 'Lighthouse', 'lighthouse', m.dist[cy * W + cx], 'tile', { x: (cx + 0.5) * TILE, y: (cy + 3.4) * TILE, text: 'Lighthouse' });
    addProp(m, 'lamp', (cx + 4.5) * TILE, (cy + 4.5) * TILE);
    jetty(m, cx, cy + 6, 0, 1, 6);
  }
}

// Airports: the runway, taxiway and apron, the terminal and hangars, aircraft on the stands.
// Islands raised from open sea in the shape of a painting's mask, in the clearest water nearest
// their spot (a margin of sea all round). The jetty stays water underneath (it becomes planks
// later); everything else in the mask is land.
const PARADISE_D = 45;
function raiseSceneIslands(m, land) {
  m.sceneIslands = [];
  const W = MAP_W;
  for (const si of SCENE_ISLANDS) {
    const mk = SCENE_MASKS[si.key];
    if (!mk) continue;
    const M = 10;
    const sat = new Int32Array((W + 1) * (MAP_H + 1));
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < W; x++) sat[(y + 1) * (W + 1) + x + 1] = land[y * W + x] + sat[y * (W + 1) + x + 1] + sat[(y + 1) * (W + 1) + x] - sat[y * (W + 1) + x];
    const landIn = (x, y, w, h) => sat[(y + h) * (W + 1) + x + w] - sat[y * (W + 1) + x + w] - sat[(y + h) * (W + 1) + x] + sat[y * (W + 1) + x];
    let best = null, bd = Infinity;
    for (let y = M; y + mk.h + M < MAP_H; y += 2) for (let x = M; x + mk.w + M < W; x += 2) {
      if (landIn(x - M, y - M, mk.w + 2 * M, mk.h + 2 * M)) continue;
      const d = Math.hypot(x + mk.w / 2 - si.near[0], y + mk.h / 2 - si.near[1]);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (!best) continue;
    for (let ty = 0; ty < mk.h; ty++) for (let tx = 0; tx < mk.w; tx++) {
      const c = mk.rows[ty][tx];
      land[(best.y + ty) * W + best.x + tx] = c === '.' || c === 'd' ? 0 : 1;
    }
    m.sceneIslands.push({ key: si.key, name: si.name, x: best.x, y: best.y, w: mk.w, h: mk.h });
  }
}

// Whole scene paintings from the concepts (a golf course...) on open wild ground: the biggest
// clear stretch of the district nearest the preferred spot - all land, no roads, buildings,
// fields or lakes - kept free of the scattered wild trees and rocks.
// ---- boat docks ----------------------------------------------------------------------------------
// Homes near open water get a private pier with a covered boat slip (their boat garage); a few
// beaches, the harbor and the bigger lakes get a rental dock (a kiosk, a pier, boats for hire).
const LAUNCH_LAND = new Set([T.GRASS, T.SAND, T.DIRT, T.PLAZA, T.LOT, T.SIDEWALK]);
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const WATERFRONT_MAX = 14;
const tileIdx = (tx, ty) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? -1 : ty * MAP_W + tx);

// A shore tile near (cx, cy) with a straight run of open water ahead: nothing over it (no road or
// rail bridge, no highway deck) and wide enough for a pier with a slip on one side.
function findLaunch(m, cx, cy, R, run, used, half = 3) {
  let best = null, bd = Infinity;
  for (let ty = cy - R; ty <= cy + R; ty++) for (let tx = cx - R; tx <= cx + R; tx++) {
    const i = tileIdx(tx, ty);
    if (i < 0 || !LAUNCH_LAND.has(m.tiles[i]) || m.reserve[i] & 11 || m.deck[i]) continue;
    const d0 = Math.hypot(tx - cx, ty - cy);
    if (d0 > R || d0 >= bd) continue;
    if (used.some((u) => Math.abs(u.tx - tx) + Math.abs(u.ty - ty) < 16)) continue;
    for (const [dx, dy] of DIRS4) {
      const px = -dy, py = dx;
      // the tile behind is land too, so the pier starts from a real shore
      const back = tileIdx(tx - dx, ty - dy);
      if (back < 0 || isWater(m.tiles[back]) || m.tiles[back] === T.BRIDGE) continue;
      let ok = true;
      for (let k = 1; k <= run && ok; k++) for (let o = -half; o <= half; o++) {
        const j = tileIdx(tx + dx * k + px * o, ty + dy * k + py * o);
        if (j < 0 || !isWater(m.tiles[j]) || m.reserve[j] & 2 || m.deck[j]) { ok = false; break; }
      }
      if (!ok) continue;
      best = { tx, ty, dx, dy };
      bd = d0;
      break;
    }
  }
  return best;
}

// Lay a 2-wide pier `len` tiles out from the launch tile. side: which side the berths are on
// (+1 / -1 along the perpendicular); the pier itself takes the launch line and the other side.
function layPier(m, L, len, side) {
  const { tx, ty, dx, dy } = L;
  const px = -dy, py = dx;
  for (let k = 0; k <= len; k++) for (const o of [0, -side]) {
    const x = tx + dx * k + px * o, y = ty + dy * k + py * o;
    if (k === 0 || isWater(m.tileAt(x, y))) m.set(x, y, T.DOCK);
  }
}
// World position of a berth beside a pier: k tiles out, 1.5 tiles off the pier line on `side`.
function berth(L, k, side) {
  const px = -L.dy, py = L.dx;
  return { x: (L.tx + 0.5 + L.dx * k + px * 1.5 * side) * TILE, y: (L.ty + 0.5 + L.dy * k + py * 1.5 * side) * TILE, a: Math.atan2(L.dy, L.dx) };
}

function buildBoatDocks(m) {
  m.boathouses = [];
  m.rentals = [];
  const used = [];
  // --- waterfront homes: a private pier and a covered slip ---------------------------------------
  const cands = m.homes.filter((h) => !h.gone && h.kind !== 'apartment')
    .map((h) => ({ h, L: findLaunch(m, Math.floor(h.x / TILE), Math.floor(h.y / TILE), 28, 9, used) }))
    .filter((c) => c.L)
    .sort((a, b) => Math.hypot(a.L.tx * TILE - a.h.x, a.L.ty * TILE - a.h.y) - Math.hypot(b.L.tx * TILE - b.h.x, b.L.ty * TILE - b.h.y));
  for (const { h } of cands) {
    if (m.homes.filter((q) => q.dock).length >= WATERFRONT_MAX) break;
    // re-check: an earlier pier may have taken this stretch of shore
    const L = findLaunch(m, Math.floor(h.x / TILE), Math.floor(h.y / TILE), 28, 9, used);
    if (!L) continue;
    used.push(L);
    const side = (L.tx + L.ty) % 2 ? 1 : -1;
    layPier(m, L, 6, side);
    const px = -L.dy, py = L.dx;
    // the boathouse: a roofed slip two tiles wide, four long, beside the pier
    const a = { x: L.tx + L.dx * 1 + px * side, y: L.ty + L.dy * 1 + py * side };
    const b = { x: L.tx + L.dx * 4 + px * 2 * side, y: L.ty + L.dy * 4 + py * 2 * side };
    m.boathouses.push({ home: h.id, tx: Math.min(a.x, b.x), ty: Math.min(a.y, b.y), tw: Math.abs(b.x - a.x) + 1, th: Math.abs(b.y - a.y) + 1, dx: L.dx, dy: L.dy });
    h.dock = berth(L, 2.5, side);
    h.dock.walk = { x: (L.tx + 0.5 - L.dx * 0.2) * TILE, y: (L.ty + 0.5 - L.dy * 0.2) * TILE };
    h.waterfront = true;
    h.slots += 1;
    h.price = Math.round((h.price * 1.3) / 500) * 500;
    addProp(m, 'lamp', (L.tx + 0.5 + L.dx * 6 - px * side) * TILE, (L.ty + 0.5 + L.dy * 6 - py * side) * TILE);
  }
  // --- rental docks ------------------------------------------------------------------------------
  const anchors = [];
  const marinaPoi = m.pois.find((p) => p.kind === 'marina');
  if (m.publicPier) anchors.push({ x: m.publicPier.x, y: m.publicPier.y + 6 * TILE, name: 'Sunset Beach Boat Rentals' });
  if (marinaPoi) anchors.push({ x: marinaPoi.x, y: marinaPoi.y, name: 'Harbor Boat & Jet Ski Hire' });
  if (m.pelican) anchors.push({ x: m.pelican.dock.x, y: m.pelican.dock.y, name: 'Pelican Key Jet Skis' });
  for (const lk of LAKES) if (lk[4] === 'Cedar Lake' || lk[4] === 'Lakeview Lake') anchors.push({ x: (lk[0] + lk[2] / 2) * TILE, y: (lk[1] + lk[3] / 2) * TILE, name: `${lk[4]} Boat Hire`, lake: true });
  for (const an of anchors) {
    const cx = Math.floor(an.x / TILE), cy = Math.floor(an.y / TILE);
    const L = findLaunch(m, cx, cy, an.lake ? 22 : 34, an.lake ? 6 : 8, used, 2);
    if (!L) continue;
    used.push(L);
    const len = an.lake ? 5 : 8;
    // berths on both sides: the pier is the launch line plus one tile to the right
    layPier(m, L, len, -1);
    const px = -L.dy, py = L.dx;
    // kiosk ashore behind the pier if there's room, else a booth on the pier head
    const kx = L.tx - L.dx * 3 + Math.min(0, px) * 2 - (px === 0 ? 1 : 0), ky = L.ty - L.dy * 3 + Math.min(0, py) * 2 - (py === 0 ? 1 : 0);
    let room = true;
    for (let y = ky; y < ky + 2 && room; y++) for (let x = kx; x < kx + 3; x++) { const i = tileIdx(x, y); if (i < 0 || !LAUNCH_LAND.has(m.tiles[i]) || m.reserve[i] & 11 || m.bld[i] >= 0) { room = false; break; } }
    let bid;
    if (room) bid = simpleBuilding(m, kx, ky, 3, 2, an.name, 'charter', m.dist[tileIdx(kx, ky)], 'metal', { x: (kx + 1.5) * TILE, y: (ky + 2.4) * TILE, text: 'Rentals' }).id;
    const door = { x: (L.tx + 0.5 - L.dx * 0.6) * TILE, y: (L.ty + 0.5 - L.dy * 0.6) * TILE };
    const poi = { id: m.pois.length, kind: 'rental', label: an.name, x: door.x, y: door.y, r: 48, ...(bid !== undefined ? { b: bid } : {}) };
    m.pois.push(poi);
    const spots = [];
    // the pier covers offsets 0 and +1: berths at -1.5 on one side and +2.5 on the other
    for (let k = 2; k <= len - 1; k += 2.5) for (const sd of [-1, 1]) {
      const s = berth(L, k, sd);
      if (sd > 0) { s.x += px * TILE; s.y += py * TILE; }
      spots.push(s);
    }
    m.rentals.push({ poi: poi.id, name: an.name, spots, lake: !!an.lake, dock: door });
    // a couple of hire boats tied up for show (and for the light-fingered)
    if (spots.length > 2) m.marina.push({ ...spots[spots.length - 1], kind: 'jetski' });
    addProp(m, 'lamp', (L.tx + 0.5 + L.dx * len) * TILE, (L.ty + 0.5 + L.dy * len) * TILE);
  }
}

function buildScenePaintings(m) {
  m.paintings = [];
  const W = MAP_W;
  // the painted islands: sand, grass, the jetty's planks and the cabin, exactly as painted
  for (const si of m.sceneIslands || []) {
    const mk = SCENE_MASKS[si.key];
    for (let ty = 0; ty < mk.h; ty++) for (let tx = 0; tx < mk.w; tx++) {
      const i = (si.y + ty) * W + si.x + tx, c = mk.rows[ty][tx];
      m.reserve[i] |= 16;
      if (c !== '.') m.dist[i] = PARADISE_D;
      if (c === 's') m.tiles[i] = T.SAND; else if (c === 'g') m.tiles[i] = T.GRASS; else if (c === 'd') m.tiles[i] = T.DOCK; else if (c === '#') m.tiles[i] = T.WALL;
    }
    m.paintings.push({ key: si.key, name: si.name, x: si.x * TILE, y: si.y * TILE, w: mk.w * TILE, h: mk.h * TILE, island: true });
  }
  for (const sp0 of SCENE_SPOTS) {
    const mk = sp0.masked ? SCENE_MASKS[sp0.key] : null;
    if (sp0.masked && !mk) continue;
    const sp = mk ? { ...sp0, w: mk.w, h: mk.h } : sp0;
    // summed-area table of "can't paint here" tiles
    const sat = new Int32Array((W + 1) * (MAP_H + 1));
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = m.tiles[i];
      const bad = !m.land[i] || m.lake[i] || m.dist[i] !== sp.dist || m.reserve[i] || (t !== T.GRASS && t !== T.DIRT && t !== T.SAND) ? 1 : 0;
      sat[(y + 1) * (W + 1) + x + 1] = bad + sat[y * (W + 1) + x + 1] + sat[(y + 1) * (W + 1) + x] - sat[y * (W + 1) + x];
    }
    const badIn = (x, y, w, h) => sat[(y + h) * (W + 1) + x + w] - sat[y * (W + 1) + x + w] - sat[(y + h) * (W + 1) + x] + sat[y * (W + 1) + x];
    let best = null, bd = Infinity;
    for (let y = 2; y + sp.h + 4 < MAP_H; y += 2) for (let x = 2; x + sp.w + 4 < W; x += 2) {
      if (badIn(x - 2, y - 2, sp.w + 4, sp.h + 4)) continue;
      const d = Math.hypot(x + sp.w / 2 - sp.near[0], y + sp.h / 2 - sp.near[1]);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    if (!best) continue;
    for (let y = best.y; y < best.y + sp.h; y++) for (let x = best.x; x < best.x + sp.w; x++) { m.tiles[y * W + x] = T.GRASS; m.reserve[y * W + x] |= 16; }
    if (mk) for (let ty = 0; ty < mk.h; ty++) for (let tx = 0; tx < mk.w; tx++) { const c = mk.rows[ty][tx]; m.tiles[(best.y + ty) * W + best.x + tx] = c === '#' ? T.WALL : c === 'g' ? T.GRASS : T.DIRT; }
    for (const [fx0, fy0, fx1, fy1] of sp.solid || []) // the painted clubhouse etc. is solid (its art comes from the painting)
      for (let y = best.y + Math.round(fy0 * sp.h); y < best.y + Math.round(fy1 * sp.h); y++) for (let x = best.x + Math.round(fx0 * sp.w); x < best.x + Math.round(fx1 * sp.w); x++) m.tiles[y * W + x] = T.WALL;
    m.paintings.push({ key: sp.key, name: sp.name, x: best.x * TILE, y: best.y * TILE, w: sp.w * TILE, h: sp.h * TILE });
  }
}

function buildAirports(m) {
  m.airports = [];
  for (const A of AIRPORTS) {
    const [rx, ry, rw, rh] = A.runway, [ax, ay, aw, ah] = A.apron, [tx2, ty2, tw, th] = A.terminal;
    const tax = A.taxi;
    clearArea(m, Math.min(rx, ax) - 2, Math.min(ry, ay) - 2, Math.max(rx + rw, ax + aw) - Math.min(rx, ax) + 4, Math.max(ry + rh, ay + ah) - Math.min(ry, ay) + 4);
    const paint = (x, y, w, h, t) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const t0 = m.tileAt(xx, yy); if (t0 !== T.ROAD && t0 !== T.BRIDGE && t0 !== T.WATER && t0 !== T.DEEP) m.set(xx, yy, t); } };
    paint(rx - 3, ry - 3, rw + 6, rh + 6, T.GRASS);
    paint(rx, ry, rw, rh, T.LOT);
    paint(tax[0], tax[1], tax[2], tax[3], T.LOT);
    paint(ax, ay, aw, ah, T.LOT);
    // links from the taxiway to the apron every so often
    for (let y = tax[1] + 10; y < tax[1] + tax[3] - 6; y += 40) paint(Math.min(tax[0], ax), y, Math.abs(ax - tax[0]) + 2, 4, T.LOT);
    const term = simpleBuilding(m, tx2, ty2, tw, th, A.name, 'terminal', m.dist[ty2 * MAP_W + tx2], 'glass', { x: (tx2 + tw / 2) * TILE, y: (ty2 + th) * TILE, text: A.name });
    for (const [hx, hy, hw, hh] of A.hangars) simpleBuilding(m, hx, hy, hw, hh, 'Hangar', 'hangar', m.dist[hy * MAP_W + hx], 'metal');
    const [px, py] = A.poiAt;
    m.pois.push({ id: m.pois.length, kind: 'airport', label: A.name, x: px * TILE, y: py * TILE, r: 56, b: term.id });
    const planes = [];
    for (const [qx, qy] of A.planes) { addProp(m, 'plane', qx * TILE, qy * TILE, 40, { a: -Math.PI / 2 }); planes.push({ x: qx * TILE, y: qy * TILE }); }
    m.airports.push({ name: A.name, runway: { x: rx * TILE, y: ry * TILE, w: rw * TILE, h: rh * TILE }, taxi: { x: tax[0] * TILE, y: tax[1] * TILE, w: tax[2] * TILE, h: tax[3] * TILE }, planes });
  }
}

// Wild ground everywhere that isn't built: woods on green land, scrub in the desert, palms on beaches, and a
// few big rock outcrops. Kept sparse so the prop list stays light.
const WILD_CLEAR = new Set([T.ROAD, T.BRIDGE, T.BUILDING, T.FIELD, T.LOT, T.WALL]);
function buildWilds(m, rand) {
  const W = MAP_W;
  const { cls, cw } = m.terrainCls;
  const wild = (i) => m.land[i] && WILD_STYLES.has(DISTRICTS[m.dist[i]].style) && DISTRICTS[m.dist[i]].style !== 'airport' && !m.reserve[i];
  const inField = (tx, ty, pad) => m.fields.some((f) => tx * TILE >= f.x - pad && tx * TILE < f.x + f.w + pad && ty * TILE >= f.y - pad && ty * TILE < f.y + f.h + pad);
  const clear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (WILD_CLEAR.has(m.tileAt(tx + dx, ty + dy))) return false; return true; };
  for (let ty = 2; ty < MAP_H - 2; ty += 3) for (let tx = 2; tx < W - 2; tx += 3) {
    const i = ty * W + tx;
    if (!wild(i) || inField(tx, ty, 32)) continue;
    const t = m.tiles[i];
    if (t !== T.GRASS && t !== T.DIRT && t !== T.SAND) continue;
    if (!clear(tx, ty, 2)) continue;
    const c = terrainAt(cls, cw, tx, ty);
    const h = hash2(tx, ty, 61);
    const x = (tx + 0.5 + (hash2(tx, ty, 3) - 0.5)) * TILE, y = (ty + 0.5 + (hash2(tx, ty, 4) - 0.5)) * TILE;
    if (t === T.SAND) { if (h < 0.025) addProp(m, ['palm_a', 'palm_b', 'palm_d'][Math.floor(h * 120) % 3], x, y, 10); continue; }
    if (c === 2) { if (h < 0.22) addProp(m, h < 0.16 ? (h < 0.08 ? 'tree_a' : 'tree_b') : 'shrub_b', x, y, h < 0.16 ? 12 : 0); }
    else if (c === 1) { if (h < 0.035) addProp(m, h < 0.02 ? 'tree_b' : 'bush_c', x, y, h < 0.02 ? 12 : 0); }
    // desert scrub and mountain scree: plants and pebbles you drive through (no small rocks to crash into)
    else if (c === 3) { if (h < 0.04) addProp(m, h < 0.025 ? 'cactus' : 'bush_a', x, y, 0); }
    else if (c === 4) { if (h < 0.04) addProp(m, 'gravel', x, y, 0); }
  }
  // Rock outcrops: at most one per 12-tile cell (jittered), likeliest in the mountains and the desert - a big
  // rock (52-82 px, car-sized and up: tall, easy to see and to steer round) with plants round its foot and
  // sometimes a pine beside it, well clear of roads, tracks, fields and buildings. (World v2's country stage lays
  // nature out properly: docs/WORLD-V2.md "Nature is designed, not scattered".)
  const CELL = 12;
  for (let gy = 0; gy < MAP_H; gy += CELL) for (let gx = 0; gx < W; gx += CELL) {
    const tx = gx + 2 + Math.floor(hash2(gx, gy, 91) * (CELL - 4)), ty = gy + 2 + Math.floor(hash2(gx, gy, 92) * (CELL - 4));
    if (tx < 4 || ty < 4 || tx >= W - 4 || ty >= MAP_H - 4) continue;
    const i = ty * W + tx;
    if (!wild(i) || (m.tiles[i] !== T.GRASS && m.tiles[i] !== T.DIRT)) continue;
    const c = terrainAt(cls, cw, tx, ty);
    if (hash2(gx, gy, 93) >= (c === 4 ? 0.4 : c === 3 ? 0.25 : c === 2 ? 0.1 : 0.06)) continue;
    if (inField(tx, ty, 96) || !clear(tx, ty, 4)) continue;
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, s = 52 + Math.floor(hash2(gx, gy, 94) * 4) * 10;
    addProp(m, 'boulder', x, y, Math.round(s * 0.5), { s });
    const n = 2 + Math.floor(hash2(gx, gy, 95) * 3);
    for (let k = 0; k < n; k++) {
      const a = hash2(gx + k, gy, 96) * Math.PI * 2, r = s * 0.85 + hash2(gx, gy + k, 97) * 28;
      const kind = c === 3 ? (k % 2 ? 'bush_a' : 'cactus') : c === 4 ? (k % 2 ? 'shrub_b' : 'flowers_a') : k % 2 ? 'shrub_a' : 'flowers_a';
      addProp(m, kind, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7 + 8, 0);
    }
    if (c !== 3 && hash2(gx, gy, 98) < 0.35) addProp(m, 'tree_b', x - s * 0.95, y - 18, 12);
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
        towers: ['planter_sq', 'bench_m', 'news_a', 'news_b', 'trashcan', 'palm_s', 'bollard', 'tree_b'], commercial: ['news_c', 'trashcan', 'bench_a', 'planter_g', 'bikerack', 'phonebox', 'tree_a', 'mailbox'],
        nightlife: ['palm_s', 'palm_d', 'trashcan', 'news_b', 'foodcart', 'phonebox', 'bollard'], industrial: ['dump_g', 'drum', 'pallet_s', 'cone', 'bags', 'crates', 'trashpile'],
        southside: ['bags', 'dump_o', 'tires', 'shrub_b', 'rubble', 'trashpile', 'phonebox'], harbor: ['drum', 'pallet', 'spool', 'dump_b', 'crates'], factory: ['dump_g', 'drum', 'pallet_s', 'cone', 'tires', 'crates'], park: ['tree_a', 'bench_a', 'shrub_a'],
        luxury: ['palm_s', 'planter_sq', 'flowers_a', 'tree_a', 'bench_m', 'bollard'], redlight: ['trashcan', 'bags', 'news_b', 'dump_o', 'palm_s', 'trashpile', 'phonebox'], oldtown: ['trashcan', 'bags', 'mailbox', 'dump_g', 'news_c', 'tires', 'phonebox', 'tree_b'],
        beach: ['palm_a', 'palm_d', 'bench_m', 'umbrella_y', 'trashcan'],
      }[d.style] || ['trashcan'];
      const t = pool[Math.floor(hash2(tx, ty, 5) * pool.length)];
      addProp(m, t, x, y, t.startsWith('tree') || t.startsWith('dump') || t === 'crates' || t === 'phonebox' ? 10 : t === 'bollard' ? 5 : 0);
    }
  }
  buildBusStops(m, doorsNear);
  dressAlleys(m);
  landscapeHighway(m);
}

// The grass strips between the ring highway and its frontage roads: planted like a real
// interchange - rows of trees, clumps of shrubs and flowers - and a billboard now and then facing
// the traffic below.
function landscapeHighway(m) {
  if (!m.ringD) return;
  const W = MAP_W;
  let lastBoard = [];
  for (let ty = 2; ty < MAP_H - 2; ty++) for (let tx = 2; tx < W - 2; tx++) {
    const i = ty * W + tx;
    if (m.tiles[i] !== T.GRASS || m.deck[i] || m.reserve[i] & 24 || m.lvl0Block[i]) continue;
    const rd = m.ringD[i];
    if (rd < 9 || rd > BAND - 3) continue;
    let clear = true;
    for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1; dx++) { const t = m.tiles[i + dy * W + dx]; if (t !== T.GRASS || m.deck[i + dy * W + dx]) { clear = false; break; } }
    if (!clear) continue;
    const h = hash2(tx, ty, 707);
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE;
    if (rd >= 12 && rd <= 15 && h < 0.012 && lastBoard.every((b) => Math.hypot(b[0] - tx, b[1] - ty) > 30)) {
      let room = true;
      for (let dx = -3; dx <= 3 && room; dx++) for (let dy = -1; dy <= 1; dy++) { const j = i + dy * W + dx; if (m.tiles[j] !== T.GRASS || m.deck[j]) { room = false; break; } }
      if (room) { addProp(m, 'billboard', x, y, 10, { ad: Math.floor(hash2(tx, ty, 708) * 6) }); lastBoard.push([tx, ty]); continue; }
    }
    if (h < 0.05 && (tx + ty) % 3 === 0) addProp(m, hash2(tx, ty, 709) < 0.7 ? 'tree_a' : 'tree_b', x, y, 12);
    else if (h < 0.075) addProp(m, ['shrub_a', 'shrub_b', 'bush_a', 'bush_c', 'flowers_a'][Math.floor(hash2(tx, ty, 710) * 5)], x, y, 0);
  }
}

// Bus shelters along the avenues and arterials in town, on the pavement beside east-west stretches
// (the shelter's open front faces the road below it).
function buildBusStops(m, doorsNear) {
  const near = (x, y, r) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let dy = -2; dy <= 2; dy++) for (let dx = -3; dx <= 3; dx++) for (const e of m.solidProps.get((ty + dy) * MAP_W + tx + dx) || []) if (Math.hypot(e.x - x, e.y - y) < r) return true; return false; };
  for (const e of m.edges) {
    if (e.lvl !== 0 || !['ave', 'art', 'blvd'].includes(e.kind) || e.len < 18 * TILE) continue;
    const a = e.pts[0], b = e.pts[e.pts.length - 1];
    if (Math.abs(a.y - b.y) > 4) continue; // east-west only
    const z = m.zoneAt(a.x, a.y);
    if (z !== Z.CITY && z !== Z.SOUTH && z !== Z.WEST && z !== Z.NORTH && z !== Z.ISLE) continue;
    for (let s = 8 * TILE; s < e.len - 8 * TILE; s += 26 * TILE) {
      const q = pointAt(e.pts, s);
      if (hash2(Math.round(q.x / TILE), Math.round(q.y / TILE), 404) < 0.35) continue;
      const side = hash2(Math.round(q.x / TILE), 7, 405) < 0.5 ? -1 : 1; // either side of the road
      const y = side < 0 ? q.y - e.hw - TILE * 1.25 : q.y + e.hw + TILE * 1.6;
      const tx = Math.floor(q.x / TILE), ty = Math.floor(y / TILE);
      let ok = true;
      for (let dx = -2; dx <= 2 && ok; dx++) { const t = m.tileAt(tx + dx, ty); if (t !== T.SIDEWALK || m.deck[ty * MAP_W + tx + dx]) ok = false; }
      for (let dx = -3; dx <= 3 && ok; dx++) for (let dy = -1; dy <= 1; dy++) if (doorsNear.has(`${tx + dx},${ty + dy}`)) ok = false;
      if (!ok || near(q.x, y, 70) || onSubwayPlaza(m, q.x, y)) continue;
      addProp(m, 'busstop', (tx + 0.5) * TILE, y, 14, { face: side < 0 ? 'S' : 'N' });
    }
  }
}

// Back alleys: dumpsters, bin bags, crates, AC units and rubbish against the walls, the odd wall
// lamp - all of it smashable by anything driving through.
function dressAlleys(m) {
  const pool = ['dump_g', 'dump_b', 'bags', 'trashpile', 'crates', 'acunit', 'drum', 'tires', 'pallet', 'dump_g', 'trashpile', 'bags'];
  for (const e of m.edges) {
    if (e.kind !== 'alley' || e.lvl !== 0) continue;
    let k = 0;
    for (let s = 2.5 * TILE; s < e.len - 2.5 * TILE; s += 2.6 * TILE, k++) {
      const q = pointAt(e.pts, s);
      const h = hash2(Math.round(q.x), Math.round(q.y), 611);
      if (h > 0.55) continue;
      const side = hash2(Math.round(q.x), Math.round(q.y), 612) < 0.5 ? -1 : 1;
      const x = q.x - q.ty * side * (e.hw - 12), y = q.y + q.tx * side * (e.hw - 12);
      const t = pool[Math.floor(hash2(Math.round(q.x), Math.round(q.y), 613) * pool.length)];
      addProp(m, t, x, y, t.startsWith('dump') ? 14 : t === 'crates' || t === 'acunit' ? 12 : t === 'drum' || t === 'tires' ? 9 : 0);
      if (k % 5 === 2) { const l = addProp(m, 'lamp', q.x + q.ty * side * (e.hw - 4), q.y - q.tx * side * (e.hw - 4)); l.a = Math.atan2(q.tx * side, -q.ty * side); l.wall = true; }
    }
  }
}

// ---- traffic signals ---------------------------------------------------------------------------
// Every signalled ground-level junction gets its lights one of two ways. At a small crossing of
// side streets downtown, where buildings stand right at the corners, heads hang from span wires
// tied to those walls. Everywhere else - avenues, boulevards, the highway junctions - each approach
// has a mast-arm pole on its kerb with an arm reaching right across the incoming lanes and a head
// over every lane, so a wide road is covered end to end. A pole is street furniture: hit it hard
// enough and it goes over.
const SPAN_WIRE_STYLES = new Set(['towers', 'commercial', 'nightlife', 'oldtown', 'redlight', 'civic', 'apartments']);
const SPAN_WIRE_ROADS = new Set(['st', 'minor', 'drive', 'front']);
const POLE_GROUND = new Set([T.SIDEWALK, T.PLAZA, T.GRASS, T.LOT, T.DIRT, T.SAND]);

// Where the pole for one approach stands and where its heads hang - one over the middle of each
// incoming lane (the same geometry the renderer uses). The pole stands on the first open kerb spot
// out from the road edge; with none (a wall or water right at the kerb) it stands at the road edge.
export function signalArm(m, n, id) {
  const e = m.edges[id];
  const oa = n.dirs[id], ox = Math.cos(oa), oy = Math.sin(oa);
  const rx = oy, ry = -ox; // right-hand side for traffic arriving (heading -o)
  const back = (n.trim[id] || n.half || 60) + 14;
  const bx = n.x + ox * back, by = n.y + oy * back;
  const inner = e.oneway ? -e.hw : e.median / 2; // incoming lanes run from here out to the kerb
  const lanes = Math.max(1, e.nl);
  const lw = (e.hw - inner) / lanes;
  const heads = [];
  for (let i = 0; i < Math.min(lanes, 5); i++) {
    const off = inner + lw * (lanes <= 5 ? i + 0.5 : (i + 0.5) * (lanes / 5));
    heads.push({ x: bx + rx * off, y: by + ry * off });
  }
  heads.reverse(); // nearest the pole first
  const tip = heads[heads.length - 1];
  for (const extra of [12, 22, 32, 44, 60]) {
    const px = bx + rx * (e.hw + extra), py = by + ry * (e.hw + extra);
    if (POLE_GROUND.has(m.tileAtPx(px, py)) && !onSubwayPlaza(m, px, py)) return { x: px, y: py, hx: tip.x, hy: tip.y, heads, a: Math.atan2(ry, rx), open: true };
  }
  const px = bx + rx * (e.hw + 10), py = by + ry * (e.hw + 10);
  return { x: px, y: py, hx: tip.x, hy: tip.y, heads, a: Math.atan2(ry, rx), open: false };
}

function buildSignals(m) {
  m.signals = [];
  for (const n of m.nodes) {
    if (!n.light || n.lvl !== 0) continue;
    const ins = n.edges.filter((id) => !(m.edges[id].oneway && m.edges[id].b !== n.id));
    if (!ins.length) continue;
    const st = DISTRICTS[m.districtAt(n.x, n.y).id].style;
    const small = n.edges.every((id) => SPAN_WIRE_ROADS.has(m.edges[id].kind));
    let corners = null;
    if (small && SPAN_WIRE_STYLES.has(st)) {
      // corners: between each pair of neighbouring streets, out past the junction box (and across the
      // pavement: a wide one puts the walls further back)
      const dirs = n.edges.map((id) => n.dirs[id]).sort((a, b) => a - b);
      const reach = Math.min(160, Math.max(...n.edges.map((id) => n.trim[id] || n.half || 60)) * 1.15 + 34);
      const far = 3 * TILE + Math.max(0, ...n.edges.map((id) => (m.edges[id].walk || 64) - 64)) * 1.5 + (st === 'towers' || st === 'civic' ? 3 * TILE : 0); // (past a tower's forecourt)
      corners = [];
      for (let k = 0; k < dirs.length; k++) {
        const a0 = dirs[k], a1 = dirs[(k + 1) % dirs.length] + (k + 1 === dirs.length ? Math.PI * 2 : 0);
        const mid = (a0 + a1) / 2;
        // tie off on a building wall just behind the corner
        for (let r = 0; r <= far; r += 8) {
          const qx = n.x + Math.cos(mid) * (reach + r), qy = n.y + Math.sin(mid) * (reach + r);
          if (m.tileAtPx(qx, qy) === T.BUILDING) { corners.push({ x: qx - Math.cos(mid) * 4, y: qy - Math.sin(mid) * 4, wall: true }); break; }
        }
      }
      if (corners.length < 2) corners = null; // nothing to hang wires from: poles instead
    }
    if (corners) {
      const heads = ins.map((id) => {
        const oa = n.dirs[id];
        return { edge: id, x: n.x + Math.cos(oa) * 20, y: n.y + Math.sin(oa) * 20, a: oa };
      });
      m.signals.push({ node: n.id, wire: true, x: n.x, y: n.y, corners, heads });
      continue;
    }
    for (const id of ins) {
      const arm = signalArm(m, n, id);
      const p = addProp(m, 'sigpole', arm.x, arm.y, arm.open ? 5 : 0, { a: arm.a });
      m.signals.push({ node: n.id, edge: id, x: arm.x, y: arm.y, hx: arm.hx, hy: arm.hy, hs: arm.heads.map((h) => [Math.round(h.x), Math.round(h.y)]), pi: m.props.indexOf(p) });
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
  // toll cameras: a gantry over the road at each end of every long road bridge
  for (const e of m.edges) {
    if (!e.bridge || e.lvl !== 0) continue;
    const pts = e.pts.map((p) => ({ x: p.x, y: p.y }));
    const L = measure(pts);
    let run = null;
    const close = (s1) => {
      if (run && s1 - run.s0 > 20 * TILE) {
        for (const s of [run.s0 + 2 * TILE, s1 - 2 * TILE]) {
          const p = pointAt(pts, s);
          m.cameras.push({ id: m.cameras.length, x: p.x, y: p.y, r: 340, toll: true, a: Math.atan2(p.ty, p.tx), hw: e.hw });
        }
      }
      run = null;
    };
    for (let s = 0; s <= L; s += TILE / 2) {
      const p = pointAt(pts, s);
      if (m.tileAtPx(p.x, p.y) === T.BRIDGE) { if (!run) run = { s0: s }; } else close(s);
    }
    close(L);
  }
}

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
