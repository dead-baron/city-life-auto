// Art v2 district props, as voxel models (see voxel.js): the things that make lots and streets read as
// a particular kind of neighbourhood - fences and gates, mailboxes and wheelie bins, power poles, bus
// shelters, fountains, yard toys, pool furniture, junk, rocks, topiary, banner lamps and street kiosks.
// Every maker returns a Vox, built along +x (render at heading PI/2 to run it north-south).
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, F_LEAF, F_WATER, F_THIN, F_GROUND, hash } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);

// ---- fences, walls and gates ------------------------------------------------------------------------
// kind: 'picket' (white, waist high) | 'wood' (privacy boards) | 'chain' (chain-link, optional barbed
// top) | 'iron' (wrought-iron bars with spear tips) | 'stone' (low capped wall) | 'hedgewall'
export function fence(kind = 'picket', len = 60, opt = {}) {
  const H = { picket: 16, wood: 30, chain: 32, iron: 28, stone: 12 }[kind] || 20;
  const m = new Vox(len, 6, H + 6);
  if (kind === 'picket') {
    const w = m.mat({ ramp: R(opt.color || '#ecebe4'), k: 3 });
    for (let x = 0; x < len; x += 4) m.fill((px, py, pz) => (pz < H - Math.abs(px - x - 1) * 1.5 ? w : -1), x, 2, 0, Math.min(len, x + 2), 4, H);
    m.box(0, 3, 4, len, 4, 6, w); m.box(0, 3, 10, len, 4, 12, w);
    for (let x = 0; x < len; x += 24) m.box(x, 1, 0, x + 3, 5, H + 1, w);
  } else if (kind === 'wood') {
    const w = m.mat({ ramp: R(opt.color || '#8a6440'), k: 3, shade: (x) => (Math.floor(x / 5) % 2 ? -0.4 : 0.2) + (Math.round(x) % 5 === 0 ? -0.8 : 0) });
    const post = m.mat({ ramp: R('#6a4a30'), k: 2 });
    m.box(0, 2, 0, len, 4, H, w);
    for (let x = 0; x < len; x += 30) m.box(x, 1, 0, x + 4, 5, H + 2, post);
  } else if (kind === 'chain') {
    const post = m.mat({ ramp: MAT.metal, k: 3 }), mesh = m.mat({ ramp: MAT.metal, k: 2, flag: 0 });
    m.fill((x, y, z) => ((Math.round(x + z) % 4 === 0 || Math.round(x - z + 400) % 4 === 0) && Math.abs(y - 3) < 0.6 ? mesh : -1), 0, 2, 1, len, 4, H);
    for (let x = 0; x < len; x += 32) m.cyl('z', x + 1.5, 3, 0, 1.6, 0, H + 1, post);
    m.box(0, 2, H - 1, len, 4, H, post);
    if (opt.barbed) m.fill((x, y, z) => (Math.hypot((x % 6) - 3, z - (H + 3)) < 2.6 && Math.hypot((x % 6) - 3, z - (H + 3)) > 1.4 && Math.abs(y - 3) < 1 ? post : -1), 0, 0, H, len, 6, H + 6);
  } else if (kind === 'iron') {
    const ir = m.mat({ ramp: R('#2c2e34'), k: 3 }), cap = m.mat({ ramp: R('#b89a58'), k: 3 });
    for (let x = 1; x < len; x += 4) { m.box(x, 2, 0, x + 1, 4, H - 2, ir); m.box(x, 2, H - 2, x + 1, 4, H, cap); }
    m.box(0, 2, 3, len, 4, 4, ir); m.box(0, 2, H - 6, len, 4, H - 5, ir);
  } else if (kind === 'stone') {
    const st = m.mat({ ramp: R(opt.color || '#c8bca6'), k: 3, shade: (x, y, z) => ((Math.round(z) % 4 === 0) || (Math.round(x + (Math.floor(z / 4) % 2) * 5) % 10 === 0) ? -0.8 : 0) });
    const top = m.mat({ ramp: R('#d8d0c0'), k: 4 });
    m.box(0, 0, 0, len, 6, H, st); m.box(0, 0, H, len, 6, H + 2, top);
  }
  return m;
}
// a stone gate pillar with a cap and a lantern on top (lit at night)
export function gatePillar(on = 0, h = 36) {
  const m = new Vox(14, 14, h + 16);
  const st = m.mat({ ramp: R('#cfc3ac'), k: 3, shade: (x, y, z) => (Math.round(z) % 8 === 0 ? -0.7 : 0) }), cap = m.mat({ ramp: R('#ddd4c2'), k: 4 });
  const iron = m.mat({ ramp: R('#2c2e34'), k: 2 }), glass = m.mat({ ramp: R('#f4d9a0', 5, 3), k: 3, emi: on ? [255, 205, 130, 255] : null, flag: F_NOCAST });
  m.box(1, 1, 0, 13, 13, h, st); m.box(0, 0, h, 14, 14, h + 3, cap);
  m.box(4, 4, h + 3, 10, 10, h + 5, iron); m.box(5, 5, h + 5, 9, 9, h + 12, glass); m.box(4, 4, h + 12, 10, 10, h + 14, iron);
  return m;
}
// a wrought-iron double gate (closed), len wide
export function ironGate(len = 70, h = 34) {
  const m = new Vox(len, 6, h + 10);
  const ir = m.mat({ ramp: R('#2c2e34'), k: 3 }), gold = m.mat({ ramp: R('#c8a858'), k: 3 });
  for (let x = 1; x < len; x += 4) { const top = h + 6 * Math.sin(Math.PI * ((x % (len / 2)) / (len / 2))); m.box(x, 2, 0, x + 1, 4, top, ir); m.box(x, 2, top, x + 1, 4, top + 2, gold); }
  for (const z of [4, h - 8, h - 2]) m.box(0, 2, z, len, 4, z + 1, ir);
  m.box(len / 2 - 1, 1, 0, len / 2 + 1, 5, h + 2, ir);
  // scrolls in the middle band
  m.fill((x, y, z) => (Math.abs(Math.hypot((x % 12) - 6, z - (h - 14)) - 4) < 0.7 && Math.abs(y - 3) < 1 ? gold : -1), 0, 0, h - 20, len, 6, h - 8);
  return m;
}

