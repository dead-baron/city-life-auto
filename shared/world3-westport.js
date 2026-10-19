// World v3, handcrafted: Westport Center's heart (district 23), Westport Avenue to Quarter Avenue from 8th Street to the
// bay, from the research's sources for the western city's downtown (D1: the tower district round its plaza with the
// monument sign; SK6 and SC2-C/D: the towers, their podium shops and forecourts; B1: the corner storefronts) and the
// towers' kit of Downtown (shared/world3-downtown.js): the grid's small blocks of look-alike towers give way to
//   - on Westport Boulevard's north side, The Harborlight Hotel on the district's axis behind its canopy and drive-up,
//     Westport Center Tower and Quarter Trust Building either side of it, shops between;
//   - across the boulevard, Westport Center Plaza: the WESTPORT CENTER monument sign at the kerb, the fountain on the
//     axis, the food carts and their tables under festoon lights, plane trees, benches, planters, lamps;
//   - on Pier Avenue, the towers behind their forecourts - Westport Exchange, Pier Avenue Tower, Bayview Tower, The
//     Commodore - with the cafes and shops in their podiums;
//   - between Pier Avenue and the bay, Harbor Point's apartment towers and Westport Savings Bank facing the Waterfront
//     Walk: the promenade along the shore with its palms, benches, lamps, telescopes and railing.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 23;   // Westport Center (shared/mapcore.js DISTRICTS)
// the lines it keeps (tiles): the avenues round it
export const PX = { west: 1780, quarter: 1960, axis: 1870 };
export const PY = { eighth: 2160, blvd: 2200, pier: 2300, shore: 2400 };
const RECTS = [[PX.west, PY.eighth, PX.quarter, PY.blvd], [PX.west, PY.blvd, PX.quarter, PY.pier], [PX.west, PY.pier, PX.quarter, PY.shore]];

