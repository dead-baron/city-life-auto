// A frame of pool (the owner, 10-08 #308 / 10-16: "pool tables you can play"): at the Rusty Spur's table and the
// mansion's (server arcade.js play 'pool'), nine balls racked in a diamond to clear in as few shots as you can - a
// scratch (the cue ball down a pocket) costs a shot and the cue ball goes back on the spot. Played on its own screen
// like the arcade's cabinet (main.js: the 'arcade' overlay), and the shots it took go to the server (the best kept).
//   start({ id, best, send, close, sfx }) / stop()
// Aiming: the mouse or a finger - drag back from the cue ball and let go (the further, the harder); or turn the cue with
// left / right (the stick, the d-pad, A D or the arrows; up / down to fine-tune), hold the shoot button (Space, Enter, A)
// to build the power and let go. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
const W = 256, H = 160, STEP = 1 / 120;
const T = { x0: 22, y0: 24, x1: 234, y1: 136 };   // the cloth inside the cushions
const R = 4.2, PR = 8.5;   // a ball's radius, a pocket's
const POCKETS = [[T.x0, T.y0], [(T.x0 + T.x1) / 2, T.y0 - 2], [T.x1, T.y0], [T.x0, T.y1], [(T.x0 + T.x1) / 2, T.y1 + 2], [T.x1, T.y1]];
const COLS = ['#f4f2ea', '#f2c21b', '#2350c8', '#c8262b', '#7a3ac8', '#ef7a1a', '#2f9a3a', '#7a1d24', '#1a1a1e', '#f2c21b'];
const HEAD = { x: T.x0 + (T.x1 - T.x0) * 0.25, y: (T.y0 + T.y1) / 2 }, FOOT = { x: T.x0 + (T.x1 - T.x0) * 0.72, y: (T.y0 + T.y1) / 2 };
let G = null;

export function rack() {   // the cue ball on the head spot, the nine in a diamond on the foot spot (the 9 in the middle)
  const balls = [{ n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, in: false }];
  const rows = [[1], [2, 3], [4, 9, 5], [6, 7], [8]], d = R * 2 + 0.3;
  rows.forEach((row, i) => row.forEach((n, j) => balls.push({ n, x: FOOT.x + i * d * 0.87, y: FOOT.y + (j - (row.length - 1) / 2) * d, vx: 0, vy: 0, in: false })));
  return balls;
}
// a step of the table: friction, the cushions, the balls off each other, the pockets; true while anything's moving
export function physics(balls, dt, onPot) {
  let moving = false;
  for (const b of balls) {
    if (b.in) continue;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - 55 * dt);
      b.vx *= ns / sp; b.vy *= ns / sp;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (ns > 0) moving = true;
    }
    for (const [px, py] of POCKETS) if (Math.hypot(b.x - px, b.y - py) < PR) { b.in = true; b.vx = b.vy = 0; onPot(b); break; }
    if (b.in) continue;
    if (b.x < T.x0 + R) { b.x = T.x0 + R; b.vx = Math.abs(b.vx) * 0.78; }
    if (b.x > T.x1 - R) { b.x = T.x1 - R; b.vx = -Math.abs(b.vx) * 0.78; }
    if (b.y < T.y0 + R) { b.y = T.y0 + R; b.vy = Math.abs(b.vy) * 0.78; }
    if (b.y > T.y1 - R) { b.y = T.y1 - R; b.vy = -Math.abs(b.vy) * 0.78; }
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const a = balls[i], b = balls[j];
    if (a.in || b.in) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= 2 * R || d === 0) continue;
    const nx = dx / d, ny = dy / d, o = (2 * R - d) / 2;
    a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel <= 0) continue;
    const k = rel * 0.96;   // (equal balls: the push along the line between them changes hands)
    a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny;
    moving = true;
  }
  return moving;
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = `${W} / ${H}`;
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, balls: rack(), shots: 0, aim: 0, power: 0, charging: false, chargeT: 0, moving: false, done: false, t0: performance.now(), keys: new Set(), drag: null, acc: 0, last: performance.now(), msg: 'Clear the table in as few shots as you can', msgT: 3, sent: false, padHeld: false };
  G.onKey = (e) => { if (e.repeat) return; if (e.type === 'keydown') G.keys.add(e.code); else { G.keys.delete(e.code); if ((e.code === 'Space' || e.code === 'Enter') && G.charging) shoot(); } };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, cb = G.balls[0];
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (G.moving || cb.in) return;
    if (e.type === 'pointerdown') G.drag = { x, y };
    else if (e.type === 'pointermove') {
      if (G.drag) { const dx = cb.x - x, dy = cb.y - y; if (Math.hypot(dx, dy) > 3) { G.aim = Math.atan2(dy, dx); G.power = Math.min(1, Math.hypot(x - cb.x, y - cb.y) / 60); } }   // (drawn back from the ball like a sling: the way it goes, how hard)
    } else if (e.type === 'pointerup') { if (G.drag && G.power > 0.05) shoot(); G.drag = null; }
  };
  addEventListener('keydown', G.onKey); addEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) cv.addEventListener(t, G.onPtr);
  const tick = (now) => {
    if (!G) return;
    G.raf = requestAnimationFrame(tick);
    G.acc = Math.min(0.25, G.acc + (now - G.last) / 1000); G.last = now;
    while (G.acc >= STEP) { step(STEP); if (!G) return; G.acc -= STEP; }   // (a game over dismissed: closed, G gone)
    draw();
  };
  G.raf = requestAnimationFrame(tick);
}
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  removeEventListener('keydown', G.onKey); removeEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) G.cv.removeEventListener(t, G.onPtr);
  G.cv.width = 256; G.cv.height = 224; G.cv.style.aspectRatio = '';   // (the arcade's screen as it was)
  report();
  G = null;
}
function report() {
  if (G.sent || !G.done) return;   // (a frame left unfinished: no score)
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.shots, secs: Math.round((performance.now() - G.t0) / 1000) });
}
function finish() { report(); G.o.close(); }