// ---- yard and kerb ----------------------------------------------------------------------------------
export function mailbox(color = '#2c3a66') {
  const m = new Vox(12, 8, 20);
  const post = m.mat({ ramp: MAT.woodDark, k: 3 }), b = m.mat({ ramp: R(color), k: 3 }), flag = m.mat({ ramp: R('#d8343a'), k: 3 });
  m.box(5, 3, 0, 7, 5, 13, post);
  m.box(1, 1, 13, 11, 7, 17, b); m.cyl('x', 0, 4, 17, 3, 1, 11, b);
  m.box(10, 7, 14, 11, 8, 20, flag);
  return m;
}
export function wheelieBin(color = '#3a6a3a') {
  const m = new Vox(12, 12, 20);
  const b = m.mat({ ramp: R(color), k: 3 }), lid = m.mat({ ramp: R(color), k: 4 }), wh = m.mat({ ramp: MAT.tyre, k: 1 });
  m.fill((x, y, z) => (x > 1 + z * 0.04 && x < 11 - z * 0.04 && y > 1 && y < 11 && z < 17 ? b : -1));
  m.box(0, 0, 17, 12, 12, 19, lid); m.box(0, 9, 15, 12, 12, 17, lid);
  m.cyl('y', 3, 0, 2.5, 2.5, 9, 12, wh); m.cyl('y', 9, 0, 2.5, 2.5, 9, 12, wh);
  return m;
}
export function lawnMower() {
  const m = new Vox(22, 14, 22);
  const red = m.mat({ ramp: R('#c83a30'), k: 3 }), blk = m.mat({ ramp: R('#2a2a30'), k: 2 }), wh = m.mat({ ramp: MAT.tyre, k: 1 });
  m.ell(10, 7, 4, 8, 6, 4, red); m.box(6, 5, 7, 12, 9, 10, blk);
  for (const [x, y] of [[4, 1], [16, 1], [4, 12], [16, 12]]) m.cyl('y', x, 0, 2.5, 2.5, y - 1, y + 1, wh);
  for (let k = 0; k < 14; k++) { m.box(0 - k * 0.2 + 2, 2, 6 + k, 3 - k * 0.2 + 2, 3, 7 + k, blk); m.box(2 - k * 0.2, 11, 6 + k, 3 - k * 0.2 + 2, 12, 7 + k, blk); }
  m.box(0, 2, 19, 2, 12, 21, blk);
  return m;
}
export function trampoline(r = 26) {
  const D = r * 2 + 2, m = new Vox(D, D, 14);
  const pad = m.mat({ ramp: R('#2f6ac0'), k: 3 }), mat = m.mat({ ramp: R('#26262c'), k: 2 }), leg = m.mat({ ramp: MAT.metal, k: 2 });
  m.fill((x, y, z) => { const d = Math.hypot(x - r - 1, y - r - 1); return z >= 9 && z < 11 && d < r ? (d > r - 4 ? pad : mat) : -1; });
  for (let a = 0; a < 6; a++) { const x = r + 1 + Math.cos(a * 1.047) * (r - 2), y = r + 1 + Math.sin(a * 1.047) * (r - 2); m.box(x - 1, y - 1, 0, x + 1, y + 1, 9, leg); }
  return m;
}
export function hoop() {
  const m = new Vox(16, 20, 64);
  const pole = m.mat({ ramp: MAT.metalDark, k: 3 }), board = m.mat({ ramp: R('#ecebe4'), k: 3 }), rim = m.mat({ ramp: R('#e86a30'), k: 3 }), net = m.mat({ ramp: R('#e8e8e8'), k: 3, flag: F_NOCAST });
  m.box(6, 2, 0, 9, 5, 52, pole); m.box(6, 2, 50, 9, 10, 53, pole);
  m.box(1, 10, 44, 15, 12, 60, board);
  m.fill((x, y, z) => (Math.abs(Math.hypot(x - 8, y - 15.5) - 3.5) < 0.8 ? rim : -1), 0, 12, 47, 16, 20, 48);
  m.fill((x, y, z) => (Math.abs(Math.hypot(x - 8, y - 15.5) - (3 - (47 - z) * 0.12)) < 0.6 && Math.round(Math.atan2(y - 15.5, x - 8) * 3) % 2 === 0 ? net : -1), 0, 12, 40, 16, 20, 47);
  return m;
}
export function lounger(color = '#f0eee8') {
  const m = new Vox(34, 14, 16);
  const f = m.mat({ ramp: R(color), k: 3, shade: (x) => (Math.round(x) % 3 === 0 ? -0.5 : 0) }), leg = m.mat({ ramp: MAT.metal, k: 2 });
  m.box(2, 1, 5, 24, 13, 7, f);
  for (let k = 0; k < 10; k++) m.box(24 + k * 0.9, 1, 6 + k, 25.5 + k * 0.9, 13, 8 + k, f);
  for (const [x, y] of [[3, 1], [3, 12], [22, 1], [22, 12]]) m.box(x, y, 0, x + 1, y + 1, 5, leg);
  return m;
}
export function patioChair(color = '#f0eee8') {
  const m = new Vox(12, 12, 18);
  const f = m.mat({ ramp: R(color), k: 3 });
  m.box(1, 1, 6, 11, 11, 8, f); m.box(1, 1, 8, 11, 3, 18, f);
  for (const [x, y] of [[1, 1], [10, 1], [1, 10], [10, 10]]) m.box(x, y, 0, x + 1, y + 1, 6, f);
  return m;
}
export function grill() {
  const m = new Vox(16, 12, 22);
  const b = m.mat({ ramp: R('#2a2a30'), k: 3 }), leg = m.mat({ ramp: MAT.metal, k: 2 });
  m.ell(8, 6, 15, 7, 5, 5, b); m.box(1, 1, 0, 2, 2, 12, leg); m.box(14, 1, 0, 15, 2, 12, leg); m.box(1, 10, 0, 2, 11, 12, leg); m.box(14, 10, 0, 15, 11, 12, leg);
  return m;
}
// a round hot tub: a tiled rim, a step, bubbling turquoise water with a little steam
export function hotTub(r = 22) {
  const D = r * 2 + 2, c = r + 1, m = new Vox(D, D, 14);
  const rim = m.mat({ ramp: R('#cfc6b4'), k: 4 }), wall = m.mat({ ramp: R('#b8b0a0'), k: 3 }), st = m.mat({ ramp: R('#a8a090'), k: 3 });
  const w = m.mat({ ramp: R('#4ac8d8'), k: 3, flag: F_WATER, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), 9) > 0.8 ? 1.6 : 0) });
  const steam = m.mat({ ramp: R('#eef6f6'), k: 4, emi: [230, 250, 250, 30], flag: F_NOCAST });
  m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); if (d > r) return -1; if (d > r - 3) return z < 10 ? (z >= 8 ? rim : wall) : -1; return z < 7 ? w : -1; }, 0, 0, 0, D, D, 10);
  m.box(c - 6, D - 4, 0, c + 6, D, 5, st);
  m.fill((x, y, z) => (Math.hypot(x - c, y - c) < r - 5 && hash(Math.round(x), Math.round(y), Math.round(z)) > 0.97 ? steam : -1), 0, 0, 9, D, D, 14);
  return m;
}

