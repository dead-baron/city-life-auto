// Hot money (Robberies v2, the owner's notes, task #323: "Robbed cash can't go straight into the ATM outside"). What a
// robbery takes goes into a bag you carry - profile.hot, kept apart from your cash (no good in the shops), and
// profile.hotAt, where it was stolen. Everyone sees the bag on your back (net.js: the descriptor's mb). Three ways to
// clean it:
// - bank it at an ATM (walk up to it, or its menu) or a bank, once you're HOT_FAR_PX from where it was stolen and the
//   police aren't after you: it goes into the bank like any deposit;
// - stash it at any home you own, at any distance: it comes out as clean cash;
// - sell it to a fence (the Back-Alley Exchange) for clean cash less HOT_FENCE_CUT - or a pawn shop, less HOT_PAWN_CUT.
// Die and the bag drops where you fell (cargo.js dropEverything), still hot and still remembering where it was stolen -
// anyone can take it. Booked into a cell (custody.js), it's confiscated. A second robbery adds to the bag and moves its
// "stolen at" spot to the new one.
import { HOT_FAR_PX, HOT_FENCE_CUT, HOT_PAWN_CUT, ATM_DEPOSIT_PX, PACK_LIFE_S } from '../../shared/rules.js';
import { store } from '../store.js';

export const hotOf = (p) => Math.max(0, Math.round((p && p.profile && p.profile.hot) || 0));
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

// Into the bag: amt more, stolen at (x, y)
export function add(world, p, amt, x, y) {
  const prof = p.profile;
  prof.hot = hotOf(p) + Math.max(0, Math.round(amt));
  prof.hotAt = { x: Math.round(x), y: Math.round(y) };
  changed(world, p);
}
function empty(world, p) {
  p.profile.hot = 0; p.profile.hotAt = null;
  changed(world, p);
}
function changed(world, p) {
  store.touch();
  p.meDirty = true;
  sync(world, p);
}

// The bag on the character's back (net.js: the descriptor's mb), on and off as it fills and empties
export function sync(world, p) {
  const ped = p.ped;
  if (!ped) return;
  const on = hotOf(p) > 0 && !ped.dead;
  if (!!ped.moneyBag !== on) { ped.moneyBag = on; ped.appVer = (ped.appVer || 0) + 1; }
}

// Why an ATM or a bank won't take it here and now (null: it will)
export function refusal(world, p, x, y) {
  if (p.wanted > 0) return 'Lose the police first.';
  const at = p.profile.hotAt;
  if (at && Math.hypot(x - at.x, y - at.y) < HOT_FAR_PX) return 'Too hot - get it well away from the robbery first.';
  return null;
}

// ---- cleaning it ---------------------------------------------------------------------------------------------------------
function toBank(world, p, where) {
  const n = hotOf(p);
  p.profile.bank += n;
  empty(world, p);
  if (where) world.emit(where.x, where.y, { e: 'deposit', x: where.x, y: where.y, n });
  world.notify(p, `${where && where.kind === 'atm' ? 'ATM' : 'Bank'}: the hot money went in clean - ${money(n)} deposited, bank ${money(p.profile.bank)}.`, 'good');
}
const cutAt = (poi) => (poi.kind === 'pawn' ? HOT_PAWN_CUT : HOT_FENCE_CUT);

// The options at a counter (economy.js buildMenu): the bank and the ATMs, your homes, the fence and the pawn shops
export function menuOpts(world, p, poi, opts) {
  const n = hotOf(p), ped = p.ped;
  if (n <= 0 || !ped) return;
  const k = poi.kind;
  if (k === 'bank' || k === 'atm') {
    const why = refusal(world, p, ped.x, ped.y);
    opts.push({ id: 'hot:bank', label: `Deposit the hot money (${money(n)})`, note: why ? (p.wanted > 0 ? 'lose the police first' : 'too hot here') : 'goes in clean' });
  } else if (k === 'home') {
    const h = world.map.homes[poi.home];
    if (h && world.homeOwner.get(h.id) === p.pid) opts.push({ id: 'hot:stash', label: `Stash the hot money (${money(n)})`, note: 'comes out clean' });
  } else if (k === 'fence' || k === 'pawn') {
    const cut = cutAt(poi);
    opts.push({ id: 'hot:fence', label: `${k === 'fence' ? 'Fence' : 'Pawn'} the hot money (${money(n)})`, price: -Math.round(n * (1 - cut)), note: `${Math.round(cut * 100)}% cut` });
  }
}

