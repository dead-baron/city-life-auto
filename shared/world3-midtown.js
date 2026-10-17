// Midtown, handcrafted (the World v3 Handcraft Plan, "Midtown, decided" 2026-10-17; the owner's concepts RW1/RW1-Z the
// train over the street, RW2 the raised station, MT1 the diagonal avenue and its wedge, MT2 the main-street block, PJ1
// the projects, R1-A the hero corner, R1-I the corner store and bus stop, OS33 the corner bank, WC315 the community
// garden). The mainland city's middle, between the bridgeheads (Bridge Avenue, Main Avenue) and the waterfront:
//   - Trestle Street along the north edge, the main line overhead on its viaduct (the El: shared/world3-rail.js EL,
//     elFurniture; client/art2/game/statics.js addEl), the station at Madison Street, its inclines down to the portals
//     between Garden Street and Bridge Avenue and east of Mercer Street;
//   - Central Avenue, the rail-side row of walk-ups backing onto the El; Holly Street, the neighbourhood's main street
//     (the MT2 row, the hero corner at Madison Street, R1-I's corner at Main Avenue, the corner bank);
//   - Midtown Boulevard, the big stores; Pier Street and Union Square by the subway, down to Harbor Avenue;
//   - Crosstown Way, the diagonal from Civic Avenue to the Yards road, its wedge building and plaza where it crosses the
//     boulevard; the courtyard blocks in the west, the community garden by the tracks, the projects on the rough east edge.
// Every building faces south (the camera); the lots step along the diagonal (the plan's rule: buildings square to the
// grid, the angled lot filled with paving and planters). Draws are fixed by place (hash2), so reworking one block moves
// nothing else. The plan's frame: shared/world3-hand.js.
import { TILE, T } from './constants.js';

const D = 1;   // Midtown's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles)
export const MY = { trestle: 1664, central: 1700, holly: 1750, blvd: 1800, pier: 1850, harbor: 1900 };
export const MX = { westside: 2860, garden: 2924, bridge: 2988, linden: 3046, spring: 3085, carroll: 3118, main: 3184, madison: 3250, civic: 3320, fulton: 3400, harborview: 3480, mercer: 3580, stadium: 3680 };
// how far a street's pavement reaches from its centre line (tiles, inclusive): an avenue 9 wide + 3 of pavement a side,
// a street 6 + 3, an alley 3 with no pavement (shared/roads.js ROAD_KINDS, SIDEWALK commercial)
const EXT = { ave: 7, blvd: 7, st: 6, alley: 1 };
// the back alleys' centre lines: 11 tiles behind the street to the north (the back row's depth), so the main row's
// lots in front have a yard behind them
const AL = { b1: 1720, b2: 1769, c1: 1820, c2: 1869 };
// the diagonal: Crosstown Way, from Civic Avenue at Central Avenue to Harbor Avenue (the road on to the Yards Bridge)
const DIAG = [[MX.civic, MY.central], [3640, MY.harbor]];
// the diagonal's centre line at a column (tiles), and the two sides of it (a lot keeps 1 tile clear of its pavement)
const diagY = (x) => DIAG[0][1] + (x - DIAG[0][0]) * (DIAG[1][1] - DIAG[0][1]) / (DIAG[1][0] - DIAG[0][0]);
const northOfDiag = (x, y) => y < diagY(x);
const southOfDiag = (x, y) => y > diagY(x);

function streets() {
  const S = [];
  const ew = (name, kind, y, x0, x1) => S.push({ name, kind, pts: [[x0, y], [x1, y]] });
  const ns = (name, kind, x, y0, y1) => S.push({ name, kind, pts: [[x, y0], [x, y1]] });
  // (Trestle Street under the El: the inclines between Garden Street and Bridge Avenue and east of Mercer Street take
  // its line - shared/world3-rail.js EL - so it runs in two pieces)
  ew('Trestle Street', 'ave', MY.trestle, MX.westside, MX.garden);
  ew('Trestle Street', 'ave', MY.trestle, MX.bridge, MX.mercer);
  ew('Central Avenue', 'ave', MY.central, MX.westside, MX.stadium);
  ew('Holly Street', 'st', MY.holly, MX.garden, MX.mercer);
  ew('Midtown Boulevard', 'blvd', MY.blvd, MX.westside, MX.stadium);
  ew('Pier Street', 'st', MY.pier, MX.westside, MX.harborview);
  ns('Garden Street', 'st', MX.garden, MY.trestle, MY.harbor);
  ns('Bridge Avenue', 'ave', MX.bridge, MY.trestle, MY.harbor);
  ns('Linden Street', 'st', MX.linden, MY.central, MY.blvd);
  ns('Spring Street', 'st', MX.spring, MY.blvd, MY.harbor);
  ns('Carroll Street', 'st', MX.carroll, MY.trestle, MY.blvd);
  ns('Main Avenue', 'ave', MX.main, MY.trestle, MY.harbor);
  ns('Madison Street', 'st', MX.madison, MY.trestle, MY.harbor);
  ns('Civic Avenue', 'ave', MX.civic, MY.trestle, MY.harbor);
  ns('Fulton Street', 'st', MX.fulton, MY.trestle, MY.holly);
  ns('Mercer Street', 'st', MX.mercer, MY.central, MY.holly);
  ns('Fulton Street', 'st', MX.fulton, MY.blvd, MY.harbor);
  ns('Harborview Avenue', 'ave', MX.harborview, MY.trestle, MY.harbor);
  ns('Mercer Street', 'st', MX.mercer, MY.trestle, MY.central);
  ns('Mercer Street', 'st', MX.mercer, MY.blvd, 1862);
  S.push({ name: 'Crosstown Way', kind: 'ave', pts: DIAG });
  // the back alleys (the MT2 block's, behind every main-street row): one car wide, the back doors, the bins
  ew('Holly Back Alley', 'alley', AL.b1, MX.garden, MX.civic);
  ew('Boulevard Alley', 'alley', AL.b2, MX.garden, MX.civic);
  ew('Pier Alley', 'alley', AL.c1, MX.bridge, MX.civic);
  ew('Harbor Alley', 'alley', AL.c2, MX.westside, MX.bridge);
  ew('Harbor Alley', 'alley', AL.c2, MX.main, MX.civic);
  return S;
}

// ---------------------------------------------------------------------------------------------------------------
// The looks. Midtown is a brick and render neighbourhood, mixed: red brick is one tone among the browns, buffs, creams,
// painted brick and stucco (the owner, 10-17: no district all one colour; a run of one colour along a row is fine).
const TONE = {
  red: '#8e4a3c', deep: '#7a3a30', brown: '#6e4a38', choc: '#5a3c30', buff: '#b8946a', tan: '#a87e5a', cream: '#cdb991', grey: '#8a837a',
  green: '#3e6a5a', navy: '#33485e', oxblood: '#7a2e2e', mustard: '#b8903e', sage: '#7d977a', plum: '#6a4a5e',
};
const STUCCO = ['#d8c8a8', '#c8b494', '#e0d4bc', '#cfc2a8', '#d9a98a', '#c8bca4', '#b8c0b8', '#d4b896'];
// [weight, kind, tone]: the mix of facades along Midtown's streets
const MIX = [[22, 'brick', 'red'], [10, 'brick', 'deep'], [12, 'brick', 'brown'], [6, 'brick', 'choc'], [8, 'brick', 'buff'], [6, 'brick', 'tan'], [6, 'brick', 'cream'],
  [4, 'brick', 'green'], [3, 'brick', 'navy'], [3, 'brick', 'oxblood'], [2, 'brick', 'mustard'], [2, 'brick', 'sage'], [16, 'stucco', null], [6, 'stone', null], [4, 'peach', null]];
const MIX_W = MIX.reduce((a, q) => a + q[0], 0);
// a flat roof's deck (client/art2/buildings.js roofDeck): mostly the pale membranes and gravel of the concepts' roofs
function roofMat(r) {
  const m = r < 0.34 ? 'membrane' : r < 0.62 ? 'gravel' : r < 0.84 ? 'tar' : r < 0.93 ? 'paver' : r < 0.98 ? 'rubber' : 'green';
  return { roofMat: m, lip: 10, rimW: 4 };
}
function facadeOf(r) {
  let v = r * MIX_W;
  for (const q of MIX) { v -= q[0]; if (v <= 0) return q; }
  return MIX[0];
}
const AWNINGS = [['#2f7a5c', '#f0ece4'], ['#a8343a', '#f0ece4'], ['#2a3e7a', '#e8e4dc'], ['#c8503a', '#f0ece4'], ['#e0b040', '#f0ece4'], ['#2f6a4e', '#2f6a4e'],
  ['#a8343a', '#a8343a'], ['#3a3a44', '#e8e4dc'], ['#6a3a8a', '#f0ece4'], ['#2e6a8a', '#f0ece4'], ['#1e2a3a', '#1e2a3a'], ['#8a5a2a', '#efe6d0']];
const SIGNS = [['#2a2c38', [236, 206, 120]], ['#e8e0cc', [180, 40, 46]], ['#1e3a5e', [240, 236, 220]], ['#f0ece4', [40, 110, 80]], ['#2f6a4e', [240, 232, 200]],
  ['#8a2a2e', [250, 230, 190]], ['#232838', [236, 214, 150]], ['#e8c040', [40, 40, 50]], ['#2a4a7a', [250, 250, 240]], ['#f4f0e8', [40, 60, 120]]];
