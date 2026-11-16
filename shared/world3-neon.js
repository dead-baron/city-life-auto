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
import { fest, canopy, terrace, hang, vendor, frontLife } from './world3-craft.js';
import { tableau } from './world3-dtcraft.js';

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
// (fest: lights strung between two anchors - shared/world3-craft.js, the owner's 10-25 "lantern (or hanging lights)
// don't connect to anything"; test/neonstrip.test.js holds every end to it)

const band = (yN, kN, yS, kS) => [yN + EXT[kN] + 1, yS - EXT[kS] - 1];
const span = (xW, kW, xE, kE) => [xW + EXT[kW] + 1, xE - EXT[kE]];

function build(m, api, K) {
  const { rnd, pick, prop } = K;
  const poi0 = m.pois.length;
  const out = { homes: 0, shops: 0, clubs: 0 };
  const b0 = m.buildings.length;   // (this plan's buildings: frontLife, the craft pass)
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
    // (a two-storey back on the alley now and then painted edge to edge - MU1's murals: the craft pass, blank walls)
    const mural = floors >= 2 && w >= 7 && rnd(x, y, 47) < 0.3 ? { mural: { x: 8, w: w * TILE - 16, h: 82, kind: pick(['tiger', 'koi', 'skyline', 'waves', 'geo', 'flowers', 'sunset'], rnd(x, y, 46)) } } : {};
    return { arch: 'nightrow', art: { spec: { floors, ...f, win: pick(WINS, rnd(x, y, 56)), parapet: 8, grime: 0.3, roofMat: 'tar', lip: 10, rimW: 4, blades: [], ...mural }, noShop: true, kit, neon }, name: o.name || null, home: rnd(x, y, 57) < 0.5 ? { kind: 'apartment' } : null, whole: true };
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
    place({ x: hx, y: ly1 - 13, w: hw, h: 14, ...lit(hx, ly1, hw, { name: 'Lantern Hall', store: 'diner', neon: 'diner', blade: 'FOOD HALL', sign: 'LANTERN HALL', floors: 2, key: 'market', poi: { kind: 'coffee', label: 'Lantern Hall', food: true }, home: null, kit: [['vid', Math.round(hw * TILE / 2), -14], ['ac', 110, 110], ['hvac', hw * TILE - 150, 130], ['vent', 300, 70], ['acs', hw * TILE - 300, 80]] }) });   // (the rebuild, 11-16: WC421's giant video billboard on its roof, over the plaza - the palm-beach sunset)
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
  litRow(NX.westside + EXT.ave + 1, 2941, by1 - 17, by1, [{ w: 12, name: 'Hotel Halo', store: 'lobby', neon: 'hotel', blade: 'ROOMS', floors: 5, key: 'hotel', poi: { kind: 'delivery', label: 'Hotel Halo' }, kit: [['rpool', 192, 150], ['lounge', 140, 230], ['lounge', 196, 230], ['umb', 262, 224], ['palm', 40, 56], ['palm', 344, 56], ['ac', 70, 330]] }], { depth: 18, floors: 3 });

  // ===========================================================================================================
  // The west point (the shore to the Midtown Bridge): the beach and its rocks, the Neon Palms Hotel's tower over them
  westPoint(K, out, lit);
  // The east of the headland (the Civic Bridge to the shore): The Violet Room's tower at the crossroads, The Starlight
  eastHeadland(K, out, lit);
  // The waterfront east of the headland (the shore curving south to where the boulevard meets the water): the
  // promenade along the shore, a row of fronts on the boulevard
  {
    const x0 = 3240, x1 = 3416;
    shorePromenade(K, x0, x1, by1 - 14, out, 6);
    // (the rebuild, 11-16: the row 16 deep and three storeys - Marina Lane behind it stays in view - Volt's four)
    litRow(x0, x1, by1 - 15, by1, [{ w: 16, lot: clubLot('club', 'Volt', 4, 'club', null, 'DANCE'), depth: 16 }, { w: 14, name: 'Moonlight Spa 24', sign: 'MOONLIGHT SPA', store: 'lobby', neon: 'hotel', blade: 'SAUNA', floors: 3, poi: { kind: 'delivery', label: 'Moonlight Spa 24', bath: 'kr' } }], { depth: 16, floors: 3, passages: false });   // (nat5: the jjimjilbang, open all night - server/systems/bathhouse.js)
    // (the rebuild, 11-16 - "just seemed like a large open area": the gardens' lawns behind the row were the Strip's
    // biggest open ground after Harbor Lights) Marina Lane: the hotel towers with their rooftop pools over the bay,
    // lit fronts between them facing a lane of terraces under the lights - WC421's waterfront
    marinaQuarter(x0, x1);
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
  const walks = [{ ...lanternAlley(K, 3066, ay0, ay1, 'Glow Arcade', out), arcade: true }, lanternAlley(K, 3250, cy0, cy1, 'Red Lantern Row', out)];
  const rows = [];
  for (const [a, ka, b, kb] of blocks) {
    const [x0, x1] = span(a, ka, b, kb);
    // (the crossroads' south-west corner: the 24/7 mart's car park on the boulevard, its vending machines - D8)
    if (a === NX.parkW) crossroads(x1 - 26, ay0, 26, AL.a - 2 - ay0 + 1);
    backRow(x0, x1, ay0, AL.a - 2);
    rows.push(litRow(x0, x1, AL.a + 2, ay1, [], { depth: 99, floors: a === NX.parkE ? 3 : 2 + (rnd(x0, ay1, 80) < 0.5 ? 1 : 0) }));
    backRow(x0, x1, cy0, AL.b - 2);
    rows.push(litRow(x0, x1, AL.b + 2, cy1, a === NX.parkE ? [{ w: 18, lot: { arch: 'theatre', key: 'theatre', name: 'The Starlight', poi: { kind: 'delivery', label: 'The Starlight' }, whole: true } }] : [], { depth: 99, floors: 3 }));
  }
  // the lanterns: zig-zagging across the two service alleys from the backs' walls to the rows', across the walkways
  // and the passages between fronts, wall to wall
  for (const ya of [AL.a, AL.b]) alleyLanterns(K, ya, NX.westside + EXT.ave + 1, NX.harborview - EXT.ave, out);
  for (const W of walks) dressWalk(K, W, out);
  // (the crossroads' south-east corner, the back across the avenue: its roof's signs big over the crossing - the rebuild)
  { const i = m.bld[m.idx(NX.parkE + EXT.ave + 3, ay0 + 3)], b = i >= 0 ? m.buildings[i] : null; if (b && b.art && b.back) b.art.kit = [['npic|nightclub', Math.round(b.tw * TILE * 0.36), 12], ['neon|LIVE|3', Math.round(b.tw * TILE * 0.8), 12], ['ac', 70, 150], ['vent', Math.round(b.tw * TILE * 0.6), 200]]; }
  for (const made of rows) passageLanterns(K, made, out);
  // Harbor Lights, the festival ground where the boulevard meets the water (NE3-NE8's waterfront festival): the big
  // wheel, the stage and its screen, food stalls, a lawn under strings of lights, the pier out into the bay
  harborLights(K, 3422, out, lateLit);
  // The Docks: east of Harborview Avenue down to the Gulf Loop - a warehouse club, the container bar, stacked containers
  docks(K, NX.harborview + EXT.ave + 1, out, lit);

  // what the plan left open: lawn with palms and flowering trees (else the kit's seal paves it - the owner, 2026-10-17:
  // "a lot of big open pavilion spaces")
  K.landscape({ bare: 0.35, tree: (x, y, r) => r < 0.55 ? ['palm_a', pick(['royal', 'coconut'], rnd(x, y, 820)), 1.15 + rnd(x, y, 821) * 0.2] : r < 0.85 ? ['tree_a', pick(['cherry', 'magnolia', 'cherry'], rnd(x, y, 822)), 1.1] : [pick(['shrub_a', 'bush_c', 'flowers_big'], rnd(x, y, 823)), null, 1] });
  dressing(K, out, poi0);
  out.frontLife = frontLife(K, b0);
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
  // D8's crossroads (the rebuild, 11-16 - the owner: "they look about the same but a street light is moved and a taxi
  // sign went up"): the south-west corner of the boulevard and Park East Avenue was the 24/7's car park (its mart never
  // stood: the bays' asphalt went down first). Now the taxi rank at the corner (the clubs' way home - taxis waiting,
  // scooters parked at its end), a corner pitch with a food cart and its line, and two fronts on the boulevard laid
  // last with big signs on their roofs over the crossing - the Hi Score arcade and the Lucky Seven bar; across the
  // avenue the back's roof over the corner gets its LIVE sign. The Violet Room's door is on the corner (its line and its
  // bouncers there after dark - server/systems/nightclubs.js), Afterdark's across the avenue
  function crossroads(x, y, w, h) {
    const { m } = K;
    if (!K.allFree(x, y, w, h)) return;
    const rx = x + w - 11;   // (the rank: three bays nose in off the pavement, a scooter bay at its end)
    K.fill(rx, y, 11, 4, T.LOT); K.take(rx, y, 11, 4);
    for (let k = 0; k < 3; k++) { const sx = rx + k * 3; m.stalls.push({ x: sx * TILE, y: y * TILE, w: 3 * TILE, h: 4 * TILE }); m.parking.push({ x: (sx + 1.5) * TILE, y: (y + 2) * TILE, a: -Math.PI / 2, model: 'taxi' }); }
    for (const dx of [9.6, 10.5]) m.parking.push({ x: Math.round((rx + dx) * TILE), y: (y + 2) * TILE, a: -Math.PI / 2, model: 'scooter' });
    prop('textsign', rx + 4.5, y + 0.4, 0, { text: 'TAXI', bg: '#e0b030', fg: [30, 30, 30], z: 34, sx: 2, lit: true });
    // (the corner pitch: the cart, its line, a busker's crowd)
    K.fill(x, y, 5, 4, T.PLAZA); K.take(x, y, 5, 4);
    prop('foodcart', x + 2.5, y + 1.6, 14); tableau(m, { v: 'queue', x: x + 2.5, y: y + 0.4, a: Math.PI / 2 });
    hang(K, x + 1, y + 3, 4);
    lateBack(x + 5, y, rx - x - 5, h, { name: 'Hi Score Arcade', floors: 2, kit: [['npic|gamezone', Math.round((rx - x - 5) * TILE * 0.3), 12], ['neon|ARCADE|1', Math.round((rx - x - 5) * TILE * 0.74), 12], ['ac', 90, 160], ['vent', 200, 220], ['acs', 260, 120]] });
    lateBack(rx, y + 4, 11, h - 4, { name: 'Lucky Seven Bar', floors: 2, kit: [['npic|cocktailv', Math.round(5.5 * TILE), 12], ['ac', 80, 150], ['vent', 260, 200]] });
    (out.places ||= []).push({ name: 'The Crossroads', x0: x, y0: y, x1: x + w, y1: y + h });
  }
  // ---- the rebuild (11-16): fronts laid last (K.late - shared/world3-hand.js handLate: at the end of the list, so no
  // other building's, home's or business's number moves); a delivery stop each, no home, no walk-in
  function lateLit(x, y, w, h, o) {
    used.add(o.name);
    if (o.deck && !o.kit && w >= 8 && h >= 10) o = { ...o, kit: roofDeck(w, h, deck.deal(null, null, 0, rnd(x, y, 164), null, ROOF_PICS)[0]) };
    const L = lit(x, y + h - 1, w, { walk: false, home: null, ...o });
    return K.late({ x, y, w, h, ...L, key: o.key || 'apt1', poi: { kind: 'delivery', label: o.name } });
  }
  // a back laid last: its front and door on the street to its north (face N), its sign on its roof over that street
  function lateBack(x, y, w, h, o) {
    const B = back(x, y, w, { floors: o.floors });
    if (o.kit) B.art.kit = o.kit;
    used.add(o.name);
    return K.late({ x, y, w, h, ...B, name: o.name, home: null, face: 'N', poi: { kind: 'delivery', label: o.name } });
  }
  // a hotel tower's roof: the pool and its loungers, an umbrella, potted palms, the plant (WC421's rooftop pools)
  function hotelKit(w) { const c = Math.round(w * TILE / 2); return [['rpool', c, 150], ['lounge', c - 60, 228], ['lounge', c + 2, 228], ['umb', c + 70, 222], ['palm', 40, 56], ['palm', w * TILE - 40, 56], ['ac', 70, 330], ['hvac', w * TILE - 80, 340]]; }
  // a roof bar on a low front's roof (WC421's lit roofs, not a plain dark deck): strings of lights over its tables and
  // umbrellas, planters, the plant at the back, its picture sign at the front edge over the street
  function roofDeck(w, h, pic) {
    const c = Math.round(w * TILE / 2), D = h * TILE;
    return [[`npic|${pic}`, c, -26], ['string', c, 100], ['string', c, 170], ['umb', c - 86, 136], ['umb', c + 86, 136], ['table', c - 34, 140], ['table', c + 34, 140], ['plant', 34, 50], ['plant', w * TILE - 34, 50], ['ac', 64, D - 150], ['vent', w * TILE - 60, D - 170]];
  }
  // one of the strip's mix not used yet, as a lot of the rebuild's lists
  function mixLot(x, y) {
    const r = rnd(x, y, 160), cat = r < 0.42 ? 'bar' : r < 0.74 ? 'food' : 'shop';
    const q = composeNeon(used, cat, (k) => rnd(x + k, y, 161)) || composeNeon(used, 'shop', (k) => rnd(x, y + k, 162));
    return q ? { w: 8 + Math.floor(rnd(x, y, 163) * 3), name: q[0], store: q[1], neon: q[2] } : null;
  }

  // Marina Lane (the rebuild, 11-16): where the waterfront gardens' lawns were, between the shore's promenade and the
  // boulevard row's backs - a row of fronts facing south onto a lane ten tiles wide: two hotel towers with their pools
  // on the roof (the bay behind them, so they hide no street), a casino front, the bars, the food places and an arcade
  // between, passages through to the promenade under lanterns; the lane's terraces, food carts and their queues, the
  // doormen at the hotels, the lights strung across it from the fronts
  function marinaQuarter(x0, x1) {
    const yF = 2160, yL0 = yF + 1, yL1 = by1 - 16;
    K.fill(x0, yL0, x1 - x0, yL1 - yL0 + 1, T.PLAZA);
    const LOTS = [
      { w: 18, name: 'Marina Bay Hotel', store: 'lobby', neon: 'hotel', blade: 'HOTEL', sign: 'MARINA BAY', floors: 8, key: 'hotel', face: { style: 'glass' }, pic: 'hotelv', hotel: 1 },
      { w: 9, name: 'Coral Lounge', store: 'bar', neon: 'lounge', blade: 'LOUNGE' }, { w: 8, name: 'Tide Ramen', store: 'diner', neon: 'diner', blade: 'RAMEN' }, { gap: 4 },
      { w: 10, name: 'Lucky Koi Karaoke', store: 'bar', neon: 'lounge', blade: 'KARAOKE', floors: 3 },
      { w: 16, name: 'Skyline Suites Hotel', store: 'lobby', neon: 'hotel', blade: 'HOTEL', sign: 'SKYLINE SUITES', floors: 9, key: 'hotel', face: { style: 'glass' }, hotel: 1 },
      { w: 8, name: 'Pearl Oyster Bar', store: 'diner', neon: 'bar', blade: 'OYSTERS' }, { w: 10, name: 'Club Riptide', store: 'bar', neon: 'club', blade: 'DANCE', floors: 3 }, { gap: 4 },
      { w: 18, name: 'Golden Koi Casino', store: 'lobby', neon: 'club', sign: 'GOLDEN KOI', blade: 'CASINO', floors: 4, pic: 'maneki' },
      { w: 9, name: 'Starfish Bar', store: 'bar', neon: 'bar', blade: 'BAR' }, { w: 8, name: 'Moon Tea House', store: 'cafe', neon: 'diner', blade: 'TEA' },
      { w: 9, name: 'Wave Arcade', store: 'arcade', neon: 'arcade', blade: 'GAMES' }, { gap: 4 }, { w: 8, name: 'Ink Wave Tattoo', store: 'salon', neon: 'club' },
    ];
    // (the shore band's grass the kit keeps as lawn - m.reserve bit 4 - is the row's ground here: the shore curves in)
    for (let y = yF - 13; y <= yF; y++) for (let xx = x0; xx < x1; xx++) { const i = m.idx(xx, y); if (K.lawn(xx, y) && !K.free(xx, y) && m.tiles[i] === T.GRASS && (m.reserve[i] & ~4) === 0) m.reserve[i] = 0; }
    const made = [];
    let x = x0 + 1, k = 0;
    while (x < x1 - 7 && k < 60) {
      const L = k < LOTS.length ? LOTS[k] : mixLot(x, yF);
      k++;
      if (!L) break;
      if (L.gap) { K.fill(x, yF - 16, L.gap, 17, T.PLAZA); for (const dy of [1.6, 4.4, 7.2]) fest(K, x, yF + 1 - dy, L.gap, k % 2 ? 0.5 : -0.5, 52, 'wall', 'wall', 'lantern'); x += L.gap; continue; }
      const w = Math.min(L.w, x1 - 1 - x);
      if (w < 6) break;
      let top = yF - 13;
      for (let xx = x; xx < x + w; xx++) { let y = yF; while (y >= top && K.free(xx, y)) y--; top = Math.max(top, y + 1); }
      if (yF - top + 1 < 7) { x += 2; continue; }   // (the shore comes in close: no lot here)
      const B = lateLit(x, top, w, yF - top + 1, { ...L, kit: L.hotel ? hotelKit(w) : undefined, deck: rnd(x, yF, 4) < 0.6, floors: L.floors ?? 2 + (rnd(x, yF, 3) < 0.5 ? 1 : 0) });
      if (B) made.push({ ...B, kind: L.store, hotel: !!L.hotel });
      x += w;
    }
    // behind the row to the promenade: paved
    K.fill(x0, yF - 30, x1 - x0, 30, T.PLAZA);
    dressLane(made, yL0, yL1, x0, x1);
    (out.places ||= []).push({ name: 'Marina Lane', x0, y0: yF - 14, x1, y1: yL1 + 1 });
    out.marina = made.length;
  }
  // a lane in front of a row of late fronts (made: their lots), from row yL0 to yL1: the lights across it from the
  // fronts, a terrace at the bars' and food places' fronts, friends by their doors, carts and their queues down its far
  // side, the doormen at a hotel's door, potted palms along its edge
  function dressLane(made, yL0, yL1, x0, x1, o = {}) {
    const step = o.step || 4, span = Math.min(9.4, yL1 - yL0 + 0.4);
    for (let x = x0 + 2; x < x1 - 2; x += step) fest(K, x + 0.5, yL0 + 0.05, 0, span, 64, 'wall', 'pole', o.k || null);
    for (const B of made) {
      const door = B.door + 0.5, side = door > B.x + B.w / 2 ? -1 : 1;
      if (B.hotel) { tableau(K.m, { v: 'staff', x: door - 0.9, y: yL0 + 0.7, a: Math.PI / 2, x2: door + 0.9, y2: yL0 + 0.7, look: 'valet' }); continue; }
      if (B.kind === 'bar' || B.kind === 'diner' || B.kind === 'cafe') {
        for (let tx = B.x + 1.5; tx < B.x + B.w - 1; tx += 3) { if (Math.abs(tx - door) < 1.8) continue; prop('cafetable', tx, yL0 + 1.8, 0); (K.m.terraceSpots ||= []).push({ x: Math.round(tx * TILE), y: Math.round((yL0 + 1.8) * TILE) }); }
        hang(K, door + side * 1.2, yL0 + 3.6, B.kind === 'bar' ? 4 : 3);
      } else if (rnd(B.x, B.y, 170) < 0.6) hang(K, door + side * 1.6, yL0 + 1.4, 3);
    }
    if (o.carts !== false) for (let x = x0 + 12; x < x1 - 8; x += 26) { prop('foodcart', x, yL0 + 6.4, 14); tableau(K.m, { v: 'queue', x, y: yL0 + 5.2, a: Math.PI / 2 }); }
    for (let x = x0 + 6; x < x1 - 4; x += 8) if (rnd(x, yL1, 171) < 0.7) prop('potted', x + 0.5, yL1 - 0.5, 0);
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
  // (the craft pass: fairy lights up the palms' trunks, not looped palm to palm; a lamp between each two)
  for (let x = x0 + 3; x < x1 - 2; x += 8) {
    if (!K.m.land[(yS - 2) * K.m.w + x] || K.m.tiles[(yS - 2) * K.m.w + x] !== T.PLAZA) continue;
    prop('palm_a', x + 0.5, yS - 1.6, 10, { sp: 'royal', k: 1.15, lit: 1 });
  }
  // the marina's terrace: tables out on the promenade by the jetties under strings of lights, a couple at the rail
  // between each two jetties, friends by the boat hire
  terrace(K, 3052, yS - 5, 8, { step: 4.4, lights: true, menu: true });
  for (const xx of [3060, 3082, 3112, 3030]) hang(K, xx, yS - 8.5, 2);
  hang(K, 3100, yS - 6.5, 4);
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
    // (the rebuild, 11-16 - WC421's lit marina with its yachts: a cruiser or a sailboat off the outer jetties' heads, a
    // yacht moored between each two jetties)
    else m.marina.push({ x: (x - 2.4) * TILE, y: (y - len + 2) * TILE, a: -Math.PI / 2, kind: k === 0 ? 'cabincruiser' : 'sailboat' });
    if (k < 2) prop('yacht', x + 10.5, y - 7, 26, { a: -Math.PI / 2 });
    prop('lamp', x + 0.5, y - len + 1.5, 0);
  });
  // (its own name: the Harbor's marina is Harbor Marina - two places of one name, two of its signs)
  prop('textsign', 3071, yS - 1.5, 0, { text: 'NEON BAY MARINA', bg: '#16121e', fg: [90, 230, 255], z: 40, sx: 2, lit: true });
  void rnd; out.promenade = n;
  (out.places ||= []).push({ name: 'Neon Bay Marina', x0: 3040, y0: yS - 30, x1: 3104, y1: yS });
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
    // (round two: inside the ring, four planted beds between the walks - the paving no longer one big oval)
    const walk = Math.abs(tx + 0.5 - cx) < 3.5 || Math.abs(ty + 0.5 - cy) < 2;
    const paved = walk || (e < 1.25 && !(e > 0.4 && e < 0.86)) || ty >= y + h - 3 || ty < y + 2;
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
  // (the beds: flowers in drifts, a flowering shrub at each bed's heart)
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { prop('flowers_big', cx + sx * 8.6, cy + sy * 4.6, 0); prop('flowers_big', cx + sx * 5.2, cy + sy * 6.4, 0); prop('shrub_a', cx + sx * 10.4, cy + sy * 2.8, 0); }
  prop('foodcart', x + 3, y + h - 3, 14);
  prop('flowers_big', x + 2, cy, 0); prop('flowers_big', x + w - 2, cy, 0);
  for (const [fx, fy] of [[0.06, 0.4], [0.94, 0.4], [0.06, 0.95], [0.94, 0.95], [0.3, 0.12], [0.7, 0.12]]) prop('lamp', x + w * fx, y + h * fy, 0);
  // strings of lights over the fountain (the owner, 10-25: they "don't connect to anything" - they hung in the air,
  // ending short of the fountain): a post at each corner of its ring, the lights strung post to post round it and out
  // from each post to the lamp at the plaza's corner
  // (the craft pass, 11-14: the strings out to the plaza's corner lamps ran on the slant over the lawns to nothing in
  // particular - gone; the ring round the fountain stays, its posts at the corners of the seating)
  const posts = [[cx - 7, cy - 4.6], [cx + 7, cy - 4.6], [cx + 7, cy + 4.6], [cx - 7, cy + 4.6]];
  for (let k = 0; k < 4; k++) { const [ax, ay] = posts[k], [bx, by] = posts[(k + 1) % 4], n = Math.hypot(bx - ax, by - ay) > 8 ? 2 : 1; for (let i = 0; i < n; i++) fest(K, ax + (bx - ax) * i / n, ay + (by - ay) * i / n, (bx - ax) / n, (by - ay) / n, 62, 'pole', 'pole'); }   // (a post halfway along a long side)
  // people: a couple on each bench by the fountain, friends at the cross walk's ends
  for (const [dx, dy, q] of [[-6, -1.8, 2], [6, -1.8, 2], [-6, 5.4, 2], [6, 5.4, 2], [-13, 0.4, 4], [13, 0.4, 3], [0, -8, 4]]) hang(K, cx + dx, cy + dy, q);
  // tables under the ring of lights, between the benches and the basin: people at them
  for (const [dx, dy] of [[-3, -3.3], [3, -3.3], [-3, 3.7], [3, 3.7]]) { prop('cafetable', cx + dx, cy + dy, 0); (K.m.terraceSpots ||= []).push({ x: Math.round((cx + dx) * TILE), y: Math.round((cy + dy) * TILE) }); }
  // (the craft pass, round two - "the big open spaces could really use love"): the paved ring broken up - potted palms
  // in planters between the ring's cherry trees; on each arm of the cross walk a food cart and its tables under a short
  // canopy of lights; friends standing about the ring
  for (let k = 0; k < 10; k++) { const mx = (pseudoCos(k) + pseudoCos(k + 1)) / 2, my = (pseudoSin(k) + pseudoSin(k + 1)) / 2; if (Math.abs(my) > 0.3) prop('potted', cx + 13.4 * mx, cy + 8.6 * my, 0); }   // (between the trees, off the cross walk)
  for (const s of [-1, 1]) {
    const ax = s < 0 ? x + 4 : x + w - 4;
    prop('foodcart', ax, cy - 1.6, 14);
    terrace(K, ax - 1.5, cy + 1.2, 2, { step: 3, planters: false });
    canopy(K, ax - 3, cy + 0.2, ax + 3, cy + 1.6, { gap: 1.4, span: 7, h: 48 });
  }
  for (const [dx, dy, q] of [[-9, -5.5, 4], [9, -5.5, 3], [-9, 6, 3], [9, 6, 4], [0, 7.6, 5]]) hang(K, cx + dx, cy + dy, q);
  // the billboard: the eye-patch woman at the plaza's north edge, facing the plaza and the boulevard
  prop('picboard', cx, y + 1.5, 0, { pic: 'lucy', z: 60, col: [255, 80, 200] });
  K.m.squares ||= []; K.m.squares.push({ x: Math.round(cx) - 7, y: Math.round(cy) - 6, w: 14, h: 12, name: 'Blossom Plaza' });
  (out.places ||= []).push({ name: 'Blossom Plaza', x0: x, y0: y, x1: x + w, y1: y + h });
}
// (a circle's points without trigonometry - shared code: CLAUDE.md - a 10-gon's corners, near enough)
const C10 = [[1, 0], [0.809, 0.588], [0.309, 0.951], [-0.309, 0.951], [-0.809, 0.588], [-1, 0], [-0.809, -0.588], [-0.309, -0.951], [0.309, -0.951], [0.809, -0.588]];
const pseudoCos = (k) => C10[k % 10][0], pseudoSin = (k) => C10[k % 10][1];