function shoot() {
  const cb = G.balls[0];
  G.charging = false;
  if (G.moving || cb.in || G.power < 0.04) { G.power = 0; return; }
  const sp = 60 + G.power * 420;
  cb.vx = Math.cos(G.aim) * sp; cb.vy = Math.sin(G.aim) * sp;
  G.shots++; G.power = 0; G.moving = true;
  if (!G.done && G.shots === 1) G.msgT = 0;   // (the opening words gone once you've broken)
  G.o.sfx('click', 0.6);
}

function step(dt) {
  const cb = G.balls[0];
  G.msgT -= dt;
  if (!G.moving && !G.done) {
    // the cue round by the keys or a pad, and the power built while the button's held
    let turn = 0, fine = 0, btn = false;
    if (G.keys.has('ArrowLeft') || G.keys.has('KeyA')) turn -= 1;
    if (G.keys.has('ArrowRight') || G.keys.has('KeyD')) turn += 1;
    if (G.keys.has('ArrowUp') || G.keys.has('KeyW')) fine -= 1;
    if (G.keys.has('ArrowDown') || G.keys.has('KeyS')) fine += 1;
    if (G.keys.has('Space') || G.keys.has('Enter')) btn = true;
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
      if (Math.abs(p.axes[0] || 0) > 0.2) turn = p.axes[0];
      if (Math.abs(p.axes[1] || 0) > 0.2) fine = p.axes[1];
      if (p.buttons[14] && p.buttons[14].pressed) turn = -1;
      if (p.buttons[15] && p.buttons[15].pressed) turn = 1;
      if (p.buttons[0] && p.buttons[0].pressed) btn = true;
    }
    G.aim += (turn * 2.2 + fine * 0.35) * dt;
    if (btn) { if (!G.charging) { G.charging = true; G.chargeT = 0; } G.chargeT += dt; G.power = 0.5 - 0.5 * Math.cos(G.chargeT * 2.6); }
    else if (G.charging && !G.drag && !G.keys.size) shoot();
    G.padHeld = btn;
  } else if (G.done) {
    let btn = G.keys.has('Space') || G.keys.has('Enter');
    for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) if (p.buttons[0] && p.buttons[0].pressed) btn = true;
    if (btn && !G.padHeld && G.msgT < 2) { finish(); return; }
    G.padHeld = btn;
    return;
  }
  if (G.moving) {
    G.moving = physics(G.balls, dt, (b) => {
      if (b.n === 0) { G.msg = 'Scratch - a shot added'; G.msgT = 2; G.o.sfx('bad', 0.4); }
      else G.o.sfx('coin', 0.5);
    });
    if (!G.moving) {
      if (cb.in) {   // (the cue ball back on the spot, clear of the others)
        G.shots++; cb.in = false; cb.vx = cb.vy = 0; cb.x = HEAD.x; cb.y = HEAD.y;
        for (let k = 0; k < 40 && G.balls.some((b) => b !== cb && !b.in && Math.hypot(b.x - cb.x, b.y - cb.y) < 2 * R + 1); k++) cb.y += k % 2 ? -k * 2 : k * 2;
      }
      if (G.balls.every((b) => b.n === 0 || b.in)) { G.done = true; G.msgT = 3; G.msg = `Cleared in ${G.shots} shots`; G.o.sfx('good', 0.7); report(); }
    }
  }
}

