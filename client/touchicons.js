// The touch controls' icons (UI-5, redrawn as one set; UI-8: the buttons show only these - their words are the hint
// strips' and the buttons' aria-labels). client/touchslots.js draws the buttons with them; client/hudinfo.js the first-time
// hint strips, so a strip shows the very icon the button has.
// the icons (UI-5, the owner 2026-10-26: "the hands don't look very good as part of the UI buttons"): plain line glyphs
// on a 24 x 24 grid in the button's colour, one stroke weight on every button whatever its size (style.css: 2 px, a
// non-scaling stroke), round ends, no hands - ACT a button pressed, HIT an impact, the FIRE ON toggle the stick's ring;
// a dot is a zero-length line ("h.01")
export const P = {
  fire: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M12 12h.01"/>',
  ring: '<circle cx="12" cy="12" r="9" stroke-dasharray="3.2 2.4"/><circle cx="12" cy="12" r="4"/>',
  hit: '<path d="M13.6 2.6l1.6 5 3.8.6-1.6 3.5 2.9 3.8-4.7.5-1.5 3.5-3-2.2-4.5 2.3.7-5-3.5-2.2L7 9.9 6 5.3l4.5 1.5z"/>',
  throw: '<circle cx="6" cy="18" r="2.5"/><path d="M8 16c2.5-5 6-8 11-9"/><path d="M15.5 4l3.5 3-3 3.5"/>',
  trick: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
  roll: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 3.5v4h-4"/>',
  brake: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  ollie: '<path d="M3.5 16h17M7 19.5h.01M17 19.5h.01"/><path d="M12 12.5V4M8.5 7.5L12 4l3.5 3.5"/>',
  air: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  act: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 12h.01"/>',
  car: '<path d="M5.5 11l1.5-4a2 2 0 0 1 1.9-1.3h6.2a2 2 0 0 1 1.9 1.3l1.5 4"/><rect x="3.5" y="11" width="17" height="6" rx="2"/><path d="M6.5 17v2.5M17.5 17v2.5M7.5 14h.01M16.5 14h.01"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  block: '<path d="M12 3l7 2.8v5.7c0 4.4-3 7.6-7 9.5-4-1.9-7-5.1-7-9.5V5.8z"/>',
  reload: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  horn: '<path d="M4 10v4h4l6 4V6l-6 4z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 18h14v3H5z"/><path d="M12 2.5v2M4.5 6l1.5 1.5M19.5 6L18 7.5"/>',
  gallop: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  climb: '<path d="M5 15l7-7 7 7"/>',
  descend: '<path d="M5 9l7 7 7-7"/>',
  items: '<path d="M5 8.5h14l-1.2 11.5H6.2z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z"/>',
  cruiser: '<path d="M5.5 12.5l1.4-3.6a2 2 0 0 1 1.9-1.3h6.4a2 2 0 0 1 1.9 1.3l1.4 3.6"/><rect x="3.5" y="12.5" width="17" height="5.5" rx="2"/><path d="M6.5 18v2M17.5 18v2M9.5 4h5"/>',
};
const ICON = { HIT: 'hit', THROW: 'throw', TRICK: 'trick', BRAKE: 'brake', STOP: 'brake', OLLIE: 'ollie', AIR: 'air', EXIT: 'exit', OFF: 'exit', SIREN: 'siren', GALLOP: 'gallop' };
const ACTION_ICON = { fire: 'fire', dive: 'roll', action: 'act', vehicle: 'car', block: 'block', firetog: 'ring', reload: 'reload', horn: 'horn', climb: 'climb', descend: 'descend', use: 'items', light: 'light', cruiser: 'cruiser', throw: 'throw', sprint: 'gallop' };
export const iconOf = (a, label) => ICON[label] || ACTION_ICON[a] || 'act';
export const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k] || ''}</svg>`;
