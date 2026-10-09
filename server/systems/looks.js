// A player's look (shared/look.js): kept in the profile as its compact code, worn by their ped as the old-style
// appearance plus that code (lookToApp: app.lk), so every client draws it and the police describe it. The creator
// (client/creator.js) sets it and keeps up to SAVED_LOOKS named looks.
//   ensureLook(prof)        an old profile's random outfit becomes a look; a new player gets a starter until they pick
//   appOf(prof)             the appearance their ped wears
//   handle(world, p, msg)   the client's { t: 'look', a: 'set' | 'save' | 'del' | 'ren' | 'get' | 'buy' | 'cut', ... }
//   stateMsg(p, world?)     { t: 'looks', cur, picked, saved: [{ n, c }], own, free (, home) } (+ open: 'wheel' | 'edit'
//                           from the home's wardrobe, 'shop' | 'barber' from a store's counter: openShop)
// Free changes are blocked while you're wanted (a free disguise) - except inside your own home, where changing is
// unseen and drops your public wanted level like the home's "Change outfit".
// Clothes to buy (task #364, shared/wardrobe.js): the profile's wardrobe (prof.wardrobe: the piece ids you own). You
// wear only what you own; the stores sell the rest (the fitting room: 'buy', with Buy and wear), the barbershops
// and salons change the hair ('cut'), the mirror at home the body, face and extras. A new player's first session
// (the starting look, "Make it yours") is free, and whatever they leave it wearing is theirs.
import { decodeLook, encodeLook, validLook, lookToApp, lookFromOutfit, starterFor, randomLook, SLOTS, PIECES } from '../../shared/look.js';
import * as W from '../../shared/wardrobe.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import { applyDisguise, payFrom } from './economy.js';

export const SAVED_LOOKS = 12;
const NAME_MAX = 20;

