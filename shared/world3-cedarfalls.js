// World v3, handcrafted: Cedar Falls (district 35), the east island's family suburb, Pelican Bridge's road to Laurel
// Street from 19th Street to Bayside Avenue, from the research's sources for Cedar Falls (D9 and I1: the cul-de-sacs and
// crescents, the houses round them; SC2-H: the strip mall and the gas station on the avenue; L1: the public pool) with
// the owner's concepts WC007 and WC008 (the suburb of crescents, the suburban street) and the suburbs' kit of West Hills
// (shared/world3-suburb.js): the grid's square blocks of scattered house lots give way to
//   - Cedar Falls Center on Cedar Avenue: the strip of shops over its car park and FuelMax on Pinecrest Avenue's corner;
//   - Willow Crescent off Pinecrest Avenue round Cedar Falls Commons - the public pool with its lanes, the Cedar Falls
//     Playhouse, the green with its pond and picnic tables;
//   - Hazel Court off Pinecrest Avenue; east of the avenue, Birch, Maple and Alder Courts toward the water;
//   - every house a home on its lawn, the rows stepping along the crescent's corners.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';

const D = 35;   // Cedar Falls (shared/mapcore.js DISTRICTS)
export const FX = { bridge: 4136, pinecrest: 4300, laurel: 4390 };
export const FY = { nineteenth: 2538, cedar: 2576, bayside: 2730 };
const WILLOW = [[FX.pinecrest, 2603], [4172, 2603], [4164, 2607], [4160, 2614], [4160, 2644], [4164, 2650], [4172, 2654], [FX.pinecrest, 2654]];
const HAZEL = [[FX.pinecrest, 2690], [4178, 2690]];
const BIRCH = [[FX.pinecrest, 2614], [4378, 2614]];
const MAPLE = [[FX.pinecrest, 2664], [4378, 2664]];
const ALDER = [[FX.pinecrest, 2698], [4378, 2698]];
const RECTS = [[FX.bridge, FY.nineteenth, FX.pinecrest, FY.cedar], [FX.bridge, FY.cedar, FX.pinecrest, FY.bayside], [FX.pinecrest, FY.cedar, FX.laurel, FY.bayside]];