// ---- utilities over the street ------------------------------------------------------------------------
// a wooden power pole with a crossarm (across x), insulators and a transformer can. Wires attach at
// (+-arm, height - 3) relative to the pole's foot: see poleTops().
export function powerPole(h = 120, arm = 16) {
  const m = new Vox(arm * 2 + 4, 10, h + 4);
  const wood = m.mat({ ramp: R('#6a5040'), k: 3, flag: F_THIN, shade: (x, y, z) => (hash(0, 0, Math.floor(z / 3)) - 0.5) * 0.6 });
  const ins = m.mat({ ramp: R('#c8d0c8'), k: 3, flag: F_THIN }), can = m.mat({ ramp: MAT.metal, k: 3, flag: F_THIN });
  const c = arm + 2;
  m.cyl('z', c, 5, 0, 2.6, 0, h, wood);
  m.box(1, 4, h - 6, arm * 2 + 3, 7, h - 3, wood);
  for (const x of [2, c - 6, c + 6, arm * 2 + 2]) m.box(x - 1, 4, h - 3, x + 1, 7, h, ins);
  m.cyl('z', c, 9, 0, 3.5, h - 34, h - 20, can);
  m.box(c - 1, 7, h - 20, c + 1, 9, h - 6, wood);
  return m;
}
export const poleTops = (h = 120, arm = 16) => [[-arm, h - 1], [-6, h - 1], [6, h - 1], [arm, h - 1]];

