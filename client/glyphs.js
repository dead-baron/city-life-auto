// Device-aware button hints: the server speaks in keyboard keys ("E: Buy coffee", "press E"),
// the client shows whatever the player is actually holding: a key cap, an Xbox-style face
// button, or the label of the on-screen touch button (which also pulses).
import { input } from './input.js';

import { KEY_ACTION, PAD, TOUCH, KB } from '../shared/controls.js';

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
