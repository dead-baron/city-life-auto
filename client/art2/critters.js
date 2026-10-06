// Art v2 ambient wildlife, modelled on the N10 concept sheet (docs/art-v2/targets/N10_wildlife-ambient.png):
// butterflies (monarch, blue, sulphur), dragonflies, bees, fireflies, sparrows and a flock bursting out of
// a tree, a pigeon, a seagull, a heron, falling maple leaves and petals, dust motes and sparkles, rain
// ripples, a jumping trout, a frog, a squirrel on a trunk and a hopping rabbit - at true game scale (a
// person is ~42 px: a butterfly spans ~9 px, a pigeon is ~12 px long, a heron stands ~30 px, a rabbit
// is ~16 px long). Same house style as the other sprites: 4-6 step hue-shifted ramps, sparse ordered
// dither, light from the upper left, a dark hue-tinted outline (never black); fireflies and motes glow.
//
// Every frame is a GBuf whose anchor (ax, ay) is the ground point under the creature when it sits on the
// ground (h = 0); pixel z is the height above that point. Side-view creatures face +x (east); mirror()
// makes the west-facing set. Flying things carry F_NOCAST (they cast a soft blob instead: shadowBlob),
// so draw a frame at (x - ax, y - h - ay) with its z raised by h, and its shadow at (x - sax, y - say).
//
//   critterFrames(kind, left)   memoised frames of a kind from CRITTERS (left = mirrored, facing west)
//   shadowBlob(r)               memoised soft ground shadow, radius r (F_GROUND | F_NOCAST, partial alpha)
//   flockBurst(seed, n)         6 prebuilt frames of n sparrows bursting out of a tree (anchor = tree foot)
//   new CritterPool(n)          fixed pool: spawn(kind, x, y, opt) / startle(x, y, r) / update(dt) / forEach(fn)
//   Pen, mirror, trim           the little 2D sprite painter these are drawn with (forage.js uses it too)
import { GBuf, F_GROUND, F_NOCAST, F_WATER, hash, mulberry32, step, norm } from './gbuf.js';
import { ramp } from './palette.js';

const TAU = Math.PI * 2;
const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const LD = norm([-0.55, -0.62, 0.56]);                       // light: from the upper left, toward the viewer

// ---- the painter -------------------------------------------------------------------------------------
// Shapes are given in "units" placed by at(ox, oy, s) (pixel = o + unit * s), shaded with a ramp from a
// sphere / cylinder / bevel lighting term and dithered. Normals are in sprite space (u right, v down, w out
// of the picture) and turned to world space for an upright sprite ('up') or one lying flat seen from above
// ('flat'). Partial-alpha pixels (wings) blend over what is already painted.
export class Pen {
  constructor(w, h, ax, ay, mode = 'up') {
    this.G = new GBuf(w, h); this.G.ax = ax; this.G.ay = ay;
    this.no = new Uint8Array(w * h); this.mode = mode; this.fl = 0;
    this.at(0, 0, 1);
  }
  at(ox, oy, s = 1) { this.ox = ox; this.oy = oy; this.s = s; return this; }
  X(u) { return this.ox + u * this.s; }
  Y(v) { return this.oy + v * this.s; }
  // one pixel in pixel coordinates. o: { e [r,g,b,k] glow, a alpha, ol false = no outline, flag, ground }
  set(x, y, c, n = null, o = {}) {
    x = Math.floor(x); y = Math.floor(y);
    const G = this.G; if (!G.inside(x, y)) return;
    const i = y * G.w + x, j = i * 4, a = o.a ?? 255;
    if (a < 255) {
      if (G.col[j + 3] === 255) { const k = a / 255; for (let q = 0; q < 3; q++) G.col[j + q] = G.col[j + q] * (1 - k) + c[q] * k; return; }
      if (G.col[j + 3] > a) return;
    }
    G.col[j] = c[0]; G.col[j + 1] = c[1]; G.col[j + 2] = c[2]; G.col[j + 3] = a;
    if (n) {
      const m = this.mode === 'flat' ? [n[0] * 0.7, n[1] * 0.7 + 0.2, n[2] + 0.3] : [n[0] * 0.9, 0.35 + n[2] * 0.45, -n[1] * 0.9 + 0.25];
      const l = Math.hypot(m[0], m[1], m[2]) || 1;
      G.nrm[j] = (m[0] / l * 0.5 + 0.5) * 255; G.nrm[j + 1] = (m[1] / l * 0.5 + 0.5) * 255; G.nrm[j + 2] = (m[2] / l * 0.5 + 0.5) * 255; G.nrm[j + 3] = 255;
    } else G.nrm[j + 3] = 0;
    const e = o.e;
    if (e) { G.emi[j] = e[0]; G.emi[j + 1] = e[1]; G.emi[j + 2] = e[2]; G.emi[j + 3] = e[3] ?? 255; } else G.emi[j + 3] = 0;
    G.flag[i] = (o.flag || 0) | this.fl | (o.ground ? F_GROUND : 0);
    this.no[i] = o.ol === false || o.ground ? 1 : 0;
  }
  has(x, y) { return this.G.alpha(Math.floor(x), Math.floor(y)) > 0; }
  shade(x, y, R, nu, nv, w, pu, pv, o) {
    let t = (o.k ?? 0.55) + ((nu * LD[0] + nv * LD[1] + w * LD[2]) - 0.5) * (o.lk ?? 0.9), c = null;
    if (o.pat) { const r = o.pat(pu, pv, x, y); if (r === false) return; if (Array.isArray(r)) c = r; else if (r) t += r; }
    if (!c) c = step(R, cl(t, 0, 0.999), x, y, o.d ?? 0.6);
    const e = typeof o.e === 'function' ? o.e(pu, pv, x, y) : o.e;
    this.set(x, y, c, o.flatN ? [0, 0, 1] : [nu, nv, w + (o.wb ?? 0.25)], { e, a: o.alpha, ol: o.ol, flag: o.flag, ground: o.ground });
  }
  // ellipse at (cx, cy), radii rx, ry (units), turned by o.a; o.pat(u, v, x, y) gets the local -1..1 coords
  ell(cx, cy, rx, ry, R, o = {}) {
    const X = this.X(cx), Y = this.Y(cy), a = o.a || 0, ca = Math.cos(a), sa = Math.sin(a);
    const RX = Math.max(0.55, rx * this.s), RY = Math.max(0.55, ry * this.s), m = Math.max(RX, RY) + 1;
    for (let y = Math.floor(Y - m); y <= Math.ceil(Y + m); y++) for (let x = Math.floor(X - m); x <= Math.ceil(X + m); x++) {
      const dx = x + 0.5 - X, dy = y + 0.5 - Y, lu = (dx * ca + dy * sa) / RX, lv = (-dx * sa + dy * ca) / RY, q = lu * lu + lv * lv;
      if (q > 1) continue;
      const w = Math.sqrt(1 - q);
      this.shade(x, y, R, lu * ca - lv * sa, lu * sa + lv * ca, w, lu, lv, o);
    }
    return this;
  }
  // a round bar from a to b, radius r0 tapering to r1; o.pat(t along 0..1, s across -1..1, x, y)
  cap(a, b, r0, r1, R, o = {}) {
    const ax = this.X(a[0]), ay = this.Y(a[1]), bx = this.X(b[0]), by = this.Y(b[1]);
    const R0 = Math.max(0.5, r0 * this.s), R1 = Math.max(0.5, r1 * this.s), m = Math.max(R0, R1) + 1;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-6, L = Math.sqrt(L2), px = -dy / L, py = dx / L;
    for (let y = Math.floor(Math.min(ay, by) - m); y <= Math.ceil(Math.max(ay, by) + m); y++) for (let x = Math.floor(Math.min(ax, bx) - m); x <= Math.ceil(Math.max(ax, bx) + m); x++) {
      const qx = x + 0.5 - ax, qy = y + 0.5 - ay, tr = (qx * dx + qy * dy) / L2;
      if (o.flat && (tr < 0 || tr > 1)) continue;
      const t = cl(tr), r = R0 + (R1 - R0) * t, ox = qx - dx * t, oy = qy - dy * t, d = Math.hypot(ox, oy);
      if (d > r) continue;
      const k = d / r, sd = (ox * px + oy * py) >= 0 ? k : -k, w = Math.sqrt(Math.max(0, 1 - k * k));
      this.shade(x, y, R, d ? ox / d * k : 0, d ? oy / d * k : 0, w, t, sd, o);
    }
    return this;
  }
  // a filled polygon (units), bevel-lit: the upper-left edge catches light, the lower-right is in shade
  poly(pts, R, o = {}) {
    const P = pts.map(([u, v]) => [this.X(u), this.Y(v)]);
    const x0 = Math.floor(Math.min(...P.map((p) => p[0]))), x1 = Math.ceil(Math.max(...P.map((p) => p[0])));
    const y0 = Math.floor(Math.min(...P.map((p) => p[1]))), y1 = Math.ceil(Math.max(...P.map((p) => p[1])));
    const ins = (x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ext = Math.max(x1 - x0, y1 - y0, 1) / 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!ins(x + 0.5, y + 0.5)) continue;
      let t = (o.k ?? 0.55) - ((x - cx) * 0.55 + (y - cy) * 0.62) / ext * (o.g ?? 0.18), c = null;
      if (o.bevel !== 0) { if (!ins(x - 0.5, y + 0.5) || !ins(x + 0.5, y - 0.5)) t += 0.22 * (o.bevel ?? 1); else if (!ins(x + 1.5, y + 0.5) || !ins(x + 0.5, y + 1.5)) t -= 0.18 * (o.bevel ?? 1); }
      if (o.pat) { const r = o.pat((x + 0.5 - this.ox) / this.s, (y + 0.5 - this.oy) / this.s, x, y); if (r === false) continue; if (Array.isArray(r)) c = r; else if (r) t += r; }
      this.set(x, y, c || step(R, cl(t, 0, 0.999), x, y, o.d ?? 0.6), o.flatN ? [0, 0, 1] : null, { e: o.e, a: o.alpha, ol: o.ol, flag: o.flag, ground: o.ground });
    }
    return this;
  }
  // a 1 px line (units); c a colour or fn(t, x, y) -> colour | null
  line(a, b, c, o = {}) {
    const ax = this.X(a[0]), ay = this.Y(a[1]), bx = this.X(b[0]), by = this.Y(b[1]), n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t, col = typeof c === 'function' ? c(t, x, y) : c;
      if (col) this.set(x, y, col, o.n || null, o);
    }
    return this;
  }
  dot(u, v, c, o = {}) { this.set(this.X(u), this.Y(v), c, o.n || null, o); return this; }
  // hand-placed pixels: rows of characters, pal[ch] = colour | { c, e, a, ol } ('.' and ' ' are empty)
  tpl(rows, pal, x0 = 0, y0 = 0, o = {}) {
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const q = pal[r[x]]; if (!q) continue; const c = Array.isArray(q) ? q : q.c; this.set(x0 + x, y0 + y, c, o.n || null, Array.isArray(q) ? o : { ...o, e: q.e, a: q.a, ol: q.ol }); } });
    return this;
  }
  // outline, normals for unshaded pixels, heights (above the anchor row, + z0) and flags
  done(o = {}) {
    const G = this.G, { w, h } = G, add = [];
    if (o.outline !== false) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (G.col[i * 4 + 3]) continue;
      let solid = -1, glow = -1;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const k = Y * w + X; if (G.col[k * 4 + 3] !== 255 || this.no[k]) continue;
        if (G.emi[k * 4 + 3] > 150 && !o.noGlowRim) glow = k; else if (solid < 0) solid = k;
      }
      if (solid >= 0 || glow >= 0) add.push(i, solid, glow);
    }
    const dk = o.dark ?? 0.3;
    for (let q = 0; q < add.length; q += 3) {
      const d = add[q], s = add[q + 1], g = add[q + 2], dj = d * 4;
      if (s >= 0) {
        const sj = s * 4;
        G.col[dj] = G.col[sj] * dk + 16; G.col[dj + 1] = G.col[sj + 1] * dk * 0.75 + 9; G.col[dj + 2] = G.col[sj + 2] * dk + 22; G.col[dj + 3] = 255;
        for (let c = 0; c < 4; c++) G.nrm[dj + c] = G.nrm[sj + c];
        G.flag[d] = G.flag[s] & ~F_GROUND;
      } else {
        const gj = g * 4;
        G.col[dj] = G.emi[gj] * 0.55; G.col[dj + 1] = G.emi[gj + 1] * 0.6; G.col[dj + 2] = G.emi[gj + 2] * 0.7; G.col[dj + 3] = 255;
        G.emi[dj] = G.emi[gj]; G.emi[dj + 1] = G.emi[gj + 1]; G.emi[dj + 2] = G.emi[gj + 2]; G.emi[dj + 3] = 120;
        for (let c = 0; c < 4; c++) G.nrm[dj + c] = G.nrm[gj + c];
        G.flag[d] = G.flag[g] & ~F_GROUND;
      }
    }
    G.autoNormals(this.mode === 'flat' ? [0, 0.25, 0.97] : [0, 0.55, 0.835], 3);
    const z0 = o.z0 ?? 0;
    for (let i = 0; i < w * h; i++) {
      if (!G.col[i * 4 + 3]) continue;
      if (G.flag[i] & F_GROUND) { G.z[i] = 0; continue; }
      G.z[i] = z0 + Math.max(1, Math.round(G.ay - Math.floor(i / w)));
      G.flag[i] |= o.flag || 0;
    }
    return G;
  }
}

