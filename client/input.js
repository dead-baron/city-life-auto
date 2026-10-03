// Unified twin-stick input: keyboard + mouse, Xbox-standard gamepad and mobile touch all collapse
// into one action state { bits, mx, my, aim } (GDD §13).
//
//   move  : WASD / arrows · left stick · floating left thumb-stick   (analog: how far = how fast)
//   aim   : mouse cursor  · right stick · right thumb-stick          (independent of movement)
//   fire  : left click    · RT          · FIRE button, or push the aim stick into its outer ring
//
// Driving uses the same move vector: point where you want to go (shared/physics.js driveInput).
import { IN } from '../shared/input.js';

const keys = new Set();
const mouse = { x: 0, y: 0, down: false, rdown: false, clicked: false, movedAt: -1e9, wheel: 0 };
const touch = {
  lx: 0, ly: 0, rx: 0, ry: 0, rOn: false, firing: false, aimAt: -1e9, aim: 0,
  btn: new Set(), tapped: new Set(),
};
const pressedOnce = new Set();
const tappedKeys = new Set(); // keys pressed since the last sample (so quick taps are never missed)
let pad = null;
let numberPick = null;
let walkToggle = false;

export const input = {
  device: 'keyboard', // 'keyboard' | 'gamepad' | 'touch' - drives button glyphs and help text
  usingTouch: false, usingPad: false, menuNav: 0, menuSelect: false, menuBack: false, padStart: false,
  onDevice: null,
};

// ---- player settings (per browser) ----------------------------------------------------------
export const settings = { kbDrive: 'direction', touchEdgeFire: true, padStickFire: false, vibrate: true };
try { Object.assign(settings, JSON.parse(localStorage.getItem('cla.settings') || '{}')); } catch { /* private mode */ }
export function saveSettings() { try { localStorage.setItem('cla.settings', JSON.stringify(settings)); } catch { /* ignore */ } }

function setDevice(d) {
  if (input.device === d) return;
  input.device = d;
  input.usingTouch = d === 'touch';
  input.usingPad = d === 'gamepad';
  document.body.classList.toggle('touch', d === 'touch');
  document.body.classList.toggle('pad', d === 'gamepad');
  document.body.classList.toggle('kbm', d === 'keyboard');
  input.onDevice?.(d);
}

// Touch-first devices start in touch mode before the first tap, so the title screen already
// shows the on-screen controls instead of keyboard shortcuts.
export function detectDevice() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const fine = typeof matchMedia === 'function' && matchMedia('(any-pointer: fine)').matches;
  if (coarse && !fine) setDevice('touch'); else { input.device = ''; setDevice('keyboard'); }
  return input.device;
}

export function initInput(canvas, hooks) {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (!keys.has(k)) { pressedOnce.add(k); tappedKeys.add(k); }
    keys.add(k);
    if (k === 'Tab' || k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    if (/^Digit[1-9]$/.test(k)) numberPick = Number(k.slice(5)) - 1;
    if (k === 'KeyC') walkToggle = !walkToggle;
    hooks.onKey?.(k);
    setDevice('keyboard');
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; mouse.rdown = false; });
  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.movedAt = performance.now(); if (!e.sourceCapabilities || !e.sourceCapabilities.firesTouchEvents) setDevice('keyboard'); });
  canvas.addEventListener('mousedown', (e) => {
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
    if (e.button === 2) mouse.rdown = true;
    mouse.movedAt = performance.now();
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; if (e.button === 2) mouse.rdown = false; });
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('gamepadconnected', () => setDevice('gamepad'));
  initTouch(hooks);
}

// ---- touch: floating left stick, fixed aim stick with a fire ring, contextual buttons ----------
function initTouch(hooks) {
  addEventListener('touchstart', () => setDevice('touch'), { passive: true, capture: true });
  const zone = document.getElementById('zone-l');
  const stickL = document.getElementById('stick-l');
  floatingStick(zone, stickL, (x, y) => { touch.lx = x; touch.ly = y; });
  const stickR = document.getElementById('stick-r');
  fixedStick(stickR, (x, y, on) => {
    touch.rx = x; touch.ry = y; touch.rOn = on;
    const m = Math.hypot(x, y);
    if (on && m > 0.2) { touch.aim = Math.atan2(y, x); touch.aimAt = performance.now(); }
    const was = touch.firing;
    touch.firing = on && settings.touchEdgeFire && (touch.firing ? m > 0.8 : m > 0.92);
    if (touch.firing && !was && settings.vibrate && navigator.vibrate) navigator.vibrate(12);
    stickR.classList.toggle('firing', touch.firing);
    stickR.classList.toggle('aiming', on && m > 0.2);
  });
  for (const b of document.querySelectorAll('#tbtns [data-b]')) {
    const name = b.dataset.b;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (name === 'dev') { hooks.onDev?.(); return; }
      if (name === 'map') { hooks.onMap?.(); return; }
      if (name === 'settings') { hooks.onSettings?.(); return; }
      if (name === 'fullscreen') { hooks.onFullscreen?.(); return; }
      touch.btn.add(name); touch.tapped.add(name); b.classList.add('on');
      if (settings.vibrate && navigator.vibrate) navigator.vibrate(6);
    };
    const up = (e) => { e.preventDefault(); touch.btn.delete(name); b.classList.remove('on'); };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    b.addEventListener('mousedown', down);
    b.addEventListener('mouseup', up);
    b.addEventListener('mouseleave', up);
  }
}