// a bus shelter: glass back and sides, a slim roof, a bench and a lit advert panel at one end
export function busShelter(len = 64, on = 0) {
  const m = new Vox(len, 22, 46);
  const fr = m.mat({ ramp: MAT.metalDark, k: 3 }), gl = m.mat({ ramp: MAT.glass, k: 4, flag: F_GLASS | F_NOCAST });
  const roof = m.mat({ ramp: R('#3a4e5e'), k: 3 }), ad = m.mat({ ramp: R('#e8c070'), k: 4, emi: [255, 220, 150, 60 + on * 180], shade: (x, y, z) => (z > 30 ? 1 : z < 14 ? -1 : 0) });
  const wood = m.mat({ ramp: MAT.woodDock, k: 3 });
  m.box(0, 1, 42, len, 22, 45, roof);
  for (const x of [0, len - 2]) for (const y of [1, 20]) m.box(x, y, 0, x + 2, y + 2, 42, fr);
  m.box(2, 1, 4, len - 2, 2, 40, gl);
  m.box(0, 3, 4, 1, 20, 40, gl);
  m.box(len - 2, 3, 2, len - 1, 20, 40, ad);
  m.box(6, 3, 10, len - 8, 9, 12, wood); for (const x of [8, len - 12]) m.box(x, 4, 0, x + 2, 8, 10, fr);
  return m;
}
// a street lamp with a hanging banner (downtown) - lantern style, banner colour
export function bannerLamp(on = 0, color = '#2a3e7a') {
  const m = new Vox(22, 12, 90);
  const pole = m.mat({ ramp: R('#262a30'), k: 2, flag: F_THIN }), glass = m.mat({ ramp: R('#f4d9a0', 5, 3), k: 3, emi: on ? [255, 205, 130, 255] : null, flag: F_NOCAST });
  const ban = m.mat({ ramp: R(color), k: 3, flag: F_THIN, shade: (x, y, z) => (Math.abs(z - 52) < 5 && Math.abs(x - 15) < 3 ? 2.5 : 0) });
  m.cyl('z', 6, 6, 0, 3.2, 0, 6, pole); m.cyl('z', 6, 6, 0, 1.6, 6, 76, pole);
  m.box(1, 1, 76, 11, 11, 78, pole); m.box(2, 2, 78, 10, 10, 88, glass); m.box(1, 1, 88, 11, 11, 90, pole);
  m.box(7, 5, 66, 20, 7, 67, pole); m.box(9, 5, 38, 20, 7, 66, ban);
  return m;
}
// a free-standing advert kiosk (a lit poster on both faces)
export function adKiosk(on = 0, poster = '#3a6ac0') {
  const m = new Vox(30, 10, 54);
  const fr = m.mat({ ramp: R('#2c2e36'), k: 3 }), p = m.mat({ ramp: R(poster), k: 2, emi: [150, 180, 255, 10 + on * 40], shade: (x, y, z) => (z > 38 ? 1.6 : z > 30 ? 0.8 : z < 18 ? -1 : 0) + ((z < 26 && z > 16 && Math.round(x * 1.7) % 5 < 2 && z < 18 + hash(Math.round(x / 3), 0, 4) * 10) ? -1.8 : 0) });
  m.box(0, 0, 0, 30, 10, 4, fr); m.box(0, 0, 4, 30, 10, 50, fr); m.box(2, -1, 7, 28, 11, 47, p); m.box(-1, -1, 50, 31, 11, 54, fr);
  return m;
}
// a hotel entrance canopy: a slab on two posts, lit underneath (stands in front of a facade)
export function canopy(w = 80, depth = 34, color = '#2a3046', on = 0, h = 54) {
  const m = new Vox(w, depth, h + 8);
  const c = m.mat({ ramp: R(color), k: 3 }), trim = m.mat({ ramp: R('#c8a858'), k: 3 }), post = m.mat({ ramp: MAT.metalDark, k: 3 });
  const lamp = m.mat({ ramp: R('#f8e2b0', 5, 3), k: 4, emi: [255, 214, 150, 80 + on * 175], flag: F_NOCAST });
  m.box(0, 0, h, w, depth, h + 6, c); m.box(0, depth - 2, h - 2, w, depth, h + 7, trim);
  for (const x of [3, w - 6]) m.box(x, depth - 5, 0, x + 3, depth - 2, h, post);
  for (const x of [w * 0.3, w * 0.7]) m.box(x - 3, depth * 0.4, h - 3, x + 3, depth * 0.6, h, lamp);
  return m;
}
// a flagpole-style vertical banner on a building corner (gold on navy)
export function luggageCart() {
  const m = new Vox(18, 10, 30);
  const g = m.mat({ ramp: R('#c8a858'), k: 3 }), c = m.mat({ ramp: R('#8a2e2e'), k: 3 }), b = m.mat({ ramp: R('#4a3a2a'), k: 3 });
  m.box(0, 0, 3, 18, 10, 5, c); for (const x of [0, 16]) m.box(x, 0, 5, x + 2, 10, 30, g); m.box(0, 4, 28, 18, 6, 30, g);
  m.box(3, 2, 5, 9, 8, 15, b); m.box(10, 1, 5, 15, 9, 12, c);
  return m;
}

// ---- water --------------------------------------------------------------------------------------------
// a round fountain: stone basin, water, a central pedestal and bowl, and a spray (it glows a little); sprays false: the
// stone and the still water only, for the game, whose water moves (game/liveart.js fountainSprite): deeper, and lying
// flat like a pond's (F_GROUND: the light rolls little waves over it, glints on them and mirrors the column in it)
export function fountain(r = 30, tiers = 2, sprays = true) {
  const D = r * 2 + 2, m = new Vox(D, D, 56);
  const st = m.mat({ ramp: R('#cfc6b4'), k: 3 }), rim = m.mat({ ramp: R('#ddd6c8'), k: 4 });
  const wat = sprays ? m.mat({ ramp: R('#3aa8c8'), k: 3, flag: F_WATER, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 2), 5) > 0.8 ? 1.5 : 0) })
    : m.mat({ ramp: R('#1f6f9a'), k: 1, flag: F_WATER | F_GROUND });
  const spray = m.mat({ ramp: R('#e8f6f8'), k: 4, emi: [200, 240, 255, 50], flag: F_NOCAST });
  const c = r + 1;
  m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); if (d > r) return -1; if (d > r - 4) return z < 9 ? (z >= 7 ? rim : st) : -1; return z < 6 ? wat : -1; }, 0, 0, 0, D, D, 10);
  m.cyl('z', c, c, 0, 4, 6, 24, st);
  m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); return d < 12 - (z - 24) * 0.3 && d > (z > 26 ? 9 : 0) ? rim : d < 9 && z < 27 ? wat : -1; }, 0, 0, 24, D, D, 28);
  if (tiers > 1) { m.cyl('z', c, c, 0, 2.5, 28, 38, st); m.fill((x, y, z) => (Math.hypot(x - c, y - c) < 6 ? rim : -1), 0, 0, 38, D, D, 40); }
  // the spray: a plume up the middle and arcs falling into the bowls
  if (sprays) m.fill((x, y, z) => { const d = Math.hypot(x - c, y - c); const top = tiers > 1 ? 54 : 44; if (d < 1.6 - (z - 40) * 0.02 && z > (tiers > 1 ? 40 : 28) && z < top) return spray; if (Math.abs(d - (8 + (top - z) * 0.18)) < 0.8 && z > 26 && z < top - 6 && hash(Math.round(x), Math.round(y), 3) > 0.45) return spray; return -1; });
  m.smooth = 1;
  return m;
}
// a rectangular plaza fountain with three jets
export function fountainRect(w = 110, d = 60) {
  const m = new Vox(w, d, 40);
  const st = m.mat({ ramp: R('#cfc6b4'), k: 3 }), rim = m.mat({ ramp: R('#ddd6c8'), k: 4 });
  const wat = m.mat({ ramp: R('#3aa8c8'), k: 3, flag: F_WATER, shade: (x, y) => (hash(Math.round(x / 2), Math.round(y / 3), 5) > 0.82 ? 1.5 : 0) });
  const spray = m.mat({ ramp: R('#e8f6f8'), k: 4, emi: [200, 240, 255, 60], flag: F_NOCAST });
  m.fill((x, y, z) => { const edge = x < 5 || y < 5 || x > w - 5 || y > d - 5; if (edge) return z < 10 ? (z >= 8 ? rim : st) : -1; return z < 6 ? wat : -1; }, 0, 0, 0, w, d, 10);
  for (const [cx, hh] of [[w * 0.3, 22], [w * 0.5, 34], [w * 0.7, 22]]) {
    m.cyl('z', cx, d / 2, 0, 5, 6, 10, st);
    m.fill((x, y, z) => { const dd = Math.hypot(x - cx, y - d / 2); return (dd < 1.8 && z < hh) || (Math.abs(dd - (hh - z) * 0.3) < 0.8 && z > hh - 12 && hash(Math.round(x), Math.round(z), 2) > 0.4) ? spray : -1; }, Math.floor(cx - 10), 0, 10, Math.ceil(cx + 10), d, hh + 1);
  }
  return m;
}

