// The items, as pixel art (the owner, 11-21: "the UI art overall needs help, and the icons ... symbols and icons for
// different weapons or items or inventory"). The bag and the quick wheel showed every item as a system emoji - one fish
// for every fish, one seedling for every seed, a dot for what had none. Here each item in shared/items.js has its own
// picture on a 24 x 24 grid in the game's SNES style, after the owner's icon sheets (docs/art-v2/targets IC1-IC5): a
// dark coloured outline, three tones lit from the upper left, a catch-light. Made here from a few shapes each (no image
// file); the page loads it with the bag, never with its first load.
//   itemSprite(id) -> { w, h, px: Uint32Array (ABGR, as ImageData's bytes) }   the item's pixels (kept), or null
//   itemIconURL(id) -> a PNG data URL (kept), or '' without a DOM or for an id with no picture
//   itemIcon(id, px) -> '<img class="iti" ...>' (px CSS pixels, or sized by the style sheet), or '' (the caller's own)
//   weaponSprite(id), weaponIconURL(id), weaponIcon(id, px): the same for the weapons

export const ICON_N = 24;
const N = ICON_N;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lite = (c, k = 0.38) => mix(c, [255, 250, 232], k);                      // (toward a warm white)
const dusk = (c, k = 0.34) => [c[0] * (1 - k), c[1] * (1 - k * 1.05), Math.min(255, c[2] * (1 - k * 0.8) + 10 * k)];   // (darker, toward blue)
const INK = (c) => [c[0] * 0.26 + 6, c[1] * 0.22 + 4, c[2] * 0.3 + 16];        // (the outline: the fill's own colour, very dark)

// ---- the painter ------------------------------------------------------------------------------------------------------
// Shapes are filled in three tones by where a pixel lies across the shape from the light (the upper left); o.f: one flat
// tone, o.k: how strongly it shades (1). Colours are '#rrggbb'. Everything drawn before ink() gets the outline; what is
// drawn after sits on top of it (a catch-light, a label's mark).
class Pen {
  constructor() { this.c = new Array(N * N).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) this.c[y * N + x] = c; }
  tone(c, t, o) { if (o && o.f) return c; const k = (o && o.k) ?? 1; return t > 0.34 / k ? lite(c, 0.36) : t < -0.3 / k ? dusk(c) : c; }
  // an ellipse
  E(cx, cy, rx, ry, col, o) {
    const c = hex(col);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x - cx) / rx, v = (y - cy) / ry;
      if (u * u + v * v <= 1.02) this.set(x, y, this.tone(c, -(u * 0.62 + v * 0.78), o));
    }
    return this;
  }
  // a box, x0..x1 by y0..y1 (whole pixels, both ends in); o.r: corners cut by that many pixels
  R(x0, y0, x1, y1, col, o) {
    const c = hex(col), r = (o && o.r) || 0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(0.5, (x1 - x0) / 2), hh = Math.max(0.5, (y1 - y0) / 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = Math.min(x - x0, x1 - x), dy = Math.min(y - y0, y1 - y);
      if (dx + dy < r) continue;
      this.set(x, y, this.tone(c, -((x - cx) / hw * 0.55 + (y - cy) / hh * 0.7) * 0.8, o));
    }
    return this;
  }
  // a filled polygon [[x, y], ...]
  P(pts, col, o) {
    const c = hex(col);
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = Math.max(0.5, (x1 - x0) / 2), hh = Math.max(0.5, (y1 - y0) / 2);
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; }
      if (ins) this.set(x, y, this.tone(c, -((x - cx) / hw * 0.55 + (y - cy) / hh * 0.7) * 0.8, o));
    }
    return this;
  }
  // a line, w pixels thick (flat)
  L(x0, y0, x1, y1, col, w = 1) {
    const c = hex(col), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1, h = (w - 1) / 2;
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; for (let dy = -h; dy <= h; dy++) for (let dx = -h; dx <= h; dx++) this.set(x + dx, y + dy, c); }
    return this;
  }
  D(x, y, col) { this.set(x, y, hex(col)); return this; }
  // a curve from a to b bent toward c (a quadratic), w pixels thick (flat)
  Q(a, c, b, col, w = 1) { let px = a[0], py = a[1]; for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t, x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]; this.L(px, py, x, y, col, w); px = x; py = y; } return this; }
  // a round stick (a handle): lit along its upper left, shaded along its lower right
  S(x0, y0, x1, y1, col, w = 3) { const c = hex(col), n = Math.hypot(x1 - x0, y1 - y0) || 1, ux = -(y1 - y0) / n, uy = (x1 - x0) / n, k = ux + uy < 0 ? 1 : -1, d = (w - 1) / 2; this.L(x0, y0, x1, y1, col, w); if (w >= 2) { const lx = ux * k * d, ly = uy * k * d; this.L2(x0 + lx, y0 + ly, x1 + lx, y1 + ly, lite(c, 0.3)); if (w >= 3) this.L2(x0 - lx, y0 - ly, x1 - lx, y1 - ly, dusk(c)); } return this; }
  L2(x0, y0, x1, y1, c) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1; for (let i = 0; i <= n; i++) this.set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); }
  cut(x, y) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) this.c[y * N + x] = null; return this; }
  // the outline round everything drawn so far
  ink() {
    const add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (this.c[y * N + x]) continue;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N && this.c[yy * N + xx]) { add.push([y * N + x, INK(this.c[yy * N + xx])]); break; } }
    }
    for (const [i, c] of add) this.c[i] = c;
    return this;
  }
}

// ---- the parts that come back ------------------------------------------------------------------------------------------
const GLASS = '#cfe6ee';
// a bottle: its glass, what's in it, a label, a cap
const bottle = (p, glass, label, cap = '#c8a23a', tall = 1) => {
  const top = tall ? 2 : 5;
  p.R(8, 10, 15, 21, glass, { r: 1 }).R(10, top + 2, 13, 10, glass).R(10, top, 13, top + 1, cap);
  if (label) p.R(8, 13, 15, 17, label, { f: 1 });
};
// a cup with a lid (coffee) or open (a soft drink), a mug with a head (beer)
const cup = (p, body, lid, band) => { p.P([[7, 8], [16, 8], [15, 21], [8, 21]], body); if (lid) p.R(6, 6, 17, 8, lid, { r: 1 }); if (band) p.R(8, 12, 15, 15, band, { f: 1 }); };
// a cut of raw meat with its fat and bone; a cooked one on a plate
const cut = (p, meat, fat = '#f6e4d0') => { p.P([[3, 10], [7, 5], [14, 3], [19, 5], [21, 10], [20, 16], [14, 20], [7, 19], [3, 15]], fat, { f: 1 }).P([[6, 10], [9, 7], [14, 5.5], [18, 7.5], [19, 11], [18, 15], [13, 18], [8, 17], [6, 14]], meat).E(8.5, 12, 2.2, 2.2, '#f2ead8', { f: 1 }).E(8.5, 12, 1, 1, '#d8a8a0', { f: 1 }); const m = lite(hex(meat), 0.3), mh = '#' + m.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); p.L(12, 8, 16, 9, mh).L(12, 12, 17, 13, mh).L(11, 15, 15, 16, mh); };
const plate = (p) => p.E(11.5, 16, 10, 5, '#e6e2da').E(11.5, 15.5, 7.5, 3.4, '#f6f2ea', { f: 1 });
// a hide pegged out flat (four legs, a neck), a pelt with its tail
const hide = (p, c, mark) => {
  p.P([[6, 4], [9, 6], [14, 6], [17, 4], [18, 7], [16, 9], [16, 14], [19, 17], [17, 20], [14, 17], [9, 17], [6, 20], [4, 17], [7, 14], [7, 9], [5, 7]], c);
  if (mark) p.R(10, 8, 13, 15, mark, { f: 1 });
};
const pelt = (p, c, belly, tailTip) => {
  p.P([[7, 3], [10, 5], [13, 5], [16, 3], [17, 6], [15, 8], [15, 13], [18, 15], [16, 17], [14, 15], [13, 15], [13, 21], [10, 21], [10, 15], [9, 15], [7, 17], [5, 15], [8, 13], [8, 8], [6, 6]], c);
  if (belly) p.R(10, 7, 13, 13, belly, { f: 1 });
  if (tailTip) p.R(10, 19, 13, 21, tailTip, { f: 1 });
};
// a paper seed packet with the crop's colour on it; a mushroom; a stone or a crystal
const packet = (p, c, c2) => { p.R(6, 3, 17, 21, '#e8dcc0', { r: 1 }).R(6, 3, 17, 6, '#b8a888', { f: 1 }).E(11.5, 13, 3.6, 3.6, c); if (c2) p.R(11, 8, 12, 10, c2, { f: 1 }); };
const shroom = (p, cap, stem = '#f2ead8', spots, gills = '#d8c4a0') => { p.P([[9, 13], [14, 13], [14, 18], [16, 21], [7, 21], [9, 18]], stem).P([[2, 12], [3, 8], [6, 4], [10, 2], [13, 2], [17, 4], [20, 8], [21, 12], [19, 13], [4, 13]], cap).R(4, 12, 19, 13, gills, { f: 1 }).R(8, 16, 15, 16, gills, { f: 1 }); if (spots) for (const [x, y] of [[6, 7], [11, 4], [16, 7], [9, 9], [14, 10], [18, 10]]) p.R(x, y, x + 1, y + (x % 2), spots, { f: 1 }); };
const rock = (p, c) => p.P([[5, 17], [4, 12], [8, 6], [14, 5], [19, 9], [20, 15], [16, 20], [8, 20]], c);
const gemShape = (p, c) => p.P([[7, 8], [11, 4], [16, 8], [16, 14], [11.5, 21], [7, 14]], c);
const star = (p) => { p.D(18, 4, '#ffffff'); p.D(17, 4, '#fff2b0'); p.D(19, 4, '#fff2b0'); p.D(18, 3, '#fff2b0'); p.D(18, 5, '#fff2b0'); };

