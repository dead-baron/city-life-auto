// Safety mode (the owner, 2026-10-11: "Safety citizen mode, warns you before stealing a car accidentally or other crimes
// to help you live a good life"). A setting (Settings, on for new characters: store.js defaultProfile; the page sends
// { t: 'safety', on }): with it on, the first press of an act the game knows is a crime before it happens - getting into
// a car that isn't yours, pulling a driver out, picking up someone else's cargo, the armored truck's back doors, a break
// from custody - only warns, naming the crime; the same act again within SAFETY_CONFIRM_S does it.
import { CRIMES } from './law.js';
import { SAFETY_CONFIRM_S } from '../../shared/rules.js';
import { store } from '../store.js';

export const on = (p) => !!(p && p.profile && p.profile.safety);

// May the act go ahead? type: the crime it would be (law.js CRIMES; none: always), key: which act (the same one pressed
// again confirms it; anything else starts over).
export function confirm(world, p, type, key) {
  if (!type || !CRIMES[type] || !on(p)) return true;
  const now = world.time, a = p.safetyArm;
  if (a && a.key === key && now <= a.until) { p.safetyArm = null; return true; }
  p.safetyArm = { key, until: now + SAFETY_CONFIRM_S };
  const c = CRIMES[type];
  // (U17: the page draws it as the shield plate, "Safety mode · Settings" under the words - client/style.css .toast.safety)
  world.notify(p, `That's ${c.label[0].toLowerCase() + c.label.slice(1)}${c.felony ? ' (a felony)' : ''} - press again to do it anyway`, 'safety');
  p.meDirty = true;
  return false;
}

export function set(p, v) { if (p && p.profile) { p.profile.safety = !!v; p.safetyArm = null; p.meDirty = true; store.touch(); } }
