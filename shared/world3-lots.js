// World v3: Southside's shops and sheds (the owner, 2026-11-06: "keep the neighborhood's rough vibe and match its
// concepts" - D6 Southside, RT10 the pawn shop on the corner, RT5 the liquor store, ST3 the barber, IN11 the row of rough
// shops, GM8 the dice game down an alley). shared/map.js breakPlainBlocks cuts the long plain roofs into columns of lots
// with paved passages between them; in Southside those lots read as rows of sheds and garages. Here (map.js calls it
// right after the cut, through the world build's `lots` hook - the page and the city worker never load this module):
//   - a Southside lot on a real street (a main or a side street along its west, east or south side; never a passage)
//     becomes a rough small shop, its front on the passage or pavement south of it, its door at the street's end: a pawn
//     shop, a liquor store, a barber or a bodega you walk into (the trades' own counters and rooms: shared/shoprooms.js),
//     or a storefront you don't - check cashing, a betting shop, a laundromat, a tire shop (a sign, a window, a delivery
//     stop: nothing in the game happens inside them yet). Neighbors are never the same kind, and a kind comes up at most
//     once a block (twice in a block of more than eight shops). A lot too small for its shop stays a shed.
//   - the lots that front only the passages stay the sheds and garages they are;
//   - street dice in two of Southside's passages (m.diceSpots: server/systems/activities.js plays the crew's game there,
//     server/systems/streetdice.js lets you in on it), dressed with milk crates, trash, a burn barrel and a lamp.
// Port Westport and every other district are left as they are. Deterministic: integer tiles, hash2 draws by place.
import { TILE, T } from './constants.js';
import { hash2 } from './rng.js';

