// Art v2 live renderer: a chunk's stand-in, drawn on the main thread in a millisecond or two while its real
// bake is still on the way (a fast car on a phone can outrun the bakes). Not the old art: the same map drawn
// simply, in the new ground's colours, at a quarter of the resolution (192 px for a 768 px chunk):
//   ground     each tile in its ground colour, with a little grain
//   roads      pavements, asphalt (dirt on tracks), centre lines and dashes, highway decks raised on their
//              side wall
//   buildings  blocks seen from the game camera: the roof raised by the building's height, the south wall
//              below it with a band per floor (heights and colours by district, varied per building)
//   plants     tree canopies up on their trunks, palms, bushes and boulders, each with a soft shadow
// drawStandIn(g, M, cx, cy) draws into a 2D context (a canvas or OffscreenCanvas of STANDIN_PX square); the
// engine scales it to the chunk (setChunkFallback). The index of what reaches each chunk is built once per map.
import { CHUNK, DECK_Z } from './chunkbake.js';
import { T, TILE, MAP_W, MAP_H } from '../../../shared/constants.js';
import { DISTRICTS } from '../../../shared/map.js';

export const STANDIN_PX = CHUNK / 4;
const S4 = CHUNK / STANDIN_PX;
const CX = Math.ceil(MAP_W * TILE / CHUNK), CY = Math.ceil(MAP_H * TILE / CHUNK);
// the ground by tile type, in the new ground's colours
export const GROUND_RGB = {
  [T.WALL]: [70, 66, 72], [T.GRASS]: [84, 118, 56], [T.SIDEWALK]: [170, 164, 152], [T.ROAD]: [66, 68, 76], [T.PLAZA]: [178, 160, 138],
  [T.BUILDING]: [96, 90, 90], [T.WATER]: [34, 122, 168], [T.DEEP]: [22, 104, 156], [T.SAND]: [216, 196, 146], [T.DOCK]: [128, 96, 66],
  [T.DIRT]: [140, 108, 74], [T.FIELD]: [152, 140, 70], [T.BRIDGE]: [112, 110, 106], [T.LOT]: [92, 92, 98], [T.FLOOR]: [186, 174, 152], [T.COUNTER]: [136, 100, 70],
};
const ASPHALT = '#42444c', DIRT = '#8c6c4a', WALK = '#aaa498', DECK = '#706e6a', DECK_SIDE = '#4e4c4a', LINE_W = 'rgba(232,230,220,0.85)', LINE_Y = 'rgba(214,194,78,0.9)';
// block heights (world px) and [roof, wall] colours by district style
const STYLE = {
  towers: [200, 220, [110, 116, 126], [150, 160, 172]],
  apartments: [110, 70, [96, 88, 86], [168, 120, 96]], southside: [100, 60, [92, 86, 84], [160, 116, 94]],
  commercial: [70, 70, [118, 104, 96], [196, 170, 140]], civic: [80, 60, [124, 118, 110], [204, 192, 170]], oldtown: [70, 50, [128, 92, 76], [200, 168, 132]],
  arts: [70, 50, [120, 84, 74], [184, 110, 90]],
  nightlife: [60, 50, [92, 80, 96], [150, 110, 140]], redlight: [60, 40, [96, 76, 92], [160, 104, 130]],
  industrial: [70, 30, [140, 142, 140], [170, 168, 160]], factory: [80, 40, [134, 136, 134], [160, 158, 150]], harbor: [70, 30, [130, 136, 140], [168, 170, 166]],
  houses: [48, 24, [150, 86, 70], [214, 200, 176]], luxury: [56, 30, [160, 100, 80], [226, 214, 192]], beach: [48, 30, [168, 110, 84], [224, 210, 180]],
};
const STYLE_DEF = [52, 26, [128, 108, 96], [200, 186, 164]];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})`;
const PLANT = { tree_a: 1, tree_b: 1, palm_a: 2, palm_b: 2, palm_c: 2, palm_d: 2, palm_s: 2, shrub_a: 3, shrub_b: 3, bush_a: 3, bush_b: 3, bush_c: 3, boulder: 4, cactus: 5 };

// what reaches each chunk (by its screen rectangle), built once per map
const IDX = new WeakMap();
function index(M) {
  let I = IDX.get(M);
  if (I) return I;
  I = { edges: new Map(), blds: new Map(), plants: new Map() };
  const put = (m, x0, y0, x1, y1, v) => {
    const a = Math.max(0, Math.floor(x0 / CHUNK)), b = Math.min(CX - 1, Math.floor(x1 / CHUNK)), c = Math.max(0, Math.floor(y0 / CHUNK)), d = Math.min(CY - 1, Math.floor(y1 / CHUNK));
    for (let cy = c; cy <= d; cy++) for (let cx = a; cx <= b; cx++) { const k = cy * 1000 + cx; let l = m.get(k); if (!l) m.set(k, l = []); l.push(v); }
  };
  for (const e of M.edges || []) {
    if (!e || !e.pts || e.pts.length < 2) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const r = (e.hw || 0) + (e.walk || 0) + 8, up = e.lvl === 1 || e.lvl === 'ramp' ? DECK_Z + 16 : 0;
    put(I.edges, x0 - r, y0 - r - up, x1 + r, y1 + r, e);
  }
  for (const b of M.buildings || []) {
    if (!b || !b.tw) continue;
    const i = Math.min(MAP_H - 1, b.ty) * MAP_W + Math.min(MAP_W - 1, b.tx), d = DISTRICTS[M.dist ? M.dist[i] : 0], st = STYLE[d && d.style] || STYLE_DEF;
    const h = hash(b.tx, b.ty), H = Math.round(st[0] + st[1] * h), v = 0.92 + hash(b.ty, b.tx) * 0.16;
    const o = { x0: b.tx * TILE, y0: b.ty * TILE, x1: (b.tx + b.tw) * TILE, y1: (b.ty + b.th) * TILE, H, roof: rgb(st[2], v), roofHi: rgb(st[2], v * 1.18), roofLo: rgb(st[2], v * 0.72), wall: rgb(st[3], v), band: rgb(st[3], v * 0.8) };
    put(I.blds, o.x0, o.y0 - H, o.x1, o.y1, o);
  }
  for (const p of M.props || []) {
    const k = p && PLANT[p.t];
    if (!k) continue;
    put(I.plants, p.x - 70, p.y - 100, p.x + 70, p.y + 30, [k, p.x, p.y, hash(p.x | 0, p.y | 0), p.s || 30]);
  }
  IDX.set(M, I);
  return I;
}

export function drawStandIn(g, M, cx, cy) {
  const n = STANDIN_PX, X0 = cx * CHUNK, Y0 = cy * CHUNK, I = index(M), key = cy * 1000 + cx;
  // ground: each tile's colour with a little grain (8 px cells)
  const id = g.createImageData(n, n), d = id.data;
  for (let y = 0, j = 0; y < n; y++) {
    const wy = Y0 + y * S4 + 2;
    for (let x = 0; x < n; x++, j += 4) {
      const wx = X0 + x * S4 + 2, c = GROUND_RGB[M.tileAtPx(wx, wy)] || GROUND_RGB[T.GRASS];
      const nz = ((((wx >> 3) * 73856093) ^ ((wy >> 3) * 19349663)) >>> 8 & 7) - 3;
      d[j] = c[0] + nz; d[j + 1] = c[1] + nz; d[j + 2] = c[2] + nz; d[j + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  g.save();
  g.setTransform(1 / S4, 0, 0, 1 / S4, -X0 / S4, -Y0 / S4); // world px from here on
  g.lineCap = 'round'; g.lineJoin = 'round';
  const edges = I.edges.get(key) || [], ground = edges.filter((e) => e.lvl === 0), decks = edges.filter((e) => e.lvl !== 0);
  const path = (e, dy = 0) => { g.beginPath(); g.moveTo(e.pts[0].x, e.pts[0].y - dy); for (let i = 1; i < e.pts.length; i++) g.lineTo(e.pts[i].x, e.pts[i].y - dy); };
  // pavements, then asphalt, then the lines (so junctions merge)
  g.strokeStyle = WALK;
  for (const e of ground) if (e.walk > 0) { g.lineWidth = 2 * (e.hw + e.walk); path(e); g.stroke(); }
  for (const e of ground) { g.strokeStyle = e.kind === 'dirt' ? DIRT : ASPHALT; g.lineWidth = 2 * e.hw; path(e); g.stroke(); }
  for (const e of ground) {
    if (e.kind === 'dirt' || e.kind === 'alley' || e.kind === 'minor') continue;
    const dbl = e.kind === 'ave' || e.kind === 'blvd' || e.kind === 'art';
    g.strokeStyle = dbl ? LINE_Y : LINE_W; g.lineWidth = dbl ? 8 : 6;
    g.setLineDash(dbl ? [] : [80, 80]);
    path(e); g.stroke();
  }
  g.setLineDash([]);
  // buildings, north to south: the roof up at its height, the south wall below it with a band per floor
  const blds = (I.blds.get(key) || []).slice().sort((a, b) => a.y1 - b.y1);
  for (const b of blds) {
    const w = b.x1 - b.x0, top = b.y1 - b.H;
    g.fillStyle = b.wall; g.fillRect(b.x0, top, w, b.H);
    g.fillStyle = b.band;
    for (let z = 28; z < b.H - 8; z += 40) g.fillRect(b.x0 + 8, b.y1 - z - 12, w - 16, 12);
    g.fillStyle = b.roof; g.fillRect(b.x0, b.y0 - b.H, w, b.y1 - b.y0);
    g.fillStyle = b.roofHi; g.fillRect(b.x0, b.y0 - b.H, w, 8); g.fillRect(b.x0, b.y0 - b.H, 8, b.y1 - b.y0);
    g.fillStyle = b.roofLo; g.fillRect(b.x0, top - 8, w, 8);
  }
  // highway decks and ramps, raised on a side wall
  for (const e of decks) {
    const up = e.lvl === 1 ? DECK_Z : DECK_Z * 0.5;
    g.strokeStyle = DECK_SIDE; g.lineWidth = 2 * e.hw; path(e, up - 16); g.stroke();
    g.strokeStyle = DECK; g.lineWidth = 2 * e.hw; path(e, up); g.stroke();
  }
  // plants and boulders, north to south, each with a soft shadow to the lower right
  const plants = (I.plants.get(key) || []).slice().sort((a, b) => a[2] - b[2]);
  for (const [k, x, y, h, size] of plants) {
    const r = k === 1 ? 34 + h * 12 : k === 2 ? 26 : k === 3 ? 13 + h * 5 : k === 4 ? size * 0.6 : 9;
    g.fillStyle = 'rgba(20,24,30,0.28)'; g.beginPath(); g.ellipse(x + r * 0.5, y + 2, r, r * 0.45, 0, 0, Math.PI * 2); g.fill();
    if (k === 1 || k === 2) { g.strokeStyle = '#5a4030'; g.lineWidth = k === 2 ? 7 : 10; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - (k === 2 ? 60 : 34)); g.stroke(); }
    const cy2 = k === 1 ? y - 40 - r * 0.6 : k === 2 ? y - 66 : k === 4 ? y - r * 0.4 : y - r * 0.7;
    const base = k === 4 ? [128, 124, 118] : k === 5 ? [96, 138, 80] : k === 2 ? [76, 136, 66] : [52 + h * 18, 96 + h * 20, 46];
    g.fillStyle = rgb(base, 0.78); g.beginPath(); g.arc(x, cy2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgb(base, 1.08); g.beginPath(); g.arc(x - r * 0.25, cy2 - r * 0.25, r * 0.62, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