// Left stick appears wherever the thumb lands in the left zone (no hunting for a fixed pad).
function floatingStick(zone, el, cb) {
  const knob = el.querySelector('.knob');
  let id = null, cx = 0, cy = 0;
  const R = 58;
  const move = (t) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { // drag the base along so the stick never "runs out"
      cx += (dx / d) * (d - R); cy += (dy / d) * (d - R);
      dx = (dx / d) * R; dy = (dy / d) * R;
      place();
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    cb(dx / R, dy / R);
  };
  const place = () => { el.style.left = `${cx}px`; el.style.top = `${cy}px`; };
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (id !== null) return;
    const t = e.changedTouches[0];
    id = t.identifier; cx = t.clientX; cy = t.clientY;
    place(); el.classList.add('active');
    move(t);
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === id) move(t);
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) {
      id = null; knob.style.transform = ''; el.classList.remove('active'); el.style.left = ''; el.style.top = ''; cb(0, 0);
    }
  };
  zone.addEventListener('touchend', end);
  zone.addEventListener('touchcancel', end);
}

function fixedStick(el, cb) {
  const knob = el.querySelector('.knob');
  let id = null, cx = 0, cy = 0;
  const move = (t) => {
    const R = el.clientWidth / 2 - 6;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    cb(dx / R, dy / R, true);
  };
  el.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    id = t.identifier;
    const r = el.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(t);
  }, { passive: false });
  el.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === id) move(t);
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) { id = null; knob.style.transform = ''; cb(0, 0, false); }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

// ---- gamepad ---------------------------------------------------------------------------------
// radial dead zone keeps the analog magnitude smooth (walk <-> run) instead of per-axis snapping
function radial(x, y, d) {
  const m = Math.hypot(x, y);
  if (m < d) return [0, 0];
  const k = Math.min(1, (m - d) / (1 - d)) / m;
  return [x * k, y * k];
}
let padPrev = [];
let padAimUntil = 0, padAim = 0;

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  pad = null;
  for (const p of pads) if (p && p.connected) { pad = p; break; }
  if (!pad) return null;
  const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
  const now = pad.buttons.map((x) => x.pressed);
  const edge = (i) => now[i] && !padPrev[i];
  const [lx, ly] = radial(pad.axes[0] || 0, pad.axes[1] || 0, 0.16);
  const [rx, ry] = radial(pad.axes[2] || 0, pad.axes[3] || 0, 0.22);
  const out = {
    lx, ly, rx, ry,
    a: b(0), bb: b(1), x: b(2), y: b(3), lb: edge(4), rb: edge(5), lt: v(6), rt: v(7), back: b(8), start: edge(9), l3: b(10), r3: edge(11),
    up: b(12), dUpEdge: edge(12), dDownEdge: edge(13), aEdge: edge(0), bEdge: edge(1),
  };
  if (now.some((x) => x) || Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0) setDevice('gamepad');
  padPrev = now;
  return out;
}

