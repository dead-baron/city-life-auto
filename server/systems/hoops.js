// Shooting hoops at North Point Courts (the rims and the power: shared/hoops.js; the meter: shared/golf.js). Walk
// onto a half court and press the action button: you've got a ball. Hold the attack button and let go - the meter
// swings up and back while you hold, and there's a band on it that drops the ball in from where you stand (narrower
// further out). The ball arcs up to the hoop: in, short off the front of the rim or long off the backboard, then
// bounces back to you. Makes in a row are your streak; your best streak is kept and the day's best are listed. Walk
// off the court and you put the ball down.
import { K, DT } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { swingMeter } from '../../shared/golf.js';
import { courtHoops, hoopAt, idealPower, shotWindow, HOOP_MIN, HOOP_MAX, HOOP_HANDS } from '../../shared/hoops.js';
import { store } from '../store.js';

const FLIGHT_S = 0.95, DROP_S = 0.45, LEAVE_PAD = 48;

export function interaction(world, p) {
  const ped = p.ped, H = p.hoops;
  if (!ped || ped.vehId || ped.hidden) return null;
  if (H) {
    const ball = H.ball && world.get(H.ball);
    if (ball) return { label: 'Watch it...', passive: true, run: () => {} };
    const d = rimDist(world, H.k, ped);
    if (d < HOOP_MIN) return { label: 'Too close to shoot - step back', passive: true, run: () => {} };
    if (d > HOOP_MAX) return { label: 'Too far out - step in', passive: true, run: () => {} };
    return { label: 'Shoot: hold, let go in the green', key: 'CLICK', run: () => {} };
  }
  const k = hoopAt(world.map, ped.x, ped.y);
  if (k < 0) return null;
  return { label: 'Shoot hoops', run: () => start(world, p, k) };
}

const rimDist = (world, k, ped) => { const r = courtHoops(world.map)[k].rim; return Math.hypot(r.x - ped.x, r.y - ped.y); };

export function start(world, p, k) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden || ped.carrying) return 'Not right now.';
  p.hoops = { k, streak: 0, made: 0, shots: 0, ball: 0, charge: -1, aim: 0 };
  world.notify(p, 'You pick up a ball. Hold the attack button and let go when the meter is in the green band - it\'s narrower further out.', 'info');
  p.meDirty = true;
  return null;
}

function stop(world, p, say) {
  const H = p.hoops;
  if (!H) return;
  const b = H.ball && world.get(H.ball);
  if (b && !b.removed) world.remove(b);
  p.hoops = null;
  if (say && H.shots) world.notify(p, `You put the ball down: ${H.made} of ${H.shots}.`, 'info');
  p.meDirty = true;
}

// The attack button with the ball in your hands (players.js applyInput, like golf): press, hold, let go. The hold is
// counted in your inputs, as the client counts it to draw the meter.
export function input(world, p, ped, inp, pressed, dt = DT) {
  const H = p.hoops;
  if (!H || ped.vehId || ped.carrying || ped.hidden) return false;
  const ready = !H.ball, held = !!(inp.bits & IN.FIRE);
  if (H.charge >= 0) {
    if (held) {
      if (inp.seq === undefined) H.charge += dt;
      else if (inp.seq !== H.lastSeq) { H.lastSeq = inp.seq; H.charge = (inp.seq - H.pressSeq) * DT; }
      return true;
    }
    const power = swingMeter(H.charge);
    H.charge = -1;
    const d = rimDist(world, H.k, ped);
    if (ready && d >= HOOP_MIN && d <= HOOP_MAX) shoot(world, p, power, d);
    return true;
  }
  if (ready && (pressed & IN.FIRE)) { H.charge = 0; H.pressSeq = H.lastSeq = inp.seq; return true; }
  return ready && held;
}

function shoot(world, p, power, d) {
  const H = p.hoops, ped = p.ped, rim = courtHoops(world.map)[H.k].rim;
  const ideal = idealPower(d), win = shotWindow(d), diff = power - ideal;
  const made = Math.abs(diff) <= win, swish = Math.abs(diff) <= win * 0.45;
  const ux = (rim.x - ped.x) / d, uy = (rim.y - ped.y) / d;
  // where the flight ends: through the hoop; short, the front of the rim; long, the backboard
  const end = made ? { x: rim.x, y: rim.y, z: rim.z } : diff < 0 ? { x: rim.x - ux * 7, y: rim.y - uy * 7, z: rim.z - 2 } : { x: rim.x + ux * 2, y: rim.y - 8, z: rim.z + 10 };
  const fall = made ? { x: rim.x, y: rim.y, z: 0 } : { x: rim.x - ux * (diff < 0 ? 26 : 34), y: rim.y - uy * (diff < 0 ? 26 : 34), z: 0 };
  const b = world.add({ id: world.newId(), kind: K.BALL, x: ped.x, y: ped.y, a: 0, z: HOOP_HANDS, vx: 0, vy: 0, vz: 0, ballKind: 'hoop', cx: -1, cy: -1,
    path: { x0: ped.x, y0: ped.y, z0: HOOP_HANDS, end, fall, t0: world.time, apex: Math.max(rim.z + 30, HOOP_HANDS + 24 + d * 0.22) } });
  H.ball = b.id; H.shots++;
  H.pending = { made, swish, short: diff < 0 };
  ped.a = Math.atan2(uy, ux); ped.attackAnimUntil = world.time + 0.25;
  p.meDirty = true;
}

