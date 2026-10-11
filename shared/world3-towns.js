// World v3, stage 3, step 5 (docs/WORLD-V3.md 8.13): the first mainland towns - Timber Bend (the logging town by the
// Highland Highway, in the redwoods), Willow Crossing (the farm town on the Long Reach) and Sandpiper Bay (the beach
// town on the east arm), built by today's generator on new ground. For the whole-world build only (shared/world3-world.js
// calls these, one call each; the page and the city worker never import this module):
// - paintTowns3(L, W, H): each town's district (shared/mapcore.js DISTRICTS 57-59) and a built zone painted on the land
//   layer in its ground (8.13.1: wide along the main street, narrow along the lanes out), before the build reads it -
//   on land (not the beach's sand), off the highways' room (24 tiles of their line), the main line (18) and its
//   stations (30). The biomes read the land layer's districts, so their ground and dressing make way (8.8:
//   world3-biomes.js dress3 dresses 48-56, the generator's redwoodGroves Highland Woods' 47).
// - layTowns3(lines, m) (8.13.1): the arterial through each town pulled straight east-west as its main street (and the
//   others through it onto its axes), the loops of side streets off it and a lane out into the country; the main
//   street an arterial, so the town gets bus stops. pulledAt: where a town takes an arterial off its skeleton course.
// - townsFront(m) (8.13.1): the beach town's boardwalk along the top of its sand and its pier out over the sea.
// - TOWN_SPECIALS: the planned businesses (the generator's SPECIALS form, handed in as opts.specials, so only the v3
//   build places them): the clinic, the sheriff, a convenience store that becomes the gas station, the diner and each
//   town's own places (part 1.5's table).
// - TOWN_STYLES (8.13.1): the towns' own building styles (and Northshore's beach towns' sparser one), handed in as
//   opts.styles by district: the generator's blocks and buildings by them in place of the district's style.
// - townsDone(m): each town's planned store (a convenience store, so buildCornerStores' five gas stations stay in the
//   city) turned into its gas station with pumps, a bus stop on the main street if buildBusStops left it none, and
//   the summary in m.world3.towns.
import { TILE, T } from './constants.js';
import { skeletonLines, STATIONS } from './world3-skeleton.js';
import { measure } from './geom.js';
import { MESA } from './world3-mesa.js';   // (Lucky Mesa's Strip is Mesa Road pulled straight: pulledAt)

const SAND = 5;   // (world3-land.js TERRAIN3.SAND: the beach stays a beach)

const Z_TOWN = 8;   // (a built zone: map.js BUILT_ZONES, and buildBusStops' list - Northshore's, the mainland's built zone)
export const TOWNS3 = [
  // A town (8.13, laid out again in 8.13.1): its main street is the arterial through it, pulled straight east-west
  // (`main`: the line, its row, the span and the ramp each side back onto its own course); loops of side streets off
  // it (`streets`: tile polylines whose ends meet the main street or another street - T junctions, no dead end) and a
  // lane out into the country ending in a turnaround; its ground (`ground`: tile boxes, the union) wide along the main
  // street and narrow along the lanes, so the houses thin out into the countryside. (`pulls`: the other arterials
  // through it straightened onto its axes - [line, axis, at, from, to, ramp] - so nothing cuts its blocks on the slant)
  { key: 'timber', name: 'Timber Bend', d: 57, at: [1170, 1060], box: [1036, 1008, 1150, 1126],
    // west of Redwood Creek (the highway's room east of it): Timber Road is its main street, on over the creek to the hub
    main: { line: 'Timber Road', y: 1071, a: 1036, b: 1150, ramp: 40 }, pulls: [],
    streets: [['Mill Street', [[1060, 1071], [1060, 1040], [1124, 1040], [1124, 1071]]], ['Sawyer Street', [[1066, 1071], [1066, 1101], [1118, 1101], [1118, 1071]]],
      ['Cedar Street', [[1092, 1040], [1092, 1101]]], ['Logger Lane', [[1092, 1040], [1092, 1016]]]],
    ground: [[1036, 1026, 1150, 1113], [1078, 1008, 1106, 1026]] },
  { key: 'willow', name: 'Willow Crossing', d: 58, at: [3360, 1290], box: [3348, 1212, 3486, 1352],
    // the Long Reach's east bank round the hub: Valley Road in from the west, the Mine Road out east (its main street),
    // Willow Road across it north-south
    main: { line: 'Mine Road', y: 1270, a: 3390, b: 3486, ramp: 44 },
    pulls: [['Valley Road', 'y', 1270, 3330, 3390, 0], ['Willow Road', 'x', 3390, 1226, 1352, 40], ['Valley Road North', 'x', 3390, 1226, 1270, 40]],
    streets: [['Grange Street', [[3412, 1270], [3412, 1240], [3468, 1240], [3468, 1270]]], ['Church Street', [[3412, 1270], [3412, 1300], [3468, 1300], [3468, 1270]]],
      ['River Street', [[3362, 1270], [3362, 1300], [3390, 1300]]], ['Orchard Lane', [[3440, 1300], [3440, 1326]]]],
    ground: [[3348, 1226, 3486, 1314], [3372, 1314, 3408, 1350], [3426, 1314, 3456, 1338]] },
  { key: 'sandpiper', name: 'Sandpiper Bay', d: 59, at: [4480, 2540], box: [4410, 2500, 4600, 2660],
    // on the bay's beach: Sandpiper Drive is its main street, the sand and the sea south-east of it; the boardwalk
    // along the top of the sand in front of the town (columns x0-x1, `walk` tiles deep) and the pier out from it
    main: { line: 'Sandpiper Drive', y: 2574, a: 4420, b: 4566, ramp: 50 }, pulls: [],
    front: { x0: 4440, x1: 4600, walk: 3, pier: { x: 4526, w: 3, out: 34 } },
    streets: [['Shell Street', [[4444, 2574], [4444, 2544], [4536, 2544], [4536, 2574]]], ['Dune Street', [[4490, 2544], [4490, 2518]]],
      ['Pier Street', [[4470, 2574], [4470, 2604], [4552, 2604], [4552, 2574]]], ['Gull Lane', [[4444, 2574], [4444, 2604], [4470, 2604]]]],
    ground: [[4420, 2528, 4600, 2650], [4474, 2504, 4506, 2528]] },
];
export const TOWN_IDS = new Set(TOWNS3.map((t) => t.d));
const ROOM = { hwy: 24, main: 18, station: 30 };

