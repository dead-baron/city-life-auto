// World v3, handcrafted: The Pink Mile (district 17), behind the Neon Strip to the west on the Gulf Island's north shore,
// from the owner's concepts WC423 (the curving palm-median road of motels round their pools, the motel's tall sign, the
// lounges under crescent-moon and palm neon, the cocktail bar, the tattoo parlour's skull, the pawn shop, the graffitied
// back blocks with their roller doors and boarded shops, the gated apartment towers round a courtyard garden), WC046 and
// WC047 (the red-light waterfront under the curving elevated highway: the clubs' pin-up signs - kept suggestive at most -
// the lingerie shop, the fish bar and the ramen bar, a small square with a tree and string lights, a statue on the
// promenade, boats at a jetty under the overpass) and WC237 (two vertical HOTEL signs, one with a palm; the motel's lit
// pool court; the coffee-cup diner's red neon band; rooftop bars; the taxi rank), with the research's motel row,
// lounges, the tattoo and pawn back street, the rough dead-end alley and the wealth seam toward Downtown:
//   - Pink Mile Boulevard, the Mile: a palm-median boulevard curving from the Westport Bridge's foot through the
//     district to Westside Avenue at Crosstown Avenue - the motels along its north side, each behind its pool and its
//     tall sign, the cocktail lounge, the wedding chapel and the lounges between; Sideshow Street's backs and their
//     rooftop neon along its south side;
//   - Neon Boulevard, carried on west from the Strip along the water to the Arts Bridge: the waterfront east of the
//     Gulf Loop's deck (the clubs, the lingerie shop, the fish bar and the ramen bar, Siren Square, the jetty under the
//     overpass); the two hotels between it and Rose Street, only the water behind them;
//   - Rose Street (the Strip's Lantern Street carried on) and Rose Alley (its Neon Back Alley): the lounges' lit row,
//     the backs, the Hourly Hearts Motel round its kidney pool;
//   - Rose Plaza at the Arts Bridge's foot (the fountain, the statue, the roses, the lights strung over it) and Mile
//     Beach along the shore to Gallery Avenue;
//   - Sideshow Street: the tattoo parlours, the pawn shop, the boarded shops and the body shop's roller doors; Blind
//     Alley off it, fenced at its end, a fire in a barrel;
//   - under the Loop: the taxi rank, the car park, the food carts; Coral Court, the gated towers round their garden,
//     where the Mile meets Downtown.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2), so
// reworking one block moves nothing else. The frame: shared/world3-hand.js; the neon: client/art2/neonsigns.js (b.art.neon:
// handNeon); the motels' galleries: client/art2/buildings.js (spec.motel); their signs: the 'motelsign' prop.
import { TILE, T } from './constants.js';
import { towerKit } from './world3-downtown.js';

const D = 17;   // the Pink Mile's district id (shared/mapcore.js DISTRICTS)
// the street lines (tiles): the city's avenues round it - Gallery Avenue, Westside Avenue, Greenfield Avenue - and its own
export const PY = { blvd: 2200, rose: 2250, back: 2275, side: 2370, green: 2400 };
export const PX = { gallery: 2560, bridge: 2681, westside: 2860, blind: 2622 };
const BLVD_W = 13, MEDIAN = 96;
// the Mile: from the Westport Bridge's foot (its own line runs on west over the water) to Westside Avenue at Crosstown
// Avenue (which carries on east along the Strip's south edge); a gentle curve south through the middle
export const MILE = [[2547, 2321], [2575, 2324], [2610, 2330], [2650, 2334], [2690, 2336], [2730, 2334], [2770, 2328], [2805, 2318], [2835, 2308], [2860, 2300]];
// Neon Boulevard from the Arts Bridge (bending off the water's edge at the bridge's foot) to Westside Avenue, where the
// Strip's carries it on
export const NEONB = [[2682, 2208], [2730, 2203], [2790, 2200], [2860, 2200]];
const SIDE_W = 7;   // Sideshow Street: a lane, two-way, no parking
const yOn = (P, x) => { for (let j = 1; j < P.length; j++) if (x <= P[j][0]) { const [ax, ay] = P[j - 1], [bx, by] = P[j]; return ay + (by - ay) * (x - ax) / (bx - ax); } return P[P.length - 1][1]; };
export const mileY = (x) => yOn(MILE, x);
const neonY = (x) => yOn(NEONB, x);
// (how far a street's pavement reaches from its centre line, tiles: the Pink Mile's pavements are three tiles -
// shared/roads.js SIDEWALK commercial)
const EXT = { blvd: 9, st: 6, lane: 6, ave: 7, alley: 1 };

function streets() {
  return [
    { name: 'Pink Mile Boulevard', kind: 'blvd', pts: MILE, w: BLVD_W, median: MEDIAN },
    { name: 'Neon Boulevard', kind: 'blvd', pts: NEONB, w: BLVD_W, median: MEDIAN },
    { name: 'Bridge Street', kind: 'st', pts: [[PX.bridge, 2241], [PX.bridge, PY.green]] },   // (from the Arts Bridge's end: its own line runs on north over the water)
    { name: 'Rose Street', kind: 'st', pts: [[PX.bridge, PY.rose], [PX.westside, PY.rose]] },
    { name: 'Rose Alley', kind: 'alley', pts: [[PX.bridge, PY.back], [PX.westside, PY.back]] },
    { name: 'Sideshow Street', kind: 'st', w: SIDE_W, pts: [[PX.gallery, PY.side], [PX.bridge, PY.side]] },
    { name: 'Blind Alley', kind: 'alley', culdesac: true, pts: [[PX.blind, PY.side], [PX.blind, 2349]] },
  ];
}

