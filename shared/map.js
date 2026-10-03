// Deterministic GTA-style city generator + tile queries. Server and client both call
// generateCity(seed) and get byte-identical maps, so the map is never sent over the wire.
//
// Layout: arterial avenues split the mainland into nine districts. Each district is cut
// into irregular blocks by recursive subdivision with mixed street widths (T-junctions,
// long and short blocks, no perfect grid), then blocks are filled with building prefabs
// cut from the concept building sheet. A river separates rural Refuge Island; the south
// coast has beaches, a boardwalk and piers.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { mulberry32, hash2 } from './rng.js';
import { PREFABS } from './prefab-data.js';

export const RIVER_X0 = 300, RIVER_X1 = 311;
export const ISLAND_ROAD_X = 340;
export const COAST_ROAD_Y = 282;

export const PED_BLOCK = new Uint8Array(16);
export const CAR_BLOCK = new Uint8Array(16);
export const BOAT_BLOCK = new Uint8Array(16).fill(1);
for (const t of [T.WALL, T.BUILDING, T.WATER, T.DEEP]) PED_BLOCK[t] = 1;
for (const t of [T.WALL, T.BUILDING, T.WATER, T.DEEP, T.DOCK]) CAR_BLOCK[t] = 1;
BOAT_BLOCK[T.WATER] = 0; BOAT_BLOCK[T.DEEP] = 0; BOAT_BLOCK[T.BRIDGE] = 0;

// Surface handling multipliers: [speedMul, gripMul, isAsphalt]
export const SURFACE = [];
SURFACE[T.WALL] = [1, 1, 0];
SURFACE[T.GRASS] = [0.6, 0.7, 0];
SURFACE[T.SIDEWALK] = [0.95, 0.95, 1];
SURFACE[T.ROAD] = [1, 1, 1];
SURFACE[T.PLAZA] = [0.95, 0.95, 1];
SURFACE[T.BUILDING] = [1, 1, 0];
SURFACE[T.WATER] = [1, 1, 0];
SURFACE[T.DEEP] = [1, 1, 0];
SURFACE[T.SAND] = [0.5, 0.6, 0];
SURFACE[T.DOCK] = [0.9, 0.9, 0];
SURFACE[T.DIRT] = [0.85, 0.8, 0];
SURFACE[T.FIELD] = [0.5, 0.65, 0];
SURFACE[T.BRIDGE] = [1, 1, 1];
SURFACE[T.LOT] = [1, 1, 1];

// ---------------------------------------------------------------------------
// Districts. Materials pick concept textures in the renderer.
// walk: sidewalk texture, plaza: interior plaza texture, road: asphalt variant, ground: default interior tile
export const DISTRICTS = [
  { id: 0, name: 'Pine Hills', style: 'houses', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 1, name: 'Midtown', style: 'commercial', walk: 'concrete', plaza: 'brick', road: 'asphalt', ground: T.LOT, turf: false },
  { id: 2, name: 'Northgate', style: 'apartments', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 3, name: 'The Yards', style: 'industrial', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: true },
  { id: 4, name: 'Downtown', style: 'towers', walk: 'slate', plaza: 'slate', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 5, name: 'Civic Center', style: 'civic', walk: 'concrete', plaza: 'slate', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 6, name: 'Southside', style: 'southside', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.GRASS, turf: true },
  { id: 7, name: 'Neon Strip', style: 'nightlife', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.PLAZA, turf: false },
  { id: 8, name: 'Harbor', style: 'harbor', walk: 'concrete', plaza: 'concrete', road: 'asphalt_worn', ground: T.LOT, turf: false },
  { id: 9, name: 'Refuge Island', style: 'rural', walk: 'concrete', plaza: 'concrete', road: 'asphalt', ground: T.GRASS, turf: false },
  { id: 10, name: 'Sunset Beach', style: 'beach', walk: 'brick', plaza: 'brick', road: 'asphalt', ground: T.SAND, turf: false },
];

