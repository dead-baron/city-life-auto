// The title's backdrop, alive (the owner, 11-14 18:56: "make the main menu more interesting"; 18:59: "a few subtle
// stars in the background and maybe some clouds? Very subtle movement. Maybe a helicopter flying over the skyline or a
// plane ... a living world behind the menu full of action and life but very subtle and simple and in correct art style").
// Behind everything on the title, in the skyline's own pixels (its art pixel: the size the CSS draws the skyline at,
// 2-4 screen px), each piece on its own random clock - nothing you could count a beat in:
//   the stars        a few faint ones in the upper sky, one at a time dimming a moment and coming back
//   the clouds       a few full pixel clouds at two depths (the far ones smaller, fainter and slower), lit faintly
//                    from below by the city, drifting across and round again
//   the windows      in the skyline's towers, one at a time going dark or lighting up (each copy of the skyline its own);
//                    the antennas' red lights blinking
//   the street       now and then a car's headlights (or taillights) along the foot of the towers
//   the searchlight  now and then a slow sweep from a rooftop: a cone brightest at its foot, fading to nothing well
//                    below the top, soft-edged in dithered steps, a brighter line down its middle, its lamp on the roof
//   the aircraft     now and then a helicopter (a blinking red light, a strobe, a faint searchlight) or a plane high
//                    over the city, crossing slowly
// Paused while the tab is hidden or the title isn't showing; reduced motion: the stars alone, still. One small module,
// loaded by client/titlelogo.js once the sign is lit - the title's first paint never waits on it. Cheap: canvases at
// the art pixel's size (a few hundred pixels across), redrawn only where something changes; the moving pieces are small
// sprites moved by the compositor (stepped a whole art pixel at a time).
//   startLife({ glitch }) once; window.__titleLife: { force(what), glitch(kind, layer) } (the captures)
import { skyLayout } from './titlescreen.js';

// the game's palette (client/style.css tokens): the sky's pieces in the night's own colours
const P = { star: [243, 234, 210], starB: [154, 210, 255], gold: '#e2bd57', beacon: '#ff5a4a', head: [255, 241, 192], tail: [232, 67, 75], ink: '#1b2340', hi: '#33416e', rotor: '#3a4870', red: '#ff6b5a', green: '#6cd06c', white: '#f3ead2', beam: [226, 236, 255] };
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
  cloud(0); cloud(1); if (G.aw > 260) { cloud(0); cloud(1); }
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
        g.fillStyle = lit ? L.lit[ci] : L.cols[ci];
        g.fillRect(tile * L.w + wx, wy, 1, 2);
      }
    }
    after(between(600, 2800), tw);
  });
  // the antennas' red lights: on a moment, off a while, each copy of the skyline a little out of step
  const B = L.beacons || [];
  let on = false;
  after(400, function blink(show) {
    on = !on;
    if (show) for (let t = 0; t < G.tiles; t++) for (let k = 0; k < B.length; k += 2) {
      const x = t * L.w + B[k], y = B[k + 1];
      if ((t + k / 2) % 2 === (on ? 0 : 1)) { g.fillStyle = P.beacon; g.fillRect(x, y, 1, 1); } else g.clearRect(x, y, 1, 1);
    }
    after(on ? 500 : 1100, blink);
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
// The cone (the owner, 11-14: "more detailed ... a gradient and the light should fade off before reaching the top"): its
// light falls off along it to nothing well below the top of the screen and across it to its soft edges, a brighter line
// down its middle - in the art's own pixels, the gradient set in four steps through an ordered dither; its lamp a bright
// point on the roof it stands on.
let beamC = null;
function beam() { beamC = canvas(G.aw, G.ah, `width:${G.aw * G.s}px;height:${G.ah * G.s}px`); }
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function beamSweep() {
  if (!beamC) return;
  // its roof: one of the tallest in sight
  const L = G.L, rs = [];
  for (let t = 0; t < G.tiles; t++) for (let k = 0; k < (L.roofs || []).length; k += 2) {
    const x = Math.round((G.left + (t * L.w + L.roofs[k]) * G.s) / G.s), y = Math.round((G.H - G.up - (L.h - L.roofs[k + 1]) * G.s) / G.s);
    if (x > 8 && x < G.aw - 8) rs.push([x, y]);
  }
  rs.sort((p, q) => p[1] - q[1]);
  const pick = rs.length ? rs[(R() * Math.min(4, rs.length)) | 0] : [Math.round(G.aw * between(0.15, 0.85)), G.skyTop + 2];
  const g = beamC.getContext('2d'), bx = pick[0], by = pick[1] - 1, len = Math.max(30, by * 0.62), half = 0.12;
  const a0 = between(0.25, 0.55) * (R() < 0.5 ? 1 : -1), a1 = -a0 * between(0.5, 1), dur = between(16000, 24000);
  const C = P.beam, steps = [0, 0.06, 0.12, 0.2, 0.3];
  let t0 = 0, last = -1, box = null;
  const step = (now) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur), f = Math.floor((now - t0) / 80);
    if (f !== last) {
      last = f;
      const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p), a = a0 + (a1 - a0) * e, fade = Math.min(1, p * 6, (1 - p) * 6);
      const dx = Math.sin(a), dy = -Math.cos(a), tipX = bx + dx * len, tipY = by + dy * len, wid = len * Math.tan(half) + 2;
      if (box) g.clearRect(box[0], box[1], box[2], box[3]);
      const x0 = Math.max(0, Math.floor(Math.min(bx, tipX) - wid)), x1 = Math.min(beamC.width, Math.ceil(Math.max(bx, tipX) + wid));
      const y0 = Math.max(0, Math.floor(tipY - wid)), y1 = Math.min(beamC.height, by + 3);
      box = [x0, y0, x1 - x0, y1 - y0];
      if (box[2] <= 0 || box[3] <= 0) { box = null; } else {
        const id = g.createImageData(box[2], box[3]), o = id.data;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const rx = x + 0.5 - bx, ry = y + 0.5 - by, along = rx * dx + ry * dy;
          if (along < 0 || along > len) continue;
          const t = along / len, across = Math.abs(rx * dy - ry * dx), w = t * len * Math.tan(half) + 0.8, u = across / w;
          if (u >= 1) continue;
          let v = 0.24 * (1 - t) ** 1.5 * (1 - u * u) * (0.55 + 0.45 * (1 - u));
          if (across < 0.8) v += 0.08 * (1 - t) ** 1.5;   // (the brighter line down its middle)
          v *= fade;
          // four steps of it, the dither between them (the art's own pixels)
          const lv = Math.min(4, Math.floor(v / 0.065 + BAYER[(y & 3) * 4 + (x & 3)] / 16));
          if (!lv) continue;
          const j = ((y - y0) * box[2] + (x - x0)) * 4;
          o[j] = C[0]; o[j + 1] = C[1]; o[j + 2] = C[2]; o[j + 3] = Math.round(steps[lv] * 255);
        }
        g.putImageData(id, x0, y0);
        // its lamp on the roof
        g.fillStyle = rgba([255, 248, 220], 0.95 * fade); g.fillRect(bx - 1, by, 2, 1);
        g.fillStyle = rgba(C, 0.35 * fade); g.fillRect(bx - 2, by, 1, 1); g.fillRect(bx + 1, by, 1, 1); g.fillRect(bx - 1, by - 1, 2, 1);
      }
    }
    if (p < 1 && shown()) requestAnimationFrame(step); else g.clearRect(0, 0, beamC.width, beamC.height);
  };
  requestAnimationFrame(step);
}

