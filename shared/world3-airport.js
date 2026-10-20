// World v3, handcrafted: Westport International (district 27), from the owner's concepts Airport-A1 (WC415: the
// terminal across the top with its central glass hall and the tower behind, the planes at the gates beyond it; in front
// the terminal road, the parking garage, the surface lots with their palms and covered walkways, the rental lots, a
// motel with its pool, the round neon diner, a fenced storage yard, a pond in the reeds, pines along the highway),
// I5-A/B (the terminal's glass front with WESTPORT INTERNATIONAL across it, the jet bridge to an airliner being
// serviced - the belt loader, the tug, baggage carts, the fuel truck, cones - the hangar with a light plane, the tower,
// the windsock, the runway's lights), WC309 (cargo sheds and their trucks, the maintenance and aviation hangars, light
// planes on the apron, the fuel tanks, the hotel and the diner on the approach, the rental-car lots, the airport sign),
// WC310 (the multi-level car park, the fuel farm, the radio mast, the pond with its boardwalk) and WC041 (the terminal's
// taxi rank and car park; the airport's own station):
//   - the field: the north-south runway (its thresholds, approach lights and windsock), the parallel taxiway with its
//     exits, the apron the length of the terminal and the cargo apron east of it, the security fence round the airside;
//   - the terminal facing south onto Terminal Drive: the West Concourse (Departures), the Main Hall (its glass vault,
//     the airport's place) and the East Concourse (Arrivals); six gates on the apron behind with their jet bridges,
//     four airliners at them and their ground crews' kit; the control tower and Airport Operations; the forecourt -
//     the drop-off canopies, the taxi rank, the bus stop, the Yellow Line's kiosk;
//   - landside: the Terminal Parking garage and the short-term lot with its covered walkways, the Skyview Hotel, the
//     ground transportation centre; south of Hangar Road the general-aviation hangars, their apron of light planes and
//     the fuel farm; the Car Rental Center on Cargo Road, Economy Parking, the cargo sheds and their truck yards;
//   - on the approach (Cargo Road to Bayside Avenue): the Runway Diner, the Jetway Motor Inn, Approach Fuel; Skyport
//     Drive's business park, the self storage and its RV yard; the pond in the reeds, the woods under the West Loop;
//     the Runway End Overlook west of the runway's south end, where people watch the planes come in.
// The Search & Rescue HQ east of the terminal's apron is world3-sarhq.js's (its spot is left open: paved, no props).
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 27;   // Westport International (shared/mapcore.js DISTRICTS)
export const AP_NAME = 'Westport International';
// (the plan's lines, frame tiles: the grid's Spruce Street on the west, 22nd Street on the north, Marsh Road on the
// south - Oak Street and Westport Avenue meet it from the south - Bayside Avenue on the east at Cargo Road)
export const AX = { spruce: 1440, runway: 1474, taxi: 1494, west: 1512, blvd: 1690, skyway: 1780, bend: 1900, skyEnd: 2052, bayside: 2090 };
export const AY = { north: 2600, drive: 2689, cargo: 2730, hangar: 2768, skyport: 2810, marsh: 2860 };
const EXT = { ave: 7, blvd: 7, st: 6 };   // (a street's first free row either side of its centre line, c - EXT and c + EXT)
const N = (c, k) => c - EXT[k] + 1, S = (c, k) => c + EXT[k];   // (the band north of / west of a street ends before N; south / east of it starts at S)
const RECT = [AX.spruce, AY.north, AX.bayside, AY.marsh];
// The field (frame tiles), as shared/world3-city.js CITY_AIRPORT hands it to the generator: the runway and the taxiway
// (flying: shared/flight.js airfields), the apron and the terminal, the hangars; `planes`: the general-aviation stands
// where a flyable plane waits (its spot 150 px south of each - flight.js aprons).
export const FIELD = {
  runway: [AX.runway, 2626, 14, 210], taxi: [AX.taxi, 2626, 5, 210], apron: [1499, 2608, 370, 50], terminal: [1520, 2658, 132, 20],
  hangars: [[1504, 2776, 22, 15], [1530, 2776, 22, 15], [1556, 2776, 22, 15], [1582, 2776, 22, 15]],
  planes: [[1516, 2802], [1540, 2802], [1564, 2802]], poiAt: [1586, 2680],
};
// the SAR HQ's spot (world3-sarhq.js SAR_HQ: at [1700, 2650], 34 x 28): kept open and paved
const SAR = [1700, 2650, 1734, 2678];
// the terminal: its three halls (x0, x1), its back row and its front (the forecourt's first row)
const TERM = { x0: 1520, wx: 1562, ex: 1610, x1: 1652, back: 2658, cback: 2662, front: 2678 };
const OPS_Y = TERM.front - 11;   // (Airport Operations' back row)
// the gates: x, the stand's name, a plane at it, the hall's back wall it's on (c: a concourse's, h: the main hall's)
const GATES = [[1527, 'A1', 1, 'c'], [1541, 'A2', 1, 'c'], [1555, 'A3', 0, 'c'], [1586, 'B1', 1, 'h'], [1617, 'C1', 1, 'c'], [1631, 'C2', 0, 'c'], [1645, 'C3', 1, 'c']];
const PALM = ['royal', 'coconut', 'royal', 'fanSkirt'];

