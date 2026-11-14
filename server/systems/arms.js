// Your weapons: the guns you carry are at risk, with one stash (the owner, 2026-11-14; the numbers: shared/rules.js ARMS).
//   - at risk (atRisk): every gun, bow, launcher and grenade, anything illegal, a melee weapon or tool that sells for more
//     than ARMS.keepMax (the sword, the katana, the plasma blade). Fists, police issue, and the cheap legal melee weapons and
//     tools (a bat, a knife, a crowbar, a fishing pole, pepper spray) are never at risk.
//   - carried: ARMS.slots at-risk weapons at most (profile.weapons, as before - a loadout from before keeps what it has).
//   - the stash: one per character (profile.stash.weapons: id -> rounds - the home safe's, the same one), opened at your
//     home's safe and at any gun shop or pawn shop (ARMS.stashKinds: economy.js stashMenu).
//   - down (cargo.js dropEverything): each at-risk weapon falls round where you lay, a pickup anyone can take for
//     ARMS.dropS; the rest stays with you.
//   - booked (custody.js confiscate): the illegal ones taken for good, the legal at-risk ones into your stash.
//   - bought with your slots full: the one in your hand (else the first) goes to the stash; bought "to stash", straight in.
//   - dropped on the ground (the bag's Drop) or handed to a crewmate close by: both a pickup (dropAt / pickUp).
// Rounds: profile.weapons[id] is every round you have for it, those in the magazine (ped.mag) among them - as combat.js
// counts them; the stash keeps the same total.
import { WEAPONS, SHOPS, weaponOrder } from '../../shared/items.js';
import { ARMS, DROP_LIFE_S } from '../../shared/rules.js';
import { store } from '../store.js';
import * as crews from './crews.js';

// a weapon's lowest price at any counter (null: sold at none - the plasma blade, the dev tools)
let PRICE = null;
export function shopPrice(id) {
  if (!PRICE) {
    PRICE = {};
    for (const s of Object.values(SHOPS)) for (const o of s.buy || []) if (o.kind === 'weapon' && o.price > 0) PRICE[o.id] = Math.min(PRICE[o.id] ?? Infinity, o.price);
  }
  return PRICE[id] ?? null;
}
const DEPT = new Set(['taser', 'baton']);   // (the department's, with the police: law.js DEPT_GEAR)
const issued = (w) => !!w.police || DEPT.has(w.id) || !!w.dev;
// can it be lost (and does it take a slot)?
export function atRisk(id) {
  const w = WEAPONS[id];
  if (!w || id === 'fists' || issued(w)) return false;
  if (w.illegal) return true;
  if (w.type === 'melee' || w.type === 'tool' || w.type === 'spray') { const pr = shopPrice(id); return pr === null || pr > ARMS.keepMax; }
  return true;
}
// can it go in the stash (anything of your own: not your fists, not police issue)
export const stashable = (id) => !!WEAPONS[id] && id !== 'fists' && !issued(WEAPONS[id]);
export const carried = (prof) => Object.keys(prof.weapons || {}).filter(atRisk);
export const full = (prof) => carried(prof).length >= ARMS.slots;
export function stashOf(prof) {
  const st = (prof.stash ||= { items: {}, weapons: {} });
  st.items ||= {}; st.weapons ||= {};
  return st;
}
export const stashed = (prof) => Object.keys((prof.stash && prof.stash.weapons) || {}).filter((id) => WEAPONS[id]);
const fullWhy = (who = 'Your') => `${who} hands are full (${ARMS.slots} weapons) - put one in your stash first.`;
// would taking id put p over the slots? (one you have already only adds its rounds)
const noRoom = (prof, id) => atRisk(id) && prof.weapons[id] === undefined && full(prof);

// into your hands: n rounds more (the magazine filled from them when it's new to you)
function addCarried(p, id, n) {
  const prof = p.profile, ped = p.ped, w = WEAPONS[id];
  const had = prof.weapons[id] !== undefined;
  prof.weapons[id] = (prof.weapons[id] || 0) + Math.max(0, n || 0);
  if (ped && w.mag && (!had || ped.mag[id] === undefined)) ped.mag[id] = Math.min(w.mag, prof.weapons[id]);
  p.meDirty = true;
}

