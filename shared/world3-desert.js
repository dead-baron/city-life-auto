// World v3 (docs/WORLD-V3.md 8.18): the Red Rock Desert's places besides Lucky Mesa (part 1.5 R6; concepts WR2-B, NA1-C,
// MI1, MI6, SC3-F, N4, NR1-B) - Copper Gulch, the mining town, and Copper Gulch Mine; Dusty Hollow, the ghost town; Red
// Rock Dam on its reservoir with the dry wash below; the lookout tower on a mesa, the natural arch and the hoodoos; the
// motel with its pool and billboards on the Desert Highway; the desert camp; the freight yard by the main line. At the
// skeleton's TOWNS / LANDMARKS points (shared/world3-skeleton.js), on Mine Road, Hollow Road, Canyon Road and Route 9
// (the skeleton's arterials) and jeep tracks off them. For the whole-world build only (shared/world3-world.js calls
// these, one call each; the page and the city worker never import this module):
// - paintDesert3(L, W, H): Copper Gulch's district (shared/mapcore.js DISTRICTS 63, built by the generator in its own
//   style - company houses, shacks, a few shops) and Dusty Hollow's (64, a desert district: the generator builds
//   nothing there, buildDesert does) on the land layer, off the highways' and the main line's room, as the towns are.
// - layDesert3(lines, m): Mine Road pulled straight through Copper Gulch as its main street, the loops of side streets
//   off it and Depot Road up to the main line's Copper Gulch station.
// - DESERT_SPECIALS / DESERT_STYLES: the town's planned places (the assay office, the saloon, the general store, the
//   sheriff, the diner, the clinic) and its building style, handed in with the towns' as opts.specials and opts.styles.
// - buildDesert(m, addProp) (from the dress hook, before the biomes' dressing - what it builds is kept from it, reserve
//   4): the mine (the open pit - a quarry as today's, terraced, with its haul road, crusher and spoil - and the canyon
//   adit in its cliff with rails, an ore cart and the seams you chip at, as the Old Granite Mine's), the freight yard's
//   ore cars, the town's water tower; Dusty Hollow's empty wooden buildings with their fallen porches, the hideout
//   (`gang`) and the smuggler's drop, loot crates in the ruins; the dam and the wash; the lookout on its mesa, the arch
//   and the hoodoos; the motel, its pool and the billboards; the desert camp; the jeep tracks to them.
// - desertDone(m): the summary (m.world3.desert).
import { TILE, T } from './constants.js';
import { skeletonLines, STATIONS, nearestOnPath } from './world3-skeleton.js';
import { stamp, pull } from './world3-towns.js';

const SAND = 5, DRY = 3;   // (world3-land.js TERRAIN3: sand under the town becomes plain desert)
const Z_TOWN = 8;             // (the mainland's built zone, as the towns')
export const DESERT_IDS = { gulch: 63, hollow: 64 };

// Copper Gulch (tiles): Mine Road pulled straight on row 1205 as its main street, the company houses' loops north and
// south of it, Depot Road up to the main line's station; the mine at Mine Road's east end.
export const GULCH = {
  key: 'gulch', name: 'Copper Gulch', d: 63, at: [4560, 1230], box: [4470, 1150, 4652, 1262],
  main: { line: 'Mine Road', y: 1205, a: 4478, b: 4644, ramp: 40 },
  streets: [
    ['Assay Street', [[4498, 1205], [4498, 1180], [4626, 1180], [4626, 1205]]],
    ['Company Row', [[4498, 1205], [4498, 1232], [4626, 1232], [4626, 1205]]],
    ['Depot Road', [[4562, 1232], [4562, 1128]]],   // (across the main street and Assay Street, up to the station)
    ['Tailings Lane', [[4530, 1232], [4530, 1254]]],
  ],
  ground: [[4478, 1160, 4646, 1250], [4520, 1250, 4540, 1262]],
};
// Dusty Hollow (tiles): its one dirt street off Hollow Road's end, the empty buildings either side of it
export const HOLLOW = { key: 'hollow', name: 'Dusty Hollow', d: 64, at: [4250, 1000], box: [4196, 976, 4302, 1030], street: 1004 };
// the set pieces (tiles)
export const DESERT = {
  pit: [4684, 1084, 4796, 1160],                 // Copper Gulch Mine's open pit (MI6)
  adit: [4752, 1190],                            // the canyon adit's mouth (MI1): its cliff north of it
  dam: [4086, 4214],                             // Red Rock Dam: across the reservoir's south shore, these columns
  lookout: [4330, 880], arch: [4372, 846],       // the lookout on its mesa, the natural arch and the hoodoos by it
  motel: [3846, 1160, 3880, 1188],               // the motel's lot, north of Mine Road by the Desert Highway
  camp: [4800, 1700],                            // the desert camp (the skeleton's Mesa camp), off Route 9
  freight: [4570, 1056, 4640, 1120],             // the freight yard's box, by the main line north of the town
};
// the pictures' views (tools/world3-world-map.mjs --towns: docs/world-v3-town-<key>.png)
export const DESERT_VIEWS = [
  { key: 'gulch', name: 'Copper Gulch and Copper Gulch Mine', box: [4470, 1050, 4810, 1262] },
  { key: 'hollow', name: 'Dusty Hollow, the lookout and the arch', box: HOLLOW.box.map((v, k) => (k === 1 ? 830 : k === 2 ? 4400 : v)) },
  { key: 'dam', name: 'Red Rock Dam, the reservoir and the dry wash', box: [4040, 540, 4250, 700] },
  { key: 'motel', name: 'The Sundowner Motel and the billboards on the Desert Highway', box: [3760, 1100, 3900, 1260] },
  { key: 'camp', name: 'Mesa Camp', box: [4770, 1640, 4830, 1720] },
];

