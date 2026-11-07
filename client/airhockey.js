// Air hockey at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"):
// against the machine, first to seven. Your mallet on the left half, the machine's on the right; the puck glides on
// the air, off the rails and the mallets, into the goals at the ends. Played on the arcade's screen (main.js: the
// 'arcade' overlay, loaded the first time someone plays); the goals go to the server (server arcade.js: tickets).
//   start({ id, best, send, close, sfx }) / stop()
// The mallet: the mouse or a finger (it follows where you point), or the keys, the stick or the d-pad. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
import { layer, blit, ballSprite, shadow, text, banner, led, panel, ramp, tone, hash } from './arcart.js';
const W = 256, H = 224, STEP = 1 / 120;
const T = { x0: 14, x1: 242, y0: 28, y1: 206 };   // the rails (the puck's centre stays inside by its radius)
const GOAL = 30, PUCK_R = 6, MAL_R = 11, TO = 7;  // the goal mouth's half-width, the puck, the mallets, first to
const MAX_PUCK = 560, MY_SPEED = 520, KEY_SPEED = 260, CPU_SPEED = 290;
const CY = (T.y0 + T.y1) / 2;
let G = null;

export function newTable() {
  return { puck: { x: W / 2, y: CY, vx: 0, vy: 0 }, me: { x: T.x0 + 40, y: CY, vx: 0, vy: 0 }, cpu: { x: T.x1 - 40, y: CY, vx: 0, vy: 0 }, us: 0, them: 0, wait: 0 };
}
// a mallet into the puck: pushed apart, the puck off it with the mallet's own speed added
export function strike(P, m) {
  const dx = P.x - m.x, dy = P.y - m.y, d = Math.hypot(dx, dy), min = PUCK_R + MAL_R;
  if (d >= min || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  P.x = m.x + nx * min; P.y = m.y + ny * min;
  const rv = (P.vx - m.vx) * nx + (P.vy - m.vy) * ny;
  if (rv < 0) { P.vx -= 1.9 * rv * nx; P.vy -= 1.9 * rv * ny; }
  P.vx += m.vx * 0.25; P.vy += m.vy * 0.25;
  const sp = Math.hypot(P.vx, P.vy);
  if (sp > MAX_PUCK) { P.vx *= MAX_PUCK / sp; P.vy *= MAX_PUCK / sp; }
  return true;
}
// the puck a step: the air under it, the rails, the goals ('us' / 'them' when one goes in)
export function glide(P, dt) {
  P.x += P.vx * dt; P.y += P.vy * dt;
  const f = Math.pow(0.8, dt); P.vx *= f; P.vy *= f;
  let hit = false;
  if (P.y < T.y0 + PUCK_R) { P.y = T.y0 + PUCK_R; P.vy = Math.abs(P.vy) * 0.92; hit = true; }
  if (P.y > T.y1 - PUCK_R) { P.y = T.y1 - PUCK_R; P.vy = -Math.abs(P.vy) * 0.92; hit = true; }
  const inMouth = Math.abs(P.y - CY) < GOAL;
  if (P.x < T.x0 + PUCK_R) { if (inMouth && P.x < T.x0 - PUCK_R) return 'them'; if (!inMouth) { P.x = T.x0 + PUCK_R; P.vx = Math.abs(P.vx) * 0.92; hit = true; } }
  if (P.x > T.x1 - PUCK_R) { if (inMouth && P.x > T.x1 + PUCK_R) return 'us'; if (!inMouth) { P.x = T.x1 - PUCK_R; P.vx = -Math.abs(P.vx) * 0.92; hit = true; } }
  return hit ? 'rail' : null;
}
// the machine: after the puck on its own half (from behind it, toward your goal), back to guard its goal otherwise
export function cpuMove(Tb, dt) {
  const c = Tb.cpu, P = Tb.puck;
  let tx = T.x1 - 34, ty = CY + (P.y - CY) * 0.5;
  if (P.x > W / 2 - 10 && (P.vx > -60 || P.x > W * 0.7)) { tx = P.x + 8; ty = P.y + (P.y > CY ? 3 : -3); }
  // a puck in against its back rail: from behind it can't be got at (the mallet pinned it in the corner for good - the
  // owner, 11-06) - come at it from the side away from the rail it's on, drawing it back out into play
  if (P.x > T.x1 - PUCK_R - MAL_R * 1.5) { tx = P.x - MAL_R; ty = P.y + (P.y > CY ? -(PUCK_R + MAL_R) : PUCK_R + MAL_R) * 0.8; }
  moveTo(c, tx, ty, CPU_SPEED, dt, W / 2 + MAL_R, T.x1 - MAL_R);
}
function moveTo(m, tx, ty, max, dt, xmin, xmax) {
  const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), s = Math.min(d, max * dt);
  const ox = m.x, oy = m.y;
  if (d > 0) { m.x += dx / d * s; m.y += dy / d * s; }
  m.x = Math.max(xmin, Math.min(xmax, m.x)); m.y = Math.max(T.y0 + MAL_R, Math.min(T.y1 - MAL_R, m.y));
  m.vx = (m.x - ox) / dt; m.vy = (m.y - oy) / dt;
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = '';
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, T: newTable(), done: false, t0: performance.now(), keys: new Set(), ptr: null, acc: 0, last: performance.now(), sent: false, padHeld: false, msg: 'First to seven', msgT: 2.5 };
  G.T.wait = 1.2;
  G.onKey = (e) => { if (e.repeat) return; if (e.type === 'keydown') G.keys.add(e.code); else G.keys.delete(e.code); };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (e.type === 'pointerup' || e.type === 'pointercancel') { if (e.pointerType !== 'mouse') G.ptr = null; return; }
    if (e.type === 'pointermove' || e.type === 'pointerdown') G.ptr = { x, y };
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
// the goals, whenever you leave: a loss counts what you scored, a win is a win
function report() {
  if (G.sent || (!G.done && !G.T.us)) return;
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.T.us, them: G.T.them, win: G.T.us >= TO ? 1 : 0, secs: Math.round((performance.now() - G.t0) / 1000) });
}
function finish() { report(); G.o.close(); }

