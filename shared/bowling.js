// Ten-pin bowling (the alley: buildBowlingAlley below; the game: server/systems/bowling.js). Shared and deterministic:
// the lanes' geometry, the ball's roll down a lane (where you stand, the angle, the power, a little hook), the pins it
// knocks down (worked out from the line and the speed - pins hit by the ball fly off and take others with them, off
// the kickbacks too; never random) and the score card (ten frames, strikes and spares, the tenth's bonus balls).
// Numbers in px; one tile is a metre. A lane is drawn and measured from the bowler's side: u across the lane (+ to
// the bowler's right), v down it from the foul line toward the pins.
import { TILE } from './constants.js';

export const BOWL = {
  LANES: 8, PITCH: 44,          // eight lanes side by side, 44 px apart (capping 2 + gutter 5 + bed 30 + gutter 5 + capping 2)
  BED: 30, GUT: 5,              // the lane bed and its gutters
  LEN_T: 7,                     // tiles from the back wall to the foul line (the pin deck and the lane)
  APPROACH_T: 2,                // tiles of approach behind the foul line
  PIN_SP: 9, PIN_R: 2.2,        // pins 9 px apart in a row (rows 0.866 of that apart), their bellies 2.2 px round
  BALL_R: 3.6,
  HEAD_BACK: 42,                // the head pin's distance from the back wall
  FEE: 10,                      // a lane and shoes for a game
  MIN_SPEED: 130, MAX_SPEED: 420,
  MAX_ANGLE: 0.2,               // radians off straight down the lane
  HOOK: 0.1,                    // the most the hook bends the line (slope) by the pins
};
const RS = BOWL.PIN_SP * 0.866;
export const PINFX = { KICK: 40, REACH: 2, CARRY: 0.3, PASS: 0.7 };
// the ten pins, from the bowler: u across (+ right), w beyond the head pin. 1 the head pin, 7 and 10 the back corners.
export const PINS = [[0, 0], [-0.5, 1], [0.5, 1], [-1, 2], [0, 2], [1, 2], [-1.5, 3], [-0.5, 3], [0.5, 3], [1.5, 3]].map(([a, b]) => ({ u: a * BOWL.PIN_SP, w: b * RS }));
export const ALL_PINS = 1023;
export const pinCount = (mask) => { let n = 0; for (let i = 0; i < 10; i++) if (mask & (1 << i)) n++; return n; };

// ---- the lanes in a building ----------------------------------------------------------------------------------------
// One alley: the building's interior (tiles x0..x1, y0..y1), its doors on the south (south: true) or the north. The
// lanes run from the back wall toward the front; the approach, then the settees and the counters by the door.
// (11-07, the owner: "Bowling alley is huge interior with tiny lanes. How about making the lanes much bigger?... bigger,
// wider lanes with more visible pins") a big building - the Old Freight House - gets BIG.lanes lanes drawn BIG.k times
// the size: everything about the roll and the pins is worked out at the old size (lane units: u, v, the pins' spots, the
// ball's line), and a lane's k scales it out onto the floor (lanePt) - the lanes, the pins, the ball BIG.k times bigger,
// the same game. A lane: ax its west edge, w its width, appr its approach (world px), k its scale, len (lane units).
export const BIG = { lanes: 6, k: 3, lenT: 21, apprT: 4, needW: 30, needD: 34 };   // (needW / needD: the interior it takes, tiles)
export const bigAlley = (wi) => wi.x1 - wi.x0 + 1 >= BIG.needW && wi.y1 - wi.y0 + 1 >= BIG.needD;
export function alleyLanes(wi) {
  const south = wi.south, dir = south ? 1 : -1, big = bigAlley(wi), k = big ? BIG.k : 1, n = big ? BIG.lanes : BOWL.LANES;
  const lenT = big ? BIG.lenT : BOWL.LEN_T, appr = (big ? BIG.apprT : BOWL.APPROACH_T) * TILE, w = BOWL.PITCH * k;
  const backEdge = south ? wi.y0 * TILE : (wi.y1 + 1) * TILE;
  const foulY = backEdge + dir * lenT * TILE;
  const span = n * w, left = Math.round(((wi.x0 + wi.x1 + 1) * TILE - span) / 2);
  const lanes = [];
  for (let i = 0; i < n; i++) {
    // (lane 1 is on the bowler's left: the west for a south door, the east for a north one)
    const j = south ? i : n - 1 - i, ax = left + j * w;
    lanes.push({ i, ax, cx: ax + w / 2, w, k, appr, foulY, backEdge, dir, right: south ? 1 : -1, len: lenT * TILE / k - BOWL.HEAD_BACK });
  }
  return lanes;
}
// world position of a lane point (u across, v down the lane from the foul line - lane units)
export function lanePt(lane, u, v) { const k = lane.k || 1; return { x: lane.cx + u * k * lane.right, y: lane.foulY - lane.dir * v * k }; }
export function pinSpots(lane) { return PINS.map((p) => lanePt(lane, p.u, lane.len + p.w)); }
// the lane whose approach (x, y) stands on, or -1
export function approachAt(alley, x, y, pad = 0) {
  for (const L of alley.lanes) {
    if (x < L.ax - pad || x >= L.ax + L.w + pad) continue;
    const d = (y - L.foulY) * L.dir;   // (behind the foul line, toward the door)
    if (d >= -2 && d <= L.appr + pad) return L.i;
  }
  return -1;
}
// how long a roll takes down its line (s) and where the ball is along it at t s (lane units)
export function rollAt(pts, speed, t) {
  let s = t * speed;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (s <= seg) { const f = seg ? s / seg : 0; return { u: a[0] + (b[0] - a[0]) * f, v: a[1] + (b[1] - a[1]) * f, done: false }; }
    s -= seg;
  }
  const z = pts[pts.length - 1];
  return { u: z[0], v: z[1], done: true };
}

