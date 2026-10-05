// The islands beyond Metro City, laid out after the world map concept (one concept pixel = one
// tile): Westport on the west island (its port and the international airport down the south-west
// coast, the Highland Woods in the hills), Northshore under the Granite Peaks on the north island,
// Cedar Isle in the south (the town of Cedar Falls, the Lake District, Cedar Farms and South Port),
// the desert half of Dry Creek with its airstrip, the little town on Pelican Key and the two
// villages of the Gull Isles. Inter-island highways tie them together over long bridges.
//
// Everything is in tiles unless a name says px. This module only describes roads (as lines for
// the network builder, roads.js) and set pieces; map.js paints, builds and fills them.
import { TILE } from './constants.js';
import { rounded, measure, pointAt, cubic, quad, inPoly } from './geom.js';
import { clipLine, offsetLoop, breakGrid } from './citylayout.js';

export const P = (x, y) => ({ x: x * TILE, y: y * TILE });
const pts = (list) => list.map(([x, y]) => P(x, y));
const loop = (corners, r) => { const l = rounded(pts(corners), r * TILE, true, 10); measure(l); return l; };
const path = (corners, r) => { const l = rounded(pts(corners), r * TILE, false, 10); measure(l); return l; };

// ---------------------------------------------------------------------------------------------
// Island ring highways (clockwise) and how far inside them the ring road runs
export const RINGS = {
  west: { corners: [[140, 262], [330, 258], [430, 262], [448, 300], [448, 470], [400, 560], [330, 640], [200, 642], [150, 600], [122, 470], [122, 300]], r: 24, inset: 9, name: 'Westport Beltway', zone: 'WEST' },
  north: { corners: [[830, 100], [1035, 96], [1055, 130], [1052, 232], [1025, 252], [850, 252], [822, 225], [822, 130]], r: 20, inset: 9, name: 'Northshore Loop', zone: 'NORTH' },
  isle: { corners: [[335, 890], [460, 858], [640, 852], [880, 862], [915, 920], [912, 1040], [870, 1085], [620, 1092], [420, 1082], [318, 1030]], r: 26, inset: 9, name: 'Cedar Isle Loop', zone: 'ISLE' },
};

// Inland lakes (painted as water after the land mask): [x, y, rx, ry, name]
export const LAKES = [
  [262, 440, 21, 25, 'Lakeview Lake'],
  [600, 950, 26, 19, 'Cedar Lake'], [660, 905, 16, 10, 'Mirror Pond'], [590, 1027, 14, 10, 'Reed Pond'], [684, 1000, 12, 16, 'Heron Lake'],
  [1092, 782, 10, 16, 'Mirage Lake'],
  [575, 82, 12, 8, 'Summit Tarn'],
];

// Superblocks kept whole: parks (with a pond, a pitch) and the stadium.
export const PARKS = [
  { x0: 208, y0: 399, x1: 316, y1: 507, label: 'Lakeview Park', lake: true },
  { x0: 320, y0: 399, x1: 400, y1: 451, label: 'Westport Stadium', pitch: true },
  { x0: 900, y0: 148, x1: 956, y1: 200, label: 'Northshore Commons' },
];

// Airports: runway, terminal (building), apron, hangars; the access road is laid in roads().
export const AIRPORTS = [
  { name: 'Westport International', runway: [166, 652, 14, 178], taxi: [184, 652, 5, 178], apron: [190, 660, 96, 104], terminal: [212, 668, 52, 16], hangars: [[202, 774, 18, 14], [224, 774, 18, 14], [246, 774, 18, 14]], planes: [[222, 700], [250, 700], [276, 715]], poiAt: [238, 685] },
  { name: 'Dry Creek Airstrip', runway: [1228, 598, 12, 108], taxi: [1220, 610, 4, 84], apron: [1196, 628, 24, 46], terminal: [1198, 636, 18, 9], hangars: [[1198, 656, 12, 10]], planes: [[1210, 670]], poiAt: [1207, 645] },
];

// Crop fields of the farm districts (besides Dry Creek's): [x, y, w, h]
export const FIELDS = [
  [722, 884, 52, 50], [786, 884, 50, 50], [722, 946, 52, 48], [786, 946, 50, 48], [722, 1006, 52, 44], [786, 1006, 48, 44],
];