// Lantern Lane (AL1, NE3-NE8's night-market alleys): the lane across the headland, paved. The craft pass (11-14: "way
// too big and open") fills its middle: four rows of stalls - one down each side facing in, two back to back down the
// middle - so it is two close aisles of stalls facing each other (a cross aisle every five stalls), a stallholder at
// each, red lanterns strung across each aisle post to post every six tiles; a gate at each end, the NIGHT MARKET sign;
// at the mouth on Blossom Plaza the food carts and a terrace of tables under strings of lights
function lanternLane(K, x0, x1, out) {
  const { prop, rnd, pick } = K;
  const [y0, y1] = LANE;
  K.fill(x0, y0, x1 - x0, y1 - y0 + 1, T.PLAZA);
  const mid = (y0 + y1) / 2 + 0.5, sN = y0 + 3, sS = y1 - 3, cN = mid - 1.1, cS = mid + 1.1;   // (the rows: north, the spine's two, south)
  const rows = [[sN, 0, -0.75], [cN, Math.PI, 0.7], [cS, 0, -0.7], [sS, Math.PI, 0.75]];   // [y, facing (0 south, PI north), the stallholder's side]
  let n = 0, k = 0;
  for (let x = x0 + 4; x < x1 - 4; x += 3, k++) {
    if (Math.abs(x + 1.5 - (PLAZA[0] + PLAZA[1]) / 2) < 4) { k = -1; continue; }   // (the rebuild: the market runs on across the plaza's mouth - it was an empty paved square - an aisle left open on the plaza's axis, the hall's door at its head)
    if (k % 6 === 5) continue;   // (a cross aisle)
    rows.forEach(([y, a, dv], r) => {
      if ((r === 1 || r === 2) && k % 6 === 0) return;   // (the spine starts a stall in from each cross aisle)
      prop('mstall', x + 1, y, 0, { v: Math.floor(rnd(x, y, 1) * 4), c: Math.floor(rnd(x, y, 2) * 4), a });
      if (rnd(x, y, 8) < 0.7) vendor(K, x + 1, y + dv, a === 0 ? Math.PI / 2 : -Math.PI / 2);
      n++;
    });
    // what's stacked by the outer rows: crates, a cooler (against the lane's sides, behind the stalls)
    if (rnd(x, y0, 3) < 0.4) prop(pick(['crates', 'cooler', 'fruitcrate', 'crates'], rnd(x, y0, 4)), x + 2.4, sN - 1.4, 0);
    if (rnd(x, y1, 5) < 0.4) prop(pick(['crates', 'cooler', 'fruitcrate', 'bags'], rnd(x, y1, 6)), x + 2.4, sS + 1.6, 0);
    // the lanterns: across each aisle, from the outer row's stall front to the spine's, every other stall
    // (the rebuild, 11-16 - WC422: rows of lanterns ACROSS the lane from wall to wall, dense, overhead: at every stall a
    // line from the north row's wall to the outer stall, across the aisle to the spine, across the other aisle, on to
    // the south row's wall - four runs end to end, each made fast to the wall or the stall's frame)
    fest(K, x + 1.5, sN + 0.7, 0, cN - sN - 1.4, 54, 'pole', 'pole', 'lantern'); fest(K, x + 1.5, cS + 0.7, 0, sS - cS - 1.4, 54, 'pole', 'pole', 'lantern');
    fest(K, x + 1.5, y0 + 0.05, 0, sN - 0.75 - y0, 58, 'wall', 'pole', 'lantern'); fest(K, x + 1.5, sS + 0.75, 0, y1 + 0.95 - sS - 0.75, 58, 'pole', 'wall', 'lantern');
  }
  // a gate at each end (where the lane meets the bridges' avenues), the market's sign over the west one
  for (const gx of [x0 + 1, x1 - 1]) prop('gatearch', gx, (y0 + y1) / 2, 0, { w: Math.round((y1 - y0 - 2) * TILE), a: Math.PI / 2 });
  prop('textsign', x0 + 5, (y0 + y1) / 2 - 2, 0, { text: 'NIGHT MARKET', bg: '#7a1e2a', fg: [255, 214, 120], z: 58, sx: 2, lit: true });
  // the mouth on the plaza: food carts along its north side, the terrace of tables under the lights, people about
  for (const [dx, dy, q] of [[0, -3, 4], [-1.4, 2.5, 5], [1.6, 6, 3]]) hang(K, (PLAZA[0] + PLAZA[1]) / 2 + dx, mid + dy, q);
  // (shoppers down both aisles, every dozen tiles)
  for (let x = x0 + 8; x < x1 - 8; x += 12) if (x < PLAZA[0] - 4 || x > PLAZA[1] + 3) { hang(K, x, (sN + cN) / 2 + 0.3, 2 + (x % 2)); hang(K, x + 6, (cS + sS) / 2 - 0.3, 2 + ((x + 1) % 2)); }
  (out.places ||= []).push({ name: 'Lantern Lane Night Market', x0, y0, x1, y1 });
  out.stalls = (out.stalls || 0) + n;
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
      kit: [['palm', 60, 60], ['palm', 200, 60], ['lounge', 100, 130], ['lounge', 150, 130], ['umb', 240, 140], ['plant', 40, 200], ['plant', 300, 200], ['string', 160, 90], ['hut', 300, 300], ['ac', 80, 400], ['rpool', 480, 140], ['lounge', 430, 214], ['lounge', 490, 214], ['umb', 560, 210], ['palm', 620, 70]] } });   // (the rebuild: its pool on the roof, lit after dark - WC421)
  void lit; (out.places ||= []).push({ name: 'Glow Beach', x0, y0: 2088, x1, y1: 2158 });
}

