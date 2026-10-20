// World v3, handcrafted: The Bluffs (district 34), the villa headland east of North Point on the north coast, from the
// owner's concept WC387 (Bluffs-A1: tile-roofed villas with pools behind gated drives along a winding clifftop road; a
// cliff-edge walk with railings and benches, a tennis court, cypresses and palms; switchback timber stairs down to a
// tiny cove with a beach-shack bar, surfboards and a jetty; sea stacks offshore), with WC306 (the cove below the cliff
// walk, the chapel on the cliff top) and the research's north coast (headland villas on big lots, the clifftop
// promenade, an overlook on the point):
//   - Bluffs Avenue up the headland from the Shore Road (THE BLUFFS at its gate) to the point, where it turns west to
//     meet Rowan Street; Cliff Road winding along the clifftop from the avenue's top to Headland Road; Seacliff,
//     Cormorant and Windward Lanes, Club Lane, Headland Road and Chapel Road across;
//   - the villas on their lots: the house at the back, the terrace and the pool in front, the drive in from the gate,
//     hedges down the sides, iron railings on the street; or the house on the lane above, its garden behind it;
//   - the Cliff Walk between Cliff Road and the top of the east beach, railed, benches and coin telescopes, lamps, the
//     gazebo; Bluffs Overlook on the point; the stairs down to Bluffs Cove - the beach-shack bar, surfboards, the jetty,
//     the sea stacks;
//   - The Bluffs Tennis Club on Club Lane, Headland Chapel on Chapel Road above the cove, Bluffs Market by the gate.
// Every building faces south (the camera). Names and signs are invented. Draws are fixed by place (hash2).
import { TILE, T } from './constants.js';

const D = 34;   // The Bluffs (shared/mapcore.js DISTRICTS)
const RECT = [3620, 400, 3860, 706];   // (its edges are the grid's: Rowan and Elm Streets west, the east edge street, the Shore Road)
export const BX = { rowan: 3620, ave: 3680, edge: 3860 };
export const BY = { top: 439, seacliff: 478, cormorant: 515, windward: 553, club: 590, headland: 628, chapel: 670, shore: 705 };
const WARM = ['#f2e6cc', '#ecd8b4', '#f0dcc0', '#e8cca8', '#f4ece0', '#e6d2b8', '#f0e0d0'];
const COOL = ['#f0eee8', '#e4e2dc', '#d8dcdc'];
const NAMES = ['Windcrest', 'Highwater', 'Saltmeadow', 'Greystones', 'Fairhaven', 'Tidewatch', 'Northwind', 'Sea Holly', 'Ledgemere', 'Stormhaven', 'Bayberry House', 'The Lookout', 'Shorecliff', 'Heathcote', 'The Moorings', 'Foghollow', 'Rockledge', 'Westerly', 'Brightwater', 'Wrackline', 'Gorse Hill', 'Halyard House', 'Spindrift', 'Whitecaps', 'Long Reach House', 'Barnacle Hall', 'Cliffhanger', 'Seawall House', 'Breakwater House', 'Marram House'];

// Cliff Road along the clifftop, a dozen tiles in from the top of the beach, from the avenue's top to Headland Road
export const CLIFF = [[BX.ave, 456], [3704, 458], [3735, 464], [3766, 478], [3790, 500], [3792, 515], [3780, 535], [3762, 553], [3738, 570], [3728, 590], [3726, 610], [3734, 628]];

