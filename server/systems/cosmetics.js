// Status and cosmetics (docs/PROGRESSION.md "Money sinks" and "Seasons"; progression build item 6; the numbers:
// shared/rules.js COSMETICS, SEASON). Priced as goals - something to save up for, or the weekly goals' cosmetic tokens
// (goals.js: profile.goals.tok) - and never any combat power:
//   - a name color and a title plate by your name: the nameplate over your head (the ped's descriptor np: server/net.js;
//     drawn by client/main.js drawWorldLabels). Bought and picked at any clothing store's style counter (economy.js
//     'cos': the menu below). Plates: the ones bought, a season's gift's, and each career's rank titles - a rank's while
//     you hold it, the top rank's for good (with its season).
//   - the top of a ladder (Kingpin, Chief, Tycoon - the careers' 'kingpin', 'chief', 'tycoon' unlocks): reaching it puts
//     its title over your name for everyone, in gold (worn the moment it's reached: noteTops; take it off or swap it at the
//     style counter). Kept for good with its season: "Kingpin" while you hold the rank, "S0 Kingpin" once a season's wipe
//     has taken the rank (a top reached again in a later season: the latest season's).
//   - a car's paint in the color you pick, at a Fresh Coat garage (economy.js 'cpaint': paintMenu / paintPick).
//   - the beta gift (SEASON.beta - Season 0, the public beta): every account that plays during it gets the Founding
//     Citizen jacket (shared/lookcore.js: a gift piece - never sold, the varsity jacket's art in black and gold) and the
//     Beta plate, on its first session (update). The plate is a card plate (COSMETICS.plates card: 1): on the player's own
//     card and Skills badges only, never over their name (the owner, 11-16: "we don't need to have the 'beta' tag on every
//     player"); worn before that, it comes off on the next session (update).
// Kept outside the progress-epoch reset (server/store.js resetProfile keeps prof.cosm and the wardrobe), so all of it
// survives a season's wipe; the tokens themselves are a season's (profile.goals).
//   - a season's: a badge for each season played (sb - noted on a session's first tick; seasons.js at a season's end)
//     and the gold plate of a career board's top 10 at a season's end (bp - seasons.js endSeason: 'S0 Top 10 Kingpin').
//   profile.cosm: { c: [color ids owned], pl: [plate ids bought], tops: [{ c (career), s (season) }] (the top ranks
//     reached), nc (the color worn, or null), tp (the plate worn, or null), gifts: { beta: { at, s } }, sb: [seasons
//     played], bp: [{ s (season), c (career), i (place), of (the top it was) }], tw (a top's title put on once: 1) } -
//     absent on old profiles (made the first time; sb, bp, tw on older ones too). tops: one { c, s } a career a season.
import { COSMETICS, SEASON, CAREERS, CAREER_KEYS, SUPPORT } from '../../shared/rules.js';
import { encodeLook, decodeLook } from '../../shared/look.js';
import { SPECIAL_PAINTS } from '../../shared/specialpaint.js';
import { PIECE_IDS } from '../../shared/lookcore.js';
import { PAINTS } from '../../shared/vehicles.js';
import { store } from '../store.js';
import * as careers from './careers.js';
import * as looks from './looks.js';
import { tagOf } from './crews.js';   // (a founded crew's tag by its members' names)

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const COLOR = Object.fromEntries(COSMETICS.colors.map((c) => [c.id, c]));
const PLATE = Object.fromEntries(COSMETICS.plates.map((q) => [q.id, q]));
export const PAINT_NAMES = ['Red', 'Blue', 'White', 'Black', 'Yellow', 'Orange', 'Green', 'Purple', 'Pink', 'Teal', 'Silver', 'Bronze', 'Navy', 'Maroon'];
const TOP = (c) => CAREERS[c].ranks.length - 1;