// East of the headland: The Violet Room's tower at the crossroads (seven floors; the marina and the water behind it),
// the eye-patch woman down its face, the club on its ground floor; The Starlight picture house on the boulevard
function eastHeadland(K, out, lit) {
  const { prop } = K;
  const x0 = NX.bridgeE + EXT.art + 1, yB = NY.blvd - EXT.blvd - 1;
  K.building({ x: x0, y: 2150, w: 22, h: yB - 2150 + 1, door: x0 + 20, arch: 'club', key: 'club', name: 'The Violet Room', poi: { kind: 'delivery', label: 'The Violet Room' }, whole: true,
    art: { spec: { floors: 7, style: 'concrete', wallColor: '#2a2436', win: 'tall', parapet: 14, grime: 0.15, roofMat: 'rubber', lip: 10, rimW: 5, blades: [] }, shop: { kind: 'bar', door: 'right', open: true, people: 4, sign: null, awning: ['#16121e', '#16121e'] },
      neon: { name: 'VIOLET ROOM', kind: 'club', col: 3, pic: 'lucy', picV: 150, blade: 'DANCE', pics: ['clubv', 'nightclub', 'sake'], dress: true } } });
  out.clubs++;
  // beside it on the boulevard: Afterdark, then a lit front or two
  let k = 0;
  K.row(x0 + 23, 3238, 2150, yB, (x, room) => {
    if (room < 6) return room >= 1 ? { gap: room, kind: 'plaza' } : null;
    const w = Math.min(room, k === 0 ? 14 : 9);
    // (Afterdark, then the bay's lit fronts - each its own name: the row once named all of them Sushi Sora)
    // (food places all, as they were: the same kind of stop at each - no business changes its trade)
    const NEXT = [{ name: 'Bay Bento', store: 'diner', neon: 'diner', blade: 'SUSHI' }, { name: 'Tidewater Tacos', store: 'diner', neon: 'diner', blade: 'TACOS' }, { name: 'Harbor Noodle Co', store: 'diner', neon: 'diner', blade: 'NOODLE' }, { name: 'Lucky Moon Dumplings', store: 'diner', neon: 'diner' }];
    const L = k === 0 ? lit(x, yB, w, { name: 'Afterdark', key: 'club', store: 'bar', neon: 'club', blade: 'CLUB', floors: 3, poi: { kind: 'delivery', label: 'Afterdark' } }) : lit(x, yB, w, { ...NEXT[(k - 1) % NEXT.length], floors: 3 });
    k++;
    return { w, depth: 22, ...L };
  });
  // the promenade round the point behind them, the waterfront lounge looking out over the bay and its terrace (the
  // strip just north of the tower stays plain paving: its height stands over it)
  shorePromenade(K, x0, 3240, 2149, out, 12);
  let kk = 0;
  const lb = K.row(x0, 3236, 2104, 2128, (x, room) => { if (room < 8) return room >= 1 ? { gap: room, kind: 'plaza' } : null; const w = Math.min(room, kk === 0 ? 24 : 18); const L = lit(x, 2128, w, [{ name: 'Bayview Lounge', store: 'bar', neon: 'lounge', floors: 2, garden: true }, { name: 'Seaglass Grill', store: 'diner', neon: 'diner', blade: 'GRILL', floors: 2, garden: true }, { name: 'Pier 3 Oyster Bar', store: 'diner', neon: 'bar', blade: 'OYSTERS', floors: 2, garden: true }][Math.min(2, kk++)]); return { w, depth: 99, ...L }; });   // (each its own name: the row named the rest of it Seaglass Grill)
  // (the lounges' terrace: their tables in a row in front of them, the lights over them in two rows of short spans -
  // not one string the length of the terrace)
  terrace(K, x0 + 2, 2131.5, Math.floor((3232 - x0 - 2) / 5), { step: 5, lights: true, menu: true, h: 46 });
  hang(K, x0 + 6, 2134.6, 3); hang(K, 3222, 2134.6, 4);
  void lb;
  afterdarkGarden(K, x0 + 24, 2136, 3233, 2167, out);
}

