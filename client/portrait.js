// Your own character on the title screen's card (the owner, 2026-11-13: the menu's player icon was the same picture for
// everyone - "show YOUR character"): the game's own figure of your look, head to feet, drawn into the card's avatar
// (index.html #t-card .t-av) in place of the generic icon - a new hat, glasses or haircut shows there as soon as the
// server has it. Loaded the first time the card has a look to show (client/titlescreen.js); it brings the people
// renderer (client/art2/people.js), the same module the game loads once the city is in, so the browser fetches it once.
//
// The whole figure, crisp and still (2026-11-14; it had been the game's tiny sprite of the head blown up - the face
// smeared - low in its frame, breathing and looking round on a loop): the game's own figure drawn at as many px a world
// px as fit it in the frame (people.js res; from 2 up, the close face of client/art2/peopleclose.js), one px a device px
// - nothing scaled by the browser - centred, over a soft stepped light behind it. Now and then -
import { decodeLook, lookArt } from '../shared/lookcore.js';
import { person, POSES, MORE_POSES } from './art2/people.js';
import { packGBuf } from './art2/gbuf.js';
import { closeFace } from './art2/peopleclose.js';   // (the face close up: 4 KB the game never loads - this module is
                                                     // itself loaded only once the title card has a look to show)

// ---- the card's own frames (registered beside the game's poses, as poses.js registers the emotes) -------------------
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const HEAD = (S, x, y, z) => vadd(S.head, mv(S.SP, [x, y, z]));    // a hand by the head (poses.js)
const CHEST = (S, x, y, z) => vadd(S.chest, mv(S.SP, [x, y, z]));  // a hand in front of the chest
const still = (P) => { P.calm = 1; P.breath = 0; P.acc = false; };
const scratch = (k) => (D, P) => {   // the right hand up to the side of the head (k: 0 on its way, 1 and 2 the scratch)
  still(P);
  P.headYaw = -0.1 * Math.min(1, k); P.tilt = 0.06 * Math.min(1, k); P.headPitch = 0.04;
  P.hands = (S) => { P.hR = k ? HEAD(S, 3.6, 0.8, 2.2 + (k - 1) * 1.0) : CHEST(S, 4.2, 4.4, 2.4); P.elR = [1, 0.2, 0.1]; P.openR = 0; };
};
const phone = (k, bare) => (D, P) => {   // the phone up in the right hand in front of the chest, the head bent to it
  still(P);                               // (k: 0 on its way, 1 held, 2 the thumb on it; bare: the hand without it)
  P.headPitch = k ? 0.3 : 0.1; P.headYaw = k ? 0.14 : 0.05;
  P.hands = (S) => {
    P.hR = k ? CHEST(S, 2.4, 7.6, 2.2 + (k === 2 ? 0.4 : 0)) : CHEST(S, 3.4, 4.6, -2.4); P.elR = [1, -0.5, -0.6];
    if (!bare) P.item = { kind: 'phone', axis: [0, 0.35, 1], vdir: [0, -1, 0.35], two: false };
  };
};
const FRAMES = [
  (D, P) => still(P),                                        // 0 still
  (D, P) => { still(P); P.eyes = 0; },                       // 1 a blink
  (D, P) => { still(P); P.headYaw = 0.28; },                 // 2, 3 a glance to one side (half, then all the way)
  (D, P) => { still(P); P.headYaw = 0.58; P.headPitch = -0.04; },
  (D, P) => { still(P); P.headYaw = -0.28; },                // 4, 5 and to the other
  (D, P) => { still(P); P.headYaw = -0.58; P.headPitch = -0.04; },
  scratch(0), scratch(1), scratch(2),                        // 6-8 a scratch of the head
  phone(0), phone(1), phone(2),                              // 9-11 a look at the phone
  phone(0, true), phone(1, true), phone(2, true),            // 12-14 (the same without it: what the phone is, game size)
];
const BARE = { 9: 12, 10: 13, 11: 14 };
const PT = 'ptcard';
POSES[PT] = FRAMES.length;
MORE_POSES[PT] = (D, P, f) => FRAMES[f](D, P);

