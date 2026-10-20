// World v3, handcrafted: North Point (district 32), the harbour village on the north coast's peninsula, from the
// owner's concept WC386 (NorthPoint-A1: a rocky fishing harbour - timber piers with the fishing boats, a red boathouse,
// the covered fish-market shed with its crates; waterfront cafes and a seafood restaurant under umbrellas, clapboard
// houses, a little fountain square and a ridge road; the lighthouse on the point) and the research's north coast:
//   - Waterside Road along the inlet shore, the quay between it and the water: North Point Fish Shack (the fish
//     market: sell the catch), North Point Charters (the charter boat at the middle pier), The Wheelhouse (seafood on
//     the quay, its terrace), bollards, lobster pots, nets drying, the boats tied up between the piers, the boathouse;
//   - Lighthouse Avenue up the peninsula's spine to the light, Crest Road along its east side; Beacon, Herring, Anchor
//     and Mackerel Lanes and Netmaker Row across, their clapboard cottages under dark shingle;
//   - Mariners' Square by the water on Herring Lane - The Seaglass Cafe and Point Provisions on it - The Bell Buoy (the
//     pub) and Gannet's Fish Bar on Beacon Lane; Inlet Green in the corner where the peninsula meets the coast.
// The finger piers, the fleet and North Point Light on the tip stay the north coast builder's (shared/world3-north.js:
// it finds this plan's fish shack and charter office and leaves its own out). Every building faces south. Names and
// signs are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';

const D = 32;   // North Point (shared/mapcore.js DISTRICTS)
// (its edges are the grid's streets - Rowan Street, the Shore Road, Willow Street - and its own 1st Street along the top,
// which meets Waterside Road at a plain corner: the grid's 1st Street ran on west to x 3430, a jog short of the road)
const RECT = [3380, 377, 3620, 706];
// (the old grid's lines: x 3380 / 3430 / 3480 (the avenue) / 3550 / 3620, y 380 ... 705 - Lighthouse Avenue and the
// edges kept where they were; Waterside Road a little further from the water, for the quay)
export const PX = { west: 3380, water: 3440, ave: 3480, crest: 3550, edge: 3620 };
export const PY = { first: 380, beacon: 429, herring: 478, anchor: 527, mackerel: 576, netmaker: 641, shore: 705 };
const LANES = [['Beacon Lane', PY.beacon], ['Herring Lane', PY.herring], ['Anchor Lane', PY.anchor], ['Mackerel Lane', PY.mackerel]];
// the town's front on the Shore Road: west and east of Lighthouse Avenue
const SHORE_W = [
  { name: 'The Crab Pot', store: 'cafe', key: 'rest1', w: 13, wall: '#c84a3a', poi: { kind: 'delivery', label: 'The Crab Pot', food: true }, sign: 'THE CRAB POT', signC: ['#1e2a3a', [255, 226, 160]], awning: ['#c84a3a', '#f0ece4'], floors: 1, tables: true },
  { name: 'Point Diner', store: 'diner', key: 'diner', w: 12, wall: '#e8e4dc', poi: { kind: 'coffee', label: 'Point Diner', food: true }, sign: 'POINT DINER', signC: ['#2a6a8a', [250, 246, 230]], awning: ['#2a6a8a', '#f0ece4'], floors: 1 },
];
const SHORE_E = [
  { name: 'Scoops by the Sea', store: 'cafe', key: 'rest2', w: 11, wall: '#f0c8d0', poi: { kind: 'coffee', label: 'Scoops by the Sea', food: true }, sign: 'SCOOPS', signC: ['#e8749a', [255, 250, 240]], awning: ['#e8749a', '#fff6f0'], floors: 1, tables: true, umb: 'umbrella_y' },
  { name: 'Harbor Slice', store: 'cafe', key: 'rest1', w: 11, wall: '#e8dcae', poi: { kind: 'delivery', label: 'Harbor Slice', food: true }, sign: 'HARBOR SLICE', signC: ['#2a5a3a', [255, 236, 190]], awning: ['#2a5a3a', '#f0ece4'] },
  { name: 'Morning Tide Bakery', store: 'cafe', key: 'rest2', w: 12, wall: '#a8c8d8', poi: { kind: 'coffee', label: 'Morning Tide Bakery', food: true }, sign: 'MORNING TIDE', signC: ['#6a4a2a', [250, 240, 220]], awning: ['#6a4a2a', '#f0ece4'], tables: true, umb: 'umbrella_b' },
  { name: 'Point Bait & Tackle', store: 'mart', key: 'conv', w: 10, wall: '#7f8e98', poi: { kind: 'tackle', label: 'Point Bait & Tackle' }, sign: 'BAIT & TACKLE', signC: ['#2a4a6a', [240, 236, 220]], awning: null, floors: 1 },
  { name: 'The Tide Table', store: 'cafe', key: 'rest1', w: 13, wall: '#9aaa90', poi: { kind: 'delivery', label: 'The Tide Table', food: true }, sign: 'THE TIDE TABLE', signC: ['#1e2e24', [240, 220, 160]], awning: ['#1e2e24', '#f0ece4'], tables: true, umb: 'umbrella_g' },
];
const WALLS = ['#8a9aa8', '#a9b6c0', '#ece9e0', '#e8dcae', '#9aaa90', '#7f8e98', '#ece9e0', '#c8b8a0', '#a8c8d8'];
const SLATES = ['#3e4450', '#4a4e58', '#55606a'];