// ---- junk, rough lots -----------------------------------------------------------------------------------
export function pallet() { const m = new Vox(24, 20, 6); const w = m.mat({ ramp: R('#a8865a'), k: 3 }); for (let y = 0; y < 20; y += 4) m.box(0, y, 4, 24, y + 3, 6, w); for (const x of [0, 10, 21]) m.box(x, 0, 0, x + 3, 20, 4, w); return m; }
export function cardboard() { const m = new Vox(14, 12, 12); const b = m.mat({ ramp: R('#b8925a'), k: 3 }), t = m.mat({ ramp: R('#d8c8a0'), k: 3 }); m.box(0, 0, 0, 14, 12, 10, b); m.box(0, 5, 10, 14, 7, 11, t); m.box(-1, 0, 9, 3, 12, 12, b); return m; }
export function trashBag(color = '#2a2a30') { const m = new Vox(14, 12, 14); const b = m.mat({ ramp: R(color), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 7) > 0.8 ? 1.2 : 0) }); m.ell(7, 6, 5, 6.5, 5.5, 5.5, b); m.ell(7, 6, 11, 2, 2, 2.5, b); return m; }
export function tires(n = 3) { const m = new Vox(18, 18, n * 5 + 1); const t = m.mat({ ramp: MAT.tyre, k: 2 }); for (let i = 0; i < n; i++) m.fill((x, y) => { const d = Math.hypot(x - 9, y - 9); return d < 8 && d > 4 ? t : -1; }, 0, 0, i * 5, 18, 18, i * 5 + 4); return m; }
export function mattress() { const m = new Vox(40, 26, 6); const b = m.mat({ ramp: R('#d8d0b8'), k: 3, shade: (x, y) => ((Math.round(x) % 8 === 0 || Math.round(y) % 8 === 0) ? -0.6 : 0) + (Math.hypot(x - 26, y - 10) < 6 ? -1.2 : 0) }); m.box(0, 0, 0, 40, 26, 5, b); return m; }
export function oilDrum(color = '#3a5a8a', rust = 0) { const m = new Vox(12, 12, 18); const b = m.mat({ ramp: R(rust ? '#8a5a3a' : color), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.8 : 0) + (rust && hash(Math.round(x), Math.round(z), 3) > 0.7 ? -0.8 : 0) }); m.cyl('z', 6, 6, 0, 5.5, 0, 18, b); return m; }
export function warningSign() { const m = new Vox(14, 4, 22); const s = m.mat({ ramp: R('#e8e4d8'), k: 3, shade: (x, y, z) => (Math.hypot(x - 7, z - 15) < 3 ? -2.5 : 0) }), p = m.mat({ ramp: MAT.metal, k: 2 }); m.box(6, 1, 0, 8, 3, 12, p); m.box(1, 1, 10, 13, 2, 22, s); return m; }

