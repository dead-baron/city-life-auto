// World v3, handcrafted: The Yards (district 3), the rough industrial island east of the river channel, from the owner's
// concepts WC406 (the freight sidings, the salvage yard, the warehouses, the plant's silos and tanks, the sheet-piled
// quay) and WC407 (the level crossing by the liquor store, the loading dock, the trailers behind their fence), with
// WC001, WC003, WC009, WC010 and WC233 (the rail yard and the back lots). The grid's sea of plain roofs gives way to:
//   - its streets where the island needs them: Yards Avenue up the middle, Central Avenue, Midtown Boulevard and Harbor
//     Avenue across (Harbor Avenue off the Yards Bridge), Channel Street along the quay, and the short streets east of
//     the avenue to the Gulf Loop and Juniper Street; Central Avenue now crosses the main line at grade by Northgate
//     Station (the level crossing's barriers and lights: shared/map.js railXings) and runs on under the Gulf Loop;
//   - under the Gulf Loop's deck in the north: Yards Auto Salvage (its tyres, drums, scrap heaps and stacked boxes behind
//     barbed wire, the office, the cars waiting in rows) and Bayline Aggregates (gravel heaps, the
//     hopper, the loader);
//   - Rivet & Sons Ironworks round its water tower; the freight sidings beside the main line (boxcars and tank cars
//     standing, the yard office, the light masts); the warehouses along Central Avenue and the boulevard with their
//     loading docks (box trucks backed in, forklifts, pallets); the Old Freight House (the biggest: shared/bowling.js
//     makes it Pinwheel Lanes);
//   - by the crossing: Yards Liquor on the corner, the Rail Car Diner, the pawn shop the Syndicate holes up in; across the
//     tracks the Railside Trailer Court behind its fence;
//   - the Yards Intermodal Terminal (boxes on the sidings, the gantry crane), the workshops along Harbor Avenue (the body
//     shop, the tyre place, Hardline Workwear, the Back-Alley Exchange in the old tavern), the union hall;
//   - in the south: Gulf Cement Works (its silos, its conveyor, its quay), the Gulf Fuel Terminal's tank farm behind its
//     bund, a construction site, the Pink Line's station square;
//   - Channel Quay along the channel: the sheet piling's bollards, the boxes on the apron, the crane.
// Deterministic like every plan (shared/world3-hand.js): tiles, fixed vertices and hash draws only.
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 3;   // The Yards' district id (shared/mapcore.js DISTRICTS)
// the streets (tiles): north-south x, east-west y
export const YX = { ch: 4021, ya: 4101, sp: 4181, jn: 4261 };
export const YY = { nq: 1493, rail: 1597, central: 1701, tank: 1751, blvd: 1801, spur: 1851, harbor: 1901, foundry: 1951, gas: 2001 };

function streets() {
  const out = [];
  const add = (name, kind, pts, o = {}) => out.push({ name, kind, pts, ...o });
  const { ch, ya, sp, jn } = YX, Y = YY;
  add('Yards Avenue', 'ave', [[ya, Y.nq], [ya, 2048]]);
  add('Channel Street', 'st', [[ch, Y.nq], [ch, 1903], [ch, Y.gas]]);
  add('North Quay Road', 'st', [[ch, Y.nq], [ya, Y.nq]]);
  add('North Quay Road', 'st', [[ya, Y.nq], [4150, Y.nq]], { culdesac: true });
  add('Rail Street', 'st', [[ch, Y.rail], [ya, Y.rail], [4223, Y.rail]]);
  add('Rail Street', 'st', [[4240, Y.rail], [jn, Y.rail]]);
  // (over the main line at grade by Northgate Station, and on under the Gulf Loop's deck to Juniper Street)
  add('Central Avenue', 'ave', [[ch, Y.central], [ya, Y.central], [sp, Y.central], [jn, Y.central]]);
  add('Tank Street', 'st', [[ya, Y.tank], [jn, Y.tank]]);
  add('Midtown Boulevard', 'blvd', [[ch, Y.blvd], [ya, Y.blvd], [jn, Y.blvd]]);
  add('Spur Street', 'st', [[sp, Y.spur], [jn, Y.spur]]);
  add('Spruce Street', 'st', [[sp, Y.spur], [sp, Y.harbor], [sp, Y.foundry], [sp, Y.gas]]);
  // (off the Yards Bridge: the bridge comes ashore at 3985, 1905)
  add('Harbor Avenue', 'ave', [[3985, 1905], [ch, 1903], [ya, Y.harbor], [sp, Y.harbor], [jn, Y.harbor]]);
  add('Foundry Road', 'st', [[ch, Y.foundry], [ya, Y.foundry], [sp, Y.foundry], [jn, Y.foundry]]);
  add('Gasworks Lane', 'st', [[ch, Y.gas], [ya, Y.gas], [sp, Y.gas]]);
  return out;
}

