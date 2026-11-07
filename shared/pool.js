// Pool's table, its physics and the eight-ball rules (the owner, 11-06: "Pool looks like it's just single player, is it
// built to let other people join? Can we have ways to make games with other players or NPCs?"). Shared: the page plays a
// frame alone on it (client/pool.js: nine balls to clear in as few shots as you can) and animates a match's shots; the
// server plays every shot of a match (server/systems/poolmatch.js) - from the aim and the power the shooter sent, the
// table worked out to its end here - and the rules decide whose turn it is. Numbers in the screen's own px (256 x 160).
export const T = { x0: 22, y0: 24, x1: 234, y1: 136 };   // the cloth inside the cushions
export const R = 4.2, PR = 8.5, STEP = 1 / 120;   // a ball's radius, a pocket's; the physics' step
export const POCKETS = [[T.x0, T.y0], [(T.x0 + T.x1) / 2, T.y0 - 2], [T.x1, T.y0], [T.x0, T.y1], [(T.x0 + T.x1) / 2, T.y1 + 2], [T.x1, T.y1]];
export const HEAD = { x: T.x0 + (T.x1 - T.x0) * 0.25, y: (T.y0 + T.y1) / 2 }, FOOT = { x: T.x0 + (T.x1 - T.x0) * 0.72, y: (T.y0 + T.y1) / 2 };
export const MIN_SP = 60, MAX_SP = 480;   // the cue ball's speed off the cue, the least and the most
const hyp = (x, y) => Math.sqrt(x * x + y * y);

// the balls racked: 'nine' (a frame alone - the nine in a diamond, the 9 in the middle) or 'eight' (a match - fifteen in a
// triangle, the 8 in the middle of the third row, a solid and a stripe in the back corners); the cue ball on the head spot
export function rack(kind = 'nine') {
  const balls = [{ n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false }];
  const rows = kind === 'eight' ? [[1], [9, 2], [3, 8, 10], [11, 4, 12, 5], [6, 13, 7, 14, 15]] : [[1], [2, 3], [4, 9, 5], [6, 7], [8]], d = R * 2 + 0.3;
  rows.forEach((row, i) => row.forEach((n, j) => balls.push({ n, x: FOOT.x + i * d * 0.87, y: FOOT.y + (j - (row.length - 1) / 2) * d, vx: 0, vy: 0, in: false })));
  return balls;
}
// a step of the table: friction, the cushions, the balls off each other (onHit: the two that met), the pockets (onPot);
// true while anything's moving
export function physics(balls, dt, onPot, onHit) {
  let moving = false;
  for (const b of balls) {
    if (b.in) continue;
    const sp = hyp(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - 55 * dt);
      b.vx *= ns / sp; b.vy *= ns / sp;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (ns > 0) moving = true;
    }
    for (const [px, py] of POCKETS) if (hyp(b.x - px, b.y - py) < PR) { b.in = true; b.vx = b.vy = 0; onPot(b); break; }
    if (b.in) continue;
    if (b.x < T.x0 + R) { b.x = T.x0 + R; b.vx = Math.abs(b.vx) * 0.78; }
    if (b.x > T.x1 - R) { b.x = T.x1 - R; b.vx = -Math.abs(b.vx) * 0.78; }
    if (b.y < T.y0 + R) { b.y = T.y0 + R; b.vy = Math.abs(b.vy) * 0.78; }
    if (b.y > T.y1 - R) { b.y = T.y1 - R; b.vy = -Math.abs(b.vy) * 0.78; }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j];
    if (a.in || b.in) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
    if (d >= 2 * R || d === 0) continue;
    const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
    a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel <= 0) continue;
    const k = rel * 0.96;   // (equal balls: the push along the line between them changes hands)
    a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny;
    if (onHit) onHit(a, b);
    moving = true;
  }
  return moving;
}
// the cue ball sent off along aim (radians) at power 0..1
export function strikeCue(balls, aim, power) {
  const cb = balls[0], sp = MIN_SP + Math.max(0, Math.min(1, power)) * (MAX_SP - MIN_SP);
  cb.vx = Math.cos(aim) * sp; cb.vy = Math.sin(aim) * sp;
}
// a shot played out to the end: which balls went down (in order), the first ball the cue ball touched, how long it took
export function playShot(balls, aim, power) {
  const potted = [];
  let first = -1, t = 0;
  strikeCue(balls, aim, power);
  while (t < 30 && physics(balls, STEP, (b) => potted.push(b.n), (a, b) => { if (first < 0 && (a.n === 0 || b.n === 0)) first = a.n === 0 ? b.n : a.n; })) t += STEP;
  for (const b of balls) { b.vx = 0; b.vy = 0; }
  return { potted, first, secs: t };
}
// the cue ball back on the head spot (a scratch) - or a ball on the foot spot (the 8 down on the break) - clear of the rest
export function spotCue(balls, n = 0) {
  const cb = balls.find((b) => b.n === n), at = n ? FOOT : HEAD;
  cb.in = false; cb.vx = cb.vy = 0; cb.x = at.x; cb.y = at.y;
  for (let k = 0; k < 40 && balls.some((b) => b !== cb && !b.in && hyp(b.x - cb.x, b.y - cb.y) < 2 * R + 1); k++) cb.y += k % 2 ? -k * 2 : k * 2;
}

