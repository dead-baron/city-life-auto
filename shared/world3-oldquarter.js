// World v3, handcrafted: the Old Quarter's Chapel Street quarter (district 30), Elm Street to Cedar Street between Old
// Quarter Road and Harbor Avenue, across Elm Street from Old Quarter Station, from the research's sources for the Old
// Quarter (D5: old brick round a small square; AL1-4: the back lanes; SC2-E: the station town's street life at the
// gates; IN11: the corner shops; L6-A: the sento) with the towers' kit of Downtown: the grid's nine little blocks of
// look-alike liquor marts give way to
//   - Lantern Lane and Bell Lane, the old lanes jogging across the quarter, and Tanner's Alley behind the tenements;
//   - on Lantern Lane, old brick tenements over their shops - Lucky Dragon Noodles, Quarter Pawn & Loan, Suds
//     Laundromat, Kovac's Barber, Mama Rosa's Bodega - with fire escapes, the backs on Old Quarter Road;
//   - Station Square across Elm Street from the station: the market stalls and the fruit crates, the news stand, the
//     food cart, benches and lamps;
//   - St. Brigid's Chapel facing Bell Lane over its churchyard, the Old Quarter Baths (the sento) beside it;
//   - on Harbor Avenue, the redevelopment site behind its hoarding (the frame going up, the crane, the site office) and
//     the tenements' shops - Ink & Iron Tattoo, Second Chance Thrift, Madame Zora's;
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 30;   // the Old Quarter (shared/mapcore.js DISTRICTS)
export const QX = { elm: 2243, cedar: 2371, tanner: 2308 };
export const QY = { oqr: 1800, harbor: 1900 };
const LANTERN = [[QX.elm, 1833], [2280, 1833], [2286, 1838], [QX.cedar, 1838]];
const BELL = [[QX.elm, 1867], [2300, 1867], [2306, 1872], [QX.cedar, 1872]];
const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5040', '#b0644c', '#6e3e30'];
const STONE = ['#d4c8b0', '#c8bca4', '#cfc4ae', '#bfb4a0'];

