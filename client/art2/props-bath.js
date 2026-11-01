// Art v2 furniture for a bathhouse's floor (the owner, 10-16: "Bathhouses and locker rooms with usable showers";
// shared/homelayout.js 'bath', server/systems/bathhouse.js): voxel models as props-home.js's, one per piece of the plan -
// the front desk, the towels on their shelf, the lockers, the benches, the wash stations (a shower on the tiled wall, the
// low stool and the bucket), the big tiled bath in its timber rim, the hot stones in their box. Only client/render/
// homeart2.js loads this, with the rest of the bathhouse's drawing: it's in neither the page's code nor the renderer's
// nor the chunk bake's. Each maker takes the footprint (w along x, d along y, world px) and returns a Vox facing +y.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash, step } from './gbuf.js';

const R = (h, n = 6, k) => ramp(h, n, k);
const WOOD = '#9a6a40', DARK = '#5a3a24', HINOKI = '#c8a070', TILEC = '#d8e6ea', BLUE = '#2a4a7a';

// the front desk: a timber counter, its top, the bell and the register, a vase of flowers; the key board on the wall
export function bathDesk(w = 160, d = 32) {
  const m = new Vox(w, d, 44);
  const wood = m.mat({ ramp: R(WOOD), k: 3, shade: (x, y, z) => (y > d - 3 && Math.round(x) % 12 === 0 ? -1 : hash(Math.round(x / 3), Math.round(z), 4) > 0.85 ? -0.4 : 0) });
  const top = m.mat({ ramp: R(HINOKI), k: 4 }), brass = m.mat({ ramp: R('#d8b050'), k: 4 }), reg = m.mat({ ramp: R('#3a3a40'), k: 3 }), scr = m.mat({ ramp: R('#7ad8a0', 5, 3), k: 3, emi: [120, 240, 160, 90], flag: F_NOCAST });
  const vase = m.mat({ ramp: R('#2a4a7a'), k: 3 }), fl = m.mat({ ramp: R('#e85a7a'), k: 3 }), leaf = m.mat({ ramp: R('#4a8a3a'), k: 3 });
  m.box(2, 8, 0, w - 2, d - 2, 26, wood); m.box(0, 6, 26, w, d, 29, top);
  m.cyl('z', 22, 18, 0, 4, 29, 32, brass); m.box(21, 17, 32, 23, 19, 34, brass);                 // the bell
  m.box(w - 46, 10, 29, w - 22, 24, 38, reg); m.box(w - 44, 10, 38, w - 24, 14, 44, scr);     // the register
  m.cyl('z', w / 2, 16, 0, 4, 29, 39, vase); m.ell(w / 2 - 3, 15, 42, 3, 3, 3, fl); m.ell(w / 2 + 3, 17, 41, 3, 3, 3, fl); m.ell(w / 2, 13, 40, 2, 2, 3, leaf);
  return m;
}
// the towels: a timber shelf, two tiers of folded towels in the house's white and indigo, the rolled ones on top
export function towelShelf(w = 96, d = 32) {
  const m = new Vox(w, d, 46);
  const wood = m.mat({ ramp: R(DARK), k: 3 }), wt = m.mat({ ramp: R('#f2f0ea'), k: 4, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.5 : 0) }), ind = m.mat({ ramp: R(BLUE), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.5 : 0) });
  m.box(0, 4, 0, 3, d - 2, 44, wood); m.box(w - 3, 4, 0, w, d - 2, 44, wood);
  for (const z of [0, 18, 36]) m.box(0, 4, z, w, d - 2, z + 2, wood);
  for (let i = 0; i < Math.floor((w - 8) / 16); i++) {
    m.box(5 + i * 16, 8, 2, 18 + i * 16, d - 4, 14, i % 2 ? ind : wt);
    m.box(5 + i * 16, 8, 20, 18 + i * 16, d - 4, 32, i % 2 ? wt : ind);
    m.cyl('y', 11 + i * 16, 0, 42, 4, 8, d - 4, i % 3 ? wt : ind);
  }
  return m;
}
// the lockers: a bank of timber lockers two high, each door with its brass number plate and its key on an elastic band
export function lockers(w = 128, d = 32) {
  const m = new Vox(w, d, 62), n = Math.max(1, Math.round(w / 24)), cw = w / n;
  const b = m.mat({ ramp: R(HINOKI), k: 3, shade: (x, y, z) => (y > d - 3 && (Math.abs((x % cw)) < 1 || Math.abs(z - 31) < 0.8) ? -1.2 : hash(Math.round(x / 3), Math.round(z), 2) > 0.88 ? -0.3 : 0) });
  const top = m.mat({ ramp: R(DARK), k: 3 }), plate = m.mat({ ramp: R('#d8b050'), k: 4 }), band = m.mat({ ramp: R('#c83a2a'), k: 3 });
  m.box(0, 8, 0, w, d - 1, 60, b); m.box(0, 7, 58, w, d, 62, top);
  for (let i = 0; i < n; i++) for (const z of [44, 14]) {
    const cx = (i + 0.5) * cw;
    m.box(cx - 3, d - 1, z, cx + 3, d, z + 4, plate);
    if (hash(i, z, 7) > 0.35) m.box(cx + 4, d - 1, z - 6, cx + 6, d, z + 2, band);   // (a key still in it: free)
  }
  return m;
}
// a bench: slatted timber on two legs, a folded towel on it now and then
export function bathBench(w = 64, d = 32, tier = 2, seed = 0) {
  const m = new Vox(w, d, 20);
  const wood = m.mat({ ramp: R(HINOKI), k: 3, shade: (x, y) => (Math.round(y) % 6 === 0 ? -1 : 0) }), leg = m.mat({ ramp: R(DARK), k: 3 }), tw = m.mat({ ramp: R(seed % 2 ? BLUE : '#f2f0ea'), k: 3 });
  m.box(3, 8, 0, 7, d - 6, 12, leg); m.box(w - 7, 8, 0, w - 3, d - 6, 12, leg);
  m.box(0, 6, 12, w, d - 4, 15, wood);
  if (hash(w, d, seed + 3) > 0.4) m.box(w * 0.55, 9, 15, w * 0.55 + 16, d - 7, 18, tw);
  return m;
}
// a wash station (a sento's shower): the tiled panel on the wall, the shower head and its hose, the mirror, the low stool
// and the wooden bucket in front of it
export function washStation(w = 32, d = 32) {
  const m = new Vox(w, d, 60);
  const tile = m.mat({ ramp: R(TILEC), k: 3, shade: (x, y, z) => (Math.round(x) % 6 === 0 || Math.round(z) % 6 === 0 ? -0.7 : 0) }), ch = m.mat({ ramp: MAT.chrome || R('#c8ccd2'), k: 4 });
  const mir = m.mat({ ramp: R('#b8d4e0', 5, 3), k: 3, flag: F_GLASS }), stool = m.mat({ ramp: R(HINOKI), k: 3 }), buck = m.mat({ ramp: R(WOOD), k: 3, shade: (x, y, z) => (Math.abs(z - 4) < 0.6 || Math.abs(z - 9) < 0.6 ? -1.4 : 0) }), tray = m.mat({ ramp: R('#c8ccd0'), k: 3 });
  m.box(1, 1, 0, w - 1, 5, 58, tile); m.box(1, 5, 0, w - 1, d - 2, 2, tray);
  m.box(6, 5, 30, w - 6, 6, 44, mir);
  m.box(w / 2 - 1, 5, 50, w / 2 + 1, 10, 52, ch); m.box(w / 2 - 3, 8, 47, w / 2 + 3, 12, 50, ch); m.box(4, 5, 22, 8, 7, 52, ch);
  m.box(w / 2 - 6, 14, 2, w / 2 + 6, 24, 9, stool);
  m.cyl('z', w - 9, d - 8, 0, 5, 0, 11, buck); m.cyl('z', w - 9, d - 8, 0, 3.5, 4, 11, 0);
  return m;
}
// the bath: a deep tub in a timber rim, tiled inside, the hot water near its top (bathers sit in it: homeview.js)
export function bigBath(w = 448, d = 64) {
  const m = new Vox(w, d, 18);
  const rim = m.mat({ ramp: R(HINOKI), k: 4, shade: (x) => (Math.round(x) % 32 === 0 ? -0.6 : 0) }), side = m.mat({ ramp: R(TILEC), k: 3, shade: (x, y, z) => (Math.round(x) % 8 === 0 || Math.round(z) % 6 === 0 ? -0.5 : 0) });
  const wat = m.mat({ ramp: R('#6ab4d0', 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.21 + y * 0.43) > 0.8 ? 0.6 : Math.sin(x * 0.13 - y * 0.3) < -0.85 ? -0.3 : 0) });
  m.box(0, 0, 0, w, d, 14, side); m.box(0, 0, 14, w, d, 18, rim);
  m.box(6, 6, 2, w - 6, d - 6, 18, 0);
  m.box(6, 6, 2, w - 6, d - 6, 12, wat);
  return m;
}
// the hot stones: a timber box of river stones over the glowing coals, the bucket and its ladle beside it
export function hotStones(w = 64, d = 64) {
  const m = new Vox(w, d, 34);
  const box = m.mat({ ramp: R(DARK), k: 3 }), coal = m.mat({ ramp: R('#e85a30', 5, 3), k: 3, emi: [255, 120, 50, 160], flag: F_NOCAST });
  const st = [m.mat({ ramp: R('#7a7470'), k: 3 }), m.mat({ ramp: R('#5a5652'), k: 3 }), m.mat({ ramp: R('#8e8680'), k: 3 })], buck = m.mat({ ramp: R(HINOKI), k: 3 });
  m.box(4, 6, 0, w - 4, d - 4, 16, box); m.box(8, 10, 12, w - 8, d - 8, 16, coal);
  for (let i = 0; i < 18; i++) { const x = 12 + hash(i, 1, 3) * (w - 24), y = 14 + hash(i, 2, 3) * (d - 28); m.ell(x, y, 17 + hash(i, 3, 3) * 6, 5, 4, 3.5, st[i % 3]); }
  m.cyl('z', w - 8, d - 6, 0, 6, 0, 12, buck); m.box(w - 9, d - 18, 10, w - 7, d - 6, 12, buck);
  return m;
}
export const BATH_MAKERS = { I: bathDesk, f: towelShelf, J: lockers, o: bathBench, H: washStation, u: bigBath, y: hotStones };

