// Ground layer: the deterministic city is baked into 768x768 chunk canvases on demand
// (LRU-cached) using textures and building lots cut from the concept art: asphalt, worn
// asphalt, concrete/brick/slate sidewalks, water; building prefabs; road markings, curbs,
// crosswalks, parking stalls and low street props.
import { T, TILE, CHUNK_PX, MAP_W, MAP_H } from '../../shared/constants.js';
import { hash2 } from '../../shared/rng.js';
import { DISTRICTS } from '../../shared/map.js';
import { PREFABS, GROUND_TEX, PROP_SIZES } from '../../shared/prefab-data.js';
import { atlas } from './sprites.js';

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
    this.prefabs = this.byChunk(map.prefabs, (p) => [p.tx * TILE, p.ty * TILE, (p.tx + p.tw) * TILE, (p.ty + p.th) * TILE]);
    this.stalls = this.byChunk(map.stalls, (s) => [s.x, s.y, s.x + s.w, s.y + s.h]);
    this.signs = this.byChunk(map.buildings.filter((b) => b.signs && b.signs.length), (b) => [b.tx * TILE, b.ty * TILE, (b.tx + b.tw) * TILE, (b.ty + b.th) * TILE]);
    this.roads = this.byChunk(map.roads, (r) => [r.x * TILE, r.y * TILE, (r.x + r.w) * TILE, (r.y + r.h) * TILE]);
    this.nodes = this.byChunk(map.nodes, (n) => [n.x - 200, n.y - 200, n.x + 200, n.y + 200]);
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
    for (const s of this.stalls.get(k) || []) drawStall(g, s);
    for (const p of this.prefabs.get(k) || []) drawPrefab(g, p);
    for (const b of this.signs.get(k) || []) for (const s of b.signs) drawSign(g, s);
    for (const p of this.lowProps.get(k) || []) drawProp(g, p);
    g.restore();
    return cv;
  }
}

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
      if (t === T.BRIDGE) {
        const up = m.tileAt(tx, ty - 1) !== T.BRIDGE && m.tileAt(tx, ty - 1) !== T.ROAD;
        const down = m.tileAt(tx, ty + 1) !== T.BRIDGE && m.tileAt(tx, ty + 1) !== T.ROAD;
        g.fillStyle = '#9a9ca3';
        if (up) g.fillRect(x, y, TILE, 6);
        if (down) g.fillRect(x, y + TILE - 6, TILE, 6);
        g.fillStyle = '#55575e';
        if (up) { g.fillRect(x, y + 5, TILE, 1); if (tx % 2 === 0) g.fillRect(x + 12, y, 5, 8); }
        if (down) { g.fillRect(x, y + TILE - 6, TILE, 1); if (tx % 2 === 0) g.fillRect(x + 12, y + TILE - 8, 5, 8); }
      }
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
      g.fillStyle = pick(C.grass, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#2f6a24', tx, ty, 12, 0.55);
      speckle(g, x, y, '#78b85a', tx, ty + 7, 7, 0.45);
      g.fillStyle = 'rgba(30,70,20,.35)';
      for (let k = 0; k < 3; k++) { const hx = hash2(tx, ty + k, 9) * 28, hy = hash2(tx + k, ty, 8) * 28; g.fillRect(x + hx, y + hy, 1, 3); g.fillRect(x + hx + 2, y + hy + 1, 1, 2); }
      break;
    case T.WATER: case T.DEEP:
      tex(g, t === T.DEEP ? 'deep' : 'water', tx, ty, x, y) || (g.fillStyle = '#1f5aa8', g.fillRect(x, y, TILE, TILE));
      drawShore(g, m, tx, ty, x, y);
      break;
    case T.SAND:
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
  const [sx, sy, sw, sh] = pf.src;
  g.save();
  if (p.rot === 2) { g.translate(x + w, y + h); g.rotate(Math.PI); g.drawImage(atlas.prefabs, sx, sy, sw, sh, 0, 0, w, h); }
  else g.drawImage(atlas.prefabs, sx, sy, sw, sh, x, y, w, h);
  g.restore();
}

function drawSign(g, s) {
  g.font = 'bold 12px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = g.measureText(s.text).width + 12;
  g.fillStyle = 'rgba(10,12,20,.85)'; g.fillRect(s.x - tw / 2, s.y - 9, tw, 18);
  g.strokeStyle = '#ffd36b'; g.lineWidth = 1; g.strokeRect(s.x - tw / 2 + 0.5, s.y - 8.5, tw - 1, 17);
  g.fillStyle = '#fff'; g.fillText(s.text, s.x, s.y + 1);
}

export function drawProp(g, p) {
  const fr = atlas.ready ? atlas.frames['prop_' + p.t] : null;
  if (fr) {
    const s = PROP_SIZES[p.t];
    g.drawImage(atlas.imgs[fr.a], fr.x, fr.y, fr.w, fr.h, p.x - s[0] / 2, p.y - s[1] / 2, s[0], s[1]);
    return;
  }
  if (p.t === 'lamp') {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(p.x + 3, p.y + 3, 5, 0, 6.28); g.fill();
    g.fillStyle = '#2b2f38'; g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.28); g.fill();
    g.fillStyle = p.night ? '#fff2b0' : '#9aa0aa'; g.beginPath(); g.arc(p.x, p.y, 3, 0, 6.28); g.fill();
    return;
  }
  g.fillStyle = '#666'; g.fillRect(p.x - 6, p.y - 6, 12, 12);
}

export function drawOverheadProp(g, p, night) {
  if (p.t === 'lamp') { p.night = night; drawProp(g, p); return; }
  drawProp(g, p);
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}