const D = 6;   // Southside (shared/mapcore.js DISTRICTS)
// the kinds: poi (a POI kind you walk into: its counter and room by its kind or its trade; else a delivery stop at a
// storefront), store (what the window shows: client/art2/buildings.js storefront), trade (the sign's face, when its name
// doesn't say), min [width, depth] (tiles: a walk-in's room wants 4 inside and 6 deep - shared/map.js roomDepth), the
// names (invented) and sign colors [board, letters]
export const LOT_SHOPS = {
  pawn: { poi: 'pawn', store: 'pawn', min: [6, 8], grille: 0.9,
    names: ['Southside Pawn', 'King Pawn & Loan', 'Pelican Pawn', "Big Al's Pawn", 'Ace Pawn & Gold', 'Riverbend Pawn', 'Lucky Strike Pawn', 'Second Hand Pawn', 'Gold Coast Pawn', 'Top Dollar Pawn'],
    signs: [['#232838', [236, 214, 150]], ['#e8c040', [34, 32, 31]], ['#3a1e10', [240, 216, 96]]] },
  liquor: { poi: 'convenience', walk: 'liquor', store: 'liquor', min: [6, 8], grille: 0.8, open: 0.7,
    names: ['Corner Liquor', "Lou's Liquor", 'Bottle King Liquor', 'Southside Spirits', 'Last Call Liquor', 'Gold Star Liquor', 'Quick Sip Liquor', 'Night Owl Liquor', 'Beer Wine Spirits', 'Low Price Liquor'],
    signs: [['#1a3a2a', [120, 230, 140]], ['#8a2a2e', [255, 220, 160]], ['#1e1a18', [232, 192, 112]]] },
  barber: { poi: 'barber', store: 'salon', min: [6, 8], grille: 0.2, awning: 0.5,
    names: ['Fresh Fade Barbers', 'Southside Cuts', 'Kings Barbershop', 'Sharp Line Barber', "Rudy's Barber Shop", 'Clean Cut Barbers', 'Top Notch Barber', 'Razor Barbers', 'Low Fade Barbers', 'Corner Barber'],
    signs: [['#f2ece0', [30, 42, 90]], ['#1e2a5a', [242, 236, 224]], ['#7a1e24', [242, 236, 224]]] },
  bodega: { poi: 'convenience', store: 'mart', min: [6, 8], grille: 0.6, open: 0.8, awning: 0.45,
    names: ['Southside Bodega', 'Mi Barrio Bodega', 'Quick Stop Deli', 'Night & Day Bodega', 'Sunrise Deli', 'Lucky Bodega', '24-7 Deli & Grocery', 'Pelican Deli', 'El Primo Bodega', 'Twin Stars Deli'],
    signs: [['#7a1e2a', [250, 240, 220]], ['#2a6a3a', [250, 246, 236]], ['#e8c040', [34, 32, 31]], ['#1e4a8a', [250, 246, 236]]] },
  checks: { store: 'lobby', min: [5, 6], grille: 0.9,
    names: ['Check Cashing', 'Fast Checks', 'Payday Cash', 'Cash Express', 'Checks Cashed', 'Money Now', 'Easy Checks', 'Same Day Cash'],
    signs: [['#e8c040', [30, 30, 30]], ['#2a6a3a', [250, 246, 236]], ['#1e3a5e', [240, 236, 220]]] },
  betting: { store: 'arcade', trade: 'street', min: [5, 6], grille: 0.4,
    names: ['Off-Track Betting', 'Lucky Odds', 'Long Shot Betting', 'Photo Finish OTB', 'Daily Double', 'Winning Post OTB', 'Sure Bet', 'Odds On'],
    signs: [['#1e1e24', [240, 224, 64]], ['#2a5a2a', [250, 240, 200]], ['#7a1e2a', [255, 220, 120]]] },
  laundry: { store: 'laundry', min: [5, 6], grille: 0.1, awning: 0.4,
    names: ['Suds City', 'Wash & Fold', 'Spin Cycle Laundry', 'Coin Laundry', 'Bubble Wash', 'Southside Suds', 'Clean Machine Wash', 'Soap & Spin'],
    signs: [['#2a6ab0', [250, 250, 240]], ['#f2f4f6', [36, 84, 154]], ['#1e6a8a', [255, 255, 255]]] },
  tires: { arch: 'garage', min: [6, 6],
    names: ['Used Tires', 'Tire Town', 'Southside Tire', 'Rim & Tire Shop', 'Flat Fix Tires', 'Big Wheel Tires', 'Tire & Rim', 'Discount Tires'] },
};
export const LOT_KINDS = Object.keys(LOT_SHOPS);
// a walk-in's POI kind, else a storefront's (a delivery stop)
export const lotPoiKind = (k) => LOT_SHOPS[k].poi || 'delivery';
const BRICK = ['#8e4a3a', '#7a4a3a', '#9a5040', '#6e3e30', '#84463a'];
const STUCCO = ['#a89e8c', '#9a9284', '#8e9a8a', '#a49484', '#b0a490'];
const AWN = [['#a8343a', '#f0ece4'], ['#2a3e7a', '#e8e4dc'], ['#2f6a4e', '#2f6a4e'], ['#3a3a44', '#e8e4dc'], ['#c8503a', '#f0ece4'], ['#1e2a3a', '#1e2a3a']];
const TAGS = ['SOUTH', 'RIVER', 'KING', 'ZONE', 'REBEL', 'CREW', 'OMEN', 'RATS'];
const pick = (a, r) => a[Math.floor(r * a.length) % a.length];