// The Garden at Afterdark (the craft pass, 11-14: the lawn behind the club was a big open space with nothing to it):
// a beer garden - long tables in rows on a gravelled court under a canopy of lights on posts, the garden bar at its
// head, hedges and flowering trees round its edge with a way in from the promenade and one from the boulevard's side,
// people at the tables and stood round the bar
function afterdarkGarden(K, x0, y0, x1, y1, out) {
  const { prop } = K;
  // (the lawn the rows round it left: grass, no building on it - the rows' bands are taken, so not K.allFree)
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * K.m.w + x; if (K.m.tiles[i] !== T.GRASS || K.m.bld[i] >= 0) return; }
  const yC = y0 + 22, mx = Math.round((x0 + x1) / 2);   // (the court down to yC; the lawn behind it to the club's back)
  K.fill(x0, y0, x1 - x0, y1 - y0, T.GRASS); K.fill(x0 + 2, y0 + 2, x1 - x0 - 4, yC - y0 - 2, T.PLAZA);
  K.take(x0, y0, x1 - x0, y1 - y0);
  // the bar at the head of the court, standing tables in front of it with people round them
  // (the bar a thatched kiosk - a set piece, not a building: no building or stop added, so no later building's, home's or
  // business's number moves - shared/world3-openblocks.js keeps the same rule)
  prop('tbar', mx, y0 + 5.5, 20);
  prop('textsign', mx, y0 + 7.4, 0, { text: 'GARDEN BAR', bg: '#1e2a1e', fg: [255, 214, 120], z: 26, sx: 1, lit: true });
  for (const dx of [-9, -3.5, 3.5, 9]) { prop('cafetable', mx + dx, y0 + 9, 0); hang(K, mx + dx, y0 + 9.2, 3); }
  // the long tables: three rows of five under the lights strung post to post, people at them
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const tx = x0 + 5 + c * 7.5, ty = y0 + 12 + r * 3.6;
    prop('picnic', tx, ty, 0);
    (K.m.terraceSpots ||= []).push({ x: Math.round(tx * TILE), y: Math.round(ty * TILE), seat: 16 });
  }
  canopy(K, x0 + 3, y0 + 10.4, x1 - 3, y0 + 20.6, { gap: 2.5, span: 8.5, h: 54 });
  // its edge: flower boxes along the court's sides, the gaps the ways in; the lawn behind with cherry trees in a row
  // and benches facing the court
  for (let x = x0 + 4; x < x1 - 3; x += 3) if (Math.abs(x - mx) > 3) prop('planter_fl', x, y0 + 1, 0);
  for (let y = y0 + 4; y < yC - 1; y += 3) { prop('planter_fl', x0 + 1, y, 0); prop('planter_fl', x1 - 1, y, 0); }
  for (let x = x0 + 3; x < x1 - 2; x += 6) prop('tree_a', x, y1 - 2.5, 10, { sp: 'cherry', k: 1.2 });
  for (let x = x0 + 6; x < x1 - 4; x += 6) { prop('bench_m', x, yC + 1.6, 0, { a: Math.PI }); if (x % 12 === 0) hang(K, x, yC + 2.6, 2); }
  for (const xx of [x0 + 3, x1 - 3]) prop('lamp', xx, y0 + 3, 0);
  (out.places ||= []).push({ name: 'The Garden at Afterdark', x0, y0, x1, y1 });
}