// ---- every item's picture ----------------------------------------------------------------------------------------------
const ART = {
  // medical
  medkit: (p) => { p.R(3, 7, 20, 20, '#d83a3a', { r: 2 }).R(9, 4, 14, 6, '#8a2424').ink(); p.R(10, 10, 13, 17, '#ffffff', { f: 1 }).R(8, 12, 15, 15, '#ffffff', { f: 1 }); },
  revivekit: (p) => { p.R(3, 7, 20, 20, '#3a8a5a', { r: 2 }).R(9, 4, 14, 6, '#24583a').ink(); p.P([[11.5, 17], [7, 12], [9, 10], [11.5, 12], [14, 10], [16, 12]], '#ffffff', { f: 1 }); },
  bandage: (p) => { p.P([[10, 7], [21, 10], [21, 15], [12, 14]], '#f6eedf').E(9, 13.5, 6.5, 6.5, '#f0e6d4').ink(); p.E(9, 13.5, 2, 2, '#c8b89c', { f: 1 }).L(5, 11, 8, 9, '#fffaf0').R(17, 11, 19, 13, '#d83a3a', { f: 1 }); },
  // drinks
  coffee: (p) => { cup(p, '#f2ead8', '#3a2a22', '#8a5a3a'); p.ink(); p.D(11, 2, '#c8ccd4').D(12, 3, '#c8ccd4').D(11, 4, '#c8ccd4'); },
  energy: (p) => { p.R(8, 4, 15, 21, '#2a5ad0', { r: 1 }).R(8, 4, 15, 5, '#c8ccd8', { f: 1 }).ink(); p.P([[12, 8], [9, 13], [11, 13], [10, 18], [14, 12], [12, 12]], '#ffd84a', { f: 1 }); },
  cocktail: (p) => { p.P([[5, 5], [18, 5], [12, 12], [11, 12]], '#e85a9a').R(11, 12, 12, 19, GLASS, { f: 1 }).R(8, 20, 15, 21, GLASS).E(17, 5, 2.2, 2.2, '#8ad048').ink(); },
  lemonade: (p) => { cup(p, '#f6e27a', null, null); p.R(7, 8, 16, 9, '#ffffff', { f: 1 }).L(14, 2, 12, 9, '#e85a5a').E(10, 14, 2, 2, '#f8f0a8', { f: 1 }).ink(); },
  cider: (p) => { bottle(p, '#b8641e', '#f2e2b8'); p.ink(); p.E(11.5, 15, 1.5, 1.5, '#d83a3a', { f: 1 }); },
  beer: (p) => { p.R(6, 8, 15, 21, '#e8a82a', { r: 1 }).R(6, 6, 15, 9, '#fbf6e6', { r: 1 }).R(16, 11, 18, 12, '#d8d0b8', { f: 1 }).R(18, 12, 19, 16, '#d8d0b8', { f: 1 }).R(16, 16, 18, 17, '#d8d0b8', { f: 1 }).ink(); },
  whiskey: (p) => { p.R(7, 9, 16, 21, '#a85a1e', { r: 1 }).R(10, 4, 13, 9, '#a85a1e').R(10, 2, 13, 4, '#2a2420').R(8, 13, 15, 17, '#f2e2b8', { f: 1 }).ink(); },
  redwine: (p) => { bottle(p, '#3a1a2a', '#f2e6d0', '#8a1a2a'); p.ink(); p.E(11.5, 15, 1.4, 1.4, '#8a1a3a', { f: 1 }); },
  whitewine: (p) => { bottle(p, '#b8c86a', '#f6f0dc', '#d8c88a'); p.ink(); p.E(11.5, 15, 1.4, 1.4, '#c8b85a', { f: 1 }); },
  // food
  apple: (p) => { p.E(11.5, 13.5, 7, 7, '#d83030').R(11, 4, 12, 7, '#6a4a2a', { f: 1 }).E(15, 5.5, 3, 1.6, '#4aa83a').ink(); p.D(8, 10, '#ffd0c0').D(9, 9, '#ffd0c0'); },
  orange: (p) => { p.E(11.5, 13, 7.5, 7.5, '#f08a1e').E(14, 5.5, 3, 1.6, '#4aa83a').ink(); p.D(8, 10, '#ffd8a0').D(11, 6, '#6a4a2a'); },
  grapes: (p) => { for (const [x, y] of [[8, 9], [12, 9], [16, 9], [10, 12.5], [14, 12.5], [8, 15], [12, 16], [10, 19]]) p.E(x, y, 2.4, 2.4, '#7a3aa8'); p.R(11, 3, 12, 6, '#6a4a2a', { f: 1 }).E(15.5, 5, 3.2, 1.8, '#4aa83a').ink(); },
  hotdog: (p) => { p.P([[3, 14], [6, 9], [18, 7], [21, 10], [19, 16], [6, 19]], '#e8b46a').P([[4, 12], [7, 9.5], [18, 7.5], [20, 9.5], [18, 12], [7, 14.5]], '#c8502a').ink(); p.L(7, 11.5, 10, 10.5, '#ffd84a').L(11, 10.5, 14, 9.5, '#ffd84a').L(15, 9.5, 17, 9, '#ffd84a'); },
  bread: (p) => { p.P([[3, 15], [5, 10], [11, 7], [18, 7], [21, 11], [20, 16], [14, 19], [6, 19]], '#d89a4a').ink(); p.L(8, 10, 9, 13, '#f2cc8a').L(12, 9, 13, 12, '#f2cc8a').L(16, 9, 17, 12, '#f2cc8a'); },
  honey: (p) => { p.R(6, 9, 17, 21, '#e8a01e', { r: 2 }).R(7, 5, 16, 8, '#e8d8a8', { r: 1 }).R(8, 13, 15, 17, '#f6ecc8', { f: 1 }).ink(); p.E(11.5, 15, 1.6, 1.6, '#8a5ab8', { f: 1 }); },
  popcorn: (p) => { for (const [x, y] of [[8, 7], [12, 5.5], [16, 7], [10, 9], [14, 9]]) p.E(x, y, 2.6, 2.4, '#fbf2c8'); p.P([[6, 10], [17, 10], [15.5, 21], [7.5, 21]], '#f2f0ea').ink(); for (const x of [8, 12, 15]) p.L(x, 11, x + (x < 12 ? 0.6 : x > 12 ? -0.6 : 0), 20, '#d83a3a'); },
  homeMeal: (p) => { plate(p); p.E(8.5, 14.5, 3.4, 2.4, '#b8602a').E(14.5, 14, 3, 2.2, '#5aa83a').E(12, 17, 2.6, 1.6, '#f2d86a').ink(); },
  // loot
  purse: (p) => { p.R(4, 10, 19, 20, '#b8456a', { r: 2 }).ink(); p.L(8, 9, 8, 6, '#6a2440').L(8, 6, 15, 6, '#6a2440').L(15, 6, 15, 9, '#6a2440').R(10, 13, 13, 15, '#f2c84a', { f: 1 }); },
  wallet: (p) => { p.R(3, 8, 20, 19, '#7a4a2a', { r: 1 }).R(3, 8, 20, 10, '#5a3620', { f: 1 }).R(15, 12, 20, 15, '#9a6a3a', { f: 1 }).ink(); p.D(18, 13, '#f2c84a').R(6, 6, 13, 7, '#7ac86a', { f: 1 }); },
  bonds: (p) => { p.R(4, 5, 19, 20, '#f2ead0', { r: 1 }).ink(); p.R(6, 7, 17, 8, '#3a7a4a', { f: 1 }).L(7, 11, 16, 11, '#a8a088').L(7, 13, 16, 13, '#a8a088').L(7, 15, 13, 15, '#a8a088').E(15.5, 17, 2, 2, '#d83a3a', { f: 1 }); },
  jewelry: (p) => { gemShape(p, '#4ac8e8'); p.ink(); p.L(8, 8, 11, 5, '#e8fbff').L(11, 9, 15, 9, '#b8f0fb').D(9, 11, '#ffffff'); star(p); },
  scrap: (p) => { p.E(9, 15, 5.5, 5.5, '#8a8e98').E(9, 15, 2, 2, '#4a4e58', { f: 1 }).R(13, 5, 20, 9, '#a8785a', { r: 1 }).L(12, 20, 20, 12, '#6a6e78', 2).ink(); },
  filmTicket: (p) => { p.P([[3, 9], [21, 6], [21, 15], [3, 18]], '#e8c84a').ink(); p.L(8, 9, 8, 16, '#a8862a').D(13, 11, '#a8862a').D(16, 10, '#a8862a').D(13, 14, '#a8862a').D(16, 13, '#a8862a'); },
  // tools and gear
  flashlight: (p) => { p.R(3, 10, 13, 15, '#4a4e5c', { r: 1 }).P([[13, 9], [18, 6], [18, 19], [13, 16]], '#6a6e7c').R(18, 6, 19, 19, '#ffe89a', { f: 1 }).ink(); p.R(6, 11, 8, 12, '#d83a3a', { f: 1 }).D(21, 8, '#fff6c8').D(22, 12, '#fff6c8').D(21, 17, '#fff6c8'); },
  skateboard: (p) => { p.P([[1, 10], [4, 12], [19, 12], [22, 10], [22, 12], [19, 14], [4, 14], [1, 12]], '#d8502a').E(6, 17, 2.2, 2.2, '#f2ead0').E(17, 17, 2.2, 2.2, '#f2ead0').ink(); p.L(5, 13, 18, 13, '#f2c84a').D(6, 17, '#8a8e98').D(17, 17, '#8a8e98'); },
  surfboard: (p) => { p.P([[5, 21], [3, 15], [9, 6], [17, 2], [20, 4], [18, 12], [11, 19]], '#f2f0e4').ink(); p.L(6, 19, 18, 4, '#2a9ac8').L(8, 20, 20, 6, '#f08a3a'); },
  rollerblades: (p) => { p.P([[6, 2], [12, 2], [12, 9], [19, 12], [19, 16], [6, 16]], '#f2f0ea').R(6, 2, 12, 4, '#d83a6a', { f: 1 }).R(5, 16, 20, 17, '#3a3e4a', { f: 1 }).E(7.5, 19.5, 2, 2, '#e8a82a').E(12.5, 19.5, 2, 2, '#e8a82a').E(17.5, 19.5, 2, 2, '#e8a82a').ink(); p.L(8, 7, 11, 7, '#d83a6a').L(8, 10, 11, 10, '#d83a6a'); },
  parachute: (p) => { p.P([[2, 11], [5, 5], [11.5, 3], [18, 5], [21, 11]], '#e8483a').P([[8, 11], [9, 4], [14, 4], [15, 11]], '#f6f2ea', { f: 1 }).ink(); p.L(3, 12, 11, 20, '#c8ccd4').L(20, 12, 12, 20, '#c8ccd4').L(9, 12, 11, 20, '#c8ccd4').L(14, 12, 12, 20, '#c8ccd4').R(10, 20, 13, 22, '#5a4a3a', { f: 1 }); },
  hatchet: (p) => { p.S(6, 22, 13, 8, '#9a6a3a', 3).P([[11, 6], [14, 4], [19, 5], [21, 10], [19, 14], [16, 11], [13, 10]], '#aab0c0').P([[10, 7], [12, 5], [14, 10], [12, 11]], '#6a6e7c', { f: 1 }).ink(); p.L2(19, 6, 21, 10, [246, 248, 252]); p.L2(21, 10, 19, 13, [246, 248, 252]); },
  // game
  venison: (p) => { cut(p, '#b83a3a'); p.ink(); },
  deerHide: (p) => { hide(p, '#b8804a', '#d8a870'); p.ink(); },
  // forage and finds
  redcap: (p) => { shroom(p, '#d8322a', '#f6f0e2', '#ffffff'); p.ink(); p.D(5, 6, '#f08a7a').D(6, 5, '#f08a7a'); },
  geode: (p) => { rock(p, '#8a8478'); p.ink(); p.P([[7, 12], [11, 7], [17, 9], [18, 15], [12, 18], [8, 16]], '#6a4ab8', { f: 1 }).P([[9, 12], [12, 9], [16, 11], [16, 14], [12, 16], [10, 15]], '#b89af0', { f: 1 }).P([[11, 12], [13, 10], [15, 12], [13, 14]], '#ecdcff', { f: 1 }).D(13, 11, '#ffffff').D(10, 13, '#ffffff').D(15, 14, '#ffffff'); star(p); p.D(4, 5, '#fff2b0').D(3, 5, '#e8d8ff').D(5, 5, '#e8d8ff').D(4, 4, '#e8d8ff').D(4, 6, '#e8d8ff').D(20, 19, '#ffffff'); },
  nugget: (p) => { p.P([[5, 15], [7, 9], [12, 6], [18, 8], [20, 14], [16, 19], [9, 20]], '#e8b82a').ink(); p.D(9, 10, '#fff2a8').D(10, 9, '#fff2a8').D(15, 12, '#fff2a8'); star(p); },
};