export const YARDS = {
  key: 'yards', d: D, rect: [3940, 1440, 4260, 2100],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of The Yards)
  specials: ['Back-Alley Exchange', 'Construction Site'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
const BRICK = ['#7a3a30', '#8a4434', '#6e3a2e', '#9a5040'];
const CORR = ['#7a8a8a', '#5a6a7a', '#8a7a6a', '#6a7a6a', '#9a9a92', '#3e5a7a'];
const ROOFM = ['#56626e', '#6a5a50', '#5a5e64', '#4a4e56'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place: place0 } = towerKit(K, out);
  // a lot placed whole: moved back off a pavement it overlaps (up for one facing south, down for one facing north), or
  // given up a tile or two at its sides or its back where a pavement wanders into it (or null)
  const place = (o) => {
    const dir = o.face === 'N' ? 1 : -1;
    for (const [sh, cut] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [2, 2], [4, 4], [6, 6]]) for (const [l, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 3], [4, 4]]) {
      const x = o.x + l, w = o.w - l - r, h = o.h - cut, y = o.y + dir * sh + (dir < 0 ? cut : 0);
      if (w < 4 || h < 3 || !K.allFree(x, y, w, h)) continue;
      return place0({ ...o, x, y, w, h, ...(typeof o.door === 'number' ? { door: Math.min(x + w - 1, Math.max(x, o.door)) } : {}) });
    }
    return null;
  };
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  // a building's looks: an old brick warehouse or a corrugated shed, its roller doors, grime; a business's sign
  const wh = (x, y, o = {}) => {
    const brick = o.brick ?? rnd(x, y, 21) < 0.45, gable = !brick && rnd(x, y, 22) < 0.55;
    return { spec: { grime: 0.35 + rnd(x, y, 23) * 0.25, ...(brick ? { style: 'brick', brickTone: pick(BRICK, rnd(x, y, 24)), roofMat: pick(['tar', 'gravel', 'membrane'], rnd(x, y, 25)) } : { style: 'corrugated', wallColor: pick(CORR, rnd(x, y, 26)), ...(gable ? { pitch: 'gable', roof: 'metal', roofColor: pick(ROOFM, rnd(x, y, 27)), slope: 0.2 } : { roofMat: 'tar' }) }), ...(o.spec || {}) } };
  };
  const ctx = { place, wh, tile, out };
  // the set pieces, north to south (each takes its ground first), then the rows round them
  salvage(K, m, ctx);
  aggregates(K, m, ctx);
  ironworks(K, m, ctx);
  sidings(K, m, ctx);
  crossing(K, m, ctx);
  trailers(K, m, ctx);
  freightHouse(K, m, ctx);
  intermodal(K, m, ctx);
  workshops(K, m, ctx);
  cement(K, m, ctx);
  tankFarm(K, m, ctx);
  southSide(K, m, ctx);
  channelQuay(K, m, ctx);
  // what's left between the set pieces: warehouses with their yards (a van parked, pallets, a dumpster)
  const WHN = ['Gulf Coast Freight', 'Ironhorse Logistics', 'Bayline Paper Co', 'Atlas Moving & Storage', 'Kessler Bros. Produce', 'Union Box & Crate', 'Delta Steel Supply', 'Coastline Cold Storage',
    'Harmon Pipe & Valve', 'Redline Couriers', 'Cooper Lumber', 'Tri-State Tire', 'Northside Paper Stock', 'Keel & Hull Marine Supply', 'Great Lakes Glass', 'Sterling Fasteners', 'Midway Salvage Parts', 'Ace Pallet Co',
    'Railway Express Agency', 'Quayside Coffee Roasters', 'Barrow & Sons Cartage', 'Iron City Bolt', 'Gulf Brewing Supply', 'Spindle Textile Mill', 'Copperline Wire & Cable', 'Big Shoulders Moving',
    'Yards Ice Co', 'Benton Bakery Supply', 'Crown Cork & Seal', 'Hollis Hardware Wholesale', 'Seaboard Rope Works', 'Anchor Paint & Coatings', 'Foundry Row Machining', 'Patel Restaurant Supply',
    'Sunrise Linen Service', 'Mercer Tool & Die', 'Blackwater Fisheries Cold Store', 'Granite State Stoneworks', 'Lakeside Feed & Grain', 'Velocity Parcel', 'Dockside Uniform Co', 'Riverside Printing',
    'Kraus Electrical Supply', 'Tidewater Batteries', 'Ozark Lumber Yard', 'Pioneer Plastics', 'Union Rail Car Repair', 'Morrow Glassworks'];
  let wi = 0;
  const whRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 10) return room >= 1 ? { gap: room, kind: 'yard' } : null;
    if (wi >= WHN.length) return { gap: Math.min(room, 14), kind: 'yard' };
    const w = room <= 30 ? room : 18 + Math.floor(rnd(x, y1, 31) * 14), name = WHN[wi++];
    return { w, depth: o.depth || 22 + Math.floor(rnd(x, y1, 32) * 6), arch: rnd(x, y1, 33) < 0.25 ? 'factory' : 'warehouse', key: 'warehouse', name, poi: { kind: 'delivery', label: name }, whole: true, ...(o.north ? { face: 'N' } : {}), art: wh(x, y1) };
  }, { rough: true, ...(o.north ? { north: true } : {}) });
  // Central Avenue to the boulevard west of Yards Avenue: a row facing each, the truck court between them
  whRow(4026, 4097, 1706, 1797, { north: true, depth: 32 });
  whRow(4026, 4097, 1706, 1797, { depth: 32 });
  docks(K, m, 1706, 1797);
  // the blocks the set pieces left: warehouses facing the streets each side, their yards between
  whRow(4106, 4176, 1497, 1515);
  whRow(4106, 4183, 1603, 1694, { depth: 26 });
  whRow(4106, 4183, 1603, 1694, { north: true, depth: 24 });
  whRow(4192, 4224, 1604, 1695, { north: true, depth: 20 });
  whRow(4192, 4224, 1604, 1695, { depth: 20 });
  whRow(4026, 4040, 1603, 1696, { north: true, depth: 22 });
  whRow(4026, 4040, 1603, 1696, { depth: 22 });
  whRow(4106, 4183, 1756, 1794, { north: true, depth: 18 });
  whRow(4106, 4183, 1756, 1794, { depth: 18 });
  whRow(4192, 4224, 1756, 1794, { depth: 18 });
  whRow(4186, 4256, 1807, 1846, { north: true, depth: 18 });
  whRow(4186, 4256, 1807, 1846, { depth: 18 });
  whRow(4186, 4256, 1856, 1894, { depth: 20 });
  // the dives along Central Avenue behind the liquor store, facing the avenue (the crossing's other corner)
  const DIVES = [['The Switchman', 12], ['Yards Check Cashing', 10], ['Lucky 7 Billiards', 12], ['Ray\'s Bait & Beer', 10]];
  let dv = 0;
  K.row(4106, 4160, 1707, 1733, (x, room) => {
    const L = DIVES[dv++];
    if (!L || room < 8) return room >= 1 ? { gap: Math.min(room, 6), kind: 'yard' } : null;
    const w = Math.min(room, L[1]);
    return { w, depth: 14, arch: 'rough', key: 'apt2', face: 'N', name: L[0], poi: { kind: 'delivery', label: L[0] }, whole: true, art: { spec: { floors: 2, style: 'brick', brickTone: pick(BRICK, rnd(x, 1707, 34)), grime: 0.6, graffiti: 1 }, noShop: true } };
  }, { rough: true, north: true });
  // the workshops' backs: more of them facing Harbor Avenue across their yards
  whRow(4026, 4097, 1906, 1947, { north: true, depth: 16 });
  whRow(4106, 4177, 1906, 1947, { north: true, depth: 16 });
  // the rough flats between Foundry Road and Gasworks Lane east of the station square: brick walk-ups, the railmen's
  // (the district's homes besides the trailers)
  const flats = (x0, x1, y0, y1, north) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 7) return room >= 1 ? { gap: room, kind: 'yard' } : null;
    const w = room <= 12 ? room : 8 + Math.floor(rnd(x, y0, 35) * 4);
    return { w, depth: 14, arch: 'rough', key: 'apt2', home: { kind: 'apartment' }, whole: true, ...(north ? { face: 'N' } : {}), art: { spec: { floors: 2 + Math.floor(rnd(x, y0, 36) * 2), style: 'brick', brickTone: pick(BRICK, rnd(x, y0, 37)), grime: 0.6, graffiti: rnd(x, y0, 38) < 0.5 ? 1 : 0, ...(rnd(x, y0, 39) < 0.5 ? { fireEscape: [40, 50] } : null) }, noShop: true } };
  }, { rough: true, ...(north ? { north: true } : {}) });
  flats(4130, 4177, 1956, 1996, true);
  flats(4130, 4177, 1956, 1996, false);
  // what's still open: gravel and rough ground (the grass under the Gulf Loop's ramps and by the shore stays, weeds in it)
  K.landscape({ rect: [4168, 1532, 4262, 1600], bare: 0.5, tree: (x, y, r) => r < 0.4 ? ['tree_b', pick(['oak', 'birch'], rnd(x, y, 831)), 0.95] : ['shrub_a', null, 1] });
  K.landscape({ rect: [4236, 1600, 4262, 1960], bare: 0.6, tree: () => ['shrub_a', null, 1] });
  ground(K, 3960, 1470, 4262, 2070);
  const near = new Set();
  for (const q of m.props) { const qx = Math.floor(q.x / TILE), qy = Math.floor(q.y / TILE); if (qx >= 3960 && qx < 4262 && qy >= 1470 && qy < 2070) near.add(qy * 8192 + qx); }
  const busy = (tx, ty) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (near.has((ty + dy) * 8192 + tx + dx)) return true; return false; };
  for (let y = 1500; y < 2060; y += 7) for (let x = 3980; x < 4260; x += 7) {
    const tx = x + Math.floor(rnd(x, y, 843) * 5), ty = y + Math.floor(rnd(y, x, 844) * 5);
    if (rnd(tx, ty, 845) > 0.35) continue;
    let ok = true;
    for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3; dx++) { const q = tile(tx + dx, ty + dy); if (q !== T.LOT || m.bld[m.idx(tx + dx, ty + dy)] >= 0) { ok = false; break; } }
    if (ok && !busy(tx, ty) && !(out.places || []).some((q) => tx >= q.x0 && tx < q.x1 && ty >= q.y0 && ty < q.y1)) prop('tree_b', tx + 0.5, ty + 0.5, 12, { sp: pick(['oak', 'birch', 'street', 'oak'], rnd(tx, ty, 846)), k: 0.9 + rnd(ty, tx, 847) * 0.25 });
  }
  for (let y = 1500; y < 2060; y += 3) for (let x = 3980; x < 4260; x += 3) {
    if (rnd(x, y, 841) > 0.06) continue;
    const t = tile(x, y), n = tile(x, y - 1), sd = tile(x + 1, y);
    if (t === T.LOT && m.bld[m.idx(x, y)] < 0 && (n === T.BUILDING || sd === T.BUILDING || n === T.SIDEWALK)) prop(rnd(x, y, 842) < 0.7 ? 'shrub_a' : 'tires', x + 0.5, y + 0.5, 0);
  }
  void api;
  return out;
}

