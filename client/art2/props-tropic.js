// Art v2 tropical props (the nature showcase, 2026-10-31: the owner's concepts NA1-E, the paradise coral cay, and SC3-H,
// the jungle lagoon): the thatched beach bar, a thatched hut up on stilts, the scarlet and blue-and-gold macaws, a sea
// turtle, a snorkeler face down in the shallows, a mangrove on its arching roots, a clump of red ginger. Voxel models
// (voxel.js), 1 voxel = 1 world px (a person stands ~42); x along the front (east at heading 0), y across, z up.
import { Vox } from './voxel.js';
import { GBuf, F_LEAF, F_NOCAST, F_GROUND, hash, vnoise } from './gbuf.js';
import { ramp } from './palette.js';

const R = (c, n = 6, k) => ramp(c, n, k);
// thatch: palm-leaf bundles in courses - a dark seam under each, lighter straw ends, a few frayed tips
const thatchMat = (m, base = '#b8904a', seed = 3) => m.mat({ ramp: R(base), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -1.1 : 0) + (hash(Math.round(x / 2), Math.round(y / 2) + Math.round(z), seed) - 0.5) * 0.9 });
// a hipped thatch roof over [x0, x1] x [y0, y1] from eave height z0, rising at slope k, overhanging by o; the eaves
// fringed (an uneven lower edge)
function thatchRoof(m, mat, x0, y0, x1, y1, z0, k, o, seed) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = (x1 - x0) / 2 + o, hy = (y1 - y0) / 2 + o, top = z0 + Math.min(hx, hy) * k;
  m.fill((x, y, z) => {
    const d = Math.min(hx - Math.abs(x + 0.5 - cx), hy - Math.abs(y + 0.5 - cy));
    if (d < 0) return -1;
    const s = z0 + d * k - (d < 2.5 ? Math.floor(hash(Math.round(x), Math.round(y), seed) * 3) : 0);
    return z <= s && z >= s - 3.5 && z <= top ? mat : -1;
  }, Math.floor(cx - hx), Math.floor(cy - hy), z0 - 4, Math.ceil(cx + hx), Math.ceil(cy + hy), Math.ceil(top) + 1);
}

