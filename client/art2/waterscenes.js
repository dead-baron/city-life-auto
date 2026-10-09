// Art v2 water scenes: the procedural water system (rivergen.js + water.js) built to the W1 river-country
// and W2 water-kit targets, and a debug view of a whole generated river map.
//
//   riverCountry  W1: a reach of a generated river fitted through farmland - gravel bars, the two-arch
//                 stone road bridge where the road crosses it (found by the generator's crossing test),
//                 a two-tier basalt fall into a foaming pool whose outflow runs as rapids into the river
//                 and as a creek under the road through a culvert; a canoe, an angler, willows, reeds,
//                 the farm, cows and corn
//   waterKit      W2: the kit pieces on grey - straight river, bend with a gravel bar, fork, river mouth
//                 meeting the sea, stepping-stone creek, meadow creek, rapids, ledge fall, cliff fall with
//                 mist, weir, culvert, muddy reedy bank, rocky bank, wooden footbridge, concrete road bridge
//   riverMap      a whole 4096 x 2730 generated map at 1/4 scale: height shading, sea, lakes, rivers and
//                 creeks at their widths, rapids, falls, bars, springs and mouths, test roads with their
//                 bridge / culvert / ford crossings
//
// SCENES[name](preset) -> { G, lights };  TARGETS[name] -> the target image file
import { Scene, Streets } from './scene.js';
import { paintRect, laneLine, lilyPads, groundPixel } from './ground.js';
import * as D from './props-district.js';
import * as K from './props-park.js';
import * as U from './props-rural.js';
import * as PK from './props-kit.js';
import { vehicleModel } from './vehicles.js';
import { animalModel } from './animals.js';
import { person } from './people.js';
import { randomPerson } from './peoplepresets.js';
import { leafyTree, bush, pine, willow, fern, birch } from './trees.js';
import { MAT, ramp } from './palette.js';
import { GBuf, F_GROUND, F_WATER, F_NOCAST, F_WET, hash, step, vnoise, norm } from './gbuf.js';
import { generateRivers, riverFromPath, pickReach, fitReach, smoothPath, heightAt } from './rivergen.js';
import * as WA from './water.js';
import { fenceRun } from './districts.js';

const PI = Math.PI, UP = [0, 0, 1];
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const ROCKS = new Map(), boulder = (seed, size) => { const sz = Math.round(Math.max(6, Math.min(30, size)) / 2) * 2, k = (seed % 9) + ':' + sz; if (!ROCKS.has(k)) ROCKS.set(k, D.boulder(seed % 9, sz, ['#7a7068', '#86807a', '#6e6862'][seed % 3]).render(0)); return ROCKS.get(k); };
const REEDS = new Map(), reed = (seed, n) => { const k = (seed % 12) + ':' + (n ?? 14 + (seed % 3) * 4); if (!REEDS.has(k)) REEDS.set(k, K.reeds(seed % 12, n ?? 14 + (seed % 3) * 4).render(0)); return REEDS.get(k); };
const pet = (sc, kind, x, y, hd = 0, o = {}) => sc.vox(animalModel(kind, o), x, y, hd);

