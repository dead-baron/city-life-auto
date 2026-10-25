// The Neon Strip, handcrafted (the World v3 Handcraft Plan, "The Neon Strip: the target vibe" - the owner's NE1 street
// level and NE2 the district, NE3-NE8 (the tigers and the eye-patch woman his favourites), NE9-NE14 the nightlife
// concepts, D8's four-corner crossroads, AL1 the night-market alley). A near-cyberpunk night district on the Gulf
// Island's north shore, facing the mainland across the water:
//   - Neon Boulevard along the shore: every front on its north side lit top to bottom - the clubs, the arcade, the
//     streetwear shop under its striding tiger, the 24-hour burger bar, the mart; palms strung with lights;
//   - the headland between the two bridges: Blossom Plaza (the fountain under cherry trees, the food truck, the
//     eye-patch woman's billboard) opening onto the boulevard; Lantern Lane, the night market, running across it -
//     stalls down one side, lanterns strung across, a gate at each end; Harbor Walk and the waterfront promenade
//     behind, the marina with the party boat;
//   - the two towers where only the water is behind them: the Neon Palms Hotel on the west point (its rooftop pool, the
//     HOTEL blade), The Violet Room's tower at the crossroads (her portrait down its face);
//   - the crossroads of the boulevard and Park East Avenue (D8, NE10): Club Ultraviolet's crown, the arcade, the ramen
//     bar under lanterns, the 24/7 mart and its car park;
//   - south of the boulevard, Lantern Street's lit row and the backs with their rooftop signs over the boulevard; The
//     Docks at the east end: a warehouse club, a container bar, containers stacked by the Gulf Loop.
// Every building faces south (the camera). Names, signs and brands are invented. Draws are fixed by place (hash2), so
// reworking one block moves nothing else. The plan's frame: shared/world3-hand.js; its neon art: client/art2/neonsigns.js
// (b.art.neon: handNeon).
import { TILE, T } from './constants.js';

const D = 7;   // the Neon Strip's district id (shared/mapcore.js DISTRICTS)
// the street centre lines (tiles); the two bridges' arterials come down to the boulevard at bridgeW and bridgeE (the
// skeleton's Midtown Bridge and Civic Bridge: shared/world3-skeleton.js ARTERIALS)
export const NY = { walk: 2111, lane: 2150, blvd: 2200, lantern: 2250, cross: 2300 };
export const NX = { westside: 2860, parkW: 2988, parkE: 3184, civic: 3320, harborview: 3480, bridgeW: 2975, bridgeE: 3161 };
// (Neon Boulevard: 13 tiles, four lanes either side of a 3-tile median of royal palms - WC238, SC4-B; Midtown Boulevard's
// section)
const BLVD_W = 13, MEDIAN = 96;
const EXT = { ave: 7, blvd: (BLVD_W - 1) / 2 + 3, st: 6, art: 7, alley: 1 };
const AL = { a: 2226, b: 2275 };   // the service alleys behind the rows south of the boulevard
const LANE = [2141, 2160];         // Lantern Lane, the night market (pedestrian: rows - two rows of stalls facing each other)
const PLAZA = [3046, 3092];        // Blossom Plaza (columns)

function streets() {
  const S = [];
  const ew = (name, kind, y, x0, x1) => S.push({ name, kind, pts: [[x0, y], [x1, y]], ...(kind === 'blvd' ? { w: BLVD_W, median: MEDIAN } : {}) });
  const ns = (name, kind, x, y0, y1) => S.push({ name, kind, pts: [[x, y0], [x, y1]] });
  ew('Neon Boulevard', 'blvd', NY.blvd, NX.westside, 3420);
  ew('Lantern Street', 'st', NY.lantern, NX.westside, NX.harborview);
  ew('Harbor Walk', 'st', NY.walk, NX.bridgeW, NX.bridgeE);
  ns('Park West Avenue', 'ave', NX.parkW, NY.blvd, NY.cross);
  ns('Park East Avenue', 'ave', NX.parkE, NY.blvd, NY.cross);
  ns('Civic Avenue', 'ave', NX.civic, NY.blvd, NY.cross);
  ns('Harborview Avenue', 'ave', NX.harborview, NY.lantern, NY.cross);
  ew('Glow Alley', 'alley', AL.a, NX.westside, NX.harborview);
  ew('Neon Back Alley', 'alley', AL.b, NX.westside, NX.harborview);
  return S;
}

export const NEON = {
  key: 'neon', d: D, rect: [2860, 2080, 3640, 2300],
  streets,
  // the special businesses this plan places itself (shared/map.js SPECIALS of the Neon Strip: placeSpecials leaves them)
  specials: ['Club Ultraviolet', 'The Midnight', 'Luna Lounge', 'Pixel Arcade', 'The Violet Room', 'Neon Palms Hotel', 'Afterglow'],
  build,
};

// ---------------------------------------------------------------------------------------------------------------
// The looks: dark walls for the light to stand out on - charcoal render, black glass, dark brick, deep plum and teal
const FACES = [[4, { style: 'concrete', wallColor: '#2c2a36' }], [3, { style: 'concrete', wallColor: '#35323f' }], [3, { style: 'brickDark' }], [2, { style: 'stucco', wallColor: '#3e2e5a' }],
  [2, { style: 'stucco', wallColor: '#24464e' }], [1, { style: 'stucco', wallColor: '#4a2a3a' }], [2, { style: 'glass' }], [1, { style: 'stone', wallColor: '#4a4650' }], [2, { style: 'brick', brickTone: '#4a2e34' }]];
const FW = FACES.reduce((a, q) => a + q[0], 0);
const faceOf = (r) => { let v = r * FW; for (const q of FACES) { v -= q[0]; if (v <= 0) return q[1]; } return FACES[0][1]; };
const WINS = ['even', 'pair', 'triple', 'tall', 'loft', 'bay', 'even', 'pair'];
// the strip's businesses (invented): [name, storefront kind, neon kind (neonsigns.js NEON_WORDS), blade word or null]
const BAR = [['Lucky Cat', 'bar', 'bar', 'BAR'], ['Two Moons', 'bar', 'bar', null], ['Last Call', 'bar', 'bar', 'BAR'], ['Glowbar', 'bar', 'bar', null], ['Neon Nights', 'bar', 'lounge', 'LIVE'],
  ['Halo Bar', 'bar', 'bar', null], ['Dizzy', 'bar', 'bar', 'SHOTS'], ['Volt', 'bar', 'club', 'DANCE'], ['Stardust', 'bar', 'lounge', 'JAZZ'], ['Moondog', 'bar', 'bar', null], ['Rooftop 88', 'bar', 'lounge', 'ROOF'],
  ['The Static', 'bar', 'bar', 'LIVE'], ['Velvet Fog', 'bar', 'lounge', null], ['Pink Lagoon', 'bar', 'bar', 'TIKI']];
const FOOD = [['Night Owl Ramen', 'diner', 'diner', 'RAMEN'], ['Sushi Sora', 'diner', 'diner', 'SUSHI'], ['Dumpling Moon', 'diner', 'diner', null], ['Moon Burger 24', 'diner', 'diner', 'OPEN 24'],
  ['Glow Noodles', 'diner', 'diner', 'NOODLE'], ['Kaiju Tacos', 'diner', 'diner', null], ['Bao Bar', 'diner', 'diner', 'BAO'], ['Midnight Pho', 'diner', 'diner', 'PHO'], ['Bubble Tea Lab', 'cafe', 'diner', 'TEA'],
  ['Neon Donuts', 'cafe', 'diner', null], ['Hot Pot House', 'diner', 'diner', null], ['Gyoza Go', 'diner', 'diner', null]];
const SHOP = [['Retro Rewind', 'arcade', 'arcade', 'GAMES'], ['Mic Drop Karaoke', 'bar', 'lounge', 'KARAOKE'], ['Pixel Pantry', 'mart', 'mart', null], ['Vinyl Vault', 'records', 'bar', 'VINYL'],
  ['Circuit City Repair', 'mart', 'mart', null], ['Capsule Inn', 'lobby', 'hotel', 'ROOMS'], ['Hi Score', 'arcade', 'arcade', 'PLAY'], ['Glitch Gear', 'clothes', 'bar', null], ['Kicks Lab', 'clothes', 'bar', null],
  ['Holo Phones', 'mart', 'mart', null], ['Starlight Nails', 'salon', 'bar', null], ['Smoke & Mirrors', 'liquor', 'mart', null], ['VR Den', 'arcade', 'arcade', 'VR'], ['Night Pharmacy', 'mart', 'mart', 'OPEN']];

// the rest of the strip's names (never the same twice): a word and a trade - [trade, storefront kind, neon kind]
const HEADS = ['Neon', 'Glow', 'Pixel', 'Lucky', 'Midnight', 'Electric', 'Cosmic', 'Velvet', 'Chrome', 'Laser', 'Ultra', 'Nova', 'Hyper', 'Sakura', 'Dragon', 'Koi', 'Comet', 'Jade',
  'Ruby', 'Echo', 'Flash', 'Orbit', 'Static', 'Prism', 'Vapor', 'Turbo', 'Retro', 'Afterhours', 'Starlit', 'Lotus', 'Phoenix', 'Mirage', 'Strobe', 'Spark', 'Nightfall', 'Galaxy'];
