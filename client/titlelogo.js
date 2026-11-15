// The title's neon logo (the owner's logo, rebuilt in-engine 2026-11-14: tools/neon_logo.py A3 - his letters on the
// art grid with even rims, a bezier swoosh, a line-work skyline, "Auto" drawn new; no black outline): the sign switched off
// (assets/logo/unlit.webp, in the page's own HTML so the first paint has it), and over it the four lit layers - the
// skyline, "City Life", the swoosh, "Auto" - each cropped to its own box (the tool makes them and prints LAYERS).
// Loaded with client/splash.js, which plays the entrance; nothing in the game depends on it.
//   mountLogo()          the lit layers, added to #logo switched off (fetched now: 4 KB, after the first paint)
//   neonIntro({ at })    the SNES-style switch-on: each layer buzzes on in turn with a short irregular flicker, then
//                        the sign idles - a soft glow breathing and, now and then, a tube
//                        misbehaving (the owner, 11-14 18:56: "would be cool if the Auto subtly flickered from time to time
//                        but not on a loop that gets repetitive"): mostly "Auto", now and then another piece, after 8-25 s
//                        at random each time - a blink or two, a dim and recover, or one letter stuttering. And the backdrop comes alive behind it (client/titlelife.js, loaded then).
//                        Any tap, click, key or pad button skips to lit. Reduced motion: just lit, no flicker, no idle.
//                        at: hold that moment (ms into the switch-on) - the captures (?neon=<ms>)
//   showLit()            lit at once, then idle (the tests' captures, ?nosplash)
// Silent (the owner, 11-15: no neon sound - the title's music instead, from the first tap: client/audio.js preloadAudio).

// the layers' boxes in % of the logo's box (1120 x 730: the sign's tubes, 5 px an art px; tools/neon_logo.py --variant
// A3 --install --no-glow prints them) and each one's glow
const LAYERS = [
  { k: 'sky', f: 'sky.webp', x: 29.911, y: 0, w: 38.839, px: [435, 220], c: '#46e6ff' },
  { k: 'city', f: 'city.webp', x: 0, y: 23.288, w: 100, px: [1120, 345], c: '#ff465a' },
  { k: 'swoosh', f: 'swoosh.webp', x: 14.286, y: 61.644, w: 70.982, px: [795, 85], c: '#ff465a' },
  { k: 'auto', f: 'auto.webp', x: 14.286, y: 69.863, w: 69.196, px: [775, 220], c: '#ffbe3c' },
];
// when each layer starts to buzz on (ms after the lit layers are in hand)
const START = { sky: 450, city: 1000, swoosh: 1580, auto: 1960 };

