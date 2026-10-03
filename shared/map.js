// Deterministic city generator + tile queries. Server and client both call
// generateCity(seed) and get byte-identical maps, so the map is never sent over the wire.

import { T, TILE, MAP_W, MAP_H } from './constants.js';
import { mulberry32, hash2 } from './rng.js';

export const ROAD_X = [4, 28, 52, 76, 100, 124, 148, 172];
export const ROAD_Y = [4, 28, 52, 76, 100, 124, 148, 172, 196];
export const ROAD_W = 4;
export const RIVER_X0 = 196, RIVER_X1 = 203;
export const BEACH_Y0 = 226, OCEAN_Y0 = 232, DEEP_Y0 = 238;
export const ISLAND_X0 = 204, ISLAND_ROAD_X = 228;
export const BRIDGE_ROWS = [2, 6];

// Building/business registry. `kind` drives roof style, interaction menus and AI.
export const BUSINESS = {
  hospital: { name: 'St. Neon General', w: 12, h: 9, lot: true },
  police: { name: 'Metro City PD - HQ', w: 12, h: 8, lot: true },
  courthouse: { name: 'Hall of Justice', w: 10, h: 8 },
  bank: { name: 'First Pixel Bank', w: 10, h: 8 },
  gunshop: { name: 'Iron Sights Arms', w: 8, h: 6, lot: true },
  pawn: { name: 'Second Chance Pawn', w: 8, h: 6, lot: true },
  sports: { name: 'Home Run Sports', w: 8, h: 6, lot: true },
  hardware: { name: 'Nail & Gear Hardware', w: 8, h: 6, lot: true },
  pharmacy: { name: 'MediMart Pharmacy', w: 8, h: 6, lot: true },
  coffee: { name: 'Bean Machine Coffee', w: 7, h: 5, lot: true },
  garage: { name: 'Fresh Coat Garage', w: 8, h: 6, lot: true },
  clothing: { name: 'Threads Outfitters', w: 8, h: 6, lot: true },
  dealer: { name: 'Motor Row Dealership', w: 10, h: 6, lot: true },
  warehouse: { name: 'Portside Logistics', w: 14, h: 7, lot: true },
  fence: { name: 'Back-Alley Exchange', w: 8, h: 6, lot: true },
  grocery: { name: 'FreshHub Grocery', w: 12, h: 7, lot: true },
  fishmarket: { name: 'Dockside Fish Market', w: 10, h: 6 },
  farm: { name: 'Refuge Farm Co-op', w: 8, h: 6 },
};

const SPECIAL_BLOCKS = {
  '3,5': 'police', '5,2': 'hospital', '4,3': 'bank', '3,3': 'courthouse', '2,5': 'gunshop',
  '6,6': 'pawn', '5,1': 'sports', '2,1': 'hardware', '4,1': 'pharmacy', '3,1': 'coffee',
  '6,4': 'garage', '6,3': 'clothing', '6,2': 'dealer', '2,7': 'warehouse', '0,7': 'fence',
  '4,5': 'grocery', '5,8': 'fishmarket',
};
const PARK_BLOCKS = new Set(['4,4', '6,5', '7,8', '1,2']);
const CONSTRUCTION_BLOCKS = new Set(['5,6']);
const MARINA_BLOCKS = new Set(['6,8']);

export function blockKind(i, j) {
  const key = `${i},${j}`;
  if (SPECIAL_BLOCKS[key]) return SPECIAL_BLOCKS[key];
  if (PARK_BLOCKS.has(key)) return 'park';
  if (CONSTRUCTION_BLOCKS.has(key)) return 'construction';
  if (MARINA_BLOCKS.has(key)) return 'marina';
  if (i <= 1 && j >= 6) return 'industrial';
  if (i >= 3 && i <= 5 && j >= 2 && j <= 4) return 'tower';
  if (j === 8) return 'boardwalk';
  if (j === 1 || j === 5 || j === 7) return 'commercial';
  return 'residential';
}

export function isTurf(x, y) { // syndicate gang territory (pixels)
  return x < ROAD_X[2] * TILE && y > ROAD_Y[6] * TILE && y < BEACH_Y0 * TILE;
}

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

