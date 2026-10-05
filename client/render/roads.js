// Streets drawn from the road network's curves (baked into the ground chunks): smooth asphalt
// and pavements along diagonal and curving roads, kerbs, lane markings, stop lines, zebra
// crossings and cul-de-sac turning circles. The tile map underneath still decides collisions;
// this just makes it look like real roads instead of staircases.
import { TILE, T } from '../../shared/constants.js';
import { DISTRICTS } from '../../shared/map.js';
import { GROUND_TEX } from '../../shared/prefab-data.js';
import { laneOffset, zebraCrossings } from '../../shared/roads.js';
import { offset, measure, pointAt } from '../../shared/geom.js';
import { atlas } from './sprites.js';

const CITY = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front', 'art']);
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
// Clip to everywhere except the carriageways of the other ground-level roads at this edge's ends.
function clipOutNeighbours(g, m, e) {
  for (const end of [e.a, e.b]) {
    const n = m.nodes[end];
    if (!n || n.lvl !== 0) continue;
    for (const id of n.edges) {
      if (id === e.id) continue;
      const o = m.edges[id];
      if (!o || o.lvl !== 0) continue;
      const R = geo(o).road;
      g.beginPath();
      g.rect(-1e6, -1e6, 2e6, 2e6);
      g.moveTo(R[0].x, R[0].y);
      for (let i = 1; i < R.length; i++) g.lineTo(R[i].x, R[i].y);
      g.closePath();
      g.clip('evenodd');
    }
  }
}
function line(g, pts) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
}

const distAt = (m, x, y) => DISTRICTS[m.dist[Math.min(m.h - 1, Math.max(0, Math.floor(y / TILE))) * m.w + Math.min(m.w - 1, Math.max(0, Math.floor(x / TILE)))]];

// The stretches of a road that are out over water (with a little run onto each bank), as
// polylines - where it gets a bridge deck.
function overWater(m, e) {
  if (e._wet !== undefined) return e._wet;
  const pts = e.pts.map((p) => ({ x: p.x, y: p.y }));
  const L = measure(pts), wet = [];
  let s0 = -1;
  for (let s = 0; s <= L + 8; s += 12) {
    const p = pointAt(pts, Math.min(s, L));
    const t = m.tileAtPx(p.x, p.y);
    const w = s <= L && (t === T.BRIDGE || t === T.WATER || t === T.DEEP);
    if (w && s0 < 0) s0 = s;
    if (!w && s0 >= 0) { wet.push([Math.max(0, s0 - 40), Math.min(L, s + 28)]); s0 = -1; }
  }
  e._wet = wet.map(([a, b]) => { const out = []; for (let s = a; s < b; s += 10) { const p = pointAt(pts, s); out.push({ x: p.x, y: p.y }); } const p = pointAt(pts, b); out.push({ x: p.x, y: p.y }); return out; }).filter((q) => q.length > 2);
  return e._wet;
}

// Bridge decks under the roads that cross water: a smooth concrete deck following the road's
// own curve (no tile staircases), its side face and shadow on the water, piers, the walkway and
// parapet rails with posts, and lamp posts.
function drawDecks(g, m, edges) {
  const band = (pts, d) => offset(pts, d).concat(offset(pts, -d).reverse());
  for (const e of edges) {
    if (!e.bridge || e.lvl !== 0) continue;
    for (const pts of overWater(m, e)) {
      const hw = e.hw + 10;
      // shadow on the water (light from the north-west), then piers standing in it
      g.save(); g.translate(12, 16); g.fillStyle = 'rgba(0,8,22,.42)'; poly(g, band(pts, hw)); g.fill(); g.restore();
      const L = measure(pts);
      for (let s = 60; s < L - 40; s += 190) {
        const p = pointAt(pts, s), nx = -p.ty, ny = p.tx;
        for (const sd of [-1, 1]) {
          g.fillStyle = '#5a5d64'; g.beginPath(); g.ellipse(p.x + nx * sd * (hw - 14) + 6, p.y + ny * sd * (hw - 14) + 10, 9, 6, Math.atan2(p.ty, p.tx), 0, 6.283); g.fill();
        }
      }
      // side face, then the deck
      g.save(); g.translate(0, 6); g.fillStyle = '#4e5158'; poly(g, band(pts, hw)); g.fill(); g.restore();
      g.fillStyle = '#9a9ca3'; poly(g, band(pts, hw)); g.fill();
      g.fillStyle = '#b3b5ba'; poly(g, band(pts, hw - 3)); g.fill();
      // parapets: a dark rail on the outer edge with posts, and a lip against the roadway
      for (const sd of [-1, 1]) {
        g.strokeStyle = '#3c3e44'; g.lineWidth = 2.5; line(g, offset(pts, sd * (hw - 1))); g.stroke();
        g.strokeStyle = '#2c2e33'; g.lineWidth = 4; g.setLineDash([3, 13]); line(g, offset(pts, sd * (hw - 1))); g.stroke(); g.setLineDash([]);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5; line(g, offset(pts, sd * (e.hw + 1))); g.stroke();
      }
      for (let s = 30; s < L; s += 220) { // lamps
        const p = pointAt(pts, s), nx = -p.ty, ny = p.tx;
        for (const sd of [-1, 1]) { g.fillStyle = '#26282d'; g.fillRect(p.x + nx * sd * (hw - 5) - 2, p.y + ny * sd * (hw - 5) - 2, 4, 4); }
      }
    }
  }
}

