// Streets drawn from the road network's curves (baked into the ground chunks): smooth asphalt
// and pavements along diagonal and curving roads, kerbs, lane markings, stop lines, zebra
// crossings and cul-de-sac turning circles. The tile map underneath still decides collisions;
// this just makes it look like real roads instead of staircases.
import { TILE } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { GROUND_TEX } from '../../shared/prefab-data.js';
import { laneOffset } from '../../shared/roads.js';
import { offset, measure, pointAt } from '../../shared/geom.js';
import { atlas } from './sprites.js';

const CITY = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front']);
const YELLOW = '#e8b923', WHITE = 'rgba(232,230,222,.88)';

// Repeating patterns cut from the ground texture atlas (anchored to world 0,0 so chunks meet).
const pats = new Map();
export function pattern(g, name) {
  if (!atlas.ground || !GROUND_TEX[name]) return null;
  let p = pats.get(name);
  if (p) return p;
  const r = GROUND_TEX[name];
  const c = document.createElement('canvas');
  c.width = r[2]; c.height = r[3];
  c.getContext('2d').drawImage(atlas.ground, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
  p = g.createPattern(c, 'repeat');
  pats.set(name, p);
  return p;
}

// Cached outline geometry per edge.
function geo(e) {
  if (e._geo) return e._geo;
  const aligned = e.pts.every((p, i) => i === 0 || Math.abs(p.x - e.pts[i - 1].x) < 1 || Math.abs(p.y - e.pts[i - 1].y) < 1);
  const side = CITY.has(e.kind) ? (aligned ? 2 : 2.6) * TILE : 0;
  const band = (d) => { const a = offset(e.pts, d), b = offset(e.pts, -d).reverse(); return a.concat(b); };
  e._geo = { aligned, road: band(e.hw), walk: side ? band(e.hw + side) : null };
  return e._geo;
}

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
}
function line(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}

const distAt = (m, x, y) => DISTRICTS[m.dist[Math.min(m.h - 1, Math.max(0, Math.floor(y / TILE))) * m.w + Math.min(m.w - 1, Math.max(0, Math.floor(x / TILE)))]];

// Every ground-level road touching a chunk, in three passes so junctions overlap cleanly.
export function drawRoads(g, m, edges, nodes) {
  if (!edges.length && !nodes.length) return;
  g.save();
  g.lineJoin = 'round';
  // 1. pavements (the smooth inner and outer edges along curves and diagonals)
  for (const e of edges) {
    const G = geo(e);
    if (!G.walk || e.bridge) continue;
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const d = distAt(m, mid.x, mid.y);
    g.fillStyle = pattern(g, d.walk) || '#a9a9a4';
    poly(g, G.walk); g.fill();
    if (!G.aligned) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; line(g, offset(e.pts, e.hw + 2.6 * TILE)); g.stroke(); line(g, offset(e.pts, -(e.hw + 2.6 * TILE))); g.stroke(); }
  }
  for (const n of nodes) if (n.culdesac) { // turning circle: pavement ring
    const d = distAt(m, n.x, n.y);
    g.fillStyle = pattern(g, d.walk) || '#a9a9a4';
    g.beginPath(); g.arc(n.x, n.y, 5.6 * TILE, 0, 6.283); g.fill();
  }
  // 2. kerbs, just outside the asphalt (the asphalt of crossing streets then paints over them
  // inside junctions, so they stop at the corners)
  g.strokeStyle = '#cfcdc4'; g.lineWidth = 4;
  for (const e of edges) {
    if (!CITY.has(e.kind) || e.bridge) continue;
    for (const s of [1, -1]) { line(g, offset(e.pts, s * (e.hw + 1))); g.stroke(); }
  }
  // 3. asphalt
  for (const e of edges) {
    const G = geo(e);
    const mid = e.pts[Math.floor(e.pts.length / 2)];
    const d = distAt(m, mid.x, mid.y);
    g.fillStyle = pattern(g, e.kind === 'rural' ? 'asphalt_worn' : d.road) || '#3a3b40';
    poly(g, G.road); g.fill();
  }
  for (const n of nodes) if (n.culdesac) {
    const d = distAt(m, n.x, n.y);
    g.fillStyle = pattern(g, d.road) || '#3a3b40';
    g.beginPath(); g.arc(n.x, n.y, 3.6 * TILE, 0, 6.283); g.fill();
    g.strokeStyle = '#cfcdc4'; g.lineWidth = 4; g.stroke();
  }
  // 4. kerb shadow, lane markings, stop lines and crossings
  for (const e of edges) {
    if (CITY.has(e.kind) && !e.bridge) {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      for (const s of [1, -1]) { const q = between(m, e, s * (e.hw - 1)); if (q) { line(g, q); g.stroke(); } }
    }
    markings(g, m, e);
  }
  g.restore();
}

