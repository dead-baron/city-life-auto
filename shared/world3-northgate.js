// World v3, handcrafted: the heart of Northgate (district 2) along the Gulf Loop's viaduct, from the owner's concepts
// WC400 (courtyard blocks under the freeway: prompt Northgate-A1) and WC401 (the freeway's underside: Northgate-B1), with
// WC069 and WC298 (the pocket park, the courtyard walk-ups). From Ash Street to Harborview Avenue, 1st Street to 12th
// Street (the rest of Northgate stays the generator's):
//   - north of the freeway, along 3rd Street (its new service road): Fire Station 7 with its engines on the apron, the
//     Northgate Public Library under its green roof on a plaza with a statue, the Northgate Pool (lanes, the deep end's
//     board, loungers, the poolhouse), and walk-ups back to back between 1st Street and 3rd Street;
//   - south of it, Main Avenue to Civic Avenue: Overpass Park - the mural walls along the viaduct, the skate park, two
//     half courts painted blue and orange, the food-truck corner with its tables under string lights, the fenced car
//     park, and below them lawns, the community garden's beds and picnic tables;
//   - round it, and south of 9th Street: courtyard blocks - walk-ups facing the streets on both sides, a corner store
//     here and there, their courtyards' trees and benches between; Sycamore Court, a cul-de-sac off 12th Street.
// Deterministic like every plan (shared/world3-hand.js).
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 2;   // Northgate's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles: the grid's, as the generator lays them)
export const GX = { ash: 3119, main: 3184, sycamore: 3252, civic: 3320, alder: 3373, elm: 3427, harborview: 3480 };
export const GY = { first: 1477, third: 1513, sixth: 1550, ninth: 1587, twelfth: 1623 };

function streets() {
  const out = [];
  const ew = (name, kind, y, x0, x1) => out.push({ name, kind, pts: [[x0, y], [x1, y]] });
  const ns = (name, kind, x, y0, y1, o = {}) => out.push({ name, kind, pts: [[x, y0], [x, y1]], ...o });
  ew('3rd Street', 'st', GY.third, GX.ash, GX.harborview);
  ew('6th Street', 'st', GY.sixth, GX.ash, GX.main);
  ew('6th Street', 'st', GY.sixth, GX.civic, GX.harborview);
  ew('9th Street', 'st', GY.ninth, GX.ash, GX.harborview);
  ns('Main Avenue', 'ave', GX.main, GY.first, GY.twelfth);
  ns('Civic Avenue', 'ave', GX.civic, GY.first, GY.twelfth);
  ns('Elm Street', 'st', GX.elm, GY.first, GY.twelfth);
  ns('Sycamore Street', 'st', GX.sycamore, GY.first, GY.third);
  ns('Alder Street', 'st', GX.alder, GY.first, GY.third);
  ns('Alder Street', 'st', GX.alder, GY.sixth, GY.twelfth);
  ns('Sycamore Court', 'st', GX.sycamore, GY.twelfth, GY.twelfth - 20, { culdesac: true });
  return out;
}

export const NORTHGATE = {
  key: 'northgate', d: D, rect: [GX.ash, GY.first, GX.harborview, GY.twelfth],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of Northgate)
  specials: ['Fire Station 7', 'Northgate Public Library'],
  build,
};