export const OLDQUARTER = {
  key: 'oldquarter', d: D, rect: [QX.elm, QY.oqr, QX.cedar, QY.harbor],
  streets: () => [
    { name: 'Lantern Lane', kind: 'st', pts: LANTERN },
    { name: 'Bell Lane', kind: 'st', pts: BELL },
    { name: "Tanner's Alley", kind: 'alley', pts: [[QX.tanner, 1838], [QX.tanner, 1872]] },
  ],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower } = towerKit(K, out);
  const placeName = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  const along = (P, x) => { for (let j = 1; j < P.length; j++) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && ax !== bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return P[P.length - 1][1]; };
  // an old brick tenement's art: four or five floors, a fire escape on the wider ones, a shop under it now and then
  const brickArt = (x, y, w, floors, shop = null) => tower(x, y, { name: shop ? shop.name : '', style: rnd(x, y, 41) < 0.75 ? 'brick' : 'brickDark', tone: pick(BRICK, rnd(x, y, 42)), wall: pick(STONE, rnd(x, y, 43)), floors,
    ...(shop ? { store: shop.store, awning: shop.awning, grille: shop.grille ?? false, signC: shop.sign } : { shop: false }), win: pick(['pair', 'even', 'tall'], rnd(x, y, 44)), cornice: pick(['bracket', 'dentil'], rnd(x, y, 47)), parapet: 6, grime: 0.35 + rnd(x, y, 48) * 0.25,
    roofMat: pick(['tar', 'gravel', 'tar'], rnd(x, y, 45)), spec: floors >= 4 && w >= 9 && rnd(x, y, 46) < 0.65 ? { fireEscape: [Math.max(8, Math.round(w * TILE * 0.55) - 25), 50] } : null });
  // a row of tenements facing the lane south of it: the shops from `list` along it, flats between
  const tenements = (x0, x1, y0, y1, list, depth = 14) => {
    let k = 0;
    return K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 6) return room >= 1 ? { gap: room, kind: 'passage' } : null;
      if (i % 3 === 2) return { gap: 3, kind: rnd(x, y0, 50) < 0.5 ? 'passage' : 'yard' };
      const L = i % 3 === 0 ? list[k] : null;
      if (L) k++;
      const w = Math.min(room, L ? L.w : 8 + Math.floor(rnd(x, y0, 51) * 4)), floors = 4 + Math.floor(rnd(x, y0, 52) * 2);
      if (L) out.shops++; else out.homes++;
      return { w, depth, arch: L ? 'mixed' : 'walkup', name: L ? L.name : 'Tenement', ...(L ? { poi: L.poi || { kind: 'delivery', label: L.name } } : { poi: false }), home: { kind: 'apartment', price: 9000 + Math.floor(rnd(x, y0, 53) * 4) * 1000 }, whole: true, art: brickArt(x, y0, w, floors, L) };
    }, { rough: true });
  };

  lanternLane();
  middleRow();
  harborAvenue();
  K.landscape({ bare: 0.55, tree: (x, y, r) => r < 0.8 ? ['tree_b', pick(['street', 'maple', 'oak'], rnd(x, y, 831)), 1.05] : ['shrub_a', null, 1] });
  void api;
  return out;

  // ===========================================================================================================
  // Old Quarter Road to Lantern Lane: the tenements facing the lane with their shops, their backs on the road
  function lanternLane() {
    const SHOPS = [
      { name: 'Lucky Dragon Noodles', store: 'diner', w: 10, poi: { kind: 'coffee', label: 'Lucky Dragon Noodles', food: true }, awning: ['#a8302a', '#f0d890'], sign: ['#a8302a', [250, 220, 120]] },
      { name: 'Quarter Pawn & Loan', store: 'pawn', w: 10, poi: { kind: 'pawn', label: 'Quarter Pawn & Loan' }, awning: null, grille: true, sign: ['#232838', [236, 214, 150]] },
      { name: 'Suds Laundromat', store: 'laundry', w: 10, awning: null, sign: ['#2a6ab0', [250, 250, 240]] },
      { name: "Kovac's Barber", store: 'barber', w: 8, poi: { kind: 'barber', label: "Kovac's Barber" }, awning: ['#7a1e2a', '#efe6d0'], sign: ['#7a1e2a', [250, 240, 220]] },
      { name: "Mama Rosa's Bodega", store: 'mart', w: 10, poi: { kind: 'convenience', label: "Mama Rosa's Bodega" }, awning: ['#2f6a4e', '#f0ece4'], grille: true, sign: ['#2f6a4e', [250, 240, 210]] },
    ];
    tenements(QX.elm + 6, QX.cedar - 5, QY.oqr + 6, 1832, SHOPS, 15);
    placeName('Lantern Lane', QX.elm, QY.oqr, QX.cedar, 1840);
  }

  // ===========================================================================================================
  // Lantern Lane to Bell Lane: Station Square across Elm Street from the station; St. Brigid's Chapel over its
  // churchyard, the Old Quarter Baths beside it; tenements to Cedar Street
  function middleRow() {
    const y0 = Math.ceil(along(LANTERN, QX.elm + 10)) + 6, y1 = Math.floor(along(BELL, QX.elm + 10)) - 6;
    // Station Square: the stalls in two rows facing the walk down the middle, the news stand, the cart, benches, lamps
    const sx0 = QX.elm + 6, sx1 = 2282;
    let free = 0;
    for (let x = sx0; x < sx1; x++) for (let y = y0; y <= y1; y++) if (K.free(x, y)) free++;
    if (free > (sx1 - sx0) * (y1 - y0) * 0.8) {
      for (let x = sx0; x < sx1; x++) for (let y = y0; y <= y1; y++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
      const my = Math.floor((y0 + y1) / 2);
      let v = 0;
      for (const ry of [my - 4, my + 4]) for (let x = sx0 + 3; x <= sx1 - 4; x += 3.6) { prop('mstall', x, ry, 14, { v: v % 4, c: (v * 3 + 1) % 4, a: ry < my ? 0 : Math.PI }); if (v % 2 === 0) prop('fruitcrate', x + 1.2, ry + (ry < my ? 1.5 : -1.5), 0); v++; }
      prop('news_a', sx0 + 1.5, y1 - 1, 6); prop('foodcart', sx1 - 3, y1 - 2, 14);
      for (const bx of [sx0 + 8, sx1 - 10]) prop('bench_m', bx, y1 - 0.8, 0);
      for (const lx of [sx0 + 1, sx1 - 1]) prop('lamp', lx, y0 + 0.8, 0);
      prop('textsign', (sx0 + sx1) / 2, y1 - 0.4, 0, { text: 'STATION SQUARE', bg: '#5a2a2e', fg: [250, 230, 170], z: 34, sx: 1 });
      placeName('Station Square', sx0, y0, sx1, y1 + 1);
    }
    // St. Brigid's Chapel over its churchyard, its front on Bell Lane
    const cx0 = 2284, cw = 20, cy1 = Math.floor(along(BELL, cx0 + 10)) - 6;
    const ch = place({ x: cx0, y: y0, w: cw, h: Math.min(16, cy1 - y0 - 5), arch: 'church', key: 'church', name: "St. Brigid's Chapel", poi: { kind: 'delivery', label: "St. Brigid's Chapel" }, whole: true,
      art: { spec: { wallColor: '#a89c88', roofColor: '#4a5058' } } });
    if (ch) {
      const gy0 = ch.ty + ch.th, gy1 = cy1 + 1;
      K.fill(cx0 - 2, gy0, cw + 4, gy1 - gy0, T.GRASS); K.take(cx0 - 2, gy0, cw + 4, gy1 - gy0);
      K.paint(cx0 + cw / 2 - 1, gy0, 2, gy1 - gy0, T.PLAZA);
      for (let k = 0; k < 6; k++) prop('mstone', cx0 + 2 + (k % 3) * 2.4 + (k >= 3 ? cw - 9 : 0), gy0 + 1.6 + (k % 2) * 1.6, 0, { w: 8, d: 4, h: 16, v: k });
      prop('tree_b', cx0 + 1, gy0 + 1, 10, { sp: 'cypress', k: 1.1 }); prop('tree_b', cx0 + cw - 1, gy0 + 1, 10, { sp: 'cypress', k: 1.1 });
      prop('fenceline', cx0 - 1.8, gy1 - 0.4, 0, { kind: 'iron', tx: (cw / 2 + 0.6) * TILE, ty: 0 });
      prop('fenceline', cx0 + cw / 2 + 1.2, gy1 - 0.4, 0, { kind: 'iron', tx: (cw / 2 + 0.6) * TILE, ty: 0 });
      placeName("St. Brigid's Chapel", cx0, y0, cx0 + cw, gy1);
    }
    // the Old Quarter Baths (the sento: the timber bath house, its noren, the tall boiler chimney behind)
    const bx0 = QX.tanner + 6, bw = 22;
    const bh = place({ x: bx0, y: y0 + 2, w: bw, h: Math.min(14, cy1 - y0 - 3), arch: 'mixed', key: 'rest2', name: 'Old Quarter Baths', poi: { kind: 'delivery', label: 'Old Quarter Baths' }, whole: true,
      art: { spec: { floors: 2, style: 'siding', wallColor: '#7a5a40', win: 'pair', pitch: 'gable', ridge: 'ns', slope: 0.42, roofColor: '#3a4048', parapet: 6, grime: 0.12, blades: [], plaques: [] },
        shop: { kind: 'lobby', door: 'left', open: true, people: 2, sign: { text: 'BATHS', bg: '#2a3a5a', fg: [240, 236, 220], lit: true }, awning: ['#2a3a5a', '#2a3a5a'] }, kit: [] } });
    if (bh) {
      prop('chainfence', bx0 + bw + 0.6, bh.ty + 1, 0, { tx: 0, ty: (bh.th - 2) * TILE });
      prop('woodpile', bx0 + bw + 2, bh.ty + 3, 8); prop('drum', bx0 + bw + 2.2, bh.ty + 7, 6);
      const fy = bh.ty + bh.th;
      K.fill(bx0, fy, bw, cy1 - fy + 1, T.PLAZA);
      prop('planter_g', bx0 + 2, fy + 1.4, 8); prop('bikerack', bx0 + bw - 3, fy + 1.4, 6);
      out.shops++;
      placeName('Old Quarter Baths', bx0, y0, bx0 + bw, cy1 + 1);
    }
    // tenements to Cedar Street
    tenements(bx0 + bw + 4, QX.cedar - 5, y0, cy1, [{ name: 'Bao House', store: 'cafe', w: 9, poi: { kind: 'coffee', label: 'Bao House', food: true }, awning: ['#c8a040', '#2a2420'], sign: ['#2a2420', [236, 200, 120]] }], 14);
    // between the chapel and the alley: tenements
    tenements(cx0 + cw + 3, QX.tanner - 3, y0, cy1, [], 13);
  }

  // ===========================================================================================================
  // Bell Lane to Harbor Avenue: the redevelopment site behind its hoarding, the tenements' shops facing the avenue
  function harborAvenue() {
    const y0 = Math.ceil(along(BELL, QX.elm + 10)) + 6, y1 = QY.harbor - 6;
    // the site: the frame going up, the crane, the stacks, the cones (statics.js 'construction'), its hoarding
    const sx = QX.elm + 6, sw = 30;
    const cs = place({ x: sx, y: y0 + 1, w: sw, h: Math.min(18, y1 - y0 - 1), arch: 'construction', key: 'construction', name: 'Quarter Yards Redevelopment', poi: { kind: 'construction', label: 'Quarter Yards Redevelopment' }, whole: true });
    if (cs) {
      prop('textsign', sx + sw / 2, cs.ty + cs.th + 0.6, 0, { text: 'COMING SOON: QUARTER YARDS', bg: '#2a2a2a', fg: [250, 210, 60], z: 30, sx: 1 });
      for (let x = sx + 1; x < sx + sw - 1; x += 5) prop('cone', x, cs.ty + cs.th + 1.4, 0);
      placeName('Quarter Yards Redevelopment', sx, y0, sx + sw, y1);
    }
    const SHOPS = [
      { name: 'Ink & Iron Tattoo', store: 'tattoo', w: 9, awning: null, grille: true, sign: ['#1a1a1a', [230, 60, 60]] },
      { name: 'Second Chance Thrift', store: 'clothes', w: 11, awning: ['#5a3a6a', '#f0ece4'], sign: ['#5a3a6a', [250, 240, 220]] },
      { name: "Madame Zora's", store: 'mart', w: 8, awning: ['#3a1e4a', '#e8c040'], sign: ['#3a1e4a', [232, 192, 64]] },
      { name: 'Quarter Liquor', store: 'liquor', w: 9, poi: { kind: 'convenience', label: 'Quarter Liquor' }, awning: null, grille: true, sign: ['#232838', [236, 214, 150]] },
    ];
    tenements(sx + sw + 3, QX.cedar - 5, y0, y1, SHOPS, 14);
  }
}
