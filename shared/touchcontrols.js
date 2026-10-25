import { IN } from './input.js';

// The touch controls by slots (UI-2, the overhaul the owner approved on 2026-10-24): shared/controls.js's touch half,
// loaded with the touch controls (client/touchslots.js) rather than with the page. The left 40% of the screen is the
// move stick's (it comes up where the thumb lands). On the right an arc of fixed slots - 1 FIRE (big), 2 ROLL, 3 ACT,
// 4 CAR - two context slots C1 / C2 and three small utility slots U1-U3. Each state fills them with what it needs,
// the same role always in the same slot, a button only while it does something. client/touchslots.js places them (on
// its side or upright, a short screen, the safe areas) with an icon and the label; FIRE and AIM aim by dragging them
// (client/input.js, touchAim below). An entry: [action, label, the flag it needs, { flag: the label then }].
export const TOUCH_SLOTS = ['fire', 'roll', 'act', 'car', 'c1', 'c2', 'u1', 'u2', 'u3'];
const UT = { u1: ['use', 'ITEMS', 'items'], u2: ['light', 'LIGHT', 'light'], u3: ['cruiser', 'COP CAR', 'call'] };
const AT = { act: ['action', 'ACT', 'prompt'], u1: UT.u1 };   // (in a vehicle ACT only with something to do)
const VFIRE = ['fire', 'FIRE', 'shoot'], VRELOAD = ['reload', 'RELOAD', 'armed'], HORN = ['horn', 'HORN', 0, { siren: 'SIREN' }];
export const TOUCH_STATES = {
  foot: { fire: ['fire', 'HIT'], roll: ['dive', 'ROLL'], act: ['action', 'ACT'], car: ['vehicle', 'CAR'], c1: ['block', 'BLOCK', 'guard'], ...UT },
  armed: { fire: ['fire', 'FIRE'], roll: ['dive', 'ROLL'], act: ['action', 'ACT'], car: ['vehicle', 'CAR'], c1: ['aim', 'AIM'], c2: ['reload', 'RELOAD'], ...UT },
  carry: { fire: ['throw', 'THROW'], roll: ['dive', 'ROLL'], act: ['action', 'ACT'], car: ['vehicle', 'CAR'], ...UT },
  drive: { fire: VFIRE, roll: ['dive', 'BRAKE'], car: ['vehicle', 'EXIT'], c1: HORN, c2: VRELOAD, ...AT },
  ride: { fire: VFIRE, car: ['vehicle', 'EXIT'], c2: VRELOAD, ...AT },   // (a passenger)
  air: { fire: VFIRE, car: ['vehicle', 'EXIT'], c1: ['descend', 'DOWN'], c2: ['climb', 'CLIMB'], ...AT },   // (C1 and C2 one rocker)
  boat: { fire: VFIRE, roll: ['dive', 'BRAKE'], car: ['vehicle', 'EXIT'], c1: HORN, c2: VRELOAD, ...AT },
  horse: { fire: VFIRE, roll: ['dive', 'STOP'], car: ['vehicle', 'OFF'], c1: ['sprint', 'GALLOP'], c2: VRELOAD, ...AT },
  board: { fire: ['fire', 'TRICK'], roll: ['dive', 'OLLIE'], act: ['action', 'ACT'], car: ['vehicle', 'OFF'], u1: UT.u1 },   // (no drag: the stick picks the trick)
  surf: { roll: ['dive', 'AIR'], act: ['action', 'ACT'], car: ['vehicle', 'CAR'], u1: UT.u1 },
  swim: { act: ['action', 'ACT'], car: ['vehicle', 'CAR'], u1: UT.u1 },
  home: { act: ['action', 'ACT'], u1: UT.u1, u2: UT.u2 },   // (walking round your home)
};
// what you're doing, from the page's flags: { home, air, inVeh, driver, horse, boat, surf, swim, board, carrying, armed }
export function touchState(f) {
  if (f.home) return 'home';
  if (f.air) return 'air';
  if (f.inVeh) return f.horse ? 'horse' : !f.driver ? 'ride' : f.boat ? 'boat' : 'drive';
  if (f.surf) return 'surf';
  if (f.swim) return 'swim';
  if (f.board) return 'board';
  if (f.carrying) return 'carry';
  return f.armed ? 'armed' : 'foot';
}
// the slots filled for those flags (also guard, shoot, prompt, siren, items, light, call): { state, slots: { slot: { a, label } } }
export function touchSlots(f) {
  const state = touchState(f), slots = {};
  for (const [slot, [a, label, need, alt]] of Object.entries(TOUCH_STATES[state])) {
    if (need && !f[need]) continue;
    let l = label;
    if (alt) for (const k in alt) if (f[k]) l = alt[k];
    slots[slot] = { a, label: l };
  }
  return { state, slots };
}