// ---- more parts: a drumstick, a feather, a tool's handle, an ore, a rod -------------------------------------------------
const drum = (p, c, bone = '#f6efdc') => { p.L(14, 14, 19, 19, bone, 2).E(20, 18, 1.6, 1.6, bone, { f: 1 }).E(18, 20, 1.6, 1.6, bone, { f: 1 }).E(9.5, 9.5, 7, 6.5, c).P([[11, 13], [15, 11], [16, 15], [13, 16]], c); };
const bowl = (p, soup) => { p.P([[3, 11], [20, 11], [17, 20], [6, 20]], '#e8e2d6').E(11.5, 11, 8.5, 2.6, soup, { f: 1 }); };
const feather = (p, c, tip, bar) => { p.P([[8, 18], [6, 14], [8, 9], [12, 5], [17, 2], [20, 2], [21, 5], [18, 10], [14, 15], [10, 18]], c); if (tip) p.P([[13, 4], [17, 2], [20, 2], [21, 5], [19, 8]], tip, { f: 1 }); p.cut(6, 14).cut(7, 13).cut(8, 13).cut(18, 10).cut(17, 10).cut(17, 11).cut(11, 5).cut(12, 6).cut(14, 15).cut(13, 15); p.ink(); p.L2(3, 22, 19, 4, [250, 246, 232]); const d = dusk(hex(c), 0.3); for (const [x, y] of [[9, 12], [11, 10], [13, 8], [15, 6]]) { p.L2(x, y, x - 2, y, d); p.L2(x + 1, y + 1, x + 1, y + 3, d); } if (bar) { p.L(9, 15, 12, 16, bar).L(15, 9, 17, 9, bar); } };
const handle = (p, x0, y0, x1, y1, c = '#9a6a3a') => p.S(x0, y0, x1, y1, c, 3);
const ore = (p, base, fleck, hi) => { rock(p, base); p.ink(); for (const [x, y] of [[8, 10], [13, 8], [16, 12], [10, 15], [14, 16], [7, 13]]) p.R(x, y, x + 1, y + 1, fleck, { f: 1 }); if (hi) for (const [x, y] of [[8, 10], [13, 8], [14, 16]]) p.D(x, y, hi); };
const pick = (p, head) => { p.S(6, 22, 13, 6, '#9a6a3a', 3).P([[2, 11], [5, 6], [10, 3], [16, 3], [20, 6], [22, 12], [20, 11], [18, 8], [15, 6], [11, 6], [7, 8], [4, 12]], head).R(11, 3, 15, 6, '#5a5e6c', { f: 1 }).ink(); const h = lite(hex(head), 0.5); p.L2(5, 7, 10, 4, h); p.L2(16, 4, 20, 7, h); };
const rod = (p, c, reel, grip = '#3a2a22') => { p.L(3, 21, 20, 3, c).L(3, 21, 8, 16, grip, 2).E(9, 17, 2.2, 2.2, reel).ink(); p.L(20, 3, 21, 9, '#d8dce6'); p.D(21, 10, '#c8ccd4'); };
const tub = (p, c, lidC) => { p.R(5, 10, 18, 20, c, { r: 1 }).R(4, 8, 19, 10, lidC, { r: 1 }); };
const produce = { tomato: (p) => { p.E(11.5, 13.5, 7.5, 6.5, '#e0382a').P([[8, 7], [11.5, 9], [15, 7], [13, 6], [11.5, 4], [10, 6]], '#4a9a3a', { f: 1 }); },
  carrot: (p) => { p.P([[8, 8], [15, 8], [12, 22], [11, 22]], '#f08a2a').P([[9, 8], [8, 3], [11, 6], [12, 2], [13, 6], [16, 3], [14, 8]], '#4aa83a', { f: 1 }); },
  lettuce: (p) => { p.E(11.5, 13, 8.5, 7.5, '#6ac04a').E(11.5, 13.5, 5, 4.5, '#a8e07a').E(12, 14, 2, 2, '#d0f0a8', { f: 1 }); },
  pumpkin: (p) => { p.E(7.5, 14, 4.5, 6, '#e8862a').E(15.5, 14, 4.5, 6, '#e8862a').E(11.5, 14, 4.5, 6.5, '#f09a3a').R(11, 5, 12, 8, '#5a7a2a', { f: 1 }); },
  corn: (p) => { p.P([[9, 4], [14, 4], [16, 12], [14, 21], [9, 21], [7, 12]], '#f2cc3a').P([[4, 12], [8, 13], [10, 22], [6, 20]], '#5aa83a').P([[19, 12], [15, 13], [13, 22], [17, 20]], '#5aa83a'); },
  strawberry: (p) => { p.P([[5, 8], [18, 8], [16, 16], [11.5, 21], [7, 16]], '#e0303a').P([[7, 8], [9, 5], [11.5, 7], [14, 5], [16, 8]], '#4aa83a', { f: 1 }); },
  sunflower: (p) => { for (let a = 0; a < 8; a++) p.E(11.5 + Math.cos(a * Math.PI / 4) * 6.4, 10 + Math.sin(a * Math.PI / 4) * 6.4, 2.6, 2.6, '#f2c82a'); p.E(11.5, 10, 4.2, 4.2, '#6a4222').R(11, 16, 12, 22, '#4a9a3a', { f: 1 }); } };
const CROP = { tomato: '#e0382a', carrot: '#f08a2a', lettuce: '#6ac04a', pumpkin: '#e8862a', corn: '#f2cc3a', strawberry: '#e0303a', sunflower: '#f2c82a' };
const SEEDS = { tomato: (p) => { produce.tomato(p); p.ink(); p.D(8, 11, '#ffc8b8'); }, carrot: (p) => { produce.carrot(p); p.ink(); p.L(10, 12, 13, 12, '#c86a1a').L(11, 16, 12, 16, '#c86a1a'); },
  lettuce: (p) => { produce.lettuce(p); p.ink(); }, pumpkin: (p) => { produce.pumpkin(p); p.ink(); p.D(9, 10, '#ffd8a0'); },
  corn: (p) => { produce.corn(p); p.ink(); for (let y = 6; y < 20; y += 2) for (let x = 9; x < 15; x += 2) p.D(x + (y % 4 ? 0 : 1), y, '#c89a1a'); },
  strawberry: (p) => { produce.strawberry(p); p.ink(); for (const [x, y] of [[9, 11], [13, 11], [11, 14], [14, 14], [9, 15], [11, 18]]) p.D(x, y, '#ffe8a0'); },
  sunflower: (p) => { produce.sunflower(p); p.ink(); p.D(10, 9, '#3a2412').D(13, 11, '#3a2412'); } };