export class CityMap {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.w = MAP_W; this.h = MAP_H;
    this.tiles = new Uint8Array(MAP_W * MAP_H);
    this.bld = new Int16Array(MAP_W * MAP_H).fill(-1);
    this.buildings = [];
    this.pois = [];
    this.props = [];
    this.solidProps = new Map(); // tile index -> [{x,y,r}]
    this.parking = [];
    this.marina = [];
    this.dropSites = [];
    this.cameras = [];
    this.nodes = [];
    this.lamps = [];
    this.fields = [];
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
  // nearest node to a pixel position
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

// ---------------------------------------------------------------------------
// Traffic lights: deterministic from time, shared so the client can render them.
export const LIGHT_CYCLE = 24; // divides the 1200 s chrono loop evenly
// `tSec` is the shared chrono-loop time (sent in every snapshot header).
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

// ---------------------------------------------------------------------------
export function generateCity(seed = 1337) {
  const m = new CityMap(seed);
  const rand = mulberry32(seed);

  m.fill(0, 0, MAP_W, MAP_H, T.GRASS);
  // Ocean + beach across the south
  m.fill(0, BEACH_Y0, MAP_W, OCEAN_Y0 - BEACH_Y0, T.SAND);
  m.fill(0, OCEAN_Y0, MAP_W, MAP_H - OCEAN_Y0, T.WATER);
  m.fill(0, DEEP_Y0, MAP_W, MAP_H - DEEP_Y0, T.DEEP);
  // River separating Refuge Island
  m.fill(RIVER_X0, 0, RIVER_X1 - RIVER_X0 + 1, OCEAN_Y0, T.WATER);
  m.fill(RIVER_X0 + 2, 0, 4, OCEAN_Y0, T.DEEP);

  // Road grid
  const lastX = ROAD_X[ROAD_X.length - 1] + ROAD_W;
  const lastY = ROAD_Y[ROAD_Y.length - 1] + ROAD_W;
  for (const x0 of ROAD_X) m.fill(x0, ROAD_Y[0], ROAD_W, lastY - ROAD_Y[0], T.ROAD);
  for (const y0 of ROAD_Y) m.fill(ROAD_X[0], y0, lastX - ROAD_X[0], ROAD_W, T.ROAD);
  // Bridges + island roads
  for (const j of BRIDGE_ROWS) {
    const y0 = ROAD_Y[j];
    m.fill(lastX, y0, RIVER_X0 - lastX, ROAD_W, T.ROAD);
    m.fill(RIVER_X0, y0, RIVER_X1 - RIVER_X0 + 1, ROAD_W, T.BRIDGE);
    m.fill(ISLAND_X0, y0, ISLAND_ROAD_X + ROAD_W - ISLAND_X0, ROAD_W, T.DIRT);
  }
  m.fill(ISLAND_ROAD_X, ROAD_Y[BRIDGE_ROWS[0]], ROAD_W, ROAD_Y[BRIDGE_ROWS[1]] + ROAD_W - ROAD_Y[BRIDGE_ROWS[0]], T.DIRT);

  // Outer margin of the city: tree line
  for (let ty = 0; ty < BEACH_Y0; ty++) for (let tx = 0; tx < RIVER_X0; tx++) {
    if ((tx < ROAD_X[0] || ty < ROAD_Y[0]) && m.tileAt(tx, ty) === T.GRASS && hash2(tx, ty, seed) < 0.18 && tx % 2 === 0 && ty % 2 === 0) {
      addProp(m, 'tree', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 13);
    }
  }

  // Blocks
  for (let i = 0; i < ROAD_X.length; i++) {
    for (let j = 0; j < ROAD_Y.length; j++) {
      const bx = ROAD_X[i] + ROAD_W, by = ROAD_Y[j] + ROAD_W;
      const bw = (i < ROAD_X.length - 1 ? ROAD_X[i + 1] : RIVER_X0) - bx;
      const bh = (j < ROAD_Y.length - 1 ? ROAD_Y[j + 1] : BEACH_Y0) - by;
      buildBlock(m, rand, i, j, bx, by, bw, bh);
    }
  }

  buildIsland(m, rand);
  buildDocks(m, rand);
  buildStreetProps(m);
  buildLaneGraph(m);
  buildCameras(m);

  const hosp = m.pois.find((p) => p.kind === 'hospital');
  const pd = m.pois.find((p) => p.kind === 'police');
  m.spawns.hospital = { x: hosp.x, y: hosp.y + 40 };
  m.spawns.police = { x: pd.x, y: pd.y + 40 };
  m.spawns.default = m.spawns.hospital;
  return m;
}

function addProp(m, t, x, y, solidR = 0, extra = null) {
  const p = { t, x, y };
  if (extra) Object.assign(p, extra);
  m.props.push(p);
  if (solidR > 0) m.addSolidProp(x, y, solidR);
  if (t === 'lamp') m.lamps.push(p);
  return p;
}

function addBuilding(m, tx, ty, tw, th, kind, extra = {}) {
  const id = m.buildings.length;
  const b = { id, tx, ty, tw, th, kind, style: Math.floor(hash2(tx, ty, m.seed) * 1000), ...extra };
  m.buildings.push(b);
  for (let y = ty; y < ty + th; y++) for (let x = tx; x < tx + tw; x++) {
    m.set(x, y, T.BUILDING);
    m.bld[y * MAP_W + x] = id;
  }
  return b;
}

// Door on the bottom edge (south face) of a building -> POI just outside.
function addDoorPoi(m, b, kind, label, r = 48) {
  const dx = b.tx + Math.floor(b.tw / 2);
  const dy = b.ty + b.th; // tile just south of building
  b.door = { tx: dx, ty: dy - 1 };
  const poi = { id: m.pois.length, kind, label, x: (dx + 0.5) * TILE, y: (dy + 0.6) * TILE, r, b: b.id };
  m.pois.push(poi);
  return poi;
}

function lotSpots(m, x0, y0, w, h, angle = -Math.PI / 2) {
  // vertical parking stalls 2 tiles wide, 4 tiles deep, along the bottom of the area
  if (h < 4) return;
  const sy = y0 + h - 2; // stall center row (car points north)
  for (let x = x0 + 1; x + 1 < x0 + w; x += 2) {
    m.parking.push({ x: (x + 0.5) * TILE + 16, y: (sy) * TILE, a: angle });
  }
}

function buildBlock(m, rand, i, j, bx, by, bw, bh) {
  const kind = blockKind(i, j);
  // sidewalk ring
  m.fill(bx, by, bw, bh, T.SIDEWALK);
  const ix = bx + 2, iy = by + 2, iw = bw - 4, ih = bh - 4;
  const r = mulberry32(m.seed ^ (i * 7919 + j * 104729));
  const blockInfo = { i, j, kind, x: ix, y: iy, w: iw, h: ih };

  if (BUSINESS[kind]) {
    const spec = BUSINESS[kind];
    m.fill(ix, iy, iw, ih, spec.lot ? T.LOT : T.PLAZA);
    const tx = ix + Math.floor((iw - spec.w) / 2);
    const b = addBuilding(m, tx, iy, spec.w, spec.h, kind, { name: spec.name, business: kind });
    const poi = addDoorPoi(m, b, kind, spec.name);
    const lotY = iy + spec.h + 1, lotH = ih - spec.h - 1;
    if (spec.lot) lotSpots(m, ix, lotY, iw, lotH);
    if (!spec.lot) {
      // landscaped corners
      for (const [cx, cy] of [[ix, iy + ih - 3], [ix + iw - 3, iy + ih - 3]]) {
        m.fill(cx, cy, 3, 3, T.GRASS);
        addProp(m, 'tree', (cx + 1.5) * TILE, (cy + 1.5) * TILE, 13);
      }
    }
    if (kind === 'police') {
      poi.spawnLot = { x: (ix + 3) * TILE, y: (iy + ih - 2) * TILE, a: -Math.PI / 2 };
      m.pois.push({ id: m.pois.length, kind: 'evidence', label: 'Evidence Locker', x: (tx + spec.w + 1) * TILE, y: (iy + spec.h + 1.5) * TILE, r: 64, b: b.id });
    }
    if (kind === 'hospital') {
      m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: poi.x, y: poi.y, r: 36, b: b.id });
    }
    if (kind === 'dealer' || kind === 'garage') {
      poi.spawnLot = { x: (ix + iw / 2) * TILE, y: (iy + ih - 2) * TILE, a: -Math.PI / 2 };
    }
    if (kind === 'warehouse') {
      poi.cargoPad = { x: (ix + 3) * TILE, y: (iy + spec.h + 2.5) * TILE };
      for (let k = 0; k < 4; k++) addProp(m, 'crates', (ix + 9 + k * 1.5) * TILE, (iy + ih - 1.5) * TILE);
    }
    if (kind === 'fence') m.dropSites.push({ x: (ix + 2) * TILE, y: (iy + ih - 2) * TILE, name: 'the Syndicate yards' });
    if (kind === 'bank') {
      addProp(m, 'atm', (b.door.tx - 2.5) * TILE, (iy + spec.h + 0.5) * TILE);
      m.pois.push({ id: m.pois.length, kind: 'atm', label: 'ATM', x: (b.door.tx - 2.5) * TILE, y: (iy + spec.h + 1.2) * TILE, r: 36 });
    }
    if (kind === 'coffee' || kind === 'sports' || kind === 'pharmacy') {
      const vx = (tx + spec.w + 0.6) * TILE, vy = (iy + 1) * TILE;
      addProp(m, 'vending', vx, vy);
      m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: vx, y: vy + 20, r: 32 });
    }
    if (kind === 'fishmarket') {
      m.fill(ix, iy + spec.h + 1, iw, ih - spec.h - 1, T.PLAZA);
    }
    blockInfo.building = b.id;
    return;
  }

  switch (kind) {
    case 'park': {
      m.fill(ix, iy, iw, ih, T.GRASS);
      const cx = ix + Math.floor(iw / 2) - 1, cy = iy + Math.floor(ih / 2) - 1;
      m.fill(ix, cy, iw, 2, T.PLAZA);
      m.fill(cx, iy, 2, ih, T.PLAZA);
      m.fill(cx - 2, cy - 2, 6, 6, T.PLAZA);
      addProp(m, 'fountain', (cx + 1) * TILE, (cy + 1) * TILE, 30);
      for (let k = 0; k < 14; k++) {
        const tx = ix + Math.floor(r() * iw), ty = iy + Math.floor(r() * ih);
        if (m.tileAt(tx, ty) === T.GRASS) addProp(m, j === 8 ? 'palm' : 'tree', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12);
      }
      addProp(m, 'bench', (cx - 3) * TILE, (cy + 1) * TILE);
      addProp(m, 'bench', (cx + 5) * TILE, (cy + 1) * TILE);
      break;
    }
    case 'construction': {
      m.fill(ix, iy, iw, ih, T.DIRT);
      addBuilding(m, ix + 2, iy + 2, 7, 7, 'construction', { name: 'Construction Site' });
      for (let k = 0; k < 6; k++) addProp(m, 'cone', (ix + 10 + (k % 3) * 2) * TILE, (iy + 3 + Math.floor(k / 3) * 3) * TILE);
      addProp(m, 'crates', (ix + 12) * TILE, (iy + ih - 3) * TILE);
      m.dropSites.push({ x: (ix + 12) * TILE, y: (iy + ih - 4) * TILE, name: 'the construction site' });
      break;
    }
    case 'industrial': {
      m.fill(ix, iy, iw, ih, T.LOT);
      const b = addBuilding(m, ix + 1, iy, iw - 2, 7, 'warehouse_ind', { name: 'Syndicate Warehouse' });
      for (let k = 0; k < 3; k++) addProp(m, 'crates', (ix + 2 + k * 4) * TILE, (iy + ih - 2) * TILE);
      lotSpots(m, ix, iy + 8, iw, ih - 8);
      m.dropSites.push({ x: (ix + iw / 2) * TILE, y: (iy + 10) * TILE, name: 'the industrial yards' });
      void b;
      break;
    }
    case 'tower': {
      m.fill(ix, iy, iw, ih, T.PLAZA);
      if (r() < 0.5) {
        const b = addBuilding(m, ix + 2, iy + 2, iw - 4, ih - 5, 'tower', { name: 'Office Tower' });
        addDoorPoi(m, b, 'delivery', 'Office Tower lobby', 40);
      } else {
        const b1 = addBuilding(m, ix + 1, iy + 1, 6, ih - 4, 'tower', { name: 'Twin Tower A' });
        const b2 = addBuilding(m, ix + iw - 7, iy + 1, 6, ih - 4, 'tower', { name: 'Twin Tower B' });
        addDoorPoi(m, b1, 'delivery', 'Twin Tower A lobby', 40);
        addDoorPoi(m, b2, 'delivery', 'Twin Tower B lobby', 40);
      }
      for (let k = 0; k < 4; k++) addProp(m, 'planter', (ix + 1 + k * 5) * TILE, (iy + ih - 1) * TILE);
      break;
    }
    case 'commercial': {
      m.fill(ix, iy, iw, ih, T.LOT);
      const names = ['Pizza Planet Express', 'Lucky Laundromat', 'Neon Nails', 'Corner Deli', 'Hot Wok', 'Vinyl Vault', 'Cut & Fade', 'Quick Mart 24/7'];
      const b1 = addBuilding(m, ix, iy, 7, 6, 'shop', { name: names[(i * 3 + j) % names.length] });
      const b2 = addBuilding(m, ix + 9, iy, 7, 6, 'shop', { name: names[(i * 5 + j + 3) % names.length] });
      addDoorPoi(m, b1, 'delivery', b1.name, 40);
      addDoorPoi(m, b2, 'delivery', b2.name, 40);
      lotSpots(m, ix, iy + 7, iw, ih - 7);
      break;
    }
    case 'boardwalk': {
      m.fill(ix, iy, iw, ih, T.PLAZA);
      const b = addBuilding(m, ix + 1, iy + 1, 6, 5, 'kiosk', { name: 'Boardwalk Kiosk' });
      addDoorPoi(m, b, 'delivery', 'Boardwalk Kiosk', 40);
      for (let k = 0; k < 5; k++) addProp(m, 'palm', (ix + 1 + k * 3.5) * TILE, (iy + ih - 1) * TILE, 10);
      addProp(m, 'bench', (ix + 10) * TILE, (iy + 3) * TILE);
      break;
    }
    case 'marina': {
      m.fill(ix, iy, iw, ih, T.LOT);
      const b = addBuilding(m, ix + 1, iy + 1, 8, 5, 'marina', { name: 'Harbor Marina' });
      addDoorPoi(m, b, 'marina', 'Harbor Marina (boats)', 56);
      lotSpots(m, ix, iy + 8, iw, 6);
      break;
    }
    default: { // residential
      m.fill(ix, iy, iw, ih, T.GRASS);
      for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
        const lx = ix + sx * 8, ly = iy + sy * 8;
        const w = 5, h = 4;
        const b = addBuilding(m, lx + 1, ly + 1, w, h, r() < 0.5 ? 'house' : 'house2', { name: 'Residence' });
        m.fill(lx + 6, ly + 1, 2, 6, T.LOT); // driveway
        if (r() < 0.6) addProp(m, 'tree', (lx + 1.5) * TILE, (ly + 6.5) * TILE, 12);
        m.parking.push({ x: (lx + 7) * TILE, y: (ly + 4) * TILE, a: -Math.PI / 2, res: true });
        void b;
      }
      break;
    }
  }
}

