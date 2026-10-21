// Art v2 garden and wetland props for the biome scenes (biomescenes.js: N1 redwoods, N2 rainforest, N6
// botanical garden, N7 wetlands) - the pieces the shared kits did not have yet:
//   garden   greenhouse (glass shell over potted plants, warm glow inside), gardenStatue (a robed figure
//            with a vase on a round plinth), stoneLantern (toro, lit firebox), redBridge (vermilion arched
//            bridge), beehive, raisedBed, gardenShed, orchardLadder, fruitCrate, gardenWall, rake
//   wetland  fishingPier (planks on posts out over the water, a hanging lantern), boardwalk (a raised plank
//            walk on posts with rails), infoSign (a slanted interpretive panel), beaverDam / beaverLodge (piles
//            of peeled sticks and mud), beaver, swan
//   sprites  hedgeBox(w, d, h) - a clipped hedge of any footprint (top and south face, clumpy foliage, roses
//            optional), crouch(sprite) - a standing person cut down to a kneel
//   ground   rakedGravel(G, test, stones) - pale gravel raked in rings round stones and straight rows
//            elsewhere; koi(G, x, y, a, kind) - a fish painted into pond water
// Voxel models (voxel.js) unless noted: render(heading) faces the camera at heading 0. Sprites are GBufs
// anchored at their foot (.ax, .ay).
import { Vox } from './voxel.js';
import { GBuf, F_WATER, F_NOCAST, F_LEAF, F_GLASS, F_GROUND, F_WET, F_THIN, hash, bayer, vnoise, mulberry32 } from './gbuf.js';
import { MAT, ramp } from './palette.js';
import * as F from './flora.js';

const R = (c, n = 6, k) => ramp(c, n, k ?? Math.floor((n - 1) / 2));
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const pick = (Rm, t, x, y, d = 0.6) => Rm[Math.max(0, Math.min(Rm.length - 1, Math.round(t * (Rm.length - 1) + bayer(x, y) * d)))];
const nz = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const STONE = R('#c8c0b0', 7, 3), MARBLE = R('#e2ddd2', 7, 4), IRON = R('#3a3c44', 6, 3), WOOD = MAT.woodDock, WOODD = MAT.woodDark;

// ---- greenhouse -------------------------------------------------------------------------------------------
// A Victorian glasshouse: stone plinth, white-grey iron frame, gable roof running east-west, double doors in
// the south gable (the ridge runs north-south, so the camera sees the gable end). The glass is drawn see-through: the floor and the potted plants inside are rendered first,
// then the glass shell is blended over them (warm glow when `on`), then the frame on top.
export function greenhouse(w = 150, d = 80, h = 40, roofH = 30, on = 0.5, seed = 1) {
  const H = h + roofH + 3, c = d / 2, cx = w / 2, bay = 15;
  const roofZ = (x) => h + roofH * (1 - Math.abs(x - cx) / cx);
  const full = new Vox(w, d, H), floor = new Vox(w, d, H);
  const mats = (m) => ({
    fr: m.mat({ ramp: R('#5e6c76', 6, 3), k: 3, shade: (x, y, z) => (z > h ? 0.5 : 0) }),
    gl: m.mat({ ramp: R('#6a9eb0', 6, 3), k: 2, flag: F_GLASS | F_NOCAST, shade: (x, y, z) => ((Math.round(x + z * 0.6) % 23 < 2) ? 1.6 : 0) + (hash(Math.floor(x / bay), Math.floor(z / 9) + Math.floor(y / 9), seed) - 0.5) * 0.6 }),
    pl: m.mat({ ramp: STONE, k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 || Math.round(x + (Math.floor(z / 3) % 2) * 5) % 10 === 0 ? -1 : 0) }),
    fl: m.mat({ ramp: R('#b8846a', 6, 3), k: 3, shade: (x, y) => (Math.round(x) % 6 === 0 || Math.round(y) % 6 === 0 ? -0.8 : (hash(Math.floor(x / 6), Math.floor(y / 6), seed) - 0.5) * 0.6) }),
  });
  const A = mats(full), B = mats(floor);
  const frameX = (x) => x < 2 || x > w - 3 || Math.round(x) % bay < 2 || Math.round(x) % bay === Math.round(bay / 2);
  full.fill((x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), wall = yi === 0 || yi === d - 1, end = xi === 0 || xi === w - 1;
    if (z < 1) return A.fl;
    if ((wall || end) && z < 6) return A.pl;
    const rz = roofZ(x);
    if (wall && z < rz - 1) { const door = yi === d - 1 && Math.abs(x - cx) < 11; if (door && z < 34) return Math.abs(Math.abs(x - cx) - 10.5) < 1 || Math.abs(x - cx) < 0.8 || Math.round(z) === 33 || Math.round(z) % 11 === 0 ? A.fr : A.gl; return frameX(x) || Math.round(z) === h - 1 || z < 8 || Math.round(z) === 22 || z > rz - 3.2 || (z > h && Math.round(z - h) % 10 === 0) ? A.fr : A.gl; }
    if (end && z < h) return Math.round(y) % bay < 2 || z < 8 || z >= h - 2 ? A.fr : A.gl;
    if (z >= rz - 1.6 && z <= rz + 0.4) return Math.round(y) % bay < 2 || Math.abs(x - cx) < 1.6 || xi < 2 || xi > w - 3 || yi < 2 || yi > d - 3 || Math.abs(Math.abs(x - cx) - cx * 0.5) < 0.8 ? A.fr : A.gl;
    return -1;
  });
  floor.fill((x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y); if (z < 1) return B.fl; if ((yi === 0 || yi === d - 1 || xi === 0 || xi === w - 1) && z < 6) return B.pl; return -1; });
  const S = floor.render(0), Gf = full.render(0);
  // potted plants inside, back to front
  const rnd = mulberry32(seed * 97 + 5), plants = [];
  const makers = [(s) => F.banana(s), (s) => F.monstera(s), (s) => F.fern(s, 22), (s) => F.birdOfParadise(s), (s) => F.hibiscus(s), (s) => F.datePalm(s), (s) => F.elephantEar(s)];
  for (let i = 0; i < Math.round(w * d / 380); i++) plants.push([6 + rnd() * (w - 12), 8 + rnd() * (d - 14), Math.floor(rnd() * makers.length)]);
  plants.sort((a, b) => a[1] - b[1]);
  for (const [x, y, k] of plants) { const p = makers[k](seed * 13 + Math.round(x)); S.blit(p, Math.round(S.ax + x - w / 2 - p.ax), Math.round(S.ay + y - d / 2 - p.ay)); }
  for (let i = 0; i < S.w * S.h; i++) if (!Gf.col[i * 4 + 3]) S.col[i * 4 + 3] = 0; // nothing pokes out through the glass
  // the shell over them: glass blended, frame and plinth opaque
  for (let i = 0; i < S.w * S.h; i++) {
    const j = i * 4; if (!Gf.col[j + 3]) continue;
    if (Gf.flag[i] & F_GLASS) {
      if (S.col[j + 3]) { const k = 0.36; for (let q = 0; q < 3; q++) S.col[j + q] = S.col[j + q] * (1 - k) + Gf.col[j + q] * k; S.flag[i] |= F_GLASS; }
      else { for (let q = 0; q < 4; q++) { S.col[j + q] = Gf.col[j + q]; S.nrm[j + q] = Gf.nrm[j + q]; } S.z[i] = Gf.z[i]; S.flag[i] = Gf.flag[i]; }
      if (on) { S.emi[j] = 255; S.emi[j + 1] = 196; S.emi[j + 2] = 120; S.emi[j + 3] = Math.max(S.emi[j + 3], 14 * on); }
    } else { for (let q = 0; q < 4; q++) { S.col[j + q] = Gf.col[j + q]; S.nrm[j + q] = Gf.nrm[j + q]; S.emi[j + q] = Gf.emi[j + q]; } S.z[i] = Gf.z[i]; S.flag[i] = Gf.flag[i]; }
  }
  return S;
}

// ---- statues, lanterns, bridges ------------------------------------------------------------------------------
// a modern sculpture on its stone plinth (the Arts District's museum forecourt, WC070): v 0 painted blocks stacked at
// angles, 1 a red ring stood on its edge, 2 a bronze twist rising to a point
export function sculpture(v = 0) {
  const m = new Vox(36, 36, 92), c = 18;
  const st = m.mat({ ramp: STONE, k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.5 : 0) });
  m.box(5, 5, 0, 31, 31, 3, st); m.box(8, 8, 3, 28, 28, 14, st);
  if (v === 1) {
    const red = m.mat({ ramp: R('#c8342e', 6, 3), k: 3, gloss: 0.3 });
    m.fill((x, y, z) => { const r = Math.hypot(x + 0.5 - c, z - 50); return Math.abs(y + 0.5 - c) < 3 && r > 26 && r < 33 && z >= 14 ? red : -1; }, 0, 0, 14, 36, 36, 92);
  } else if (v === 2) {
    const br = m.mat({ ramp: R('#8a6a3a', 6, 3), k: 3, gloss: 0.4 });
    m.fill((x, y, z) => { const t = (z - 14) / 76, a = t * 5.2, r = 7 * (1 - t) + 1, ox = Math.cos(a) * 3, oy = Math.sin(a) * 3; return Math.hypot(x + 0.5 - c - ox, y + 0.5 - c - oy) < r ? br : -1; }, 0, 0, 14, 36, 36, 90);
  } else {
    const cols = ['#e0b040', '#2a5aa0', '#c8343a', '#f0ece4'].map((h) => m.mat({ ramp: R(h, 6, 3), k: 3 }));
    for (let k = 0; k < 4; k++) { const s2 = 16 - k * 2, ox = [0, 4, -3, 2][k], oy = [0, -3, 2, 3][k], z0 = 14 + k * 17; m.box(c - s2 / 2 + ox, c - s2 / 2 + oy, z0, c + s2 / 2 + ox, c + s2 / 2 + oy, z0 + 17, cols[k]); }
  }
  return m;
}
// a pale marble figure in a long robe holding a vase at her shoulder, on a round stepped plinth
export function gardenStatue() {
  const m = new Vox(30, 30, 82), c = 15;
  const st = m.mat({ ramp: STONE, k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -0.6 : 0) }), mb = m.mat({ ramp: MARBLE, k: 4, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 4) > 0.9 ? -0.6 : 0) + (Math.round(Math.atan2(y - c, x - c) * 6 + z * 0.15) % 2 ? -0.35 : 0) });
  m.cyl('z', c, c, 0, 14, 0, 4, st); m.cyl('z', c, c, 0, 11.5, 4, 8, st); m.cyl('z', c, c, 0, 7.5, 8, 30, st); m.cyl('z', c, c, 0, 9.5, 30, 33, st);
  m.fill((x, y, z) => {
    const zz = z - 33; if (zz < 0) return -1;
    if (zz < 32) { const r = 6.2 - zz * 0.07 + (zz < 6 ? (6 - zz) * 0.35 : 0); return Math.hypot((x - c) / 1.05, y - c) < r ? mb : -1; }
    if (zz < 35) return Math.hypot(x - c, y - c) < 2.2 ? mb : -1;
    if (zz < 42) return Math.hypot(x - c, y - c - 0.5, (zz - 38.5) * 1.1) < 3.6 ? mb : -1;
    return -1;
  });
  // the raised arm and the vase on the shoulder, the other arm down the side
  for (let k = 0; k < 10; k++) m.box(c + 4 + k * 0.25, c - 1, 33 + 20 + k, c + 6.5 + k * 0.25, c + 2, 33 + 22 + k, mb);
  m.ell(c + 7, c, 33 + 34, 3.4, 3.2, 3.6, mb); m.box(c + 6, c - 1, 33 + 37, c + 8.5, c + 1.5, 33 + 40, mb);
  m.box(c - 7.5, c - 1, 33 + 10, c - 5, c + 2, 33 + 26, mb);
  m.smooth = 1;
  return m;
}
// a Japanese stone lantern (toro): foot, post, platform, a firebox with lit windows, a flared cap, finial
export function stoneLantern(on = 0.5) {
  const m = new Vox(22, 22, 44), c = 11;
  const st = m.mat({ ramp: R('#a6a296', 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2) + Math.round(z / 2) * 7, 9) - 0.5) * 0.9 });
  const ms = m.mat({ ramp: F.FOL('#5e8a2c'), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.2 });   // (moss: the stone's crust, holds still - gbuf.js)
  const fire = m.mat({ ramp: R('#f8c070', 5, 2), k: 3, emi: on ? [255, 190, 100, 255 * on] : null, flag: F_NOCAST });
  m.cyl('z', c, c, 0, 8, 0, 3, st); m.cyl('z', c, c, 0, 3.4, 3, 16, st); m.box(c - 7, c - 7, 16, c + 7, c + 7, 19, st);
  m.box(c - 5, c - 5, 19, c + 5, c + 5, 28, st);
  m.box(c - 3, c - 6, 21, c + 3, c + 6, 26, fire); m.box(c - 6, c - 3, 21, c + 6, c + 3, 26, fire);
  m.fill((x, y, z) => { const t = (z - 28) / 7, r = 10 - t * 7.5 + (Math.abs(x - c) > 7 && Math.abs(y - c) > 7 ? 1.2 : 0); return Math.max(Math.abs(x - c), Math.abs(y - c)) < r ? (t < 0.3 && hash(Math.round(x), Math.round(y), 3) > 0.7 ? ms : st) : -1; }, 0, 0, 28, 22, 22, 35);
  m.ell(c, c, 37, 2.2, 2.2, 2.6, st); m.box(c - 0.6, c - 0.6, 39, c + 0.6, c + 0.6, 42, st);
  m.box(c - 8, c - 8, 0, c + 8, c + 8, 1, ms);
  m.smooth = 1;
  return m;
}
// a vermilion arched footbridge: plank deck on an arc, posts with black caps, two rails following the arch
export function redBridge(len = 110, w = 24, rise = 18) {
  const m = new Vox(len, w, rise + 24);
  const red = m.mat({ ramp: R('#c0382c', 6, 3), k: 3 }), deck = m.mat({ ramp: R('#9a4632', 6, 3), k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.9 : 0) }), cap = m.mat({ ramp: R('#2e2a30', 5, 2), k: 2 });
  const top = (x) => rise * Math.sin(Math.PI * clamp(x / len));
  m.fill((x, y, z) => (z <= top(x) + 1.5 && z >= top(x) - 2.5 ? (y < 3 || y > w - 3 ? red : deck) : -1), 0, 0, 0, len, w, rise + 3);
  for (const y0 of [0, w - 3]) {
    m.fill((x, yy, z) => { const t = top(x); return Math.abs(z - (t + 15)) < 1.3 || Math.abs(z - (t + 8)) < 0.8 ? red : -1; }, 0, y0, 0, len, y0 + 3, rise + 24);
    for (let x = 2; x < len; x += 14) { const t = top(x); m.box(x, y0, Math.max(0, t - 3), x + 3, y0 + 3, t + 17, red); m.box(x - 0.5, y0 - 0.5, t + 17, x + 3.5, y0 + 3.5, t + 19, cap); }
  }
  return m;
}

