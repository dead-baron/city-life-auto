// Car soccer (the owner, 10-16: "Rocket League-style car soccer arena (boosts, banked walls, a giant ball)"): the arena's
// shape, the giant ball's physics and the arena's pull on a car - the same code on the server (server/systems/
// carsoccer.js runs the match and the ball) and on the page (client/carsoccer.js, loaded near the arena: it predicts the
// ball and draws it). The numbers are shared/rules-games.js CARSOCCER's.
//
// An arena is a box of tiles (m.arenas[]: arenaOf - World v3's Waves Arena by the stadium: shared/world3-stadium.js):
// a wall all round; at each end, past the goal line, the goal's box (three tiles deep, goalW across) in a back wall;
// inside, the pitch with the banked walls along every side (bank.w px wide, none across a goal's mouth). A car on a bank
// is pulled back down to the pitch (carStep: shared/physics.js runs it after every vehicle step, server and page alike,
// so the prediction never fights it) and drawn up it (m.jumps' bank entries: client/art2/game/jumps.js). Boost: the
// Sprint button at the wheel pushes the car on while the server says there's boost (v.bok; on the page `local.bok`,
// which client/carsoccer.js keeps from the server's word), and a car is held still at a kick-off (v.frz / local.frz).
// Deterministic like all shared code: nothing here runs at load time but plain arithmetic.
import { TILE, T } from './constants.js';
import { CARSOCCER as C } from './rules-games.js';
import { circleVsObb } from './math.js';

export const TEAMS = ['ORANGE', 'BLUE'];
export const TEAM_PAINT = [5, 1];                     // (shared/vehicles.js PAINTS: orange, blue)
export const TEAM_COL = ['#ff8a2a', '#3a8cff'];
export const END_T = 4;                                // tiles at each end: the back wall and the goal's box
export const BOX_T = 3;                                // the goal box's depth (tiles): the whole ball fits past the line
// the page's word for its own car while it predicts it (client/carsoccer.js keeps it from the server's messages)
export const local = { bok: false, frz: false };

// The arena from its box of tiles (tx, ty the north-west corner; tw x th): every edge in px - x0..y1 the whole box,
// ix0..iy1 the walls' inner faces (the play area, the goal lines at ix0 and ix1), fx0..fy1 the flat pitch inside the
// banks, my0..my1 the goals' mouths, gx0 / gx1 the goals' back walls; cx, cy its middle; the boost pads; the kick-off
// spots [team][n] = [x, y, heading]; the gate outside the west end where you join
export function arenaOf(tx, ty, tw, th, name = 'Waves Arena') {
  const x0 = tx * TILE, y0 = ty * TILE, x1 = (tx + tw) * TILE, y1 = (ty + th) * TILE, B = C.bank.w, gw = C.goalW;
  const ix0 = x0 + END_T * TILE, ix1 = x1 - END_T * TILE, iy0 = y0 + TILE, iy1 = y1 - TILE;
  const cx = (ix0 + ix1) / 2, cy = Math.round((iy0 + iy1) / 2 / TILE) * TILE;
  const a = { name, tx, ty, tw, th, x0, y0, x1, y1, ix0, ix1, iy0, iy1, cx, cy, gw, fx0: ix0 + B, fx1: ix1 - B, fy0: iy0 + B, fy1: iy1 - B, my0: cy - gw / 2, my1: cy + gw / 2, gx0: x0 + TILE, gx1: x1 - TILE };
  const hx = (a.fx1 - a.fx0) / 2, hy = (a.fy1 - a.fy0) / 2;
  a.pads = [];
  for (const [u, v, big] of [[-0.86, -0.8, 1], [0.86, -0.8, 1], [-0.86, 0.8, 1], [0.86, 0.8, 1], [0, -0.86, 1], [0, 0.86, 1],
    [-0.42, -0.45, 0], [0.42, -0.45, 0], [-0.42, 0.45, 0], [0.42, 0.45, 0], [-0.66, 0, 0], [0.66, 0, 0], [0, -0.42, 0], [0, 0.42, 0]]) a.pads.push({ x: Math.round(cx + u * hx), y: Math.round(cy + v * hy), big });
  a.spots = [0, 1].map((t) => [[0.3, 0], [0.48, -0.42], [0.48, 0.42]].map(([u, v]) => { const x = Math.round(cx + (t ? 1 : -1) * u * (ix1 - ix0) / 2 * 0.9), y = Math.round(cy + v * hy); return [x, y, Math.atan2(cy - y, cx - x)]; }));
  a.gate = { x: x0 - 20, y: cy };
  return a;
}
// The tile each of the arena's tiles is: the wall, or paving - the pitch, its banks and the goals' boxes (never a lot:
// nobody parks in there; client/art2/game/groundbake.js lays the turf, the banks' concrete and the lines over it)
export function arenaTile(a, tx, ty) {
  const X = (tx + 0.5) * TILE, Y = (ty + 0.5) * TILE;
  if (X > a.ix0 && X < a.ix1 && Y > a.iy0 && Y < a.iy1) return T.PLAZA;
  if (Y > a.my0 && Y < a.my1 && ((X > a.gx0 && X < a.ix0) || (X > a.ix1 && X < a.gx1))) return T.PLAZA;
  return T.WALL;
}
// the renderer's ramps for a car driving up the banks (m.jumps: client/art2/game/jumps.js - bank: the ground's height
// alone, never a flight): one along each wall, the ends' in two, either side of the goal's mouth
export function bankRamps(a) {
  const B = C.bank.w, h = C.bank.h, out = [];
  const J = (x, y, ang, w) => out.push({ x, y, a: ang, len: 2 * B, w, h, ramp: B, bank: 1 });
  J(a.cx, a.iy0, Math.PI / 2, a.ix1 - a.ix0); J(a.cx, a.iy1, -Math.PI / 2, a.ix1 - a.ix0);
  for (const x of [a.ix0, a.ix1]) { J(x, (a.iy0 + a.my0) / 2, x === a.ix0 ? Math.PI : 0, a.my0 - a.iy0); J(x, (a.my1 + a.iy1) / 2, x === a.ix0 ? Math.PI : 0, a.iy1 - a.my1); }
  return out;
}
export const arenaAt = (m, x, y) => { for (const a of (m && m.arenas) || []) if (x > a.x0 && x < a.x1 && y > a.y0 && y < a.y1) return a; return null; };

