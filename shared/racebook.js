// The race book (the owner's #310, horse racing: server/systems/racebook.js takes the bets at Lucky Mesa's casinos, the
// page shows the race on its own little screen - client/racebook.js). The races are run at the track out east and shown
// in the casinos: a race every RACEBOOK.everyS seconds of the world's clock (its tick, as the page has it), a field of six
// with their odds posted, betting open till the off, then the race run - one lap of the oval - and the winners paid.
//   fieldOf(n)          race n's runners: [{ name, silk: [body, cap], str (its class), style ('front' | 'even' |
//                       'closer': where it does its running) }] - the same for anyone, worked out from n
//   oddsOf(field, n)    the odds the book offers on each to win (fractional, as [a, b]: a-b), the house's edge in them
//   run(field, seed)    the race itself from its seed (the book's, drawn at the off - before then nobody can know it):
//                       { t: [finish time of each, s], at(i, s) -> how far round (0..1), order: [indexes, first to last] }
// Arithmetic only (no Math.sin and the like): the server and every page run the same race to the hundredth.
import { mulberry32 } from './rng.js';
import { RACEBOOK } from './rules.js';

export const NAMES = ['Sundown Express', 'Copper Penny', 'Dust Devil', 'Neon Gambler', 'Mesa Moonlight', 'Last Chance Lou', 'Gold Rush Gal',
  'Silver Sage', 'Rattlesnake Ridge', 'High Roller', 'Lucky Seven', 'Prairie Fire', 'Midnight Mirage', 'Cactus Jack', 'Desert Rose',
  'Painted Canyon', 'Tumbleweed', 'Red Rock Rebel', 'Saguaro Sunrise', 'Jackpot Jones', 'Whiskey River', 'Pecos Bill', 'Starlight Strip',
  'Rodeo Queen', 'Thunder Mesa', 'Blue Agave', 'Coyote Moon', 'Wildcat Willie', 'Diamond Dust', 'Hot Streak', 'Snake Eyes', 'Big Sky',
  'Lonesome Dove', 'Fool\'s Gold', 'Second Wind', 'Easy Money', 'Turquoise Trail', 'Mustang Sally', 'Dark Horse', 'Long Shot'];
// the jockeys' silks: the body, the cap
export const SILKS = [['#c8262b', '#f2f2f2'], ['#2350c8', '#f2c21b'], ['#f2c21b', '#1a1a1a'], ['#2f9a3a', '#f2f2f2'], ['#e04a9a', '#2350c8'],
  ['#f2f2f2', '#c8262b'], ['#7a3ac8', '#f2c21b'], ['#ef7a1a', '#1a1a1a'], ['#25b8c0', '#c8262b'], ['#1a1a1a', '#2f9a3a']];
const STYLES = ['front', 'even', 'closer'];

export function fieldOf(n) {
  const r = mulberry32((Math.imul(n | 0, 2654435761) ^ 0x51ED) >>> 0), names = [], silks = [];
  while (names.length < RACEBOOK.field) { const k = Math.floor(r() * NAMES.length); if (!names.includes(k)) names.push(k); }
  while (silks.length < RACEBOOK.field) { const k = Math.floor(r() * SILKS.length); if (!silks.includes(k)) silks.push(k); }
  return names.map((k, i) => ({ name: NAMES[k], silk: SILKS[silks[i]], str: Math.round((0.975 + r() * 0.05) * 1000) / 1000, style: STYLES[Math.floor(r() * 3)] }));
}

// the race: each horse's speed through it - its class, its style (a front-runner quick away and tiring, a closer coming
// late), how it's going on the day and its luck through the race (a value every few seconds it eases between: the book's
// seed) - and now and then a stumble
const DT = 0.05, LUCK_S = 3;
export function run(field, seed) {
  const N = field.length, r = mulberry32(seed >>> 0), luck = [], stumble = [], day = [];
  for (let i = 0; i < N; i++) {
    const L = []; for (let k = 0; k < 16; k++) L.push((r() - 0.5) * 2 * RACEBOOK.luck);   // (a value every LUCK_S seconds)
    luck.push(L);
    day.push((r() - 0.5) * 2 * RACEBOOK.form);   // (how it's going today, the whole way round)
    stumble.push(r() < RACEBOOK.stumbleP ? 0.2 + r() * 0.6 : -1);   // (where round it stumbles, if it does)
  }
  const pos = field.map(() => [0]), t = field.map(() => 0), v0 = 1 / RACEBOOK.runS;
  let step = 0, left = N;
  while (left > 0 && step < 4000) {
    step++;
    const s = step * DT;
    for (let i = 0; i < N; i++) {
      const P = pos[i], d = P[P.length - 1];
      if (t[i]) { P.push(d); continue; }
      const H = field[i], u = s / LUCK_S, k = Math.floor(u), f = u - k, lk = day[i] + luck[i][k % 16] * (1 - f) + luck[i][(k + 1) % 16] * f;
      const shape = H.style === 'front' ? 1.06 - 0.12 * d : H.style === 'closer' ? 0.94 + 0.12 * d : 1;
      const start = Math.min(1, s / 1.5);   // (out of the gate: up to speed in a second and a half)
      const trip = stumble[i] >= 0 && d > stumble[i] && d < stumble[i] + 0.02 ? 0.55 : 1;
      const nd = d + v0 * H.str * shape * (1 + lk) * start * trip * DT;
      if (nd >= 1) { t[i] = (step - 1) * DT + (1 - d) / Math.max(1e-6, nd - d) * DT; P.push(1); left--; }
      else P.push(nd);
    }
  }
  const order = field.map((_, i) => i).sort((a, b) => t[a] - t[b]);
  return { t, order, at: (i, sec) => { const P = pos[i], k = Math.max(0, sec) / DT, j = Math.floor(k); if (j >= P.length - 1) return P[P.length - 1]; return P[j] + (P[j + 1] - P[j]) * (k - j); } };
}

// the odds: each one's chance to win from a few hundred of the race run over (the book's own form study), the house's
// edge taken off the fair price, rounded down to the odds a bookmaker writes up
export const LADDER = [[1, 5], [1, 4], [2, 7], [1, 3], [2, 5], [1, 2], [4, 7], [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10], [6, 5],
  [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1], [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2], [5, 1], [11, 2], [6, 1],
  [13, 2], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [25, 1], [33, 1], [40, 1], [50, 1]];
export function oddsOf(field, n, sims = RACEBOOK.sims) {
  const wins = field.map(() => 0), r = mulberry32((Math.imul(n | 0, 40503) ^ 0xBEEF) >>> 0);
  for (let k = 0; k < sims; k++) wins[run(field, Math.floor(r() * 4294967296)).order[0]]++;
  return wins.map((w) => {
    const p = (w + 0.5) / (sims + field.length * 0.5), fair = 1 / p - 1, offer = fair * RACEBOOK.take;
    let best = LADDER[0];
    for (const L of LADDER) if (L[0] / L[1] <= offer) best = L;
    return best;
  });
}
export const oddsText = (o) => (o[0] === o[1] ? 'evens' : `${o[0]}-${o[1]}`);
// a win bet's return (the stake back with it) at odds o
export const payout = (stake, o) => Math.floor(stake + (stake * o[0]) / o[1]);
