// Status and cosmetics (docs/PROGRESSION.md "Money sinks" and "Seasons"; progression build item 6; the numbers:
// shared/rules.js COSMETICS, SEASON). Priced as goals - something to save up for, or the weekly goals' cosmetic tokens
// (goals.js: profile.goals.tok) - and never any combat power:
//   - a name color and a title plate by your name: the nameplate over your head (the ped's descriptor np: server/net.js;
//     drawn by client/main.js drawWorldLabels). Bought and picked at any clothing store's style counter (economy.js
//     'cos': the menu below). Plates: the ones bought, a season's gift's, and each career's rank titles - a rank's while
//     you hold it, the top rank's for good (with its season).
//   - a car's paint in the color you pick, at a Fresh Coat garage (economy.js 'cpaint': paintMenu / paintPick).
//   - the beta gift (SEASON.beta - Season 0, the public beta): every account that plays during it gets the Founding
//     Citizen jacket (shared/lookcore.js: a gift piece - never sold, the varsity jacket's art in black and gold) and the
//     gold Beta plate, on its first session (update).
// Kept outside the progress-epoch reset (server/store.js resetProfile keeps prof.cosm and the wardrobe), so all of it
// survives a season's wipe; the tokens themselves are a season's (profile.goals).
//   - a season's: a badge for each season played (sb - noted on a session's first tick; seasons.js at a season's end)
//     and the gold plate of a career board's top 10 at a season's end (bp - seasons.js endSeason: 'S0 Top 10 Kingpin').
//   profile.cosm: { c: [color ids owned], pl: [plate ids bought], tops: [{ c (career), s (season) }] (the top ranks
//     reached), nc (the color worn, or null), tp (the plate worn, or null), gifts: { beta: { at, s } }, sb: [seasons
//     played], bp: [{ s (season), c (career), i (place), of (the top it was) }] } - absent on old profiles (made the
//     first time; sb, bp on older ones too)
import { COSMETICS, SEASON, CAREERS, CAREER_KEYS } from '../../shared/rules.js';
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
export function plateText(id, prof = null) {
  const R = rankPlate(id);
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
  if (P.gift) return !!C.gifts[P.gift];
  return C.pl.includes(id);
}
export const hasColor = (prof, id) => cosmOf(prof).c.includes(id);

// what the nameplate shows: { c (name color, hex), t (plate text), g (gold plate), k (a founded crew's tag: crews.js) } or null
export function plateOf(prof) {
  const C = cosmOf(prof), out = {};
  if (C.nc && COLOR[C.nc] && hasColor(prof, C.nc)) out.c = COLOR[C.nc].hex;
  if (C.tp && hasPlate(prof, C.tp)) { out.t = plateText(C.tp, prof); if ((PLATE[C.tp] && PLATE[C.tp].gold) || boardPlate(C.tp)) out.g = 1; }
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
  if (!C.tp) C.tp = COSMETICS.beta.plate;
  store.touch();
  if (world) world.notify(p, `Thanks for playing the beta! The ${COSMETICS.beta.jacket} is in your wardrobe and a gold Beta plate is by your name - both yours for good, through the wipe at launch.`, 'good');
  return true;
}

// a career's top rank reached: its title for good, with its season
export function noteTops(prof, s = SEASON.n) {
  const C = cosmOf(prof);
  let moved = false;
  for (const c of CAREER_KEYS) if (careers.careerRank(prof, c) >= TOP(c) && !C.tops.some((t) => t.c === c)) { C.tops.push({ c, s }); moved = true; }
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
    if (!p.cosmOk) { p.cosmOk = 1; grantBeta(world, p); noteSeason(p.profile); noteTops(p.profile); refresh(p); continue; }
    if (slow) { noteTops(p.profile); refresh(p); }   // (a rank lost: its plate comes off)
    else if (p.npDirty) { p.npDirty = false; refresh(p); }   // (a crew's tag on or off: crews.js)
  }
}

