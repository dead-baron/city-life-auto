// World v3, handcrafted: Falls Center's main street (district 36), Lake Avenue to Linden Street either side of Falls
// Avenue, from the research's sources for Falls Center (B1: the main street's storefronts; SC4-C and IN4: the corner
// shops and the coffee house; NP3: the town green; D12: the small civic heart): the island's main street - Falls
// Avenue - with its shops facing it from the north across from Falls Green:
//   - the storefronts under their awnings, two and three floors of brick and painted clapboard with flats over them:
//     Falls Pizza, the 24/7 Mart, Bean There Coffee, Urban Wear, Falls Pharmacy, Falls Hardware, the Main Street Diner,
//     Cedar Books, Pine & Petal Florist (the generator's two rows of them, laid here);
//   - Falls Green across the avenue: the bandstand, the memorial on its plinth, the fountain, the paths, benches and
//     lamps, the flower beds, maples and oaks, the market stalls along 16th Street.
// Cedar Falls Clinic and Cedar Falls Police stay the generator's. Every building faces south (the camera). Names,
// signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 36;   // Falls Center (shared/mapcore.js DISTRICTS)
export const CX = { lake: 4100, linden: 4200 };
export const CY = { fifteenth: 2367, falls: 2400, sixteenth: 2433 };
const RECTS = [[CX.lake, CY.fifteenth, CX.linden, CY.falls], [CX.lake, CY.falls, CX.linden, CY.sixteenth]];
const BRICK = ['#a85a42', '#b8705a', '#9a5040', '#b0644c'];
const PAINT = ['#e8dcc4', '#c8d8d0', '#e4d0b8', '#d8c8d8', '#f0e8d4'];