// H: { addProp, walkInRoom (shared/map.js: a walk-in's room in a building), lots: [[building, row in its column, column]] }
export function lots3(m, H) {
  const out = { lots: 0, street: 0, shops: {}, sheds: 0, small: 0, dice: 0, list: [] };   // (list: Southside's lots [building, kind or ''] - test/plainblocks.test.js)
  const tile = (x, y) => (m.inside(x, y) ? m.tiles[m.idx(x, y)] : -1);
  const free = (x, y) => m.inside(x, y) && m.bld[m.idx(x, y)] < 0;
  // a real street at (x, y): its pavement, or a street's asphalt (not an alley's or a highway's); never a passage's paving
  const street = (x, y) => { const t = tile(x, y); return t === T.SIDEWALK || ((t === T.ROAD || t === T.BRIDGE) && m.roadRank[m.idx(x, y)] === 2); };
  const along = (n, f) => { let k = 0; for (let i = 0; i < n; i++) if (f(i)) k++; return k; };
  const cands = [];
  for (const [bid, j, col] of H.lots) {
    const b = m.buildings[bid];
    if (!b || b.gone || b.signs.length || b.business || b.walkIn || b.home !== undefined) continue;
    const cx = b.tx + (b.tw >> 1), cy = b.ty + (b.th >> 1);
    if (!m.inside(cx, cy) || m.dist[m.idx(cx, cy)] !== D) continue;
    out.lots++;
    out.list.push([bid, '']);
    // its front: the row south of it open paving (a passage, the pavement, a yard's)
    const fy = b.ty + b.th;
    if (b.back || along(b.tw, (i) => free(b.tx + i, fy) && (tile(b.tx + i, fy) === T.PLAZA || tile(b.tx + i, fy) === T.SIDEWALK || tile(b.tx + i, fy) === T.LOT)) < b.tw * 0.8) { out.sheds++; continue; }
    // on a street: along its west or east side, or across the pavement in front
    const W = along(b.th, (i) => street(b.tx - 1, b.ty + i)) >= b.th * 0.5, E = along(b.th, (i) => street(b.tx + b.tw, b.ty + i)) >= b.th * 0.5;
    const S = along(b.tw, (i) => street(b.tx + i, fy) || street(b.tx + i, fy + 1)) >= b.tw * 0.5;
    if (!W && !E && !S) { out.sheds++; continue; }
    out.street++;
    cands.push({ b, j, col, side: S ? 'S' : W && E ? (hash2(b.tx, b.ty, 1401) < 0.5 ? 'W' : 'E') : W ? 'W' : 'E', blk: blockOf(m, cx, cy) });
  }
  // the mix: a block at a time, south to north, west to east; each lot the first kind (the district's fewest so far first,
  // then in an order drawn by place) that fits it, isn't its neighbors' and hasn't come up its share in the block yet
  cands.sort((p, q) => p.blk - q.blk || p.b.ty - q.b.ty || p.b.tx - q.b.tx);
  const inBlock = new Map();
  for (const c of cands) inBlock.set(c.blk, (inBlock.get(c.blk) || 0) + 1);
  const used = new Map(), done = [], names = {};
  for (const c of cands) {
    const { b } = c, cap = 1 + Math.floor((inBlock.get(c.blk) - 1) / 8), U = used.get(c.blk) || {};
    const next = done.filter((q) => lotsNear(q.b, b)).map((q) => q.kind);
    // (the kinds Southside has fewest of so far first, so the mix spreads over all eight; among them, by place)
    const order = LOT_KINDS.slice().sort((p, q) => (out.shops[p] || 0) - (out.shops[q] || 0) || hash2(b.tx, b.ty, 1411 + LOT_KINDS.indexOf(p)) - hash2(b.tx, b.ty, 1411 + LOT_KINDS.indexOf(q)));
    const fits = (k) => b.tw >= LOT_SHOPS[k].min[0] && b.th >= LOT_SHOPS[k].min[1];
    const kind = order.find((k) => fits(k) && !next.includes(k) && (U[k] || 0) < cap) || order.find((k) => fits(k) && !next.includes(k));
    if (!kind) { out.small++; out.sheds++; continue; }
    U[kind] = (U[kind] || 0) + 1; used.set(c.blk, U);
    c.kind = kind; done.push(c);
    out.list.find((q) => q[0] === b.id)[1] = kind;
    const L = LOT_SHOPS[kind], n = names[kind] = (names[kind] ?? Math.floor(hash2(b.tx, b.ty, 1421) * L.names.length)) + 1;
    shop(m, H, c, L, L.names[n % L.names.length]);
    out.shops[kind] = (out.shops[kind] || 0) + 1;
  }
  out.dice = diceSpots(m, H, cands);
  return out;
}