// Harbor Lights, the headland east of where the boulevard meets the water (NE3-NE8's waterfront festival; the rebuild of
// 11-16 after WC421 - the owner: "a large open area"; the lead: "a huge dark lawn with a few lights round its edge and a
// big car park"). Every part of it a place with edges and its people:
//   - the shore: the sand, a paved promenade along it - palms lit up their trunks, a lamp between each two, benches
//     facing the bay; the pier out into the bay and the pier club on its deck at the end, boats moored alongside
//   - the stage: the video screen (the palm-beach sunset) and its speakers at the head of its apron, the lights strung
//     over the crowd in rows on posts; the crowd at night (map.partySpots: activities.js 'party'); the standing ground
//     behind it paved, a pergola bar each side
//   - the fair (WC421's busy fairground, where the bandstand's lawn was): the carousel in the middle under its striped
//     roof, game stalls in two rows facing it with their keepers, lights strung over the midway, the gate and its sign
//     off the walk, the queue at the carousel, friends about
//   - the night market's street of stalls under lanterns, the food trucks and their tables, the big wheel and its queue
//   - Dock Lane (laid last: K.late): a row of lit fronts between the walk and Dock 9, facing a lane with lanterns across
//     it to the club's wall; where the car park was, a row of lit fronts on the forecourt to the south - a casino front,
//     bars, an arcade
function harborLights(K, x0, out, lateLit) {
  const { m, prop, rnd } = K;
  const y0 = 2196, y1 = 2259, yLow = 2292;   // (the ground; and east of The Docks' yard down to the street)
  const isLand = (x, y) => m.land[y * m.w + x] && m.tiles[y * m.w + x] !== T.WATER && m.tiles[y * m.w + x] !== T.DEEP;
  let n = 0;
  const mineT = (x, y) => (y <= y1 + 2 || x >= 3550) && K.free(x, y);
  // the ground: the shore's sand and promenade, the places' paving (the stage's apron and standing ground, the walk in,
  // the fair, the market street, the food trucks' court, the wheel's pad, Dock Lane and the south row's forecourt)
  const ZONES = [[3484, 2226, 3520, 2244], [3482, 2244, 3606, 2248], [3520, 2225, 3574, 2244], [3524, 2247, 3577, 2260], [3578, 2249, 3604, 2268], [3574, 2224, 3596, 2242], [3488, 2258, 3524, 2262], [3550, 2290, 3606, 2292]];
  const zone = (x, y) => ZONES.some(([a, b, c, d]) => x >= a && y >= b && x < c && y < d);
  const shore = new Map();   // (each column's first land row)
  for (let x = x0; x < 3640; x++) { let y = 2190; while (y < yLow && !isLand(x, y)) y++; if (y < yLow) shore.set(x, y); }
  // (the rows laid last first take their ground: the fronts between the walk and Dock 9, the south row where the car
  // park was - their lots kept free of the paving)
  const dock = [{ w: 12, name: 'Tiki Tide Bar', store: 'bar', neon: 'bar', blade: 'BAR' }, { w: 12, name: 'Harbor Karaoke', store: 'bar', neon: 'lounge', blade: 'KARAOKE' }, { w: 11, name: 'Night Market Noodles', store: 'diner', neon: 'diner', blade: 'NOODLES' }];
  const south = [{ w: 20, name: 'Lucky Harbor Casino', store: 'lobby', neon: 'club', sign: 'LUCKY HARBOR', blade: 'CASINO', floors: 3, pic: 'luckypaw' }, { w: 10, name: 'Pearl Diver Bar', store: 'bar', neon: 'bar', blade: 'BAR' },
    { w: 9, name: 'Ramen Wave', store: 'diner', neon: 'diner', blade: 'RAMEN' }, { w: 11, name: 'Harbor Arcade', store: 'arcade', neon: 'arcade', blade: 'GAMES', floors: 2 }];
  const made = { dock: [], south: [] };
  for (const [list, xa, ya, d, key] of [[dock, 3488, 2248, 10, 'dock'], [south, 3554, 2268, 22, 'south']]) {
    let x = xa;
    for (const L of list) { const B = lateLit(x, ya, L.w, d, { floors: 2, deck: key === 'south', ...L }); if (B) made[key].push({ ...B, kind: L.store }); x += L.w; }
  }
  for (let y = y0; y <= yLow; y++) for (let x = x0; x < 3640; x++) {
    if (!mineT(x, y)) continue;
    const top = shore.get(x) ?? 9999, d = y - top;
    m.tiles[y * m.w + x] = d >= 0 && d < 4 ? T.SAND : (d >= 4 && d < 7) || zone(x, y) ? T.PLAZA : T.GRASS;
    K.take(x, y, 1, 1); n++;
  }
  if (n < 200) return;
  const at = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)];
  // the shore promenade: palms (lit) on its land side every eight tiles, a lamp between each two, benches facing the
  // bay every sixteen with a couple on them now and then
  for (let x = 3488; x < 3632; x++) {
    const top = shore.get(x);
    if (top === undefined || at(x, top + 5) !== T.PLAZA) continue;
    if (x % 8 === 0 && at(x, top + 7) === T.GRASS) prop('palm_a', x + 0.5, top + 7.3, 10, { sp: 'royal', k: 1.15, lit: 1 });
    if (x % 8 === 4) prop('lamp', x + 0.5, top + 6.6, 0);
    if (x % 16 === 10) { prop('bench_m', x + 0.5, top + 4.4, 0, { a: Math.PI }); if (rnd(x, top, 3) < 0.6) hang(K, x + 0.5, top + 5.6, 2); }
  }
  // the stage: the video screen and its speakers at the head of the apron, the sign over it; the lights over the crowd
  prop('vidboard', 3501, 2229, 0, { w: 288, h: 136, z: 34 }); prop('dspeaker', 3488, 2230, 0); prop('dspeaker', 3514, 2230, 0);
  prop('textsign', 3501, 2224.6, 0, { text: 'HARBOR LIGHTS', bg: '#16121e', fg: [255, 110, 200], z: 190, sx: 2, lit: true });
  canopy(K, 3486, 2231.5, 3516, 2236.5, { gap: 2.5, span: 7.5, h: 58 });
  (K.m.partySpots ||= []).push({ x: Math.round(3501 * TILE), y: Math.round(2233.6 * TILE), name: 'Harbor Lights' });
  for (const x of [3484.5, 3517.5]) { prop('bannerpole', x, 2229.2, 0, { v: x < 3500 ? 0 : 1 }); prop('potted', x, 2231.4, 0); prop('potted', x, 2233.2, 0); }
  for (const x of [3489.5, 3512.5]) prop('torch', x, 2231.6, 6);
  // (the standing ground behind the apron, paved: a pergola bar each side with its tables, carts along the back)
  for (const [px, s] of [[3485.6, 1], [3516.4, -1]]) {
    prop('pergola', px + s * 1.8, 2241.6, 0, { w: 4 * TILE, d: 3 * TILE, h: 58 });
    for (const dy of [0, 1.6]) { prop('cafetable', px + s * 1.8, 2240.8 + dy, 0); (K.m.terraceSpots ||= []).push({ x: Math.round((px + s * 1.8) * TILE), y: Math.round((2240.8 + dy) * TILE) }); }
  }
  for (const x of [3496, 3506]) { prop('foodcart', x, 2242.2, 14); tableau(m, { v: 'queue', x, y: 2240.9, a: Math.PI / 2 }); }
  for (const [x, y, q] of [[3494, 2234.2, 5], [3501, 2235.2, 5], [3508, 2234.2, 5], [3501, 2232.2, 4], [3489, 2233, 3], [3513, 2233, 4], [3500, 2238.6, 5], [3510, 2239, 4]]) hang(K, x, y, q);
  // the fair: the carousel in the middle, the game stalls in two rows facing it, the lights over the midway, the gate
  {
    const cx = 3547, cy = 2234.6;
    prop('carousel', cx, cy, 44);
    // (four rows of game stalls - two midways - the middle two back to back, broken round the carousel; the south row
    // open in the middle, the way in off the walk)
    for (let x = 3524, k = 0; x <= 3571; x += 3.6, k++) {
      const st = (y, a, open) => { if (!open) return; prop('mstall', x, y, 0, { v: k % 4, c: (k + (a ? 1 : 3)) % 4, a }); if (rnd(Math.round(x * 2), Math.round(y), 9) < 0.8) vendor(K, x, y + (a ? 0.75 : -0.75), a ? -Math.PI / 2 : Math.PI / 2); };
      st(2227.4, 0, true); st(2233.1, Math.PI, Math.abs(x - cx) > 6); st(2236.3, 0, Math.abs(x - cx) > 6); st(2242.2, Math.PI, Math.abs(x - cx) > 3);
    }
    for (const [a, b] of [[3521.5, 3540.5], [3553.5, 3572.5]]) for (const y of [2230.25, 2239.3]) canopy(K, a, y, b, y, { span: 9.5, h: 62 });
    hang(K, cx - 3.4, cy + 3, 6, [-0.75, 0]);   // (the queue for the carousel)
    for (const [x, y, q] of [[3530, 2230.2, 4], [3564, 2230.4, 4], [3538, 2239.4, 3], [3557, 2230, 3], [3527, 2239.6, 2], [3568, 2239.2, 3], [3547, 2240.2, 4]]) hang(K, x, y, q);
    prop('gatearch', 3520.6, 2234.8, 0, { w: Math.round(9 * TILE), a: Math.PI / 2 });
    prop('textsign', 3523.5, 2232.6, 0, { text: 'HARBOR LIGHTS FAIR', bg: '#7a1e4a', fg: [255, 220, 120], z: 64, sx: 2, lit: true });
    for (const x of [3521.4, 3572.6]) for (const y of [2226.4, 2243]) prop('bannerpole', x, y, 0, { v: x < 3540 ? 0 : 1 });
    (out.places ||= []).push({ name: 'Harbor Lights Fair', x0: 3520, y0: 2225, x1: 3574, y1: 2244 });
  }
  // the night market: the stalls facing each other across the aisle, the lanterns across it, the gates and the sign
  {
    const yN = 2249.2, yS2 = 2256.8;
    let k = 0;
    for (let x = 3527; x + 2 < 3575; x += 3.5, k++) {
      prop('mstall', x + 1, yN, 0, { v: k % 4, c: (k + 1) % 4, a: 0 }); prop('mstall', x + 1, yS2, 0, { v: (k + 2) % 4, c: k % 4, a: Math.PI });
      if (rnd(x, yN, 4) < 0.7) vendor(K, x + 1, yN - 0.75, Math.PI / 2);
      if (rnd(x, yS2, 4) < 0.7) vendor(K, x + 1, yS2 + 0.75, -Math.PI / 2);
      fest(K, x + 1.5, yN + 0.7, 0, yS2 - yN - 1.4, 54, 'pole', 'pole', 'lantern');
    }
    for (const gx of [3525, 3576]) prop('gatearch', gx, 2253, 0, { w: Math.round(9 * TILE), a: Math.PI / 2 });
    prop('textsign', 3529, 2251, 0, { text: 'NIGHT MARKET', bg: '#7a1e2a', fg: [255, 214, 120], z: 58, sx: 2, lit: true });
    for (let x = 3532; x < 3572; x += 7) hang(K, x, 2253 + ((x / 7) % 2 ? 0.8 : -0.8), 2 + (x % 3));   // (shoppers along the aisle)
  }
  // the food trucks: carts along the court's north side, the long tables under the lights in front of them
  for (const x of [3581, 3586.5, 3592, 3597.5, 3602]) prop('foodcart', x, 2250.4, 14);
  for (const x of [3584, 3595]) tableau(m, { v: 'queue', x, y: 2251.7, a: -Math.PI / 2 });
  for (const y of [2254, 2256.6]) for (const x of [3582, 3587.5, 3593, 3598.5]) { prop('picnic', x, y, 0); (K.m.terraceSpots ||= []).push({ x: Math.round(x * TILE), y: Math.round(y * TILE), seat: 16 }); }
  canopy(K, 3579, 2253, 3602.5, 2257.6, { gap: 2.3, span: 8, h: 54 });
  for (let x = 3580; x <= 3602; x += 4) prop('potted', x, 2259.2, 0);
  prop('textsign', 3591, 2249, 0, { text: 'FOOD TRUCKS', bg: '#1a1420', fg: [255, 200, 80], z: 44, sx: 2, lit: true });
  hang(K, 3587, 2252.8, 3);
  // the big wheel on its pad, the queue at its foot, planters round the pad
  prop('ferris', 3585, 2233, 60);
  hang(K, 3580, 2240.6, 6, [-0.75, 0]);
  for (const [x, y] of [[3575, 2226], [3575, 2241], [3595, 2241]]) if (at(x, y) === T.PLAZA) prop('planter_fl', x, y, 0);
  for (const x of [3576, 3594]) if (at(x, 2243) === T.PLAZA) prop('lamp', x, 2243, 0);
  // palms along Harborview Avenue's side of the ground (lit), the way in from the boulevard's end
  for (let y = 2228; y < 2258; y += 6) if (at(3486, y) === T.GRASS) prop('palm_a', 3486.5, y + 0.5, 10, { sp: 'royal', k: 1.15, lit: 1 });
  // Dock Lane: the lane between the fronts and Dock 9 - lanterns across it to the club's wall, the fronts' life
  for (let x = 3490; x < 3522; x += 3) fest(K, x + 0.5, 2258.05, 0, 3.9, 56, 'wall', 'wall', 'lantern');
  for (const B of made.dock) { const door = B.door + 0.5, side = door > B.x + B.w / 2 ? -1 : 1; hang(K, door + side * 1.6, 2259.6, B.kind === 'bar' ? 4 : 3); }
  // the south row's forecourt: the casino's doormen, friends by the bars' doors, palms in pots along its edge
  for (const B of made.south) {
    const door = B.door + 0.5, side = door > B.x + B.w / 2 ? -1 : 1;
    if (/Casino/.test(B.name)) tableau(m, { v: 'staff', x: door - 0.9, y: 2290.7, a: Math.PI / 2, x2: door + 0.9, y2: 2290.7, look: 'valet' });
    else hang(K, door + side * 1.8, 2291, B.kind === 'bar' ? 4 : 3);
  }
  for (let x = 3552; x < 3606; x += 6) if (at(x, 2291) === T.PLAZA) prop('potted', x + 0.5, 2291.4, 0);
  if (made.dock.length) (out.places ||= []).push({ name: 'Dock Lane', x0: 3488, y0: 2248, x1: 3524, y1: 2262 });
  // the pier: north-east into the bay from the shore; at its end the pier club - a deck, the bar's kiosk, its tables
  // under the lights, the sign - and boats moored alongside (WC421's pier club)
  let px = 3470, py = 2214;
  while (py > 2190 && m.land[py * m.w + px] && m.tiles[py * m.w + px] !== T.WATER) py--;
  const wet = (x, y) => { const t = m.tileAt(x, y); return t === T.WATER || t === T.DEEP; };
  for (let i = 0; i < 18; i++) for (let o = -1; o <= 1; o++) if (wet(px + o, py - i)) m.set(px + o, py - i, T.DOCK);
  for (let i = 4; i < 14; i += 4) prop('lamp', px + 0.5 + 1.6, py - i, 0);
  {
    const dy = py - 18, ok = [...Array(7)].every((_, j) => [...Array(11)].every((__, i) => wet(px - 5 + i, dy - j) || m.tileAt(px - 5 + i, dy - j) === T.DOCK));
    if (ok) {
      for (let j = 0; j < 7; j++) for (let i = 0; i < 11; i++) m.set(px - 5 + i, dy - j, T.DOCK);
      prop('tbar', px + 0.5, dy - 4.6, 20);
      prop('textsign', px + 0.5, dy - 2.6, 0, { text: 'PIER CLUB', bg: '#16121e', fg: [90, 230, 255], z: 40, sx: 2, lit: true });
      for (const dx of [-3.5, 4.5]) for (const dyy of [-1.6, -0.2]) { prop('cafetable', px + dx, dy + dyy, 0); (K.m.terraceSpots ||= []).push({ x: Math.round((px + dx) * TILE), y: Math.round((dy + dyy) * TILE) }); }
      canopy(K, px - 4.5, dy - 2.4, px + 5.5, dy + 0.4, { gap: 2.8, span: 5, h: 54 });
      hang(K, px - 1, dy - 3.2, 4); hang(K, px + 2.5, dy - 3.4, 3);
      for (const [dx, k, a] of [[-7.5, 'cabincruiser', -Math.PI / 2], [8.5, 'sailboat', -Math.PI / 2], [-2.6, 'speedboat', -Math.PI / 2]]) m.marina.push({ x: (px + dx) * TILE, y: (dx === -2.6 ? py - 10 : dy - 3) * TILE, a, kind: k });
      (out.places ||= []).push({ name: 'The Pier Club', x0: px - 5, y0: dy - 7, x1: px + 6, y1: dy });
    } else m.marina.push({ x: (px + 4) * TILE, y: (py - 12) * TILE, a: -Math.PI / 2, kind: 'speedboat' });
  }
  (out.places ||= []).push({ name: 'Harbor Lights', x0, y0, x1: 3640, y1 });
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
  // (the Glow Arcade - the rebuild, 11-16, WC421's covered arcade: an arch over the walk every two tiles, a neon tube
  // along each, cyan and pink by turns - a lit vault you walk through; shoppers and friends under it)
  if (W.arcade) for (let y = y0 + 2; y < y1 - 1; y += 2) { prop('arcrib', x + 2.5, y + 0.5, 0, { w: 5 * TILE, v: n % 2 }); if (n % 4 === 1) hang(K, x + (n % 8 === 1 ? 1.2 : 3.8), y + 1.4, 3); n++; }
  for (let y = y0 + 1; y < y1 && !W.arcade; y += 2) {
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
  // (its deck of tables under the lights - two rows of short spans on posts, not one string 14 tiles long - and the
  // regulars at them)
  terrace(K, x0 + 32, 2276.5, 4, { step: 3, planters: false });
  canopy(K, x0 + 30.5, 2275.2, x0 + 42.5, 2277.6, { gap: 2.4, span: 6, h: 46 });
  hang(K, x0 + 44, 2274.5, 4);
  prop('foodcart', x0 + 30, 2285, 14);
  for (let y = 2280; y < y1 - 1; y++) for (let x = x0; x < x0 + 60; x++) if (K.free(x, y)) { m.tiles[y * m.w + x] = T.LOT; K.take(x, y, 1, 1); }
  for (let k = 0; k < 5; k++) prop('container', x0 + 4 + k * 6.5, y1 - 3, 30, { v: k + 6, c: k % 5 });
  // (the rebuild, 11-16: the yard a yard - a second row of containers along it, not an empty lot; the Box Bar's ground paved)
  for (let k = 0; k < 7; k++) prop('container', x0 + 4 + k * 7, y1 - 7.5, 30, { v: k + 11, c: (k + 2) % 5 });
  K.fill(x0 + 27, 2262, 34, 18, T.PLAZA);
  void y0; void lit;
  (out.places ||= []).push({ name: 'The Docks', x0, y0: 2258, x1: x0 + 60, y1 });
}