// the beach bar (NA1-E): a thatched hut open to the front, bamboo posts, a counter of planks with stools, the shelf of
// bottles glowing after dark (on), a surfboard and a menu board by it, string lights under the eave
export function thatchBar(on = 0.5) {
  const w = 100, d = 60, H = 40, m = new Vox(w + 24, d + 34, H + 40);
  const bam = m.mat({ ramp: R('#c8a860'), k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -1.2 : 0) });
  const plank = m.mat({ ramp: R('#9a6c44'), k: 3, shade: (x) => (Math.round(x) % 10 === 0 ? -0.9 : 0) + (hash(Math.floor(x / 10), 2, 5) - 0.5) * 0.6 });
  const weave = m.mat({ ramp: R('#b49460'), k: 3, shade: (x, y, z) => ((Math.round(x + y) + Math.round(z)) % 4 < 2 ? -0.6 : 0.3) });
  const dark = m.mat({ ramp: R('#3a2a20', 5, 2), k: 1 }), th = thatchMat(m, '#c09a52', 7), ridge = thatchMat(m, '#8a6a38', 9);
  const bot = ['#d8342e', '#e8b830', '#3a8ad8', '#5ab84a', '#f0f0e8', '#f08a2a'].map((c) => m.mat({ ramp: R(c, 5, 3), k: 4, emi: on ? [255, 210, 150, Math.round(50 * on)] : null }));
  const bulb = m.mat({ ramp: R('#ffe0a0', 4, 3), k: 4, emi: on ? [255, 220, 150, Math.round(120 * on)] : null });
  const x0 = 12, y0 = 6, x1 = x0 + w, y1 = y0 + d;
  m.box(x0, y0, 0, x1, y1, 2, plank);                                                   // the deck
  m.box(x0 + 2, y0, 2, x1 - 2, y0 + 4, H, weave);                                        // the woven back wall
  m.box(x0, y0, 2, x0 + 3, y1 - 18, H, weave); m.box(x1 - 3, y0, 2, x1, y1 - 18, H, weave);
  for (const [x, y] of [[x0, y0], [x1 - 4, y0], [x0, y1 - 4], [x1 - 4, y1 - 4], [x0 + w / 2 - 2, y1 - 4]]) m.box(x, y, 0, x + 4, y + 4, H + 6, bam);
  m.box(x0 + 6, y1 - 20, 2, x1 - 6, y1 - 14, 18, plank);                                // the counter's front
  m.box(x0 + 4, y1 - 22, 18, x1 - 4, y1 - 12, 21, m.mat({ ramp: R('#c49a62'), k: 4 }));  // its top
  for (const z of [14, 24]) {                                                           // the shelves of bottles
    m.box(x0 + 8, y0 + 4, z, x1 - 8, y0 + 9, z + 1, dark);
    for (let x = x0 + 10; x < x1 - 10; x += 4) { const k = Math.floor(hash(x, z, 5) * bot.length), h = 3 + Math.floor(hash(x, z, 6) * 4); m.box(x, y0 + 5, z + 1, x + 2, y0 + 8, z + 1 + h, bot[k]); }
  }
  for (let k = 0; k < 5; k++) { const sx = x0 + 14 + k * 18; m.box(sx, y1 - 6, 0, sx + 2, y1 - 4, 11, bam); m.ell(sx + 1, y1 - 5, 12, 4, 4, 1.4, plank); }   // the stools
  thatchRoof(m, th, x0, y0, x1, y1, H, 0.5, 10, 11);
  m.box(x0 + 6, y0 + d / 2 - 2, H + 18, x1 - 6, y0 + d / 2 + 2, H + 22, ridge);              // the ridge's bound bundle
  for (let x = x0 - 6; x <= x1 + 6; x += 6) m.box(x, y1 + 6, H - 3 - ((x / 6) & 1), x + 2, y1 + 8, H - 1 - ((x / 6) & 1), bulb);   // string lights along the front eave
  // the surfboard leant on the east end, the menu board on its easel by the west
  m.fill((x, y, z) => (Math.abs(x - (x1 + 6) - (z - 20) * 0.12) < 1.5 && Math.abs(y - (y0 + 18)) < 4 - Math.abs(z - 20) * 0.08 && z < 40 ? bot[2] : -1), x1 + 1, y0 + 12, 0, x1 + 12, y0 + 25, 41);
  m.box(x0 - 9, y1 - 2, 0, x0 - 8, y1, 22, dark); m.box(x0 - 3, y1 - 2, 0, x0 - 2, y1, 22, dark); m.box(x0 - 10, y1, 8, x0 - 1, y1 + 1, 22, m.mat({ ramp: R('#2a302c'), k: 2 }));
  return m;
}

// a thatched hut up on stilts over the water (NA1-E's at the mangroves' boardwalk end and on the islet): the posts
// standing in the water, a deck all round, walls of planks with a door and a window, the steep thatch, a ladder
export function stiltHut(w = 64, d = 52, lift = 22, tin = 0) {
  const m = new Vox(w + 20, d + 22, lift + 74);
  const post = m.mat({ ramp: R('#6a4a32'), k: 3, shade: (x, y, z) => (z < lift * 0.4 ? -1 : 0) });   // (dark and wet low down)
  const deck = m.mat({ ramp: R('#a07850'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.9 : 0) });
  const wall = m.mat({ ramp: R('#8e6a48'), k: 3, shade: (x, y, z) => (Math.round(x + y) % 7 === 0 ? -1 : 0) + (hash(Math.floor((x + y) / 7), 3, 7) - 0.5) * 0.6 });
  const dark = m.mat({ ramp: R('#2a1e18', 5, 2), k: 1 }), glass = m.mat({ ramp: R('#e0c070', 4, 3), k: 3, emi: [255, 200, 120, 40] });
  const roof = tin ? m.mat({ ramp: R('#7a8a8a'), k: 3, shade: (x) => (Math.round(x) % 6 < 2 ? -0.7 : 0.2) }) : thatchMat(m, '#b48e4c', 13);
  const x0 = 10, y0 = 8, x1 = x0 + w, y1 = y0 + d, z = lift;
  for (let x = x0; x <= x1 - 4; x += (w - 4) / 3) for (const y of [y0, y1 - 4]) m.box(Math.round(x), y, 0, Math.round(x) + 4, y + 4, z + 2, post);
  m.box(x0 - 2, y0 - 2, z, x1 + 2, y1 + 4, z + 3, deck);
  for (let x = x0 - 2; x < x1 + 2; x += 6) m.box(x, y1 + 2, z + 3, x + 1, y1 + 4, z + 12, post);   // the deck's rail
  m.box(x0 - 2, y1 + 2, z + 11, x1 + 2, y1 + 4, z + 13, deck);
  const wx0 = x0 + 6, wx1 = x1 - 6, wy0 = y0 + 4, wy1 = y1 - 10;
  m.box(wx0, wy0, z + 3, wx1, wy1, z + 30, wall);
  m.box(wx0 + 10, wy1 - 1, z + 3, wx0 + 22, wy1 + 1, z + 22, dark);                           // the door, open
  m.box(wx1 - 22, wy1 - 1, z + 12, wx1 - 10, wy1 + 1, z + 22, glass);                        // the window
  thatchRoof(m, roof, wx0, wy0, wx1, wy1, z + 30, tin ? 0.45 : 0.85, 9, 17);
  for (let k = 0; k < 6; k++) m.box(x0 + 2, y1 + 4, Math.round(k * z / 6), x0 + 10, y1 + 6, Math.round(k * z / 6) + 1, deck);   // the ladder's rungs
  m.box(x0 + 2, y1 + 4, 0, x0 + 3, y1 + 6, z, post); m.box(x0 + 9, y1 + 4, 0, x0 + 10, y1 + 6, z, post);
  return m;
}

