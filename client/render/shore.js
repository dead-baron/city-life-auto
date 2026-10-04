// Smooth shorelines over the tile grid. The coast is traced once (marching squares over the
// water/land tiles, then rounded), cut into short pieces and indexed by chunk. Baked into the
// ground: water paints over the land's staircase on the water side, the shore's own ground
// (sand, a concrete seawall promenade, or a grassy bank) fills the land side, then the edge
// itself - a coping-stone seawall in town, wet sand on beaches, a muddy lip on wild banks.
// Live on top: surf rolling up the beaches and water lapping at the seawalls.
import { T, TILE, MAP_W, MAP_H, CHUNK_PX } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { contours } from '../../shared/citylayout.js';
import { chaikin, offset, simplify } from '../../shared/geom.js';
import { pattern } from './roads.js';

const PIECE = 14;        // points per piece
const BAND = 26;         // px painted either side of the smooth coastline
const wetT = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.DOCK;

export class Shores {
  constructor(m) {
    this.m = m;
    const W = MAP_W, H = MAP_H;
    // land = 1, water = 0, softened a little so the traced line rounds off single-tile steps
    const raw = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) raw[i] = wetT(m.tiles[i]) ? 0 : 1;
    const f = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      f[i] = raw[i] * 0.5 + (raw[i - 1] + raw[i + 1] + raw[i - W] + raw[i + W]) * 0.1 + (raw[i - W - 1] + raw[i - W + 1] + raw[i + W - 1] + raw[i + W + 1]) * 0.025;
    }
    const lines = contours(f, W, H, 0.5, () => true, 1, 1, W - 2, H - 2);
    this.pieces = [];
    this.grid = new Map();
    for (const ln of lines) {
      const sm = chaikin(simplify(ln, 4), 2);
      for (let k = 0; k < sm.length - 1; k += PIECE) {
        const pts = sm.slice(k, Math.min(sm.length, k + PIECE + 1));
        if (pts.length < 2) continue;
        this.addPiece(pts);
      }
    }
  }

  addPiece(pts) {
    const m = this.m;
    // which side is land: look a little way off the middle of the piece
    const mid = Math.floor(pts.length / 2);
    const q = offset(pts, 14)[mid], r = offset(pts, -14)[mid];
    const tq = m.tileAtPx(q.x, q.y), tr = m.tileAtPx(r.x, r.y);
    let side;
    if (!wetT(tq) && wetT(tr)) side = 1; else if (wetT(tq) && !wetT(tr)) side = -1; else side = !wetT(tq) ? 1 : -1;
    // what kind of shore: the ground a tile inland
    const inl = offset(pts, side * 40);
    let sand = 0, green = 0, built = 0;
    let walk = null;
    for (const p of inl) {
      const t = m.tileAtPx(p.x, p.y);
      if (t === T.SAND) sand++;
      else if (t === T.GRASS || t === T.FIELD || t === T.DIRT) green++;
      else if (!wetT(t)) {
        built++;
        if (!walk) { const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE); const d = DISTRICTS[m.dist[ty * MAP_W + tx]]; walk = d && d.walk; }
      }
    }
    const zone = m.zone ? m.zone[Math.floor(pts[mid].y / TILE) * MAP_W + Math.floor(pts[mid].x / TILE)] : 0;
    const town = zone === 1 || zone === 2; // Metro City and Southbank: seawalls wherever it isn't beach
    const kind = sand >= green && sand >= built && sand > 0 ? 'beach' : town ? 'wall' : green >= built ? 'bank' : 'wall';
    const pc = {
      pts, side, kind, walk: walk || 'concrete',
      water: offset(pts, -side * BAND), land: offset(pts, side * BAND),
      foam: offset(pts, -side * 7), foam2: offset(pts, -side * 16),
    };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    pc.box = [x0 - BAND - 8, y0 - BAND - 8, x1 + BAND + 8, y1 + BAND + 8];
    this.pieces.push(pc);
    for (let cy = Math.floor(pc.box[1] / CHUNK_PX); cy <= Math.floor(pc.box[3] / CHUNK_PX); cy++)
      for (let cx = Math.floor(pc.box[0] / CHUNK_PX); cx <= Math.floor(pc.box[2] / CHUNK_PX); cx++) {
        const k = cy * 1000 + cx;
        let l = this.grid.get(k);
        if (!l) this.grid.set(k, (l = []));
        l.push(pc);
      }
  }

  // Baked into a ground chunk (in world coordinates), right after the tiles.
  bake(g, cx, cy) {
    const list = this.grid.get(cy * 1000 + cx);
    if (!list) return;
    const band = (a, b) => { g.beginPath(); g.moveTo(a[0].x, a[0].y); for (let i = 1; i < a.length; i++) g.lineTo(a[i].x, a[i].y); for (let i = b.length - 1; i >= 0; i--) g.lineTo(b[i].x, b[i].y); g.closePath(); };
    const line = (a) => { g.beginPath(); g.moveTo(a[0].x, a[0].y); for (let i = 1; i < a.length; i++) g.lineTo(a[i].x, a[i].y); };
    g.save();
    g.lineJoin = 'round'; g.lineCap = 'round';
    // water side, then land side
    for (const pc of list) {
      g.fillStyle = pattern(g, 'water') || '#1f5aa8';
      band(pc.pts, pc.water); g.fill();
    }
    for (const pc of list) {
      g.fillStyle = pattern(g, pc.kind === 'beach' ? 'sand' : pc.kind === 'bank' ? 'grass' : pc.walk) || '#a9a9a4';
      band(pc.pts, pc.land); g.fill();
    }
    // the edge itself
    for (const pc of list) {
      if (pc.kind === 'wall') {
        g.strokeStyle = 'rgba(0,12,30,.45)'; g.lineWidth = 7; line(offset(pc.pts, -pc.side * 3)); g.stroke(); // the wall's shadow on the water
        g.strokeStyle = '#7e8088'; g.lineWidth = 9; line(offset(pc.pts, pc.side * 3)); g.stroke();             // wall face
        g.strokeStyle = '#c9c6bb'; g.lineWidth = 6; line(offset(pc.pts, pc.side * 6)); g.stroke();             // coping stones
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; line(offset(pc.pts, pc.side * 8)); g.stroke();
      } else if (pc.kind === 'beach') {
        g.strokeStyle = 'rgba(110,90,50,.28)'; g.lineWidth = 14; line(offset(pc.pts, pc.side * 6)); g.stroke(); // wet sand
        g.strokeStyle = 'rgba(120,200,215,.35)'; g.lineWidth = 10; line(offset(pc.pts, -pc.side * 5)); g.stroke(); // shallows
      } else {
        g.strokeStyle = 'rgba(70,58,34,.55)'; g.lineWidth = 6; line(offset(pc.pts, pc.side * 2)); g.stroke();
        g.strokeStyle = 'rgba(120,200,215,.25)'; g.lineWidth = 8; line(offset(pc.pts, -pc.side * 5)); g.stroke();
      }
    }
    g.restore();
  }

  // Live surf and lapping water (drawn every frame over the ground, under everything else).
  animate(g, view, t) {
    const seen = new Set();
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let cy = Math.floor(view.y0 / CHUNK_PX); cy <= Math.floor(view.y1 / CHUNK_PX); cy++)
      for (let cx = Math.floor(view.x0 / CHUNK_PX); cx <= Math.floor(view.x1 / CHUNK_PX); cx++)
        for (const pc of this.grid.get(cy * 1000 + cx) || []) {
          if (seen.has(pc)) continue;
          seen.add(pc);
          const b = pc.box;
          if (b[2] < view.x0 || b[0] > view.x1 || b[3] < view.y0 || b[1] > view.y1) continue;
          const ph = (t * 0.35 + (pc.pts[0].x + pc.pts[0].y) * 0.0007) % 1;
          if (pc.kind === 'beach') {
            // a wave line rolls in from the shallows to the sand, fading as it arrives
            const a = Math.sin(ph * Math.PI);
            g.strokeStyle = `rgba(240,250,255,${(0.55 * a).toFixed(3)})`; g.lineWidth = 3;
            g.setLineDash([22, 10, 8, 12]); g.lineDashOffset = -t * 6;
            drawLine(g, ph < 0.5 ? pc.foam2 : pc.foam);
            g.strokeStyle = `rgba(240,250,255,${(0.35 * (1 - a)).toFixed(3)})`; g.lineWidth = 2;
            g.setLineDash([10, 16]); g.lineDashOffset = t * 4;
            drawLine(g, pc.foam);
          } else {
            const a = 0.18 + 0.14 * Math.sin(t * 2.1 + pc.pts[0].x * 0.01);
            g.strokeStyle = `rgba(225,240,255,${a.toFixed(3)})`; g.lineWidth = 2;
            g.setLineDash([14, 18]); g.lineDashOffset = -t * 9;
            drawLine(g, pc.foam);
          }
        }
    g.setLineDash([]);
    g.restore();
  }
}

function drawLine(g, a) {
  g.beginPath(); g.moveTo(a[0].x, a[0].y);
  for (let i = 1; i < a.length; i++) g.lineTo(a[i].x, a[i].y);
  g.stroke();
}
