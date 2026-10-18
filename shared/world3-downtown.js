// Downtown, handcrafted (the World v3 Handcraft Plan; the owner's Downtown concepts of 2026-10-17: WC353/354 the bank
// plaza between two glass towers, WC355 the park with its grand axis and the domed tower's plaza, WC356 the circus - the
// round park inside its avenues with the police headquarters, the hotel's fountain drive, the car park; and the
// catalogue's Downtown set, WC323's civic blocks). The glass towers round Greenfield Park, in four bands:
//   - north of the park (Crosstown Avenue to Greenfield Avenue, 6th Street between): towers along 6th Street with the
//     Greenfield Park subway stop's food-truck plaza between them; facing the park across Greenfield Avenue, Greenfield
//     Tower (stone, the city's crown) behind its plaza - two fountains, the steps, the flags - where the park's axis
//     begins, between The Meridian and Halden Tower; the boutiques and the salon at the west end (Vellori's flagship);
//   - Greenfield Park itself, made a circus: the pond in the middle, a ring walk round it under two rings of trees, the
//     four gates' walks in on the axes, the pavilions on the pond's shores, the statue and the long pool on the south
//     axis, a fountain plaza in each corner;
//   - west of the park (Westside Avenue to Park West Avenue): the residential towers, Park West Tower, the Westside
//     car park, the Downtown subway stop's square;
//   - east of the park: the Grand Neon Hotel and its fountain drive (WC356), the towers on 23rd Street;
//   - south of the park (Fountain Avenue to Bayside Avenue): Fountain Square on the park's axis - the long pool and the
//     fountains, The Grand Theatre beside it, the cafe's tables; the bank plaza (WC353/354): First Pixel Bank's domed
//     stone hall, its cash-van bay behind gates, the jeweller on the corner, and the raised plaza with its pool and three
//     jets between Union Trust Tower and Sterling Tower; the police headquarters (WC356, SC2-C) with its walled motor
//     pool and the impound yard; offices and the Civic car park toward Harborview Avenue.
// Every building faces south (the camera); names are invented; draws are fixed by place (hash2). The plan's frame:
// shared/world3-hand.js (a plan of several rects: Downtown's four bands and the park between them).
import { TILE, T } from './constants.js';
import { dsin, dcos } from './dmath.js';

const D = 4;   // Downtown's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles): the grid's avenues kept where they bound the plan; its own streets inside
export const DX = { westside: 2860, maple: 2925, parkW: 2988, axis: 3086, parkE: 3184, civic: 3320, walnut: 3400, harborview: 3480 };
export const DY = { cross: 2300, sixth: 2350, green: 2400, s22: 2489, fountain: 2576, s12: 2654, bayside: 2730 };
// how far a street's pavement reaches from its centre line (tiles): Downtown's wide pavements (shared/roads.js: four
// tiles by an avenue, three by a street)
const EXT = { ave: 8, st: 6 };
// the bands (frame tiles; the park between them is the plan's too: its circus)
const N = [2860, 2300, 3184, 2400], W = [2860, 2400, 2988, 2730], S = [2988, 2576, 3480, 2730], E = [3184, 2400, 3320, 2576], P = [2988, 2400, 3184, 2576];

function streets() {
  const out = [];
  const ew = (name, kind, y, x0, x1) => out.push({ name, kind, pts: [[x0, y], [x1, y]] });
  const ns = (name, kind, x, y0, y1) => out.push({ name, kind, pts: [[x, y0], [x, y1]] });
  ew('6th Street', 'st', DY.sixth, DX.westside, DX.parkE);
  ns('Park West Avenue', 'ave', DX.parkW, DY.cross, DY.green);
  ns('Maple Street', 'st', DX.maple, DY.cross, DY.bayside);
  ew('22nd Street', 'st', DY.s22, DX.westside, DX.parkW);
  ew('Fountain Avenue', 'ave', DY.fountain, DX.westside, DX.parkW);
  ew('12th Street', 'st', DY.s12, DX.westside, DX.harborview);
  ns('Park East Avenue', 'ave', DX.parkE, DY.fountain, DY.bayside);
  ns('Civic Avenue', 'ave', DX.civic, DY.fountain, DY.bayside);
  ns('Walnut Street', 'st', DX.walnut, DY.fountain, DY.bayside);
  ew('23rd Street', 'st', DY.s22, DX.parkE, DX.civic);
  return out;
}

