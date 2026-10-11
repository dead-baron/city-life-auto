// The garden plots and the farm fields' rows on the page (H61: server/systems/gardening.js, farming.js), loaded the
// first time the server sends either. The server keeps them; this only draws what it's sent: S.garden, the plots near
// you ([x, y, crop, stage, flags] - crop -1 an empty plot; stage 0 seed .. 4 ripe; flags 1 dry, 2 wilted, 4 dead,
// 8 a prize one), and S.fields, the fields near you ({ x, y, w, h, v (rows run north-south), rw, segs, r: [state, growth
// %, done bits, field bits] a row }). Drawn on the ground under everything that stands on it, in both renderers - the
// classic view's world pass (drawV1) and art v2's ground decals (drawV2: art v2's ground is baked, the fields' crops
// with it, so the rows' live state goes on top of it near you). Small and cheap: a plot is one sprite (its soil and its
// three plants at their stage), a row a sprite per stretch of it (its look: stubble, ploughed, sown, growing, ripe);
// made once each, at the art's pixel (2 world px).
import { PAINTS } from '../../shared/vehicles.js';

const P = 2;   // world px per art pixel
const hsh = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- the look of a plot -------------------------------------------------------------------------------------------
const SOIL = [[88, 60, 38], [72, 48, 30], [104, 72, 46]], SOIL_DRY = [[146, 116, 82], [128, 100, 70], [160, 130, 94]];
const FRAME = [[132, 94, 56], [104, 72, 42]];
const GREEN = [[66, 138, 50], [48, 108, 38], [98, 170, 66]], WILT = [[164, 150, 70], [136, 120, 56], [180, 166, 92]], DEAD = [[104, 84, 58], [80, 64, 44], [120, 98, 68]];
const CROP_C = [[218, 46, 38], [238, 128, 34], [150, 210, 90], [236, 126, 30]];   // (gardening.js CROP_IDS: tomato, carrot, lettuce, pumpkin)
export const PLOT_W = 28, PLOT_H = 14;   // art px (56 x 28 world px)
export function plotPixels(c, st, fl, set) {
  for (let y = 0; y < PLOT_H; y++) for (let x = 0; x < PLOT_W; x++) {
    if (x === 0 || y === 0 || x === PLOT_W - 1 || y === PLOT_H - 1) { set(x, y, FRAME[(x + y) & 1]); continue; }
    const pal = fl & 1 ? SOIL_DRY : SOIL;
    set(x, y, pal[y % 3 === 2 ? 1 : hsh(x, y, 3) > 0.82 ? 2 : 0]);
  }
  if (c >= 0) for (let k = 0; k < 3; k++) plant(c, st, fl, 5 + k * 9, 7, set, k);
}
function plant(c, st, fl, cx, cy, set, k) {
  const dead = fl & 4, prize = fl & 8, G = dead ? DEAD : fl & 2 ? WILT : GREEN;
  if (st === 0) { set(cx, cy, [200, 176, 128]); set(cx + 2, cy + 1, [200, 176, 128]); return; }   // the seeds in the soil
  if (st === 1) { set(cx, cy, G[1]); set(cx, cy - 1, G[2]); set(cx + 1, cy - 1, G[0]); set(cx - 1, cy, G[0]); return; }   // a sprout
  const r = st === 2 ? 2 : 3;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 1 || (dead && (dx + dy) & 1) || hsh(cx + dx, cy + dy, k + 11) < 0.14) continue;
    set(cx + dx, cy + dy, G[(dx + dy + 9) % 3]);
  }
  if (dead) return;
  if (st === 3 && (c === 0 || c === 3)) { set(cx - 1, cy - 1, [246, 214, 66]); set(cx + 2, cy + 1, [246, 214, 66]); }   // in flower
  if (st !== 4) return;
  const col = CROP_C[c] || CROP_C[0];
  if (c === 0) for (const [dx, dy] of [[-1, -1], [1, 0], [0, 2], [-2, 1], [2, -2]]) set(cx + dx, cy + dy, col);   // tomatoes
  else if (c === 1) for (const dx of [-2, 0, 2]) { set(cx + dx, cy + 2, col); set(cx + dx, cy + 3, [206, 100, 26]); }   // the carrots' orange shoulders
  else if (c === 2) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = dx * dx + dy * dy; if (d <= 9) set(cx + dx, cy + dy, d <= 2 ? [196, 236, 128] : d <= 5 ? col : GREEN[0]); } }   // a head of lettuce
  else { const R = prize ? 4 : 3; for (let dy = -R + 1; dy <= R - 1; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy * 1.4 <= R * R) set(cx + dx, cy + dy, dx < -1 ? [196, 96, 22] : (dx & 1) ? col : [250, 150, 44]); set(cx, cy - R, [86, 110, 40]); }   // a pumpkin
  if (prize) { set(cx + 3, cy - 3, [255, 238, 130]); set(cx + 4, cy - 4, [255, 255, 226]); set(cx + 2, cy - 4, [255, 238, 130]); }   // a gleam: a prize one
}

