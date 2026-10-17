// World v3b (docs/WORLD-V3.md part 9, 9.3): the city, designed anew on the owner's layout - the Gulf Island's downtown
// round Greenfield Park, the mainland city along the gulf's north shore, the western city with its port and airport, and
// the towns of the east, south-west, south-east islands, the quiet key and the ferry island. For the whole-world build
// only (shared/world3-world.js calls these; the page and the city worker never import this module):
// - CITY3: the district plan as data - each district a union of axis-aligned rectangles in frame tiles (the first
//   rectangle listed that holds a tile wins it, so the park and the civic quarter are cut out of downtown), its island
//   (`on`: an ISLANDS3 key or 'main'), its zone, and `keep`: superblocks no street crosses (the park, the stadium, the
//   airport field, the lake park).
// - AVE_X / AVE_Y: the avenues and boulevards, one lattice for the whole gulf, so an avenue carries on across a
//   district border, and the avenues of two shores face each other across the water (a bridge lands on an avenue).
// - paintCity3(L, W, H): each district's id and zone painted on the land layer (only on its own island's land, after
//   the biomes), the summary returned.
// - layCity3(lines, m, opts): the streets as the generator's lines (px): the avenues, each district's grid at its own
//   spacing (rows long east-west and shallow north-south, so every block has a row of fronts facing south), alleys
//   through the dense districts' long blocks, every street east-west or north-south; a stretch is laid only where it
//   is on land with room for its pavements, and never along a highway or the main line (it crosses them), so the
//   blocks end in square steps at the coasts; dead ends trimmed back to the last crossing. The bridges the transport
//   skeleton lays (arterials over water) are met: a straight stub from each end on the city's land to the nearest
//   street.
// - CITY_PARKS, CITY_AIRPORT, CITY_SEEDS, CITY_SPOTS: the places today's generator puts at today's coordinates
//   (citylayout.js PARK, islands.js PARKS / AIRPORTS, metro.js ARTS / MUSEUM_SQUARE, SEEDS), re-anchored to the plan
//   (the build hands them in: opts.parks, opts.airports, opts.seedOf - see world3-world.js).
// Deterministic: integer data, no Math.random, no trigonometry.
import { TILE } from './constants.js';
import { DISTRICTS } from './mapcore.js';
import { ISLANDS3, MAINLAND3, HIGHWAYS3, MAIN_LOOP3 } from './world3-layout.js';
import { STATIONS } from './world3-skeleton.js';
import { TERRAIN3 } from './world3-land.js';
import { handPlanAt, handStreets, HAND_PLANS } from './world3-hand.js';

// the v3b frame the plan is drawn on (WORLD-V3.md 9.1: 13 x 8 regions of 504 tiles); the build lays the city only there
export const CITY_FRAME = [6552, 4032];

// zones (shared/layoutcore.js Z): the city's, Southbank's, the key's, Westport's, Northshore's, Cedar Isle's, the villages'
const ZC = 1, ZS = 2, ZK = 5, ZW = 7, ZN = 8, ZI = 9, ZG = 10;

// The street spacing by district style, in tiles between centre lines: [north-south streets apart (a block's width
// east-west plus a street), east-west streets apart (one row of fronts plus its backs, plus a street)]. A street with
// its pavements is 10-14 tiles, so a towers block is ~60 x 32, a houses block ~72 x 20 (a row of lots and their
// gardens), a luxury block ~88 x 28 (mansions on big lots), a port block ~84 x 44.
export const PITCH = {
  towers: [72, 44], civic: [72, 44], commercial: [60, 36], nightlife: [56, 36], redlight: [52, 34], arts: [56, 36],
  apartments: [64, 34], oldtown: [46, 30], southside: [52, 32], houses: [84, 32], luxury: [100, 40], beach: [64, 34],
  harbor: [96, 56], industrial: [100, 56],
};
// the styles whose long blocks get a service alley through the middle (north-south, every other block)
const ALLEYS = new Set(['towers', 'commercial', 'nightlife', 'redlight', 'oldtown', 'southside', 'arts']);