// ---- riverMap: the generator at a glance ----------------------------------------------------------------
const HYPSO = [[0, '#6f9a44'], [30, '#86a64a'], [70, '#a2a656'], [110, '#a8905e'], [150, '#958676'], [200, '#c0bab0'], [260, '#e8e6e0']].map(([e, c]) => [e, [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]]);
function hypso(e) { for (let i = 1; i < HYPSO.length; i++) if (e <= HYPSO[i][0]) { const [e0, a] = HYPSO[i - 1], [e1, b] = HYPSO[i], t = (e - e0) / (e1 - e0); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; } return HYPSO[HYPSO.length - 1][1]; }
export function buildRiverMap(preset = 'golden', seed = 3) {
  const MW = 4096, MH = 2730, k = 4, sc = new Scene(MW / k, MH / k, preset, seed), G = sc.G;
  const R = generateRivers(seed, MW, MH, { sea: 'south' }), H = R.height, g = R.grid;
  const FH = { ...H, data: g.filled }, cellAt = (x, y) => Math.min(g.gh - 1, Math.round(y / g.cell)) * g.gw + Math.min(g.gw - 1, Math.round(x / g.cell));
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const X = x * k, Y = y * k, e = heightAt(H, X, Y), c0 = cellAt(X, Y);
    const ex = heightAt(H, X + k, Y) - heightAt(H, X - k, Y), ey = heightAt(H, X, Y + k) - heightAt(H, X, Y - k);
    if (g.sea[c0]) { const c = step(WA.WATER.sea, 0.55 + e * 0.012 + (vnoise(X, Y, 90, 3) - 0.5) * 0.15, x, y, 0.6); G.put(x, y, c, UP, 0, null, F_GROUND | F_WATER); continue; }
    const lakeD = heightAt(FH, X, Y) - e;
    if (lakeD > R.params.lakeDepth * 0.6 && (g.lake[c0] >= 0 || g.lake[cellAt(X + 16, Y)] >= 0 || g.lake[cellAt(X - 16, Y)] >= 0 || g.lake[cellAt(X, Y + 16)] >= 0 || g.lake[cellAt(X, Y - 16)] >= 0)) { const c = step(WA.WATER.river, 0.55 - Math.min(0.35, lakeD * 0.012), x, y, 0.6); G.put(x, y, c, UP, 0, null, F_GROUND | F_WATER); continue; }
    const h = hypso(e), n = (hash(x, y, 9) - 0.5) * 10;
    G.put(x, y, [h[0] + n, h[1] + n, h[2] + n], norm([-ex * 0.9, -ey * 0.9, 1]), 0, null, F_GROUND);
  }
  // rivers and creeks at their widths (at least a pixel), the biggest drawn last
  for (const rv of [...R.rivers].reverse()) {
    const P = rv.points, Rr = rv.kind === 'river' ? WA.WATER.river : WA.WATER.shallow;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), r = Math.max(0.5, a.w / k / 2);
      for (let s = 0; s <= L; s += k * 0.5) {
        const cx = (a.x + (b.x - a.x) * s / L) / k, cy = (a.y + (b.y - a.y) * s / L) / k;
        for (let yy = Math.floor(cy - r); yy <= cy + r; yy++) for (let xx = Math.floor(cx - r); xx <= cx + r; xx++) {
          if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 > r * r + 0.25 || !G.inside(xx, yy)) continue;
          G.put(xx, yy, step(Rr, rv.kind === 'river' ? 0.35 : 0.55, xx, yy, 0.3), UP, 0, null, F_GROUND | F_WATER);
        }
      }
    }
  }
  // test roads and their crossings
  const roads = [
    { points: [[0, 1180], [900, 1240], [1800, 1120], [2700, 1300], [3600, 1200], [4096, 1260]], width: 100, kind: 'paved' },
    { points: [[0, 620], [1400, 560], [2600, 700], [4096, 600]], width: 80, kind: 'paved' },
    { points: [[2300, 0], [2200, 900], [2500, 1700], [2400, 2300]], width: 60, kind: 'dirt' },
    { points: [[900, 300], [1000, 1500], [800, 2200]], width: 60, kind: 'dirt' },
  ];
  for (const rd of roads) for (let i = 0; i < rd.points.length - 1; i++) {
    const [ax, ay] = rd.points[i], [bx, by] = rd.points[i + 1], L = Math.hypot(bx - ax, by - ay);
    for (let s = 0; s <= L; s += 2) { const x = Math.round((ax + (bx - ax) * s / L) / k), y = Math.round((ay + (by - ay) * s / L) / k); for (let w = -1; w <= (rd.kind === 'dirt' ? 0 : 1); w++) if (G.inside(x, y + w) && !(G.flag[(y + w) * G.w + x] & F_WATER)) G.put(x, y + w, rd.kind === 'dirt' ? [176, 140, 96] : [92, 94, 104], UP, 0, null, F_GROUND); }
  }
  const mark = (x, y, pts, col, z = 2) => { for (const [dx, dy] of pts) if (G.inside(x + dx, y + dy)) G.put(x + dx, y + dy, col, [0, 0.4, 0.9], z, null, F_NOCAST); };
  const disc = (r) => { const o = []; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) o.push([x, y]); return o; };
  const ring = (r) => { const o = []; for (let y = -r - 1; y <= r + 1; y++) for (let x = -r - 1; x <= r + 1; x++) { const d = Math.hypot(x, y); if (d > r - 0.5 && d < r + 0.7) o.push([x, y]); } return o; };
  for (const c of R.crossings(roads)) {
    const x = Math.round(c.x / k), y = Math.round(c.y / k);
    if (c.kind === 'bridge') { const ca = Math.cos(c.angle), sa = Math.sin(c.angle), L = Math.ceil(c.span / k / 2) + 2, pts = []; for (let s = -L; s <= L; s++) for (let w = -2; w <= 2; w++) pts.push([Math.round(ca * s - sa * w), Math.round(sa * s + ca * w)]); mark(x, y, pts.filter((p, i) => true), [70, 50, 40]); mark(x, y, pts.filter(([dx, dy]) => Math.abs(-sa * dx + ca * dy) < 1.2), [200, 186, 160], 3); }
    else if (c.kind === 'culvert') { mark(x, y, ring(2), [40, 40, 44]); mark(x, y, disc(1), [200, 200, 196], 3); }
    else { mark(x, y, ring(3).filter((p, i) => i % 2 === 0), [236, 220, 170]); }
  }
  for (const f of R.features) {
    const x = Math.round(f.x / k), y = Math.round(f.y / k);
    if (f.type === 'fall') { mark(x, y, disc(f.tiers > 1 ? 3 : 2), [30, 34, 60]); mark(x, y, disc(f.tiers > 1 ? 2 : 1), [250, 250, 250], 3); }
    else if (f.type === 'rapids') { const rv = R.rivers[f.river]; for (let i = f.i0; i <= f.i1; i += 2) { const p = rv.points[i]; mark(Math.round(p.x / k), Math.round(p.y / k), [[0, 0]], [236, 248, 248], 3); } }
    else if (f.type === 'bar') mark(x, y, disc(1), [226, 204, 150], 2);
    else if (f.type === 'spring') mark(x, y, [[0, 0], [1, 0], [0, 1], [1, 1]], [120, 220, 240], 2);
    else if (f.type === 'mouth') mark(x, y, ring(3), [250, 236, 190], 2);
    else if (f.type === 'lake') mark(x, y, ring(2), [236, 248, 248], 2);
  }
  sc.riverData = R;
  return sc.finish();
}

// ---- shared scene helpers -----------------------------------------------------------------------------
function fill(G, x0, y0, x1, y1, kind, seed = 1) { paintRect(G, Math.round(x0), Math.round(y0), Math.round(x1 - x0), Math.round(y1 - y0), kind, seed); }
// flowers and grass tufts scattered on grass
function tufts(G, test, density = 0.01, seed = 5) {
  const fl = [[240, 236, 226], [236, 196, 64], [200, 150, 220], [236, 120, 150]];
  for (let y = 2; y < G.h - 2; y++) for (let x = 2; x < G.w - 2; x++) {
    if (hash(x, y, seed) > density || !test(x, y)) continue;
    const r = hash(x, y, seed + 1);
    if (r < 0.35) { const c = fl[Math.floor(hash(y, x, seed) * 4)]; G.put(x, y, c, UP, 1, null, F_GROUND); if (hash(x, y, 3) > 0.5) G.put(x + 1, y, c.map((v) => v * 0.8), UP, 1, null, F_GROUND); }
    else for (let k = 0; k < 3; k++) { const bx = x + k - 1, h = 2 + Math.floor(hash(bx, y, seed + 4) * 3); for (let j = 0; j < h; j++) G.put(bx, y - j, MAT.leaf[Math.min(6, 2 + j + (k & 1))], UP, 0, null, F_GROUND); }
  }
}
const isWaterAt = (G, x, y) => G.inside(x | 0, y | 0) && (G.flag[(y | 0) * G.w + (x | 0)] & F_WATER) !== 0;