const TRADES = {
  bar: [['Bar', 'bar', 'bar'], ['Lounge', 'bar', 'lounge'], ['Club', 'bar', 'club'], ['Tavern', 'bar', 'bar'], ['Social', 'bar', 'bar'], ['Taproom', 'bar', 'bar'], ['Cocktails', 'bar', 'lounge'], ['Karaoke', 'bar', 'lounge']],
  food: [['Ramen', 'diner', 'diner'], ['Noodles', 'diner', 'diner'], ['Sushi', 'diner', 'diner'], ['Burgers', 'diner', 'diner'], ['Tacos', 'diner', 'diner'], ['Dumplings', 'diner', 'diner'], ['BBQ', 'diner', 'diner'],
    ['Pho', 'diner', 'diner'], ['Curry', 'diner', 'diner'], ['Wings', 'diner', 'diner'], ['Pizza', 'diner', 'diner'], ['Boba', 'cafe', 'diner'], ['Coffee', 'cafe', 'diner'], ['Crepes', 'cafe', 'diner']],
  shop: [['Arcade', 'arcade', 'arcade'], ['Games', 'arcade', 'arcade'], ['Tattoo', 'salon', 'club'], ['Vintage', 'clothes', 'bar'], ['Sneakers', 'clothes', 'bar'], ['Phones', 'mart', 'mart'], ['Comics', 'books', 'bar'],
    ['Records', 'records', 'bar'], ['Nails', 'salon', 'bar'], ['Optics', 'lobby', 'bar'], ['Gear', 'clothes', 'bar'], ['Video', 'arcade', 'arcade'], ['Mart', 'mart', 'mart'], ['Hair', 'salon', 'bar'], ['Liquor', 'liquor', 'mart']],
};
function composeNeon(used, cat, r) {
  const T = TRADES[cat];
  for (let t = 0; t < 40; t++) {
    const [trade, store, neon] = T[Math.floor(r(t * 3) * T.length) % T.length], head = HEADS[Math.floor(r(t * 3 + 1) * HEADS.length) % HEADS.length], name = `${head} ${trade}`;
    if (name.length <= 16 && !used.has(name)) { used.add(name); return [name, store, neon, null]; }
  }
  return null;
}

// ---- the picture signs (the owner's notes part 2, 2026-10-25: "way more neon signs with cool designs all around the
// neon district"): his two sign sheets drawn as pixel neon - client/art2/neonpics.js NP. What a front may hang by its
// trade (a name that says what it is picks its own: a ramen bar the bowl, the karaoke bar the katakana), then the
// district's own to stack up a tall front; dealt the least used first, never one the front next door has (neonDeck)
const PICS_OF = { bar: ['barv', 'cocktailv', 'rooftop', 'sake', 'matsuri', 'luckypaw', 'nightlifev'], lounge: ['karaokev', 'rooftop', 'cocktailv', 'nightlifev', 'sake'],
  club: ['club', 'clubv', 'nightclub', 'panther', 'nightlifev', 'dragon'], diner: ['ramen', 'sushi', 'burger', 'dumpling', 'noodles'], cafe: ['maneki', 'luckypaw', 'matsuri'],
  arcade: ['gamepad', 'gamezone'], mart: ['citymart', 'openv'], liquor: ['sake', 'openv', 'barv'], pawn: ['openv', 'citymart'], hotel: ['hotelv'], lobby: ['hotelv', 'openv'], salon: ['tattoo', 'oni', 'dragon'],
  clothes: ['panther', 'dragon', 'maneki', 'oni'], records: ['nightlifev', 'karaokev', 'clubv'], books: ['maneki', 'openv'] };
const PIC_NAME = [[/ramen|pho\b|noodle/i, 'ramen', 'noodles'], [/sushi/i, 'sushi'], [/burger/i, 'burger'], [/dumpling|gyoza|bao\b/i, 'dumpling'], [/karaoke|mic drop/i, 'karaokev'], [/tattoo|\bink\b/i, 'tattoo', 'oni'], [/hotel|\binn\b/i, 'hotelv'], [/arcade|games|hi score|video/i, 'gamepad', 'gamezone'], [/lucky cat/i, 'maneki', 'luckypaw'],
  [/mart\b|24/i, 'citymart', 'openv'], [/club/i, 'clubv']];
const PIC_DECO = ['openv', 'matsuri', 'sake', 'nightlifev', 'karaokev', 'clubv', 'maneki', 'dragon', 'luckypaw', 'barv', 'cocktailv', 'oni', 'panther'];
const ROOF_PICS = ['panther', 'dragon', 'nightlifev', 'karaokev', 'clubv', 'barv', 'hotelv', 'openv', 'maneki', 'rooftop', 'gamezone', 'ramen', 'sushi', 'burger'];
const PIC_BACK = ['matsuri', 'sake', 'openv', 'maneki', 'clubv', 'luckypaw', 'barv'];   // (small enough for a back wall over its shutter)
export const NEON_PICS = [...new Set([...Object.values(PICS_OF).flat(), ...PIC_DECO, ...PIC_BACK, 'tiger'])];
function neonDeck() {
  const n = new Map();
  const take = (k) => { n.set(k, (n.get(k) || 0) + 1); return k; };
  // (the least dealt of `list` not in `not`; a tie to the draw r)
  const least = (list, not, r) => { let best = null, bc = 1e9; list.forEach((k, i) => { if (not.has(k)) return; const c = (n.get(k) || 0) + ((i + Math.floor(r * list.length)) % list.length) * 0.01; if (c < bc) { bc = c; best = k; } }); return best ? take(best) : null; };
  let prev = new Set();
  return {
    // a front's signs: its own (fixed, or by its name or trade), then `extra` more of the district's to stack
    deal(name, trade, extra, r, fixed = null, pool = null) {
      const own = (PIC_NAME.find(([re]) => re.test(name || '')) || []).slice(1), not = new Set(prev);
      const main = fixed ? take(fixed) : least(pool || (own.length ? own : PICS_OF[trade] || PIC_DECO), not, r) || least(PIC_DECO, not, r);
      const out = main ? [main] : [];
      if (main) not.add(main);
      for (let i = 0; i < extra; i++) { const k = least(pool || (i === 0 && own.length > 1 && !own.slice(1).every((q) => not.has(q)) ? own.slice(1) : PIC_DECO), not, (r * 7 + i * 0.37) % 1); if (k) { out.push(k); not.add(k); } }
      if (!pool) prev = new Set(out);   // (a roof's or a back's sign from its own pool: not the front next door's)
      return out;
    },
    counts: n,
  };
}
// lights strung from (x, y) to (x + dx, y + dy) (tiles) h px up, each end made fast to something (the owner, 10-25:
// "lantern (or hanging lights) don't connect to anything"): 'pole' (a post of its own, drawn with it), 'wall' (a bracket
// on the building there), 'palm' / 'tree' / 'lamp' / 'stall' (the one standing there); k 'lantern': red paper lanterns,
// 'cable': a bare cable (test/neonstrip.test.js holds every end to it)
function fest(K, x, y, dx, dy, h, a0, a1, k = null) { K.prop('festoon', x, y, 0, { tx: Math.round(dx * TILE), ty: Math.round(dy * TILE), h, ends: [a0, a1], ...(k ? { k } : {}) }); }