// The avenues (east-west: AVE_Y, north-south: AVE_X): [coordinate, kind, name, alt names by span [a, b, name]]. One
// lattice for the gulf: each is laid wherever it runs through the city's districts (on land, off the keeps), so the
// mainland's Bridge Avenues line up with the Gulf Island's park avenues across the water, Westport Boulevard with Neon
// Boulevard across the West Channel, the island's avenues with the south islands'.
export const AVE_Y = [
  [1700, 'ave', 'Central Avenue', [[1800, 2500, 'Quarter Avenue']]],
  [1800, 'blvd', 'Midtown Boulevard', [[1800, 2500, 'Old Quarter Road']]],
  [1900, 'ave', 'Harbor Avenue'],
  [2200, 'blvd', 'Neon Boulevard', [[1600, 2200, 'Westport Boulevard']]],
  [2300, 'ave', 'Crosstown Avenue', [[1100, 2200, 'Pier Avenue']]],
  [2400, 'ave', 'Greenfield Avenue', [[1100, 2000, 'Hillcrest Avenue'], [3830, 4600, 'Falls Avenue']]],
  [2576, 'ave', 'Fountain Avenue', [[3830, 4600, 'Cedar Avenue']]],
  [2730, 'ave', 'Bayside Avenue', [[1100, 2000, 'Runway Road']]],
  [2860, 'ave', 'Ocean Avenue', [[1100, 2100, 'Marsh Road']]],
  [3000, 'ave', 'Pine Avenue', [[3260, 4300, 'Southside Avenue']]],
  [3150, 'blvd', 'Sunset Boulevard', [[3260, 4300, 'Pelican Avenue']]],
  [3290, 'blvd', 'Pelican Boulevard'],
  [3480, 'ave', 'Harbor Street', [[4000, 4600, 'Cay Road']]],
];
export const AVE_X = [
  [1300, 'ave', 'Hills Avenue'],
  [1780, 'ave', 'Westport Avenue'],
  [1960, 'ave', 'Quarter Avenue'],
  [2200, 'ave', 'Mariner Avenue'],
  [2560, 'ave', 'Gallery Avenue', [[2800, 3400, 'Sunset Avenue']]],
  [2860, 'ave', 'Westside Avenue'],
  [2988, 'ave', 'Park West Avenue', [[1400, 2050, 'Bridge Avenue']]],
  [3184, 'ave', 'Park East Avenue', [[1400, 2050, 'Main Avenue'], [300, 1000, 'Station Avenue']]],
  [3320, 'ave', 'Civic Avenue'],
  [3480, 'ave', 'Harborview Avenue', [[2950, 3500, 'Breaker Avenue'], [300, 1000, 'Lighthouse Avenue']]],
  [3680, 'ave', 'Marina Avenue', [[1400, 2050, 'Stadium Avenue'], [300, 1000, 'Bluffs Avenue']]],
  [3940, 'ave', 'Southside Drive'],
  [4100, 'ave', 'Lake Avenue', [[1400, 2100, 'Yards Avenue']]],
  [4300, 'ave', 'Pinecrest Avenue'],
];

