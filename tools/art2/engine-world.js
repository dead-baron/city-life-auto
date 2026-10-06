// Test world for the art v2 GPU engine (tools/art2/engine-test.html): existing art2 scenes composed into
// a 4 x 2 chunk world and cut into 768 px G-buffer chunks, v1-style canvas fallbacks for the last column,
// and a scripted cast of moving things (cars on and under the elevated deck, people behind a building,
// under the deck and on it, a police car with its siren, a fire, decals, v1 canvas sprites).
//
//   buildWorld(scenePreset) -> { chunks: [{cx, cy, g}], fallbacks: [{cx, cy, canvas}], lights, ms }
//   makeSprites(night) -> Map key -> GBuf | {canvas, ax, ay, opts}     cast(t, night) -> [draw op]
// World layout (world px): the overpass scene at (0, 0) (deck at y 50..350, z 96; the street under it at
// x 420..612; a two-storey brick block whose footprint starts at y 780 at x 0..340), downtown at (1254, 0),
// old town at (0, 880); x >= 2304 is v1 fallback art.
import { GBuf, hash, vnoise } from '../../client/art2/gbuf.js';
import { ROAD_SCENES } from '../../client/art2/roadscenes.js';
import { CITY_DISTRICTS } from '../../client/art2/districts4.js';
import { person, randomPerson, ARCHETYPES } from '../../client/art2/people.js';
import { vehicleModel } from '../../client/art2/vehicles.js';
import { fxFrames } from '../../client/art2/fx.js';

export const CH = 768, WCX = 3, WCY = 2, DECK_Z = 96;

function fillGround(G) {
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const i = y * G.w + x, j = i * 4, n = vnoise(x, y, 40, 9) * 0.6 + hash(x, y, 3) * 0.4, lot = vnoise(x, y, 300, 4) > 0.5;
    const k = (n - 0.5) * 18;
    if (lot) { G.col[j] = 92 + k; G.col[j + 1] = 94 + k; G.col[j + 2] = 98 + k; } else { G.col[j] = 74 + k; G.col[j + 1] = 98 + k * 1.2; G.col[j + 2] = 52 + k * 0.6; }
    G.col[j + 3] = 255; G.nrm[j] = 128; G.nrm[j + 1] = 128; G.nrm[j + 2] = 255; G.nrm[j + 3] = 255; G.flag[i] = 1 | 8;
  }
}
function cut(G, cx, cy) {
  const n = CH * CH, g = { w: CH, h: CH, ax: 0, ay: 0, col: new Uint8ClampedArray(n * 4), nrm: new Uint8ClampedArray(n * 4), z: new Uint16Array(n), emi: new Uint8ClampedArray(n * 4), flag: new Uint8Array(n) };
  for (let y = 0; y < CH; y++) {
    const s = (cy * CH + y) * G.w + cx * CH, d = y * CH;
    g.col.set(G.col.subarray(s * 4, (s + CH) * 4), d * 4); g.nrm.set(G.nrm.subarray(s * 4, (s + CH) * 4), d * 4); g.emi.set(G.emi.subarray(s * 4, (s + CH) * 4), d * 4);
    g.z.set(G.z.subarray(s, s + CH), d); g.flag.set(G.flag.subarray(s, s + CH), d);
  }
  return g;
}
// v1-style ground (flat painted canvas, like client/render/tiles.js chunks): grass, a road with kerbs,
// a parking lot
function v1Chunk(seed) {
  const c = document.createElement('canvas'); c.width = c.height = CH;
  const g = c.getContext('2d');
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#4c6a38'; g.fillRect(0, 0, CH, CH);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? '#587a40' : '#41603a'; g.fillRect(r() * CH | 0, r() * CH | 0, 2, 2); }
  g.fillStyle = '#8e8a80'; g.fillRect(0, 368, CH, 240); g.fillRect(250, 0, 260, CH);
  g.fillStyle = '#3b3e45'; g.fillRect(0, 400, CH, 176); g.fillRect(282, 0, 196, CH);
  for (let i = 0; i < 3000; i++) { g.fillStyle = r() < 0.5 ? '#45484f' : '#34373d'; g.fillRect(r() * CH | 0, r() * CH | 0, 2, 1); }
  g.fillStyle = '#d6b23a'; for (let x = 0; x < CH; x += 44) if (x < 270 || x > 490) g.fillRect(x, 486, 24, 4);
  for (let y = 0; y < CH; y += 44) if (y < 390 || y > 590) g.fillRect(378, y, 4, 24);
  g.fillStyle = '#e6e2d6'; for (let x = 290; x < 470; x += 22) { g.fillRect(x, 378, 12, 18); g.fillRect(x, 580, 12, 18); }
  g.fillStyle = '#5a5d64'; g.fillRect(560, 640, 200, 120); g.fillStyle = '#e8e4d8'; for (let x = 570; x < 760; x += 38) g.fillRect(x, 646, 3, 50);
  g.strokeStyle = '#2c2a30'; g.lineWidth = 2; g.strokeRect(560, 640, 200, 120);
  return c;
}
// a v1-style canvas prop: a wooden crate drawn with the 2D API
function v1Crate() {
  const c = document.createElement('canvas'); c.width = 26; c.height = 30;
  const g = c.getContext('2d');
  g.fillStyle = '#3a2416'; g.fillRect(0, 4, 26, 26);
  g.fillStyle = '#b07a44'; g.fillRect(2, 12, 22, 16);
  g.fillStyle = '#d29a5c'; g.fillRect(2, 6, 22, 6);
  g.fillStyle = '#7a4e2a'; for (const y of [17, 22]) g.fillRect(2, y, 22, 1);
  g.fillStyle = '#5a3820'; g.fillRect(3, 13, 2, 14); g.fillRect(21, 13, 2, 14); g.fillRect(4, 14, 18, 2); g.fillRect(4, 24, 18, 2);
  return c;
}