// The street dressing (the craft pass, 11-14 - WC238, SC4-B): royal palms in grates along the boulevard's north
// pavement and down its median, fairy lights wound up their trunks (not looped palm to palm: a light belongs to
// something); twin lamps at a steady rhythm along both pavements, between the palms; on the median facing Blossom
// Plaza a little fountain in its flower beds; the taxis waiting outside the clubs; the vending machines by the marts,
// tables out by the food places
function dressing(K, out, poi0) {
  const { m, prop, rnd } = K;
  const onWalk = (x, y) => m.tiles[Math.floor(y) * m.w + Math.floor(x)] === T.SIDEWALK;
  const yN = NY.blvd - EXT.blvd + 1.2, yS = NY.blvd + EXT.blvd - 1.2, FX = (PLAZA[0] + PLAZA[1]) / 2;
  const junction = (x, d) => [NX.parkW, NX.parkE, NX.civic, NX.bridgeW, NX.bridgeE].some((c) => Math.abs(x - c) < d);
  let lit = 0;
  // (a lamp where the pavement has none within five tiles: the rhythm filled in, not a second row of poles)
  const lampNear = (x, y) => m.lamps.some((l) => Math.abs(l.x - x * TILE) < 5 * TILE && Math.abs(l.y - y * TILE) < 2 * TILE);
  const lamp = (x, y) => { if (!lampNear(x, y)) prop('lamp', x, y, 0); };
  for (let x = NX.westside + 10; x < 3410; x += 8) {
    if (junction(x, 10) || !onWalk(x, yN)) continue;
    prop('palm_a', x + 0.5, yN, 10, { sp: 'royal', k: 1.15, lit: 1 }); lit++;
    if (!junction(x + 4, 9) && onWalk(x + 4, yN - 0.4)) lamp(x + 4.5, yN - 0.4);   // (a lamp between each two palms)
  }
  // the south pavement: a lamp every eight tiles, kept off the junctions and the lantern walkway's mouth
  for (let x = NX.westside + 12; x < 3410; x += 8) if (!junction(x, 9) && Math.abs(x - 3068) > 4 && onWalk(x, yS + 0.4)) lamp(x + 0.5, yS + 0.4);
  // the median: royal palms, lit, clear of the junctions (where it stops for the turns) and of the fountain
  for (let x = NX.westside + 14; x < 3408; x += 9) {
    if (junction(x, 14) || Math.abs(x + 0.5 - FX) < 7) continue;
    prop('palm_a', x + 0.5, NY.blvd + 0.5, 10, { sp: 'royal', k: 1.2, lit: 1 }); lit++;
  }
  // the median's fountain on Blossom Plaza's line (WC238's little fountain roundabout): the basin, a flower bed either
  // side of it, a lamp at each end of the beds
  prop('fountain', FX, NY.blvd + 0.5, 30);
  for (const s of [-1, 1]) { prop('flowers_big', FX + s * 2.6, NY.blvd + 0.5, 0); prop('flowers_big', FX + s * 4.2, NY.blvd + 0.5, 0); prop('lamp', FX + s * 5.6, NY.blvd + 0.5, 0); }
  out.litPalms = lit;
  // the corners of the boulevard's crossings (D8's four corners): a knot of people on each, more after dark
  for (const c of [NX.parkW, NX.parkE, NX.civic, NX.bridgeW, NX.bridgeE]) for (const dx of [-6.2, 6.2]) for (const y of [yN - 0.1, yS + 0.3]) if (onWalk(c + dx, y)) hang(K, c + dx, y, 3 + Math.floor(rnd(c + dx, y, 5) * 3));
  for (let i = poi0; i < m.pois.length; i++) {
    const p = m.pois[i];
    if (p.kind !== 'convenience' && p.kind !== 'coffee') continue;
    const x = p.x / TILE, y = p.y / TILE;
    if (p.kind === 'convenience' && onWalk(x + 1.8, y + 0.3)) { prop('vend_cola', x + 1.8, y + 0.3, 8); m.pois.push({ id: m.pois.length, kind: 'vending', label: 'Vending Machine', x: (x + 1.8) * TILE, y: (y + 0.9) * TILE, r: 32 }); }
    else if (p.kind === 'coffee' && onWalk(x + 2, y + 0.6) && rnd(x, y, 1) < 0.6) { prop('cafetable', x + 2, y + 0.9, 0); prop('umbrella_r', x + 2, y + 0.8, 0); (m.terraceSpots ||= []).push({ x: Math.round((x + 2) * TILE), y: Math.round((y + 0.9) * TILE) }); }
  }
  out.dressed = true;
}