export const DOWNTOWN = {
  key: 'downtown', d: D, rect: [2860, 2300, 3480, 2730], rects: [N, W, S, E, P],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of Downtown: placeSpecials leaves them;
  // Marlow & Finch is Midtown's, by hand)
  specials: ['Metro City PD - HQ', 'First Pixel Bank', 'Grand Neon Hotel', 'The Grand Theatre', 'Vellori', 'Silk & Shears Salon', 'Marlow & Finch'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The towers' looks: blue and green glass, pale stone, warm stone, dark granite; lobbies with their names lit
const GLASS = ['#2a4a6a', '#2e5670', '#284256', '#36606e', '#3a4e66'];
const STONE = ['#ddd2bc', '#d4c8b0', '#c8bca4', '#e2dac6', '#b8b0a2'];
const SIGNS = [['#1e2a3a', [236, 214, 150]], ['#16202c', [240, 236, 220]], ['#2a2420', [236, 200, 140]], ['#f0ece4', [30, 42, 58]]];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const place = (o) => { const b = K.building(o); if (b && o.home) out.homes++; if (b && o.poi) out.shops++; return b; };
  // a tower's art: its floors, its skin, its lobby's name over the door
  const tower = (x, y, o) => {
    const glass = (o.style || 'glass') === 'glass';
    const [bg, fg] = o.signC || pick(SIGNS, rnd(x, y, 1));
    const spec = { floors: o.floors, style: o.style || 'glass', ...(glass ? {} : { wallColor: o.wall || pick(STONE, rnd(x, y, 2)) }), ...(o.tone ? { brickTone: o.tone } : {}),
      win: o.win || (glass ? 'tall' : pick(['tall', 'even', 'pair'], rnd(x, y, 3))), cornice: o.cornice ?? (glass ? null : pick(['dentil', 'step', 'bracket'], rnd(x, y, 4))),
      parapet: o.parapet ?? 12, grime: o.grime ?? 0.04 + rnd(x, y, 5) * 0.06, roofMat: o.roofMat || pick(['gravel', 'membrane', 'paver', 'gravel'], rnd(x, y, 6)), lip: 10, rimW: 5, ...(o.spec || {}) };
    if (glass && o.tint !== false) spec.wallColor = o.tint || pick(GLASS, rnd(x, y, 7));
    const shop = o.shop === false ? null : { kind: o.store || 'lobby', door: o.door || (rnd(x, y, 8) < 0.5 ? 'left' : 'right'), open: true, people: o.people ?? 3, awning: o.awning === undefined ? null : o.awning, sign: { text: (o.sign || o.name).toUpperCase().slice(0, 20), bg, fg, lit: true }, ...(o.grille ? { grille: true } : {}) };
    return { spec, ...(shop ? { shop } : { noShop: true }), ...(o.kit ? { kit: o.kit } : {}) };
  };
  // one tower placed whole: o.x, o.y (its north-west corner), o.w, o.h; its business (a delivery stop by default)
  // (a corner's rounded kerb takes a tile or two off a block's corners: the lot gives up its last rows, then its sides,
  // until it stands on free ground)
  const towerLot = (o) => {
    for (let s = 0; s < 5; s++) for (const [l, r] of [[0, 0], [2, 0], [0, 2], [2, 2], [4, 4]]) {
      const x = o.x + l, w = o.w - l - r, h = o.h - s;
      if (w < 6 || h < 6 || !K.allFree(x, o.y, w, h)) continue;
      return place({ x, y: o.y, w, h, arch: o.arch || ((o.style || 'glass') === 'glass' ? 'glass' : 'office'), ...(o.key ? { key: o.key } : {}), name: o.name,
        poi: o.poi === undefined ? { kind: 'delivery', label: o.name } : o.poi, whole: true, art: tower(x, o.y, o), ...(o.home ? { home: o.home } : {}), ...(o.front ? { front: o.front } : {}) });
    }
    return null;
  };
  // a forecourt in front of a tower (south of it, to the pavement): paving, planters, benches, a lamp or two
  const forecourt = (x, y, w, h, o = {}) => {
    K.fill(x, y, w, h, T.PLAZA);
    for (let k = 0; k < Math.floor(w / 7); k++) prop(pick(['planter_g', 'planter_sq', 'planter_fl'], rnd(x + k, y, 9)), x + 3.5 + k * 7, y + 1.4, 10);
    if (w >= 10) { prop('bench_m', x + 2, y + h - 1.6, 0); prop('bench_m', x + w - 2, y + h - 1.6, 0); }
    if (o.fountain) prop('fountain', x + w / 2, y + h / 2 + 0.5, 36);
    if (o.lamps !== false) { prop('lamp', x + 0.8, y + h - 0.8, 0); prop('lamp', x + w - 0.8, y + h - 0.8, 0); }
  };

  // ===========================================================================================================
  northBand(K, m, { towerLot, tower, place, forecourt, out });
  greenfieldPark(K, m, out);
  westBand(K, m, { towerLot, tower, place, forecourt, out });
  eastBand(K, m, { towerLot, tower, place, forecourt, out });
  southBand(K, m, { towerLot, tower, place, forecourt, out });
  // what the plan left open: lawn with plane trees, maples, magnolias and palms (else the kit's seal paves it)
  K.landscape({ bare: 0.3, tree: (x, y, r) => r < 0.72 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['streetPl', 'maple', 'magnolia', 'streetPl', 'oak'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : r < 0.85 ? ['palm_a', 'royal', 1.15] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 833)), null, 1] });
  dressing(K, m, out);
  void api;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// North of the park: Crosstown Avenue to Greenfield Avenue, 6th Street between