let els = null, ready = null, state = 'off', idleT = 0;
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function mountLogo() {
  if (els) return ready;
  const box = document.getElementById('logo');
  if (!box) { els = []; ready = Promise.resolve(); return ready; }
  els = LAYERS.map((L) => {
    const i = document.createElement('i'), img = new Image(L.px[0], L.px[1]);
    i.className = 'lg'; i.dataset.k = L.k;
    i.style.cssText = `left:${L.x}%;top:${L.y}%;width:${L.w}%;--g:${L.c};opacity:0`;
    img.alt = ''; img.decoding = 'async'; img.src = `assets/logo/${L.f}`;
    i.appendChild(img); box.appendChild(i);
    return { L, i, img };
  });
  // in hand once every layer is decoded (or failed, or 4 s have passed: the sign never waits on the network forever)
  ready = Promise.race([
    Promise.all(els.map(({ img }) => (img.decode ? img.decode() : new Promise((r) => { img.onload = img.onerror = r; })).catch(() => {}))),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  return ready;
}

const setOn = (e, v) => { e.i.style.opacity = String(v); };

export function showLit() {
  mountLogo();
  if (state === 'lit') return;
  state = 'lit';
  for (const e of els) setOn(e, 1);
  idle();
}

// the soft glow breathing (client/style.css #logo.lg-idle), and now and then a tube misbehaving (misbehave)
let lifeP = null, lastKind = '';
function idle() {
  const box = document.getElementById('logo');
  // (the backdrop's life: the stars, the clouds, the city's windows and lights - its own module, after the sign is lit)
  if (!lifeP) lifeP = import('./titlelife.js').then((m) => { m.startLife({ glitch: misbehave }); }).catch(() => {});
  if (!box || reduced()) return;
  box.classList.add('lg-idle');
  clearTimeout(idleT);
  const next = () => {
    const g = nextGlitch(Math.random, lastKind);
    idleT = setTimeout(() => {
      const title = document.getElementById('title');
      if (!document.hidden && title && !title.classList.contains('hidden') && els.length) { lastKind = g.kind; misbehave(g.kind, g.layer, g.part); }
      next();
    }, g.delay);
  };
  next();
}

// The tubes misbehaving. nextGlitch(rnd, last) -> { delay, layer, kind, part }: when (8-25 s after the last, at random:
// never a beat you can count), which piece ("Auto" four times in five, else the skyline, "City Life" or the swoosh, the
// rarer for being bigger) and how - 'blink' (one or two quick drops), 'dim' (sags and comes back with a flutter) or
// 'stutter' (one letter of "Auto" on the blink, the rest steady); never the same way twice running.
export const GLITCH = { min: 8000, max: 25000, auto: 0.8, others: ['sky', 'sky', 'swoosh', 'city'], kinds: ['blink', 'blink', 'dim', 'stutter'] };
// "Auto"'s letters across its layer (% of its width: A with its speed lines, u, t, o - tools/neon_logo.py A3's grid)
export const AUTO_PARTS = [[0, 35.6], [38, 59.4], [60.6, 77.6], [77.6, 100]];
export function nextGlitch(rnd, last = '') {
  const delay = Math.round(GLITCH.min + rnd() * (GLITCH.max - GLITCH.min));
  const layer = rnd() < GLITCH.auto ? 'auto' : GLITCH.others[(rnd() * GLITCH.others.length) | 0];
  let kind = GLITCH.kinds[(rnd() * GLITCH.kinds.length) | 0];
  if (kind === last) kind = GLITCH.kinds[(rnd() * GLITCH.kinds.length) | 0];
  if (kind === 'stutter' && layer !== 'auto') kind = 'blink';
  return { delay, layer, kind, part: (rnd() * AUTO_PARTS.length) | 0 };
}
// its steps: [[ms, opacity, the letter's level (stutter: 1 = lit, below = dimmed)]...] - subtle: never below 0.12, over
// in well under a second
export function glitchSteps(kind, rnd) {
  const out = [];
  let t = 0;
  if (kind === 'dim') {
    const lo = 0.45 + rnd() * 0.2;
    out.push([0, 0.8], [40, lo]); t = 40 + 150 + rnd() * 170;
    out.push([t, 0.85], [t + 40, lo + 0.15], [t + 80, 1]);
  } else if (kind === 'stutter') {
    const n = 2 + ((rnd() * 2) | 0);
    for (let k = 0; k < n; k++) { out.push([t, 1, 0.15 + rnd() * 0.15]); t += 40 + rnd() * 40; out.push([t, 1, 1]); t += 50 + rnd() * 70; }
  } else {
    const n = 1 + ((rnd() * 2) | 0);
    for (let k = 0; k < n; k++) { out.push([t, 0.15 + rnd() * 0.25]); t += 35 + rnd() * 30; out.push([t, 1]); t += 70 + rnd() * 60; }
  }
  return out;
}
const sectionMask = (part, lv) => { const [a, b] = AUTO_PARTS[part] || AUTO_PARTS[0], d = `rgba(0,0,0,${lv})`; return lv >= 1 ? '' : `linear-gradient(90deg, #000 ${a}%, ${d} ${a}%, ${d} ${b}%, #000 ${b}%)`; };
// play one (the captures call it too, holding a moment of it: client/titlelife.js window.__titleLife.glitch)
export function misbehave(kind = 'blink', layer = 'auto', part = 0, holdAt = -1) {
  const e = els && els.find((q) => q.L.k === layer);
  if (!e || state !== 'lit') return;
  const steps = glitchSteps(kind, holdAt >= 0 ? rng(7) : Math.random);
  const apply = ([, o, lv]) => { setOn(e, o); const m = lv === undefined ? '' : sectionMask(part, lv); e.i.style.webkitMaskImage = m; e.i.style.maskImage = m; };
  if (holdAt >= 0) { apply(steps.filter((q) => q[0] <= holdAt).pop() || [0, 1]); return; }
  for (const q of steps) setTimeout(() => apply(q), q[0]);
}

// a small seeded random (the captures hold a moment across page loads: the same flicker every time)
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// each layer's switch-on: a few irregular blips (on a moment, off a moment, not always full), then on for good -
// [[ms from its start, opacity, blip: a click and a hum]...]
function pattern(r) {
  const out = [];
  let t = 0;
  const n = 2 + ((r() * 3) | 0);
  for (let b = 0; b < n; b++) {
    out.push([t, b === 0 ? 0.55 + r() * 0.45 : 0.4 + r() * 0.6, 1]); t += 25 + r() * 55;
    out.push([t, r() < 0.3 ? 0.12 : 0]); t += 45 + r() * (b === n - 1 ? 150 : 110);
  }
  out.push([t, 0.75, 1]); out.push([t + 50, 1]);
  return out;
}
const levelAt = (pat, t) => { let v = 0; for (const [at, o] of pat) if (t >= at) v = o; return v; };

export function neonIntro({ at = -1 } = {}) {
  mountLogo();
  if (state !== 'off') return;
  if (reduced()) { showLit(); return; }
  state = 'intro';
  const r = rng(at >= 0 ? 1337 : (Math.random() * 4294967296) >>> 0);
  const pats = els.map((e) => ({ e, start: START[e.L.k], pat: pattern(r), next: 0 }));
  const end = Math.max(...pats.map((p) => p.start + p.pat[p.pat.length - 1][0])) + 20;
  if (at >= 0) {   // (a held moment: drawn once the layers are in, and left there)
    ready.then(() => { for (const p of pats) setOn(p.e, levelAt(p.pat, at - p.start)); });
    return;
  }
  let raf = 0, t0 = 0, over = false;
  const finish = () => {
    if (over) return;
    over = true; cancelAnimationFrame(raf);
    for (const ev of SKIP) removeEventListener(ev, finish, true);
    state = 'off'; showLit();
  };
  const SKIP = ['pointerdown', 'keydown'];
  for (const ev of SKIP) addEventListener(ev, finish, true);
  const pad = () => { try { for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g && g.buttons.some((b) => b.pressed)) return true; } catch { /* none */ } return false; };
  const frame = (now) => {
    if (over) return;
    if (!t0) t0 = now;
    const t = now - t0;
    if (pad()) { finish(); return; }
    for (const p of pats) {
      const lt = t - p.start;
      while (p.next < p.pat.length && lt >= p.pat[p.next][0]) {
        p.next++;
      }
      setOn(p.e, levelAt(p.pat, lt));
    }
    if (t >= end) { finish(); return; }
    raf = requestAnimationFrame(frame);
  };
  // (starts once the lit layers are in hand, the sign showing switched off meanwhile; the tab asleep - it's just lit)
  ready.then(() => { if (over) return; if (document.hidden) { finish(); return; } raf = requestAnimationFrame(frame); });
}

// (the neon's sound - a tick and a hum as each piece struck - is gone: the owner, 11-15, would rather the title's
// music start at once)
