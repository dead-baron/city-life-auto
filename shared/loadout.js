// What you carry, by slot (the owner, 2026-11-03 and 11-14; numbers: shared/rules.js ARMS) - shared so the server's rules
// (server/systems/arms.js: what can be lost, what takes a slot) and the page's Inventory and quick keys (client/bag.js,
// client/main.js) read the same slots.
//   atRisk(id)   can it be lost (and does it take a slot): every gun, bow, launcher and grenade, anything illegal, a melee
//                weapon or tool dearer than ARMS.keepMax; never fists, police issue or the cheap legal tools
//   classOf(id)  'gun' | 'melee' | 'throw' for what takes a slot, else null
//   loadout(ids, weapon?)  the Inventory's four slots in order - Gun 1, Gun 2, Melee, Thrown - each a weapon id or null:
//                the guns and throwables that take a slot; the melee slot the at-risk blade, else the first cheap melee
//                weapon you have (a bat, a knife). The quick keys 1-4 take these out (client/main.js quickKey).
import { WEAPONS, SHOPS, weaponOrder } from './items.js';
import { ARMS } from './rules.js';

let PRICE = null;
// a weapon's lowest price at any counter (null: sold at none - the plasma blade, the dev tools)
export function shopPrice(id) {
  if (!PRICE) {
    PRICE = {};
    for (const s of Object.values(SHOPS)) for (const o of s.buy || []) if (o.kind === 'weapon' && o.price > 0) PRICE[o.id] = Math.min(PRICE[o.id] ?? Infinity, o.price);
  }
  return PRICE[id] ?? null;
}
const DEPT = new Set(['taser', 'baton']);   // (the department's, with the police: server law.js DEPT_GEAR)
export const issued = (w) => !!w.police || DEPT.has(w.id) || !!w.dev;
export function atRisk(id) {
  const w = WEAPONS[id];
  if (!w || id === 'fists' || issued(w)) return false;
  if (w.illegal) return true;
  if (w.type === 'melee' || w.type === 'tool' || w.type === 'spray') { const pr = shopPrice(id); return pr === null || pr > ARMS.keepMax; }
  return true;
}
export function classOf(id) {
  if (!atRisk(id)) return null;
  const t = WEAPONS[id].type;
  return t === 'grenade' ? 'throw' : t === 'melee' || t === 'tool' || t === 'spray' ? 'melee' : 'gun';
}
export const SLOT_NAMES = ['GUN 1', 'GUN 2', 'MELEE', 'THROWN'];
export function loadout(ids) {
  const o = weaponOrder((ids || []).filter((id) => id !== 'fists'));
  const guns = o.filter((id) => classOf(id) === 'gun'), thr = o.filter((id) => classOf(id) === 'throw' || (!classOf(id) && WEAPONS[id].type === 'grenade'));
  const mel = o.find((id) => classOf(id) === 'melee') || o.find((id) => WEAPONS[id].type === 'melee');
  return [guns[0] || null, guns[1] || null, mel || null, thr[0] || null];
}
