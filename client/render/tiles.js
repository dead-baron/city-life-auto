// Ground layer: the deterministic city map is baked into 768x768 chunk canvases on demand
// (LRU-cached) — asphalt, lane markings, crosswalks, sidewalks, plazas, lots, grass, water,
// sand, docks, fields, rooftops with business signage and low street props.
import { T, TILE, CHUNK_PX, MAP_W, MAP_H } from '../../shared/constants.js';
import { hash2 } from '../../shared/rng.js';
import { ROAD_X, ROAD_Y, ROAD_W } from '../../shared/map.js';

const C = {
  asphalt: ['#3a3b40', '#36373c', '#3e3f44', '#333439'],
  lot: ['#45464b', '#424348', '#48494e'],
  sidewalk: ['#a9a9a4', '#b1b1ab', '#a3a39e'],
  curb: '#d4d4cc',
  plaza: ['#8c6e5c', '#7f6352', '#94745f'],
  grass: ['#4c8a3a', '#468234', '#529140', '#3f7a30'],
  water: ['#1f5aa8', '#1d55a0', '#2360b0'],
  deep: ['#163f86', '#143a7e', '#18448e'],
  sand: ['#d9c38c', '#d2bb83', '#e0ca94'],
  dock: ['#8a5c34', '#7d522e', '#93633a'],
  dirt: ['#8a6a44', '#806040', '#93714a'],
  field: ['#7a9a2e', '#86a634', '#6e8e28'],
  yellow: '#e8b923', white: '#e8e8e2',
};

export class GroundCache {
  constructor(map, maxChunks = 24) {
    this.map = map;
    this.max = maxChunks;
    this.cache = new Map();
    this.propsByChunk = new Map();
    this.overheadByChunk = new Map();
    for (const p of map.props) {
      const k = this.key(Math.floor(p.x / CHUNK_PX), Math.floor(p.y / CHUNK_PX));
      const tall = p.t === 'tree' || p.t === 'palm' || p.t === 'lamp';
      const target = tall ? this.overheadByChunk : this.propsByChunk;
      if (!target.has(k)) target.set(k, []);
      target.get(k).push(p);
    }
    this.buildingsByChunk = new Map();
    for (const b of map.buildings) {
      const x0 = Math.floor(b.tx * TILE / CHUNK_PX), x1 = Math.floor((b.tx + b.tw) * TILE / CHUNK_PX);
      const y0 = Math.floor(b.ty * TILE / CHUNK_PX), y1 = Math.floor((b.ty + b.th) * TILE / CHUNK_PX);
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        if (!this.buildingsByChunk.has(k)) this.buildingsByChunk.set(k, []);
        this.buildingsByChunk.get(k).push(b);
      }
    }
    this.parkingByChunk = new Map();
    for (const s of map.parking) {
      const k = this.key(Math.floor(s.x / CHUNK_PX), Math.floor(s.y / CHUNK_PX));
      if (!this.parkingByChunk.has(k)) this.parkingByChunk.set(k, []);
      this.parkingByChunk.get(k).push(s);
    }
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
  overhead(cx, cy) { return this.overheadByChunk.get(this.key(cx, cy)) || []; }

  bake(cx, cy) {
    const cv = document.createElement('canvas');
    cv.width = CHUNK_PX; cv.height = CHUNK_PX;
    const g = cv.getContext('2d');
    const m = this.map;
    const tx0 = cx * (CHUNK_PX / TILE), ty0 = cy * (CHUNK_PX / TILE);
    const n = CHUNK_PX / TILE;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = tx0 + i, ty = ty0 + j;
      if (tx >= MAP_W || ty >= MAP_H) { g.fillStyle = '#000'; g.fillRect(i * TILE, j * TILE, TILE, TILE); continue; }
      drawTile(g, m, tx, ty, i * TILE, j * TILE);
    }
    g.save();
    g.translate(-cx * CHUNK_PX, -cy * CHUNK_PX);
    drawRoadMarkings(g, m, cx, cy);
    for (const s of this.parkingByChunk.get(this.key(cx, cy)) || []) drawStall(g, s);
    for (const b of this.buildingsByChunk.get(this.key(cx, cy)) || []) drawBuilding(g, b);
    for (const p of this.propsByChunk.get(this.key(cx, cy)) || []) drawLowProp(g, p);
    g.restore();
    return cv;
  }
}

function pick(arr, tx, ty, s = 0) { return arr[Math.floor(hash2(tx, ty, 71 + s) * arr.length)]; }

