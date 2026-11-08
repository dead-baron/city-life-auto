// Air hockey's table (the owner, 10-08: "Arcade: ... air hockey"; 11-07: "id prefer it is 2 player"): the rink, the puck
// on the air, the mallets, the goals - one physics for the page's game against the machine (client/airhockey.js), the
// server's games between two players (server/systems/hockeymatch.js) and the page's prediction of them
// (client/hockeynet.js), so a strike played on the page comes out the same on the server.
// The table: { puck, me (the left mallet - seat 0, or you against the machine), cpu (the right - seat 1, or the
// machine), us / them (the goals in the right's / the left's), wait (s before the puck moves again), stuck }.
// Every step is STEP long (120 a second); only plain arithmetic and Math.sqrt (exact in every engine) - no Math.hypot /
// Math.pow - so the server and every browser agree to the bit.
export const W = 256, H = 224, STEP = 1 / 120, HZ = 120;
export const T = { x0: 14, x1: 242, y0: 28, y1: 206 };   // the rails (the puck's centre stays inside by its radius)
export const GOAL = 30, PUCK_R = 6, MAL_R = 11, TO = 7;  // the goal mouth's half-width, the puck, the mallets, first to
export const MAX_PUCK = 560, MY_SPEED = 520, KEY_SPEED = 260, CPU_SPEED = 290;
export const CY = (T.y0 + T.y1) / 2, MID = W / 2;
const DRAG = 0.9981421982597064;   // (0.8 to the power of STEP: the air takes a fifth of the puck's speed a second)
const len = (x, y) => Math.sqrt(x * x + y * y);