for (const k of Object.keys(CROP)) {
  ART[k] = SEEDS[k];
  ART['seed_' + k] = (p) => { packet(p, CROP[k], k === 'carrot' || k === 'tomato' || k === 'strawberry' || k === 'sunflower' ? '#4aa83a' : null); p.ink(); };
  ART['prize_' + k] = (p) => { SEEDS[k](p); p.E(18, 18, 3.4, 3.4, '#2a6ad0', { f: 1 }).E(18, 18, 1.6, 1.6, '#f2c82a', { f: 1 }).P([[16, 20], [17, 23], [18, 21], [19, 23], [20, 20]], '#2a6ad0', { f: 1 }); };   // (the fair's blue rosette)
}
// the hides and pelts by the animal's coat (client/art2/animals.js), the raw meats by their colour
const COAT = { deer: '#b07a44', elk: '#b08a5e', moose: '#4e382a', goat: '#ece6da', boar: '#5a4636', bear: '#3a343c', grizzly: '#80582e', cougar: '#c8905a', bobcat: '#b0906a', coyote: '#b09264', wolf: '#948e88', redFox: '#d86c2a', greyFox: '#8e8e94', raccoon: '#827e80', beaver: '#724c34', otter: '#624632', rabbit: '#a07c56', squirrel: '#8e8e90' };
const BELLY = { deer: '#e0b888', elk: '#d8c098', goat: '#ffffff', cougar: '#f0dcc0', bobcat: '#e8dcc4', coyote: '#e8dcc0', wolf: '#dcd6cc', redFox: '#f6f0e4', greyFox: '#e8e4dc', rabbit: '#f0e4d4', squirrel: '#ece8e0', otter: '#8a6a52' };
const TIP = { redFox: '#f6f2ea', greyFox: '#2a282e', raccoon: '#2a282c', wolf: '#5e5a56', coyote: '#5a4a3a' };
for (const k of ['deer', 'elk', 'moose', 'goat', 'boar']) ART[k + 'Hide'] = (p) => { hide(p, COAT[k], BELLY[k] || lhex(COAT[k])); p.ink(); };
for (const k of ['bear', 'grizzly', 'cougar', 'bobcat', 'coyote', 'wolf', 'redFox', 'greyFox', 'raccoon', 'beaver', 'otter', 'rabbit', 'squirrel']) ART[k + 'Pelt'] = (p) => { pelt(p, COAT[k], BELLY[k], TIP[k]); p.ink(); if (k === 'raccoon') p.L(10, 17, 13, 17, '#2a282c'); if (k === 'bobcat') for (const [x, y] of [[9, 9], [14, 10], [11, 12]]) p.D(x, y, '#5a4632'); };
function lhex(h) { const c = lite(hex(h), 0.3); return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''); }
const MEAT = { venison: '#b83a3a', elkMeat: '#a8343c', mooseMeat: '#8e2c36', boarMeat: '#d86a6e', bearMeat: '#802a2c', grizzlyMeat: '#702628', cougarMeat: '#c85a4c', goatMeat: '#c44a4a', gameMeat: '#b04444', rabbitMeat: '#e08e8a' };
for (const [k, c] of Object.entries(MEAT)) ART[k] = (p) => { cut(p, c); p.ink(); };
for (const [k, c] of [['birdMeat', '#f0c4a4'], ['turkeyMeat', '#eab894'], ['gooseMeat', '#e0a888']]) ART[k] = (p) => { drum(p, c); p.ink(); };
// cooked: a steak with its grill marks, a roast, chops, a stew, a roast bird - on a plate or in a bowl
const steak = (c) => (p) => { plate(p); p.E(11.5, 14.5, 6, 3.6, c).ink(); p.L(8, 13, 10, 16, '#3a2218').L(11, 12.5, 13, 16, '#3a2218').L(14, 13, 15.5, 15.5, '#3a2218'); };
const roast = (c) => (p) => { plate(p); p.E(11.5, 12.5, 6.5, 5, c).ink(); p.L(8, 10, 10, 9, '#f2c88a').E(6, 17, 1.4, 1.2, '#5aa83a', { f: 1 }).E(17, 17, 1.4, 1.2, '#f08a2a', { f: 1 }); };
const stew = (c) => (p) => { bowl(p, c); p.ink(); p.D(9, 11, '#f08a2a').D(13, 10, '#e8d8a0').D(15, 12, '#5aa83a').D(11, 12, '#7a3a22'); p.D(10, 5, '#c8ccd4').D(11, 6, '#c8ccd4').D(13, 4, '#c8ccd4').D(14, 5, '#c8ccd4'); };
Object.assign(ART, { venisonSteak: steak('#8a4a2a'), elkSteak: steak('#7e4226'), gameSteak: steak('#84462a'), mooseRoast: roast('#7a3e24'), rabbitRoast: roast('#b8763a'),
  boarChops: (p) => { plate(p); p.E(8.5, 14, 3.6, 3, '#c88a5a').E(15, 15, 3.6, 3, '#c88a5a').ink(); p.L(5, 11, 7, 12, '#f2ead8').L(12, 12, 13.5, 13, '#f2ead8'); },
  bearStew: stew('#6a3a22'), goatStew: stew('#a8662e'),
  roastBird: (p) => { plate(p); drum(p, '#b8702a'); p.ink(); p.L(7, 8, 10, 7, '#f2c88a'); }, roastTurkey: (p) => { plate(p); p.E(11.5, 12, 7, 5.5, '#b8702a').E(5.5, 14.5, 2.4, 1.8, '#a86222').E(17.5, 14.5, 2.4, 1.8, '#a86222').ink(); p.L(8, 9, 11, 8, '#f2c88a'); },
  roastGoose: (p) => { plate(p); p.E(11.5, 12.5, 7.5, 5, '#a8601e').E(17.5, 14.5, 2.4, 1.8, '#985618').ink(); p.L(8, 10, 11, 9, '#f2c88a'); },
  // trophies
  antlers: (p) => { for (const s of [-1, 1]) { p.L(11.5 + s, 20, 11.5 + s * 6, 8, '#d8c49a', 2).L(11.5 + s * 4, 13, 11.5 + s * 8, 11, '#d8c49a').L(11.5 + s * 5, 10, 11.5 + s * 3, 4, '#d8c49a').L(11.5 + s * 6, 8, 11.5 + s * 9, 4, '#d8c49a'); } p.R(9, 19, 14, 21, '#8a6a4a').ink(); },
  elkAntlers: (p) => { for (const s of [-1, 1]) { p.L(11.5 + s, 21, 11.5 + s * 5, 10, '#d0b88a', 2).L(11.5 + s * 5, 10, 11.5 + s * 8, 2, '#d0b88a', 2); for (const [a, b] of [[16, 15], [12, 10], [8, 6]]) p.L(11.5 + s * 4, a, 11.5 + s * 9, b, '#d0b88a'); } p.R(9, 20, 14, 22, '#7a5a3a').ink(); },
  mooseAntlers: (p) => { for (const s of [-1, 1]) { p.P([[11.5 + s * 2, 15], [11.5 + s * 4, 8], [11.5 + s * 10, 5], [11.5 + s * 10.5, 12], [11.5 + s * 6, 16]], '#cdb88e'); for (const [x, y] of [[4.5, 5], [7, 3.5], [9.5, 3]]) p.L(11.5 + s * x, y + 3, 11.5 + s * x, y, '#cdb88e', 2); } p.R(9, 15, 14, 19, '#5a4030').ink(); },
  goatHorns: (p) => { for (const s of [-1, 1]) p.P([[11.5 + s * 2, 20], [11.5 + s * 3, 12], [11.5 + s * 7, 5], [11.5 + s * 8.5, 6], [11.5 + s * 6, 14], [11.5 + s * 5, 20]], '#3a3438'); p.R(8, 19, 15, 21, '#ece6da').ink(); },
  boarTusks: (p) => { for (const s of [-1, 1]) p.P([[11.5 + s * 2, 20], [11.5 + s * 8, 16], [11.5 + s * 9, 6], [11.5 + s * 7.5, 6], [11.5 + s * 5.5, 14], [11.5 + s * 1.5, 17]], '#f2ead0'); p.ink(); },
  bearClaws: (p) => { for (const x of [5, 10, 15]) p.P([[x, 6], [x + 4, 6], [x + 4.5, 12], [x + 1, 20], [x + 1.5, 12]], '#3a3034'); p.R(4, 4, 20, 6, '#6a4a3a').ink(); },
  cougarFangs: (p) => { for (const x of [5, 13]) p.P([[x, 5], [x + 6, 5], [x + 4, 13], [x + 3, 21], [x + 1.5, 13]], '#f6f0de'); p.R(4, 3, 20, 5, '#c85a5a').ink(); },
  castoreum: (p) => { p.R(7, 9, 16, 21, '#8a5a2a', { r: 2 }).R(9, 5, 14, 8, '#6a4420').R(8, 3, 15, 5, '#c8a86a', { r: 1 }).ink(); p.R(9, 13, 14, 17, '#f2e2b8', { f: 1 }).D(11, 15, '#6a4a2a').D(12, 15, '#6a4a2a'); },
  quailFeathers: (p) => feather(p, '#6a7890', '#3e3a46', '#d8c49a'), pheasantFeathers: (p) => feather(p, '#b8642a', '#2a6a4a', '#3a2418'), turkeyFeathers: (p) => feather(p, '#4a3a30', '#d8c098', '#2a2018'),
  duckFeathers: (p) => feather(p, '#a8a8a4', '#2a6a3e', '#3a5ab0'), gooseFeathers: (p) => feather(p, '#8a7a68', '#1e1c20', null), eagleFeather: (p) => { feather(p, '#4a3828', '#f6f4ee', null); star(p); },
  antlerShed: (p) => { p.L(5, 20, 13, 9, '#d8c49a', 2).L(13, 9, 19, 4, '#d8c49a', 2).L(9, 15, 15, 14, '#d8c49a').L(12, 10, 10, 4, '#d8c49a').L(16, 7, 20, 9, '#d8c49a').ink(); },
  // crafted goods
  camoCloak: (p) => { p.P([[8, 3], [15, 3], [20, 20], [3, 20]], '#5a7a3a').ink(); for (const [x, y] of [[8, 8], [13, 7], [10, 12], [15, 13], [7, 16], [12, 17], [17, 17]]) p.R(x, y, x + 1, y + 1, '#3a5226', { f: 1 }); for (const [x, y] of [[11, 9], [8, 13], [14, 15]]) p.D(x, y, '#8aa85a'); },
  coverScent: (p) => { p.R(8, 10, 15, 21, '#5a8a5a', { r: 1 }).R(10, 6, 13, 9, '#3a3a40').R(13, 5, 16, 6, '#3a3a40', { f: 1 }).ink(); p.R(9, 14, 14, 17, '#e8f0d8', { f: 1 }).D(18, 4, '#c8e0c8').D(20, 6, '#c8e0c8').D(19, 8, '#c8e0c8'); },
  leatherGloves: (p) => { p.P([[5, 21], [5, 11], [7, 5], [9, 5], [9, 10], [11, 4], [13, 4], [13, 10], [15, 5], [17, 6], [16, 12], [19, 10], [20, 12], [16, 17], [15, 21]], '#9a6234').R(5, 18, 15, 21, '#6a4020', { f: 1 }).ink(); },
  moccasins: (p) => { p.P([[2, 13], [8, 9], [16, 10], [21, 14], [21, 17], [3, 18]], '#b8804a').E(8, 12.5, 3.4, 2, '#5a3a20', { f: 1 }).ink(); p.L(12, 12, 17, 13, '#e8d0a0').D(14, 14, '#d83a3a').D(16, 15, '#3a8ad0'); },
  furHat: (p) => { p.E(11.5, 11, 8.5, 7, '#7a5634').R(3, 13, 20, 18, '#9a744a', { r: 1 }).ink(); p.P([[17, 15], [21, 19], [19, 22], [16, 18]], '#5a3e26', { f: 1 }); for (const [x, y] of [[6, 15], [10, 16], [14, 15], [8, 8], [13, 7]]) p.D(x, y, '#c8a070'); },
  buckskinJacket: (p) => { p.P([[7, 3], [16, 3], [21, 8], [18, 12], [17, 10], [17, 21], [6, 21], [6, 10], [5, 12], [2, 8]], '#c8985a').ink(); p.L(11.5, 4, 11.5, 21, '#8a6230'); for (const x of [3, 5, 18, 20]) p.L(x, 12, x, 15, '#e8c890'); p.L(9, 4, 11, 7, '#8a6230').L(14, 4, 12, 7, '#8a6230'); },
  bearCoat: (p) => { p.P([[7, 3], [16, 3], [21, 8], [18, 13], [17, 11], [18, 22], [5, 22], [6, 11], [5, 13], [2, 8]], '#3a3238').P([[8, 3], [15, 3], [13, 8], [10, 8]], '#6a5a52', { f: 1 }).ink(); p.L(11.5, 8, 11.5, 22, '#1e1a20'); },
  bearRug: (p) => { p.P([[11.5, 2], [15, 4], [15, 8], [21, 7], [20, 11], [17, 13], [21, 19], [17, 20], [14, 17], [9, 17], [6, 20], [2, 19], [6, 13], [3, 11], [2, 7], [8, 8], [8, 4]], '#80582e').E(11.5, 5, 2.6, 2.4, '#96693a').ink(); p.D(10, 4, '#1e1410').D(13, 4, '#1e1410').D(11, 6, '#1e1410').D(12, 6, '#1e1410'); },
  // lights, axes, picks and the rest of the tools
  headlamp: (p) => { p.R(2, 11, 21, 15, '#d8502a', { r: 1 }).R(8, 9, 15, 17, '#3a3e4a', { r: 1 }).E(11.5, 13, 2.6, 2.6, '#ffe89a', { f: 1 }).ink(); p.D(11, 12, '#ffffff'); },
  hardhat: (p) => { p.P([[4, 16], [5, 9], [9, 5], [14, 5], [18, 9], [19, 16]], '#f2c42a').R(2, 16, 21, 18, '#d8a81a', { r: 1 }).R(10, 4, 13, 12, '#fbe078', { f: 1 }).ink(); },
  lantern: (p) => { p.R(8, 8, 15, 18, '#ffe08a', { r: 1 }).R(7, 5, 16, 7, '#3a6a4a', { r: 1 }).R(7, 19, 16, 21, '#3a6a4a', { r: 1 }).ink(); p.L(9, 4, 11.5, 1, '#8a8e98').L(11.5, 1, 14, 4, '#8a8e98').L(8, 8, 8, 18, '#3a6a4a').L(15, 8, 15, 18, '#3a6a4a').E(11.5, 14, 1.4, 2.4, '#ff9a2a', { f: 1 }).D(11, 13, '#fff6c8'); },
  flare: (p) => { p.L(5, 20, 15, 9, '#d8302a', 3).ink(); p.L(6, 20, 8, 18, '#f6f2ea', 2); p.E(17, 6.5, 2.6, 2.6, '#ffb03a', { f: 1 }).D(17, 6, '#fff6c8').D(20, 3, '#ffd86a').D(21, 7, '#ffd86a').D(16, 2, '#ffd86a'); },
  glowstick: (p) => { p.L(5, 20, 18, 6, '#7af06a', 3).ink(); p.L(6, 19, 17, 7, '#d8ffc8'); p.D(20, 4, '#b8ffa8').D(3, 22, '#3a8a3a'); },
  batteries: (p) => { for (const x of [5, 13]) p.R(x, 6, x + 5, 20, '#3a3e4a', { r: 1 }).R(x, 6, x + 5, 10, '#e8a82a', { f: 1 }).R(x + 2, 4, x + 3, 5, '#c8ccd4', { f: 1 }); p.ink(); p.D(7, 15, '#ffffff').D(8, 15, '#ffffff').D(15, 15, '#ffffff').D(16, 15, '#ffffff'); },
  axe: (p) => { p.S(4, 22, 14, 6, '#9a6a3a', 3).P([[12, 4], [16, 1], [21, 2], [23, 8], [22, 14], [18, 12], [15, 10]], '#aab0c0').P([[10, 6], [13, 3], [16, 10], [13, 10]], '#6a6e7c', { f: 1 }).ink(); p.L2(21, 3, 23, 8, [246, 248, 252]); p.L2(23, 8, 22, 13, [246, 248, 252]); p.D(3, 22, '#6a4426'); },
  fellaxe: (p) => { p.S(3, 23, 13, 6, '#7a4a26', 3).P([[11, 4], [15, 0], [21, 1], [23, 8], [22, 15], [17, 13], [14, 10]], '#9aa0b0').P([[11, 4], [15, 0], [18, 5], [15, 9]], '#c8303a', { f: 1 }).P([[9, 6], [12, 3], [15, 10], [12, 10]], '#5a5e6c', { f: 1 }).ink(); p.L2(21, 2, 23, 8, [246, 248, 252]); p.L2(23, 8, 22, 14, [246, 248, 252]); },
  chainsaw: (p) => { p.R(3, 9, 12, 18, '#e86a1e', { r: 1 }).P([[12, 11], [22, 12], [22, 15], [12, 16]], '#a8acb8').R(4, 5, 10, 8, '#3a3e4a', { r: 1 }).ink(); for (let x = 13; x < 22; x += 2) p.D(x, 11, '#3a3e4a').D(x + 1, 16, '#3a3e4a'); p.R(5, 12, 8, 15, '#3a3e4a', { f: 1 }); },
  sawfuel: (p) => { p.R(5, 7, 18, 21, '#d8302a', { r: 2 }).R(7, 3, 11, 6, '#d8302a').R(14, 4, 17, 6, '#f2c42a').ink(); p.L(8, 10, 15, 18, '#8a1a1a').L(15, 10, 8, 18, '#8a1a1a'); },
  pickStone: (p) => pick(p, '#8a8478'), pickIron: (p) => pick(p, '#a8acb8'), pickSteel: (p) => pick(p, '#c8d4e4'), pickDiamond: (p) => { pick(p, '#7ae0f0'); star(p); },
  drill: (p) => { p.R(4, 8, 14, 15, '#e8a01e', { r: 1 }).R(8, 15, 12, 21, '#3a3e4a', { r: 1 }).P([[14, 10], [22, 11.5], [14, 13]], '#c8ccd8').ink(); p.L(15, 11, 20, 11.5, '#ff6a2a').R(6, 10, 9, 12, '#3a3e4a', { f: 1 }); },
  trowel: (p) => { handle(p, 4, 21, 10, 14, '#7a4a26'); p.P([[9, 13], [13, 9], [21, 3], [17, 12], [12, 16]], '#b8bcc8').ink(); p.L(13, 11, 19, 5, '#f2f4f8'); },
  goldPan: (p) => { p.E(11.5, 13, 10, 6.5, '#6a6e78').E(11.5, 12, 7.5, 4.2, '#3a6a8a', { f: 1 }).ink(); p.D(9, 12, '#ffd84a').D(12, 13, '#ffd84a').D(14, 11, '#ffd84a').D(10, 10, '#b8e0f0'); },
  // ore and stone
  coal: (p) => ore(p, '#3a3a42', '#1e1e24', '#7a7a88'), copperOre: (p) => ore(p, '#8a7a6e', '#d8702a', '#ffb07a'), ironOre: (p) => ore(p, '#7a6e68', '#a8523a', null),
  silverOre: (p) => ore(p, '#7e8088', '#d8dce6', '#ffffff'), goldOre: (p) => ore(p, '#7e7468', '#f2c42a', '#fff2a8'), stone: (p) => { p.R(3, 9, 20, 19, '#a8a49a', { r: 1 }).ink(); p.L(4, 14, 19, 14, '#7a766e').L(11, 10, 11, 13, '#7a766e').L(8, 15, 8, 18, '#7a766e').L(15, 15, 15, 18, '#7a766e'); },
  gem: (p) => { gemShape(p, '#3ac06a'); p.ink(); p.L(8, 8, 11, 5, '#c8ffd8').L(11, 9, 15, 9, '#8ae8a8').D(9, 11, '#ffffff'); },
  diamond: (p) => { p.P([[4, 9], [8, 5], [15, 5], [19, 9], [11.5, 21]], '#b8ecfb').ink(); p.L(4, 9, 19, 9, '#e8fbff').L(8, 5, 10, 9, '#e8fbff').L(15, 5, 13, 9, '#e8fbff').L(10, 9, 11.5, 20, '#7ac8e8'); star(p); },
  quartz: (p) => { p.P([[6, 20], [7, 9], [9, 5], [11, 9], [11, 20]], '#e8ecf6').P([[11, 20], [12, 6], [14.5, 2], [17, 7], [17, 20]], '#f6f8ff').P([[3, 20], [4, 14], [5.5, 12], [7, 15], [7, 20]], '#d0d6e6').ink(); p.L(13, 7, 13, 18, '#c8d0e8'); },
  amethystGeode: (p) => { rock(p, '#7a7468'); p.ink(); p.P([[7, 12], [11, 7], [17, 9], [18, 15], [12, 18], [8, 16]], '#5a1e98', { f: 1 }).P([[9, 12], [12, 9], [16, 11], [16, 14], [12, 16], [10, 15]], '#a05ae0', { f: 1 }).P([[11, 12], [13, 10], [15, 12], [13, 14]], '#e0b8ff', { f: 1 }).D(13, 11, '#ffffff').D(10, 13, '#ffffff').D(15, 14, '#ffffff'); star(p); p.D(4, 5, '#f0c8ff').D(20, 19, '#ffffff'); },
  doubloon: (p) => { p.E(11.5, 12.5, 8, 8, '#e0aa2a').E(11.5, 12.5, 5.5, 5.5, '#f2c84a', { f: 1 }).ink(); p.L(11.5, 8, 11.5, 17, '#a8761a').L(8, 12.5, 15, 12.5, '#a8761a').D(7, 8, '#fff2a8'); },
  goldFlakes: (p) => { p.R(7, 8, 16, 21, GLASS, { r: 2 }).R(9, 4, 14, 7, '#9a6a3a').ink(); p.R(8, 16, 15, 20, '#f2c42a', { f: 1 }).D(10, 14, '#f2c42a').D(13, 13, '#f2c42a').D(9, 10, '#ffffff'); },
  fossilFern: (p) => { rock(p, '#9a9080'); p.ink(); p.L(8, 17, 16, 8, '#4a4238'); for (const [x, y] of [[10, 15], [12, 13], [14, 11]]) { p.L(x, y, x - 2, y - 2, '#4a4238'); p.L(x, y, x + 2, y + 2, '#4a4238'); } },
  ammonite: (p) => { p.E(11.5, 12.5, 8.5, 8, '#c8a878').ink(); p.E(11.5, 12.5, 5.5, 5, '#a88858', { f: 1 }).E(12, 13, 3, 2.6, '#c8a878', { f: 1 }).E(12.5, 13, 1.2, 1, '#8a6a42', { f: 1 }); for (let a = 0; a < 7; a++) p.D(11.5 + Math.cos(a * 0.9) * 7, 12.5 + Math.sin(a * 0.9) * 6.6, '#8a6a42'); },
  arrowhead: (p) => { p.P([[11.5, 2], [18, 13], [14, 14], [14, 20], [9, 20], [9, 14], [5, 13]], '#5a5e6a').ink(); p.L(11.5, 4, 11.5, 13, '#9a9eac').L(8, 12, 11, 7, '#3a3e48'); },
  riverMussels: (p) => { p.E(8.5, 12, 5.5, 4, '#3a3e58').E(15.5, 15, 5.5, 4, '#4a4e6a').ink(); p.L(5, 12, 12, 12, '#7a7ea0').L(12, 15, 19, 15, '#8a8eb0'); },
  riverPearl: (p) => { p.P([[3, 14], [7, 9], [16, 9], [20, 14], [16, 19], [7, 19]], '#4a4e6a').ink(); p.E(11.5, 14, 6, 3.4, '#e8d8e0', { f: 1 }).E(11.5, 13.5, 2.6, 2.6, '#fbf6ff').D(10.5, 12.5, '#ffffff'); star(p); },
  // foraged
  lavender: (p) => { for (const [x, t] of [[7, 5], [11.5, 3], [16, 5]]) { p.L(x, 21, x, t + 5, '#5a8a4a'); p.E(x, t + 3, 1.8, 4, '#9a6ad8'); } p.ink(); p.D(7, 6, '#d0b0ff').D(11, 4, '#d0b0ff').D(16, 6, '#d0b0ff'); },
  goldTrumpet: (p) => { for (const [x, k] of [[14, 1], [6.5, 0.72]]) { const y = 21 - 14 * k; p.P([[x - 6 * k, y], [x - 4 * k, y - 3 * k], [x, y - 2 * k], [x + 4 * k, y - 3 * k], [x + 6 * k, y], [x + 1.6 * k, y + 5 * k], [x + 1.2 * k, 21], [x - 1.2 * k, 21], [x - 1.6 * k, y + 5 * k]], '#f0aa24'); } p.ink(); p.L(10, 8, 13, 13, '#c07c14').L(14, 8, 14, 14, '#c07c14').L(18, 8, 15, 13, '#c07c14').L(9, 6, 12, 5, '#ffd870').L(15, 5, 19, 6, '#ffd870').L(4, 13, 6, 17, '#c07c14').L(8, 13, 7, 17, '#c07c14'); },
  bunCap: (p) => { p.P([[7, 12], [16, 12], [17, 17], [16, 21], [7, 21], [6, 17]], '#ecdcb8').P([[2, 12], [3, 8], [6, 5], [10, 3], [13, 3], [17, 5], [20, 8], [21, 12], [19, 13], [4, 13]], '#9a6230').R(4, 12, 19, 13, '#e8d49a', { f: 1 }).ink(); p.D(6, 7, '#c88a52').D(7, 6, '#c88a52').D(8, 6, '#c88a52').L(9, 16, 9, 19, '#c8b48a').L(13, 15, 13, 19, '#c8b48a'); },
  shelfOyster: (p) => { p.R(16, 1, 22, 22, '#6a4a32').P([[3, 8], [8, 5], [16, 5], [16, 9], [6, 10]], '#d8ceb8').P([[1, 15], [7, 11], [16, 11], [16, 16], [4, 17]], '#e4dcc8').P([[5, 21], [9, 18], [16, 18], [16, 22], [8, 22]], '#cfc4ac').ink(); p.L(6, 9, 15, 8, '#a89c84').L(4, 16, 15, 15, '#a89c84').L(18, 3, 18, 9, '#4a3220').L(20, 12, 20, 19, '#4a3220').L(5, 13, 9, 12, '#fbf6ea'); },
  ghostglass: (p) => { for (const [x, top, r] of [[6.5, 9, 4], [13, 5, 5], [19, 11, 3.2]]) { p.R(Math.round(x - 0.5), top + 2, Math.round(x + 0.5), 21, '#d4eaf6').P([[x - r, top + 3], [x - r * 0.7, top], [x, top - 2], [x + r * 0.7, top], [x + r, top + 3]], '#a8e0f8'); } p.ink(); p.D(11, 5, '#ffffff').D(12, 4, '#ffffff').D(5, 9, '#ffffff').D(18, 11, '#ffffff'); star(p); p.D(2, 4, '#c8f0ff').D(21, 5, '#c8f0ff'); },
  goldStar: (p) => { const pts = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.2 : 10, a = -Math.PI / 2 + i * Math.PI / 5; pts.push([11.5 + Math.cos(a) * r, 15 + Math.sin(a) * r * 0.62]); } p.P(pts, '#d89a1e').E(11.5, 11.5, 5, 5, '#f6cc3a').ink(); p.D(9, 9, '#fff6c0').D(10, 8, '#fff6c0').D(11.5, 6, '#a8721a'); star(p); p.D(3, 6, '#fff2b0').D(20, 20, '#fff2b0'); },
  wildBerries: (p) => { for (const [x, y, c] of [[8, 14, '#3a4ab8'], [14, 13, '#4a3aa8'], [11, 18, '#3a4ab8']]) p.E(x, y, 3.6, 3.6, c); p.L(11.5, 3, 9, 10, '#5a8a4a').L(11.5, 3, 14, 9, '#5a8a4a').E(15, 4.5, 3, 1.6, '#5aa83a').ink(); p.D(7, 13, '#a8b8ff').D(13, 12, '#a8b8ff'); },
  wildHerbs: (p) => { for (const [x, a] of [[8, -2], [11.5, 0], [15, 2]]) { p.L(x, 21, x + a, 6, '#4a8a3a'); for (let y = 8; y < 18; y += 3) p.E(x + a * (21 - y) / 15 + (y % 2 ? 2 : -2), y, 2, 1.3, '#6ab84a'); } p.R(8, 17, 15, 19, '#c8a86a', { f: 1 }).ink(); },
  wildHoneycomb: (p) => { p.P([[5, 8], [11.5, 4], [18, 8], [18, 16], [11.5, 21], [5, 16]], '#f2b02a').ink(); for (const [x, y] of [[9, 9], [14, 9], [11.5, 12.5], [9, 16], [14, 16]]) p.R(x - 1, y - 1, x, y, '#b8761a', { f: 1 }); p.D(16, 18, '#ffd86a').D(17, 20, '#ffd86a'); },
  blackTruffle: (p) => { p.E(11.5, 13.5, 7.5, 6.5, '#3a3034').ink(); for (const [x, y] of [[8, 11], [12, 9], [15, 13], [10, 16], [13, 17]]) p.D(x, y, '#6a5a5e'); p.P([[13, 12], [18, 14], [15, 18]], '#e8dcc8', { f: 1 }); },
  // bait and rods
  lure: (p) => { p.P([[6, 6], [10, 4], [15, 12], [13, 16], [9, 14]], '#d8dce6').ink(); p.L(8, 6, 12, 13, '#ffffff').D(7, 5, '#d83a3a').L(13, 16, 15, 20, '#8a8e98').L(15, 20, 18, 20, '#8a8e98').L(18, 20, 18, 17, '#8a8e98'); },
  glowlure: (p) => { p.E(9, 9, 4, 5, '#8af0c8').ink(); for (const x of [6, 9, 12]) p.L(x, 14, x + (x - 9) * 0.6, 20, '#5ad0a8'); p.D(8, 8, '#ffffff').D(10, 8, '#1e3a34'); star(p); },
  dryfly: (p) => { p.L(8, 18, 12, 10, '#3a3e48').L(8, 18, 11, 20, '#3a3e48').L(11, 20, 13, 17, '#3a3e48').E(12, 9, 4.5, 2.6, '#c88a4a').E(11, 5.5, 3.6, 2.2, '#e8dcc0').ink(); },
  worms: (p) => { tub(p, '#5a4030', '#7a5a42'); p.ink(); p.L(7, 13, 10, 15, '#e88a9a', 2).L(10, 15, 13, 12, '#e88a9a', 2).L(13, 17, 16, 15, '#d8707e', 2).L(8, 18, 11, 18, '#d8707e', 2); },
  crickets: (p) => { tub(p, '#e8e2d0', '#5aa83a'); p.ink(); for (const [x, y] of [[8, 13], [13, 15], [9, 17]]) p.R(x, y, x + 2, y + 1, '#6a4a2a', { f: 1 }).D(x + 3, y - 1, '#6a4a2a'); },
  minnows: (p) => { for (const [x, y] of [[6, 8], [9, 14]]) p.P([[x, y + 2], [x + 3, y], [x + 8, y + 1], [x + 11, y - 1], [x + 11, y + 5], [x + 8, y + 3], [x + 3, y + 4]], '#b8c8d8'); p.ink(); p.D(8, 9, '#1e2028').D(11, 15, '#1e2028').L(9, 9, 13, 9, '#eef4fa').L(12, 15, 16, 15, '#eef4fa'); },
  shrimp: (p) => { p.P([[5, 10], [9, 6], [15, 6], [19, 10], [19, 15], [15, 19], [12, 19], [15, 15], [15, 11], [11, 10], [7, 13]], '#f08a7a').ink(); p.D(8, 8, '#1e2028').L(12, 7, 12, 10, '#c85a4e').L(15, 8, 16, 11, '#c85a4e').L(17, 12, 15, 14, '#c85a4e').L(5, 9, 2, 6, '#f08a7a'); },
  squid: (p) => { for (const [x, a] of [[5, 0], [10, 1], [15, -1]]) p.P([[x, 5 + a], [x + 3, 5 + a], [x + 4, 20 - a], [x + 1, 20 - a]], '#f2e6e0'); p.ink(); p.D(6, 8, '#d8a8b8').D(11, 12, '#d8a8b8').D(16, 9, '#d8a8b8'); },
  doughballs: (p) => { for (const [x, y] of [[8, 9], [15, 10], [11, 16]]) p.E(x, y, 4, 4, '#ecdcae'); p.ink(); },
  chum: (p) => { p.P([[5, 8], [18, 8], [16, 21], [7, 21]], '#8a8e98').E(11.5, 8, 6.5, 2.2, '#a8303a', { f: 1 }).ink(); p.L(5, 8, 7, 3, '#5a5e68').L(7, 3, 16, 3, '#5a5e68').L(16, 3, 18, 8, '#5a5e68').D(10, 8, '#e8707a').D(13, 7, '#e8707a'); },
  caneRod: (p) => rod(p, '#d8b05a', '#8a8e98'), baitcaster: (p) => rod(p, '#3a3e4a', '#d83a3a'), flyRod: (p) => rod(p, '#3a7a4a', '#e8a82a', '#c8a070'), surfRod: (p) => rod(p, '#2a6ac8', '#c8ccd8'), gameRod: (p) => { rod(p, '#e0aa2a', '#3a3e4a', '#1e1a20'); star(p); },
});
// the bag's seven old fish, small (the catch card and the Fish log have every species' own picture: client/fishart.js)
const fish = (back, belly, fin, o = {}) => (p) => {
  const h = o.h || 4.5, L = o.L || 8;
  p.P([[21, 12 - h], [17.5, 12], [21, 12 + h]], fin).E(10.5, 12, L, h, back).P([[9, 12 - h + 0.5], [13, 12 - h - 2.5], [15, 12 - h + 1]], fin);
  if (o.bill) p.L(2, 12, -1 + 3, 12, back).L(0, 12, 3, 12, back);
  p.ink();
  for (let x = Math.ceil(10.5 - L + 2); x < 10.5 + L - 1; x++) p.D(x, 12 + Math.round(h * 0.45), belly);
  p.D(5, 11, '#101418').D(5, 10, '#ffffff');
  if (o.stripe) p.L(8, 12, 16, 12, o.stripe);
};
Object.assign(ART, { bass: fish('#5a8a3a', '#d8e4b0', '#3a6a2a', { stripe: '#2a4a1e' }), catfish: fish('#5a5e68', '#c8ccd0', '#3a3e48', { h: 3.8 }), salmon: fish('#e0705a', '#f6d8c8', '#b8483a', { stripe: '#f8a890' }),
  tuna: fish('#2a4a8a', '#d8e0ec', '#f2c42a', { h: 5 }), grouper: fish('#b8603a', '#ecc8a0', '#8a4024', { h: 5.5, L: 7.5 }), swordfish: fish('#4a5a78', '#d8dce6', '#2a3a58', { h: 3.6, bill: 1 }), marlin: fish('#2a5ac8', '#e0e6f2', '#1e3a8a', { h: 3.8, bill: 1 }) });