function northBand(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { towerLot, place, forecourt, tower, out } = ctx;
  const nr = [DY.cross + EXT.ave + 1, DY.sixth - EXT.st - 1], sr = [DY.sixth + EXT.st + 1, DY.green - EXT.ave - 1];   // [2309, 2343], [2357, 2391]
  const ca = [DX.westside + EXT.ave + 1, DX.maple - EXT.st], cb = [DX.maple + EXT.st + 1, DX.parkW - EXT.ave], cc = [DX.parkW + EXT.ave + 1, DX.parkE - EXT.ave];   // [x0, x1)
  // the west blocks: an office tower and a deli; the Halcyon Building; on Greenfield Avenue the salon's row and the
  // boutiques - Vellori's flagship, the watchmaker, the patisserie
  towerLot({ x: ca[0], y: nr[0] + 4, w: 26, h: nr[1] - nr[0] - 3, name: 'Westside Tower', floors: 12 });
  K.row(ca[0] + 26, ca[1], nr[0], nr[1], (x, room) => room >= 8 ? { w: room, depth: 16, arch: 'mixed', name: 'Crosstown Deli', poi: { kind: 'coffee', label: 'Crosstown Deli', food: true }, whole: true, art: tower(x, nr[1], { name: 'Crosstown Deli', style: 'stone', floors: 3, store: 'cafe', awning: ['#2f5a4a', '#f0ece4'], win: 'even' }) } : room >= 1 ? { gap: room, kind: 'garden' } : null);
  towerLot({ x: cb[0], y: nr[0] + 2, w: cb[1] - cb[0], h: nr[1] - nr[0] - 1, name: 'Halcyon Building', style: 'stone', floors: 9, wall: '#d8ccb4', cornice: 'dentil', win: 'arch' });
  let k = 0;
  const westShops = [
    { w: 13, name: 'Silk & Shears Salon', sign: 'SILK & SHEARS', store: 'salon', poi: { kind: 'barber', label: 'Silk & Shears Salon' }, awning: ['#2a2420', '#2a2420'] },
    { w: 11, name: 'Cask & Cork', store: 'bar', awning: ['#5a2a2e', '#efe6d0'] },
    { w: 13, name: 'Gilt & Grain', store: 'cafe', poi: { kind: 'coffee', label: 'Gilt & Grain Bakery', food: true }, awning: ['#8a6a2a', '#f0ece4'] },
    { w: 10, name: 'Fernwood Florist', store: 'florist', awning: ['#2f6a4e', '#f0ece4'] },
  ];
  K.row(ca[0], ca[1], sr[0], sr[1], (x, room) => {
    const L = westShops[k++];
    if (!L) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = Math.min(room, L.w);
    return { w, depth: 24, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: tower(x, sr[1], { ...L, style: 'stone', floors: 5, win: 'tall' }), home: { kind: 'apartment' } };
  });
  k = 0;
  const boutiques = [
    { w: 20, name: 'Vellori', store: 'clothes', poi: { kind: 'clothing', label: 'Vellori' }, awning: ['#16202c', '#16202c'], signC: ['#16202c', [236, 214, 150]] },
    { w: 13, name: 'Aurum Watches', store: 'mart', awning: ['#1e2a3a', '#1e2a3a'] },
    { w: 14, name: 'Petit Four', store: 'cafe', poi: { kind: 'coffee', label: 'Petit Four Patisserie', food: true }, awning: ['#c8a0b0', '#f0ece4'] },
  ];
  K.row(cb[0], cb[1], sr[0], sr[1], (x, room) => {
    const L = boutiques[k++];
    if (!L) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    const w = Math.min(room, L.w);
    return { w, depth: 24, arch: 'mixed', name: L.name, poi: L.poi || { kind: 'delivery', label: L.name, walk: true, store: L.store }, whole: true, art: tower(x, sr[1], { ...L, style: 'stone', floors: 4, win: 'arch', wall: '#e2dac6', cornice: 'dentil' }) };
  });
  // the towers on 6th Street, the subway stop's food-truck plaza between them (the stop's kiosk stands at the plaza's
  // foot: shared/world3-subway.js)
  const gap = [DX.axis - 9, DX.axis + 16];
  towerLot({ x: cc[0], y: nr[0] + 2, w: 34, h: nr[1] - nr[0] - 1, name: 'Crosstown Center', floors: 14 });
  towerLot({ x: cc[0] + 36, y: nr[0] + 6, w: gap[0] - cc[0] - 37, h: nr[1] - nr[0] - 5, name: 'Pinnacle House', style: 'stone', floors: 10, wall: '#c8bca4' });
  for (let y = nr[0]; y <= nr[1]; y++) for (let x = gap[0]; x < gap[1]; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
  for (const [k2, fx] of [gap[0] + 3, gap[0] + 10, gap[0] + 18].entries()) prop('foodcart', fx, nr[0] + 6 + (k2 % 2) * 3, 14);
  for (let k2 = 0; k2 < 4; k2++) { prop('cafetable', gap[0] + 4 + k2 * 5, nr[0] + 14, 0); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b'], rnd(k2, gap[0], 10)), gap[0] + 4 + k2 * 5, nr[0] + 13.9, 0); }
  prop('festoon', gap[0] + 1, nr[0] + 11, 0, { tx: Math.round((gap[1] - gap[0] - 2) * TILE), ty: 0, h: 60 });
  for (const tx of [gap[0] + 1.5, gap[1] - 1.5]) prop('tree_a', tx, nr[0] + 20, 10, { sp: 'streetPl', k: 1.1 });
  (out.places ||= []).push({ name: 'Station Plaza', x0: gap[0], y0: nr[0], x1: gap[1], y1: nr[1] });
  towerLot({ x: gap[1] + 1, y: nr[0] + 2, w: 34, h: nr[1] - nr[0] - 1, name: 'Larkspur Tower', floors: 16, tint: '#2e5670' });
  towerLot({ x: gap[1] + 37, y: nr[0] + 6, w: cc[1] - gap[1] - 37, h: nr[1] - nr[0] - 5, name: 'Brightwater Building', style: 'stone', floors: 9, wall: '#d4c8b0' });
  // facing the park: Greenfield Tower behind its plaza on the park's axis (WC355), The Meridian and Corvo House west of
  // it, Halden Tower and Solano House east
  const gw = 31, gx = DX.axis - 15, gh = 22, py0 = sr[0] + gh, px0 = gx - 10, px1 = gx + gw + 10;
  towerLot({ x: gx, y: sr[0], w: gw, h: gh, name: 'Greenfield Tower', style: 'stone', floors: 18, wall: '#e2dac6', cornice: 'step', win: 'tall', parapet: 16, arch: 'office' });
  K.fill(px0, py0, px1 - px0, sr[1] - py0 + 1, T.PLAZA); K.take(px0, py0, px1 - px0, sr[1] - py0 + 1);
  for (const fx of [px0 + 9, px1 - 9]) { prop('fountain', fx, py0 + 6, 36); prop('flowers_big', fx - 4.5, py0 + 6, 0); prop('flowers_big', fx + 4.5, py0 + 6, 0); }
  for (const fx of [px0 + 1.5, px1 - 1.5]) prop('tree_a', fx, py0 + 2, 10, { sp: 'magnolia', k: 1.1 });
  for (let k2 = 0; k2 < 5; k2++) prop('plamp', gx + 4 + k2 * 5.5, py0 + 1.2, 6);
  for (const fx of [DX.axis - 3, DX.axis + 4]) prop('bench_m', fx, sr[1] - 1, 0);
  prop('lamp', px0 + 0.8, sr[1] - 0.6, 0); prop('lamp', px1 - 0.8, sr[1] - 0.6, 0);
  (out.places ||= []).push({ name: 'Greenfield Tower Plaza', x0: px0, y0: py0, x1: px1, y1: sr[1] + 1 });
  towerLot({ x: cc[0], y: sr[0] + 2, w: 30, h: sr[1] - sr[0] - 1, name: 'The Meridian', floors: 12, tint: '#36606e' });
  towerLot({ x: cc[0] + 32, y: sr[0] + 6, w: px0 - cc[0] - 33, h: sr[1] - sr[0] - 5, name: 'Corvo House', style: 'stone', floors: 8 });
  towerLot({ x: px1 + 1, y: sr[0] + 6, w: 30, h: sr[1] - sr[0] - 5, name: 'Halden Tower', floors: 14 });
  towerLot({ x: px1 + 33, y: sr[0] + 2, w: cc[1] - px1 - 33, h: sr[1] - sr[0] - 1, name: 'Solano House', style: 'stone', floors: 9, wall: '#c8bca4' });
  // (what's left in front of the shorter towers: their forecourts)
  for (const [x0, x1] of [[cc[0], px0], [px1, cc[1]], [cc[0], gap[0]], [gap[1], cc[1]]]) for (const [y0, y1] of [sr, nr]) {
    for (let x = x0; x < x1; x++) { const c = K.column(x, y0, y1); if (c && c[0] - c[1] >= 1 && c[0] === y1) for (let y = c[1]; y <= c[0]; y++) K.fill(x, y, 1, 1, T.PLAZA); }
  }
  void forecourt; void place;
}

// ---------------------------------------------------------------------------------------------------------------
// Greenfield Park, the circus (WC356, WC355): the pond in the middle (Greenfield Pond: the skeleton's), the ring walk
// round it under two rings of trees, the gates' walks in on the axes, the pavilions on the pond's shores, the statue and
// the long pool on the south axis, a fountain plaza in each corner, benches and lamps round the ring
function greenfieldPark(K, m, out) {
  const { prop, rnd, pick } = K;
  const x0 = DX.parkW + EXT.ave + 1, x1 = DX.parkE - EXT.ave, y0 = DY.green + EXT.ave + 1, y1 = DY.fountain - EXT.ave;   // [x0, x1) x [y0, y1)
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, RX = 74, RY = 64, CW = 16, CH = 14;
  const e = (x, y) => Math.hypot((x + 0.5 - cx) / RX, (y + 0.5 - cy) / RY);
  const corner = (x, y) => (x < x0 + CW || x >= x1 - CW) && (y < y0 + CH || y >= y1 - CH);
  const diag = (x, y) => { const dx = Math.abs(x + 0.5 - cx), dy = Math.abs(y + 0.5 - cy); return Math.abs(dx * RY - dy * RX) / Math.hypot(RX, RY) < 1.6 && e(x, y) > 1; };
  const paved = (x, y) => Math.abs(e(x, y) - 1) * RY < 2.2 || Math.abs(x + 0.5 - cx) < 3 || Math.abs(y + 0.5 - cy) < 2.5 || corner(x, y) || diag(x, y);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) { K.fill(x, y, 1, 1, paved(x, y) ? T.PLAZA : T.GRASS); n++; }
  if (n < 2000) return;
  const lawn = (x, y, r = 1) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!m.inside(x + dx, y + dy) || m.tiles[m.idx(x + dx, y + dy)] !== T.GRASS) return false; return true; };
  const isW = (x, y) => { const t = m.tiles[m.idx(x, y)]; return t === T.WATER || t === T.DEEP; };
  // the two rings of trees either side of the ring walk: plane trees outside, flowering trees inside
  for (const [f, sp, nk] of [[1.09, 'streetPl', 56], [0.9, 'cherry', 44]]) for (let k = 0; k < nk; k++) {
    const a = (k + 0.5) * 6.2832 / nk, tx = cx + RX * f * dcos(a), ty = cy + RY * f * dsin(a);
    if (!lawn(Math.floor(tx), Math.floor(ty))) continue;
    prop(f > 1 ? 'tree_a' : 'tree_b', tx, ty, 12, { sp: f > 1 ? sp : pick(['cherry', 'magnolia', 'cherry'], rnd(k, nk, 1)), k: 1.15 });
  }
  // lamps and benches round the ring walk, looking in
  for (let k = 0; k < 32; k++) {
    const a = (k + 0.25) * 6.2832 / 32, ca = dcos(a), sa = dsin(a), tx = cx + RX * 1.035 * ca, ty = cy + RY * 1.035 * sa;
    if (Math.abs(tx - cx) < 5 || Math.abs(ty - cy) < 5) continue;
    prop(k % 2 ? 'lamp' : 'bench_m', tx, ty, 0);
  }
  // the groves outside the ring (the corners' lawns) and inside it round the pond
  for (let gy = y0 + 2; gy < y1 - 2; gy += 6) for (let gx = x0 + 2; gx < x1 - 2; gx += 6) {
    const tx = gx + Math.floor(rnd(gx, gy, 2) * 5), ty = gy + Math.floor(rnd(gx, gy, 3) * 5), ee = e(tx, ty);
    if (!lawn(tx, ty, 2) || (ee > 0.84 && ee < 1.17) || rnd(tx, ty, 4) < 0.35) continue;
    let wet = false; for (let d = 1; d <= 4 && !wet; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (isW(tx + dx, ty + dy)) { wet = true; break; }
    if (wet) { if (rnd(tx, ty, 5) < 0.5) prop('tree_b', tx + 0.5, ty + 0.5, 12, { sp: 'willow', k: 1.2 }); continue; }
    prop(rnd(tx, ty, 6) < 0.5 ? 'tree_a' : 'tree_b', tx + 0.5, ty + 0.5, 12, { sp: pick(['oak', 'maple', 'streetPl', 'oak', 'magnolia'], rnd(tx, ty, 7)), k: 1.1 + rnd(tx, ty, 8) * 0.3 });
    if (rnd(tx, ty, 9) < 0.15) prop(pick(['flowers_big', 'shrub_a', 'bush_c'], rnd(tx, ty, 10)), tx + 2, ty + 1.5, 0);
  }
  // the corner plazas: a fountain in each, benches round it, beds at its edges
  for (const [qx, qy] of [[x0, y0], [x1 - CW, y0], [x0, y1 - CH], [x1 - CW, y1 - CH]]) {
    const fx = qx + CW / 2, fy = qy + CH / 2;
    prop('fountain', fx, fy, 36);
    for (const [dx, dy] of [[-5, -2.6], [5, -2.6], [-5, 3.4], [5, 3.4]]) prop('pbench', fx + dx, fy + dy, 0);
    for (const [dx, dy] of [[-6.5, -5], [6.5, -5], [-6.5, 5.5], [6.5, 5.5]]) prop('flowers_big', fx + dx, fy + dy, 0);
    prop('lamp', fx - 7, fy, 0); prop('lamp', fx + 7, fy, 0);
  }
  // where the axes meet the pond: a pavilion on its north shore, a terrace with telescopes on the west, the boathouse's
  // pedal boats on the east; on the south axis the statue and the long pool down to the south gate
  const shore = (x, yFrom, dir) => { for (let y = yFrom; y !== cy; y += dir) if (isW(x, y)) return y; return null; };
  const nShore = shore(Math.floor(cx), y0 + 2, 1), sShore = shore(Math.floor(cx), y1 - 3, -1);
  if (nShore !== null) { prop('gazebo', cx, nShore - 5, 20); prop('textsign', cx, y0 + 1.6, 0, { text: 'GREENFIELD PARK', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 2 }); }
  if (sShore !== null) {
    const top = sShore + 4, bot = y1 - 6;
    prop('statue', cx, top + 2, 14);
    if (bot - top > 14) {
      const px0 = Math.floor(cx) - 2, py0 = top + 6, ph = bot - py0;
      for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + 4; x++) m.set(x, y, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: 4 * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: 6 * TILE, h: (ph + 2) * TILE } });
      for (let k = 0; k < 3; k++) prop('fountain', cx, py0 + 2 + k * (ph - 4) / 2, 0, { s: 0.5 });
    }
  }
  for (const [dx, dy] of [[-1, 0], [1, 0]]) { const tx = Math.floor(cx + dx * 40), ty = Math.floor(cy); for (let x = tx; Math.abs(x - cx) > 2; x -= dx) if (isW(x, ty)) { prop('scope', x + dx * 3, ty - 2, 6); prop('bench_m', x + dx * 5, ty + 2, 0); break; } }
  // the park's place (the generator's park would have given one): its stop for errands
  m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Greenfield Park', x: Math.round(cx * TILE), y: Math.round((y1 - 2) * TILE), r: 48 });
  (out.places ||= []).push({ name: 'Greenfield Park', x0, y0, x1, y1 });
}

