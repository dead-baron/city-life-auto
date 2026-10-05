// The country set pieces' art (shared/countryside.js places them): tents, fire pits and picnic
// tables, utility poles and their wires, lattice radio masts, wind turbines, nodding-donkey pump
// jacks, oil tanks and a flare stack, solar panels, the drive-in's screen, speaker posts and
// marquee, the observatory, coin binoculars and runway lights - plus the quarry pit and the
// raceway oval painted into the ground. Pixel art drawn in code in the concept art's 3/4 style
// (top-left light, dark outlines), cached once at 2 atlas px per world px. The moving parts (the
// blades, the pump beams, flames, the film on the screen, beacons) are drawn live each frame.
import { atlas } from './sprites.js';

const S = 2;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w * S; c.height = h * S; const g = c.getContext('2d'); g.scale(S, S); g.imageSmoothingEnabled = false; return [c, g]; }
const px = (g, c, x, y, w = 1, h = 1) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const box = (g, c, x, y, w, h, line = '#14161c') => { px(g, line, x - 0.5, y - 0.5, w + 1, h + 1); px(g, c, x, y, w, h); };
const ell = (g, c, x, y, rx, ry) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill(); };
const line = (g, c, w, pts) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };

// ---- static sprites ----------------------------------------------------------------------------
const TENT = [['#e07b20', '#f29a3e', '#a8561a'], ['#3f8a3a', '#5fae52', '#2a6226'], ['#2f6fc8', '#4f8fe8', '#1f4a90']];
function tent(v) {
  return () => {
    const [c, g] = canvas(44, 34);
    const [base, lite, dark] = TENT[v];
    // a dome tent: the fly over two crossed poles, a darker door panel at the front
    g.fillStyle = '#14161c'; g.beginPath(); g.ellipse(22, 22, 19.5, 17, 0, Math.PI, 0); g.lineTo(41.5, 29); g.lineTo(2.5, 29); g.closePath(); g.fill();
    g.fillStyle = base; g.beginPath(); g.ellipse(22, 22, 18.5, 16, 0, Math.PI, 0); g.lineTo(40.5, 28); g.lineTo(3.5, 28); g.closePath(); g.fill();
    g.fillStyle = lite; g.beginPath(); g.ellipse(17, 15, 10, 7, -0.4, 0, 6.283); g.fill();
    g.fillStyle = dark; g.beginPath(); g.ellipse(22, 22, 18.5, 16, 0, 0.1, Math.PI - 0.1); g.fill();
    line(g, 'rgba(20,22,28,.55)', 1, [[5, 26], [14, 9], [22, 6], [31, 9], [39, 26]]);
    line(g, 'rgba(20,22,28,.55)', 1, [[22, 6], [22, 28]]);
    // the door, half unzipped
    g.fillStyle = '#1a1c22'; g.beginPath(); g.moveTo(16, 28); g.quadraticCurveTo(22, 12, 28, 28); g.fill();
    g.fillStyle = dark; g.beginPath(); g.moveTo(22, 28); g.quadraticCurveTo(25, 17, 28, 28); g.fill();
    // guy lines and pegs
    line(g, 'rgba(230,230,220,.6)', 0.6, [[4, 24], [0, 31]]); line(g, 'rgba(230,230,220,.6)', 0.6, [[40, 24], [44, 31]]);
    return c;
  };
}
function campfire() {
  const [c, g] = canvas(24, 20);
  ell(g, '#2a2420', 12, 11, 8, 5);
  for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.283; const x = 12 + Math.cos(a) * 9, y = 11 + Math.sin(a) * 5.6; ell(g, '#14161c', x, y, 2.6, 2.1); ell(g, k % 2 ? '#8a8578' : '#a39d90', x - 0.3, y - 0.3, 2, 1.6); }
  // logs crossed in the middle
  g.save(); g.translate(12, 11); g.rotate(0.5); box(g, '#6a4628', -6, -1.2, 12, 2.4); g.rotate(-1.0); box(g, '#7a5230', -6, -1.2, 12, 2.4); g.restore();
  ell(g, '#3a2c22', 12, 11, 2.5, 1.5);
  return c;
}
function picnic() {
  const [c, g] = canvas(38, 30);
  // benches either side, the table between
  box(g, '#7a5230', 4, 4, 30, 4); px(g, '#9a6a3e', 4, 4, 30, 1);
  box(g, '#8a6038', 3, 10, 32, 9); for (let y = 12; y < 19; y += 2.4) px(g, '#6a4628', 3, y, 32, 0.6); px(g, '#a87444', 3, 10, 32, 1.2);
  box(g, '#7a5230', 4, 21, 30, 4); px(g, '#9a6a3e', 4, 21, 30, 1);
  for (const x of [7, 30]) px(g, '#3a2a1c', x, 19, 2, 6);
  return c;
}
function upole() {
  const [c, g] = canvas(18, 58);
  box(g, '#6a4a2e', 7.5, 4, 3, 51); px(g, '#8a6440', 7.5, 4, 1, 51);
  box(g, '#5a3e26', 1, 7, 16, 2.2); // the cross-arm
  for (const x of [2, 9, 15.5]) { box(g, '#d8dce4', x - 0.8, 4.4, 1.8, 2.6, '#3a3d44'); }
  px(g, '#3a3d44', 10.5, 14, 4, 6); px(g, '#7a7e86', 10.5, 14, 4, 1); // a transformer can
  px(g, '#c8c8c8', 8, 46, 2, 2);
  return c;
}
function radiotower() {
  const [c, g] = canvas(50, 172);
  box(g, '#9a9ea6', 10, 162, 30, 6); // concrete footing
  const bot = 165, top = 8, wB = 13, wT = 2.5;
  const at = (y) => wT + (wB - wT) * ((y - top) / (bot - top));
  // the two legs, banded red and white
  for (const sd of [-1, 1]) {
    for (let y = top; y < bot; y += 12) {
      const band = Math.floor((y - top) / 12) % 2 === 0;
      line(g, '#14161c', 3, [[25 + sd * at(y), y], [25 + sd * at(y + 12), y + 12]]);
      line(g, band ? '#d8352a' : '#f2f0ea', 1.6, [[25 + sd * at(y), y], [25 + sd * at(y + 12), y + 12]]);
    }
  }
  // cross bracing
  for (let y = top + 6; y < bot - 6; y += 12) {
    line(g, 'rgba(30,32,38,.85)', 0.9, [[25 - at(y), y], [25 + at(y + 12), y + 12]]);
    line(g, 'rgba(30,32,38,.85)', 0.9, [[25 + at(y), y], [25 - at(y + 12), y + 12]]);
    line(g, 'rgba(30,32,38,.85)', 0.9, [[25 - at(y), y], [25 + at(y), y]]);
  }
  // dishes and the antenna up top
  ell(g, '#14161c', 18.5, 52, 4.5, 5.5); ell(g, '#e8e8e2', 18.5, 52, 3.6, 4.6); ell(g, '#b8bcc4', 19.5, 52.5, 1.8, 2.4);
  ell(g, '#14161c', 31, 80, 4, 5); ell(g, '#e8e8e2', 31, 80, 3.2, 4.2);
  box(g, '#c8c8c8', 24, 0, 2, 9);
  box(g, '#2a2c33', 22.5, 6, 5, 3); // the beacon housing (lit live)
  return c;
}
function turbine() {
  // the tower and the nacelle; the blades turn live
  const [c, g] = canvas(30, 186);
  box(g, '#a6a9ae', 6, 176, 18, 8); px(g, '#c4c7cc', 6, 176, 18, 2);
  g.fillStyle = '#14161c'; g.beginPath(); g.moveTo(9.5, 178); g.lineTo(12, 22); g.lineTo(18, 22); g.lineTo(20.5, 178); g.fill();
  g.fillStyle = '#eef0f2'; g.beginPath(); g.moveTo(10.5, 177); g.lineTo(12.8, 22); g.lineTo(17.2, 22); g.lineTo(19.5, 177); g.fill();
  g.fillStyle = '#c8ccd2'; g.beginPath(); g.moveTo(15.5, 177); g.lineTo(15.6, 22); g.lineTo(17.2, 22); g.lineTo(19.5, 177); g.fill();
  px(g, '#3a7ac8', 11, 168, 8, 1.5); // a stripe and the door
  box(g, '#7a7e86', 13.5, 170, 3, 5);
  // the nacelle, seen from the front
  box(g, '#e4e6ea', 7, 10, 16, 12); px(g, '#ffffff', 7, 10, 16, 2.5); px(g, '#b8bcc4', 7, 19.5, 16, 2.5);
  return c;
}
function pumpjack() {
  // the skid, the motor and the samson post; the beam, horse head and cranks move live
  const [c, g] = canvas(72, 50);
  box(g, '#4a4e58', 3, 38, 66, 6); px(g, '#6a6e78', 3, 38, 66, 1.5);
  box(g, '#2a2c33', 10, 40, 6, 5); // the wellhead
  px(g, '#8a8e96', 11.5, 34, 3, 6);
  box(g, '#3a5a7a', 50, 30, 14, 8); px(g, '#5a7a9a', 50, 30, 14, 2); // the motor
  // samson post (an A-frame)
  line(g, '#14161c', 4, [[30, 40], [36, 12], [42, 40]]);
  line(g, '#e8b923', 2.4, [[30, 40], [36, 12], [42, 40]]);
  line(g, '#14161c', 2.5, [[32, 30], [40, 30]]); line(g, '#c8961a', 1.4, [[32, 30], [40, 30]]);
  return c;
}
function otank() {
  const [c, g] = canvas(56, 60);
  // the body
  box(g, '#d8d6d0', 4, 14, 48, 38);
  px(g, '#efede8', 4, 14, 14, 38); px(g, '#b8b6b0', 40, 14, 12, 38);
  for (const x of [12, 22, 33, 45]) px(g, 'rgba(140,80,40,.35)', x, 20 + (x % 7), 1.2, 14 + (x % 5) * 2); // rust streaks
  ell(g, '#14161c', 28, 52, 24.5, 5.5); ell(g, '#c8c6c0', 28, 52, 24, 5); px(g, '#d8d6d0', 4, 46, 48, 6);
  // the roof
  ell(g, '#14161c', 28, 14, 24.5, 9); ell(g, '#e8e6e0', 28, 14, 24, 8.5); ell(g, '#f6f4ee', 24, 12, 14, 5); ell(g, '#c8c6c0', 28, 14, 4, 2);
  // a ladder up the side and the company's letters
  for (let y = 18; y < 50; y += 3) px(g, '#4a4e58', 46, y, 4, 0.8);
  px(g, '#4a4e58', 46, 16, 0.8, 34); px(g, '#4a4e58', 49.5, 16, 0.8, 34);
  g.fillStyle = '#c8262b'; g.font = 'bold 8px monospace'; g.textBaseline = 'top'; g.fillText('DCO', 15, 28);
  return c;
}
function flare() {
  const [c, g] = canvas(20, 82);
  box(g, '#8a8e96', 5, 74, 10, 6);
  box(g, '#5a5e68', 8.5, 8, 3, 68); px(g, '#7a7e88', 8.5, 8, 1, 68);
  line(g, '#4a4e58', 0.8, [[10, 30], [2, 76]]); line(g, '#4a4e58', 0.8, [[10, 30], [18, 76]]); // guy wires
  box(g, '#3a3d44', 7, 5, 6, 4); // the tip (the flame burns live)
  return c;
}
function solar() {
  const [c, g] = canvas(64, 30);
  for (const x of [8, 32, 54]) { px(g, '#3a3d44', x, 18, 2, 8); }
  // the panel, tilted up to the sun: a slanted frame, blue cells
  g.fillStyle = '#14161c'; g.beginPath(); g.moveTo(3, 21.5); g.lineTo(7, 2.5); g.lineTo(61, 2.5); g.lineTo(63, 21.5); g.fill();
  g.fillStyle = '#c8ccd4'; g.beginPath(); g.moveTo(4, 21); g.lineTo(7.6, 3); g.lineTo(60.4, 3); g.lineTo(62, 21); g.fill();
  g.fillStyle = '#1d3a7a'; g.beginPath(); g.moveTo(5.4, 20); g.lineTo(8.6, 4); g.lineTo(59.4, 4); g.lineTo(60.8, 20); g.fill();
  for (let k = 1; k < 10; k++) { const t = k / 10; line(g, '#3a5aa8', 0.6, [[5.4 + (60.8 - 5.4) * t, 20], [8.6 + (59.4 - 8.6) * t, 4]]); }
  for (let k = 1; k < 4; k++) { const y = 4 + k * 4, sx = 8.6 - (k * 4) / 16 * 3.2; line(g, '#3a5aa8', 0.6, [[sx, y], [60, y]]); }
  g.fillStyle = 'rgba(200,230,255,.28)'; g.beginPath(); g.moveTo(14, 20); g.lineTo(26, 4); g.lineTo(32, 4); g.lineTo(20, 20); g.fill();
  return c;
}
function dscreen() {
  const [c, g] = canvas(210, 132);
  // the scaffold behind and under the screen
  for (const x of [22, 60, 104, 148, 186]) { box(g, '#4a4e58', x, 70, 4, 58); px(g, '#6a6e78', x, 70, 1, 58); }
  for (const x of [22, 60, 104, 148]) { line(g, '#3a3d44', 1.2, [[x + 2, 76], [x + 40, 122]]); line(g, '#3a3d44', 1.2, [[x + 40, 76], [x + 2, 122]]); }
  // the screen (the picture is projected live after dark)
  box(g, '#e8e6e0', 8, 6, 194, 80);
  px(g, '#f6f4ee', 8, 6, 194, 3); px(g, '#c8c6c0', 8, 82, 194, 4);
  for (let x = 10; x < 200; x += 12) px(g, 'rgba(0,0,0,.04)', x, 9, 1, 72);
  box(g, '#2a2c33', 4, 2, 202, 4);
  return c;
}
function dspeaker() {
  const [c, g] = canvas(10, 18);
  box(g, '#5a5e68', 4, 6, 2, 10);
  box(g, '#7a7e86', 1, 1, 8, 6); px(g, '#2a2c33', 2, 2.5, 6, 3); for (let x = 2.5; x < 8; x += 1.5) px(g, '#5a5e68', x, 2.5, 0.6, 3);
  return c;
}
function dome() {
  const [c, g] = canvas(200, 172);
  // the drum the dome sits on: cream walls, a door, windows, steps
  box(g, '#e8e2d0', 22, 92, 156, 70);
  px(g, '#f6f0e0', 22, 92, 156, 4); px(g, '#c8c0aa', 22, 150, 156, 12);
  for (const x of [40, 70, 124, 154]) { box(g, '#2a3a5a', x, 112, 10, 16); px(g, '#4a6a9a', x, 112, 10, 3); }
  box(g, '#5a3a22', 92, 120, 16, 30); px(g, '#7a5232', 92, 120, 16, 2); px(g, '#e8b923', 104, 134, 2, 2);
  box(g, '#a8a296', 86, 150, 28, 4); box(g, '#b8b2a6', 82, 154, 36, 5);
  // the dome itself, with the shutter slit open
  g.fillStyle = '#14161c'; g.beginPath(); g.ellipse(100, 94, 74, 70, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#c4c8ce'; g.beginPath(); g.ellipse(100, 94, 73, 69, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#e4e8ec'; g.beginPath(); g.ellipse(86, 70, 46, 40, -0.3, 0, 6.283); g.fill();
  g.fillStyle = '#f6f8fa'; g.beginPath(); g.ellipse(76, 54, 18, 14, -0.4, 0, 6.283); g.fill();
  for (let k = 1; k < 7; k++) { const a = Math.PI + (k / 7) * Math.PI; line(g, 'rgba(90,96,108,.35)', 0.8, [[100, 94], [100 + Math.cos(a) * 73, 94 + Math.sin(a) * 69]]); }
  g.fillStyle = '#14161c'; g.beginPath(); g.moveTo(108, 26); g.lineTo(122, 28); g.lineTo(126, 92); g.lineTo(110, 92); g.closePath(); g.fill();
  g.fillStyle = '#20242e'; g.beginPath(); g.moveTo(110, 30); g.lineTo(120, 31); g.lineTo(123, 90); g.lineTo(112, 90); g.closePath(); g.fill();
  box(g, '#a6a9ae', 26, 90, 148, 4);
  return c;
}
function scope() {
  const [c, g] = canvas(16, 26);
  box(g, '#5a5e68', 7, 10, 2, 14);
  box(g, '#2f9a8a', 2, 3, 12, 8); px(g, '#4fbaa8', 2, 3, 12, 2);
  ell(g, '#14161c', 5, 10, 2.2, 1.6); ell(g, '#14161c', 11, 10, 2.2, 1.6); ell(g, '#7ac8ff', 5, 9.6, 1.2, 0.8); ell(g, '#7ac8ff', 11, 9.6, 1.2, 0.8);
  return c;
}
function marquee() {
  const [c, g] = canvas(84, 76);
  for (const x of [20, 62]) { box(g, '#4a4e58', x, 34, 4, 38); px(g, '#6a6e78', x, 34, 1, 38); }
  box(g, '#1f2a5a', 4, 4, 76, 34);
  px(g, '#2f3f7a', 4, 4, 76, 3);
  g.fillStyle = '#ffd23e'; g.font = 'bold 12px monospace'; g.textBaseline = 'top'; g.fillText('STARLITE', 13, 9);
  g.fillStyle = '#ff6ac0'; g.font = 'bold 8px monospace'; g.fillText('DRIVE-IN', 23, 24);
  // a star on top
  g.fillStyle = '#ffd23e'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k / 10) * 6.283, r = k % 2 ? 3 : 7; g.lineTo(42 + Math.cos(a) * r, 2 + Math.sin(a) * r); } g.fill();
  return c;
}
function rwlight() {
  const [c, g] = canvas(8, 8);
  ell(g, '#14161c', 4, 4.5, 3.2, 2.4); ell(g, '#8a8e96', 4, 4.2, 2.6, 1.9); ell(g, '#e8e8e2', 4, 3.8, 1.2, 0.9);
  return c;
}

