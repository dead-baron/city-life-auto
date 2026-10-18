// World v3, handcrafted: Old Town (district 18), the old quarter at the river mouth west of Midtown, from the owner's
// concepts WC403 and WC404 (the piazza: prompt OldTown-B1) with WC014 (the church square and the quay), WC240 (the walled
// quarter, its piazza and market) and the prompt OldTown-A1 (lanes that never run straight and meet at odd angles; no two
// blocks the same shape). The grid it replaces (twelve straight streets, sixty square blocks) gives way to:
//   - the three avenues through it to Midtown, kept where the city meets them (Central Avenue, Midtown Boulevard, Harbor
//     Avenue to the Old Town Bridge), and the highways' and the Arts Bridge's own lines;
//   - Water Street, the quay along the inlet and the bay: stone bollards, rowing boats and a fishing boat at the wall,
//     life rings, lamps; Point Garden on the neck of land between the inlet and the bay;
//   - the piazza between the quay and Market Street: St. Anne's at its head up its steps, the statue in its ring of
//     flowers, the market's stalls (the Old Town Market's counters), the trattoria's and the cafe's tables, plane trees;
//   - wandering lanes between the avenues (Bell Lane, Tanner Street, Rope Walk, Salt Lane), the short ones between them
//     (Juniper Steps, Ash Lane, Bell Street, Ash Street), Quay Lane along the piazza's foot, Ferry Street under the West
//     Loop: terraces of two- and three-storey render and brick under terracotta roofs, shops with their flats over them,
//     the courts behind them green with cypresses, olives and orange trees;
//   - the Old Town Infirmary on the boulevard (where you come round), the Rusty Anchor at the bridge foot, the bank's
//     branch on Harbor Avenue.
// Deterministic like every plan (shared/world3-hand.js): tiles, fixed vertices and hash draws only.
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 18;   // Old Town's district id (shared/mapcore.js DISTRICTS)
// the avenues kept (tiles)
export const OY = { central: 1701, blvd: 1801, harbor: 1901, ferry: 2090 };
// how far a street's pavement reaches from its centre line (tiles): Old Town's pavements are two tiles (shared/roads.js
// SIDEWALK residential)
const extOf = (w) => (w - 1) / 2 + 2;
const LANE = 7, NARROW = 5;   // (a lane: two-way, no parking; a narrow one: one car wide)
// the lanes' centre lines; a lane that starts on another starts on one of its vertices (the junction)
const WATER_N = [[2668, 1701], [2671, 1728], [2667, 1756], [2668, 1801]];
const WATER_S = [[2668, 1801], [2666, 1830], [2662, 1856], [2659, 1880], [2652, 1901]];
const BELL = [[2667, 1756], [2696, 1751], [2724, 1754], [2760, 1750], [2800, 1755], [2836, 1751], [2861, 1753]];
const MARKET = [[2732, 1801], [2736, 1822], [2731, 1840], [2733, 1860], [2731, 1882], [2746, 1901]];
const QUAY = [[2659, 1880], [2695, 1884], [2731, 1882]];
const TANNER = [[2733, 1860], [2770, 1855], [2810, 1861], [2861, 1857]];
const ROWAN = [[2644, 1901], [2646, 1950], [2643, 2000], [2645, 2040], [2644, 2090]];
const ROPE = [[2646, 1950], [2672, 1955], [2706, 1948], [2744, 1953], [2790, 1948], [2830, 1954], [2861, 1950]];
const SALT = [[2643, 2000], [2680, 1996], [2716, 2003], [2750, 1998]];
const BELLST = [[2706, 1901], [2706, 1948], [2712, 1975], [2716, 2003]];
const ASHST = [[2830, 1901], [2830, 1954], [2826, 1995], [2830, 2035]];
const JUNIPER = [[2730, 1701], [2733, 1726], [2724, 1754]];
const ASHLANE = [[2800, 1755], [2806, 1778], [2812, 1801]];
const FERRY = [[2601, 2090], [2644, 2090], [2685, 2090], [2706, 2090], [2731, 2090], [2818, 2090]];