const band = (yN, kN, yS, kS) => [yN + EXT[kN] + 1, yS - EXT[kS] - 1];
const span = (xW, kW, xE, kE) => [xW + EXT[kW] + 1, xE - EXT[kE]];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const poi0 = m.pois.length;
  const out = { homes: 0, shops: 0, clubs: 0 };
  const used = new Set(), deck = neonDeck();
  let lastWin = null, ci = 0;
  // one of the strip's businesses not used yet
  const biz = (list, x, y, k) => { for (let t = 0; t < 30; t++) { const q = list[Math.floor(rnd(x + t, y, k) * list.length) % list.length]; if (!used.has(q[0])) { used.add(q[0]); return q; } } return null; };
  // ---- a lit front: its walls, its storefront, its neon (b.art.neon: client/art2/neonsigns.js handNeon) ----------
  const lit = (x, y, w, o) => {
    const f = o.face || faceOf(rnd(x, y, 30)), floors = o.floors ?? 2 + Math.floor(rnd(x, y, 31) * 2);
    let win = o.win || pick(WINS, rnd(x, y, 32));
    if (win === lastWin) win = win === 'even' ? 'pair' : 'even';
    lastWin = win;
    const side = o.doorSide || (rnd(x, y, 33) < 0.5 ? 'left' : 'right');
    const col = o.col ?? (ci++ * 3 + Math.floor(rnd(x, y, 34) * 7)) % 7;
    const spec = { floors, ...f, win, parapet: 8 + Math.floor(rnd(x, y, 35) * 6), grime: o.grime ?? 0.18 + rnd(x, y, 36) * 0.2, roofMat: pick(['tar', 'rubber', 'membrane', 'tar'], rnd(x, y, 37)), lip: 10, rimW: 4, blades: [], garden: !!o.garden };
    if (o.cornice) spec.cornice = o.cornice;
    if (o.mural) spec.mural = { x: 8, w: w * TILE - 16, h: Math.min(floors * 56 - 30, 150), kind: o.mural };
    if (floors >= 3 && w >= 8 && rnd(x, y, 38) < 0.3) spec.fireEscape = [Math.max(8, Math.round(w * TILE * 0.5) - 25), 50];
    const shop = { kind: o.store || 'bar', door: side, open: true, people: o.people ?? 2 + Math.floor(rnd(x, y, 39) * 3), sign: null, awning: o.awning !== undefined ? o.awning : rnd(x, y, 40) < 0.4 ? ['#1e1a2a', '#1e1a2a'] : null };
    if (o.grille) shop.grille = true;
    // (its picture signs off the deck: one over the shopfront, more stacked up a tall front - client/art2/neonpics.js
    // lays them where the face has room; its dressing: light strips, holo panels, AC units, a conduit and its cables)
    const extra = o.extra ?? (floors >= 4 && w >= 10 ? 2 : floors >= 3 && w >= 7 ? 1 : 0);
    const [p0, ...more] = o.pic === null ? [] : deck.deal(o.name, o.store || 'bar', extra, rnd(x, y, 42), o.pic || null);
    const neon = { name: o.sign ?? o.name, kind: o.neon || 'bar', col, ...(p0 ? { pic: p0 } : {}), ...(more.length ? { pics: more } : {}), ...(o.blade ? { blade: o.blade } : {}), ...(o.picV ? { picV: o.picV } : {}), dress: true, ...(rnd(x, y, 43) < 0.3 ? { flick: 1 } : {}) };
    const st = shop.kind, food = st === 'cafe' || st === 'diner';
    let poi = o.poi === undefined ? (food ? { kind: 'coffee', label: o.name, food: st === 'diner' } : { kind: 'delivery', label: o.name }) : o.poi;
    if (poi && poi.kind === 'delivery' && o.walk && !o.key) poi = { ...poi, walk: true, store: st };
    const home = o.home !== undefined ? o.home : floors >= 3 && w >= 6 && rnd(x, y, 41) < 0.4 ? { kind: 'apartment' } : null;
    // (a low front's roof: a picture sign standing at its front edge over the street - a y < 0 from the roof's south
    // edge: client/art2/game/statics.js - its AC and vents behind)
    const kit = o.kit || (!o.garden && floors <= 3 && w >= 6 && rnd(x, y, 44) < (floors <= 2 ? 0.7 : 0.4) ? [[`npic|${deck.deal(null, null, 0, rnd(x, y, 45), null, ROOF_PICS)[0]}`, Math.round(w * TILE / 2), -26], ['ac', Math.round(w * TILE * 0.25), 90], ['vent', Math.round(w * TILE * 0.7), 140], ['acs', Math.round(w * TILE * 0.55), 60]] : null);
    return { arch: o.arch || 'nightrow', ...(o.key ? { key: o.key } : food ? { key: 'rest2' } : {}), art: { spec, shop, neon, ...(kit ? { kit } : {}) }, name: o.name, poi, ...(home ? { home } : {}), door: side === 'left' ? x : x + w - 1, whole: true };
  };
  // a back facing a street to its north (its front unseen): one or two floors, a sign standing on its roof over that
  // street (the kit's 'neon|WORD|colour' at the roof's north edge), the AC and vents round it
  const back = (x, y, w, o = {}) => {
    const f = faceOf(rnd(x, y, 50)), floors = o.floors ?? (rnd(x, y, 51) < 0.6 ? 2 : 1);
    const words = ['BAR', 'KARAOKE', 'HOTEL', 'LIVE', 'RAMEN', 'OPEN 24', 'DANCE', 'GAMES', 'SUSHI', 'COCKTAILS', 'TATTOO', 'LOUNGE', 'NOODLES', 'CLUB', 'VIDEO', 'PLAY'];
    const kit = [];
    // (its roof's sign over the boulevard: half of them a picture of the owner's sheets - client/art2/game/statics.js 'npic')
    if (w >= 6 && rnd(x, y, 52) < 0.75) kit.push(rnd(x, y, 58) < 0.5 ? [`npic|${deck.deal(null, null, 0, rnd(x, y, 59), null, ROOF_PICS)[0]}`, Math.round(w * TILE / 2), 12] : [`neon|${pick(words, rnd(x, y, 53))}|${Math.floor(rnd(x, y, 54) * 7)}`, Math.round(w * TILE / 2), 12]);
    kit.push(['ac', Math.round(w * TILE * 0.3), 80], ['vent', Math.round(w * TILE * 0.7), 120], ['acs', Math.round(w * TILE * 0.5), 160]);
    if (rnd(x, y, 55) < 0.4) kit.push(['dish', Math.round(w * TILE * 0.8), 60]);
    // (the back wall on the alley, the camera's side: its roll shutter, a lantern or a small sign beside it, the AC)
    const neon = { name: null, trim: false, col: Math.floor(rnd(x, y, 55) * 7), dress: { back: 1 }, top: 8, ...(rnd(x, y, 49) < 0.7 ? { pics: deck.deal(null, null, 0, rnd(x, y, 48), null, PIC_BACK) } : {}) };
    return { arch: 'nightrow', art: { spec: { floors, ...f, win: pick(WINS, rnd(x, y, 56)), parapet: 8, grime: 0.3, roofMat: 'tar', lip: 10, rimW: 4, blades: [] }, noShop: true, kit, neon }, name: o.name || null, home: rnd(x, y, 57) < 0.5 ? { kind: 'apartment' } : null, whole: true };
  };
  const place = (L) => { const b = K.building(L); if (b) { if (L.home) out.homes++; if (L.poi) out.shops++; } return b; };

  // a row of lit fronts facing south along [x0, x1) in the band [y0, y1]: `list` first, then the strip's mix
  const litRow = (x0, x1, y0, y1, list = [], o = {}) => {
    let k = 0;
    const depth = o.depth || 14;
    return K.row(x0, x1, y0, y1, (x, room) => {
      if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
      const L = k < list.length ? list[k++] : null;
      if (L) {
        if (L.gap) return { gap: Math.min(room, L.gap), kind: L.kind || 'passage' };
        const w = Math.min(room, L.w);
        if (L.lot) return { w, depth: L.depth || depth, ...L.lot };
        return { w, depth: L.depth || depth, ...lit(x, y1, w, { floors: o.floors, ...L }) };
      }
      const r = rnd(x, y1, 60);
      if (r < 0.05 && o.passages !== false) return { gap: 2 + Math.floor(rnd(x, y1, 61) * 2), kind: 'passage' };
      const cat = r < 0.4 ? 'bar' : r < 0.72 ? 'food' : 'shop';
      const q = (rnd(x, y1, 67) < 0.35 && biz(cat === 'bar' ? BAR : cat === 'food' ? FOOD : SHOP, x, y1, 62)) || composeNeon(used, cat, (k) => rnd(x + k, y1, 68)) || composeNeon(used, 'shop', (k) => rnd(x, y1 + k, 69));
      const w = Math.min(room, 6 + Math.floor(rnd(x, y1, 65) * 4));
      if (!q) return { gap: Math.min(room, 4), kind: 'garden' };
      return { w, depth, ...lit(x, y1, w, { name: q[0], store: q[1], neon: q[2], blade: rnd(x, y1, 66) < 0.5 ? q[3] : null, floors: o.floors, walk: q[1] !== 'bar' && q[1] !== 'diner' && q[1] !== 'cafe' && q[1] !== 'arcade' }) };
    }, o);
  };
  // a row of backs facing a street to the north (their fronts unseen), against the band's north edge
  const backRow = (x0, x1, y0, y1, o = {}) => K.row(x0, x1, y0, y1, (x, room) => {
    if (room < 4) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    if (rnd(x, y0, 70) < 0.08) return { gap: Math.min(room, 4 + Math.floor(rnd(x, y0, 71) * 3)), kind: 'yard' };
    const w = room <= 12 ? room : Math.min(room, 7 + Math.floor(rnd(x, y0, 72) * 6));
    return { w, depth: o.depth || Math.min(y1 - y0 + 1, 10 + Math.floor(rnd(x, y0, 73) * 3)), ...back(x, y0, w, o), face: 'N' };
  }, { north: true });

  // ===========================================================================================================
  // The headland between the bridges (Harbor Walk to the boulevard)
  const [bx0, bx1] = span(NX.bridgeW, 'art', NX.bridgeE, 'art');   // 2983..3154
  const by1 = NY.blvd - EXT.blvd - 1;                               // 2192: the boulevard row's front
  // the waterfront first (the promenade along the shore, the marina, the party boat) and the plaza
  waterfront(K, bx0, bx1, NY.walk - EXT.st - 1, out);
  blossomPlaza(K, PLAZA[0], LANE[1] + 1, PLAZA[1] - PLAZA[0], by1 - LANE[1], out);
  // the night market: Lantern Lane across the headland, its stalls, lanterns and gates
  lanternLane(K, bx0, bx1, out);
  // the lane's north row: fronts facing south onto the lane (2-3 floors), set back from Harbor Walk behind terraces
  const ly0 = NY.walk + EXT.st + 4, ly1 = LANE[0] - 1;
  K.fill(bx0, NY.walk + EXT.st + 1, bx1 - bx0, 3, T.PLAZA);
  litRow(bx0, PLAZA[0], ly0, ly1, [
    { w: 12, name: 'Mic Drop Karaoke', store: 'bar', neon: 'lounge', blade: 'KARAOKE', sign: 'MIC DROP', floors: 4 },
    { w: 8, name: 'Lucky Cat', store: 'bar', neon: 'bar', blade: 'BAR' },
    { w: 8, name: 'Dumpling Moon', store: 'diner', neon: 'diner' },
    { w: 10, name: 'Ink Tiger Tattoo', store: 'salon', neon: 'club', sign: 'TIGER INK', walk: false },
    { w: 9, name: 'Rooftop 88', store: 'bar', neon: 'lounge', garden: true },
  ], { depth: 14, floors: 3 });
  litRow(PLAZA[1], bx1, ly0, ly1, [
    { w: 18, lot: clubLot('clubeclipse', 'The Midnight', 4, 'club', 'panther'), depth: 16 },
    { w: 10, name: 'Vinyl Vault', store: 'records', neon: 'bar', blade: 'VINYL', walk: true },
    { w: 8, name: 'Bao Bar', store: 'diner', neon: 'diner', blade: 'BAO' },
  ], { depth: 14, floors: 3 });
  // between the two: Lantern Hall, the market's food hall, its front on the lane facing down Blossom Plaza; a garden of
  // cherry trees either side of it, the terraces behind it to Harbor Walk planted (landscape(), below)
  {
    const hw = 28, hx = Math.round((PLAZA[0] + PLAZA[1]) / 2 - hw / 2);
    place({ x: hx, y: ly1 - 13, w: hw, h: 14, ...lit(hx, ly1, hw, { name: 'Lantern Hall', store: 'diner', neon: 'diner', blade: 'FOOD HALL', sign: 'LANTERN HALL', floors: 2, key: 'market', poi: { kind: 'coffee', label: 'Lantern Hall', food: true }, home: null }) });
    for (const [gx0, gx1] of [[PLAZA[0], hx], [hx + hw, PLAZA[1]]]) {
      K.fill(gx0, ly0, gx1 - gx0, ly1 - ly0 + 1, T.GRASS);
      for (let ty = ly0 + 2; ty < ly1 - 1; ty += 6) prop('tree_a', (gx0 + gx1) / 2, ty + 1, 10, { sp: 'cherry', k: 1.2 });
      prop('bench_m', (gx0 + gx1) / 2, ly1 - 0.8, 0); prop('lamp', gx0 + 0.8, ly1 - 0.6, 0);
    }
  }
  // the boulevard row: the lit fronts of NE1, 3-4 floors (the stalls' strip and the lane behind them stay in view)
  const ry0 = LANE[1] + 1;
  litRow(bx0, PLAZA[0], ry0, by1, [
    { w: 20, lot: clubLot('clubnova', 'Club Ultraviolet', 5, 'club', null, 'CROWN'), depth: 22 },
    { w: 11, name: 'Afterglow', store: 'clothes', neon: 'bar', pic: 'tiger', sign: 'AFTERGLOW', poi: { kind: 'clothing', label: 'Afterglow' }, floors: 4 },
    { w: 8, name: 'Moon Burger 24', store: 'diner', neon: 'diner', blade: 'OPEN 24', floors: 4 },
    { w: 10, name: 'Nite Mart', store: 'mart', neon: 'mart', sign: 'NITE MART 24/7', poi: { kind: 'convenience', label: 'Nite Mart 24/7' }, floors: 4 },
    { w: 9, name: 'Neon Pawn', store: 'pawn', neon: 'mart', sign: 'PAWN & GUNS', poi: { kind: 'pawn', label: 'Neon Pawn & Guns' }, floors: 4 },   // (2026-10-23: the shops where you need them)
  ], { depth: 22, floors: 4 });
  litRow(PLAZA[1], bx1, ry0, by1, [
    // (the owner, 10-25: "a really awesome arcade in the neon district" - the flagship: the biggest floor of them all,
    // its cabinets in rows and the long prize counter - shared/homelayout.js 'arcadeflag', server/systems/arcade.js)
    { w: 24, lot: { arch: 'arcade', key: 'arcade', name: 'Pixel Arcade', poi: { kind: 'delivery', label: 'Pixel Arcade', flagship: true }, whole: true,
      art: { ...litArt(5, 'arcade', 'PIXEL ARCADE', 'arcade', 3, 'gamepad', 'GAMES'), kit: [['npic|gamezone', 384, 680], ['hvac', 120, 200], ['ac', 560, 260], ['vent', 300, 120], ['acs', 640, 420], ['dish', 80, 520]] } }, depth: 22 },
    { w: 14, lot: clubLot('club', 'Luna Lounge', 4, 'lounge', null, 'LOUNGE'), depth: 22 },
    { w: 9, name: 'Night Owl Ramen', store: 'diner', neon: 'diner', blade: 'RAMEN', floors: 4 },
  ], { depth: 22, floors: 4 });

  // the west end of the boulevard's north side (Westside Avenue to the point): a row of lit fronts, the shore walk
  // behind them
  shorePromenade(K, NX.westside + EXT.ave + 1, 2941, by1 - 16, out, 8);
  litRow(NX.westside + EXT.ave + 1, 2941, by1 - 17, by1, [{ w: 12, name: 'Hotel Halo', store: 'lobby', neon: 'hotel', blade: 'ROOMS', floors: 5, key: 'hotel', poi: { kind: 'delivery', label: 'Hotel Halo' } }], { depth: 18, floors: 3 });

  // ===========================================================================================================
  // The west point (the shore to the Midtown Bridge): the beach and its rocks, the Neon Palms Hotel's tower over them
  westPoint(K, out, lit);
  // The east of the headland (the Civic Bridge to the shore): The Violet Room's tower at the crossroads, The Starlight
  eastHeadland(K, out, lit);
  // The waterfront east of the headland (the shore curving south to where the boulevard meets the water): the
  // promenade along the shore, a row of fronts on the boulevard
  {
    const x0 = 3240, x1 = 3416;
    shorePromenade(K, x0, x1, by1 - 14, out, 8);
    litRow(x0, x1, by1 - 21, by1, [{ w: 16, lot: clubLot('club', 'Volt', 4, 'club', null, 'DANCE'), depth: 22 }, { w: 14, name: 'Stardust', store: 'bar', neon: 'lounge', blade: 'JAZZ', floors: 4 }], { depth: 22, floors: 4, passages: false });
    waterGardens(K, x0, x1, by1 - 22, out);
  }

  // ===========================================================================================================
  // South of the boulevard: band A (the boulevard to Lantern Street) - the backs on the boulevard, Glow Alley, the
  // lit row on Lantern Street; band B (Lantern Street to Crosstown Avenue) - the backs on Lantern Street, Neon Back
  // Alley, the row on Crosstown Avenue
  const [ay0, ay1] = band(NY.blvd, 'blvd', NY.lantern, 'st');      // 2208..2243
  const [cy0, cy1] = band(NY.lantern, 'st', NY.cross, 'ave');       // 2257..2292
  const blocks = [[NX.westside, 'ave', NX.parkW, 'ave'], [NX.parkW, 'ave', NX.parkE, 'ave'], [NX.parkE, 'ave', NX.civic, 'ave'], [NX.civic, 'ave', NX.harborview, 'ave']];
  // (the owner, 10-25: "lantern alleyways") two walkways through the blocks, red lanterns strung wall to wall over them:
  // Lantern Alley from the boulevard (facing Blossom Plaza across it) through to Lantern Street, Red Lantern Row from
  // Lantern Street to Crosstown Avenue
  const walks = [lanternAlley(K, 3066, ay0, ay1, 'Lantern Alley', out), lanternAlley(K, 3250, cy0, cy1, 'Red Lantern Row', out)];
  const rows = [];
  for (const [a, ka, b, kb] of blocks) {
    const [x0, x1] = span(a, ka, b, kb);
    // (the crossroads' south-west corner: the 24/7 mart's car park on the boulevard, its vending machines - D8)
    if (a === NX.parkW) crossroadsLot(K, x1 - 26, ay0, 26, AL.a - 2 - ay0 + 1, out);
    backRow(x0, x1, ay0, AL.a - 2);
    rows.push(litRow(x0, x1, AL.a + 2, ay1, [], { depth: 99, floors: a === NX.parkE ? 3 : 2 + (rnd(x0, ay1, 80) < 0.5 ? 1 : 0) }));
    backRow(x0, x1, cy0, AL.b - 2);
    rows.push(litRow(x0, x1, AL.b + 2, cy1, a === NX.parkE ? [{ w: 18, lot: { arch: 'theatre', key: 'theatre', name: 'The Starlight', poi: { kind: 'delivery', label: 'The Starlight' }, whole: true } }] : [], { depth: 99, floors: 3 }));
  }
  // the lanterns: zig-zagging across the two service alleys from the backs' walls to the rows', across the walkways
  // and the passages between fronts, wall to wall
  for (const ya of [AL.a, AL.b]) alleyLanterns(K, ya, NX.westside + EXT.ave + 1, NX.harborview - EXT.ave, out);
  for (const W of walks) dressWalk(K, W, out);
  for (const made of rows) passageLanterns(K, made, out);
  // Harbor Lights, the festival ground where the boulevard meets the water (NE3-NE8's waterfront festival): the big
  // wheel, the stage and its screen, food stalls, a lawn under strings of lights, the pier out into the bay
  harborLights(K, 3422, out);
  // The Docks: east of Harborview Avenue down to the Gulf Loop - a warehouse club, the container bar, stacked containers
  docks(K, NX.harborview + EXT.ave + 1, out, lit);

  // what the plan left open: lawn with palms and flowering trees (else the kit's seal paves it - the owner, 2026-10-17:
  // "a lot of big open pavilion spaces")
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.55 ? ['palm_a', pick(['royal', 'coconut'], rnd(x, y, 820)), 1.15 + rnd(x, y, 821) * 0.2] : r < 0.85 ? ['tree_a', pick(['cherry', 'magnolia', 'cherry'], rnd(x, y, 822)), 1.1] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 823)), null, 1] });
  dressing(K, out, poi0);
  out.named = used.size;
  out.pics = Object.fromEntries(deck.counts);   // (how often each picture sign was dealt: test/neonstrip.test.js)
  return out;

  // a club's lot: its key (the generator's club kinds: the dance floor inside, the line and the bouncers -
  // server/systems/nightclubs.js), its neon (the name, a picture, a blade)
  function clubLot(key, name, floors, neonKind, pic = null, blade = null) {
    out.clubs++;
    return { arch: 'club', key, name, poi: { kind: 'delivery', label: name }, whole: true, art: litArt(floors, 'bar', name, neonKind, 4, pic, blade) };
  }
  // the art of a lit building placed whole (a club, the arcade): dark walls, its neon
  function litArt(floors, store, name, neonKind, people = 3, pic = null, blade = null) {
    const f = faceOf(rnd(floors, name.length, 90));
    const [p0, ...more] = deck.deal(name, neonKind === 'arcade' ? 'arcade' : 'club', floors >= 4 ? 2 : 1, rnd(floors, name.length, 92), pic);
    return { spec: { floors, ...f, win: pick(WINS, rnd(name.length, floors, 91)), parapet: 12, grime: 0.2, roofMat: 'rubber', lip: 10, rimW: 4, blades: [] }, shop: { kind: store, door: 'right', open: true, people, sign: null, awning: ['#16121e', '#16121e'] },
      neon: { name, kind: neonKind, col: (ci++ * 3) % 7, pic: p0, ...(more.length ? { pics: more } : {}), ...(blade ? { blade } : {}), dress: true, flick: 1 } };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The waterfront behind the headland (NE2): the promenade along the shore - paving, a rail at the water's edge,
// palms strung with lights, benches, lamps - and the marina's jetties out into the bay with the boats tied up (the
// party boat, lit, at the end of the longest: m.marina), the boat hire's kiosk
function waterfront(K, x0, x1, yS, out) {
  const { m, prop, rnd } = K;
  // the promenade: from the water's edge to Harbor Walk's pavement, every column
  let n = 0;
  for (let x = x0; x < x1; x++) {
    let y = yS;
    while (y > yS - 40 && m.land[y * m.w + x] && m.tiles[y * m.w + x] !== T.WATER && m.tiles[y * m.w + x] !== T.DEEP) y--;
    const top = y + 1;
    if (yS - top < 2) continue;
    // (paved by the water and along the street; between them, where it's deep enough, lawn beds cut by a path every
    // fourteen columns)
    for (let yy = top; yy <= yS; yy++) K.fill(x, yy, 1, 1, yS - top >= 10 && yy >= top + 6 && yy <= yS - 3 && (x - x0) % 14 > 2 ? T.GRASS : T.PLAZA);
    if ((x - x0) % 14 === 8 && yS - top >= 10) prop(rnd(x, top, 9) < 0.5 ? 'tree_a' : 'flowers_big', x + 0.5, top + 7.5, 10, { sp: 'cherry', k: 1.1 });
    if (x % 7 === 3 && yS - top >= 6) prop('palm_a', x + 0.5, top + 3.2, 10, { sp: 'royal', k: 1.25 });
    if (x % 11 === 6) prop('bench_m', x + 0.5, top + 1.6, 0);
    if (x % 9 === 1) prop('lamp', x + 0.5, top + 0.8, 0);
    if (x % 3 === 0) prop('rail', x, top + 0.2, 0, { tx: 3 * TILE, ty: 0 });
    n++;
  }
  // the boardwalk along the water's edge: timber decking in lengths (a 'patio' flat) - not the plain paving
  for (let x = x0; x + 6 <= x1; x += 6) {
    let y = yS;
    while (y > yS - 40 && m.land[y * m.w + x + 3] && m.tiles[y * m.w + x + 3] !== T.WATER && m.tiles[y * m.w + x + 3] !== T.DEEP) y--;
    if (yS - y > 6) prop('patio', x + 3, y + 2.6, 0, { w: 6 * TILE, h: 3 * TILE, k: 'deck' });
  }
  // along the promenade's street side: palms in a row with lights strung between them, tables under umbrellas by the
  // marina, a kiosk, bikes
  let last = null;
  for (let x = x0 + 3; x < x1 - 2; x += 8) {
    if (!K.m.land[(yS - 2) * K.m.w + x] || K.m.tiles[(yS - 2) * K.m.w + x] !== T.PLAZA) { last = null; continue; }
    prop('palm_a', x + 0.5, yS - 1.6, 10, { sp: 'royal', k: 1.15 });
    if (last !== null) fest(K, last + 0.5, yS - 2.2, x - last, 0, 60, 'palm', 'palm');
    last = x;
  }
  for (let k = 0; k < 5; k++) { prop('cafetable', 3054 + k * 8, yS - 5, 0); prop(k % 2 ? 'umbrella_b' : 'umbrella_r', 3054 + k * 8, yS - 5.1, 0); }
  prop('news_b', 3046, yS - 4, 0); prop('foodcart', 3100, yS - 4.5, 14); prop('bikerack', 3036, yS - 3.5, 0);
  // the marina: three jetties north into the bay, the boats along them; the party boat at the end of the middle one
  const jx = [3050, 3071, 3092];
  jx.forEach((x, k) => {
    const len = k === 1 ? 16 : 11;
    let y = yS;
    while (y > yS - 40 && m.land[y * m.w + x]) y--;
    for (let i = 0; i < len; i++) for (let o = -1; o <= 1; o++) { const t = m.tileAt(x + o, y - i); if (t === T.WATER || t === T.DEEP) m.set(x + o, y - i, T.DOCK); }
    for (let i = 2; i < len - 1; i += 3) { m.marina.push({ x: (x + 2.6) * TILE, y: (y - i) * TILE, a: -Math.PI / 2, kind: i % 2 ? 'speedboat' : 'dinghy' }); m.marina.push({ x: (x - 1.8) * TILE, y: (y - i - 1) * TILE, a: Math.PI / 2, kind: 'jetski' }); }
    if (k === 1) m.marina.push({ x: (x + 4.2) * TILE, y: (y - len + 4) * TILE, a: -Math.PI / 2, kind: 'waterbus', party: true });
    prop('lamp', x + 0.5, y - len + 1.5, 0);
  });
  prop('textsign', 3071, yS - 1.5, 0, { text: 'HARBOR MARINA', bg: '#16121e', fg: [90, 230, 255], z: 40, sx: 2, lit: true });
  void rnd; out.promenade = n;
  (out.places ||= []).push({ name: 'Harbor Marina', x0: 3040, y0: yS - 30, x1: 3104, y1: yS });
}

// Blossom Plaza (NE2's central plaza): paving, a fountain in the middle under a ring of cherry trees, benches round
// it, the food truck, flower beds, lamps; on its north edge (the lane's side) the eye-patch woman's billboard over it
function blossomPlaza(K, x, y, w, h, out) {
  const { prop } = K;
  const cx = x + w / 2, cy = y + h * 0.55;
  // (the paving: the walk down the middle from the lane to the boulevard, the cross walk, the ring round the fountain,
  // a margin along the boulevard; the four corners lawn under the cherry trees, their beds)
  for (let ty = y; ty < y + h; ty++) for (let tx = x; tx < x + w; tx++) {
    const ex = (tx + 0.5 - cx) / Math.min(w / 2 - 3, 14), ey = (ty + 0.5 - cy) / Math.min(h / 2 - 4, 9), e = ex * ex + ey * ey;
    const paved = Math.abs(tx + 0.5 - cx) < 3.5 || Math.abs(ty + 0.5 - cy) < 2 || e < 1.25 || ty >= y + h - 3 || ty < y + 2;
    K.fill(tx, ty, 1, 1, paved ? T.PLAZA : T.GRASS);
  }
  K.take(x, y, w, h);
  for (const [fx, fy] of [[x + 3, y + 4], [x + w - 3, y + 4], [x + 3, y + h - 5], [x + w - 3, y + h - 5]]) prop('flowers_big', fx, fy, 0);
  prop('fountain', cx, cy, 36);
  for (let k = 0; k < 10; k++) {
    const a = 0, rx = Math.min(w / 2 - 3, 14), ry = Math.min(h / 2 - 4, 9);
    const tx = cx + rx * pseudoCos(k), ty = cy + ry * pseudoSin(k);
    prop('tree_a', tx, ty, 10, { sp: 'cherry', k: 1.25 }); void a;
  }
  for (const [dx, dy] of [[-6, -3], [6, -3], [-6, 3.6], [6, 3.6]]) prop('pbench', cx + dx, cy + dy, 0);
  prop('foodcart', x + 3, y + h - 3, 14);
  prop('flowers_big', x + 2, cy, 0); prop('flowers_big', x + w - 2, cy, 0);
  for (const [fx, fy] of [[0.06, 0.4], [0.94, 0.4], [0.06, 0.95], [0.94, 0.95], [0.3, 0.12], [0.7, 0.12]]) prop('lamp', x + w * fx, y + h * fy, 0);
  // strings of lights over the fountain (the owner, 10-25: they "don't connect to anything" - they hung in the air,
  // ending short of the fountain): a post at each corner of its ring, the lights strung post to post round it and out
  // from each post to the lamp at the plaza's corner
  const posts = [[cx - 7, cy - 4.6], [cx + 7, cy - 4.6], [cx + 7, cy + 4.6], [cx - 7, cy + 4.6]];
  for (let k = 0; k < 4; k++) { const [ax, ay] = posts[k], [bx, by] = posts[(k + 1) % 4]; fest(K, ax, ay, bx - ax, by - ay, 62, 'pole', 'pole'); }
  for (const [k, fx, fy] of [[0, 0.3, 0.12], [1, 0.7, 0.12], [2, 0.94, 0.95], [3, 0.06, 0.95]]) { const lx = x + w * fx, ly = y + h * fy, [px, py] = posts[k]; fest(K, lx, ly, px - lx, py - ly, 58, 'lamp', 'pole'); }
  // the billboard: the eye-patch woman at the plaza's north edge, facing the plaza and the boulevard
  prop('picboard', cx, y + 1.5, 0, { pic: 'lucy', z: 60, col: [255, 80, 200] });
  K.m.squares ||= []; K.m.squares.push({ x: Math.round(cx) - 7, y: Math.round(cy) - 6, w: 14, h: 12, name: 'Blossom Plaza' });
  (out.places ||= []).push({ name: 'Blossom Plaza', x0: x, y0: y, x1: x + w, y1: y + h });
}
// (a circle's points without trigonometry - shared code: CLAUDE.md - a 10-gon's corners, near enough)
const C10 = [[1, 0], [0.809, 0.588], [0.309, 0.951], [-0.309, 0.951], [-0.809, 0.588], [-1, 0], [-0.809, -0.588], [-0.309, -0.951], [0.309, -0.951], [0.809, -0.588]];
const pseudoCos = (k) => C10[k % 10][0], pseudoSin = (k) => C10[k % 10][1];

// Lantern Lane (AL1, NE3-NE8's night-market alleys): the lane across the headland, paved; its stalls down the south
// side, a lantern string across every few tiles, a gate at each end, benches and food carts in the strip behind the
// stalls, string lights over the seating
function lanternLane(K, x0, x1, out) {
  const { prop, rnd, pick } = K;
  const [y0, y1] = LANE;
  K.fill(x0, y0, x1 - x0, y1 - y0 + 1, T.PLAZA);
  const sN = y0 + 3, sS = y1 - 3;   // the two rows of stalls: the north one faces south, the south one north
  for (let x = x0 + 3; x < x1 - 3; x += 4) {
    if (x >= PLAZA[0] - 2 && x <= PLAZA[1] + 1) continue;
    prop('mstall', x + 1, sN, 0, { v: Math.floor(rnd(x, sN, 1) * 4), c: Math.floor(rnd(x, sN, 2) * 4), a: 0 });
    prop('mstall', x + 1, sS, 0, { v: Math.floor(rnd(x, sS, 1) * 4), c: Math.floor(rnd(x, sS, 2) * 4), a: Math.PI });
    // what's stacked by them: crates, a cooler, a stool
    if (rnd(x, y0, 3) < 0.5) prop(pick(['crates', 'cooler', 'fruitcrate', 'crates'], rnd(x, y0, 4)), x + 2.6, sN - 1.4, 0);
    if (rnd(x, y1, 5) < 0.5) prop(pick(['crates', 'cooler', 'fruitcrate', 'bags'], rnd(x, y1, 6)), x + 2.6, sS + 1.6, 0);
    // the lanterns strung across the lane, every other stall; the tables down the middle between
    if ((x - x0) % 8 === 3) fest(K, x + 0.5, sN + 1.2, 0, sS - sN - 2.4, 54, 'pole', 'pole', 'lantern');
    else if ((x - x0) % 8 === 7) { const ty = (y0 + y1) / 2 + 0.5; prop('cafetable', x + 0.5, ty, 0); prop(pick(['umbrella_r', 'umbrella_y', 'umbrella_g'], rnd(x, ty, 7)), x + 0.5, ty - 0.1, 0); prop('chair', x - 0.4, ty + 0.1, 0, { v: 1, a: 0 }); prop('chair', x + 1.4, ty + 0.1, 0, { v: 1, a: 3.1416 }); }
  }
  // a gate at each end (where the lane meets the bridges' avenues), the market's sign over the west one
  for (const gx of [x0 + 1, x1 - 1]) prop('gatearch', gx, (y0 + y1) / 2, 0, { w: Math.round((y1 - y0 - 2) * TILE), a: Math.PI / 2 });
  prop('textsign', x0 + 5, (y0 + y1) / 2 - 2, 0, { text: 'NIGHT MARKET', bg: '#7a1e2a', fg: [255, 214, 120], z: 58, sx: 2, lit: true });
  // food carts and tables at the lane's mouth on the plaza
  for (const [dx, dy] of [[-6, 0], [3, -2], [8, 2]]) prop('foodcart', PLAZA[0] + 6 + dx, (y0 + y1) / 2 + dy, 14);
  for (let k = 0; k < 6; k++) prop('cafetable', PLAZA[0] + 4 + k * 6, (y0 + y1) / 2 + 4.5, 0);
  (out.places ||= []).push({ name: 'Lantern Lane Night Market', x0, y0, x1, y1 });
  K.m.marketSpots ||= [];
  for (let x = x0 + 6; x < x1 - 6; x += 16) if (x < PLAZA[0] - 2 || x > PLAZA[1] + 2) K.m.marketSpots.push({ x: Math.round(x * TILE), y: Math.round(((y0 + y1) / 2) * TILE), name: 'Lantern Lane' });
}

// The west point: the beach at its tip (sand, rocks, a beach bar, palms, loungers) and the Neon Palms Hotel tower
// (ten floors - the water behind it, so it hides no street) facing the boulevard: its rooftop pool, the HOTEL blade
function westPoint(K, out, lit) {
  const { m, prop, rnd } = K;
  const x0 = 2941, x1 = NX.bridgeW - EXT.art, yB = NY.blvd - EXT.blvd - 1;
  // the beach: every free tile north of the hotel's lot
  for (let y = 2088; y < 2158; y++) for (let x = x0; x < x1; x++) if (K.free(x, y)) { m.tiles[y * m.w + x] = T.SAND; K.take(x, y, 1, 1); }
  for (const [x, y, s] of [[2948, 2103, 34], [2952, 2099, 26], [2944, 2112, 30], [2958, 2097, 22]]) prop('boulder', x, y, 14, { s });
  for (const [x, y] of [[2950, 2120], [2962, 2114], [2946, 2134], [2964, 2140], [2956, 2128]]) prop('palm_a', x, y, 10, { sp: 'coconut', k: 1.3 });
  for (let k = 0; k < 4; k++) prop('lounger', 2950 + k * 3, 2146, 0);
  prop('umbrella_r', 2953, 2145.6, 0); prop('umbrella_y', 2959, 2145.6, 0);
  K.building({ x: 2954, y: 2124, w: 9, h: 6, arch: 'beachbar', key: 'beachbar', name: 'Tiki Glow', poi: { kind: 'coffee', label: 'Tiki Glow Beach Bar' }, whole: true });
  for (const [x, y] of [[2951, 2131], [2966, 2131]]) prop('torch', x, y, 6);   // (the tiki torches)
  // the hotel
  const w = x1 - x0;
  K.building({ x: x0, y: 2160, w, h: yB - 2160 + 1, arch: 'hotel', key: 'hotel', name: 'Neon Palms Hotel', poi: { kind: 'delivery', label: 'Neon Palms Hotel' }, whole: true,
    art: { spec: { floors: 10, style: 'glass', parapet: 14, roofMat: 'paver', lip: 10, rimW: 5, blades: [] }, shop: { kind: 'lobby', door: 'right', open: true, people: 3, sign: null, awning: ['#16121e', '#16121e'] },
      neon: { name: 'NEON PALMS', kind: 'hotel', col: 5, blade: 'HOTEL', pic: 'panther', picV: 200, pics: ['hotelv', 'rooftop', 'nightlifev'], dress: true },
      kit: [['palm', 60, 60], ['palm', 200, 60], ['lounge', 100, 130], ['lounge', 150, 130], ['umb', 240, 140], ['plant', 40, 200], ['plant', 300, 200], ['string', 160, 90], ['hut', 300, 300], ['ac', 80, 400]] } });
  void lit; (out.places ||= []).push({ name: 'Glow Beach', x0, y0: 2088, x1, y1: 2158 });
}

// East of the headland: The Violet Room's tower at the crossroads (seven floors; the marina and the water behind it),
// the eye-patch woman down its face, the club on its ground floor; The Starlight picture house on the boulevard
function eastHeadland(K, out, lit) {
  const { prop } = K;
  const x0 = NX.bridgeE + EXT.art + 1, yB = NY.blvd - EXT.blvd - 1;
  K.building({ x: x0, y: 2150, w: 22, h: yB - 2150 + 1, arch: 'club', key: 'club', name: 'The Violet Room', poi: { kind: 'delivery', label: 'The Violet Room' }, whole: true,
    art: { spec: { floors: 7, style: 'concrete', wallColor: '#2a2436', win: 'tall', parapet: 14, grime: 0.15, roofMat: 'rubber', lip: 10, rimW: 5, blades: [] }, shop: { kind: 'bar', door: 'left', open: true, people: 4, sign: null, awning: ['#16121e', '#16121e'] },
      neon: { name: 'VIOLET ROOM', kind: 'club', col: 3, pic: 'lucy', picV: 150, blade: 'DANCE', pics: ['clubv', 'nightclub', 'sake'], dress: true } } });
  out.clubs++;
  // beside it on the boulevard: Afterdark, then a lit front or two
  let k = 0;
  K.row(x0 + 23, 3238, 2150, yB, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    const w = Math.min(room, k === 0 ? 14 : 9);
    const L = k++ === 0 ? lit(x, yB, w, { name: 'Afterdark', key: 'club', store: 'bar', neon: 'club', blade: 'CLUB', floors: 3, poi: { kind: 'delivery', label: 'Afterdark' } }) : lit(x, yB, w, { name: 'Sushi Sora', store: 'diner', neon: 'diner', blade: 'SUSHI', floors: 3 });
    return { w, depth: 22, ...L };
  });
  // the promenade round the point behind them, the waterfront lounge looking out over the bay and its terrace (the
  // strip just north of the tower stays plain paving: its height stands over it)
  shorePromenade(K, x0, 3240, 2149, out, 12);
  let kk = 0;
  const lb = K.row(x0, 3236, 2104, 2128, (x, room) => { if (room < 8) return room >= 1 ? { gap: room, kind: 'plaza' } : null; const w = Math.min(room, kk === 0 ? 24 : 18); const L = kk++ === 0 ? lit(x, 2128, w, { name: 'Bayview Lounge', store: 'bar', neon: 'lounge', floors: 2, garden: true }) : lit(x, 2128, w, { name: 'Seaglass Grill', store: 'diner', neon: 'diner', blade: 'GRILL', floors: 2, garden: true }); return { w, depth: 99, ...L }; });
  for (let x = x0 + 2; x < 3232; x += 5) { prop('cafetable', x, 2131.5, 0); prop(x % 2 ? 'umbrella_r' : 'umbrella_b', x, 2131.4, 0); }
  fest(K, x0 + 1, 2130, 3232 - x0 - 2, 0, 44, 'pole', 'pole');
  void lb;
}

