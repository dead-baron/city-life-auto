// World v3, handcrafted: Gull Harbor (district 43), the ferry island - all of it, from the owner's concepts WC204 (the
// stone harbour village: a walled harbour basin with its quay and fishing boats, a breakwater with a red light, a stone
// church with a spire and its graveyard, slate-roofed cottages and the quayside pub) and WC059 (the island harbour
// village: the breakwater harbour and its red beacon, the fishing boats inside, red roofs and a cafe terrace round the
// harbour, the white lighthouse and its keeper's house on the far headland), with the research's island template NT1-F
// (the breakwater basin, the stone quay, the fishing boats; the harbour-front row of cottages, a cafe and a shop; a farm
// with its barn, orchard and vegetable plots; one road across the island to the lighthouse and keeper's house on the
// far headland):
//   - (and the owner's GullHarbor-A1, 2026-10-19: the car-ferry slip in the village harbour with its ticket huts and
//     queued cars, the quay square with its gazebo, the fish sheds on their timber wharf, lobster pots and nets, the
//     fishing boats alongside, clapboard cottages under dark shingle up the rocky hill)
//   - Gull Harbor village round the cove on the south shore, its buildings facing south over the harbour (the camera):
//     Quay Street along the harbour, the harbour-front row on it - Harbor General Store, The Anchor, the chandlery,
//     The Salty Gull Cafe, Gull's Rest Inn, The Lobster Pot - Kirk Lane, Net Lane and Kittiwake Lane behind with their
//     cottages, St. Elmo's by the Sea in its churchyard at the top of Steeple Street, the allotments;
//   - the harbour: the stone quay along the cove's head (its gazebo, the cafe's terrace, the dinghies tied up), Salty Nets
//     and the lobster company's sheds on their timber wharf and pier, the two breakwaters across the cove's mouth with
//     a red light on the west head and a green one on the east, the beaches either side inside them, the boat hire;
//   - the car ferry's slip on the quay (the ramp, its lot's end and booth are the ferry builder's: shared/world3-ferries.js;
//     the route comes round the island's east end - shared/world3-layout.js FERRIES3); Windrush Road up the island from
//     the village to the north shore, through Windrush Farm - its farmhouse and barn, the silos, the orchard, the
//     vegetable plots, the farm stand - and its fields between hedgerows; East Road closing the island's loop road;
//   - Gull Point Light and the keeper's cottage on the island's west end at the end of Gull Point Track, on its rocky
//     knoll; Gull Woods on the south-west with its campground, Bonfire Beach below it; meadows round the rest.
// The whole island the plan's: the grid of mainland streets the city generator would lay (world3-city.js d 43) and the
// farm valley's fields (the island's land is Willow Valley's meadow till a city paints it - shared/world3-land.js ISLE3)
// give way, and the island is Gull Harbor's district. Every building faces south. Names and signs are invented. Draws
// are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';

const D = 43;   // Gull Harbor (shared/mapcore.js DISTRICTS)
const BOX = [1270, 3280, 2210, 3800];   // (the island, its beaches and the harbour's breakwaters)
export const GX = { ferry: 1640, net: 1590, gull: 1690, slip: 1601 };   // (ferry: Windrush Road and Steeple Street's line; slip: the car ferry's)
export const GY = { loopN: 3348, loopS: 3597, chapel: 3655, quay: 3712, edge: 3737 };
const WINDRUSH = [[GX.ferry, GY.loopN], [GX.ferry, GY.loopS]];
const CHURCH = [[GX.ferry, GY.loopS], [GX.ferry, GY.quay]];
const QUAY = [[1556, GY.quay], [1726, GY.quay]];
const CHAPEL = [[GX.net, GY.chapel], [GX.gull, GY.chapel]];
const NET = [[GX.net, GY.chapel], [GX.net, GY.quay]];
const GULL = [[GX.gull, GY.chapel], [GX.gull, GY.quay]];
const EAST = [[1875, 3401], [1922, 3432], [1962, 3466], [1991, 3509]];
const POINT = [[1408, 3510], [1366, 3511], [1324, 3514]];
const CAMP = [[1500, 3591], [1496, 3628], [1486, 3660]];
// the breakwaters across the cove's mouth (their centre lines: x0 -> x1, y at each end), the harbour mouth between
const MOLE_W = { x0: 1532, x1: 1611, y0: 3787, y1: 3790 };
const MOLE_E = { x0: 1724, x1: 1639, y0: 3786, y1: 3790 };
const WALLS = ['#8a9aa8', '#a9b6c0', '#ece9e0', '#e8dcae', '#9aaa90', '#7f8e98', '#ece9e0', '#c8b8a0'];   // (clapboard: grey-blue, white, pale yellow, sage)
const SLATES = ['#3e4450', '#4a4e58', '#55606a'];

