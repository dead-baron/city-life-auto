// Art v2 furniture for a bathhouse's floor (the owner, 10-16: "Bathhouses and locker rooms with usable showers";
// shared/homelayout.js 'bath', server/systems/bathhouse.js): voxel models as props-home.js's, one per piece of the plan -
// the front desk, the towels on their shelf, the lockers, the benches, the wash stations (a shower on the tiled wall, the
// low stool and the bucket), the big tiled bath in its timber rim, the hot stones in their box. Only client/render/
// homeart2.js loads this, with the rest of the bathhouse's drawing: it's in neither the page's code nor the renderer's
// nor the chunk bake's. Each maker takes the footprint (w along x, d along y, world px) and returns a Vox facing +y.
import { Vox } from './voxel.js';
import { MAT, ramp } from './palette.js';
import { F_GLASS, F_NOCAST, hash } from './gbuf.js';

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