// ---- garden kit -----------------------------------------------------------------------------------------------
// a stacked wooden beehive on a low stand: three boxes in faded paints, a metal lid
export function beehive(color = '#e0b850', seed = 1) {
  const m = new Vox(18, 16, 26);
  const stand = m.mat({ ramp: WOODD, k: 3 }), lid = m.mat({ ramp: R('#c89a58', 6, 3), k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -0.6 : 0) }), dark = m.mat({ ramp: R('#3a2e2a', 5, 2), k: 1 });
  const boxes = [color, '#f0e6c8', color].map((c, i) => m.mat({ ramp: R(c, 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.9 : 0) + (hash(i, Math.round(x / 3), seed) - 0.5) * 0.4 }));
  for (const x of [2, 14]) for (const y of [2, 12]) m.box(x, y, 0, x + 2, y + 2, 4, stand);
  m.box(1, 1, 4, 17, 15, 5, stand);
  for (let i = 0; i < 3; i++) m.box(2, 2, 5 + i * 6, 16, 14, 11 + i * 6, boxes[i]);
  m.box(6, 13, 6, 12, 14, 7, dark);
  m.box(1, 1, 23, 17, 15, 26, lid);
  return m;
}
// a raised vegetable bed: plank sides, dark crumbly soil in rows (plants go on top: soil sits at z = h)
export function raisedBed(w = 60, d = 26, h = 9, seed = 1) {
  const m = new Vox(w, d, h);
  const pl = m.mat({ ramp: R('#8a6440', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -1 : 0) + (hash(Math.floor(x / 20), Math.round(z / 4), seed) - 0.5) * 0.6 });
  const so = m.mat({ ramp: R('#5a3e2a', 6, 3), k: 2, shade: (x, y) => (Math.round(y) % 6 < 2 ? 0.7 : 0) + (hash(Math.round(x), Math.round(y), seed) > 0.85 ? 0.6 : 0) });
  m.fill((x, y, z) => (x < 2 || y < 2 || x > w - 2 || y > d - 2 ? pl : z < h - 2 ? so : -1));
  return m;
}
// a small plank garden shed with a blue door, a lean-to tin roof and a window
export function gardenShed(w = 52, d = 38, h = 34, door = '#3a6a8a') {
  const m = new Vox(w, d, h + 14);
  const pl = m.mat({ ramp: R('#8a6240', 6, 3), k: 3, shade: (x, y, z) => (Math.round(x) % 5 === 0 ? -0.9 : 0) + (hash(Math.floor(x / 5), 3, 7) - 0.5) * 0.5 });
  const tin = m.mat({ ramp: R('#7c8088', 6, 3), k: 3, shade: (x) => (Math.round(x) % 4 === 0 ? -0.8 : 0.2) });
  const dr = m.mat({ ramp: R(door, 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 7 === 0 ? -0.7 : 0) }), win = m.mat({ ramp: R('#4a6878', 5, 2), k: 1, flag: F_GLASS });
  const rz = (y) => h + 10 - (y / d) * 12;
  m.fill((x, y, z) => { if (x < 2 || x > w - 3 || y < 2 || y > d - 3) { if (z < rz(y) - 1) return pl; } if (z >= rz(y) - 1.5 && z < rz(y) + 0.5) return tin; return -1; });
  m.box(w * 0.55, d - 2, 0, w * 0.55 + 14, d, 26, dr); m.box(6, d - 2, 14, 18, d, 24, win);
  return m;
}
// an orchard tripod ladder leaning into a tree (len along x: the foot at x=0, the head at x=len)
export function orchardLadder(h = 44) {
  const m = new Vox(14, 18, h + 2), w = m.mat({ ramp: R('#a87a48', 6, 3), k: 3 });
  for (let z = 0; z < h; z++) { const t = z / h, y0 = 2 + t * 5, y1 = 15 - t * 5; m.box(1 + t * 5, y0, z, 3 + t * 5, y0 + 1.6, z + 1, w); m.box(1 + t * 5, y1, z, 3 + t * 5, y1 + 1.6, z + 1, w); if (z % 6 === 3) m.box(1 + t * 5, y0, z, 3 + t * 5, y1 + 1.6, z + 1, w); m.box(11 - t * 4, 8, z, 13 - t * 4, 10, z + 1, w); }
  return m;
}
// a slatted crate heaped with fruit (apples by default)
export function fruitCrate(fruit = '#c8302a', seed = 1) {
  const m = new Vox(18, 14, 14);
  const wd = m.mat({ ramp: R('#b08a58', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 3 === 0 ? -1 : 0) }), fr = m.mat({ ramp: R(fruit, 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2), seed) > 0.75 ? -0.8 : 0.2) });
  m.fill((x, y, z) => (x < 1.5 || y < 1.5 || x > 16.5 || y > 12.5 || z < 1 ? (z < 9 ? wd : -1) : -1));
  for (let i = 0; i < 16; i++) { const x = 3 + (i % 4) * 3.8 + hash(i, 1, seed) * 1, y = 3 + Math.floor(i / 4) * 2.6; m.ell(x, y, 9 + hash(i, 2, seed) * 1.5, 2, 2, 1.9, fr); }
  m.smooth = 1;
  return m;
}
// a brick garden wall with a stone coping (len along x); `piers` adds a pier every that many px
export function gardenWall(len = 120, h = 30, piers = 60) {
  const m = new Vox(len, 10, h + 6);
  const br = m.mat({ ramp: R('#8e5a44', 6, 3), k: 3, shade: (x, y, z) => { const r = Math.floor(z / 3), off = (r % 2) * 4; return (Math.round(z) % 3 === 0 || Math.round(x + off) % 8 === 0 ? -1 : 0) + (hash(Math.floor((x + off) / 8), r, 5) - 0.5) * 0.7; } });
  const cp = m.mat({ ramp: STONE, k: 4, shade: (x) => (Math.round(x) % 12 === 0 ? -0.8 : 0) });
  const mo = m.mat({ ramp: F.FOL('#4e7e2a'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(z), 4) - 0.5) * 1.3 });
  m.box(0, 1, 0, len, 9, h, br); m.box(0, 0, h, len, 10, h + 3, cp);
  if (piers) for (let x = 0; x <= len - 12; x += piers) { m.box(x, 0, 0, x + 12, 10, h + 3, br); m.box(x - 1, -1, h + 3, x + 13, 11, h + 6, cp); }
  m.fill((x, y, z) => (z < 5 && y > 8 && hash(Math.round(x / 2), Math.round(z), 3) > 0.55 ? mo : -1), 0, 8, 0, len, 10, 5);
  return m;
}
// a garden rake leaning on its tines
export function rake() {
  const m = new Vox(10, 8, 34), h = m.mat({ ramp: R('#a87a48', 6, 3), k: 3 }), t = m.mat({ ramp: MAT.metalDark, k: 2 });
  for (let z = 2; z < 34; z++) m.box(4 + z * 0.12, 3, z, 5.5 + z * 0.12, 4.5, z + 1, h);
  m.box(1, 2, 1, 9, 6, 3, t); for (let x = 1; x < 9; x += 2) m.box(x, 2, 0, x + 1, 3, 1, t);
  return m;
}

