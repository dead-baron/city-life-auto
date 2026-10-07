// The road network: streets of any angle and curvature, the elevated highway and its ramps.
//
// The city generator describes roads as long polylines ("lines": an avenue across town, a
// curving riverside drive, the highway loop). buildNetwork() cuts them where they cross or
// where one ends on another, and turns that into a graph: junction nodes and edges, each edge a
// polyline with lanes. Both server and client build it from the same seed, so it is never sent.
//
// Levels: lvl 0 = ground, lvl 1 = the highway deck. Ramps are their own kind: one-way edges
// that climb from a ground junction to a merge on the deck (on-ramp) or back down (off-ramp).
// Ground lines only cut ground lines, deck lines only deck lines; ramps join the two by their
// ends.
//
// Traffic uses lane polylines (offset from the centre line, trimmed at the junction boxes) and
// Bezier turn paths between them; signals have 2 or 3 phases depending on how many directions
// meet at a junction.
import { measure, pointAt, project, segX, dirOf, offset, closestOnSeg } from './geom.js';
import { hash2 } from './rng.js';

const TILE = 32;

// Road classes. w: total width (tiles); nl: lanes per direction; median (px) between the two
// directions; light: may get traffic lights; walk: the pavement either side - 'district' (the class
// of the district the road runs through, SIDEWALK below), px, or 0 for none.
// Highways run two lanes each way (81 px lanes); where a ramp joins or leaves, its acceleration or
// deceleration lane runs alongside as a third (the ramp's own first or last stretch, beside the deck).
export const ROAD_KINDS = {
  hwy: { w: 11, nl: 2, median: 28, light: false, deck: true, walk: 0 },
  ave: { w: 9, nl: 2, median: 14, light: true, walk: 'district' },
  blvd: { w: 9, nl: 2, median: 14, light: true, walk: 'district' },  // a curving boulevard (same section as an avenue)
  st: { w: 6, nl: 1, median: 0, light: true, walk: 'district' },
  minor: { w: 4, nl: 1, median: 0, light: false, walk: 64 },        // residential local: courts, loops
  drive: { w: 5, nl: 1, median: 0, light: true, walk: 'district' },  // coast / river drives
  rural: { w: 4, nl: 1, median: 0, light: false, walk: 0 },          // county road: a gravel shoulder, no pavement
  ramp: { w: 4, nl: 1, median: 0, light: false, oneway: true, walk: 0 },
  front: { w: 6, nl: 2, median: 0, light: true, oneway: true, walk: 'district' }, // frontage roads beside the ring, one-way
  art: { w: 7, nl: 1, median: 0, light: true, walk: 'district' },    // minor arterial: ring roads, harbor and airport roads, bridges to small towns
  dirt: { w: 4, nl: 1, median: 0, light: false, walk: 0 },           // unpaved tracks in the woods, the hills and the desert
  alley: { w: 3, nl: 1, median: 0, light: false, walk: 0 },          // back alleys between the buildings: one car wide each way, no pavement
};

// Pavement widths (World v2 cross-sections, docs/WORLD-V2.md): 112 px downtown, 96 px in commercial
// districts (shopping streets, nightlife, the civic quarter, the beachfront), 64 px everywhere else
// people live or work (homes, apartments, old town's narrow streets, industry, the port, parks).
export const SIDEWALK = { downtown: 112, commercial: 96, residential: 64 };
const SIDEWALK_CLASS = { towers: 'downtown', commercial: 'commercial', civic: 'commercial', nightlife: 'commercial', redlight: 'commercial', beach: 'commercial', arts: 'commercial' };
// The pavement (px) beside a road of this kind running through a district of this style.
export function sidewalkPx(kind, style) {
  const w = (ROAD_KINDS[kind] || ROAD_KINDS.st).walk;
  if (w !== 'district') return w || 0;
  return SIDEWALK[SIDEWALK_CLASS[style] || 'residential'];
}

