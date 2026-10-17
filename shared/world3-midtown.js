// Midtown, handcrafted (the World v3 Handcraft Plan, "Midtown, decided" 2026-10-17; the owner's concepts RW1/RW1-Z the
// train over the street, RW2 the raised station, MT1 the diagonal avenue and its wedge, MT2 the main-street block, PJ1
// the projects, R1-A the hero corner, R1-I the corner store and bus stop, OS33 the corner bank, WC315 the community
// garden, D4 the courtyard block, NB1 the crescent, WC069/D11/WC228 the park, G2-B the public court, WC243 the
// boulevard). The mainland city's middle, between the bridgeheads (Bridge Avenue, Main Avenue) and the waterfront.
// Re-planned the same day (the owner's 10-17 notes: too much grid - fewer streets and junctions, long blocks, a main
// boulevard, one-way streets, a curve, dead ends, a big park, apartment complexes, public walking spaces):
//   - Trestle Street along the north edge, the main line overhead on its viaduct (the El: shared/world3-rail.js EL,
//     elFurniture; client/art2/game/statics.js addEl), the station at Madison Street, its inclines down to the portals
//     between Garden Street and Bridge Avenue and east of Mercer Street;
//   - Central Avenue, the rail-side row of walk-ups backing onto the El;
//   - Holly Street, the high street, from Bridge Avenue to the diagonal: one long block north of it from Bridge Avenue to
//     Main Avenue (the corner bank, the market, Linden Courts, the MT2 row, R1-I's cafe), the hero corner at Madison
//     Street; Holly Mews (a dead end, its terrace) west of Bridge Avenue, Holly Place east of the diagonal;
//   - Linden Walk, the paved walk down through the long blocks to the Commons' north gate;
//   - Midtown Boulevard, the main drag, its planted median; Carroll Street (one way south) the one cross street between
//     the bridge approaches; the big stores and The Palace on it;
//   - the Commons, the park between the bridge approaches south of the boulevard (the pond, the Great Lawn and its
//     bandstand, the courts, the dog run, Union Square round the subway's stairs); Garden Crescent west of it, a terrace
//     round its garden on a curved one-way street; Pier Street from Main Avenue east (the grocery, the strip, the market
//     hall), Madison Court's flats on Harbor Avenue;
//   - Crosstown Way, the diagonal from Civic Avenue to the Yards road, its wedge building and plaza where it crosses the
//     boulevard; Fulton Street (one way north) by the precinct; the courtyard apartments in the west, the community garden
//     by the tracks, the projects on the rough east edge round Mercer Court (a dead end).
// Every building faces south (the camera); the lots step along the diagonal (the plan's rule: buildings square to the
// grid, the angled lot filled with paving and planters). Draws are fixed by place (hash2), so reworking one block moves
// nothing else. The plan's frame: shared/world3-hand.js.
import { TILE, T } from './constants.js';

const D = 1;   // Midtown's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles). Linden Walk is no street: the paved walk from Central Avenue down through the long
// blocks to the Commons' north gate
export const MY = { trestle: 1664, central: 1700, holly: 1750, blvd: 1800, pier: 1850, harbor: 1900 };
export const MX = { westside: 2860, garden: 2924, bridge: 2988, linden: 3048, carroll: 3118, main: 3184, madison: 3250, civic: 3320, fulton: 3400, harborview: 3480, mercer: 3580, stadium: 3680 };
// a street's parking lane along each kerb (px; a sedan is 59 wide) and the street's width with them (tiles: an avenue's
// nine - one traffic lane each way inside the parking lanes, shared/roadcore.js laneOffset); a one-way street's single
// lane between its two (OW_W); the boulevard's four lanes either side of its planted median (BLVD_W, MEDIAN px); the
// mews and the crescent, one car wide with a 2-tile pavement (shared/roads.js 'minor')
const PARK = 60, ST_W = 9, OW_W = 7, OW_PARK = 52, BLVD_W = 13, MEDIAN = 96, MEWS_W = 5;
// how far a street's pavement reaches from its centre line (tiles, inclusive): half its width (odd widths: centred on
// the tile) + its pavement - 3 tiles in Midtown (shared/roads.js SIDEWALK commercial), 2 for a mews, none in an alley
const extOf = (w, kind) => (w - 1) / 2 + (kind === 'alley' ? 0 : kind === 'minor' ? 2 : 3);
const EXT = { ave: extOf(9, 'ave'), blvd: extOf(BLVD_W, 'blvd'), st: extOf(ST_W, 'st'), ow: extOf(OW_W, 'st'), mews: extOf(MEWS_W, 'minor'), alley: 1 };
// the back alleys' centre lines: behind the main rows (each row's lots in front have a yard behind them)
const AL = { b1: 1730, b2: 1776, c1: 1826 };
// the diagonal: Crosstown Way, from Civic Avenue at Central Avenue to Harbor Avenue (the road on to the Yards Bridge)
const DIAG = [[MX.civic, MY.central], [3640, MY.harbor]];
// the diagonal's centre line at a column (tiles), and the two sides of it (a lot keeps 1 tile clear of its pavement)
const diagY = (x) => DIAG[0][1] + (x - DIAG[0][0]) * (DIAG[1][1] - DIAG[0][1]) / (DIAG[1][0] - DIAG[0][0]);
const northOfDiag = (x, y) => y < diagY(x);
const southOfDiag = (x, y) => y > diagY(x);
// Garden Crescent: the terrace's street, a half oval from Harbor Avenue up round the crescent's garden and back down
// (one way, west leg up, east leg down); its middle and half-axes (tiles)
const CRES = { cx: 2924, rx: 44, top: 1844 };
const crescentPts = () => {
  const pts = [], ry = MY.harbor - CRES.top;
  // (fixed angles, no Math.cos at load - shared/dmath.js: the arc's points from a table of the quarter circle)
  const Q = [[1, 0], [0.966, 0.259], [0.866, 0.5], [0.707, 0.707], [0.5, 0.866], [0.259, 0.966], [0, 1]];
  const arc = [...Q.map(([c, s]) => [-c, s]), ...Q.slice(0, -1).reverse().map(([c, s]) => [c, s])];
  for (const [c, s] of arc) pts.push([Math.round(CRES.cx + c * CRES.rx), Math.round(MY.harbor - s * ry)]);
  return pts;
};
// the dead ends: Holly Mews west from Bridge Avenue, Holly Place east from the diagonal, Mercer Court south from Central
// Avenue (each ends in its turning circle: shared/map.js, the bulbs)
const MEWS_X = 2938, PLACE_X = 3462, COURT_Y = 1766;

// Midtown's streets (re-planned 2026-10-17, the owner's 10-17 notes: fewer streets and junctions, long blocks, a main
// boulevard, one-way streets, a curve, dead ends, the Commons): every one { name, kind, pts, w, park, median, oneway,
// culdesac, ext }. The bridge approaches (Bridge Avenue, Main Avenue), the city's avenues through it (Central Avenue,
// Civic Avenue, Harborview Avenue), the boulevard and the diagonal stay where the rest of the world meets them.
function streets() {
  const S = [];
  const add = (name, kind, pts, o = {}) => { const w = o.w || (kind === 'alley' ? 3 : kind === 'minor' ? MEWS_W : 9); S.push({ name, kind, pts, ...o, ext: extOf(w, kind) }); };
  const st = { park: PARK, w: ST_W }, ow = { oneway: true, park: OW_PARK, w: OW_W }, mews = { w: MEWS_W, culdesac: true };
  const ew = (name, kind, y, x0, x1, o) => add(name, kind, [[x0, y], [x1, y]], o);
  const ns = (name, kind, x, y0, y1, o) => add(name, kind, [[x, y0], [x, y1]], o);
  // (Trestle Street under the El: the inclines between Garden Street and Bridge Avenue and east of Mercer Street take
  // its line - shared/world3-rail.js EL - so it runs in two pieces)
  ew('Trestle Street', 'ave', MY.trestle, MX.westside, MX.garden);
  ew('Trestle Street', 'ave', MY.trestle, MX.bridge, MX.mercer);
  ew('Central Avenue', 'ave', MY.central, MX.westside, MX.stadium);
  // Holly Street, the high street: from Bridge Avenue to the diagonal, one long block north of it all the way to Main
  // Avenue; Holly Mews carries it on west of Bridge Avenue, Holly Place east of the diagonal
  ew('Holly Street', 'st', MY.holly, MX.bridge, MX.fulton, st);
  // Midtown Boulevard, the main drag: two lanes each way either side of a planted median, the trees down it
  ew('Midtown Boulevard', 'blvd', MY.blvd, MX.westside, MX.stadium, { w: BLVD_W, median: MEDIAN });
  // Pier Street: from Main Avenue (the Commons west of it) to Harborview Avenue
  ew('Pier Street', 'st', MY.pier, MX.main, MX.harborview, st);
  ns('Garden Street', 'st', MX.garden, MY.trestle, MY.central, st);
  ns('Bridge Avenue', 'ave', MX.bridge, MY.trestle, MY.harbor);
  // Carroll Street, one way south from Holly Street to the boulevard (it splits the block south of Holly Street)
  ns('Carroll Street', 'st', MX.carroll, MY.holly, MY.blvd, ow);
  ns('Main Avenue', 'ave', MX.main, MY.trestle, MY.harbor);
  // Madison Street from the station to the boulevard: the hero corner on Holly Street halfway
  ns('Madison Street', 'st', MX.madison, MY.trestle, MY.blvd, st);
  ns('Civic Avenue', 'ave', MX.civic, MY.trestle, MY.harbor);
  // Fulton Street, one way north from Harbor Avenue to the boulevard
  ns('Fulton Street', 'st', MX.fulton, MY.harbor, MY.blvd, ow);
  ns('Harborview Avenue', 'ave', MX.harborview, MY.trestle, MY.harbor);
  ns('Mercer Street', 'st', MX.mercer, MY.trestle, MY.central, st);
  add('Crosstown Way', 'ave', DIAG);
  // the dead ends and the crescent
  ew('Holly Mews', 'minor', MY.holly, MX.bridge, MEWS_X, mews);
  ew('Holly Place', 'minor', MY.holly, MX.fulton, PLACE_X, mews);
  ns('Mercer Court', 'minor', MX.mercer, MY.central, COURT_Y, mews);
  add('Garden Crescent', 'minor', crescentPts(), { w: MEWS_W, oneway: true });
  // the back alleys behind the main rows: one car wide, the back doors, the bins
  ew('Holly Back Alley', 'alley', AL.b1, MX.bridge, MX.civic);
  ew('Boulevard Alley', 'alley', AL.b2, MX.bridge, MX.civic);
  ew('Pier Alley', 'alley', AL.c1, MX.main, MX.civic);
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
function roofMat(r, garden = false, w = 8) {
  const m = garden ? (r < 0.4 && w <= 8 ? 'deck' : r < 0.78 ? 'paver' : 'green') : r < 0.26 ? 'membrane' : r < 0.48 ? 'gravel' : r < 0.66 ? 'tar' : r < 0.8 ? 'paver' : r < 0.88 ? 'rubber' : r < 0.95 ? 'green' : 'deck';
  return { roofMat: m, lip: 10, rimW: 4 };
}
// a shop's painted blade sign by its trade (short words: it must fit under a low cornice)
const BLADE = { books: 'BOOKS', records: 'VINYL', laundry: 'WASH', diner: 'EAT', cafe: 'CAFE', bar: 'BAR', pawn: 'PAWN', liquor: 'LIQUOR', salon: 'HAIR', florist: 'FLORIST', clothes: 'TAILOR', mart: 'DELI' };
// the windows' rhythm and the cornice by the wall (client/art2/buildings.js spec.win, spec.cornice): [weight, kind]
const WINS = {
  brick: [[3, 'even'], [2, 'pair'], [2, 'arch'], [1, 'tall'], [1, 'triple'], [1, 'bay'], [0.6, 'loft']],
  stucco: [[3, 'even'], [2, 'pair'], [2, 'triple'], [1, 'tall'], [1, 'bay']],
  stone: [[2, 'tall'], [2, 'even'], [1, 'arch'], [1, 'pair']],
  peach: [[2, 'even'], [2, 'pair'], [1, 'triple']],
};
const CORNICES = { brick: [[3, 'bracket'], [3, 'dentil'], [2, 'step'], [2, null]], stucco: [[4, null], [2, 'step'], [1, 'bracket']], stone: [[2, 'dentil'], [2, 'bracket'], [1, 'step']], peach: [[3, null], [1, 'step']] };
const wpick = (list, r) => { let v = r * list.reduce((a, q) => a + q[0], 0); for (const q of list) { v -= q[0]; if (v <= 0) return q[1]; } return list[0][1]; };
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
  cafe: [['Daily Grind', 'cafe'], ['Milk & Honey', 'cafe'], ['Golden Crust', 'cafe'], ['Corner Cup', 'cafe'], ['Tea Leaf', 'cafe']],
  food: [['Lucky Noodle', 'diner'], ['Slice Brothers', 'diner'], ['Taqueria Sol', 'diner'], ['Mama Rosa', 'diner'], ['Pho Corner', 'diner'], ['Gyro King', 'diner'], ['Dumpling House', 'diner']],
  shop: [['Petal & Stem', 'florist'], ['Needle & Thread', 'clothes'], ['Clear View Optics', 'lobby'], ['Second Act Thrift', 'clothes'], ['Polished Nails', 'salon'], ['Paper Lantern', 'mart'], ['Hardware & Keys', 'mart'], ['Phone Fix', 'mart'], ['Holly Deli', 'mart'], ['Fresh Stop', 'mart'], ['Midtown Shoe Repair', 'mart'], ['Bold Ink Tattoo', 'salon'], ['Penny Arcade', 'arcade']],
  bar: [['The Trestle Tap', 'bar'], ['Last Stop Lounge', 'bar'], ['The Brass Rail', 'bar']],
};
// The rest of Midtown's shops (invented names, never the same twice in the district): an owner's name, a word or a
// street with the trade - [trade, storefront kind (client/art2/buildings.js storefront: what the window shows)]
const OWNERS = ['Reyes', 'Kowal', 'Okafor', 'Delgado', 'Novak', 'Park', 'Feld', 'Moreau', 'Haddad', 'Russo', 'Lindqvist', 'Tanaka', 'Mendes', 'Brody', 'Costa', 'Abara', 'Vega', 'Petrov', 'Quinn', 'Sato',
  'Marlow', 'Ruiz', 'Bianchi', 'Duval', 'Castillo', 'Varga', 'Hollis', 'Amari', 'Pereira', 'Kaplan', 'Ferro', 'Monroe', 'Sorensen', 'Ibarra', 'Wexler', 'Calloway', 'Oduya', 'Szabo', 'Lam', 'Galindo'];
const FIRSTS = ["Rosa's", "Sal's", "Lenny's", "Mei's", "Tony's", "Gus's", "Ana's", "Benny's", "Lou's", "Nico's", "Dot's", "Vic's", "Ida's", "Manny's", "Rita's", "Joe's", "Yuki's", "Omar's", "Paulo's",
  "Hank's", "Lupe's", "Kiki's", "Sam's", "Bea's"];
const WORDS = ['Blue Door', 'Copper', 'North Star', 'Twin Oak', 'Red Lantern', 'Iron Gate', 'Silver', 'Brass Key', 'Lucky', 'Green Leaf', 'Half Moon', 'Old Mill', 'Little Owl', 'Gold Leaf',
  'Black Cat', 'Kingfisher', 'Sparrow', 'Juniper', 'Saffron', 'Polaris', 'Corner', 'Uptown', 'Good Day', 'Union', 'Hometown', 'Daybreak', 'Bluebird', 'Main Line'];