export const AIRPORT = {
  key: 'airport', d: D, rect: RECT,
  streets: () => [
    { name: 'Terminal Drive', kind: 'ave', pts: [[AX.west, AY.drive], [AX.bend, AY.drive], [AX.bend, AY.cargo]], culdesac: true },
    { name: 'Airport Boulevard', kind: 'blvd', pts: [[AX.blvd, AY.marsh], [AX.blvd, AY.drive]] },
    { name: 'Cargo Road', kind: 'ave', pts: [[AX.blvd, AY.cargo], [AX.bayside, AY.cargo]] },
    { name: 'Hangar Road', kind: 'st', pts: [[AX.west, AY.hangar], [AX.blvd, AY.hangar]], culdesac: true },
    { name: 'Skyway Drive', kind: 'st', pts: [[AX.skyway, AY.cargo], [AX.skyway, AY.marsh]] },
    { name: 'Skyport Drive', kind: 'st', pts: [[AX.skyway, AY.skyport], [AX.skyEnd, AY.skyport]], culdesac: true },
  ],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, planes: 0, gates: 0, bays: 0 };
  const { place, tower } = towerKit(K, out);
  const W = m.w;
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[y * W + x] : -1);
  const wet = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  const places = (out.places = []);
  const placeName = (name, x0, y0, x1, y1) => places.push({ name, x0, y0, x1, y1 });
  const inSar = (x, y) => x >= SAR[0] - 1 && x < SAR[2] + 1 && y >= SAR[1] - 1 && y < SAR[3] + 1;
  // a run of chain-link along a line (tiles), in pieces; gaps [[a, b]] along it left open (the gates); barbed on the airside
  const fence = (x0, y0, x1, y1, gaps = [], barbed = true) => {
    const horiz = y0 === y1, a0 = horiz ? x0 : y0, a1 = horiz ? x1 : y1, n = Math.max(1, Math.round((a1 - a0) / 12));
    for (let k = 0; k < n; k++) {
      const a = a0 + ((a1 - a0) * k) / n, b = a0 + ((a1 - a0) * (k + 1)) / n;
      if (gaps.some(([g0, g1]) => b > g0 && a < g1)) continue;
      if (horiz) prop('chainfence', a, y0, 0, { tx: Math.round((b - a) * TILE), ty: 0, ...(barbed ? { barbed: 1 } : {}) });
      else prop('chainfence', x0, a, 0, { tx: 0, ty: Math.round((b - a) * TILE), ...(barbed ? { barbed: 1 } : {}) });
    }
  };
  // parked cars in a lot: bays in double rows (nose to nose, a drive aisle between pairs), across [x0, x1) from y0 down
  // while a pair fits above y1; skip(x, y): a bay left out (an island, a walkway). The bays are painted from m.parking.
  const bays = (x0, y0, x1, y1, o = {}) => {
    const rows = [];
    for (let ry = y0; ry + 7 <= y1; ry += 13) rows.push(ry);
    for (const ry of rows) for (const half of [0, 1]) {
      const cy = ry + 1.7 + half * 3.5;
      for (let sx = x0; sx + 2 <= x1; sx += 2) {
        if (o.skip && o.skip(sx, ry)) continue;
        if ([0, 1].some((dx) => [-1, 0, 1].some((dyy) => tile(sx + dx, Math.floor(cy) + dyy) !== T.LOT))) continue;   // (paved bays only: not on a road's curve)
        m.parking.push({ x: (sx + 1) * TILE, y: cy * TILE, a: half ? Math.PI / 2 : -Math.PI / 2, ...(o.sparse ? { sparse: true } : {}), ...(o.model ? { model: o.model } : {}) });
        out.bays++;
      }
    }
    return rows;
  };
  // a lot's planted islands at the row ends (a palm in each, flowers round it) and its light masts
  const islands = (xs, rows, o = {}) => {
    for (const ry of rows) for (const ix of xs) {
      K.paint(ix, ry, 2, 7, T.GRASS);
      prop('palm_a', ix + 1, ry + 3.5, 10, { sp: pick(PALM, rnd(ix, ry, 31)), k: 1.1 + rnd(ix, ry, 32) * 0.3 });
      prop('flowers_a', ix + 1, ry + 6.2, 0);
      if (o.masts && rnd(ix, ry, 33) < 0.5) prop('ymast', ix + 1, ry + 0.8, 0, { tall: 150 });
    }
  };
  // the covered walkway through a lot: a canopy every few tiles down a paved path (Airport-A1)
  const walkway = (x, y0, y1) => {
    K.paint(x - 1, y0, 3, y1 - y0, T.PLAZA);
    for (let y = y0 + 3; y < y1 - 2; y += 6) prop('canopy', x + 0.5, y, 0, { w: 70, d: 150, h: 46 });
  };

  // ---- the old Yellow Line plaza (laid by the generator by 22nd Street, where the apron goes) back to grass: the
  // line's kiosk stands on the terminal's forecourt instead (forecourt, below)
  for (const pl of (m.subwayPlazas || []).filter((q) => q.name === AP_NAME)) {
    for (let y = pl.y; y < pl.y + pl.h; y++) for (let x = pl.x; x < pl.x + pl.w; x++) { const i = y * W + x; if (m.tiles[i] === T.PLAZA) m.tiles[i] = T.GRASS; m.reserve[i] &= ~16; }
  }
  m.subwayPlazas = (m.subwayPlazas || []).filter((q) => q.name !== AP_NAME);
  // (under the West Loop's deck: nothing built or planted - its grass kept)
  for (let y = RECT[1]; y < RECT[3]; y++) for (let x = RECT[0]; x < RECT[2]; x++) if (m.deck && m.deck[y * W + x] && K.free(x, y)) K.take(x, y, 1, 1);

  terminal();
  gates();
  apronKit();
  towerOps();
  cargo();
  garageBlock();
  aviation();
  rentals();
  economy();
  approach();
  skyport();
  field();
  overlook();
  register();
  // what the plan left open: lawn with palms by the lots and the roads, pines and oaks further out
  K.landscape({ bare: 0.35, tree: (x, y, r) => {
    if (inSar(x, y)) return null;
    const nearLot = [[-4, 0], [4, 0], [0, -4], [0, 4]].some(([dx, dy]) => tile(x + dx, y + dy) === T.LOT || tile(x + dx, y + dy) === T.ROAD);
    if (nearLot) return r < 0.8 ? ['palm_a', pick(PALM, rnd(x, y, 841)), 1.1 + rnd(x, y, 842) * 0.3] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 843)), null, 1];
    return r < 0.7 ? [rnd(x, y, 844) < 0.5 ? 'tree_a' : 'tree_b', pick(['whitePine', 'pondPine', 'oak', 'whitePine', 'maple'], rnd(x, y, 845)), 1.05 + rnd(x, y, 846) * 0.25] : [pick(['shrub_a', 'bush_c'], rnd(x, y, 847)), null, 1];
  } });
  void api;
  return out;

  // ===========================================================================================================
  // The terminal: three halls in a row facing Terminal Drive, the forecourt along their fronts
  function terminal() {
    const glass = (o) => ({
      spec: { floors: o.floors, style: 'glass', wallColor: o.tint || '#2e5670', win: 'tall', parapet: o.parapet ?? 10, grime: 0.03, roofMat: o.roofMat || 'membrane', lip: 10, rimW: 5, blades: [], plaques: [], ...(o.spec || {}) },
      shop: { kind: 'lobby', door: o.door || 'mid', open: true, people: o.people ?? 6, awning: null, sign: { text: o.sign, bg: '#1e2a4e', fg: [236, 236, 230], lit: true } },
      kit: o.kit || [],
    });
    const hall = K.building({ x: TERM.wx, y: TERM.back, w: TERM.ex - TERM.wx, h: TERM.front - TERM.back, arch: 'terminal', key: 'hotel', name: AP_NAME, poi: { kind: 'airport', label: AP_NAME }, whole: true, door: Math.round((TERM.wx + TERM.ex) / 2),
      art: glass({ floors: 3, sign: 'DEPARTURES - ARRIVALS', people: 8, tint: '#36606e', spec: { pitch: 'gable', roof: 'glass', slope: 0.42, parapet: 4,
        plaques: [{ text: 'WESTPORT INTERNATIONAL', x: Math.round(((TERM.ex - TERM.wx) * TILE - 348) / 2), v: 118, sx: 4, bg: '#1e2a4e', fg: [236, 236, 230], lit: true }] } }) });
    const west = K.building({ x: TERM.x0, y: TERM.cback, w: TERM.wx - TERM.x0, h: TERM.front - TERM.cback, arch: 'terminal', key: 'hotel', name: 'West Concourse', poi: false, whole: true, door: TERM.x0 + 12,
      art: glass({ floors: 2, sign: 'DEPARTURES', kit: [['ac', 60, 40], ['ac', 160, 50], ['sky', 300, 80], ['sky', 420, 80], ['ac', 640, 40], ['vent', 900, 60], ['ac', 1100, 50], ['plant', 1240, 120]] }) });
    const east = K.building({ x: TERM.ex, y: TERM.cback, w: TERM.x1 - TERM.ex, h: TERM.front - TERM.cback, arch: 'terminal', key: 'hotel', name: 'East Concourse', poi: false, whole: true, door: TERM.x1 - 12,
      art: glass({ floors: 2, sign: 'ARRIVALS', kit: [['ac', 80, 40], ['sky', 260, 80], ['sky', 380, 80], ['ac', 560, 50], ['vent', 780, 60], ['ac', 1000, 40], ['hatch', 1180, 100]] }) });
    out.terminal = !!hall; void west; void east;
    // the forecourt: paved from the halls' fronts to Terminal Drive's pavement, the drop-off canopies along it, benches
    // and planters under them, bollards along the kerb, the taxi rank at the arrivals end, the bus stop at departures
    const fy0 = TERM.front, fy1 = N(AY.drive, 'ave');   // [2678, 2683)
    K.fill(TERM.x0 - 4, fy0, TERM.x1 - TERM.x0 + 8, fy1 - fy0, T.PLAZA);
    // (the halls' backs on the apron: the concourses step back from the hall - paved airside)
    // the Yellow Line's kiosk on its plaza at the hall's east door (shared/map.js buildRailway: by the plaza's name)
    const kx = TERM.ex + 16;
    m.subwayPlazas.push({ name: AP_NAME, x: kx, y: fy1 - 4, w: 8, h: 4, south: true, d: 0 });
    const mid = (TERM.wx + TERM.ex) / 2;
    for (let x = TERM.x0 + 4; x < TERM.x1 - 4; x += 14) {
      if ((x + 5 > kx - 1 && x - 5 < kx + 9) || Math.abs(x - mid) < 12) continue;   // (the kiosk; the main doors under the hall's name)
      prop('canopy', x, fy0 + 1.6, 0, { w: 280, d: 84, h: 62 });
      prop('bench_m', x - 2.5, fy0 + 0.9, 0); prop('planter_g', x + 3, fy0 + 0.9, 8);
    }
    for (let x = TERM.x0 - 2; x < TERM.x1 + 2; x += 3) if ((x < kx - 1 || x > kx + 9)) prop('bollard', x + 0.5, fy1 - 0.4, 4);
    prop('textsign', TERM.x1 - 6, fy1 - 1.2, 0, { text: 'TAXI', bg: '#e8c030', fg: [30, 30, 30], z: 30, sx: 1 });
    for (let k = 0; k < 3; k++) m.parking.push({ x: (TERM.x1 - 12 + k * 3.5) * TILE, y: (fy1 + 1.4) * TILE, a: 0, model: 'taxi', kerb: true });
    prop('busstop', TERM.x0 + 6, fy1 - 0.6, 0);
    prop('trashcan', TERM.x0 + 9, fy1 - 0.8, 0); prop('trashcan', TERM.x1 - 9, fy1 - 0.8, 0);
    for (const x of [TERM.x0 - 3, TERM.x1 + 3]) prop('lamp', x, fy1 - 0.6, 0);
    placeName('Westport International Terminal', TERM.x0, TERM.back, TERM.x1, fy1);
  }

  // The gates: a jet bridge from the concourse's back wall to each stand, an airliner nosed in at four of them, its
  // ground crew's kit round it (the belt loader at the hold, a tug and a train of baggage carts, cones at the wingtips)
  function gates() {
    out.stands = [];
    for (const [gx, name, plane, on] of GATES) {
      const wall = on === 'h' ? TERM.back : TERM.cback, by = wall - 2.8;   // (the bridge's middle, north of the wall)
      prop('jetbridge', gx + 1.6, by, 0, { a: -Math.PI / 2, len: 170 });   // (to the plane's front door, its port side: east, nose in to the south)
      const py = wall - 10.6;   // (the plane's middle: its nose at the bridge's cab)
      out.stands.push({ x: gx * TILE, y: py * TILE, a: Math.PI / 2, n: name });
      out.gates++;
      if (!plane) { prop('cone', gx, py + 2, 0); prop('cone', gx, py - 3, 0); continue; }
      prop('plane', gx, py, 40, { a: Math.PI / 2 });
      out.planes++;
      // (the starboard side, west: the belt loader at the forward hold, the tug and its carts behind the wing, the fuel truck)
      prop('beltloader', gx - 2.4, py + 1.6, 0, { a: -Math.PI / 4 });
      prop('tug', gx - 2, py - 6.6, 0, { a: 0 });
      for (let k = 0; k < 3; k++) prop('bagcart', gx - 3.8 - k * 1.4, py - 6.6, 0, { a: 0, c: (k + gx) % 3 });
      for (const [dx, dy] of [[-4.6, -1], [4.6, -1], [0, -5.4]]) prop('cone', gx + dx, py + dy, 0);
      if (rnd(gx, py, 3) < 0.5) m.parking.push({ x: (gx - 5.6) * TILE, y: (py - 1) * TILE, a: -Math.PI / 2, model: 'tanker', bare: true });
    }
    // the ground crews' yard at the west end: carts and tugs waiting, drums, the cone stack
    const gy = TERM.cback;
    for (let k = 0; k < 4; k++) prop('bagcart', TERM.x0 - 10 + (k % 2) * 1.6, gy + 1 + Math.floor(k / 2) * 1.5, 0, { a: 0, c: k % 3 });
    prop('tug', TERM.x0 - 5, gy + 3, 0, { a: Math.PI });
    prop('beltloader', TERM.x0 - 7, gy + 9, 0, { a: 0 });
    for (const [dx, dy] of [[-14, gy - 1], [-13.4, gy - 0.4]]) prop('drum', TERM.x0 + dx, dy, 6);
  }

  // The apron's dressing: the floodlight masts along its north edge, a remote stand with an airliner east of the
  // terminal, the taxi lane's centre line the length of the apron (painted: out.lanes)
  function apronKit() {
    const [ax, ay, aw] = FIELD.apron;
    for (let x = ax + 12; x < ax + aw - 4; x += 34) prop('ymast', x, ay + 0.8, 0, { tall: 150 });
    const rx = TERM.x1 + 26, ry = TERM.cback - 14;
    prop('plane', rx, ry, 40, { a: Math.PI / 2 }); out.planes++;
    out.stands.push({ x: rx * TILE, y: ry * TILE, a: Math.PI / 2, n: 'R1' });
    prop('cone', rx - 4.6, ry - 1, 0); prop('cone', rx + 4.6, ry - 1, 0);
    out.lanes = [[AX.taxi + 2.5, ay + 14, ax + aw - 6, ay + 14]].map((q) => q.map((v) => Math.round(v * TILE)));
  }

  // The control tower and Airport Operations between the terminal's east end and the rescue base
  function towerOps() {
    const ox = TERM.x1 + 8, oy = OPS_Y, ow = SAR[0] - 6 - ox;
    const ops = K.building({ x: ox, y: oy, w: ow, h: TERM.front - oy, arch: 'office', name: 'Airport Operations', poi: { kind: 'delivery', label: 'Westport International Operations' }, whole: true,
      art: tower(ox, oy, { name: 'Airport Operations', sign: 'AIRPORT OPERATIONS', style: 'concrete', wall: '#d8d2c4', floors: 2, win: 'even', cornice: null, signC: ['#1e2a4e', [236, 236, 230]] }) });
    void ops;
    K.fill(TERM.x1, TERM.cback, ox - TERM.x1, TERM.front - TERM.cback, T.PLAZA);
    out.tower = { x: Math.round((TERM.x1 + 4) * TILE), y: Math.round((TERM.cback + 4) * TILE) };
    prop('ctower', TERM.x1 + 4, TERM.cback + 4, 30, { h: 220 });
    prop('radiotower', ox + ow - 3, oy - 3, 8);
  }

  // The cargo sheds facing Terminal Drive east of the rescue base, their truck yards in front; the cargo apron behind
  // them with two freighters at their stands; the airport's utilities in the corner by the bay
  function cargo() {
    const y1 = N(AY.drive, 'ave');   // (the yards run down to the pavement)
    const sheds = [
      { x: SAR[2] + 4, w: 60, name: 'Westport Air Cargo', sign: 'AIR CARGO', wall: '#c8ccd0', roof: '#5a6470' },
      { x: SAR[2] + 70, w: 52, name: 'Bayline Air Freight', sign: 'BAYLINE FREIGHT', wall: '#d8d0c0', roof: '#4a6a7a' },
    ];
    for (const S of sheds) {
      const sy = 2650, sh = 20;
      const b = K.building({ x: S.x, y: sy, w: S.w, h: sh, arch: 'warehouse', key: 'warehouse', name: S.name, poi: { kind: 'delivery', label: S.name }, whole: true,
        art: { spec: { style: 'corrugated', wallColor: S.wall, roofColor: S.roof, grime: 0.12, plaques: [{ text: S.sign, x: 40, v: 60, sx: 2, bg: '#1e3a5e', fg: [250, 250, 240], lit: true }] } } });
      if (!b) continue;
      K.fill(S.x - 2, sy + sh, S.w + 4, y1 - sy - sh, T.LOT);
      // the docks: trucks backed up to the doors, pallets and a forklift between
      for (let k = 0; k < Math.floor(S.w / 12); k++) {
        const dx = S.x + 5 + k * 12;
        m.parking.push({ x: dx * TILE, y: (sy + sh + 4) * TILE, a: Math.PI / 2, model: 'boxtruck', bare: true });
        prop(pick(['pallet', 'pallet_s', 'crates'], rnd(dx, sy, 5)), dx + 4.5, sy + sh + 1.2, 10);
      }
      prop('forklift', S.x + S.w - 6, sy + sh + 2, 18, { a: 0 });
      prop('ymast', S.x + 1, sy + sh + 1, 0, { tall: 150 }); prop('ymast', S.x + S.w - 1, sy + sh + 1, 0, { tall: 150 });
      prop('textsign', S.x + 6, y1 - 1, 0, { text: S.name.toUpperCase().slice(0, 22), bg: '#1e3a5e', fg: [250, 250, 240], z: 34, sx: 1 });
      placeName(S.name, S.x, sy, S.x + S.w, y1);
    }
    // the cargo apron: freighters at their stands, containers on dollies, a forklift
    for (const [px, n] of [[1775, 'F1'], [1838, 'F2']]) {
      prop('plane', px, 2636, 40, { a: Math.PI / 2 });
      out.stands.push({ x: px * TILE, y: 2636 * TILE, a: Math.PI / 2, n });
      out.planes++;
      for (let k = 0; k < 3; k++) prop('container', px + 9, 2631 + k * 2.4, 14, { a: 0, c: (k + px) % 5 });
      prop('forklift', px + 9, 2640, 18, { a: Math.PI });
    }
    // the utilities in the corner: the water tower, the radio mast, the plant house
    const ux = SAR[2] + 128;
    if (K.allFree(ux, 2654, 12, 8)) K.building({ x: ux, y: 2654, w: 12, h: 8, arch: 'block', name: 'Airport Utilities', poi: false, whole: true, art: { spec: { style: 'concrete', wallColor: '#c8c2b4', height: 46, roof: 'flat' }, noShop: true } });
    prop('watertower', ux + 16, 2652, 14, { h: 110 });
    prop('otank', ux + 4, 2668, 22);
  }

  // South of Terminal Drive, west of the boulevard: the parking garage across from the main hall, the short-term lot
  // with its covered walkways, the Skyview Hotel and the ground transportation centre on Hangar Road
  function garageBlock() {
    const y0 = S(AY.drive, 'ave'), y1 = N(AY.hangar, 'st');   // [2696, 2763)
    const gx0 = TERM.wx - 6, gx1 = TERM.ex + 4;
    // the garage: five decks of concrete, its sign over the entry ramp
    const gb = K.building({ x: gx0, y: y0, w: gx1 - gx0, h: 28, arch: 'block', name: 'Terminal Parking', poi: false, whole: true,
      art: tower(gx0, y0, { name: 'Terminal Parking', sign: 'PARKING', roofMat: 'parking', style: 'concrete', wall: '#b8b4aa', floors: 5, win: 'loft', cornice: null, signC: ['#1e3a5e', [250, 250, 240]], store: 'lobby' }) });
    if (gb) placeName('Terminal Parking', gx0, y0, gx1, y0 + 28);
    // the ground transportation centre below it, on Hangar Road: the shuttle buses' bays in front
    const tx0 = gx0 + 6, tw = gx1 - gx0 - 12;
    const gt = K.building({ x: tx0, y: y1 - 14, w: tw, h: 8, arch: 'office', name: 'Ground Transportation Center', poi: { kind: 'delivery', label: 'Ground Transportation Center' }, whole: true,
      art: tower(tx0, y1 - 14, { name: 'Ground Transportation', sign: 'SHUTTLES & BUSES', style: 'glass', floors: 1, tint: '#2a4a6a', signC: ['#1e2a4e', [236, 236, 230]], awning: ['#1e3a5e', '#f0ece4'] }) });
    if (gt) {
      K.fill(gx0, y1 - 6, gx1 - gx0, 6, T.LOT);
      for (let k = 0; k < 3; k++) m.parking.push({ x: (tx0 + 6 + k * 14) * TILE, y: (y1 - 3) * TILE, a: 0, model: 'bus', bare: true });
      for (const sx of [tx0 + 2, tx0 + tw - 2]) prop('busstop', sx, y1 - 5.6, 0);
    }
    K.fill(gx0, y0 + 28, gx1 - gx0, y1 - 14 - y0 - 28, T.PLAZA);
    for (let x = gx0 + 3; x < gx1 - 2; x += 8) prop('palm_a', x, y0 + 30, 10, { sp: pick(PALM, rnd(x, y0, 41)), k: 1.2 });
    // the short-term lot between the garage and the boulevard: the bays, the islands with their palms, two covered walkways
    // back to the terminal's crossings, the booth at the exit, the sign
    const lx0 = gx1 + 2, lx1 = N(AX.blvd, 'blvd') - 1;
    K.building({ x: lx1 - 6, y: y1 - 4, w: 3, h: 2, arch: 'hut', name: 'Parking Booth', poi: false, whole: true, art: { spec: { style: 'stucco', wallColor: '#e8e4da', height: 34, roof: 'flat' }, noShop: true } });
    K.fill(lx0, y0, lx1 - lx0, y1 - y0, T.LOT); K.take(lx0, y0, lx1 - lx0, y1 - y0);
    const wA = lx0 + 16, wB = lx0 + 40;
    const rows = bays(lx0 + 2, y0 + 2, lx1 - 2, y1 - 2, { skip: (sx) => Math.abs(sx + 1 - wA) < 3 || Math.abs(sx + 1 - wB) < 3 || sx === lx0 + 28 || sx === lx0 + 2 });
    islands([lx0 + 2, lx0 + 28], rows, { masts: true });
    walkway(wA, y0, y1 - 1); walkway(wB, y0, y1 - 1);
    prop('ygate', lx1 - 2, y1 - 1, 0, { a: 0 });
    prop('textsign', lx0 + 4, y1 - 1, 0, { text: 'SHORT-TERM PARKING', bg: '#1e3a5e', fg: [250, 250, 240], z: 36, sx: 1 });
    placeName('Short-Term Parking', lx0, y0, lx1, y1);
    // the Skyview Hotel at the west end, its front on Hangar Road: the glass tower, the porte-cochere, its car park
    // behind on Terminal Drive, the pool beside it
    const hx0 = AX.west - 8, hx1 = gx0 - 3;
    const hw = Math.min(30, hx1 - hx0 - 2), hy = y1 - 22;
    const hotel = K.building({ x: hx0 + 1, y: hy, w: hw, h: 18, arch: 'hotel', key: 'hotel', name: 'Skyview Hotel', poi: { kind: 'delivery', label: 'Skyview Hotel' }, whole: true, door: hx0 + 1 + (hw >> 1),
      art: tower(hx0 + 1, hy, { name: 'Skyview Hotel', sign: 'SKYVIEW HOTEL', style: 'glass', tint: '#2a4a6a', floors: 9, signC: ['#16202c', [240, 236, 220]], awning: null, door: 'mid' }) });
    if (hotel) {
      out.shops++;
      K.fill(hx0, hy + 18, hx1 - hx0, y1 - hy - 18, T.PLAZA);
      prop('canopy', hx0 + 1 + hw / 2, hy + 19.6, 0, { w: 220, d: 70, h: 58 });
      for (const dx of [-6, 6]) prop('palm_a', hx0 + 1 + hw / 2 + dx, y1 - 1, 10, { sp: 'royal', k: 1.3 });
      K.fill(hx0, y0, hx1 - hx0, hy - y0 - 1, T.LOT); K.take(hx0, y0, hx1 - hx0, hy - y0 - 1);
      bays(hx0 + 2, y0 + 1, hx1 - 2, hy - 2, {});
      // the pool on the hotel's sunny side
      const px0 = hx0 + hw + 3, pw = hx1 - px0 - 2;
      if (pw >= 6) {
        K.fill(px0 - 1, hy + 2, pw + 2, 12, T.PLAZA);
        for (let yy = hy + 4; yy < hy + 11; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
        (m.pools ||= []).push({ x: px0 * TILE, y: (hy + 4) * TILE, w: pw * TILE, h: 7 * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (hy + 3) * TILE, w: (pw + 2) * TILE, h: 9 * TILE } });
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, hy + 12.4, 0, { v: k, a: -Math.PI / 2 });
        prop('umbrella_b', px0 + 1, hy + 2.8, 0);
      }
      placeName('Skyview Hotel', hx0, y0, hx1, y1);
    }
  }

  // South of Hangar Road: the general-aviation hangars facing their apron, the light planes tied down on it, the fuel
  // farm by the boulevard
  function aviation() {
    const y0 = S(AY.hangar, 'st'), y1 = N(AY.marsh, 'ave');   // [2774, 2854)
    const HG = [
      { name: 'Westport Aviation', wall: '#6a7a8a', sign: 'WESTPORT AVIATION' },
      { name: 'Gulf Air Maintenance', wall: '#8a9098', sign: 'MAINTENANCE' },
      { name: 'Coastal Air Charter', wall: '#7a8a7a', sign: 'COASTAL AIR' },
      { name: 'Westport Flight School', wall: '#9a8a74', sign: 'FLIGHT SCHOOL' },
    ];
    FIELD.hangars.forEach(([hx, , hw, hh], k) => {
      const H = HG[k];
      const b = K.building({ x: hx, y: y0 + 1, w: hw, h: hh, arch: 'hangar', key: 'warehouse', name: H.name, poi: { kind: 'delivery', label: H.name }, whole: true,
        art: { spec: { style: 'corrugated', wallColor: H.wall, grime: 0.14, plaques: [{ text: H.sign, x: 30, v: 92, sx: 1, bg: '#1e2a3a', fg: [240, 236, 220], lit: true }] } } });
      if (b) placeName(H.name, hx, y0 + 1, hx + hw, y0 + 1 + hh);
    });
    // the apron: from the taxiway to the fuel farm, down to the fence along Marsh Road
    const ax0 = AX.taxi + 5, ax1 = FIELD.hangars[3][0] + FIELD.hangars[3][2] + 30, ay0 = y0 + 1 + FIELD.hangars[0][3];
    K.fill(ax0, y0, ax1 - ax0, y1 - y0, T.LOT);
    // light planes tied down in two rows (the flyable stands - FIELD.planes - left clear round their spots)
    const clearOf = (x, y) => FIELD.planes.every(([fx, fy]) => Math.abs(fx - x) > 6 || Math.abs(fy + 4.7 - y) > 7);
    let n = 0;
    for (const ry of [ay0 + 8, ay0 + 26]) for (let x = ax0 + 6; x < ax1 - 4; x += 9) {
      if (!clearOf(x, ry) || rnd(x, ry, 51) < 0.25) continue;
      prop('lplane', x, ry, 26, { c: n % 4, a: -Math.PI / 2 }); n++;
      prop('cone', x - 2.4, ry + 1.6, 0);
    }
    out.planes += n;
    prop('windsock', ax0 + 2, ay0 + 3, 4, { a: 0.4 });
    fence(ax0, y1 - 1, ax1 + 40, y1 - 1);
    // the fuel farm: four tanks in their bund, the fence, the tanker at the loading rack, the sign
    const fx0 = ax1 + 2, fx1 = N(AX.blvd, 'blvd') - 1;
    if (fx1 - fx0 >= 20) {
      K.fill(fx0, y0, fx1 - fx0, y1 - y0, T.LOT);
      for (let k = 0; k < 4; k++) prop('otank', fx0 + 9 + (k % 2) * 18, y0 + 16 + Math.floor(k / 2) * 22, 60, { r: 64, h: 112, c: '#c8ccd0' });
      m.parking.push({ x: (fx0 + 6) * TILE, y: (y1 - 8) * TILE, a: -Math.PI / 2, model: 'tanker', bare: true });
      prop('pipes', fx0 + 16, y1 - 10, 10);
      fence(fx0, y0, fx1, y0); fence(fx0, y0, fx0, y1 - 1); fence(fx1, y0, fx1, y1 - 1, [[y0 + 6, y0 + 12]]);
      prop('textsign', fx1 - 4, y0 + 2, 0, { text: 'JET A FUEL FARM', bg: '#a8302a', fg: [250, 246, 230], z: 34, sx: 1 });
      placeName('Fuel Farm', fx0, y0, fx1, y1);
    }
    placeName('General Aviation', ax0, y0, ax1, y1);
    out.gaApron = [ax0, y0, ax1 - ax0, y1 - y0];
  }

  // The Car Rental Center on Cargo Road: four counters facing the road, their ready lines behind them back to Terminal
  // Drive, a canopy over each company's return lane, its tall sign
  function rentals() {
    const y0 = S(AY.drive, 'ave'), y1 = N(AY.cargo, 'ave');   // [2696, 2724)
    const CO = [
      { name: 'Zipline Car Rental', sign: 'ZIPLINE', bg: '#e8b030', fg: [30, 30, 36], wall: '#f0e8d0', aw: ['#e8b030', '#f0ece4'] },
      { name: 'Sunbelt Rent-A-Car', sign: 'SUNBELT', bg: '#c8342e', fg: [250, 246, 236], wall: '#ece6da', aw: ['#c8342e', '#f0ece4'] },
      { name: 'EconoRide Rentals', sign: 'ECONORIDE', bg: '#2a8a4a', fg: [250, 250, 240], wall: '#e4e0d4', aw: ['#2a8a4a', '#f0ece4'] },
      { name: 'Coastline Car Hire', sign: 'COASTLINE', bg: '#1e4a8a', fg: [250, 250, 240], wall: '#e8e4dc', aw: ['#1e4a8a', '#f0ece4'] },
    ];
    const x0 = S(AX.blvd, 'blvd') + 1, x1 = AX.bend - 14, cw = Math.floor((x1 - x0) / CO.length);
    CO.forEach((c, k) => {
      const cx = x0 + k * cw, ow = 12;
      const b = K.building({ x: cx + 2, y: y1 - 8, w: ow, h: 8, arch: 'office', name: c.name, poi: { kind: 'delivery', label: c.name }, whole: true,
        art: tower(cx + 2, y1 - 8, { name: c.name, sign: c.sign, style: 'stucco', wall: c.wall, floors: 1, win: 'even', cornice: null, signC: [c.bg, c.fg], awning: c.aw, people: 2 }) });
      if (!b) return;
      out.shops++;
      K.fill(cx, y0, cw - 2, y1 - y0, T.LOT); K.take(cx, y0, cw - 2, y1 - y0);
      bays(cx + 1, y0 + 1, cx + cw - 3, y1 - 10, {});
      bays(cx + ow + 4, y1 - 9, cx + cw - 3, y1, { skip: (sx) => sx > cx + cw - 9 });
      prop('canopy', cx + ow + 8, y0 + 4.5, 0, { w: 260, d: 120, h: 52 });
      prop('textsign', cx + cw - 5, y1 - 0.8, 0, { text: c.sign, bg: c.bg, fg: c.fg, z: 64, sx: 2, lit: true });
      placeName(c.name, cx, y0, cx + cw - 2, y1);
    });
    placeName('Car Rental Center', x0, y0, x0 + cw * CO.length, y1);
  }

  // Economy Parking: the long-stay lot between the boulevard and Skyway Drive, south of Cargo Road - its booth and
  // barrier on Cargo Road, the bays in their double rows, palms on the islands, light masts, the shuttle shelters; the
  // airport's sign on the corner of Marsh Road
  function economy() {
    const x0 = S(AX.blvd, 'blvd') + 1, x1 = N(AX.skyway, 'st'), y0 = S(AY.cargo, 'ave'), y1 = N(AY.marsh, 'ave');   // [1698, 1775) x [2737, 2854)
    K.building({ x: x1 - 8, y: y0 + 1, w: 4, h: 2, arch: 'hut', name: 'Economy Parking Booth', poi: false, whole: true, art: { spec: { style: 'stucco', wallColor: '#e8e4da', height: 34, roof: 'flat' }, noShop: true } });
    K.fill(x0, y0, x1 - x0, y1 - y0 - 10, T.LOT); K.take(x0, y0, x1 - x0, y1 - y0 - 10);
    const cut = (sx) => sx === x0 + 2 || sx === x0 + 36 || sx >= x1 - 6;
    const rows = bays(x0 + 2, y0 + 4, x1 - 2, y1 - 12, { sparse: true, skip: cut });
    islands([x0 + 2, x0 + 36], rows, { masts: true });
    for (const ry of rows) prop('busstop', x1 - 3, ry + 5, 0);
    prop('ygate', x1 - 3, y0 + 1, 0, { a: 0 });
    prop('textsign', x0 + 8, y0 + 1, 0, { text: 'ECONOMY PARKING', bg: '#1e3a5e', fg: [250, 250, 240], z: 40, sx: 1 });
    placeName('Economy Parking', x0, y0, x1, y1 - 10);
    // the airport's sign on its lawn at the corner of the boulevard and Marsh Road: beds of flowers, palms either side
    const sy = y1 - 6;
    K.fill(x0, y1 - 10, x1 - x0, 10, T.GRASS);
    prop('textsign', x0 + 14, sy + 2, 0, { text: 'WESTPORT INTL AIRPORT', bg: '#1e2a4e', fg: [236, 236, 230], z: 44, sx: 2, lit: true });
    for (const dx of [4, 24]) { prop('palm_a', x0 + dx, sy, 10, { sp: 'royal', k: 1.35 }); prop('flowers_big', x0 + dx + 3, sy + 2.5, 0); }
    prop('flowers_a', x0 + 14, sy + 4, 0);
  }

  // Cargo Road east of the bend, its north side to the bay: the Runway Diner, the Jetway Motor Inn round its pool,
  // Approach Fuel on the corner of Bayside Avenue; the lawn and the pines along the shore behind
  function approach() {
    const y1 = N(AY.cargo, 'ave');   // (the fronts end here: their doors on the pavement)
    // the bay's shore along here (the first land row south of the water at each column)
    const shoreY = (x) => { let y = AY.north; while (y < y1 && (wet(x, y) || !m.land[y * W + x])) y++; return y; };
    const x0 = AX.bend + 14;
    // the diner: a chrome box with its neon, the car park beside it
    const dx = x0;
    const diner = K.building({ x: dx, y: y1 - 14, w: 18, h: 14, arch: 'diner', key: 'diner', name: 'Runway Diner', poi: { kind: 'coffee', label: 'Runway Diner', food: true }, whole: true,
      art: { spec: { floors: 1, style: 'diner', trim: [255, 70, 90], neon: { icon: 'cup', col: [70, 210, 255], x: 150, y: -4 }, parapet: 10, roofMat: 'membrane', lip: 8, rimW: 4 },
        shop: { kind: 'diner', door: 'right', open: true, people: 4, awning: null, band: null, sign: { text: 'RUNWAY DINER', bg: '#1a1420', fg: [255, 70, 110], lit: true } },
        kit: [['ac', 44, 40], ['ac', 92, 40], ['vent', 30, 96], ['vent', 210, 92], ['hatch', 180, 120]] } });
    if (diner) {
      out.shops++;
      K.fill(dx, y1 - 27, 18, 13, T.LOT);
      bays(dx + 1, y1 - 26, dx + 17, y1 - 16, {});
      prop('motelsign', dx + 17, y1 - 1.4, 10, { text: 'RUNWAY', word: 'DINER', col: 3, z: 96 });
      placeName('Runway Diner', dx, y1 - 27, dx + 18, y1);
    }
    // the motel: two storeys of rooms round three sides of its court and pool, the office by the drive, its sign
    const mx0 = dx + 22, mw = 56, top = Math.max(shoreY(mx0 + mw / 2) + 4, y1 - 47);
    motel(mx0, mw, top, y1);
    // the gas station on the corner: the shop at the back, the canopy and its pumps out front, the price sign
    const gx = AX.bayside - 30;
    const gs = K.building({ x: gx, y: y1 - 23, w: 14, h: 10, arch: 'gas', key: 'gas', name: 'Approach Fuel', poi: { kind: 'gasstation', label: 'Approach Fuel' }, whole: true });
    if (gs) {
      out.shops++;
      K.fill(gx - 4, y1 - 13, 28, 13, T.LOT);
      const cx = gx + 8, cy = y1 - 7;
      prop('canopy', cx, cy, 0, { w: 260, d: 110, h: 54 });
      for (const [ox, oy] of [[-4, -1.6], [0, -1.6], [4, -1.6], [-4, 1.6], [0, 1.6], [4, 1.6]]) { const px = (cx + ox) * TILE, py = (cy + oy) * TILE; (m.sitePumps ||= []).push({ x: px, y: py }); m.addSolidProp(px, py, 9); }
      prop('textsign', gx + 22, y1 - 1.6, 0, { text: 'APPROACH FUEL', bg: '#1e4a8a', fg: [250, 220, 60], z: 60, sx: 1, lit: true });
      placeName('Approach Fuel', gx - 4, y1 - 23, gx + 24, y1);
    }
    // the shore behind: a lawn with picnic tables looking out over the bay
    for (let x = x0; x < AX.bayside - 4; x += 16) {
      const sy = shoreY(x) + 3;
      if (sy + 3 < y1 - 30 && K.allFree(x, sy, 3, 2)) prop('picnic', x + 1.5, sy + 1, 10);
    }
  }
  // a motel round its court (as the Pink Mile's: shared/world3-pinkmile.js): the back bar and the two wings of rooms, the
  // office at the front, the pool in the court, the cars nosed in under the rooms, the tall sign
  function motel(x, w, top, front) {
    const name = 'Jetway Motor Inn', wall = '#e8d8b8', door = '#2a6a8a';
    const barH = 8, wingW = 9;
    const room = (bx, by, bw, bh, floors, home = null) => K.building({ x: bx, y: by, w: bw, h: bh, arch: 'hotel', name: `${name} Rooms`, whole: true, poi: false, ...(home ? { home } : { door: null }),
      art: { spec: { floors, style: 'stucco', wallColor: wall, parapet: 8, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.08, balconies: false, motel: { room: 96, door, stair: 'right' }, blades: [] }, noShop: true, neon: { name: null, col: 2 } } });
    const bar = room(x, top, w, barH, 2, { kind: 'apartment', name: `Room 14, ${name}`, price: 6500, slots: 1 });
    if (!bar) return;
    out.homes++;
    const wy0 = top + barH + 4, wy1 = front - 8;
    if (wy1 - wy0 >= 10) { room(x, wy0, wingW, wy1 - wy0, 2); room(x + w - wingW, wy0, wingW, wy1 - wy0, 2); }
    const office = K.building({ x: x + Math.floor(w / 2) - 5, y: front - 7, w: 10, h: 7, arch: 'hotel', key: 'hotel', name, whole: true, poi: { kind: 'delivery', label: name },
      art: { spec: { floors: 1, style: 'stucco', wallColor: wall, parapet: 16, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.08, blades: [],
        plaques: [{ text: 'VACANCY', x: 8, v: 64, sx: 2, bg: '#1a1420', fg: [255, 70, 110], lit: true }] },
      shop: { kind: 'lobby', door: 'left', open: true, people: 1, sign: { text: 'OFFICE', bg: '#1a1420', fg: [120, 230, 255], lit: true }, awning: [door, '#f0ece4'] } } });
    if (office) out.shops++;
    // the court: parking under the rooms, the paved court, the pool, loungers and umbrellas
    K.fill(x, top + barH, w, 4, T.LOT);
    for (let qx = x + 1; qx + 2 <= x + w - 1; qx += 2) if (rnd(qx, top, 61) < 0.55) m.parking.push({ x: (qx + 1) * TILE, y: (top + barH + 2) * TILE, a: -Math.PI / 2 });
    K.fill(x + wingW, wy0, w - 2 * wingW, front - wy0 + 1, T.PLAZA);
    const pw = Math.min(16, w - 2 * wingW - 8), ph = 5, px0 = x + Math.floor((w - pw) / 2), py0 = wy0 + 3;
    if (pw >= 6 && py0 + ph < front - 8) {
      for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
      for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.1, 0, { v: k, a: -Math.PI / 2 });
      prop('umbrella_r', px0 + 1, py0 - 0.9, 0); prop('umbrella_b', px0 + pw - 1, py0 - 0.9, 0);
      prop('ringfloat', px0 + pw * 0.6, py0 + ph * 0.5, 0, { v: 1 });
    }
    for (let qx = x + wingW + 1; qx + 2 <= x + w - wingW - 1; qx += 2) if (Math.abs(qx + 1 - (x + w / 2)) > 6) m.parking.push({ x: (qx + 1) * TILE, y: (front - 2) * TILE, a: Math.PI / 2 });
    prop('motelsign', x + 3, front - 0.4, 10, { text: 'JETWAY', col: 5, z: 104, word: 'MOTEL' });
    prop('vend_cola', x + Math.floor(w / 2) + 6, front - 2, 8);
    placeName(name, x, top, x + w, front + 1);
    out.motel = { x, y: top, w, h: front - top + 1 };
  }

  // Skyport Drive: the business park along its north side (their car parks behind, back to Cargo Road), the self storage
  // and its fenced RV yard at the east end; south of it the pond in the reeds with its boardwalk, the woods to the highway
  function skyport() {
    const y0 = S(AY.cargo, 'ave'), y1 = N(AY.skyport, 'st');   // [2737, 2805)
    const x0 = S(AX.skyway, 'st') + 1;
    const LOTS = [
      { w: 44, name: 'Meridian Aerospace', o: { style: 'glass', tint: '#2a4a6a', floors: 4, sign: 'MERIDIAN AEROSPACE' }, d: 20 },
      { w: 48, name: 'Altura Logistics', o: { style: 'concrete', wall: '#d8d2c4', floors: 2, win: 'even', sign: 'ALTURA LOGISTICS' }, d: 22 },
      { w: 34, name: 'Skyport Business Center', o: { style: 'glass', tint: '#36606e', floors: 3, sign: 'SKYPORT CENTER' }, d: 18 },
    ];
    let x = x0;
    for (const L of LOTS) {
      const by = y1 - L.d;
      const b = K.building({ x, y: by, w: L.w, h: L.d, arch: 'office', name: L.name, poi: { kind: 'delivery', label: L.name }, whole: true,
        art: tower(x, by, { name: L.name, cornice: null, signC: ['#1e2a3a', [236, 236, 230]], ...L.o }) });
      if (b) {
        K.fill(x, y0, L.w, by - y0 - 1, T.LOT); K.take(x, y0, L.w, by - y0 - 1);
        bays(x + 1, y0 + 1, x + L.w - 1, by - 2, { sparse: true });
        for (const px of [x + 2, x + L.w - 2]) prop('palm_a', px, y1 - 0.8, 10, { sp: pick(PALM, rnd(px, y1, 71)), k: 1.2 });
        placeName(L.name, x, y0, x + L.w, y1);
      }
      x += L.w + 6;
    }
    // the self storage: rows of lock-ups; the RV and boat yard behind it, fenced
    const sx0 = x, sx1 = AX.skyEnd - 10;
    if (sx1 - sx0 >= 30) {
      const ry1 = y1 - 1;
      for (let yy = ry1 - 22; yy + 5 <= ry1; yy += 8) for (let xx = sx0; xx + 9 <= sx1; xx += 10) K.building({ x: xx, y: yy, w: 9, h: 5, arch: 'garage', name: 'Skyport Self Storage', poi: false, whole: true, roof: 'tar' });
      K.fill(sx0, ry1 - 24, sx1 - sx0, 25, T.LOT);
      const ry0 = y0 + 1, yardH = ry1 - 26 - ry0;
      if (yardH >= 12) {
        K.fill(sx0, ry0, sx1 - sx0, yardH, T.LOT); K.take(sx0, ry0, sx1 - sx0, yardH);
        for (let yy = ry0 + 3; yy + 4 < ry0 + yardH; yy += 7) for (let xx = sx0 + 3; xx < sx1 - 3; xx += 5) if (rnd(xx, yy, 81) < 0.7) m.parking.push({ x: xx * TILE, y: yy * TILE, a: -Math.PI / 2, model: rnd(xx, yy, 82) < 0.5 ? 'van' : 'boxtruck', bare: true });
        fence(sx0, ry0, sx1, ry0, [], false); fence(sx0, ry0, sx0, ry0 + yardH, [], false); fence(sx1, ry0, sx1, ry0 + yardH, [], false);
      }
      prop('textsign', sx0 + 4, y1 - 0.8, 0, { text: 'SKYPORT SELF STORAGE', bg: '#c8642a', fg: [250, 246, 230], z: 40, sx: 1 });
      placeName('Skyport Self Storage', sx0, y0, sx1, y1);
    }
    // south of the drive: the pond in the reeds, its boardwalk and bench; the woods run on east under the highway
    const py0 = S(AY.skyport, 'st') + 3, px0 = x0 + 8, pw = 70, ph = Math.min(26, N(AY.marsh, 'ave') - py0 - 4);
    const cx = px0 + pw / 2, cy = py0 + ph / 2;
    let nW = 0;
    for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) {
      const u = (xx + 0.5 - cx) / (pw / 2), v = (yy + 0.5 - cy) / (ph / 2), wob = 0.08 * rnd(xx >> 2, yy >> 2, 91);
      if (u * u + v * v > 1 - wob || !K.free(xx, yy)) continue;
      m.set(xx, yy, T.WATER); K.take(xx, yy, 1, 1); nW++;
    }
    if (nW) {
      // reeds and cattails in clumps along the shore (a shore tile beside the water, now and then)
      for (let yy = py0 - 1; yy <= py0 + ph; yy++) for (let xx = px0 - 1; xx <= px0 + pw; xx++) {
        if (wet(xx, yy) || tile(xx, yy) !== T.GRASS) continue;
        if (!(wet(xx + 1, yy) || wet(xx - 1, yy) || wet(xx, yy + 1) || wet(xx, yy - 1)) || rnd(xx >> 1, yy >> 1, 92) > 0.5) continue;
        prop('shrub_b', xx + 0.5, yy + 0.5, 0, { sp: rnd(xx, yy, 93) < 0.6 ? 'reeds' : 'cattails', k: 1 });
      }
      prop('boardwalk', cx - 10, cy, 0, { len: 20 * TILE, a: 0 });
      prop('heron', cx + pw / 4, cy + ph / 4, 0);
      prop('duck', cx - pw / 5, cy - 2, 0); prop('duck', cx - pw / 5 + 1.4, cy - 1.2, 0);
      prop('lily', cx + 6, cy - 4, 0); prop('lily', cx - 14, cy + 5, 0);
      placeName('Skyport Pond', px0, py0, px0 + pw, py0 + ph);
    }
  }

  // The field: the runway and its strips, the taxiway and its exits, the aprons, the approach lights, the fence round
  // the airside (barbed: along 22nd Street, Spruce Street and Marsh Road)
  function field() {
    const [rx, ry, rw, rh] = FIELD.runway, [tx, ty, tw, th] = FIELD.taxi;
    K.fill(rx, ry, rw, rh, T.LOT); K.fill(tx, ty, tw, th, T.LOT);
    for (const ey of [ry + 4, ry + 70, ry + 140, ry + rh - 8]) K.fill(rx + rw, ey, tx - rx - rw, 4, T.LOT);
    // the main apron the length of the terminal and on east past the rescue base to the cargo sheds; the cargo apron
    const [ax, ay, aw, ah] = FIELD.apron;
    K.fill(ax, ay, aw, ah, T.LOT);
    K.fill(ax, ay + ah, TERM.x0 - ax, TERM.front - ay - ah, T.LOT);   // (west of the terminal, down to the forecourt)
    K.fill(TERM.x0, TERM.back, TERM.wx - TERM.x0, TERM.cback - TERM.back, T.LOT);
    K.fill(TERM.ex, TERM.back, TERM.x1 - TERM.ex, TERM.cback - TERM.back, T.LOT);
    K.fill(TERM.x1, ay + ah, SAR[0] - TERM.x1, OPS_Y - ay - ah, T.LOT);
    K.fill(SAR[0] - 6, OPS_Y, 6, N(AY.drive, 'ave') - OPS_Y, T.PLAZA);
    K.fill(SAR[0], SAR[3], SAR[2] - SAR[0], N(AY.drive, 'ave') - SAR[3], T.PLAZA);   // (the HQ's frontage to the pavement: its drive is paved over it)
    K.fill(SAR[0], SAR[1], SAR[2] - SAR[0], SAR[3] - SAR[1], T.LOT);   // (the rescue base's: paved, nothing on it)
    // the airside's grass: the strips either side of the runway, between it and the taxiway - kept open (no trees)
    for (let y = AY.north; y < AY.marsh; y++) for (let x = AX.spruce; x < ax; x++) if (K.free(x, y)) K.take(x, y, 1, 1);
    for (let y = AY.north; y < ay; y++) for (let x = ax; x < AX.bend; x++) if (K.free(x, y)) K.take(x, y, 1, 1);
    // the approach lights off both thresholds, the threshold's wing bars
    const cxr = rx + rw / 2;
    for (let k = 1; k <= 3; k++) { prop('appbar', cxr, ry - k * 2.6, 0, { n: 4 }); prop('appbar', cxr, ry + rh + k * 2.6, 0, { n: 4 }); }
    prop('windsock', rx + rw + 3, ry + rh / 2, 4, { a: 0.4 });
    prop('windsock', rx - 3, ry + 18, 4, { a: 0.4 });
    // the fence: along 22nd Street (its pavement's edge), down Spruce Street, along Marsh Road to the GA apron
    const fy = S(AY.north, 'st'), fx = S(AX.spruce, 'st');
    fence(fx, fy, 1684, fy);
    fence(fx, fy, fx, AY.marsh - 4);
    fence(AX.taxi + 7, TERM.front, AX.taxi + 7, S(AY.hangar, 'st'));   // (the airside's edge west of the terminal road and the hotel)
  }

  // The Runway End Overlook: west of the runway's south end, off Spruce Street - a lawn behind the fence where people
  // watch the planes come in: benches, picnic tables, the coin telescopes, a food cart, the sign
  function overlook() {
    const x0 = S(AX.spruce, 'st') + 1, x1 = FIELD.runway[0] - 6, y0 = 2804, y1 = AY.marsh - 6;
    if (x1 - x0 < 10) return;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.tiles[i] === T.GRASS && !m.reserve[i]) m.reserve[i] |= 16; }
    K.paint(x0, y0 + 4, x1 - x0, 3, T.PLAZA);
    for (let x = x0 + 2; x < x1 - 2; x += 5) prop('pbench', x, y0 + 5.5, 0, { a: 0 });
    for (const [dx, dy] of [[3, 12], [10, 16], [16, 11]]) if (x0 + dx < x1) prop('picnic', x0 + dx, y0 + dy, 10);
    for (const dx of [4, 12]) if (x0 + dx < x1) prop('scope', x0 + dx, y0 + 3.5, 6);
    prop('foodcart', x0 + 6, y0 + 9, 14);
    prop('textsign', x0 + 4, y0 + 1, 0, { text: 'RUNWAY END OVERLOOK', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 1 });
    placeName('Runway End Overlook', x0, y0, x1, y1);
  }

  // The airport's record (shared/map.js buildAirports keeps it): the runway and the taxiway for the flying, the
  // general-aviation stands, the stands' markings and the tower for the art, the aprons (paved as apron; the lots are
  // asphalt - client/art2/game/groundbake.js)
  function register() {
    const px = ([x, y, w, h]) => ({ x: x * TILE, y: y * TILE, w: w * TILE, h: h * TILE });
    const [ax, ay, aw, ah] = FIELD.apron;
    const aprons = [FIELD.apron, [ax, ay + ah, TERM.x0 - ax, TERM.front - ay - ah], [TERM.x0, TERM.back, TERM.x1 - TERM.x0, TERM.cback - TERM.back], [TERM.x1, ay + ah, SAR[2] - TERM.x1, SAR[3] - ay - ah], out.gaApron, [FIELD.runway[0] + FIELD.runway[2], FIELD.runway[1], FIELD.taxi[0] - FIELD.runway[0] - FIELD.runway[2], FIELD.runway[3]]].filter(Boolean).map(px);
    (m.airports ||= []).push({
      name: AP_NAME, hand: true, runway: px(FIELD.runway), taxi: px(FIELD.taxi),
      planes: FIELD.planes.map(([x, y]) => ({ x: x * TILE, y: y * TILE })),
      tower: out.tower, stands: out.stands.map((q) => ({ ...q, to: out.lanes[0][1] })), lanes: out.lanes, aprons, box: px([RECT[0], RECT[1], RECT[2] - RECT[0], RECT[3] - RECT[1]]),
    });
  }
}
