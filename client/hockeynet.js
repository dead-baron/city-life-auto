// Air hockey against someone, on the page (loaded with client/airhockey.js): the table's clock, your mallet's samples
// to the server, and the puck predicted from the server's word (server/systems/hockeymatch.js) - so it moves at once,
// and a strike of yours comes off your mallet the moment it lands.
//   - The clock: the server's steps (120 a second, shared/airhockey.js) from the page's own milliseconds, by the
//     quickest of the last few pings (half its round trip the way back): present(N, ms).
//   - Your mallet: moved here every step; every SAMPLE-th step its place goes to the server, stamped with that step.
//   - The table: each word from the server is the table at a step both mallets were known for - about L steps before
//     now. From it the page plays the table on to now with the same physics (shared/airhockey.js advance): your mallet
//     along the samples you sent (and where it is now), the other's along where it was heading, held after a moment.
//   - What's drawn: the other player's mallet as it was L steps ago (between the server's words - it's known there),
//     yours now, and the puck in between by where it is - now down your end, where your strikes are; L steps ago up at
//     theirs, where theirs are known; the time it's drawn at sliding between the two no slower than SLOW and no
//     quicker than FAST of the clock. A new word that disagrees with what was drawn moves it smoothly (an error that
//     dies away, TAU) - unless it's out by more than SNAP (a goal, a face-off), when it goes straight there.
//   - Watching (seat -1): everything as it was L steps ago - just the server's words, between them.
import { newTable, unpack, advance, moveTo, pathAt, HZ, MID, T } from '../shared/airhockey.js';
export const SAMPLE = 4, TAU = 0.09, SNAP = 40, EXTRAP = 6, PINGS = 8, SLOW = 0.45, FAST = 1.7;
const PER_MS = HZ / 1000, NEAR = MID + 4, FAR = MID + 56;   // (the puck now short of NEAR - your mallet's reach; L steps ago past FAR)

