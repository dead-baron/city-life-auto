// What's underfoot (pure: test/sound.test.js): the footstep surface from the map tile under a ped, and whether
// that's the woods (where anyone moving fast snaps twigs and crunches leaves; sneaking through stays quiet).
import { T } from '../../shared/constants.js';

export const SURFACES = Object.freeze(['asphalt', 'pavement', 'grass', 'dirt', 'sand', 'wood', 'metal', 'water', 'deep', 'floor']);

const BY_TILE = [];
BY_TILE[T.ROAD] = 'asphalt'; BY_TILE[T.LOT] = 'asphalt';
BY_TILE[T.SIDEWALK] = 'pavement'; BY_TILE[T.PLAZA] = 'pavement'; BY_TILE[T.WALL] = 'pavement'; BY_TILE[T.BUILDING] = 'pavement';   // (a roof)
BY_TILE[T.GRASS] = 'grass'; BY_TILE[T.FIELD] = 'grass';
BY_TILE[T.DIRT] = 'dirt'; BY_TILE[T.SAND] = 'sand';
BY_TILE[T.DOCK] = 'wood';                                   // docks, piers and the boardwalks
BY_TILE[T.BRIDGE] = 'metal';                                // the bridges' steel decks
BY_TILE[T.WATER] = 'water'; BY_TILE[T.DEEP] = 'deep';       // wading / swimming
BY_TILE[T.FLOOR] = 'floor'; BY_TILE[T.COUNTER] = 'floor';   // inside the walk-ins

// The surface for a tile type; up on the highway deck (deck) it's always the road.
export function surfaceOf(tile, deck = false) {
  if (deck) return 'asphalt';
  return BY_TILE[tile] || 'pavement';
}

// The surface at a world point on the map (map: tileAtPx; lz: the level height, >0 up on the deck).
export function surfaceAt(map, x, y, lz = 0) { return surfaceOf(map.tileAtPx(x, y), lz > 0); }

// The woods: grass or dirt in the wild districts and the parks (not the desert's dirt, nor the beaches).
const WOODS_STYLE = new Set(['wild', 'park']);
export function woodsOf(tile, style) { return WOODS_STYLE.has(style) && (tile === T.GRASS || tile === T.DIRT); }
export function woodsAt(map, x, y) {
  const D = map.districtAt ? map.districtAt(x, y) : null;
  return woodsOf(map.tileAtPx(x, y), D ? D.style : '');
}

// How each surface sounds underfoot (instruments.js step): a filtered noise scuff (f, q, dur), a soft low thump
// (thump Hz), grit (a second, gritty scrape), and the odd extra: a hollow knock (wood), a ring (metal), a splash
// (water), a swish (grass), a squeak (indoor floors).
export const STEP = Object.freeze({
  asphalt: { f: 1500, q: 0.9, dur: 0.045, v: 0.55, thump: 95, grit: 0.25 },
  pavement: { f: 2200, q: 1.1, dur: 0.04, v: 0.5, thump: 110, grit: 0.35 },
  grass: { f: 3400, q: 0.6, dur: 0.09, v: 0.32, thump: 70, grit: 0, swish: 1 },
  dirt: { f: 950, q: 0.8, dur: 0.07, v: 0.45, thump: 80, grit: 0.55 },
  sand: { f: 2700, q: 0.5, dur: 0.12, v: 0.3, thump: 55, grit: 0.85 },
  wood: { f: 650, q: 2.4, dur: 0.07, v: 0.6, thump: 150, hollow: 310 },
  metal: { f: 2500, q: 5, dur: 0.11, v: 0.45, thump: 125, ring: 1650 },
  water: { f: 1200, q: 0.7, dur: 0.17, v: 0.5, thump: 60, splash: 1 },
  deep: { f: 900, q: 0.6, dur: 0.3, v: 0.4, thump: 0, splash: 2 },
  floor: { f: 3000, q: 1.5, dur: 0.035, v: 0.45, thump: 135, squeak: 1 },
});
