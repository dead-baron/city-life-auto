// World v3, handcrafted: West Hills' north end (district 28), Linden Street to Hawthorn Street between Quarter Avenue and
// Harbor Avenue, from the owner's concept WC288 (a curving-drive suburb on an arterial: houses on looping drives and
// cul-de-sacs with their pools, a townhouse court round a shared pool, the strip of shops on the corner, tennis courts,
// the gas station across) with WC008 (the suburban street: lawns, drives, mailboxes) and WC089 (the park kit), and the
// research's cul-de-sac pod (a collector with its courts, the houses round them, a footpath out to a green) and its
// winding suburb (a loop round a green): the grid's square blocks of tiny lots give way to
//   - Larkspur Way, a collector bending down from Quarter Avenue to Old Quarter Road, and its courts - Aster, Bluebell
//     and Clover - lined with houses, their pools behind them; Larkspur Green and its tennis courts along Linden Street;
//   - Primrose Loop off Westport Avenue round Primrose Green (the gazebo, the pond, the paths);
//   - Hollyhock Court and Foxglove Court between Old Quarter Road and Harbor Avenue; Westhill Plaza (the strip of shops on
//     its car park) and Hilltop Fuel on Harbor Avenue;
//   - Cypress Court's townhouses round their shared pool.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';

const D = 28;   // West Hills (shared/mapcore.js DISTRICTS)
// the lines (tiles): the grid's it keeps (the avenues, Linden and Hawthorn Streets) and its own
export const WX = { linden: 1560, westport: 1780, hawthorn: 1900, larkW: 1602, clover: 1752, loopE: 1876 };
export const WY = { quarter: 1700, oqr: 1800, harbor: 1900, aster: 1726, clover: 1748, bluebell: 1770, loopN: 1726, loopS: 1774, holly: 1834, fox: 1846, cypress: 1840 };
// the collector's bends
const LARK = [[1668, WY.quarter], [1674, WY.aster], [1664, WY.clover], [1670, WY.bluebell], [1668, WY.oqr]];
const RECTS = [[WX.linden, WY.quarter, WX.westport, WY.oqr], [WX.westport, WY.quarter, WX.hawthorn, WY.oqr], [WX.linden, WY.oqr, WX.westport, WY.harbor], [WX.westport, WY.oqr, WX.hawthorn, WY.harbor]];

function streets() {
  return [
    { name: 'Larkspur Way', kind: 'st', pts: LARK },
    { name: 'Aster Court', kind: 'minor', culdesac: true, pts: [LARK[1], [WX.larkW, WY.aster]] },
    { name: 'Clover Court', kind: 'minor', culdesac: true, pts: [LARK[2], [WX.clover, WY.clover]] },
    { name: 'Bluebell Court', kind: 'minor', culdesac: true, pts: [LARK[3], [WX.larkW, WY.bluebell]] },
    { name: 'Primrose Loop', kind: 'st', pts: [[WX.westport, WY.loopN], [WX.loopE, WY.loopN], [WX.loopE, WY.loopS], [WX.westport, WY.loopS]] },
    { name: 'Hollyhock Court', kind: 'minor', culdesac: true, pts: [[WX.westport, WY.holly], [1660, WY.holly]] },
    { name: 'Foxglove Court', kind: 'minor', culdesac: true, pts: [[WX.linden, WY.fox], [1628, WY.fox]] },
    { name: 'Cypress Court', kind: 'minor', culdesac: true, pts: [[WX.westport, WY.cypress], [1858, WY.cypress]] },
  ];
}

export const WESTHILLS = {
  key: 'westhills', d: D, rects: RECTS, rect: [WX.linden, WY.quarter, WX.hawthorn, WY.harbor],
  streets,
  specials: [],
  build,
};


