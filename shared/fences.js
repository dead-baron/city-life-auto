// Fences people can't walk through (the owner, 10-23: "Currently you can walk through fences, I think an auto-jump over
// mechanic would be a nice touch on things like fences (specifically this mid-height wooden fence) so they don't block
// you but you can't just walk over them"). Every fence run on the map - the props drawn as a fence line (fenceline:
// picket, wood, rail, iron, stone, chain; chainfence, yfence, hedgerun, rail) and the fields' split-rail fences along
// their north edge (the runs client/art2/game/statics.js draws) - is a segment people collide with:
//   - a low or mid-height one (a rail fence, a picket, a board fence, an iron railing, a low stone wall, a low hedge)
//     you hop over: walk into it at a run (the stick past a walk, the keys, a dive roll) heading across it and you
//     crouch a beat and vault it (FENCE_HOP: a short pause, then over and down on the far side - the page lifts you
//     off the ground through it: client/main.js pedLook). Not carrying a crate, not on a board, not swimming, and only
//     where the far side is somewhere to land (ground you can stand on, nothing solid there, no second fence across the
//     way): else it holds you like a wall. Someone walking slowly along it is held.
//   - a tall one (chain-link, a compound's wall, a tall hedge) just blocks.
// The people the server walks (pedestrians, police, animals) hop the low ones the same way when they walk into one
// (their paths keep to the streets, the pavements and the yards' paths, which the fences leave open: World v3's
// gates and doors are kept clear by shared/world3-fencegaps.js); a tall one stops them.
// shared/physics.js pedStep runs it (setFences: the server registers it in server/world.js, the page once it has the
// city - client/main.js - so the page's first load doesn't carry it). Cars drive through them as before.
// The segments are worked out from the map's own data (props, fields) once per map: nothing new in the world's data.
import { TILE, PED_RADIUS, T } from './constants.js';
import { PED_BLOCK, WATER_T } from './mapcore.js';

// s: the hop's whole time; crouch: the pause before the vault; speed: px/s across; lift: px up at the top (the page's);
// run: how far the stick has to be pushed (0..1, a walk is up to 0.6); aim: how square on you have to be heading into it;
// reach: px short of it a hop may start (a fence's posts are solid props that hold you that little way off)
export const FENCE_HOP = { s: 0.5, crouch: 0.12, speed: 100, lift: 12, run: 0.62, aim: 0.7, reach: 8 };
export const FENCE_HALF = 2;   // px: a fence's half thickness
const LOW = 2, TALL = 1;
// a fence prop's kind: 0 not a fence, LOW (hopped), TALL (blocks)
export function fenceKindOf(p) {
  switch (p.t) {
    case 'fenceline': return p.kind === 'chain' || p.kind === 'wall' ? TALL : LOW;
    case 'chainfence': case 'yfence': return TALL;
    case 'hedgerun': return (p.h || 16) >= 16 ? TALL : LOW;
    case 'rail': return LOW;
    default: return 0;
  }
}
// a fence prop's ends [x0, y0, x1, y1]
export function fenceEnds(p) {
  if (p.t === 'yfence') return [p.x, p.y, p.x1 ?? p.x, p.y1 ?? p.y];
  return [p.x, p.y, p.x + (p.tx || 0), p.y + (p.ty || 0)];
}
// The fields' fence runs along y0 = f.y - 10: World v3's laid runs (f.fence), else as the page draws them (open land)
export function fieldRuns(m, f) {
  if (f.fence) return f.fence;
  const runs = [], y0 = f.y - 10, x1 = f.x + f.w + 10;
  const dry = (x) => { const tx = Math.floor(x / TILE), ty = Math.floor(y0 / TILE); if (!m.inside(tx, ty)) return false; const t = m.tiles[m.idx(tx, ty)]; return t !== T.WATER && t !== T.DEEP && t !== T.ROAD && t !== T.BRIDGE; };
  let a = null;
  for (let x = f.x - 10; ; x += 16) {
    const ok = x <= x1 && dry(x);
    if (ok && a === null) a = x;
    else if (!ok && a !== null) { const b = Math.min(x1, x - 16); if (b - a >= 48) runs.push([a, b]); a = null; }
    if (x > x1) break;
  }
  return runs;
}