// ---- wetland kit --------------------------------------------------------------------------------------------
// a wooden fishing pier running out along x: plank deck `h` above the water on posts, a low rail along the
// north side, a tall post at the end with an arm and a hanging lantern (lit with `on`)
export function fishingPier(len = 120, w = 30, h = 10, on = 0.6) {
  const m = new Vox(len, w, h + 44);
  const plank = m.mat({ ramp: R('#8a6646', 6, 3), k: 3, shade: (x, y) => (Math.round(x) % 6 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 6), 1, 3) - 0.5) * 0.7 + (hash(Math.round(x), Math.round(y), 4) > 0.95 ? -0.6 : 0) });
  const post = m.mat({ ramp: R('#5a4030', 6, 3), k: 3, shade: (x, y, z) => (z < 3 ? -0.8 : 0) }), fr = m.mat({ ramp: IRON, k: 2 });
  const glass = m.mat({ ramp: R('#f8d080', 5, 3), k: 4, emi: [255, 196, 110, 255 * on], flag: F_NOCAST | F_GLASS });
  m.box(0, 3, h - 3, len, w - 3, h, plank);
  for (let x = 2; x < len; x += 24) for (const y of [2, w - 5]) m.box(x, y, 0, x + 3, y + 3, y < 5 ? h + 14 : h + 2, post);
  m.box(0, 2, h + 11, len - 4, 5, h + 14, post); m.box(0, 2, h + 5, len - 4, 4, h + 7, post);
  // the lantern post at the end
  const lx = len - 6; m.box(lx, 2, 0, lx + 4, 6, h + 42, post); m.box(lx - 12, 3, h + 38, lx + 2, 5, h + 41, post);
  m.box(lx - 11, 3.5, h + 32, lx - 10, 4.5, h + 38, fr); m.box(lx - 13, 2, h + 23, lx - 8, 6, h + 25, fr); m.box(lx - 13, 2, h + 25, lx - 8, 6, h + 31, glass); m.box(lx - 13.5, 1.5, h + 31, lx - 7.5, 6.5, h + 33, fr);
  m.lamp = { x: lx - 10.5 - len / 2, y: 4 - w / 2, z: h + 28 };
  return m;
}
// a raised plank boardwalk (len along x) on short posts, rails on the north (rails 'n'), south ('s') or both
export function boardwalk(len = 160, w = 30, h = 8, rails = 'ns') {
  const m = new Vox(len, w, h + 24);
  const plank = m.mat({ ramp: R('#8a6646', 6, 3), k: 3, shade: (x, y) => (Math.round(x) % 5 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 5), 1, 9) - 0.5) * 0.6 });
  const post = m.mat({ ramp: R('#5e4434', 6, 3), k: 3 }), rail = m.mat({ ramp: R('#7a5a40', 6, 3), k: 3 });
  m.box(0, 3, h - 3, len, w - 3, h, plank); m.box(0, 4, 0, len, 6, h - 3, post); m.box(0, w - 6, 0, len, w - 4, h - 3, post);
  for (const side of rails) { const y = side === 'n' ? 1 : w - 4; for (let x = 2; x < len; x += 20) m.box(x, y, 0, x + 3, y + 3, h + 18, post); m.box(0, y, h + 15, len, y + 3, h + 18, rail); m.box(0, y + 0.5, h + 7, len, y + 2.5, h + 9, rail); }
  return m;
}
// a marsh's bird hide (Nature-C3: shared/world3-marsh.js): a plank hut on piles over the water, its door on the walk's
// side (y = 0), the long viewing slot on the far side, a shingled roof pitched along x with eaves
export function birdHide(w = 60, d = 48, h = 40) {
  const m = new Vox(w + 4, d + 4, h + 26);
  const pl = m.mat({ ramp: R('#8a6646', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -1.0 : 0) + (hash(Math.floor(x / 6), Math.floor(z / 4), 11) - 0.5) * 0.5 });
  const post = m.mat({ ramp: R('#5e4434', 6, 3), k: 3 }), dark = m.mat({ ramp: R('#1e1a18', 4, 2), k: 1 });
  const roof = m.mat({ ramp: R('#5a5048', 6, 3), k: 3, shade: (x, y, z) => (Math.round(y) % 3 === 0 ? -1.1 : 0) + (hash(Math.floor(x / 4), Math.floor(y / 3), 13) - 0.5) * 0.7 });
  const x0 = 2, y0 = 2, x1 = w + 2, y1 = d + 2, fl = 10;
  for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 4, y0 + 1], [x0 + 1, y1 - 4], [x1 - 4, y1 - 4]]) m.box(x, y, 0, x + 3, y + 3, fl, post);   // (the piles)
  m.box(x0, y0, fl - 2, x1, y1, fl, pl);   // (the floor)
  // the walls: planks, the door on the near side, the viewing slot along the far side
  m.fill((x, y, z) => { if (z < fl || z >= fl + h) return -1; const edge = x < x0 + 2 || x >= x1 - 2 || y < y0 + 2 || y >= y1 - 2; if (!edge) return -1; return pl; });
  m.box(x0 + w * 0.4, y0, fl, x0 + w * 0.4 + 12, y0 + 2, fl + 26, dark);   // (the doorway)
  m.box(x0 + 6, y1 - 2, fl + 18, x1 - 6, y1, fl + 25, dark);               // (the slot)
  m.box(x0 + 6, y1 - 1, fl + 17, x1 - 6, y1 + 1, fl + 18, post);           // (its sill)
  // the roof: pitched across y, the ridge along x, eaves over every wall
  const rz = (y) => fl + h + 14 - Math.abs(y - (y0 + y1) / 2) * (14 / ((d + 4) / 2));
  m.fill((x, y, z) => (z >= fl + h - 1 && z < rz(y) + 1.5 && z >= rz(y) - 2 ? roof : -1));
  return m;
}
// a marsh's viewing platform (Nature-C3): a square plank deck on posts over the water, len deep along x (the boardwalk
// comes in at x = 0, through the gap in its rail), w across; rails round the other three sides
export function viewPlatform(len = 160, w = 160, h = 8) {
  const m = new Vox(len, w, h + 24);
  const plank = m.mat({ ramp: R('#8a6646', 6, 3), k: 3, shade: (x, y) => (Math.round(y) % 5 === 0 ? -1.1 : 0) + (hash(Math.floor(y / 5), Math.floor(x / 40), 9) - 0.5) * 0.6 });
  const post = m.mat({ ramp: R('#5e4434', 6, 3), k: 3 }), rail = m.mat({ ramp: R('#7a5a40', 6, 3), k: 3 });
  m.box(0, 0, h - 3, len, w, h, plank);
  for (let x = 4; x < len; x += 38) for (let y = 4; y < w; y += 38) m.box(x, y, 0, x + 4, y + 4, h - 3, post);
  const railRun = (x0, y0, x1, y1) => { m.box(x0, y0, h + 15, x1, y1, h + 18, rail); m.box(x0, y0, h + 7, x1, y1, h + 9, rail); };
  for (let x = 0; x < len; x += 20) { m.box(x, 0, h, x + 3, 3, h + 18, post); m.box(x, w - 3, h, x + 3, w, h + 18, post); }
  for (let y = 0; y < w; y += 20) m.box(len - 3, y, h, len, y + 3, h + 18, post);
  railRun(0, 0, len, 3); railRun(0, w - 3, len, w); railRun(len - 3, 0, len, w);
  for (const [y0, y1] of [[0, w * 0.32], [w * 0.68, w]]) { railRun(0, y0, 3, y1); m.box(0, y0, h, 3, y0 + 3, h + 18, post); m.box(0, y1 - 3, h, 3, y1, h + 18, post); }   // (the near side: open in the middle)
  return m;
}
// an interpretive sign: a slanted dark-framed panel with a map and text on two posts
export function infoSign() {
  const m = new Vox(30, 12, 30);
  const p = m.mat({ ramp: WOODD, k: 3 }), fr = m.mat({ ramp: R('#4a3a2e', 5, 2), k: 2 });
  const pan = m.mat({ ramp: R('#d8ceb0', 6, 3), k: 3, shade: (x, y, z) => { const u = x - 4, v = z; if (u < 11 && v > 18) return vnoise(x * 3, z * 3, 6, 4) > 0.5 ? -1.5 : -0.4; if (Math.round(z) % 2 === 0 && u > 12 && hash(Math.round(x), Math.round(z), 2) > 0.3) return -1.6; return 0; } });
  for (const x of [4, 24]) m.box(x, 6, 0, x + 2, 8, 20, p);
  for (let z = 16; z < 28; z++) { const y = 9 - (z - 16) * 0.55; m.box(2, y, z, 28, y + 2, z + 1, z === 16 || z === 27 ? fr : pan); m.box(2, y, z, 3, y + 2, z + 1, fr); m.box(27, y, z, 28, y + 2, z + 1, fr); }
  return m;
}
// peeled-stick and mud piles: the dam (a long low ridge along x with a notch the water spills through at
// `spill` (0..1 along it)) and the lodge (a mound)
function stickPile(m, seed, heightAt, n) {
  const rnd = mulberry32(seed * 131 + 7);
  // the body: sticks woven every which way (stripes in a random direction per cell), mud in the gaps
  const weave = (x, y, z) => { const cx = Math.floor(x / 7), cy = Math.floor((y + z) / 7), a = hash(cx, cy, seed) * Math.PI, u = x * Math.cos(a) + (y + z) * Math.sin(a), v = -x * Math.sin(a) + (y + z) * Math.cos(a); return [u, v, hash(Math.round(v / 2), cx + cy * 7, seed + 1)]; };
  const body = m.mat({ ramp: R('#6a5040', 7, 3), k: 3, shade: (x, y, z) => { const [u, v, h] = weave(x, y, z); return (Math.round(v) % 2 ? -1.3 : 0.3) + (h - 0.5) * 1.2 + (hash(Math.round(u / 6), Math.round(v / 2), seed + 2) > 0.85 ? 1.4 : 0); } });
  const mud = m.mat({ ramp: R('#4a3a2e', 6, 3), k: 2, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), seed) - 0.5) * 0.8 });
  const sticks = [R('#6e5444', 6, 3), R('#8a6a50', 6, 3), R('#4e3e34', 6, 3)].map((Rm, i) => m.mat({ ramp: Rm, k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y) + Math.round(z), seed + i) > 0.8 ? -0.8 : 0) }));
  const peeled = m.mat({ ramp: R('#d0b48c', 6, 3), k: 3 });
  m.fill((x, y, z) => { const t = heightAt(x, y); return z < t ? (z < 2 || (z < t * 0.4 && hash(Math.round(x), Math.round(y), seed + 5) > 0.6) ? mud : body) : -1; });
  // sticks poking out of the surface
  for (let i = 0; i < n; i++) {
    const x = rnd() * m.w, y = rnd() * m.d, top = heightAt(x, y); if (top <= 2) continue;
    const z = top - 1 - rnd() * 2, a = rnd() * Math.PI * 2, L = 6 + rnd() * 16, r = 0.6 + rnd() * 0.5, tilt = 0.1 + rnd() * 0.4, mt = rnd() < 0.12 ? peeled : sticks[Math.floor(rnd() * 3)];
    for (let s = 0; s <= L; s += 0.6) { const X = x + Math.cos(a) * s, Y = y + Math.sin(a) * s * 0.7, Z = z + s * tilt * (s < L * 0.5 ? 1 : 0.4); m.box(X - r, Y - r, Z - r, X + r, Y + r, Z + r, mt); }
  }
  m.smooth = 1;
}
export function beaverDam(len = 160, d = 26, h = 16, spill = 0.6, seed = 1) {
  const m = new Vox(len, d, h + 8);
  stickPile(m, seed, (x, y) => { const w = 1 + (vnoise(x, 3, 14, seed) - 0.5) * 0.5, v = 1 - ((y - d / 2) / (d / 2 * w)) ** 2, notch = 1 - 0.6 * Math.exp(-((((x / len) - spill) * len / 10) ** 2)); return v <= 0 ? 0 : h * Math.sqrt(v) * notch * (0.75 + 0.35 * vnoise(x, 7, 9, seed + 1)) * clamp(Math.min(x, len - x) / 20) ** 0.6; }, Math.round(len * 0.5));
  return m;
}
export function beaverLodge(r = 26, h = 22, seed = 2) {
  const m = new Vox(r * 2 + 4, Math.round(r * 1.6) + 4, h + 6), cx = r + 2, cy = m.d / 2;
  stickPile(m, seed, (x, y) => { const a = Math.atan2(y - cy, x - cx), q = ((x - cx) / r) ** 2 + ((y - cy) / (r * 0.8)) ** 2, w = 1 + Math.sin(a * 3 + seed) * 0.08; return q >= w ? 0 : h * Math.pow(1 - q / w, 0.6); }, Math.round(r * 3));
  return m;
}
export function beaver() {
  const m = new Vox(18, 10, 9);
  const fur = m.mat({ ramp: R('#6a4630', 6, 3), k: 3 }), tail = m.mat({ ramp: R('#3a2e2c', 5, 2), k: 2, shade: (x, y) => (Math.round(x + y) % 2 ? -0.5 : 0) }), eye = m.mat({ ramp: R('#1a1418', 4, 1), k: 1 });
  m.ell(9, 5, 4, 5.5, 3.6, 3.6, fur); m.ell(14.5, 5, 4.5, 2.8, 2.6, 2.6, fur); m.box(0, 3, 0.5, 5, 7, 2, tail); m.box(16, 3.5, 5.5, 17, 4.5, 6.5, eye); m.box(16, 5.5, 5.5, 17, 6.5, 6.5, eye);
  m.smooth = 1;
  return m;
}
// a white swan on the water (faces +x): S-curved neck, orange bill
export function swan() {
  const m = new Vox(22, 12, 20);
  const wh = m.mat({ ramp: R('#f2efe8', 6, 4), k: 4 }), bill = m.mat({ ramp: R('#e07a2a', 5, 2), k: 2 }), blk = m.mat({ ramp: R('#2a2428', 4, 1), k: 1 });
  m.ell(9, 6, 4, 8, 4.6, 3.6, wh); m.ell(5, 6, 6, 4, 3.6, 3, wh);
  for (let z = 6; z < 17; z++) { const t = (z - 6) / 11, x = 15 + Math.sin(t * Math.PI) * -2.2 + t * 1.2; m.box(x - 1.2, 5, z, x + 1.2, 7, z + 1, wh); }
  m.ell(16, 6, 17, 2, 1.6, 1.6, wh); m.box(17, 5.5, 16, 20, 6.5, 17.5, bill); m.box(17, 5.4, 16.8, 18, 6.6, 17.6, blk);
  m.smooth = 1;
  return m;
}

// ---- hedges of any footprint (sprite) -------------------------------------------------------------------------
// A clipped hedge whose footprint is w x d (world px) and height h: the top and the south face, made of small
// clumps lit on their upper left; o: R (foliage ramp), flowers (ramp), fk (flower density), seed, ragged
// Anchor: the middle of the footprint's south edge.
export function hedgeBox(w, d, h, o = {}) {
  const seed = o.seed ?? 1, Rf = o.R || F.FOL('#3e7626'), FL = o.flowers || null, fk = o.fk ?? 0.12, rag = o.ragged ?? 2;
  const G = new GBuf(Math.ceil(w) + 6, Math.ceil(d + h) + 8); G.ax = Math.round(w / 2) + 3; G.ay = Math.ceil(d + h) + 4;
  const ox = 3, oyTop = G.ay - d - h; // screen row of the top's north edge
  const cell = (x, y) => { const s = 4, gx = Math.floor(x / s), gy = Math.floor(y / s); let b = 1e9, bx = 0, by = 0, id = 0; for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const X = gx + i, Y = gy + j, px = (X + hash(X, Y, seed)) * s, py = (Y + hash(Y, X, seed + 1)) * s, q = (x - px) ** 2 + (y - py) ** 2; if (q < b) { b = q; bx = x - px; by = y - py; id = hash(X, Y, seed + 2); } } return [Math.sqrt(b), bx, by, id]; };
  const put = (X, Y, z, u, v, nrm, base) => {
    const [dd, bx, by, id] = cell(u, v), lit = clamp(0.5 - (bx + by) * 0.09 + (id - 0.5) * 0.3 - dd * 0.05);
    let c = pick(Rf, clamp(base + (lit - 0.5) * 0.7), X, Y, 0.4), f = F_LEAF;
    if (FL && id > 1 - fk && dd < 1.6) c = pick(FL, clamp(0.55 - by * 0.15), X, Y, 0.3);
    G.put(X, Y, c, nrm, z, null, f);
  };
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) { // top
    const e = Math.min(x, w - 1 - x, y, d - 1 - y); if (e < rag && hash(x, y, seed + 7) < 0.5 - e * 0.2) continue;
    put(ox + x, oyTop + y, h, x, y, nz((hash(x, y, seed) - 0.5) * 0.4, -0.1, 1), 0.62);
  }
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) { // south face
    const e = Math.min(x, w - 1 - x); if (e < rag && hash(x, z, seed + 8) < 0.5 - e * 0.2) continue;
    if (z === h - 1 && hash(x, 0, seed + 9) > 0.6) continue;
    put(ox + x, oyTop + d + (h - 1 - z), z, x, d + h - z, nz((hash(x, z, seed + 3) - 0.5) * 0.4, 0.9, 0.35), 0.4 - (1 - z / h) * 0.12);
  }
  G.outline(0.42, true);
  return G;
}
// a standing person cut down to a kneel (forager, gardener at a bed): the legs are dropped and the body sat lower
export function crouch(P, cut = 9) {
  const G = new GBuf(P.w, P.h); G.ax = P.ax; G.ay = P.ay;
  const knee = P.ay - 13;
  for (let y = 0; y < P.h; y++) {
    const sy = y >= knee + cut ? y : y - cut; // rows above the knee move down by `cut`; the shins they cover are dropped
    if (sy < 0) continue;
    for (let x = 0; x < P.w; x++) {
      const si = sy * P.w + x, di = y * P.w + x; if (!P.col[si * 4 + 3]) continue;
      for (let q = 0; q < 4; q++) { G.col[di * 4 + q] = P.col[si * 4 + q]; G.nrm[di * 4 + q] = P.nrm[si * 4 + q]; G.emi[di * 4 + q] = P.emi[si * 4 + q]; }
      G.z[di] = Math.max(0, P.z[si] - (sy === y ? 0 : cut)); G.flag[di] = P.flag[si];
    }
  }
  return G;
}

