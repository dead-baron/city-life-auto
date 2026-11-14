// Your own character on the title screen's card (the owner, 2026-11-13: the menu's player icon was the same picture for
// everyone - "show YOUR character"): the game's own sprite of your look, drawn into the card's avatar (index.html
// #t-card .t-av) in place of the generic icon - a new hat, glasses or haircut shows there as soon as the server has it.
// Loaded the first time the card has a look to show (client/titlescreen.js); it brings the people renderer
// (client/art2/people.js), the same module the game loads once the city is in, so the browser fetches it once.
//
// The sprite is exactly the one the city shows (person() at the game's size, put on the art grid by downsample2), made
// bigger only by a whole number of CSS px an art px, nearest-neighbour (2026-11-14, the owner: no finer render - it
// looked like old artwork, not the game's character): the whole figure where it fits (the card's 56 px frame: 2 px an
// art px), from the head down as far as it goes where it doesn't (the small card), centred in the frame over a soft
// stepped light. It stands still; now and then - after a few seconds, at random, never a loop - one small idle from the
// game's own frames: a blink (the eyes closed, as a sleeping figure's), a glance aside (the idle's own glances), a scratch
// of the head (the "huh?" emote) or a look at the phone (the phone emote), then still again. Those two are the emotes'
// frames (client/art2/poses.js), loaded once the card is drawn. Reduced motion: still, nothing more.
import { decodeLook, lookArt } from '../shared/lookcore.js';
import { person, POSES, MORE_POSES } from './art2/people.js';
import { packGBuf, downsample2 } from './art2/gbuf.js';

// the still figure with its eyes shut: the idle's first frame, the rig's own closed eyes (people.js face: P.eyes)
const BLINK = 'ptblink';
POSES[BLINK] = 1;
MORE_POSES[BLINK] = (D, P) => { P.calm = 1; P.breath = 0; P.eyes = 0; };

// the idles: [pose, frame, ms] in turn, then back to the still frame (the idle's frame 0); w: how often each is picked;
// emote: needs client/art2/poses.js (the emotes' frames: emhuh's 4 is its way up, 0-3 the scratch; emphone's 0 the way
// in, 1 the head down over the phone, 2 the thumb on it)
const STILL = ['idle', 0];
const BEATS = [
  { w: 5, f: [[BLINK, 0, 140]] },
  { w: 2, f: [[BLINK, 0, 120], ['idle', 0, 160], [BLINK, 0, 120]] },
  { w: 3, f: [['idle', 2, 1300]] },
  { w: 3, f: [['idle', 3, 1300]] },
  { w: 2, f: [['idle', 2, 800], ['idle', 0, 160], ['idle', 3, 900]] },
  { w: 2, emote: true, f: [['emhuh', 4, 150], ['emhuh', 0, 330], ['emhuh', 1, 330], ['emhuh', 0, 330], ['emhuh', 1, 330], ['emhuh', 4, 150]] },
  { w: 2, emote: true, f: [['emphone', 0, 150], ['emphone', 1, 1200], ['emphone', 2, 200], ['emphone', 1, 700], ['emphone', 2, 200], ['emphone', 1, 900], ['emphone', 0, 150]] },
];
export const GAP = [3500, 9000];   // ms of stillness between two idles (random in between)
let emotes = false;                // (poses.js in: the scratch and the phone can be picked)
function pickBeat() {
  const B = BEATS.filter((b) => !b.emote || (emotes && POSES[b.f[0][0]]));
  let r = Math.random() * B.reduce((s, b) => s + b.w, 0);
  for (const b of B) if ((r -= b.w) < 0) return b;
  return B[0];
}

