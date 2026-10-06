// Art v2 people, modelled on the C1-C3 targets (docs/art-v2/targets): chunky, big-headed, about three
// heads tall, seen from the high game camera, so you see the top of the head and both shoulders, the
// arms hang a little away from the body with big fists, the legs are short and the shoes are big.
// About 42 px tall on a 36 x 50 art grid. Every part is shaded as a solid (sphere / cylinder lit from
// the upper left, 4-5 ramp steps, ordered dither between them), so the figures have the same rounded
// volume as the targets; a dark hue-tinted outline goes round the result.
//
// person(app, dir, pose, frame) -> GBuf (anchor .ax/.ay at the feet)
//   dir 0 S, 1 SE, 2 E, 3 NE, 4 N, 5 NW, 6 W, 7 SW (5-7 mirrored)     pose 'idle' | 'walk'
//   app: { skin 0-4, build 0 slim | 1 average | 2 heavy | 3 tall, fem,
//          hair: { style, color }, beard, top: { kind, color, color2, pattern }, bottom: { kind, color },
//          shoes, hat: { kind, color }, glasses: 'sun'|'round'|null, chain, carry, back }
//   hair styles: spiky short buzz bald afro long wavy pony bun braids dreads mohawk slick curly
//   tops: tee tank polo shirt hoodie jacket suit leather puffer flannel hawaiian vest hivis uniform
//         tactical scrubs apron overalls tracksuit jersey coat
//   bottoms: jeans pants cargo shorts skirt track     hats: cap beanie bucket cowboy hard police
//         helmet bandana fedora      carry: briefcase bag shopping coffee phone cane board
import { GBuf, F_CHAR, hash, bayer } from './gbuf.js';
import { MAT, ramp } from './palette.js';

const W = 36, H = 50, FOOT = 47;
const C = (c) => (Array.isArray(c) ? c : MAT.cloth[c] || (typeof c === 'string' && c[0] === '#' ? ramp(c, 5, 2) : MAT.cloth.grey));
const OUT = [38, 24, 34];

export function person(app, dir = 0, pose = 'idle', frame = 0) {
  const mirror = dir >= 5;
  const d = mirror ? 8 - dir : dir;
  const G = new GBuf(W, H);
  G.ax = W / 2; G.ay = FOOT;
  const L = new Lay();
  draw(L, app, d, pose, frame);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = L.c[y * W + x]; if (c) G.put(mirror ? W - 1 - x : x, y, c, null, 0, null, 0); }
  outline(G);
  G.autoNormals([0, 0.4, 0.92], 4);
  for (let i = 0; i < G.flag.length; i++) if (G.col[i * 4 + 3]) { G.flag[i] |= F_CHAR; G.z[i] = Math.max(1, FOOT - Math.floor(i / W)); }
  return G;
}

// dark, warm-tinted outline (the targets use deep brown-purple, never black)
function outline(G) {
  const add = [];
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    if (G.alpha(x, y)) continue;
    if (G.alpha(x + 1, y) || G.alpha(x - 1, y) || G.alpha(x, y + 1) || G.alpha(x, y - 1)) add.push(x, y);
  }
  for (let i = 0; i < add.length; i += 2) G.put(add[i], add[i + 1], OUT, null, 0, null, 0);
}

class Lay {
  constructor() { this.c = new Array(W * H).fill(null); }
  set(x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && col) this.c[y * W + x] = col; }
  get(x, y) { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < W && y < H ? this.c[y * W + x] : null; }
}
// pick a ramp step for a lit value (0 dark .. 1 light), dithering between steps
const shade = (R, v, x, y) => { const t = Math.max(0, Math.min(0.999, v)) * (R.length - 1) + bayer(x, y) * 0.55; return R[Math.max(0, Math.min(R.length - 1, Math.round(t)))]; };
const LX = -0.55, LY = -0.62, LZ = 0.56;          // light from the upper left, toward the viewer
// an ellipsoid blob, lit; clip(x, y) can refuse pixels
function blob(L, R, cx, cy, rx, ry, opt = {}) {
  const k = opt.k ?? 0;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, q = u * u + v * v;
    if (q > 1 || (opt.clip && !opt.clip(x, y, u, v))) continue;
    const w = Math.sqrt(1 - q), lit = u * LX + v * LY + w * LZ;
    L.set(x, y, shade(R, 0.38 + lit * 0.5 + k + (opt.shadeAdd ? opt.shadeAdd(x, y) : 0), x, y));
  }
}
// a limb or torso: a rounded column from (x0,y0) to (x1,y1), half-width r0 at the top and r1 at the bottom
function column(L, R, x0, y0, x1, y1, r0, r1 = r0, opt = {}) {
  const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = (x1 - x0) / len, ny = (y1 - y0) / len;
  const mx = Math.min(x0, x1) - Math.max(r0, r1) - 1, Mx = Math.max(x0, x1) + Math.max(r0, r1) + 1;
  const my = Math.min(y0, y1) - Math.max(r0, r1) - 1, My = Math.max(y0, y1) + Math.max(r0, r1) + 1;
  for (let y = Math.floor(my); y <= Math.ceil(My); y++) for (let x = Math.floor(mx); x <= Math.ceil(Mx); x++) {
    const px = x + 0.5 - x0, py = y + 0.5 - y0, pr = px * nx + py * ny, t = Math.max(0, Math.min(1, pr / len));
    if (opt.flat && (pr < 0 || pr > len)) continue;
    const r = r0 + (r1 - r0) * t, ex = px - nx * t * len, ey = py - ny * t * len, dd = opt.flat ? Math.abs(ex * -ny + ey * nx) : Math.hypot(ex, ey);
    if (dd > r) continue;
    if (opt.clip && !opt.clip(x, y, t)) continue;
    const side = (ex * -ny + ey * nx) / r;             // -1 left edge .. 1 right edge
    const w = Math.sqrt(Math.max(0, 1 - side * side));
    let v = 0.42 + (-side * 0.38) + w * 0.18 - t * (opt.fade ?? 0.12) + (opt.k ?? 0);
    if (opt.pattern) v += opt.pattern(x, y);
    if (opt.rim && dd > r - 0.85) { L.set(x, y, R[opt.rimStep ?? 1]); continue; }
    L.set(x, y, opt.color ? opt.color(x, y, v) : shade(R, v, x, y));
  }
}

