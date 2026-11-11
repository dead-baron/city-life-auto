// Heist contracts (docs/PROGRESSION.md, the crime career's 'heists' rank; the numbers: shared/rules.js HEIST_JOB). Built on
// the bank heists (heist.js): your crime contact offers a contract on one bank's vault - a What's next card (the source
// 'heists', the career slot) - with pay on top of what's inside: HEIST_JOB.pay by the bank's district (else base) and
// HEIST_JOB.xp. Accept it and there are HEIST_JOB.limitMin minutes to crack that vault; no thermal drill on you - one's
// fronted, its price (HEIST.drillPrice) off the pay. The vault swings open with you there (heist.js onOpen; within
// CREW.share of it, as the drawers' split): the pay in your pocket - crime money, never clean (careers.js dirty) - and the
// crew bank's cut if a crewmate's with you (crews.js cutFrom). Lapsed or done, the next contract HEIST_JOB.gapMin later.
// Which bank: the city's banks with a vault in turn, by the hour and the player (never one being drilled or cleaned out).
//   profile.heists: { c: { bid, label, x, y, tier, pay, front ($ of a fronted drill), until (ms) } | null, next (ms), n (done) }
//   - absent on old profiles; a season's reset clears it (store.js resetProfile)
import { HEIST_JOB, HEIST, CREW, CAREERS } from '../../shared/rules.js';
import { vaultOf } from '../../shared/heist.js';
import { store } from '../store.js';
import * as heist from './heist.js';
import * as careers from './careers.js';
import * as crews from './crews.js';
import { registerCardSource } from './whatsnext.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
var clock = () => Date.now();   // (a var: the tests set it)
export function setClock(fn) { clock = fn; }
const rec = (prof) => { const H = (prof.heists ||= { c: null, next: 0, n: 0 }); H.n ||= 0; return H; };
export const payFor = (tier) => HEIST_JOB.pay[tier] ?? HEIST_JOB.base;

// the banks with a vault: [{ bid, x, y, label, tier }] - once per map
var BANKS;
export function banks(world) {
  BANKS ??= new WeakMap();
  const m = world.map;
  if (BANKS.has(m)) return BANKS.get(m);
  const out = [];
  for (const b of m.buildings || []) {
    const v = b && !b.gone && vaultOf(b);
    if (!v) continue;
    const poi = m.pois[v.u.poi];
    out.push({ bid: b.id, x: Math.round(v.x), y: Math.round(v.y), label: poi ? poi.label : 'the bank', tier: m.districtAt(v.x, v.y).tier || 'mid' });
  }
  BANKS.set(m, out);
  return out;
}
const hash = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h >>> 0; };
// the bank on offer now (by the hour and the player), or null
export function offerFor(world, p, now = clock()) {
  const L = banks(world).filter((b) => !heist.stateOf(world, b.bid));
  if (!L.length) return null;
  return L[(Math.floor(now / 3600e3) + hash(String(p.pid))) % L.length];
}
function rankName() { const R = CAREERS.crime.ranks; for (let i = 0; i < R.length; i++) if ((R[i].unlock || []).some((u) => u.k === 'heists')) return R[i].name; return 'a high rank'; }
export const eligible = (p) => !!p && !!p.profile && careers.hasUnlock(p, 'heists') && !p.badge;