function buildIsland(m, rand) {
  const x0 = ISLAND_X0 + 2;
  // fields
  const fieldRects = [[x0 + 2, 62, 18, 30], [x0 + 2, 100, 18, 40], [ISLAND_ROAD_X + 6, 62, 16, 76], [x0 + 2, 160, 40, 40]];
  for (const [fx, fy, fw, fh] of fieldRects) {
    m.fill(fx, fy, fw, fh, T.FIELD);
    m.fields.push({ x: fx * TILE, y: fy * TILE, w: fw * TILE, h: fh * TILE });
  }
  // farm shack
  const b = addBuilding(m, ISLAND_ROAD_X + 6, 22, 8, 6, 'farm', { name: BUSINESS.farm.name, business: 'farm' });
  m.fill(ISLAND_ROAD_X + 4, 28, 12, 6, T.DIRT);
  const poi = addDoorPoi(m, b, 'farm', BUSINESS.farm.name);
  poi.cargoPad = { x: (ISLAND_ROAD_X + 7) * TILE, y: 31 * TILE }; // dirt yard in front of the shack
  m.fill(ISLAND_ROAD_X, 28, 4, ROAD_Y[BRIDGE_ROWS[0]] - 28, T.DIRT);
  // barn + silos as decoration buildings
  addBuilding(m, x0 + 4, 20, 9, 7, 'barn', { name: 'Old Barn' });
  for (let k = 0; k < 40; k++) {
    const tx = ISLAND_X0 + 1 + Math.floor(rand() * 50), ty = 2 + Math.floor(rand() * 220);
    if (m.tileAt(tx, ty) === T.GRASS) addProp(m, 'tree', (tx + 0.5) * TILE, (ty + 0.5) * TILE, 12);
  }
  m.dropSites.push({ x: (ISLAND_ROAD_X + 2) * TILE, y: 200 * TILE, name: 'the Refuge Island boonies' });
  m.fill(ISLAND_ROAD_X, ROAD_Y[BRIDGE_ROWS[1]] + ROAD_W, ROAD_W, 200 - ROAD_Y[BRIDGE_ROWS[1]] - ROAD_W, T.DIRT);
}

