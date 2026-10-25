// The touch controls by slots (UI-2). shared/controls.js says what each slot holds for what you're doing (TOUCH_STATES,
// touchSlots); this places them for the screen - a phone on its side or upright, a short screen, a tablet, the safe
// areas - and draws each with its icon and label. Every action has one button in index.html's #tbtns (client/input.js
// binds them, client/hud.js pulses the one the prompt names); a button shows only while a slot holds it.
// Loaded the first time the touch controls are used (client/main.js); test/hudpage.js places them the same way.
import { touchSlots, TOUCH_STATES, pickTarget } from '../shared/touchcontrols.js';
export { touchAim } from '../shared/touchcontrols.js';

// where each slot sits, at a phone's 390 px short side: its centre in from the right and up from the bottom (inside the
// safe areas) and its size; the aim stick in the corner (its red ring inside its box), the arc round it; rk is the
// CLIMB / DOWN rocker, in C1 / C2's stead. Kept clear of each other, of the left 40% (the move stick's), of the middle
// (you) and upright of the left half.
export const GEO = {
  land: { stick: [88, 88, 132], fire: [214, 74, 80], roll: [300, 46, 60], act: [200, 164, 60], car: [110, 194, 60], c1: [362, 44, 50], c2: [300, 106, 50],
    u1: [34, 192, 48], u2: [34, 246, 48], u3: [88, 252, 48], u4: [142, 252, 48], rk: [300, 74, 62, 104] },
  port: { stick: [70, 80, 116], fire: [70, 186, 76], car: [70, 256, 56], roll: [163, 47, 52], act: [163, 104, 52], c1: [163, 158, 46], c2: [163, 207, 46],
    u1: [163, 256, 46], u2: [82, 314, 48], u3: [82, 366, 48], u4: [30, 314, 48], rk: [163, 182, 52, 96] },
};
export const MIN_TAP = 44;
// every slot's box ({ x, y, w, h }, px from the top left) on a W x H screen; safe: the insets { t, r, b, l }
export function slotGeometry(W, H, safe = {}) {
  const port = H > W, G = port ? GEO.port : GEO.land;
  const R = W - (safe.r || 0), B = H - (safe.b || 0), out = {};
  const s = Math.min(1.3, Math.max(0.86, (port ? R - (safe.l || 0) : B - (safe.t || 0)) / 390));   // (by the room inside the safe areas)
  for (const [k, [dx, dy, w, h = w]] of Object.entries(G)) {
    const bw = Math.max(MIN_TAP, Math.round(w * s)), bh = Math.max(MIN_TAP, Math.round(h * s));
    out[k] = { x: Math.round(R - dx * s - bw / 2), y: Math.round(B - dy * s - bh / 2), w: bw, h: bh };
  }
  return out;
}
// the rocker's halves: CLIMB on top (C2), DOWN under it (C1)
const half = (rk, top) => ({ x: rk.x, y: top ? rk.y : rk.y + Math.round(rk.h / 2), w: rk.w, h: top ? Math.round(rk.h / 2) : rk.h - Math.round(rk.h / 2) });

