// World v3: no oversized empty plazas (the owner, 11-14: "no oversized empty plazas or lots"; the placement audit's
// bigEmptyPlaza). A stretch of open paving more than about half a screen across with nothing on it - no prop, building or
// edge within EMPTY_R tiles - reads as unfinished: the Downtown towers' squares, the Midtown and Stadium plazas, the
// airport's forecourt, the prison yard.
// emptySpots(M, R) - the lint's rule (tools/audit/worldrows.mjs bigEmptyPlaza): one spot per empty stretch.
// plazaFill3(m, H3) (World v3's done hook): each empty stretch, deepest first, gets an island at its middle - a fountain
// ringed by benches, trees in planters and lamps (the first in a square, about every other island, never on an airport's
// forecourt or in a street of houses) or a grove (four trees in planters, two benches, a lamp, a bin); in a yard (Prison Island) picnic tables and a hoop instead - until no tile of paving is EMPTY_R or
// more from anything (MAX_ISLANDS a cap). Nothing is put within KEEP_CLEAR tiles of a map point (a door, a stop, a
// race's start). Deterministic (tile order, integer arithmetic); only the world build imports it.
import { T, TILE } from './constants.js';
import { DISTRICTS } from './mapcore.js';

export const EMPTY_R = 10;
export const MAX_ISLANDS = 120, KEEP_CLEAR = 6;
const YARDS = new Set(['Prison Island']);
const NO_FOUNTAIN = new Set(['airport', 'houses']);   // (a forecourt, a street of houses: trees and benches, no fountain)

// the occupied tiles: anything not paving, every prop's tile (a sized one's footprint), every solid, the pitches and arenas
function occupied(M) {
  const N = M.w * M.h, occ = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (M.tiles[i] !== T.PLAZA) occ[i] = 1;
  for (const p of M.props) {
    if (!p) continue;
    const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
    if (M.inside(tx, ty)) occ[M.idx(tx, ty)] = 1;
    // a thing laid on the ground with a size (a court, a canopy, a skate pad): its whole footprint - x, y its middle or
    // its near edge's middle (a court's), so the box runs from half its depth before to its depth after
    if (p.w >= 2 * TILE && p.d >= 2 * TILE) {
      const r = Math.max(p.w, p.d) / 2, ext = p.a ? r : p.w / 2;
      for (let y = Math.floor((p.y - (p.a ? r : p.d / 2)) / TILE); y <= Math.floor((p.y + (p.a ? r : p.d)) / TILE); y++)
        for (let x = Math.floor((p.x - ext) / TILE); x <= Math.floor((p.x + ext) / TILE); x++) if (M.inside(x, y)) occ[M.idx(x, y)] = 1;
    }
  }
  if (M.solidProps) for (const [k] of M.solidProps) occ[k] = 1;
  // a pitch or a court for a game (m.venues - a soccer field, a volleyball court) and an arena (m.arenas - the Waves Arena
  // by the stadium: 11-23, the first fill put a fountain on its pitch): played on, not empty paving
  const box = (x0, y0, x1, y1) => { for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 1) / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 1) / TILE); tx++) if (M.inside(tx, ty)) occ[M.idx(tx, ty)] = 1; };
  for (const v of M.venues || []) if (v && v.rect) box(v.rect.x, v.rect.y, v.rect.x + v.rect.w, v.rect.y + v.rect.h);
  for (const a of M.arenas || []) if (a) box(a.tx * TILE, a.ty * TILE, (a.tx + a.tw) * TILE, (a.ty + a.th) * TILE);
  return occ;
}
// the distance (8-way steps) from each tile to the nearest occupied one, up to `cap`
function distances(M, occ, cap) {
  const W = M.w, H = M.h, N = W * H, dist = new Uint8Array(N).fill(255), q = new Int32Array(N);
  let qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (occ[i]) { dist[i] = 0; q[qt++] = i; }
  while (qh < qt) {
    const i = q[qh++], d = dist[i];
    if (d >= cap) continue;
    const x = i % W, y = (i / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (dist[j] > d + 1) { dist[j] = d + 1; q[qt++] = j; }
    }
  }
  return dist;
}

// -> [{ tx, ty, d }] (frame tiles): the lint's spots - a tile EMPTY_R or more from anything, one per 30 tiles
export function emptySpots(M, R = EMPTY_R) {
  const dist = distances(M, occupied(M), R + 2), out = [];
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < R || dist[i] === 255) continue;
    const tx = i % M.w + M.x0, ty = ((i / M.w) | 0) + M.y0;
    if (out.some((s) => Math.abs(s.tx - tx) < 30 && Math.abs(s.ty - ty) < 30)) continue;
    out.push({ tx, ty, d: dist[i] });
  }
  return out;
}