// west-facing copy of a sprite (normals turned too)
export function mirror(S) {
  const G = new GBuf(S.w, S.h); G.ax = S.w - S.ax; G.ay = S.ay;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
    const si = y * S.w + x, di = y * S.w + (S.w - 1 - x);
    for (let c = 0; c < 4; c++) { G.col[di * 4 + c] = S.col[si * 4 + c]; G.nrm[di * 4 + c] = S.nrm[si * 4 + c]; G.emi[di * 4 + c] = S.emi[si * 4 + c]; }
    if (S.nrm[si * 4 + 3]) G.nrm[di * 4] = 255 - S.nrm[si * 4];
    G.z[di] = S.z[si]; G.flag[di] = S.flag[si];
  }
  return G;
}
// crop away empty borders, keeping the anchor in place
export function trim(S, pad = 0) {
  let x0 = S.w, y0 = S.h, x1 = -1, y1 = -1;
  for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) if (S.col[(y * S.w + x) * 4 + 3]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return S;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(S.w - 1, x1 + pad); y1 = Math.max(Math.min(S.h - 1, y1 + pad), Math.min(S.h - 1, Math.ceil(S.ay)));
  const G = new GBuf(x1 - x0 + 1, y1 - y0 + 1); G.ax = S.ax - x0; G.ay = S.ay - y0;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const i = y * G.w + x, j = (y + y0) * S.w + x + x0;
    G.z[i] = S.z[j]; G.flag[i] = S.flag[j];
    for (let c = 0; c < 4; c++) { G.col[i * 4 + c] = S.col[j * 4 + c]; G.nrm[i * 4 + c] = S.nrm[j * 4 + c]; G.emi[i * 4 + c] = S.emi[j * 4 + c]; }
  }
  return G;
}

// ---- palettes ----------------------------------------------------------------------------------------
const R5 = (c, o) => ramp(c, 5, 2, o), R4 = (c, o) => ramp(c, 4, 2, o);
const C = {
  ink: ramp('#2a2430', 4, 1, { light: 0.35 }), white: R4('#f0ece2', { dark: 0.3 }),
  monarch: R5('#e8762a', { light: 0.55 }), blue: R5('#7aaaf0', { light: 0.6 }), navy: R4('#283252'), sulphur: R5('#f0bc2a', { light: 0.55 }),
  teal: R5('#3a9e8c', { light: 0.55 }), eyeB: R4('#3a62a8'), wing: [212, 232, 244],
  bee: R5('#e6a424', { light: 0.5 }), fireB: R4('#4a3a30'), fireH: R4('#c8642e'), fireW: R4('#b8a888'),
  sparrow: R5('#b89874', { light: 0.6 }), sparrowL: R4('#ece0c8', { dark: 0.35 }),
  pigeon: ramp('#9aa2b4', 6, 3, { light: 0.55 }), pigeonD: R5('#626878'), neckG: R4('#4a9a7a'), neckP: R4('#8a5a9a'), foot: R4('#a87a74'),
  gull: ramp('#eceef0', 5, 3, { dark: 0.38 }), gullW: R5('#a6b0be', { light: 0.55 }), gold: R4('#eab83a'),
  heron: ramp('#8890a4', 6, 3, { light: 0.55 }), heronL: ramp('#e2e2de', 5, 3, { dark: 0.4 }), heronLeg: R4('#b08a3e'), heronT: ramp('#3c4256', 4, 1),
  trout: R5('#6e7e3e'), troutS: R4('#dc7c80'), troutB: R4('#eadcbc', { dark: 0.4 }), water: R5('#4a92d4', { light: 0.6 }),
  frog: ramp('#6ab040', 6, 3, { light: 0.55 }), frogB: R4('#d8d47a'), frogS: R4('#2c5a2c'),
  squirrel: ramp('#dc7a34', 6, 3, { light: 0.6 }), squirrelL: R4('#e8c49c'), bark: ramp('#6a4a32', 6, 3), ivy: R5('#4e8a2e', { light: 0.5 }),
  rabbit: ramp('#a27a52', 6, 3, { light: 0.48 }), rabbitL: R4('#ecdcc4', { dark: 0.4 }),
  maple: [R5('#d84420', { light: 0.5 }), R5('#e8862a', { light: 0.5 }), R5('#d86028', { light: 0.5 }), R5('#c03a1e', { light: 0.5 })],
  petal: R5('#f2a0bc', { light: 0.6 }), mote: [255, 214, 120], spark: [240, 246, 255],
};

