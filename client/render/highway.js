// The elevated ring highway and its slip ramps, drawn in the 3/4 view: the deck is cut into
// short slabs that are lifted DECK_LIFT px per level of height and sorted with everything else
// by where they stand, so cars driving under the deck disappear beneath it and cars up on it are
// drawn on top. Concrete girder faces on the side facing the camera, parapets, lane markings,
// the median barrier, pillars, and the deck's shadow on the ground below.
import { DECK_LIFT } from '../../shared/levels.js';
import { edgeZ, laneOffset } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';

const PIECE = 48;        // slab length (px along the road)
const CELL = 512;        // view culling grid
const GIRDER = 13;       // visible thickness of the deck's edge beam

export class Highway {
  constructor(map) {
    this.map = map;
    this.slabs = [];
    this.grid = new Map();
    for (const e of map.edges) {
      if (e.lvl !== 1 && e.lvl !== 'ramp') continue;
      const n = Math.max(1, Math.round(e.len / PIECE));
      for (let k = 0; k < n; k++) {
        const s0 = (k / n) * e.len, s1 = ((k + 1) / n) * e.len;
        const a = pointAt(e.pts, s0), b = pointAt(e.pts, s1);
        const z0 = edgeZ(e, e.a, s0), z1 = edgeZ(e, e.a, s1);
        // corners: left/right of the centre line at both ends (left = -normal)
        const nx0 = -a.ty, ny0 = a.tx, nx1 = -b.ty, ny1 = b.tx;
        const h = e.hw;
        const sl = {
          e, k, n, s0, s1, z0, z1,
          ax: a.x, ay: a.y, bx: b.x, by: b.y, tx: (a.tx + b.tx) / 2, ty: (a.ty + b.ty) / 2,
          L: [a.x + nx0 * h, a.y + ny0 * h, b.x + nx1 * h, b.y + ny1 * h],   // one side
          R: [a.x - nx0 * h, a.y - ny0 * h, b.x - nx1 * h, b.y - ny1 * h],   // the other
          nL: [nx0, ny0], nR: [-nx0, -ny0],
          low: Math.max(z0, z1) < 0.15,
        };
        sl.y0 = Math.min(sl.L[1], sl.L[3], sl.R[1], sl.R[3]);
        sl.y1 = Math.max(sl.L[1], sl.L[3], sl.R[1], sl.R[3]);
        sl.x0 = Math.min(sl.L[0], sl.L[2], sl.R[0], sl.R[2]);
        sl.x1 = Math.max(sl.L[0], sl.L[2], sl.R[0], sl.R[2]);
        sl.key = sl.y1;
        this.slabs.push(sl);
        for (let cy = Math.floor(sl.y0 / CELL); cy <= Math.floor(sl.y1 / CELL); cy++)
          for (let cx = Math.floor(sl.x0 / CELL); cx <= Math.floor(sl.x1 / CELL); cx++) {
            const key = cy * 4096 + cx;
            let l = this.grid.get(key);
            if (!l) this.grid.set(key, (l = []));
            l.push(sl);
          }
      }
    }
    this.pillars = map.pillars || [];
    this.pgrid = new Map();
    for (const p of this.pillars) {
      const key = Math.floor(p.y / CELL) * 4096 + Math.floor(p.x / CELL);
      let l = this.pgrid.get(key);
      if (!l) this.pgrid.set(key, (l = []));
      l.push(p);
    }
  }

  // Slabs and pillars in view.
  visible(view) {
    const out = new Set(), pil = [];
    for (let cy = Math.floor((view.y0 - DECK_LIFT) / CELL); cy <= Math.floor((view.y1 + DECK_LIFT) / CELL); cy++)
      for (let cx = Math.floor(view.x0 / CELL); cx <= Math.floor(view.x1 / CELL); cx++) {
        for (const sl of this.grid.get(cy * 4096 + cx) || []) if (sl.x1 > view.x0 && sl.x0 < view.x1 && sl.y1 > view.y0 && sl.y0 - DECK_LIFT < view.y1) out.add(sl);
        for (const p of this.pgrid.get(cy * 4096 + cx) || []) if (p.x > view.x0 - 20 && p.x < view.x1 + 20 && p.y > view.y0 && p.y - DECK_LIFT < view.y1 + 20) pil.push(p);
      }
    return { slabs: [...out], pillars: pil };
  }

  // The deck's shadow on the ground (drawn with the ground, before anything stands on it).
  drawShadows(g, slabs, dark) {
    g.save();
    g.fillStyle = `rgba(0,6,18,${(0.3 - dark * 0.15).toFixed(3)})`;
    g.beginPath();
    for (const sl of slabs) {
      const z = (sl.z0 + sl.z1) / 2;
      if (z < 0.2 || sl.e.lvl === 'ramp' && z < 0.5) continue;
      const ox = 26 * z, oy = 16 * z; // light from the north-west
      g.moveTo(sl.L[0] + ox, sl.L[1] + oy); g.lineTo(sl.L[2] + ox, sl.L[3] + oy);
      g.lineTo(sl.R[2] + ox, sl.R[3] + oy); g.lineTo(sl.R[0] + ox, sl.R[1] + oy); g.closePath();
    }
    g.fill();
    g.restore();
  }

  // The low ends of the ramps, flat on the ground: drawn with the ground too.
  drawLow(g, slabs) { for (const sl of slabs) if (sl.low) this.drawSlab(g, sl); }

