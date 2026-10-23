// World v3, handcrafted: West Hills' middle (district 28), Hills Avenue to Sycamore Street between Westport Boulevard and
// Fountain Avenue, from the owner's concepts WC007 (the suburb of crescents: curving streets of houses with their back
// yard pools, the wooded creek with its footbridge, the park with its gazebo, the strip of shops on its car park) with
// WC008 (the suburban street), WC288 (the curving-drive suburb on an arterial: the big-box block across the arterial, a
// park with a pond) and WC168 (the sound walls the houses back onto along the freeway), and the research's winding suburb,
// its trailer park by the airport's fence and its big-box superblock: the grid's square blocks of small lots give way to
//   - Meadowbrook Drive, a collector bending from Westport Boulevard to Hillcrest Avenue, and Sorrel Crescent off it;
//   - Meadowbrook Park: the creek winding through it to its pond, the footbridges, the gazebo, picnic tables under the
//     willows, and Meadowbrook Pool - the public pool with its lanes, its springboard and its deck;
//   - Quail Run, winding west from the drive to Hills Avenue, its houses stepping along the bends;
//   - Hillcrest Gardens, two-storey garden apartments round their courts and their pools, off Gardens Way;
//   - the houses along Hillcrest Avenue backing onto the West Loop's sound wall; Wren Court and Finch Court;
//   - Skyview Mobile Home Park round its loop off Fountain Avenue, under the planes' approach;
//   - Hillcrest Commons by the freeway: Hills Home Center and its garden centre, Fresh Fields Market, the corner shops,
//     their car park down to Fountain Avenue.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';

const D = 28;   // West Hills (shared/mapcore.js DISTRICTS)
// the lines (tiles) it keeps (the avenues, Hills Avenue and Sycamore Street)
export const MX = { hills: 1300, syc: 1604 };
export const MY = { blvd: 2200, pier: 2300, hillcrest: 2400, fountain: 2576 };
// its own: Meadowbrook Drive's bends (the crescent and the lanes meet it at its corners)
const DRIVE_A = [[1452, MY.blvd], [1456, 2230], [1450, 2251], [1456, 2270], [1452, MY.pier]];
const DRIVE_B = [[1452, MY.pier], [1448, 2338], [1454, 2356], [1452, MY.hillcrest]];
const SORREL = [[1456, 2230], [1344, 2230], [1336, 2233], [1332, 2239], [1332, 2261], [1336, 2267], [1344, 2270], [1456, 2270]];
const QUAIL = [[MX.hills, 2342], [1330, 2348], [1364, 2338], [1400, 2346], [1448, 2338]];
const GARDENS = [[1454, 2356], [1584, 2356]];
const WREN = [[MX.hills, 2440], [1334, 2444], [1366, 2438], [1398, 2442]];
const FINCH = [[MX.hills, 2482], [1334, 2486], [1366, 2480], [1398, 2484]];
const SKY = [[1318, MY.fountain], [1318, 2516], [1324, 2510], [1384, 2510], [1390, 2516], [1390, MY.fountain]];
const RECTS = [[MX.hills, MY.blvd, MX.syc, MY.pier], [MX.hills, MY.pier, MX.syc, MY.hillcrest], [MX.hills, MY.hillcrest, MX.syc, MY.fountain]];

function streets() {
  return [
    { name: 'Meadowbrook Drive', kind: 'st', pts: DRIVE_A },
    { name: 'Meadowbrook Drive', kind: 'st', pts: DRIVE_B },
    // (a minor street: the drive's own bend between the crescent's ends is a street - two streets of one kind between
    // the same two corners would be one edge to the road network, shared/roads.js)
    { name: 'Sorrel Crescent', kind: 'minor', pts: SORREL },
    { name: 'Quail Run', kind: 'st', pts: QUAIL },
    { name: 'Gardens Way', kind: 'minor', culdesac: true, pts: GARDENS },
    // (the grid's Hillcrest Avenue starts at Birch Street: carried on to Hills Avenue)
    { name: 'Hillcrest Avenue', kind: 'ave', pts: [[MX.hills, MY.hillcrest], [1376, MY.hillcrest]] },
    { name: 'Wren Court', kind: 'minor', culdesac: true, pts: WREN },
    { name: 'Finch Court', kind: 'minor', culdesac: true, pts: FINCH },
    { name: 'Skyview Loop', kind: 'minor', pts: SKY },
  ];
}