export const cosmOf = (prof) => {
  const C = (prof.cosm ||= { c: [], pl: [], tops: [], nc: null, tp: null, gifts: {}, sb: [], bp: [] });
  C.c ||= []; C.pl ||= []; C.tops ||= []; C.gifts ||= {}; C.sb ||= []; C.bp ||= [];
  return C;
};
export const tokens = (prof) => (prof.goals && prof.goals.tok) || 0;
const spendTok = (prof, n) => { if (tokens(prof) < n) return false; prof.goals.tok -= n; return true; };

// ---- plates -------------------------------------------------------------------------------------------------------------
// a rank plate's id: 'r:<career>:<rank>'
const rankPlate = (id) => { const m = /^r:(\w+):(\d)$/.exec(id || ''); return m && CAREERS[m[1]] && +m[2] >= COSMETICS.rankPlatesFrom && +m[2] <= TOP(m[1]) ? { c: m[1], r: +m[2] } : null; };
// a season board's plate: 'b:<season>:<career>' (granted at the season's end: seasons.js)
const boardPlate = (id) => { const m = /^b:(\d+):(\w+)$/.exec(id || ''); return m && CAREERS[m[2]] ? { s: +m[1], c: m[2] } : null; };
export const boardPlateId = (s, c) => `b:${s}:${c}`;
const boardOf = (prof, B) => cosmOf(prof).bp.find((q) => q.s === B.s && q.c === B.c) || null;
// the season a top rank was last reached in (profile.cosm.tops), or null
const topSeason = (prof, c) => { let s = null; for (const t of cosmOf(prof).tops) if (t.c === c && (s === null || t.s > s)) s = t.s; return s; };
export const isTopPlate = (id) => { const R = rankPlate(id); return !!R && R.r === TOP(R.c); };
export function plateText(id, prof = null) {
  const R = rankPlate(id);
  if (R && R.r === TOP(R.c) && prof && careers.careerRank(prof, R.c) < R.r) { const s = topSeason(prof, R.c); if (s !== null) return `S${s} ${CAREERS[R.c].ranks[R.r].name}`; }   // (kept from its season)
  if (R) return CAREERS[R.c].ranks[R.r].name;
  const B = boardPlate(id);
  if (B) { const q = prof && boardOf(prof, B); return `S${B.s} Top ${(q && q.of) || SEASON.top} ${CAREERS[B.c].ranks[TOP(B.c)].name}`; }
  return PLATE[id] ? PLATE[id].t : null;
}
// may wear it: bought, gifted, a rank held now, a top rank once reached
export function hasPlate(prof, id) {
  const C = cosmOf(prof), R = rankPlate(id);
  if (R) return careers.careerRank(prof, R.c) >= R.r || (R.r === TOP(R.c) && C.tops.some((t) => t.c === R.c));
  const B = boardPlate(id);
  if (B) return !!boardOf(prof, B);
  const P = PLATE[id];
  if (!P) return false;
  if (P.gift) return P.gift === 'pack' ? hasPack(prof) : !!C.gifts[P.gift];
  return C.pl.includes(id);
}
// a card plate (the beta's): yours, shown on your own card - never by your name over your head
export const cardPlate = (id) => !!(PLATE[id] && PLATE[id].card);
export const hasColor = (prof, id) => (COLOR[id] && COLOR[id].gift ? (COLOR[id].gift === 'pack' ? hasPack(prof) : !!cosmOf(prof).gifts[COLOR[id].gift]) : cosmOf(prof).c.includes(id));   // (a gift's color: the Founder's Pack's)

// what the nameplate shows: { c (name color, hex), t (plate text), g (gold plate), k (a founded crew's tag: crews.js) } or null
export function plateOf(prof) {
  const C = cosmOf(prof), out = {};
  if (C.nc && COLOR[C.nc] && hasColor(prof, C.nc)) out.c = COLOR[C.nc].hex;
  if (C.tp && hasPlate(prof, C.tp) && !cardPlate(C.tp)) { out.t = plateText(C.tp, prof); if ((PLATE[C.tp] && PLATE[C.tp].gold) || boardPlate(C.tp) || isTopPlate(C.tp)) out.g = 1; }   // (gold: a gift's, a season board's, the top of a ladder)
  const k = prof.pid ? tagOf(prof.pid) : null;
  if (k) out.k = k;
  return out.c || out.t || out.k ? out : null;
}
// the player's nameplate brought up to date (the ped's descriptor sent again when it changed)
export function refresh(p) {
  const np = plateOf(p.profile), was = JSON.stringify(p.np || null), now = JSON.stringify(np);
  if (was === now) return false;
  p.np = np;
  if (p.ped) p.ped.appVer = (p.ped.appVer || 0) + 1;
  return true;
}