// The gardens between the waterfront's promenade and its row on the boulevard: lawns either side of paths, palms
// and flowering trees, benches, lamps - where the Harbor Footbridge comes down
function waterGardens(K, x0, x1, yS, out) {
  const { m, prop, rnd, pick } = K;
  let n = 0;
  for (let x = x0; x < x1; x++) for (let y = yS - 60; y <= yS; y++) if (K.free(x, y)) { m.tiles[y * m.w + x] = (x % 12 === 0 || y % 10 === 0) ? T.PLAZA : T.GRASS; K.take(x, y, 1, 1); n++; }
  for (let x = x0 + 4; x < x1 - 2; x += 7) for (let y = yS - 50; y < yS - 2; y += 9) {
    if (m.tiles[y * m.w + x] !== T.GRASS) continue;
    const r = rnd(x, y, 1);
    if (r < 0.45) prop('palm_a', x + 0.5, y + 0.5, 10, { sp: pick(['royal', 'coconut'], rnd(x, y, 2)), k: 1.2 });
    else if (r < 0.65) prop('tree_a', x + 0.5, y + 0.5, 10, { sp: pick(['cherry', 'magnolia'], rnd(x, y, 3)), k: 1.1 });
    else if (r < 0.8) prop('bench_m', x + 0.5, y + 0.5, 0);
    else prop('flowers_big', x + 0.5, y + 0.5, 0);
  }
  for (let x = x0 + 6; x < x1; x += 12) prop('lamp', x + 0.5, yS - 0.6, 0);
  (out.places ||= []).push({ name: 'Waterfront Gardens', x0, y0: yS - 60, x1, y1: yS });
  void n;
}