function buildDocks(m, rand) {
  // public piers into the ocean from the beach
  const piers = [ROAD_X[3] + 10, ROAD_X[5] + 10, ROAD_X[6] + 8, ROAD_X[6] + 16];
  for (const px of piers) {
    m.fill(px, BEACH_Y0, 3, DEEP_Y0 + 4 - BEACH_Y0, T.DOCK);
    m.fill(px - 3, DEEP_Y0 + 2, 9, 3, T.DOCK);
    addProp(m, 'lamp', (px + 1.5) * TILE, (DEEP_Y0 + 3) * TILE);
    m.marina.push({ x: (px + 5.5) * TILE, y: (OCEAN_Y0 + 3) * TILE, a: Math.PI / 2 });
    m.marina.push({ x: (px - 2.5) * TILE, y: (OCEAN_Y0 + 3) * TILE, a: Math.PI / 2 });
  }
  m.dropSites.push({ x: (piers[0] + 1.5) * TILE, y: (DEEP_Y0 + 3) * TILE, name: 'the end of the public pier' });
  void rand;
}

function buildStreetProps(m) {
  for (let ty = 1; ty < MAP_H - 1; ty++) for (let tx = 1; tx < MAP_W - 1; tx++) {
    if (m.tileAt(tx, ty) !== T.SIDEWALK) continue;
    const nearRoad = m.tileAt(tx + 1, ty) === T.ROAD || m.tileAt(tx - 1, ty) === T.ROAD || m.tileAt(tx, ty + 1) === T.ROAD || m.tileAt(tx, ty - 1) === T.ROAD;
    if (!nearRoad) continue;
    const h = (tx * 7 + ty * 13) % 9;
    if (h === 0 && (tx + ty) % 2 === 0) addProp(m, 'lamp', (tx + 0.5) * TILE, (ty + 0.5) * TILE);
    else if ((tx * 3 + ty * 5) % 41 === 0) addProp(m, 'hydrant', (tx + 0.5) * TILE, (ty + 0.5) * TILE);
  }
}