const STREETS = ['Holly', 'Carroll', 'Spring', 'Linden', 'Madison', 'Fulton', 'Mercer', 'Pier', 'Trestle', 'Civic', 'Garden', 'Bridge'];
const TRADES = {
  cafe: [['Coffee', 'cafe'], ['Bakery', 'cafe'], ['Bagels', 'cafe'], ['Tea House', 'cafe'], ['Pastry', 'cafe'], ['Donuts', 'cafe'], ['Espresso', 'cafe'], ['Juice Bar', 'cafe'], ['Creamery', 'cafe']],
  food: [['Pizza', 'diner'], ['Noodles', 'diner'], ['Deli', 'diner'], ['Tacos', 'diner'], ['Dumplings', 'diner'], ['Ramen', 'diner'], ['Curry House', 'diner'], ['Kebab', 'diner'], ['Pho', 'diner'],
    ['Bistro', 'diner'], ['Grill', 'diner'], ['Sushi', 'diner'], ['Soul Food', 'diner'], ['Falafel', 'diner'], ['Chicken', 'diner'], ['Empanadas', 'diner'], ['Wok', 'diner'], ['Burgers', 'diner'],
    ['Luncheonette', 'diner'], ['Kitchen', 'diner']],
  shop: [['Tailor', 'clothes'], ['Shoe Repair', 'mart'], ['Florist', 'florist'], ['Optical', 'lobby'], ['Thrift', 'clothes'], ['Nails', 'salon'], ['Hair Studio', 'salon'], ['Phone Repair', 'mart'],
    ['Locksmith', 'mart'], ['Dry Cleaners', 'laundry'], ['Books', 'books'], ['Records', 'records'], ['Vintage', 'clothes'], ['Boutique', 'clothes'], ['Hardware', 'mart'], ['Electronics', 'pawn'],
    ['Wine & Spirits', 'liquor'], ['Cards & Gifts', 'mart'], ['Frames', 'mart'], ['Print Shop', 'mart'], ['Bike Shop', 'mart'], ['Pet Supply', 'mart'], ['Spice Shop', 'mart'], ['Butcher', 'mart'],
    ['Cheese Shop', 'mart'], ['Produce', 'florist'], ['Tobacco', 'liquor'], ['Watch Repair', 'pawn'], ['Insurance', 'lobby'], ['Tax Service', 'lobby'], ['Travel', 'lobby'], ['Bridal', 'clothes'],
    ['Hats', 'clothes'], ['Fabrics', 'clothes'], ['Lighting', 'mart'], ['Kitchenware', 'mart'], ['Music', 'records'], ['Tattoo', 'salon'], ['Barber', 'salon'], ['Beauty Supply', 'mart'],
    ['Laundromat', 'laundry'], ['Comics', 'books'], ['Stationery', 'books'], ['Gallery', 'lobby']],
  bar: [['Tavern', 'bar'], ['Pub', 'bar'], ['Lounge', 'bar'], ['Taproom', 'bar'], ['Saloon', 'bar'], ['Wine Bar', 'bar'], ['Social Club', 'bar']],
  rough: [['Check Cashing', 'lobby'], ['Liquor', 'liquor'], ['Mini Mart', 'mart'], ['Cell Shop', 'mart'], ['Lotto & More', 'mart'], ['Smoke Shop', 'liquor'], ['Wash & Fold', 'laundry'],
    ['Pawn', 'pawn'], ['Discount', 'mart'], ['Bail Bonds', 'lobby'], ['Deli & Grill', 'diner'], ['Fried Chicken', 'diner'], ['Beer & Wine', 'liquor'], ['Quick Cash', 'lobby']],
};
// a food place's fit-out by what it serves (shared/foodrooms.js FOOD_STYLE: the key 'diner' booths and stools, 'rest1'
// and 'greenbistro' tables, anything else a counter with a queue)
function foodKey(name, store) {
  if (store === 'cafe') return /Bakery|Bagels|Donuts|Pastry|Juice|Creamery/.test(name) ? 'rest2' : 'greenbistro';
  return /Pizza|Burgers|Chicken|Kebab|Falafel|Tacos|Empanadas|Wok|Gyro|Slice|Taqueria/.test(name) ? 'rest2' : /Luncheonette|Kitchen|Grill|Deli|Diner/.test(name) ? 'diner' : 'rest1';
}
// a name not used yet for a shop of the category, drawn by r(k) (0..1): { name, store }
function composeShop(named, cat, r) {
  const T = TRADES[cat];
  for (let t = 0; t < 60; t++) {
    const [trade, store] = T[Math.floor(r(t * 4) * T.length) % T.length], p = r(t * 4 + 1), q = r(t * 4 + 2);
    const head = p < 0.34 ? OWNERS[Math.floor(q * OWNERS.length)] : p < 0.58 ? FIRSTS[Math.floor(q * FIRSTS.length)] : p < 0.84 ? WORDS[Math.floor(q * WORDS.length)] : STREETS[Math.floor(q * STREETS.length)];
    const name = `${head} ${trade}`;
    if (name.length <= 18 && !named.has(name)) { named.add(name); return { name, store }; }
  }
  return null;
}

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
  const poi0 = m.pois.length;
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
  // (the roofs: the art lays out each one's kit by its look - client/art2/game/statics.js kitFor - water towers, stair
  // huts, chimneys, AC; spec.garden: a roof garden on it, the planters, a table and an umbrella, festoon lights)
  const roofGarden = (x, y, k) => rnd(x, y, k) < 0.2;
  let lastMural = false, muralN = 0, lastWin = null, lastCor = null;
  // the windows' rhythm, the cornice and a datestone now and then (never the same windows as the building next door)
  const dress = (spec, x, y, f) => {
    const st = f.style in WINS ? f.style : 'stucco';
    let win = wpick(WINS[st], rnd(x, y, 64));
    if (win === lastWin) win = wpick(WINS[st], rnd(x, y, 65));
    if (win === lastWin) win = win === 'even' ? 'pair' : 'even';
    let cor = wpick(CORNICES[st], rnd(x, y, 66));
    if (cor && cor === lastCor && rnd(x, y, 67) < 0.6) cor = null;
    lastWin = win; lastCor = cor;
    spec.win = win;
    if (cor) spec.cornice = cor;
    if (cor === 'step' && rnd(x, y, 68) < 0.7) spec.date = String(1888 + Math.floor(rnd(x, y, 69) * 52));
    return spec;
  };
  // how many floors a lot gets: mostly two or three (the owner, 10-17: lower, so the streets behind stay in view), a
  // corner a floor more; a shop one to three
  const floorsOf = (x, y, k, corner) => { const r = rnd(x, y, 50); const f = k === 'shop' ? (r < 0.2 ? 1 : r < 0.72 ? 2 : 3) : (r < 0.5 ? 2 : r < 0.92 ? 3 : 4); return Math.min(4, f + (corner ? 1 : 0)); };
  // a shop on the ground floor of a walk-up: name, storefront kind, poi kind (a walk-in, a business) or a plain business
  const shopLot = (x, y, w, o) => {
    const f = o.face || face(x, y), floors = Math.min(o.floors ?? floorsOf(x, y, 'shop', o.corner), o.maxFloors ?? 9);
    const [bg, fg] = o.sign || pick(SIGNS, rnd(x, y, 51));
    const aw = o.awning === undefined ? (rnd(x, y, 52) < 0.7 ? pick(AWNINGS, rnd(x, y, 53)) : null) : o.awning;
    const side = o.doorSide || (rnd(x, y, 54) < 0.5 ? 'left' : 'right');
    const shop = { kind: o.store || 'mart', door: side, open: true, people: o.people ?? 1 + Math.floor(rnd(x, y, 55) * 3), sign: { text: o.name.toUpperCase().slice(0, 18), bg, fg, lit: true }, awning: aw };
    if (o.grille) shop.grille = true;
    if (o.openSign) shop.openSign = { col: [255, 60, 70] };
    const garden = o.garden ?? roofGarden(x, y, 62);
    const spec = dress({ floors, ...f, parapet: 6 + Math.floor(rnd(x, y, 56) * 6), grime: o.grime ?? 0.12 + rnd(x, y, 57) * 0.15, ...roofMat(rnd(x, y, 58), garden, w), garden }, x, y, f);
    // a painted sign hung off the wall by the shop's trade, on the side away from the door (now and then)
    // (it hangs over the shop floor and must fit under the cornice: 14 px a letter, 10 of frame - client/art2/buildings.js blade)
    const bt = BLADE[o.store || 'mart'], wallH = 64 + (floors - 1) * 56 + (f.style === 'brick' ? 10 : 6) + spec.parapet;
    if (bt && w >= 6 && rnd(x, y, 49) < 0.25 && 74 + bt.length * 14 + 10 <= wallH - 6) spec.blades = [{ text: bt, x: side === 'left' ? w * TILE - 24 : 6, v: 74, paint: true, bg, fg }];
    if (floors >= 3 && w >= 8 && rnd(x, y, 58) < 0.45) spec.fireEscape = [Math.max(8, Math.round(w * TILE * (0.45 + rnd(x, y, 59) * 0.2)) - 25), 50];
    if (o.shutters || (f.style !== 'brick' && floors >= 2 && rnd(x, y, 60) < 0.3)) spec.shutters = pick(['#3a4a5c', '#2e5a4a', '#56606a', '#6a3a34', '#2e4a6a'], rnd(x, y, 61));
    if (o.mural) spec.mural = o.mural;
    // its business: a cafe or a food place is one you sit down in (a walk-in food place: its booths, tables or queue by
    // the key - shared/foodrooms.js), any other shop one you walk into to its counter (o.walk false: a door only)
    const st = shop.kind, food = st === 'cafe' || st === 'diner';
    let poi = o.poi === undefined ? (food ? { kind: 'coffee', label: o.name, food: st === 'diner' } : { kind: 'delivery', label: o.name }) : o.poi;
    if (poi && poi.kind === 'delivery' && o.walk !== false) poi = { ...poi, walk: true, store: st };
    const key = o.key || (food && poi && poi.kind === 'coffee' ? foodKey(o.name, st) : null);
    // a flat over the shop, its own door at the other end of the front
    const home = o.home !== undefined ? o.home : floors >= 2 && w >= 5 && rnd(x, y, 63) < 0.6 ? { kind: 'apartment' } : null;
    return { arch: 'mixed', ...(key ? { key } : {}), art: { spec, shop, ...(o.kit ? { kit: o.kit } : {}) }, name: o.name, poi, ...(home ? { home } : {}), door: side === 'left' ? x : x + w - 1, trade: o.trade || null, whole: true };
  };
  // a residential walk-up: a stoop door, windows, a fire escape now and then; a home behind its door
  const walkup = (x, y, w, o = {}) => {
    const f = o.face || face(x, y), floors = Math.min(o.floors ?? floorsOf(x, y, 'walkup', o.corner), o.maxFloors ?? 9);
    const garden = o.garden ?? roofGarden(x, y, 77);
    const spec = dress({ floors, ...f, parapet: 6 + Math.floor(rnd(x, y, 71) * 5), grime: o.grime ?? 0.1 + rnd(x, y, 72) * 0.2, ...roofMat(rnd(x, y, 76), garden, w), garden }, x, y, f);
    if (o.scaffold) spec.scaffold = true;
    if (floors >= 3 && w >= 8 && rnd(x, y, 73) < 0.6) spec.fireEscape = [Math.max(8, Math.round(w * TILE * (0.5 + rnd(x, y, 74) * 0.2)) - 25), 50];
    else if (floors >= 3 && rnd(x, y, 75) < 0.3) spec.balconies = true;
    if (o.graffiti) { spec.graffiti = o.graffiti; spec.tagText = o.tag || null; }
    if (o.boarded) spec.boarded = o.boarded;
    if (o.mural) spec.mural = { x: 8, w: w * TILE - 16, h: Math.min(floors * 56 - 30, 150), kind: o.mural };
    // (its door where the facade draws it, a fifth of the way along, its stoop in front: shared/map.js handBuilding)
    return { arch: o.arch || 'walkup', door: x + Math.floor(w * 0.22 + 0.3), art: { spec, noShop: true, ...(o.kit ? { kit: o.kit } : {}) }, name: o.name || null, home: o.home === false ? null : { kind: 'apartment', ...(o.home || {}) }, whole: true };
  };
  const place = (L, o) => { const b = K.building({ ...L, ...o }); if (b) { if (L.home) out.homes++; if (L.poi) out.shops++; } return b; };

  // A main-street row of the plan's lots (south fronts), x0..x1 in band y0..y1: `list` an explicit list
  // ({ w, kind: 'shop' | 'walkup' | 'gap', ... }), then the rest filled by the generic mix.
  const mainRow = (x0, x1, y0, y1, list = [], o = {}) => {
    let k = 0;
    const depth = o.depth || 11 + Math.floor(rnd(x0, y1, 89) * 2);
    const made = K.row(x0, x1, y0, y1, (x, room, i) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      const corner = i === 0 || room <= 13;   // (the row's first lot and its last: the corners of the block)
      const L0 = k < list.length ? list[k++] : null, L = L0 && !L0.gap && L0.corner === undefined && L0.floors === undefined ? { ...L0, corner } : L0;
      if (L) {
        if (L.gap) return { gap: L.gap, kind: L.kind || 'passage' };
        const w = Math.min(room, L.w);
        if (L.kind === 'walkup') return { w, depth: L.depth || depth, ...walkup(x, y1, w, L) };
        if (L.kind === 'raw') return { w, depth: L.depth || depth, ...L.lot };
        return { w, depth: L.depth || depth, ...shopLot(x, y1, w, L) };
      }
      // the generic mix: shops 5-8 wide, now and then a walk-up, a passage to the alley, a pocket garden
      const r = rnd(x, y1, 90);
      if (room <= 9) return rnd(x, y1, 91) < 0.5 ? { w: room, depth, ...walkup(x, y1, room, { arch: 'walkup', corner }) } : { w: room, depth, ...shopLot(x, y1, room, { ...genericShop(x, y1), corner }) };
      if (r < 0.06 && o.passages !== false) return { gap: 2 + Math.floor(rnd(x, y1, 92) * 2), kind: 'passage' };
      if (r < 0.09 && o.gardens !== false) return { gap: 5 + Math.floor(rnd(x, y1, 93) * 3), kind: 'garden' };
      if (r < 0.32) { const w = Math.min(room, 8 + Math.floor(rnd(x, y1, 94) * 4)); return { w, depth, ...walkup(x, y1, w, { corner, scaffold: rnd(x, y1, 96) < 0.05 }) }; }
      const w = Math.min(room, 5 + Math.floor(rnd(x, y1, 95) * 4));
      return { w, depth, ...shopLot(x, y1, w, { ...genericShop(x, y1), corner }) };
    }, o);
    if (o.yard !== false) backYards(K, made, y0, o);
    return made;
  };
  // a shop with a name not used yet in Midtown
  const genericShop = (x, y) => {
    const r = rnd(x, y, 100), cat = r < 0.2 ? 'cafe' : r < 0.44 ? 'food' : r < 0.52 ? 'bar' : 'shop';
    if (rnd(x, y, 103) < 0.25) { const [name, store] = pick(SHOPS[cat], rnd(x, y, 101)); if (!named.has(name)) { named.add(name); return { name, store }; } }
    return composeShop(named, cat, (k) => rnd(x + k, y, 104)) || composeShop(named, 'shop', (k) => rnd(x, y + k, 105));
  };
  // A row of backs (fronts facing north onto the street there; the camera sees their back walls on the alley or yard
  // behind): walk-ups with homes, a plain building now and then
  const backRow = (x0, x1, y0, y1, o = {}) => {
    // (a building is drawn standing up over what's north of it: a row facing a street to the north would cover the
    // street with its height. So it stands back behind a strip of front gardens and is one or two floors - the
    // owner's 10-17 note: the streets behind stay in view)
    const sb = o.mask || y1 - y0 + 1 < 11 ? 0 : 2;
    const made = K.row(x0, x1, y0 + sb, y1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      const w = room <= 12 ? room : Math.min(room, 7 + Math.floor(rnd(x, y0, 110) * 6));
      if (rnd(x, y0, 111) < (o.yards ?? 0.08)) return { gap: Math.min(room, 4 + Math.floor(rnd(x, y0, 112) * 3)), kind: 'yard' };
      const mural = !lastMural && rnd(x, y0, 114) < 0.08 ? MURALS[(Math.floor(rnd(x, y0, 115) * MURALS.length) + muralN++) % MURALS.length] : null;
      lastMural = !!mural;
      const L = walkup(x, y0, w, { floors: sb ? (rnd(x, y0, 113) < 0.75 ? 2 : 1) : 1, grime: o.grime, mural });
      return { w, depth: o.depth || Math.min(y1 - y0 - sb + 1, 11 + Math.floor(rnd(x, y0, 116) * 4)), ...L, face: 'N' };
    }, { ...o, north: !o.mask });
    if (sb) frontGardens(K, made, y0, sb, o);
    if (!o.mask) rearYards(K, made, y1, o);
    return made;
  };
  // A mews terrace (Holly Mews): narrow townhouses side by side facing south onto the mews, three floors, painted render
  // and brick in turn, bay windows, a stoop each; the little front areas behind iron railings with a pot or two
  const mewsRow = (x0, x1, y0, y1) => {
    const PAINT = ['#d9c9a3', '#b9c7b4', '#d8a98c', '#c3cdd6', '#e4dcc8', '#cdb2b8'];
    let k = 0;
    const made = K.row(x0, x1, y0, y1 - 2, (x, room) => {
      if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const w = room <= 9 ? room : 6 + Math.floor(rnd(x, y1, 130) * 2);
      const f = k++ % 3 === 2 ? { style: 'brick', brickTone: pick([TONE.red, TONE.brown, TONE.deep], rnd(x, y1, 131)) } : { style: 'stucco', wallColor: pick(PAINT, rnd(x, y1, 132)) };
      const L = walkup(x, y1, w, { face: f, floors: 3, home: { kind: 'house' } });
      L.art.spec.win = rnd(x, y1, 133) < 0.6 ? 'bay' : 'tall';
      L.art.spec.cornice = f.style === 'brick' ? 'dentil' : 'step';
      L.art.spec.fireEscape = null; L.art.spec.balconies = false;
      return { w, depth: 11, ...L };
    });
    // the front areas: railings either side of the steps, a pot by the door
    for (const b of made) {
      if (!b || b.gap || b.tw === undefined || !b.door) continue;
      const fy = b.ty + b.th, dx = b.door.tx;
      K.fill(b.tx, fy, b.tw, y1 - fy + 1, T.PLAZA);
      if (dx - b.tx >= 2) prop('fenceline', b.tx + 0.2, fy + 1.6, 0, { kind: 'iron', tx: Math.round((dx - b.tx - 0.4) * TILE), ty: 0 });
      if (b.tx + b.tw - dx - 1 >= 2) prop('fenceline', dx + 1.2, fy + 1.6, 0, { kind: 'iron', tx: Math.round((b.tx + b.tw - dx - 1.4) * TILE), ty: 0 });
      prop(pick(['potted', 'planter_fl', 'flowers_a'], rnd(dx, fy, 134)), dx + (dx - b.tx > 2 ? -1 : 1.6), fy + 0.7, 0);
    }
    return made;
  };

  // ===========================================================================================================
  // Row A: the rail-side row between Trestle Street (the El overhead) and Central Avenue - walk-ups facing south onto
  // Central Avenue, their backs and fire escapes to the viaduct
  const [ay0, ay1] = band(MY.trestle, 'ave', MY.central, 'ave');
  // (a row of low walk-ups and shops fronting Trestle Street under the El - their backs and little yards toward the
  // row on Central Avenue, which the camera sees - then the main row on Central Avenue)
  const railRow = (x0, x1, list, o) => { backRow(x0, x1, ay0, ay0 + 9, { depth: 7, yards: 0.1 }); return mainRow(x0, x1, ay0 + 10, ay1, list, o); };
  {
    // the west end: walk-ups and a corner store at Westside Avenue
    const [x0, x1] = span(MX.westside, 'ave', MX.garden, 'st');
    railRow(x0, x1, [{ kind: 'shop', w: 8, name: 'Westside Bodega', store: 'mart', poi: { kind: 'convenience', label: 'Westside Bodega' }, awning: ['#2f7a5c', '#f0ece4'], openSign: true }]);
  }
  {
    // the community garden by the tracks (WC315): raised beds, a greenhouse, a tool shed, sunflowers, benches - the
    // plots go to Midtown's flat owners (the garden's plots: gardening, later)
    const [x0, x1] = span(MX.garden, 'st', MX.bridge, 'ave');
    communityGarden(K, x0, ay0, x1 - x0, ay1 - ay0 + 1, out);
  }
  {
    // Bridge Avenue to Main Avenue: one long rail-side row, the Trestle Tap and a pocket park by the El
    const [x0, x1] = span(MX.bridge, 'ave', MX.main, 'ave');
    railRow(x0, x1, [{ kind: 'walkup', w: 10 }, { kind: 'shop', w: 7, name: 'The Trestle Tap', store: 'bar', awning: null, people: 3 }, { gap: 13, kind: 'park' }, { kind: 'walkup', w: 9 }, { kind: 'shop', w: 6, ...pickShop('food', 0) }]);
  }
  // the station blocks either side of Madison Street (the stair towers stand on Trestle Street's pavement: the rail pass)
  {
    const [x0, x1] = span(MX.main, 'ave', MX.madison, 'st');
    railRow(x0, x1, [{ kind: 'shop', w: 8, name: 'Station News', store: 'mart', awning: ['#1e3a5e', '#e8e4dc'] }, { kind: 'shop', w: 6, name: 'Last Stop Lounge', store: 'bar', awning: null }]);
  }
  {
    const [x0, x1] = span(MX.madison, 'st', MX.civic, 'ave');
    // (the station's stair tower comes down to Trestle Street's pavement at Madison Street, at this block's west end: a
    // little plaza in front of it instead of the row - the food cart, benches, the bikes, the news boxes, the map board)
    stationPlaza(K, x0, ay0, 11, 10);
    railRow(x0, x1, [{ kind: 'shop', w: 7, name: 'Platform Coffee', store: 'cafe', poi: { kind: 'coffee', label: 'Platform Coffee' }, awning: ['#8a5a2a', '#efe6d0'] }]);
  }
  {
    // Civic Avenue to Harborview Avenue: the skate spot by the El, the row built round it
    const [x0, x1] = span(MX.civic, 'ave', MX.harborview, 'ave');
    skateSpot(K, 3422, ay0, 26, ay1 - ay0 + 1, out);
    railRow(x0, x1, [{ kind: 'walkup', w: 11 }, { gap: 12, kind: 'park' }], { gardens: false });
  }
  {
    const [x0, x1] = span(MX.harborview, 'ave', MX.mercer, 'st');
    railRow(x0, x1, [], { gardens: false });
  }
  {
    // the east end, rougher: by the projects
    const [x0, x1] = span(MX.mercer, 'st', MX.stadium, 'ave');
    K.row(x0, x1, ay0, ay1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'yard' } : null;
      if (rnd(x, ay1, 120) < 0.15) return { gap: Math.min(room, 5), kind: 'yard' };
      const w = Math.min(room, 7 + Math.floor(rnd(x, ay1, 121) * 5));
      return { w, depth: 11 + Math.floor(rnd(x, ay1, 124) * 3), ...walkup(x, ay1, w, { grime: 0.5, graffiti: rnd(x, ay1, 122) < 0.5 ? 1 : 0, boarded: rnd(x, ay1, 123) < 0.3 ? 0.2 : 0, mural: rnd(x, ay1, 125) < 0.15 ? MURALS[Math.floor(rnd(x, ay1, 126) * MURALS.length)] : null }) };
    }, { rough: true });
  }

  // ===========================================================================================================
  // Rows B: between Central Avenue and Midtown Boulevard. Holly Street through the middle from Bridge Avenue to the
  // diagonal: north of it one long block to Main Avenue (the bank, the market, the court, Linden Walk, the MT2 row, R1-I's
  // cafe), its alley behind; south of it Carroll Street, one way, the one cross street before Main Avenue
  const [b1y0, b1y1] = band(MY.central, 'ave', MY.holly, 'st');      // 1708..1742
  const [b2y0, b2y1] = band(MY.holly, 'st', MY.blvd, 'blvd');        // 1758..1790
  const alleyB1 = AL.b1, alleyB2 = AL.b2;
  // Linden Walk: the paved walk from Central Avenue down through both blocks to the Commons' north gate (the rows
  // leave it open: laid first)
  lindenWalk(K, b1y0, b2y1, out);
  const LW0 = MX.linden - 2, LW1 = MX.linden + 3;   // [x0, x1) of the walk
  // --- the west: Garden Court (D4) by Westside Avenue, Holly Mews' terrace beside it, Marlow & Finch on the boulevard
  {
    const [x0, x1] = span(MX.westside, 'ave', MX.bridge, 'ave');
    const cw = 50;
    courtyard(K, x0, b1y0, cw, b2y1 - b1y0 + 1, { walkup, shopLot, out, name: 'Garden Court' });
    const mx0 = x0 + cw + 1, mN = MY.holly - EXT.mews - 1, mS = MY.holly + EXT.mews + 1;
    backRow(mx0, x1, b1y0, b1y0 + 15);
    mewsRow(mx0, x1, b1y0 + 17, mN);
    backRow(mx0, x1, mS, mS + 13, { yards: 0.05 });
    // (Marlow & Finch, the department store on the boulevard: shared/map.js CLOTHES_SHOPS takes it by name)
    mainRow(mx0, x1, mS + 15, b2y1, [{ kind: 'raw', w: 26, lot: deptStore(), depth: 13 }, { kind: 'shop', ...pickShop('food', 8) }]);
    (out.places ||= []).push({ name: 'Holly Mews', x0: mx0, y0: mN - 10, x1, y1: mS + 2 });
  }
  // --- the long block: Bridge Avenue to Main Avenue, north of Holly Street (Linden Walk through it)
  {
    const [x0, x1] = span(MX.bridge, 'ave', MX.main, 'ave');
    backRow(x0, LW0, b1y0, alleyB1 - 2);
    backRow(LW1, x1, b1y0, alleyB1 - 2, { yards: 0.04 });
    // west of the walk: the corner bank (OS33) at Bridge Avenue, the Holly Street Market, walk-ups and a cafe
    mainRow(x0, LW0, alleyB1 + 2, b1y1, [
      { kind: 'raw', w: 12, lot: bankLot() },
      { kind: 'shop', w: 8, name: 'Holly Street Market', store: 'mart', poi: { kind: 'grocery', label: 'Holly Street Market' }, awning: ['#2f6a4e', '#f0ece4'] },
      { kind: 'walkup', w: 10 },
      { kind: 'shop', ...pickShop('cafe', 7) },
    ]);
    // east of it: Linden Courts (the neighbourhood's court, open to the walk), the MT2 row (Harper & Co ... Corner Mart),
    // walk-ups and shops, Holly Florist and R1-I's neon cafe at Main Avenue
    const MT2 = [
      { kind: 'shop', w: 7, name: 'Harper & Co', store: 'books', poi: { kind: 'delivery', label: 'Harper & Co' }, trade: 'books', awning: null, sign: ['#2f6a4e', [240, 232, 200]], floors: 4, face: { style: 'brick', brickTone: TONE.red } },
      { kind: 'shop', w: 6, name: 'Sunbean', store: 'cafe', poi: { kind: 'coffee', label: 'Sunbean' }, awning: null, sign: ['#4a3a2a', [250, 220, 150]], floors: 3, face: { style: 'stucco', wallColor: '#d8c8a8' } },
      { kind: 'shop', w: 7, name: 'Red Cup Diner', store: 'diner', poi: { kind: 'coffee', label: 'Red Cup Diner', food: true }, key: 'diner', trade: 'diner', awning: ['#a8343a', '#f0ece4'], sign: ['#e8e0cc', [180, 40, 46]], floors: 3, face: { style: 'brick', brickTone: TONE.deep } },
      { kind: 'shop', w: 6, name: 'Lucky Pawn', store: 'pawn', poi: { kind: 'pawn', label: 'Lucky Pawn' }, awning: null, sign: ['#232838', [236, 214, 150]], grille: true, floors: 3, face: { style: 'brick', brickTone: TONE.green } },
      { kind: 'shop', w: 6, name: 'Vinyl & More', store: 'records', poi: { kind: 'delivery', label: 'Vinyl & More' }, trade: 'records', awning: null, sign: ['#2a2c38', [236, 206, 120]], floors: 3, face: { style: 'brick', brickTone: TONE.red } },
      { kind: 'shop', w: 6, name: 'Suds Laundry', store: 'laundry', poi: { kind: 'delivery', label: 'Suds Laundry' }, trade: 'laundry', awning: null, sign: ['#2a6ab0', [250, 250, 240]], floors: 3, face: { style: 'stucco', wallColor: '#c8c4bc' } },
      { kind: 'shop', w: 5, name: 'Clip Joint', store: 'salon', poi: { kind: 'barber', label: 'Clip Joint' }, awning: ['#a8343a', '#f0ece4'], sign: ['#8a2a2e', [250, 230, 190]], floors: 3, face: { style: 'brick', brickTone: TONE.brown } },
      { kind: 'shop', w: 8, name: 'Corner Mart', store: 'mart', poi: { kind: 'convenience', label: 'Corner Mart' }, awning: ['#2f8a72', '#f0ece4'], sign: ['#d24a4a', [250, 246, 236]], doorSide: 'right', openSign: true, floors: 3, face: { style: 'brick', brickTone: TONE.red } },
    ];
    const room = x1 - LW1, fixed = 16 + 51 + 3 + 7 + 8;
    mainRow(LW1, x1, alleyB1 + 2, b1y1, [
      { gap: 16, kind: 'court' },
      ...MT2,
      { gap: 3, kind: 'passage' },
      ...splitLots(room - fixed, (k) => (k % 3 === 1 ? { kind: 'walkup', w: 9 } : { kind: 'shop', ...pickShop(k % 3 ? 'shop' : 'food', 20 + k) })),
      { kind: 'shop', w: 7, name: 'Holly Florist', store: 'florist', awning: ['#6a3a8a', '#f0ece4'] },
      { kind: 'raw', w: 8, lot: neonCafe() },
    ]);
    (out.places ||= []).push({ name: 'Linden Courts', x0: LW1, y0: alleyB1 + 2, x1: LW1 + 16, y1: b1y1 });
  }
  // --- south of Holly Street: Bridge Avenue to Carroll Street (MediMart on the boulevard, The Palace at Carroll Street)
  {
    const [x0, x1] = span(MX.bridge, 'ave', MX.carroll, 'ow');
    backRow(x0, LW0, b2y0, alleyB2 - 2);
    backRow(LW1, x1, b2y0, alleyB2 - 2);
    mainRow(x0, LW0, alleyB2 + 2, b2y1, [{ kind: 'shop', w: 10, name: 'MediMart Pharmacy', store: 'mart', poi: { kind: 'pharmacy', label: 'MediMart Pharmacy' }, sign: ['#f4f0e8', [40, 60, 120]], awning: null, floors: 2 }]);
    // (The Palace, the old picture house on the boulevard: its marquee, TONIGHT and the CINEMA blade - statics.js
    // 'theatre'; the neon over its doors)
    const room = x1 - LW1;
    mainRow(LW1, x1, alleyB2 + 2, b2y1, [
      ...splitLots(room - 16, (k) => (k % 2 ? { kind: 'walkup', w: 9 } : { kind: 'shop', ...pickShop(k ? 'shop' : 'cafe', 40 + k) })),
      { kind: 'raw', w: 16, lot: { arch: 'theatre', key: 'theatre', name: 'The Palace', poi: { kind: 'delivery', label: 'The Palace' }, whole: true } },
    ]);
  }
  // --- Carroll Street to Main Avenue
  {
    const [x0, x1] = span(MX.carroll, 'ow', MX.main, 'ave');
    backRow(x0, x1, b2y0, alleyB2 - 2);
    mainRow(x0, x1, alleyB2 + 2, b2y1, [{ kind: 'walkup', w: 9 }, { kind: 'shop', w: 9, name: 'Bean Machine Coffee', store: 'cafe', poi: { kind: 'coffee', label: 'Bean Machine Coffee' }, awning: ['#2f6a4e', '#f0ece4'] }]);
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
  // --- Madison Street to Civic Avenue: the hero corner's corner store, walk-up and Madison Row at Holly and Madison; St.
  // Brendan's on the boulevard (Boulevard Alley stops at Madison Street: the church's lot runs back to the row behind)
  {
    const [x0, x1] = span(MX.madison, 'st', MX.civic, 'ave');
    backRow(x0, x1, b1y0, alleyB1 - 2);
    mainRow(x0, x1, alleyB1 + 2, b1y1, [{ kind: 'raw', w: 8, lot: heroMart() }, { kind: 'raw', w: 10, lot: heroWalkup() }, { kind: 'raw', w: 6, lot: madisonRow() }]);
    backRow(x0, x1, b2y0, b2y0 + 12);
    mainRow(x0, x1, b2y0 + 14, b2y1, [{ kind: 'raw', w: 15, lot: { arch: 'church', key: 'church', name: "St. Brendan's", poi: false, whole: true }, depth: 17 }, { kind: 'shop', w: 9, name: 'Holly Hardware', store: 'mart', awning: ['#c8503a', '#f0ece4'] }]);
  }
  // --- along the diagonal (Civic Avenue to Harborview Avenue): Crosstown Way runs from Civic Avenue at Central Avenue
  // to Fulton Street at Holly Street (Holly Place on east of it, a dead end) and on to Harborview Avenue at the
  // boulevard. North-east of it: a row of backs on the street above (Central Avenue, Holly Place), then lots stepping
  // down to the diagonal, their fronts on its pavement. South-west of it: lots facing the street below (Holly Street,
  // the boulevard) as deep as the diagonal lets them - their backs step along it. The wedge (MT1) is the sharp corner at
  // the boulevard.
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
  // --- Harborview Avenue to Mercer Court: the rough edge begins - walk-ups with tags, a liquor store, walled yards
  {
    const [x0, x1] = span(MX.harborview, 'ave', MX.mercer, 'mews');
    roughBlock(K, x0, b1y0, x1 - x0, b1y1 - b1y0 + 1, { walkup, shopLot, out, named });
    roughBlock(K, x0, b2y0, x1 - x0, b2y1 - b2y0 + 1, { walkup, shopLot, out, named });
  }
  // --- Mercer Court to Stadium Avenue: the projects (PJ1), on the rough east edge (the court's dead end their way in)
  {
    const [x0, x1] = span(MX.mercer, 'mews', MX.stadium, 'ave');
    projects(K, x0, b1y0, x1 - x0, b2y1 - b1y0 + 1, { walkup, shopLot, out, named });
  }

  // ===========================================================================================================
  // Rows C: Midtown Boulevard to Harbor Avenue. Garden Crescent in the west, the Commons between the bridge
  // approaches (Union Square in its corner by the subway), Pier Street from Main Avenue east
  const [c1y0, c1y1] = band(MY.blvd, 'blvd', MY.pier, 'st');        // 1810..1842
  const [c2y0, c2y1] = band(MY.pier, 'st', MY.harbor, 'ave');       // 1858..1892
  {
    const [x0, x1] = span(MX.westside, 'ave', MX.bridge, 'ave');
    gardenCrescent(K, x0, c1y0, x1, c2y1, { walkup, out });
  }
  {
    const [x0, x1] = span(MX.bridge, 'ave', MX.main, 'ave');
    commons(K, x0, c1y0, x1 - x0, c2y1 - c1y0 + 1, out);
  }
  {
    // Main Avenue to Civic Avenue: on Pier Street FreshHub Grocery, the strip of sports, guns, hardware and clothes
    // (Iron Sights Arms...) and the Pier Street Market (the old market hall: its glazed roof, the food counters inside);
    // on Harbor Avenue the car park and Madison Court, the apartments behind their lawns
    const [x0, x1] = span(MX.main, 'ave', MX.civic, 'ave');
    backRow(x0, x1, c1y0, AL.c1 - 2);
    mainRow(x0, x1, AL.c1 + 2, c1y1, [{ kind: 'raw', w: 30, lot: groceryLot(), depth: 15 }, { kind: 'raw', w: 40, lot: stripLot(), depth: 15 }, { gap: 3, kind: 'passage' }, { kind: 'raw', w: 26, lot: marketHall(), depth: 15 }]);
    // (a car park on Harbor Avenue at Main Avenue: the bays, the barrier, the pay board)
    carPark(K, x0, c2y0, 24, c2y1 - c2y0 + 1, out);
    madisonCourt(K, x0 + 26, c2y0, x1 - x0 - 26, c2y1 - c2y0 + 1, { walkup, out });
  }
  {
    // Civic Avenue to Harborview Avenue (Fulton Street between, one way north)
    for (const [a, ka, b, kb] of [[MX.civic, 'ave', MX.fulton, 'ow'], [MX.fulton, 'ow', MX.harborview, 'ave']]) {
      const [x0, x1] = span(a, ka, b, kb);
      backRow(x0, x1, c1y0, c1y0 + 14);
      // (Midtown's precinct on Pier Street at Civic Avenue, its motor pool next door)
      mainRow(x0, x1, c1y0 + 15, c1y1, a === MX.civic ? [{ kind: 'raw', w: 26, lot: precinctLot(), depth: 18 }, { kind: 'raw', w: 15, lot: { roof: 'tar', name: 'Motor Pool', poi: false }, depth: 15 }] : []);
      backRow(x0, x1, c2y0, c2y0 + 14);
      // (The Holloway, a small hotel on Harbor Avenue; The Foundry Lofts, a brick works turned flats over a cafe)
      mainRow(x0, x1, c2y0 + 15, c2y1, a === MX.civic ? [{ kind: 'walkup', w: 10 }, { kind: 'raw', w: 14, lot: hotelLot() }] : [{ kind: 'raw', w: 30, lot: loftLot(), depth: 17 }]);
    }
  }
  {
    // east of Harborview Avenue: the pocket plaza in the corner opposite the wedge (MT1's: its fountain, benches, trees);
    // a tower going up on Harbor Avenue (the frame, the crane, the site fence - statics.js 'construction'); Motor Row's
    // dealership and Fresh Coat Garage on the diagonal; then the diagonal's two sides down to Harbor Avenue - small rough
    // lots
    pocketPlaza(K, out);
    const [x0, x1] = span(MX.harborview, 'ave', MX.stadium, 'ave');
    K.building({ x: x0 + 1, y: c2y1 - 14, w: 24, h: 15, key: 'construction', name: 'Harbor Tower site', poi: false, whole: true });
    dealership(K, 3606, c1y0 + 2, 46, 34, out);
    mainRow(3574, 3604, c1y0, c2y1, [{ kind: 'raw', w: 16, lot: garageLot(), depth: 12 }], { mask: northOfDiag, yard: false, passages: false, gardens: false });
    roughBlock(K, x0, c1y0, x1 - x0, c2y1 - c1y0 + 1, { walkup, shopLot, out, named, mask: southOfDiag });
    roughBlock(K, x0, c1y0, x1 - x0, c2y1 - c1y0 + 1, { walkup, shopLot, out, named, mask: northOfDiag });
  }
  // the street trees, benches and bus stops of the main streets (curated: the generator's sprinkle stays off here)
  streetDressing(K, out, poi0);
  out.named = named.size;
  return out;

  function pickShop(cat, k) { for (let t = 0; t < 20; t++) { const [name, store] = pick(SHOPS[cat], rnd(k * 31 + t, cat.length, 102)); if (!named.has(name)) { named.add(name); return { name, store, w: 6 }; } } return { ...composeShop(named, cat, (j) => rnd(k * 31 + j, 7, 106)), w: 6 }; }
  function splitLots(room, f) { const out2 = []; let k = 0; while (room >= 5) { const L = f(k++); const w = Math.min(room, L.w || 6); out2.push({ ...L, w }); room -= w; } if (room > 0) out2.push({ gap: room, kind: 'passage' }); return out2; }
}