// a macaw (k 0 scarlet: red, the yellow and blue wing; 1 blue-and-gold), perched upright, the long tail hanging; or (fly)
// wings out
export function macaw(k = 0, fly = false) {
  const m = new Vox(fly ? 30 : 12, fly ? 30 : 10, 22);
  const C = k ? ['#2a6ad8', '#f0c030', '#2aa0d8'] : ['#d82a26', '#f0c030', '#2a5ad8'];
  const body = m.mat({ ramp: R(C[0]), k: 3 }), belly = m.mat({ ramp: R(k ? C[1] : C[0]), k: 3 }), wing = m.mat({ ramp: R(C[2]), k: 3 }), band = m.mat({ ramp: R(C[1]), k: 3 });
  const face = m.mat({ ramp: R('#f4f0e8'), k: 3 }), beak = m.mat({ ramp: R('#2a2a2e', 5, 2), k: 2 });
  if (fly) {
    m.ell(15, 15, 12, 7, 2.6, 2.4, body); m.ell(22, 15, 12.5, 2.6, 2.4, 2.4, body); m.box(24, 14, 12, 26, 16, 13, beak);
    for (const s of [-1, 1]) m.fill((x, y, z) => { const t = Math.abs(y - 15) / 13; return t > 0.15 && t <= 1 && Math.abs(x - 15 + t * 3) < 4 - t * 2 && Math.abs(z - 13 - t * 2) < 1 ? (t > 0.7 ? wing : t > 0.45 ? band : body) : -1; }, 8, s < 0 ? 1 : 15, 9, 22, s < 0 ? 15 : 29, 17);
    m.box(1, 14, 11, 9, 16, 12, body);
    return m;
  }
  m.ell(6, 5, 11, 3, 2.6, 5, body); m.ell(6.4, 5, 9, 2.4, 2.4, 3.5, belly);
  m.ell(4.6, 5, 11, 2, 3, 4, wing); m.box(4, 2.5, 9, 6, 7.5, 11, band);
  m.ell(7, 5, 16.5, 2.2, 2.2, 2.2, body); m.box(8, 4, 16, 9, 6, 18, face); m.box(9, 4.5, 15, 10.5, 5.5, 17, beak);
  m.box(3, 4.5, 0, 5, 5.5, 7, body); m.box(2, 4.5, 0, 3, 5.5, 3, wing);                        // the long tail hanging
  m.box(5, 3.5, 5, 9, 6.5, 6, beak);                                                         // feet on the branch
  return m;
}