// Midtown's own shops (invented names): [name, storefront kind, poi kind or null]
const SHOPS = {
  cafe: [['Daily Grind', 'cafe'], ['Milk & Honey', 'cafe'], ['Golden Crust Bakery', 'cafe'], ['Corner Cup', 'cafe'], ['Tea Leaf', 'cafe']],
  food: [['Lucky Noodle', 'diner'], ['Slice Brothers', 'diner'], ['Taqueria Sol', 'diner'], ['Mama Rosa', 'diner'], ['Pho Corner', 'diner'], ['Gyro King', 'diner'], ['Dumpling House', 'diner']],
  shop: [['Petal & Stem', 'mart'], ['Needle & Thread', 'lobby'], ['Clear View Optics', 'lobby'], ['Second Act Thrift', 'lobby'], ['Polished Nails', 'lobby'], ['Paper Lantern', 'mart'], ['Hardware & Keys', 'mart'], ['Phone Fix', 'mart'], ['Holly Deli', 'mart'], ['Fresh Stop', 'mart'], ['Midtown Shoe Repair', 'mart'], ['Bold Ink Tattoo', 'lobby'], ['Penny Arcade', 'arcade']],
  bar: [['The Trestle Tap', 'bar'], ['Last Stop Lounge', 'bar'], ['The Brass Rail', 'bar']],
};

// ---------------------------------------------------------------------------------------------------------------
export const MIDTOWN = {
  key: 'midtown', d: D, rect: [2860, 1660, 3680, 1900],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of Midtown: placeSpecials leaves them)
  specials: ['Iron Sights Arms', 'FreshHub Grocery', 'MediMart Pharmacy', 'Bean Machine Coffee', 'Motor Row Dealership', 'Fresh Coat Garage'],
  build,
};