// All the map's fence segments: { x0, y0, x1, y1, k, src } (src: the prop's index, or -1 - f for field f)
export function fenceSegments(m) {
  const out = [];
  (m.props || []).forEach((p, i) => {
    if (!p) return;
    const k = fenceKindOf(p);
    if (!k) return;
    const [x0, y0, x1, y1] = fenceEnds(p);
    if (Math.abs(x1 - x0) + Math.abs(y1 - y0) < 2) return;
    out.push({ x0, y0, x1, y1, k, src: i });
  });
  (m.fields || []).forEach((f, i) => { for (const [a, b] of fieldRuns(m, f)) if (b - a >= 2) out.push({ x0: a, y0: f.y - 10, x1: b, y1: f.y - 10, k: LOW, src: -1 - i }); });
  return out;
}

// the segments by tile (the tiles each passes through), once per map
const CACHE = new WeakMap();
export function fencesOf(m) {
  let F = CACHE.get(m);
  if (F) return F;
  const segs = fenceSegments(m), grid = new Map();
  segs.forEach((s, id) => {
    const L = Math.hypot(s.x1 - s.x0, s.y1 - s.y0), n = Math.max(1, Math.ceil(L / 12));
    let last = -1;
    for (let j = 0; j <= n; j++) {
      const tx = Math.floor((s.x0 + (s.x1 - s.x0) * j / n) / TILE), ty = Math.floor((s.y0 + (s.y1 - s.y0) * j / n) / TILE);
      if (!m.inside(tx, ty)) continue;
      const k = m.idx(tx, ty);
      if (k === last) continue;
      last = k;
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      if (arr[arr.length - 1] !== id) arr.push(id);
    }
  });
  F = { segs, grid, mark: new Uint32Array(segs.length), stamp: 0 };
  CACHE.set(m, F);
  return F;
}

// the fence segments within r of (x, y): ids (each once)
export function fencesNear(m, x, y, r) {
  const F = fencesOf(m), out = [];
  if (!F.segs.length) return out;
  if (++F.stamp > 4e9) { F.stamp = 1; F.mark.fill(0); }
  const st = F.stamp;
  const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), ty0 = Math.floor((y - r) / TILE), ty1 = Math.floor((y + r) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!m.inside(tx, ty)) continue;
    const arr = F.grid.get(m.idx(tx, ty));
    if (arr) for (const id of arr) if (F.mark[id] !== st) { F.mark[id] = st; out.push(id); }
  }
  return out;
}

// the nearest point of a segment to (x, y): [qx, qy, t]
function nearest(s, x, y) {
  const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / l2)) : 0;
  return [s.x0 + dx * t, s.y0 + dy * t, t];
}
// does the way from (ax, ay) to (bx, by) cross segment s
function crosses(s, ax, ay, bx, by) {
  const d1x = bx - ax, d1y = by - ay, d2x = s.x1 - s.x0, d2y = s.y1 - s.y0;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const u = ((s.x0 - ax) * d2y - (s.y0 - ay) * d2x) / den, v = ((s.x0 - ax) * d1y - (s.y0 - ay) * d1x) / den;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

// Somewhere to land a hop over fence `id`, D px from (x, y) along (dx, dy): firm ground clear of everything, and no
// other fence across the way (a run's next piece on the same line is the same fence)
function landing(m, F, id, x, y, dx, dy, D) {
  const lx = x + dx * D, ly = y + dy * D, r = PED_RADIUS;
  for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const tx = Math.floor((lx + ox) / TILE), ty = Math.floor((ly + oy) / TILE);
    if (!m.inside(tx, ty)) return false;
    const t = m.tiles[m.idx(tx, ty)];
    if (PED_BLOCK[t] || WATER_T[t] || t === T.COUNTER) return false;
    if (m.lvl0Block && m.lvl0Block[m.idx(tx, ty)] === 1) return false;
  }
  // nothing solid where you come down
  const tx0 = Math.floor((lx - r - 24) / TILE), tx1 = Math.floor((lx + r + 24) / TILE), ty0 = Math.floor((ly - r - 24) / TILE), ty1 = Math.floor((ly + r + 24) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const arr = m.solidProps && m.inside(tx, ty) ? m.solidProps.get(m.idx(tx, ty)) : null;
    if (arr) for (const e of arr) if (!e.off && Math.hypot(e.x - lx, e.y - ly) < r + e.r) return false;
  }
  const S = F.segs[id];
  for (const j of fencesNear(m, (x + lx) / 2, (y + ly) / 2, D / 2 + r + 4)) {
    if (j === id) continue;
    const s = F.segs[j];
    const [qx, qy] = nearest(s, lx, ly);
    if (Math.hypot(lx - qx, ly - qy) < r + FENCE_HALF + 1) return false;   // (you'd come down in another)
    if (!crosses(s, x, y, lx, ly)) continue;
    // (a run's next piece on the same line: the same fence - a seawall's railing comes in 3-tile pieces)
    const sx = S.x1 - S.x0, sy = S.y1 - S.y0, tx = s.x1 - s.x0, ty = s.y1 - s.y0, sl = Math.hypot(sx, sy) || 1, tl = Math.hypot(tx, ty) || 1;
    const par = Math.abs(sx * ty - sy * tx) / (sl * tl) < 0.2, [px, py] = nearest(S, s.x0, s.y0), off = Math.hypot(s.x0 - px, s.y0 - py);
    if (!(par && off < 4 && s.k === S.k)) return false;
  }
  return true;
}

