// The races' marks on the water and the track (loaded the first time a race's start or gate is in view: client/main.js
// drawBuoys): pixel art at the art pixel (2 world px), as the world is drawn - not the flat circles and the drawn flag
// they were (the owner, 2026-11-13: "The starting marker for the kayak run looks like placeholder ... make sure
// placeholder art and waypoints and things are updated with the right authentic SNES style").
//   the start on the water: a fat striped float with a ring of ripples round it, a mast, a chequered flag on it waving
//   a gate on the water: a can buoy (red or white by turns) on its ripples, a yellow pennant with the gate's number
//   the start on land: a chequered flag on a pole set in a weighted block; a gate on land: a cone with its pennant
// Each is painted once into a little canvas per frame (and number) and drawn with smoothing off; they bob a whole art
// pixel at a time. Drawn on the overlay, over the world: the starts sit off the craft's spots (shared/world3-riverrun.js).
const AP = 2;   // world px to an art pixel
const INK = '#21161e';
const C = {
  orange: ['#ffc47a', '#ff9a2e', '#d8641a', '#9a3a12'], white: ['#ffffff', '#e8eef2', '#b8c4cc', '#7a8890'], red: ['#ff8a7a', '#e8382b', '#b02018', '#6e1410'],
  steel: ['#c8ccd4', '#8a909c', '#545a66'], yellow: ['#fff0a0', '#f8d040', '#c89a18'], check: ['#f4f4f0', '#1c1c22'], concrete: ['#d0ccc2', '#a8a298', '#7a756c'],
  ripple: 'rgba(214,240,248,.75)', rippleDim: 'rgba(214,240,248,.4)', shadow: 'rgba(10,8,16,.35)',
};
// 3 x 5 digits for the gates' numbers
const DIG = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];
const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// paint into an art-pixel grid, then the outline round whatever is filled
function sprite(w, h, paint) {
  const px = new Array(w * h).fill(null);
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) px[y * w + x] = c; };
  const under = [];   // (drawn under the outline pass: ripples, shadows)
  paint(set, (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) under.push([x, y, c]); });
  const cv = canvas(w, h), g = cv.getContext('2d');
  for (const [x, y, c] of under) if (!px[y * w + x]) { g.fillStyle = c; g.fillRect(x, y, 1, 1); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = px[y * w + x];
    if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); continue; }
    const n = (dx, dy) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < w && Y < h && px[Y * w + X] && px[Y * w + X] !== INK; };
    if (n(1, 0) || n(-1, 0) || n(0, 1) || n(0, -1)) { g.clearRect(x, y, 1, 1); g.fillStyle = INK; g.fillRect(x, y, 1, 1); }
  }
  return cv;
}
const ellipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) * ((x - cx) / rx) + ((y - cy) / ry) * ((y - cy) / ry) <= 1;
function ripples(under, cx, cy, rx, ry, f) {
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2, x = cx + Math.cos(t) * rx, y = cy + Math.sin(t) * ry;
    if ((a + f) % 4 !== 3) under(x, y, (a + f) % 8 < 4 ? C.ripple : C.rippleDim);
  }
}
// a chequered flag, wave frame f (0 / 1)
function flag(set, x0, y0, w, h, f) {
  for (let x = 0; x < w; x++) {
    const dy = f && x >= w / 2 ? 1 : 0;
    for (let y = 0; y < h; y++) set(x0 + x, y0 + y + dy, C.check[((x >> 1) + (y >> 1)) & 1]);
  }
}