// a chain-link fence along a line (tiles), in 4-tile panels, leaving out [a, b] gaps (the gates)
function fence(K, x0, y0, x1, y1, gaps = []) {
  const horiz = y0 === y1, n = Math.max(1, Math.round((horiz ? x1 - x0 : y1 - y0) / 4));
  for (let k = 0; k < n; k++) {
    const a = (horiz ? x0 : y0) + ((horiz ? x1 - x0 : y1 - y0) * k) / n, b = (horiz ? x0 : y0) + ((horiz ? x1 - x0 : y1 - y0) * (k + 1)) / n;
    if (gaps.some(([g0, g1]) => b > g0 && a < g1)) continue;
    if (horiz) K.prop('yfence', a, y0, 0, { x1: b * TILE, y1: y0 * TILE });
    else K.prop('yfence', x0, a, 0, { x1: x0 * TILE, y1: b * TILE });
  }
}
// the ground of a yard: every free tile in the box made `t` (gravel lot by default) and taken
function ground(K, x0, y0, x1, y1, t = T.LOT) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, t);
  K.take(x0, y0, x1 - x0, y1 - y0);
}

// ---------------------------------------------------------------------------------------------------------------
// Yards Auto Salvage (WC406's top left, WC407's right), under the Gulf Loop's deck between Channel Street and Yards
// Avenue: behind barbed chain-link, rows of cars waiting for the crusher, tyre stacks, oil drums, scrap heaps and rusted
// boxes, the office by the gate with its sign
function salvage(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, out } = ctx;
  const X0 = 4026, X1 = 4097, Y0 = 1498, Y1 = 1593;
  const office = place({ x: X0 + 2, y: Y1 - 8, w: 12, h: 7, arch: 'yardoffice', key: 'junkyard', name: 'Yards Auto Salvage', poi: { kind: 'delivery', label: 'Yards Auto Salvage' }, whole: true });
  ground(K, X0, Y0, X1, Y1 + 1);
  const lot = (x, y) => K.m.inside(x, y) && K.m.tiles[K.m.idx(x, y)] === T.LOT && K.m.bld[K.m.idx(x, y)] < 0;
  // the cars waiting in rows (parked: they're the yard's, nobody drives them off)
  for (const ry of [Y0 + 40, Y0 + 52]) for (let rx = X0 + 20; rx < X1 - 6; rx += 4) if (lot(rx, ry) && lot(rx, ry + 3) && rnd(rx, ry, 41) < 0.75) m.parking.push({ x: (rx + 0.5) * TILE, y: (ry + 1.5) * TILE, a: Math.PI / 2 + (rnd(ry, rx, 42) < 0.5 ? 0 : Math.PI), model: pick(['sedan', 'compact', 'pickup', 'sedan', 'compact', 'van'], rnd(rx, ry, 43)), bare: true });
  // the heaps: scrap piled up in mounds - tyres, rubble, pipe, drums, rubbish - each a dozen pieces tumbled together
  const HEAPS = [[X0 + 26, Y0 + 6], [X0 + 42, Y0 + 7], [X0 + 58, Y0 + 6], [X0 + 30, Y0 + 26], [X0 + 50, Y0 + 27], [X0 + 30, Y0 + 66], [X0 + 48, Y0 + 68], [X0 + 62, Y0 + 70], [X0 + 6, Y0 + 30], [X0 + 6, Y0 + 50]];
  for (const [hx, hy] of HEAPS) for (let k = 0; k < 14; k++) {
    const a = rnd(hx, k, 44) * 6.283, r = Math.sqrt(rnd(k, hy, 45)) * 4.2, x = hx + Math.cos(a) * r * 1.3, y = hy + Math.sin(a) * r * 0.8;
    if (!lot(Math.floor(x), Math.floor(y))) continue;
    prop(pick(['tires', 'rubble', 'rubble', 'pipes', 'drum', 'trashpile', 'tires', 'rubble'], rnd(k, hx + hy, 46)), x, y, k % 3 ? 0 : 10);
  }
  for (const [x, y] of [[X0 + 14, Y0 + 18], [X0 + 40, Y0 + 82]]) if (lot(Math.floor(x), Math.floor(y))) { prop('cstack', x, y, 0, { v: 5, tall: 240 }); for (const ox of [-1.2, 1.2]) K.m.addSolidProp((x + ox) * TILE, y * TILE, 40); }
  for (let y = Y0 + 4; y < Y1 - 12; y += 6) if (lot(X1 - 3, y) && lot(X1 - 3, y + 4)) prop('container', X1 - 2.5, y + 2, 18, { c: 4, a: Math.PI / 2 });
  for (const [x, y] of [[X0 + 6, Y1 - 12], [X0 + 12, Y0 + 8]]) if (lot(x, y)) prop('burnbarrel', x, y, 6);
  // the fence round it, the gate on Yards Avenue
  fence(K, X0, Y0, X0, Y1); fence(K, X1, Y0, X1, Y1, [[Y1 - 12, Y1 - 4]]); fence(K, X0, Y0, X1, Y0); fence(K, X0, Y1 + 0.6, X1, Y1 + 0.6, [[X0 + 1, X0 + 15]]);
  prop('ygate', X1 - 0.4, Y1 - 10, 0, { a: Math.PI / 2 });
  prop('textsign', X0 + 8, Y1 - 0.4, 0, { text: 'YARDS AUTO SALVAGE', bg: '#2a2a2e', fg: [240, 200, 60], z: 32, sx: 1, lit: true });
  if (office) prop('skullsign', X0 + 15.5, Y1 - 1.2, 0);
  (out.places ||= []).push({ name: 'Yards Auto Salvage', x0: X0, y0: Y0, x1: X1, y1: Y1 });
}

