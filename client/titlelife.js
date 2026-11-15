// The title's backdrop, alive (the owner, 11-14 18:56: "make the main menu more interesting"; 18:59: "a few subtle
// stars in the background and maybe some clouds? Very subtle movement. Maybe a helicopter flying over the skyline or a
// plane ... a living world behind the menu full of action and life but very subtle and simple and in correct art style").
// Behind everything on the title, in the skyline's own pixels (its art pixel: the size the CSS draws the skyline at,
// 2-4 screen px), each piece on its own random clock - nothing you could count a beat in:
//   the stars        a few faint ones in the upper sky, one at a time dimming a moment and coming back
//   the clouds       one or two thin bands, faintly lit by the city from below, drifting a pixel at a time
//   the windows      in the skyline's towers, one at a time going dark or lighting up (each copy of the skyline its own)
//   the street       now and then a car's headlights (or taillights) along the foot of the towers
//   the searchlight  now and then a slow sweep across the sky from a rooftop, then gone
//   the aircraft     now and then a helicopter (a blinking red light, a strobe, a faint searchlight) or a plane high
//                    over the city, crossing slowly
// Paused while the tab is hidden or the title isn't showing; reduced motion: the stars alone, still. One small module,
// loaded by client/titlelogo.js once the sign is lit - the title's first paint never waits on it. Cheap: canvases at
// the art pixel's size (a few hundred pixels across), redrawn only where something changes; the moving pieces are small
// sprites moved by the compositor (stepped a whole art pixel at a time).
//   startLife({ glitch }) once; window.__titleLife: { force(what), glitch(kind, layer) } (the captures)
import { skyLayout } from './titlescreen.js';

// the game's palette (client/style.css tokens): the sky's pieces in the night's own colours
const P = { star: [243, 234, 210], starB: [154, 210, 255], gold: '#e2bd57', cloud: [46, 62, 108], glow: [92, 64, 104], head: [255, 241, 192], tail: [232, 67, 75], ink: '#1b2340', hi: '#33416e', rotor: '#3a4870', red: '#ff6b5a', green: '#6cd06c', white: '#f3ead2', beam: [226, 236, 255] };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const R = Math.random, between = (a, b) => a + R() * (b - a);

let started = false, root = null, title = null, G = null, timers = [], anims = [], live = false, rebuildT = 0;
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const shown = () => !!title && !title.classList.contains('hidden') && !document.hidden;

const CSS = `#title > #t-life { position: absolute; inset: 0; z-index: -1; grid-column: auto; grid-row: auto; overflow: hidden; pointer-events: none; }
#t-life > canvas { position: absolute; left: 0; top: 0; image-rendering: pixelated; image-rendering: crisp-edges; }`;

export function startLife(hooks = {}) {
  if (started) return;
  title = document.getElementById('title');
  if (!title) return;
  started = true;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 't-life'; root.setAttribute('aria-hidden', 'true');
  title.prepend(root);
  build();
  addEventListener('resize', () => { clearTimeout(rebuildT); rebuildT = setTimeout(build, 300); });
  // (the watch: the moving pieces stop with the title hidden or the tab asleep, and go on where they were)
  setInterval(() => { const on = shown(); if (on !== live) { live = on; for (const a of anims) { try { if (on) a.play(); else a.pause(); } catch { /* gone */ } } } }, 1000);
  live = shown();
  window.__titleLife = { force, glitch: (...a) => hooks.glitch && hooks.glitch(...a) };
}

// ---- the layout: the art pixel and the skyline's tiles, from what the CSS draws ------------------------------------------
function measure() {
  const W = title.clientWidth, H = title.clientHeight, bs = getComputedStyle(title).backgroundSize.split(',')[0].trim().split(/\s+/);
  const B = parseFloat(bs[1]) || 216, L = skyLayout(), s = B / L.h, TW = L.w * s, up = parseFloat(getComputedStyle(title).getPropertyValue('--sky-up')) || 0;   // (up: a phone upright lifts the city off the foot)
  // (background-position 50% 100%: one copy centred, the rest either side)
  let left = (W - TW) / 2;
  while (left > 0) left -= TW;
  const tiles = Math.ceil((W - left) / TW);
  return { W, H, B, s, TW, up, left: Math.round(left), tiles, L, aw: Math.ceil(W / s), ah: Math.ceil(H / s), skyTop: Math.floor((H - up - B * (62 / 72)) / s) };
}
function canvas(w, h, css) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.style.cssText = css;
  root.appendChild(c);
  return c;
}
const drop = (a) => { const i = anims.indexOf(a); if (i >= 0) anims.splice(i, 1); };
function stop() { for (const t of timers) clearTimeout(t); timers = []; for (const a of anims) { try { a.cancel(); } catch { /* gone */ } } anims = []; }
// a timer of the life's own: does its work only while it's showing (otherwise just waits on)
function after(ms, fn) { const t = setTimeout(() => { timers.splice(timers.indexOf(t), 1); fn(shown()); }, ms); timers.push(t); }

