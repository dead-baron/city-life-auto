// Golf at Cedar Hills Golf Club (the course: shared/naturesites.js golfClub; the ball, the clubs and the lies:
// shared/golf.js). Step onto a hole's tee and press the action button to tee off ($5 a hole): your ball is put down
// there. Walk up to it, aim (the mouse, the right stick or the aim stick: it starts pointing at the flag) and hold
// the attack button - the meter swings up and back while you hold, and the shot goes when you let go. The club suits
// the lie and the distance: the driver off the tee and down the fairway, an iron from the rough, a wedge near the
// green, the sand wedge out of a bunker, the putter on the green. The ball flies, bounces and rolls by what it lands
// on - quick on the green, steady on the fairway, slow in the rough, dead in the sand - and glances off trees, carts
// and benches. Water or out of bounds costs a stroke, and the ball goes back where you hit it from. Hole out for
// your score against par (your best on each hole is kept; a hole in one pays the club's prize). Walk away from your
// ball a while, drive off or go down, and the hole is given up.
import { K, DT, TILE } from '../../shared/constants.js';
import { IN } from '../../shared/input.js';
import { GOLF_FEE, HOLE_IN_ONE_PRIZE, MAX_STROKES, GOLF_REACH, CUP_R, CUP_SPEED, GOLF_GRAV, CLUBS, LIES, LIE_NAME, swingMeter, lieAt, clubFor, launchSpeed, scoreName } from '../../shared/golf.js';
import { payFrom } from './economy.js';
import { store } from '../store.js';

const ABANDON_PX = 1400, ABANDON_S = 25, TEE_PAD = 10;
const holeOf = (world, n) => (world.map.golf && world.map.golf.holes ? world.map.golf.holes[n - 1] : null) || null;
const metres = (px) => Math.max(1, Math.round(px / 32));

// the hole whose tee you're standing on, or null
function teeAt(world, x, y) {
  const g = world.map.golf;
  if (!g || !g.holes) return null;
  for (const h of g.holes) {
    const t = g.tees[h.n - 1];
    if (t && x >= t.x - TEE_PAD && x < t.x + t.w + TEE_PAD && y >= t.y - TEE_PAD && y < t.y + t.h + TEE_PAD) return h;
  }
  return null;
}

// the club for the ball where it lies now
function clubNow(world, G, b) { const h = holeOf(world, G.n); return clubFor(lieAt(world.map, b.x, b.y), Math.hypot(h.pin.x - b.x, h.pin.y - b.y)); }

// the action-button prompt: on a tee, by your ball, while it's moving (null elsewhere)
export function interaction(world, p) {
  const ped = p.ped, G = p.golf;
  if (!ped || ped.vehId || !world.map.golf) return null;
  if (G) {
    const b = world.get(G.ball);
    if (b && !b.rest) return { label: 'Watch it go...', passive: true, run: () => {} };
    if (b && Math.hypot(b.x - ped.x, b.y - ped.y) < GOLF_REACH) return { label: `${CLUBS[clubNow(world, G, b)].name}: hold, let go at the top of the meter`, key: 'CLICK', run: () => {} };
  }
  const h = teeAt(world, ped.x, ped.y);
  if (h && !(G && G.n === h.n)) return { label: `Tee off - hole ${h.n}, par ${h.par} ($${GOLF_FEE})${G ? ` - gives up hole ${G.n}` : ''}`, run: () => teeOff(world, p, h.n) };
  return null;
}

