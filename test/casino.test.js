// Casinos (the owner, 10-08 / 10-16: "casinos and card games" - server/systems/casino.js): at a casino's door the
// action button opens the floor - the slots, roulette, blackjack - against the house, bets from the money on you,
// winnings in cash; the odds are the real games' (the house's edge, but fair).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { CASINO } from '../shared/rules-games.js';
import * as casino from '../server/systems/casino.js';
import * as economy from '../server/systems/economy.js';

// a casino's door on open ground beside the player (World v3's are Lucky Mesa's: kind delivery, casino)
function aCasino(w, p) {
  const poi = { id: w.map.pois.length, kind: 'delivery', label: 'The Lucky Test', x: p.ped.x + 20, y: p.ped.y, r: 48, fixed: true, casino: true };
  w.map.pois.push(poi);
  return poi;
}
const lastMenu = (conn) => [...conn.sent].reverse().find((m) => m && m.t === 'menu');

test('the odds: the slots pay back about 95%, roulette loses on the zero, blackjack counts aces either way', () => {
  const r = casino.slotReturn();
  assert.ok(r > 0.9 && r < 0.99, `the slots' payback (${r.toFixed(3)})`);
  assert.equal(casino.slotPays(['LOTUS', 'LOTUS', 'LOTUS']), CASINO.reel.LOTUS.three);
  assert.equal(casino.slotPays(['CHERRY', 'BAR', 'CHERRY']), CASINO.twoCherries);
  assert.equal(casino.slotPays(['CHERRY', 'BAR', 'SEVEN']), 0);
  // every outside bet loses on the zero; over the wheel each returns 36/37 or a little less
  for (const bet of ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'n']) {
    if (bet !== 'n') assert.equal(casino.roulettePays(bet, 0, 17), 0, `${bet}: the zero`);
    let back = 0;
    for (let n = 0; n <= 36; n++) { const x = casino.roulettePays(bet, n, 17); back += x ? x + 1 : 0; }
    assert.ok(Math.abs(back / 37 - 36 / 37) < 1e-9, `${bet}: the house's edge is the zero's (${back}/37)`);
  }
  assert.equal(casino.pocketColour(0), 'green');
  assert.equal(casino.pocketColour(1), 'red');
  assert.equal(casino.pocketColour(2), 'black');
  const card = (rank) => rank - 1;   // (spades: rank 1 the ace .. 13 the king)
  assert.equal(casino.handValue([card(1), card(13)]), 21, 'an ace and a king');
  assert.equal(casino.handValue([card(1), card(1), card(9)]), 21, 'two aces and a nine');
  assert.equal(casino.handValue([card(13), card(12), card(5)]), 25, 'bust');
});

test('the floor: a spin, a bet on the wheel, a hand of blackjack - paid in cash, the visit counted', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w);
  prof.cash = 2000; prof.bank = 0;
  const poi = aCasino(w, p);
  casino.seed(7);
  const act = players.findInteraction(w, p);
  assert.ok(act && /casino floor/.test(act.label), act && act.label);
  act.run();
  let m = lastMenu(conn);
  assert.ok(m && m.opts.some((o) => o.id === 'cs:slot:0') && m.opts.some((o) => o.id === 'cs:roulette') && m.opts.some((o) => o.id === 'cs:bj'), 'the slots and the tables');
  // the slots: a hundred spins, the reels on the board, the money down by the bets and up by the wins
  let spent = 0;
  for (let i = 0; i < 100; i++) { const before = prof.cash; economy.handleMenu(w, p, poi.id, 'cs:slot:0'); spent += CASINO.slots[0]; assert.ok(prof.cash >= before - CASINO.slots[0]); }
  m = lastMenu(conn);
  assert.equal(m.board[0].items.length, 3, 'three reels shown');
  assert.equal(prof.cash - 2000, p.casino.net, 'the visit\'s tally');
  // roulette: red for the stake
  economy.handleMenu(w, p, poi.id, 'cs:roulette');
  m = lastMenu(conn);
  assert.ok(m.opts.some((o) => o.id === 'cs:rb:red' && o.price === CASINO.stakes[0]), 'bets at the stake');
  const c0 = prof.cash;
  economy.handleMenu(w, p, poi.id, 'cs:rb:red');
  m = lastMenu(conn);
  const n = Number(m.board[0].items[0].t);
  assert.equal(prof.cash - c0, casino.pocketColour(n) === 'red' ? CASINO.stakes[0] : -CASINO.stakes[0], `the wheel's ${n}: paid or taken`);
  economy.handleMenu(w, p, poi.id, 'cs:stake');
  assert.ok(lastMenu(conn).opts.some((o) => o.id === 'cs:rb:red' && o.price === CASINO.stakes[1]), 'the stake changed');
  economy.handleMenu(w, p, poi.id, 'cs:floor');
  // blackjack: hands played to the end - standing on 17, hitting below it
  economy.handleMenu(w, p, poi.id, 'cs:bj');
  let hands = 0;
  for (let k = 0; k < 30; k++) {
    const c1 = prof.cash;
    economy.handleMenu(w, p, poi.id, 'cs:deal');
    for (let g = 0; g < 10 && p.casino.bj; g++) economy.handleMenu(w, p, poi.id, casino.handValue(p.casino.bj.you) < 17 ? 'cs:hit' : 'cs:stand');
    assert.ok(!p.casino.bj, 'the hand over');
    const d = prof.cash - c1, bet = CASINO.stakes[1];
    assert.ok([-bet, 0, bet, Math.floor(bet * CASINO.bjPays)].includes(d), `paid as blackjack pays (${d})`);
    m = lastMenu(conn);
    assert.equal(m.board.length, 2, 'the dealer\'s hand and yours');
    assert.ok(!m.board[0].items.some((it) => /back/.test(it.c)), 'the hole card turned over');
    hands++;
  }
  assert.equal(hands, 30);
  assert.equal(prof.cash - 2000, p.casino.net, 'the visit\'s tally still right');
  // short of money: the bets greyed out, and turned away
  prof.cash = 0; prof.bank = 0;
  economy.handleMenu(w, p, poi.id, 'cs:floor');
  m = lastMenu(conn);
  assert.ok(m.opts.find((o) => o.id === 'cs:slot:0').dis, 'no money: no spin');
  // walked away: no bets from across the street
  prof.cash = 500;
  teleport(w, p.ped, poi.x + 400, poi.y);
  economy.handleMenu(w, p, poi.id, 'cs:slot:0');
  assert.equal(prof.cash, 500, 'not from out here');
});