// ---------------------------------------------------------------------------------------------------------------
// West of the park: Westside Avenue to Park West Avenue
function westBand(K, m, ctx) {
  const { prop, rnd } = K;
  const { towerLot, forecourt, out } = ctx;
  const ca = [DX.westside + EXT.ave + 1, DX.maple - EXT.st], cb = [DX.maple + EXT.st + 1, DX.parkW - EXT.ave];
  const r1 = [DY.green + EXT.ave + 1, DY.s22 - EXT.st - 1], r2 = [DY.s22 + EXT.st + 1, DY.fountain - EXT.ave - 1], r3 = [DY.fountain + EXT.ave + 1, DY.s12 - EXT.st - 1], r4 = [DY.s12 + EXT.st + 1, DY.bayside - EXT.ave - 1];
  const wa = ca[1] - ca[0], wb = cb[1] - cb[0];
  // Westgate Residences (a tower of flats behind its garden) and Park West Tower over the park
  towerLot({ x: ca[0], y: r1[0] + 2, w: wa, h: 40, name: 'Westgate Residences', arch: 'condo', style: 'stone', wall: '#e8e2d2', floors: 14, win: 'even', home: { kind: 'apartment', price: 42000 }, poi: false });
  towerLot({ x: cb[0], y: r1[0] + 6, w: wb, h: 46, name: 'Park West Tower', floors: 16, tint: '#2a4a6a' });
  forecourt(cb[0], r1[0] + 52, wb, r1[1] - r1[0] - 51);
  // Fountain Court: flats round a courtyard garden; the Greenfield Medical Building
  towerLot({ x: ca[0], y: r2[0] + 2, w: wa, h: 34, name: 'Fountain Court', arch: 'condo', style: 'stone', wall: '#d8ccb4', floors: 8, win: 'pair', home: { kind: 'apartment', price: 36000 }, poi: false });
  towerLot({ x: cb[0], y: r2[0] + 8, w: wb, h: 36, name: 'Greenfield Medical Building', style: 'stone', wall: '#e2dac6', floors: 7, win: 'tall' });
  // the Westside car park: concrete decks, its ramp, the P on its corner; across Maple Street, the Westside Offices
  towerLot({ x: ca[0], y: r3[0] + 4, w: wa, h: r3[1] - r3[0] - 3, name: 'Westside Parking', arch: 'block', style: 'concrete', wall: '#b8b4aa', floors: 5, win: 'loft', sign: 'PARKING', signC: ['#1e3a5e', [250, 250, 240]], poi: { kind: 'delivery', label: 'Westside Parking' } });
  towerLot({ x: cb[0], y: r3[0] + 6, w: wb, h: r3[1] - r3[0] - 5, name: 'Westside Offices', floors: 10, tint: '#284256' });
  // the Downtown subway stop's square (its kiosk: shared/world3-subway.js - on the square's paving), a tower beside it
  {
    const sx1 = ca[0] + 34;
    for (let y = r4[0]; y <= r4[1]; y++) for (let x = ca[0]; x < sx1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, (x - ca[0]) % 11 < 2 || y > r4[1] - 4 || y < r4[0] + 3 ? T.PLAZA : T.GRASS);
    for (let x = ca[0] + 6; x < sx1 - 2; x += 11) for (const y of [r4[0] + 10, r4[0] + 24, r4[0] + 38]) if (y < r4[1] - 6) prop('tree_a', x + 0.5, y, 12, { sp: 'streetPl', k: 1.1 });
    for (let x = ca[0] + 3; x < sx1 - 2; x += 8) prop('bench_m', x, r4[1] - 2, 0);
    towerLot({ x: sx1 + 1, y: r4[0] + 4, w: ca[1] - sx1 - 1, h: r4[1] - r4[0] - 3, name: 'Bayside Tower', style: 'stone', floors: 11, wall: '#c8bca4' });
    (out.places ||= []).push({ name: 'Downtown Square', x0: ca[0], y0: r4[0], x1: sx1, y1: r4[1] });
  }
  towerLot({ x: cb[0], y: r4[0] + 2, w: wb, h: r4[1] - r4[0] - 1, name: 'Ashford Tower', floors: 13, tint: '#3a4e66' });
  void rnd; void prop;
}

