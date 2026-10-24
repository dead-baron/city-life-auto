// The shops' fit-outs (shared/shoprooms.js) drawn into a walk-in's cut-away room (client/art2/game/statics.js makeCut):
// floor, back wall, counter and what's on it, the wall's fittings, the floor's pieces as blocks in the 3/4 view (a top
// at its height, a south face to the floor); what's lit (a cooler, a sign, a screen) glows after dark.
import { hash, vnoise } from './gbuf.js';
import { ramp } from './palette.js';
import { drawText } from './font.js';

const RGB = new Map(), RAMP = new Map();
const rgb = (h) => { let c = RGB.get(h); if (!c) RGB.set(h, (c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])); return c; };
const rp = (h) => { if (typeof h !== 'string') return ramp(h, 5, 2); let c = RAMP.get(h); if (!c) RAMP.set(h, (c = ramp(h, 5, 2))); return c; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
const UP = [0, 0, 1], S = [0, 1, 0];
const GLASS = [150, 182, 196], DARK = [34, 34, 40], STEEL = [150, 156, 166], CHROME = [206, 212, 220], WHITE = [236, 236, 232], BRASS = [200, 160, 80];
const lit = (c, a = 200) => [c[0], c[1], c[2], a];

export function shopFloorPx(R, x, y) {
  const [pat, A, B] = R.floor, a = rgb(A), b = rgb(B), h = hash(x >> 1, y >> 1, 1601);
  switch (pat) {
    case 'check': return ((x >> 4) + (y >> 4)) & 1 ? b : a;
    case 'tile': return (x & 15) === 0 || (y & 15) === 0 ? b : h > 0.9 ? mix(a, b, 0.25) : a;
    case 'conc': { if ((x & 63) === 0 || (y & 63) === 0) return b; return mix(a, b, vnoise(x, y, 18, 1602) * 0.7 + h * 0.15); }
    case 'plank': { const row = y >> 3, sx = (x + ((hash(row, 1, 1603) * 64) | 0)) & 63; return (y & 7) === 0 || sx === 0 ? b : mix(a, b, hash(row, (x + ((hash(row, 1, 1603) * 64) | 0)) >> 6, 1604) * 0.45); }
    case 'carpet': return ((x + y) & 15) < 2 && ((x - y) & 15) < 2 ? b : mix(a, b, h * 0.3);
    case 'marble': { if ((x & 31) === 0 || (y & 31) === 0) return b; const v = Math.abs(vnoise(x, y, 22, 1605) - 0.5); return v < 0.012 ? mix(a, b, 0.55) : mix(a, b, v * 0.2 + h * 0.06); }
    case 'stone': return (x % 24) === 0 || (y % 24) === 0 ? b : mix(a, b, hash(x / 24 | 0, y / 24 | 0, 1606) * 0.35);
    case 'rubber': return h > 0.985 ? [230, 120, 40] : h > 0.97 ? [80, 160, 230] : mix(a, b, (x >> 5 & 1) * 0.3);
    case 'dance': return ((x >> 4) + (y >> 4)) & 1 ? b : a;
    default: return h > 0.8 ? b : h > 0.6 ? mix(a, b, 0.5) : a;
  }
}
export function shopWallPx(R, x, v) {
  const [pat, A, B] = R.wall, a = rgb(A), b = rgb(B);
  if (v < 3) return [44, 40, 40];
  switch (pat) {
    case 'panel': return v === 26 || v === 27 ? b : x % 12 === 0 ? mix(a, DARK, 0.4) : v < 26 ? mix(a, DARK, 0.15) : a;
    case 'brick': return v % 4 === 0 || (x + ((v >> 2) & 1) * 4) % 8 === 0 ? [150, 144, 136] : mix(a, DARK, hash(x >> 3, v >> 2, 1607) * 0.3);
    case 'peg': return v < 6 ? b : (x & 3) === 1 && (v & 3) === 1 ? mix(a, DARK, 0.5) : a;
    case 'tile': return v >= 18 && v < 22 ? b : (x & 7) === 0 || (v & 7) === 0 ? mix(a, DARK, 0.12) : a;
    case 'stone': return (v % 12) === 0 || (x + ((v / 12 | 0) & 1) * 12) % 24 === 0 ? mix(a, DARK, 0.3) : v >= 22 && v < 24 ? b : a;
    default: return v >= 18 && v < 22 ? b : mix(a, b, (hash(x >> 2, v >> 2, 1608) > 0.9) * 0.05);
  }
}

export function drawShop(R, u, r, px0, ox, oy) {
  const px = (x, Y, z, c, n = UP, e) => px0(Math.round(x), Math.round(Y), Math.round(z), c, n, 0, e);
  const X = (wx) => wx - ox, Yl = (wy) => wy - oy, BY = r.inY0;
  const slab = (x0, x1, Y0, Y1, z, top, side = top, z0 = 0, e) => {
    x0 = Math.round(x0); x1 = Math.round(x1); Y0 = Math.round(Y0); Y1 = Math.round(Y1);
    const T = typeof top === 'function' ? top : null, Sd = typeof side === 'function' ? side : null, tr = T ? null : rp(top), sr = Sd ? null : rp(side);
    for (let Y = Y0; Y < Y1; Y++) for (let x = x0; x < x1; x++) { const c = T ? T(x - x0, Y - Y0) : tr[Y === Y0 || x === x0 || x === x1 - 1 ? 3 : 2]; if (c) px(x, Y, z, c, UP, c.length > 3 ? c : undefined); }
    for (let x = x0; x < x1; x++) for (let v = z0; v < z; v++) { const c = Sd ? Sd(x - x0, v) : sr[v > z - 2 ? 3 : 1 + ((x - x0) % 8 ? 1 : 0)]; if (c) px(x, Y1, v, c, S, Sd && c.length > 3 ? c : undefined); }
  };
  const onWall = (x0, x1, v0, v1, f) => { const a = Math.round(x0), b = Math.round(x1); for (let x = a; x < b; x++) for (let v = v0; v < v1; v++) { const c = f(x - a, v - v0, b - a, v1 - v0); if (c) px(x, BY, v, c, S, c.length > 3 ? c : undefined); } };
  const dot = (x, Y, z, c, s = 2, e) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(x + dx, Y + dy, z, c, UP, e); };
  const H = (k, s) => hash(k, s, R.seed & 0xffff);

  for (const w of R.onWall) {
    const x0 = X(w.x0), x1 = X(w.x1), g = w.g || ['#8a8e96', '#c8a050', '#5a5e68'], c = w.c ? rgb(w.c) : null;
    if (x1 <= x0 || w.v1 > (r.H || 999) - 1) continue;
    const f = WALLF[w.t];
    if (f) onWall(x0, x1, w.v0, w.v1, (x, v, ww, hh) => f(x, v, ww, hh, g, c, w, R.seed));
    if (w.t === 'sign') {
      const col = rgb(w.c);
      drawText((x, v, sh) => { if (!sh) px(x0 + 3 + x, BY, w.v1 - 3 - v, col, S, lit(col, 230)); }, w.text, 0, 0, { sx: 2 });
    }
    if (w.t === 'goods' || w.t === 'bottles' || w.t === 'fridge' || w.t === 'shoes' || w.t === 'tools' || w.t === 'guns') for (let Y = BY; Y < BY + 8; Y++) for (let x = x0; x < x1; x++) px(x, Y, w.v1, [70, 70, 76], UP);
  }
  const C = R.counter, ca = u.x0 > u.fx0 ? u.x0 : u.x0 + 6, cb = u.x1 < u.fx1 ? u.x1 : u.x1 - (u.fx1 - u.fx0 > 128 ? 34 : 6), cy = u.cy;
  const top = rp(C.top), front = rp(C.front), trim = C.trim ? rgb(C.trim) : null, cg = (C.g || []).map(rgb), felt = C.felt ? rgb(C.felt) : null;
  for (let x = ca; x < cb; x++) {
    for (let Y = cy + 6; Y < cy + 26; Y++) {
      let c = top[Y === cy + 6 || Y === cy + 25 ? 3 : 2];
      if (C.k === 'glass' && Y > cy + 8 && Y < cy + 24 && x > ca + 2 && x < cb - 3) c = (x + Y) % 9 < 3 && hash(x >> 2, Y >> 2, 1611) > 0.6 ? cg[(x >> 3) % cg.length] : mix(felt, GLASS, 0.35);
      if (C.k === 'ice' && Y > cy + 8 && Y < cy + 24) c = (hash(x >> 3, Y >> 2, 1612) > 0.7 && (x & 7) < 6) ? [150, 160, 170] : hash(x, Y, 1613) > 0.7 ? WHITE : [214, 228, 234];
      px(x, Y, 22, c, UP);
    }
    for (let v = 0; v < 22; v++) {
      let c = v < 2 ? [40, 32, 28] : front[v > 18 ? 3 : (x - ca) % 24 === 0 ? 1 : 2];
      if (trim && v >= 18 && v < 20) c = trim;
      if (C.k === 'glass' && v > 4 && v < 17 && (x - ca) % 40 > 1) c = v > 6 && v < 12 && hash(x >> 2, v >> 2, 1614) > 0.55 ? cg[((x >> 3) + 1) % cg.length] : mix(felt, GLASS, v > 12 ? 0.6 : 0.3);
      if (C.k === 'bar' && v === 6) c = BRASS;
      if (C.k === 'ice' && v > 4 && v < 17) c = mix([200, 220, 228], [120, 150, 170], v / 20);
      px(x, cy + 26, v, c, S);
    }
  }
  if (C.k === 'teller') {
    for (let x = ca; x < cb; x++) { const post = (x - ca) % 48 < 3; for (let v = 22; v < 56; v++) if (post || v > 52 || (v < 26 && (x - ca) % 48 > 14 && (x - ca) % 48 < 34)) px(x, cy + 8, v, post || v > 52 ? BRASS : [170, 176, 180], S); }
  }
  const tx = X(R.tillX);
  slab(tx - 6, tx + 6, cy + 9, cy + 16, 29, '#34363c', '#4a4e58', 22); dot(tx - 3, cy + 10, 30, [120, 220, 140], 3, lit([120, 220, 140], 150));
  let side = 1;
  for (const k of C.on || []) {
    const x = tx + side * 24 + (side > 0 ? 0 : -12); side = -side;
    if (x < ca + 4 || x + 12 > cb - 4) continue;
    ON[k] && ON[k](slab, dot, px, x, cy);
  }

  for (const p of R.pieces) {
    const x0 = X(p.x0), x1 = X(p.x1), y0 = Yl(p.y0), y1 = Yl(p.y1), g = (p.g || []).map(rgb), c = p.c || '#6a6e78', h = p.h;
    switch (p.t) {
      case 'shelf': {
        const bw = p.bw || 4, gap = (q) => (q % bw) === bw - 1, ok = (q, k) => hash(Math.floor((x0 + q) / bw), k, 1619 + (y0 & 15)) > 0.18;
        const col = (q, k) => g[Math.floor(hash(Math.floor((x0 + q) / bw), k, 1620 + (y0 & 15)) * g.length)], dark = mix(rp(c)[1], DARK, 0.5);
        slab(x0, x1, y0, y1, h, (x, Y) => (Y === ((y1 - y0) >> 1) || x === 0 || x === x1 - x0 - 1 ? rp(c)[2] : gap(x) || (Y % 5) === 4 || !ok(x, 99 + (Y / 5 | 0)) ? dark : col(x, 99 + (Y / 5 | 0))),
          (x, v) => { if (v % 9 < 2 || v > h - 2) return rp(c)[1]; const k = v / 9 | 0, top = 2 + ((hash(Math.floor((x0 + x) / bw), k, 1621) * 6) | 0); return gap(x) || v % 9 > top || !ok(x, k) ? dark : p.bottles && (x & 1) ? mix(col(x, k), DARK, 0.3) : col(x, k); });
        break;
      }
      case 'cooler': if (p.low) { slab(x0, x1, y0, y1, h, (x, Y) => (x < 2 || x > x1 - x0 - 3 || Y < 2 || Y > y1 - y0 - 3 ? rp(c)[2] : hash((x0 + x) >> 2, Y >> 2, 1620) > 0.6 ? lit(g[Math.floor(hash(x >> 2, Y >> 2, 1621) * g.length)], 120) : lit([170, 214, 236], 120)), c); }
        else slab(x0, x1, y0, y1, h, c, (x, v) => (v < 4 || v > h - 5 || x % 22 < 2 ? rp(c)[1] : v % 10 < 1 ? lit([180, 220, 240], 150) : (x & 3) < 2 && v % 10 < 8 ? lit(g[((x >> 2) + (v / 10 | 0)) % g.length], 170) : lit([200, 232, 246], 140))); break;
      case 'case': slab(x0, x1, y0, y1, h, (x, Y) => (x < 2 || x > x1 - x0 - 3 || Y < 2 || Y > y1 - y0 - 3 ? rp(c)[3] : (x + Y) % 11 < 4 && hash((x0 + x) >> 2, Y >> 2, 1622) > 0.5 ? g[(x >> 3) % g.length] : mix(rgb(p.felt), GLASS, 0.3)), (x, v) => (v < 3 || v > h - 3 || x % 40 < 2 ? rp(c)[1] : mix(rgb(p.felt), GLASS, 0.5))); break;
      case 'gunrack': slab(x0, x1, y0, y1, 8, c); for (let x = x0 + 3; x < x1 - 3; x += 5) for (let v = 8; v < h; v++) px(x, y0 + 4, v, v < 16 ? rp(c)[2] : DARK, S); break;
      case 'pile': { const n = Math.max(2, Math.round((x1 - x0) * (y1 - y0) / 140)); for (let k = 0; k < n; k++) { const w = 6 + H(k, 1) * 10, d = 5 + H(k, 2) * 8, bx = x0 + H(k, 3) * (x1 - x0 - w), by = y0 + H(k, 4) * (y1 - y0 - d), z = 4 + H(k, 5) * h, col = p.g[Math.floor(H(k, 6) * p.g.length)]; if (p.balls) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy < 10) px(bx + 3 + dx, by + 3 + dy, 8 + H(k, 7) * 6, dx + dy < -2 ? mix(rgb(col), WHITE, 0.4) : rgb(col)); } else slab(bx, bx + w, by, by + d, Math.round(z), col); } break; }
      case 'mannequin': { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; slab(mx - 4, mx + 4, my - 2, my + 2, 2, '#5a5e68'); slab(mx - 1, mx + 1, my - 1, my + 1, 18, '#c8ccd2'); slab(mx - 5, mx + 5, my - 3, my + 2, h - 8, p.c, p.c, 18); if (p.c2) slab(mx - 5, mx + 5, my - 3, my + 2, 22, p.c2, p.c2, 18); slab(mx - 3, mx + 3, my - 2, my + 2, h, '#e8dcc8', '#e8dcc8', h - 8); break; }
      case 'lumber': for (let k = 0; k * 4 < h; k++) slab(x0 + (k & 1) * 2, x1 - ((k + 1) & 1) * 2, y0, y1, 4 + k * 4, c, (x, v) => (x % 16 === 0 ? rp(c)[0] : rp(c)[(v & 3) ? 2 : 1]), k * 4); break;
      case 'paint': slab(x0, x1, y0, y1, h - 8, '#7a7e86', '#5a5e68'); for (let x = x0 + 3; x + 4 < x1; x += 7) for (let Y = y0 + 2; Y + 4 < y1; Y += 6) { const col = g[Math.floor(hash(x, Y, 1623) * g.length)]; slab(x, x + 5, Y, Y + 4, h, (xx, YY) => (xx === 0 || YY === 0 ? STEEL : col), STEEL, h - 8); } break;
      case 'ladder': for (const lx of [x0, x1 - 2]) slab(lx, lx + 2, y0, y1, h, c); for (let v = 6; v < h; v += 7) for (let x = x0; x < x1; x++) px(x, y1, v, rp(c)[3], S); break;
      case 'machine': MACH[p.k] && MACH[p.k](slab, px, dot, x0, y0, x1, y1, h, H); break;
      case 'bins': for (let x = x0; x + 20 <= x1; x += 24) { const col = p.g[Math.floor(hash(x, y0, 1624) * p.g.length)]; slab(x, x + 22, y0, y1, h, '#8a6440'); for (let k = 0; k < 40; k++) { const qx = x + 3 + hash(k, x, 1625) * 16, qy = y0 + 3 + hash(k, y0, 1626) * (y1 - y0 - 6); dot(qx, qy, h + 1 + (hash(k, 3, 1627) * 3 | 0), mix(rgb(col), WHITE, hash(k, 4, 1628) * 0.3), 3); } } break;
      case 'posts': { const pc = rgb(p.c); for (const lx of [x0 + 2, x1 - 4]) { for (let Y = y0; Y <= y1; Y += 14) slab(lx - 1, lx + 2, Y - 1, Y + 1, h + 2, '#c8a050', '#b8bcc4'); for (let Y = y0; Y <= y1; Y++) for (const o of [0, 1]) px(lx + o, Y, h - 2 + Math.round(Math.abs(((Y - y0) % 14) - 7) / 3), pc); } break; }
      case 'rug': { const a = rp(p.c), b = rgb(p.c2); for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) { const e = Math.min(x - x0, x1 - 1 - x, Y - y0, y1 - 1 - Y); px(x, Y, 1, e < 2 ? a[1] : e < 4 ? b : ((x + Y) & 15) < 2 ? b : a[2]); } break; }
      case 'desk': { slab(x0, x1, y0, y1 - 8, h, c); slab(x0 + 10, x0 + 22, y0 + 2, y0 + 5, h + 12, '#22262e', '#3a4a66', h); dot(x0 + 28, y0 + 4, h + 1, WHITE, 4); slab(x0 + 14, x0 + 26, y1 - 6, y1, 10, '#2a2a30', '#3a3a44'); slab(x0 + 14, x0 + 26, y1 - 2, y1, 20, '#2a2a30', '#3a3a44', 10); break; }
      case 'bench': slab(x0, x1, y0, y1, h, c, (x, v) => (v < h - 4 && (x - 2) % 30 > 3 ? null : rp(c)[2])); break;
      case 'chairs': for (let x = x0; x + 11 <= x1; x += 13) { slab(x, x + 11, y0, y0 + 9, 9, p.c, '#7a7e86'); slab(x, x + 11, y0 + 9, y1, h, p.c, p.c, 9); } break;
      case 'chair': if (p.long) { slab(x0, x1, y0, y1, 12, p.c, '#5a5e68'); slab(x0, x0 + 8, y0, y1, 18, p.c, p.c, 12); }
        else { const mx = (x0 + x1) / 2; slab(mx - 5, mx + 5, y0 + 4, y1 - 4, 6, '#c8ccd2'); slab(x0, x1, y0 + 4, y1, 12, p.c, p.c, 6); slab(x0, x1, y0, y0 + 4, h, p.c, p.c, 6); if (p.arm) { slab(x0, x0 + 3, y0, y1, 16, p.c, p.c, 6); slab(x1 - 3, x1, y0, y1, 16, p.c, p.c, 6); } }
        break;
      case 'mirror': slab(x0, x1, y0, y1, h, c, (x, v) => (v < 12 ? rp(c)[1] : x < 2 || x > x1 - x0 - 3 || v > h - 3 ? rp(c)[3] : (x + v) % 13 < 2 ? [214, 230, 240] : [160, 188, 204])); break;
      case 'table': slab(x0, x1, y0, y1, h, c); for (let x = x0 + 3; x + 8 < x1; x += 11) slab(x, x + 8, y0 + 3, y1 - 3, h + 3 + (hash(x, 1, 1629) * 3 | 0), p.g[Math.floor(hash(x, y0, 1630) * p.g.length)], p.g[Math.floor(hash(x, y0, 1630) * p.g.length)], h); break;
      case 'rack': { for (const lx of [x0, x1 - 2]) slab(lx, lx + 2, y0 + 4, y0 + 8, h, '#a8aab0'); for (let x = x0 + 3; x < x1 - 3; x++) { const k = (x - x0) / 5 | 0, col = g[Math.floor(hash(k, y0, 1631) * g.length)], e = (x - x0) % 5; if (e === 4) continue; const cc = e === 0 ? mix(col, DARK, 0.35) : e === 3 ? mix(col, WHITE, 0.15) : col; for (let v = 6 + (hash(k, 3, 1632) * 6 | 0); v < h - 1; v++) px(x, y0 + 6, v, cc, S); px(x, y0 + 6, h, STEEL); } break; }
      case 'ice': slab(x0, x1, y0, y1, h, (x, Y) => { const fx = (x % 20) - 10, fy = (Y % 10) - 5; return Y > 2 && Y < y1 - y0 - 2 && fx * fx / 50 + fy * fy / 6 < 1 ? (fx > 6 ? [120, 130, 140] : [168, 180, 190]) : hash(x, Y, 1632) > 0.6 ? WHITE : [210, 226, 232]; }, '#7a8a96'); break;
      case 'stool': { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; for (let v = 0; v < h; v++) px(mx, my + 2, v, CHROME, [1, 0, 0]); for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) px(mx + dx, my + dy, h + 1, dx + dy < -2 ? mix(rgb(p.c), WHITE, 0.3) : rgb(p.c)); break; }
      case 'booth': { const m = (y0 + y1) / 2; slab(x0, x0 + 3, y0, y1, h, p.c); slab(x0 + 3, x0 + 9, y0, y1, 9, p.c); slab(x0 + 11, x1 - 11, y0 + 2, y1 - 2, 15, '#8a6440'); slab(x1 - 9, x1 - 3, y0, y1, 9, p.c); slab(x1 - 3, x1, y0, y1, h, p.c); dot((x0 + x1) / 2 - 1, m - 1, 16, [236, 200, 90]); break; }
      case 'pool': { slab(x0, x1, y0, y1, h, c); for (let Y = y0 + 5; Y < y1 - 5; Y++) for (let x = x0 + 5; x < x1 - 5; x++) px(x, Y, h + 1, rp(p.c2)[(x + Y) % 9 === 0 ? 1 : 2]); for (const [bx, by, col] of [[0.7, 0.4, WHITE], [0.6, 0.55, [220, 60, 50]], [0.64, 0.66, [240, 200, 60]], [0.56, 0.5, DARK]]) dot(x0 + (x1 - x0) * bx, y0 + (y1 - y0) * by, h + 2, col, 3); for (let k = 0; k < 50; k++) px(x0 + 16 + k, y0 + 14 + k * 0.2, h + 2, [200, 170, 110]); break; }
      case 'dance': for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) { const i = ((x - x0) >> 4) + ((Y - y0) >> 4) * 7, on = hash(i, 1, R.seed & 255) > 0.45, col = g[i % g.length]; if ((x & 15) === 0 || (Y & 15) === 0) px(x, Y, 1, [20, 18, 26]); else if (on) px(x, Y, 1, mix(col, [30, 26, 40], 0.35), UP, lit(col, 110)); } break;
      case 'plant': { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; slab(mx - 5, mx + 5, my - 4, my + 4, 9, '#b0603c', '#9a5030'); for (let k = 0; k < 120; k++) { const a = hash(k, x0, 81) * 6.283, d = Math.sqrt(hash(k, y0, 82)) * 8, z = 9 + hash(k, 3, 83) * (h - 4) * (1 - d / 10); px(mx + Math.cos(a) * d, my - 2 + Math.sin(a) * d * 0.6, z, [[52, 120, 58], [78, 156, 70], [40, 96, 48], [100, 176, 84]][k & 3], [Math.cos(a) * 0.5, -0.4, 0.75]); } break; }
      default: slab(x0, x1, y0, y1, h, c);
        if (p.cooler) slab(x0 + 2, x1 - 2, y0 + 1, y1 - 2, h + 9, [110, 170, 230], [90, 150, 220], h);
    }
  }
}

