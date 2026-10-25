// The road network's runtime: what reads a built network - the lanes (laneOffset, lanePath), the roads' heights
// (edgeZ), the turns, the ways out of a junction, the nearest edge, the zebra crossings. The page and the bake workers
// import this, never the network builder (shared/roads.js, the generator's: it re-exports all of this, so the server
// and the tools that import from there are unchanged). Moved here from roads.js as it was.
import { TILE } from './constants.js';
import { measure, pointAt, project, offset, closestOnSeg } from './geom.js';

export const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };   // (the builder's too: roads.js finishNetwork)

// ---------------------------------------------------------------------------------------------
// Lanes

// Lane centre offset from the road's centre line (px, to the right of travel). Lane 0 is the
// outer (right-hand, kerb-side) lane.
export function laneOffset(e, k) {
  if (e.oneway) { const lw = e.w / e.nl; return (k - (e.nl - 1) / 2) * -lw; }
  const lw = (e.w / 2 - e.median / 2 - (e.park || 0)) / e.nl;   // (e.park: a parking lane along each kerb - World v3's Midtown streets)
  return e.median / 2 + lw * (e.nl - 0.5 - k);
}

// The polyline a car follows along edge e leaving node `from` in lane k, trimmed clear of the
// junction boxes at both ends. Cached on the edge.
export function lanePath(net, e, from, k) {
  const fwd = e.a === from;
  const ck = (fwd ? 'f' : 'r') + k;
  e._lane ??= {};
  if (e._lane[ck]) return e._lane[ck];
  const base = fwd ? e.pts : e.pts.slice().reverse();
  const off = offset(base, laneOffset(e, k)).map((p) => ({ x: p.x, y: p.y }));
  measure(off);
  const L = off[off.length - 1].s;
  const na = net.nodes[fwd ? e.a : e.b], nb = net.nodes[fwd ? e.b : e.a];
  let t0 = na.trim[e.id] || 0, t1 = nb.trim[e.id] || 0;
  if (t0 + t1 > L - 16) { const k2 = (L - 16) / Math.max(1, t0 + t1); t0 *= k2; t1 *= k2; }
  const pts = [];
  const a = pointAt(off, t0), b = pointAt(off, L - t1);
  pts.push({ x: a.x, y: a.y });
  for (const p of off) if (p.s > t0 + 4 && p.s < L - t1 - 4) pts.push({ x: p.x, y: p.y });
  pts.push({ x: b.x, y: b.y });
  measure(pts);
  e._lane[ck] = pts;
  return pts;
}

// Height of the road surface (0 ground .. 1 deck) at arc length s from node `from`: eased, and on a ramp with
// e.zr only between those fractions of its length (level before and after).
export function edgeZ(e, from, s) {
  if (e.lvl !== 'ramp') return e.lvl === 1 ? 1 : 0;
  let t = Math.max(0, Math.min(1, s / e.len));
  if (e.a !== from) t = 1 - t;              // (measured from end a)
  if (e.zr) t = Math.max(0, Math.min(1, (t - e.zr[0]) / Math.max(1e-6, e.zr[1] - e.zr[0])));
  const u = t * t * (3 - 2 * t);
  return e.za + (e.zb - e.za) * u;
}

// Turn path through a junction: from the end of the incoming lane to the start of the outgoing
// one, a quadratic curve whose control point is where the two lane lines would meet.
export function turnPath(p0, d0, p1, d1, n = 6) {
  const den = d0.x * d1.y - d0.y * d1.x;
  let c;
  if (Math.abs(den) > 0.15) {
    const t = ((p1.x - p0.x) * d1.y - (p1.y - p0.y) * d1.x) / den;
    const span = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    c = t > 0 && t < span * 1.5 ? { x: p0.x + d0.x * t, y: p0.y + d0.y * t } : { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  } else c = { x: (p0.x + p1.x) / 2 + d0.x * 4, y: (p0.y + p1.y) / 2 + d0.y * 4 };
  const out = [];
  for (let k = 1; k < n; k++) { const t = k / n, u = 1 - t; out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y }); }
  return out;
}