// ---------------------------------------------------------------------------------------------------------------
// East of the park: Park East Avenue to Civic Avenue, 23rd Street between - the Grand Neon Hotel and its fountain drive
// (WC356), the towers on 23rd Street
function eastBand(K, m, ctx) {
  const { prop } = K;
  const { towerLot, place, tower, forecourt, out } = ctx;
  const cx0 = DX.parkE + EXT.ave + 1, cx1 = DX.civic - EXT.ave;   // [3193, 3312)
  const r1 = [DY.green + EXT.ave + 1, DY.s22 - EXT.st - 1], r2 = [DY.s22 + EXT.st + 1, DY.fountain - EXT.ave - 1];
  // the hotel: a stone tower, its canopy over the door, the drive round a fountain in front of it to 23rd Street
  const hw = 56, hx = cx0 + Math.floor((cx1 - cx0 - hw) / 2), hh = 44;
  place({ x: hx, y: r1[0], w: hw, h: hh, arch: 'hotel', key: 'hotel', name: 'Grand Neon Hotel', poi: { kind: 'delivery', label: 'Grand Neon Hotel' }, whole: true,
    art: tower(hx, r1[0], { name: 'Grand Neon Hotel', sign: 'GRAND NEON HOTEL', style: 'stone', wall: '#e2dac6', floors: 16, win: 'tall', cornice: 'dentil', store: 'lobby', awning: ['#7a1e2a', '#7a1e2a'], signC: ['#7a1e2a', [255, 214, 140]] }) });
  {
    const dy0 = r1[0] + hh, dy1 = r1[1] + 1, fx = hx + hw / 2, fy = (dy0 + dy1) / 2;
    K.fill(cx0, dy0, cx1 - cx0, dy1 - dy0, T.PLAZA);
    // (the drive: asphalt round the fountain's island, out to the street at both ends)
    for (let y = dy0; y < dy1; y++) for (let x = hx - 6; x < hx + hw + 6; x++) { const d = Math.hypot((x + 0.5 - fx) / 22, (y + 0.5 - fy) / ((dy1 - dy0) / 2)); if (d > 0.45 && d < 1.05) m.set(x, y, T.LOT); }
    prop('fountain', fx, fy, 36); prop('statue', fx, fy - 0.2, 0);
    for (const dx of [-11, 11]) prop('flowers_big', fx + dx * 0.5, fy, 0);
    for (const dx of [-24, 24]) prop('palm_a', fx + dx, fy, 10, { sp: 'royal', k: 1.25 });
    for (const dx of [-14, -7, 7, 14]) prop('plamp', fx + dx, dy0 + 0.6, 6);
    m.parking.push({ x: (fx - 8) * TILE, y: (dy0 + 2.2) * TILE, a: 0, model: 'taxi' }, { x: (fx + 8) * TILE, y: (dy0 + 2.2) * TILE, a: 0, model: 'taxi' });
    (out.places ||= []).push({ name: 'Grand Neon Hotel', x0: hx, y0: r1[0], x1: hx + hw, y1: dy1 });
  }
  // beside it: Park East Tower over the park, Concord House on Civic Avenue
  towerLot({ x: cx0, y: r1[0] + 2, w: hx - cx0 - 1, h: hh - 2, name: 'Park East Tower', floors: 14, tint: '#3a5a72' });
  towerLot({ x: hx + hw + 1, y: r1[0] + 6, w: cx1 - hx - hw - 1, h: hh - 6, name: 'Concord House', style: 'stone', floors: 10, wall: '#d8ccb4', cornice: 'dentil' });
  // south of 23rd Street: two towers either side of a pocket plaza
  towerLot({ x: cx0, y: r2[0] + 4, w: 48, h: r2[1] - r2[0] - 3, name: 'Kestrel Tower', floors: 15, tint: '#2e5670' });
  towerLot({ x: cx1 - 48, y: r2[0] + 2, w: 48, h: r2[1] - r2[0] - 1, name: 'Ellison Building', style: 'stone', floors: 10, wall: '#d4c8b0', cornice: 'step' });
  forecourt(cx0 + 49, r2[0] + 10, cx1 - cx0 - 98, r2[1] - r2[0] - 9, { fountain: true });
  void out;
}