// ---- ground painters --------------------------------------------------------------------------------------------
// raked gravel: concentric grooves round each stone [x, y, r] out to `reach`, straight east-west rows elsewhere
export function rakedGravel(G, test, stones = [], o = {}) {
  const Rg = R(o.color || '#d8d2c2', 6, 3), seed = o.seed ?? 3, reach = o.reach ?? 26;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    if (!test(x, y)) continue;
    let dm = 1e9; for (const [sx, sy, r] of stones) dm = Math.min(dm, Math.hypot(x - sx, (y - sy) * 1.15) - r);
    const ph = dm < reach ? dm : y + Math.sin(x * 0.05) * 1.5, g = ((ph % 4) + 4) % 4;
    const t = (g < 1 ? 0.25 : g < 2 ? 0.75 : 0.55) + (hash(x, y, seed) > 0.9 ? 0.12 : hash(x, y, seed) < 0.06 ? -0.15 : 0);
    G.put(x, y, pick(Rg, t, x, y, 0.4), g < 1 ? [0, 0.35, 0.94] : g < 2 ? [0, -0.3, 0.95] : [0, 0, 1], 0, null, F_GROUND | F_WET);
  }
}
// a koi just under the surface: body along angle a, kind 0 orange-white, 1 red-white, 2 gold, 3 white
export function koi(G, x, y, a = 0, kind = 0, len = 9) {
  const cols = [[[238, 120, 40], [244, 236, 224]], [[214, 50, 40], [244, 236, 224]], [[240, 180, 50], [246, 210, 110]], [[240, 238, 230], [226, 110, 60]]][kind % 4];
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let s = -len / 2 - 3; s <= len / 2; s += 0.5) for (let q = -2.5; q <= 2.5; q += 0.5) {
    const t = (s + len / 2) / len, wd = s < -len / 2 ? Math.abs(s + len / 2) * 0.9 : 2.2 * Math.sin(Math.PI * clamp(0.15 + t * 0.85)), X = Math.round(x + ca * s - sa * q), Y = Math.round(y + sa * s * 0.8 + ca * q * 0.8);
    if (Math.abs(q) > wd || !G.inside(X, Y) || !(G.flag[Y * G.w + X] & F_WATER)) continue;
    const patch = vnoise(s * 2 + kind * 10, q * 2, 3, kind + 7) > 0.55, c = s < -len / 2 ? cols[0].map((v) => v * 0.85) : patch ? cols[1] : cols[0];
    G.put(X, Y, c.map((v, i) => v * (q < 0 ? 1 : 0.86) + (i === 2 ? 6 : 0)), [0, 0, 1], 0, null, F_GROUND | F_WATER);
  }
}
// a big fallen log lying along x (render at any heading): furrowed bark, moss and ferns' footing along the
// top, a broken end showing the rings, a few snapped branch stubs
export function fallenLog(len = 200, r = 18, seed = 1, o = {}) {
  const m = new Vox(len + 4, Math.ceil(r * 2) + 6, Math.ceil(r * 2) + 10), cy = m.d / 2, cz = r;
  const B = R(o.bark || '#7a4a30', 7, 3), Mo = F.FOL(o.mossCol || '#5a8a2a');
  const bark = m.mat({ ramp: B, k: 3, shade: (x, y, z) => { const a = Math.atan2(z - cz, y - cy); return (Math.round(a * r * 0.55) % 3 === 0 ? -1 : 0.1) + (hash(Math.round(a * r * 0.55), Math.floor(x / 5), seed) - 0.5) * 0.8; } });
  const ring = m.mat({ ramp: R('#b8865a', 6, 3), k: 3, shade: (x, y, z) => (Math.round(Math.hypot(y - cy, z - cz)) % 3 === 0 ? -0.8 : 0.2) });
  const moss = m.mat({ ramp: Mo, k: 4, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), seed + 3) > 0.7 ? 1.1 : 0) - (hash(Math.round(x / 2), Math.round(y), seed + 4) < 0.25 ? 1.2 : 0) });
  const rot = m.mat({ ramp: R('#5a3a26', 6, 3), k: 2 });
  m.fill((x, y, z) => {
    if (x < 2 || x > len + 1) return -1;
    const rr = r * (1 + Math.sin(x * 0.11 + seed) * 0.04) * (1 - (x / len) * (o.taper ?? 0.15)), d = Math.hypot(y - cy, z - cz);
    if (d > rr) return -1;
    if (x > len - 8 && hash(Math.round(y / 2), Math.round(z / 2), seed) * 8 < x - (len - 8)) return -1;
    if ((x < 4 || x > len - 2) && d < rr - 1.5) return d < rr * 0.3 && o.hollow ? -1 : (o.rotten ? rot : ring);
    if (z > cz + rr * (0.2 + vnoise(x, y, 9, seed) * 0.5) && vnoise(x, y * 2, 7, seed + 2) < (o.moss ?? 0.6)) return moss;
    return bark;
  });
  for (let i = 0; i < (o.stubs ?? 3); i++) { const x = 16 + hash(i, 1, seed) * (len - 36), l = 6 + hash(i, 2, seed) * 10, s = i % 2 ? 1 : -1; for (let k = 0; k < l; k++) m.box(x + k * 0.4, cy + s * (r * 0.5 + k * 0.5) - 1, cz + r * 0.5 + k * 0.6, x + k * 0.4 + 2.5, cy + s * (r * 0.5 + k * 0.5) + 1.5, cz + r * 0.5 + k * 0.6 + 2.5, bark); }
  m.smooth = 1;
  return m;
}

// ---- the beavers' work and the hunters' camps -------------------------------------------------------------------
// a tree the beavers have been at: v 0 a pencil-point stump (gnawed to a cone from all round, the pale wood showing,
// a ring of chips), v 1 a trunk gnawed to an hourglass and still standing (a little crown of leaves up top)
export function gnawedStump(v = 0, seed = 1) {
  const r = 6, H = v ? 46 : 12, m = new Vox(30, 30, H + 14), cx = 15, cy = 15;
  const bark = m.mat({ ramp: R('#6a4a34', 6, 3), k: 3, shade: (x, y, z) => (Math.round(Math.atan2(y - cy, x - cx) * 4) % 2 ? -0.6 : 0.2) });
  const wood = m.mat({ ramp: R('#e2c08a', 6, 3), k: 4, shade: (x, y, z) => (Math.round(z) % 2 ? -0.35 : 0.2) });
  const chip = m.mat({ ramp: R('#d8b47c', 5, 2), k: 3 }), leaf = m.mat({ ramp: F.FOL('#4e7a2c'), k: 4, flag: F_LEAF });
  const cut = v ? 13 : 7;   // where the teeth went in
  m.fill((x, y, z) => {
    const d = Math.hypot(x - cx, y - cy);
    if (!v) {   // the stump: bark up to the cut, then a gnawed cone to a point
      if (z < cut) return d <= r ? bark : -1;
      const rr = r * (1 - (z - cut) / 6);
      return d <= rr ? wood : -1;
    }
    // the hourglass: the trunk narrowed to a waist where it's been chewed
    const w = Math.abs(z - cut) < 4 ? r * (0.38 + Math.abs(z - cut) * 0.155) : r;
    return d <= w ? (Math.abs(z - cut) < 4 ? wood : bark) : -1;
  }, 0, 0, 0, 30, 30, H);
  if (v) m.ell(cx, cy, H + 4, 9, 9, 7, leaf);
  for (let i = 0; i < 22; i++) { const a = hash(i, 1, seed) * Math.PI * 2, d = 7 + hash(i, 2, seed) * 7; m.box(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0, cx + Math.cos(a) * d + 1.6, cy + Math.sin(a) * d + 1, 1, chip); }
  m.smooth = 1;
  return m;
}
// a tree the beavers felled, lying where it came down: the gnawed point at its foot, the branches stripped back to
// pale wood where they've been eating the bark, chips round the foot (built along +x, the foot at x = 0)
export function gnawedLog(len = 90, seed = 2) {
  const r = 5, m = new Vox(len + 14, 26, 16), cy = 13, cz = r;
  const bark = m.mat({ ramp: R('#6a4a34', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.floor(x / 4), Math.round(Math.atan2(z - cz, y - cy) * 3), seed) - 0.5) * 0.9 });
  const wood = m.mat({ ramp: R('#e2c08a', 6, 3), k: 4 }), chip = m.mat({ ramp: R('#d8b47c', 5, 2), k: 3 });
  m.fill((x, y, z) => {
    const t = x - 6;
    if (t < 0 || t > len) return -1;
    const rr = t < 7 ? r * (t / 7) : r * (1 - (t / len) * 0.5), d = Math.hypot(y - cy, z - cz);
    if (d > rr) return -1;
    return t < 7 || (hash(Math.floor(t / 6), 3, seed) > 0.7 && z > cz) ? wood : bark;   // the point, and patches stripped of bark
  });
  for (let i = 0; i < 4; i++) { const x = 30 + hash(i, 1, seed) * (len - 40), s = i % 2 ? 1 : -1, l = 6 + hash(i, 2, seed) * 6; for (let k = 0; k < l; k += 0.5) m.box(x + k * 0.6, cy + s * (2 + k * 0.7), cz + 1 + k * 0.3, x + k * 0.6 + 1.2, cy + s * (2 + k * 0.7) + 1, cz + 2 + k * 0.3, k > l * 0.6 ? wood : bark); }
  for (let i = 0; i < 16; i++) { const x = 2 + hash(i, 5, seed) * 12, y = cy + (hash(i, 6, seed) - 0.5) * 16; m.box(x, y, 0, x + 1.6, y + 1, 1, chip); }
  m.smooth = 1;
  return m;
}
// a hide stretched to dry on a rack of poles lashed together: v 0 a deer hide, 1 a dark bear pelt, 2 a fox pelt
// (built facing +y, the hide's face toward the south)
export function hideRack(v = 0) {
  const m = new Vox(40, 16, 44), pole = m.mat({ ramp: R('#7a5a3a', 6, 3), k: 3 }), lash = m.mat({ ramp: R('#c8a874', 5, 2), k: 3 });
  const hide = m.mat({ ramp: R(['#c89a62', '#3a2e2a', '#c8682e'][v % 3], 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(z / 2), 7) - 0.5) * 0.7 });
  const flesh = m.mat({ ramp: R('#e8d4b0', 5, 2), k: 3 });
  for (const x of [4, 35]) for (let z = 0; z < 42; z++) m.box(x + (z > 30 ? (x < 10 ? 0.6 : -0.6) * (z - 30) * 0.2 : 0), 7, z, x + 2.2, 9.2, z + 1, pole);
  for (const z of [8, 36]) m.box(3, 7, z, 38, 9, z + 2, pole);
  // the hide: a stretched pelt shape, laced to the frame at its points
  m.fill((x, y, z) => {
    const u = (x - 20) / 13, w = (z - 22) / 12;
    if (Math.abs(y - 8) > 0.8) return -1;
    const edge = Math.abs(u) ** 1.6 + Math.abs(w) ** 1.6 - 0.12 * Math.cos(u * 6) * Math.cos(w * 4);
    return edge <= 1 ? (y > 8.4 ? hide : flesh) : -1;
  }, 6, 6, 9, 35, 10, 36);
  for (const [x, z] of [[8, 12], [8, 32], [32, 12], [32, 32], [20, 10], [20, 34]]) m.box(x, 7, z, x + 1, 9, z + 1, lash);
  m.smooth = 1;
  return m;
}