function draw(L, A, d, pose, frame) {
  const fem = !!A.fem, build = A.build ?? 1;
  const heavy = build === 2, slim = build === 0, tall = build === 3;
  const skin = MAT.skin[A.skin ?? 1], hairR = MAT.hair[A.hair?.color ?? 0] || C(A.hair?.color);
  const tk = A.top?.kind || 'tee', bk = A.bottom?.kind || 'jeans';
  const top = C(A.top?.color || 'grey'), top2 = C(A.top?.color2 || 'white'), bot = C(A.bottom?.color || 'denim');
  const shoe = C(A.shoes || 'white');
  const side = d === 2, back = d >= 3, q3 = d === 1 || d === 3;
  const walk = pose === 'walk', ph = walk ? frame % 4 : 0, stride = walk ? [1, 0, -1, 0][ph] : 0, bob = walk && ph % 2 === 1 ? -1 : 0;
  const cx = 18;
  // vertical layout (feet at FOOT)
  const legLen = tall ? 12 : 10, torsoLen = heavy ? 12 : 11;
  const hipY = FOOT - 3 - legLen + bob, shY = hipY - torsoLen;
  const headR = 7, hcy = shY - headR + 0.5, hcx = cx + (side ? 1.5 : d === 1 ? 1 : d === 3 ? -0.5 : 0);
  const shW = (heavy ? 9.5 : slim ? 6.5 : fem ? 6.8 : 7.8) * (side ? 0.72 : q3 ? 0.88 : 1);
  const hipW = (heavy ? 8.5 : fem ? 6.5 : 6) * (side ? 0.72 : q3 ? 0.9 : 1);
  const longCoat = tk === 'coat' || tk === 'scrubs' && false;
  const skirt = bk === 'skirt' || tk === 'dress';
  // ---------------- legs and shoes
  const legR = heavy ? 2.9 : slim ? 2.2 : 2.5;
  const pant = (y) => ((bk === 'shorts' || bk === 'skirt') && y > hipY + 5 ? skin : bot);
  const legs = side
    ? [{ x: cx - 0.5 - stride * 3, far: true, lift: stride < 0 ? 1 : 0 }, { x: cx - 0.5 + stride * 3, far: false, lift: stride > 0 ? 1 : 0 }]
    : [{ x: cx - hipW * 0.55, far: d === 3, lift: stride > 0 ? 1 : 0, sw: stride }, { x: cx + hipW * 0.55, far: d === 1, lift: stride < 0 ? 1 : 0, sw: -stride }];
  for (const g of legs) {
    const fy = FOOT - 3 - g.lift, fx = g.x + (side ? stride * (g.far ? -1 : 1) : 0);
    const R = pant(fy);
    column(L, bot, g.x, hipY, fx, fy - 1, legR + 0.3, legR, { k: g.far ? -0.15 : 0, clip: (x, y) => !((bk === 'shorts' || skirt) && y > hipY + 5) });
    if (bk === 'shorts' || skirt) column(L, skin, g.x, hipY + 5, fx, fy - 1, legR - 0.6, legR - 0.8, { k: g.far ? -0.15 : 0, clip: (x, y) => y > hipY + 5 });
    if (bk === 'track') for (let y = hipY + 1; y < fy - 1; y++) L.set(fx + (side ? 0 : g.x < cx ? -legR + 1 : legR - 1), y, C('white')[3]);
    // shoe: a chunky rounded block, toe toward the viewer (or the facing side)
    const sx = side ? fx + 1.5 : fx, sy = fy + 1;
    blob(L, shoe, sx, sy, side ? 3.6 : 3.1, 2.1, { k: g.far ? -0.1 : 0.05 });
    if (!back) for (let x = -2; x <= 2; x++) L.set(sx + x + (side ? 1 : 0), sy + 1.5, shoe[0]);       // sole
  }
  // skirt / dress / long coat flare
  if (skirt || longCoat) {
    const R = tk === 'dress' || longCoat ? top : bot;
    column(L, R, cx, hipY - 1, cx, hipY + (longCoat ? 9 : 6), hipW + 0.5, hipW + 2.5, { fade: 0.2 });
  }
  // ---------------- back things (backpack seen from behind sits over the body later)
  // ---------------- arms
  const armR = heavy ? 2.6 : slim ? 2 : 2.3;
  const sleeveLen = ['tank', 'vest', 'hivis'].includes(tk) ? 0 : ['tee', 'polo', 'jersey', 'hawaiian', 'scrubs', 'uniform', 'apron'].includes(tk) ? 4 : 99;
  const sleeveR = ['tank', 'vest', 'hivis', 'apron'].includes(tk) ? skin : ['vest', 'hivis'].includes(tk) ? top2 : top;
  const armColorSrc = (tk === 'vest' || tk === 'hivis' || tk === 'apron' || tk === 'overalls') ? C(A.top?.color2 || 'grey') : top;
  const drawArm = (sx, sy, hx, hy, far) => {
    const len = Math.hypot(hx - sx, hy - sy);
    column(L, armColorSrc, sx, sy, hx, hy - 1, armR + 0.3, armR, { k: far ? -0.2 : 0, rim: !far, caps: true, clip: (x, y, t) => t * len < sleeveLen });
    column(L, skin, sx, sy, hx, hy - 1, armR - 0.2, armR - 0.5, { k: far ? -0.2 : 0, rim: !far, rimStep: 1, caps: true, clip: (x, y, t) => t * len >= sleeveLen });
    blob(L, skin, hx, hy, armR + 0.6, armR + 0.4, { k: far ? -0.2 : 0.05 });                  // fist
  };
  const swing = walk ? stride * 2.5 : 0;
  const armDrop = torsoLen - 1;
  const arms = side
    ? [[cx - 1, shY + 2.5, cx - 1 - swing, shY + armDrop + 1, true], [cx + 0.5, shY + 2.5, cx + 1.5 + swing, shY + armDrop + 1, false]]
    : [[cx - shW - 0.2, shY + 2.5, cx - shW - 2 - (heavy ? 1 : 0), shY + armDrop + swing * 0.3, d === 3], [cx + shW + 0.2, shY + 2.5, cx + shW + 2 + (heavy ? 1 : 0), shY + armDrop - swing * 0.3, d === 1]];
  const farArms = arms.filter((a) => a[4]), nearArms = arms.filter((a) => !a[4]);
  for (const a of farArms) drawArm(...a);
  // ---------------- torso
  const pat = A.top?.pattern === 'check' ? (x, y) => ((Math.floor(x / 2) + Math.floor(y / 2)) % 2 ? -0.18 : 0.05)
    : A.top?.pattern === 'floral' ? (x, y) => (hash(x >> 1, y >> 1, 7) > 0.8 ? 0.45 : 0)
    : A.top?.pattern === 'stripe' ? (x, y) => (y % 3 === 0 ? 0.3 : 0) : null;
  const torsoTop = top;
  column(L, torsoTop, cx + (side ? -0.5 : 0), shY + 1, cx + (side ? -0.5 : 0), hipY + 1, shW, hipW + (heavy ? 1 : 0.4), { pattern: pat, fade: 0.1, flat: true });
  // neck
  column(L, skin, hcx - (side ? 1 : 0), shY - 2, hcx - (side ? 1 : 0), shY + 1, 1.8, 1.8, { flat: true, k: -0.15 });
  // shoulders: round them off
  if (!side) { blob(L, torsoTop, cx - shW + 2.2, shY + 2.6, 2.6, 2.2); blob(L, torsoTop, cx + shW - 2.2, shY + 2.6, 2.6, 2.2, { k: -0.12 }); }
  // garment details (front views)
  const front = !back && !side;
  const R2 = top2;
  if (['jacket', 'suit', 'leather', 'coat', 'puffer', 'tracksuit'].includes(tk) && !back) {
    // open front showing the shirt underneath, lapels
    const ix = side ? cx + 2 : cx + (d === 1 ? 1 : 0);
    const innerW = tk === 'puffer' || tk === 'tracksuit' ? 0.6 : 1.6;
    for (let y = shY + 2; y <= hipY; y++) for (let x = Math.round(ix - innerW); x <= Math.round(ix + innerW); x++) L.set(x, y, shade(R2, 0.65, x, y));
    if (tk === 'suit' && !side) for (let y = shY + 3; y < shY + 9; y++) L.set(ix, y, C(A.top?.tie || 'navy')[2]);
    if (tk === 'tracksuit') for (let y = shY + 3; y < hipY; y++) { L.set(cx - shW + 1, y, C('white')[3]); L.set(cx + shW - 1, y, C('white')[2]); }
    if (tk === 'puffer') for (let y = shY + 4; y < hipY; y += 3) for (let x = -shW + 1; x < shW; x++) L.set(cx + x, y, top[1]);
  }
  if (tk === 'hoodie') {
    if (back) blob(L, top, cx, shY + 2, shW - 1.5, 3, { k: -0.08 });
    else if (front) { for (let y = shY + 1; y < shY + 6; y++) { L.set(cx - 2, y, C('white')[3]); L.set(cx + 1, y, C('white')[3]); } for (let x = -3; x <= 3; x++) L.set(cx + x, hipY - 3, top[1]); }
  }
  if ((tk === 'shirt' || tk === 'polo' || tk === 'hawaiian' || tk === 'flannel' || tk === 'uniform') && front) { for (let y = shY + 2; y < hipY; y += 2) L.set(cx, y, top[1]); L.set(cx - 2, shY + 1, top[4]); L.set(cx + 1, shY + 1, top[4]); }
  if (tk === 'vest' || tk === 'hivis' || tk === 'apron' || tk === 'overalls') {
    // a panel over a contrasting shirt: color2 is the shirt, color the panel
    if (front) for (let y = shY + (tk === 'overalls' || tk === 'apron' ? 4 : 1); y <= hipY + (tk === 'apron' ? 4 : 0); y++) for (let x = -shW + (tk === 'overalls' || tk === 'apron' ? 2 : 1); x < shW - (tk === 'overalls' || tk === 'apron' ? 2 : 1); x++) L.set(cx + x, y, shade(top, 0.55 - x * 0.03, cx + x, y));
    if (tk === 'hivis') for (let x = -shW + 1; x < shW - 1; x++) { L.set(cx + x, shY + 7, [236, 236, 220]); L.set(cx + x, hipY - 2, [236, 236, 220]); }
  }
  if ((tk === 'uniform' || tk === 'tactical') && !back) { L.set(cx - 3 + (side ? 4 : 0), shY + 4, [236, 204, 96]); L.set(cx - 3 + (side ? 4 : 0), shY + 5, [176, 136, 60]); }
  if (tk === 'tactical') for (let y = shY + 3; y < hipY; y++) for (let x = -shW + 1; x < shW - 1; x++) if ((y - shY) % 4 === 0) L.set(cx + x, y, C('black')[1]);
  if (tk === 'jersey' && (front || back)) for (const [dx, dy] of [[-1, 4], [0, 4], [1, 4], [1, 5], [0, 6], [-1, 7], [-1, 8], [0, 8], [1, 8]]) L.set(cx + dx, shY + dy, C('white')[4]);
  // belt
  if (!skirt && !['coat', 'overalls', 'scrubs', 'apron', 'tracksuit', 'puffer'].includes(tk)) for (let x = -Math.round(hipW); x <= Math.round(hipW); x++) L.set(cx + x, hipY, x === 0 && front ? [220, 180, 80] : C('brown')[1]);
  if (A.chain && !back) for (let k = -2; k <= 2; k++) L.set(cx + k, shY + 3 + (2 - Math.abs(k)) * 0.6, [238, 196, 72]);
  // backpack straps / pack
  if (A.back === 'backpack') {
    if (back) column(L, C(A.backColor || 'navy'), cx, shY + 3, cx, hipY - 1, shW - 2, shW - 1.5);
    else if (!side) { for (let y = shY + 1; y < shY + 9; y++) { L.set(cx - shW + 2, y, C('black')[2]); L.set(cx + shW - 2, y, C('black')[1]); } }
    else column(L, C(A.backColor || 'navy'), cx - 4, shY + 3, cx - 4, hipY - 1, 2.6, 2.4);
  }
  // near arms over the torso
  for (const a of nearArms) drawArm(...a);
  // held things
  const nearHand = nearArms[nearArms.length - 1] || arms[0];
  const [hx, hy] = [nearHand[2], nearHand[3]];
  if (A.carry === 'briefcase' && !back) for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) L.set(hx - 3 + x, hy + 2 + y, y === 0 ? MAT.woodDark[4] : x === 7 || y === 5 ? MAT.woodDark[0] : MAT.woodDark[2]);
  if (A.carry === 'shopping') for (const [ox, c] of [[-3, '#d84a6a'], [2, '#e8dcc8']]) for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) L.set(hx + ox + x - 2, hy + 1 + y, ramp(c, 5, 2)[x === 4 ? 1 : y === 0 ? 4 : 2]);
  if (A.carry === 'coffee' && !back) for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) L.set(hx - 1 + x, hy - 3 + y, y === 0 ? [240, 236, 228] : [196, 150, 100]);
  if (A.carry === 'phone' && !back) for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) L.set(hx + x, hy - 3 + y, [40, 40, 60]);
  if (A.carry === 'bag') { const bx = side ? cx - 4 : cx - shW - 1; for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) L.set(bx + x, hipY - 2 + y, C('brown')[x === 0 ? 3 : x === 4 ? 1 : 2]); }
  if (A.carry === 'cane') for (let k = 0; k < 12; k++) L.set(hx + 1, hy + k, MAT.woodDark[2]);
  if (A.carry === 'board') for (let y = 0; y < 20; y++) for (let x = 0; x < 4; x++) L.set(hx + 2 + x, hy - 8 + y, y === 0 || y === 19 ? C('black')[1] : C('teal')[x === 0 ? 4 : 2]);
  // ---------------- head
  const R = 7;
  blob(L, skin, hcx, hcy + 0.8, R - 0.6, R - 0.2, { k: 0.05 });
  // ears
  if (side) blob(L, skin, hcx - 1.5, hcy + 1.5, 1.4, 1.9, { k: -0.1 });
  // face
  const eye = [40, 26, 34], ey = hcy + 2;
  if (d === 0 || d === 1) {
    const exs = d === 0 ? [hcx - 2.6, hcx + 2] : [hcx - 0.6, hcx + 3.4];
    for (const ex of exs) { L.set(ex, ey, eye); L.set(ex, ey + 1, eye); L.set(ex + 1, ey, eye); L.set(ex + 1, ey + 1, eye); L.set(ex, ey, [235, 228, 220]); }
    for (const ex of exs) { L.set(ex, ey - 2, hairR[1]); L.set(ex + 1, ey - 2, hairR[1]); }             // brows
    L.set(hcx + (d === 1 ? 2 : 0) - 0.5, ey + 4, skin[1]); L.set(hcx + (d === 1 ? 2 : 0) + 0.5, ey + 4, skin[1]);   // mouth
    if (d === 1) L.set(hcx + 5.5, ey + 2, skin[3]);
  } else if (d === 2) {
    L.set(hcx + 3.5, ey, eye); L.set(hcx + 3.5, ey + 1, eye); L.set(hcx + 3, ey - 2, hairR[0]); L.set(hcx + 4, ey - 2, hairR[0]);
    L.set(hcx + 6.7, ey + 2, skin[2]); L.set(hcx + 6.2, ey + 3, skin[1]); L.set(hcx + 4.5, ey + 4.5, skin[1]);
  }
  // beard
  if (A.beard && !back) { const bw = A.beard === 'full' ? 5 : 3; for (let y = ey + 3; y <= hcy + R; y++) for (let x = -bw; x <= bw; x++) { const X = hcx + x + (side ? 3 : d === 1 ? 1.5 : 0); if (L.get(X, y) && (A.beard === 'full' || Math.abs(x) < 3 || y > ey + 4)) L.set(X, y, shade(hairR, 0.35, X, y)); } }
  // glasses
  if (A.glasses && !back) {
    const gy = ey, col = A.glasses === 'sun' ? [26, 26, 36] : [60, 50, 50];
    const xs = d === 0 ? [-3.6, 3.6] : d === 1 ? [-1.6, 4.6] : [2.4, 5];
    for (let x = Math.round(hcx + xs[0]); x <= Math.round(hcx + xs[1]); x++) L.set(x, gy, col);
    if (A.glasses === 'sun') for (let x = Math.round(hcx + xs[0]); x <= Math.round(hcx + xs[1]); x++) if (x !== Math.round(hcx + (xs[0] + xs[1]) / 2)) L.set(x, gy + 1, col);
  }
  // a face-covering bandana, or a full balaclava
  if (A.bandana && !back) for (let y = Math.round(ey + 2); y <= hcy + R; y++) for (let x = -R; x <= R; x++) { const X = hcx + x; if (L.get(X, y)) L.set(X, y, shade(C(A.bandana), 0.55 - x / R * 0.25, X, y)); }
  if (A.mask) { blob(L, C('black'), hcx, hcy, R + 0.2, R + 0.4); if (!back) for (const ex of (d === 2 ? [3.5] : d === 1 ? [-0.6, 3.4] : [-2.6, 2])) { L.set(hcx + ex, ey, skin[2]); L.set(hcx + ex + 1, ey, skin[2]); L.set(hcx + ex, ey, eye); } }
  // hair
  if (!A.mask) hair(L, A, d, hcx, hcy, R, hairR, skin);
  // hat
  if (A.hat && !A.mask) hat(L, A.hat, d, hcx, hcy, R);
}

