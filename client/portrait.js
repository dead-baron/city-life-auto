// Your own character on the title screen's card (the owner, 2026-11-13: the menu's player icon was the same picture for
// everyone - "show YOUR character"): the game's own sprite of your look, head and shoulders, breathing with the idle,
// drawn into the card's avatar (index.html #t-card .t-av) in place of the generic icon - a new hat, glasses or haircut
// shows there as soon as the server has it. Loaded the first time the card has a look to show (client/titlescreen.js);
// it brings the people renderer (client/art2/people.js), the same module the game loads once the city is in, so the
// browser fetches it once. Nothing is drawn finer than the game draws it: one art pixel is a whole number of CSS px.
import { decodeLook, lookArt } from '../shared/lookcore.js';
import { person, POSES } from './art2/people.js';
import { packGBuf, downsample2 } from './art2/gbuf.js';

const KEEP = new Map();   // look code -> { w, h, f: [canvas per idle frame] } (a few at most)
function frames(code) {
  let R = KEEP.get(code);
  if (R) return R;
  const L = decodeLook(code);
  if (!L) return null;
  const A = lookArt(L, { code }), D = [];
  for (let f = 0; f < (POSES.idle || 1); f++) D.push(downsample2(packGBuf(person(A, 0, 'idle', f, { tight: true, region: 'head' }))));
  // the frames share one box, lined up on the figure's anchor (the breath lifts the head a pixel)
  const x0 = Math.min(...D.map((d) => -d.ax)), y0 = Math.min(...D.map((d) => -d.ay));
  const w = Math.max(...D.map((d) => d.w - d.ax)) - x0, h = Math.max(...D.map((d) => d.h - d.ay)) - y0;
  R = { w, h, f: D.map((d) => {
    const cv = document.createElement('canvas'), c2 = cv.getContext('2d');
    cv.width = w; cv.height = h;
    if (d.w && d.h) { const id = c2.createImageData(d.w, d.h); id.data.set(d.p0.subarray(0, d.w * d.h * 4)); c2.putImageData(id, -d.ax - x0, -d.ay - y0); }
    return cv;
  }) };
  KEEP.set(code, R);
  if (KEEP.size > 4) KEEP.delete(KEEP.keys().next().value);
  return R;
}

let timer = 0, fi = 0;
// draw the look (its code: shared/lookcore.js encodeLook) into el, and keep it breathing while el is on screen
export function portrait(el, code) {
  const R = el && code ? frames(code) : null;
  if (!R) return false;
  let cv = el.querySelector('canvas');
  if (!cv) {
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.imageRendering = 'pixelated';
    el.textContent = '';
    el.appendChild(cv);
    el.dataset.icd = el.dataset.ic;   // (client/touchicons.js paintIcons leaves it be)
    el.style.overflow = 'hidden'; el.style.placeItems = 'end center';   // (a bust: the shoulders on the box's foot)
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Your character');
  }
  cv.width = R.w; cv.height = R.h;
  const draw = () => {
    if (!el.isConnected || !el.offsetParent) return;
    // a whole number of CSS px an art pixel, as big as the avatar's box takes
    const box = Math.max(16, el.clientWidth - 4), s = Math.max(1, Math.floor(Math.min(box / R.w, (box * 1.15) / R.h)));
    const W = R.w * s + 'px';
    if (cv.style.width !== W) { cv.style.width = W; cv.style.height = R.h * s + 'px'; }
    const c2 = cv.getContext('2d');
    c2.clearRect(0, 0, R.w, R.h);
    c2.drawImage(R.f[fi % R.f.length], 0, 0);
  };
  fi = 0; draw();
  clearInterval(timer);
  timer = setInterval(() => { fi++; draw(); }, 520);   // (the creator's idle: client/creator.js PREV_POSES)
  return true;
}
