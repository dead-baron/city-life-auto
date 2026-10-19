// World v3, handcrafted: Coral Cay (district 44), the quiet key - all of it, from the owner's concepts WC249 (the
// tropical key: a village of colourful two-storey houses, a quay with its piers, tiki huts on the beach, stilt cottages,
// a light on the point), WC178 (the reef bay: the beach bar, the T-dock with the boathouse and the motorboats, a palm
// islet's jetty) and NA1-E (the jungle paths, the thatched beach bar with its hammocks, the T-jetty with a speedboat
// and a skiff), with the research's plan for the key (a sleepy dive village round the cove, an eco-resort on the east
// lobe, the dive shop and boat hire on a T-jetty, the rainforest, a small light on its point):
//   - the village: Harbor Street through it, Coral Street from the north beach down to the quay, Palm Lane, Shell, Conch
//     and Reef Lanes, Lagoon Way along the south shore; houses in painted stucco under tile roofs, two floors, palms in
//     the yards; on Harbor Street the shops - Coral Dive Co., Cay Market, Reef Cafe, Island Threads, The Conch Bar -
//     and Conch Square across from them;
//   - the quay at Coral Street's foot: the T-jetty, the dive boat and the skiffs, the bait shack, the boat hire;
//   - Tiki Point on the north beach: the beach bar, hammocks between the palms, loungers;
//   - the east lobe: Coral Cay Rainforest (palms, banana and bird of paradise, monstera and hibiscus, jungle paths),
//     Cay Road out through it to the Coral Cay Eco Lodge (its lodge, its cabins along the south shore on a boardwalk,
//     their jetty), Coral Point Light on the tip;
//   - the whole key the plan's: the grid of mainland streets and the farm fields (the key's land was Willow Valley's
//     meadow till a city painted it - shared/world3-land.js ISLE3) give way.
// Every building faces south (the camera). Names and signs are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';
import { towerKit } from './world3-downtown.js';

const D = 44;   // Coral Cay (shared/mapcore.js DISTRICTS)
const BOX = [4004, 3290, 4530, 3600];   // (the key and the water round it to the jetties' ends)
export const CX = { shell: 4100, coral: 4170, conch: 4215, reef: 4260, east: 4340 };
export const CY = { palm: 3400, harbor: 3460, lagoon: 3500 };
const HARBOR = [[4044, CY.harbor], [CX.east, CY.harbor]];
const CAY = [[CX.east, CY.harbor], [4368, 3456], [4396, 3447], [4430, 3443], [4456, 3446]];
const CORAL = [[CX.coral, 3336], [CX.coral, 3540]];
const PALM = [[4070, CY.palm], [4300, CY.palm]];
const SHELL = [[CX.shell, CY.palm], [CX.shell, CY.harbor]];
const CONCH = [[CX.conch, CY.palm], [CX.conch, CY.harbor]];
const REEF = [[CX.reef, 3360], [CX.reef, CY.harbor]];
const LAGOON = [[4112, CY.lagoon], [4330, CY.lagoon]];
const STUCCO = ['#f2c4a2', '#a6dcc6', '#f2e2a8', '#c6b0e6', '#a8cce8', '#f3a08c', '#f6efe0', '#e8a8c0', '#bfe8d0'];
const ROOFS = ['#b8583a', '#c86a44', '#a84a34', '#d07a50', '#8a4a3a'];
const PALMS = ['coconut', 'coconut', 'royal', 'leaning', 'fanSkirt'];