// Bayline Aggregates (WC406): gravel and sand heaps under the deck east of Yards Avenue, the hopper, the loader, the
// scale house by the gate
function aggregates(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, out } = ctx;
  const X0 = 4106, X1 = 4170, Y0 = 1532, Y1 = 1593;
  if (!K.allFree(X0 + 2, Y1 - 6, 8, 5)) return;
  place({ x: X0 + 2, y: Y1 - 6, w: 8, h: 5, arch: 'hut', name: 'Bayline Aggregates', poi: { kind: 'delivery', label: 'Bayline Aggregates' }, whole: true, roof: 'tar' });
  ground(K, X0, Y0, X1, Y1 + 1);
  const lot = (x, y) => K.m.inside(x, y) && K.m.tiles[K.m.idx(x, y)] === T.LOT && K.m.bld[K.m.idx(x, y)] < 0;
  let k = 0;
  for (const [hx, hy] of [[X0 + 10, Y0 + 12], [X0 + 24, Y0 + 10], [X0 + 38, Y0 + 13], [X0 + 16, Y0 + 30], [X0 + 32, Y0 + 32], [X0 + 48, Y0 + 30]]) for (let j = 0; j < 16; j++) {
    const a = rnd(hx, j, 47) * 6.283, r = Math.sqrt(rnd(j, hy, 48)) * 4, x = hx + Math.cos(a) * r * 1.2, y = hy + Math.sin(a) * r * 0.8;
    if (lot(Math.floor(x), Math.floor(y))) { prop('gravel', x, y, j % 4 ? 0 : 14); k++; }
  }
  prop('silo', X1 - 6, Y0 + 6, 20, { h: 80 });
  prop('pipes', X1 - 10, Y0 + 8, 0); prop('forklift', X0 + 14, Y1 - 3, 16, { a: 0 });
  fence(K, X0, Y0, X1, Y0); fence(K, X1, Y0, X1, Y1);
  prop('textsign', X0 + 6, Y1 - 0.2, 0, { text: 'BAYLINE AGGREGATES', bg: '#3a3e44', fg: [240, 230, 200], z: 28, sx: 1 });
  (out.places ||= []).push({ name: 'Bayline Aggregates', x0: X0, y0: Y0, x1: X1, y1: Y1 });
}

// Rivet & Sons Ironworks (WC406's brick plant): the long brick shop on Central Avenue, the water tower over its yard, the
// stacks of pipe and steel, the gate on Rail Street (the main line's station under the corner: kept clear)
function ironworks(K, m, ctx) {
  const { prop } = K;
  const { place, wh, out } = ctx;
  const X0 = 4040, X1 = 4097, Y0 = 1602, Y1 = 1697;
  const b = place({ x: X0, y: Y1 - 46, w: X1 - X0, h: 46, arch: 'factory', key: 'industrial', name: 'Rivet & Sons Ironworks', poi: { kind: 'delivery', label: 'Rivet & Sons Ironworks' }, whole: true,
    art: wh(X0, Y1, { brick: true, spec: { brickTone: '#7a3a30', win: 'loft', cornice: 'step', parapet: 10 } }) });
  if (!b) return;
  place({ x: X0 + 30, y: Y0 + 2, w: 26, h: 16, arch: 'shed', key: 'warehouse', name: 'Rivet & Sons Steel Store', face: 'N', poi: false, whole: true, art: wh(X0 + 30, Y0, { brick: false }) });
  ground(K, X0, Y0, X1, b.ty);
  prop('watertower', X0 + 8, Y0 + 10, 16, { h: 100 });
  for (let k = 0; k < 8; k++) prop(k % 2 ? 'pipes' : 'lumber', X0 + 16 + (k % 4) * 3.5, Y0 + 22 + Math.floor(k / 4) * 3, 10);
  prop('forklift', X0 + 30, b.ty - 4, 16, { a: Math.PI / 2 });
  fence(K, X0, Y0, X1, Y0, [[X0 + 22, X0 + 30]]); prop('ygate', X0 + 24, Y0 - 0.2, 0, { a: 0 });
  prop('textsign', X0 + 12, b.ty + b.th + 0.6, 0, { text: 'RIVET & SONS IRONWORKS', bg: '#2a2420', fg: [236, 200, 120], z: 34, sx: 1, lit: true });
  (out.places ||= []).push({ name: 'Rivet & Sons Ironworks', x0: X0, y0: Y0, x1: X1, y1: Y1 });
}

