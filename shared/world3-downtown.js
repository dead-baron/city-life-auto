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
import { TILE, T, PITCH_LONG } from './constants.js';
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

// The towers' kit, shared with the Civic Center (shared/world3-civic.js): place (a building, counted), tower (a tower's
// art), towerLot (a tower placed whole, shrinking to fit a kerb's corner), forecourt (paving, planters, benches)
export function towerKit(K, out) {
  const { rnd, pick, prop } = K;
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
        poi: o.poi === undefined ? { kind: 'delivery', label: o.name } : o.poi, whole: true, art: o.art || tower(x, o.y, o), ...(o.home ? { home: o.home } : {}), ...(o.front ? { front: o.front } : {}), ...(o.door !== undefined && typeof o.door === 'number' ? { door: o.door } : {}) });
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
  return { place, tower, towerLot, forecourt };
}

function build(m, api, K) {
  const { rnd, pick } = K;
  const out = { homes: 0, shops: 0 };
  const { place, tower, towerLot, forecourt } = towerKit(K, out);

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
  towerLot({ x: cb[0], y: nr[0] + 2, w: cb[1] - cb[0], h: nr[1] - nr[0] - 1, name: 'Halcyon Building', style: 'stone', floors: 9, wall: '#d8ccb4', cornice: 'dentil', win: 'arch', roofMat: 'green' });
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
  towerLot({ x: cc[0], y: sr[0] + 2, w: 30, h: sr[1] - sr[0] - 1, name: 'The Meridian', floors: 12, tint: '#36606e', roofMat: 'green' });
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
// Greenfield Park (the owner's park concepts WC417, WC418, WC424: the prompt Greenfield-A1). Greenfield Pond in the
// middle (the skeleton's lake) with two wooded islands, footbridges out to them and between them, a gazebo on the east
// one; the boathouse and its rowing boats on the west shore; the north gate's statue fountain; the soccer pitch with its
// covered stand in the north-west (the soccer mini-game's: m.venues), two tennis courts and two basketball courts
// in the north-east; the bandstand on the east lawn; the allotments with their greenhouse and shed in the south-east; the
// iron main gates on the south avenue. Winding paths: a loop round the park inside its railings, the ring round the
// pond, the ways in from the four gates. Picnic lawns, willows by the water, groves of oaks, maples, plane trees,
// cherries and a few palms.
function greenfieldPark(K, m, out) {
  const { prop, rnd, pick } = K;
  const x0 = DX.parkW + EXT.ave + 1, x1 = DX.parkE - EXT.ave, y0 = DY.green + EXT.ave + 1, y1 = DY.fountain - EXT.ave;   // [x0, x1) x [y0, y1)
  const W = x1 - x0, H = y1 - y0, AX = DX.axis + 0.5, MY = 2483;
  const at = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const isW = (x, y) => { const t = at(x, y); return t === T.WATER || t === T.DEEP; };
  const inPark = (x, y) => x >= x0 && y >= y0 && x < x1 && y < y1;
  // ---- the pond reshaped (the skeleton's is a rounded box): a big west lobe round the islands, an arm reaching north-east,
  // a bay to the south - its shore wavering. Land made from water and water from land keep the map's layers in step.
  const c0 = m.idx(3088, 2483), lakeV = m.lake ? m.lake[c0] : 0, riverV = m.river ? m.river[c0] : 0, wetD = m.dist[c0], dryD = m.dist[m.idx(x0 + 2, y0 + 2)];
  const setWet = (x, y, wet) => {
    const i = m.idx(x, y);
    m.land[i] = wet ? 0 : 1; if (m.lake) m.lake[i] = wet ? lakeV : 0; if (m.river) m.river[i] = wet ? riverV : 0; m.dist[i] = wet ? wetD : dryD;
    m.tiles[i] = wet ? T.WATER : T.GRASS;
  };
  // (the old pond's waterfront strip - the generator's band kept clear round it, drawn as boardwalk where it's paved - is
  // the park's own ground now)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.reserve[m.idx(x, y)] &= ~4;
  const LOBES = [[3074, 2486, 36, 28, 0.3], [3112, 2470, 28, 18, 1.9], [3104, 2503, 18, 12, 4.1]];
  const pondAt = (x, y) => LOBES.some(([cx, cy, rx, ry, ph]) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx); return dx * dx + dy * dy < 1 + 0.07 * Math.sin(a * 3 + ph) + 0.05 * Math.sin(a * 7 + ph * 2); });
  for (let y = 2440; y < 2526; y++) for (let x = 3026; x < 3152; x++) {
    if (!inPark(x, y)) continue;
    const w = pondAt(x, y), was = isW(x, y);
    if (w && !was && at(x, y) === T.GRASS && !m.reserve[m.idx(x, y)]) setWet(x, y, true);
    else if (!w && was) setWet(x, y, false);
  }
  for (let y = 2440; y < 2526; y++) for (let x = 3026; x < 3152; x++) {   // (deep out from the shore)
    if (!isW(x, y)) continue;
    let deep = true; for (let dy = -4; dy <= 4 && deep; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 16 && !isW(x + dx, y + dy)) { deep = false; break; }
    m.tiles[m.idx(x, y)] = deep ? T.DEEP : T.WATER;
  }
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) n++;   // (free: open grass - the kit's fill would claim it)
  if (n < 2000) return;
  // (the boathouse first: the kit's buildings want free ground, and the park takes the rest)
  const shore = (y) => { let x = x0 + 8; while (x < AX && !isW(x, y)) x++; return x; };   // (the pond's west shore on row y)
  const sx = shore(MY), bw = 14, bh = 8, by = MY + 3, JY = by + 3;
  let bs = AX; for (let y = by - 1; y <= by + bh; y++) bs = Math.min(bs, shore(y));
  const bx = bs - bw - 2;
  const boat = K.building({ x: bx, y: by, w: bw, h: bh, arch: 'pavilion', name: 'Greenfield Boathouse', poi: { kind: 'coffee', label: 'Boathouse Cafe' }, whole: true,
    art: { spec: { floors: 1, style: 'clapboard', wallColor: '#e8e2d2', pitch: true, slope: 0.6, roofColor: '#3e6a50' }, shop: { kind: 'cafe', door: 'right', open: true, people: 3, awning: ['#2f6a4e', '#f0ece4'], sign: { text: 'BOATHOUSE', bg: '#2f6a4e', fg: [240, 232, 200], lit: true } } } });
  K.take(x0, y0, W, H);
  const pave = (x, y, t = T.PLAZA) => { if (inPark(x, y) && at(x, y) === T.GRASS) K.paint(x, y, 1, 1, t); };
  const path = (pts, wd = 3, t = T.PLAZA) => {
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], k = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let i = 0; i <= k; i++) { const px = ax + ((bx - ax) * i) / k, py = ay + ((by - ay) * i) / k; for (let dy = -wd / 2; dy < wd / 2; dy += 0.5) for (let dx = -wd / 2; dx < wd / 2; dx += 0.5) pave(Math.floor(px + dx), Math.floor(py + dy), t); }
    }
  };
  // a wandering line from a to b: the straight way with a gentle sway (deterministic: by its ends)
  const wander = (ax, ay, bx, by, amp = 3) => { const pts = [], k = 8, L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L, ny = (bx - ax) / L, ph = rnd(ax, ay, 1) * 6.28; for (let i = 0; i <= k; i++) { const u = i / k, w = Math.sin(u * Math.PI) * Math.sin(u * 6.28 + ph) * amp; pts.push([ax + (bx - ax) * u + nx * w, ay + (by - ay) * u + ny * w]); } return pts; };
  // ---- the pond's islands (two, wooded, rock-edged) and the footbridges: west shore -> the west island -> the east one
  const ISL = [{ cx: 3066, cy: 2481, rx: 9, ry: 7 }, { cx: 3106, cy: 2483, rx: 8, ry: 6 }], isle = new Set();
  for (const I of ISL) for (let y = I.cy - I.ry; y <= I.cy + I.ry; y++) for (let x = I.cx - I.rx; x <= I.cx + I.rx; x++) {
    const q = ((x + 0.5 - I.cx) / I.rx) ** 2 + ((y + 0.5 - I.cy) / I.ry) ** 2;
    if (q <= 1 && isW(x, y)) { setWet(x, y, false); isle.add(m.idx(x, y)); }
  }
  // (an arched stone footbridge east-west over the water: from land at xa, the way dir, to the next land; its deck two
  // tiles wide on rows y and y + 1)
  const bridge = (xa, y, dir) => {
    let a = xa; while (inPark(a, y) && !isW(a, y)) a += dir;
    let b = a; while (inPark(b + dir, y) && isW(b + dir, y) && isW(b + dir, y + 1)) b += dir;
    if (!inPark(b + dir, y) || Math.abs(b - a) > 30) return;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    for (let x = lo; x <= hi; x++) for (const yy of [y, y + 1]) if (isW(x, yy)) m.set(x, yy, T.DOCK);
    prop('archbridge', (lo + hi + 1) / 2, y + 1, 0, { len: (hi - lo + 1) * TILE, a: 0 });
  };
  bridge(ISL[0].cx, MY - 1, -1);          // the west shore to the west island: the way in from Park West Avenue
  bridge(ISL[0].cx, ISL[0].cy, 1);        // the west island to the east one
  // ---- the paths: the ring round the pond (3 tiles out from the water), the loop inside the railings, the ways in
  const dist = new Map(), ring = [];   // (tiles' distance from the water, out to 7: a breadth-first spread)
  let front = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isW(x, y)) { dist.set(m.idx(x, y), 0); front.push([x, y]); }
  for (let d = 1; d <= 7; d++) { const next = []; for (const [x, y] of front) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = [x + dx, y + dy]; if (!inPark(q[0], q[1])) continue; const k = m.idx(q[0], q[1]); if (!dist.has(k)) { dist.set(k, d); next.push(q); if (d >= 4 && d <= 6) ring.push(q); } } front = next; }
  for (const [x, y] of ring) if (!isle.has(m.idx(x, y))) pave(x, y);
  const R = 9;   // (the loop: a rounded rectangle 4 tiles in from the railings)
  const rr = (x, y) => { const qx = Math.max(Math.abs(x + 0.5 - (x0 + x1) / 2) - (W / 2 - 4 - R), 0), qy = Math.max(Math.abs(y + 0.5 - (y0 + y1) / 2) - (H / 2 - 4 - R), 0); return Math.hypot(qx, qy) - R; };
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const d = rr(x, y); if (d > -1.5 && d <= 1.5 && at(x, y) === T.GRASS) pave(x, y); }
  path(wander(AX, y0, AX, 2446, 2), 4);              // the north gate down to the pond
  path(wander(AX, y1, AX, 2516, 2), 4);              // the main gate up to the pond
  path(wander(x0, MY - 0.5, sx - 1, MY - 0.5, 2), 3);  // in from Park West Avenue to the bridge out to the island
  path(wander(x1, MY, 3146, MY, 2), 3);              // in from Park East Avenue past the bandstand
  path(wander(3044, 2524, 3008, y1 - 6, 5), 3);      // across the south-west lawn
  path(wander(3136, 2522, 3152, 2446, 5), 3);        // between the courts and the bandstand
  // ---- the north gate: its statue fountain on a round plaza, beds round it
  const F = [AX, y0 + 10];
  for (let y = F[1] - 8; y <= F[1] + 8; y++) for (let x = Math.floor(F[0] - 10); x <= F[0] + 10; x++) if (((x + 0.5 - F[0]) / 9.5) ** 2 + ((y + 0.5 - F[1]) / 7.5) ** 2 <= 1) pave(x, y);
  prop('fountain', F[0], F[1], 36); prop('statue', F[0], F[1] - 0.3, 0);
  for (const [dx, dy] of [[-5.5, -3], [5.5, -3], [-6, 3.4], [6, 3.4]]) prop('pbench', F[0] + dx, F[1] + dy, 0);
  for (const [dx, dy] of [[-8.6, 0], [8.6, 0], [-4, -6.4], [4, -6.4]]) prop('flowers_big', F[0] + dx, F[1] + dy, 0);
  K.m.squares ||= []; K.m.squares.push({ x: Math.round(F[0]) - 6, y: F[1] - 5, w: 12, h: 10, name: 'Greenfield Fountain' });
  // ---- the soccer pitch in the north-west: turf in chain-link, the covered stand along its north side, floodlights
  {
    // (a pitch's shape: half as long again as it's wide, like a real one - it ran 53 x 25 across the park's whole
    // north-west, twice as long as wide; the owner, 10-16: "Soccer fields are far too long: make them normal size".
    // In the middle of where it was, the ends grass)
    const py0 = y0 + 9, py1 = 2443, len = Math.round((py1 - py0) * PITCH_LONG), mid = (x0 + 6 + 3056) / 2, px0 = Math.round(mid - len / 2), px1 = px0 + len;
    K.paint(px0 - 2, py0 - 6, px1 - px0 + 4, py1 - py0 + 8, T.GRASS);
    m.venues.push({ id: m.venues.length, kind: 'soccer', name: 'Greenfield Park Pitch', rect: { x: px0 * TILE, y: py0 * TILE, w: (px1 - px0) * TILE, h: (py1 - py0) * TILE }, goalW: 5 * TILE });
    prop('bleachers', (px0 + px1) / 2, py0 - 3.4, 10, { len: Math.round((px1 - px0 - 16) * TILE / 2), rows: 4 });
    prop('festoon', px0 + 8, py0 - 5.6, 0, { tx: Math.round((px1 - px0 - 16) * TILE), ty: 0, h: 70 });   // (the stand's roof line, lit at night)
    const fx0 = px0 - 1.6, fx1 = px1 + 1.6, fy0 = py0 - 1.6, fy1 = py1 + 1.6;
    prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 5) * TILE, ty: 0 });
    prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
    for (const [lx, ly] of [[fx0, fy0], [fx1, fy0], [fx0, fy1], [fx1, fy1]]) prop('ymast', lx, ly, 0, { tall: 150 });
    (out.places ||= []).push({ name: 'Greenfield Park Pitch', x0: px0, y0: py0, x1: px1, y1: py1 });
  }
  // ---- the courts in the north-east: two tennis courts (teal in green run-off), two basketball courts, chain-link round them
  {
    const cy0 = y0 + 4, ch = 28, cw = 14, cx0 = x1 - 6 - 4 * (cw + 1);
    K.paint(cx0 - 1, cy0 - 1, 4 * (cw + 1) + 1, ch + 2, T.LOT);
    for (let k = 0; k < 4; k++) {
      const cx = cx0 + k * (cw + 1), mx = cx + cw / 2, tennis = k < 2;
      if (tennis) { prop('court', mx, cy0, 0, { w: cw * TILE, d: ch * TILE, k: 'tennis', c1: '#3a7e86', c2: '#3a6a4e' }); prop('tnet', mx, cy0 + ch / 2, 0, { len: (cw - 2) * TILE, a: Math.PI / 2 }); }
      else {
        prop('court', mx, cy0, 0, { w: cw * TILE, d: ch * TILE, c1: '#3a5a8a', c2: '#8a3a32' }); prop('hoop', mx, cy0 + 0.6, 6);
        (K.m.courtSpots ||= []).push({ x: Math.round(mx * TILE), y: Math.round((cy0 + ch / 2) * TILE), w: cw, h: ch, name: 'Greenfield Park Courts' });
      }
    }
    const fx0 = cx0 - 0.8, fx1 = cx0 + 4 * (cw + 1) - 0.2, fy0 = cy0 - 0.8, fy1 = cy0 + ch + 0.8;
    prop('chainfence', fx0, fy0, 0, { tx: (fx1 - fx0) * TILE, ty: 0 }); prop('chainfence', fx0, fy1, 0, { tx: (fx1 - fx0 - 4) * TILE, ty: 0 });
    prop('chainfence', fx0, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE }); prop('chainfence', fx1, fy0, 0, { tx: 0, ty: (fy1 - fy0) * TILE });
    for (let k = 1; k < 4; k++) prop('chainfence', cx0 + k * (cw + 1) - 0.5, fy0, 0, { tx: 0, ty: (ch * 0.6) * TILE });
    for (const lx of [fx0, (fx0 + fx1) / 2, fx1]) prop('lamp', lx, fy1 + 0.6, 0);
    prop('bench_m', fx0 + 6, fy1 + 1.6, 0); prop('bench_m', fx1 - 6, fy1 + 1.6, 0);
    (out.places ||= []).push({ name: 'Greenfield Park Courts', x0: cx0, y0: cy0, x1: cx0 + 4 * (cw + 1), y1: cy0 + ch });
  }
  // ---- the boathouse on the west shore: its pavilion (a cafe and the boats for hire), the jetty, rowing boats tied up
  {
    const js = shore(JY + 1);
    for (let y = JY; y <= JY + 2; y++) for (let x = bx + bw; x < js + 8; x++) if (isW(x, y) || at(x, y) === T.GRASS || at(x, y) === T.PLAZA) m.set(x, y, T.DOCK);
    for (let k = 0; k < 4; k++) prop('canoe', js + 1 + k * 2, JY + (k % 2 ? 4.4 : -1.4), 0, { c: k % 3, a: Math.PI / 2 });
    for (let k = 0; k < 3; k++) { prop('cafetable', bx + 2 + k * 4, by + bh + 1.8, 0); prop(k % 2 ? 'umbrella_g' : 'umbrella_r', bx + 2 + k * 4, by + bh + 1.7, 0); }
    prop('lamp', js + 7.5, JY - 0.4, 0);
    if (boat) (out.places ||= []).push({ name: 'Greenfield Boathouse', x0: bx, y0: by, x1: js + 8, y1: by + bh });
  }
  // ---- the islands: rocks round them, trees, the gazebo on the east one; lilies, ducks and a swan on the water
  for (const [k, I] of ISL.entries()) {
    for (let j = 0; j < 10; j++) { const a = j * 0.63 + k, rx = I.cx + Math.cos(a) * (I.rx - 0.6), ry = I.cy + Math.sin(a) * (I.ry - 0.6); prop('boulder', rx, ry, 8, { s: 14 + (j % 3) * 4 }); }
    if (k === 1) { for (let y = I.cy - 2; y < I.cy + 2; y++) for (let x = I.cx - 2; x < I.cx + 2; x++) pave(x, y); prop('gazebo', I.cx, I.cy, 20); }
    for (let j = 0; j < (k ? 3 : 6); j++) { const a = j * (k ? 2.1 : 1.1) + 0.4, f = k ? 0.66 : 0.45, tx = I.cx + Math.cos(a) * I.rx * f, ty = I.cy + Math.sin(a) * I.ry * f; prop(j % 2 ? 'tree_b' : 'tree_a', tx, ty, 12, { sp: pick(['willow', 'oak', 'cherry', 'maple'], rnd(j, k, 3)), k: k ? 0.95 : 1.15 }); }
  }
  for (const [dx, dy, v] of [[-34, -16, 0], [-22, 18, 1], [24, -20, 2], [40, 6, 0], [-6, 22, 1], [10, -24, 2]]) prop('lily', 3088 + dx, MY + dy, 0, { v });
  for (const [dx, dy, a] of [[-12, -8, 0.6], [-10, -6, 2.2], [30, 14, 4], [32, 12, 1.4]]) prop('duck', 3088 + dx, MY + dy, 0, { a });
  prop('swan', 3080, 2508, 0, { a: 1.2 }); prop('swan', 3122, 2462, 0, { a: 3.6 });
  // ---- the bandstand on the east lawn, picnic blankets round it; picnic lawns in the south-west
  prop('gazebo', 3160, 2470, 30);
  for (const [dx, dy, v] of [[-8, 8, 0], [6, 10, 1], [-10, -6, 2], [8, -8, 0]]) prop('blanket', 3160 + dx, 2470 + dy, 0, { v });
  for (const [x, y, v] of [[3016, 2540, 1], [3030, 2550, 0], [3048, 2536, 2], [3060, 2552, 1], [3012, 2524, 0]]) prop('blanket', x, y, 0, { v });
  for (const [x, y] of [[3022, 2530], [3054, 2546], [3072, 2534]]) prop('picnic', x, y, 0);
  // ---- the allotments in the south-east: plots in rows, the greenhouse, the shed, picket fence and its gate
  {
    const gx0 = 3112, gx1 = x1 - 8, gy0 = 2528, gy1 = y1 - 7;
    K.paint(gx0, gy0, gx1 - gx0, gy1 - gy0, T.GRASS);
    const mx = Math.floor((gx0 + gx1) / 2);
    K.paint(mx - 1, gy0, 2, gy1 - gy0, T.DIRT);
    // the plots: soil beds 5 by 3 with grass walks between, a raised bed or a row of flowers on some (WC418's grid)
    for (let y = gy0 + 2; y + 3 <= gy1 - 2; y += 4) for (let x = gx0 + 2; x + 5 <= gx1 - 1; x += 6) {
      if (x + 5 > mx - 2 && x < mx + 2) continue;
      if (y < gy0 + 8 && (x > gx1 - 13 || x < gx0 + 8)) continue;   // (the greenhouse's and the shed's corners)
      K.paint(x, y, 5, 3, T.DIRT);
      const u = rnd(x, y, 60);
      if (u < 0.4) prop('raisedbed', x + 2.5, y + 1.5, 0, { v: (x * 7 + y) % 5 });
      else if (u < 0.85) { const sp = pick(['sunflowers', 'lavender', 'berryShrub', 'tulips', 'rose', 'daffodils', 'hydrangea'], rnd(x, y, 61)); for (const dx of [1, 2.5, 4]) prop('flowers_a', x + dx, y + 1.5, 0, { sp, k: 1 }); }
    }    prop('greenhouse', gx1 - 8, gy0 + 4, 26); prop('shed', gx0 + 4, gy0 + 3, 18);
    prop('fenceline', gx0, gy0, 0, { kind: 'picket', tx: (gx1 - gx0) * TILE, ty: 0 });
    prop('fenceline', gx0, gy1, 0, { kind: 'picket', tx: (mx - 1.5 - gx0) * TILE, ty: 0 }); prop('fenceline', mx + 1.5, gy1, 0, { kind: 'picket', tx: (gx1 - mx - 1.5) * TILE, ty: 0 });
    prop('fenceline', gx0, gy0, 0, { kind: 'picket', tx: 0, ty: (gy1 - gy0) * TILE }); prop('fenceline', gx1, gy0, 0, { kind: 'picket', tx: 0, ty: (gy1 - gy0) * TILE });
    prop('textsign', mx, gy1 - 1.4, 0, { text: 'ALLOTMENTS', bg: '#2f6a4e', fg: [250, 240, 200], z: 26, sx: 1 });
    (out.places ||= []).push({ name: 'Greenfield Allotments', x0: gx0, y0: gy0, x1: gx1, y1: gy1 });
  }
  // ---- the main gates on the south avenue (an iron arch between stone piers), the round lawn inside them, the park's
  // name; the railings all round with the four gates; lamps and benches along the paths
  prop('gatearch', AX, y1 - 0.6, 0, { w: 7 * TILE, a: 0 });
  prop('textsign', AX, y1 - 2.4, 0, { text: 'GREENFIELD PARK', bg: '#2f5a4a', fg: [240, 232, 200], z: 44, sx: 2, lit: true });
  for (let y = y1 - 19; y <= y1 - 3; y++) for (let x = Math.floor(AX - 11); x <= AX + 11; x++) {   // (the round lawn, the path round it)
    const q = ((x + 0.5 - AX) / 6.5) ** 2 + ((y + 0.5 - (y1 - 11)) / 5) ** 2, q2 = ((x + 0.5 - AX) / 9.5) ** 2 + ((y + 0.5 - (y1 - 11)) / 8) ** 2;
    if (q <= 1) { if (at(x, y) === T.PLAZA) K.paint(x, y, 1, 1, T.GRASS); } else if (q2 <= 1) pave(x, y);
  }
  prop('flowers_big', AX, y1 - 11, 0);
  const rail = (ax, ay, bx, by) => prop('fenceline', ax, ay, 0, { kind: 'iron', tx: Math.round((bx - ax) * TILE), ty: Math.round((by - ay) * TILE) });
  rail(x0 + 0.2, y0 + 0.25, AX - 3.5, y0 + 0.25); rail(AX + 3.5, y0 + 0.25, x1 - 0.2, y0 + 0.25);
  rail(x0 + 0.2, y1 - 0.25, AX - 4.5, y1 - 0.25); rail(AX + 4.5, y1 - 0.25, x1 - 0.2, y1 - 0.25);
  rail(x0 + 0.2, y0 + 0.25, x0 + 0.2, MY - 2); rail(x0 + 0.2, MY + 2, x0 + 0.2, y1 - 0.25);
  rail(x1 - 0.2, y0 + 0.25, x1 - 0.2, MY - 2); rail(x1 - 0.2, MY + 2, x1 - 0.2, y1 - 0.25);
  for (const [gx, gy] of [[AX - 4, y0 + 1], [AX + 4, y0 + 1], [x0 + 1, MY - 2.6], [x1 - 1, MY - 2.6]]) prop('parksign', gx, gy, 0);
  let lk = 0;
  for (let y = y0 + 1; y < y1 - 1; y += 2) for (let x = x0 + 1; x < x1 - 1; x += 2) {
    if (at(x, y) !== T.PLAZA || rnd(x, y, 40) > 0.09) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (at(x + dx, y + dy) !== T.GRASS || at(x + dx * 1.5, y + dy * 1.5) !== T.GRASS) continue;
      prop(lk++ % 3 ? 'bench_m' : 'lamp', x + dx + 0.5, y + dy + 0.5, 0);
      break;
    }
  }
  // ---- the trees: groves on the grass away from the paths, the pitch, the courts and the allotments; willows by the
  // water, flowering trees by the fountain and the bandstand, a few palms along the loop
  const clear = (x, y, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) !== T.GRASS) return false; return true; };
  const keepOut = [[x0 + 2, y0 + 1, 3060, 2447], [3104, y0, x1, y0 + 34], [3110, 2526, x1, y1], [3152, 2462, 3168, 2478]];
  for (let y = y0 + 2; y < y1 - 2; y += 4) for (let x = x0 + 2; x < x1 - 2; x += 4) {
    const jx = x + Math.floor(rnd(x, y, 50) * 3), jy = y + Math.floor(rnd(x, y, 51) * 3);
    if (rnd(x, y, 52) < 0.42 || !clear(jx, jy, 1)) continue;
    if (keepOut.some(([a, b, c, d]) => jx >= a && jy >= b && jx < c && jy < d)) continue;
    const dw = dist.get(m.idx(jx, jy)), wet = dw !== undefined && dw <= 3;
    const sp = wet ? pick(['willow', 'willow', 'cherry'], rnd(jx, jy, 53)) : Math.abs(rr(jx, jy)) < 5 && rnd(jx, jy, 54) < 0.3 ? 'royal' : pick(['oak', 'maple', 'streetPl', 'oak', 'magnolia', 'cypress', 'cherry', 'mapleAutumn', 'oak', 'cypress'], rnd(jx, jy, 55));
    if (sp === 'royal') prop('palm_a', jx + 0.5, jy + 0.5, 10, { sp, k: 1.2 });
    else prop(rnd(jx, jy, 56) < 0.5 ? 'tree_a' : 'tree_b', jx + 0.5, jy + 0.5, 12, { sp, k: 1.05 + rnd(jx, jy, 57) * 0.35 });
    if (rnd(jx, jy, 58) < 0.12) prop(pick(['shrub_a', 'bush_c', 'flowers_a', 'flowers_big'], rnd(jx, jy, 59)), jx + 2, jy + 1.5, 0);
  }
  // the park's place (the generator's park would have given one): its stop for errands
  m.pois.push({ id: m.pois.length, kind: 'delivery', label: 'Greenfield Park', x: Math.round(AX * TILE), y: Math.round((y1 - 2) * TILE), r: 48 });
  (out.places ||= []).push({ name: 'Greenfield Park', x0, y0, x1, y1 }, { name: 'Greenfield Pond', x0: 3038, y0: 2450, x1: 3142, y1: 2517 });
}

