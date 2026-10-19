// World v3, handcrafted: Pine Hills' south side (district 0), Sunset Avenue to Westside Avenue from Pine Avenue down to
// 5th Street behind the beachfront, from the research's sources for Pine Hills (D9 and I1: houses on winding drives and
// courts; NK1-L: the woods kept between them; the old world's Pine Hills had its own plan of drives, shared/map.js
// OWN_PLAN) and the suburbs' kit (shared/world3-suburb.js): the grid's square blocks of scattered lots give way to
//   - Larch Court and Sequoia Court off Sunset Avenue, bending as they go, houses round them - fronts with their lawns,
//     drives and mailboxes, or back yards to the camera with their patios, a pool now and then;
//   - Pinewood Drive, the crescent off Westside Avenue, round Pinewood Park: a grove of pines and spruces with a trail
//     looping through it, a clearing with the picnic shelter and its tables, the pond;
//   - pines everywhere: in the yards, along the drives, in what's left between the lots.
// Every building faces south (the camera); a house facing north has its back yard to the camera. Draws are fixed by
// place (hash2).
import { T } from './constants.js';
import { makeSuburb } from './world3-suburb.js';

const D = 0;   // Pine Hills (shared/mapcore.js DISTRICTS)
export const HX = { sunset: 2560, westside: 2860 };
export const HY = { pine: 3000, fifth: 3110 };
const LARCH = [[HX.sunset, 3030], [2610, 3030], [2622, 3034], [2700, 3034]];
const SEQUOIA = [[HX.sunset, 3074], [2630, 3074], [2642, 3070], [2700, 3070]];
const PINEWOOD = [[HX.westside, 3028], [2738, 3028], [2728, 3032], [2722, 3040], [2722, 3068], [2728, 3076], [2738, 3080], [HX.westside, 3080]];
const PINES = ['pine', 'pine', 'spruce', 'pine', 'cypress'];