function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0 };
  const tile = (x, y) => m.tiles[y * m.w + x];
  // the free ground of a block between streets, read along its middle row and column -> [x0, y0, x1, y1] (exclusive)
  const area = (xa, ya, xb, yb) => {
    const my = Math.round((ya + yb) / 2), mx = Math.round((xa + xb) / 2);
    let x0 = xa, x1 = xb, y0 = ya, y1 = yb;
    while (x0 < x1 && !K.free(x0, my)) x0++;
    while (x1 > x0 && !K.free(x1 - 1, my)) x1--;
    while (y0 < y1 && !K.free(mx, y0)) y0++;
    while (y1 > y0 && !K.free(mx, y1 - 1)) y1--;
    return x1 - x0 >= 4 && y1 - y0 >= 4 ? [x0, y0, x1, y1] : null;
  };
  const pool = (px0, py0, pw, ph) => {
    K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
    for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
    out.pools++;
  };

  // ---- a row of houses facing south onto the street below it (WC008): each on its lawn, its drive down to the street,
  // the mailbox at the kerb, a tree in the front yard; the generic house's art (siding or stucco, hip or gable, a garage)
  const houses = (x0, x1, y0, y1, o = {}) => {
    const sb = o.setback ?? 4;   // (the front yard: the house stands this far back from the pavement)
    const made = K.row(x0, x1, y0, y1 - sb, (x, room, i) => {
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y1, 601) * 2), kind: 'garden' };
      const w = Math.min(room, 10 + Math.floor(rnd(x, y1, 602) * 4));
      out.homes++;
      return { w, depth: o.depth || 8 + Math.floor(rnd(x, y1, 603) * 2), minDepth: 7, arch: 'house', home: { kind: 'house', price: o.price || 32000 + Math.floor(rnd(x, y1, 604) * 6) * 3000 }, whole: true };
    }, { mask: o.mask });
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      // the front yard down to the street: the lawn, the drive, the mailbox, a tree
      const yb = b.ty + b.th;
      let yf = y1;
      for (let xx = b.tx; xx < b.tx + b.tw; xx++) { const c = K.column(xx, yb, y1, o.mask); if (c) yf = Math.min(yf, c[0]); }
      const deep = yf - yb + 1;
      for (let yy = yb; yy <= yf; yy++) for (let xx = b.tx - 1; xx < b.tx + b.tw + 1; xx++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1);
      if (deep >= 2) {
        const east = rnd(b.tx, yb, 605) < 0.5, dx = east ? b.tx + b.tw - 3 : b.tx;
        K.paint(dx, yb, 3, deep, T.LOT);
        const home = m.homes.find((h) => h.b === b.id);
        if (home) home.garage = { x: (dx + 1.5) * TILE, y: (yb + Math.min(deep, 3) - 0.5) * TILE, a: Math.PI / 2 };
        prop('mailbox', east ? dx - 0.6 : dx + 3.6, yf + 0.4, 4);
        if (deep >= 4) prop(rnd(b.tx, yb, 606) < 0.6 ? 'tree_a' : 'tree_b', east ? b.tx + 2 : b.tx + b.tw - 2, yb + deep / 2, 10, { sp: pick(['maple', 'oak', 'birch', 'flowerTree', 'redMaple'], rnd(b.tx, yb, 607)), k: 1.05 });
        if (rnd(b.tx, yb, 608) < 0.4) prop(pick(['flowers_a', 'shrub_a', 'bush_c'], rnd(b.tx, yb, 609)), b.tx + b.tw / 2, yb + 0.8, 0);
      }
    }
    return made;
  };
  // ---- a row of houses facing north onto the street above it (their doors there): their back yards behind them to the
  // south where the camera sees them - the lawn, the patio, a pool now and then, the fence round, a tree
  const backHouses = (x0, x1, y0, y1, o = {}) => {
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y0, 611) * 2), kind: 'garden' };
      const w = Math.min(room, 10 + Math.floor(rnd(x, y0, 612) * 4));
      out.homes++;
      return { w, depth: 8 + Math.floor(rnd(x, y0, 613) * 2), minDepth: 7, arch: 'house', face: 'N', home: { kind: 'house', price: o.price || 34000 + Math.floor(rnd(x, y0, 614) * 6) * 3000, garage: { x: (x + w / 2) * TILE, y: (y0 - 1) * TILE, a: -Math.PI / 2 } }, whole: true };
    }, { north: true, mask: o.mask });
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      const yb = b.ty + b.th, x = b.tx - 1, w = b.tw + 2;
      let deep = 0;
      while (deep < (o.yard || 12) && K.free(b.tx + 1, yb + deep) && (!o.mask || o.mask(b.tx + 1, yb + deep))) deep++;
      for (let yy = yb; yy < yb + deep; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && (!o.mask || o.mask(xx, yy))) K.take(xx, yy, 1, 1);
      if (deep < 4) continue;
      K.paint(b.tx + 1, yb, Math.min(5, b.tw - 2), 2, T.PLAZA);   // (the patio)
      prop('patio', b.tx + 3.5, yb + 1, 0);
      const pw = Math.min(b.tw - 4, 7), r = rnd(b.tx, yb, 615);
      if (deep >= 8 && pw >= 4 && r < (o.pools ?? 0.45)) {
        pool(b.tx + 2, yb + 3, pw, 3);
        prop('lounger', b.tx + 2.6, yb + 6.6, 0, { v: Math.floor(r * 8), a: -Math.PI / 2 });
      } else if (deep >= 6) prop(pick(['picnic', 'hammock', 'raisedbed'], rnd(b.tx, yb, 616)), b.tx + b.tw / 2, yb + deep - 2.5, 0);
      prop('fenceline', x + 0.2, yb + deep - 0.4, 0, { kind: 'picket', tx: Math.round((w - 0.4) * TILE), ty: 0 });
      prop('fenceline', x + 0.2, yb, 0, { kind: 'picket', tx: 0, ty: Math.round((deep - 0.4) * TILE) });
      prop(rnd(b.tx, yb, 617) < 0.5 ? 'tree_a' : 'tree_b', b.tx + b.tw - 1.5, yb + deep - 2, 10, { sp: pick(['maple', 'oak', 'birch', 'cherry'], rnd(b.tx, yb, 618)), k: 1.05 });
    }
    return made;
  };
  // which side of Larkspur Way a tile is on (the collector bends)
  const larkX = (y) => { for (let j = 1; j < LARK.length; j++) if (y <= LARK[j][1]) { const [ax, ay] = LARK[j - 1], [bx, by] = LARK[j]; return ax + (bx - ax) * (y - ay) / (by - ay); } return LARK[LARK.length - 1][0]; };
  const westOf = (x, y) => x < larkX(y) - 6, eastOf = (x, y) => x > larkX(y) + 6;

  larkspur();
  primrose();
  hollyhock();
  plaza();
  cypress();
  K.landscape({ bare: 0.45, tree: (x, y, r) => r < 0.85 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['oak', 'maple', 'birch', 'flowerTree', 'redMaple', 'cherry'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  void api; void tile;
  return out;

  // ===========================================================================================================
  // Larkspur Way and its courts (the research's cul-de-sac pod): Aster Court and Bluebell Court west of it, Clover Court
  // east of it, houses round them; Larkspur Green along Linden Street - the lawn, the footpath out of the courts' bulbs,
  // two tennis courts, benches
  function larkspur() {
    // Larkspur Green first (the west strip by Linden Street)
    const G = area(WX.linden, WY.quarter, WX.linden + 34, WY.oqr);
    if (G) {
      const [gx0, gy0, , gy1] = G, gx1 = gx0 + 24;
      if (K.allFree(gx0, gy0, gx1 - gx0, gy1 - gy0)) {
        K.take(gx0, gy0, gx1 - gx0, gy1 - gy0);
        // two tennis courts in chain-link at the north end, the path down the middle, benches, trees
        const cw = 11, ch = 24, cy0 = gy0 + 2;
        K.paint(gx0 + 1, cy0 - 1, 2 * (cw + 1) + 1, ch + 2, T.LOT);
        for (let k = 0; k < 2; k++) { const mx = gx0 + 2 + k * (cw + 1) + cw / 2; prop('court', mx, cy0, 0, { w: cw * TILE, d: ch * TILE, k: 'tennis', c1: '#3a7e86', c2: '#3a6a4e' }); prop('tnet', mx, cy0 + ch / 2, 0, { len: (cw - 2) * TILE, a: Math.PI / 2 }); }
        const fx0 = gx0 + 1.2, fx1 = gx0 + 2 + 2 * (cw + 1) - 0.2, fy0 = cy0 - 0.8, fy1 = cy0 + ch + 0.8;
        prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 3) * TILE, ty: 0 });
        prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
        const px = gx0 + 11;
        K.paint(px, cy0 + ch + 2, 2, gy1 - cy0 - ch - 2, T.PLAZA);
        for (const y of [WY.aster, WY.bluebell]) if (y > cy0 + ch + 2) K.paint(px, y - 1, gx1 - px + 4, 2, T.PLAZA);
        for (let y = cy0 + ch + 5; y < gy1 - 2; y += 9) { prop('bench_m', px - 1.2, y, 0); prop('tree_b', px + 4, y + 2, 10, { sp: pick(['oak', 'maple', 'cherry'], rnd(px, y, 620)), k: 1.15 }); prop('tree_a', px - 4, y + 4, 10, { sp: 'oak', k: 1.15 }); }
        prop('parksign', gx0 + 3, gy1 - 1.5, 0);
        (out.places ||= []).push({ name: 'Larkspur Green', x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
        (out.places ||= []).push({ name: 'Larkspur Tennis Courts', x0: gx0 + 1, y0: cy0, x1: gx0 + 2 + 2 * (cw + 1), y1: cy0 + ch });
      }
    }
    const W = (x, y) => westOf(x, y), E = (x, y) => eastOf(x, y);
    // west of the way: Aster Court (houses facing it from the north, backs to Quarter Avenue; houses facing away from
    // it on its south side, their yards down to Bluebell Court's houses), Bluebell Court (the same)
    houses(WX.linden, 1672, WY.quarter + 4, WY.aster - 4, { mask: W });
    backHouses(WX.linden, 1672, WY.aster + 4, WY.bluebell - 18, { mask: W, yard: 10 });
    houses(WX.linden, 1672, WY.bluebell - 17, WY.bluebell - 4, { mask: W });
    backHouses(WX.linden, 1672, WY.bluebell + 4, WY.oqr - 5, { mask: W, yard: 12 });
    // east of it: houses facing Quarter Avenue's way (their doors north, their yards behind), then Clover Court's
    backHouses(1660, WX.westport, WY.quarter + 5, WY.quarter + 20, { mask: E, yard: 7 });
    houses(1660, WX.westport, WY.quarter + 21, WY.clover - 4, { mask: E });
    backHouses(1660, WX.westport, WY.clover + 4, WY.oqr - 18, { mask: E, yard: 10 });
    houses(1660, WX.westport, WY.oqr - 17, WY.oqr - 5, { mask: E, price: 36000 });
    (out.places ||= []).push({ name: 'Larkspur Way', x0: WX.linden, y0: WY.quarter, x1: WX.westport, y1: WY.oqr });
  }

  // ===========================================================================================================
  // Primrose Loop (the research's winding suburb: a loop round a green) off Westport Avenue: houses facing the loop
  // from outside it, Primrose Green inside - the gazebo, the pond, the paths round, benches, flower beds, trees
  function primrose() {
    houses(WX.westport, WX.hawthorn, WY.quarter + 4, WY.loopN - 4);
    backHouses(WX.westport, WX.hawthorn, WY.loopS + 4, WY.oqr - 5, { yard: 12, pools: 0.55 });
    const A = area(WX.westport + 4, WY.loopN + 2, WX.loopE - 2, WY.loopS - 2);
    if (!A) return;
    const [x0, y0, x1, y1] = A, w = x1 - x0, h = y1 - y0;
    K.fill(x0, y0, w, h, T.GRASS); K.take(x0, y0, w, h);
    // the ring path just inside the loop, the cross paths, the gazebo at the heart, the pond to its east
    K.paint(x0 + 1, y0 + 1, w - 2, 2, T.PLAZA); K.paint(x0 + 1, y1 - 3, w - 2, 2, T.PLAZA);
    K.paint(x0 + 1, y0 + 1, 2, h - 2, T.PLAZA); K.paint(x1 - 3, y0 + 1, 2, h - 2, T.PLAZA);
    const cx = x0 + Math.floor(w * 0.35), cy = y0 + Math.floor(h / 2);
    K.paint(x0 + 1, cy - 1, w - 2, 2, T.PLAZA);
    K.paint(cx - 4, cy - 4, 8, 8, T.PLAZA);
    prop('gazebo', cx, cy + 0.5, 30);
    const qx0 = x0 + Math.floor(w * 0.6), qx1 = x1 - 6, qy0 = y0 + 5, qy1 = cy - 3;
    if (qx1 - qx0 >= 8 && qy1 - qy0 >= 4) {
      const pcx = (qx0 + qx1) / 2, pcy = (qy0 + qy1) / 2, rx = (qx1 - qx0) / 2, ry = (qy1 - qy0) / 2;
      for (let yy = qy0; yy <= qy1; yy++) for (let xx = qx0; xx <= qx1; xx++) { const e = ((xx + 0.5 - pcx) / rx) ** 2 + ((yy + 0.5 - pcy) / ry) ** 2; if (e < 0.85) m.set(xx, yy, T.WATER); }
      for (let k = 0; k < 4; k++) prop('lily', pcx - rx * 0.5 + k * rx * 0.35, pcy + (k % 2 ? 0.6 : -0.6), 0, { v: k % 3 });
      prop('duck', pcx, pcy, 0);
    }
    for (const [bx, by] of [[cx - 7, cy + 3], [cx + 7, cy + 3], [x0 + 5, y1 - 5], [x1 - 6, y1 - 5]]) prop('bench_m', bx, by, 0);
    for (let k = 0; k < 8; k++) prop(pick(['flowers_big', 'flowers_a'], rnd(k, cy, 621)), cx - 6 + (k % 4) * 4, cy + (k < 4 ? -5.5 : 5.8), 0);
    for (const [tx, ty] of [[x0 + 6, y0 + 6], [x1 - 6, y1 - 7], [x0 + 6, y1 - 7], [cx + 10, y1 - 6]]) prop('tree_b', tx, ty, 10, { sp: pick(['cherry', 'oak', 'maple'], rnd(tx, ty, 622)), k: 1.2 });
    // the green's trees on a loose grid, off the paths and the pond, clear of the gazebo
    for (let gy = y0 + 4; gy < y1 - 4; gy += 6) for (let gx = x0 + 4; gx < x1 - 4; gx += 7) {
      const tx = gx + Math.floor(rnd(gx, gy, 623) * 4), ty = gy + Math.floor(rnd(gx, gy, 624) * 3);
      let ok = Math.abs(tx - cx) > 6 || Math.abs(ty - cy) > 6;
      for (let yy = ty - 1; yy <= ty + 1 && ok; yy++) for (let xx = tx - 1; xx <= tx + 1 && ok; xx++) if (tile(xx, yy) !== T.GRASS) ok = false;
      if (!ok || rnd(gx, gy, 625) < 0.3) continue;
      prop(rnd(gx, gy, 626) < 0.5 ? 'tree_a' : 'tree_b', tx + 0.5, ty + 0.5, 10, { sp: pick(['cherry', 'maple', 'oak', 'flowerTree', 'redMaple'], rnd(gx, gy, 627)), k: 1.1 + rnd(gx, gy, 628) * 0.15 });
    }
    (out.places ||= []).push({ name: 'Primrose Green', x0, y0, x1, y1 });
  }

  // ===========================================================================================================
  // Between Old Quarter Road and Harbor Avenue: Hollyhock Court off Westport Avenue, Foxglove Court off Linden Street
  function hollyhock() {
    houses(1656, WX.westport, WY.oqr + 5, WY.holly - 4, { price: 38000 });
    backHouses(1656, WX.westport, WY.holly + 4, WY.harbor - 30, { yard: 9 });
    houses(WX.linden, 1636, WY.oqr + 5, WY.fox - 4);
    backHouses(WX.linden, 1636, WY.fox + 4, WY.harbor - 5, { yard: 14, pools: 0.5 });
    (out.places ||= []).push({ name: 'Hollyhock Court', x0: 1656, y0: WY.oqr, x1: WX.westport, y1: WY.harbor - 22 });
  }

  // ===========================================================================================================
  // Westhill Plaza (WC288's strip of shops on the corner) on Harbor Avenue: the shops in a row facing south over their
  // car park, the plaza's sign at the kerb, cart corrals; Hilltop Fuel on Westport Avenue's corner, its pumps under the
  // canopy
  function plaza() {
    const A = area(1640, WY.harbor - 30, WX.westport, WY.harbor);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    const gasX = x1 - 22;
    // the shops: a row of storefronts under one flat roof, each its own sign
    const LIST = [
      { w: 22, name: 'Hillside Market', store: 'mart', poi: { kind: 'grocery', label: 'Hillside Market' }, sign: ['#2f6a4e', [250, 240, 200]] },
      { w: 10, name: 'Westhill Pharmacy', store: 'mart', poi: { kind: 'pharmacy', label: 'Westhill Pharmacy' }, sign: ['#2a7a6a', [250, 250, 245]] },
      { w: 9, name: 'Bean There', store: 'cafe', poi: { kind: 'coffee', label: 'Bean There' }, sign: ['#3a2a20', [236, 214, 150]] },
      { w: 10, name: 'Sunny Side Diner', store: 'diner', poi: { kind: 'coffee', label: 'Sunny Side Diner', food: true }, sign: ['#c8302a', [250, 246, 230]] },
      { w: 10, name: 'Hills Hardware', store: 'mart', poi: { kind: 'delivery', label: 'Hills Hardware' }, sign: ['#a83a2a', [250, 240, 220]] },
      { w: 9, name: 'Paws & Claws', store: 'mart', poi: { kind: 'delivery', label: 'Paws & Claws' }, sign: ['#e8a030', [40, 30, 20]] },
      { w: 9, name: 'Fluff & Fold', store: 'laundry', poi: { kind: 'delivery', label: 'Fluff & Fold' }, sign: ['#3a6a9a', [250, 250, 245]] },
    ];
    let k = 0;
    const made = K.row(x0, gasX - 2, y0, y1 - 14, (x, room) => {
      const L = LIST[k];
      if (!L || room < L.w) return null;
      k++; out.shops++;
      return { w: L.w, depth: 12, arch: 'mixed', name: L.name, poi: L.poi, whole: true,
        art: { spec: { floors: 1, style: 'stucco', wallColor: '#e8e0cc', win: 'even', parapet: 10, grime: 0.05, roofMat: 'membrane', lip: 6, rimW: 4, blades: [], plaques: [] },
          shop: { kind: L.store, door: 'left', open: true, people: 2, sign: { text: L.name.toUpperCase(), bg: L.sign[0], fg: L.sign[1], lit: true }, awning: [L.sign[0], '#f0ece4'] } } };
    });
    const built = made.filter((b) => b && !b.gap && b.tw !== undefined);
    if (built.length) {
      const sx1 = Math.max(...built.map((b) => b.tx + b.tw)), fy = Math.max(...built.map((b) => b.ty + b.th));
      // the walk along the fronts, the car park down to the avenue: its bays, cars, lamps, cart corrals, the sign
      K.fill(x0, fy, sx1 - x0, 2, T.PLAZA);
      K.fill(x0, fy + 2, sx1 - x0, y1 - fy - 2, T.LOT);
      for (const ry of [fy + 3, fy + 8]) for (let sx = x0 + 1; sx + 3 <= sx1 - 1; sx += 3) {
        if (ry + 4 > y1) continue;
        m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE });
        if (rnd(sx, ry, 630) < 0.5) m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: ry === fy + 3 ? -Math.PI / 2 : Math.PI / 2 });
      }
      for (let lx = x0 + 6; lx < sx1 - 2; lx += 16) prop('lamp', lx, fy + 7.5, 0);
      prop('textsign', x0 + 4, y1 - 0.6, 0, { text: 'WESTHILL PLAZA', bg: '#1e3a5e', fg: [250, 236, 160], z: 60, sx: 1, lit: true });
      (out.places ||= []).push({ name: 'Westhill Plaza', x0, y0, x1: sx1, y1 });
    }
    // Hilltop Fuel on the corner: the kiosk at the back, its forecourt, the canopy over the pumps
    if (x1 - gasX >= 18 && K.allFree(gasX, y0 + 2, 14, 10)) {
      const gs = K.building({ x: gasX, y: y0 + 2, w: 14, h: 10, arch: 'gas', key: 'gas', name: 'Hilltop Fuel', poi: { kind: 'gasstation', label: 'Hilltop Fuel' }, whole: true });
      if (gs) {
        out.shops++;
        K.fill(gasX - 2, y0 + 12, x1 - gasX + 2, y1 - y0 - 12, T.LOT);
        const cx = gasX + 8, cy = y0 + 12 + Math.floor((y1 - y0 - 12) / 2);
        prop('canopy', cx, cy, 0, { w: 260, d: 110, h: 54 });
        for (const [ox, oy] of [[-4, -1.6], [0, -1.6], [4, -1.6], [-4, 1.6], [0, 1.6], [4, 1.6]]) { const x = (cx + ox) * TILE, y = (cy + oy) * TILE; (m.sitePumps ||= []).push({ x, y }); m.addSolidProp(x, y, 9); }
        prop('textsign', x1 - 2, y1 - 0.6, 0, { text: 'HILLTOP FUEL', bg: '#c8302a', fg: [250, 246, 230], z: 60, sx: 1, lit: true });
      }
    }
  }

  // ===========================================================================================================
  // Cypress Court (WC288's townhouse court round a shared pool) off Westport Avenue: two rows of townhouses facing the
  // court, the shared pool and its deck, loungers and umbrellas, the clubhouse at the court's end
  function cypress() {
    const TOWN = ['#e8d8c0', '#d8c8b0', '#c8d4dc', '#e4dcc8', '#d4c4c0', '#c8d8c4'];
    const row = (y0, y1, north) => K.row(WX.westport, 1856, y0, y1, (x, room) => {
      if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const w = Math.min(room, 7);
      out.homes++;
      return { w, depth: 10, arch: 'townhouse', name: 'Cypress Court', poi: false, whole: true, home: { kind: 'house', price: 28000 }, ...(north ? { face: 'N' } : {}),
        art: { spec: { floors: 2, style: 'stucco', wallColor: pick(TOWN, rnd(x, y1, 640)), win: 'tall', pitch: 'gable', roof: 'shingle', roofColor: pick(['#5a4a44', '#4a4e58', '#6a5a4a'], rnd(x, y1, 641)), slope: 0.45, parapet: 4, grime: 0.04, blades: [], plaques: [] }, noShop: true } };
    }, north ? { north: true } : {});
    row(WY.oqr + 5, WY.cypress - 4, false);
    const S = row(WY.cypress + 4, WY.cypress + 18, true);
    // the shared pool behind the south row, its deck, the clubhouse
    const built = S.filter((b) => b && !b.gap && b.tw !== undefined);
    const yb = built.length ? Math.max(...built.map((b) => b.ty + b.th)) + 1 : WY.cypress + 16;
    const A = area(WX.westport + 2, yb, 1858, WY.harbor - 18);
    if (A) {
      const [x0, y0, x1, y1] = A;
      if (x1 - x0 >= 26 && y1 - y0 >= 9) {
        K.take(x0, y0, x1 - x0, y1 - y0);
        K.paint(x0, y0, x1 - x0, y1 - y0, T.PLAZA);
        const pw = Math.min(22, x1 - x0 - 8), ph = Math.min(6, y1 - y0 - 4), px0 = x0 + Math.floor((x1 - x0 - pw) / 2), py0 = y0 + 2;
        pool(px0, py0, pw, ph);
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.2, 0, { v: k, a: -Math.PI / 2 });
        prop('umbrella_b', px0 - 1.5, py0 + 1, 0); prop('umbrella_y', px0 + pw + 1.5, py0 + 1, 0);
        prop('chainfence', x0 + 0.2, y1 - 0.4, 0, { tx: Math.round((x1 - x0 - 0.4) * TILE), ty: 0 });
        (out.places ||= []).push({ name: 'Cypress Court Pool', x0, y0, x1, y1 });
      }
    }
  }
}