export function buildWorld(sp) {
  const t0 = performance.now();
  const ov = ROAD_SCENES.overpass(sp), dt = CITY_DISTRICTS.downtown(sp), ot = CITY_DISTRICTS.oldtown(sp);
  const t1 = performance.now();
  const W = new GBuf(WCX * CH, WCY * CH);
  fillGround(W);
  const lights = [];
  for (const [s, ox, oy] of [[ov, 0, 0], [dt, 1254, 0], [ot, 0, 880]]) {
    W.blit(s.G, ox, oy);
    for (const L of s.lights) lights.push({ x: L.x + ox, y: L.y + oy, z: L.z, r: L.r, col: L.col, k: L.k });
  }
  const chunks = [];
  for (let cy = 0; cy < WCY; cy++) for (let cx = 0; cx < WCX; cx++) chunks.push({ cx, cy, g: cut(W, cx, cy) });
  const fallbacks = [{ cx: 3, cy: 0, canvas: v1Chunk(1) }, { cx: 3, cy: 1, canvas: v1Chunk(2) }];
  return { chunks, fallbacks, lights, ms: { scenes: t1 - t0, compose: performance.now() - t1 } };
}

// any scene module (client/art2/<module>.js exporting SCENES, ROAD_SCENES or a district table) as the whole
// world, cut into chunks
export async function buildSceneWorld(module, name, sp) {
  const t0 = performance.now();
  const m = await import('../../client/art2/' + module.replace(/[^\w-]/g, '') + '.js');
  const tab = m.SCENES || m.ROAD_SCENES || m.CITY_DISTRICTS || m.EVERY_DISTRICT || m.ALL_DISTRICTS || m.DISTRICTS;
  const { G, lights } = tab[name](sp);
  const t1 = performance.now();
  const nx = Math.ceil(G.w / CH), ny = Math.ceil(G.h / CH), W = new GBuf(nx * CH, ny * CH);
  fillGround(W); W.blit(G, 0, 0);
  const chunks = [];
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) chunks.push({ cx, cy, g: cut(W, cx, cy) });
  return { chunks, fallbacks: [], lights: lights.map((L) => ({ ...L })), w: G.w, h: G.h, ms: { scenes: t1 - t0, compose: performance.now() - t1 } };
}