// ---- the beta gift --------------------------------------------------------------------------------------------------------
// Season 0's gift to an account playing during it: the jacket into the wardrobe, the gold plate (worn unless another is).
// -> true when given now
export function grantBeta(world, p) {
  const prof = p.profile, C = cosmOf(prof);
  if (!SEASON.beta || C.gifts.beta) return false;
  C.gifts.beta = { at: Date.now(), s: COSMETICS.beta.season };
  looks.ensureLook(prof);
  const jk = PIECE_IDS[COSMETICS.beta.jacket];
  if (jk && Array.isArray(prof.wardrobe) && !prof.wardrobe.includes(jk)) prof.wardrobe.push(jk);
  store.touch();
  if (world) world.notify(p, `Thanks for playing the beta! The ${COSMETICS.beta.jacket} is in your wardrobe and the Season ${COSMETICS.beta.season} badge is on your card - both yours for good, through the wipe at launch.`, 'good');
  return true;
}

// ---- the Founder's Pack (shared/rules.js SUPPORT; server/kofi.js) ----------------------------------------------------------
// bought on Ko-fi: the coat into the wardrobe, the supporter name color (worn unless another is), the Supporter badge on
// the card, the special paint at any Fresh Coat garage. Cosmetic only, and yours to keep through any reset: the grant lives
// on the account record (profile.acct.pack { at, tx } - tx: the Ko-fi order, null when the owner gave it), which a progress
// epoch, a season's end and Start fresh all keep (store.js resetProfile, players.js wipeAccount); profile.cosm.gifts.pack
// mirrors it, and a profile that lost the mirror and the coat (Start fresh) gets them back on its next session
// (restoreFounder). A profile (online or not); p: the player when online (name and card brought up to date, told).
export const hasPack = (prof) => !!(prof && ((prof.acct && prof.acct.pack) || (prof.cosm && prof.cosm.gifts && prof.cosm.gifts.pack)));
function packPieces(prof, C, rec) {
  C.gifts.pack ||= rec;
  if (prof.acct) prof.acct.pack ||= rec;
  looks.ensureLook(prof);
  const ck = PIECE_IDS[SUPPORT.coat];
  if (ck && Array.isArray(prof.wardrobe) && !prof.wardrobe.includes(ck)) prof.wardrobe.push(ck);
}
// the pack's things back where a reset took them (the account still has it) -> true when something came back
export function restoreFounder(prof) {
  const rec = prof && prof.acct && prof.acct.pack, C = cosmOf(prof), ck = PIECE_IDS[SUPPORT.coat];
  if (!rec || (C.gifts.pack && Array.isArray(prof.wardrobe) && prof.wardrobe.includes(ck))) return false;
  packPieces(prof, C, rec);
  store.touch();
  return true;
}
// -> true when given now
export function grantFounder(world, prof, p = null, tx = null) {
  const C = cosmOf(prof);
  if (hasPack(prof)) return false;
  packPieces(prof, C, { at: Date.now(), tx: tx || null });
  if (!C.nc) C.nc = SUPPORT.color;
  store.touch();
  if (p) {
    p.supporter = true; refresh(p); p.meDirty = true;
    if (world) world.notify(p, `Thank you for supporting the game! The ${SUPPORT.pack} is yours: the ${SUPPORT.coat} is in your wardrobe, your name shows in ${COLOR[SUPPORT.color].name} (switch it at a style counter or in Settings), the Supporter badge is on your card, and any Fresh Coat garage paints your car ${SUPPORT.paintName.toLowerCase()} for free. Cosmetic only - yours to keep through any reset.`, 'good');
  }
  return true;
}
// taken back (the owner: a refund or a chargeback) - the coat out of the wardrobe and off the look, the color and the paint
// off. -> true when it was theirs
export function revokeFounder(world, prof, p = null) {
  const C = cosmOf(prof);
  if (!hasPack(prof)) return false;
  delete C.gifts.pack;
  if (prof.acct) delete prof.acct.pack;
  const ck = PIECE_IDS[SUPPORT.coat];
  if (Array.isArray(prof.wardrobe)) prof.wardrobe = prof.wardrobe.filter((id) => id !== ck);
  const L = typeof prof.look === 'string' ? decodeLook(prof.look) : null;
  if (L && L.outfit && L.outfit.jacket && L.outfit.jacket.id === ck) { L.outfit.jacket = null; prof.look = encodeLook(L); if (p && p.ped) { p.ped.app = looks.appOf(prof); p.ped.appVer = (p.ped.appVer || 0) + 1; } }
  for (const L2 of prof.looks || []) { const d = decodeLook(L2.c); if (d && d.outfit && d.outfit.jacket && d.outfit.jacket.id === ck) { d.outfit.jacket = null; L2.c = encodeLook(d); } }
  if (C.nc === SUPPORT.color) C.nc = null;
  if (C.tp === SUPPORT.plate) C.tp = null;
  for (const v of prof.vehicles || []) if (SPECIAL_PAINTS[v.tint]) delete v.tint;
  if (world && world.entities) for (const v of world.entities.values()) if (v && v.owner === prof.pid && SPECIAL_PAINTS[v.tint]) { v.tint = v.paint; v.descVer = (v.descVer || 0) + 1; }
  store.touch();
  if (p) { p.supporter = false; refresh(p); p.meDirty = true; }
  return true;
}