function speckle(g, x, y, base, tx, ty, n, alpha, size = 2) {
  g.fillStyle = base;
  for (let k = 0; k < n; k++) {
    const h = hash2(tx * 31 + k, ty * 17 + k, 3);
    const h2 = hash2(tx * 13 + k, ty * 29 + k, 5);
    g.globalAlpha = alpha * (0.4 + h * 0.6);
    g.fillRect(x + Math.floor(h * 30), y + Math.floor(h2 * 30), size, size);
  }
  g.globalAlpha = 1;
}

function drawTile(g, m, tx, ty, x, y) {
  const t = m.tileAt(tx, ty);
  switch (t) {
    case T.ROAD: case T.BRIDGE:
      g.fillStyle = pick(C.asphalt, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#000', tx, ty, 6, 0.25);
      speckle(g, x, y, '#777', tx, ty + 99, 4, 0.25, 1);
      if (hash2(tx, ty, 9) < 0.03) { g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 16, y + 16, 7, 5, 0.5, 0, 6.28); g.fill(); }
      if (t === T.BRIDGE) {
        const up = m.tileAt(tx, ty - 1) !== T.BRIDGE, down = m.tileAt(tx, ty + 1) !== T.BRIDGE;
        g.fillStyle = '#8d8f96';
        if (up) g.fillRect(x, y, TILE, 5);
        if (down) g.fillRect(x, y + TILE - 5, TILE, 5);
        g.fillStyle = '#5b5d63';
        if (up && tx % 2 === 0) g.fillRect(x + 12, y, 4, 7);
        if (down && tx % 2 === 0) g.fillRect(x + 12, y + TILE - 7, 4, 7);
      }
      break;
    case T.LOT:
      g.fillStyle = pick(C.lot, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#000', tx, ty, 4, 0.2);
      break;
    case T.SIDEWALK: {
      g.fillStyle = pick(C.sidewalk, tx, ty); g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y, TILE, 1); g.fillRect(x, y, 1, TILE);
      speckle(g, x, y, '#000', tx, ty, 3, 0.12, 1);
      // curbs where sidewalk meets road
      g.fillStyle = C.curb;
      const road = (a, b) => { const q = m.tileAt(a, b); return q === T.ROAD || q === T.BRIDGE; };
      if (road(tx, ty - 1)) g.fillRect(x, y, TILE, 3);
      if (road(tx, ty + 1)) g.fillRect(x, y + TILE - 3, TILE, 3);
      if (road(tx - 1, ty)) g.fillRect(x, y, 3, TILE);
      if (road(tx + 1, ty)) g.fillRect(x + TILE - 3, y, 3, TILE);
      if (hash2(tx, ty, 11) < 0.04) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.moveTo(x + 4, y + 6); g.lineTo(x + 14, y + 13); g.lineTo(x + 20, y + 11); g.stroke(); }
      break;
    }
    case T.PLAZA: {
      g.fillStyle = pick(C.plaza, tx, ty); g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,.18)';
      for (let r = 0; r < 4; r++) { g.fillRect(x, y + r * 8, TILE, 1); g.fillRect(x + ((r % 2) * 8) + 0, y + r * 8, 1, 8); g.fillRect(x + ((r % 2) * 8) + 16, y + r * 8, 1, 8); }
      break;
    }
    case T.GRASS:
      g.fillStyle = pick(C.grass, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#2f6a24', tx, ty, 10, 0.5);
      speckle(g, x, y, '#6aa84e', tx, ty + 7, 6, 0.4);
      break;
    case T.WATER: case T.DEEP: {
      g.fillStyle = pick(t === T.DEEP ? C.deep : C.water, tx, ty); g.fillRect(x, y, TILE, TILE);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
      const o = Math.floor(hash2(tx, ty, 21) * 16);
      g.beginPath(); g.moveTo(x + o, y + 10); g.quadraticCurveTo(x + o + 6, y + 6, x + o + 12, y + 10); g.stroke();
      // foam next to sand/land
      const land = (a, b) => { const q = m.tileAt(a, b); return q !== T.WATER && q !== T.DEEP && q !== T.BRIDGE && q !== T.DOCK; };
      g.fillStyle = 'rgba(255,255,255,.55)';
      if (land(tx, ty - 1)) { for (let k = 0; k < 4; k++) g.fillRect(x + k * 8 + (hash2(tx, k, 1) * 4 | 0), y + 1, 6, 2); }
      if (land(tx - 1, ty)) g.fillRect(x, y, 2, TILE);
      if (land(tx + 1, ty)) g.fillRect(x + TILE - 2, y, 2, TILE);
      break;
    }
    case T.SAND:
      g.fillStyle = pick(C.sand, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#a88f5a', tx, ty, 8, 0.4, 1);
      break;
    case T.DOCK:
      g.fillStyle = pick(C.dock, tx, ty); g.fillRect(x, y, TILE, TILE);
      g.fillStyle = 'rgba(0,0,0,.3)';
      for (let k = 0; k < 4; k++) g.fillRect(x, y + k * 8, TILE, 1);
      g.fillStyle = 'rgba(255,220,160,.12)'; g.fillRect(x, y + 1, TILE, 2);
      break;
    case T.DIRT:
      g.fillStyle = pick(C.dirt, tx, ty); g.fillRect(x, y, TILE, TILE);
      speckle(g, x, y, '#5a4428', tx, ty, 8, 0.4);
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

function drawRoadMarkings(g, m, cx, cy) {
  const x0 = cx * CHUNK_PX - 200, x1 = (cx + 1) * CHUNK_PX + 200, y0 = cy * CHUNK_PX - 200, y1 = (cy + 1) * CHUNK_PX + 200;
  const lastX = ROAD_X[ROAD_X.length - 1], lastY = ROAD_Y[ROAD_Y.length - 1];
  const isInter = (tx, ty) => ROAD_X.some((r) => tx >= r && tx < r + ROAD_W) && ROAD_Y.some((r) => ty >= r && ty < r + ROAD_W);
  // vertical roads: center double yellow, skip intersections
  for (const rx of ROAD_X) {
    const cxp = (rx + 2) * TILE;
    if (cxp < x0 || cxp > x1) continue;
    for (let ty = ROAD_Y[0]; ty < lastY + ROAD_W; ty++) {
      if (isInter(rx, ty)) continue;
      const y = ty * TILE;
      if (y < y0 || y > y1) continue;
      g.fillStyle = C.yellow; g.fillRect(cxp - 3, y, 2, TILE); g.fillRect(cxp + 1, y, 2, TILE);
      g.fillStyle = 'rgba(232,232,226,.85)';
      if (ty % 2 === 0) { g.fillRect(rx * TILE + 3, y + 4, 2, 20); g.fillRect((rx + ROAD_W) * TILE - 5, y + 4, 2, 20); }
    }
  }
  for (const ry of ROAD_Y) {
    const cyp = (ry + 2) * TILE;
    if (cyp < y0 || cyp > y1) continue;
    for (let tx = ROAD_X[0]; tx < 204; tx++) {
      const tt = m.tileAt(tx, ry + 1);
      if (tt !== T.ROAD && tt !== T.BRIDGE) continue;
      if (isInter(tx, ry)) continue;
      const x = tx * TILE;
      if (x < x0 || x > x1) continue;
      g.fillStyle = C.yellow; g.fillRect(x, cyp - 3, TILE, 2); g.fillRect(x, cyp + 1, TILE, 2);
      g.fillStyle = 'rgba(232,232,226,.85)';
      if (tx % 2 === 0) { g.fillRect(x + 4, ry * TILE + 3, 20, 2); g.fillRect(x + 4, (ry + ROAD_W) * TILE - 5, 20, 2); }
    }
  }
  // crosswalks + stop lines around each intersection
  for (const n of m.nodes) {
    if (n.island) continue;
    if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
    const h = ROAD_W * TILE / 2;
    g.fillStyle = 'rgba(236,236,230,.88)';
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const tx = Math.floor((n.x + dx * (h + 16)) / TILE), ty = Math.floor((n.y + dy * (h + 16)) / TILE);
      const tt = m.tileAt(tx, ty);
      if (tt !== T.ROAD) continue;
      if (dx === 0) {
        const yy = n.y + dy * (h + 6) - (dy < 0 ? 18 : 0);
        for (let k = -h + 4; k < h - 4; k += 12) g.fillRect(n.x + k, yy, 7, 18);
      } else {
        const xx = n.x + dx * (h + 6) - (dx < 0 ? 18 : 0);
        for (let k = -h + 4; k < h - 4; k += 12) g.fillRect(xx, n.y + k, 18, 7);
      }
    }
  }
  void lastX;
}

function drawStall(g, s) {
  g.strokeStyle = 'rgba(240,240,230,.7)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(s.x - 32, s.y - 60); g.lineTo(s.x - 32, s.y + 60);
  g.moveTo(s.x + 32, s.y - 60); g.lineTo(s.x + 32, s.y + 60);
  g.stroke();
}

const ROOF = {
  hospital: ['#e8e6df', '#c9c6bd'], police: ['#5b6170', '#454a57'], bank: ['#cfc4a8', '#b3a88c'], courthouse: ['#c9c2b0', '#aaa290'],
  gunshop: ['#5d5348', '#493f35'], pawn: ['#6b5a46', '#544636'], sports: ['#5f6b7c', '#4a5564'], hardware: ['#6a6a5a', '#545446'],
  pharmacy: ['#d9dde2', '#bcc1c8'], coffee: ['#6b4a3a', '#55392c'], garage: ['#575c66', '#454950'], clothing: ['#7a6a80', '#615366'],
  dealer: ['#a8adb5', '#8d939b'], warehouse: ['#7d8590', '#68707a'], warehouse_ind: ['#6d737c', '#5a6068'], fence: ['#4b4440', '#3a3431'],
  grocery: ['#b8bcc0', '#9ea3a8'], fishmarket: ['#5a7a8a', '#486473'], farm: ['#8a4a32', '#713b28'], barn: ['#9a3a2a', '#7c2e22'],
  tower: ['#7e8590', '#6a7079'], shop: ['#8a8278', '#736c63'], kiosk: ['#c9a36a', '#a98853'], marina: ['#d4d7da', '#b8bcc0'],
  construction: ['#6b5a40', '#544630'], house: ['#3e4a5e', '#2f394a'], house2: ['#8a3e2e', '#6e3124'],
};
const AWNING = { hospital: '#c8262b', police: '#1d3a8a', bank: '#2f6a3a', gunshop: '#8a2a1a', pawn: '#c99a1a', sports: '#2350c8', hardware: '#ef7a1a', pharmacy: '#2f9a3a', coffee: '#7a4a2a', garage: '#e8b923', clothing: '#c83a9a', dealer: '#c8262b', fence: '#552255', grocery: '#2f9a3a', fishmarket: '#25b8c0', shop: '#c8262b', kiosk: '#e04a9a', marina: '#2350c8', courthouse: '#5a4a2a', warehouse: '#555' };

function drawBuilding(g, b) {
  const x = b.tx * TILE, y = b.ty * TILE, w = b.tw * TILE, h = b.th * TILE;
  const [c1, c2] = ROOF[b.kind] || ['#777', '#666'];
  // drop shadow (pseudo-height)
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 6, y + 6, w, h);
  if (b.kind === 'house' || b.kind === 'house2' || b.kind === 'barn' || b.kind === 'farm') {
    // hip roof
    g.fillStyle = c1; g.fillRect(x, y, w, h);
    const ridge = Math.min(w, h) / 2;
    g.fillStyle = shade(c1, -18);
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + ridge, y + h - ridge); g.lineTo(x + w - ridge, y + h - ridge); g.lineTo(x + w, y + h); g.fill();
    g.fillStyle = shade(c1, 14);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ridge, y + ridge); g.lineTo(x + w - ridge, y + ridge); g.lineTo(x + w, y); g.fill();
    g.fillStyle = shade(c1, -8);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + ridge, y + ridge); g.lineTo(x + ridge, y + h - ridge); g.lineTo(x, y + h); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
    for (let k = 6; k < h; k += 6) { g.beginPath(); g.moveTo(x, y + k); g.lineTo(x + w, y + k); g.stroke(); }
    g.strokeStyle = shade(c1, 35); g.lineWidth = 2;
    g.beginPath(); g.moveTo(x + ridge, y + ridge); g.lineTo(x + w - ridge, y + h - ridge > y + ridge ? y + ridge : y + ridge); g.stroke();
    g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    if (b.kind === 'farm' || b.kind === 'barn') sign(g, b, x, y, w, h);
    return;
  }
  if (b.kind === 'construction') {
    g.fillStyle = '#6a5235'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#3a2e1e'; g.lineWidth = 3;
    for (let k = 0; k <= w; k += 32) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + h); g.stroke(); }
    for (let k = 0; k <= h; k += 32) { g.beginPath(); g.moveTo(x, y + k); g.lineTo(x + w, y + k); g.stroke(); }
    g.strokeStyle = '#e8b923'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(x + 10, y + h - 20); g.lineTo(x + w + 90, y + 20); g.stroke();
    g.fillStyle = '#e8b923'; g.fillRect(x + 4, y + h - 30, 22, 22);
    return;
  }
  // flat roof with parapet
  g.fillStyle = c2; g.fillRect(x, y, w, h);
  g.fillStyle = c1; g.fillRect(x + 6, y + 6, w - 12, h - 12);
  g.fillStyle = 'rgba(0,0,0,.08)';
  for (let k = 0; k < 40; k++) { const hx = hash2(b.id, k, 3), hy = hash2(k, b.id, 4); g.fillRect(x + 8 + hx * (w - 20), y + 8 + hy * (h - 20), 3, 3); }
  g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
  // rooftop equipment
  const n = Math.max(1, Math.floor((w * h) / 9000));
  for (let k = 0; k < n; k++) {
    const ax = x + 14 + hash2(b.id, k, 7) * (w - 60), ay = y + 14 + hash2(k, b.id, 8) * (h - 70);
    acUnit(g, ax, ay, hash2(b.id, k, 9) < 0.5);
  }
  if (b.kind === 'hospital') { g.fillStyle = '#c8262b'; g.fillRect(x + w / 2 - 6, y + h / 2 - 22, 12, 44); g.fillRect(x + w / 2 - 22, y + h / 2 - 6, 44, 12); }
  if (b.kind === 'police') {
    g.strokeStyle = '#e8b923'; g.lineWidth = 4; g.beginPath(); g.arc(x + w / 2, y + h / 2, 34, 0, 6.28); g.stroke();
    g.fillStyle = '#e8b923'; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', x + w / 2, y + h / 2 + 2);
  }
  if (b.kind === 'tower' || b.kind === 'bank') {
    g.fillStyle = '#3a6a9a'; const sw = Math.min(70, w / 3); g.fillRect(x + w / 2 - sw / 2, y + h / 2 - sw / 2, sw, sw);
    g.strokeStyle = '#9fd3ff'; g.lineWidth = 1; for (let k = 0; k < sw; k += 10) { g.beginPath(); g.moveTo(x + w / 2 - sw / 2 + k, y + h / 2 - sw / 2); g.lineTo(x + w / 2 - sw / 2 + k, y + h / 2 + sw / 2); g.stroke(); }
  }
  if (b.kind === 'warehouse' || b.kind === 'warehouse_ind') {
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
    for (let k = 12; k < w; k += 12) { g.beginPath(); g.moveTo(x + k, y + 6); g.lineTo(x + k, y + h - 6); g.stroke(); }
    g.fillStyle = '#d8e0e8'; for (let k = 0; k < 3; k++) g.fillRect(x + w * (k + 1) / 4 - 8, y + h / 2 - 20, 16, 40);
  }
  sign(g, b, x, y, w, h);
}

