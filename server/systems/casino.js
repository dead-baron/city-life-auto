// Casinos (the owner, 10-08: "casinos and card games" (#309), and again 10-16; Lucky Mesa's casinos stood marked for
// "the gambling to come"). At a casino's door - the old casinos along Old Downtown's covered street, the Strip's resorts -
// the action button opens the floor: the slots, roulette and blackjack, played against the house. Bets come out of the
// money on you (then your card, as at any counter: economy.js pay); winnings are paid in cash - walk out with them, and
// mind who saw you win. The house's edge is the real games': roulette's single zero, blackjack paying 3:2 with the
// dealer standing on all 17s (no splits at these tables), slots paying back about 95% (the paytable: shared/rules-games.js
// CASINO). Luck runs hot and cold; the house wins in the end.
//   p.casino: { poi, view: null (the floor) | 'roulette' | 'bj', stake (index into CASINO.stakes), num (roulette's
//               straight-up pick), board (the table as it stands: rows for the page), msg, net (this visit, $),
//               bj: { bet, you: [cards], dealer: [cards], doubled } while a hand's being played }
// The page draws `board` (hud.js openMenu: cards, reels, the wheel's pocket) above the options.
import { CASINO, RACEBOOK } from '../../shared/rules-games.js';
import * as racebook from './racebook.js';
import { mulberry32 } from '../../shared/rng.js';
import { randomInt } from 'node:crypto';
import { store } from '../store.js';

// the house's luck: the system's own randomness (not a seeded stream a player could work out); a seeded one in tests
let rng = () => randomInt(0x100000000) / 0x100000000;
export function seed(n) { rng = mulberry32(n >>> 0); }   // (tests: a known run of luck)

export const isCasino = (poi) => !!(poi && poi.casino);
export const label = (poi) => `${poi.label} - the casino floor`;

const state = (world, p, poi) => {
  if (!p.casino || p.casino.poi !== poi.id) { leave(p, world); p.casino = { poi: poi.id, view: null, stake: 0, rstake: 0, num: 17, board: null, msg: '', net: 0, bj: null, vp: null, at: 0 }; }
  return p.casino;
};
// a hand still on the table when you go (another casino's floor, logging off, the server restarting) is played out as
// it stands - blackjack: you stand; video poker: drawn with the cards you held - and paid in cash. (Never the bet back:
// a hand you'd looked at and didn't like would cost nothing to walk away from.)
export function leave(p, world = null) {
  const C = p.casino, prof = p.profile;
  if (!C || !prof) return;
  const paid = (n, say) => {
    if (n) { prof.cash += n; C.net += n; }
    p.meDirty = true; store.touch();
    if (world) world.notify(p, say, n ? 'good' : 'info');
  };
  if (C.bj) { const B = C.bj; C.bj = null; const r = bjOutcome(B); paid(r.back, `Your blackjack hand was played out as you left: ${r.why}${r.back ? ` ${money(r.back)} back, in cash.` : ''}`); }
  if (C.vp) { const V = C.vp; C.vp = null; const r = vpOutcome(V); paid(r.back, `Your video poker hand was drawn as you left: ${r.h.name || 'nothing'}${r.back ? ` - ${money(r.back)}, in cash.` : '.'}`); }
}
// up to the door (economy.js openMenu): the floor, or the hand you left on the table; a new visit after a while away
export function open(world, p, poi) {
  const C = state(world, p, poi);
  if (!C.bj && !C.vp) { C.view = null; C.board = null; C.msg = ''; if (world.time - C.at > 600) C.net = 0; }
  C.at = world.time;
}
const money = (n) => `$${Math.abs(n).toLocaleString()}`;
const tonight = (C) => (C.net > 0 ? `Up ${money(C.net)} this visit.` : C.net < 0 ? `Down ${money(C.net)} this visit.` : '');

