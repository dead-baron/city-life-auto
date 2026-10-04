// Ground layer: the deterministic city is baked into 768x768 chunk canvases on demand
// (LRU-cached) using textures and building lots cut from the concept art: asphalt, worn
// asphalt, concrete/brick/slate sidewalks, water; building prefabs; road markings, curbs,
// crosswalks, parking stalls and low street props.
import { T, TILE, CHUNK_PX, MAP_W, MAP_H } from '../../shared/constants.js';
import { hash2, mulberry32 } from '../../shared/rng.js';
import { DISTRICTS } from '../../shared/map.js';
import { PREFABS, GROUND_TEX, PROP_SIZES } from '../../shared/prefab-data.js';
import { atlas } from './sprites.js';
import { railIndex, drawRailChunk, drawPortals, drawStation } from './trains.js';

export const OVERHEAD = new Set(['tree_a', 'tree_b', 'palm_a', 'palm_b', 'palm_c', 'palm_d', 'palm_s', 'umbrella_r', 'umbrella_b', 'umbrella_g', 'umbrella_y', 'lamp']);

const C = {
  grass: ['#4f8f3c', '#4a8838', '#559643', '#45812f'],
  sand: ['#dcc58e', '#d6be86', '#e2cd97'],
  dock: ['#8a5c34', '#7d522e', '#93633a'],
  dirt: ['#8a6a44', '#806040', '#93714a'],
  field: ['#7a9a2e', '#86a634', '#6e8e28'],
  yellow: '#e8b923', white: '#e6e4dc',
};

export class GroundCache {
  constructor(map, maxChunks = 24) {
    this.map = map;
    this.max = maxChunks;
    this.cache = new Map();
    this.byChunk = (list, getRect) => {
      const out = new Map();
      for (const it of list) {
        const [x0, y0, x1, y1] = getRect(it);
        for (let cy = Math.floor(y0 / CHUNK_PX); cy <= Math.floor(y1 / CHUNK_PX); cy++)
          for (let cx = Math.floor(x0 / CHUNK_PX); cx <= Math.floor(x1 / CHUNK_PX); cx++) {
            const k = this.key(cx, cy);
            if (!out.has(k)) out.set(k, []);
            out.get(k).push(it);
          }
      }
      return out;
    };
    const propRect = (p) => { const s = PROP_SIZES[p.t] || [40, 40]; return [p.x - s[0] / 2, p.y - s[1] / 2, p.x + s[0] / 2, p.y + s[1] / 2]; };
    this.lowProps = this.byChunk(map.props.filter((p) => !OVERHEAD.has(p.t)), propRect);
    this.highProps = this.byChunk(map.props.filter((p) => OVERHEAD.has(p.t)), propRect);
    this.roofs = this.byChunk((map.roofs || []).filter((r) => !r.gone), (r) => [r.tx * TILE - 2, r.ty * TILE - 2, (r.tx + r.tw) * TILE + 10, (r.ty + r.th) * TILE + 10]);
    this.prefabs = this.byChunk(map.prefabs, (p) => [p.tx * TILE, p.ty * TILE, (p.tx + p.tw) * TILE, (p.ty + p.th) * TILE]);
    this.stalls = this.byChunk(map.stalls, (s) => [s.x, s.y, s.x + s.w, s.y + s.h]);
    this.signs = this.byChunk(map.buildings.filter((b) => b.signs && b.signs.length), (b) => [b.tx * TILE, b.ty * TILE, (b.tx + b.tw) * TILE, (b.ty + b.th) * TILE]);
    this.roads = this.byChunk(map.roads, (r) => [r.x * TILE, r.y * TILE, (r.x + r.w) * TILE, (r.y + r.h) * TILE]);
    this.nodes = this.byChunk(map.nodes, (n) => [n.x - 200, n.y - 200, n.x + 200, n.y + 200]);
    this.rail = railIndex(map, (cx, cy) => this.key(cx, cy));
  }
  key(cx, cy) { return cy * 1000 + cx; }
  get(cx, cy) {
    const k = this.key(cx, cy);
    let c = this.cache.get(k);
    if (c) { this.cache.delete(k); this.cache.set(k, c); return c; }
    c = this.bake(cx, cy);
    this.cache.set(k, c);
    if (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    return c;
  }
  overhead(cx, cy) { return this.highProps.get(this.key(cx, cy)) || []; }
  prefabsAt(cx, cy) { return this.prefabs.get(this.key(cx, cy)) || []; }

  bake(cx, cy) {
    const cv = document.createElement('canvas');
    cv.width = CHUNK_PX; cv.height = CHUNK_PX;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const m = this.map;
    const n = CHUNK_PX / TILE;
    const tx0 = cx * n, ty0 = cy * n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = tx0 + i, ty = ty0 + j;
      if (tx >= MAP_W || ty >= MAP_H) { g.fillStyle = '#0b0d14'; g.fillRect(i * TILE, j * TILE, TILE, TILE); continue; }
      drawTile(g, m, tx, ty, i * TILE, j * TILE);
    }
    g.save();
    g.translate(-cx * CHUNK_PX, -cy * CHUNK_PX);
    const k = this.key(cx, cy);
    drawCurbs(g, m, tx0, ty0, n);
    for (const r of this.roads.get(k) || []) drawRoadMarkings(g, m, r, cx, cy);
    for (const nd of this.nodes.get(k) || []) drawCrosswalks(g, m, nd);
    drawRailChunk(g, m, this.rail.get(k));
    for (const st of (m.rail && m.rail.stations) || []) drawStation(g, st, cx, cy);
    for (const s of this.stalls.get(k) || []) drawStall(g, s);
    for (const r of this.roofs.get(k) || []) drawBuildingBase(g, r); // the roof itself is lifted onto its walls (render/buildings.js)
    drawPortals(g, m, cx, cy);
    for (const p of this.prefabs.get(k) || []) drawPrefab(g, p);
    for (const bay of m.bays || []) drawBayFloor(g, bay, cx, cy);
    for (const mn of m.mansions || []) drawMansion(g, mn, cx, cy);
    for (const gr of m.garages || []) drawGarage(g, gr, cx, cy);
    for (const mp of m.motorPools || []) drawMotorPool(g, mp, cx, cy);
    for (const v of m.venues || []) drawVenue(g, v, cx, cy);
    for (const pu of m.pumps || []) drawPump(g, pu, cx, cy);
    // (shop names are on the lifted facades now: render/buildings.js)
    for (const p of this.lowProps.get(k) || []) { if (p.broken) drawDebris(g, p); else drawProp(g, p); }
    for (const p of this.highProps.get(k) || []) if (p.broken) drawFallen(g, p); // knocked-over trees / lamp posts lie on the ground
    g.restore();
    return cv;
  }
  // a smashed / restored prop changes the baked ground: drop the cached chunks it touches
  invalidateAt(x, y, r = 90) {
    for (let cy = Math.floor((y - r) / CHUNK_PX); cy <= Math.floor((y + r) / CHUNK_PX); cy++)
      for (let cx = Math.floor((x - r) / CHUNK_PX); cx <= Math.floor((x + r) / CHUNK_PX); cx++) this.cache.delete(this.key(cx, cy));
  }
}

const inChunk = (x, y, w, h, cx, cy) => !(x + w < cx * CHUNK_PX || x > (cx + 1) * CHUNK_PX || y + h < cy * CHUNK_PX || y > (cy + 1) * CHUNK_PX);