// Homes for sale out in the wilds: [type, prefab, x, y, door faces south]
export const ISLAND_ESTATES = [
  ['cottage', 'house1', 196, 150, true], ['cottage', 'house3', 268, 176, true],     // Highland Woods
  ['cottage', 'house2', 690, 98, true],                                              // Granite Peaks lodge
  ['farmhouse', 'house3', 752, 1052, false], ['farmhouse', 'house1', 838, 940, true], // Cedar Farms
  ['cottage', 'house1', 936, 984, true],                                             // Cedar Hills
  ['farmhouse', 'shack', 1206, 834, true],                                           // desert ranch
];

// Farm stands (the harvest contracts besides Dry Creek's co-op): [x, y, name, door faces south]
export const FARM_STANDS = [[724, 943, 'Cedar Farms Market', false]];

// Places the Gull Isles villages sit round: [x, y, radius]
export const VILLAGES = [[118, 1028, 20, 'Gull Harbor'], [1118, 1066, 18, 'Coral Cay']];

// ---------------------------------------------------------------------------------------------
// Road lines for everything outside Metro City. ctx: { m, lines, isLand(x,y), zoneOf(x,y), seaD(x,y),
// lake(x,y), Z, metro: { aveEnd(kind,x|y,...) } }. Pushes lines and returns the ring polylines.
export function islandRoads(ctx) {
  const { lines, isLand, zoneOf, seaD, lake, Z, rand } = ctx;
  const land = (x, y) => isLand(x, y) && !lake(x, y);
  const out = {};

  // ring highways, the ring roads just inside them, and the grids inside those
  for (const [key, R] of Object.entries(RINGS)) {
    const z = Z[R.zone];
    const ring = loop(R.corners, R.r);
    out[key] = ring;
    for (const p of clipLine(ring, (x, y) => true, 10 * TILE, 12)) lines.push({ pts: p, kind: 'hwy', lvl: 0, name: R.name });
    const inner = offsetLoop(ring, R.inset * TILE);
    for (const p of clipLine(inner, (x, y) => land(x, y) && zoneOf(x, y) === z && seaD(x, y) >= 3, 10 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: `${R.name} Road` });
    R.inner = inner;
    R.core = offsetLoop(ring, (R.inset + 4) * TILE); // the grid stays inside this
    R.outer = offsetLoop(ring, -1 * TILE);           // ...except the avenues, which run out to the highway
  }
  const inCore = (R) => (x, y) => inPoly(R.core, x * TILE, y * TILE);
  const inPark = (x, y) => PARKS.some((q) => x > q.x0 + 1 && x < q.x1 - 1 && y > q.y0 + 1 && y < q.y1 - 1);
  const grid = (R, z, xs, ys, kinds, name, extra = () => true) => {
    const ok = (x, y) => land(x, y) && zoneOf(x, y) === z && seaD(x, y) >= 6 && inCore(R)(x, y) && !inPark(x, y) && extra(x, y);
    // avenues carry on out through the ring road to a junction on the highway
    const okAve = (x, y) => (ok(x, y) || (land(x, y) && seaD(x, y) >= 3 && !inCore(R)(x, y) && inPoly(R.outer, x * TILE, y * TILE) && !inPark(x, y)));
    const ys0 = Math.min(...ys) - 40, ys1 = Math.max(...ys) + 40, xs0 = Math.min(...xs) - 40, xs1 = Math.max(...xs) + 40;
    const gl = [];
    for (const x of xs) for (const p of clipLine([P(x, ys0), P(x, ys1)], kinds.x(x) === 'ave' ? okAve : ok, 8 * TILE)) gl.push({ pts: p, kind: kinds.x(x), lvl: 0, name: `${name} ${kindName(kinds.x(x))} ${x}` });
    for (const y of ys) for (const p of clipLine([P(xs0, y), P(xs1, y)], kinds.y(y) === 'ave' ? okAve : ok, 8 * TILE)) gl.push({ pts: p, kind: kinds.y(y), lvl: 0, name: `${name} ${kindName(kinds.y(y))} ${y}` });
    // long blocks and back alleys, like Metro City's (citylayout.js breakGrid)
    lines.push(...breakGrid(gl, xs, ys, () => false, z + 7));
  };
  const pick = (ave, art) => (v) => (ave.includes(v) ? 'ave' : art.includes(v) ? 'art' : 'st');

  // --- Westport --------------------------------------------------------------------------------
  const W = RINGS.west;
  grid(W, Z.WEST, [150, 178, 206, 234, 262, 290, 318, 346, 374, 402, 430], [285, 313, 341, 369, 397, 425, 453, 481, 509, 537, 565, 593, 621],
    { x: pick([206, 318], [262, 374]), y: pick([341, 453, 565], [397, 509]) }, 'Westport');
  // the port: a road down the harbor with cross streets out to the quays
  const harbor = path([[136, 562], [124, 620], [136, 680], [143, 730], [145, 780], [144, 880]], 30); // off the beltway, down the coast
  for (const p of clipLine(harbor, (x, y) => land(x, y) && zoneOf(x, y) === Z.WEST && seaD(x, y) >= 3, 10 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Harbor Road' });
  for (const y of [600, 650, 700, 750, 800, 850]) {
    for (const p of clipLine([P(30, y), P(160, y)], (x, yy) => land(x, yy) && zoneOf(x, yy) === Z.WEST && seaD(x, yy) >= 4 && x < 158, 6 * TILE, 12)) lines.push({ pts: p, kind: 'st', lvl: 0, name: `Pier Street ${y}` });
  }
  // the airport: in off the beltway past the terminal and round to the cargo hangars
  const ap = AIRPORTS[0];
  const apRoad = path([[300, 640], [300, 700], [292, 744], [270, 762], [208, 766]], 10);
  for (const p of clipLine(apRoad, land, 8 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Airport Boulevard' });
  void ap;
  // Highland Woods: the county road up into the hills, dirt tracks off it
  const highland = path([[234, 262], [226, 214], [196, 168], [160, 120], [140, 92]], 22);
  for (const p of clipLine(highland, (x, y) => land(x, y) && seaD(x, y) >= 3, 10 * TILE, 12)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Highland Road' });
  dirt(ctx, [[220, 205], [252, 188], [276, 172], [296, 140]], 'Ridge Track');
  dirt(ctx, [[192, 162], [168, 168], [130, 172]], 'Cabin Track');
  dirt(ctx, [[164, 124], [204, 104], [240, 96]], 'Lookout Track');

  // --- inter-island highways ---------------------------------------------------------------------
  // north: over the strait and along the foot of the Granite Peaks to Northshore
  const northLink = path([[330, 258], [342, 220], [372, 192], [440, 170], [530, 156], [630, 150], [722, 160], [790, 178], [822, 182]], 30);
  lines.push({ pts: northLink, kind: 'hwy', lvl: 0, name: 'Northern Causeway' });
  // east: the Pelican Key bridge (an arterial) into the island's town
  lines.push({ pts: path([[448, 324], [500, 328], [566, 332], [612, 332], [666, 334]], 16), kind: 'art', lvl: 0, name: 'Pelican Way' });
  for (const x of [632, 654, 676]) for (const p of clipLine([P(x, 312), P(x, 400)], (xx, y) => land(xx, y) && zoneOf(xx, y) === Z.KEY && seaD(xx, y) >= 3, 6 * TILE)) lines.push({ pts: p, kind: 'st', lvl: 0, name: `Key Street ${x}` });
  for (const p of clipLine([P(620, 372), P(690, 372)], (x, y) => land(x, y) && zoneOf(x, y) === Z.KEY && seaD(x, y) >= 3, 6 * TILE)) lines.push({ pts: p, kind: 'st', lvl: 0, name: 'Harbor Lane' });
  // south-east: over the bay to Metro City (joins Avenue 556 at Sunset Beach)
  const metroEnd = ctx.metroWestEnd;
  const toMetro = path([[448, 470], [500, 500], [556, 534]], 30);
  if (metroEnd) toMetro.push({ x: metroEnd.x, y: metroEnd.y });
  measure(toMetro);
  lines.push({ pts: toMetro, kind: 'hwy', lvl: 0, name: 'Bay Bridge' });
  // south: down the coast and across the strait to Cedar Isle
  const southLink = path([[330, 640], [356, 712], [404, 790], [460, 858]], 34);
  lines.push({ pts: southLink, kind: 'hwy', lvl: 0, name: 'Strait Bridge' });

  // --- Northshore -------------------------------------------------------------------------------
  const N = RINGS.north;
  // the two bridges from Metro City run straight on up through town as its avenues
  for (const [x, kind, name] of [[958, 'ave', 'North Bridge'], [1018, 'art', 'Harbor Bridge']]) {
    const end = ctx.metroNorthEnd(x);
    if (!end) continue;
    const top = P(x, 118);
    lines.push({ pts: [{ x: end.x, y: end.y }, top], kind, lvl: 0, name });
  }
  grid(N, Z.NORTH, [838, 868, 898, 928, 988], [118, 146, 174, 202, 230], { x: pick([898], [928]), y: pick([174], []) }, 'Northshore');
  // The Bluffs: a loop of big houses east of town, cul-de-sacs off it
  const bluffs = loop([[1070, 106], [1178, 100], [1188, 170], [1150, 194], [1074, 190]], 16);
  for (const p of clipLine(bluffs, (x, y) => land(x, y) && seaD(x, y) >= 4, 10 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Bluffs Loop' });
  lines.push({ pts: [P(1050, 150), P(1072, 150)], kind: 'art', lvl: 0, name: 'Bluffs Loop' });
  courts(ctx, bluffs, (x, y) => land(x, y) && seaD(x, y) >= 6 && inPoly(bluffs, x * TILE, y * TILE), 'Bluffs Court', 22, 9);
  // up into the Granite Peaks
  for (const p of clipLine(path([[700, 158], [690, 120], [700, 90], [730, 62]], 14), (x, y) => land(x, y) && seaD(x, y) >= 3, 10 * TILE, 12)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Peak Road' });
  county(ctx, [[560, 154], [550, 126]], 'Tarn Road');
  dirt(ctx, [[550, 126], [548, 112], [566, 96]], 'Tarn Trail');
  dirt(ctx, [[690, 120], [646, 110], [612, 80]], 'Ridge Trail');
  county(ctx, [[492, 166], [498, 196]], 'Cove Road');
  dirt(ctx, [[498, 196], [506, 220], [520, 240]], 'Cove Trail');

  // --- Cedar Isle --------------------------------------------------------------------------------
  const S = RINGS.isle;
  grid(S, Z.ISLE, [360, 386, 412, 438, 464, 490, 516, 542], [905, 931, 957, 983, 1009, 1035, 1061],
    { x: pick([438], [516]), y: pick([983], [931]) }, 'Cedar Falls', (x) => x < 556);
  // Metro City's avenue 688 crosses the channel from The Yards
  const yEnd = ctx.metroSouthEnd(688);
  if (yEnd) lines.push({ pts: [{ x: yEnd.x, y: yEnd.y }, P(688, 864)], kind: 'ave', lvl: 0, name: 'Cedar Bridge' });
  // the Lake District: winding drives with courts off them
  const lakeOk = (x, y) => land(x, y) && zoneOf(x, y) === Z.ISLE && seaD(x, y) >= 6 && inCore(S)(x, y) && x > 556 && x < 712;
  const drives = [
    cubic({ x: 560, y: 882 }, { x: 600, y: 876 }, { x: 640, y: 940 }, { x: 708, y: 888 }, 24),
    cubic({ x: 560, y: 1062 }, { x: 610, y: 1068 }, { x: 640, y: 984 }, { x: 708, y: 1056 }, 24),
    cubic({ x: 630, y: 880 }, { x: 640, y: 930 }, { x: 625, y: 1000 }, { x: 640, y: 1064 }, 20),
  ].map((c) => c.map((q) => P(q.x, q.y)));
  for (const c of drives) for (const p of clipLine(c, lakeOk, 10 * TILE, 12)) { lines.push({ pts: p, kind: 'drive', lvl: 0, name: 'Lake Drive' }); courts(ctx, p, lakeOk, 'Lake Court', 26, 7); }
  for (const p of clipLine(path([[540, 983], [590, 988], [630, 990]], 12), (x, y) => land(x, y) && zoneOf(x, y) === Z.ISLE, 6 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Falls Road' });
  // Cedar Farms: section roads between the fields
  const farmOk = (x, y) => land(x, y) && zoneOf(x, y) === Z.ISLE && seaD(x, y) >= 4 && inCore(S)(x, y);
  for (const x of [716, 780, 842]) for (const p of clipLine([P(x, 860), P(x, 1080)], farmOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Section Road' });
  for (const y of [940, 1000]) for (const p of clipLine([P(716, y), P(902, y)], farmOk, 10 * TILE)) lines.push({ pts: p, kind: 'rural', lvl: 0, name: 'Section Road' });
  county(ctx, [[842, 960], [870, 980], [900, 1004], [936, 990]], 'Hill Road');
  dirt(ctx, [[936, 990], [950, 960], [940, 930]], 'Hill Track');
  dirt(ctx, [[842, 1040], [866, 1054], [884, 1050]], 'Orchard Track');
  // South Port: down to the quays
  const portOk = (x, y) => land(x, y) && zoneOf(x, y) === Z.ISLE && seaD(x, y) >= 3;
  for (const p of clipLine(path([[452, 1072], [452, 1100], [470, 1124]], 8), portOk, 6 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: 'Port Road' });
  for (const p of clipLine([P(396, 1104), P(520, 1104)], portOk, 6 * TILE, 12)) lines.push({ pts: p, kind: 'st', lvl: 0, name: 'Quay Street' });

  // --- Dry Creek: the desert loop round the mountains, the airstrip ------------------------------
  // (east of the railway the whole way: it meets town at the County Road and at the Eastern Parkway)
  const desert = path([[1160, 523], [1172, 600], [1178, 716], [1150, 800], [1082, 846], [1047, 842]], 30);
  for (const p of clipLine(desert, (x, y) => land(x, y) && seaD(x, y) >= 3, 10 * TILE, 12)) lines.push({ pts: p, kind: 'hwy', lvl: 0, name: 'Desert Highway' });
  lines.push({ pts: path([[1176, 652], [1196, 652]], 0), kind: 'art', lvl: 0, name: 'Airstrip Road' });
  county(ctx, [[1150, 800], [1190, 826], [1214, 846]], 'Ranch Road');
  county(ctx, [[1116, 823], [1104, 800]], 'Mirage Road');
  dirt(ctx, [[1104, 800], [1094, 770]], 'Mirage Track');
  county(ctx, [[1178, 716], [1220, 740]], 'Mesa Road');
  dirt(ctx, [[1220, 740], [1250, 780]], 'Mesa Track');
  dirt(ctx, [[1200, 520], [1230, 470], [1240, 400]], 'Canyon Track');

  // --- the Gull Isles villages: a round green with lanes out to the shore -------------------------
  for (const [cx, cy, r, name] of VILLAGES) {
    const circ = [];
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; circ.push(P(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
    measure(circ);
    const ok = (x, y) => land(x, y) && seaD(x, y) >= 3;
    for (const p of clipLine(circ, ok, 10 * TILE, 12)) lines.push({ pts: p, kind: 'art', lvl: 0, name: `${name} Circle` });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const sp = [P(cx + Math.cos(a) * r, cy + Math.sin(a) * r), P(cx + Math.cos(a) * (r + 34), cy + Math.sin(a) * (r + 34))];
      for (const p of clipLine(sp, (x, y) => ok(x, y) && seaD(x, y) >= 4, 6 * TILE, 8).slice(0, 1)) lines.push({ pts: p, kind: 'st', lvl: 0, name: `${name} Lane`, culdesac: true });
    }
  }
  void rand;
  return out;
}

const kindName = (k) => ({ ave: 'Avenue', art: 'Road', st: 'Street' }[k] || 'Street');

// A county road (paved, two lanes) through these tile points.
function county(ctx, corners, name) {
  const { lines, isLand, lake, seaD } = ctx;
  for (const p of clipLine(path(corners, 10), (x, y) => isLand(x, y) && !lake(x, y) && seaD(x, y) >= 2, 4 * TILE, 12)) lines.push({ pts: p, kind: 'rural', lvl: 0, name });
}

// A dirt track through these tile points (clipped to dry land).
function dirt(ctx, corners, name) {
  const { lines, isLand, lake, seaD } = ctx;
  const p0 = path(corners, 8);
  for (const p of clipLine(p0, (x, y) => isLand(x, y) && !lake(x, y) && seaD(x, y) >= 2, 6 * TILE, 12)) lines.push({ pts: p, kind: 'dirt', lvl: 0, name });
}

// Cul-de-sacs off a road every `every` tiles, alternating sides, `len` tiles long.
function courts(ctx, road, ok, name, every, len) {
  const { lines, rand } = ctx;
  const L = road[road.length - 1].s ?? measure(road);
  let side = 1;
  for (let s = 10 * TILE; s < L - 8 * TILE; s += every * TILE) {
    const q = pointAt(road, s);
    const nx = -q.ty * side, ny = q.tx * side;
    side = -side;
    const l = (len + rand() * 4) * TILE;
    const bend = (rand() - 0.5) * 0.5;
    const c2 = { x: q.x + nx * l * 0.6 + q.tx * l * bend, y: q.y + ny * l * 0.6 + q.ty * l * bend };
    const sac = quad({ x: q.x, y: q.y }, c2, { x: q.x + nx * l, y: q.y + ny * l }, 10);
    const piece = clipLine(sac, ok, 6 * TILE, 12)[0];
    if (piece && Math.hypot(piece[0].x - q.x, piece[0].y - q.y) < 2 * TILE) lines.push({ pts: piece, kind: 'minor', lvl: 0, name, culdesac: true });
  }
}

// District seeds outside Metro City: [district id, x, y]
export const ISLAND_SEEDS = [
  [23, 236, 316], [23, 300, 330], [23, 330, 370], [24, 262, 486], [24, 220, 470], [24, 300, 470],
  [25, 370, 420], [25, 410, 380], [25, 420, 460], [26, 70, 520], [26, 80, 620], [26, 96, 720], [26, 104, 830],
  [27, 230, 700], [27, 236, 780], [27, 180, 730], [28, 360, 540], [28, 300, 590], [28, 410, 590], [28, 340, 620],
  [29, 200, 150], [29, 150, 100], [29, 280, 200], [29, 100, 230], [30, 160, 330], [30, 166, 420], [30, 190, 540],
  [31, 870, 200], [31, 950, 210], [31, 1010, 200], [32, 880, 130], [32, 960, 125], [32, 1020, 140],
  [33, 560, 120], [33, 650, 190], [33, 720, 80], [33, 500, 220], [33, 620, 60], [34, 1120, 140], [34, 1170, 120], [34, 1180, 200],
  [35, 400, 940], [35, 380, 1030], [35, 480, 1050], [35, 520, 920], [36, 450, 980], [36, 500, 1000],
  [37, 610, 960], [37, 660, 1030], [37, 640, 890], [38, 760, 950], [38, 790, 1030], [38, 760, 880], [39, 440, 1100], [39, 500, 1110],
  [40, 900, 950], [40, 890, 1060], [40, 960, 1010], [40, 340, 1080],
  [41, 1180, 360], [41, 1230, 450], [41, 1240, 800], [41, 1150, 880], [41, 1080, 760], [41, 1170, 720], [42, 1214, 650],
  [9, 1100, 520], [9, 1100, 600], [9, 1170, 560], [9, 1080, 420],
  [43, 118, 1028], [43, 90, 980], [43, 160, 1060], [44, 1118, 1066], [44, 1080, 1040], [44, 1160, 1100],
  [14, 600, 350], [14, 660, 350],
];

// Whole concept scene paintings laid over open wild ground (walkable, no collision of their own):
// key (in assets/scenes.webp), name, district to find room in, size in tiles, preferred spot, and
// the painted buildings you can't walk through (fractions of the painting: x0, y0, x1, y1).
export const SCENE_SPOTS = [
  { key: 'golf', name: 'Cedar Hills Golf Club', dist: 40, w: 54, h: 36, near: [620, 1110], solid: [[0.03, 0.14, 0.19, 0.37], [0.09, 0.27, 0.25, 0.39]] },
  // the ground follows the painting's own mask (shared/interior-art.js SCENE_MASKS): cliffs and the homestead are solid
  { key: 'canyon', name: 'Red Rock Canyon', dist: 41, masked: true, near: [1190, 800] },
];
// Whole islands raised out of open sea in the shape of a painting (beach, palms, a cabin, a jetty):
// key, name, the spot to put it nearest to (it goes in the closest stretch of clear water).
export const SCENE_ISLANDS = [
  { key: 'cay', name: 'Paradise Cay', near: [540, 690] },
];
