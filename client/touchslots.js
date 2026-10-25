// The touch controls by slots (UI-2). shared/controls.js says what each slot holds for what you're doing (TOUCH_STATES,
// touchSlots); this places them for the screen - a phone on its side or upright, a short screen, a tablet, the safe
// areas - and draws each with its icon and label. Every action has one button in index.html's #tbtns (client/input.js
// binds them, client/hud.js pulses the one the prompt names); a button shows only while a slot holds it.
// Loaded the first time the touch controls are used (client/main.js); test/hudpage.js places them the same way.
import { touchSlots, TOUCH_STATES, pickTarget } from '../shared/touchcontrols.js';
export { touchAim } from '../shared/touchcontrols.js';

// where each slot sits, at a phone's 390 px short side: its centre in from the right and up from the bottom (inside the
// safe areas) and its size; rk is the CLIMB / DOWN rocker, in C1 / C2's stead. Kept clear of each other, of the left
// 40% (the move stick's), of the middle (you) and upright of the left half.
export const GEO = {
  land: { fire: [104, 88, 80], roll: [202, 58, 60], act: [190, 146, 60], car: [104, 184, 60], c1: [276, 48, 50], c2: [276, 102, 50], u1: [34, 70, 48], u2: [34, 130, 48], u3: [34, 190, 48], rk: [276, 75, 62, 104] },
  port: { fire: [78, 96, 80], roll: [160, 52, 60], act: [160, 132, 60], car: [84, 188, 60], c1: [160, 208, 54], c2: [84, 250, 54], u1: [28, 190, 48], u2: [28, 244, 48], u3: [28, 298, 48], rk: [84, 272, 62, 104] },
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
  aim: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',
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
const ACTION_ICON = { fire: 'fire', dive: 'roll', action: 'act', vehicle: 'car', aim: 'aim', block: 'block', reload: 'reload', horn: 'horn', climb: 'climb', descend: 'descend', use: 'items', light: 'light', cruiser: 'cruiser', throw: 'throw', sprint: 'gallop' };
export const iconOf = (a, label) => ICON[label] || ACTION_ICON[a] || 'act';
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[k] || ''}</svg>`;
const HINT_KEY = 'cla.dragHint', HINT_N = 5;   // ("DRAG TO AIM" under FIRE the first few times you're armed)

// the slots on the page: set(flags) each frame (cheap when nothing changed), placed again when the screen turns
// ctx (the game page's): { S, CTRL, WEAPONS, VEHICLE_BY_INDEX, PF } - for tick() and target()
export function makeSlots(root = document.getElementById('tbtns'), { win = window, ctx = null } = {}) {
  const btn = {};
  for (const b of root.querySelectorAll('button[data-b]')) btn[b.dataset.b] = b;
  const touchEl = root.closest('#touch') || root.parentElement;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const safe = () => { const c = getComputedStyle(probe); return { t: parseFloat(c.paddingTop) || 0, r: parseFloat(c.paddingRight) || 0, b: parseFloat(c.paddingBottom) || 0, l: parseFloat(c.paddingLeft) || 0 }; };
  let sig = null, cur = null, geo = null, hints = 0, hintT = 0;
  try { hints = Number(localStorage.getItem(HINT_KEY)) || 0; } catch { /* private mode */ }
  function layout() {
    const W = win.innerWidth, H = win.innerHeight;
    geo = slotGeometry(W, H, safe());
    // (how far in from the right the arc reaches: the job line keeps left of it - style.css)
    document.documentElement.style.setProperty('--arc-w', `${W - Math.min(...['fire', 'roll', 'act', 'car', 'c1', 'c2'].map((k) => geo[k].x)) + 8}px`);
    if (cur) place();
  }
  function place() {
    const shown = new Set();
    for (const [slot, { a, label }] of Object.entries(cur.slots)) {
      const b = btn[a];
      if (!b) continue;
      shown.add(a);
      const rock = cur.state === 'air' && (slot === 'c1' || slot === 'c2');
      const g = rock ? half(geo.rk, slot === 'c2') : geo[slot];
      b.dataset.slot = slot;
      if (rock) b.dataset.rk = slot === 'c2' ? 'top' : 'bot'; else delete b.dataset.rk;
      b.dataset.drag = cur.state === 'board' ? '0' : '1';
      const st = b.style;
      st.left = `${g.x}px`; st.top = `${g.y}px`; st.width = `${g.w}px`; st.height = `${g.h}px`;
      if (b.dataset.lbl !== label) {
        b.dataset.lbl = label;
        b.innerHTML = `${svg(iconOf(a, label))}<span class="l">${label}</span>`;
      }
      b.setAttribute('aria-label', label);
    }
    for (const [a, b] of Object.entries(btn)) if (!shown.has(a)) { delete b.dataset.slot; b.classList.remove('on'); }
  }
  // the first few times a gun comes out: how to aim, under FIRE, a few seconds
  function hint(was) {
    if (cur.state !== 'armed') { clearTimeout(hintT); btn.fire?.classList.remove('hint'); return; }
    if (was === 'armed' || hints >= HINT_N) return;
    hints++; try { localStorage.setItem(HINT_KEY, String(hints)); } catch { /* private mode */ }
    btn.fire?.classList.add('hint'); clearTimeout(hintT); hintT = setTimeout(() => btn.fire?.classList.remove('hint'), 8000);
  }
  function set(f) {
    let k = '';
    for (const key in f) if (f[key]) k += key + ',';
    if (k === sig) return cur;
    const was = cur && cur.state;
    sig = k; cur = touchSlots(f);
    if (!geo) layout(); else place();
    hint(was);
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