// ---- the cards ------------------------------------------------------------------------------------------------------
// a card: 0..51 (rank n % 13: 0 the ace, 1..9 two to ten, 10..12 the court; suit n / 13); dealt from a shoe shuffled
// continuously (each card drawn fresh)
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'], SUITS = ['♠', '♥', '♦', '♣'];
const draw = () => Math.floor(rng() * 52);
export function handValue(cards) {
  let v = 0, aces = 0;
  for (const c of cards) { const r = c % 13; if (r === 0) { aces++; v += 11; } else v += Math.min(10, r + 1); }
  while (v > 21 && aces) { v -= 10; aces--; }
  return v;
}
const natural = (cards) => cards.length === 2 && handValue(cards) === 21;
const cardItem = (c) => { const s = Math.floor(c / 13); return { t: `${RANKS[c % 13]}${SUITS[s]}`, c: s === 1 || s === 2 ? 'card red' : 'card' }; };
function bjBoard(B, hide) {
  const dealer = B.dealer.map(cardItem);
  if (hide) dealer[1] = { t: '?', c: 'card back' };
  return [
    { k: 'Dealer', items: dealer, v: hide ? '' : String(handValue(B.dealer)) },
    { k: 'You', items: B.you.map(cardItem), v: String(handValue(B.you)) },
  ];
}

// ---- the floor's menu (economy.js buildMenu) ------------------------------------------------------------------------
export function menu(world, p, poi) {
  const C = state(world, p, poi), prof = p.profile, stake = CASINO.stakes[C.stake], opts = [];
  const can = (n) => prof.cash + prof.bank >= n;
  let title = poi.label, sub = C.msg || 'The floor hums: bells, chips, the croupiers\' calls. Winnings paid in cash.';
  if (C.view === 'bj') {
    title = `${poi.label} - blackjack`;
    if (C.bj) {
      const B = C.bj;
      opts.push({ id: 'cs:hit', label: 'Hit', note: 'another card' });
      opts.push({ id: 'cs:stand', label: 'Stand', note: 'the dealer plays' });
      if (B.you.length === 2 && !B.doubled) opts.push({ id: 'cs:double', label: 'Double down', price: B.bet, dis: !can(B.bet), note: 'double the bet, one card' });
    } else {
      opts.push({ id: 'cs:deal', label: 'Deal', price: stake, dis: !can(stake), note: 'blackjack pays 3:2' });
      opts.push({ id: 'cs:stake', label: `Stake ${money(stake)}`, note: 'change it' });
      opts.push({ id: 'cs:floor', label: 'Back to the floor' });
    }
  } else if (C.view === 'race') {   // the race book (racebook.js): the race on the screens, its field and odds, your bets on it
    const R = racebook.current(world), t = racebook.clock(world), ph = racebook.phase(R, t), rs = RACEBOOK.stakes[C.rstake | 0];
    const mine = R.bets.filter((b) => b.pid === p.pid), clockText = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    title = `${poi.label} - the race book, race ${R.n % 1000}`;
    sub = ph === 'betting' ? `Betting open: they're off in ${clockText(racebook.offAt(R.n) - t)}. Win bets at the odds posted.`
      : ph === 'running' ? 'They\'re running! Watch it on the screen.'
        : `Result: ${R.res.order.slice(0, 3).map((i, k) => `${['1st', '2nd', '3rd'][k]} ${R.field[i].name}`).join(', ')}. The next race is posted in ${clockText(racebook.postAt(R.n + 1) - t)}.`;
    C.board = R.field.map((h, i) => { const my = mine.filter((b) => b.h === i).reduce((s, b) => s + b.stake, 0); return { k: `${i + 1}. ${h.name}`, cls: 'wide', items: [{ t: R.odds.length ? racebook.oddsText(R.odds[i]) : '', c: 'odds' }], v: my ? `your $${my.toLocaleString()}` : '' }; });
    if (ph === 'betting') R.field.forEach((h, i) => opts.push({ id: `cs:rbet:${R.n}:${i}`, label: `Back ${i + 1}. ${h.name} at ${racebook.oddsText(R.odds[i])}`, price: rs, dis: !can(rs) || mine.length >= RACEBOOK.maxBets, note: mine.length >= RACEBOOK.maxBets ? `${RACEBOOK.maxBets} bets a race` : `returns ${money(racebook.payoutOf(rs, R.odds[i]))}` }));
    if (ph === 'betting') opts.push({ id: 'cs:rstake', label: `Stake ${money(rs)}`, note: 'change it' });
    opts.push({ id: 'cs:watch', label: 'Watch the race', note: 'on the screen' });
    opts.push({ id: 'cs:floor', label: 'Back to the floor' });
  } else if (C.view === 'vp') {   // video poker: Jacks or Better - five cards, hold the ones you like, draw once
    title = `${poi.label} - video poker`;
    if (C.vp) {
      C.vp.cards.forEach((c, i) => opts.push({ id: `cs:hold:${i}`, label: `${C.vp.held[i] ? 'Let go of' : 'Hold'} the ${cardName(c)}`, note: C.vp.held[i] ? 'held' : '' }));
      opts.push({ id: 'cs:draw', label: 'Draw', note: `new cards for the ${5 - C.vp.held.filter(Boolean).length} not held` });
    } else {
      opts.push({ id: 'cs:vdeal', label: 'Deal', price: stake, dis: !can(stake), note: 'jacks or better pays' });
      opts.push({ id: 'cs:stake', label: `Stake ${money(stake)}`, note: 'change it' });
      opts.push({ id: 'cs:floor', label: 'Back to the floor' });
    }
  } else if (C.view === 'roulette') {
    title = `${poi.label} - roulette`;
    for (const [k, l, n] of [['red', 'Red', 'pays 1:1'], ['black', 'Black', 'pays 1:1'], ['odd', 'Odd', 'pays 1:1'], ['even', 'Even', 'pays 1:1'], ['low', 'Low (1-18)', 'pays 1:1'], ['high', 'High (19-36)', 'pays 1:1'], ['d1', 'First dozen (1-12)', 'pays 2:1'], ['d2', 'Second dozen (13-24)', 'pays 2:1'], ['d3', 'Third dozen (25-36)', 'pays 2:1']]) opts.push({ id: `cs:rb:${k}`, label: l, price: stake, dis: !can(stake), note: n });
    opts.push({ id: 'cs:rb:n', label: `Straight up on ${C.num}`, price: stake, dis: !can(stake), note: 'pays 35:1' });
    opts.push({ id: 'cs:num', label: 'Pick another number' });
    opts.push({ id: 'cs:stake', label: `Stake ${money(stake)}`, note: 'change it' });
    opts.push({ id: 'cs:floor', label: 'Back to the floor' });
  } else {
    CASINO.slots.forEach((n, i) => opts.push({ id: `cs:slot:${i}`, label: `Slots - a ${money(n)} spin`, price: n, dis: !can(n), note: i === CASINO.slots.length - 1 ? 'three lotuses pay 300x' : '' }));
    opts.push({ id: 'cs:roulette', label: 'Roulette', note: 'red or black, a dozen, your number' });
    opts.push({ id: 'cs:bj', label: 'Blackjack', note: 'beat the dealer to 21' });
    opts.push({ id: 'cs:vp', label: 'Video poker', note: 'jacks or better: hold, draw, the paytable' });
    opts.push({ id: 'cs:race', label: 'The race book', note: 'a race every few minutes - pick the winner' });
  }
  opts.push({ id: 'close', label: C.net > 0 ? 'Cash out and leave' : 'Leave' });
  const t = tonight(C);
  return { t: 'menu', poi: poi.id, title, sub: t ? `${sub} ${t}` : sub, opts, cash: prof.cash, bank: prof.bank, board: C.board || undefined };
}