function startFloat(f) {
  return sprite(26, 34, (set, under) => {
    ripples(under, 13, 27, 12, 4.5, f * 2);
    // (a drum: its top in the light, a white band round its side, the side darkening away from the sun)
    for (let y = 14; y < 32; y++) for (let x = 2; x < 25; x++) {
      const top = ellipse(x, y, 13, 19, 9.4, 3.6), side = Math.abs(x - 13) <= 9.4 && y >= 19 && y <= 26, bot = ellipse(x, y, 13, 26, 9.4, 3.6);
      if (top) { const rim = !ellipse(x, y, 13, 19, 7.6, 2.4), hl = x < 11 && y < 19; set(x, y, rim ? C.orange[hl ? 0 : 1] : hl ? C.orange[1] : C.orange[2]); }
      else if (side || bot) { const band = y >= 22 && y <= 23, k = x < 9 ? 1 : x > 18 ? 3 : 2; set(x, y, band ? C.white[Math.min(3, k - 1)] : C.orange[k]); }
    }
    for (let y = 5; y < 19; y++) set(13, y, y < 7 ? C.steel[0] : C.steel[1]);
    set(13, 4, C.yellow[1]);
    flag(set, 14, 5, 10, 7, f);
  });
}
function gateBuoy(n, red, f) {   // (f: the ripples' frame)
  const ds = String(n).split('').map(Number), fw = ds.length * 4 + 1;
  return sprite(Math.max(16, 10 + fw), 24, (set, under) => {
    ripples(under, 7, 19, 7, 3, f * 2);
    const P = red ? C.red : C.white;
    for (let y = 10; y < 22; y++) for (let x = 0; x < 15; x++) {
      if (!ellipse(x, y, 7, 16, 5, 5)) continue;
      const k = x < 5 && y < 15 ? 0 : x > 9 || y > 18 ? 2 : 1;
      set(x, y, y === 16 ? (red ? C.white : C.red)[Math.min(2, k)] : P[k]);
    }
    for (let y = 3; y < 12; y++) set(7, y, C.steel[1]);
    for (let y = 0; y < 7; y++) for (let x = 0; x < fw; x++) set(8 + x, 2 + y, C.yellow[y === 0 ? 0 : y === 6 ? 2 : 1]);
    ds.forEach((d, i) => { for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (DIG[d][y * 3 + x] === '1') set(9 + i * 4 + x, 3 + y, INK); });
  });
}
function landGate(n) {
  const ds = String(n).split('').map(Number), fw = ds.length * 4 + 1;
  return sprite(Math.max(16, 10 + fw), 24, (set, under) => {
    for (let x = 1; x < 14; x++) for (let y = 19; y < 23; y++) if (ellipse(x, y, 7, 21, 6, 1.6)) under(x, y, C.shadow);
    for (let y = 10; y < 21; y++) { const hw = Math.round(1 + (y - 10) * 0.42); for (let x = 7 - hw; x <= 7 + hw; x++) set(x, y, y === 14 || y === 15 ? C.white[x < 7 ? 0 : 2] : C.orange[x < 6 ? 0 : x > 8 ? 2 : 1]); }
    for (let x = 1; x < 14; x++) set(x, 21, C.orange[3]);
    for (let y = 3; y < 10; y++) set(7, y, C.steel[1]);
    for (let y = 0; y < 7; y++) for (let x = 0; x < fw; x++) set(8 + x, 2 + y, C.yellow[y === 0 ? 0 : y === 6 ? 2 : 1]);
    ds.forEach((d, i) => { for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (DIG[d][y * 3 + x] === '1') set(9 + i * 4 + x, 3 + y, INK); });
  });
}
function landStart(f) {
  return sprite(24, 36, (set, under) => {
    for (let x = 4; x < 16; x++) for (let y = 31; y < 35; y++) if (ellipse(x, y, 10, 33, 7, 2.2)) under(x, y, C.shadow);
    for (let y = 28; y < 33; y++) for (let x = 6; x < 15; x++) set(x, y, y === 28 ? C.concrete[0] : x > 12 ? C.concrete[2] : C.concrete[1]);
    for (let y = 4; y < 28; y++) { set(10, y, C.steel[1]); }
    set(10, 3, C.yellow[1]);
    flag(set, 11, 4, 10, 8, f);
  });
}
const get = (key, make) => { let c = cache.get(key); if (!c) { c = make(); cache.set(key, c); } return c; };
const WATER = { jetski: 1, kayak: 1, boat: 1 };

function label(g, text, x, y, col, size) {
  g.font = `700 ${size}px "CLA Pixel", "Barlow Condensed", sans-serif`; g.textAlign = 'center';
  g.fillStyle = INK; for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(text, x + dx, y + dy);
  g.fillStyle = col; g.fillText(text, x, y);
}

// view: the world rect drawn; now: seconds
export function drawRaceMarks(g, races, view, now) {
  const inView = (p) => p.x > view.x0 - 60 && p.x < view.x1 + 60 && p.y > view.y0 - 80 && p.y < view.y1 + 60;
  const f = Math.floor(now * 2.5) & 1, smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  const put = (cv, x, y, ax, ay) => g.drawImage(cv, Math.round(x / AP) * AP - ax * AP, Math.round(y / AP) * AP - ay * AP, cv.width * AP, cv.height * AP);
  for (const race of races) {
    const wet = !!WATER[race.kind || 'boat'];
    const lap = race.lapLen || race.cps.length;
    race.cps.forEach((c, k) => {
      if (!inView(c) || (race.laps && k >= lap)) return;   // (laps: each gate once)
      if (!wet) { put(get(`c:${k + 1}`, () => landGate(k + 1)), c.x, c.y, 7, 21); return; }
      const bob = Math.round(Math.sin(now * 2 + k)) * AP;
      put(get(`g:${k + 1}:${k % 2}:${f}`, () => gateBuoy(k + 1, !(k % 2), f)), c.x, c.y + bob, 7, 19);
    });
    const s = race.start;
    if (!inView(s)) continue;
    if (wet) put(get(`s:${f}`, () => startFloat(f)), s.x, s.y + Math.round(Math.sin(now * 2 + 9)) * AP, 13, 27);
    else put(get(`l:${f}`, () => landStart(f)), s.x, s.y, 10, 33);
    label(g, race.name, s.x, s.y + 26, '#fff6e0', 12);
    label(g, `START - ${{ jetski: 'jet skis', kayak: 'kayaks', wheels: 'anything on wheels', dirt: 'motorcycles' }[race.kind] || 'boats'}`, s.x, s.y + 40, '#ffd36b', 10);
  }
  g.imageSmoothingEnabled = smooth;
}