export const WESTHILLS2 = {
  key: 'westhills2', d: D, rects: RECTS, rect: [MX.hills, MY.blvd, MX.syc, MY.fountain],
  streets,
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, pools: 0, trailers: 0 };
  const tile = (x, y) => m.tiles[y * m.w + x];
  const place = (name, x0, y0, x1, y1) => (out.places ||= []).push({ name, x0, y0, x1, y1 });
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
  const fence = (kind, x0, y0, x1, y1) => prop('fenceline', x0, y0, 0, { kind, tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
  const chain = (x0, y0, x1, y1) => prop('chainfence', x0, y0, 0, { tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) });
  const TREES = ['maple', 'oak', 'birch', 'flowerTree', 'redMaple', 'cherry', 'magnolia'];
  const tree = (x, y, k = 610, sp = null) => prop(rnd(x, y, k) < 0.5 ? 'tree_a' : 'tree_b', x, y, 10, { sp: sp || pick(TREES, rnd(x, y, k + 1)), k: 1.05 + rnd(x, y, k + 2) * 0.2 });

  // ---- a row of houses facing south onto the street below it, along a street that bends: each column's front is the
  // street's pavement there (the southmost free tile at or above yMax), the house stands `setback` behind the lowest of its
  // columns' fronts; its lawn, the drive down to the kerb, the mailbox, a tree (WC008)
  const frontRow = (x0, x1, y0, yMax, o = {}) => {
    const sb = o.setback ?? 4, E = new Map();
    const edge = (x) => { if (!E.has(x)) { const c = K.column(x, y0, yMax, o.mask); E.set(x, c ? c[0] : -1); } return E.get(x); };
    const mask = (x, y) => (!o.mask || o.mask(x, y)) && y <= edge(x) - sb;
    const made = K.row(x0, x1, y0, yMax, (x, room, i) => {
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y0, 601) * 2), kind: 'garden' };
      const w = Math.min(room, (o.w || 10) + Math.floor(rnd(x, y0, 602) * 4));
      out.homes++;
      return { w, depth: o.depth || 8 + Math.floor(rnd(x, y0, 603) * 2), minDepth: 7, arch: 'house', home: { kind: 'house', price: o.price || 30000 + Math.floor(rnd(x, y0, 604) * 6) * 3000 }, whole: true };
    }, { mask, noStep: true, fallback: 'garden' });
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined) continue;
      const yb = b.ty + b.th;
      let yf = 1e9;
      for (let xx = b.tx; xx < b.tx + b.tw; xx++) if (edge(xx) >= yb) yf = Math.min(yf, edge(xx));
      if (yf === 1e9) continue;
      for (let xx = b.tx - 1; xx < b.tx + b.tw + 1; xx++) { const e = edge(xx); for (let yy = yb; yy <= e; yy++) if (K.free(xx, yy)) K.take(xx, yy, 1, 1); }
      const deep = yf - yb + 1;
      if (deep < 2) continue;
      const east = rnd(b.tx, yb, 605) < 0.5, dx = east ? b.tx + b.tw - 3 : b.tx;
      for (let xx = dx; xx < dx + 3; xx++) K.paint(xx, yb, 1, Math.max(1, edge(xx) - yb + 1), T.LOT);
      const home = m.homes.find((h) => h.b === b.id);
      if (home) home.garage = { x: (dx + 1.5) * TILE, y: (yb + Math.min(deep, 3) - 0.5) * TILE, a: Math.PI / 2 };
      prop('mailbox', east ? dx - 0.6 : dx + 3.6, edge(east ? dx : dx + 2) + 0.4, 4);
      if (deep >= 4) tree(east ? b.tx + 2 : b.tx + b.tw - 2, yb + deep / 2, 606);
      if (rnd(b.tx, yb, 608) < 0.45) prop(pick(['flowers_a', 'shrub_a', 'bush_c', 'flowers_big'], rnd(b.tx, yb, 609)), b.tx + b.tw / 2, yb + 0.8, 0);
    }
    return made;
  };
  // ---- a row of houses facing north onto the street above it (their doors there): their back yards behind them to the
  // south where the camera sees them - the lawn, the patio, a pool now and then with its lounger, the fence round, a tree
  const backRow = (x0, x1, y0, y1, o = {}) => {
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      // (the gaps between them only as deep as a house and its yard: the row facing the next street south has the rest)
      const gd = 9 + (o.yard || 12);
      if (room < 9) return room >= 1 ? { gap: room, kind: 'garden', depth: gd } : null;
      if (i % 2 === 1) return { gap: 2 + Math.floor(rnd(x, y0, 611) * 2), kind: 'garden', depth: gd };
      const w = Math.min(room, (o.w || 10) + Math.floor(rnd(x, y0, 612) * 4));
      out.homes++;
      return { w, depth: 8 + Math.floor(rnd(x, y0, 613) * 2), minDepth: 7, arch: 'house', face: 'N', home: { kind: 'house', price: o.price || 32000 + Math.floor(rnd(x, y0, 614) * 6) * 3000, garage: { x: (x + w / 2) * TILE, y: (y0 - 1) * TILE, a: -Math.PI / 2 } }, whole: true };
    }, { north: true, mask: o.mask, fallback: 'garden' });
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
      if (deep >= 8 && pw >= 4 && r < (o.pools ?? 0.4)) {
        pool(b.tx + 2, yb + 3, pw, 3);
        prop('lounger', b.tx + 2.6, yb + 6.6, 0, { v: Math.floor(r * 8), a: -Math.PI / 2 });
      } else if (deep >= 6) prop(pick(['picnic', 'hammock', 'raisedbed', 'picnic'], rnd(b.tx, yb, 616)), b.tx + b.tw / 2, yb + deep - 2.5, 0);
      fence(o.fence || 'picket', x + 0.2, yb + deep - 0.4, x + w - 0.2, yb + deep - 0.4);
      fence('picket', x + 0.2, yb, x + 0.2, yb + deep - 0.4);
      tree(b.tx + b.tw - 1.5, yb + deep - 2, 617, pick(['maple', 'oak', 'birch', 'cherry'], rnd(b.tx, yb, 618)));
    }
    return made;
  };
  // where a street that bends is at x (its points)
  const along = (P, x) => { for (let j = 1; j < P.length; j++) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && ax !== bx) return ay + (by - ay) * (x - ax) / (bx - ax); } return P[P.length - 1][1]; };
  const below = (P, gap) => (x, y) => y >= along(P, x) + gap, above = (P, gap) => (x, y) => y <= along(P, x) - gap;
  const both = (...f) => (x, y) => f.every((g) => g(x, y));

  sorrel();
  meadowbrook();
  quail();
  gardens();
  hillcrest();
  wren();
  skyview();
  commons();
  K.landscape({ bare: 0.45, tree: (x, y, r) => r < 0.85 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['oak', 'maple', 'birch', 'flowerTree', 'redMaple', 'cherry', 'willow'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  void api; void tile;
  return out;

  // ===========================================================================================================
  // Sorrel Crescent (the research's crescent: a loop off the collector): houses facing it from outside along the
  // boulevard's side, houses back to back inside it (the north ones' yards behind them, the south ones' lawns to the
  // street), houses facing the crescent's south side with their yards down to Pier Avenue; the greenbelt along Hills
  // Avenue
  function sorrel() {
    frontRow(1334, 1452, MY.blvd + 6, 2226);
    backRow(1338, 1446, 2234, 2260, { yard: 8 });
    frontRow(1338, 1446, 2234, 2266);
    backRow(1330, 1452, 2274, MY.pier - 6, { yard: 12, pools: 0.5 });
    // the greenbelt between Hills Avenue and the crescent: the footpath through the trees
    const G = area(MX.hills + 4, MY.blvd + 6, 1328, MY.pier - 6);
    if (G) {
      const [x0, y0, x1, y1] = G, px = Math.floor((x0 + x1) / 2) - 1;
      K.take(x0, y0, x1 - x0, y1 - y0);
      K.paint(px, y0, 2, y1 - y0, T.PLAZA);
      for (let y = y0 + 6; y < y1 - 4; y += 14) prop('bench_m', px - 1, y, 0);
      for (let y = y0 + 3; y < y1 - 2; y += 5) { tree(x0 + 1.5 + rnd(px, y, 620) * 2, y, 621, pick(['oak', 'maple', 'birch'], rnd(px, y, 622))); if (x1 - px > 5) tree(x1 - 1.5 - rnd(px, y, 623) * 2, y + 2.5, 624, pick(['oak', 'birch', 'cherry'], rnd(px, y, 625))); }
      place('Hills Avenue Greenbelt', x0, y0, x1, y1);
    }
    place('Sorrel Crescent', MX.hills, MY.blvd, 1452, MY.pier);
  }

  // ===========================================================================================================
  // Meadowbrook Park (WC007's wooded creek and its footbridges, the park with its gazebo; WC288's park with a pond) east
  // of the drive: the creek winding across to its pond, the paths, the footbridges, willows along the water, the gazebo,
  // picnic tables; Meadowbrook Pool in its north-east corner (the public pool: its four lanes, the deep end and the
  // springboard, the changing block, the deck, the fence)
  function meadowbrook() {
    const A = area(1456, MY.blvd + 6, MX.syc, MY.pier - 6);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    // what's west of the drive's bends stays the drive's pavement: the park from the first column free top to bottom
    let px0 = x0;
    while (px0 < x1 && !(K.free(px0, y0) && K.free(px0, y1 - 1) && K.free(px0, Math.floor((y0 + y1) / 2)))) px0++;
    // ---- the pool: fenced on the tile lines, the changing block along the north side, the pool below it
    const fx1 = x1 - 1, fx0 = fx1 - 34, fy0 = y0 + 1, fy1 = y0 + 18;
    if (K.allFree(fx0 - 1, y0, fx1 - fx0 + 2, fy1 - y0 + 1)) {
      K.take(fx0 - 1, y0, fx1 - fx0 + 2, fy1 - y0 + 2);
      K.paint(fx0, fy0, fx1 - fx0, fy1 - fy0, T.PLAZA);
      const bw = 12, bx0 = fx0 + 1, by0 = fy0, bd = 2;
      for (let ty = by0; ty < by0 + bd; ty++) for (let tx = bx0; tx < bx0 + bw; tx++) m.set(tx, ty, T.WALL);
      prop('poolhouse', bx0 + bw / 2, by0 + bd / 2 - 0.25, 0, { w: bw * TILE, d: bd * TILE - 4 });
      const qx0 = fx0 + 3, qy0 = by0 + bd + 3, pw = 24, ph = 7, dw = 6;
      for (let ty = qy0; ty < qy0 + ph; ty++) for (let tx = qx0; tx < qx0 + pw; tx++) m.set(tx, ty, tx >= qx0 + pw - dw ? T.DEEP : T.WATER);
      (m.pools ||= []).push({ x: qx0 * TILE, y: qy0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 4, deep: { x: (qx0 + pw - dw) * TILE, y: qy0 * TILE, w: dw * TILE, h: ph * TILE }, deck: { x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE } });
      out.pools++;
      const lx = qx0 + (pw - dw) / 2;
      for (let k = 1; k < 4; k++) prop('lanerope', lx, qy0 + ph * k / 4, 0, { len: (pw - dw) * TILE - 8 });
      prop('lanerope', qx0 + pw - dw, qy0 + ph / 2, 0, { len: ph * TILE - 8, a: Math.PI / 2 });
      prop('diveboard', qx0 + pw + 0.9, qy0 + ph / 2, 10, { a: Math.PI, len: 64 });
      prop('lguard', qx0 - 1.2, qy0 + ph - 1, 14, { a: 0 });
      let k = 0;
      for (let x = bx0 + bw + 1.2; x < fx1 - 4.5; x += 1.5, k++) { if (k % 3 === 2) prop(k % 2 ? 'umbrella_b' : 'umbrella_r', x, qy0 - 1.3, 4); else prop('lounger', x, qy0 - 1.1, 6, { a: Math.PI / 2, v: k % 4 }); }
      prop('hottub', fx1 - 2.3, by0 + 1.9, 26, { r: 30 });
      for (let x = qx0 + 1.5, j = 0; x < qx0 + pw - dw - 1; x += 1.6, j++) { if (j % 3 === 1) prop(j % 2 ? 'umbrella_r' : 'umbrella_b', x, qy0 + ph + 1.1, 4); else prop('lounger', x, qy0 + ph + 0.95, 6, { a: -Math.PI / 2, v: (j + 2) % 4 }); }
      for (const [dx, dy] of [[0.9, 0.6], [2.6, 0.9]]) prop('cafetable', bx0 + dx, by0 + bd + dy, 6);
      prop('umbrella_g', bx0 + 1.7, by0 + bd + 0.6, 4);
      for (const [tx, ty] of [[fx0 + 0.6, fy1 - 0.7], [fx1 - 0.6, fy1 - 0.7]]) prop('potted', tx, ty, 6);
      prop('chalkboard', bx0 + bw * 0.3, by0 + bd + 0.35, 0);
      const gx = Math.round((fx0 + fx1) / 2);
      for (const [ax, ay, bx, by] of [[fx0, fy0, fx1, fy0], [fx0, fy0, fx0, fy1], [fx1, fy0, fx1, fy1], [fx0, fy1, gx - 1, fy1], [gx + 1, fy1, fx1, fy1]]) {
        chain(ax, ay, bx, by);
        const L = Math.hypot(bx - ax, by - ay) * TILE;
        for (let d = 0; d <= L; d += 16) m.addSolidProp((ax + (bx - ax) * d / L) * TILE, (ay + (by - ay) * d / L) * TILE, 7);
      }
      prop('hedgerun', fx0 - 0.55, fy0 + 0.5, 0, { tx: 0, ty: (fy1 - fy0 - 1) * TILE });
      prop('bikerack', gx - 2.6, fy1 + 0.6, 6); prop('bench_m', gx + 2.8, fy1 + 0.6, 6); prop('trashcan', gx + 1.6, fy1 + 0.5, 5);
      (m.landmarks ||= []).push({ name: 'Meadowbrook Pool', type: 'pool', x: fx0 * TILE, y: fy0 * TILE, w: (fx1 - fx0) * TILE, h: (fy1 - fy0) * TILE });
      (m.natureSites ||= []).push({ kind: 'pool', name: 'Meadowbrook Pool', x: Math.round((qx0 + pw / 2) * TILE), y: Math.round((qy0 + ph / 2) * TILE), gate: { x: gx * TILE, y: fy1 * TILE }, house: { x: Math.round((bx0 + bw / 2) * TILE), y: Math.round((by0 + bd) * TILE) } });
      place('Meadowbrook Pool', fx0, fy0, fx1, fy1);
      // the pool's car park by the boulevard, west of it, its drive off the boulevard
      const cx1 = fx0 - 3, cx0 = Math.max(px0 + 20, cx1 - 30), cy1 = y0 + 12;
      if (cx1 - cx0 >= 12 && K.allFree(cx0, y0, cx1 - cx0, cy1 - y0)) {
        K.fill(cx0, y0, cx1 - cx0, cy1 - y0, T.LOT);
        for (let sx = cx0 + 1; sx + 3 <= cx1 - 1; sx += 3) {
          m.stalls.push({ x: sx * TILE, y: (y0 + 1) * TILE, w: 3 * TILE, h: 4 * TILE });
          m.stalls.push({ x: sx * TILE, y: (cy1 - 5) * TILE, w: 3 * TILE, h: 4 * TILE });
          if (rnd(sx, y0, 630) < 0.45) m.parking.push({ x: (sx + 1.5) * TILE, y: (y0 + 3) * TILE, a: -Math.PI / 2 });
          if (rnd(sx, cy1, 631) < 0.35) m.parking.push({ x: (sx + 1.5) * TILE, y: (cy1 - 3) * TILE, a: Math.PI / 2 });
        }
        prop('lamp', cx0 + 1, cy1 - 0.5, 0); prop('lamp', cx1 - 1, cy1 - 0.5, 0);
        prop('hedgerun', cx0 + 0.5, cy1 + 0.4, 0, { tx: (cx1 - cx0 - 1) * TILE, ty: 0, h: 12 });
      }
    }
    // ---- the creek: from the drive's side east to Sycamore Street, its bends, the pond in the middle; reeds and boulders
    const CR = [[px0, 2266], [px0 + 18, 2262], [px0 + 36, 2266], [px0 + 50, 2262], [px0 + 72, 2264], [px0 + 96, 2258], [x1, 2261]];
    const cy = (x) => along(CR, x);
    const pcx = px0 + 46, pcy = 2263, prx = 11, pry = 6;
    const wet = (x, y) => { const c = cy(x); if (Math.abs(y + 0.5 - c) <= 1.6) return true; const e = ((x + 0.5 - pcx) / prx) ** 2 + ((y + 0.5 - pcy) / pry) ** 2; return e < 0.9; };
    for (let y = 2248; y < 2280; y++) for (let x = px0; x < x1; x++) if (wet(x, y) && K.free(x, y)) { m.set(x, y, T.WATER); K.take(x, y, 1, 1); }
    for (let k = 0; k < 5; k++) prop('lily', pcx - prx * 0.6 + k * prx * 0.3, pcy + (k % 2 ? 1.4 : -1.2), 0, { v: k % 3 });
    prop('duck', pcx - 2, pcy + 0.5, 0); prop('duck', pcx + 3, pcy - 1, 0);
    for (const [bx, by] of [[px0 + 1.5, cy(px0) + 2.6], [x1 - 1.5, cy(x1 - 1) - 2.2], [pcx + prx - 1, pcy + pry - 1.5]]) prop('boulder', bx, by, 6, { s: 1 });
    // the paths: along the creek's north bank, down from the boulevard and across to Pier Avenue; the footbridges where
    // they cross the water
    const bankY = (x) => Math.floor(cy(x)) - 6;
    for (let x = px0; x < x1 - 1; x++) { const y = bankY(x); if (y > pcy - pry - 3 && Math.abs(x - pcx) < prx + 3) continue; K.paint(x, y, 1, 2, T.PLAZA); }
    for (let x = pcx - prx - 3; x <= pcx + prx + 3; x++) K.paint(x, pcy - pry - 3, 1, 2, T.PLAZA);
    const nsX = px0 + 60;   // (the walk from the boulevard to Pier Avenue, over the creek)
    for (let y = y0; y < y1; y++) { if (wet(nsX, y) || wet(nsX + 1, y)) continue; K.paint(nsX, y, 2, 1, T.PLAZA); }
    prop('fbridge', nsX + 1, cy(nsX), 0, { len: 150, a: Math.PI / 2 });
    const wsX = px0 + 22;   // (and one from the drive's corner over to the south side)
    for (let y = bankY(wsX); y < y1; y++) { if (wet(wsX, y) || wet(wsX + 1, y)) continue; K.paint(wsX, y, 2, 1, T.PLAZA); }
    prop('fbridge', wsX + 1, cy(wsX), 0, { len: 150, a: Math.PI / 2 });
    // (from the pool's gate down to the bank path; the pond's path down to the bank path at both ends)
    if (m.natureSites && m.natureSites.length && m.natureSites[m.natureSites.length - 1].name === 'Meadowbrook Pool') {
      const g = m.natureSites[m.natureSites.length - 1].gate, gx = Math.round(g.x / TILE) - 1;
      for (let y = Math.round(g.y / TILE) + 1; y < bankY(gx); y++) K.paint(gx, y, 2, 1, T.PLAZA);
    }
    for (const ex of [pcx - prx - 3, pcx + prx + 3]) { const ya = pcy - pry - 3, yb = bankY(ex) + 1; for (let y = Math.min(ya, yb); y <= Math.max(ya, yb); y++) K.paint(ex, y, 2, 1, T.PLAZA); }
    // the gazebo south of the pond, its lawn; picnic tables; benches by the water; willows along the creek
    const gzx = pcx, gzy = pcy + pry + 7;
    K.paint(gzx - 4, gzy - 4, 8, 8, T.PLAZA);
    for (let y = pcy + pry; y < gzy - 4; y++) K.paint(gzx - 1, y, 2, 1, T.PLAZA);
    prop('gazebo', gzx, gzy + 0.5, 30);
    for (const [bx, by] of [[pcx - prx + 1, pcy - pry - 4.6], [pcx + prx - 3, pcy - pry - 4.6], [gzx - 6, gzy + 1], [gzx + 6, gzy + 1]]) prop('bench_m', bx, by, 0);
    for (let k = 0; k < 4; k++) { const tx = px0 + 80 + (k % 2) * 7, ty = y1 - 9 + Math.floor(k / 2) * 5; if (K.free(Math.floor(tx), Math.floor(ty))) { prop('picnic', tx, ty, 8); K.take(Math.floor(tx) - 1, Math.floor(ty) - 1, 3, 3); } }
    prop('trashcan', px0 + 78, y1 - 3, 0);
    for (let x = px0 + 4; x < x1 - 3; x += 9) {
      if (Math.abs(x - pcx) < prx + 2 || Math.abs(x - nsX) < 4 || Math.abs(x - wsX) < 4) continue;
      const side = rnd(x, 2262, 640) < 0.5 ? -1 : 1, ty = cy(x) + side * 3.6;
      if (K.free(Math.floor(x), Math.floor(ty))) prop('tree_b', x + 0.5, ty, 10, { sp: rnd(x, 2262, 641) < 0.6 ? 'willow' : 'birch', k: 1.2 });
    }
    for (let k = 0; k < 6; k++) { const rx = px0 + 6 + k * 15 + rnd(k, 2262, 642) * 4, ry = cy(rx) + (k % 2 ? 2.1 : -2); if (Math.abs(rx - pcx) > prx && Math.abs(rx - nsX) > 3 && Math.abs(rx - wsX) > 3) prop(pick(['flowers_a', 'shrub_a', 'bush_c'], rnd(k, 1, 643)), rx, ry, 0); }
    prop('parksign', px0 + 3, bankY(px0) - 1.5, 0);
    prop('parksign', nsX - 2, y1 - 1.5, 0);
    for (const ly of [bankY(nsX) - 2, y1 - 4]) prop('lamp', nsX + 2.6, ly, 0);
    // the lawns: open, a tree here and there (the general planting below is denser)
    K.landscape({ rect: [px0, y0, x1, y1], bare: 0.75, grid: 7, tree: (x, y, r) => r < 0.9 ? ['tree_b', pick(['oak', 'maple', 'willow', 'oak', 'redMaple'], rnd(x, y, 644)), 1.15 + rnd(x, y, 645) * 0.2] : ['shrub_a', null, 1] });
    place('Meadowbrook Park', px0, y0, x1, y1);
    place('Meadowbrook Creek', px0, 2252, x1, 2272);
  }

  // ===========================================================================================================
  // Quail Run (the research's winding suburb) west of the drive: houses stepping along its bends - facing it from Pier
  // Avenue's side with their back gardens behind, facing away from it on its south side with their yards and pools to
  // the camera, and facing Hillcrest Avenue
  function quail() {
    frontRow(MX.hills + 6, 1444, MY.pier + 6, 2344, { mask: above(QUAIL, 6) });
    backRow(MX.hills + 6, 1446, 2333, MY.hillcrest - 6, { yard: 14, pools: 0.5, mask: below(QUAIL, 6) });
    frontRow(MX.hills + 6, 1446, 2333, MY.hillcrest - 6, { mask: below(QUAIL, 6) });
    place('Quail Run', MX.hills, MY.pier, 1450, MY.hillcrest);
  }

  // ===========================================================================================================
  // Hillcrest Gardens (the owner's apartment complexes with courtyards, 10-16): two-storey garden apartments under hip
  // roofs - a row facing south over the north court and its pool, a row facing Gardens Way, the car park on the way's
  // south side, a row facing south over the south court open to Hillcrest Avenue (its lawn, its pool, the barbecue
  // tables, the leasing office, the sign)
  function gardens() {
    const WALL = ['#e8dcc4', '#dcd0b8', '#e4d4c0', '#d8dccc', '#e8d8c8', '#d4ccbc'];
    let n = 0;
    const row = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 12) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 5 + Math.floor(rnd(x, y0, 650) * 3), kind: 'garden' };
      const w = Math.min(room, 15 + Math.floor(rnd(x, y0, 651) * 6));
      n++; out.homes++;
      return { w, depth: o.depth || 10, minDepth: 9, arch: 'townhouse', name: 'Hillcrest Gardens', poi: false, whole: true, home: { kind: 'apartment', price: 15000 + Math.floor(rnd(x, y0, 652) * 4) * 1000, slots: 2 },
        art: { spec: { floors: 2, style: 'stucco', wallColor: pick(WALL, rnd(x, y0, 653)), win: 'even', pitch: 'hip', roof: 'tile', roofColor: pick(['#a8543a', '#9a4a34', '#b4603e'], rnd(x, y0, 654)), slope: 0.4, parapet: 4, grime: 0.04, balconies: true, blades: [], plaques: [] }, noShop: true } };
    }, o.north ? { north: true } : {});
    // ---- north of Gardens Way: the north row over its court, the court (lawn, the pool, loungers), the row on the way
    const N = area(1458, MY.pier + 6, MX.syc, 2351);
    if (N) {
      const [x0, y0, x1, y1] = N;
      const R1 = row(x0 + 2, x1 - 2, y0, y0 + 10);
      const R2 = row(x0 + 2, x1 - 2, y1 - 11, y1 - 1);
      const b1 = R1.filter((b) => b && !b.gap && b.tw !== undefined), b2 = R2.filter((b) => b && !b.gap && b.tw !== undefined);
      const cy0 = b1.length ? Math.max(...b1.map((b) => b.ty + b.th)) : y0 + 10, cy1 = b2.length ? Math.min(...b2.map((b) => b.ty)) : y1 - 11;
      if (cy1 - cy0 >= 8) {
        K.take(x0, cy0, x1 - x0, cy1 - cy0);
        K.paint(x0 + 1, cy0, x1 - x0 - 2, 2, T.PLAZA);
        const pw = 18, ph = Math.min(5, cy1 - cy0 - 5), qx = Math.floor((x0 + x1) / 2) - pw / 2, qy = cy0 + 3;
        K.paint(qx - 2, qy - 1, pw + 4, ph + 2, T.PLAZA);
        pool(qx, qy, pw, ph);
        for (let k = 0; k < 5; k++) prop('lounger', qx - 1.2 + k * 0.01, qy + 0.6 + k * 0.9, 0, { v: k, a: 0 });
        prop('umbrella_b', qx + pw + 1.3, qy + 0.8, 0); prop('lounger', qx + pw + 1.2, qy + 2.8, 0, { v: 2, a: Math.PI });
        chain(qx - 2.8, qy - 1.4, qx + pw + 2.8, qy - 1.4); chain(qx - 2.8, qy + ph + 1.4, qx + pw + 2.8, qy + ph + 1.4);
        chain(qx - 2.8, qy - 1.4, qx - 2.8, qy + ph + 1.4); chain(qx + pw + 2.8, qy - 1.4, qx + pw + 2.8, qy + ph + 1.4);
        for (const tx of [x0 + 4, x0 + 12, x1 - 12, x1 - 4]) tree(tx, cy0 + (cy1 - cy0) / 2 + 1, 655, pick(['magnolia', 'cherry', 'maple'], rnd(tx, cy0, 656)));
        prop('picnic', x0 + 8, cy1 - 2, 6); prop('picnic', x1 - 8, cy1 - 2, 6);
        place('Hillcrest Gardens North Court', x0, cy0, x1, cy1);
      }
    }
    // ---- south of the way: the car park on the way, the south row, its court open to Hillcrest Avenue
    const S = area(1460, 2361, MX.syc, MY.hillcrest - 6);
    if (S) {
      const [x0, y0, x1, y1] = S;
      // (head-in bays off the way, a hedge behind them)
      const ly1 = y0 + 6;
      K.fill(x0, y0, x1 - x0, 4, T.LOT); K.fill(x0, y0 + 4, x1 - x0, 2, T.GRASS);
      for (let sx = x0 + 2; sx + 3 <= x1 - 2; sx += 3) {
        m.stalls.push({ x: sx * TILE, y: y0 * TILE, w: 3 * TILE, h: 4 * TILE });
        if (rnd(sx, ly1, 657) < 0.55) m.parking.push({ x: (sx + 1.5) * TILE, y: (y0 + 2) * TILE, a: Math.PI / 2 });
      }
      prop('hedgerun', x0 + 0.5, y0 + 4.6, 0, { tx: (x1 - x0 - 1) * TILE, ty: 0, h: 12 });
      for (let lx = x0 + 8; lx < x1 - 4; lx += 22) prop('lamp', lx, y0 + 5.4, 0);
      const R3 = row(x0 + 2, x1 - 22, ly1, ly1 + 10, { north: true });
      const b3 = R3.filter((b) => b && !b.gap && b.tw !== undefined);
      // the leasing office at the row's east end, facing the court
      const ox = x1 - 18;
      const off = K.building({ x: ox, y: ly1 + 1, w: 12, h: 8, arch: 'mixed', name: 'Hillcrest Gardens Leasing', poi: { kind: 'delivery', label: 'Hillcrest Gardens Leasing' }, whole: true,
        art: { spec: { floors: 1, style: 'stucco', wallColor: '#e8dcc4', pitch: 'hip', roof: 'tile', roofColor: '#a8543a', slope: 0.4, parapet: 4, blades: [], plaques: [] },
          shop: { kind: 'lobby', door: 'left', open: true, people: 1, awning: ['#2f6a4e', '#f0ece4'], sign: { text: 'LEASING', bg: '#2f6a4e', fg: [250, 240, 210], lit: true } } } });
      if (off) out.shops++;
      const cy0 = Math.max(b3.length ? Math.max(...b3.map((b) => b.ty + b.th)) : ly1 + 10, off ? ly1 + 9 : 0);
      if (y1 - cy0 >= 8) {
        K.take(x0, cy0, x1 - x0, y1 - cy0);
        K.paint(x0 + 1, cy0, x1 - x0 - 2, 2, T.PLAZA);
        const pw = 16, ph = 5, qx = x0 + Math.floor((x1 - x0) * 0.3), qy = cy0 + 4;
        K.paint(qx - 2, qy - 1, pw + 4, ph + 2, T.PLAZA);
        pool(qx, qy, pw, ph);
        chain(qx - 2.8, qy - 1.4, qx + pw + 2.8, qy - 1.4); chain(qx - 2.8, qy + ph + 1.4, qx + pw + 2.8, qy + ph + 1.4);
        chain(qx - 2.8, qy - 1.4, qx - 2.8, qy + ph + 1.4); chain(qx + pw + 2.8, qy - 1.4, qx + pw + 2.8, qy + ph + 1.4);
        for (let k = 0; k < 4; k++) prop('lounger', qx + 1 + k * 3.5, qy + ph + 0.8, 0, { v: k, a: -Math.PI / 2 });
        // the barbecue tables under the shade, the lawn, the trees; the iron fence along the avenue with the gate, the sign
        const bx = qx + pw + 10;
        if (bx + 8 < x1) { prop('driftshade', bx + 3, qy + 2, 0, { w: 96, d: 70 }); prop('picnic', bx + 1.5, qy + 2, 6); prop('picnic', bx + 5, qy + 2.5, 6); }
        for (const tx of [x0 + 4, qx + pw + 6, x1 - 4]) tree(tx, y1 - 3, 658, pick(['magnolia', 'cherry', 'oak'], rnd(tx, y1, 659)));
        const gx = Math.floor((x0 + x1) / 2);
        fence('iron', x0 + 0.2, y1 - 0.4, gx - 1.5, y1 - 0.4); fence('iron', gx + 1.5, y1 - 0.4, x1 - 0.2, y1 - 0.4);
        K.paint(gx - 1, cy0 + 2, 2, y1 - cy0 - 2, T.PLAZA);
        prop('textsign', gx - 6, y1 - 0.8, 0, { text: 'HILLCREST GARDENS', bg: '#2f6a4e', fg: [250, 240, 210], z: 34, sx: 1 });
        prop('flowers_big', gx - 3, y1 - 1.6, 0); prop('flowers_big', gx + 3, y1 - 1.6, 0);
        place('Hillcrest Gardens South Court', x0, cy0, x1, y1);
      }
    }
    if (n) place('Hillcrest Gardens', 1454, MY.pier, MX.syc, MY.hillcrest);
  }

  // ===========================================================================================================
  // Along Hillcrest Avenue's south side to the West Loop: houses facing the avenue, their back yards down to the sound
  // wall along the freeway (WC168)
  function hillcrest() {
    backRow(1402, MX.syc - 4, MY.hillcrest + 6, MY.hillcrest + 40, { yard: 10, fence: 'stone', pools: 0.35 });
    place('Hillcrest Avenue', 1402, MY.hillcrest, MX.syc, MY.hillcrest + 40);
  }

  // ===========================================================================================================
  // Wren Court and Finch Court off Hills Avenue (cul-de-sacs to the freeway's side): houses facing Wren Court from
  // Hillcrest Avenue's side, back to back between the courts, backing onto the trailer park's fence
  function wren() {
    frontRow(MX.hills + 6, 1400, MY.hillcrest + 6, 2446, { mask: above(WREN, 5) });
    backRow(MX.hills + 6, 1400, 2442, 2484, { yard: 7, mask: both(below(WREN, 5), above(FINCH, 5)) });
    frontRow(MX.hills + 6, 1400, 2442, 2486, { mask: both(below(WREN, 5), above(FINCH, 5)) });
    backRow(MX.hills + 6, 1404, 2484, 2504, { yard: 10, fence: 'wood', mask: below(FINCH, 5) });
    place('Wren Court', MX.hills, MY.hillcrest, 1404, 2462);
    place('Finch Court', MX.hills, 2462, 1404, 2504);
  }

  // ===========================================================================================================
  // Skyview Mobile Home Park (the research's trailer park by the airport's fence) round Skyview Loop off Fountain
  // Avenue: the trailers in rows on their pads, each with its car, its awning, a picnic table or a grill, a shed or a
  // pile of tyres; the middle - the laundry, the mailboxes, the shade over the picnic tables, the pay phone; the sign
  function skyview() {
    const A = area(1323, 2515, 1386, MY.fountain - 6);
    if (!A) return;
    const [x0, y0, x1, y1] = A;
    const COLS = ['#e8e4d8', '#d8e4e0', '#e8dcc0', '#dce0e8', '#e4d8d0', '#d0dcc8', '#f0ece0'];
    const trailer = (x, y, i) => {
      const b = K.building({ x, y, w: 12, h: 5, arch: 'shack', key: 'shanty1', name: 'Skyview Mobile Home', poi: false, whole: true,
        home: { kind: 'shack', price: 6500 + Math.floor(rnd(x, y, 660) * 5) * 500 },
        art: { spec: { style: 'siding', wallColor: pick(COLS, rnd(x, y, 661)), height: 34, roof: 'metal', roofMat: 'metal', roofColor: '#c4c8cc', lip: 2, rimW: 2, boarded: 0, grime: 0.25, graffiti: 0 }, kit: [] } });
      if (!b) return null;
      out.homes++; out.trailers++;
      // the pad in front: the car on the gravel, the awning's shade, a table or a grill, a bit of clutter
      K.fill(x, y + 5, 12, 4, T.DIRT);
      m.parking.push({ x: (x + (i % 2 ? 2 : 10)) * TILE, y: (y + 7) * TILE, a: 0 });
      if (rnd(x, y, 662) < 0.6) prop('driftshade', x + (i % 2 ? 8 : 4), y + 6.6, 0, { w: 70, d: 48 });
      prop(pick(['picnic', 'chair', 'cooler', 'propane', 'picnic'], rnd(x, y, 663)), x + (i % 2 ? 9 : 3), y + 7.4, 0);
      if (rnd(x, y, 664) < 0.35) prop(pick(['tires', 'shed', 'woodpile', 'drum'], rnd(x, y, 665)), x + 13, y + 2.5, 6);
      return b;
    };
    // the rows: 4 trailers a row, a row every 11 tiles; the middle row's middle is the park's commons
    const rows = [];
    for (let y = y0 + 1; y + 9 <= y1; y += 11) rows.push(y);
    const mid = rows[Math.floor(rows.length / 2)];
    rows.forEach((y, r) => {
      for (let k = 0; k < 4; k++) {
        const x = x0 + 1 + k * 15;
        if (x + 12 > x1) break;
        if (y === mid && (k === 1 || k === 2)) continue;
        trailer(x, y, k + r);
      }
    });
    if (mid !== undefined) {
      const cx = x0 + 16, cw = 27;
      const lau = K.building({ x: cx + 1, y: mid, w: 10, h: 6, arch: 'shack', key: 'shanty2', name: 'Skyview Laundry', poi: { kind: 'delivery', label: 'Skyview Laundry' }, whole: true,
        art: { spec: { style: 'siding', wallColor: '#c8d4dc', height: 40, roof: 'metal', roofMat: 'metal', lip: 3, rimW: 2, boarded: 0, grime: 0.3, graffiti: 0 }, kit: [] } });
      void lau;
      K.fill(cx, mid + 6, cw, 4, T.PLAZA);
      prop('driftshade', cx + 18, mid + 3, 0, { w: 110, d: 70 });
      prop('picnic', cx + 15.5, mid + 3, 6); prop('picnic', cx + 20.5, mid + 3.4, 6);
      for (let k = 0; k < 5; k++) prop('mailbox', cx + 3 + k * 1.2, mid + 8.6, 2);
      prop('phonebox', cx + 25, mid + 7.5, 6);
      prop('trashcan', cx + 13, mid + 8, 0);
      place('Skyview Commons', cx, mid, cx + cw, mid + 10);
    }
    // the fence round, the sign at the gate
    chain(x0 - 0.5, y0 - 0.3, x1 + 0.5, y0 - 0.3);
    prop('textsign', 1312, MY.fountain - 7.4, 0, { text: 'SKYVIEW MOBILE HOMES', bg: '#2a4a6a', fg: [250, 236, 180], z: 40, sx: 1, lit: true });
    place('Skyview Mobile Home Park', 1312, 2504, 1396, MY.fountain);
    // between the loop and the freeway: the residents' overflow - a dumpster, tyres, an old boat on its trailer
    const E = area(1395, 2516, 1412, MY.fountain - 6);
    if (E) {
      const [ex0, ey0, ex1, ey1] = E;
      K.fill(ex0, ey0, ex1 - ex0, ey1 - ey0, T.LOT);
      prop('dump_g', ex0 + 2, ey0 + 3, 12); prop('tires', ex0 + 3, ey0 + 9, 6); prop('drum', ex0 + 2.2, ey0 + 13, 6);
      if (ey1 - ey0 > 24) { m.parking.push({ x: (ex0 + 3) * TILE, y: (ey0 + 20) * TILE, a: Math.PI / 2 }); prop('pallet', ex0 + 3, ey1 - 4, 6); }
    }
  }

  // ===========================================================================================================
  // Hillcrest Commons (the research's big-box superblock; WC288's big box by the freeway) between the West Loop and
  // Fountain Avenue: Hills Home Center and its fenced garden centre, Fresh Fields Market, the corner shops, the loading
  // docks behind on the service lane under the freeway's edge, the car park with its islands, lamps and trees; Burger
  // Barn and Java Junction's drive-through kiosk on their pads by the avenue; the pylon signs at the kerb
  function commons() {
    const A = area(1428, 2470, MX.syc, MY.fountain - 6);
    if (!A) return;
    const [, , x1, y1] = A;
    // the boxes' backs: from the first column free all the way down from the freeway's side
    let bx0 = A[0];
    const by0 = 2478, bh = 22;
    while (bx0 < x1 && !K.allFree(bx0, by0 - 2, 1, y1 - by0 + 2)) bx0++;
    const box = (x, w, name, poi, look) => K.building({ x, y: by0, w, h: bh, arch: 'strip', key: 'strip', name, poi, whole: true,
      art: { spec: { floors: 2, style: 'concrete', wallColor: look.wall, parapet: 8, grime: 0.06, blades: [], plaques: [] }, shop: { kind: 'mart', door: 'left', open: true, people: 4, awning: null, sign: { text: name.toUpperCase(), bg: look.bg, fg: look.fg, lit: true } } } });
    const hc = box(bx0 + 1, 40, 'Hills Home Center', { kind: 'hardware', label: 'Hills Home Center' }, { wall: '#d8d0c0', bg: '#e07020', fg: [250, 250, 245] });
    let gx = bx0 + 42;
    if (hc) {
      out.shops++;
      // the garden centre: fenced, the greenhouse, the potted plants in rows, pallets of soil, the gate onto the car park
      const gw = 18;
      if (K.allFree(gx, by0, gw, bh)) {
        K.take(gx, by0, gw, bh);
        K.paint(gx, by0, gw, bh, T.PLAZA);
        prop('greenhouse', gx + gw / 2, by0 + 6, 20);
        for (let ry = by0 + 12; ry < by0 + bh - 2; ry += 3) for (let rx = gx + 2; rx < gx + gw - 2; rx += 2.5) prop(pick(['potted', 'flowers_a', 'shrub_a', 'potted', 'flowers_big'], rnd(Math.floor(rx), ry, 670)), rx, ry, 0);
        prop('pallet_s', gx + 2, by0 + 2, 6); prop('pallet_s', gx + gw - 2.5, by0 + 2, 6);
        chain(gx + 0.2, by0 + 0.2, gx + 0.2, by0 + bh - 0.2); chain(gx + gw - 0.2, by0 + 0.2, gx + gw - 0.2, by0 + bh - 0.2);
        chain(gx + 0.2, by0 + bh - 0.2, gx + gw / 2 - 2, by0 + bh - 0.2); chain(gx + gw / 2 + 2, by0 + bh - 0.2, gx + gw - 0.2, by0 + bh - 0.2);
        prop('textsign', gx + gw / 2, by0 + bh + 0.7, 0, { text: 'GARDEN CENTER', bg: '#2f6a4e', fg: [250, 240, 210], z: 30, sx: 1 });
        place('Hills Home Center Garden Center', gx, by0, gx + gw, by0 + bh);
      }
      gx += gw + 4;
    }
    const mkt = box(gx, 34, 'Fresh Fields Market', { kind: 'grocery', label: 'Fresh Fields Market' }, { wall: '#e4dccc', bg: '#2f7a3a', fg: [250, 246, 220] });
    if (mkt) out.shops++;
    // the corner shops: a row of units under one roof on the corner
    const sx0 = gx + 36;
    if (x1 - sx0 >= 24) {
      const units = [['delivery', 'Hills Animal Clinic'], ['coffee', 'Sunrise Donuts'], ['delivery', 'Polished Nail Bar'], ['delivery', 'Commons Cleaners']].slice(0, Math.max(2, Math.floor((x1 - sx0 - 2) / 11)));
      const st = K.building({ x: sx0, y: by0 + 8, w: Math.min(x1 - sx0 - 2, units.length * 11), h: 14, arch: 'strip', key: 'strip', name: 'Commons Corner', units, whole: true,
        art: { spec: { floors: 1, style: 'stucco', wallColor: '#e8e0cc', parapet: 10, grime: 0.05, roofMat: 'membrane', blades: [], plaques: [] } } });
      if (st) out.shops += units.length;
    }
    // the service lane behind the boxes, under the freeway's edge: the docks, dumpsters, pallets
    for (let x = bx0; x < x1; x++) { const c = K.column(x, by0 - 10, by0 - 1); if (c) K.fill(x, c[1], 1, c[0] - c[1] + 1, T.LOT); }
    for (let x = bx0 + 6; x < x1 - 6; x += 17) prop(pick(['dump_g', 'dump_b', 'pallet', 'crates'], rnd(x, by0, 671)), x, by0 - 1.6, 10);
    // the pads by the avenue: Burger Barn with its drive-through lane round it, Java Junction's kiosk
    const padY = y1 - 14;
    const bb = K.building({ x: bx0 + 8, y: padY, w: 14, h: 9, arch: 'diner', key: 'diner', name: 'Burger Barn', poi: { kind: 'coffee', label: 'Burger Barn', food: true }, whole: true,
      art: { spec: { floors: 1, style: 'stucco', wallColor: '#e8d8b8', parapet: 8, grime: 0.05, blades: [], plaques: [] }, shop: { kind: 'diner', door: 'left', open: true, people: 2, sign: { text: 'BURGER BARN', bg: '#a8302a', fg: [250, 230, 150], lit: true }, awning: ['#a8302a', '#f0e4c8'] } } });
    if (bb) { out.shops++; prop('textsign', bx0 + 4, y1 - 0.8, 0, { text: 'BURGER BARN', bg: '#a8302a', fg: [250, 230, 150], z: 60, sx: 1, lit: true }); }
    const jj = K.building({ x: x1 - 16, y: padY + 3, w: 8, h: 6, arch: 'cafe', key: 'rest2', name: 'Java Junction', poi: { kind: 'coffee', label: 'Java Junction' }, whole: true,
      art: { spec: { floors: 1, style: 'stucco', wallColor: '#3a2a20', parapet: 6, blades: [], plaques: [] }, shop: { kind: 'cafe', door: 'left', open: true, people: 1, sign: { text: 'JAVA JUNCTION', bg: '#3a2a20', fg: [236, 214, 150], lit: true } } } });
    if (jj) out.shops++;
    // the car park: from the boxes' fronts to the avenue, rows of bays across the islands
    const fy = by0 + bh;
    K.fill(bx0, fy, x1 - bx0, 2, T.PLAZA);
    const py0 = fy + 2, py1 = y1;
    K.fill(bx0, py0, x1 - bx0, py1 - py0, T.LOT);
    for (let ry = py0 + 2; ry + 8 <= padY - 2; ry += 11) {
      for (const half of [0, 1]) {
        const sy = ry + half * 4;
        for (let sx = bx0 + 2; sx + 3 <= x1 - 2; sx += 3) {
          if ((sx - bx0 - 2) % 33 < 3) continue;   // (the islands across the rows)
          m.stalls.push({ x: sx * TILE, y: sy * TILE, w: 3 * TILE, h: 4 * TILE });
          if (rnd(sx, sy, 672) < 0.5) m.parking.push({ x: (sx + 1.5) * TILE, y: (sy + 2) * TILE, a: half ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
      for (let ix = bx0 + 2; ix < x1 - 4; ix += 33) { K.paint(ix, ry, 3, 8, T.GRASS); tree(ix + 1.5, ry + 4, 673, pick(['oak', 'maple', 'streetPl'], rnd(ix, ry, 674))); prop('lamp', ix + 1.5, ry + 0.6, 0); }
    }
    prop('textsign', (bx0 + x1) / 2, py1 - 0.8, 0, { text: 'HILLCREST COMMONS', bg: '#1e3a5e', fg: [250, 236, 160], z: 70, sx: 1, lit: true });
    place('Hillcrest Commons', bx0, by0, x1, py1);
  }
}