export function makeNet(seat, o = {}) {
  return { slow: o.slow ?? SLOW, fast: o.fast ?? FAST, near: o.near ?? NEAR, far: o.far ?? FAR, seat, off: null, pings: [], owd: 0, ks: -1, opp: [[], []], mine: [], pred: null, pk: 0, ex: 0, ey: 0, sent: -1, L: null, kd: null, traj: new Map(), frameK: null };
}
// the table's step now (null: the clock not known yet)
export const present = (N, ms) => (N.off === null ? null : Math.floor(ms * PER_MS + N.off));
// the server's clock as a word left it (now: its step then): a first guess, the pings make it good
export function clockFrom(N, ms, now) { if (N.off === null) N.off = now - ms * PER_MS; }
export function onPong(N, ms, c, now) {
  const rtt = ms - c;
  if (!(rtt >= 0) || rtt > 5000) return;
  N.pings.push([rtt, now + rtt / 2 * PER_MS - ms * PER_MS]);
  if (N.pings.length > PINGS) N.pings.shift();
  let best = N.pings[0];
  for (const q of N.pings) if (q[0] < best[0]) best = q;
  N.off = best[1]; N.owd = best[0] / 2;
}
// your mallet at step k: a sample to send every SAMPLE-th step (null otherwise)
export function sample(N, k, m) {
  if (k % SAMPLE || k <= N.sent) return null;
  N.sent = k;
  const s = [k, Math.round(m.x * 10), Math.round(m.y * 10)];
  N.mine.push(s);
  while (N.mine.length > 2 && N.mine[1][0] < N.ks - SAMPLE) N.mine.shift();
  if (N.mine.length > 64) N.mine.shift();
  return s;
}
// where a mallet's heading from the server's last two words: on along that line for EXTRAP steps, then held
function heading(L) {
  const b = L[L.length - 1], a = L[L.length - 2];
  if (!b) return null;
  if (!a || b[0] === a[0]) return [b];
  const f = EXTRAP / (b[0] - a[0]);
  return [b, [b[0] + EXTRAP, b[1] + (b[1] - a[1]) * f, b[2] + (b[2] - a[2]) * f]];
}
// the paths the prediction plays along: yours (the samples sent, where your mallet is now), the other's (heading)
function paths(N, k, mine) {
  const cur = mine ? N.mine.concat([[Math.max(k, N.sent + 1), Math.round(mine.x * 10), Math.round(mine.y * 10)]]) : null;
  return [N.seat === 0 && cur ? cur : heading(N.opp[0]), N.seat === 1 && cur ? cur : heading(N.opp[1])];
}
// the table played from k0 to k1, the puck's way kept step by step (traj) to draw from
function run(N, Tb, k0, k1, A, B, on) {
  advance(Tb, k0, k1, A, B, false, (ev, k) => { N.traj.set(k, [Tb.puck.x, Tb.puck.y, Tb.wait > 0 ? 1 : 0]); if (ev && on) on(ev, k); });
}
// a word from the server (s: shared/airhockey.js pack), k the page's step now, mine your mallet (null watching): the
// table played on to now; the puck's error carried so what's drawn doesn't jump
export function onState(N, s, k, mine) {
  if (s[0] <= N.ks) return;
  const first = !N.pred, was = first ? null : drawn(N);
  N.ks = s[0];
  const Tb = unpack(s), k1 = k === null ? s[0] : Math.max(s[0], k);
  for (const i of [0, 1]) { const L = N.opp[i]; L.push([s[0], s[5 + i * 2], s[6 + i * 2]]); if (L.length > 40) L.shift(); }
  const lag = k1 - s[0];
  N.L = N.L === null ? lag : N.L + (lag - N.L) * 0.15;
  N.traj.set(s[0], [Tb.puck.x, Tb.puck.y, Tb.wait > 0 ? 1 : 0]);
  const [A, B] = paths(N, k1, mine);
  run(N, Tb, s[0], k1, A, B);
  N.pred = Tb; N.pk = k1;
  if (first) { N.kd = k1 - N.L; N.frameK = k1; return; }
  correct(N, was, drawn(N), Tb.wait > 0);
}
// the page's frame at step k (fractional, its clock): the prediction on to now (on: what happened - your strikes'
// sounds), the time the puck's drawn at moved, the error dying away
export function frame(N, k, mine, on = null) {
  if (!N.pred || k === null) return;
  const ki = Math.floor(k);
  if (ki > N.pk) { const [A, B] = paths(N, ki, mine); run(N, N.pred, Math.max(N.pk, ki - 30), ki, A, B, on); N.pk = ki; }
  const e = N.frameK === null ? 0 : Math.max(0, Math.min(30, k - N.frameK));
  N.frameK = k;
  const target = k - N.L * (1 - nearness(N));
  N.kd = Math.max(N.ks - N.L, Math.min(k, Math.max(N.kd + N.slow * e, Math.min(N.kd + N.fast * e, target))));
  decay(N, e / HZ);
  for (const q of N.traj.keys()) { if (q < N.kd - 8) N.traj.delete(q); else break; }
}
// how near your end the puck is drawn: 1 short of NEAR (now), 0 past FAR (as the other player's mallet was); a
// watcher's 0 everywhere
function nearness(N) {
  if (N.seat < 0) return 0;
  const d = at(N, N.kd);
  if (!d) return 1;
  const x = N.seat === 1 ? 2 * MID - d[0] : d[0];
  return Math.max(0, Math.min(1, (N.far - x) / (N.far - N.near)));
}
// the puck's way at step kd (between the steps either side; a goal's put-back not smeared)
function at(N, kd) {
  const a = N.traj.get(Math.floor(kd)), b = N.traj.get(Math.floor(kd) + 1);
  if (!a) return b || (N.pred ? [N.pred.puck.x, N.pred.puck.y] : null);
  if (!b || Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) > 20) return a;
  const f = kd - Math.floor(kd);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}
// the reconciling (tests): the error is what was drawn less what the new word says - snapped to nothing when it's far
// out (or the puck was put back); it dies away as e^(-t / TAU)
export function correct(N, was, now, reset = false) {
  const ex = N.ex + was.x - now.x, ey = N.ey + was.y - now.y;
  if (reset || ex * ex + ey * ey > SNAP * SNAP) { N.ex = 0; N.ey = 0; return false; }
  N.ex = ex; N.ey = ey;
  return true;
}
export function decay(N, dt) { const f = Math.exp(-dt / TAU); N.ex *= f; N.ey *= f; }
// what to draw: the puck (with its error), the other player's mallet (as it was L steps ago, between the server's words)
export function drawn(N) { const d = at(N, N.kd) || [MID, T.y0]; return { x: d[0] + N.ex, y: d[1] + N.ey }; }
export function other(N, seat) {
  const L = N.opp[seat], k = N.kd === null ? N.ks : Math.min(N.ks, (N.frameK ?? N.ks) - N.L), p = [0, 0];
  return pathAt(L, k, p) ? { x: p[0], y: p[1] } : null;
}
// your mallet a step, toward where you point or pushed by the keys
export function moveMine(m, seat, tx, ty, speed, dt) { moveTo(m, tx, ty, speed, dt, seat); }
export const mirror = (seat, x) => (seat === 1 ? 2 * MID - x : x);
export { newTable };