// ---- butterflies (seen from above, 4-frame flap: open, rising, closed, falling) -----------------------
// hand-pixelled left halves + the body column, mirrored: k wing edge, O light, o main, w pale spot, b body
const sym = (rows) => rows.map((r) => r + r.slice(0, 5).split('').reverse().join(''));
const BFLY = [
  ['...k..', '....k.', '.kkk.b', 'kOOokb', 'kOooob', 'kwOoob', '.kkoob', '.kOokb', '.kwok.', '..kk..'],
  ['...k..', '....k.', '..kkkb', '..kOob', '..kOob', '..kwkb', '...kob', '..kOob', '...kkb', '......'],
  ['......', '....k.', '.....k', '....kO', '....ko', '....ko', '....kw', '.....b', '.....b', '......'],
  ['...k..', '....k.', '..kk.b', '.kOOob', '.kOoob', '.kwkob', '..kkob', '.kOokb', '..kk.b', '......'],
];
const BUTTER = {
  monarch: { O: [252, 168, 64], o: [226, 104, 30], k: [40, 26, 34], w: [244, 236, 220] },
  blue: { O: [176, 214, 255], o: [96, 150, 230], k: [30, 38, 76], w: [236, 244, 255] },
  sulphur: { O: [255, 226, 110], o: [236, 176, 34], k: [44, 30, 30], w: [255, 246, 200] },
};
function butterfly(kind = 'monarch') {
  const P = BUTTER[kind] || BUTTER.monarch, pal = { ...P, b: [36, 28, 34] };
  return BFLY.map((rows) => {
    const p = new Pen(11, 12, 5.5, 11, 'flat');
    p.tpl(sym(rows), pal, 0, 0, { n: [0, 0, 1] });
    return p.done({ flag: F_NOCAST, outline: false });
  });
}

// ---- dragonfly (from above, diagonal, wings whirring) ----------------------------------------------------
function dragonfly() {
  const out = [], dx = Math.SQRT1_2, dy = -Math.SQRT1_2;               // body points up-right
  for (let f = 0; f < 4; f++) {
    const p = new Pen(19, 18, 9.5, 16, 'flat'), cx = 9.5, cy = 8.5;
    const sw = [0.32, 0.05, -0.28, 0.05][f], len = [5.4, 5.8, 5.2, 5.8][f];
    // wings first (glassy, no outline), then the body over them
    for (const [off, l] of [[1.2, len], [-0.4, len * 0.92]]) for (const s of [-1, 1]) {
      const ang = Math.atan2(dy, dx) + s * (Math.PI / 2 + sw * (off > 0 ? 1 : -1)), bx = cx + dx * off, by = cy + dy * off;
      const ex = bx + Math.cos(ang) * l, ey = by + Math.sin(ang) * l;
      p.ell((bx + ex) / 2, (by + ey) / 2, l / 2, 0.85, [C.wing, C.wing, C.wing], { a: ang, alpha: 150, ol: false, flatN: true, pat: (u, v, x, y) => (Math.abs(u) > 0.82 ? [150, 180, 200] : hash(x, y, 9) > 0.8 ? [244, 250, 255] : 0) });
    }
    p.cap([cx - dx * 6.5, cy - dy * 6.5], [cx + dx * 1.5, cy + dy * 1.5], 0.55, 0.75, C.teal, { pat: (t) => (Math.round(t * 7) % 2 && t < 0.8 ? -0.3 : 0.1) });
    p.ell(cx + dx * 2.2, cy + dy * 2.2, 1.3, 1.3, C.eyeB, { k: 0.6 });
    out.push(p.done({ flag: F_NOCAST }));
  }
  return out;
}

// ---- bee (side view, facing east, wings a blur) -------------------------------------------------------
const BEE = [
  ['..WW...', '.WwwW..', '..WW...', '.YYkYh.', 'kYykyhh', '.kyky..'],
  ['.......', 'WWw....', 'WwwW...', '.YYkYh.', 'kYykyhh', '.kyky..'],
  ['...WW..', '..WwwW.', '...WW..', '.YYkYh.', 'kYykyhh', '.kyky..'],
  ['.......', '.......', '.WWwW..', 'WwYkYh.', 'kYykyhh', '.kyky..'],
];
function bee() {
  const W = { c: [236, 244, 255], a: 200, ol: false }, w = { c: [200, 220, 240], a: 150, ol: false };
  const pal = { W, w, Y: [255, 214, 80], y: [232, 160, 32], k: [44, 30, 28], h: [58, 40, 34] };
  return BEE.map((rows) => { const p = new Pen(9, 9, 4, 8); p.tpl(rows, pal, 1, 1); return p.done({ flag: F_NOCAST }); });
}

// ---- firefly (from above; the tail lantern pulses) -------------------------------------------------------
function firefly() {
  const out = [], GL = [214, 255, 96];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(11, 12, 5.5, 10, 'flat'), cx = 5.5, cy = 4.8, g = [255, 200, 120, 220][f], ws = [1.4, 1.8, 1.2, 1.9][f];
    for (const s of [-1, 1]) p.ell(cx + s * ws, cy - 0.2, 0.9, 1.7, C.fireW, { a: s * 0.5, alpha: 200, ol: false });
    p.ell(cx, cy, 1, 1.6, C.fireB, { k: 0.4 });
    p.ell(cx, cy - 1.6, 0.9, 0.7, C.fireH);
    p.ell(cx, cy + 1.9, 0.95, 1.1, [[150, 190, 60], [196, 236, 90], [236, 255, 160]], { k: 0.7, e: [...GL, g] });
    p.line([cx - 0.5, cy - 2.2], [cx - 1.8, cy - 3.8], C.fireB[0], { ol: false }); p.line([cx + 0.5, cy - 2.2], [cx + 1.8, cy - 3.8], C.fireB[0], { ol: false });
    out.push(p.done({ flag: F_NOCAST }));
  }
  return out;
}