function build() {
  stop();
  root.textContent = '';
  G = measure();
  stars();
  if (reduced()) return;
  windows();
  beam();
  cloud(0); if (G.aw > 260) cloud(1);
  after(between(6000, 20000), function air(on) { if (on) aircraft(); after(between(40000, 110000), air); });
  after(between(4000, 14000), function car(on) { if (on) street(); after(between(9000, 30000), car); });
  after(between(12000, 30000), function sweep(on) { if (on) beamSweep(); after(between(25000, 70000), sweep); });
}

// ---- the stars ---------------------------------------------------------------------------------------------------------
function stars() {
  const top = Math.max(8, Math.floor(G.skyTop * 0.72)), n = Math.max(12, Math.min(48, Math.round((G.aw * top) / 1800)));
  const c = canvas(G.aw, top, `width:${G.aw * G.s}px;height:${top * G.s}px`), g = c.getContext('2d');
  const list = [];
  for (let k = 0; k < n; k++) list.push({ x: (R() * G.aw) | 0, y: (R() * top) | 0, a: between(0.22, 0.55), col: R() < 0.3 ? P.starB : P.star, big: R() < 0.06 });
  const draw = (q, a) => {
    g.clearRect(q.x - 1, q.y - 1, 3, 3);
    g.fillStyle = rgba(q.col, a); g.fillRect(q.x, q.y, 1, 1);
    if (q.big) { g.fillStyle = rgba(q.col, a * 0.4); g.fillRect(q.x - 1, q.y, 1, 1); g.fillRect(q.x + 1, q.y, 1, 1); g.fillRect(q.x, q.y - 1, 1, 1); g.fillRect(q.x, q.y + 1, 1, 1); }
  };
  for (const q of list) draw(q, q.a);
  if (reduced()) return;
  // one at a time: a star dims a moment (or flares, now and then) and comes back
  after(between(300, 1500), function tw(on) {
    if (on) {
      const q = list[(R() * list.length) | 0], flare = R() < 0.15;
      draw(q, flare ? Math.min(0.85, q.a + 0.35) : q.a * 0.3);
      after(between(250, 900), () => draw(q, q.a));
    }
    after(between(300, 1500), tw);
  });
}

// ---- the city's windows and the street at its foot -------------------------------------------------------------------------
let city = null;
function windows() {
  const L = G.L, c = canvas(G.tiles * L.w, L.h, `left:${G.left}px;top:auto;bottom:${G.up}px;width:${G.tiles * G.TW}px;height:${G.B}px`), g = c.getContext('2d');
  city = { c, g, state: new Map() };   // (tile, slot) -> lit now (only the ones that changed)
  const slots = L.wins.length / 4;
  if (!slots) return;
  after(between(500, 2000), function tw(on) {
    if (on) {
      // one window (a whole floor's few, now and then) in one copy of the skyline
      const tile = (R() * G.tiles) | 0, k = (R() * slots) | 0, run = R() < 0.12 ? 2 + ((R() * 3) | 0) : 1;
      for (let j = 0; j < run && k + j < slots; j++) {
        const i = (k + j) * 4, wx = L.wins[i], wy = L.wins[i + 1], was = L.wins[i + 2], ci = L.wins[i + 3];
        if (j && L.wins[i + 1] !== L.wins[k * 4 + 1]) break;   // (the same floor)
        const key = tile * 100000 + (k + j), now = city.state.has(key) ? city.state.get(key) : !!was, lit = !now;
        city.state.set(key, lit);
        g.fillStyle = lit ? P.gold : L.cols[ci];
        g.fillRect(tile * L.w + wx, wy, 1, 2);
      }
    }
    after(between(600, 2800), tw);
  });
}
function street() {
  if (!city) return;
  const g = city.g, w = city.c.width, y = G.L.h - 1, dir = R() < 0.5 ? 1 : -1, head = R() < 0.6, speed = between(70, 130) / 1000;   // (art px a ms)
  const x0 = dir > 0 ? Math.max(0, Math.floor(-G.left / G.s) - 6) : Math.min(w, Math.ceil((G.W - G.left) / G.s) + 6), len = Math.ceil(G.W / G.s) + 12;
  let t0 = 0, last = -1;
  const step = (now) => {
    if (!t0) t0 = now;
    const d = Math.floor((now - t0) * speed);
    if (d !== last) {
      last = d;
      g.clearRect(0, y, w, 1);
      const x = x0 + dir * d;
      // the lights and a short fading streak behind them
      for (let k = 0; k < 6; k++) { g.fillStyle = rgba(head ? P.head : P.tail, k === 0 ? 0.95 : 0.5 - k * 0.08); g.fillRect(x - dir * k, y, 1, 1); }
    }
    if (d < len && shown()) requestAnimationFrame(step); else g.clearRect(0, y, w, 1);
  };
  requestAnimationFrame(step);
}

