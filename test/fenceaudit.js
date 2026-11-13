// The ways out of a fenced place, counted independently of shared/world3-fenceexits.js (the tests' helper): from a tile
// inside, walking (4-way over the ground people stand on) within the place's box, the fences (shared/fences.js, as the
// people collide with them now) stopping you - every step out of the box onto somewhere that goes on (a pavement or a
// road reached, or EXIT_REACH tiles of ground) is a way out; the ways out a few tiles apart are one.
import { TILE, T } from '../shared/constants.js';
import { PED_BLOCK, WATER_T } from '../shared/mapcore.js';
import { fenceSegments } from '../shared/fences.js';

const EXIT_REACH = 1500;
// the map's fences as they are now, by tile (build it again after anything cuts them)
export function fenceGrid(m) {
  const segs = fenceSegments(m), grid = new Map();
  segs.forEach((s, id) => {
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.ceil(L / 12));
    for (let j = 0; j <= n; j++) {
      const tx = Math.floor((s.x0 + (s.x1 - s.x0) * j / n) / TILE), ty = Math.floor((s.y0 + (s.y1 - s.y0) * j / n) / TILE);
      if (!m.inside(tx, ty)) continue;
      const k = m.idx(tx, ty);
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      if (a[a.length - 1] !== id) a.push(id);
    }
  });
  return { segs, grid };
}
export function waysOut(m, box, seed, F = fenceGrid(m)) {
  const walk = (tx, ty) => { if (!m.inside(tx, ty)) return false; const i = m.idx(tx, ty), t = m.tiles[i]; return !PED_BLOCK[t] && !WATER_T[t] && !(m.lvl0Block && m.lvl0Block[i] === 1); };
  const blocked = (ax, ay, bx, by) => {
    const px = (ax + 0.5) * TILE, py = (ay + 0.5) * TILE, qx = (bx + 0.5) * TILE, qy = (by + 0.5) * TILE;
    for (const k of [m.idx(ax, ay), m.idx(bx, by)]) for (const id of F.grid.get(k) || []) {
      const s = F.segs[id], d1x = qx - px, d1y = qy - py, d2x = s.x1 - s.x0, d2y = s.y1 - s.y0, den = d1x * d2y - d1y * d2x;
      if (den === 0) continue;
      const u = ((s.x0 - px) * d2y - (s.y0 - py) * d2x) / den, v = ((s.x0 - px) * d1y - (s.y0 - py) * d1x) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return true;
    }
    return false;
  };
  const [x0, y0, x1, y1] = box, inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const seen = new Set([m.idx(seed[0], seed[1])]), q = [seed], steps = [];
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!walk(nx, ny) || blocked(cx, cy, nx, ny)) continue;
      if (!inBox(nx, ny)) { steps.push([nx, ny]); continue; }
      const k = m.idx(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  // does the ground out there go on
  const goesOn = (sx, sy) => {
    const s2 = new Set([m.idx(sx, sy)]), q2 = [[sx, sy]];
    for (let h = 0; h < q2.length; h++) {
      const [cx, cy] = q2[h], t = m.tiles[m.idx(cx, cy)];
      if (t === T.ROAD || t === T.SIDEWALK || q2.length >= EXIT_REACH) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (inBox(nx, ny) || !walk(nx, ny) || blocked(cx, cy, nx, ny)) continue;
        const k = m.idx(nx, ny);
        if (s2.has(k)) continue;
        s2.add(k); q2.push([nx, ny]);
      }
    }
    return false;
  };
  // (the steps out in clusters: next to each other, or round a corner, one way)
  const cl = new Int32Array(steps.length).fill(-1), ways = [];
  for (let i = 0; i < steps.length; i++) {
    if (cl[i] >= 0) continue;
    cl[i] = i;
    const group = [i];
    for (let g = 0; g < group.length; g++) for (let j = 0; j < steps.length; j++) {
      if (cl[j] >= 0) continue;
      const a = steps[group[g]], b = steps[j];
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 2) { cl[j] = i; group.push(j); }
    }
    const out = group.find((k) => goesOn(steps[k][0], steps[k][1]));
    if (out !== undefined) ways.push(steps[out]);
  }
  return { ways, inside: seen.size };
}
