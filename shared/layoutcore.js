// The part of the city's layout (shared/citylayout.js) the page reads: the zones and the contour tracer (the shore's
// lines: client/render/shore.js). Moved here from citylayout.js as it was, so the page needn't load the layout.
import { TILE } from './constants.js';

// Zones (map.zone): which part of the world a tile belongs to.
export const Z = { SEA: 0, CITY: 1, SOUTH: 2, EAST: 3, WILD: 4, KEY: 5, ROCK: 6, WEST: 7, NORTH: 8, ISLE: 9, GULL: 10 };

// Iso-lines of a scalar field (marching squares over tile centres) inside a region: polylines in px.
export function contours(field, W, H, iso, inRegion, x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1) {
  const segs = [];
  const v = (x, y) => field[y * W + x];
  const lerp = (a, b) => (iso - a) / ((b - a) || 1e-6);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (!inRegion(x, y)) continue;
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const k = (a >= iso ? 8 : 0) | (b >= iso ? 4 : 0) | (c >= iso ? 2 : 0) | (d >= iso ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const T = [x + lerp(a, b), y], R = [x + 1, y + lerp(b, c)], B = [x + lerp(d, c), y + 1], Lf = [x, y + lerp(a, d)];
    const add = (p, q) => segs.push([p, q]);
    switch (k) {
      case 1: case 14: add(Lf, B); break;
      case 2: case 13: add(B, R); break;
      case 3: case 12: add(Lf, R); break;
      case 4: case 11: add(T, R); break;
      case 5: add(Lf, T); add(B, R); break;
      case 6: case 9: add(T, B); break;
      case 7: case 8: add(Lf, T); break;
      case 10: add(T, R); add(Lf, B); break;
    }
  }
  // chain segments by shared end points
  const key = (p) => `${Math.round(p[0] * 64)},${Math.round(p[1] * 64)}`;
  const ends = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
  const used = new Uint8Array(segs.length);
  const lines = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) {
        const tip = dir ? line[line.length - 1] : line[0];
        const next = (ends.get(key(tip)) || []).find((j) => !used[j]);
        if (next === undefined) break;
        used[next] = 1;
        const s = segs[next];
        const other = key(s[0]) === key(tip) ? s[1] : s[0];
        if (dir) line.push(other); else line.unshift(other);
      }
    }
    if (line.length >= 6) lines.push(line.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })));
  }
  return lines;
}