// Build the action state for this tick.
// view: { selfScreen: {x,y}, inVehicle, armed (gun equipped), lastAim }
export function sample(view) {
  let bits = 0, mx = 0, my = 0, aim = view.lastAim || 0;
  const k = (c) => keys.has(c) || tappedKeys.has(c);
  if (k('KeyW') || k('ArrowUp')) my -= 1;
  if (k('KeyS') || k('ArrowDown')) my += 1;
  if (k('KeyA') || k('ArrowLeft')) mx -= 1;
  if (k('KeyD') || k('ArrowRight')) mx += 1;
  if (mx || my) {
    const l = Math.hypot(mx, my);
    const mag = (walkToggle || k('ControlLeft') || k('AltLeft')) && !view.inVehicle ? 0.55 : 1;
    mx = (mx / l) * mag; my = (my / l) * mag;
  }
  if (view.inVehicle && settings.kbDrive === 'tank' && input.device === 'keyboard') bits |= IN.TANK;
  if (k('ShiftLeft') || k('ShiftRight')) bits |= IN.SPRINT;
  if (k('Space')) bits |= IN.DIVE;
  if (k('KeyE')) bits |= IN.ACTION;
  if (k('KeyF') || k('Enter')) bits |= IN.VEHICLE;
  if (k('KeyQ')) bits |= IN.THROW;
  if (k('KeyR')) bits |= IN.RELOAD;
  if (k('KeyH')) bits |= IN.HORN;
  if (k('KeyX')) bits |= IN.USE;
  if (pressedOnce.has('Tab')) bits |= IN.NEXTW;
  if (mouse.wheel > 0) bits |= IN.NEXTW;
  if (mouse.wheel < 0) bits |= IN.PREVW;
  mouse.wheel = 0;
  pressedOnce.clear();
  tappedKeys.clear();

  // mouse: the cursor is the aim. With a gun out you always face the cursor (twin-stick);
  // unarmed / melee you face where you walk and turn to the cursor only to hit or when
  // holding the right button.
  if (input.device === 'keyboard' && view.selfScreen) {
    const mouseRecent = performance.now() - mouse.movedAt < 8000;
    const cursorAim = Math.atan2(mouse.y - view.selfScreen.y, mouse.x - view.selfScreen.x);
    if ((view.armed && mouseRecent) || mouse.down || mouse.clicked || mouse.rdown) { aim = cursorAim; bits |= IN.AIMING; }
    if (mouse.down || mouse.clicked) bits |= IN.FIRE;
  }
  mouse.clicked = false;

  const p = readPad();
  input.menuNav = 0; input.menuSelect = false; input.menuBack = false; input.padStart = false;
  if (p) {
    if (p.dUpEdge) input.menuNav = -1;
    if (p.dDownEdge) input.menuNav = 1;
    if (p.aEdge) input.menuSelect = true;
    if (p.bEdge) input.menuBack = true;
    if (p.start) input.padStart = true;
    if (Math.abs(p.lx) + Math.abs(p.ly) > 0) { mx = p.lx; my = p.ly; }
    if (p.a) bits |= IN.DIVE;
    if (p.bb) bits |= IN.ACTION;
    if (p.x) bits |= IN.VEHICLE;
    if (p.y) bits |= IN.THROW;
    if (p.lb) bits |= IN.PREVW;
    if (p.rb) bits |= IN.NEXTW;
    if (p.r3) bits |= IN.RELOAD;
    if (p.back) bits |= IN.USE;
    if (p.up) bits |= IN.HORN;
    if (view.inVehicle) { if (p.lt > 0.4) bits |= IN.DIVE; } // LT = handbrake when driving
    else if (p.l3 || p.lt > 0.4) bits |= IN.SPRINT;
    const rmag = Math.hypot(p.rx, p.ry);
    if (rmag > 0.15) { padAim = Math.atan2(p.ry, p.rx); padAimUntil = performance.now() + 450; }
    if (performance.now() < padAimUntil) { aim = padAim; bits |= IN.AIMING; }
    if (p.rt > 0.35) { bits |= IN.FIRE; if (!(bits & IN.AIMING) && view.armed) { bits |= IN.AIMING; aim = view.lastAim || 0; } }
    if (settings.padStickFire && rmag > 0.9) bits |= IN.FIRE;
  }

  if (input.device === 'touch') {
    if (Math.abs(touch.lx) + Math.abs(touch.ly) > 0.04) { mx = touch.lx; my = touch.ly; }
    const held = touch.rOn && Math.hypot(touch.rx, touch.ry) > 0.2;
    const recent = performance.now() - touch.aimAt < 1200; // aim lingers so the FIRE button uses it
    if (held || (recent && (view.armed || touch.btn.has('fire')))) { aim = touch.aim; bits |= IN.AIMING; }
    if (touch.firing || touch.btn.has('fire') || touch.tapped.has('fire')) bits |= IN.FIRE;
    const tb = touch.btn, tt = touch.tapped;
    if (tb.has('sprint')) bits |= IN.SPRINT;
    if (tb.has('dive') || tt.has('dive')) bits |= IN.DIVE;
    if (tb.has('action') || tt.has('action')) bits |= IN.ACTION;
    if (tb.has('vehicle') || tt.has('vehicle')) bits |= IN.VEHICLE;
    if (tb.has('throw') || tt.has('throw')) bits |= IN.THROW;
    if (tb.has('use') || tt.has('use')) bits |= IN.USE;
    if (tt.has('nextw')) bits |= IN.NEXTW;
    if (tt.has('reload')) bits |= IN.RELOAD;
    if (tb.has('horn') || tt.has('horn')) bits |= IN.HORN;
    tt.clear();
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  return { bits, mx, my, aim };
}

export function takeNumberPick() { const n = numberPick; numberPick = null; return n; }
export function mouseScreen() { return mouse; }
export function touchAimState() { return { on: touch.rOn, firing: touch.firing, aim: touch.aim, recent: performance.now() - touch.aimAt < 1200 }; }
// on-screen elements other than #tbtns (e.g. tapping the weapon box) can press a touch action
export function virtualTap(name) { touch.tapped.add(name); }