// a career's top rank reached: its title for good, with its season - and over your name from that moment (worn: the
// unlock), for everyone to see. Once a season (a top reached again in a later one: that season noted too).
export function noteTops(prof, s = SEASON.n) {
  const C = cosmOf(prof);
  let moved = false;
  for (const c of CAREER_KEYS) if (careers.careerRank(prof, c) >= TOP(c) && !C.tops.some((t) => t.c === c && t.s === s)) { C.tops.push({ c, s }); C.tp = `r:${c}:${TOP(c)}`; moved = true; }
  if (!C.tw && C.tops.length) {   // (a top reached before the title went over names - 2026-11-11: worn once, unless another plate is)
    C.tw = 1; moved = true;
    if (!C.tp) { const t = C.tops.reduce((a, b) => (b.s >= a.s ? b : a)); C.tp = `r:${t.c}:${TOP(t.c)}`; }
  }
  if (moved) store.touch();
  return moved;
}
// this season played: its badge (kept for good - the Skills app shows them)
export function noteSeason(prof, s = SEASON.n) {
  const C = cosmOf(prof);
  if (C.sb.includes(s)) return false;
  C.sb.push(s); C.sb.sort((a, b) => a - b);
  store.touch();
  return true;
}

export function update(world) {
  if (world.tick % 20 !== 9) return;
  const slow = world.tick % 200 === 9;
  for (const p of world.players.values()) {
    if (!p.profile || !p.ped) continue;
    if (!p.cosmOk) { p.cosmOk = 1; const C = cosmOf(p.profile); if (C.tp && cardPlate(C.tp)) { C.tp = null; store.touch(); } grantBeta(world, p); restoreFounder(p.profile); p.supporter = hasPack(p.profile); noteSeason(p.profile); noteTops(p.profile); refresh(p); continue; }
    if (slow) { noteTops(p.profile); refresh(p); }   // (a rank lost: its plate comes off)
    else if (p.npDirty) { p.npDirty = false; noteTops(p.profile); refresh(p); }   // (a crew's tag on or off: crews.js; a rank-up: careers.js)
  }
}

