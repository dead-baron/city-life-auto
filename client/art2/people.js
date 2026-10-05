// Art v2 people: 3/4-view characters about 42 px tall (about 3.4 heads - a little big-headed and
// readable, like the targets), built from parts so outfits, hair, builds and skin tones combine
// freely. Eight facings (S, SE, E, NE, N painted; SW, W, NW mirrored) and a 4-frame walk. Each part
// is shaded in its own ramp (lit on the left, dark creases where parts meet) and normals come from the
// silhouette, so the renderer lights them like everything else.
//
// person(app, dir, pose, frame) -> GBuf (anchor .ax/.ay at the feet)
//   app: { skin 0-4, hair: {style, color 0-5}, top: {kind, color, color2, inner}, bottom: {kind, color},
//          shoes, hat: {kind, color}, build: 0 slim | 1 average | 2 heavy, h: -2..2, fem: bool,
//          carry: 'briefcase' | 'bag' | 'board' | null, glasses: bool }
//   dir: 0 S, 1 SE, 2 E, 3 NE, 4 N, 5 NW, 6 W, 7 SW      pose: 'idle' | 'walk'
import { GBuf, F_CHAR, hash, bayer } from './gbuf.js';
import { MAT } from './palette.js';

const W = 30, H = 52, FOOT = 49;
const cloth = (c) => (Array.isArray(c) ? c : MAT.cloth[c] || MAT.cloth.grey);

export function person(app, dir = 0, pose = 'idle', frame = 0) {
  const mirror = dir >= 5;
  const d = mirror ? 8 - dir : dir;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = FOOT;
  draw(G, app, d, pose, frame);
  if (mirror) flipX(G);
  G.outline(0.34, true);
  G.autoNormals([0, 0.42, 0.9], 4);
  for (let i = 0; i < G.flag.length; i++) if (G.col[i * 4 + 3]) { G.flag[i] |= F_CHAR; G.z[i] = Math.max(1, FOOT - Math.floor(i / W)); }
  return G;
}

function flipX(G) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w >> 1; x++) {
    const a = y * G.w + x, b = y * G.w + (G.w - 1 - x);
    for (const arr of [G.col, G.nrm, G.emi]) for (let c = 0; c < 4; c++) { const t = arr[a * 4 + c]; arr[a * 4 + c] = arr[b * 4 + c]; arr[b * 4 + c] = t; }
    const tz = G.z[a]; G.z[a] = G.z[b]; G.z[b] = tz; const tf = G.flag[a]; G.flag[a] = G.flag[b]; G.flag[b] = tf;
  }
}

// a layer canvas we paint into first (so later parts cover earlier ones), then copy into the G-buffer
class Lay {
  constructor() { this.c = new Array(W * H).fill(null); }
  set(x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && col) this.c[y * W + x] = col; }
  get(x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H ? this.c[y * W + x] : null; }
}
// fill a span of a ramp: lit on the left, base in the middle, shade on the right
function span(L, R, x0, x1, y, opt = {}) {
  const n = x1 - x0 + 1;
  for (let x = x0; x <= x1; x++) {
    const u = n <= 1 ? 0.5 : (x - x0) / (n - 1);
    let k = 2;
    if (u < 0.25) k = 3; else if (u > 0.78) k = 1;
    if (opt.edgeDark && x === x1 && n > 3) k = 0;
    if (opt.darkR && x === x1) k = 0;
    if (opt.darkL && x === x0) k = Math.min(k, 1);
    if (opt.lift) k = Math.min(4, k + opt.lift);
    if (opt.drop) k = Math.max(0, k - opt.drop);
    L.set(x, y, R[k]);
  }
}