// A pitched (hip) roof seen from above: four shaded faces meeting at a ridge.
function hipRoof(g, x, y, w, h, base, dark, light) {
  const r = Math.min(w, h) / 2, rx0 = x + r, rx1 = x + w - r, ry = y + h / 2;
  const face = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath(); g.fill(); };
  face([[x, y], [x + w, y], [rx1, ry], [rx0, ry]], light);           // north face (lit)
  face([[x, y + h], [x + w, y + h], [rx1, ry], [rx0, ry]], dark);     // south face
  face([[x, y], [rx0, ry], [x, y + h]], base);                         // west
  face([[x + w, y], [rx1, ry], [x + w, y + h]], dark);                 // east
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(x, y); g.lineTo(rx0, ry); g.lineTo(rx1, ry); g.lineTo(x + w, y); g.moveTo(x, y + h); g.lineTo(rx0, ry); g.moveTo(rx1, ry); g.lineTo(x + w, y + h); g.stroke();
  // shingle rows
  g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1;
  for (let k = 6; k < h / 2; k += 6) { g.beginPath(); g.moveTo(x + k, y + k); g.lineTo(x + w - k, y + k); g.moveTo(x + k, y + h - k); g.lineTo(x + w - k, y + h - k); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
}

function drawGarage(g, gr, cx, cy) {
  const x = gr.tx * TILE, y = gr.ty * TILE, w = gr.tw * TILE, h = gr.th * TILE;
  if (!inChunk(x - 4, y - 4, w + 8, h + 8, cx, cy)) return;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 4, y + 5, w, h);
  hipRoof(g, x, y, w, h, '#6b6e75', '#55585f', '#7d8189');
  // door frame on the driveway side (the door itself is drawn live, it opens)
  const dy = gr.south ? y + h - 7 : y;
  g.fillStyle = '#d8d4cb'; g.fillRect(x + 2, dy, w - 4, 7);
}

function drawMansion(g, mn, cx, cy) {
  const L = mn.lot;
  const lx = L.tx * TILE, ly = L.ty * TILE, lw = L.tw * TILE, lh = L.th * TILE;
  if (!inChunk(lx, ly, lw, lh, cx, cy)) return;
  // pool
  if (mn.pool) {
    const px = mn.pool.tx * TILE, py = mn.pool.ty * TILE, pw = mn.pool.tw * TILE, ph = mn.pool.th * TILE;
    g.fillStyle = '#e8e4da'; g.fillRect(px - 6, py - 6, pw + 12, ph + 12);
    const wg = g.createLinearGradient(px, py, px + pw, py + ph);
    wg.addColorStop(0, '#3fc4e8'); wg.addColorStop(1, '#1e8fc4');
    g.fillStyle = wg; g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(px + 6, py + 10 + k * 26); g.quadraticCurveTo(px + pw / 2, py + 4 + k * 26, px + pw - 6, py + 10 + k * 26); g.stroke(); }
    g.fillStyle = '#ffffff'; g.fillRect(px + pw - 10, py + 4, 6, 2); g.fillRect(px + pw - 10, py + 10, 6, 2);
  }
  // the house: terracotta hip roof with a portico and chimneys
  const x = mn.tx * TILE, y = mn.ty * TILE, w = mn.tw * TILE, h = mn.th * TILE;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 8, y + 10, w, h);
  hipRoof(g, x, y, w, h, '#b5563a', '#8e3f2a', '#cf6a4a');
  hipRoof(g, x + w / 2 - 52, y - 30, 104, 44, '#c25e40', '#99452e', '#d97455'); // portico
  g.fillStyle = '#f2ece0'; for (const cxp of [x + w / 2 - 44, x + w / 2 - 14, x + w / 2 + 14, x + w / 2 + 44]) { g.beginPath(); g.arc(cxp, y - 2, 4, 0, 6.28); g.fill(); }
  g.fillStyle = '#5a3a2a'; g.fillRect(x + 40, y + 30, 14, 18); g.fillRect(x + w - 54, y + 40, 14, 18);
  g.fillStyle = '#333'; g.fillRect(x + 42, y + 32, 10, 4); g.fillRect(x + w - 52, y + 42, 10, 4);
}

// Paint-shop bay floor (baked): concrete, oil stains, yellow guide lines, a dark interior.
function drawBayFloor(g, bay, cx, cy) {
  const x = bay.tx * TILE, y = bay.ty * TILE, w = bay.tw * TILE, h = bay.th * TILE;
  if (x + w < cx * CHUNK_PX || x > (cx + 1) * CHUNK_PX || y + h < cy * CHUNK_PX || y > (cy + 1) * CHUNK_PX) return;
  g.fillStyle = '#4a4d54'; g.fillRect(x, y, w, h);
  const back = bay.south ? 0 : 1;
  const gr = g.createLinearGradient(0, bay.south ? y : y + h, 0, bay.south ? y + h : y);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.fillStyle = '#ffd400'; g.fillRect(x + 6, y + 4, 3, h - 8); g.fillRect(x + w - 9, y + 4, 3, h - 8);
  g.fillStyle = 'rgba(20,20,24,.5)';
  g.beginPath(); g.ellipse(x + w / 2, y + h / 2, 18, 11, 0.3, 0, 6.28); g.fill();
  g.fillStyle = '#2a2c31'; g.fillRect(x - 3, y, 3, h); g.fillRect(x + w, y, 3, h);
  g.fillRect(x - 3, back ? y + h - 3 : y, w + 6, 3);
  // spray nozzles on the walls
  g.fillStyle = '#c8262b'; for (let k = 0; k < 3; k++) { g.fillRect(x - 2, y + 18 + k * 26, 4, 4); g.fillRect(x + w - 2, y + 18 + k * 26, 4, 4); }
}

// Gas 'n Go pump: an island with a pump, a hose and a price display.
function drawPump(g, p, cx, cy) {
  if (p.x + 40 < cx * CHUNK_PX || p.x - 40 > (cx + 1) * CHUNK_PX || p.y + 40 < cy * CHUNK_PX || p.y - 40 > (cy + 1) * CHUNK_PX) return;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(p.x - 13, p.y - 7, 30, 20);
  g.fillStyle = '#c8c8c0'; g.fillRect(p.x - 16, p.y - 10, 32, 20);
  g.fillStyle = '#c8262b'; g.fillRect(p.x - 7, p.y - 8, 14, 16);
  g.fillStyle = '#e8e8e8'; g.fillRect(p.x - 5, p.y - 6, 10, 5);
  g.fillStyle = '#1b2333'; g.fillRect(p.x - 4, p.y - 5, 8, 3);
  g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x + 7, p.y + 2); g.quadraticCurveTo(p.x + 14, p.y + 4, p.x + 12, p.y + 9); g.stroke();
}

