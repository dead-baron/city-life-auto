// Pixel-art street furniture drawn in code, in the concept art's 3/4 style (a roof or top seen from
// above, the front face below it, light from the top left, dark outlines): bus shelters, phone
// boxes, bollards, crates, ground AC units, piles of rubbish. Each is drawn once at 2 atlas px per
// world px and registered in the sprite atlas, so drawing, smashing (pieces of the sprite fly off)
// and the spectator view all use it like any concept-sheet prop.
import { atlas } from './sprites.js';
import { EXTRA_PROP_SIZES } from '../../shared/props2.js';

const S = 2; // atlas px per world px
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w * S; c.height = h * S; const g = c.getContext('2d'); g.scale(S, S); g.imageSmoothingEnabled = false; return [c, g]; }
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const box = (g, c, x, y, w, h, line = '#14161c') => { px(g, line, x - 0.5, y - 0.5, w + 1, h + 1); px(g, c, x, y, w, h); };

function busstop() {
  const [c, g] = canvas(96, 54);
  // shadow
  // back glass panel (the wall at the back of the shelter, seen face-on below the roof)
  box(g, '#9ec4d8', 6, 14, 84, 26);
  for (let x = 8; x < 88; x += 3) px(g, 'rgba(255,255,255,.18)', x, 15, 1, 24);
  px(g, 'rgba(255,255,255,.35)', 8, 16, 30, 2);
  // the advert panel on the right end (lit at night)
  box(g, '#e8b923', 66, 16, 20, 22);
  px(g, '#2f5fc8', 68, 18, 16, 10); px(g, '#ffffff', 70, 30, 12, 2); px(g, '#ffffff', 70, 33, 8, 2);
  px(g, '#c8262b', 70, 20, 6, 6);
  // timetable on the left
  box(g, '#f2f0e6', 10, 18, 10, 14); for (let y = 20; y < 31; y += 2) px(g, '#7a7a80', 11, y, 8, 1);
  // bench
  box(g, '#6a4a2e', 24, 34, 36, 4); px(g, '#8a6038', 24, 34, 36, 1);
  px(g, '#2a2c33', 26, 38, 2, 4); px(g, '#2a2c33', 56, 38, 2, 4);
  // posts
  for (const x of [5, 89]) { px(g, '#14161c', x - 1, 6, 4, 38); px(g, '#2f5fc8', x, 6, 2, 37); px(g, '#6a8ae0', x, 6, 1, 37); }
  // roof (seen from above): blue with a light front edge
  box(g, '#2350c8', 2, 2, 92, 12);
  px(g, '#3a6ae0', 2, 2, 92, 3); px(g, '#1a3a90', 2, 12, 92, 2);
  for (let x = 6; x < 92; x += 10) px(g, 'rgba(0,0,0,.18)', x, 5, 1, 7);
  // the stop sign on its pole
  px(g, '#14161c', 92, 0, 3, 14); box(g, '#f4f4f4', 88, 0, 8, 6); px(g, '#2350c8', 89, 1, 6, 4); px(g, '#ffffff', 91, 2, 2, 2);
  return c;
}
function phonebox() {
  const [c, g] = canvas(26, 40);
  box(g, '#c8262b', 3, 4, 20, 32);
  px(g, '#e04a40', 3, 4, 20, 2);
  box(g, '#9ec4d8', 6, 10, 14, 20);
  px(g, 'rgba(255,255,255,.4)', 7, 11, 3, 18);
  px(g, '#2a2c33', 12, 16, 5, 7); px(g, '#c8c8c8', 13, 17, 3, 2);
  box(g, '#a01c20', 2, 0, 22, 5); px(g, '#ffffff', 7, 1, 12, 2);
  return c;
}
function bollard() {
  const [c, g] = canvas(10, 16);
  box(g, '#3a3d44', 2, 3, 6, 11); px(g, '#5a5e68', 2, 3, 2, 11);
  px(g, '#e8b923', 2, 6, 6, 2);
  box(g, '#4a4e58', 1.5, 1, 7, 3);
  return c;
}
function crates() {
  const [c, g] = canvas(40, 40);
  const crate = (x, y, w, h) => {
    box(g, '#8a6038', x, y, w, h);
    px(g, '#a87444', x, y, w, 2);
    px(g, '#6a4628', x, y + h - 2, w, 2);
    px(g, '#5a3a1e', x + 1, y + 1, w - 2, 1); px(g, '#5a3a1e', x + 1, y + h - 2, w - 2, 1);
    for (let k = 0; k < w; k++) px(g, '#5a3a1e', x + k, y + Math.round((k / w) * (h - 2)) + 1, 1, 1);
  };
  crate(4, 16, 18, 16); crate(20, 18, 16, 14); crate(10, 4, 16, 14);
  return c;
}
function acunit() {
  const [c, g] = canvas(34, 30);
  box(g, '#a6a9ae', 3, 4, 28, 20);
  px(g, '#c4c7cc', 3, 4, 28, 3);
  px(g, '#7a7e86', 3, 21, 28, 3);
  g.fillStyle = '#2a2c33'; g.beginPath(); g.arc(13, 13, 7, 0, 6.283); g.fill();
  g.strokeStyle = '#7a7e86'; g.lineWidth = 1; for (let a = 0; a < 6.28; a += 1.05) { g.beginPath(); g.moveTo(13, 13); g.lineTo(13 + Math.cos(a) * 6, 13 + Math.sin(a) * 6); g.stroke(); }
  for (let y = 7; y < 20; y += 2) px(g, '#7a7e86', 23, y, 6, 1);
  px(g, 'rgba(40,40,40,.4)', 6, 24, 2, 3); px(g, 'rgba(60,90,120,.5)', 9, 26, 6, 2); // a drip and a stain
  return c;
}
function trashpile() {
  const [c, g] = canvas(38, 26);
  const bag = (x, y, r, col) => { g.fillStyle = '#14161c'; g.beginPath(); g.ellipse(x, y, r + 0.7, r * 0.8 + 0.7, 0, 0, 6.283); g.fill(); g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, 6.283); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.2, 0, 0, 6.283); g.fill(); };
  bag(11, 15, 8, '#2a2c33'); bag(24, 16, 7, '#3a5a2e'); bag(18, 9, 6, '#2a2c33');
  px(g, '#c8c2b4', 30, 19, 4, 3); px(g, '#8a2a24', 4, 20, 3, 2); px(g, '#e8d070', 26, 21, 3, 2); px(g, '#f2f0e6', 15, 21, 5, 2);
  return c;
}
// Billboards: two steel legs, a catwalk, and one of six made-up adverts (no real brands).
const ADS = [
  { bg: '#1f4fa8', fg: '#ffd23e', line: 'BEAN MACHINE', sub: 'COFFEE THAT WORKS', art: 'cup' },
  { bg: '#c8262b', fg: '#ffffff', line: 'PIXEL TECH', sub: 'THE FUTURE IS 16-BIT', art: 'phone' },
  { bg: '#1a1a22', fg: '#ff3ea5', line: 'CLUB NOVA', sub: 'FRI + SAT NIGHTS', art: 'moon' },
  { bg: '#2f9a5a', fg: '#ffffff', line: 'FRESHHUB', sub: 'GROCERIES 24/7', art: 'apple' },
  { bg: '#e8b923', fg: '#1a1a22', line: 'MOTOR ROW', sub: 'DRIVE IT HOME TODAY', art: 'car' },
  { bg: '#6a3ac8', fg: '#ffffff', line: 'METRO CITY', sub: 'RIDE THE CITY LOOP', art: 'train' },
];
function billboard(ad) {
  return () => {
    const A = ADS[ad];
    const [c, g] = canvas(132, 84);
    for (const x of [40, 90]) { px(g, '#14161c', x - 1, 44, 6, 36); px(g, '#5a5e68', x, 44, 4, 35); px(g, '#7a7e88', x, 44, 1, 35); }
    px(g, '#14161c', 4, 47, 124, 4); px(g, '#4a4e58', 5, 48, 122, 2); // catwalk
    for (let x = 8; x < 126; x += 6) px(g, '#3a3d44', x, 50, 1, 3);
    box(g, A.bg, 4, 4, 124, 42);
    px(g, 'rgba(255,255,255,.12)', 4, 4, 124, 3);
    g.fillStyle = A.fg; g.font = 'bold 12px monospace'; g.textBaseline = 'top';
    g.fillText(A.line, 42, 10);
    g.font = '7px monospace'; g.fillText(A.sub, 42, 28);
    // a little picture on the left
    const ax = 10, ay = 10;
    if (A.art === 'cup') { box(g, '#ffffff', ax + 4, ay + 8, 16, 16); px(g, '#7a4a2a', ax + 6, ay + 10, 12, 4); px(g, '#ffffff', ax + 20, ay + 12, 4, 6); px(g, '#c8c8c8', ax + 8, ay + 2, 2, 5); px(g, '#c8c8c8', ax + 13, ay + 1, 2, 6); }
    else if (A.art === 'phone') { box(g, '#2a2c33', ax + 6, ay + 2, 14, 24); px(g, '#7ac8ff', ax + 8, ay + 5, 10, 16); }
    else if (A.art === 'moon') { g.fillStyle = '#ff3ea5'; g.beginPath(); g.arc(ax + 13, ay + 14, 11, 0, 6.283); g.fill(); g.fillStyle = A.bg; g.beginPath(); g.arc(ax + 18, ay + 11, 10, 0, 6.283); g.fill(); }
    else if (A.art === 'apple') { g.fillStyle = '#c8262b'; g.beginPath(); g.arc(ax + 13, ay + 15, 10, 0, 6.283); g.fill(); px(g, '#2f6a24', ax + 13, ay + 2, 5, 4); }
    else if (A.art === 'car') { box(g, '#c8262b', ax, ay + 12, 26, 9); px(g, '#7ac8ff', ax + 7, ay + 7, 12, 6); px(g, '#14161c', ax + 3, ay + 20, 5, 5); px(g, '#14161c', ax + 18, ay + 20, 5, 5); }
    else { box(g, '#e07b20', ax, ay + 6, 26, 16); for (let k = 0; k < 3; k++) px(g, '#7ac8ff', ax + 3 + k * 8, ay + 9, 5, 5); px(g, '#14161c', ax + 4, ay + 22, 4, 3); px(g, '#14161c', ax + 18, ay + 22, 4, 3); }
    // lamps on arms over the top
    for (const x of [24, 66, 108]) { px(g, '#2a2c33', x, 0, 2, 5); px(g, '#c8c8c8', x - 3, 0, 8, 2); }
    return c;
  };
}

const DRAW = { busstop, phonebox, bollard, crates, acunit, trashpile };
ADS.forEach((_, k) => { DRAW['billboard' + k] = billboard(k); });

// Register them in the atlas (after the concept atlas has loaded).
export function registerNewProps() {
  for (const [name, fn] of Object.entries(DRAW)) {
    if (atlas.frames['prop_' + name]) continue;
    const cv = fn();
    atlas.imgs.push(cv);
    atlas.frames['prop_' + name] = { a: atlas.imgs.length - 1, x: 0, y: 0, w: cv.width, h: cv.height };
  }
  void EXTRA_PROP_SIZES;
}