// ---- the style counter (a clothing store's menu row 'cos': economy.js) ----------------------------------------------------
const priceNote = (it, prof) => (it.tok ? `${it.tok} cosmetic token${it.tok === 1 ? '' : 's'} (you have ${tokens(prof)})` : '');
export function menu(world, p, poi) {
  const prof = p.profile, C = cosmOf(prof), opts = [];
  opts.push({ id: 'cosc:none', label: `${C.nc ? 'Plain white name' : 'Plain white name (wearing)'}`, dis: !C.nc });
  for (const c of COSMETICS.colors) {
    const own = hasColor(prof, c.id), on = C.nc === c.id;
    if (c.gift && !own) continue;   // (a gift's - the Founder's Pack's - only for those who have it)
    opts.push({ id: `cosc:${c.id}`, label: `Name color: ${c.name}${on ? ' (wearing)' : ''}`, ...(own ? {} : c.cash ? { price: c.cash } : {}), dis: on || (!own && c.tok && tokens(prof) < c.tok), note: own ? (on ? '' : 'yours - wear it') : priceNote(c, prof), sw: c.hex });
  }
  opts.push({ id: 'cosp:none', label: `${C.tp ? 'No title plate' : 'No title plate (wearing)'}`, dis: !C.tp });
  const plates = [];
  for (const c of CAREER_KEYS) for (let r = COSMETICS.rankPlatesFrom; r <= TOP(c); r++) if (hasPlate(prof, `r:${c}:${r}`)) plates.push({ id: `r:${c}:${r}`, own: 1, note: `${CAREERS[c].name} rank${r === TOP(c) ? ' - the top: yours for good' : ''}` });
  for (const q of C.bp) plates.push({ id: boardPlateId(q.s, q.c), own: 1, note: `Season ${q.s}'s ${CAREERS[q.c].name} board: number ${q.i} - yours for good` });
  for (const q of COSMETICS.plates) { const own = hasPlate(prof, q.id); if ((q.gift && !own) || q.card) continue; plates.push({ id: q.id, own, q }); }
  for (const x of plates) {
    const on = C.tp === x.id, q = x.q;
    opts.push({ id: `cosp:${x.id}`, label: `Title plate: ${plateText(x.id, prof)}${on ? ' (wearing)' : ''}`, ...(x.own || !q || !q.cash ? {} : { price: q.cash }), dis: on || (!x.own && q && q.tok && tokens(prof) < q.tok), note: x.own ? (on ? '' : x.note || 'yours - wear it') : priceNote(q, prof) });
  }
  opts.push({ id: 'cosback', label: 'Back to the store' });
  opts.push({ id: 'close', label: 'Close' });
  const sub = `How you show up: a name color and a title plate by your name, over your head for everyone to see. Yours for good once bought - through a season's wipe too. Cosmetic tokens: ${tokens(prof)} (a weekly goal each).`;
  return { t: 'menu', poi: poi.id, title: 'The style counter', sub, opts, cash: prof.cash, bank: prof.bank };
}
// buy (if it isn't yours) and wear a color ('c') or a plate ('p'); id 'none' takes it off. null, or why not.
export function pick(world, p, kind, id, pay) {
  const prof = p.profile, C = cosmOf(prof);
  if (kind === 'c') {
    if (id === 'none') C.nc = null;
    else {
      const c = COLOR[id];
      if (!c) return 'No such color.';
      if (!hasColor(prof, id) && c.gift) return 'That one comes with the Founder\'s Pack - it can\'t be bought here.';
      if (!hasColor(prof, id)) {
        if (c.tok ? !spendTok(prof, c.tok) : !pay(p, c.cash)) return c.tok ? `It takes ${c.tok} cosmetic token${c.tok === 1 ? '' : 's'} - a weekly goal earns one.` : `You need ${money(c.cash)} (cash + bank).`;
        C.c.push(id);
        world.notify(p, `${c.name} is yours: your name shows in it now.`, 'good');
      }
      C.nc = id;
    }
  } else {
    if (id === 'none') C.tp = null;
    else {
      const q = PLATE[id];
      if (!plateText(id, prof)) return 'No such plate.';
      if (cardPlate(id)) return 'That one\'s for your card, not over your name.';
      if (!hasPlate(prof, id)) {
        if (rankPlate(id)) return 'Reach that rank first.';
        if (!q || q.gift) return 'That one\'s a gift - it can\'t be bought.';
        if (q.tok ? !spendTok(prof, q.tok) : !pay(p, q.cash)) return q.tok ? `It takes ${q.tok} cosmetic token${q.tok === 1 ? '' : 's'} - a weekly goal earns one.` : `You need ${money(q.cash)} (cash + bank).`;
        C.pl.push(id);
        world.notify(p, `The "${q.t}" plate is yours - it's by your name now.`, 'good');
      }
      C.tp = id;
    }
  }
  store.touch();
  refresh(p);
  p.meDirty = true;
  return null;
}