// ---- the roll ---------------------------------------------------------------------------------------------------------
// From where you let go (u0 across the lane), the angle off straight (+ toward your right), the power (0..1) and the
// hook (-1 left, 0 none, 1 right): the ball's line down the lane as points every 6 px, its speed, and where it meets the
// pins (or the gutter it drops into).
export function rollBall(lane, u0, angle, power, hook) {
  const half = BOWL.BED / 2, len = lane.len;
  const speed = BOWL.MIN_SPEED + (BOWL.MAX_SPEED - BOWL.MIN_SPEED) * Math.max(0, Math.min(1, power));
  const a = Math.max(-BOWL.MAX_ANGLE, Math.min(BOWL.MAX_ANGLE, angle));
  // (a slow ball hooks more: it has longer to grip on the dry end of the lane)
  const hk = (hook || 0) * BOWL.HOOK * (1.25 - 0.5 * (speed - BOWL.MIN_SPEED) / (BOWL.MAX_SPEED - BOWL.MIN_SPEED));
  let u = Math.max(-half + BOWL.BALL_R, Math.min(half - BOWL.BALL_R, u0)), slope = Math.tan(a), v = 0;
  const pts = [[u, 0]];
  let gutter = -1;
  const step = 2;
  while (v < len - 14) {
    const s = slope + hk * Math.max(0, v - len * 0.55) / (len * 0.45);   // (the hook bites on the back of the lane)
    u += s * step; v += step;
    if (Math.abs(u) > half) { gutter = v; u = Math.sign(u) * (half + BOWL.GUT / 2); break; }
    if (v % 6 === 0) pts.push([u, v]);
  }
  const entrySlope = slope + hk * Math.max(0, v - len * 0.55) / (len * 0.45);
  if (gutter >= 0) { pts.push([u, gutter]); pts.push([u, len + 3 * RS + 16]); }
  else pts.push([u, v]);
  return { pts, speed, gutter: gutter >= 0, entry: { u, slope: entrySlope } };
}

