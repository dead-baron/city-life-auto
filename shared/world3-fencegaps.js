// World v3: no fence shuts the way to a door, a yard's gate or across a path (the owner, 10-23: fences people can't walk
// through - shared/fences.js - so none may seal anything off). Run last (shared/world3-world.js's done hook, after the
// props are tidied), over every fence the people collide with (shared/fences.js fenceSegments: the fence props and the
// fields' rail fences):
//   - every door (the places' map points, the homes' doors and garage doors): from it, walking (4-way over the tiles a
//     person can stand on), the street must be reachable within GAP3.R tiles - or the walk must get that far. If the
//     fences are all that stop it (without them the street is there), the cheapest way out across as few fences as
//     possible is found and each fence on it gets a gap of GAP3.gap px where the way crosses it (the gate);
//   - a fence across a narrow path (a strip of pavement, plaza, dirt or boards with other ground either side of it
//     along the fence: a trail, a garden path, a footpath through a park) gets a gap where it crosses.
// A gap splits a fence prop in two (the second piece a new prop at the end of the list, no solid of its own: the fence
// props have none) or a field's run; the bare posts' solids standing in the gap go. Deterministic: integer tiles, the
// map's own order.
import { TILE, T } from './constants.js';
import { PED_BLOCK, WATER_T } from './mapcore.js';
import { fenceSegments, fieldRuns } from './fences.js';

export const GAP3 = { R: 60, gap: 48, minPiece: 24 };
const PATHS = new Set([T.SIDEWALK, T.PLAZA, T.DIRT, T.DOCK, T.LOT]);