function streets() {
  const out = [];
  const add = (name, kind, pts, o = {}) => out.push({ name, kind, pts, ...o });
  add('Central Avenue', 'ave', [[2668, OY.central], [2861, OY.central]]);
  add('Midtown Boulevard', 'blvd', [[2668, OY.blvd], [2861, OY.blvd]], { w: 13, median: 96 });
  add('Harbor Avenue', 'ave', [[2640, OY.harbor], [2861, OY.harbor]]);
  // (the Old Town Bridge comes ashore north of Harbor Avenue: its last yards down to the avenue)
  add('Old Town Bridge', 'ave', [[2645, 1887], [2644, OY.harbor]]);
  add('Water Street', 'st', WATER_N, { w: LANE });
  add('Water Street', 'st', WATER_S, { w: LANE });
  add('Bell Lane', 'st', BELL, { w: LANE });
  add('Market Street', 'st', MARKET, { w: LANE });
  add('Quay Lane', 'minor', QUAY, { w: NARROW });
  add('Tanner Street', 'st', TANNER, { w: LANE });
  add('Rowan Street', 'st', ROWAN, { w: LANE });
  add('Rope Walk', 'st', ROPE, { w: LANE });
  add('Salt Lane', 'st', SALT, { w: LANE, culdesac: true });
  add('Bell Street', 'minor', BELLST, { w: NARROW });
  add('Ash Street', 'minor', ASHST, { w: NARROW, culdesac: true });
  add('Juniper Steps', 'minor', JUNIPER, { w: NARROW });
  add('Ash Lane', 'minor', ASHLANE, { w: NARROW });
  add('Ferry Street', 'st', FERRY);
  return out;
}

