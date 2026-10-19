// World v3, handcrafted: Southside's Riverway Houses (district 6), Marina Avenue to Poplar Street from 11th Street to 17th
// Street, from the research's sources for Southside (D6: the rough side's projects round a yard; CR2's east half: the
// corner of Crown Pawn and Riverway Liquor; IN11: the corner shops; AL1-3: the yards and alleys; SC2-G: the laundromat
// and the check-cashing front; B7: the street at night): the grid's little blocks of look-alike corner marts give way to
//   - on Pelican Avenue's north side, the corner of Crown Pawn and Riverway Liquor, Wash World, Lucky 7 Check Cashing,
//     Southside Wings and a boarded-up shop, their backs on 11th Street;
//   - across the avenue, Riverway Houses: three brick slab blocks ten floors high round their yard - the asphalt, the
//     basketball court in its chain-link (a hoop to shoot at: shared/hoops.js), the benches, the picnic tables, the
//     burn barrel, the graffiti walls, scraggly trees in the patches of grass;
//   - on 17th Street, the low blocks of the Houses, Rico's Corner Store and the vacant lot behind its chain-link.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 6;   // Southside (shared/mapcore.js DISTRICTS)
export const SX = { marina: 3680, poplar: 3836 };
export const SY = { eleventh: 3120, pelican: 3150, seventeenth: 3223 };
const RECTS = [[SX.marina, SY.eleventh, SX.poplar, SY.pelican], [SX.marina, SY.pelican, SX.poplar, SY.seventeenth]];
const BRICK = ['#8e4a3a', '#7a4a3a', '#9a5040', '#6e3e30', '#84463a'];

