// The way to your waypoint along the roads: the GPS line on the world map and the radar. An A* search over the road
// graph (shared/map.js nodes and edges: an edge's points run from node a to node b), from the nearest point of a road
// to you to the nearest point of a road to the waypoint, then the last stretch off the road to the spot itself.
// Driving, the one-way streets are taken the right way round and the highway (its ramps) is open; on foot, only the
// streets, either way.
//   createRouter(map) -> { update(from, to, driving, now) -> route | null, route }
//   route: { pts: [{x, y}] from you to the waypoint, len (px) }
// update() works the route out again when the waypoint or the way of travel changes, when you've strayed off it,
// and otherwise every few seconds - never more often than every 400 ms.
import { MAP_W } from '../shared/constants.js';
const SEG_CELL = 1024;

export function createRouter(map) {
  // the roads' segments in a coarse grid, for the nearest-road search
  const cells = new Map(), cols = Math.ceil((MAP_W * 32) / SEG_CELL) + 1;   // (the world's whole frame: the road list is the world's)
  for (const e of map.edges || []) {
    for (let i = 1; i < e.pts.length; i++) {
      const a = e.pts[i - 1], b = e.pts[i];
      const c0 = Math.floor(Math.min(a.x, b.x) / SEG_CELL), c1 = Math.floor(Math.max(a.x, b.x) / SEG_CELL);
      const r0 = Math.floor(Math.min(a.y, b.y) / SEG_CELL), r1 = Math.floor(Math.max(a.y, b.y) / SEG_CELL);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const k = r * cols + c; let l = cells.get(k); if (!l) cells.set(k, (l = [])); l.push([e, i]); }
    }
  }
  const usable = (e, driving) => (driving ? true : e.lvl === 0);
  // the nearest point of a usable road: { e, i (segment end index), s (distance along the edge to it), x, y, d }
  function nearest(x, y, driving) {
    let best = null;
    for (let ring = 0; ring <= 3 && !best; ring++) {
      const c0 = Math.floor(x / SEG_CELL) - ring, r0 = Math.floor(y / SEG_CELL) - ring;
      for (let r = r0; r <= r0 + ring * 2; r++) for (let c = c0; c <= c0 + ring * 2; c++) {
        if (ring && r > r0 && r < r0 + ring * 2 && c > c0 && c < c0 + ring * 2) continue;   // (only the new ring)
        for (const [e, i] of cells.get(r * cols + c) || []) {
          if (!usable(e, driving)) continue;
          const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
          const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(px - x, py - y);
          if (!best || d < best.d) best = { e, i, x: px, y: py, d, s: (a.s ?? 0) + Math.sqrt(L2) * t };
        }
      }
    }
    return best;
  }
  // the edge's points from distance s0 to s1 along it (either way round)
  function along(e, s0, s1, out) {
    const fwd = s1 >= s0, pts = e.pts;
    const at = (s) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], sa = a.s ?? 0, sb = b.s ?? e.len;
        if (s <= sb || i === pts.length - 1) { const t = sb > sa ? Math.max(0, Math.min(1, (s - sa) / (sb - sa))) : 0; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
      }
      return pts[pts.length - 1];
    };
    out.push(at(s0));
    if (fwd) { for (const p of pts) if ((p.s ?? 0) > s0 && (p.s ?? 0) < s1) out.push(p); }
    else for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; if ((p.s ?? 0) < s0 && (p.s ?? 0) > s1) out.push(p); }
    out.push(at(s1));
  }
  // A* from the start's road position to the goal's
  function search(A, B, driving) {
    const nodes = map.nodes, N = nodes.length;
    const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
    const heap = [];
    const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (n) => Math.hypot(nodes[n].x - B.x, nodes[n].y - B.y);
    const E = A.e;
    // off the start's edge: to its b end (forward), and to its a end unless it's one-way and you're driving
    const startTo = [[E.b, E.len - A.s]];
    if (!(driving && E.oneway)) startTo.push([E.a, A.s]);
    for (const [n, d] of startTo) if (d < g[n]) { g[n] = d; came[n] = -2; push(n, d + h(n)); }
    // onto the goal's edge: from its a end forward, or from its b end back (unless one-way and driving)
    const F = B.e, endFrom = new Map([[F.a, B.s]]);
    if (!(driving && F.oneway)) endFrom.set(F.b, F.len - B.s);
    let bestEnd = -1, bestCost = Infinity;
    // the start and the goal on the same edge, the right way round: straight along it
    if (E === F && (B.s >= A.s || !(driving && E.oneway))) { bestCost = Math.abs(B.s - A.s); bestEnd = -3; }
    while (heap.length) {
      const [f, n] = pop();
      if (shut[n]) continue;
      shut[n] = 1;
      if (f >= bestCost) break;
      if (endFrom.has(n) && g[n] + endFrom.get(n) < bestCost) { bestCost = g[n] + endFrom.get(n); bestEnd = n; }
      const node = nodes[n];
      const out = driving ? Object.entries(node.links || {}) : node.edges.map((id) => { const e = map.edges[id]; return [id, e.a === n ? e.b : e.a]; });
      for (const [id, m] of out) {
        const e = map.edges[id];
        if (!e || !usable(e, driving)) continue;
        const nd = g[n] + e.len;
        if (nd < g[m]) { g[m] = nd; came[m] = n; via[m] = +id; push(m, nd + h(m)); }
      }
    }
    if (bestEnd === -1) return null;
    const pts = [];
    if (bestEnd === -3) { along(E, A.s, B.s, pts); return pts; }
    // the chain of nodes back to the start
    const chain = [];
    for (let n = bestEnd; n >= 0; n = came[n]) { chain.push(n); if (came[n] === -2) break; }
    chain.reverse();
    const first = chain[0];
    along(E, A.s, first === E.b ? E.len : 0, pts);
    for (let k = 1; k < chain.length; k++) {
      const e = map.edges[via[chain[k]]];
      if (e.a === chain[k - 1]) along(e, 0, e.len, pts); else along(e, e.len, 0, pts);
    }
    along(F, bestEnd === F.a ? 0 : F.len, B.s, pts);
    return pts;
  }

  const R = { route: null, key: '', at: 0, from: null };
  R.update = (from, to, driving, now = performance.now()) => {
    if (!to) { R.route = null; R.key = ''; return null; }
    const key = `${Math.round(to.x)},${Math.round(to.y)},${driving ? 1 : 0}`;
    const strayed = R.route && R.from && Math.hypot(from.x - R.from.x, from.y - R.from.y) > 160 && offRoute(R.route.pts, from.x, from.y) > 220;
    if (key === R.key && !strayed && now - R.at < 4000) return R.route;
    if (now - R.at < 400 && key === R.key) return R.route;
    R.key = key; R.at = now; R.from = { x: from.x, y: from.y };
    const A = nearest(from.x, from.y, driving), B = nearest(to.x, to.y, driving);
    if (!A || !B || Math.hypot(to.x - from.x, to.y - from.y) < 200) { R.route = null; return null; }
    const pts = search(A, B, driving);
    if (!pts) { R.route = null; return null; }
    pts.unshift({ x: from.x, y: from.y });
    pts.push({ x: to.x, y: to.y });
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    R.route = { pts, len };
    return R.route;
  };
  return R;
}

// how far a point is from a polyline (px)
function offRoute(pts, x, y) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  return best;
}