function hair(L, A, d, hcx, hcy, R, H, skin) {
  let st = A.hair?.style || 'short';
  if (A.hat && ['afro', 'spiky', 'mohawk', 'bun'].includes(st)) st = 'short';
  if (st === 'bald') return;
  const side = d === 2, back = d >= 3;
  const face = (x, y) => {                                        // where the face shows through
    const u = (x + 0.5 - hcx) / R, v = (y + 0.5 - hcy) / R;
    if (back) return false;
    if (side) return u > -0.05 && v > -0.15;
    if (d === 1) return v > -0.2 && u > -0.55 && u < 0.95;
    return v > -0.22 && Math.abs(u) < 0.78;
  };
  const vol = st === 'afro' ? 2.4 : st === 'curly' || st === 'wavy' ? 1.4 : st === 'buzz' ? 0.2 : st === 'slick' ? 0.5 : 1;
  const top = hcy - (st === 'buzz' ? 0.5 : 1.2);
  const spiky = st === 'spiky' || st === 'mohawk';
  // the main mass (clumps: darker grooves radiating from the crown)
  const clumpK = (x, y) => { const a = Math.atan2(y - top + R, x - hcx); return (Math.floor(a * 4.2 + hash(Math.floor(a * 4.2), 1, 5) * 0.8) % 2 ? -0.18 : 0.06); };
  blob(L, H, hcx, top, R + vol - 0.3, R + vol * 0.6 - 0.6, { shadeAdd: st === 'buzz' || st === 'slick' ? null : clumpK,
    clip: (x, y, u, v) => {
      if (face(x, y)) return false;
      if (st === 'buzz' || st === 'slick' || st === 'short' || spiky || st === 'pony' || st === 'bun') { if (v > 0.35 && !back) return false; if (v > 0.55) return false; }
      if (st === 'mohawk' && Math.abs(u) > 0.3 && v < 0.2) return false;
      if (spiky && v < -0.6) return hash(x >> 1, 0, 9) > 0.35;     // ragged crown
      if (st === 'curly' || st === 'afro') return hash(x, y, 3) > 0.08 || u * u + v * v < 0.85;
      return true;
    },
  });
  if (st === 'mohawk') blob(L, C(A.hair?.color === 5 ? '#c83030' : '#c83030'), hcx, top - 3, 1.8, R * 0.8);
  // spikes poking up and out
  if (spiky && st !== 'mohawk') for (let k = 0; k < 7; k++) {
    const a = -Math.PI * (0.12 + 0.76 * k / 6), len = 2.5 + hash(k, 1, 4) * 2;
    for (let s = 0; s < len; s++) L.set(hcx + Math.cos(a) * (R - 1 + s), top + Math.sin(a) * (R - 1.5 + s), H[s > len - 1.5 ? 1 : 2 + (k & 1)]);
  }
  // fringe over the forehead (front views)
  if (!back && (spiky || st === 'short' || st === 'curly' || st === 'wavy' || st === 'long')) {
    const fx = side ? hcx + 3 : d === 1 ? hcx + 1.5 : hcx;
    for (let x = -4; x <= 4; x++) { const len = 2 + Math.round(hash(x, 3, 11) * 1.5); for (let k = 0; k < len; k++) if (!side || x > -2) L.set(fx + x, hcy - 3.4 + k, H[k ? 2 : 3]); }
  }
  // long styles fall past the shoulders
  if (['long', 'wavy', 'braids', 'dreads'].includes(st)) {
    const len = 13;
    for (let y = Math.round(hcy); y < hcy + len; y++) for (let x = -R - 0.5; x <= R + 0.5; x++) {
      const X = Math.round(hcx + x), ax = Math.abs(x);
      const on = back ? ax < R + 0.5 - (y - hcy) * 0.12 : side ? x < 0 && x > -R - 0.5 : ax > R - 2.6;
      if (!on) continue;
      let v = 0.5 - x / R * 0.25 - (y - hcy) / len * 0.3;
      if (st === 'wavy') v += Math.sin(y * 0.9 + x) * 0.15;
      if ((st === 'braids' || st === 'dreads') && Math.round(x) % 2 === 0) v -= 0.3;
      if (st === 'dreads' && (y + Math.round(x)) % 5 === 0) { L.set(X, y, [222, 184, 80]); continue; }
      L.set(X, y, shade(H, v, X, y));
    }
  }
  if (st === 'pony') { if (back || side) { const px = back ? hcx : hcx - R + 0.5; column(L, H, px, hcy - 2, px - (side ? 2 : 0), hcy + 9, 2.4, 1.2, { caps: true }); } else { const px = d === 1 ? hcx - R : hcx - R + 1; column(L, H, px, top - R + 3, px - 3, top - 1, 2.6, 1.6, { k: -0.1 }); } }
  if (st === 'bun') blob(L, H, hcx - (side ? 3 : 0), top - R + 0.5, 3, 2.6);
  // a little shine on the crown
  if (st !== 'afro' && st !== 'curly') for (let x = -2; x <= 0; x++) L.set(hcx + x - 1, top - R + 2.5, H[Math.min(H.length - 1, 4)]);
}

