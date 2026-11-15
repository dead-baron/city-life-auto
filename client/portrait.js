// Your own character on the title screen's card (the owner, 2026-11-13: the menu's player icon was the same picture for
// everyone - "show YOUR character"): the game's own sprite of your look, drawn into the card's avatar (index.html
// #t-card .t-av) in place of the generic icon - a new hat, glasses or haircut shows there as soon as the server has it.
// Loaded the first time the card has a look to show (client/titlescreen.js); it brings the people renderer
// (client/art2/people.js), the same module the game loads once the city is in, so the browser fetches it once.
//
// The sprite is exactly the one the city shows (person() at the game's size, put on the art grid by downsample2), made
// bigger only by a whole number of CSS px an art px, nearest-neighbour (2026-11-14, the owner: no finer render - it
// looked like old artwork, not the game's character). A portrait (the owner: the whole body was "too far out", and the
// figures' boxes - a hat, a bun - centred them each a little differently): the head and the body down to the waist, 3
// px an art px in the card's 56 px frame, every look's head at the same spot - the head's own centre from the rig, not
// the sprite's outline - and what falls outside cropped; over a soft stepped light. It stands still; now and then - after a few seconds, at random, never a loop - one small idle from the
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
const KEEP = new Map();   // look code -> { A, f: Map('pose:frame' -> { w, h, ax, ay, px }), head: [x, y] }
function look(code) {
  let R = KEEP.get(code);
  if (R) return R;
  const L = decodeLook(code);
  if (!L) return null;
  R = { A: lookArt(L, { code }), f: new Map() };
  // the head's centre round the anchor (the feet), in art px: the framing's. It's the rig's - the head's own middle
  // (people.js: a render cut to the 1 px at the head's centre puts that px at its corner), not the outline's, so a
  // hat, a bun or big hair never moves the face
  const h = person(R.A, 0, ...STILL, { region: [0, 0, 1, 1] });
  R.head = [-h.ax / 2, -h.ay / 2];
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
// a look's sprite as the card draws it (tests): { w, h, ax, ay, px } and its head's centre
export function spriteFor(code, pose = 'idle', f = 0) { const R = look(code); return R ? { ...sprite(R, pose, f), head: R.head } : null; }

// the framing: s CSS px an art px (whole, at least 2) and the crop (n x n art px from x0, y0 round the anchor) for a
// frame `inner` CSS px square: about 17 art px a side (the head and the body to the waist), the head's centre across
// the middle and HEAD_Y of the way down - the same spot for every look
export const HEAD_Y = 0.34;
export function framing(inner, head) {
  const s = Math.max(2, Math.round(inner / 17)), n = Math.floor(inner / s);
  return { s, n, x0: Math.round(head[0] - n / 2), y0: Math.round(head[1] - n * HEAD_Y) };
}

// ---- the light behind the figure: two soft steps of the card's navy, lighter toward the middle (art px) -------------
const BACK = [[34, 50, 94], [40, 57, 106], [47, 66, 118]];
function backdrop(o, n) {
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n * 0.42) / n, c = BACK[d < 0.34 ? 2 : d < 0.52 ? 1 : 0], j = (y * n + x) * 4;
      o[j] = c[0]; o[j + 1] = c[1]; o[j + 2] = c[2]; o[j + 3] = 255;
    }
  }
}

const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
  const me = (el._ptRun = (el._ptRun || 0) + 1);   // (a new portrait() into the same element stops its last one's idles)
  const live = () => me === el._ptRun;
  let shown = STILL, sz = '';
  const draw = (pose, f) => {
    if (!el.isConnected || !el.offsetParent) return false;
    const F = framing(Math.max(16, el.clientWidth - 4), R.head), n = F.n;
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
  const later = (fn, ms) => setTimeout(() => { if (live() && el.isConnected) fn(); }, ms);
  // (the card not on screen yet - still loading: drawn as soon as it shows, and again when its size changes)
  const first = () => { if (!draw(...STILL)) later(first, 400); };
  first();
  el._ptDraw = () => { if (live()) draw(...shown); };
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