// ---- birds ------------------------------------------------------------------------------------------------
// a wing from the shoulder (x, y) out at angle a (0 = forward/east, -PI/2 = up), length len, root chord ch;
// the outer `tipK` of it in the tip ramp, a ragged trailing edge of primaries
function wing(p, x, y, a, len, ch, R, tip, o = {}) {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  p.cap([x, y], [ex, ey], ch, ch * 0.35, R, { k: o.k ?? 0.55, pat: (t, s, px, py) => (tip && t > (o.tipK ?? 0.72) ? tip[Math.max(0, Math.min(tip.length - 1, Math.round(1 + s * 0.6)))] : o.bars && t > 0.25 && t < 0.55 && Math.round(t * 10) % 2 ? o.bars : (s > 0.55 && hash(px, py, 4) > 0.55 ? -0.25 : 0)) });
}
// sparrow, 5-6 px: 0 perched, 1 wings up, 2 wings level, 3 wings down
function sparrow() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(14, 13, 6, 11), cx = 6, cy = f ? 6 : 8;
    if (f === 1) wing(p, cx, cy - 0.5, -2.1, 4.2, 1.1, C.sparrow, C.ink, { k: 0.4 });
    if (f === 2) wing(p, cx, cy - 0.5, -2.8, 3.2, 1.0, C.sparrow, C.ink, { k: 0.4 });
    p.cap([cx - 1.6, cy - 0.4], [cx - 3.8, cy - 1.2 + (f ? 0.6 : -0.6)], 0.8, 0.6, C.sparrow, { k: 0.35 });
    p.ell(cx, cy, 2.2, 1.5, C.sparrow, { pat: (u, v) => (v > 0.25 ? C.sparrowL[2] : 0) });
    p.ell(cx + 1.9, cy - 1.1, 1.2, 1.15, C.sparrow, { k: 0.6 });
    p.dot(cx + 2.3, cy - 1.4, C.ink[0]); p.dot(cx + 3.3, cy - 0.9, C.gold[1], { ol: false });
    if (f === 0) { p.ell(cx - 0.4, cy - 0.2, 1.4, 0.8, C.sparrow, { k: 0.25 }); p.line([cx - 0.3, cy + 1.4], [cx - 0.3, cy + 2.8], C.foot[0], { ol: false }); }
    if (f === 1) wing(p, cx + 0.3, cy - 0.2, -1.8, 4.6, 1.2, C.sparrow, C.ink, { k: 0.62 });
    if (f === 2) wing(p, cx + 0.3, cy, 2.75, 3.8, 1.1, C.sparrow, C.ink, { k: 0.62 });
    if (f === 3) wing(p, cx + 0.3, cy + 0.2, 2.1, 4.0, 1.1, C.sparrow, C.ink, { k: 0.6 });
    out.push(p.done({ flag: f ? F_NOCAST : 0 }));
  }
  return out;
}
// pigeon, ~12 px: 0 standing, 1 take-off, 2-4 flapping (up, level, down)
function pigeon() {
  const out = [];
  for (let f = 0; f < 5; f++) {
    const p = new Pen(26, 24, 12, 21), fly = f >= 1, cx = 11.5, cy = fly ? 11 : 15.5, tilt = f === 1 ? -0.35 : 0;
    const head = [cx + 4.5 + (f === 1 ? 0.6 : 0.5), cy - (f === 1 ? 4.6 : fly ? 2.2 : 3.6)];
    if (f === 1) wing(p, cx - 0.5, cy - 1.5, -2.05, 9, 2.2, C.pigeonD, C.ink, { k: 0.45 });
    if (f === 2) wing(p, cx - 0.5, cy - 1.2, -2.2, 8, 2.1, C.pigeonD, C.ink, { k: 0.45 });
    if (f === 3) wing(p, cx - 0.5, cy - 1, -2.75, 6, 2, C.pigeonD, C.ink, { k: 0.45 });
    // tail with a dark band
    p.poly([[cx - 3, cy - 1.2], [cx - 8, cy - (fly ? 1.4 : 0.2)], [cx - 8.2, cy + (fly ? 0.8 : 1.6)], [cx - 3, cy + 1]], C.pigeon, { k: 0.45, pat: (u) => (u < cx - 6.8 ? C.pigeonD[0] : 0) });
    p.ell(cx, cy, 4.4, 2.9, C.pigeon, { a: tilt, k: 0.6, pat: (u, v) => (v > 0.45 ? -0.12 : 0) });
    // neck and breast with the green-violet sheen, then the head
    p.ell(cx + 3.2, cy - 1.6 + (f === 1 ? -0.8 : 0), 2.2, 2.3, C.pigeon, { k: 0.6, pat: (u, v, x, y) => (u > 0 && v > -0.5 && v < 0.35 ? (v < -0.05 ? C.neckG[2] : C.neckP[2]) : 0) });
    p.ell(head[0], head[1], 1.75, 1.6, C.pigeon, { k: 0.66 });
    p.dot(head[0] + 0.6, head[1] - 0.4, C.foot[2]); p.dot(head[0] + 1.9, head[1] + 0.2, C.white[2]); p.dot(head[0] + 2.8, head[1] + 0.6, C.ink[1]);
    if (!fly) {
      // folded wing with its two dark bars, pink legs
      p.ell(cx - 0.6, cy - 0.6, 3.4, 1.8, C.pigeon, { a: 0.12, k: 0.45, pat: (u) => (Math.abs(u + 0.1) < 0.12 || Math.abs(u + 0.5) < 0.12 ? C.pigeonD[0] : 0) });
      for (const lx of [cx - 0.5, cx + 1.2]) { p.line([lx, cy + 2.6], [lx + 0.3, 20.6], C.foot[1]); p.dot(lx + 1.3, 20.6, C.foot[1]); }
    } else {
      if (f === 1) p.line([cx - 1.6, cy + 2.6], [cx - 3, cy + 5], C.foot[1]);
      if (f === 1) wing(p, cx + 0.5, cy - 1.8, -1.75, 9.5, 2.4, C.pigeon, C.ink, { k: 0.62, bars: C.pigeonD[1] });
      if (f === 2) wing(p, cx + 0.5, cy - 1.5, -1.9, 9, 2.3, C.pigeon, C.ink, { k: 0.62, bars: C.pigeonD[1] });
      if (f === 3) wing(p, cx + 0.5, cy - 0.5, 2.7, 8, 2.3, C.pigeon, C.ink, { k: 0.62, bars: C.pigeonD[1] });
      if (f === 4) { wing(p, cx - 0.5, cy - 1, -2.9, 5, 2, C.pigeonD, C.ink, { k: 0.45 }); wing(p, cx + 0.5, cy, 2.05, 8.5, 2.3, C.pigeon, C.ink, { k: 0.6, bars: C.pigeonD[1] }); }
    }
    out.push(p.done({ flag: fly ? F_NOCAST : 0 }));
  }
  return out;
}
// seagull, ~20 px span: 0 wings high, 1 wings up, 2 gliding level, 3 wings down
function seagull() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(30, 26, 15, 23), cx = 14, cy = 13;
    const far = [[-2.05, 10], [-2.4, 9], [-2.9, 7], [-3.05, 5]][f], near = [[-1.7, 11.5], [-2.0, 11], [2.95, 9.5], [2.2, 10.5]][f];
    wing(p, cx - 0.5, cy - 1, far[0], far[1], 2.1, C.gullW, C.ink, { k: 0.42, tipK: 0.68 });
    p.poly([[cx - 3, cy - 1.2], [cx - 7.5, cy - 0.6], [cx - 7.5, cy + 1], [cx - 3, cy + 1.2]], C.gull, { k: 0.6 });
    p.ell(cx, cy, 4.8, 2.4, C.gull, { k: 0.62, pat: (u, v) => (v > 0.4 ? -0.15 : 0) });
    p.ell(cx + 4.6, cy - 1.4, 1.9, 1.7, C.gull, { k: 0.7 });
    p.dot(cx + 5.2, cy - 1.9, C.ink[0]);
    p.line([cx + 6.2, cy - 1], [cx + 8.4, cy - 0.6], C.gold[2]); p.dot(cx + 8, cy - 0.1, C.gold[1]);
    wing(p, cx + 0.5, cy - 0.6, near[0], near[1], 2.3, C.gullW, C.ink, { k: 0.66, tipK: 0.68 });
    out.push(p.done({ flag: F_NOCAST }));
  }
  return out;
}
// heron, ~30 px tall standing: 0 standing, 1 crouched take-off, 2 wings up, 3 wings down
function heron() {
  const out = [];
  const neck = (p, pts, r) => { for (let i = 1; i < pts.length; i++) p.cap(pts[i - 1], pts[i], r, r * 0.9, C.heronL, { k: 0.6, pat: (t, s) => (s < -0.3 ? -0.2 : 0) }); };
  const headAt = (p, x, y) => {
    p.ell(x, y, 1.6, 1.3, C.heronL, { k: 0.72 });
    p.line([x - 0.6, y - 1], [x - 4.5, y - 0.4], C.ink[1]); p.dot(x - 5, y + 0.2, C.ink[0], { ol: false });
    p.dot(x + 0.4, y - 0.3, C.gold[2]);
    p.cap([x + 1.2, y + 0.1], [x + 6.2, y + 0.9], 0.75, 0.3, C.heronLeg, { k: 0.65 });
  };
  for (let f = 0; f < 4; f++) {
    const p = new Pen(44, 40, 20, 37), fx = 18;
    if (f === 0) {
      for (const [x0, x1] of [[fx - 1, fx - 1.6], [fx + 1, fx + 1.4]]) { p.line([x0, 24], [x1, 36.5], C.heronLeg[1], { ol: false }); p.dot(x1 + 1, 36.5, C.heronLeg[0], { ol: false }); }
      p.ell(fx - 1, 20.5, 5.2, 3.6, C.heron, { a: -0.45, pat: (u, v) => (v < -0.4 ? 0.15 : u < -0.6 ? -0.2 : 0) });
      p.ell(fx - 1.6, 21, 3.6, 2.2, C.heron, { a: -0.5, k: 0.38 });
      p.cap([fx + 2.6, 19.8], [fx + 2.6, 23.8], 1.6, 0.5, C.heronL, { k: 0.6 });                 // chest plumes
      neck(p, [[fx + 2.6, 18.2], [fx + 4.3, 14.8], [fx + 3.1, 11.6], [fx + 4.4, 9]], 1.25);
      headAt(p, fx + 5, 8);
    } else if (f === 1) {
      wing(p, fx - 1, 18, -2.0, 15, 3.5, C.heron, C.heronT, { k: 0.4 });
      for (const [kx, ky, ex] of [[fx + 1.6, 30, fx - 1], [fx + 3, 30.5, fx + 1.5]]) { p.cap([fx, 24], [kx, ky], 0.65, 0.6, C.heronLeg, { k: 0.4 }); p.cap([kx, ky], [ex, 36.5], 0.6, 0.6, C.heronLeg, { k: 0.4 }); }
      p.ell(fx, 22, 5.6, 3.4, C.heron, { a: -0.25 });
      neck(p, [[fx + 4, 20.5], [fx + 7, 18], [fx + 8.6, 16.5]], 1.2);
      headAt(p, fx + 9.4, 15.6);
      wing(p, fx + 1, 19.5, -1.65, 14, 3.8, C.heron, C.heronT, { k: 0.62 });
    } else {
      const up = f === 2, cy = 20;
      wing(p, fx - 1, cy - 1.5, up ? -2.05 : -2.95, up ? 15 : 9, 3.5, C.heron, C.heronT, { k: 0.4 });
      for (const dy of [0, 1.2]) p.cap([fx - 4, cy + 1 + dy], [fx - 16, cy + 3 + dy], 0.6, 0.5, C.heronLeg, { k: 0.45 });
      p.ell(fx - 0.5, cy, 6, 3.2, C.heron, { a: 0.05 });
      neck(p, [[fx + 4.6, cy - 1.4], [fx + 6.2, cy - 3.8], [fx + 4.4, cy - 5.2], [fx + 6.4, cy - 6.4]], 1.3);
      headAt(p, fx + 7.2, cy - 6.8);
      wing(p, fx + 1, cy - 0.6, up ? -1.7 : 2.2, up ? 16 : 14, 4, C.heron, C.heronT, { k: 0.62 });
    }
    out.push(p.done({ flag: f ? F_NOCAST : 0 }));
  }
  return out;
}