// the things the stages add to the bag (client/leisure/stage.js, client/music/stage.js): fireworks, the camp kit, the
// players and the instruments, the tapes
Object.assign(ART, {
  fwrocket: (p) => { p.L(6, 22, 13, 11, '#c8a070').P([[11, 12], [14, 4], [18, 3], [19, 7], [14, 14]], '#d8302a').ink(); p.L(13, 10, 16, 7, '#f6f2ea').D(18, 2, '#ffd84a').D(20, 4, '#ffd84a').D(21, 1, '#ff8a2a'); },
  fwfountain: (p) => { p.P([[8, 21], [10, 10], [13, 10], [15, 21]], '#3a6ad0').ink(); p.L(9, 14, 14, 14, '#f2c42a').L(9, 17, 14, 17, '#f2c42a'); for (const [x, y] of [[11, 7], [8, 5], [14, 5], [11, 3], [6, 8], [17, 8], [9, 2], [14, 2]]) p.D(x, y, (x + y) % 2 ? '#ffd84a' : '#ff8a2a'); },
  fwcake: (p) => { p.R(4, 10, 19, 20, '#b83a8a', { r: 1 }).ink(); for (const x of [6, 10, 14, 17]) { p.R(x, 7, x + 1, 9, '#e8e2d0', { f: 1 }); p.D(x, 5, '#ffd84a'); } p.L(5, 15, 18, 15, '#f2c42a'); },
  campkit: (p) => { p.L(4, 20, 18, 15, '#8a5a32', 3).L(5, 15, 19, 20, '#6a4426', 3).ink(); p.P([[11.5, 3], [15, 10], [13, 14], [10, 14], [8, 10]], '#ff8a2a', { f: 1 }).P([[11.5, 7], [13, 11], [11.5, 13], [10, 11]], '#ffd84a', { f: 1 }); },
  boombox: (p) => { p.R(2, 8, 21, 20, '#3a3e4a', { r: 1 }).ink(); p.L(6, 7, 6, 4, '#8a8e98').L(6, 4, 17, 4, '#8a8e98').L(17, 4, 17, 7, '#8a8e98').E(7, 14.5, 3, 3, '#1e2028', { f: 1 }).E(16, 14.5, 3, 3, '#1e2028', { f: 1 }).D(7, 14, '#8a8e98').D(16, 14, '#8a8e98').R(10, 10, 13, 12, '#d83a3a', { f: 1 }); },
  radio: (p) => { p.R(3, 9, 20, 20, '#8a5a32', { r: 1 }).ink(); p.L(16, 8, 20, 2, '#c8ccd4').E(8, 14.5, 3.2, 3.2, '#3a2a1e', { f: 1 }).R(13, 11, 18, 13, '#f2e2b8', { f: 1 }).D(14, 17, '#f2c42a').D(17, 17, '#f2c42a'); },
  dancemat: (p) => { p.R(2, 5, 21, 20, '#2a2e3e', { r: 1 }).ink(); for (const [x, y, c] of [[9, 7, '#e8483a'], [3, 11, '#3a8ad0'], [15, 11, '#3ac06a'], [9, 15, '#f2c42a']]) p.R(x, y, x + 5, y + 3, c, { f: 1 }); },
  guitar: (p) => { p.L(13, 11, 21, 3, '#6a4426', 2).E(8.5, 15.5, 6, 5.5, '#c8782a').E(12, 11, 3.6, 3.4, '#c8782a').ink(); p.E(9.5, 14.5, 1.6, 1.6, '#3a2212', { f: 1 }).L(10, 14, 20, 4, '#e8e2d0').D(21, 2, '#c8ccd4'); },
  keytar: (p) => { p.P([[2, 16], [16, 8], [21, 3], [22, 5], [18, 11], [5, 20]], '#d83a8a').ink(); for (let i = 0; i < 6; i++) p.R(5 + i * 2, 16 - i, 5 + i * 2, 17 - i, i % 2 ? '#1e2028' : '#ffffff', { f: 1 }); },
  bucketdrum: (p) => { p.P([[5, 8], [18, 8], [16, 21], [7, 21]], '#e8e2d0').E(11.5, 8, 6.5, 2.2, '#f6f2ea', { f: 1 }).ink(); p.L(3, 3, 10, 8, '#c8a070').L(20, 3, 13, 8, '#c8a070').L(7, 13, 16, 13, '#3a6ad0'); },
  sax: (p) => { p.L(14, 2, 12, 5, '#3a3e48').P([[11, 5], [14, 5], [14, 15], [18, 15], [20, 11], [22, 12], [19, 20], [12, 20]], '#e8b82a').ink(); for (const y of [8, 11, 14]) p.D(12, y, '#fff2a8'); },
  violin: (p) => { p.L(13, 10, 20, 3, '#3a2a1e', 2).E(9, 16, 5, 5, '#a8521e').E(12.5, 11.5, 3.6, 3.4, '#a8521e').ink(); p.L(9, 17, 19, 5, '#e8e2d0').D(7, 15, '#3a1a0a').D(11, 18, '#3a1a0a').L(2, 9, 12, 21, '#d8c8a0'); },
});
const TAPE = (p) => { p.R(2, 7, 21, 19, '#3a3e4a', { r: 1 }).ink(); p.R(4, 9, 19, 14, '#f2e2b8', { f: 1 }).E(8, 11.5, 1.6, 1.6, '#3a3e4a', { f: 1 }).E(15, 11.5, 1.6, 1.6, '#3a3e4a', { f: 1 }).L(6, 17, 17, 17, '#8a8e98').L(5, 10, 18, 10, '#d83a3a'); };
// a grade on a hide or a pelt: a poor one torn, a perfect one with its star; a legend's pelt white, with its star
const GRADE = /^(.+)_([13])$/, LEGEND = /^legend_(.+)$/;
const LEGEND_BIRD = new Set(['quail', 'pheasant', 'turkey', 'duck', 'goose']), LEGEND_HIDE = new Set(['deer', 'elk', 'moose', 'mtgoat', 'boar']);
function drawOf(id) {
  if (ART[id]) return ART[id];
  if (id.startsWith('tape_')) return TAPE;
  let m = GRADE.exec(id);
  if (m && ART[m[1]]) return (p) => { ART[m[1]](p); if (m[2] === '3') star(p); else { p.L(13, 9, 15, 12, '#2a2028').L(15, 12, 13, 14, '#2a2028').D(9, 15, '#2a2028').D(10, 16, '#2a2028'); } };
  m = LEGEND.exec(id);
  if (m) return LEGEND_BIRD.has(m[1]) ? (p) => { feather(p, '#f6f4f0', '#e8e2d0', null); star(p); p.D(5, 6, '#fff2b0').D(20, 16, '#fff2b0'); }
    : LEGEND_HIDE.has(m[1]) ? (p) => { hide(p, '#f4f2ec', '#ffffff'); p.ink(); star(p); p.D(4, 5, '#fff2b0').D(20, 20, '#fff2b0'); }
      : (p) => { pelt(p, '#f4f2ec', '#ffffff', '#e8e6e0'); p.ink(); star(p); p.D(4, 5, '#fff2b0').D(20, 19, '#fff2b0'); };
  return null;
}

