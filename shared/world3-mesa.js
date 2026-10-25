// World v3 (docs/WORLD-V3.md 8.15): Lucky Mesa, the casino city in the Red Rock Desert (part 1.3's three districts, 1.5
// R6; concepts VG1, VG2, prompts VG3 and VG4) - built by today's generator on new ground at the skeleton's town point,
// where Mesa Road and Route 9 meet the Desert Highway. For the whole-world build only (shared/world3-world.js calls
// these, one call each; the page and the city worker never import this module):
// - paintMesa3(L, W, H): its districts (shared/mapcore.js DISTRICTS 60-62: The Strip, Old Downtown, Mesa Flats - the side
//   streets and suburbs) and the built zone painted on the land layer (the desert's sand under them made plain desert,
//   so the build lays lots, not a beach), off the highway's room, the main line's and its station's, as the towns are.
// - layMesa3(lines, m): Mesa Road pulled straight through the city as the Strip, a palm-median boulevard (`blvd`, the
//   section shared/world3-strip.js STRIP_ROAD gives it: two lanes each way either side of a planted median) from Old
//   Downtown to the hub; the side streets (`st`) behind the resorts and round Old Downtown and the flats, and Station
//   Road from Route 9 down to the main line's Lucky Mesa station.
// - mesaLots(m): before the blocks, Old Downtown's covered street of lights (a pedestrian street under its canopy) and
//   its old casinos' lots kept as paving, so the generator's blocks fill only what's left.
// - buildMesa(m, addProp): the old casinos along the covered street, its canopy of lights. (The Strip's resorts are
//   handcrafted since 2026-10-20 - shared/world3-strip.js, from the owner's LuckyMesa-B2: the district's own plan.)
//   Their looks are the buildings' `art` (art v2 statics.js reads it, as the hero corner's) and their roofs' `resort`
//   (the classic renderer's). Each casino is a named place (`delivery`, fixed, `casino`: the gambling to come, GM3/GM4).
// - MESA_SPECIALS / MESA_STYLES: the planned places (pawn shops, a gun shop, clubs, the bank, motels, wedding chapels,
//   the syndicate's counting room (`gang`), the hospital, the police, a diner, the store that becomes the gas station)
//   and the districts' building styles, handed in with the towns' as opts.specials and opts.styles.
// - mesaDone(m): the gas station's pumps, a bus stop on the Strip if the build left it none, the summary
//   (m.world3.mesa).
import { TILE, T } from './constants.js';
import { skeletonLines, STATIONS } from './world3-skeleton.js';
import { measure } from './geom.js';
import { stamp, pull } from './world3-towns.js';
import { STRIP_ROAD, RESORTS } from './world3-strip.js';

const SAND = 5, DESERT = 3;   // (world3-land.js TERRAIN3: sand under the city becomes plain desert)
const Z_TOWN = 8;             // (the mainland's built zone, as the towns': map.js BUILT_ZONES, buildBusStops)
export const MESA_IDS = { strip: 60, old: 61, flats: 62 };