// Which edges a driver may take leaving node n having arrived along inEdge (no U-turns unless
// it's a dead end; on the deck only gentle diverges; a ramp's foot is an ordinary junction).
export function exitsFrom(net, n, inEdge) {
  const inDir = n.dirs[inEdge] + Math.PI; // heading on arrival
  const out = [];
  for (const [id, to] of Object.entries(n.links)) {
    const eid = +id;
    if (eid === inEdge) continue;
    const turn = Math.abs(wrap(n.dirs[eid] - inDir));
    if (turn > (n.lvl === 1 ? 1.15 : 2.3)) continue;
    out.push({ edge: eid, to, turn: wrap(n.dirs[eid] - inDir) });
  }
  if (!out.length && n.links[inEdge] !== undefined) out.push({ edge: inEdge, to: n.links[inEdge], turn: Math.PI });
  return out;
}

// Nearest point on any edge (optionally only some levels): { e, s, d, x, y }.
export function nearestEdge(net, x, y, filter = null) {
  let best = null;
  const p = { x, y };
  for (const e of net.edges) {
    if (filter && !filter(e)) continue;
    const bb = e.bb || (e.bb = bbox(e.pts));
    if (best && (x < bb.x0 - best.d || x > bb.x1 + best.d || y < bb.y0 - best.d || y > bb.y1 + best.d)) continue;
    const pr = project(e.pts, p);
    if (pr && (!best || pr.d < best.d)) best = { e, s: pr.s, d: pr.d, x: pr.x, y: pr.y };
  }
  return best;
}

export function bbox(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}

// Visit every tile within `pad` px of an edge's centre line: fn(tx, ty, dist, segDir).
export function stampEdge(e, pad, fn) {
  stampLine(e.pts, pad, fn);
}
export function stampLine(pts, pad, fn) {
  if (pts[0].s === undefined) measure(pts);
  const best = new Map();
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const tx0 = Math.floor((Math.min(a.x, b.x) - pad) / TILE), tx1 = Math.floor((Math.max(a.x, b.x) + pad) / TILE);
    const ty0 = Math.floor((Math.min(a.y, b.y) - pad) / TILE), ty1 = Math.floor((Math.max(a.y, b.y) + pad) / TILE);
    const horiz = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const q = closestOnSeg({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE }, a, b);
      const d = Math.hypot((tx + 0.5) * TILE - q.x, (ty + 0.5) * TILE - q.y);
      if (d > pad) continue;
      const kk = ty * 65536 + tx;
      const cur = best.get(kk);
      if (!cur || d < cur[2]) best.set(kk, [tx, ty, d, horiz, a.s + (b.s - a.s) * q.t]);
    }
  }
  for (const v of best.values()) fn(v[0], v[1], v[2], v[3], v[4]);
}

// ---- zebra crossings --------------------------------------------------------------------------
// One across each city street where it meets a signalled junction - except where it would pile
// onto another crossing (two junctions close together, a short link between them, a skewed
// corner) or lie across another street's asphalt. Decided once per map, busiest junctions first,
// so the renderer never stacks stripes on stripes.
// Never at a junction a highway or one of its ramps comes into (the owner, 2026-10-11: "the streets that touch the
// highways have crosswalks out to the highway, should go all the way across it or not at all" - none across a highway,
// so none leading out to one), and never two side by side (the owner: "some intersections with double crosswalks next to
// each other in parallel just need one crosswalk"): of two parallel crossings on one street closer than XING_TWIN (the
// two ends of a short link), the busier junction's is kept.
const XING_STREETS = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front', 'art']);
const XING_HL = 11; // half the stripe length (along the road)
const XING_TWIN = 200; // px between two parallel crossings' centres along the street, under which only one is kept
const highwayArm = (m, n) => n.edges.some((id) => { const o = m.edges[id]; return o.kind === 'hwy' || o.kind === 'ramp' || o.lvl === 'ramp'; });
const twins = (k, c) => k.node !== c.node && Math.abs(Math.sin(k.a - c.a)) < 0.26
  && Math.abs((c.x - k.x) * Math.cos(k.a) + (c.y - k.y) * Math.sin(k.a)) < XING_TWIN && Math.abs((c.y - k.y) * Math.cos(k.a) - (c.x - k.x) * Math.sin(k.a)) < Math.max(k.hw, c.hw);