const CACHE = new Map();
// ---- the weapons (shared/items.js WEAPONS) -------------------------------------------------------------------------------
// Side on, the muzzle to the right. A long gun from its parts: o.stock and o.body colours, o.guard (the handguard or the
// pump), o.mag, o.scope, o.pod (a bipod), o.len (how far the barrel runs)
const STEEL = '#5a5e6c', BLACK = '#2e3038', WOOD = '#9a6234';
const long = (p, o) => {
  const x1 = o.len || 21;
  p.P([[1, 10], [6, 9], [7, 13], [1, 15]], o.stock || WOOD).R(6, 9, 13, 12, o.body || STEEL).R(13, 9, x1, 10, o.barrel || STEEL).P([[8, 13], [10, 13], [9, 17], [7, 17]], o.grip || o.stock || WOOD);
  if (o.guard) p.R(13, 11, Math.min(18, x1 - 2), 12, o.guard);
  if (o.mag) p.R(11, 13, 13, 13 + o.mag, o.body || STEEL);
  if (o.scope) p.R(7, 6, 7 + o.scope, 7, BLACK).R(8, 8, 8, 8, BLACK).R(6 + o.scope, 8, 6 + o.scope, 8, BLACK);
  if (o.pod) p.L(17, 11, 15, 17, STEEL).L(18, 11, 20, 17, STEEL);
  p.ink();
  p.L(14, 9, x1 - 1, 9, '#9aa0b0');
};
const blade = (p, o) => {
  const gx = o.gx ?? 8.5, gy = o.gy ?? 15.5, L = o.len || 17, w = o.w || 1.5, cv = o.curve || 0, tx = gx + L * 0.7071, ty = gy - L * 0.7071;
  // the blade: two edges out from the guard, meeting at the point (bowed toward the upper left when curved)
  const pts = [], back = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10, bx = gx + (tx - gx) * t - Math.sin(t * Math.PI) * cv * 0.7071, by = gy + (ty - gy) * t - Math.sin(t * Math.PI) * cv * 0.7071, k = o.taper ? w * (1 - t * 0.55) : t > 0.86 ? w * (1 - t) / 0.14 : w; pts.push([bx - k * 0.7071, by - k * 0.7071]); back.push([bx + k * (o.single ? 0.5 : 0.7071), by + k * (o.single ? 0.5 : 0.7071)]); }
  p.P([...pts, ...back.reverse()], o.steel || '#cdd2de');
  const gl = o.grip || 5, ex = gx - gl * 0.7071, ey = gy + gl * 0.7071;
  p.S(gx - 0.5, gy + 0.5, ex, ey, o.gripC || '#6a4426', o.gripW || 3);
  if (o.pommel) p.E(ex - 0.6, ey + 0.6, 1.7, 1.7, o.pommel);
  const g = o.guard ?? 3.5;
  if (g) p.L(gx - g * 0.7071, gy - g * 0.7071, gx + g * 0.7071, gy + g * 0.7071, o.guardC || '#c8a23a', o.guardW || 2);
  p.ink();
  // the light along the blade (the fuller of a sword, the edge of a knife)
  for (let i = 1; i < 9; i++) { const t = i / 10, bx = gx + (tx - gx) * t - Math.sin(t * Math.PI) * cv * 0.7071, by = gy + (ty - gy) * t - Math.sin(t * Math.PI) * cv * 0.7071; p.set(bx - (o.single ? w * 0.4 : 0), by - (o.single ? w * 0.4 : 0), [248, 250, 255]); }
  if (o.wrap) for (let i = 1; i < gl; i += 1.5) p.set(gx - i * 0.7071, gy + i * 0.7071, hex(o.wrap));
};
// a recurve bow drawn, the arrow on the string - its belly and the arrow's head toward the target (the right)
const bowShape = (p, c, grip = '#3a2a22') => {
  p.Q([8, 1], [19, 5], [16, 12], c, 2).Q([16, 12], [19, 19], [8, 23], c, 2).L(6, 0, 8, 1, c, 2).L(6, 23, 8, 23, c, 2).L(16, 10, 16, 14, grip, 3).ink();
  p.L(7, 1, 4, 12, '#ece6d4').L(4, 12, 7, 22, '#ece6d4');                      // (the string, drawn back)
  p.L(4, 12, 21, 12, '#c8a070').P([[23, 12], [20, 10], [20, 14]], '#d0d4e0', { f: 1 }).L(5, 10, 7, 12, '#d83a3a').L(5, 14, 7, 12, '#d83a3a').L(3, 11, 4, 12, '#d83a3a').L(3, 13, 4, 12, '#d83a3a');
};
const WART = {
  fists: (p) => { p.R(8, 17, 16, 22, '#d89a70', { r: 1 }).R(4, 8, 19, 17, '#eab890', { r: 2 }); for (const x of [6, 10, 14, 17.5]) p.E(x, 7.5, 2.1, 2.3, '#f0c49c'); p.P([[3, 12], [12, 12], [14, 14.5], [12, 17], [4, 17]], '#f0c49c').ink(); p.L(8, 6, 8, 11, '#a8704c').L(12, 6, 12, 11, '#a8704c').L(16, 6, 16, 11, '#a8704c').L(4, 12, 12, 12, '#a8704c').L(12, 12, 14, 14, '#a8704c').L(9, 21, 15, 21, '#a8704c'); p.D(5, 14, '#fbe0c8').D(6, 14, '#fbe0c8').D(5, 7, '#fbe0c8').D(9, 6, '#fbe0c8').D(13, 6, '#fbe0c8'); },
  bat: (p) => { p.P([[3, 19], [5, 21], [12, 15], [20, 9], [22, 5], [21, 2], [18, 1], [15, 3], [9, 11]], '#d0a060').E(3.5, 20.5, 2, 2, '#b8884a').ink(); p.L2(9, 12, 16, 4, [240, 212, 160]); p.L2(16, 4, 19, 2, [240, 212, 160]); for (const [x, y] of [[6, 16], [8, 14], [10, 12]]) p.L(x - 1, y - 1, x + 1, y + 1, '#3a2a22'); p.L(18, 7, 20, 5, '#a87838'); },
  knife: (p) => { p.P([[8, 13], [19, 2], [21, 4], [20, 8], [16, 13], [11, 16]], '#cdd2de').S(9, 15, 4, 20, '#2e2a30', 3).L(8, 13, 11, 16, '#8a8e98', 2).ink(); p.L2(12, 15, 16, 12, [250, 252, 255]); p.L2(16, 12, 20, 7, [250, 252, 255]); p.L2(10, 12, 18, 4, [150, 156, 172]); p.D(7, 17, '#8a8e98').D(5, 19, '#8a8e98'); },
  huntknife: (p) => { p.P([[7, 12], [16, 3], [21, 1], [22, 6], [18, 12], [12, 17]], '#bcc2d0').S(9, 15, 4, 20, '#8a5a2e', 3).L(6, 11, 12, 17, '#c8a23a', 2).E(3.4, 20.6, 1.6, 1.6, '#c8a23a').ink(); p.L2(13, 16, 18, 11, [250, 252, 255]); p.L2(18, 11, 22, 6, [250, 252, 255]); p.D(10, 10, '#5a5e6c').D(12, 8, '#5a5e6c').D(14, 6, '#5a5e6c').D(7, 17, '#5a3a1e').D(5, 19, '#5a3a1e'); },
  sword: (p) => blade(p, { len: 19.5, w: 1.6, gx: 7.5, gy: 16.5, guard: 4.8, guardW: 2, gripC: '#6a3a22', grip: 4.5, pommel: '#e0b83a', wrap: '#3a2212' }),
  katana: (p) => blade(p, { len: 17.5, w: 1.2, single: 1, curve: 2.6, gx: 9.5, gy: 14.5, steel: '#e4e8f2', guard: 1.8, guardW: 3, guardC: '#d8b03a', gripC: '#26242c', grip: 8.5, gripW: 3, wrap: '#d83a3a' }),
  plasma: (p) => { p.S(3, 21, 8, 16, '#7a7e8c', 3).L(6, 14, 10, 18, '#3a3e4a', 2).ink(); p.D(5, 19, '#5ae8ff').D(4, 20, '#2a6ad0'); p.L(9, 15, 20, 4, '#1e5ab8', 5).L(9, 15, 20, 4, '#4ad8ff', 3).L(9, 15, 21, 3, '#f2feff').D(22, 2, '#b8f6ff').D(21, 2, '#4ad8ff').D(22, 3, '#4ad8ff'); p.D(17, 2, '#b8f6ff').D(23, 7, '#b8f6ff').D(13, 5, '#7ae8ff').D(20, 11, '#7ae8ff'); star(p); },
  crowbar: (p) => { p.L(4, 21, 16, 8, '#c8302a', 3).Q([16, 8], [19, 3], [22, 5], '#c8302a', 3).L(22, 5, 22, 8, '#c8302a', 2).L(4, 21, 2, 20, '#c8302a', 2).ink(); p.L2(5, 19, 16, 7, [240, 110, 96]); p.D(22, 8, '#c8ccd8').D(22, 9, '#c8ccd8').D(2, 20, '#c8ccd8').D(1, 19, '#c8ccd8'); },
  sledge: (p) => { p.S(3, 22, 14, 8, '#9a6a3a', 3).P([[9, 5], [13, 1], [22, 10], [18, 14]], '#7a7e8c').ink(); p.L2(10, 5, 13, 2, [200, 204, 216]); p.L2(13, 2, 21, 10, [168, 172, 184]); p.L2(19, 13, 21, 11, [70, 74, 86]); p.D(3, 22, '#6a4426'); },
  baton: (p) => { p.S(3, 21, 20, 4, '#2e3038', 3).S(8, 15, 12, 19, '#2e3038', 3).ink(); p.D(20, 4, '#6a6e7c').D(3, 21, '#6a6e7c'); },
  heavyflash: (p) => { p.R(2, 10, 14, 14, '#2e3038', { r: 1 }).P([[14, 8], [19, 6], [19, 18], [14, 16]], '#4a4e5c').R(19, 6, 20, 18, '#ffe89a', { f: 1 }).ink(); p.L(4, 11, 12, 11, '#6a6e7c').D(22, 12, '#fff6c8'); },
  taser: (p) => { p.R(5, 8, 17, 12, '#f2c42a', { r: 1 }).P([[6, 13], [11, 13], [9, 19], [5, 19]], '#2e3038').R(17, 9, 19, 11, '#2e3038').ink(); p.D(20, 8, '#8ae8ff').D(21, 10, '#ffffff').D(20, 12, '#8ae8ff'); },
  pepper: (p) => { p.R(8, 9, 15, 21, '#d8302a', { r: 1 }).R(10, 5, 13, 8, '#2e3038').R(13, 5, 15, 6, '#2e3038', { f: 1 }).ink(); p.R(9, 13, 14, 16, '#f6f2ea', { f: 1 }).D(18, 4, '#f08a3a').D(20, 5, '#f08a3a').D(19, 7, '#f08a3a').D(21, 3, '#f08a3a'); },
  spikes: (p) => { p.R(1, 15, 22, 17, '#3a3e4a', { r: 1 }).ink(); for (let x = 3; x < 22; x += 4) p.P([[x - 1, 15], [x, 9], [x + 1, 15]], '#c8ccd8', { f: 1 }); },
  pistol: (p) => { p.R(4, 8, 18, 11, STEEL).P([[5, 12], [10, 12], [9, 19], [5, 19]], BLACK).R(11, 12, 13, 13, STEEL, { f: 1 }).ink(); p.L(5, 8, 17, 8, '#9aa0b0'); },
  service: (p) => { p.R(4, 8, 18, 11, BLACK).P([[5, 12], [10, 12], [9, 19], [5, 19]], BLACK).R(11, 12, 13, 13, BLACK, { f: 1 }).ink(); p.L(5, 8, 17, 8, '#6a6e7c').D(7, 15, '#3a6ad0'); },
  spistol: (p) => { p.R(2, 8, 12, 11, STEEL).R(12, 8, 21, 11, BLACK, { r: 1 }).P([[3, 12], [8, 12], [7, 19], [3, 19]], BLACK).ink(); p.L(13, 9, 20, 9, '#5a5e6c'); },
  revolver: (p) => { p.R(11, 8, 20, 10, '#b8bcc8').E(9, 10.5, 3.2, 3, '#a8acb8').P([[3, 11], [7, 12], [6, 20], [2, 19]], WOOD).ink(); p.D(9, 10, '#5a5e6c').L(12, 8, 19, 8, '#f2f4f8'); },
  smg: (p) => { p.R(5, 8, 15, 12, BLACK).R(15, 9, 19, 10, STEEL).R(9, 13, 11, 20, BLACK).P([[13, 13], [15, 13], [14, 17], [12, 17]], BLACK).R(2, 8, 5, 9, STEEL, { f: 1 }).ink(); p.L(6, 8, 14, 8, '#6a6e7c'); },
  shotgun: (p) => long(p, { guard: WOOD, len: 22 }),
  pshotgun: (p) => long(p, { stock: BLACK, guard: BLACK, body: BLACK, len: 22 }),
  rifle: (p) => long(p, { guard: WOOD, mag: 3 }),
  huntrifle: (p) => long(p, { guard: WOOD, scope: 7, len: 22 }),
  varmint: (p) => long(p, { stock: '#c8985a', guard: '#c8985a', scope: 4, len: 20 }),
  prifle: (p) => long(p, { stock: BLACK, body: BLACK, guard: BLACK, mag: 4 }),
  psniper: (p) => long(p, { stock: BLACK, body: BLACK, scope: 8, pod: 1, len: 22 }),
  passault: (p) => long(p, { stock: BLACK, body: BLACK, guard: BLACK, mag: 6, scope: 3 }),
  arifle: (p) => long(p, { stock: '#8a7a52', body: '#3e4048', guard: '#8a7a52', mag: 6 }),
  rocket: (p) => { p.R(2, 8, 21, 12, '#5a6a3a', { r: 1 }).P([[0, 7], [3, 8], [3, 12], [0, 13]], '#3e4a28').R(9, 13, 11, 18, BLACK).R(14, 5, 16, 7, BLACK).ink(); p.L(4, 8, 20, 8, '#8a9a62'); },
  sam: (p) => { p.R(1, 8, 19, 12, '#4a6a4a', { r: 1 }).P([[19, 7], [23, 10], [19, 13]], '#b8bcc8').R(8, 13, 10, 18, BLACK).R(11, 4, 16, 7, '#2e3038', { r: 1 }).ink(); p.D(13, 5, '#5ae86a').L(3, 8, 18, 8, '#7a9a7a'); },
  flamer: (p) => { p.R(1, 12, 10, 18, '#d8302a', { r: 2 }).R(3, 7, 15, 10, '#5a5e6c').R(15, 6, 16, 11, '#3a3e4a').P([[7, 11], [10, 11], [9, 16], [6, 16]], '#2e3038').L(11, 11, 13, 14, '#8a8e98').ink(); p.L(4, 7, 14, 7, '#9aa0b0').L(3, 14, 8, 14, '#f2c42a').D(2, 13, '#ffb0a0'); p.P([[17, 8], [20, 3], [21, 7], [23, 5], [23, 10], [21, 13], [17, 10]], '#ff7a1e', { f: 1 }).P([[17, 8], [20, 6], [21, 9], [19, 11], [17, 10]], '#ffd84a', { f: 1 }).D(18, 9, '#fffbe0'); },
  grenade: (p) => { p.E(11.5, 14, 6.5, 7, '#4a6a3a').R(9, 4, 14, 7, '#8a8e98').ink(); p.L(14, 5, 18, 5, '#c8ccd8').L(18, 5, 18, 10, '#c8ccd8').L(8, 11, 15, 11, '#2e4424').L(8, 15, 15, 15, '#2e4424').L(11.5, 8, 11.5, 20, '#2e4424'); },
  bow: (p) => bowShape(p, '#9a6234'),
  firebow: (p) => { bowShape(p, '#6a2a22', '#e8a82a'); p.P([[23, 12], [20, 9], [21, 12], [20, 15]], '#ff8a2a', { f: 1 }).D(22, 12, '#ffe07a').D(21, 8, '#ffd84a').D(22, 16, '#ff8a2a').D(19, 7, '#ff8a2a').D(8, 0, '#ff8a2a').D(8, 23, '#ff8a2a'); },
  rod: (p) => rod(p, '#d8b05a', '#8a8e98'),
  boomtest: (p) => { p.R(5, 9, 18, 20, '#f2c42a', { r: 1 }).R(10, 5, 13, 8, '#d8302a').ink(); p.L(7, 12, 16, 17, '#2e3038').L(16, 12, 7, 17, '#2e3038'); },
};
export function weaponSprite(id) {
  const key = 'w:' + id;
  if (CACHE.has(key)) return CACHE.get(key);
  let out = null;
  if (WART[id]) { const p = new Pen(); WART[id](p); const px = new Uint32Array(N * N); for (let i = 0; i < N * N; i++) if (p.c[i]) px[i] = pack(p.c[i]); out = { w: N, h: N, px }; }
  CACHE.set(key, out);
  return out;
}