export const OLDTOWN = {
  key: 'oldtown', d: D, rect: [2600, 1660, 2860, 2120],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of Old Town)
  specials: ['Old Town Infirmary', 'Rusty Anchor Motel'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The looks: warm render (ochre, rose, cream, straw, sage, salmon) and old red brick, terracotta roofs - gabled along the
// lane or hipped - or a flat roof with its terrace; green, blue and oxblood shutters and awnings
const RENDER = ['#dcae74', '#d49882', '#e6d6b4', '#e8cf8e', '#c4c09a', '#dc9e86', '#e2c4a0', '#d8b890', '#cfa48a'];
const BRICK = ['#a85a42', '#9a5040', '#b0644c'];
const ROOF = ['#c8683e', '#d07a48', '#bc5c3a', '#c4704a', '#b45a3c'];
const AWN = [['#2f6a4e', '#f0ece4'], ['#7a1e2a', '#efe6d0'], ['#2a4a7a', '#f0ece4'], ['#c8503a', '#f0ece4'], ['#5a6a3a', '#efe6d0']];
// the shops along the lanes: the trattoria, the bakery, the fishmonger, the wine bar...
const SHOPS = [
  { name: 'Panetteria Lucia', store: 'cafe', food: true },
  { name: 'Bottega del Vino', store: 'bar' },
  { name: 'Old Quay Fishmonger', store: 'mart' },
  { name: 'Old Town Barbers', store: 'salon', poi: { kind: 'barber', label: 'Old Town Barbers' } },
  { name: 'Formaggi Rossi', store: 'mart' },
  { name: 'Gelateria Stella', store: 'cafe' },
  { name: 'Bell Lane Market', store: 'mart', poi: { kind: 'convenience', label: 'Bell Lane Market' } },
  { name: 'The Bookbinder', store: 'books' },
  { name: 'Second Skin Vintage', store: 'clothes', poi: { kind: 'clothing', label: 'Second Skin Vintage' } },
  { name: 'Osteria del Ponte', store: 'diner', food: true },
  { name: 'Antiche Cose', store: 'pawn' },
  { name: 'Fiori di Maria', store: 'florist' },
  { name: 'Sarto Bruno', store: 'clothes' },
  { name: 'Salumeria Gino', store: 'mart' },
  { name: 'Old Town Deli', store: 'mart', poi: { kind: 'convenience', label: 'Old Town Deli' } },
  { name: 'Old Town Records', store: 'records' },
  { name: 'Lavanderia Sole', store: 'laundry' },
  { name: 'Il Fornaio', store: 'cafe', food: true },
  { name: 'The Lamplighter', store: 'bar' },
  { name: 'Candle & Wick', store: 'mart' },
  { name: 'Pasticceria Nonna', store: 'cafe', food: true },
  { name: 'Enoteca Vecchia', store: 'bar' },
  { name: 'Ferramenta Bassi', store: 'mart' },
  { name: 'Merceria Rosa', store: 'clothes' },
  { name: 'Pizzeria Vesuvio', store: 'diner', food: true },
  { name: 'Libreria Dante', store: 'books' },
  { name: 'Calzoleria Enzo', store: 'mart' },
  { name: 'Rope & Sail Chandlery', store: 'mart' },
  { name: "The Ship's Lantern", store: 'bar' },
  { name: 'Harbour Pottery', store: 'mart' },
  { name: 'Sapori di Mare', store: 'diner', food: true },
  { name: 'Tabacchi Nico', store: 'mart' },
  { name: 'Velluto Boutique', store: 'clothes' },
  { name: 'Ottica Luce', store: 'mart' },
  { name: 'Mercato Roasters', store: 'cafe' },
  { name: 'Olive & Oil', store: 'mart' },
  { name: 'Cartoleria Pia', store: 'books' },
  { name: 'Il Mulino', store: 'cafe', food: true },
  { name: 'Vecchio Orologiaio', store: 'pawn' },
  { name: 'Spezie & Sale', store: 'mart' },
  { name: 'Old Town Bike Works', store: 'mart' },
  { name: 'Trattoria Bella', store: 'diner', food: true },
];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0 };
  const { place: place0, tower } = towerKit(K, out);
  // a set piece's lot placed whole, given up a tile or two at its sides where a lane's pavement wanders into it
  const place = (o) => {
    for (const [l, r] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2], [3, 3], [4, 4]]) {
      const x = o.x + l, w = o.w - l - r;
      if (w < 5 || !K.allFree(x, o.y, w, o.h)) continue;
      return place0({ ...o, x, w, ...(typeof o.door === 'number' ? { door: Math.min(x + w - 1, Math.max(x, o.door)) } : {}) });
    }
    return null;
  };
  let si = 0;
  // a house's or a shop's art: two or three storeys of render or brick, a terracotta roof (gabled or hipped) or a flat one
  // (gravel, pavers, or a roof garden's terrace)
  const art = (x, y, w, o = {}) => {
    const brick = rnd(x, y, 41) < 0.22, floors = o.floors || 2 + Math.floor(rnd(x, y, 42) * 2), flat = rnd(x, y, 43) < 0.28;
    const roof = flat ? { roofMat: rnd(x, y, 45) < 0.45 ? 'green' : pick(['gravel', 'paver'], rnd(x, y, 44)) } : { pitch: rnd(x, y, 46) < 0.6 ? 'gable' : true, slope: 0.55 + rnd(x, y, 47) * 0.2, roofColor: pick(ROOF, rnd(x, y, 48)) };
    return tower(x, y, { name: o.name || '', style: brick ? 'brick' : 'stucco', tone: pick(BRICK, rnd(x, y, 49)), wall: pick(RENDER, rnd(x, y, 50)), floors,
      ...(o.store ? { store: o.store, awning: o.awning || pick(AWN, rnd(x, y, 51)), people: 2 } : { shop: false }), win: pick(['pair', 'even', 'arch', 'pair'], rnd(x, y, 52)), cornice: pick(['bracket', null, 'step'], rnd(x, y, 53)), parapet: flat ? 6 : 2,
      spec: { ...roof, ...(floors >= 3 && rnd(x, y, 54) < 0.4 ? { balconies: true } : null), grime: 0.06 + rnd(x, y, 55) * 0.08 },
      // (a flat roof's terrace: the washing out on its line, a pot or two)
      ...(flat && roof.roofMat !== 'green' && w >= 6 ? { kit: [['line', 36 + Math.floor(rnd(x, y, 56) * 40), 44], ['plant', w * TILE - 26, 34], ...(rnd(x, y, 57) < 0.5 ? [['chim', 22, 30]] : [])] } : null) });
  };
  const shopLot = (x, y, w) => {
    const S = SHOPS[si++];   // (each name once: when the list runs out the rows are houses)
    const poi = S.poi || (S.store === 'cafe' || S.store === 'diner' ? { kind: 'coffee', label: S.name, food: !!S.food } : { kind: 'delivery', label: S.name, walk: true, store: S.store === 'bar' ? 'mart' : S.store });
    return { arch: 'mixed', name: S.name, poi, home: { kind: 'apartment' }, whole: true, art: art(x, y, w, { store: S.store, name: S.name }) };
  };
  // A row of lots facing south onto the lane below it (its fronts step along the lane's wander): houses with their doors,
  // a shop now and then (o.shops: the share), a garden gap between a few
  const frontRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 12 ? room : 6 + Math.floor(rnd(x, y1, 61) * 6), depth = (o.depth || 11) + Math.floor(rnd(x, y1, 62) * 3) - 1;
    if (si < SHOPS.length && rnd(x, y1, 63) < (o.shops ?? 0.35)) return { w, depth, ...shopLot(x, y1, w) };
    return { w, depth, arch: 'walkup', door: x + Math.floor(w * 0.3), home: { kind: 'apartment' }, whole: true, art: art(x, y1, w) };
  });
  // A row of lots against the band's north edge, their doors on the lane to the north (drawn from behind: their back
  // walls, balconies and courts face the camera)
  const backRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = room <= 12 ? room : 6 + Math.floor(rnd(x, y0, 64) * 6), depth = (o.depth || 11) + Math.floor(rnd(x, y0, 65) * 3) - 1;
    return { w, depth, arch: 'walkup', face: 'N', home: { kind: 'apartment' }, whole: true, art: art(x, y0, w) };
  }, { north: true });

  // the set pieces first (they want their ground free), then the rows round them
  quay(K, m, out);
  piazza(K, m, { place, art, out });
  infirmary(K, m, { place, out });
  bridgeFoot(K, m, { place, art, out });
  // the bands between the lanes, each a terrace facing the lane to its south and one facing the lane to its north,
  // back to back over their courts (depth: how deep the lots go, so the courts between are a few yards)
  const band = (x0, x1, y0, y1, depth, shops, o = {}) => { if (o.back !== false) backRow(x0, x1, y0, y1, { depth }); if (o.front !== false) frontRow(x0, x1, y0, y1, { depth, shops }); };
  band(2674, 2856, 1664, 1695, 12, 0.45);   // 18th Street to Central Avenue
  band(2675, 2856, 1708, 1746, 15, 0.3);    // Central Avenue to Bell Lane
  band(2675, 2856, 1758, 1792, 13, 0.5);    // Bell Lane to the boulevard
  band(2672, 2856, 1810, 1852, 16, 0.35);   // the boulevard to Tanner Street (behind the church east of Market Street)
  band(2740, 2856, 1864, 1894, 12, 0.45);   // Tanner Street to Harbor Avenue
  band(2650, 2856, 1908, 1944, 14, 0.3);    // Harbor Avenue to Rope Walk
  band(2650, 2856, 1957, 1992, 13, 0.2);    // Rope Walk to Salt Lane
  band(2650, 2856, 2006, 2048, 16, 0.15);   // Salt Lane to the West Loop
  band(2603, 2639, 2004, 2050, 14, 0.2);    // west of Rowan Street, by the shore
  band(2603, 2816, 2061, 2085, 10, 0.25);   // under the West Loop to Ferry Street
  band(2603, 2816, 2095, 2118, 14, 0, { front: false });   // south of Ferry Street, to the water
  // what's left: the courts behind the rows - cypresses, olives, orange trees, a plane tree, a bush or a bed
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.82 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['cypress', 'olive', 'cypress', 'orange', 'streetPl', 'olive'], rnd(x, y, 831)), 1.0 + rnd(x, y, 832) * 0.25] : [pick(['shrub_a', 'bush_c', 'flowers_big', 'flowers_a'], rnd(x, y, 833)), null, 1] });
  lanes(K, m);
  void api;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The quay (WC403, WC404, WC014): Water Street's west pavement is the quay wall over the inlet and the bay - stone