function hat(L, h, d, hcx, hcy, R) {
  const col = C(h.color || 'navy'), back = d >= 3, side = d === 2;
  const k = h.kind;
  const crown = (ry, dy = 0, rx = R + 0.4) => blob(L, col, hcx, hcy - 2.2 + dy, rx, ry, { clip: (x, y, u, v) => v < 0.45 });
  if (k === 'cap' || k === 'police') {
    crown(R * 0.82, -0.4);
    if (!back) { const bx = side ? hcx + 3 : d === 1 ? hcx + 1.5 : hcx; for (let x = -4; x <= 4; x++) { if (side && x < -1) continue; L.set(bx + x + (side ? 2 : 0), hcy - 0.6, col[1]); L.set(bx + x + (side ? 2 : 0), hcy + 0.4, col[0]); } }
    if (k === 'police' && !back) { L.set(hcx, hcy - 4, [236, 204, 96]); L.set(hcx + 1, hcy - 4, [200, 160, 70]); for (let x = -R; x <= R; x++) L.set(hcx + x, hcy - 1.6, C('black')[1]); }
  } else if (k === 'beanie') { crown(R * 0.9, -0.6); for (let x = -R; x <= R; x++) L.set(hcx + x, hcy - 1.4, col[1]); }
  else if (k === 'bucket' || k === 'cowboy' || k === 'fedora') {
    crown(R * (k === 'cowboy' ? 0.95 : 0.75), -0.8, R - 0.4);
    const bw = k === 'cowboy' ? R + 4 : R + 2.6;
    for (let y = -1; y <= 1; y++) for (let x = -bw; x <= bw; x++) { const v = 0.4 - x / bw * 0.25 + (y < 0 ? 0.2 : -0.1); if (Math.abs(x) <= bw - Math.abs(y)) L.set(hcx + x, hcy - 0.5 + y, shade(col, v, hcx + x, y)); }
  } else if (k === 'hard' || k === 'helmet') { crown(R * 0.95, -0.4, R + 0.8); for (let x = -R - 1.5; x <= R + 1.5; x++) L.set(hcx + x, hcy - 0.2, col[1]); if (k === 'helmet' && !back) for (let x = -3; x <= 3; x++) L.set(hcx + x + (side ? 3 : 0), hcy + 2, [60, 120, 180]); }
  else if (k === 'bandana') { crown(R * 0.7, -0.2); if (!back) for (let y = 0; y < 4; y++) for (let x = -R + 1; x <= R - 1; x++) L.set(hcx + x + (side ? 2 : 0), hcy + 3.5 + y, shade(col, 0.5 - y * 0.08, x, y)); }
}