export const CEDARFALLS = {
  key: 'cedarfalls', d: D, rects: RECTS, rect: [FX.bridge, FY.nineteenth, FX.laurel, FY.bayside],
  streets: () => [
    { name: 'Willow Crescent', kind: 'minor', pts: WILLOW },
    { name: 'Hazel Court', kind: 'minor', culdesac: true, pts: HAZEL },
    { name: 'Birch Court', kind: 'minor', culdesac: true, pts: BIRCH },
    { name: 'Maple Court', kind: 'minor', culdesac: true, pts: MAPLE },
    { name: 'Alder Court', kind: 'minor', culdesac: true, pts: ALDER },
  ],
  specials: ['Cedar Falls Playhouse', 'FuelMax Cedar Falls'],   // (the generator's two: laid here)
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const S = makeSuburb(m, K, out);
  const { place, area, pool, chain, tree, frontRow, backRow, below, above, both, lido } = S;
  const tile = (x, y) => m.tiles[y * m.w + x];

  center();
  willow();
  hazel();
  courts();
  K.landscape({ bare: 0.45, tree: (x, y, r) => r < 0.85 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['oak', 'maple', 'birch', 'flowerTree', 'redMaple', 'cherry', 'spruce'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  void api; void tile; void pool; void chain;
  return out;

  // ===========================================================================================================
  // Cedar Falls Center (SC2-H) on Cedar Avenue: the shops in a row under one roof over their car park, FuelMax on
  // Pinecrest Avenue's corner (the kiosk, the canopy over the pumps), the sign at the kerb
  function center() {
    const A = area(FX.bridge, FY.nineteenth + 4, FX.pinecrest, FY.cedar - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A, gasX = x1 - 22;
    const LIST = [
      { w: 24, name: 'Falls Fresh Market', store: 'mart', poi: { kind: 'grocery', label: 'Falls Fresh Market' }, sign: ['#3a6a2a', [250, 240, 200]] },
      { w: 10, name: 'Cedar Falls Pharmacy', store: 'mart', poi: { kind: 'pharmacy', label: 'Cedar Falls Pharmacy' }, sign: ['#2a7a6a', [250, 250, 245]] },
      { w: 9, name: 'The Grind Cedar Falls', store: 'cafe', poi: { kind: 'coffee', label: 'The Grind Cedar Falls' }, sign: ['#3a2a20', [236, 214, 150]] },
      { w: 10, name: 'Pizza Pronto', store: 'diner', poi: { kind: 'coffee', label: 'Pizza Pronto', food: true }, sign: ['#c8302a', [250, 240, 210]] },
      { w: 9, name: 'Falls Hardware', store: 'mart', poi: { kind: 'delivery', label: 'Falls Hardware' }, sign: ['#a83a2a', [250, 240, 220]] },
      { w: 9, name: 'Snip & Style', store: 'salon', poi: { kind: 'barber', label: 'Snip & Style' }, sign: ['#8a3a6a', [250, 240, 245]] },
      { w: 9, name: 'Cedar Falls Video', store: 'mart', poi: { kind: 'delivery', label: 'Cedar Falls Video' }, sign: ['#2a3a6a', [250, 220, 90]] },
      { w: 9, name: 'Lucky Wok', store: 'diner', poi: { kind: 'coffee', label: 'Lucky Wok', food: true }, sign: ['#a8202a', [250, 220, 120]] },
    ];
    let k = 0;
    const made = K.row(x0 + 2, gasX - 2, y0, y1 - 13, (x, room) => {
      const L = LIST[k];
      if (!L || room < L.w) return null;
      k++; out.shops++;
      return { w: L.w, depth: 12, arch: 'mixed', name: L.name, poi: L.poi, whole: true,
        art: { spec: { floors: 1, style: 'stucco', wallColor: '#e4dccc', win: 'even', parapet: 10, grime: 0.05, roofMat: 'membrane', lip: 6, rimW: 4, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 2, sign: { text: L.name.toUpperCase(), bg: L.sign[0], fg: L.sign[1], lit: true }, awning: [L.sign[0], '#f0ece4'] } } };
    });
    const built = made.filter((b) => b && !b.gap && b.tw !== undefined);
    if (built.length) {
      const sx1 = Math.max(...built.map((b) => b.tx + b.tw)), fy = Math.max(...built.map((b) => b.ty + b.th));
      K.fill(x0, fy, sx1 - x0, 2, T.PLAZA);
      K.fill(x0, fy + 2, sx1 - x0, y1 - fy - 2, T.LOT);
      for (const ry of [fy + 3, fy + 8]) for (let sx = x0 + 1; sx + 3 <= sx1 - 1; sx += 3) {
        if (ry + 4 > y1) continue;
        m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE });
        if (rnd(sx, ry, 630) < 0.5) m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: ry === fy + 3 ? -Math.PI / 2 : Math.PI / 2 });
      }
      for (let lx = x0 + 6; lx < sx1 - 2; lx += 16) prop('lamp', lx, fy + 7.5, 0);
      prop('textsign', x0 + 4, y1 - 0.6, 0, { text: 'CEDAR FALLS CENTER', bg: '#2a4a3a', fg: [250, 236, 160], z: 60, sx: 1, lit: true });
      place('Cedar Falls Center', x0, y0, sx1, y1);
    }
    if (x1 - gasX >= 18 && K.allFree(gasX, y0 + 1, 14, 10)) {
      const gs = K.building({ x: gasX, y: y0 + 1, w: 14, h: 10, arch: 'gas', key: 'gas', name: 'FuelMax Cedar Falls', poi: { kind: 'gasstation', label: 'FuelMax Cedar Falls' }, whole: true });
      if (gs) {
        out.shops++;
        K.fill(gasX - 2, y0 + 11, x1 - gasX + 2, y1 - y0 - 11, T.LOT);
        const cx = gasX + 8, cy = y0 + 11 + Math.floor((y1 - y0 - 11) / 2);
        prop('canopy', cx, cy, 0, { w: 260, d: 110, h: 54 });
        for (const [ox, oy] of [[-4, -1.6], [0, -1.6], [4, -1.6], [-4, 1.6], [0, 1.6], [4, 1.6]]) { const x = (cx + ox) * TILE, y = (cy + oy) * TILE; (m.sitePumps ||= []).push({ x, y }); m.addSolidProp(x, y, 9); }
        prop('textsign', x1 - 2, y1 - 0.6, 0, { text: 'FUELMAX', bg: '#1e4a8a', fg: [250, 220, 60], z: 60, sx: 1, lit: true });
      }
    }
  }

  // ===========================================================================================================
  // Willow Crescent round Cedar Falls Commons: houses facing the crescent from outside it; inside it the public pool,
  // the Cedar Falls Playhouse facing the green, the pond, the paths, picnic tables, benches
  function willow() {
    frontRow(4166, FX.pinecrest - 4, FY.cedar + 6, 2597);
    backRow(4166, FX.pinecrest - 4, 2659, 2672, { yard: 4, mask: below(WILLOW.slice(-2), 5) });
    const A = area(4166, 2609, FX.pinecrest - 4, 2650);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    // the pool at the east end, the playhouse at the west, the green between
    const px1 = x1 - 1, px0 = px1 - 34;
    lido(px0, y0 + 1, px1, Math.min(y1 - 2, y0 + 18), 'Cedar Falls Pool');
    // (clear of the crescent's corner: the first spot all free from its west end)
    let hx = x0 + 2, hy = y0 + 1;
    while (hx < x0 + 14 && !K.allFree(hx, hy, 22, 17)) hx++;
    const ph = K.building({ x: hx, y: hy, w: 22, h: 14, arch: 'theatre', key: 'theatre', name: 'Cedar Falls Playhouse', poi: { kind: 'delivery', label: 'Cedar Falls Playhouse' }, whole: true,
      art: { spec: { floors: 2, style: 'brick', wallColor: '#b8705a', parapet: 10, grime: 0.05, blades: [], plaques: [] }, shop: { kind: 'lobby', door: 'left', open: true, people: 2, sign: { text: 'PLAYHOUSE', bg: '#7a1e2a', fg: [255, 226, 150], lit: true }, awning: ['#7a1e2a', '#7a1e2a'] } } });
    if (ph) { K.fill(hx, hy + 14, 22, 3, T.PLAZA); prop('picboard', hx + 2, hy + 15.5, 0, { pic: 'masks', z: 30, col: [255, 210, 110] }); }
    const gx0 = hx + 24, gx1 = px0 - 2;
    if (gx1 - gx0 >= 20) {
      const gm = Math.floor((y0 + y1) / 2);
      K.paint(gx0, gm - 1, gx1 - gx0, 2, T.PLAZA);
      K.paint(Math.floor((gx0 + gx1) / 2) - 1, y0, 2, y1 - y0, T.PLAZA);
      const pcx = gx0 + Math.floor((gx1 - gx0) * 0.3), pcy = gm + 8, rx = 8, ry = 4;
      for (let yy = pcy - ry; yy <= pcy + ry; yy++) for (let xx = pcx - rx; xx <= pcx + rx; xx++) { const e = ((xx + 0.5 - pcx) / rx) ** 2 + ((yy + 0.5 - pcy) / ry) ** 2; if (e < 0.85 && K.free(xx, yy)) { m.set(xx, yy, T.WATER); K.take(xx, yy, 1, 1); } }
      for (let k = 0; k < 3; k++) prop('lily', pcx - 4 + k * 4, pcy + (k % 2 ? 0.8 : -0.6), 0, { v: k });
      prop('duck', pcx + 1, pcy, 0);
      for (const [bx, by] of [[pcx - rx - 2, pcy], [pcx + rx + 2, pcy]]) prop('bench_m', bx, by, 0);
      for (let k = 0; k < 3; k++) prop('picnic', gx1 - 6 - k * 6, gm - 5, 8);
      for (let k = 0; k < 4; k++) tree(gx0 + 4 + k * ((gx1 - gx0 - 8) / 3), y0 + 3, 640, pick(['oak', 'maple', 'cherry'], rnd(k, y0, 641)));
      prop('parksign', Math.floor((gx0 + gx1) / 2) + 3, y1 - 1.5, 0);
      place('Cedar Falls Commons', gx0, y0, gx1, y1);
    }
    place('Willow Crescent', 4158, FY.cedar, FX.pinecrest, 2660);
  }

  // ===========================================================================================================
  // Hazel Court: houses facing it from Willow Crescent's side, its south side backing onto Bayside Avenue's houses;
  // between the arterial and the crescent a strip of trees
  function hazel() {
    frontRow(4172, FX.pinecrest - 4, 2659, 2686, { mask: above(HAZEL, 5) });
    backRow(4182, FX.pinecrest - 4, 2694, FY.bayside - 6, { yard: 7, mask: below(HAZEL, 5) });
    frontRow(4140, FX.pinecrest - 4, 2694, FY.bayside - 6, { mask: below(HAZEL, 5) });
    place('Hazel Court', 4140, 2660, FX.pinecrest, FY.bayside);
  }

  // ===========================================================================================================
  // East of Pinecrest Avenue to Laurel Street: Birch, Maple and Alder Courts, houses round them
  function courts() {
    const x0 = FX.pinecrest + 6, x1 = FX.laurel - 5;
    frontRow(x0, x1, FY.cedar + 6, 2610, { mask: above(BIRCH, 5) });
    backRow(x0, x1, 2619, 2660, { yard: 12, pools: 0.5, mask: both(below(BIRCH, 5), above(MAPLE, 5)) });
    frontRow(x0, x1, 2619, 2660, { mask: both(below(BIRCH, 5), above(MAPLE, 5)) });
    backRow(x0, x1, 2669, 2694, { yard: 4, mask: both(below(MAPLE, 5), above(ALDER, 5)) });
    frontRow(x0, x1, 2669, 2694, { mask: both(below(MAPLE, 5), above(ALDER, 5)) });
    backRow(x0, x1, 2703, FY.bayside - 6, { yard: 10, pools: 0.45, mask: below(ALDER, 5) });
    place('Birch Court', FX.pinecrest, FY.cedar, FX.laurel, 2640);
    place('Maple Court', FX.pinecrest, 2640, FX.laurel, 2680);
    place('Alder Court', FX.pinecrest, 2680, FX.laurel, FY.bayside);
  }
}