export function fenceGaps3(m, log = false) {
  const out = { at: log ? [] : null, segs: 0, doors: 0, sealed: 0, gaps: 0, paths: 0, unsealed: 0, stuck: 0, byKind: {} };
  const segs = fenceSegments(m);
  out.segs = segs.length;
  if (!segs.length) return out;
  // the segments by tile
  const grid = new Map();
  const reg = (id) => {
    const s = segs[id], L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0)), n = Math.max(1, Math.ceil(L / 12));
    for (let j = 0; j <= n; j++) {
      const tx = Math.floor((s.x0 + (s.x1 - s.x0) * j / n) / TILE), ty = Math.floor((s.y0 + (s.y1 - s.y0) * j / n) / TILE);
      if (!m.inside(tx, ty)) continue;
      const k = m.idx(tx, ty);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      if (a[a.length - 1] !== id) a.push(id);
    }
  };
  for (let i = 0; i < segs.length; i++) reg(i);
  const walk = (tx, ty) => { if (!m.inside(tx, ty)) return false; const i = m.idx(tx, ty), t = m.tiles[i]; return !PED_BLOCK[t] && !WATER_T[t] && !(m.lvl0Block && m.lvl0Block[i] === 1); };
  // the first live segment crossed going from tile a's centre to tile b's: [id, x, y] or null
  const cross = (ax, ay, bx, by) => {
    const px = (ax + 0.5) * TILE, py = (ay + 0.5) * TILE, qx = (bx + 0.5) * TILE, qy = (by + 0.5) * TILE;
    for (const k of [m.idx(ax, ay), m.idx(bx, by)]) {
      const arr = grid.get(k);
      if (arr) for (const id of arr) {
        const s = segs[id];
        if (s.dead) continue;
        const d1x = qx - px, d1y = qy - py, d2x = s.x1 - s.x0, d2y = s.y1 - s.y0, den = d1x * d2y - d1y * d2x;
        if (den === 0) continue;
        const u = ((s.x0 - px) * d2y - (s.y0 - py) * d2x) / den, v = ((s.x0 - px) * d1y - (s.y0 - py) * d1x) / den;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return [id, s.x0 + d2x * v, s.y0 + d2y * v];
      }
    }
    return null;
  };
  // a gap in segment id at (x, y): split it, its source with it
  const cutAt = (id, x, y) => {
    const s = segs[id], L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0));
    if (L < 1) return false;
    const ux = (s.x1 - s.x0) / L, uy = (s.y1 - s.y0) / L, t = (x - s.x0) * ux + (y - s.y0) * uy;
    const g0 = t - GAP3.gap / 2, g1 = t + GAP3.gap / 2;
    const pieces = [];
    if (g0 >= GAP3.minPiece) pieces.push([0, g0]);
    if (L - g1 >= GAP3.minPiece) pieces.push([g1, L]);
    s.dead = true;
    const R2 = (v) => Math.round(v);
    if (s.src >= 0) {
      const p = m.props[s.src], first = pieces[0];
      if (!first) { p.gap3 = 1; if (p.t === 'yfence') { p.x1 = p.x; p.y1 = p.y; } else { p.tx = 0; p.ty = 0; } }   // (nothing left: a stub nothing draws)
      pieces.forEach(([a, b], k) => {
        const ax = R2(s.x0 + ux * a), ay = R2(s.y0 + uy * a), bx = R2(s.x0 + ux * b), by = R2(s.y0 + uy * b);
        const q = k === 0 ? p : { ...p };
        q.x = ax; q.y = ay;
        if (q.t === 'yfence') { q.x1 = bx; q.y1 = by; } else { q.tx = bx - ax; q.ty = by - ay; }
        if (k > 0) m.props.push(q);
        segs.push({ x0: ax, y0: ay, x1: bx, y1: by, k: s.k, src: k === 0 ? s.src : m.props.length - 1 });
        reg(segs.length - 1);
      });
    } else {
      const f = m.fields[-1 - s.src];
      f.fence = fieldRuns(m, f).flatMap(([a, b]) => (s.x0 >= a - 0.5 && s.x1 <= b + 0.5 ? pieces.map(([p0, p1]) => [R2(s.x0 + p0), R2(s.x0 + p1)]) : [[a, b]]));
      for (const [p0, p1] of pieces) { segs.push({ x0: R2(s.x0 + p0), y0: s.y0, x1: R2(s.x0 + p1), y1: s.y0, k: s.k, src: s.src }); reg(segs.length - 1); }
    }
    // the bare solids (posts) standing in the gap
    const gx0 = s.x0 + ux * g0, gy0 = s.y0 + uy * g0, gx1 = s.x0 + ux * g1, gy1 = s.y0 + uy * g1;
    for (let ty = Math.floor((Math.min(gy0, gy1) - 16) / TILE); ty <= Math.floor((Math.max(gy0, gy1) + 16) / TILE); ty++) for (let tx = Math.floor((Math.min(gx0, gx1) - 16) / TILE); tx <= Math.floor((Math.max(gx0, gx1) + 16) / TILE); tx++) {
      if (!m.inside(tx, ty)) continue;
      const k = m.idx(tx, ty), arr = m.solidProps.get(k);
      if (!arr) continue;
      const kept = arr.filter((e) => { if (e.pi >= 0) return true; const w = (e.x - s.x0) * ux + (e.y - s.y0) * uy, off = Math.abs((e.x - s.x0) * uy - (e.y - s.y0) * ux); return !(w >= g0 && w <= g1 && off < 10); });
      if (kept.length !== arr.length) { if (kept.length) m.solidProps.set(k, kept); else m.solidProps.delete(k); }
    }
    const kind = s.src >= 0 ? `${m.props[s.src].t}${m.props[s.src].kind ? ':' + m.props[s.src].kind : ''}` : 'field';
    out.byKind[kind] = (out.byKind[kind] || 0) + 1;
    out.gaps++;
    return true;
  };

  // ---- the doors -------------------------------------------------------------------------------------------------
  const R = GAP3.R, S = 2 * R + 1, N = S * S;
  const seen = new Int32Array(N), cost = new Int32Array(N), par = new Int32Array(N);
  const dq = new Int32Array(N * 2);
  let stamp = 0;
  // from (sx, sy): 0 the street (or R tiles off) reached walking; else the fewest fences crossed on the way out (and, with
  // `cut`, gaps cut along it); -1 none at all (walled in by buildings or water)
  const escape = (sx, sy, fences, cut) => {
    stamp++;
    const ox = sx - R, oy = sy - R, at = (x, y) => (y - oy) * S + (x - ox);
    let head = N, tail = N;
    const s0 = at(sx, sy);
    dq[head] = s0; tail++; seen[s0] = stamp; cost[s0] = 0; par[s0] = -1;
    let goal = -1;
    while (head < tail) {
      const c = dq[head++], cx = ox + (c % S), cy = oy + ((c / S) | 0);
      if (seen[c] !== stamp) continue;
      const cc = cost[c];
      if (m.tiles[m.idx(cx, cy)] === T.ROAD || Math.abs(cx - sx) >= R || Math.abs(cy - sy) >= R) { goal = c; break; }
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (!walk(nx, ny)) continue;
        const n = at(nx, ny), w = fences && cross(cx, cy, nx, ny) ? 1 : 0;
        if (w && fences === 'block') continue;
        if (seen[n] === stamp && cost[n] <= cc + w) continue;
        seen[n] = stamp; cost[n] = cc + w; par[n] = c;
        if (w) dq[tail++] = n; else { if (head === 0) break; dq[--head] = n; }   // (0-1 BFS: the free way first)
      }
    }
    if (goal < 0) return -1;
    if (cut && cost[goal] > 0) {
      for (let c = goal; par[c] >= 0; c = par[c]) {
        const p = par[c], ax = ox + (p % S), ay = oy + ((p / S) | 0), bx = ox + (c % S), by = oy + ((c / S) | 0);
        let hit;
        while ((hit = cross(ax, ay, bx, by))) if (!cutAt(hit[0], hit[1], hit[2])) break;
      }
    }
    return cost[goal];
  };
  const doors = [];
  for (const p of m.pois) if (p && p.label !== undefined) doors.push([p.x, p.y]);
  for (const h of m.homes || []) { if (!h || h.gone) continue; doors.push([h.x, h.y]); if (h.garageDoor) doors.push([h.garageDoor.x, h.garageDoor.y]); }
  const done = new Set();
  for (const [x, y] of doors) {
    let tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!walk(tx, ty)) { if (walk(tx, ty + 1)) ty++; else if (walk(tx, ty - 1)) ty--; else continue; }
    const key = m.idx(tx, ty);
    if (done.has(key)) continue;
    done.add(key);
    if (tx - R < m.x0 || ty - R < m.y0 || tx + R >= m.x0 + m.w || ty + R >= m.y0 + m.h) continue;
    // (no fence anywhere near: nothing to check)
    let any = false;
    for (let dy = -8; dy <= 8 && !any; dy += 2) for (let dx = -8; dx <= 8; dx += 2) if (m.inside(tx + dx, ty + dy) && grid.has(m.idx(tx + dx, ty + dy))) { any = true; break; }
    if (!any) continue;
    out.doors++;
    if (escape(tx, ty, 'block', false) === 0) continue;
    if (escape(tx, ty, false, false) !== 0) continue;   // (shut in by buildings or water: not the fences' doing)
    out.sealed++;
    escape(tx, ty, true, true);
    if (escape(tx, ty, 'block', false) === 0) out.unsealed++; else out.stuck++;
  }

  // ---- the paths a fence runs across ----------------------------------------------------------------------------
  const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return m.inside(tx, ty) ? m.tiles[m.idx(tx, ty)] : -1; };
  for (let id = 0; id < segs.length; id++) {
    const s = segs[id];
    if (s.dead) continue;
    const L = Math.sqrt((s.x1 - s.x0) * (s.x1 - s.x0) + (s.y1 - s.y0) * (s.y1 - s.y0));
    if (L < GAP3.gap) continue;
    const ux = (s.x1 - s.x0) / L, uy = (s.y1 - s.y0) / L, nx = -uy, ny = ux;
    for (let w = 16; w <= L - 16; w += 16) {
      const x = s.x0 + ux * w, y = s.y0 + uy * w, t = tileAt(x, y);
      if (!PATHS.has(t)) continue;
      // (across it, the path both sides; along the fence, other ground either side of it within 3 tiles)
      if (tileAt(x + nx * 48, y + ny * 48) !== t || tileAt(x - nx * 48, y - ny * 48) !== t) continue;
      let a = 0, b = 0;
      while (a < 4 && tileAt(x - ux * (a + 1) * 16, y - uy * (a + 1) * 16) === t) a++;
      while (b < 4 && tileAt(x + ux * (b + 1) * 16, y + uy * (b + 1) * 16) === t) b++;
      if (a >= 4 || b >= 4 || (w - (a + 1) * 16 < 0 && w + (b + 1) * 16 > L)) continue;
      const mid = w + (b - a) * 8;
      if (cutAt(id, s.x0 + ux * mid, s.y0 + uy * mid)) { out.paths++; if (out.at) out.at.push(['path', t, Math.round(s.x0 + ux * mid), Math.round(s.y0 + uy * mid), s.src]); break; }
    }
  }
  if (!out.at) delete out.at;
  return out;
}