// bollards every few yards, a life ring, lamps, barrels and crates where the boats tie up; rowing boats and a fishing
// boat at the wall; gulls. Point Garden on the neck of land between the inlet and the bay: a lawn, benches facing the
// water, cypresses, the lookout's telescope
function quay(K, m, out) {
  const { prop, rnd, pick } = K;
  const at = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const wet = (x, y) => { const t = at(x, y); return t === T.WATER || t === T.DEEP; };
  // (walk each row from the street out to the water: the last dry tile is the quay's edge)
  let k = 0;
  for (const [ya, yb] of [[1704, 1752], [1806, 1898]]) for (let y = ya; y <= yb; y += 3) {
    let x = 2668; while (x > 2600 && !wet(x - 1, y)) x--;
    if (x <= 2600 || x > 2664) continue;
    prop('bollard', x + 0.4, y + 0.5, 6);
    if (k % 5 === 2) prop('lamp', x + 1.4, y + 0.5, 0);
    else if (k % 7 === 4) prop('lifering', x + 1.2, y + 0.5, 0);
    else if (k % 6 === 1) prop(pick(['barrel', 'crates'], rnd(x, y, 71)), x + 1.6, y + 0.5, 6);
    if (k % 4 === 0) prop('canoe', x - 1.6, y + 0.5, 0, { c: k % 3, a: Math.PI / 2 });
    k++;
  }
  prop('sailboat', 2636, 1846, 0, { len: 140, a: Math.PI / 2, sail: 0, c: 2 });
  prop('sailboat', 2640, 1722, 0, { len: 110, a: Math.PI / 2, c: 0 });
  for (const [x, y] of [[2650, 1830], [2632, 1812], [2646, 1712]]) prop('gull', x, y, 0);
  // Point Garden (on the neck of land between the inlet and the bay): a path round it and one across it from Water
  // Street, cypresses down the cross path, the bandstand in its ring of flowers where they meet, olive trees in the
  // lawns, benches looking out over the water both sides, the lookout's telescope at the point
  const g = [2600, 1757, 2661, 1807];
  K.fill(g[0], g[1], g[2] - g[0], g[3] - g[1], T.GRASS);
  const gx = 2626, gy = 1781;   // (the bandstand; the shore's own promenade is the path round the garden)
  for (let y = g[1]; y < g[3]; y++) for (let x = g[0]; x < g[2]; x++) {
    if (at(x, y) !== T.GRASS) continue;
    const cross = Math.abs(y - gy) <= 1 && x > g[0] + 4, spur = Math.abs(x + 0.5 - (gx + 0.5)) <= 1, pad = (x - gx) * (x - gx) + (y - gy) * (y - gy) * 1.4 < 26;
    if (cross || spur || pad) K.paint(x, y, 1, 1, T.PLAZA);
  }
  prop('gazebo', gx + 0.5, gy + 0.5, 30);
  for (let k = 0; k < 12; k++) { const a = k * 0.5236; prop(k % 2 ? 'flowers_a' : 'flowers_big', gx + 0.5 + Math.cos(a) * 6.4, gy + 0.5 + Math.sin(a) * 5, 0); }
  for (let x = g[0] + 7; x < g[2] - 3; x += 4) { if (Math.abs(x - gx) < 8) continue; for (const dy of [-2.6, 3.4]) prop('tree_a', x + 0.5, gy + dy, 10, { sp: 'cypress', k: 1.15 }); }
  // the lawns: olive and orange trees in rows (clear of the paths), the odd cypress; benches along the cross path facing it
  for (let y = g[1] + 3; y < g[3] - 2; y += 5) for (let x = g[0] + 4; x < g[2] - 3; x += 5) {
    const tx = x + (Math.floor((y - g[1]) / 5) % 2) * 2.5, ty = y;
    if (Math.abs(ty - gy) < 5 || Math.abs(tx - gx - 0.5) < 4) continue;
    let ok = true;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (at(Math.floor(tx) + dx, ty + dy) !== T.GRASS) { ok = false; break; }
    if (!ok) continue;
    const r = rnd(Math.floor(tx), ty, 72);
    prop(r < 0.12 ? 'tree_a' : 'tree_b', tx + 0.5, ty + 0.5, 12, { sp: r < 0.12 ? 'cypress' : r < 0.72 ? 'olive' : 'orange', k: 1.1 + rnd(ty, Math.floor(tx), 73) * 0.2 });
  }
  for (let x = g[0] + 9; x < g[2] - 4; x += 8) { if (Math.abs(x - gx) < 9) continue; prop('pbench', x + 0.5, gy - 1.6, 8, { a: 0 }); prop('pbench', x + 2.5, gy + 2.6, 8, { a: Math.PI }); }
  for (const dy of [-8, 8]) for (const dx of [-1.8, 2.8]) prop('flowers_big', gx + dx, gy + dy, 0);
  prop('scope', g[0] + 3.5, gy - 0.4, 6); prop('lamp', g[0] + 4, gy + 2, 0); prop('lamp', gx + 7, gy - 1.6, 0); prop('lamp', gx - 7, gy + 2.6, 0);
  prop('textsign', g[2] - 4, gy - 2.6, 0, { text: 'POINT GARDEN', bg: '#2f5a4a', fg: [240, 232, 200], z: 26, sx: 1 });
  K.take(g[0], g[1], g[2] - g[0], g[3] - g[1]);
  (out.places ||= []).push({ name: 'Point Garden', x0: g[0], y0: g[1], x1: g[2], y1: g[3] }, { name: 'The Old Quay', x0: 2640, y0: 1806, x1: 2668, y1: 1898 });
}

