// Unified input: keyboard/mouse, Xbox-standard gamepad and mobile touch all collapse into
// one action state { bits, mx, my, aim } (GDD §13).
import { IN } from '../shared/input.js';

const keys = new Set();
const mouse = { x: 0, y: 0, down: false, movedAt: -1e9, wheel: 0 };
const touch = { active: false, lx: 0, ly: 0, rx: 0, ry: 0, rOn: false, btn: new Set(), tapped: new Set() };
const pressedOnce = new Set();
const tappedKeys = new Set(); // keys pressed since the last sample (so quick taps are never missed)
let pad = null;
let numberPick = null;

export const input = { usingTouch: false, usingPad: false, menuNav: 0, menuSelect: false, menuBack: false };

export function initInput(canvas, hooks) {
  addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.code;
    if (!keys.has(k)) { pressedOnce.add(k); tappedKeys.add(k); }
    keys.add(k);
    if (k === 'Tab' || k === 'Space' || k.startsWith('Arrow')) e.preventDefault();
    if (/^Digit[1-9]$/.test(k)) numberPick = Number(k.slice(5)) - 1;
    hooks.onKey?.(k);
    input.usingTouch = false;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.movedAt = performance.now(); });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; mouse.movedAt = performance.now(); } });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('gamepadconnected', () => { input.usingPad = true; });
  initTouch(hooks);
}

function initTouch(hooks) {
  const root = document.getElementById('touch');
  const enable = () => {
    if (!input.usingTouch) { input.usingTouch = true; root.classList.remove('hidden'); document.body.classList.add('touch'); hooks.onTouchMode?.(); }
  };
  addEventListener('touchstart', enable, { passive: true });
  bindStick(document.getElementById('stick-l'), (x, y) => { touch.lx = x; touch.ly = y; });
  bindStick(document.getElementById('stick-r'), (x, y, on) => { touch.rx = x; touch.ry = y; touch.rOn = on; });
  for (const b of document.querySelectorAll('#tbtns button')) {
    const name = b.dataset.b;
    const down = (e) => { e.preventDefault(); if (name === 'sprint') { if (touch.btn.has('sprint')) { touch.btn.delete('sprint'); b.classList.remove('on'); } else { touch.btn.add('sprint'); b.classList.add('on'); } } else { touch.btn.add(name); touch.tapped.add(name); b.classList.add('on'); } };
    const up = (e) => { e.preventDefault(); if (name !== 'sprint') { touch.btn.delete(name); b.classList.remove('on'); } };
    b.addEventListener('touchstart', down, { passive: false });
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
    b.addEventListener('mousedown', down);
    b.addEventListener('mouseup', up);
  }
}

