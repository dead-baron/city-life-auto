// World v3, handcrafted: the Arts District (district 46), west of downtown on the Gulf Island, from the owner's concepts
// WC239 (the arts warehouse quarter: sawtooth-roofed brick lofts with murals, a chimney and water towers, a theatre, the
// street-food market reached by passages between the buildings, galleries under string lights, a wharf with finger
// piers and sailboats, an old rail spur made a green walk), WC070 (brick blocks under the elevated road: the museum with
// its banners and two sculptures on its forecourt, a records shop, the theatre, a noodle bar, a cafe terrace, a columned
// bank, a boutique, loft studios with big arched windows, murals on blank walls), WC110 (the botanical garden: the
// glasshouses, parterres, a hedge maze, the koi pond, a gazebo, the cafe, its gate), WC292 (the skate plaza), WC315
// (the community garden, the bakery on the corner) and the research's courtyard of artist lofts, records and bookshop
// corner and the bathhouse:
//   - north of the Westport Bridge: the Wharf - Wharf Street to its end, the gallery, the seafood bar and the bait shop
//     on the quay, finger piers with the boats;
//   - between the bridge and Greenfield Avenue: Foundry Street through the Brickworks (the warehouse lofts, the Boiler
//     House, Gallery Nine), the shops on Greenfield Avenue with Second Spin Records and Dog-Ear Books on the corner of
//     Gallery Avenue;
//   - Greenfield Avenue to Canvas Street: Canvas Market by the water (its eateries round the stalls), Museum Square (the
//     Metro Museum of Art and the Playhouse, the forecourt's sculptures and banners, the reflecting pool, the subway's
//     stairs), the gallery row, the bank and the loft studios under the Gulf Loop;
//   - Canvas Street to Fountain Avenue: the community garden and the bathhouse by the water, Studio Court (lofts round
//     their court), Gallery Lane (the cobbled lane of galleries), the Underpass (the skate plaza under the Loop);
//   - south of Fountain Avenue: the Glasshouse Gardens by the water, the Spur Line (the old freight spur, a green walk
//     with its boxcar cafe), the rows on Mosaic Street and Bayside Avenue, Bridge Street on to the Sunset Bridge.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2), so
// reworking one block moves nothing else. The frame: shared/world3-hand.js; the galleries' windows, the warehouses'
// sawtooth roofs: client/art2/buildings.js (shop.kind 'gallery', spec.pitch 'saw'); the Playhouse's masks and the
// galleries' palette: client/art2/neonsigns.js.
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 46;   // the Arts District's id (shared/mapcore.js DISTRICTS)
// the street lines (tiles): the city's avenues round it - Greenfield Avenue, Gallery Avenue north of it, Westside
// Avenue, Bayside Avenue - the Westport Bridge's last stretch on land, and its own
export const AY = { wharf: 2300, bridge: 2321, foundry: 2362, green: 2400, canvas: 2494, lane: 2531, fountain: 2576, mosaic: 2652, bayside: 2730 };
export const AX = { wharfEnd: 2514, foundryEnd: 2346, canvasEnd: 2342, fountainEnd: 2404, easel: 2462, kiln: 2490, gallery: 2560, spur: 2616, bridge: 2681, studio: 2790, westside: 2860 };
export const SUNSET = [2681, 2687];   // the Sunset Bridge's north end (shared/world3-skeleton.js ARTERIALS): Bridge Street meets it
// (how far a street's pavement reaches from its centre line, tiles: the Arts District's pavements are three tiles -
// shared/roads.js SIDEWALK commercial)
const EXT = { st: 6, ave: 7, alley: 1 };
const nOf = (y, k) => y - EXT[k] - 1, sOf = (y, k) => y + EXT[k] + 1, wOf = (x, k) => x - EXT[k] - 1, eOf = (x, k) => x + EXT[k] + 1;

function streets() {
  return [
    { name: 'Wharf Street', kind: 'st', culdesac: true, pts: [[AX.gallery, AY.wharf], [AX.wharfEnd, AY.wharf]] },   // (Gallery Avenue's north end: Crosstown Avenue's line)
    { name: 'Kiln Street', kind: 'st', pts: [[AX.kiln, AY.bridge], [AX.kiln, AY.green]] },
    { name: 'Foundry Street', kind: 'st', culdesac: true, pts: [[AX.gallery, AY.foundry], [AX.foundryEnd, AY.foundry]] },
    { name: 'Gallery Avenue', kind: 'ave', pts: [[AX.gallery, AY.green], [AX.gallery, AY.bayside]] },
    { name: 'Easel Street', kind: 'st', pts: [[AX.easel, AY.green], [AX.easel, AY.fountain]] },
    { name: 'Bridge Street', kind: 'st', pts: [[AX.bridge, AY.green], SUNSET] },   // (the Pink Mile's Bridge Street carried on from the Arts Bridge to the Sunset Bridge)
    { name: 'Studio Street', kind: 'st', pts: [[AX.studio, AY.green], [AX.studio, AY.bayside]] },
    { name: 'Canvas Street', kind: 'st', culdesac: true, pts: [[AX.westside, AY.canvas], [AX.canvasEnd, AY.canvas]] },
    { name: 'Fountain Avenue', kind: 'ave', pts: [[AX.westside, AY.fountain], [AX.fountainEnd, AY.fountain]] },   // (Downtown's carried on west to the water bus pier)
    { name: 'Mosaic Street', kind: 'st', pts: [[AX.gallery, AY.mosaic], [AX.westside, AY.mosaic]] },
  ];
}