// the band of free tiles between two streets (y: their centre lines and kinds)
const band = (yN, kN, yS, kS) => [yN + EXT[kN] + 1, yS - EXT[kS] - 1];
const span = (xW, kW, xE, kE) => [xW + EXT[kW] + 1, xE - EXT[kE]];   // [x0, x1) between two north-south streets

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, walkIns: 0 };
  const named = new Set();
  // ---- the looks of one building ----------------------------------------------------------------------------
  let lastTone = null;
  // a walk-up's or a shop's facade: { style, brickTone | wallColor } - now and then the same as the one before it
  const face = (x, y) => {
    if (lastTone && rnd(x, y, 31) < 0.22) return lastTone;
    const [, kind, tone] = facadeOf(rnd(x, y, 30));
    const f = kind === 'brick' ? { style: 'brick', brickTone: TONE[tone] } : kind === 'stone' ? { style: 'stone', wallColor: pick(['#c8bca4', '#d4c8b0', '#b8ae9c'], rnd(x, y, 32)) } : kind === 'peach' ? { style: 'peach' } : { style: 'stucco', wallColor: pick(STUCCO, rnd(x, y, 33)) };
    lastTone = f;
    return f;
  };
  // a rooftop kit for a walk-up of w x d tiles: a water tower on some, a roof garden on some, AC, a hatch, a line
  const roofKit = (x, y, w, d, o = {}) => {
    const W = w * TILE, H = d * TILE, kit = [], r = (k) => rnd(x, y, 40 + k);
    const at = (fx, fy) => [Math.round(W * fx), Math.round(H * fy)];
    if (W < 96 || H < 96) return [['acs', ...at(0.5, 0.4)]];
    if (o.tank ?? r(1) < 0.3) kit.push(['tank', ...at(0.22 + r(2) * 0.5, 0.3)]);
    if (o.garden ?? r(3) < 0.28) { kit.push(['plant', ...at(0.3, 0.72)], ['plant', ...at(0.62, 0.72)]); if (W >= 200) kit.push(['plant', ...at(0.45, 0.55)]); if (r(4) < 0.5) kit.push(['umb', ...at(0.8, 0.6)]); if (r(5) < 0.4) kit.push(['string', ...at(0.5, 0.86)]); }
    kit.push(['acs', ...at(0.15 + r(6) * 0.2, 0.2)]);
    if (W >= 160) kit.push(['ac', ...at(0.62 + r(7) * 0.2, 0.25)]);
    kit.push(['hatch', ...at(0.85, 0.15 + r(8) * 0.2)]);
    if (r(9) < 0.4) kit.push(['vent', ...at(0.4, 0.15)]);
    if (o.line ?? r(10) < 0.2) kit.push(['line', ...at(0.5, 0.45)]);
    if (r(11) < 0.15) kit.push(['dish', ...at(0.12, 0.6)]);
    if (r(12) < 0.15) kit.push(['sky', ...at(0.5, 0.35)]);
    return kit;
  };
  // a shop on the ground floor of a walk-up: name, storefront kind, poi kind (a walk-in, a business) or a plain business
  const shopLot = (x, y, w, o) => {
    const f = o.face || face(x, y), floors = o.floors ?? 2 + Math.floor(rnd(x, y, 50) * 3);
    const [bg, fg] = o.sign || pick(SIGNS, rnd(x, y, 51));
    const aw = o.awning === undefined ? (rnd(x, y, 52) < 0.7 ? pick(AWNINGS, rnd(x, y, 53)) : null) : o.awning;
    const shop = { kind: o.store || 'mart', door: o.doorSide || (rnd(x, y, 54) < 0.5 ? 'left' : 'right'), open: true, people: o.people ?? 1 + Math.floor(rnd(x, y, 55) * 3), sign: { text: o.name.toUpperCase().slice(0, 18), bg, fg, lit: true }, awning: aw };
    if (o.grille) shop.grille = true;
    if (o.openSign) shop.openSign = { col: [255, 60, 70] };
    const spec = { floors, ...f, parapet: 6 + Math.floor(rnd(x, y, 56) * 6), grime: o.grime ?? 0.12 + rnd(x, y, 57) * 0.15, ...roofMat(rnd(x, y, 58)) };
    if (floors >= 3 && w >= 8 && rnd(x, y, 58) < 0.45) spec.fireEscape = [Math.max(8, Math.round(w * TILE * (0.45 + rnd(x, y, 59) * 0.2)) - 25), 50];
    if (o.shutters || (f.style !== 'brick' && floors >= 2 && rnd(x, y, 60) < 0.3)) spec.shutters = pick(['#3a4a5c', '#2e5a4a', '#56606a', '#6a3a34', '#2e4a6a'], rnd(x, y, 61));
    if (o.mural) spec.mural = o.mural;
    return { arch: 'mixed', ...(o.key ? { key: o.key } : {}), art: { spec, shop, kit: o.kit || roofKit(x, y, w, o.depth || 14) }, name: o.name, poi: o.poi === undefined ? { kind: 'delivery', label: o.name } : o.poi, trade: o.trade || null, whole: true };
  };
  // a residential walk-up: a stoop door, windows, a fire escape now and then; a home behind its door
  const walkup = (x, y, w, o = {}) => {
    const f = o.face || face(x, y), floors = o.floors ?? 3 + Math.floor(rnd(x, y, 70) * 3);
    const spec = { floors, ...f, parapet: 6 + Math.floor(rnd(x, y, 71) * 5), grime: o.grime ?? 0.1 + rnd(x, y, 72) * 0.2, ...roofMat(rnd(x, y, 76)) };
    if (floors >= 3 && w >= 8 && rnd(x, y, 73) < 0.6) spec.fireEscape = [Math.max(8, Math.round(w * TILE * (0.5 + rnd(x, y, 74) * 0.2)) - 25), 50];
    else if (floors >= 3 && rnd(x, y, 75) < 0.3) spec.balconies = true;
    if (o.graffiti) { spec.graffiti = o.graffiti; spec.tagText = o.tag || null; }
    if (o.boarded) spec.boarded = o.boarded;
    if (o.mural) spec.mural = o.mural;
    return { arch: o.arch || 'walkup', art: { spec, noShop: true, kit: o.kit || roofKit(x, y, w, o.depth || 14, { line: o.line }) }, name: o.name || null, home: o.home === false ? null : { kind: 'apartment', ...(o.home || {}) }, whole: true };
  };
  const place = (L, o) => { const b = K.building({ ...L, ...o }); if (b) { if (L.home) out.homes++; if (L.poi) out.shops++; } return b; };

  // A main-street row of the plan's lots (south fronts), x0..x1 in band y0..y1: `list` an explicit list
  // ({ w, kind: 'shop' | 'walkup' | 'gap', ... }), then the rest filled by the generic mix.
  const mainRow = (x0, x1, y0, y1, list = [], o = {}) => {
    let k = 0;
    const depth = o.depth || (y1 - y0 > 24 ? 14 + Math.floor(rnd(x0, y1, 89) * 3) : 99);
    const made = K.row(x0, x1, y0, y1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      const L = k < list.length ? list[k++] : null;
      if (L) {
        if (L.gap) return { gap: L.gap, kind: L.kind || 'passage' };
        const w = Math.min(room, L.w);
        if (L.kind === 'walkup') return { w, depth: L.depth || depth, ...walkup(x, y1, w, L) };
        if (L.kind === 'raw') return { w, depth: L.depth || depth, ...L.lot };
        return { w, depth: L.depth || depth, ...shopLot(x, y1, w, L) };
      }
      // the generic mix: shops 5-8 wide, now and then a walk-up, a passage to the alley, a pocket garden
      const r = rnd(x, y1, 90);
      if (room <= 9) return rnd(x, y1, 91) < 0.5 ? { w: room, depth, ...walkup(x, y1, room, { arch: 'walkup' }) } : { w: room, depth, ...shopLot(x, y1, room, genericShop(x, y1)) };
      if (r < 0.06 && o.passages !== false) return { gap: 2 + Math.floor(rnd(x, y1, 92) * 2), kind: 'passage' };
      if (r < 0.09 && o.gardens !== false) return { gap: 5 + Math.floor(rnd(x, y1, 93) * 3), kind: 'garden' };
      if (r < 0.32) { const w = Math.min(room, 8 + Math.floor(rnd(x, y1, 94) * 4)); return { w, depth, ...walkup(x, y1, w) }; }
      const w = Math.min(room, 5 + Math.floor(rnd(x, y1, 95) * 4));
      return { w, depth, ...shopLot(x, y1, w, genericShop(x, y1)) };
    }, o);
    if (o.yard !== false) backYards(K, made, y0, o);
    return made;
  };
  // a shop with a name not used yet in Midtown
  const genericShop = (x, y) => {
    const r = rnd(x, y, 100), pool = r < 0.24 ? SHOPS.cafe : r < 0.5 ? SHOPS.food : r < 0.58 ? SHOPS.bar : SHOPS.shop;
    for (let t = 0; t < 12; t++) { const [name, store] = pick(pool, rnd(x + t, y, 101)); if (!named.has(name)) { named.add(name); return { name, store }; } }
    return { name: `Shop ${x % 97}`, store: 'mart', poi: { kind: 'delivery', label: 'Storefront' } };
  };
  // A row of backs (fronts facing north onto the street there; the camera sees their back walls on the alley or yard
  // behind): walk-ups with homes, a plain building now and then
  const backRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    const w = room <= 12 ? room : Math.min(room, 7 + Math.floor(rnd(x, y0, 110) * 6));
    if (rnd(x, y0, 111) < (o.yards ?? 0.08)) return { gap: Math.min(room, 4 + Math.floor(rnd(x, y0, 112) * 3)), kind: 'yard' };
    const L = walkup(x, y0, w, { floors: 2 + Math.floor(rnd(x, y0, 113) * 3), grime: o.grime });
    return { w, depth: o.depth || 99, ...L, face: 'N' };
  }, o);

  // ===========================================================================================================
  // Row A: the rail-side row between Trestle Street (the El overhead) and Central Avenue - walk-ups facing south onto
  // Central Avenue, their backs and fire escapes to the viaduct
  const [ay0, ay1] = band(MY.trestle, 'ave', MY.central, 'ave');
  {
    // the west end: walk-ups and a corner store at Westside Avenue
    const [x0, x1] = span(MX.westside, 'ave', MX.garden, 'st');
    mainRow(x0, x1, ay0, ay1, [{ kind: 'shop', w: 8, name: 'Westside Bodega', store: 'mart', poi: { kind: 'convenience', label: 'Westside Bodega' }, awning: ['#2f7a5c', '#f0ece4'], openSign: true }]);
  }
  {
    // the community garden by the tracks (WC315): raised beds, a greenhouse, a tool shed, sunflowers, benches - the
    // plots go to Midtown's flat owners (the garden's plots: gardening, later)
    const [x0, x1] = span(MX.garden, 'st', MX.bridge, 'ave');
    communityGarden(K, x0, ay0, x1 - x0, ay1 - ay0 + 1, out);
  }
  {
    const [x0, x1] = span(MX.bridge, 'ave', MX.carroll, 'st');
    mainRow(x0, x1, ay0, ay1, [{ kind: 'walkup', w: 10 }, { kind: 'shop', w: 7, name: 'The Trestle Tap', store: 'bar', awning: null, people: 3 }]);
  }
  {
    const [x0, x1] = span(MX.carroll, 'st', MX.main, 'ave');
    mainRow(x0, x1, ay0, ay1, [{ kind: 'walkup', w: 9 }, { kind: 'shop', w: 6, ...pickShop('food', 0) }]);
  }
  // the station blocks either side of Madison Street (the stair towers stand on Trestle Street's pavement: the rail pass)
  {
    const [x0, x1] = span(MX.main, 'ave', MX.madison, 'st');
    mainRow(x0, x1, ay0, ay1, [{ kind: 'shop', w: 8, name: 'Station News', store: 'mart', awning: ['#1e3a5e', '#e8e4dc'] }, { kind: 'shop', w: 6, name: 'Last Stop Lounge', store: 'bar', awning: null }]);
  }
  {
    const [x0, x1] = span(MX.madison, 'st', MX.civic, 'ave');
    mainRow(x0, x1, ay0, ay1, [{ kind: 'shop', w: 7, name: 'Platform Coffee', store: 'cafe', poi: { kind: 'coffee', label: 'Platform Coffee' }, awning: ['#8a5a2a', '#efe6d0'] }]);
  }
  for (const [a, ka, b, kb] of [[MX.civic, 'ave', MX.fulton, 'st'], [MX.fulton, 'st', MX.harborview, 'ave'], [MX.harborview, 'ave', MX.mercer, 'st']]) {
    const [x0, x1] = span(a, ka, b, kb);
    mainRow(x0, x1, ay0, ay1, [], { gardens: false });
  }
  {
    // the east end, rougher: by the projects
    const [x0, x1] = span(MX.mercer, 'st', MX.stadium, 'ave');
    K.row(x0, x1, ay0, ay1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      if (rnd(x, ay1, 120) < 0.15) return { gap: Math.min(room, 5), kind: 'yard' };
      const w = Math.min(room, 7 + Math.floor(rnd(x, ay1, 121) * 5));
      return { w, ...walkup(x, ay1, w, { grime: 0.5, graffiti: rnd(x, ay1, 122) < 0.5 ? 1 : 0, boarded: rnd(x, ay1, 123) < 0.3 ? 0.2 : 0 }) };
    }, { rough: true });
  }

  // ===========================================================================================================
  // Rows B: between Central Avenue and Midtown Boulevard, Holly Street through the middle (from Bridge Avenue to the
  // diagonal), an alley behind each row
  const [b1y0, b1y1] = band(MY.central, 'ave', MY.holly, 'st');      // 1708..1743
  const [b2y0, b2y1] = band(MY.holly, 'st', MY.blvd, 'blvd');        // 1757..1792
  const alleyB1 = AL.b1, alleyB2 = AL.b2;
  // --- the west: courtyard apartments (D4) between Westside Avenue and Garden Street, Central Avenue to the boulevard
  {
    const [x0, x1] = span(MX.westside, 'ave', MX.garden, 'st');
    courtyard(K, x0, b1y0, x1 - x0, b2y1 - b1y0 + 1, { walkup, shopLot, out, name: 'Garden Court' });
    const [x2, x3] = span(MX.garden, 'st', MX.bridge, 'ave');
    backRow(x2, x3, b1y0, alleyB1 - 2);
    mainRow(x2, x3, alleyB1 + 2, b1y1, [{ kind: 'walkup', w: 10 }, { kind: 'shop', ...pickShop('cafe', 7) }]);
    backRow(x2, x3, b2y0, alleyB2 - 2);
    mainRow(x2, x3, alleyB2 + 2, b2y1, [{ kind: 'shop', ...pickShop('food', 8) }]);
  }
  // --- Bridge Avenue to Linden Street
  {
    const [x0, x1] = span(MX.bridge, 'ave', MX.linden, 'st');
    backRow(x0, x1, b1y0, alleyB1 - 2);
    mainRow(x0, x1, alleyB1 + 2, b1y1, [{ kind: 'shop', w: 8, name: 'Holly Street Market', store: 'mart', poi: { kind: 'grocery', label: 'Holly Street Market' }, awning: ['#2f6a4e', '#f0ece4'] }]);
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, [{ kind: 'shop', w: 10, name: 'MediMart Pharmacy', store: 'mart', poi: { kind: 'pharmacy', label: 'MediMart Pharmacy' }, sign: ['#f4f0e8', [40, 60, 120]], awning: null, floors: 2 }]);
  }
  // --- Linden to Carroll: the MT2 row on Holly Street (Harper & Co ... Corner Mart), a pocket garden at its west end
  {
    const [x0, x1] = span(MX.linden, 'st', MX.carroll, 'st');
    backRow(x0, x1, b1y0, alleyB1 - 2, { yards: 0.04 });
    const room = x1 - x0;
    const MT2 = [
      { kind: 'gap', gap: Math.max(3, room - 52), kind2: 'garden' },
      { kind: 'shop', w: 7, name: 'Harper & Co', store: 'lobby', poi: { kind: 'delivery', label: 'Harper & Co' }, trade: 'books', awning: null, sign: ['#2f6a4e', [240, 232, 200]], floors: 4, face: { style: 'brick', brickTone: TONE.red } },
      { kind: 'shop', w: 6, name: 'Sunbean', store: 'cafe', poi: { kind: 'coffee', label: 'Sunbean' }, awning: null, sign: ['#4a3a2a', [250, 220, 150]], floors: 3, face: { style: 'stucco', wallColor: '#d8c8a8' } },
      { kind: 'shop', w: 7, name: 'Red Cup Diner', store: 'diner', poi: { kind: 'coffee', label: 'Red Cup Diner' }, key: 'diner', trade: 'diner', awning: ['#a8343a', '#f0ece4'], sign: ['#e8e0cc', [180, 40, 46]], floors: 3, face: { style: 'brick', brickTone: TONE.deep } },
      { kind: 'shop', w: 6, name: 'Lucky Pawn', store: 'pawn', poi: { kind: 'pawn', label: 'Lucky Pawn' }, awning: null, sign: ['#232838', [236, 214, 150]], grille: true, floors: 3, face: { style: 'brick', brickTone: TONE.green } },
      { kind: 'shop', w: 6, name: 'Vinyl & More', store: 'lobby', poi: { kind: 'delivery', label: 'Vinyl & More' }, trade: 'records', awning: null, sign: ['#2a2c38', [236, 206, 120]], floors: 3, face: { style: 'brick', brickTone: TONE.red } },
      { kind: 'shop', w: 6, name: 'Suds Laundry', store: 'mart', poi: { kind: 'delivery', label: 'Suds Laundry' }, trade: 'laundry', awning: null, sign: ['#2a6ab0', [250, 250, 240]], floors: 3, face: { style: 'stucco', wallColor: '#c8c4bc' } },
      { kind: 'shop', w: 5, name: 'Clip Joint', store: 'lobby', poi: { kind: 'barber', label: 'Clip Joint' }, awning: ['#a8343a', '#f0ece4'], sign: ['#8a2a2e', [250, 230, 190]], floors: 3, face: { style: 'brick', brickTone: TONE.brown } },
      { kind: 'shop', w: 8, name: 'Corner Mart', store: 'mart', poi: { kind: 'convenience', label: 'Corner Mart' }, awning: ['#2f8a72', '#f0ece4'], sign: ['#d24a4a', [250, 246, 236]], doorSide: 'right', openSign: true, floors: 3, face: { style: 'brick', brickTone: TONE.red } },
    ];
    mainRow(x0, x1, alleyB1 + 2, b1y1, MT2.map((q) => (q.kind === 'gap' ? { gap: q.gap, kind: 'garden' } : q)));
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, [{ kind: 'shop', w: 9, name: 'Bean Machine Coffee', store: 'cafe', poi: { kind: 'coffee', label: 'Bean Machine Coffee' }, awning: ['#2f6a4e', '#f0ece4'] }]);
  }
  // --- Carroll Street to Main Avenue: the corner bank (OS33) at Holly and Carroll, R1-I's neon cafe at Holly and Main
  {
    const [x0, x1] = span(MX.carroll, 'st', MX.main, 'ave');
    backRow(x0, x1, b1y0, alleyB1 - 2);
    const room = x1 - x0;
    mainRow(x0, x1, alleyB1 + 2, b1y1, [
      { kind: 'raw', w: 12, lot: bankLot(x0, b1y1) },
      ...(room > 34 ? [{}].map(() => ({ kind: 'walkup', w: room - 12 - 8 - 7 })) : []),
      { kind: 'shop', w: 7, name: 'Holly Florist', store: 'mart', awning: ['#6a3a8a', '#f0ece4'] },
      { kind: 'raw', w: 8, lot: neonCafe() },
    ]);
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, []);
  }
  // --- Main Avenue to Madison Street: R1-I's corner store at Holly and Main, the hero corner's diner at Holly and Madison
  {
    const [x0, x1] = span(MX.main, 'ave', MX.madison, 'st');
    backRow(x0, x1, b1y0, alleyB1 - 2);
    const room = x1 - x0;
    mainRow(x0, x1, alleyB1 + 2, b1y1, [
      { kind: 'raw', w: 10, lot: r1iCorner() },
      ...splitLots(room - 10 - 8, (k) => (k % 2 ? { kind: 'walkup', w: 9 } : { kind: 'shop', ...pickShop(k ? 'shop' : 'food', k) })),
      { kind: 'raw', w: 8, lot: heroDiner() },
    ]);
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, []);
  }
  // --- Madison Street to Civic Avenue: the hero corner's corner store, walk-up and Madison Row at Holly and Madison
  {
    const [x0, x1] = span(MX.madison, 'st', MX.civic, 'ave');
    backRow(x0, x1, b1y0, alleyB1 - 2);
    mainRow(x0, x1, alleyB1 + 2, b1y1, [{ kind: 'raw', w: 8, lot: heroMart() }, { kind: 'raw', w: 10, lot: heroWalkup() }, { kind: 'raw', w: 6, lot: madisonRow() }]);
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, [{ kind: 'shop', w: 9, name: 'Holly Hardware', store: 'mart', awning: ['#c8503a', '#f0ece4'] }]);
  }
  // --- along the diagonal (Civic Avenue to Harborview Avenue): Crosstown Way runs from Civic Avenue at Central Avenue
  // to Fulton Street at Holly Street and on to Harborview Avenue at the boulevard. North-east of it: a row of backs on
  // the street above (Central Avenue, Holly Street), then lots stepping down to the diagonal, their fronts on its
  // pavement. South-west of it: lots facing the street below (Holly Street, the boulevard) as deep as the diagonal lets
  // them - their backs step along it. The wedge (MT1) is the sharp corner at the boulevard.
  {
    const [cx0, cx1] = span(MX.civic, 'ave', MX.harborview, 'ave');
    // the band between Central Avenue and Holly Street
    backRow(cx0, cx1, b1y0, alleyB1 - 2, { mask: northOfDiag });
    mainRow(cx0, cx1, alleyB1 - 1, b1y1, [], { passages: false, mask: northOfDiag, depth: 99, yard: false });
    mainRow(cx0, cx1, b1y0, b1y1, [], { mask: southOfDiag, depth: 99, yard: false });
    // between Holly Street and the boulevard
    wedge(K, out);
    mainRow(cx0, cx1, b2y0, b2y1, [], { mask: southOfDiag, depth: 99, yard: false });
    backRow(cx0, cx1, b2y0, b2y0 + 10, { mask: northOfDiag });
    mainRow(cx0, cx1, b2y0 + 12, b2y1, [], { passages: false, mask: northOfDiag, depth: 99, yard: false });
  }
  // --- Harborview to Mercer: the rough edge begins - walk-ups with tags, a liquor store, walled yards
  {
    const [x0, x1] = span(MX.harborview, 'ave', MX.mercer, 'st');
    roughBlock(K, x0, b1y0, x1 - x0, b1y1 - b1y0 + 1, { walkup, shopLot, out });
    roughBlock(K, x0, b2y0, x1 - x0, b2y1 - b2y0 + 1, { walkup, shopLot, out });
  }
  // --- Mercer to Stadium Avenue: the projects (PJ1), on the rough east edge
  {
    const [x0, x1] = span(MX.mercer, 'st', MX.stadium, 'ave');
    projects(K, x0, b1y0, x1 - x0, b2y1 - b1y0 + 1, { walkup, shopLot, out });
  }

  // ===========================================================================================================
  // Rows C: Midtown Boulevard to Harbor Avenue, Pier Street between; Union Square by the subway
  const [c1y0, c1y1] = band(MY.blvd, 'blvd', MY.pier, 'st');        // 1808..1843
  const [c2y0, c2y1] = band(MY.pier, 'st', MY.harbor, 'ave');       // 1857..1892
  const alleyC1 = AL.c1, alleyC2 = AL.c2;
  {
    // the west: Westside Avenue to Garden Street, Garden Street to Bridge Avenue
    for (const [a, ka, b, kb] of [[MX.westside, 'ave', MX.garden, 'st'], [MX.garden, 'st', MX.bridge, 'ave']]) {
      const [x0, x1] = span(a, ka, b, kb);
      backRow(x0, x1, c1y0, c1y0 + 15);
      mainRow(x0, x1, c1y0 + 16, c1y1, []);
      backRow(x0, x1, c2y0, alleyC2 - 2);
      mainRow(x0, x1, alleyC2 + 2, c2y1, []);
    }
  }
  {
    // Bridge Avenue to Spring Street: the strip of sports, guns, hardware and clothes (Iron Sights Arms...) on Pier
    // Street; the dealership on Harbor Avenue
    const [x0, x1] = span(MX.bridge, 'ave', MX.spring, 'st');
    backRow(x0, x1, c1y0, alleyC1 - 2);
    mainRow(x0, x1, alleyC1 + 2, c1y1, [{ kind: 'raw', w: 40, lot: stripLot(x0, c1y1), depth: 16 }]);
    dealership(K, x0, c2y0, 46, c2y1 - c2y0 + 1, out);
    mainRow(x0 + 46, x1, c2y0, c2y1, [], { depth: 16 });
  }
  {
    // Spring Street to Main Avenue: FreshHub Grocery on Pier Street, Union Square below it
    const [x0, x1] = span(MX.spring, 'st', MX.main, 'ave');
    backRow(x0, x1, c1y0, alleyC1 - 2);
    mainRow(x0, x1, alleyC1 + 2, c1y1, [{ kind: 'raw', w: 30, lot: groceryLot(), depth: 16 }]);
    unionSquare(K, x0, c2y0, x1 - x0, c2y1 - c2y0 + 1, out);
  }
  for (const [a, ka, b, kb] of [[MX.main, 'ave', MX.madison, 'st'], [MX.madison, 'st', MX.civic, 'ave']]) {
    const [x0, x1] = span(a, ka, b, kb);
    backRow(x0, x1, c1y0, alleyC1 - 2);
    mainRow(x0, x1, alleyC1 + 2, c1y1, a === MX.main ? [{ kind: 'raw', w: 14, lot: garageLot(), depth: 16 }] : []);
    backRow(x0, x1, c2y0, alleyC2 - 2);
    mainRow(x0, x1, alleyC2 + 2, c2y1, []);
  }
  {
    // Civic Avenue to Harborview Avenue (Fulton Street between)
    for (const [a, ka, b, kb] of [[MX.civic, 'ave', MX.fulton, 'st'], [MX.fulton, 'st', MX.harborview, 'ave']]) {
      const [x0, x1] = span(a, ka, b, kb);
      backRow(x0, x1, c1y0, c1y0 + 14);
      mainRow(x0, x1, c1y0 + 15, c1y1, []);
      backRow(x0, x1, c2y0, c2y0 + 14);
      mainRow(x0, x1, c2y0 + 15, c2y1, []);
    }
  }
  {
    // east of Harborview Avenue: the pocket plaza in the corner opposite the wedge (MT1's: its fountain, benches, trees),
    // then the diagonal's two sides down to Harbor Avenue - small rough lots
    pocketPlaza(K, out);
    const [x0, x1] = span(MX.harborview, 'ave', MX.mercer, 'st');
    roughBlock(K, x0, c1y0, x1 - x0, c2y1 - c1y0 + 1, { walkup, shopLot, out, mask: southOfDiag });
    const [x2, x3] = span(MX.harborview, 'ave', MX.stadium, 'ave');
    roughBlock(K, x2, c1y0, x3 - x2, c2y1 - c1y0 + 1, { walkup, shopLot, out, mask: northOfDiag });
  }
  // the street trees, benches and bus stops of the main streets (curated: the generator's sprinkle stays off here)
  streetDressing(K, out);
  out.named = named.size;
  return out;

  function pickShop(cat, k) { for (let t = 0; t < 20; t++) { const [name, store] = pick(SHOPS[cat], rnd(k * 31 + t, cat.length, 102)); if (!named.has(name)) { named.add(name); return { name, store, w: 6 }; } } return { name: 'Storefront', store: 'mart', w: 6 }; }
  function splitLots(room, f) { const out2 = []; let k = 0; while (room >= 5) { const L = f(k++); const w = Math.min(room, L.w || 6); out2.push({ ...L, w }); room -= w; } if (room > 0) out2.push({ gap: room, kind: 'passage' }); return out2; }
}