// Every ground-level road touching a chunk, in three passes so junctions overlap cleanly.
export function drawRoads(g, m, edges, nodes) {
  if (!edges.length && !nodes.length) return;
  g.save();
  g.lineJoin = 'round';
  drawDecks(g, m, edges);
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
    g.beginPath(); g.arc(n.x, n.y, (n.bulb || 3.6 * TILE) + 2 * TILE, 0, 6.283); g.fill();
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
    // one asphalt everywhere at street level (wear is laid over it below, not swapped in)
    g.fillStyle = (e.kind === 'dirt' ? pattern(g, 'dirt') : pattern(g, 'asphalt')) || (e.kind === 'dirt' ? '#8a6a44' : '#3a3b40');
    poly(g, G.road); g.fill();
    if (e.kind !== 'dirt') weather(g, e, G, d);
  }
  for (const n of nodes) if (n.culdesac) {
    const d = distAt(m, n.x, n.y);
    g.fillStyle = pattern(g, 'asphalt') || '#3a3b40';
    g.beginPath(); g.arc(n.x, n.y, n.bulb || 3.6 * TILE, 0, 6.283); g.fill();
    g.strokeStyle = '#cfcdc4'; g.lineWidth = 4; g.stroke();
  }
  // 4. kerb shadow, lane markings, stop lines and crossings
  // (each road's paint stays off the asphalt of the roads it meets: no edge line, centre line or
  // stop line runs on into a junction across the other street)
  for (const e of edges) {
    if (e.lvl !== 0) continue;
    g.save();
    clipOutNeighbours(g, m, e);
    if (CITY.has(e.kind) && !e.bridge) {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1;
      for (const s of [1, -1]) { const q = between(m, e, s * (e.hw - 1)); if (q) { line(g, q); g.stroke(); } }
    }
    markings(g, m, e);
    g.restore();
  }
  g.restore();
}

