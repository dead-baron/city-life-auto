// Cars smashing street furniture - shared so the driver's client predicts the exact same
// momentum loss the server applies (otherwise every lamp post you clip causes a correction,
// which reads as the car jittering).
import { BREAKABLE, HEAVY_PROPS } from './map.js';
import { PROP_SIZES } from './prefab-data.js';
import { circleVsObb, obbBounds } from './math.js';
import { TILE } from './constants.js';

export const SMASH_MIN_SPEED = 55;
export const GEYSER_S = 12;       // a smashed hydrant sprays this long
export const GEYSER_R = 70;       // cars inside this radius are dragged by the spray
export const isHydrant = (t) => t === 'hydrant' || t === 'hydrant_y';

// The spray slows any car driving through it (shared so the driver predicts it).
export function geyserDrag(s, geysers, dt, applies = () => true) {
  for (const q of geysers) {
    if (!applies(q)) continue;
    const dx = s.x - q.x, dy = s.y - q.y;
    if (dx * dx + dy * dy <= GEYSER_R * GEYSER_R) { s.vx *= 1 - 2 * dt; s.vy *= 1 - 2 * dt; }
  }
}

export function breakGrid(map) {
  if (map.breakGrid) return map.breakGrid;
  const g = new Map();
  map.props.forEach((p, i) => {
    if (!BREAKABLE.has(p.t)) return;
    const k = Math.floor(p.y / TILE) * map.w + Math.floor(p.x / TILE);
    (g.get(k) || g.set(k, []).get(k)).push(i);
  });
  map.breakGrid = g;
  return g;
}

export function propRadius(map, i) {
  const p = map.props[i];
  const e = map.propSolid.get(i);
  if (e) return e.r + 2;
  const s = PROP_SIZES[p.t] || [24, 24];
  return Math.max(6, Math.min(16, Math.max(s[0], s[1]) * 0.3));
}

// One vehicle state s ({x,y,a,vx,vy}) against the props. isBroken(i) / onBreak(i, heavy, speed)
// are supplied by the caller (server world vs client prediction). Applies the momentum loss.
export function smashProps(map, s, def, isBroken, onBreak) {
  if (def.kind === 'boat' || (s.lz || 0) > 0.3) return; // up on the highway: the street furniture is below
  const sp = Math.abs(s.vx) + Math.abs(s.vy);
  if (sp < SMASH_MIN_SPEED) return;
  const g = breakGrid(map);
  const bb = obbBounds(s.x, s.y, s.a, def.L / 2, def.W / 2);
  const t0x = Math.floor((bb.minX - 16) / TILE), t1x = Math.floor((bb.maxX + 16) / TILE);
  const t0y = Math.floor((bb.minY - 16) / TILE), t1y = Math.floor((bb.maxY + 16) / TILE);
  for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
    const list = g.get(ty * map.w + tx);
    if (!list) continue;
    for (const i of list) {
      if (isBroken(i)) continue;
      const p = map.props[i];
      if (!circleVsObb(p.x, p.y, propRadius(map, i), s.x, s.y, s.a, def.L / 2, def.W / 2)) continue;
      const heavy = HEAVY_PROPS.has(p.t);
      const cur = Math.abs(s.vx) + Math.abs(s.vy);
      const f = heavy ? Math.max(0.55, 1 - 70 / Math.max(80, cur)) : 0.95;
      onBreak(i, heavy, cur);
      s.vx *= f; s.vy *= f;
    }
  }
}
