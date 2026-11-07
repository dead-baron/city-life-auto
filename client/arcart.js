// The mini-games' screens drawn the SNES way (the owner, 11-06: "Pool also looks like placeholder art, can we update this
// art for the authentic SNES look we were aiming at?"): what stays still - the felt, the rails, the rink, the lane, the
// playfield - painted once, pixel by pixel at the screen's own resolution (256 wide), shaded in a few tones of each
// colour and dithered between them, then drawn up square (no smoothing); what moves - the balls, the puck, the mallets -
// small sprites painted the same way. The HUD's words and numbers in a little pixel font with a drop shadow, LED digits
// for the scores. Loaded with the games (client/pool.js, airhockey.js, skeeball.js, pinball.js), never with the page.
import { ramp } from './art2/palette.js';

export { ramp };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dith = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47;
export function hash(x, y, s = 0) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
// a tone of a ramp (dark .. light) for t 0..1, dithered by where it is
export const tone = (R, t, x, y, k = 0.9) => R[Math.max(0, Math.min(R.length - 1, Math.round(t * (R.length - 1) + dith(x, y) * k)))];
// a picture painted pixel by pixel: fn(put, W, H) with put(x, y, [r, g, b], a?) -> a canvas to draw up square
export function layer(W, H, fn) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), id = g.createImageData(W, H), d = id.data;
  const put = (x, y, c, a = 255) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const j = (y * W + x) * 4, k = a / 255;
    d[j] = d[j] * (1 - k) + c[0] * k; d[j + 1] = d[j + 1] * (1 - k) + c[1] * k; d[j + 2] = d[j + 2] * (1 - k) + c[2] * k; d[j + 3] = Math.max(d[j + 3], a);
  };
  fn(put, W, H);
  g.putImageData(id, 0, 0);
  return cv;
}
// draw a layer or sprite up square at (x, y)
export function blit(g, cv, x, y) { g.imageSmoothingEnabled = false; g.drawImage(cv, Math.round(x), Math.round(y)); }
// a ball (or a puck, a mallet's dome) lit from the top left: its colour in four tones, a stripe (the pool balls 9-15),
// a white spot (a pool ball's number dot), the shine; r its radius. Made once per look.
const BALLS = new Map();
export function ballSprite(col, r, o = {}) {
  const key = `${col}|${r}|${o.stripe || ''}|${o.dot ? 1 : 0}|${o.flat || 0}`;
  let cv = BALLS.get(key);
  if (cv) return cv;
  const n = Math.ceil(r) * 2 + 1, c = n / 2, R = ramp(col, 6, 3), Wt = ramp('#f2eee0', 5, 3);
  cv = layer(n, n, (put) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - c) / r, dy = (y + 0.5 - c) / r, q = dx * dx + dy * dy;
      if (q > 1.02) continue;
      const nz = Math.sqrt(Math.max(0, 1 - q)), l = o.flat ? 0.55 + 0.3 * nz - dy * 0.15 : 0.32 + 0.5 * (-dx * 0.55 - dy * 0.65 + nz * 0.6), white = o.stripe ? Math.abs(dy) > 0.45 : false;
      let px = tone(white ? Wt : R, Math.max(0, Math.min(1, l + (q > 0.8 ? -0.15 : 0))), x, y, 0.7);
      if (o.dot && Math.hypot(dx + 0.05, dy + 0.05) < 0.42) px = Wt[3];
      if (Math.hypot(dx + 0.42, dy + 0.48) < 0.2) px = [255, 255, 250];
      put(x, y, px);
    }
  });
  BALLS.set(key, cv);
  return cv;
}
// a soft round shadow under something (alpha over the floor)
export function shadow(g, x, y, rx, ry, a = 0.35) { g.fillStyle = `rgba(0,0,0,${a})`; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.29); g.fill(); }

// ---- the HUD: a 3x5 pixel font (as STARFALL's) with a shadow, LED digits, framed panels --------------------------------
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111', '-': '000000111000000', ' ': '000000000000000', ':': '000010000010000', '!': '010010010000010', '.': '000000000000010', '/': '001001010100100', '$': '011110010011110', '?': '110001010000010', '+': '000010111010000', "'": '010010000000000', ',': '000000000010100', '(': '010100100100010', ')': '010001001001010', '#': '101111101111101',
};
export const textW = (s, k = 1) => String(s).length * 4 * k - k;
// words at (x, y) in the pixel font (k: its scale), al: 'l' / 'c' / 'r'; a dark shadow under them
export function text(g, s, x, y, col = '#fff', k = 1, al = 'l', sh = true) {
  s = String(s).toUpperCase();
  const w = textW(s, k), x0 = Math.round(al === 'c' ? x - w / 2 : al === 'r' ? x - w : x), y0 = Math.round(y);
  for (const [dx, dy, c] of sh ? [[k, k, 'rgba(0,0,0,.75)'], [0, 0, col]] : [[0, 0, col]]) {
    g.fillStyle = c;
    for (let n = 0; n < s.length; n++) { const f = FONT[s[n]] || FONT[' ']; for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(x0 + dx + n * 4 * k + (i % 3) * k, y0 + dy + Math.floor(i / 3) * k, k, k); }
  }
  return w;
}
// a framed panel (the HUD's boxes: a dark fill, a gold or coloured edge)
export function panel(g, x, y, w, h, edge = '#c8a050', fill = 'rgba(8,10,24,.88)') {
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.fillStyle = edge; g.fillRect(x, y, w, 1); g.fillRect(x, y + h - 1, w, 1); g.fillRect(x, y, 1, h); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 1, y + 1, w - 2, 1);
}
// a message across the middle in a panel
export function banner(g, W, y, s, col = '#fff') { const w = textW(s) + 12; panel(g, Math.round((W - w) / 2), y, w, 13); text(g, s, W / 2, y + 4, col, 1, 'c'); }
// LED digits (a score): seven segments each, lit in col, the unlit ones faint; h the digit's height
const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
export function led(g, n, x, y, col, h = 11, digits = 2) {
  const s = String(Math.max(0, n | 0)).padStart(digits, '0'), w = Math.round(h * 0.55), t = Math.max(1, Math.round(h / 8));
  for (let i = 0; i < s.length; i++) {
    const m = SEG[+s[i]] || 0, ox = x + i * (w + t + 2), hh = Math.floor(h / 2);
    const segs = [[ox + t, y, w - 2 * t, t], [ox + w - t, y + t, t, hh - t], [ox + w - t, y + hh + 1, t, hh - t], [ox + t, y + h - t, w - 2 * t, t], [ox, y + hh + 1, t, hh - t], [ox, y + t, t, hh - t], [ox + t, y + hh, w - 2 * t, t]];
    segs.forEach((r, k) => { g.fillStyle = m & (1 << k) ? col : 'rgba(255,255,255,.07)'; g.fillRect(...r); });
  }
}