export const CORALCAY = {
  key: 'coralcay', d: D, rect: BOX,
  streets: () => [
    { name: 'Harbor Street', kind: 'st', pts: HARBOR },
    { name: 'Cay Road', kind: 'minor', culdesac: true, pts: CAY },
    { name: 'Coral Street', kind: 'st', pts: CORAL },
    { name: 'Palm Lane', kind: 'minor', pts: PALM },
    { name: 'Shell Lane', kind: 'minor', pts: SHELL },
    { name: 'Conch Lane', kind: 'minor', pts: CONCH },
    { name: 'Reef Lane', kind: 'minor', culdesac: true, pts: REEF },
    { name: 'Lagoon Way', kind: 'minor', pts: LAGOON },
  ],
  specials: [],
  few: 40,   // (a sleepy village: its houses, a handful of shops, the lodge's cabins)
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const S = makeSuburb(m, K, out);
  const { place, frontRow, backRow, below, above, both } = S;
  const { tower } = towerKit(K, out);
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
  // the key's land is all Coral Cay's now (its outskirts were Willow Valley's meadow: the farm sections keep off it)
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) { const i = y * W + x; if (m.land[i]) m.dist[i] = D; }
  // a house in painted stucco under a tile roof, two floors (WC249)
  const house = (x, y, w) => ({ spec: { floors: 2, style: 'stucco', wallColor: pick(STUCCO, rnd(x, y, 1)), win: pick(['pair', 'even', 'tall'], rnd(x, y, 2)), pitch: rnd(x, y, 3) < 0.6 ? 'hip' : 'gable', roof: 'tile', roofColor: pick(ROOFS, rnd(x, y, 4)), slope: 0.4, parapet: 4, grime: 0.06, blades: [], plaques: [] }, noShop: true });
  const row = { art: house, trees: PALMS, price: 34000 };

  conchSquare();
  shops();
  village();
  quay();
  tikiPoint();
  lodge();
  light();
  rainforest();
  // what's left in the village: lawn under palms, hibiscus and bougainvillea
  K.landscape({ bare: 0.4, tree: (x, y, r) => r < 0.7 ? ['palm_a', pick(PALMS, rnd(x, y, 830)), 1.2 + rnd(x, y, 831) * 0.25] : r < 0.85 ? ['palm_s', pick(['banana', 'bird', 'smallPalm'], rnd(x, y, 832)), 1] : ['shrub_a', pick(['hibiscus', 'bougain', 'monstera'], rnd(x, y, 833)), 1] });
  // (every tile of the key's land the plan's: the meadows' farm sections, trees and rocks keep off it)
  for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
    if (K.free(x, y)) K.take(x, y, 1, 1);
    const i = y * W + x, t = m.tiles[i];
    if (m.land[i] && (t === T.DIRT || t === T.SAND)) m.reserve[i] |= 16;   // (the paths and the beaches too: the farm sections would take a dirt path)
  }
  void api;
  return out;

  // ===========================================================================================================
  // The houses: along Palm Lane's north side facing it; between Palm Lane and Harbor Street their backs to Palm Lane
  // and their fronts to Harbor Street (but for the shops' block); south of Harbor Street the same to Lagoon Way; south
  // of Lagoon Way their back yards down to the beach; the west lobe's houses backing onto Harbor Street's end
  function village() {
    frontRow(4074, 4300, 3330, 3395, { ...row, mask: above(PALM, 5), setback: 4 });
    for (const [a, b] of [[4048, 4095], [4106, 4165], [4265, 4336]]) {
      backRow(a, b, 3405, 3455, { ...row, yard: 5, mask: both(below(PALM, 5), above(HARBOR, 5)) });
      frontRow(a, b, 3405, 3455, { ...row, mask: both(below(PALM, 5), above(HARBOR, 5)) });
    }
    backRow(4044, 4108, 3465, 3515, { ...row, yard: 9, mask: below(HARBOR, 5) });
    for (const [a, b] of [[4116, 4165], [4212, 4334]]) {
      backRow(a, b, 3465, 3495, { ...row, yard: 4, mask: both(below(HARBOR, 5), above(LAGOON, 5)) });
      frontRow(a, b, 3465, 3495, { ...row, mask: both(below(HARBOR, 5), above(LAGOON, 5)) });
    }
    backRow(4116, 4160, 3505, 3560, { ...row, yard: 8, mask: below(LAGOON, 5) });
    backRow(4182, 4334, 3505, 3560, { ...row, yard: 8, pools: 0.3, mask: below(LAGOON, 5) });
    place('Palm Lane', 4070, 3330, 4300, 3430);
    place('Lagoon Way', 4110, 3480, 4334, 3560);
  }

  // ===========================================================================================================
  // Harbor Street's shops between Coral Street and Reef Lane, facing south across the street to Conch Square: one and
  // two floors of painted stucco, awnings, the dive shop's flag (a diver-down board), the bar's palm neon
  function shops() {
    const LIST = [
      [CX.coral + 6, CX.conch - 5, [
        { name: 'Coral Dive Co.', store: 'mart', w: 12, poi: { kind: 'delivery', label: 'Coral Dive Co.' }, awning: ['#2a6aa8', '#f0ece4'], signC: ['#2a6aa8', [250, 246, 230]] },
        { name: 'Cay Market', store: 'mart', w: 12, poi: { kind: 'grocery', label: 'Cay Market' }, awning: ['#3a8a4a', '#f2e2a8'], signC: ['#3a8a4a', [255, 246, 220]] },
        { name: 'Reef Cafe', store: 'cafe', key: 'rest2', w: 9, poi: { kind: 'coffee', label: 'Reef Cafe', food: true }, awning: ['#e8604a', '#f0ece4'], signC: ['#e8604a', [255, 250, 240]] },
      ]],
      [CX.conch + 6, CX.reef - 5, [
        { name: 'Island Threads', store: 'clothes', w: 11, poi: { kind: 'clothing', label: 'Island Threads', store: 'surf' }, awning: ['#d0507a', '#f0ece4'], signC: ['#d0507a', [255, 246, 250]] },
        { name: 'The Conch Bar', store: 'bar', w: 12, wall: '#2a4a5a', poi: { kind: 'club', label: 'The Conch Bar' }, neon: { name: 'CONCH BAR', kind: 'bar', col: 4, pic: 'palm' }, signC: ['#1a2a34', [255, 210, 120]] },
        { name: 'Cay Post & Supply', store: 'mart', w: 10, poi: { kind: 'delivery', label: 'Cay Post & Supply' }, awning: ['#e8b030', '#2a5a8a'], signC: ['#2a5a8a', [255, 220, 90]] },
      ]],
    ];
    for (const [x0, x1, list] of LIST) {
      let k = 0;
      const made = K.row(x0, x1, CY.palm + 6, CY.harbor - 8, (x, room) => {
        const L = list[k];
        if (!L) return room >= 1 ? { gap: room, kind: 'passage' } : null;
        const w = Math.min(room, L.w);
        if (w < 6) return { gap: room, kind: 'passage' };
        k++;
        const art = tower(x, CY.harbor, { name: L.name, store: L.store, style: 'stucco', wall: L.wall || pick(STUCCO, rnd(x, 3, 20)), floors: L.floors ?? 1 + Math.floor(rnd(x, 3, 21) * 2), win: 'pair', cornice: 'step', parapet: 10, grime: 0.05, roofMat: 'membrane', awning: L.awning ?? null, signC: L.signC, people: 2 });
        if (L.neon) art.neon = L.neon;
        return { w, depth: 12, arch: 'mixed', ...(L.key ? { key: L.key } : {}), name: L.name, poi: L.poi, whole: true, art };
      }, { noStep: true });
      const built = made.filter((b) => b && !b.gap && b.tw !== undefined);
      if (!built.length) continue;
      const fy = Math.max(...built.map((b) => b.ty + b.th));
      K.fill(x0, fy, x1 - x0, CY.harbor - 5 - fy, T.PLAZA);
      for (const b of built) { prop('bench_m', b.tx + 1.5, fy + 1.2, 0); prop('potted', b.tx + b.tw - 1, fy + 0.8, 6); }
      prop('textsign', x0 + 3, fy + 0.6, 0, { text: list[0].name === 'Coral Dive Co.' ? 'DIVE  SNORKEL  BOATS' : 'OPEN DAILY', bg: '#1e3a5e', fg: [250, 240, 200], z: 28, sx: 1 });
      // (their backs to Palm Lane: a service yard behind them, lawn and palms beyond)
      const by = Math.min(...built.map((b) => b.ty));
      K.fill(x0, by - 6, x1 - x0, 6, T.LOT);
      prop('dump_g', x0 + 2, by - 1, 12); prop('crates', x1 - 3, by - 1.2, 10);
    }
    place('Harbor Street', CX.coral, CY.palm, CX.reef, CY.harbor + 6);
  }

  // ===========================================================================================================
  // Conch Square across Harbor Street from the shops: paving, a fountain, palms, benches, the market umbrellas
  function conchSquare() {
    const x0 = CX.coral + 6, x1 = CX.conch + 12, y0 = CY.harbor + 6, y1 = CY.lagoon - 6;
    if (!K.free(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2))) return;
    K.fill(x0, y0, x1 - x0, y1 - y0, T.PLAZA); K.take(x0, y0, x1 - x0, y1 - y0);   // (all but the street corners' rounded kerbs)
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    prop('fountain', cx, cy + 0.4, 36);
    for (const [dx, dy] of [[-8, -6], [8, -6], [-8, 6], [8, 6], [-14, 0], [14, 0]]) prop('palm_a', cx + dx, cy + dy, 10, { sp: pick(PALMS, rnd(dx, dy, 40)), k: 1.3 });
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 5], [4, 5]]) prop('bench_m', cx + dx, cy + dy, 0);
    for (let k = 0; k < 4; k++) prop('mstall', x0 + 4 + k * 4.5, y1 - 2.4, 14, { v: k % 4, c: (k * 3 + 1) % 4, a: Math.PI });
    prop('textsign', cx, y1 - 0.6, 0, { text: 'CONCH SQUARE', bg: '#2a6a8a', fg: [255, 236, 170], z: 28, sx: 1 });
    place('Conch Square', x0, y0, x1, y1);
  }

  // ===========================================================================================================
  // The quay at Coral Street's foot: the paved landing, the T-jetty out over the reef (the dive boat at its head, the
  // skiffs either side), the bait shack, the boat hire beside it (shared/map.js: m.handRentals)
  function quay() {
    let sy = CY.lagoon + 6;
    while (sy < BOX[3] - 30 && !isW(CX.coral, sy)) sy++;
    if (sy >= BOX[3] - 30) return;
    // the landing: paved from the street's end to the water
    for (let y = CORAL[1][1] + 4; y < sy; y++) for (let x = CX.coral - 6; x <= CX.coral + 6; x++) { const t = tile(x, y); if (K.free(x, y) || t === T.SAND) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); } }
    // the jetty: 4 wide, 18 out, a head 16 across
    const jx0 = CX.coral - 2, jx1 = CX.coral + 1, hy0 = sy + 16, hy1 = hy0 + 3;
    for (let y = sy; y <= hy1; y++) for (let x = CX.coral - 8; x <= CX.coral + 8; x++) {
      const head = y >= hy0, shaft = x >= jx0 && x <= jx1;
      if ((head || shaft) && isW(x, y)) m.set(x, y, T.DOCK);
    }
    for (let y = sy + 1; y < hy0; y += 6) { prop('lamp', jx0 + 0.3, y, 5, { style: 'iron', lift: 4 }); prop('bollard', jx1 + 0.8, y + 2, 5); }
    for (const [x, y] of [[CX.coral - 7.5, hy1 + 0.4], [CX.coral + 7.5, hy1 + 0.4]]) prop('lamp', x, y, 5, { style: 'iron', lift: 4 });
    prop('lifering', jx0 + 0.3, sy + 4, 0);
    // the dive boat at the head, skiffs along the shaft (boats: the marina's), a canoe drawn up
    m.marina.push({ x: Math.round(CX.coral * TILE), y: Math.round((hy1 + 2.4) * TILE), a: 0, kind: 'speedboat' });
    m.marina.push({ x: Math.round((jx0 - 2.2) * TILE), y: Math.round((sy + 9) * TILE), a: Math.PI / 2, kind: 'dinghy' });
    m.marina.push({ x: Math.round((jx1 + 3.2) * TILE), y: Math.round((sy + 12) * TILE), a: Math.PI / 2, kind: 'dinghy' });
    prop('canoe', CX.coral + 9, sy - 1.4, 0, { a: 0.3, c: 1 });
    // the bait shack on the landing, its counter; crates, a cooler
    const bx = CX.coral - 4.5, by = sy - 3.4;
    prop('baitshack', bx, by, 0);
    for (const dx of [-40, -16, 16, 40]) m.addSolidProp(Math.round(bx * TILE + dx), Math.round(by * TILE - 6), 18);
    m.pois.push({ id: m.pois.length, kind: 'tackle', label: 'Coral Cay Bait & Tackle', x: Math.round(bx * TILE), y: Math.round((by + 1.6) * TILE), r: 40, counter: true });
    prop('crates', CX.coral + 4, sy - 2, 10); prop('cooler', CX.coral + 5.5, sy - 1.4, 0, { v: 2 });
    prop('textsign', CX.coral + 3, CORAL[1][1] + 5, 0, { text: 'CORAL CAY DOCK', bg: '#1e3a5e', fg: [255, 226, 140], z: 34, sx: 1 });
    (m.handRentals ||= []).push({ x: (CX.coral + 16) * TILE, y: (sy - 1) * TILE, name: 'Coral Cay Boat Hire' });
    m.dropSites.push({ x: CX.coral * TILE, y: Math.round((hy0 + 1.5) * TILE), name: 'the end of Coral Cay Dock' });
    place('Coral Cay Dock', CX.coral - 9, CORAL[1][1], CX.coral + 9, hy1 + 1);
  }

  // ===========================================================================================================
  // Tiki Point on the north beach, at Coral Street's head: the thatched bar on the sand's edge, its tables, torches,
  // hammocks slung between the palms, loungers down the beach
  function tikiPoint() {
    const x = CX.coral + 8, w = 9, h = 6;
    let y = 3318; while (y < 3340 && !K.allFree(x, y, w, h)) y++;
    if (y >= 3340) return;
    const b = K.building({ x, y, w, h, arch: 'beachbar', key: 'beachbar', name: 'Tiki Point', poi: { kind: 'club', label: 'Tiki Point' }, whole: true });
    if (!b) return;
    out.shops++;
    for (const dx of [-1.6, w + 1.6]) prop('torch', x + dx, y + h - 0.5, 6);
    for (let k = 0; k < 3; k++) { prop('cafetable', x + 1.5 + k * 3, y + h + 1.6, 6); prop(['umbrella_y', 'umbrella_g', 'umbrella_r'][k], x + 1.5 + k * 3, y + h + 1.5, 0); }
    for (let k = 0; k < 3; k++) { const hx = x + w + 5 + k * 7; prop('palm_a', hx, y + 2, 10, { sp: 'coconut', k: 1.35 }); prop('palm_a', hx + 4.5, y + 3, 10, { sp: 'leaning', k: 1.3 }); prop('hammock', hx + 2.2, y + 2.6, 0, { len: 120 }); }
    // loungers and umbrellas on the sand north of the bar
    for (let k = 0; k < 8; k++) { const lx = CX.coral - 20 + k * 6, ly = 3316; if (tile(Math.floor(lx), ly) === T.SAND) { prop('lounger', lx, ly, 0, { v: k % 4, a: -Math.PI / 2 }); prop(pick(['umbrella_b', 'umbrella_y', 'umbrella_r'], rnd(k, ly, 41)), lx + 1, ly - 0.4, 0); } }
    prop('textsign', x + w / 2, y + h + 3, 0, { text: 'TIKI POINT', bg: '#3a6a5a', fg: [255, 214, 120], z: 26, sx: 1 });
    place('Tiki Point', x - 4, 3304, x + w + 26, y + h + 4);
  }

  // ===========================================================================================================
  // The Coral Cay Eco Lodge at Cay Road's end: the lodge facing the road's turning circle, the cabins in a row along
  // the east lobe's south shore (each a room to rent), the boardwalk to them, their jetty
  function lodge() {
    const lx = 4446, ly = 3424;
    if (K.allFree(lx, ly, 16, 10)) {
      const art = { spec: { floors: 2, style: 'siding', wallColor: '#8a6a4a', win: 'pair', pitch: 'hip', roof: 'shingle', roofColor: '#5a4a3a', slope: 0.5, parapet: 4, grime: 0.08, blades: [], plaques: [] },
        shop: { kind: 'lobby', door: 'left', open: true, people: 1, sign: { text: 'ECO LODGE', bg: '#2a4a3a', fg: [240, 230, 190], lit: true }, awning: ['#2a4a3a', '#2a4a3a'] } };
      if (K.building({ x: lx, y: ly, w: 16, h: 10, arch: 'hotel', key: 'hotel', name: 'Coral Cay Eco Lodge', poi: { kind: 'delivery', label: 'Coral Cay Eco Lodge' }, whole: true, art })) out.shops++;
    }
    // the path down from the road's end to the boardwalk
    const px = 4458;
    let by = 3480;
    for (let y = CAY[CAY.length - 1][1] + 4; y < by; y++) for (const x of [px, px + 1]) if (K.free(x, y)) { m.set(x, y, T.DIRT); K.take(x, y, 1, 1); }
    // the cabins along the shore, the boardwalk in front of them
    let n = 0;
    for (let x = 4384; x < 4486 && n < 7; x += 14) {
      let s = by + 8; while (s < BOX[3] - 10 && !isW(x + 3, s)) s++;
      const cy = Math.min(by, s - 14);
      if (cy < 3460 || !K.allFree(x, cy, 8, 6)) continue;
      const art = { spec: { floors: 1, style: 'siding', wallColor: pick(['#c8a878', '#b89a6a', '#d8b88a'], rnd(x, cy, 50)), win: 'even', pitch: 'gable', roof: 'shingle', roofColor: '#6a5a3a', slope: 0.6, parapet: 2, grime: 0.08, blades: [], plaques: [] }, noShop: true };
      const b = K.building({ x, y: cy, w: 8, h: 6, arch: 'house', name: `Cabin ${n + 1}, Coral Cay Eco Lodge`, whole: true, art, home: { kind: 'apartment', name: `Cabin ${n + 1}, Coral Cay Eco Lodge`, price: 9000, slots: 1 } });
      if (!b) continue;
      out.homes++; n++;
      for (let y = cy + 6; y < cy + 9; y++) for (let xx = x - 3; xx < x + 11; xx++) if (K.free(xx, y)) { m.set(xx, y, T.DOCK); K.take(xx, y, 1, 1); }
      prop('hammock', x + 4, cy + 7.6, 0, { len: 90 }); prop('lounger', x + 9.5, cy + 7.4, 0, { v: n % 4, a: -Math.PI / 2 });
    }
    // their jetty off the shore below the path
    let s = by; while (s < BOX[3] - 14 && !isW(px, s)) s++;
    if (s < BOX[3] - 14) {
      for (let y = by + 2; y < s; y++) for (const x of [px, px + 1]) if (K.free(x, y) || tile(x, y) === T.SAND) { m.set(x, y, T.DOCK); K.take(x, y, 1, 1); }
      for (let y = s; y < s + 10; y++) for (const x of [px, px + 1]) if (isW(x, y)) m.set(x, y, T.DOCK);
      prop('canoe', px + 3.2, s + 6, 0, { a: Math.PI / 2, c: 0 }); prop('canoe', px - 1.4, s + 4, 0, { a: Math.PI / 2, c: 2 });
      prop('lamp', px + 0.5, s + 9.5, 5, { style: 'iron', lift: 4 });
    }
    place('Coral Cay Eco Lodge', 4380, ly - 2, 4490, by + 14);
  }

  // ===========================================================================================================
  // Coral Point Light on the east tip: the tower, its patch of dirt, a bench looking out
  function light() {
    let lx = 4490, ly = 3430;
    while (lx > 4460 && !K.allFree(lx - 2, ly - 2, 5, 5)) lx--;
    if (!K.allFree(lx - 2, ly - 2, 5, 5)) return;
    const b = K.building({ x: lx - 2, y: ly - 2, w: 5, h: 5, arch: 'lighthouse', key: 'lighthouse', name: 'Coral Point Light', poi: false, whole: true });
    for (let y = ly - 4; y < ly + 6; y++) for (let x = lx - 5; x < lx + 6; x++) if (K.free(x, y)) { m.set(x, y, T.DIRT); K.take(x, y, 1, 1); }
    if (b) { prop('pbench', lx - 4, ly + 3, 0, { a: Math.PI / 2 }); (m.landmarks ||= []).push({ name: 'Coral Point Light', type: 'lighthouse', x: (lx - 8) * TILE, y: (ly - 8) * TILE, w: 17 * TILE, h: 16 * TILE }); }
  }

  // ===========================================================================================================
  // Coral Cay Rainforest on the east lobe (and the west lobe's wild end): palms, banana and bird of paradise, monstera,
  // elephant ear and hibiscus under them; jungle paths from Cay Road through it to the north shore
  function rainforest() {
    // the paths: from the road north to the shore, and along through the middle
    const path = (pts) => { for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.ceil(Math.hypot(bx - ax, by - ay)); for (let j = 0; j <= n; j++) { const x = Math.round(ax + (bx - ax) * j / n), y = Math.round(ay + (by - ay) * j / n); for (const [dx, dy] of [[0, 0], [1, 0]]) if (K.free(x + dx, y + dy)) { m.set(x + dx, y + dy, T.DIRT); K.take(x + dx, y + dy, 1, 1); } } } };
    path([[4396, 3442], [4392, 3410], [4400, 3380], [4396, 3350], [4402, 3332]]);
    path([[4352, 3400], [4392, 3410], [4430, 3396], [4470, 3392]]);
    let n = 0;
    for (let y = 3326; y < 3540; y += 2.3) for (let x = CX.east + 6; x < 4505; x += 2.3) {
      const jx = x + (rnd(Math.round(x * 3), Math.round(y * 3), 60) - 0.5) * 1.6, jy = y + (rnd(Math.round(x * 3), Math.round(y * 3), 61) - 0.5) * 1.6, tx = Math.floor(jx), ty = Math.floor(jy);
      if (!K.free(tx, ty) || rnd(tx, ty, 62) < 0.25) continue;
      let ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) if (!K.free(tx + dx, ty + dy) && tile(tx + dx, ty + dy) !== T.GRASS) { ok = false; break; }
      if (!ok) continue;
      const u = rnd(tx, ty, 63);
      if (u < 0.5) prop('palm_a', jx, jy, 10, { sp: pick(PALMS, rnd(tx, ty, 64)), k: 1.2 + rnd(tx, ty, 65) * 0.35 });
      else if (u < 0.72) prop('palm_s', jx, jy, 6, { sp: pick(['banana', 'bird', 'smallPalm', 'banana'], rnd(tx, ty, 66)), k: 1.1 });
      else prop('shrub_a', jx, jy, 0, { sp: pick(['monstera', 'elephant', 'hibiscus', 'monstera', 'bougain'], rnd(tx, ty, 67)), k: 1.1 });
      n++;
    }
    out.jungle = n;
    prop('parksign', 4398, 3438, 0);
    place('Coral Cay Rainforest', CX.east, 3320, 4510, 3540);
  }
}