function draw(G, A, d, pose, frame) {
  const L = new Lay();
  const cx = 15;
  const tall = A.h || 0, build = A.build ?? 1, fem = !!A.fem;
  const skin = MAT.skin[A.skin ?? 1], hairR = MAT.hair[A.hair?.color ?? 0];
  const top = cloth(A.top?.color || 'white'), top2 = cloth(A.top?.color2 || 'grey'), inner = cloth(A.top?.inner || 'white');
  const bot = cloth(A.bottom?.color || 'denim'), shoe = cloth(A.shoes || 'white');
  const tk = A.top?.kind || 'tee', bk = A.bottom?.kind || 'pants';
  const side = d === 2, back = d >= 3, q3 = d === 1 || d === 3;
  const walking = pose === 'walk', ph = walking ? frame % 4 : 0;
  const stride = walking ? [1, 0, -1, 0][ph] : 0, bob = walking && (ph === 1 || ph === 3) ? -1 : 0;
  // proportions
  const headH = 12, headW = side ? 10 : 11;
  const headTop = 4 - tall + bob;
  const shY = headTop + headH + 1, hipY = shY + 12 + (build === 2 ? 1 : 0), footY = FOOT - 1;
  const shHalf = (fem ? 5 : build === 2 ? 7 : build === 0 ? 5 : 6) - (side ? 2 : q3 ? 1 : 0);
  const hipHalf = (fem ? 5 : build === 2 ? 6 : 4) - (side ? 1 : 0);
  // ---------------- legs
  const pant = (y) => (bk === 'shorts' && y > hipY + 5) || (bk === 'skirt' && y > hipY + 7) ? skin : bot;
  if (side) {
    for (const [off, far] of [[-stride * 3, true], [stride * 3, false]]) {
      for (let y = hipY; y < footY - 2; y++) {
        const t = (y - hipY) / (footY - 2 - hipY), x0 = cx - 2 + Math.round(off * t);
        span(L, pant(y), x0, x0 + 3, y, { drop: far ? 1 : 0 });
      }
      const sx = cx - 2 + off;
      for (let x = 0; x < 6; x++) { L.set(sx + x - 1, footY - 2, shoe[far ? 1 : 2]); L.set(sx + x - 1, footY - 1, shoe[far ? 0 : 1]); }
      L.set(sx + 4, footY - 3, shoe[2]);
    }
  } else {
    const gap = q3 ? 0 : 1;
    const lx = [cx - hipHalf, cx + gap];
    const lw = hipHalf - (gap ? 0 : 0);
    [0, 1].forEach((i) => {
      const lift = (i === 0 ? stride > 0 : stride < 0) ? 2 : 0;
      const shade = (d === 1 && i === 0) || (d === 3 && i === 1) ? 1 : 0;
      for (let y = hipY; y < footY - 2 - lift; y++) span(L, pant(y), lx[i], lx[i] + lw - 1, y, { drop: shade });
      for (let x = -1; x < lw + 1; x++) { L.set(lx[i] + x, footY - 2 - lift, shoe[2]); L.set(lx[i] + x, footY - 1 - lift, shoe[1]); }
      if (!back) L.set(lx[i] + 1, footY - 2 - lift, shoe[4]);
    });
  }
  // skirt / dress
  if (bk === 'skirt' || tk === 'dress') {
    const R = tk === 'dress' ? top : bot;
    for (let y = hipY - 1; y < hipY + 8; y++) { const h = (side ? 3 : hipHalf) + 1 + Math.floor((y - hipY + 1) / 3); span(L, R, cx - h + (side ? 0 : 0), cx + h - 1, y, { edgeDark: true }); }
  }
  // ---------------- arms
  const swing = walking ? stride * 2 : 0;
  const sleeve = tk === 'tank' || tk === 'dress' ? 0 : tk === 'tee' || tk === 'polo' || tk === 'uniform' ? 4 : 11;
  const armLen = 11;
  const arm = (ax, dx, far, innerSide = 0) => {
    for (let k = 0; k < armLen; k++) {
      const X = ax + Math.round(k / armLen * dx), Y = shY + 1 + k;
      const R = k < sleeve ? top : skin;
      span(L, R, X, X + 2, Y, { drop: far ? 1 : 0, darkR: innerSide > 0 && k < sleeve + 2, darkL: innerSide < 0 && k < sleeve + 2 });
    }
    const hx = ax + dx;
    for (let k = 0; k < 2; k++) span(L, skin, hx, hx + 2, shY + 1 + armLen + k, { drop: far ? 1 : 0 });
  };
  if (side) arm(cx - 2, -swing * 2, true);
  // ---------------- torso
  for (let y = shY; y <= hipY; y++) {
    const t = (y - shY) / (hipY - shY);
    const half = Math.round(shHalf - t * (shHalf - hipHalf) * 0.7 + (build === 2 && t > 0.35 && t < 0.9 ? 1 : 0));
    const x0 = cx - half - (side ? 1 : 0), x1 = cx + half - 1 + (side ? 1 : 0);
    let R = top;
    if (y === hipY && tk !== 'dress') R = bk === 'skirt' ? bot : cloth('brown');                      // belt
    span(L, R, x0, x1, y, { edgeDark: true });
    if (!back && !side && y > shY) {
      if (tk === 'jacket') { for (let x = cx - 1; x <= cx; x++) L.set(x, y, y < hipY ? inner[y < shY + 3 ? 3 : 2] : R[1]); L.set(cx - 2, y, top[0]); L.set(cx + 1, y, top[0]); }
      if (tk === 'hoodie' && y > shY + 6 && y < shY + 10) span(L, top, cx - 3, cx + 2, y, { drop: 1 });
      if (tk === 'shirt' && y % 3 === 0) L.set(cx - (d === 1 ? 1 : 0), y, R[4]);
    }
  }
  // collar / neckline
  if (!back) { for (let x = -2; x <= 1; x++) L.set(cx + x + (side ? 1 : 0), shY, tk === 'tee' || tk === 'tank' || tk === 'dress' ? skin[2] : (tk === 'jacket' ? inner[3] : top[3])); if (tk === 'polo' || tk === 'uniform') { L.set(cx - 2, shY + 1, top[3]); L.set(cx + 1, shY + 1, top[3]); } }
  if (tk === 'uniform' && !back) { L.set(cx - 3 + (side ? 3 : 0), shY + 3, [236, 204, 96]); L.set(cx - 3 + (side ? 3 : 0), shY + 4, [180, 140, 60]); }
  if (tk === 'hoodie' && back) for (let x = -3; x <= 2; x++) L.set(cx + x, shY + 1, top[1]);
  // near arms
  if (side) arm(cx, swing * 2, false);
  else {
    arm(cx - shHalf - 2 - (q3 ? 0 : 1), swing * 0.5, d === 3, 1);
    arm(cx + shHalf - 1 + (q3 ? 0 : 1) - (d === 1 ? 1 : 0), -swing * 0.5, d === 1, -1);
  }
  // carried things
  if (A.carry === 'briefcase' && !back) { const hx = side ? cx : cx + shHalf - 1; for (let y = 0; y < 7; y++) for (let x = 0; x < 8; x++) L.set(hx - 2 + x, shY + armLen + 3 + y, y === 0 ? MAT.woodDark[4] : x === 7 ? MAT.woodDark[0] : MAT.woodDark[2]); }
  if (A.carry === 'bag') { const hx = side ? cx - 5 : cx - shHalf - 2; for (let y = 0; y < 9; y++) for (let x = 0; x < 5; x++) L.set(hx + x, shY + 6 + y, cloth('khaki')[x === 0 ? 3 : x === 4 ? 1 : 2]); for (let k = 0; k < 7; k++) L.set(hx + 3 + Math.round(k * 0.8), shY + k, cloth('brown')[1]); }
  if (A.carry === 'board') for (let y = 0; y < 17; y++) for (let x = 0; x < 3; x++) L.set(cx + shHalf + 2 + x, shY + 3 + y, y === 0 || y === 16 ? MAT.tyre[1] : cloth('teal')[x === 0 ? 3 : 2]);
  // ---------------- neck and head
  for (let y = shY - 2; y < shY; y++) span(L, skin, cx - 1, cx + 1 + (side ? 0 : 0), y, { drop: 1 });
  const hcx = cx - 0.5 + (side ? 1 : d === 1 ? 0.5 : d === 3 ? -0.5 : 0), hcy = headTop + headH / 2;
  const rx = headW / 2, ry = headH / 2;
  for (let y = headTop; y < headTop + headH; y++) for (let x = Math.floor(hcx - rx); x <= Math.ceil(hcx + rx); x++) {
    const u = (x + 0.5 - hcx) / rx, v = (y + 0.5 - hcy) / ry;
    if (u * u * 0.9 + v * v * (v > 0 ? 1.15 : 0.95) > 1) continue;
    const k = u < -0.45 ? 3 : u > 0.5 || v > 0.62 ? 1 : 2;
    L.set(x, y, skin[k]);
  }
  // face
  const ey = headTop + 6, eye = [38, 26, 38], white = [240, 236, 228];
  if (d === 0) {
    for (const ex of [Math.round(hcx - 2.5), Math.round(hcx + 1.5)]) { L.set(ex, ey, eye); L.set(ex, ey + 1, eye); L.set(ex + 1, ey, white); }
    L.set(Math.round(hcx - 2.5), ey - 2, hairR[1]); L.set(Math.round(hcx - 1.5), ey - 2, hairR[1]); L.set(Math.round(hcx + 1.5), ey - 2, hairR[1]); L.set(Math.round(hcx + 2.5), ey - 2, hairR[1]);
    L.set(Math.round(hcx), ey + 3, skin[1]); L.set(Math.round(hcx - 0.5), ey + 4, skin[1]);
  } else if (d === 1) {
    for (const ex of [Math.round(hcx - 1), Math.round(hcx + 2.5)]) { L.set(ex, ey, eye); L.set(ex, ey + 1, eye); }
    L.set(Math.round(hcx + 4.5), ey + 2, skin[3]); L.set(Math.round(hcx + 1.5), ey + 4, skin[1]);
    L.set(Math.round(hcx - 4), ey + 1, skin[1]); // ear
  } else if (d === 2) {
    L.set(Math.round(hcx + 3), ey, eye); L.set(Math.round(hcx + 3), ey + 1, eye);
    L.set(Math.round(hcx + 5.5), ey + 2, skin[2]); L.set(Math.round(hcx + 5), ey + 3, skin[1]);
    L.set(Math.round(hcx + 3), ey + 4, skin[1]);
    L.set(Math.round(hcx - 1), ey + 1, skin[1]); L.set(Math.round(hcx - 1), ey + 2, skin[0]); // ear
  }
  if (A.glasses && d <= 2) for (let x = (d === 2 ? 1 : -4); x <= 3; x++) L.set(Math.round(hcx + x + (d === 1 ? 1 : 0)), ey, [26, 24, 34]);
  // hair
  const hs = A.hat && A.hair?.style === 'afro' ? 'short' : A.hair?.style || 'short';
  const hairAt = (x, y) => {
    const u = (x + 0.5 - hcx) / (rx + 0.9), v = (y + 0.5 - hcy) / (ry + 0.9);
    const inHead = u * u + v * v <= 1;
    if (hs === 'bald') return false;
    if (hs === 'afro') return ((x + 0.5 - hcx) / (rx + 2.5)) ** 2 + ((y + 0.5 - hcy + 2) / (ry + 1.8)) ** 2 <= 1 && (back || side ? (side ? x < hcx + 2 || y < hcy - 2 : true) : (y < hcy - 1.5 || Math.abs(x + 0.5 - hcx) > rx - 0.5));
    let on;
    if (back) on = inHead && v < 0.85;
    else if (side) on = inHead && (v < -0.3 || (u < -0.05 && v < 0.55));
    else if (d === 3) on = inHead && v < 0.8 && !(u > 0.55 && v > -0.1);
    else on = inHead && (v < -0.38 || (Math.abs(u) > 0.78 && v < 0.35) || (d === 1 && u < -0.45 && v < 0.5));
    if (hs === 'buzz') return on && v < -0.48;
    if (hs === 'long' || hs === 'pony') {
      const dx = Math.abs(x + 0.5 - hcx);
      if (y > hcy - 2 && y < hcy + ry + (hs === 'long' ? 9 : 3) && dx <= rx + 0.6 && (back || dx > rx - 1.8 || (side && x < hcx))) on = true;
      if (hs === 'pony' && (back || side) && Math.abs(x + 0.5 - hcx + (side ? 4 : 0)) < 1.6 && y > hcy && y < hcy + 10) on = true;
    }
    if (hs === 'bun' && Math.hypot(x + 0.5 - hcx + (side ? 3 : 0), y + 0.5 - (headTop - 1)) < 2.8) on = true;
    return on;
  };
  if (hs !== 'bald') for (let y = headTop - 4; y < headTop + headH + 10; y++) for (let x = Math.floor(hcx - rx - 3); x <= Math.ceil(hcx + rx + 3); x++) {
    if (!hairAt(x, y)) continue;
    const u = (x + 0.5 - hcx) / rx, v = (y + 0.5 - hcy) / ry;
    let k = u < -0.3 && v < -0.2 ? 3 : u > 0.45 || v > 0.3 ? 1 : 2;
    if (v < -0.55 && u < 0.2 && u > -0.6 && ((x + y) & 1)) k = 4;                // shine
    if (!hairAt(x, y + 1)) k = Math.max(0, k - 1);                                // dark underside
    L.set(x, y, hairR[k]);
  }
  // hats
  const hat = A.hat?.kind;
  if (hat) {
    const R = cloth(A.hat.color || 'navy');
    for (let y = headTop - 1; y < headTop + 4; y++) for (let x = Math.floor(hcx - rx - 1); x <= Math.ceil(hcx + rx + 1); x++) {
      const u = (x + 0.5 - hcx) / (rx + 0.4), v = (y + 0.5 - hcy) / (ry + 0.3);
      if (u * u + v * v <= 1) L.set(x, y, R[u < -0.3 ? 3 : u > 0.5 ? 1 : y === headTop + 3 ? 1 : 2]);
    }
    if (hat === 'cap' && !back) { const bx = side ? hcx + 2 : d === 1 ? hcx - 2 : hcx - 4, bw = side ? 6 : 8; for (let x = 0; x < bw; x++) { L.set(bx + x, headTop + 4, R[3]); L.set(bx + x, headTop + 5, R[0]); } }
    if (hat === 'brim') for (let x = -rx - 3; x <= rx + 3; x++) { L.set(hcx + x, headTop + 3, R[x < 0 ? 3 : 2]); L.set(hcx + x, headTop + 4, R[0]); }
  }
  // copy into the G-buffer
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = L.c[y * W + x]; if (c) G.put(x, y, c, null, 0, null, 0); }
}