const DRAW = { campfire, picnic, upole, radiotower, turbine, pumpjack, otank, flare, solar, dscreen, dspeaker, dome, scope, marquee, rwlight };
TENT.forEach((_, k) => { DRAW['tent' + k] = tent(k); });

export function registerCountryProps() {
  for (const [name, fn] of Object.entries(DRAW)) {
    if (atlas.frames['prop_' + name]) continue;
    const cv = fn();
    atlas.imgs.push(cv);
    atlas.frames['prop_' + name] = { a: atlas.imgs.length - 1, x: 0, y: 0, w: cv.width, h: cv.height };
  }
}

// ---- live drawing ------------------------------------------------------------------------------
// These stand on their base (p.y) and rise up the screen; the value is how tall they draw (world
// px) so the renderer keeps them in view while any of them shows.
export const COUNTRY_TALL = { upole: 56, radiotower: 260, turbine: 250, pumpjack: 90, flare: 130, dscreen: 200, dome: 170, marquee: 76, campfire: 30, otank: 110 };
const SIZE = { upole: [18, 58], radiotower: [50, 172], turbine: [30, 186], pumpjack: [72, 50], flare: [20, 82], dscreen: [210, 132], dome: [200, 172], marquee: [84, 76], campfire: [24, 20], otank: [56, 60] };
const hashId = (p) => (((p.x * 73856093) ^ (p.y * 19349663)) >>> 0) % 1000 / 1000;
const now = () => performance.now() / 1000;