// The city (tiles; World v3b, docs/WORLD-V3.md part 9: the owner's top-right corner, the Casino Highway arriving from
// the south-west, the main line along its south side, its airstrip just east). The Strip is Mesa Road pulled straight
// on row 612 (`main`, as a town's main street: pulledAt) and laid as a boulevard from Gold Street to the hub; the
// resorts face it from both sides (the Strip's plan's: world3-strip.js RESORTS), Old Downtown at its west end, the
// flats behind (north) and south-west of it, down to the main line's room.
export const MESA = {
  key: 'mesa', name: 'Lucky Mesa', at: [5600, 640], box: [5236, 448, 5640, 752],
  main: { line: 'Mesa Road', y: 612, a: 5250, b: 5558, ramp: 40 }, pulls: [],
  // the districts' ground (tile boxes, painted in this order: a later one over an earlier)
  ground: [
    [62, [[5240, 452, 5574, 554], [5240, 690, 5336, 748], [5336, 676, 5480, 748]]],
    [60, [[5330, 552, 5552, 676]]],
    [61, [[5240, 540, 5330, 690]]],
  ],
  streets: [
    ['Palm Row', [[5256, 548], [5542, 548]]],                              // behind the north resorts
    ['Chapel Street', [[5330, 500], [5542, 500]]],                         // the motels and the wedding chapels
    ['Gold Street', [[5256, 690], [5256, 548], [5256, 508]]],              // Old Downtown's west street, across the Strip, on up into the flats
    ['Silver Street', [[5330, 690], [5330, 500]]],                         // the Strip's west end, up to Chapel Street
    ['Lucky Street', [[5542, 612], [5542, 500]]],                          // the Strip's east end, up to Chapel Street
    ['Cactus Street', [[5454, 612], [5454, 690]]],                         // between the south resorts
    ['Mesa Flats Drive', [[5256, 690], [5454, 690]]],                      // the flats' street
    ['Trailer Lane', [[5300, 690], [5300, 728], [5410, 728], [5410, 690]]],   // the trailer park's loop
    ['Chapel Lane', [[5444, 500], [5444, 466]]],                           // the lane out into the desert (a turnaround)
    // (the owner, 2026-10-23: the flats north of Palm Row west of Mesa Flats Road were one block 90 tiles deep - the
    // block filler stacked plain roofs 80 tiles deep behind the fronts on Palm Row, a bare lane between their columns:
    // "really long empty alleyways", "the way some buildings overlap each other") - a street across them, Gold Street
    // up to it: a row of houses facing it, their gardens behind
    ['Sage Street', [[5256, 508], [5317, 508]]],                           // across the flats west of Mesa Flats Road
    ['Station Road', [[5612, 620], [5612, 884], [5532, 940]]],             // Route 9 down to the main line's station (v3b: 190 tiles south of the town, past the line's bend - STATIONS 'Lucky Mesa')
  ],
  // the resorts (a lot [x0, y0, x1, y1), the side it fronts the Strip on, its look): the Strip's plan's (world3-strip.js)
  resorts: RESORTS,
  // Old Downtown's covered street of lights: a pedestrian street (plaza) under its canopy, the old casinos either side
  // fronting it (x from, x to; north side's fronts south, south side's north)
  // (v3b: the skeleton's Mesa Flats Road comes down to the Strip at x 5317 - the street and its old casinos end short of it)
  canopy: [5263, 572, 5309, 579],
  oldCasinos: [
    ['The Gilded Spur', 5264, 5278, 'N'], ['The Dusty Ace', 5279, 5293, 'N'], ['The Prospector', 5294, 5309, 'N'],
    ['Wagon Wheel Casino', 5264, 5278, 'S'], ['Silver Mule Casino', 5279, 5293, 'S'], ['Rattlesnake Ruby', 5294, 5309, 'S'],
  ],
};

// the planned places (map.js SPECIALS' form; fixed: the generator's later passes leave their business as the sign says)
export const MESA_SPECIALS = [
  { d: 61, prefab: 'strip', biz: ['pawn', 'pawn', 'delivery', 'delivery'], names: ['Second Roll Pawn', 'Blue Chip Pawn & Loan', 'Golden Ring Jewelers', 'Desert Cash Exchange'], fixed: true },
  { d: 61, prefab: 'theatre', biz: ['club', 'gang'], names: ['The Copper Room Supper Club', 'The Counting Room'], fixed: true },   // (the syndicate's back rooms, VG2)
  { d: 61, prefab: 'bank', biz: ['bank'], names: ['Mesa Savings & Trust'], fixed: true },
  { d: 61, prefab: 'clubeclipse', biz: ['club'], names: ['Club Neon Cactus'], fixed: true },
  { d: 61, prefab: 'hotel', biz: ['delivery'], names: ['Horseshoe Motor Inn'], fixed: true },
  { d: 62, prefab: 'strip', biz: ['gunshop', 'pawn', 'delivery', 'delivery'], names: ['Mesa Sportsman Arms', 'Third Roll Pawn', 'Lucky Mesa Bridal', 'Quick Cash Loans'], fixed: true },
  { d: 62, prefab: 'church', biz: ['delivery'], names: ['Desert Rose Wedding Chapel'], fixed: true },
  { d: 62, prefab: 'church', biz: ['delivery'], names: ['Chapel of the Lucky Heart'], fixed: true },
  { d: 62, prefab: 'hotel', biz: ['delivery'], names: ['Blue Mesa Motel'], fixed: true },
  { d: 62, prefab: 'hotel', biz: ['delivery'], names: ['Cactus Flower Motel'], fixed: true },
  { d: 62, prefab: 'hospital', biz: ['hospital'], names: ['Lucky Mesa General'], fixed: true },
  { d: 62, prefab: 'police', biz: ['police'], names: ['Lucky Mesa Police'], fixed: true },
  { d: 62, prefab: 'conv', biz: ['convenience'], names: ['Lucky Mesa Fuel'], gas: true, fixed: true },
  { d: 62, prefab: 'diner', biz: ['delivery'], names: ['Jackpot Diner'], fixed: true },
  { d: 62, prefab: 'clubnova', biz: ['club'], names: ['Club Mojave Nights'], fixed: true },
];

