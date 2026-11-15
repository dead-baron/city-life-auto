// The games on the casinos' floors and at the bars' card tables, for everyone near (the owner, 2026-11-14: casinos you
// walk into - "NPC patrons seated and playing, the roulette wheel visibly spinning and the ball landing, cards dealt at
// blackjack and poker, slot reels turning"; card tables in the saloons and bars, watchable and playable). The model is
// the pool tables' (pooltables.js, poolnpc.js): a floor's games run only while its regulars are there - someone near
// (activities.js fills and empties the group 'cards'); what's dealt goes to the pages near it and nowhere else, in small
// messages, and the page plays it out (client/casinoview.js); a player's own game (casino.js: the slots, roulette,
// blackjack, video poker) shows on the floor the same way, at the table they're at.
//   { e: 'cfl', k, d: [the last deal at each table, or 0], sl: [[machine, reels]...] }   a floor, to a page coming near
//   { e: 'cdl', k, i (table; a slot: its machine), g, ...the deal, by }                    a deal, as it happens
//     g 'rou' { n }: the wheel spun, the ball lands in n; 'bj' { s: [cards per seat | 0], d: [the dealer's; -1 face down],
//     h }; 'pk' { s: [two cards per seat | 0], b: [the board], w: the winning seat }; 'vp' { s: seat, c: [five] };
//     'slot' { r: [three reels: CASINO.reel's order], x: 1 a win }; by: the player's ped id (0 the regulars)
// Cards: 0..51 (rank n % 13, 0 the ace; suit n / 13), as casino.js.
import { TILE } from '../../shared/constants.js';
import { CASINO, CASINO_FLOOR as CF } from '../../shared/rules-games.js';
import { floorsOf, floorByKey } from '../../shared/cardfloors.js';
import { handValue } from './casino.js';
import { follow, tell } from './pooltables.js';

