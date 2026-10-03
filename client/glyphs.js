// Device-aware button hints: the server speaks in keyboard keys ("E: Buy coffee", "press E"),
// the client shows whatever the player is actually holding: a key cap, an Xbox-style face
// button, or the label of the on-screen touch button (which also pulses).
import { input } from './input.js';

// keyboard key -> logical action
const KEY_ACTION = { E: 'action', F: 'vehicle', Q: 'throw', R: 'reload', X: 'use', H: 'horn', SPACE: 'dive', TAB: 'nextw', M: 'map', CLICK: 'fire', SHIFT: 'sprint' };

const PAD = {
  action: ['B', 'b'], vehicle: ['X', 'x'], throw: ['Y', 'y'], dive: ['A', 'a'], reload: ['R3', 'stick'], use: ['VIEW', 'sys'],
  horn: ['D↑', 'sys'], nextw: ['RB', 'bumper'], map: ['MENU', 'sys'], fire: ['RT', 'bumper'], sprint: ['LT', 'bumper'],
};
const TOUCH = { action: 'ACT', vehicle: 'CAR', throw: 'THROW', dive: 'ROLL', reload: 'RELOAD', use: 'HEAL', horn: 'HORN', nextw: 'WPN', map: 'MAP', fire: 'FIRE', sprint: 'SPRINT' };
const KB = { action: 'E', vehicle: 'F', throw: 'Q', dive: 'SPACE', reload: 'R', use: 'X', horn: 'H', nextw: 'TAB', map: 'M', fire: 'CLICK', sprint: 'SHIFT' };

export function actionOfKey(k) { return KEY_ACTION[String(k).toUpperCase()] || null; }

// HTML glyph for an action on the current device
export function glyph(action) {
  const d = input.device;
  if (d === 'gamepad') { const [t, c] = PAD[action] || ['?', 'sys']; return `<span class="g-pad g-${c}">${t}</span>`; }
  if (d === 'touch') return `<span class="g-touch">${TOUCH[action] || action.toUpperCase()}</span>`;
  return `<span class="g-key">${KB[action] || action.toUpperCase()}</span>`;
}
// plain-text name (for toasts)
export function keyName(action) {
  const d = input.device;
  if (d === 'gamepad') return (PAD[action] || ['?'])[0];
  if (d === 'touch') return TOUCH[action] || action.toUpperCase();
  return KB[action] || action.toUpperCase();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// "E: Enter St. Neon General" -> { action: 'action', html: '<glyph> Enter St. Neon General' }
export function formatPrompt(p) {
  const m = /^([A-Za-z]+):\s*(.*)$/.exec(p || '');
  if (!m || !actionOfKey(m[1])) return { action: null, html: esc(p || '') };
  const action = actionOfKey(m[1]);
  return { action, html: `${glyph(action)} <span>${esc(m[2])}</span>` };
}

// rewrite "press E" / "(E)" style hints inside server notifications for the current device
export function localizeText(t) {
  return String(t)
    .replace(/\bpress(ing)? ([EFQRXHM])\b/gi, (s, ing, k) => `${s.slice(0, ing ? 8 : 5)} ${keyName(actionOfKey(k))}`)
    .replace(/\bPress ` \(or DEV\)/g, input.device === 'keyboard' ? 'Press ` (or DEV)' : 'Tap DEV');
}