// ---- eight-ball ------------------------------------------------------------------------------------------------------
// The groups: solids 1-7, stripes 9-15; the 8 last. The table open until the first ball potted on a fair shot after the
// break decides them. You shoot again while you pot one of yours (any but the 8 while the table's open) without a foul.
// A foul - the cue ball down, or nothing touched, or the first ball touched not one of yours (the 8 first while you still
// have balls of your own) - gives the turn away, the cue ball on the head spot. The 8 down once yours are cleared, fairly:
// you win; the 8 down any other way: you lose.
export const groupOf = (n) => (n >= 1 && n <= 7 ? 's' : n >= 9 && n <= 15 ? 't' : null);
export const leftOf = (balls, gp) => balls.filter((b) => !b.in && groupOf(b.n) === gp).length;
// the rules after a shot by seat `me` (state: { groups: [g0, g1] (null while open), turn }); returns
// { foul, win (the seat that won, or -1), keep (the shooter goes again), assign (the groups set this shot), why }
export function judge(st, balls, me, shot) {
  const mine = st.groups[me], cueIn = shot.potted.includes(0), eight = shot.potted.includes(8);
  const legalFirst = shot.first > 0 && (mine ? groupOf(shot.first) === mine || (shot.first === 8 && leftOf(balls, mine) + shot.potted.filter((n) => groupOf(n) === mine).length === 0) : shot.first !== 8);
  const foul = cueIn || !legalFirst;
  if (eight && st.breakShot) return { foul, win: -1, keep: !foul && shot.potted.length > 1, assign: null, respot: true, why: cueIn ? 'a scratch' : '' };   // (the 8 down on the break: back on its spot)
  if (eight) {
    const won = !!mine && leftOf(balls, mine) === 0 && !foul;
    return { foul, win: won ? me : me ^ 1, keep: false, assign: null, why: won ? 'the 8 in' : cueIn ? 'scratched on the 8' : !mine || leftOf(balls, mine) ? 'the 8 down early' : 'a foul on the 8' };
  }
  let assign = null;
  const pots = shot.potted.filter((n) => n !== 0);
  if (!mine && !foul && pots.length && !st.breakShot) { const g = groupOf(pots[0]); assign = me === 0 ? [g, g === 's' ? 't' : 's'] : [g === 's' ? 't' : 's', g]; }
  const myG = mine || (assign && assign[me]);
  const keep = !foul && (st.breakShot ? pots.length > 0 : myG ? pots.some((n) => groupOf(n) === myG) : pots.length > 0);
  return { foul, win: -1, keep, assign, why: cueIn ? 'a scratch' : shot.first < 0 ? 'nothing hit' : !legalFirst ? 'the wrong ball first' : '' };
}

// ---- the computer's shot -------------------------------------------------------------------------------------------------
// For each of its balls and each pocket: where the cue ball must meet it (the ghost ball), whether the way there and the
// way on to the pocket are clear, how thin the cut is - the best of them, a little off by its skill; nothing clear: at
// its nearest ball, firmly. rng() 0..1.
export function cpuShot(balls, gp, rng, skill = 0.6) {
  const cb = balls[0], live = balls.filter((b) => !b.in && b.n !== 0);
  let targets = live.filter((b) => (gp ? groupOf(b.n) === gp : b.n !== 8));
  if (!targets.length) targets = live.filter((b) => b.n === 8);
  const clear = (x0, y0, x1, y1, skip) => live.every((b) => {
    if (skip.includes(b)) return true;
    const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((b.x - x0) * dx + (b.y - y0) * dy) / L));
    return hyp(x0 + dx * t - b.x, y0 + dy * t - b.y) > 2 * R + 0.5;
  });
  let best = null;
  for (const b of targets) for (const [px, py] of POCKETS) {
    const ux = px - b.x, uy = py - b.y, ul = hyp(ux, uy) || 1, gx = b.x - ux / ul * 2 * R, gy = b.y - uy / ul * 2 * R;
    const ax = gx - cb.x, ay = gy - cb.y, al = hyp(ax, ay) || 1, cut = (ax * ux + ay * uy) / (al * ul);
    if (cut < 0.3 || !clear(cb.x, cb.y, gx, gy, [b]) || !clear(b.x, b.y, px, py, [b])) continue;
    const score = cut * cut / (1 + (al + ul) / 160);
    if (!best || score > best.score) best = { score, aim: Math.atan2(ay, ax), d: al + ul / Math.max(0.3, cut) };
  }
  if (!best) {
    const b = targets.reduce((m, q) => (!m || hyp(q.x - cb.x, q.y - cb.y) < hyp(m.x - cb.x, m.y - cb.y) ? q : m), null);
    best = { aim: b ? Math.atan2(b.y - cb.y, b.x - cb.x) : rng() * 6.28, d: 220 };
  }
  const off = (rng() - 0.5) * 0.09 * (1.1 - skill);
  return { aim: best.aim + off, power: Math.max(0.28, Math.min(0.92, 0.2 + best.d / 330 + (rng() - 0.5) * 0.1)) };
}
