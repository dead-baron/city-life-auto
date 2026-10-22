// The race book (the owner's #310, horse racing) at Lucky Mesa's casinos (casino.js: the floor's "The race book"): the
// races at the track out east, shown on the casinos' screens (the page's: client/racebook.js) - one every
// RACEBOOK.everyS seconds of the world's clock, the same race for everyone on the server. Race n is posted at n x everyS
// with its field and the book's odds (shared/racebook.js fieldOf, oddsOf: the same for anyone, worked out from n);
// betting is open till the off, betS later; at the off the book draws the race's seed (the system's own randomness, so
// nobody can know the result before it's run) and the race is run (shared/racebook.js run: the server and the pages run
// it alike); when the winner's past the post the winning bets are paid at the odds they were struck at - in cash, on
// you (or in your account if you've gone).
//   world.races: Map n -> { n, field, odds, seed (null till the off), res (run's result), paid, bets: [{ pid, h, stake, o }] }
import { RACEBOOK } from '../../shared/rules.js';
import { DT } from '../../shared/constants.js';
import { fieldOf, oddsOf, run, payout, oddsText } from '../../shared/racebook.js';
import { mulberry32 } from '../../shared/rng.js';
import { randomInt } from 'node:crypto';
import { store } from '../store.js';

export { oddsText };
export const payoutOf = payout;
let draw = () => randomInt(0x100000000);   // (the book's seed at the off: the system's randomness - seeded in tests)
export function seedLuck(n) { const r = mulberry32(n >>> 0); draw = () => Math.floor(r() * 4294967296); }

export const clock = (world) => world.tick * DT;   // (the world's clock as the pages have it: its tick)
export const raceNo = (t) => Math.floor(t / RACEBOOK.everyS);
export const postAt = (n) => n * RACEBOOK.everyS;
export const offAt = (n) => n * RACEBOOK.everyS + RACEBOOK.betS;

export function race(world, n) {
  const M = world.races || (world.races = new Map());
  let R = M.get(n);
  if (!R) {
    const field = fieldOf(n);
    R = { n, field, odds: oddsOf(field, n), seed: null, res: null, paid: false, bets: [] };
    M.set(n, R);
    for (const k of M.keys()) if (k < n - 2) M.delete(k);   // (the last couple kept: their results for the screens)
  }
  return R;
}
// where race n stands at time t: 'betting' till the off, 'running' till its winner's past the post (and a little after),
// then 'result'
export function phase(R, t) {
  if (t < offAt(R.n)) return 'betting';
  if (!R.res || t < offAt(R.n) + R.res.t[R.res.order[R.res.order.length - 1]] + 1) return 'running';
  return 'result';
}
// the race the floor's screens are on: the one being run (or whose result is up), or the next being bet on
export function current(world) { return race(world, raceNo(clock(world))); }

export function bet(world, p, h, stake, pay) {
  const R = current(world), t = clock(world);
  if (phase(R, t) !== 'betting') return 'Betting\'s closed on this one - the next race is posted soon.';
  if (!(h >= 0 && h < R.field.length)) return 'No such runner.';
  if (!RACEBOOK.stakes.includes(stake)) return 'Not a stake the book takes.';
  if (R.bets.filter((b) => b.pid === p.pid).length >= RACEBOOK.maxBets) return `${RACEBOOK.maxBets} bets a race at most.`;
  if (!pay(p, stake)) return 'Not enough money.';
  R.bets.push({ pid: p.pid, h, stake, o: R.odds[h] });
  store.touch();
  return null;
}

// each tick: the off (the seed drawn, the race run), then the winners paid as their horse crosses the line
export function update(world) {
  if (world.tick % 5 !== 0) return;
  const t = clock(world), R = current(world);
  const prev = world.races.get(R.n - 1);
  for (const Q of [prev, R]) {
    if (!Q) continue;
    if (!Q.seed && t >= offAt(Q.n)) { Q.seed = draw() || 1; Q.res = run(Q.field, Q.seed); }
    if (Q.res && !Q.paid && t >= offAt(Q.n) + Q.res.t[Q.res.order[0]] + 0.5) settle(world, Q);
  }
}
function settle(world, R) {
  R.paid = true;
  const win = R.res.order[0], name = R.field[win].name, online = new Map();
  for (const p of world.players.values()) online.set(p.pid, p);
  const won = new Map();
  for (const b of R.bets) {
    if (b.h !== win) continue;
    const n = payout(b.stake, b.o), prof = (online.get(b.pid) || {}).profile || store.get(b.pid);
    if (!prof) continue;
    prof.cash += n;
    won.set(b.pid, (won.get(b.pid) || 0) + n);
  }
  for (const b of R.bets) {
    const p = online.get(b.pid);
    if (!p || p._rbTold === R.n) continue;
    p._rbTold = R.n; p.meDirty = true;
    const w = won.get(b.pid);
    world.notify(p, w ? `${name} wins race ${R.n % 1000}! You collect $${w.toLocaleString()} in cash.` : `${name} wins race ${R.n % 1000}. Not your day.`, w ? 'good' : 'info');
  }
  if (won.size) store.touch();
}

// what the page's screen needs: the race, where it is, its field and odds, the seed once it's off, your bets, the last result
export function screen(world, p) {
  const R = current(world), t = clock(world), prev = world.races.get(R.n - 1);
  return {
    t: 'racebook', n: R.n, now: t, post: postAt(R.n), off: offAt(R.n), next: postAt(R.n + 1), ph: phase(R, t),
    field: R.field.map((h) => ({ name: h.name, silk: h.silk, str: h.str, style: h.style })), odds: R.odds.map(oddsText),
    seed: R.seed, mine: R.bets.filter((b) => b.pid === p.pid).map((b) => ({ h: b.h, stake: b.stake, ret: payout(b.stake, b.o) })),
    last: prev && prev.res ? prev.res.order.slice(0, 3).map((i) => prev.field[i].name) : null,
  };
}