// ---- playing (economy.js execute: `cs:...` options; pay is its pay()) -------------------------------------------------
export function execute(world, p, poi, opt, pay) {
  const C = state(world, p, poi), parts = opt.split(':'), stake = CASINO.stakes[C.stake], prof = p.profile;
  C.at = world.time;
  const win = (n) => { prof.cash += n; p.meDirty = true; store.touch(); };
  switch (parts[1]) {
    case 'floor': C.view = null; C.board = null; C.msg = ''; return null;
    case 'roulette': C.view = 'roulette'; C.board = null; C.msg = 'Place your bet. No more bets once the ball\'s dropping.'; return null;
    case 'bj': C.view = 'bj'; C.board = null; C.msg = 'The dealer stands on all 17s. Blackjack pays 3:2.'; return null;
    case 'race': C.view = 'race'; C.board = null; C.msg = ''; return null;
    case 'vp': C.view = 'vp'; C.board = null; C.msg = `Jacks or better. Pays: a royal ${CASINO.poker.royal}x, a straight flush ${CASINO.poker.straightFlush}x, four of a kind ${CASINO.poker.four}x, a full house ${CASINO.poker.fullHouse}x, a flush ${CASINO.poker.flush}x, a straight ${CASINO.poker.straight}x, three of a kind ${CASINO.poker.three}x, two pair ${CASINO.poker.twoPair}x, jacks or better ${CASINO.poker.jacks}x.`; return null;
    case 'vdeal': {
      if (C.vp) return null;
      if (!pay(p, stake)) return 'Not enough money.';
      C.net -= stake;
      const deck = shuffled();
      C.vp = { bet: stake, deck, cards: deck.splice(0, 5), held: [false, false, false, false, false] };
      C.board = vpBoard(C.vp); C.msg = `${pokerHand(C.vp.cards).name || 'Nothing yet'}. Hold the cards you want, then draw.`;
      return null;
    }
    case 'hold': {
      const V = C.vp, i = Number(parts[2]) | 0;
      if (!V || i < 0 || i > 4) return null;
      V.held[i] = !V.held[i]; C.board = vpBoard(V);
      return null;
    }
    case 'draw': {
      const V = C.vp;
      if (!V) return null;
      C.vp = null;
      const { h, back } = vpOutcome(V);
      V.held = [false, false, false, false, false];
      C.board = vpBoard(V);
      if (back) { win(back); C.net += back; }
      C.msg = back ? `${h.name}! You win ${money(back)}.` : 'Nothing. Deal again?';
      world.emit(poi.x, poi.y, { e: 'casino', k: h.x >= CASINO.poker.four ? 'jackpot' : back ? 'win' : 'spin', x: Math.round(poi.x), y: Math.round(poi.y) });
      if (h.x >= CASINO.poker.straightFlush) world.notify(p, `${h.name} at ${poi.label}: ${money(back)} - in cash, on you.`, 'good');
      return null;
    }
    case 'rstake': C.rstake = ((C.rstake | 0) + 1) % RACEBOOK.stakes.length; return null;
    case 'rbet': {
      const R = racebook.current(world), h = Number(parts[3]) | 0, st = RACEBOOK.stakes[C.rstake | 0];
      if (Number(parts[2]) !== R.n) return 'That race has gone - here\'s the card for the next one.';   // (a menu left open over the off)
      const err = racebook.bet(world, p, h, st, pay);
      if (err) return err;
      C.net -= st;
      world.notify(p, `$${st.toLocaleString()} on ${R.field[h].name} to win at ${racebook.oddsText(R.odds[h])}. Watch it on the screen.`, 'info');
      return null;
    }
    case 'watch': if (p.conn) p.conn.sendJSON({ ...racebook.screen(world, p), t: 'arcade', game: 'race', id: 0 }); return null;   // (the screen: client/racebook.js, on the arcade's overlay)
    case 'stake': C.stake = (C.stake + 1) % CASINO.stakes.length; return null;
    case 'num': C.num = Math.floor(rng() * 37); C.msg = `Your number: ${C.num}.`; return null;
    case 'slot': {
      const bet = CASINO.slots[Number(parts[2])];
      if (!bet) return 'No such machine.';
      if (!pay(p, bet)) return 'Not enough money.';
      C.net -= bet;
      const reels = [spinReel(), spinReel(), spinReel()], x = slotPays(reels);
      C.board = [{ k: 'Reels', items: reels.map((r) => ({ t: CASINO.reel[r].icon, c: `reel ${r.toLowerCase()}` })), v: '' }];
      if (x > 0) {
        const n = Math.round(bet * x);
        win(n); C.net += n;
        const what = reels[0] === reels[1] && reels[1] === reels[2] ? `Three ${PLURAL[reels[0]]}` : 'Two cherries';
        C.msg = x >= 70 ? `${what} - JACKPOT! ${money(n)} in cash!` : `${what}: pays ${money(n)}.`;
        world.emit(poi.x, poi.y, { e: 'casino', k: x >= 70 ? 'jackpot' : 'win', x: Math.round(poi.x), y: Math.round(poi.y) });
        if (x >= 70) world.notify(p, `JACKPOT at ${poi.label}: ${money(n)} - in cash, on you.`, 'good');
      } else { C.msg = 'Nothing this time.'; world.emit(poi.x, poi.y, { e: 'casino', k: 'spin', x: Math.round(poi.x), y: Math.round(poi.y) }); }
      return null;
    }
    case 'rb': {
      if (!pay(p, stake)) return 'Not enough money.';
      C.net -= stake;
      const n = Math.floor(rng() * 37), x = roulettePays(parts[2], n, C.num);
      C.board = [{ k: 'The wheel', items: [{ t: String(n), c: `pocket ${pocketColour(n)}` }], v: n === 0 ? 'zero' : `${pocketColour(n)}, ${n % 2 ? 'odd' : 'even'}` }];
      if (x > 0) {
        const pay2 = stake * (x + 1);
        win(pay2); C.net += pay2;
        C.msg = `${n} ${pocketColour(n)} - you win ${money(pay2)}!`;
        world.emit(poi.x, poi.y, { e: 'casino', k: x >= 35 ? 'jackpot' : 'win', x: Math.round(poi.x), y: Math.round(poi.y) });
      } else { C.msg = `${n} ${pocketColour(n)}. The house takes it.`; world.emit(poi.x, poi.y, { e: 'casino', k: 'spin', x: Math.round(poi.x), y: Math.round(poi.y) }); }
      return null;
    }
    case 'deal': {
      if (C.bj) return null;
      if (!pay(p, stake)) return 'Not enough money.';
      C.net -= stake;
      const B = C.bj = { bet: stake, you: [draw(), draw()], dealer: [draw(), draw()], doubled: false };
      if (natural(B.you) || natural(B.dealer)) return settle(world, p, poi, C, win);
      C.board = bjBoard(B, true); C.msg = 'Hit or stand?';
      return null;
    }
    case 'hit': case 'double': {
      const B = C.bj;
      if (!B) return null;
      if (parts[1] === 'double') {
        if (B.you.length !== 2 || B.doubled) return 'Not now.';
        if (!pay(p, B.bet)) return 'Not enough money.';
        C.net -= B.bet; B.bet *= 2; B.doubled = true;
      }
      B.you.push(draw());
      const v = handValue(B.you);
      if (v > 21 || v === 21 || B.doubled) return settle(world, p, poi, C, win);
      C.board = bjBoard(B, true); C.msg = `${v}. Hit or stand?`;
      return null;
    }
    case 'stand': return C.bj ? settle(world, p, poi, C, win) : null;
  }
  return 'Not at this table.';
}