// a green sea turtle swimming (from above: the patterned shell, the flippers out)
export function seaTurtle(seed = 1) {
  const m = new Vox(34, 30, 7);
  const shell = m.mat({ ramp: R('#6a6a3a'), k: 3, shade: (x, y) => { const cx = Math.floor((x - 4) / 6), cy = Math.floor((y - 3) / 6); return ((x - 4) % 6 < 1 || (y - 3) % 6 < 1 ? -1.2 : 0) + (hash(cx, cy, seed) - 0.5) * 0.9; } });
  const skin = m.mat({ ramp: R('#8a9a6a'), k: 3, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), seed + 1) > 0.7 ? -0.8 : 0) });
  m.ell(16, 15, 3, 10, 8, 3, shell);
  m.ell(28, 15, 3, 4, 3, 2.2, skin);
  m.fill((x, y, z) => (z < 3 && Math.abs((y - 15) - (x - 20) * 1.1) < 2.6 && x > 18 && x < 27 && Math.abs(y - 15) > 6 ? skin : -1));   // (the front flippers, swept back... )
  m.fill((x, y, z) => (z < 3 && Math.abs(-(y - 15) - (x - 20) * 1.1) < 2.6 && x > 18 && x < 27 && Math.abs(y - 15) > 6 ? skin : -1));
  m.ell(7, 9, 2, 3, 2, 1.2, skin); m.ell(7, 21, 2, 3, 2, 1.2, skin); m.box(3, 14, 1, 6, 16, 2, skin);
  return m;
}

// someone snorkelling, face down (k: the shorts' colour): the mask strap, the snorkel up, the fins
export function snorkeler(k = 0) {
  const m = new Vox(46, 18, 9);
  const skin = m.mat({ ramp: R(['#c88a60', '#8a5a3a', '#e0a882'][k % 3]), k: 3 }), shorts = m.mat({ ramp: R(['#d83a3a', '#2a6ad8', '#e8a030'][k % 3]), k: 3 });
  const fin = m.mat({ ramp: R('#2a7ad8'), k: 3 }), mask = m.mat({ ramp: R('#1a1a20', 5, 2), k: 2 }), tube = m.mat({ ramp: R('#f0d020'), k: 4 }), hair = m.mat({ ramp: R('#2a1e16', 5, 2), k: 2 });
  m.ell(30, 9, 3, 7, 4.2, 2.6, skin);                                           // the back
  m.ell(21, 9, 3, 4, 4.2, 2.6, shorts);
  for (const s of [-1, 1]) { m.box(8, 9 + s * 2.5 - 1, 2, 20, 9 + s * 2.5 + 1, 4, skin); m.fill((x, y, z) => (x < 8 && x > 1 && Math.abs(y - 9 - s * 3.5) < 2.2 - (8 - x) * 0.1 && z > 1 && z < 3 ? fin : -1)); }
  for (const s of [-1, 1]) m.box(34, 9 + s * 7, 2, 42, 9 + s * 7 + 1, 4, skin);   // the arms out ahead
  m.ell(39, 9, 4, 3, 3, 2.6, hair); m.box(38, 5.5, 3, 40, 12.5, 5, mask);
  m.box(36, 11, 4, 37, 12, 9, tube);
  return m;
}

// a mangrove on its arching prop roots, the canopy a dense low dome (s: its size, 1 about two tiles across); without
// roots (j), the jungle's broad-leaved tree: a taller trunk, a crown of dark lumps
export function mangrove(seed = 1, s = 1, j = 0) {
  const W = Math.round(64 * s), Hh = Math.round(60 * s), m = new Vox(W, W, Hh);
  const root = m.mat({ ramp: R(j ? '#5a4a3a' : '#6a5040'), k: 3, shade: (x, y, z) => (z < 6 && !j ? -1.2 : 0) });
  const leaf = m.mat({ ramp: R(j ? '#38702a' : '#2e5622'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2), seed + Math.round(z / 3)) > 0.72 ? 1 : 0) - (hash(Math.round(x), Math.round(y), seed + 5) < 0.18 ? 1 : 0) });
  const leaf2 = m.mat({ ramp: R(j ? '#6a9a36' : '#40702a'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2), seed + 9 + Math.round(z / 2)) - 0.5) * 2.2 });
  const c = W / 2, tz = Hh * (j ? 0.5 : 0.42);
  m.box(c - 2, c - 2, j ? 0 : tz * 0.5, c + 2, c + 2, tz + 6, root);
  for (let i = 0; i < (j ? 0 : 9); i++) {   // the roots: arcs from the trunk out and down into the water
    const a = (i / 9) * 6.283 + hash(i, 1, seed) * 0.6, L = W * (0.26 + hash(i, 2, seed) * 0.14), h0 = tz * (0.55 + hash(i, 3, seed) * 0.35);
    for (let t = 0; t <= 1; t += 0.04) { const r = t * L, z = h0 * (1 - t * t) + 3 * Math.sin(t * 3.14); m.box(c + Math.cos(a) * r - 1, c + Math.sin(a) * r - 1, Math.max(0, z - 1), c + Math.cos(a) * r + 1, c + Math.sin(a) * r + 1, z + 1, root); }
  }
  for (let i = 0; i < 14; i++) { const a = hash(i, 4, seed) * 6.283, r = W * 0.3 * Math.sqrt(hash(i, 5, seed)); m.ell(c + Math.cos(a) * r, c + Math.sin(a) * r, tz + Hh * 0.18 + hash(i, 6, seed) * 8, W * (0.13 + hash(i, 7, seed) * 0.07), W * (0.13 + hash(i, 8, seed) * 0.07), Hh * 0.15, i % 3 ? leaf : leaf2); }
  return m;
}