// the idles: [frame, ms] in turn, then back to the still frame; w: how often each is picked
const BEATS = [
  { w: 5, f: [[1, 130]] },
  { w: 2, f: [[1, 110], [0, 150], [1, 110]] },
  { w: 3, f: [[2, 110], [3, 1300], [2, 110]] },
  { w: 3, f: [[4, 110], [5, 1300], [4, 110]] },
  { w: 2, f: [[2, 110], [3, 700], [2, 90], [0, 140], [4, 90], [5, 800], [4, 110]] },
  { w: 2, f: [[6, 150], [7, 200], [8, 200], [7, 200], [8, 200], [7, 180], [6, 150]] },
  { w: 2, f: [[9, 170], [10, 1100], [11, 220], [10, 700], [11, 220], [10, 900], [9, 170]] },
];
const W_SUM = BEATS.reduce((s, b) => s + b.w, 0);
const pickBeat = () => { let r = Math.random() * W_SUM; for (const b of BEATS) { if ((r -= b.w) < 0) return b; } return BEATS[0]; };
const GAP = [3500, 9000];   // ms of stillness between two idles (random in between)
// how many px a world px: as many whole ones as fit the figure (head to feet, a hat on it; figH: its height at the
// game's size) in the frame's device px (a 56 px frame, 52 inside its edge: most looks 3 at 3x, 2 at 2x, 1 - the game's
// own pixels - at 1x)
export const resFor = (devPx, figH) => Math.max(1, Math.min(6, Math.floor((devPx - 2) / Math.max(20, figH - 1))));

// ---- the frames, drawn close up once each (the still one at once, the rest in the quiet moments after) ---------------
// (person() at res R with client/art2/peopleclose.js's face: the game's own figure R x R finer, the face drawn with
// real eyes, brows, a nose and lips - the game's sprite blown up smears its few face pixels)
const KEEP = new Map();   // look code -> { A, h1, at: { res -> { A, res, f: [frames], box: [x0, y0, x1, y1] } } } (a few)
function look(code, devPx) {
  let K = KEEP.get(code);
  if (!K) {
    const L = decodeLook(code);
    if (!L) return null;
    K = { A: lookArt(L, { code }), at: {} };
    const g = person(K.A, 0, PT, 0, { tight: true });   // (the game's size: how tall the figure stands)
    K.h1 = g.h;
    KEEP.set(code, K);
    if (KEEP.size > 3) KEEP.delete(KEEP.keys().next().value);
  }
  const res = resFor(devPx, K.h1);
  let R = K.at[res];
  if (R) return R;
  R = K.at[res] = { A: K.A, res, f: [] };
  // the still frame's box round its anchor (the feet): the crop is centred on it
  const d = frame(R, 0);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.px[(y * d.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
  R.box = x1 > x0 ? [x0 - d.ax, y0 - d.ay, x1 - d.ax, y1 - d.ay] : [-d.ax, -d.ay, d.w - d.ax, d.h - d.ay];
  return R;
}
function frame(R, i) {
  if (R.f[i]) return R.f[i];
  const g = packGBuf(person(R.A, 0, PT, i, R.res > 1 ? { tight: true, res: R.res, closeFace } : { tight: true }));
  const F = { w: g.w, h: g.h, ax: g.ax, ay: g.ay, px: g.p0.slice(0, g.w * g.h * 4) };
  if (BARE[i] && R.res > 1) heldOver(R, F, i);
  return (R.f[i] = F);
}
// a frame of a look at res, as the card draws it: { w, h, ax, ay, px } (tests and tools)
export function frameFor(code, devPx, i) { const R = look(code, devPx); return R ? frame(R, i) : null; }
// the phone: people.js draws held things only at the game's size (its close renders show none), so it's taken from the
// game-size figure - the pixels that change when the phone is in the hand - and laid over the close render, each px R x R
function heldOver(R, F, i) {
  const opt = { tight: true };
  const a = packGBuf(person(R.A, 0, PT, i, opt)), b = packGBuf(person(R.A, 0, PT, BARE[i], opt)), r = R.res;
  for (let y = 0; y < a.h; y++) {
    for (let x = 0; x < a.w; x++) {
      const k = (y * a.w + x) * 4, bx = x - a.ax + b.ax, by = y - a.ay + b.ay;
      const kb = bx >= 0 && by >= 0 && bx < b.w && by < b.h ? (by * b.w + bx) * 4 : -1;
      if (!a.p0[k + 3] || (kb >= 0 && b.p0[kb + 3] && a.p0[k] === b.p0[kb] && a.p0[k + 1] === b.p0[kb + 1] && a.p0[k + 2] === b.p0[kb + 2])) continue;
      const X0 = Math.round((x - a.ax) * r + F.ax), Y0 = Math.round((y - a.ay) * r + F.ay);
      for (let v = 0; v < r; v++) {
        for (let u = 0; u < r; u++) {
          const X = X0 + u, Y = Y0 + v;
          if (X < 0 || Y < 0 || X >= F.w || Y >= F.h) continue;
          const j = (Y * F.w + X) * 4;
          F.px[j] = a.p0[k]; F.px[j + 1] = a.p0[k + 1]; F.px[j + 2] = a.p0[k + 2]; F.px[j + 3] = 255;
        }
      }
    }
  }
}

// ---- the light behind the figure: two soft steps of the card's navy, lighter toward its middle --------------------------
const BACK = [[34, 50, 94], [40, 57, 106], [47, 66, 118]];
function backdrop(o, n, hx, hy) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - hx, y + 0.5 - hy) / n, c = BACK[d < 0.4 ? 2 : d < 0.62 ? 1 : 0], j = (y * n + x) * 4;
      o[j] = c[0]; o[j + 1] = c[1]; o[j + 2] = c[2]; o[j + 3] = 255;
    }
  }
}