export function newTable() {
  return { puck: { x: MID, y: CY, vx: 0, vy: 0 }, me: { x: T.x0 + 40, y: CY, vx: 0, vy: 0 }, cpu: { x: T.x1 - 40, y: CY, vx: 0, vy: 0 }, us: 0, them: 0, wait: 0, stuck: null };
}
// a mallet into the puck: pushed apart, the puck off it with the mallet's own speed added
export function strike(P, m) {
  const dx = P.x - m.x, dy = P.y - m.y, d = len(dx, dy), min = PUCK_R + MAL_R;
  if (d >= min || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  P.x = m.x + nx * min; P.y = m.y + ny * min;
  const rv = (P.vx - m.vx) * nx + (P.vy - m.vy) * ny;
  if (rv < 0) { P.vx -= 1.9 * rv * nx; P.vy -= 1.9 * rv * ny; }
  P.vx += m.vx * 0.25; P.vy += m.vy * 0.25;
  const sp = len(P.vx, P.vy);
  if (sp > MAX_PUCK) { P.vx *= MAX_PUCK / sp; P.vy *= MAX_PUCK / sp; }
  return true;
}
// the puck a step: the air under it, the rails, the goals ('us' / 'them' when one goes in)
export function glide(P, dt) {
  P.x += P.vx * dt; P.y += P.vy * dt;
  const f = dt === STEP ? DRAG : Math.pow(0.8, dt); P.vx *= f; P.vy *= f;
  let hit = false;
  if (P.y < T.y0 + PUCK_R) { P.y = T.y0 + PUCK_R; P.vy = Math.abs(P.vy) * 0.92; hit = true; }
  if (P.y > T.y1 - PUCK_R) { P.y = T.y1 - PUCK_R; P.vy = -Math.abs(P.vy) * 0.92; hit = true; }
  const inMouth = Math.abs(P.y - CY) < GOAL;
  if (P.x < T.x0 + PUCK_R) { if (inMouth && P.x < T.x0 - PUCK_R) return 'them'; if (!inMouth) { P.x = T.x0 + PUCK_R; P.vx = Math.abs(P.vx) * 0.92; hit = true; } }
  if (P.x > T.x1 - PUCK_R) { if (inMouth && P.x > T.x1 + PUCK_R) return 'us'; if (!inMouth) { P.x = T.x1 - PUCK_R; P.vx = -Math.abs(P.vx) * 0.92; hit = true; } }
  return hit ? 'rail' : null;
}
// a mallet toward (tx, ty) at no more than max px/s, kept on its own half (seat 0 the left, 1 the right); its speed
// from how far it went
export function moveTo(m, tx, ty, max, dt, seat) {
  const dx = tx - m.x, dy = ty - m.y, d = len(dx, dy), s = Math.min(d, max * dt);
  const ox = m.x, oy = m.y;
  if (d > 0) { m.x += dx / d * s; m.y += dy / d * s; }
  const xmin = seat ? MID + MAL_R : T.x0 + MAL_R, xmax = seat ? T.x1 - MAL_R : MID - MAL_R;
  m.x = Math.max(xmin, Math.min(xmax, m.x)); m.y = Math.max(T.y0 + MAL_R, Math.min(T.y1 - MAL_R, m.y));
  m.vx = (m.x - ox) / dt; m.vy = (m.y - oy) / dt;
}
// the machine: after the puck on its own half (from behind it, toward your goal), back to guard its goal otherwise
export function cpuMove(Tb, dt) {
  const P = Tb.puck;
  let tx = T.x1 - 34, ty = CY + (P.y - CY) * 0.5;
  if (P.x > MID - 10 && (P.vx > -60 || P.x > W * 0.7)) { tx = P.x + 8; ty = P.y + (P.y > CY ? 3 : -3); }
  // a puck in against its back rail: from behind it can't be got at (the mallet pinned it in the corner for good - the
  // owner, 11-06) - come at it from the side away from the rail it's on, drawing it back out into play
  if (P.x > T.x1 - PUCK_R - MAL_R * 1.5) { tx = P.x - MAL_R; ty = P.y + (P.y > CY ? -(PUCK_R + MAL_R) : PUCK_R + MAL_R) * 0.8; }
  moveTo(Tb.cpu, tx, ty, CPU_SPEED, dt, 1);
}
// The failsafe: a puck that hasn't got anywhere for STUCK_S - stopped, or trapped moving on one spot (in a corner, under a
// mallet) - is faced off: back on the half it was on, at the middle, a moment's wait
export const STUCK_S = 3, STUCK_R = 14;
export function unstick(Tb, dt) {
  const P = Tb.puck, s = Tb.stuck || (Tb.stuck = { x: P.x, y: P.y, t: 0 });
  if (len(P.x - s.x, P.y - s.y) > STUCK_R) { s.x = P.x; s.y = P.y; s.t = 0; return false; }
  s.t += dt;
  if (s.t < STUCK_S) return false;
  P.x = P.x > MID ? MID + 40 : MID - 40; P.y = CY; P.vx = 0; P.vy = 0; Tb.wait = 0.8;
  s.x = P.x; s.y = P.y; s.t = 0;
  return true;
}
// a step of the puck, the mallets already moved: the wait after a goal or a face-off, the strikes, the air, the failsafe
// (face: the server's and the game against the machine's - a prediction leaves it to the server), a goal (the puck back
// on the half of whoever let it in). What happened: 'hit' (a mallet), 'rail', 'us' / 'them' (a goal), 'face', or null.
export function stepTable(Tb, dt = STEP, face = true) {
  if (Tb.wait > 1e-4) { Tb.wait -= dt; return null; }
  const P = Tb.puck;
  const a = strike(P, Tb.me), hit = a || strike(P, Tb.cpu);
  if (hit) Tb.by = a ? 0 : 1;   // (whose mallet it was)
  const r = glide(P, dt);
  if (face && unstick(Tb, dt)) return 'face';
  if (r === 'us' || r === 'them') {
    Tb[r]++;
    P.x = r === 'us' ? MID + 40 : MID - 40; P.y = CY; P.vx = 0; P.vy = 0; Tb.wait = 1;
    return r;
  }
  return hit ? 'hit' : r;
}

// ---- two players (the server's game and the page's prediction of it) ------------------------------------------------
// Time is counted in steps (k). A mallet's path is the samples its page sent, [k, x, y] (x, y in tenths of a px), in
// order: where it is at step k is on the line between the samples either side, held at the last one past it.
export function pathAt(S, k, out) {
  const n = S.length;
  if (!n) return null;
  let i = n - 1;
  while (i > 0 && S[i][0] > k) i--;
  const a = S[i], b = S[i + 1];
  if (!b || k <= a[0]) { out[0] = a[1] / 10; out[1] = a[2] / 10; return out; }
  const f = (k - a[0]) / (b[0] - a[0]);
  out[0] = (a[1] + (b[1] - a[1]) * f) / 10; out[1] = (a[2] + (b[2] - a[2]) * f) / 10;
  return out;
}
export const FOLLOW = 640;   // (px/s: a mallet keeps to its path up to here - quicker than a hand can move it on the page)
// the table from step k0 to k1, each mallet along its path (A the left's samples, B the right's; null: where it is,
// still); on(ev, k) hears each step and what happened in it (null: nothing much). The server plays its games with this,
// the page its prediction.
export function advance(Tb, k0, k1, A, B, face = true, on = null) {
  const pa = [0, 0], pb = [0, 0];
  for (let k = k0 + 1; k <= k1; k++) {
    if (A && pathAt(A, k, pa)) moveTo(Tb.me, pa[0], pa[1], FOLLOW, STEP, 0); else { Tb.me.vx = 0; Tb.me.vy = 0; }
    if (B && pathAt(B, k, pb)) moveTo(Tb.cpu, pb[0], pb[1], FOLLOW, STEP, 1); else { Tb.cpu.vx = 0; Tb.cpu.vy = 0; }
    const ev = stepTable(Tb, STEP, face);
    if (on) on(ev, k);
  }
}
// the table on the wire (the server's word 20 times a second): [k, puck x, y, vx, vy, left mallet x, y, right x, y,
// wait in steps] - positions and speeds in tenths; and back
const q = (v) => Math.round(v * 10);
export function pack(Tb, k) {
  const P = Tb.puck;
  return [k, q(P.x), q(P.y), q(P.vx), q(P.vy), q(Tb.me.x), q(Tb.me.y), q(Tb.cpu.x), q(Tb.cpu.y), Math.max(0, Math.round(Tb.wait * HZ))];
}
export function unpack(s, Tb = newTable()) {
  const P = Tb.puck;
  P.x = s[1] / 10; P.y = s[2] / 10; P.vx = s[3] / 10; P.vy = s[4] / 10;
  Tb.me.x = s[5] / 10; Tb.me.y = s[6] / 10; Tb.cpu.x = s[7] / 10; Tb.cpu.y = s[8] / 10;
  Tb.me.vx = Tb.me.vy = Tb.cpu.vx = Tb.cpu.vy = 0;
  Tb.wait = (s[9] || 0) / HZ;
  return Tb;
}
// a mallet's place clamped to its seat's half (what a page says is never more than the table allows)
export function clampMallet(seat, x, y) {
  const xmin = seat ? MID + MAL_R : T.x0 + MAL_R, xmax = seat ? T.x1 - MAL_R : MID - MAL_R;
  return [Math.max(xmin, Math.min(xmax, x)), Math.max(T.y0 + MAL_R, Math.min(T.y1 - MAL_R, y))];
}