// the districts' building styles (map.js STYLE's form, by district: opts.styles): what's left of the Strip's ground
// is clubs, show rooms and boutiques; Old Downtown low shops, motels, arcades, bars and tattoo parlours with car parks;
// the flats tract homes, trailers (the shacks) and motels with car parks
export const MESA_STYLES = {
  60: { minW: 10, minH: 10, gen: { clubnova: 1, clubeclipse: 1, theatre: 0.6, rest2: 0.8, royale: 0.5, diamond: 0.5, crown: 0.5, arcade: 0.6, hotel: 0.6 }, filler: 'plaza', roof: 0.3, roofKinds: ['gravel', 'tar'] },
  61: { minW: 10, minH: 10, gen: { shops1: 0.6, shops2: 0.6, hotel: 1, club: 0.8, arcade: 0.8, tattoo: 0.6, liquor: 0.8, diner: 0.6, rest1: 0.8, quickstop: 0.6, conv: 0.5 }, filler: 'parking', roof: 0.4, roofKinds: ['tar', 'gravel'] },
  62: { minW: 12, minH: 12, gen: { house1: 2, house2: 2, house3: 1.5, house5: 1, house9: 1, shanty1: 0.8, shanty2: 0.8, hotel: 0.6, conv: 0.4, liquor: 0.4, diner: 0.3, quickstop: 0.5 }, filler: 'parking', roof: 0.12, roofKinds: ['tile', 'tar'] },
};

const ROOM = { hwy: 24, main: 18, station: 30 };

// The districts' ground on the land layer (in MESA.ground's order), where the land is and the room isn't; the desert's
// sand there made plain desert (the generator keeps the mainland's sand as beach).
export function paintMesa3(L, W, H) {
  const SK = skeletonLines(), [x0, y0, x1, y1] = MESA.box, BW = x1 - x0;
  const room = new Uint8Array(BW * (y1 - y0));
  for (const l of SK) if (l.kind === 'hwy') stamp(room, MESA.box, l.path, ROOM.hwy); else if (l.kind === 'main') stamp(room, MESA.box, l.path, ROOM.main);
  for (const s of STATIONS) if (s.line === 'main') stamp(room, MESA.box, { pts: [s.at, s.at] }, ROOM.station);
  const out = {};
  for (const [d, boxes] of MESA.ground) for (const [gx0, gy0, gx1, gy1] of boxes) for (let y = Math.max(y0, gy0); y < Math.min(y1, gy1); y++) for (let x = Math.max(x0, gx0); x < Math.min(x1, gx1); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = y * W + x;
    if (!L.land[i] || room[(y - y0) * BW + x - x0]) continue;
    if (L.dist[i] !== d) { const o = L.dist[i]; if (o >= 60 && o <= 62) out[o]--; out[d] = (out[d] || 0) + 1; }
    L.dist[i] = d; L.zone[i] = Z_TOWN;
    if (L.terrain[i] === SAND) L.terrain[i] = DESERT;
  }
  return out;
}

// The streets: Mesa Road pulled straight through the city and its straight run laid as the Strip (a boulevard), the
// side streets and Station Road (px lines; the generator joins their ends onto the streets they stop on).
export function layMesa3(lines, m) {
  const out = { strip: 0, streets: 0, len: 0 };
  const k = lines.findIndex((l) => l.name === MESA.main.line && l.kind === 'art');
  if (k >= 0) {
    const l = lines[k];
    pull(l, 'y', MESA.main.y, MESA.main.a, MESA.main.b, MESA.main.ramp, MESA.box);
    l.townMain = MESA.key;
    // (the straight run: its two ends, on the row, a and b apart)
    const V = (MESA.main.y + 0.5) * TILE, P = l.pts;
    const on = P.map((p, j) => (Math.abs(p.y - V) < 1 && p.x >= (MESA.main.a - 1) * TILE && p.x <= (MESA.main.b + 1) * TILE ? j : -1)).filter((j) => j >= 0);
    if (on.length >= 2) {
      const ja = on[0], jb = on[on.length - 1];
      const part = (a, b) => { const q = P.slice(a, b + 1).map((p) => ({ ...p })); measure(q); return q; };
      const parts = [];
      if (ja > 0) parts.push({ ...l, pts: part(0, ja) });
      parts.push({ ...l, pts: part(ja, jb), kind: 'blvd', strip: true, w: STRIP_ROAD.w, median: STRIP_ROAD.median });
      if (jb < P.length - 1) parts.push({ ...l, pts: part(jb, P.length - 1) });
      lines.splice(k, 1, ...parts);
      out.strip = Math.round(Math.abs(P[jb].x - P[ja].x) / TILE);
    }
  }
  for (const [name, P] of MESA.streets) {
    lines.push({ pts: P.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })), kind: 'st', lvl: 0, name, town: MESA.key });
    out.streets++;
    for (let j = 1; j < P.length; j++) out.len += Math.abs(P[j][0] - P[j - 1][0]) + Math.abs(P[j][1] - P[j - 1][1]);
  }
  return out;
}