// The districts (WORLD-V3.md 9.3; ids and styles: shared/mapcore.js DISTRICTS). rects [x0, y0, x1, y1] in frame tiles,
// edges on the lattice (they're streets); `keep`: superblocks no street crosses (their edges are streets).
export const CITY3 = [
  // --- the Gulf Island: downtown's glass towers round the central park and its pond, inside the Gulf Loop ---
  { d: 12, on: 'big', zone: ZC, rects: [[2988, 2400, 3184, 2576]], keep: [[2988, 2400, 3184, 2576]], look: 'the central park: lawns, the pond (LAKES3\'s small lake), the fountain, the pitch' },
  { d: 5, on: 'big', zone: ZC, rects: [[3184, 2300, 3480, 2400], [3320, 2400, 3480, 2576]], look: 'city hall, the courthouse, St. Neon General: stone and glass on wide plazas north-east of the park' },
  { d: 4, on: 'big', zone: ZC, rects: [[2860, 2300, 3184, 2400], [2860, 2400, 2988, 2730], [2988, 2576, 3480, 2730], [3184, 2400, 3320, 2576]], look: 'glass towers ringing the park, the police HQ, the bank, the Grand Neon Hotel' },
  { d: 7, on: 'big', zone: ZC, rects: [[2860, 2080, 3640, 2300]], look: 'the Neon Strip: clubs, the arcade and hotels along Neon Boulevard on the north shore, facing the mainland' },
  { d: 17, on: 'big', zone: ZC, rects: [[2560, 2120, 2860, 2400]], look: 'the Pink Mile behind the Strip to the west: lounges, motels, neon' },
  { d: 46, on: 'big', zone: ZC, rects: [[2300, 2240, 2560, 2400], [2300, 2400, 2860, 2730]], look: 'the Arts District west of downtown: the museum on its square, the playhouse, galleries, records' },
  { d: 16, on: 'big', zone: ZC, rects: [[2300, 2730, 3840, 3020], [3480, 2300, 3840, 2730]], look: 'Bayside Heights on the ocean side: mansions with pools on big lots, the Hilltop Mansion, the marina' },
  // --- the mainland city on the gulf's north shore ---
  { d: 3, on: 'main', zone: ZC, rects: [[3940, 1440, 4260, 2100]], look: 'The Yards east of the river channel: rail sidings, warehouses, scrap, the rough side' },
  { d: 25, on: 'main', zone: ZC, rects: [[3680, 1440, 3940, 1900]], keep: [[3680, 1750, 3800, 1860]], look: 'the Stadium District: the stadium, its car parks, the megastore, the ponds' },
  { d: 2, on: 'main', zone: ZC, rects: [[2700, 1440, 3680, 1660]], look: 'Northgate: apartment blocks along the north, the public library, Fire Station 7' },
  { d: 8, on: 'main', zone: ZC, rects: [[2860, 1900, 3800, 2120]], look: 'the Harbor along the waterfront: piers, the fish market, the ferry terminal, the marina' },
  { d: 18, on: 'main', zone: ZC, rects: [[2600, 1660, 2860, 2120]], look: 'Old Town at the river mouth: narrow brick streets, the infirmary, the Rusty Anchor' },
  { d: 1, on: 'main', zone: ZC, rects: [[2860, 1660, 3680, 1900]], hand: 'midtown', look: 'Midtown at the bridgeheads, handcrafted (shared/world3-midtown.js): the train over Trestle Street, Holly Street\'s main street, the boulevard, the diagonal to The Yards' },
  // --- the western city ---
  { d: 27, on: 'main', zone: ZW, rects: [[1440, 2600, 2090, 2860]], keep: [[1440, 2600, 2090, 2860]], look: 'Westport International: the north-south runway, its taxiway, the terminal, the apron and hangars' },
  { d: 26, on: 'main', zone: ZW, rects: [[1960, 2160, 2200, 2400], [2090, 2600, 2320, 2780]], port: true, look: 'Port Westport: the container quays and cranes on the gulf shore, the Gull Harbor car ferry\'s terminal' },
  { d: 23, on: 'main', zone: ZW, rects: [[1680, 1960, 2200, 2160], [1680, 2160, 1960, 2400]], look: 'Westport Center: towers round Westport Boulevard, Westport General, Westport PD' },
  { d: 30, on: 'main', zone: ZW, rects: [[1900, 1640, 2500, 1960]], look: 'the Old Quarter round its station: old brick, the chapel, the redevelopment site' },
  { d: 28, on: 'main', zone: ZW, rects: [[1560, 1700, 1900, 1960], [1300, 1960, 1680, 2600], [1300, 2600, 1440, 2980], [1420, 2860, 2000, 3080]], look: 'West Hills: suburbs meeting the forest and the marsh, the academy' },
  // --- the east island ---
  { d: 36, on: 'east', zone: ZI, rects: [[3980, 2230, 4200, 2500]], look: 'Falls Center: the island\'s main street, the clinic and the police' },
  { d: 37, on: 'east', zone: ZI, rects: [[4200, 2230, 4480, 2500], [3820, 2230, 3980, 2740]], keep: [[4300, 2340, 4420, 2440]], look: 'the Lake District: villas round the lake park' },
  { d: 35, on: 'east', zone: ZI, rects: [[3980, 2500, 4480, 2780]], look: 'Cedar Falls: family houses, the playhouse, FuelMax' },
  // --- the south-west island ---
  { d: 10, on: 'southwest', zone: ZS, rects: [[2400, 3110, 3240, 3290]], look: 'Sunset Beach along the south shore: Sunset Boulevard, the boardwalk, the volleyball, surf shops' },
  { d: 0, on: 'southwest', zone: ZS, rects: [[2400, 2840, 3240, 3110]], look: 'Pine Hills behind the beach: houses under pines, Southbank Medical, the precinct' },
  // --- the south-east island ---
  { d: 14, on: 'southeast', zone: ZK, rects: [[3260, 3260, 4120, 3430]], look: 'Pelican Key\'s beach along the south shore: the beach bar, the charter dock' },
  { d: 6, on: 'southeast', zone: ZS, rects: [[3260, 2960, 4120, 3260], [3840, 2820, 4280, 2960]], look: 'Southside: the rough side - pawn shops, laundromats, gang turf' },
  // --- the north coast (WORLD-V3.md 9.6): round the main line's Northshore station, the farm lake's mouth (the inlet)
  // and the peninsula east of it; the Shore Road (world3-layout.js TOWN_ROADS3) runs straight along their south edge
  // (row 706) and the North Coast Road / Cedar Farms Road along the station quarter's - their streets end on those
  // roads (planCity3: the country roads' room); the main line between stays up (the scenic route). `shore`: the beach
  // (the land layer's sand) stays the Northshore Beaches' (54: sand, the promenade) in front of the town ---
  { d: 31, on: 'main', zone: ZN, shore: true, rects: [[3100, 560, 3300, 706], [3030, 752, 3230, 880]], look: 'Northshore: the station town - shops, the medical centre and the sheriff on the lobe west of the inlet and round Station Avenue south of the line' },
  { d: 32, on: 'main', zone: ZN, rects: [[3380, 380, 3620, 706]], look: 'North Point: the harbour village on the peninsula\'s inlet shore - the finger piers and the fleet, the fish shack, North Point Light on the tip (world3-north.js)' },
  { d: 34, on: 'main', zone: ZN, shore: true, rects: [[3620, 400, 3860, 706]], look: 'The Bluffs: villas on big lots on the peninsula\'s headland above its east beach' },
  // --- the quiet key and the ferry island ---
  { d: 44, on: 'key', zone: ZG, rects: [[4100, 3320, 4320, 3500]], look: 'Coral Cay: a few streets of beach houses round the cove' },
  { d: 43, on: 'ferry', zone: ZG, rects: [[1560, 3400, 1940, 3580]], look: 'Gull Harbor: the fishing village, the fish shack, the general store, the Anchor' },
];
export const CITY_IDS = new Set(CITY3.map((c) => c.d));