export const REELS = Object.keys(CASINO.reel);
const span = (r, [a, b]) => a + r() * (b - a);
const shuffled = (r) => { const d = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
const REEL_W = REELS.reduce((s, k) => s + CASINO.reel[k].w, 0);
const reel = (r) => { let x = r() * REEL_W; for (let i = 0; i < REELS.length; i++) { x -= CASINO.reel[REELS[i]].w; if (x < 0) return i; } return REELS.length - 1; };
export const floors = (map) => floorsOf(map, TILE);

// ---- each floor's state, and who's watching ---------------------------------------------------------------------------
export function stateOf(world, F, make = true) {
  const S = (world.cardFloors ||= new Map());
  let s = S.get(F.key);
  if (!s && make) S.set(F.key, (s = { F, subs: new Map(), last: F.tables.map(() => 0), sl: new Map(), t: F.tables.map(() => ({ next: 0, hold: 0 })), sn: new Map() }));
  return s;
}
const flMsg = (s) => ({ e: 'cfl', k: s.F.key, d: s.last, sl: [...s.sl] });
function deal(world, F, i, m) {
  const s = stateOf(world, F), ev = { e: 'cdl', k: F.key, i, ...m, by: m.by | 0 };
  if (m.g === 'slot') s.sl.set(i, m.r); else s.last[i] = ev;
  tell(world, s, ev);
  (world.cardDeals ||= { n: 0 }).n++;   // (tests, the profile)
}
export function update(world) {
  if (world.tick % 10 !== 6) return;
  const L = floors(world.map);
  if (L.length) follow(world, L, (w, F, make) => stateOf(w, F, make), flMsg);
}

// ---- the regulars (activities.js 'cards'): a dealer at each casino table and a blackjack table, players in some seats,
// some at the slots ---------------------------------------------------------------------------------------------------
export function members(F, rng) {
  const out = [], pick = (n, L) => L.map((q, k) => [rng(), k]).sort((a, b) => a[0] - b[0]).slice(0, n).map((q) => q[1]);
  F.tables.forEach((T, i) => {
    if (T.dealer && (F.casino || T.g === 'bj')) out.push({ x: T.dealer.x, y: T.dealer.y, a: T.dealer.a, arche: 'executive', cf: [i, -1] });
    const n = T.g === 'pk' ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
    for (const k of pick(n, T.seats)) { const q = T.seats[k]; out.push({ x: q.x, y: q.y, a: q.a, arche: rng() < 0.2 ? 'senior' : rng() < 0.35 ? 'executive' : 'casual', gt: 'sit', cf: [i, k] }); }
  });
  for (const j of pick(Math.min(4, Math.ceil(F.slots.length * 0.35)), F.slots)) { const q = F.slots[j].seat; out.push({ x: q.x, y: q.y, a: q.a, arche: rng() < 0.4 ? 'senior' : 'casual', gt: 'sit', cf: [-1, j] }); }
  const rank = (m) => (m.cf[0] >= 0 && m.cf[1] < 0 ? 0 : m.cf[0] < 0 ? 1 : 2);   // (the dealers first, then a few at the slots)
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, CF.most);
}
export function begin(world, g, rng) {
  const s = stateOf(world, g.floor);
  s.t.forEach((t) => { t.next = world.time + 1 + rng() * 6; });
  s.sn.clear();
}
// who's in their place at the floor now: [table] -> { dealer, seats: [k...] }; slots: [machine...]
function seated(world, g) {
  const at = g.floor.tables.map(() => ({ dealer: false, seats: [] })), slots = [];
  for (const id of g.ids) {
    const e = world.get(id), a = e && !e.removed && !e.dead && e.npc && e.npc.act;
    if (!a || !a.cf || Math.hypot(e.x - a.x, e.y - a.y) > 6) continue;
    const [i, k] = a.cf;
    if (i < 0) slots.push(k); else if (k < 0) at[i].dealer = true; else at[i].seats.push(k);
  }
  return { at, slots };
}
// a hand at each table when its time comes, the slots now and then - only while the regulars are there (activities.js)
export function step(world, g, rng) {
  const F = g.floor, s = stateOf(world, F), now = world.time;
  if (!s.t.some((t) => now >= t.next) && !(world.tick % 5 === 0)) return;
  const who = seated(world, g);
  F.tables.forEach((T, i) => {
    const t = s.t[i];
    if (now < t.next) return;
    if (now < t.hold) { t.next = t.hold; return; }   // (a player's game on it: theirs for now)
    const W = who.at[i], need = F.casino || T.g === 'bj' ? W.dealer : true;
    t.next = now + span(rng, T.g === 'rou' ? CF.rouS : T.g === 'bj' ? CF.bjS : CF.pkS);
    if (!need || (T.g === 'pk' ? W.seats.length < 2 : T.g === 'bj' && !W.seats.length)) return;
    if (T.g === 'rou') deal(world, F, i, { g: 'rou', n: Math.floor(rng() * 37) });
    else if (T.g === 'bj') deal(world, F, i, bjRound(T, W.seats, rng));
    else deal(world, F, i, pkRound(T, W.seats, rng));
  });
  for (const j of who.slots) {
    const at = s.sn.get(j) || 0;
    if (!at) { s.sn.set(j, now + rng() * CF.slotS[1]); continue; }
    if (now < at) continue;
    s.sn.set(j, now + span(rng, CF.slotS));
    const r = [reel(rng), reel(rng), reel(rng)];
    deal(world, F, j, { g: 'slot', r, x: r[0] === r[1] && r[1] === r[2] ? 1 : 0 });
  }
}
// a blackjack hand round the table: two each and the dealer's two (one face down), each player hits to his number, the
// dealer draws to 17
function bjRound(T, seats, rng) {
  const D = shuffled(rng), s = T.seats.map(() => 0), dealer = [D.pop(), D.pop()], r0 = dealer[0] % 13, up = r0 === 0 ? 11 : Math.min(10, r0 + 1);
  for (const k of seats) {
    const h = [D.pop(), D.pop()];
    for (;;) { const v = handValue(h); if (v >= 17 || (v >= 12 && up < 7 && up > 1)) break; h.push(D.pop()); }
    s[k] = h;
  }
  if (seats.some((k) => handValue(s[k]) <= 21)) while (handValue(dealer) < 17) dealer.push(D.pop());
  return { g: 'bj', s, d: dealer, h: Math.floor(rng() * 1e6) };
}
// a hand of hold'em: two each, the board of five, the best hand of seven wins
function pkRound(T, seats, rng) {
  const D = shuffled(rng), s = T.seats.map(() => 0);
  for (const k of seats) s[k] = [D.pop(), D.pop()];
  const b = [D.pop(), D.pop(), D.pop(), D.pop(), D.pop()];
  let w = seats[0], best = -1;
  for (const k of seats) { const v = best7(s[k].concat(b)); if (v > best) { best = v; w = k; } }
  return { g: 'pk', s, b, w };
}
// a five-card hand's worth (higher better): its kind, then its cards in the order they count
export function score5(c) {
  const v = c.map((n) => (n % 13 === 0 ? 14 : n % 13 + 1)).sort((a, b) => b - a), cnt = new Map();
  for (const x of v) cnt.set(x, (cnt.get(x) || 0) + 1);
  const flush = c.every((n) => Math.floor(n / 13) === Math.floor(c[0] / 13)), u = [...new Set(v)];
  let top = u.length === 5 && v[0] - v[4] === 4 ? v[0] : u.length === 5 && v[0] === 14 && v[1] === 5 ? 5 : 0;   // (a straight: its top card; the wheel A-5)
  const ord = [...cnt].sort((a, b) => b[1] - a[1] || b[0] - a[0]), g = ord.map((q) => q[1]);
  const kind = top && flush ? 8 : g[0] === 4 ? 7 : g[0] === 3 && g[1] === 2 ? 6 : flush ? 5 : top ? 4 : g[0] === 3 ? 3 : g[0] === 2 && g[1] === 2 ? 2 : g[0] === 2 ? 1 : 0;
  const ks = top ? [top] : ord.map((q) => q[0]);
  let sc = kind;
  for (let i = 0; i < 5; i++) sc = sc * 15 + (ks[i] || 0);
  return sc;
}
export function best7(c) {
  let best = -1;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) { const h = c.filter((_, i) => i !== a && i !== b), v = score5(h); if (v > best) best = v; }
  return best;
}