// The freight sidings beside the main line (WC406), north of Northgate Station's car park: four sidings, boxcars and
// tank cars standing on them, the yard office, the light masts, the shunters' cabin
function sidings(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, out } = ctx;
  const X0 = 4130, X1 = 4180, Y0 = 1602, Y1 = 1656;
  const o = place({ x: X0 + 1, y: Y1 - 8, w: 9, h: 6, arch: 'yardoffice', name: 'Yards Freight Office', poi: { kind: 'delivery', label: 'Yards Freight Office' }, whole: true });
  ground(K, X0, Y0, X1, Y1, T.DIRT);
  const free = (x, y) => K.m.inside(x, y) && K.m.tiles[K.m.idx(x, y)] === T.DIRT && K.m.bld[K.m.idx(x, y)] < 0;
  const len = Y1 - Y0 - 4, cy = (Y0 + Y1) / 2;
  let n = 0;
  for (let k = 0; k < 5; k++) {
    const x = X1 - 4 - k * 6;
    if (!free(x, Y0 + 2) || !free(x, Y1 - 3)) continue;
    prop('rails', x + 0.5, cy, 0, { len: len * TILE });
    // the wagons: a train of them, a gap or two
    for (let y = Y0 + 4, j = 0; y + 7 < Y1 - 2; y += 7.6, j++) {
      if (rnd(x, Math.floor(y), 51) < 0.22) continue;
      const tank = rnd(Math.floor(y), x, 52) < (k === 1 ? 0.8 : 0.25);
      prop(tank ? 'tankcar' : 'boxcar', x + 0.5, y + 3.5, 0, { a: Math.PI / 2, c: Math.floor(rnd(x, Math.floor(y), 53) * 4), tall: 80 });
      for (let dy = 0.6; dy < 7; dy += 1.6) K.m.addSolidProp((x + 0.5) * TILE, (y + dy) * TILE, 28);
      n++;
    }
  }
  for (const y of [Y0 + 4, Y1 - 12]) prop('ymast', X0 + 2, y, 0, { tall: 160 });
  if (o) prop('textsign', X0 + 5.5, Y1 - 1.4, 0, { text: 'YARDS FREIGHT', bg: '#7a2e2e', fg: [250, 230, 190], z: 28, sx: 1 });
  (out.places ||= []).push({ name: 'The Freight Sidings', x0: X0, y0: Y0, x1: X1, y1: Y1, wagons: n });
}

// By the level crossing (WC407): Yards Liquor on the corner of Central Avenue and the tracks, its bottle sign lit; the
// Rail Car Diner along from it; Danny's Pawn & Loan (where the Syndicate holes up: shared/map.js buildGangHQs takes the
// storefront nearest the district's heart that isn't fixed); graffiti on the back walls, a taxi at the kerb
function crossing(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  const y1 = 1747;   // (Tank Street's pavement)
  const liq = place({ x: 4160, y: y1 - 13, w: 18, h: 13, arch: 'liquor', key: 'liquor', name: 'Yards Liquor', poi: { kind: 'convenience', label: 'Yards Liquor' }, whole: true,
    art: { spec: { floors: 2, style: 'brick', brickTone: '#8a4434', grime: 0.4, parapet: 8 }, shop: { kind: 'liquor', door: 'right', open: true, people: 2, grille: true, openSign: true, awning: ['#2f6a4e', '#2f6a4e'], sign: { text: 'YARDS LIQUOR', bg: '#2a1e1a', fg: [250, 220, 140], lit: true } } } });
  if (liq) prop('dump_g', 4161.5, y1 - 14.2, 10);
  place({ x: 4136, y: y1 - 12, w: 22, h: 12, arch: 'diner', key: 'diner', name: 'Rail Car Diner', poi: { kind: 'coffee', label: 'Rail Car Diner', food: true }, whole: true });
  // (the storefront the Syndicate takes: a plain delivery stop, not fixed)
  place({ x: 4108, y: y1 - 14, w: 14, h: 14, arch: 'rough', key: 'apt2', name: "Danny's Pawn & Loan", poi: { kind: 'delivery', label: "Danny's Pawn & Loan", fixed: false }, whole: true,
    art: { spec: { floors: 2, style: 'brick', brickTone: '#6e3a2e', grime: 0.6, graffiti: 2, boarded: 0.3 }, shop: { kind: 'pawn', door: 'left', open: true, people: 1, grille: true, sign: { text: 'PAWN & LOAN', bg: '#1e2a1e', fg: [240, 220, 80], lit: true } } } });
  // a taxi at the kerb on Central Avenue
  m.parking.push({ x: 4150 * TILE, y: 1715 * TILE, a: 0, model: 'taxi' });
  (out.places ||= []).push({ name: 'Yards Liquor', x0: 4160, y0: y1 - 13, x1: 4178, y1 });
}

// The Railside Trailer Court (WC407's right), across the tracks under the Gulf Loop: single-wides in rows on gravel
// lanes behind a fence, palms, a barbecue, the gate on Tank Street
function trailers(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, out } = ctx;
  const X0 = 4197, X1 = 4229, Y0 = 1707, Y1 = 1747;
  let n = 0;
  for (let y = Y0 + 1; y + 5 <= Y1 - 1; y += 8) {
    for (let x = X0 + 1; x + 12 <= X1; x += 14) {
      const b = place({ x, y, w: 12, h: 4, arch: 'shack', key: 'shack', name: 'Railside Trailer Court', poi: false, home: { kind: 'shack', name: `Railside Trailer Court #${n + 1}` }, door: x + 3, whole: true,
        art: { spec: { style: rnd(x, y, 61) < 0.6 ? 'siding' : 'corrugated', wallColor: pick(['#e8e4dc', '#d8d0b8', '#c8d4d8', '#e0d8c0', '#b8c4b0'], rnd(x, y, 62)), roof: 'metal', grime: 0.4 }, noShop: true } });
      if (b) { n++; out.homes++; prop(pick(['chair', 'potted', 'tires', 'cooler'], rnd(x, y, 63)), x + 9, y + 5.2, 0); }
    }
  }
  ground(K, X0, Y0, X1, Y1 + 1);
  for (const [x, y] of [[X0 + 0.6, Y0 + 3], [X1 - 0.6, Y0 + 12], [X0 + 0.6, Y1 - 6]]) prop('palm_a', x, y, 10, { sp: 'smallPalm', k: 1 });
  fence(K, X0, Y0, X1, Y0); fence(K, X0, Y0, X0, Y1); fence(K, X1, Y0, X1, Y1); fence(K, X0, Y1 + 0.6, X1, Y1 + 0.6, [[X0 + 12, X0 + 18]]);
  prop('textsign', X0 + 15, Y1 + 0.2, 0, { text: 'RAILSIDE TRAILER COURT', bg: '#3a4a3a', fg: [240, 232, 200], z: 26, sx: 1 });
  (out.places ||= []).push({ name: 'Railside Trailer Court', x0: X0, y0: Y0, x1: X1, y1: Y1, homes: n });
}