// Mini-game venues: a striped, lined soccer pitch with goals; a roped sand court with a net.
function drawVenue(g, v, cx, cy) {
  const { x, y, w, h } = v.rect;
  if (x + w + 80 < cx * CHUNK_PX || x - 80 > (cx + 1) * CHUNK_PX || y + h + 80 < cy * CHUNK_PX || y - 80 > (cy + 1) * CHUNK_PX) return;
  g.save();
  if (v.kind === 'soccer') {
    for (let k = 0; k * 64 < w; k++) { g.fillStyle = k % 2 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.05)'; g.fillRect(x + k * 64, y, Math.min(64, w - k * 64), h); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
    g.strokeRect(x, y, w, h);
    g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w / 2, y + h); g.stroke();
    g.beginPath(); g.arc(x + w / 2, y + h / 2, 64, 0, 6.28); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x + w / 2, y + h / 2, 4, 0, 6.28); g.fill();
    const bw = 130, bh = v.goalW + 120;
    g.strokeRect(x, y + h / 2 - bh / 2, bw, bh); g.strokeRect(x + w - bw, y + h / 2 - bh / 2, bw, bh);
    for (const [gx, dir] of [[x, -1], [x + w, 1]]) { // goals with nets
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(dir < 0 ? gx - 28 : gx, y + h / 2 - v.goalW / 2, 28, v.goalW);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1;
      for (let k = 4; k < 28; k += 6) { g.beginPath(); g.moveTo(gx + dir * k, y + h / 2 - v.goalW / 2); g.lineTo(gx + dir * k, y + h / 2 + v.goalW / 2); g.stroke(); }
      for (let k = 0; k <= v.goalW; k += 8) { g.beginPath(); g.moveTo(gx, y + h / 2 - v.goalW / 2 + k); g.lineTo(gx + dir * 28, y + h / 2 - v.goalW / 2 + k); g.stroke(); }
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(gx, y + h / 2 - v.goalW / 2); g.lineTo(gx + dir * 28, y + h / 2 - v.goalW / 2); g.lineTo(gx + dir * 28, y + h / 2 + v.goalW / 2); g.lineTo(gx, y + h / 2 + v.goalW / 2); g.stroke();
    }
  } else {
    g.strokeStyle = '#2350c8'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(v.netX - 2, y - 6, 8, h + 12); // net shadow
    g.strokeStyle = '#f5f5f5'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(v.netX, y - 6); g.lineTo(v.netX, y + h + 6); g.stroke();
    g.strokeStyle = 'rgba(30,30,30,.55)'; g.lineWidth = 1;
    for (let k = 0; k < h + 12; k += 5) { g.beginPath(); g.moveTo(v.netX - 3, y - 6 + k); g.lineTo(v.netX + 3, y - 6 + k); g.stroke(); }
    g.fillStyle = '#3a3a42'; g.fillRect(v.netX - 4, y - 10, 8, 8); g.fillRect(v.netX - 4, y + h + 2, 8, 8);
  }
  g.restore();
}

// Police motor pool: painted bays on dark asphalt inside a chain-link fence on a concrete curb.
function drawMotorPool(g, mp, cx, cy) {
  const x = mp.tx * TILE, y = mp.ty * TILE, w = mp.tw * TILE, h = mp.th * TILE;
  if (x + w < cx * CHUNK_PX || x > (cx + 1) * CHUNK_PX || y + h + 96 < cy * CHUNK_PX || y - 96 > (cy + 1) * CHUNK_PX) return;
  g.fillStyle = '#3c3f46'; g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(255,255,255,.035)';
  for (let k = 0; k < 60; k++) { const hx = (k * 7919) % w, hy = (k * 104729) % h; g.fillRect(x + hx, y + hy, 2, 2); }
  // bays
  g.strokeStyle = '#e8e8e8'; g.lineWidth = 2;
  for (const sp of mp.spots) {
    const bw = sp.model === 'police' ? 58 : 30, bl = sp.model === 'police' ? 100 : 60;
    g.strokeRect(sp.x - bw / 2, sp.y - bl / 2, bw, bl);
  }
  g.fillStyle = 'rgba(42,90,255,.85)'; g.font = 'bold 13px monospace'; g.textAlign = 'center';
  const ty = mp.south ? y + h - TILE * 1.6 : y + TILE * 1.8;
  g.fillText('POLICE ONLY', x + w / 2, ty);
  // fence: concrete curb + chain-link with posts (not across the gate)
  const fence = (x1, y1, x2, y2) => {
    g.fillStyle = '#9a9ea6'; g.fillRect(Math.min(x1, x2) - 3, Math.min(y1, y2) - 3, Math.abs(x2 - x1) + 6, Math.abs(y2 - y1) + 6);
    g.strokeStyle = 'rgba(200,205,215,.85)'; g.lineWidth = 1;
    const len = Math.hypot(x2 - x1, y2 - y1), nx = (x2 - x1) / len, ny = (y2 - y1) / len;
    for (let d = 0; d < len; d += 6) { g.beginPath(); g.moveTo(x1 + nx * d - ny * 5, y1 + ny * d + nx * 5); g.lineTo(x1 + nx * (d + 6) + ny * 5, y1 + ny * (d + 6) - nx * 5); g.stroke(); }
    g.fillStyle = '#2a2c31'; for (let d = 0; d <= len; d += 32) g.fillRect(x1 + nx * d - 3, y1 + ny * d - 3, 6, 6);
  };
  const half = TILE / 2;
  fence(x + half, y + half, x + half, y + h - half);
  fence(x + w - half, y + half, x + w - half, y + h - half);
  const back = mp.south ? y + half : y + h - half;
  fence(x + half, back, x + w - half, back);
  // gate rail on the street side (posts are drawn with the gate)
  const gy = mp.gate.y;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + TILE, gy - 1, w - 2 * TILE, 2);
}

// ---- smashed street furniture --------------------------------------------------------------
const WOOD = new Set(['bench_a', 'bench_b', 'bench_m', 'pbench', 'pallet', 'pallet_b', 'pallet_s', 'lumber', 'planks', 'spool', 'cart', 'foodcart', 'foodcart_b', 'wheelbarrow']);
const GREEN = new Set(['shrub_a', 'shrub_b', 'bush_a', 'bush_b', 'bush_c', 'flowers_a', 'flowers_big', 'planter_g', 'planter_fl', 'planter_sq', 'potted', 'produce_a', 'produce_b']);
export function debrisColors(t) {
  if (WOOD.has(t)) return ['#7a5230', '#a87444', '#5a3a1e'];
  if (GREEN.has(t) || t.startsWith('tree') || t.startsWith('palm')) return ['#2f6a24', '#4f8f3c', '#6a4a2a'];
  if (t.startsWith('hydrant')) return ['#c8262b', '#e8e8e8', '#7a1d24'];
  if (t.startsWith('umbrella')) return ['#c8262b', '#2350c8', '#f2c21b'];
  if (t === 'cone' || t === 'barrier') return ['#ef7a1a', '#ffffff', '#c85a10'];
  return ['#6a6e76', '#9aa0aa', '#3a3d44'];
}
function drawDebris(g, p) {
  const c = debrisColors(p.t);
  const s = PROP_SIZES[p.t] || [24, 24];
  const r = Math.max(8, Math.min(22, Math.max(s[0], s[1]) * 0.45));
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.7, 0, 0, 6.28); g.fill();
  for (let k = 0; k < 9; k++) {
    const h = hash2(p.x + k * 7, p.y - k * 3, 11), h2 = hash2(p.y + k * 5, p.x + k, 13);
    g.fillStyle = c[k % 3];
    const a = h * 6.28, d = h2 * r;
    g.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 2 + (k % 3), 2 + ((k + 1) % 2));
  }
  if (p.t.startsWith('hydrant')) { g.fillStyle = '#5a1418'; g.fillRect(p.x - 4, p.y - 4, 8, 8); g.fillStyle = '#222'; g.fillRect(p.x - 2, p.y - 2, 4, 4); }
}
function drawFallen(g, p) {
  const a = p.broken && p.broken.a !== undefined ? p.broken.a : 0;
  if (p.t === 'lamp') {
    // the post lies along the impact direction, head smashed at the far end
    g.save(); g.translate(p.x, p.y); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(2, -1, 44, 6);
    g.fillStyle = '#2b2f38'; g.fillRect(0, -2, 42, 4); g.fillStyle = '#4a505c'; g.fillRect(0, -2, 42, 1);
    g.fillStyle = '#1c1f26'; g.fillRect(40, -5, 8, 10); g.fillStyle = '#9fd3ff'; g.fillRect(48, -3, 3, 2); g.fillRect(50, 2, 2, 2);
    g.fillStyle = '#3a3d44'; g.beginPath(); g.arc(0, 0, 4, 0, 6.28); g.fill();
    g.restore();
    return;
  }
  const fr = atlas.ready ? atlas.frames['prop_' + p.t] : null;
  const s = PROP_SIZES[p.t] || [40, 40];
  // stump where it stood
  g.fillStyle = '#4a3220'; g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.28); g.fill();
  g.fillStyle = '#7a5a3a'; g.beginPath(); g.arc(p.x, p.y, 3, 0, 6.28); g.fill();
  if (!fr) return;
  g.save(); g.translate(p.x + Math.cos(a) * s[0] * 0.45, p.y + Math.sin(a) * s[0] * 0.45); g.rotate(a + Math.PI / 2);
  g.globalAlpha = 0.9; g.filter = 'brightness(.75) saturate(.8)';
  g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, -s[0] * 0.45, -s[1] * 0.45, s[0] * 0.9, s[1] * 0.9);
  g.filter = 'none'; g.globalAlpha = 1;
  g.restore();
}

