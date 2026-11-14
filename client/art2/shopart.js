// The shops' fit-outs (shared/shoprooms.js) drawn into a walk-in's cut-away room (client/art2/game/statics.js makeCut):
// floor, back wall, counter and what's on it, the wall's fittings, the floor's pieces as blocks in the 3/4 view (a top
// at its height, a south face to the floor); what's lit (a cooler, a sign, a screen, a lamp) glows after dark. Wave D
// (the 11-03 concept audit; RT9, RT3, ST1, IN6, IN3, IN5, MC4): goods drawn as objects - boxes, bags, bottles, cans,
// pill packs, guitars, TVs, shirts on hangers - in facings on the 2 px art grid, not coloured noise; the island pieces
// (glass cases, floor racks, display tables, rugs, mannequins); wall signs in the sign faces (signfont.js); pools of
// lamplight on the floor.
import { hash, vnoise, F_GROUND } from './gbuf.js';
import { ramp } from './palette.js';
import { layoutSign, paintBoard, paintLine, lineMask, palOf, legible, luminance, hotOf } from './signfont.js';

const RGB = new Map(), RAMP = new Map();
const rgb = (h) => { if (typeof h !== 'string') return h; let c = RGB.get(h); if (!c) RGB.set(h, (c = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])); return c; };
const rp = (h) => { if (typeof h !== 'string') return ramp(h, 5, 2); let c = RAMP.get(h); if (!c) RAMP.set(h, (c = ramp(h, 5, 2))); return c; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
const UP = [0, 0, 1], S = [0, 1, 0];
const GLASS = [150, 182, 196], DARK = [34, 34, 40], STEEL = [150, 156, 166], CHROME = [206, 212, 220], WHITE = [236, 236, 232], BRASS = [200, 160, 80], GOLD = [232, 192, 64];
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

// ---- goods as objects -------------------------------------------------------------------------------------------------
// One item seen from the front, w x h world px (lx from its left, lv up from its foot): a box with its label band and a
// lit top, a bag with a crimped top, a bottle with a neck and a label, a can with its rim, a jug, a pill pack - all on
// the 2 px art grid. Items stand in facings: runs of two to four alike, then the next product.
const ITEM_K = {
  snacks: ['bag', 'box', 'bag', 'box', 'tall'], chips: ['bag'], drinks: ['bottle', 'can', 'bottle', 'jug'], bottles: ['bottle', 'wine', 'bottle'],
  meds: ['pill', 'pack', 'pill', 'box'], oil: ['jug', 'can', 'box'], produce: ['round', 'round', 'box'], tools: ['pack', 'box', 'can'],
  clutter: ['tv', 'radio', 'box', 'boot', 'box'], tackle: ['pack', 'box', 'can'], sleeves: ['sleeve'], shoes: ['boot'], gold: ['ring'], guns: ['gun'], shades: ['pack'],
};
const ITEM_W = { bag: 6, box: 6, tall: 6, bottle: 4, wine: 4, can: 4, jug: 6, pill: 4, pack: 6, round: 4, tv: 10, radio: 8, boot: 6, sleeve: 8, ring: 4, gun: 10 };
const ITEM_H = { bag: 7, box: 6, tall: 8, bottle: 8, wine: 8, can: 5, jug: 7, pill: 5, pack: 6, round: 4, tv: 7, radio: 5, boot: 5, sleeve: 8, ring: 3, gun: 4 };
function itemPx(k, lx, lv, w, h, col) {
  const top = lv >= h - 2, edge = lx === w - 1 || lx === w - 2;
  switch (k) {
    case 'bag': if (lv === h - 1 && (lx < 2 || lx >= w - 2)) return null; return top ? mix(col, WHITE, 0.25) : lv >= 2 && lv < 4 ? mix(col, WHITE, 0.55) : edge ? mix(col, DARK, 0.25) : col;
    case 'box': case 'tall': return top ? mix(col, WHITE, 0.35) : lv >= 2 && lv < 4 && lx > 0 ? mix(col, WHITE, 0.7) : edge ? mix(col, DARK, 0.3) : col;
    case 'bottle': case 'wine': { if (lv >= h - 3 && (lx < 1 || lx > 2)) return null; if (lv === h - 1) return k === 'wine' ? [120, 30, 40] : [200, 200, 200]; return lv >= 2 && lv < 4 ? (k === 'wine' ? [230, 220, 190] : mix(col, WHITE, 0.6)) : lx === 3 ? mix(col, DARK, 0.35) : col; }
    case 'can': return lv === h - 1 ? [200, 204, 210] : lv === 0 ? [150, 154, 160] : lx === 3 ? mix(col, DARK, 0.3) : lv === 2 ? mix(col, WHITE, 0.5) : col;
    case 'jug': if (lv >= h - 2 && lx < 2) return null; return lv >= h - 2 ? (lx >= w - 2 ? DARK : col) : lv >= 2 && lv < 4 ? WHITE : edge ? mix(col, DARK, 0.3) : col;
    case 'pill': if (lv >= h - 1) return lx < 4 ? col : null; return lv >= 1 && lv < 3 ? WHITE : [236, 236, 230];
    case 'pack': return lv >= h - 2 ? (lx >= 2 && lx < 4 ? [60, 60, 66] : null) : lv < 2 ? mix(col, DARK, 0.2) : lx === 0 || edge ? [220, 224, 228] : col;
    case 'round': return (lx === 0 || lx === w - 1) && (lv === 0 || lv === h - 1) ? null : lv === h - 1 || lx === 0 ? mix(col, WHITE, 0.3) : col;
    case 'tv': return lv === 0 ? DARK : lx < 1 || lx >= w - 1 || lv >= h - 1 ? [52, 50, 54] : lx >= w - 3 ? [40, 40, 44] : (lx + lv) % 5 === 0 ? [140, 170, 190] : [70, 84, 96];
    case 'radio': return lv === h - 1 && lx > 1 && lx < w - 2 ? [150, 150, 156] : lx >= 1 && lx < 3 && lv > 0 && lv < 3 ? [30, 30, 34] : lx >= w - 3 && lv > 0 && lv < 3 ? [30, 30, 34] : col;
    case 'boot': return lv < 2 ? DARK : lx < 4 || lv < 3 ? col : null;
    case 'sleeve': return lx === w - 1 ? DARK : (lx - w / 2) * (lx - w / 2) + (lv - h / 2) * (lv - h / 2) < 3 ? DARK : col;
    case 'ring': return lv === 1 && (lx === 1 || lx === 2) ? null : GOLD;
    case 'gun': return lv >= 2 && lx < w - 3 ? [40, 40, 44] : lx >= w - 4 && lx < w - 1 && lv < 3 ? [110, 72, 40] : null;
    default: return col;
  }
}
// a row of items along x on a shelf level, base height 0..lh: returns the colour at (x, v) or null for the back
function itemRow(gk, g, x, v, lh, key) {
  const ks = ITEM_K[gk] || ITEM_K.snacks;
  let cx = 0, run = 0, n = 0;
  // (walk the facings from the left: deterministic per row key; at most ~40 steps across a fitting)
  const seed = key & 0xffff;
  let k = ks[Math.floor(hash(0, 1, seed) * ks.length)], col = rgb(g[Math.floor(hash(0, 2, seed) * g.length)]), runLen = 2 + (hash(0, 3, seed) * 3 | 0);
  while (true) {
    const w = ITEM_W[k] || 6, cell = w + 2;
    if (x < cx + cell) {
      const lx = x - cx;
      if (lx >= w) return null;
      const h = Math.min(lh, ITEM_H[k] || 6);
      if (v >= h) return null;
      if (hash(n, 7, seed) < 0.06) return null;   // (a gap where one's been sold)
      return itemPx(k, lx, v, w, h, col);
    }
    cx += cell; n++; run++;
    if (run >= runLen) { run = 0; runLen = 2 + (hash(n, 3, seed) * 3 | 0); k = ks[Math.floor(hash(n, 1, seed) * ks.length)]; col = rgb(g[Math.floor(hash(n, 2, seed) * g.length)]); }
    if (n > 400) return null;
  }
}
// a whole fitting's front: shelf boards every L px, items on each, the dark back between
function shelfFace(gk, g, x, v, h, key, back, board, L = 10) {
  if (v >= h - 1) return board;
  const lev = v / L | 0, lv = v % L;
  if (lv < 2) return board;
  const c = itemRow(gk, g, x, lv - 2, L - 3, key * 31 + lev * 977);
  return c || back;
}
// goods seen from above on a shelf top: packed rows of tops (light edge north-west), a spine down the middle
function shelfTop(g, x, Y, w, d, ns, key, edge) {
  const along = ns ? Y : x, across = ns ? x : Y, len = ns ? w : d;
  if (Math.abs(across - len / 2) < 1 || across === 0 || across === len - 1) return edge;
  const cell = along % 6, k = (along / 6 | 0) + (across < len / 2 ? 0 : 1000);
  if (cell >= 5) return mix(edge, DARK, 0.35);
  const col = rgb(g[Math.floor(hash(k >> 1, 5, key) * g.length)]);
  return cell === 0 ? mix(col, WHITE, 0.35) : col;
}

export function drawShop(R, u, r, px0, ox, oy) {
  const px = (x, Y, z, c, n = UP, e) => px0(Math.round(x), Math.round(Y), Math.round(z), c, n, 0, e);
  const X = (wx) => wx - ox, Yl = (wy) => wy - oy, BY = r.inY0, WH = r.H || 999;
  const slab = (x0, x1, Y0, Y1, z, top, side = top, z0 = 0, e) => {
    x0 = Math.round(x0); x1 = Math.round(x1); Y0 = Math.round(Y0); Y1 = Math.round(Y1);
    const T = typeof top === 'function' ? top : null, Sd = typeof side === 'function' ? side : null, tr = T ? null : rp(top), sr = Sd ? null : rp(side);
    for (let Y = Y0; Y < Y1; Y++) for (let x = x0; x < x1; x++) { const c = T ? T(x - x0, Y - Y0) : tr[Y === Y0 || x === x0 || x === x1 - 1 ? 3 : 2]; if (c) px(x, Y, z, c, UP, c.length > 3 ? c : undefined); }
    for (let x = x0; x < x1; x++) for (let v = z0; v < z; v++) { const c = Sd ? Sd(x - x0, v) : sr[v > z - 2 ? 3 : 1 + ((x - x0) % 8 ? 1 : 0)]; if (c) px(x, Y1, v, c, S, Sd && c.length > 3 ? c : undefined); }
  };
  const onWall = (x0, x1, v0, v1, f) => { const a = Math.round(x0), b = Math.round(x1); for (let x = a; x < b; x++) for (let v = v0; v < v1; v++) { const c = f(x - a, v - v0, b - a, v1 - v0); if (c) px(x, BY, v, c, S, c.length > 3 ? c : undefined); } };
  const dot = (x, Y, z, c, s = 2, e) => { for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) px(x + dx, Y + dy, z, c, UP, e); };
  const disc = (cx, cY, rad, z, f) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const d = Math.hypot(dx, dy); if (d <= rad + 0.2) { const c = f(dx, dy, d); if (c) px(cx + dx, cY + dy, z, c, UP, c.length > 3 ? c : undefined); } } };
  const H = (k, s) => hash(k, s, R.seed & 0xffff);

  // pools of lamplight on the floor (under the pendants, round the candles, the fire): the floor warmed, and glowing a
  // little after dark (the Lighter scales emission by the night)
  for (const L of R.lamps || []) {
    const cx = X(L.x), cY = Yl(L.y), rad = L.r, c = L.c || [255, 206, 140];
    for (let Y = Math.max(BY, Math.round(cY - rad * 0.8)); Y < Math.min(r.inY1, cY + rad * 0.8); Y++) for (let x = Math.max(u.x0, Math.round(cx - rad)); x < Math.min(u.x1, cx + rad); x++) {
      const d = Math.hypot(x - cx, (Y - cY) * 1.25) / rad;
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d) * (L.k || 1), base = shopFloorPx(R, x + ox, Y + oy);
      px0(x, Y, 0, mix(base, c, Math.min(0.5, a * 0.24)), UP, F_GROUND, [c[0], c[1], c[2], Math.min(120, Math.round(a * 70))]);
    }
  }

  // the back wall's fittings, then its signs over them
  for (const w of R.onWall) {
    let v0 = w.v0, v1 = w.v1;
    if (v1 > WH - 2) { const s = v1 - (WH - 2); if (v0 - s < 0) continue; v0 -= s; v1 -= s; }
    const x0 = X(w.x0), x1 = X(w.x1), g = w.g || ['#8a8e96', '#c8a050', '#5a5e68'], c = w.c ? rgb(w.c) : null;
    if (x1 <= x0) continue;
    if (w.t === 'sign') { wallSign(px, w, x0, x1, v0, v1, BY); continue; }
    const f = WALLF[w.t];
    if (f) onWall(x0, x1, v0, v1, (x, v, ww, hh) => f(x, v, ww, hh, g, c, w, R.seed));
    if (w.t === 'goods' || w.t === 'bottles' || w.t === 'fridge' || w.t === 'shoes' || w.t === 'tools' || w.t === 'guns' || w.t === 'decks') for (let Y = BY; Y < BY + 8; Y++) for (let x = x0; x < x1; x++) px(x, Y, v1, [70, 70, 76], UP);
  }
  // the counter
  const C = R.counter, ca = u.x0 > u.fx0 ? u.x0 : u.x0 + 6, cb = u.x1 < u.fx1 ? u.x1 : u.x1 - (u.fx1 - u.fx0 > 128 ? 34 : 6), cy = u.cy;
  const top = rp(C.top), front = rp(C.front), trim = C.trim ? rgb(C.trim) : null, cg = (C.g || []).map(rgb), felt = C.felt ? rgb(C.felt) : null;
  for (let x = ca; x < cb; x++) {
    for (let Y = cy + 6; Y < cy + 26; Y++) {
      let c = top[Y === cy + 6 || Y === cy + 25 ? 3 : 2];
      if (C.k === 'glass' && Y > cy + 8 && Y < cy + 24 && x > ca + 2 && x < cb - 3) c = caseTop(x - ca, Y - cy - 9, cg, felt, R.seed, C.gk);
      if (C.k === 'ice' && Y > cy + 8 && Y < cy + 24) c = (hash(x >> 3, Y >> 2, 1612) > 0.7 && (x & 7) < 6) ? [150, 160, 170] : hash(x, Y, 1613) > 0.7 ? WHITE : [214, 228, 234];
      if (C.k === 'bar' && Y === cy + 8) c = BRASS;
      if (C.k === 'club' && Y === cy + 7) c = lit(rgb(C.trim || '#ff4ab0'), 200);   // (the club's bar: a neon edge along its top)
      px(x, Y, 22, c, UP, c.length > 3 ? c : undefined);
    }
    for (let v = 0; v < 22; v++) {
      let c = v < 2 ? [40, 32, 28] : front[v > 18 ? 3 : (x - ca) % 24 === 0 ? 1 : 2];
      if (trim && v >= 18 && v < 20) c = trim;
      if (C.k === 'glass' && v > 4 && v < 17 && (x - ca) % 40 > 1) { const it = v >= 6 && v < 14 ? itemRow(C.gk || 'gold', C.g || ['#e8c040'], x - ca, v - 6, 8, R.seed + 77) : null; c = it ? lit(it, 40) : mix(felt, GLASS, v > 12 ? 0.6 : 0.3); if (v === 15 || v === 16) c = lit([220, 236, 244], 60); }
      if (C.k === 'bar' && v === 6) c = BRASS;
      if (C.k === 'club' && (v === 17 || v === 18)) c = lit(rgb(C.trim || '#ff4ab0'), v === 17 ? 230 : 150);   // (and a neon strip along its front)
      if (C.k === 'club' && v === 4) c = CHROME;
      if (C.k === 'ice' && v > 4 && v < 17) c = mix([200, 220, 228], [120, 150, 170], v / 20);
      px(x, cy + 26, v, c, S, c.length > 3 ? c : undefined);
    }
  }
  if (C.k === 'teller') {   // IN3: the glass screen along the tellers' counter - brass posts, a brass rail on top, the panes with a sheen and a speaking grille, a lamp at each window
    for (let x = ca; x < cb; x++) {
      const k = (x - ca) % 48, post = k < 3;
      for (let v = 22; v < 58; v++) {
        let c = null;
        if (post || v > 54) c = v > 54 ? GOLD : BRASS;
        else if (v < 26) c = k > 14 && k < 34 ? [60, 52, 44] : [170, 176, 180];
        else if (v > 36 && v < 40 && k > 18 && k < 30) c = (x & 1) ? [120, 120, 126] : [170, 174, 180];
        else c = (k + v) % 19 < 2 ? lit([220, 236, 244], 50) : null;
        if (c) px(x, cy + 8, v, c, S, c.length > 3 ? c : undefined);
      }
      if (k === 24) { for (let v = 44; v < 50; v++) px(x, cy + 10, v, [60, 120, 70], S); for (let dx = -3; dx <= 3; dx++) px(x + dx, cy + 10, 50, lit([120, 220, 140], 140), UP, lit([140, 240, 160], 140)); }
    }
  }
  const tx = X(R.tillX);
  if (C.dj) {   // the DJ booth (NE9): a raised console in the bar - the decks and the mixer on top, its front a lit panel
    const d0 = X(C.dj[0]), d1 = X(C.dj[1]), n2 = rgb(C.neon || '#5ae8ff'), n1 = rgb(C.trim || '#ff4ab0');
    slab(d0, d1, cy + 4, cy + 27, 30, (x, Y) => (Y === 0 ? lit(n2, 200) : [34, 32, 42]), (x, v) => (v === 28 ? lit(n2, 220) : v > 4 && v < 26 && x > 2 && x < d1 - d0 - 3 ? (((x >> 2) + (v >> 2)) & 1 ? lit(mix(n1, DARK, 0.35), 150) : lit(mix(n2, DARK, 0.5), 120)) : [26, 24, 32]));
    const mid = (d0 + d1) / 2, my = cy + 15, rr = Math.min(8, Math.max(4, ((d1 - d0) / 2 - 16) / 2));
    for (const s of [-1, 1]) disc(Math.round(mid + s * (rr + 10)), my, rr, 31, (dx, dy, dd) => (dd < 1.5 ? [200, 200, 210] : dd > rr - 1 ? [70, 70, 80] : (Math.round(dd) & 1 ? [22, 22, 26] : [40, 40, 46])));
    slab(mid - 6, mid + 6, my - 5, my + 6, 32, (x, Y) => ((x + Y) % 3 === 0 ? lit(x < 6 ? n1 : n2, 200) : [50, 50, 58]), [40, 40, 48], 30);
  } else if (C.k !== 'club') {
    slab(tx - 6, tx + 6, cy + 9, cy + 16, 29, '#34363c', '#4a4e58', 22); dot(tx - 3, cy + 10, 30, [120, 220, 140], 3, lit([120, 220, 140], 150));
  }
  if (C.k === 'club') for (const x of [ca + 14, cb - 26]) ON.taps(slab, dot, px, x + 6, cy);
  let side = 1;
  for (const k of C.on || []) {
    const x = tx + side * 24 + (side > 0 ? 0 : -12); side = -side;
    if (x < ca + 4 || x + 12 > cb - 4) continue;
    ON[k] && ON[k](slab, dot, px, x, cy);
  }

  // the floor's pieces, north to south (so a nearer one's face covers what's behind it)
  const order = R.pieces.slice().sort((a, b) => (a.flat ? 0 : 1) - (b.flat ? 0 : 1) || a.y1 - b.y1);
  for (const p of order) {
    const x0 = X(p.x0), x1 = X(p.x1), y0 = Yl(p.y0), y1 = Yl(p.y1), g = (p.g || []).map(rgb), c = p.c || '#6a6e78', h = p.h, w = x1 - x0, d = y1 - y0;
    const f = PIECE[p.t];
    if (f) { f({ slab, px, dot, disc, H, R }, p, x0, y0, x1, y1, w, d, h, g, c); continue; }
    slab(x0, x1, y0, y1, h, c);
    if (p.cooler) slab(x0 + 2, x1 - 2, y0 + 1, y1 - 2, h + 9, [110, 170, 230], [90, 150, 220], h);
  }
}

