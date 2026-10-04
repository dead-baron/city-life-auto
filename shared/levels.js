// Two levels: the ground and the elevated highway deck (with the ramps in between).
//
// Every moving thing carries lz, its level height (0 = ground, 1 = up on the deck; in between on
// a ramp). (Not z: crates and balls use z for how high they are off the ground in px.) On the
// ground the tile map decides collisions as always - except that the upper part of a ramp is a
// solid embankment (map.lvl0Block). Up on the deck tiles don't matter at all: you are held
// inside the deck's corridors (the polylines of the highway and ramp edges, each so wide), the
// barriers push back like walls, and z follows the ramp you're on. Everything is geometry, so
// curved and diagonal decks have smooth barriers. Server and client run the same code.
import { edgeZ } from './roads.js';

export const GROUND_Z = 0.3;  // below this you're on the ground (tile collisions apply)
export const DECK_LIFT = 44;  // screen px a thing on the deck is drawn above its ground position (render only)
const CELL = 256;

export function buildLevels(m) {
  const segs = [];
  for (const e of m.edges) {
    if (e.lvl !== 1 && e.lvl !== 'ramp') continue;
    for (let k = 0; k + 1 < e.pts.length; k++) {
      const a = e.pts[k], b = e.pts[k + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.5) continue;
      segs.push({
        ax: a.x, ay: a.y, bx: b.x, by: b.y, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len,
        hw: e.hw, za: edgeZ(e, e.a, a.s), zb: edgeZ(e, e.a, b.s), ramp: e.lvl === 'ramp', edge: e.id,
      });
    }
  }
  const grid = new Map();
  segs.forEach((s, i) => {
    const pad = s.hw + 48;
    for (let cy = Math.floor((Math.min(s.ay, s.by) - pad) / CELL); cy <= Math.floor((Math.max(s.ay, s.by) + pad) / CELL); cy++)
      for (let cx = Math.floor((Math.min(s.ax, s.bx) - pad) / CELL); cx <= Math.floor((Math.max(s.ax, s.bx) + pad) / CELL); cx++) {
        const k = cy * 4096 + cx;
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(i);
      }
  });
  return { segs, grid };
}

// Deck / ramp segments near a point.
export function segsAt(L, x, y) {
  return L.grid.get(Math.floor(y / CELL) * 4096 + Math.floor(x / CELL)) || EMPTY;
}
const EMPTY = [];

function probe(sg, x, y) {
  let t = (x - sg.ax) * sg.ux + (y - sg.ay) * sg.uy;
  t = t < 0 ? 0 : t > sg.len ? sg.len : t;
  const qx = sg.ax + sg.ux * t, qy = sg.ay + sg.uy * t;
  const dx = x - qx, dy = y - qy;
  return { qx, qy, d: Math.hypot(dx, dy), dx, dy, z: sg.za + (sg.zb - sg.za) * (t / sg.len) };
}

// Height of the road surface under a point for something currently at height z (null when
// there is no deck or ramp there at about that height).
export function surfaceZ(m, x, y, z = 1) {
  const L = m.levels;
  if (!L) return null;
  let best = null;
  for (const i of segsAt(L, x, y)) {
    const sg = L.segs[i];
    const p = probe(sg, x, y);
    if (p.d > sg.hw || Math.abs(p.z - z) > 0.45) continue;
    if (!best || Math.abs(p.z - z) < Math.abs(best - z)) best = p.z;
  }
  return best;
}

// Is this ground tile under the deck (for spawning, drawing order)?
export function underDeck(m, x, y) {
  const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
  return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !!m.deck[ty * m.w + tx];
}

// After moving: work out z and keep things on the deck inside its barriers. r: half width of
// the body. Returns the impact speed into a barrier (0 when nothing was hit).
export function levelStep(m, s, r) {
  const L = m.levels;
  if (!L) { s.lz = 0; return 0; }
  const z = s.lz || 0;
  const near = segsAt(L, s.x, s.y);
  if (z <= GROUND_Z) {
    // on the ground: walking or driving up the foot of a ramp lifts you onto it
    let nz = 0;
    for (const i of near) {
      const sg = L.segs[i];
      if (!sg.ramp) continue;
      const p = probe(sg, s.x, s.y);
      if (p.d <= sg.hw - 2 && p.z <= GROUND_Z + 0.08 && p.z > nz && (z > 0.02 || p.z < 0.2)) nz = p.z;
    }
    s.lz = nz;
    return 0;
  }
  // up on a ramp or the deck: the corridor closest to our height that we're inside (or nearest)
  let best = null;
  for (const i of near) {
    const sg = L.segs[i];
    const p = probe(sg, s.x, s.y);
    if (Math.abs(p.z - z) > 0.3) continue;
    const score = p.d - sg.hw;
    if (!best || score < best.score - 0.5 || (Math.abs(score - best.score) <= 0.5 && Math.abs(p.z - z) < Math.abs(best.p.z - z))) best = { sg, p, score };
  }
  if (!best) { s.lz = 0; return 0; }
  const { sg, p } = best;
  let impact = 0;
  const lim = sg.hw - r;
  if (p.d > lim && p.d > 1e-6) {
    // over the barrier line: back inside, bounce like off a wall
    const nx = p.dx / p.d, ny = p.dy / p.d;
    s.x = p.qx + nx * Math.max(0, lim);
    s.y = p.qy + ny * Math.max(0, lim);
    const vn = (s.vx || 0) * nx + (s.vy || 0) * ny;
    if (vn > 0) {
      s.vx -= 1.25 * vn * nx; s.vy -= 1.25 * vn * ny;
      impact = vn;
      if (s.av !== undefined) s.av *= 0.5;
    }
  }
  s.lz = p.z <= GROUND_Z ? Math.max(0, p.z) : p.z;
  return impact;
}

// Level of an entity for "same level" checks: 0 ground, 1 up (deck or upper ramp).
export const lvlOf = (e) => ((e && e.lz) > 0.5 ? 1 : 0);
// Can two things at heights za, zb touch each other (collide, hit, fight)?
export const sameLevel = (za, zb) => Math.abs((za || 0) - (zb || 0)) < 0.34;