// the murals painted on a wall now and then (client/art2/buildings.js mural: MU1's kinds, invented)
const MURALS = ['sunset', 'waves', 'flowers', 'geo', 'tiger', 'skyline', 'koi'];

// The yards behind a row of backs (its buildings front the street to the north; the strip south of them down to the
// alley is theirs, and it is what the camera sees): a patio with a table under an umbrella and festoon lights, a lawn
// with a tree and a bench, a vegetable garden in raised beds, a shed; picket and board fences between them and along
// the alley with a gap for the gate, the bins by it; a rough one now and then (tyres, pallets, drums, chain-link)
function rearYards(K, made, yEnd, o = {}) {
  const { rnd, pick, prop, fill } = K;
  for (const b of made) {
    if (!b || b.gap || b.tw === undefined) continue;
    const x = b.tx, w = b.tw, y = b.ty + b.th, h = yEnd - y + 1;
    if (h < 2) continue;
    const r = (k) => rnd(x, y, 300 + k), rough = o.rough || (o.grime || 0) > 0.3 || r(0) < 0.08;
    // a parking pad off the alley at the east end of some yards (the car kept round the back): decided first, so the
    // garden keeps off it
    let padX = null;
    if (!rough && w >= 9 && h >= 8 && r(40) < 0.3) padX = x + w - 4;
    const wg = padX !== null ? padX - x : w;   // (the width the garden has: all of it but the pad)
    // the patio by the back door: paving, a table under an umbrella and two chairs (or a bench), pots, a bike
    const ph = rough ? h : Math.min(h, 2 + Math.floor(r(30) * 2)), cx = x + wg / 2;
    fill(x, y, w, ph, T.PLAZA);
    // (its surface: decking, brick pavers or stone flags - not the pavement's concrete)
    if (!rough && ph >= 2) prop('patio', x + wg / 2, y + ph / 2, 0, { w: Math.round(wg * TILE) - 6, h: Math.round(ph * TILE) - 4, k: pick(['deck', 'brick', 'flag', 'deck'], r(41)) });
    if (!rough) {
      if (r(31) < 0.65) { prop('cafetable', cx, y + ph / 2 + 0.2, 0); prop(pick(['umbrella_y', 'umbrella_b', 'umbrella_r', 'umbrella_g'], r(2)), cx, y + ph / 2 + 0.1, 0); prop('chair', cx - 0.9, y + ph / 2 + 0.3, 0, { v: Math.floor(r(3) * 4), a: 0 }); prop('chair', cx + 0.9, y + ph / 2 + 0.3, 0, { v: Math.floor(r(4) * 4), a: 3.1416 }); }
      else prop('bench_m', cx, y + ph - 0.6, 0);
      prop('potted', x + 0.7, y + 0.6, 0); if (w >= 6) prop(pick(['potted', 'planter_fl', 'acunit'], r(32)), x + w - 0.7, y + 0.6, 0);
      if (w >= 6 && r(5) < 0.4) prop('festoon', x + 0.5, y + 0.4, 0, { tx: Math.round((w - 1) * TILE), ty: 0, h: 34 });
      if (r(6) < 0.25) prop('bikerack', x + wg - 1.6, y + ph - 0.5, 0);
    } else for (let i = 0; i < 3; i++) prop(pick(['tires', 'pallet', 'drum', 'crates', 'bags', 'dump_o'], r(17 + i)), x + 1 + r(19 + i) * Math.max(0, w - 2), y + 0.8 + r(21 + i) * Math.max(0, h - 1.6), 8);
    // the rest of it: a lawn (a tree, shrubs, flowers, a shed), a vegetable garden (raised beds, a shed), or paved
    const gy = y + ph, gh = h - ph, kind = r(1) < 0.55 ? 'lawn' : r(1) < 0.88 ? 'garden' : 'yard';
    if (!rough && gh >= 2) {
      fill(x, gy, w, gh, kind === 'yard' ? T.PLAZA : T.GRASS);
      if (kind === 'lawn') {
        if (gh >= 3 && r(7) < 0.75) prop('tree_a', x + 1.5 + r(8) * Math.max(0, wg - 3), gy + gh / 2 + 0.6, 10, { sp: pick(['maple', 'street', 'oak', 'cherry', 'flowerTree'], r(9)), k: 0.9 });
        for (let i = 0; i < Math.max(1, Math.floor(wg / 4)); i++) prop(pick(['flowers_a', 'shrub_a', 'bush_c', 'flowers_big'], r(11 + i)), x + 0.8 + i * 3.6, gy + gh - 0.9, 0);
        if (wg >= 7 && gh >= 3 && r(12) < 0.35) prop('shed', x + wg - 1.8, gy + 1.3, 12);
      } else if (kind === 'garden') {
        const n = Math.max(1, Math.min(3, Math.floor((wg - 1.5) / 2.2))), rows = gh >= 5 ? 2 : 1;
        for (let j = 0; j < rows; j++) for (let i = 0; i < n; i++) prop('raisedbed', x + 1.3 + i * 2.2, gy + 1 + j * 2.2, 0, { v: Math.floor(r(13 + i + j * 3) * 3) });
        if (wg >= 6 && r(16) < 0.4) prop('shed', x + wg - 1.6, gy + gh - 1.4, 12); else prop('potted', x + wg - 1, gy + gh - 1, 0);
      } else { prop('patio', x + wg / 2, gy + gh / 2, 0, { w: Math.round(wg * TILE) - 6, h: Math.round(gh * TILE) - 4, k: 'flag' }); prop(pick(['bikerack', 'crates', 'pallet_s'], r(33)), x + 1.5, gy + gh / 2, 8); prop('acunit', x + wg - 1.4, gy + 0.8, 0); }
    }
    // the pad: asphalt, a car on it now and then (server/systems/traffic.js parks one in m.parking)
    if (padX !== null) {
      K.paint(padX, y + h - 6, 4, 6, T.LOT);
      K.m.parking.push({ x: (padX + 2) * TILE, y: (y + h - 3) * TILE, a: Math.PI / 2, drive: true });
    }
    // its fences: on the west side (a board or picket fence, a hedge now and then; chain-link in a rough one), along the
    // alley with a gap for the gate; the bins by the gate
    if (r(23) < 0.7) {
      if (!rough && r(34) < 0.2) prop('hedgebox', x + 0.2, y + h - 0.2, 0, { w: 10, d: Math.round((h - 0.4) * TILE), h: 26 });
      else prop(rough ? 'chainfence' : 'fenceline', x + 0.08, y + 0.2, 0, rough ? { tx: 0, ty: Math.round((h - 0.4) * TILE) } : { kind: r(24) < 0.5 ? 'picket' : 'wood', tx: 0, ty: Math.round((h - 0.4) * TILE) });
    }
    // (the alley fence stops short of the gate - and of the parking pad: never across where the car comes out)
    const fl = (padX !== null ? padX - x - 0.4 : w - 2.2);
    if (h >= 3 && r(27) < 0.6 && fl >= 1.5) prop(rough ? 'chainfence' : 'fenceline', x + 0.1, y + h - 0.3, 0, rough ? { tx: Math.round(fl * TILE), ty: 0 } : { kind: r(28) < 0.5 ? 'wood' : 'picket', tx: Math.round(fl * TILE), ty: 0 });
    const bin = r(25) < 0.6;
    prop(bin ? 'trashcan' : 'dump_g', padX !== null ? padX - 0.8 : x + w - 1.2, y + h - 0.6, bin ? 0 : 12);
  }
}