// accept the one on offer: null, or why not
export function accept(world, p, bid, now = clock()) {
  const H = rec(p.profile);
  if (!eligible(p)) return p.badge ? 'Not with a badge on.' : `Heist contracts come at ${rankName()} (crime).`;
  if (H.c) return 'You\'re on a contract already.';
  if (now < (H.next || 0)) return `No contract yet - ${Math.ceil((H.next - now) / 60000)} min.`;
  const b = banks(world).find((q) => q.bid === bid);
  if (!b || heist.stateOf(world, bid)) return 'That bank\'s off the table now.';
  const inv = (p.profile.inventory ||= {}), front = inv.drill > 0 ? 0 : HEIST.drillPrice;
  if (front) inv.drill = 1;
  H.c = { bid: b.bid, label: b.label, x: b.x, y: b.y, tier: b.tier, pay: payFor(b.tier), front, until: now + HEIST_JOB.limitMin * 60e3 };
  store.touch(); p.meDirty = true; p.nxDirty = true;
  world.notify(p, `Contract on ${b.label}'s vault: crack it within ${HEIST_JOB.limitMin} min for ${money(H.c.pay - front)}${front ? ` (a thermal drill fronted - ${money(front)} off)` : ''}, on top of what's inside.`, 'good');
  return null;
}
// a vault open (heist.js onOpen): every contract holder on that bank who's there is paid
function onOpen(world, V) {
  const now = clock();
  for (const q of world.players.values()) {
    const H = q.profile && q.profile.heists, c = H && H.c;
    if (!c || c.bid !== V.bid || now > c.until) continue;
    const ped = q.ped;
    if (!ped || ped.dead || q.custody || Math.hypot(ped.x - V.x, ped.y - V.y) > CREW.share) continue;
    const pay = Math.max(0, c.pay - (c.front || 0));
    q.profile.cash = (q.profile.cash || 0) + pay;
    careers.dirty(q, pay);
    careers.addXp(world, q, 'crime', HEIST_JOB.xp);
    H.c = null; H.n++; H.next = now + HEIST_JOB.gapMin * 60e3;
    store.touch(); q.meDirty = true; q.nxDirty = true;
    world.notify(q, `Contract done: ${money(pay)} for ${V.label}'s vault, +${HEIST_JOB.xp} ${CAREERS.crime.name.toLowerCase()} XP. Now get the crates out.`, 'good');
    crews.cutFrom(world, q, pay, 'the contract');
  }
}
heist.onOpen(onOpen);
// lapsed: gone, the next one later
export function tick(world, p, now = clock()) {
  const H = p.profile && p.profile.heists;
  if (!H || !H.c || now <= H.c.until) return;
  world.notify(p, `The contract on ${H.c.label} lapsed - the job's off. There'll be another.`, 'warn');
  H.c = null; H.next = now + HEIST_JOB.gapMin * 60e3;
  store.touch(); p.nxDirty = true;
}
export function update(world) {
  if (world.tick % 100 !== 41) return;
  const now = clock();
  for (const p of world.players.values()) if (p.profile && p.profile.heists && p.profile.heists.c) tick(world, p, now);
}

// the card: on offer (Accept), or under way (the waypoint, the minutes left)
function cards(world, p) {
  if (!eligible(p)) return [];
  const H = rec(p.profile), now = clock(), who = careers.contactOf('crime', careers.careerRank(p, 'crime'), p);
  if (H.c) {
    const left = Math.max(0, Math.ceil((H.c.until - now) / 60000));
    return [{ id: `heists:on:${H.c.bid}`, career: 'crime', act: 'heist', who, icon: 'bank', fit: 1.15, title: `Contract: crack ${H.c.label}'s vault`, sub: `${left} min left · ${money(H.c.pay - (H.c.front || 0))} on top`, x: H.c.x, y: H.c.y, pay: H.c.pay, mins: 15, btn: { k: 'way', label: 'Waypoint' } }];
  }
  if (now < (H.next || 0)) return [];
  const b = offerFor(world, p, now);
  if (!b) return [];
  return [{ id: `heists:offer:${b.bid}`, career: 'crime', act: 'heist', who, icon: 'bank', fit: 1.1, title: `${who}: a contract on ${b.label}'s vault`, sub: `${money(payFor(b.tier))} on top of what's inside · ${HEIST_JOB.limitMin} min to do it`, x: b.x, y: b.y, pay: payFor(b.tier), mins: 20, btn: { k: 'accept', label: 'Take the contract' }, accept: (w, q) => accept(w, q, b.bid) }];
}
registerCardSource('heists', cards, { slot: 'career' });