// the planned businesses (map.js SPECIALS' form; biz 'delivery' is a named place; fixed: the generator's later passes
// don't make one a gun shop, a tackle shop or a bank)
// (8.13.2, H40: `look` - the town's own model the place moves into, townModels below; the clinics take a small lot - a
// one-storey clapboard clinic, not the city hospital's block; the co-op a store's lot with room for its loading dock)
export const TOWN_SPECIALS = [
  { d: 57, prefab: 'liquor', biz: ['hospital'], names: ['Timber Bend Clinic'], fixed: true, look: 'clinic' },
  { d: 57, prefab: 'police', biz: ['police'], names: ['Timber Bend Sheriff'], fixed: true, look: 'sheriff' },
  { d: 57, prefab: 'conv', biz: ['convenience'], names: ['Timber Bend Fuel'], gas: true, fixed: true, look: 'shopfront' },
  { d: 57, prefab: 'diner', biz: ['delivery'], names: ['The Sawdust Diner'], fixed: true, look: 'shopfront' },
  { d: 57, prefab: 'strip', biz: ['lodge', 'butcher', 'hardware', 'tackle'], names: ['Timber Bend Hunting Lodge', 'Bend Game Butcher', 'Axe & Saw Hardware', 'Redwood Creek Tackle'], fixed: true, look: 'lodgerow' },
  { d: 57, prefab: 'industrial', biz: ['delivery'], names: ['Timber Bend Sawmill'], fixed: true, look: 'sawmill' },   // (not a plain warehouse: map.js' bowling alley takes the biggest)
  { d: 57, prefab: 'hotel', biz: ['delivery'], names: ['Pine Rest Motel'], fixed: true, look: 'motel' },
  { d: 58, prefab: 'liquor', biz: ['hospital'], names: ['Willow Crossing Clinic'], fixed: true, look: 'clinic' },
  { d: 58, prefab: 'police', biz: ['police'], names: ['Willow County Sheriff'], fixed: true, look: 'sheriff' },
  { d: 58, prefab: 'conv', biz: ['convenience'], names: ['Willow Crossing Fuel'], gas: true, fixed: true, look: 'shopfront' },
  { d: 58, prefab: 'church', biz: ['delivery'], names: ['Willow Crossing Chapel'], fixed: true, look: 'church' },
  { d: 58, prefab: 'quickstop', biz: ['farm'], names: ['Willow Valley Farm Co-op'], fixed: true, look: 'coop' },
  { d: 58, prefab: 'industrial', biz: ['delivery'], names: ['Willow Crossing Grain Elevator'], fixed: true, look: 'elevator' },
  { d: 58, prefab: 'diner', biz: ['delivery'], names: ['Crossroads Diner'], fixed: true, look: 'shopfront' },
  { d: 58, prefab: 'strip', biz: ['market', 'farmstand', 'fruitstand', 'delivery'], names: ["Willow Crossing Farmers' Market", 'Valley Farm Stand', 'Orchard Fruit Stand', 'Valley Feed & Seed'], fixed: true, look: 'feedrow' },
  { d: 59, prefab: 'hospital', biz: ['hospital'], names: ['Sandpiper Bay Clinic'], fixed: true, look: 'clinic' },   // (its lot as before: a store's lot leaves Sandpiper Bay more road than building)
  { d: 59, prefab: 'conv', biz: ['convenience'], names: ['Sandpiper Bay Fuel'], gas: true, fixed: true, look: 'beachshop' },
  { d: 59, prefab: 'strip', biz: ['sports', 'tackle', 'snack', 'delivery'], names: ['Sandpiper Surf Co.', 'Pier Tackle & Bait', 'Shorebird Snack Bar', 'Lifeguard Station'], fixed: true, look: 'surfrow' },
  { d: 59, prefab: 'beachbar', biz: ['delivery'], names: ['The Sandpiper'], fixed: true },
  { d: 59, prefab: 'diner', biz: ['delivery'], names: ['Boardwalk Diner'], fixed: true, look: 'beachshop' },
];