function step(dt) {
  const Tb = G.T, P = Tb.puck;
  G.msgT -= dt;
  if (G.done) {
    let btn = G.keys.has('Space') || G.keys.has('Enter');
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) if (p.buttons[0] && p.buttons[0].pressed) btn = true;
    if (btn && !G.padHeld && G.msgT < 2) { finish(); return; }
    G.padHeld = btn;
    return;
  }
  // your mallet: where you point, or pushed by the keys / the stick
  let mx = 0, my = 0;
  if (G.keys.has('ArrowLeft') || G.keys.has('KeyA')) mx -= 1;
  if (G.keys.has('ArrowRight') || G.keys.has('KeyD')) mx += 1;
  if (G.keys.has('ArrowUp') || G.keys.has('KeyW')) my -= 1;
  if (G.keys.has('ArrowDown') || G.keys.has('KeyS')) my += 1;
  for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
    if (Math.abs(p.axes[0] || 0) > 0.15) mx = p.axes[0];
    if (Math.abs(p.axes[1] || 0) > 0.15) my = p.axes[1];
    if (p.buttons[14] && p.buttons[14].pressed) mx = -1;
    if (p.buttons[15] && p.buttons[15].pressed) mx = 1;
    if (p.buttons[12] && p.buttons[12].pressed) my = -1;
    if (p.buttons[13] && p.buttons[13].pressed) my = 1;
  }
  const me = Tb.me;
  if (mx || my) { G.ptr = null; moveTo(me, me.x + mx * 100, me.y + my * 100, KEY_SPEED * Math.min(1, Math.hypot(mx, my)), dt, T.x0 + MAL_R, W / 2 - MAL_R); }
  else if (G.ptr) moveTo(me, G.ptr.x, G.ptr.y, MY_SPEED, dt, T.x0 + MAL_R, W / 2 - MAL_R);
  else { me.vx = 0; me.vy = 0; }
  cpuMove(Tb, dt);
  if (Tb.wait > 0) { Tb.wait -= dt; return; }
  if (strike(P, me) || strike(P, Tb.cpu)) G.o.sfx('click', 0.35);
  const r = glide(P, dt);
  if (unstick(Tb, dt)) { G.msg = 'Face-off'; G.msgT = 1; return; }
  if (r === 'us' || r === 'them') {
    Tb[r]++;
    G.o.sfx(r === 'us' ? 'good' : 'bad', 0.5);
    G.msg = r === 'us' ? 'GOAL!' : 'Their goal'; G.msgT = 1.2;
    // the puck back on the half of whoever let it in
    P.x = r === 'us' ? W / 2 + 40 : W / 2 - 40; P.y = CY; P.vx = 0; P.vy = 0; Tb.wait = 1;
    if (Tb.us >= TO || Tb.them >= TO) { G.done = true; G.msgT = 3; G.msg = Tb.us >= TO ? `You win ${Tb.us}-${Tb.them}!` : `The machine wins ${Tb.them}-${Tb.us}`; G.o.sfx(Tb.us >= TO ? 'good' : 'bad', 0.7); report(); }
  } else if (r === 'rail') G.o.sfx('click', 0.15);
}