// ---- the hot springs (concept L7) ----------------------------------------------------------------------------
// a bath pavilion: a timber shelter on a raised plank deck, four posts, a dark tile roof with its ridge east-west and
// the eaves turned up at the corners, a bench and wooden buckets under it, a bamboo spout pouring into a stone
// basin, a paper lantern hanging at the front (lit when `on`). Built along +x, the open front toward +y.
export function bathPavilion(on = 0.6) {
  const w = 72, d = 50, H = 34, m = new Vox(w + 12, d + 12, H + 34), x0 = 6, y0 = 4, x1 = x0 + w, y1 = y0 + d;
  const deck = m.mat({ ramp: R('#9a7652', 6, 3), k: 3, shade: (x) => (Math.round(x) % 6 === 0 ? -1 : 0) + (hash(Math.floor(x / 6), 3, 5) - 0.5) * 0.6 });
  const post = m.mat({ ramp: R('#5a3e2a', 6, 3), k: 3 }), wall = m.mat({ ramp: R('#a88a62', 6, 3), k: 3, shade: (x, y, z) => (Math.round(x + y) % 5 === 0 ? -0.8 : 0) });
  const tile = m.mat({ ramp: R('#3a3e46', 6, 3), k: 3, shade: (x, y, z) => (Math.round(x) % 4 === 0 ? -0.9 : 0) + (Math.round(z) % 3 === 0 ? -0.4 : 0) });
  const ridge = m.mat({ ramp: R('#2a2c32', 5, 2), k: 2 }), bench = m.mat({ ramp: R('#b8925e', 6, 3), k: 3 }), band = m.mat({ ramp: R('#2a3a5a', 5, 2), k: 2 });
  const stone = m.mat({ ramp: STONE, k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2), 7) - 0.5) * 0.9 }), bam = m.mat({ ramp: R('#8aa04a', 6, 3), k: 3 });
  const wat = m.mat({ ramp: R('#8ad8d8', 5, 3), k: 3, flag: F_WATER | F_NOCAST }), lamp = m.mat({ ramp: R('#f0d8a0', 5, 3), k: 4, emi: [255, 200, 120, Math.round(170 * on)] });
  m.box(x0, y0, 0, x1, y1, 5, deck);                                             // the raised deck
  for (const [x, y] of [[x0 + 2, y0 + 2], [x1 - 6, y0 + 2], [x0 + 2, y1 - 6], [x1 - 6, y1 - 6]]) m.box(x, y, 5, x + 4, y + 4, H, post);
  m.box(x0 + 2, y0 + 2, 5, x1 - 2, y0 + 5, H - 4, wall);                          // the back wall (a screen of planks)
  m.box(x0 + 8, y0 + 8, 5, x1 - 8, y0 + 16, 13, bench);                           // the bench along it
  for (const [x, y] of [[x0 + 14, y0 + 24], [x0 + 22, y0 + 26], [x1 - 22, y0 + 24]]) { m.cyl('z', x, y, 0, 4, 5, 12, bench); m.box(x - 4, y - 0.5, 9, x + 4, y + 0.5, 10, band); }   // buckets
  // the stone basin by the front-right post, the bamboo spout over it
  m.cyl('z', x1 - 14, y1 - 12, 0, 7, 5, 12, stone); m.cyl('z', x1 - 14, y1 - 12, 0, 5, 10, 12, wat);
  m.box(x1 - 6, y1 - 13, 18, x1 - 2, y1 - 11, 20, bam); for (let k = 0; k < 8; k++) m.box(x1 - 6 - k, y1 - 13, 18 - k * 0.2, x1 - 5 - k, y1 - 11, 20 - k * 0.2, bam);
  // the roof: two pitches from a ridge along x, eaves out past the posts, the corners turned up
  m.fill((x, y, z) => { const ey = Math.min(y - (y0 - 6), (y1 + 6) - y), top = H + 4 + Math.min(18, ey * 0.62) + (x < x0 + 4 || x > x1 - 4 ? 2 : 0) + (ey < 4 && (x < x0 + 6 || x > x1 - 6) ? 2 : 0); return ey >= 0 && z >= top - 3 && z < top ? tile : -1; }, x0 - 6, y0 - 6, H, x1 + 6, y1 + 6, H + 30);
  m.box(x0 - 6, (y0 + y1) / 2 - 1.5, H + 21, x1 + 6, (y0 + y1) / 2 + 1.5, H + 24, ridge);
  // the paper lantern hanging at the front middle
  m.box((x0 + x1) / 2 - 0.5, y1 - 2, H - 8, (x0 + x1) / 2 + 0.5, y1 - 1, H, post); m.ell((x0 + x1) / 2, y1 - 1.5, H - 13, 4, 4, 6, lamp);
  return m;
}
// a bamboo fence: a row of canes lashed to three rails, a darker cap rail; along +x
export function bambooFence(len = 80, h = 30) {
  const m = new Vox(len, 6, h + 2);
  const cane = m.mat({ ramp: R('#a8b058', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 9 === 0 ? -1 : 0) + (hash(Math.floor(x / 3), 2, 7) - 0.5) * 0.7 }), rail = m.mat({ ramp: R('#6a5434', 6, 3), k: 3 });
  for (let x = 0; x < len; x += 3) m.box(x, 2, 0, x + 2.4, 4, h - (hash(x, 1, 9) > 0.7 ? 2 : 0), cane);
  for (const z of [6, h * 0.55, h - 4]) m.box(0, 1, z, len, 5, z + 2, rail);
  m.box(0, 1, h, len, 5, h + 2, rail);
  return m;
}
// steam over hot water (a sprite): soft white wisps rising and drifting, w wide over the water, rising to h;
// partly see-through and casting no shadow (like a waterfall's mist)
export function steam(w = 80, h = 50, seed = 1) {
  const G = new GBuf(Math.ceil(w) + 20, Math.ceil(h) + 20); G.ax = Math.round(G.w / 2); G.ay = G.h - 4;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const u = (x - G.ax) / (w / 2), v = (G.ay - y) / h; if (v < 0 || v > 1.1) continue;
    const env = Math.max(0, 1 - u * u * (0.7 + v)) * Math.sin(Math.PI * Math.min(1, v * 1.1)) * (1 - v * 0.55);
    const wisp = vnoise(x + v * 18 * Math.sin(seed), y * 0.7, 9, seed + 11) * 0.65 + vnoise(x * 0.6, y, 4, seed + 13) * 0.35;
    const a = env * (wisp - 0.3) * 3.2; if (a <= 0.08) continue;
    const j = (y * G.w + x) * 4; G.col[j] = 240; G.col[j + 1] = 244; G.col[j + 2] = 246; G.col[j + 3] = Math.round(Math.min(0.78, a) * 255);
    G.nrm[j] = 128; G.nrm[j + 1] = 128; G.nrm[j + 2] = 255; G.nrm[j + 3] = 255;
    G.z[y * G.w + x] = Math.round(v * h); G.flag[y * G.w + x] = F_NOCAST;
  }
  return G;
}