export function ensureLook(prof) {
  if (typeof prof.look === 'string' && decodeLook(prof.look)) { if (!Array.isArray(prof.looks)) prof.looks = []; ensureWardrobe(prof); return; }
  if (prof.outfit) { prof.look = encodeLook(lookFromOutfit(prof.outfit)); prof.lookPicked = true; }
  else { prof.look = encodeLook(starterFor(parseInt(String(prof.pid || '0').slice(0, 8), 16) || 0)); prof.lookPicked = false; }
  delete prof.outfit;
  if (!Array.isArray(prof.looks)) prof.looks = [];
  ensureWardrobe(prof);
}
// the wardrobe: a new player owns the basics (and, once they've picked, their starting look: grant); a player from
// before the shops owns what they're wearing and what's in their saved looks (they were free then)
function ensureWardrobe(prof) {
  if (Array.isArray(prof.wardrobe)) { prof.wardrobe = prof.wardrobe.filter((id) => Number.isInteger(id) && PIECES[id]); return; }
  prof.wardrobe = [...W.BASICS];
  if (prof.lookPicked !== false) {
    grant(prof, decodeLook(prof.look));
    for (const s of prof.looks || []) grant(prof, decodeLook(s.c));
  }
}
// a look's pieces go into the wardrobe
export function grant(prof, L) {
  if (!Array.isArray(prof.wardrobe)) prof.wardrobe = [...W.BASICS];
  for (const id of W.lookPieces(L)) if (!W.owns(prof.wardrobe, id)) prof.wardrobe.push(id);
}
export function appOf(prof) {
  ensureLook(prof);
  return lookToApp(decodeLook(prof.look), prof.look);
}
export function stateMsg(p, world = null) {
  const prof = p.profile;
  ensureLook(prof);
  const m = { t: 'looks', cur: prof.look, picked: prof.lookPicked !== false, saved: prof.looks.map((s) => ({ n: s.n, c: s.c })), own: prof.wardrobe.slice(), free: prof.lookPicked === false };
  if (world) m.home = atHome(world, p);
  return m;
}
const cleanName = (n) => String(n || '').replace(/[^\p{L}\p{N} '&.,!?-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// why the look can't change right now (null: it can)
export function changeBlocked(world, p) {
  const ped = p.ped;
  if (!ped) return 'Not right now.';
  if (ped.dead) return 'Not while you\'re down.';
  if (ped.cuffed || p.custody) return 'Not in cuffs.';
  if (p.badge) return 'Hand in the uniform (go off duty) first.';
  if (p.wanted > 0 && !atHome(world, p)) return 'Not while the police are after you - lose them first, change at home, or buy a new outfit at a clothes shop.';
  return null;
}
// inside your own home, having opened the wardrobe there (economy.js 'hlooks' / 'hmirror') in the last ten minutes:
// nobody sees you change, so the new look is a disguise (like the home's "Change outfit")
export const atHome = (world, p) => !!(p.ped && p.ped.hidden && p.lookHomeAt !== undefined && world.time - p.lookHomeAt < 600);
// put a look on (code already checked): the profile, the ped, everyone's view of them (give: its pieces become yours)
export function wear(world, p, code, give = false) {
  const prof = p.profile;
  if (give) grant(prof, decodeLook(code));
  prof.look = code;
  prof.lookPicked = true;
  if (p.ped) { p.ped.app = appOf(prof); p.ped.appVer = (p.ped.appVer || 0) + 1; }
  store.touch();
}
// a whole new outfit (the clothes shop's service; ownedOnly: the wardrobe at home, from what you own): body, face and
// hair kept
export function freshOutfit(prof, seed, ownedOnly = false) {
  ensureLook(prof);
  const cur = decodeLook(prof.look), r = randomLook(seed >>> 0, cur.body.base);
  for (const s of SLOTS) cur.outfit[s] = r.outfit[s];
  if (ownedOnly) {
    const rr = mulberry32((seed >>> 0) ^ 0x77a1);
    const pick = (s) => {
      const l = prof.wardrobe.filter((id) => PIECES[id] && PIECES[id].slot === s);
      if (!l.length) return null;
      const P = PIECES[l[Math.floor(rr() * l.length) % l.length]];
      return { id: P.i, c: P.c, t: P.t, p: P.d.p || 0 };
    };
    for (const s of SLOTS) { const it = cur.outfit[s]; if (it && !W.owns(prof.wardrobe, it.id)) cur.outfit[s] = pick(s); }
    if (!cur.outfit.set) { cur.outfit.top ||= pick('top'); cur.outfit.bottoms ||= pick('bottoms'); }
    cur.outfit.shoes ||= pick('shoes');
  }
  return encodeLook(validLook(cur));
}

// why a new look can't be worn (outside the first session; null: it can): the body, face and extras change at the
// mirror at home, the hair at a barber or salon (a new body at home brings its own), and every piece must be yours
function refusal(world, p, cur, L) {
  const c = W.changes(cur, L), home = atHome(world, p);
  if (c.body && !home) return 'Your body, face, makeup and tattoos change at the mirror at home.';
  if (c.hair && !(home && cur.body.base !== L.body.base)) return 'Hair and facial hair change at a barbershop or a hair salon.';
  return unownedNote(p.profile.wardrobe, L);
}
function unownedNote(own, L) {
  const no = W.unowned(own, L);
  if (!no.length) return null;
  const S = W.STORES[W.sellerOf(no[0])];
  return `You don't own the ${PIECES[no[0]].name}${no.length > 1 ? ` (or ${no.length - 1} more)` : ''} yet${S ? ` - ${S.name} sells it` : ''}.`;
}

// ---- the stores' fitting rooms and the barber's chair -----------------------------------------------------------------
// a store's counter opens the fitting room (economy.js 'fit') or the barber's chair ('chair')
export function openShop(world, p, poi) {
  const barber = poi.kind === 'barber', sid = barber ? null : W.storeOf(poi);
  if (!barber && !sid) return 'Nothing to try on here.';
  if (p.conn) p.conn.sendJSON({ ...shopState(world, p), open: barber ? 'barber' : 'shop', shop: { poi: poi.id, store: sid, kind: barber ? (poi.salon ? 'salon' : 'barber') : null, name: poi.label } });
  return null;
}
const shopState = (world, p) => ({ ...stateMsg(p, world), cash: p.profile.cash, bank: p.profile.bank });
function counter(world, p, id) {
  const poi = world.map.pois[Number(id)], ped = p.ped;
  if (!poi || !ped || ped.dead || ped.vehId) return null;
  return Math.hypot(ped.x - poi.x, ped.y - poi.y) <= (poi.r || 40) + 40 ? poi : null;
}
// changing in a store (or the barber's chair) is like the clothes shop's new outfit: not with a cop watching, and
// while you're wanted only with something new (a fresh look there drops your public wanted level: applyDisguise)
function storeBlocked(world, p, bought) {
  const ped = p.ped;
  if (!ped || ped.dead) return 'Not right now.';
  if (ped.cuffed || p.custody) return 'Not in cuffs.';
  if (p.badge) return 'Hand in the uniform (go off duty) first.';
  if (p.wanted > 0 && world.time - p.seenAt < 3) return 'Cops have eyes on you - lose them before changing your look!';
  if (p.wanted > 0 && !bought) return 'Not while the police are after you - buy something new, or change at home.';
  return null;
}
// { a: 'buy', poi, ids: [piece ids], wear: code | null }: buy the pieces (sold here, not yours yet), paid from your
// cash and then the bank; with wear, put that look on (only its clothes may differ, all of them yours by then)
function buy(world, p, msg) {
  const prof = p.profile;
  const poi = counter(world, p, msg.poi), sid = poi && poi.kind !== 'barber' ? W.storeOf(poi) : null;
  if (!sid) { world.notify(p, 'You walked away from the counter.', 'warn'); return shopState(world, p); }
  const ids = [...new Set((Array.isArray(msg.ids) ? msg.ids : []).map(Number))].filter((id) => Number.isInteger(id) && PIECES[id] && !W.owns(prof.wardrobe, id)).slice(0, 12);
  if (ids.some((id) => !W.stocks(sid, id))) { world.notify(p, 'They don\'t sell that here.', 'warn'); return shopState(world, p); }
  let next = null;
  if (msg.wear) {
    next = decodeLook(msg.wear);
    if (!next) { world.notify(p, 'That look didn\'t come through.', 'warn'); return shopState(world, p); }
    const c = W.changes(decodeLook(prof.look), next);
    if (c.body || c.hair) { world.notify(p, 'Only the clothes change in a fitting room.', 'warn'); return shopState(world, p); }
    const why = storeBlocked(world, p, ids.length > 0) || unownedNote([...prof.wardrobe, ...ids], next);
    if (why) { world.notify(p, why, 'warn'); return shopState(world, p); }
    if (encodeLook(next) === prof.look) next = null;
  }
  if (!ids.length && !next) return shopState(world, p);
  const total = ids.reduce((t, id) => t + W.priceAt(sid, id), 0);
  if (total > 0 && !payFrom(p, total)) { world.notify(p, 'Not enough money (cash and bank).', 'bad'); return shopState(world, p); }
  for (const id of ids) prof.wardrobe.push(id);
  if (ids.length) world.notify(p, `Bought ${ids.map((id) => PIECES[id].name).join(', ')} for $${total}.${next ? '' : ' It\'s in your wardrobe.'}`, 'good');
  if (next) {
    p.lookSetAt = world.time;
    wear(world, p, encodeLook(next));
    if (ids.length) applyDisguise(world, p);   // (a fresh look in a store: like the clothes shop's new outfit)
  }
  store.touch();
  return shopState(world, p);
}
// { a: 'cut', poi, c: code }: the barber's or the salon's chair - a look that changes only the hair, paid for
function cut(world, p, msg) {
  const prof = p.profile;
  const poi = counter(world, p, msg.poi);
  if (!poi || poi.kind !== 'barber') { world.notify(p, 'You got up out of the chair.', 'warn'); return shopState(world, p); }
  const next = decodeLook(msg.c);
  const cost = next && W.hairCost(poi.salon ? 'salon' : 'barber', decodeLook(prof.look), next);
  if (!cost) { world.notify(p, poi.salon ? 'The salon does cuts and colour.' : 'They only do hair here.', 'warn'); return shopState(world, p); }
  if (!cost.parts.length) return shopState(world, p);
  const why = storeBlocked(world, p, true);
  if (why) { world.notify(p, why, 'warn'); return shopState(world, p); }
  if (!payFrom(p, cost.total)) { world.notify(p, 'Not enough money (cash and bank).', 'bad'); return shopState(world, p); }
  p.lookSetAt = world.time;
  wear(world, p, encodeLook(next));
  world.notify(p, `${cost.parts.map(([w]) => w[0].toUpperCase() + w.slice(1)).join(', ')}: $${cost.total}.`, 'good');
  applyDisguise(world, p);
  return shopState(world, p);
}

export function handle(world, p, msg) {
  const prof = p.profile;
  ensureLook(prof);
  const a = String(msg.a || 'get');
  if (a === 'get') return stateMsg(p, world);
  if (a === 'buy') return buy(world, p, msg);
  if (a === 'cut') return cut(world, p, msg);
  if (a === 'set') {
    const L = decodeLook(msg.c);
    if (!L) { world.notify(p, 'That look didn\'t come through.', 'warn'); return stateMsg(p, world); }
    const code = encodeLook(L), first = prof.lookPicked === false;   // (the first session is free: whatever it ends in is yours)
    if (code === prof.look) { if (first) { prof.lookPicked = true; grant(prof, L); store.touch(); } return stateMsg(p, world); }
    const why = changeBlocked(world, p) || (first ? null : refusal(world, p, decodeLook(prof.look), L));
    if (why) { world.notify(p, why, 'warn'); return stateMsg(p, world); }
    if (p.lookSetAt !== undefined && world.time - p.lookSetAt < 1) return stateMsg(p, world);   // (one change a second: each one goes out to everyone near)
    p.lookSetAt = world.time;
    wear(world, p, code, first);
    if (atHome(world, p)) applyDisguise(world, p);
    return stateMsg(p, world);
  }
  if (a === 'save') {
    const L = decodeLook(typeof msg.c === 'string' ? msg.c : prof.look);
    const n = cleanName(msg.n);
    if (!L || !n) { world.notify(p, 'Give the look a name.', 'warn'); return stateMsg(p); }
    const no = prof.lookPicked === false ? null : unownedNote(prof.wardrobe, L);   // (try on anything; keep only what you own)
    if (no) { world.notify(p, no, 'warn'); return stateMsg(p); }
    const code = encodeLook(L), i = prof.looks.findIndex((s) => s.n.toLowerCase() === n.toLowerCase());
    if (i >= 0) prof.looks[i] = { n, c: code };
    else if (prof.looks.length >= SAVED_LOOKS) { world.notify(p, `You can keep ${SAVED_LOOKS} looks: delete one first.`, 'warn'); return stateMsg(p); }
    else prof.looks.push({ n, c: code });
    store.touch();
    world.notify(p, `Look saved: ${n}.`, 'good');
    return stateMsg(p);
  }
  const i = Number(msg.i);
  if (!Number.isInteger(i) || i < 0 || i >= prof.looks.length) return stateMsg(p);
  if (a === 'del') { prof.looks.splice(i, 1); store.touch(); return stateMsg(p); }
  if (a === 'ren') {
    const n = cleanName(msg.n);
    if (!n) return stateMsg(p);
    if (prof.looks.some((s, j) => j !== i && s.n.toLowerCase() === n.toLowerCase())) { world.notify(p, 'You have a look by that name already.', 'warn'); return stateMsg(p); }
    prof.looks[i].n = n;
    store.touch();
    return stateMsg(p);
  }
  return stateMsg(p);
}