// ---- a player's own game at a table (casino.js: the menu's games, shown on the floor) ---------------------------------
const nearOf = (L, x, y, f) => { let best = null, bd = 1e9; L.forEach((q, i) => { const d = Math.hypot(f(q).x - x, f(q).y - y); if (d < bd) { bd = d; best = i; } }); return best; };
export function floorOf(world, poi) { return poi ? floors(world.map).find((F) => F.poi === poi.id) || null : null; }
// g 'rou' | 'bj' | 'vp' | 'slot'; m the deal (as the messages above, without its table)
export function show(world, p, poi, g, m) {
  const F = floorOf(world, poi);
  if (F) showAt(world, p, F, g, m);
}
export function showAt(world, p, F, g, m) {
  const ped = p && p.ped;
  if (!ped) return;
  const at = p.menu && p.menu.at && p.menu.poi === F.poi ? p.menu.at : ped;
  if (g === 'slot') {
    if (!F.slots.length) return;
    const j = nearOf(F.slots, at.x, at.y, (q) => q.seat);
    deal(world, F, j, { g, ...m, by: ped.id });
    return;
  }
  const kind = g === 'vp' ? 'pk' : g, L = F.tables.map((T) => (T.g === kind ? T : null)), T = L[nearOf(L, at.x, at.y, (q) => (q ? { x: q.cx, y: q.cy } : { x: 1e9, y: 1e9 }))];
  if (!T) return;
  const t = stateOf(world, F).t[T.i], k = nearOf(T.seats, ped.x, ped.y, (q) => q);
  t.hold = world.time + CF.holdS;
  if (g === 'bj') { const s = T.seats.map(() => 0); s[k] = m.you; deal(world, F, T.i, { g, s, d: m.d, h: m.h, by: ped.id }); }
  else if (g === 'vp') deal(world, F, T.i, { g, s: k, c: m.c, by: ped.id });
  else deal(world, F, T.i, { g, ...m, by: ped.id });
  ped.a = Math.atan2(T.cy - ped.y, T.cx - ped.x);   // (turned to the table)
}
// [[action]] at a table or a machine: its game, on the casino's menu (economy.js openMenu: at the table, that game's view)
const VIEW = { rou: 'roulette', bj: 'bj', pk: 'vp' };
const LABEL = { rou: 'Play roulette', bj: 'Play blackjack', pk: 'Play a hand of poker', slot: 'Play the slots' };
export function interaction(world, p, openMenu) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId) return null;
  const rim = (q) => Math.hypot(Math.max(q.x0 - ped.x, 0, ped.x - q.x1), Math.max(q.y0 - ped.y, 0, ped.y - q.y1));
  for (const F of floors(world.map)) {
    if (ped.x < F.x0 - 40 || ped.x > F.x1 + 40 || ped.y < F.y0 - 40 || ped.y > F.y1 + 40) continue;
    const poi = world.map.pois[F.poi];
    if (!poi) continue;
    let best = null, bd = CF.reach;
    for (const T of F.tables) { const d = rim(T); if (d < bd) { bd = d; best = { g: T.g, x: T.cx, y: T.cy }; } }
    for (const M of F.slots) { const d = rim(M); if (d < bd) { bd = d; best = { g: 'slot', x: M.sx, y: M.sy }; } }
    if (!best || (best.g === 'slot' && !F.casino)) continue;
    const view = best.g === 'slot' ? 'slots' : VIEW[best.g];
    return { label: LABEL[best.g], run: () => openMenu(world, p, poi, { at: { x: best.x, y: best.y }, cards: view, table: !F.casino }) };
  }
  return null;
}
export const byKey = (map, key) => floorByKey(map, key, TILE);