// ---- rocks and planting -----------------------------------------------------------------------------------
export function boulder(seed = 1, size = 22, color = '#7a7068') {
  const m = new Vox(size + 4, size + 4, Math.ceil(size * 0.8) + 2);
  const st = m.mat({ ramp: R(color, 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(y / 3), Math.round(z / 3) + seed) - 0.5) * 1.6 });
  const c = size / 2 + 2;
  m.fill((x, y, z) => {
    const a = Math.atan2(y - c, x - c), wob = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 5 + seed * 2) * 0.08 + (hash(Math.round(x / 4), Math.round(y / 4), seed) - 0.5) * 0.12;
    const q = ((x - c) / (size / 2 * wob)) ** 2 + ((y - c) / (size / 2 * wob)) ** 2 + ((z + 2) / (size * 0.75)) ** 2;
    return q <= 1 ? st : -1;
  });
  m.smooth = 2;
  return m;
}
// a potted topiary: 'ball' | 'cone' | 'spiral'
export function topiary(kind = 'ball', pot = '#b5553c') {
  const m = new Vox(16, 16, kind === 'ball' ? 30 : 46);
  const p = m.mat({ ramp: R(pot), k: 3, shade: (x, y, z) => (z > 9 ? 0.8 : 0) }), lf = m.mat({ ramp: MAT.leafDark, k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) > 0.75 ? 1 : 0) });
  const tr = m.mat({ ramp: MAT.bark, k: 2 });
  m.fill((x, y, z) => (Math.hypot(x - 8, y - 8) < 6.5 - (10 - z) * 0.12 ? p : -1), 0, 0, 0, 16, 16, 11);
  if (kind === 'ball') { m.box(7, 7, 11, 9, 9, 16, tr); m.ell(8, 8, 22, 7, 7, 7, lf); }
  else m.fill((x, y, z) => { const t = (z - 11) / 34; const r = 7 * (1 - t) + (kind === 'spiral' && Math.round(z) % 8 < 2 ? -2 : 0); return Math.hypot(x - 8, y - 8) < r ? lf : -1; }, 0, 0, 11, 16, 16, 46);
  m.smooth = 1;
  return m;
}
// a raised stone planter box (trees and flowers go on top of it; height 10)
export function planterBox(w = 34, d = 34, flowers = true) {
  const m = new Vox(w, d, 16);
  const st = m.mat({ ramp: R('#c8bca8'), k: 3 }), cap = m.mat({ ramp: R('#d8d0c0'), k: 4 }), soil = m.mat({ ramp: MAT.soil, k: 2 });
  const lf = m.mat({ ramp: MAT.leaf, k: 3, flag: F_LEAF }), fls = ['#d84a78', '#e8c040', '#f0ece8', '#c04050'].map((h) => m.mat({ ramp: R(h), k: 3, flag: F_LEAF }));
  m.box(0, 0, 0, w, d, 9, st); m.box(0, 0, 9, w, d, 10, cap); m.box(3, 3, 9, w - 3, d - 3, 10, soil);
  if (flowers) m.fill((x, y, z) => { const hh = hash(Math.round(x), Math.round(y), 31); const top = 10 + 2 + hh * 4; if (x < 3 || y < 3 || x > w - 3 || y > d - 3 || z >= top) return -1; if (Math.hypot(x - w / 2, y - d / 2) < 5) return -1; return z > top - 1.2 && hh > 0.5 ? fls[Math.floor(hh * 40) % 4] : lf; }, 0, 0, 10, w, d, 16);
  return m;
}
export function tennisNet(len = 100) {
  const m = new Vox(6, len, 14);
  const p = m.mat({ ramp: MAT.metalDark, k: 3 }), n = m.mat({ ramp: R('#e8e8e4'), k: 2, flag: F_NOCAST }), t = m.mat({ ramp: R('#f4f4f0'), k: 4 });
  for (const y of [0, len - 2]) m.box(2, y, 0, 4, y + 2, 14, p);
  m.fill((x, y, z) => ((Math.round(y) % 3 === 0 || Math.round(z) % 3 === 0) && z < 11 ? n : -1), 2, 2, 1, 4, len - 2, 11);
  m.box(2, 2, 11, 4, len - 2, 13, t);
  return m;
}
export function viewer() {
  const m = new Vox(14, 10, 40);
  const b = m.mat({ ramp: MAT.metalDark, k: 3, flag: F_THIN }), br = m.mat({ ramp: R('#4a6a7a'), k: 3, flag: F_THIN });
  m.cyl('z', 7, 5, 0, 2, 0, 28, b); m.box(3, 2, 28, 11, 8, 34, br); m.cyl('y', 4, 0, 33, 2, 6, 10, b); m.cyl('y', 10, 0, 33, 2, 6, 10, b);
  return m;
}
export function railing(len = 80) {
  const m = new Vox(len, 4, 22);
  const ir = m.mat({ ramp: R('#2c3038'), k: 3 });
  m.box(0, 1, 19, len, 3, 21, ir); m.box(0, 1, 10, len, 3, 11, ir);
  for (let x = 0; x < len; x += 10) m.box(x, 1, 0, x + 2, 3, 21, ir);
  return m;
}

// ---- Lucky Mesa's Strip (shared/world3-strip.js, 2026-10-20; the owner's LuckyMesa-B2): a poolside cabana, the
// skybridge's glass span and its towers, a resort's porte-cochere (stone, or a casino's marquee of bulbs), the adobe
// resort's timber pergola and the boulevard's banner poles. Original designs: no real venue or brand.
const RS = (h, n = 6, k = 3) => ramp(h, n, k);
const STRIPES = ['#2a8a8a', '#2a4a8a', '#d8604a', '#d8a83a'];

// a cabana (w 44 along x, 40 deep): four white posts, a low canvas top with a striped valance, the back curtain drawn
// and the side curtains tied back at the front, a daybed with cushions, a lantern under the top (v: the stripe)
export function cabana(v = 0) {
  const W = 44, D = 40, m = new Vox(W, D, 50), col = STRIPES[v % STRIPES.length];
  const canvas = m.mat({ ramp: RS('#f2eee4'), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -0.25 : 0) });
  const stripe = m.mat({ ramp: RS(col), k: 3 }), post = m.mat({ ramp: RS('#e8e2d4'), k: 3, flag: F_THIN });
  const bed = m.mat({ ramp: RS('#f6f4ee'), k: 3 }), base = m.mat({ ramp: MAT.woodDark, k: 3 }), cush = m.mat({ ramp: RS(col), k: 3 });
  const lamp = m.mat({ ramp: RS('#ffd890', 5, 3), k: 4, emi: [255, 200, 120, 220], flag: F_NOCAST });
  for (const [x, y] of [[1, 1], [W - 4, 1], [1, D - 4], [W - 4, D - 4]]) m.box(x, y, 0, x + 3, y + 3, 42, post);
  // the top: a low hip of canvas over the posts, the valance scalloped round its edge in stripes
  m.fill((x, y, z) => { const e = Math.min(x, W - x, y, D - y); return z < 42 + Math.min(6, e * 0.35) ? canvas : -1; }, 0, 0, 42, W, D, 48);
  m.fill((x, y, z) => {
    const edge = x < 1.5 || x > W - 1.5 || y < 1.5 || y > D - 1.5;
    if (!edge) return -1;
    const u = edge && (y < 1.5 || y > D - 1.5) ? x : y, sc = (Math.round(u) % 8) < 4 ? 0 : 2;
    return z >= 36 + sc ? (Math.floor(u / 6) % 2 ? stripe : canvas) : -1;
  }, 0, 0, 36, W, D, 42);
  // the curtains: the back one drawn, the sides' gathered at the back and tied at the front posts
  m.box(1, 0, 2, W - 1, 2, 38, canvas);
  for (const x of [0, W - 2]) { m.box(x, 2, 6, x + 2, 12, 38, canvas); m.box(x, D - 7, 4, x + 2, D - 4, 38, canvas); }
  // the daybed, its cushions, the lantern
  m.box(6, 8, 0, W - 6, D - 8, 6, base); m.box(7, 9, 6, W - 7, D - 9, 11, bed);
  for (const x of [10, 19, 28]) m.box(x, 9, 11, x + 7, 13, 17, cush);
  m.box(W / 2 - 2, D / 2 - 2, 34, W / 2 + 2, D / 2 + 2, 39, lamp);
  return m;
}