// ---- the cast ---------------------------------------------------------------------------------------------
const PI = Math.PI;
const CARS = [
  // id, type, paint, heading, z0, x(t), y(t)  (deck: z0 96; under the deck: the street at x 420..612)
  ['deckE', 'sedan', '#c8343a', 0, DECK_Z, (t) => 560 + ((t * 110) % 700), () => 302],
  ['deckW', 'taxi', null, PI, DECK_Z, (t) => 760 - ((t * 95) % 600), () => 104],
  ['under', 'suv', '#2f5a4a', -PI / 2, 0, () => 566, (t) => 250 - ((t * 60) % 400)],
  ['under2', 'sedan', '#e0dccc', PI / 2, 0, () => 466, (t) => 120 + ((t * 70) % 200)],
  ['streetE', 'sedan', '#3a5a8a', 0, 0, (t) => 330 + ((t * 120) % 900), () => 704],
  ['streetW', 'pickup', '#a8342e', PI, 0, (t) => 1060 - ((t * 90) % 700), () => 616],
  ['cop', 'police', null, PI, 0, () => 1080, () => 662],
  ['dtE', 'van', '#ecebe4', 0, 0, (t) => 1500 + ((t * 80) % 600), () => 440],
];
const PEDS = [
  // id, archetype, dir (art2: 0 S 2 E 4 N 6 W), z0, x(t), y(t), xray
  ['player', 'driver', 2, 0, (t) => 120 + ((t * 32) % 330), () => 774, true],      // behind the brick block (x-ray)
  ['underWalk', 'office', 4, 0, () => 396, (t) => 330 - ((t * 30) % 260), false],   // the sidewalk under the deck
  ['deckWalk', 'nightshift', 2, DECK_Z, (t) => 300 + ((t * 26) % 500), () => 336, false],
  ['walkW', 'student', 6, 0, (t) => 760 - ((t * 30) % 300), () => 528, false],
  ['walkS', 'nurse', 0, 0, () => 640, (t) => 470 + ((t * 28) % 280), false],
  ['dtWalk', 'banker', 2, 0, (t) => 1330 + ((t * 30) % 500), () => 345, false],
  ['dtBehind', 'tourist', 6, 0, (t) => 2100 - ((t * 25) % 200), () => 24, true],      // north of the hotel (x-ray)
];
export function makeSprites(night) {
  const S = new Map();
  for (const [id, type, paint, hd] of CARS) S.set('car:' + id, vehicleModel(type, { paint: paint || undefined, lights: night ? 1 : 0, siren: type === 'police' && night }).render(hd));
  for (const [id, kind, dir] of PEDS) {
    const app = randomPerson(id.length * 977 + dir, kind in ARCHETYPES ? kind : null);
    for (let f = 0; f < 4; f++) S.set(`ped:${id}:${f}`, person(app, dir, 'walk', f));
  }
  fxFrames('fire').forEach((g, i) => S.set('fire:' + i, g));
  S.set('blood', fxFrames('bloodSplat')[0]); S.set('skid', fxFrames('skidMarks')[1]);
  S.set('v1crate', { canvas: v1Crate(), ax: 13, ay: 30, opts: {} });
  return S;
}
// draw ops for time t: { op: 'sprite'|'decal'|'light', ... }
export function cast(t, night, S) {
  const out = [];
  for (const [id, type, , hd, z0, fx, fy] of CARS) {
    const x = fx(t), y = fy(t);
    out.push({ op: 'sprite', key: 'car:' + id, x, y, z0 });
    if (night) {
      const L = type === 'van' ? 112 : 100, c = Math.cos(hd), s = Math.sin(hd);
      out.push({ op: 'light', L: { x: x + c * (L / 2 + 2), y: y + s * (L / 2 + 2), z: z0 + 12, r: 280, col: [1, 0.92, 0.72], k: 1.9, cone: { a: hd, spread: 0.4, len: 280 } } });
      out.push({ op: 'light', L: { x: x - c * (L / 2 + 2), y: y - s * (L / 2 + 2), z: z0 + 12, r: 46, col: [1, 0.15, 0.1], k: 1.1 } });
    }
    if (type === 'police' && night) {
      const red = Math.floor(t * 4) % 2 === 0;
      out.push({ op: 'light', L: { x, y, z: z0 + 42, r: 170, col: red ? [1, 0.12, 0.1] : [0.2, 0.35, 1], k: 2.6 } });
    }
  }
  const f = Math.floor(t * 8) & 3;
  for (const [id, , , z0, fx, fy, xray] of PEDS) out.push({ op: 'sprite', key: `ped:${id}:${f}`, x: fx(t), y: fy(t), z0, o: xray ? { xray: true } : undefined });
  const ff = Math.floor(t * 10) % 5, fire = S.get('fire:' + ff);
  out.push({ op: 'sprite', key: 'fire:' + ff, x: 930, y: 690, z0: 0 });
  if (fire.light) out.push({ op: 'light', L: { x: 930 + fire.light.x, y: 690 + fire.light.y, z: fire.light.z, r: fire.light.r * 1.6, col: fire.light.col, k: fire.light.k * 1.5 } });
  out.push({ op: 'decal', key: 'blood', x: 620, y: 676, a: 0.4, alpha: 1 });
  out.push({ op: 'decal', key: 'skid', x: 760, y: 650, a: 0.2, alpha: 0.9 });
  out.push({ op: 'sprite', key: 'v1crate', x: 728, y: 548, z0: 0 });
  out.push({ op: 'sprite', key: 'v1crate', x: 2420, y: 560, z0: 0 });
  return out;
}