// The Old Freight House (the biggest warehouse in the city: shared/bowling.js puts Pinwheel Lanes in it) on the
// boulevard west of Yards Avenue, and Consolidated Freight beside it with its trucks at the doors
function freightHouse(K, m, ctx) {
  const { prop } = K;
  const { place, wh, out } = ctx;
  const Y0 = 1806, Y1 = 1897;
  const b = place({ x: 4027, y: Y1 - 40, w: 62, h: 40, arch: 'warehouse', key: 'warehouse', name: 'Old Freight House', poi: { kind: 'delivery', label: 'Old Freight House' }, whole: true,
    art: wh(4027, Y1, { brick: true, spec: { brickTone: '#8a4434', win: 'arch', cornice: 'bracket', parapet: 10, grime: 0.3 } }) });
  const c = place({ x: 4027, y: Y0, w: 44, h: 30, arch: 'warehouse', key: 'warehouse', name: 'Consolidated Freight', face: 'N', poi: { kind: 'delivery', label: 'Consolidated Freight' }, whole: true, art: wh(4027, Y0, { brick: false }) });
  if (c) for (let k = 0; k < 4; k++) m.parking.push({ x: (4031 + k * 6) * TILE, y: (Y0 - 3) * TILE, a: -Math.PI / 2, model: k === 2 ? 'van' : 'boxtruck' });
  if (b) for (let k = 0; k < 3; k++) prop('pallet', 4034 + k * 9, Y1 + 1.2, 0);
  (out.places ||= []).push({ name: 'Old Freight House', x0: 4027, y0: Y1 - 40, x1: 4089, y1: Y1 });
}

// The Yards Intermodal Terminal (WC406's boxes): north of Spur Street east of Yards Avenue - the sidings with boxes on
// flatcars, the gantry crane over two of them, stacks waiting, the trucks, the light masts, the gatehouse
function intermodal(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, out } = ctx;
  const X0 = 4106, X1 = 4183, Y0 = 1806, Y1 = 1897;
  place({ x: X0 + 2, y: Y0 + 1, w: 6, h: 4, arch: 'hut', name: 'Intermodal Gatehouse', whole: true, roof: 'tar', face: 'N' });
  ground(K, X0, Y0, X1, Y1);
  const lot = (x, y) => K.m.inside(x, y) && K.m.tiles[K.m.idx(x, y)] === T.LOT && K.m.bld[K.m.idx(x, y)] < 0;
  // the sidings, north-south, the boxes on them two by two (40-footers on the flatcars)
  const len = Y1 - Y0 - 12, cy = Y0 + 8 + len / 2;
  const xs = [];
  for (let x = X0 + 22; x < X1 - 6; x += 7) xs.push(x);
  for (const x of xs) {
    if (!lot(x, Y0 + 8) || !lot(x, Y1 - 4)) continue;
    prop('rails', x + 0.5, cy, 0, { len: len * TILE });
    for (let y = Y0 + 10; y + 8 < Y1 - 4; y += 9) { if (rnd(x, y, 71) < 0.25) continue; prop('container', x + 0.5, y + 4, 0, { c: Math.floor(rnd(y, x, 72) * 5), a: Math.PI / 2 }); for (let dy = 1; dy < 8; dy += 2) K.m.addSolidProp((x + 0.5) * TILE, (y + dy) * TILE, 26); }
  }
  // the gantry crane over the middle sidings, its rails
  const gx = xs[Math.floor(xs.length / 2)] || X0 + 40;
  prop('gantryCrane', gx + 0.5, cy, 0, { a: Math.PI / 2, span: 260, h: 200, tall: 210 });
  for (const dx of [-4, 4]) for (const dy of [-1, 1]) K.m.addSolidProp((gx + 0.5 + dx) * TILE, (cy + dy) * TILE, 10);
  // the stacks waiting by the gate, the trucks, the masts
  for (let y = Y0 + 10; y < Y1 - 10; y += 6) if (lot(X0 + 6, y) && lot(X0 + 10, y + 2)) { prop('cstack', X0 + 9, y + 2.5, 0, { v: Math.floor(rnd(X0, y, 73) * 6), tall: 240 }); for (const ox of [-1.2, 1.2]) K.m.addSolidProp((X0 + 9 + ox) * TILE, (y + 2.5) * TILE, 40); }
  for (let k = 0; k < 3; k++) m.parking.push({ x: (X0 + 16) * TILE, y: (Y0 + 14 + k * 12) * TILE, a: Math.PI / 2, model: 'boxtruck' });
  for (const y of [Y0 + 8, Y1 - 10]) prop('ymast', X0 + 16, y, 0, { tall: 160 });
  fence(K, X0, Y0, X1, Y0, [[X0 + 1, X0 + 14]]); fence(K, X0, Y1, X1, Y1); fence(K, X1, Y0, X1, Y1);
  prop('ygate', X0 + 9, Y0 - 0.2, 0, { a: 0 });
  prop('textsign', X0 + 24, Y0 + 0.6, 0, { text: 'YARDS INTERMODAL TERMINAL', bg: '#2f4a6a', fg: [240, 236, 220], z: 40, sx: 1, lit: true });
  (out.places ||= []).push({ name: 'Yards Intermodal Terminal', x0: X0, y0: Y0, x1: X1, y1: Y1 });
}