// Gores: where a ramp runs beside the frontage road, the strip between them is asphalt with a white
// chevron hatch, bounded by solid white lines, and a kerb runs along the ramp's outer edge until it
// lifts off onto its embankment.
export function drawGores(g, m, gores) {
  if (!gores.length) return;
  g.save();
  for (const gr of gores) {
    const P = gr.pts, n = P.length;
    // which way from the road the ramp lies, at each sample
    const side = P.map((p) => { const dx = p.x - p.qx, dy = p.y - p.qy, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; });
    const roadEdge = P.map((p, i) => ({ x: p.qx + side[i][0] * (gr.rhw - 2), y: p.qy + side[i][1] * (gr.rhw - 2) }));
    const rampNear = P.map((p, i) => ({ x: p.x - side[i][0] * gr.hw, y: p.y - side[i][1] * gr.hw }));
    const rampFar = P.map((p, i) => ({ x: p.x + side[i][0] * (gr.hw + 1), y: p.y + side[i][1] * (gr.hw + 1) }));
    // asphalt across the whole strip
    g.fillStyle = pattern(g, 'asphalt') || '#3a3b40';
    g.beginPath();
    g.moveTo(roadEdge[0].x, roadEdge[0].y);
    for (let i = 1; i < n; i++) g.lineTo(roadEdge[i].x, roadEdge[i].y);
    for (let i = n - 1; i >= 0; i--) g.lineTo(rampFar[i].x, rampFar[i].y);
    g.closePath(); g.fill();
    // the painted gore between the lanes: chevrons pointing the way traffic flows
    const gap = P.map((p, i) => Math.hypot(rampNear[i].x - roadEdge[i].x, rampNear[i].y - roadEdge[i].y));
    g.save();
    g.beginPath();
    g.moveTo(roadEdge[0].x, roadEdge[0].y);
    for (let i = 1; i < n; i++) g.lineTo(roadEdge[i].x, roadEdge[i].y);
    for (let i = n - 1; i >= 0; i--) g.lineTo(rampNear[i].x, rampNear[i].y);
    g.closePath(); g.clip();
    g.strokeStyle = 'rgba(236,234,226,.8)'; g.lineWidth = 3;
    for (let i = 2; i < n - 1; i += 3) {
      if (gap[i] < 10) continue;
      const a = roadEdge[i], b = rampNear[Math.max(0, i - 2)];
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    g.restore();
    g.strokeStyle = 'rgba(236,234,226,.85)'; g.lineWidth = 2.5;
    for (const L of [roadEdge, rampNear]) { g.beginPath(); g.moveTo(L[0].x, L[0].y); for (let i = 1; i < n; i++) g.lineTo(L[i].x, L[i].y); g.stroke(); }
    // a zebra crossing where the pavement crosses the ramp's mouth
    for (let i = 1; i < n; i++) {
      if (P[i].d < gr.rhw + 1.3 * TILE) continue;
      const dx = P[i].x - P[i - 1].x, dy = P[i].y - P[i - 1].y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      g.fillStyle = 'rgba(236,234,226,.85)';
      for (let k = -gr.hw + 5; k < gr.hw - 4; k += 9) {
        const cx = P[i].x - uy * k, cy = P[i].y + ux * k;
        g.save(); g.translate(cx, cy); g.rotate(Math.atan2(uy, ux)); g.fillRect(-12, -2.5, 24, 5); g.restore();
      }
      break;
    }
    // kerb on the ramp's outer edge (while it's still down on the ground)
    g.strokeStyle = '#cfcdc4'; g.lineWidth = 4;
    g.beginPath();
    let on = false;
    for (let i = 0; i < n; i++) { if (P[i].z > 0.3) break; if (!on) { g.moveTo(rampFar[i].x, rampFar[i].y); on = true; } else g.lineTo(rampFar[i].x, rampFar[i].y); }
    g.stroke();
  }
  g.restore();
}

// ---- road wear ---------------------------------------------------------------------------------
// Instead of tiling one weathered patch (which repeats every few metres), wear is scattered: soft-
// edged blotches cut from the worn-asphalt art, each turned, scaled and faded differently, laid at
// hashed spots along the road. Rough districts get a lot of it, smart ones a light scattering
// (which also breaks up the clean asphalt's own repeat). Deterministic per edge, so chunks meet.
const WEAR = { asphalt_worn: 0.45, asphalt: 0.1 };
let blots = null;
function wearBlots() {
  if (blots || !atlas.ground || !GROUND_TEX.asphalt_worn) return blots;
  const [ax, ay] = GROUND_TEX.asphalt_worn;
  blots = [];
  for (let k = 0; k < 8; k++) {
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(atlas.ground, ax + (k * 37) % 64, ay + (k * 53) % 64, S, S, 0, 0, S, S);
    // an irregular soft mask: a few overlapping radial blobs
    g.globalCompositeOperation = 'destination-in';
    const m = document.createElement('canvas'); m.width = m.height = S;
    const mg = m.getContext('2d');
    for (let j = 0; j < 4; j++) {
      const cx = S / 2 + Math.sin(k * 3.1 + j * 1.7) * 12, cy = S / 2 + Math.cos(k * 2.3 + j * 2.9) * 12, r = 14 + ((k + j * 5) % 7) * 2.5;
      const gr = mg.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, 'rgba(0,0,0,.9)'); gr.addColorStop(0.6, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = gr; mg.fillRect(0, 0, S, S);
    }
    g.drawImage(m, 0, 0);
    blots.push(c);
  }
  return blots;
}
const hsh = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function weather(g, e, G, d) {
  const bl = wearBlots();
  if (!bl) return;
  const dens = WEAR[d.road] ?? 0.12;
  const pts = e.pts.map((p) => ({ x: p.x, y: p.y }));
  const L = measure(pts);
  const n = Math.floor((L * e.w) / (64 * 64) * dens);
  if (n <= 0) return;
  g.save();
  poly(g, G.road); g.clip();
  for (let k = 0; k < n; k++) {
    const h1 = hsh(e.id, k * 4 + 1), h2 = hsh(e.id, k * 4 + 2), h3 = hsh(e.id, k * 4 + 3), h4 = hsh(e.id, k * 4 + 4);
    const p = pointAt(pts, h1 * L);
    const off = (h2 - 0.5) * (e.w - 16);
    const x = p.x - p.ty * off, y = p.y + p.tx * off;
    const sc = 0.6 + h3 * 1.1;
    g.globalAlpha = (d.road === 'asphalt_worn' ? 0.32 : 0.18) + h4 * 0.22;
    g.save(); g.translate(x, y); g.rotate(h4 * 6.283); g.scale(sc, sc * (0.7 + h2 * 0.6));
    g.drawImage(bl[Math.floor(h3 * bl.length) % bl.length], -32, -32);
    g.restore();
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
  // a short link between two junctions close together is junction, not street: no lines on it
  const na = m.nodes[e.a], nb = m.nodes[e.b];
  const avail = e.len - ((na && na.trim[e.id]) || 0) - ((nb && nb.trim[e.id]) || 0);
  const linked = (na && na.edges.length >= 3) && (nb && nb.edges.length >= 3);
  if (linked && avail < 150 && e.kind !== 'hwy') { crossings(g, m, e, false); return; }
  laneLines(g, m, e);
  crossings(g, m, e, avail > 200);
}
function laneLines(g, m, e) {
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
  } else if (e.kind === 'alley') {
    // a back alley: no lines, just the gutter down the middle and grime along the walls
    solid(between(m, e, 0), 'rgba(20,20,24,.45)', 3);
    for (const sd of [1, -1]) solid(between(m, e, sd * (e.hw - 3)), 'rgba(0,0,0,.28)', 6);
  } else if (e.kind === 'rural') {
    dashed(between(m, e, 0), 'rgba(232,185,35,.75)', 2, 24, 30);
  } else if (e.kind === 'art') {
    // minor arterial: double yellow centre line, white edge lines
    solid(between(m, e, 3), YELLOW, 2.5); solid(between(m, e, -3), YELLOW, 2.5);
    for (const s of [1, -1]) solid(between(m, e, s * (e.hw - 9)), 'rgba(232,230,222,.7)', 2);
  } else if (e.kind === 'hwy') {
    // the ground-level highways between the islands: a median, three lanes each way
    solid(between(m, e, 0), 'rgba(166,168,173,.95)', e.median - 8);
    for (const s of [1, -1]) {
      solid(between(m, e, s * (e.median / 2 - 2)), YELLOW, 2.5);
      for (let k = 0; k + 1 < e.nl; k++) dashed(between(m, e, s * (laneOffset(e, k) + laneOffset(e, k + 1)) / 2), WHITE, 3, 26, 30);
      solid(between(m, e, s * (e.hw - 9)), 'rgba(232,230,222,.8)', 2.5);
    }
  } else if (e.kind === 'dirt') {
    // wheel ruts
    for (const s of [1, -1]) { const q = between(m, e, s * 22); if (q) { g.strokeStyle = 'rgba(70,50,28,.35)'; g.lineWidth = 6; line(g, q); g.stroke(); } }
  }
}
// stop lines and zebra crossings where the edge meets a signalled / busy junction
function crossings(g, m, e, stops) {
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
    // (only where it doesn't pile onto another crossing or another street: shared/roads.js)
    const xc = zebraCrossings(m).get(`${e.id}:${end}`);
    if (xc) {
      g.fillStyle = 'rgba(236,234,226,.9)';
      g.save(); g.translate(xc.x, xc.y); g.rotate(xc.a);
      for (let k = -e.hw + 10; k < e.hw - 12; k += 14) g.fillRect(-11, k, 22, 8);
      g.restore();
    }
    // stop line on the approach (the right-hand side for traffic arriving at this node)
    if (stops && n.light && (!e.oneway || !fwd) && e.kind !== 'alley' && e.kind !== 'minor' && e.kind !== 'dirt') {
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