// The towns' own building styles (the generator's STYLE form, handed in as opts.styles by district, so only the v3
// build uses them - 8.13.1): small-town houses, workshops and diners instead of the city's brick shops, apartment
// blocks and car parks; few plain roofs, gardens between (the `park` filler: the `yard` one lays striped car parks).
// Northshore's beach towns (54, 8.14) take the beach town's, sparser still: bigger lots, gardens for the gaps, low roofs
// - "less dense" (the owner, 12:50).
export const TOWN_STYLES = {
  57: { minW: 12, minH: 12, gen: { house3: 3, house7: 3, house1: 1.5, diner: 0.6, repair: 0.9, quickstop: 0.7, conv: 0.5, liquor: 0.4, rest1: 0.5 }, filler: 'park', roof: 0.1, roofKinds: ['metal', 'tar'] },
  58: { minW: 12, minH: 12, gen: { house1: 2, house3: 2, house8: 1.2, house7: 1, conv: 0.8, repair: 1, quickstop: 1, diner: 0.6, rest1: 0.6 }, filler: 'park', roof: 0.12, roofKinds: ['metal', 'tile'] },
  59: { minW: 14, minH: 14, gen: { house1: 2, house2: 2, house5: 1, house9: 1.5, beachbar: 1, rest2: 1.2, diner: 0.5, conv: 0.4 }, filler: 'park', roof: 0.05, roofKinds: ['tile'] },
  54: { minW: 16, minH: 16, gen: { house1: 3, house2: 3, house5: 1.5, house9: 2, rest2: 0.7, beachbar: 0.7, conv: 0.3, diner: 0.3 }, filler: 'park', roof: 0.04, roofKinds: ['tile'] },
};

// the room a line keeps, stamped into a town's box: within r of its path's points (segments)
export function stamp(mask, box, path, r) {
  const [x0, y0, x1, y1] = box, BW = x1 - x0;
  const P = path.pts;
  for (let j = 1; j < P.length; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j];
    if (Math.max(ax, bx) + r < x0 || Math.min(ax, bx) - r > x1 || Math.max(ay, by) + r < y0 || Math.min(ay, by) - r > y1) continue;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const sx0 = Math.max(x0, Math.floor(Math.min(ax, bx) - r)), sx1 = Math.min(x1 - 1, Math.ceil(Math.max(ax, bx) + r));
    const sy0 = Math.max(y0, Math.floor(Math.min(ay, by) - r)), sy1 = Math.min(y1 - 1, Math.ceil(Math.max(ay, by) + r));
    for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / l2)), ex = x + 0.5 - ax - t * dx, ey = y + 0.5 - ay - t * dy;
      if (ex * ex + ey * ey <= r * r) mask[(y - y0) * BW + x - x0] = 1;
    }
  }
}

