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
import { GBuf, F_WATER, F_NOCAST, F_LEAF, F_GLASS, F_GROUND, F_WET, hash, bayer, vnoise, mulberry32 } from './gbuf.js';
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
  const ms = m.mat({ ramp: F.FOL('#5e8a2c'), k: 3, flag: F_LEAF, shade: (x, y, z) => (hash(Math.round(x), Math.round(y), Math.round(z)) - 0.5) * 1.2 });
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