// ---- the look of a row: 0 stubble, 1 ploughed, 2 sown, 3 sprouting, 4 growing, 5 tall, 6 ripe ----------------------
// (across: px across the row 0..w-1, along: px along it)
const STUB = [[176, 150, 92], [150, 124, 70], [196, 172, 112]], PLOW = [[84, 56, 34], [112, 78, 48], [64, 42, 26]];
const RIPE = [[214, 178, 74], [188, 150, 56], [238, 208, 112]];
export function rowLook(s, g) { return s === 0 ? 0 : s === 1 ? 1 : s === 3 ? 6 : g < 8 ? 2 : g < 30 ? 3 : g < 65 ? 4 : 5; }
export function rowPixel(look, a, b) {
  if (look === 0) return (b & 3) === 1 && hsh(a >> 1, b, 5) < 0.7 ? STUB[1] : hsh(a >> 1, b >> 1, 6) > 0.9 ? STUB[2] : STUB[0];
  const furrow = (b & 3) === 0 ? PLOW[1] : (b & 3) === 1 ? PLOW[2] : PLOW[0];
  if (look === 6) return (b & 3) === 2 ? RIPE[1] : hsh(a >> 1, b >> 1, 7) > 0.86 ? RIPE[2] : (b & 3) === 0 && hsh(a >> 1, b, 8) > 0.5 ? RIPE[1] : RIPE[0];
  if (look === 1) return furrow;
  const line = (b & 7) === 3 || (b & 7) === 4;
  if (look === 2) return line && (a & 3) === 0 ? [168, 140, 96] : furrow;                      // the seed drills
  if (look === 3) return line && (a & 3) < 2 ? GREEN[(a >> 2) % 3] : furrow;                  // sprouting
  if (look === 4) return (b & 7) >= 2 && (b & 7) <= 5 && hsh(a >> 1, b, 9) > 0.2 ? GREEN[(a + b) % 3] : furrow;   // growing
  return (b & 7) !== 0 || hsh(a >> 1, b, 10) > 0.6 ? GREEN[(a * 3 + b) % 3] : furrow;              // tall
}

// The tractor in the classic view (art v2 has its own model; the classic atlas has none): seen from above, facing +x -
// the big rear wheels under the cab at the back, the small front ones by the hood, the exhaust stack, the cab's roof.
export function drawTractor(g, L, W, paint, wreck) {
  const body = wreck ? '#3b302b' : paint, dark = '#1b1a18';
  g.fillStyle = dark;
  g.fillRect(-L / 2 + 2, -W / 2, 32, 13); g.fillRect(-L / 2 + 2, W / 2 - 13, 32, 13);          // the rear tyres
  g.fillRect(L / 2 - 24, -W / 2 + 5, 17, 9); g.fillRect(L / 2 - 24, W / 2 - 14, 17, 9);       // the front tyres
  g.fillStyle = '#3a3936';
  for (let k = 0; k < 32; k += 5) { g.fillRect(-L / 2 + 3 + k, -W / 2, 2, 13); g.fillRect(-L / 2 + 3 + k, W / 2 - 13, 2, 13); }   // the treads
  g.fillStyle = body;
  g.fillRect(-L / 2 + 30, -W / 2 + 15, L - 32, W - 30);                                        // the hood
  g.fillRect(-L / 2 + 4, -W / 2 + 11, 32, W - 22);                                              // the cab
  g.fillStyle = wreck ? '#2a2420' : '#efede6';
  g.fillRect(-L / 2 + 6, -W / 2 + 13, 28, W - 26);                                              // its roof
  g.fillStyle = wreck ? '#221d1a' : '#3f5f7c';
  g.fillRect(-L / 2 + 30, -W / 2 + 13, 4, W - 26);                                              // the windscreen's edge
  g.fillStyle = dark;
  g.fillRect(L / 2 - 4, -W / 2 + 17, 3, W - 34);                                                // the grille
  g.beginPath(); g.arc(L / 2 - 18, -W / 2 + 19, 3, 0, 6.283); g.fill();                         // the exhaust stack
}

