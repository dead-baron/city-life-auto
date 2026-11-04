// The touch controls by slots (UI-2). shared/controls.js says what each slot holds for what you're doing (TOUCH_STATES,
// touchSlots); this places them for the screen - a phone on its side or upright, a short screen, a tablet, the safe
// areas - and draws each with its icon and label. Every action has one button in index.html's #tbtns (client/input.js
// binds them, client/hud.js pulses the one the prompt names); a button shows only while a slot holds it.
// Loaded the first time the touch controls are used (client/main.js); test/hudpage.js places them the same way.
import { touchSlots, TOUCH_STATES, pickTarget } from '../shared/touchcontrols.js';
export { touchAim } from '../shared/touchcontrols.js';
import { iconOf, svg } from './touchicons.js';   // (the icons: the hint strips draw the same ones)
export { iconOf } from './touchicons.js';

// where each slot sits, at a phone's 390 px short side: its centre in from the right and up from the bottom (inside the
// safe areas) and its size (the owner, 11-03: "cleaner, more consistent" - two sizes, on tidy arcs round the aim stick,
// the way mobile shooters lay them out). The aim stick stays where and how big it was. On its side: FIRE and ACT (72)
// on the inner arc round the stick, ROLL, CAR, C1 and C2 (52) on the outer one - its middle left out where it would
// cross the middle of the screen - the weapon card over the stick, and the switches (FIRE ON, COP CAR, LIGHT, ITEMS) in
// a row along the top of it, under the HUD's plate and buttons (the stars and the vehicle's readout move left of the
// row: style.css). Upright the same groups climb in two columns over the stick (the left half is the move stick's, the
// middle the view's). Kept clear of each other, of the left 40%, of the middle (you) and inside the safe areas
// (test/touchslots.test.js; the HUD: test/hudlayout.test.js). wp, the weapon button (UI-6): the HUD's weapon plate as a card.
export const GEO = {
  land: { stick: [88, 88, 132], fire: [202, 88, 72], act: [167, 167, 72], roll: [263, 38, 52], car: [271, 104, 52], c1: [203, 228, 52], c2: [143, 241, 52],
    wp: [70, 206, 76, 52], u4: [32, 300, 52], u3: [92, 300, 52], u2: [152, 300, 52], u1: [212, 300, 52] },
  port: { stick: [70, 80, 116], fire: [142, 164, 72], act: [66, 190, 72], roll: [157, 244, 52], car: [82, 262, 52], c1: [95, 321, 52], c2: [34, 321, 52],
    wp: [63, 382, 76, 52], u4: [34, 443, 52], u3: [95, 443, 52], u2: [34, 504, 52], u1: [95, 504, 52] },
};
export const MIN_TAP = 48;   // (the smallest a button gets: on a 360-px phone a 52 is 48 - the room the cluster has, the middle kept clear)
export const LONG_MS = 450;        // (a long press: the button's name in a tip)
export const NEAR_CAR_PX = 140;    // (how near a vehicle has to be for CAR to show on foot: a little past where you can get in)
// what each button is called in its tip (its slot's label otherwise)
export const BUTTON_NAME = { HIT: 'Hit', FIRE: 'Fire', ROLL: 'Dive roll', ACT: 'Act', CAR: 'Get in', EXIT: 'Get out', OFF: 'Get off', BLOCK: 'Block', RELOAD: 'Reload', ITEMS: 'Items',
  LIGHT: 'Light', 'COP CAR': 'Call a cruiser', 'FIRE ON': 'Auto-fire: on', 'FIRE OFF': 'Auto-fire: off', HORN: 'Horn', SIREN: 'Siren', BRAKE: 'Brake', STOP: 'Stop', GALLOP: 'Gallop',
  CLIMB: 'Climb', DOWN: 'Descend', THROW: 'Throw', TRICK: 'Trick', OLLIE: 'Ollie', AIR: 'Air' };
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
    // the prompt's slot (style.css #hud-low, UI-4): on its side left of the whole arc, its foot level with ROLL's top (--u-l:
    // the stars and the vehicle's readout keep left of the switches' row); upright
    // under you, left of the utility column
    const R = document.documentElement.style, X = (ks) => Math.min(...ks.map((k) => geo[k].x)), Y = (ks) => Math.min(...ks.map((k) => geo[k].y));
    if (H > W) R.setProperty('--lo-r', `${W - X(['u2', 'u3', 'u4']) + 8}px`);
    else { R.setProperty('--lo-r', `${W - X(['roll', 'car', 'c1', 'c2', 'act']) + 8}px`); R.setProperty('--lo-b', `${H - Y(['roll']) + 6}px`); R.setProperty('--u-l', `${W - X(['u1', 'u2', 'u3', 'u4']) + 8}px`); R.setProperty('--lo-c', `${W - X(['c1']) + 8}px`); }   // (--lo-c: the hint strip under it, left of C1)
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
      const g = geo[slot];   // (in the air CLIMB and DOWN: two discs in C2 and C1, an arrow each - one container for every button)
      b.dataset.slot = slot;
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
  // a long press on a button says its name (the owner, 11-03: no words on the buttons, but learnable): a small tip
  // over it after LONG_MS while the finger stays, gone as it lifts - the press itself does what it always did
  const tip = document.createElement('div');
  tip.id = 'tbtip'; tip.className = 'hidden'; tip.setAttribute('role', 'tooltip');
  touchEl.appendChild(tip);
  let tipT = 0;
  const tipOff = () => { clearTimeout(tipT); tip.classList.add('hidden'); };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button[data-slot]');
    if (!b) return;
    clearTimeout(tipT);
    tipT = setTimeout(() => {
      const r = b.getBoundingClientRect(), n = BUTTON_NAME[b.dataset.lbl] || b.dataset.lbl || '';
      if (!n) return;
      tip.textContent = n; tip.classList.remove('hidden');
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(8, Math.min(win.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2))}px`;
      tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
    }, LONG_MS);
  }, { passive: true });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(ev, tipOff, { passive: true });
  win.addEventListener('touchend', tipOff, { passive: true });
  // a vehicle near enough to get in (on foot CAR shows only then): looked for a few times a second
  let nearAt = 0, near = false;
  function nearCar(S, pe) {
    const now = performance.now();
    if (now - nearAt < 250) return near;
    nearAt = now; near = false;
    const P = S.pred && S.pred.s ? S.pred.s : pe && pe.buf && pe.buf.length ? pe.buf[pe.buf.length - 1] : null;
    if (!P) return near;
    for (const e of S.ents.values()) {
      if (e.kind !== 2 || !e.buf || !e.buf.length) continue;   // (K.VEH: a car, a boat, a horse, a bike - where the server last had it)
      const q = e.buf[e.buf.length - 1], dx = q.x - P.x, dy = q.y - P.y;
      if (dx * dx + dy * dy < NEAR_CAR_PX * NEAR_CAR_PX) { near = true; break; }
    }
    return near;
  }
  // the page's flags for what you're doing (in a vehicle, flying, on a board: client/main.js), each frame
  function tick(inVeh, air, board) {
    const { S, CTRL, WEAPONS, VEHICLE_BY_INDEX } = ctx, me = S.me || {}, w = WEAPONS[me.weapon] || WEAPONS.fists, b = document.body.classList;
    const wq = btn.nextw ? btn.nextw.classList : b, cv = inVeh ? S.ents.get(S.ctrlId) : null, cd = cv && cv.d && VEHICLE_BY_INDEX[cv.d.m], pe = S.ents.get(S.myPedId), driver = S.ctrlKind === CTRL.DRIVER;
    return set({ home: !!S.homeIn, fish: !!me.fishing, air, inVeh, driver, horse: !!(cd && cd.horse), boat: !!(cd && cd.kind === 'boat'), items: !!(me.inv && Object.values(me.inv).some((n) => n > 0)), surf: !!me.surf, swim: !!(pe && pe.swim && !inVeh), board, carrying: !!me.carrying,
      armed: w.type !== 'melee' && w.type !== 'tool', guard: !!w.guard, shoot: w.type === 'gun' || !!(cd && driver && (cd.missiles || cd.turret)), prompt: !!me.prompt, siren: !!(cd && (cd.police || cd.siren)), light: b.contains('has-light'), call: b.contains('can-call'),
      wpn: !me.dead && !wq.contains('none') && (!inVeh || wq.contains('gun')), near: !inVeh && nearCar(S, pe) });   // (client/hudinfo.js: the plate's none and gun)
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