function sign(g, b, x, y, w, h) {
  const aw = AWNING[b.business || b.kind];
  if (aw && b.door) {
    // striped awning on the south face over the door
    const ax = (b.door.tx - 1) * TILE, ay = y + h - 10;
    for (let k = 0; k < 6; k++) { g.fillStyle = k % 2 ? '#f4f4f4' : aw; g.fillRect(ax + k * 16, ay, 16, 12); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(ax, ay + 12, 96, 3);
  }
  if (!b.name || b.kind === 'house' || b.kind === 'house2' || b.name === 'Residence') return;
  const fs = w > 260 ? 14 : 11;
  g.font = `bold ${fs}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const tw = Math.min(w - 12, g.measureText(b.name).width + 12);
  const sx = x + w / 2, sy = y + h - 26;
  g.fillStyle = 'rgba(10,12,20,.82)'; g.fillRect(sx - tw / 2, sy - fs / 2 - 4, tw, fs + 8);
  g.fillStyle = aw ? '#fff' : '#ffd36b';
  g.fillText(b.name, sx, sy, w - 16);
}

function acUnit(g, x, y, big) {
  const s = big ? 34 : 22;
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 3, y + 3, s, s * 0.7);
  g.fillStyle = '#c8cbd0'; g.fillRect(x, y, s, s * 0.7);
  g.fillStyle = '#555'; g.beginPath(); g.arc(x + s / 2, y + s * 0.35, s * 0.25, 0, 6.28); g.fill();
  g.strokeStyle = '#888'; g.lineWidth = 1; g.beginPath(); g.moveTo(x + s / 2 - s * 0.2, y + s * 0.35); g.lineTo(x + s / 2 + s * 0.2, y + s * 0.35); g.stroke();
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt)), gg = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt)), b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${gg},${b})`;
}

function drawLowProp(g, p) {
  const { x, y } = p;
  switch (p.t) {
    case 'hydrant': g.fillStyle = '#000'; g.beginPath(); g.arc(x + 1, y + 1, 6, 0, 6.28); g.fill(); g.fillStyle = '#d02a2a'; g.beginPath(); g.arc(x, y, 5, 0, 6.28); g.fill(); g.fillStyle = '#ff8080'; g.fillRect(x - 2, y - 2, 2, 2); break;
    case 'bench': g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 18, y - 5, 38, 12); g.fillStyle = '#7a4a24'; g.fillRect(x - 20, y - 7, 40, 10); g.fillStyle = '#5a3416'; g.fillRect(x - 20, y - 3, 40, 2); break;
    case 'fountain':
      g.fillStyle = '#8a8a90'; g.beginPath(); g.arc(x, y, 32, 0, 6.28); g.fill();
      g.fillStyle = '#2a7ad0'; g.beginPath(); g.arc(x, y, 26, 0, 6.28); g.fill();
      g.fillStyle = '#9fd3ff'; g.beginPath(); g.arc(x, y, 8, 0, 6.28); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(x, y, 16, 0, 6.28); g.stroke(); break;
    case 'cone': g.fillStyle = '#ef7a1a'; g.beginPath(); g.moveTo(x - 7, y + 7); g.lineTo(x + 7, y + 7); g.lineTo(x, y - 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(x - 3, y, 6, 2); break;
    case 'crates': for (let k = 0; k < 3; k++) { const cx = x + (k % 2) * 22 - 11, cy = y + (k > 1 ? -20 : 0); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(cx - 9, cy - 7, 22, 20); g.fillStyle = '#9a6a3a'; g.fillRect(cx - 11, cy - 10, 22, 20); g.strokeStyle = '#5a3a1a'; g.lineWidth = 2; g.strokeRect(cx - 10, cy - 9, 20, 18); g.beginPath(); g.moveTo(cx - 10, cy - 9); g.lineTo(cx + 10, cy + 9); g.stroke(); } break;
    case 'planter': g.fillStyle = '#6a6a70'; g.fillRect(x - 14, y - 10, 28, 20); g.fillStyle = '#3f7a30'; g.beginPath(); g.arc(x, y, 10, 0, 6.28); g.fill(); g.fillStyle = '#e04a9a'; g.fillRect(x - 3, y - 4, 3, 3); g.fillRect(x + 3, y + 2, 3, 3); break;
    case 'atm': g.fillStyle = '#2a2a30'; g.fillRect(x - 10, y - 8, 20, 16); g.fillStyle = '#2f9a3a'; g.fillRect(x - 7, y - 5, 14, 7); break;
    case 'vending': g.fillStyle = '#c8262b'; g.fillRect(x - 12, y - 10, 24, 20); g.fillStyle = '#fff'; g.font = 'bold 7px monospace'; g.textAlign = 'center'; g.fillText('COLA', x, y + 3); break;
    default: break;
  }
}

// Tall props drawn every frame above vehicles and pedestrians.
export function drawOverheadProp(g, p, night) {
  const { x, y } = p;
  if (p.t === 'tree') {
    const r = 18 + hash2(x | 0, y | 0, 2) * 6;
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.arc(x + 6, y + 6, r, 0, 6.28); g.fill();
    g.fillStyle = '#2d6a25'; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill();
    g.fillStyle = '#3f8a30'; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.25, r * 0.7, 0, 6.28); g.fill();
    g.fillStyle = '#5aa844'; g.beginPath(); g.arc(x - r * 0.4, y - r * 0.4, r * 0.35, 0, 6.28); g.fill();
  } else if (p.t === 'palm') {
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 6, y + 6, 18, 0, 6.28); g.fill();
    g.strokeStyle = '#2f8a3a'; g.lineWidth = 5; g.lineCap = 'round';
    for (let k = 0; k < 7; k++) { const a = k * 0.9 + (x % 3); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12 - 3, x + Math.cos(a) * 21, y + Math.sin(a) * 21); g.stroke(); }
    g.fillStyle = '#8a6a3a'; g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill();
    g.lineCap = 'butt';
  } else if (p.t === 'lamp') {
    g.fillStyle = '#222'; g.beginPath(); g.arc(x, y, 4, 0, 6.28); g.fill();
    g.fillStyle = night ? '#fff2b0' : '#888'; g.beginPath(); g.arc(x, y, 2.5, 0, 6.28); g.fill();
  }
}
