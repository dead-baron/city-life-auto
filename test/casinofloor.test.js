// Casinos you walk into and the bars' card tables (the owner, 2026-11-14): the floor's layout by its tier
// (shared/casinorooms.js), the regulars' games at its tables only while they're there and what's dealt sent to the pages
// near it (server/systems/casinofloor.js), a player's own game shown at the table he's at, and the page's replay
// (client/casinoview.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../shared/rng.js';
import { casinoRoom, gameTable, CARD_RECT, cardTableOf } from '../shared/casinorooms.js';
import * as cf from '../server/systems/casinofloor.js';
import { handValue } from '../server/systems/casino.js';
import { CASINO_FLOOR } from '../shared/rules-games.js';
import { CasinoView } from '../client/casinoview.js';

const TILE = 32;
function building(tier, south = true, tw = 24, th = 14, at = 100) {
  const x0 = at + 1, x1 = at + tw - 2, y0 = at + 1, y1 = at + th - 2, cr = south ? y0 + 3 : y1 - 3, dc = Math.floor((x0 + x1) / 2);
  const u = { poi: 0, kind: 'delivery', x0, x1, counterRow: cr, door: { tx: dc, ty: south ? at + th - 1 : at, w: 2 }, casino: tier };
  return { b: { tx: at, ty: at, tw, th, walkIn: { south, x0, x1, y0, y1, units: [u] } }, u };
}
const rect = (q) => [q.x0, q.y0, q.x1, q.y1];
const over = (a, b, g = 0) => a[0] < b[2] + g && a[2] > b[0] - g && a[1] < b[3] + g && a[3] > b[1] - g;
const withSeats = (T) => [Math.min(T.x0, ...T.seats.map((s) => s.x - 4)), Math.min(T.y0, ...T.seats.map((s) => s.y - 4), T.dealer ? T.dealer.y - 4 : 1e9), Math.max(T.x1, ...T.seats.map((s) => s.x + 4)), Math.max(T.y1, ...T.seats.map((s) => s.y + 4))];

test('the floors: every game on a grand floor, nothing on top of anything, inside the room; the tiers dressed apart', () => {
  for (const [tier, south, tw, th] of [[3, true, 24, 14], [3, false, 24, 12], [2, true, 16, 16], [2, true, 9, 16], [1, true, 14, 15], [1, false, 14, 15]]) {
    const { b, u } = building(tier, south, tw, th), R = casinoRoom(b, u, TILE);
    const tag = `tier ${tier} ${south ? 'S' : 'N'} ${tw}x${th}`;
    assert.ok(R && R.tier === tier, tag);
    assert.ok(R.slots.length >= (tw >= 14 ? 4 : 2), `${tag}: slots ${R.slots.length}`);
    if (tw >= 14) for (const g of ['rou', 'bj', 'pk']) assert.ok(R.tables.some((T) => T.g === g), `${tag}: a ${g} table`);
    else assert.ok(R.tables.length >= 1, `${tag}: a table`);
    const things = [...R.tables.map(withSeats), ...R.slots.map((M) => [M.x0, M.y0, M.x1, M.seat.y + 4])];
    for (const q of things) assert.ok(q[0] >= R.X0 && q[2] <= R.X1 && q[1] >= R.Y0 && q[3] <= R.Y1, `${tag}: inside the room ${q}`);
    for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) assert.ok(!over(things[i], things[j]), `${tag}: ${i} and ${j} overlap`);
    for (const q of things) assert.ok(!over(q, [R.cage.x0 - 4, R.cage.y0, R.cage.x1, R.cage.y1]), `${tag}: clear of the cage`);
    assert.equal(R.pieces.some((p) => p.t === 'chand'), tier === 3, `${tag}: chandeliers on the grand floors only`);
    assert.equal(R.pieces.some((p) => p.t === 'column'), tier === 3);
  }
  // a bar's card table: the piece holds the table and its seats
  for (const k of ['pk', 'bj']) { const [w, d] = CARD_RECT[k], T = cardTableOf({ k, x0: 0, y0: 0 }), q = withSeats(T); assert.ok(q[0] >= 0 && q[1] >= 0 && q[2] <= w && q[3] <= d, `${k}: ${q} in ${w}x${d}`); }
});

test('hands: poker\'s best of seven, blackjack\'s dealer to 17', () => {
  const c = (r, s) => s * 13 + r;   // (r 0 the ace)
  const royal = cf.score5([c(0, 0), c(12, 0), c(11, 0), c(10, 0), c(9, 0)]), four = cf.score5([c(5, 0), c(5, 1), c(5, 2), c(5, 3), c(2, 0)]);
  const full = cf.score5([c(5, 0), c(5, 1), c(5, 2), c(3, 3), c(3, 0)]), flush = cf.score5([c(1, 2), c(4, 2), c(6, 2), c(8, 2), c(11, 2)]), wheel = cf.score5([c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(4, 0)]);
  const pairA = cf.score5([c(0, 0), c(0, 1), c(4, 2), c(6, 3), c(8, 0)]), pairK = cf.score5([c(12, 0), c(12, 1), c(4, 2), c(6, 3), c(8, 0)]);
  assert.ok(royal > four && four > full && full > flush && flush > wheel && wheel > pairA && pairA > pairK);
  assert.equal(cf.best7([c(0, 0), c(12, 0), c(11, 0), c(10, 0), c(9, 0), c(1, 1), c(2, 2)]), royal);
});

