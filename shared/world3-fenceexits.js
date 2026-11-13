// World v3: a fenced place people go into has ways out on more than one side (the owner, 11-12: "some areas like soccer
// fields will be fenced off entirely except for one point to enter ... there should be logical exit points so players
// don't walk in and get stuck and have to go back out the way they came. So maybe an exit near the corners (maybe not
// the corners itself)"). Run after shared/world3-fencegaps.js (which keeps the doors, the gates and the paths open):
//   - the enclosures: the ground people walk on, closed off by the fences people can't walk through (shared/fences.js
//     fenceSegments) together with buildings and water - a gate a builder left (a gap of up to EXITS3.close px between
//     one fence's end and another fence) counts as closed while they're found, so an enclosure with one gate is still
//     one. Each is filled from what marks it (a court, a hoop, a net, a pitch, a dog run's sign, a skate park's ramps,
//     a community garden's beds, a park's sign, a pier's railing), at most EXITS3.cap tiles and no road in it;
//   - what each is: the public ones people are meant to go into (EXITS3 kinds: courts, pitches, dog runs, skate parks,
//     community gardens, park enclosures, piers) are opened; what keeps people out stays shut - the prison (its gate is
//     server/systems/gates.js), pools and the water park (their safety fences), the arena (the car soccer gate), the
//     airport's and the port's security fences (barbed chain-link, the yard fences), private yards (a home's door in
//     it), anything else not on the list (backyards, the formal gardens' hedged beds, the farms' fields and pens);
//   - each opened one gets at least two ways out on different sides where its shape allows (one where it's all one
//     side to land, a pier: one), a gap EXITS3.gap px wide EXITS3.corner tiles in from the end of a side - near the
//     corner, not in it - the first on the side facing the nearest pavement, path or road (unless a gate already
//     does), the second on another side, as far from the others as it can be; only where the ground both sides is
//     clear to walk (no stand, no tree, no wall in the way) and out there is somewhere to go.
// Deterministic: integer tiles, the map's own order; no Math.sin & co.
import { TILE, T } from './constants.js';
import { fenceKit } from './world3-fencegaps.js';

// close: px between a fence's end and another fence that counts as a gate (closed while finding the enclosures);
// cap: the most tiles an enclosure has; gap: px wide, a way out (two people side by side); corner: tiles from the end of
// a side to the middle of a way out
export const EXITS3 = { close: 6 * TILE, cap: 12000, gap: 80, corner: 4, reach: 40 };
const PATH_T = new Set([T.SIDEWALK, T.ROAD, T.PLAZA, T.DIRT, T.DOCK, T.BRIDGE, T.LOT]);
// what marks an enclosure (the props that start a fill) and what keeps one shut
const MARK = new Set(['court', 'hoop', 'tnet', 'raisedbed', 'kicker', 'qpipe', 'pyramid', 'flatbar', 'parksign', 'textsign']);
const POOLISH = new Set(['lguard', 'diveboard', 'wslide', 'lanerope']);
const SKATE = new Set(['kicker', 'qpipe', 'pyramid', 'flatbar']);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // (the sides: E, W, S, N - a step's way out)
const SIDE = ['E', 'W', 'S', 'N'];