// ---- outfit generator -----------------------------------------------------------------------------
const TOPS = ['tee', 'tee', 'polo', 'shirt', 'hoodie', 'jacket', 'tank'];
const COLS = Object.keys(MAT.cloth);
export function randomPerson(seed, kind = null) {
  const r = (k) => hash(seed, k, 97);
  const fem = r(1) < 0.5;
  const pick = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const app = {
    fem, skin: Math.floor(r(2) * 5), build: r(3) < 0.2 ? 2 : r(3) < 0.45 ? 0 : 1, h: Math.round((r(4) - 0.5) * 3),
    hair: { style: fem ? pick(['long', 'long', 'bun', 'pony', 'short', 'afro'], 5) : pick(['short', 'short', 'buzz', 'afro', 'bald', 'long'], 5), color: Math.floor(r(6) * 6) },
    top: { kind: fem && r(7) < 0.2 ? 'dress' : pick(TOPS, 7), color: pick(COLS, 8), color2: pick(COLS, 9), inner: 'white' },
    bottom: { kind: fem && r(10) < 0.3 ? 'skirt' : r(10) < 0.25 ? 'shorts' : 'pants', color: pick(['denim', 'denim', 'black', 'khaki', 'navy', 'grey', 'brown'], 11) },
    shoes: pick(['white', 'black', 'brown', 'red'], 12),
    hat: r(13) < 0.22 ? { kind: pick(['cap', 'brim'], 14), color: pick(COLS, 15) } : null,
    glasses: r(16) < 0.15, carry: r(17) < 0.12 ? 'bag' : null,
  };
  if (kind === 'cop') Object.assign(app, { top: { kind: 'uniform', color: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'cap', color: 'navy' }, carry: null });
  if (kind === 'business') Object.assign(app, { top: { kind: 'jacket', color: 'black', color2: 'black', inner: 'white' }, bottom: { kind: fem ? 'skirt' : 'pants', color: 'black' }, shoes: 'black', carry: 'briefcase', hat: null });
  if (kind === 'beach') Object.assign(app, { top: { kind: 'tank', color: pick(['orange', 'pink', 'teal', 'yellow'], 20) }, bottom: { kind: 'shorts', color: pick(['red', 'navy', 'teal'], 21) }, shoes: 'brown' });
  if (kind === 'clerk') Object.assign(app, { top: { kind: 'polo', color: 'green' } });
  if (kind === 'thug') Object.assign(app, { top: { kind: 'jacket', color: 'purple', color2: 'purple', inner: 'black' }, bottom: { kind: 'pants', color: 'black' }, hat: { kind: 'cap', color: 'black' } });
  return app;
}