// the hand played out: the dealer draws to 17, the bets paid
function settle(world, p, poi, C, win) {
  const B = C.bj;
  C.bj = null;
  const { back, why } = bjOutcome(B);
  C.board = bjBoard(B, false);
  if (back) { win(back); C.net += back; }
  C.msg = back > B.bet ? `${why} You win ${money(back - B.bet)}.` : back ? why : `${why} The house takes ${money(B.bet)}.`;
  world.emit(poi.x, poi.y, { e: 'casino', k: back > B.bet ? 'win' : 'spin', x: Math.round(poi.x), y: Math.round(poi.y) });
  return null;
}
// blackjack played out from where it stands (the dealer draws to 17): what comes back (the bet with it) and why
function bjOutcome(B) {
  const you = handValue(B.you);
  let back = 0, why;
  if (natural(B.you) || natural(B.dealer)) {
    if (natural(B.you) && natural(B.dealer)) { back = B.bet; why = 'Blackjack each - a push.'; }
    else if (natural(B.you)) { back = B.bet + Math.floor(B.bet * CASINO.bjPays); why = 'Blackjack!'; }
    else why = 'The dealer has blackjack.';
  } else if (you > 21) why = `Bust at ${you}.`;
  else {
    while (handValue(B.dealer) < 17) B.dealer.push(draw());
    const d = handValue(B.dealer);
    if (d > 21) { back = B.bet * 2; why = `The dealer busts at ${d}.`; }
    else if (you > d) { back = B.bet * 2; why = `${you} beats ${d}.`; }
    else if (you === d) { back = B.bet; why = `${you} each - a push.`; }
    else why = `${d} beats ${you}.`;
  }
  return { back, why };
}
// a video poker hand drawn (new cards for those not held): what it makes and what comes back - the paytable is "for
// one": x the bet, the bet included (a pair of jacks: your bet back)
function vpOutcome(V) {
  for (let i = 0; i < 5; i++) if (!V.held[i]) V.cards[i] = V.deck.shift();
  const h = pokerHand(V.cards);
  return { h, back: V.bet * h.x };
}