export const PINEHILLS = {
  key: 'pinehills', d: D, rect: [HX.sunset, HY.pine, HX.westside, HY.fifth],
  streets: () => [
    { name: 'Larch Court', kind: 'minor', culdesac: true, pts: LARCH },
    { name: 'Sequoia Court', kind: 'minor', culdesac: true, pts: SEQUOIA },
    { name: 'Pinewood Drive', kind: 'minor', pts: PINEWOOD },
  ],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const S = makeSuburb(m, K, out);
  const { place, area, tree, frontRow, backRow, below, above, both } = S;
  const x0 = HX.sunset + 7, x1 = 2715, y0 = HY.pine + 7, y5 = HY.fifth - 6;

  // ===========================================================================================================
  // Larch Court and Sequoia Court off Sunset Avenue: the houses north of Larch facing it, the two rows between the
  // courts (backs to Larch, fronts to Sequoia), the houses south of Sequoia facing it, their yards down to 5th Street
  frontRow(x0, x1, y0, 3030, { mask: above(LARCH, 5), trees: PINES });
  backRow(x0, x1, 3034, 3060, { yard: 5, mask: both(below(LARCH, 5), above(SEQUOIA, 5)), trees: PINES });
  frontRow(x0, x1, 3034, 3070, { mask: both(below(LARCH, 5), above(SEQUOIA, 5)), trees: PINES });
  backRow(x0, x1, 3074, y5, { yard: 10, pools: 0.4, mask: below(SEQUOIA, 5), trees: PINES });
  place('Larch Court', HX.sunset, HY.pine, 2715, 3052);
  place('Sequoia Court', HX.sunset, 3052, 2715, HY.fifth);

  // ===========================================================================================================
  // Pinewood Drive round Pinewood Park: the houses north of its north arm facing it, south of its south arm backing
  // onto it; inside it the park
  frontRow(2723, HX.westside - 6, y0, 3024, { mask: above(PINEWOOD, 5), trees: PINES });
  backRow(2723, HX.westside - 6, 3084, y5, { yard: 7, pools: 0.35, mask: below(PINEWOOD, 5), trees: PINES });
  pinewoodPark();
  place('Pinewood Drive', 2716, HY.pine, HX.westside, HY.fifth);

  // what's left between the lots: lawn under pines and spruces, the odd oak, shrubs
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.88 ? ['tree_a', pick(['pine', 'pine', 'spruce', 'cypress', 'oak', 'pine'], rnd(x, y, 830)), 1.15 + rnd(x, y, 832) * 0.25] : [pick(['shrub_a', 'bush_c', 'shrub_a'], rnd(x, y, 833)), null, 1] });
  void api;
  return out;

  // ===========================================================================================================
  // Pinewood Park (NK1-L): a grove of pines and spruces inside the crescent, a dirt trail looping through it from the
  // drive's north and south arms, a clearing in the middle with the picnic shelter and its tables, the pond at
  // its east end with a bench, the park's sign by the north gate
  function pinewoodPark() {
    const A = area(2722, 3028, HX.westside, 3080);
    if (!A) return;
    const [px0, py0, px1, py1] = A, w = px1 - px0, h = py1 - py0;
    K.take(px0, py0, w, h);
    const cx = px0 + w * 0.42, cy = py0 + h / 2, rx = w * 0.32, ry = h * 0.3;
    const onTrail = (x, y) => Math.abs(Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) - 1) < 0.07;
    const gate = Math.round(cx);
    // the trail: a loop round the clearing, out to the drive at the north and south gates
    for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) if (onTrail(x, y) || ((x === gate || x === gate + 1) && (y < cy - ry || y > cy + ry))) K.paint(x, y, 1, 1, T.DIRT);
    // the clearing: the shelter, its tables, the grill
    prop('gazebo', cx, cy + 0.6, 30);
    for (const [dx, dy] of [[-6, -2], [-6, 3], [6, -2], [6, 3]]) prop('picnic', cx + dx, cy + dy, 8);
    prop('trashcan', cx - 3, cy + 5, 6); prop('log', cx + 4, cy + 5.5, 8, { a: 0.3 });
    // the pond at the east end: lilies, a duck, a bench
    const qx = px0 + w * 0.82, qy = cy, qrx = Math.min(8, w * 0.1), qry = Math.min(5, h * 0.18);
    for (let y = Math.floor(qy - qry); y <= qy + qry; y++) for (let x = Math.floor(qx - qrx); x <= qx + qrx; x++) {
      const e = ((x + 0.5 - qx) / qrx) ** 2 + ((y + 0.5 - qy) / qry) ** 2;
      if (e < 0.85 && m.tiles[y * m.w + x] === T.GRASS && !onTrail(x, y)) m.set(x, y, T.WATER);
    }
    for (let k = 0; k < 3; k++) prop('lily', qx - 3 + k * 3, qy + (k % 2 ? 0.6 : -0.6), 0, { v: k });
    prop('duck', qx + 1, qy + 0.4, 0);
    prop('bench_m', qx - qrx - 1.5, qy, 0);
    // the grove: pines and spruces wherever the ground is open (not on the trail, the clearing or the pond's edge)
    for (let y = py0 + 1.5; y < py1 - 1; y += 2.4) for (let x = px0 + 1.5; x < px1 - 1; x += 2.4) {
      const jx = x + (rnd(Math.round(x * 3), Math.round(y * 3), 840) - 0.5) * 1.4, jy = y + (rnd(Math.round(x * 3), Math.round(y * 3), 841) - 0.5) * 1.4;
      if (Math.hypot((jx - cx) / (rx - 2.5), (jy - cy) / (ry - 2)) < 1) continue;   // (the clearing)
      if (Math.hypot((jx - qx) / (qrx + 2), (jy - qy) / (qry + 2)) < 1) continue;   // (the pond's edge)
      const tx = Math.floor(jx), ty = Math.floor(jy);
      if (onTrail(tx, ty) || m.tiles[ty * m.w + tx] !== T.GRASS || Math.abs(jx - gate - 1) < 2.5 || rnd(tx, ty, 842) < 0.18) continue;
      tree(jx, jy, 843, pick(['pine', 'pine', 'spruce', 'pine', 'cypress'], rnd(tx, ty, 844)));
    }
    prop('parksign', gate + 3, py0 + 1.2, 0);
    for (const [x, y] of [[gate - 2, py0 + 1], [gate + 3, py1 - 1]]) prop('lamp', x, y, 0);
    place('Pinewood Park', px0, py0, px1, py1);
  }
}