// ---------------------------------------------------------------------------------------------------------------
// The yards behind a main-street row (the strip between the lots' backs and the alley): paved, each lot's own - its
// bins and dumpster by the alley, the AC on the ground, a stack of crates or pallets behind a shop, a bike, a table and
// a couple of chairs, a pot of herbs; a picket or chain-link fence between some; rougher toward the east end.
function backYards(K, made, y0, o = {}) {
  const { rnd, pick, prop, fill } = K;
  for (const b of made) {
    if (!b || b.gap || b.tw === undefined) continue;
    const x = b.tx, w = b.tw, yb = b.ty, h = yb - y0;
    if (h < 2) continue;
    let n = 0;
    for (let yy = y0; yy < yb; yy++) for (let xx = x; xx < x + w; xx++) if (K.free(xx, yy)) n++;
    if (n < w) continue;
    const rough = o.rough || rnd(x, yb, 200) < 0.12;
    fill(x, y0, w, h, T.PLAZA);
    const r = (k) => rnd(x, yb, 210 + k);
    // by the alley: the bins and the dumpster
    prop(r(1) < 0.5 ? pick(['dump_g', 'dump_b'], r(2)) : 'trashcan', x + 1.4 + r(3) * Math.max(0.5, w - 3), y0 + 0.9, 12);
    if (w >= 6 && r(4) < 0.6) prop('trashcan', x + w - 1.2, y0 + 0.9, 0);
    // against the back wall: what the shop or the flats keep there
    if (h >= 4) {
      const pool = rough ? ['tires', 'pallet', 'burnbarrel', 'crates', 'dump_o', 'drum'] : b.business ? ['crates', 'pallet_s', 'acunit', 'crates', 'drum'] : ['potted', 'bikerack', 'acunit', 'flowers_a', 'potted', 'bench_m'];
      const k = 1 + Math.floor(r(5) * Math.min(3, w / 3));
      for (let i = 0; i < k; i++) prop(pick(pool, r(6 + i)), x + 1 + ((i + 0.5) / k) * (w - 2), yb - 1.2, 8);
      if (!b.business && !rough && h >= 6 && w >= 7 && r(10) < 0.35) { prop('cafetable', x + w / 2, y0 + h / 2, 0); }
    }
    // a fence on its west side now and then (the yards' own: picket in the quiet ones, chain-link in the rough)
    if (r(11) < 0.4 && h >= 3) prop(rough ? 'chainfence' : 'fenceline', x + 0.1, y0 + 2, 0, rough ? { tx: 0, ty: (h - 2) * TILE } : { kind: 'picket', tx: 0, ty: (h - 2) * TILE });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The set pieces
// R1-A, the hero corner (the old world's Starlite Diner, Corner Mart, Madison Walk-up and Madison Row, their looks as
// shared/map.js HERO_BLDS drew them): Holly Street at Madison Street.
function heroDiner() {
  return { arch: 'diner', key: 'diner', name: 'Starlite Diner', poi: { kind: 'coffee', label: 'Starlite Diner' }, whole: true,
    art: { spec: { floors: 1, style: 'diner', trim: [255, 70, 90], neon: { icon: 'cup', col: [70, 210, 255], x: 150, y: -4 }, parapet: 10, roofMat: 'membrane', lip: 8, rimW: 4 },
      shop: { kind: 'diner', door: 'right', open: true, people: 4, awning: null, band: null, sign: null },
      kit: [['ac', 44, 40], ['ac', 92, 40], ['acs', 150, 44], ['vent', 30, 96], ['vent', 210, 92], ['hatch', 180, 120], ['plant', 60, 150], ['ac', 120, 170], ['palm', 214, 168]] } };
}
function heroMart() {
  return { arch: 'mart', name: 'Corner Mart Madison', poi: { kind: 'convenience', label: 'Madison Corner Mart' }, whole: true,
    art: { spec: { floors: 1, style: 'concrete', wallColor: '#d8d2c4', parapet: 26, roofMat: 'membrane', lip: 10, rimW: 4 },
      shop: { kind: 'mart', door: 'left', open: true, people: 2, awning: ['#2f8a72', '#f0ece4'], band: ['#d24a4a', '#f0ece4'], clerkShirt: [44, 140, 120], sign: null, grille: false, openSign: { col: [255, 60, 70] } },
      kit: [['plant', 40, 30], ['plant', 120, 26], ['ac', 190, 44], ['acs', 60, 90], ['vent', 140, 96], ['palm', 214, 120], ['plant', 100, 150]] } };
}
function heroWalkup() {
  return { arch: 'walkup', name: 'Madison Walk-up', home: { kind: 'apartment' }, whole: true,
    art: { spec: { floors: 4, style: 'brick', brickTone: '#9a4a38', parapet: 8, fireEscape: [168, 96], balconies: false, grime: 0.12, graffiti: 0, ivy: 0, roofMat: 'tar', lip: 10, rimW: 4,
      doors: [{ x: 48, w: 22, kind: 'door', open: false }], windows: [14, 96, 136, 212, 252, 284], porchLight: true, blank: false },
    noShop: true, kit: [['tank', 254, 48], ['acs', 60, 40], ['acs', 100, 40], ['vent', 150, 60], ['plant', 210, 120], ['hatch', 40, 150], ['chim', 290, 30]] } };
}
function madisonRow() {
  return { arch: 'walkup', name: 'Madison Row', home: { kind: 'apartment' }, whole: true,
    art: { spec: { floors: 3, style: 'brick', brickTone: '#5e3a30', parapet: 8, roofMat: 'tar', lip: 10, rimW: 4, doors: [{ x: 70, w: 20, kind: 'door' }], windows: [16, 44, 120, 150], porchLight: true, blank: false },
      noShop: true, kit: [['acs', 60, 44], ['vent', 140, 60], ['plant', 100, 150]] } };
}
// R1-I: the brick walk-up with the corner store under its striped awning (Holly Street at Main Avenue)
function r1iCorner() {
  return { arch: 'mixed', name: 'Main Street Grocery', poi: { kind: 'convenience', label: 'Main Street Grocery' }, whole: true,
    art: { spec: { floors: 4, style: 'brick', brickTone: '#86503c', parapet: 8, fireEscape: [150, 60], grime: 0.15, roofMat: 'tar', lip: 10, rimW: 4 },
      shop: { kind: 'mart', door: 'left', open: true, people: 2, awning: ['#2f7a5c', '#f0ece4'], sign: { text: 'GROCERY', bg: '#f0ece4', fg: [40, 110, 80], lit: true }, openSign: { col: [255, 60, 70] } },
      kit: [['tank', 220, 60], ['acs', 60, 40], ['plant', 100, 170], ['plant', 160, 170], ['hatch', 40, 140], ['line', 140, 110]] } };
}
// R1-I's neon coffee-cup cafe across the street (Midtown's corner cafe): a chalkboard, a window counter
function neonCafe() {
  return { arch: 'cafe', name: 'Cup & Saucer', poi: { kind: 'coffee', label: 'Cup & Saucer' }, whole: true,
    art: { spec: { floors: 2, style: 'stucco', wallColor: '#e4d6b8', parapet: 10, neon: { icon: 'cup', col: [255, 120, 60], x: 90, y: -2 }, roofMat: 'membrane', lip: 8, rimW: 4 },
      shop: { kind: 'cafe', door: 'right', open: true, people: 3, awning: ['#a8343a', '#f0ece4'], sign: { text: 'CUP & SAUCER', bg: '#2a2c38', fg: [255, 200, 120], lit: true } },
      kit: [['plant', 50, 40], ['umb', 120, 90], ['table', 160, 100], ['string', 120, 150], ['acs', 200, 40]] } };
}
// OS33: the corner bank with its ATM, a heist target
function bankLot() {
  return { arch: 'bank', name: 'Midtown Savings Bank', poi: { kind: 'bank', label: 'Midtown Savings Bank' }, whole: true,
    art: { spec: { floors: 3, style: 'stone', wallColor: '#d4c8b0', parapet: 10 } } };
}
// the special businesses of Midtown (shared/map.js SPECIALS: their names, kinds and look)
function stripLot() {
  return { arch: 'strip', key: 'strip', name: 'Pier Street Shops', units: [['gunshop', 'Iron Sights Arms'], ['sports', 'Home Run Sports'], ['hardware', 'Nail & Gear Hardware'], ['clothing', 'Threads Outfitters']] };
}
function groceryLot() {
  return { arch: 'strip', key: 'strip', name: 'FreshHub Grocery', poi: { kind: 'grocery', label: 'FreshHub Grocery' }, whole: true,
    art: { spec: { floors: 1, style: 'stucco', wallColor: '#e2dccc', parapet: 14 }, shop: { kind: 'mart', door: 'left', open: true, people: 3, awning: ['#2f8a4e', '#2f8a4e'], sign: { text: 'FRESHHUB GROCERY', bg: '#2f8a4e', fg: [250, 246, 236], lit: true } } } };
}
function garageLot() {
  return { arch: 'garage', key: 'repair', name: 'Fresh Coat Garage', poi: { kind: 'garage', label: 'Fresh Coat Garage' }, whole: true };
}

// The community garden by the tracks (WC315): raised beds in rows, a greenhouse, a tool shed, a bench under a tree,
// sunflowers along the fence, a water butt; open to the street through a gate in its fence
function communityGarden(K, x, y, w, h, out) {
  const { prop, fill, rnd } = K;
  fill(x, y, w, h, T.GRASS);
  K.take(x, y, w, h);
  // the path down the middle from the gate on Central Avenue
  const mx = x + (w >> 1);
  fill(mx - 1, y, 2, h, T.DIRT);
  for (let yy = y + 2; yy < y + h - 2; yy += 4) for (const bx of [x + 3, x + 9, mx + 4, mx + 10]) if (bx + 4 < x + w - 1 && (bx < mx - 3 || bx > mx + 1)) prop('raisedbed', bx + 1.5, yy + 1, 0, { v: (bx * 7 + yy) % 5 });
  prop('greenhouse', x + w - 7, y + 4, 26);
  prop('shed', x + 4, y + 3, 18);
  prop('bench_m', mx + 3, y + h - 3, 0);
  prop('tree_b', x + w - 4, y + h - 4, 12, { sp: 'oak', k: 1.2 });
  for (let xx = x + 1; xx < x + w - 1; xx += 3) if (Math.abs(xx - mx) > 2) prop('flowers_a', xx + 0.5, y + h - 1.2, 0);
  prop('fenceline', x + 0.2, y + h - 0.5, 0, { kind: 'picket', tx: (mx - 1.5 - x) * TILE, ty: 0 });
  prop('fenceline', mx + 1.5, y + h - 0.5, 0, { kind: 'picket', tx: (x + w - 0.2 - mx - 1.5) * TILE, ty: 0 });
  prop('textsign', mx, y + h - 2, 0, { text: 'COMMUNITY GARDEN', bg: '#2f6a4e', fg: [250, 240, 200], z: 30, sx: 1 });
  void rnd;
  (out.places ||= []).push({ name: 'Trestle Community Garden', x0: x, y0: y, x1: x + w, y1: y + h });
}

// Courtyard apartments (D4, HO5): a ring of walk-ups round a court - the south row's fronts on the boulevard (a corner
// bodega, a mural on the end wall), the north row facing Central Avenue (its south faces, the court's view: back doors,
// fire escapes, laundry), the side wings, a half court, a garden and a gate
function courtyard(K, x, y, w, h, ctx) {
  const { walkup, shopLot, out } = ctx;
  const { rnd, prop, fill, paint } = K;
  const rowD = 14, wing = 12;
  // the north row (fronts on Central Avenue, north)
  K.row(x, x + w, y, y + rowD - 1, (xx, room) => { if (room < 4) return null; const ww = room <= 13 ? room : 9 + Math.floor(rnd(xx, y, 140) * 4); return { w: ww, ...walkup(xx, y, ww, { floors: 4, line: true }), face: 'N' }; });
  // the side wings (west and east), their doors on the court
  for (const wx of [x, x + w - wing]) K.building({ x: wx, y: y + rowD, w: wing, h: h - 2 * rowD, ...walkup(wx, y + rowD, wing, { floors: 4 }), door: null, home: null });
  // the south row on the boulevard: shops and the corner bodega
  K.row(x, x + w, y + h - rowD, y + h - 1, (xx, room, i) => {
    if (room < 4) return null;
    if (i === 0) return { w: 8, ...shopLot(xx, y + h - 1, 8, { name: 'Court Bodega', store: 'mart', poi: { kind: 'convenience', label: 'Court Bodega' }, awning: ['#e0b040', '#f0ece4'], openSign: true, floors: 4 }) };
    if (room >= 10 && Math.abs(xx + 3 - (x + (w >> 1))) < 6) return { gap: 6, kind: 'passage' };   // the gate into the court
    const ww = room <= 13 ? room : 9 + Math.floor(rnd(xx, y + h, 141) * 4);
    return { w: ww, ...walkup(xx, y + h - 1, ww, { floors: 4 }) };
  });
  // the court: paving, a half court with its hoop at the north end, a lawn with a tree and the garden beds in the
  // middle, benches, bikes by the gate
  const cx0 = x + wing, cy0 = y + rowD, cw = w - 2 * wing, ch = h - 2 * rowD;
  fill(cx0, cy0, cw, ch, T.PLAZA); K.take(cx0, cy0, cw, ch);
  const mid = cx0 + cw / 2;
  if (cw >= 16 && ch >= 30) {
    prop('court', mid, cy0 + 1.5, 0, { w: Math.min(cw - 4, 14) * TILE, d: 10 * TILE, c1: '#4a6a8a', c2: '#c86a3a' });
    prop('hoop', mid, cy0 + 2.1, 6);
    // the lawn
    const ly0 = cy0 + 15, lh = ch - 24;
    paint(cx0 + 2, ly0, cw - 4, lh, T.GRASS);
    prop('tree_b', mid, ly0 + lh / 2, 12, { sp: 'maple', k: 1.3 });
    for (let k = 0; k < 4; k++) prop('raisedbed', cx0 + 4 + (k % 2) * (cw - 9), ly0 + 3 + (k >> 1) * (lh - 7), 0, { v: k });
    prop('flowers_big', cx0 + 4, ly0 + lh / 2, 0); prop('flowers_a', cx0 + cw - 5, ly0 + lh / 2, 0);
    prop('bench_m', mid - 5, ly0 - 1.2, 0); prop('bench_m', mid + 4, ly0 - 1.2, 0);
    prop('picnic', mid, ly0 + lh + 2, 0);
    prop('bikerack', mid + 6, cy0 + ch - 2, 0); prop('trashcan', mid - 6, cy0 + ch - 2, 0);
    prop('lamp', cx0 + 1.5, ly0 - 1, 0); prop('lamp', cx0 + cw - 1.5, ly0 + lh + 1, 0);
  }
  (out.places ||= []).push({ name: ctx.name, x0: x, y0: y, x1: x + w, y1: y + h });
}

// The projects (PJ1): brick slabs round a yard - two across the back and one down each side, their doors on the yard
// (its cracked court and hoop, the burn barrel, benches, trees in the paving, laundry); along the boulevard the bottle
// shop and the pawn shop on the corner, a fenced lot with a burned-out car beside them. The cheapest homes in the city.
function projects(K, x, y, w, h, ctx) {
  const { walkup, shopLot, out } = ctx;
  const { prop, fill, paint } = K;
  const slab = (bx, by, bw, bh, name) => {
    const L = walkup(bx, by, bw, { floors: 5, grime: 0.45, graffiti: 1, line: true, home: { price: 7000 } });
    L.art.spec.balconies = false;
    L.art.spec.fireEscape = [Math.max(8, Math.round(bw * TILE * 0.5) - 25), 50];
    return K.building({ x: bx, y: by, w: bw, h: bh, ...L, name });
  };
  const sh = 13, rowS = 16, side = 13;   // a slab's depth, the boulevard row's, a side slab's width
  const backW = (w - 6) >> 1;
  slab(x + 1, y + 1, backW, sh, 'Midtown Houses A');
  slab(x + w - backW - 1, y + 1, backW, sh, 'Midtown Houses B');
  const sy0 = y + sh + 5, sy1 = y + h - rowS - 6;   // the side slabs, the yard's west and east sides
  slab(x + 1, sy0, side, sy1 - sy0, 'Midtown Houses C');
  slab(x + w - side - 1, sy0, side, sy1 - sy0, 'Midtown Houses D');
  // the yard: cracked paving, the court and its hoop at the north end, the burn barrel and the benches; a worn lawn
  // with trees and picnic tables in the middle; the residents' car park at the south end
  const yx = x + side + 2, yy = y + sh + 2, yw = w - 2 * side - 4, yh = sy1 - yy;
  fill(yx, yy, yw, yh, T.PLAZA); K.take(yx, yy, yw, yh);
  const cx = x + w / 2;
  if (yw >= 24 && yh >= 30) {
    prop('court', cx, yy + 1.5, 0, { w: 15 * TILE, d: 11 * TILE, c1: '#5a5a62', c2: '#7a4a9a' });
    prop('hoop', cx, yy + 2.1, 6);
    prop('burnbarrel', cx - 10, yy + 10, 8); prop('bench_m', cx - 13, yy + 12, 0);
    const ly0 = yy + 15, lh = Math.max(6, yh - 28);
    paint(yx + 2, ly0, yw - 4, lh, T.GRASS);
    for (const tx of [yx + 5, cx, yx + yw - 5]) prop('tree_a', tx, ly0 + lh / 2, 12, { sp: 'street', k: 1.15 });
    prop('picnic', cx - 7, ly0 + lh / 2 + 1, 0); prop('picnic', cx + 7, ly0 + lh / 2 - 1, 0);
    prop('bench_m', yx + 3, ly0 - 1.2, 0); prop('trashcan', yx + yw - 3, ly0 - 1.2, 0);
    // the car park: a row of bays across the yard's south end
    const py = ly0 + lh + 4;
    paint(yx + 1, py - 2, yw - 2, Math.max(4, yy + yh - py + 2), T.LOT);
    for (let sx = yx + 2; sx + 2 <= yx + yw - 2; sx += 2) { K.m.parking.push({ x: (sx + 1) * TILE, y: py * TILE, a: -Math.PI / 2 }); K.m.stalls.push({ x: sx * TILE, y: (py - 2) * TILE, w: 2 * TILE, h: 4 * TILE }); }
    prop('dump_o', yx + 2, yy + yh - 1.2, 16);
  }
  // the boulevard row: the bottle shop and the pawn shop on the corner, the fenced lot with the burned-out car
  K.row(x, x + w, y + h - rowS, y + h - 1, (xx, room, i) => {
    if (room < 4) return null;
    if (i === 0) return { w: 10, depth: 12, ...shopLot(xx, y + h - 1, 10, { name: 'Bottle Shop', store: 'liquor', poi: { kind: 'delivery', label: 'Bottle Shop' }, awning: null, sign: ['#8a2a2e', [255, 220, 160]], grille: true, openSign: true, floors: 1, grime: 0.4 }) };
    if (i === 1) return { w: 10, depth: 12, ...shopLot(xx, y + h - 1, 10, { name: 'Lucky Pawn Two', store: 'pawn', poi: { kind: 'pawn', label: 'Mercer Pawn' }, awning: null, sign: ['#232838', [236, 214, 150]], grille: true, floors: 1, grime: 0.4 }) };
    return { gap: room, kind: 'yard' };
  }, { rough: true });
  // (the burned-out car and the chain-link round the lot)
  const lx = x + 22, ly = y + h - rowS;
  if (x + w - lx > 12) { prop('chainfence', lx, ly + 1, 0, { tx: (x + w - 2 - lx) * TILE, ty: 0 }); prop('rubble', lx + 8, ly + 6, 0); prop('tires', lx + 4, ly + 9, 0); }
  (out.places ||= []).push({ name: 'Midtown Houses', x0: x, y0: y, x1: x + w, y1: y + h });
}

// A rough block at the east end (the wealth seam toward The Yards): walk-ups with grime and tags, a liquor store,
// walled yards, a vacant lot
function roughBlock(K, x, y, w, h, ctx) {
  const { walkup, shopLot } = ctx;
  const { rnd } = K;
  const rows = h >= 60 ? [[y, y + 15, 'N'], [y + h - 18, y + h - 1, 'S'], [y + 18, y + 33, 'N'], [y + h - 36, y + h - 20, 'S']] : h >= 30 ? [[y, y + h - 20, 'N'], [y + h - 18, y + h - 1, 'S']] : [[y, y + h - 1, 'S']];
  for (const [r0, r1, f] of rows) {
    K.row(x, x + w, r0, r1, (xx, room, i) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      if (rnd(xx, r1, 150) < 0.16) return { gap: Math.min(room, 5 + Math.floor(rnd(xx, r1, 151) * 4)), kind: 'yard' };
      const ww = Math.min(room, 7 + Math.floor(rnd(xx, r1, 152) * 5));
      if (f === 'S' && i % 4 === 1) return { w: ww, ...shopLot(xx, r1, ww, { name: pickRough(xx, r1), store: rnd(xx, r1, 153) < 0.5 ? 'liquor' : 'mart', grille: true, openSign: true, awning: rnd(xx, r1, 154) < 0.4 ? ['#3a3a44', '#e8e4dc'] : null, grime: 0.45, floors: 2 + Math.floor(rnd(xx, r1, 155) * 2) }) };
      return { w: ww, ...walkup(xx, r1, ww, { grime: 0.45, graffiti: rnd(xx, r1, 156) < 0.4 ? 1 : 0, boarded: rnd(xx, r1, 157) < 0.2 ? 0.25 : 0 }), ...(f === 'N' ? { face: 'N' } : {}) };
    }, { rough: true, mask: ctx.mask || null });
  }
}
const ROUGH_NAMES = ['Quick Cash', 'Beer Wine Liquor', 'Check Cashing', 'Mercer Mini Mart', 'Cell Shop', 'Lotto & More', 'Discount Smokes', 'Wash & Fold'];
const pickRough = (x, y) => ROUGH_NAMES[(x * 7 + y * 3) % ROUGH_NAMES.length];

// Motor Row Dealership on Harbor Avenue: the glass showroom at the back, its display lot in front (buildDealerLots
// stands the cars for sale on it)
function dealership(K, x, y, w, h, out) {
  const sw = Math.min(26, w - 8), sh = 12;
  K.building({ x: x + 4, y, w: sw, h: sh, arch: 'showroom', key: 'dealer', name: 'Motor Row Dealership', poi: { kind: 'dealer', label: 'Motor Row Dealership' }, whole: true,
    art: { spec: { floors: 2, style: 'glass', wallColor: '#9aa8b4', parapet: 8 } } });
  K.fill(x, y, w, h, T.LOT);
  for (let k = 0; k < 5; k++) K.prop('bollard', x + 6 + k * 6, y + h - 1.5, 5);
  K.prop('textsign', x + sw + 8, y + h - 3, 0, { text: 'MOTOR ROW', bg: '#1e3a5e', fg: [250, 236, 160], z: 54 });
  void out;
}
// a subway entrance's plaza (shared/map.js reserveSubwayPlazas) within r tiles of (x, y): kept clear and paved
function onSubwayPlaza(m, x, y, r = 0) { return (m.subwayPlazas || []).some((q) => x >= q.x - r && x < q.x + q.w + r && y >= q.y - r && y < q.y + q.h + r); }
// none of the tiles within r of (x, y) reserved (the subway's stairs, a plaza kept) or built
function clearOf(K, x, y, r) {
  const m = K.m;
  if (onSubwayPlaza(m, x, y, r + 1)) return false;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const i = Math.floor(y + dy) * m.w + Math.floor(x + dx); if ((m.reserve[i] & ~16) || m.tiles[i] === T.BUILDING || m.tiles[i] === T.ROAD) return false; }
  return true;
}