// Pay the green fee and put a ball down on the tee (a hole already under way is given up).
export function teeOff(world, p, n) {
  const ped = p.ped, h = holeOf(world, n);
  if (!ped || ped.dead || ped.vehId || ped.hidden || !h) return 'Not right now.';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  if (!payFrom(p, GOLF_FEE)) { world.notify(p, `The green fee is $${GOLF_FEE} a hole.`, 'warn'); return 'money'; }
  if (p.golf) quit(world, p, null);
  const b = world.add({ id: world.newId(), kind: K.BALL, x: h.tee.x, y: h.tee.y, a: 0, z: 0, vx: 0, vy: 0, vz: 0, ballKind: 'golf', golfer: p.pid, rest: true, cx: -1, cy: -1 });
  p.golf = { n, par: h.par, ball: b.id, strokes: 0, from: { x: b.x, y: b.y }, club: clubFor('tee', Math.hypot(h.pin.x - b.x, h.pin.y - b.y)), lie: 'tee', charge: -1, aim: 0, away: 0 };
  world.notify(p, `Hole ${n}, par ${h.par}, ${metres(Math.hypot(h.pin.x - b.x, h.pin.y - b.y))} m. Stand by your ball, aim at the flag, hold the attack button and let go when the meter's at the top.`, 'info');
  p.meDirty = true;
  store.touch();
  return null;
}

// The attack button by your ball (players.js applyInput, before any punch or shot): press to start the swing, hold
// while the meter swings, let go to hit. true when golf took the button. The hold is counted in your inputs (one
// a step, as the client counts it to draw the meter), not in server ticks: a late input that the server stands in
// for with the last one doesn't swing the meter on.
export function input(world, p, ped, inp, pressed, dt = DT) {
  const G = p.golf;
  if (!G || ped.vehId || ped.carrying) return false;
  const b = world.get(G.ball);
  if (!b) return false;
  const near = b.rest && Math.hypot(b.x - ped.x, b.y - ped.y) < GOLF_REACH, held = !!(inp.bits & IN.FIRE);
  if (G.charge >= 0) {
    if (held) {
      if (inp.seq === undefined) G.charge += dt;
      else if (inp.seq !== G.lastSeq) { G.lastSeq = inp.seq; G.charge = (inp.seq - G.pressSeq) * DT; }
      G.aim = inp.aim;
      return true;
    }
    const power = swingMeter(G.charge);
    G.charge = -1;
    if (near) hit(world, p, b, G.aim, power);
    return true;
  }
  if (near && (pressed & IN.FIRE)) { G.charge = 0; G.pressSeq = G.lastSeq = inp.seq; G.aim = inp.aim; return true; }
  return near && held;
}

function hit(world, p, b, aim, power) {
  const G = p.golf, h = holeOf(world, G.n), lie = lieAt(world.map, b.x, b.y);
  const club = clubFor(lie, Math.hypot(h.pin.x - b.x, h.pin.y - b.y)), c = CLUBS[club];
  let v = launchSpeed(club, power);
  if (lie === 'rough' && club !== 'putter') v *= 0.9;
  if (lie === 'sand' && club === 'iron') v *= 0.75;
  const a = aim + (world.rand() - 0.5) * 2 * c.spread;
  b.vx = Math.cos(a) * v * Math.cos(c.loft); b.vy = Math.sin(a) * v * Math.cos(c.loft); b.vz = v * Math.sin(c.loft);
  b.z = c.loft ? 0.5 : 0; b.rest = false;
  G.strokes++; G.from = { x: b.x, y: b.y }; G.club = club; G.power = +power.toFixed(2);
  world.emit(b.x, b.y, { e: 'golfhit', x: Math.round(b.x), y: Math.round(b.y), k: club === 'putter' ? 0 : 1, p: G.power });
  p.meDirty = true;
}

function segPoint(x0, y0, x1, y1, px, py) {
  const dx = x1 - x0, dy = y1 - y0, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L)) : 0;
  return Math.hypot(px - x0 - dx * t, py - y0 - dy * t);
}

