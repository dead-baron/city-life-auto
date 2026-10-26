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
// (you) and upright of the left half. wp, the weapon button (UI-6): above CAR upright, above ACT on its side - by the
// right thumb, the utilities upright one row higher for it.
export const GEO = {
  land: { stick: [88, 88, 132], fire: [214, 74, 80], roll: [300, 46, 60], act: [200, 164, 60], car: [110, 194, 60], c1: [362, 44, 50], c2: [300, 106, 50],
    u1: [34, 192, 48], u2: [34, 246, 48], u3: [88, 252, 48], u4: [140, 252, 48], rk: [300, 74, 62, 104], wp: [196, 228, 60, 52] },
  port: { stick: [70, 80, 116], fire: [70, 186, 76], car: [70, 256, 56], roll: [163, 47, 52], act: [163, 104, 52], c1: [163, 158, 46], c2: [163, 207, 46],
    u1: [163, 256, 46], u2: [82, 378, 48], u3: [82, 430, 48], u4: [30, 378, 48], rk: [163, 182, 52, 96], wp: [70, 318, 72, 56] },
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

// the icons (UI-5, the owner 2026-10-26: "the hands don't look very good as part of the UI buttons"): plain line glyphs
// on a 24 x 24 grid in the button's colour, one stroke weight on every button whatever its size (style.css: 2 px, a
// non-scaling stroke), round ends, no hands - ACT a button pressed, HIT an impact, the FIRE ON toggle the stick's ring;
// a dot is a zero-length line ("h.01")
const P = {
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
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k] || ''}</svg>`;

// the slots on the page: set(flags) each frame (cheap when nothing changed), placed again when the screen turns
// ctx (the game page's): { S, CTRL, WEAPONS, VEHICLE_BY_INDEX, PF } - for tick() and target()
export function makeSlots(root = document.getElementById('tbtns'), { win = window, ctx = null } = {}) {
  const btn = {};
  for (const b of root.querySelectorAll('[data-b]')) btn[b.dataset.b] = b;
  const wpe = document.getElementById('weapon');   // (the HUD's weapon plate is the weapon button: style.css places it by --sx/y/w/h)
  if (wpe) btn.nextw = wpe;
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
      if (a === 'nextw') { for (const k of 'xywh') st.setProperty('--s' + k, g[k] + 'px'); b.dataset.lbl = label; continue; }
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
    const wq = btn.nextw ? btn.nextw.classList : b, cv = inVeh ? S.ents.get(S.ctrlId) : null, cd = cv && cv.d && VEHICLE_BY_INDEX[cv.d.m], pe = S.ents.get(S.myPedId), driver = S.ctrlKind === CTRL.DRIVER;
    return set({ home: !!S.homeIn, air, inVeh, driver, horse: !!(cd && cd.horse), boat: !!(cd && cd.kind === 'boat'), items: !!(me.inv && Object.values(me.inv).some((n) => n > 0)), surf: !!me.surf, swim: !!(pe && pe.swim && !inVeh), board, carrying: !!me.carrying,
      armed: w.type !== 'melee' && w.type !== 'tool', guard: !!w.guard, shoot: w.type === 'gun' || !!(cd && driver && (cd.missiles || cd.turret)), prompt: !!me.prompt, siren: !!(cd && (cd.police || cd.siren)), light: b.contains('has-light'), call: b.contains('can-call'),
      wpn: !me.dead && !wq.contains('none') && (!inVeh || wq.contains('gun')) });   // (client/hudinfo.js: the plate's none and gun)
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