// Harbor Lights: east of where the boulevard meets the water - the big wheel on the shore, the stage with its screen
// and speakers facing a lawn, food stalls in a row, strings of lights over the tables, palms, a pier out into the bay
function harborLights(K, x0, out) {
  const { m, prop, rnd } = K;
  const y0 = 2196, y1 = 2259;   // down to The Docks
  let n = 0;
  // (the ground a festival lawn; paved where people gather - the stage's forecourt, the stalls' rows, the wheel's pad,
  // the walk along the shore and in from the boulevard's end)
  const PAVED = [[3440, 2226, 3472, 2242], [3482, 2226, 3518, 2240], [3526, 2249, 3562, 2258], [3552, 2248, 3574, 2259], [3574, 2222, 3594, 2242]];
  const paved = (x, y) => PAVED.some(([a, b, c, d]) => x >= a && y >= b && x < c && y < d) || (y >= 2218 && y < 2221) || (x >= 3478 && x < 3481) || (x >= 3532 && x < 3535 && y < 2249);
  for (let y = y0; y <= y1; y++) for (let x = x0; x < 3640; x++) if (K.free(x, y)) { m.tiles[y * m.w + x] = paved(x, y) ? T.PLAZA : T.GRASS; K.take(x, y, 1, 1); n++; }
  if (n < 200) return;
  // the lawn's trees: palms on a loose grid, where the lawn is open round them
  for (let gy = y0 + 2; gy < y1 - 2; gy += 7) for (let gx = x0 + 2; gx < 3636; gx += 7) {
    const tx = gx + Math.floor(rnd(gx, gy, 20) * 5), ty = gy + Math.floor(rnd(gx, gy, 21) * 5);
    let ok = rnd(tx, ty, 22) > 0.35;
    for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (m.tileAt(tx + dx, ty + dy) !== T.GRASS) { ok = false; break; }
    if (ok) prop('palm_a', tx + 0.5, ty + 0.5, 10, { sp: rnd(tx, ty, 23) < 0.6 ? 'coconut' : 'royal', k: 1.2 + rnd(tx, ty, 24) * 0.2 });
  }
  // the beach along the water's edge, four tiles of sand
  for (let y = y0; y <= y1; y++) for (let x = x0; x < 3640; x++) {
    const i = y * m.w + x;
    if (m.tiles[i] !== T.PLAZA && m.tiles[i] !== T.GRASS) continue;
    let wet = false;
    for (let d = 1; d <= 4 && !wet; d++) for (const [dx, dy] of [[0, -d], [d, 0], [d, -d]]) { const t = m.tileAt(x + dx, y + dy); if (t === T.WATER || t === T.DEEP) { wet = true; break; } }
    if (wet) m.tiles[i] = T.SAND;
  }
  prop('ferris', 3584, 2232, 60);
  prop('gazebo', 3540, 2246, 20);
  // the lawns: palms and flowering trees, picnic tables, a second row of stalls toward the docks
  for (const [x, y] of [[3540, 2240], [3560, 2234], [3580, 2246], [3600, 2250], [3556, 2252]]) if (m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.PLAZA || m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.GRASS) prop('palm_a', x, y, 10, { sp: 'coconut', k: 1.3 });
  for (const [x, y] of [[3494, 2246], [3506, 2244], [3488, 2250]]) prop('picnic', x, y, 0);
  for (let k = 0; k < 6; k++) if (m.tiles[2254 * m.w + 3530 + k * 5] === T.PLAZA) prop('mstall', 3531 + k * 5, 2254, 0, { v: (k + 2) % 4, c: k % 4, a: 0 });
  fest(K, 3528, 2252, 30, 0, 50, 'pole', 'pole');
  prop('dscreen', 3500, 2234.5, 0); prop('dspeaker', 3490, 2235.5, 0); prop('dspeaker', 3510, 2235.5, 0);
  prop('textsign', 3500, 2232.5, 0, { text: 'HARBOR LIGHTS', bg: '#16121e', fg: [255, 110, 200], z: 96, sx: 2, lit: true });
  for (let x = 3474; x < 3530; x += 7) if (m.tiles[2257 * m.w + x] !== T.ROAD) prop('lamp', x, 2257, 0);   // (none out on Harborview Avenue)
  for (let k = 0; k < 8; k++) prop('cafetable', 3556 + (k % 4) * 4, 2252 + (k >> 2) * 3.5, 0);
  fest(K, 3554, 2250, 16, 0, 50, 'pole', 'pole'); fest(K, 3554, 2254, 16, 0, 50, 'pole', 'pole');
  for (let k = 0; k < 6; k++) prop('mstall', 3444 + k * 4, 2238, 0, { v: k % 4, c: (k + 1) % 4, a: Math.PI });
  for (let k = 0; k < 5; k++) { prop('cafetable', 3446 + k * 4.4, 2232, 0); prop(k % 2 ? 'umbrella_r' : 'umbrella_y', 3446 + k * 4.4, 2231.9, 0); }
  fest(K, 3442, 2230, 24, 0, 50, 'pole', 'pole');
  for (const [x, y] of [[3446, 2240], [3482, 2244], [3512, 2236], [3530, 2244], [3520, 2228]]) if (m.tiles[Math.floor(y) * m.w + Math.floor(x)] !== T.WATER) prop('palm_a', x, y, 10, { sp: 'royal', k: 1.3 });
  prop('foodcart', 3444, 2246, 14); prop('foodcart', 3500, 2246, 14);
  // the pier: north-east into the bay from the shore
  let px = 3470, py = 2214;
  while (py > 2190 && m.land[py * m.w + px] && m.tiles[py * m.w + px] !== T.WATER) py--;
  for (let i = 0; i < 18; i++) for (let o = -1; o <= 1; o++) { const t = m.tileAt(px + o, py - i); if (t === T.WATER || t === T.DEEP) m.set(px + o, py - i, T.DOCK); }
  for (let i = 4; i < 16; i += 4) prop('lamp', px + 0.5 + 1.6, py - i, 0);
  m.marina.push({ x: (px + 4) * TILE, y: (py - 12) * TILE, a: -Math.PI / 2, kind: 'speedboat' });
  void rnd;
  (out.places ||= []).push({ name: 'Harbor Lights', x0, y0, x1: 3640, y1 });
  (K.m.partySpots ||= []).push({ x: Math.round(3464 * TILE), y: Math.round(2235 * TILE), name: 'Harbor Lights' });
}