// Harbor Avenue to Foundry Road: the workshops - the body shop, the tyre place, Hardline Workwear, the Back-Alley
// Exchange in the old tavern (the fence's), the Steelworkers Union hall - their forecourts with cars waiting
function workshops(K, m, ctx) {
  const { rnd, pick, prop } = K;
  const { wh } = ctx;
  const L = [
    { name: 'Knuckles Body Shop', w: 16, arch: 'garage', key: 'repair', poi: { kind: 'delivery', label: 'Knuckles Body Shop' } },
    { name: 'Back-Alley Exchange', w: 14, arch: 'club', key: 'club', poi: { kind: 'fence', label: 'Back-Alley Exchange' }, art: { spec: { style: 'brick', brickTone: '#5a3028', grime: 0.6, graffiti: 2, boarded: 0.4 } } },
    { name: 'Tri-City Tire & Lube', w: 16, arch: 'garage', key: 'repair', poi: { kind: 'delivery', label: 'Tri-City Tire & Lube' } },
    { name: 'Hardline Workwear', w: 14, arch: 'mixed', key: 'apt2', poi: { kind: 'clothing', label: 'Hardline Workwear' }, art: { spec: { floors: 2, style: 'brick', brickTone: '#7a3a30', grime: 0.3 }, shop: { kind: 'clothes', door: 'left', open: true, people: 2, awning: ['#2a2a2e', '#e0b030'], sign: { text: 'HARDLINE WORKWEAR', bg: '#2a2a2e', fg: [240, 200, 60], lit: true } } } },
    { name: 'Steelworkers Local 12', w: 18, arch: 'civicblock', key: 'apt2', poi: { kind: 'delivery', label: 'Steelworkers Local 12' }, art: { spec: { floors: 2, style: 'brick', brickTone: '#8a4434', win: 'tall', cornice: 'dentil', parapet: 8 } } },
    { name: 'Gulf Radiator Works', w: 16, arch: 'garage', key: 'repair', poi: { kind: 'delivery', label: 'Gulf Radiator Works' } },
    { name: 'Midnight Auto Glass', w: 14, arch: 'garage', key: 'repair', poi: { kind: 'delivery', label: 'Midnight Auto Glass' } },
    { name: 'Yards Welding & Fab', w: 18, arch: 'factory', key: 'industrial', poi: { kind: 'delivery', label: 'Yards Welding & Fab' } },
  ];
  let i = 0;
  for (const [x0, x1] of [[4026, 4097], [4106, 4177]]) K.row(x0, x1, 1906, 1947, (x, room) => {
    if (room < 8) return room >= 1 ? { gap: room, kind: 'yard' } : null;
    const S = L[i++];
    if (!S) return { gap: Math.min(room, 10), kind: 'yard' };
    return { w: Math.min(room, S.w), depth: 16 + Math.floor(rnd(x, 1947, 81) * 5), arch: S.arch, key: S.key, name: S.name, poi: S.poi, whole: true, art: S.art || wh(x, 1947) };
  }, { rough: true });
  // the cars waiting out front of the garages
  for (const b of m.buildings) if (b && b.hand && b.kind === 'repair' && b.ty > 1900 && b.ty < 1950) for (let k = 0; k < 2; k++) m.parking.push({ x: (b.tx + 3 + k * 5) * TILE, y: (b.ty + b.th + 2.5) * TILE, a: 0, model: pick(['sedan', 'pickup', 'compact'], rnd(b.tx, k, 82)) });
  void prop;
}

// Gulf Cement Works (WC406's plant): on the south shore west of Yards Avenue - the silos in a row, the kiln shed, the
// conveyor up to them, the gravel heaps, the barge quay with its bollards
function cement(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, wh, out } = ctx;
  const X0 = 4026, X1 = 4097, Y0 = 1956, Y1 = 1997;
  const b = place({ x: X0 + 2, y: Y1 - 22, w: 30, h: 22, arch: 'factory', key: 'industrial', name: 'Gulf Cement Works', poi: { kind: 'delivery', label: 'Gulf Cement Works' }, whole: true, art: wh(X0, Y1, { brick: false, spec: { wallColor: '#b8b4a8', grime: 0.5 } }) });
  ground(K, X0, Y0, X1, Y1);
  for (let k = 0; k < 5; k++) prop('silo', X0 + 38 + k * 6, Y0 + 9, 24, { h: 130 });
  prop('pipes', X0 + 36, Y0 + 18, 0); prop('pipes', X0 + 50, Y0 + 20, 0);
  for (let k = 0; k < 3; k++) prop('gravel', X0 + 40 + k * 8, Y1 - 6, 14, { s: 2 });
  if (b) prop('textsign', X0 + 17, Y1 + 0.4, 0, { text: 'GULF CEMENT WORKS', bg: '#5a5e64', fg: [240, 236, 220], z: 32, sx: 1 });
  place({ x: X0 + 2, y: Y0 + 1, w: 24, h: 12, arch: 'shed', key: 'warehouse', name: 'Gulf Cement Bagging Plant', face: 'N', poi: false, whole: true, art: wh(X0, Y0, { brick: false, spec: { wallColor: '#a8a49a' } }) });
  for (let k = 0; k < 3; k++) m.parking.push({ x: (X0 + 40 + k * 7) * TILE, y: (Y1 - 12) * TILE, a: Math.PI / 2, model: 'mixer' });
  // south of Gasworks Lane down to the water: the barge quay - the aggregate heaps the barges bring, pallets of bags
  ground(K, X0 - 30, 2005, 4097, 2056);
  const ql = (x, y) => ctx.tile(x, y) === T.LOT && K.m.bld[K.m.idx(x, y)] < 0;
  for (const [hx, hy] of [[4000, 2012], [4016, 2016], [4034, 2018], [4052, 2024], [4070, 2030]]) for (let j = 0; j < 12; j++) {
    const a = rnd(hx, j, 49) * 6.283, r = Math.sqrt(rnd(j, hy, 50)) * 3.6, x = hx + Math.cos(a) * r * 1.2, y = hy + Math.sin(a) * r * 0.8;
    if (ql(Math.floor(x), Math.floor(y))) prop('gravel', x, y, j % 4 ? 0 : 14);
  }
  for (let k = 0; k < 6; k++) { const x = 4084 + (k % 3) * 2.4, y = 2010 + Math.floor(k / 3) * 2.2; if (ql(Math.floor(x), Math.floor(y))) prop('pallet', x, y, 8); }
  let n = 0;
  for (let x = 3990; x < 4097; x += 6) { let s = null; for (let y = 2004; y < 2064; y++) { const t = ctx.tile(x, y); if (t === T.WATER || t === T.DEEP) { s = y; break; } } if (s !== null && ctx.tile(x, s - 1) === T.LOT) { prop('bollard', x + 0.5, s - 0.8, 5); if (n++ % 3 === 1) prop('crates', x + 2, s - 2.2, 8); } }
  (out.places ||= []).push({ name: 'Gulf Cement Works', x0: X0, y0: Y0, x1: X1, y1: Y1 });
}