function sprite(g, p, name, s) {
  const fr = atlas.ready ? atlas.frames['prop_' + name] : null;
  if (!fr) return;
  g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, p.x - s[0] / 2, p.y + 4 - s[1], s[0], s[1]);
}

// Draw a country prop that stands up from its base; false if it isn't one of them.
// some are drawn bigger than their sprite (the pump jacks stand twice a person's height)
export const GROW = { pumpjack: 1.8, otank: 1.8, radiotower: 1.5, dscreen: 1.5, flare: 1.5 };
export function drawCountryProp(g, p, night) {
  if (!COUNTRY_TALL[p.t]) return false;
  const k = GROW[p.t];
  if (!k) return drawCountry(g, p, night);
  g.save(); g.translate(p.x, p.y + 4); g.scale(k, k); g.translate(-p.x, -(p.y + 4));
  drawCountry(g, p, night);
  g.restore();
  return true;
}
function drawCountry(g, p, night) {
  const t = p.t;
  const s = SIZE[t];
  const T0 = now();
  if (t === 'campfire') {
    sprite(g, p, t, s);
    if (p.lit) flame(g, p.x, p.y - 6, 0.8 + (night ? 0.25 : 0), T0 + hashId(p) * 9);
    return true;
  }
  sprite(g, p, t, s);
  const bx = p.x, by = p.y + 4 - s[1]; // the sprite's top-left corner
  const x0 = bx - s[0] / 2;
  if (t === 'turbine') {
    const hx = p.x, hy = by + 16;
    const a = T0 * (1.1 + (p.ph || 0) * 0.5) + (p.ph || 0) * 6.283;
    for (let k = 0; k < 3; k++) blade(g, hx, hy, a + (k * 6.283) / 3);
    g.fillStyle = '#14161c'; g.beginPath(); g.arc(hx, hy, 4.5, 0, 6.283); g.fill();
    g.fillStyle = '#f2f4f6'; g.beginPath(); g.arc(hx, hy, 3.5, 0, 6.283); g.fill();
  } else if (t === 'radiotower') {
    if (Math.sin(T0 * 2.1 + hashId(p) * 6) > 0.92) beacon(g, p.x, by + 7.5, '#ff2a1a', 2.5);
  } else if (t === 'pumpjack') {
    const ph = (p.ph || 0) * 6.283, w = T0 * 1.7 + ph;
    const tilt = Math.sin(w) * 0.2;
    const pvx = x0 + 36, pvy = by + 12;
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    const end = (d) => [pvx + c * d, pvy + sn * d];
    const [hx, hy] = end(-25), [tx, ty] = end(16);
    // the polished rod from the horse head down to the wellhead
    line(g, '#c8ccd4', 1, [[hx - 2, hy + 6], [x0 + 13, by + 40]]);
    // the cranks and counterweights at the motor end
    const cx = x0 + 46, cy = by + 30, ca = w;
    const wx = cx + Math.cos(ca) * 6, wy = cy + Math.sin(ca) * 6;
    line(g, '#14161c', 2.6, [[tx, ty], [wx, wy]]); line(g, '#7a7e86', 1.4, [[tx, ty], [wx, wy]]);
    g.fillStyle = '#14161c'; g.beginPath(); g.arc(wx, wy, 6, 0, 6.283); g.fill();
    g.fillStyle = '#c8262b'; g.beginPath(); g.arc(wx, wy, 5, 0, 6.283); g.fill();
    g.fillStyle = '#e04a40'; g.beginPath(); g.arc(wx - 1.2, wy - 1.2, 2.2, 0, 6.283); g.fill();
    // the walking beam and the horse head
    line(g, '#14161c', 4.4, [end(-22), end(18)]); line(g, '#e8b923', 3, [end(-22), end(18)]);
    g.save(); g.translate(hx, hy); g.rotate(tilt);
    g.fillStyle = '#14161c'; g.beginPath(); g.moveTo(1, -4.5); g.quadraticCurveTo(-9, -3, -8, 7.5); g.lineTo(-3, 7.5); g.quadraticCurveTo(-3, 1, 1, 0); g.fill();
    g.fillStyle = '#e8b923'; g.beginPath(); g.moveTo(0, -3.5); g.quadraticCurveTo(-8, -2, -7, 6.5); g.lineTo(-4, 6.5); g.quadraticCurveTo(-4, 1, 0, -0.5); g.fill();
    g.restore();
    g.fillStyle = '#14161c'; g.beginPath(); g.arc(pvx, pvy, 2.2, 0, 6.283); g.fill();
  } else if (t === 'flare') {
    flame(g, p.x, by + 5, 1.3, T0 + hashId(p) * 9);
  }
  return true;
}

