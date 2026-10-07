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
import { BARRIER_BREAK_SPEED } from './rules.js';

export const GROUND_Z = 0.3;  // below this you're on the ground (tile collisions apply)
export const DECK_LIFT = 88;  // screen px a thing on the deck is drawn above its ground position (render only): high enough
                              // that the tallest trucks, buses and trains pass under the deck's slab without showing through it
const CELL = 256;
// Barriers (parapets) come in pieces this long; a piece smashed through stays open until the
// road crew put it back. Key: "<edge>:<side>:<piece>" (side +1 = right of the edge's direction).
export const BARRIER_PIECE = 96;
export const barrierKey = (edge, side, s) => `${edge}:${side > 0 ? 1 : -1}:${Math.floor(s / BARRIER_PIECE)}`;
const FALL_STEP = 0.07;       // lz lost per physics step while dropping off the deck (~0.7 s from the top)
export const LAND_IMPACT = 300; // what hitting the ground from the deck feels like (crash damage)

export function buildLevels(m) {
  const segs = [];
  for (const e of m.edges) {
    if (e.lvl !== 1 && e.lvl !== 'ramp') continue;
    // a ramp's deck end continues a little way along the deck, so the corridor doesn't end in a
    // rounded cap you can wedge against while peeling off (or merging on)
    if (e.lvl === 'ramp') {
      const P = e.pts, n = P.length;
      for (const [end, z] of [[0, edgeZ(e, e.a, 0)], [1, edgeZ(e, e.a, e.len)]]) {
        if (z < 0.5) continue;
        const p = end ? P[n - 1] : P[0], q = end ? P[n - 2] : P[1];
        const l = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const ux = (p.x - q.x) / l, uy = (p.y - q.y) / l; // pointing out of the ramp, along the deck
        const ext = 200;
        const a = end ? p : { x: p.x + ux * ext, y: p.y + uy * ext }, b = end ? { x: p.x + ux * ext, y: p.y + uy * ext } : p;
        segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len: ext, ux: (b.x - a.x) / ext, uy: (b.y - a.y) / ext, hw: e.hw, za: z, zb: z, ramp: true, edge: e.id, s0: end ? e.len : -ext });
      }
    }
    for (let k = 0; k + 1 < e.pts.length; k++) {
      const a = e.pts[k], b = e.pts[k + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 0.5) continue;
      segs.push({
        ax: a.x, ay: a.y, bx: b.x, by: b.y, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len,
        hw: e.hw, za: edgeZ(e, e.a, a.s), zb: edgeZ(e, e.a, b.s), ramp: e.lvl === 'ramp', edge: e.id, s0: a.s,
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
  return { segs, grid, broken: new Map() };
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
  return { qx, qy, d: Math.hypot(dx, dy), dx, dy, t, z: sg.za + (sg.zb - sg.za) * (t / sg.len) };
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
// the body; breaker: a vehicle, which smashes through a barrier it hits hard enough (anything
// going over the edge then drops to the ground). Returns the impact speed into a barrier or the
// ground (0 when nothing was hit).
export function levelStep(m, s, r, breaker = false) {
  const L = m.levels;
  if (!L) { s.lz = 0; return 0; }
  if (s.falling) {
    s.lz = (s.lz || 0) - FALL_STEP;
    if (s.lz > 0.02) return 0;
    s.lz = 0; s.falling = false;
    return LAND_IMPACT;
  }
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
    const nx = p.dx / p.d, ny = p.dy / p.d;
    const side = sg.ux * p.dy - sg.uy * p.dx > 0 ? 1 : -1;
    const key = barrierKey(sg.edge, side, (sg.s0 || 0) + p.t);
    const vn = (s.vx || 0) * nx + (s.vy || 0) * ny;
    if (!L.broken.has(key) && breaker && vn > BARRIER_BREAK_SPEED && p.z > GROUND_Z + 0.1) {
      // smashed through: this piece and its neighbours are gone, the car keeps going (slower)
      const k0 = Math.floor(((sg.s0 || 0) + p.t) / BARRIER_PIECE);
      const keys = [k0 - 1, k0, k0 + 1].map((k) => `${sg.edge}:${side}:${k}`);
      for (const k of keys) L.broken.set(k, true);
      if (L.onBreak) L.onBreak(keys, s.x, s.y, Math.atan2(ny, nx));
      s.vx *= 0.7; s.vy *= 0.7;
      impact = vn * 0.55;
    }
    if (L.broken.has(key)) {
      // an open gap: past the edge you go over it
      if (p.d > sg.hw + r * 0.3) { s.falling = true; s.lz = p.z; return impact; }
    } else {
      // over the barrier line: back inside, bounce like off a wall
      s.x = p.qx + nx * Math.max(0, lim);
      s.y = p.qy + ny * Math.max(0, lim);
      if (vn > 0) {
        s.vx -= 1.25 * vn * nx; s.vy -= 1.25 * vn * ny;
        impact = vn;
        if (s.av !== undefined) s.av *= 0.5;
      }
    }
  }
  s.lz = p.z <= GROUND_Z ? Math.max(0, p.z) : p.z;
  return impact;
}

// Is the barrier piece at arc position s along edge (side +1/-1) smashed?
export function barrierOpen(m, edge, side, s) { return !!(m.levels && m.levels.broken.has(barrierKey(edge, side, s))); }

// Level of an entity for "same level" checks: 0 ground, 1 up (deck or upper ramp).
export const lvlOf = (e) => ((e && e.lz) > 0.5 ? 1 : 0);
// Can two things at heights za, zb touch each other (collide, hit, fight)?
export const sameLevel = (za, zb) => Math.abs((za || 0) - (zb || 0)) < 0.34;
