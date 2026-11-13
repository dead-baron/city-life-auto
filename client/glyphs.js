// Device-aware button hints: the server speaks in keyboard keys ("E: Buy coffee", "press E"),
// the client shows whatever the player is actually holding: a key cap, an Xbox-style face
// button, or the on-screen touch button's icon (the button also pulses).
import { input } from './input.js';

import { KEY_ACTION, PAD, TOUCH, KB } from '../shared/controls.js';
import { actKind, setActKind, actWord, setActWord, faceChip } from './touchicons.js';

export function actionOfKey(k) { return KEY_ACTION[String(k).toUpperCase()] || null; }

// HTML glyph for an action on the current device: a keyboard's key and a pad's button as the prompt tiles (Kenney's
// Input Prompts Pixel 16, CC0 - assets/ui/prompts/, drawn at 2x; what has no tile - WASD, 1-9, L3 - its words on a key
// cap); on touch the button as it looks (client/touchicons.js faceChip: its color, its symbol or its word)
const KEY_TILE = new Set('E F Q R X H M P I L G T V W S A D ESC TAB SHIFT SPACE CLICK RMB MOUSE'.split(' '));
const PAD_TILE = { A: 'a', B: 'b', X: 'x', Y: 'y', LB: 'lb', RB: 'rb', LT: 'lt', RT: 'rt', 'D↑': 'du', 'D↓': 'dd', 'D←': 'dl', 'D→': 'dr', 'L-STICK': 'ls', 'R-STICK': 'rs', VIEW: 'view', MENU: 'menu' };
const TILES = new URL('../assets/ui/prompts/', import.meta.url).href;   // (beside the page wherever it's served from)
const tile = (f, name, wide) => `<span class="g-tile${wide ? ' wide' : ''}" role="img" aria-label="${name}"><img src="${TILES}${f}.png" alt="${name}"></span>`;
// a key's or a pad button's tile by its name (KB's or PAD's words), or null when the pack has none
export function promptTile(t, pad) {
  if (pad) return PAD_TILE[t] ? tile(`p-${PAD_TILE[t]}`, t) : null;
  return KEY_TILE.has(t) ? tile(`k-${t.toLowerCase()}`, t, t === 'TAB' || t === 'SHIFT') : null;
}
export function glyph(action) {
  const d = input.device;
  if (d === 'gamepad') { const [t, c] = PAD[action] || ['?', 'sys']; return promptTile(t, true) || `<span class="g-pad g-${c}">${t}</span>`; }
  if (d === 'touch') return faceChip(action, TOUCH[action] || action.toUpperCase());   // (the button as it looks)
  const k = KB[action] || action.toUpperCase();
  return promptTile(k, false) || `<span class="g-key">${k}</span>`;
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
// (the action button's: what pressing it will do, read from the words - client/touchicons.js actKind and actWord; on touch
// the button says it, ENTER, TALK, BUY..., in place of this chip)
export function formatPrompt(p) {
  const m = /^([A-Za-z]+):\s*(.*)$/.exec(p || '');
  if (!m || !actionOfKey(m[1])) { setActWord('ACT'); return { action: null, kind: setActKind('interact'), html: esc(p || ''), words: p || '' }; }
  const action = actionOfKey(m[1]), kind = setActKind(action === 'action' ? actKind(m[2]) : 'interact');
  setActWord(action === 'action' ? actWord(m[2]) : 'ACT');
  return { action, kind, html: `${glyph(action)} <span>${esc(m[2])}</span>`, words: m[2] };
}

// rewrite "press E" / "(E)" style hints inside server notifications for the current device
export function localizeText(t) {
  return String(t)
    .replace(/\bpress(ing)? ([EFQRXHML])\b/gi, (s, ing, k) => `${s.slice(0, ing ? 8 : 5)} ${keyName(actionOfKey(k))}`)
    .replace(/\bPress ` \(or DEV\)/g, input.device === 'keyboard' ? 'Press ` (or DEV)' : 'Tap DEV');
}