// ---------------------------------------------------------------------------------------------------------------
// South of the park: Fountain Avenue to Bayside Avenue, 12th Street between
function southBand(K, m, ctx) {
  const { prop, rnd, pick } = K;
  const { towerLot, place, tower, forecourt, out } = ctx;
  const rn = [DY.fountain + EXT.ave + 1, DY.s12 - EXT.st - 1], rs = [DY.s12 + EXT.st + 1, DY.bayside - EXT.ave - 1];   // [2585, 2647], [2661, 2721]
  const c1 = [DX.parkW + EXT.ave + 1, DX.parkE - EXT.ave], c2 = [DX.parkE + EXT.ave + 1, DX.civic - EXT.ave], c3 = [DX.civic + EXT.ave + 1, DX.walnut - EXT.st], c4 = [DX.walnut + EXT.st + 1, DX.harborview - EXT.ave];
  // ---- Fountain Square: the park's axis on south across Fountain Avenue to 12th Street (WC355): the long pool, its
  // fountains, the palms and the beds either side; The Grand Theatre west of it, Cafe Fontaine's tables on its east
  // edge, the Orchard Building beyond ----
  {
    const sx0 = DX.axis - 16, sx1 = DX.axis + 18;
    K.fill(sx0, rn[0], sx1 - sx0, rn[1] - rn[0] + 1, T.PLAZA); K.take(sx0, rn[0], sx1 - sx0, rn[1] - rn[0] + 1);
    const px0 = DX.axis - 3, pw = 8, py0 = rn[0] + 6, ph = rn[1] - rn[0] - 16;
    for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) m.set(x, y, T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
    for (let k = 0; k < 4; k++) prop('fountain', px0 + pw / 2, py0 + 3 + k * (ph - 6) / 3, 0, { s: 0.6 });
    prop('fountain', px0 + pw / 2, rn[1] - 4, 36);
    for (const dx of [-9, 10]) for (let y = py0 + 2; y < py0 + ph; y += 7) prop('palm_a', DX.axis + dx, y, 10, { sp: 'royal', k: 1.2 });
    for (const dx of [-12.5, 13.5]) for (let y = py0 + 5; y < py0 + ph; y += 7) prop('flowers_big', DX.axis + dx, y, 0);
    for (const dx of [-6, 7]) for (let y = py0 + 4; y < py0 + ph; y += 9) prop('bench_m', DX.axis + dx, y, 0);
    prop('textsign', DX.axis + 0.5, rn[0] + 1.6, 0, { text: 'FOUNTAIN SQUARE', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 2 });
    K.m.squares ||= []; K.m.squares.push({ x: DX.axis - 6, y: rn[1] - 10, w: 12, h: 10, name: 'Fountain Square' });
    (out.places ||= []).push({ name: 'Fountain Square', x0: sx0, y0: rn[0], x1: sx1, y1: rn[1] + 1 });
    place({ x: c1[0], y: rn[0] + 4, w: 40, h: rn[1] - rn[0] - 3, arch: 'theatre', key: 'theatre', name: 'The Grand Theatre', poi: { kind: 'delivery', label: 'The Grand Theatre' }, whole: true });
    for (let y = rn[0]; y < rn[0] + 4; y++) for (let x = c1[0]; x < c1[0] + 40; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.GRASS);
    K.row(c1[0] + 41, sx0, rn[0], rn[1], (x, room) => room >= 10 ? { w: room, depth: 30, arch: 'mixed', name: 'Opera Bar', poi: { kind: 'delivery', label: 'Opera Bar' }, whole: true, art: tower(x, rn[1], { name: 'Opera Bar', style: 'stone', floors: 4, store: 'bar', awning: ['#5a2a2e', '#efe6d0'], win: 'arch', wall: '#d8ccb4' }), home: { kind: 'apartment' } } : room >= 1 ? { gap: room, kind: 'garden' } : null);
    place({ x: sx1 + 1, y: rn[1] - 17, w: 18, h: 18, arch: 'mixed', key: 'rest2', name: 'Cafe Fontaine', poi: { kind: 'coffee', label: 'Cafe Fontaine', food: true }, whole: true, art: tower(sx1 + 1, rn[1], { name: 'Cafe Fontaine', style: 'stone', floors: 3, store: 'cafe', awning: ['#2f6a5a', '#f0ece4'], wall: '#e8e2d2', win: 'arch' }) });
    for (let k = 0; k < 4; k++) { prop('cafetable', sx1 - 2, rn[0] + 8 + k * 7, 0); prop(k % 2 ? 'umbrella_g' : 'umbrella_r', sx1 - 2, rn[0] + 7.9 + k * 7, 0); }
    towerLot({ x: sx1 + 21, y: rn[0] + 2, w: c1[1] - sx1 - 21, h: rn[1] - rn[0] - 1, name: 'Orchard Building', floors: 12, tint: '#36606e' });
  }
  // ---- south of 12th Street, Park West to Park East: the police headquarters (WC356, SC2-C) - the stone HQ on
  // Bayside Avenue, its motor pool beside it (shared/map.js buildMotorPools walls it and puts the cruisers in), the
  // impound yard behind them; the Ledger Building on the corner ----
  {
    const hw = 46, hx = c1[0] + 30, hd = 26, hy = rs[1] - hd + 1;
    place({ x: hx, y: hy, w: hw, h: hd, arch: 'police', key: 'police', name: 'Metro City PD - HQ', poi: { kind: 'police', label: 'Metro City PD - HQ', hq: true }, front: 4, whole: true,
      art: { spec: { floors: 5, style: 'stone', wallColor: '#cfc6b2', win: 'tall', cornice: 'dentil', parapet: 14, grime: 0.08, roofMat: 'gravel', lip: 10, rimW: 5 } } });
    place({ x: hx + hw + 1, y: hy + 4, w: 26, h: hd - 4, name: 'Motor Pool', roof: 'tar', poi: false });
    // the impound yard behind: asphalt behind chain-link, the towed cars in rows, the yard's hut
    const iy0 = rs[0], iy1 = hy - 1, ix0 = hx, ix1 = hx + hw + 27;
    if (iy1 - iy0 >= 10) {
      K.fill(ix0, iy0, ix1 - ix0, iy1 - iy0, T.LOT); K.take(ix0, iy0, ix1 - ix0, iy1 - iy0);
      prop('chainfence', ix0 + 0.2, iy0 + 0.2, 0, { tx: (ix1 - ix0 - 0.4) * TILE, ty: 0 });
      prop('chainfence', ix0 + 0.2, iy0 + 0.2, 0, { tx: 0, ty: (iy1 - iy0 - 0.4) * TILE });
      prop('chainfence', ix1 - 0.2, iy0 + 0.2, 0, { tx: 0, ty: (iy1 - iy0 - 0.4) * TILE });
      for (let sx = ix0 + 2; sx + 3 <= ix1 - 2; sx += 4) { m.stalls.push({ x: sx * TILE, y: (iy0 + 2) * TILE, w: 3 * TILE, h: 5 * TILE }); m.parking.push({ x: (sx + 1.5) * TILE, y: (iy0 + 4.5) * TILE, a: Math.PI / 2 }); }
      prop('textsign', ix0 + 6, iy0 + 1.4, 0, { text: 'CITY IMPOUND', bg: '#1e2a3a', fg: [240, 236, 220], z: 34, sx: 1 });
      (out.places ||= []).push({ name: 'City Impound', x0: ix0, y0: iy0, x1: ix1, y1: iy1 });
    }
    for (let k = 0; k < 4; k++) prop('plamp', hx + 10 + k * 8, rs[1] - 1.2, 6);
    (out.places ||= []).push({ name: 'Police Headquarters', x0: hx, y0: hy, x1: hx + hw + 27, y1: rs[1] + 1 });
    towerLot({ x: c1[0], y: rs[0] + 2, w: 28, h: rs[1] - rs[0] - 1, name: 'Ledger Building', style: 'stone', floors: 10, wall: '#c8bca4', cornice: 'step' });
    const fx0 = hx + hw + 29, fw = Math.floor((c1[1] - fx0) / 2);
    towerLot({ x: fx0, y: rs[0] + 4, w: fw - 1, h: rs[1] - rs[0] - 3, name: 'Fairmont Tower', floors: 13, tint: '#2a4a6a' });
    towerLot({ x: fx0 + fw, y: rs[0] + 20, w: c1[1] - fx0 - fw, h: rs[1] - rs[0] - 19, name: 'Bayside Arcade', arch: 'mixed', style: 'stone', wall: '#e2dac6', floors: 3, win: 'arch', cornice: 'dentil', store: 'mart', awning: ['#1e2a3a', '#f0ece4'], poi: { kind: 'delivery', label: 'Bayside Arcade', walk: true, store: 'mart' } });
  }
  // ---- the bank plaza (WC353/354): Union Trust Tower and Sterling Tower on their stone podiums, the raised plaza
  // between them - the long pool with its three jets, tables under umbrellas; in front, First Pixel Bank's domed stone
  // hall and its cash-van bay behind the gates (the armoured vans), and Brilliant & Co. on the corner ----
  {
    const tw = 34, ty0 = rn[0], th = 34;
    towerLot({ x: c2[0], y: ty0, w: tw, h: th, name: 'Union Trust Tower', floors: 18, tint: '#2a4a6a', kit: [['heli', Math.round(tw * TILE / 2), Math.round(th * TILE / 2)], ['ac', 60, 60], ['ac', tw * TILE - 80, 60]] });
    towerLot({ x: c2[1] - tw, y: ty0, w: tw, h: th, name: 'Sterling Tower', floors: 16, tint: '#36606e' });
    const qx0 = c2[0] + tw, qx1 = c2[1] - tw;
    K.fill(qx0, ty0, qx1 - qx0, th, T.PLAZA); K.take(qx0, ty0, qx1 - qx0, th);
    const pw = qx1 - qx0 - 12, px0 = qx0 + 6, py0 = ty0 + 8;
    for (let y = py0; y < py0 + 8; y++) for (let x = px0; x < px0 + pw; x++) m.set(x, y, T.WATER);
    (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: 8 * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: 10 * TILE } });
    for (let k = 0; k < 3; k++) prop('fountain', px0 + pw * (k + 1) / 4, py0 + 4, 0, { s: 0.7 });
    for (let k = 0; k < Math.floor(pw / 6); k++) { prop('cafetable', px0 + 3 + k * 6, py0 + 12, 0); prop(k % 2 ? 'umbrella_b' : 'umbrella_g', px0 + 3 + k * 6, py0 + 11.9, 0); }
    for (const fx of [qx0 + 2, qx1 - 2]) for (let y = ty0 + 3; y < ty0 + th - 2; y += 8) prop('tree_a', fx, y, 10, { sp: 'streetPl', k: 1.05, grate: true });
    prop('textsign', (qx0 + qx1) / 2, ty0 + th - 1.4, 0, { text: 'STERLING PLAZA', bg: '#1e2a3a', fg: [240, 236, 220], z: 30, sx: 1 });
    (out.places ||= []).push({ name: 'Sterling Plaza', x0: qx0, y0: ty0, x1: qx1, y1: ty0 + th });
    // the bank, its van bay, the jeweller
    const by0 = ty0 + th + 1, bw = 36;
    place({ x: c2[0], y: by0, w: bw, h: rn[1] - by0 + 1, arch: 'bank', key: 'bank', name: 'First Pixel Bank', poi: { kind: 'bank', label: 'First Pixel Bank' }, whole: true,
      art: { spec: { floors: 3, style: 'stone', wallColor: '#ddd2bc', win: 'tall', cornice: 'dentil', parapet: 14, grime: 0.05, roofMat: 'green', lip: 10, rimW: 5, date: '1911' } } });
    const vx0 = c2[0] + bw + 1, vx1 = vx0 + 18;
    K.fill(vx0, by0, vx1 - vx0, rn[1] - by0 + 1, T.LOT); K.take(vx0, by0, vx1 - vx0, rn[1] - by0 + 1);
    m.parking.push({ x: (vx0 + 5) * TILE, y: (by0 + 5) * TILE, a: Math.PI / 2, model: 'armored' }, { x: (vx0 + 12) * TILE, y: (by0 + 5) * TILE, a: Math.PI / 2, model: 'armored' });
    prop('ygate', vx0 + 9, rn[1] - 0.4, 0, { a: 0 });
    prop('chainfence', vx0 + 0.2, by0 + 0.2, 0, { tx: 0, ty: (rn[1] - by0 + 0.4) * TILE });
    prop('chainfence', vx1 - 0.2, by0 + 0.2, 0, { tx: 0, ty: (rn[1] - by0 + 0.4) * TILE });
    prop('textsign', vx0 + 9, by0 + 1.4, 0, { text: 'SECURE LOADING', bg: '#1e2a3a', fg: [236, 200, 120], z: 28, sx: 1 });
    (out.places ||= []).push({ name: 'First Pixel Bank', x0: c2[0], y0: by0, x1: vx1, y1: rn[1] + 1 });
    let jw = 0;
    K.row(vx1 + 1, c2[1], by0, rn[1], (x, room) => room >= 10 && !jw++ ? { w: Math.min(room, 22), depth: rn[1] - by0 + 1, arch: 'mixed', name: 'Brilliant & Co.', poi: { kind: 'delivery', label: 'Brilliant & Co. Jewelers', walk: true, store: 'mart' }, whole: true,
      art: tower(x, rn[1], { name: 'Brilliant & Co.', sign: 'BRILLIANT & CO.', style: 'stone', wall: '#2a2a30', floors: 3, store: 'mart', awning: ['#16202c', '#16202c'], signC: ['#16202c', [236, 214, 150]], win: 'arch' }) } : room >= 1 ? { gap: room, kind: 'plaza' } : null);
  }
  // south of 12th Street, Park East to Civic: offices round a fountain court
  towerLot({ x: c2[0], y: rs[0] + 2, w: 40, h: rs[1] - rs[0] - 1, name: 'Commerce Tower', floors: 14, tint: '#284256' });
  towerLot({ x: c2[1] - 40, y: rs[0] + 4, w: 40, h: rs[1] - rs[0] - 3, name: 'Harlow Building', style: 'stone', floors: 9, wall: '#d4c8b0', cornice: 'dentil' });
  forecourt(c2[0] + 41, rs[0] + 14, c2[1] - c2[0] - 82, rs[1] - rs[0] - 13, { fountain: true });
  // ---- Civic Avenue to Harborview Avenue: the Civic car park (WC356's spiral ramp: the concrete decks, the round ramp
  // on its corner), offices and the Grand Neon Residences ----
  towerLot({ x: c3[0], y: rn[0] + 2, w: c3[1] - c3[0], h: rn[1] - rn[0] - 1, name: 'Civic Parking', arch: 'block', style: 'concrete', wall: '#b8b4aa', floors: 6, win: 'loft', sign: 'PARKING', signC: ['#1e3a5e', [250, 250, 240]], poi: { kind: 'delivery', label: 'Civic Parking' } });
  {
    const hw4 = Math.floor((c4[1] - c4[0]) / 2);
    towerLot({ x: c4[0], y: rn[0] + 6, w: hw4 - 1, h: rn[1] - rn[0] - 5, name: 'Walnut Street Offices', style: 'stone', floors: 8, wall: '#c8bca4' });
    towerLot({ x: c4[0] + hw4, y: rn[0] + 2, w: c4[1] - c4[0] - hw4, h: rn[1] - rn[0] - 1, name: 'Calder Tower', floors: 12, tint: '#284256' });
  }
  towerLot({ x: c3[0], y: rs[0] + 4, w: c3[1] - c3[0], h: rs[1] - rs[0] - 3, name: 'Grand Neon Residences', arch: 'condo', style: 'stone', wall: '#e8e2d2', floors: 12, win: 'even', home: { kind: 'apartment', price: 48000 }, poi: false });
  towerLot({ x: c4[0], y: rs[0] + 2, w: c4[1] - c4[0], h: rs[1] - rs[0] - 1, name: 'Harborview Tower', floors: 15, tint: '#2e5670' });
  void rnd; void pick;
}