// The part of an edge between its junction boxes, offset sideways by o.
function between(m, e, o) {
  const na = m.nodes[e.a], nb = m.nodes[e.b];
  const t0 = (na.trim[e.id] || 0) + 6, t1 = (nb.trim[e.id] || 0) + 6;
  const pts = offset(e.pts, o).map((p) => ({ x: p.x, y: p.y }));
  const L = measure(pts);
  if (L - t0 - t1 < 20) return null;
  const out = [];
  const a = pointAt(pts, t0), b = pointAt(pts, L - t1);
  out.push({ x: a.x, y: a.y });
  for (const p of pts) if (p.s > t0 + 2 && p.s < L - t1 - 2) out.push({ x: p.x, y: p.y });
  out.push({ x: b.x, y: b.y });
  return out;
}

function markings(g, m, e) {
  if (e.lvl !== 0) return;
  const dashed = (pts, col, w, on = 18, off = 18) => { if (!pts) return; g.strokeStyle = col; g.lineWidth = w; g.setLineDash([on, off]); line(g, pts); g.stroke(); g.setLineDash([]); };
  const solid = (pts, col, w) => { if (!pts) return; g.strokeStyle = col; g.lineWidth = w; line(g, pts); g.stroke(); };
  if (e.kind === 'ave' || e.kind === 'blvd') {
    solid(between(m, e, 4), YELLOW, 3); solid(between(m, e, -4), YELLOW, 3);
    for (const s of [1, -1]) {
      for (let k = 0; k < e.nl - 1; k++) dashed(between(m, e, s * (laneOffset(e, k) + laneOffset(e, k + 1)) / 2), WHITE, 3, 22, 26);
      solid(between(m, e, s * (e.hw - 9)), 'rgba(232,230,222,.7)', 2);
    }
  } else if (e.kind === 'front') {
    dashed(between(m, e, 0), WHITE, 3, 22, 26);
    for (const s of [1, -1]) solid(between(m, e, s * (e.hw - 9)), 'rgba(232,230,222,.7)', 2);
    // direction arrows every so often
    const lp = between(m, e, laneOffset(e, 0));
    if (lp) { const pts = lp.map((p) => ({ ...p })); const L = measure(pts); for (let s = 140; s < L - 60; s += 420) arrow(g, pointAt(pts, s)); }
  } else if (e.kind === 'st' || e.kind === 'drive') {
    dashed(between(m, e, 0), YELLOW, 3, 20, 20);
    for (const s of [1, -1]) solid(between(m, e, s * (e.hw - 8)), 'rgba(232,230,222,.55)', 2);
  } else if (e.kind === 'minor') {
    dashed(between(m, e, 0), 'rgba(232,230,222,.8)', 2, 14, 20);
  } else if (e.kind === 'rural') {
    dashed(between(m, e, 0), 'rgba(232,185,35,.75)', 2, 24, 30);
  }
  // stop lines and zebra crossings where the edge meets a signalled / busy junction
  for (const end of [e.a, e.b]) {
    const n = m.nodes[end];
    if (n.lvl !== 0 || n.edges.length < 3 || n.island) continue;
    const t = n.trim[e.id] || 0;
    if (t < 8) continue;
    const fwd = end === e.a;
    const pts = fwd ? e.pts : e.pts.slice().reverse();
    const pp = pts.map((p) => ({ x: p.x, y: p.y }));
    measure(pp);
    const at = pointAt(pp, t + 2);
    const nx = -at.ty, ny = at.tx; // left of travel away from the node
    // crossing: stripes across the whole carriageway, just outside the junction box
    if (CITY.has(e.kind) && e.w >= 5 * TILE) {
      const c = pointAt(pp, t + 16);
      g.fillStyle = 'rgba(236,234,226,.9)';
      g.save(); g.translate(c.x, c.y); g.rotate(Math.atan2(c.ty, c.tx));
      for (let k = -e.hw + 10; k < e.hw - 12; k += 14) g.fillRect(-11, k, 22, 8);
      g.restore();
    }
    // stop line on the approach (the right-hand side for traffic arriving at this node)
    if (n.light && (!e.oneway || !fwd)) {
      const s = pointAt(pp, t + 34);
      g.strokeStyle = 'rgba(236,234,226,.92)'; g.lineWidth = 5;
      const w0 = e.oneway ? -e.hw + 6 : 2, w1 = e.hw - 6;
      g.beginPath(); g.moveTo(s.x + nx * w0, s.y + ny * w0); g.lineTo(s.x + nx * w1, s.y + ny * w1); g.stroke();
    }
  }
}

function arrow(g, p) {
  g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.ty, p.tx));
  g.fillStyle = 'rgba(236,234,226,.75)';
  g.fillRect(-18, -3, 22, 6);
  g.beginPath(); g.moveTo(4, -10); g.lineTo(18, 0); g.lineTo(4, 10); g.closePath(); g.fill();
  g.restore();
}

// Bounding box of an edge's drawn outline (for chunk indexing).
export function edgeRect(e) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of e.pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  const pad = e.hw + 3 * TILE;
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