// ---- the screen (AC7, the owner's air hockey concept: the SNES look) -------------------------------------------------------
// the rink, painted once: the arcade's carpet round it, the table's dark apron, the chrome rails with their light
// strips - blue down your half, orange down the machine's - the goal slots in the ends, the lit blue top (brighter in
// the middle) with its rows of air holes, the red centre line, circle and creases
let BG = null;
function rinkArt() {
  const carpet = ramp('#1e2250', 5, 2), chrome = ramp('#a8b0c0', 6, 3), top = ramp('#2a6ad8', 7, 3), red = [232, 52, 64], apron = ramp('#1a1e3a', 5, 2);
  const NEON = [[236, 72, 170], [72, 210, 236], [240, 206, 60]];
  return layer(W, H, (put) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = Math.max(T.x0 - x, x - T.x1 + 1, T.y0 - y, y - T.y1 + 1);   // (how far outside the surface)
      let c;
      if (o > 9) {   // the carpet, its neon confetti
        const h = hash(x >> 3, y >> 3, 5);
        c = h > 0.86 && Math.hypot((x & 7) - 3.5, (y & 7) - 3.5) < 1.6 ? NEON[(h * 97 | 0) % 3] : tone(carpet, 0.4 + (hash(x, y, 2) - 0.5) * 0.3, x, y);
        if (o < 13) c = c.map((v) => v * 0.5);   // (the table's shadow)
      } else if (o > 6) c = tone(apron, o === 9 ? 0.15 : 0.5, x, y);
      else if (o > 0) {   // the rails: chrome, lit along their inner edge
        const mouth = (x < T.x0 || x >= T.x1) && Math.abs(y + 0.5 - CY) < GOAL;
        if (mouth) c = o > 4 ? [10, 10, 16] : [4, 4, 8];
        else if (o === 1) c = x < W / 2 ? [90, 180, 255] : [255, 150, 70];
        else c = tone(chrome, o === 6 ? 0.2 : o === 2 ? 0.35 : 0.55 + (o === 5 ? 0.3 : 0) + Math.sin((x + y) * 0.3) * 0.05, x, y, 0.5);
      } else {   // the top: lit from over the middle, the air holes, the lines
        const q = ((x - W / 2) / 130) ** 2 + ((y - CY) / 100) ** 2;
        let t = 0.7 - q * 0.38 + (hash(x, y, 1) - 0.5) * 0.05;
        if ((x - T.x0) % 8 === 4 && (y - T.y0 + ((x - T.x0) % 16 === 4 ? 0 : 4)) % 8 === 4) t -= 0.3;
        c = tone(top, t, x, y, 0.6);
        const dc = Math.hypot(x + 0.5 - W / 2, y + 0.5 - CY), dl = Math.hypot(x + 0.5 - T.x0, y + 0.5 - CY), dr = Math.hypot(x + 0.5 - T.x1, y + 0.5 - CY);
        if (Math.abs(x + 0.5 - W / 2) < 1.1 || Math.abs(dc - 22) < 0.8 || dc < 2 || Math.abs(dl - 34) < 0.8 || Math.abs(dr - 34) < 0.8) c = red;
        if (Math.abs(x + 0.5 - (T.x0 + 56)) < 0.6 || Math.abs(x + 0.5 - (T.x1 - 56)) < 0.6) c = c.map((v, i) => (i === 2 ? v : v * 0.8));   // (the faint blue lines)
      }
      put(x, y, c);
    }
  });
}
function draw() {
  const g = G.g, Tb = G.T, P = Tb.puck;
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: the pixels square, the numbers sharp)
  BG ||= rinkArt();
  blit(g, BG, 0, 0);
  // the puck - its trail when it flies - and the mallets, shaded, their shadows
  const sp = Math.hypot(P.vx, P.vy);
  if (sp > 160) for (let k = 3; k >= 1; k--) { g.globalAlpha = 0.12 * (4 - k); blit(g, ballSprite('#2a2a34', PUCK_R, { flat: 1 }), P.x - P.vx * 0.012 * k - PUCK_R - 0.5, P.y - P.vy * 0.012 * k - PUCK_R - 0.5); }
  g.globalAlpha = 1;
  shadow(g, P.x + 1.5, P.y + 2, PUCK_R, PUCK_R * 0.8, 0.3);
  blit(g, ballSprite('#2a2a34', PUCK_R, { flat: 1 }), P.x - PUCK_R - 0.5, P.y - PUCK_R - 0.5);
  mallet(g, Tb.me, '#2a6ae8');
  mallet(g, Tb.cpu, '#e83a3a');
  // the score: LED digits in their panels, you and the machine
  panel(g, W / 2 - 62, 2, 124, 20, '#c8a050');
  text(g, 'YOU', W / 2 - 56, 9, '#8ac4ff'); led(g, Tb.us, W / 2 - 40, 6, '#5ab0ff', 12);
  text(g, 'CPU', W / 2 + 56, 9, '#ffa08a', 1, 'r'); led(g, Tb.them, W / 2 + 14, 6, '#ff5a3a', 12);
  text(g, 'TO 7', W / 2, 9, '#c8a050', 1, 'c');
  if (G.msgT > 0 || G.done) banner(g, W, CY - 7, G.msg, G.done ? '#ffd23a' : '#fff');
}
// a mallet: its rim, the dome, the knob on top lit from the top left
function mallet(g, m, c) {
  shadow(g, m.x + 2, m.y + 3, MAL_R, MAL_R * 0.8, 0.32);
  blit(g, ballSprite(c, MAL_R, { flat: 1 }), m.x - MAL_R - 0.5, m.y - MAL_R - 0.5);
  blit(g, ballSprite(c, MAL_R - 4), m.x - MAL_R + 3.5, m.y - MAL_R + 3.5);
  blit(g, ballSprite(c, 3.5), m.x - 4.5, m.y - 4.5);
}
// (tests: the table without a screen)
// The failsafe: a puck that hasn't got anywhere for STUCK_S - stopped, or trapped moving on one spot (in a corner, under a
// mallet) - is faced off: back on the half it was on, at the middle, a moment's wait
const STUCK_S = 3, STUCK_R = 14;
export function unstick(Tb, dt) {
  const P = Tb.puck, s = Tb.stuck || (Tb.stuck = { x: P.x, y: P.y, t: 0 });
  if (Math.hypot(P.x - s.x, P.y - s.y) > STUCK_R) { s.x = P.x; s.y = P.y; s.t = 0; return false; }
  s.t += dt;
  if (s.t < STUCK_S) return false;
  P.x = P.x > W / 2 ? W / 2 + 40 : W / 2 - 40; P.y = CY; P.vx = 0; P.vy = 0; Tb.wait = 0.8;
  s.x = P.x; s.y = P.y; s.t = 0;
  return true;
}
export const _test = { newTable, strike, glide, cpuMove, unstick, T, TO, CY, STUCK_S };