export const WESTPORT = {
  key: 'westport', d: D, rects: RECTS, rect: [PX.west, PY.eighth, PX.quarter, PY.shore],
  streets: () => [],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower, towerLot, forecourt } = towerKit(K, out);
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

  boulevardNorth();
  plaza();
  pierAvenue();
  waterfront();
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.75 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['streetPl', 'magnolia', 'streetPl', 'maple'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : r < 0.9 ? ['palm_a', 'royal', 1.15] : [pick(['shrub_a', 'flowers_big'], rnd(x, y, 833)), null, 1] });
  void api;
  return out;

  // ===========================================================================================================
  // 8th Street to Westport Boulevard: The Harborlight Hotel on the axis, its canopy, the drive-up with the taxis, the
  // palms in their planters; Westport Center Tower west of it, Quarter Trust Building east, shops between
  function boulevardNorth() {
    const A = area(PX.west, PY.eighth + 4, PX.quarter, PY.blvd - 4);
    if (!A) return;
    const [x0, y0, x1, y1] = A, h = y1 - y0;
    const hw = 52, hx = PX.axis - hw / 2, hh = Math.min(18, h - 7);
    const ht = place({ x: hx, y: y0, w: hw, h: hh, arch: 'hotel', key: 'hotel', name: 'The Harborlight Hotel', poi: { kind: 'delivery', label: 'The Harborlight Hotel' }, whole: true,
      art: tower(hx, y0, { name: 'The Harborlight Hotel', sign: 'HARBORLIGHT HOTEL', style: 'stone', wall: '#e8e0cc', floors: 15, win: 'tall', cornice: 'dentil', store: 'lobby', awning: ['#1e3a5e', '#1e3a5e'], signC: ['#1e3a5e', [250, 226, 150]] }) });
    if (ht) {
      // the drive-up: asphalt along the front, the canopy over the door, the taxis, palms in planters, lamps
      const dy0 = y0 + hh, dy1 = y1;
      K.fill(hx - 6, dy0, hw + 12, dy1 - dy0, T.PLAZA);
      for (let y = dy0 + 1; y < dy1 - 1; y++) for (let x = hx - 2; x < hx + hw + 2; x++) m.set(x, y, T.LOT);
      prop('canopy', PX.axis, dy0 + 2.2, 0, { w: 220, d: 70, h: 48 });
      m.parking.push({ x: (PX.axis - 12) * TILE, y: (dy0 + 3) * TILE, a: 0, model: 'taxi' }, { x: (PX.axis + 12) * TILE, y: (dy0 + 3) * TILE, a: 0, model: 'taxi' });
      for (const dx of [-hw / 2 - 3, hw / 2 + 3]) prop('palm_a', PX.axis + dx, dy0 + 2, 10, { sp: 'royal', k: 1.2 });
      for (const dx of [-18, -6, 6, 18]) prop('plamp', PX.axis + dx, dy1 - 0.6, 6);
      placeName('The Harborlight Hotel', hx, y0, hx + hw, dy1);
    }
    // the towers either side, shops in the gaps
    towerLot({ x: x0, y: y0, w: 34, h: h - 4, name: 'Westport Center Tower', floors: 18, tint: '#2e5670', roofMat: 'gravel' });
    towerLot({ x: x1 - 34, y: y0, w: 34, h: h - 4, name: 'Quarter Trust Building', style: 'stone', floors: 12, wall: '#d4c8b0', cornice: 'step' });
    const SHOPS = [
      { name: 'Harborlight Grill', store: 'restaurant', poi: { kind: 'coffee', label: 'Harborlight Grill', food: true }, awning: ['#5a2a2e', '#efe6d0'] },
      { name: 'Center News', store: 'mart', awning: ['#1e3a5e', '#f0ece4'] },
      { name: 'Westport Optics', store: 'mart', awning: ['#2a4a5a', '#f0ece4'] },
      { name: 'Blue Gull Coffee', store: 'cafe', poi: { kind: 'coffee', label: 'Blue Gull Coffee' }, awning: ['#2a6a8a', '#f0ece4'] },
    ];
    let k = 0;
    for (const [sx0, sx1] of [[x0 + 35, hx - 7], [hx + hw + 7, x1 - 35]]) K.row(sx0, sx1, y0, y1 - 1, (x, room) => {
      const L = SHOPS[k];
      if (!L || room < 9) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      k++;
      const w = Math.min(room, 14);
      return { w, depth: h - 6, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: tower(x, y0, { ...L, style: 'stone', floors: 4, win: 'tall' }), home: { kind: 'apartment' } };
    });
    // the forecourts down to the boulevard's pavement
    for (let x = x0; x < x1; x++) { const c = K.column(x, y0, y1); if (c && c[0] === y1 - 1) for (let y = c[1]; y <= c[0]; y++) K.fill(x, y, 1, 1, T.PLAZA); }
  }

  // ===========================================================================================================
  // Westport Center Plaza across the boulevard from the hotel: the monument sign at the kerb on the axis, the fountain
  // court (the long basin and its jets, benches round it), the food carts' courts either side under festoon lights,
  // and the lawns beyond them under rows of plane trees, their cross walks and benches; the walk along the boulevard
  function plaza() {
    const A = area(PX.west, PY.blvd + 4, PX.quarter, PY.pier - 4);
    if (!A) return;
    const [x0, y0, x1] = A, py1 = y0 + 30, ax = PX.axis;
    K.take(x0, y0, x1 - x0, py1 - y0);
    // the walk along the boulevard and along the south edge; the fountain court; the carts' courts
    K.paint(x0, y0, x1 - x0, 4, T.PLAZA);
    K.paint(x0, py1 - 3, x1 - x0, 3, T.PLAZA);
    K.paint(ax - 20, y0, 40, py1 - y0, T.PLAZA);
    for (const side of [-1, 1]) K.paint(side < 0 ? ax - 52 : ax + 20, y0 + 6, 32, py1 - y0 - 9, T.PLAZA);
    // the sign and the fountain basin on the axis
    prop('textsign', ax, y0 + 1.2, 0, { text: 'WESTPORT CENTER', bg: '#1e3a5e', fg: [250, 236, 180], z: 40, sx: 2, lit: true });
    for (const dx of [-7, 7]) prop('flowers_big', ax + dx, y0 + 1.6, 0);
    const bx0 = ax - 9, by0 = y0 + 10, bw = 18, bh = 7;
    K.paint(bx0 - 1, by0 - 1, bw + 2, bh + 2, T.PLAZA);
    for (let y = by0; y < by0 + bh; y++) for (let x = bx0; x < bx0 + bw; x++) m.set(x, y, T.WATER);
    for (const dx of [-5, 0, 5]) prop('fountain', ax + dx, by0 + bh / 2, 36);
    for (const dx of [-12, 12]) { prop('bench_m', ax + dx, by0 + 1, 0); prop('bench_m', ax + dx, by0 + bh - 1, 0); }
    for (const dx of [-6, 0, 6]) prop('bench_m', ax + dx, by0 + bh + 3, 0);
    for (const dx of [-17, 17]) for (const dy of [6, 18]) prop('tree_a', ax + dx, y0 + dy, 10, { sp: 'magnolia', k: 1.1 });
    // the food carts' courts: three carts, their tables and umbrellas, the festoon over them, bins
    for (const side of [-1, 1]) {
      const cx = ax + side * 36;
      for (let k = 0; k < 3; k++) prop('foodcart', cx - 9 + k * 9, y0 + 9, 14);
      for (let k = 0; k < 6; k++) {
        const tx = cx - 12 + (k % 3) * 12, ty = y0 + 15 + Math.floor(k / 3) * 5;
        prop('cafetable', tx, ty, 0);
        prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(tx, ty, 1)), tx, ty - 0.1, 0);
      }
      for (const fy of [y0 + 13, y0 + 19]) prop('festoon', cx - 15, fy, 0, { tx: 30 * TILE, ty: 0, h: 60 });
      prop('trashcan', cx - 15, py1 - 4.4, 0); prop('trashcan', cx + 15, py1 - 4.4, 0);
    }
    // the lawns beyond: plane trees in rows, a cross walk, benches along it
    for (const [lx0, lx1] of [[x0, ax - 52], [ax + 52, x1]]) {
      if (lx1 - lx0 < 10) continue;
      const mx = Math.floor((lx0 + lx1) / 2);
      K.paint(mx - 1, y0 + 4, 2, py1 - y0 - 7, T.PLAZA);
      K.paint(lx0, y0 + 14, lx1 - lx0, 2, T.PLAZA);
      for (let ty = y0 + 7; ty < py1 - 4; ty += 7) for (let tx = lx0 + 3; tx < lx1 - 2; tx += 7) { if (Math.abs(tx - mx) < 3 || Math.abs(ty - y0 - 15) < 2) continue; prop('tree_a', tx, ty, 10, { sp: pick(['streetPl', 'streetPl', 'maple'], rnd(tx, ty, 2)), k: 1.15 }); }
      for (const bx of [mx - 5, mx + 5]) { prop('bench_m', bx, y0 + 13.2, 0); prop('bench_m', bx, y0 + 16.8, 0); }
      for (const fx of [lx0 + 2, lx1 - 2]) prop('flowers_big', fx, y0 + 15, 0);
    }
    // the lamps along the boulevard walk, the planters along the south walk
    for (let x = x0 + 6; x < x1 - 4; x += 12) prop('lamp', x, y0 + 3.4, 0);
    for (let x = x0 + 4; x < x1 - 4; x += 10) { if (Math.abs(x - ax) < 8) continue; prop(pick(['planter_g', 'planter_sq', 'planter_fl'], rnd(x, py1, 3)), x, py1 - 1.6, 8); }
    placeName('Westport Center Plaza', x0, y0, x1, py1);
  }

  // ===========================================================================================================
  // Pier Avenue's towers behind the plaza: their forecourts to the avenue, cafes and shops in their podiums
  function pierAvenue() {
    const A = area(PX.west, PY.blvd + 4, PX.quarter, PY.pier - 4);
    if (!A) return;
    const [x0, , x1, y1] = A, y0 = A[1] + 1, h = y1 - y0;   // (the plaza is taken: what's left is its south)
    const T4 = [
      { w: 36, name: 'Westport Exchange', floors: 16, tint: '#2a4a6a', inset: 2 },
      { w: 30, name: 'Pier Avenue Tower', style: 'stone', floors: 10, wall: '#ddd2bc', cornice: 'dentil', inset: 8, cafe: { name: 'Pier Street Deli', store: 'cafe', poi: { kind: 'coffee', label: 'Pier Street Deli', food: true }, awning: ['#2f5a4a', '#f0ece4'] } },
      { w: 38, name: 'Bayview Tower', floors: 14, tint: '#36606e', inset: 2 },
      { w: 30, name: 'The Commodore', style: 'stone', floors: 9, wall: '#c8bca4', cornice: 'bracket', inset: 6, home: true },
    ];
    let x = x0;
    for (const t of T4) {
      if (x + t.w > x1) break;
      const b = towerLot({ x, y: y0 + t.inset, w: t.w, h: h - t.inset - 6, ...t, ...(t.home ? { home: { kind: 'apartment', price: 26000 }, poi: false } : {}) });
      if (b) {
        const fy = b.ty + b.th;
        forecourt(b.tx, fy, b.tw, y1 - fy, { fountain: t.w >= 36 });
        K.take(b.tx, fy, b.tw, y1 - fy);
      }
      x += t.w + 3;
    }
    // what's left on the corner: a row of shops under the flats
    const CORNER = [{ name: 'Gilded Gull Jewelers', store: 'mart', awning: ['#16202c', '#16202c'] }, { name: 'Tidewater Books', store: 'books', awning: ['#2a4a3a', '#f0ece4'] }, { name: 'Pier Pressed Juice', store: 'cafe', poi: { kind: 'coffee', label: 'Pier Pressed Juice' }, awning: ['#e8a030', '#f0ece4'] }];
    let k = 0;
    K.row(x, x1, y0, y1 - 1, (xx, room) => {
      const L = CORNER[k];
      if (!L || room < 9) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      k++;
      return { w: Math.min(room, 13), depth: 20, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: tower(xx, y0, { ...L, style: 'stone', floors: 5, win: 'arch', wall: '#e2dac6' }), home: { kind: 'apartment' } };
    });
    // the gaps between the towers: passages to the plaza
    for (let xx = x0; xx < x1; xx++) { const c = K.column(xx, y0, y1 - 1); if (c && c[1] <= y0 + 2 && c[0] >= y1 - 2) K.fill(xx, c[1], 1, c[0] - c[1] + 1, T.PLAZA); }
  }

  // ===========================================================================================================
  // Pier Avenue to the bay: Harbor Point's apartment towers and Westport Savings Bank facing the Waterfront Walk (the
  // promenade along the shore: palms, benches, lamps, the telescopes, the railing over the water)
  function waterfront() {
    const A = area(PX.west, PY.pier + 4, PX.quarter, PY.shore + 4);
    if (!A) return;
    const [x0, y0, x1] = A;
    // the shore line at each column: the last land tile going south
    const shoreY = (x) => { let y = y0; while (y < PY.shore + 10 && m.land[y * m.w + x] && m.tiles[y * m.w + x] !== T.WATER && m.tiles[y * m.w + x] !== T.DEEP) y++; return y; };
    let sMin = 1e9;
    for (let x = x0; x < x1; x++) sMin = Math.min(sMin, shoreY(x));
    const wy0 = Math.min(sMin - 9, y0 + 64);   // (the walk's north edge)
    // the walk: paving from the buildings' fronts to the water's edge, palms, benches, lamps, telescopes, the railing
    for (let x = x0; x < x1; x++) { const s = shoreY(x); for (let y = wy0; y < s; y++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA); }
    for (let x = x0 + 4; x < x1 - 3; x += 10) {
      const s = shoreY(x);
      prop('palm_a', x, wy0 + 2, 10, { sp: pick(['royal', 'coconut', 'royal'], rnd(x, wy0, 4)), k: 1.15 });
      prop(rnd(x, s, 5) < 0.6 ? 'bench_m' : 'lamp', x + 5, s - 1.6, 0);
      if (rnd(x, s, 6) < 0.25) prop('scope', x + 2, s - 1.2, 6);
    }
    for (let x = x0; x < x1 - 1; x += 4) { const s = Math.max(shoreY(x), shoreY(x + 4)); if (s < PY.shore + 4) prop('fenceline', x + 0.1, s - 0.3, 0, { kind: 'iron', tx: 4 * TILE - 6, ty: 0 }); }   // (the railing only over the water)
    placeName('Waterfront Walk', x0, wy0, x1, sMin);
    // the row facing the walk: Westport Savings Bank on Westport Avenue's corner, Harbor Point's towers east of it, the
    // passages between; behind them, up to Pier Avenue, Harbor Point Gardens (the lawn, its walks, benches)
    const th = 30, ty = wy0 - 6 - th;
    const bank = place({ x: x0 + 1, y: wy0 - 6 - 20, w: 30, h: 20, arch: 'bank', key: 'bank2', name: 'Westport Savings Bank', poi: { kind: 'bank', label: 'Westport Savings Bank' }, whole: true,
      art: tower(x0 + 1, ty, { name: 'Westport Savings Bank', sign: 'WESTPORT SAVINGS', style: 'stone', wall: '#e2dac6', floors: 3, win: 'arch', cornice: 'dentil', store: 'lobby', awning: ['#2a2420', '#2a2420'], signC: ['#2a2420', [236, 200, 140]] }) });
    if (bank) forecourt(bank.tx, bank.ty + bank.th, bank.tw, wy0 - bank.ty - bank.th, {});
    let x = x0 + 34;
    const HP = [['Harbor Point One', 15, '#2e5670'], ['Harbor Point Two', 13, '#36606e'], ['Harbor Point Three', 11, '#3a4e66']];
    for (const [name, floors, tint] of HP) {
      const w = Math.min(38, x1 - x - 2);
      if (w < 20) break;
      const b = towerLot({ x, y: ty, w, h: th, name, floors, tint, poi: false, home: { kind: 'apartment', price: 30000 }, store: 'lobby' });
      if (b) { const fy = b.ty + b.th; forecourt(b.tx, fy, b.tw, wy0 - fy, { fountain: false }); K.take(b.tx, fy, b.tw, wy0 - fy); }
      x += w + 4;
    }
    // the passages between them to the gardens
    for (let xx = x0; xx < x1; xx++) { const c = K.column(xx, ty, wy0 - 1); if (c && c[0] === wy0 - 1 && c[1] <= ty + 1) K.fill(xx, c[1], 1, c[0] - c[1] + 1, T.PLAZA); }
    const G = area(PX.west, PY.pier + 4, PX.quarter, ty - 1);
    if (G) {
      const [gx0, gy0, gx1, gy1] = G, gm = Math.floor((gy0 + gy1) / 2);
      K.paint(gx0, gm - 1, gx1 - gx0, 2, T.PLAZA);
      for (let xx = gx0 + 20; xx < gx1 - 10; xx += 42) K.paint(xx, gy0, 2, gy1 - gy0, T.PLAZA);
      for (let xx = gx0 + 8; xx < gx1 - 6; xx += 14) prop('bench_m', xx, gm - 2.4, 0);
      placeName('Harbor Point Gardens', gx0, gy0, gx1, gy1);
    }
  }
}