// two lots next to each other: side by side, or across a passage (gaps of 2 and 5 tiles at most)
export const lotsNear = (a, c) => Math.max(0, Math.max(a.tx, c.tx) - Math.min(a.tx + a.tw, c.tx + c.tw)) <= 2 && Math.max(0, Math.max(a.ty, c.ty) - Math.min(a.ty + a.th, c.ty + c.th)) <= 5;
// The lot shops' POIs into the list, last of all (the world build's done hook, at its end): each its number, and its
// walk-in unit's
export function lotPoisLast(m) {
  for (const p of m.lotPois || []) {
    p.id = m.pois.length;
    m.pois.push(p);
    const b = m.buildings[p.b];
    if (b && b.walkIn) for (const u of b.walkIn.units) if (u.poi === -1) u.poi = p.id;
  }
  if (m.lotPois) delete m.lotPois;
}
// the m.blocks index a tile is in (-1: none)
function blockOf(m, x, y) {
  for (let i = 0; i < m.blocks.length; i++) { const k = m.blocks[i]; if (k && x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) return i; }
  return -1;
}

// one lot made a shop: its door at the street's end of its front (in the middle on a street to the south), its sign,
// its look (rough brick or stucco, a floor or two over the shop, grime and tags), its POI and, if you walk in, its room
function shop(m, H, c, L, label) {
  const { b, side } = c, x = b.tx, y = b.ty, w = b.tw, fy = y + b.th;
  const r = (k) => hash2(x, y, 1430 + k);
  const dtx = side === 'W' ? x + 2 : side === 'E' ? x + w - 2 : x + (w >> 1);
  b.name = label; b.whole = true; b.door = { tx: dtx, ty: fy };
  b.signs.push({ x: (x + w / 2) * TILE, y: (fy - 0.6) * TILE, text: label });
  // (its POI joins the list last of all - lotPoisLast - so the places the world build adds after this keep their numbers)
  const poi = { id: -1, kind: L.poi || 'delivery', label, x: (dtx + 0.5) * TILE, y: (fy + 0.7) * TILE, r: L.poi ? 48 : 40, b: b.id, fixed: true };
  if (L.walk) { poi.walk = true; poi.store = L.walk; }
  if (!m.lotPois) Object.defineProperty(m, 'lotPois', { value: [], enumerable: false, configurable: true });
  m.lotPois.push(poi);
  if (L.poi) b.business = L.poi;
  const brick = r(1) < 0.72, spec = { floors: 1 + (r(2) < 0.55 ? 1 : 0), style: brick ? (r(3) < 0.6 ? 'brickDark' : 'brick') : 'stucco', ...(brick ? { brickTone: pick(BRICK, r(4)) } : { wallColor: pick(STUCCO, r(4)) }),
    win: pick(['pair', 'even'], r(5)), cornice: null, parapet: 6, grime: 0.65 + r(6) * 0.3, roofMat: pick(['tar', 'rubber', 'tar'], r(7)), lip: 10, rimW: 5,
    graffiti: r(8) < 0.6 ? 1 + (r(9) < 0.4 ? 1 : 0) : 0, tagText: pick(TAGS, r(10)), boarded: r(11) < 0.3 ? 0.15 : 0 };
  if (L.arch === 'garage') {
    // a tire shop: the garage's roller doors and its name over them (statics.js 'garage'), stacks of tires out front
    b.arch = 'garage';
    b.art = { spec: { grime: spec.grime, graffiti: spec.graffiti, tagText: spec.tagText }, noShop: true };
    for (const tx of [x + 0.7, x + w - 0.7]) H.addProp(m, 'tires', tx * TILE, (fy + 0.5) * TILE, 8);
    return;
  }
  b.arch = 'rough';
  const [bg, fg] = pick(L.signs, r(12));
  const sh = { kind: L.store, door: side === 'E' ? 'right' : 'left', open: true, people: r(13) < 0.5 ? 1 + Math.floor(r(14) * 2) : 0, sign: { text: label.toUpperCase().slice(0, 20), bg, fg, lit: true },
    awning: L.awning && r(15) < L.awning ? pick(AWN, r(16)) : null };
  if (r(17) < (L.grille || 0)) sh.grille = true;
  if (r(18) < (L.open || 0)) sh.openSign = { col: [255, 60, 70] };
  if (L.trade) sh.trade = L.trade;
  b.art = { spec, shop: sh };
  if (L.poi) H.walkInRoom(m, b, [poi], [poi], true);
}

