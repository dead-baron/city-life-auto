// The park and the camp's things (the owner's notes part 2, 2026-10-24): fireworks and the Campfire Kit, registered into
// shared/items.js ITEMS (and onto the shops' shelves) when this loads - the server loads it with its systems, the page
// with client/leisure/stage.js - and the fireworks' shows: what each one does, worked out the same from its seed by
// everyone who sees it (fwShow), so the wire carries only the kind, where, when and the seed.
import { ITEMS, SHOPS } from './items.js';
import { mulberry32 } from './rng.js';
import { FIREWORKS, CAMPKIT, DUCKS } from './rules-leisure.js';

export const FW_KINDS = ['fwrocket', 'fwfountain', 'fwcake'];
export const LEISURE_ITEMS = {
  fwrocket:   { name: 'Skyrocket', fun: 'fw', fw: 0, sell: 4, desc: 'Set it down, light the fuse and stand back: up it goes and bursts over the rooftops. Harmless - but in town after dark someone may call it in.' },
  fwfountain: { name: 'Firework Fountain', fun: 'fw', fw: 1, sell: 3, desc: 'A cone of sparks a few metres high for a few seconds, changing colour as it burns.' },
  fwcake:     { name: 'Firework Cake', fun: 'fw', fw: 2, sell: 12, desc: 'A twelve-shot barrage: one after another, bursts of every colour over your head.' },
  campkit:    { name: 'Campfire Kit', fun: 'camp', sell: 8, desc: 'Split logs, kindling, matches and three log seats: build a campfire anywhere out on open ground. Sit by it to warm up.' },
};
Object.assign(ITEMS, LEISURE_ITEMS);
// on the shelves: the corner stores and the gas stations (the fireworks, the grapes for the ducks), the hardware stores,
// the outfitters and the hunting lodge (the kit)
const P = FIREWORKS.prices, stock = (shop, ...items) => { const S = SHOPS[shop]; if (S) for (const o of items) if (!S.buy.some((q) => q.kind === 'item' && q.id === o.id)) S.buy.push(o); };
const FW_STOCK = [{ kind: 'item', id: 'fwrocket', price: P.fwrocket, qty: 3 }, { kind: 'item', id: 'fwfountain', price: P.fwfountain, qty: 1 }, { kind: 'item', id: 'fwcake', price: P.fwcake, qty: 1 }];
const GRAPES = { kind: 'item', id: 'grapes', price: DUCKS.price, qty: 2 }, KIT = { kind: 'item', id: 'campkit', price: CAMPKIT.kitPrice, qty: 1 };
stock('convenience', GRAPES, ...FW_STOCK);
stock('gasstation', GRAPES, ...FW_STOCK, KIT);
stock('hardware', KIT);
stock('sports', KIT);
stock('lodge', KIT);
stock('huntcamp', KIT);

// ---- the shows ------------------------------------------------------------------------------------------------------
// the stars' colours (CSS) and, for the light thrown on the city, the same as 0-1 RGB
export const FW_COLS = ['#ff4a4a', '#4aa8ff', '#5aff7a', '#ffd84a', '#d86aff', '#ffffff', '#ff9a3a', '#4affe8'];
export const FW_RGB = [[1, 0.3, 0.3], [0.3, 0.66, 1], [0.35, 1, 0.48], [1, 0.85, 0.3], [0.85, 0.42, 1], [1, 1, 1], [1, 0.6, 0.23], [0.3, 1, 0.9]];
export const FW_PATTERNS = ['peony', 'ring', 'willow', 'crackle', 'palm'];
// what a firework of kind k (0 rocket, 1 fountain, 2 cake) lit with seed does, from the moment it goes (after the
// fuse): { secs (how long it lasts), shots: [{ t (s), dx (drift sideways, px), h (the burst's height, px), up (s
// climbing), col, col2 (indexes into FW_COLS), pat, n (stars), r (the burst's reach, px) }], fountain: { secs, col, col2 } }
export function fwShow(k, seed) {
  const R = mulberry32((seed >>> 0) ^ 0x9e3779b9), pick = (a) => a[Math.floor(R() * a.length) % a.length], ci = () => Math.floor(R() * FW_COLS.length) % FW_COLS.length;
  const shot = (t, big) => ({ t, dx: (R() - 0.5) * (big ? 60 : 110), h: big ? 175 + R() * 55 : 110 + R() * 80, up: big ? 1.15 + R() * 0.3 : 0.75 + R() * 0.35, col: ci(), col2: R() < 0.45 ? ci() : -1, pat: pick(FW_PATTERNS), n: big ? 40 + Math.floor(R() * 16) : 22 + Math.floor(R() * 14), r: big ? 95 + R() * 40 : 55 + R() * 35 });
  if (k === 1) return { secs: 6.5, shots: [], fountain: { secs: 6, col: ci(), col2: ci() } };
  if (k === 2) {
    const shots = [];
    let t = 0;
    for (let i = 0; i < 12; i++) { shots.push(shot(t, i === 11)); t += 0.38 + R() * 0.4; }
    return { secs: t + 3.5, shots, fountain: null };
  }
  return { secs: 4.5, shots: [shot(0, true)], fountain: null };
}

// a campfire of a player's own (server/systems/campfires.js build): its log seats round it - the side you built it
// from left open - [{ x, y, a (the way round from the fire) }]
export function campSeats(x, y, a) {
  const out = [], n = CAMPKIT.seats;
  for (let k = 0; k < n; k++) { const t = a + (k - (n - 1) / 2) * (Math.PI * 2 / (n + 1)); out.push({ x: x + Math.cos(t) * CAMPKIT.seatR, y: y + Math.sin(t) * CAMPKIT.seatR, a: t }); }
  return out;
}
