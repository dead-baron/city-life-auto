// The elevated ring highway and its slip ramps, drawn in the 3/4 view: the deck is cut into
// short slabs that are lifted DECK_LIFT px per level of height and sorted with everything else
// by where they stand, so cars driving under the deck disappear beneath it and cars up on it are
// drawn on top. Concrete girder faces on the side facing the camera, parapets, lane markings,
// the median barrier, pillars, and the deck's shadow on the ground below.
import { DECK_LIFT, BARRIER_PIECE } from '../../shared/levels.js';
import { edgeZ, laneOffset } from '../../shared/roads.js';
import { pointAt } from '../../shared/geom.js';
import { pattern } from './roads.js';

const PIECE = 48;        // slab length (px along the road)
const CELL = 512;        // view culling grid
const GIRDER = 18;       // visible thickness of the deck's edge beam

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
    // where a ramp peels off or merges, the deck's parapet on that side is open
    // (a side is open where it lies inside another road's corridor at about the same height)
    const segs = map.levels ? map.levels.segs : [];
    for (const sl of this.slabs) {
      const z = (sl.z0 + sl.z1) / 2;
      for (const [P, key] of [[sl.L, 'openL'], [sl.R, 'openR']]) {
        const mx = (P[0] + P[2]) / 2, my = (P[1] + P[3]) / 2;
        for (const q of segs) {
          if (q.edge === sl.e.id) continue;
          let t = (mx - q.ax) * q.ux + (my - q.ay) * q.uy;
          t = Math.max(0, Math.min(q.len, t));
          const qz = q.za + (q.zb - q.za) * (t / q.len);
          if (Math.abs(qz - z) < 0.25 && Math.hypot(mx - q.ax - q.ux * t, my - q.ay - q.uy * t) < q.hw - 2) { sl[key] = true; break; }
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

  // Under and beside the deck (drawn with the ground, before anything stands on it): the ground
  // right under it is always in deep shade (it's covered), and the sun throws its shadow off to
  // the side - long in the morning and evening, tucked underneath at noon.
  drawShadows(g, slabs, sky) {
    const sun = sky ? sky.sun : 1, L = sky ? sky.shadowLen : 0.7;
    const dx = sky ? sky.sunDir.x : 0.6, dy = sky ? sky.sunDir.y : 0.4;
    const night = sky ? sky.night : 0;
    g.save();
    const quad = (P, Q, ox, oy) => { g.moveTo(P[0] + ox, P[1] + oy); g.lineTo(P[2] + ox, P[3] + oy); g.lineTo(Q[2] + ox, Q[3] + oy); g.lineTo(Q[0] + ox, Q[1] + oy); g.closePath(); };
    // the footprint: under the deck (the deck is drawn DECK_LIFT px up the screen, so this is the
    // ground you see between the pillars)
    g.fillStyle = `rgba(4,8,22,${(0.42 - night * 0.18).toFixed(3)})`;
    g.beginPath();
    for (const sl of slabs) {
      const z = (sl.z0 + sl.z1) / 2;
      if (z < 0.25) continue;
      // keep the winding the same whichever way the road runs, so overlaps merge instead of cancelling
      const cw = (sl.R[0] - sl.L[0]) * (sl.L[3] - sl.L[1]) - (sl.R[1] - sl.L[1]) * (sl.L[2] - sl.L[0]) > 0;
      if (cw) quad(sl.L, sl.R, 0, 0); else quad(sl.R, sl.L, 0, 0);
    }
    g.fill();
    // a soft edge of shade spilling out on both sides (light can't get in under there)
    g.strokeStyle = `rgba(4,8,22,${(0.16 - night * 0.08).toFixed(3)})`; g.lineWidth = 26;
    g.beginPath();
    for (const sl of slabs) { if ((sl.z0 + sl.z1) / 2 < 0.4) continue; g.moveTo(sl.L[0], sl.L[1]); g.lineTo(sl.L[2], sl.L[3]); g.moveTo(sl.R[0], sl.R[1]); g.lineTo(sl.R[2], sl.R[3]); }
    g.stroke();
    // the sun's shadow
    const a = 0.3 * sun;
    if (a > 0.02) {
      g.fillStyle = `rgba(10,14,40,${a.toFixed(3)})`;
      g.beginPath();
      for (const sl of slabs) {
        const z = (sl.z0 + sl.z1) / 2;
        if (z < 0.2 || sl.e.lvl === 'ramp' && z < 0.5) continue;
        const h = DECK_LIFT * z * L * 1.4;
        const ox = dx * h, oy = dy * h + DECK_LIFT * z * 0.15;
        const cw = (sl.R[0] - sl.L[0]) * (sl.L[3] - sl.L[1]) - (sl.R[1] - sl.L[1]) * (sl.L[2] - sl.L[0]) > 0;
        if (cw) quad(sl.L, sl.R, ox, oy); else quad(sl.R, sl.L, ox, oy);
      }
      g.fill();
    }
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
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(p.x + 3, p.y + 2, 13, 6, 0, 0, 6.283); g.fill();
    // a square column: lit face, shaded face, a cap where it meets the deck and stains at its foot
    g.fillStyle = '#8a8c92'; g.fillRect(p.x - 10, top, 20, DECK_LIFT);
    g.fillStyle = '#b0b2b7'; g.fillRect(p.x - 10, top, 6, DECK_LIFT);
    g.fillStyle = '#62646a'; g.fillRect(p.x + 5, top, 5, DECK_LIFT);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(p.x - 12, top, 24, 5);           // the deck's underside shading the top
    g.fillStyle = '#9c9ea3'; g.fillRect(p.x - 12, top + 5, 24, 2);
    g.fillStyle = 'rgba(40,36,30,.35)'; g.fillRect(p.x - 10, p.y - 9, 20, 9);     // grime at the foot
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(p.x - 10, p.y - 3, 20, 3);
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
      g.fillStyle = ramp ? '#7d7f86' : '#8f9197';
      g.beginPath();
      g.moveTo(P[0], P[1] - l0); g.lineTo(P[2], P[3] - l1);
      g.lineTo(P[2], P[3] - l1 + d1); g.lineTo(P[0], P[1] - l0 + d0); g.closePath(); g.fill();
      // a lit lip along the top, the girder's shadowed lower half, and a dark line where it ends
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.beginPath(); g.moveTo(P[0], P[1] - l0); g.lineTo(P[2], P[3] - l1); g.lineTo(P[2], P[3] - l1 + 2); g.lineTo(P[0], P[1] - l0 + 2); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.moveTo(P[0], P[1] - l0 + d0 * 0.55); g.lineTo(P[2], P[3] - l1 + d1 * 0.55);
      g.lineTo(P[2], P[3] - l1 + d1); g.lineTo(P[0], P[1] - l0 + d0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.beginPath(); g.moveTo(P[0], P[1] - l0 + d0 - 1.5); g.lineTo(P[2], P[3] - l1 + d1 - 1.5); g.lineTo(P[2], P[3] - l1 + d1); g.lineTo(P[0], P[1] - l0 + d0); g.closePath(); g.fill();
    }
    // road surface (the concept's highway asphalt)
    g.fillStyle = pattern(g, 'asphalt') || '#45464d'; // the same asphalt as the streets below, so ramps meet them seamlessly
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
    if (ramp && Math.max(sl.z0, sl.z1) < 0.18) return; // at street level the ramp is just road: no edge lines over the street it joins
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
    // parapets on both edges (only where the slab is off the ground): open where a ramp leaves,
    // smashed where somebody went through
    if (Math.max(sl.z0, sl.z1) > 0.12) {
      const broken = this.map.levels ? this.map.levels.broken : null;
      for (const [P, side, open] of [[L, 1, sl.openL], [R, -1, sl.openR]]) {
        if (open) continue;
        let smashed = false;
        if (broken && broken.size) for (let k = Math.floor(sl.s0 / BARRIER_PIECE); k <= Math.floor((sl.s1 - 1) / BARRIER_PIECE); k++) if (broken.has(`${e.id}:${side}:${k}`)) smashed = true;
        if (smashed) {
          // jagged stubs and rebar where the parapet was
          g.strokeStyle = '#8d8f95'; g.lineWidth = 4;
          for (const f of [0.08, 0.92]) { const x = P[0] + (P[2] - P[0]) * f, y = P[1] + (P[3] - P[1]) * f - (l0 + (l1 - l0) * f) - 2; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y + 2); g.stroke(); }
          g.strokeStyle = 'rgba(60,40,30,.8)'; g.lineWidth = 1;
          for (const f of [0.3, 0.55, 0.75]) { const x = P[0] + (P[2] - P[0]) * f, y = P[1] + (P[3] - P[1]) * f - (l0 + (l1 - l0) * f); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 5); g.stroke(); }
          continue;
        }
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