function buildLaneGraph(m) {
  const key = (i, j) => `${i},${j}`;
  const byKey = new Map();
  const mk = (x, y, extra) => {
    const n = { id: m.nodes.length, x, y, links: {}, light: false, phase: 0, ...extra };
    m.nodes.push(n);
    return n;
  };
  for (let i = 0; i < ROAD_X.length; i++) for (let j = 0; j < ROAD_Y.length; j++) {
    const n = mk((ROAD_X[i] + 2) * TILE, (ROAD_Y[j] + 2) * TILE, { i, j });
    byKey.set(key(i, j), n);
  }
  for (let i = 0; i < ROAD_X.length; i++) for (let j = 0; j < ROAD_Y.length; j++) {
    const n = byKey.get(key(i, j));
    if (i + 1 < ROAD_X.length) { const o = byKey.get(key(i + 1, j)); n.links.E = o.id; o.links.W = n.id; }
    if (j + 1 < ROAD_Y.length) { const o = byKey.get(key(i, j + 1)); n.links.S = o.id; o.links.N = n.id; }
  }
  const islandNodes = BRIDGE_ROWS.map((j) => {
    const n = mk((ISLAND_ROAD_X + 2) * TILE, (ROAD_Y[j] + 2) * TILE, { island: true });
    const w = byKey.get(key(ROAD_X.length - 1, j));
    w.links.E = n.id; n.links.W = w.id;
    return n;
  });
  islandNodes[0].links.S = islandNodes[1].id;
  islandNodes[1].links.N = islandNodes[0].id;
  for (const n of m.nodes) {
    const deg = Object.keys(n.links).length;
    n.light = deg >= 3;
    n.phase = Math.floor(hash2(n.x, n.y, m.seed) * LIGHT_CYCLE);
  }
}

function buildCameras(m) {
  const pick = (i, j) => m.nodes.find((n) => n.i === i && n.j === j);
  const spots = [[7, 2], [7, 6], [3, 3], [5, 3], [4, 5], [2, 4], [5, 7]];
  for (const [i, j] of spots) {
    const n = pick(i, j);
    if (!n) continue;
    m.cameras.push({ id: m.cameras.length, x: n.x + 72, y: n.y - 72, r: 260 });
  }
}