// ---- (nat5, the owner 10-31: "a few more bath houses") the other houses' pieces and looks (shared/homelayout.js's plans
// bathonsen, bathkr, bathspa, bathsea; L.bath their style): the onsen's hinoki bath and its rock pools under the maples
// (L7), the jjimjilbang's tiled tubs, sauna and heated floor (L5), the spa's mosaic pool, steam room, cedar sauna and
// loungers (L8), the seaside house's big bath under its mural of the sea (L6) and every house's cold plunge
const MILKY = '#7ec8c0', STONE = ['#6a6460', '#5a5450', '#7e7670', '#4e4a48'];
// an onsen's rock pool (open to the sky): the milky hot water in an outline that wanders, boulders packed round its rim -
// moss on some - a bamboo spout at the back pouring in, pebbles on its bed
export function rockPool(w = 160, d = 64, tier = 2, seed = 0) {
  const m = new Vox(w, d, 26), cx = w / 2, cy = d / 2 + 2, rx = w / 2 - 7, ry = d / 2 - 6;
  const wat = m.mat({ ramp: R(MILKY, 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.19 + y * 0.41 + seed) > 0.82 ? 0.7 : Math.hypot((x - cx) / rx, (y - cy) / ry) > 0.8 ? 0.35 : -0.15) });
  const bed = m.mat({ ramp: R('#8a8478'), k: 3 }), st = STONE.map((c) => m.mat({ ramp: R(c), k: 3 })), moss = m.mat({ ramp: R('#5a7a3a'), k: 3 });
  const bam = m.mat({ ramp: R('#8aa04a'), k: 3, shade: (x) => (Math.round(x) % 7 === 0 ? -1 : 0) }), post = m.mat({ ramp: R(DARK), k: 3 });
  const q = (x, y) => { const a = Math.atan2(y - cy, x - cx); return Math.hypot((x - cx) / rx, (y - cy) / ry) / (1 + 0.1 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 5 + seed * 2)); };
  m.fill((x, y, z) => (q(x + 0.5, y + 0.5) < 1 ? (z < 2 ? bed : z < 9 ? wat : -1) : -1), 0, 0, 0, w, d, 9);
  const n = Math.round((w + d) / 9);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + hash(i, seed, 41) * 0.3, r = 1.02 + hash(i, 2, 41) * 0.08;
    const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r, s = 6 + hash(i, 3, 41) * 5;
    m.ell(x, y, 5 + s * 0.4, s, s * 0.8, s * 0.75, st[i % 4]);
    if (hash(i, 4, 41) > 0.7) m.ell(x - 1, y - 1, 6 + s, s * 0.6, s * 0.5, 2, moss);
  }
  const sx = cx - rx * 0.4;   // (the spout: a split bamboo on two posts from the back, the water falling into the pool)
  m.box(sx - 1, 0, 0, sx + 2, 3, 22, post); m.box(sx - 4, 1, 20, sx + 5, 18, 23, bam);
  m.box(sx - 1, 17, 6, sx + 2, 19, 20, m.mat({ ramp: R('#d8f0f0', 4, 2), k: 3, flag: F_GLASS | F_NOCAST }));
  return m;
}
// the onsen's indoor bath: a deep tub of pale hinoki boards, a stone step, the water milky from the spring
export function hinokiBath(w = 192, d = 64) {
  const m = new Vox(w, d, 20);
  const rim = m.mat({ ramp: R('#d8b47a'), k: 4, shade: (x, y) => (Math.round(x) % 16 === 0 || Math.round(y) % 16 === 0 ? -0.7 : 0) }), side = m.mat({ ramp: R('#c49a62'), k: 3, shade: (x, y, z) => (Math.round(z) % 5 === 0 ? -0.8 : 0) });
  const wat = m.mat({ ramp: R(MILKY, 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.2 + y * 0.5) > 0.85 ? 0.6 : 0) }), stp = m.mat({ ramp: R('#7a7470'), k: 3 });
  m.box(0, 0, 0, w, d, 15, side); m.box(0, 0, 15, w, d, 19, rim); m.box(6, 6, 2, w - 6, d - 6, 19, 0); m.box(6, 6, 2, w - 6, d - 6, 13, wat);
  m.box(w - 30, d - 4, 0, w - 8, d, 7, stp);
  return m;
}
// a tiled tub (the jjimjilbang's, the seaside house's): its tiled sides and rim, the water hot (rose) or warm (blue) by
// its size, the temperature panel on the wall behind; mural: the seaside house's painted sea and mountain behind it
export function tiledTub(w = 160, d = 64, tier = 2, seed = 0, o = {}) {
  const mural = !!o.mural, hot = !mural && w >= 160, m = new Vox(w, d, mural ? 72 : 30);
  const tile = m.mat({ ramp: R(o.tile || '#e0d8c8'), k: 3, shade: (x, y, z) => (Math.round(x) % 8 === 0 || Math.round(z) % 6 === 0 || Math.round(y) % 8 === 0 ? -0.6 : 0) });
  const wat = m.mat({ ramp: R(hot ? '#c8807a' : o.water || '#5aa8d0', 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.23 + y * 0.37) > 0.8 ? 0.6 : Math.sin(x * 0.11 - y * 0.29) < -0.85 ? -0.3 : 0) });
  const y0 = mural ? 6 : 0;
  m.box(0, y0, 0, w, d, 12, tile); m.box(5, y0 + 5, 2, w - 5, d - 5, 12, 0); m.box(5, y0 + 5, 2, w - 5, d - 5, 10, wat);
  if (!mural) {   // the temperature panel and the spout
    const pan = m.mat({ ramp: R('#2a2a30'), k: 3 }), dig = m.mat({ ramp: R(hot ? '#f05a4a' : '#5ad8f0', 4, 2), k: 3, emi: hot ? [255, 90, 70, 160] : [90, 220, 255, 160], flag: F_NOCAST });
    m.box(w / 2 - 12, 0, 18, w / 2 + 12, 3, 30, pan); m.box(w / 2 - 9, 2, 21, w / 2 + 9, 4, 27, dig);
    if (hot) { const ch = m.mat({ ramp: R('#b8bcc2'), k: 4 }); m.box(w * 0.75 - 4, 0, 12, w * 0.75 + 4, 10, 16, ch); m.box(w * 0.75 - 2, 8, 6, w * 0.75 + 2, 10, 14, m.mat({ ramp: R('#d8f0f0', 4, 2), k: 3, flag: F_GLASS | F_NOCAST })); }
    return m;
  }
  // the mural (L6): the painted wall behind the bath - the sky, the snow-capped mountain, the pines, the sea's waves
  const sky = m.mat({ ramp: R('#9ad0f0', 5, 2), k: 2, flag: F_NOCAST, emi: [150, 200, 240, 70] }), mt = m.mat({ ramp: R('#5a7ab0', 5, 2), k: 2, flag: F_NOCAST, emi: [80, 110, 160, 40] }), snow = m.mat({ ramp: R('#f2f4f6', 4, 2), k: 2, flag: F_NOCAST, emi: [240, 244, 250, 80] });
  const sea = m.mat({ ramp: R('#2a6aa8', 5, 2), k: 2, flag: F_NOCAST, shade: (x, y, z) => (Math.sin(x * 0.3 + z) > 0.7 ? 0.8 : 0) }), pine = m.mat({ ramp: R('#2e5a3a', 5, 2), k: 2, flag: F_NOCAST }), frame = m.mat({ ramp: R(DARK), k: 3 });
  for (let z = 12; z < 70; z++) for (let x = 2; x < w - 2; x++) {
    const peak = 66 - Math.abs(x - w * 0.5) / (w * 0.5) * 50, isSea = z < 24, isMt = z < peak && z >= 24, isSnow = isMt && z > peak - 9;
    const isPine = !isSea && (x < w * 0.16 || x > w * 0.84) && z < 34 + 10 * Math.abs(Math.sin(x * 0.3));
    m.box(x, 0, z, x + 1, 3, z + 1, isSea ? sea : isPine ? pine : isSnow ? snow : isMt ? mt : sky);
  }
  m.box(0, 0, 70, w, 4, 72, frame); m.box(0, 0, 12, 2, 4, 72, frame); m.box(w - 2, 0, 12, w, 4, 72, frame);
  return m;
}
// the spa's pool: blue mosaic, the steps down at one end, its lights under the water
export function spaPool(w = 320, d = 96) {
  const m = new Vox(w, d, 16);
  const deck = m.mat({ ramp: R('#d8ccb4'), k: 3, shade: (x, y) => (Math.round(x) % 16 === 0 || Math.round(y) % 16 === 0 ? -0.5 : 0) });
  const mos = m.mat({ ramp: R('#3a7ab8'), k: 3, shade: (x, y, z) => ((Math.round(x / 3) + Math.round(y / 3) + Math.round(z / 3)) % 3 === 0 ? 0.5 : 0) });
  const wat = m.mat({ ramp: R('#3aa0d8', 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.17 + y * 0.31) > 0.85 ? 0.8 : 0) }), lit = m.mat({ ramp: R('#c8f0ff', 4, 2), k: 3, emi: [160, 230, 255, 180], flag: F_NOCAST });
  m.box(0, 0, 0, w, d, 12, deck); m.box(5, 5, 1, w - 5, d - 5, 12, mos); m.box(8, 8, 2, w - 8, d - 8, 12, 0); m.box(8, 8, 2, w - 8, d - 8, 10, wat);
  for (let k = 0; k < 3; k++) m.box(w - 8 - (k + 1) * 10, 8, 2, w - 8 - k * 10, d - 8, 4 + k * 2, mos);   // the steps
  for (let i = 0; i < Math.floor(w / 80); i++) m.box(40 + i * 80, 8, 5, 46 + i * 80, 9, 8, lit);
  return m;
}
// the cold plunge: a small deep pool in steel-blue tiles, the chrome rail down into it, the water ice-blue
export function coldPlunge(w = 64, d = 64) {
  const m = new Vox(w, d, 34);
  const tile = m.mat({ ramp: R('#5a7a9a'), k: 3, shade: (x, y, z) => (Math.round(x) % 6 === 0 || Math.round(z) % 6 === 0 ? -0.6 : 0) }), ch = m.mat({ ramp: R('#c8ccd2'), k: 4 });
  const wat = m.mat({ ramp: R('#8ad8f0', 6, 3), k: 3, flag: F_GLASS | F_NOCAST, shade: (x, y) => (Math.sin(x * 0.4 + y * 0.6) > 0.8 ? 0.6 : 0) });
  m.box(0, 0, 0, w, d, 14, tile); m.box(5, 5, 1, w - 5, d - 5, 14, 0); m.box(5, 5, 1, w - 5, d - 5, 12, wat);
  m.box(w - 12, d - 6, 12, w - 10, d - 2, 32, ch); m.box(w - 12, d - 16, 30, w - 10, d - 2, 32, ch); m.box(w - 12, d - 16, 12, w - 10, d - 14, 32, ch);
  return m;
}
// a sauna, cut away to show in: cedar walls round its back and sides, two tiers of benches along the back, the stove in
// the corner with its stones over the glowing coals, the bucket and ladle, a sand timer on the wall
export function sauna(w = 160, d = 96, tier = 2, seed = 0, o = {}) {
  const m = new Vox(w, d, 46);
  const ced = m.mat({ ramp: R(o.wood || '#b8784a'), k: 3, shade: (x, y, z) => (Math.round(z) % 6 === 0 ? -0.9 : hash(Math.round(x / 4), Math.round(z), 5) > 0.88 ? -0.3 : 0) });
  const bench = m.mat({ ramp: R('#d8a870'), k: 3, shade: (x) => (Math.round(x) % 8 === 0 ? -1 : 0) }), floor = m.mat({ ramp: R('#8a5a34'), k: 3, shade: (x, y) => (Math.round(y) % 6 === 0 ? -0.8 : 0) });
  const stove = m.mat({ ramp: R('#3a3a40'), k: 3 }), coal = m.mat({ ramp: R('#ff7040', 5, 3), k: 3, emi: [255, 130, 60, 200], flag: F_NOCAST }), st = STONE.map((c) => m.mat({ ramp: R(c), k: 3 })), buck = m.mat({ ramp: R(HINOKI), k: 3 });
  m.box(0, 0, 0, w, d, 2, floor);
  m.box(0, 0, 0, w, 4, 46, ced); m.box(0, 0, 0, 4, d - 2, 30, ced); m.box(w - 4, 0, 0, w, d - 2, 30, ced);
  m.box(4, 4, 0, w - 4, 26, 24, bench); m.box(4, 26, 0, w - 4, 44, 12, bench);   // (the benches: the high tier at the back, the low in front)
  const sx = o.stoveLeft ? 18 : w - 22;
  m.box(sx - 12, d - 30, 0, sx + 12, d - 8, 16, stove); m.box(sx - 9, d - 27, 14, sx + 9, d - 11, 17, coal);
  for (let i = 0; i < 12; i++) m.ell(sx - 8 + hash(i, 1, 9) * 16, d - 26 + hash(i, 2, 9) * 14, 18 + hash(i, 3, 9) * 4, 4, 3.5, 3, st[i % 4]);
  m.cyl('z', w / 2, d - 14, 0, 6, 0, 12, buck); m.box(w / 2 - 1, d - 26, 10, w / 2 + 1, d - 14, 12, buck);
  return m;
}
// the spa's steam room: frosted glass round a tiled bench, the stones steaming in their box
export function steamRoom(w = 96, d = 64) {
  const m = new Vox(w, d, 50);
  const gl = m.mat({ ramp: R('#c8dce4', 5, 2), k: 3, flag: F_GLASS | F_NOCAST }), tile = m.mat({ ramp: R('#d8e0e4'), k: 3, shade: (x, y, z) => (Math.round(x) % 8 === 0 || Math.round(z) % 6 === 0 ? -0.5 : 0) });
  const fr = m.mat({ ramp: R('#8a9098'), k: 3 }), st = STONE.map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.box(0, 0, 0, w, 3, 50, tile); m.box(0, 0, 0, 3, d, 40, gl); m.box(w - 3, 0, 0, w, d, 40, gl); m.box(0, 0, 40, 3, d, 42, fr); m.box(w - 3, 0, 40, w, d, 42, fr);
  m.box(3, 3, 0, w - 3, 24, 16, tile);
  m.box(w / 2 - 12, d - 22, 0, w / 2 + 12, d - 6, 8, fr);
  for (let i = 0; i < 9; i++) m.ell(w / 2 - 8 + hash(i, 1, 4) * 16, d - 18 + hash(i, 2, 4) * 8, 9 + hash(i, 3, 4) * 3, 4, 3, 3, st[i % 4]);
  return m;
}
// the jjimjilbang's heated floor (ondol): its warm yellow paper floor, the mats in a row, a wooden block pillow on each
export function ondol(w = 96, d = 160) {
  const m = new Vox(w, d, 8);
  const fl = m.mat({ ramp: R('#d8b060'), k: 3, shade: (x, y) => (Math.round(x) % 24 === 0 || Math.round(y) % 24 === 0 ? -0.6 : hash(Math.round(x / 6), Math.round(y / 6), 3) > 0.9 ? 0.3 : 0) });
  const mat = [m.mat({ ramp: R('#c8644a'), k: 3 }), m.mat({ ramp: R('#4a7a9a'), k: 3 }), m.mat({ ramp: R('#8a6aa8'), k: 3 })], pil = m.mat({ ramp: R('#a87a4a'), k: 3 });
  m.box(0, 0, 0, w, d, 2, fl);
  const along = d >= w, n = Math.max(1, Math.floor((along ? d : w) / 36));
  for (let i = 0; i < n; i++) {
    const a = 6 + i * 36;
    if (along) { m.box(6, a, 2, w - 6, a + 28, 4, mat[i % 3]); m.box(8, a + 8, 4, 18, a + 20, 8, pil); }
    else { m.box(a, 6, 2, a + 28, d - 6, 4, mat[i % 3]); m.box(a + 8, 8, 4, a + 20, 18, 8, pil); }
  }
  return m;
}
// the spa's loungers: white cushioned chaises, a towel rolled on each, a side table with a candle between them
export function loungers(w = 96, d = 32) {
  const m = new Vox(w, d, 22);
  const frame = m.mat({ ramp: R('#b8b0a4'), k: 3 }), cush = m.mat({ ramp: R('#f2eee6'), k: 3, shade: (x) => (Math.round(x) % 10 === 0 ? -0.5 : 0) }), tw = m.mat({ ramp: R('#5a8aa8'), k: 3 });
  const tbl = m.mat({ ramp: R(DARK), k: 3 }), cand = m.mat({ ramp: R('#ffe0a0', 4, 2), k: 3, emi: [255, 200, 120, 200], flag: F_NOCAST });
  const across = w >= d, n = Math.max(1, Math.floor(((across ? w : d) + 8) / 44)), cw = 28;   // (side by side along the longer side, each its head to the back)
  for (let i = 0; i < n; i++) {
    const a = 4 + i * 44;
    if (across) { m.box(a, 4, 0, a + cw, d - 4, 7, frame); m.box(a + 1, 5, 7, a + cw - 1, d - 5, 11, cush); m.box(a + 1, 4, 11, a + cw - 1, 10, 20, cush); m.cyl('x', a + cw / 2, d - 10, 13, 3, a + 4, a + cw - 4, tw); }
    else { m.box(4, a, 0, w - 4, a + cw, 7, frame); m.box(5, a + 1, 7, w - 5, a + cw - 1, 11, cush); m.box(4, a + 1, 11, 10, a + cw - 1, 20, cush); m.cyl('y', w - 10, a + cw / 2, 13, 3, a + 4, a + cw - 4, tw); }
    if (i < n - 1) { const t = a + cw + 3; if (across) { m.box(t, d / 2 - 4, 0, t + 8, d / 2 + 4, 12, tbl); m.box(t + 3, d / 2 - 1, 12, t + 5, d / 2 + 1, 16, cand); } else { m.box(w / 2 - 4, t, 0, w / 2 + 4, t + 8, 12, tbl); m.box(w / 2 - 1, t + 3, 12, w / 2 + 1, t + 5, 16, cand); } }
  }
  return m;
}
// a red maple (the onsen's) in its stone ring, or a palm (the spa's) in a tall pot
export function maple(w = 32, d = 32, tier = 2, seed = 0) {
  const m = new Vox(w, d, 70);
  const bark = m.mat({ ramp: R('#5a3a28'), k: 3 }), ring = m.mat({ ramp: R('#7a7470'), k: 3 }), lv = ['#c8382a', '#e0602a', '#a82a2a'].map((c) => m.mat({ ramp: R(c), k: 3 }));
  m.cyl('z', w / 2, d / 2, 0, w / 2 - 2, 0, 5, ring); m.box(w / 2 - 2, d / 2 - 2, 0, w / 2 + 2, d / 2 + 2, 44, bark);
  for (let i = 0; i < 9; i++) m.ell(w / 2 + (hash(i, 1, seed + 7) - 0.5) * (w - 4), d / 2 + (hash(i, 2, seed + 7) - 0.5) * (d - 6), 46 + hash(i, 3, 7) * 18, 8, 7, 6, lv[i % 3]);
  return m;
}
export function palmPot(w = 32, d = 32) {
  const m = new Vox(w, d, 64);
  const pot = m.mat({ ramp: R('#e8e0d4'), k: 3 }), trunk = m.mat({ ramp: R('#8a6a48'), k: 3, shade: (x, y, z) => (Math.round(z) % 4 === 0 ? -0.8 : 0) }), lf = m.mat({ ramp: R('#3a8a3a'), k: 3 });
  m.cyl('z', w / 2, d / 2, 0, 9, 0, 14, pot); m.box(w / 2 - 2, d / 2 - 2, 14, w / 2 + 2, d / 2 + 2, 50, trunk);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; for (let r = 0; r < 14; r++) m.box(w / 2 + Math.cos(a) * r - 1, d / 2 + Math.sin(a) * r - 1, 50 + 6 - r * 0.45, w / 2 + Math.cos(a) * r + 2, d / 2 + Math.sin(a) * r + 2, 50 + 8 - r * 0.45, lf); }
  return m;
}
// each house: the pieces it draws its own way, its walls, its floors (homeart2.js: BATH_STYLE[L.bath]) - tile: the wet
// floors' two tiles (a check, or the one tile with its joints), wall: the walls' face
export const BATH_STYLE = {
  sento: { makers: {}, wall: '#b08454', tile: null },
  onsen: { makers: { u: hinokiBath, '@': rockPool, P: maple }, wall: '#5a3a26', tile: ['#6a6660', '#5e5a56'], lamps: '@' },
  kr: { makers: { u: tiledTub, '!': sauna, _: ondol }, wall: '#d8ccb0', tile: ['#e8dcc4', '#d8ccb2'] },
  spa: { makers: { u: spaPool, y: steamRoom, '!': (w, d, t, s) => sauna(w, d, t, s, { stoveLeft: true, wood: '#a0683e' }), _: loungers, P: palmPot }, wall: '#8a8070', tile: ['#e2d6c0', '#d6cab2'] },
  sea: { makers: { u: (w, d, t, s) => tiledTub(w, d, t, s, { mural: true, tile: '#e8eef2', water: '#4ab0d8' }) }, wall: '#4a6a9a', tile: ['#f0f2f2', '#5a8ac8'] },
};
for (const k in BATH_STYLE) BATH_STYLE[k].makers = { '$': coldPlunge, '@': rockPool, '!': sauna, _: ondol, ...BATH_STYLE[k].makers };
// the onsen's open-air floor: flagstones laid irregular, moss and grass in the joints, the odd fallen maple leaf
const FLAG = R('#8a8478', 6, 3), MOSS = R('#5a7a3a', 5, 2);
export function bathFloor(style, kind, wx, wy, x, y) {
  const S = BATH_STYLE[style];
  if (kind === ':') {
    const cx = Math.floor((wx + (Math.floor(wy / 20) & 1) * 11) / 22), cy = Math.floor(wy / 20), u = ((wx + (cy & 1) * 11) % 22 + 22) % 22, v = ((wy % 20) + 20) % 20;
    if (u < 2 || v < 2) return hash(wx >> 1, wy >> 1, 6) > 0.97 ? [200, 70, 40] : step(MOSS, 0.4 + hash(wx, wy, 5) * 0.4, x, y, 0.4);
    return step(FLAG, 0.5 + (hash(cx, cy, 3) - 0.5) * 0.35 + (u < 4 || v < 4 ? 0.12 : 0) + (hash(wx >> 2, wy >> 2, 7) - 0.5) * 0.1, x, y, 0.4);
  }
  if (kind !== 't' || !S || !S.tile) return null;
  const s = 16, gx = wx % s, gy = wy % s, chk = style === 'sea' && hash(Math.floor(wx / s), Math.floor(wy / s), 11) < 0.22 + 0.2 * Math.sin(wx * 0.004 + wy * 0.006);   // (the seaside house's blue tiles scattered through the white, L4)
  if (gx < 1 || gy < 1) return step(R('#8a8a84', 5, 2), 0.45, x, y, 0.2);
  return step(R(S.tile[chk ? 1 : 0], 5, 2), 0.55 + (hash(Math.floor(wx / s), Math.floor(wy / s), 3) - 0.5) * 0.16 + (gx < 3 && gy < 3 ? 0.15 : 0), x, y, 0.4);
}