// Today's places at their v3b spots (frame tiles): the superblocks the generator lays out whole (its ALL_PARKS: the
// park with its pond and pitch, the stadium), the airport in AIRPORTS' form, the Arts District's square, each
// district's heart (where its planned businesses look first: map.js seedOf).
export const CITY_PARKS = [
  { x0: 2988, y0: 2400, x1: 3184, y1: 2576, label: 'Greenfield Park', pond: true, pitch: true },
  { x0: 3680, y0: 1750, x1: 3800, y1: 1860, label: 'Westport Stadium', pitch: true },   // (the label naturesites.js' Stadium Lido looks for)
  { x0: 4300, y0: 2340, x1: 4420, y1: 2440, label: 'Falls Lake Park', pond: true },
];
export const CITY_AIRPORT = {
  name: 'Westport International', runway: [1474, 2626, 14, 210], taxi: [1494, 2626, 5, 210], apron: [1504, 2636, 120, 110],
  terminal: [1530, 2644, 64, 16], hangars: [[1512, 2780, 18, 14], [1536, 2780, 18, 14], [1560, 2780, 18, 14], [1584, 2780, 18, 14]],
  planes: [[1540, 2680], [1572, 2680], [1604, 2696]], poiAt: [1562, 2662],
};
export const CITY_SPOTS = {
  museumSquare: { x0: 2640, y0: 2470, x1: 2700, y1: 2520 },   // (the Metro Museum of Art fronts onto it; the Playhouse beside)
  museum: [2670, 2462], playhouse: [2610, 2462],
  ferryWest: [2190, 2640],     // (the Gull Harbor Car Ferry's terminal in Port Westport: FERRIES3's first stop)
  ferryMain: [3260, 2004],     // (the Gulf Water Bus at the mainland Harbor)
  marina: [3720, 2860],        // (Bayside Heights' marina on the island's south-east shore)
  mansion: [3300, 2900],       // (the Hilltop Mansion: Bayside Heights' biggest lot that opens north onto a street)
};
export const CITY_SEEDS = (() => {
  const out = {};
  for (const c of CITY3) {
    const r = c.rects[0];
    out[c.d] = [Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)];
  }
  out[46] = [2640, 2520]; out[12] = [3080, 2560]; out[4] = [3090, 2650]; out[16] = [3200, 2860]; out[26] = [2080, 2280];
  return out;
})();

// ---------------------------------------------------------------------------------------------------------------
// The land of each island: its outline's spans along a row (the even-odd rule), so a district paints only its own
// island (a rectangle may reach over the water to the next).
const POLYS = { main: MAINLAND3 };
for (const I of ISLANDS3) POLYS[I.key] = I.poly;
function spans(poly, y) {
  const xs = [], yc = y + 0.5;
  for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
    const [ax, ay] = poly[k], [bx, by] = poly[j];
    if ((ay <= yc) === (by <= yc)) continue;
    xs.push(ax + (yc - ay) * (bx - ax) / (by - ay));
  }
  xs.sort((a, b) => a - b);
  const out = [];
  for (let j = 0; j + 1 < xs.length; j += 2) out.push([Math.ceil(xs[j] - 0.5), Math.floor(xs[j + 1] - 0.5)]);
  return out;
}