// the skybridge's span (len along y, 64 across x, its floor at the model's foot - the item lifts it): the floor slab
// on two steel box girders, glass walls between steel posts, a barrel roof of glass panes on steel ribs, warm light
// inside (its glow through the glass after dark)
export function skySpan(len = 150) {
  const W = 64, m = new Vox(W, len, 46);
  const steel = m.mat({ ramp: RS('#5a636c'), k: 3 }), slab = m.mat({ ramp: RS('#c8c2b6'), k: 3 }), white = m.mat({ ramp: RS('#dcdcd6'), k: 3 });
  const glass = m.mat({ ramp: RS('#5ab0c4', 6, 3), k: 3, flag: F_GLASS, gloss: 0.7, emi: [255, 214, 150, 70], shade: (x, y) => ((Math.round(x) + Math.round(y)) % 9 < 2 ? 0.5 : 0) });
  const strip = m.mat({ ramp: RS('#ffe0a0', 5, 3), k: 4, emi: [255, 210, 140, 200], flag: F_NOCAST });
  // the girders and the floor
  for (const x of [1, W - 6]) m.box(x, 0, 0, x + 5, len, 8, steel);
  m.box(0, 0, 8, W, len, 11, slab);
  m.box(0, 0, 0, W, len, 1.5, white);
  // the walls: glass between posts every 12 px, a rail and a top chord
  for (const x of [0, W - 2]) {
    m.box(x, 0, 11, x + 2, len, 34, glass);
    for (let y = 0; y < len; y += 12) m.box(x, y, 11, x + 2, y + 2, 34, steel);
    m.box(x, 0, 32, x + 2, len, 35, steel); m.box(x, 0, 18, x + 2, len, 19.5, white);
  }
  // the roof: a low barrel of panes on ribs, the light strip along the ridge's underside
  m.fill((x, y, z) => {
    const u = (x - W / 2) / (W / 2), top = 35 + 9 * (1 - u * u);
    if (z > top || z < top - 2.2) return -1;
    return Math.round(y) % 12 < 2 || Math.abs(u) > 0.94 || Math.abs(x - W / 2) < 1 ? steel : glass;
  }, 0, 0, 33, W, len, 46);
  m.box(W / 2 - 3, 0, 40, W / 2 + 3, len, 41, strip);
  return m;
}
// a skybridge tower (60 x 60, h tall): a stone base, a glass box on a steel frame (its escalators and lift inside), a
// cap overhanging it, the doors on the south face lit, a gold band under the cap
export function skyTower(h = 144) {
  const W = 60, m = new Vox(W, W, h + 4);
  const stone = m.mat({ ramp: RS('#d4c4a4'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.5 : 0) }), steel = m.mat({ ramp: RS('#5a636c'), k: 3 });
  const glass = m.mat({ ramp: RS('#4a9ab0', 6, 3), k: 3, flag: F_GLASS, gloss: 0.7, emi: [255, 210, 150, 60], shade: (x, y, z) => ((Math.round(x + y) + Math.round(z)) % 11 < 2 ? 0.5 : 0) });
  const cap = m.mat({ ramp: RS('#e2dccc'), k: 3 }), gold = m.mat({ ramp: RS('#d8a848', 6, 3), k: 3, emi: [255, 200, 110, 120] });
  const door = m.mat({ ramp: RS('#2a3a44'), k: 2, flag: F_GLASS, emi: [255, 214, 150, 160] });
  m.box(2, 2, 0, W - 2, W - 2, 12, stone);
  m.box(4, 4, 12, W - 4, W - 4, h - 12, glass);
  for (const [x, y] of [[4, 4], [W - 7, 4], [4, W - 7], [W - 7, W - 7]]) m.box(x, y, 12, x + 3, y + 3, h - 10, steel);
  for (let z = 30; z < h - 14; z += 28) { m.box(4, 4, z, W - 4, 5, z + 2, steel); m.box(4, W - 5, z, W - 4, W - 4, z + 2, steel); m.box(4, 4, z, 5, W - 4, z + 2, steel); m.box(W - 5, 4, z, W - 4, W - 4, z + 2, steel); }
  m.box(W / 2 - 10, W - 5, 12, W / 2 + 10, W - 3, 42, door);
  m.box(4, 4, h - 12, W - 4, W - 4, h - 8, gold);
  m.box(0, 0, h - 8, W, W, h, cap);
  return m;
}