// The road hierarchy, highest first: highway, major arterial, minor arterial / collector, street,
// county road, local road, dirt track. Roads join roads near their own rank (see map.js repair).
export const ROAD_RANK = { hwy: 6, ramp: 6, ave: 5, blvd: 5, front: 4, art: 4, drive: 4, st: 3, rural: 3, minor: 2, dirt: 1, alley: 1 };

export const LIGHT_CYCLE = 24; // divides the 1200 s chrono loop evenly

// ---------------------------------------------------------------------------------------------
// Building the graph

function subLine(pts, s0, s1) {
  const out = [];
  const a = pointAt(pts, s0), b = pointAt(pts, s1);
  out.push({ x: a.x, y: a.y });
  for (let i = 0; i < pts.length; i++) if (pts[i].s > s0 + 0.5 && pts[i].s < s1 - 0.5) out.push({ x: pts[i].x, y: pts[i].y });
  out.push({ x: b.x, y: b.y });
  return out;
}

// lines: [{ pts: [{x,y}] (px), kind, lvl: 0 | 1 | 'ramp', name?, oneway?, z0?, z1?, zr? }]
// For ramps z0/z1 give the height at the first and last point (0 ground, 1 deck); zr [t0, t1] (fractions of
// the length from the first point) is where the climb happens - level before and after (a ramp's run along the
// deck as an auxiliary lane, its level run-out to the street).
export function buildNetwork(lines, seed = 1) {
  const L = lines.filter((l) => l.pts.length >= 2).map((l, i) => {
    const pts = l.pts.map((p) => ({ x: p.x, y: p.y }));
    const len = measure(pts);
    const K = ROAD_KINDS[l.kind] || ROAD_KINDS.st;
    return { ...l, i, pts, len, hw: (K.w * TILE) / 2, cuts: [] };
  }).filter((l) => l.len > 8);
  // which level an end of a line lives on
  const endLvl = (l, end) => (l.lvl === 'ramp' ? ((end ? l.z1 : l.z0) > 0.5 ? 1 : 0) : l.lvl);
  const midLvl = (l) => (l.lvl === 'ramp' ? -1 : l.lvl); // ramps never cut other lines mid-way
  // a closed loop (the ring highway) gets cut into thirds so it has real end nodes
  for (const l of L) {
    const f = l.pts[0], e = l.pts[l.pts.length - 1];
    if (Math.hypot(f.x - e.x, f.y - e.y) < 1 && l.len > 600) l.closed = true;
  }
  const P = []; // points: {x, y, lvl}
  const addPt = (x, y, lvl) => { P.push({ x, y, lvl }); return P.length - 1; };

  // spatial hash of segments
  const CELL = 512;
  const grid = new Map();
  const key = (cx, cy) => cy * 4096 + cx;
  L.forEach((l) => {
    for (let k = 0; k + 1 < l.pts.length; k++) {
      const a = l.pts[k], b = l.pts[k + 1];
      for (let cy = Math.floor(Math.min(a.y, b.y) / CELL); cy <= Math.floor(Math.max(a.y, b.y) / CELL); cy++)
        for (let cx = Math.floor(Math.min(a.x, b.x) / CELL); cx <= Math.floor(Math.max(a.x, b.x) / CELL); cx++) {
          const kk = key(cx, cy);
          if (!grid.has(kk)) grid.set(kk, []);
          grid.get(kk).push([l.i, k]);
        }
    }
  });
  const byI = new Map(L.map((l) => [l.i, l]));
  // 1. crossings between lines on the same level
  const seen = new Set();
  for (const list of grid.values()) {
    for (let p = 0; p < list.length; p++) for (let q = p + 1; q < list.length; q++) {
      const [li, ki] = list[p], [lj, kj] = list[q];
      if (li === lj) continue;
      const A = byI.get(li), B = byI.get(lj);
      if (midLvl(A) < 0 || midLvl(A) !== midLvl(B)) continue;
      const tag = li < lj ? `${li}:${ki}:${lj}:${kj}` : `${lj}:${kj}:${li}:${ki}`;
      if (seen.has(tag)) continue;
      seen.add(tag);
      const x = segX(A.pts[ki], A.pts[ki + 1], B.pts[kj], B.pts[kj + 1]);
      if (!x) continue;
      const sa = A.pts[ki].s + (A.pts[ki + 1].s - A.pts[ki].s) * x.t;
      const sb = B.pts[kj].s + (B.pts[kj + 1].s - B.pts[kj].s) * x.u;
      const id = addPt(x.x, x.y, midLvl(A));
      A.cuts.push({ s: sa, p: id }); B.cuts.push({ s: sb, p: id });
    }
  }
  // 2. ends: snap onto a line of the same level they stop on (a T junction), else a dead end
  for (const l of L) {
    for (const end of [0, 1]) {
      const e = end ? l.pts[l.pts.length - 1] : l.pts[0];
      const lv = endLvl(l, end);
      let best = null;
      for (const o of L) {
        if (o === l || midLvl(o) !== lv) continue;
        if (Math.abs(o.pts[0].x - e.x) > o.len + o.hw + 64 && Math.abs(o.pts[o.pts.length - 1].x - e.x) > o.len + o.hw + 64) continue;
        const pr = project(o.pts, e);
        if (pr && pr.d <= Math.max(o.hw, 40) + 12 && (!best || pr.d < best.pr.d)) best = { o, pr };
      }
      let id;
      if (best) {
        // reuse a crossing already cut near there
        const near = best.o.cuts.find((c) => Math.abs(c.s - best.pr.s) < 40);
        if (near) id = near.p;
        else { id = addPt(best.pr.x, best.pr.y, lv); best.o.cuts.push({ s: best.pr.s, p: id }); }
      } else {
        const own = l.cuts.find((c) => Math.abs(c.s - (end ? l.len : 0)) < 24);
        id = own ? own.p : addPt(e.x, e.y, lv);
      }
      l.cuts.push({ s: end ? l.len : 0, p: id, end: true });
    }
  }
  for (const l of L) {
    if (!l.closed) continue;
    for (const f of [1 / 3, 2 / 3]) { const q = pointAt(l.pts, l.len * f); l.cuts.push({ s: l.len * f, p: addPt(q.x, q.y, midLvl(l) < 0 ? 0 : midLvl(l)) }); }
  }
  // 3. merge points that sit close together on the same level (a crossing of three roads etc.)
  const par = P.map((_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const pg = new Map();
  P.forEach((p, i) => { const k = `${p.lvl}:${Math.floor(p.x / 64)}:${Math.floor(p.y / 64)}`; if (!pg.has(k)) pg.set(k, []); pg.get(k).push(i); });
  P.forEach((p, i) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of pg.get(`${p.lvl}:${Math.floor(p.x / 64) + dx}:${Math.floor(p.y / 64) + dy}`) || []) {
        if (j <= i) continue;
        if (Math.hypot(P[j].x - p.x, P[j].y - p.y) < 56) par[find(j)] = find(i);
      }
    }
  });
  const rep = new Map();
  P.forEach((p, i) => { const r = find(i); if (!rep.has(r)) rep.set(r, { sx: 0, sy: 0, n: 0, lvl: p.lvl }); const q = rep.get(r); q.sx += p.x; q.sy += p.y; q.n++; });
  const nodeOf = new Map();
  const nodes = [];
  const nodeFor = (pi) => {
    const r = find(pi);
    if (nodeOf.has(r)) return nodeOf.get(r);
    const q = rep.get(r);
    const n = { id: nodes.length, x: q.sx / q.n, y: q.sy / q.n, lvl: q.lvl, edges: [], links: {} };
    nodes.push(n); nodeOf.set(r, n);
    return n;
  };
  // 4. edges between consecutive cuts
  const edges = [];
  const dup = new Set();
  for (const l of L) {
    const cuts = l.cuts.slice().sort((a, b) => a.s - b.s);
    const K = ROAD_KINDS[l.kind] || ROAD_KINDS.st;
    for (let k = 0; k + 1 < cuts.length; k++) {
      const c0 = cuts[k], c1 = cuts[k + 1];
      const na = nodeFor(c0.p), nb = nodeFor(c1.p);
      if (na === nb || c1.s - c0.s < 6) continue;
      const tag = `${Math.min(na.id, nb.id)}:${Math.max(na.id, nb.id)}:${l.kind}`;
      if (dup.has(tag)) continue;
      dup.add(tag);
      const pts = subLine(l.pts, c0.s, c1.s);
      // ends move onto their junction node - except a ramp's top end, which keeps its own
      // line beside the deck (it peels off the outer lane, not out of the median)
      const keepA = l.lvl === 'ramp' && na.lvl === 1, keepB = l.lvl === 'ramp' && nb.lvl === 1;
      if (!keepA) pts[0] = { x: na.x, y: na.y };
      if (!keepB) pts[pts.length - 1] = { x: nb.x, y: nb.y };
      const lvl = l.lvl === 'ramp' ? 'ramp' : l.lvl;
      const za = l.lvl === 'ramp' ? l.z0 + (l.z1 - l.z0) * (c0.s / l.len) : l.lvl;
      const zb = l.lvl === 'ramp' ? l.z0 + (l.z1 - l.z0) * (c1.s / l.len) : l.lvl;
      const e = {
        id: edges.length, a: na.id, b: nb.id, pts, len: 0, kind: l.kind, lvl, za, zb, name: l.name || '',
        w: K.w * TILE, hw: (K.w * TILE) / 2, nl: K.nl, median: K.median, oneway: !!(l.oneway || K.oneway), bridge: false, culdesac: !!l.culdesac,
      };
      if (l.lvl === 'ramp' && l.zr && c0.s < 1 && c1.s > l.len - 1) e.zr = l.zr.slice(); // (a whole ramp: its climb as laid)
      e.len = measure(e.pts);
      edges.push(e);
      na.edges.push(e.id); nb.edges.push(e.id);
    }
  }
  // 5. join chains through plain bends (two edges of one road meeting end to end)
  joinChains(nodes, edges);
  return finishNetwork(nodes, edges, seed);
}