// How far up a bank (x, y) is: 0 on the flat (or out of the play area), 1 at the wall's foot - with the way back down
// to the pitch (nx, ny) in OUT. None across a goal's mouth: the pitch runs flat into the goal
const OUT = [0, 0, 0];
export function bankAt(a, x, y) {
  let dx = x < a.fx0 ? x - a.fx0 : x > a.fx1 ? x - a.fx1 : 0;
  const dy = y < a.fy0 ? y - a.fy0 : y > a.fy1 ? y - a.fy1 : 0;
  if (dx && y > a.my0 && y < a.my1) dx = 0;
  if (!dx && !dy) return 0;
  const d = Math.hypot(dx, dy);
  OUT[0] = Math.min(1, d / C.bank.w); OUT[1] = -dx / d; OUT[2] = -dy / d;
  return OUT[0];
}
export const bankDir = () => OUT;
// the ground's height there (px): up a bank, 0 on the flat
export const groundZ = (a, x, y) => bankAt(a, x, y) * C.bank.h;

// After a vehicle's step (shared/physics.js setArena): inside an arena, the banks pull it back down to the pitch, the
// boost pushes it on, a kick-off holds it. s: the vehicle's state (the server's vehicle - s.arena set - or the page's
// prediction), inp: its driveInput (gallop: the Sprint button)
export function carStep(s, inp, dt, map) {
  const A = map.arenas;
  if (!A || !A.length) return;
  for (const a of A) {
    if (s.x < a.x0 || s.x > a.x1 || s.y < a.y0 || s.y > a.y1) continue;
    if (s.arena ? s.frz : local.frz) { s.x -= s.vx * dt; s.y -= s.vy * dt; s.a -= (s.av || 0) * dt; s.vx = 0; s.vy = 0; s.av = 0; return; }   // (this step's move undone)
    if (bankAt(a, s.x, s.y)) { const k = C.bank.g * OUT[0] * dt; s.vx += OUT[1] * k; s.vy += OUT[2] * k; }
    if (inp && inp.gallop && (s.arena ? s.bok : local.bok)) { const k = C.boost.acc * dt; s.vx += Math.cos(s.a) * k; s.vy += Math.sin(s.a) * k; }
    return;
  }
}