test('a hand left on the table is still there when you come back; double down doubles the bet for one card', () => {
  const w = makeWorld();
  const { p, conn, prof } = joinPlayer(w);
  prof.cash = 5000; prof.bank = 0;
  const poi = aCasino(w, p);
  casino.seed(11);
  economy.openMenu(w, p, poi);
  economy.handleMenu(w, p, poi.id, 'cs:bj');
  let found = false;
  for (let k = 0; k < 40 && !found; k++) {
    economy.handleMenu(w, p, poi.id, 'cs:deal');
    if (!p.casino.bj) continue;   // (a blackjack dealt: settled at once)
    found = true;
    economy.openMenu(w, p, poi);   // (closed the panel, opened it again)
    assert.ok(p.casino.bj && p.casino.view === 'bj', 'the hand waiting');
    const c0 = prof.cash, bet = p.casino.bj.bet;
    economy.handleMenu(w, p, poi.id, 'cs:double');
    assert.ok(!p.casino.bj, 'one card, then the dealer');
    const d = prof.cash - c0;
    assert.ok([-bet, bet, 3 * bet].includes(d), `the doubled bet lost, pushed or won (${d})`);
  }
  assert.ok(found, 'a hand to play');
  assert.ok(lastMenu(conn).board, 'the table shown');
});

test('a hand left on the table when you go - another casino, logging off: played out as it stands, never the bet back', () => {
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.cash = 1000; prof.bank = 0;
  const a = aCasino(w, p);
  casino.seed(3);
  economy.openMenu(w, p, a);
  economy.handleMenu(w, p, a.id, 'cs:bj');
  for (let k = 0; k < 40 && !p.casino.bj; k++) economy.handleMenu(w, p, a.id, 'cs:deal');
  assert.ok(p.casino.bj, 'a hand on the table');
  const before = prof.cash, bet = p.casino.bj.bet;
  const b = aCasino(w, p);
  economy.openMenu(w, p, b);   // (the casino next door)
  assert.ok([0, bet, 2 * bet].includes(prof.cash - before), `the hand stood and settled (${prof.cash - before} back)`);
  assert.ok(p.toasts.some((t) => /played out as you left/.test(t.text)), 'told how it went');
  assert.ok(!p.casino.bj && p.casino.poi === b.id);
  economy.handleMenu(w, p, b.id, 'cs:bj');
  for (let k = 0; k < 40 && !p.casino.bj; k++) economy.handleMenu(w, p, b.id, 'cs:deal');
  const c0 = prof.cash, bet2 = p.casino.bj.bet;
  casino.leave(p);   // (logging off: players.js finalizeLogout)
  assert.ok([0, bet2, 2 * bet2].includes(prof.cash - c0) && !p.casino.bj, 'logging off: settled too');
  // over many hands walked away from, the house keeps its edge (a look at the cards is no free option)
  let staked = 0, back = 0;
  for (let k = 0; k < 400; k++) {
    economy.handleMenu(w, p, b.id, 'cs:bj');
    prof.cash = 1e6;
    economy.handleMenu(w, p, b.id, 'cs:deal');
    if (!p.casino.bj) continue;
    const c1 = prof.cash; staked += p.casino.bj.bet;
    casino.leave(p);
    back += prof.cash - c1;
  }
  assert.ok(back < staked, `walking away: ${back} back of ${staked}`);
});

