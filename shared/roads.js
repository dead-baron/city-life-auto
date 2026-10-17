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
import { wrap } from './roadcore.js';
export * from './roadcore.js';   // (the network's runtime - lanes, turns, heights, zebra crossings: shared/roadcore.js, which the page reads without the builder)

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
// Out in the country - the farm valley, the desert, the woods and the peaks, the rocks and the water - a road has no
// pavement and no street lamps, whatever its class (World v3 step 1: the county roads between the towns were paved
// like city streets); a town's own streets keep theirs (its district's class).
export const SIDEWALK = { downtown: 112, commercial: 96, residential: 64, none: 0 };
const SIDEWALK_CLASS = { towers: 'downtown', commercial: 'commercial', civic: 'commercial', nightlife: 'commercial', redlight: 'commercial', beach: 'commercial', arts: 'commercial', rural: 'none', desert: 'none', wild: 'none', rocky: 'none', water: 'none' };
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
    return { ...l, i, pts, len, hw: ((l.w || K.w) * TILE) / 2, cuts: [] };   // (l.w: a line's own width in tiles - World v3's Midtown streets, wide enough for their parking lanes)
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
  // (a line whose box is further off than it could snap from is passed over without measuring)
  const snapBox = new Map();
  for (const o of L) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of o.pts) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; } const r = Math.max(o.hw, 40) + 13; snapBox.set(o, [x0 - r, y0 - r, x1 + r, y1 + r]); }
  for (const l of L) {
    for (const end of [0, 1]) {
      const e = end ? l.pts[l.pts.length - 1] : l.pts[0];
      const lv = endLvl(l, end);
      let best = null;
      for (const o of L) {
        if (o === l || midLvl(o) !== lv) continue;
        const sb = snapBox.get(o); if (e.x < sb[0] || e.x > sb[2] || e.y < sb[1] || e.y > sb[3]) continue;
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
        w: (l.w || K.w) * TILE, hw: ((l.w || K.w) * TILE) / 2, nl: K.nl, median: K.median, oneway: !!(l.oneway || K.oneway), bridge: false, culdesac: !!l.culdesac,
      };
      if (l.lvl === 'ramp' && l.zr && c0.s < 1 && c1.s > l.len - 1) e.zr = l.zr.slice(); // (a whole ramp: its climb as laid)
      if (l.notraffic) e.notraffic = true;   // (World v3's wild tracks: the traffic keeps off them - server/systems/traffic.js)
      if (l.park) e.park = l.park;   // (a parking lane along each kerb, px: the traffic lanes inside it - roadcore.js laneOffset)
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
      if (!e1 || !e2 || e1 === e2 || e1.dead || e2.dead || e1.kind !== e2.kind || e1.lvl !== e2.lvl || e1.oneway !== e2.oneway || e1.name !== e2.name || (e1.park || 0) !== (e2.park || 0)) continue;
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

// (Signals' timing: shared/signals.js signalFor.)