// ---- a car's paint of your choice (a Fresh Coat garage: economy.js 'cpaint') ----------------------------------------------
export function paintMenu(p, poi, v) {
  const prof = p.profile, P = COSMETICS.paint, tok = !!p.paintTok, opts = [];
  opts.push({ id: 'cptok', label: tok ? `Paying with a cosmetic token (you have ${tokens(prof)}) - tap for cash` : `Pay with a cosmetic token instead (you have ${tokens(prof)})`, dis: !tok && tokens(prof) < P.tok });
  if (hasPack(prof)) opts.push({ id: `cpk:${SUPPORT.paint}`, label: `${SUPPORT.paintName} - the ${SUPPORT.pack}'s${v && v.tint === SUPPORT.paint ? ' (now)' : ''}`, note: 'yours - free', dis: !v, sw: SPECIAL_PAINTS[SUPPORT.paint].hex });
  PAINTS.forEach((hex, i) => opts.push({ id: `cpk:${i}`, label: `${PAINT_NAMES[i] || `Color ${i + 1}`}${v && v.paint === i ? ' (now)' : ''}`, ...(tok ? {} : { price: P.cash }), note: tok ? `${P.tok} token` : '', dis: !v || (tok && tokens(prof) < P.tok), sw: hex }));
  opts.push({ id: 'cpback', label: 'Back to the garage' });
  opts.push({ id: 'close', label: 'Close' });
  return { t: 'menu', poi: poi.id, title: 'Custom paint', sub: v ? `Your ${v.def.name}, in the color you pick - ${money(P.cash)}, or ${P.tok} cosmetic token. (A plain respray is the disguise; this is for looks.)` : 'Drive your vehicle onto the lot first.', opts, cash: prof.cash, bank: prof.bank };
}
// paint vehicle v color i (entry: its garage entry, kept in step). null, or why not.
export function paintPick(world, p, v, i, pay, entry = null) {
  const P = COSMETICS.paint;
  if (!v) return 'Bring your vehicle onto the lot first.';
  if (v.def.horse) return "We don't paint horses.";
  if (i === SUPPORT.paint && SPECIAL_PAINTS[i]) {   // (the Founder's Pack's paint: free for its owners, any time)
    if (!hasPack(p.profile)) return `That paint comes with the ${SUPPORT.pack}.`;
    v.tint = i; v.bloody = false; v.descVer = (v.descVer || 0) + 1;
    if (entry) entry.tint = i;
    store.touch();
    world.notify(p, `Your ${v.def.name} is ${SUPPORT.paintName.toLowerCase()} now. Looking sharp.`, 'good');
    return null;
  }
  if (!(i >= 0 && i < PAINTS.length)) return 'No such color.';
  if (p.paintTok ? !spendTok(p.profile, P.tok) : !pay(p, P.cash)) return p.paintTok ? 'No cosmetic token to spend - a weekly goal earns one.' : `You need ${money(P.cash)} (cash + bank).`;
  v.paint = i; v.tint = i; v.bloody = false;
  v.descVer = (v.descVer || 0) + 1;
  if (entry) { entry.paint = i; entry.tint = i; }
  store.touch();
  world.notify(p, `Your ${v.def.name} is ${(PAINT_NAMES[i] || 'freshly painted').toLowerCase()} now. Looking good.`, 'good');
  return null;
}