// ---- the clouds: full pixel clouds at two depths, lit faintly from below by the city, drifting across ---------------------
// (the owner, 11-14: "make them look better and less thin and have them moving") - a flat-bottomed body under a few
// round puffs, three tones: its top a touch lighter (the moon), the body, the underside warm with the city's glow; the
// far ones (depth 0) smaller, fainter and slower, the near ones (1) bigger and quicker; off one side and round again.
const CLOUD = [{ body: [48, 62, 106], top: [70, 86, 136], glow: [104, 74, 116], a: 0.5, w: [34, 54], h: [9, 13], ms: [650, 900] },
  { body: [56, 72, 120], top: [84, 102, 152], glow: [122, 84, 126], a: 0.72, w: [60, 104], h: [14, 20], ms: [300, 420] }];
function cloud(k, enter = false) {
  if (!G) return;
  const D = CLOUD[k], w = Math.round(between(D.w[0], D.w[1])), h = Math.round(between(D.h[0], D.h[1])), c = canvas(w, h, ''), g = c.getContext('2d');
  const puffs = [];
  // (the puffs a dome along a soft base: each overlapping the next, the middle ones biggest, reaching nearly to the top)
  const n = Math.max(3, Math.round((w * 0.74) / (h * 0.55 * 1.25))), d = (w * 0.74) / n;
  for (let i = 0; i < n; i++) { const r = Math.min(h * 0.62, Math.max(d * 0.62, h * (0.3 + 0.3 * Math.sin(Math.PI * (i + 0.5) / n)) * between(0.88, 1.1))); puffs.push([w * 0.13 + d * (i + 0.5), h - 2.2 - r * 0.8, r]); }
  const inside = (x, y) => {
    if (y < 0 || y >= h || x < 0 || x >= w) return false;
    const fx = x + 0.5, fy = y + 0.5;
    if (((fx - w / 2) / (w * 0.47)) ** 2 + ((fy - (h - 3)) / Math.max(2.2, h * 0.24)) ** 2 < 1) return true;   // (the base)
    for (const [px, py, r] of puffs) if ((fx - px) ** 2 + ((fy - py) * 1.1) ** 2 < r * r) return true;
    return false;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const under = !inside(x, y + 1), under2 = !inside(x, y + 2), over = !inside(x, y - 1);
    const col = under || (under2 && (x + y) % 2) ? D.glow : over ? D.top : D.body;
    g.fillStyle = rgba(col, D.a); g.fillRect(x, y, 1, 1);
  }
  const y = Math.round(k ? between(G.skyTop * 0.3, G.skyTop * 0.62) : between(G.skyTop * 0.1, G.skyTop * 0.4));
  const from = enter ? -w : Math.round(between(-w * 0.5, G.aw - w * 0.5)), to = G.aw, dist = Math.abs(to - from);
  c.style.cssText = `top:${y * G.s}px;left:0;width:${w * G.s}px;height:${h * G.s}px;z-index:${k}`;
  const a = c.animate([{ transform: `translateX(${from * G.s}px)` }, { transform: `translateX(${to * G.s}px)` }], { duration: dist * between(D.ms[0], D.ms[1]), easing: `steps(${Math.max(1, dist)}, end)`, fill: 'forwards' });
  anims.push(a);
  if (!live) a.pause();
  a.onfinish = () => { drop(a); c.remove(); after(between(1000, 9000), () => cloud(k, true)); };
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