export const FALLSCENTER = {
  key: 'fallscenter', d: D, rects: RECTS, rect: [CX.lake, CY.fifteenth, CX.linden, CY.sixteenth],
  streets: () => [],
  specials: ['Falls Pizza', 'Falls Hardware'],   // (the generator's two rows of the main street's shops: laid here)
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { tower } = towerKit(K, out);
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1, y1] : null;
  };
  const placeName = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });

  mainStreet();
  green();
  void api;
  return out;

  // ===========================================================================================================
  // Falls Avenue's north side: the storefronts facing the avenue, their awnings, flats over them; benches, planters,
  // a bus shelter and bike racks along the pavement
  function mainStreet() {
    const A = area(CX.lake, CY.fifteenth + 4, CX.linden, CY.falls - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    const SHOPS = [
      { name: 'Falls Pizza', store: 'diner', w: 10, poi: { kind: 'coffee', label: 'Falls Pizza', food: true }, awning: ['#c8302a', '#f0ece4'], signC: ['#c8302a', [250, 240, 210]] },
      { name: '24/7 Mart', store: 'mart', w: 9, poi: { kind: 'convenience', label: '24/7 Mart' }, awning: ['#2f6a4e', '#f0ece4'], signC: ['#2f6a4e', [250, 240, 210]] },
      { name: 'Bean There Coffee', store: 'cafe', w: 9, poi: { kind: 'coffee', label: 'Bean There Coffee' }, awning: ['#3a2a20', '#efe6d0'], signC: ['#3a2a20', [236, 214, 150]] },
      { name: 'Urban Wear', store: 'clothes', w: 10, poi: { kind: 'clothing', label: 'Urban Wear' }, awning: ['#232838', '#232838'], signC: ['#232838', [240, 236, 220]] },
      { name: 'Falls Pharmacy', store: 'mart', w: 10, poi: { kind: 'pharmacy', label: 'Falls Pharmacy' }, awning: ['#2a7a6a', '#f0ece4'], signC: ['#2a7a6a', [250, 250, 245]] },
      { name: 'Falls Hardware', store: 'mart', w: 10, poi: { kind: 'delivery', label: 'Falls Hardware' }, awning: ['#a83a2a', '#f0ece4'], signC: ['#a83a2a', [250, 240, 220]] },
      { name: 'Main Street Diner', store: 'diner', w: 10, poi: { kind: 'coffee', label: 'Main Street Diner', food: true }, awning: ['#2a5a8a', '#f0ece4'], signC: ['#2a5a8a', [250, 246, 230]] },
      { name: 'Cedar Books', store: 'books', w: 9, poi: { kind: 'delivery', label: 'Cedar Books' }, awning: ['#2a4a3a', '#f0ece4'], signC: ['#2a4a3a', [240, 236, 214]] },
      { name: 'Pine & Petal Florist', store: 'florist', w: 9, poi: { kind: 'delivery', label: 'Pine & Petal Florist' }, awning: ['#8a3a6a', '#f0ece4'], signC: ['#8a3a6a', [250, 240, 245]] },
    ];
    let k = 0;
    const depth = Math.min(16, y1 - y0 - 3);
    const made = K.row(x0, x1, y0, y1 - 3, (x, room) => {
      const L = SHOPS[k];
      if (!L) return room >= 1 ? { gap: room, kind: 'passage' } : null;
      const w = Math.min(room, L.w);
      if (w < 7) return { gap: room, kind: 'passage' };
      k++; out.shops++;
      const brick = rnd(x, y0, 1) < 0.55;
      return { w, depth, arch: 'mixed', name: L.name, poi: L.poi, home: { kind: 'apartment', price: 14000 }, whole: true,
        art: tower(x, y0, { ...L, style: brick ? 'brick' : 'siding', tone: pick(BRICK, rnd(x, y0, 2)), wall: pick(PAINT, rnd(x, y0, 3)), floors: 2 + Math.floor(rnd(x, y0, 4) * 2), win: pick(['pair', 'tall'], rnd(x, y0, 5)), cornice: 'bracket', parapet: 8, grime: 0.06 }) };
    });
    // the pavement in front: benches, planters, bike racks, the bus shelter, lamps (the walk paved to the kerb)
    const built = made.filter((b) => b && !b.gap && b.tw !== undefined);
    if (!built.length) return;
    const fy = Math.max(...built.map((b) => b.ty + b.th));
    K.fill(x0, fy, x1 - x0, y1 - fy, T.PLAZA);
    for (let x = x0 + 4; x < x1 - 3; x += 9) prop(pick(['bench_m', 'planter_g', 'bikerack', 'planter_fl'], rnd(x, fy, 6)), x, y1 - 1.2, 8);
    prop('busstop', Math.floor((x0 + x1) / 2), y1 - 0.8, 0);
    for (let x = x0 + 2; x < x1; x += 14) prop('lamp', x, y1 - 0.6, 0);
    placeName('Falls Avenue', x0, y0, x1, y1);
  }

  // ===========================================================================================================
  // Falls Green across the avenue: the paths, the bandstand at the heart, the memorial on its plinth, the fountain, the
  // benches round them, flower beds, maples and oaks, the market stalls along 16th Street
  function green() {
    const A = area(CX.lake, CY.falls + 4, CX.linden, CY.sixteenth - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A, w = x1 - x0, h = y1 - y0, mx = Math.floor((x0 + x1) / 2), my = Math.floor((y0 + y1) / 2);
    K.fill(x0, y0, w, h, T.GRASS); K.take(x0, y0, w, h);
    // the paths: round the edge, across through the middle both ways
    K.paint(x0, y0, w, 2, T.PLAZA); K.paint(x0, y1 - 2, w, 2, T.PLAZA);
    K.paint(x0, my - 1, w, 2, T.PLAZA); K.paint(mx - 1, y0, 2, h, T.PLAZA);
    K.paint(mx - 5, my - 5, 10, 10, T.PLAZA);
    prop('gazebo', mx, my + 0.5, 30);
    const qx = x0 + Math.floor(w * 0.22), rx = x1 - Math.floor(w * 0.22);
    K.paint(qx - 3, my - 3, 6, 6, T.PLAZA); prop('statue', qx, my, 14);
    K.paint(rx - 3, my - 3, 6, 6, T.PLAZA); prop('fountain', rx, my + 0.4, 36);
    for (const [bx, by] of [[mx - 7, my - 3], [mx + 7, my - 3], [mx - 7, my + 3], [mx + 7, my + 3], [qx, my + 4.5], [rx, my + 4.5]]) prop('bench_m', bx, by, 0);
    for (let k = 0; k < 8; k++) { const fx = x0 + 4 + k * ((w - 8) / 7); if (Math.abs(fx - mx) < 6) continue; prop('flowers_big', fx, y0 + 3.2, 0); }
    for (const [tx, ty] of [[x0 + 3, y0 + 5], [x1 - 3, y0 + 5], [x0 + 3, y1 - 5], [x1 - 3, y1 - 5], [mx - 14, y0 + 5], [mx + 14, y0 + 5], [mx - 14, y1 - 5], [mx + 14, y1 - 5]]) prop(rnd(tx, ty, 7) < 0.5 ? 'tree_a' : 'tree_b', tx, ty, 10, { sp: pick(['maple', 'oak', 'redMaple', 'mapleAutumn'], rnd(tx, ty, 8)), k: 1.2 });
    for (let lx = x0 + 2; lx < x1; lx += 16) prop('lamp', lx, y0 + 1, 0);
    // the stalls along 16th Street (the farmers' market)
    let v = 0;
    for (let sx = x0 + 6; sx < x1 - 6; sx += 4.2) { if (Math.abs(sx - mx) < 4) continue; prop('mstall', sx, y1 - 3.4, 14, { v: v % 4, c: (v * 3 + 1) % 4, a: Math.PI }); v++; }
    prop('parksign', mx + 3, y0 + 1.4, 0);
    placeName('Falls Green', x0, y0, x1, y1);
  }
}