function joinChains(nodes, edges) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes) {
      if (n.dead || n.edges.length !== 2) continue;
      const [e1, e2] = n.edges.map((id) => edges[id]);
      if (!e1 || !e2 || e1 === e2 || e1.dead || e2.dead || e1.kind !== e2.kind || e1.lvl !== e2.lvl || e1.oneway !== e2.oneway || e1.name !== e2.name) continue;
      if (e1.oneway && !(e1.b === n.id && e2.a === n.id) && !(e2.b === n.id && e1.a === n.id)) continue;
      // orient both so the chain runs first -> n -> second
      let first = e1, second = e2;
      if (e1.oneway && e1.a === n.id) { first = e2; second = e1; }
      const fpts = first.b === n.id ? first.pts : first.pts.slice().reverse();
      const fza = first.b === n.id ? first.za : first.zb;
      const fStart = first.b === n.id ? first.a : first.b;
      const spts = second.a === n.id ? second.pts : second.pts.slice().reverse();
      const szb = second.a === n.id ? second.zb : second.za;
      const sEnd = second.a === n.id ? second.b : second.a;
      if (fStart === sEnd) continue; // a loop: keep the node
      const pts = fpts.concat(spts.slice(1)).map((p) => ({ x: p.x, y: p.y }));
      first.pts = pts; first.a = fStart; first.b = sEnd; first.za = fza; first.zb = szb;
      first.len = measure(first.pts);
      second.dead = true;
      const ns = nodes[sEnd];
      ns.edges = ns.edges.map((id) => (id === second.id ? first.id : id));
      n.dead = true; n.edges = [];
      changed = true;
    }
  }
}