// The parts that give off light, drawn again over the night-darkened scene (after the light map):
// the beacons, the flames, the film on the drive-in screen, the marquee's bulbs, the observatory's
// slit and windows.
export function drawCountryEmissive(g, p, night) {
  const k = GROW[p.t];
  if (!k) { emissive(g, p, night); return; }
  g.save(); g.translate(p.x, p.y + 4); g.scale(k, k); g.translate(-p.x, -(p.y + 4));
  emissive(g, p, night);
  g.restore();
}
// where on the screen a prop's light comes from: dy above its base (world px), for the light map
export function countryLightY(p, fy) { const s = SIZE[p.t]; return p.y + 4 - s[1] * (GROW[p.t] || 1) * fy; }
function emissive(g, p, night) {
  const t = p.t, s = SIZE[t];
  if (!s || p.broken) return;
  const T0 = now();
  const by = p.y + 4 - s[1], x0 = p.x - s[0] / 2;
  if (t === 'campfire') { if (p.lit) flame(g, p.x, p.y - 6, 1.05, T0 + hashId(p) * 9); return; }
  if (t === 'flare') { flame(g, p.x, by + 5, 1.3, T0 + hashId(p) * 9); return; }
  if (t === 'turbine') { if (Math.sin(T0 * 2.4 + (p.ph || 0) * 6) > 0.4) beacon(g, p.x, by + 9, '#ff2a1a', 3); return; }
  if (t === 'radiotower') {
    if (Math.sin(T0 * 2.1 + hashId(p) * 6) > 0) beacon(g, p.x, by + 7.5, '#ff2a1a', 3.5);
    for (const fy of [0.35, 0.65]) beacon(g, p.x, by + s[1] * fy, '#ff3a2a', 1.6);
    return;
  }
  if (t === 'dscreen') {
    film(g, x0 + 8, by + 6, 194, 80, T0);
  } else if (t === 'dome') {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
    g.fillStyle = '#ff6a4a'; g.beginPath(); g.moveTo(x0 + 111, by + 32); g.lineTo(x0 + 119, by + 33); g.lineTo(x0 + 121, by + 88); g.lineTo(x0 + 113, by + 88); g.closePath(); g.fill();
    g.globalAlpha = 0.6; g.fillStyle = '#ffd890';
    for (const wx of [40, 70, 124, 154]) g.fillRect(x0 + wx, by + 112, 10, 16);
    g.restore();
  } else if (t === 'marquee') {
    // chaser bulbs round the sign
    const k0 = Math.floor(T0 * 8);
    for (let k = 0; k < 28; k++) {
      const per = k < 10 ? [x0 + 6 + k * 7.6, by + 5] : k < 14 ? [x0 + 79, by + 8 + (k - 10) * 7.5] : k < 24 ? [x0 + 78 - (k - 14) * 7.6, by + 37] : [x0 + 5, by + 34 - (k - 24) * 7.5];
      const on = (k + k0) % 3 === 0;
      g.fillStyle = on ? '#fff2a0' : 'rgba(120,100,40,.6)'; g.fillRect(per[0] - 1, per[1] - 1, 2.2, 2.2);
    }
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.fillStyle = '#ffd23e'; g.fillRect(x0 + 10, by + 8, 64, 14); g.restore();
  }
  void night;
}

