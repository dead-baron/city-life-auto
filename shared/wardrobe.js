// Clothes to buy (task #364; concept sheets ST1-ST4, CC1, CC3, CC4, CC7): the city's clothing stores - what each one
// stocks and at what price - what a player owns, and the barber's and the salon's menu. Pure and shared: the server
// sells by it (server/systems/looks.js), the fitting room shows it (client/creator.js). Loaded lazily on the page,
// with shared/look.js.
//   STORES[id]            { name, line, icon, k (its markup), rules: [{ kinds, styles }] }: a piece is stocked when one
//                         rule takes its store kind (shared/look.js PIECES[i].store; null: any kind) and one of its
//                         style tags (null: any style)
//   storeOf(poi)          the store a place is: the clothing stores carry poi.store (map.js buildClothesShops); the
//                         sports store, the pawn shop, the fence and the hunting places sell clothes as well
//   stock(id)             the piece ids a store sells; stocks(id, pieceId); priceAt(id, pieceId)
//   sellerOf(pieceId)     a store that sells it (the creator's padlock, CC7)
//   owns(own, id)         in the wardrobe (pieces that cost nothing - bare chest, barefoot, hood up - are anyone's)
//   lookPieces(L), unowned(own, L), startingWardrobe(L)
//   changes(cur, next)    what a new look changes: { body (body, face, extras), hair, outfit }
//   storeOutfits(id, base, n)   complete outfits in the store's styles, of its own pieces (the fitting room's Outfits)
//   HAIR_TABS, hairCost(kind, cur, next)   the barber's and the salon's menu, and what a change costs
import { PIECES, PIECE_IDS, SLOTS, STYLES, FACIAL_HAIR, randomLook, validLook } from './look.js';
import { CLOTHES_PRICE_K, STARTER_BASICS, BARBER_PRICES, SALON_K } from './rules.js';

const R = (kinds, styles) => ({ kinds: kinds ? kinds.split(' ') : null, styles: styles ? styles.split(' ') : null });
// (the order matters for sellerOf: the stores that sell a whole store kind come first)
export const STORES = {
  threads: { name: 'Threads Outfitters', line: 'Everyday clothes for everyone', icon: '👕', k: 1, rules: [R('clothing'), R('shoes', 'casual lounge')] },
  sports: { name: 'Home Run Sports', line: 'Gym, track and game day', icon: '⚾', k: 1, rules: [R('sports'), R(null, 'athletic')] },
  outfitter: { name: 'Trail & Field Outfitters', line: 'Built for the outdoors', icon: '🥾', k: 1, rules: [R('outdoor'), R(null, 'outdoors')] },
  workwear: { name: 'Hardline Workwear', line: 'Clothes for every trade', icon: '🦺', k: 1, rules: [R('workwear'), R(null, 'work')] },
  surf: { name: 'Salt & Swell Surf Shop', line: 'Swimwear, sandals and sun hats', icon: '🏄', k: 1, rules: [R('beach'), R(null, 'beach')] },
  surplus: { name: 'Ironside Army Surplus', line: 'Surplus, boots and things that hide a face', icon: '🎖', k: 1, rules: [R('costume'), R(null, 'disguise')] },
  pawn: { name: 'Second Chance Pawn', line: 'Gold, silver and watches, pre-owned', icon: '💍', k: 0.9, rules: [R('jeweller')] },
  velvet: { name: 'Velvet & Vine', line: 'High fashion, business and black tie', icon: '💎', k: 1.2, rules: [R(null, 'hifashion business formal')] },
  dept: { name: 'Marlow & Finch', line: 'The department store: smart, casual, lounge and winter', icon: '🏬', k: 1, rules: [R(null, 'smart casual lounge winter')] },
  afterglow: { name: 'Afterglow', line: 'Dressed for the night', icon: '🌙', k: 1.1, rules: [R(null, 'nightclub')] },
  kicks: { name: 'Corner Kicks', line: 'Sneakers and streetwear', icon: '👟', k: 1, rules: [R(null, 'streetwear street')] },
  kickflip: { name: 'Kickflip Skate Co.', line: 'Decks, shoes and threads', icon: '🛹', k: 1, rules: [R(null, 'skater')] },
  thrift: { name: 'Second Skin Vintage', line: 'Thrift and vintage: punk, alt and retro', icon: '🧷', k: 0.8, rules: [R(null, 'punk alt retro')] },
  feed: { name: 'Cedar Feed & Western Wear', line: 'Farm supply: boots, hats and denim', icon: '🤠', k: 1, rules: [R(null, 'western')] },
  lodge: { name: 'Hunting Lodge Outfitter', line: 'Warm, tough clothes for the hunt', icon: '🦌', k: 1.1, rules: [R(null, 'outdoors winter')] },
  fence: { name: 'Back-Alley Exchange', line: 'Disguises, no questions asked', icon: '🕶', k: 1.5, rules: [R(null, 'disguise')] },
};
// the places that aren't clothing stores but sell clothes too (their own counters' menus)
const STORE_OF_KIND = { sports: 'sports', pawn: 'pawn', fence: 'fence', lodge: 'lodge', huntcamp: 'lodge' };
export function storeOf(poi) {
  if (!poi) return null;
  if (poi.kind === 'clothing') return STORES[poi.store] ? poi.store : 'threads';
  return STORE_OF_KIND[poi.kind] || null;
}