// a case's glass top seen from above: the felt bed, the goods laid out in rows, a sheen across the glass, lit a little
function caseTop(x, Y, g, felt, seed, gk) {
  if ((x + Y * 2) % 23 < 2) return lit([226, 238, 244], 40);
  const row = Y % 8, cell = x % 10, k = (x / 10 | 0) * 7 + (Y / 8 | 0);
  const col = g.length ? g[Math.floor(hash(k, 3, seed) * g.length)] : GOLD;
  if (gk === 'guns') { if (row >= 2 && row < 5 && cell < 8 && hash(k, 4, seed) > 0.25) return cell < 6 ? [40, 40, 46] : [110, 72, 40]; }
  else if (row >= 2 && row < 6 && cell >= 2 && cell < 6 && hash(k, 4, seed) > 0.3) return lit(col, 60);
  return mix(felt || [40, 50, 90], GLASS, 0.3);
}

// a wall sign in the sign faces: a neon tube on the wall (a halo, white-hot core) or a lettered board; whole art px, its
// top on the art grid of the wall (BY - v even: the room's back wall stands on the section's grid)
function wallSign(px, w, x0, x1, v0, v1, BY) {
  const face = w.face || 'neon', col = rgb(w.c || '#ffd24a'), W = x1 - x0;
  const put = (vTop) => (x, y, c, e) => px(x, BY, vTop - y, c, S, e);
  if (face === 'neon') {
    const M = lineMask(w.text, 'neon'), mw = M.w * 2;
    if (mw > W + 16) return;
    let vTop = v1 - 1; if (((BY - vTop) & 1) !== 0) vTop--;
    const lx = Math.round((x0 + (W - mw) / 2) / 2) * 2, core = hotOf(col);
    for (let v = vTop - M.h * 2 - 1; v <= vTop + 1; v++) for (let x = lx - 2; x < lx + mw + 2; x++) px(x, BY, v, [24, 20, 30], S);   // (the dark backing it's mounted on)
    paintLine(put(vTop), w.text, 'neon', lx, 0, { 1: core, 4: mix([24, 20, 30], col, 0.6) }, { 1: [...col, 220], 4: [...col, 120] });
    return;
  }
  const L = layoutSign(w.text, Math.floor((W + 4) / 2), { face, lines: 1 });
  if (!L || L.cut) return;
  const dark = luminance(col) > 0.3, P = legible(palOf(dark ? ['#1e1c22', w.c] : ['#f4f2ea', w.c]));
  let vTop = v1 - 1; if (((BY - vTop) & 1) !== 0) vTop--;
  paintBoard(put(vTop), L, P, Math.round((x0 + (W - L.w * 2) / 2) / 2) * 2, 0, { lit: dark ? 'ink' : 'panel', night: 0.6 });
}