function blade(g, x, y, a) {
  const L = 70, c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
  g.fillStyle = '#14161c';
  g.beginPath(); g.moveTo(x + nx * 3.4, y + ny * 3.4); g.lineTo(x + c * L + nx * 1, y + s * L + ny * 1); g.lineTo(x + c * L - nx * 1, y + s * L - ny * 1); g.lineTo(x - nx * 2.4, y - ny * 2.4); g.fill();
  g.fillStyle = '#f2f4f6';
  g.beginPath(); g.moveTo(x + nx * 2.6, y + ny * 2.6); g.lineTo(x + c * (L - 1) + nx * 0.4, y + s * (L - 1) + ny * 0.4); g.lineTo(x - nx * 1.6, y - ny * 1.6); g.fill();
  g.fillStyle = '#c8262b'; g.beginPath(); g.moveTo(x + c * (L - 8) + nx * 1.3, y + s * (L - 8) + ny * 1.3); g.lineTo(x + c * L, y + s * L); g.lineTo(x + c * (L - 8) - nx * 0.8, y + s * (L - 8) - ny * 0.8); g.fill();
}
function beacon(g, x, y, col, r) {
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = col; g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, r * 2.6, 0, 6.283); g.fill();
  g.globalAlpha = 1; g.beginPath(); g.arc(x, y, r * 0.8, 0, 6.283); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r * 0.35, 0, 6.283); g.fill();
  g.restore();
}
// a flickering flame: three tongues that lick up and sway
function flame(g, x, y, k, t) {
  const tongues = [['#c8261a', 1.0, 0], ['#ff8a1a', 0.75, 1.7], ['#ffe27a', 0.45, 3.1]];
  for (const [col, sc, off] of tongues) {
    const h = (11 + Math.sin(t * 13 + off) * 2.5 + Math.sin(t * 7.3 + off * 2) * 1.5) * k * sc;
    const w = 4.5 * k * sc + 1;
    const sway = Math.sin(t * 5.1 + off) * 1.6 * k;
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.6 + sway * 0.5, y - h * 0.6, x + sway, y - h); g.quadraticCurveTo(x + w * 0.6 + sway * 0.5, y - h * 0.6, x + w, y); g.closePath(); g.fill();
  }
}
// what's on at the drive-in: big soft shapes of colour drifting and cutting from shot to shot
const SHOTS = [['#1a2a5a', '#e8b923', '#f2f0e6'], ['#5a1a2a', '#ff6a40', '#ffe0a0'], ['#0e3a2a', '#7ad87a', '#e0ffe0'], ['#2a1a4a', '#ff4ab0', '#a0e0ff'], ['#3a2a1a', '#ffb060', '#ffffff']];
function film(g, x, y, w, h, t) {
  const shot = Math.floor(t / 4.5) % SHOTS.length, [bg, a, b] = SHOTS[shot], u = (t % 4.5) / 4.5;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = a; g.beginPath(); g.ellipse(x + w * (0.25 + u * 0.3), y + h * 0.55, w * 0.16, h * 0.32, 0, 0, 6.283); g.fill();
  g.fillStyle = b; g.beginPath(); g.ellipse(x + w * (0.72 - u * 0.15), y + h * (0.4 + Math.sin(t * 1.3) * 0.06), w * 0.1, h * 0.22, 0, 0, 6.283); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
  g.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 3; k++) g.fillRect(x + ((t * 97 + k * 61) % w), y, 1, h); // scratches on the film
  g.restore();
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18; g.fillStyle = a; g.fillRect(x, y, w, h); g.restore();
}