// The combine harvester in the classic view (facing +x): the wide header and its reel at the front, the body and the
// grain tank, the cab over the header, the unloading auger folded along the side, the big front wheels.
export function drawCombine(g, L, W, paint, wreck) {
  const body = wreck ? '#3b302b' : paint, dark = '#1b1a18';
  g.fillStyle = dark;
  g.fillRect(L / 2 - 58, -W / 2 + 16, 30, 16); g.fillRect(L / 2 - 58, W / 2 - 32, 30, 16);     // the drive wheels
  g.fillRect(-L / 2 + 8, -W / 2 + 26, 20, 12); g.fillRect(-L / 2 + 8, W / 2 - 38, 20, 12);     // the steering wheels
  g.fillStyle = body;
  g.fillRect(-L / 2 + 4, -W / 2 + 30, L - 34, W - 60);                                           // the body
  g.fillStyle = wreck ? '#2c2622' : '#9a2a22';
  g.fillRect(-L / 2 + 18, -W / 2 + 36, 50, W - 72);                                              // the grain tank
  g.fillStyle = wreck ? '#2a2420' : '#d8c070';
  g.fillRect(-L / 2 + 22, -W / 2 + 40, 42, W - 80);                                              // the grain in it
  g.fillStyle = wreck ? '#33291f' : '#5a5650';
  g.fillRect(L / 2 - 26, -W / 2 + 2, 24, W - 4);                                                 // the header
  g.fillStyle = wreck ? '#2b2620' : '#c8a640';
  for (let y = -W / 2 + 6; y < W / 2 - 6; y += 6) g.fillRect(L / 2 - 6, y, 5, 3);               // its cutter bar's teeth
  g.fillStyle = body;
  g.fillRect(L / 2 - 22, -W / 2 + 4, 4, W - 8);                                                  // the reel
  g.fillRect(-L / 2 + 30, -W / 2 + 22, 46, 6);                                                   // the auger, folded
  g.fillStyle = wreck ? '#2a2420' : '#efede6';
  g.fillRect(L / 2 - 52, -14, 24, 28);                                                           // the cab's roof
  g.fillStyle = wreck ? '#221d1a' : '#3f5f7c';
  g.fillRect(L / 2 - 30, -12, 3, 24);                                                            // its windscreen
}

