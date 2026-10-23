// Art v2: World v3's small towns' own models as voxel models (docs/WORLD-V3.md 8.13.2; concepts WR2-A, WR2-C, D13,
// D13-B, D15-A/B, BE1, BE2, SR7): the shopfronts' and houses' porches, the hunting lodge's antlers, the sawmill's saw
// line, log stacks and log loader, the grain elevator's silos, the white church's steeple, the co-op's loading dock,
// the feed store's sacks, the surf shop's board rack and the pier's end shelter. shared/world3-towns.js townModels
// says where (m.townKit); statics.js puts them. Each maker returns a Vox built along +x, its street side toward +y.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
const grain = (x, y, z) => (hash(Math.round(x / 3), Math.round(y), Math.round(z)) > 0.7 ? -0.6 : 0);

// a covered porch along a shopfront or a house (a raised one on stilts at the beach): a plank deck, posts with a rail
// between them (open in the middle for the steps), a shed roof sloping down from the wall; a shopfront's false front
// (ff: its top, col: its boards) - the boarded facade standing up over the porch roof and the gable behind, a stepped top
// (open: a porch over the pavement - the roof on its posts, no hand rail across the walk: shared/world3-towns.js)
export function porch(len = 160, raise = 0, ff = 0, col = '#7a5436', open = 0) {
  const D = 34, m = new Vox(len, D + (raise ? 14 : 0), Math.max(raise + 56, ff + 14));
  const deck = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.6 : 0) }), post = m.mat({ ramp: R('#e8e0cc'), k: 3 });
  const roof = m.mat({ ramp: R('#5a4a3e'), k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.5 : 0) });
  if (ff) {
    const bd = m.mat({ ramp: R(col), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.5 : 0) });
    m.box(0, 0, 40, len, 3, ff, bd);
    m.box(len / 3, 0, ff, (len * 2) / 3, 3, ff + 10, bd);
    m.box(0, 0, ff - 3, len, 4, ff, post); m.box(len / 3 - 2, 0, ff + 8, (len * 2) / 3 + 2, 4, ff + 12, post);
  }
  m.box(0, 0, raise, len, D, raise + 3, deck);
  if (raise) {
    for (let x = 2; x < len - 2; x += 24) for (const y of [2, D - 4]) m.box(x, y, 0, x + 3, y + 3, raise, post);
    for (let k = 0; k < raise / 3; k++) m.box(len / 2 - 10, D + k * 3, raise - k * 3 - 3, len / 2 + 10, D + k * 3 + 3, raise - k * 3, deck);   // the steps down
  }
  const posts = [];
  for (let x = 1; x < len - 4; x += 30) posts.push(x);
  posts.push(len - 4);
  for (const x of posts) m.box(x, D - 4, raise + 3, x + 3, D - 1, raise + 42, post);
  if (!open) for (const x0 of [0, len / 2 + 12]) m.box(x0, D - 3, raise + 16, x0 + len / 2 - 12, D - 2, raise + 18, post);
  for (let y = 0; y < D; y++) { const z = raise + 50 - y * 0.24; m.box(0, y, z, len, y + 1, z + 3, roof); }
  return m;
}
// the hunting lodge's antlers over its door: a dark plaque, the skull, two branched beams
export function antlers() {
  const m = new Vox(36, 6, 26), bone = m.mat({ ramp: R('#ece2cc'), k: 3 }), plate = m.mat({ ramp: R('#4a3020'), k: 3 });
  m.box(12, 0, 0, 24, 3, 12, plate); m.box(15, 2, 2, 21, 6, 10, bone);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 14; k++) { const x = 18 + s * (3 + k); m.box(Math.min(x, x + s * 1.5), 3, 8 + k * 0.7, Math.max(x, x + s * 1.5) + 1, 5, 10 + k * 0.7, bone); }
    for (const t of [4, 8, 12]) { const x = 18 + s * (3 + t); m.box(x, 3, 10 + t * 0.7, x + 1.5, 5, 17 + t * 0.7, bone); }
  }
  return m;
}
// a stack of logs in the mill's yard: rows of bark-brown trunks on two bunks, their cut ends pale
export function logStack(len = 160) {
  const m = new Vox(len, 42, 34), bark = m.mat({ ramp: R('#5a3e2a'), k: 3, shade: grain }), cut = m.mat({ ramp: R('#d8b47a'), k: 3 }), bunk = m.mat({ ramp: R('#3a3c40'), k: 2 });
  for (const x of [10, len - 16]) m.box(x, 1, 0, x + 5, 41, 3, bunk);
  for (let r = 0; r < 3; r++) {
    const n = 4 - r, z = 8 + r * 8.5;
    for (let i = 0; i < n; i++) {
      const y = 21 - (n - 1) * 5 + i * 10, l = len - 4 - ((i * 13 + r * 7) % 12);
      m.cyl('x', 0, y, z, 5, 2, l, bark); m.cyl('x', 0, y, z, 4.4, l - 1, l + 1, cut); m.cyl('x', 0, y, z, 4.4, 1, 3, cut);
    }
  }
  return m;
}
// a log loader: a yellow wheeled loader, its cab, and its grapple holding a log across its front
export function logLoader() {
  const m = new Vox(84, 46, 52), yel = m.mat({ ramp: R('#e0b020'), k: 3 }), dk = m.mat({ ramp: R('#2a2c30'), k: 2 }), tyre = m.mat({ ramp: MAT.tyre, k: 2 });
  const gl = m.mat({ ramp: R('#2a3444'), k: 2, flag: F_GLASS }), bark = m.mat({ ramp: R('#5a3e2a'), k: 3, shade: grain });
  for (const x of [14, 44]) for (const y of [2, 38]) m.cyl('y', x, 0, 10, 10, y, y + 6, tyre);
  m.box(4, 8, 9, 58, 38, 24, yel); m.box(28, 11, 24, 50, 35, 44, yel); m.box(30, 12, 28, 48, 34, 41, gl); m.box(26, 9, 44, 52, 37, 47, dk);
  m.box(56, 20, 16, 70, 26, 30, dk); m.box(68, 4, 22, 76, 42, 34, dk);
  m.cyl('y', 74, 0, 34, 6, 0, 46, bark);
  return m;
}
// the mill's saw line, running into its open shed: a chain conveyor on legs, a log riding in, the head saw's
// housing with its round blade
export function sawLine(len = 112) {
  const m = new Vox(40, len, 48), fr = m.mat({ ramp: R('#5a5e66'), k: 3 }), belt = m.mat({ ramp: R('#2a2a2c'), k: 2, shade: (x, y) => (Math.round(y) % 4 === 0 ? -0.8 : 0) });
  const bark = m.mat({ ramp: R('#5a3e2a'), k: 3, shade: grain }), cut = m.mat({ ramp: R('#d8b47a'), k: 3 }), steel = m.mat({ ramp: MAT.chrome, k: 3 }), yel = m.mat({ ramp: R('#e0b020'), k: 3 });
  for (let y = 4; y < len - 3; y += 22) for (const x of [7, 30]) m.box(x, y, 0, x + 3, y + 3, 14, fr);
  m.box(7, 0, 14, 33, len, 18, belt);
  m.cyl('y', 20, 0, 26, 8, len * 0.42, len - 4, bark); m.cyl('y', 20, 0, 26, 7.4, len - 5, len - 3, cut);
  m.box(2, 8, 14, 38, 26, 42, yel); m.box(2, 8, 42, 38, 26, 45, fr);
  m.cyl('x', 0, 17, 30, 13, 0, 2, steel);
  return m;
}
// the grain elevator's silos: n tall concrete bins in a row with cone caps, a gallery along their tops, a red ladder cage
export function silos(n = 4, span = 360) {
  const r = Math.min(48, Math.floor(span / n / 2) - 2), H = 150, cy = r + 2, m = new Vox(span, r * 2 + 4, H + Math.ceil(r * 0.45) + 14);
  const con = m.mat({ ramp: R('#dcd8cc'), k: 3, shade: (x, y, z) => (Math.round(z) % 18 === 0 ? -0.5 : 0) }), cap = m.mat({ ramp: R('#9aa0a8'), k: 3 });
  const gal = m.mat({ ramp: R('#7a7e86'), k: 3 }), red = m.mat({ ramp: R('#a8402e'), k: 3 });
  for (let i = 0; i < n; i++) {
    const cx = (span / n) * (i + 0.5);
    m.cyl('z', cx, cy, 0, r, 0, H, con);
    m.fill((x, y, z) => { const q = Math.hypot(x - cx, y - cy); return q <= r && z < H + (r - q) * 0.45 ? cap : -1; }, cx - r, cy - r, H, cx + r + 1, cy + r + 1, H + Math.ceil(r * 0.45) + 1);
  }
  m.box(0, cy - 5, H + r * 0.3, span, cy + 5, H + r * 0.3 + 8, gal);
  m.box(span / n - 3, cy + r - 3, 0, span / n + 3, cy + r + 2, H, red);
  return m;
}
// the white church's steeple, standing out from its front: a clapboard tower with the doors in its foot, the belfry's
// louvres, a cornice, a tall slate spire and a gilt cross
export function steeple() {
  const m = new Vox(44, 44, 214), wh = m.mat({ ramp: R('#f2f0ea'), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.4 : 0) });
  const dk = m.mat({ ramp: R('#3a3e46'), k: 2 }), sp = m.mat({ ramp: R('#4a4e58'), k: 3 }), gold = m.mat({ ramp: R('#d8b048'), k: 3 }), door = m.mat({ ramp: R('#6a3a24'), k: 3 });
  m.box(6, 6, 0, 38, 38, 112, wh);
  m.box(15, 37, 0, 29, 38, 30, door); m.box(13, 37, 30, 31, 39, 34, wh);
  m.box(16, 37, 84, 28, 39, 104, dk); m.box(5, 16, 84, 7, 28, 104, dk); m.box(37, 16, 84, 39, 28, 104, dk);
  m.box(4, 4, 110, 40, 40, 115, wh);
  m.fill((x, y, z) => { const hw = 16 * (1 - (z - 115) / 80); return Math.abs(x - 22) <= hw && Math.abs(y - 22) <= hw ? sp : -1; }, 0, 0, 115, 44, 44, 196);
  m.box(21, 21, 196, 23, 23, 212, gold); m.box(17, 21, 203, 27, 23, 205, gold);
  return m;
}
// the co-op's loading dock along its front: a raised concrete deck with a ramp at one end, the yellow edge, rubber
// bumpers, pallets of sacks waiting
export function loadingDock(len = 240) {
  const m = new Vox(len, 40, 30), con = m.mat({ ramp: R('#b8b2a6'), k: 3 }), blk = m.mat({ ramp: R('#2a2a2c'), k: 2 }), pal = m.mat({ ramp: MAT.woodDock, k: 3 });
  const sack = m.mat({ ramp: R('#e8dcc0'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.7 : 0) }), yel = m.mat({ ramp: R('#e0b020'), k: 3 }), L = len - 40;
  m.box(0, 0, 0, L, 36, 16, con);
  for (let k = 0; k < 40; k++) m.box(L + k, 0, 0, L + k + 1, 36, 16 - k * 0.4, con);
  m.box(0, 34, 15, L, 36, 16, yel);
  for (let x = 10; x < L - 10; x += 40) m.box(x, 35, 4, x + 8, 37, 12, blk);
  for (let x = 14; x < L - 34; x += 70) { m.box(x, 6, 16, x + 30, 30, 19, pal); m.box(x + 2, 8, 19, x + 28, 28, 28, sack); }
  return m;
}
// feed sacks stacked on a pallet by the feed store's door
export function feedSacks() {
  const m = new Vox(34, 28, 26), pal = m.mat({ ramp: MAT.woodDock, k: 3 });
  const sk = ['#e8dcc0', '#d8c8a0', '#c8d8b0'].map((c) => m.mat({ ramp: R(c), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.6 : 0) }));
  m.box(1, 1, 0, 33, 27, 4, pal);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) m.box(3 + i * 15 - (r % 2) * 2, 3, 4 + r * 7, 16 + i * 15 - (r % 2) * 2, 25, 10 + r * 7, sk[(r + i) % 3]);
  return m;
}
// the surf shop's boards out front: a timber rack, the boards standing in it, bright
export function boardRack(n = 5) {
  const w = n * 10 + 8, m = new Vox(w, 16, 64), wood = m.mat({ ramp: MAT.woodDock, k: 3 });
  const cols = ['#e8604a', '#2fb0d8', '#f0d040', '#3a9a7a', '#f0eee8', '#d8508a'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(0, 3, 0, w, 13, 3, wood); m.box(0, 6, 24, w, 10, 27, wood); m.box(0, 6, 0, 3, 10, 28, wood); m.box(w - 3, 6, 0, w, 10, 28, wood);
  for (let i = 0; i < n; i++) {
    const cx = 9 + i * 10, mat = cols[i % cols.length];
    m.fill((x, y, z) => { const t = (z - 3) / 58; if (t < 0 || t > 1) return -1; const hw = 4 * Math.sqrt(Math.sin(Math.PI * t)); return Math.abs(x - cx) <= hw && y > 7 && y < 9.6 ? mat : -1; }, cx - 5, 0, 3, cx + 5, 16, 62);
  }
  return m;
}
// the pier's end: a shelter of four white posts under a shingled hip roof, a bench either side
export function pierShelter() {
  const m = new Vox(84, 64, 62), post = m.mat({ ramp: R('#ece6d8'), k: 3 }), roof = m.mat({ ramp: R('#4a5a6a'), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -0.6 : 0) });
  const seat = m.mat({ ramp: MAT.woodDock, k: 3 });
  for (const [x, y] of [[8, 8], [73, 8], [8, 53], [73, 53]]) m.box(x, y, 0, x + 3, y + 3, 42, post);
  for (const y of [14, 44]) { m.box(16, y, 10, 68, y + 6, 13, seat); m.box(16, y + (y < 30 ? 0 : 5), 13, 68, y + (y < 30 ? 1 : 6), 22, seat); }
  for (let z = 0; z < 18; z++) { const k = z * 1.6; m.box(2 + k, 2 + k, 42 + z, 82 - k, 62 - k, 43 + z, roof); }
  return m;
}
