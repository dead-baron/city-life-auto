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
export function alleyLanes(wi) {
  const south = wi.south, dir = south ? 1 : -1;
  const backEdge = south ? wi.y0 * TILE : (wi.y1 + 1) * TILE;
  const foulY = backEdge + dir * BOWL.LEN_T * TILE;
  const span = BOWL.LANES * BOWL.PITCH, left = Math.round(((wi.x0 + wi.x1 + 1) * TILE - span) / 2);
  const lanes = [];
  for (let i = 0; i < BOWL.LANES; i++) {
    // (lane 1 is on the bowler's left: the west for a south door, the east for a north one)
    const k = south ? i : BOWL.LANES - 1 - i, ax = left + k * BOWL.PITCH;
    lanes.push({ i, ax, cx: ax + BOWL.PITCH / 2, foulY, backEdge, dir, right: south ? 1 : -1, len: BOWL.LEN_T * TILE - BOWL.HEAD_BACK });
  }
  return lanes;
}
// world position of a lane point (u across, v down the lane from the foul line)
export function lanePt(lane, u, v) { return { x: lane.cx + u * lane.right, y: lane.foulY - lane.dir * v }; }
export function pinSpots(lane) { return PINS.map((p) => lanePt(lane, p.u, lane.len + p.w)); }
// the lane whose approach (x, y) stands on, or -1
export function approachAt(alley, x, y, pad = 0) {
  for (const L of alley.lanes) {
    if (x < L.ax - pad || x >= L.ax + BOWL.PITCH + pad) continue;
    const d = (y - L.foulY) * L.dir;   // (behind the foul line, toward the door)
    if (d >= -2 && d <= BOWL.APPROACH_T * TILE + pad) return L.i;
  }
  return -1;
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
export function buildBowlingAlley(m, { T, DISTRICTS }) {
  const byB = new Map();
  for (const p of m.pois) if (p.b !== undefined) { if (!byB.has(p.b)) byB.set(p.b, []); byB.get(p.b).push(p); }
  let best = null;
  for (const b of m.buildings) {
    if (!b || b.gone || b.prefab < 0 || b.walkIn || b.home !== undefined || b.kind !== 'warehouse' || b.tw < 14 || b.th < 12) continue;
    const list = byB.get(b.id) || [];
    if (list.length !== 1 || list[0].kind !== 'delivery') continue;
    if (!best || b.tw * b.th > best.tw * best.th || (b.tw * b.th === best.tw * best.th && b.id < best.id)) best = b;
  }
  if (!best) return;
  const b = best, p = byB.get(b.id)[0], south = m.prefabs[b.prefab].rot === 0, dir = south ? 1 : -1;
  const x0 = b.tx + 1, x1 = b.tx + b.tw - 2, y0 = b.ty + 1, y1 = b.ty + b.th - 2;
  const back = south ? y0 : y1;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) m.set(tx, ty, T.FLOOR);
  // the lanes and the pin decks: nobody walks down them (counter tiles block people, not sight)
  for (let k = 0; k < BOWL.LEN_T; k++) for (let tx = x0; tx <= x1; tx++) m.set(tx, back + dir * k, T.COUNTER);
  // the door: two tiles of the front wall, in the middle
  const fy = south ? b.ty + b.th - 1 : b.ty, dc = Math.floor((x0 + x1) / 2);
  m.set(dc, fy, T.FLOOR); m.set(dc + 1, fy, T.FLOOR);
  // the shoe counter on the right as you come in, the clerk behind it, by the door
  const counterRow = back + dir * (BOWL.LEN_T + BOWL.APPROACH_T), cx0 = x1 - 3, cx1 = x1;
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
  m.bowling = { b: b.id, poi: p.id, name: p.label, district: DISTRICTS[d] ? DISTRICTS[d].name : '', south, lanes: alleyLanes(b.walkIn), counter: { x: p.x, y: p.y } };
  for (const q of alleyFurniture(m.bowling.lanes, unit)) solidBox(m, q);
}
// The furniture you can't walk through, as art v2 draws it (client/art2/game/statics.js bowlingRoom): a ball return between
// each pair of lanes at the back of the approach, the settees behind the approach (the west half, clear of the door) and
// the little tables between them. -> boxes [x0, y0, x1, y1] in world px; solid: a row of circles each (map solidProps), so
// the player's prediction and the server agree.
export function alleyFurniture(lanes, unit) {
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