// Union Square: the square by the subway (its stops below, Union Square on both lines) - paving, a fountain in the
// middle, rows of plane trees, benches round it, lamps, flower beds, a newsstand and a hot-dog cart
function unionSquare(K, x, y, w, h, out) {
  const { prop, fill } = K;
  fill(x, y, w, h, T.PLAZA); K.take(x, y, w, h);
  // four lawns round the middle, crossed by the paths to the corners; the fountain where they meet
  const cx = Math.round(x + w / 2), cy = Math.round(y + h / 2), gw = Math.floor(w / 2) - 7, gh = Math.floor(h / 2) - 5;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const gx = sx < 0 ? cx - 4 - gw : cx + 4, gy = sy < 0 ? cy - 3 - gh : cy + 3;
    for (let yy = gy; yy < gy + gh; yy++) for (let xx = gx; xx < gx + gw; xx++) { const i = yy * K.m.w + xx; if (!(K.m.reserve[i] & ~16) && !onSubwayPlaza(K.m, xx, yy, 1) && K.m.tiles[i] === T.PLAZA) K.m.tiles[i] = T.GRASS; }
    // the plane trees round each lawn, a flower bed in it
    for (let tx = gx + 2; tx < gx + gw - 1; tx += 7) for (const ty of [gy + 1.5, gy + gh - 1.5]) if (clearOf(K, tx, ty, 2)) prop('tree_b', tx, ty, 12, { sp: 'streetPl', k: 1.2 });
    if (clearOf(K, gx + gw / 2, gy + gh / 2, 2)) prop('flowers_big', gx + gw / 2, gy + gh / 2, 0);
  }
  if (clearOf(K, cx, cy, 3)) prop('fountain', cx, cy, 36);
  for (const [dx, dy] of [[-6, -2.4], [6, -2.4], [-6, 2.6], [6, 2.6]]) if (clearOf(K, cx + dx, cy + dy, 1)) prop('pbench', cx + dx, cy + dy, 0);
  for (const [fx, fy] of [[0.03, 0.08], [0.97, 0.08], [0.03, 0.92], [0.97, 0.92]]) prop('lamp', x + w * fx, y + h * fy, 0);
  // the life of it: the food cart, the newsstand, a couple of market stalls along the north edge
  if (clearOf(K, x + 4, y + h - 3, 1)) prop('foodcart', x + 4, y + h - 3, 10);
  if (clearOf(K, x + w - 4, y + h - 3, 1)) prop('news_b', x + w - 4, y + h - 3, 0);
  for (let k = 0; k < 3; k++) { const sx = x + 10 + k * 8; if (clearOf(K, sx, y + 2, 2)) prop('mstall', sx, y + 2, 0, { v: k }); }
  (out.places ||= []).push({ name: 'Union Square', x0: x, y0: y, x1: x + w, y1: y + h });
  K.m.squares ||= [];
  K.m.squares.push({ x, y, w, h, name: 'Union Square' });
}