export const DESERT_SPECIALS = [
  { d: 63, prefab: 'liquor', biz: ['assay'], names: ['Copper Gulch Assay Office'], fixed: true },
  { d: 63, prefab: 'diner', biz: ['club'], names: ['The Copper Spur Saloon'], fixed: true },
  { d: 63, prefab: 'conv', biz: ['convenience'], names: ['Copper Gulch General Store'], fixed: true },
  { d: 63, prefab: 'police', biz: ['police'], names: ['Copper Gulch Sheriff'], fixed: true },
  { d: 63, prefab: 'diner', biz: ['delivery'], names: ['Ore Cart Diner'], fixed: true },
  { d: 63, prefab: 'liquor', biz: ['hospital'], names: ['Copper Gulch Clinic'], fixed: true },
];
// the company town's style: small houses and shacks (the company houses), workshops, few plain roofs
export const DESERT_STYLES = {
  63: { minW: 12, minH: 12, gen: { house3: 2.5, house7: 2, house1: 1, shanty1: 1.5, shanty2: 1.5, repair: 0.9, quickstop: 0.5, liquor: 0.5, diner: 0.4 }, filler: 'parking', roof: 0.12, roofKinds: ['metal', 'tar'] },
};

const ROOM = { hwy: 24, main: 18, station: 30 };

// The districts on the land layer: Copper Gulch's ground and built zone, Dusty Hollow's district (its zone stays the
// desert's), where the land is and the room isn't; sand under them plain desert.
export function paintDesert3(L, W, H) {
  const SK = skeletonLines(), out = {};
  const paint = (box, boxes, d, zone) => {
    const [x0, y0, x1, y1] = box, BW = x1 - x0, room = new Uint8Array(BW * (y1 - y0));
    for (const l of SK) if (l.kind === 'hwy') stamp(room, box, l.path, ROOM.hwy); else if (l.kind === 'main') stamp(room, box, l.path, ROOM.main);
    for (const s of STATIONS) if (s.line === 'main') stamp(room, box, { pts: [s.at, s.at] }, ROOM.station);
    let n = 0;
    for (const [gx0, gy0, gx1, gy1] of boxes) for (let y = Math.max(y0, gy0); y < Math.min(y1, gy1); y++) for (let x = Math.max(x0, gx0); x < Math.min(x1, gx1); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!L.land[i] || room[(y - y0) * BW + x - x0] || L.dist[i] === d) continue;
      L.dist[i] = d; if (zone) L.zone[i] = zone; n++;
      if (L.terrain[i] === SAND) L.terrain[i] = DRY;
    }
    out[d] = n;
  };
  paint(GULCH.box, GULCH.ground, GULCH.d, Z_TOWN);
  paint(HOLLOW.box, [HOLLOW.box], HOLLOW.d, 0);
  return out;
}

