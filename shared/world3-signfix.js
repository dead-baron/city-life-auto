// A shop's sign names what's behind it (the audit's frontNames, 7 on 11-22: "FRAME & MAT" over a clinic, "HILLS ANIMAL
// CLINIC" over a donut shop, "QUICK MART 24 7" over a pawn shop and a barber - a building's old sign left when what it
// holds changed). One rule for the build and the lint (tools/audit/worldrows.mjs frontNames): a sign naming none of the
// places behind it, or carrying a trade word (PHARMACY, BAR, HOTEL...) none of them is, is wrong. The build gives a
// wrong shop sign the name of the place behind it (the one nearest the sign's middle). An airport's signs (DEPARTURES,
// ARRIVALS) are its own.
// For the whole-world build's done hook (shared/world3-world.js).
//   frontNames3(m) -> how many signs renamed
import { TILE } from './constants.js';

export const NOT_PLACES = new Set(['home', 'atm', 'vending', 'reception', 'evidence', 'delivery']);
export const TRADE = {   // a word on a sign -> the kinds of place that may carry it
  PHARMACY: 'pharmacy hospital', CLINIC: 'pharmacy hospital', HOSPITAL: 'hospital', BAR: 'club bar roadhouse diner snack coffee',
  PUB: 'club bar roadhouse', TAVERN: 'club bar roadhouse', SALOON: 'club bar roadhouse', CLUB: 'club fence clubhouse',
  CAFE: 'coffee snack diner', COFFEE: 'coffee snack diner', DINER: 'diner snack coffee', BANK: 'bank', SAVINGS: 'bank',
  HOTEL: 'reception', MOTEL: 'reception', INN: 'reception', GUNS: 'gunshop', PAWN: 'pawn', BARBER: 'barber', TATTOO: 'tattoo',
  LIQUOR: 'convenience grocery', MARKET: 'convenience grocery market fishmarket', MART: 'convenience grocery gasstation',
  DELI: 'convenience grocery snack coffee', GROCERY: 'grocery convenience', HARDWARE: 'hardware', TACKLE: 'tackle',
  CASINO: 'casino', CINEMA: 'cinema', THEATER: 'cinema', BOWL: 'bowling', LANES: 'bowling', ARCADE: 'arcade', POLICE: 'police',
  GAS: 'gasstation', FUEL: 'gasstation', SPORTS: 'sports', BOUTIQUE: 'clothing', APPAREL: 'clothing', THREADS: 'clothing',
};
export const up = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9 &']/g, ' ').replace(/\s+/g, ' ').trim();
export const sig = (s) => up(s).split(' ').filter((w) => w.length >= 4 && !/^(THE|AND|SHOP|STORE|CO|CORNER|PLACE|STREET)$/.test(w));
const OWN_SIGNS = new Set(['airport']);

// what's wrong with sign text t over places biz (in building b): 'trade' (a trade word none of them is), 'name' (the
// shop front's own sign - isShop - names none of them, though it names something), or null
export function signWrong(t, biz, b, isShop = true) {
  if (!biz.length || biz.some((p) => OWN_SIGNS.has(p.kind))) return null;
  const names = new Set([...biz.flatMap((p) => sig(p.label)), ...sig(b.name)]);
  const kinds = new Set(biz.map((p) => (p.casino ? 'casino' : p.kind)));
  const ws = up(t).split(' '), trade = ws.filter((w) => TRADE[w]);
  const wrongTrade = trade.filter((w) => !TRADE[w].split(' ').some((k) => kinds.has(k)));
  const named = sig(t).some((w) => names.has(w));
  if (wrongTrade.length && !named) return 'trade';
  if (isShop && !named && !trade.length && sig(t).length) return 'name';   // (a shop front's own sign names its place; a 'RENTALS' or a 'NO TRESPASSING' needn't)
  return null;
}

export function frontNames3(m) {
  let n = 0;
  const placesOf = new Map();
  for (const p of m.pois) if (p && p.b !== undefined && p.b !== null) { let l = placesOf.get(p.b); if (!l) placesOf.set(p.b, (l = [])); l.push(p); }
  for (const b of m.buildings) {
    if (!b || b.gone || b.tw === undefined) continue;
    const biz = (placesOf.get(b.id) || []).filter((p) => !NOT_PLACES.has(p.kind) || p.casino);
    if (!biz.length) continue;
    const nearest = (x) => biz.slice().sort((a, c) => Math.abs(a.x - x) - Math.abs(c.x - x))[0];
    const sign = b.art && b.art.shop && b.art.shop.sign;
    if (sign && sign.text && signWrong(sign.text, biz, b, true)) {
      b.art = { ...b.art, shop: { ...b.art.shop, sign: { ...sign, text: up(nearest((b.tx + b.tw / 2) * TILE).label).slice(0, 24) } } };
      n++;
    }
    // (its other signs - a hanging board, a blade - by the trade rule: a CLINIC over a donut shop)
    if (b.signs) for (let k = 0; k < b.signs.length; k++) {
      const q = b.signs[k];
      if (q && q.text && signWrong(q.text, biz, b, false)) { b.signs[k] = { ...q, text: up(nearest(q.x).label).slice(0, 24) }; n++; }
    }
  }
  return n;
}