// ---- the style counter (a clothing store's menu row 'cos': economy.js) ----------------------------------------------------
const priceNote = (it, prof) => (it.tok ? `${it.tok} cosmetic token${it.tok === 1 ? '' : 's'} (you have ${tokens(prof)})` : '');
export function menu(world, p, poi) {
  const prof = p.profile, C = cosmOf(prof), opts = [];
  opts.push({ id: 'cosc:none', label: `${C.nc ? 'Plain white name' : 'Plain white name (wearing)'}`, dis: !C.nc });
  for (const c of COSMETICS.colors) {
    const own = hasColor(prof, c.id), on = C.nc === c.id;
    opts.push({ id: `cosc:${c.id}`, label: `Name color: ${c.name}${on ? ' (wearing)' : ''}`, ...(own ? {} : c.cash ? { price: c.cash } : {}), dis: on || (!own && c.tok && tokens(prof) < c.tok), note: own ? (on ? '' : 'yours - wear it') : priceNote(c, prof), sw: c.hex });
  }
  opts.push({ id: 'cosp:none', label: `${C.tp ? 'No title plate' : 'No title plate (wearing)'}`, dis: !C.tp });
  const plates = [];
  for (const c of CAREER_KEYS) for (let r = COSMETICS.rankPlatesFrom; r <= TOP(c); r++) if (hasPlate(prof, `r:${c}:${r}`)) plates.push({ id: `r:${c}:${r}`, own: 1, note: `${CAREERS[c].name} rank${r === TOP(c) ? ' - the top: yours for good' : ''}` });
  for (const q of C.bp) plates.push({ id: boardPlateId(q.s, q.c), own: 1, note: `Season ${q.s}'s ${CAREERS[q.c].name} board: number ${q.i} - yours for good` });
  for (const q of COSMETICS.plates) { const own = hasPlate(prof, q.id); if (q.gift && !own) continue; plates.push({ id: q.id, own, q }); }
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
  PAINTS.forEach((hex, i) => opts.push({ id: `cpk:${i}`, label: `${PAINT_NAMES[i] || `Color ${i + 1}`}${v && v.paint === i ? ' (now)' : ''}`, ...(tok ? {} : { price: P.cash }), note: tok ? `${P.tok} token` : '', dis: !v || (tok && tokens(prof) < P.tok), sw: hex }));
  opts.push({ id: 'cpback', label: 'Back to the garage' });
  opts.push({ id: 'close', label: 'Close' });
  return { t: 'menu', poi: poi.id, title: 'Custom paint', sub: v ? `Your ${v.def.name}, in the color you pick - ${money(P.cash)}, or ${P.tok} cosmetic token. (A plain respray is the disguise; this is for looks.)` : 'Drive your vehicle onto the lot first.', opts, cash: prof.cash, bank: prof.bank };
}
// paint vehicle v color i (entry: its garage entry, kept in step). null, or why not.
export function paintPick(world, p, v, i, pay, entry = null) {
  const P = COSMETICS.paint;
  if (!v) return 'Bring your vehicle onto the lot first.';
  if (!(i >= 0 && i < PAINTS.length)) return 'No such color.';
  if (v.def.horse) return "We don't paint horses.";
  if (p.paintTok ? !spendTok(p.profile, P.tok) : !pay(p, P.cash)) return p.paintTok ? 'No cosmetic token to spend - a weekly goal earns one.' : `You need ${money(P.cash)} (cash + bank).`;
  v.paint = i; v.tint = i; v.bloody = false;
  v.descVer = (v.descVer || 0) + 1;
  if (entry) { entry.paint = i; entry.tint = i; }
  store.touch();
  world.notify(p, `Your ${v.def.name} is ${(PAINT_NAMES[i] || 'freshly painted').toLowerCase()} now. Looking good.`, 'good');
  return null;
}