// Copper Gulch's streets: Mine Road pulled straight through it (its main street), the side streets and Depot Road.
export function layDesert3(lines, m) {
  const out = { main: 0, streets: 0, len: 0 };
  const l = lines.find((q) => q.name === GULCH.main.line && q.kind === 'art');
  if (l) { pull(l, 'y', GULCH.main.y, GULCH.main.a, GULCH.main.b, GULCH.main.ramp, GULCH.box); l.townMain = GULCH.key; out.main = 1; }
  for (const [name, P] of GULCH.streets) {
    lines.push({ pts: P.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })), kind: 'st', lvl: 0, name, town: GULCH.key });
    out.streets++;
    for (let j = 1; j < P.length; j++) out.len += Math.abs(P[j][0] - P[j - 1][0]) + Math.abs(P[j][1] - P[j - 1][1]);
  }
  return out;
}

// ---- the set pieces -------------------------------------------------------------------------------------------------
const GROUND = new Set([T.GRASS, T.DIRT, T.SAND]);
// a building of the desert's own (a roof record for the classic renderer, its look in `art` for art v2): only on open
// ground (or the yard's dirt), nothing built there yet
function addBld(m, x, y, w, h, kind, name, roofKind, art) {
  const W = m.w, bid = m.buildings.length;
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { const i = ty * W + tx; if (tx < 0 || ty < 0 || tx >= W || ty >= m.h || !m.land[i] || !GROUND.has(m.tiles[i]) || m.bld[i] >= 0) return null; }
  m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d: m.dist[(y + (h >> 1)) * W + x + (w >> 1)], b: bid });
  const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: [], art: { noShop: true, ...art } };
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * W + tx] = bid; m.reserve[ty * W + tx] |= 4; }
  return b;
}

