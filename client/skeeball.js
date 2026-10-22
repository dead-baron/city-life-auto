// Skee-ball at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"): nine
// balls rolled up the lane, off the hump and into the rings - 10 round the outside, 20, 30, 40, the 50 cup in the
// middle and the two 100 pockets in the top corners. Played on the arcade's screen (main.js: the 'arcade' overlay,
// loaded the first time someone plays); the points go to the server, which turns them into tickets (server arcade.js).
//   start({ id, best, send, close, sfx }) / stop()
// Aiming: the mouse or a finger - drag up from the ball and let go (the way it goes, how hard); or left / right to aim
// (the keys, the stick, the d-pad) and hold the button (Space, Enter, A) for the power, let go to roll. Esc / B leaves.
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
  const L = landing(G.aim, G.power), wob = (Math.random() - 0.5) * 6;
  G.ball = { x: RING.x, y: LANE.ball, t: 0, tx: L.x + wob, ty: L.y + (Math.random() - 0.5) * 6, aim: G.aim, z: 0, ph: 'up' };
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

function draw() {
  const g = G.g, b = G.ball;
  g.fillStyle = '#0c0614'; g.fillRect(0, 0, W, H);
  // the cabinet's sides, the lane, the hump
  g.fillStyle = '#3a1a5a'; g.fillRect(LANE.x0 - 14, 0, LANE.x1 - LANE.x0 + 28, H);
  g.fillStyle = '#c9a26a'; g.fillRect(LANE.x0, LANE.top, LANE.x1 - LANE.x0, H - LANE.top);
  g.fillStyle = '#b48a52'; for (let x = LANE.x0 + 8; x < LANE.x1; x += 13) g.fillRect(x, LANE.top, 1, H - LANE.top);   // (the boards)
  g.fillStyle = '#8a5a2a'; g.fillRect(LANE.x0, LANE.top - 4, LANE.x1 - LANE.x0, 6);
  // the target: the netting, the rings, the cup, the pockets
  g.fillStyle = '#1a1030'; g.fillRect(LANE.x0 - 8, 0, LANE.x1 - LANE.x0 + 16, LANE.top - 4);
  const ringCol = ['#ff5a8a', '#ffd23a', '#5ae0ff', '#8aff6a', '#c07aff'];
  for (let i = RING.r.length - 1; i >= 0; i--) {
    g.fillStyle = i % 2 ? '#2a1a44' : '#3a2458'; g.beginPath(); g.arc(RING.x, RING.y, RING.r[i], 0, Math.PI * 2); g.fill();
    g.strokeStyle = ringCol[i]; g.lineWidth = 1; g.beginPath(); g.arc(RING.x, RING.y, RING.r[i], 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#05030a'; g.beginPath(); g.arc(RING.x, RING.y, 5, 0, Math.PI * 2); g.fill();
  for (const [px, py] of POCKETS) { g.strokeStyle = '#ffd23a'; g.beginPath(); g.arc(px, py, POCKET_R, 0, Math.PI * 2); g.stroke(); g.fillStyle = '#05030a'; g.beginPath(); g.arc(px, py, POCKET_R - 2, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#e8e0ff'; g.font = '6px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 1; i < RING.r.length; i++) g.fillText(String(RING.pts[i]), RING.x, RING.y + (RING.r[i] + RING.r[i - 1]) / 2 + 0.5);
  g.fillText('50', RING.x, RING.y - 9.5);
  for (const [px, py] of POCKETS) g.fillText('100', px, py + 11);
  // the balls waiting in the rack, the aim line
  g.fillStyle = '#d8d0c0';
  for (let i = 0; i < G.left - (b ? 0 : 1); i++) { g.beginPath(); g.arc(LANE.x1 + 9, H - 10 - i * 9, 3.5, 0, Math.PI * 2); g.fill(); }
  if (!b && !G.done && G.left > 0) {
    const L = landing(G.aim, Math.max(0.15, G.power || 0.5));
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(RING.x, LANE.ball); g.lineTo(RING.x + Math.tan(G.aim) * (LANE.ball - LANE.top), LANE.top); g.stroke(); g.setLineDash([]);
    if (G.charging || G.drag) { g.strokeStyle = 'rgba(255,214,58,.7)'; g.beginPath(); g.arc(L.x, L.y, 3, 0, Math.PI * 2); g.stroke(); }
    ball(g, RING.x, LANE.ball, 0);
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(8, H - 14, 52, 6); g.fillStyle = G.power > 0.85 ? '#ff5a5a' : '#ffd23a'; g.fillRect(9, H - 13, 50 * G.power, 4);
  }
  if (b && b.ph !== 'in') ball(g, b.x, b.y, b.z);
  else if (b) { const s = Math.max(0, 1 - b.t * 2); if (s > 0) { g.globalAlpha = s; ball(g, b.tx, b.ty, 0); g.globalAlpha = 1; } }
  if (G.pop) { g.fillStyle = G.pop.pts >= 50 ? '#ffd23a' : '#ffffff'; g.font = 'bold 8px monospace'; g.fillText(`+${G.pop.pts}`, G.pop.x, G.pop.y - 10 - G.pop.t * 10); }
  // the score, the balls left, the best
  g.textAlign = 'left'; g.textBaseline = 'top'; g.font = '8px monospace'; g.fillStyle = '#f4f2ea';
  g.fillText(`SCORE ${G.score}`, 6, 6); g.fillText(`BALLS ${G.left + (b ? 1 : 0)}`, 6, 18);
  if (G.o.best) { const t = `BEST ${G.o.best}`; g.fillText(t, W - 6 - g.measureText(t).width, 6); }
  if (G.msgT > 0 || G.done) {
    const m = G.done ? `${G.msg}${G.o.best && G.score > G.o.best ? ' - a new best!' : ''}` : G.msg;
    const w = g.measureText(m).width + 12, y = G.done ? H / 2 - 8 : H - 40;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect((W - w) / 2, y, w, 16);
    g.fillStyle = G.done ? '#ffd23a' : '#fff'; g.fillText(m, (W - w) / 2 + 6, y + 4);
  }
}
function ball(g, x, y, z) {
  const r = 4 + z * 0.12;
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 1, y + 1.5, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e0d0'; g.beginPath(); g.arc(x, y - z, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.fillRect(x - 1.5, y - z - 2, 1.2, 1.2);
}
// (tests: the lane without a screen)
export const _test = { landing, pointsAt, RING, POCKETS, LANE };