// ---- the sprite ----------------------------------------------------------------------------------------------------------
const pack = (c) => (255 << 24 | (Math.max(0, Math.min(255, Math.round(c[2]))) << 16) | (Math.max(0, Math.min(255, Math.round(c[1]))) << 8) | Math.max(0, Math.min(255, Math.round(c[0])))) >>> 0;
export function itemSprite(id) {
  if (CACHE.has(id)) return CACHE.get(id);
  let out = null;
  const draw = drawOf(id);
  if (draw) {
    const p = new Pen();
    draw(p);
    const px = new Uint32Array(N * N);
    for (let i = 0; i < N * N; i++) if (p.c[i]) px[i] = pack(p.c[i]);
    out = { w: N, h: N, px };
  }
  CACHE.set(id, out);
  return out;
}
export const ITEM_ART = ART;   // (the tests: every item has its own)

const URLS = new Map();
function urlOf(key, s) {
  if (URLS.has(key)) return URLS.get(key);
  let url = '';
  if (s && typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const g = c.getContext('2d'), im = g.createImageData(s.w, s.h);
    new Uint32Array(im.data.buffer).set(s.px);
    g.putImageData(im, 0, 0);
    url = c.toDataURL('image/png');
  }
  URLS.set(key, url);
  return url;
}
export const itemIconURL = (id) => urlOf('i:' + id, typeof document !== 'undefined' ? itemSprite(id) : null);
export const weaponIconURL = (id) => urlOf('w:' + id, typeof document !== 'undefined' ? weaponSprite(id) : null);
// (px 0: sized by the style sheet - .iti in its place; whole multiples of 24 stay crisp)
const img = (url, px) => (url ? `<img class="iti" alt="" src="${url}"${px ? ` style="width:${px}px;height:${px}px"` : ''}>` : '');
export const itemIcon = (id, px = 0) => img(itemIconURL(id), px);
export const weaponIcon = (id, px = 0) => img(weaponIconURL(id), px);