// ---- lamp post: base on the sidewalk, arm over the street, lamp head lit at night -------------
function drawLamp(g, p) {
  const a = p.a ?? -Math.PI / 2, L = 26;
  const c = Math.cos(a), s = Math.sin(a);
  g.save(); g.translate(p.x, p.y); g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(3, 2, L, 4); g.beginPath(); g.arc(4, 4, 5, 0, 6.28); g.fill();
  g.fillStyle = '#23262e'; g.fillRect(0, -1.5, L, 3);
  g.fillStyle = '#4a505c'; g.fillRect(0, -1.5, L, 1);
  g.fillStyle = '#1c1f26'; g.fillRect(L - 2, -4, 11, 8);
  g.fillStyle = p.night ? '#fff2b0' : '#aeb6c2'; g.fillRect(L, -2.5, 7, 5);
  g.fillStyle = '#30343e'; g.beginPath(); g.arc(0, 0, 4.5, 0, 6.28); g.fill();
  g.fillStyle = '#5a606c'; g.beginPath(); g.arc(-1, -1, 2, 0, 6.28); g.fill();
  g.restore();
  void c; void s;
}
export function lampHead(p) { const a = p.a ?? -Math.PI / 2; return { x: p.x + Math.cos(a) * 30, y: p.y + Math.sin(a) * 30 }; }

// ---------------------------------------------------------------------------
function tex(g, name, tx, ty, x, y, tint = null) {
  const r = GROUND_TEX[name];
  if (!atlas.ground || !r) return false;
  const ox = ((tx * TILE) % r[2] + r[2]) % r[2], oy = ((ty * TILE) % r[3] + r[3]) % r[3];
  g.drawImage(atlas.ground, r[0] + ox, r[1] + oy, TILE, TILE, x, y, TILE, TILE);
  if (tint) { g.fillStyle = tint; g.fillRect(x, y, TILE, TILE); }
  return true;
}

function pick(arr, tx, ty, s = 0) { return arr[Math.floor(hash2(tx, ty, 71 + s) * arr.length)]; }

function speckle(g, x, y, base, tx, ty, n, alpha, size = 2) {
  g.fillStyle = base;
  for (let k = 0; k < n; k++) {
    const h = hash2(tx * 31 + k, ty * 17 + k, 3), h2 = hash2(tx * 13 + k, ty * 29 + k, 5);
    g.globalAlpha = alpha * (0.4 + h * 0.6);
    g.fillRect(x + Math.floor(h * 30), y + Math.floor(h2 * 30), size, size);
  }
  g.globalAlpha = 1;
}