// ---- falling leaves, petals, motes, sparkles ---------------------------------------------------------------
const LEAF = [
  ['...o...', '.o.oo.o', '.ooOoo.', 'ooOooo.', '.ooooo.', '..ooo..', '...s...'],
  ['..o..', 'o.oo.', '.oOoo', '.ooo.', '..oo.', '...s.'],
  ['....o', '...oo', '..oO.', '.oo..', 's....'],
  ['...d...', 'd.dd.d.', '.dddd..', 'dddddd.', '.dddd..', '..dd...', '...s...'],
];
function mapleLeaf() {
  return LEAF.map((rows, f) => {
    const R = C.maple[f], p = new Pen(9, 10, 4.5, 9, 'flat');
    p.tpl(rows, { O: R[3], o: R[2], d: R[1], s: R[0] }, 1, 1, { n: [0, 0, 1] });
    return p.done({ flag: F_NOCAST, dark: 0.4 });
  });
}
function petal() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(9, 10, 4.5, 8, 'flat');
    p.ell(4.5, 4, 1.4 * [1, 0.55, 0.9, 0.7][f], 2.4, C.petal, { a: [0.5, -0.6, 1.4, 2.6][f], k: [0.65, 0.5, 0.7, 0.45][f], pat: (u, v) => (v < -0.85 && Math.abs(u) < 0.25 ? false : v > 0.5 ? -0.15 : 0) });
    out.push(p.done({ flag: F_NOCAST, dark: 0.45 }));
  }
  return out;
}
// golden dust motes drifting in a shaft of light, or white sparkles twinkling
function motes(white = false) {
  const out = [], rnd = mulberry32(white ? 71 : 37), pts = [];
  for (let i = 0; i < 9; i++) pts.push({ x: rnd() * 16 - 8, y: rnd() * 14 - 7, ph: rnd() * 4, big: rnd() < 0.35, v: 0.4 + rnd() * 0.6 });
  for (let f = 0; f < 4; f++) {
    const p = new Pen(21, 22, 10.5, 20, 'flat');
    for (const q of pts) {
      const tw = (Math.sin((f + q.ph) * Math.PI / 2) + 1) / 2;
      if (tw < 0.2) continue;
      const x = 10.5 + q.x + (white ? 0 : f * 0.4 * q.v), y = 9 + q.y - f * q.v * 0.6, c = white ? C.spark : C.mote, e = [c[0], c[1], c[2], Math.round(110 + tw * 140)];
      p.set(x, y, c, [0, 0, 1], { e, ol: false });
      if (q.big && tw > 0.6) for (const [dx, dy] of white ? [[1, 0], [-1, 0], [0, 1], [0, -1]] : [[1, 0]]) p.set(x + dx, y + dy, c.map((v) => v * 0.8), [0, 0, 1], { e: [c[0], c[1], c[2], 90 + tw * 60], ol: false });
    }
    out.push(p.done({ flag: F_NOCAST, outline: false }));
  }
  return out;
}

// ---- water: rain ripple, jumping trout ----------------------------------------------------------------------
const ring = (p, cx, cy, r, c, gap = 0) => { for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; if (gap && hash(i, Math.round(r), 5) < gap) continue; p.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.36, c, [0, 0, 1], { ground: true, flag: F_WATER }); } };
function ripple() {
  const out = [], W = C.water;
  for (let f = 0; f < 4; f++) {
    const p = new Pen(29, 18, 14.5, 13), cx = 14.5, cy = 13;
    if (f === 0) { p.line([cx, cy - 9], [cx, cy - 5], (t) => W[2 + Math.round(t * 2)], { e: [200, 230, 255, 60], ol: false }); ring(p, cx, cy, 1.6, W[3]); }
    if (f === 1) { for (const dx of [-1.2, 0, 1.2]) p.line([cx + dx * 0.4, cy], [cx + dx * 1.4, cy - (dx ? 2.6 : 3.8)], (t) => W[2 + Math.round(t * 2)], { ol: false }); p.set(cx, cy - 5.5, W[4], null, { e: [220, 240, 255, 120], ol: false }); ring(p, cx, cy, 3.2, W[3]); }
    if (f === 2) { ring(p, cx, cy, 6, W[3], 0.1); ring(p, cx, cy, 3, W[2]); }
    if (f === 3) { ring(p, cx, cy, 9.5, W[2], 0.35); ring(p, cx, cy, 5.5, W[2], 0.2); }
    out.push(p.done({ flag: F_NOCAST, outline: false }));
  }
  return out;
}
function trout(p, cx, cy, a) {
  p.poly([[-4.6, 0], [-7.2, -2.2], [-6.6, 0], [-7.2, 2.2]].map(([u, v]) => [cx + u * Math.cos(a) - v * Math.sin(a), cy + u * Math.sin(a) + v * Math.cos(a)]), C.trout, { k: 0.45 });
  p.ell(cx, cy, 5.2, 1.85, C.trout, { a, pat: (u, v, x, y) => (v > 0.4 ? C.troutB[2] : Math.abs(v - 0.05) < 0.28 ? C.troutS[2] : hash(x, y, 7) > 0.7 && v < 0 ? C.ink[1] : 0) });
  p.dot(cx + Math.cos(a) * 3.6 - Math.sin(a) * -0.4, cy + Math.sin(a) * 3.6 + Math.cos(a) * -0.4, C.ink[0]);
}
function fishJump() {
  const out = [], W = C.water;
  const pose = [[13, 22, -1.0], [17, 12, -0.15], [22, 17, 0.8], [25, 27, 1.35]];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(36, 36, 18, 31), [x, y, a] = pose[f];
    ring(p, f < 2 ? 12 : 25, 31, 2 + f * 1.4, W[3], 0.1); ring(p, f < 2 ? 12 : 25, 31, 5 + f * 1.4, W[2], 0.3);
    if (f < 3) trout(p, x, y, a);
    // splash crowns where it left / re-enters, and flying drops
    const sx = f < 2 ? 12 : 25, hgt = [5, 2.5, 3, 6][f];
    for (const dx of [-2, -1, 0, 1, 2]) p.line([sx + dx * 0.6, 31], [sx + dx * 1.3, 31 - hgt * (1 - Math.abs(dx) * 0.2)], (t) => W[2 + Math.round(t * 2)], { ol: false });
    for (let i = 0; i < 4 + f; i++) p.set(sx + (hash(i, f, 3) - 0.5) * 10, 31 - hgt - 1 - hash(i, f, 4) * 5, W[4], null, { e: [210, 236, 255, 90], ol: false });
    if (f === 3) { p.poly([[24.6, 25.5], [22.4, 22], [24.2, 23.4], [25.6, 21.6]], C.trout, { k: 0.45 }); }
    out.push(p.done({ flag: F_NOCAST }));
  }
  return out;
}