export const GULLHARBOR = {
  key: 'gullharbor', d: D, rect: BOX, few: 24,   // (a village of a few dozen buildings and the island round it: test/world3world.test.js)
  streets: () => [
    { name: 'Windrush Road', kind: 'rural', pts: WINDRUSH },
    { name: 'Steeple Street', kind: 'minor', pts: CHURCH },
    { name: 'Quay Street', kind: 'st', pts: QUAY },
    { name: 'Kirk Lane', kind: 'minor', pts: CHAPEL },
    { name: 'Net Lane', kind: 'minor', pts: NET },
    { name: 'Kittiwake Lane', kind: 'minor', pts: GULL },
    { name: 'East Road', kind: 'rural', pts: EAST },
    { name: 'Gull Point Track', kind: 'dirt', pts: POINT },
    { name: 'Campground Track', kind: 'dirt', culdesac: true, pts: CAMP },
  ],
  specials: ['Gull Harbor Fish Shack', 'Harbor General Store', 'The Salty Gull Cafe', 'The Anchor'],   // (the fish shack is Salty Nets now)
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const S = makeSuburb(m, K, out);
  const { place, frontRow, backRow } = S;
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  // the island's land is all Gull Harbor's now (its outskirts were Willow Valley's meadow)
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) { const i = y * W + x; if (m.land[i]) m.dist[i] = D; }
  const zone = m.zone[3690 * W + GX.ferry];
  // ground made over the water (the quay, the breakwaters): land of the island's district, kept
  const made = (x, y, t) => {
    const i = y * W + x;
    if (m.bld[i] >= 0) return false;
    if (isW(x, y)) { m.land[i] = 1; if (m.river) m.river[i] = 0; if (m.lake) m.lake[i] = 0; m.dist[i] = D; m.zone[i] = zone; }
    else if (!m.land[i]) return false;
    m.set(x, y, t); m.reserve[i] |= 16; K.take(x, y, 1, 1);
    return true;
  };
  // a cottage: painted clapboard under dark shingle, one or two floors, a chimney (GullHarbor-A1: the cottages up the hill)
  const cottage = (x, y) => ({ spec: { floors: rnd(x, y, 1) < 0.4 ? 1 : 2, style: 'siding', wallColor: pick(WALLS, rnd(x, y, 4)), win: pick(['pair', 'even'], rnd(x, y, 5)), pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, y, 6)), slope: 0.6, parapet: 3, grime: 0.06, blades: [], plaques: [] }, noShop: true });
  const row = { art: cottage, trees: ['oak', 'maple', 'birch', 'whitePine'], price: 26000, w: 9 };

  shopsOnQuay();
  churchyard();
  allotments();
  village();
  harbour();
  farm();
  light();
  northShore();
  campground();
  bonfireBeach();
  wilds();
  // (every tile of the island the plan's: the farm valley's fields, trees and rocks keep off it)
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    if (K.free(x, y)) K.take(x, y, 1, 1);
    const i = y * W + x, t = m.tiles[i];
    if (m.land[i] && (t === T.DIRT || t === T.SAND || t === T.FIELD)) m.reserve[i] |= 16;
  }
  (m.landmarks ||= []).push({ name: 'Gull Harbor', type: 'harbor', x: 1530 * TILE, y: 3600 * TILE, w: 200 * TILE, h: 196 * TILE });
  void api;
  return out;

  // ===========================================================================================================
  // The harbour-front row on Quay Street's north side, facing the harbour: the pub, the store and the chandlery west of
  // Steeple Street, the cafe, the inn and the seafood restaurant east of it - painted stone fronts, slate and red tile
  function shopsOnQuay() {
    const front = (x, o) => ({
      spec: { floors: o.floors || 2, style: o.style || 'siding', wallColor: o.wall, win: o.win || 'pair', pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, 7, 31)), slope: 0.55, parapet: 3, grime: 0.07, blades: [], plaques: [] },
      shop: { kind: o.store, door: o.door || 'left', open: true, people: o.people ?? 2, sign: { text: o.sign || o.name.toUpperCase(), bg: o.signC[0], fg: o.signC[1], lit: true }, awning: o.awning || null },
    });
    const LIST = [
      [GX.net + 4, GX.ferry - 5, [
        { name: 'Harbor General Store', store: 'mart', w: 12, wall: '#ece9e0', poi: { kind: 'convenience', label: 'Harbor General Store' }, signC: ['#1e2a4a', [240, 232, 200]], awning: ['#2a4a7a', '#f0ece4'], sign: 'HARBOR GENERAL' },
        { name: 'The Anchor', store: 'bar', w: 15, wall: '#8a9aa8', poi: { kind: 'club', label: 'The Anchor' }, signC: ['#1e3a2e', [240, 220, 160]], door: 'right', people: 4 },
        { name: 'Gull Harbor Chandlery', store: 'mart', w: 10, wall: '#e8dcae', floors: 1, poi: { kind: 'tackle', label: 'Gull Harbor Chandlery' }, signC: ['#8a3a2a', [255, 236, 200]], sign: 'CHANDLERY' },
      ]],
      [GX.ferry + 5, GX.gull - 4, [
        { name: 'The Salty Gull Cafe', store: 'cafe', key: 'rest2', w: 11, wall: '#ece9e0', poi: { kind: 'coffee', label: 'The Salty Gull Cafe', food: true }, signC: ['#c8302a', [255, 250, 240]], awning: ['#c8302a', '#f0ece4'], sign: 'SALTY GULL CAFE' },
        { name: "Gull's Rest Inn", store: 'lobby', w: 14, wall: '#a9b6c0', floors: 3, win: 'even', poi: { kind: 'delivery', label: "Gull's Rest Inn" }, signC: ['#2e4a3a', [240, 230, 190]], sign: "GULL'S REST INN" },
        { name: 'The Lobster Pot', store: 'cafe', key: 'rest1', w: 11, wall: '#c8b8a0', poi: { kind: 'delivery', label: 'The Lobster Pot' }, signC: ['#1e2a3a', [255, 200, 120]], awning: ['#1e2a3a', '#f0ece4'], sign: 'LOBSTER POT' },
      ]],
    ];
    for (const [x0, x1, list] of LIST) {
      let k = 0;
      const made2 = K.row(x0, x1, GY.chapel + 30, GY.quay - 4, (x, room) => {
        const L = list[k];
        if (!L) return room >= 1 ? { gap: room, kind: 'passage' } : null;
        const w = Math.min(room, L.w);
        if (w < 8) return { gap: room, kind: 'passage' };
        k++;
        return { w, depth: 12, arch: 'mixed', ...(L.key ? { key: L.key } : {}), name: L.name, poi: L.poi, whole: true, art: front(x, L) };
      }, { noStep: true });
      for (const b of made2) {
        if (!b || b.gap || b.tw === undefined) continue;
        out.shops++;
        // (on the strip in front where there is one: the village's streets have no pavements, so not out in the road)
        if (tile(b.tx, b.ty + b.th) !== T.ROAD) { prop('potted', b.tx + 0.8, b.ty + b.th + 0.6, 6); prop('lamp', b.tx + b.tw - 0.6, b.ty + b.th + 0.5, 5, { style: 'iron' }); }
      }
    }
    place('Quay Street', GX.net, GY.chapel + 30, GX.gull, GY.quay + 6);
  }

  // ===========================================================================================================
  // St. Elmo's by the Sea at the top of Steeple Street, in its churchyard: the stone church with its spire, facing
  // south down the lane; headstones in rows, yews and cypress, a stone wall round it with the gate on Kirk Lane
  function churchyard() {
    const x0 = 1597, x1 = GX.ferry - 5, y0 = GY.loopS + 6, y1 = GY.chapel - 5;
    const cw = 16, ch = 22, cx = Math.round((x0 + x1 - cw) / 2), cy = y1 - ch - 1;
    const c = K.building({ x: cx, y: cy, w: cw, h: ch, arch: 'church', key: 'church', name: "St. Elmo's by the Sea", poi: { kind: 'delivery', label: "St. Elmo's by the Sea" }, whole: true,
      art: { spec: { wallColor: '#b4ac9c', roofColor: '#4a4e58' } } });
    if (!c) return;
    // the path from the door to the lane, the yard round it lawn
    for (let y = cy + ch; y <= y1 + 1; y++) for (let x = cx + 6; x < cx + cw - 6; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); }
    let n = 0;
    for (let y = y0 + 2; y < y1 - 1; y += 4) for (let x = x0 + 2; x < x1 - 1; x += 3) {
      if (x >= cx - 2 && x < cx + cw + 2 && y >= cy - 3) continue;   // (clear of the church)
      if (!K.free(x, y) || rnd(x, y, 40) < 0.12) continue;
      prop('headstone', x + 0.5 + (rnd(x, y, 41) - 0.5) * 0.4, y + 0.5, 4, { v: Math.floor(rnd(x, y, 42) * 4) });
      n++;
    }
    for (const [x, y] of [[x0 + 0.5, y0 + 0.5], [x1 - 0.5, y0 + 0.5], [x0 + 0.5, y1 - 2], [x1 - 0.5, y1 - 2], [cx - 2, cy + 3], [cx + cw + 2, cy + 3]]) prop('tree_a', x, y, 10, { sp: rnd(x, y, 43) < 0.5 ? 'cypress' : 'oak', k: 1.1 });
    // the wall: along the lane with the gate at the path, up both sides
    prop('fenceline', x0, y1 + 0.6, 0, { kind: 'stone', tx: Math.round((cx + 5.6 - x0) * TILE), ty: 0 });
    prop('fenceline', cx + cw - 5.6, y1 + 0.6, 0, { kind: 'stone', tx: Math.round((x1 - cx - cw + 5.6) * TILE), ty: 0 });
    prop('fenceline', x0, y0, 0, { kind: 'stone', tx: 0, ty: Math.round((y1 + 0.6 - y0) * TILE) });
    prop('fenceline', x1, y0, 0, { kind: 'stone', tx: 0, ty: Math.round((y1 + 0.6 - y0) * TILE) });
    for (const gx of [cx + 5.4, cx + cw - 5.4]) prop('gatepier', gx, y1 + 0.6, 6);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) K.take(x, y, 1, 1);
    out.headstones = n;
    (m.landmarks ||= []).push({ name: "St. Elmo's by the Sea", type: 'church', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
    place("St. Elmo's by the Sea", x0, y0, x1, y1 + 1);
  }

  // ===========================================================================================================
  // Gull Harbor Allotments west of the churchyard: raised beds in rows, a shed, a greenhouse, beehives, a scarecrow
  function allotments() {
    const x0 = 1560, x1 = 1594, y0 = GY.loopS + 6, y1 = GY.chapel - 4;
    let beds = 0;
    for (let y = y0 + 2; y < y1 - 2; y += 4) for (let x = x0 + 2; x < x1 - 4; x += 6) {
      if (!K.allFree(x, y, 4, 2)) continue;
      prop('raisedbed', x + 2, y + 1, 0, { v: Math.floor(rnd(x, y, 50) * 4) }); K.take(x, y, 4, 2); beds++;
    }
    if (!beds) return;
    for (let y = y0 + 1; y < y1 - 1; y++) for (const x of [x0 + 1, x1 - 3]) if (K.free(x, y)) { m.set(x, y, T.DIRT); K.take(x, y, 1, 1); }
    prop('shed', x1 - 6, y0 + 3, 12); prop('greenhouse', x0 + 6, y1 - 4, 14);
    for (let k = 0; k < 3; k++) prop('beehive', x1 - 5 + k * 1.4, y1 - 2.4, 4);
    prop('scarecrow', (x0 + x1) / 2, (y0 + y1) / 2, 0); prop('barrel', x1 - 8, y0 + 3, 6); prop('wheelbarrow', x0 + 4, y0 + 3, 0);
    prop('textsign', x0 + 8, y1 - 0.6, 0, { text: 'ALLOTMENTS', bg: '#3a5a3a', fg: [240, 232, 200], z: 22, sx: 1 });
    out.beds = beds;
    place('Gull Harbor Allotments', x0, y0, x1, y1);
  }

  // ===========================================================================================================
  // The cottages: facing Kirk Lane on its north side east of Steeple Street; their doors on Kirk Lane behind the
  // harbour-front row (back yards down to its yards); facing Quay Street west of Net Lane and east of Kittiwake Lane
  function village() {
    frontRow(GX.ferry + 5, GX.gull, GY.loopS + 6, GY.chapel - 4, { ...row, setback: 3 });
    backRow(GX.net + 4, GX.ferry - 4, GY.chapel + 4, GY.chapel + 32, { ...row, yard: 4 });
    backRow(GX.ferry + 5, GX.gull - 4, GY.chapel + 4, GY.chapel + 32, { ...row, yard: 4 });
    frontRow(1558, GX.net - 4, GY.chapel - 4, GY.quay - 4, { ...row, setback: 3 });
    frontRow(GX.gull + 5, 1726, GY.chapel - 4, GY.quay - 4, { ...row, setback: 3 });
    // up the hill behind: cottages along the loop road either side of Windrush Road, facing it from the north and
    // with their doors on it from the south (their gardens down the slope), west of the allotments and east of
    // Kittiwake Lane
    frontRow(1556, GX.ferry - 5, GY.loopS - 30, GY.loopS - 5, { ...row, setback: 3 });
    frontRow(GX.ferry + 5, 1744, GY.loopS - 30, GY.loopS - 5, { ...row, setback: 3 });
    backRow(1508, 1556, GY.loopS + 5, GY.loopS + 30, { ...row, yard: 5 });
    backRow(GX.gull + 6, 1760, GY.loopS + 5, GY.loopS + 30, { ...row, yard: 5 });
    frontRow(1508, 1556, GY.loopS + 31, GY.quay - 4, { ...row, setback: 3 });
    frontRow(1730, 1760, GY.loopS + 31, GY.quay - 4, { ...row, setback: 3 });
    place('Kirk Lane', GX.net, GY.loopS, GX.gull + 36, GY.quay - 4);
  }

  // ===========================================================================================================
  // The harbour (GullHarbor-A1, WC204), west to east along the cove's head: the car ferry's slip - the marshalling
  // lot down from Quay Street between its two ticket huts, the barrier, the cars queued for the boat (the ramp, the
  // lot's end and its booth are the ferry builder's, shared/world3-ferries.js, laid at the quay's edge where the route's
  // last point is); the stone quay with its gazebo, benches and lamps, the harbour's dinghies tied up along it; the
  // fish sheds - Salty Nets and the lobster company - facing their timber wharf out over the water, lobster pots and
  // fish boxes on it, the fishing boats alongside; nets drying beyond; the breakwaters across the mouth with their
  // lights; the beaches either side inside them under the rocks; the boat hire
  function harbour() {
    const qy0 = GY.quay + 6, sx0 = GX.slip - 7, sx1 = GX.slip + 7, qx1 = 1640, wx0 = 1641, wx1 = 1673, wy0 = qy0 + 9;
    const pave = (x, y, t) => { const t0 = tile(x, y); if (K.free(x, y) || t0 === T.SAND) { m.set(x, y, t); m.reserve[y * W + x] |= 16; K.take(x, y, 1, 1); return true; } if (isW(x, y)) return made(x, y, t); return false; };
    // the ticket huts at the lot's mouth (on the grass before it's paved), the lot, its kerbs
    const hut = { spec: { floors: 1, style: 'siding', wallColor: '#ece9e0', win: 'even', pitch: 'gable', roof: 'shingle', roofColor: '#3e4450', slope: 0.6, parapet: 2, grime: 0.05, blades: [], plaques: [] }, noShop: true };
    let huts = 0;
    for (const hx of [sx0 - 2, sx1]) if (K.building({ x: hx, y: qy0, w: 3, h: 3, arch: 'hut', name: 'Gull Harbor Ferry Tickets', whole: true, art: hut })) huts++;
    for (let y = qy0; y <= GY.edge; y++) for (let x = sx0 - 2; x <= sx1 + 2; x++) pave(x, y, x < sx0 || x > sx1 ? T.PLAZA : T.LOT);
    for (const lx of [GX.slip - 3, GX.slip + 3]) for (const ly of [qy0 + 4.5, qy0 + 8.5]) m.parking.push({ x: Math.round((lx + 0.5) * TILE), y: Math.round(ly * TILE), a: Math.PI / 2 });
    prop('ygate', GX.slip - 2.6, qy0 + 9.2, 0, { a: 0 });
    for (const [dx, dy] of [[-6.2, 3], [-6.2, 7], [6.4, 3], [6.4, 7]]) prop('lamp', GX.slip + dx, qy0 + dy, 5, { style: 'iron' });
    prop('textsign', sx1 + 5, qy0 + 0.6, 0, { text: 'GULL HARBOR FERRY', bg: '#1e3a5e', fg: [255, 236, 170], z: 30, sx: 1 });
    prop('mapboard', sx1 + 4, qy0 + 2.6, 4); prop('fingerpost', sx0 - 4, qy0 + 1, 4);
    out.huts = huts;
    place('Gull Harbor Ferry Slip', sx0 - 2, qy0, sx1 + 3, GY.edge + 4);
    // the stone quay east of it: paved to the edge (made out over the water where the cove reaches in), the gazebo,
    // benches round it, planters, lamps and bollards along the edge, life rings; the dinghies along it
    for (let y = qy0; y <= GY.edge; y++) for (let x = sx1 + 3; x <= qx1; x++) pave(x, y, T.PLAZA);
    const gx = (sx1 + 3 + qx1) / 2, gy = qy0 + 8;
    prop('gazebo', gx, gy, 30);
    for (const [dx, dy] of [[-6, 0], [6, 0], [-6, 6], [6, 6]]) prop('bench_m', gx + dx, gy + dy, 0);
    for (const [dx, dy] of [[-9, -4], [9, -4], [-9, 8], [9, 8]]) prop('tree_a', gx + dx, gy + dy, 10, { sp: pick(['maple', 'oak', 'flowerTree'], rnd(dx, dy, 44)), k: 1.1, grate: true });
    for (const [dx, dy] of [[-12.5, 2], [12.5, 2], [-12.5, 6], [12.5, 6]]) prop('planter_fl', gx + dx, gy + dy, 6);
    for (const [dx, v] of [[-11, 0], [-10, 3], [11, 1], [12.2, 4]]) prop('lobsterpots', gx + dx, GY.edge - 1.4, 6, { v });
    prop('crates', gx - 2, GY.edge - 1.6, 10); prop('barrels', gx + 3, GY.edge - 1.4, 10);
    for (let x = sx1 + 6; x <= qx1 - 2; x += 4) if (isW(x, GY.edge + 1)) prop('bollard', x + 0.5, GY.edge + 0.6, 5);
    for (let x = sx1 + 5; x <= qx1; x += 12) prop('lamp', x + 0.5, GY.edge - 0.4, 5, { style: 'iron' });
    prop('lifering', sx1 + 10, GY.edge - 0.3, 0); prop('lifering', qx1 - 4, GY.edge - 0.3, 0);
    for (let k = 0; k < 3; k++) m.marina.push({ x: Math.round((sx1 + 8 + k * 7) * TILE), y: Math.round((GY.edge + 6.5) * TILE), a: 0, kind: k === 1 ? 'speedboat' : 'dinghy' });
    for (const [x, c] of [[sx1 + 9, 2], [sx1 + 21, 0]]) if (isW(Math.floor(x), GY.edge + 2)) prop('fishboat', x, GY.edge + 2.2, 0, { c, a: 0 });
    for (let k = 0; k < 4; k++) { const tx = gx - 4.5 + k * 3, ty = qy0 + 1.6; prop('cafetable', tx, ty, 6); prop(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_r'][k], tx, ty - 0.2, 0); }
    // the fish sheds on the quay's east end (the sand under them made firm), facing south onto their wharf
    for (let y = qy0; y < wy0; y++) for (let x = wx0; x <= wx1; x++) if (tile(x, y) === T.SAND) { m.set(x, y, T.GRASS); }
    const shed = (x, w, name, sign, wall, poi) => K.building({ x, y: qy0 + 1, w, h: 8, arch: 'mixed', name, poi, whole: true,
      art: { spec: { floors: 1, style: 'siding', wallColor: wall, win: 'even', pitch: 'gable', roof: 'metal', roofColor: '#5e6066', slope: 0.45, parapet: 2, grime: 0.16, blades: [], plaques: [] },
        shop: { kind: 'mart', door: 'left', open: true, people: 2, sign: { text: sign, bg: '#2a4a6a', fg: [240, 236, 220], lit: true }, awning: null } } });
    const s1 = shed(wx0 + 2, 15, 'Salty Nets Fish & Shellfish', 'SALTY NETS', '#7f8e98', { kind: 'fishmarket', label: 'Salty Nets Fish & Shellfish', counter: true });
    const s2 = shed(wx0 + 19, 12, 'Gull Harbor Lobster Co.', 'LOBSTER CO.', '#9a8a78', { kind: 'delivery', label: 'Gull Harbor Lobster Co.' });
    out.shops += (s1 ? 1 : 0) + (s2 ? 1 : 0);
    for (let y = qy0; y < wy0; y++) for (let x = wx0; x <= wx1; x++) if (K.free(x, y)) pave(x, y, T.PLAZA);
    // the wharf: timber decking along the sheds' fronts, its pier out into the cove, the boats either side of it
    const px0 = wx0 + 5, px1 = wx0 + 12;
    let deck = 0, ws = wy0;
    while (ws < 3790 && !isW(px0, ws)) ws++;
    const pend = Math.min(3780, ws + 14);
    const lay = (x, y) => { const i = y * W + x, t0 = tile(x, y); if (m.bld[i] >= 0) return; if (isW(x, y)) { m.set(x, y, T.DOCK); m.reserve[i] |= 16; deck++; } else if (K.free(x, y) || t0 === T.SAND || t0 === T.PLAZA) { m.set(x, y, T.DOCK); m.reserve[i] |= 16; K.take(x, y, 1, 1); deck++; } };
    for (let y = wy0; y < wy0 + 7; y++) for (let x = wx0; x <= wx1; x++) lay(x, y);
    for (let y = wy0 + 7; y <= pend; y++) for (let x = px0; x <= px1; x++) lay(x, y);
    out.wharf = deck;
    for (const [dx, dy, v] of [[1.4, 1.6, 0], [2.8, 2, 3], [1.8, 3.4, 1], [14, 1.8, 4], [15.4, 2.2, 2], [21, 2.4, 5], [22.4, 2.6, 0], [27, 2, 1], [28.4, 3.2, 3], [7.4, 9, 2], [7.6, 10.6, 4], [10.8, 13, 1], [10.6, 14.6, 5]]) prop('lobsterpots', wx0 + dx, wy0 + dy, 6, { v });
    for (const [dx, dy] of [[17.6, 4.6], [30, 4.4], [6.8, 5.6]]) prop('crates', wx0 + dx, wy0 + dy, 10);
    prop('fishtable', wx0 + 9, wy0 + 1, 0); prop('barrels', wx0 + 18.5, wy0 + 1, 10); prop('cooler', wx0 + 25, wy0 + 1.2, 0, { v: 1 }); prop('rods', px1 - 0.5, pend - 0.6, 0);
    m.parking.push({ x: Math.round((wx0 + 22) * TILE), y: Math.round((wy0 + 4.4) * TILE), a: 0 });
    for (let y = ws + 1; y < pend; y += 4) { prop('bollard', px0 + 0.3, y + 0.5, 5); prop('bollard', px1 + 0.7, y + 0.5, 5); }
    prop('lamp', px0 + 0.5, pend - 0.4, 5, { style: 'iron' }); prop('lamp', px1 + 0.5, pend - 0.4, 5, { style: 'iron' }); prop('lamp', wx1 - 1, wy0 + 6.4, 5, { style: 'iron' });
    let boats = 0;
    for (let y = ws + 3; y <= pend - 2; y += 6) for (const [bx, c] of [[px0 - 1.6, boats % 3], [px1 + 2.6, (boats + 1) % 3]]) if (isW(Math.floor(bx), y) && isW(Math.floor(bx), y + 2)) { prop('fishboat', bx, y + 1.25, 0, { c, a: Math.PI / 2 }); boats++; }
    out.boats = boats;
    m.dropSites.push({ x: Math.round((px0 + 4) * TILE), y: Math.round((pend - 1) * TILE), name: 'the end of the fish pier at Gull Harbor' });
    place('Gull Harbor Fish Wharf', wx0, qy0, wx1 + 1, pend + 1);
    // nets drying on the grass beyond the wharf
    for (const [dx, dy] of [[4, 2], [4, 7], [10, 4.5]]) prop('netrack', wx1 + dx, qy0 + dy, 8, { len: 60 });
    { const hx = px1 + 6; let s2 = wy0; while (s2 < 3790 && !isW(hx, s2)) s2++; (m.handRentals ||= []).push({ x: hx * TILE, y: (s2 - 1) * TILE, name: 'Gull Harbor Boat Hire' }); }
    place('Gull Harbor Quay', sx1 + 3, qy0, qx1 + 1, GY.edge + 1);
    // the breakwaters: 3 wide (the heads 5), stone, rubble along the sea side, a light on each head
    const mole = (L, v) => {
      const n = Math.abs(L.x1 - L.x0), dir = Math.sign(L.x1 - L.x0) || 1;
      let laid = 0, hx = L.x1, hy = L.y1;
      for (let k = 0; k <= n; k++) {
        const x = L.x0 + k * dir, yc = Math.round(L.y0 + (L.y1 - L.y0) * k / n), head = k >= n - 4;
        for (let y = yc - (head ? 2 : 1); y <= yc + (head ? 2 : 1); y++) {
          const t = tile(x, y);
          if (isW(x, y)) { if (made(x, y, T.PLAZA)) laid++; }
          else if (t === T.SAND || t === T.GRASS || t === T.DIRT) { m.set(x, y, T.PLAZA); m.reserve[y * W + x] |= 16; K.take(x, y, 1, 1); }
        }
        if (k % 2 === 0 && isW(x, yc + 3)) prop('boulder', x + 0.5 + (rnd(x, yc, 60) - 0.5) * 0.6, yc + 2.6 + rnd(x, yc, 61) * 0.6, 14, { s: 40 + Math.floor(rnd(x, yc, 62) * 4) * 10 });
        if (k % 5 === 2 && isW(x, yc - 3)) prop('boulder', x + 0.5, yc - 2.2, 12, { s: 40 });
        hx = x; hy = yc;
      }
      prop('beacon', hx + 0.5 - dir * 1.5, hy + 0.5, 12, { v });
      for (let k = 6; k < n - 6; k += 18) prop('lamp', L.x0 + k * dir + 0.5, Math.round(L.y0 + (L.y1 - L.y0) * k / n) - 0.6, 5, { style: 'iron' });
      return laid;
    };
    out.moles = mole(MOLE_W, 0) + mole(MOLE_E, 1);
    // the rocks either side of the cove (GullHarbor-A1's rocky shore): boulders along the water's edge on the flanks,
    // granite outcrops on the grass above them
    let rocks = 0;
    for (const [a, b] of [[1532, sx0 - 4], [wx1 + 14, 1728]]) for (let x = a; x <= b; x += 3) {
      let s = GY.quay; while (s < 3796 && !isW(x, s)) s++;
      if (s >= 3796 || s < GY.edge - 4) continue;
      prop('boulder', x + 0.5 + (rnd(x, s, 63) - 0.5), s - 0.4 - rnd(x, s, 64) * 0.8, 12, { s: 44 + Math.floor(rnd(x, s, 65) * 4) * 10 }); rocks++;
      if (rnd(x, s, 66) < 0.35) { let g = s; while (g > GY.quay && tile(x, g) === T.SAND) g--; if (K.free(x, g - 1)) { prop('outcrop', x + 0.5, g - 1, 18, { w: 60 + Math.floor(rnd(x, g, 67) * 4) * 16, d: 44, h: 24, style: 'granite', s: x % 4 }); rocks++; } }
    }
    out.rocks = rocks;
    for (const [x, y, a, c] of [[1566, 3752, 0.4, 0], [1572, 3758, 0.6, 2], [wx1 + 16, 3764, -0.4, 1]]) if (tile(Math.floor(x), Math.floor(y)) === T.SAND) prop('canoe', x, y, 0, { a, c });
    for (const [x, y, a] of [[1580, 3750, 1.2], [wx1 + 12, 3762, 4]]) if (tile(Math.floor(x), Math.floor(y)) === T.SAND) prop('crab', x, y, 0, { a });
    prop('gull', MOLE_W.x1 - 6, MOLE_W.y1 - 1.2, 0, { a: 0.4, z: 8 }); prop('gull', MOLE_E.x1 - 20, MOLE_E.y1 - 0.8, 0, { a: 3, z: 8 }); prop('gull', px1 + 0.4, pend - 2, 0, { a: 2, z: 8 });
    (m.landmarks ||= []).push({ name: 'Gull Harbor Breakwater', type: 'harbor', x: MOLE_W.x0 * TILE, y: (MOLE_W.y0 - 6) * TILE, w: (MOLE_E.x0 - MOLE_W.x0) * TILE, h: 12 * TILE });
    m.dropSites.push({ x: (MOLE_W.x1 - 2) * TILE, y: (MOLE_W.y1 + 0.5) * TILE, name: 'the end of the west breakwater' });
    place('Gull Harbor', 1530, GY.quay, 1730, 3796);
  }

  // ===========================================================================================================
  // Windrush Farm on Ferry Road: the farmhouse and the red barn round the yard, the silos, the farm stand at the road,
  // the orchard across the road, vegetable plots; its fields between hedgerows over the island's middle
  function farm() {
    const fx = GX.ferry + 8, fy = 3446;
    const house = K.building({ x: fx, y: fy, w: 14, h: 10, arch: 'farmhouse', name: 'Windrush Farm', whole: true, home: { kind: 'house', price: 52000, slots: 3 },
      art: { spec: { floors: 2, style: 'siding', wallColor: '#f0ece0', win: 'pair', pitch: 'gable', roof: 'shingle', roofColor: '#4a4e58', slope: 0.6, parapet: 3, grime: 0.08, blades: [], plaques: [] }, noShop: true } });
    if (house) out.homes++;
    const barn = K.building({ x: fx + 20, y: fy - 4, w: 16, h: 14, arch: 'shed', key: 'warehouse', name: 'Windrush Farm Barn', whole: true,
      art: { spec: { floors: 2, style: 'siding', wallColor: '#a8382e', win: 'none', pitch: 'gable', roof: 'metal', roofColor: '#5a5c66', slope: 0.7, parapet: 2, grime: 0.12, blades: [], plaques: [] }, noShop: true } });
    // the yard in front of them and the drive to Ferry Road
    for (let y = fy + 10; y < fy + 22; y++) for (let x = GX.ferry + 3; x < fx + 40; x++) if (K.free(x, y)) { m.set(x, y, T.DIRT); K.take(x, y, 1, 1); }
    if (barn) { prop('silo', fx + 39, fy - 2, 20); prop('silo', fx + 39, fy + 4, 20); }
    for (let k = 0; k < 4; k++) prop('hayBale', fx + 22 + k * 1.6, fy + 12, 8);
    prop('trough', fx + 32, fy + 18, 8); prop('woodpile', fx - 2, fy + 6, 8); prop('wheelbarrow', fx + 16, fy + 14, 0);
    // the farm stand at the road: produce crates under an awning, the board
    const sx = GX.ferry + 5, sy = fy + 20;
    prop('stand', sx + 1, sy, 10); prop('produce_a', sx + 3.2, sy + 0.4, 0); prop('produce_b', sx - 1.2, sy + 0.4, 0); prop('fruitcrate', sx + 4.6, sy - 0.6, 0);
    m.pois.push({ id: m.pois.length, kind: 'grocery', label: 'Windrush Farm Stand', x: Math.round((sx + 1) * TILE), y: Math.round((sy + 1.4) * TILE), r: 40, counter: true });
    prop('textsign', sx + 1, sy - 2.6, 0, { text: 'FARM STAND', bg: '#8a3a2a', fg: [255, 236, 200], z: 26, sx: 1 });
    // the vegetable plots east of the yard
    for (let y = fy + 24; y < fy + 40; y += 3) for (let x = fx + 2; x < fx + 34; x += 5) if (K.allFree(x, y, 4, 2)) { prop('raisedbed', x + 2, y + 1, 0, { v: Math.floor(rnd(x, y, 70) * 4) }); K.take(x, y, 4, 2); }
    // the orchard across the road
    let trees = 0;
    for (let y = 3430; y < 3492; y += 4) for (let x = 1588; x < GX.ferry - 6; x += 4) {
      if (!K.free(x, y) || !K.free(x + 1, y + 1)) continue;
      prop('tree_a', x + 0.5, y + 0.5, 10, { sp: rnd(x, y, 71) < 0.7 ? 'apple' : 'orange', k: 1.05 + rnd(x, y, 72) * 0.15 }); K.take(x - 1, y - 1, 3, 3); trees++;
    }
    out.orchard = trees;
    if (trees) (m.orchards ||= []).push({ x: 1587 * TILE, y: 3429 * TILE, w: (GX.ferry - 6 - 1587) * TILE, h: 64 * TILE, k: 'orchard' });   // (its ground mown, no wild flowers among the trees: the art - world3-biomes.js m.orchards)
    place('Windrush Farm', GX.ferry, 3424, fx + 44, fy + 40);
    // the fields: a grid of plots over the island's middle inside the loop road, a hedgerow round each (oaks in it now
    // and then); a couple left as meadow
    const COLS = [[1424, 1496], [1500, 1574], [1578, 1634], [1646, 1722], [1726, 1802], [1806, 1876], [1880, 1952]];
    const ROWS = [[3386, 3430], [3434, 3486], [3490, 3540], [3544, 3584]];
    let fields = 0, hedges = 0;
    for (const [ax, bx] of COLS) for (const [ay, by] of ROWS) {
      if (rnd(ax, ay, 73) < 0.18) continue;   // (a meadow)
      const x0 = ax + 2, y0 = ay + 2, x1 = bx - 2, y1 = by - 2;
      let cnt = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y) && K.free(x - 2, y) && K.free(x + 2, y) && K.free(x, y - 2) && K.free(x, y + 2)) cnt++;
      if (cnt < 400 || cnt < (x1 - x0) * (y1 - y0) * 0.9) continue;
      const lay = [];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y) && K.free(x - 2, y) && K.free(x + 2, y) && K.free(x, y - 2) && K.free(x, y + 2)) lay.push([x, y]);
      for (const [x, y] of lay) { m.set(x, y, T.FIELD); K.take(x, y, 1, 1); }
      m.fields.push({ x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
      fields++;
      // the hedgerow along its south and east sides
      for (let x = x0 - 1; x < x1 + 1; x += 2) { const y = y1 + 1; if (K.free(x, y)) { if (rnd(x, y, 74) < 0.1) prop('tree_a', x + 0.5, y + 0.5, 10, { sp: pick(['oak', 'maple', 'birch'], rnd(x, y, 75)), k: 1.25 }); else prop('shrub_a', x + 0.5, y + 0.5, 0, { sp: 'hedge', k: 1 }); hedges++; } }
      for (let y = y0 - 1; y < y1 + 1; y += 2) { const x = x1 + 1; if (K.free(x, y)) { if (rnd(x, y, 76) < 0.1) prop('tree_a', x + 0.5, y + 0.5, 10, { sp: pick(['oak', 'maple', 'birch'], rnd(x, y, 77)), k: 1.25 }); else prop('shrub_a', x + 0.5, y + 0.5, 0, { sp: 'hedge', k: 1 }); hedges++; } }
    }
    out.fields = fields; out.hedges = hedges;
  }

  // ===========================================================================================================
  // Gull Point Light on the island's west end, at the end of Gull Point Track: the tower on its rocky knoll, the
  // keeper's cottage beside it in its walled garden, a bench and a telescope looking out to sea
  function light() {
    const y = POINT[2][1];
    let lx = 1290; while (lx < 1310 && !K.allFree(lx - 2, y - 7, 5, 5)) lx++;
    if (!K.allFree(lx - 2, y - 7, 5, 5)) return;
    const b = K.building({ x: lx - 2, y: y - 7, w: 5, h: 5, arch: 'lighthouse', key: 'lighthouse', name: 'Gull Point Light', poi: false, whole: true });
    if (!b) return;
    // the keeper's cottage east of the tower, lavender either side of it
    const kx = lx + 9, ky = y - 10;
    const k = K.allFree(kx, ky, 10, 7) && K.building({ x: kx, y: ky, w: 10, h: 7, arch: 'cottage', name: "Gull Point Keeper's Cottage", whole: true, home: { kind: 'house', price: 38000, slots: 2 },
      art: { spec: { floors: 1, style: 'stone', wallColor: '#ece6da', win: 'pair', pitch: 'gable', roof: 'shingle', roofColor: '#4a4e58', slope: 0.6, parapet: 3, grime: 0.06, blades: [], plaques: [] }, noShop: true } });
    if (k) { out.homes++; prop('flowers_a', kx - 1.2, ky + 4, 0, { sp: 'lavender' }); prop('flowers_a', kx + 11.2, ky + 4, 0, { sp: 'lavender' }); }
    // the knoll: bare rock and dirt round the tower, outcrops and boulders on its flanks
    for (let yy = y - 12; yy < y + 6; yy++) for (let x = lx - 8; x < lx + 10; x++) if (K.free(x, yy) && (x - lx) * (x - lx) + (yy - y + 4) * (yy - y + 4) < 70) { m.set(x, yy, T.DIRT); K.take(x, yy, 1, 1); }
    for (const [dx, dy, w, d, h] of [[-7, -9, 90, 60, 30], [6, -14, 70, 50, 24], [-8, 3, 80, 56, 22], [4, 5, 60, 44, 20]]) prop('outcrop', lx + dx, y + dy, 18, { w, d, h, style: 'granite', s: (dx + dy + 40) % 4 });
    for (const [dx, dy] of [[-4, -11], [1, -13], [-9, -2], [7, 2]]) prop('boulder', lx + dx, y + dy, 12, { s: 52 });
    prop('pbench', lx - 4, y - 1, 0, { a: Math.PI / 2 }); prop('scope', lx - 5, y - 4, 4);
    (m.landmarks ||= []).push({ name: 'Gull Point Light', type: 'lighthouse', x: (lx - 10) * TILE, y: (y - 14) * TILE, w: 32 * TILE, h: 22 * TILE });
    place('Gull Point Light', lx - 10, y - 14, lx + 22, y + 8);
  }

  // ===========================================================================================================
  // Windrush Road's north end on the north shore (where the car ferry used to land): a bench and a coin telescope
  // looking out over the strait to the city
  function northShore() {
    const y = GY.loopN - 7;
    prop('pbench', GX.ferry - 3, y, 0); prop('scope', GX.ferry + 2, y - 1, 4); prop('fingerpost', GX.ferry - 4, GY.loopN + 6, 4);
    place('Gull Harbor North Shore', GX.ferry - 40, 3300, GX.ferry + 40, GY.loopN);
  }

  // ===========================================================================================================
  // Gull Woods Campground at the end of the Campground Track: pitches round a clearing in the pines (tents, picnic
  // tables, a fire ring), the camp's board, the path on down through the woods to Bonfire Beach
  function campground() {
    const [ex, ey] = CAMP[CAMP.length - 1], x0 = ex - 18, y0 = ey + 4, x1 = ex + 18, y1 = ey + 30;
    let pitches = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y) && (x - ex) * (x - ex) * 0.7 + (y - ey - 16) * (y - ey - 16) < 105) { m.set(x, y, T.DIRT); K.take(x, y, 1, 1); }
    for (const [dx, dy, v] of [[-8, 10, 0], [-8, 21, 1], [8, 10, 2], [8, 21, 0], [0, 25, 1]]) {
      const x = ex + dx, y = ey + dy;
      if (m.tiles[y * W + x] !== T.DIRT) continue;
      prop('tent', x, y, 14, { v }); prop('picnic', x + (dx < 0 ? 3.4 : -3.4), y + 1.6, 8); pitches++;
    }
    if (!pitches) return;
    prop('campfire', ex, ey + 15, 0, { lit: 1 });
    for (const [dx, dy, a] of [[0, 1.4, 0], [-1.6, -0.4, 1.4], [1.6, -0.4, 1.75]]) prop('driftwood', ex + dx, ey + 15 + dy, 0, { a, len: 44, seat: 1 });
    prop('woodpile', ex + 6, ey + 4, 8); prop('trashcan', ex - 4, ey + 4, 4);
    prop('textsign', ex, ey + 3, 0, { text: 'GULL WOODS CAMPGROUND', bg: '#3a4a2a', fg: [240, 230, 190], z: 26, sx: 1 });
    (m.landmarks ||= []).push({ name: 'Gull Woods Campground', type: 'camp', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
    out.pitches = pitches;
    place('Gull Woods Campground', x0, y0, x1, y1);
  }

  // ===========================================================================================================
  // Bonfire Beach below the woods on the south-west shore (WC204's cove beach with its bonfire, BE5): the driftwood fire
  // ringed with logs on the sand, surfboards stuck in it, towels, a cooler, two torches; the path down from the camp
  function bonfireBeach() {
    const bx = 1462;
    let s = 3700; while (s < 3796 && !isW(bx, s)) s++;
    if (s >= 3796) return;
    const by = s - 6;
    if (tile(bx, by) !== T.SAND) return;
    const X = (bx + 0.5) * TILE, Y = (by + 0.5) * TILE;
    prop('campfire', bx + 0.5, by + 0.5, 0, { lit: 1, big: 1 });
    for (const [dx, dy, a] of [[0, 30, 0], [-36, -4, 1.4], [36, -2, 1.75]]) prop('driftwood', bx + 0.5 + dx / TILE, by + 0.5 + dy / TILE, 0, { a, len: 50, seat: 1 });
    prop('surfboard', bx - 1.5, by - 0.4, 0, { v: 1 }); prop('surfboard', bx - 1.2, by - 0.5, 0, { v: 2 });
    prop('cooler', bx + 2, by + 1.2, 0, { v: 0 });
    for (const [dx, dy, v] of [[-1, 2.2, 0], [1.2, 2.2, 1]]) prop('towel', bx + dx, by + dy, 0, { v });
    for (const [dx, dy] of [[-2.2, 1.1], [2.8, -0.3]]) prop('torch', bx + dx, by + dy, 0);
    // the path down from the camp: sand-edged dirt through the pines
    const [ex, ey] = CAMP[CAMP.length - 1];
    const pts = [[ex, ey + 30], [ex - 8, ey + 52], [bx + 6, ey + 76], [bx + 2, by - 4]];
    for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [cx, cy] = pts[k], n = Math.ceil(Math.max(Math.abs(cx - ax), Math.abs(cy - ay))); for (let j = 0; j <= n; j++) { const x = Math.round(ax + (cx - ax) * j / n), y = Math.round(ay + (cy - ay) * j / n); for (const dx of [0, 1]) if (K.free(x + dx, y)) { m.set(x + dx, y, T.DIRT); K.take(x + dx, y, 1, 1); } } }
    (m.landmarks ||= []).push({ name: 'Bonfire Beach', type: 'bonfire', x: Math.round(X - 200), y: Math.round(Y - 150), w: 400, h: 300 });
    (m.natureSites ||= []).push({ kind: 'bonfire', hand: true, name: 'Bonfire Beach', x: Math.round(X), y: Math.round(Y) });
    place('Bonfire Beach', bx - 8, by - 6, bx + 8, s);
  }

  // ===========================================================================================================
  // The rest: Gull Woods on the south-west (pines and oaks), copses on the north shore and the east, meadow round the
  // rest under scattered oaks
  function wilds() {
    // the rocky hill east of the lanes (GullHarbor-A1: granite through the turf behind the cottages)
    for (const [x, y, w] of [[1704, 3612, 90], [1718, 3630, 70], [1708, 3645, 60], [1722, 3700, 64]]) if (K.allFree(x - 2, y - 1, 4, 3)) { prop('outcrop', x, y, 18, { w, d: 50, h: 26, style: 'granite', s: x % 4 }); K.take(x - 2, y - 1, 4, 3); }
    const woods = (x, y, r) => (r < 0.92 ? ['tree_a', pick(['pondPine', 'whitePine', 'pondPine', 'oak', 'birch'], rnd(x, y, 90)), 1.15 + rnd(x, y, 91) * 0.3] : [pick(['shrub_a', 'bush_c'], rnd(x, y, 92)), null, 1]);
    K.landscape({ rect: [1290, GY.loopS + 6, 1540, 3790], grid: 3, bare: 0.12, tree: woods });
    K.landscape({ rect: [1990, 3380, 2130, 3700], grid: 4, bare: 0.3, tree: woods });
    K.landscape({ rect: [1440, 3290, 1620, GY.loopN - 4], grid: 4, bare: 0.35, tree: woods });
    K.landscape({ grid: 7, bare: 0.6, tree: (x, y, r) => (r < 0.9 ? ['tree_a', pick(['oak', 'oak', 'maple', 'birch', 'whitePine'], rnd(x, y, 93)), 1.2 + rnd(x, y, 94) * 0.25] : ['bush_c', null, 1]) });
    place('Gull Woods', 1290, GY.loopS + 6, 1540, 3790);
  }
}