// Each town's ground on the land layer: its district and the built zone, in its ground boxes where the land is (not the
// beach's sand) and the room isn't.
export function paintTowns3(L, W, H) {
  const SK = skeletonLines();
  const out = [];
  for (const t of TOWNS3) {
    const [x0, y0, x1, y1] = t.box, BW = x1 - x0;
    const room = new Uint8Array(BW * (y1 - y0));
    for (const l of SK) if (l.kind === 'hwy') stamp(room, t.box, l.path, ROOM.hwy); else if (l.kind === 'main') stamp(room, t.box, l.path, ROOM.main);
    for (const s of STATIONS) if (s.line === 'main') stamp(room, t.box, { pts: [s.at, s.at] }, ROOM.station);
    let n = 0;
    for (const [gx0, gy0, gx1, gy1] of t.ground) for (let y = Math.max(y0, gy0); y < Math.min(y1, gy1); y++) for (let x = Math.max(x0, gx0); x < Math.min(x1, gx1); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!L.land[i] || L.terrain[i] === SAND || room[(y - y0) * BW + x - x0] || L.dist[i] === t.d) continue;
      L.dist[i] = t.d; L.zone[i] = Z_TOWN; n++;
    }
    out.push({ key: t.key, name: t.name, d: t.d, tiles: n });
  }
  return out;
}

// An arterial pulled straight through a town: its points within the town's box (and the ramp round it) along `axis`
// ('y': an east-west run at row v from column a to b; 'x': a north-south one), eased back onto its own course over
// `ramp` tiles each side (resampled a tile apart there, so the ease is smooth).
export function pull(l, axis, v, a, b, ramp, box) {
  const U = axis === 'y' ? 'x' : 'y', Q = axis;   // (U: along the run, Q: the coordinate pulled)
  const A = a * TILE, B = b * TILE, R = Math.max(1, ramp * TILE), V = (v + 0.5) * TILE;
  const bx0 = (box[0] - ramp - 8) * TILE, by0 = (box[1] - ramp - 8) * TILE, bx1 = (box[2] + ramp + 8) * TILE, by1 = (box[3] + ramp + 8) * TILE;
  const inBox = (p) => p.x >= bx0 && p.x <= bx1 && p.y >= by0 && p.y <= by1;
  const wt = (u) => u <= A - R || u >= B + R ? 0 : u >= A && u <= B ? 1 : u < A ? (u - (A - R)) / R : (B + R - u) / R;
  const P = l.pts, pts = [];
  for (let j = 0; j < P.length; j++) {
    const p = P[j], q = P[j - 1];
    if (q && (inBox(p) || inBox(q))) {
      const n = Math.ceil(Math.hypot(p.x - q.x, p.y - q.y) / TILE);
      for (let k = 1; k < n; k++) pts.push({ ...q, x: q.x + (p.x - q.x) * k / n, y: q.y + (p.y - q.y) * k / n, s: undefined });
    }
    pts.push({ ...p });
  }
  const w = pts.map((p) => (inBox(p) ? wt(p[U]) : 0));
  pts.forEach((p, i) => { if (w[i] > 0) p[Q] += (V - p[Q]) * w[i] * w[i] * (3 - 2 * w[i]); });
  // the straight run keeps its ends only; the resampled points off the town's reach go again
  l.pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !(w[i] === 1 && w[i - 1] === 1 && w[i + 1] === 1));
  measure(l.pts);
  return l;
}

// The beach town's front (before the blocks, from the rails hook as world3-beach.js beachFront): the boardwalk - planks
// (DOCK) on the first `walk` tiles of sand below the town's ground in each column - and the pier, `w` tiles of planks
// from the boardwalk straight out over the sand and `out` tiles over the sea. Kept from the dressing (reserve 4, the
// promenade's). The summary: m.world3.towns.front.
export function townsFront(m) {
  const W = m.w, out = [];
  for (const t of TOWNS3) {
    if (!t.front) continue;
    const f = t.front, top = new Map();
    let walk = 0, pier = 0;
    for (let x = f.x0; x < f.x1; x++) {
      let y = t.box[1], seen = false;
      for (; y < t.box[3] + 60; y++) { const d = m.dist[y * W + x]; if (d === t.d) seen = true; else if (seen && m.tiles[y * W + x] === T.SAND) break; }
      if (!seen || y >= t.box[3] + 60) continue;
      top.set(x, y);
      for (let k = 0; k < f.walk && m.tiles[(y + k) * W + x] === T.SAND; k++) { m.tiles[(y + k) * W + x] = T.DOCK; m.reserve[(y + k) * W + x] |= 4; walk++; }
    }
    const p = f.pier, y0 = Math.max(...Array.from({ length: p.w }, (_, k) => top.get(p.x + k) ?? -1));
    if (y0 > 0) for (let y = y0 + f.walk, wet = 0; wet < p.out && y < m.h; y++) {
      const tl = m.tiles[y * W + p.x];
      if (tl !== T.SAND && tl !== T.WATER && tl !== T.DEEP) break;
      if (tl !== T.SAND) wet++;
      for (let k = 0; k < p.w; k++) { m.tiles[y * W + p.x + k] = T.DOCK; m.reserve[y * W + p.x + k] |= 4; pier++; }
    }
    out.push({ key: t.key, boardwalk: walk, pier });
  }
  return out;
}