// MT1: the wedge building in the sharp corner where Crosstown Way meets the boulevard at Harborview Avenue - north of
// the boulevard, under the diagonal - built in steps along the diagonal, one look and one roof line (the plan's one
// wedge per diagonal: every other building stays square to the grid)
function wedge(K, out) {
  const yS = MY.blvd - EXT.blvd - 1, f = { style: 'brick', brickTone: '#b07a52' };
  let made = 0, xe0 = null;
  for (let step = 0; step < 5; step++) {
    // each step a slice 5 tiles deep, the northern ones shorter: it ends where the diagonal's pavement begins
    const y1 = yS - step * 5, y0 = y1 - 4;
    let xe = MX.harborview - EXT.ave - 1;
    while (xe > MX.civic + 20 && !(K.free(xe, y0) && southOfDiag(xe, y0))) xe--;
    if (xe0 === null) xe0 = xe;
    const xw = xe0 - 34;
    if (xe - xw < 8) break;
    if (!K.allFree(xw, y0, xe - xw + 1, 5)) break;
    const first = step === 0;
    K.building({ x: xw, y: y0, w: xe - xw + 1, h: 5, arch: 'mixed', whole: true, name: first ? 'The Wedge' : null, back: !first, door: first ? undefined : null, poi: first ? { kind: 'coffee', label: 'Wedge Cafe' } : false,
      art: { spec: { floors: 6, ...f, parapet: 12, roofMat: 'tar', lip: 10, rimW: 4, balconies: false, fireEscape: first ? [60, 50] : null, groundH: first ? undefined : 0 }, noShop: !first,
        shop: first ? { kind: 'cafe', door: 'right', open: true, people: 3, awning: ['#2f6a4e', '#f0ece4'], sign: { text: 'WEDGE CAFE', bg: '#2f6a4e', fg: [240, 232, 200], lit: true } } : undefined,
        kit: step === 2 ? [['tank', 80, 60], ['acs', 160, 60]] : [['acs', 60, 60], ['vent', 140, 70]] } });
    made++;
  }
  out.wedge = made;
}
// MT1's pocket plaza across the street from the wedge: the triangle between Harborview Avenue, the boulevard and the
// diagonal - a fountain, benches round it, a tree, flower beds, lamps
function pocketPlaza(K, out) {
  const { m, prop, fill } = K;
  const x0 = MX.harborview + EXT.ave + 1, y0 = MY.blvd + EXT.blvd + 1, y1 = MY.pier + EXT.st;
  let n = 0, sx = 0, sy = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x < x0 + 60; x++) {
    if (!K.free(x, y) || !southOfDiag(x, y)) continue;
    fill(x, y, 1, 1, T.PLAZA); n++; sx += x; sy += y;
  }
  if (n < 30) return;
  const cx = sx / n, cy = sy / n;
  prop('fountain', cx, cy + 1, 36);
  prop('bench_m', cx - 5, cy + 4, 0); prop('bench_m', cx + 4, cy + 5, 0); prop('pbench', cx - 2, cy - 4, 0);
  prop('tree_b', cx - 7, cy - 2, 12, { sp: 'magnolia', k: 1.2 });
  prop('flowers_big', cx + 6, cy, 0); prop('flowers_a', cx - 8, cy + 6, 0);
  prop('lamp', cx + 3, cy - 5, 0); prop('lamp', cx - 6, cy + 8, 0);
  // the rest of the triangle: plane trees in rows, benches under them, a chess table or two
  let k = 0;
  for (let y = y0 + 2; y <= y1 - 1; y += 6) for (let x = x0 + 3; x < x0 + 58; x += 7) {
    if (Math.hypot(x - cx, y - cy) < 9 || !southOfDiag(x, y - 3) || m.tiles[y * m.w + x] !== T.PLAZA) continue;
    prop(k % 4 === 3 ? 'bench_m' : 'tree_b', x, y, k % 4 === 3 ? 0 : 12, k % 4 === 3 ? null : { sp: 'streetPl', k: 1.15 });
    k++;
  }
  m.squares ||= []; m.squares.push({ x: Math.round(cx) - 6, y: Math.round(cy) - 5, w: 12, h: 10, name: 'Wedge Plaza' });
  (out.places ||= []).push({ name: 'Wedge Plaza', x0: Math.round(cx) - 8, y0: Math.round(cy) - 8, x1: Math.round(cx) + 8, y1: Math.round(cy) + 8 });
}