export const ARTS = {
  key: 'arts', d: D, rects: [[2300, 2240, 2560, 2400], [2300, 2400, 2860, 2730]], rect: [2300, 2240, 2860, 2730],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Arts District: placeSpecials leaves them)
  specials: ['Metro Museum of Art', 'The Playhouse', 'Gallery Nine', 'Easel Cafe', 'Second Spin Records'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The looks: old red and brown brick, the warehouses' darker brick, painted brick in bold colours, a little stone
const BRICK = ['#a85a42', '#8e4a3a', '#b8705a', '#7a4a3a', '#9a5040', '#b06048'];
const LOFT = ['#7a3a2e', '#6e3428', '#8a4a36', '#5e3a30', '#7e4632'];
const PAINT = ['#2e6a8a', '#c8503a', '#e0b040', '#3a8a6a', '#8a3a6a', '#e8e0cc', '#2a3a5a', '#d87a5a', '#5a7a3a', '#f0d8b0', '#6a4a8a', '#e88a70'];
const STONE = ['#ddd2bc', '#d4c8b0', '#c8bca4', '#e2dac6'];
const AWNINGS = [['#2f7a5c', '#f0ece4'], ['#a8343a', '#f0ece4'], ['#2a3e7a', '#e8e4dc'], ['#c8503a', '#f0ece4'], ['#e0b040', '#f0ece4'], ['#2f6a4e', '#2f6a4e'],
  ['#3a3a44', '#e8e4dc'], ['#6a3a8a', '#f0ece4'], ['#2e6a8a', '#f0ece4'], ['#1e2a3a', '#1e2a3a'], ['#8a5a2a', '#efe6d0'], ['#c84a6a', '#f0ece4']];
const SIGNS = [['#2a2c38', [236, 206, 120]], ['#e8e0cc', [180, 40, 46]], ['#1e3a5e', [240, 236, 220]], ['#f0ece4', [40, 110, 80]], ['#2f6a4e', [240, 232, 200]],
  ['#8a2a2e', [250, 230, 190]], ['#232838', [236, 214, 150]], ['#e8c040', [40, 40, 50]], ['#f4f0e8', [40, 60, 120]], ['#101014', [240, 240, 236]], ['#f4f0e8', [20, 20, 24]]];
const MURALS = ['sunset', 'waves', 'flowers', 'geo', 'tiger', 'skyline', 'koi'];
const weighted = (L, r) => { let v = r * L.reduce((a, q) => a + q[0], 0); for (const q of L) { v -= q[0]; if (v <= 0) return q[1]; } return L[0][1]; };

// the district's businesses (invented names, never the same twice): [name, storefront kind]
const NAMES = {
  gallery: ['Kiln Gallery', 'Ochre & Ash', 'Blue Hour Gallery', 'Salt Print Studio', 'The Annex', 'Gesso Gallery', 'Vermilion', 'Studio Ten', 'Paper Moon Prints', 'Lumen Photo Gallery',
    'The Clay Room', 'Glassworks Guild', 'Atelier Noor', 'Linocut Press', 'Halftone Gallery', 'Fresco House', 'Cobalt Gallery', 'Gallery Mezzanine', 'Umber & Co.', 'The Long Room',
    'Tidewater Studios', 'Pier Nine Gallery', 'Copperplate', 'The Loom Room', 'North Light Gallery'].map((n) => [n, 'gallery']),
  cafe: [['Turpentine Coffee', 'cafe'], ['The Sketchbook', 'cafe'], ['Charcoal Coffee', 'cafe'], ['Golden Hour Bakery', 'cafe'], ['Crema Studio', 'cafe'], ['Matcha Atelier', 'cafe'], ['Bluebird Bagels', 'cafe'], ['Gouache Gelato', 'cafe']],
  food: [['Kanji Noodle Bar', 'diner'], ['Palette Pizza', 'diner'], ['Mural Tacos', 'diner'], ['Sesame Dumplings', 'diner'], ['Little Lisbon', 'diner'], ['The Gilded Fork', 'diner'], ['Banh Mi Brothers', 'diner'],
    ['Ramen Studio', 'diner'], ['Olive & Fig', 'diner'], ['Smoke & Salt', 'diner'], ['Curry Canvas', 'diner'], ['Falafel Frame', 'diner']],
  bar: [['The Inkwell', 'bar'], ['Muse Wine Bar', 'bar'], ['The Drawing Room', 'bar'], ['Absinthe & Oak', 'bar'], ['The Velvet Easel', 'bar'], ['Bohemia', 'bar'], ['The Last Brushstroke', 'bar'], ['Still Life Bar', 'bar']],
  shop: [['Burnt Sienna Art Supply', 'mart'], ['Frame & Mat', 'mart'], ['Warp & Weft', 'clothes'], ['Prism Print Shop', 'mart'], ['Vintage Vault', 'clothes'], ['Moss & Fern', 'florist'], ['Ink Well Tattoo', 'salon'],
    ['Lens & Shutter', 'mart'], ['Papercut Stationery', 'books'], ['Wax & Wick', 'mart'], ['Loom & Thread', 'clothes'], ['Sole Studio', 'clothes'], ['Bric-a-Brac', 'pawn'], ['Comic Vault', 'books'], ['The Hair Loft', 'salon'], ['Corner Bodega', 'mart']],
};
// the rest (never the same twice in the district): a colour, a bird or a word with the trade
const HEADS = ['Ochre', 'Umber', 'Cobalt', 'Sienna', 'Indigo', 'Saffron', 'Juniper', 'Marlow', 'Vesper', 'Halcyon', 'Bramble', 'Linden', 'Corvid', 'Tamarind', 'Quill', 'Kestrel', 'Magpie',
  'Larkspur', 'Thistle', 'Fennel', 'Wren', 'Clover', 'Ember', 'Cinder', 'Slate', 'Copper', 'Paper', 'Velvet', 'Lantern', 'Pigeon', 'Sparrow', 'Red Fox', 'Moth', 'Heron', 'Teal', 'Rust',
  'Amber', 'Ivory', 'Onyx', 'Easel', 'Canvas', 'Foundry', 'Kiln', 'Mosaic', 'Studio', 'Spur', 'Gallery', 'Muse', 'Sketch', 'Fresco', 'Pastel', 'Vellum', 'Inkpot', 'Graphite', 'Charcoal'];
const TRADES = {
  gallery: ['Gallery', 'Studio', 'Atelier', 'Prints', 'Ceramics', 'Glass', 'Arts', 'Collective', 'Projects', 'Editions', 'Photo', 'Workshop'].map((t) => [t, 'gallery']),
  cafe: ['Coffee', 'Espresso', 'Bakery', 'Tea House', 'Cafe', 'Roasters', 'Creamery', 'Donuts', 'Bagels'].map((t) => [t, 'cafe']),
  food: ['Kitchen', 'Noodles', 'Dumplings', 'Bistro', 'Tacos', 'Pizza', 'Ramen', 'Grill', 'Deli', 'Pho', 'Curry House', 'Banh Mi', 'Falafel', 'Sushi', 'Diner'].map((t) => [t, 'diner']),
  bar: ['Tavern', 'Wine Bar', 'Taproom', 'Lounge', 'Social Club', 'Bar', 'Cocktails'].map((t) => [t, 'bar']),
  shop: [['Books', 'books'], ['Records', 'records'], ['Vintage', 'clothes'], ['Thrift', 'clothes'], ['Florist', 'florist'], ['Frames', 'mart'], ['Print Shop', 'mart'], ['Tattoo', 'salon'],
    ['Barber', 'salon'], ['Bike Shop', 'mart'], ['Pottery', 'mart'], ['Hats', 'clothes'], ['Goods', 'mart'], ['Supply', 'mart'], ['Optical', 'lobby'], ['Plants', 'florist'], ['Comics', 'books'],
    ['Stationery', 'books'], ['Jewelry', 'mart'], ['Leather', 'clothes'], ['Candles', 'mart'], ['Laundromat', 'laundry'], ['Market', 'mart'], ['Tailor', 'clothes'], ['Hair Studio', 'salon']],
};
const BLADES = { gallery: 'ART', cafe: 'CAFE', diner: 'EAT', bar: 'BAR', books: 'BOOKS', records: 'VINYL', clothes: 'VINTAGE', salon: 'HAIR', florist: 'FLOWERS', mart: 'SHOP', pawn: 'ANTIQUES' };

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const out = { homes: 0, shops: 0, galleries: 0, murals: 0 };
  const used = new Set();
  const poi0 = m.pois.length;
  const { place, tower, towerLot } = towerKit(K, out);
  let lastWin = null, ci = 0;
  const tile = (x, y) => m.tiles[y * m.w + x];
  // a business of the category not placed yet: one of the district's named ones while they last (now and then), else a
  // head and a trade composed
  const draw = (cat, x, y, k) => {
    const L = NAMES[cat];
    if (rnd(x, y, k + 1) < 0.45) for (let t = 0; t < 12; t++) { const q = L[Math.floor(rnd(x + t, y, k) * L.length) % L.length]; if (!used.has(q[0])) { used.add(q[0]); return q; } }
    const TT = TRADES[cat];
    for (let t = 0; t < 60; t++) {
      const [trade, store] = TT[Math.floor(rnd(x + t, y, k + 2) * TT.length) % TT.length], head = HEADS[Math.floor(rnd(x, y + t, k + 3) * HEADS.length) % HEADS.length];
      if (head === trade || (cat === 'gallery' && head === 'Gallery')) continue;
      const name = `${head} ${trade}`;
      if (name.length <= 20 && !used.has(name)) { used.add(name); return [name, store]; }
    }
    return null;
  };
  const roofOf = (r, garden) => ({ roofMat: garden ? (r < 0.5 ? 'paver' : 'green') : r < 0.3 ? 'tar' : r < 0.55 ? 'gravel' : r < 0.75 ? 'membrane' : r < 0.9 ? 'rubber' : 'green', lip: 10, rimW: 4 });

  // ---- a front facing south: its walls, its windows, its shop, its sign (painted or neon), a flat or two over it ----
  //   o.look: 'brick' (old red brick), 'loft' (the warehouses' dark brick and steel windows), 'paint' (painted brick), 'stone'
  const front = (x, y, w, o) => {
    const r = (k) => rnd(x, y, 300 + k);
    const look = o.look || weighted([[4, 'brick'], [2, 'paint'], [2, 'loft'], [1, 'stone']], r(0));
    const f = o.face || (look === 'paint' ? { style: 'stucco', wallColor: pick(PAINT, r(1)) } : look === 'stone' ? { style: 'stone', wallColor: pick(STONE, r(1)) } : { style: 'brick', brickTone: pick(look === 'loft' ? LOFT : BRICK, r(1)) });
    const floors = o.floors ?? (look === 'loft' ? 3 + Math.floor(r(2) * 3) : 2 + Math.floor(r(2) * 3));
    let win = o.win || (look === 'loft' ? pick(['loft', 'arch', 'loft'], r(3)) : pick(['even', 'pair', 'arch', 'tall', 'triple', 'bay'], r(3)));
    if (win === lastWin && !o.win) win = win === 'even' ? 'pair' : 'even';
    lastWin = win;
    const spec = { floors, ...f, win, cornice: o.cornice !== undefined ? o.cornice : pick(['bracket', 'dentil', 'step', null], r(4)), parapet: 8 + Math.floor(r(5) * 6), grime: o.grime ?? (look === 'loft' ? 0.25 : 0.1) + r(6) * 0.15, ...roofOf(r(7), o.garden), blades: [], ...(o.spec || {}) };
    if (o.garden) spec.garden = true;
    if (floors >= 4 && w >= 8 && r(8) < 0.35 && !spec.fireEscape) spec.fireEscape = [Math.max(8, Math.round(w * TILE * 0.5) - 25), 50];
    const store = o.store || 'mart';
    const [bg, fg] = o.signC || pick(SIGNS, r(9));
    const shop = o.shop === false ? null : { kind: store, door: o.door || (r(10) < 0.5 ? 'left' : 'right'), open: true, people: o.people ?? 1 + Math.floor(r(11) * 3),
      sign: o.sign === null ? null : { text: (o.sign || o.name).toUpperCase().slice(0, 20), bg, fg, lit: o.lit ?? r(12) < 0.75 },
      awning: o.awning !== undefined ? o.awning : r(13) < 0.55 ? pick(AWNINGS, r(14)) : null };
    const neon = o.neon ? { name: o.neonName === undefined ? o.name : o.neonName, kind: o.neon, col: o.col ?? (ci++ * 3) % 7, ...(o.pic ? { pic: o.pic } : {}), ...(o.blade ? { blade: o.blade } : {}), ...(o.picV ? { picV: o.picV } : {}) } : null;
    if (!neon) spec.plaques = [];
    if (o.blade && !neon) spec.blades = [{ text: o.blade, side: shop && shop.door === 'left' ? 'right' : 'left' }];
    const food = store === 'cafe' || store === 'diner';
    const poi = o.poi !== undefined ? o.poi : food ? { kind: 'coffee', label: o.name, food: store === 'diner' } : store === 'bar' || store === 'gallery' || store === 'lobby' ? { kind: 'delivery', label: o.name } : { kind: 'delivery', label: o.name, walk: true, store };
    const home = o.home !== undefined ? o.home : floors >= 3 && w >= 6 && r(15) < 0.55 ? { kind: 'apartment', price: look === 'loft' ? 22000 : 17000 } : null;
    if (store === 'gallery') out.galleries++;
    return { arch: o.arch || 'mixed', ...(o.key ? { key: o.key } : food ? { key: store === 'cafe' ? 'greenbistro' : 'rest1' } : {}), name: o.name, poi, ...(home ? { home } : {}), whole: true,
      art: { spec, ...(shop ? { shop } : { noShop: true }), ...(neon ? { neon } : {}), ...(o.kit ? { kit: o.kit } : {}) } };
  };
  const placed = (b, o) => { if (b) { if (o.home) out.homes++; if (o.poi) out.shops++; } return b; };
  // a warehouse loft's roof: the sawtooth's teeth (spec.pitch 'saw'), or a flat roof with its water tower and the odd
  // chimney stack
  const loftKit = (w, d, k) => [['tank', Math.round(w * TILE * 0.25), 70], ...(k % 3 === 0 ? [['stack', Math.round(w * TILE * 0.75), 60]] : []), ['vent', Math.round(w * TILE * 0.5), Math.round(d * TILE * 0.6)], ['acs', Math.round(w * TILE * 0.6), 120], ['sky', Math.round(w * TILE * 0.4), Math.round(d * TILE * 0.5)]];

  // ---- a row of fronts facing south along [x0, x1) in the band [y0, y1]: `list` first, then the mix of `cats` ------
  const CATS = [['gallery', 0.3], ['cafe', 0.45], ['food', 0.62], ['bar', 0.74], ['shop', 1]];
  const shopRow = (x0, x1, y0, y1, list = [], o = {}) => {
    let k = 0;
    return K.row(x0, x1, y0, y1, (x, room) => {
      if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const L = k < list.length ? list[k++] : null;
      if (L) {
        if (L.gap) return { gap: Math.min(room, L.gap), kind: L.kind || 'passage' };
        if (L.name) used.add(L.name);
        const w = L.w === 0 ? room : Math.min(room, L.w);
        if (L.lot) return { w, depth: L.depth || o.depth || 16, ...L.lot };
        if (L.mural) return { w, depth: L.depth || 14, ...muralLot(x, y1, w, L.mural, L.floors || 3) };
        return { w, depth: L.depth || o.depth || 16, ...front(x, y1, w, { ...(o.base || {}), ...L }) };
      }
      if (o.only) return room >= 1 ? { gap: room, kind: 'garden' } : null;
      const r = rnd(x, y1, 60);
      if (r < 0.06 && o.passages !== false) return { gap: 3 + Math.floor(rnd(x, y1, 61) * 2), kind: 'passage' };
      const cats = o.cats || CATS, cat = cats.find((c) => rnd(x, y1, 62) < c[1])[0];
      const q = draw(cat, x, y1, 63);
      if (!q) return { gap: Math.min(room, 5), kind: 'garden' };
      const w = room <= 13 ? room : Math.min(room - 5, 7 + Math.floor(rnd(x, y1, 64) * 5));
      const bar = q[1] === 'bar', blade = rnd(x, y1, 65) < 0.5 ? BLADES[q[1]] : null;
      return { w, depth: o.depth || 16, ...front(x, y1, w, { ...(o.base || {}), name: q[0], store: q[1], ...(bar ? { neon: 'bar', blade } : { blade }), ...(q[1] === 'gallery' ? { look: rnd(x, y1, 66) < 0.5 ? 'loft' : 'paint', awning: null, people: 2 } : {}) }) };
    }, o);
  };
  // a row of walk-up lofts along a band's north edge, their doors on the street north of it (drawn from behind: their
  // back walls, fire escapes and yards face the camera); a flat behind each door
  const backRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 5) return room >= 1 ? { gap: room, kind: 'garden' } : null;
    if (rnd(x, y0, 70) < 0.08) return { gap: Math.min(room, 4 + Math.floor(rnd(x, y0, 71) * 3)), kind: 'yard' };
    const w = room <= 14 ? room : Math.min(room - 5, 8 + Math.floor(rnd(x, y0, 72) * 6));
    const L = front(x, y0, w, { name: 'Lofts', shop: false, floors: 3 + Math.floor(rnd(x, y0, 73) * 3), poi: false, home: { kind: 'apartment', price: 18000 }, look: rnd(x, y0, 74) < 0.5 ? 'loft' : 'brick' });
    return { w, depth: o.depth || Math.min(y1 - y0 + 1, 12 + Math.floor(rnd(x, y0, 75) * 3)), ...L, face: 'N' };
  }, { north: true });
  // a blank end wall with a mural on it (WC070, WC239: "big murals on blank walls"): a narrow building with no door
  const muralLot = (x, y, w, kind, floors = 3) => {
    out.murals++;
    return { arch: 'mixed', name: 'Mural Wall', poi: false, door: null, whole: true,
      art: { spec: { floors, style: 'brick', brickTone: pick(BRICK, rnd(x, y, 80)), win: 'even', blank: true, parapet: 8, grime: 0.15, ...roofOf(rnd(x, y, 81)), blades: [], plaques: [], mural: { x: 6, w: w * TILE - 12, h: Math.min(floors * 56 - 20, 160), kind } }, noShop: true, kit: [['ac', Math.round(w * TILE / 2), 60]] } };
  };

  // the bands' edges: the first free row or column either side of each street (tiles)
  const wharfN = nOf(AY.wharf, 'st'), foundryN = nOf(AY.foundry, 'st'), foundryS = sOf(AY.foundry, 'st'), greenN = nOf(AY.green, 'ave'), greenS = sOf(AY.green, 'ave');
  const canvasN = nOf(AY.canvas, 'st'), canvasS = sOf(AY.canvas, 'st'), fountN = nOf(AY.fountain, 'ave'), fountS = sOf(AY.fountain, 'ave'), mosaicN = nOf(AY.mosaic, 'st'), mosaicS = sOf(AY.mosaic, 'st'), bayN = nOf(AY.bayside, 'ave');
  const kilnW = wOf(AX.kiln, 'st'), kilnE = eOf(AX.kiln, 'st'), easelW = wOf(AX.easel, 'st'), easelE = eOf(AX.easel, 'st'), galW = wOf(AX.gallery, 'ave'), galE = eOf(AX.gallery, 'ave');
  const bridgeW = wOf(AX.bridge, 'st'), bridgeE = eOf(AX.bridge, 'st'), studioW = wOf(AX.studio, 'st'), studioE = eOf(AX.studio, 'st'), westW = wOf(AX.westside, 'ave');
  // the water's edge: the first land tile scanning east along a row, or south down a column
  const coastX = (y) => { let x = 2290; while (x < 2500 && !m.land[y * m.w + x]) x++; return x; };
  const shoreY = (x, y0 = 2236) => { let y = y0; while (y < 2320 && !m.land[y * m.w + x]) y++; return y; };

  // ===========================================================================================================
  wharf();
  brickworks();
  canvasMarket();
  museumSquare();
  galleryBlock();
  underTheLoop();
  waterGarden();
  studioCourt();
  galleryLane();
  underpass();
  glasshouseGardens();
  spurLine();
  southRows();
  promenade();
  dressing();
  // what the plan left open: lawn with plane trees, maples, cherries and the odd palm (else the kit's seal paves it)
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.75 ? [rnd(x, y, 830) < 0.5 ? 'tree_a' : 'tree_b', pick(['streetPl', 'maple', 'cherry', 'streetPl', 'magnolia', 'oak'], rnd(x, y, 831)), 1.05 + rnd(x, y, 832) * 0.2] : r < 0.82 ? ['palm_a', 'royal', 1.15] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 833)), null, 1] });
  out.named = used.size;
  return out;

  // ===========================================================================================================
  // The Wharf, north of the Westport Bridge (WC239's wharf): the quay along the water, finger piers out from it with the
  // boats; the gallery, the seafood bar and the bait shop on Wharf Street, their backs to the quay
  function wharf() {
    const x0 = 2490, x1 = galW + 1;
    shopRow(x0, x1, 2236, wharfN, [
      { w: 4, gap: 4, kind: 'garden' },
      { w: 12, name: 'Pier Nine Gallery', store: 'gallery', look: 'loft', floors: 2, awning: null, spec: { pitch: 'saw', tooth: 64 }, kit: [], depth: 24 },
      { w: 10, name: 'The Salt Crane', store: 'diner', look: 'paint', floors: 2, awning: ['#2e6a8a', '#f0ece4'], blade: 'OYSTERS', poi: { kind: 'coffee', label: 'The Salt Crane', food: true }, depth: 16 },
      { w: 8, name: 'Wharf Bait & Tackle', store: 'mart', look: 'paint', floors: 1, awning: ['#2e6a8a', '#f0ece4'], sign: 'BAIT & TACKLE', poi: { kind: 'tackle', label: 'Wharf Bait & Tackle' }, depth: 14 },
      { w: 12, name: 'Tidewater Studios', store: 'gallery', look: 'loft', floors: 3, awning: null, depth: 22, home: { kind: 'apartment', price: 24000 } },
      { w: 0, name: 'Wharfside Cafe', store: 'cafe', look: 'paint', floors: 2, depth: 14 },
    ], { only: true, depth: 16 });
    // the quay's life behind them: the Salt Crane's terrace (tables, umbrellas, lights strung over it), the fish table
    // and its crates, lobster pots, a bench or two looking out
    const qy = (x) => shoreY(x) + 3;
    for (let k = 0; k < 4; k++) { const tx = 2531 + k * 3.4, ty = qy(2533) + 2 + (k % 2) * 2.4; prop('cafetable', tx, ty, 0); prop(k % 2 ? 'umbrella_b' : 'umbrella_r', tx, ty - 0.1, 0); }
    prop('festoon', 2529, qy(2533) + 1, 0, { tx: Math.round(14 * TILE), ty: 0, h: 50 });
    prop('fishtable', 2548, qy(2548) + 2, 8); prop('crates', 2550.5, qy(2550) + 2.4, 10); prop('crates', 2546, qy(2546) + 4, 10);
    for (const bx of [2508, 2518]) prop('bench_m', bx, qy(bx) + 0.6, 0);
    // the quay: paved from the buildings' backs to the water, a rail along its edge, bollards and lamps
    for (let x = x0; x < x1; x++) {
      const s = shoreY(x);
      if (s >= 2300) continue;
      for (let y = s; y < wharfN; y++) if (K.free(x, y)) { K.fill(x, y, 1, 1, T.PLAZA); }
      else if (tile(x, y) === T.PLAZA && m.dist[y * m.w + x] === D && m.bld[y * m.w + x] < 0) K.take(x, y, 1, 1);
      if (x % 3 === 0 && shoreY(x + 3) === s) prop('rail', x, s + 0.2, 0, { tx: 3 * TILE, ty: 0 });
      if (x % 9 === 4) prop('lamp', x + 0.5, s + 1.2, 0);
      if (x % 7 === 2) prop('bollard', x + 0.5, s + 0.6, 5);
    }
    // the finger piers north into the water, their fingers, the boats in the berths (motorboats you can take, sailboats
    // and a yacht moored for the look)
    const isW = (x, y) => { const t = tile(x, y); return t === T.WATER || t === T.DEEP; };
    for (const [n, px] of [2504, 2522, 2540].entries()) {
      const sy = shoreY(px + 1);
      const len = n === 1 ? 16 : 13;
      for (let y = sy - len; y < sy; y++) for (let x = px; x < px + 3; x++) if (isW(x, y)) m.set(x, y, T.DOCK);
      prop('lamp', px + 1.5, sy - len + 1, 0);
      for (let k = 3; k < len - 1; k += 5) for (const sd of [-1, 1]) {
        const fx = sd < 0 ? px - 2 : px + 3, fy = sy - k;
        if (isW(fx, fy) && isW(fx + 1, fy)) { m.set(fx, fy, T.DOCK); m.set(fx + 1, fy, T.DOCK); }
        const bx = sd < 0 ? px - 2.5 : px + 5.5, by = fy - 2.2, r = rnd(px + sd, k, 31);
        if (!isW(Math.floor(bx), Math.floor(by))) continue;
        if (r < 0.4) prop('sailboat', bx, by, 26, { a: -Math.PI / 2, len: 100 + Math.floor(rnd(px, k, 32) * 3) * 12, sail: 0, c: Math.floor(rnd(k, px, 33) * 3) });
        else if (r < 0.52) prop('yacht', bx, by, 26, { a: -Math.PI / 2 });
        else m.marina.push({ x: bx * TILE, y: by * TILE, a: -Math.PI / 2, kind: r < 0.85 ? 'speedboat' : 'dinghy' });
      }
    }
    prop('textsign', 2531, shoreY(2531) + 1.6, 0, { text: 'ARTS WHARF', bg: '#1e3a5e', fg: [240, 236, 220], z: 36, sx: 2 });
    prop('lifering', 2512, shoreY(2512) + 1, 0); prop('lifering', 2549, shoreY(2549) + 1, 0);
    (out.places ||= []).push({ name: 'Arts Wharf', x0, y0: 2236, x1, y1: AY.wharf });
  }

  // ===========================================================================================================
  // The Brickworks (WC239): between the Westport Bridge and Greenfield Avenue, Foundry Street through it. North of it
  // the old warehouses made lofts and galleries - sawtooth roofs, steel windows, the water towers, the Boiler House
  // under its chimney, a mural on the blank end walls; Gallery Nine. South of it the shops on Greenfield Avenue: the
  // records shop and the bookshop on the corner of Gallery Avenue
  function brickworks() {
    const y0 = 2326, wx0 = coastX(foundryN) + 2;
    const warehouse = (name, store, o = {}) => ({ name, store, look: 'loft', floors: o.floors ?? 3, win: 'loft', awning: null, cornice: 'step', spec: { pitch: 'saw', tooth: 64 + (name.length % 3) * 16, ...(o.spec || {}) }, kit: [], depth: o.depth || 24, ...o });
    shopRow(wx0, kilnW + 1, y0, foundryN, [
      { gap: 10, kind: 'garden' },
      { w: 26, ...warehouse('Brickworks Lofts', 'gallery', { sign: 'KILN GALLERY', home: { kind: 'apartment', price: 26000 } }) },
      { w: 6, mural: 'sunset', depth: 18 },
      { gap: 5, kind: 'passage' },
      { w: 22, lot: boilerHouse(), depth: 24 },
      { w: 24, ...warehouse('Ochre & Ash', 'gallery', { floors: 2, home: { kind: 'apartment', price: 24000 } }) },
      { w: 6, mural: 'waves', floors: 2, depth: 16 },
      { w: 0, ...warehouse('Glassworks Guild', 'gallery', { floors: 2 }) },
    ], { only: true, depth: 24 });
    used.add('Kiln Gallery');
    shopRow(kilnE, galW + 1, y0, foundryN, [
      { w: 18, name: 'Gallery Nine', store: 'gallery', look: 'stone', face: { style: 'stucco', wallColor: '#f0eee8' }, floors: 2, win: 'tall', cornice: null, awning: null, signC: ['#101014', [240, 240, 236]], neon: 'bar', pic: 'palette', neonName: 'GALLERY NINE', depth: 20 },
      { w: 9, name: 'Turpentine Coffee', store: 'cafe', look: 'paint', floors: 3, depth: 16 },
      { w: 0, ...warehouse('Studio Ten', 'gallery', { floors: 4, spec: {}, kit: loftKit(16, 20, 1), home: { kind: 'apartment', price: 24000 } }) },
    ], { only: true, depth: 20 });
    // south of Foundry Street: the shops on Greenfield Avenue (their backs on Foundry Street), the records shop and the
    // bookshop on Gallery Avenue's corner
    const sx0 = coastX(greenN) + 2;
    shopRow(sx0, kilnW + 1, foundryS, greenN, [{ gap: 8, kind: 'garden' }], { depth: 18, cats: [['cafe', 0.25], ['food', 0.55], ['bar', 0.7], ['shop', 1]] });
    shopRow(kilnE, galW + 1, foundryS, greenN, [
      { w: 12, name: 'Burnt Sienna Art Supply', store: 'mart', look: 'paint', floors: 3, blade: 'ART SUPPLY' },
      { w: 10, name: 'Easel Cafe', store: 'cafe', look: 'brick', floors: 3, awning: ['#2f7a5c', '#f0ece4'], blade: 'CAFE', poi: { kind: 'coffee', label: 'Easel Cafe' } },
      { w: 11, name: 'Dog-Ear Books', store: 'books', look: 'brick', floors: 3, awning: ['#3a2a20', '#d8c8a8'], blade: 'BOOKS', poi: { kind: 'delivery', label: 'Dog-Ear Books', walk: true, store: 'books' } },
      { w: 0, name: 'Second Spin Records', store: 'records', look: 'paint', face: { style: 'stucco', wallColor: '#2a2c38' }, floors: 3, awning: ['#c84a5a', '#c84a5a'], neon: 'bar', pic: 'vinyl', blade: 'VINYL', poi: { kind: 'delivery', label: 'Second Spin Records', walk: true, store: 'records' } },
    ], { only: true, depth: 18 });
    // Foundry Point: the little park at Foundry Street's end, by the water - a bench looking out, a lamp
    (out.places ||= []).push({ name: 'The Brickworks', x0: wx0, y0, x1: galW, y1: foundryN });
  }
  // The Boiler House: the old boiler hall under its chimney, a music club now (a club's lot: the dance floor inside, the
  // line and the bouncers - server/systems/nightclubs.js)
  function boilerHouse() {
    used.add('The Boiler House');
    out.shops++;
    return { arch: 'club', key: 'club', name: 'The Boiler House', poi: { kind: 'delivery', label: 'The Boiler House' }, whole: true,
      art: { spec: { floors: 3, style: 'brick', brickTone: '#6e3428', win: 'arch', cornice: 'step', parapet: 12, grime: 0.32, roofMat: 'tar', lip: 10, rimW: 4, blades: [], date: '1911' },
        shop: { kind: 'bar', door: 'right', open: true, people: 4, sign: null, awning: ['#16121e', '#16121e'] },
        neon: { name: 'BOILER HOUSE', kind: 'club', col: 3, blade: 'LIVE' },
        kit: [['stack', 120, 90], ['tank', 520, 80], ['hvac', 360, 200], ['vent', 260, 260]] } };
  }

  // ===========================================================================================================
  // Canvas Market (WC239's street-food market) by the water, Greenfield Avenue to Canvas Street west of Easel Street: the
  // eateries round it facing the stalls (their backs on the avenue), the stalls in their rows, the tables under
  // umbrellas and the lights strung over them; the quay's lawn and palms by the water; the passages in from the streets
  function canvasMarket() {
    const x1 = easelW + 1, my0 = greenS + 17, my1 = my0 + 27;   // the market's rows
    // the eateries along its north side (fronts on the market), a passage in from the avenue
    const ex0 = coastX(greenS + 8) + 10;
    shopRow(ex0, x1, greenS, my0 - 1, [
      { w: 9, name: 'Kanji Noodle Bar', store: 'diner', look: 'paint', floors: 2, awning: ['#a8343a', '#a8343a'], blade: 'NOODLES' },
      { w: 9, name: 'Mural Tacos', store: 'diner', look: 'paint', floors: 2 },
      { w: 6, gap: 6, kind: 'passage' },
      { w: 10, name: 'Little Lisbon', store: 'diner', look: 'brick', floors: 3 },
      { w: 9, name: 'Gouache Gelato', store: 'cafe', look: 'paint', floors: 2, awning: ['#e88a70', '#f0ece4'] },
      { w: 10, name: 'The Inkwell', store: 'bar', look: 'brick', floors: 3, neon: 'bar', blade: 'BAR' },
    ], { depth: 16, cats: [['food', 0.5], ['cafe', 0.7], ['bar', 1]] });
    // the row on Canvas Street - deep lofts over the shops, their backs on the market - the way in between
    shopRow(coastX(canvasN) + 6, x1, my1 + 1, canvasN, [
      { w: 12, name: 'Sesame Dumplings', store: 'diner', floors: 4, look: 'loft' },
      { w: 6, gap: 6, kind: 'passage' },
    ], { depth: canvasN - my1, base: { look: 'loft', floors: 4 } });
    // the market: cobbles, the stalls in two rows down it, the carts, tables and umbrellas, lights strung over them
    const mx0 = Math.max(ex0, 2384), mx1 = x1, my = my0;
    for (let y = my; y <= my1; y++) for (let x = mx0; x < mx1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
    // (three rows of stalls back to back down the aisles, the tables between them under umbrellas, the carts, the lights
    // strung across in a zigzag, planters with trees at the corners)
    const cols = Math.floor((mx1 - mx0 - 4) / 6);
    for (let k = 0; k < cols; k++) {
      const sx = mx0 + 4 + k * 6;
      prop('mstall', sx, my + 3, 12, { v: k % 4, c: k, a: 0 });
      prop('mstall', sx, my + 14, 12, { v: (k + 1) % 4, c: k + 2, a: 0 });
      prop('mstall', sx, my1 - 2, 12, { v: (k + 2) % 4, c: k + 1, a: 0 });
      for (const ty of [my + 7.5, my + 19.5]) { prop('cafetable', sx, ty, 0); if ((k + (ty > my + 10 ? 1 : 0)) % 2 === 0) prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(sx, ty, 40)), sx, ty - 0.1, 0); else prop('chair', sx + 1, ty, 0, { v: k % 4, a: 3.1416 }); }
      if (k % 3 === 1) prop('foodcart', sx + 3, my + 10.5, 14);
      for (const fy of [my + 5.5, my + 17.5]) prop('festoon', sx - 3, fy - (k % 2) * 1.5, 0, { tx: 6 * TILE, ty: Math.round(((k % 2) * 2 - 1) * -1.5 * TILE), h: 58 });
    }
    for (const [tx, ty] of [[mx0 + 1.5, my + 1.5], [mx1 - 1.5, my + 1.5], [mx0 + 1.5, my1 - 1], [mx1 - 1.5, my1 - 1]]) { prop('planter_g', tx, ty, 10); prop('tree_a', tx, ty - 0.2, 0, { sp: 'streetPl', k: 1.0 }); }
    for (let k = 1; k < cols; k += 3) prop('lamp', mx0 + 4 + k * 6 + 3, my + 25.5, 0);
    prop('textsign', (mx0 + mx1) / 2, my + 0.8, 0, { text: 'CANVAS MARKET', bg: '#2f6a4e', fg: [250, 236, 180], z: 46, sx: 2 });
    (m.partySpots ||= []).push({ x: Math.round((mx0 + mx1) / 2 * TILE), y: Math.round((my + my1) / 2 * TILE), name: 'Canvas Market' });
    (out.places ||= []).push({ name: 'Canvas Market', x0: mx0, y0: my, x1: mx1, y1: my1 + 1 });
  }

  // ===========================================================================================================
  // Museum Square, Greenfield Avenue to Canvas Street between Easel Street and Gallery Avenue (WC070): the Metro Museum
  // of Art under its portico, the banners on their poles and the two sculptures on the forecourt, its steps; the
  // Playhouse beside it, its marquee and the masks lit up its face; the square - the reflecting pool, plane trees in
  // rows, benches, the lamps - and the subway's stairs at its corner (shared/map.js reserveSubwayPlazas, before)
  function museumSquare() {
    const x0 = easelE, x1 = galW + 1, mw = 50, mh = 30, my = greenS + 1;
    const W = mw * TILE, Dp = mh * TILE;
    const mus = place({ x: x0 + 1, y: my, w: mw, h: mh, arch: 'bank', key: 'bank', name: 'Metro Museum of Art', poi: { kind: 'delivery', label: 'Metro Museum of Art' }, whole: true,
      art: { spec: { floors: 3, style: 'stone', wallColor: '#e8e2d2', cornice: 'dentil', win: 'tall', parapet: 12, grime: 0.03, roofMat: 'gravel', lip: 10, rimW: 5, date: '1912',
        portico: { x: Math.round(W / 2 - 200), w: 400, cols: 8, text: 'METRO MUSEUM OF ART' } }, noShop: true,
        kit: [['gdome', Math.round(W / 2), Math.round(Dp / 2 + 40)], ['sky', 80, 80], ['sky', W - 100, 80], ['sky', 80, Dp - 90], ['sky', W - 100, Dp - 90], ['hvac', W - 160, Dp - 60]] } });
    if (mus) used.add('Metro Museum of Art');
    // the Playhouse beside it, a step forward: its marquee, the masks in neon, the fly tower behind
    const px0 = x0 + mw + 3, pw = x1 - px0, ph = 22, py = my + mh - ph + 4;
    const ft = K.building({ x: px0 + 3, y: my, w: pw - 6, h: py - my, arch: 'theatre', name: 'The Playhouse', poi: false, door: null, whole: true,
      art: { spec: { floors: 5, style: 'brick', brickTone: '#7a3a2e', parapet: 10, grime: 0.18, roofMat: 'tar', lip: 8, rimW: 4, blades: [], plaques: [], blank: true }, noShop: true, kit: [['neon|PLAYHOUSE|5', Math.round((pw - 6) * TILE / 2), 14], ['vent', 80, 120]] } });
    const ph0 = place({ x: px0, y: py, w: pw, h: ph, arch: 'theatre', key: 'theatre', name: 'The Playhouse', poi: { kind: 'delivery', label: 'The Playhouse' }, whole: true,
      art: { spec: { floors: 3, style: 'brick', brickTone: '#8e4a3a', win: 'arch', cornice: 'step', parapet: 14, grime: 0.1, roofMat: 'gravel', lip: 10, rimW: 5, blades: [] },
        shop: { kind: 'lobby', door: 'left', open: true, people: 4, sign: null, awning: ['#7a1e2a', '#7a1e2a'] }, neon: { name: 'THE PLAYHOUSE', kind: 'club', col: 5, pic: 'masks', picV: 120, blade: 'THEATRE' } } });
    if (ph0) { used.add('The Playhouse'); prop('marquee', px0 + pw / 2, py + ph + 1.4, 0); }
    void ft;
    // the forecourt: the museum's steps (paving), the banners either side, the two sculptures
    const fy0 = my + mh, sq1 = canvasN;
    for (let y = fy0; y <= sq1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
    const cx = x0 + 1 + mw / 2;
    for (const dx of [-14, -10, 10, 14]) prop('flagpole', cx + dx, fy0 + 2.2, 0, { h: 130, c: dx < 0 ? '#c8343a' : '#2a3e7a' });
    prop('statue', cx - 6, fy0 + 4, 20); sculpture(cx + 6, fy0 + 4);
    for (const dx of [-20, 20]) prop('plamp', cx + dx, fy0 + 2.6, 6);
    // the reflecting pool across the square's middle (still water, its stone kerb), benches along it, plane trees in a
    // grid in their pits over the rest of the square, lamps; the Playhouse's box office and its poster boards
    const py0 = fy0 + 10, py1 = py0 + 5, pw0 = 30, px0p = Math.round(cx - pw0 / 2);
    for (let y = py0; y < py1; y++) for (let x = px0p; x < px0p + pw0; x++) m.set(x, y, T.WATER);
    (m.pools ||= []).push({ x: px0p * TILE, y: py0 * TILE, w: pw0 * TILE, h: (py1 - py0) * TILE, lanes: 0, basin: true, deck: { x: (px0p - 1) * TILE, y: (py0 - 1) * TILE, w: (pw0 + 2) * TILE, h: (py1 - py0 + 2) * TILE } });
    for (let x = px0p - 1; x <= px0p + pw0; x += 3) { prop('bollard', x + 0.5, py0 - 0.6, 4); prop('bollard', x + 0.5, py1 + 0.4, 4); }
    for (let k = 0; k < 4; k++) { prop('bench_m', px0p + 3 + k * 8, py0 - 2, 0); prop('bench_m', px0p + 3 + k * 8, py1 + 1.6, 0); }
    for (let y = fy0 + 6; y < sq1 - 3; y += 7) for (let x = x0 + 4; x < x1 - 3; x += 8) {
      if (y >= py0 - 3 && y <= py1 + 3 && x > px0p - 3 && x < px0p + pw0 + 3) continue;
      if (x > px0 - 2 && y < py + ph + 6) continue;   // (the Playhouse's front)
      if (x > x1 - 14 && y > sq1 - 9) continue;   // (the subway's stairs)
      prop('tree_a', x + 0.5, y + 0.5, 10, { sp: 'streetPl', k: 1.05 }); prop('planter_sq', x + 0.5, y + 0.9, 0);
    }
    for (const dx of [-24, 24]) for (let y = fy0 + 6; y < sq1 - 2; y += 8) prop('lamp', cx + dx, y, 0);
    if (ph0) { prop('textsign', px0 + pw / 2 - 5, py + ph + 4, 0, { text: 'BOX OFFICE', bg: '#7a1e2a', fg: [255, 226, 150], z: 30, sx: 1 }); for (const dx of [2, pw - 2]) prop('picboard', px0 + dx, py + ph + 3, 0, { pic: 'masks', z: 30, col: [255, 210, 110] }); }
    prop('foodcart', cx + 18, sq1 - 4, 14); prop('cafetable', x0 + 6, sq1 - 5, 0, { chess: 1, seat: 25 }); prop('cafetable', x0 + 10, sq1 - 5, 0, { chess: 1, seat: 25 });
    prop('textsign', cx, sq1 - 1.2, 0, { text: 'MUSEUM SQUARE', bg: '#2a2c38', fg: [236, 214, 150], z: 34, sx: 2 });
    for (let k = 0; k < 3; k++) prop('news_c', x0 + 2 + k * 1.4, sq1 - 0.8, 0);
    m.squares ||= []; m.squares.push({ x: Math.round(cx) - 15, y: py0 - 3, w: 30, h: 11, name: 'Museum Square' });
    (out.places ||= []).push({ name: 'Museum Square', x0, y0: fy0, x1, y1: sq1 + 1 });
  }
  // a sculpture on the forecourt: a stack of painted blocks on a plinth (the 'mosaic' paving under it, a lamp)
  function sculpture(x, y) {
    prop('mosaic', x, y + 1, 0);
    prop('sculpt', x, y, 16, { v: Math.floor(rnd(x, y, 85) * 3) });
  }

  // ===========================================================================================================
  // Gallery Row and the Playhouse's neighbours: Gallery Avenue to Bridge Street - the lofts' backs on Greenfield Avenue,
  // the galleries and cafes facing Canvas Street, the back gardens between
  function galleryBlock() {
    backRow(galE, bridgeW + 1, greenS, greenS + 13);
    shopRow(galE, bridgeW + 1, greenS + 16, canvasN, [
      { w: 12, name: 'Blue Hour Gallery', store: 'gallery', look: 'paint', floors: 3, awning: null },
      { w: 9, name: 'Charcoal Coffee', store: 'cafe', look: 'brick', floors: 3 },
      { w: 7, mural: 'flowers', depth: 16 },
    ], { depth: 18 });
  }

  // ===========================================================================================================
  // Under the Gulf Loop, Greenfield Avenue to Canvas Street (WC070): the columned bank and the noodle bar west of the
  // deck; the car park under it; the loft studios with their arched windows east of it, a mural on a blank wall, the
  // cafe terrace; the boutiques and the wine bar on to Westside Avenue
  function underTheLoop() {
    // the deck's ground (its LOT): bays under it, a car or two
    deckStalls(greenS + 2, canvasN - 2);
    const dx0 = deckX(greenS + 20)[0], dx1 = deckX(greenS + 20)[1];
    // west of the deck
    shopRow(bridgeE, dx0, greenS + 14, canvasN, [
      { w: 0, lot: bankLot(), depth: 22 },
    ], { only: true, depth: 22 });
    backRow(bridgeE, dx0, greenS, greenS + 11);
    // east of the deck to Studio Street: loft studios, the mural, the cafe terrace
    shopRow(dx1 + 1, studioW + 1, greenS + 14, canvasN, [
      { w: 14, name: 'North Light Studios', store: 'gallery', look: 'loft', floors: 4, win: 'arch', awning: null, home: { kind: 'apartment', price: 24000 }, poi: { kind: 'delivery', label: 'North Light Studios' } },
      { w: 7, mural: 'tiger', depth: 16, floors: 4 },
      { w: 10, name: 'The Sketchbook', store: 'cafe', look: 'brick', floors: 3, awning: ['#2f6a4e', '#f0ece4'], garden: true },
    ], { depth: 18 });
    backRow(dx1 + 1, studioW + 1, greenS, greenS + 11);
    // Studio Street to Westside Avenue
    shopRow(studioE, westW + 1, greenS + 14, canvasN, [
      { w: 10, name: 'Warp & Weft', store: 'clothes', look: 'paint', floors: 3, poi: { kind: 'clothing', label: 'Warp & Weft' } },
      { w: 10, name: 'Muse Wine Bar', store: 'bar', look: 'brick', floors: 3, neon: 'bar', pic: 'martini', blade: 'WINE' },
    ], { depth: 18 });
    backRow(studioE, westW + 1, greenS, greenS + 11);
  }
  function bankLot() {
    used.add('Canvas Savings Bank');
    out.shops++;
    return { arch: 'bank', key: 'bank2', name: 'Canvas Savings Bank', poi: { kind: 'delivery', label: 'Canvas Savings Bank' }, whole: true,
      art: { spec: { floors: 3, style: 'stone', wallColor: '#d8ccb4', cornice: 'dentil', win: 'tall', parapet: 10, grime: 0.06, roofMat: 'gravel', lip: 10, rimW: 5, date: '1924',
        portico: { x: 40, w: 280, cols: 6, text: 'CANVAS SAVINGS' } }, noShop: true, kit: [['ac', 80, 80], ['vent', 200, 120]] } };
  }
  // the Gulf Loop's deck over the district: the run of its ground (LOT) on a row, [x0, x1] (or [0, 0])
  function deckX(y) { let a = -1, b = -1; for (let x = 2700; x < 2760; x++) if (tile(x, y) === T.LOT && m.dist[y * m.w + x] === D) { if (a < 0) a = x; b = x; } return a < 0 ? [2712, 2735] : [a - 1, b + 1]; }
  // bays on the deck's ground between two rows (its LOT), rows of three-tile stalls, the odd car
  function deckStalls(y0, y1) {
    for (let y = y0; y + 4 <= y1; y += 9) {
      let a = -1, b = -1;
      for (let x = 2700; x < 2760; x++) if (tile(x, y) === T.LOT && tile(x, y + 3) === T.LOT && m.dist[y * m.w + x] === D) { if (a < 0) a = x; b = x; }
      if (a < 0 || b - a < 6) continue;
      for (let sx = a + 1; sx + 3 <= b; sx += 3) { m.stalls.push({ x: sx * TILE, y: y * TILE, w: 3 * TILE, h: 4 * TILE }); if (rnd(sx, y, 104) < 0.45) m.parking.push({ x: (sx + 1.5) * TILE, y: (y + 2) * TILE, a: -Math.PI / 2 }); }
    }
  }

  // ===========================================================================================================
  // By the water, Canvas Street to Fountain Avenue west of Easel Street: the community garden (WC315: raised beds, the
  // greenhouse, the tool shed, the market stalls by its gate, the bakery on the corner), the bathhouse on Fountain
  // Avenue, the lawn and the promenade along the water (the water bus calls at its pier: shared/world3-ferries.js)
  function waterGarden() {
    // the row on Fountain Avenue: the bathhouse, the bakery on Easel Street's corner
    const rx0 = coastX(fountN - 6) + 4;
    shopRow(rx0, easelW + 1, fountN - 20, fountN, [
      { w: 22, lot: bathhouse(), depth: 16 },
    ], { depth: 16, cats: [['cafe', 0.4], ['food', 0.7], ['shop', 1]] });
    // the community garden behind them, open to Canvas Street through its gate
    const gx1 = easelW + 1, gw = 40, gx0 = gx1 - gw, gy0 = canvasS, gh = fountN - 22 - canvasS;
    if (gh >= 14 && K.allFree(gx0, gy0, gw, gh)) communityGarden(gx0, gy0, gw, gh);
  }
  // the sento: a timber bathhouse under its gabled roof, the curtain over its door, its chimney (WC: L6-A)
  function bathhouse() {
    used.add('Steam & Stone Baths');
    out.shops++;
    return { arch: 'mixed', key: 'rest2', name: 'Steam & Stone Baths', poi: { kind: 'delivery', label: 'Steam & Stone Baths' }, whole: true,
      art: { spec: { floors: 2, style: 'siding', wallColor: '#8a6a4a', win: 'pair', pitch: 'gable', ridge: 'ns', slope: 0.42, roofColor: '#3a4048', parapet: 6, grime: 0.08, blades: [], plaques: [] },
        shop: { kind: 'lobby', door: 'left', open: true, people: 2, sign: { text: 'BATHS', bg: '#2a3a5a', fg: [240, 236, 220], lit: true }, awning: ['#2a3a5a', '#2a3a5a'] }, kit: [] } };
  }
  function communityGarden(x, y, w, h) {
    K.fill(x, y, w, h, T.GRASS); K.take(x, y, w, h);
    const mx = x + (w >> 1);
    K.paint(mx - 1, y, 2, h, T.DIRT);
    for (let yy = y + 3; yy < y + h - 4; yy += 4) for (const bx of [x + 3, x + 9, mx + 4, mx + 10]) if (bx + 4 < x + w - 1 && (bx < mx - 3 || bx > mx + 1)) prop('raisedbed', bx + 1.5, yy + 1, 0, { v: (bx * 7 + yy) % 5 });
    prop('greenhouse', x + w - 7, y + 4, 26);
    prop('shed', x + 4, y + 3, 18);
    prop('tree_b', x + w - 4, y + h - 4, 12, { sp: 'cherry', k: 1.2 });
    prop('bench_m', mx + 3, y + 2.4, 0);
    // the stalls by the gate on Canvas Street (the garden's produce on Saturdays), the sign
    prop('mstall', mx - 5, y + 1.6, 10, { v: 1, c: 1, a: 0 }); prop('mstall', mx + 6, y + 1.6, 10, { v: 3, c: 3, a: 0 });
    prop('fenceline', x + 0.2, y + 0.3, 0, { kind: 'picket', tx: (mx - 1.5 - x) * TILE, ty: 0 });
    prop('fenceline', mx + 1.5, y + 0.3, 0, { kind: 'picket', tx: (x + w - 0.2 - mx - 1.5) * TILE, ty: 0 });
    prop('fenceline', x + 0.2, y + h - 0.4, 0, { kind: 'picket', tx: (w - 0.4) * TILE, ty: 0 });
    for (let xx = x + 1; xx < x + w - 1; xx += 3) if (Math.abs(xx - mx) > 2) prop('flowers_a', xx + 0.5, y + h - 1.4, 0);
    prop('textsign', mx, y + 1, 0, { text: 'CANVAS GARDEN', bg: '#2f6a4e', fg: [250, 240, 200], z: 30, sx: 1 });
    (out.places ||= []).push({ name: 'Canvas Community Garden', x0: x, y0: y, x1: x + w, y1: y + h });
  }

  // ===========================================================================================================
  // Studio Court (D4, the research's courtyard of artist lofts), Canvas Street to Fountain Avenue between Easel Street and
  // Gallery Avenue: the lofts round their court - the north row's doors on Canvas Street, the side wings, the south row on
  // Fountain Avenue with the shops and the corner bodega, the gate between; in the court the half court, the garden and
  // its tree, the koi mural on the west wing, benches, bikes
  function studioCourt() {
    const x = easelE, x1 = galW + 1, w = x1 - x, y = canvasS, h = fountN - canvasS + 1;
    const rowD = 13, wing = 11;
    backRow(x, x1, y, y + rowD - 1, { depth: rowD });
    for (const [wx, k] of [[x, 0], [x1 - wing, 1]]) {
      const L = front(wx, y + rowD, wing, { name: 'Studio Court', shop: false, floors: 4, poi: false, home: { kind: 'apartment', price: 21000, name: 'Studio Court Loft' }, look: 'loft', win: 'loft' });
      if (k === 0) L.art.spec.mural = { x: 8, w: wing * TILE - 16, h: 150, kind: 'koi' }, L.art.spec.blank = true, out.murals++;
      placed(K.building({ x: wx, y: y + rowD + 1, w: wing, h: h - 2 * rowD - 3, ...L, door: null, home: null }), {});
    }
    shopRow(x, x1, y + h - rowD - 1, y + h - 1, [
      { w: 9, name: 'Corner Bodega', store: 'mart', look: 'paint', floors: 3, awning: ['#e0b040', '#f0ece4'], poi: { kind: 'convenience', label: 'Corner Bodega' }, home: { kind: 'apartment', price: 16000 } },
      { w: 12, name: 'The Hair Loft', store: 'salon', look: 'brick', floors: 4, home: { kind: 'apartment', price: 18000 } },
      { w: 7, gap: 7, kind: 'passage' },
      { w: 12, name: 'Bric-a-Brac', store: 'pawn', look: 'brick', floors: 4, blade: 'ANTIQUES', home: { kind: 'apartment', price: 18000 } },
      { w: 0, name: 'Olive & Fig', store: 'diner', look: 'paint', floors: 3 },
    ], { only: true, depth: rowD });
    // the court
    const cx0 = x + wing, cy0 = y + rowD, cw = w - 2 * wing, ch = h - 2 * rowD - 1;
    for (let yy = cy0; yy < cy0 + ch; yy++) for (let xx = cx0; xx < cx0 + cw; xx++) if (K.free(xx, yy)) K.fill(xx, yy, 1, 1, T.PLAZA);
    const mid = cx0 + cw / 2;
    if (cw >= 16 && ch >= 24) {
      prop('court', mid, cy0 + 1.5, 0, { w: Math.min(cw - 4, 14) * TILE, d: 10 * TILE, c1: '#4a6a8a', c2: '#c86a3a' });
      prop('hoop', mid, cy0 + 2.1, 6);
      const ly0 = cy0 + 14, lh = Math.max(4, ch - 18);
      K.paint(cx0 + 2, ly0, cw - 4, lh, T.GRASS);
      // (the lawn: a cross of paths, a big maple where they meet, a ring of trees, the residents' beds and their
      // picnic tables, a pergola over the west path, benches round the edge)
      K.paint(Math.floor(mid) - 1, ly0, 3, lh, T.PLAZA); K.paint(cx0 + 2, Math.floor(ly0 + lh / 2) - 1, cw - 4, 3, T.PLAZA);
      prop('tree_b', mid + 0.5, ly0 + lh / 2 - 3, 12, { sp: 'maple', k: 1.35 });
      for (const [fx, fy] of [[0.12, 0.2], [0.32, 0.12], [0.68, 0.12], [0.88, 0.2], [0.12, 0.8], [0.32, 0.9], [0.68, 0.9], [0.88, 0.8]]) prop(pick(['tree_a', 'tree_b'], rnd(fx * 9, fy * 9, 240)), cx0 + 2 + (cw - 4) * fx, ly0 + lh * fy, 12, { sp: pick(['cherry', 'birch', 'magnolia', 'maple'], rnd(fx * 7, fy * 7, 241)), k: 1.15 });
      for (let k = 0; k < 6; k++) prop('raisedbed', cx0 + 6 + (k % 3) * 5, ly0 + lh * 0.3 + Math.floor(k / 3) * 4, 0, { v: k });
      for (let k = 0; k < 3; k++) prop('picnic', mid + 6 + k * 6, ly0 + lh * 0.3 + (k % 2) * 3, 0);
      for (let k = 0; k < 3; k++) prop('picnic', mid + 6 + k * 6, ly0 + lh * 0.72 - (k % 2) * 3, 0);
      for (const fx of [0.2, 0.4, 0.6, 0.8]) prop('flowers_big', cx0 + 2 + (cw - 4) * fx, ly0 + lh - 1.2, 0);
      for (const fx of [0.25, 0.75]) { prop('bench_m', cx0 + (cw) * fx, ly0 - 1.2, 0); prop('bench_m', cx0 + cw * fx, ly0 + lh + 0.8, 0); }
      prop('bikerack', mid + 6, cy0 + ch - 1.5, 0); prop('trashcan', mid - 6, cy0 + ch - 1.5, 0);
      prop('lamp', cx0 + 1.5, ly0 - 1, 0); prop('lamp', cx0 + cw - 1.5, ly0 + lh + 1, 0);
      (m.courtSpots ||= []).push({ x: Math.round(mid * TILE), y: Math.round((cy0 + 6) * TILE), w: 14, h: 10, name: 'Studio Court' });
    }
    (out.places ||= []).push({ name: 'Studio Court', x0: x, y0: y, x1, y1: y + h });
  }

  // ===========================================================================================================
  // Gallery Lane (the research's galleries on a cobbled passage), Canvas Street to Fountain Avenue between Gallery
  // Avenue and Bridge Street: the lane across the block, the galleries along its north side facing it, lights strung
  // over it, planters and benches, bollards at its ends; the shops on Fountain Avenue south of it, their back gardens
  // on the lane
  function galleryLane() {
    const x0 = galE, x1 = bridgeW + 1, ly0 = AY.lane - 2, ly1 = AY.lane + 3;
    for (let y = ly0; y <= ly1; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) K.fill(x, y, 1, 1, T.PLAZA);
    shopRow(x0, x1, canvasS, ly0 - 1, [
      { w: 9, name: 'Gesso Gallery', store: 'gallery', look: 'paint', floors: 2, awning: null },
      { w: 8, name: 'Linocut Press', store: 'gallery', look: 'brick', floors: 2, awning: null, blade: 'PRINTS' },
      { w: 10, name: 'The Clay Room', store: 'gallery', look: 'paint', floors: 2, awning: ['#8a5a2a', '#efe6d0'], blade: 'POTTERY' },
      { w: 8, name: 'Absinthe & Oak', store: 'bar', look: 'brick', floors: 3, neon: 'bar', blade: 'BAR' },
      { w: 9, name: 'Lumen Photo Gallery', store: 'gallery', look: 'stone', floors: 2, awning: null },
      { w: 8, name: 'Papercut Stationery', store: 'books', look: 'paint', floors: 2 },
      { w: 10, name: 'Halftone Gallery', store: 'gallery', look: 'loft', floors: 3, awning: null },
      { w: 9, name: 'Crema Studio', store: 'cafe', look: 'paint', floors: 2, garden: true },
      { w: 9, name: 'Cobalt Gallery', store: 'gallery', look: 'paint', face: { style: 'stucco', wallColor: '#2a4a8a' }, floors: 2, awning: null },
      { w: 0, name: 'Atelier Noor', store: 'gallery', look: 'brick', floors: 3, awning: null },
    ], { only: true, depth: ly0 - canvasS });
    for (let x = x0 + 2; x < x1 - 8; x += 8) prop('festoon', x, ly0 + 1.5, 0, { tx: 8 * TILE, ty: Math.round(1.5 * TILE), h: 54 });
    for (let x = x0 + 6; x < x1 - 4; x += 12) { prop('planter_fl', x, ly1 - 0.6, 8); prop('bench_m', x + 4, ly1 - 0.8, 0); }
    for (let x = x0 + 12; x < x1 - 6; x += 24) prop('lamp', x, ly0 + 2.5, 0);
    for (const bx of [x0 + 0.6, x1 - 0.6]) for (const dy of [1, 3, 5]) prop('bollard', bx, ly0 + dy, 5);
    prop('textsign', x0 + 4, ly0 + 0.6, 0, { text: 'GALLERY LANE', bg: '#2a2c38', fg: [240, 236, 220], z: 30, sx: 1 });
    // the shops on Fountain Avenue, their gardens behind on the lane
    shopRow(x0, x1, ly1 + 1, fountN, [
      { w: 10, name: 'Moss & Fern', store: 'florist', look: 'paint', floors: 3 },
      { w: 10, name: 'Palette Pizza', store: 'diner', look: 'brick', floors: 3 },
    ], { depth: 18 });
    (out.places ||= []).push({ name: 'Gallery Lane', x0, y0: ly0, x1, y1: ly1 + 1 });
  }

  // ===========================================================================================================
  // The Underpass (WC292, the research's skate plaza): the skaters' plaza under the Gulf Loop between Canvas Street and
  // Fountain Avenue - the slab, ledges, a pyramid, quarter pipes, a flat bar, the deck's piers tagged; Kickflip Skate Co.
  // beside it; the brewery in the old warehouse and lofts on to Westside Avenue
  function underpass() {
    const [a, b] = deckX((canvasS + fountN) >> 1);
    const x = b + 2, w = 24, y0 = canvasS + 2, y1 = canvasS + 38, h = y1 - y0;
    if (K.allFree(x, y0, w, h)) {
      K.fill(x, y0, w, h, T.PLAZA); K.take(x, y0, w, h);
      const put = (t, px, py, extra = null, solid = 0) => prop(t, px, py, solid, extra);
      put('skatepad', x + w / 2, y0 + 1.3, { w: Math.round((w - 0.4) * TILE), d: Math.round((h - 1.6) * TILE) });
      put('qpipe', x + w / 2, y0 + 2.2, { w: Math.min(192, (w - 4) * TILE) });
      put('pyramid', x + w / 2, y0 + h * 0.4);
      put('kicker', x + w * 0.25, y0 + h * 0.62);
      put('ledge', x + w * 0.7, y0 + h * 0.62, { w: 128, v: 1 });
      put('flatbar', x + w / 2, y0 + h * 0.78, { w: 128 });
      put('ledge', x + w * 0.3, y0 + h * 0.86, { w: 96, v: 2 });
      put('qpipe', x + w / 2, y1 - 1.2, { w: Math.min(160, (w - 4) * TILE) });
      put('boombox', x + 1.2, y0 + h * 0.5);
      put('gwall', x + w / 2, y0 + 0.6, { len: Math.round((w - 0.6) * TILE), v: 2 });
      put('chainfence', x + w - 0.2, y0 + 0.4, { tx: 0, ty: Math.round((h - 0.8) * TILE) });
      put('lamp', x + w - 1, y0 + h * 0.3); put('lamp', x + w - 1, y0 + h * 0.75); put('trashcan', x + w - 1.2, y1 - 1);
      const seats = [[0.7, 0.62], [0.3, 0.86]].map(([fx, fy]) => ({ x: Math.round((x + w * fx) * TILE), y: Math.round((y0 + h * fy) * TILE) + 4 }));
      (m.skateSpots ||= []).push({ name: 'The Underpass', x, y: y0, w, h, seats });
      prop('textsign', x + w / 2, y1 + 0.6, 0, { text: 'THE UNDERPASS', bg: '#1a1a20', fg: [250, 210, 60], z: 30, sx: 1 });
      (out.places ||= []).push({ name: 'The Underpass', x0: x, y0, x1: x + w, y1 });
    }
    // west of the deck: a mural wall, a cafe; east of it Kickflip Skate Co., the brewery, lofts
    shopRow(bridgeE, a, canvasS, fountN, [
      { w: 8, mural: 'geo', depth: 16 },
    ], { depth: 18, cats: [['cafe', 0.3], ['food', 0.6], ['shop', 1]] });
    shopRow(b + 1, studioW + 1, canvasS + 40, fountN, [
      { w: 11, name: 'Kickflip Skate Co.', store: 'clothes', look: 'paint', face: { style: 'stucco', wallColor: '#2a2c38' }, floors: 2, awning: null, signC: ['#e8c040', [30, 30, 36]], blade: 'SKATE', poi: { kind: 'clothing', label: 'Kickflip Skate Co.' } },
      { w: 0, lot: breweryLot(), depth: 24 },
    ], { only: true, depth: 22 });
    backRow(x + w + 1, studioW + 1, canvasS, canvasS + 12);
    shopRow(studioE, westW + 1, canvasS + 18, fountN, [
      { w: 10, name: 'The Gilded Fork', store: 'diner', look: 'stone', floors: 4 },
    ], { depth: 20 });
    backRow(studioE, westW + 1, canvasS, canvasS + 12);
  }
  function breweryLot() {
    used.add('Canvas Brewing Co.');
    out.shops++;
    return { arch: 'mixed', key: 'rest1', name: 'Canvas Brewing Co.', poi: { kind: 'coffee', label: 'Canvas Brewing Co.', food: true }, whole: true,
      art: { spec: { floors: 2, style: 'brick', brickTone: '#6e3a2e', win: 'loft', cornice: 'step', parapet: 10, grime: 0.28, pitch: 'saw', tooth: 80, blades: [], plaques: [] },
        shop: { kind: 'bar', door: 'left', open: true, people: 4, sign: { text: 'CANVAS BREWING CO.', bg: '#2a2c38', fg: [236, 206, 120], lit: true }, awning: ['#2a2c38', '#2a2c38'] } } };
  }

  // ===========================================================================================================
  // The Glasshouse Gardens (WC110), south of Fountain Avenue from the water to Gallery Avenue: the gate on the avenue, the
  // walk to the Palm House (the great glasshouse and its two wings), the parterres either side - box hedges round the
  // flower beds, the fountain - the hedge maze, the koi pond with its stepping stones and the gazebo on its bank, the
  // Orangery Cafe, iron railings round it, lamps, benches
  function glasshouseGardens() {
    const x1 = galW + 1, y0 = fountS, y1 = bayN, x0 = coastX(2650) + 4;
    const AXx = Math.round((Math.max(x0, coastX(y0) + 4) + x1) / 2) + 6;   // the walk's line
    const ghY = y0 + 36;   // the Palm House's front
    // the buildings first (on free ground), then the ground: lawn everywhere it's free
    palmHouse(AXx, ghY);
    const ox = AXx + 26, oy = y0 + 4;
    if (K.allFree(ox, oy, 12, 8)) {
      const ob = K.building({ x: ox, y: oy, w: 12, h: 8, arch: 'cafe', key: 'greenbistro', name: 'The Orangery', poi: { kind: 'coffee', label: 'The Orangery', food: true }, whole: true,
        art: { spec: { floors: 1, style: 'glass', wallColor: '#9ec8b8', parapet: 6, roofMat: 'green', lip: 6, rimW: 4, blades: [], plaques: [] }, shop: { kind: 'cafe', door: 'left', open: true, people: 3, awning: ['#2f6a4e', '#f0ece4'], sign: { text: 'THE ORANGERY', bg: '#2f5a4a', fg: [240, 232, 200], lit: true } } } });
      if (ob) { used.add('The Orangery'); out.shops++; for (let k = 0; k < 4; k++) { prop('cafetable', ox + 1.5 + k * 3, oy + 10, 0); prop(k % 2 ? 'umbrella_g' : 'umbrella_y', ox + 1.5 + k * 3, oy + 9.9, 0); } }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0 - 6; x < x1; x++) if (K.free(x, y)) { K.take(x, y, 1, 1); }
    const pave = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const i = yy * m.w + xx; if (m.tiles[i] === T.GRASS && m.dist[i] === D && !(m.reserve[i] & ~16) && m.bld[i] < 0) m.tiles[i] = T.PLAZA; } };
    // the walk from the gate to the Palm House, the cross walks
    pave(AXx - 2, y0, 4, 34);
    pave(x0, y0 + 16, x1 - x0, 3);
    // the gate on Fountain Avenue: its arch and piers, the railings either side, the sign
    prop('gatearch', AXx, y0 + 0.4, 0, { w: 120, a: 0 });
    for (const dx of [-3, 3]) prop('gatepier', AXx + dx, y0 + 0.4, 10);
    prop('fenceline', x0 + 0.2, y0 + 0.2, 0, { kind: 'iron', tx: Math.round((AXx - 4 - x0) * TILE), ty: 0 });
    prop('fenceline', AXx + 4, y0 + 0.2, 0, { kind: 'iron', tx: Math.round((x1 - 0.4 - AXx - 4) * TILE), ty: 0 });
    prop('fenceline', x1 - 0.3, y0 + 0.2, 0, { kind: 'iron', tx: 0, ty: Math.round((y1 - y0 - 0.4) * TILE) });
    prop('textsign', AXx + 7, y0 + 1.6, 0, { text: 'GLASSHOUSE GARDENS', bg: '#2f5a4a', fg: [240, 232, 200], z: 36, sx: 1 });
    // the Palm House's terrace in front of it, two palms
    if (used.has('The Palm House')) { pave(AXx - 21, ghY + 16, 42, 4); for (const dx of [-8, 8]) prop('palm_a', AXx + dx, ghY + 18, 10, { sp: 'royal', k: 1.2 }); }
    // the parterres either side of the walk, between the gate and the cross walk: box hedges round beds of flowers
    for (const sd of [-1, 1]) {
      const px = sd < 0 ? AXx - 22 : AXx + 4, pw = 18, pyy = y0 + 3, ph = 12;
      prop('hedgerun', px, pyy, 0, { tx: pw * TILE, ty: 0, h: 12 }); prop('hedgerun', px, pyy + ph, 0, { tx: pw * TILE, ty: 0, h: 12 });
      prop('hedgerun', px, pyy, 0, { tx: 0, ty: ph * TILE, h: 12 }); prop('hedgerun', px + pw, pyy, 0, { tx: 0, ty: ph * TILE, h: 12 });
      for (let k = 0; k < 6; k++) prop('flowers_big', px + 2 + (k % 3) * 7, pyy + 3 + Math.floor(k / 3) * 6, 0);
      prop('topiary', px + pw / 2, pyy + ph / 2, 6);
    }
    prop('fountain', AXx, y0 + 17.5, 30);
    // the hedge maze, west of the Palm House: walls of clipped hedge on a grid, the paths between, a statue at its heart
    maze(x0 + 2, ghY + 4, Math.min(30, AXx - 26 - x0), Math.min(30, y1 - ghY - 8));
    // the koi pond east of the Palm House: water, its stepping stones, lilies, the koi; the gazebo on its bank
    const kx = AXx + 26, ky = ghY + 2, kw = Math.min(26, x1 - kx - 3), kh = 16;
    if (kw >= 12) {
      for (let y = ky; y < ky + kh; y++) for (let x = kx; x < kx + kw; x++) {
        const u = (x + 0.5 - kx) / kw, v = (y + 0.5 - ky) / kh;
        if (Math.hypot((u - 0.5) / 0.5, (v - 0.5) / 0.5) < 1 - 0.12 * Math.abs(Math.sin(u * 7))) m.set(x, y, T.WATER);
      }
      for (let k = 0; k < 5; k++) prop('koi', kx + 3 + k * (kw - 6) / 4, ky + 4 + (k % 2) * 6, 0, { a: k * 1.2, v: k % 3 });
      for (let k = 0; k < 4; k++) prop('lily', kx + 2 + rnd(k, kx, 90) * (kw - 4), ky + 2 + rnd(kx, k, 91) * (kh - 4), 0);
      for (let k = 0; k < 6; k++) prop('stonelantern', kx - 1 + k * (kw + 2) / 5, ky + kh + 1, 6);
      prop('gazebo', kx + kw / 2, ky + kh + 6, 30);
      for (let k = 0; k < 5; k++) { const sx = Math.floor(kx + kw * (0.25 + k * 0.12)), sy = Math.floor(ky + kh / 2 + (k % 2 ? 1 : -1)); if (tile(sx, sy) === T.WATER) m.set(sx, sy, T.DOCK); }   // (the stepping stones across it)
      (out.places ||= []).push({ name: 'Koi Pond', x0: kx, y0: ky, x1: kx + kw, y1: ky + kh });
    }
    // lamps and benches along the walks
    for (let y = y0 + 4; y < ghY - 2; y += 7) for (const dx of [-3.5, 3.5]) prop('plamp', AXx + dx, y, 6);
    for (let x = x0 + 4; x < x1 - 3; x += 12) prop('bench_m', x, y0 + 15.4, 0);
    // the rose garden south of the Palm House: beds in rows either side of a walk, arches over it
    const ry0 = ghY + 24, rx0 = AXx - 18;
    if (ry0 + 14 < y1) {
      pave(AXx - 1, ghY + 20, 3, 18);
      for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { const bx = AXx + sd * (6 + (k % 2) * 7), by = ry0 + Math.floor(k / 2) * 6; prop('flowers_big', bx, by, 0); prop('flowers_big', bx + sd * 2.5, by + 1, 0); prop('hedgerun', bx - 2.5, by + 2.2, 0, { tx: 6 * TILE, ty: 0, h: 10 }); }
      for (let y = ry0 - 1; y < ry0 + 13; y += 5) prop('gatearch', AXx + 0.5, y, 0, { w: 72, a: 0 });
      void rx0;
    }
    // the trees and the shrubs over the lawns left open (the arboretum): a jittered grid, clear of the walks, the
    // buildings and the set pieces
    const busy = (x, y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const i = (y + dy) * m.w + x + dx; if (m.tiles[i] !== T.GRASS || m.bld[i] >= 0) return true; } return false; };
    const clear = [[AXx - 24, y0, AXx + 24, y0 + 20], [AXx - 34, ghY - 3, AXx + 34, ghY + 40], [x0 - 2, ghY + 2, x0 + 34, ghY + 36], [kx - 4, ky - 4, kx + kw + 4, ky + kh + 10], [ox - 2, oy - 2, ox + 16, oy + 14]];
    for (let gy = y0 + 2; gy < y1 - 2; gy += 5) for (let gx = x0; gx < x1 - 2; gx += 5) {
      const x = gx + Math.floor(rnd(gx, gy, 220) * 5), y = gy + Math.floor(rnd(gx, gy, 221) * 5), r = rnd(x, y, 222);
      if (clear.some(([a, b, c, d]) => x >= a && y >= b && x < c && y < d) || busy(x, y) || r < 0.25) continue;
      if (r < 0.8) prop(rnd(x, y, 223) < 0.5 ? 'tree_a' : 'tree_b', x + 0.5, y + 0.5, 12, { sp: pick(['cherry', 'magnolia', 'maple', 'oak', 'willow', 'birch', 'cypress', 'cherry'], rnd(x, y, 224)), k: 1.1 + rnd(x, y, 225) * 0.25 });
      else prop(pick(['shrub_a', 'bush_c', 'flowers_big', 'topiary'], rnd(x, y, 226)), x + 0.5, y + 0.5, 0);
    }
    (out.places ||= []).push({ name: 'Glasshouse Gardens', x0, y0, x1, y1: y1 + 1 });
  }
  // the Palm House: the great glasshouse (its glazed roof on iron ribs - client/art2/buildings.js spec.roof 'glass')
  // between its two lower wings
  function palmHouse(AXx, ghY) {
    const glass = (floors, slope) => ({ spec: { floors, style: 'stucco', wallColor: '#eef0ea', win: 'loft', pitch: 'gable', ridge: 'ns', roof: 'glass', slope, parapet: 4, grime: 0.02, blades: [], plaques: [] }, noShop: true, kit: [] });
    const phW = 18, phH = 16, wgW = 12, wgH = 11;
    const ph = K.building({ x: AXx - phW / 2, y: ghY, w: phW, h: phH, arch: 'pavilion', name: 'The Palm House', poi: { kind: 'delivery', label: 'The Palm House' }, door: AXx, whole: true, art: glass(2, 0.42) });
    if (!ph) return;
    used.add('The Palm House'); out.shops++;
    for (const sd of [-1, 1]) K.building({ x: sd < 0 ? AXx - phW / 2 - wgW : AXx + phW / 2, y: ghY + phH - wgH, w: wgW, h: wgH, arch: 'pavilion', name: 'The Palm House', poi: false, door: null, whole: true, art: glass(1, 0.4) });
    (out.places ||= []).push({ name: 'The Palm House', x0: AXx - phW / 2 - wgW, y0: ghY, x1: AXx + phW / 2 + wgW, y1: ghY + phH + 4 });
  }
  // a hedge maze: a perfect maze on a grid of cells (walls of clipped hedge), carved by a walk fixed by its place
  function maze(x, y, w, h) {
    const C = 4, cw = Math.floor(w / C), chh = Math.floor(h / C);
    if (cw < 4 || chh < 4) return;
    for (let yy = y; yy < y + chh * C; yy++) for (let xx = x; xx < x + cw * C; xx++) { const i = yy * m.w + xx; if (m.tiles[i] === T.PLAZA && m.bld[i] < 0) m.tiles[i] = T.GRASS; }
    const seen = new Uint8Array(cw * chh), open = new Set(), stack = [[0, chh - 1]];
    seen[(chh - 1) * cw] = 1;
    let n = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [cx + dx, cy + dy]).filter(([qx, qy]) => qx >= 0 && qy >= 0 && qx < cw && qy < chh && !seen[qy * cw + qx]);
      if (!nb.length) { stack.pop(); continue; }
      const [qx, qy] = nb[Math.floor(rnd(cx + x, cy + y, 200 + n++) * nb.length) % nb.length];
      seen[qy * cw + qx] = 1;
      open.add(`${Math.min(cx, qx)},${Math.min(cy, qy)},${qx !== cx ? 'e' : 's'}`);
      stack.push([qx, qy]);
    }
    // the walls: each cell's east and south edges unless carved, and the maze's outer edges (the way in at the
    // south-west corner, the way out at the north-east)
    const wall = (ax, ay, len, horiz) => {
      prop('hedgebox', ax + (horiz ? len / 2 : 0.25), ay + (horiz ? 0.5 : len), 0, { w: horiz ? Math.round(len * TILE) : 16, d: horiz ? 16 : Math.round(len * TILE), h: 30 });
      for (let t = 0.25; t < len; t += 0.5) m.addSolidProp((horiz ? ax + t : ax + 0.25) * TILE, (horiz ? ay + 0.25 : ay + t) * TILE, 9);   // (the hedge stands in the way)
    };
    for (let cy = 0; cy < chh; cy++) for (let cx = 0; cx < cw; cx++) {
      const px = x + cx * C, py = y + cy * C;
      if (cx < cw - 1 && !open.has(`${cx},${cy},e`)) wall(px + C - 0.25, py, C, false);
      if (cy < chh - 1 && !open.has(`${cx},${cy},s`)) wall(px, py + C - 0.5, C, true);
    }
    wall(x, y - 0.5, (cw - 1) * C, true); wall(x + C, y + chh * C - 0.5, (cw - 1) * C, true);
    wall(x - 0.25, y, chh * C, false); wall(x + cw * C - 0.25, y, chh * C, false);
    prop('statue', x + Math.floor(cw / 2) * C + C / 2, y + Math.floor(chh / 2) * C + C / 2, 16);
    (out.places ||= []).push({ name: 'The Maze', x0: x, y0: y, x1: x + cw * C, y1: y + chh * C });
  }

  // ===========================================================================================================
  // The Spur Line (WC239's old rail spur, NK1-L): the freight spur that served the warehouses, its track left in the
  // grass of a green walk from Fountain Avenue to Bayside Avenue across Mosaic Street - wild flowers along the rails,
  // birches, benches, lamps, the old boxcar a cafe now, a signal by the crossing
  function spurLine() {
    const x0 = AX.spur - 4, w = 9;
    for (const [ya, yb] of [[fountS, mosaicN], [mosaicS, bayN]]) {
      if (!K.allFree(x0, ya, w, yb - ya + 1)) continue;
      K.fill(x0, ya, w, yb - ya + 1, T.GRASS); K.take(x0, ya, w, yb - ya + 1);
      K.paint(x0 + 3, ya, 3, yb - ya + 1, T.DIRT);
      for (let y = ya + 3; y < yb - 2; y += 6) prop('rails', AX.spur + 0.5, y + 3, 0, { len: 192 });
      for (let y = ya + 2; y < yb - 1; y += 3) { prop(pick(['flowers_a', 'flowers_big', 'shrub_a'], rnd(x0, y, 210)), x0 + 1, y + 0.5, 0); prop(pick(['flowers_a', 'flowers_big', 'bush_c'], rnd(x0 + 8, y, 211)), x0 + 7.8, y + 1.5, 0); }
      for (let y = ya + 5; y < yb - 3; y += 11) prop('tree_a', x0 + 1, y, 12, { sp: 'birch', k: 1.1 });
      for (let y = ya + 9; y < yb - 3; y += 11) prop('tree_b', x0 + 8, y, 12, { sp: 'maple', k: 1 });
      for (let y = ya + 7; y < yb - 2; y += 14) { prop('bench_m', x0 + 1.4, y, 0); prop('lamp', x0 + 7.6, y + 4, 0); }
    }
    // the boxcar cafe on the spur's southern stretch, its tables
    const by = mosaicS + 12;
    if (by + 10 < bayN) {
      prop('boxcar', AX.spur + 0.5, by, 30, { c: 0, a: Math.PI / 2 });
      for (let k = 0; k < 3; k++) { prop('cafetable', x0 + 7.4, by - 3 + k * 3, 0); prop('chair', x0 + 8.2, by - 3 + k * 3, 0, { v: 1, a: 3.1416 }); }
      prop('textsign', x0 + 7.6, by + 5, 0, { text: 'BOXCAR COFFEE', bg: '#7a3a2e', fg: [250, 236, 200], z: 28, sx: 1 });
      m.pois.push({ id: m.pois.length, kind: 'coffee', label: 'Boxcar Coffee', x: (x0 + 7.6) * TILE, y: (by + 1) * TILE, r: 48, fixed: true });
      used.add('Boxcar Coffee');
    }
    (out.places ||= []).push({ name: 'The Spur Line', x0, y0: fountS, x1: x0 + w, y1: bayN });
  }

  // ===========================================================================================================
  // South of Fountain Avenue east of Gallery Avenue: the rows on Mosaic Street and Bayside Avenue (their backs on the
  // street north of them), the car park under the Loop
  function southRows() {
    deckStalls(fountS + 2, bayN - 2);
    const [a, b] = deckX(2620);
    const spans = [[galE, AX.spur - 4], [AX.spur + 5, bridgeW + 1], [bridgeE, a], [b + 1, studioW + 1], [studioE, westW + 1]];
    for (const [x0, x1] of spans) {
      if (x1 - x0 < 6) continue;
      backRow(x0, x1, fountS, fountS + 12);
      shopRow(x0, x1, fountS + 16, mosaicN, [], { depth: 18, cats: [['gallery', 0.2], ['cafe', 0.35], ['food', 0.6], ['bar', 0.7], ['shop', 1]] });
      shopRow(x0, x1, mosaicS, bayN, [], { depth: 18, cats: [['gallery', 0.15], ['cafe', 0.3], ['food', 0.55], ['bar', 0.65], ['shop', 1]] });
    }
    // (the rows north of Canvas Street west of the deck and on to the coast left by the plan: lofts and shops)
    shopRow(galE, bridgeW + 1, greenS + 16, canvasN, [], { depth: 18 });
  }

  // ===========================================================================================================
  // The promenade along the water (the shore's own paving, laid with the city's plazas): its rail, lamps, benches, palms
  function promenade() {
    for (let y = 2326; y < bayN; y++) {
      const x = coastX(y);
      if (x >= 2440) continue;
      const i = y * m.w + x;
      if (m.tiles[i] !== T.PLAZA || m.dist[i] !== D) continue;
      if (y % 3 === 0) prop('rail', x + 0.2, y, 0, { tx: 0, ty: 3 * TILE });
      if (y % 10 === 5) prop('lamp', x + 1.2, y + 0.5, 0);
      if (y % 14 === 9) prop('bench_m', x + 1.6, y + 0.5, 0);
    }
  }

  // ===========================================================================================================
  // The street dressing: vending machines by the corner shops, tables out by the cafes; the murals asked for in rows
  function dressing() {
    const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
    for (let i = poi0; i < m.pois.length; i++) {
      const p = m.pois[i];
      if (p.kind !== 'convenience' && p.kind !== 'coffee') continue;
      const x = p.x / TILE, y = p.y / TILE;
      if (p.kind === 'convenience' && onWalk(x + 1.8, y + 0.3)) { prop('vend_cola', x + 1.8, y + 0.3, 8); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: (x + 1.8) * TILE, y: (y + 0.9) * TILE, r: 32 }); }
      else if (p.kind === 'coffee' && onWalk(x + 2, y + 0.6) && rnd(x, y, 106) < 0.6) { prop('cafetable', x + 2, y + 0.9, 0); prop(pick(['umbrella_r', 'umbrella_g', 'umbrella_b'], rnd(x, y, 107)), x + 2, y + 0.8, 0); }
    }
  }
}