// the islands, as [t, dx, dy (tiles from the middle), solid radius px, extra]
const TREE = (dx, dy) => [['tree_a', dx, dy, 10, { sp: 'streetPl', k: 1.05 }], ['planter_sq', dx, dy + 0.4, 0, null]];
const FOUNTAIN = [
  ['fountain', 0, 0, 30, null],
  ['bench_m', 0, -3, 0, null], ['bench_m', 0, 3, 0, null], ['bench_m', -3.2, 0, 0, null], ['bench_m', 3.2, 0, 0, null],
  ...TREE(-4, -4), ...TREE(4, -4), ...TREE(-4, 4), ...TREE(4, 4),
  ['lamp', -6, 0, 0, null], ['lamp', 6, 0, 0, null],
];
const GROVE = [
  ...TREE(-2, -2), ...TREE(2, -2), ...TREE(-2, 2), ...TREE(2, 2),
  ['bench_m', -4.2, 0, 0, null], ['bench_m', 4.2, 0, 0, null], ['lamp', 0, -4.5, 0, null], ['bin', 0, 4.2, 0, null],
];
const YARD = [
  ['picnic', -3, -1.5, 10, null], ['picnic', 3, -1.5, 10, null], ['picnic', 0, 2.5, 10, null],
  ['hoop', 0, -6, 6, null], ['bench_m', -5.5, 3, 0, null], ['bench_m', 5.5, 3, 0, null],
];

export function plazaFill3(m, H3) {
  const out = { islands: 0, fountains: 0, groves: 0, yards: 0, kept: 0 };
  if (!H3 || !H3.addProp) return out;
  const W = m.w, occ = occupied(m), dist = distances(m, occ, 250);
  // the map points kept clear (their tiles count as taken for the islands' middles, not for the lint)
  const keep = new Uint8Array(m.w * m.h);
  const mark = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); for (let j = -KEEP_CLEAR; j <= KEEP_CLEAR; j++) for (let i = -KEEP_CLEAR; i <= KEEP_CLEAR; i++) if (m.inside(tx + i, ty + j)) keep[m.idx(tx + i, ty + j)] = 1; };
  for (const p of m.pois || []) if (p && Number.isFinite(p.x)) mark(p.x, p.y);
  for (const r of m.races || []) if (r && r.start) mark(r.start.x, r.start.y);
  let voids = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] >= EMPTY_R && dist[i] !== 255) voids.push(i);
  const square = new Map();   // (how many islands each square has had: its first a fountain)
  const squareOf = (i) => { const tx = i % W + m.x0, ty = ((i / W) | 0) + m.y0; return `${Math.floor(tx / 48)},${Math.floor(ty / 48)}`; };
  while (voids.length && out.islands < MAX_ISLANDS) {
    // the deepest empty tile not by a map point (ties: the first in tile order)
    let best = -1;
    for (const i of voids) if (!keep[i] && (best < 0 || dist[i] > dist[best])) best = i;
    if (best < 0) { out.kept = voids.length; break; }
    const tx = best % W + m.x0, ty = ((best / W) | 0) + m.y0, d = DISTRICTS[m.dist[best]];
    const sq = squareOf(best), n = square.get(sq) || 0;
    square.set(sq, n + 1);
    const yard = d && YARDS.has(d.name), plain = d && NO_FOUNTAIN.has(d.style);
    const kind = yard ? YARD : !plain && n === 0 && out.fountains <= out.groves ? FOUNTAIN : GROVE;
    out[yard ? 'yards' : kind === FOUNTAIN ? 'fountains' : 'groves']++;
    out.islands++;
    const at = [];
    for (const [t, dx, dy, r, ex] of kind) {
      const x = Math.round((tx + 0.5 + dx) * TILE), y = Math.round((ty + 0.5 + dy) * TILE);
      H3.addProp(m, t, x, y, r, ex ? { ...ex } : null);
      at.push([Math.floor(x / TILE), Math.floor(y / TILE)]);
    }
    // the tiles now within EMPTY_R of one of the island's things aren't empty any more
    voids = voids.filter((i) => {
      const x = i % W + m.x0, y = ((i / W) | 0) + m.y0;
      for (const [a, b] of at) if (Math.max(Math.abs(a - x), Math.abs(b - y)) < EMPTY_R) return false;
      return true;
    });
  }
  return out;
}