function draw() {
  const g = G.g, cb = G.balls[0];
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: sharp)
  g.fillStyle = '#1a0f08'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#5a3418'; g.fillRect(T.x0 - 12, T.y0 - 12, T.x1 - T.x0 + 24, T.y1 - T.y0 + 24);   // the rails
  g.fillStyle = '#1e6a3a'; g.fillRect(T.x0 - 4, T.y0 - 4, T.x1 - T.x0 + 8, T.y1 - T.y0 + 8);   // the cushions
  g.fillStyle = '#2a8a4c'; g.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);   // the cloth
  g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(HEAD.x, T.y0, 1, T.y1 - T.y0);
  g.fillStyle = '#0a0a0a';
  for (const [px, py] of POCKETS) { g.beginPath(); g.arc(px, py, PR - 1.5, 0, Math.PI * 2); g.fill(); }
  for (const b of G.balls) {
    if (b.in) continue;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(b.x + 1, b.y + 1.2, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = COLS[b.n]; g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2); g.fill();
    if (b.n === 9) { g.fillStyle = '#f4f2ea'; g.fillRect(b.x - R + 0.5, b.y - 1.5, 2 * R - 1, 3); g.fillStyle = COLS[9]; g.fillRect(b.x - 2.5, b.y - 1.5, 5, 3); }   // (the striped 9)
    if (b.n) { g.fillStyle = '#fff'; g.beginPath(); g.arc(b.x, b.y, 1.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(b.x - 2, b.y - 2.5, 1.5, 1.5);
  }
  if (!G.moving && !G.done && !cb.in) {
    // the aim line (to the first thing it meets, roughly) and the cue behind the ball, drawn back by the power
    const ax = Math.cos(G.aim), ay = Math.sin(G.aim);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(cb.x + ax * 6, cb.y + ay * 6); g.lineTo(cb.x + ax * 70, cb.y + ay * 70); g.stroke(); g.setLineDash([]);
    const back = 6 + G.power * 22;
    g.strokeStyle = '#e8d2a0'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cb.x - ax * back, cb.y - ay * back); g.lineTo(cb.x - ax * (back + 70), cb.y - ay * (back + 70)); g.stroke(); g.lineWidth = 1;
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(8, H - 12, 60, 6); g.fillStyle = G.power > 0.8 ? '#ff5a5a' : '#ffd23a'; g.fillRect(9, H - 11, 58 * G.power, 4);
  }
  g.fillStyle = '#f4f2ea'; g.font = '8px monospace'; g.textBaseline = 'top';
  g.fillText(`SHOTS ${G.shots}`, 8, 6);
  const best = G.o.best ? `BEST ${G.o.best}` : '';
  if (best) g.fillText(best, W - 8 - g.measureText(best).width, 6);
  if (G.msgT > 0 || G.done) {
    const m = G.done ? `${G.msg}${G.o.best && G.shots < G.o.best ? ' - a new best!' : ''}` : G.msg;
    const y = G.done ? H / 2 - 9 : T.y1 - 22;   // (below the rack while you play; the middle of the cleared table at the end)
    g.fillStyle = 'rgba(0,0,0,.6)'; const w = g.measureText(m).width + 12; g.fillRect((W - w) / 2, y, w, 16);
    g.fillStyle = G.done ? '#ffd23a' : '#fff'; g.fillText(m, (W - w) / 2 + 6, y + 4);
  }
}
// (tests: the table without a screen)
export const _test = { rack, physics, POCKETS, T, R };