// ---- the searchlight: a slow sweep from a rooftop, on a canvas of its own, drawn a dozen times a second -----------------------
let beamC = null;
function beam() { beamC = canvas(G.aw, G.ah, `width:${G.aw * G.s}px;height:${G.ah * G.s}px`); }
function beamSweep() {
  if (!beamC) return;
  const g = beamC.getContext('2d'), bx = Math.round(G.aw * between(0.12, 0.88)), by = G.skyTop + 2, len = G.ah * 1.4;
  const a0 = between(-0.55, -0.15) * (R() < 0.5 ? 1 : -1), a1 = -a0 * between(0.6, 1.1), dur = between(8000, 14000);
  let t0 = 0, last = -1;
  const step = (now) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur), f = Math.floor((now - t0) / 80);
    if (f !== last) {
      last = f;
      const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p), a = a0 + (a1 - a0) * e, fade = Math.min(1, p * 6, (1 - p) * 6), half = 0.035;
      g.clearRect(0, 0, beamC.width, beamC.height);
      const grad = g.createLinearGradient(bx, by, bx + Math.sin(a) * len, by - Math.cos(a) * len);
      grad.addColorStop(0, rgba(P.beam, 0.075 * fade)); grad.addColorStop(0.6, rgba(P.beam, 0.03 * fade)); grad.addColorStop(1, rgba(P.beam, 0));
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + Math.sin(a - half) * len, by - Math.cos(a - half) * len); g.lineTo(bx + Math.sin(a + half) * len, by - Math.cos(a + half) * len);
      g.closePath(); g.fill();
    }
    if (p < 1 && shown()) requestAnimationFrame(step); else g.clearRect(0, 0, beamC.width, beamC.height);
  };
  requestAnimationFrame(step);
}

// ---- the clouds: thin bands lit from below by the city, drifting a pixel at a time --------------------------------------
function cloud(k, enter = false) {
  if (!G) return;
  const w = Math.round(between(60, 120)), h = Math.round(between(4, 7)), c = canvas(w, h, ''), g = c.getContext('2d');
  // a few long thin streaks, the ends broken into a dither, the lower edge warmer (the city's light)
  for (let r = 0; r < h; r++) {
    const span = w * (1 - Math.abs(r - h * 0.55) / h) * between(0.6, 1), x0 = Math.round(between(0, w - span));
    for (let x = x0; x < x0 + span; x++) {
      const edge = Math.min(x - x0, x0 + span - x);
      if (edge < 6 && (x + r) % 2) continue;
      g.fillStyle = rgba(r >= h - 2 ? P.glow : P.cloud, r >= h - 2 ? 0.32 : 0.38);
      g.fillRect(x, r, 1, 1);
    }
  }
  const y = Math.round(between(G.skyTop * 0.12, G.skyTop * 0.62)), dir = R() < 0.6 ? 1 : -1;
  const from = enter ? (dir > 0 ? -w : G.aw) : Math.round(between(-w * 0.5, G.aw - w * 0.5)), to = dir > 0 ? G.aw : -w, dist = Math.abs(to - from);
  c.style.cssText = `top:${y * G.s}px;left:0;width:${w * G.s}px;height:${h * G.s}px`;
  const a = c.animate([{ transform: `translateX(${from * G.s}px)` }, { transform: `translateX(${to * G.s}px)` }], { duration: dist * between(380, 620), easing: `steps(${Math.max(1, dist)}, end)`, fill: 'forwards' });
  anims.push(a);
  if (!live) a.pause();
  a.onfinish = () => { drop(a); c.remove(); after(between(4000, 30000), () => cloud(k, true)); };
}

