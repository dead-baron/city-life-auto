// Skee-ball at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"): nine
// balls rolled up the lane, off the hump and into the rings - 10 round the outside, 20, 30, 40, the 50 cup in the
// middle and the two 100 pockets in the top corners. Played on the arcade's screen (main.js: the 'arcade' overlay,
// loaded the first time someone plays); the points go to the server, which turns them into tickets (server arcade.js).
//   start({ id, best, send, close, sfx }) / stop()
// Aiming: the mouse or a finger - drag up from the ball and let go (the way it goes, how hard); or left / right to aim
// (the keys, the stick, the d-pad) and hold the button (Space, Enter, A) for the power, let go to roll. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
import { layer, blit, ballSprite, shadow, text, banner, led, panel, ramp, tone, hash } from './arcart.js';
const W = 256, H = 224, STEP = 1 / 60;
const LANE = { x0: 76, x1: 180, top: 92, ball: 206 };   // the lane (px), the hump at its top, where the ball sits
const RING = { x: 128, y: 48, r: [7, 16, 26, 36, 46], pts: [50, 40, 30, 20, 10] };   // the target: the cup, the rings
const POCKETS = [[86, 14], [170, 14]], POCKET_R = 7;
const BALLS = 9;
let G = null;

// where a ball lands for an aim (radians off straight up) and a power (0..1), before the bounce's wobble
export function landing(aim, power) {
  const reach = (LANE.ball - LANE.top) + 14 + power * 92;   // (from the ball to where it comes down past the hump)
  return { x: RING.x + Math.tan(aim) * reach, y: LANE.ball - reach };
}
// the points for a ball that comes down at (x, y): a pocket's 100, a ring's, or the 10 it rolls back into
export function pointsAt(x, y) {
  for (const [px, py] of POCKETS) if (Math.hypot(x - px, y - py) < POCKET_R) return 100;
  if (x < LANE.x0 - 8 || x > LANE.x1 + 8 || y < 2) return 10;
  const d = Math.hypot(x - RING.x, y - RING.y);
  for (let i = 0; i < RING.r.length; i++) if (d < RING.r[i]) return RING.pts[i];
  return 10;
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = '';
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, left: BALLS, score: 0, aim: 0, power: 0, charging: false, chargeT: 0, ball: null, done: false, t0: performance.now(), keys: new Set(), drag: null, acc: 0, last: performance.now(), pop: null, sent: false, padHeld: false, msg: 'Roll it up into the rings', msgT: 3 };
  G.onKey = (e) => { if (e.repeat) return; if (e.type === 'keydown') G.keys.add(e.code); else { G.keys.delete(e.code); if ((e.code === 'Space' || e.code === 'Enter') && G.charging) roll(); } };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (G.ball) return;
    if (e.type === 'pointerdown') G.drag = { x, y };
    else if (e.type === 'pointermove' && G.drag) {
      const dx = x - G.drag.x, dy = G.drag.y - y;   // (pushed up the lane: the way it goes, how hard)
      if (dy > 3) { G.aim = Math.max(-0.42, Math.min(0.42, Math.atan2(dx, dy))); G.power = Math.min(1, Math.hypot(dx, dy) / 90); }
    } else if (e.type === 'pointerup') { if (G.drag && G.power > 0.05) roll(); G.drag = null; }
  };
  addEventListener('keydown', G.onKey); addEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) cv.addEventListener(t, G.onPtr);
  const tick = (now) => {
    if (!G) return;
    G.raf = requestAnimationFrame(tick);
    G.acc = Math.min(0.25, G.acc + (now - G.last) / 1000); G.last = now;
    while (G.acc >= STEP) { step(STEP); if (!G) return; G.acc -= STEP; }
    draw();
  };
  G.raf = requestAnimationFrame(tick);
}
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  removeEventListener('keydown', G.onKey); removeEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) G.cv.removeEventListener(t, G.onPtr);
  report();
  G = null;
}
function report() {
  if (G.sent || !G.done) return;   // (left before the last ball: nothing)
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.score, secs: Math.round((performance.now() - G.t0) / 1000) });
}
function finish() { report(); G.o.close(); }

function roll() {
  G.charging = false;
  if (G.ball || G.done || G.left <= 0 || G.power < 0.04) { G.power = 0; return; }
  // the bounce's wobble: more the harder it's thrown - a full-power roll is a gamble, not a sure 100
  const L = landing(G.aim, G.power), sp = 4 + G.power * 8, wob = (Math.random() - 0.5) * sp;
  G.ball = { x: RING.x, y: LANE.ball, t: 0, tx: L.x + wob, ty: L.y + (Math.random() - 0.5) * sp, aim: G.aim, z: 0, ph: 'up' };
  G.left--; G.power = 0;
  G.o.sfx('click', 0.5);
}