// ---- the pins -----------------------------------------------------------------------------------------------------------
// The ball comes in at u with a slope and a speed; the pins it touches fly off (along the line from the ball's centre
// through theirs, harder the faster and the fuller the hit) and the ball deflects off each one. A flying pin takes any
// standing pin it passes close to, and bounces off the kickbacks at the sides. Returns the pins knocked down (a mask)
// and where each one went ({ i, du, dw }: how far it flew).
export function knockPins(standing, entryU, slope, speed) {
  const half = BOWL.BED / 2, wall = half + BOWL.GUT, br = BOWL.BALL_R, pr = BOWL.PIN_R, { KICK, REACH, CARRY, PASS } = PINFX;
  const sp01 = Math.max(0, Math.min(1, (speed - BOWL.MIN_SPEED) / (BOWL.MAX_SPEED - BOWL.MIN_SPEED)));
  let down = 0;
  const flights = [], queue = [];
  // the ball
  let bu = entryU, bw = -14, du = slope, dw = 1;
  { const n = Math.hypot(du, dw); du /= n; dw /= n; }
  let e = speed;
  for (let k = 0; k < 400 && bw < 3 * RS + 12 && Math.abs(bu) < wall; k++) {
    bu += du * 0.5; bw += dw * 0.5;
    for (let i = 0; i < 10; i++) {
      if (!(standing & (1 << i)) || (down & (1 << i))) continue;
      const P = PINS[i], ou = P.u - bu, ow = P.w - bw, d = Math.hypot(ou, ow);
      if (d >= br + pr) continue;
      const nu = ou / d, nw = ow / d, full = Math.max(0, nu * du + nw * dw);
      down |= 1 << i;
      queue.push({ i, u: P.u, w: P.w, nu, nw, dist: 8 + (e / BOWL.MAX_SPEED) * KICK * (0.3 + 0.7 * full) * (0.6 + 0.4 * sp01), hits: 0 });
      // the ball loses a little speed and is pushed off the pin's line
      du -= nu * 0.42 * full; dw -= nw * 0.42 * full;
      const n = Math.hypot(du, dw); du /= n; dw /= n;
      if (dw < 0.3) { dw = 0.3; const m = Math.hypot(du, dw); du /= m; dw /= m; }
      e *= 0.88;
    }
  }
  // the pins in flight
  for (let q = 0; q < queue.length; q++) {
    const f = queue[q];
    let su = f.u, sw = f.w, nu = f.nu, nw = f.nw, left = f.dist, bounced = false, hits = 0;
    for (let k = 0; k < 4 && left > 1; k++) {
      // the earliest standing pin along this stretch, or the kickback
      let best = -1, bt = left;
      for (let i = 0; i < 10; i++) {
        if (!(standing & (1 << i)) || (down & (1 << i))) continue;
        const P = PINS[i], t = (P.u - su) * nu + (P.w - sw) * nw;
        if (t <= 0 || t > bt) continue;
        const cu = su + nu * t, cw = sw + nw * t;
        if (Math.hypot(P.u - cu, P.w - cw) < 2 * pr + REACH) { best = i; bt = t; }   // (a toppling pin reaches out past its belly)
      }
      const tw = nu > 0 ? (wall - su) / nu : nu < 0 ? (-wall - su) / nu : Infinity;
      if (tw > 0 && tw < bt && !bounced) {
        su += nu * tw; sw += nw * tw; left -= tw; nu = -nu; left *= 0.65; bounced = true;   // (off the kickback plate)
        continue;
      }
      su += nu * bt; sw += nw * bt; left -= bt;
      if (best < 0) break;
      const P = PINS[best];
      let mu = P.u - su, mw = P.w - sw;
      const ml = Math.hypot(mu, mw) || 1;
      mu = mu / ml + nu * CARRY; mw = mw / ml + nw * CARRY;
      const mm = Math.hypot(mu, mw);
      down |= 1 << best;
      queue.push({ i: best, u: P.u, w: P.w, nu: mu / mm, nw: mw / mm, dist: left * PASS, hits: 0 });
      left *= 0.45; hits++;
      if (hits >= 2) break;
    }
    flights.push({ i: f.i, du: Math.round(su - f.u), dw: Math.round(sw - f.w) });
  }
  return { down, flights };
}