// the icons (24 x 24, drawn with the button's colour)
const P = {
  fire: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
  ring: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/>',
  hit: '<path d="M7 11V7a2 2 0 0 1 4 0v3M11 10V6a2 2 0 0 1 4 0v4M15 10V8a2 2 0 0 1 4 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-6-6v-2a2 2 0 0 1 2-2h3"/>',
  throw: '<path d="M4 14h9v6H4z"/><path d="M9 10l6-6M10 4h5v5"/>',
  trick: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z"/>',
  roll: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>',
  brake: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  ollie: '<path d="M4 17c3-6 13-6 16 0"/><path d="M12 13V4M8 8l4-4 4 4"/>',
  air: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  act: '<path d="M9 11V5a2 2 0 0 1 4 0v6"/><path d="M13 9a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a2 2 0 0 1 3-2l2 2"/>',
  car: '<path d="M3 15l2-6h14l2 6v4H3z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  block: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
  reload: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>',
  horn: '<path d="M4 10v4h4l6 4V6l-6 4z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  siren: '<path d="M7 18v-6a5 5 0 0 1 10 0v6M5 18h14v3H5z"/><path d="M12 2v2M4 6l1.5 1.5M20 6l-1.5 1.5"/>',
  gallop: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  climb: '<path d="M5 15l7-7 7 7"/>',
  descend: '<path d="M5 9l7 7 7-7"/>',
  items: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M12 10v7M8.5 13.5h7"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3z"/>',
  cruiser: '<path d="M3 16l2-5h14l2 5v3H3z"/><path d="M10 11V8h4v3"/><circle cx="7.5" cy="18" r="1.3"/><circle cx="16.5" cy="18" r="1.3"/>',
};
const ICON = { HIT: 'hit', THROW: 'throw', TRICK: 'trick', BRAKE: 'brake', STOP: 'brake', OLLIE: 'ollie', AIR: 'air', EXIT: 'exit', OFF: 'exit', SIREN: 'siren', GALLOP: 'gallop' };
const ACTION_ICON = { fire: 'fire', dive: 'roll', action: 'act', vehicle: 'car', block: 'block', firetog: 'ring', reload: 'reload', horn: 'horn', climb: 'climb', descend: 'descend', use: 'items', light: 'light', cruiser: 'cruiser', throw: 'throw', sprint: 'gallop' };
export const iconOf = (a, label) => ICON[label] || ACTION_ICON[a] || 'act';
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k] || ''}</svg>`;

// the slots on the page: set(flags) each frame (cheap when nothing changed), placed again when the screen turns
// ctx (the game page's): { S, CTRL, WEAPONS, VEHICLE_BY_INDEX, PF } - for tick() and target()
export function makeSlots(root = document.getElementById('tbtns'), { win = window, ctx = null } = {}) {
  const btn = {};
  for (const b of root.querySelectorAll('[data-b]')) btn[b.dataset.b] = b;
  const touchEl = root.closest('#touch') || root.parentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const safe = () => { const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; };
  let sig = null, cur = null, geo = null;
  function layout() {
    const W = win.innerWidth, H = win.innerHeight;
    geo = slotGeometry(W, H, safe());
    // (how far in from the right the arc reaches: the job line keeps left of it - style.css)
    document.documentElement.style.setProperty('--arc-w', `${W - Math.min(...['stick', 'fire', 'roll', 'act', 'car', 'c1', 'c2'].map((k) => geo[k].x)) + 8}px`);
    // the prompt's slot (style.css #hud-low, UI-4): on its side over the arc's lowest buttons and left of the rest; upright
    // under you, left of the utility column
    const R = document.documentElement.style, X = (ks) => Math.min(...ks.map((k) => geo[k].x)), Y = (ks) => Math.min(...ks.map((k) => geo[k].y));
    if (H > W) R.setProperty('--lo-r', `${W - X(['u2', 'u3', 'u4']) + 8}px`);
    else { R.setProperty('--lo-r', `${W - X(['roll', 'c2', 'act']) + 8}px`); R.setProperty('--lo-b', `${H - Y(['c1', 'roll']) + 6}px`); R.setProperty('--lo-c', `${W - X(['c1']) + 8}px`); }   // (--lo-c: the hint strip under it, left of C1)
    if (H > W) R.setProperty('--lo-c', `${W - X(['u1', 'c1', 'c2', 'act', 'roll']) + 8}px`);   // (upright: the hint strip left of the arc, over the move stick)
    if (cur) place();
  }
  function place() {
    const shown = new Set();
    for (const [slot, { a, label: l0 }] of Object.entries(cur.slots)) {
      const b = btn[a];
      if (!b) continue;
      const label = a === 'firetog' ? `FIRE ${b.classList.contains('lit') ? 'ON' : 'OFF'}` : l0;   // (on or off: client/input.js showFireToggle)
      shown.add(a);
      const rock = cur.state === 'air' && (slot === 'c1' || slot === 'c2');
      const g = rock ? half(geo.rk, slot === 'c2') : geo[slot];
      b.dataset.slot = slot;
      if (rock) b.dataset.rk = slot === 'c2' ? 'top' : 'bot'; else delete b.dataset.rk;
      const st = b.style;
      st.left = `${g.x}px`; st.top = `${g.y}px`; st.width = `${g.w}px`; st.height = `${g.h}px`;
      if (a === 'stick') { b.dataset.lbl = label; continue; }   // (the stick keeps its ring and knob)
      if (b.dataset.lbl !== label) {
        b.dataset.lbl = label;
        b.innerHTML = `${svg(iconOf(a, label))}<span class="l">${label}</span>`;
      }
      b.setAttribute('aria-label', label);
    }
    for (const [a, b] of Object.entries(btn)) if (!shown.has(a)) { delete b.dataset.slot; b.classList.remove('on'); }
  }
  function set(f) {
    let k = '';
    for (const key in f) if (f[key]) k += key + ',';
    if (k === sig) return cur;
    sig = k; cur = touchSlots(f);
    if (!geo) layout(); else place();
    return cur;
  }
  // the controls dim while they're left alone (the view comes first), and come straight back at a touch
  let idleT = 0;
  const wake = () => { touchEl.classList.remove('idle'); clearTimeout(idleT); idleT = setTimeout(() => touchEl.classList.add('idle'), 5000); };
  win.addEventListener('touchstart', wake, { passive: true, capture: true });
  win.addEventListener('resize', () => setTimeout(layout, 30));
  win.addEventListener('orientationchange', () => setTimeout(layout, 120));
  wake();
  // the page's flags for what you're doing (in a vehicle, flying, on a board: client/main.js), each frame
  function tick(inVeh, air, board) {
    const { S, CTRL, WEAPONS, VEHICLE_BY_INDEX } = ctx, me = S.me || {}, w = WEAPONS[me.weapon] || WEAPONS.fists, b = document.body.classList;
    const cv = inVeh ? S.ents.get(S.ctrlId) : null, cd = cv && cv.d && VEHICLE_BY_INDEX[cv.d.m], pe = S.ents.get(S.myPedId), driver = S.ctrlKind === CTRL.DRIVER;
    return set({ home: !!S.homeIn, air, inVeh, driver, horse: !!(cd && cd.horse), boat: !!(cd && cd.kind === 'boat'), items: !!(me.inv && Object.values(me.inv).some((n) => n > 0)), surf: !!me.surf, swim: !!(pe && pe.swim && !inVeh), board, carrying: !!me.carrying,
      armed: w.type !== 'melee' && w.type !== 'tool', guard: !!w.guard, shoot: w.type === 'gun' || !!(cd && driver && (cd.missiles || cd.turret)), prompt: !!me.prompt, siren: !!(cd && (cd.police || cd.siren)), light: b.contains('has-light'), call: b.contains('can-call') });
  }
  // FIRE's auto-target (a tap: touchAim): the nearest person ahead in reach - at the wheel all round; none with a crate,
  // by your golf ball, on a court or a lane, fishing or on a board (the swing keeps its own aim)
  function target(veh, w) {
    const { S, WEAPONS, PF } = ctx, me = S.me, P = S.pred, mp = S.ents.get(S.myPedId);
    if (!me || !P || me.dead || me.carrying || (me.golf && me.golf.near) || me.hoops || me.bowl || (P.mods && P.mods.board) || (mp && (mp.flags & PF.FISHING))) return null;
    const wd = w || WEAPONS.fists, reach = wd.type === 'melee' ? wd.range + 34 : Math.min(420, wd.range || 360);
    return pickTarget(P.s.x, P.s.y, veh ? null : P.s.a, S.ents.values(), reach, S.myPedId, me.crew && me.crew.ids);
  }
  return { set, tick, target, layout, get state() { return cur; }, get geo() { return geo; }, states: Object.keys(TOUCH_STATES) };
}
