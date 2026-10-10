// Tunnels: roads and railways that go under the ground (the owner, 2026-10-10: "When I have a dotted line I am picturing
// a tunnel happening there, you'll see that a lot in the mountains and around the map"; World v3's dotted stretches -
// docs/WORLD-V3.md part 5 - and, today, one road through a spur of the Granite Peaks).
//
// A tunnel is a stretch of a road (or the railway) at ground level with ground over it - a hillside, a ridge, a mesa.
// Modelled on the elevated highway's deck (map.deck: one byte a tile, levels.js) and on the walk-ins' roofs:
//   * m.cover: one byte a tile, the tunnel's id + 1 over its bore (the road under the ground), 0 elsewhere;
//   * m.tunnels: [{ id, kind ('road' | 'rail'), edge, s0, s1, len, hw, line [x, y, x, y, ...] (its centre line, every
//     32 px from mouth to mouth), mouths [{ x, y, ox, oy (pointing out of the tunnel), closed }], box [x0, y0, x1, y1] }];
//   * the bore's sides are rock (T.WALL a tile or so thick along it): you only get in or out through a mouth;
//   * a closed mouth (a highway that runs off the map: "we'll have a closed tunnel or something to stop people from
//     driving off that area for now") has a "ROAD CLOSED" barrier just inside it - wall tiles across the bore.
// Sight (CityMap.los, so the police, witnesses and the cameras) doesn't cross a tunnel's roof: someone in a tunnel is
// out of sight of everyone outside it and the other way round; two people in the same tunnel see each other.
// The client draws the hill over the bore, the portals and, for the tunnel you're in, its inside (client/tunnels.js).
// Made while the city is built (generateCity, deterministic: plain arithmetic, nothing at load time).
import { T, TILE, MAP_W, MAP_H } from './constants.js';

export const TUNNEL_WALL = 40;    // px of rock either side of the bore (its walls)
export const BARRIER_DEPTH = 40;  // px of the bore a closed mouth's barrier takes, just inside the mouth

// the cover byte under a world point: the tunnel's id + 1, or 0 (no cover layer: 0)
export function coverAtPx(cover, x, y) {
  if (!cover) return 0;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? 0 : cover[ty * MAP_W + tx];
}
// Is (x, y) under cover - in a tunnel? Its id + 1, or 0.
export function underCover(m, x, y) { return coverAtPx(m && m.cover, x, y); }
// the tunnel at (x, y), or null
export function tunnelAt(m, x, y) { const c = underCover(m, x, y); return c && m.tunnels ? m.tunnels[c - 1] || null : null; }
// The tunnel mouth nearest a point: { tunnel, mouth, d } or null.
export function nearestMouth(m, x, y) {
  let best = null;
  for (const t of (m && m.tunnels) || []) for (const mo of t.mouths) {
    const d = Math.hypot(mo.x - x, mo.y - y);
    if (!best || d < best.d) best = { tunnel: t, mouth: mo, d };
  }
  return best;
}
// What a viewer at (vx, vy) can't see of something at (x, y): anything under a cover the viewer isn't under. A viewer
// outside doesn't see into a tunnel; one inside sees their own tunnel and the world outside, never into another tunnel.
export function coverHides(m, vx, vy, x, y) { const c = underCover(m, x, y); return c !== 0 && c !== underCover(m, vx, vy); }

// ---- making them ---------------------------------------------------------------------------------------------------
// a polyline with its arc positions: [{ x, y, s }]
function arcs(pts) {
  const out = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    out.push({ x: pts[i].x, y: pts[i].y, s });
  }
  return out;
}
// the point s px along an arc'd polyline, with its unit tangent
function at(P, s) {
  let k = 0;
  while (k + 2 < P.length && P[k + 1].s <= s) k++;
  const a = P[k], b = P[k + 1] || a, seg = (b.s - a.s) || 1, f = Math.max(0, Math.min(1, (s - a.s) / seg));
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx: (b.x - a.x) / l, ty: (b.y - a.y) / l };
}
// the polyline a tunnel spec runs along: a road edge's points, or the railway's
function pathOf(m, spec) { return spec.edge === 'rail' ? m.rail && m.rail.pts : m.edges[spec.edge] && m.edges[spec.edge].pts; }