// ---------------------------------------------------------------------------------------------------------------
// The piazza (WC403, WC404): between the quay and Market Street, St. Anne's at its head up its steps (grey-gold stone, a
// rose window, a terracotta roof), the trattoria and the cafe either side of it, a terrace of shops along its south side;
// the fountain and its bronze statue in a ring of flowers, the market's stalls under striped awnings either side of it
// with the Old Town Market's counters, crates of produce, string lights over the aisles, the trattoria's and the cafe's
// tables under umbrellas, plane trees and lamps round the edge
function piazza(K, m, ctx) {
  const { prop, rnd } = K;
  const { place, art, out } = ctx;
  const P = [2671, 1838, 2726, 1863];   // [x0, y0, x1, y1): the paving (Water Street's and Market Street's pavements bound it)
  // St. Anne's and its neighbours on the piazza's north side, their fronts on it
  const cw = 20, cx0 = 2690;
  const church = place({ x: cx0, y: 1817, w: cw, h: P[1] - 1817, arch: 'church', key: 'church', name: "St. Anne's", poi: { kind: 'delivery', label: "St. Anne's" }, whole: true,
    art: { spec: { wallColor: '#cdbd98', roofColor: '#b8603e' } } });
  place({ x: P[0] + 1, y: 1824, w: cx0 - P[0] - 2, h: P[1] - 1824, arch: 'mixed', name: 'Trattoria da Rocco', poi: { kind: 'coffee', label: 'Trattoria da Rocco', food: true }, home: { kind: 'apartment' }, whole: true,
    art: art(P[0] + 1, 1824, cx0 - P[0] - 2, { store: 'diner', name: 'Trattoria da Rocco', awning: ['#2f6a4e', '#f0ece4'], floors: 2 }) });
  place({ x: cx0 + cw + 1, y: 1824, w: 2729 - cx0 - cw - 2, h: P[1] - 1824, arch: 'mixed', name: 'Caffe del Porto', poi: { kind: 'coffee', label: 'Caffe del Porto' }, whole: true,
    art: art(cx0 + cw + 1, 1824, 2729 - cx0 - cw - 2, { store: 'cafe', name: 'Caffe del Porto', awning: ['#7a1e2a', '#efe6d0'], floors: 2 }) });
  // the piazza's south side: a terrace facing it over its doors (backs on Quay Lane), a passage down to the lane at each
  // end and one in the middle
  const SOUTH = [['Pescheria del Molo', 'mart', 9], null, ['Ristorante Il Faro', 'diner', 11], ['Galleria San Marco', 'pawn', 9], 'gap', ['Merletti Anna', 'clothes', 8], null, ['Vino & Vespa', 'bar', 10]];
  let sk = 0;
  K.row(P[0] + 3, P[2] - 1, P[3] + 1, 1877, (x, room, i) => {
    if (i === 0 || sk >= SOUTH.length) return room >= 1 ? { gap: Math.min(room, sk >= SOUTH.length ? room : 3), kind: 'passage' } : null;
    const L = SOUTH[sk++];
    if (L === 'gap') return { gap: 4, kind: 'passage' };
    const w = L ? L[2] : 7 + Math.floor(rnd(x, P[3], 74) * 3);
    if (!L) return { w, depth: 13, arch: 'walkup', face: 'N', home: { kind: 'apartment' }, whole: true, art: art(x, P[3], w, { floors: 3 }) };
    return { w, depth: 13, arch: 'mixed', face: 'N', name: L[0], poi: L[1] === 'diner' ? { kind: 'coffee', label: L[0], food: true } : { kind: 'delivery', label: L[0], walk: true, store: L[1] === 'bar' ? 'mart' : L[1] }, home: { kind: 'apartment' }, whole: true, art: art(x, P[3], w, { store: L[1], name: L[0], floors: 3 }) };
  }, { north: true });
  // the paving
  for (let y = P[1]; y < P[3]; y++) for (let x = P[0]; x < P[2]; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
  K.take(P[0], P[1], P[2] - P[0], P[3] - P[1]);
  const sx = cx0 + cw / 2, sy = 1851;
  // the church's steps: its lamps and cypresses; the statue on its plinth in its ring of flowers, benches round it
  if (church) { for (const dx of [-3, 3]) prop('plamp', sx + dx, P[1] + 1.2, 6); for (const dx of [-6.5, 6.5]) prop('tree_a', sx + dx, P[1] + 1.4, 10, { sp: 'cypress', k: 1.2 }); }
  prop('fountain', sx, sy, 36); prop('statue', sx, sy - 0.2, 0);
  for (let k = 0; k < 10; k++) { const a = k * 0.6283; prop(k % 2 ? 'flowers_a' : 'flowers_big', sx + Math.cos(a) * 4.2, sy + 0.4 + Math.sin(a) * 3.2, 0); }
  for (const [x, y, a] of [[sx - 6.5, sy + 0.3, 0], [sx + 6.5, sy + 0.3, Math.PI]]) prop('pbench', x, y, 8, { a });
  // the market west and east of the statue: stalls back to back in two short rows each side, crates of produce in front,
  // the counters; string lights over the aisles
  let v = 0;
  for (const [x0, x1] of [[P[0] + 3.5, sx - 8], [sx + 8, P[2] - 3.5]]) {
    for (const ry of [1845.5, 1857]) {
      for (let x = x0; x <= x1 - 1.5; x += 3.6) { prop('mstall', x, ry, 14, { v: v % 4, c: (v * 3 + 1) % 4, a: ry < sy ? 0 : Math.PI }); if (v % 2 === 0) prop('fruitcrate', x + 1.2, ry + (ry < sy ? 1.5 : -1.5), 0); v++; }
      const ya = ry + (ry < sy ? 2.6 : -2.6);
      prop('post', x0 - 1.2, ya, 5, { h: 52 }); prop('post', x1 + 0.2, ya, 5, { h: 52 });
      prop('festoon', x0 - 1.2, ya, 0, { tx: Math.round((x1 - x0 + 1.4) * TILE), ty: 0, h: 50 });
    }
    m.pois.push({ id: m.pois.length, kind: 'market', label: 'Old Town Market', x: Math.round((x0 + x1) / 2 * TILE), y: Math.round(sy * TILE), r: 48, counter: true });
  }
  (m.landmarks ||= []).push({ name: 'Old Town Market', type: 'market', x: P[0] * TILE, y: P[1] * TILE, w: (P[2] - P[0]) * TILE, h: (P[3] - P[1]) * TILE });
  (m.natureSites ||= []).push({ kind: 'market', hand: true, name: 'Old Town Market', x: Math.round(sx * TILE), y: Math.round(sy * TILE), stalls: v, rect: { x0: P[0], y0: P[1], x1: P[2] - 1, y1: P[3] - 1 } });
  // the trattoria's tables by its door, the cafe's by its, under their umbrellas; plane trees in grates down the sides,
  // lamps at the corners
  for (let k = 0; k < 6; k++) { const tx = P[0] + 3 + (k % 3) * 4.2, ty = P[1] + 2.4 + Math.floor(k / 3) * 2.8; prop('cafetable', tx, ty, 6); prop('umbrella_g', tx + 0.6, ty + 0.3, 4); }
  for (let k = 0; k < 4; k++) { const tx = P[2] - 4 - (k % 2) * 4.2, ty = P[1] + 2.4 + Math.floor(k / 2) * 2.8; prop('cafetable', tx, ty, 6); prop('umbrella_r', tx + 0.6, ty + 0.3, 4); }
  for (const y of [1849, 1854]) for (const x of [P[0] + 1.4, P[2] - 1.4]) prop('tree_b', x, y, 12, { sp: 'street', k: 1.15 });
  for (const [x, y] of [[P[0] + 0.8, P[1] + 0.8], [P[2] - 0.8, P[1] + 0.8], [P[0] + 0.8, P[3] - 0.8], [P[2] - 0.8, P[3] - 0.8]]) prop('lamp', x, y, 0);
  m.squares ||= []; m.squares.push({ x: Math.round(sx) - 6, y: sy - 4, w: 12, h: 8, name: 'Piazza Vecchia' });
  (out.places ||= []).push({ name: 'Piazza Vecchia', x0: P[0], y0: P[1], x1: P[2], y1: P[3] });
  if (church) (out.places ||= []).push({ name: "St. Anne's", x0: cx0, y0: 1817, x1: cx0 + cw, y1: P[1] });
  // between Quay Lane and Harbor Avenue: a paved strip with plane trees and benches (the old fish steps)
  for (let y = 1886; y < 1896; y++) for (let x = 2662; x < 2732; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
  for (let x = 2668; x < 2728; x += 7) { if (K.m.tiles[K.m.idx(x, 1891)] === T.PLAZA) prop('tree_b', x + 0.5, 1891.5, 12, { sp: 'street', k: 1.05 }); if (K.m.tiles[K.m.idx(x + 3, 1891)] === T.PLAZA) prop('bench_m', x + 3.5, 1891.6, 0); }
}

// ---------------------------------------------------------------------------------------------------------------
// The Old Town Infirmary on the boulevard (WC403's clinic): a cream stone house of three storeys under a hipped
// terracotta roof, the white cross on green by its door, its forecourt down to the pavement with planters and a bench;
// one of the places you come round (shared/map.js m.hospitals: its door, nothing standing in front of it)
function infirmary(K, m, ctx) {
  const { prop } = K;
  const { place, out } = ctx;
  const x = 2678, w = 34, y = 1761, h = 22, fy = y + h;
  const b = place({ x, y, w, h, arch: 'hospital', key: 'hospital', name: 'Old Town Infirmary', poi: { kind: 'hospital', label: 'Old Town Infirmary' }, door: x + 8, whole: true,
    art: { spec: { floors: 3, style: 'stone', wallColor: '#e2d6ba', pitch: true, slope: 0.5, roofColor: '#b0563a', win: 'tall' },
      shop: { kind: 'lobby', door: 'left', open: true, people: 2, awning: null, sign: { text: 'OLD TOWN INFIRMARY', bg: '#f0ece4', fg: [40, 90, 70], lit: true } } } });
  if (!b) return;
  // (the ER desk's mat beside the front desk: shared/map.js buildInteriors moves it inside)
  m.pois.push({ id: m.pois.length, kind: 'reception', label: 'ER Reception', x: (b.door.tx + 0.5) * TILE, y: (fy + 0.7) * TILE, r: 36, b: b.id });
  K.fill(x, fy, w, 1792 - fy + 1, T.PLAZA); K.take(x, fy, w, 1792 - fy + 1);
  for (const dx of [3, 14, 22, 31]) prop('planter_g', x + dx, fy + 3, 10);
  prop('bench_m', x + 18, fy + 5, 0); prop('lamp', x + 1, fy + 6, 0); prop('lamp', x + w - 1, fy + 6, 0);
  (out.places ||= []).push({ name: 'Old Town Infirmary', x0: x, y0: y, x1: x + w, y1: 1793 });
}

// ---------------------------------------------------------------------------------------------------------------
// At the foot of the Old Town Bridge, Harbor Avenue's south side: the Rusty Anchor (the old seamen's pub and its rooms
// over it, brick, its sign on a bracket) and the bait shop beside it; First Pixel Bank's Old Town branch across the avenue
// a little way along (stone, a columned door)
function bridgeFoot(K, m, ctx) {
  const { prop } = K;
  const { place, art, out } = ctx;
  const y = 1908;
  const anchor = place({ x: 2652, y, w: 18, h: 13, arch: 'mixed', face: 'N', name: 'The Rusty Anchor', poi: { kind: 'delivery', label: 'Rusty Anchor Motel' }, whole: true,
    art: { spec: { floors: 3, style: 'brick', brickTone: '#7a3a2e', cornice: 'bracket', parapet: 6, roofMat: 'tar', lip: 6, rimW: 4, grime: 0.2 }, noShop: true } });
  if (anchor) { prop('barrel', 2654, y - 1.2, 6); prop('barrel', 2655.4, y - 1.4, 6); prop('textsign', 2661, y - 1.6, 0, { text: 'THE RUSTY ANCHOR', bg: '#2a2420', fg: [236, 200, 120], z: 30, sx: 1, lit: true }); }
  // (the bank on the avenue's north side, its columned front onto it: a lot east of Market Street's corner)
  const bank = place({ x: 2750, y: 1882, w: 18, h: 13, arch: 'bank', key: 'bank', name: 'First Pixel Bank - Old Town', poi: { kind: 'bank', label: 'First Pixel Bank - Old Town' }, whole: true,
    art: { spec: { floors: 2, style: 'stone', wallColor: '#d8ccb4', cornice: 'dentil', parapet: 10, roofMat: 'gravel', lip: 8, rimW: 4 } } });
  // the bait shop next to the bank, the quay's (its rods and buckets out front)
  const tw = 10, tx = 2674;
  const tackle = place({ x: tx, y, w: tw, h: 12, arch: 'mixed', face: 'N', name: 'Old Quay Bait & Tackle', poi: { kind: 'tackle', label: 'Old Quay Bait & Tackle' }, home: { kind: 'apartment' }, whole: true,
    art: art(tx, y, tw, { store: 'mart', name: 'Bait & Tackle', awning: ['#2e6a8a', '#f0ece4'], floors: 2 }) });
  if (tackle) { prop('crates', tx + 1.5, y - 1.3, 6); prop('barrel', tx + tw - 1.5, y - 1.3, 6); }
  if (anchor) (out.places ||= []).push({ name: 'The Rusty Anchor', x0: 2652, y0: y, x1: 2670, y1: y + 13 });
  if (bank) (out.places ||= []).push({ name: 'First Pixel Bank - Old Town', x0: bank.tx, y0: bank.ty, x1: bank.tx + bank.tw, y1: bank.ty + bank.th });
}

// ---------------------------------------------------------------------------------------------------------------
// The lanes' life: string lights across the narrow ones, pots and planters by the doors
function lanes(K, m) {
  const { prop, rnd, pick } = K;
  const narrow = [JUNIPER, ASHLANE, BELLST, ASHST, QUAY];
  for (const pts of narrow) for (let j = 1; j < pts.length; j++) {
    const [ax, ay] = pts[j - 1], [bx, by] = pts[j], n = Math.max(1, Math.floor(Math.hypot(bx - ax, by - ay) / 6));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
      const r = rnd(Math.round(x), Math.round(y), 91);
      if (r < 0.3) prop('festoon', x - 2.5, y, 0, { tx: 5 * TILE, ty: 0, h: 44 });
      else if (r < 0.55) prop(pick(['potted', 'planter_g', 'flowers_a'], rnd(x, y, 92)), x + 3.2, y + 0.5, 6);
    }
  }
  void m;
}