// The main streets' furniture: street trees in grates every few lots, benches by the shops, bus shelters on the boulevard
// and Main Avenue (R1-I's), the hot-dog cart at the hero corner, the iron fence and planted strip by R1-I's bus stop
function streetDressing(K, out) {
  const { m, prop } = K;
  const along = (y, x0, x1, every, f) => { for (let x = x0; x < x1; x += every) f(x, y); };
  const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
  // trees along Holly Street's north pavement and the boulevard's both sides, clear of doors
  const doors = new Set(m.pois.map((p) => Math.floor(p.x / TILE)));
  const tree = (x, y, sp) => { if (onWalk(x, y) && !doors.has(Math.floor(x)) && !doors.has(Math.floor(x) - 1) && !doors.has(Math.floor(x) + 1)) prop('tree_a', x, y, 10, { sp, k: 1.15, grate: true }); };
  along(MY.holly - 5, MX.bridge + 10, MX.fulton - 8, 11, (x, y) => tree(x, y, 'street'));
  along(MY.blvd - 6, MX.westside + 10, MX.stadium - 10, 13, (x, y) => tree(x, y, 'streetPl'));
  along(MY.blvd + 6, MX.westside + 16, MX.stadium - 10, 13, (x, y) => tree(x, y, 'streetPl'));
  along(MY.central - 6, MX.bridge + 6, MX.harborview, 17, (x, y) => tree(x, y, 'maple'));
  // the bus stops: the boulevard (both ways), Main Avenue at Holly Street (R1-I's, with its planted strip and fence)
  for (const [x, y] of [[3010, MY.blvd - 6], [3300, MY.blvd + 6], [3560, MY.blvd - 6], [MX.main + 6, MY.holly + 3]]) if (onWalk(x, y)) prop('busstop', x, y, 0);
  prop('flowers_a', MX.main + 6, MY.holly + 7, 0); prop('fenceline', MX.main + 4.5, MY.holly + 8.5, 0, { kind: 'iron', tx: 3 * TILE, ty: 0 });
  // the hero corner's life (R1-A): the hot-dog cart, benches, a news box
  prop('foodcart', MX.madison + 9, MY.holly - 4.5, 14);
  prop('bench_m', MX.madison - 9, MY.holly - 5, 0); prop('news_b', MX.madison + 5, MY.holly - 5.5, 0); prop('hydrant', MX.madison + 4.5, MY.holly - 3.5, 6);
  out.dressed = true;
}
