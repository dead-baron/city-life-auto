// The casinos' floors (shared/casinorooms.js) and the bars' card tables in the cut-away rooms (game/statics.js makeCut,
// shopart.js 'cards'), by tier: 3 marble, gilt columns, chandeliers, patterned carpet; 2 carpet and brass; 1 boards and
// plain felt. The wheel, the cards and the reels are drawn live over them (client/casinoview.js).
import { hash, F_GROUND } from './gbuf.js';
import { ramp } from './palette.js';

const UP = [0, 0, 1], S = [0, 1, 0];
const RP = new Map();
const rp = (h) => { if (typeof h !== 'string') return ramp(h, 5, 2); let c = RP.get(h); if (!c) RP.set(h, (c = ramp(h, 5, 2))); return c; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
const lit = (c, a = 200) => [c[0], c[1], c[2], a];
const GOLD = [226, 186, 70], BRASS = [196, 154, 74], DARK = [30, 28, 34], WHITE = [236, 234, 226], RED = [196, 34, 40], BLK = [34, 32, 36], GRN = [40, 150, 70];
const LOOK = {
  3: { felt: '#1f6a44', rail: '#3a2218', trim: GOLD, stool: '#8a1a26', top: [255, 214, 110] },
  2: { felt: '#1e5a6a', rail: '#2a2230', trim: BRASS, stool: '#3a2a6a', top: [255, 90, 200] },
  1: { felt: '#2f6a3a', rail: '#5a3a24', trim: null, stool: '#6a4630', top: [255, 170, 80] },
};
export const lookOf = (tier) => LOOK[tier] || LOOK[1];

export function casinoFloorPx(R, x, y) {
  const t = R.tier, run = R.pieces.find((p) => p.t === 'runner' && x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1);
  if (run) { const e = x - run.x0 < 3 || run.x1 - x <= 3; return e ? GOLD : t === 3 ? ((y >> 2) & 1 ? [150, 22, 34] : [140, 20, 32]) : [34, 30, 80]; }
  if (t === 3) {
    if (x - R.X0 < 22 || R.X1 - x <= 22 || y - R.Y0 < 22 || R.Y1 - y <= 22) { if ((x & 31) === 0 || (y & 31) === 0) return [200, 194, 182]; const v = hash(x >> 3, y >> 3, 1801); return v > 0.93 ? [208, 200, 188] : [234, 228, 216]; }
    const a = (x + y) & 23, b = (x - y + 2400) & 23;
    if (a === 0 || b === 0) return GOLD;
    const cx = ((x + y) / 24 | 0) + ((x - y + 2400) / 24 | 0);
    return (a > 9 && a < 14 && b > 9 && b < 14) ? (cx & 1 ? [26, 32, 70] : [210, 170, 70]) : [118, 20, 34];
  }
  if (t === 2) { const ax = x % 24 - 12, ay = y % 24 - 12, k = ax * ax + ay * ay; return k < 3 ? [220, 160, 70] : k > 30 && k < 42 ? (((x / 24 | 0) + (y / 24 | 0)) & 1 ? [36, 120, 124] : [140, 52, 120]) : (x + y) % 48 === 0 ? [70, 40, 90] : [44, 22, 60]; }
  const run1 = Math.abs(x - (R.dx + R.dw / 2)) < R.dw / 2 + 2;
  if (run1) return hash(x >> 1, y >> 1, 1802) > 0.8 ? [120, 54, 44] : [140, 46, 38];
  const row = y >> 3, sx = (x + ((hash(row, 1, 1803) * 64) | 0)) & 63;
  return (y & 7) === 0 || sx === 0 ? [74, 50, 32] : mix([130, 92, 58], [104, 72, 44], hash(row, x >> 5, 1804));
}
export function casinoWallPx(R, x, v) {
  const t = R.tier;
  if (t === 3) { if (x % 96 < 6) return v % 20 < 2 ? [180, 140, 50] : GOLD; if (v < 24) return v === 23 ? GOLD : (x % 24 === 0 ? [50, 28, 20] : [74, 42, 28]); if (v < 27) return GOLD; return ((x + v) % 12 === 0 || (x - v + 1200) % 12 === 0) ? [140, 34, 44] : [110, 22, 34]; }
  if (t === 2) { if (v === 22 || v === 23) return lit([255, 80, 200], v === 22 ? 220 : 140); return v < 22 ? [40, 34, 52] : (x & 15) === 0 ? [70, 50, 96] : [54, 36, 80]; }
  return v === 20 ? [70, 46, 30] : v < 20 ? (x % 10 === 0 ? [80, 54, 34] : [110, 76, 48]) : (x % 14 === 0 ? [120, 84, 54] : [150, 112, 74]);
}

export function kit(px0) {
  const px = (x, Y, z, c, n = UP, e) => px0(Math.round(x), Math.round(Y), Math.round(z), c, n, 0, e);
  const slab = (x0, x1, Y0, Y1, z, top, side = top, z0 = 0) => {
    x0 = Math.round(x0); x1 = Math.round(x1); Y0 = Math.round(Y0); Y1 = Math.round(Y1);
    const T = typeof top === 'function' ? top : null, Sd = typeof side === 'function' ? side : null, tr = T ? null : rp(top), sr = Sd ? null : rp(side);
    for (let Y = Y0; Y < Y1; Y++) for (let x = x0; x < x1; x++) { const c = T ? T(x - x0, Y - Y0) : tr[Y === Y0 || x === x0 || x === x1 - 1 ? 3 : 2]; if (c) px(x, Y, z, c, UP, c.length > 3 ? c : undefined); }
    for (let x = x0; x < x1; x++) for (let v = z0; v < z; v++) { const c = Sd ? Sd(x - x0, v) : sr[v > z - 2 ? 3 : 1 + ((x - x0) % 8 ? 1 : 0)]; if (c) px(x, Y1, v, c, S, c.length > 3 ? c : undefined); }
  };
  const dot = (x, Y, z, c, s = 2, e) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(x + dx, Y + dy, z, c, UP, e); };
  const disc = (cx, cY, rad, z, f) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d = Math.hypot(dx, dy); if (d <= rad + 0.2) { const c = f(dx, dy, d); if (c) px(cx + dx, cY + dy, z, c, UP, c.length > 3 ? c : undefined); } } };
  return { px, slab, dot, disc };
}
const POCKET = (k) => (k === 0 ? GRN : k & 1 ? RED : BLK);
export function stool(q, x, Y, c) { for (let v = 0; v < 11; v++) q.px(x, Y + 2, v, [180, 184, 190], [1, 0, 0]); q.disc(x, Y, 3, 12, (dx, dy) => (dx + dy < -2 ? mix(rp(c)[2], WHITE, 0.3) : rp(c)[2])); }
export function drawGameTable(q, T, X, Y, tier, seatsToo = true) {
  const L = lookOf(tier), x0 = X(T.x0), y0 = Y(T.y0), x1 = X(T.x1), y1 = Y(T.y1), w = x1 - x0, d = y1 - y0, h = T.h, felt = rp(L.felt), rail = rp(L.rail);
  if (seatsToo) for (const s of T.seats) stool(q, X(s.x), Y(s.y), L.stool);
  const apron = (x, v, leg) => (v >= h - 4 ? (L.trim && v === h - 3 ? L.trim : rail[v === h - 1 ? 3 : 2]) : leg ? rail[1] : null);
  if (T.g === 'rou') {
    q.slab(x0, x1, y0, y1, h, (x, Yy) => {
      if (x < 2 || Yy < 2 || x >= w - 2 || Yy >= d - 2) return L.trim && (x === 1 || Yy === 1 || x === w - 2 || Yy === d - 2) ? L.trim : rail[2];
      const gx = x - 6, gy = Yy - 5, cw = 4, ch = 7;
      if (gx >= 0 && gx < 4 && gy >= 0 && gy < 21) return gx === 3 || gy === 0 || gy === 20 ? WHITE : GRN;
      const c = ((gx - 4) / cw) | 0, r = (gy / ch) | 0;
      if (gx >= 4 && c < 12 && gy >= 0 && gy < 21) return (gx - 4) % cw === 0 || gy % ch === 0 ? WHITE : POCKET(c * 3 + 3 - r);
      return felt[(x + Yy) % 11 === 0 ? 1 : 2];
    }, (x, v) => apron(x, v, x < 3 || x >= w - 3 || (x > w / 2 - 2 && x < w / 2 + 2)));
    const wx = X(T.wheel.x), wy = Y(T.wheel.y), r = T.wheel.r;
    q.disc(wx, wy, r + 2, h + 1, (dx, dy, dd) => (dd > r ? (L.trim && dd > r + 1 ? L.trim : rail[3]) : null));
    q.disc(wx, wy, r, h + 2, (dx, dy, dd) => (dd < 3 ? GOLD : dd < r - 3 ? [90, 58, 34] : POCKET(((Math.atan2(dy, dx) + 3.1416) / 6.2832 * 37 | 0) % 37)));
    return;
  }
  const inside = T.g === 'bj'
    ? (x, Yy) => { const u = (x + 0.5 - w / 2) / (w / 2), v = (Yy + 0.5) / d; return u * u + v * v <= 1; }
    : (x, Yy) => { const u = (x + 0.5 - w / 2) / (w / 2), v = (Yy + 0.5 - d / 2) / (d / 2); return u * u + v * v <= 1; };
  const edge = (x, Yy) => !inside(x - 2, Yy) || !inside(x + 2, Yy) || !inside(x, Yy + 2) || (T.g === 'pk' && !inside(x, Yy - 2));
  q.slab(x0, x1, y0, y1, h, (x, Yy) => {
    if (!inside(x, Yy)) return null;
    if (edge(x, Yy)) return L.trim && (!inside(x - 3, Yy) || !inside(x + 3, Yy) || !inside(x, Yy + 3)) && !(!inside(x - 1, Yy) || !inside(x + 1, Yy) || !inside(x, Yy + 1)) ? L.trim : rail[2];
    return felt[(x * 3 + Yy) % 13 === 0 ? 1 : 2];
  }, (x, v) => (inside(x, d - 1) || inside(x, d - 3) ? apron(x, v, Math.abs(x - w / 2) < 4) : null));
  for (const c of T.cards) q.disc(X(c.x), Y(c.y), 3, h + 1, (dx, dy, dd) => (dd > 2.2 ? mix(felt[2], WHITE, 0.5) : null));
  if (T.g === 'bj') for (let k = 0; k < 8; k++) q.dot(X(T.cx) - 12 + k * 3, y0 + 2, h + 1, [[200, 40, 44], [40, 90, 200], [30, 30, 30], [40, 160, 70]][k & 3], 2);
}
export function drawSlot(q, M, X, Y, tier) {
  const L = lookOf(tier), x0 = X(M.x0), y0 = Y(M.y0), x1 = X(M.x1), y1 = Y(M.y1), cab = tier === 3 ? '#5a1a2a' : tier === 2 ? '#2a2a4a' : '#6a3a24';
  stool(q, X(M.seat.x), Y(M.seat.y), L.stool);
  const top = L.top;
  q.slab(x0, x1, y0, y1, M.h, (x, Yy) => (Yy < 3 ? lit(top, 210) : rp(cab)[2]), (x, v) => {
    if (v >= M.h - 4) return lit(top, 230);
    if (x === 0 || x === x1 - x0 - 1) return L.trim || rp(cab)[3];
    if (v >= 16 && v < 26) return x > 1 && x < x1 - x0 - 2 ? (v === 16 || v === 25 ? DARK : lit([236, 236, 226], 90)) : rp(cab)[1];
    if (v >= 11 && v < 14) return (x & 3) === 1 ? lit([255, 80, 60], 200) : DARK;
    return v < 2 ? DARK : rp(cab)[2];
  });
}
export function drawCasino(R, u, r, px0, ox, oy) {
  const q = kit(px0), X = (wx) => wx - ox, Y = (wy) => wy - oy, L = lookOf(R.tier), BY = r.inY0;
  for (const lp of R.lamps) {
    const cx = X(lp.x), cY = Y(lp.y), rad = lp.r, c = R.tier === 2 ? [255, 150, 220] : [255, 206, 140];
    for (let Yy = Math.max(r.inY0, Math.round(cY - rad * 0.8)); Yy < Math.min(r.inY1, cY + rad * 0.8); Yy++) for (let x = Math.max(u.x0, Math.round(cx - rad)); x < Math.min(u.x1, cx + rad); x++) {
      const dd = Math.hypot(x - cx, (Yy - cY) * 1.25) / rad;
      if (dd >= 1) continue;
      const a = (1 - dd) * (1 - dd) * lp.k;
      px0(x, Yy, 0, mix(casinoFloorPx(R, x + ox, Yy + oy), c, Math.min(0.45, a * 0.22)), UP, F_GROUND, [c[0], c[1], c[2], Math.min(110, Math.round(a * 60))]);
    }
  }
  if (!r.north) for (let x = u.x0 + 40; x + 40 < u.x1 - 40; x += 120) for (let xx = x; xx < x + 40; xx++) for (let v = 32; v < 58; v++) {
    const e = xx - x < 2 || x + 40 - xx <= 2 || v < 34 || v >= 56;
    const c = R.tier === 3 ? (e ? GOLD : mix([70, 90, 120], [150, 160, 170], hash(xx >> 2, v >> 2, 1810))) : e ? DARK : ((xx + v) & 3) === 0 ? lit([255, 220, 120], 230) : [60, 40, 30];
    q.px(xx, BY, v, c, S, c.length > 3 ? c : undefined);
  }
  const ca = X(R.cage.x0), cb = X(R.cage.x1), cy = Y(R.cage.y0);
  if (cb > u.x0 && ca < u.x1) {
    q.slab(ca, cb, cy + 6, cy + 26, 22, R.tier === 1 ? '#5a3a24' : '#2a2026', (x, v) => (v === 18 || v === 19 ? (L.trim || [150, 110, 60]) : rp(R.tier === 1 ? '#6a4630' : '#3a2a30')[v > 19 ? 3 : 2]));
    for (let x = Math.round(ca); x < cb; x++) for (let v = 22; v < 54; v++) { const k = (x - ca) % 6; if (k === 0 || v > 51 || v === 22) q.px(x, cy + 8, v, R.tier === 1 ? [120, 120, 126] : BRASS, S); else if (v > 44 && v < 50 && (x - ca) % 48 > 14 && (x - ca) % 48 < 34) q.px(x, cy + 8, v, lit([255, 210, 110], 200), S, lit([255, 210, 110], 200)); }
  }
  const order = [...R.tables.map((T) => ({ y: T.y1, T })), ...R.slots.map((M) => ({ y: M.y1, M })), ...R.pieces.filter((p) => p.t === 'column').map((C) => ({ y: C.y1, C }))].sort((a, b) => a.y - b.y);
  for (const o of order) {
    if (o.T) drawGameTable(q, o.T, X, Y, R.tier);
    else if (o.M) drawSlot(q, o.M, X, Y, R.tier);
    else { const x0 = X(o.C.x0), y0 = Y(o.C.y0); q.slab(x0, x0 + 10, y0, y0 + 10, 64, (x, Yy) => (x === 0 || Yy === 0 ? GOLD : [232, 226, 214]), (x, v) => (v < 4 || v > 58 || v === 30 ? GOLD : x % 3 === 0 ? [206, 200, 188] : [232, 226, 214])); }
  }
  for (const p of R.pieces) if (p.t === 'chand') {
    const cx = X(p.x0) + 7, cY = Y(p.y0) + 7;
    q.disc(cx, cY, 9, 60, (dx, dy, dd) => (dd > 7.6 ? GOLD : dd > 6 ? ((dx * 3 + dy) & 3 ? null : lit([255, 250, 230], 240)) : dd < 1.5 || Math.abs(dx) < 1 || Math.abs(dy) < 1 ? GOLD : (dx + dy) & 1 ? lit([255, 246, 220], 230) : null));
    q.disc(cx, cY, 4, 66, (dx, dy) => ((dx + dy) & 1 ? lit([255, 240, 200], 240) : GOLD));
    for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8], [-6, -6], [6, 6], [-6, 6], [6, -6]]) for (let v = 55; v < 60; v++) q.px(cx + dx, cY + dy, v, lit([255, 250, 235], 230), S, lit([255, 250, 235], 230));
    for (let v = 66; v < 80; v++) q.px(cx, cY, v, GOLD, S);
  }
}