function drawTile(g, m, tx, ty, x, y) {
  const t = m.tileAt(tx, ty);
  const d = DISTRICTS[m.dist[ty * MAP_W + tx]];
  switch (t) {
    case T.ROAD: case T.BRIDGE: {
      tex(g, d.road, tx, ty, x, y) || (g.fillStyle = '#3a3b40', g.fillRect(x, y, TILE, TILE));
      if (t === T.BRIDGE) drawBridgeEdges(g, m, tx, ty, x, y);
      break;
    }
    case T.LOT:
      tex(g, d.road === 'asphalt_worn' ? 'asphalt_worn' : 'asphalt', tx, ty, x, y, 'rgba(70,70,78,.18)') || (g.fillStyle = '#45464b', g.fillRect(x, y, TILE, TILE));
      break;
    case T.SIDEWALK:
      tex(g, d.walk, tx, ty, x, y) || (g.fillStyle = '#a9a9a4', g.fillRect(x, y, TILE, TILE));
      break;
    case T.PLAZA:
      tex(g, d.plaza, tx, ty, x, y) || (g.fillStyle = '#8c6e5c', g.fillRect(x, y, TILE, TILE));
      break;
    case T.GRASS:
      if (tex(g, 'grass', tx, ty, x, y)) break;
      g.fillStyle = pick(C.grass, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#2f6a24', tx, ty, 12, 0.55);
      speckle(g, x, y, '#78b85a', tx, ty + 7, 7, 0.45);
      g.fillStyle = 'rgba(30,70,20,.35)';
      for (let k = 0; k < 3; k++) { const hx = hash2(tx, ty + k, 9) * 28, hy = hash2(tx + k, ty, 8) * 28; g.fillRect(x + hx, y + hy, 1, 3); g.fillRect(x + hx + 2, y + hy + 1, 1, 2); }
      break;
    case T.WATER: case T.DEEP:
      tex(g, t === T.DEEP ? 'deep' : 'water', tx, ty, x, y) || (g.fillStyle = '#1f5aa8', g.fillRect(x, y, TILE, TILE));
      drawShore(g, m, tx, ty, x, y);
      drawBridgeShadow(g, m, tx, ty, x, y);
      break;
    case T.SAND:
      if (tex(g, 'sand', tx, ty, x, y)) break;
      g.fillStyle = pick(C.sand, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#a88f5a', tx, ty, 10, 0.45, 1);
      speckle(g, x, y, '#fff3d0', tx, ty + 3, 5, 0.5, 1);
      break;
    case T.DOCK:
      g.fillStyle = pick(C.dock, tx, ty); g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let k = 0; k < 4; k++) g.fillRect(x, y + k * 8, TILE, 1);
      g.fillStyle = 'rgba(255,220,160,.14)'; for (let k = 0; k < 4; k++) g.fillRect(x, y + k * 8 + 1, TILE, 2);
      g.fillStyle = 'rgba(40,25,10,.6)'; g.fillRect(x + (hash2(tx, ty, 2) * 20 | 0), y + 3, 2, 2); g.fillRect(x + (hash2(tx, ty, 4) * 20 | 0) + 6, y + 19, 2, 2);
      break;
    case T.DIRT:
      if (tex(g, 'dirt', tx, ty, x, y)) break;
      g.fillStyle = pick(C.dirt, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#5a4428', tx, ty, 10, 0.45);
      break;
    case T.FIELD:
      g.fillStyle = pick(C.field, tx, ty, 2); g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(60,90,10,.55)';
      for (let k = 0; k < 4; k++) g.fillRect(x + k * 8 + 2, y, 3, TILE);
      g.fillStyle = 'rgba(200,220,80,.35)';
      for (let k = 0; k < 4; k++) g.fillRect(x + k * 8 + 3, y + (hash2(tx, ty + k, 4) * 24 | 0), 2, 4);
      break;
    case T.BUILDING:
      g.fillStyle = '#2a2a30'; g.fillRect(x, y, TILE, TILE);
      break;
    default:
      g.fillStyle = '#111'; g.fillRect(x, y, TILE, TILE);
  }
}

// Bridges read as raised decks: concrete walkway + railing (with posts) on every side over the
// water, a dark lip, and on the water below a visible side face plus a shadow (light from the
// north-west, so it falls south / east).
const isWet = (q) => q === T.WATER || q === T.DEEP;
export function drawBridgeEdges(g, m, tx, ty, x, y) {
  const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  for (const [dx, dy] of sides) {
    if (!isWet(m.tileAt(tx + dx, ty + dy))) continue;
    const horiz = dy !== 0;
    const along = horiz ? tx : ty;
    // walkway slab
    g.fillStyle = '#a3a5ab';
    if (horiz) g.fillRect(x, dy < 0 ? y : y + TILE - 8, TILE, 8); else g.fillRect(dx < 0 ? x : x + TILE - 8, y, 8, TILE);
    g.fillStyle = 'rgba(255,255,255,.18)';
    if (horiz) g.fillRect(x, dy < 0 ? y + 2 : y + TILE - 7, TILE, 1); else g.fillRect(dx < 0 ? x + 2 : x + TILE - 7, y, 1, TILE);
    // railing: rail line + posts every half tile
    g.fillStyle = '#3e4046';
    if (horiz) g.fillRect(x, dy < 0 ? y + 1 : y + TILE - 2, TILE, 1.5); else g.fillRect(dx < 0 ? x + 1 : x + TILE - 2, y, 1.5, TILE);
    for (let k = 0; k < 2; k++) {
      const o = k * 16 + 6;
      if (horiz) g.fillRect(x + o, dy < 0 ? y : y + TILE - 3, 2, 3); else g.fillRect(dx < 0 ? x : x + TILE - 3, y + o, 3, 2);
    }
    // inner curb against the roadway
    g.fillStyle = 'rgba(0,0,0,.35)';
    if (horiz) g.fillRect(x, dy < 0 ? y + 8 : y + TILE - 9, TILE, 1); else g.fillRect(dx < 0 ? x + 8 : x + TILE - 9, y, 1, TILE);
    // a lamp every few tiles
    if (along % 6 === 0) { g.fillStyle = '#26282d'; if (horiz) g.fillRect(x + 15, dy < 0 ? y + 2 : y + TILE - 6, 3, 4); else g.fillRect(dx < 0 ? x + 2 : x + TILE - 6, y + 15, 4, 3); }
  }
}
function drawBridgeShadow(g, m, tx, ty, x, y) {
  const n = m.tileAt(tx, ty - 1) === T.BRIDGE, w = m.tileAt(tx - 1, ty) === T.BRIDGE;
  const s = m.tileAt(tx, ty + 1) === T.BRIDGE, e = m.tileAt(tx + 1, ty) === T.BRIDGE;
  if (n) { // deck to the north: its side face, then its shadow on the water
    g.fillStyle = '#4c4e55'; g.fillRect(x, y, TILE, 5);
    g.fillStyle = '#2f3136'; g.fillRect(x, y + 5, TILE, 1);
    const gr = g.createLinearGradient(0, y + 6, 0, y + 26);
    gr.addColorStop(0, 'rgba(0,10,25,.5)'); gr.addColorStop(1, 'rgba(0,10,25,0)');
    g.fillStyle = gr; g.fillRect(x, y + 6, TILE, 20);
  }
  if (w) {
    g.fillStyle = '#4c4e55'; g.fillRect(x, y, 4, TILE);
    const gr = g.createLinearGradient(x + 4, 0, x + 20, 0);
    gr.addColorStop(0, 'rgba(0,10,25,.45)'); gr.addColorStop(1, 'rgba(0,10,25,0)');
    g.fillStyle = gr; g.fillRect(x + 4, y, 16, TILE);
  }
  if (s) { g.fillStyle = 'rgba(0,10,25,.22)'; g.fillRect(x, y + TILE - 4, TILE, 4); }
  if (e) { g.fillStyle = 'rgba(0,10,25,.22)'; g.fillRect(x + TILE - 3, y, 3, TILE); }
  // support piers peeking out from under the deck
  if ((n && tx % 7 === 0) || (w && ty % 7 === 0)) {
    g.fillStyle = '#6b6e75';
    if (n) g.fillRect(x + 10, y + 5, 12, 4); else g.fillRect(x + 4, y + 10, 4, 12);
  }
}

function drawShore(g, m, tx, ty, x, y) {
  const land = (a, b) => { const q = m.tileAt(a, b); return q !== T.WATER && q !== T.DEEP && q !== T.BRIDGE && q !== T.DOCK; };
  g.fillStyle = 'rgba(235,248,255,.6)';
  if (land(tx, ty - 1)) for (let k = 0; k < 4; k++) g.fillRect(x + k * 8 + (hash2(tx, k, 1) * 4 | 0), y + 1 + (k % 2), 6, 3);
  if (land(tx - 1, ty)) g.fillRect(x, y, 3, TILE);
  if (land(tx + 1, ty)) g.fillRect(x + TILE - 3, y, 3, TILE);
  if (m.tileAt(tx, ty) === T.WATER) { g.fillStyle = 'rgba(120,200,220,.12)'; if (land(tx, ty - 1) || land(tx - 1, ty) || land(tx + 1, ty)) g.fillRect(x, y, TILE, TILE); }
}

// Concrete curb strip on every sidewalk edge that meets asphalt.
function drawCurbs(g, m, tx0, ty0, n) {
  const road = (a, b) => { const q = m.tileAt(a, b); return q === T.ROAD || q === T.BRIDGE; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const tx = tx0 + i, ty = ty0 + j;
    const t = m.tileAt(tx, ty);
    if (t !== T.SIDEWALK && t !== T.PLAZA) continue;
    const x = tx * TILE, y = ty * TILE;
    const edge = (rx, ry, w, h) => { g.fillStyle = '#cfcdc4'; g.fillRect(rx, ry, w, h); g.fillStyle = 'rgba(0,0,0,.35)'; };
    if (road(tx, ty - 1)) { edge(x, y, TILE, 4); g.fillRect(x, y, TILE, 1); }
    if (road(tx, ty + 1)) { edge(x, y + TILE - 4, TILE, 4); g.fillRect(x, y + TILE - 1, TILE, 1); }
    if (road(tx - 1, ty)) { edge(x, y, 4, TILE); g.fillRect(x, y, 1, TILE); }
    if (road(tx + 1, ty)) { edge(x + TILE - 4, y, 4, TILE); g.fillRect(x + TILE - 1, y, 1, TILE); }
  }
}

function drawRoadMarkings(g, m, r, cx, cy) {
  if (r.width < 3 || r.kind === 'rural') return;
  const x0 = cx * CHUNK_PX - TILE, x1 = (cx + 1) * CHUNK_PX + TILE, y0 = cy * CHUNK_PX - TILE, y1 = (cy + 1) * CHUNK_PX + TILE;
  const across = r.axis === 'v' ? r.w : r.h;
  const start = r.axis === 'v' ? r.y : r.x, end = start + (r.axis === 'v' ? r.h : r.w);
  const c0 = r.axis === 'v' ? r.x : r.y; // first tile across the road
  const mid = (c0 + across / 2) * TILE;
  for (let s = start; s < end; s++) {
    const tx = r.axis === 'v' ? Math.floor(c0 + across / 2) : s, ty = r.axis === 'v' ? s : Math.floor(c0 + across / 2);
    if (m.roadAxis[ty * MAP_W + tx] === 3) continue;
    const t = m.tileAt(tx, ty);
    if (t !== T.ROAD && t !== T.BRIDGE) continue;
    const p = s * TILE;
    if (r.axis === 'v' ? (p < y0 || p > y1 || mid < x0 || mid > x1) : (p < x0 || p > x1 || mid < y0 || mid > y1)) continue;
    const line = (off, len, wid, col, o2 = 0) => {
      g.fillStyle = col;
      if (r.axis === 'v') g.fillRect(mid + off, p + o2, wid, len); else g.fillRect(p + o2, mid + off, len, wid);
    };
    if (r.width >= 4) {
      line(-4, TILE, 3, C.yellow); line(1, TILE, 3, C.yellow);
      const edgeOff = across * TILE / 2 - 7;
      line(-edgeOff, TILE, 2, 'rgba(230,228,220,.75)'); line(edgeOff - 2, TILE, 2, 'rgba(230,228,220,.75)');
      if (r.width >= 6 && s % 2 === 0) { line(-across * TILE / 4 - 1, 20, 3, C.white, 6); line(across * TILE / 4 - 2, 20, 3, C.white, 6); }
    } else if (s % 2 === 0) line(-1, 18, 3, 'rgba(230,228,220,.85)', 7);
  }
}

function drawCrosswalks(g, m, n) {
  if (n.island) return;
  g.fillStyle = 'rgba(236,234,226,.9)';
  for (const dir of Object.keys(n.links)) {
    const width = n.lane[dir] * 4;
    if (width < 128) continue;
    const half = n.half;
    if (dir === 'N' || dir === 'S') {
      const sy = dir === 'N' ? -1 : 1;
      const yy = n.y + sy * (half + 6) - (sy < 0 ? 22 : 0);
      for (let k = -width / 2 + 8; k < width / 2 - 8; k += 14) g.fillRect(n.x + k, yy, 8, 22);
    } else {
      const sx = dir === 'W' ? -1 : 1;
      const xx = n.x + sx * (half + 6) - (sx < 0 ? 22 : 0);
      for (let k = -width / 2 + 8; k < width / 2 - 8; k += 14) g.fillRect(xx, n.y + k, 22, 8);
    }
  }
}

function drawStall(g, s) {
  g.strokeStyle = 'rgba(240,240,230,.75)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(s.x + 1, s.y + 4); g.lineTo(s.x + 1, s.y + s.h - 4);
  g.moveTo(s.x + s.w - 1, s.y + 4); g.lineTo(s.x + s.w - 1, s.y + s.h - 4);
  g.stroke();
}

function drawPrefab(g, p) {
  const pf = PREFABS[p.key];
  const x = p.tx * TILE, y = p.ty * TILE, w = p.tw * TILE, h = p.th * TILE;
  if (!atlas.prefabs) { g.fillStyle = '#8a8278'; g.fillRect(x, y, w, h); return; }
  const [si, sx, sy, sw, sh] = pf.src;
  const img = atlas.prefabs[si];
  g.save();
  if (p.rot === 2) { g.translate(x + w, y + h); g.rotate(Math.PI); g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); }
  else g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  g.restore();
}

// ---------------------------------------------------------------------------
// Procedural flat roofs (GTA-style dense blocks): drop shadow, concrete parapet with bevel,
// roof surface by kind, rooftop equipment modules cut from the concept roof tiles, vents.
const ROOF = {
  tar: { base: '#58595d', rim: '#a9a6a0', speck: ['#67686c', '#4b4c50', '#727377'] },
  gravel: { base: '#626264', rim: '#b4b1aa', speck: ['#717173', '#545456', '#7e7d7a'] },
  metal: { base: '#5f7469', rim: '#8f9a94', speck: null },
  glass: { base: '#3f5a74', rim: '#9fa4ab', speck: null },
  tile: { base: '#9b5034', rim: '#7b3a24', speck: null },
};
const METAL_TINTS = ['#5f7469', '#6d6457', '#596a7d', '#7a5545', '#6f7270'];

// Under a lifted building: its floor (seen only while its walls fade, e.g. x-ray) and the
// shadow it throws away from the sun (top-left), a few px wide to the east and south.
function drawBuildingBase(g, r) {
  const x = r.tx * TILE, y = r.ty * TILE, w = r.tw * TILE, h = r.th * TILE;
  g.fillStyle = 'rgba(8,10,16,.34)';
  g.fillRect(x + w, y - 26, 14, h + 26); g.fillRect(x + 10, y + h, w + 4, 6);
  g.fillStyle = '#2b2c32'; g.fillRect(x, y, w, h);
  g.fillStyle = '#34353c'; for (let k = 0; k < w; k += 32) g.fillRect(x + k, y, 1, h);
}

export function drawRoof(g, r) {
  const x = r.tx * TILE, y = r.ty * TILE, w = r.tw * TILE, h = r.th * TILE;
  const rnd = mulberry32(r.seed);
  const pal = ROOF[r.kind] || ROOF.tar;
  const base = r.kind === 'metal' ? METAL_TINTS[r.seed % METAL_TINTS.length] : pal.base;
  // cast shadow onto the street (down-right)
  g.fillStyle = 'rgba(8,10,16,.38)';
  g.fillRect(x + 8, y + h, w, 8); g.fillRect(x + w, y + 8, 8, h);
  // body
  g.fillStyle = '#1a1b20'; g.fillRect(x, y, w, h);
  g.fillStyle = base; g.fillRect(x + 1, y + 1, w - 2, h - 2);
  const ix = x + 7, iy = y + 7, iw = w - 14, ih = h - 14;
  if (r.kind === 'metal') {
    // corrugated sheet along the long axis, a ridge cap in the middle
    const horiz = w >= h;
    for (let k = 0; k < (horiz ? ih : iw); k += 4) {
      g.fillStyle = shade(base, k % 8 < 4 ? 14 : -10);
      if (horiz) g.fillRect(x + 1, iy + k, w - 2, 2); else g.fillRect(ix + k, y + 1, 2, h - 2);
    }
    g.fillStyle = shade(base, -30);
    if (horiz) g.fillRect(x + 1, y + (h >> 1) - 2, w - 2, 4); else g.fillRect(x + (w >> 1) - 2, y + 1, 4, h - 2);
    for (let k = 0; k < 3 + (rnd() * 4 | 0); k++) { // skylight strips and rust patches
      g.fillStyle = rnd() < 0.5 ? 'rgba(170,210,230,.55)' : 'rgba(120,60,30,.35)';
      const sw = horiz ? 12 : 26, sh = horiz ? 26 : 12;
      g.fillRect(x + 10 + Math.floor(rnd() * Math.max(1, w - 20 - sw)), y + 10 + Math.floor(rnd() * Math.max(1, h - 20 - sh)), sw, sh);
    }
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + h - 4, w - 2, 3); g.fillRect(x + w - 4, y + 1, 3, h - 2);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 1, y + 1, w - 2, 2); g.fillRect(x + 1, y + 1, 2, h - 2);
    return;
  }
  if (r.kind === 'tile') {
    // pitched terracotta: two slopes, ridge, tile courses
    const horiz = w >= h;
    const half = horiz ? h >> 1 : w >> 1;
    g.fillStyle = shade(base, 18); horiz ? g.fillRect(x + 1, y + 1, w - 2, half - 1) : g.fillRect(x + 1, y + 1, half - 1, h - 2);
    g.fillStyle = shade(base, -16); horiz ? g.fillRect(x + 1, y + half, w - 2, h - half - 1) : g.fillRect(x + half, y + 1, w - half - 1, h - 2);
    g.fillStyle = shade(base, -42);
    for (let k = 6; k < (horiz ? h : w) - 2; k += 6) horiz ? g.fillRect(x + 1, y + k, w - 2, 1) : g.fillRect(x + k, y + 1, 1, h - 2);
    for (let k = 0; k < (horiz ? w : h); k += 10) for (let j = 3; j < (horiz ? h : w); j += 12)
      horiz ? g.fillRect(x + k + ((j / 6) & 1) * 5, y + j, 1, 5) : g.fillRect(x + j, y + k + ((j / 6) & 1) * 5, 5, 1);
    g.fillStyle = '#5a2414'; horiz ? g.fillRect(x + 1, y + half - 2, w - 2, 4) : g.fillRect(x + half - 2, y + 1, 4, h - 2);
    if (rnd() < 0.6) { // chimney
      const cx = x + 12 + Math.floor(rnd() * (w - 34)), cy = y + 10 + Math.floor(rnd() * (h - 30));
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(cx + 4, cy + 4, 12, 12);
      g.fillStyle = '#7d6e66'; g.fillRect(cx, cy, 12, 12); g.fillStyle = '#2a2420'; g.fillRect(cx + 3, cy + 3, 6, 6);
    }
    return;
  }
  // flat concrete-parapet roofs: tar / gravel / glass
  if (pal.speck) {
    for (let ty = 0; ty < h; ty += 8) for (let tx = 0; tx < w; tx += 8) {
      const hh = hash2(r.tx * 64 + tx, r.ty * 64 + ty, 17);
      if (hh < 0.45) continue;
      g.fillStyle = pal.speck[(hh * 30 | 0) % 3];
      g.fillRect(x + tx + ((hh * 97) | 0) % 6, y + ty + ((hh * 61) | 0) % 6, 2, 2);
    }
  } else { // glass curtain roof: panel grid + diagonal sheen
    for (let k = 16; k < iw; k += 16) { g.fillStyle = '#2a3c4e'; g.fillRect(ix + k, iy, 1, ih); }
    for (let k = 16; k < ih; k += 16) { g.fillStyle = '#2a3c4e'; g.fillRect(ix, iy + k, iw, 1); }
    g.save();
    g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
    g.fillStyle = 'rgba(190,225,255,.13)';
    g.beginPath();
    for (let k = -ih; k < iw; k += 48) { g.moveTo(ix + k, iy + ih); g.lineTo(ix + k + 16, iy + ih); g.lineTo(ix + k + 16 + ih, iy); g.lineTo(ix + k + ih, iy); g.closePath(); }
    g.fill();
    g.restore();
  }
  // parapet rim with bevel + inner shadow
  g.fillStyle = pal.rim;
  g.fillRect(x + 1, y + 1, w - 2, 6); g.fillRect(x + 1, y + h - 7, w - 2, 6); g.fillRect(x + 1, y + 1, 6, h - 2); g.fillRect(x + w - 7, y + 1, 6, h - 2);
  g.fillStyle = shade(pal.rim.length === 7 ? pal.rim : '#a9a6a0', 26); g.fillRect(x + 1, y + 1, w - 2, 2); g.fillRect(x + 1, y + 1, 2, h - 2);
  g.fillStyle = shade(pal.rim.length === 7 ? pal.rim : '#a9a6a0', -44); g.fillRect(x + 1, y + h - 3, w - 2, 2); g.fillRect(x + w - 3, y + 1, 2, h - 2);
  for (let k = x + 16; k < x + w - 8; k += 24) { g.fillRect(k, y + 1, 1, 6); g.fillRect(k, y + h - 7, 1, 6); } // coping joints
  g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(ix, iy, iw, 3); g.fillRect(ix, iy, 3, ih);
  // equipment modules from the concept roof tiles, placed on a coarse grid without overlap
  const mods = [];
  const big = iw >= 180 && ih >= 160;
  const wants = [];
  if (big && r.kind !== 'tar' && rnd() < 0.55) wants.push('heli');
  const pool = r.kind === 'glass' ? ['sky', 'ac', 'access'] : ['ac', 'tanks', 'access', 'sky', 'ac'];
  const n = Math.min(5, Math.floor((iw * ih) / 26000) + (rnd() < 0.6 ? 1 : 0));
  for (let k = 0; k < n; k++) wants.push(pool[Math.floor(rnd() * pool.length)]);
  for (const t of wants) {
    const s = PROP_SIZES['roof_' + t];
    if (!s || s[0] > iw - 6 || s[1] > ih - 6) continue;
    for (let tries = 0; tries < 8; tries++) {
      const mx = ix + 3 + Math.floor(rnd() * (iw - s[0] - 6)), my = iy + 3 + Math.floor(rnd() * (ih - s[1] - 6));
      if (mods.some((q) => mx < q[0] + q[2] + 4 && mx + s[0] + 4 > q[0] && my < q[1] + q[3] + 4 && my + s[1] + 4 > q[1])) continue;
      mods.push([mx, my, s[0], s[1]]);
      drawProp(g, { t: 'roof_' + t, x: mx + s[0] / 2, y: my + s[1] / 2 });
      break;
    }
  }
  // small vents / hatches in the gaps
  for (let k = 0; k < 2 + Math.floor((iw * ih) / 9000); k++) {
    const vx = ix + 4 + Math.floor(rnd() * (iw - 16)), vy = iy + 4 + Math.floor(rnd() * (ih - 16));
    if (mods.some((q) => vx < q[0] + q[2] && vx + 12 > q[0] && vy < q[1] + q[3] && vy + 12 > q[1])) continue;
    const big2 = rnd() < 0.3;
    const sz = big2 ? 14 : 8;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(vx + 2, vy + 2, sz, sz);
    g.fillStyle = '#9b9a96'; g.fillRect(vx, vy, sz, sz);
    g.fillStyle = '#3a3b3f'; g.fillRect(vx + 2, vy + 2, sz - 4, sz - 4);
    if (big2) { g.fillStyle = '#9b9a96'; for (let j = vy + 4; j < vy + sz - 2; j += 3) g.fillRect(vx + 2, j, sz - 4, 1); }
  }
}