const mine = (m, i) => m.dist[i] >= 60 && m.dist[i] <= 62;
// Before the blocks: the covered street and its old casinos' lots kept as paving (reserve 4: the promenade's, so nothing
// is dressed on them and no block takes them). (The resorts' lots are the Strip's plan's: world3-strip.js.)
export function mesaLots(m) {
  const W = m.w;
  let n = 0;
  const keep = (x0, y0, x1, y1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (!mine(m, i) || m.tiles[i] !== T.GRASS) continue; m.tiles[i] = T.PLAZA; m.reserve[i] |= 4; n++; } };
  const [cx0, cy0, cx1, cy1] = MESA.canopy;
  keep(cx0, cy0, cx1, cy1);
  for (const [, a, b, side] of MESA.oldCasinos) keep(a, side === 'N' ? cy0 - 17 : cy1, b, side === 'N' ? cy0 : cy1 + 15);
  return n;
}

// a building of the city's own (a roof record for the classic renderer, its look in `art` for art v2): solid tiles
function addBld(m, x, y, w, h, kind, name, roofKind, look, art) {
  const W = m.w, bid = m.buildings.length;
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { const i = ty * W + tx; if (m.tiles[i] !== T.PLAZA || !mine(m, i) || m.bld[i] >= 0) return null; }   // (only on the city's kept paving)
  m.roofs.push({ tx: x, ty: y, tw: w, th: h, kind: roofKind, seed: (Math.imul(x, 7919) ^ Math.imul(y, 104729)) >>> 0, d: m.dist[(y + (h >> 1)) * W + x + (w >> 1)], b: bid, resort: look });
  const b = { id: bid, prefab: -1, roof: m.roofs.length - 1, tx: x, ty: y, tw: w, th: h, kind, name, business: null, signs: [], art };
  m.buildings.push(b);
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) { m.set(tx, ty, T.BUILDING); m.bld[ty * W + tx] = bid; }
  return b;
}
// neon along a building's top edges at night (art v2 lights: [dx, dy, z, r, colour, strength, kind] from its south-west)
const neon = (w, d, z, col, n = 3) => { const L = []; for (let k = 0; k <= n; k++) { L.push([w * TILE * k / n, -2, z, 150, col, 1.3, 'neon'], [w * TILE * k / n, -d * TILE + 2, z, 150, col, 1.3, 'neon']); } return L; };
const C = { gold: [1, 0.8, 0.35], pink: [1, 0.3, 0.75], cyan: [0.3, 0.9, 1], white: [0.95, 0.95, 1], violet: [0.65, 0.4, 1], red: [1, 0.3, 0.3] };

// The old casinos, built on their kept lots (from the dress hook: props now have their pass).
export function buildMesa(m, addProp) {
  const out = { old: [] };
  const poi = (b, name, x, y) => { const p = { id: m.pois.length, kind: 'delivery', label: name, x, y, r: 48, b: b.id, fixed: true, casino: true }; m.pois.push(p); return p; };
  // Old Downtown's covered street: lamps down its middle under the canopy, the old casinos either side fronting it
  const [cx0, cy0, cx1, cy1] = MESA.canopy;
  for (let x = cx0 + 3; x < cx1 - 2; x += 6) addProp(m, 'lamp', (x + 0.5) * TILE, (cy0 + cy1) / 2 * TILE, 5);
  // the canopy of lights: strings of bulbs across the street every two tiles, high over the crowd, and two along it
  for (let x = cx0 + 1; x < cx1; x += 2) { addProp(m, 'festoon', (x + 0.5) * TILE, cy0 * TILE + 4, 0, { tx: 0, ty: (cy1 - cy0) * TILE - 8, h: 110 }); out.lights = (out.lights || 0) + 1; }
  for (const y of [cy0 + 0.2, cy1 - 0.2]) addProp(m, 'festoon', (cx0 + 0.5) * TILE, y * TILE, 0, { tx: (cx1 - cx0 - 1) * TILE, ty: 0, h: 112 });
  const warm = ['#d8b890', '#c89878', '#e0c8a0', '#b88868', '#d0a080', '#c8b098'];
  MESA.oldCasinos.forEach(([name, a, b, side], k) => {
    const N = side === 'N', y = N ? cy0 - 16 : cy1, w = b - a, d = 15;
    const bl = addBld(m, a, y, w, d, 'hotel', name, 'tar', 'old', { spec: { floors: 2 + (k % 2), style: 'stucco', wallColor: warm[k % warm.length], parapet: 18, roofMat: 'membrane', lip: 8 }, noShop: true, lights: N ? neon(w, d, 90, [C.gold, C.red, C.pink][k % 3], 4) : neon(w, d, 90, [C.gold, C.red, C.pink][k % 3], 4) });
    if (!bl) return;
    const dx = a + (w >> 1);
    bl.door = { tx: dx, ty: N ? y + d : y - 1 };
    poi(bl, name, (dx + 0.5) * TILE, N ? (y + d + 0.7) * TILE : (y - 0.7) * TILE);
    out.old.push(name);
  });
  out.canopy = MESA.canopy;
  return out;
}