// a fake world: one page subscribed to the floor, the regulars standing where they were put
function floorWorld(F, seed) {
  const ents = new Map(), page = { pid: 'pg', conn: { open: true }, evq: [] };
  const w = { time: 0, tick: 0, map: { buildings: [], pois: [] }, players: new Map([['pg', page]]), get: (id) => ents.get(id) };
  const rng = mulberry32(seed), ms = cf.members(F, rng), g = { k: 'cards', ids: [], floor: F };
  ms.forEach((m, i) => { ents.set(i + 1, { id: i + 1, x: m.x, y: m.y, npc: { act: { x: m.x, y: m.y, cf: m.cf } } }); g.ids.push(i + 1); });
  cf.stateOf(w, F).subs.set('pg', page.conn);
  cf.begin(w, g, rng);
  return { w, g, page, rng, ms, ents };
}
const fl = (R) => ({ key: 'c0', b: 0, poi: 0, casino: true, tier: R.tier, tables: R.tables, slots: R.slots, x0: R.X0, y0: R.Y0, x1: R.X1, y1: R.Y1, cx: (R.X0 + R.X1) / 2, cy: (R.Y0 + R.Y1) / 2 });

test('the regulars: a dealer at every table, the games dealt while they\'re there - the wheel, the hands, the reels - to the page near', () => {
  const { b, u } = building(3), R = casinoRoom(b, u, TILE), F = fl(R), { w, g, page, rng, ms } = floorWorld(F, 7);
  for (const T of F.tables) assert.ok(ms.some((m) => m.cf[0] === T.i && m.cf[1] < 0), `a dealer at table ${T.i}`);
  assert.ok(ms.length <= CASINO_FLOOR.most && ms.some((m) => m.cf[0] < 0), `some at the slots, not too many in all: ${ms.length}`);
  for (let i = 0; i < 20 * 120; i++) { w.time += 0.05; w.tick++; cf.step(w, g, rng); }
  const by = (k) => page.evq.filter((e) => e.e === 'cdl' && e.g === k);
  assert.ok(by('rou').length >= 3 && by('rou').every((e) => e.n >= 0 && e.n <= 36), 'the wheel spun');
  assert.ok(by('slot').length >= 5 && by('slot').every((e) => e.r.length === 3), 'the reels turned');
  for (const e of by('bj')) {
    const hands = e.s.filter(Boolean);
    assert.ok(hands.length >= 1 && hands.every((h) => h.length >= 2));
    if (hands.some((h) => handValue(h) <= 21)) assert.ok(handValue(e.d) >= 17, `the dealer draws to 17: ${e.d}`);
  }
  assert.ok(by('bj').length >= 3, 'blackjack dealt');
  for (const e of by('pk')) {
    const seats = e.s.map((h, k) => (h ? k : -1)).filter((k) => k >= 0), all = [].concat(...seats.map((k) => e.s[k]), e.b);
    assert.equal(new Set(all).size, all.length, 'one deck');
    for (const k of seats) assert.ok(cf.best7(e.s[e.w].concat(e.b)) >= cf.best7(e.s[k].concat(e.b)), 'the best hand wins');
  }
  assert.ok(by('pk').length >= 2, 'poker dealt');
  // nobody at the floor (the group's gone): nothing dealt
  const n = page.evq.length;
  g.ids = [];
  for (let i = 0; i < 20 * 60; i++) { w.time += 0.05; w.tick++; cf.step(w, g, rng); }
  assert.equal(page.evq.length, n, 'no regulars, no games');
});

test('a player\'s game shows at the table he\'s at, and the regulars there wait for him; the page plays the hands out', () => {
  const { b, u } = building(3), R = casinoRoom(b, u, TILE), F = fl(R), { w, g, page, rng } = floorWorld(F, 9);
  const T = F.tables.find((q) => q.g === 'bj'), ped = { id: 77, x: T.seats[2].x, y: T.seats[2].y + 4, a: 0 };
  const p = { ped, menu: { poi: 0, at: { x: T.cx, y: T.cy } } };
  const shown = [];
  cf.stateOf(w, F).subs.set('pg', page.conn);
  cf.showAt(w, p, F, 'bj', { you: [0, 9], d: [5, -1], h: 1 }); shown.push(page.evq[page.evq.length - 1]);
  const ev = shown[0];
  assert.equal(ev.i, T.i); assert.equal(ev.by, 77); assert.deepEqual(ev.s[2], [0, 9]);
  const before = page.evq.filter((e) => e.i === T.i && e.g === 'bj' && !e.by).length;
  for (let i = 0; i < 20 * 10; i++) { w.time += 0.05; w.tick++; cf.step(w, g, rng); }
  assert.equal(page.evq.filter((e) => e.i === T.i && e.g === 'bj' && !e.by).length, before, 'the regulars wait');
  // the page: the first deal's cards, then the same hand again with a card more - the first ones keep their times
  const V = new CasinoView({ map: null });
  V.fl.set('c0', { F, t: F.tables.map(() => null), sl: new Map() });
  V.event(ev);
  const P1 = V.fl.get('c0').t[T.i];
  assert.equal(P1.cards.length, 4);
  cf.showAt(w, p, F, 'bj', { you: [0, 9, 4], d: [5, 12, 3], h: 1 });
  V.event(page.evq[page.evq.length - 1]);
  const P2 = V.fl.get('c0').t[T.i];
  assert.equal(P2.t0, P1.t0); assert.equal(P2.cards.length, 6);
  for (let k = 0; k < 4; k++) assert.equal(P2.cards[k].at, P1.cards[k].at);
  assert.ok(P2.flip !== undefined && P2.flip >= P2.cards[4].at);
});