// trees, carts, benches, the clubhouse: the ball glances off (low enough to hit them); never the flagstick
function bounceOffProps(map, b, pin) {
  const tx = Math.floor(b.x / TILE), ty = Math.floor(b.y / TILE);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    for (const e of map.solidProps.get(map.idx(tx + ox, ty + oy)) || []) {
      if (e.off || e.r < 4 || Math.hypot(e.x - pin.x, e.y - pin.y) < 10) continue;
      const dx = b.x - e.x, dy = b.y - e.y, d = Math.hypot(dx, dy);
      if (d >= e.r + 2 || d < 0.01) continue;
      const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { b.vx = (b.vx - 2 * vn * nx) * 0.45; b.vy = (b.vy - 2 * vn * ny) * 0.45; }
      b.x = e.x + nx * (e.r + 2.5); b.y = e.y + ny * (e.r + 2.5);
    }
  }
}

function stepBall(world, p, G, b, dt) {
  const h = holeOf(world, G.n), m = world.map, x0 = b.x, y0 = b.y;
  if (b.z > 0 || b.vz > 0) {   // in the air
    b.vz -= GOLF_GRAV * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.z < 60) bounceOffProps(m, b, h.pin);
    if (b.z <= 0) {
      b.z = 0;
      const lie = lieAt(m, b.x, b.y);
      if (lie === 'water' || lie === 'out') return penalty(world, p, G, b, lie);
      const L = LIES[lie];
      b.vz = -b.vz * L.bounce; if (b.vz < 40) b.vz = 0;
      b.vx *= L.land; b.vy *= L.land;
      if (Math.hypot(b.x - h.pin.x, b.y - h.pin.y) < CUP_R && Math.hypot(b.vx, b.vy) < CUP_SPEED) return holed(world, p, G, b);
    }
  } else {                     // rolling
    const lie = lieAt(m, b.x, b.y);
    if (lie === 'water' || lie === 'out') return penalty(world, p, G, b, lie);
    const sp = Math.hypot(b.vx, b.vy), ns = Math.max(0, sp - (LIES[lie] ? LIES[lie].roll : 700) * dt);
    if (ns < 1) { b.vx = 0; b.vy = 0; return atRest(world, p, G, b); }
    b.vx *= ns / sp; b.vy *= ns / sp;
    b.x += b.vx * dt; b.y += b.vy * dt;
    bounceOffProps(m, b, h.pin);
    if (segPoint(x0, y0, b.x, b.y, h.pin.x, h.pin.y) < CUP_R && ns < CUP_SPEED) return holed(world, p, G, b);
  }
  b.a = (b.a || 0) + Math.hypot(b.vx, b.vy) * dt * 0.1;
  return null;
}

function atRest(world, p, G, b) {
  b.rest = true;
  const h = holeOf(world, G.n), lie = lieAt(world.map, b.x, b.y), d = Math.hypot(h.pin.x - b.x, h.pin.y - b.y);
  if (G.strokes >= MAX_STROKES) return finish(world, p, G, b, MAX_STROKES, true);
  G.lie = lie; G.club = clubFor(lie, d);
  world.notify(p, `${LIE_NAME[lie][0].toUpperCase()}${LIE_NAME[lie].slice(1)}, ${metres(d)} m to the pin. ${CLUBS[G.club].name}.`, 'info');
  p.meDirty = true;
  return null;
}

// in the water or out of bounds: a stroke, and the ball back where you hit it from
function penalty(world, p, G, b, lie) {
  G.strokes++;
  b.x = G.from.x; b.y = G.from.y; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0;
  if (lie === 'water') world.emit(b.x, b.y, { e: 'golfsplash', x: Math.round(b.x), y: Math.round(b.y) });
  world.notify(p, `${lie === 'water' ? 'Splash - in the water' : 'Out of bounds'}. A stroke penalty; your ball is back where you hit it from.`, 'warn');
  return atRest(world, p, G, b);
}

function holed(world, p, G, b) {
  world.emit(b.x, b.y, { e: 'golfcup', x: Math.round(b.x), y: Math.round(b.y) });
  return finish(world, p, G, b, G.strokes, false);
}