// After the build: the planned store becomes the gas station (its pumps in front, as the towns'), a bus stop on the
// Strip if the build left it none, and what the city has (m.world3.mesa).
export function mesaDone(m) {
  const at = (p) => m.dist[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
  const inMesa = (p) => { const d = at(p); return d >= 60 && d <= 62; };
  m.pumps ||= [];
  const g = m.pois.find((p) => p && p.label === 'Lucky Mesa Fuel');
  if (g && (g.kind === 'convenience' || g.kind === 'delivery')) {
    g.kind = 'gasstation';
    const b = m.buildings[g.b];
    if (b) {
      const south = !b.door || b.door.ty >= b.ty + b.th, cx = (b.tx + b.tw / 2) * TILE;
      const open = (x, y) => { const tl = m.tileAtPx(x, y); return tl === T.SIDEWALK || tl === T.PLAZA || tl === T.LOT || tl === T.GRASS || tl === T.DIRT; };
      for (const o of [0.7 * TILE + 52, 1.6 * TILE, TILE]) {
        const fy = south ? (b.ty + b.th) * TILE + o : b.ty * TILE - o;
        if (![-48, 48].every((dx) => open(cx + dx, fy))) continue;
        for (const dx of [-48, 48]) { m.pumps.push({ x: cx + dx, y: fy }); m.addSolidProp(cx + dx, fy, 9); }
        break;
      }
      for (const s of b.signs || []) if (s.text === g.label) s.text = "Gas 'n Go";
    }
  }
  // a bus stop on the Strip's sidewalk if none (the plan puts its own): on 5 tiles of sidewalk with nothing solid within 70 px
  const [bx0, by0, bx1, by1] = MESA.box;
  const busAt = (p) => p && p.t === 'busstop' && p.x >= bx0 * TILE && p.x < bx1 * TILE && p.y >= by0 * TILE && p.y < by1 * TILE;
  if (!m.props.some(busAt)) {
    const ya = (MESA.main.y + 0.5) * TILE;
    const solid = m.props.filter((p) => p && Math.abs(p.y - ya) < 12 * TILE && p.x >= bx0 * TILE && p.x < bx1 * TILE);
    const walk = (tx, ty) => [-2, -1, 0, 1, 2].every((dx) => m.tileAt(tx + dx, ty) === T.SIDEWALK);
    let done = false;
    for (let x = (MESA.main.a + 20) * TILE; x < (MESA.main.b - 10) * TILE && !done; x += TILE) for (const side of [-1, 1]) {
      const y = ya + side * ((STRIP_ROAD.w / 2 + 1) * TILE), tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
      if (done || !walk(tx, ty) || solid.some((p) => Math.hypot(p.x - x, p.y - y) < 70)) continue;
      m.props.push({ t: 'busstop', x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, face: side < 0 ? 'S' : 'N' });
      const sp = m.addSolidProp((tx + 0.5) * TILE, (ty + 0.5) * TILE, 14); sp.pi = m.props.length - 1; sp.brk = true; m.propSolid.set(sp.pi, sp);
      done = true;
    }
  }
  const pois = m.pois.filter((p) => p && inMesa(p)), kinds = {};
  for (const p of pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
  const blds = {};
  for (const b of m.buildings) if (b) { const d = m.dist[(b.ty + (b.th >> 1)) * m.w + b.tx + (b.tw >> 1)]; if (d >= 60 && d <= 62) blds[d] = (blds[d] || 0) + 1; }
  return { buildings: blds, pois: pois.length, kinds, casinos: pois.filter((p) => p.casino).length, bus: m.props.filter(busAt).length };
}
