// Air hockey at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"):
// against the machine, first to seven. Your mallet on the left half, the machine's on the right; the puck glides on
// the air, off the rails and the mallets, into the goals at the ends. Played on the arcade's screen (main.js: the
// 'arcade' overlay, loaded the first time someone plays); the goals go to the server (server arcade.js: tickets).
//   start({ id, best, send, close, sfx }) / stop()
// The mallet: the mouse or a finger (it follows where you point), or the keys, the stick or the d-pad. Esc / B leaves.
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
  if (r === 'us' || r === 'them') {
    Tb[r]++;
    G.o.sfx(r === 'us' ? 'good' : 'bad', 0.5);
    G.msg = r === 'us' ? 'GOAL!' : 'Their goal'; G.msgT = 1.2;
    // the puck back on the half of whoever let it in
    P.x = r === 'us' ? W / 2 + 40 : W / 2 - 40; P.y = CY; P.vx = 0; P.vy = 0; Tb.wait = 1;
    if (Tb.us >= TO || Tb.them >= TO) { G.done = true; G.msgT = 3; G.msg = Tb.us >= TO ? `You win ${Tb.us}-${Tb.them}!` : `The machine wins ${Tb.them}-${Tb.us}`; G.o.sfx(Tb.us >= TO ? 'good' : 'bad', 0.7); report(); }
  } else if (r === 'rail') G.o.sfx('click', 0.15);
}

function draw() {
  const g = G.g, Tb = G.T;
  g.fillStyle = '#06080f'; g.fillRect(0, 0, W, H);
  // the table: the rails, the ice-blue top with its air holes, the centre line and circle, the goals
  g.fillStyle = '#c8202a'; g.fillRect(T.x0 - 6, T.y0 - 6, T.x1 - T.x0 + 12, T.y1 - T.y0 + 12);
  g.fillStyle = '#dff2ff'; g.fillRect(T.x0, T.y0, T.x1 - T.x0, T.y1 - T.y0);
  g.fillStyle = '#c4def0'; for (let y = T.y0 + 6; y < T.y1; y += 10) for (let x = T.x0 + 6 + ((y / 10) % 2 ? 5 : 0); x < T.x1; x += 10) g.fillRect(x, y, 1, 1);
  g.fillStyle = '#e04050'; g.fillRect(W / 2 - 1, T.y0, 2, T.y1 - T.y0);
  g.strokeStyle = '#e04050'; g.lineWidth = 1.5; g.beginPath(); g.arc(W / 2, CY, 22, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#4060e0'; g.beginPath(); g.arc(T.x0, CY, 34, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(T.x1, CY, 34, Math.PI / 2, Math.PI * 1.5); g.stroke();
  g.fillStyle = '#10141c'; g.fillRect(T.x0 - 6, CY - GOAL, 6, GOAL * 2); g.fillRect(T.x1, CY - GOAL, 6, GOAL * 2);
  // the puck, the mallets
  const P = Tb.puck;
  g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(P.x + 1, P.y + 1.5, PUCK_R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#20242c'; g.beginPath(); g.arc(P.x, P.y, PUCK_R, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(P.x, P.y, 2, 0, Math.PI * 2); g.fill();
  mallet(g, Tb.me, '#2a8aff', '#8ac4ff');
  mallet(g, Tb.cpu, '#ff4a3a', '#ffa08a');
  // the score
  g.textBaseline = 'top'; g.font = 'bold 10px monospace'; g.textAlign = 'center';
  g.fillStyle = '#8ac4ff'; g.fillText(String(Tb.us), W / 2 - 24, 8);
  g.fillStyle = '#ffa08a'; g.fillText(String(Tb.them), W / 2 + 24, 8);
  g.fillStyle = '#8a90b8'; g.font = '7px monospace'; g.fillText('YOU', W / 2 - 24, 19); g.fillText('CPU', W / 2 + 24, 19); g.fillText('-', W / 2, 10);
  if (G.msgT > 0 || G.done) {
    g.font = '8px monospace';
    const m = G.msg, w = g.measureText(m).width + 12;
    g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect((W - w) / 2, CY - 8, w, 16);
    g.fillStyle = G.done ? '#ffd23a' : '#fff'; g.fillText(m, W / 2, CY - 4);
  }
  g.textAlign = 'left';
}
function mallet(g, m, c, hi) {
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(m.x + 1.5, m.y + 2, MAL_R, 0, Math.PI * 2); g.fill();
  g.fillStyle = c; g.beginPath(); g.arc(m.x, m.y, MAL_R, 0, Math.PI * 2); g.fill();
  g.fillStyle = hi; g.beginPath(); g.arc(m.x, m.y, MAL_R - 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = c; g.beginPath(); g.arc(m.x, m.y, 3.5, 0, Math.PI * 2); g.fill();
}
// (tests: the table without a screen)
export const _test = { newTable, strike, glide, cpuMove, T, TO, CY };