// ---- frog, squirrel, rabbit --------------------------------------------------------------------------------
// frog, ~8 px: 0 sitting, 1 springing, 2 in the air, 3 landing
function frog() {
  const out = [];
  const spots = (u, v, x, y) => (v > 0.45 ? C.frogB[2] : hash(x >> 1, y, 6) > 0.78 ? C.frogS[1] : 0);
  for (let f = 0; f < 4; f++) {
    const p = new Pen(18, 16, 8, 14), gy = 13.5;
    if (f === 0) {
      p.ell(6.4, gy - 1.4, 2.4, 1.3, C.frog, { k: 0.4, pat: spots });
      p.ell(7.8, gy - 3, 3.2, 2.3, C.frog, { a: -0.35, pat: spots });
      p.ell(10.4, gy - 4, 1.9, 1.5, C.frog, { pat: spots });
      p.cap([10.2, gy - 2], [10.8, gy], 0.6, 0.6, C.frog, { k: 0.5 });
      p.ell(9.9, gy - 5.3, 0.9, 0.9, C.frog, { k: 0.75 }); p.dot(10.2, gy - 5.4, C.ink[0]);
      p.ell(7.2, gy - 0.3, 2.8, 0.5, C.frog, { k: 0.4 });
    } else {
      const lift = [0, 2.5, 4.5, 1][f], a = [0, -0.55, -0.1, 0.45][f], cx = [0, 7.5, 8.5, 9][f], cy = gy - 3 - lift;
      // hind legs: f1 pushing down-back, f2 trailing, f3 folding in
      const hl = [null, [[cx - 2.5, cy + 0.8], [cx - 5, cy + 2.5], [cx - 6.5, gy]], [[cx - 2.8, cy + 0.4], [cx - 5.5, cy + 0.6], [cx - 8, cy + 1.2]], [[cx - 2.5, cy + 0.6], [cx - 4.5, cy + 2], [cx - 3, gy - 0.3]]][f];
      p.cap(hl[0], hl[1], 1, 0.7, C.frog, { k: 0.45 }); p.cap(hl[1], hl[2], 0.6, 0.6, C.frog, { k: 0.45 });
      p.ell(cx, cy, 3.4, 1.9, C.frog, { a, pat: spots });
      const hx = cx + Math.cos(a) * 3.2, hy = cy + Math.sin(a) * 3.2 - 0.4;
      p.ell(hx, hy, 1.8, 1.4, C.frog, { a, pat: spots });
      p.ell(hx - 0.3, hy - 1.3, 0.9, 0.9, C.frog, { k: 0.75 }); p.dot(hx, hy - 1.4, C.ink[0]);
      const fl = f === 3 ? [hx + 1, gy] : f === 1 ? [hx + 1.8, hy + 1.8] : [hx + 1.4, hy + 2.4];
      p.cap([hx - 0.5, hy + 0.8], fl, 0.55, 0.5, C.frog, { k: 0.5 });
    }
    out.push(p.done({ flag: 0 }));
  }
  return out;
}
// squirrel climbing up a trunk (anchor = the trunk's foot below it), 4 frames of a scamper
function squirrel() {
  const out = [];
  for (let f = 0; f < 4; f++) {
    const p = new Pen(16, 22, 9, 20), cx = 9, cy = 9 - (f % 2) * 0.8, ph = f % 2 ? 1 : -1;
    // the bushy tail curls out to the left and down
    for (let i = 0; i < 7; i++) { const t = i / 6, a = 1.9 + t * 1.6 + (f === 2 ? 0.15 : 0); p.ell(cx - 2 + Math.cos(a) * (1 + t * 3.8) - t * 1.4, cy + 4 + Math.sin(a) * (1 + t * 2) - t * 3.5 + 3, 1.5 + Math.sin(t * Math.PI) * 1.1, 1.6 + Math.sin(t * Math.PI) * 0.9, C.squirrel, { k: 0.45 + t * 0.1, pat: (u, v, x, y) => (hash(x, y, 8) > 0.82 ? 0.3 : 0) }); }
    for (const [sx, sy] of [[-1, 0], [1, 0]]) p.cap([cx + sx * 1.4, cy + 4.5], [cx + sx * 2.6, cy + 6 + ph * sx * 1], 0.7, 0.6, C.squirrel, { k: 0.4 });
    p.ell(cx, cy + 2.5, 1.9, 3.2, C.squirrel, { pat: (u) => (u > 0.45 ? -0.15 : 0) });
    for (const [sx, sy] of [[-1, 0], [1, 0]]) p.cap([cx + sx * 1.2, cy + 0.5], [cx + sx * 2.5, cy - 0.6 - ph * sx * 1], 0.55, 0.5, C.squirrel, { k: 0.45 });
    p.ell(cx + 0.2, cy - 1.6, 1.6, 1.7, C.squirrel, { k: 0.62 });
    p.dot(cx - 1, cy - 3.6, C.squirrel[2]); p.dot(cx + 1.4, cy - 3.6, C.squirrel[2]);
    p.dot(cx + 1, cy - 1.8, C.ink[0]); p.dot(cx + 0.3, cy - 3.1, C.squirrel[4], { ol: false });
    out.push(p.done({ flag: 0, z0: 0 }));
  }
  return out;
}
// rabbit, ~16 px long: 0 crouched, 1 pushing off, 2 in the air, 3 landing
function rabbit() {
  const out = [];
  const fur = (u, v, x, y) => (v > 0.5 ? C.rabbitL[2] : hash(x, y, 5) > 0.86 ? -0.25 : 0);
  for (let f = 0; f < 4; f++) {
    const p = new Pen(26, 20, 12, 17), gy = 16.5;
    const lift = [0, 1.2, 3.2, 0.8][f], a = [0, -0.22, -0.06, 0.28][f], len = [5, 6.4, 7, 6][f], cx = [11, 11.5, 12, 12.5][f], cy = gy - 4.4 - lift;
    const ea = [-2.2, -2.5, -2.75, -2.1][f];
    // far ear, hind legs, body, near ear, head
    const hx = cx + Math.cos(a) * (len - 0.8), hy = cy + Math.sin(a) * (len - 0.8) - 1.6;
    p.cap([hx - 0.6, hy - 1.2], [hx - 0.6 + Math.cos(ea + 0.25) * 5.4, hy - 1.2 + Math.sin(ea + 0.25) * 5.4], 0.9, 0.7, C.rabbit, { k: 0.35 });
    const hip = [cx - Math.cos(a) * 3.6, cy - Math.sin(a) * 3.6 + 0.6];
    const hind = [[hip[0] + 1.2, gy - 0.6], [hip[0] - 4.6, gy - 0.5], [hip[0] - 5.4, hip[1] + 1.4], [hip[0] + 2.6, gy - 0.5]][f];
    if (f !== 0) p.cap(hip, hind, 1.6, 0.8, C.rabbit, { k: 0.42 });
    p.ell(cx, cy, len, 3.5, C.rabbit, { a, pat: fur });
    if (f === 0) { p.ell(hip[0] + 0.6, gy - 2.2, 3, 2.4, C.rabbit, { k: 0.5, pat: fur }); p.ell(hip[0] + 1.5, gy - 0.4, 3, 0.8, C.rabbit, { k: 0.45 }); }
    const fore = [[hx + 0.6, gy - 0.3], [hx + 2.4, hy + 3.6], [hx + 3.4, hy + 3.2], [hx + 1.4, gy - 0.3]][f];
    p.cap([hx - 1.4, hy + 2.4], fore, 0.8, 0.6, C.rabbit, { k: 0.5 });
    p.ell(cx - Math.cos(a) * (len + 0.4), cy - Math.sin(a) * (len + 0.4) - 1.2, 1.4, 1.3, C.white, { k: 0.75 });
    p.ell(hx + 0.8, hy, 2.6, 2.1, C.rabbit, { k: 0.62, pat: fur });
    p.cap([hx + 0.2, hy - 1.3], [hx + 0.2 + Math.cos(ea) * 5.8, hy - 1.3 + Math.sin(ea) * 5.8], 0.95, 0.75, C.rabbit, { k: 0.6, pat: (t, s) => (s > 0.2 && t > 0.2 && t < 0.85 ? C.rabbitL[1] : 0) });
    p.dot(hx + 1.6, hy - 0.6, C.ink[0]); p.dot(hx + 3.2, hy + 0.3, C.foot[1]);
    out.push(p.done({ flag: 0 }));
  }
  return out;
}

// ---- the flock bursting out of a tree --------------------------------------------------------------------
// n sparrows hidden in a crown (centre `crownH` px up) burst out and scatter upward over 6 frames.
// Anchor = the tree's foot; draw the tree first. Birds carry F_NOCAST.
export function flockBurst(seed = 1, n = 11, crownH = 30) {
  const rnd = mulberry32(seed * 977 + 13), SP = critterFrames('sparrow'), SPL = critterFrames('sparrow', true), birds = [], out = [];
  for (let i = 0; i < n; i++) { const a = Math.PI * (0.1 + 0.8 * rnd()); birds.push({ x: (rnd() - 0.5) * 18, h: crownH + (rnd() - 0.2) * 8, a, sp: 5.5 + rnd() * 5.5, ap: Math.min(4, Math.floor(i * 5 / n)), ph: i }); }
  for (let f = 0; f < 6; f++) {
    const G = new GBuf(130, 120); G.ax = 65; G.ay = 116;
    for (const b of birds) {
      if (f < b.ap) continue;
      const t = f - b.ap + 0.5, x = b.x + Math.cos(b.a) * b.sp * t, h = b.h + Math.sin(b.a) * b.sp * t * 0.75 + t * 2.5;
      const set = Math.cos(b.a) >= 0 ? SP : SPL, fr = set[1 + (f + b.ph) % 3];
      G.blit(fr, Math.round(G.ax + x - fr.ax), Math.round(G.ay - h - fr.ay), Math.round(h));
    }
    out.push(G);
  }
  return out;
}

// ---- soft ground shadow ------------------------------------------------------------------------------------
export function shadowBlob(r = 3) {
  const key = 'shadow|' + r;
  let G = CACHE.get(key);
  if (G) return G;
  const rx = r, ry = Math.max(1, r * 0.42), w = Math.ceil(rx * 2 + 2), h = Math.ceil(ry * 2 + 2);
  G = new GBuf(w, h); G.ax = w / 2; G.ay = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / rx, (y + 0.5 - h / 2) / ry);
    if (d > 1) continue;
    G.put(x, y, [14, 12, 22], [0, 0, 1], 0, null, F_GROUND | F_NOCAST, Math.round(d < 0.6 ? 96 : 60));
  }
  CACHE.set(key, G);
  return G;
}