// ---- the lantern alleys ------------------------------------------------------------------------------------------
// A walkway 5 tiles wide through a block from street to street (carved before the block's rows, so they stop either
// side of it): paved, its name on the map
function lanternAlley(K, x, y0, y1, name, out) {
  K.fill(x, y0, 5, y1 - y0 + 1, T.PLAZA); K.take(x, y0, 5, y1 - y0 + 1);
  (out.places ||= []).push({ name, x0: x, y0, x1: x + 5, y1: y1 + 1 });
  return { x, y0, y1, w: 5, name };
}
const bldAt = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.bld[y * m.w + x] >= 0;
// a walkway dressed: lanterns strung wall to wall every two tiles where it runs between buildings (zig-zagging), a gate
// at each mouth with its name, paper-lantern posts, vending machines, steam off a grate, crates by the back doors
function dressWalk(K, W, out) {
  const { m, prop, rnd } = K, { x, y0, y1 } = W;
  let n = 0;
  for (let y = y0 + 1; y < y1; y += 2) {
    if (!bldAt(m, x - 1, y) || !bldAt(m, x + 5, y) || !bldAt(m, x - 1, y + 1) || !bldAt(m, x + 5, y + 1)) continue;
    const dy = n % 2 ? 0.8 : -0.8;
    fest(K, x, y + 0.6, 5, dy, 54 + (n % 3) * 4, 'wall', 'wall', 'lantern');
    n++;
  }
  // the mouths: where the walkway meets a street's pavement (its first and last rows)
  for (const [my, up] of [[y0, 1], [y1, -1]]) {
    prop('gatearch', x + 2.5, my + (up > 0 ? 0.6 : 0.4), 0, { w: Math.round(4.4 * TILE), a: 0 });
    prop('textsign', x + 2.5, my + (up > 0 ? 0.7 : 0.5), 0, { text: W.name.toUpperCase(), bg: '#7a1e2a', fg: [255, 214, 120], z: 62, sx: 1, lit: true });
    for (const dx of [0.5, 4.5]) prop('lantern', x + dx, my + up * 1.5 + 0.5, 4);
  }
  for (let y = y0 + 3, k = 0; y < y1 - 2; y += 5, k++) {
    const side = k % 2 ? x + 0.6 : x + 4.4;
    if (m.tiles[y * m.w + Math.floor(side)] !== T.PLAZA) continue;
    const r = rnd(x, y, 95);
    if (r < 0.3) { prop('vend_cola', side, y + 0.5, 8, { c: Math.floor(rnd(x, y, 96) * 5) }); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: side * TILE, y: (y + 1.1) * TILE, r: 32 }); }
    else if (r < 0.55) prop('steam', x + 2.5, y + 0.5, 0, { w: 40, h: 70, s: 1 + (k % 2) });
    else if (r < 0.8) prop(rnd(x, y, 97) < 0.5 ? 'crates' : 'acunit', side, y + 0.5, 0);
    else prop('lantern', side, y + 0.5, 4);
  }
  out.walkLanterns = (out.walkLanterns || 0) + n;
}
// the service alleys behind the rows: lanterns zig-zagging across, from the backs' walls on the north to the walls of
// the row behind on the south (where there are walls both sides), steam off the grates between
function alleyLanterns(K, ya, x0, x1, out) {
  const { m, prop, rnd } = K;
  let n = 0;
  const wallN = (x) => { for (let y = ya; y > ya - 5; y--) if (bldAt(m, x, y)) return y; return -1; };
  const wallS = (x) => { for (let y = ya; y < ya + 5; y++) if (bldAt(m, x, y)) return y; return -1; };
  for (let x = x0 + 2; x < x1 - 3; x += 3) {
    const x2 = x + (n % 2 ? -1 : 2), yN = wallN(x), yS = wallS(x2);
    if (yN < 0 || yS < 0 || wallN(x + 1) !== yN || wallS(x2 + 1) !== yS || rnd(x, ya, 91) < 0.15) continue;
    fest(K, x + 0.5, yN + 1.05, x2 - x, yS - yN - 1.05, 46 + (n % 2) * 6, 'wall', 'wall', 'lantern');
    if (n % 4 === 1) prop('steam', x + 1, ya + 0.5, 0, { w: 36, h: 60, s: 1 });
    n++;
  }
  out.alleyLanterns = (out.alleyLanterns || 0) + n;
}
// the passages between a row's fronts (K.row's gaps): two or three strings across each, wall to wall
function passageLanterns(K, made, out) {
  for (let i = 1; i + 1 < made.length; i++) {
    const g = made[i];
    if (!g.gap || g.gap !== 'passage' || made[i - 1].gap || made[i + 1].gap) continue;
    for (let k = 0; k < 3 && k * 2.5 + 1 < g.h; k++) { const y = g.y + g.h - 0.7 - k * 2.5; if (bldAt(K.m, g.x - 1, Math.floor(y)) && bldAt(K.m, g.x + g.w, Math.floor(y))) { fest(K, g.x, y, g.w, k % 2 ? 0.5 : -0.5, 52, 'wall', 'wall', 'lantern'); out.passLanterns = (out.passLanterns || 0) + 1; } }
  }
}