const COLS = [[8, 98], [104, 196], [202, 292]];
const ROWS = [[8, 108], [114, 204], [210, 282]];

// Subdivision + fill parameters per style. gen: generic prefab weights.
const STYLE = {
  houses: { minW: 18, minH: 18, maxW: 40, maxH: 34, streets: [4, 3, 3], gen: { house1: 3, house2: 3, house3: 3, apt2: 1, rest2: 0.4 }, filler: 'park' },
  commercial: { minW: 22, minH: 16, maxW: 46, maxH: 32, streets: [4, 4, 3], gen: { conv: 2, rest1: 2, rest2: 2, gas: 1, apt1: 1, club: 0.5, tower2: 1 }, filler: 'parking' },
  apartments: { minW: 18, minH: 19, maxW: 40, maxH: 36, streets: [4, 3], gen: { apt1: 3, apt2: 3, house2: 1, conv: 1, tower2: 1 }, filler: 'park' },
  industrial: { minW: 24, minH: 16, maxW: 52, maxH: 36, streets: [4, 3], gen: { warehouse: 3, industrial: 2, repair: 1 }, filler: 'yard' },
  towers: { minW: 18, minH: 19, maxW: 42, maxH: 36, streets: [4, 4, 3], gen: { tower1: 3, tower2: 3, apt1: 1, hotel: 1 }, filler: 'plaza' },
  civic: { minW: 20, minH: 18, maxW: 44, maxH: 38, streets: [4, 3], gen: { apt1: 1, tower2: 1, house1: 1, conv: 1, rest1: 1 }, filler: 'park' },
  southside: { minW: 18, minH: 18, maxW: 42, maxH: 34, streets: [3, 3, 4], gen: { house1: 2, house3: 2, warehouse: 1, industrial: 1, apt2: 1 }, filler: 'yard' },
  nightlife: { minW: 20, minH: 18, maxW: 44, maxH: 36, streets: [4, 3], gen: { club: 3, rest1: 2, rest2: 2, hotel: 1, conv: 1 }, filler: 'plaza' },
  harbor: { minW: 22, minH: 16, maxW: 50, maxH: 34, streets: [4, 3], gen: { warehouse: 4, industrial: 1, repair: 1 }, filler: 'yard' },
};