// ---- the sprites, the game's own: drawn once each (a few looks kept) ---------------------------------------------------
const KEEP = new Map();   // look code -> { A, f: Map('pose:frame' -> { w, h, ax, ay, px }), box: [x0, y0, x1, y1] }
function look(code) {
  let R = KEEP.get(code);
  if (R) return R;
  const L = decodeLook(code);
  if (!L) return null;
  R = { A: lookArt(L, { code }), f: new Map() };
  // the still figure's box round its anchor (the feet), in art px: the framing's
  const d = sprite(R, ...STILL);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (d.px[(y * d.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
  R.box = x1 > x0 ? [x0 - d.ax, y0 - d.ay, x1 - d.ax, y1 - d.ay] : [-d.ax, -d.ay, d.w - d.ax, d.h - d.ay];
  KEEP.set(code, R);
  if (KEEP.size > 4) KEEP.delete(KEEP.keys().next().value);
  return R;
}
function sprite(R, pose, f) {
  const k = `${pose}:${f}`;
  let d = R.f.get(k);
  if (!d) {
    const g = downsample2(packGBuf(person(R.A, 0, pose, f, { tight: true })));
    d = { w: g.w, h: g.h, ax: g.ax, ay: g.ay, px: g.p0.slice(0, g.w * g.h * 4) };
    R.f.set(k, d);
  }
  return d;
}
// a look's sprite as the card draws it (tests): { w, h, ax, ay, px } and the still figure's box
export function spriteFor(code, pose = 'idle', f = 0) { const R = look(code); return R ? { ...sprite(R, pose, f), box: R.box } : null; }

// the framing: s CSS px an art px (whole) and the crop (n x m art px, x0, y0 round the anchor) for a frame `inner` CSS
// px square and the still figure's box - the whole figure at the biggest whole scale it fits, but never under 2 (the
// game's own look): where the whole figure doesn't fit at 2, from the head down as far as it goes. Centred both ways.
export function framing(inner, box) {
  const bw = box[2] - box[0], bh = box[3] - box[1];
  const s = Math.max(2, Math.floor(Math.min(inner / bw, inner / bh)));
  const n = Math.floor(inner / s);
  const x0 = Math.round((box[0] + box[2]) / 2 - n / 2);
  const y0 = bh <= n ? Math.round((box[1] + box[3]) / 2 - n / 2) : box[1] - 1;
  return { s, n, x0, y0 };
}

// ---- the light behind the figure: two soft steps of the card's navy, lighter toward the middle (art px) -------------
const BACK = [[34, 50, 94], [40, 57, 106], [47, 66, 118]];
function backdrop(o, n) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n * 0.45) / n, c = BACK[d < 0.3 ? 2 : d < 0.46 ? 1 : 0], j = (y * n + x) * 4;
      o[j] = c[0]; o[j + 1] = c[1]; o[j + 2] = c[2]; o[j + 3] = 255;
    }
  }
}

const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let run = 0;   // (a new portrait() stops the last one's idles)

// draw the look (its code: shared/lookcore.js encodeLook) into el, still, with an idle now and then while el is shown
export function portrait(el, code) {
  const R = el && code ? look(code) : null;
  if (!R) return false;
  let cv = el.querySelector('canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.imageRendering = 'pixelated';
    el.textContent = '';
    el.appendChild(cv);
    el.dataset.icd = el.dataset.ic;   // (client/touchicons.js paintIcons leaves it be)
    el.style.overflow = 'hidden'; el.style.placeItems = 'center';
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Your character');
  }
  const me = ++run;
  let shown = STILL, sz = '';
  const draw = (pose, f) => {
    if (!el.isConnected || !el.offsetParent) return false;
    const F = framing(Math.max(16, el.clientWidth - 4), R.box), n = F.n;
    if (sz !== `${n}x${F.s}`) { sz = `${n}x${F.s}`; cv.width = n; cv.height = n; cv.style.width = cv.style.height = n * F.s + 'px'; }
    const c2 = cv.getContext('2d'), d = sprite(R, pose, f), id = c2.createImageData(n, n), o = id.data;
    backdrop(o, n);
    // the sprite's pixels over it, lined up on its anchor (every frame stands where the still one does)
    const ox = -d.ax - F.x0, oy = -d.ay - F.y0;
    for (let y = 0; y < d.h; y++) {
      const ty = y + oy;
      if (ty < 0 || ty >= n) continue;
      for (let x = 0; x < d.w; x++) {
        const tx = x + ox, k = (y * d.w + x) * 4;
        if (tx < 0 || tx >= n || !d.px[k + 3]) continue;
        const j = (ty * n + tx) * 4;
        o[j] = d.px[k]; o[j + 1] = d.px[k + 1]; o[j + 2] = d.px[k + 2];
      }
    }
    c2.putImageData(id, 0, 0);
    shown = [pose, f];
    return true;
  };
  const later = (fn, ms) => setTimeout(() => { if (me === run && el.isConnected) fn(); }, ms);
  // (the card not on screen yet - still loading: drawn as soon as it shows, and again when its size changes)
  const first = () => { if (!draw(...STILL)) later(first, 400); };
  first();
  el._ptDraw = () => { if (me === run) draw(...shown); };
  if (typeof ResizeObserver === 'function' && !el._ptRO) { el._ptRO = new ResizeObserver(() => { if (el.offsetParent && el._ptDraw) el._ptDraw(); }); el._ptRO.observe(el); }
  if (reduced()) return true;
  // the emotes' frames (the scratch, the phone), once the card is up
  if (!emotes) later(() => import('./art2/poses.js').then(() => { emotes = true; }).catch(() => {}), 1500);
  // the idles: after a still while, one beat played through, then still again - while this portrait is the card's
  const next = () => later(play, GAP[0] + Math.random() * (GAP[1] - GAP[0]));
  const play = () => {
    if (document.hidden || !el.offsetParent) { next(); return; }
    const steps = pickBeat().f;
    let k = 0;
    const step = () => {
      if (k >= steps.length) { draw(...STILL); next(); return; }
      const [pose, f, ms] = steps[k++];
      if (!draw(pose, f)) { next(); return; }
      later(step, ms);
    };
    step();
  };
  next();
  return true;
}