// The districts on the land layer: each district's rectangles, in order (the first to hold a tile wins it), on its
// island's land (L.land: the rivers and lakes are already cut; a `shore` district leaves the beach - L.terrain's sand -
// to the beach district under it), its id on `dist` and its zone on `zone`. extra: rects
// handed in at run time by district (the container port's quay rect from the skeleton: Port Westport takes it).
export function paintCity3(L, W, H, extra = null) {
  const done = new Uint8Array(W * H);
  const out = [];
  for (const c of CITY3) {
    const poly = POLYS[c.on];
    let n = 0;
    for (const [x0, y0, x1, y1] of [...c.rects, ...((extra && extra[c.d]) || [])]) {
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        for (const [a, b] of spans(poly, y)) {
          for (let x = Math.max(a, x0, 0); x <= Math.min(b, x1 - 1, W - 1); x++) {
            const i = y * W + x;
            if (done[i] || !L.land[i] || (c.shore && L.terrain && L.terrain[i] === TERRAIN3.SAND)) continue;
            done[i] = 1; L.dist[i] = c.d; L.zone[i] = c.zone; n++;
          }
        }
      }
    }
    out.push({ d: c.d, name: DISTRICTS[c.d].name, tiles: n });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The streets.
const HALF = { st: 7, ave: 9, blvd: 9, alley: 3 };   // tiles from a street's centre line to the back of its pavement
const ROOM_HWY = 18, ROOM_RAIL = 14;                    // a street this near a highway / the main line, running along it, isn't laid
// (the north coast's country roads - the arterials north of row COUNTRY_Y: the Shore Road, the North Coast Road, Cedar
// Farms Road - run through or along its towns: a town street this near one, running along it, isn't laid - the road
// serves - and a street that ends on one (within ON_ROAD tiles of its middle) is met there, not a dead end)
const ROOM_ROAD = 14, COUNTRY_Y = 1000, ON_ROAD = 3;
const nameOf = (A, at) => { for (const [a, b, n] of A[3] || []) if (at >= a && at < b) return n; return A[2]; };

// The main line under the city (the owner, 2026-10-14: "some of the main train going underground in parts of the
// city"; part 5's ruling: no level crossings in the towns): inside the city's districts the line runs below ground,
// coming up only round its stations (STATION_OPEN tiles each way - the platforms and the ramps either side). A street
// may cross it only where it is below ground (planCity3); world3-rail.js trackOf lays it so.
export const STATION_OPEN = 60;
const MAIN_STOPS = STATIONS.filter((q) => q.line === 'main').map((q) => q.at);
const inCityRects = (x, y) => CITY3.some((c) => c.rects.some(([x0, y0, x1, y1]) => x >= x0 && y >= y0 && x < x1 && y < y1));
export function cityRailUnder(x, y) {
  if (!inCityRects(x, y)) return false;
  for (const [sx, sy] of MAIN_STOPS) if ((x - sx) * (x - sx) + (y - sy) * (y - sy) < STATION_OPEN * STATION_OPEN) return false;
  return true;
}

// the distance from (x, y) to a polyline's nearest segment, and that segment's direction (unit)
function nearSeg(P, x, y) {
  let best = Infinity, ux = 0, uy = 0;
  for (let j = 1; j < P.length; j++) {
    const [ax, ay] = P[j - 1], [bx, by] = P[j];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    const ex = x - ax - t * dx, ey = y - ay - t * dy, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; const l = Math.sqrt(l2); ux = dx / l; uy = dy / l; }
  }
  return { d: Math.sqrt(best), ux, uy };
}