// The front gardens of a row facing the street to its north (its buildings stand `sb` tiles back from the pavement):
// a little garden each - a low picket fence or a hedge along the pavement with the gate at the path to the door, a
// shrub or flowers, the bins by the gate; a paved front for a rough one (bins, a bike, a planter)
function frontGardens(K, made, y0, sb, o = {}) {
  const { rnd, pick, prop, fill } = K;
  for (const b of made) {
    if (!b || b.gap || b.tw === undefined || b.ty - y0 !== sb) continue;
    const x = b.tx, w = b.tw, r = (k) => rnd(x, y0, 600 + k), rough = o.rough || (o.grime || 0) > 0.3 || r(0) < 0.12;
    const dx = b.door ? b.door.tx : x + (w >> 1);
    fill(x, y0, w, sb, rough ? T.PLAZA : T.GRASS);
    fill(dx, y0, 1, sb, T.PLAZA);   // (the path to the door)
    if (!rough) {
      const kind = r(1) < 0.55 ? 'picket' : r(1) < 0.8 ? 'iron' : 'hedge';
      if (kind === 'hedge') { if (dx - x >= 2) prop('hedgebox', x + 0.2, y0 + 0.5, 0, { w: Math.round((dx - x - 0.4) * TILE), d: 10, h: 18 }); if (x + w - dx - 1 >= 2) prop('hedgebox', dx + 1.2, y0 + 0.5, 0, { w: Math.round((x + w - dx - 1.4) * TILE), d: 10, h: 18 }); }
      else { if (dx - x >= 2) prop('fenceline', x + 0.15, y0 + 0.3, 0, { kind, tx: Math.round((dx - x - 0.3) * TILE), ty: 0 }); if (x + w - dx - 1 >= 2) prop('fenceline', dx + 1.15, y0 + 0.3, 0, { kind, tx: Math.round((x + w - dx - 1.3) * TILE), ty: 0 }); }
      for (let i = 0; i < Math.max(1, Math.floor(w / 4)); i++) { const px = x + 0.9 + i * 3.7; if (Math.abs(px - dx - 0.5) > 1.1) prop(pick(['flowers_a', 'shrub_a', 'bush_c', 'flowers_big', 'potted'], r(3 + i)), px, y0 + sb - 0.8, 0); }
    }
    prop(r(9) < 0.6 ? 'trashcan' : 'bikerack', dx + (dx - x > 2 ? -1.1 : 1.6), y0 + sb - 0.6, 0);
    if (rough && r(10) < 0.5) prop(pick(['bags', 'crates', 'tires'], r(11)), x + w - 1.2, y0 + 0.8, 0);
  }
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
  return { arch: 'diner', key: 'diner', name: 'Starlite Diner', poi: { kind: 'coffee', label: 'Starlite Diner', food: true }, whole: true,
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
// The 9th Precinct on Pier Street at Civic Avenue: the station with a forecourt (the flag, the planters and lamps by the
// doors), the cells at the back (shared/cells.js); the plain block next door becomes its motor pool (shared/map.js
// buildMotorPools: the fenced lot, the cruisers and bikes inside, the gate onto Pier Street)
function precinctLot() {
  return { arch: 'police', key: 'police', name: 'Midtown Precinct', poi: { kind: 'police', label: 'Midtown 9th Precinct' }, front: 3, whole: true };
}
// Marlow & Finch, the department store: stone, tall windows under a dentil cornice, the long shopfront
function deptStore() {
  return { arch: 'mixed', name: 'Marlow & Finch', poi: { kind: 'clothing', label: 'Marlow & Finch' }, whole: true,
    art: { spec: { floors: 3, style: 'stone', wallColor: '#d8ccb4', win: 'tall', cornice: 'dentil', parapet: 12, grime: 0.08, roofMat: 'gravel', lip: 10, rimW: 5 },
      shop: { kind: 'clothes', door: 'left', open: true, people: 4, awning: ['#1e2a3a', '#1e2a3a'], sign: { text: 'MARLOW & FINCH', bg: '#1e2a3a', fg: [236, 214, 150], lit: true } } } };
}
// The Pier Street Market: the old market hall, round-headed windows, its glazed roof ridge (rows of skylights), food
// counters inside (a counter with a queue: the key's)
function marketHall() {
  const kit = [];
  for (let ry = 70; ry <= 380; ry += 52) for (let rx = 40; rx <= 780; rx += 34) kit.push(['sky', rx, ry]);
  kit.push(['hvac', 60, 470], ['vent', 400, 470], ['vent', 700, 470]);
  return { arch: 'strip', key: 'rest2', name: 'Pier Street Market', poi: { kind: 'coffee', label: 'Pier Street Market', food: true }, whole: true,
    art: { spec: { floors: 2, style: 'stone', wallColor: '#c8b898', win: 'arch', cornice: 'step', date: '1898', parapet: 14, grime: 0.15, roofMat: 'metal', lip: 10, rimW: 5 },
      shop: { kind: 'diner', door: 'left', open: true, people: 6, awning: ['#2f6a4e', '#2f6a4e'], sign: { text: 'MARKET HALL', bg: '#2f6a4e', fg: [250, 240, 200], lit: true } }, kit } };
}
// The Holloway, a small hotel: brick, an oriel up the middle, the HOTEL blade, the lobby under its awning
function hotelLot() {
  return { arch: 'mixed', name: 'The Holloway Hotel', poi: { kind: 'delivery', label: 'The Holloway Hotel' }, whole: true,
    art: { spec: { floors: 4, style: 'brick', brickTone: '#4a5a6a', win: 'bay', cornice: 'bracket', parapet: 10, grime: 0.1, roofMat: 'tar', lip: 10, rimW: 4, blades: [{ text: 'HOTEL', x: 10, v: 80, col: [255, 90, 80] }] },
      shop: { kind: 'lobby', door: 'right', open: true, people: 2, awning: ['#7a2e2e', '#7a2e2e'], sign: { text: 'THE HOLLOWAY', bg: '#7a2e2e', fg: [250, 230, 190], lit: true } } } };
}
// The Foundry Lofts: a brick works turned flats - steel-framed loft windows, the stepped parapet with its date, a water
// tower; a cafe on the ground floor
function loftLot() {
  return { arch: 'mixed', key: 'greenbistro', name: 'The Foundry Lofts', poi: { kind: 'coffee', label: 'Foundry Coffee' }, home: { kind: 'apartment', price: 26000 }, whole: true,
    art: { spec: { floors: 4, style: 'brick', brickTone: '#7a3a2e', win: 'loft', cornice: 'step', date: '1907', parapet: 12, grime: 0.28, roofMat: 'tar', lip: 10, rimW: 4 },
      shop: { kind: 'cafe', door: 'left', open: true, people: 3, awning: ['#3a3a44', '#e8e4dc'], sign: { text: 'FOUNDRY COFFEE', bg: '#2a2c38', fg: [236, 206, 120], lit: true } },
      kit: [['tank', 120, 90], ['hut', 640, 70], ['acs', 300, 120], ['acs', 340, 120], ['vent', 500, 200], ['sky', 260, 300], ['sky', 300, 300], ['sky', 340, 300], ['plant', 700, 420], ['umb', 760, 400], ['table', 720, 380]] } };
}
function garageLot() {
  return { arch: 'garage', key: 'repair', name: 'Fresh Coat Garage', poi: { kind: 'garage', label: 'Fresh Coat Garage' }, whole: true };
}

// A car park on a corner lot: asphalt, bays in two rows facing a lane down the middle, the barrier at the way in from
// the street, the pay board and a lamp or two, chain-link along the pavement (its cars: server/systems/traffic.js parks
// them in m.parking)
function carPark(K, x, y, w, h, out) {
  const { m, prop } = K;
  if (!K.allFree(x, y, w, h)) return;
  K.fill(x, y, w, h, T.LOT); K.take(x, y, w, h);
  const rows = h >= 14 ? [y + 2, y + h - 6] : [y + 2];
  for (const ry of rows) for (let sx = x + 1; sx + 2 <= x + w - 1; sx += 3) {
    const back = ry === rows[0];
    m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE });
    m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: back ? -Math.PI / 2 : Math.PI / 2 });
  }
  const gx = x + w - 4;
  prop('chainfence', x + 0.2, y + h - 0.3, 0, { tx: (gx - x - 1.4) * TILE, ty: 0 });
  prop('ygate', gx + 1.5, y + h - 0.8, 0, { a: 0 });
  prop('textsign', x + 3, y + h - 1.2, 0, { text: 'PARKING $5', bg: '#1e3a5e', fg: [250, 250, 240], z: 34, sx: 1 });
  prop('lamp', x + 0.8, y + 0.8, 0); prop('lamp', x + w - 0.8, y + h / 2, 0);
  (out.places ||= []).push({ name: 'Harbor Avenue Parking', x0: x, y0: y, x1: x + w, y1: y + h });
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
  const nrow = K.row(x, x + w, y + 2, y + rowD - 1, (xx, room) => { if (room < 4) return null; const ww = room <= 13 ? room : 9 + Math.floor(rnd(xx, y, 140) * 4); return { w: ww, ...walkup(xx, y, ww, { floors: 2, line: true }), face: 'N' }; }, { north: true });
  frontGardens(K, nrow, y, 2, {});
  // the side wings (west and east), their doors on the court
  for (const wx of [x, x + w - wing]) K.building({ x: wx, y: y + rowD, w: wing, h: h - 2 * rowD, ...walkup(wx, y + rowD, wing, { floors: 3 }), door: null, home: null });
  // the south row on the boulevard: shops and the corner bodega
  K.row(x, x + w, y + h - rowD, y + h - 1, (xx, room, i) => {
    if (room < 4) return null;
    if (i === 0) return { w: 8, ...shopLot(xx, y + h - 1, 8, { name: 'Court Bodega', store: 'mart', poi: { kind: 'convenience', label: 'Court Bodega' }, awning: ['#e0b040', '#f0ece4'], openSign: true, floors: 3 }) };
    if (room >= 10 && Math.abs(xx + 3 - (x + (w >> 1))) < 6) return { gap: 6, kind: 'passage' };   // the gate into the court
    const ww = room <= 13 ? room : 9 + Math.floor(rnd(xx, y + h, 141) * 4);
    return { w: ww, ...walkup(xx, y + h - 1, ww, { floors: 3 }) };
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
  const slab = (bx, by, bw, bh, name, mural = null) => {
    const L = walkup(bx, by, bw, { floors: 4, grime: 0.45, graffiti: 2, line: true, home: { price: 7000 }, mural });
    L.art.spec.balconies = false;
    L.art.spec.fireEscape = [Math.max(8, Math.round(bw * TILE * 0.5) - 25), 50];
    return K.building({ x: bx, y: by, w: bw, h: bh, ...L, name });
  };
  const sh = 13, rowS = 16, side = 13;   // a slab's depth, the boulevard row's, a side slab's width
  const backW = (w - 6) >> 1;
  // (the residents' murals on the two slabs facing the yard: the wave, the flowers)
  // (the forecourt between Central Avenue and the two back slabs: cracked paving, chain-link along the pavement with the
  // gate, the bins, a bench, a shopping cart - the slabs stand back behind it, so the avenue stays in view)
  const fc = 6;
  K.fill(x, y, w, fc, T.PLAZA); K.take(x, y, w, fc);
  prop('chainfence', x + 1, y + 0.4, 0, { tx: (w / 2 - 5) * TILE, ty: 0 }); prop('chainfence', x + w / 2 + 3, y + 0.4, 0, { tx: (w / 2 - 4) * TILE, ty: 0 });
  for (const [t, fx, sol] of [['dump_g', 0.12, 14], ['dump_o', 0.2, 14], ['bench_m', 0.38, 0], ['trashcan', 0.62, 0], ['tires', 0.7, 0], ['bags', 0.86, 0]]) prop(t, x + w * fx, y + fc - 2, sol);
  slab(x + 1, y + fc, backW, sh, 'Midtown Houses A', 'waves');
  slab(x + w - backW - 1, y + fc, backW, sh, 'Midtown Houses B', 'flowers');
  const sy0 = y + fc + sh + 4, sy1 = y + h - rowS - 6;   // the side slabs, the yard's west and east sides
  slab(x + 1, sy0, side, sy1 - sy0, 'Midtown Houses C');
  slab(x + w - side - 1, sy0, side, sy1 - sy0, 'Midtown Houses D');
  // the yard: cracked paving, the court and its hoop at the north end, the burn barrel and the benches; a worn lawn
  // with trees and picnic tables in the middle; the residents' car park at the south end
  const yx = x + side + 2, yy = y + fc + sh + 2, yw = w - 2 * side - 4, yh = sy1 - yy;
  fill(yx, yy, yw, yh, T.PLAZA); K.take(yx, yy, yw, yh);
  const cx = x + w / 2;
  if (yw >= 24 && yh >= 30) {
    prop('court', cx, yy + 1.5, 0, { w: 15 * TILE, d: 11 * TILE, c1: '#5a5a62', c2: '#7a4a9a' });
    prop('hoop', cx, yy + 2.1, 6);
    prop('burnbarrel', cx - 10, yy + 10, 8); prop('bench_m', cx - 13, yy + 12, 0);
    // the block party on the court of a summer night (server/systems/activities.js 'party': map.partySpots)
    prop('boombox', cx + 5, yy + 9.5, 0); (K.m.partySpots ||= []).push({ x: Math.round(cx * TILE), y: Math.round((yy + 7.5) * TILE), name: 'Midtown Houses' });
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
      if (f === 'S' && i % 4 === 1) return { w: ww, ...shopLot(xx, r1, ww, { ...composeShop(ctx.named, 'rough', (k) => rnd(xx + k, r1, 153)), grille: true, openSign: true, awning: rnd(xx, r1, 154) < 0.4 ? ['#3a3a44', '#e8e4dc'] : null, grime: 0.45, floors: 2 + Math.floor(rnd(xx, r1, 155) * 2) }) };
      return { w: ww, ...walkup(xx, r1, ww, { grime: 0.45, graffiti: rnd(xx, r1, 156) < 0.4 ? 1 : 0, boarded: rnd(xx, r1, 157) < 0.2 ? 0.25 : 0, ...(f === 'N' ? { floors: 1 + (rnd(xx, r1, 158) < 0.35 ? 1 : 0) } : {}) }), ...(f === 'N' ? { face: 'N' } : {}) };
    }, { rough: true, mask: ctx.mask || null });
  }
}

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
// The skate spot by the El (Trestle Street between Fulton Street and Harborview Avenue): an empty lot the skaters
// poured themselves, in the viaduct's shadow - the slab, a block wall along the back covered in pieces, quarter pipes
// against it, a pyramid in the middle, ledges (a red curb, a blue one), a flat bar, a plywood kicker; chain-link along
// Central Avenue with the way in; skaters riding laps (server/systems/activities.js 'skaters': map.skateSpots)
function skateSpot(K, x, y, w, h, out) {
  const { m, prop } = K;
  K.fill(x, y, w, h, T.PLAZA);
  const at = (fx, fy) => [x + w * fx, y + h * fy];
  const put = (t, [px, py], extra, solid = 0) => prop(t, px, py, solid, extra);
  put('skatepad', [x + w / 2, y + 1.3], { w: Math.round((w - 0.4) * TILE), d: Math.round((h - 1.6) * TILE) });
  put('gwall', [x + w / 2, y + 0.6], { len: Math.round((w - 0.6) * TILE), v: 3 });
  put('qpipe', [x + 4, y + 2.2], { w: 192 });
  put('qpipe', [x + w - 3.5, y + 2.2], { w: 160 });
  put('pyramid', at(0.5, 0.42));
  put('kicker', at(0.2, 0.42));
  put('ledge', at(0.8, 0.46), { w: 160, v: 1 });
  put('ledge', at(0.28, 0.66), { w: 128 });
  put('flatbar', at(0.56, 0.7), { w: 128 });
  put('ledge', at(0.84, 0.74), { w: 96, v: 2 });
  put('boombox', at(0.3, 0.71));
  put('trashcan', [x + 0.8, y + h - 2], null, 0);
  put('trashcan', [x + w - 0.8, y + 3.8], null, 0);
  put('bags', [x + w - 1, y + 4.6]);
  put('chainfence', [x + 0.2, y + h - 0.4], { tx: (w * 0.36) * TILE, ty: 0 });
  put('chainfence', [x + w * 0.64, y + h - 0.4], { tx: (w * 0.36 - 0.2) * TILE, ty: 0 });
  put('lamp', [x + w * 0.38, y + h - 0.6]); put('lamp', [x + w * 0.62, y + h - 0.6]);
  // where a friend sits to watch: on the plain ledge, on the red one (px)
  const seats = [[0.28, 0.66], [0.8, 0.46]].map(([fx, fy]) => ({ x: Math.round((x + w * fx) * TILE), y: Math.round((y + h * fy) * TILE) + 4 }));
  (m.skateSpots ||= []).push({ name: 'The Trestle Spot', x, y, w, h, seats });
  (out.places ||= []).push({ name: 'The Trestle Spot', x0: x, y0: y, x1: x + w, y1: y + h });
}
// The plaza at the foot of Midtown Station's stair tower (Trestle Street at Madison Street): paving, the hot-dog cart for
// the commuters, benches, a bike rack and a planter or two, the news boxes, the neighbourhood map board
function stationPlaza(K, x, y, w, h) {
  const { prop } = K;
  K.fill(x, y, w, h, T.PLAZA);
  prop('foodcart', x + w * 0.35, y + 3.2, 14);
  prop('bench_m', x + w * 0.2, y + h - 1.6, 0); prop('bench_m', x + w * 0.62, y + h - 1.6, 0);
  prop('bikerack', x + 1.6, y + 1.2, 0); prop('mapboard', x + w * 0.75, y + 2.4, 6);
  prop('news_a', x + w - 1.2, y + 4.8, 0); prop('news_c', x + w - 1.2, y + 5.6, 0); prop('trashcan', x + 1, y + h - 1, 0);
  prop('planter_g', x + w * 0.45, y + h - 3.2, 10); prop('tree_a', x + w * 0.85, y + h - 2.2, 10, { sp: 'street', k: 1.1, grate: true });
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
      art: { spec: { floors: 4, ...f, parapet: 12, cornice: 'bracket', win: 'tall', roofMat: 'tar', lip: 10, rimW: 4, balconies: false, fireEscape: first ? [60, 50] : null, groundH: first ? undefined : 0 }, noShop: !first,
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

// ---------------------------------------------------------------------------------------------------------------
// Linden Walk: a paved walk five tiles wide down through the long blocks, from Central Avenue over the alleys and Holly
// Street to the boulevard and the Commons' north gate - the shops turn their side walls to it. Plane trees in grates
// down both sides, benches between them, lamps, a cafe's tables, bollards where it crosses the alleys, its sign.
function lindenWalk(K, y0, y1, out) {
  const { m, prop, rnd, pick } = K;
  const x0 = MX.linden - 2, w = 5;
  K.fill(x0, y0, w, y1 - y0 + 1, T.PLAZA);
  K.take(x0, y0, w, y1 - y0 + 1);
  const paved = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.PLAZA;
  for (let y = y0 + 2, k = 0; y <= y1 - 2; y += 4, k++) {
    if (!paved(x0, y) || !paved(x0, y + 1) || !paved(x0, y - 1)) continue;
    if (k % 2 === 0) for (const tx of [x0 + 0.6, x0 + w - 0.6]) prop('tree_a', tx, y + 0.5, 10, { sp: 'streetPl', k: 1.05, grate: true });
    else if (k % 4 === 1) { prop('bench_m', x0 + 1.1, y + 0.5, 0); prop('lamp', x0 + w - 0.5, y + 0.5, 0); }
    else if (rnd(x0, y, 700) < 0.6) { prop('cafetable', x0 + w / 2, y + 0.5, 0); prop(pick(['umbrella_g', 'umbrella_r', 'umbrella_y'], rnd(x0, y, 701)), x0 + w / 2, y + 0.4, 0); prop('chair', x0 + w / 2 - 0.9, y + 0.6, 0, { v: 1, a: 0 }); prop('chair', x0 + w / 2 + 0.9, y + 0.6, 0, { v: 1, a: 3.1416 }); }
    else prop(pick(['planter_fl', 'flowers_big', 'potted'], rnd(x0, y, 702)), x0 + w / 2, y + 0.5, 0);
  }
  // (bollards across its ends at the alleys - the walk is no way round for a car)
  for (const ay of [AL.b1, AL.b2]) for (const sy of [-2, 2]) for (let k = 0; k < 3; k++) if (paved(x0 + 1 + k * 1.5, ay + sy)) prop('bollard', x0 + 1 + k * 1.5, ay + sy + 0.5, 5);
  prop('textsign', x0 + w / 2, y0 + 1.4, 0, { text: 'LINDEN WALK', bg: '#2f5a4a', fg: [240, 232, 200], z: 30, sx: 1 });
  (out.places ||= []).push({ name: 'Linden Walk', x0, y0, x1: x0 + w, y1 });
}

// Garden Crescent (the owner's 10-17 ask for a curved street and a residential set piece; concept 3.2's crescent of
// townhouses): one terrace of cream stucco houses round the north side of the crescent street, its middle a floor
// higher, iron railings and steps; their back gardens to the boulevard behind a hedge; inside the curve the residents'
// garden - a fountain in the middle of a ring path, the bandstand, cherry and magnolia trees round the railings, beds
// and benches - open to Harbor Avenue through its gate
function gardenCrescent(K, x0, y0, x1, y1, ctx) {
  const { m, prop, rnd, pick } = K;
  const { walkup, out } = ctx;
  const cx = CRES.cx, rx = CRES.rx, ry = MY.harbor - CRES.top, oy = MY.harbor;
  const k2 = (x, y, ax, ay) => ((x + 0.5 - cx) / ax) ** 2 + ((y + 0.5 - oy) / ay) ** 2;
  const outside = (x, y) => k2(x, y, rx, ry) > 1;
  // the terrace: houses six wide stepping round the curve, the middle three a floor higher
  const made = K.row(cx - 38, cx + 39, y0 + 1, y1, (x, room, i) => {
    if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    const w = Math.min(room, 6), mid = Math.abs(x + 3 - cx) < 10;
    const L = walkup(x, y1, w, { face: { style: 'stucco', wallColor: mid ? '#ece4d2' : '#e2d8c2' }, floors: mid ? 4 : 3, home: { kind: 'house', price: 34000, name: `${12 + i * 2} Garden Crescent` }, garden: false });
    Object.assign(L.art.spec, { win: 'tall', cornice: 'dentil', fireEscape: null, balconies: mid, shutters: null, parapet: 8, grime: 0.04 });
    return { w, depth: 11, ...L, name: null };
  }, { mask: outside });
  for (const b of made) {
    if (!b || b.gap || b.tw === undefined) continue;
    const fy = b.ty + b.th, dx = b.door ? b.door.tx : b.tx + 1;
    // the front: paving to the pavement, railings either side of the steps, a pot
    for (let xx = b.tx; xx < b.tx + b.tw; xx++) { const c = K.column(xx, fy, y1, outside); if (c) K.fill(xx, fy, 1, c[0] - fy + 1, T.PLAZA); }
    if (dx - b.tx >= 2) prop('fenceline', b.tx + 0.2, fy + 1.4, 0, { kind: 'iron', tx: Math.round((dx - b.tx - 0.4) * TILE), ty: 0 });
    if (b.tx + b.tw - dx - 1 >= 2) prop('fenceline', dx + 1.2, fy + 1.4, 0, { kind: 'iron', tx: Math.round((b.tx + b.tw - dx - 1.4) * TILE), ty: 0 });
    prop(pick(['potted', 'planter_fl'], rnd(dx, fy, 800)), dx + 1.6, fy + 0.6, 0);
    // the back garden up to the boulevard's pavement: a lawn, a tree or a shed now and then, a board fence between
    const gy = y0 + 1, gh = b.ty - gy;
    if (gh >= 3) {
      K.fill(b.tx, gy, b.tw, gh, T.GRASS);
      if (rnd(b.tx, gy, 801) < 0.6) prop('tree_a', b.tx + b.tw / 2, gy + gh * 0.45, 10, { sp: pick(['maple', 'cherry', 'oak', 'flowerTree'], rnd(b.tx, gy, 802)), k: 0.95 });
      else if (gh >= 6) prop('shed', b.tx + b.tw / 2, gy + gh * 0.4, 12);
      prop('fenceline', b.tx + 0.08, gy + 0.6, 0, { kind: 'wood', tx: 0, ty: Math.round((gh - 0.8) * TILE) });
    }
  }
  // the hedge along the boulevard behind the gardens, and the two corners past the terrace planted
  prop('hedgerun', x0 + 0.5, y0 + 0.4, 0, { tx: Math.round((x1 - x0 - 1) * TILE), ty: 0, h: 18 });
  for (let y = y0 + 2; y <= y1; y++) for (let x = x0; x < x1; x++) {
    if (!K.free(x, y) || !outside(x, y)) continue;
    K.fill(x, y, 1, 1, T.GRASS);
    if (rnd(x, y, 803) < 0.045) prop(pick(['tree_a', 'tree_b', 'shrub_a', 'bush_c'], rnd(x, y, 804)), x + 0.5, y + 0.5, 10, { sp: pick(['oak', 'maple', 'street'], rnd(x, y, 805)), k: 1 });
  }
  // the garden inside the curve
  const gx = rx - 5.2, gyR = ry - 5.2;
  let n = 0;
  for (let y = CRES.top; y <= y1; y++) for (let x = cx - rx; x <= cx + rx; x++) if (K.free(x, y) && k2(x, y, gx, gyR) <= 1) { K.fill(x, y, 1, 1, T.GRASS); n++; }
  if (n < 200) return;
  const fy = oy - 26, fyN = CRES.top + 12;
  // the path in from the gate on Harbor Avenue, the ring round the fountain, the bandstand at the top of the lawn
  K.paint(cx - 1, fy, 3, y1 - fy + 1, T.PLAZA);
  for (let a = 0; a < 48; a++) { const t = (a / 48) * 6.2832, px = cx + 0.5 + Math.cos(t) * 7, py = fy + 0.5 + Math.sin(t) * 5; for (const [ox, oy2] of [[0, 0], [0.6, 0], [0, 0.6]]) K.paint(Math.floor(px + ox - 0.5), Math.floor(py + oy2 - 0.5), 1, 1, T.PLAZA); }
  K.paint(cx - 1, fyN + 3, 3, fy - 5 - fyN - 3, T.PLAZA);
  prop('fountain', cx + 0.5, fy + 0.5, 36);
  prop('gazebo', cx + 0.5, fyN + 1.5, 30);
  for (const [dx, dy] of [[-6, -3.6], [6, -3.6], [-6, 4.4], [6, 4.4]]) prop('pbench', cx + 0.5 + dx, fy + dy, 0);
  for (const [dx, dy] of [[-12, -1], [12, -1], [-10, 7], [10, 7], [-5, -9], [5, -9]]) prop(pick(['flowers_big', 'flowers_a', 'planter_fl'], rnd(cx + dx, fy, 806)), cx + 0.5 + dx, fy + dy, 0);
  prop('lamp', cx - 1.2, y1 - 3, 0); prop('lamp', cx + 2.2, y1 - 3, 0); prop('lamp', cx - 3, fyN + 4, 0); prop('lamp', cx + 4, fyN + 4, 0);
  // cherry and magnolia trees round the inside of the railings, the railings themselves (a ring of short runs)
  for (let a = 3; a < 46; a += 3) {
    const t = Math.PI + (a / 48) * Math.PI, px = cx + 0.5 + Math.cos(t) * (gx - 1.6), py = oy + Math.sin(t) * (gyR - 1.6);
    if (py < y1 - 2 && K.m.tiles[Math.floor(py) * m.w + Math.floor(px)] === T.GRASS) prop('tree_a', px, py, 10, { sp: a % 6 ? 'cherry' : 'magnolia', k: 1.05 });
  }
  for (let a = 0; a < 24; a++) {
    const t0 = Math.PI + (a / 24) * Math.PI, t1 = Math.PI + ((a + 1) / 24) * Math.PI;
    const p0 = [cx + 0.5 + Math.cos(t0) * (gx + 0.4), oy + Math.sin(t0) * (gyR + 0.4)], p1 = [cx + 0.5 + Math.cos(t1) * (gx + 0.4), oy + Math.sin(t1) * (gyR + 0.4)];
    if (Math.max(p0[1], p1[1]) > y1 - 0.5) continue;
    prop('fenceline', p0[0], p0[1], 0, { kind: 'iron', tx: Math.round((p1[0] - p0[0]) * TILE), ty: Math.round((p1[1] - p0[1]) * TILE) });
  }
  // the hedge along Harbor Avenue with the gate, the garden's name board
  prop('hedgerun', cx - gx + 1, y1 + 0.6, 0, { tx: Math.round((gx - 3.5) * TILE), ty: 0, h: 16 });
  prop('hedgerun', cx + 2.5, y1 + 0.6, 0, { tx: Math.round((gx - 3) * TILE), ty: 0, h: 16 });
  prop('textsign', cx - 4, y1 - 1.2, 0, { text: 'CRESCENT GARDENS', bg: '#2f5a4a', fg: [240, 232, 200], z: 28, sx: 1 });
  (out.places ||= []).push({ name: 'Garden Crescent', x0: cx - 40, y0, x1: cx + 40, y1: CRES.top }, { name: 'Crescent Gardens', x0: cx - 20, y0: CRES.top + 6, x1: cx + 20, y1 });
}

// The Commons (the owner's 10-17 ask for a big park and its pavilion): the park between the bridge approaches, the
// boulevard to Harbor Avenue. Linden Walk comes in at the north gate to the fountain; the walk runs on south through the
// park to the statue at the south gate; the Great Lawn inside its ring path with the bandstand, the pavilion cafe on the
// lawn's north side; the duck pond in the west; the dog run; Commons Courts in the north-east corner; Union Square, the
// paved square round the subway's stairs, in the south-east corner. Iron railings round it with gates; groves of oak,
// maple and plane, cherries by the pond; lamps and benches along the paths.
function commons(K, x, y, w, h, out) {
  const { m, prop, rnd, pick } = K;
  const X1 = x + w, Y1 = y + h - 1;   // (x1 exclusive, y1 inclusive)
  const lawn = { cx: 3092, cy: 1857, rx: 27, ry: 19 };
  // (the pavilion cafe first, on the lawn's north side: the park's ground is all taken next)
  K.building({ x: lawn.cx - 9, y: y + 2, w: 18, h: 7, arch: 'pavilion', name: 'Commons Pavilion', poi: { kind: 'coffee', label: 'Pavilion Cafe' }, whole: true,
    art: { spec: { floors: 1, style: 'stucco', wallColor: '#e8e2d2', parapet: 6, roofMat: 'green', lip: 8, rimW: 4 }, shop: { kind: 'cafe', door: 'left', open: true, people: 3, awning: ['#2f6a4e', '#f0ece4'], sign: { text: 'PAVILION CAFE', bg: '#2f6a4e', fg: [240, 232, 200], lit: true } } } });
  K.fill(x, y, w, h, T.GRASS); K.take(x, y, w, h);
  const tileAt = (tx, ty) => m.tiles[ty * m.w + tx];
  const pave = (tx, ty, t = T.PLAZA) => { if (tx >= x && ty >= y && tx < X1 && ty <= Y1) K.paint(tx, ty, 1, 1, t); };
  const path = (pts, wd = 3, t = T.PLAZA) => {
    for (let j = 1; j < pts.length; j++) {
      const [ax, ay] = pts[j - 1], [bx, by] = pts[j], n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
      for (let k = 0; k <= n; k++) { const px = ax + ((bx - ax) * k) / n, py = ay + ((by - ay) * k) / n; for (let dy = -wd / 2; dy < wd / 2; dy += 0.5) for (let dx = -wd / 2; dx < wd / 2; dx += 0.5) pave(Math.floor(px + dx), Math.floor(py + dy), t); }
    }
  };
  const oval = (cx, cy, ax, ay, n = 64) => { const pts = []; for (let a = 0; a <= n; a++) pts.push([cx + Math.cos((a / n) * 6.2832) * ax, cy + Math.sin((a / n) * 6.2832) * ay]); return pts; };
  const LX = MX.linden + 0.5;   // (the walk's middle)
  // --- Union Square, the paved square in the south-east corner by the subway's stairs
  const UQ = [3124, 1850];
  unionSquare(K, UQ[0], UQ[1], X1 - UQ[0], Y1 - UQ[1] + 1, out);
  // --- the paths: the walk from the north gate to the south gate, the Great Lawn's ring, the ways in from the avenues
  path([[LX, y], [LX, Y1 + 1]], 4);
  path(oval(lawn.cx, lawn.cy, lawn.rx, lawn.ry), 3);
  path([[LX, lawn.cy], [lawn.cx - lawn.rx, lawn.cy]], 3);
  path([[x, 1848], [LX, 1848]], 3);
  path([[lawn.cx + lawn.rx * 0.7, lawn.cy + lawn.ry * 0.72], [UQ[0] + 2, 1874]], 3);
  path([[lawn.cx + lawn.rx * 0.78, lawn.cy - lawn.ry * 0.62], [X1, 1839]], 3);
  path([[lawn.cx, y + 9], [lawn.cx, lawn.cy - lawn.ry]], 3);
  // --- the fountain plaza inside the north gate: the big fountain, benches round it, beds, the chess tables
  const F = [LX, y + 11];
  for (let ty = F[1] - 8; ty <= F[1] + 8; ty++) for (let tx = Math.floor(F[0] - 9); tx <= F[0] + 9; tx++) if (((tx + 0.5 - F[0]) / 8.5) ** 2 + ((ty + 0.5 - F[1]) / 7) ** 2 <= 1) pave(tx, ty);
  prop('fountain', F[0], F[1], 36);
  for (const [dx, dy] of [[-5, -3], [5, -3], [-5.5, 3.2], [5.5, 3.2]]) prop('pbench', F[0] + dx, F[1] + dy, 0);
  for (const [dx, dy] of [[-8, 0], [8, 0], [0, 6.2]]) prop('flowers_big', F[0] + dx, F[1] + dy, 0);
  for (const dx of [-13, -16, 13]) { prop('cafetable', F[0] + dx, F[1] + 5, 0); prop('chair', F[0] + dx - 0.9, F[1] + 5.1, 0, { v: 1, a: 0 }); prop('chair', F[0] + dx + 0.9, F[1] + 5.1, 0, { v: 1, a: 3.1416 }); }
  K.m.squares ||= []; K.m.squares.push({ x: Math.round(F[0]) - 6, y: F[1] - 5, w: 12, h: 10, name: 'Commons Fountain' });
  // --- the pavilion cafe on the lawn's north side, the bandstand on the lawn, festoon lights between them
  for (const dx of [-6, -3, 3, 6]) { prop('cafetable', lawn.cx + dx, y + 10.5, 0); prop(pick(['umbrella_g', 'umbrella_y'], rnd(dx, y, 900)), lawn.cx + dx, y + 10.4, 0); }
  prop('gazebo', lawn.cx + 12, lawn.cy - 8, 30);
  prop('festoon', lawn.cx + 2, lawn.cy - 12, 0, { tx: 9 * TILE, ty: 3 * TILE, h: 40 });
  for (const [dx, dy, v] of [[-14, 2, 0], [-6, 8, 1], [4, 6, 2], [-10, -4, 1], [10, 9, 0]]) prop('blanket', lawn.cx + dx, lawn.cy + dy, 0, { v });
  for (const [dx, dy] of [[-22, -6], [-23, 7], [20, 10]]) prop('picnic', lawn.cx + dx, lawn.cy + dy, 0);
  // --- the duck pond in the west: the water, its lilies, the ducks and a swan, benches looking on to it
  const P = { cx: 3021, cy: 1868, rx: 14, ry: 8 };
  for (let ty = P.cy - P.ry; ty <= P.cy + P.ry; ty++) for (let tx = P.cx - P.rx; tx <= P.cx + P.rx; tx++) {
    const q = ((tx + 0.5 - P.cx) / P.rx) ** 2 + ((ty + 0.5 - P.cy) / P.ry) ** 2;
    if (q <= 1 && tileAt(tx, ty) === T.GRASS) K.paint(tx, ty, 1, 1, q < 0.4 ? T.DEEP : T.WATER);
  }
  path(oval(P.cx, P.cy, P.rx + 3, P.ry + 3, 48).filter(([, py]) => py < P.cy + 2), 2);
  for (const [dx, dy, v] of [[-6, -2, 0], [5, 2, 1], [8, -3, 2]]) prop('lily', P.cx + dx, P.cy + dy, 0, { v });
  for (const [dx, dy, a] of [[-2, 1, 0.6], [1, -1, 2.2], [3, 2, 4]]) prop('duck', P.cx + dx, P.cy + dy, 0, { a });
  prop('swan', P.cx - 8, P.cy + 1, 0, { a: 1.2 });
  for (const dx of [-9, -2, 6]) prop('bench_m', P.cx + dx, P.cy - P.ry - 4.6, 0);
  // --- the dog run in the north-west corner: chain-link round a patch of dirt, its gate, a bench and a bin, its sign
  const DR = [x + 3, y + 3, 20, 15];
  K.paint(DR[0], DR[1], DR[2], DR[3], T.DIRT);
  prop('chainfence', DR[0] + 0.1, DR[1] + 0.1, 0, { tx: DR[2] * TILE - 6, ty: 0 });
  prop('chainfence', DR[0] + 0.1, DR[1] + 0.1, 0, { tx: 0, ty: DR[3] * TILE - 6 });
  prop('chainfence', DR[0] + DR[2] - 0.1, DR[1] + 0.1, 0, { tx: 0, ty: DR[3] * TILE - 6 });
  prop('chainfence', DR[0] + 0.1, DR[1] + DR[3] - 0.1, 0, { tx: (DR[2] - 4) * TILE, ty: 0 });
  prop('bench_m', DR[0] + 4, DR[1] + 2, 0); prop('trashcan', DR[0] + DR[2] - 2, DR[1] + DR[3] - 1.4, 0); prop('post', DR[0] + 10, DR[1] + 8, 0, { h: 30 });
  prop('textsign', DR[0] + DR[2] - 2, DR[1] + DR[3] + 1.2, 0, { text: 'DOG RUN', bg: '#5a3a2a', fg: [250, 232, 190], z: 24, sx: 1 });
  // --- Commons Courts in the north-east corner: two courts side by side behind chain-link, the bleachers between
  commonsCourts(K, 3134, y + 2, X1 - 3134 - 2, 22, out);
  // --- the statue at the south gate, the railings round the park with its gates, lamps and benches along the paths
  prop('statue', LX, Y1 - 5, 14);
  prop('flowers_big', LX - 3, Y1 - 4, 0); prop('flowers_big', LX + 3, Y1 - 4, 0);
  const rail = (ax, ay, bx, by) => prop('fenceline', ax, ay, 0, { kind: 'iron', tx: Math.round((bx - ax) * TILE), ty: Math.round((by - ay) * TILE) });
  rail(x + 0.2, y + 0.25, LX - 3, y + 0.25); rail(LX + 3, y + 0.25, lawn.cx - 10, y + 0.25); rail(lawn.cx + 10, y + 0.25, 3133, y + 0.25);
  rail(x + 0.2, y + 0.25, x + 0.2, 1846); rail(x + 0.2, 1851, x + 0.2, Y1 + 0.75);
  rail(x + 0.2, Y1 + 0.75, LX - 3, Y1 + 0.75); rail(LX + 3, Y1 + 0.75, UQ[0] - 0.5, Y1 + 0.75);
  rail(X1 - 0.2, y + 24, X1 - 0.2, 1837); rail(X1 - 0.2, 1842, X1 - 0.2, UQ[1] - 0.5);
  for (const [gx, gy] of [[LX - 3.6, y + 1], [LX + 3.6, y + 1], [x + 1, 1845.5], [LX - 3.6, Y1 - 0.2]]) prop('parksign', gx, gy, 0);
  prop('textsign', LX - 7, y + 1.6, 0, { text: 'MIDTOWN COMMONS', bg: '#2f5a4a', fg: [240, 232, 200], z: 32, sx: 1 });
  let k = 0;
  for (let ty = y + 1; ty <= Y1; ty += 2) for (let tx = x + 1; tx < X1 - 1; tx += 2) {
    if (tileAt(tx, ty) !== T.PLAZA || tx >= UQ[0] - 1 || (Math.abs(tx - F[0]) < 10 && Math.abs(ty - F[1]) < 9)) continue;
    // (a lamp or a bench by the path every so often, on the grass at its edge)
    const r = rnd(tx, ty, 910);
    if (r > 0.1) continue;
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      if (tileAt(tx + dx, ty + dy) !== T.GRASS || tileAt(tx + dx * 1.5, ty + dy * 1.5) !== T.GRASS) continue;
      prop(k++ % 3 ? 'bench_m' : 'lamp', tx + dx + 0.5, ty + dy + 0.5, 0);
      break;
    }
  }
  // --- the trees: groves on the grass away from the paths, the water and the Great Lawn (oaks and maples in the west,
  // plane trees by the walk, cherries by the pond, a magnolia or two by the fountain)
  const clear = (tx, ty, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (tileAt(tx + dx, ty + dy) !== T.GRASS) return false; return true; };
  for (let ty = y + 2; ty < Y1 - 1; ty += 4) for (let tx = x + 2; tx < X1 - 2; tx += 4) {
    const jx = tx + Math.floor(rnd(tx, ty, 920) * 3), jy = ty + Math.floor(rnd(tx, ty, 921) * 3);
    if (rnd(tx, ty, 922) < 0.5 || !clear(jx, jy, 1)) continue;
    if (jx >= UQ[0] - 1 && jy >= UQ[1] - 1) continue;   // (Union Square has its own plane trees)
    if (((jx + 0.5 - lawn.cx) / (lawn.rx - 2)) ** 2 + ((jy + 0.5 - lawn.cy) / (lawn.ry - 2)) ** 2 < 1) continue;   // (the Great Lawn kept open)
    if (jx >= DR[0] - 1 && jx < DR[0] + DR[2] + 1 && jy >= DR[1] - 1 && jy < DR[1] + DR[3] + 1) continue;
    const nearPond = Math.hypot((jx - P.cx) / (P.rx + 8), (jy - P.cy) / (P.ry + 8)) < 1, nearWalk = Math.abs(jx - LX) < 6;
    const sp = nearPond ? pick(['cherry', 'willow', 'cherry'], rnd(jx, jy, 923)) : nearWalk ? 'streetPl' : jx < 3070 ? pick(['oak', 'maple', 'oak', 'mapleAutumn'], rnd(jx, jy, 924)) : pick(['maple', 'streetPl', 'oak', 'magnolia'], rnd(jx, jy, 925));
    prop(rnd(jx, jy, 926) < 0.5 ? 'tree_a' : 'tree_b', jx + 0.5, jy + 0.5, 12, { sp, k: 1.1 + rnd(jx, jy, 927) * 0.35 });
    if (rnd(jx, jy, 928) < 0.12) prop(pick(['shrub_a', 'bush_c', 'flowers_a'], rnd(jx, jy, 929)), jx + 2, jy + 1.5, 0);
  }
  (out.places ||= []).push({ name: 'Midtown Commons', x0: x, y0: y, x1: X1, y1: Y1 }, { name: 'Commons Pond', x0: P.cx - P.rx, y0: P.cy - P.ry - 5, x1: P.cx + P.rx, y1: P.cy - P.ry }, { name: 'The Great Lawn', x0: lawn.cx - 8, y0: lawn.cy - 4, x1: lawn.cx + 8, y1: lawn.cy + 4 });
}
// Commons Courts: two courts side by side on asphalt, each its hoop at the north end, chain-link round them with the
// gate on the path, the bleachers between them, lamps on the corners, a bench and a bin by the gate
function commonsCourts(K, x, y, w, h, out) {
  const { prop } = K;
  K.paint(x, y, w, h, T.LOT);
  const cw = Math.floor((w - 6) / 2);
  for (const k of [0, 1]) {
    const mx = x + 1 + cw / 2 + k * (cw + 4);
    prop('court', mx, y + 0.6, 0, { w: cw * TILE, d: (h - 4) * TILE, c1: k ? '#4a6a8a' : '#3a6a5a', c2: '#c86a3a' });
    prop('hoop', mx, y + 1.2, 6);
    (K.m.courtSpots ||= []).push({ x: Math.round(mx * TILE), y: Math.round((y + h / 2) * TILE), w: cw, h: h - 4, name: 'Commons Courts' });
  }
  prop('bleachers', x + 1 + cw + 2, y + h / 2, 10, { len: 64, rows: 3 });
  prop('chainfence', x + 0.1, y + 0.1, 0, { tx: w * TILE - 6, ty: 0 });
  prop('chainfence', x + 0.1, y + 0.1, 0, { tx: 0, ty: h * TILE - 6 });
  prop('chainfence', x + w - 0.1, y + 0.1, 0, { tx: 0, ty: h * TILE - 6 });
  prop('chainfence', x + 0.1, y + h - 0.1, 0, { tx: (w - 5) * TILE, ty: 0 });
  for (const [lx, ly] of [[x + 0.8, y + 0.8], [x + w - 0.8, y + 0.8], [x + 0.8, y + h - 1], [x + w - 0.8, y + h - 1]]) prop('lamp', lx, ly, 0);
  prop('bench_m', x + w - 3, y + h + 1.2, 0); prop('trashcan', x + w - 5.5, y + h + 1.2, 0);
  (out.places ||= []).push({ name: 'Commons Courts', x0: x, y0: y, x1: x + w, y1: y + h });
}

// Madison Court (the owner's 10-17 ask for apartment complexes): three four-storey blocks of flats in a row along Harbor
// Avenue, set back behind their lawns - a path to each door, trees, the name board, lamps, benches; the residents' car
// park behind them off Pier Street, passages between the blocks with the bikes and the bins
function madisonCourt(K, x, y, w, h, ctx) {
  const { prop, rnd, pick } = K;
  const { walkup, out } = ctx;
  const back = 7, depth = 14, gap = 6, n = 3, bw = Math.floor((w - (n - 1) * gap) / n), fy = y + back + depth;
  // the car park behind (Pier Street's south side): a row of bays facing north, chain-link with the gate on the pavement
  K.paint(x, y, w, back, T.LOT); K.take(x, y, w, back);
  for (let sx = x + 2; sx + 3 <= x + w - 6; sx += 3) { K.m.stalls.push({ x: sx * TILE, y: (y + 2) * TILE, w: 3 * TILE, h: 4 * TILE }); K.m.parking.push({ x: (sx + 1.5) * TILE, y: (y + 4) * TILE, a: -Math.PI / 2 }); }
  prop('chainfence', x + 0.2, y + 0.3, 0, { tx: (w - 8) * TILE, ty: 0 }); prop('ygate', x + w - 4, y + 0.8, 0, { a: 0 });
  for (let k = 0; k < n; k++) {
    const bx = x + k * (bw + gap);
    const L = walkup(bx, fy - 1, bw, { face: { style: 'stucco', wallColor: pick(['#d6d0c4', '#cfc6b4', '#d8d2c6'], rnd(bx, y, 950)) }, floors: 4, home: { price: 17500 }, garden: false });
    Object.assign(L.art.spec, { win: 'triple', cornice: null, fireEscape: null, balconies: true, parapet: 8, grime: 0.06, roofMat: 'membrane' });
    const b = K.building({ x: bx, y: y + back, w: bw, h: depth, ...L, name: `Madison Court ${'ABC'[k]}` });
    // the lawn in front: the path from its door to the pavement, a tree either side, a bench
    K.fill(bx, fy, bw, y + h - fy, T.GRASS);
    const dx = b && b.door ? b.door.tx : bx + (bw >> 1);
    K.paint(dx - 1, fy, 3, y + h - fy, T.PLAZA);
    for (const tx of [bx + 3, bx + bw - 3]) prop('tree_a', tx + 0.5, fy + 5, 10, { sp: pick(['maple', 'streetPl', 'flowerTree'], rnd(tx, fy, 951)), k: 1.1 });
    prop('bench_m', dx + 4, fy + 2, 0); prop('lamp', dx - 2, y + h - 1.5, 0); prop('flowers_a', dx + 3, y + h - 2, 0);
    if (k < n - 1) {
      // the passage to the car park: paving, the bikes, the bins
      const px = bx + bw;
      K.paint(px, y + back, gap, y + h - y - back, T.PLAZA);
      prop('bikerack', px + gap / 2, fy - 3, 0); prop('dump_g', px + gap / 2, y + back + 2, 12);
    }
  }
  prop('hedgerun', x + 0.5, y + h - 0.4, 0, { tx: Math.round((w - 1) * TILE), ty: 0, h: 14 });
  prop('textsign', x + bw + gap / 2, y + h - 1.4, 0, { text: 'MADISON COURT', bg: '#33485e', fg: [240, 236, 220], z: 26, sx: 1 });
  (out.places ||= []).push({ name: 'Madison Court Apartments', x0: x, y0: y, x1: x + w, y1: y + h });
}

// The main streets' furniture: street trees in grates every few lots, benches by the shops, bus shelters on the boulevard
// and Main Avenue (R1-I's), the hot-dog cart at the hero corner, the iron fence and planted strip by R1-I's bus stop
function streetDressing(K, out, poi0) {
  const { m, prop, rnd, pick } = K;
  const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
  const taken = new Set(), key = (x, y) => Math.floor(x) * 4096 + Math.floor(y);
  const free = (x, y) => onWalk(x, y) && !taken.has(key(x, y)) && !onSubwayPlaza(m, x, y, 1);
  const put = (t, x, y, solid = 0, extra = null) => { if (!free(x, y)) return false; taken.add(key(x, y)); prop(t, x, y, solid, extra); return true; };
  const doors = new Set();
  // the shop fronts: a cafe's or a diner's tables out under umbrellas, a florist's buckets, a grocer's crates and news
  // box, planters either side of a door, a bike rack
  for (let i = poi0; i < m.pois.length; i++) {
    const p = m.pois[i], b = p.b !== undefined ? m.buildings[p.b] : null;
    if (!b || !b.hand || b.back) continue;
    const dx = p.x / TILE, fy = b.ty + b.th, sh = b.art && b.art.shop;
    doors.add(Math.floor(dx));
    if (!sh || p.kind === 'home') continue;
    const r = (k) => rnd(Math.floor(dx), fy, 400 + k), st = sh.kind;
    // (what each trade puts out on the pavement - the owner, 10-17: busier pavements, the shops' own stock outside)
    const inLot = (sx) => dx + sx > b.tx + 0.6 && dx + sx < b.tx + b.tw - 0.6, nm = p.label || '';
    if (st === 'cafe' || st === 'diner') {
      for (const sx of [-2.2, 2.2]) if (r(sx > 0 ? 1 : 2) < 0.75 && inLot(sx) && put('cafetable', dx + sx, fy + 1.3)) prop(pick(['umbrella_y', 'umbrella_b', 'umbrella_r', 'umbrella_g'], r(3)), dx + sx, fy + 1.2, 0);
      if (r(12) < 0.7) put('chalkboard', dx + (r(13) < 0.5 ? -1.2 : 1.2), fy + 0.6);
    } else if (st === 'florist') for (const sx of [-1.6, -2.6, 1.6, 2.6]) { if (inLot(sx)) put(pick(['flowers_big', 'potted', 'flowers_a', 'planter_fl'], r(sx + 5)), dx + sx, fy + 0.8); }
    else if (p.kind === 'grocery' || p.kind === 'convenience' || /Produce|Grocer|Deli|Bodega/.test(nm)) { put('fruitcrate', dx + 1.8, fy + 0.8); put('fruitcrate', dx + 2.7, fy + 0.8); if (inLot(-2.6)) put('fruitcrate', dx - 2.6, fy + 0.8); if (r(6) < 0.6) put('news_a', dx - 1.6, fy + 0.9); if (r(14) < 0.5) put('vend_cola', dx - 3.4, fy + 0.6, 8); }
    else if (st === 'books' || st === 'records' || /Books|Comics|Records|Music/.test(nm)) { put('crates', dx + 1.8, fy + 0.8); if (inLot(2.9)) put('crates', dx + 2.9, fy + 0.8); put('chalkboard', dx - 1.3, fy + 0.6); }
    else if (/Hardware|Lighting|Bike/.test(nm)) { put('ladder', dx + 1.9, fy + 0.6); put('wheelbarrow', dx + 3, fy + 0.9); if (inLot(-2)) put('planks', dx - 2, fy + 0.8); }
    else if (st === 'bar') { put('chalkboard', dx + 1.3, fy + 0.6); if (r(15) < 0.5) put('bench_m', dx - 2.6, fy + 0.8); }
    else if (st === 'salon' || st === 'clothes') { put('chalkboard', dx + 1.3, fy + 0.6); const t = pick(['planter_fl', 'potted'], r(16)); if (inLot(-1.3)) put(t, dx - 1.3, fy + 0.7); }
    else if (st === 'laundry') { put('bench_m', dx + 2.4, fy + 0.8); put('trashcan', dx - 1.4, fy + 0.7); }
    else if (r(7) < 0.45) { const t = pick(['planter_fl', 'potted', 'planter_sq'], r(8)); put(t, dx - 1.3, fy + 0.7); put(t, dx + 1.3, fy + 0.7); }
    else if (r(9) < 0.25) put('bikerack', dx + 2.5, fy + 1);
  }
  // the building under scaffolding: the skip at the kerb, cones round it, a board against the scaffold
  for (const b of m.buildings) {
    if (!b || !b.hand || b.back || !b.art || !b.art.spec || !b.art.spec.scaffold) continue;
    const fy = b.ty + b.th, cx = b.tx + b.tw / 2;
    put('dump_o', cx + 1, fy + 2.1, 16); put('cone', cx - 1.4, fy + 2.6); put('cone', cx + 3.4, fy + 2.6); put('planks', cx - 2.6, fy + 0.8);
  }
  // the corners: where two of the plan's streets cross, a hydrant at one corner, news boxes at another on the main
  // streets, a bin or two, a mailbox now and then
  const S = MIDTOWN.streets().filter((q) => q.kind !== 'alley' && q.pts.length === 2 && (q.pts[0][0] === q.pts[1][0] || q.pts[0][1] === q.pts[1][1])), EW = S.filter((q) => q.pts[0][1] === q.pts[1][1]), NS = S.filter((q) => q.pts[0][0] === q.pts[1][0]);
  for (const a of EW) for (const b of NS) {
    const y = a.pts[0][1], x = b.pts[0][0];
    if (x < Math.min(a.pts[0][0], a.pts[1][0]) || x > Math.max(a.pts[0][0], a.pts[1][0]) || y < Math.min(b.pts[0][1], b.pts[1][1]) || y > Math.max(b.pts[0][1], b.pts[1][1])) continue;
    const ex = b.ext - 1.4, ey = a.ext - 1.4, r = (k) => rnd(x, y, 500 + k), c0 = Math.floor(r(0) * 4);
    for (let c = 0; c < 4; c++) {
      const sx = c & 1 ? 1 : -1, sy = c & 2 ? 1 : -1, cx = x + sx * ex, cy = y + sy * ey, k = (c - c0 + 4) % 4;
      if (k === 0) put('hydrant', cx + sx * 2.4, cy, 6);
      else if (k === 1 && a.kind !== 'st' && r(1) < 0.7) { put('news_a', cx, cy + sy * 2.4); put(pick(['news_b', 'news_c'], r(2)), cx, cy + sy * 3.2); }
      else if (k === 2) put('trashcan', cx + sx * 0.4, cy + sy * 1.8);
      else if (r(3 + c) < 0.35) put(r(8) < 0.7 ? 'mailbox' : 'trashcan', cx + sx * 1.8, cy + sy * 0.4);
      else if (r(20 + c) < 0.3) put(r(24) < 0.5 ? 'phonebox' : 'newsBox', cx + sx * 2.2, cy + sy * 1.2, 6);
    }
  }
  // the kerbside parking along the streets (their parking lanes): a bay every 150 px, clear of the junctions and their
  // crossings, cars in most of them (server/systems/traffic.js parks them - spots with kerb: true); on a one-way street
  // every car faces the way it runs
  const C = (v) => (v + 0.5) * TILE;
  for (const a of S) {
    if (a.kind !== 'st' || !a.park) continue;
    const [[ax, ay], [bx, by]] = a.pts, horiz = ay === by, lo = horiz ? Math.min(ax, bx) : Math.min(ay, by), hi = horiz ? Math.max(ax, bx) : Math.max(ay, by);
    const off = (a.w * TILE) / 2 - a.park / 2, run = Math.atan2(by - ay, bx - ax);
    const cross = (horiz ? NS : EW).filter((q) => { const c = horiz ? q.pts[0][0] : q.pts[0][1], r0 = horiz ? Math.min(q.pts[0][1], q.pts[1][1]) : Math.min(q.pts[0][0], q.pts[1][0]), r1 = horiz ? Math.max(q.pts[0][1], q.pts[1][1]) : Math.max(q.pts[0][0], q.pts[1][0]), me = horiz ? ay : ax; return c >= lo && c <= hi && me >= r0 - 1 && me <= r1 + 1; }).map((q) => [horiz ? q.pts[0][0] : q.pts[0][1], q.ext]);
    cross.push([lo, 7], [hi, 7]);
    // (Crosstown Way crosses a street at an angle: its crossing kept clear too)
    if (horiz && ay > DIAG[0][1] && ay < DIAG[1][1]) cross.push([DIAG[0][0] + (ay - DIAG[0][1]) * (DIAG[1][0] - DIAG[0][0]) / (DIAG[1][1] - DIAG[0][1]), 12]);
    for (let t = C(lo) + 40; t < C(hi) - 40; t += 150) {
      const tt = t / TILE - 0.5;
      if (cross.some(([c, e]) => Math.abs(tt - c) < e + 5)) continue;
      for (const sd of [-1, 1]) {
        const x = horiz ? t : C(ax) + sd * off, y = horiz ? C(ay) + sd * off : t;
        if (onSubwayPlaza(m, x / TILE, y / TILE, 2)) continue;
        // (right-hand traffic: the south kerb's cars face east, the north's west; the west kerb's south, the east's north)
        const ang = a.oneway ? run : horiz ? (sd > 0 ? 0 : Math.PI) : (sd > 0 ? -1.5707 : 1.5707);
        m.parking.push({ x: Math.round(x), y: Math.round(y), a: ang, kerb: true });
      }
    }
  }
  // the loading bays: the kerb bay in front of a grocer, a corner store, the market hall and the department store has
  // its delivery van in it (traffic.js: sp.model), one each
  const shops = [];
  for (let i = poi0; i < m.pois.length; i++) { const p = m.pois[i]; if (p.kind === 'grocery' || p.kind === 'convenience' || p.label === 'Pier Street Market' || p.label === 'Marlow & Finch') shops.push(p); }
  const kerbs = m.parking.filter((q) => q.kerb);
  for (const p of shops) {
    let best = null, bd = 6 * TILE;
    for (const q of kerbs) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd && !q.model) { bd = d; best = q; } }
    if (best) best.model = /Market|Marlow/.test(p.label) ? 'boxtruck' : 'van';
  }
  // the road crew at a hole in Holly Street's pavement (activities.js 'roadcrew'): its cones, the broken paving, the
  // boards; their van in the nearest bay
  {
    const cx = 3150, cy = MY.holly + EXT.st - 1;
    for (const [dx, dy] of [[-1.1, -1.3], [1.1, -1.3], [-1.1, 1.5], [1.1, 1.5], [0, -1.7]]) prop('cone', cx + dx, cy + dy, 0);
    prop('rubble', cx, cy, 0); prop('planks', cx + 0.3, cy + 2.6, 0);
    (m.crewSpots ||= []).push({ x: Math.round((cx + 0.5) * TILE), y: Math.round((cy + 0.5) * TILE), name: 'Holly Street' });
    let best = null, bd = 1e9;
    for (const q of kerbs) { const d = Math.hypot(q.x - (cx + 0.5) * TILE, q.y - (cy + 0.5) * TILE); if (d < bd && !q.model) { bd = d; best = q; } }
    if (best) best.model = 'van';
  }
  // the street trees in their grates along both pavements, clear of the doors and the corners
  const nearCross = (x, y, dir) => (dir ? EW : NS).some((q) => Math.abs((dir ? q.pts[0][1] : q.pts[0][0]) - (dir ? y : x)) < q.ext + 3 && (dir ? x >= Math.min(q.pts[0][0], q.pts[1][0]) - 1 && x <= Math.max(q.pts[0][0], q.pts[1][0]) + 1 : y >= Math.min(q.pts[0][1], q.pts[1][1]) - 1 && y <= Math.max(q.pts[0][1], q.pts[1][1]) + 1));
  const SP = { 'Holly Street': 'street', 'Central Avenue': 'maple', 'Midtown Boulevard': 'streetPl', 'Pier Street': 'street', 'Trestle Street': null, 'Holly Mews': null, 'Holly Place': null };
  for (const a of EW) {
    const sp = SP[a.name] === undefined ? 'street' : SP[a.name], y = a.pts[0][1];
    if (!sp) continue;
    for (const sy of [-1, 1]) for (let x = Math.min(a.pts[0][0], a.pts[1][0]) + 4; x < Math.max(a.pts[0][0], a.pts[1][0]) - 4; x += 7 + Math.floor(rnd(x, y + sy, 520) * 4)) {
      const yy = y + sy * (a.ext - 1);
      if (nearCross(x, yy, false) || doors.has(Math.floor(x)) || doors.has(Math.floor(x) + 1)) continue;
      put('tree_a', x + 0.5, yy, 10, { sp, k: 1.15, grate: true });
    }
  }
  for (const b of NS) {
    if (b.kind !== 'ave') continue;
    const x = b.pts[0][0];
    for (const sx of [-1, 1]) for (let y = Math.min(b.pts[0][1], b.pts[1][1]) + 4; y < Math.max(b.pts[0][1], b.pts[1][1]) - 4; y += 10 + Math.floor(rnd(x + sx, y, 521) * 4)) {
      const xx = x + sx * (b.ext - 1);
      if (!nearCross(xx, y, true)) put('tree_a', xx + 0.5, y + 0.5, 10, { sp: 'street', k: 1.1, grate: true });
    }
  }
  // the boulevard's median: plane trees down it, clear of the junctions (where it stops for the turns)
  for (let x = MX.westside + 12; x < MX.stadium - 10; x += 6) {
    if (NS.some((q) => Math.abs(q.pts[0][0] - x) < q.ext + 5 && Math.max(q.pts[0][1], q.pts[1][1]) >= MY.blvd - 1 && Math.min(q.pts[0][1], q.pts[1][1]) <= MY.blvd + 1)) continue;
    if (Math.abs(x - 3480) < 16) continue;   // (the diagonal's crossing at Harborview Avenue)
    prop('tree_a', x + 0.5, MY.blvd + 0.5, 10, { sp: 'streetPl', k: 1.05 });
  }
  // the bus stops: the boulevard (both ways), Main Avenue at Holly Street (R1-I's, with its planted strip and fence)
  for (const [x, y] of [[3010, MY.blvd - EXT.blvd + 1], [3300, MY.blvd + EXT.blvd - 1], [3560, MY.blvd - EXT.blvd + 1], [MX.main + 6, MY.holly + 9]]) if (onWalk(x, y)) prop('busstop', x, y, 0);
  prop('flowers_a', MX.main + 6, MY.holly + 13, 0); prop('fenceline', MX.main + 4.5, MY.holly + 14.5, 0, { kind: 'iron', tx: 3 * TILE, ty: 0 });
  // the hero corner's life (R1-A): the hot-dog cart, benches, a news box
  prop('foodcart', MX.madison + 10, MY.holly - 5.6, 14);
  prop('bench_m', MX.madison - 10, MY.holly - 6.2, 0); prop('news_b', MX.madison + 6, MY.holly - 6.4, 0); put('hydrant', MX.madison + 8.5, MY.holly - 5.2, 6);
  out.dressed = true;
}