const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let run = 0;   // (a new portrait() stops the last one's idles)

// draw the look (its code: shared/lookcore.js encodeLook) into el, still, with an idle now and then while el is shown
export function portrait(el, code) {
  if (!el || !code || !decodeLook(code)) return false;
  let cv = el.querySelector('canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.borderRadius = 'inherit';
    el.textContent = '';
    el.appendChild(cv);
    el.dataset.icd = el.dataset.ic;   // (client/touchicons.js paintIcons leaves it be)
    el.style.overflow = 'hidden'; el.style.placeItems = 'center';
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Your character');
  }
  const me = ++run;
  let shown = 0, sz = '';
  const draw = (i) => {
    if (!el.isConnected || !el.offsetParent) return false;
    // the frame inside its 2 px edge, in device px: the canvas that size, shown at its CSS size (one px a device px)
    const inner = Math.max(16, el.clientWidth - 4), dpr = Math.min(4, Math.max(1, window.devicePixelRatio || 1));
    const n = Math.round(inner * dpr), R = look(code, n);
    if (!R) return false;
    // the figure's box (the still frame's) in the middle of the crop
    const b = R.box, ox = Math.round((b[0] + b[2]) / 2 - n / 2), oy = Math.round((b[1] + b[3]) / 2 - n / 2);
    const key = `${n}`;
    if (sz !== key) { sz = key; cv.width = n; cv.height = n; cv.style.width = cv.style.height = n / dpr + 'px'; }
    const c2 = cv.getContext('2d'), d = frame(R, i), id = c2.createImageData(n, n), o = id.data;
    backdrop(o, n, n / 2, n * 0.42);
    // the frame's pixels over it (lined up on the figure's anchor: every frame stands where the still one does)
    const x0 = -d.ax - ox, y0 = -d.ay - oy;
    for (let y = 0; y < d.h; y++) {
      const ty = y + y0;
      if (ty < 0 || ty >= n) continue;
      for (let x = 0; x < d.w; x++) {
        const tx = x + x0, k = (y * d.w + x) * 4, a = d.px[k + 3];
        if (tx < 0 || tx >= n || !a) continue;
        const j = (ty * n + tx) * 4, q = a / 255;
        o[j] += (d.px[k] - o[j]) * q; o[j + 1] += (d.px[k + 1] - o[j + 1]) * q; o[j + 2] += (d.px[k + 2] - o[j + 2]) * q;
      }
    }
    c2.putImageData(id, 0, 0);
    shown = i;
    // the other frames, one at a time in the quiet moments after (so an idle never waits on its drawing)
    if (!R.warm) {
      R.warm = true;
      let f = 1;
      const warm = () => { if (f >= 12 || me !== run) return; frame(R, f++); (window.requestIdleCallback || ((cb) => setTimeout(cb, 120)))(warm); };
      setTimeout(warm, 600);
    }
    return true;
  };
  const later = (fn, ms) => setTimeout(() => { if (me === run && el.isConnected) fn(); }, ms);
  // (the card not on screen yet - still loading: drawn as soon as it shows, and again when its size changes)
  const first = () => { if (!draw(0)) later(first, 400); };
  first();
  el._ptDraw = () => { if (me === run) draw(shown); };
  if (typeof ResizeObserver === 'function' && !el._ptRO) { el._ptRO = new ResizeObserver(() => { if (el.offsetParent && el._ptDraw) el._ptDraw(); }); el._ptRO.observe(el); }
  if (reduced()) return true;
  // the idles: after a still while, one beat played through, then still again - while this portrait is the card's
  const next = () => later(play, GAP[0] + Math.random() * (GAP[1] - GAP[0]));
  const play = () => {
    if (document.hidden || !el.offsetParent) { next(); return; }
    const steps = pickBeat().f;
    let k = 0;
    const step = () => {
      if (k >= steps.length) { draw(0); next(); return; }
      const [f, ms] = steps[k++];
      if (!draw(f)) { if (shown) draw(0); next(); return; }
      later(step, ms);
    };
    step();
  };
  next();
  return true;
}