// ---- waterKit: the W2 sheet ------------------------------------------------------------------------------
export function buildWaterKit(preset = 'golden', phase = 0) {
  const S = 1024 / 1254, sc = new Scene(1024, 1024, preset, 21), G = sc.G;
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) { const v = 100 + (hash(x, y, 1) - 0.5) * 6; G.put(x, y, [v - 22, v - 10, v + 14], UP, 0, null, F_GROUND); }
  const panel = (x0, y0, x1, y1) => ({ x0: Math.round(x0 * S), y0: Math.round(y0 * S), x1: Math.round(x1 * S), y1: Math.round(y1 * S), get w() { return this.x1 - this.x0; }, get h() { return this.y1 - this.y0; } });
  const ground = (p, kind = 'grass', seed = 3) => fill(G, p.x0, p.y0, p.x1, p.y1, kind, seed);
  const clipOf = (p) => [p.x0, p.y0, p.x1, p.y1];
  const shrubs = (p, test, n, seed, big = 14) => { for (let i = 0; i < n; i++) { const x = p.x0 + 4 + hash(i, 1, seed) * (p.w - 8), y = p.y0 + 10 + hash(i, 2, seed) * (p.h - 12); if (!test(x, y)) continue; const r = hash(i, 3, seed); sc.addWorld(r < 0.55 ? bush(seed * 31 + i, 8 + r * big, { flowers: r < 0.15 ? '#e8c040' : null }) : r < 0.8 ? fern(seed + i, 12 + r * 6) : reed(seed + i, 10), x, y); } };
  const notWater = (x, y) => !isWaterAt(G, x, y) && !isWaterAt(G, x, y + 6) && !isWaterAt(G, x - 6, y) && !isWaterAt(G, x + 6, y);
  const rocksAlong = (info, side, k, every, seed, size = 14, p = null) => { for (const b of info.bank(side, k, every)) if (!p || (b.y > p.y0 + 6 && b.y < p.y1 - 2 && b.x > p.x0 && b.x < p.x1)) sc.addWorld(boulder(seed + Math.round(b.x), size * (0.6 + hash(Math.round(b.x), Math.round(b.y), seed) * 0.8)), b.x, b.y); };

  // A straight river with rocky banks
  { const p = panel(35, 35, 262, 335); ground(p, 'grass', 31);
    const cx = (p.x0 + p.x1) / 2, rv = [[cx + 4, p.y0 - 10, 112], [cx - 2, p.y0 + p.h * 0.35, 114], [cx + 3, p.y0 + p.h * 0.7, 112], [cx, p.y1 + 10, 114]];
    const info = WA.paintRiver(G, rv, { phase, seed: 31, clip: clipOf(p), banks: 'rocky', bankW: 8, bars: false });
    rocksAlong(info, 1, 0.1, 22, 31, 14, p); rocksAlong(info, -1, 0.1, 22, 32, 14, p);
    shrubs(p, notWater, 30, 31); }
  // B a bend round a gravel bar
  { const p = panel(295, 35, 555, 335); ground(p, 'grass', 32);
    const cx = p.x0 + 40, cy = p.y0 + p.h * 0.5, pts = [];
    for (let a = -1.75; a <= 1.75; a += 0.1) pts.push([cx + Math.cos(a) * 128, cy + Math.sin(a) * 102, 74]);
    for (let y = p.y0; y < p.y1; y++) for (let x = p.x0; x < p.x1; x++) {
      const r = Math.hypot((x - cx) / 128, (y - cy) / 102) * 115, d = 115 - 37 - r;
      if (d < 0 || x < cx - 10) continue;
      const k = d + (vnoise(x, y, 9, 3) - 0.5) * 14;
      if (k < 48) { const pg = groundPixel(k < 30 && hash(x, y, 4) > 0.55 - k * 0.01 ? 'gravel' : 'sand', x, y, 32); G.put(x, y, k < 6 ? pg.c.map((v) => v * 0.82) : pg.c, UP, 0, null, F_GROUND | F_WET); }
    }
    WA.paintRiver(G, pts, { phase, seed: 32, clip: clipOf(p), banks: (i, side) => (side < 0 ? 'gravel' : 'grassy'), barK: 3 });
    for (let i = 0; i < 4; i++) sc.addWorld(boulder(40 + i, 8 + i * 1.5), p.x0 + 50 + hash(i, 1, 9) * 30, cy - 40 + hash(i, 2, 9) * 80);
    shrubs(p, (x, y) => notWater(x, y) && (x - cx) ** 2 / 128 ** 2 + (y - cy) ** 2 / 102 ** 2 > 1.3, 34, 32);
    shrubs(p, (x, y) => notWater(x, y) && x < p.x0 + 50, 6, 33, 10); }
  // C a fork round a grassy island
  { const p = panel(588, 35, 865, 335); ground(p, 'grass', 33);
    const cx = (p.x0 + p.x1) / 2, jy = p.y0 + p.h * 0.62;
    const trunk = [[cx, jy - 4, 96], [cx + 4, jy + 50, 98], [cx - 2, p.y1 + 10, 100]];
    const left = [[p.x0 + 20, p.y0 - 10, 66], [p.x0 + 34, p.y0 + 80, 68], [cx - 20, jy - 20, 74], [cx, jy - 4, 80]];
    const right = [[p.x1 - 18, p.y0 - 10, 64], [p.x1 - 34, p.y0 + 90, 66], [cx + 22, jy - 24, 72], [cx, jy - 4, 80]];
    WA.paintRiver(G, trunk, { phase, seed: 33, clip: clipOf(p), banks: 'rocky', roundStart: true, bars: false });
    const li = WA.paintRiver(G, left, { phase, seed: 34, clip: clipOf(p), banks: 'rocky', roundEnd: true, bars: false });
    const ri = WA.paintRiver(G, right, { phase, seed: 35, clip: clipOf(p), banks: 'rocky', roundEnd: true, bars: false });
    rocksAlong(li, -1, 0.1, 18, 41, 13, p); rocksAlong(ri, 1, 0.1, 18, 42, 13, p); rocksAlong(li, 1, 0.2, 26, 43, 11, p); rocksAlong(ri, -1, 0.2, 26, 44, 11, p);
    shrubs(p, notWater, 40, 34); }
  // D a river mouth meeting the sea over a sandbar
  { const p = panel(900, 35, 1218, 335); ground(p, 'sand', 34);
    const coastX = (y) => p.x0 + p.w * 0.52 + (y - p.y0) * -0.2 + Math.sin(y * 0.045) * 8;
    const spit = (x, y) => ((x - (coastX(p.y0 + p.h * 0.3) + 24)) / 16) ** 2 + ((y - (p.y0 + p.h * 0.3)) / 70) ** 2 < 1;
    for (let y = p.y0; y < p.y1; y++) for (let x = p.x0; x < p.x1; x++) if ((x - p.x0) < 70 + vnoise(x, y, 12, 5) * 40 && ((y - p.y0) < 70 || (y - p.y0) > p.h - 60)) { const g = groundPixel('grass', x, y, 35); G.put(x, y, g.c, UP, 0, null, F_GROUND | F_WET); }
    WA.paintSea(G, (x, y) => x >= p.x0 && x < p.x1 && y >= p.y0 && y < p.y1 && x > coastX(y) && !spit(x, y), { phase, seed: 34, bbox: clipOf(p), shelf: 28 });
    const my = p.y0 + p.h * 0.52, rv = [[p.x0 - 10, my - 10, 56], [p.x0 + 70, my, 62], [p.x0 + 130, my + 8, 76], [coastX(my) + 10, my + 10, 110], [coastX(my) + 70, my + 20, 150]];
    WA.paintRiver(G, rv, { phase, seed: 36, clip: clipOf(p), banks: 'sand', bars: false, pal: WA.WATER.seaShallow, current: 0.6 });
    shrubs(p, (x, y) => (x - p.x0) < 70 && ((y - p.y0) < 60 || (y - p.y0) > p.h - 50) && notWater(x, y), 18, 35, 10); }
  // E a creek with stepping stones
  { const p = panel(35, 368, 205, 650); ground(p, 'grass', 36);
    const cx = (p.x0 + p.x1) / 2, rv = [[cx + 6, p.y0 - 10, 46], [cx - 6, p.y0 + p.h * 0.4, 48], [cx + 4, p.y0 + p.h * 0.75, 46], [cx, p.y1 + 10, 48]];
    const info = WA.paintRiver(G, rv, { phase, seed: 37, clip: clipOf(p), banks: 'grassy', bankW: 5, bars: false });
    for (let s = 20, i = 0; s < info.P[info.P.length - 1].s; s += 26, i++) { const c = info.at(s), off = (hash(i, 1, 37) - 0.5) * 14; WA.foamRing(G, c.x + off, c.y, 7, PI / 2, phase, 37 + i, 0.4); sc.addWorld(sc.render(WA.steppingStone(i + 3, 8 + (i % 3)), 0, 'ss' + (i % 6)), c.x + off, c.y + 6); }
    shrubs(p, notWater, 26, 37); tufts(G, (x, y) => x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1 && !isWaterAt(G, x, y) && G.flag[y * G.w + x] & F_GROUND, 0.012, 37); }
  // F a meadow creek bend
  { const p = panel(232, 368, 480, 650); ground(p, 'grass', 38);
    const rv = [[p.x1 + 10, p.y0 + 60, 50], [p.x0 + p.w * 0.72, p.y0 + p.h * 0.36, 54], [p.x0 + p.w * 0.45, p.y0 + p.h * 0.62, 56], [p.x0 + p.w * 0.12, p.y0 + p.h * 0.7, 56], [p.x0 - 10, p.y1 - 30, 56]];
    WA.paintRiver(G, rv, { phase, seed: 38, clip: clipOf(p), banks: 'grassy', bankW: 4, barK: 0.6 });
    sc.addWorld(leafyTree(381, 96, 34), p.x0 + 50, p.y0 + 78);
    for (let i = 0; i < 5; i++) sc.addWorld(sc.render(PK.meadow(40, 18, 380 + i), 0, 'mdw' + i), p.x0 + 30 + hash(i, 1, 38) * (p.w - 60), p.y0 + 110 + hash(i, 2, 38) * 50);
    shrubs(p, notWater, 22, 38); tufts(G, (x, y) => x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1 && !isWaterAt(G, x, y), 0.02, 38); }
  // G rapids over boulders
  { const p = panel(510, 368, 730, 650); ground(p, 'grass', 39);
    const cx = (p.x0 + p.x1) / 2, rv = [[cx - 8, p.y0 - 10, 128], [cx + 6, p.y0 + p.h * 0.4, 124], [cx - 6, p.y0 + p.h * 0.8, 128], [cx, p.y1 + 10, 130]];
    const info = WA.paintRiver(G, rv, { phase, seed: 39, clip: clipOf(p), banks: 'rocky', bankW: 6, bars: false, rapids: [[0, 999, 0.7]] });
    WA.dressRiver(sc, info, { boulder, rapids: [[24, info.P[info.P.length - 1].s - 24, 1]], rocks: 3, phase, seed: 39, s0: 20, s1: info.P[info.P.length - 1].s - 20 });
    shrubs(p, notWater, 14, 39); }
  // H a small fall over a ledge
  { const p = panel(760, 368, 985, 650); ground(p, 'grass', 40);
    const cx = (p.x0 + p.x1) / 2, face = p.y0 + p.h * 0.66;
    const m = WA.fallModel({ kind: 'ledge', width: 92, drop: 34, rock: 46, seed: 40, frame: Math.round(phase * 4) });
    const top = face - m.face - m.lip;
    WA.paintRiver(G, [[cx, p.y0 - 10, 98], [cx + 2, top + 8, 96]], { phase, seed: 40, clip: clipOf(p), banks: 'rocky', bars: false });
    WA.paintPond(G, (x, y) => x >= p.x0 && x < p.x1 && y >= face - 4 && y < p.y1, { phase, seed: 40, bbox: clipOf(p), depthR: 30, bank: 'rocky' });
    WA.foamPatch(G, cx, face + 18, 56, 18, phase, 40);
    sc.addWorld(WA.waterfall({ seed: 40 }, m), cx, face);
    for (let i = 0; i < 5; i++) sc.addWorld(boulder(70 + i, 12 + i * 2), p.x0 + 10 + i * (p.w - 20) / 4 + (hash(i, 1, 40) - 0.5) * 16, p.y1 - 10 - hash(i, 2, 40) * 20);
    shrubs(p, (x, y) => y < top + 20 && notWater(x, y), 10, 40); }
  // I a tall cliff fall with its plunge pool and mist
  { const p = panel(1010, 368, 1225, 650); ground(p, 'grass', 41);
    const cx = (p.x0 + p.x1) / 2, face = p.y0 + p.h * 0.78;
    const m = WA.fallModel({ kind: 'cliff', width: 30, drop: 132, rock: 76, seed: 41, frame: Math.round(phase * 4) });
    WA.paintPond(G, (x, y) => x >= p.x0 && x < p.x1 && y >= face - 6 && y < p.y1, { phase, seed: 41, bbox: clipOf(p), depthR: 24, bank: 'rocky' });
    WA.foamPatch(G, cx, face + 14, 40, 14, phase, 41, 1.3);
    WA.paintRiver(G, [[cx, p.y0 - 10, 34], [cx, face - m.face - m.lip + 6, 32]], { phase, seed: 41, clip: clipOf(p), banks: 'rocky', bars: false });
    sc.addWorld(WA.waterfall({ seed: 41, mist: 1 }, m), cx, face);
    for (const [x, s] of [[p.x0 + 12, 1], [p.x1 - 14, 2]]) sc.addWorld(bush(410 + s, 12, { flowers: '#e8c040' }), x, face + 20);
    shrubs(p, (x, y) => y < p.y0 + 40 && notWater(x, y), 8, 41, 10); }
  // J a concrete weir
  { const p = panel(35, 680, 345, 900); ground(p, 'grass', 42);
    const cx = (p.x0 + p.x1) / 2, face = p.y0 + p.h * 0.6, ww = p.w - 70;
    const m = WA.fallModel({ kind: 'weir', width: ww, drop: 14, rock: 14, seed: 42, frame: Math.round(phase * 4) });
    WA.paintPond(G, (x, y) => x >= p.x0 + 28 && x < p.x1 - 28 && y >= p.y0 && y < face - m.face - 10, { phase, seed: 42, bbox: clipOf(p), depthR: 20, bank: 'rocky', bankW: 8 });
    WA.paintRiver(G, [[cx, face - 6, ww + 6], [cx, p.y1 + 10, ww + 10]], { phase, seed: 43, clip: clipOf(p), banks: 'rocky', bars: false, rapids: [[0, 10, 0.7]] });
    WA.foamPatch(G, cx, face + 8, ww / 2, 10, phase, 42, 0.9);
    sc.addWorld(WA.waterfall({ seed: 42 }, m), cx, face);
    for (let i = 0; i < 6; i++) sc.addWorld(boulder(80 + i, 10 + (i % 3) * 4), i < 3 ? p.x0 + 12 + i * 6 : p.x1 - 12 - (i - 3) * 6, face + 10 + (i % 3) * 22);
    shrubs(p, (x, y) => notWater(x, y) && (x < p.x0 + 30 || x > p.x1 - 30 || y < p.y0 + 10), 16, 42, 10); }
  // K a culvert under a road
  { const p = panel(378, 680, 625, 900); ground(p, 'grass', 43);
    const cx = (p.x0 + p.x1) / 2, roadY = p.y0 + 34;
    fill(G, p.x0, roadY - 30, p.x1, roadY + 30, 'asphalt', 43);
    const m = WA.culvert(p.w - 40, 60, 24, 17, { seed: 43 });
    WA.paintRiver(G, [[cx, roadY + 30, 54], [cx + 6, p.y0 + p.h * 0.65, 60], [cx - 4, p.y1 + 10, 64]], { phase, seed: 44, clip: [p.x0, roadY + 30, p.x1, p.y1], banks: 'rocky', bars: false, rapids: [[0, 10, 0.6]] });
    WA.deckAt(sc, m, cx, roadY);
    laneLine(G, p.x0, roadY - 2, p.w, true, { yellow: true, width: 2 }); laneLine(G, p.x0, roadY + 2, p.w, true, { yellow: true, width: 2 });
    for (let i = 0; i < 6; i++) sc.addWorld(boulder(90 + i, 12 + (i % 3) * 5), cx + (i < 3 ? -48 - i * 14 : 48 + (i - 3) * 14), roadY + 92 + (i % 3) * 22);
    shrubs(p, (x, y) => notWater(x, y) && y > roadY + 60 && Math.abs(x - cx) > 60, 14, 43, 10); }
  // L a muddy, reedy bank
  { const p = panel(658, 680, 912, 900); ground(p, 'grass', 44);
    const shore = (x) => p.y0 + p.h * 0.62 - (x - p.x0) * 0.18 + Math.sin(x * 0.07) * 6;
    WA.paintPond(G, (x, y) => x >= p.x0 && x < p.x1 && y < p.y1 && y > shore(x), { phase, seed: 44, bbox: clipOf(p), depthR: 60, bank: 'mud', bankW: 30, current: 0.05 });
    fill(G, p.x0 + p.w * 0.35, p.y0, p.x1, p.y0 + 20, 'grass', 45);
    lilyPads(G, (x, y) => isWaterAt(G, x, y) && x > p.x0 && x < p.x1 && y < p.y1 - 2 && WA.waterDepth(G, x, y) > 0.15, 60, 44);
    for (let i = 0; i < 12; i++) { const x = p.x0 + 10 + hash(i, 1, 44) * (p.w - 20), y = shore(x) - 4 - hash(i, 2, 44) * 40; sc.addWorld(reed(440 + i, 18), x, y); }
    shrubs(p, (x, y) => notWater(x, y) && y < shore(x) - 40, 12, 44, 12); }
  // M a rocky bank
  { const p = panel(948, 680, 1222, 900); ground(p, 'grass', 45);
    const shore = (x) => p.y0 + p.h * 0.48 + Math.sin(x * 0.05) * 8;
    WA.paintPond(G, (x, y) => x >= p.x0 && x < p.x1 && y < p.y1 && y > shore(x), { phase, seed: 45, bbox: clipOf(p), depthR: 50, bank: 'rocky', bankW: 16, current: 0.1 });
    for (let i = 0; i < 16; i++) { const x = p.x0 + 6 + i * (p.w - 12) / 15 + (hash(i, 1, 45) - 0.5) * 8, y = shore(x) + (hash(i, 2, 45) - 0.4) * 22; if (isWaterAt(G, x, y)) WA.foamRing(G, x, y, 7, PI / 2, phase, 45 + i, 0.2); sc.addWorld(boulder(100 + i, 14 + hash(i, 3, 45) * 16), x, y); }
    shrubs(p, (x, y) => notWater(x, y) && y < shore(x) - 30, 20, 45); }
  // N a wooden footbridge over a creek
  { const p = panel(35, 925, 385, 1210); ground(p, 'grass', 46);
    const cx = (p.x0 + p.x1) / 2, by = p.y0 + p.h * 0.32;
    const info = WA.paintRiver(G, [[cx + 8, p.y0 - 10, 110], [cx - 6, p.y0 + p.h * 0.5, 112], [cx + 4, p.y1 + 10, 116]], { phase, seed: 46, clip: clipOf(p), banks: 'rocky', bars: false });
    fill(G, p.x0, by - 30, p.x0 + 40, by + 10, 'dirt', 46); fill(G, p.x1 - 40, by - 30, p.x1, by + 10, 'dirt', 46);
    rocksAlong(info, 1, 0.1, 24, 46, 16, p); rocksAlong(info, -1, 0.1, 24, 47, 16, p);
    const fb = WA.footbridge(p.w - 20, 30, 14);
    sc.addWorld(fb.render(0), cx, by + 14);
    shrubs(p, (x, y) => notWater(x, y) && Math.abs(y - by) > 30, 26, 46); }
  // O a concrete road bridge over a river
  { const p = panel(430, 925, 970, 1210); ground(p, 'grass', 47);
    const cx = (p.x0 + p.x1) / 2, roadY = p.y0 + p.h * 0.3;
    fill(G, p.x0, roadY - 56, p.x1, roadY + 56, 'asphalt', 47);
    const info = WA.paintRiver(G, [[cx - 6, roadY + 56, 210], [cx + 8, p.y0 + p.h * 0.72, 214], [cx, p.y1 + 10, 218]], { phase, seed: 47, clip: [p.x0, roadY + 56, p.x1, p.y1], banks: 'rocky', bars: false });
    const br = WA.roadBridge(330, 104, 26, 2);
    WA.deckAt(sc, br, cx, roadY);
    laneLine(G, p.x0, roadY - 2, p.w, true, { yellow: true, width: 2, dash: 26, gap: 18 });
    rocksAlong(info, 1, 0.15, 22, 48, 18, p); rocksAlong(info, -1, 0.15, 22, 49, 18, p);
    shrubs(p, (x, y) => notWater(x, y) && y > roadY + 70, 30, 47); }
  // P the scale figure
  sc.person(Math.round(1112 * S), Math.round(1100 * S), 'student', 0, 'idle', 7);
  return sc.finish();
}