// the ball along its path: up and over to the hoop (a parabola through the apex), then down to the floor
function stepBall(world, p, H, b) {
  const P = b.path, t = world.time - P.t0;
  if (t <= FLIGHT_S) {
    const u = t / FLIGHT_S, e = P.end;
    b.x = P.x0 + (e.x - P.x0) * u; b.y = P.y0 + (e.y - P.y0) * u;
    // (a parabola from z0 to e.z peaking at apex)
    const a = P.apex;
    b.z = (1 - u) * (1 - u) * P.z0 + 2 * (1 - u) * u * (2 * a - (P.z0 + e.z) / 2) + u * u * e.z;
    b.a = (b.a || 0) + 0.3;
    return;
  }
  if (!P.scored) { P.scored = true; score(world, p, H); }
  const u = Math.min(1, (t - FLIGHT_S) / DROP_S), e = P.end, f = P.fall;
  b.x = e.x + (f.x - e.x) * u; b.y = e.y + (f.y - e.y) * u; b.z = Math.max(0, e.z * (1 - u * u));
  if (u >= 1) { world.remove(b); H.ball = 0; p.meDirty = true; }   // (the rebound comes back to you)
}

function score(world, p, H) {
  const r = H.pending, prof = p.profile;
  const rim = courtHoops(world.map)[H.k].rim;
  if (r.made) {
    H.streak++; H.made++;
    world.emit(rim.x, rim.y, { e: 'hoop', x: rim.x, y: rim.y, in: 1, sw: r.swish ? 1 : 0 });
    const best = !prof.hoopsBest || H.streak > prof.hoopsBest;
    if (best) prof.hoopsBest = H.streak;
    world.notify(p, `${r.swish ? 'Swish!' : 'In!'} ${H.streak > 1 ? `${H.streak} in a row` : 'One'}${best && H.streak > 1 ? ' - your best streak' : ''}.`, 'good');
    const board = (world.hoopsBoard ||= []), mine = board.find((q) => q.pid === p.pid);
    if (!mine) board.push({ pid: p.pid, name: p.name, n: H.streak }); else if (H.streak > mine.n) mine.n = H.streak;
    board.sort((a, b) => b.n - a.n); board.length = Math.min(board.length, 5);
    if (H.streak % 5 === 0) world.notify(p, `Today's best streaks: ${board.map((q, i) => `${i + 1}. ${q.name} ${q.n}`).join(', ')}`, 'info');
    store.touch();
  } else {
    world.emit(rim.x, rim.y, { e: 'hoop', x: rim.x, y: rim.y, in: 0 });
    world.notify(p, r.short ? 'Short - off the front of the rim.' : 'Long - off the backboard.', 'info');
    H.streak = 0;
  }
  p.meDirty = true;
}

export function update(world) {
  for (const p of world.players.values()) {
    const H = p.hoops;
    if (!H) continue;
    const ped = p.ped;
    if (!ped || ped.dead || ped.removed || ped.vehId || ped.hidden) { stop(world, p, false); continue; }
    const b = H.ball && world.get(H.ball);
    if (b) stepBall(world, p, H, b); else if (H.ball) H.ball = 0;
    if (!H.ball && hoopAt(world.map, ped.x, ped.y, LEAVE_PAD) !== H.k) stop(world, p, true);   // (walked off the court)
  }
  // balls whose shooter has gone
  if (world.tick % 40 === 9) for (const e of world.entities.values()) if (e.kind === K.BALL && e.ballKind === 'hoop' && ![...world.players.values()].some((q) => q.hoops && q.hoops.ball === e.id)) world.remove(e);
}

// for the HUD ('me'): the ball in your hands (ready), the streak, the band for where you stand
export function meInfo(world, p) {
  const H = p.hoops, ped = p.ped;
  if (!H || !ped) return null;
  const d = rimDist(world, H.k, ped);
  return { k: H.k, ready: !H.ball && d >= HOOP_MIN && d <= HOOP_MAX, streak: H.streak, made: H.made, shots: H.shots };
}
// the HUD tracker (the job slot): the streak and the count, the rim marked
export function targetFor(world, p) {
  const H = p.hoops;
  if (!H) return null;
  const rim = courtHoops(world.map)[H.k].rim;
  return { text: `Hoops: ${H.streak} in a row · ${H.made}/${H.shots}`, x: rim.x, y: rim.y, stage: 'hoops' };
}