// ---- video poker ----------------------------------------------------------------------------------------------------
// a fresh 52 shuffled (Fisher-Yates, the house's luck)
function shuffled() { const d = [...Array(52).keys()]; for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
const RANK_NAME = ['ace', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'jack', 'queen', 'king'], SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];
const cardName = (c) => `${RANK_NAME[c % 13]} of ${SUIT_NAME[Math.floor(c / 13)]}`;
function vpBoard(V) { return [{ k: 'Your hand', items: V.cards.map((c, i) => { const it = cardItem(c); if (V.held[i]) it.c += ' held'; return it; }), v: '' }]; }
// what five cards make: { name, x (what it pays, x the bet) }
export function pokerHand(cards) {
  const P = CASINO.poker, ranks = cards.map((c) => c % 13), suits = cards.map((c) => Math.floor(c / 13));
  const counts = new Map(); for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a), flush = suits.every((s) => s === suits[0]);
  const hi = [...new Set(ranks.map((r) => (r === 0 ? 13 : r)))].sort((a, b) => a - b), lo = [...new Set(ranks)].sort((a, b) => a - b);
  const run = (a) => a.length === 5 && a[4] - a[0] === 4;
  const straight = run(hi) || run(lo), royal = straight && flush && hi[0] === 9;   // (ten to the ace)
  if (royal) return { name: 'A royal flush', x: P.royal };
  if (straight && flush) return { name: 'A straight flush', x: P.straightFlush };
  if (groups[0] === 4) return { name: 'Four of a kind', x: P.four };
  if (groups[0] === 3 && groups[1] === 2) return { name: 'A full house', x: P.fullHouse };
  if (flush) return { name: 'A flush', x: P.flush };
  if (straight) return { name: 'A straight', x: P.straight };
  if (groups[0] === 3) return { name: 'Three of a kind', x: P.three };
  if (groups[0] === 2 && groups[1] === 2) return { name: 'Two pair', x: P.twoPair };
  if (groups[0] === 2) { const pr = [...counts].find(([, n]) => n === 2)[0]; if (pr === 0 || pr >= 10) return { name: 'Jacks or better', x: P.jacks }; }
  return { name: '', x: 0 };
}