// Every business the game systems rely on, placed in a specific district.
// strip prefabs host one business per storefront door.
const SPECIALS = [
  { d: 5, prefab: 'hospital', biz: ['hospital'], names: ['St. Neon General'] },
  { d: 0, prefab: 'hospital', biz: ['hospital'], names: ['Westside Medical'] },
  { d: 6, prefab: 'hospital', biz: ['hospital'], names: ['Southside Clinic'] },
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
    this.dist = new Uint8Array(MAP_W * MAP_H).fill(9);
    this.roadAxis = new Uint8Array(MAP_W * MAP_H); // bit1 vertical road, bit2 horizontal road
    this.bld = new Int16Array(MAP_W * MAP_H).fill(-1);
    this.buildings = [];
    this.prefabs = [];
    this.roads = [];
    this.blocks = [];
    this.pois = [];
    this.homes = [];
    this.props = [];
    this.solidProps = new Map(); // tile index -> [{x,y,r}]
    this.parking = [];
    this.stalls = [];
    this.marina = [];
    this.dropSites = [];
    this.cameras = [];
    this.nodes = [];
    this.lamps = [];
    this.fields = [];
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
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return DISTRICTS[9];
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
    arr.push({ x, y, r });
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

export function isTurf(x, y) { // syndicate gang territory (pixels): The Yards + Southside
  return x < 98 * TILE && y > 108 * TILE && y < COAST_ROAD_Y * TILE;
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

export function coastY(tx) {
  return 300 + Math.round(4 * Math.sin(tx / 17) + 3 * Math.sin(tx / 7.3 + 1));
}

// ---------------------------------------------------------------------------
export function generateCity(seed = 1337) {
  const m = new CityMap(seed);
  const rand = mulberry32(seed);

  // --- terrain --------------------------------------------------------------
  m.fill(0, 0, MAP_W, MAP_H, T.GRASS);
  for (let tx = 0; tx < MAP_W; tx++) {
    const cy = coastY(tx);
    for (let ty = cy - 8; ty < MAP_H; ty++) {
      if (ty < cy) m.set(tx, ty, T.SAND);
      else if (ty < cy + 9) m.set(tx, ty, T.WATER);
      else m.set(tx, ty, T.DEEP);
    }
    m.setDist(tx, COAST_ROAD_Y + 4, 1, MAP_H, 10);
  }
  for (let ty = 0; ty < MAP_H; ty++) {
    const wob = Math.round(1.5 * Math.sin(ty / 9));
    for (let tx = RIVER_X0 + wob; tx <= RIVER_X1 + wob; tx++) {
      const t = m.tileAt(tx, ty);
      if (t === T.DEEP) continue;
      m.set(tx, ty, tx - RIVER_X0 - wob >= 3 && tx - RIVER_X0 - wob <= 8 ? T.DEEP : T.WATER);
    }
  }
  m.setDist(RIVER_X1 + 2, 0, MAP_W, COAST_ROAD_Y + 4, 9);

  // --- arterial roads -------------------------------------------------------
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
  road(4, 4, 4, COAST_ROAD_Y + 4 - 4, 4, 'v');            // west edge
  road(98, 4, 6, COAST_ROAD_Y + 4 - 4, 6, 'v');           // Westlake Ave
  road(196, 4, 6, COAST_ROAD_Y + 4 - 4, 6, 'v');          // Central Ave
  road(292, 4, 4, COAST_ROAD_Y + 4 - 4, 4, 'v');          // River Rd
  road(4, 4, 292, 4, 4, 'h');                              // north edge
  road(4, 108, ISLAND_ROAD_X + 4 - 4, 6, 6, 'h');          // Bridge Ave (north bridge)
  road(4, 204, ISLAND_ROAD_X + 4 - 4, 6, 6, 'h');          // Harbor Blvd (south bridge)
  road(4, COAST_ROAD_Y, 292, 4, 4, 'h');                   // Ocean Drive
  road(ISLAND_ROAD_X, 16, 4, 278, 4, 'v', 'rural');         // island road

  // --- districts + blocks ----------------------------------------------------
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const d = r * 3 + c;
    const [x0, x1] = COLS[c], [y0, y1] = ROWS[r];
    m.setDist(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4, d);
    const st = STYLE[DISTRICTS[d].style];
    const dr = mulberry32(seed ^ (d * 7919 + 13));
    subdivide(m, road, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, st, dr, d, 0);
  }

  // --- fill blocks with prefabs ---------------------------------------------
  const rows = [];
  for (const b of m.blocks) {
    const st = STYLE[DISTRICTS[b.d].style];
    paveBlock(m, b);
    const ix = b.x + 2, iy = b.y + 2, iw = b.w - 4, ih = b.h - 4;
    b.ix = ix; b.iy = iy; b.iw = iw; b.ih = ih;
    m.fill(ix, iy, iw, ih, DISTRICTS[b.d].ground);
    if (b.park) continue;
    const minH = Math.min(...Object.keys(st.gen).map((k) => PREFABS[k].th));
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
  for (const b of m.blocks) if (b.park) buildPark(m, b, mulberry32(seed ^ (b.x * 13 + b.y)));

  // --- district ids for the arterial roads between districts -------------------
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < RIVER_X0 - 2; tx++) {
    const i = ty * MAP_W + tx;
    if (m.dist[i] !== 9) continue;
    if (ty >= COAST_ROAD_Y + 2) { m.dist[i] = 10; continue; }
    const c = tx < 101 ? 0 : tx < 199 ? 1 : 2, r = ty < 111 ? 0 : ty < 207 ? 1 : 2;
    m.dist[i] = r * 3 + c;
  }

  // --- coast, island, street furniture, traffic graph -----------------------
  buildCoast(m, rand);
  buildIsland(m, rand);
  buildStreetProps(m);
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
  const chance = !needV && !needH ? (big && depth < 3 ? 0.35 : 0) : 1;
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
  const groundT = { lot: T.LOT, plaza: T.PLAZA, grass: T.GRASS, dirt: T.DIRT }[pf.ground] ?? T.LOT;
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
      if (kind === 'hospital') m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: dd.px, y: dd.py, r: 36, b: bid });
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