// a clump of red ginger (SC3-H's red flowers at the jungle's edge): tall leaves, the red bracts on stalks
export function redGinger(seed = 1) {
  const m = new Vox(30, 24, 40);
  const lf = m.mat({ ramp: R('#3e7e2e'), k: 3, flag: F_LEAF }), red = m.mat({ ramp: R('#e0302a'), k: 3 }), pink = m.mat({ ramp: R('#f06a7a'), k: 3 });
  for (let i = 0; i < 11; i++) {
    const a = hash(i, 1, seed) * 6.283, L = 10 + hash(i, 2, seed) * 8, x0 = 15 + Math.cos(a) * 3, y0 = 12 + Math.sin(a) * 3;
    for (let t = 0; t <= 1; t += 0.05) m.box(x0 + Math.cos(a) * L * t - 1, y0 + Math.sin(a) * L * t * 0.6 - 1, 4 + t * 26 - t * t * 10, x0 + Math.cos(a) * L * t + 1 + (t > 0.3 && t < 0.8 ? 1 : 0), y0 + Math.sin(a) * L * t * 0.6 + 1, 6 + t * 26 - t * t * 10, lf);
  }
  for (let i = 0; i < 4; i++) { const x = 9 + hash(i, 3, seed) * 12, y = 8 + hash(i, 4, seed) * 8, h = 24 + hash(i, 5, seed) * 10; m.box(x, y, 0, x + 1, y + 1, h - 5, lf); m.ell(x + 0.5, y + 0.5, h - 2, 2, 2, 4, i & 1 ? pink : red); }
  return m;
}

// the surf breaking white over a reef band or at a falls' foot (a flat sprite on the water): a band len px long (along
// x; vert: along y) of churned foam, its middle solid, ragged and broken toward its edges, the line wandering
export function surfBand(len = 160, seed = 1, vert = 0, wide = 14) {
  const W = vert ? wide * 2 + 8 : len, H = vert ? len : wide * 2 + 8, G = new GBuf(W, H);
  G.ax = W / 2; G.ay = H / 2;
  const F = [[250, 252, 250], [226, 240, 242], [196, 226, 232], [168, 214, 222]];
  for (let u = 0; u < len; u++) {
    const c = wide + 4 + Math.sin(u * 0.045 + seed) * wide * 0.35 + (vnoise(u, 3, 20, seed) - 0.5) * wide * 0.5, hw = wide * (0.65 + 0.45 * vnoise(u, 7, 26, seed + 3)) * Math.min(1, u / 16, (len - u) / 16);
    for (let v = Math.floor(c - hw - 3); v <= Math.ceil(c + hw + 3); v++) {
      const d = Math.abs(v - c) / Math.max(1, hw), n = vnoise(u, v, 5, seed + 5) * 0.6 + hash(u, v, seed + 7) * 0.4;
      if (d > 1 + n * 0.4 || (d > 0.8 && n < 0.3 + (d - 0.8) * 1.5)) continue;
      const k = Math.min(3, Math.floor(d * 2.2 + (1 - n) * 1.2));
      if (vert) G.put(v, u, F[k], [0, 0, 1], 1, null, F_GROUND | F_NOCAST); else G.put(u, v, F[k], [0, 0, 1], 1, null, F_GROUND | F_NOCAST);
    }
  }
  return G;
}