export const PINKMILE = {
  key: 'pinkmile', d: D, rect: [2560, 2120, 2860, 2400],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Pink Mile: placeSpecials leaves them;
  // the burlesque lounge it named is The Garter Room here)
  specials: ['Pink Moon Lounge', 'The Pink Pussycat Lounge', 'Hourly Hearts Motel'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The looks: the motels' pastel stucco and doors; the lounges' dark walls for the neon to stand out on; Sideshow
// Street's grimy brick and render
const PASTEL = ['#ec9cb8', '#f2c4a2', '#a6dcc6', '#c6b0e6', '#f2e2c2', '#a8cce8', '#f3a08c', '#f2d27e'];
const DOORS = ['#2e8a8a', '#c8343a', '#2a5aa0', '#e0b030', '#3a9a5a', '#c04a8a', '#e8e4dc'];
const weighted = (L) => { const W = L.reduce((a, q) => a + q[0], 0); return (r) => { let v = r * W; for (const q of L) { v -= q[0]; if (v <= 0) return q[1]; } return L[0][1]; }; };
const dark = weighted([[3, { style: 'stucco', wallColor: '#3e2440' }], [3, { style: 'stucco', wallColor: '#4a2232' }], [2, { style: 'brickDark' }], [2, { style: 'concrete', wallColor: '#2e2836' }],
  [2, { style: 'stucco', wallColor: '#5a2a4a' }], [1, { style: 'glass' }], [2, { style: 'brick', brickTone: '#5a2e3a' }], [1, { style: 'stucco', wallColor: '#24404a' }]]);
const rough = weighted([[3, { style: 'brick', brickTone: '#6e3a2e' }], [2, { style: 'brickDark' }], [2, { style: 'concrete', wallColor: '#5e5852' }], [2, { style: 'stucco', wallColor: '#8a7a6a' }],
  [1, { style: 'corrugated', wallColor: '#5a6068' }], [1, { style: 'brick', brickTone: '#7a4a3a' }], [1, { style: 'stucco', wallColor: '#6a5a6a' }]]);
const pastel = (r) => ({ style: 'stucco', wallColor: PASTEL[Math.floor(r * PASTEL.length) % PASTEL.length] });
const WINS = ['even', 'pair', 'triple', 'tall', 'even', 'pair', 'bay'];

// the rest of the Mile's names (never the same twice): [name, storefront kind, neon kind, blade]
const BARS = [['Velvet Lounge', 'bar', 'lounge', 'LOUNGE'], ['Satin & Smoke', 'bar', 'lounge', 'JAZZ'], ['The Blue Room', 'bar', 'lounge', null], ['Moonshine Bar', 'bar', 'bar', 'BAR'],
  ['Midnight Rose', 'bar', 'lounge', null], ['Lucky Seven', 'bar', 'bar', 'SLOTS'], ['The Rhinestone', 'bar', 'lounge', 'LIVE'], ['Cherry Lane Bar', 'bar', 'bar', null], ['The Tiki Hut', 'bar', 'bar', 'TIKI'],
  ['Highball', 'bar', 'bar', 'BAR'], ['The Starlight Room', 'bar', 'lounge', 'JAZZ'], ['Pink Elephant', 'bar', 'bar', null]];
const FOOD = [['Red Lantern Ramen', 'diner', 'diner', 'RAMEN'], ['Neon Taco', 'diner', 'diner', null], ['Midnight Pizza', 'diner', 'diner', 'PIZZA'], ['Donut Moon', 'cafe', 'diner', null],
  ['Pho Mile', 'diner', 'diner', 'PHO'], ['Waffle Palace', 'diner', 'diner', 'OPEN 24'], ['Hot Dog Heaven', 'diner', 'diner', null], ['Boba Bliss', 'cafe', 'diner', 'TEA'], ['Late Night Wok', 'diner', 'diner', 'NOODLE']];
const SHOPS = [['Wigs & Whims', 'salon', 'bar', null], ['Glitter & Glam', 'clothes', 'bar', null], ['Mile Smoke Shop', 'liquor', 'mart', null], ['Starlet Nails', 'salon', 'bar', null], ['Quick Cash', 'lobby', 'mart', 'CASH'],
  ['Suds & Spins', 'laundry', 'mart', null], ['Showtime Costumes', 'clothes', 'bar', null], ['Mile Market', 'mart', 'mart', 'OPEN'], ['Lucky Phones', 'mart', 'mart', null], ['Velvet Vintage', 'clothes', 'bar', null]];
const SIGNS_ROUGH = [['#1e2a1e', [240, 220, 80]], ['#e8c040', [40, 40, 50]], ['#8a2a2e', [250, 230, 190]], ['#e8e4dc', [180, 40, 46]], ['#2a2c38', [236, 206, 120]], ['#2f6a4e', [240, 232, 200]]];
const SIDESHOW = [['Gold Tooth Pawn', 'pawn'], ['Cash 4 Gold', 'pawn'], ['Bail Bonds 24/7', 'lobby'], ['Sideshow Tattoo', 'salon'], ['Lucky Liquor', 'liquor'], ['Check Cashing', 'lobby'], ['Second Chance Thrift', 'clothes'],
  ['Payday Loans', 'lobby'], ['Discount Smokes', 'liquor'], ['Mile Hardware', 'mart'], ['Wash & Fold', 'laundry'], ['Video Express', 'records']];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const poi0 = m.pois.length;
  const out = { homes: 0, shops: 0, clubs: 0, motels: 0, pools: 0 };
  const used = new Set();
  let lastWin = null, ci = 0;
  const biz = (list, x, y, k) => { for (let t = 0; t < 30; t++) { const q = list[Math.floor(rnd(x + t, y, k) * list.length) % list.length]; if (!used.has(q[0])) { used.add(q[0]); return q; } } return null; };
  const place = (L) => { const b = K.building(L); if (b) { if (L.home) out.homes++; if (L.poi) out.shops++; } return b; };
  const tiles = (x, y) => m.tiles[y * m.w + x];

  // ---- a lit front: its walls, its storefront, its neon (b.art.neon: client/art2/neonsigns.js handNeon) ----------
  //   o.look: 'dark' (the lounges, the default), 'pastel' (the Mile's daytime colours), 'rough' (Sideshow Street)
  const lit = (x, y, w, o) => {
    const look = o.look || 'dark';
    const f = o.face || (look === 'pastel' ? pastel(rnd(x, y, 30)) : look === 'rough' ? rough(rnd(x, y, 30)) : dark(rnd(x, y, 30)));
    const floors = o.floors ?? 2 + Math.floor(rnd(x, y, 31) * 2);
    let win = o.win || pick(WINS, rnd(x, y, 32));
    if (win === lastWin) win = win === 'even' ? 'pair' : 'even';
    lastWin = win;
    const side = o.doorSide || (rnd(x, y, 33) < 0.5 ? 'left' : 'right');
    const col = o.col ?? (ci++ * 3 + Math.floor(rnd(x, y, 34) * 7)) % 7;
    const spec = { floors, ...f, win, parapet: 8 + Math.floor(rnd(x, y, 35) * 6), grime: o.grime ?? (look === 'rough' ? 0.45 : 0.15) + rnd(x, y, 36) * 0.2, roofMat: pick(['tar', 'rubber', 'membrane', 'gravel'], rnd(x, y, 37)), lip: 10, rimW: 4, blades: [], garden: !!o.garden };
    if (o.cornice) spec.cornice = o.cornice;
    if (o.mural) spec.mural = { x: 8, w: w * TILE - 16, h: Math.min(floors * 56 - 30, 150), kind: o.mural };
    if (look === 'rough') { spec.graffiti = o.graffiti ?? 1 + Math.floor(rnd(x, y, 42) * 3); if (o.boarded) spec.boarded = o.boarded; if (o.tag) spec.tagText = o.tag; }
    if (o.icon) spec.neon = { icon: o.icon, col: o.iconCol || [255, 80, 160], x: o.iconX ?? Math.round(w * TILE / 2) - 14 };
    if (o.trim) spec.trim = o.trim;
    if (floors >= 3 && w >= 8 && rnd(x, y, 38) < 0.3) spec.fireEscape = [Math.max(8, Math.round(w * TILE * 0.5) - 25), 50];
    const shop = { kind: o.store || 'bar', door: side, open: !o.closed, people: o.closed ? 0 : o.people ?? 1 + Math.floor(rnd(x, y, 39) * 3), sign: o.shopSign || null,
      awning: o.awning !== undefined ? o.awning : rnd(x, y, 40) < 0.4 ? (look === 'pastel' ? [pick(DOORS, rnd(x, y, 43)), '#f0ece4'] : ['#1e1a2a', '#1e1a2a']) : null };
    if (o.grille) shop.grille = true;
    if (o.band) shop.band = o.band;
    if (o.neon === false) spec.plaques = [];   // (no stock neon plaques on a front without its own)
    const neon = o.neon === false ? null : { name: o.sign ?? o.name, kind: o.neon || 'bar', col, ...(o.pic ? { pic: o.pic } : {}), ...(o.blade ? { blade: o.blade } : {}), ...(o.picV ? { picV: o.picV } : {}), ...(o.picCol ? { picCol: o.picCol } : {}) };
    const st = shop.kind, food = st === 'cafe' || st === 'diner';
    let poi = o.poi === undefined ? (food ? { kind: 'coffee', label: o.name, food: st === 'diner' } : { kind: 'delivery', label: o.name }) : o.poi;
    if (poi && poi.kind === 'delivery' && o.walk && !o.key) poi = { ...poi, walk: true, store: st };
    const home = o.home !== undefined ? o.home : floors >= 3 && w >= 6 && rnd(x, y, 41) < 0.45 ? { kind: 'apartment' } : null;
    const art = { spec, shop, ...(neon ? { neon } : {}), ...(o.kit ? { kit: o.kit } : {}) };
    return { arch: o.arch || 'nightrow', ...(o.key ? { key: o.key } : food ? { key: 'rest2' } : {}), art, name: o.name, poi, ...(home ? { home } : {}), door: side === 'left' ? x : x + w - 1, whole: true };
  };
  // a back facing a street to its north (its front unseen): one or two floors, a sign standing on its roof over that
  // street (the kit's 'neon|WORD|colour' at the roof's north edge), the AC and vents round it
  const back = (x, y, w, o = {}) => {
    const f = o.look === 'rough' ? rough(rnd(x, y, 50)) : dark(rnd(x, y, 50)), floors = o.floors ?? (rnd(x, y, 51) < 0.55 ? 2 : 1);
    const words = o.words || ['MOTEL', 'BAR', 'LOUNGE', 'COCKTAILS', 'LIVE', 'CABARET', 'TATTOO', 'PAWN', 'OPEN 24', 'KARAOKE', 'XOXO', 'HOTEL', 'DANCE', 'LIQUOR', 'BURLESQUE'];
    const kit = [];
    if (w >= 6 && rnd(x, y, 52) < 0.7) kit.push([`neon|${pick(words, rnd(x, y, 53))}|${Math.floor(rnd(x, y, 54) * 7)}`, Math.round(w * TILE / 2), 12]);
    kit.push(['ac', Math.round(w * TILE * 0.3), 80], ['vent', Math.round(w * TILE * 0.7), 120], ['acs', Math.round(w * TILE * 0.5), 160]);
    if (rnd(x, y, 55) < 0.4) kit.push(['dish', Math.round(w * TILE * 0.8), 60]);
    return { arch: 'nightrow', art: { spec: { floors, ...f, win: pick(WINS, rnd(x, y, 56)), parapet: 8, grime: o.look === 'rough' ? 0.5 : 0.3, roofMat: 'tar', lip: 10, rimW: 4, blades: [], ...(o.look === 'rough' ? { graffiti: 1 } : {}) }, noShop: true, kit }, name: o.name || null, home: rnd(x, y, 57) < 0.5 ? { kind: 'apartment' } : null, whole: true };
  };
  // a row of lit fronts facing south along [x0, x1) in the band [y0, y1]: `list` first, then the mix of `cats`
  const litRow = (x0, x1, y0, y1, list = [], o = {}) => {
    let k = 0;
    const depth = o.depth || 14;
    return K.row(x0, x1, y0, y1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      const L = k < list.length ? list[k++] : null;
      if (L) {
        if (L.gap) return { gap: Math.min(room, L.gap), kind: L.kind || 'passage' };
        if (L.name) used.add(L.name);
        const w = Math.min(room, L.w);
        if (L.lot) return { w, depth: L.depth || depth, ...L.lot };
        return { w, depth: L.depth || depth, ...lit(x, y1, w, { floors: o.floors, look: o.look, ...L }) };
      }
      const r = rnd(x, y1, 60);
      if (r < 0.06 && o.passages !== false) return { gap: 2 + Math.floor(rnd(x, y1, 61) * 2), kind: 'passage' };
      const cats = o.cats || [['bar', 0.45], ['food', 0.75], ['shop', 1]];
      const cat = cats.find((c) => r < c[1])[0];
      const q = biz(cat === 'bar' ? BARS : cat === 'food' ? FOOD : SHOPS, x, y1, 62);
      const w = Math.min(room, 6 + Math.floor(rnd(x, y1, 65) * 4));
      if (!q) return { gap: Math.min(room, 4), kind: 'garden' };
      return { w, depth, ...lit(x, y1, w, { name: q[0], store: q[1], neon: q[2], blade: rnd(x, y1, 66) < 0.5 ? q[3] : null, floors: o.floors, look: o.look, walk: q[1] !== 'bar' && q[1] !== 'diner' && q[1] !== 'cafe' }) };
    }, o);
  };
  // a row of backs facing a street to the north (their fronts unseen), against the band's north edge
  const backRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    if (rnd(x, y0, 70) < 0.1) return { gap: Math.min(room, 4 + Math.floor(rnd(x, y0, 71) * 3)), kind: 'yard' };
    const w = room <= 12 ? room : Math.min(room, 7 + Math.floor(rnd(x, y0, 72) * 6));
    return { w, depth: o.depth || Math.min(y1 - y0 + 1, 10 + Math.floor(rnd(x, y0, 73) * 3)), ...back(x, y0, w, o), face: 'N' };
  }, { north: true, rough: o.look === 'rough' });
  // the free extent of a lot [x, x + w) in the band [y0, y1]: its front (the northmost of its columns' southmost free
  // tiles: where a front stepping back along the curve stands) and its top (the band's northmost free row there)
  const lotBox = (x, w, y0, y1, mask = null) => {
    let front = y1, top = y0;
    for (let xx = x; xx < x + w; xx++) { const c = K.column(xx, y0, y1, mask); if (!c) return null; front = Math.min(front, c[0]); top = Math.max(top, c[1]); }
    return front - top + 1 >= 8 ? { front, top } : null;
  };

  // ---- a motel facing south onto the street below it: its two-storey bar of rooms at the back (the gallery along
  // the upper floor, the stair at one end, a door, a window and an AC box to every room), the office at the front
  // corner (VACANCY lit in its window), the pool in the court between (its deck, loungers, umbrellas, a ring float, a
  // diving board), the cars nosed in under the rooms, the tall sign at the pavement; a room to rent (a home) ---------
  const motel = (x, w, y0, y1, o) => {
    const box = lotBox(x, w, y0, y1, northOfMile);
    if (!box) return null;
    const { front } = box, deep = front - box.top + 1;
    if (deep < 22) return null;
    const court = Math.min(o.court || 10, deep - 18), wall = o.wall || pick(PASTEL, rnd(x, front, 80)), door = o.door || pick(DOORS, rnd(x, front, 81));
    const barH = 8, park = 4, frontage = 3;
    const yBar = front - frontage - court - park - barH + 1, yPark = yBar + barH, yCourt = yPark + park, yFront = yCourt + court;
    const officeW = 8, officeLeft = o.office === 'left' || (o.office !== 'right' && rnd(x, front, 82) < 0.5);
    // the bar of rooms
    const rooms = Math.max(2, Math.floor((w * TILE - 48) / 96));
    const bar = handBld({ x, y: yBar, w, h: barH, arch: 'hotel', name: `${o.name} Rooms`, whole: true, poi: false,
      art: { spec: { floors: 2, style: 'stucco', wallColor: wall, parapet: 8, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.08 + rnd(x, front, 83) * 0.1, balconies: false, motel: { room: 96, door, stair: officeLeft ? 'right' : 'left' }, blades: [] }, noShop: true, neon: { name: null, col: o.col ?? (ci++ * 3) % 7 },
        kit: roomKit(w, rooms, x + front) },
      home: { kind: 'apartment', name: `Room ${1 + Math.floor(rnd(x, front, 84) * rooms) + (rnd(x, front, 85) < 0.5 ? 10 : 0)}, ${o.name}`, price: o.price || 6500, slots: 1, garage: { x: (x + w * 0.5) * TILE, y: (yPark + 2) * TILE, a: -Math.PI / 2 } } });
    if (!bar) return null;
    out.homes++;
    // (a deep lot: a second bar of rooms behind, a storey taller, the lane between them)
    let yTop = yBar;
    if (o.back !== false && yBar - box.top >= 15) {
      const yB2 = yBar - 3 - barH;
      const b2 = handBld({ x: x + 2, y: yB2, w: w - 4, h: barH, arch: 'hotel', name: `${o.name} Rooms`, whole: true, poi: false, door: null,
        art: { spec: { floors: 3, style: 'stucco', wallColor: o.wall2 || wall, parapet: 8, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.12, balconies: false, motel: { room: 96, door, stair: officeLeft ? 'left' : 'right' }, blades: [] }, noShop: true, neon: { name: null, col: (ci++ * 3) % 7 },
          kit: roomKit(w - 4, rooms, x + front + 1) } });
      if (b2) { K.fill(x, yB2 + barH, w, 3, T.LOT); K.take(x, yB2 + barH, w, 3); yTop = yB2; }
    }
    // the office at the front corner, the drive beside it
    const ox = officeLeft ? x + 1 : x + w - officeW - 1, oy = yFront - 7;
    const office = handBld({ x: ox, y: oy, w: officeW, h: 7, arch: 'hotel', key: o.key || 'hotel', name: o.name, whole: true, poi: { kind: 'delivery', label: o.name },
      art: { spec: { floors: 1, style: 'stucco', wallColor: o.officeWall || wall, parapet: 16, roofMat: 'membrane', lip: 6, rimW: 4, grime: 0.08, blades: [],
        plaques: [{ text: 'VACANCY', x: officeLeft ? 8 : officeW * TILE - 92, v: 64, sx: 2, bg: '#1a1420', fg: [255, 70, 110], lit: true }] },
      shop: { kind: 'lobby', door: officeLeft ? 'right' : 'left', open: true, people: 1, sign: { text: 'OFFICE', bg: '#1a1420', fg: [120, 230, 255], lit: true }, awning: [door, '#f0ece4'] },
      kit: [['ac', 60, 60], ['vent', 150, 80], ['acs', 190, 150], ['tank', 70, 160]] } });
    if (office) out.shops++;
    // the lot: the parking strip, the paved court and drive, the frontage's lawn
    K.fill(x, yPark, w, park, T.LOT);
    K.fill(x, yCourt, w, court, T.PLAZA);
    K.fill(x, yFront, w, front - yFront + 1, T.GRASS);
    K.take(x, yBar, w, front - yBar + 1);
    // the pool in the court (o.kidney: a bean, its west end the deep end, cut from the rect by the tiles)
    const pw = Math.min(o.poolW || 12, w - officeW - 8), ph = Math.min(o.poolH || 4, court - 3), px0 = officeLeft ? x + officeW + 3 + Math.floor((w - officeW - 4 - pw) / 2) : x + 1 + Math.floor((w - officeW - 4 - pw) / 2), py0 = yCourt + Math.floor((court - ph) / 2);
    if (pw >= 6 && ph >= 3) {
      let nW = 0;
      for (let yy = py0; yy < py0 + ph; yy++) for (let xx = px0; xx < px0 + pw; xx++) {
        if (o.kidney) {
          // (a bean: two lobes, the waist pinched in from the north)
          const u = (xx - px0 + 0.5) / pw, v = (yy - py0 + 0.5) / ph, lobe = Math.min(Math.hypot((u - 0.28) / 0.3, (v - 0.55) / 0.48), Math.hypot((u - 0.72) / 0.3, (v - 0.5) / 0.52)), waist = v < 0.32 && Math.abs(u - 0.5) < 0.12;
          if (lobe > 1 || waist) continue;
        }
        m.set(xx, yy, T.WATER); nW++;
      }
      if (nW) {
        (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
        out.pools++;
        for (let k = 0; k < Math.floor(pw / 3); k++) prop('lounger', px0 + 1 + k * 3, py0 - 0.9, 0, { v: k + Math.floor(rnd(x, k, 86) * 4), a: Math.PI / 2 });
        prop(rnd(x, front, 87) < 0.5 ? 'umbrella_r' : 'umbrella_b', px0 + 2, py0 + ph + 0.8, 0);
        prop(pick(['umbrella_y', 'umbrella_g', 'umbrella_r'], rnd(x, front, 88)), px0 + pw - 2, py0 + ph + 0.8, 0);
        prop('ringfloat', px0 + pw * 0.62, py0 + ph * 0.5, 0, { v: Math.floor(rnd(x, front, 89) * 3) });
        if (!o.kidney) prop('diveboard', px0 + 0.4, py0 + ph / 2, 0, { len: 40, a: 0 });
        if (o.tub) prop('hottub', px0 + pw + 2, py0 + 1.2, 0, { r: 26 });
      }
    }
    // the cars nosed in under the rooms, the stalls painted
    for (let qx = x + 1; qx + 3 <= x + w - 1; qx += 3) { m.stalls.push({ x: qx * TILE, y: yPark * TILE, w: 3 * TILE, h: park * TILE }); if (rnd(qx, front, 90) < 0.55) m.parking.push({ x: (qx + 1.5) * TILE, y: (yPark + 2) * TILE, a: -Math.PI / 2 }); }
    // the frontage: palms on the lawn, the tall sign at the pavement on the drive's side, lamps
    const sx = officeLeft ? x + officeW + 2 : x + w - officeW - 3;
    for (let px = x + 2; px < x + w - 1; px += 7) if (Math.abs(px - sx) > 2) prop('palm_a', px + 0.5, front - 0.8, 10, { sp: rnd(px, front, 91) < 0.6 ? 'royal' : 'coconut', k: 1.1 + rnd(px, front, 92) * 0.25 });
    prop('motelsign', sx + 0.5, front - 0.4, 10, { text: o.sign || o.name.replace(/ (Motel|Motor Inn|Motor Lodge|Inn)$/, ''), col: o.signCol ?? (ci * 2) % 7, z: o.signZ || 104, word: o.word || 'MOTEL' });
    prop('lamp', x + 0.8, yCourt + 0.6, 0); prop('lamp', x + w - 0.8, yCourt + 0.6, 0);
    if (rnd(x, front, 93) < 0.6) prop('vend_cola', officeLeft ? ox + officeW + 0.6 : ox - 0.6, oy + 6.4, 8);
    prop(pick(['dump_g', 'dump_b'], rnd(x, front, 94)), officeLeft ? x + w - 1.5 : x + 1.5, yPark + 0.8, 12);
    out.motels++;
    (out.places ||= []).push({ name: o.name, x0: x, y0: yTop, x1: x + w, y1: front + 1 });
    return { bar, office, yBar: yTop, front };
  };
  const handBld = (o) => K.building(o);
  // the bands' edges: the first free row either side of each street (tiles)
  const roseN = PY.rose - EXT.st - 1, roseS = PY.rose + EXT.st + 1;              // 2243, 2257
  const alleyN = PY.back - EXT.alley - 1, alleyS = PY.back + EXT.alley + 1;      // 2273, 2277
  const sideN = PY.side - EXT.lane - 1, sideS = PY.side + EXT.lane + 1, greenN = PY.green - EXT.ave - 1;   // 2363, 2377, 2392
  // a bar of rooms' roof: a vent over every room's bathroom along the back, the odd AC unit, the water heater
  const roomKit = (w, rooms, k) => {
    const kit = [], W = w * TILE, step = (W - 48) / rooms;
    for (let i = 0; i < rooms; i++) { const x = Math.round(24 + (i + 0.5) * step); kit.push(['vent', x, 40]); if (rnd(i, k, 79) < 0.35) kit.push(['ac', x + 20, 150]); }
    kit.push(['tank', W - 60, 90]);
    if (rnd(k, 3, 79) < 0.5) kit.push(['dish', 70, 170]);
    return kit;
  };
  // (the Mile curves: a band along it stops at its pavement, column by column)
  const mileN = (x) => Math.floor(mileY(x)) - EXT.blvd - 1, mileS = (x) => Math.ceil(mileY(x)) + EXT.blvd + 1;
  const northOfMile = (x, y) => y <= mileN(x), southOfMile = (x, y) => y >= mileS(x);

  // ===========================================================================================================
  // Under the Loop: the deck's ground (its LOT, before the plan lays any lot of its own) between Rose Street and
  // Greenfield Avenue - the taxi rank by the Mile, the car park up and down it
  {
    let stalls = 0, taxis = 0;
    for (let y = roseS + 1; y < greenN; y += 9) {
      // the deck's ground on this row: the run of LOT tiles in the district
      let a = -1, b = -1;
      for (let x = 2700; x < 2800; x++) if (tiles(x, y) === T.LOT && m.dist[y * m.w + x] === D) { if (a < 0) a = x; b = x; }
      if (a < 0 || b - a < 6) continue;
      const nearMile = Math.abs(y - mileY((a + b) / 2)) < 16;
      if (nearMile && taxis < 4) { for (let k = 0; k < 2 && taxis < 4; k++) { m.parking.push({ x: (a + 2 + k * 4) * TILE, y: (y + 1) * TILE, a: 0, model: 'taxi' }); taxis++; } prop('textsign', a + 1, y - 0.6, 0, { text: 'TAXI', bg: '#e0b030', fg: [30, 30, 30], z: 30, sx: 2 }); continue; }
      for (let sx = a + 1; sx + 3 <= b; sx += 3) { m.stalls.push({ x: sx * TILE, y: y * TILE, w: 3 * TILE, h: 4 * TILE }); if (rnd(sx, y, 104) < 0.5) m.parking.push({ x: (sx + 1.5) * TILE, y: (y + 2) * TILE, a: -Math.PI / 2 }); stalls++; }
    }
    out.stalls = stalls; out.taxis = taxis;
  }

  // ===========================================================================================================
  // The waterfront east of the Gulf Loop (WC046): the promenade along the shore, the jetty under the overpass with the
  // boats tied up, Siren Square, the lit row on Neon Boulevard's north side
  const blvdN = (x) => Math.floor(neonY(x)) - EXT.blvd - 1;   // the row's front on the boulevard's north side
  {
    const x0 = 2788, x1 = PX.westside - EXT.ave;
    // the promenade: three tiles back from the water, every column
    for (let x = x0; x < x1; x++) {
      let y = 2140;
      while (y < 2200 && !m.land[y * m.w + x]) y++;
      if (blvdN(x) - y < 3) continue;
      K.fill(x, y, 1, 3, T.PLAZA);
      if (x % 3 === 0) prop('rail', x, y + 0.2, 0, { tx: 3 * TILE, ty: 0 });
      if (x % 9 === 4) prop('lamp', x + 0.5, y + 1.2, 0);
      if (x % 11 === 7) prop('bench_m', x + 0.5, y + 2, 0);
    }
    // the jetty: north from the shore beside the overpass, the boats along its east side
    const jx = 2792;
    let y = 2140;
    while (y < 2200 && !m.land[y * m.w + jx]) y++;
    for (let i = 1; i <= 15; i++) for (let o = -1; o <= 1; o++) { const t = m.tileAt(jx + o, y - i); if (t === T.WATER || t === T.DEEP) m.set(jx + o, y - i, T.DOCK); }
    for (let i = 3; i < 14; i += 4) m.marina.push({ x: (jx + 3.4) * TILE, y: (y - i) * TILE, a: -Math.PI / 2, kind: i === 7 ? 'dinghy' : 'speedboat' });
    m.marina.push({ x: (jx - 3) * TILE, y: (y - 11) * TILE, a: Math.PI / 2, kind: 'jetski' });
    prop('lamp', jx + 1.6, y - 14, 0); prop('lifering', jx - 1.4, y - 6, 0);
    prop('textsign', jx + 0.5, y + 1.4, 0, { text: 'SIREN DOCK', bg: '#1a1420', fg: [255, 110, 190], z: 34, sx: 2 });
    // the lit row on the boulevard, Siren Square in the middle of it (a cherry tree, the statue, lights strung over it)
    const wf = litRow(2798, x1, 2150, blvdN(2830), [
      { w: 7, name: 'Siren Bait & Tackle', store: 'mart', neon: false, floors: 2, poi: { kind: 'tackle', label: 'Siren Bait & Tackle' }, shopSign: { text: 'BAIT & TACKLE', bg: '#2e6a8a', fg: [250, 240, 200], lit: true }, awning: ['#2e6a8a', '#f0ece4'], look: 'pastel' },
      { w: 9, name: 'The Salty Siren', store: 'diner', neon: 'bar', sign: 'SALTY SIREN', blade: 'FISH', floors: 3, poi: { kind: 'coffee', label: 'The Salty Siren', food: true } },
      { w: 9, name: 'Lace & Satin', store: 'clothes', neon: 'bar', sign: 'LACE & SATIN', floors: 4, poi: { kind: 'clothing', label: 'Lace & Satin' }, pic: 'heart', picCol: [255, 90, 170] },
      { gap: 7, kind: 'plaza' },
      { w: 14, lot: clubLot('club', 'Starlet Club', 4, 'club', 'lucy', 'SHOWGIRL'), depth: 34 },
      { w: 9, name: 'Red Lantern Ramen', store: 'diner', neon: 'bar', sign: 'RED LANTERN', blade: 'RAMEN', floors: 3 },
    ], { depth: 34, floors: 3, passages: false });
    // Siren Square: the gap the row left (a cherry tree, a statue, lights strung across it, benches)
    const sq = wf.find((q) => q.gap === 'plaza' && q.w >= 6);
    if (sq) {
      const { x, y, w, h } = sq, cx = x + w / 2, yy = y + h - 1;
      prop('tree_a', cx, y + Math.max(2, h - 9), 10, { sp: 'cherry', k: 1.25 });
      prop('statue', cx, yy - 2.5, 20);
      prop('festoon', x + 0.6, y + 1, 0, { tx: Math.round((w - 1.2) * TILE), ty: Math.round((h - 3) * TILE), h: 60 });
      prop('festoon', x + w - 0.6, y + 1, 0, { tx: Math.round(-(w - 1.2) * TILE), ty: Math.round((h - 3) * TILE), h: 60 });
      prop('bench_m', x + 1.5, yy - 1, 0); prop('bench_m', x + w - 1.5, yy - 1, 0);
      (out.places ||= []).push({ name: 'Siren Square', x0: x, y0: y, x1: x + w, y1: yy + 1 });
    }
  }
  // west of the deck the boulevard runs along the water's edge: the rail, palms and lamps on the strip
  for (let x = PX.bridge + 3; x < 2770; x++) {
    let y = 2170;
    while (y < 2215 && !m.land[y * m.w + x]) y++;
    const yN = Math.floor(neonY(x)) - EXT.blvd - 1;
    if (yN - y < 0) continue;
    K.fill(x, y, 1, yN - y + 1, T.PLAZA);
    if (x % 3 === 0) prop('rail', x, y + 0.2, 0, { tx: 3 * TILE, ty: 0 });
    if (x % 10 === 5 && yN - y >= 2) prop('palm_a', x + 0.5, y + 1.5, 10, { sp: 'royal', k: 1.15 });
    if (x % 10 === 0) prop('lamp', x + 0.5, y + 0.8, 0);
  }

  // ===========================================================================================================
  // Between Neon Boulevard and Rose Street: the lit row facing Rose Street (its rooftop signs over the boulevard),
  // the two hotels - Hotel Rosa west of the deck, Hotel Paloma east of it - only the water behind them
  const hotelKit = (w) => [['neon|HOTEL|0', Math.round(w * TILE / 2), 14], ['palm', 50, 70], ['palm', w * TILE - 50, 70], ['lounge', 90, 120], ['lounge', 140, 120], ['umb', 200, 130], ['string', Math.round(w * TILE / 2), 100], ['ac', 60, 220], ['ac', w * TILE - 70, 240]];
  litRow(PX.bridge + EXT.st + 1, 2775, 2205, roseN, [
    { w: 14, name: 'Hotel Rosa', store: 'lobby', neon: 'hotel', blade: 'HOTEL', pic: 'heart', picV: 150, floors: 5, key: 'hotel', poi: { kind: 'delivery', label: 'Hotel Rosa' }, kit: hotelKit(14), home: { kind: 'apartment', price: 14000 } },
    { w: 10, name: 'Midnight Rose', store: 'bar', neon: 'lounge', pic: 'rose', floors: 3 },
    { w: 9, name: 'Mile Liquors', store: 'liquor', neon: 'mart', sign: 'LIQUOR', floors: 2, poi: { kind: 'convenience', label: 'Mile Liquors' } },
    { w: 10, name: 'Moonshine Bar', store: 'bar', neon: 'bar', pic: 'moon', blade: 'BAR', floors: 3 },
    { w: 12, name: 'Shaker & Twist', store: 'bar', neon: 'bar', pic: 'martini', blade: 'COCKTAIL', floors: 3, garden: true, kit: [['string', 120, 60], ['umb', 80, 120], ['umb', 200, 120], ['table', 140, 150], ['table', 260, 90], ['plant', 40, 40], ['lounge', 300, 200]] },
  ], { depth: 34, floors: 3 });
  litRow(2787, PX.westside - EXT.ave, 2205, roseN, [
    { w: 14, name: 'Hotel Paloma', store: 'lobby', neon: 'hotel', blade: 'HOTEL', pic: 'palm', picV: 140, floors: 5, key: 'hotel', poi: { kind: 'delivery', label: 'Hotel Paloma' }, kit: hotelKit(14), home: { kind: 'apartment', price: 14000 }, look: 'pastel', face: { style: 'stucco', wallColor: '#e8c8b0' } },
    { w: 12, lot: clubLot('club', 'Club Paradiso', 3, 'club', 'palm', 'DANCE'), depth: 34 },
    { w: 10, name: 'Satin & Smoke', store: 'bar', neon: 'lounge', blade: 'JAZZ', floors: 3, garden: true },
  ], { depth: 34, floors: 3 });

  // ===========================================================================================================
  // Between Rose Street and the Mile: the backs on Rose Street (their rooftop signs over it), Rose Alley, the motels
  // and lounges facing the Mile - the Hourly Hearts Motel round its kidney pool west of the deck, the lounges east of it
  backRow(PX.bridge + EXT.st + 1, 2762, roseS, alleyN);
  backRow(2768, PX.westside - EXT.ave, roseS, alleyN);
  {
    const hh = motel(PX.bridge + EXT.st + 1, 42, alleyS, mileN(2700), { name: 'Hourly Hearts Motel', sign: 'HOURLY HEARTS', court: 16, poolW: 16, poolH: 8, kidney: true, tub: true, wall: '#f2b8c8', door: '#c04a8a', office: 'left', price: 5000, signCol: 2, signZ: 118, key: 'hotel' });
    // (its back lot on Rose Alley: the bins, the laundry's carts, a van)
    if (hh) {
      const y0 = alleyS, y1 = hh.yBar - 1, x0 = PX.bridge + EXT.st + 1;
      if (y1 - y0 >= 3) { K.fill(x0, y0, 42, y1 - y0 + 1, T.LOT); K.take(x0, y0, 42, y1 - y0 + 1); for (const [dx, t] of [[3, 'dump_g'], [6, 'dump_b'], [10, 'bags'], [30, 'pallet_s'], [36, 'trashcan']]) prop(t, x0 + dx, y0 + 1.2, 10); m.parking.push({ x: (x0 + 20) * TILE, y: (y0 + 2) * TILE, a: 0, drive: true }); }
    }
  }
  motel(2760, 30, alleyS, mileN(2760), { name: 'Moonglow Motel', office: 'right', court: 10, price: 6000, wall: '#c6b0e6', door: '#e0b030' });
  litRow(2790, PX.westside - EXT.ave, alleyS, mileN(2790), [
    { w: 16, lot: clubLot('clubeclipse', 'Pink Moon Lounge', 3, 'lounge', 'moon', 'LOUNGE'), depth: 30 },
    { w: 10, name: 'Velvet Lounge', store: 'bar', neon: 'lounge', blade: 'LOUNGE', floors: 3, garden: true },
    { w: 14, lot: clubLot('club', 'The Garter Room', 3, 'club', 'kiss', 'CABARET'), depth: 30 },
    { w: 10, name: 'The Martini Moon', store: 'bar', neon: 'bar', pic: 'martini', blade: 'COCKTAIL', floors: 3 },
    { w: 10, name: 'The Coffee Cup', store: 'diner', neon: 'bar', sign: 'COFFEE CUP', blade: 'OPEN 24', floors: 2, icon: 'cup', iconCol: [255, 70, 70], trim: [255, 50, 60], look: 'pastel', face: { style: 'diner' } },
  ], { depth: 30, floors: 3, passages: false, mask: northOfMile });

  // ===========================================================================================================
  // West of Bridge Street: Mile Beach along the shore, Rose Plaza at the bridge's foot, the motels facing the Mile
  const shoreAt = (x) => { let y = 2180; while (y < 2300 && !m.land[y * m.w + x]) y++; return y; };
  const wx0 = PX.gallery + EXT.ave + 1, wx1 = PX.bridge - EXT.st;   // 2568 .. 2675
  // the beach: the sand from the water, the promenade's paving behind it; the beach bar's hut on the sand (the shore
  // stays free of lots: a stand, its tables and torches)
  const SAND = 9, PROM = 3, RP0 = 2636, sandTo = (x) => (x < RP0 ? SAND : 4);   // (by Rose Plaza only a strip)
  {
    const bx = 2588, by = shoreAt(bx) + 4;
    prop('beachbar', bx, by, 16);
    for (const dx of [-3.5, 3.5]) prop('torch', bx + dx, by + 1.5, 6);
    for (let k = 0; k < 3; k++) { prop('cafetable', bx - 3 + k * 3, by + 3.4, 0); prop(k % 2 ? 'umbrella_g' : 'umbrella_y', bx - 3 + k * 3, by + 3.3, 0); }
    prop('textsign', bx, by + 5, 0, { text: 'TIKI HUT', bg: '#3a6a5a', fg: [255, 214, 120], z: 26, sx: 2 });
  }
  for (let x = PX.gallery; x < wx1; x++) {
    const s = shoreAt(x), sd = sandTo(x);
    if (s >= 2300) continue;
    for (let y = s; y < s + sd; y++) {
      const i = y * m.w + x;
      // (the shore's own paving at the water's edge, laid with the city's plazas, is beach here too)
      if (K.free(x, y) || (sd === SAND && m.tiles[i] === T.PLAZA && m.dist[i] === D && m.bld[i] < 0)) { m.tiles[i] = T.SAND; K.take(x, y, 1, 1); }
    }
    K.fill(x, s + sd, 1, PROM, T.PLAZA);
    if (x % 8 === 3) prop('palm_a', x + 0.5, s + sd + 0.4, 10, { sp: 'coconut', k: 1.2 + rnd(x, s, 95) * 0.2 });
    if (x % 9 === 6) prop('lamp', x + 0.5, s + sd + PROM - 0.6, 0);
    if (x % 13 === 9) prop('bench_m', x + 0.5, s + sd + 1.8, 0);
    if (sd < SAND) continue;
    // (on the sand: loungers under umbrellas in two rows, towels, a surfboard stood up, a shower)
    if (x % 6 === 1 && (x < 2582 || x > 2596)) { prop('lounger', x + 0.5, s + 3.5, 0, { v: x % 4, a: Math.PI / 2 }); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_b', 'umbrella_g'], rnd(x, s, 96)), x + 1.4, s + 3.2, 0); }
    if (x % 6 === 4 && (x < 2582 || x > 2596)) { prop('lounger', x + 0.5, s + 6.5, 0, { v: (x + 1) % 4, a: Math.PI / 2 }); if (rnd(x, s, 97) < 0.5) prop('towel', x + 1.8, s + 6.8, 0, { v: x % 5 }); }
    if (x % 23 === 11) prop('surfboard', x + 0.5, s + 7.6, 0, { v: x % 3 });
    if (x % 31 === 17) prop('shower', x + 0.5, s + 8.2, 0);
  }
  prop('lguard', 2608, shoreAt(2608) + 2, 10, { a: 0 });
  prop('tnet', 2572, shoreAt(2572) + 4.5, 0, { len: 140, a: Math.PI / 2 });   // (a net strung up for a game on the sand)
  (out.places ||= []).push({ name: 'Mile Beach', x0: PX.gallery, y0: 2236, x1: 2626, y1: 2270 });
  // Rose Plaza: from the promenade down to the motels' row, west of Bridge Street
  const rp = [RP0, wx1, 2255];   // x0, x1, its south edge
  {
    const [x0, x1, yS] = rp, cx = (x0 + x1) / 2, cy = 2236;
    for (let x = x0; x < x1; x++) {
      const s = shoreAt(x) + 4 + PROM;
      for (let y = s; y <= yS; y++) {
        const ex = (x + 0.5 - cx) / 9, ey = (y + 0.5 - cy) / 6.5, e = ex * ex + ey * ey;
        // (paved all over but for the rose beds in a ring round the basin, broken by the four walks)
        const bed = e > 1 && e < 1.7 && Math.abs(x + 0.5 - cx) > 2 && Math.abs(y + 0.5 - cy) > 1.5;
        K.fill(x, y, 1, 1, bed ? T.GRASS : T.PLAZA);
      }
      K.take(x, s, 1, yS - s + 1);
    }
    // the basin: a round pool of water, its fountain in the middle (the deck its stone rim)
    const br = 4.2;
    for (let y = Math.floor(cy - br); y <= Math.ceil(cy + br); y++) for (let x = Math.floor(cx - br); x <= Math.ceil(cx + br); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 < br * br) m.set(x, y, T.WATER);
    (m.pools ||= []).push({ x: Math.floor(cx - br) * TILE, y: Math.floor(cy - br) * TILE, w: (Math.ceil(cx + br) - Math.floor(cx - br) + 1) * TILE, h: (Math.ceil(cy + br) - Math.floor(cy - br) + 1) * TILE, lanes: 0 });
    prop('fountain', cx, cy + 0.5, 0);
    for (let k = 0; k < 8; k++) prop('flowers_big', cx + 7 * C8[k][0], cy + 5.2 * C8[k][1], 0);
    prop('statue', cx, shoreAt(Math.round(cx)) + 4 + PROM + 1.5, 20);
    for (const [dx, dy] of [[-9, -6], [9, -6], [-9, 7], [9, 7]]) prop('pbench', cx + dx, cy + dy, 0);
    for (const [dx, dy] of [[-12, -3], [12, -3], [-12, 9], [12, 9]]) prop('palm_a', cx + dx, cy + dy, 10, { sp: 'royal', k: 1.15 });
    for (const [fx, fy] of [[x0 + 1, shoreAt(x0 + 1) + 4 + PROM + 1], [x1 - 1, shoreAt(x1 - 1) + 4 + PROM + 1], [x0 + 1, yS - 1], [x1 - 1, yS - 1]]) { prop('lamp', fx, fy, 0); prop('festoon', fx, fy - 0.4, 0, { tx: Math.round((cx - fx) * 0.75 * TILE), ty: Math.round((cy - fy) * 0.75 * TILE), h: 66 }); }
    for (let k = 0; k < 6; k++) { const tx = x0 + 2.5 + (k % 3) * 3.4, ty = yS - 3.5 - Math.floor(k / 3) * 3.4; prop('cafetable', tx, ty, 0); prop(k % 2 ? 'umbrella_r' : 'umbrella_b', tx, ty - 0.1, 0); }
    prop('foodcart', x0 + 3, cy - 4, 14);
    prop('mstall', x1 - 4, yS - 3, 0, { v: 2, c: 0, a: 0 }); prop('flowers_big', x1 - 6.5, yS - 2.2, 0); prop('flowers_big', x1 - 1.6, yS - 2.2, 0);   // (the flower seller's)
    prop('textsign', cx, yS - 0.6, 0, { text: 'ROSE PLAZA', bg: '#3a1e2e', fg: [255, 150, 190], z: 30, sx: 2 });
    K.m.squares ||= []; K.m.squares.push({ x: Math.round(cx) - 6, y: cy - 5, w: 12, h: 10, name: 'Rose Plaza' });
    (out.places ||= []).push({ name: 'Rose Plaza', x0, y0: 2205, x1, y1: yS + 1 });
  }
  // the motels and lounges facing the Mile (the beach's lawns behind them)
  {
    const yTop = (x) => (x >= rp[0] ? rp[2] + 2 : shoreAt(x) + SAND + PROM + 2);
    const plan = [
      ['motel', 30, { name: 'Starlite Motel', office: 'left', court: 10, price: 6500 }],
      ['path', 5],
      ['gap', 2],
      ['lit', 10, { name: 'The Little Pink Chapel', store: 'lobby', neon: 'bar', sign: 'WEDDINGS', pic: 'heart', floors: 2, look: 'pastel', face: { style: 'stucco', wallColor: '#f4e8ec', pitch: 'gable', ridge: 'ns', slope: 0.45, roofColor: '#7a5a66' }, key: 'church', poi: { kind: 'delivery', label: 'The Little Pink Chapel' }, home: null, awning: ['#e8a0bc', '#f4f0ec'], depth: 12, kit: [] }],
      ['gap', 2],
      ['motel', 30, { name: 'Pink Palms Motel', office: 'right', court: 11, price: 7000, wall: '#ec9cb8', wall2: '#f2c4a2' }],
      ['theatre', 0],
    ];
    let x = wx0;
    for (const [kind, w0, o] of plan) {
      if (x >= wx1 - 6) break;
      const w = w0 || wx1 - x;
      if (kind === 'gap') { const yt = yTop(x), yf = mileN(x); if (yf - yt > 4) K.gap('garden', x, yf - 8, w0, 9); x += w0; continue; }
      if (kind === 'path') {
        // a walk down to the beach between the lots: paving, palms either side, a sign at the Mile
        const yt = yTop(x), yf = mileN(x);
        if (yf - yt > 4) { K.fill(x, yt, w, yf - yt + 1, T.PLAZA); for (let y = yt + 3; y < yf - 1; y += 6) { prop('palm_a', x + 0.6, y, 10, { sp: 'royal', k: 1.1 }); prop('palm_a', x + w - 0.6, y + 3, 10, { sp: 'royal', k: 1.1 }); } prop('textsign', x + w / 2, yf - 1, 0, { text: 'MILE BEACH', bg: '#2a6a8a', fg: [250, 240, 200], z: 28, sx: 2 }); prop('lamp', x + w / 2, yt + 2, 0); }
        x += w; continue;
      }
      if (kind === 'motel') { motel(x, w, yTop(x + w - 1), mileN(x), o); x += w; continue; }
      const box = lotBox(x, w, yTop(x), mileN(x), northOfMile);
      if (box && kind === 'theatre') {
        // The Rose Theatre: the Mile's cabaret house - its marquee over the doors, the rose in neon up its face, the
        // fly tower behind it
        const front = box.front - 4, dep = Math.min(30, front - box.top - 8);
        K.fill(x, front + 1, w, 4, T.PLAZA); K.take(x, front + 1, w, 4);
        const tb = place({ x, y: front - dep + 1, w, h: dep, arch: 'theatre', key: 'theatre', name: 'The Rose Theatre', poi: { kind: 'delivery', label: 'The Rose Theatre' }, whole: true,
          art: { spec: { floors: 4, style: 'stucco', wallColor: '#4a2240', win: 'arch', cornice: 'step', parapet: 14, grime: 0.12, roofMat: 'gravel', lip: 10, rimW: 5, blades: [] },
            shop: { kind: 'lobby', door: 'right', open: true, people: 4, sign: null, awning: ['#7a1e3a', '#7a1e3a'] }, neon: { name: 'ROSE THEATRE', kind: 'club', col: 2, pic: 'rose', picV: 150, blade: 'CABARET' } } });
        if (tb) {
          out.shops++;
          used.add('The Rose Theatre');
          prop('marquee', x + w / 2, front + 1.4, 0);
          for (const dx of [2, w - 2]) prop('lamp', x + dx, front + 3, 0);
          // (the fly tower over the stage at the back, a storey higher)
          const fy0 = front - dep - 9, fw = Math.min(w - 6, 18);
          if (fy0 >= box.top) K.building({ x: x + 3, y: fy0, w: fw, h: 9, arch: 'theatre', name: 'The Rose Theatre', poi: false, door: null, whole: true, art: { spec: { floors: 5, style: 'stucco', wallColor: '#3e1c36', parapet: 10, grime: 0.18, roofMat: 'tar', lip: 8, rimW: 4, blades: [], plaques: [], blank: true }, noShop: true, kit: [['neon|CABARET|2', Math.round(fw * TILE / 2), 14], ['vent', 80, 120], ['ac', fw * TILE - 80, 160]] } });
        }
      } else if (box) place({ x, y: box.front - (o.depth || 16) + 1, w, h: o.depth || 16, ...lit(x, box.front, w, o) });
      x += w;
    }
  }

  // ===========================================================================================================
  // South of the Mile, west of Bridge Street: Sideshow Street - its north side the rough fronts (their backs on the
  // Mile, rooftop signs over it), Blind Alley off it; its south side the row facing Greenfield Avenue
  {
    let k = 0;
    const L0 = [
      { w: 11, name: 'Mile Pawn & Loan', store: 'pawn', neon: false, grille: true, floors: 2, poi: { kind: 'pawn', label: 'Mile Pawn & Loan' }, shopSign: { text: 'PAWN & LOAN', bg: '#1e2a1e', fg: [240, 220, 80], lit: true } },
      { w: 9, name: 'Ink & Thorns Tattoo', store: 'salon', neon: 'bar', sign: 'INK & THORNS', pic: 'rose', floors: 2, icon: 'skull', iconCol: [255, 90, 60] },
      { w: 7, name: 'For Lease', store: 'lobby', neon: false, closed: true, boarded: 0.7, floors: 1, poi: false, tag: 'MILE', shopSign: { text: 'FOR LEASE', bg: '#e8e4dc', fg: [180, 40, 46], lit: false } },
      { w: 9, name: 'Suds & Spins', store: 'laundry', neon: false, floors: 2, walk: false, shopSign: { text: 'SUDS & SPINS', bg: '#2a6a8a', fg: [250, 250, 240], lit: true } },
    ];
    const L1 = [
      { w: 8, name: 'Bail Bonds 24/7', store: 'lobby', neon: false, floors: 1, shopSign: { text: 'BAIL BONDS 24/7', bg: '#e8c040', fg: [40, 40, 50], lit: true } },
      { w: 13, name: "Rusty's Body Shop", store: 'lobby', neon: false, floors: 1, key: 'repair', poi: { kind: 'delivery', label: "Rusty's Body Shop" }, roller: true },
      { w: 8, name: 'Lucky Liquor', store: 'liquor', neon: false, floors: 2, poi: { kind: 'convenience', label: 'Lucky Liquor' }, grille: true, shopSign: { text: 'LUCKY LIQUOR', bg: '#8a2a2e', fg: [250, 230, 190], lit: true } },
      { w: 9, name: 'Sideshow Tattoo', store: 'salon', neon: 'bar', sign: 'SIDESHOW', pic: 'tigerHead', floors: 2 },
    ];
    const rowOf = (x0, x1, list) => K.row(x0, x1, Math.floor(Math.min(mileY(x0), mileY(x1))), sideN, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'passage' } : null;
      let L = k < list.length ? list[k++] : null;
      if (L) used.add(L.name);
      else {
        const q = biz(SIDESHOW, x, sideN, 96);
        if (!q) return { gap: Math.min(room, 4), kind: 'yard' };
        const [bg, fg] = pick(SIGNS_ROUGH, rnd(x, sideN, 98));
        L = { w: 6 + Math.floor(rnd(x, sideN, 97) * 4), name: q[0], store: q[1], neon: q[1] === 'salon' ? 'bar' : false, shopSign: { text: q[0].toUpperCase().slice(0, 18), bg, fg, lit: rnd(x, sideN, 104) < 0.6 }, floors: 1 + (rnd(x, sideN, 99) < 0.5 ? 1 : 0), boarded: rnd(x, sideN, 100) < 0.3 ? 0.5 : 0, walk: q[1] === 'pawn' };
      }
      const w = Math.min(room, L.w), o = lit(x, sideN, w, { look: 'rough', ...L });
      // (a roller-door front: the body shop's two bays, no shopfront; its neighbours' backs on the Mile carry a sign)
      if (L.roller) { delete o.art.shop; o.art.noShop = true; o.art.spec.doors = [{ x: 10, w: 120, kind: 'roller', open: true, h: 54 }, { x: 150, w: 120, kind: 'roller', open: false, h: 54 }]; o.art.spec.windows = [w * TILE - 40]; o.art.spec.plaques = [{ text: "RUSTY'S BODY SHOP", x: 20, v: 62, sx: 2, bg: '#2a2a2a', fg: [240, 200, 60], lit: true }]; }
      // (its back on the Mile: a sign standing on its roof's north edge)
      if (w >= 6 && rnd(x, sideN, 101) < 0.75) (o.art.kit ||= [['ac', Math.round(w * TILE * 0.4), 90], ['vent', Math.round(w * TILE * 0.7), 140]]).unshift([`neon|${pick(['PAWN', 'TATTOO', 'LIQUOR', 'BAIL BONDS', 'CASH', 'LIVE', 'SHOWS', 'MOTEL', 'BAR', 'OPEN 24'], rnd(x, sideN, 102))}|${Math.floor(rnd(x, sideN, 103) * 7)}`, Math.round(w * TILE / 2), 12]);
      return { w, depth: 99, ...o };
    }, { rough: true, mask: southOfMile });
    rowOf(wx0, PX.blind - 1, L0);
    k = 0;
    rowOf(PX.blind + 2, wx1, L1);
  }
  // Blind Alley: the dead end off Sideshow Street - fenced across its end, the dumpsters, the tires, a fire in a barrel,
  // the walls tagged
  {
    const ax = PX.blind, yE = 2349;
    prop('chainfence', ax - 1.6, yE - 0.8, 0, { tx: Math.round(3.2 * TILE), ty: 0 });
    prop('burnbarrel', ax + 0.2, yE + 1.6, 10);
    for (const [dx, dy, t] of [[-1.1, 3, 'dump_o'], [1.2, 5, 'tires'], [-1, 8, 'trashpile'], [1.1, 10, 'pallet'], [-1.2, 13, 'bags'], [1, 15, 'drum'], [0.9, 2.2, 'boombox']]) prop(t, ax + dx, yE + dy, t === 'boombox' ? 0 : 10);
    prop('gwall', ax - 1.4, yE + 6, 0, { len: 160, v: 2 }); prop('gwall', ax + 1.4, yE + 10, 0, { len: 140, v: 3 });
    (out.places ||= []).push({ name: 'Blind Alley', x0: ax - 2, y0: yE, x1: ax + 3, y1: PY.side });
  }
  // the row facing Greenfield Avenue, west of Bridge Street and between Bridge Street and the deck
  litRow(wx0, wx1, sideS, greenN, [], { depth: 15, floors: 2, look: 'pastel', cats: [['bar', 0.2], ['food', 0.55], ['shop', 1]] });

  // ===========================================================================================================
  // Under the Loop: the deck's ground between Rose Street and Greenfield Avenue - the food carts and their tables by
  // Bridge Street (its car park and taxi rank: underLoop(), first)
  {
    // the food carts and their tables on the paved strip west of the deck, south of the Mile
    const fy0 = mileS(2700), fx0 = PX.bridge + EXT.st + 1;
    if (K.allFree(fx0, fy0, 26, 14)) {
      K.fill(fx0, fy0, 26, 14, T.PLAZA); K.take(fx0, fy0, 26, 14);
      for (let k = 0; k < 3; k++) prop('foodcart', fx0 + 4 + k * 8, fy0 + 3, 14);
      for (let k = 0; k < 6; k++) { prop('cafetable', fx0 + 3 + k * 4, fy0 + 8, 0); if (k % 2 === 0) prop(k % 4 ? 'umbrella_y' : 'umbrella_r', fx0 + 3 + k * 4, fy0 + 7.9, 0); }
      prop('festoon', fx0 + 1, fy0 + 6, 0, { tx: Math.round(24 * TILE), ty: 0, h: 52 }); prop('festoon', fx0 + 1, fy0 + 10, 0, { tx: Math.round(24 * TILE), ty: 0, h: 52 });
      prop('textsign', fx0 + 13, fy0 + 0.8, 0, { text: 'UNDER THE LOOP EATS', bg: '#1a1420', fg: [255, 200, 80], z: 40, sx: 2 });
      prop('trashcan', fx0 + 1, fy0 + 12, 0); prop('trashcan', fx0 + 24, fy0 + 12, 0);
      (m.partySpots ||= []).push({ x: Math.round((fx0 + 13) * TILE), y: Math.round((fy0 + 8) * TILE), name: 'Under the Loop' });
      (out.places ||= []).push({ name: 'Under the Loop', x0: fx0, y0: fy0, x1: 2735, y1: fy0 + 14 });
    }
  }
  litRow(PX.bridge + EXT.st + 1, 2718, sideS - 6, greenN, [], { depth: 15, floors: 2, look: 'pastel', cats: [['food', 0.7], ['shop', 1]] });

  // ===========================================================================================================
  // Coral Court: the gated towers where the Mile meets Downtown - two towers with their lobbies on Greenfield Avenue,
  // the garden court between them (lawns, palms, the pool and its loungers, the clubhouse at its head), the gatehouse
  // and the iron fence on the avenue, the residents' car parks behind the towers
  {
    const TW = towerKit(K, out);
    const yS = greenN, x0 = 2744, x1 = PX.westside - EXT.ave;   // 2744 .. 2853
    const wT = 17, yT = yS - 31;
    const towers = [[x0, 'Coral Court West'], [x1 - wT, 'Coral Court East']];
    for (const [tx, name] of towers) {
      TW.towerLot({ x: tx, y: yT, w: wT, h: 32, arch: 'condo', key: 'apt4', name, home: { kind: 'apartment', price: 24000, name: `${name} Apt` },
        art: TW.tower(tx, yT, { floors: 7, style: 'stucco', wall: '#f0e2d0', win: 'tall', name: 'CORAL COURT', signC: ['#2a5a6a', [240, 236, 220]], spec: { balconies: true, cornice: 'step' }, kit: [['palm', 60, 60], ['palm', wT * TILE - 60, 60], ['lounge', 140, 140], ['umb', 200, 150], ['hvac', 120, 300], ['ac', 300, 400]] }) });
    }
    // the low block along the avenue between them, the gate through its middle (three storeys: the garden behind it
    // stays in view)
    {
      const bx0 = x0 + wT + 1, bx1 = x1 - wT - 1, gx = Math.round((bx0 + bx1) / 2), by = yS - 11;
      for (const [a, b] of [[bx0, gx - 4], [gx + 4, bx1]]) TW.towerLot({ x: a, y: by, w: b - a, h: 12, arch: 'condo', key: 'apt3', name: 'Coral Court', poi: false, home: { kind: 'apartment', price: 20000, name: 'Coral Court Apt' },
        art: TW.tower(a, by, { floors: 3, style: 'stucco', wall: '#f4e6d2', win: 'pair', shop: false, spec: { balconies: true, cornice: 'step' }, kit: [['ac', 60, 80], ['plant', 120, 60], ['ac', (b - a) * TILE - 70, 140]] }) });
    }
    // the court between the towers
    const cx0 = x0 + wT + 1, cx1 = x1 - wT - 1, cy0 = Math.max(mileS(cx0), mileS(cx1)) + 3, cy1 = yS - 12;
    if (cx1 - cx0 > 20 && cy1 - cy0 > 16) {
      // the clubhouse at the head of the court (one storey: the Mile behind it stays in view)
      const chw = 16, chx = Math.round((cx0 + cx1) / 2 - chw / 2);
      handBld({ x: chx, y: cy0, w: chw, h: 7, arch: 'cafe', key: 'rest2', name: 'Coral Clubhouse', whole: true, poi: false, art: { spec: { floors: 1, style: 'stucco', wallColor: '#f4ead8', parapet: 10, roofMat: 'deck', lip: 6, rimW: 4, blades: [] }, shop: { kind: 'lobby', door: 'left', open: true, people: 2, awning: ['#2a7a8a', '#f0ece4'], sign: { text: 'CLUBHOUSE', bg: '#2a5a6a', fg: [240, 236, 220], lit: true } } } });
      for (let y = cy0; y <= cy1; y++) for (let x = cx0; x < cx1; x++) { const path = Math.abs(x + 0.5 - (cx0 + cx1) / 2) < 1.5 || y === cy0 + 12 || y >= cy1 - 1; K.fill(x, y, 1, 1, path ? T.PLAZA : T.GRASS); }
      K.take(cx0, cy0, cx1 - cx0, cy1 - cy0 + 1);
      // the pool on the court's west lawn, its deck
      const pw = 12, ph = 5, px0 = cx0 + 4, py0 = cy0 + 16;
      K.paint(px0 - 1, py0 - 1, pw + 2, ph + 2, T.PLAZA);
      for (let y = py0; y < py0 + ph; y++) for (let x = px0; x < px0 + pw; x++) m.set(x, y, T.WATER);
      (m.pools ||= []).push({ x: px0 * TILE, y: py0 * TILE, w: pw * TILE, h: ph * TILE, lanes: 0, deck: { x: (px0 - 1) * TILE, y: (py0 - 1) * TILE, w: (pw + 2) * TILE, h: (ph + 2) * TILE } });
      out.pools++;
      for (let k = 0; k < 4; k++) prop('lounger', px0 + 1 + k * 3, py0 - 1.2, 0, { v: 0, a: Math.PI / 2 });
      prop('umbrella_b', px0 + pw + 1.6, py0 + 1, 0); prop('hottub', px0 + pw + 1.8, py0 + 3.6, 0, { r: 26 });
      // the garden: royal palms down the walk and round the edge, hedges along the walks, flower beds and benches, lamps,
      // the fountain where the walks cross, the gazebo, a tennis court on the east lawn
      const mx = (cx0 + cx1) / 2, wy = cy0 + 12;
      for (let y = cy0 + 9; y < cy1 - 1; y += 5) for (const dx of [-3, 3]) prop('palm_a', mx + dx, y + 0.5, 10, { sp: 'royal', k: 1.2 });
      for (let y = cy0 + 3; y < cy1 - 2; y += 6) for (const x of [cx0 + 1.5, cx1 - 1.5]) prop('palm_a', x, y + 0.5, 10, { sp: rnd(x, y, 107) < 0.5 ? 'royal' : 'coconut', k: 1.2 });
      for (const [a, b] of [[cx0 + 3, mx - 5], [mx + 5, cx1 - 3]]) { prop('hedgerun', a, wy - 1.2, 0, { tx: Math.round((b - a) * TILE), ty: 0, h: 14 }); prop('hedgerun', a, wy + 2.2, 0, { tx: Math.round((b - a) * TILE), ty: 0, h: 14 }); }
      for (let k = 0; k < 6; k++) { const fx = cx0 + 6 + k * ((cx1 - cx0 - 12) / 5); prop('flowers_big', fx, wy - 3, 0); prop('flowers_big', fx, wy + 4, 0); }
      for (const fx of [mx - 12, mx + 12]) { prop('bench_m', fx, wy + 0.4, 0); prop('lamp', fx + 3, wy + 0.4, 0); }
      for (let y = wy + 6; y < cy1 - 1; y += 8) prop('lamp', mx + 1.6, y, 0);
      prop('fountain', mx, wy + 0.5, 30);
      prop('gazebo', cx0 + 10, cy1 - 8, 20);
      const tcx = cx1 - 16, tcy = cy0 + 20;
      prop('court', tcx, tcy - 6, 0, { w: 18 * TILE, d: 12 * TILE, c1: '#2a6a5a', c2: '#3a8a6a' }); prop('tnet', tcx, tcy, 0, { len: 140, a: 0 });
      prop('chainfence', tcx - 9.5, tcy - 7, 0, { tx: Math.round(19 * TILE), ty: 0 }); prop('chainfence', tcx - 9.5, tcy + 7, 0, { tx: Math.round(19 * TILE), ty: 0 });
      // the gate through the low block onto the avenue: its piers, the drive paved through, the name over it
      const gx = Math.round((cx0 + cx1) / 2);
      K.fill(gx - 4, cy1 + 1, 8, 12, T.PLAZA); K.take(gx - 4, cy1 + 1, 8, 12);
      for (const px of [gx - 3.5, gx + 3.5]) prop('gatepier', px, yS - 0.6, 10);
      prop('textsign', gx, yS - 1.2, 0, { text: 'CORAL COURT', bg: '#2a5a6a', fg: [240, 236, 220], z: 40, sx: 2 });
      // (the fence along the Mile: the court's north edge)
      prop('fenceline', cx0 + 0.2, cy0 - 0.6, 0, { kind: 'iron', tx: Math.round((cx1 - cx0 - 0.4) * TILE), ty: 0 });
      (out.places ||= []).push({ name: 'Coral Court', x0, y0: cy0, x1, y1: yS });
    }
    // the residents' car parks behind the towers, up to the Mile
    for (const [tx] of towers) {
      const py0 = mileS(tx + wT) + 1, py1 = yT - 1;
      if (py1 - py0 < 4) continue;
      for (let y = py0; y <= py1; y++) for (let x = tx; x < tx + wT; x++) if (K.free(x, y)) { m.tiles[y * m.w + x] = T.LOT; K.take(x, y, 1, 1); }
      for (let ry = py1 - 4; ry >= py0 + 1; ry -= 9) for (let sx = tx + 1; sx + 3 <= tx + wT; sx += 3) { m.stalls.push({ x: sx * TILE, y: ry * TILE, w: 3 * TILE, h: 4 * TILE }); if (rnd(sx, ry, 105) < 0.6) m.parking.push({ x: (sx + 1.5) * TILE, y: (ry + 2) * TILE, a: -Math.PI / 2 }); }
    }
  }

  // ===========================================================================================================
  // The street dressing: royal palms down the Mile's median and Neon Boulevard's with lights strung between them, clear
  // of the junctions; vending machines by the marts; tables out by the diners
  const junctions = [PX.gallery, PX.bridge, 2735, PX.westside];
  let last = null;
  for (let x = PX.gallery + 12; x < PX.westside - 10; x += 9) {
    if (junctions.some((c) => Math.abs(x - c) < 13)) { last = null; continue; }
    const y = mileY(x + 0.5);
    prop('palm_a', x + 0.5, y + 0.5, 10, { sp: 'royal', k: 1.2 });
    if (last) prop('festoon', last[0] + 0.5, last[1] - 0.1, 0, { tx: Math.round((x - last[0]) * TILE), ty: Math.round((y - last[1]) * TILE), h: 70 });
    last = [x, y];
  }
  last = null;
  for (let x = PX.bridge + 14; x < PX.westside - 10; x += 9) {
    if (Math.abs(x - 2781) < 14) { last = null; continue; }
    const y = neonY(x + 0.5);
    prop('palm_a', x + 0.5, y + 0.5, 10, { sp: 'royal', k: 1.2 });
    if (last) prop('festoon', last[0] + 0.5, last[1] - 0.1, 0, { tx: Math.round((x - last[0]) * TILE), ty: Math.round((y - last[1]) * TILE), h: 70 });
    last = [x, y];
  }
  const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
  for (let i = poi0; i < m.pois.length; i++) {
    const p = m.pois[i];
    if (p.kind !== 'convenience' && p.kind !== 'coffee') continue;
    const x = p.x / TILE, y = p.y / TILE;
    if (p.kind === 'convenience' && onWalk(x + 1.8, y + 0.3)) { prop('vend_cola', x + 1.8, y + 0.3, 8); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: (x + 1.8) * TILE, y: (y + 0.9) * TILE, r: 32 }); }
    else if (p.kind === 'coffee' && onWalk(x + 2, y + 0.6) && rnd(x, y, 106) < 0.6) { prop('cafetable', x + 2, y + 0.9, 0); prop('umbrella_r', x + 2, y + 0.8, 0); }
  }

  // what the plan left open: lawn with palms and flowering trees (else the kit's seal paves it)
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.6 ? ['palm_a', pick(['royal', 'coconut', 'coconut'], rnd(x, y, 830)), 1.15 + rnd(x, y, 831) * 0.2] : r < 0.85 ? ['tree_a', pick(['cherry', 'magnolia'], rnd(x, y, 832)), 1.1] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 833)), null, 1] });
  out.named = used.size;
  return out;

  // a club's lot: its key (the generator's club kinds: the dance floor inside, the line and the bouncers -
  // server/systems/nightclubs.js), its neon (the name, a picture, a blade)
  function clubLot(key, name, floors, neonKind, pic = null, blade = null) {
    out.clubs++;
    used.add(name);
    const f = dark(rnd(floors, name.length, 90));
    return { arch: 'club', key, name, poi: { kind: 'delivery', label: name }, whole: true,
      art: { spec: { floors, ...f, win: pick(WINS, rnd(name.length, floors, 91)), parapet: 12, grime: 0.15, roofMat: 'rubber', lip: 10, rimW: 4, blades: [] }, shop: { kind: 'bar', door: 'right', open: true, people: 4, sign: null, awning: ['#16121e', '#16121e'] },
        neon: { name, kind: neonKind, col: (ci++ * 3) % 7, ...(pic ? { pic } : {}), ...(blade ? { blade } : {}) } } };
  }
}
// (a circle's points without trigonometry - shared code: CLAUDE.md - an octagon's corners)
const C8 = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