// Whether an arterial's skeleton point (tiles) is where a town pulls it off its course (its main street, its pulls and
// their ramps): the roads test's check of the skeleton's course passes these by.
export function pulledAt(name, x, y) {
  for (const t of [...TOWNS3, MESA]) for (const [n, axis, , a, b, ramp] of [[t.main.line, 'y', 0, t.main.a, t.main.b, t.main.ramp], ...t.pulls]) {
    if (n !== name) continue;
    const u = axis === 'y' ? x : y, [x0, y0, x1, y1] = t.box, r = ramp + 8;
    if (u > a - ramp - 1 && u < b + ramp + 1 && x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) return true;
  }
  return false;
}

// The streets: each town's main street (the arterial through it, pulled straight - the others through it too) and
// its side streets and lanes, laid as the generator's lines (px; it joins their ends onto the streets they stop on).
export function layTowns3(lines, m) {
  const out = [];
  for (const t of TOWNS3) {
    const main = lines.find((l) => l.name === t.main.line && l.kind === 'art');
    if (main) { pull(main, 'y', t.main.y, t.main.a, t.main.b, t.main.ramp, t.box); main.townMain = t.key; }
    for (const [name, axis, v, a, b, ramp] of t.pulls) for (const l of lines) if (l.name === name && l.kind === 'art') pull(l, axis, v, a, b, ramp, t.box);
    let len = 0;
    for (const [name, P] of t.streets) {
      const pts = P.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE }));
      for (let j = 1; j < P.length; j++) len += Math.abs(P[j][0] - P[j - 1][0]) + Math.abs(P[j][1] - P[j - 1][1]);
      lines.push({ pts, kind: 'st', lvl: 0, name, town: t.key });
    }
    out.push({ key: t.key, name: t.name, d: t.d, main: !!main, streets: t.streets.length, len });
  }
  return out;
}

// After the build: each town's planned store becomes its gas station (the pumps on the paving in front), and what each
// town has is summed up in m.world3.towns.
export function townsDone(m) {
  const at = (p) => m.dist[Math.floor(p.y / TILE) * m.w + Math.floor(p.x / TILE)];
  const gasNames = new Set(TOWN_SPECIALS.filter((s) => s.gas).map((s) => s.names[0]));
  m.pumps ||= [];
  const out = [];
  for (const t of TOWNS3) {
    const g = m.pois.find((p) => p && gasNames.has(p.label) && at(p) === t.d);
    if (g && (g.kind === 'convenience' || g.kind === 'delivery')) {
      const b = m.buildings[g.b];
      g.kind = 'gasstation';
      if (b) {
        // (in front of its door, as buildCornerStores puts them - the door's point 0.7 tiles out, the pumps 52 px on -
        // or nearer the front where the town's pavement is narrower than the city's: on open paving, never the road)
        const south = !b.door || b.door.ty >= b.ty + b.th, cx = (b.tx + b.tw / 2) * TILE;
        const open = (x, y) => { const tl = m.tileAtPx(x, y); return tl === T.SIDEWALK || tl === T.PLAZA || tl === T.LOT || tl === T.GRASS; };
        for (const out of [0.7 * TILE + 52, 1.6 * TILE, TILE]) {
          const fy = south ? (b.ty + b.th) * TILE + out : b.ty * TILE - out;
          if (![-48, 48].every((dx) => open(cx + dx, fy))) continue;
          for (const dx of [-48, 48]) { m.pumps.push({ x: cx + dx, y: fy }); m.addSolidProp(cx + dx, fy, 9); }
          break;
        }
        for (const s of b.signs || []) if (s.text === g.label) s.text = "Gas 'n Go";
      }
    }
    // a bus stop on the main street when buildBusStops left it none (doors all along it): on 5 tiles of sidewalk with
    // nothing solid within 70 px, the first such spot from the middle out
    const [bx0, by0, bx1, by1] = t.box;
    const busAt = (p) => p && p.t === 'busstop' && p.x >= bx0 * TILE && p.x < bx1 * TILE && p.y >= by0 * TILE && p.y < by1 * TILE;
    if (!m.props.some(busAt)) {
      const solid = m.props.filter((p) => p && p.x >= (bx0 - 4) * TILE && p.x < (bx1 + 4) * TILE && p.y >= (by0 - 4) * TILE && p.y < (by1 + 4) * TILE);
      const free = (x, y) => !solid.some((p) => Math.hypot(p.x - x, p.y - y) < 70);
      const walk = (tx, ty) => [-2, -1, 0, 1, 2].every((dx) => m.tileAt(tx + dx, ty) === T.SIDEWALK && !m.deck[ty * m.w + tx + dx]);
      let done = false;
      for (const e of m.edges) {
        // (the main street's straight run through the town)
        if (done || e.name !== t.main.line || e.lvl !== 0) continue;
        const ya = (t.main.y + 0.5) * TILE;
        const xs = e.pts.filter((p) => Math.abs(p.y - ya) < 4 && p.x >= t.main.a * TILE && p.x <= t.main.b * TILE).map((p) => p.x);
        if (xs.length < 2) continue;
        const xa = Math.min(...xs), xb = Math.max(...xs);
        for (let s = 0; s < (xb - xa) / 2 - 6 * TILE && !done; s += TILE) for (const x of [(xa + xb) / 2 + s, (xa + xb) / 2 - s]) for (const side of [1, -1]) {
          if (done) break;
          const y = side < 0 ? ya - e.hw - TILE * 1.25 : ya + e.hw + TILE * 1.6, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
          if (!walk(tx, ty) || !free(x, y)) continue;
          m.props.push({ t: 'busstop', x: (tx + 0.5) * TILE, y, face: side < 0 ? 'S' : 'N' });
          const sp = m.addSolidProp((tx + 0.5) * TILE, y, 14); sp.pi = m.props.length - 1; sp.brk = true; m.propSolid.set(sp.pi, sp);
          done = true;
        }
      }
    }
    const pois = m.pois.filter((p) => p && at(p) === t.d);
    const kinds = {};
    for (const p of pois) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
    let blds = 0;
    for (const b of m.buildings) if (b && m.dist[(b.ty + (b.th >> 1)) * m.w + b.tx + (b.tw >> 1)] === t.d) blds++;
    out.push({ key: t.key, name: t.name, d: t.d, buildings: blds, pois: pois.length, kinds, bus: m.props.filter(busAt).length });
  }
  return out;
}