// Renumber after joining, then work out junction geometry, links and signals.
function finishNetwork(nodes0, edges0, seed) {
  const nodes = [], edges = [];
  const nmap = new Map();
  for (const n of nodes0) if (!n.dead && n.edges.some((id) => !edges0[id].dead)) { nmap.set(n.id, nodes.length); nodes.push({ ...n, id: nodes.length, edges: [], links: {} }); }
  for (const e of edges0) {
    if (e.dead || !nmap.has(e.a) || !nmap.has(e.b)) continue;
    const ne = { ...e, id: edges.length, a: nmap.get(e.a), b: nmap.get(e.b) };
    edges.push(ne);
    nodes[ne.a].edges.push(ne.id); nodes[ne.b].edges.push(ne.id);
  }
  // a one-way frontage piece that runs into a dead end (cut off by water) is two-way instead,
  // so nothing gets trapped at the end of it
  for (const e of edges) {
    if (!e.oneway || e.lvl !== 0) continue;
    if (nodes[e.a].edges.length === 1 || nodes[e.b].edges.length === 1) { e.oneway = false; e.nl = 1; }
  }
  for (const n of nodes) {
    // outgoing direction of each edge at this node
    n.dirs = {};
    for (const id of n.edges) {
      const e = edges[id];
      const pts = e.a === n.id ? e.pts : e.pts.slice().reverse();
      let k = 1;
      while (k < pts.length - 1 && Math.hypot(pts[k].x - pts[0].x, pts[k].y - pts[0].y) < 48) k++;
      const d = dirOf(pts[0], pts[k]);
      n.dirs[id] = Math.atan2(d.y, d.x);
    }
    for (const id of n.edges) { const e = edges[id]; if (!e.oneway || e.a === n.id) n.links[id] = e.a === n.id ? e.b : e.a; }
    // through pairs: two edges of the same road meeting nearly straight (a merge on the deck)
    const ids = n.edges;
    n.merge = n.lvl === 1 && ids.some((id) => edges[id].lvl === 'ramp');
    // trims: how far back from the centre each edge's lanes stop (clear of the crossing roads)
    n.trim = {};
    for (const id of ids) {
      const e = edges[id];
      // a ramp at a merge on the deck starts (or ends) right there, in line with the outer lane it peels off from
      // (or tapers into): no junction box to clear
      if (n.merge && e.lvl === 'ramp') { n.trim[id] = 0; continue; }
      let t = 0;
      for (const oid of ids) {
        if (oid === id) continue;
        const o = edges[oid];
        let th = Math.abs(wrap(n.dirs[id] - n.dirs[oid]));
        if (th > Math.PI - 0.35) continue; // its continuation
        if (n.merge && e.kind === 'hwy' && o.lvl === 'ramp') continue; // the highway runs straight through a merge
        th = Math.max(th, 0.3);
        const need = o.hw / Math.sin(Math.min(th, Math.PI / 2)) + (th < Math.PI / 2 ? e.hw / Math.tan(th) : 0);
        t = Math.max(t, Math.min(need, 900));
      }
      n.trim[id] = ids.length <= 1 ? 0 : t + (n.merge ? 0 : 10);
    }
    n.half = Math.max(0, ...Object.values(n.trim));
    // signals
    const roads = ids.map((id) => edges[id]).filter((e) => e.kind !== 'alley'); // an alley mouth never gets lights
    const lit = n.lvl === 0 && roads.length >= 3 && roads.some((e) => (ROAD_KINDS[e.kind] || {}).light) && !roads.every((e) => e.kind === 'minor' || e.kind === 'rural');
    n.light = lit || (n.lvl === 1 && !n.merge && ids.length >= 3);
    n.island = roads.every((e) => e.kind === 'rural');
    n.phase = Math.floor(hash2(Math.round(n.x), Math.round(n.y), seed) * LIGHT_CYCLE);
    n.group = {};
    if (n.light) {
      const main = roads.slice().sort((a, b) => b.w - a.w)[0];
      const ax = n.dirs[main.id];
      let three = false, across = false;
      for (const id of ids) {
        let d = Math.abs(wrap(n.dirs[id] - ax)) % Math.PI;
        if (d > Math.PI / 2) d = Math.PI - d;
        n.group[id] = d < 0.45 ? 0 : d > Math.PI / 2 - 0.45 ? 1 : 2;
        if (edges[id].kind === 'alley') continue; // (an alley mouth takes its turn, but never needs lights of its own)
        if (n.group[id] === 2) three = true;
        if (n.group[id] === 1) across = true;
      }
      n.phases = three ? 3 : 2;
      if (!across && !three) n.light = false; // everything on one axis (a slip road peeling off): no signal needed
    }
  }
  // Two signalled junctions so close that a car waiting at one stands in the other would lock each
  // other's queues solid: the smaller of the pair (narrower roads, fewer of them) gives way instead.
  for (const e of edges) {
    if (e.lvl !== 0) continue;
    const a = nodes[e.a], b = nodes[e.b];
    if (!a.light || !b.light || a.lvl !== 0 || b.lvl !== 0) continue;
    if (e.len - (a.trim[e.id] || 0) - (b.trim[e.id] || 0) >= SIGNAL_GAP) continue;
    const size = (n) => n.edges.reduce((s, id) => s + edges[id].w, 0);
    (size(a) >= size(b) ? b : a).light = false;
  }
  return { nodes, edges };
}
const SIGNAL_GAP = 3.5 * TILE; // px of road between the stop lines of two signalled junctions, at least (a car waiting at one clear of the other)

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// ---------------------------------------------------------------------------------------------
// Signals