function bindStick(el, cb) {
  const knob = el.querySelector('.knob');
  let id = null, cx = 0, cy = 0;
  const R = 52;
  const move = (t) => {
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

const dz = (v, d = 0.18) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
let padPrev = [];

function readPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  pad = null;
  for (const p of pads) if (p && p.connected) { pad = p; break; }
  if (!pad) return null;
  const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
  const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
  const now = pad.buttons.map((x) => x.pressed);
  const edge = (i) => now[i] && !padPrev[i];
  const out = {
    lx: dz(pad.axes[0] || 0), ly: dz(pad.axes[1] || 0), rx: dz(pad.axes[2] || 0, 0.25), ry: dz(pad.axes[3] || 0, 0.25),
    a: b(0), bb: b(1), x: b(2), y: b(3), lb: edge(4), rb: edge(5), lt: v(6), rt: v(7), back: b(8), l3: b(10),
    up: b(12), down: b(13), dUpEdge: edge(12), dDownEdge: edge(13), aEdge: edge(0), bEdge: edge(1),
  };
  if (now.some((x) => x) || Math.abs(out.lx) + Math.abs(out.ly) + Math.abs(out.rx) + Math.abs(out.ry) > 0) input.usingPad = true;
  padPrev = now;
  return out;
}

// Build the action state for this tick. view: { selfScreen: {x,y}, inVehicle }
export function sample(view) {
  let bits = 0, mx = 0, my = 0, aim = view.lastAim || 0;
  const k = (c) => keys.has(c) || tappedKeys.has(c);
  if (k('KeyW') || k('ArrowUp')) my -= 1;
  if (k('KeyS') || k('ArrowDown')) my += 1;
  if (k('KeyA') || k('ArrowLeft')) mx -= 1;
  if (k('KeyD') || k('ArrowRight')) mx += 1;
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

  const mouseFresh = performance.now() - mouse.movedAt < 2500;
  if ((mouseFresh || mouse.down) && view.selfScreen && !input.usingTouch) {
    aim = Math.atan2(mouse.y - view.selfScreen.y, mouse.x - view.selfScreen.x);
    bits |= IN.AIMING;
    if (mouse.down) bits |= IN.FIRE;
  }

  const p = readPad();
  input.menuNav = 0; input.menuSelect = false; input.menuBack = false;
  if (p) {
    if (p.dUpEdge) input.menuNav = -1;
    if (p.dDownEdge) input.menuNav = 1;
    if (p.aEdge) input.menuSelect = true;
    if (p.bEdge) input.menuBack = true;
    if (Math.abs(p.lx) + Math.abs(p.ly) > 0) { mx = p.lx; my = p.ly; }
    if (view.inVehicle && (p.rt > 0.05 || p.lt > 0.05)) my = -(p.rt - p.lt);
    if (p.a) bits |= IN.DIVE;
    if (p.bb) bits |= IN.ACTION;
    if (p.x) bits |= IN.VEHICLE;
    if (p.y) bits |= IN.THROW;
    if (p.lb) bits |= IN.PREVW;
    if (p.rb) bits |= IN.NEXTW;
    if (p.back) bits |= IN.USE;
    if (p.up) bits |= IN.HORN;
    if (p.l3 || (!view.inVehicle && p.lt > 0.5)) bits |= IN.SPRINT;
    const rmag = Math.hypot(p.rx, p.ry);
    if (rmag > 0.2) {
      aim = Math.atan2(p.ry, p.rx);
      bits |= IN.AIMING;
      if (rmag > 0.85) bits |= IN.FIRE; // GDD: auto-fire on full stick deflection
    }
    if (!view.inVehicle && p.rt > 0.4) { bits |= IN.FIRE; if (!(bits & IN.AIMING)) { bits |= IN.AIMING; aim = view.lastAim || 0; } }
  }

  if (input.usingTouch) {
    if (Math.abs(touch.lx) + Math.abs(touch.ly) > 0.05) { mx = touch.lx; my = touch.ly; }
    const rmag = Math.hypot(touch.rx, touch.ry);
    if (touch.rOn && rmag > 0.15) {
      aim = Math.atan2(touch.ry, touch.rx);
      bits |= IN.AIMING;
      if (rmag > 0.6) bits |= IN.FIRE;
    }
    const tb = touch.btn, tt = touch.tapped;
    if (tb.has('sprint')) bits |= IN.SPRINT;
    if (tb.has('dive')) bits |= IN.DIVE;
    if (tb.has('action') || tt.has('action')) bits |= IN.ACTION;
    if (tb.has('vehicle') || tt.has('vehicle')) bits |= IN.VEHICLE;
    if (tb.has('throw') || tt.has('throw')) bits |= IN.THROW;
    if (tb.has('use') || tt.has('use')) bits |= IN.USE;
    if (tt.has('nextw')) bits |= IN.NEXTW;
    if (tb.has('horn') || tt.has('horn')) bits |= IN.HORN;
    tt.clear();
  }
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  return { bits, mx, my, aim };
}

export function takeNumberPick() { const n = numberPick; numberPick = null; return n; }
export function mouseScreen() { return mouse; }