// ---- outfit generator -------------------------------------------------------------------------------
const PALET = ['white', 'black', 'denim', 'navy', 'red', 'orange', 'yellow', 'green', 'teal', 'purple', 'pink', 'khaki', 'grey', 'brown'];
export const ARCHETYPES = {
  banker: { top: { kind: 'suit', color: 'black', color2: 'white', tie: 'navy' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'briefcase', glasses: 'sun' },
  socialite: { fem: true, hair: { style: 'wavy', color: 3 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', carry: 'shopping', glasses: 'sun' },
  yachtie: { hair: { style: 'short', color: 4 }, top: { kind: 'polo', color: 'teal' }, bottom: { kind: 'shorts', color: 'white' }, shoes: 'brown', glasses: 'sun' },
  athleisure: { fem: true, hair: { style: 'bun', color: 1 }, top: { kind: 'tank', color: 'pink' }, bottom: { kind: 'track', color: 'pink' }, shoes: 'white', carry: 'phone' },
  valet: { top: { kind: 'vest', color: 'black', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black' },
  office: { top: { kind: 'shirt', color: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', carry: 'bag', glasses: 'round' },
  nurse: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'scrubs', color: 'denim' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  dad: { hair: { style: 'short', color: 1 }, beard: 'short', top: { kind: 'jacket', color: 'green', color2: 'white' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'brown', glasses: 'round' },
  student: { hair: { style: 'short', color: 0 }, top: { kind: 'hoodie', color: 'grey' }, bottom: { kind: 'jeans', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' }, back: 'backpack' },
  barista: { fem: true, hair: { style: 'bun', color: 2 }, top: { kind: 'apron', color: 'green', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', carry: 'coffee' },
  mechanic: { build: 2, beard: 'full', top: { kind: 'overalls', color: 'navy', color2: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'navy' } },
  nightshift: { top: { kind: 'hivis', color: 'yellow', color2: 'black' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'brown', hat: { kind: 'beanie', color: 'black' }, carry: 'coffee' },
  punk: { hair: { style: 'mohawk', color: 5 }, top: { kind: 'leather', color: 'black', color2: 'grey' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'black' },
  tracksuit: { build: 2, top: { kind: 'tracksuit', color: 'navy', color2: 'white' }, bottom: { kind: 'track', color: 'navy' }, shoes: 'white', hat: { kind: 'cap', color: 'white' }, chain: true },
  surfer: { hair: { style: 'wavy', color: 3 }, top: { kind: 'tank', color: 'teal' }, bottom: { kind: 'shorts', color: 'teal' }, shoes: 'brown', carry: 'board' },
  tourist: { build: 2, top: { kind: 'hawaiian', color: 'teal', pattern: 'floral' }, bottom: { kind: 'shorts', color: 'khaki' }, shoes: 'brown', hat: { kind: 'bucket', color: 'khaki' }, glasses: 'sun' },
  farmer: { beard: 'full', hair: { style: 'short', color: 4 }, top: { kind: 'overalls', color: 'denim', color2: 'red' }, bottom: { kind: 'pants', color: 'denim' }, shoes: 'brown', hat: { kind: 'cowboy', color: 'khaki' } },
  trucker: { build: 2, beard: 'full', top: { kind: 'flannel', color: 'brown', pattern: 'check' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'cap', color: 'red' } },
  granny: { fem: true, hair: { style: 'bun', color: 4 }, top: { kind: 'jacket', color: 'purple', color2: 'pink' }, bottom: { kind: 'skirt', color: 'brown' }, shoes: 'brown', carry: 'cane', glasses: 'round' },
  cop: { top: { kind: 'uniform', color: 'navy' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' }, glasses: 'sun' },
  swat: { build: 2, top: { kind: 'tactical', color: 'black' }, bottom: { kind: 'cargo', color: 'black' }, shoes: 'black', hat: { kind: 'helmet', color: 'black' } },
  medic: { fem: true, hair: { style: 'pony', color: 1 }, top: { kind: 'uniform', color: 'green' }, bottom: { kind: 'pants', color: 'green' }, shoes: 'black' },
  firefighter: { build: 2, top: { kind: 'coat', color: 'khaki', color2: 'yellow' }, bottom: { kind: 'pants', color: 'khaki' }, shoes: 'black', hat: { kind: 'hard', color: 'red' } },
  syndicate: { top: { kind: 'vest', color: 'black', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'purple', hat: { kind: 'cap', color: 'black' }, chain: true, bandana: 'purple' },
  enforcer: { build: 2, hair: { style: 'bald' }, top: { kind: 'puffer', color: 'purple', color2: 'white' }, bottom: { kind: 'track', color: 'black' }, shoes: 'purple', chain: true, glasses: 'sun' },
  robber: { top: { kind: 'hoodie', color: 'black' }, bottom: { kind: 'cargo', color: 'grey' }, shoes: 'black', hat: { kind: 'beanie', color: 'black' }, mask: true },
  driver: { top: { kind: 'leather', color: 'black', color2: 'red' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'red' } },
  bounty: { beard: 'short', top: { kind: 'coat', color: 'brown', color2: 'black' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'fedora', color: 'brown' }, chain: true },
  clerk: { top: { kind: 'polo', color: 'green' }, bottom: { kind: 'pants', color: 'black' }, hat: { kind: 'cap', color: 'green' } },
  guard: { build: 2, top: { kind: 'tactical', color: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'cap', color: 'grey' } },
  inmate: { hair: { style: 'buzz', color: 0 }, top: { kind: 'scrubs', color: 'orange' }, bottom: { kind: 'pants', color: 'orange' }, shoes: 'white' },
  warden: { build: 2, top: { kind: 'uniform', color: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'black', hat: { kind: 'police', color: 'navy' } },
  cook: { top: { kind: 'apron', color: 'white', color2: 'white' }, bottom: { kind: 'pants', color: 'black' }, shoes: 'black', hat: { kind: 'beanie', color: 'white' } },
  janitor: { top: { kind: 'overalls', color: 'navy', color2: 'grey' }, bottom: { kind: 'pants', color: 'navy' }, shoes: 'brown', hat: { kind: 'cap', color: 'grey' } },
  lifter: { build: 2, hair: { style: 'buzz', color: 0 }, top: { kind: 'tank', color: 'grey' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'white' },
  boxer: { build: 0, hair: { style: 'short', color: 0 }, top: { kind: 'tank', color: 'white' }, bottom: { kind: 'shorts', color: 'red' }, shoes: 'black', hat: { kind: 'helmet', color: 'red' } },
  yogi: { fem: true, hair: { style: 'bun', color: 0 }, top: { kind: 'tank', color: 'black' }, bottom: { kind: 'track', color: 'black' }, shoes: 'white' },
  busker: { beard: 'short', top: { kind: 'jacket', color: 'brown', color2: 'khaki' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'fedora', color: 'brown' } },
  commuter: { top: { kind: 'hoodie', color: 'green' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'white', back: 'backpack', backColor: 'brown' },
  courier: { fem: true, top: { kind: 'polo', color: 'pink' }, bottom: { kind: 'shorts', color: 'black' }, shoes: 'black', hat: { kind: 'cap', color: 'pink' }, back: 'backpack', backColor: 'pink', glasses: 'sun' },
  dockhand: { top: { kind: 'hivis', color: 'orange', color2: 'denim' }, bottom: { kind: 'jeans', color: 'denim' }, shoes: 'brown', hat: { kind: 'hard', color: 'yellow' } },
  lifeguard: { hair: { style: 'short', color: 3 }, top: { kind: 'tank', color: 'red' }, bottom: { kind: 'shorts', color: 'red' }, shoes: 'brown', glasses: 'sun' },
};
export function randomPerson(seed, kind = null) {
  const r = (k) => hash(seed, k, 97);
  const pick = (arr, k) => arr[Math.floor(r(k) * arr.length) % arr.length];
  const fem = r(1) < 0.5;
  const app = {
    fem, skin: Math.floor(r(2) * 5), build: r(3) < 0.18 ? 2 : r(3) < 0.4 ? 0 : r(3) > 0.9 ? 3 : 1,
    hair: { style: fem ? pick(['long', 'wavy', 'pony', 'bun', 'braids', 'curly', 'short'], 5) : pick(['spiky', 'short', 'buzz', 'afro', 'bald', 'curly', 'dreads', 'slick'], 5), color: Math.floor(r(6) * 6) },
    beard: !fem && r(18) < 0.25 ? pick(['short', 'full'], 19) : null,
    top: { kind: pick(['tee', 'tee', 'hoodie', 'polo', 'shirt', 'jacket', 'tank', 'flannel', 'leather'], 7), color: pick(PALET, 8), color2: pick(PALET, 9) },
    bottom: { kind: fem && r(10) < 0.25 ? 'skirt' : pick(['jeans', 'jeans', 'pants', 'cargo', 'shorts'], 10), color: pick(['denim', 'denim', 'black', 'khaki', 'navy', 'grey', 'brown'], 11) },
    shoes: pick(['white', 'white', 'black', 'brown', 'red'], 12),
    hat: r(13) < 0.2 ? { kind: pick(['cap', 'beanie', 'bucket'], 14), color: pick(PALET, 15) } : null,
    glasses: r(16) < 0.12 ? pick(['sun', 'round'], 17) : null,
    carry: r(20) < 0.15 ? pick(['bag', 'coffee', 'phone', 'shopping'], 21) : null,
  };
  if (app.top.kind === 'flannel') app.top.pattern = 'check';
  if (kind && ARCHETYPES[kind]) {
    const a = ARCHETYPES[kind];
    Object.assign(app, { hat: null, glasses: null, carry: null, beard: app.beard }, a);
    if (!a.hair) app.hair = app.hair;
    if (a.fem !== undefined && !a.hair) app.hair = { style: a.fem ? 'pony' : 'short', color: app.hair.color };
  }
  if (kind === 'business') return randomPerson(seed, 'banker');
  if (kind === 'beach') return randomPerson(seed, r(30) < 0.5 ? 'surfer' : 'lifeguard');
  if (kind === 'thug') return randomPerson(seed, 'syndicate');
  return app;
}