// ---- catalog --------------------------------------------------------------------------------------------
// make: frames; fps; move: behaviour in CritterPool; fly: airborne (alt [min, max] px); shadow radius;
// speed px/s; range px it wanders from home; ground [frames] / air [frames] for walkers and waders;
// hop [seconds, px] per leap (hoppers draw the leap's height into their frames, so h stays 0).
export const CRITTERS = {
  monarch: { make: () => butterfly('monarch'), frames: 4, fps: 12, move: 'flutter', fly: 1, alt: [8, 26], shadow: 3, speed: 16, range: 50 },
  blueWing: { make: () => butterfly('blue'), frames: 4, fps: 13, move: 'flutter', fly: 1, alt: [6, 22], shadow: 3, speed: 18, range: 44 },
  sulphur: { make: () => butterfly('sulphur'), frames: 4, fps: 12, move: 'flutter', fly: 1, alt: [8, 24], shadow: 3, speed: 17, range: 50 },
  dragonfly: { make: dragonfly, frames: 4, fps: 24, move: 'dart', fly: 1, alt: [10, 22], shadow: 3, speed: 70, range: 60 },
  bee: { make: bee, frames: 4, fps: 24, move: 'flutter', fly: 1, alt: [4, 16], shadow: 2, speed: 22, range: 30 },
  firefly: { make: firefly, frames: 4, fps: 5, move: 'drift', fly: 1, alt: [6, 30], shadow: 0, speed: 6, range: 40, glow: [0.84, 1, 0.38] },
  sparrow: { make: sparrow, frames: 4, fps: 14, move: 'flock', fly: 1, alt: [20, 70], shadow: 2, speed: 60, range: 120, ground: [0], air: [1, 3] },
  pigeon: { make: pigeon, frames: 5, fps: 10, move: 'walker', fly: 1, alt: [30, 60], shadow: 4, speed: 55, range: 160, ground: [0], takeoff: 1, air: [2, 4] },
  seagull: { make: seagull, frames: 4, fps: 6, move: 'glide', fly: 1, alt: [60, 110], shadow: 6, speed: 38, range: 110, glide: 2 },
  heron: { make: heron, frames: 4, fps: 4, move: 'walker', fly: 1, alt: [40, 80], shadow: 7, speed: 40, range: 260, ground: [0], takeoff: 1, air: [2, 3] },
  mapleLeaf: { make: mapleLeaf, frames: 4, fps: 6, move: 'fall', fly: 1, alt: [30, 60], shadow: 2, speed: 9, life: 6 },
  petal: { make: petal, frames: 4, fps: 6, move: 'fall', fly: 1, alt: [24, 50], shadow: 1, speed: 7, life: 5 },
  motes: { make: () => motes(false), frames: 4, fps: 4, move: 'float', fly: 1, alt: [10, 24], shadow: 0, speed: 3, life: 8, glow: [1, 0.84, 0.47] },
  sparkles: { make: () => motes(true), frames: 4, fps: 6, move: 'float', fly: 1, alt: [6, 18], shadow: 0, speed: 2, life: 3, glow: [0.94, 0.96, 1] },
  ripple: { make: ripple, frames: 4, fps: 10, move: 'once', shadow: 0 },
  fish: { make: fishJump, frames: 4, fps: 8, move: 'jump', shadow: 0, range: 40 },
  frog: { make: frog, frames: 4, fps: 10, move: 'hop', shadow: 3, speed: 30, range: 30, hop: [0.4, 16] },
  squirrel: { make: squirrel, frames: 4, fps: 12, move: 'climb', shadow: 0, speed: 26, range: 70 },
  rabbit: { make: rabbit, frames: 4, fps: 10, move: 'hop', shadow: 5, speed: 50, range: 60, hop: [0.36, 22] },
};
export const CRITTER_KINDS = Object.keys(CRITTERS);

const CACHE = new Map();
export function critterFrames(kind, left = false) {
  const key = kind + (left ? '<' : '>');
  let fr = CACHE.get(key);
  if (!fr) {
    if (left) fr = critterFrames(kind).map(mirror);
    else fr = CRITTERS[kind].make().map((g) => trim(g, 0));
    CACHE.set(key, fr);
  }
  return fr;
}