// ---- the stash ----------------------------------------------------------------------------------------------------------
// out of your hands and into the stash, its rounds with it
export function toStash(p, id) {
  const prof = p.profile, ped = p.ped;
  if (prof.weapons[id] === undefined || !stashable(id)) return 'You do not have that.';
  const st = stashOf(prof);
  st.weapons[id] = (st.weapons[id] || 0) + (prof.weapons[id] || 0);
  delete prof.weapons[id];
  if (ped && ped.mag) delete ped.mag[id];
  if (ped && ped.weapon === id) ped.weapon = 'fists';
  p.meDirty = true;
  store.touch();
  return null;
}
// out of the stash and into your hands (the slots allowing)
export function fromStash(p, id) {
  const prof = p.profile, st = stashOf(prof);
  if (st.weapons[id] === undefined || !WEAPONS[id]) return 'Not in your stash.';
  if (noRoom(prof, id)) return fullWhy();
  const n = st.weapons[id];
  delete st.weapons[id];
  addCarried(p, id, n);
  store.touch();
  return null;
}
// bought at a counter with rounds (economy.js 'w'): into your hands - with them full, the one in your hand (else the first
// you carry) goes to your stash to make room. -> the name of what went to the stash, or null
export function bought(p, id, rounds) {
  const prof = p.profile, ped = p.ped, w = WEAPONS[id];
  let swapped = null;
  if (noRoom(prof, id)) {
    const c = carried(prof), out = c.includes(ped.weapon) ? ped.weapon : weaponOrder(c)[0];
    toStash(p, out);
    swapped = WEAPONS[out].name;
  }
  prof.weapons[id] = rounds;
  if (w.mag) ped.mag[id] = Math.min(w.mag, rounds);
  p.meDirty = true;
  store.touch();
  return swapped;
}
// bought "to stash" (economy.js 'w:<id>:<price>:s'), or its ammunition: straight into the stash
export function addToStash(p, id, rounds) {
  const st = stashOf(p.profile);
  st.weapons[id] = (st.weapons[id] || 0) + Math.max(0, rounds || 0);
  store.touch();
}
// the stash's rows for a menu: put away what you carry, take out what's in it (economy.js stashMenu, homeinside.js safe)
export function stashRows(p) {
  const prof = p.profile, st = stashOf(prof), out = [];
  const rds = (id, n) => (WEAPONS[id].mag ? `${n} rds` : '');
  for (const id of weaponOrder(Object.keys(prof.weapons))) if (stashable(id)) out.push({ id: `hsw:${id}`, label: `Stash ${WEAPONS[id].name}`, note: rds(id, prof.weapons[id] || 0), wpn: WEAPONS[id].i });
  for (const id of weaponOrder(stashed(prof))) {
    const no = noRoom(prof, id);
    out.push({ id: `htw:${id}`, label: `Take ${WEAPONS[id].name}`, note: no ? 'your hands are full' : `stash${WEAPONS[id].mag ? ` · ${st.weapons[id]} rds` : ''}`, wpn: WEAPONS[id].i, dis: no });
  }
  return out;
}