// ---------------------------------------------------------------------------------------------------------------
// West of the park: Westside Avenue to Park West Avenue
function westBand(K, m, ctx) {
  const { prop, rnd } = K;
  const { towerLot, place, forecourt, out } = ctx;
  const ca = [DX.westside + EXT.ave + 1, DX.maple - EXT.st], cb = [DX.maple + EXT.st + 1, DX.parkW - EXT.ave];
  const r1 = [DY.green + EXT.ave + 1, DY.s22 - EXT.st - 1], r2 = [DY.s22 + EXT.st + 1, DY.fountain - EXT.ave - 1], r3 = [DY.fountain + EXT.ave + 1, DY.s12 - EXT.st - 1], r4 = [DY.s12 + EXT.st + 1, DY.bayside - EXT.ave - 1];
  const wa = ca[1] - ca[0], wb = cb[1] - cb[0];
  // each block filled back to back: a tower fronting the street to its south, a lower building turned to the street to
  // its north (its front unseen - the camera sees its back wall), a service yard between
  const pair = (x, w, r, south, north, yard = 4) => {
    const sh = south.h, nh = r[1] - r[0] + 1 - sh - yard;
    towerLot({ x, y: r[1] - sh + 1, w, h: sh, ...south });
    if (nh >= 10) {
      const b = place({ x, y: r[0], w, h: nh, arch: north.arch || 'office', name: north.name, face: 'N', poi: north.poi === undefined ? { kind: 'delivery', label: north.name } : north.poi, whole: true, ...(north.home ? { home: north.home } : {}),
        art: { spec: { floors: north.floors, style: north.style || 'stone', wallColor: north.wall || '#d4c8b0', win: north.win || 'even', cornice: north.cornice || null, parapet: 10, grime: 0.08, roofMat: north.roofMat || 'gravel', lip: 10, rimW: 5 }, noShop: true } });
      if (b) { K.fill(x, r[0] + nh, w, yard, T.LOT); for (let k = 0; k < Math.floor(w / 9); k++) prop(K.pick(['dump_g', 'dump_b', 'pallet_s', 'acunit'], K.rnd(x + k, r[0], 40)), x + 4 + k * 9, r[0] + nh + 1.8, 10); }
    }
  };
  pair(ca[0], wa, r1, { h: 40, name: 'Westgate Residences', arch: 'condo', style: 'stone', wall: '#e8e2d2', floors: 14, win: 'even', roofMat: 'green', home: { kind: 'apartment', price: 42000 }, poi: false }, { name: 'Linden Court', floors: 7 });
  pair(cb[0], wb, r1, { h: 46, name: 'Park West Tower', floors: 16, tint: '#2a4a6a' }, { name: 'Park West Annex', floors: 6, wall: '#c8bca4' });
  pair(ca[0], wa, r2, { h: 34, name: 'Fountain Court', arch: 'condo', style: 'stone', wall: '#d8ccb4', floors: 8, win: 'pair', home: { kind: 'apartment', price: 36000 }, poi: false }, { name: 'Maple Hall', floors: 6, wall: '#e2dac6', arch: 'condo', home: { kind: 'apartment', price: 32000 }, poi: false });
  pair(cb[0], wb, r2, { h: 36, name: 'Greenfield Medical Building', style: 'stone', wall: '#e2dac6', floors: 7, win: 'tall' }, { name: 'Sycamore House', floors: 5, wall: '#b8b0a2' });
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
  towerLot({ x: cx0, y: r2[0] + 4, w: 48, h: r2[1] - r2[0] - 3, name: 'Kestrel Tower', floors: 15, tint: '#2e5670', roofMat: 'green' });
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
    place({ x: c1[0], y: rn[0] + 4, w: 40, h: rn[1] - rn[0] - 3, arch: 'theatre', key: 'theatre', name: 'The Grand Theatre', poi: { kind: 'delivery', label: 'The Grand Theatre' }, whole: true,
      art: { spec: { floors: 4, style: 'stone', wallColor: '#e2d6bc', win: 'arch', cornice: 'dentil', parapet: 16, grime: 0.05, roofMat: 'gravel', lip: 10, rimW: 5, date: '1924' },
        shop: { kind: 'lobby', door: 'right', open: true, people: 4, awning: ['#7a1e2a', '#7a1e2a'], sign: { text: 'THE GRAND THEATRE', bg: '#7a1e2a', fg: [255, 214, 140], lit: true } } } });
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
      art: { spec: { floors: 3, style: 'stone', wallColor: '#ddd2bc', win: 'tall', cornice: 'dentil', parapet: 14, grime: 0.05, roofMat: 'gravel', lip: 10, rimW: 5, date: '1911' } } });
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
  towerLot({ x: c2[0], y: rs[0] + 2, w: 52, h: rs[1] - rs[0] - 1, name: 'Commerce Tower', floors: 14, tint: '#284256' });
  towerLot({ x: c2[1] - 52, y: rs[0] + 4, w: 52, h: rs[1] - rs[0] - 3, name: 'Harlow Building', style: 'stone', floors: 9, wall: '#d4c8b0', cornice: 'dentil', roofMat: 'green' });
  forecourt(c2[0] + 53, rs[0] + 20, c2[1] - c2[0] - 106, rs[1] - rs[0] - 19, { fountain: true });
  // ---- Civic Avenue to Harborview Avenue: the Civic car park (WC356's spiral ramp: the concrete decks, the round ramp
  // on its corner), offices and the Grand Neon Residences ----
  towerLot({ x: c3[0], y: rn[0] + 2, w: c3[1] - c3[0], h: rn[1] - rn[0] - 1, name: 'Civic Parking', arch: 'block', style: 'concrete', wall: '#b8b4aa', floors: 6, win: 'loft', sign: 'PARKING', signC: ['#1e3a5e', [250, 250, 240]], poi: { kind: 'delivery', label: 'Civic Parking' } });
  {
    const hw4 = Math.floor((c4[1] - c4[0]) / 2);
    towerLot({ x: c4[0], y: rn[0] + 6, w: hw4 - 1, h: rn[1] - rn[0] - 5, name: 'Walnut Street Offices', style: 'stone', floors: 8, wall: '#c8bca4' });
    towerLot({ x: c4[0] + hw4, y: rn[0] + 2, w: c4[1] - c4[0] - hw4, h: rn[1] - rn[0] - 1, name: 'Calder Tower', floors: 12, tint: '#284256' });
  }
  towerLot({ x: c3[0], y: rs[0] + 4, w: c3[1] - c3[0], h: rs[1] - rs[0] - 3, name: 'Grand Neon Residences', arch: 'condo', style: 'stone', wall: '#e8e2d2', floors: 12, win: 'even', roofMat: 'green', home: { kind: 'apartment', price: 48000 }, poi: false });
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