function obbOverlap(a, b, pad) {
  const axes = [a.a, a.a + Math.PI / 2, b.a, b.a + Math.PI / 2];
  const ext = (r, ax) => {
    const c = Math.cos(ax), s = Math.sin(ax);
    const ca = Math.abs(Math.cos(r.a - ax)), sa = Math.abs(Math.sin(r.a - ax));
    return { p: r.x * c + r.y * s, h: r.hl * ca + r.hw * sa };
  };
  for (const ax of axes) {
    const A = ext(a, ax), B = ext(b, ax);
    if (Math.abs(A.p - B.p) > A.h + B.h + pad) return false;
  }
  return true;
}

export function zebraCrossings(m) {
  if (m._xings) return m._xings;
  const cands = [];
  for (const e of m.edges) {
    if (e.lvl !== 0 || !XING_STREETS.has(e.kind) || e.w < 5 * TILE || e.bridge) continue;
    for (const end of [e.a, e.b]) {
      const n = m.nodes[end];
      if (n.lvl !== 0 || n.edges.length < 3 || n.island || !n.light || highwayArm(m, n)) continue;
      const t = n.trim[e.id] || 0;
      if (t < 8) continue;
      const fwd = end === e.a;
      const pp = (fwd ? e.pts : e.pts.slice().reverse()).map((p) => ({ x: p.x, y: p.y }));
      const L = measure(pp);
      const far = m.nodes[fwd ? e.b : e.a];
      if (t + 16 + XING_HL + 24 > L - (far.trim[e.id] || 0)) continue; // no room on a short link
      const c = pointAt(pp, t + 16);
      // ref: the half width of a boulevard's planted median and its kerbs across the crossing's middle - a paved refuge,
      // never stripes over the grass (the owner, notes 2: "crosswalks painted over the grass")
      const ref = e.kind === 'blvd' && e.median > 0 ? Math.max(6, e.median / 2 - 1) + 2 : 0;
      cands.push({ key: `${e.id}:${end}`, edge: e.id, node: end, x: c.x, y: c.y, a: Math.atan2(c.ty, c.tx), hl: XING_HL, hw: e.hw - 4, ref, rank: n.edges.length * 1e4 + e.w });
    }
  }
  cands.sort((a, b) => b.rank - a.rank);
  // nearby streets, for the "lies on another street" check
  const CELL = 512, grid = new Map();
  for (const e of m.edges) {
    if (e.lvl !== 0) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of e.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    for (let cy = Math.floor((y0 - e.hw) / CELL); cy <= Math.floor((y1 + e.hw) / CELL); cy++)
      for (let cx = Math.floor((x0 - e.hw) / CELL); cx <= Math.floor((x1 + e.hw) / CELL); cx++) {
        const k = cy * 8192 + cx;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(e);
      }
  }
  const onOther = (c) => {
    const nx = -Math.sin(c.a), ny = Math.cos(c.a);
    const nn = m.nodes[c.node];
    for (const f of [-0.85, -0.45, 0, 0.45, 0.85]) {
      const px = c.x + nx * c.hw * f, py = c.y + ny * c.hw * f;
      for (const o of grid.get(Math.floor(py / CELL) * 8192 + Math.floor(px / CELL)) || []) {
        if (o.id === c.edge) continue;
        // a twin of this street leaving the same junction the same way shares its asphalt
        if (nn.edges.includes(o.id) && Math.abs(Math.atan2(Math.sin(nn.dirs[o.id] - nn.dirs[c.edge]), Math.cos(nn.dirs[o.id] - nn.dirs[c.edge]))) < 0.35) continue;
        for (let i = 0; i + 1 < o.pts.length; i++) {
          const q = closestOnSeg({ x: px, y: py }, o.pts[i], o.pts[i + 1]);
          if ((i === 0 && q.t <= 0) || (i + 2 === o.pts.length && q.t >= 1)) continue; // past the street's end (its junction)
          if (Math.hypot(q.x - px, q.y - py) < o.hw - 10) {
            // inside the junction box itself is fine (that's where the streets meet)
            if (Math.hypot(px - nn.x, py - nn.y) < (nn.trim[o.id] || 0) - 2) continue;
            return true;
          }
        }
      }
    }
    return false;
  };
  const kept = new Map();
  const list = [];
  for (const c of cands) {
    if (list.some((k) => (Math.hypot(k.x - c.x, k.y - c.y) < k.hw + c.hw + 40 && obbOverlap(k, c, 6)) || twins(k, c))) continue;
    if (onOther(c)) continue;
    list.push(c);
    kept.set(c.key, c);
  }
  m._xings = kept;
  return kept;
}