// ---- roof gardens -----------------------------------------------------------------------------------------------
// What a roof garden is planted in (statics.js gardenKit lays one out; the owner, 2026-10-17: "rooftop gardens would be
// in raised garden beds with things growing in them or pretty flowers or bushes or small trees"): raised beds of any
// length and big planters with a small tree, painted rather than voxel-built (a bed is any size). Model point (x, y, z)
// - x east and y south over the w x d footprint, z up - lands on pixel (x + ox, y + top + 2 - z), the anchor the
// footprint's middle on the ground; every pixel is depth-tested (in this projection the taller of two at a pixel is
// the nearer), so the parts go down in any order. The foliage is F_LEAF | F_WET (gbuf.js F_ROCKLEAF): it sways as a
// plant on its own patch of ground does, not as a treetop that high up (engine.js leanAmp), and the rain wets it.
//   roofBed(w, d, h, box, plant, v)  box: timber | grey | sage | char | sleeper | brick | stone | concrete | corten;
//     plant: fl0..fl5 (flowers by palette) | lav | box (a clipped hedge) | ball (box balls) | shrub | veg (rows of
//     vegetables) | tall (tomatoes or beans on canes) | herb | grass | sun (sunflowers) | straw (strawberries)
//   roofTree(kind, box, v)            a big planter (24 x 24) with an olive | maple | bamboo | bay | birch in it
//   pergola, waterButt, compostBin, gardenLantern   voxel models
const LF = F_LEAF | F_WET;
const BOXC = { timber: ['#9a7650', 0], grey: ['#8e897e', 0], sage: ['#6f8c7a', 0], char: ['#55575e', 0], sleeper: ['#5e4a38', 1], brick: ['#9a5442', 2], stone: ['#b8ae9c', 3], concrete: ['#aca89e', 4], corten: ['#8f4f2c', 5] };
let GR = null;   // (the garden's ramps, made on first use)
function gr() {
  if (GR) return GR;
  const fr = (h) => ramp(h, 5, 2, { light: 0.6 }), fo = F.FOL;
  GR = {
    soil: R('#5a3e2c', 6, 3), mulch: R('#7a5434', 6, 3), box: {},
    // flower palettes: pinks, hot colours, blues and purples, a white garden (it shows after dark), pastels, yellows
    fl: [['#e86a9a', '#f4f0ea', '#c8407a'], ['#d83a2a', '#f08a2a', '#f0c83a'], ['#5a6ad8', '#9a62c8', '#eef0f6'], ['#f4f2ea', '#e8e2c4', '#dfe8f2'], ['#f0a8c0', '#c8b0e8', '#f8e8a0'], ['#f4d040', '#f6f2e8', '#e8a030']].map((p) => p.map(fr)),
    leaf: fo('#4a8030'), leafD: fo('#3a6a2e'), leafL: fo('#6a9a34'), boxw: fo('#2f5e2a', { light: 0.4 }), silver: fo('#8a9a72', { shift: 0.3, desat: 0.3 }), lav: fo('#7e9a7c', { shift: 0.25 }), plum: fo('#6a3a48', { warm: 20, shift: 0.3 }),
    purple: fr('#8a5ac8'), red: fr('#d8342a'), orange: fr('#e8782a'), white: fr('#f4f2ea'), yellow: fr('#f0c428'), pink: fr('#e07ab0'), blue: fr('#6a7ae0'), brown: R('#5a3a22', 5, 2),
    // lettuce, red lettuce, cabbage, chard, carrots, onions, kale
    crops: [fo('#8cc040'), fo('#8a3a4a', { warm: 10, shift: 0.2 }), fo('#6a9c8c', { warm: 120, shift: 0.3 }), fo('#3e7a2e'), fo('#5cae3a'), fo('#6a9a7a', { shift: 0.3 }), fo('#3e5a48', { shift: 0.3 })],
    cane: R('#c4a870', 6, 3), bark: R('#7a7266', 6, 3), birch: R('#e4e0d6', 6, 3), bamboo: R('#a0a848', 6, 3),
    grass: [fo('#c0ae6c', { shift: 0.2 }), fo('#8aa058'), fo('#a8784e', { warm: 30 })],
    maple: [fo('#b8302a', { cool: 330, shiftD: 0.3, warm: 30, shift: 0.5 }), fo('#d0702a', { cool: 10, warm: 50 }), fo('#7a2a3e', { cool: 300, warm: 10 })],
  };
  return GR;
}
const boxRamp = (hex) => GR.box[hex] || (GR.box[hex] = R(hex, 7, 3));
// (a canvas: mx px either side for what overhangs the footprint - a tree's crown - and 2 for the outline and the shadow)
function gcan(w, d, top, mx = 2) { const S = new GBuf(w + 4 + 2 * mx, d + top + 6); S.ox = 2 + mx; S.ax = (w >> 1) + S.ox; S.ay = (d >> 1) + top + 2; S.t = top + 2; return S; }
// one pixel of model point (x, y, z) (whole numbers), depth-tested
function gp(S, x, y, z, c, nx, ny, nz, f = 0) {
  const X = x + S.ox, Y = y + S.t - z;
  if (X < 0 || Y < 0 || X >= S.w || Y >= S.h) return;
  const i = Y * S.w + X, j = i * 4;
  if (S.col[j + 3] && S.z[i] > z) return;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  S.col[j] = c[0]; S.col[j + 1] = c[1]; S.col[j + 2] = c[2]; S.col[j + 3] = 255;
  S.nrm[j] = (nx / l * 0.5 + 0.5) * 255; S.nrm[j + 1] = (ny / l * 0.5 + 0.5) * 255; S.nrm[j + 2] = (nz / l * 0.5 + 0.5) * 255; S.nrm[j + 3] = 255;
  S.z[i] = Math.max(0, z); S.flag[i] = f; S.emi[j + 3] = 0;
}
const lit = (nx, ny, nz) => (-0.5 * nx - 0.45 * ny + 0.74 * nz) / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
// leaf clusters in screen space: each lit on its upper left, a dark pocket at its lower right
function clu(X, Y, cs, s) { const gy = Math.floor(Y / cs), o = hash(gy, 9, s) * cs, gx = Math.floor((X + o) / cs), fx = (X + o) / cs - gx, fy = Y / cs - gy; return (0.8 - fx - fy) * 0.3 + (hash(gx, gy, s) - 0.5) * 0.24; }
// a lump of foliage: an ellipsoid round (cx, cy, cz) - radii rx, ry, up and dn (0: it sits on its foot) - in leaf
// clusters lit from the north-west, darker down its front. o: fl(x, y) -> a flower ramp for its top there (or null),
// holes (0..1: airy, ragged toward the edge), cs (the clusters' size), rough (how lumpy its top)
function lump(S, cx, cy, cz, rx, ry, up, dn, Rf, s, o = {}) {
  const cs = o.cs || 2.5, hl = o.holes || 0, rg = o.rough ?? 1.2;
  const topAt = (x, y) => { const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, q = 1 - u * u - v * v; if (q <= 0.03 || (hl && hash(x >> 1, y >> 1, s + 3) < hl * (1.2 - q))) return -1e9; const k = Math.sqrt(q); return Math.round(cz + up * k + (hash(x, y, s) - 0.5) * rg * k); };
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const zt = topAt(x, y);
    if (zt < -1e8) continue;
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry, k = Math.sqrt(1 - u * u - v * v), zb = Math.round(cz - dn * k);
    // (sitting on its foot, what's under the next column south's top is behind it: only the face above that shows)
    const z0 = dn ? zb : Math.max(zb, Math.min(zt, topAt(x, y + 1)));
    const nx = u / rx, ny = v / ry, nzz = k / Math.max(1, up), Lt = lit(nx, ny, nzz), fr = o.fl ? o.fl(x, y) : null;
    for (let z = zt; z >= z0; z--) {
      const X = x + S.ox, Y = y + S.t - z, top = z === zt;
      if (top && fr) { gp(S, x, y, z, pick(fr, clamp(0.3 + Lt * 0.6 + clu(X, Y, 2, s + 1) * 0.7), X, Y, 0.3), nx, ny, nzz, LF); continue; }
      const t = top ? 0.1 + Lt * 0.62 + clu(X, Y, cs, s) : 0.08 + Lt * 0.32 + clu(X, Y, cs, s) - (zt - z) * 0.03;
      gp(S, x, y, z, pick(Rf, clamp(t), X, Y, 0.45), nx, top ? ny : ny + 0.7, top ? nzz : 0.3, LF);
    }
  }
}
// a stem, blade or cane: up from (x, y, z0), leaning `lean` px east by its tip; t0: its shade at the foot
function spike(S, x, y, z0, len, lean, Rm, t0, f = LF) {
  for (let k = 0; k <= len; k++) { const X = x + Math.round(lean * k / Math.max(1, len)); gp(S, X, y, z0 + k, pick(Rm, clamp(t0 + k / Math.max(1, len) * 0.3), X + 2, y + k, 0.3), -0.3, 0.6, 0.5, f); }
}
// the bed's walls: their tops (the rim), the south face by what they're built of, the north wall's inside over the soil
function frame(S, w, d, h, box, s, zs) {
  const [hex, fk] = BOXC[box] || BOXC.timber, M = boxRamp(hex), t = fk >= 1 && fk <= 3 ? 3 : 2;
  for (let y = 0; y < d; y++) for (let x = 0; x < w; x++) {
    if (x >= t && y >= t && x < w - t && y < d - t) continue;
    const q = 0.72 + (hash(x >> 2, y >> 2, s) - 0.5) * 0.1 - (x === w - 1 || y === d - 1 ? 0.12 : 0) + (x === 0 || y === 0 ? 0.06 : 0) - (fk === 0 && x % 30 === 29 ? 0.2 : 0);
    gp(S, x, y, h, pick(M, q, x, y, 0.3), 0, 0, 1);
  }
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const v = h - 1 - z;
    let q = 0.5 + (v === 0 ? 0.14 : 0) - (z < 2 ? 0.08 : 0);
    if (fk === 0) { const b = Math.floor(v / 4); q += (v % 4 === 3 ? -0.22 : 0) + (hash(Math.floor((x + b * 13) / 10), b, s) - 0.5) * 0.14 + (x < 2 || x >= w - 2 ? -0.1 : 0); }
    else if (fk === 1) { const b = Math.floor(v / 5); q += (v % 5 === 4 || (x + b * 17) % 44 === 0 ? -0.26 : 0) + (hash(Math.floor((x + b * 17) / 44), b, s) - 0.5) * 0.2 - (hash(x, v >> 1, s) > 0.9 ? 0.1 : 0); }
    else if (fk === 2 || fk === 3) { const ch = fk === 2 ? 3 : 5, cw = fk === 2 ? 8 : 14, c = Math.floor(v / ch), o = (c & 1) * (cw >> 1); q = v % ch === ch - 1 || (x + o) % cw === 0 ? 0.8 : q + (hash(Math.floor((x + o) / cw), c, s) - 0.5) * 0.3; }
    else if (fk === 4) q += (v % 6 === 5 ? -0.07 : 0) + (v % 6 === 2 && x % 16 === 8 ? -0.3 : 0) + (vnoise(x, v, 9, s) - 0.5) * 0.12;
    else q += (vnoise(x, v * 0.3, 5, s) - 0.5) * 0.36 - (v === 1 ? 0.12 : 0);
    gp(S, x, d - 1, z, pick(M, q, x, v, 0.35), 0, 1, 0.15);
  }
  for (let z = zs; z < h; z++) for (let x = t; x < w - t; x++) gp(S, x, t - 1, z, pick(M, 0.2 - (h - 1 - z) * 0.03, x, z, 0.3), 0, 1, 0.1);
  return t;
}
// the soil (bark mulch under flowers and shrubs; rows: true where a furrow runs)
function soil(S, x0, y0, x1, y1, zs, s, mulch, rows = null) {
  const G = gr();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const hh = hash(x, y, s + 5), t = 0.3 + hh * 0.24 - (y === y0 ? 0.16 : 0) - (rows && rows(x, y) ? 0.14 : 0);
    gp(S, x, y, zs, mulch && hh > 0.55 ? pick(G.mulch, 0.3 + hh * 0.3 - (y === y0 ? 0.16 : 0), x, y, 0.3) : pick(G.soil, t, x, y, 0.3), 0, 0, 1);
  }
}
// the outline (16-bit selective: open at the base), then a soft contact shadow under the south face and down the east
// side (half see-through: it darkens the deck it falls on and nothing above it)
function gfinish(S, w, d) {
  S.outline(0.42, true);
  const sh = (X, Y, a) => { if (X < 0 || Y < 0 || X >= S.w || Y >= S.h) return; const i = Y * S.w + X, j = i * 4; if (S.col[j + 3]) return; S.col[j] = 12; S.col[j + 1] = 10; S.col[j + 2] = 24; S.col[j + 3] = a; S.z[i] = 0; };
  const o = S.ox;
  for (let x = 0; x <= w; x++) { sh(x + o - 1, d + S.t, 96); sh(x + o, d + S.t + 1, 52); }
  for (let y = 1; y < d; y++) { sh(w + o, y + S.t, 80); sh(w + o + 1, y + S.t, 64); }
  return S;
}
// what grows in a bed: its inside [x0, x1) x [y0, y1), the soil at zs; laid along the bed's long side
function plantBed(S, x0, y0, x1, y1, zs, plant, s) {
  const G = gr(), hz = x1 - x0 >= y1 - y0, L = hz ? x1 - x0 : y1 - y0, W = hz ? y1 - y0 : x1 - x0, rnd = mulberry32(s * 977 + 13);
  const at = (a, b) => (hz ? [x0 + a, y0 + b] : [x0 + b, y0 + a]);
  const blob = (a, b, rA, rB, up, Rf, o, dn = 0, z = zs) => { const [x, y] = at(a, b); lump(S, x, y, z, hz ? rA : rB, hz ? rB : rA, up, dn, Rf, s + Math.round(a * 7 + b * 3), o); };
  const pt = (a, b) => { const [x, y] = at(a, b); return [Math.round(x), Math.round(y)]; };
  const k = plant.startsWith('fl') ? 'fl' : plant;
  if (k === 'fl') {   // a border of flowers: clumps of foliage, the flowers on them in drifts of the palette's colours
    const P = G.fl[(+plant.slice(2) || 0) % G.fl.length], nb = W >= 15 ? 2 : 1, fl = (x, y) => (hash(x >> 1, y >> 1, s + 7) < 0.42 ? P[Math.floor(vnoise(x, y, 8, s) * P.length * 0.999)] : null);
    for (let j = 0; j < nb; j++) for (let a = 2 + rnd() * 2; a < L - 1; a += 4.5 + rnd() * 2.5) blob(a, (j + 0.5) * W / nb + (rnd() - 0.5) * 2, 3.4 + rnd() * 1.8, W / nb / 2 + 1, 4 + rnd() * 3, rnd() < 0.5 ? G.leaf : G.leafL, { fl });
    if (plant === 'fl2' || plant === 'fl4' || rnd() < 0.25) for (let i = 0; i < L / 6; i++) { const [x, y] = pt(2 + rnd() * (L - 4), 1 + rnd() * (W - 2)); spike(S, x, y, zs + 3, 6 + rnd() * 4 | 0, 0, P[i % P.length], 0.4); }   // (spires: delphiniums, foxgloves)
  } else if (k === 'lav') {   // lavender: grey-green mounds, the purple spikes over them
    for (let a = 3; a < L - 2; a += 7 + rnd()) blob(a, W / 2, 4.2, W / 2, 5.5, G.lav, { fl: (x, y) => (hash(x, y >> 1, s + 7) < 0.5 ? G.purple : null) });
    for (let i = 0; i < L * W / 10; i++) { const [x, y] = pt(1 + rnd() * (L - 2), 1 + rnd() * (W - 2)); spike(S, x, y, zs + 4, 2 + (rnd() * 3 | 0), 0, G.purple, 0.45); }
  } else if (k === 'box') {   // a parterre: a low clipped box edging round the bed, lavender, white flowers or box balls inside it
    const X0 = x0, X1 = x1, Y0 = y0, Y1 = y1, hb = 5 + (s % 2), th = W >= 16 ? 3 : 2;
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const e = Math.min(x - X0, X1 - 1 - x, y - Y0, Y1 - 1 - y); if (e >= th) continue;
      const zt = zs + hb - (e === 0 || e === th - 1 ? 1 : 0);
      for (let z = zt; z >= zs; z--) {
        const X = x + S.ox, Y = y + S.t - z, top = z === zt;
        gp(S, x, y, z, pick(G.boxw, clamp(top ? 0.58 + (e === 0 && (x === X0 || y === Y0) ? 0.1 : 0) + clu(X, Y, 2, s) * 0.8 : 0.26 + clu(X, Y, 2, s) * 0.8), X, Y, 0.4), 0, top ? 0 : 1, top ? 1 : 0.2, LF);
      }
    }
    if (X1 - X0 > 2 * th + 3 && Y1 - Y0 > 2 * th + 3) plantBed(S, X0 + th, Y0 + th, X1 - th, Y1 - th, zs, ['lav', 'fl3', 'ball', 'fl0', 'fl2'][s % 5], s + 1);
  } else if (k === 'ball') {   // box balls in a row on bark mulch, a little white between them now and then
    const r = Math.min(5.5, W / 2 - 0.5), n = Math.max(1, Math.floor((L - 2) / (2 * r + 3))), g = (L - n * 2 * r) / (n + 1), mid = rnd() < 0.5;
    for (let i = 0; i < n; i++) { const a = g + r + i * (2 * r + g); blob(a, W / 2, r, r, r * 1.1, G.boxw, { rough: 0.5, cs: 2 }); if (mid && i < n - 1) blob(a + r + g / 2, W / 2, 2.2, 2.5, 3, G.leafL, { fl: () => G.white }); }
  } else if (k === 'shrub') {   // low shrubs filling the bed, flowering now and then (hydrangea heads, roses)
    const n = Math.max(1, Math.round(L / 18)), fk = rnd(), FC = fk < 0.25 ? G.blue : fk < 0.45 ? G.pink : fk < 0.6 ? G.white : fk < 0.75 ? G.red : null, big = fk < 0.6;
    for (let i = 0; i < n; i++) { const R = [G.leaf, G.leafD, G.leafL, G.plum][(s + i) % (FC ? 3 : 4)]; blob((i + 0.5) * L / n + (rnd() - 0.5) * 2, W / 2, L / n / 2 + 1.5, W / 2 + 0.5, 8 + rnd() * 5, R, { fl: FC ? (x, y) => (hash(big ? x >> 1 : x, big ? y >> 1 : y, s + 9 + i) < (big ? 0.2 : 0.1) ? FC : null) : null }); }
  } else if (k === 'veg') {   // vegetables in rows along the bed, a different crop in each
    const nr = Math.max(1, Math.floor(W / 6)), sp = W / nr;
    soil(S, ...at(0, 0), ...at(L, W), zs, s, false, (x, y) => (Math.floor(((hz ? y - y0 : x - x0) + 0.5) % sp) === 0));
    for (let j = 0; j < nr; j++) {
      const c = Math.floor(hash(j, 3, s) * 7), b = (j + 0.5) * sp, R = G.crops[c], st = c === 2 ? 7.5 : c === 5 ? 3 : 5.5;
      for (let a = st / 2 + rnd(); a < L - 1; a += st) {
        if (c === 5) { const [x, y] = pt(a, b); spike(S, x, y, zs, 4 + (rnd() * 3 | 0), 0, R, 0.35); spike(S, x + 1, y, zs, 3 + (rnd() * 3 | 0), 1, R, 0.5); continue; }   // onions
        blob(a, b, c === 2 ? 3.2 : 2.6, Math.min(sp / 2, c === 2 ? 3.2 : 2.6), c === 2 ? 4 : c === 3 ? 5.5 : c === 4 ? 3 : 3.5, R, { holes: c === 4 ? 0.45 : 0, rough: c === 2 ? 0.4 : 1, cs: 2 });
        if (c === 3) { const [x, y] = pt(a, b); gp(S, x, y + 2, zs + 1, pick(hash(a | 0, j, s) < 0.5 ? G.red : G.yellow, 0.4, x, y, 0), 0, 1, 0.3, LF); }   // (chard's stems)
      }
    }
  } else if (k === 'tall') {   // tomatoes (or runner beans) up a row of canes tied across at the top
    const beans = rnd() < 0.4, b = W / 2, n = Math.max(1, Math.floor((L - 2) / 7)), g = (L - (n - 1) * 7) / 2, top = 18 + (s % 4);
    for (let i = 0; i < n; i++) {
      const a = g + i * 7, [x, y] = pt(a, b);
      spike(S, x, y, zs, top + 1, 0, G.cane, 0.45, 0);
      blob(a, b, 2.8, Math.min(3, W / 2), top - 2, beans ? G.leafL : G.leaf, { holes: 0.3, cs: 2 });
      for (let f = 0; f < 4; f++) { const z = zs + 4 + (rnd() * (top - 8) | 0), dx = (rnd() * 4 | 0) - 2; gp(S, x + dx, y + 2, z, pick(beans ? G.red : rnd() < 0.7 ? G.red : G.orange, 0.5, x, z, 0), 0, 1, 0.4, LF); }
    }
    const [ax, ay] = pt(g, b), [bx, by] = pt(g + (n - 1) * 7, b);
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) gp(S, x, y, zs + top, pick(G.cane, 0.6, x, y, 0), 0, 0.3, 1);
  } else if (k === 'herb') {   // herbs in patches along the bed: sage, thyme in flower, chives, rosemary, basil, mint
    const H = [[G.silver, null, 4], [G.leafD, G.pink, 3], [G.crops[5], G.purple, 5], [G.crops[6], G.blue, 5], [G.leafL, null, 4], [G.leaf, G.white, 3.5]];
    for (let a = 0, i = Math.floor(rnd() * 6); a < L - 3; i++) {
      const pw = 7 + rnd() * 4, [R, FC, up] = H[i % 6];
      for (let q = a + 2; q < a + pw - 1; q += 3.5) blob(q, W / 2 + (rnd() - 0.5) * 2, 2.6, W / 2 - 0.5, up + rnd() * 1.5, R, { cs: 2, fl: FC ? (x, y) => (hash(x, y, s + i) < 0.14 ? FC : null) : null });
      a += pw;
    }
  } else if (k === 'grass') {   // ornamental grasses in tufts, coneflowers or black-eyed susans among them
    const R = G.grass[s % 3], FC = s % 2 ? G.pink : G.yellow, nb = W >= 15 ? 2 : 1;
    for (let j = 0; j < nb; j++) for (let a = 3; a < L - 2; a += 6 + rnd() * 2) {
      const [x, y] = pt(a, (j + 0.5) * W / nb), n = 9 + (rnd() * 5 | 0), hgt = 10 + (rnd() * 6 | 0);
      blob(a, (j + 0.5) * W / nb, 3, Math.min(3, W / nb / 2), 4, G.leafD, {});
      for (let i = 0; i < n; i++) spike(S, x + Math.round((rnd() - 0.5) * 4), y + Math.round((rnd() - 0.5) * 2), zs + 2, hgt - (rnd() * 4 | 0), Math.round((rnd() - 0.5) * 6), R, 0.35);
    }
    for (let i = 0; i < L / 9; i++) { const [x, y] = pt(2 + rnd() * (L - 4), 1 + rnd() * (W - 2)), z = zs + 8 + (rnd() * 4 | 0); spike(S, x, y, zs, z - zs, 0, G.leafD, 0.3); for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [2, 0]]) gp(S, x + dx, y + 1, z + dz, pick(Math.abs(dx - 0.5) < 1 && dz === 0 ? G.brown : FC, 0.55, x, z, 0), 0, 1, 0.5, LF); }
  } else if (k === 'sun') {   // sunflowers along the bed, their heads turned to the south (to the camera), leafy at the foot
    for (let a = 3; a < L - 2; a += 4) blob(a, W / 2, 3.2, W / 2, 5, G.leaf, {});
    for (let a = 4 + rnd() * 2; a < L - 3; a += 7 + rnd() * 3) {
      const [x, y] = pt(a, W / 2 + (rnd() - 0.5) * 2), hgt = 22 + (rnd() * 8 | 0);
      spike(S, x, y, zs, hgt, 0, G.leafD, 0.4); spike(S, x + 1, y, zs, hgt - 2, 0, G.leafD, 0.25);
      blob(a - 2, W / 2, 2.5, 1.5, 1.5, G.leaf, {}, 1.5, zs + (hgt >> 1)); blob(a + 2.5, W / 2, 2.5, 1.5, 1.5, G.leaf, {}, 1.5, zs + (hgt >> 1) + 3);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const q = dx * dx + dz * dz; if (q > 11) continue; gp(S, x + dx, y + 1, zs + hgt + dz, q <= 2 ? pick(G.brown, 0.4 + (dx + dz < 0 ? 0.2 : 0), x + dx, dz, 0) : pick(G.yellow, 0.55 - dz * 0.06 - dx * 0.04, x + dx, dz, 0.4), -dx * 0.1, 1, 0.3 + dz * 0.1, LF); }
    }
  } else {   // strawberries: low leafy mounds, the red fruit and white flowers in them
    const nb = W >= 14 ? 2 : 1;
    for (let j = 0; j < nb; j++) for (let a = 2.5; a < L - 1; a += 5) blob(a, (j + 0.5) * W / nb, 3, W / nb / 2, 3, G.leaf, { fl: (x, y) => { const q = hash(x, y, s + 11); return q < 0.1 ? G.red : q < 0.15 ? G.white : null; }, cs: 2 });
  }
}
const BED_H = { fl: 9, lav: 12, box: 11, ball: 12, shrub: 14, veg: 7, tall: 24, herb: 8, grass: 18, sun: 34, straw: 5 };
// a raised bed, w x d, h high (its rim), built of `box`, planted with `plant` (variant v)
export function roofBed(w = 48, d = 20, h = 10, box = 'timber', plant = 'fl0', v = 0) {
  gr();
  const k = plant.startsWith('fl') ? 'fl' : plant, zs = h - 2, S = gcan(w, d, h + (BED_H[k] ?? 12) + 4), s = v * 977 + w * 13 + d * 7 + h;
  const t = frame(S, w, d, h, box, s, zs), mulch = k === 'fl' || k === 'shrub' || k === 'ball' || k === 'lav' || k === 'grass' || k === 'box';
  soil(S, t, t, w - t, d - t, zs, s, mulch);
  plantBed(S, t, t, w - t, d - t, zs, plant, s);
  return gfinish(S, w, d);
}
// a small tree in a big planter (24 x 24, 14 high): an olive (a gnarled trunk, a silver-green crown in clouds), a Japanese
// maple (low, wide and red, orange or plum), a clump of bamboo, a bay clipped to a lollipop, a multi-stemmed birch
export function roofTree(kind = 'olive', box = 'concrete', v = 0) {
  const G = gr(), w = 24, d = 24, h = 14, zs = h - 2, S = gcan(w, d, 84, 12), s = v * 131 + kind.length * 17 + 3, rnd = mulberry32(s), c = 12;
  const t = frame(S, w, d, h, box, s, zs);
  soil(S, t, t, w - t, d - t, zs, s, true);
  const trunk = (x, y, z0, z1, Rm, wob, wd = 2) => { for (let z = z0; z <= z1; z++) { const X = x + Math.round((vnoise(z, 0, 7, s + x) - 0.5) * 2 * wob * (z - z0) / Math.max(1, z1 - z0)); for (let i = 0; i < wd; i++) { gp(S, X + i, y, z, pick(Rm, 0.62 - i * 0.3 + (kind === 'birch' && hash(z >> 1, x, s) > 0.8 ? -0.5 : 0), X + i, z, 0.3), i ? 0.5 : -0.5, 0.5, 0.2); gp(S, X + i, y - 1, z, pick(Rm, 0.4, X, z, 0.3), 0, 0, 1); } } };
  // a crown: n lumps of foliage spread sx by sy round (c, c) from z0 to z0 + sz, each r0..r0 + rr across
  const crown = (n, sx, sy, z0, sz, r0, rr, R, o) => { for (let i = 0; i < n; i++) { const a = rnd(), e = rnd(); lump(S, c + (a - 0.5) * sx, c + (e - 0.5) * sy, z0 + rnd() * sz, r0 + rnd() * rr, (r0 + rnd() * rr) * 0.8, r0 * 0.6, r0 * 0.5, R, s + i * 7, o); } };
  if (kind === 'olive') {
    trunk(c - 1, c + 1, zs, zs + 13, G.bark, 2.5, 3); trunk(c - 3, c, zs + 8, zs + 17, G.bark, 2, 1); trunk(c + 2, c, zs + 8, zs + 18, G.bark, 2, 1);
    crown(11, 20, 12, zs + 16, 10, 5, 3, G.silver, { holes: 0.18 });
  } else if (kind === 'maple') {
    trunk(c - 1, c + 1, zs, zs + 8, G.bark, 1.5); trunk(c - 4, c, zs + 5, zs + 13, G.bark, 3, 1); trunk(c + 3, c, zs + 5, zs + 14, G.bark, 3, 1);
    crown(9, 22, 12, zs + 12, 8, 6, 3, G.maple[v % 3], { holes: 0.2, cs: 2 });
  } else if (kind === 'bamboo') {
    const canes = [];
    for (let i = 0; i < 18; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 7; canes.push([Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r * 0.8), 40 + (rnd() * 22 | 0)]); }
    canes.sort((p, q) => p[1] - q[1]);
    for (const [x, y, hgt] of canes) { for (let z = zs; z < zs + hgt; z++) gp(S, x, y, z, pick(G.bamboo, (z - zs) % 7 === 0 ? 0.2 : 0.55 + (hash(x, y, s) - 0.5) * 0.3, x, z, 0.3), -0.4, 0.6, 0.3); }
    for (const [x, y, hgt] of canes) for (let z = zs + hgt * 0.3; z < zs + hgt; z += 4 + rnd() * 3) lump(S, x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 3, z, 3.5 + rnd() * 2, 2.4, 1.8, 1.8, G.leafL, s + x * 3 + Math.round(z), { holes: 0.3, cs: 2 });
  } else if (kind === 'bay') {
    trunk(c - 1, c + 1, zs, zs + 22, G.bark, 0.4, 2);
    lump(S, c, c, zs + 31, 9.5, 8.5, 9, 8, G.boxw, s, { rough: 0.6, cs: 2 });
    for (let i = 0; i < 4; i++) lump(S, c + (rnd() - 0.5) * 14, c + 4 + rnd() * 4, zs + 1, 2.5, 2, 3, 0, G.leafL, s + i, { fl: () => (i & 1 ? G.white : null) });   // (trailing plants round its foot)
  } else {   // birch
    for (const [x, y] of [[c - 4, c + 1], [c + 2, c + 3], [c, c - 3]]) trunk(x, y, zs, zs + 34 + (x & 7), G.birch, 2, 2);
    crown(14, 22, 12, zs + 20, 24, 4, 2.5, G.leafL, { holes: 0.3, cs: 2 });
  }
  return gfinish(S, w, d);
}
// a timber pergola over a table: four posts, two beams along x, rafters across, a climber up a post and over one corner,
// festoon bulbs under the beams (they glow, and cast no shadow)
export function pergola(w = 44, d = 34, h = 30) {
  const m = new Vox(w, d, h + 5), p = m.mat({ ramp: R('#8a6a4a', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.floor(x / 6), Math.floor(z / 6), 3) - 0.5) * 0.5 });
  const lf = m.mat({ ramp: F.FOL('#4a8030'), k: 3, flag: F_LEAF | F_WET, shade: (x, y, z) => (hash(x | 0, y | 0, z | 0) - 0.5) * 1.8 });
  const b = m.mat({ ramp: R('#ffd890', 5, 3), k: 4, emi: [255, 196, 110, 255], flag: F_NOCAST });
  for (const [x, y] of [[1, 1], [w - 4, 1], [1, d - 4], [w - 4, d - 4]]) m.box(x, y, 0, x + 3, y + 3, h, p);
  for (const y of [1, d - 4]) m.box(0, y, h, w, y + 3, h + 2, p);
  for (let x = 1; x < w - 1; x += 5) m.box(x, 0, h + 2, x + 2, d, h + 4, p);
  m.fill((x, y, z) => (hash(x | 0, y | 0, z | 0) > 0.4 ? lf : -1), 0, d - 7, 0, 6, d, h + 2);
  m.fill((x, y, z) => (hash(x >> 1, y >> 1, 5) > 0.25 + (x + d - y) / (w + d) * 1.1 ? lf : -1), 0, 0, h + 3, w, d, h + 5);   // (thinning out from the post it climbs)
  for (let x = 5; x < w - 4; x += 6) for (const y of [2, d - 3]) m.box(x, y, h - 3, x + 1, y + 1, h - 1, b);
  return m;
}
// a water butt: a ribbed barrel with its lid and tap
export function waterButt(col = '#2f5a3a') {
  const m = new Vox(12, 12, 17), b = m.mat({ ramp: R(col, 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.7 : 0) }), l = m.mat({ ramp: R('#2a2c30', 5, 2), k: 2 });
  m.cyl('z', 6, 6, 0, 5.5, 0, 15, b); m.cyl('z', 6, 6, 0, 5.8, 15, 17, l); m.box(5, 11, 3, 7, 12, 5, l);
  return m;
}
// a slatted compost bin, the heap showing through the gaps and green on top
export function compostBin() {
  const m = new Vox(18, 16, 13), wd = m.mat({ ramp: R('#8a6a46', 6, 3), k: 3 }), c = m.mat({ ramp: R('#4a3a2a', 6, 3), k: 2, shade: (x, y) => (hash(x | 0, y | 0, 3) > 0.7 ? 1.2 : 0) });
  const g = m.mat({ ramp: F.FOL('#5a8a34'), k: 3, flag: F_LEAF | F_WET, shade: (x, y) => (hash(x | 0, y | 0, 4) - 0.5) * 1.6 });
  m.fill((x, y, z) => (x < 1.5 || y < 1.5 || x > 16.5 || y > 14.5 ? (Math.round(z) % 3 === 0 ? -1 : wd) : z < 9 ? c : z < 10 && hash(x | 0, y | 0, 6) > 0.5 ? g : -1));
  return m;
}
// a little lamp on a post along a garden path (lit after dark)
export function gardenLantern() {
  const m = new Vox(6, 6, 16), p = m.mat({ ramp: R('#2e3036', 5, 2), k: 2 }), g = m.mat({ ramp: R('#ffe0a0', 5, 3), k: 4, emi: [255, 200, 120, 230], flag: F_NOCAST });
  m.box(2, 2, 0, 4, 4, 11, p); m.box(1, 1, 11, 5, 5, 15, g); m.box(1, 1, 15, 5, 5, 16, p);
  return m;
}