// The plan of the streets in tiles, without the build: { h: [{ y, x0, x1, kind, name }], v: [{ x, y0, y1, ... }] }.
// land(x, y): dry land; dist(x, y): the district painted there (-1 off the frame); avoid: polylines (tiles) with their
// room [{ pts, r }], the highways' and the main line's.
export function planCity3(land, dist, avoid) {
  const mine = (x, y) => CITY_IDS.has(dist(x, y));
  const keeps = [];
  for (const c of CITY3) for (const k of c.keep || []) keeps.push(k);
  const inKeep = (x, y) => keeps.some(([x0, y0, x1, y1]) => x > x0 + 2 && x < x1 - 2 && y > y0 + 2 && y < y1 - 2);
  const isAveY = new Map(AVE_Y.map((A) => [A[0], A])), isAveX = new Map(AVE_X.map((A) => [A[0], A]));
  // each coordinate's spans: east-west lines by row, north-south by column
  const H = new Map(), V = new Map();
  const add = (M, k, a, b) => { if (!M.has(k)) M.set(k, []); M.get(k).push([a, b]); };
  for (const [y] of AVE_Y) add(H, y, 0, 1e5);
  for (const [x] of AVE_X) add(V, x, 0, 1e5);
  // fixed lines (the rect's edges and the avenues through it), and between them the district's own at its spacing
  const cuts = (a, b, aves, pitch) => {
    const fixed = [a, b, ...aves.filter((v) => v > a + 8 && v < b - 8)].sort((p, q) => p - q);
    const out = new Set(fixed);
    for (let j = 0; j + 1 < fixed.length; j++) {
      const p = fixed[j], q = fixed[j + 1], n = Math.max(1, Math.round((q - p) / pitch));
      for (let k = 1; k < n; k++) out.add(p + Math.round((k * (q - p)) / n));
    }
    return [...out].sort((p, q) => p - q);
  };
  for (const c of CITY3) {
    if (c.hand) continue;   // (a handcrafted district lays its own streets: shared/world3-hand.js)
    const P = PITCH[DISTRICTS[c.d].style];
    for (const [x0, y0, x1, y1] of c.rects) {
      const ys = P ? cuts(y0, y1, AVE_Y.map((A) => A[0]), P[1]) : [y0, y1];
      const xs = P ? cuts(x0, x1, AVE_X.map((A) => A[0]), P[0]) : [x0, x1];
      for (const y of ys) add(H, y, x0, x1);
      for (const x of xs) add(V, x, y0, y1);
    }
    for (const [x0, y0, x1, y1] of c.keep || []) { add(H, y0, x0, x1); add(H, y1, x0, x1); add(V, x0, y0, y1); add(V, x1, y0, y1); }
  }
  // the spans of a coordinate merged; a district street within 10 tiles of an avenue goes (the avenue serves)
  const merge = (S) => { S.sort((p, q) => p[0] - q[0]); const out = []; for (const s of S) { const l = out[out.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else out.push(s.slice()); } return out; };
  const dropNear = (M, aves) => { for (const k of [...M.keys()]) if (!aves.has(k) && [...aves.keys()].some((a) => Math.abs(a - k) < 10)) M.delete(k); };
  dropNear(H, isAveY); dropNear(V, isAveX);
  for (const [k, S] of H) H.set(k, merge(S));
  for (const [k, S] of V) V.set(k, merge(S));
  // one stretch between crossings, tested: on land with its pavements, by the city's districts, off the keeps, not
  // along a highway or the main line
  const along = (pts) => {
    let n = 0, near = 0;
    for (const [x, y, ux, uy] of pts) {
      n++;
      for (const A of avoid) {
        if (A.box && (x < A.box[0] - A.r || y < A.box[1] - A.r || x > A.box[2] + A.r || y > A.box[3] + A.r)) continue;
        const s = nearSeg(A.pts, x, y);
        if (s.d < A.r && Math.abs(s.ux * ux + s.uy * uy) > 0.7) { near++; break; }
      }
    }
    return n && near / n >= 0.4;
  };
  const okStretch = (horiz, c, a, b, half) => {
    const pts = [];
    for (let u = a; u <= b; u += 2) pts.push(horiz ? [u, c, 1, 0] : [c, u, 0, 1]);
    for (const [x, y] of pts) for (let o = -half; o <= half; o += 2) { const tx = horiz ? x : x + o, ty = horiz ? y + o : y; if (!land(tx, ty)) return false; }
    const mx = horiz ? (a + b) >> 1 : c, my = horiz ? c : (a + b) >> 1;
    if (inKeep(mx, my)) return false;
    if (handPlanAt(mx, my)) return false;   // (inside a handcrafted district: its own plan's)
    const side = half + 3;
    let by = 0;
    for (const [x, y] of pts) if (horiz ? mine(x, y - side) || mine(x, y + side) || mine(x, y) : mine(x - side, y) || mine(x + side, y) || mine(x, y)) by++;
    if (by < pts.length * 0.6) return false;
    // (crossing the main line only where it runs below ground: cityRailUnder)
    for (const [x, y] of pts) if (nearSeg(MAIN_LOOP3.pts, x, y).d < 4 && !cityRailUnder(x, y)) return false;
    return !along(pts);
  };
  const kept = { h: new Map(), v: new Map() };
  const roads = avoid.filter((A) => A.road);
  const onRoad = (x, y) => roads.some((A) => nearSeg(A.pts, x, y).d <= ON_ROAD);
  // (the handcrafted districts' streets: a grid street that ends on one is met there)
  const handLines = HAND_PLANS.flatMap((P) => P.streets().filter((s) => s.kind !== 'alley').map((s) => s.pts));
  const onHand = (x, y) => handLines.some((pts) => nearSeg(pts, x, y).d <= 8);
  const crossings = (M, c, a, b) => { const out = []; for (const [k, S] of M) if (k > a && k < b && S.some(([p, q]) => c >= p && c <= q)) out.push(k); return out.sort((p, q) => p - q); };
  for (const [horiz, M, O, out, aves] of [[true, H, V, kept.h, isAveY], [false, V, H, kept.v, isAveX]]) {
    for (const [c, S] of M) {
      const kind = aves.has(c) ? aves.get(c)[1] : 'st';
      const segs = [];
      for (const [a, b] of S) {
        const xs = [a, ...crossings(O, c, a, b), b];
        for (let j = 0; j + 1 < xs.length; j++) if (xs[j + 1] - xs[j] >= 4 && okStretch(horiz, c, xs[j], xs[j + 1], HALF[kind])) segs.push([xs[j], xs[j + 1]]);
      }
      if (segs.length) out.set(c, { kind, segs });
    }
  }
  // dead ends trimmed: a stretch whose end no other street meets goes, three times over (a coast's stubs, a district's
  // loose ends); an avenue's last stretch stays when it is long (it reaches a shore: a bridge may land there)
  for (let it = 0; it < 3; it++) {
    const deg = new Map(), key = (x, y) => x * 100000 + y;
    const bump = (x, y) => deg.set(key(x, y), (deg.get(key(x, y)) || 0) + 1);
    // a node's degree: every stretch end there, and a stretch passing straight through counts twice
    for (const [y, L] of kept.h) for (const [a, b] of L.segs) { bump(a, y); bump(b, y); }
    for (const [x, L] of kept.v) for (const [a, b] of L.segs) { bump(x, a); bump(x, b); }
    // (an end on a country road is met by it)
    for (const k of [...deg.keys()]) { const x = Math.floor(k / 100000), y = k - x * 100000; if ((y < COUNTRY_Y + ON_ROAD && onRoad(x, y)) || onHand(x, y)) deg.set(k, deg.get(k) + 1); }
    let cut = 0;
    for (const [horiz, M] of [[true, kept.h], [false, kept.v]]) for (const [c, L] of M) {
      L.segs = L.segs.filter(([a, b]) => {
        const ea = horiz ? deg.get(key(a, c)) : deg.get(key(c, a)), eb = horiz ? deg.get(key(b, c)) : deg.get(key(c, b));
        const loose = ea === 1 || eb === 1;
        if (!loose) return true;
        if (L.kind !== 'st' && b - a >= 40 && !(ea === 1 && eb === 1)) return true;
        cut++; return false;
      });
      if (!L.segs.length) M.delete(c);
    }
    if (!cut) break;
  }
  // the runs: stretches end to end merged into one line each
  const runs = { h: [], v: [] };
  for (const [horiz, M, out, aves] of [[true, kept.h, runs.h, isAveY], [false, kept.v, runs.v, isAveX]]) {
    for (const [c, L] of [...M].sort((p, q) => p[0] - q[0])) {
      const S = L.segs.sort((p, q) => p[0] - q[0]), R = [];
      for (const s of S) { const l = R[R.length - 1]; if (l && s[0] === l[1]) l[1] = s[1]; else R.push(s.slice()); }
      for (const [a, b] of R) out.push({ c, a, b, kind: L.kind, ave: aves.get(c) || null });
    }
  }
  // service alleys through the dense districts' long blocks: north-south, mid-block, between two east-west streets
  // that both run there, every other block (by where it is)
  const alleys = [];
  const hAt = (y, x) => (kept.h.get(y)?.segs || []).some(([a, b]) => x > a && x < b);
  const rowsY = [...kept.h.keys()].sort((p, q) => p - q), colsX = [...kept.v.keys()].sort((p, q) => p - q);
  for (let j = 0; j + 1 < rowsY.length; j++) {
    const y0 = rowsY[j], y1 = rowsY[j + 1];
    if (y1 - y0 > 60) continue;
    for (let k = 0; k + 1 < colsX.length; k++) {
      const x0 = colsX[k], x1 = colsX[k + 1];
      if (x1 - x0 < 50 || x1 - x0 > 110) continue;
      const x = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
      const st = DISTRICTS[dist(x, my)]?.style;
      if (!ALLEYS.has(st) || ((x0 * 7 + y0 * 13) >> 3) % 2) continue;
      if (!hAt(y0, x) || !hAt(y1, x)) continue;
      let dry = true;
      for (let y = y0; y <= y1 && dry; y += 2) for (let o = -3; o <= 3; o++) if (!land(x + o, y) || inKeep(x, y)) { dry = false; break; }
      if (dry) alleys.push({ c: x, a: y0, b: y1, kind: 'alley' });
    }
  }
  return { h: runs.h, v: runs.v, alleys };
}

// The avoid list (tiles) from the build's lines: the highways (any level) and their ramps; else the traced
// HIGHWAYS3. The main line always (it is laid later, from the rails hook).
export function avoidOf(lines) {
  const out = [];
  const hw = (lines || []).filter((l) => l.kind === 'hwy' || l.kind === 'ramp');
  if (hw.length) for (const l of hw) out.push({ pts: l.pts.map((p) => [p.x / TILE, p.y / TILE]), r: ROOM_HWY });
  else for (const h of HIGHWAYS3) out.push({ pts: h.pts, r: ROOM_HWY });
  out.push({ pts: MAIN_LOOP3.pts, r: ROOM_RAIL });
  for (const l of lines || []) if (l.kind === 'art' && !l.city && !l.foot && l.pts.every((p) => p.y / TILE < COUNTRY_Y)) {
    const pts = l.pts.map((p) => [p.x / TILE, p.y / TILE]), box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) { box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y); }
    out.push({ pts, r: ROOM_ROAD, road: true, box });
  }
  return out;
}