export function buildDesert(m, addProp) {
  const W = m.w, HH = m.h, SK = skeletonLines();
  const hwys = SK.filter((l) => l.kind === 'hwy'), rails = SK.filter((l) => l.kind === 'main');
  const out = { pit: null, adit: null, seams: 0, hollow: [], dam: 0, wash: 0, tracks: 0, motel: null, billboards: 0, camp: 0, freight: 0, props: 0 };
  const inF = (x, y) => x >= 0 && y >= 0 && x < W && y < HH;
  const open = (x, y) => inF(x, y) && m.land[y * W + x] && GROUND.has(m.tiles[y * W + x]) && m.bld[y * W + x] < 0;
  const keep = (x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y < Math.min(HH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) m.reserve[y * W + x] |= 4; };
  const clearOf = (x, y, hw = 24, mn = 16) => hwys.every((h) => nearestOnPath(h.path, x, y).d >= hw) && rails.every((r) => nearestOnPath(r.path, x, y).d >= mn);
  const prop = (t, tx, ty, r, extra) => { if (!open(Math.floor(tx), Math.floor(ty))) return false; addProp(m, t, tx * TILE, ty * TILE, r, extra); out.props++; return true; };
  const fill = (x0, y0, x1, y1, t) => { for (let y = Math.max(0, y0); y < Math.min(HH, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) if (open(x, y)) { m.tiles[y * W + x] = t; m.reserve[y * W + x] |= 4; } };
  // a jeep track: gravel along a polyline (tiles), hw tiles each side, over open ground only (a road it meets stays road)
  const tracked = new Set();
  const track = (name, pts, hw = 1.6) => {
    let n = 0;
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], L = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
      for (let k = 0; k <= L; k++) {
        const cx = ax + (bx - ax) * k / L, cy = ay + (by - ay) * k / L;
        for (let dy = -Math.ceil(hw); dy <= Math.ceil(hw); dy++) for (let dx = -Math.ceil(hw); dx <= Math.ceil(hw); dx++) {
          if (dx * dx + dy * dy > hw * hw) continue;
          const x = Math.floor(cx + dx), y = Math.floor(cy + dy);
          if (!open(x, y)) continue;
          const i = y * W + x;
          if (!tracked.has(i)) { tracked.add(i); n++; }
          m.tiles[i] = T.SAND; m.reserve[i] |= 4 | 128;   // (gravel: the renderer's shingle, as the washes' bars - dirt doesn't show on the desert's ground)
        }
      }
    }
    out.tracks += n; (out.trackBy ||= {})[name] = n;
    return n;
  };
  const landmark = (name, type, x0, y0, x1, y1) => (m.landmarks ||= []).push({ name, type, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });

  // 1. Copper Gulch Mine: the open pit (a quarry as today's - shared/countryside.js quarry: the ground bake paints it,
  // art v2 draws its benches and the crane, the miners work its face), its haul road down from Mine Road's end, the
  // crusher by its rim with the spoil heaps and an ore cart; the adit in its cliff east of the road's end, as the Old
  // Granite Mine's (shared/naturesites.js oldMine: the cliff band solid, the timbered portal, rails, a cart, lanterns,
  // the seams you chip at - server/systems/places.js)
  {
    const [x0, y0, x1, y1] = DESERT.pit;
    fill(x0 - 3, y0 - 3, x1 + 3, y1 + 3, T.DIRT);
    keep(x0 - 3, y0 - 3, x1 + 3, y1 + 3);
    const pit = { x: (x0 + 2) * TILE, y: (y0 + 2) * TILE, w: (x1 - x0 - 4) * TILE, h: (y1 - y0 - 6) * TILE, name: 'Copper Gulch Mine' };
    (m.quarries ||= []).push(pit);
    out.pit = { x0, y0, x1, y1 };
    track('haul', [[4690, 1182], [4696, 1166], [4706, 1160], [4740, 1158]], 2.2);   // (the haul road: Mine Road's end up onto the rim)
    const cr = addBld(m, x0 - 14, y0 + 40, 9, 7, 'industrial', 'Copper Gulch Crusher', 'metal', { spec: { floors: 2, style: 'siding', wallColor: '#8a6a4a', pitch: 'gable', roof: 'metal', roofColor: '#6a5a4a', slope: 0.5 } });
    if (cr) {
      out.crusher = cr.id;
      // the conveyor from the pit's rim to the crusher: a run of ore carts on rails, spoil heaps at the crusher's foot
      prop('rails', x0 - 3.5, y0 + 44, 0, { len: 6 * TILE });
      prop('minecart', x0 - 3.5, y0 + 42.4, 12);
      for (const [dx, dy] of [[-16, 50], [-12, 51.5], [-8, 50.5]]) prop('gravel', x0 + dx, y0 + dy, 0);
    }
    for (let k = 0; k < 3; k++) prop('crates', x1 + 4, y0 + 10 + k * 3, 12);
    landmark('Copper Gulch Mine', 'mine', x0 - 16, y0 - 4, x1 + 4, y1 + 44);
    // the adit: the cliff band solid over its footprint, the portal on its south face, rails out of it to the track
    const [tx, ty] = DESERT.adit;
    let ok = true;
    for (let y = ty - 5; y <= ty + 6 && ok; y++) for (let x = tx - 9; x <= tx + 9; x++) if (!open(x, y)) { ok = false; break; }
    if (ok) {
      for (let y = ty - 5; y <= ty; y++) for (let x = tx - 7; x <= tx + 7; x++) { const i = y * W + x; m.tiles[i] = T.WALL; m.reserve[i] |= 4; }
      keep(tx - 10, ty - 7, tx + 11, ty + 9);
      const X = (tx + 0.5) * TILE, face = (ty + 1) * TILE;
      addProp(m, 'cliff', X, face, 0, { w: 15 * TILE, d: 6 * TILE, h: 120, s: 41 });
      addProp(m, 'mineportal', X, face + 10, 0);
      for (let y = ty + 1; y <= ty + 6; y++) for (let x = tx - 5; x <= tx + 5; x++) { const i = y * W + x; if (GROUND.has(m.tiles[i])) m.tiles[i] = T.DIRT; }
      addProp(m, 'rails', X, face + 4 * TILE, 0, { len: 7 * TILE });
      addProp(m, 'minecart', X, face + 3.2 * TILE, 12);
      for (const sx of [-1, 1]) addProp(m, 'lantern', X + sx * 58, face + 22, 4);
      for (const [dx, dy, t, r] of [[-110, 40, 'crates', 12], [-88, 76, 'barrel', 8], [104, 50, 'chest', 10], [124, 90, 'pickaxe', 0], [86, 96, 'lumber', 10]]) addProp(m, t, X + dx, face + dy, r);
      const seams = [{ x: Math.round(X), y: Math.round(face + 22) }];
      for (const [dx, dy, size] of [[-150, 14, 26], [150, 18, 30], [74, 12, 18]]) { addProp(m, 'crystal', X + dx, face + dy, 0, { size }); seams.push({ x: Math.round(X + dx), y: Math.round(face + dy + 16) }); }
      for (const [dx, dy] of [[-200, 150], [190, 140]]) addProp(m, 'gravel', X + dx, face + dy, 0);
      (m.natureSites ||= []).push({ kind: 'mine', name: 'Copper Gulch Mine', x: Math.round(X), y: Math.round(face), seams });
      out.adit = { x: Math.round(X), y: Math.round(face) }; out.seams = seams.length;
      track('adit', [[4690, 1184], [4716, 1197], [tx, ty + 7]], 1.8);
    }
  }

  // 2. The freight yard by the main line: dirt between 12 and 30 tiles of the line on the town's side, ore cars in a
  // row 15 tiles off it, the loading hopper and the spoil; a named place (ore deliveries)
  {
    const [x0, y0, x1, y1] = DESERT.freight, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const line = rails.slice().sort((a, b) => nearestOnPath(a.path, mx, my).d - nearestOnPath(b.path, mx, my).d)[0];
    if (line) {
      // (the town's side of the line: the side its middle is on, by the line's run through the box)
      const P = line.path.pts.filter(([x, y]) => x >= x0 - 20 && x <= x1 + 20 && y >= y0 - 20 && y <= y1 + 20);
      const [ax0, ay0] = P[0] || [x0, y1], [bx0, by0] = P[P.length - 1] || [x1, y0];
      const sideOf = (x, y) => Math.sign((bx0 - ax0) * (y - ay0) - (by0 - ay0) * (x - ax0));
      const town = sideOf(GULCH.at[0], GULCH.at[1]);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const d = nearestOnPath(line.path, x + 0.5, y + 0.5).d;
        if (d < 12 || d > 30 || !open(x, y) || sideOf(x + 0.5, y + 0.5) !== town) continue;
        m.tiles[y * W + x] = T.SAND; m.reserve[y * W + x] |= 4 | 128; out.freight++;   // (a gravel pad)
      }
      // the ore cars: in a row along the line, 15 tiles off it on the town's side
      let cars = 0, mid = null;
      const L = Math.hypot(bx0 - ax0, by0 - ay0) || 1, ux = (bx0 - ax0) / L, uy = (by0 - ay0) / L;
      const nx = -uy * town, ny = ux * town;
      for (let k = 0; k * 3.2 < L && cars < 10; k++) {
        const cx = ax0 + ux * (8 + k * 3.2) + nx * 15, cy = ay0 + uy * (8 + k * 3.2) + ny * 15;
        if (cx < x0 || cx > x1 || cy < y0 || cy > y1) continue;
        const dd = nearestOnPath(line.path, cx, cy).d;
        if (dd < 12 || dd > 20) continue;
        const t = m.tiles[Math.floor(cy) * W + Math.floor(cx)];
        if (!GROUND.has(t)) continue;
        addProp(m, 'minecart', cx * TILE, cy * TILE, 12); out.props++; cars++; if (cars === 3) mid = [cx, cy];
      }
      out.oreCars = cars;
      if (mid) {
        const yard = (t, dx, dy, r, ex) => { const x = mid[0] + nx * dx + ux * dy, y = mid[1] + ny * dx + uy * dy, tl = m.tiles[Math.floor(y) * W + Math.floor(x)]; if (GROUND.has(tl)) { addProp(m, t, x * TILE, y * TILE, r, ex); out.props++; } };
        yard('silo', 6, 2, 20, { h: 70 }); yard('gravel', 8, 6, 0); yard('gravel', 9, 9, 0); yard('crates', 6, -4, 12);
        m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Copper Gulch Freight Yard', x: (mid[0] + 2) * TILE, y: (mid[1] + 4) * TILE, r: 48, fixed: true, ore: true });
      }
    }
    // the town's water tower, on a free spot by the main street's east end
    for (let k = 0; k < 40 && !out.waterTower; k++) {
      const x = 4636 - (k % 10) * 3, y = 1192 - Math.floor(k / 10) * 3;
      let free = true;
      for (let dy = -2; dy <= 2 && free; dy++) for (let dx = -2; dx <= 2; dx++) { const i = (y + dy) * W + x + dx; const t = m.tiles[i]; if (m.bld[i] >= 0 || !(t === T.GRASS || t === T.DIRT || t === T.LOT || t === T.PLAZA)) { free = false; break; } }
      if (!free) continue;
      addProp(m, 'watertower', (x + 0.5) * TILE, (y + 0.5) * TILE, 16, { h: 96 }); out.waterTower = [x, y];
    }
  }

  // 3. Dusty Hollow: one dirt street off Hollow Road's end, the empty wooden buildings either side of it (weathered
  // siding, no lights, no doors open), their porches fallen in front of them (planks, debris), loot crates and barrels
  // in the ruins; the boarding house the hideout (`gang`), the livery the smuggler's drop
  {
    const S = HOLLOW.street;
    track('hollow', [[4200, 1040], [4204, 1022], [4206, S], [4298, S]], 2.2);
    const names = ['Hollow Saloon', 'Livery Stable', 'Dry Goods', 'Hollow Bank', 'Grand Hotel', 'Jailhouse', 'Chapel', 'Smithy', 'Boarding House', 'Telegraph Office', 'Barber', 'Undertaker'];
    const walls = ['#8a7058', '#7a6450', '#9a8068', '#6e5a48', '#8c7a62', '#76604c'];
    let k = 0;
    for (const N of [true, false]) for (let x = 4210; x + 11 <= 4296; x += 15) {
      const name = names[k % names.length], y = N ? S - 13 : S + 4, h = 9;
      const b = addBld(m, x, y, 11, h, 'shack', `${name} (abandoned)`, 'tar', { spec: { floors: k % 3 === 1 ? 2 : 1, style: 'siding', wallColor: walls[k % walls.length], pitch: 'gable', roof: 'shingle', roofColor: ['#5a4a3a', '#6a5440', '#4e4034', '#7a6650'][k % 4], slope: 0.45 + (k % 3) * 0.08 }, ghost: true });
      k++;
      if (!b) continue;
      out.hollow.push(b.name);
      // the porch fallen in front of it, debris along its front
      const fy = N ? y + h + 0.9 : y - 0.9;
      prop('planks', x + 3, fy, 0); prop('debris', x + 7.5, fy, 0); if (k % 3 === 0) prop('rubble', x + 9.5, fy + (N ? 0.8 : -0.8), 0);
      if (k % 2) prop(k % 4 === 1 ? 'crates' : 'barrel', x + 1.2, fy + (N ? 1.6 : -1.6), 10);
      const door = { x: (x + 5.5) * TILE, y: (N ? y + h + 0.7 : y - 0.7) * TILE };
      if (name === 'Boarding House') m.pois.push({ id: m.pois.length, kind: 'gang', label: 'Dusty Hollow Hideout', x: door.x, y: door.y, r: 48, b: b.id, fixed: true });
      if (name === 'Livery Stable') m.pois.push({ id: m.pois.length, kind: 'smuggler', label: "Hollow Smuggler's Drop", x: door.x, y: door.y, r: 46, b: b.id, fixed: true });
    }
    // loot in the ruins: chests behind the buildings (searched later: the ghost town's loot, 8.18's next step)
    for (const [x, y] of [[4216, S - 16], [4262, S + 16], [4290, S - 16]]) prop('chest', x, y, 10);
    keep(HOLLOW.box[0], HOLLOW.box[1], HOLLOW.box[2], HOLLOW.box[3]);
    landmark('Dusty Hollow', 'ghost', HOLLOW.box[0], HOLLOW.box[1], HOLLOW.box[2], HOLLOW.box[3]);
  }

  // 4. Red Rock Dam: a concrete wall along the reservoir's south shore (the dam's crest a row of low blocks, solid), the
  // dry wash below it (gravel, shingle) down toward the highway's room; Canyon Road comes up to its foot
  {
    const [xa, xb] = DESERT.dam;
    const shore = [];
    for (let x = xa; x <= xb; x++) {
      let yl = -1;
      for (let y = 560; y < 660; y++) { const i = y * W + x; if (inF(x, y) && (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && m.river[i]) yl = y; }
      if (yl >= 0) shore.push([x, yl]);
    }
    if (shore.length > 20) {
      // the wall: 4 tiles deep under the shore's lowest water, in straight 24-tile pieces (art v2 draws a building whole)
      const yd = Math.max(...shore.map((s) => s[1])) + 1, x0 = shore[0][0], x1 = shore[shore.length - 1][0] + 1;
      for (let y = yd - 6; y < yd; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.land[i] && GROUND.has(m.tiles[i])) { m.tiles[i] = T.WATER; m.river[i] = 1; } }   // (the reservoir up to the wall)
      for (let x = x0; x < x1; x += 24) {
        const w = Math.min(24, x1 - x);
        const b = addBld(m, x, yd, w, 4, 'industrial', 'Red Rock Dam', 'gravel', { spec: { floors: 3, style: 'stone', wallColor: '#b8b0a2', parapet: 10, roofMat: 'membrane', lip: 6 }, lights: [[w * TILE * 0.25, -2, 200, 120, [1, 0.9, 0.7], 1, 'lamp'], [w * TILE * 0.75, -2, 200, 120, [1, 0.9, 0.7], 1, 'lamp']] });
        if (b) out.dam += w;
      }
      keep(x0 - 2, yd - 2, x1 + 2, yd + 8);
      landmark('Red Rock Dam', 'dam', x0, yd - 40, x1, yd + 60);
      // the dry wash: from the dam's foot south, gravel bars (the renderer's shingle) and dirt, down to the highway's room
      const cx = (x0 + x1) >> 1;
      for (let y = yd + 4; y < yd + 90; y++) {
        const x = Math.round(cx + 18 + 8 * Math.sin((y - yd) / 11) + (y - yd) * 0.2);
        if (!clearOf(x, y, 26, 16)) break;
        for (let dx = -4; dx <= 4; dx++) {
          const tx = x + dx;
          if (!open(tx, y)) continue;
          const i = y * W + tx;
          if (Math.abs(dx) <= 2) { m.tiles[i] = T.SAND; m.reserve[i] |= 128 | 4; } else { m.tiles[i] = T.DIRT; m.reserve[i] |= 4; }
          out.wash++;
        }
      }
      out.damAt = [x0, yd, x1];
    }
  }

  // 5. The lookout on its mesa (a sandstone mesa, the fire lookout on its shoulder, a jeep track up to it from Dusty
  // Hollow), the natural arch and the hoodoos by it
  {
    const [lx, ly] = DESERT.lookout, [ax, ay] = DESERT.arch;
    track('lookout', [[4298, HOLLOW.street], [4312, 960], [4322, 920], [lx, ly + 8]], 1.6);
    keep(lx - 20, ly - 20, lx + 20, ly + 14);
    addProp(m, 'outcrop', (lx - 9) * TILE, (ly - 4) * TILE, 60, { w: 320, d: 200, h: 150, s: 51, style: 'sandstone' });
    if (prop('lookout', lx + 6, ly + 2, 0)) { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) m.addSolidProp((lx + 6 + dx) * TILE, (ly + 1 + dy) * TILE, 10); out.lookout = [lx + 6, ly + 2]; }
    keep(ax - 14, ay - 10, ax + 24, ay + 16);
    addProp(m, 'seaarch', ax * TILE, ay * TILE, 0, { w: 200, d: 64, h: 130, a: 0 });
    out.arch = [ax, ay];
    for (const [dx, dy, h] of [[16, 6, 120], [19, 9, 96], [14, 11, 84], [21, 3, 70], [-8, 10, 100]]) if (prop('outcrop', ax + dx, ay + dy, 14, { w: 34, d: 30, h, s: 60 + dx, style: 'sandstone' })) out.hoodoos = (out.hoodoos || 0) + 1;
    landmark('Lookout Mesa', 'lookout', lx - 24, ly - 24, lx + 24, ly + 16);
    landmark('Red Rock Arch', 'arch', ax - 14, ay - 10, ax + 24, ay + 16);
  }

  // 6. The motel on Mine Road by the Desert Highway: the rooms round a car park, the office, the pool with loungers, its
  // sign; the billboards along the highway either side of the exit
  {
    const [x0, y0, x1, y1] = DESERT.motel;
    if (clearOf(x0, y1) && clearOf(x1, y0)) {
      fill(x0, y0, x1, y1, T.DIRT);   // (ground the buildings go on; what's left of it the car park)
      const spec = (w, d) => ({ spec: { floors: 1, style: 'stucco', wallColor: '#e8c8a0', parapet: 12, roofMat: 'membrane', lip: 6 }, lights: [[w * TILE / 2, -2, 70, 110, [1, 0.45, 0.4], 1.3, 'neon']] });
      const rooms = addBld(m, x0 + 1, y0 + 1, 22, 7, 'hotel', 'Sundowner Motel', 'tar', spec(22, 7));
      const wing = addBld(m, x1 - 8, y0 + 8, 7, 12, 'hotel', 'Sundowner Motel Rooms', 'tar', spec(7, 12));
      const office = addBld(m, x0 + 1, y0 + 12, 7, 5, 'office', 'Sundowner Motel Office', 'tar', spec(7, 5));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.tiles[i] === T.DIRT && m.bld[i] < 0) { m.tiles[i] = T.LOT; m.reserve[i] |= 4; } }
      // the pool behind the office, loungers along it
      for (let y = y0 + 12; y < y0 + 17; y++) for (let x = x0 + 10; x < x0 + 19; x++) { const i = y * W + x; if (m.tiles[i] === T.LOT) m.tiles[i] = T.WATER; }
      for (let k = 0; k < 3; k++) addProp(m, 'lounger', (x0 + 11.5 + k * 3) * TILE, (y0 + 17.8) * TILE, 0, { a: Math.PI / 2, v: k });
      addProp(m, 'umbrella_r', (x0 + 20.2) * TILE, (y0 + 17.8) * TILE, 0);
      if (office) { m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Sundowner Motel', x: (x0 + 4.5) * TILE, y: (y0 + 17.7) * TILE, r: 44, b: office.id, fixed: true }); office.door = { tx: x0 + 4, ty: y0 + 17 }; }
      out.motel = { rooms: !!rooms, wing: !!wing, office: !!office };
      for (let k = 0; k < 4; k++) m.parking.push({ x: (x0 + 12 + k * 3) * TILE, y: (y0 + 9.5) * TILE, a: Math.PI / 2 });
      landmark('Sundowner Motel', 'motel', x0, y0, x1, y1);
    }
    // the billboards: 16 tiles off the Desert Highway's line, on open ground, about every 40 tiles of it near the exit
    const hw = hwys.find((h) => h.name === 'Desert Highway');
    if (hw) {
      const P = hw.path.pts;
      let last = null;
      for (let j = 1; j < P.length && out.billboards < 4; j++) {
        const [ax2, ay2] = P[j - 1], [bx, by] = P[j];
        if (ay2 < 880 || ay2 > 1500) continue;
        if (last && Math.hypot(ax2 - last[0], ay2 - last[1]) < 30) continue;
        const l = Math.hypot(bx - ax2, by - ay2) || 1, nx = -(by - ay2) / l, ny = (bx - ax2) / l;
        for (const s of [1, -1]) {
          const x = ax2 + nx * s * 16, y = ay2 + ny * s * 16;
          if (!open(Math.floor(x), Math.floor(y)) || !open(Math.floor(x) + 2, Math.floor(y)) || !open(Math.floor(x) - 2, Math.floor(y))) continue;
          addProp(m, 'billboard', x * TILE, y * TILE, 10, { ad: (j + out.billboards) % 6 }); out.billboards++; last = [ax2, ay2];
          break;
        }
      }
    }
  }

  // 7. The desert camp off Route 9: tents round a fire, string lights, a cooler and a picnic table, the pickups parked;
  // a jeep track down from the road
  {
    const [cx, cy] = DESERT.camp;
    track('camp', [[cx, 1646], [cx, cy - 6]], 1.6);
    keep(cx - 14, cy - 10, cx + 14, cy + 12);
    const items = [['campfire', 0, 0, 10], ['domeTent', -6, -3, 12], ['domeTent', 6, -3, 12], ['tent', -7, 4, 12], ['picnic', 5, 4, 8], ['cooler', 2.5, 3, 4], ['burnbarrel', -3, 6, 6]];
    for (const [t, dx, dy, r] of items) if (prop(t, cx + dx, cy + dy, r, t === 'tent' ? { v: 3 } : undefined)) out.camp++;
    if (open(cx - 8, cy - 7)) { addProp(m, 'festoon', (cx - 8) * TILE, (cy - 7) * TILE, 0, { tx: 16 * TILE, ty: 0, h: 90 }); out.camp++; }
    for (let k = 0; k < 2; k++) m.parking.push({ x: (cx - 10 + k * 20) * TILE, y: (cy + 9) * TILE, a: -Math.PI / 2 });
    landmark('Mesa Camp', 'camp', cx - 14, cy - 10, cx + 14, cy + 12);
  }
  return out;
}

// After the build: the assay office takes ore at its counter (as the quarry's), what the desert has (m.world3.desert).
export function desertDone(m) {
  const at = (p) => m.dist[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
  for (const p of m.pois) if (p && p.kind === 'assay' && at(p) === GULCH.d) p.counter = true;
  const pois = m.pois.filter((p) => p && at(p) === GULCH.d), kinds = {};
  for (const p of pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  const blds = { 63: 0, 64: 0 };
  for (const b of m.buildings) if (b) { const d = m.dist[(b.ty + (b.th >> 1)) * m.w + b.tx + (b.tw >> 1)]; if (d === 63 || d === 64) blds[d]++; }
  return { buildings: blds, pois: pois.length, kinds, mines: (m.natureSites || []).filter((q) => q.kind === 'mine').map((q) => q.name), quarries: (m.quarries || []).length };
}