export const NORTHPOINT = {
  key: 'northpoint', d: D, rect: RECT,
  streets: () => [
    { name: '1st Street', kind: 'st', pts: [[PX.water, PY.first], [PX.edge, PY.first]] },
    { name: 'Waterside Road', kind: 'st', pts: [[PX.water, PY.first], [PX.water, PY.shore]] },
    { name: 'Lighthouse Avenue', kind: 'ave', pts: [[PX.ave, PY.first], [PX.ave, PY.shore]] },
    { name: 'Crest Road', kind: 'minor', pts: [[PX.crest, PY.first], [PX.crest, PY.shore]] },
    ...LANES.map(([name, y]) => ({ name, kind: 'minor', pts: [[PX.water, y], [PX.edge, y]] })),
    { name: 'Netmaker Row', kind: 'minor', pts: [[PX.west, PY.netmaker], [PX.edge, PY.netmaker]] },
  ],
  specials: [],
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
  // the shore strip the generator kept along the water (reserve 4: shared/map.js waterfrontStrip) is the plan's ground
  // here - the quay's, the green's
  const ground = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = yy * W + xx, t = m.tiles[i]; if (!m.land[i] || m.bld[i] >= 0 || (t !== T.GRASS && t !== T.SAND && t !== T.PLAZA && t !== T.DIRT)) continue; if (!(m.reserve[i] & ~4)) { m.tiles[i] = T.GRASS; m.reserve[i] &= ~4; } } };
  const cottage = (x, y) => ({ spec: { floors: rnd(x, y, 1) < 0.45 ? 1 : 2, style: 'siding', wallColor: pick(WALLS, rnd(x, y, 4)), win: pick(['pair', 'even'], rnd(x, y, 5)), pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, y, 6)), slope: 0.6, parapet: 3, grime: 0.07, blades: [], plaques: [] }, noShop: true });
  const row = { art: cottage, key: (x) => (rnd(x, 7, 33) < 0.5 ? 'house1' : 'house2'), trees: ['maple', 'oak', 'birch', 'whitePine'], price: 30000, w: 9 };
  const front = (x, o) => ({
    spec: { floors: o.floors || 2, style: 'siding', wallColor: o.wall, win: o.win || 'pair', pitch: 'gable', roof: 'shingle', roofColor: pick(SLATES, rnd(x, 9, 31)), slope: 0.55, parapet: 3, grime: 0.08, blades: [], plaques: [] },
    shop: { kind: o.store, door: o.door || 'left', open: true, people: o.people ?? 2, sign: { text: o.sign, bg: o.signC[0], fg: o.signC[1], lit: true }, awning: o.awning || null },
  });
  // the west shore's first land along a row; the last tile before Waterside Road's pavement (the quay runs between)
  const shoreX = (y) => { let x = RECT[0]; while (x < PX.water - 6 && !m.land[y * W + x]) x++; return x; };
  const kerb = (y) => { let x = PX.water; while (x > RECT[0] && (tile(x, y) === T.ROAD || tile(x, y) === T.SIDEWALK)) x--; return x; };
  // a free run along a row between two streets: [first, last] free x
  const span = (xa, xb, y) => { let a = xa, b = xb; while (a < b && !K.free(a, y)) a++; while (b > a && !K.free(b, y)) b--; return [a, b]; };

  quay();
  shops();
  fountainSquare();
  homes();
  inletGreen();
  K.landscape({ grid: 6, bare: 0.45, tree: (x, y, r) => (r < 0.85 ? ['tree_a', pick(['maple', 'oak', 'whitePine', 'birch', 'whitePine'], rnd(x, y, 90)), 1.1 + rnd(x, y, 91) * 0.25] : [pick(['shrub_a', 'bush_c'], rnd(x, y, 92)), null, 1]) });
  void api;
  return out;

  // ===========================================================================================================
  // The quay between Waterside Road and the inlet (the piers go out from it: shared/world3-north.js): paved, the fish
  // shack and the charter office on it, The Wheelhouse and its terrace, bollards along the edge, lobster pots, nets,
  // the boats tied up between the piers, the boathouse
  function quay() {
    // (a lot on the quay: in from the shore's furthest tile along its rows, up to the road's pavement less a step)
    const lot = (y, h, w0) => { let x = 0, k = 1e9; for (let yy = y; yy < y + h + 2; yy++) { x = Math.max(x, shoreX(yy) + 1); k = Math.min(k, kerb(yy)); } return { x, y, w: Math.min(w0, k - x - 1), k }; };
    const fish = lot(451, 7, 11), charter = lot(493, 6, 9), wheel = lot(536, 8, 10);
    for (const L of [fish, charter, wheel]) if (L) ground(L.x, L.y, L.k - L.x + 1, 8);
    if (fish && fish.w >= 7) {
      const shed = K.building({ x: fish.x, y: fish.y, w: fish.w, h: 7, arch: 'mixed', key: 'conv', name: 'North Point Fish Shack', poi: { kind: 'fishmarket', label: 'North Point Fish Shack' }, whole: true,
        art: { spec: { floors: 1, style: 'siding', wallColor: '#7a8a7a', win: 'even', pitch: 'gable', roof: 'metal', roofColor: '#8a6a50', slope: 0.42, parapet: 2, grime: 0.16, blades: [], plaques: [] },
          shop: { kind: 'mart', door: 'left', open: true, people: 2, sign: { text: 'FISH SHACK', bg: '#2a4a6a', fg: [240, 236, 220], lit: true }, awning: ['#2a4a6a', '#e8e4dc'] } } });
      if (shed) {
        out.shops++; out.shack = [shed.tx, shed.ty];
        // the catch on the stalls out front, the gutting table, crates of ice on pallets, the forklift
        prop('mstall', fish.x + 2.5, fish.y + 9, 8, { v: 1, c: 2 }); prop('mstall', fish.x + 6.5, fish.y + 9, 8, { v: 2, c: 2 });
        prop('fishtable', fish.x + 1.5, fish.y + 11.5, 0); prop('cooler', fish.x + 4, fish.y + 11.8, 0, { c: 1 }); prop('cooler', fish.x + 5, fish.y + 11.8, 0, { c: 2 });
        prop('pallet', fish.x + 8.2, fish.y + 11.5, 8); prop('crates', fish.x + 8.2, fish.y + 13.2, 8); prop('forklift', fish.x + 5.5, fish.y - 1.6, 12, { a: Math.PI });
      }
    }
    if (charter && charter.w >= 6) {
      const ch = K.building({ x: charter.x, y: charter.y, w: charter.w, h: 6, arch: 'mixed', key: 'conv', name: 'North Point Charters', poi: { kind: 'charter', label: 'North Point Charters' }, whole: true,
        art: { spec: { floors: 1, style: 'siding', wallColor: '#ece9e0', win: 'even', pitch: 'gable', roof: 'shingle', roofColor: '#2a4a6a', slope: 0.5, parapet: 2, grime: 0.06, blades: [], plaques: [] },
          shop: { kind: 'mart', door: 'right', open: true, people: 1, sign: { text: 'CHARTERS', bg: '#2a4a6a', fg: [255, 236, 170], lit: true }, awning: ['#2a4a6a', '#f0ece4'] } } });
      if (ch) { out.shops++; out.charter = [ch.tx, ch.ty]; prop('textsign', charter.x + charter.w / 2, charter.y + 7.4, 0, { text: 'FISHING TRIPS', bg: '#f0ece4', fg: [42, 74, 106], z: 18, sx: 0.7 }); }
    }
    if (wheel && wheel.w >= 7) {
      const wh = K.building({ x: wheel.x, y: wheel.y, w: wheel.w, h: 8, arch: 'mixed', key: 'rest1', name: 'The Wheelhouse', poi: { kind: 'delivery', label: 'The Wheelhouse', food: true }, whole: true,
        art: front(wheel.x, { store: 'cafe', wall: '#b84a3a', sign: 'WHEELHOUSE', signC: ['#1e2a3a', [255, 220, 150]], awning: ['#1e2a3a', '#f0ece4'], floors: 1 }) });
      if (wh) out.shops++;
    }
    // the quay's paving from the shore to the road, round them; its dressing
    const QY0 = PY.first + 8, QY1 = 600;
    for (let y = QY0; y < QY1; y++) {
      const sx = shoreX(y), k = kerb(y);
      for (let x = sx; x <= k; x++) { const i = y * W + x; if (!m.land[i] || m.bld[i] >= 0) continue; const t = m.tiles[i]; if ((t === T.GRASS || t === T.SAND || t === T.PLAZA || t === T.DIRT) && !(m.reserve[i] & ~4)) { m.tiles[i] = T.PLAZA; m.reserve[i] = (m.reserve[i] & ~4) | 16; K.take(x, y, 1, 1); } }
      if (y % 4 === 0 && isW(sx - 1, y) && tile(sx, y) === T.PLAZA) prop('bollard', sx + 0.4, y + 0.5, 5);
      if (y % 18 === 9 && tile(k, y) === T.PLAZA) prop('lamp', k - 0.4, y + 0.5, 5, { style: 'iron' });
    }
    const onQuay = (x, y) => tile(Math.floor(x), Math.floor(y)) === T.PLAZA;
    // (by each pier's root, the gear stacked: lobster pots, crates and barrels, a coiled-net rack, a life ring at the edge)
    const roots = [404, 446, 488, 530, 572];
    roots.forEach((py, j) => {
      for (const [dy, dx, v] of [[-4.5, 2.2, j], [-4.5, 3.6, j + 2], [-3.2, 2.9, j + 4], [4.6, 2.4, j + 1], [5.8, 2.4, j + 3]]) { const y = py + dy, x = shoreX(Math.floor(y)) + dx; if (onQuay(x, y)) prop('lobsterpots', x, y, 6, { v }); }
      for (const [dy, dx, t] of [[-5, 6.5, pick(['crates', 'barrels', 'drum'], rnd(py, 1, 61))], [5.5, 6, pick(['crates', 'pallet', 'barrels'], rnd(py, 2, 62))]]) { const y = py + dy, x = shoreX(Math.floor(y)) + dx; if (onQuay(x, y)) prop(t, x, y, 8); }
      { const y = py + 3.2, x = shoreX(Math.floor(y)) + 0.6; if (onQuay(x, y)) prop('lifering', x, y, 0, { a: Math.PI / 2 }); }
    });
    for (const y of [425, 514, 556, 593]) { const x = shoreX(y) + 4.5; if (onQuay(x, y) && onQuay(x + 4, y)) prop('netrack', x, y, 8, { len: 60 }); }
    for (const y of [438, 470, 520, 566]) { const x = kerb(y) - 1.5; if (onQuay(x, y)) { prop('bench_m', x, y, 0); prop('planter_g', x, y - 2.5, 6); } }
    // The Wheelhouse's terrace in front of it, under umbrellas
    if (wheel) for (let k = 0; k < 3; k++) { const ty = wheel.y + 10.5 + k * 3; for (const dx of [2.5, 6.5]) if (onQuay(wheel.x + dx, ty)) { prop('cafetable', wheel.x + dx, ty, 6); prop(['umbrella_r', 'umbrella_y', 'umbrella_r'][k], wheel.x + dx, ty - 0.2, 0); } }
    // the boats tied up along the quay between the piers, the red boathouse at the south end
    for (const [y, c] of [[425, 0], [467, 1], [509, 2], [551, 0]]) { const sx = shoreX(y); if (isW(sx - 3, y - 2) && isW(sx - 3, y + 2)) prop('fishboat', sx - 2.4, y + 0.5, 0, { c, a: Math.PI / 2 }); }
    { const y = 592, sx = shoreX(y); if (isW(sx - 3, y)) prop('boathouse', sx - 1.8, y, 20); }
    place('North Point Quay', RECT[0], QY0, PX.water, QY1);
  }

  // ===========================================================================================================
  // Beacon Lane's corner by the water: The Bell Buoy (the pub) and Gannet's Fish Bar facing the lane; a row of
  // cottages behind them on 1st Street
  function shops() {
    const LIST = [
      { name: 'The Bell Buoy', store: 'bar', key: 'rest2', w: 14, wall: '#4a6a5a', poi: { kind: 'club', label: 'The Bell Buoy' }, sign: 'THE BELL BUOY', signC: ['#1e2e24', [240, 220, 160]], door: 'right', people: 3 },
      { name: "Gannet's Fish Bar", store: 'cafe', key: 'rest1', w: 12, wall: '#ece9e0', poi: { kind: 'delivery', label: "Gannet's Fish Bar", food: true }, sign: "GANNET'S", signC: ['#2a5a8a', [250, 246, 230]], awning: ['#2a5a8a', '#f0ece4'], floors: 1 },
    ];
    let k = 0;
    const made = K.row(PX.water, PX.ave, PY.first + 22, PY.beacon - 1, (x, room) => {
      const L = LIST[k];
      if (!L) return null;
      if (room < L.w) return { gap: room, kind: 'passage' };
      k++;
      return { w: L.w, depth: 11, arch: 'mixed', key: L.key, name: L.name, poi: L.poi, whole: true, art: front(x, L) };
    });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) { out.shops++; prop('potted', b.tx + 0.8, b.ty + b.th + 0.6, 6); }
    backRow(PX.water, PX.ave, PY.first + 1, PY.first + 20, { ...row, yard: 6 });
    place('Beacon Lane', PX.water, PY.first, PX.crest, PY.beacon + 4);
  }

  // ===========================================================================================================
  // Mariners' Square on Herring Lane by the water: paved, the fountain, benches and planters, trees in grates, two
  // lamps; The Seaglass Cafe and Point Provisions facing it from the north, the cafe's tables out on it
  function fountainSquare() {
    const sy1 = PY.herring - 1, sy0 = PY.herring - 22;
    const [x0, x1e] = span(PX.water, PX.ave, sy0), x1 = x1e + 1;
    const LIST = [
      { name: 'The Seaglass Cafe', store: 'cafe', key: 'rest2', w: 13, wall: '#e8dcae', poi: { kind: 'coffee', label: 'The Seaglass Cafe', food: true }, sign: 'SEAGLASS CAFE', signC: ['#8a3a2a', [255, 236, 200]], awning: ['#8a3a2a', '#f0ece4'] },
      { name: 'Point Provisions', store: 'mart', key: 'conv', w: 12, wall: '#a9b6c0', poi: { kind: 'convenience', label: 'Point Provisions' }, sign: 'PROVISIONS', signC: ['#2a4a3a', [240, 232, 200]], awning: ['#2a4a3a', '#f0ece4'] },
    ];
    let k = 0;
    const made = K.row(x0, x1, PY.beacon + 1, sy0 - 1, (x, room) => {
      const L = LIST[k];
      if (!L) return null;
      if (room < L.w) return { gap: room, kind: 'passage' };
      k++;
      return { w: L.w, depth: 12, arch: 'mixed', key: L.key, name: L.name, poi: L.poi, whole: true, art: front(x, L) };
    }, { noStep: true });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) out.shops++;
    for (let y = sy0; y <= sy1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); }
    const cx = (x0 + x1) / 2, cy = (sy0 + sy1) / 2 + 1;
    // (the basin: still water round the fountain, its stone kerb)
    { const pw = 8, ph = 5, px0 = Math.round(cx - pw / 2), py0 = Math.round(cy - ph / 2);
      for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) m.set(x, y, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
      prop('fountain', px0 + pw / 2, py0 + ph / 2, 0, { s: 0.7 });
      for (const [fx, fy] of [[px0 - 2, py0 - 1.5], [px0 + pw + 2, py0 - 1.5], [px0 - 2, py0 + ph + 1.5], [px0 + pw + 2, py0 + ph + 1.5]]) prop('flowers_big', fx, fy, 0);
      (m.squares ||= []).push({ x: px0 - 4, y: py0 - 3, w: pw + 8, h: ph + 6, name: "Mariners' Square" }); }
    for (const [dx, dy] of [[-7, -4.5], [7, -4.5], [-7, 5], [7, 5], [0, 6]]) prop('bench_m', cx + dx, cy + dy, 0);
    for (const [dx, dy] of [[-11, -7], [11, -7], [-11, 0], [11, 0], [-11, 7], [11, 7]]) prop('tree_a', cx + dx, cy + dy, 10, { sp: pick(['maple', 'oak', 'flowerTree'], rnd(dx + 20, dy + 20, 45)), k: 1.05, grate: true });
    for (const dx of [-8, 8]) prop('lamp', cx + dx, cy, 5, { style: 'iron' });
    { let yb = sy1; while (yb > sy0 && tile(Math.floor(cx), yb) !== T.PLAZA) yb--; for (const dx of [-3, 3]) prop('planter_fl', cx + dx, yb - 0.4, 6); }
    const cafe = made.find((b) => b && b.name === 'The Seaglass Cafe');
    if (cafe) for (let j = 0; j < 3; j++) { prop('cafetable', cafe.tx + 2.5 + j * 4, sy0 + 1.6, 6); prop('umbrella_b', cafe.tx + 2.5 + j * 4, sy0 + 1.4, 0); }
    (m.landmarks ||= []).push({ name: "Mariners' Square", type: 'square', x: x0 * TILE, y: sy0 * TILE, w: (x1 - x0) * TILE, h: (sy1 - sy0 + 1) * TILE });
    place("Mariners' Square", x0, sy0, x1, sy1 + 1);
  }

  // ===========================================================================================================
  // The cottages: in each block between the lanes, a row facing the lane below and one with its door on the lane above
  // (back yards between them, where the camera sees them), each side of Lighthouse Avenue and Crest Road; west of
  // Waterside Road only below Netmaker Row (the quay and the green have the shore above it)
  function homes() {
    const ys = [PY.first, PY.beacon, PY.herring, PY.anchor, PY.mackerel, PY.netmaker, PY.shore];
    for (let j = 0; j + 1 < ys.length; j++) {
      const a = ys[j], b = ys[j + 1], mid = Math.round((a + b) / 2);
      const cols = [[PX.ave, PX.crest], [PX.crest, PX.edge]];
      if (j >= 2) cols.unshift([PX.water, PX.ave]);   // (the shops and the square above Herring Lane)
      if (j === ys.length - 2) cols.unshift([PX.west, PX.water]);
      for (const [x0, x1] of cols) {
        backRow(x0, x1, a + 1, mid - 1, { ...row, yard: 7 });
        // (the town's front on the Shore Road, where the road in arrives: its shops and eateries, between Waterside Road
        // and Crest Road)
        if (j === ys.length - 2 && (x0 === PX.water || x0 === PX.ave)) shoreShops(x0, x1, mid, b - 1, x0 === PX.water ? SHORE_W : SHORE_E);
        else frontRow(x0, x1, mid, b - 1, { ...row, setback: 3 });
      }
    }
    place('North Point', PX.water, PY.first, PX.edge, PY.shore);
  }
  // a row of shops facing the street below, their tables and planters out front
  function shoreShops(x0, x1, y0, y1, LIST) {
    let k = 0;
    const made = K.row(x0, x1, y0, y1, (x, room) => {
      const L = LIST[k];
      if (!L) return null;
      if (room < L.w) return { gap: room, kind: 'passage' };
      k++;
      return { w: L.w, depth: 11, arch: 'mixed', key: L.key, name: L.name, poi: L.poi, whole: true, art: front(x, L) };
    });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) {
      out.shops++;
      const L = LIST.find((q) => q.name === b.name);
      prop('potted', b.tx + 0.8, b.ty + b.th + 0.6, 6);
      if (L && L.tables) for (let j = 0; j < 2; j++) { prop('cafetable', b.tx + 3.5 + j * 4, b.ty + b.th + 1.8, 6); prop(L.umb || 'umbrella_r', b.tx + 3.5 + j * 4, b.ty + b.th + 1.6, 0); }
    }
    place('Shore Road shops', x0, y0, x1, y1 + 1);
  }

  // ===========================================================================================================
  // Inlet Green in the corner where the peninsula meets the coast, west of Waterside Road above Netmaker Row: lawn
  // under a few trees down to the sand, a path across, benches by the water, the statue on its plinth
  function inletGreen() {
    const y0 = 600, y1 = PY.netmaker - 1;
    let n = 0;
    for (let y = y0; y < y1; y++) for (let x = RECT[0]; x <= kerb(y); x++) {
      const i = y * W + x;
      if (!m.land[i] || m.dist[i] !== D || m.bld[i] >= 0 || (m.reserve[i] & ~4)) continue;
      let wet = false;
      for (let d = 1; d <= 2 && !wet; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (isW(x + dx, y + dy)) wet = true;
      if (wet) continue;   // (the sand at the water's edge kept)
      if (m.tiles[i] === T.SAND || m.tiles[i] === T.PLAZA || m.tiles[i] === T.GRASS) { m.tiles[i] = T.GRASS; m.reserve[i] &= ~4; n++; }
    }
    const py = 620;
    for (let x = shoreX(py) + 3; x <= kerb(py); x++) for (const dy of [0, 1]) if (K.free(x, py + dy)) { m.set(x, py + dy, T.PLAZA); K.take(x, py + dy, 1, 1); }
    const cx = Math.round((shoreX(py) + 3 + kerb(py)) / 2);
    // the gazebo on the path, benches round it, the statue of the fisherman on its plinth by the water, picnic tables
    // on the lawn, flower beds, lamps along the path, the board at its end; trees round the edge in clumps
    prop('gazebo', cx, py - 5, 30);
    for (const dx of [-6, 6]) prop('bench_m', cx + dx, py - 3.5, 0);
    prop('statue', shoreX(py) + 6, py - 3, 14);
    for (const x of [shoreX(py) + 9, cx + 9, kerb(py) - 3]) prop('lamp', x, py + 2.6, 5, { style: 'iron' });
    prop('mapboard', kerb(py) - 1.5, py - 1.6, 4);
    for (const [dx, dy] of [[-8, 7], [2, 9], [10, 6]]) { const x = cx + dx, y = py + dy; if (K.free(Math.floor(x), Math.floor(y))) prop('picnic', x, y, 8); }
    for (const [dx, dy] of [[-3, -9], [5, -9], [-12, 4], [13, -4]]) { const x = cx + dx, y = py + dy; if (K.free(Math.floor(x), Math.floor(y))) prop('flowers_big', x, y, 0); }
    for (let k = 0; k < 40; k++) {
      const x = shoreX(py) + 3 + rnd(k, 1, 48) * (kerb(py) - shoreX(py) - 4), y = y0 + 2 + rnd(k, 2, 49) * (y1 - y0 - 4);
      if (Math.abs(y - py) < 4 || Math.hypot(x - cx, y - py + 5) < 6 || !K.free(Math.floor(x), Math.floor(y))) continue;
      let ok = true; for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (!K.free(Math.floor(x) + dx, Math.floor(y) + dy)) { ok = false; break; }
      if (ok) prop('tree_a', x, y, 12, { sp: pick(['oak', 'maple', 'whitePine', 'birch'], rnd(k, 3, 46)), k: 1.15 + rnd(k, 4, 50) * 0.2 });
    }
    // the green's lawn kept a lawn (the landscape's woods stay off it)
    for (let y = y0; y < y1; y++) for (let x = RECT[0]; x <= kerb(y); x++) if (K.free(x, y)) K.take(x, y, 1, 1);
    out.green = n;
    place('Inlet Green', RECT[0], y0, PX.water, y1);
  }
}