test('video poker: the hands read right, a deal, holds and the draw; jacks or better pays, a pair of tens does not', () => {
  const H = (a) => casino.pokerHand(a);
  // (cards: rank n % 13 - 0 the ace, 9 the ten, 10..12 the court; suit n / 13)
  assert.equal(H([9, 10, 11, 12, 0]).x, CASINO.poker.royal, 'a royal');
  assert.equal(H([0, 1, 2, 3, 4]).x, CASINO.poker.straightFlush, 'the wheel, suited');
  assert.equal(H([13, 1, 2, 3, 4]).x, CASINO.poker.straight, 'the wheel');
  assert.equal(H([9, 23, 37, 51, 0]).x, CASINO.poker.straight, 'ten to the ace');
  assert.equal(H([0, 13, 26, 39, 5]).x, CASINO.poker.four);
  assert.equal(H([10, 23, 4, 17, 30]).x, CASINO.poker.fullHouse);
  assert.equal(H([1, 3, 5, 7, 11]).x, CASINO.poker.flush);
  assert.equal(H([4, 17, 30, 1, 15]).x, CASINO.poker.three);
  assert.equal(H([4, 17, 2, 15, 7]).x, CASINO.poker.twoPair);
  assert.equal(H([10, 23, 2, 16, 7]).x, CASINO.poker.jacks, 'a pair of jacks');
  assert.equal(H([9, 22, 2, 16, 7]).x, 0, 'a pair of tens: nothing');
  // at the machine: deal, hold two, draw - the cards held stay
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  prof.cash = 1000;
  const poi = aCasino(w, p);
  casino.seed(5);
  casino.open(w, p, poi);
  assert.ok(casino.menu(w, p, poi).opts.some((o) => o.id === 'cs:vp'));
  casino.execute(w, p, poi, 'cs:vp', economy.payFrom);
  assert.equal(casino.execute(w, p, poi, 'cs:vdeal', economy.payFrom), null);
  assert.equal(prof.cash, 1000 - CASINO.stakes[0]);
  const C = p.casino, dealt = [...C.vp.cards];
  casino.execute(w, p, poi, 'cs:hold:0', economy.payFrom); casino.execute(w, p, poi, 'cs:hold:3', economy.payFrom);
  const m = casino.menu(w, p, poi);
  assert.equal(m.opts.filter((o) => o.id.startsWith('cs:hold:')).length, 5);
  assert.ok(m.board[0].items[0].c.includes('held'));
  casino.execute(w, p, poi, 'cs:draw', economy.payFrom);
  assert.equal(C.vp, null);
  const after = C.board[0].items.map((i) => i.t);
  const name = (c) => `${['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c % 13]}${['♠', '♥', '♦', '♣'][Math.floor(c / 13)]}`;
  assert.equal(after[0], name(dealt[0])); assert.equal(after[3], name(dealt[3]));
  // a hand dealt and left (logging off): drawn with its holds and paid, never the bet back
  casino.execute(w, p, poi, 'cs:vdeal', economy.payFrom);
  const c0 = prof.cash;
  casino.leave(p);
  assert.ok([0, ...Object.values(CASINO.poker)].map((x) => x * CASINO.stakes[0]).includes(prof.cash - c0) && !C.vp, `played out (${prof.cash - c0})`);
});

test('video poker keeps the house\'s edge: the paytable is for one (a pair of jacks is your bet back)', () => {
  // a sound simple strategy over many hands: hold what pays, else four to a flush, else the jacks-or-better cards
  casino.seed(11);
  const w = makeWorld();
  const { p, prof } = joinPlayer(w);
  const poi = aCasino(w, p);
  casino.open(w, p, poi);
  casino.execute(w, p, poi, 'cs:vp', economy.payFrom);
  const holdFor = (cards) => {
    const h = casino.pokerHand(cards), ranks = cards.map((c) => c % 13), suits = cards.map((c) => Math.floor(c / 13));
    const n = (r) => ranks.filter((x) => x === r).length;
    if (h.x >= CASINO.poker.straight && h.x !== CASINO.poker.three) return [0, 1, 2, 3, 4];
    if (ranks.some((r) => n(r) >= 2)) return [0, 1, 2, 3, 4].filter((i) => n(ranks[i]) >= 2);
    for (let su = 0; su < 4; su++) { const f = [0, 1, 2, 3, 4].filter((i) => suits[i] === su); if (f.length === 4) return f; }
    return [0, 1, 2, 3, 4].filter((i) => ranks[i] === 0 || ranks[i] >= 10).slice(0, 2);
  };
  let staked = 0, back = 0, paid = 0;
  for (let k = 0; k < 4000; k++) {
    prof.cash = 1e6;
    casino.execute(w, p, poi, 'cs:vdeal', economy.payFrom);
    const C = p.casino, c0 = prof.cash;
    for (const i of holdFor(C.vp.cards)) casino.execute(w, p, poi, `cs:hold:${i}`, economy.payFrom);
    staked += C.vp.bet;
    casino.execute(w, p, poi, 'cs:draw', economy.payFrom);
    back += prof.cash - c0; if (prof.cash > c0) paid++;
  }
  const rtp = back / staked;
  assert.ok(rtp > 0.8 && rtp < 1, `about ${(rtp * 100).toFixed(1)} cents back in the dollar`);
  assert.ok(paid / 4000 > 0.3 && paid / 4000 < 0.5, `a hand pays now and then (${paid})`);
});