  // Sort keys for the 3/4 view: slab (its southern-most point), pillar (its foot).
  items(slabs, pillars, out) {
    for (const sl of slabs) if (!sl.low) out.push({ y: sl.key, slab: sl });
    for (const p of pillars) if (!p.wet) out.push({ y: p.y - 0.5, pillar: p });
  }

  drawPillar(g, p) {
    const top = p.y - DECK_LIFT;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(p.x + 5, p.y + 3, 12, 6, 0, 0, 6.283); g.fill();
    g.fillStyle = '#8d8f95'; g.fillRect(p.x - 9, top, 18, DECK_LIFT);
    g.fillStyle = '#a9abb1'; g.fillRect(p.x - 9, top, 5, DECK_LIFT);
    g.fillStyle = '#6c6e74'; g.fillRect(p.x + 5, top, 4, DECK_LIFT);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(p.x - 9, p.y - 5, 18, 5);
  }

  drawSlab(g, sl) {
    const e = sl.e;
    const l0 = DECK_LIFT * sl.z0, l1 = DECK_LIFT * sl.z1;
    const L = sl.L, R = sl.R;
    const ramp = e.lvl === 'ramp';
    // side faces that look toward the camera (outward normal pointing south): a girder on the
    // deck, a solid embankment wall under a ramp
    for (const [P, N] of [[L, sl.nL], [R, sl.nR]]) {
      if (N[1] <= 0.05) continue;
      const d0 = ramp ? l0 : Math.min(l0, GIRDER), d1 = ramp ? l1 : Math.min(l1, GIRDER);
      if (d0 + d1 < 0.5) continue;
      g.fillStyle = ramp ? '#7d7f86' : '#8a8c93';
      g.beginPath();
      g.moveTo(P[0], P[1] - l0); g.lineTo(P[2], P[3] - l1);
      g.lineTo(P[2], P[3] - l1 + d1); g.lineTo(P[0], P[1] - l0 + d0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.beginPath();
      g.moveTo(P[0], P[1] - l0 + d0 * 0.6); g.lineTo(P[2], P[3] - l1 + d1 * 0.6);
      g.lineTo(P[2], P[3] - l1 + d1); g.lineTo(P[0], P[1] - l0 + d0); g.closePath(); g.fill();
    }
    // road surface
    g.fillStyle = '#45464d';
    g.beginPath();
    g.moveTo(L[0], L[1] - l0); g.lineTo(L[2], L[3] - l1); g.lineTo(R[2], R[3] - l1); g.lineTo(R[0], R[1] - l0); g.closePath();
    g.fill();
    // a little texture: alternating slab joints
    if (sl.k % 2 === 0) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L[0], L[1] - l0); g.lineTo(R[0], R[1] - l0); g.stroke();
    // lines along the slab: (offset to the right of the centre line, style)
    const along = (o, w, col, dash) => {
      if (dash && sl.k % 2) return;
      const nx = sl.nR[0], ny = sl.nR[1];
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      g.moveTo(sl.ax + nx * o, sl.ay + ny * o - l0);
      g.lineTo(sl.bx + nx * o, sl.by + ny * o - l1);
      g.stroke();
    };
    const white = 'rgba(232,230,222,.8)';
    if (e.kind === 'hwy') {
      // median barrier, edge lines, lane dividers on both carriageways
      for (const s of [1, -1]) {
        along(s * (e.median / 2 - 3), 2, '#e8b923');
        along(s * (e.hw - 10), 2.5, white);
        for (let k = 0; k + 1 < e.nl; k++) along(s * (laneOffset(e, k) + laneOffset(e, k + 1)) / 2, 2.5, white, true);
      }
      along(0, e.median - 10, '#a6a8ad');
      along(-1, 3, '#c4c6cb');
    } else {
      for (const s of [1, -1]) along(s * (e.hw - 8), 2, white);
    }
    // parapets on both edges (only where the slab is off the ground)
    if (Math.max(sl.z0, sl.z1) > 0.12) {
      for (const P of [L, R]) {
        g.strokeStyle = '#b4b6bb'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(P[0], P[1] - l0 - 2); g.lineTo(P[2], P[3] - l1 - 2); g.stroke();
        g.strokeStyle = '#d6d8dc'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(P[0], P[1] - l0 - 4); g.lineTo(P[2], P[3] - l1 - 4); g.stroke();
      }
    }
    // a lamp standard on the median every so often
    if (e.kind === 'hwy' && sl.k % 9 === 4) {
      const x = (sl.ax + sl.bx) / 2, y = (sl.ay + sl.by) / 2 - (l0 + l1) / 2;
      g.fillStyle = '#2c2e33'; g.fillRect(x - 1.5, y - 22, 3, 22);
      g.fillStyle = '#3a3c42'; g.fillRect(x - 10, y - 24, 20, 3);
      g.fillStyle = 'rgba(255,240,200,.85)'; g.fillRect(x - 10, y - 21.5, 4, 1.5); g.fillRect(x + 6, y - 21.5, 4, 1.5);
    }
  }
}

// Height (px) an entity at level lz is drawn above its ground position.
export const liftOf = (lz) => (lz > 0.01 ? DECK_LIFT * lz : 0);
// Sort key of an entity: things on a ramp or the deck are drawn after the slabs under them.
export const levelKey = (y, lz) => (lz > 0.01 ? y + 200 + 450 * lz : y);