// The fences against someone on foot this step (after shared/physics.js's walls and props): held off them, or - into a
// low one at a run, square on, somewhere to land - the hop starts (s.hop: its time left; s.rdx, s.rdy: the way over;
// s.hopNew: just started - the server tells the others: server/world.js)
export function fenceCollide(s, inp, m, mods, swim) {
  if (s.hop > 0) return;
  const F = fencesOf(m);
  if (!F.segs.length) return;
  const r = PED_RADIUS + FENCE_HALF;
  const near = fencesNear(m, s.x, s.y, r + FENCE_HOP.reach + 1);
  if (!near.length) return;
  const ml = Math.hypot(inp.mx || 0, inp.my || 0);
  const can = !!mods.canMove && mods.canSprint !== false && !mods.board && !swim && !mods.tumble && !mods.air && (ml >= FENCE_HOP.run || s.rollT > 0);
  for (const id of near) {
    const g = F.segs[id];
    const [qx, qy] = nearest(g, s.x, s.y);
    let dx = s.x - qx, dy = s.y - qy, d = Math.hypot(dx, dy);
    if (d >= r + (g.k === LOW && can ? FENCE_HOP.reach : 0)) continue;   // (a post along it may hold you a little short of the rails)
    let nx, ny;
    if (d < 1e-6) {   // (right on the line: out to the side you came from)
      const ex = g.x1 - g.x0, ey = g.y1 - g.y0, el = Math.hypot(ex, ey) || 1;
      nx = -ey / el; ny = ex / el;
      if (nx * s.vx + ny * s.vy > 0) { nx = -nx; ny = -ny; }
      d = 0;
    } else { nx = dx / d; ny = dy / d; }
    if (g.k === LOW && can) {
      // heading into it, square on: the stick (or a dive roll's way) against the fence's side
      const hx = s.rollT > 0 ? s.rdx : (inp.mx || 0) / (ml || 1), hy = s.rollT > 0 ? s.rdy : (inp.my || 0) / (ml || 1);
      // (the way across: straight over, square to the fence - not along it)
      const ex = g.x1 - g.x0, ey = g.y1 - g.y0, el = Math.hypot(ex, ey) || 1;
      let ox = -ey / el, oy = ex / el;
      if (ox * nx + oy * ny > 0) { ox = -ox; oy = -oy; }   // (pointing from you through the fence)
      if (hx * ox + hy * oy >= FENCE_HOP.aim && landing(m, F, id, s.x, s.y, ox, oy, (FENCE_HOP.s - FENCE_HOP.crouch) * FENCE_HOP.speed)) {
        s.hop = FENCE_HOP.s; s.rdx = ox; s.rdy = oy; s.vx = 0; s.vy = 0; s.rollT = 0; s.hopNew = 1;
        return;
      }
    }
    if (d >= r) continue;
    s.x += nx * (r - d); s.y += ny * (r - d);
    const vn = s.vx * nx + s.vy * ny;
    if (vn < 0) { s.vx -= vn * nx; s.vy -= vn * ny; }
  }
}
// The hop under way (shared/physics.js pedStep, in place of the walk): the crouch, then over at FENCE_HOP.speed
export function fenceHopMove(s, dt) {
  const H = FENCE_HOP, t = H.s - s.hop;
  s.hop = Math.max(0, s.hop - dt);
  const v = t < H.crouch ? 0 : H.speed;
  s.vx = s.rdx * v; s.vy = s.rdy * v;
  if (s.hop === 0) { s.vx *= 0.7; s.vy *= 0.7; }
}
// how high off the ground a hop is (px) with `left` seconds of it to go, and whether it's the crouch
export function hopLift(left) {
  const H = FENCE_HOP, t = H.s - left;
  if (left <= 0 || t < 0) return 0;
  return t < H.crouch ? 0 : Math.sin(Math.PI * (t - H.crouch) / (H.s - H.crouch)) * H.lift;
}
export const FENCES = { collide: fenceCollide, move: fenceHopMove };