// ---- the score card ------------------------------------------------------------------------------------------------------
// rolls: pins knocked down by each ball, in order. Returns the ten frames ({ marks: ['X', '7', '/', '-'...], total:
// the running score once the frame can be counted, else null }), where the next ball goes (frame 0..9, ball 0..2, or
// done), and the pins standing for it.
export function scoreCard(rolls) {
  const frames = [];
  let r = 0, run = 0;
  for (let f = 0; f < 10; f++) {
    const marks = [];
    let total = null;
    if (f < 9) {
      const a = rolls[r];
      if (a === undefined) { frames.push({ marks, total }); continue; }
      if (a === 10) {
        marks.push('X');
        if (rolls[r + 1] !== undefined && rolls[r + 2] !== undefined) total = run += 10 + rolls[r + 1] + rolls[r + 2];
        r += 1;
      } else {
        marks.push(a ? String(a) : '-');
        const b = rolls[r + 1];
        if (b !== undefined) {
          if (a + b === 10) { marks.push('/'); if (rolls[r + 2] !== undefined) total = run += 10 + rolls[r + 2]; }
          else { marks.push(b ? String(b) : '-'); total = run += a + b; }
        }
        r += 2;
      }
    } else {
      const t = rolls.slice(r, r + 3), dig = (x) => (x ? String(x) : '-');
      if (t.length > 0) marks.push(t[0] === 10 ? 'X' : dig(t[0]));
      if (t.length > 1) marks.push(t[0] === 10 ? (t[1] === 10 ? 'X' : dig(t[1])) : t[0] + t[1] === 10 ? '/' : dig(t[1]));
      if (t.length > 2) marks.push(t[0] === 10 && t[1] !== 10 ? (t[1] + t[2] === 10 ? '/' : dig(t[2])) : t[2] === 10 ? 'X' : dig(t[2]));
      const need = t.length >= 2 && (t[0] === 10 || t[0] + t[1] === 10) ? 3 : 2;
      if (t.length >= need) total = run += t.slice(0, need).reduce((s, x) => s + x, 0);
    }
    frames.push({ marks, total });
  }
  return { frames, ...nextBall(rolls) };
}
// where the next ball goes: { frame, ball, done, standing (how many pins are up for it) }
export function nextBall(rolls) {
  let r = 0;
  for (let f = 0; f < 9; f++) {
    if (rolls[r] === undefined) return { frame: f, ball: 0, done: false, up: 10 };
    if (rolls[r] === 10) { r++; continue; }
    if (rolls[r + 1] === undefined) return { frame: f, ball: 1, done: false, up: 10 - rolls[r] };
    r += 2;
  }
  const t = rolls.slice(r);
  if (t.length === 0) return { frame: 9, ball: 0, done: false, up: 10 };
  if (t.length === 1) return { frame: 9, ball: 1, done: false, up: t[0] === 10 ? 10 : 10 - t[0] };
  if (t.length === 2) {
    if (t[0] === 10) return { frame: 9, ball: 2, done: false, up: t[1] === 10 ? 10 : 10 - t[1] };
    if (t[0] + t[1] === 10) return { frame: 9, ball: 2, done: false, up: 10 };
  }
  return { frame: 9, ball: t.length, done: true, up: 0 };
}
export const totalScore = (rolls) => { const c = scoreCard(rolls); let s = 0; for (const f of c.frames) if (f.total !== null) s = f.total; return s; };