// ---- the aircraft: a helicopter or a plane, now and then, high over the city -------------------------------------------
function aircraft(kind = R() < 0.55 ? 'heli' : 'plane', at = -1) {
  const heli = kind === 'heli', w = heli ? 11 : 9, h = heli ? 18 : 3, c = canvas(w, h, ''), g = c.getContext('2d'), dir = R() < 0.5 ? 1 : -1;
  const y = Math.round(heli ? between(G.skyTop * 0.78, G.skyTop * 0.94) : between(G.skyTop * 0.08, G.skyTop * 0.35));   // (the helicopter low over the rooftops, the plane high)
  let f = 0;
  const X = (x) => (dir > 0 ? x : w - 1 - x);
  const draw = () => {
    g.clearRect(0, 0, w, h);
    if (heli) {
      // the searchlight's faint cone down to the city, the body's dark shape, the rotor's blur, its lights
      for (let r = 4; r < h; r++) { const sp = Math.floor((r - 4) / 3); g.fillStyle = rgba(P.beam, 0.06 - r * 0.0025); g.fillRect(X(6) - sp, r, sp * 2 + 1, 1); }
      g.fillStyle = P.rotor; g.fillRect(f % 2 ? 2 : 3, 0, 8, 1);
      g.fillStyle = P.ink; g.fillRect(X(6), 1, 1, 1); g.fillRect(Math.min(X(4), X(9)), 2, 6, 2); for (let x = 0; x < 4; x++) g.fillRect(X(x), 2, 1, 1);
      g.fillStyle = P.hi; g.fillRect(Math.min(X(5), X(8)), 2, 4, 1); g.fillRect(Math.min(X(4), X(9)), 4, 6, 1);   // (lit from below and above: the body's top, the skids)
      if (f % 8 < 4) { g.fillStyle = P.red; g.fillRect(X(0), 2, 1, 1); }
      if (f % 11 === 0) { g.fillStyle = P.white; g.fillRect(X(6), 4, 1, 1); }
    } else {
      g.fillStyle = P.ink; g.fillRect(1, 1, 7, 1);
      if (f % 6 < 3) { g.fillStyle = P.red; g.fillRect(X(0), 1, 1, 1); }
      if (f % 9 === 0 || f % 9 === 2) { g.fillStyle = P.white; g.fillRect(4, 0, 1, 1); }
      g.fillStyle = P.green; if (f % 6 < 3) g.fillRect(X(8), 1, 1, 1);
    }
  };
  draw();
  const to = dir > 0 ? G.aw : -w, from = at >= 0 ? Math.round(dir > 0 ? G.aw * at : G.aw * (1 - at)) : dir > 0 ? -w : G.aw, dist = Math.abs(to - from), dur = dist * (heli ? between(55, 80) : between(35, 50));
  c.style.cssText = `top:${y * G.s}px;left:0;width:${w * G.s}px;height:${h * G.s}px`;
  const a = c.animate([{ transform: `translateX(${from * G.s}px)` }, { transform: `translateX(${to * G.s}px)` }], { duration: dur, easing: `steps(${dist}, end)`, fill: 'forwards' });
  anims.push(a);
  if (!live) a.pause();
  const blink = setInterval(() => { if (shown()) { f++; draw(); } }, 130);
  a.onfinish = a.oncancel = () => { clearInterval(blink); drop(a); c.remove(); };
}

// (the captures: bring a piece on now, already part way across - 'all', 'heli', 'plane', 'car', 'beam')
function force(what = 'all') {
  if (!G || reduced()) return;
  if (what === 'all' || what === 'heli') aircraft('heli', 0.3);
  if (what === 'all' || what === 'plane') aircraft('plane', 0.55);
  if (what === 'all' || what === 'car') street();
  if (what === 'all' || what === 'beam') beamSweep();
}