export function fenceExits3(m) {
  const out = { found: 0, opened: 0, already: 0, stuck: 0, kept: {}, byKind: {}, gaps: 0, short: 0 };
  // (what it found and cut, for the tests: not carried with the map to the pages - the region index - nor its signature)
  for (const k of ['cuts', 'places', 'shut']) Object.defineProperty(out, k, { value: [], enumerable: false });
  const K = fenceKit(m, { gaps: 0, byKind: {} });
  const { segs, walk, cross, cutAt } = K;
  if (!segs.length) return out;
  // ---- the gates builders left: a fence's end within `close` of another fence (closed while the enclosures are found)
  const near = (s, x, y) => { const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy; const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / l2)) : 0; return [s.x0 + dx * t, s.y0 + dy * t]; };
  const C = 256, cg = new Map(), ck = (cx, cy) => cy * 65536 + cx;
  segs.forEach((s, i) => {
    const L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0)), n = Math.max(1, Math.ceil(L / (C / 2)));
    let last = -1;
    for (let j = 0; j <= n; j++) { const k = ck(Math.floor((s.x0 + (s.x1 - s.x0) * j / n) / C), Math.floor((s.y0 + (s.y1 - s.y0) * j / n) / C)); if (k === last) continue; last = k; let a = cg.get(k); if (!a) cg.set(k, (a = [])); if (a[a.length - 1] !== i) a.push(i); }
  });
  const virt = [];
  segs.forEach((s, i) => {
    for (const [ex, ey] of [[s.x0, s.y0], [s.x1, s.y1]]) {
      let best = null, bd = EXITS3.close;
      const cx = Math.floor(ex / C), cy = Math.floor(ey / C), seen = new Set();
      for (let gy = cy - 1; gy <= cy + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) for (const j of cg.get(ck(gx, gy)) || []) {
        if (j === i || seen.has(j)) continue;
        seen.add(j);
        const [qx, qy] = near(segs[j], ex, ey), d = Math.sqrt((qx - ex) * (qx - ex) + (qy - ey) * (qy - ey));
        if (d < bd) { bd = d; best = [qx, qy]; }
      }
      if (best && bd > 20) virt.push({ x0: ex, y0: ey, x1: best[0], y1: best[1] });
    }
  });
  const vgrid = new Map();
  virt.forEach((s, id) => {
    const L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0)), n = Math.max(1, Math.ceil(L / 12));
    for (let j = 0; j <= n; j++) { const tx = Math.floor((s.x0 + (s.x1 - s.x0) * j / n) / TILE), ty = Math.floor((s.y0 + (s.y1 - s.y0) * j / n) / TILE); if (!m.inside(tx, ty)) continue; const k = m.idx(tx, ty); let a = vgrid.get(k); if (!a) vgrid.set(k, (a = [])); if (a[a.length - 1] !== id) a.push(id); }
  });
  const vcross = (ax, ay, bx, by) => {
    const px = (ax + 0.5) * TILE, py = (ay + 0.5) * TILE, qx = (bx + 0.5) * TILE, qy = (by + 0.5) * TILE;
    for (const k of [m.idx(ax, ay), m.idx(bx, by)]) for (const id of vgrid.get(k) || []) {
      const s = virt[id], d1x = qx - px, d1y = qy - py, d2x = s.x1 - s.x0, d2y = s.y1 - s.y0, den = d1x * d2y - d1y * d2x;
      if (den === 0) continue;
      const u = ((s.x0 - px) * d2y - (s.y0 - py) * d2x) / den, v = ((s.x0 - px) * d1y - (s.y0 - py) * d1x) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return true;
    }
    return false;
  };
  // a step's fences: 1 a fence, 2 a builder's gate (closed for now), 0 nothing
  const stepBar = (ax, ay, bx, by) => (cross(ax, ay, bx, by) ? 1 : vcross(ax, ay, bx, by) ? 2 : 0);

  // ---- the enclosures: filled from their marks -------------------------------------------------------------------
  const st = new Uint8Array(m.tiles.length);   // (1 open ground, 2 in an enclosure)
  const regionOf = new Map();                  // (tile -> the enclosure it's in)
  const CAP = EXITS3.cap, qx = new Int32Array(CAP + 4), qy = new Int32Array(CAP + 4);
  const regions = [];
  // -> the enclosure (tile, ...) is in, or null (open ground)
  const fill = (sx, sy) => {
    if (!walk(sx, sy)) return null;
    const k0 = m.idx(sx, sy);
    if (st[k0] === 1) return null;
    if (st[k0] === 2) return regionOf.get(k0);
    const vis = [k0], border = [];
    st[k0] = 3;
    qx[0] = sx; qy[0] = sy;
    let n = 1, open = false;
    for (let h = 0; h < n && !open; h++) {
      const cx = qx[h], cy = qy[h];
      for (let d = 0; d < 4; d++) {
        const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
        if (!walk(nx, ny)) continue;
        const k = m.idx(nx, ny);
        if (st[k] === 3) continue;
        const bar = stepBar(cx, cy, nx, ny);
        if (bar) { border.push([cx, cy, d, bar]); continue; }
        if (st[k] === 1 || n >= CAP || m.tiles[k] === T.ROAD) { open = true; break; }   // (a road in it: open ground)
        st[k] = 3; vis.push(k); qx[n] = nx; qy[n] = ny; n++;
      }
    }
    if (open) { for (const k of vis) st[k] = 1; return null; }
    const tiles = [];
    for (let i = 0; i < n; i++) tiles.push([qx[i], qy[i]]);
    const R = { id: regions.length, tiles, border, set: new Set(vis) };
    for (const k of vis) { st[k] = 2; regionOf.set(k, R); }
    regions.push(R);
    return R;
  };
  const seedAt = (x, y) => {   // (a prop's place: its tile, or one beside it to stand on)
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    for (const [dx, dy] of [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]]) if (walk(tx + dx, ty + dy)) return fill(tx + dx, ty + dy);
    return null;
  };
  // the marks: the props, the venues (the pitches), the piers' railings (a rail or an iron railing with boards beside it)
  const marks = new Map();   // (enclosure -> the props in it that matter: { t: count })
  const tileOf = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.idx(tx, ty) : -1; };
  m.props.forEach((p) => {
    if (!p || !MARK.has(p.t)) return;
    if (p.t === 'textsign' && p.text !== 'DOG RUN') return;
    seedAt(p.x, p.y);
  });
  for (const v of m.venues || []) if (v && v.rect) seedAt(v.rect.x + v.rect.w / 2, v.rect.y + v.rect.h / 2);
  // (and the pools' decks: found so they're known to stay shut)
  for (const q of m.pools || []) if (q) for (const [x, y] of [[q.x - 40, q.y + q.h / 2], [q.x + q.w + 40, q.y + q.h / 2], [q.x + q.w / 2, q.y - 40], [q.x + q.w / 2, q.y + q.h + 40]]) seedAt(x, y);
  for (const s of segs) {
    if (s.dead || s.src < 0) continue;
    const p = m.props[s.src];
    if (!(p.t === 'rail' || (p.t === 'fenceline' && (p.kind === 'iron' || p.kind === 'rail')))) continue;
    const L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0));
    if (L < 8) continue;
    const ux = (s.x1 - s.x0) / L, uy = (s.y1 - s.y0) / L, mx = (s.x0 + s.x1) / 2, my = (s.y0 + s.y1) / 2;
    for (const sd of [-1, 1]) {
      const x = mx - uy * sd * 20, y = my + ux * sd * 20, k = tileOf(x, y);
      if (k >= 0 && m.tiles[k] === T.DOCK) seedAt(x, y);
    }
  }
  // what's in each: the props that say what it is
  const WANT = new Set([...MARK, ...POOLISH, 'lounger', 'tires']);
  m.props.forEach((p) => {
    if (!p || !WANT.has(p.t)) return;
    const k = tileOf(p.x, p.y), R = k >= 0 && st[k] === 2 ? regionOf.get(k) : null;
    if (!R) return;
    let a = marks.get(R);
    if (!a) marks.set(R, (a = {}));
    const t = p.t === 'textsign' ? (p.text === 'DOG RUN' ? 'dogrun' : 'textsign') : p.t;
    a[t] = (a[t] || 0) + 1;
  });
  const homeTiles = new Set();
  for (const h of m.homes || []) if (h && !h.gone) for (const [x, y] of [[h.x, h.y], [h.x, h.y + TILE], [h.x, h.y - TILE]]) { const k = tileOf(x, y); if (k >= 0) homeTiles.add(k); }
  const pc = m.prison && m.prison.compound;
  const kindOf = (R) => {
    const a = marks.get(R) || {}, n = R.tiles.length;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, dock = 0;
    for (const [x, y] of R.tiles) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; if (m.tiles[m.idx(x, y)] === T.DOCK) dock++; }
    R.box = [x0, y0, x1, y1];
    // (what keeps people out first)
    if (pc && x1 >= pc.tx - 4 && x0 <= pc.tx + pc.tw + 4 && y1 >= pc.ty - 4 && y0 <= pc.ty + pc.th + 4) return ['keep', 'prison'];
    const bk = new Set();
    for (const [cx, cy, d, bar] of R.border) {
      if (bar !== 1) continue;
      const h = cross(cx, cy, cx + DIRS[d][0], cy + DIRS[d][1]), p = h && segs[h[0]].src >= 0 ? m.props[segs[h[0]].src] : null;
      if (!p) continue;
      if (p.barbed) bk.add('security');
      else if (p.t === 'yfence') bk.add('yard');
      else if (p.t === 'fenceline' && p.kind === 'wall') bk.add('arena');
    }
    if (bk.has('arena')) return ['keep', 'arena'];
    if (bk.size) return ['keep', 'security'];
    for (const P of POOLISH) if (a[P]) return ['keep', 'pool'];
    if ((a.lounger || 0) >= 3) return ['keep', 'pool'];
    for (const p of m.pools || []) if (p && p.x / TILE <= x1 + 2 && (p.x + p.w) / TILE >= x0 - 2 && p.y / TILE <= y1 + 2 && (p.y + p.h) / TILE >= y0 - 2) return ['keep', 'pool'];
    for (const k of R.set) if (homeTiles.has(k)) return ['keep', 'private'];
    for (const v of m.venues || []) if (v && v.rect && R.set.has(tileOf(v.rect.x + v.rect.w / 2, v.rect.y + v.rect.h / 2))) return ['open', 'pitch'];
    if (a.court || a.hoop || a.tnet) return ['open', 'court'];
    if (a.dogrun || (a.kicker && a.tires)) return ['open', 'dogrun'];   // (its sign, or its agility gear: the ramp, a tyre to jump through)
    let sk = 0; for (const t of SKATE) sk += a[t] || 0;
    if (sk >= 2) return ['open', 'skate'];
    if ((a.raisedbed || 0) >= 10) return ['open', 'garden'];
    if (a.parksign) return ['open', 'park'];
    if (dock * 2 >= n) return ['open', 'pier'];
    return ['keep', 'other'];
  };

  // ---- the ways out of each one to open ---------------------------------------------------------------------------
  const solidIn = (x0, y0, x1, y1) => {   // (px rect: anything solid but a fence's bare posts)
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) {
      if (!m.inside(tx, ty)) return true;
      const arr = m.solidProps.get(m.idx(tx, ty));
      if (arr) for (const e of arr) if (!e.off && (e.pi >= 0 || e.r > 8) && e.x + e.r > x0 && e.x - e.r < x1 && e.y + e.r > y0 && e.y - e.r < y1) return true;
    }
    return false;
  };
  // how far from the way out (tile (ox, oy) outside, heading (dx, dy)) to a pavement, path or road: tiles (99 none)
  const toPath = (R, ox, oy, dx, dy) => {
    for (let s = 0; s < EXITS3.reach; s++) {
      const x = ox + dx * s, y = oy + dy * s;
      if (!m.inside(x, y)) return 99;
      const k = m.idx(x, y);
      if (R.set.has(k)) continue;
      if (PATH_T.has(m.tiles[k])) return s;
      if (!walk(x, y)) return 99;
    }
    return 99;
  };
  // the steps over the fence round R by side and line: runs of them along each side
  const runsOf = (R) => {
    const by = new Map();
    for (const b of R.border) {
      const [cx, cy, d, bar] = b;
      if (bar !== 1) continue;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (R.set.has(m.idx(nx, ny))) continue;
      const horiz = d >= 2, line = horiz ? cy : cx, along = horiz ? cx : cy, key = d * 1e6 + line;
      let a = by.get(key);
      if (!a) by.set(key, (a = []));
      a.push(along);
    }
    const runs = [];
    for (const [key, a] of by) {
      a.sort((p, q) => p - q);
      const d = Math.floor(key / 1e6), line = key - d * 1e6;
      let s = 0;
      for (let i = 1; i <= a.length; i++) if (i === a.length || a[i] !== a[i - 1] + 1) { if (i - s >= 3) runs.push({ d, line, a0: a[s], a1: a[i - 1] }); s = i; }
    }
    return runs;
  };
  // the gates it has already: the steps out through a builder's gate (or none) onto ground that goes somewhere, in
  // clusters (next to each other or round a corner: one gate)
  const goes = (R, ox, oy) => {
    const k = m.idx(ox, oy);
    if (st[k] === 0) { const Q = fill(ox, oy); if (Q && !Q.kind) Q.kind = ['keep', 'unmarked']; }   // (found only now: not one to open)
    if (st[k] === 1) return true;
    const Q = regionOf.get(k);
    return !!Q && Q !== R && !!Q.kind && Q.kind[0] === 'open';
  };
  const gatesOf = (R) => {
    const pts = [];
    for (const [cx, cy, d, bar] of R.border) {
      if (bar !== 2) continue;
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (R.set.has(m.idx(nx, ny)) || cross(cx, cy, nx, ny) || !goes(R, nx, ny)) continue;
      pts.push({ x: cx, y: cy, d, nx, ny, c: -1 });
    }
    const cl = [];
    for (const p of pts) {
      if (p.c >= 0) continue;
      p.c = cl.length;
      const group = [p];
      for (let g = 0; g < group.length; g++) for (const q of pts) if (q.c < 0 && Math.abs(q.x - group[g].x) + Math.abs(q.y - group[g].y) <= 2) { q.c = p.c; group.push(q); }
      const mid = group[group.length >> 1];
      cl.push({ x: mid.x, y: mid.y, d: mid.d, side: SIDE[mid.d], dist: Math.min(...group.map((q) => toPath(R, q.nx, q.ny, DIRS[q.d][0], DIRS[q.d][1]))) });
    }
    return cl;
  };
  const s2Bar = (ax, ay, bx, by) => !!cross(ax, ay, bx, by);
  // a way out at step (along, line) of a run: valid if the three steps across are over the fence onto open ground,
  // nothing solid either side of it; -> { x, y, d, side, dist } (x, y the tile inside)
  const candidate = (R, run, along, lone = false) => {
    const { d, line } = run, horiz = d >= 2, [dx, dy] = DIRS[d];
    for (let o = lone ? 0 : -1; o <= (lone ? 0 : 1); o++) {
      const cx = horiz ? along + o : line, cy = horiz ? line : along + o;
      for (let s = 1; s <= 2; s++) if (!walk(cx + dx * s, cy + dy * s) || R.set.has(m.idx(cx + dx * s, cy + dy * s))) return null;
      if (s2Bar(cx + dx, cy + dy, cx + dx * 2, cy + dy * 2)) return null;   // (a second fence just outside)
    }
    const cx = horiz ? along : line, cy = horiz ? line : along, ox = cx + dx, oy = cy + dy;
    // (out there: open ground, or another enclosure that's opened too - never one kept shut)
    if (!goes(R, ox, oy)) return null;
    const k = m.idx(ox, oy);
    // (clear to walk: a tile and a half in and out, the gap's width)
    const wx = horiz ? EXITS3.gap / 2 : 1.5 * TILE, wy = horiz ? 1.5 * TILE : EXITS3.gap / 2;
    const mx = (cx + 0.5 + dx * 0.5) * TILE, my = (cy + 0.5 + dy * 0.5) * TILE;
    if (solidIn(mx - wx, my - wy, mx + wx, my + wy)) return null;
    return { x: cx, y: cy, d, side: SIDE[d], dist: toPath(R, ox, oy, dx, dy), open: st[k] === 1 };
  };
  const sep = (p, q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);

  const found = regions.slice();
  for (const R of found) R.kind = kindOf(R);
  for (const R of found) {
    if (!R.border.some((b) => b[3] === 1)) continue;   // (walled in by buildings or water: not the fences' doing)
    out.found++;
    const [verdict, kind] = R.kind;
    if (verdict !== 'open') {
      out.kept[kind] = (out.kept[kind] || 0) + 1;
      out.shut.push({ kind, box: R.box, seed: R.tiles[0] });
      continue;
    }
    const have = gatesOf(R), cands = [];
    for (const run of runsOf(R)) {
      const len = run.a1 - run.a0 + 1, C0 = EXITS3.corner;
      const at = len >= 2 * C0 + 3 ? [run.a0 + C0, run.a1 - C0] : [Math.floor((run.a0 + run.a1) / 2)];
      for (const a of at) {
        // (from the spot, a tile or two either way along the side if something stands in the way)
        for (const o of [0, 1, -1, 2, -2]) { const c = candidate(R, run, a + (a <= (run.a0 + run.a1) / 2 ? o : -o)); if (c) { cands.push(c); break; } }
      }
    }
    // (a fence on the slant - no three steps over it in a line: the single steps over it, when it has no way out at all)
    if (!cands.length && !have.length) {
      for (const [cx, cy, d, bar] of R.border) {
        if (bar !== 1) continue;
        const c = candidate(R, { d, line: d >= 2 ? cy : cx }, d >= 2 ? cx : cy, true);
        if (c) cands.push(c);
      }
      cands.sort((p, q) => p.dist - q.dist);
      cands.length = Math.min(cands.length, 1);
    }
    const sidesFree = new Set(cands.map((c) => c.side));
    for (const g of have) sidesFree.add(g.side);
    const need = Math.min(kind === 'pier' ? 1 : 2, sidesFree.size);   // (a pier: its one end on land)
    if (!need) out.stuck++;   // (nowhere to cut a way out: water, walls or a second fence all round)
    const picks = [];
    const all = () => have.concat(picks);
    // the first: on the side nearest a pavement, a path or a road (unless a gate's there already)
    const best = Math.min(99, ...cands.map((c) => c.dist), ...have.map((g) => g.dist));
    if (cands.length && !have.some((g) => g.dist <= best + 2)) {
      const c = cands.filter((q) => q.dist <= best + 2).sort((p, q) => p.dist - q.dist || (q.open - p.open))[0];
      if (c) picks.push(c);
    }
    // then another side, as far from the others as it can be
    for (let guard = 0; guard < 2; guard++) {
      const sides = new Set(all().map((g) => g.side));
      if (all().length >= 2 && sides.size >= need) break;
      let pool = cands.filter((c) => !sides.has(c.side) && !picks.includes(c));
      if (!pool.length) pool = cands.filter((c) => !picks.includes(c) && all().every((g) => sep(g, c) >= 6));
      if (!pool.length) break;
      const score = (c) => Math.min(999, ...all().map((g) => sep(g, c)));
      pool.sort((p, q) => score(q) - score(p) || p.dist - q.dist);
      picks.push(pool[0]);
    }
    const place = { kind, box: R.box, seed: R.tiles[0], need, gates: have.length, made: picks.map((c) => [c.x, c.y, c.side]) };
    out.places.push(place);
    if (!picks.length) { out.already++; continue; }
    // cut them: every fence across the three steps out at the way's middle
    let cut = 0;
    for (const c of picks) {
      const [dx, dy] = DIRS[c.d];
      let hit, n = 0;
      while ((hit = cross(c.x, c.y, c.x + dx, c.y + dy)) && n++ < 4) {
        // (as wide across the way out as EXITS3.gap: longer along a fence on the slant)
        const g = segs[hit[0]], L = Math.sqrt((g.x1 - g.x0) * (g.x1 - g.x0) + (g.y1 - g.y0) * (g.y1 - g.y0)) || 1, across = Math.max(0.5, Math.abs(dx ? (g.y1 - g.y0) / L : (g.x1 - g.x0) / L));
        if (!cutAt(hit[0], hit[1], hit[2], Math.round(EXITS3.gap / across))) break;
        cut++;
      }
      out.cuts.push([Math.round((c.x + 0.5 + dx * 0.5) * TILE), Math.round((c.y + 0.5 + dy * 0.5) * TILE)]);
    }
    if (cut) {
      out.opened++; out.gaps += picks.length;
      out.byKind[kind] = (out.byKind[kind] || 0) + 1;
      if (all().length < 2) out.short++;
    }
  }
  return out;
}