// ---- The towns' own models (8.13.2, H40; concepts WR2-A, WR2-C, D13, D13-B, D15-A/B, BE1, BE2, SR7) ----------------
// Each town building gets a look (b.look, and its lot's: m.prefabs[b.prefab].look) that both renderers draw in place of
// the prefab's city art - the logging town's wooden shopfronts with porches and false fronts, cabins, the sawmill, the
// lodge's row, the farm town's farmhouses, white church, grain elevator, co-op and feed store, the beach town's
// cottages, houses on stilts and surf shop row; and the clinic, the sheriff and the motel as small-town buildings. What
// stands round them is m.townKit (k, x, y in px; a: heading, 0 = along x; len, n: size; z: lift; s: solid radius): the
// porches, the lodge's antlers, the sawmill's saw line, log stacks and log loader, the elevator's silos, the church's
// steeple, the co-op's loading dock, the feed sacks, the surf shop's boards, and Sandpiper Bay's boardwalk (rails on
// the sea side, benches, lamps), its pier (rails, the shelter at its end) and a lifeguard tower on the sand.
// A sawmill's shed and an elevator's head house take the west part of the building (b.lookW tiles): its yard, the
// logs and the silos, stand on the rest - inside the solid footprint, so nothing new blocks a street.
const HOUSE_LOOK = { 57: 'cabin', 58: 'farmhouse', 59: 'cottage' }, SHOP_LOOK = { 57: 'shopfront', 58: 'shopfront', 59: 'beachshop' };
const SHOP_KINDS = new Set(['diner', 'rest1', 'rest2', 'conv', 'quickstop', 'liquor', 'repair', 'strip', 'shops1', 'shops2', 'boutique']);
const PART = { sawmill: 0.56, elevator: 0.32 };
const WOODS = { 57: ['#6e4a30', '#7a5436', '#8a6440', '#6a5a44', '#5e4030'], 58: ['#e8e4d8', '#f0ecdc', '#d8c8a0', '#c84a3a', '#e0d8c0'], 59: ['#9ac8d0', '#e8d8b0', '#f0c8b0', '#b8d8b8', '#f4f0e4', '#d0b8d8'] };
export function townModels(m) {
  const W = m.w, kit = (m.townKit ||= []), named = new Map(TOWN_SPECIALS.filter((s) => s.look).map((s) => [s.names[0], s.look]));
  const open = (x, y) => { const tl = m.tileAtPx(x, y); return tl !== T.ROAD && tl !== T.BRIDGE && tl !== T.WATER && tl !== T.DEEP && tl !== T.BUILDING; };
  const out = [];
  for (const t of TOWNS3) {
    const looks = {}, n = {};
    const add = (k, x, y, o = {}) => { const it = { k, x: Math.round(x), y: Math.round(y), ...o }; if (it.s && !open(it.x, it.y)) delete it.s; if (it.s) m.addSolidProp(it.x, it.y, it.s); kit.push(it); n[k] = (n[k] || 0) + 1; return it; };
    for (const b of m.buildings) {
      if (!b || b.gone || m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)] !== t.d) continue;
      // (a lot the generator built as a plain roof - a house or a shop it had no prefab for: small ones are houses)
      const p = b.prefab >= 0 ? m.prefabs[b.prefab] : null, roof = !p && b.kind === 'roof' && b.name !== 'Lot', house = b.kind.startsWith('house') || (roof && b.tw <= 16 && b.th <= 14);
      if (!p && !roof) continue;
      const look = named.get(b.name) || (house ? (t.d === 59 && (b.kind === 'house9' || b.id % 3 === 0) ? 'stilts' : HOUSE_LOOK[t.d]) : SHOP_KINDS.has(b.kind) || roof ? SHOP_LOOK[t.d] : null);
      if (!look) continue;
      b.look = look; if (p) p.look = look;
      looks[look] = (looks[look] || 0) + 1;
      // (its front: the door's side; a plain roof's, the side a street's sidewalk is on - the south when both or neither)
      const street = (ty) => { for (let k = 0; k < 3; k++) { const tl = m.tileAt(b.tx + (b.tw >> 1), ty + k * (ty < b.ty ? -1 : 1)); if (tl === T.SIDEWALK || tl === T.ROAD) return true; } return false; };
      const x0 = b.tx * TILE, y0 = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE, south = b.door ? b.door.ty >= b.ty + b.th : street(b.ty + b.th) || !street(b.ty - 1);
      const front = !!b.door || street(b.ty + b.th) || street(b.ty - 1);   // (a plain roof with no street either side: no porch)
      const fy = south ? y0 + h : y0, o = south ? 1 : -1, a = south ? 0 : Math.PI;   // (the front wall's line, outward, the front's heading)
      const doorX = b.door ? (b.door.tx + 0.5) * TILE : x0 + w / 2;
      const sign = (re) => (b.signs || []).find((s) => re.test(s.text));
      if (PART[look]) b.lookW = Math.max(4, Math.round(b.tw * PART[look]));
      switch (look) {
        case 'shopfront': case 'beachshop': case 'lodgerow': case 'surfrow': case 'feedrow':
          // (one storey under a low gable, its false front on the porch: the same boards - b.lookC)
          b.lookC = WOODS[t.d][b.id % WOODS[t.d].length];
          if (front) add('porch', x0 + w / 2, fy + o * 17, { len: Math.max(48, w - 8), a, ff: south ? 104 : 0, c: look === 'lodgerow' ? '#4e3424' : b.lookC });
          break;
        case 'cabin': case 'farmhouse': case 'cottage':
          if (front) add('porch', Math.max(x0 + 60, Math.min(x0 + w - 60, doorX)), fy + o * 17, { len: Math.min(w - 16, look === 'farmhouse' ? 200 : 120), a });
          break;
        case 'stilts': if (front) add('porch', Math.max(x0 + 56, Math.min(x0 + w - 56, doorX)), fy + o * 17, { len: Math.min(w - 16, 112), a, z: 16 }); break;
        case 'church': add('steeple', x0 + w / 2, fy + o * 20, { a }); break;
        case 'coop': add('dock', x0 + w / 2, fy + o * 20, { len: Math.max(80, Math.round(w * 0.6 / 8) * 8), a }); break;
        case 'sawmill': {
          const sx = x0 + b.lookW * TILE, yw = w - b.lookW * TILE;   // (the log yard east of the shed)
          for (const f of [0.22, 0.5, 0.78]) add('logs', sx + yw / 2 + 8, y0 + h * f, { len: Math.max(64, Math.round((yw - 56) / 8) * 8) });
          add('loader', sx + 46, y0 + h * 0.64, { a: 0 });
          add('saw', x0 + b.lookW * TILE * 0.4, fy + o * 60, { len: 112, a, s: 18 });
          break;
        }
        case 'elevator': {
          const sx = x0 + b.lookW * TILE, yw = w - b.lookW * TILE, k = Math.max(2, Math.min(5, Math.round(yw / 100)));
          add('silos', sx + yw / 2, y0 + h / 2, { n: k, len: Math.round((yw - 8) / 8) * 8 });
          break;
        }
      }
      if (look === 'lodgerow') { const s = sign(/LODGE/i); if (s) add('antlers', s.x, fy + o * 2, { z: 50, a }); }
      if (look === 'feedrow') { const s = sign(/FEED/i); if (s) add('sacks', s.x + 34, fy + o * 44, { a }); }
      if (look === 'surfrow') { const s = sign(/SURF/i); if (s) add('boards', s.x + 40, fy + o * 46, { n: 5, a }); }
    }
    // the beach town's boardwalk (8.13.1's planks along the top of the sand, townsFront): a rail along its sea side
    // (stepping with the planks down the diagonal shore, open where the pier leaves it), benches facing the sea and
    // lamps along its land side; the pier: rails down both sides, a shelter and a rail across its end; a lifeguard
    // tower on the sand beside it
    if (t.front) {
      const f = t.front, P = f.pier, dock = (x, y) => m.tiles[y * W + x] === T.DOCK, cols = [];
      for (let x = f.x0; x < f.x1; x++) {
        let y = t.box[1], seen = false;
        for (; y < t.box[3] + 60; y++) { if (m.dist[y * W + x] === t.d) seen = true; else if (seen && dock(x, y)) break; }
        if (!seen || y >= t.box[3] + 60) continue;
        let yb = y; while (yb < y + f.walk && dock(x, yb)) yb++;
        cols.push([x, y, yb]);
      }
      const pierCol = (x) => x >= P.x && x < P.x + P.w;
      let run = null;
      const flush = () => { if (run) add('rail', (run[0] + run[1] + 1) / 2 * TILE, run[2] * TILE - 3, { len: (run[1] - run[0] + 1) * TILE, a: 0 }); run = null; };
      cols.forEach(([x, top, yb], i) => {
        if (pierCol(x)) { flush(); return; }
        if (run && run[2] === yb && run[1] === x - 1) run[1] = x;
        else {
          const prev = cols[i - 1];
          flush();
          if (prev && prev[0] === x - 1 && !pierCol(prev[0]) && prev[2] !== yb) add('rail', x * TILE, (Math.min(prev[2], yb) + Math.max(prev[2], yb)) / 2 * TILE - 3, { len: Math.abs(prev[2] - yb) * TILE, a: Math.PI / 2 });
          run = [x, x, yb];
        }
        const k = x - f.x0;
        if (Math.abs(x - P.x - P.w / 2) > 4 && k % 14 === 7) add('bench', (x + 0.5) * TILE, top * TILE + 12, { a: 0 });
        if (k % 14 === 0) add('lamp', (x + 0.5) * TILE, top * TILE + 6);
      });
      flush();
      const pc = cols.filter(([x]) => pierCol(x));
      if (pc.length) {
        const ys = Math.max(...pc.map((c) => c[2]));
        let ye = ys; while (ye < m.h && dock(P.x, ye)) ye++;
        if (ye - ys > 6) {
          for (const x of [P.x * TILE + 3, (P.x + P.w) * TILE - 3]) add('rail', x, (ys + ye) / 2 * TILE, { len: (ye - ys) * TILE, a: Math.PI / 2 });
          add('rail', (P.x + P.w / 2) * TILE, ye * TILE - 3, { len: P.w * TILE, a: 0 });
          add('shelter', (P.x + P.w / 2) * TILE, (ye - 2) * TILE, { a: 0 });
          add('lamp', (P.x + 0.5) * TILE, (ys + 12) * TILE);
          // the lifeguard station's tower on the sand east of the pier (drawn as the beach towns' are: m.lifeguards)
          for (const dx of [12, 16, 20, 8]) {
            const c = cols.find((q) => q[0] === P.x + P.w + dx);
            if (!c) continue;
            const lx = (c[0] + 0.5) * TILE, ly = (c[2] + 7) * TILE;
            if (m.tileAtPx(lx, ly) !== T.SAND || m.tileAtPx(lx, ly + 2 * TILE) !== T.SAND) continue;
            (m.lifeguards ||= []).push({ x: lx, y: ly, town: t.key }); m.addSolidProp(lx, ly, 18); n.tower = 1;
            break;
          }
        }
      }
    }
    out.push({ key: t.key, looks, kit: n });
  }
  return out;
}