// the bands' rows (tiles, inclusive) and the blocks' columns ([x0, x1)), inside their pavements
const NB = [1483, 1507], MB = [1534, 1581], M1 = [1534, 1544], M2 = [1556, 1581], SB = [1593, 1617];
const COL = { a: [3125, 3178], b: [3191, 3247], c: [3258, 3314], d: [3327, 3368], e: [3379, 3422], f: [3433, 3474] };
const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5040', '#b0644c'];
const STONE = ['#d4c8b0', '#c8bca4', '#cfc4ae', '#bfb4a0'];
const STORES = ['Corner Deli', 'Northgate Market', 'Lucky Mart', 'Overpass Bodega', '3rd Street Grocery', 'Sycamore Mini Mart', 'Quick Stop', 'Elm Street Deli'];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower } = towerKit(K, out);
  let si = 0;
  // a walk-up's art: three to five floors of brick (now and then stone), a fire escape on the taller ones
  const walkArt = (x, y, w, floors, shop = null) => tower(x, y, { name: shop ? shop.name : '', style: rnd(x, y, 41) < 0.8 ? 'brick' : 'stone', tone: pick(BRICK, rnd(x, y, 42)), wall: pick(STONE, rnd(x, y, 43)), floors,
    ...(shop ? { store: shop.store, awning: shop.awning, grille: true } : { shop: false }), win: pick(['pair', 'even'], rnd(x, y, 44)), cornice: 'bracket', parapet: 6, roofMat: pick(['gravel', 'membrane', 'gravel'], rnd(x, y, 45)),
    spec: floors >= 4 && w >= 8 && rnd(x, y, 46) < 0.55 ? { fireEscape: [Math.max(8, Math.round(w * TILE * 0.55) - 25), 50] } : null });
  // A row of walk-ups facing the street south of it (fronts south; opt.north: against the band's north edge, their doors
  // on the street north of it); now and then a corner store at the row's end
  const walkRow = (x0, x1, y0, y1, depth, north = false) => K.row(x0, x1, y0, y1, (x, room, i) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 14 ? room : 8 + Math.floor(rnd(x, y0 + y1, 51) * 5), floors = 3 + Math.floor(rnd(x, y0, 52) * 3);
    const corner = !north && (i === 0 || room <= 14) && rnd(x, y1, 53) < 0.35;
    if (corner) {
      const name = STORES[si++ % STORES.length];
      return { w, depth, arch: 'mixed', name, poi: { kind: 'convenience', label: name }, home: { kind: 'apartment' }, whole: true, art: walkArt(x, y1, w, floors, { name, store: 'mart', awning: pick([['#2f6a4e', '#f0ece4'], ['#7a1e2a', '#efe6d0'], ['#2a3a5a', '#efe6d0']], rnd(x, y1, 54)) }) };
    }
    return { w, depth, arch: 'walkup', ...(north ? { face: 'N' } : { door: x + Math.floor(w * 0.22 + 0.3) }), home: { kind: 'apartment' }, whole: true, art: walkArt(x, north ? y0 : y1, w, floors) };
  }, north ? { north: true } : {});
  // A courtyard block: walk-ups facing the street on both sides (north and south), the court between - its trees,
  // benches, a bed or two (what's left is the kit's landscape)
  const courtBlock = ([x0, x1], [y0, y1]) => {
    const h = y1 - y0 + 1, depth = Math.max(8, Math.min(11, Math.floor((h - 7) / 2)));
    walkRow(x0, x1, y0, y1, depth, true);
    walkRow(x0, x1, y0, y1, depth);
    const cy0 = y0 + depth, cy1 = y1 - depth;
    if (cy1 - cy0 >= 2) {
      for (let x = x0 + 4; x < x1 - 3; x += 9) {
        const cy = (cy0 + cy1 + 1) / 2;
        if (!K.free(Math.floor(x), Math.floor(cy))) continue;
        prop(pick(['tree_a', 'tree_b'], rnd(x, cy, 55)), x, cy, 12, { sp: pick(['street', 'maple', 'oak', 'cherry', 'streetPl'], rnd(x, cy, 56)), k: 1.1 });
        if (rnd(x, cy, 57) < 0.4 && K.free(Math.floor(x + 3), Math.floor(cy))) prop('bench_m', x + 3, cy + 0.4, 0);
      }
    }
  };

  northSide(K, m, { place, tower, walkRow, courtBlock, out });
  overpassPark(K, m, out);
  // the courtyard blocks round the park and south of 9th Street
  courtBlock(COL.a, M2);
  for (const c of [COL.d, COL.e, COL.f]) courtBlock(c, M2);
  for (const c of [COL.a, COL.d, COL.e, COL.f]) walkRow(c[0], c[1], M1[0], M1[1], 9);   // (the strips along the viaduct: a row each)
  for (const c of Object.values(COL)) courtBlock(c, SB);
  // what the plan left open: courtyard lawn with street trees (else the kit's seal paves it)
  K.landscape({ bare: 0.4, tree: (x, y, r) => r < 0.85 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['street', 'maple', 'oak', 'streetPl', 'cherry'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : [pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  void api; void m;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// North of the freeway, along 3rd Street: Fire Station 7, the Northgate Public Library on its statue plaza, the
// Northgate Pool, and walk-ups back to back between 1st Street and 3rd Street
function northSide(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { place, walkRow, courtBlock, out } = ctx;
  // ---- Fire Station 7: brick, three bays onto its apron, the engines out front; a deli on the corner
  {
    const [x0, x1] = COL.a, fw = 34, fh = 15, fy = NB[0] + 1;
    const fs = place({ x: x0, y: fy, w: fw, h: fh, arch: 'fire', key: 'fire', name: 'Fire Station 7', poi: { kind: 'delivery', label: 'Fire Station 7' }, whole: true, door: x0 + fw - 3,
      art: { spec: { floors: 2, style: 'brick', brickTone: '#9a3a2e', cornice: 'dentil', parapet: 8 }, kit: [['tank', 60, 60], ['ac', fw * TILE - 70, 50]] } });
    const ay0 = fy + fh;
    K.fill(x0, ay0, fw, NB[1] - ay0 + 1, T.LOT);
    for (let k = 0; k < 2; k++) m.parking.push({ x: (x0 + 6 + k * 10) * TILE, y: (ay0 + 3.4) * TILE, a: Math.PI / 2, model: 'firetruck' });
    for (const dx of [1, fw - 1]) prop('bollard', x0 + dx, NB[1] - 0.4, 0);
    prop('flagpole', x0 + fw - 1.5, ay0 + 1.2, 0, { h: 110, c: 'stars' });
    if (fs) (out.places ||= []).push({ name: 'Fire Station 7', x0, y0: fy, x1: x0 + fw, y1: NB[1] + 1 });
    walkRow(x0 + fw + 1, x1, NB[0], NB[1], 14);
  }
  // ---- the Northgate Public Library: stone under a green roof, its portico on the plaza; the statue, trees, benches
  {
    const [x0, x1] = COL.b, lw = 40, lx = Math.floor((x0 + x1 - lw) / 2), lh = 14, ly = NB[0] + 1, LW = lw * TILE;
    const lib = place({ x: lx, y: ly, w: lw, h: lh, arch: 'bank', key: 'bank', name: 'Northgate Public Library', poi: { kind: 'delivery', label: 'Northgate Public Library' }, whole: true,
      art: { spec: { floors: 2, style: 'stone', wallColor: '#d8ccb4', cornice: 'dentil', win: 'arch', parapet: 6, pitch: true, slope: 0.5, roofColor: '#4f8a6a',
        portico: { x: Math.round(LW / 2 - 110), w: 220, cols: 6, text: 'PUBLIC LIBRARY' } }, noShop: true } });
    const py0 = ly + lh;
    K.fill(x0, NB[0], x1 - x0, NB[1] - NB[0] + 1, T.PLAZA); K.take(x0, NB[0], x1 - x0, NB[1] - NB[0] + 1);
    const sx = (x0 + x1) / 2, sy = (py0 + NB[1]) / 2 + 1;
    prop('statue', sx, sy, 0);
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; prop('flowers_big', sx + Math.cos(a) * 3.6, sy + 0.5 + Math.sin(a) * 2.4, 0); }
    for (const dx of [-14, -8, 8, 14]) prop('tree_a', sx + dx, sy, 12, { sp: pick(['streetPl', 'maple'], rnd(dx, sy, 61)), k: 1.1, grate: true });
    for (const dx of [-11, 11]) prop('bench_m', sx + dx, NB[1] - 0.8, 0);
    for (const dx of [-5, 5]) prop('lamp', sx + dx, py0 + 1, 0);
    for (const fx of [x0 + 2, x1 - 2]) for (let y = NB[0] + 2; y < py0; y += 5) prop('tree_b', fx, y, 12, { sp: 'oak', k: 1.1 });
    if (lib) (out.places ||= []).push({ name: 'Northgate Public Library', x0, y0: NB[0], x1, y1: NB[1] + 1 });
  }
  // ---- the Northgate Pool: the fence, the poolhouse along the north side, six lanes with the deep end's board,
  // loungers and umbrellas on the deck, the lifeguard's chair
  {
    const [x0, x1] = COL.c, y0 = NB[0], y1 = NB[1] + 1;
    K.fill(x0, y0, x1 - x0, y1 - y0, T.PLAZA); K.take(x0, y0, x1 - x0, y1 - y0);
    const bw = 16, bx0 = x0 + 2, bd = 3;
    for (let ty = y0 + 1; ty < y0 + 1 + bd; ty++) for (let tx = bx0; tx < bx0 + bw; tx++) m.set(tx, ty, T.WALL);
    prop('poolhouse', bx0 + bw / 2, y0 + 1 + bd / 2 - 0.25, 0, { w: bw * TILE, d: bd * TILE - 4 });
    const px0 = x0 + 4, py0 = y0 + bd + 4, pw = x1 - x0 - 10, ph = Math.min(12, y1 - py0 - 4), dw = 6;
    for (let ty = py0; ty < py0 + ph; ty++) for (let tx = px0; tx < px0 + pw; tx++) m.set(tx, ty, tx >= px0 + pw - dw ? T.DEEP : T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 6, deep: { x: (px0 + pw - dw) * TILE, y: py0 * TILE, w: dw * TILE, h: ph * TILE }, deck: { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE } });
    const lx = px0 + (pw - dw) / 2;
    for (let k = 1; k < 6; k++) prop('lanerope', lx, py0 + ph * k / 6, 0, { len: (pw - dw) * TILE - 8 });
    prop('lanerope', px0 + pw - dw, py0 + ph / 2, 0, { len: ph * TILE - 8, a: Math.PI / 2 });
    prop('diveboard', px0 + pw + 0.9, py0 + ph / 2, 10, { a: Math.PI, len: 64 });
    prop('lguard', px0 - 1.4, py0 + ph - 1, 14, { a: 0 });
    let k = 0;
    for (let x = bx0 + bw + 1.5; x < x1 - 2; x += 1.6, k++) { if (k % 3 === 2) prop(k % 2 ? 'umbrella_b' : 'umbrella_r', x, py0 - 1.4, 4); else prop('lounger', x, py0 - 1.2, 6, { a: Math.PI / 2, v: k % 4 }); }
    for (let x = px0 + 1, j = 0; x < px0 + pw - 1; x += 1.7, j++) { if (j % 3 === 1) prop(j % 2 ? 'umbrella_r' : 'umbrella_y', x, py0 + ph + 1.2, 4); else prop('lounger', x, py0 + ph + 1, 6, { a: -Math.PI / 2, v: (j + 2) % 4 }); }
    for (const [fx, fy] of [[x0 + 0.3, y0 + 0.3, 0], [x0 + 0.3, y1 - 0.3]]) prop('chainfence', fx, fy, 0, { tx: (x1 - x0 - 0.6) * TILE, ty: 0 });
    prop('chainfence', x0 + 0.3, y0 + 0.3, 0, { tx: 0, ty: (y1 - y0 - 0.6) * TILE }); prop('chainfence', x1 - 0.3, y0 + 0.3, 0, { tx: 0, ty: (y1 - y0 - 0.6) * TILE });
    for (const [fx, fy] of [[x0 + 1.5, y0 + 1.5], [x1 - 1.5, y0 + 1.5], [x0 + 1.5, y1 - 1.5], [x1 - 1.5, y1 - 1.5]]) prop('potted', fx, fy, 6);
    prop('textsign', (x0 + x1) / 2, y1 - 0.5, 0, { text: 'NORTHGATE POOL', bg: '#2a6a9a', fg: [250, 250, 240], z: 26, sx: 1 });
    (out.places ||= []).push({ name: 'Northgate Pool', x0, y0, x1, y1 });
  }
  // ---- walk-ups back to back between 1st Street and 3rd Street
  for (const c of [COL.d, COL.e, COL.f]) courtBlock(c, NB);
}

// ---------------------------------------------------------------------------------------------------------------
// Overpass Park (WC401), Main Avenue to Civic Avenue between the viaduct and 9th Street: the mural walls along the
// viaduct; the skate park, the two half courts, the food-truck corner and the fenced car park in a row under them;
// below, lawns and trees, the community garden's beds, picnic tables, paths and lamps.
function overpassPark(K, m, out) {
  const { prop, rnd, pick } = K;
  const x0 = COL.b[0], x1 = COL.c[1], y0 = MB[0], y1 = MB[1] + 1;
  K.fill(x0 - 1, y0, x1 - x0 + 2, y1 - y0, T.GRASS); K.take(x0 - 1, y0, x1 - x0 + 2, y1 - y0);
  // the mural walls along the viaduct, a gap for each path in
  for (let x = x0 + 1; x + 8 <= x1 - 1; x += 10) prop('gwall', x + 4, y0 + 0.6, 0, { len: 8 * TILE, v: 1 + Math.floor(rnd(x, y0, 71) * 4) });
  // a paved walk along the walls and one along 9th Street, crossing paths between
  K.paint(x0, y0 + 1, x1 - x0, 2, T.PLAZA); K.paint(x0, y1 - 3, x1 - x0, 2, T.PLAZA);
  const ry0 = y0 + 4, rh = 18;
  // the skate park
  {
    const sx = x0 + 1, sw = 30;
    K.paint(sx, ry0, sw, rh, T.PLAZA);
    const at = (fx, fy) => [sx + sw * fx, ry0 + rh * fy], put = (t, [px, py], extra) => prop(t, px, py, 0, extra);
    put('skatepad', [sx + sw / 2, ry0 + 0.6], { w: Math.round((sw - 0.4) * TILE), d: Math.round((rh - 1.2) * TILE) });
    put('qpipe', [sx + 4, ry0 + 1.6], { w: 192 }); put('qpipe', [sx + sw - 4, ry0 + 1.6], { w: 160 });
    put('pyramid', at(0.5, 0.45)); put('kicker', at(0.18, 0.5)); put('kicker', at(0.82, 0.62));
    put('ledge', at(0.3, 0.72), { w: 128 }); put('flatbar', at(0.62, 0.78), { w: 128 }); put('ledge', at(0.82, 0.36), { w: 96, v: 2 });
    put('boombox', at(0.12, 0.82));
    for (const fx of [0.38, 0.62]) put('lamp', [sx + sw * fx, ry0 + rh - 0.4]);
    const seats = [[0.3, 0.72], [0.82, 0.36]].map(([fx, fy]) => ({ x: Math.round((sx + sw * fx) * TILE), y: Math.round((ry0 + rh * fy) * TILE) + 4 }));
    (m.skateSpots ||= []).push({ name: 'Overpass Skate Park', x: sx, y: ry0, w: sw, h: rh, seats });
    (out.places ||= []).push({ name: 'Overpass Skate Park', x0: sx, y0: ry0, x1: sx + sw, y1: ry0 + rh });
  }
  // the two half courts, painted blue and orange, chain-link round them, bleachers, lamps
  {
    const cx0 = x0 + 33, cw = 14;
    K.paint(cx0, ry0, cw * 2 + 3, rh, T.LOT);
    for (let k = 0; k < 2; k++) {
      const mx = cx0 + 1 + k * (cw + 1) + cw / 2;
      prop('court', mx, ry0 + 0.6, 0, { w: cw * TILE, d: (rh - 4) * TILE, c1: '#3a5a9a', c2: '#d8703a' });
      prop('hoop', mx, ry0 + 1.2, 6);
      (m.courtSpots ||= []).push({ x: Math.round(mx * TILE), y: Math.round((ry0 + rh / 2) * TILE), w: cw, h: rh - 4, name: 'Overpass Park Courts' });
    }
    const fx0 = cx0 + 0.2, fx1 = cx0 + cw * 2 + 2.8, fy0 = ry0 + 0.2, fy1 = ry0 + rh - 0.4;
    prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 4) * TILE, ty: 0 });
    prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
    prop('bleachers', cx0 + cw + 1.5, ry0 + rh - 1.6, 10, { len: 160, rows: 2 });
    for (const lx of [fx0, fx1]) prop('lamp', lx, fy1 + 0.6, 0);
    (out.places ||= []).push({ name: 'Overpass Park Courts', x0: cx0, y0: ry0, x1: cx0 + cw * 2 + 3, y1: ry0 + rh });
  }
  // the food-truck corner: the van and the cart, tables under umbrellas, string lights over them
  {
    const tx0 = x0 + 66, tw = 26;
    K.paint(tx0, ry0, tw, rh, T.PLAZA);
    m.parking.push({ x: (tx0 + 5) * TILE, y: (ry0 + 3) * TILE, a: 0, model: 'van' });
    prop('foodcart', tx0 + 13, ry0 + 3, 14); prop('foodcart', tx0 + 19, ry0 + 3.4, 14);
    for (let k = 0; k < 8; k++) { const tx = tx0 + 3 + (k % 4) * 6, ty = ry0 + 8 + Math.floor(k / 4) * 5; prop('cafetable', tx, ty, 0); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b'], rnd(k, tx0, 72)), tx, ty - 0.1, 0); }
    prop('festoon', tx0 + 1, ry0 + 6.5, 0, { tx: Math.round((tw - 2) * TILE), ty: 0, h: 60 });
    prop('festoon', tx0 + 1, ry0 + 12, 0, { tx: Math.round((tw - 2) * TILE), ty: 0, h: 60 });
    for (const lx of [tx0 + 1, tx0 + tw - 1]) prop('lamp', lx, ry0 + rh - 0.6, 0);
    prop('trashcan', tx0 + tw - 1.5, ry0 + 5, 0);
    (out.places ||= []).push({ name: 'Overpass Food Trucks', x0: tx0, y0: ry0, x1: tx0 + tw, y1: ry0 + rh });
  }
  // the fenced car park at the east end
  {
    const lx0 = x0 + 94, lx1 = x1 - 1;
    K.paint(lx0, ry0, lx1 - lx0, rh, T.LOT);
    for (let x = lx0 + 2; x < lx1 - 2; x += 3) for (const ly of [ry0 + 3, ry0 + rh - 3]) m.parking.push({ x: (x + 0.5) * TILE, y: ly * TILE, a: Math.PI / 2, drive: true });
    prop('chainfence', lx0 + 0.2, ry0 + 0.2, 0, { tx: 0, ty: (rh - 0.4) * TILE }); prop('chainfence', lx1 - 0.2, ry0 + 0.2, 0, { tx: 0, ty: (rh - 0.4) * TILE });
    prop('chainfence', lx0 + 0.2, ry0 + rh - 0.2, 0, { tx: (lx1 - lx0 - 5) * TILE, ty: 0 });
    prop('textsign', (lx0 + lx1) / 2, ry0 + rh - 1.2, 0, { text: 'PARKING', bg: '#1e3a5e', fg: [250, 250, 240], z: 24, sx: 1 });
  }
  // below: lawns with trees, the community garden's beds, picnic tables, the paths in from 9th Street
  {
    const gy0 = ry0 + rh + 1, gy1 = y1 - 3;
    for (const px of [x0 + 20, x0 + 60, x0 + 100]) K.paint(px - 1, gy0 - 1, 3, gy1 - gy0 + 1, T.PLAZA);
    // the community garden
    const cg0 = x0 + 64, cg1 = x0 + 96;
    for (let y = gy0 + 1; y + 2 < gy1; y += 4) for (let x = cg0 + 1; x + 4 < cg1; x += 6) { K.paint(x, y, 4, 2, T.DIRT); prop('raisedbed', x + 2, y + 1, 0, { v: (x + y) % 5 }); }
    prop('fenceline', cg0 + 0.2, gy0 + 0.2, 0, { kind: 'picket', tx: (cg1 - cg0 - 0.4) * TILE, ty: 0 });
    prop('textsign', (cg0 + cg1) / 2, gy1 - 1, 0, { text: 'COMMUNITY GARDEN', bg: '#2f6a4e', fg: [250, 240, 200], z: 26, sx: 1 });
    // groves on the lawns (clear of the paths and the garden), picnic tables and flower beds in their clearings
    const path = (x) => [x0 + 20, x0 + 60, x0 + 100].some((px) => Math.abs(x - px) < 3);
    for (let y = gy0 + 2, r = 0; y < gy1 - 1; y += 4, r++) for (let x = x0 + 3 + (r % 2) * 3; x < x1 - 2; x += 6) {
      if ((x > cg0 - 3 && x < cg1 + 2) || path(x)) continue;
      const u = rnd(x, y, 73);
      if (u < 0.55) prop(pick(['tree_a', 'tree_b'], rnd(x, y, 75)), x, y, 12, { sp: pick(['oak', 'streetPl', 'maple', 'street', 'cherry'], rnd(x, y, 74)), k: 1.05 + rnd(x, y, 76) * 0.25 });
      else if (u < 0.68) prop('picnic', x, y, 0);
      else if (u < 0.8) prop(pick(['flowers_big', 'shrub_a', 'bush_c'], rnd(x, y, 77)), x, y, 0);
    }
    for (const px of [x0 + 20, x0 + 60, x0 + 100]) { prop('lamp', px + 2, gy0 + 1, 0); prop('bench_m', px + 3, (gy0 + gy1) / 2, 0); }
    prop('textsign', x0 + 20, y1 - 3.4, 0, { text: 'OVERPASS PARK', bg: '#2f5a4a', fg: [240, 232, 200], z: 28, sx: 1 });
  }
  (out.places ||= []).push({ name: 'Overpass Park', x0, y0, x1, y1 });
}