export class FarmArt {
  constructor(S) { this.S = S; this.cv = new Map(); }
  drawTractor(g, def, p, wreck) { (def.id === 'combine' ? drawCombine : drawTractor)(g, def.L, def.W, PAINTS[p % PAINTS.length] || '#c8262b', wreck); }
  // ---- the classic view: canvases made once, drawn in the world pass ----
  _canvas(key, w, h, fill) {
    let c = this.cv.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    fill((x, y, rgb) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; });
    g.putImageData(img, 0, 0);
    this.cv.set(key, c);
    return c;
  }
  drawV1(g, view) {
    const S = this.S;
    if (S.fields && S.fields.length) {
      g.imageSmoothingEnabled = false;
      for (const f of S.fields) {
        if (f.x > view.x1 || f.y > view.y1 || f.x + f.w < view.x0 || f.y + f.h < view.y0) continue;
        const len = f.v ? f.h : f.w, sl = len / f.segs, n = f.r.length >> 2;
        for (let r = 0; r < n; r++) {
          const s = f.r[r * 4], gr = f.r[r * 4 + 1], m = f.r[r * 4 + 2], ok = f.r[r * 4 + 3];
          for (let k = 0; k < f.segs; k++) {
            if (!(ok & (1 << k))) continue;
            const x = f.v ? f.x + r * f.rw : f.x + k * sl, y = f.v ? f.y + k * sl : f.y + r * f.rw, w = f.v ? f.rw : sl, h = f.v ? sl : f.rw;
            if (x > view.x1 || y > view.y1 || x + w < view.x0 || y + h < view.y0) continue;
            const look = m & (1 << k) ? (s === 0 ? 1 : s === 1 ? 2 : 0) : rowLook(s, gr);   // (done behind the tractor: the next look)
            const c = this._canvas(`r${look}${f.v}`, 32, 32, (set) => { for (let b = 0; b < 32; b++) for (let a = 0; a < 32; a++) { const rgb = rowPixel(look, a, b); f.v ? set(b, a, rgb) : set(a, b, rgb); } });
            for (let t = 0; t < (f.v ? h : w); t += 64) {
              const span = Math.min(64, (f.v ? h : w) - t);
              if (f.v) g.drawImage(c, 0, 0, 32, span / P, x, y + t, w, span); else g.drawImage(c, 0, 0, span / P, 32, x + t, y, span, h);
            }
          }
        }
      }
    }
    for (const q of S.garden || []) {
      const [x, y, c, st, fl] = q;
      if (x < view.x0 - 40 || x > view.x1 + 40 || y < view.y0 - 30 || y > view.y1 + 30) continue;
      const cv = this._canvas(`p${c}:${st}:${fl}`, PLOT_W, PLOT_H, (set) => plotPixels(c, st, fl, set));
      g.drawImage(cv, x - PLOT_W, y - PLOT_H, PLOT_W * P, PLOT_H * P);
    }
  }
  // ---- art v2: ground decals (the host's generated sprites: gbuf / put, made once and kept) ----
  drawV2(host, F, gbuf, put) {
    const S = this.S, E = host.E, x0 = host.vx0 - 64, x1 = host.vx1 + 64, y0 = host.vy0 - 64, y1 = host.vy1 + 64;
    const N = [128, 128, 255, 255], GROUND = 1;   // (flat ground: gbuf.js F_GROUND)
    if (S.fields && S.fields.length) for (const f of S.fields) {
      if (f.x > x1 || f.y > y1 || f.x + f.w < x0 || f.y + f.h < y0) continue;
      const len = f.v ? f.h : f.w, sl = Math.round(len / f.segs), n = f.r.length >> 2;
      for (let r = 0; r < n; r++) {
        const s = f.r[r * 4], gr = f.r[r * 4 + 1], m = f.r[r * 4 + 2], ok = f.r[r * 4 + 3];
        for (let k = 0; k < f.segs; k++) {
          if (!(ok & (1 << k))) continue;
          const x = f.v ? f.x + r * f.rw : f.x + k * (len / f.segs), y = f.v ? f.y + k * (len / f.segs) : f.y + r * f.rw;
          if (x > x1 || y > y1 || x + (f.v ? f.rw : sl) < x0 || y + (f.v ? sl : f.rw) < y0) continue;
          const look = m & (1 << k) ? (s === 0 ? 1 : s === 1 ? 2 : 0) : rowLook(s, gr);
          const key = host._conv(`farm|r${look}|${f.v}|${sl}|${f.rw}`, () => {
            const A = Math.ceil(sl / P), B = f.rw / P, w = f.v ? B : A, h = f.v ? A : B, G = gbuf(w, h, 0, 0);
            G.ap = P;
            for (let a = 0; a < A; a++) for (let b = 0; b < B; b++) put(G, f.v ? b : a, f.v ? a : b, rowPixel(look, a, b), 0, N, GROUND);
            return G;
          }, true);
          if (key) E.drawDecal(key, x, y, 0, 1, 0);
        }
      }
    }
    for (const q of S.garden || []) {
      const [x, y, c, st, fl] = q;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const key = host._conv(`farm|p${c}:${st}:${fl}`, () => {
        const G = gbuf(PLOT_W, PLOT_H, PLOT_W >> 1, PLOT_H >> 1);
        G.ap = P;
        plotPixels(c, st, fl, (px, py, rgb) => put(G, px, py, rgb, 0, N, GROUND));
        return G;
      }, true);
      if (key) E.drawDecal(key, x, y, 0, 1, 0);
    }
  }
}