function step(dt) {
  G.msgT -= dt;
  if (G.done) {
    let btn = G.keys.has('Space') || G.keys.has('Enter');
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) if (p.buttons[0] && p.buttons[0].pressed) btn = true;
    if (btn && !G.padHeld && G.msgT < 2) { finish(); return; }
    G.padHeld = btn;
    return;
  }
  const b = G.ball;
  if (!b) {
    let turn = 0, btn = false;
    if (G.keys.has('ArrowLeft') || G.keys.has('KeyA')) turn -= 1;
    if (G.keys.has('ArrowRight') || G.keys.has('KeyD')) turn += 1;
    if (G.keys.has('Space') || G.keys.has('Enter')) btn = true;
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
      if (Math.abs(p.axes[0] || 0) > 0.2) turn = p.axes[0];
      if (p.buttons[14] && p.buttons[14].pressed) turn = -1;
      if (p.buttons[15] && p.buttons[15].pressed) turn = 1;
      if (p.buttons[0] && p.buttons[0].pressed) btn = true;
    }
    G.aim = Math.max(-0.42, Math.min(0.42, G.aim + turn * 0.7 * dt));
    if (btn) { if (!G.charging) { G.charging = true; G.chargeT = 0; } G.chargeT += dt; G.power = 0.5 - 0.5 * Math.cos(G.chargeT * 2.4); }
    else if (G.charging && !G.drag && !G.keys.size) roll();
    G.padHeld = btn;
    return;
  }
  // the ball: up the lane to the hump, through the air (bigger as it rises), down into a ring
  b.t += dt;
  if (b.ph === 'up') {
    b.y -= 300 * dt; b.x = RING.x + Math.tan(b.aim) * (LANE.ball - b.y);
    if (b.y <= LANE.top) { b.ph = 'air'; b.t = 0; b.ax = b.x; b.ay = b.y; }
  } else if (b.ph === 'air') {
    const k = Math.min(1, b.t / 0.45);
    b.x = b.ax + (b.tx - b.ax) * k; b.y = b.ay + (b.ty - b.ay) * k; b.z = Math.sin(k * Math.PI) * 10;
    if (k >= 1) {
      const pts = pointsAt(b.tx, b.ty);
      b.ph = 'in'; b.t = 0; b.pts = pts;
      G.score += pts;
      G.pop = { pts, x: b.tx, y: b.ty, t: 0 };
      G.o.sfx(pts >= 50 ? 'good' : 'coin', pts >= 50 ? 0.6 : 0.4);
    }
  } else if (b.t > 0.5) {
    G.ball = null;
    if (G.left <= 0) { G.done = true; G.msgT = 3; G.msg = `${G.score} points`; G.o.sfx('good', 0.7); report(); }
  }
  if (G.pop) { G.pop.t += dt; if (G.pop.t > 1) G.pop = null; }
}