// ---- wires between the poles ---------------------------------------------------------------------
// poles: the utility poles in view. byPos looks a pole up by where it stands (to leave out wires to a
// pole that's been knocked down).
export function drawWires(g, poles, byPos) {
  if (!poles.length) return;
  g.save();
  g.lineWidth = 0.9;
  g.strokeStyle = 'rgba(22,24,30,.75)';
  g.beginPath();
  for (const p of poles) {
    if (p.broken || p.wx === undefined) continue;
    const q = byPos(p.wx, p.wy);
    if (q && q.broken) continue;
    for (const o of [-7, 0, 6.5]) {
      const ax = p.x + o, ay = p.y - 48, bx = p.wx + o, by = p.wy - 48;
      const mx = (ax + bx) / 2, my = (ay + by) / 2 + 14;
      g.moveTo(ax, ay); g.quadraticCurveTo(mx, my, bx, by);
    }
  }
  g.stroke();
  g.restore();
}

// ---- the ground: the quarry pit and the raceway ---------------------------------------------------
const inChunk = (x, y, w, h, cx, cy, C) => !(x + w < cx * C || x > (cx + 1) * C || y + h < cy * C || y > (cy + 1) * C);
export function drawQuarry(g, q, cx, cy, C) {
  if (!inChunk(q.x - 40, q.y - 40, q.w + 80, q.h + 80, cx, cy, C)) return;
  const x = q.x + q.w / 2, y = q.y + q.h / 2;
  // terraces stepping down: each ring darker, a lit lip on the far (north) side of each step
  const N = 5;
  for (let k = 0; k < N; k++) {
    const f = 1 - k / N, rx = (q.w / 2) * f, ry = (q.h / 2) * f;
    const sh = 120 - k * 16;
    g.fillStyle = `rgb(${sh + 28},${sh + 12},${sh - 6})`;
    g.beginPath(); g.ellipse(x, y + k * 6, rx, ry, 0, 0, 6.283); g.fill();
    g.strokeStyle = `rgba(230,210,170,${0.35 - k * 0.04})`; g.lineWidth = 3;
    g.beginPath(); g.ellipse(x, y + k * 6, rx - 2, ry - 2, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.strokeStyle = 'rgba(40,24,10,.35)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y + k * 6, rx - 1, ry - 1, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
  }
  // grit: chips of lighter and darker rock all over, so it reads as pixel-art ground, not paint
  g.save(); g.beginPath(); g.ellipse(x, y, q.w / 2, q.h / 2, 0, 0, 6.283); g.clip();
  let sd = (q.x * 31 + q.y * 17) >>> 0;
  const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
  for (let k = 0; k < (q.w * q.h) / 90; k++) {
    const px2 = q.x + rnd() * q.w, py2 = q.y + rnd() * q.h, v = rnd();
    g.fillStyle = v < 0.5 ? 'rgba(255,240,210,.16)' : 'rgba(30,18,8,.18)';
    g.fillRect(Math.round(px2), Math.round(py2), 2 + (v * 3 | 0), 2);
  }
  g.restore();
  // standing water in the bottom, and the haul road spiralling down
  g.fillStyle = 'rgba(60,96,110,.85)'; g.beginPath(); g.ellipse(x, y + N * 6 - 4, q.w * 0.08, q.h * 0.06, 0, 0, 6.283); g.fill();
  g.strokeStyle = 'rgba(190,160,120,.55)'; g.lineWidth = 10; g.setLineDash([]);
  g.beginPath();
  for (let k = 0; k <= 40; k++) { const t = k / 40, a = Math.PI * 0.5 + t * Math.PI * 2.2, f = 1 - t * 0.75; const px = x + Math.cos(a) * (q.w / 2) * f * 0.92, py = y + t * 26 + Math.sin(a) * (q.h / 2) * f * 0.92; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
  g.stroke();
}
export function drawRaceway(g, r, cx, cy, C) {
  if (!inChunk(r.x - 20, r.y - 20, r.w + 40, r.h + 40, cx, cy, C)) return;
  const stadium = (x, y, w, h) => { const rr = h / 2; g.beginPath(); g.moveTo(x + rr, y); g.lineTo(x + w - rr, y); g.arc(x + w - rr, y + rr, rr, -Math.PI / 2, Math.PI / 2); g.lineTo(x + rr, y + h); g.arc(x + rr, y + rr, rr, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
  const b = r.band;
  g.save();
  // asphalt band
  g.fillStyle = '#3a3c42'; stadium(r.x, r.y, r.w, r.h); g.fill();
  g.fillStyle = '#5fa03a'; stadium(r.x + b, r.y + b, r.w - 2 * b, r.h - 2 * b); g.fill();
  // red-and-white kerbs inside and out
  for (const [ins, w] of [[3, 6], [b - 3, 6]]) {
    g.lineWidth = w; g.setLineDash([16, 16]);
    g.strokeStyle = '#e8e8e2'; stadium(r.x + ins, r.y + ins, r.w - 2 * ins, r.h - 2 * ins); g.stroke();
    g.lineDashOffset = 16; g.strokeStyle = '#c8262b'; stadium(r.x + ins, r.y + ins, r.w - 2 * ins, r.h - 2 * ins); g.stroke();
    g.lineDashOffset = 0;
  }
  g.setLineDash([24, 30]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.35)';
  stadium(r.x + b / 2, r.y + b / 2, r.w - b, r.h - b); g.stroke();
  g.setLineDash([]);
  // the chequered start line across the bottom straight
  const sx = r.x + r.w / 2 + 40;
  for (let k = 0; k < Math.floor(b / 8); k++) for (let j = 0; j < 3; j++) { g.fillStyle = (k + j) % 2 ? '#111' : '#f2f2f2'; g.fillRect(sx + j * 8, r.y + r.h - b + k * 8, 8, 8); }
  // grid boxes behind it and tyre marks through the turns
  g.fillStyle = 'rgba(255,255,255,.6)';
  for (let k = 0; k < 4; k++) g.fillRect(sx + 40 + k * 46, r.y + r.h - b + (k % 2 ? b * 0.6 : b * 0.2), 22, 3);
  g.strokeStyle = 'rgba(10,10,12,.25)'; g.lineWidth = 3;
  for (const side of [0, 1]) { const cxx = side ? r.x + r.w - r.h / 2 : r.x + r.h / 2; g.beginPath(); g.arc(cxx, r.y + r.h / 2, r.h / 2 - b * 0.55, side ? -1.2 : Math.PI - 1.2, side ? 1.2 : Math.PI + 1.2); g.stroke(); }
  g.restore();
}