// ---- the slots and the wheel ----------------------------------------------------------------------------------------
const REELS = Object.keys(CASINO.reel);
const PLURAL = { CHERRY: 'cherries', LEMON: 'lemons', BELL: 'bells', BAR: 'bars', SEVEN: 'sevens', LOTUS: 'golden lotuses' };
const REEL_W = REELS.reduce((s, k) => s + CASINO.reel[k].w, 0);
function spinReel() {
  let r = rng() * REEL_W;
  for (const k of REELS) { r -= CASINO.reel[k].w; if (r < 0) return k; }
  return REELS[REELS.length - 1];
}
// what a spin pays, times the bet (the bet back included): three of a kind by the paytable; two cherries anywhere
export function slotPays(reels) {
  if (reels[0] === reels[1] && reels[1] === reels[2]) return CASINO.reel[reels[0]].three;
  return reels.filter((r) => r === 'CHERRY').length === 2 ? CASINO.twoCherries : 0;
}
// the slots' payback over every way the reels can stop (tests: the house's edge is real but fair)
export function slotReturn() {
  let s = 0;
  for (const a of REELS) for (const b of REELS) for (const c of REELS) s += CASINO.reel[a].w * CASINO.reel[b].w * CASINO.reel[c].w / (REEL_W * REEL_W * REEL_W) * slotPays([a, b, c]);
  return s;
}
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const pocketColour = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
// what a bet wins on pocket n, times the stake (on top of the stake back), 0 a loss - the zero loses every outside bet
export function roulettePays(bet, n, num) {
  if (bet === 'n') return n === num ? 35 : 0;
  if (n === 0) return 0;
  switch (bet) {
    case 'red': return RED.has(n) ? 1 : 0;
    case 'black': return RED.has(n) ? 0 : 1;
    case 'odd': return n % 2 ? 1 : 0;
    case 'even': return n % 2 ? 0 : 1;
    case 'low': return n <= 18 ? 1 : 0;
    case 'high': return n >= 19 ? 1 : 0;
    case 'd1': return n <= 12 ? 2 : 0;
    case 'd2': return n >= 13 && n <= 24 ? 2 : 0;
    case 'd3': return n >= 25 ? 2 : 0;
  }
  return 0;
}
