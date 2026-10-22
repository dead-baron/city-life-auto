// Casinos (the owner, 10-08 / 10-16: "casinos and card games" - server/systems/casino.js): at a casino's door the
// action button opens the floor - the slots, roulette, blackjack - against the house, bets from the money on you,
// winnings in cash; the odds are the real games' (the house's edge, but fair).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, teleport, players } from './helpers.js';
import { CASINO } from '../shared/rules.js';
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

test('a hand left on the table when you go - another casino, logging off: the bet back', () => {
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
  assert.equal(prof.cash, before + bet, 'the bet back');
  assert.ok(!p.casino.bj && p.casino.poi === b.id);
  economy.handleMenu(w, p, b.id, 'cs:bj');
  for (let k = 0; k < 40 && !p.casino.bj; k++) economy.handleMenu(w, p, b.id, 'cs:deal');
  const c0 = prof.cash, bet2 = p.casino.bj.bet;
  casino.leave(p);   // (logging off: players.js finalizeLogout)
  assert.equal(prof.cash, c0 + bet2);
});