// Street dice down two of Southside's passages (GM8): the passages between sheds, away from the shops' doors and the
// streets, the farthest apart; the crew's spot against the passage's south wall (the back of the lot below), milk
// crates, trash bags and a pile, a burn barrel and a pallet, a lamp at the wall. -> how many
function diceSpots(m, H, cands) {
  const shops = new Set(cands.filter((c) => c.kind).map((c) => c.col));
  const L = [];
  for (const [bid, j, col] of H.lots) {
    if (!j || shops.has(col)) continue;
    const b = m.buildings[bid], cx = b.tx + (b.tw >> 1), fy = b.ty + b.th;
    if (b.tw < 8 || !m.inside(cx, fy) || m.dist[m.idx(cx, fy)] !== D) continue;
    // the passage: open paving from the lot's front to the next lot down, all the lot's width
    let g = 0;
    while (g < 5 && m.inside(cx, fy + g) && m.tiles[m.idx(cx, fy + g)] === T.PLAZA && m.bld[m.idx(cx, fy + g)] < 0) g++;
    if (g < 3 || g > 4) continue;
    let ok = true;
    for (let xx = b.tx; xx < b.tx + b.tw && ok; xx++) for (let yy = fy; yy < fy + g; yy++) if (m.tiles[m.idx(xx, yy)] !== T.PLAZA) { ok = false; break; }
    if (ok) L.push({ b, g, k: hash2(b.tx, b.ty, 1451) });
  }
  L.sort((p, q) => p.k - q.k);
  const spots = (m.diceSpots ||= []);
  for (const q of L) {
    if (spots.length >= 2) break;
    const { b, g } = q, x = (b.tx + b.tw / 2) * TILE, y = (b.ty + b.th + g) * TILE - 14;
    if (spots.some((s) => Math.abs(s.x - x) < 60 * TILE && Math.abs(s.y - y) < 60 * TILE)) continue;
    spots.push({ x: Math.round(x), y: Math.round(y), a: 0, ix: 0, iy: -1, name: 'Southside' });
    const fy = b.ty + b.th, e = hash2(b.tx, b.ty, 1452) < 0.5 ? 1 : -1, ex = e > 0 ? b.tx + b.tw - 1.2 : b.tx + 1.2;
    // (the crew's crates to sit on beside them, the trash against the wall, a burn barrel and a pallet at the far end of
    // the front wall, the lamp over the back wall: never on the crew's spot)
    H.addProp(m, 'crates', x + e * 2.2 * TILE, (fy + g - 0.5) * TILE, 0);
    H.addProp(m, 'crates', x - e * 2.4 * TILE, (fy + g - 0.5) * TILE, 0);
    H.addProp(m, 'bags', (b.tx + (e > 0 ? 1.1 : b.tw - 1.1)) * TILE, (fy + g - 0.45) * TILE, 0);
    H.addProp(m, 'trashpile', (b.tx + (e > 0 ? 2.4 : b.tw - 2.4)) * TILE, (fy + g - 0.5) * TILE, 0);
    H.addProp(m, 'burnbarrel', ex * TILE, (fy + 0.6) * TILE, 9);
    H.addProp(m, 'pallet', (ex - e * 1.4) * TILE, (fy + 0.5) * TILE, 0);
    H.addProp(m, 'lamp', (e > 0 ? b.tx + 0.5 : b.tx + b.tw - 0.5) * TILE, (fy + g - 0.4) * TILE, 0);
  }
  return spots.length;
}