// ---- the pool ----------------------------------------------------------------------------------------------
// A fixed set of creature slots, allocated once (no garbage per frame). Each slot: kind, x, y (ground
// point), h (height above it), face (1 east, -1 west), frame, vis. Behaviours by CRITTERS[kind].move:
//   flutter  wander round home on a bobbing path        dart    hover, then zip to a new spot
//   drift    slow wander, lantern pulsing                 glide   circle home high up, flap then soar
//   walker   stand / shuffle; startled -> take off, fly away, come back and land
//   flock    hidden in a crown (spawn with opt.n birds); startled -> burst out, scatter, return
//   hop      sit, hop about home; startled -> bound away     climb  scamper up the trunk, vanish in the crown
//   fall     drift down swaying, lie on the ground, fade      float  hang in the air twinkling, fade
//   once     play the frames once                             jump   a fish leaping now and then near home
// forEach(fn) calls fn(slot, frame, shadow) for every visible creature: draw the shadow (if any) at
// (x - shadow.ax, y - shadow.ay) and the frame at (x - frame.ax, y - h - frame.ay).
const ST_IDLE = 0, ST_MOVE = 1, ST_FLEE = 2, ST_BACK = 3, ST_HIDE = 4, ST_DOWN = 5;
export class CritterPool {
  constructor(n = 64, seed = 1) {
    this.slots = [];
    for (let i = 0; i < n; i++) this.slots.push({ on: false, kind: '', d: null, x: 0, y: 0, h: 0, vx: 0, vy: 0, vh: 0, hx: 0, hy: 0, hh: 0, tx: 0, ty: 0, face: 1, t: 0, ft: 0, frame: 0, st: 0, tm: 0, ph: 0, life: 0, vis: true, born: 0 });
    this.r = (seed * 2654435761) >>> 0 || 1; this.clock = 0;
  }
  rnd() { this.r = (this.r * 1664525 + 1013904223) >>> 0; return this.r / 4294967296; }
  slot() {
    let s = null, old = null;
    for (const c of this.slots) { if (!c.on) { s = c; break; } if (!old || c.born < old.born) old = c; }
    return s || old;
  }
  // opt: h (start height / crown height), n (flock size), life (s), face
  spawn(kind, x, y, opt = {}) {
    const d = CRITTERS[kind]; if (!d) return null;
    const n = d.move === 'flock' ? opt.n ?? 8 : 1;
    let first = null;
    for (let i = 0; i < n; i++) {
      const s = this.slot(); if (!first) first = s;
      critterFrames(kind); critterFrames(kind, true);
      s.on = true; s.kind = kind; s.d = d; s.x = s.hx = x; s.y = s.hy = y; s.vx = s.vy = s.vh = 0; s.t = 0; s.ft = this.rnd() * 2; s.frame = 0;
      s.face = opt.face ?? (this.rnd() < 0.5 ? -1 : 1); s.ph = this.rnd() * TAU; s.vis = true; s.born = this.clock++; s.tm = 0.5 + this.rnd() * 2;
      s.life = opt.life ?? d.life ?? 0; s.st = ST_IDLE;
      const alt = d.alt ? d.alt[0] + this.rnd() * (d.alt[1] - d.alt[0]) : 0;
      s.h = s.hh = opt.h ?? (d.move === 'fall' || d.move === 'float' || d.move === 'flutter' || d.move === 'dart' || d.move === 'drift' || d.move === 'glide' ? alt : 0);
      if (d.move === 'flock') { s.x = s.hx = x + (this.rnd() - 0.5) * 16; s.h = s.hh = (opt.h ?? 30) + (this.rnd() - 0.3) * 8; s.st = ST_HIDE; s.vis = false; }
      if (d.move === 'flutter' || d.move === 'drift' || d.move === 'dart') this.pick(s);
      if (d.move === 'climb') { s.h = 0; s.st = ST_MOVE; }
    }
    return first;
  }
  pick(s, far = 0) {
    const a = this.rnd() * TAU, r = (far || s.d.range || 30) * Math.sqrt(this.rnd());
    s.tx = s.hx + Math.cos(a) * r; s.ty = s.hy + Math.sin(a) * r * 0.7;
  }
  // something big came near (x, y): everything within r reacts
  startle(x, y, r = 60) {
    for (const s of this.slots) {
      if (!s.on) continue;
      const dx = s.x - x, dy = s.y - y, d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const D = s.d, d = Math.sqrt(d2) || 1, ux = dx / d, uy = dy / d, m = D.move;
      if (m === 'flock' && (s.st === ST_HIDE || s.st === ST_BACK)) {
        const a = Math.PI * (0.1 + 0.8 * this.rnd()), sp = D.speed * (0.7 + this.rnd() * 0.6);
        s.st = ST_FLEE; s.vis = true; s.vx = Math.cos(a) * sp + ux * 20; s.vy = uy * 10 + (this.rnd() - 0.5) * 20; s.vh = Math.sin(a) * sp * 0.8; s.tm = 2 + this.rnd() * 2.5;
      } else if (m === 'walker' && (s.st === ST_IDLE || s.st === ST_MOVE || s.st === ST_DOWN)) {
        s.st = ST_FLEE; s.vx = ux * D.speed; s.vy = uy * D.speed * 0.7; s.vh = 26; s.tm = 3 + this.rnd() * 3; s.t = 0;
      } else if (m === 'hop' && s.st !== ST_FLEE) { s.st = ST_FLEE; s.tx = s.x + ux * r * 1.6; s.ty = s.y + uy * r * 1.6; s.tm = 0; s.t = 0; }
      else if (m === 'flutter' || m === 'drift' || m === 'dart') { s.hx = s.x + ux * r * 1.5; s.hy = s.y + uy * r * 1.5; s.tx = s.hx; s.ty = s.hy; s.tm = 1.2; s.st = ST_FLEE; }
      else if (m === 'climb' && s.st !== ST_HIDE) { s.st = ST_FLEE; }
    }
  }
  steer(s, sp, dt) {
    const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    const k = Math.min(1, sp * dt / d);
    s.x += dx * k; s.y += dy * k;
    if (Math.abs(dx) > 0.5) s.face = dx > 0 ? 1 : -1;
    return d < 2;
  }
  anim(s, dt, a, b) { s.ft += dt * s.d.fps; s.frame = a + Math.floor(s.ft) % (b - a + 1); }
  update(dt) {
    for (const s of this.slots) {
      if (!s.on) continue;
      const D = s.d, m = D.move;
      s.t += dt;
      if (s.life && (m === 'fall' || m === 'float') && s.t > s.life) { s.on = false; continue; }
      if (m === 'flutter' || m === 'drift') {
        const sp = D.speed * (s.st === ST_FLEE ? 2.6 : 1);
        if (this.steer(s, sp, dt)) { this.pick(s); if (s.st === ST_FLEE) s.st = ST_MOVE; }
        if (s.st === ST_FLEE && (s.tm -= dt) <= 0) s.st = ST_MOVE;
        s.h = s.hh + Math.sin(s.t * (m === 'drift' ? 0.9 : 4.2) + s.ph) * (m === 'drift' ? 4 : 3);
        this.anim(s, dt, 0, 3);
      } else if (m === 'dart') {
        if (s.st === ST_IDLE) { s.tm -= dt; s.x += Math.sin(s.t * 9 + s.ph) * 0.15; if (s.tm <= 0) { s.st = ST_MOVE; this.pick(s); } }
        else if (this.steer(s, D.speed * (s.st === ST_FLEE ? 1.6 : 1), dt)) { s.st = ST_IDLE; s.tm = 0.6 + this.rnd() * 1.2; }
        s.h = s.hh + Math.sin(s.t * 2 + s.ph) * 1.5;
        this.anim(s, dt, 0, 3);
      } else if (m === 'glide') {
        const R = D.range, w = D.speed / R;
        s.ph += w * dt;
        const nx = s.hx + Math.cos(s.ph) * R, ny = s.hy + Math.sin(s.ph) * R * 0.6;
        s.face = nx >= s.x ? 1 : -1; s.x = nx; s.y = ny; s.h = s.hh + Math.sin(s.t * 0.5) * 8;
        // flap for a while, then soar on level wings
        const cyc = (s.t + s.ph * 3) % 5;
        if (cyc < 1.4) this.anim(s, dt, 0, 3); else s.frame = D.glide;
      } else if (m === 'walker') {
        if (s.st === ST_IDLE) {
          s.frame = D.ground[0];
          if ((s.tm -= dt) <= 0) { s.st = ST_MOVE; this.pick(s, 12); s.tm = 1 + this.rnd() * 3; }
        } else if (s.st === ST_MOVE) {
          s.frame = D.ground[0];
          if (this.steer(s, D.speed * 0.12, dt)) s.st = ST_IDLE;
        } else if (s.st === ST_FLEE) {
          s.x += s.vx * dt; s.y += s.vy * dt; s.h = Math.min(D.alt[1], s.h + s.vh * dt);
          if (s.vx) s.face = s.vx > 0 ? 1 : -1;
          if (s.t < 0.18) s.frame = D.takeoff; else this.anim(s, dt, D.air[0], D.air[1]);
          if ((s.tm -= dt) <= 0) { s.st = ST_BACK; s.tx = s.hx + (this.rnd() - 0.5) * 30; s.ty = s.hy + (this.rnd() - 0.5) * 20; }
        } else if (s.st === ST_BACK) {
          const arrived = this.steer(s, D.speed * 0.8, dt), d = Math.hypot(s.tx - s.x, s.ty - s.y);
          s.h = Math.max(0, Math.min(s.h, d * 0.35));
          this.anim(s, dt, D.air[0], D.air[1]);
          if (arrived || (s.h <= 0.5 && d < 4)) { s.st = ST_IDLE; s.h = 0; s.tm = 1 + this.rnd() * 3; }
        }
      } else if (m === 'flock') {
        if (s.st === ST_FLEE) {
          s.x += s.vx * dt; s.y += s.vy * dt; s.h = Math.min(D.alt[1], s.h + s.vh * dt); s.vh *= 1 - dt * 0.4;
          if (Math.abs(s.vx) > 1) s.face = s.vx > 0 ? 1 : -1;
          this.anim(s, dt, D.air[0], D.air[1]);
          if ((s.tm -= dt) <= 0) { s.st = ST_BACK; s.tx = s.hx; s.ty = s.hy; }
        } else if (s.st === ST_BACK) {
          const arrived = this.steer(s, D.speed * 0.7, dt);
          s.h += (s.hh - s.h) * Math.min(1, dt * 1.5);
          this.anim(s, dt, D.air[0], D.air[1]);
          if (arrived) { s.st = ST_HIDE; s.vis = false; s.h = s.hh; }
        }
      } else if (m === 'hop') {
        const [T, dist] = D.hop;          // the leap's height is drawn into the frames
        if (s.st === ST_IDLE) {
          s.frame = 0; s.h = 0;
          if ((s.tm -= dt) <= 0) { s.st = ST_MOVE; s.t = 0; const a = this.rnd() * TAU, toHome = Math.hypot(s.hx - s.x, s.hy - s.y) > D.range; s.vx = toHome ? (s.hx - s.x) : Math.cos(a); s.vy = toHome ? (s.hy - s.y) : Math.sin(a) * 0.6; const l = Math.hypot(s.vx, s.vy) || 1; s.vx /= l; s.vy /= l; if (Math.abs(s.vx) > 0.1) s.face = s.vx > 0 ? 1 : -1; }
        } else {
          // a hop: f1 push-off, f2 airborne, f3 landing; fleeing chains hops toward (tx, ty)
          const flee = s.st === ST_FLEE;
          if (flee && s.tm === 0) { s.tm = 1; s.vx = s.tx - s.x; s.vy = s.ty - s.y; const l = Math.hypot(s.vx, s.vy) || 1; s.vx /= l; s.vy /= l; s.face = s.vx >= 0 ? 1 : -1; }
          const p = s.t / T, sp = dist / T * (flee ? 1.3 : 1);
          s.x += s.vx * sp * dt; s.y += s.vy * sp * dt;
          s.frame = p < 0.25 ? 1 : p < 0.75 ? 2 : 3;
          if (p >= 1) {
            s.h = 0; s.t = 0;
            if (flee && Math.hypot(s.tx - s.x, s.ty - s.y) > dist) { s.tm = 0; continue; }
            s.st = ST_IDLE; s.tm = flee ? 0.6 : 0.8 + this.rnd() * 3; s.hx = flee ? s.x : s.hx; s.hy = flee ? s.y : s.hy;
          }
        }
      } else if (m === 'climb') {
        if (s.st === ST_MOVE || s.st === ST_FLEE) {
          s.h += D.speed * (s.st === ST_FLEE ? 2.2 : 1) * dt; this.anim(s, dt * (s.st === ST_FLEE ? 2 : 1), 0, 3);
          if (s.h >= D.range) { s.st = ST_HIDE; s.vis = false; s.tm = 4 + this.rnd() * 6; }
        } else if (s.st === ST_HIDE) { if ((s.tm -= dt) <= 0) { s.st = ST_DOWN; s.vis = true; } }
        else if (s.st === ST_DOWN) {
          s.h -= D.speed * 0.8 * dt; this.anim(s, dt, 0, 3);
          if (s.h <= 0) { s.h = 0; s.st = ST_MOVE; }
        }
      } else if (m === 'fall') {
        if (s.h > 0) {
          s.h = Math.max(0, s.h - D.speed * dt); s.x += Math.sin(s.t * 1.7 + s.ph) * 10 * dt + 3 * dt; s.y += Math.cos(s.t * 1.3 + s.ph) * 2 * dt;
          this.anim(s, dt, 0, 3);
        } else s.vis = s.t < s.life - 0.5 || (s.t * 8 | 0) % 2 === 0;
      } else if (m === 'float') {
        s.h = s.hh + Math.sin(s.t * 0.7 + s.ph) * 2; s.x += Math.sin(s.t * 0.4 + s.ph) * D.speed * dt;
        this.anim(s, dt, 0, 3);
      } else if (m === 'once') {
        s.frame = Math.floor(s.t * D.fps);
        if (s.frame >= D.frames) s.on = false;
      } else if (m === 'jump') {
        if (s.st === ST_HIDE) { s.vis = false; if ((s.tm -= dt) <= 0) { s.st = ST_MOVE; s.vis = true; s.t = 0; s.x = s.hx + (this.rnd() - 0.5) * D.range; s.y = s.hy + (this.rnd() - 0.5) * D.range * 0.5; s.face = this.rnd() < 0.5 ? -1 : 1; } }
        else { s.frame = Math.floor(s.t * D.fps); if (s.frame >= D.frames) { s.frame = D.frames - 1; s.st = ST_HIDE; s.tm = 2 + this.rnd() * 6; } }
      }
    }
  }
  forEach(fn) {
    for (const s of this.slots) {
      if (!s.on || !s.vis) continue;
      const fr = critterFrames(s.kind, s.face < 0)[s.frame], d = s.d;
      fn(s, fr, d.shadow && (d.fly || d.move === 'hop') ? shadowBlob(d.shadow) : null);
    }
  }
  kill(s) { s.on = false; }
  clear() { for (const s of this.slots) s.on = false; }
  get live() { let n = 0; for (const s of this.slots) if (s.on) n++; return n; }
}