// ---- the woods' trail furniture (the nature program, 2026-10-20: Nature-D2; shared/world3-trails.js) -------------
// a trail's blaze: a waist-high marker post with its trail's colour painted round the top and a pale hiker's chevron
export function trailBlaze(color = '#2a62c8') {
  const m = new Vox(8, 8, 40);
  const wd = m.mat({ ramp: R('#6a4a30'), k: 3, shade: (x, y, z) => (Math.round(z) % 7 === 0 ? -0.8 : 0) });
  const paint = m.mat({ ramp: R(color, 6, 3), k: 3 }), pale = m.mat({ ramp: R('#ece6d6', 5, 2), k: 2 });
  m.box(2, 2, 0, 6, 6, 36, wd);
  m.box(2, 2, 27, 6, 6, 34, paint);
  m.box(3, 6, 30, 5, 6.6, 32, pale);
  m.box(2.5, 2.5, 36, 5.5, 5.5, 38, wd);
  return m;
}
// log steps up a steep stretch of trail: two half-buried logs across it (w wide, across y), packed earth between
export function logSteps(w = 60) {
  const m = new Vox(30, w + 4, 10);
  const log = m.mat({ ramp: R('#6e5038', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(y / 3), Math.round(x), 41) - 0.5) * 0.7 });
  const end = m.mat({ ramp: R('#b89a6a', 5, 2), k: 2, shade: (x, y, z) => (Math.abs(Math.hypot(x % 15 - 7, z - 3) % 2.4 - 1.2) < 0.4 ? -0.8 : 0) });
  const earth = m.mat({ ramp: R('#7a6044', 6, 3), k: 3, shade: (x, y) => (hash(Math.round(x), Math.round(y), 43) - 0.5) * 0.8 });
  for (const cx of [7, 22]) m.fill((x, y, z) => { const d = Math.hypot(x - cx, z - 2); return d < 5.2 && y >= 2 && y < w + 2 ? (y < 3 || y >= w + 1 ? end : log) : -1; }, cx - 6, 0, 0, cx + 6, w + 4, 8);
  m.box(11, 3, 0, 18, w + 1, 4, earth);
  return m;
}
// a log bridge over a creek: one great felled trunk along x, its top adzed flat to walk on, a peeled rail on posts
export function logBridge(len = 140) {
  const m = new Vox(len, 30, 36);
  const bark = m.mat({ ramp: R('#5a4030', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z * 2), 45) - 0.5) * 1.0 });
  const top = m.mat({ ramp: R('#b08a5e', 6, 3), k: 3, shade: (x, y) => (Math.round(x) % 9 === 0 ? -0.6 : 0) + (hash(Math.round(x), Math.round(y), 47) - 0.5) * 0.5 });
  const moss = m.mat({ ramp: R('#5a7a34', 5, 2), k: 3, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.4 });
  const rail = m.mat({ ramp: R('#a8865a'), k: 3, flag: 0 });
  const cy = 14, cz = 6, r = 11;
  m.fill((x, y, z) => { const d = Math.hypot(y - cy, z - cz); if (d > r || z > cz + 6) return -1; if (z >= cz + 5) return top; return z < cz - 4 && hash(Math.round(x / 4), Math.round(y), 49) > 0.6 ? moss : bark; }, 0, 0, 0, len, 30, 18);
  for (let x = 4; x < len - 2; x += 32) m.box(x, 26, cz + 2, x + 2, 28, cz + 26, rail);
  m.box(0, 26, cz + 23, len, 28, cz + 25, rail);
  return m;
}
// a rope bridge over a gorge: planks hung on ropes between timber posts at either end, sagging in the middle; the
// hand ropes along both sides with their hangers
export function ropeBridge(len = 240, w = 44) {
  const m = new Vox(len, w, 44);
  const plank = m.mat({ ramp: MAT.woodDock, k: 3, shade: (x) => (Math.round(x) % 5 === 0 ? -1.2 : 0) + (hash(Math.floor(x / 5), 3, 51) - 0.5) * 0.8 });
  const rope = m.mat({ ramp: R('#b89a6a', 5, 2), k: 2 }), post = m.mat({ ramp: R('#5e4434', 6, 3), k: 3 });
  const H0 = 14, SAG = Math.min(8, len / 40), deck = (x) => H0 - SAG * (1 - ((2 * x) / len - 1) * ((2 * x) / len - 1));
  for (let x = 6; x < len - 6; x++) { const z = Math.round(deck(x)); if (Math.round(x) % 5 !== 4) m.box(x, 4, z - 2, x + 1, w - 4, z, plank); }
  for (const y of [3, w - 4]) {
    for (let x = 6; x < len - 6; x++) { const z = deck(x); m.box(x, y, z - 3, x + 1, y + 1, z - 2, rope); m.box(x, y, z + 18, x + 1, y + 1, z + 19, rope); if (x % 12 === 0) m.box(x, y, z - 2, x + 1, y + 1, z + 18, rope); }
  }
  for (const x of [0, len - 6]) for (const y of [1, w - 6]) m.box(x, y, 0, x + 5, y + 5, H0 + 24, post);
  for (const x of [0, len - 6]) m.box(x, 1, H0 + 20, x + 5, w - 1, H0 + 24, post);
  return m;
}
// a trailhead's drinking fountain: a stone pillar, a steel bowl on top, a push-button spout
export function drinkFountain() {
  const m = new Vox(14, 14, 32);
  const st = m.mat({ ramp: R('#a09a8e', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.8 : 0) + (hash(Math.round(x / 2), Math.round(z / 2), 53) - 0.5) * 0.7 });
  const steel = m.mat({ ramp: MAT.metal, k: 3 }), water = m.mat({ ramp: R('#6aa8c8', 5, 2), k: 2, flag: F_WATER });
  m.box(3, 3, 0, 11, 11, 24, st);
  m.fill((x, y, z) => { const d = Math.hypot(x - 7, y - 7); return d < 6.5 && z >= 24 && z < 28 ? (d < 4.5 && z >= 26 ? water : steel) : -1; }, 0, 0, 24, 14, 14, 28);
  m.box(6, 1, 27, 8, 4, 30, steel);
  return m;
}