const frame = (x, v, w, h, k = 2) => x < k || x >= w - k || v < k || v >= h - k;
const WALLF = {
  goods: (x, v, w, h, g, c, it, seed) => shelfFace(it.gk || 'snacks', it.g || g, x, v, h, seed + it.x0, [54, 54, 60], [92, 96, 104]),
  cigs: (x, v, w, h) => (frame(x, v, w, h) ? [40, 40, 46] : (x % 6 >= 4 || v % 8 >= 6) ? [60, 60, 66] : rgb(['#e8e8e8', '#d8343a', '#2a5ab0', '#f0c030', '#3a8a4a', '#2a2a2e'][((x / 6 | 0) * 7 + (v / 8 | 0) * 3) % 6])),
  fridge: (x, v, w, h, g, c, it, seed) => { if (x % 26 < 2 || v < 2 || v > h - 3) return [176, 180, 188]; if (x % 26 === 2 && v > 8 && v < 20) return [90, 94, 100]; const q = shelfFace('drinks', g, x % 26, v - 2, h - 4, seed + (x / 26 | 0) * 13, null, [190, 220, 236]); return q ? lit(q, 150) : lit([200, 232, 246], 140); },
  bottles: (x, v, w, h, g, c, it) => { if (v % 12 < 2) return BRASS; const q = itemRow('bottles', g, x, v % 12 - 2, 10, (v / 12 | 0) * 131 + 7); return q ? (it.lit ? lit(q, 120) : q) : it.lit ? lit([60, 44, 34], 60) : [44, 34, 30]; },
  guns: (x, v, w, h) => { const row = (v - 2) % 12, k = (v - 2) / 12 | 0, sx = (x + k * 13) % 44; if (frame(x, v, w, h, 1)) return [70, 52, 36]; if (row >= 4 && row <= 6 && sx > 3 && sx < 40) return sx < 14 ? [110, 72, 40] : row === 5 && sx > 36 ? [60, 60, 66] : [36, 36, 40]; return (x & 3) === 1 && (v & 3) === 1 ? [120, 96, 70] : [150, 120, 86]; },
  tools: (x, v, w, h, g) => { const cell = (x / 14 | 0) * 5 + (v / 14 | 0), lx = x % 14, lv = v % 14, k = hash(cell, 1, 1643); const col = rgb(g[cell % g.length]); if (k < 0.33 ? (lx > 5 && lx < 8 && lv > 2 && lv < 12) || (lv > 9 && lv < 12 && lx > 2 && lx < 11) : k < 0.66 ? lx > 2 && lx < 11 && lv > 4 && lv < 9 : (lx > 6 && lx < 8 && lv > 1) || (lv < 4 && lx > 3 && lx < 11)) return k < 0.5 ? col : [140, 146, 154]; return (x & 3) === 1 && (v & 3) === 1 ? [140, 116, 80] : [196, 170, 122]; },
  guitars: (x, v, w, h, g) => { const lx = x % 22 - 11, col = rgb(g[(x / 22 | 0) % g.length]); if (v < 20 && (lx * lx) / 36 + ((v - 10) * (v - 10)) / 64 < 1) return Math.abs(lx) < 2 && Math.abs(v - 12) < 2 ? DARK : (lx < -3 ? mix(col, WHITE, 0.2) : col); if (v >= 18 && v < 40 && Math.abs(lx) < 1.5) return [96, 64, 40]; if (v >= 40 && v < 44 && Math.abs(lx) < 2.5) return [60, 40, 26]; return null; },
  tvs: (x, v, w, h) => { const lx = x % 24, lv = v % 16, k = (x / 24 | 0) * 3 + (v / 16 | 0); if (lx > 21 || lv > 13) return null; return lx < 2 || lx > 19 || lv < 2 || lv > 11 ? [52, 50, 54] : hash(k, 1, 1644) > 0.6 ? lit([120, 170, 220], 120) : [70, 84, 96]; },
  // shirts on hangers along a rail: each a shirt's shape (shoulders, sleeves, body), in facings of a colour
  rail: (x, v, w, h, g) => { if (v === h - 4) return STEEL; if (v > h - 4) return (x % 8 === 3 && v === h - 3) ? STEEL : null; const k = x / 8 | 0, lx = x % 8, col = rgb(g[Math.floor(hash(k >> 1, 1, 1645) * g.length)]), top = h - 6; if (v > top || v < top - 22) return null; const t = top - v; if (lx === 7) return null; if (t < 3) return lx >= 1 && lx < 7 ? mix(col, WHITE, 0.2) : null; if (t < 8 && (lx === 0 || lx === 6)) return mix(col, DARK, 0.2); return lx >= 1 && lx < 6 ? (lx === 5 ? mix(col, DARK, 0.25) : col) : null; },
  shoes: (x, v, w, h, g) => (v % 12 < 2 ? [92, 96, 104] : v % 12 < 7 && x % 10 < 8 ? (itemPx('boot', x % 10, v % 12 - 2, 8, 5, rgb(g[Math.floor(hash(x / 10 | 0, v / 12 | 0, 1646) * g.length)])) || [60, 60, 66]) : [60, 60, 66]),
  decks: (x, v, w, h, g) => { const lx = x % 12, k = x / 12 | 0; if (lx > 8 || v < 4 || v > h - 4) return [70, 70, 76]; const col = rgb(g[k % g.length]), round = (v < 7 || v > h - 7) && (lx === 0 || lx === 8); if (round) return [70, 70, 76]; return (v - h / 2) * (v - h / 2) + (lx - 4) * (lx - 4) * 3 < 30 ? [240, 236, 224] : (lx === 0 ? mix(col, DARK, 0.3) : col); },
  mirror: (x, v, w, h) => { const lx = x % 40; return lx < 4 || lx > 36 ? null : v < 4 ? [70, 52, 40] : lx < 6 || lx > 34 || v > h - 3 ? [200, 196, 188] : (lx + v) % 15 < 2 ? [214, 232, 240] : [150, 180, 198]; },
  pole: (x, v) => ((x + v) % 6 < 2 ? [200, 40, 44] : (x + v) % 6 < 4 ? WHITE : [40, 80, 170]),
  rods: (x, v, w, h, g) => (x % 6 === 2 && v > 2 ? rgb(g[(x / 6 | 0) % g.length]) : x % 6 === 3 && v > h - 16 && v < h - 10 ? [140, 140, 150] : null),
  keys: (x, v, w, h) => (frame(x, v, w, h) ? [90, 60, 36] : x % 8 === 0 || v % 9 === 0 ? [110, 76, 46] : x % 8 === 4 && v % 9 > 2 && v % 9 < 7 && hash(x >> 3, v / 9 | 0, 1648) > 0.3 ? BRASS : [60, 40, 26]),
  // IN3: the vault door - a deep steel frame, the round door in it with a ring of bolts round its rim, the wheel of
  // spokes at its middle, the hinge on one side
  vault: (x, v, w, h) => {
    const cx = w / 2, cv = h / 2, R0 = Math.min(w, h) / 2 - 1, d = Math.hypot(x - cx, v - cv);
    if (d > R0) return x < 3 || x >= w - 3 || v < 2 ? [70, 74, 80] : [96, 100, 108];
    if (d > R0 - 3) return d > R0 - 1 ? [60, 62, 68] : [176, 180, 188];
    const a = Math.atan2(v - cv, x - cx), bolt = d > R0 - 7 && d < R0 - 4 && Math.abs(((a / (Math.PI * 2) * 16) % 1 + 1) % 1 - 0.5) > 0.32;
    if (bolt) return [220, 224, 230];
    if (d > R0 - 8 && d < R0 - 7) return [100, 104, 112];
    if (d < 3) return [214, 218, 224];
    if (d < 10 && Math.abs(Math.sin(a * 3)) < 0.22) return [200, 204, 210];
    if (d > 10 && d < 12) return [200, 204, 210];
    if (x > w - 5 && Math.abs(v - cv) < 6) return [60, 62, 68];
    return [140 + (hash(x >> 2, v >> 2, 1650) * 14 | 0), 146, 154];
  },
  clock: (x, v, w, h) => { const d = Math.hypot(x - w / 2, v - h / 2); return d > w / 2 ? null : d > w / 2 - 1.5 ? [40, 40, 44] : (Math.abs(x - w / 2) < 1 && v >= h / 2) || (Math.abs(v - h / 2) < 1 && x >= w / 2 && x < w / 2 + 4) ? [30, 30, 34] : [240, 240, 232]; },
  seal: (x, v, w, h) => { const d = Math.hypot(x - w / 2, v - h / 2); return d > w / 2 ? null : d > w / 2 - 2 ? BRASS : d < w / 4 ? [200, 170, 90] : [40, 60, 120]; },
  flag: (x, v, w, h, g, c) => (x < 2 ? BRASS : v > h - 14 ? (x < 8 && v > h - 8 ? ((x + v) % 3 ? [40, 60, 140] : WHITE) : (v >> 1) & 1 ? (c || [200, 40, 44]) : WHITE) : null),
  head: (x, v, w, h) => { const cx = w / 2, lx = Math.abs(x - cx); if (v < 4 && lx < 8) return [70, 50, 36]; if (v >= 4 && v < 14 && lx < 4 - (v - 4) * 0.25) return [120, 84, 50]; if (v >= 14 && ((lx > 3 && lx < 5) || (v > 16 && lx > 5 && lx < 9 && (lx + v) % 3 === 0))) return [214, 200, 170]; return null; },
  fish: (x, v, w, h) => { const t = x / w, hw = (h / 2 - 1) * Math.sin(Math.min(1, t * 1.2) * Math.PI) * (t < 0.85 ? 1 : 0); const dv = Math.abs(v - h / 2); if (t > 0.85) return dv < (t - 0.85) * h * 2.5 ? [70, 110, 90] : null; return dv < hw ? (dv < hw * 0.4 && t > 0.1 && t < 0.15 ? DARK : v > h / 2 ? [200, 210, 190] : [80, 130, 100]) : null; },
  poster: (x, v, w, h, g, c) => (frame(x, v, w, h, 1) ? [30, 30, 34] : v < h * 0.35 ? (c || [80, 180, 220]) : v < h * 0.42 ? [240, 240, 230] : Math.hypot(x - w * 0.6, v - h * 0.6) < w * 0.16 ? [250, 220, 120] : [240, 150, 80]),
  cross: (x, v, w, h) => (((x > w / 3 && x < 2 * w / 3) || (v > h / 3 && v < 2 * h / 3)) ? lit([90, 230, 130], 220) : null),
  board: (x, v, w, h) => (frame(x, v, w, h) ? [70, 52, 40] : v % 6 === 3 && x > 3 && x < w - 4 && (x % 14) < 9 + (hash(x / 14 | 0, v, 1649) * 4 | 0) ? [236, 232, 220] : [36, 44, 40]),
  chalk: (x, v, w, h) => (frame(x, v, w, h) ? [110, 76, 46] : v % 6 === 3 && x > 3 && x < w - 4 && (x % 12) < 7 + (hash(x / 12 | 0, v, 1651) * 4 | 0) ? [230, 228, 214] : [34, 40, 38]),
  frames: (x, v, w, h) => (v % 12 < 2 ? [214, 210, 200] : v % 12 > 3 && v % 12 < 8 && ((x % 14 > 1 && x % 14 < 6) || (x % 14 > 7 && x % 14 < 12)) ? (x % 14 === 2 || x % 14 === 5 || x % 14 === 8 || x % 14 === 11 || v % 12 === 4 || v % 12 === 7 ? rgb(['#2a2a2e', '#8a2a2a', '#c8a050', '#2a5a8a'][(x / 14 | 0) % 4]) : [200, 220, 230]) : [236, 232, 224]),
  files: (x, v, w, h) => (x % 18 > 15 ? null : v % 11 < 1 || x % 18 < 1 || x % 18 > 14 ? [110, 114, 120] : v % 11 === 5 && x % 18 > 5 && x % 18 < 10 ? [60, 60, 64] : [160, 164, 170]),
  // a brass wall lamp with its lit shade
  // the club's (NE9): the screen behind the DJ - a lit wall of colour bars; a speaker cabinet; a neon tube up the wall
  ledwall: (x, v, w, h, g) => { if (frame(x, v, w, h, 2)) return [26, 24, 32]; const k = x >> 2, bh = 2 + (0.25 + 0.75 * hash(k, 1, 1662)) * (h - 6); if ((x & 3) === 3 || v > bh) return [30, 26, 40]; const t = (v - 2) / Math.max(1, h - 6); return lit(mix(rgb(g[1 % g.length]), rgb(g[0]), Math.min(1, t * 1.3)), 190); },
  speaker: (x, v, w, h) => { const cx = w / 2; for (const cy of [h * 0.28, h * 0.68]) { const d = Math.hypot(x + 0.5 - cx, v + 0.5 - cy); if (d < w * 0.36) return d < w * 0.12 ? [70, 70, 80] : d > w * 0.3 ? [60, 60, 68] : [22, 22, 26]; } return frame(x, v, w, h, 1) ? [50, 50, 58] : [30, 30, 36]; },
  tube: (x, v, w, h, g, c) => (x === 0 || x === w - 1 ? lit(mix(c || [255, 80, 180], [24, 20, 30], 0.4), 140) : lit(mix(c || [255, 80, 180], WHITE, 0.45), 230)),
  sconce: (x, v, w, h) => (v < 3 ? (x === 2 || x === 3 ? BRASS : null) : v < 4 ? BRASS : lit(mix([255, 224, 170], WHITE, (v - 4) / 12), 230)),
  lantern: (x, v, w, h) => (v > h - 2 ? (x > 2 && x < 5 ? DARK : null) : v < 2 || x < 1 || x >= w - 1 ? [40, 34, 30] : lit([255, 190, 100], 230)),
  // IN5 Velvet's martini glass in neon on the dark wall
  martini: (x, v, w, h) => { const cx = w / 2, t = h - 1 - v, onCup = t < h * 0.45 && Math.abs(Math.abs(x - cx) - (h * 0.45 - t) * (w / h) * 0.9) < 1, rim = t === 0 && Math.abs(x - cx) < w * 0.42, stem = t >= h * 0.45 && t < h - 3 && Math.abs(x - cx) < 1, foot = t >= h - 3 && Math.abs(x - cx) < w * 0.2 && t < h - 1; if (onCup || rim || stem || foot) return lit([255, 236, 248], 230); if (Math.hypot(x - cx - w * 0.22, t - 2) < 2) return lit([140, 255, 140], 200); return null; },
  // the tavern's stone fireplace: a surround of grey stones, the firebox dark round a lit fire on its logs, the mantel
  fireplace: (x, v, w, h) => {
    const box = x > w * 0.22 && x < w * 0.78 && v < h * 0.55, mantel = v >= h * 0.62 && v < h * 0.7;
    if (mantel) return v === Math.ceil(h * 0.62) ? [130, 90, 56] : [96, 64, 40];
    if (box) { const fx = (x - w / 2) / (w * 0.28), fy = v / (h * 0.55); if (v < 4 && Math.abs(fx) < 0.8) return [70, 44, 28]; if (fy < 0.75 - Math.abs(fx) * 0.9 + (hash(x, 1, 1652) - 0.5) * 0.25) return lit(fy < 0.3 ? [255, 230, 120] : fy < 0.5 ? [255, 160, 60] : [220, 80, 30], 230); return [26, 20, 18]; }
    const row = v / 6 | 0, sx = (x + (row & 1) * 5) % 10; if (v % 6 === 0 || sx === 0) return [96, 92, 88]; return mix([150, 146, 140], [120, 116, 112], hash((x + (row & 1) * 5) / 10 | 0, row, 1653));
  },
  // the sports bar's TVs: a game on each - the pitch, its lines, the players
  screen: (x, v, w, h, g, c, it) => { if (frame(x, v, w, h, 2)) return [30, 30, 34]; const t = (it.k || 0) % 3; const base = t === 2 ? [70, 120, 200] : [60, 150, 70]; if (t !== 2 && (x === (w >> 1) || v === 3 || v === h - 4)) return lit(WHITE, 160); if (hash(x >> 1, v >> 1, 1654 + t) > 0.93) return lit(t ? [240, 240, 240] : [220, 60, 50], 180); return lit(v > h - 6 ? mix(base, DARK, 0.4) : base, 150); },
  dartboard: (x, v, w, h) => { const d = Math.hypot(x - w / 2, v - h / 2), R0 = w / 2; if (d > R0) return null; if (d > R0 - 1.5) return [40, 36, 34]; if (d < 1.5) return [200, 40, 40]; const a = Math.atan2(v - h / 2, x - w / 2), seg = Math.floor((a + Math.PI) / (Math.PI / 10)) & 1; if (d > R0 - 3.5) return seg ? [200, 40, 40] : [40, 140, 70]; return seg ? [230, 220, 190] : [30, 30, 32]; },
  pennant: (x, v, w, h) => { const k = x / 9 | 0, lx = x % 9; return v > h - 2 ? [200, 200, 200] : lx < 8 && (h - 1 - v) < (8 - lx) * 1.6 && lx > 0 ? rgb(['#c8283a', '#1e4a8a', '#e8c040', '#2a7a4a'][k % 4]) : null; },
  // MC4's neon bull skull: the horns and the skull's outline in red tubes
  skull: (x, v, w, h) => {
    const cx = w / 2, t = h - 1 - v, ax = Math.abs(x - cx), hz = h * 0.3;
    const horn = t < hz && Math.abs(t - (hz - 2) * Math.pow(Math.max(0, (ax - w * 0.12) / (w * 0.38)), 1.6) - 1) < 1.2 && ax > w * 0.12 && ax < w * 0.5;
    const skullW = w * 0.18 * (1 - Math.max(0, t - hz) / (h - hz) * 0.55), sk = t >= hz * 0.6 && t < h - 1 && Math.abs(ax - skullW) < 1;
    const eye = t > h * 0.42 && t < h * 0.52 && Math.abs(ax - w * 0.07) < 1.4, bot = t === h - 2 && ax < skullW;
    if (horn || sk || bot) return lit([255, 120, 120], 230);
    if (eye) return lit([255, 210, 210], 230);
    return null;
  },
  // MC4's motorbike on the wall: the wheels, the red tank, the chrome
  motorbike: (x, v, w, h) => {
    const wr = h * 0.32, w1 = Math.hypot(x - wr - 1, v - wr), w2 = Math.hypot(x - (w - wr - 2), v - wr);
    if ((w1 < wr && w1 > wr - 3) || (w2 < wr && w2 > wr - 3)) return [30, 30, 34];
    if (w1 < 2 || w2 < 2) return CHROME;
    if (v > wr + 2 && v < wr + 8 && x > w * 0.32 && x < w * 0.62) return v > wr + 6 ? [230, 120, 120] : [190, 40, 44];
    if (v > wr && v < wr + 3 && x > w * 0.22 && x < w * 0.72) return CHROME;
    if (v > wr + 4 && v < wr + 7 && x > w * 0.62 && x < w * 0.8) return [40, 34, 30];
    if (x > w * 0.74 && x < w * 0.78 && v > wr && v < h - 2) return CHROME;
    return null;
  },
};