// The Gulf Fuel Terminal (WC406's tanks): the tank farm east of Spruce Street, the tanks in rows inside their bund
// fence, the pipe runs between them, the control hut
function tankFarm(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  const X0 = 4186, X1 = 4256, Y0 = 1956, Y1 = 2050;
  place({ x: X0 + 2, y: Y0 + 1, w: 8, h: 5, arch: 'hut', name: 'Gulf Fuel Terminal', poi: { kind: 'delivery', label: 'Gulf Fuel Terminal' }, whole: true, roof: 'tar', face: 'N' });
  ground(K, X0, Y0, X1, Y1);
  const lot = (x, y) => K.m.inside(x, y) && K.m.tiles[K.m.idx(x, y)] === T.LOT && K.m.bld[K.m.idx(x, y)] < 0;
  let n = 0;
  for (let y = Y0 + 12; y < Y1 - 6; y += 11) for (let x = X0 + 8; x < X1 - 6; x += 11) {
    let ok = true;
    for (let dy = -4; dy <= 4 && ok; dy++) for (let dx = -4; dx <= 4; dx++) if (!lot(x + dx, y + dy)) { ok = false; break; }
    if (!ok) continue;
    prop('otank', x + 0.5, y + 0.5, 46, { tall: 110 }); n++;
    if (lot(x + 6, y)) prop('pipes', x + 6, y + 0.5, 0);
  }
  fence(K, X0, Y0, X1, Y0, [[X0 + 1, X0 + 12]]); fence(K, X0, Y0, X0, Y1); fence(K, X1, Y0, X1, Y1);
  prop('textsign', X0 + 20, Y0 + 0.6, 0, { text: 'GULF FUEL TERMINAL', bg: '#7a2e2e', fg: [250, 230, 190], z: 30, sx: 1 });
  (out.places ||= []).push({ name: 'Gulf Fuel Terminal', x0: X0, y0: Y0, x1: X1, y1: Y1, tanks: n });
}

// The south side east of Yards Avenue: the Pink Line's station square (its kiosk is the generator's), a food truck and a
// bench; the construction site on Gasworks Lane; the self-storage units
function southSide(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  // the construction site (the generator's 'construction' lot: its frame, its stacks, its cones)
  const cs = place({ x: 4108, y: 2006, w: 22, h: 18, arch: 'construction', key: 'construction', name: 'Construction Site', face: 'N', poi: { kind: 'construction', label: 'Construction Site' }, whole: true });
  if (cs) (out.places ||= []).push({ name: 'Construction Site', x0: cs.tx, y0: cs.ty, x1: cs.tx + cs.tw, y1: cs.ty + cs.th });
  // the self-storage: rows of small units with roller doors
  for (let y = 2008; y + 5 < 2046; y += 8) for (let x = 4134; x + 9 < 4178; x += 10) place({ x, y, w: 9, h: 5, arch: 'garage', name: 'Yards Self Storage', poi: false, whole: true, roof: 'tar' });
  ground(K, 4106, 2005, 4182, 2050);
  // the station square: paving round the kiosk, a food truck, benches, a bus stop
  for (let y = 1956; y < 1997; y++) for (let x = 4106; x < 4177; x++) if (K.free(x, y) && Math.abs(x - 4114) < 12 && Math.abs(y - 1990) < 8) K.fill(x, y, 1, 1, T.PLAZA);
  prop('foodcart', 4124, 1990, 10); prop('bench_m', 4106, 1986, 0); prop('bench_m', 4121, 1984, 0); prop('lamp', 4103.5, 1984, 0); prop('lamp', 4124.5, 1996, 0);
  void m;
}

// Channel Quay (WC406's sheet-piled quay) along the river channel west of Channel Street: the bollards along the piling,
// boxes on the apron, the crane over the water, pallets and crates, warehouses between with their yards to the street
function channelQuay(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, wh, tile, out } = ctx;
  const W0 = 3950, W1 = 4016;
  // the edge: the first water tile west of each row
  const edge = (y) => { let x = W1; while (x > W0 && !(tile(x - 1, y) === T.WATER || tile(x - 1, y) === T.DEEP)) x--; return x > W0 ? x : null; };
  // the sheds along it (each fronting south onto a yard that opens to the street)
  let n = 0;
  for (const y of [1606, 1632, 1658, 1684, 1710, 1736, 1762, 1788, 1814, 1840, 1866, 1914, 1940, 1966]) {
    const e = edge(y + 8);
    if (e === null) continue;
    const x = e + 6, w = W1 - x - 1;
    if (w < 10) continue;
    const nm = ['Channel Marine Supply', 'Barge Line Storage', 'Riverside Net & Rope', 'Channel Cold Store', 'Dockside Scrap Metal', 'Pilot House Freight', 'Ballast & Bilge Co', 'East Channel Sheds', 'Tug & Tow Co', 'Channel Ice House', 'Wharf Rat Storage'][n % 11];
    if (place({ x, y, w, h: 16, arch: rnd(x, y, 91) < 0.5 ? 'warehouse' : 'shed', key: 'warehouse', name: nm, poi: { kind: 'delivery', label: nm }, whole: true, art: wh(x, y) })) n++;
  }
  ground(K, W0, 1497, W1 + 1, 2000);
  // the bollards, boxes and crates along the edge; the crane at the north end
  for (let y = 1498; y < 1998; y += 4) {
    const e = edge(y);
    if (e === null || tile(e, y) !== T.LOT) continue;
    prop('bollard', e + 0.6, y + 0.5, 5);
    if (y % 24 === 6 && tile(e + 3, y) === T.LOT) prop('container', e + 3.4, y + 2, 18, { c: Math.floor(rnd(e, y, 92) * 5), a: Math.PI / 2 });
    else if (y % 16 === 2 && tile(e + 2, y) === T.LOT) prop(rnd(e, y, 93) < 0.5 ? 'crates' : 'pallet', e + 2.2, y + 0.5, 8);
  }
  const ce = edge(1560);
  if (ce !== null) prop('gcrane', ce + 3, 1560, 0, { a: 0, k: 1, tall: 720 });
  (out.places ||= []).push({ name: 'Channel Quay', x0: W0, y0: 1497, x1: W1, y1: 1998 });
}

// The warehouses' loading docks between Central Avenue and the boulevard (WC407's dock): box trucks backed in, forklifts,
// pallets and a dumpster by each door
function docks(K, m, y0, y1) {
  const { prop, rnd, pick } = K;
  for (const b of m.buildings) {
    if (!b || !b.hand || b.kind !== 'warehouse' || b.tx < 4026 || b.tx > 4097 || b.ty < y0 || b.ty > y1) continue;
    const north = !!b.back, fy = north ? b.ty - 2.5 : b.ty + b.th + 2.5;
    m.parking.push({ x: (b.tx + Math.min(b.tw - 3, 5)) * TILE, y: fy * TILE, a: north ? -Math.PI / 2 : Math.PI / 2, model: rnd(b.tx, b.ty, 101) < 0.7 ? 'boxtruck' : 'van' });
    prop('forklift', b.tx + b.tw * 0.6, fy, 16, { a: Math.PI / 2 });
    prop(pick(['pallet_b', 'pallet', 'crates', 'dump_g'], rnd(b.ty, b.tx, 102)), b.tx + b.tw - 2, fy - (north ? -1 : 1), 8);
  }
}