function filler(m, row, x, w, st, rand, backLot = false) {
  if (w <= 0) return;
  const x0 = x, y0 = row.y, h = row.h;
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

function buildPark(m, b, rand) {
  const { ix, iy, iw, ih } = b;
  m.fill(ix, iy, iw, ih, T.GRASS);
  const cx = ix + Math.floor(iw / 2), cy = iy + Math.floor(ih / 2);
  m.fill(ix, cy - 1, iw, 2, T.PLAZA);
  m.fill(cx - 1, iy, 2, ih, T.PLAZA);
  m.fill(cx - 4, cy - 4, 8, 8, T.PLAZA);
  addProp(m, 'fountain', cx * TILE, cy * TILE, 36);
  for (const [dx, dy] of [[-5, -2.5], [5, -2.5], [-5, 2.5], [5, 2.5]]) addProp(m, 'pbench', (cx + dx) * TILE, (cy + dy) * TILE, 0);
  for (let k = 0; k < (iw * ih) / 14; k++) {
    const tx = ix + 1 + Math.floor(rand() * (iw - 2)), ty = iy + 1 + Math.floor(rand() * (ih - 2));
    if (m.tileAt(tx, ty) !== T.GRASS) continue;
    const t = ['tree_a', 'tree_b', 'tree_a', 'shrub_a', 'flowers_a', 'flowers_big', 'mosaic'][Math.floor(rand() * 7)];
    addProp(m, t, (tx + 0.5) * TILE, (ty + 0.5) * TILE, t.startsWith('tree') ? 12 : 0);
  }
  m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Central Park', x: cx * TILE, y: (cy + 4.5) * TILE, r: 48 });
}

function addProp(m, t, x, y, solidR = 0, extra = null) {
  const p = { t, x, y };
  if (extra) Object.assign(p, extra);
  m.props.push(p);
  if (solidR > 0) m.addSolidProp(x, y, solidR);
  if (t === 'lamp') m.lamps.push(p);
  return p;
}

// ---------------------------------------------------------------------------
function buildCoast(m, rand) {
  // boardwalk strip under Ocean Drive, then sand, palms and piers
  for (let tx = 4; tx < RIVER_X0 - 2; tx++) {
    for (let ty = COAST_ROAD_Y + 4; ty < COAST_ROAD_Y + 6; ty++) if (m.tileAt(tx, ty) !== T.ROAD) m.set(tx, ty, T.SIDEWALK);
    for (let ty = COAST_ROAD_Y + 6; ty < coastY(tx) - 6; ty++) m.set(tx, ty, tx > 104 && tx < 196 ? T.PLAZA : T.SAND);
  }
  for (let tx = 8; tx < RIVER_X0 - 4; tx += 7 + Math.floor(rand() * 4)) {
    const y = (coastY(tx) - 6.5) * TILE;
    if (m.tileAt(tx, Math.floor(y / TILE)) === T.SAND || m.tileAt(tx, Math.floor(y / TILE)) === T.PLAZA) addProp(m, ['palm_a', 'palm_b', 'palm_c', 'palm_d'][Math.floor(rand() * 4)], (tx + 0.5) * TILE, y, 10);
  }
  for (let tx = 20; tx < RIVER_X0 - 10; tx += 23) addProp(m, ['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'][tx % 4], (tx + 3.5) * TILE, (coastY(tx) - 3) * TILE, 0);
  const piers = [60, 150, 222, 250, 274];
  for (const px of piers) {
    const top = COAST_ROAD_Y + 6, len = coastY(px) + 14 - top;
    m.fill(px, top, 3, len, T.DOCK);
    m.fill(px - 3, top + len - 3, 9, 3, T.DOCK);
    addProp(m, 'lamp', (px + 1.5) * TILE, (top + len - 2) * TILE);
    const wy = (coastY(px) + 4) * TILE;
    m.marina.push({ x: (px + 5.5) * TILE, y: wy, a: Math.PI / 2 });
    m.marina.push({ x: (px - 2.5) * TILE, y: wy, a: Math.PI / 2 });
  }
  m.dropSites.push({ x: (piers[0] + 1.5) * TILE, y: (coastY(piers[0]) + 11) * TILE, name: 'the end of the public pier' });
}

function buildIsland(m, rand) {
  const x0 = RIVER_X1 + 4;
  const fields = [[x0 + 1, 34, 20, 30], [x0 + 1, 120, 20, 40], [ISLAND_ROAD_X + 6, 40, 30, 60], [ISLAND_ROAD_X + 6, 120, 30, 70], [x0 + 1, 216, 20, 50]];
  for (const [fx, fy, fw, fh] of fields) {
    m.fill(fx, fy, fw, fh, T.FIELD);
    m.fields.push({ x: fx * TILE, y: fy * TILE, w: fw * TILE, h: fh * TILE });
  }
  // farm co-op: farmhouse prefab beside the island road
  const pf = PREFABS.house2;
  const fx = ISLAND_ROAD_X - pf.tw - 3, fy = 16;
  m.fill(fx - 1, fy, pf.tw + 2, pf.th + 3, T.DIRT);
  const row = { d: 9, x: fx, y: fy, w: pf.tw, h: pf.th, face: 'S' };
  const b = placePrefab(m, row, "house2", fx, { biz: ["farm"], names: ["Refuge Farm Co-op"] }, rand);
  const farm = m.pois.find((p) => p.kind === 'farm');
  farm.cargoPad = { x: (fx - 3) * TILE, y: (fy + pf.th + 1.5) * TILE };
  m.fill(fx - 6, fy + pf.th, pf.tw + 9, 4, T.DIRT);
  void b;
  for (let k = 0; k < 70; k++) {
    const tx = x0 + Math.floor(rand() * (MAP_W - x0 - 2)), ty = 2 + Math.floor(rand() * 290);
    if (m.tileAt(tx, ty) === T.GRASS) addProp(m, rand() < 0.8 ? 'tree_b' : 'shrub_b', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12);
  }
  m.dropSites.push({ x: (ISLAND_ROAD_X + 2) * TILE, y: 270 * TILE, name: 'the Refuge Island boonies' });
  // mainland outskirts tree line (north and west edges)
  for (let ty = 0; ty < COAST_ROAD_Y; ty += 2) for (let tx = 0; tx < RIVER_X0; tx += 2) {
    if ((tx < 4 || ty < 4) && m.tileAt(tx, ty) === T.GRASS && hash2(tx, ty, m.seed) < 0.5) addProp(m, 'tree_b', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12);
  }
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
        southside: ['bags', 'dump_o', 'tires', 'shrub_b'], harbor: ['drum', 'pallet', 'spool', 'dump_b'],
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
  for (let d = 0; d < 9; d++) {
    const inD = lit.filter((n) => m.districtAt(n.x, n.y).id === d);
    if (!inD.length) continue;
    picks.push(inD[Math.floor(rand() * inD.length)]);
    if (d === 4 && inD.length > 2) picks.push(inD[Math.floor(rand() * inD.length)]);
  }
  for (const n of picks) m.cameras.push({ id: m.cameras.length, x: n.x + n.half + 20, y: n.y - n.half - 20, r: 300 });
}
