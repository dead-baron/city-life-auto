// Black-market body armor (the crime career's 'armor' unlock - docs/PROGRESSION.md "Careers and ranks"; the numbers:
// shared/rules.js ARMOR). Sold at the black market (the fence's counter: economy.js), each tier from its crime rank
// (careers.unlockValue(p, 'armor'): the best tier you may buy). Worn, a vest takes a share of a gun's, a blade's, a fist's
// or an arrow's hit (combat.js damage hands the hit here, after a player's grit) until it has taken its points in all,
// then it's spent - at most that much more health, less against the police's rifles (pierce), nothing against a blast,
// fire, a car or a fall. The heavier tiers slow your running (players.js pedMods: speedMul). Others see a tactical vest over
// your clothes in the tier's color (looks.js appOf - the K9 handler's vest from shared/lookcore.js: no new art).
//   profile.armor: { t (the tier: 1..ARMOR.tiers.length), pts (what it can still take) } - absent: none (old saves too)
import { ARMOR } from '../../shared/rules.js';
import { store } from '../store.js';
import * as careers from './careers.js';
import * as looks from './looks.js';

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const CAUSES = new Set(ARMOR.causes);
// the vest worn: { T (its tier's numbers), t, pts } or null
export function worn(prof) {
  const A = prof && prof.armor, T = A && ARMOR.tiers[(A.t | 0) - 1];
  return T && A.pts > 0 ? { T, t: A.t | 0, pts: A.pts } : null;
}
// the best tier this player (or profile) may buy: 0 none
export const maxTier = (x) => Math.min(ARMOR.tiers.length, careers.unlockValue(x, 'armor', 0) | 0);
// the crime rank a tier comes at, by name
export function rankFor(t) {
  const R = careers.CAREERS.crime.ranks;
  for (let i = 0; i < R.length; i++) if ((R[i].unlock || []).some((u) => u.k === 'armor' && u.v >= t)) return R[i].name;
  return R[R.length - 1].name;
}

// what of a hit the vest would take (nothing changed): 0 with none
export function share(ped, amount, cause, attacker = null) {
  const p = ped && ped.player;
  if (!p || !(amount > 0) || !CAUSES.has(cause)) return 0;
  const A = worn(p.profile);
  if (!A) return 0;
  const k = A.T.absorb * (cause === 'gun' && attacker ? ARMOR.pierce[attacker.weapon] ?? 1 : 1);
  return Math.min(A.pts, amount * k);
}
// The hit a player takes with a vest on: what gets through. (attacker: whose weapon - rifle rounds pierce it)
export function absorb(world, ped, amount, cause, attacker = null) {
  const took = share(ped, amount, cause, attacker), p = ped && ped.player, A = p && worn(p.profile);
  if (!(took > 0) || !A) return amount;
  p.profile.armor.pts = Math.max(0, Math.round((A.pts - took) * 100) / 100);
  if (p.profile.armor.pts <= 0) spent(world, p);
  store.touch();
  return amount - took;
}
function spent(world, p) {
  const T = ARMOR.tiers[(p.profile.armor.t | 0) - 1];
  delete p.profile.armor;
  refreshLook(p);
  if (world) world.notify(p, `Your ${T ? T.name.toLowerCase() : 'vest'} is shot through - it's done.`, 'warn');
}
// running in it (players.js pedMods)
export const speedMul = (ped) => { const A = ped && ped.player ? worn(ped.player.profile) : null; return A ? A.T.slow : 1; };

// the ped's look again (the vest on or off - looks.js appOf); on duty the uniform stays, and the clothes kept for after
// (law.js p.civvies) get it
export function refreshLook(p) {
  if (p.badge) { if (p.civvies) p.civvies = looks.appOf(p.profile); return; }
  if (p.ped) { p.ped.app = looks.appOf(p.profile); p.ped.appVer = (p.ped.appVer || 0) + 1; }
}

// ---- the black market's counter (economy.js 'fence') -----------------------------------------------------------------
export function menuOpts(p, opts) {
  const prof = p.profile, top = maxTier(p), A = worn(prof);
  ARMOR.tiers.forEach((T, i) => {
    const t = i + 1, ok = t <= top, on = A && A.t === t;
    opts.push({ id: `armor:${t}`, label: `${T.name}${on ? ` (wearing: ${Math.ceil(A.pts)} of ${T.pts} left)` : ''}`, price: T.price, dis: !ok, note: ok ? `takes ${Math.round(T.absorb * 100)}% of a hit, up to ${T.pts}${T.slow < 1 ? ` · ${Math.round((1 - T.slow) * 100)}% slower running` : ''}` : `at ${rankFor(t)} (crime)` });
  });
}
// buy and wear tier t (replacing what's worn). null, or why not.
export function buy(world, p, t, pay) {
  const T = ARMOR.tiers[(t | 0) - 1];
  if (!T) return 'Not sold here.';
  if (t > maxTier(p)) return `The ${T.name.toLowerCase()} comes at ${rankFor(t)} (crime).`;
  if (!pay(p, T.price)) return `You need ${money(T.price)} (cash + bank).`;
  p.profile.armor = { t, pts: T.pts };
  store.touch(); p.meDirty = true;
  refreshLook(p);
  world.notify(p, `${T.name} on, under your jacket - it takes ${Math.round(T.absorb * 100)}% of a hit until it's spent (${T.pts} in all).${T.slow < 1 ? ' It\'s heavy: you run a little slower.' : ''}`, 'good');
  return null;
}