// The touch FIRE button (UI-2: the aim stick and its FIRE ON toggle are gone). A tap fires at the auto-target (else
// where you face); pressed and dragged it aims the way you drag and fires while held; let go and it stops. AIM (a gun
// out) does the same without firing - a gun held on a shop's clerk. t: { fire, aim (each held or tapped), drag (the
// drag's angle while dragging, else null), last, lastAt (the last drag's angle, when) }; view: { target() (the
// auto-target's angle or null), face (where you face), inVehicle, armed, lastAim }. -> { bits, aim }
// (a drag's aim stays a moment after it ends - the next tap fires the same way; at the wheel a drive-by needs an aim:
// straight ahead with nobody to aim at; nothing to aim at on foot and the server swings where you face)
export const DRAG_DEAD = 12, AIM_KEEP_MS = 700;
export function touchAim(t, view, now) {
  let bits = 0, aim = view.lastAim || 0;
  const pressed = !!(t.fire || t.aim);
  if (t.drag !== null && t.drag !== undefined) { aim = t.drag; bits |= IN.AIMING; }
  else if (now - (t.lastAt ?? -1e9) < AIM_KEEP_MS && (pressed || view.armed)) { aim = t.last; bits |= IN.AIMING; }
  else if (pressed) {
    const ta = view.target ? view.target() : null;
    if (ta !== null && ta !== undefined) { aim = ta; bits |= IN.AIMING; }
    else if (t.aim || view.inVehicle) { aim = view.face ?? aim; bits |= IN.AIMING; }
  }
  if (t.fire) bits |= IN.FIRE;
  return { bits, aim };
}
// a drag from (0, 0) to (dx, dy): its angle once it's past DRAG_DEAD px (or already dragging), else null
export function dragAngle(dx, dy, dragging) {
  return Math.hypot(dx, dy) >= (dragging ? 3 : DRAG_DEAD) ? Math.atan2(dy, dx) : null;
}
// The auto-target: the nearest person standing (not you, not your crew), in reach - within TARGET_CONE of where you
// face (face null: all round, at the wheel - not anyone in the vehicle with you), nearer the line first. ents: the
// page's entities ({ kind, id, flags, rx/ry or x/y }). -> its angle, or null
export const TARGET_CONE = 0.7;
export function pickTarget(x, y, face, ents, reach, selfId, skip) {
  let best = null, bs = Infinity;
  for (const e of ents) {
    if (e.kind !== 1 || e.id === selfId || (e.flags & 3) || (skip && skip.includes(e.id))) continue;   // (K.PED; PF.DEAD | PF.DOWN)
    const dx = (e.rx ?? e.x) - x, dy = (e.ry ?? e.y) - y, d = Math.hypot(dx, dy);
    if (!(d <= reach) || d < 2 || (face === null && (e.flags & 256) && d < 48)) continue;   // (PF.INVEH beside you: aboard)
    const a = Math.atan2(dy, dx);
    let da = 0;
    if (face !== null) { da = Math.abs(Math.atan2(Math.sin(a - face), Math.cos(a - face))); if (da > TARGET_CONE) continue; }
    const sc = d * (1 + da);
    if (sc < bs) { bs = sc; best = a; }
  }
  return best;
}