// a porte-cochere (w along x, d deep, its soffit h up): a deep slab on four columns, its fascia gold, spots under it -
// or (kind 1) a casino's marquee: the fascia pink neon between rows of chasing bulbs
export function porte(w = 300, d = 96, h = 58, kind = 0) {
  const m = new Vox(w, d, h + 16);
  const col = m.mat({ ramp: RS(kind ? '#e8dcd8' : '#e2d6bc'), k: 3, shade: (x, y, z) => (Math.round(z) % 10 === 0 ? -0.3 : 0) });
  const slab = m.mat({ ramp: RS(kind ? '#3a2434' : '#d8ccb0'), k: 3 }), top = m.mat({ ramp: RS(kind ? '#4a3444' : '#cfc2a6'), k: 3, shade: (x, y) => (Math.round(x) % 24 === 0 ? -0.4 : 0) });
  const fascia = m.mat({ ramp: RS(kind ? '#ff60c0' : '#d8a848', 6, 3), k: 3, emi: kind ? [255, 90, 200, 230] : [255, 200, 110, 90] });
  const bulb = m.mat({ ramp: RS('#fff0c0', 5, 3), k: 4, emi: [255, 220, 150, 255], flag: F_NOCAST }), spot = m.mat({ ramp: RS('#fff4d8', 5, 3), k: 4, emi: [255, 226, 170, 255], flag: F_NOCAST });
  m.box(0, 0, h, w, d, h + 10, slab); m.box(2, 2, h + 10, w - 2, d - 2, h + 12, top);
  // the fascia round the slab (the bulbs above and below it on a marquee)
  for (const [x0, y0, x1, y1] of [[0, d - 2, w, d], [0, 0, 2, d], [w - 2, 0, w, d], [0, 0, w, 2]]) {
    m.box(x0, y0, h + 3, x1, y1, h + 8, fascia);
    if (kind) for (const z of [h + 1, h + 9]) m.fill((x, y) => ((Math.round(x) + Math.round(y)) % 6 < 2 ? bulb : -1), x0, y0, z, x1, y1, z + 1.5);
  }
  for (const [x, y] of [[14, 14], [w - 14, 14], [14, d - 16], [w - 14, d - 16]]) m.cyl('z', x, y, 0, 5, 0, h, col);
  for (let x = 30; x < w - 20; x += 40) for (const y of [d * 0.3, d * 0.7]) m.box(x - 3, y - 3, h - 1, x + 3, y + 3, h, spot);
  return m;
}
// the adobe resort's pergola over its drive (w along x, d deep, h to the beams): thick timber posts on stone footings,
// two beams along it, the rafters across them running out past both (vigas), lanterns hung under them
export function timberPergola(w = 380, d = 96, h = 60) {
  const m = new Vox(w, d, h + 14);
  const post = m.mat({ ramp: MAT.woodDark, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(z / 4), 3) - 0.5) * 0.5 }), foot = m.mat({ ramp: RS('#cbb894'), k: 3 });
  const beam = m.mat({ ramp: RS('#6a4a2e'), k: 3, shade: (x) => (Math.round(x) % 30 === 0 ? -0.5 : 0) }), raft = m.mat({ ramp: RS('#7a5838'), k: 3 });
  const lamp = m.mat({ ramp: RS('#ffcf80', 5, 3), k: 4, emi: [255, 190, 110, 240], flag: F_NOCAST }), wire = m.mat({ ramp: MAT.metalDark, k: 2, flag: F_THIN });
  const n = Math.max(2, Math.round(w / 120));
  for (let i = 0; i <= n; i++) for (const y of [8, d - 18]) {
    const x = Math.round(8 + (w - 26) * i / n);
    m.box(x - 1, y - 1, 0, x + 11, y + 11, 8, foot); m.box(x, y, 8, x + 10, y + 10, h, post);
  }
  for (const y of [8, d - 18]) m.box(0, y - 1, h, w, y + 11, h + 7, beam);
  for (let x = 4; x < w - 4; x += 14) m.box(x, 0, h + 7, x + 6, d, h + 12, raft);
  for (let x = 40; x < w - 30; x += 70) { m.box(x, d / 2 - 0.5, h - 10, x + 1, d / 2 + 0.5, h + 7, wire); m.box(x - 3, d / 2 - 3, h - 18, x + 4, d / 2 + 4, h - 10, lamp); }
  return m;
}
// a lamp post on the Strip's median with two banners on brackets (v: their colours swapped), its lantern on top
export function bannerPole(v = 0) {
  const m = new Vox(32, 8, 100);
  const pole = m.mat({ ramp: RS('#3a3430'), k: 3, flag: F_THIN }), gold = m.mat({ ramp: RS('#c8a048'), k: 3 });
  const a = m.mat({ ramp: RS(v % 2 ? '#c8503a' : '#2a8a8a'), k: 3, shade: (x, y, z) => (Math.round(z) % 12 === 0 ? -0.3 : 0) }), b = m.mat({ ramp: RS(v % 2 ? '#2a8a8a' : '#c8503a'), k: 3 });
  const sun = m.mat({ ramp: RS('#ffd070', 5, 3), k: 3, emi: [255, 200, 110, 60] });
  const lamp = m.mat({ ramp: RS('#ffe0a0', 5, 3), k: 4, emi: [255, 214, 150, 255], flag: F_NOCAST });
  m.box(15, 2, 0, 18, 5, 88, pole); m.box(13, 0, 0, 20, 7, 6, pole);
  m.box(4, 3, 76, 28, 4, 78, pole);
  for (const [x0, M] of [[4, a], [19, b]]) {
    m.box(x0, 3, 44, x0 + 9, 4.5, 76, M);
    m.fill((x, y, z) => ((x - x0 - 4.5) ** 2 + (z - 62) ** 2 < 6.5 ? sun : -1), x0, 2, 58, x0 + 9, 3, 67);
    m.box(x0, 3, 43, x0 + 9, 4.5, 44.5, gold);
  }
  m.box(13, 0, 88, 20, 7, 96, lamp); m.box(12, 0, 96, 21, 8, 99, pole);
  return m;
}