function finish(world, p, G, b, strokes, pickedUp) {
  const prof = p.profile, best = (prof.golfBest ||= {}), prev = best[G.n];
  world.remove(b);
  p.golf = null;
  if (!prev || strokes < prev) best[G.n] = strokes;
  let msg = pickedUp ? `You pick up after ${MAX_STROKES} on hole ${G.n}.` : strokes === 1 ? 'Hole in one!' : `In the hole in ${strokes}. ${scoreName(strokes, G.par)}`;
  const aces = (prof.golfAces ||= {});
  if (!pickedUp && strokes === 1 && !aces[G.n]) { aces[G.n] = 1; prof.cash += HOLE_IN_ONE_PRIZE; msg += ` The club pays its hole-in-one prize: $${HOLE_IN_ONE_PRIZE}.`; }
  else if (!pickedUp && prev && strokes < prev) msg += ` Your best on this hole (was ${prev}).`;
  else if (prev) msg += ` (Your best here: ${Math.min(prev, strokes)}.)`;
  const next = holeOf(world, G.n + 1);
  if (next) msg += ` Hole ${next.n}'s tee is next.`;
  world.notify(p, msg, pickedUp ? 'info' : 'good');
  p.meDirty = true;
  store.touch();
  return strokes;
}

// Give the hole up: the ball is taken off the course.
export function quit(world, p, msg) {
  const G = p.golf;
  if (!G) return;
  const b = world.get(G.ball);
  if (b && !b.removed) world.remove(b);
  p.golf = null;
  if (msg) world.notify(p, msg, 'info');
  p.meDirty = true;
}

export function update(world, dt) {
  if (!world.map.golf) return;
  for (const p of world.players.values()) {
    const G = p.golf;
    if (!G) continue;
    const ped = p.ped, b = world.get(G.ball);
    if (!b || b.removed) { p.golf = null; p.meDirty = true; continue; }
    if (!ped || ped.dead || ped.removed || ped.hidden) { quit(world, p, 'You left your ball on the course - hole given up.'); continue; }
    const far = !!ped.vehId || Math.hypot(ped.x - b.x, ped.y - b.y) > ABANDON_PX;
    G.away = far ? G.away + dt : 0;
    if (G.away > ABANDON_S) { quit(world, p, 'You walked off the course - hole given up.'); continue; }
    if (!b.rest) stepBall(world, p, G, b, dt);
  }
  // balls whose golfer has gone (logged off)
  if (world.tick % 40 === 7) for (const e of world.entities.values()) {
    if (e.kind !== K.BALL || e.ballKind !== 'golf') continue;
    const q = world.players.get(e.golfer);
    if (!q || !q.golf || q.golf.ball !== e.id) world.remove(e);
  }
}

// your hole for the HUD ('me'): which, par, strokes so far, the club in hand, whether you're at your ball, the lie
export function meInfo(world, p) {
  const G = p.golf, ped = p.ped;
  if (!G) return null;
  const b = world.get(G.ball), h = holeOf(world, G.n);
  return { n: G.n, par: G.par, s: G.strokes, club: b ? clubNow(world, G, b) : G.club, ball: G.ball, lie: b ? lieAt(world.map, b.x, b.y) : G.lie, pin: h ? h.pin : null, near: !!(b && ped && b.rest && Math.hypot(b.x - ped.x, b.y - ped.y) < GOLF_REACH) };
}
// the HUD tracker (the job slot): the hole and the stroke, the ball marked when you're away from it, else the flag
export function targetFor(world, p) {
  const G = p.golf, ped = p.ped;
  if (!G || !ped) return null;
  const b = world.get(G.ball), h = holeOf(world, G.n);
  if (!b || !h) return null;
  const atBall = Math.hypot(b.x - ped.x, b.y - ped.y) < 90;
  return { text: `Hole ${G.n} · par ${G.par} · stroke ${G.strokes + 1} · ${CLUBS[clubNow(world, G, b)].name}${atBall ? '' : ' - walk to your ball'}`, x: Math.round(atBall ? h.pin.x : b.x), y: Math.round(atBall ? h.pin.y : b.y), stage: 'golf' };
}