// ---- riverCountry: W1 ----------------------------------------------------------------------------------
// split-rail fence from (x0, y0) to (x1, y1) along one axis
function railRun(sc, x0, y0, x1, y1) {
  const ns = x0 === x1, len = Math.abs(ns ? y1 - y0 : x1 - x0);
  for (let s = 0; s < len; s += 60) { const l = Math.min(60, len - s), c = Math.min(ns ? y0 : x0, ns ? y1 : x1) + s + l / 2; sc.addWorld(sc.render(PK.fenceKind('rail', l), ns ? PI / 2 : 0, 'rail' + l), ns ? x0 : c, ns ? c : y0); }
}
// The main river: reaches of rivers generated on a few seeds are fitted from the top edge to the bottom
// edge, softened, and scored - it should cross the road squarely, stay in the left two-thirds and wind.
function countryRiver(W0, H0, roadY) {
  let best = null, bs = -1e9;
  for (let seed = 11; seed < 19; seed++) {
    const R = generateRivers(seed, 2400, 1600, { cell: 16, sea: 'south' });
    for (const sin of [1.35, 1.6, 1.85]) {
      const reach = pickReach(R, 1000, { sinuosity: sin, minW: 24 });
      if (!reach) continue;
      for (const mirror of [false, true]) {
        const P = smoothPath(fitReach(reach.points, [370, -60], [600, H0 + 60], { width: 136, mirror }), 40);
        let xr = 0, ang = 0, mn = 1e9, mx = -1e9, curv = 0;
        for (let i = 0; i < P.length - 1; i++) {
          mn = Math.min(mn, P[i].x); mx = Math.max(mx, P[i].x); curv += Math.abs(P[i].curv) * (P[i + 1].s - P[i].s);
          if ((P[i].y - roadY) * (P[i + 1].y - roadY) <= 0) { xr = P[i].x; ang = Math.atan2(P[i + 1].y - P[i].y, P[i + 1].x - P[i].x); }
        }
        const sc = -Math.abs(Math.cos(ang)) * 3 - Math.max(0, 180 - mn) * 0.02 - Math.max(0, mx - 640) * 0.03 - Math.abs(xr - 480) * 0.004 + Math.min(curv, 4) * 0.9;
        if (sc > bs) { bs = sc; best = { P, seed, cross: { x: xr, w: 136, ang } }; }
      }
    }
  }
  return best;
}
export function buildRiverCountry(preset = 'golden', phase = 0) {
  const W0 = 1024, H0 = 680, sc = new Scene(W0, H0, preset, 31), G = sc.G;
  const roadY = 350, roadW = 100;
  const { P: main, cross } = countryRiver(W0, H0, roadY);
  const at = (y) => { for (let i = 0; i < main.length - 1; i++) if ((main[i].y - y) * (main[i + 1].y - y) <= 0) return main[i]; return main[0]; };
  // ground: grass, the farm yard and track, the pasture, the field, the road
  const S = new Streets(W0, H0, { lotKind: 'grass' });
  S.zone('dirt', { poly: [[0, 0], [200, 0], [190, 200], [0, 210]] });
  S.zone('dirtRoad', { path: [[176, -10], [172, 120], [140, 220], [150, 310]], width: 34 });
  S.zone('dirtRoad', { path: [[900, 395], [960, 470], [1040, 500]], width: 30 });
  
  S.zone('asphaltWorn', { x: -20, y: roadY - roadW / 2, w: W0 + 40, h: roadW });
  S.build(); S.paint(G, 31);
  tufts(G, (x, y) => { const k = S.kind(x, y); return k === 'grass' || k === 'lawn'; }, 0.006, 31);
  // the plateau, the falls and their pool
  const fx = 806, face = 178;
  const falls = WA.fallModel({ kind: 'twoTier', width: 80, drop: 112, rock: 54, seed: 31, frame: Math.round(phase * 4), streams: [[-38, -12], [10, 38]] });
  const lipY = face - falls.face - falls.lip;
  WA.paintRiver(G, [[fx + 40, -20, 70], [fx + 10, 10, 74], [fx, lipY + 10, 78]], { phase, seed: 32, banks: 'rocky', bars: false });
  const pool = (x, y) => ((x - fx) / 104) ** 2 + ((y - (face + 28)) / 44) ** 2 < 1 + (vnoise(x, y, 14, 3) - 0.5) * 0.4;
  WA.paintPond(G, pool, { phase, seed: 33, bbox: [660, face - 30, 940, face + 100], depthR: 30, bank: 'rocky', bankW: 8 });
  // the pool's outflows: rapids down to the river above the bridge, and a creek under the road
  const m0 = at(roadY - 84);
  const rap = riverFromPath([[fx - 80, face + 40, 30, 60], [fx - 140, face + 62, 32, 50], [(fx - 140 + m0.x) / 2 + 20, roadY - 96, 34, 30], [m0.x + m0.w * 0.3, roadY - 84, 36, 24]], { widthK: 9, cell: 24 });
  const creek = riverFromPath([[fx + 90, face + 40, 8, 40], [fx + 106, roadY - 40, 8, 30], [fx + 112, roadY + 60, 8, 22], [fx + 150, 520, 9, 16], [W0 + 30, 600, 9, 10]], { widthK: 11, cell: 24 });
  // the main river: gravel and mud by side; bars come from the bends. Then the branches.
  const mainInfo = WA.paintRiver(G, main, { phase, seed: 34, rapids: [], banks: (i, side, p) => (side < 0 && p.y > roadY + 40 ? 'gravel' : side > 0 ? 'mud' : 'grassy'), barK: 1.8 });
  const rapInfo = WA.paintRiver(G, rap, { phase, seed: 35, banks: 'rocky', bars: false, rapids: [[0, rap.points.length - 8, 1]], roundEnd: true });
  const crInfo = WA.paintRiver(G, creek, { phase, seed: 36, banks: 'rocky', bars: false, rapids: [[0, 24, 0.5]] });
  WA.foamPatch(G, fx - 20, face + 14, 30, 14, phase, 33, 1.4); WA.foamPatch(G, fx + 22, face + 14, 30, 14, phase, 34, 1.4);
  WA.foamPatch(G, fx, face + 30, 92, 38, phase, 35, 0.55);
  // the road over everything (the bridge and the culvert carry it across the water)
  for (let y = roadY - roadW / 2; y < roadY + roadW / 2; y++) for (let x = 0; x < W0; x++) { const p = groundPixel('asphaltWorn', x, y, 31); G.put(x, y, p.c, UP, 0, null, F_GROUND | F_WET); }
  laneLine(G, 0, roadY - 3, W0, true, { yellow: true, width: 2 }); laneLine(G, 0, roadY + 1, W0, true, { yellow: true, width: 2 });
  laneLine(G, 0, roadY - roadW / 2 + 4, W0, true, { width: 2, wear: 0.3 }); laneLine(G, 0, roadY + roadW / 2 - 6, W0, true, { width: 2, wear: 0.3 });
  // whitewater and boulders down the rapids, rocks round the pool
  WA.dressRiver(sc, rapInfo, { boulder, rapids: [[16, rapInfo.P[rapInfo.P.length - 1].s - 50, 0.5]], rocks: 0.6, phase, seed: 35 });
  WA.dressRiver(sc, crInfo, { boulder, rocks: 2, phase, seed: 36, s1: 100 });
  for (let i = 0; i < 11; i++) { const a = PI * 0.08 + i / 10 * PI * 0.84, x = fx + Math.cos(a) * 108, y = face + 28 + Math.sin(a) * 46; if (hash(i, 2, 9) > 0.4) sc.addWorld(boulder(200 + i, 10 + hash(i, 1, 9) * 16), x, y); }
  WA.dressRiver(sc, mainInfo, { boulder, rocks: 0.8, phase, seed: 37, rockSide: -1, s0: 600 });
  WA.dressRiver(sc, mainInfo, { reed, reeds: 2.2, phase, seed: 38, reedSide: 1 });
  // the cliff: basalt walls either side of the falls, the falls themselves
  sc.addWorld(sc.render(WA.cliffWall(170, 100, 60, 5), 0, 'cw1'), fx - 176, face - 8);
  sc.addWorld(sc.render(WA.cliffWall(150, 112, 64, 6), 0, 'cw2'), fx + 168, face - 4);
  sc.addWorld(WA.waterfall({ seed: 31, mist: 0.6 }, falls), fx, face);
  // the bridge, the culvert and the pickup on the bridge
  const bridge = WA.stoneBridge(Math.round(cross.w / Math.max(0.6, Math.abs(Math.sin(cross.ang))) + 150), roadW, 48, 2, { seed: 31 });
  const deck = WA.deckAt(sc, bridge, cross.x, roadY);
  WA.deckAt(sc, WA.culvert(110, roadW, 26, 13, { seed: 32 }), fx + 112, roadY);
  WA.onDeck(sc, vehicleModel('pickup', { paint: '#a8402e', cargo: [1], lights: 0 }).render(0), cross.x - 30, roadY + 24, deck);
  // the angler on the gravel at the inside of a bend, the canoe midstream away from his line
  let ang = null;
  for (let y = 110; y < roadY - 70 && !ang; y += 3) for (let x = 0; x < W0 && !ang; x += 3) if (mainInfo.region(x, y) === 2 && mainInfo.region(x - 14, y) === 2) ang = [x - 4, y];
  ang = ang || [at(220).x - 90, 220];
  const angler = { ...randomPerson(312, 'farmer'), held: 'fishingRod' }, rodDir = ang[0] < at(ang[1]).x ? 2 : 6;
  sc.addWorld(person(angler, rodDir, 'held', 0), ang[0], ang[1]); sc.addWorld(sc.render(PK.tackleBox(), 0, 'tb'), ang[0] + (rodDir === 2 ? -20 : 20), ang[1] + 8);
  WA.ripples(G, ang[0] + (rodDir === 2 ? 46 : -46), ang[1] - 6, 12, 3, phase);
  let cs = 60, cd = -1; for (let q = 60; q < 900; q += 10) { const c = mainInfo.at(q); if (c.y > roadY - 110) break; const d = Math.min(150, Math.hypot(c.x - ang[0], c.y - ang[1])) + Math.min(c.y, 90); if (c.y > 70 && d > cd) { cd = d; cs = q; } }
  const cpos = mainInfo.at(cs), chd = Math.atan2(cpos.ty, cpos.tx) + 0.3;
  WA.wake(G, cpos.x, cpos.y + 4, chd, 54, phase);
  sc.addWorld(WA.canoe(chd, '#b8342a', randomPerson(311, 'tourist')), cpos.x, cpos.y);
  // the farm: barn, bales, rail fences, the pole and the bend sign
  sc.building({ w: 150, d: 96, style: 'siding', wallColor: '#a8342e', pitch: 'gable', slope: 0.55, roof: 'shingle', roofColor: '#7a7a80', seed: 311, doors: [{ x: 56, w: 40, kind: 'garage', open: true, h: 48 }], windows: [] }, -50, 130);
  for (const [x, y] of [[124, 160], [104, 176], [130, 186]]) sc.vox(U.hayBale(true), x, y, 0.4);
  railRun(sc, 0, 200, 120, 200); railRun(sc, 204, 0, 204, 290); railRun(sc, 0, 290, 120, 290);
  railRun(sc, 0, 432, 270, 432); railRun(sc, 272, 432, 272, 680);
  sc.vox(D.powerPole(120, 14), 120, 296); sc.vox(U.roadSign('curve'), 192, 296);
  for (const [x, y, hd, ph] of [[80, 540, 0.2, 0], [60, 620, PI - 0.3, 0.6], [190, 580, 0.5, 0.7]]) pet(sc, 'cow', x, y, hd, { phase: ph, pose: ph > 0.5 ? 'graze' : 'stand' });
  // the corn and the right-hand track
  sc.vox(U.cornField(200, 150, 31), W0 - 96, H0 - 40);
  railRun(sc, 900, 520, 1024, 520);
  // trees: willows by the water, broadleaves in clumps round the fields, pines up on the plateau
  const treeOK = (x, y, r = 16) => { for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r * 0.6], [0, -r * 0.6]]) { const X = x + dx, Y = y + dy; if (isWaterAt(G, X, Y) || mainInfo.region(X, Y) || rapInfo.region(X, Y) || crInfo.region(X, Y) || Math.abs(Y - roadY) < roadW / 2 + 10) return false; } return true; };
  const wl = [[at(roadY + 140).x - 120, roadY + 140], [at(roadY - 160).x + 110, roadY - 150], [fx + 170, roadY + 110], [at(roadY + 270).x + 120, roadY + 280]];
  for (const [x, y] of wl) if (treeOK(x, y, 26)) sc.add(willow(320 + Math.round(x), 120, 50), x, y);
  const clumps = [[260, 80], [250, 250], [40, 380], [320, 520], [180, 470], [640, 470], [700, 600], [860, 420], [600, 140], [470, 60], [100, 650], [980, 300]];
  let n = 0;
  for (let i = 0; i < 400 && n < 46; i++) {
    const c = clumps[i % clumps.length], x = c[0] + (hash(i, 1, 33) - 0.5) * 120, y = c[1] + (hash(i, 2, 33) - 0.5) * 90;
    const plateau = y < face - 60 && x > fx - 290;
    if (!treeOK(x, y, 24) || (x < 200 && y < 215) || (x < 270 && y > 430 && x > 10 && y < 670) || (x > W0 - 210 && y > H0 - 175) || (x > fx - 140 && x < fx + 140 && y < face + 90)) continue;
    n++;
    const cr = 30 + hash(i, 4, 33) * 18;
    sc.add(plateau ? pine(330 + i, 100 + hash(i, 3, 33) * 50, 26) : hash(i, 5, 33) < 0.15 ? birch(330 + i, cr * 2.6, cr * 0.8) : leafyTree(330 + i, cr * 2.3, cr), x, y);
  }
  for (let i = 0; i < 46; i++) { const x = fx - 260 + hash(i, 8, 33) * 520, y = hash(i, 9, 33) * (face - 90); if (treeOK(x, y, 20) && !(x > fx - 120 && x < fx + 120)) sc.add(pine(500 + i, 90 + hash(i, 3, 34) * 50, 24), x, y); }
  for (let i = 0; i < 200; i++) { const x = hash(i, 5, 33) * W0, y = hash(i, 6, 33) * H0; if (!treeOK(x, y, 8) || (x < 270 && y > 430)) continue; const r = hash(i, 7, 33); sc.add(r < 0.6 ? bush(900 + i, 9 + r * 12, { flowers: r < 0.12 ? '#e8c040' : null }) : r < 0.8 ? fern(900 + i, 14) : reed(900 + i, 12), x, y); }
  // bushes and wildflowers along the banks
  for (const side of [1, -1]) for (const b of mainInfo.bank(side, 1.8, 26)) if (treeOK(b.x, b.y, 6) && hash(Math.round(b.x), Math.round(b.y), 5) > 0.3) sc.add(hash(Math.round(b.y), 3, 7) < 0.7 ? bush(700 + Math.round(b.x), 8 + hash(Math.round(b.x), 1, 7) * 8, { flowers: hash(Math.round(b.x), 2, 7) < 0.25 ? '#e8c040' : null }) : fern(700 + Math.round(b.y), 13), b.x, b.y);
  for (let i = 0; i < 7; i++) { const c = mainInfo.at(380 + i * 70), off = (hash(i, 1, 41) - 0.5) * c.w * 0.8, x = c.x + c.ty * off, y = c.y - c.tx * off; if (mainInfo.isWater(x, y) && Math.abs(y - roadY) > 130 && mainInfo.depth(x, y) < 0.45) { WA.foamRing(G, x, y, 5, Math.atan2(c.ty, c.tx), phase, 41 + i, 0.4); sc.addWorld(boulder(60 + i, 10 + (i % 3) * 3), x, y + 3); } }
  return sc.finish();
}

export const SCENES = { riverCountry: buildRiverCountry, waterKit: buildWaterKit, riverMap: buildRiverMap };
export const TARGETS = { riverCountry: 'W1_river-country.png', waterKit: 'W2_water-kit.png', riverMap: 'W1_river-country.png' };