// ---- the MX park (the nature program, 2026-10-20: Nature-C1; shared/world3-dirt.js) -------------------------------
// a tabletop jump: a mound of packed red dirt along x (len), its takeoff and landing ramps `ramp` long, the flat top h
// high, w across - tyre tracks worn along it (the clients lift a bike over it: client/art2/game/jumps.js)
export function tabletop(len = 416, w = 112, h = 30, ramp = 128) {
  const m = new Vox(len, w, h + 4);
  const dirt = m.mat({ ramp: R('#a8603a', 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y / 2), 61) - 0.5) * 0.9 + (Math.abs(((y + 7) % 26) - 13) < 2 ? -0.9 : 0) - (z < h * 0.4 ? 0.4 : 0) });
  const lip = m.mat({ ramp: R('#8a4a2a', 6, 3), k: 3 });
  const half = len / 2;
  m.fill((x, y, z) => {
    const u = Math.abs(x + 0.5 - half), edge = Math.min(y, w - 1 - y), side = Math.min(1, edge / 10);
    const top = (u >= half ? 0 : u > half - ramp ? h * (half - u) / ramp : h) * (0.6 + 0.4 * side) - (edge < 10 ? (10 - edge) * 0.6 : 0);
    if (z >= top) return -1;
    return top - z < 2 && u < half - ramp + 3 && u > half - ramp - 3 ? lip : dirt;
  });
  return m;
}
// a berm: a banked wall of dirt round the outside of a turn, len along x, rising toward its outer side (y = depth when
// side > 0)
export function berm(len = 64, h = 18, side = 1) {
  const d = 30, m = new Vox(len, d, h + 2);
  const dirt = m.mat({ ramp: R('#9a5634', 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 2), Math.round(y), 63) - 0.5) * 0.8 + (z > h - 3 ? 0.5 : 0) });
  m.fill((x, y, z) => { const t = side > 0 ? y / (d - 1) : 1 - y / (d - 1), top = h * Math.min(1, t * 1.25) * (0.9 + 0.1 * hash(Math.round(x / 6), 1, 65)); return z < top ? dirt : -1; });
  return m;
}
// red-and-white tape on stakes along a course, len along x
export function tapeLine(len = 128) {
  const m = new Vox(len, 4, 22);
  const stake = m.mat({ ramp: R('#d8d0c0', 5, 2), k: 2, flag: F_THIN }), red = m.mat({ ramp: R('#d83a2a', 5, 2), k: 2, flag: F_THIN }), white = m.mat({ ramp: R('#f2ede4', 5, 2), k: 2, flag: F_THIN });
  for (let x = 2; x < len; x += 32) m.box(x, 1, 0, x + 2, 3, 20, stake);
  for (let x = 0; x < len; x++) m.box(x, 1.5, 15 + (Math.abs((x % 32) - 16) / 16) * 1.2, x + 1, 2.5, 17 + (Math.abs((x % 32) - 16) / 16) * 1.2, Math.floor(x / 8) % 2 ? red : white);
  return m;
}
// the start gate: a row of steel drop-plates across the course on their bar, w wide (along x), a post at each end
export function startGate(w = 120) {
  const m = new Vox(w, 14, 30);
  const steel = m.mat({ ramp: MAT.metal, k: 3 }), plate = m.mat({ ramp: R('#d8d8d0', 5, 2), k: 3, shade: (x) => (Math.round(x) % 12 < 1 ? -1 : 0) }), post = m.mat({ ramp: R('#3a3a40', 5, 2), k: 3 });
  m.box(0, 5, 2, w, 9, 4, steel);
  for (let x = 4; x < w - 4; x += 12) m.box(x, 5, 4, x + 10, 7, 18, plate);
  for (const x of [0, w - 4]) m.box(x, 4, 0, x + 4, 10, 28, post);
  m.box(0, 5, 26, w, 8, 28, post);
  return m;
}
// the timing tower: a cab on four braced legs, its windows round, a chequered board on its front, a flag on top
export function timingTower() {
  const S = 40, h = 70, m = new Vox(S + 12, S + 12, h + 60);
  const leg = m.mat({ ramp: R('#6e7076', 5, 2), k: 3 }), cab = m.mat({ ramp: R('#e8e2d4', 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.6 : 0) });
  const glass = m.mat({ ramp: R('#ffd890', 5, 3), k: 3, emi: [255, 210, 130, 140], flag: F_GLASS }), roof = m.mat({ ramp: R('#a8341e', 6, 3), k: 3 });
  const chk = m.mat({ ramp: R('#202024', 4, 2), k: 1 }), wht = m.mat({ ramp: R('#f4f2ec', 4, 2), k: 1 });
  const o = 6;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) m.box(o + cx * (S - 4), o + cy * (S - 4), 0, o + cx * (S - 4) + 4, o + cy * (S - 4) + 4, h, leg);
  for (let z = 6; z < h - 4; z += 16) { m.box(o, o + S - 3, z, o + S, o + S - 1, z + 2, leg); m.box(o, o, z, o + S, o + 2, z + 2, leg); }
  m.box(o - 3, o - 3, h, o + S + 3, o + S + 3, h + 3, leg);
  m.box(o, o, h + 3, o + S, o + S, h + 30, cab);
  m.box(o + 3, o + S - 1, h + 14, o + S - 3, o + S + 0.5, h + 26, glass);
  for (let x = 0; x < 8; x++) for (let z = 0; z < 2; z++) m.box(o + 4 + x * 4, o + S, h + 6 + z * 4, o + 8 + x * 4, o + S + 1, h + 10 + z * 4, (x + z) % 2 ? chk : wht);
  m.box(o - 4, o - 4, h + 30, o + S + 4, o + S + 4, h + 34, roof);
  m.box(o + S / 2 - 1, o + S / 2 - 1, h + 34, o + S / 2 + 1, o + S / 2 + 1, h + 56, leg);
  for (let x = 0; x < 6; x++) for (let z = 0; z < 4; z++) m.box(o + S / 2 + 1 + x * 3, o + S / 2, h + 44 + z * 3, o + S / 2 + 4 + x * 3, o + S / 2 + 1, h + 47 + z * 3, (x + z) % 2 ? chk : wht);
  return m;
}
// a floodlight mast: a tall steel pole, a bank of lamps at its head
export function floodMast(h = 220) {
  const m = new Vox(36, 14, h + 18);
  const pole = m.mat({ ramp: MAT.metal, k: 3 }), lamp = m.mat({ ramp: R('#fff2c8', 5, 3), k: 3, emi: [255, 240, 200, 220] }), head = m.mat({ ramp: R('#3a3a40', 5, 2), k: 3 });
  m.fill((x, y, z) => (Math.hypot(x - 18, y - 7) < 3.2 - z / h && z < h ? pole : -1), 0, 0, 0, 36, 14, h);
  m.box(2, 4, h, 34, 12, h + 16, head);
  for (let x = 4; x < 32; x += 7) for (let z = 0; z < 2; z++) m.box(x, 11.5, h + 2 + z * 7, x + 5, 12.6, h + 7 + z * 7, lamp);
  return m;
}
// an enclosed race trailer, its tail ramp down (len along x, the ramp at x = 0), in a team colour
export function mxTrailer(c = 0) {
  const L = 120, W = 46, H = 50, RL = 34, m = new Vox(L + RL, W, H + 4);
  const body = m.mat({ ramp: R(['#e8e6e0', '#2a4a8a', '#c8342e'][c % 3], 6, 3), k: 3, shade: (x, y, z) => (Math.round(z) % 12 === 0 ? -0.5 : 0) });
  const stripe = m.mat({ ramp: R(['#c8342e', '#e8c030', '#202024'][c % 3], 5, 2), k: 3 }), dark = m.mat({ ramp: R('#202024', 4, 2), k: 1 });
  const tyre = m.mat({ ramp: R('#1a1a1c', 4, 1), k: 1 }), ramp = m.mat({ ramp: MAT.metal, k: 3, shade: (x) => (Math.round(x) % 4 === 0 ? -0.8 : 0) });
  m.box(RL, 2, 8, RL + L, W - 2, H, body);
  m.box(RL, W - 2.5, 22, RL + L, W - 1.5, 28, stripe); m.box(RL, 1.5, 22, RL + L, 2.5, 28, stripe);
  m.box(RL, 6, 10, RL + 1, W - 6, H - 2, dark);   // (the open tail)
  m.fill((x, y, z) => (x < RL && y > 6 && y < W - 6 && z < 8 * (x / RL) + 1 && z > 8 * (x / RL) - 2 ? ramp : -1), 0, 0, 0, RL, W, 10);
  for (const x of [RL + 70, RL + 90]) for (const y of [0, W - 6]) m.box(x, y, 0, x + 14, y + 6, 12, tyre);
  return m;
}
// an upturned root plate: a fallen tree's disc of roots and earth stood on edge, the trunk's stub lying off it
export function rootPlate() {
  const m = new Vox(84, 40, 74);
  const earth = m.mat({ ramp: R('#6a4a30', 7, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z / 3), 67) - 0.5) * 1.2 });
  const root = m.mat({ ramp: R('#8a6a48', 6, 3), k: 3, flag: F_THIN }), bark = m.mat({ ramp: R('#5a4030', 6, 3), k: 3, shade: (x, y, z) => (hash(Math.round(x / 3), Math.round(z), 69) - 0.5) * 0.9 });
  const moss = m.mat({ ramp: R('#5a7a34', 5, 2), k: 3 });
  m.fill((x, y, z) => { const d = Math.hypot(x - 30, z - 34); return d < 30 + (hash(Math.round(Math.atan2(z - 34, x - 30) * 6), 1, 71) - 0.5) * 8 && y > 16 && y < 26 ? (d > 24 && hash(Math.round(x), Math.round(z), 73) > 0.55 ? root : earth) : -1; });
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, L = 32 + hash(k, 2, 75) * 10; for (let s = 24; s < L; s++) m.box(30 + Math.cos(a) * s, 18, 34 + Math.sin(a) * s, 31.5 + Math.cos(a) * s, 22, 35.5 + Math.sin(a) * s, root); }
  m.fill((x, y, z) => (x > 44 && Math.hypot(y - 20, z - 10) < 9 ? (z > 16 && hash(Math.round(x / 4), 1, 77) > 0.6 ? moss : bark) : -1), 44, 8, 0, 84, 32, 20);
  return m;
}