// Make the tunnels: specs [{ edge (a road edge's id, or 'rail'), s0, s1 (px along it), hw (the bore's half width:
// the road's by default), closed ('a': the mouth at s0, 'b': the one at s1) }]. Sets m.cover and m.tunnels (also when
// there are none, so every map has them). Returns m.tunnels.
export function buildTunnels(m, specs) {
  m.cover = new Uint8Array(MAP_W * MAP_H);
  m.tunnels = [];
  for (const spec of specs || []) addTunnel(m, spec);
  return m.tunnels;
}
export function addTunnel(m, spec) {
  const raw = pathOf(m, spec);
  if (!raw || raw.length < 2 || m.tunnels.length >= 255) return null;
  if (!m.cover) m.cover = new Uint8Array(MAP_W * MAP_H);
  const P = arcs(raw), L = P[P.length - 1].s;
  const s0 = Math.max(0, Math.min(spec.s0, spec.s1)), s1 = Math.min(L, Math.max(spec.s0, spec.s1));
  if (s1 - s0 < 64) return null;
  const e = spec.edge === 'rail' ? null : m.edges[spec.edge];
  const hw = spec.hw || (e ? e.hw : 40), id = m.tunnels.length, mark = id + 1;
  // the stretch's own polyline, every 16 px (for the tile stamping) and every 32 px (the centre line kept)
  const S = [];
  for (let s = s0; ; s += 16) { const p = at(P, Math.min(s, s1)); S.push({ x: p.x, y: p.y, s: Math.min(s, s1) }); if (s >= s1) break; }
  const line = [];
  for (let s = s0; ; s += 32) { const p = at(P, Math.min(s, s1)); line.push(Math.round(p.x), Math.round(p.y)); if (s >= s1) break; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of S) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const pad = hw + TUNNEL_WALL + TILE;
  const tx0 = Math.max(0, Math.floor((x0 - pad) / TILE)), ty0 = Math.max(0, Math.floor((y0 - pad) / TILE));
  const tx1 = Math.min(MAP_W - 1, Math.floor((x1 + pad) / TILE)), ty1 = Math.min(MAP_H - 1, Math.floor((y1 + pad) / TILE));
  const closed = spec.closed === 'a' || spec.closed === 'b' ? spec.closed : null;
  const walls = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const cx = (tx + 0.5) * TILE, cy = (ty + 0.5) * TILE;
    // the nearest point of the stretch, and whether it lies alongside it (not out past a mouth)
    let bd = Infinity, bs = 0, inside = false;
    for (let k = 0; k + 1 < S.length; k++) {
      const a = S[k], b = S[k + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      let f = ((cx - a.x) * dx + (cy - a.y) * dy) / l2;
      const past = (k === 0 && f < 0) || (k === S.length - 2 && f > 1);
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const d = Math.hypot(cx - (a.x + dx * f), cy - (a.y + dy * f));
      if (d < bd) { bd = d; bs = a.s + (b.s - a.s) * f; inside = !past; }
    }
    if (!inside) continue;
    const i = ty * MAP_W + tx;
    if (bd <= hw) {
      if (!m.cover[i]) m.cover[i] = mark;
      // a closed mouth: the barrier across the bore just inside it
      if (closed && (closed === 'a' ? bs - s0 : s1 - bs) <= BARRIER_DEPTH) m.tiles[i] = T.WALL;
    } else if (bd <= hw + TUNNEL_WALL) walls.push(i);
  }
  for (const i of walls) if (!m.cover[i]) m.tiles[i] = T.WALL;   // the bore's rock sides (never over a bore tile)
  const pa = at(P, s0), pb = at(P, s1);
  const t = {
    id, kind: spec.edge === 'rail' ? 'rail' : 'road', edge: spec.edge, s0, s1, len: s1 - s0, hw, line,
    mouths: [{ x: pa.x, y: pa.y, ox: -pa.tx, oy: -pa.ty, closed: closed === 'a' }, { x: pb.x, y: pb.y, ox: pb.tx, oy: pb.ty, closed: closed === 'b' }],
    box: [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad), Math.ceil(y1 + pad)],
  };
  m.tunnels.push(t);
  return t;
}

// Today's world: the country road up into the Granite Peaks runs through a spur of the mountain - the longest stretch
// of a road in the peaks with mountain on both sides of it (terrain class 4, six tiles out) becomes a tunnel, its mouths
// a couple of tiles into the rock. (World v3 marks its own: its dotted stretches.)
const PEAKS = 33, MOUNTAIN = 4;
export function spurTunnels(m) {
  const cls = m.terrainCls && m.terrainCls.at;
  if (!cls) return [];
  const mtn = (x, y) => {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && m.dist[ty * MAP_W + tx] === PEAKS && cls(tx, ty) === MOUNTAIN;
  };
  let best = null;
  for (const e of m.edges || []) {
    if (e.lvl !== 0 || e.kind !== 'rural') continue;
    const P = arcs(e.pts), L = P[P.length - 1].s;
    let run0 = -1;
    for (let s = 0; s <= L + 32; s += 32) {
      let ok = s <= L;
      if (ok) {
        const p = at(P, s), o = 6 * TILE;
        ok = mtn(p.x, p.y) && mtn(p.x - p.ty * o, p.y + p.tx * o) && mtn(p.x + p.ty * o, p.y - p.tx * o);
      }
      if (ok && run0 < 0) run0 = s;
      if (!ok && run0 >= 0) {
        const len = s - 32 - run0;
        if (!best || len > best.len) best = { edge: e.id, s0: run0 + 64, s1: s - 32 - 64, len };
        run0 = -1;
      }
    }
  }
  return best && best.len >= 640 ? [{ edge: best.edge, s0: best.s0, s1: best.s1 }] : [];
}