// ---- the ball ---------------------------------------------------------------------------------------------------
export const newBall = (a) => ({ x: a.cx, y: a.cy, z: 0, vx: 0, vy: 0, vz: 0, spin: 0 });
const CAR_H = 34;   // (px: a car's height - the ball sails over one when it's higher than that)
// One step of the ball (dt s): its flight and its bounces off the floor, the banks rolling it back, the walls, the
// goals' posts and boxes, the cars (cars: [{ id, x, y, a, vx, vy, L, W }] - a car shoves it, the ball never slows a
// car: a car is far the heavier, and the page's prediction of its own car stays right). touched(id) for each car that
// hit it. Returns 0, or the goal it went into: 1 the west goal (a goal for the east end's team, 1), 2 the east (team 0)
export function stepBall(b, a, dt, cars, touched) {
  const B = C.ball, r = B.r;
  b.vz -= B.g * dt; b.z += b.vz * dt;
  if (b.z <= 0) { b.z = 0; b.vz = b.vz < -90 ? -b.vz * B.bounce * 0.8 : 0; }
  const ground = b.z < 2, k = Math.exp(-(ground ? B.roll : B.drag) * dt);
  b.vx *= k; b.vy *= k;
  if (ground && bankAt(a, b.x, b.y)) { const q = C.bank.g * 0.8 * OUT[0] * dt; b.vx += OUT[1] * q; b.vy += OUT[2] * q; }
  for (const c of cars) {
    if (b.z > CAR_H + 8) continue;
    const h = circleVsObb(b.x, b.y, r, c.x, c.y, c.a, c.L / 2, c.W / 2);
    if (!h) continue;
    b.x += h.nx * h.depth; b.y += h.ny * h.depth;
    const vcn = c.vx * h.nx + c.vy * h.ny, vbn = b.vx * h.nx + b.vy * h.ny;
    if (vbn - vcn < 1) {   // (closing: the car's push along the normal, livelier than the car itself, a kick on top)
      const add = Math.max(0, vcn) * B.hit + B.kick - vbn;
      b.vx += h.nx * add; b.vy += h.ny * add;
      b.vz = Math.max(b.vz, Math.min(560, Math.max(0, vcn) * B.lift));
      b.spin += (c.vx * -h.ny + c.vy * h.nx) * 0.002;
      if (touched) touched(c.id);
    }
  }
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > B.max) { b.vx *= B.max / sp; b.vy *= B.max / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.spin *= Math.exp(-0.8 * dt);
  return walls(b, a, r);
}
// the walls, the posts and the goals' boxes: the ball kept in, bounced off; a goal once it's all the way over the line
function walls(b, a, r) {
  const e = C.ball.bounce;
  if (b.y - r < a.iy0) { b.y = a.iy0 + r; b.vy = Math.abs(b.vy) * e; }
  if (b.y + r > a.iy1) { b.y = a.iy1 - r; b.vy = -Math.abs(b.vy) * e; }
  for (const [lx, side] of [[a.ix0, -1], [a.ix1, 1]]) {
    const into = side < 0 ? lx - b.x : b.x - lx;   // (how far past the goal line its middle is)
    if (into < 0) {   // (in front of the line: the end wall either side of the mouth, the posts)
      if (-into < r && (b.y < a.my0 || b.y > a.my1)) { b.x = lx - side * r; b.vx = -side * Math.abs(b.vx) * e; }
      for (const py of [a.my0, a.my1]) {
        const dx = b.x - lx, dy = b.y - py, d = Math.hypot(dx, dy);
        if (d < r && d > 1e-6) { const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny; b.x = lx + nx * r; b.y = py + ny * r; if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; } }
      }
    } else {   // (in the goal's box: its sides and its back)
      if (b.y - r < a.my0) { b.y = a.my0 + r; b.vy = Math.abs(b.vy) * e; }
      if (b.y + r > a.my1) { b.y = a.my1 - r; b.vy = -Math.abs(b.vy) * e; }
      const back = side < 0 ? a.gx0 : a.gx1;
      if (side < 0 ? b.x - r < back : b.x + r > back) { b.x = back - side * r; b.vx = -side * Math.abs(b.vx) * e; }
      if ((side < 0 ? lx - b.x : b.x - lx) > r) return side < 0 ? 1 : 2;   // (all of it over the line - the box holds it: BOX_T tiles, r under half that)
    }
  }
  return 0;
}
// a car, as stepBall takes it, from a vehicle's state and its def
export const carOf = (id, s, def) => ({ id, x: s.x, y: s.y, a: s.a, vx: s.vx || 0, vy: s.vy || 0, L: def.L, W: def.W });
// the boost pad within reach of (x, y), or -1
export function padAt(a, x, y) {
  for (let i = 0; i < a.pads.length; i++) { const p = a.pads[i]; if (Math.hypot(p.x - x, p.y - y) < C.boost.r + (p.big ? 8 : 0)) return i; }
  return -1;
}