// ---- the alley in the world (shared/map.js calls this once the walk-ins are built) -----------------------------------------
// The biggest plain warehouse with a single storefront and room for eight lanes becomes Pinwheel Lanes: the lanes along the
// back, the approach and the settees, the shoe counter by the door. A walk-in (its roof fades as you go in) with one unit,
// the counter's; m.bowling holds the lanes.
export function buildBowlingAlley(m, { T, DISTRICTS, keep = null }) {   // (keep: delivery stops it never takes - World v3's Westport Freight)
  const byB = new Map();
  for (const p of m.pois) if (p && p.b !== undefined) { if (!byB.has(p.b)) byB.set(p.b, []); byB.get(p.b).push(p); }
  let best = null;
  for (const b of m.buildings) {
    if (!b || b.gone || b.prefab < 0 || b.walkIn || b.home !== undefined || b.kind !== 'warehouse' || b.tw < 14 || b.th < 12) continue;
    const list = byB.get(b.id) || [];
    if (list.length !== 1 || list[0].kind !== 'delivery' || (keep && keep.includes(list[0].label))) continue;
    if (!best || b.tw * b.th > best.tw * best.th || (b.tw * b.th === best.tw * best.th && b.id < best.id)) best = b;
  }
  if (!best) return;
  const b = best, p = byB.get(b.id)[0], south = m.prefabs[b.prefab].rot === 0, dir = south ? 1 : -1;
  const x0 = b.tx + 1, x1 = b.tx + b.tw - 2, y0 = b.ty + 1, y1 = b.ty + b.th - 2;
  const back = south ? y0 : y1, wi0 = { south, x0, x1, y0, y1 }, big = bigAlley(wi0), lanes = alleyLanes(wi0), L0 = lanes[0];
  const lenT = Math.round((L0.foulY - L0.backEdge) * dir / TILE), apprT = Math.round(L0.appr / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) m.set(tx, ty, T.FLOOR);
  // the lanes and the pin decks: nobody walks down them (counter tiles block people, not sight) - a big alley's only under
  // its lanes, the floor either side of them open
  const lx0 = big ? Math.floor(Math.min(...lanes.map((L) => L.ax)) / TILE) : x0, lx1 = big ? Math.floor((Math.max(...lanes.map((L) => L.ax + L.w)) - 1) / TILE) : x1;
  for (let k = 0; k < lenT; k++) for (let tx = lx0; tx <= lx1; tx++) m.set(tx, back + dir * k, T.COUNTER);
  // the door: two tiles of the front wall, in the middle
  const fy = south ? b.ty + b.th - 1 : b.ty, dc = Math.floor((x0 + x1) / 2);
  m.set(dc, fy, T.FLOOR); m.set(dc + 1, fy, T.FLOOR);
  // the shoe counter on the right as you come in, the clerk behind it, by the door (a big alley's: four rows in from it)
  const counterRow = big ? (south ? y1 : y0) - dir * 4 : back + dir * (lenT + apprT), cx0 = x1 - (big ? 6 : 3), cx1 = x1;
  for (let tx = cx0; tx < cx1; tx++) m.set(tx, counterRow, T.COUNTER);
  const cx = (cx0 + cx1) / 2 * TILE;
  const old = p.label;
  p.kind = 'bowling'; p.label = 'Pinwheel Lanes';
  p.outside = { x: p.x, y: p.y };
  p.x = cx; p.y = (counterRow - dir + 0.5) * TILE; p.r = 40;
  for (const s of b.signs || []) if (s.text === old) s.text = p.label;
  if (!(b.signs || []).some((s) => s.text === p.label)) (b.signs ||= []).push({ x: (dc + 1) * TILE, y: south ? (b.ty + b.th - 0.6) * TILE : (b.ty + 0.6) * TILE, text: p.label });
  const unit = { poi: p.id, kind: 'bowling', x0, x1, counterRow, clerk: { x: cx, y: (counterRow + dir + 0.5) * TILE, a: south ? -Math.PI / 2 : Math.PI / 2 }, door: { tx: dc, ty: fy, w: 2 } };
  b.walkIn = { south, units: [unit], x0, x1, y0, y1 };
  b.business = 'bowling';
  m.walkIns.push(b.id);
  const d = m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))];
  m.bowling = { b: b.id, poi: p.id, name: p.label, district: DISTRICTS[d] ? DISTRICTS[d].name : '', south, lanes, counter: { x: p.x, y: p.y }, big };
  if (big) m.bowling.kit = alleyKit(lanes, unit, b.walkIn);
  for (const q of alleyFurniture(lanes, unit, m.bowling.kit)) solidBox(m, q);
}
// (11-07, the IN14 concept) a big alley's room filled out: behind each pair of lanes the ball return, the scoring console
// and a curved settee round a little table; the snack bar along the side with its stools, the tables and chairs in front,
// the lounge's tables beside the lanes, the shoe counter's cubbies by the door, a row of arcade cabinets and plants -
// [{ t, b: [x0, y0, x1, y1] (world px), solid }], for the art (client/art2/game/statics.js bowlingRoom) and the solids alike
export function alleyKit(lanes, unit, wi) {
  const out = [], L0 = lanes[0], dir = L0.dir, Fy = L0.foulY, T_ = TILE, put = (t, x0, x1, ya, yb, solid = true) => out.push({ t, b: [Math.round(x0), Math.round(Math.min(ya, yb)), Math.round(x1), Math.round(Math.max(ya, yb))], solid });
  const ry = (r) => Fy + dir * (L0.appr + r);   // (r px on from the back of the approach)
  for (let i = 0; i + 1 < lanes.length; i += 2) {
    const A = lanes[i], B = lanes[i + 1], mid = (Math.max(A.ax, B.ax) + Math.min(A.ax + A.w, B.ax + B.w)) / 2 + (A.ax < B.ax ? 0 : 0), xm = A.ax < B.ax ? A.ax + A.w : B.ax + B.w;
    void mid;
    put('return', xm - 10, xm + 10, ry(4), ry(46));
    put('console', xm - 30, xm - 14, ry(20), ry(34));
    put('table', xm + 16, xm + 36, ry(54), ry(70));
    put('settee', xm - 110, xm + 110, ry(84), ry(104));
    put('settee', xm - 110, xm - 90, ry(56), ry(84)); put('settee', xm + 90, xm + 110, ry(56), ry(84));
  }
  const X0 = wi.x0 * T_, X1 = (wi.x1 + 1) * T_, lx0 = Math.min(...lanes.map((L) => L.ax)), lx1 = Math.max(...lanes.map((L) => L.ax + L.w));
  const front = dir > 0 ? (wi.y1 + 1) * T_ : wi.y0 * T_, dx0 = unit.door.tx * T_, dx1 = (unit.door.tx + unit.door.w) * T_;
  // the snack bar along the west side, nearer the door: its counter, the stools in front of it
  const sy = front - dir * 9 * T_;
  put('snack', X0 + 2 * T_, X0 + 12 * T_, sy, sy - dir * 30);
  for (let k = 0; k < 8; k++) put('stool', X0 + 2.6 * T_ + k * 40, X0 + 2.6 * T_ + k * 40 + 10, sy - dir * 44, sy - dir * 54, false);
  // the tables and chairs in front, clear of the way in from the door and the counters
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const x = X0 + 15 * T_ + c * 4 * T_, y = ry(140 + r * 64);
    if (x > lx1 + 2 * T_ || (x + 2 * T_ > dx0 - 2 * T_ && x < dx1 + 2 * T_) || (front - y) * dir < 5 * T_) continue;
    put('table', x, x + 24, y, y + dir * 24); put('chair', x - 14, x - 4, y + dir * 6, y + dir * 18, false); put('chair', x + 28, x + 38, y + dir * 6, y + dir * 18, false);
  }
  // the lounge beside the lanes (west) and the arcade cabinets along the east wall, by the lanes
  for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) { const x = X0 + 2 * T_ + c * 5 * T_, y = Fy - dir * (4 * T_ + r * 4 * T_); if (x + 3 * T_ < lx0 - T_) { put('table', x, x + 24, y, y + dir * 24); put('chair', x - 14, x - 4, y + dir * 6, y + dir * 18, false); put('chair', x + 28, x + 38, y + dir * 6, y + dir * 18, false); } }
  for (let k = 0; k < 6; k++) { const y = Fy - dir * (2 * T_ + k * 34); if (X1 - 2 * T_ > lx1 + T_) put('cabinet', X1 - 26, X1 - 4, y, y - dir * 26); }
  // plants in the corners by the door
  for (const x of [X0 + 6, X1 - 26]) put('plant', x, x + 20, front - dir * 8, front - dir * 28);
  return out;
}
// The furniture you can't walk through, as art v2 draws it (client/art2/game/statics.js bowlingRoom): a ball return between
// each pair of lanes at the back of the approach, the settees behind the approach (the west half, clear of the door) and
// the little tables between them - a big alley's: its kit's solid pieces (alleyKit). -> boxes [x0, y0, x1, y1] in world px;
// solid: a row of circles each (map solidProps), so the player's prediction and the server agree.
export function alleyFurniture(lanes, unit, kit = null) {
  if (kit) return kit.filter((q) => q.solid).map((q) => q.b);
  const out = [], L0 = lanes[0], dir = L0.dir, box = (x0, x1, ya, yb) => out.push([x0, Math.min(ya, yb), x1, Math.max(ya, yb)]);
  lanes.forEach((L, i) => { if (i % 2 === 1) { const xm = (L.dir > 0 ? L.ax : L.ax + BOWL.PITCH) - 4; box(xm, xm + 8, L.foulY + L.dir * 34, L.foulY + L.dir * 58); } });
  const Ys = L0.foulY + dir * (2 * TILE + 6), xs0 = unit.x0 * TILE + 8, xs1 = Math.min(unit.door.tx * TILE - 12, (unit.x1 + 1) * TILE - 8);
  for (let x = xs0; x + 34 <= xs1; x += 46) {
    box(x, x + 34, Ys, Ys + dir * 14);
    if (x + 44 <= xs1) box(x + 36, x + 44, Ys, Ys + dir * 8);
  }
  return out;
}
function solidBox(m, [x0, y0, x1, y1]) {
  const w = x1 - x0, h = y1 - y0, r = Math.min(w, h) / 2, along = w >= h, len = along ? w : h, n = Math.max(1, Math.ceil((len - 2 * r) / r) + 1);
  for (let k = 0; k < n; k++) { const t = n === 1 ? len / 2 : r + (len - 2 * r) * k / (n - 1); m.addSolidProp(along ? x0 + t : x0 + w / 2, along ? y0 + h / 2 : y0 + t, r); }
}