// A promenade along the shore from x0 to x1, down to row yS: paving, palms, benches, the rail at the edge
function shorePromenade(K, x0, x1, yS, out, deep = 99) {
  const { m, prop } = K;
  for (let x = x0; x < x1; x++) {
    let y = yS;
    while (y > yS - 80 && m.land[y * m.w + x] && m.tiles[y * m.w + x] !== T.WATER && m.tiles[y * m.w + x] !== T.DEEP) y--;
    const top = y + 1;
    if (yS - top < 1) continue;
    for (let yy = top; yy <= Math.min(yS, top + deep - 1); yy++) if (K.free(x, yy)) { K.fill(x, yy, 1, 1, T.PLAZA); }
    if (x % 8 === 4 && yS - top >= 5) prop('palm_a', x + 0.5, top + 2.8, 10, { sp: 'royal', k: 1.2 });
    if (x % 13 === 7) prop('bench_m', x + 0.5, top + 1.4, 0);
    if (x % 10 === 2) prop('lamp', x + 0.5, top + 0.8, 0);
    if (x % 3 === 0) prop('rail', x, top + 0.2, 0, { tx: 3 * TILE, ty: 0 });
  }
  void out;
}

// D8's crossroads, the south-west corner of the boulevard and Park East Avenue: the 24/7 mart and its car park, the
// vending machines by its door, the ramen bar under red lanterns beside it
function crossroadsLot(K, x, y, w, h, out) {
  const { m, prop } = K;
  if (!K.allFree(x, y, w, h)) return;
  K.fill(x, y, w, h, T.LOT); K.take(x, y, w, h);
  for (let sx = x + 1; sx + 3 <= x + w - 10; sx += 3) { m.stalls.push({ x: sx * TILE, y: (y + 2) * TILE, w: 3 * TILE, h: 4 * TILE }); m.parking.push({ x: (sx + 1.5) * TILE, y: (y + 4) * TILE, a: -Math.PI / 2 }); }
  K.building({ x: x + w - 9, y: y + 1, w: 9, h: h - 1, arch: 'mart', name: '24/7 Corner', poi: { kind: 'convenience', label: 'Strip 24/7' }, whole: true, face: 'N' });
  for (const dx of [1.5, 3]) prop('vend_cola', x + dx, y + 0.8, 8);
  prop('lamp', x + 0.8, y + h - 0.8, 0);
  (out.places ||= []).push({ name: 'The Crossroads', x0: x, y0: y, x1: x + w, y1: y + h });
}