const ON = {
  lotto: (s, d, p, x, cy) => { s(x, x + 12, cy + 10, cy + 14, 36, '#2a2a30', (xx, v) => (v > 26 && v < 34 ? lit([255, 210, 80], 160) : [42, 42, 50]), 22); },
  hotdog: (s, d, p, x, cy) => { s(x, x + 14, cy + 9, cy + 18, 27, '#b8bcc2', '#8a8e96', 22); for (let k = 0; k < 4; k++) d(x + 2, cy + 10 + k * 2, 28, [190, 90, 60], 2); },
  jar: (s, d, p, x, cy) => { s(x + 2, x + 8, cy + 11, cy + 16, 30, '#a8c8d4', '#a8c8d4', 22); d(x + 3, cy + 12, 31, [90, 160, 80], 2); },
  gum: (s, d, p, x, cy) => { s(x, x + 12, cy + 9, cy + 13, 30, '#c83a2a', (xx, v) => [[240, 80, 120], [80, 200, 230], [250, 220, 90]][(xx >> 1) % 3], 22); },
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

// ---- the floor's pieces: (q: the painters; p: the piece; its box in the cut's px; w, d: its size; h: its height) ------
const PIECE = {
  // a fitting of shelves: on top the packed goods seen from above, on its south face the shelf levels with the goods
  // standing on them as objects
  shelf: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    const edge = rp(c)[2], board = rp(c)[1], back = mix(rp(c)[1], DARK, 0.55), key = (p.x0 * 7 + p.y0 * 13) & 0xffff;
    q.slab(x0, x1, y0, y1, h, (x, Y) => shelfTop(p.g || ['#8a8e96'], x, Y, w, d, !!p.ns, key, edge),
      (x, v) => (v < 2 ? [40, 40, 44] : shelfFace(p.gk || (p.bottles ? 'bottles' : 'snacks'), p.g || ['#8a8e96'], x, v - 2, h - 2, key, back, board, 9)));
  },
  cooler: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    if (p.low) { q.slab(x0, x1, y0, y1, h, (x, Y) => (x < 2 || x > w - 3 || Y < 2 || Y > d - 3 ? rp(c)[2] : hash((x0 + x) >> 2, Y >> 2, 1620) > 0.6 ? lit(g[Math.floor(hash(x >> 2, Y >> 2, 1621) * g.length)], 120) : lit([170, 214, 236], 120)), c); return; }
    const key = (p.x0 * 11) & 0xffff;
    q.slab(x0, x1, y0, y1, h, c, (x, v) => { if (v < 4 || v > h - 5 || x % 22 < 2) return rp(c)[1]; const it = shelfFace(p.gk || 'drinks', p.g || [], x % 22, v - 4, h - 9, key + (x / 22 | 0), null, [180, 220, 240], 10); return lit(it || [200, 232, 246], it ? 170 : 140); });
  },
  // a glass display case standing on the floor (RT9, IN11): a dark frame, the felt bed under the glass with the goods laid
  // out on it - jewellery, watches, pistols - the front glass showing them stacked, lit from within
  glasscase: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    const felt = rgb(p.felt || '#2a3a6a'), fr = rp(c), key = (p.x0 * 5 + p.y0) & 0xffff;
    q.slab(x0, x1, y0, y1, h, (x, Y) => (x < 2 || x > w - 3 || Y < 2 || Y > d - 3 ? fr[3] : caseTop(x, Y, g, felt, key, p.gk)),
      (x, v) => { if (v < 3 || v > h - 3 || x < 2 || x > w - 3) return fr[1]; if (v === h - 3) return fr[3]; const it = v >= 5 && v < h - 5 ? itemRow(p.gk === 'guns' ? 'guns' : 'gold', p.g || ['#e8c040'], x, v - 5, h - 10, key) : null; return it ? lit(it, 50) : lit(mix(felt, GLASS, 0.45), 30); });
  },
  gunrack: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    if (p.v) { q.slab(x0, x1, y0, y1, 8, c); for (let Y = y0 + 3; Y < y1 - 3; Y += 5) for (let z = 8; z < h; z++) q.px(x0 + (p.side < 0 ? 3 : w - 4), Y, z, z < 16 ? rp(c)[2] : DARK, [p.side < 0 ? 1 : -1, 0, 0]); return; }
    q.slab(x0, x1, y0, y1, 8, c); for (let x = x0 + 3; x < x1 - 3; x += 5) for (let v = 8; v < h; v++) q.px(x, y0 + 4, v, v < 16 ? rp(c)[2] : DARK, S);
  },
  pile: (q, p, x0, y0, x1, y1, w, d, h) => { const n = Math.max(2, Math.round(w * d / 140)), H = q.H; for (let k = 0; k < n; k++) { const bw = 6 + H(k, 1) * 10, bd = 5 + H(k, 2) * 8, bx = x0 + H(k, 3) * (w - bw), by = y0 + H(k, 4) * (d - bd), z = 4 + H(k, 5) * h, col = p.g[Math.floor(H(k, 6) * p.g.length)]; if (p.balls) { for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy < 10) q.px(bx + 3 + dx, by + 3 + dy, 8 + H(k, 7) * 6, dx + dy < -2 ? mix(rgb(col), WHITE, 0.4) : rgb(col)); } else q.slab(bx, bx + bw, by, by + bd, Math.round(z), col); } },
  crates: (q, p, x0, y0, x1, y1, w, d, h, g) => {
    const cw = Math.max(8, Math.floor(w / 2)), cd = Math.max(6, Math.floor(d / 2));
    for (let j = 0; j * cd < d; j++) for (let i = 0; i * cw < w; i++) {
      const bx = x0 + i * cw, by = y0 + j * cd, col = g[(i + j * 3 + (p.x0 & 3)) % g.length], z = Math.round(h * (0.6 + q.H(i + j * 5, 9) * 0.4));
      q.slab(bx, Math.min(x1, bx + cw - 1), by, Math.min(y1, by + cd - 1), z, (x, Y) => (x === 0 || Y === 0 ? mix(col, WHITE, 0.3) : (x + Y) % 6 === 0 && p.bottles ? DARK : col), (x, v) => (v % 6 === 0 || x === 0 ? mix(col, DARK, 0.35) : mix(col, DARK, 0.12)));
    }
  },
  mannequin: (q, p, x0, y0, x1, y1, w, d, h) => { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if (p.plinth) q.slab(mx - 6, mx + 6, my - 4, my + 4, 4, '#e8e4dc', '#c8c4bc'); const z0 = p.plinth ? 4 : 0; q.slab(mx - 4, mx + 4, my - 2, my + 2, z0 + 2, '#5a5e68'); q.slab(mx - 1, mx + 1, my - 1, my + 1, z0 + 18, '#c8ccd2'); q.slab(mx - 5, mx + 5, my - 3, my + 2, h - 8, p.c, p.c, z0 + 18); if (p.c2) q.slab(mx - 5, mx + 5, my - 3, my + 2, z0 + 22, p.c2, p.c2, z0 + 18); q.slab(mx - 3, mx + 3, my - 2, my + 2, h, '#e8dcc8', '#e8dcc8', h - 8); },
  lumber: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { for (let k = 0; k * 4 < h; k++) q.slab(x0 + (k & 1) * 2, x1 - ((k + 1) & 1) * 2, y0, y1, 4 + k * 4, c, (x, v) => (x % 16 === 0 ? rp(c)[0] : rp(c)[(v & 3) ? 2 : 1]), k * 4); },
  paint: (q, p, x0, y0, x1, y1, w, d, h, g) => { q.slab(x0, x1, y0, y1, h - 8, '#7a7e86', '#5a5e68'); for (let x = x0 + 3; x + 4 < x1; x += 7) for (let Y = y0 + 2; Y + 4 < y1; Y += 6) { const col = g[Math.floor(hash(x, Y, 1623) * g.length)]; q.slab(x, x + 5, Y, Y + 4, h, (xx, YY) => (xx === 0 || YY === 0 ? STEEL : col), STEEL, h - 8); } },
  ladder: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { for (const lx of [x0, x1 - 2]) q.slab(lx, lx + 2, y0, y1, h, c); for (let v = 6; v < h; v += 7) for (let x = x0; x < x1; x++) q.px(x, y1, v, rp(c)[3], S); },
  machine: (q, p, x0, y0, x1, y1, w, d, h) => { MACH[p.k] && MACH[p.k](q.slab, q.px, q.dot, x0, y0, x1, y1, h, q.H); },
  bins: (q, p, x0, y0, x1, y1, w, d, h) => {
    for (let x = x0; x + 20 <= x1; x += 24) {
      const col = rgb(p.g[Math.floor(hash(x, y0, 1624) * p.g.length)]);
      q.slab(x, x + 22, y0, y1, h, p.sleeves ? (xx, YY) => (xx < 2 || xx > 19 || YY < 1 || YY > d - 2 ? [90, 58, 36] : YY % 3 === 0 ? [30, 28, 34] : rgb(p.g[Math.floor(hash(x + YY, 1, 1625) * p.g.length)])) : '#8a6440');
      if (!p.sleeves) for (let k = 0; k < 40; k++) { const qx = x + 3 + hash(k, x, 1625) * 16, qy = y0 + 3 + hash(k, y0, 1626) * (d - 6); q.dot(qx, qy, h + 1 + (hash(k, 3, 1627) * 3 | 0), mix(col, WHITE, hash(k, 4, 1628) * 0.3), 3); }
    }
  },
  // the bank's queue: brass stanchions, a red velvet rope sagging between them, zigzag up to the tellers
  posts: (q, p, x0, y0, x1, y1, w, d, h) => {
    const pc = rgb(p.c);
    for (const lx of [x0 + 2, x1 - 4]) { for (let Y = y0; Y <= y1; Y += 14) { q.slab(lx - 2, lx + 3, Y - 2, Y + 2, 2, '#b8943a', '#8a6a2a'); q.slab(lx - 1, lx + 2, Y - 1, Y + 1, h + 2, '#e8c860', '#c8a040', 2); } for (let Y = y0; Y <= y1; Y++) for (const o of [0, 1]) q.px(lx + o, Y, h - 1 - Math.round(Math.sin(((Y - y0) % 14) / 14 * Math.PI) * 3), pc); }
    for (let x = x0 + 3; x < x1 - 3; x++) q.px(x, y1, h - 1 - Math.round(Math.sin((x - x0) / w * Math.PI) * 3), pc, S);
  },
  // a rug: its border, its field, and (the pawn shop's) words on it
  rug: (q, p, x0, y0, x1, y1, w, d) => {
    const a = rp(p.c), b = rgb(p.c2);
    for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) { const e = Math.min(x - x0, x1 - 1 - x, Y - y0, y1 - 1 - Y); q.px(x, Y, 1, e < 2 ? a[1] : e < 4 ? b : ((x + Y) & 15) < 2 && ((x - Y) & 15) < 2 ? b : a[2]); }
    if (p.text) {
      const words = ['GOOD', 'STUFF', 'COSTS', 'LESS'], hh = 16;
      let n = words.length; while (n > 1 && n * hh + 8 > d) n--;
      let Y = y0 + Math.floor((d - n * hh) / 2); if (((Y - 1) & 1) !== 0) Y++;
      for (let i = 0; i < n; i++) { const M = lineMask(words[i], 'civic'); if (M.w * 2 > w - 6) continue; paintLine((x, y, c) => q.px(x, Y + y, 1, c), words[i], 'civic', x0 + Math.round((w - M.w * 2) / 4) * 2, 0, { 1: mix(b, WHITE, 0.3) }); Y += hh; }
    }
  },
  mat: (q, p, x0, y0, x1, y1) => { const a = rp(p.c); for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) q.px(x, Y, 1, Y === y0 || Y === y1 - 1 || x === x0 || x === x1 - 1 ? a[1] : (x + Y) % 3 ? a[2] : a[3]); },
  // IN3's compass rose set in the marble: a ring of brass and dark stone, the eight points
  rose: (q, p, x0, y0, x1, y1, w, d) => {
    const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2, rx = w / 2, ry = d / 2, A = rgb(p.c), B = rgb(p.c2);
    for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) {
      const nx = (x - cx) / rx, ny = (Y - cY) / ry, rr = Math.hypot(nx, ny);
      if (rr > 1) continue;
      let c = null;
      if (rr > 0.9) c = A; else if (rr > 0.84) c = B; else if (rr > 0.8) c = A;
      else { const a = Math.atan2(ny, nx), k = Math.abs(Math.cos(a * 2)), kk = Math.abs(Math.cos(a * 2 + Math.PI / 2)), lim = Math.pow(k, 6) * 0.78 + 0.08, lim2 = Math.pow(kk, 6) * 0.5 + 0.06; if (rr < lim) c = (a % (Math.PI / 2) + Math.PI * 2) % (Math.PI / 2) < Math.PI / 4 ? A : mix(A, WHITE, 0.25); else if (rr < lim2) c = B; }
      if (c) q.px(x, Y, 1, c);
    }
  },
  // the bank manager's office: low glass walls on brass posts round a desk with its lamp, a chair and a palm
  office: (q, p, x0, y0, x1, y1, w, d, h) => {
    const glassAt = (x, v) => (v > h - 3 ? [200, 160, 80] : v < 4 ? [96, 84, 70] : (x + v) % 17 < 2 ? lit([226, 238, 244], 40) : null);
    for (let Y = y0; Y < y1; Y++) for (const lx of [x0, x1 - 1]) for (let z = h - 2; z < h; z++) q.px(lx, Y, z, [200, 160, 80]);
    for (let x = x0; x < x1; x++) q.px(x, y0, h - 1, [200, 160, 80]);
    const doorX = p.door > 0 ? x1 - 20 : x0 + 4;
    for (let x = x0; x < x1; x++) { if (x >= doorX && x < doorX + 16) continue; for (let v = 0; v < h; v++) { const c = glassAt(x - x0, v); if (c) q.px(x, y1, v, c, S, c.length > 3 ? c : undefined); } }
    const dx0 = x0 + Math.round(w * 0.25), dy0 = y0 + 8;
    q.slab(dx0, dx0 + 40, dy0, dy0 + 14, 18, '#5a3a26'); q.slab(dx0 + 4, dx0 + 8, dy0 + 2, dy0 + 6, 26, '#2a6a3a', '#c8a050', 18); q.dot(dx0 + 4, dy0 + 2, 27, lit([255, 230, 160], 200), 3, lit([255, 220, 150], 200)); q.dot(dx0 + 20, dy0 + 4, 19, WHITE, 4);
    q.slab(dx0 + 14, dx0 + 26, dy0 - 8, dy0 - 1, 22, '#2a2a30', '#3a3a44', 8);
    q.slab(dx0 + 12, dx0 + 22, dy0 + 18, dy0 + 26, 16, '#5a2a24', '#4a2018');
    PIECE.plant(q, { big: true }, x1 - 16, y0 + 4, x1 - 4, y0 + 14, 12, 10, 24);
  },
  desk: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { q.slab(x0, x1, y0, y1 - 8, h, c); q.slab(x0 + 10, x0 + 22, y0 + 2, y0 + 5, h + 12, '#22262e', '#3a4a66', h); q.dot(x0 + 28, y0 + 4, h + 1, WHITE, 4); if (p.lampOn) { q.slab(x1 - 8, x1 - 4, y0 + 2, y0 + 5, h + 8, '#2a6a3a', '#c8a050', h); q.dot(x1 - 8, y0 + 2, h + 9, lit([255, 230, 160], 200), 3, lit([255, 220, 150], 200)); } q.slab(x0 + 14, x0 + 26, y1 - 6, y1, 10, '#2a2a30', '#3a3a44'); q.slab(x0 + 14, x0 + 26, y1 - 2, y1, 20, '#2a2a30', '#3a3a44', 10); },
  bench: (q, p, x0, y0, x1, y1, w, d, h, g, c) => q.slab(x0, x1, y0, y1, h, c, (x, v) => (v < h - 4 && (x - 2) % 30 > 3 ? null : rp(c)[2])),
  chairs: (q, p, x0, y0, x1, y1, w, d, h) => { for (let x = x0; x + 11 <= x1; x += 13) { q.slab(x, x + 11, y0, y0 + 9, 9, p.c, '#7a7e86'); q.slab(x, x + 11, y0 + 9, y1, h, p.c, p.c, 9); } },
  chair: (q, p, x0, y0, x1, y1, w, d, h) => {
    if (p.long) { q.slab(x0, x1, y0, y1, 12, p.c, '#5a5e68'); q.slab(x0, x0 + 8, y0, y1, 18, p.c, p.c, 12); return; }
    const mx = (x0 + x1) / 2; q.slab(mx - 5, mx + 5, y0 + 4, y1 - 4, 6, '#c8ccd2'); q.slab(x0, x1, y0 + 4, y1, 12, p.c, p.c, 6); q.slab(x0, x1, y0, y0 + 4, h, p.c, p.c, 6); if (p.arm) { q.slab(x0, x0 + 3, y0, y1, 16, p.c, p.c, 6); q.slab(x1 - 3, x1, y0, y1, 16, p.c, p.c, 6); }
  },
  // a sofa (the pawn shop's leather couch, the bank's waiting sofa): its back along the north, the seat, the arms
  sofa: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { const R = rp(c); q.slab(x0, x1, y0, y0 + 5, h + 6, c, c); q.slab(x0, x1, y0 + 5, y1, h - 4, (x, Y) => (x % Math.max(8, (w / 3 | 0)) === 0 ? R[1] : Y < 2 ? R[3] : R[2]), c); q.slab(x0, x0 + 4, y0 + 5, y1, h, c); q.slab(x1 - 4, x1, y0 + 5, y1, h, c); },
  // IN5 Velvet's booths: high-backed curved banquettes in red velvet, tufted (along a side wall, its back to the wall)
  velvet: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    const R = rp(c), tuft = (x, Y) => ((x >> 2) + (Y >> 2)) & 1 ? R[2] : R[3];
    if (p.side) { const bx = p.side < 0 ? x0 : x1 - 5; q.slab(bx, bx + 5, y0, y1, h + 8, c, c); q.slab(p.side < 0 ? x0 + 5 : x0, p.side < 0 ? x1 : x1 - 5, y0, y1, 10, tuft, c); return; }
    q.slab(x0, x1, y0, y0 + 5, h + 8, c, c); q.slab(x0, x1, y0 + 5, y1, 10, tuft, c); if (p.curved) { q.slab(x0, x0 + 5, y0 + 5, y1, h + 4, c); q.slab(x1 - 5, x1, y0 + 5, y1, h + 4, c); }
  },
  // a table set: a round or square table (a candle, mugs, a deal of cards on it) and its chairs either side
  tableset: (q, p, x0, y0, x1, y1, w, d, h) => {
    const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2, ch = p.chairs || '#5a3a26', tr = Math.min(w, d) / 2 - 5, th = p.high ? 22 : 16;
    for (const [sx, sy] of [[x0 + 1, cY - 3], [x1 - 7, cY - 3]]) { q.slab(sx, sx + 6, sy, sy + 6, p.high ? 14 : 9, ch, ch); q.slab(sx < cx ? sx : sx + 4, sx < cx ? sx + 2 : sx + 6, sy, sy + 6, p.high ? 20 : 16, ch, ch, p.high ? 14 : 9); }
    if (d >= 22 && !p.high) { q.slab(cx - 3, cx + 3, y0, y0 + 5, 9, ch, ch); q.slab(cx - 3, cx + 3, y0, y0 + 2, 16, ch, ch, 9); }
    q.slab(cx - 1, cx + 1, cY, cY + 1, th, '#2a2a30');
    const top = rp(p.c2 || p.c || '#5a3a26'), rim = rp(p.c || '#3a2a20');
    if (p.round) q.disc(cx, cY, tr, th, (dx, dy, dd) => (dd > tr - 1 ? rim[1] : dx + dy < -tr * 0.6 ? top[3] : top[2])); else q.slab(cx - tr, cx + tr, cY - tr * 0.7, cY + tr * 0.7, th, p.c2 || '#6a4630', p.c || '#4a3020');
    if (p.candle) { q.dot(cx - 1, cY - 1, th + 1, [240, 236, 220], 2); q.dot(cx - 1, cY - 3, th + 3, lit([255, 200, 110], 230), 2, lit([255, 200, 110], 230)); q.dot(cx + 3, cY + 1, th + 1, [200, 220, 230], 2); }
    if (p.mugs) { q.dot(cx - 4, cY - 2, th + 2, [240, 200, 90], 3); q.dot(cx + 2, cY, th + 2, [240, 200, 90], 3); }
    if (p.cards) for (let k = 0; k < 5; k++) q.dot(cx - 6 + k * 3, cY - 1 + (k & 1), th + 1, k & 1 ? [200, 40, 44] : WHITE, 2);
  },
  // the tavern's long table: planks, a bench along each side, mugs down it
  longtable: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    q.slab(x0, x1, y0, y0 + 5, 10, '#5a3a24', '#4a3020'); q.slab(x0, x1, y1 - 5, y1, 10, '#5a3a24', '#4a3020');
    q.slab(x0 + 2, x1 - 2, y0 + 7, y1 - 7, h, (x, Y) => (Y % 5 === 0 ? rp(c)[1] : rp(c)[2 + ((x / 24 | 0) & 1)]), c);
    for (let x = x0 + 8; x < x1 - 8; x += 14) { q.dot(x, y0 + 8 + ((x / 14 | 0) & 1) * (d - 20), h + 2, [240, 200, 90], 3); q.dot(x, y0 + 8 + ((x / 14 | 0) & 1) * (d - 20), h + 4, WHITE, 2); }
  },
  // the sports bar's booths in a run down the wall: a bench, a table, a bench, again
  booth: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    if (p.run) {
      for (let Y = y0; Y + 34 <= y1; Y += 38) { q.slab(x0, x1, Y, Y + 5, h, p.c); q.slab(x0, x1, Y + 5, Y + 10, 9, p.c); q.slab(x0 + 4, x1 - 4, Y + 12, Y + 22, 15, '#8a6440'); q.dot((x0 + x1) / 2 - 1, Y + 15, 16, [236, 200, 90]); q.slab(x0, x1, Y + 24, Y + 29, 9, p.c); q.slab(x0, x1, Y + 29, Y + 34, h, p.c); }
      return;
    }
    const m = (y0 + y1) / 2; q.slab(x0, x0 + 3, y0, y1, h, p.c); q.slab(x0 + 3, x0 + 9, y0, y1, 9, p.c); q.slab(x0 + 11, x1 - 11, y0 + 2, y1 - 2, 15, '#8a6440'); q.slab(x1 - 9, x1 - 3, y0, y1, 9, p.c); q.slab(x1 - 3, x1, y0, y1, h, p.c); q.dot((x0 + x1) / 2 - 1, m - 1, 16, [236, 200, 90]);
  },
  // a pool table: the rails, the pockets, the cloth - its balls drawn live over it (client/poolview.js)
  pool: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    q.slab(x0, x1, y0, y1, h, c);
    for (let Y = y0 + 5; Y < y1 - 5; Y++) for (let x = x0 + 5; x < x1 - 5; x++) q.px(x, Y, h + 1, rp(p.c2)[(x + Y) % 9 === 0 ? 1 : 2]);
    for (const [px, py] of [[x0 + 4, y0 + 4], [x1 - 6, y0 + 4], [x0 + 4, y1 - 6], [x1 - 6, y1 - 6], [(x0 + x1) / 2 - 1, y0 + 3], [(x0 + x1) / 2 - 1, y1 - 5]]) q.dot(px, py, h + 2, [16, 16, 18], 3);
  },
  // MC4's arm-wrestling table: a stout small table, an elbow pad either side, a stool each
  armwrestle: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { const cx = (x0 + x1) / 2; for (const sx of [x0, x1 - 9]) q.slab(sx, sx + 9, y0 + 8, y0 + 17, 13, '#c8c8cc', '#5a3a24'); q.slab(cx - 12, cx + 12, y0 + 2, y1 - 2, h, c); q.dot(cx - 8, y0 + 10, h + 1, [200, 40, 44], 4); q.dot(cx + 4, y0 + 10, h + 1, [200, 40, 44], 4); q.dot(cx - 2, y0 + 6, h + 2, [90, 140, 70], 3); },
  // a wood stove: the black drum, its glowing window, the pipe up
  stove: (q, p, x0, y0, x1, y1, w, d, h) => { q.slab(x0 + 2, x1 - 2, y0 + 3, y1 - 1, 18, '#2a2a2e', (x, v) => (v > 5 && v < 12 && x > 3 && x < w - 7 ? lit([255, 140, 50], 230) : [34, 34, 38])); q.slab(x0 + 6, x0 + 10, y0, y0 + 4, h, '#3a3a40', '#2a2a2e', 18); },
  barrel: (q, p, x0, y0, x1, y1, w, d, h, g, c) => { const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2 - 2, rr = Math.min(w, d) / 2 - 1, R = rp(c); q.disc(cx, cY, rr, h, (dx, dy, dd) => (dd > rr - 1.5 ? [70, 70, 74] : dd < 2 ? R[1] : R[2 + ((dx + 99) % 4 === 0 ? 1 : 0)])); for (let x = Math.round(cx - rr); x <= cx + rr; x++) for (let v = 0; v < h; v++) q.px(x, Math.round(cY + rr), v, v % 8 === 2 || v === h - 2 ? [70, 70, 74] : R[(x % 3) ? 2 : 1], S); },
  // a spinner rack (sunglasses, chips, postcards): a round base, a post, tiers of goods round it
  spinner: (q, p, x0, y0, x1, y1, w, d, h, g) => { const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2; q.disc(cx, cY, w / 2 - 1, 2, () => [70, 72, 78]); for (let v = 2; v < h; v++) q.px(cx, cY + 3, v, CHROME, [1, 0, 0]); for (let t = 0; t < 3; t++) { const z = 10 + t * 7; q.disc(cx, cY, w / 2 - 2, z, (dx, dy, dd) => (dd > w / 2 - 3 ? g[Math.floor(hash(Math.round(Math.atan2(dy, dx) * 3) + 9, t, 1655) * g.length)] : null)); } },
  // a wet-floor sign: the yellow A-frame
  wetfloor: (q, p, x0, y0, x1, y1, w, d, h) => { const cx = (x0 + x1) / 2; for (let v = 0; v < h; v++) for (let x = -3 + (v >> 3); x <= 3 - (v >> 3); x++) q.px(cx + x, y1 - 2, v, v % 5 === 2 && Math.abs(x) < 2 ? DARK : [240, 200, 40], S); },
  // a display table of folded clothes in stacks, or of things laid on it
  table: (q, p, x0, y0, x1, y1, w, d, h, g, c) => {
    q.slab(x0, x1, y0, y1, h, c);
    if (p.folded) { for (let x = x0 + 3; x + 8 < x1; x += 11) for (let Y = y0 + 2; Y + 6 < y1; Y += 8) { const col = g[Math.floor(hash(x, Y, 1630) * g.length)]; q.slab(x, x + 8, Y, Y + 6, h + 4 + (hash(x, 1, 1629) * 3 | 0), (xx, YY) => (YY === 0 ? mix(col, WHITE, 0.3) : YY === 3 ? mix(col, DARK, 0.25) : col), mix(col, DARK, 0.2), h); } return; }
    for (let x = x0 + 3; x + 8 < x1; x += 11) { const col = g[Math.floor(hash(x, y0, 1630) * g.length)]; q.slab(x, x + 8, y0 + 3, y1 - 3, h + 3 + (hash(x, 1, 1629) * 3 | 0), col, col, h); }
  },
  // a floor rack of clothes on hangers: two uprights, the rail, the shirts hung along it
  rack: (q, p, x0, y0, x1, y1, w, d, h, g) => {
    for (const lx of [x0, x1 - 2]) q.slab(lx, lx + 2, y0 + 4, y0 + 8, h, '#a8aab0');
    for (let x = x0 + 3; x < x1 - 3; x++) {
      const k = (x - x0) / 5 | 0, col = g[Math.floor(hash(k >> 1, y0, 1631) * g.length)], e = (x - x0) % 5;
      if (e === 4) continue;
      const cc = e === 0 ? mix(col, DARK, 0.3) : e === 3 ? mix(col, WHITE, 0.15) : col, len = 12 + ((hash(k >> 1, 3, 1632) * 3 | 0) * 2);
      for (let v = h - 1 - len; v < h - 1; v++) q.px(x, y0 + 6, v, v > h - 4 && (e === 0 || e === 3) ? mix(col, DARK, 0.2) : cc, S);
      for (let Y = y0 + 3; Y < y0 + 9; Y++) q.px(x, Y, h - 1, Y === y0 + 3 ? mix(col, WHITE, 0.25) : cc);
      q.px(x, y0 + 6, h, STEEL);
    }
  },
  // a round rack: a ring of clothes hung round a chrome post, seen from above
  roundrack: (q, p, x0, y0, x1, y1, w, d, h, g) => {
    const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2, rr = Math.min(w, d) / 2 - 1;
    q.disc(cx, cY, 3, 2, () => [90, 94, 100]);
    q.disc(cx, cY, rr, h, (dx, dy, dd) => { if (dd < rr - 6) return dd < 1.5 ? CHROME : null; const k = Math.round((Math.atan2(dy, dx) + Math.PI) * 4), col = rgb(g[Math.floor(hash(k >> 1, 5, 1656) * g.length)]); return dd > rr - 1.5 ? mix(col, DARK, 0.25) : k & 1 ? col : mix(col, WHITE, 0.15); });
    for (let x = Math.round(cx - rr + 1); x < cx + rr - 1; x++) { const k = Math.round(x - cx + 99), col = rgb(g[Math.floor(hash(k >> 2, 7, 1656) * g.length)]); for (let v = 6; v < h; v++) q.px(x, Math.round(cY + rr * 0.8), v, k % 4 === 0 ? mix(col, DARK, 0.3) : col, S); }
  },
  // the surf shop's boards stood along the wall, side by side, noses up, each its colour with a stringer down it
  boards: (q, p, x0, y0, x1, y1, w, d, h, g) => {
    // (ST1: a rack of surfboards stood on their tails side by side, decks to the room, noses up - an outline, the
    // stringer down the middle, a stripe; a low rail at their feet)
    const bw = 8;
    q.slab(x0, x1, y0, y0 + 4, 6, '#6a4a30');
    for (let x = x0 + 1, k = 0; x + bw <= x1; x += bw + 2, k++) {
      const col = g[k % g.length], R = rp(col), len = h - (k % 3) * 6, Y = y0 + 6 + (k & 1);
      for (let v = 0; v < len; v++) { const t = v / len, half = (bw / 2) * Math.sqrt(Math.sin(Math.min(1, t * 1.1 + 0.06) * Math.PI)); for (let i = 0; i < bw; i++) { const dx = i + 0.5 - bw / 2; if (Math.abs(dx) > half) continue; q.px(x + i, Y, v, Math.abs(dx) > half - 1 ? R[1] : Math.abs(dx) < 0.6 ? WHITE : t > 0.55 && t < 0.62 ? mix(rgb(col), WHITE, 0.6) : R[2 + (dx < 0 ? 1 : 0)], S); } }
    }
  },
  mirror: (q, p, x0, y0, x1, y1, w, d, h, g, c) => q.slab(x0, x1, y0, y1, h, c, (x, v) => (v < 12 ? rp(c)[1] : x < 2 || x > w - 3 || v > h - 3 ? rp(c)[3] : (x + v) % 13 < 2 ? [214, 230, 240] : [160, 188, 204])),
  ice: (q, p, x0, y0, x1, y1, w, d, h) => q.slab(x0, x1, y0, y1, h, (x, Y) => { const fx = (x % 20) - 10, fy = (Y % 10) - 5; return Y > 2 && Y < d - 2 && fx * fx / 50 + fy * fy / 6 < 1 ? (fx > 6 ? [120, 130, 140] : [168, 180, 190]) : hash(x, Y, 1632) > 0.6 ? WHITE : [210, 226, 232]; }, '#7a8a96'),
  stool: (q, p, x0, y0, x1, y1, w, d, h) => { const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; for (let v = 0; v < h; v++) q.px(mx, my + 2, v, CHROME, [1, 0, 0]); q.disc(mx, my, 3, h + 1, (dx, dy) => (dx + dy < -2 ? mix(rgb(p.c), WHITE, 0.3) : rgb(p.c))); },
  // the dance floor: lit squares in the club's colours between dark grout, (NE9) a neon strip round its edge
  dance: (q, p, x0, y0, x1, y1, w, d, h, g) => {
    const edge = p.edge ? rgb(p.edge) : null;
    for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) {
      if (edge && (x - x0 < 2 || x1 - 1 - x < 2 || Y - y0 < 2 || y1 - 1 - Y < 2)) { q.px(x, Y, 1, mix(edge, WHITE, 0.3), UP, lit(edge, 200)); continue; }
      const i = ((x - x0) >> 4) + ((Y - y0) >> 4) * 7, on = hash(i, 1, q.R.seed & 255) > 0.4, col = g[i % g.length], lx = (x - x0) & 15, ly = (Y - y0) & 15;
      if (lx === 0 || ly === 0) q.px(x, Y, 1, [20, 18, 26]);
      else if (on) q.px(x, Y, 1, lx < 3 && ly < 3 ? mix(col, WHITE, 0.35) : mix(col, [30, 26, 40], 0.3), UP, lit(col, 120));
      else q.px(x, Y, 1, mix(col, [24, 22, 32], 0.82));
    }
  },
  // a speaker stack on the floor: the cabinet, its two cones facing the room
  speaker: (q, p, x0, y0, x1, y1, w, d, h) => q.slab(x0, x1, y0, y1, h, '#26262e', (x, v) => { const cx = w / 2; for (const cy of [h * 0.3, h * 0.7]) { const dd = Math.hypot(x + 0.5 - cx, v + 0.5 - cy); if (dd < w * 0.36) return dd < w * 0.12 ? [80, 80, 90] : dd > w * 0.29 ? [64, 64, 72] : [20, 20, 24]; } return x < 1 || x >= w - 1 ? [54, 54, 62] : [34, 34, 40]; }),
  // the mirror ball over the floor, sparkling
  disco: (q, p, x0, y0, x1, y1, w, d, h) => { const cx = (x0 + x1) / 2, cY = (y0 + y1) / 2, rr = Math.min(w, d) / 2 - 1; q.disc(cx, cY, rr, h, (dx, dy, dd) => { const f = ((dx + 99) >> 1) + ((dy + 99) >> 1) * 3; return dd > rr - 1 ? [110, 114, 126] : hash(f, 1, 1661) > 0.82 ? lit(WHITE, 230) : dx + dy < -rr * 0.4 ? [214, 218, 230] : (f & 1 ? [150, 156, 172] : [180, 186, 200]); }); for (let k = 0; k < 6; k++) q.px(cx, cY - rr - 1, h + k, [70, 70, 76]); },
  // the VIP corner's raised carpet: a gold border, deep red pile, a step at its edge
  vip: (q, p, x0, y0, x1, y1, w, d) => { const a = rp(p.c), b = rgb(p.c2); for (let Y = y0; Y < y1; Y++) for (let x = x0; x < x1; x++) { const e = Math.min(x - x0, x1 - 1 - x, Y - y0, y1 - 1 - Y); q.px(x, Y, 2, e < 2 ? b : ((x + Y) & 7) === 0 ? a[1] : a[2]); } for (let x = x0; x < x1; x++) for (let v = 0; v < 2; v++) q.px(x, y1, v, a[1], S); },
  // the velvet rope: brass posts down the line, the red rope sagging between them
  rope: (q, p, x0, y0, x1, y1, w, d, h) => {
    const pc = rgb(p.c), lx = Math.round((x0 + x1) / 2), n = Math.max(1, Math.round(d / 26)), step = d / n;
    for (let k = 0; k <= n; k++) { const Y = Math.round(y0 + k * step); q.slab(lx - 2, lx + 3, Y - 2, Y + 2, 2, '#b8943a', '#8a6a2a'); q.slab(lx - 1, lx + 2, Y - 1, Y + 1, h + 2, '#e8c860', '#c8a040', 2); q.dot(lx - 1, Y - 2, h + 3, GOLD, 3); }
    for (let Y = y0; Y <= y1; Y++) for (const o of [0, 1]) q.px(lx + o, Y, h - 1 - Math.round(Math.sin(((Y - y0) % step) / step * Math.PI) * 4), pc);
  },
  plant: (q, p, x0, y0, x1, y1, w, d, h) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, big = p.big || p.palm ? 1.35 : 1;
    q.slab(mx - 5, mx + 5, my - 4, my + 4, 9, p.palm ? '#d8c8a8' : '#b0603c', p.palm ? '#b8a888' : '#9a5030');
    const n = Math.round(120 * big);
    for (let k = 0; k < n; k++) {
      const a = hash(k, x0, 81) * 6.283, dd = Math.sqrt(hash(k, y0, 82)) * 8 * big;
      if (p.palm) { const fr = k % 7, ang = fr / 7 * 6.283, t = hash(k, 5, 84); q.px(mx + Math.cos(ang) * t * 11, my - 2 + Math.sin(ang) * t * 6, 9 + (h - 9) * (1 - Math.pow(t - 0.35, 2) * 2), [[52, 130, 58], [78, 166, 70], [40, 106, 48]][k % 3], [Math.cos(ang) * 0.5, -0.4, 0.75]); continue; }
      const z = 9 + hash(k, 3, 83) * (h - 4) * (1 - dd / (10 * big));
      q.px(mx + Math.cos(a) * dd, my - 2 + Math.sin(a) * dd * 0.6, z, [[52, 120, 58], [78, 156, 70], [40, 96, 48], [100, 176, 84]][k & 3], [Math.cos(a) * 0.5, -0.4, 0.75]);
    }
  },
};