export const BLUFFS = {
  key: 'bluffs', d: D, rect: RECT, few: 30,   // (big houses on big lots: test/world3world.test.js)
  streets: () => [
    { name: 'Bluffs Avenue', kind: 'ave', pts: [[BX.rowan, BY.top], [BX.ave - 10, BY.top], [BX.ave, BY.top + 10], [BX.ave, BY.shore]] },
    { name: 'Cliff Road', kind: 'minor', pts: CLIFF },
    { name: 'Seacliff Lane', kind: 'minor', pts: [[BX.rowan, BY.seacliff], [3766, BY.seacliff]] },
    { name: 'Cormorant Lane', kind: 'minor', pts: [[BX.rowan, BY.cormorant], [3792, BY.cormorant]] },
    { name: 'Windward Lane', kind: 'minor', pts: [[BX.rowan, BY.windward], [3762, BY.windward]] },
    { name: 'Club Lane', kind: 'minor', pts: [[BX.ave, BY.club], [3728, BY.club]] },
    { name: 'Headland Road', kind: 'minor', pts: [[BX.rowan, BY.headland], [3734, BY.headland]] },
    { name: 'Chapel Road', kind: 'minor', pts: [[BX.rowan, BY.chapel], [BX.edge, BY.chapel]] },
  ],
  specials: [],
  build,
};

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, villas: 0, pools: 0, shops: 0 };
  const W = m.w;
  const tile = (x, y) => m.tiles[y * W + x];
  const used = new Set();
  let vi = 0;
  const vname = (x, y) => {
    for (let t = 0; t < NAMES.length; t++) { const n = NAMES[(Math.floor(rnd(x, y, 500) * NAMES.length) + t) % NAMES.length]; if (!used.has(n)) { used.add(n); return n; } }
    return `Bluffs House ${++vi}`;
  };
  // the beach's edge along a row: the first sand east of the avenue (the Cliff Walk runs along the top of it)
  const sandX = (y) => { for (let x = BX.ave + 8; x < BX.edge; x++) { const t = tile(x, y); if (t === T.SAND || t === T.WATER || t === T.DEEP) return x; } return BX.edge; };
  const WALK = 5;   // (the walk's width)
  const inside = (x, y) => x < sandX(y) - WALK - 1;   // (a lot keeps off the walk and the lawn along it)

  // ---- a villa's art (WC387): warm stucco under terracotta, arched windows, balconies; now and then a modern one in white
  // under a flat roof with its terrace
  const villaArt = (x, y, w) => {
    const r = (k) => rnd(x, y, 520 + k);
    if (r(0) < 0.25) return { spec: { floors: 2, style: 'stucco', wallColor: pick(COOL, r(2)), win: 'tall', parapet: 6, grime: 0.02, roofMat: r(3) < 0.5 ? 'deck' : 'green', lip: 6, rimW: 4, balconies: true, cornice: null, blades: [], plaques: [] },
      noShop: true, kit: [['lounge', Math.round(w * TILE * 0.3), 60], ['umb', Math.round(w * TILE * 0.55), 70], ['plant', 40, 40], ['plant', w * TILE - 40, 40]] };
    return { spec: { floors: r(1) < 0.75 ? 2 : 3, style: 'stucco', wallColor: pick(WARM, r(2)), win: pick(['arch', 'tall', 'pair'], r(3)), pitch: r(4) < 0.7 ? 'hip' : 'gable', roof: 'tile', slope: 0.5, parapet: 4, grime: 0.03, balconies: r(5) < 0.6, cornice: null, blades: [], plaques: [] }, noShop: true, kit: [] };
  };
  const TREES = ['cypress', 'olive', 'cypress', 'magnolia', 'olive'];
  const palm = (x, y, k = 1.15) => prop('palm_a', x, y, 10, { sp: rnd(x, y, 530) < 0.5 ? 'royal' : 'date', k });
  const pool = (px0, py0, pw, ph) => {
    K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
    for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) m.set(xx, yy, T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
    out.pools++;
  };

  // ---- a house on its lot facing the street below: the house against the back, the terrace and the pool in front,
  // the lawn, the drive in from the gate to the garage beside the house, hedges down the sides, the iron railing along
  // the pavement, trees; a home behind its door
  const estates = (x0, x1, y0, y1, o = {}) => {
    const mask = (x, y) => inside(x, y);
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 15) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 3 + Math.floor(rnd(x, y0, 501) * 3), kind: 'garden' };
      const w = Math.min(room, o.w || 16 + Math.floor(rnd(x, y0, 502) * 6)), depth = 11 + Math.floor(rnd(x, y0, 503) * 3);
      const name = vname(x, y0), price = o.price || 60000 + Math.floor(rnd(x, y0, 504) * 5) * 10000;
      return { w, depth, minDepth: 8, arch: 'villa', name, poi: false, whole: true, art: villaArt(x, y0, w), home: { kind: 'house', price, slots: 3, name } };
    }, { north: true, mask });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) yard(b, y1, mask);
    return made;
  };
  // (a lot's sides: out to 3 tiles beside the house, short of a street's pavement)
  const lawnish = (x, y) => { const t = tile(x, y); return t === T.GRASS || t === T.PLAZA || t === T.LOT; };
  const sides = (b, d, y) => { let xl = b.tx - d, xr = b.tx + b.tw + d; while (xl < b.tx && !lawnish(xl, y)) xl++; while (xr > b.tx + b.tw && !lawnish(xr - 1, y)) xr--; return [xl, xr - xl]; };
  const yard = (b, y1, mask) => {
    const yb = b.ty + b.th, [x, w] = sides(b, 3, yb);
    let yf = y1;
    for (let xx = b.tx; xx < b.tx + b.tw; xx++) { const c = K.column(xx, yb, y1, mask); if (c) yf = Math.min(yf, c[0]); }
    const deep = yf - yb + 1;
    out.villas++; out.homes++;
    if (deep < 6) return;
    K.fill(b.tx, yb, b.tw, 2, T.PLAZA);
    for (let yy = yb + 2; yy <= yf; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && mask(xx, yy)) K.take(xx, yy, 1, 1);
    const east = rnd(b.tx, yb, 510) < 0.5, dx = east ? b.tx + b.tw - 3 : b.tx;
    K.paint(dx, yb + 2, 3, deep - 2, T.LOT);
    const home = m.homes.find((h) => h.b === b.id);
    if (home) home.garage = { x: (dx + 1.5) * TILE, y: (yb + 3.5) * TILE, a: Math.PI / 2 };
    const pw = Math.min(b.tw - 6, 9), ph = 4, px0 = east ? b.tx + 1 : b.tx + 4, py0 = yb + 4;
    if (deep >= 12 && pw >= 5) {
      pool(px0, py0, pw, ph);
      for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.2, 0, { v: k + Math.floor(rnd(b.tx, k, 511) * 4), a: -Math.PI / 2 });
      prop(pick(['umbrella_b', 'umbrella_g', 'umbrella_y'], rnd(b.tx, yb, 512)), px0 + pw + 0.2, py0 + ph + 1, 0);
    }
    for (const gx of [dx - 0.3, dx + 3.3]) prop('gatepier', gx, yf + 0.4, 10);
    prop('fenceline', x + 0.2, yf + 0.6, 0, { kind: 'iron', tx: Math.round((dx - 0.6 - x - 0.2) * TILE), ty: 0 });
    prop('fenceline', dx + 3.6, yf + 0.6, 0, { kind: 'iron', tx: Math.round((x + w - 0.2 - dx - 3.6) * TILE), ty: 0 });
    for (const hx of [x + 0.4, x + w - 0.4]) prop('hedgerun', hx, yb - b.th + 1, 0, { tx: 0, ty: Math.round((deep + b.th - 2) * TILE), h: 16 });
    for (let yy = yb + 4; yy < yf - 2; yy += 4) prop('tree_a', east ? dx - 0.6 : dx + 3.6, yy, 10, { sp: 'cypress', k: 1.1 });
    palm(east ? x + 1.5 : x + w - 1.5, yb + 3);
    palm(east ? x + 1.5 : x + w - 1.5, yf - 2, 1.1);
    for (const fx of [b.tx + 1.5, b.tx + b.tw - 1.5]) prop(pick(['flowers_big', 'shrub_a', 'flowers_a'], rnd(fx, yb, 517)), fx, yb + 2.6, 0);
  };
  // ---- a house facing north onto the street above it (its door and drive there): its garden behind it to the south,
  // where the camera sees it - the terrace, the pool, the lawn hedged round, trees
  const backEstates = (x0, x1, y0, y1, o = {}) => {
    const mask = (x, y) => inside(x, y) && (!o.mask || o.mask(x, y));
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 15) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      if (i % 2 === 1) return { gap: 3 + Math.floor(rnd(x, y0, 505) * 3), kind: 'garden' };
      const w = Math.min(room, o.w || 15 + Math.floor(rnd(x, y0, 506) * 6)), depth = 11 + Math.floor(rnd(x, y0, 507) * 2);
      const name = vname(x, y0 + 1), price = o.price || 60000 + Math.floor(rnd(x, y0, 508) * 4) * 10000;
      return { w, depth, minDepth: 8, arch: 'villa', name, poi: false, whole: true, face: 'N', art: villaArt(x, y0 + 1, w), home: { kind: 'house', price, slots: 3, name, garage: { x: (x + w / 2) * TILE, y: (y0 - 2) * TILE, a: -Math.PI / 2 } } };
    }, { north: true, mask });
    for (const b of made) if (b && !b.gap && b.tw !== undefined) {
      out.villas++; out.homes++;
      const yb = b.ty + b.th, [x, w] = sides(b, 2, yb), deep = o.garden || 13;
      for (let yy = yb; yy < yb + deep; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy) && mask(xx, yy)) K.take(xx, yy, 1, 1);
      K.paint(b.tx, yb, b.tw, 2, T.PLAZA);
      const pw = Math.min(b.tw - 4, 9), ph = 4, px0 = b.tx + 2, py0 = yb + 4;
      if (pw >= 5) {
        pool(px0, py0, pw, ph);
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 + ph + 1.2, 0, { v: k + Math.floor(rnd(b.tx, k, 509) * 4), a: -Math.PI / 2 });
        prop(pick(['umbrella_b', 'umbrella_g', 'umbrella_y'], rnd(b.tx, yb, 518)), px0 + pw + 0.4, py0 + 1, 0);
      }
      prop('hedgerun', x + 0.3, yb + deep - 0.6, 0, { tx: Math.round((w - 0.6) * TILE), ty: 0, h: 16 });
      for (const hx of [x + 0.3, x + w - 0.3]) prop('hedgerun', hx, yb, 0, { tx: 0, ty: Math.round((deep - 0.6) * TILE), h: 16 });
      palm(b.tx + b.tw - 1, yb + deep - 3);
      prop('tree_a', b.tx + 1, yb + deep - 3, 10, { sp: pick(TREES, rnd(b.tx, yb, 519)), k: 1.1 });
    }
    return made;
  };

  // ===========================================================================================================
  overlook();
  cliffWalk();
  cove();
  club();
  chapel();
  gate();
  // the houses, block by block (west of the avenue, then east of it to the Cliff Walk)
  const cols = [[BX.rowan, BX.ave], [BX.ave, 3800]];   // (east of the avenue the lots run to Cliff Road)
  estates(BX.rowan, BX.ave, BY.top + 4, BY.seacliff - 1);
  for (const [x0, x1] of cols) {
    estates(x0, x1, BY.seacliff + 1, BY.cormorant - 1);
    estates(x0, x1, BY.cormorant + 1, BY.windward - 1);
    estates(x0, x1, BY.headland + 1, BY.chapel - 1);
  }
  backEstates(BX.rowan, BX.ave, BY.windward + 1, BY.club - 1);
  estates(BX.rowan, BX.ave, BY.club, BY.headland - 1);
  estates(BX.ave, 3800, BY.club + 2, BY.headland - 1);
  backEstates(BX.rowan, BX.edge, BY.chapel + 1, BY.shore - 4, { garden: 12 });
  K.landscape({ grid: 6, bare: 0.4, tree: (x, y, r) => (r < 0.35 ? ['palm_a', pick(['royal', 'date'], rnd(x, y, 89)), 1.1 + rnd(x, y, 93) * 0.2] : r < 0.85 ? ['tree_a', pick(['cypress', 'olive', 'whitePine', 'cypress', 'oak'], rnd(x, y, 90)), 1.05 + rnd(x, y, 91) * 0.25] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 92)), null, 1]) });
  out.named = used.size;
  void api;
  return out;

  // ===========================================================================================================
  // Bluffs Overlook on the point, north of the avenue's turn: the terrace paved out over the sand to its railing, the
  // gazebo, coin telescopes at the corners, benches, lamps, the beds, the sign
  function overlook() {
    const x0 = 3636, x1 = 3678, y0 = 423, y1 = BY.top - 4;
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, t = m.tiles[i];
      if (!m.land[i] || m.bld[i] >= 0 || (t !== T.SAND && t !== T.GRASS && t !== T.PLAZA)) continue;
      if (m.reserve[i] & ~(4 | 16)) continue;
      m.tiles[i] = T.PLAZA; m.reserve[i] |= 16; K.take(x, y, 1, 1); n++;
    }
    if (n < 40) return;
    prop('fenceline', x0 + 0.2, y0 + 0.3, 0, { kind: 'iron', tx: (x1 - x0 - 0.4) * TILE, ty: 0 });
    const cx = (x0 + x1) / 2;
    prop('gazebo', cx, y0 + 5, 30);
    for (const sx of [x0 + 3, x1 - 3]) prop('scope', sx, y0 + 1.6, 6);
    for (const bx of [cx - 9, cx + 9]) prop('bench_m', bx, y0 + 2, 0);
    for (const lx of [x0 + 1, x1 - 1]) prop('lamp', lx, y1 - 0.5, 5, { style: 'iron' });
    for (let k = 0; k < 4; k++) prop('flowers_big', cx - 15 + k * 10, y1 - 1.5, 0);
    prop('textsign', cx, y1 - 1.4, 0, { text: 'BLUFFS OVERLOOK', bg: '#1e3a5e', fg: [240, 236, 220], z: 28, sx: 1 });
    (m.landmarks ||= []).push({ name: 'Bluffs Overlook', type: 'viewpoint', x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0 + 1) * TILE });
    (out.places ||= []).push({ name: 'Bluffs Overlook', x0, y0, x1, y1: y1 + 1 });
  }

  // ===========================================================================================================
  // The Cliff Walk along the top of the east beach: paved, the iron railing at the beach's edge, benches looking out,
  // lamps, coin telescopes, the gazebo halfway, a lawn between it and the gardens
  function cliffWalk() {
    const Y0 = 458, Y1 = 628;
    let laid = 0, rx = -1, ry = -1;   // (the railing: straight runs down the beach's edge, a step across where it moves)
    const rail = (x0, y0, x1, y1) => { if (Math.abs(x1 - x0) + Math.abs(y1 - y0) >= 0.5) prop('fenceline', x0, y0, 0, { kind: 'iron', tx: Math.round((x1 - x0) * TILE), ty: Math.round((y1 - y0) * TILE) }); };
    for (let y = Y0; y < Y1; y++) {
      const sx = sandX(y);
      if (sx >= BX.edge - 2) continue;
      for (let x = sx - WALK; x < sx; x++) { const i = y * W + x; if (K.free(x, y) || (m.tiles[i] === T.GRASS && m.land[i] && !(m.reserve[i] & ~4) && m.bld[i] < 0)) { m.set(x, y, T.PLAZA); m.reserve[i] |= 16; K.take(x, y, 1, 1); laid++; } }
      // (the lawn behind it: kept open)
      for (let x = sx - WALK - 2; x < sx - WALK; x++) if (K.free(x, y)) K.take(x, y, 1, 1);
      const ex = sx - 0.3;
      if (rx < 0) { rx = ex; ry = y; }
      else if (ex !== rx || y - ry >= 12) { rail(rx, ry, rx, y); if (ex !== rx) rail(rx, y, ex, y); rx = ex; ry = y; }
      if (y % 14 === 6) prop('bench_m', sx - 1.2, y + 0.5, 0, { a: 0 });
      if (y % 18 === 0) { let lx = sx - WALK; while (lx < sx - 1 && tile(lx, y) !== T.PLAZA) lx++; if (tile(lx, y) === T.PLAZA) prop('lamp', lx + 0.5, y + 0.5, 5, { style: 'iron' }); }
      if (y === 500 || y === 600) prop('scope', sx - 1, y + 0.5, 6);
    }
    if (rx >= 0) rail(rx, ry, rx, Y1);
    out.walk = laid;
    const gy = 540, gx = sandX(gy) - WALK - 4;
    if (K.free(Math.floor(gx), gy)) prop('gazebo', gx, gy, 30);
    (m.landmarks ||= []).push({ name: 'Cliff Walk', type: 'promenade', x: (sandX(560) - WALK) * TILE, y: Y0 * TILE, w: WALK * TILE, h: (Y1 - Y0) * TILE });
    (out.places ||= []).push({ name: 'Cliff Walk', x0: sandX(560) - WALK - 2, y0: Y0, x1: sandX(560), y1: Y1 });
  }

  // ===========================================================================================================
  // The Bluffs Tennis Club between Windward Lane and Club Lane, east of the avenue: the clubhouse facing its two
  // courts (fenced round), the members' cars along Club Lane, benches, the club's trees
  function club() {
    const x0 = BX.ave + 8, cw = 18, gap = 2;
    const cb = K.building({ x: x0 + 4, y: BY.windward + 5, w: 18, h: 8, arch: 'mixed', key: 'rest2', name: 'The Bluffs Tennis Club', poi: { kind: 'delivery', label: 'The Bluffs Tennis Club' }, whole: true,
      art: { spec: { floors: 2, style: 'siding', wallColor: '#f0ece0', win: 'tall', pitch: 'hip', roof: 'shingle', roofColor: '#2a4a3a', slope: 0.55, parapet: 3, grime: 0.02, balconies: true, blades: [], plaques: [] },
        shop: { kind: 'lobby', door: 'left', open: true, people: 2, sign: { text: 'BLUFFS TENNIS CLUB', bg: '#2a4a3a', fg: [240, 236, 220], lit: true }, awning: ['#2a4a3a', '#f0ece4'] } } });
    if (!cb) return;
    out.shops++;
    const cy0 = cb.ty + cb.th + 3;
    for (let y = cb.ty + cb.th; y < BY.club - 4; y++) for (let x = x0; x < x0 + 2 * cw + gap; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); }
    for (let k = 0; k < 2; k++) {
      const cx = x0 + cw / 2 + k * (cw + gap);
      prop('court', cx, cy0, 0, { w: cw * TILE, d: 11 * TILE, k: 'tennis', c1: '#3a7e86', c2: '#3a6a4e' });
      prop('tnet', cx, cy0 + 5.5, 0, { len: 11 * TILE - 24, a: 0 });
    }
    const fw = 2 * cw + gap + 1;
    prop('chainfence', x0 - 0.5, cy0 - 0.6, 0, { tx: fw * TILE, ty: 0 }); prop('chainfence', x0 - 0.5, cy0 + 11.6, 0, { tx: fw * TILE, ty: 0 });
    prop('chainfence', x0 - 0.5, cy0 - 0.6, 0, { tx: 0, ty: 12.2 * TILE }); prop('chainfence', x0 + fw - 0.5, cy0 - 0.6, 0, { tx: 0, ty: 12.2 * TILE });
    for (const bx of [x0 + 6, x0 + cw + 8]) prop('bench_m', bx, cy0 - 1.6, 0);
    for (let k = 0; k < 4; k++) m.parking.push({ x: Math.round((BX.ave + 10 + k * 4) * TILE), y: Math.round((BY.club - 6) * TILE), a: Math.PI / 2 });
    (out.places ||= []).push({ name: 'The Bluffs Tennis Club', x0, y0: cb.ty, x1: x0 + fw, y1: BY.club });
  }

  // ===========================================================================================================
  // Bluffs Cove below the Cliff Walk's south end (WC387): the timber stairs down from the walk, the beach-shack bar on
  // the sand with its stools, surfboards stuck in the sand, umbrellas and towels, the jetty out into the water with a
  // boat tied up, the sea stacks offshore
  function cove() {
    const sy = 622, sx = sandX(sy);
    if (sx >= BX.edge - 2) return;
    const wet = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
    // the stairs from the walk's south end down onto the sand
    prop('stairs', sx + 0.5, sy, 0, { len: 90, h: 50, w: 28 });
    // the beach-shack bar on the sand a little way along, the boards stuck in the sand, the umbrellas
    const by = 630, bx = sandX(by) + 9;
    if (tile(bx, by) === T.SAND) prop('beachbar', bx, by, 24);
    for (const [dx, dy, v] of [[-5, -1.5, 0], [-6.2, -1.1, 1], [-7.4, -1.7, 2]]) prop('surfboard', bx + dx, by + dy, 0, { v });
    for (let k = 0; k < 4; k++) { const ux = bx + 6 + k * 4.5, uy = by - 3 + (k % 2) * 2; if (tile(Math.floor(ux), Math.floor(uy)) === T.SAND) { prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b'], rnd(k, by, 540)), ux, uy, 0); prop('towel', ux + 1, uy + 0.8, 0, { v: k }); } }
    // the jetty: north from the sand into the bay, two tiles wide, a dinghy tied up alongside, a lamp at its end
    const jx = bx + 16;
    let jy = by; while (jy > 590 && !wet(jx, jy)) jy--;
    let laid = 0;
    if (wet(jx, jy)) for (let y = jy + 1; y > jy - 9; y--) for (const x of [jx, jx + 1]) { const i = y * W + x, t = m.tiles[i]; if (t === T.WATER || t === T.DEEP || t === T.SAND) { m.tiles[i] = T.DOCK; m.reserve[i] |= 16; laid++; } }
    if (laid > 12) { m.marina.push({ x: Math.round((jx + 3.2) * TILE), y: Math.round((jy - 4) * TILE), a: -Math.PI / 2, kind: 'dinghy' }); prop('lamp', jx + 1, jy - 7.5, 0); }
    out.jetty = laid;
    // the sea stacks: out in the bay off the cove
    let st = 0;
    for (const [dx, dy, sz] of [[-6, -18, 64], [10, -24, 48], [26, -16, 80], [40, -26, 56], [18, -36, 72]]) {
      const x = jx + dx, y = jy + dy;
      if (!wet(x, y) || !wet(x - 2, y) || !wet(x + 2, y)) continue;
      prop('outcrop', x + 0.5, y + 0.5, 0, { w: sz + 16, d: sz, h: 46 + (sz % 3) * 14, style: 'basalt', s: x + y }); m.addSolidProp((x + 0.5) * TILE, (y + 0.5) * TILE, Math.round(sz * 0.42)); st++;
    }
    out.stacks = st;
    (m.landmarks ||= []).push({ name: 'Bluffs Cove', type: 'beach', x: (bx - 12) * TILE, y: (jy - 10) * TILE, w: 40 * TILE, h: (by - jy + 14) * TILE });
    (out.places ||= []).push({ name: 'Bluffs Cove', x0: bx - 12, y0: jy - 10, x1: bx + 28, y1: by + 4 });
  }

  // ===========================================================================================================
  // Headland Chapel on Chapel Road above the beach: the white chapel with its steeple facing the road, the path to
  // its door, the lawn round it with its benches looking out, trees
  function chapel() {
    const cw = 12, ch = 16, cx = 3814, cy = BY.chapel - 5 - ch;
    const c = K.building({ x: cx, y: cy, w: cw, h: ch, arch: 'church', key: 'church', name: 'Headland Chapel', poi: { kind: 'delivery', label: 'Headland Chapel' }, whole: true,
      art: { spec: { wallColor: '#ece9e0', roofColor: '#3e4450' } } });
    if (!c) return;
    for (let y = cy + ch; y < BY.chapel - 3; y++) for (let x = cx + 4; x < cx + cw - 4; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); }
    for (let y = cy - 6; y < BY.chapel - 3; y++) for (let x = cx - 10; x < cx + cw + 12; x++) if (K.free(x, y)) K.take(x, y, 1, 1);
    for (const [dx, dy] of [[-6, 4], [cw + 6, 4], [-6, ch - 2], [cw + 6, ch - 2]]) prop('tree_a', cx + dx, cy + dy, 10, { sp: pick(['whitePine', 'oak', 'birch'], rnd(dx + 50, dy + 50, 70)), k: 1.15 });
    for (const bx of [cx - 3, cx + cw + 3]) prop('bench_m', bx, BY.chapel - 4.5, 0);
    prop('flowers_big', cx + 2, cy + ch + 1, 0); prop('flowers_big', cx + cw - 2, cy + ch + 1, 0);
    (out.places ||= []).push({ name: 'Headland Chapel', x0: cx - 10, y0: cy - 6, x1: cx + cw + 12, y1: BY.chapel - 3 });
  }

  // ===========================================================================================================
  // The gate at the avenue's foot on the Shore Road: the stone piers and the sign either side, lamps; Bluffs Market on
  // the corner (the deli and the store, its tables out front)
  function gate() {
    const gy = BY.shore - 7;
    for (const dx of [-6.5, 6.5]) { prop('gatepier', BX.ave + dx, gy, 10); prop('lamp', BX.ave + dx * 1.3, gy + 1, 5, { style: 'iron' }); }
    prop('textsign', BX.ave - 10, gy - 1.2, 0, { text: 'THE BLUFFS', bg: '#1e3a5e', fg: [240, 236, 220], z: 34, sx: 2 });
    const mk = K.building({ x: BX.ave + 7, y: BY.shore - 18, w: 14, h: 9, arch: 'mixed', key: 'conv', name: 'Bluffs Market', poi: { kind: 'convenience', label: 'Bluffs Market' }, whole: true,
      art: { spec: { floors: 1, style: 'siding', wallColor: '#9aa0a4', win: 'even', pitch: 'gable', roof: 'shingle', roofColor: '#3e4450', slope: 0.55, parapet: 3, grime: 0.04, blades: [], plaques: [] },
        shop: { kind: 'mart', door: 'left', open: true, people: 2, sign: { text: 'BLUFFS MARKET', bg: '#2a4a6a', fg: [240, 236, 220], lit: true }, awning: ['#2a4a6a', '#f0ece4'] } } });
    if (mk) {
      out.shops++;
      for (let y = mk.ty + mk.th; y < BY.shore - 4; y++) for (let x = mk.tx - 1; x < mk.tx + mk.tw + 1; x++) if (K.free(x, y)) { m.set(x, y, T.PLAZA); K.take(x, y, 1, 1); }
      for (let k = 0; k < 2; k++) { prop('cafetable', mk.tx + 8 + k * 3.5, mk.ty + mk.th + 1.6, 6); prop('umbrella_b', mk.tx + 8 + k * 3.5, mk.ty + mk.th + 1.4, 0); }
    }
  }
}
