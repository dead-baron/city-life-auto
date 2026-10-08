// The night sky through the Granite Peak Observatory's telescope (server places.js stargaze): a round eyepiece
// view in the game's pixel style - a field of stars, and tonight's sight in the middle (Saturn, Jupiter, the Moon,
// the Orion Nebula, Andromeda or a comet). The eyepiece picture is painted once per sight into a small canvas
// (one pixel per art pixel) and scaled up crisp; each frame only twinkles a few stars and turns the sky a little.
//
//   drawStarView(g, w, h, st, t)   st: { what, seed, dur } from the server's 'stars' message; t: seconds since it began
import { mulberry32 } from '../shared/rng.js';

const R = 118, N = R * 2 + 4;                        // the eyepiece's radius and the picture's size (art pixels)
const NAMES = { saturn: 'SATURN', jupiter: 'JUPITER', moon: 'THE MOON', nebula: 'ORION NEBULA', galaxy: 'ANDROMEDA GALAXY', comet: 'A COMET' };
const cache = new Map();

const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// paint one sight: { c: canvas, stars: [[x, y, b]] }
function paint(what, seed) {
  const key = `${what}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(0x5ca1 ^ seed * 7919 ^ what.length * 131);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const x2 = c.getContext('2d'), img = x2.createImageData(N, N), d = img.data;
  const C = N / 2;
  const put = (x, y, col, a = 1) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= N || y >= N) return;
    const i = (y * N + x) * 4;
    d[i] = d[i] * (1 - a) + col[0] * a; d[i + 1] = d[i + 1] * (1 - a) + col[1] * a; d[i + 2] = d[i + 2] * (1 - a) + col[2] * a; d[i + 3] = 255;
  };
  const inside = (x, y) => (x - C) * (x - C) + (y - C) * (y - C) < R * R;
  // the sky: deep blue-black, a touch lighter toward the middle, dithered
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (!inside(x, y)) { d[i] = 4; d[i + 1] = 5; d[i + 2] = 8; d[i + 3] = 255; continue; }
    const r = Math.hypot(x - C, y - C) / R, k = (1 - r * r) * 0.5 + BAYER[(y & 3) * 4 + (x & 3)] / 64;
    const col = mix([6, 8, 18], [16, 20, 40], Math.max(0, Math.min(1, k)));
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  // a band of the Milky Way across the field (fainter behind a bright sight)
  const band = rand() * Math.PI, bw = 26 + rand() * 18, faint = what === 'moon' ? 0.25 : 1;
  for (let k = 0; k < 2600 * faint; k++) {
    const u = (rand() - 0.5) * N * 1.4, v = (rand() + rand() + rand() - 1.5) * bw;
    const x = C + Math.cos(band) * u - Math.sin(band) * v, y = C + Math.sin(band) * u + Math.cos(band) * v;
    if (inside(x, y)) put(x, y, [170, 180, 220], 0.12 + rand() * 0.18);
  }
  // stars, some coloured; the bright ones with a little cross
  const stars = [];
  const SC = [[255, 255, 255], [190, 210, 255], [255, 240, 200], [255, 200, 150], [210, 225, 255]];
  for (let k = 0; k < 420; k++) {
    const x = Math.floor(rand() * N), y = Math.floor(rand() * N);
    if (!inside(x, y)) continue;
    const b = rand() ** 3, col = SC[Math.floor(rand() * SC.length)];
    put(x, y, col, 0.35 + b * 0.65);
    if (b > 0.55) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(x + dx, y + dy, col, 0.25 + (b - 0.55)); }
    stars.push([x, y, b]);
  }
  // tonight's sight
  const disc = (cx, cy, r, shade) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const u = (x + 0.5 - cx) / r, v = (y + 0.5 - cy) / r, q = u * u + v * v;
      if (q > 1) continue;
      const col = shade(u, v, Math.sqrt(1 - q), x, y);
      if (col) put(x, y, col, col[3] ?? 1);
    }
  };
  const dith = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5;
  if (what === 'saturn' || what === 'jupiter') {
    const sat = what === 'saturn', r = sat ? 24 : 30;
    const ring = (front) => {   // Saturn's rings: an ellipse, the back half drawn before the ball, the front half after
      for (let y = Math.floor(C - 16); y <= C + 16; y++) for (let x = Math.floor(C - 60); x <= C + 60; x++) {
        const u = (x + 0.5 - C) / 58, v = (y + 0.5 - C - (x - C) * 0.12) / 14, q = Math.hypot(u, v);
        if (q > 1 || q < 0.62 || (v < 0) === front) continue;
        if (q > 0.84 && q < 0.87) continue;                                  // the Cassini division
        if (front || Math.hypot(x + 0.5 - C, y + 0.5 - C) > r) {
          const k = (q - 0.62) / 0.38 + dith(x, y) * 0.15;
          put(x, y, mix([238, 220, 170], [150, 128, 92], Math.max(0, Math.min(1, k))), front ? 1 : 0.95);
        }
      }
    };
    if (sat) ring(false);
    disc(C, C, r, (u, v, z, x, y) => {
      const band = Math.sin(v * (sat ? 9 : 13) + (sat ? 0.4 : 1.2));
      let col = sat ? mix([232, 206, 140], [196, 160, 100], band * 0.5 + 0.5) : mix([236, 222, 196], [178, 120, 86], Math.max(0, band) * 0.9);
      if (!sat && Math.hypot((u - 0.35) / 1.6, (v - 0.32)) < 0.13) col = [196, 92, 64];    // the Great Red Spot
      const lit = 0.45 + 0.55 * z + dith(x, y) * 0.08;
      return [col[0] * lit, col[1] * lit, col[2] * lit];
    });
    if (sat) { ring(true); put(C + 74, C - 10, [255, 236, 200]); put(C - 90, C + 18, [220, 220, 230], 0.8); }
    else for (const m of [-82, -50, 44, 71]) { put(C + m, C + m * 0.04, [250, 245, 230]); put(C + m + 1, C + m * 0.04, [250, 245, 230], 0.6); }
  } else if (what === 'moon') {
    const r = 84, cx = C, cy = C;
    const craters = [];
    for (let k = 0; k < 46; k++) { const a = rand() * Math.PI * 2, q = Math.sqrt(rand()) * 0.92; craters.push([cx + Math.cos(a) * q * r, cy + Math.sin(a) * q * r, 2 + rand() ** 2 * 12]); }
    const maria = [[-0.3, -0.25, 0.32], [0.1, -0.35, 0.22], [0.25, 0.1, 0.28], [-0.15, 0.3, 0.2]];
    disc(cx, cy, r, (u, v, z, x, y) => {
      if (u < -0.42 + 0.05 * Math.sin(v * 7)) return [8, 9, 14];                    // the night side
      let g = 0.72 + dith(x, y) * 0.06;
      for (const [mu, mv, mr] of maria) if (Math.hypot(u - mu, v - mv) < mr) g -= 0.18;
      for (const [qx, qy, qr] of craters) {
        const dd = Math.hypot(x - qx, y - qy);
        if (dd < qr) g += (x - qx + y - qy) / qr * 0.12 - 0.06;                          // the rim lit from the right
        else if (dd < qr + 1.2) g += 0.08;
      }
      const term = Math.min(1, (u + 0.42) / 0.25);                                         // the shadow line
      g *= 0.35 + 0.65 * term;
      return [205 * g, 202 * g, 196 * g];
    });
  } else if (what === 'nebula') {
    const blobs = [];
    for (let k = 0; k < 26; k++) blobs.push([C + (rand() - 0.5) * 120, C + (rand() - 0.5) * 100, 14 + rand() * 30, rand()]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue;
      let pink = 0, teal = 0;
      for (const [bx, by, br, t] of blobs) { const q = Math.hypot(x - bx, y - by) / br; if (q < 1) { const w = (1 - q) * (1 - q); if (t < 0.65) pink += w; else teal += w; } }
      const k = Math.min(1, pink * 0.55 + dith(x, y) * 0.05), j = Math.min(1, teal * 0.5);
      if (k > 0.04) put(x, y, [236, 96, 140], k * 0.85);
      if (j > 0.04) put(x, y, [90, 200, 200], j * 0.6);
    }
    for (const [dx, dy] of [[-3, -2], [3, -3], [-2, 3], [4, 2]]) { put(C + dx, C + dy, [255, 255, 255]); put(C + dx + 1, C + dy, [220, 240, 255], 0.6); }
  } else if (what === 'galaxy') {
    const a = -0.6, ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inside(x, y)) continue;
      const u = ((x - C) * ca + (y - C) * sa) / 92, v = (-(x - C) * sa + (y - C) * ca) / 26, q = Math.hypot(u, v);
      if (q > 1) continue;
      let k = (1 - q) ** 1.6 + dith(x, y) * 0.06;
      if (Math.abs(v + 0.25 + 0.15 * u) < 0.07 && q > 0.25) k *= 0.45;                    // a dust lane
      const col = mix([170, 180, 230], [255, 236, 200], Math.max(0, 1 - q * 1.6));
      put(x, y, col, Math.max(0, Math.min(1, k)));
    }
    for (const [ox, oy, rr] of [[34, 30, 7], [-40, -22, 5]]) disc(C + ox, C + oy, rr, (u, v, z) => [230, 225, 210, z * 0.55]);
  } else if (what === 'comet') {
    const hx = C - 52, hy = C - 40;
    for (let k = 0; k < 2200; k++) {   // the dust tail (curved, yellowish) and the ion tail (straight, blue)
      const t = rand(), ion = rand() < 0.45;
      const x = hx + t * 170, y = hy + t * (ion ? 120 : 150) + (ion ? 0 : t * t * 40) + (rand() - 0.5) * (4 + t * 30);
      if (inside(x, y)) put(x, y, ion ? [140, 190, 255] : [255, 236, 190], (1 - t) * 0.22);
    }
    disc(hx, hy, 7, (u, v, z) => [210, 255, 220, z * 0.9]);
    put(hx, hy, [255, 255, 255]);
  }
  // the eyepiece's rim
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = Math.hypot(x - C, y - C) - R;
    if (q >= -1.5 && q < 2.5) put(x, y, q < 0 ? [40, 44, 56] : [22, 24, 30]);
  }
  x2.putImageData(img, 0, 0);
  const out = { c, stars: stars.filter((s) => s[2] > 0.2) };
  if (cache.size > 6) cache.clear();
  cache.set(key, out);
  return out;
}

export function drawStarView(g, w, h, st, t) {
  const P = paint(st.what, st.seed | 0);
  const fade = Math.max(0, Math.min(1, t / 0.7, (st.dur - t) / 0.7));
  const size = Math.floor(Math.min(w * 0.94, h * 0.94) / N) * N || Math.min(w, h) * 0.94, k = size / N;
  const x0 = (w - size) / 2, y0 = (h - size) / 2;
  g.save();
  g.globalAlpha = fade;
  g.fillStyle = '#030305';
  g.fillRect(0, 0, w, h);
  g.imageSmoothingEnabled = false;
  g.drawImage(P.c, x0, y0, size, size);
  // twinkle: a few of the brighter stars flare and dim
  for (let i = 0; i < P.stars.length; i += 3) {
    const [sx, sy, b] = P.stars[i], tw = Math.sin(t * (2.3 + (i % 7)) + i * 1.7);
    if (tw < 0.55) continue;
    g.fillStyle = `rgba(255,255,255,${((tw - 0.55) * 1.6 * (0.4 + b)).toFixed(2)})`;
    g.fillRect(x0 + sx * k, y0 + sy * k, k, k);
  }
  // tonight's sight, named
  g.font = `${Math.max(14, Math.round(size / 22))}px Anton, "Barlow Condensed", sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(220,226,255,0.85)';
  g.fillText(NAMES[st.what] || '', w / 2, y0 + size - size * 0.08);
  g.restore();
}