// Night emissive layer of a lot (same geometry as drawPrefab), drawn additively after dark.
export function drawPrefabGlow(g, p) {
  const pf = PREFABS[p.key];
  const [si, sx, sy, sw, sh] = pf.src;
  const img = atlas.prefabGlow && atlas.prefabGlow[si];
  if (!img) return;
  const x = p.tx * TILE, y = p.ty * TILE, w = p.tw * TILE, h = p.th * TILE;
  if (p.rot === 2) { g.save(); g.translate(x + w, y + h); g.rotate(Math.PI); g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h); g.restore(); }
  else g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}


export function drawProp(g, p) {
  const fr = atlas.ready ? atlas.frames['prop_' + p.t] : null;
  if (fr) {
    const s = PROP_SIZES[p.t];
    g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, p.x - s[0] / 2, p.y - s[1] / 2, s[0], s[1]);
    return;
  }
  if (p.t === 'lamp') { drawLamp(g, p); return; }
  g.fillStyle = '#666'; g.fillRect(p.x - 6, p.y - 6, 12, 12);
}

export function drawOverheadProp(g, p, night) {
  if (p.broken) return;
  if (p.t === 'lamp') { p.night = night; drawProp(g, p); return; }
  drawProp(g, p);
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}

// ---- walk-in interiors ---------------------------------------------------------------------
// Each walk-in building gets its floor plan painted once (floor by business type, walls,
// partitions, the counter and some furnishings) into a cached canvas. The game shows it under a
// faded roof while you're inside, and puts the roof back over anyone inside when you're not.
const FLOOR_STYLE = {
  hospital: ['#e4ecee', '#d6e0e3'], police: ['#c9c4b6', '#bdb7a8'], bank: ['#d8cfb8', '#cabf9f'], courthouse: ['#b89a74', '#a98a64'],
  gunshop: ['#6b6258', '#5f564c'], sports: ['#a8c4a0', '#9ab894'], hardware: ['#a39a88', '#968d7b'], clothing: ['#d6c2c8', '#cab4bb'],
  grocery: ['#e3e0d2', '#d6d2c2'], pawn: ['#7a6a52', '#6c5c46'], pharmacy: ['#e6eef2', '#d8e2e8'], fence: ['#3a3438', '#2e292c'],
  fishmarket: ['#b9cfd6', '#aac2ca'], coffee: ['#8a6446', '#7c583c'], tackle: ['#9fb4a6', '#91a698'],
};
const DECOR = {
  gunshop: ['#2a2a30', '#5a4a3a'], sports: ['#c8262b', '#2350c8'], hardware: ['#ef7a1a', '#6a6e76'], clothing: ['#e04a9a', '#7a3ac8'],
  grocery: ['#2f9a3a', '#f2c21b'], pawn: ['#c8a040', '#8a6a3a'], pharmacy: ['#2f9a3a', '#e8e8e8'], fence: ['#7a1d24', '#444'],
  fishmarket: ['#25b8c0', '#e8e8e8'], coffee: ['#4a3020', '#c8a070'], tackle: ['#2f6a24', '#c8a040'], bank: ['#f2c21b', '#2a5a2a'],
  courthouse: ['#5a3a22', '#e8e2d0'], hospital: ['#c8262b', '#7fb8d0'], police: ['#1d3a8a', '#f2c21b'],
};
const artCache = new Map();
export function interiorArt(m, b) {
  let cv = artCache.get(b.id);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = b.tw * TILE; cv.height = b.th * TILE;
  const g = cv.getContext('2d');
  const ox = b.tx * TILE, oy = b.ty * TILE;
  for (let ty = b.ty; ty < b.ty + b.th; ty++) for (let tx = b.tx; tx < b.tx + b.tw; tx++) {
    const t = m.tileAt(tx, ty), x = tx * TILE - ox, y = ty * TILE - oy;
    const u = b.walkIn.units.find((q) => tx >= q.x0 - 1 && tx <= q.x1 + 1);
    const fs = FLOOR_STYLE[u ? u.kind : 'police'] || ['#ccc', '#bbb'];
    if (t === T.FLOOR || t === T.COUNTER) {
      g.fillStyle = (tx + ty) & 1 ? fs[0] : fs[1]; g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, y + TILE - 1, TILE, 1);
    } else { g.fillStyle = '#3a3a42'; g.fillRect(x, y, TILE, TILE); g.fillStyle = '#4c4c56'; g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4); }
  }
  for (const u of b.walkIn.units) {
    const dc = DECOR[u.kind] || ['#888', '#666'];
    const x0 = u.x0 * TILE - ox, x1 = (u.x1 + 1) * TILE - ox, cy = u.counterRow * TILE - oy;
    // counter: wood top, front panel, a till
    g.fillStyle = u.kind === 'pawn' || u.kind === 'bank' ? '#8fb8c8' : '#6b4a2a'; g.fillRect(x0, cy + 4, x1 - x0, TILE - 8);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x0, cy + 4, x1 - x0, 3);
    if (u.kind === 'pawn' || u.kind === 'bank') { g.strokeStyle = 'rgba(220,240,255,.8)'; g.lineWidth = 2; g.strokeRect(x0 + 2, cy + 6, x1 - x0 - 4, TILE - 12); } // security glass
    g.fillStyle = '#20232b'; g.fillRect((x0 + x1) / 2 + 10, cy + 8, 12, 10); g.fillStyle = '#7fd0ff'; g.fillRect((x0 + x1) / 2 + 12, cy + 10, 8, 5);
    // shelves / racks along the side walls, in the business's colours
    const back = b.walkIn.south ? b.walkIn.y0 : b.walkIn.y1, dir = b.walkIn.south ? 1 : -1;
    const custRows = [];
    for (let ty = u.counterRow + dir * 2; b.walkIn.south ? ty <= b.walkIn.y1 - 1 : ty >= b.walkIn.y0 + 1; ty += dir) custRows.push(ty);
    for (const ty of custRows) {
      const y = ty * TILE - oy;
      for (const [sx, k] of [[x0 + 3, 0], [x1 - 11, 1]]) {
        if (x1 - x0 < 3 * TILE) continue;
        g.fillStyle = '#4a3a2a'; g.fillRect(sx, y + 2, 8, TILE - 4);
        for (let k2 = 0; k2 < 3; k2++) { g.fillStyle = dc[(k + k2) & 1]; g.fillRect(sx + 1, y + 4 + k2 * 9, 6, 6); }
      }
    }
    // a staff area detail behind the counter
    const by = back * TILE - oy;
    g.fillStyle = dc[0]; g.fillRect(x0 + 4, by + 6, Math.min(40, x1 - x0 - 8), 8);
    g.fillStyle = dc[1]; g.fillRect(x1 - 26, by + 6, 20, 14);
    // floor logo / mat inside the door
    const dx = u.door.tx * TILE - ox, dy = (u.door.ty + (b.walkIn.south ? -1 : 1)) * TILE - oy;
    g.fillStyle = 'rgba(30,30,40,.35)'; g.fillRect(dx + 4, dy + 6, u.door.w * TILE - 8, TILE - 12);
  }
  artCache.set(b.id, cv);
  return cv;
}

// The building's roof art, clipped to its footprint (the lot in front stays as baked).
export function drawRoofClip(g, m, b, alpha = 1) {
  const p = m.prefabs[b.prefab];
  if (!p) return;
  g.save();
  g.beginPath(); g.rect(b.tx * TILE, b.ty * TILE, b.tw * TILE, b.th * TILE); g.clip();
  g.globalAlpha = alpha;
  drawPrefab(g, p);
  g.restore();
}

// Sliding glass doors: k = 0 closed .. 1 open.
export function drawShopDoor(g, u, south, k) {
  const x = u.door.tx * TILE, y = u.door.ty * TILE + (south ? TILE - 8 : 0), w = u.door.w * TILE;
  const pw = w / 2, slide = pw * 0.92 * k;
  g.fillStyle = '#2a2c31'; g.fillRect(x - 2, y - 1, w + 4, 10);
  g.fillStyle = 'rgba(160,210,235,.75)';
  g.fillRect(x - slide, y + 1, pw - 1, 6);
  g.fillRect(x + pw + 1 + slide, y + 1, pw - 1, 6);
  g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - slide + 3, y + 2, 4, 2); g.fillRect(x + pw + 4 + slide, y + 2, 4, 2);
}