// The Docks (NE2's warehouses and containers at the edge): east of Harborview Avenue - Dock 9, a club in a warehouse
// (its roller doors, the neon over them), the container bar (containers stacked into a bar, a deck on top), stacks of
// containers along the fence by the Gulf Loop, a food truck
function docks(K, x0, out, lit) {
  const { m, prop, rnd } = K;
  const y0 = NY.lantern - EXT.st + 0, y1 = NY.cross - EXT.ave - 1;
  // the warehouse club on Lantern Street's line
  const wb = K.building({ x: x0 + 1, y: 2262, w: 26, h: 16, arch: 'club', key: 'club', name: 'Dock 9', poi: { kind: 'delivery', label: 'Dock 9' }, whole: true,
    art: { spec: { floors: 2, style: 'corrugated', wallColor: '#3a3e48', parapet: 6, roofMat: 'metal', lip: 6, rimW: 3, blades: [], grime: 0.4 }, shop: { kind: 'bar', door: 'left', open: true, people: 4, sign: null, awning: null },
      neon: { name: 'DOCK 9', kind: 'club', col: 1, blade: 'LIVE', pics: ['dragon', 'barv'], dress: true } } });
  if (wb) out.clubs++;
  // the container bar and the containers
  for (let k = 0; k < 6; k++) prop('container', x0 + 32 + (k % 3) * 7, 2268 + Math.floor(k / 3) * 4, 30, { v: k, c: Math.floor(rnd(k, 1, 7) * 5) });
  prop('textsign', x0 + 38, 2265, 0, { text: 'BOX BAR', bg: '#16121e', fg: [255, 190, 60], z: 70, sx: 2, lit: true });
  for (let k = 0; k < 4; k++) prop('cafetable', x0 + 32 + k * 3, 2276.5, 0);
  fest(K, x0 + 31, 2276, 14, 0, 44, 'pole', 'pole');
  prop('foodcart', x0 + 30, 2285, 14);
  for (let y = 2280; y < y1 - 1; y++) for (let x = x0; x < x0 + 60; x++) if (K.free(x, y)) { m.tiles[y * m.w + x] = T.LOT; K.take(x, y, 1, 1); }
  for (let k = 0; k < 5; k++) prop('container', x0 + 4 + k * 6.5, y1 - 3, 30, { v: k + 6, c: k % 5 });
  void y0; void lit;
  (out.places ||= []).push({ name: 'The Docks', x0, y0: 2258, x1: x0 + 60, y1 });
}

// The street dressing: palms in grates along the boulevard's north pavement with lights strung between them, the
// club lines' ropes (the art draws them), news boxes and vending machines by the marts, bikes and scooters
function dressing(K, out, poi0) {
  const { m, prop, rnd } = K;
  const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
  const yN = NY.blvd - EXT.blvd + 1.2;
  let last = null;
  for (let x = NX.westside + 10; x < 3410; x += 8) {
    if (Math.abs(x - NX.bridgeW) < 10 || Math.abs(x - NX.bridgeE) < 10 || Math.abs(x - NX.parkW) < 10 || Math.abs(x - NX.parkE) < 10 || Math.abs(x - NX.civic) < 10) { last = null; continue; }
    if (!onWalk(x, yN)) { last = null; continue; }
    prop('palm_a', x + 0.5, yN, 10, { sp: 'royal', k: 1.15 });
    if (last !== null) fest(K, last + 0.5, yN - 0.6, x - last, 0, 64, 'palm', 'palm');
    last = x;
  }
  // the median: royal palms down it with lights strung between them, clear of the junctions (where it stops for the
  // turns)
  let lastM = null;
  for (let x = NX.westside + 14; x < 3408; x += 9) {
    if ([NX.parkW, NX.parkE, NX.civic, NX.bridgeW, NX.bridgeE].some((c) => Math.abs(x - c) < 14)) { lastM = null; continue; }
    prop('palm_a', x + 0.5, NY.blvd + 0.5, 10, { sp: 'royal', k: 1.2 });
    if (lastM !== null) fest(K, lastM + 0.5, NY.blvd - 0.1, x - lastM, 0, 70, 'palm', 'palm');
    lastM = x;
  }
  for (let i = poi0; i < m.pois.length; i++) {
    const p = m.pois[i];
    if (p.kind !== 'convenience' && p.kind !== 'coffee') continue;
    const x = p.x / TILE, y = p.y / TILE;
    if (p.kind === 'convenience' && onWalk(x + 1.8, y + 0.3)) { prop('vend_cola', x + 1.8, y + 0.3, 8); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: (x + 1.8) * TILE, y: (y + 0.9) * TILE, r: 32 }); }
    else if (p.kind === 'coffee' && onWalk(x + 2, y + 0.6) && rnd(x, y, 1) < 0.6) { prop('cafetable', x + 2, y + 0.9, 0); prop('umbrella_r', x + 2, y + 0.8, 0); }
  }
  out.dressed = true;
}