// The streets' furniture: plane trees in grates along every pavement, the lamps, a bus stop on each avenue by the park
function dressing(K, m, out) {
  const { prop, rnd } = K;
  const onWalk = (x, y) => m.inside(Math.floor(x), Math.floor(y)) && m.tiles[m.idx(Math.floor(x), Math.floor(y))] === T.SIDEWALK;
  const X0 = 2860, X1 = 3480, Y0 = 2300, Y1 = 2730;
  // (along the east-west streets: a tree every 9 tiles on both pavements, kept clear of the corners)
  for (const [y, ext] of [[DY.cross, EXT.ave], [DY.sixth, EXT.st], [DY.green, EXT.ave], [DY.s22, EXT.st], [DY.fountain, EXT.ave], [DY.s12, EXT.st], [DY.bayside, EXT.ave]]) for (const sy of [-1, 1]) for (let x = X0 + 12; x < X1 - 10; x += 9) {
    if (Object.values(DX).some((c) => Math.abs(x - c) < 11)) continue;
    const ty = y + sy * (ext - 1) + 0.5;
    if (onWalk(x + 0.5, ty) && onWalk(x + 0.5, ty - sy) && rnd(x, ty, 1) < 0.85) prop('tree_a', x + 0.5, ty, 10, { sp: 'streetPl', k: 1.05, grate: true });
  }
  for (const [x, y] of [[DX.axis + 22, DY.green - EXT.ave + 1], [DX.axis - 20, DY.fountain + EXT.ave - 1], [DX.parkW - EXT.ave + 1, 2470], [DX.parkE + EXT.ave - 1, 2520]]) if (onWalk(x, y)) prop('busstop', x, y, 0);
  void Y0; void Y1; out.dressed = true;
}