export const SOUTHSIDE = {
  key: 'southside', d: D, rects: RECTS, rect: [SX.marina, SY.eleventh, SX.poplar, SY.seventeenth],
  streets: () => [],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower } = towerKit(K, out);
  const placeName = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1, y1] : null;
  };
  const chain = (x0, y0, x1, y1) => prop('chainfence', x0, y0, 0, { tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
  // rough brick: grime, tags, now and then boarded windows
  const roughArt = (x, y, w, floors, shop = null, o = {}) => tower(x, y, { name: shop ? shop.name : '', style: rnd(x, y, 41) < 0.6 ? 'brickDark' : 'brick', tone: pick(BRICK, rnd(x, y, 42)), floors,
    ...(shop ? { store: shop.store, awning: shop.awning === undefined ? null : shop.awning, grille: shop.grille ?? true, signC: shop.sign } : { shop: false }), win: pick(['pair', 'even'], rnd(x, y, 44)), parapet: 6, grime: 0.7 + rnd(x, y, 48) * 0.25,
    roofMat: pick(['tar', 'rubber', 'tar'], rnd(x, y, 45)), spec: { graffiti: 1 + (rnd(x, y, 49) < 0.5 ? 1 : 0), tagText: pick(['SOUTH', 'RIVER', 'KING', 'ZONE', 'REBEL', 'CREW', 'OMEN'], rnd(x, y, 50)), boarded: o.boarded ?? 0.12, ...(o.spec || {}) } });

  pelican();
  houses();
  K.landscape({ bare: 0.75, tree: (x, y, r) => r < 0.7 ? ['tree_b', pick(['young', 'street', 'deadSnag'], rnd(x, y, 831)), 1] : [pick(['bush_c', 'shrub_a'], rnd(x, y, 833)), null, 1] });
  void api;
  return out;

  // ===========================================================================================================
  // Pelican Avenue's north side: the corner of Crown Pawn and Riverway Liquor on Marina Avenue, Wash World, Lucky 7 Check
  // Cashing, Southside Wings, a boarded-up shop; walk-ups' flats over them, their backs on 11th Street
  function pelican() {
    const A = area(SX.marina, SY.eleventh + 4, SX.poplar, SY.pelican - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    const SHOPS = [
      { name: 'Crown Pawn', store: 'pawn', w: 12, poi: { kind: 'pawn', label: 'Crown Pawn' }, sign: ['#232838', [236, 214, 150]] },
      { name: 'Riverway Liquor', store: 'liquor', w: 12, poi: { kind: 'convenience', label: 'Riverway Liquor' }, sign: ['#1a3a2a', [120, 230, 140]] },
      { name: 'Wash World', store: 'laundry', w: 13, sign: ['#2a6ab0', [250, 250, 240]] },
      { name: 'Lucky 7 Check Cashing', store: 'mart', w: 12, sign: ['#e8c040', [30, 30, 30]] },
      null,
      { name: 'Southside Wings', store: 'diner', w: 12, poi: { kind: 'coffee', label: 'Southside Wings', food: true }, awning: ['#c8501a', '#f0d890'], grille: false, sign: ['#c8501a', [250, 240, 200]] },
      { name: 'Boarded Shop', boarded: true, w: 11 },
    ];
    let k = 0;
    K.row(x0, x1, y0, y1, (x, room) => {
      if (k >= SHOPS.length) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      const L = SHOPS[k++];
      if (!L) return { gap: 4, kind: 'yard' };
      const w = Math.min(room, L.w), floors = 2 + Math.floor(rnd(x, y0, 52) * 2);
      if (L.boarded) return { w, depth: y1 - y0, arch: 'walkup', name: 'Building', poi: false, whole: true, art: roughArt(x, y0, w, floors, null, { boarded: 0.9 }) };
      out.shops++;
      return { w, depth: y1 - y0, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name }, home: { kind: 'apartment', price: 7000 }, whole: true, art: roughArt(x, y0, w, floors, L) };
    }, { rough: true });
    placeName('Crown Pawn Corner', x0, y0, x0 + 26, y1);
  }

  // ===========================================================================================================
  // Riverway Houses: the slab blocks round their yard, the low blocks and the corner store on 17th Street, the vacant lot
  function houses() {
    const A = area(SX.marina, SY.pelican + 4, SX.poplar, SY.seventeenth - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    // the three slabs along the north side, their fronts on the yard
    const sw = Math.floor((x1 - x0 - 8) / 3), sh = 20;
    const names = ['Riverway Houses A', 'Riverway Houses B', 'Riverway Houses C'];
    for (let k = 0; k < 3; k++) {
      const sx = x0 + 1 + k * (sw + 3);
      const b = place({ x: sx, y: y0, w: sw, h: sh, arch: 'walkup', name: names[k], poi: false, home: { kind: 'apartment', price: 6000 + k * 500, slots: 3 }, whole: true,
        art: roughArt(sx, y0, sw, 10, null, { spec: { fireEscape: [Math.round(sw * TILE * 0.5) - 25, 50] } }) });
      if (b) prop('textsign', sx + 4, y0 + sh + 0.7, 0, { text: ['BLDG A', 'BLDG B', 'BLDG C'][k], bg: '#3a3a3a', fg: [220, 220, 210], z: 24, sx: 1 });
    }
    // the low blocks on 17th Street (the Houses' two-storey row), the corner store on Poplar Street's corner, the vacant lot
    const ly0 = y1 - 12;
    let lowX = x0;
    const lot = { x0: x0 + 52, x1: x0 + 76 };
    K.row(x0, x1, ly0, y1 - 1, (x, room, i) => {
      if (x >= lot.x0 && x < lot.x1) return { gap: Math.min(room, lot.x1 - x), kind: 'plaza' };
      if (room < 8) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      if (x + 12 >= x1 - 1) { out.shops++; return { w: room, depth: 12, arch: 'mixed', name: "Rico's Corner Store", poi: { kind: 'convenience', label: "Rico's Corner Store" }, whole: true, art: roughArt(x, ly0, room, 2, { name: "Rico's Corner Store", store: 'mart', sign: ['#7a1e2a', [250, 240, 220]] }) }; }
      if (i % 2 === 1) return { gap: 3, kind: 'yard' };
      lowX = x;
      const w = Math.min(room, 16, lot.x0 > x ? lot.x0 - x : 99);
      out.homes++;
      return { w, depth: 12, arch: 'walkup', name: 'Riverway Houses', poi: false, home: { kind: 'apartment', price: 5500 }, whole: true, art: roughArt(x, ly0, w, 2) };
    }, { rough: true });
    void lowX;
    // the vacant lot: chain-link round the weeds, a tyre pile, a trash pile, a dumped sofa's worth of junk
    {
      const vx0 = lot.x0, vx1 = lot.x1, vy0 = ly0 + 1, vy1 = y1 - 1;
      K.paint(vx0, vy0, vx1 - vx0, vy1 - vy0, T.DIRT);
      chain(vx0 + 0.3, vy0 + 0.3, vx1 - 0.3, vy0 + 0.3); chain(vx0 + 0.3, vy1 - 0.3, vx1 - 0.3, vy1 - 0.3);
      chain(vx0 + 0.3, vy0 + 0.3, vx0 + 0.3, vy1 - 0.3); chain(vx1 - 0.3, vy0 + 0.3, vx1 - 0.3, vy1 - 0.3);
      for (let k = 0; k < 7; k++) prop(pick(['bush_c', 'shrub_a', 'bush_c'], rnd(k, vx0, 60)), vx0 + 2 + rnd(k, vy0, 61) * (vx1 - vx0 - 4), vy0 + 2 + rnd(k, vy1, 62) * (vy1 - vy0 - 4), 0);
      prop('tires', vx0 + 4, vy0 + 4, 8); prop('trashpile', vx1 - 5, vy1 - 3, 0); prop('drum', vx0 + 9, vy1 - 3, 6); prop('pallet', vx1 - 9, vy0 + 3, 6);
      placeName('Vacant Lot', vx0, vy0, vx1, vy1);
    }
    // the yard between: asphalt, the court in its chain-link, the patches of grass with their trees, benches, tables,
    // the burn barrel, the graffiti walls, a boombox on a bench
    const yy0 = y0 + sh, yy1 = ly0;
    if (yy1 - yy0 < 12) return;
    K.fill(x0, yy0, x1 - x0, yy1 - yy0, T.LOT);
    K.take(x0, yy0, x1 - x0, yy1 - yy0);
    const cw = 18, cx0 = Math.floor((x0 + x1) / 2 - cw / 2), ch = yy1 - yy0 - 4;
    K.gap('court', cx0, yy0 + 2, cw, ch, { courtName: 'Riverway Houses Court' });
    prop('gwall', cx0 - 6, yy0 + 3, 0, { len: 180, v: 2 });
    prop('gwall', cx0 + cw + 6, yy0 + 3, 0, { len: 160, v: 1 });
    for (const [gx0, gx1] of [[x0 + 3, cx0 - 8], [cx0 + cw + 8, x1 - 3]]) {
      if (gx1 - gx0 < 10) continue;
      const gy0 = yy0 + 4, gy1 = yy1 - 3;
      K.paint(gx0, gy0, gx1 - gx0, gy1 - gy0, T.GRASS);
      for (let tx = gx0 + 3; tx < gx1 - 2; tx += 9) prop('tree_b', tx, gy0 + 3 + rnd(tx, gy0, 63) * 3, 10, { sp: pick(['young', 'street', 'deadSnag'], rnd(tx, gy0, 64)), k: 1 });
      for (let bx = gx0 + 5; bx < gx1 - 4; bx += 12) { prop('bench_m', bx, gy1 + 1.2, 0); prop('picnic', bx + 5, gy0 + (gy1 - gy0) / 2 + 1, 6); }
      prop('trashpile', gx1 - 2, gy1 - 1.5, 0);
    }
    prop('burnbarrel', cx0 - 3, yy1 - 3, 8);
    prop('boombox', cx0 + cw + 3, yy1 - 2.4, 0);
    for (const lx of [x0 + 1, x1 - 1, cx0 - 1, cx0 + cw + 1]) prop('lamp', lx, yy0 + 1, 0);
    prop('dump_g', x0 + 2, yy1 - 2, 12); prop('dump_o', x1 - 3, yy1 - 2, 12);
    placeName('Riverway Houses', x0, y0, x1, y1);
  }
}