// ---- the screen (AC7, the owner's skee-ball concept: the SNES look) -------------------------------------------------------
// the machine, painted once: its sides in the arcade's blue with gold stars, the nets beside the target, the rails lit
// in amber down either side of the lane, the maple lane's boards (lit toward the top) with the chevrons by the ball, the
// hump; the target's raised rings in pale wood - 10 to 50 - the dark gaps between, the cup, the two 100 pockets' gold rims
let BG = null;
function laneArt() {
  const side = ramp('#26306a', 6, 3), maple = ramp('#d89a52', 7, 3), ringW = ramp('#e8cc90', 6, 3), back = ramp('#3a1e14', 5, 2), rail = ramp('#a8261e', 5, 2), gold = [242, 194, 48];
  const star = (x, y, cx, cy, r) => { const P = 1.2566, k = (((Math.atan2(y - cy, x - cx) + 1.5708) % P) + P) % P / P; return Math.hypot(x - cx, y - cy) < r * (0.42 + 0.58 * Math.abs(k - 0.5) * 2); };
  return layer(W, H, (put) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c;
      const inL = x >= LANE.x0 && x < LANE.x1;
      if (x < LANE.x0 - 14 || x >= LANE.x1 + 14) {   // the cabinet's sides: stars on the blue
        const sx = x < W / 2 ? 34 : W - 34;
        c = tone(side, 0.45 + (hash(x, y, 3) - 0.5) * 0.12 - Math.abs(x - sx) * 0.006, x, y);
        for (const sy of [86, 146, 202]) if (star(x, y, sx, sy, 11)) c = star(x, y, sx, sy, 8) ? gold : [200, 150, 30];
        if (x === LANE.x0 - 15 || x === LANE.x1 + 14) c = [14, 14, 30];
      } else if (!inL) {   // the rails: lit in amber, chasing
        const o = x < LANE.x0 ? LANE.x0 - 1 - x : x - LANE.x1;
        c = o === 6 && y % 8 < 4 ? [255, 190, 60] : tone(rail, o < 2 ? 0.25 : o > 11 ? 0.2 : 0.55, x, y, 0.5);
        if (y < LANE.top - 4 && o > 2) c = (x + y) % 4 === 0 ? [70, 70, 84] : [24, 18, 30];   // (the nets beside the target)
      } else if (y >= LANE.top) {   // the lane: maple boards, the hump at its top, the chevrons
        const bx = (x - LANE.x0) % 13;
        let t = 0.6 - (y - LANE.top) / (H - LANE.top) * 0.18 + (hash(Math.floor((x - LANE.x0) / 13), y >> 5, 2) - 0.5) * 0.06 + (hash(x, y >> 2, 6) > 0.92 ? -0.12 : 0);
        if (bx === 0) t -= 0.25;
        if (y < LANE.top + 6) t = y < LANE.top + 2 ? 0.25 : 0.82;
        c = tone(maple, t, x, y, 0.35);
        for (const k of [-1, 0, 1]) { const cx = (LANE.x0 + LANE.x1) / 2 + k * 18, dy = y - 186; if (dy >= 0 && dy < 6 && Math.abs(Math.abs(x + 0.5 - cx) - (5 - dy)) < 1) c = [232, 120, 40]; }
      } else {   // the target: the back, the rings, the pockets
        const d = Math.hypot(x + 0.5 - RING.x, y + 0.5 - RING.y);
        c = tone(back, 0.4 + (hash(x, y, 4) - 0.5) * 0.15, x, y);
        let i = RING.r.findIndex((r) => d < r);
        if (i >= 0) { const r0 = i ? RING.r[i - 1] : 0, e = Math.min(d - r0, RING.r[i] - d); c = i === 0 && d < 5 ? [6, 4, 4] : e < 1.3 ? [20, 12, 10] : tone(ringW, 0.4 + (y < RING.y ? 0.25 : 0) - (e < 2.5 ? 0.15 : 0), x, y, 0.5); }
        for (const [px, py] of POCKETS) { const e = Math.hypot(x + 0.5 - px, y + 0.5 - py); if (e < POCKET_R) c = e > POCKET_R - 2 ? gold : [6, 4, 4]; }
        if (y >= LANE.top - 4) c = tone(rail, 0.3, x, y);
      }
      put(x, y, c);
    }
  });
}
function draw() {
  const g = G.g, b = G.ball;
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: the pixels square, the words sharp)
  BG ||= laneArt();
  blit(g, BG, 0, 0);
  for (let i = 1; i < RING.r.length; i++) text(g, String(RING.pts[i]), RING.x, RING.y + (RING.r[i] + RING.r[i - 1]) / 2 - 2, '#4a1e0c', 1, 'c', false);
  for (const [px, py] of POCKETS) text(g, '100', px, py + 9, '#ffd23a', 1, 'c');
  // the balls waiting in the return, the aim, the power
  for (let i = 0; i < G.left - (b ? 0 : 1); i++) blit(g, ballSprite('#9a5a2a', 3.5), LANE.x1 + 5, H - 14 - i * 9);
  if (!b && !G.done && G.left > 0) {
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let k = 6; k < LANE.ball - LANE.top; k += 4) g.fillRect(Math.round(RING.x + Math.tan(G.aim) * k), LANE.ball - k, 1, 1);
    ball(g, RING.x, LANE.ball, 0);
    panel(g, 6, H - 13, 56, 9, '#c8a050');
    for (let i = 0; i < 13; i++) { g.fillStyle = i / 13 < G.power ? (i < 7 ? '#5ae05a' : i < 10 ? '#f2c21b' : '#ff4a3a') : 'rgba(255,255,255,.08)'; g.fillRect(8 + i * 4, H - 11, 3, 5); }
  }
  if (b && b.ph !== 'in') ball(g, b.x, b.y, b.z);
  else if (b) { const s = Math.max(0, 1 - b.t * 2); if (s > 0) { g.globalAlpha = s; ball(g, b.tx, b.ty, 0); g.globalAlpha = 1; } }
  if (G.pop) text(g, `+${G.pop.pts}`, G.pop.x, G.pop.y - 10 - G.pop.t * 10, G.pop.pts >= 50 ? '#ffd23a' : '#ffffff', 2, 'c');
  // the score and the tickets' worth on the cabinet's sides, the balls left, the best
  panel(g, 4, 4, 54, 30, '#c8a050'); text(g, 'SCORE', 31, 8, '#f4f2ea', 1, 'c'); led(g, G.score, 12, 16, '#ffb020', 12, 3);
  panel(g, 4, 38, 54, 18, '#c8a050'); text(g, `BALLS ${G.left + (b ? 1 : 0)}`, 31, 44, '#f4f2ea', 1, 'c');
  if (G.o.best) { panel(g, W - 58, 4, 54, 18, '#c8a050'); text(g, `BEST ${G.o.best}`, W - 31, 10, '#ffd23a', 1, 'c'); }
  if (G.msgT > 0 || G.done) banner(g, W, G.done ? H / 2 - 7 : H - 40, G.done ? `${G.msg}${G.o.best && G.score > G.o.best ? ' - a new best!' : ''}` : G.msg, G.done ? '#ffd23a' : '#fff');
}
function ball(g, x, y, z) {
  const r = 4 + z * 0.12;
  shadow(g, x + 1, y + 1.5, 4, 3, 0.35);
  blit(g, ballSprite('#9a5a2a', r), x - Math.ceil(r) - 0.5, y - z - Math.ceil(r) - 0.5);
}
// (tests: the lane without a screen)
export const _test = { landing, pointsAt, RING, POCKETS, LANE };