// ---- pickups: a weapon on the ground --------------------------------------------------------------------------------------
// a bag holding the one weapon and its rounds (o: life s, by: who put it down, ownerName)
export function dropAt(world, x, y, id, rounds, o = {}) {
  const bag = world.spawnBag(x, y, { cash: 0, items: {}, weapons: { [id]: Math.max(0, rounds || 0) }, itemValue: Math.round((shopPrice(id) || 100) * 0.4) }, o.ownerName || '');
  bag.gun = id;
  bag.expires = world.time + (o.life ?? DROP_LIFE_S);
  if (o.by) bag.dropBy = o.by;
  return bag;
}
export const isGun = (bag) => !!(bag && bag.gun);
export const blinks = (world, bag) => bag.expires - world.time < ARMS.blinkS;
export function label(bag, p) {
  const w = WEAPONS[bag.gun], mine = bag.dropBy && p && bag.dropBy === p.pid;
  return `Pick up ${mine ? 'your' : 'the'} ${w ? w.name : 'weapon'}${!mine && bag.ownerName ? ` (${bag.ownerName.replace(/ \(disconnected\)$/, '')}'s)` : ''}`;
}
// taken off the ground (cargo.js lootBag) -> true when it was
export function pickUp(world, p, bag) {
  const id = bag.gun, prof = p.profile;
  if (!WEAPONS[id]) { world.remove(bag); return false; }
  if (noRoom(prof, id)) { world.notify(p, fullWhy(), 'warn'); return false; }
  addCarried(p, id, bag.weapons[id] || 0);
  world.remove(bag);
  world.emit(bag.x, bag.y, { e: 'loot', x: bag.x, y: bag.y, n: 0 });
  const mine = bag.dropBy === p.pid;
  if (!bag.handed) world.notify(p, `Picked up ${mine ? 'your' : 'the'} ${WEAPONS[id].name}${WEAPONS[id].mag ? ` (${prof.weapons[id]} rounds)` : ''}.`, 'good');
  store.touch();
  return true;
}

// Down (cargo.js dropEverything): each at-risk weapon you carried falls round where you lay - a pickup anyone can take for
// ARMS.dropS, blinking its last ARMS.blinkS, then gone. What isn't at risk stays with you. -> the names dropped
export function dropOnDeath(world, ped, ownerName) {
  const p = ped.player, prof = p.profile, ids = weaponOrder(carried(prof));
  ids.forEach((id, k) => {
    const a = (ped.a || 0) + Math.PI + (k / Math.max(1, ids.length)) * Math.PI * 2, r = 16 + (k % 2) * 8;
    dropAt(world, ped.x + Math.cos(a) * r, ped.y + Math.sin(a) * r, id, prof.weapons[id] || 0, { life: ARMS.dropS, by: p.pid, ownerName });
    delete prof.weapons[id];
    if (ped.mag) delete ped.mag[id];
  });
  if (!prof.weapons.fists && prof.weapons.fists !== 0) prof.weapons.fists = 0;
  return ids.map((id) => WEAPONS[id].name);
}

// Booked (custody.js confiscate, after the illegal ones are taken): the legal weapons at risk go to your stash, not back to
// your hands. -> their names
export function onBooked(p) {
  const prof = p.profile, out = [];
  for (const id of weaponOrder(carried(prof))) if (!WEAPONS[id].illegal && !toStash(p, id)) out.push(WEAPONS[id].name);
  return out;
}

// Handed to a crewmate close by (the bag's Give: { t: 'inv', a: 'give', id }): set down at their feet and taken by them
// there and then - the same pickup as one off the ground. -> error | null
export function handTo(world, p, id) {
  const ped = p.ped, prof = p.profile;
  if (!ped || ped.dead || p.custody) return 'Not right now.';
  if (ped.vehId || ped.onTrain) return 'Get out first to hand something over.';
  if (!stashable(id) || prof.weapons[id] === undefined) return 'You don\'t have that.';
  let q = null, bd = ARMS.giveR;
  for (const m of crews.matesOnline(world, p)) {
    const o = m.ped;
    if (!o || o.dead || o.vehId || o.hidden || m.custody || m.prison) continue;
    const d = Math.hypot(o.x - ped.x, o.y - ped.y);
    if (d <= bd) { bd = d; q = m; }
  }
  if (!q) return `No crewmate close enough - stand within ${Math.round(ARMS.giveR / 32)} m of one.`;
  if (noRoom(q.profile, id)) return fullWhy(`${q.name}'s`);
  const n = prof.weapons[id] || 0, name = WEAPONS[id].name;
  delete prof.weapons[id];
  if (ped.mag) delete ped.mag[id];
  if (ped.weapon === id) ped.weapon = 'fists';
  p.meDirty = true;
  const bag = dropAt(world, q.ped.x, q.ped.y, id, n, { by: p.pid, ownerName: p.name });
  bag.handed = true;
  if (!pickUp(world, q, bag)) bag.handed = false;
  world.notify(p, `You handed your ${name} to ${q.name}.`, 'good');
  world.notify(q, `${p.name} handed you a ${name}${WEAPONS[id].mag ? ` (${n} rounds)` : ''}.`, 'good');
  store.touch();
  return null;
}

// The nearest place you can open your stash: one of your homes (homes.ownedHomes) or a gun shop or a pawn shop. The
// phone's Find my weapons works the same out on the page (client/phone.js stashWay, from your homes and the map's places).
export function nearestStashPlace(world, homes, x, y) {
  let best = null, bd = Infinity;
  const consider = (q, label) => { const d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = { x: q.x, y: q.y, label }; } };
  for (const q of world.map.pois) if (q && ARMS.stashKinds.includes(q.kind)) consider(q, q.label);
  for (const h of homes || []) if (h) consider(h, h.name || 'Your home');
  return best;
}