// The streets laid into the build's lines (px, the generator's form), in the `lines` hook after the skeleton's roads:
// the plan above, then each bridge's end on the city's land met by a straight stub to the nearest street.
export function layCity3(lines, m) {
  const W = m.w, Hh = m.h;
  const land = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && !!m.land[y * W + x] && !(m.river && m.river[y * W + x]);
  const dist = (x, y) => (x >= 0 && y >= 0 && x < W && y < Hh && m.land[y * W + x] ? m.dist[y * W + x] : -1);
  const plan = planCity3(land, dist, avoidOf(lines));
  const C = (v) => (v + 0.5) * TILE;
  const out = { avenues: 0, streets: 0, alleys: 0, len: 0, bridges: [] };
  const push = (pts, kind, name) => { lines.push({ pts, kind, lvl: 0, name, city: true }); };
  let ns = 0, ew = 0;
  for (const r of plan.h) {
    const name = r.ave ? nameOf(r.ave, (r.a + r.b) >> 1) : `${ORD[ew++ % ORD.length]} Street`;
    push([{ x: C(r.a), y: C(r.c) }, { x: C(r.b), y: C(r.c) }], r.kind, name);
    if (r.ave) out.avenues++; else out.streets++;
    out.len += r.b - r.a;
  }
  for (const r of plan.v) {
    const name = r.ave ? nameOf(r.ave, (r.a + r.b) >> 1) : `${NS[ns++ % NS.length]} Street`;
    push([{ x: C(r.c), y: C(r.a) }, { x: C(r.c), y: C(r.b) }], r.kind, name);
    if (r.ave) out.avenues++; else out.streets++;
    out.len += r.b - r.a;
  }
  for (const r of plan.alleys) { push([{ x: C(r.c), y: C(r.a) }, { x: C(r.c), y: C(r.b) }], 'alley', 'Alley'); out.alleys++; }
  out.hand = handStreets(lines);   // (the handcrafted districts' own streets: shared/world3-hand.js)
  // the bridges: an arterial (or a footbridge: its narrow lane) whose points cross the water and whose end is on a city
  // district - a stub, east-west or north-south, from its end to the nearest of the city's streets within 60 tiles (none:
  // the generator's repair; a footbridge's lane reaches only 22 tiles, so one landing mid-block - the Gulf Footbridge -
  // was left off the network without its stub)
  const wet = (x, y) => { const tx = Math.floor(x), ty = Math.floor(y); return !(tx >= 0 && ty >= 0 && tx < W && ty < Hh) || !m.land[ty * W + tx]; };
  for (const l of lines) {
    if ((l.kind !== 'art' && !l.foot) || l.city) continue;
    let over = false;   // (over the water somewhere along it: sampled a tile apart between its points)
    for (let j = 1; j < l.pts.length && !over; j++) {
      const p = l.pts[j - 1], q = l.pts[j], n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / TILE);
      for (let k = 0; k <= n && !over; k++) over = wet((p.x + (q.x - p.x) * k / (n || 1)) / TILE, (p.y + (q.y - p.y) * k / (n || 1)) / TILE);
    }
    if (!over) continue;
    for (const e of [l.pts[0], l.pts[l.pts.length - 1]]) {
      const ex = e.x / TILE, ey = e.y / TILE;
      if (!CITY_IDS.has(dist(Math.floor(ex), Math.floor(ey)))) continue;
      let best = null;
      for (const r of plan.h) if (ex >= r.a && ex <= r.b && Math.abs(ey - r.c) < 60 && (!best || Math.abs(ey - r.c) < best.d)) best = { d: Math.abs(ey - r.c), to: { x: e.x, y: C(r.c) } };
      for (const r of plan.v) if (ey >= r.a && ey <= r.b && Math.abs(ex - r.c) < 60 && (!best || Math.abs(ex - r.c) < best.d)) best = { d: Math.abs(ex - r.c), to: { x: C(r.c), y: e.y } };
      if (!best || best.d < 1) { out.bridges.push({ name: l.name, met: !!best }); continue; }
      if (l.foot) lines.push({ pts: [{ x: e.x, y: e.y }, best.to], kind: l.kind, lvl: 0, name: l.name, city: true, foot: true });
      else push([{ x: e.x, y: e.y }, best.to], 'ave', l.name);
      out.bridges.push({ name: l.name, met: true, stub: Math.round(best.d) });
    }
  }
  return out;
}
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', '13th', '14th', '15th', '16th', '17th', '18th', '19th', '20th', '21st', '22nd', '23rd', '24th'];
const NS = ['Elm', 'Oak', 'Maple', 'Cedar', 'Birch', 'Walnut', 'Spruce', 'Chestnut', 'Willow', 'Ash', 'Hawthorn', 'Juniper', 'Linden', 'Magnolia', 'Poplar', 'Sycamore', 'Alder', 'Hazel', 'Laurel', 'Rowan'];