// One of those options taken (economy.js execute): null, or why not
export function execute(world, p, poi, what) {
  const n = hotOf(p), prof = p.profile, ped = p.ped;
  if (n <= 0 || !ped) return 'You have no hot money on you.';
  if (what === 'bank') {
    const why = refusal(world, p, ped.x, ped.y);
    if (why) return why;
    toBank(world, p, poi);
    return null;
  }
  if (what === 'stash') {
    prof.cash += n;
    empty(world, p);
    world.notify(p, `Stashed the robbery money at home: ${money(n)} - it's clean cash now.`, 'good');
    return null;
  }
  if (what === 'fence') {
    const cut = cutAt(poi), get = Math.round(n * (1 - cut));
    prof.cash += get;
    empty(world, p);
    world.notify(p, `${poi.kind === 'fence' ? 'The fence' : 'The pawn shop'} took the hot money: ${money(get)} clean (a ${Math.round(cut * 100)}% cut).`, 'good');
    return null;
  }
  return 'Not here.';
}

// Walk up to a cash machine with the bag and it's banked - far enough from the robbery and nobody after you; else it says
// why not (once a visit). (economy.js quickDeposits does the same with your cash.)
function walkUps(world) {
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || ped.vehId || ped.hidden || hotOf(p) <= 0) { p.atAtmHot = null; continue; }
    let at = null;
    for (const q of world.map.atms) if (Math.abs(q.x - ped.x) < ATM_DEPOSIT_PX && Math.abs(q.y - ped.y) < ATM_DEPOSIT_PX && Math.hypot(q.x - ped.x, q.y - ped.y) < ATM_DEPOSIT_PX) { at = q; break; }
    if (!at) { p.atAtmHot = null; continue; }
    if (p.atAtmHot === at.id) continue;   // once a visit
    p.atAtmHot = at.id;
    const why = refusal(world, p, ped.x, ped.y);
    if (why) { world.notify(p, `ATM: the hot money stays in the bag. ${why}`, 'warn'); continue; }
    toBank(world, p, { x: at.x, y: at.y, kind: 'atm' });
  }
}

export function update(world) {
  if (world.tick % 5 !== 2) return;
  walkUps(world);
  for (const p of world.players.values()) sync(world, p);
}

// ---- dropped and taken -------------------------------------------------------------------------------------------------
// Down: the bag lands beside you, still hot (it remembers where it was stolen) - a duffel anyone can pick up (cargo.js
// bags: wire tier 1). Blinks at the end of its PACK_LIFE_S like your backpack.
export function drop(world, ped, ownerName) {
  const p = ped.player, n = hotOf(p);
  if (!p || n <= 0) return null;
  const prof = p.profile, a = ped.a + Math.PI / 2;
  const bag = world.spawnBag(ped.x + Math.cos(a) * 22, ped.y + Math.sin(a) * 22, { cash: 0, items: {}, weapons: {}, itemValue: n }, ownerName);
  bag.hot = n; bag.hotAt = prof.hotAt ? { ...prof.hotAt } : { x: Math.round(ped.x), y: Math.round(ped.y) };
  bag.tier = 1; bag.expires = world.time + PACK_LIFE_S; bag.ownerPid = p.pid;
  empty(world, p);
  world.notify(p, `You dropped the robbery bag (${money(n)} hot money) where you fell - anyone can take it.`, 'warn');
  return bag;
}
export const bagLabel = (bag, p) => (bag.ownerPid && p && bag.ownerPid === p.pid ? `Pick up your robbery bag (${money(bag.hot)} hot money)` : `Grab the robbery bag (${money(bag.hot)} hot money)`);
export function pickUp(world, p, bag) {
  const prof = p.profile, had = hotOf(p), ped = p.ped;
  prof.hot = had + bag.hot;
  // where it was stolen: the bag's (yours, if you were carrying some already and yours is the nearer: the stricter one)
  const far = (q) => (q && ped ? Math.hypot(q.x - ped.x, q.y - ped.y) : Infinity);
  if (!had || !prof.hotAt || far(bag.hotAt) < far(prof.hotAt)) prof.hotAt = bag.hotAt ? { ...bag.hotAt } : prof.hotAt;
  world.remove(bag);
  world.emit(bag.x, bag.y, { e: 'loot', x: bag.x, y: bag.y, n: bag.hot });
  const mine = bag.ownerPid && bag.ownerPid === p.pid;
  world.notify(p, mine ? `You got your robbery bag back: ${money(bag.hot)}, still hot.` : `You grabbed a robbery bag: ${money(bag.hot)} - hot money, stolen at a robbery. Clean it before you spend it.`, 'good');
  changed(world, p);
}

// Booked into a cell (custody.js): the bag is taken. How much was in it.
export function confiscate(world, p) {
  const n = hotOf(p);
  if (n > 0) empty(world, p);
  return n;
}