const takes = (S, P) => S.rules.some((r) => (!r.kinds || r.kinds.includes(P.store)) && (!r.styles || r.styles.some((s) => P.tags.includes(s))));
const STOCK = {};
export function stock(id) {
  const S = STORES[id];
  if (!S) return [];
  return STOCK[id] || (STOCK[id] = PIECES.filter((P) => P && P.price > 0 && takes(S, P)).map((P) => P.i));
}
export const stocks = (id, pid) => stock(id).includes(pid);
export function priceAt(id, pid) {
  const P = PIECES[pid], S = STORES[id];
  if (!P || !S) return 0;
  return P.price ? Math.max(1, Math.round(P.price * CLOTHES_PRICE_K * (S.k || 1))) : 0;
}
export function sellerOf(pid) {
  for (const id of Object.keys(STORES)) if (stocks(id, pid)) return id;
  return null;
}

// ---- owning ----------------------------------------------------------------------------------------------------
export const free = (pid) => !!PIECES[pid] && PIECES[pid].price === 0 && !PIECES[pid].d.issued;   // (an issued uniform is nobody's to wear off duty)
export const owns = (own, pid) => free(pid) || (!!own && own.includes(pid));
export function lookPieces(L) {
  const out = [];
  if (L && L.outfit) for (const s of SLOTS) { const it = L.outfit[s]; if (it && it.id && !out.includes(it.id)) out.push(it.id); }
  return out;
}
export const unowned = (own, L) => lookPieces(L).filter((id) => !owns(own, id));
export const BASICS = STARTER_BASICS.map((n) => PIECE_IDS[n]).filter(Boolean);
export function startingWardrobe(L) {
  const out = [...BASICS];
  for (const id of lookPieces(L)) if (!out.includes(id) && !free(id)) out.push(id);
  return out;
}
// what a new look changes from the one worn (both checked looks: validLook keeps the fields in one order)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function changes(cur, next) {
  return { body: !same(cur.body, next.body) || !same(cur.face, next.face) || !same(cur.extras, next.extras), hair: !same(cur.hair, next.hair), outfit: !same(cur.outfit, next.outfit) };
}