// State of the signal facing traffic that arrives at node n along edge edgeId: 'G' | 'Y' | 'R'.
export function signalFor(n, edgeId, tSec) {
  if (!n.light) return 'G';
  const g = n.group[edgeId] ?? 0;
  const t = ((tSec + n.phase) % LIGHT_CYCLE + LIGHT_CYCLE) % LIGHT_CYCLE;
  if (n.phases === 3) {
    const slot = Math.floor(t / 8), u = t - slot * 8;
    if (slot !== g) return 'R';
    return u < 6 ? 'G' : u < 7.5 ? 'Y' : 'R';
  }
  if (g === 0) return t < 9 ? 'G' : t < 11 ? 'Y' : 'R';
  return t < 12 ? 'R' : t < 21 ? 'G' : t < 23 ? 'Y' : 'R';
}

// ---------------------------------------------------------------------------------------------
// Lanes

// Lane centre offset from the road's centre line (px, to the right of travel). Lane 0 is the
// outer (right-hand, kerb-side) lane.
export function laneOffset(e, k) {
  if (e.oneway) { const lw = e.w / e.nl; return (k - (e.nl - 1) / 2) * -lw; }
  const lw = (e.w / 2 - e.median / 2) / e.nl;
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
const XING_STREETS = new Set(['ave', 'blvd', 'st', 'minor', 'drive', 'front', 'art']);
const XING_HL = 11; // half the stripe length (along the road)

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
      if (n.lvl !== 0 || n.edges.length < 3 || n.island || !n.light) continue;
      const t = n.trim[e.id] || 0;
      if (t < 8) continue;
      const fwd = end === e.a;
      const pp = (fwd ? e.pts : e.pts.slice().reverse()).map((p) => ({ x: p.x, y: p.y }));
      const L = measure(pp);
      const far = m.nodes[fwd ? e.b : e.a];
      if (t + 16 + XING_HL + 24 > L - (far.trim[e.id] || 0)) continue; // no room on a short link
      const c = pointAt(pp, t + 16);
      cands.push({ key: `${e.id}:${end}`, edge: e.id, node: end, x: c.x, y: c.y, a: Math.atan2(c.ty, c.tx), hl: XING_HL, hw: e.hw - 4, rank: n.edges.length * 1e4 + e.w });
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
    if (list.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < k.hw + c.hw + 40 && obbOverlap(k, c, 6))) continue;
    if (onOther(c)) continue;
    list.push(c);
    kept.set(c.key, c);
  }
  m._xings = kept;
  return kept;
}
