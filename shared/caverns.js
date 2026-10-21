// The caverns' layout (World v3's map.caverns: shared/world3-caves.js lays each out - the Redwood Caverns, Nature-B1):
// built, carved and dressed here like a mine's cave in shared/underground.js, which this module registers itself with
// (registerCaverns) wherever it's loaded - the server (server/systems/underground.js), the cave's view
// (client/underground/view.js), the tests. Integer hashes and plain arithmetic, no trigonometry: the same everywhere.
import { TILE } from './constants.js';
import { mulberry32 } from './rng.js';
import { UG, C, registerCaverns, _ug } from './underground.js';

const { region, cellAt, setCell, capsule, disc, wallSpots, floorSpots, pickN, vnoise, segDist, len, kSeed } = _ug;

// A cavern (World v3's map.caverns: shared/world3-caves.js lays each out - its mouths, chambers, river, docks... all in
// px): its chambers and passages as a mine cave's are, its mouths (mouths[0] is the cave's mouth and inside, as a mine
// cave's one), the rest kept as its plan for the carving and the dressing.
export function buildCavern(map, P, k) {
  const chambers = P.chambers.map((c) => ({ id: c.id, name: c.name, x: c.x, y: c.y, r: c.r, depth: c.depth, glow: c.glow || null, kind: c.kind || null, ores: c.ores || null }));
  const ch = {};
  for (const c of chambers) ch[c.id] = c;
  if (!ch.pool && ch.lake) ch.pool = ch.lake;   // (the still water the cave fish live in - fishing.js: the great lake)
  const mouths = P.mouths.map((q) => ({ name: q.name, kind: q.kind, x: q.x, y: q.y, out: q.out ? { x: q.out.x, y: q.out.y } : { x: q.x, y: q.y + 26 }, inside: { x: q.inside.x, y: q.inside.y }, toward: q.toward || null }));
  const M0 = mouths[0];
  const passages = (P.passages || []).map(([a, b, via]) => ({ a, b, via: null, vias: (via || []).map(([x, y]) => ({ x, y })) }));
  return { k, kind: 'cavern', key: P.key || null, name: P.name, X: M0.x, face: M0.y, flip: 1, mouth: M0, inside: M0.inside, mouths, chambers, ch, passages, river: null, fork: null, plan: P };
}
// A cavern's rock, carved from its plan (P: shared/world3-caves.js): its box round everything in it; the chambers; the
// passages between them; the ways in from each mouth; the river's corridor (a bank either side), the river down it, the
// great lake, the sea pool at its mouth; the cascades across it; the docks out over it.
export function carveCavern(F, K, s2) {
  const P = K.plan, rv = P.river;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x, y, r) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const c of K.chambers) grow(c.x, c.y, c.r * 1.6);
  for (const M of K.mouths) { grow(M.x, M.y, 200); grow(M.inside.x, M.inside.y, 200); }
  if (rv) for (const [x, y] of rv.pts) grow(x, y, rv.hw + 220);
  if (P.lake) grow(P.lake.x, P.lake.y, P.lake.r + 200);
  if (P.sea) grow(P.sea.x, P.sea.y, P.sea.r + 120);
  for (const ps of K.passages) for (const q of ps.vias) grow(q.x, q.y, 140);
  const cr = region(F, x0 / TILE - 4, y0 / TILE - 4, x1 / TILE + 4, y1 / TILE + 4);
  cr.ug = UG.CAVE;
  for (const c of K.chambers) disc(cr, c.x, c.y, c.r, C.FLOOR, false, 0.55, s2 + c.depth);
  for (const ps of K.passages) {
    const a = K.ch[ps.a], b = K.ch[ps.b], pts = [a, ...ps.vias, b];
    for (let i = 1; i < pts.length; i++) capsule(cr, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, ps.hw || 46, C.FLOOR, false, 0.6, s2 + 7);
  }
  for (const M of K.mouths) {
    capsule(cr, M.x, M.y, M.inside.x, M.inside.y, 46, C.FLOOR, false, 0.25, s2 + 9);
    const to = M.toward && K.ch[M.toward];
    if (to) capsule(cr, M.inside.x, M.inside.y, to.x, to.y, 46, C.FLOOR, false, 0.35, s2 + 10);
  }
  if (rv) {
    for (let i = 1; i < rv.pts.length; i++) capsule(cr, rv.pts[i - 1][0], rv.pts[i - 1][1], rv.pts[i][0], rv.pts[i][1], rv.hw + (rv.bank || 76), C.FLOOR, false, 0.45, s2 + 14);
    // (vary: the banks wider and narrower as it goes - halls opening off the river, narrows where the rock comes close)
    if (rv.vary) for (let i = 1; i < rv.pts.length; i++) {
      const [ax, ay] = rv.pts[i - 1], [bx, by] = rv.pts[i], n = Math.max(1, Math.ceil(len(bx - ax, by - ay) / 40));
      for (let j = 0; j < n; j++) {
        const x = ax + (bx - ax) * j / n, y = ay + (by - ay) * j / n, v = vnoise(x, y, 520, s2 + 17);
        if (v > 0.45) disc(cr, x, y, rv.hw + rv.bank * (0.8 + (v - 0.45) * 5.5), C.FLOOR, false, 0.6, s2 + 18);
      }
    }
    if (P.lake) disc(cr, P.lake.x, P.lake.y, P.lake.r + (rv.bank || 76) + 20, C.FLOOR, false, 0.5, s2 + 15);
    for (let i = 1; i < rv.pts.length; i++) capsule(cr, rv.pts[i - 1][0], rv.pts[i - 1][1], rv.pts[i][0], rv.pts[i][1], rv.hw, C.RIVER, true, 0.25, s2 + 11);
    if (P.lake) disc(cr, P.lake.x, P.lake.y, P.lake.r, C.RIVER, true, 0.3, s2 + 13);
    if (P.sea) disc(cr, P.sea.x, P.sea.y, P.sea.r, C.RIVER, true, 0.3, s2 + 16);
    // the cascades: a band across the river (white water, a wall to everyone) - only over the river's own cells
    for (const q of P.cascades || []) {
      const tx0 = Math.floor((q.x - rv.hw - 60) / TILE), tx1 = Math.floor((q.x + rv.hw + 60) / TILE), ty0 = Math.floor((q.y - rv.hw - 60) / TILE), ty1 = Math.floor((q.y + rv.hw + 60) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const cx = (tx + 0.5) * TILE - q.x, cy = (ty + 0.5) * TILE - q.y, along = cx * q.ux + cy * q.uy, across = -cx * q.uy + cy * q.ux;
        if (Math.abs(along) <= (q.t || 26) && Math.abs(across) <= rv.hw + 50 && cellAt(cr, tx, ty) === C.RIVER) setCell(cr, tx, ty, C.CASCADE, true);
      }
    }
  }
  for (const d of P.docks || []) capsule(cr, d.x0, d.y0, d.x1, d.y1, d.hw || 18, C.DOCK, true);
  // little pools of still water about the dry chambers' floors
  const rp = mulberry32(s2 + 21);
  for (const c of K.chambers) if (c.kind === 'glow' || c.kind === 'crystal' || c.kind === 'den') { const px = c.x + Math.round((rp() - 0.5) * c.r), py = c.y + Math.round((rp() - 0.5) * c.r); if (cellAt(cr, Math.floor(px / TILE), Math.floor(py / TILE)) === C.FLOOR) disc(cr, px, py, 22 + Math.round(rp() * 14), C.POOL, true); }
  return cr;
}
// A cavern's dressing, as a mine cave's (its glowing things, roosts, falling rocks, the den, stalagmites) from its
// chambers' kinds, and from its plan: the docks and their boats, lanterns, chests, stairs, cascades, barrels, the den's
// moss and the sea cave's cobbles.
export function dressCavern(L, K) {
  const R = K.region, P = K.plan, rnd = mulberry32(kSeed((L.seed ^ 0x6a7) >>> 0, K.k));
  const glow = [];
  for (const c of K.chambers) {
    if (!c.glow) continue;
    for (const kind of c.glow.split('+')) {
      const n = kind === 'worms' ? 7 : kind === 'crystal' ? 7 : 8;
      const spots = kind === 'mush' ? wallSpots(R, c.x, c.y, c.r + 40) : floorSpots(R, c.x, c.y, c.r);
      for (const s of pickN(rnd, spots, n)) glow.push({ x: Math.round(s.x + (s.nx || 0) * 8), y: Math.round(s.y + (s.ny || 0) * 8), r: kind === 'worms' ? 120 : kind === 'crystal' ? 90 : 76, kind, k: 0.55 + rnd() * 0.35, ...(kind === 'crystal' ? { hue: rnd() < 0.5 ? 1 : 0 } : {}) });
    }
  }
  // along the river: glow-worms on the roof of the long reaches, teal mushrooms on its banks
  const rv = P.river;
  if (rv) {   // (every so far along it: a cluster of glow-worms on the roof, mushrooms by the bank)
    let s0 = 0, nextW = 260, nextM = 520;
    for (let i = 1; i < rv.pts.length; i++) {
      const [ax, ay] = rv.pts[i - 1], [bx, by] = rv.pts[i];
      s0 += len(bx - ax, by - ay);
      if (s0 >= nextW) { nextW += 640; for (const s of pickN(rnd, floorSpots(R, bx, by, rv.hw + 60), 1)) glow.push({ x: Math.round(s.x), y: Math.round(s.y), r: 120, kind: 'worms', k: 0.45 + rnd() * 0.3 }); }
      if (s0 >= nextM) { nextM += 900; for (const s of pickN(rnd, wallSpots(R, bx, by, rv.hw + 140), 2)) glow.push({ x: Math.round(s.x), y: Math.round(s.y), r: 70, kind: 'mush', k: 0.5 + rnd() * 0.3 }); }
    }
  }
  K.glow = glow;
  const byKind = (k) => K.chambers.filter((c) => c.kind === k);
  const roostIn = [...byKind('glow'), ...byKind('crystal'), ...byKind('lake')].slice(0, 4);
  K.roosts = roostIn.map((c, i) => { const s = pickN(rnd, floorSpots(R, c.x, c.y, Math.min(c.r, 140)), 1)[0] || c; return { i, x: Math.round(s.x), y: Math.round(s.y), r: 240 }; });
  // rocks fall where the roof is cracked: in the passages off the river
  const rocks = [];
  for (const ps of K.passages.slice(0, 3)) {
    const a = K.ch[ps.a], b = K.ch[ps.b], m = ps.vias[0] || { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = pickN(rnd, floorSpots(R, m.x, m.y, 70), 1)[0];
    if (s) rocks.push({ i: rocks.length, x: Math.round(s.x), y: Math.round(s.y) });
  }
  K.rocks = rocks;
  // the den: against the back wall of the den chamber, the furthest floor from the river
  const d = byKind('den')[0] || K.chambers[K.chambers.length - 1];
  let den = null;
  const nearR = (x, y) => { if (!rv) return 0; let b = Infinity; for (let i = 1; i < rv.pts.length; i++) b = Math.min(b, segDist(x, y, rv.pts[i - 1][0], rv.pts[i - 1][1], rv.pts[i][0], rv.pts[i][1]).d); return b; };
  for (const s of wallSpots(R, d.x, d.y, d.r + 30)) { const far = nearR(s.x, s.y); if (!den || far > den.far) den = { x: Math.round(s.x - s.nx * 20), y: Math.round(s.y - s.ny * 20), far }; }
  K.den = den ? { x: den.x, y: den.y } : { x: d.x, y: d.y };
  K.boat = null;
  K.boats = (P.docks || []).filter((q) => q.boat).map((q, i) => ({ i, x: q.boat.x, y: q.boat.y, a: q.boat.a }));
  K.docks = (P.docks || []).map((q) => ({ x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, hw: q.hw || 18 }));
  K.lanterns = (P.lanterns || []).map((q) => ({ x: q.x, y: q.y }));
  // (chests and the cave's things stand on dry floor: each on the nearest floor clear of the water to where it's planned)
  const dry = (x, y) => {
    const tx0 = Math.floor(x / TILE), ty0 = Math.floor(y / TILE);
    let best = null;
    for (let r = 0; r <= 7 && !best; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = tx0 + dx, ty = ty0 + dy;
      if (cellAt(R, tx, ty) !== C.FLOOR) continue;
      let wet = false; for (let j = -1; j <= 1 && !wet; j++) for (let i = -1; i <= 1; i++) { const v = cellAt(R, tx + i, ty + j); if (v === C.RIVER || v === C.POOL || v === C.CASCADE || v === C.DOCK) { wet = true; break; } }
      if (wet) continue;
      const d = (tx - tx0) * (tx - tx0) + (ty - ty0) * (ty - ty0);
      if (!best || d < best.d) best = { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, d };
    }
    return best ? { x: Math.round(best.x), y: Math.round(best.y) } : { x, y };
  };
  K.chests = (P.chests || []).map((q, i) => ({ i, ...dry(q.x, q.y), a: q.a || 0 }));
  K.stairs = (P.stairs || []).map((q) => ({ ...q }));
  K.cascades = (P.cascades || []).map((q) => ({ x: q.x, y: q.y, ux: q.ux, uy: q.uy, w: (rv ? rv.hw : 60) + 20 }));
  K.things = (P.things || []).map((q) => ({ ...q, ...dry(q.x, q.y) }));
  K.moss = (P.moss || []).map((q) => ({ ...q }));
  K.cobbles = (P.cobbles || []).map((q) => ({ ...q }));
  K.seep = P.seep ? { ...P.seep } : null;
  K.spikes = [];
  for (const c of K.chambers) for (const s of pickN(rnd, floorSpots(R, c.x, c.y, c.r), c.kind === 'lake' ? 12 : 5)) K.spikes.push({ x: Math.round(s.x), y: Math.round(s.y), s: 0.6 + rnd() * 0.8 });
}

registerCaverns({ buildCavern, carveCavern, dressCavern });