// ---- the fitting room's complete outfits --------------------------------------------------------------------------
// up to n outfits in the store's styles, each only of pieces it sells: { slot: item } for the slots it fills
// The fitting room's complete outfits: whole outfits (a top and bottoms, or a dress or a set) in the store's styles, of
// its own pieces, each in its own colours - its main piece in a colour no earlier outfit's has (the morning playtest:
// a skate shop's ten outfits came out in the same grey hoodie)
const OUTFIT_COLOURS = [19, 6, 10, 22, 5, 0, 11, 27, 21, 8, 29, 13, 18, 9, 25, 14, 37, 34];   // (shared/look.js CLOTH: red, navy, teal, mustard...)
export function storeOutfits(id, base, n = 10) {
  const S = STORES[id];
  if (!S) return [];
  const have = stock(id), haveSet = new Set(have);
  let styles = [];
  for (const r of S.rules) for (const s of r.styles || []) if (!styles.includes(s)) styles.push(s);
  if (!styles.length) styles = STYLES.map((s) => s[0]);
  let h = 17; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const own = (slot) => have.filter((pid) => PIECES[pid].slot === slot && PIECES[pid].b.includes(base));
  const tops = own('top'), bots = own('bottoms');
  const out = [], seen = new Set(), used = new Set();
  for (let i = 0; out.length < n && i < n * 8; i++) {
    const seed = (h + i * 7919) >>> 0, L = randomLook(seed, base, styles[i % styles.length]);
    const o = {};
    for (const s of SLOTS) { const it = L.outfit[s]; if (it && haveSet.has(it.id)) o[s] = { ...it }; }
    // whole: a top and bottoms of the store's own where the random look's aren't stocked here
    if (!o.set) {
      if (!o.top && tops.length) { const P = PIECES[tops[seed % tops.length]]; o.top = { id: P.i, c: P.c, t: P.t, p: P.d.p || 0 }; }
      if (!o.bottoms && bots.length) { const P = PIECES[bots[(seed >>> 4) % bots.length]]; o.bottoms = { id: P.i, c: P.c, t: P.t, p: P.d.p || 0 }; }
    }
    if (!o.set && !(o.top && o.bottoms)) continue;
    const key = SLOTS.map((s) => (o[s] ? o[s].id : 0)).join('.');
    if (seen.has(key)) continue;
    // the main piece (a jacket over the top, else the dress, set or top) in a colour of its own
    const main = o.jacket || o.set || o.top;
    if (used.has(main.c)) { const c = OUTFIT_COLOURS.find((k) => !used.has(k) && k !== (o.bottoms && o.bottoms.c)); if (c !== undefined) main.c = c; }
    used.add(main.c);
    seen.add(key);
    out.push(o);
  }
  return out;
}
// a complete outfit on a look: its clothes replace the clothes worn (a jacket worn before doesn't stay over its top), its
// shoes, hat, glasses, jewellery and bag where it has them
export function dressIn(L, o) {
  const V = validLook(L);
  if (o.set || o.top) { V.outfit.top = null; V.outfit.bottoms = null; V.outfit.set = null; V.outfit.jacket = null; }
  for (const s of SLOTS) if (o[s]) V.outfit[s] = { ...o[s] };
  if (o.set) { V.outfit.top = null; V.outfit.bottoms = null; }
  else if ((o.top || o.bottoms) && V.outfit.set) V.outfit.set = null;
  return validLook(V);
}

// ---- the barbershop and the hair salon (ST3) ------------------------------------------------------------------------
export const HAIR_TABS = { barber: [['cut', 'Cut'], ['colour', 'Colour'], ['beard', 'Beard'], ['moustache', 'Moustache']], salon: [['cut', 'Cut'], ['colour', 'Colour']] };
const MOUSTACHE_KINDS = ['moustache', 'handlebar'];
export const MOUSTACHES = [0, ...FACIAL_HAIR.map((f, i) => [f, i]).filter(([f]) => MOUSTACHE_KINDS.includes(f[1])).map(([, i]) => i)];
export const BEARDS = [0, ...FACIAL_HAIR.map((f, i) => [f, i]).filter(([f]) => f[1] && !MOUSTACHE_KINDS.includes(f[1])).map(([, i]) => i)];
export const hairPrice = (kind, what) => Math.round((BARBER_PRICES[what] || 0) * (kind === 'salon' ? SALON_K : 1));
// what a change of hair costs at a barber ('barber') or a salon ('salon'): { total, parts: [[what, price]] }, or
// null when the new look changes anything but the hair (or the salon's asked for a beard)
export function hairCost(kind, cur, next) {
  const c = changes(cur, next);
  if (c.body || c.outfit) return null;
  const parts = [];
  if (cur.hair.style !== next.hair.style) parts.push(['cut', hairPrice(kind, 'cut')]);
  if (cur.hair.color !== next.hair.color) parts.push(['colour', hairPrice(kind, 'colour')]);
  if (cur.hair.facial !== next.hair.facial) {
    if (kind === 'salon') return null;
    const mo = MOUSTACHES.includes(next.hair.facial) && (next.hair.facial || MOUSTACHES.includes(cur.hair.facial));
    parts.push([mo ? 'moustache' : 'beard', hairPrice(kind, mo ? 'moustache' : 'beard')]);
  }
  return { total: parts.reduce((t, p) => t + p[1], 0), parts };
}