const frame = (x, v, w, h, k = 2) => x < k || x >= w - k || v < k || v >= h - k;
const WALLF = {
  goods: (x, v, w, h, g) => (v % 10 < 2 ? [92, 96, 104] : (x & 3) === 3 || v % 10 > 8 - (hash(x >> 2, v / 10 | 0, 1640) * 3 | 0) ? [54, 54, 60] : rgb(g[Math.floor(hash(x >> 2, v / 10 | 0, 1641) * g.length)])),
  cigs: (x, v, w, h) => (frame(x, v, w, h) ? [40, 40, 46] : (x % 6 === 5 || v % 8 === 7) ? [60, 60, 66] : rgb(['#e8e8e8', '#d8343a', '#2a5ab0', '#f0c030', '#3a8a4a', '#2a2a2e'][(x / 6 | 0) * 7 + (v / 8 | 0) * 3 & 3 + ((x / 6 | 0) & 1) * 2])),
  fridge: (x, v, w, h, g) => (x % 26 < 2 || v < 2 || v > h - 3 ? [176, 180, 188] : v % 10 < 1 ? lit([190, 220, 236], 150) : (x & 3) < 2 && v % 10 < 8 ? lit(rgb(g[((x >> 2) + (v / 10 | 0)) % g.length]), 170) : lit([206, 234, 246], 150)),
  bottles: (x, v, w, h, g, c, it) => { if (v % 12 === 0) return BRASS; const s = (x >> 2) * 5 + (v / 12 | 0), bh = 5 + (hash(s, 1, 1642) * 5 | 0); const b = (x & 3) < 2 && v % 12 <= bh && v % 12 > 0; return b ? (it.lit ? lit(rgb(g[s % g.length]), 120) : rgb(g[s % g.length])) : it.lit ? lit([60, 44, 34], 60) : [44, 34, 30]; },
  guns: (x, v, w, h) => { const row = (v - 2) % 12, k = (v - 2) / 12 | 0, sx = (x + k * 13) % 44; if (frame(x, v, w, h, 1)) return [70, 52, 36]; if (row >= 4 && row <= 6 && sx > 3 && sx < 40) return sx < 14 ? [110, 72, 40] : row === 5 && sx > 36 ? [60, 60, 66] : [36, 36, 40]; return (x & 3) === 1 && (v & 3) === 1 ? [120, 96, 70] : [150, 120, 86]; },
  tools: (x, v, w, h, g) => { const cell = (x / 14 | 0) * 5 + (v / 14 | 0), lx = x % 14, lv = v % 14, k = hash(cell, 1, 1643); const col = rgb(g[cell % g.length]); if (k < 0.33 ? (lx > 5 && lx < 8 && lv > 2 && lv < 12) || (lv > 9 && lv < 12 && lx > 2 && lx < 11) : k < 0.66 ? lx > 2 && lx < 11 && lv > 4 && lv < 9 : (lx > 6 && lx < 8 && lv > 1) || (lv < 4 && lx > 3 && lx < 11)) return k < 0.5 ? col : [140, 146, 154]; return (x & 3) === 1 && (v & 3) === 1 ? [140, 116, 80] : [196, 170, 122]; },
  guitars: (x, v, w, h, g) => { const lx = x % 22 - 11, col = rgb(g[(x / 22 | 0) % g.length]); if (v < 20 && (lx * lx) / 36 + ((v - 10) * (v - 10)) / 64 < 1) return Math.abs(lx) < 2 && Math.abs(v - 12) < 2 ? DARK : col; if (v >= 18 && v < 40 && Math.abs(lx) < 1.5) return [96, 64, 40]; return null; },
  tvs: (x, v, w, h) => { const lx = x % 24, lv = v % 16, k = (x / 24 | 0) * 3 + (v / 16 | 0); if (lx > 21 || lv > 13) return null; return lx < 2 || lx > 19 || lv < 2 || lv > 11 ? [52, 50, 54] : hash(k, 1, 1644) > 0.6 ? lit([120, 170, 220], 120) : [70, 84, 96]; },
  rail: (x, v, w, h, g) => (v === h - 4 ? STEEL : v < h - 4 && v > 8 && (x & 3) !== 0 ? rgb(g[Math.floor(hash(x >> 2, 1, 1645) * g.length)]) : null),
  shoes: (x, v, w, h, g) => (v % 12 < 2 ? [92, 96, 104] : v % 12 < 6 && x % 10 < 7 ? rgb(g[Math.floor(hash(x / 10 | 0, v / 12 | 0, 1646) * g.length)]) : [60, 60, 66]),
  mirror: (x, v, w, h) => { const lx = x % 40; return lx < 4 || lx > 36 ? null : v < 4 ? [70, 52, 40] : lx < 6 || lx > 34 || v > h - 3 ? [200, 196, 188] : (lx + v) % 15 < 2 ? [214, 232, 240] : [150, 180, 198]; },
  pole: (x, v) => ((x + v) % 6 < 2 ? [200, 40, 44] : (x + v) % 6 < 4 ? WHITE : [40, 80, 170]),
  rods: (x, v, w, h, g) => (x % 6 === 2 && v > 2 ? rgb(g[(x / 6 | 0) % g.length]) : x % 6 === 3 && v > h - 16 && v < h - 10 ? [140, 140, 150] : null),
  keys: (x, v, w, h) => (frame(x, v, w, h) ? [90, 60, 36] : x % 8 === 0 || v % 9 === 0 ? [110, 76, 46] : x % 8 === 4 && v % 9 > 2 && v % 9 < 7 && hash(x >> 3, v / 9 | 0, 1648) > 0.3 ? BRASS : [60, 40, 26]),
  vault: (x, v, w, h) => { const cx = w / 2, cv = h / 2, d = Math.hypot(x - cx, (v - cv) * 1.1); if (d > Math.min(w, h) / 2) return null; if (d > Math.min(w, h) / 2 - 3) return [90, 94, 100]; if (d < 4) return [200, 204, 210]; const a = Math.atan2(v - cv, x - cx); return Math.abs(Math.sin(a * 3)) < 0.12 && d < 14 ? [210, 214, 220] : [150 + (d % 6 < 1 ? -20 : 0), 156, 164]; },
  clock: (x, v, w, h) => { const d = Math.hypot(x - w / 2, v - h / 2); return d > w / 2 ? null : d > w / 2 - 1.5 ? [40, 40, 44] : (Math.abs(x - w / 2) < 1 && v >= h / 2) || (Math.abs(v - h / 2) < 1 && x >= w / 2 && x < w / 2 + 4) ? [30, 30, 34] : [240, 240, 232]; },
  seal: (x, v, w, h) => { const d = Math.hypot(x - w / 2, v - h / 2); return d > w / 2 ? null : d > w / 2 - 2 ? BRASS : d < w / 4 ? [200, 170, 90] : [40, 60, 120]; },
  flag: (x, v, w, h, g, c) => (x < 2 ? BRASS : v > h - 14 ? (x < 8 && v > h - 8 ? ((x + v) % 3 ? [40, 60, 140] : WHITE) : (v >> 1) & 1 ? (c || [200, 40, 44]) : WHITE) : null),
  head: (x, v, w, h) => { const cx = w / 2, lx = Math.abs(x - cx); if (v < 8 && lx < 7) return [70, 50, 36]; if (v >= 4 && v < 14 && lx < 4 - (v - 4) * 0.25) return [120, 84, 50]; if (v >= 14 && ((lx > 3 && lx < 5) || (v > 16 && lx > 5 && lx < 9 && (lx + v) % 3 === 0))) return [214, 200, 170]; return null; },
  fish: (x, v, w, h) => { const t = x / w, hw = (h / 2 - 1) * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (t < 0.85 ? 1 : 0); const dv = Math.abs(v - h / 2); if (t > 0.85) return dv < (t - 0.85) * h * 2.5 ? [70, 110, 90] : null; return dv < hw ? (dv < hw * 0.4 && t > 0.1 && t < 0.15 ? DARK : v > h / 2 ? [200, 210, 190] : [80, 130, 100]) : null; },
  poster: (x, v, w, h) => (frame(x, v, w, h, 1) ? [30, 30, 34] : v > h * 0.6 ? [240, 160, 60] : v > h * 0.35 ? [80, 180, 220] : [250, 220, 120]),
  cross: (x, v, w, h) => (((x > w / 3 && x < 2 * w / 3) || (v > h / 3 && v < 2 * h / 3)) ? lit([90, 230, 130], 220) : null),
  board: (x, v, w, h) => (frame(x, v, w, h) ? [70, 52, 40] : v % 6 === 3 && x > 3 && x < w - 4 && (x % 14) < 9 + (hash(x / 14 | 0, v, 1649) * 4 | 0) ? [236, 232, 220] : [36, 44, 40]),
  frames: (x, v, w, h) => (v % 12 < 2 ? [214, 210, 200] : v % 12 > 3 && v % 12 < 8 && ((x % 14 > 1 && x % 14 < 6) || (x % 14 > 7 && x % 14 < 12)) ? (x % 14 === 2 || x % 14 === 5 || x % 14 === 8 || x % 14 === 11 || v % 12 === 4 || v % 12 === 7 ? rgb(['#2a2a2e', '#8a2a2a', '#c8a050', '#2a5a8a'][(x / 14 | 0) % 4]) : [200, 220, 230]) : [236, 232, 224]),
  files: (x, v, w, h) => (x % 18 > 15 ? null : v % 11 < 1 || x % 18 < 1 || x % 18 > 14 ? [110, 114, 120] : v % 11 === 5 && x % 18 > 5 && x % 18 < 10 ? [60, 60, 64] : [160, 164, 170]),
  sign: (x, v, w, h, g, c) => (frame(x, v, w, h, 1) ? mix(c, DARK, 0.5) : [26, 22, 30]),
};
const ON = {
  lotto: (s, d, p, x, cy) => { s(x, x + 12, cy + 10, cy + 14, 36, '#2a2a30', (xx, v) => (v > 26 && v < 34 ? lit([255, 210, 80], 160) : [42, 42, 50]), 22); },
  hotdog: (s, d, p, x, cy) => { s(x, x + 14, cy + 9, cy + 18, 27, '#b8bcc2', '#8a8e96', 22); for (let k = 0; k < 4; k++) d(x + 2, cy + 10 + k * 2, 28, [190, 90, 60], 2); },
  jar: (s, d, p, x, cy) => { s(x + 2, x + 8, cy + 11, cy + 16, 30, '#a8c8d4', '#a8c8d4', 22); d(x + 3, cy + 12, 31, [90, 160, 80], 2); },
  gum: (s, d, p, x, cy) => { s(x, x + 12, cy + 9, cy + 13, 30, '#c83a2a', (xx, v) => [[240, 80, 120], [80, 200, 230], [250, 220, 90]][xx % 3], 22); },
  coffee: (s, d, p, x, cy) => { s(x, x + 10, cy + 9, cy + 15, 36, '#2a2a30', '#3a3a44', 22); d(x + 3, cy + 15, 26, [120, 70, 40], 3); },
  scale: (s, d, p, x, cy) => { s(x, x + 12, cy + 10, cy + 18, 26, '#d8dce2', '#9aa0a8', 22); s(x + 3, x + 9, cy + 9, cy + 11, 32, '#2a2a30', (xx, v) => lit([255, 120, 80], 140), 26); },
  bags: (s, d, p, x, cy) => { s(x, x + 10, cy + 10, cy + 18, 28, '#c8a878', '#b0905e', 22); },
  keys: (s, d, p, x, cy) => { s(x, x + 12, cy + 10, cy + 18, 30, '#8a8e96', '#5a5e68', 22); d(x + 3, cy + 12, 31, BRASS, 3); },
  ammo: (s, d, p, x, cy) => { for (let k = 0; k < 3; k++) s(x + k * 4, x + k * 4 + 4, cy + 10, cy + 16, 26 + k * 2, '#5a6a34', '#4a5a2a', 22); },
  pens: (s, d, p, x, cy) => { d(x + 2, cy + 12, 23, [40, 60, 140], 2); d(x + 6, cy + 13, 23, WHITE, 3); },
  bell: (s, d, p, x, cy) => { s(x + 3, x + 9, cy + 12, cy + 16, 26, '#e8c060', '#c8a040', 22); },
  taps: (s, d, p, x, cy) => { for (let k = 0; k < 4; k++) { const tx = x - 6 + k * 6; s(tx, tx + 2, cy + 8, cy + 10, 38, ['#c83a2a', '#e8c040', '#3a6ab0', '#2a2a2e'][k], CHROME, 22); } },
};
const MACH = {
  slush: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#d8dce2', (x, v) => (v > 12 && v < h - 4 && x % 8 > 1 ? lit(x < (x1 - x0) / 2 ? [230, 60, 80] : [60, 160, 240], 160) : [180, 184, 192])); },
  atm: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#5a5e68', (x, v) => (v > h - 14 && v < h - 4 && x > 2 && x < x1 - x0 - 3 ? lit([90, 220, 140], 160) : v > 14 && v < 20 && x > 3 && x < x1 - x0 - 4 && (x + v) & 1 ? [200, 204, 210] : [96, 100, 110])); },
  ice: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#eef2f4', (x, v) => (v > 6 && v < 12 ? [40, 110, 200] : [220, 228, 234])); },
  arcade: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#2a2040', (x, v) => (v > h - 6 ? lit([255, 90, 200], 180) : v > 18 && v < h - 10 && x > 2 && x < x1 - x0 - 3 ? lit([[60, 220, 255], [120, 255, 140], [255, 220, 90]][((x >> 2) + (v >> 2)) % 3], 160) : [44, 30, 80])); },
  papers: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#3a3c44', (x, v) => (v > 4 && v < h - 2 && x % 7 < 5 ? (v % 6 < 2 ? [40, 40, 44] : [228, 224, 214]) : [58, 60, 66])); },
  mower: (s, p, d, x0, y0, x1, y1, h) => { s(x0 + 2, x1 - 2, y0 + 2, y1 - 4, h - 6, '#2a8a3a', '#226e2e', 4); s(x0 + 8, x1 - 10, y0 + 6, y0 + 12, h, '#2a2a2e', '#2a2a2e', h - 6); for (const [wx, wy] of [[x0, y1 - 6], [x1 - 6, y1 - 6], [x0, y0], [x1 - 6, y0]]) s(wx, wx + 6, wy, wy + 6, 6, '#1e1e22'); },
  barrow: (s, p, d, x0, y0, x1, y1, h) => { s(x0 + 2, x1 - 6, y0 + 2, y1 - 2, h, '#c8302a', '#a8282a', 8); s(x1 - 6, x1, y0 + 6, y1 - 6, 8, '#2a2a2e'); },
  safe: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#3a4a3a', (x, v) => { const cx = (x1 - x0) / 2, dd = Math.hypot(x - cx, v - h * 0.6); return dd < 4 ? [200, 190, 150] : x < 2 || x > x1 - x0 - 3 || v < 2 || v > h - 3 ? [30, 38, 30] : [62, 78, 62]; }); },
  bike: (s, p, d, x0, y0, x1, y1, h) => { const my = (y0 + y1) / 2 | 0; for (const cx of [x0 + 7, x1 - 7]) for (let a = 0; a < 40; a++) p(cx + Math.cos(a / 6.4) * 6, my, 7 + Math.sin(a / 6.4) * 6, [30, 30, 34], [1, 0, 0]); for (let x = x0 + 7; x < x1 - 7; x++) p(x, my, 12 + (x - x0 < (x1 - x0) / 2 ? 0 : 2), [200, 40, 44], [1, 0, 0]); },
  tvstack: (s, p, d, x0, y0, x1, y1, h) => { for (let k = 0; k * 10 < h; k++) s(x0 + (k & 1) * 2, x1 - ((k + 1) & 1) * 2, y0, y1, 10 + k * 10, '#3a3a40', (x, v) => (v % 10 > 2 && v % 10 < 9 && x > 2 && x < x1 - x0 - 5 ? (k === 1 ? lit([120, 170, 220], 110) : [70, 84, 96]) : [50, 50, 56]), k * 10); },
  jukebox: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, h, '#5a3a24', (x, v) => (v > 8 && v < h - 4 && x > 2 && x < x1 - x0 - 3 ? lit([[255, 120, 60], [255, 210, 80], [90, 200, 255], [255, 90, 200]][((v >> 2) + (x >> 3)) & 3], 170) : [90, 58, 36])); },
  bp: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1 - 6, y0 + 4, y1, 10, '#3a62a8', '#2a4a80'); s(x0, x1 - 6, y0, y0 + 4, 22, '#3a62a8', '#2a4a80', 10); s(x1 - 6, x1, y0, y0 + 6, h, '#e8eaec', (x, v) => (v > h - 8 ? lit([255, 120, 80], 160) : [200, 204, 210])); },
  tank: (s, p, d, x0, y0, x1, y1, h, H) => { s(x0, x1, y0, y1, h - 14, '#2a2a30', '#3a3a44'); s(x0, x1, y0, y1, h, (x, v) => lit([60, 150, 190], 90), (x, v) => (v < h - 13 ? null : v > h - 3 ? [40, 40, 44] : (H(x >> 2, v >> 2) > 0.85 ? lit([255, 140, 60], 160) : (x + v) % 9 === 0 ? lit([120, 220, 120], 120) : lit([70, 170, 210], 120))), h - 14); },
  tv: (s, p, d, x0, y0, x1, y1, h) => { s(x0 + 4, x1 - 4, y0 + 2, y1 - 2, 12, '#3a2a20'); s(x0, x1, y0 + 4, y0 + 6, h, '#1e1e22', (x, v) => (v > 14 && v < h - 2 && x > 1 && x < x1 - x0 - 2 ? lit([110, 160, 220], 130) : [30, 30, 34]), 12); },
  lobster: (s, p, d, x0, y0, x1, y1, h, H) => { s(x0, x1, y0, y1, h, (x, v) => lit([80, 160, 200], 90), (x, v) => (v < 6 ? [60, 64, 70] : H(x >> 3, 9) > 0.6 && v < 12 ? [200, 60, 40] : lit([100, 180, 210], 110))); },
  tires: (s, p, d, x0, y0, x1, y1, h) => { for (let k = 0; k * 6 < h; k++) s(x0, x1, y0, y1, 6 + k * 6, (x, Y) => { const dd = Math.hypot(x - (x1 - x0) / 2, Y - (y1 - y0) / 2); return dd < 4 ? [70, 72, 78] : dd > (x1 - x0) / 2 ? null : [34, 34, 38]; }, (x, v) => (v % 6 === 0 ? [20, 20, 24] : [40, 40, 44]), k * 6); },
  cart: (s, p, d, x0, y0, x1, y1, h) => { s(x0, x1, y0, y1, 4, '#c8a050'); for (const lx of [x0, x1 - 2]) s(lx, lx + 2, y0, y0 + 2, h, '#c8a050'); for (let k = 0; k < 3; k++) s(x0 + 3 + k * 6, x0 + 8 + k * 6, y0 + 3, y1 - 2, 10 + k * 3, ['#5a3a26', '#3a5a7a', '#7a2a2a'][k], ['#5a3a26', '#3a5a7a', '#7a2a2a'][k], 4); },
};
