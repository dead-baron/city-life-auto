// Pinball at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"): NEON
// NIGHTS, a little table of our own - the plunger up the shooter lane, three pop bumpers at the top, two slingshots over
// the flippers, a bank of three drop targets (all three down: a bonus, and they come back up), three balls. Played on the
// arcade's screen (main.js: the 'arcade' overlay, loaded the first time someone plays); the score goes to the server,
// which turns it into tickets (server arcade.js).
//   start({ id, best, send, close, sfx }) / stop()
// Controls: the left flipper - Left / A / Z / LB, or the left half of the screen; the right - Right / D / M / RB, or the
// right half; the plunger - hold Space / Enter / Down / pad A (or a finger on the shooter lane) and let go. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
import { layer, blit, ballSprite, shadow, text, banner, led, panel, ramp, tone, hash } from './arcart.js';
const W = 256, H = 224, STEP = 1 / 240, R = 3.5, GRAV = 300, BALLS = 3;
// the table: walls as segments [x1, y1, x2, y2] (the outer case, the shooter lane, the inlanes and the slingshots)
const X0 = 70, X1 = 186, LANE = 176;   // the playfield's sides, the shooter lane's wall
const WALLS = [
  [X0, 40, X0, 150], [X0, 150, 96, 196],                 // the left side, sloping in to the flipper
  [LANE, 70, LANE, 150], [LANE, 150, 150, 196],          // the right side (the lane's wall), sloping in to its flipper
  [X1, 30, X1, 224],                                      // the shooter lane's outer wall
  [X0, 40, 92, 14], [92, 14, 164, 14], [164, 14, X1, 34], // the top's rounded corners
];
// the slingshots over the flippers: rubber from the side wall down onto the slope (nothing behind them), kicking the ball
// back out across the table
const SLINGS = [[X0, 140, 88, 183, 1], [LANE, 140, 158, 183, -1]];
const BUMPERS = [{ x: 106, y: 52, r: 9 }, { x: 140, y: 52, r: 9 }, { x: 123, y: 78, r: 9 }];
const TARGETS = [{ x: X0 + 3, y: 100 }, { x: X0 + 3, y: 112 }, { x: X0 + 3, y: 124 }];   // the drop targets on the left wall
const FLIP = [{ px: 96, py: 196, dir: 1 }, { px: 150, py: 196, dir: -1 }];   // the flippers' pivots (dir: which way the tip points)
const FLEN = 22, DOWN = 0.5, UP = -0.45, FSPEED = 16;   // the flipper's length, its rest and raised angles (from flat), its swing
let G = null;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function closest(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, t = L ? clamp(((x - x1) * dx + (y - y1) * dy) / L, 0, 1) : 0;
  return [x1 + dx * t, y1 + dy * t];
}
// the ball off a segment (restitution e; the segment's own velocity at the contact, sx / sy): true if it touched
function bounce(b, x1, y1, x2, y2, e, sx = 0, sy = 0) {
  const [cx, cy] = closest(b.x, b.y, x1, y1, x2, y2), dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= R || d === 0) return false;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * R; b.y = cy + ny * R;
  const rvx = b.vx - sx, rvy = b.vy - sy, vn = rvx * nx + rvy * ny;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
  return true;
}
export function flipperEnd(f) {
  const a = f.dir > 0 ? f.a : Math.PI - f.a;
  return [f.px + Math.cos(a) * FLEN, f.py + Math.sin(a) * FLEN];
}
export function newTable() {
  return { ball: null, flips: FLIP.map((f) => ({ ...f, a: DOWN, w: 0 })), up: [false, false], targets: TARGETS.map(() => true), score: 0, left: BALLS, plunge: 0, lit: [0, 0, 0], sling: [0, 0] };
}
// the table a step: the flippers swing, the ball falls and comes off everything; returns 'drain' as a ball's lost
export function physics(T, dt, hit) {
  for (let i = 0; i < 2; i++) {
    const f = T.flips[i], want = T.up[i] ? UP : DOWN, a0 = f.a;
    f.a = want < f.a ? Math.max(want, f.a - FSPEED * dt) : Math.min(want, f.a + FSPEED * dt);
    f.w = (f.a - a0) / dt;
  }
  const b = T.ball;
  if (!b) return null;
  if (b.lane) {   // (in the shooter lane, waiting for the plunger)
    b.x = 181; b.vx = 0;
    b.vy += GRAV * dt; b.y += b.vy * dt;
    if (b.y > 210) { b.y = 210; b.vy = 0; }
    if (b.y < 40) { b.lane = false; b.vx = -60; }   // (out at the top, round the corner into the playfield)
    return null;
  }
  b.vy += GRAV * dt;
  const sp = Math.hypot(b.vx, b.vy); if (sp > 720) { b.vx *= 720 / sp; b.vy *= 720 / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  for (const w of WALLS) if (bounce(b, ...w, 0.55) && hit) hit('wall');
  SLINGS.forEach((s, i) => {
    const [x1, y1, x2, y2, side] = s, sp0 = Math.hypot(b.vx, b.vy);
    if (bounce(b, x1, y1, x2, y2, 0.3) && sp0 > 40) {   // (a slingshot's rubber kicks it out across the table, along its face's normal)
      const L = Math.hypot(x2 - x1, y2 - y1), nx = side * (y2 - y1) / L, ny = -side * (x2 - x1) / L;
      b.vx = nx * 250; b.vy = Math.min(-120, ny * 250); T.score += 10; T.sling[i] = 0.15; if (hit) hit('sling');
    }
  });
  BUMPERS.forEach((p, i) => {
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
    if (d < p.r + R && d > 0) { const nx = dx / d, ny = dy / d; b.x = p.x + nx * (p.r + R); b.y = p.y + ny * (p.r + R); b.vx = nx * 300; b.vy = ny * 300; T.score += 100; T.lit[i] = 0.2; if (hit) hit('bumper'); }
  });
  T.targets.forEach((up, i) => {
    if (!up) return;
    const t = TARGETS[i];
    if (bounce(b, t.x, t.y - 5, t.x, t.y + 5, 0.4)) {
      T.targets[i] = false; T.score += 500; if (hit) hit('target');
      if (T.targets.every((q) => !q)) { T.score += 2000; T.targets = TARGETS.map(() => true); if (hit) hit('bank'); }
    }
  });
  for (const f of T.flips) {   // (the flipper: its surface moving as it swings - a raised flipper sends the ball up the table)
    const [ex, ey] = flipperEnd(f), [cx, cy] = closest(b.x, b.y, f.px, f.py, ex, ey);
    const rx = cx - f.px, ry = cy - f.py, w = f.dir > 0 ? f.w : -f.w;
    if (bounce(b, f.px, f.py, ex, ey, 0.35, -w * ry, w * rx) && hit) hit('flip');
  }
  if (b.x < X0 + R) { b.x = X0 + R; b.vx = Math.abs(b.vx) * 0.5; }
  if (b.x > X1 - R && !b.lane) { b.x = X1 - R; b.vx = -Math.abs(b.vx) * 0.5; }
  if (b.x > LANE + R && b.y > 60 && !b.lane) { b.x = LANE - R; b.vx = -Math.abs(b.vx); }   // (never back into the shooter lane)
  if (b.y < 14 + R) { b.y = 14 + R; b.vy = Math.abs(b.vy) * 0.5; }
  if (b.y > H + 8) { T.ball = null; return 'drain'; }
  return null;
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = '';
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, T: newTable(), done: false, t0: performance.now(), keys: new Set(), touch: new Map(), acc: 0, last: performance.now(), sent: false, padHeld: false, pull: false, msg: 'Hold to pull the plunger, let go', msgT: 3 };
  serve();
  G.onKey = (e) => { if (e.repeat) return; if (e.type === 'keydown') G.keys.add(e.code); else G.keys.delete(e.code); };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (e.type === 'pointerdown') G.touch.set(e.pointerId, x > LANE - 4 && y > 140 ? 'plunge' : x < W / 2 ? 'left' : 'right');
    else if (e.type === 'pointerup' || e.type === 'pointercancel') G.touch.delete(e.pointerId);
  };
  addEventListener('keydown', G.onKey); addEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) cv.addEventListener(t, G.onPtr);
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
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) G.cv.removeEventListener(t, G.onPtr);
  report();
  G = null;
}
function report() {
  if (G.sent || !G.done) return;
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.T.score, secs: Math.round((performance.now() - G.t0) / 1000) });
}
function finish() { report(); G.o.close(); }
function serve() { G.T.ball = { x: 181, y: 210, vx: 0, vy: 0, lane: true }; G.T.plunge = 0; }

function step(dt) {
  const T = G.T;
  G.msgT -= dt;
  let L = G.keys.has('ArrowLeft') || G.keys.has('KeyA') || G.keys.has('KeyZ'), Rt = G.keys.has('ArrowRight') || G.keys.has('KeyD') || G.keys.has('KeyM');
  let pull = G.keys.has('Space') || G.keys.has('Enter') || G.keys.has('ArrowDown') || G.keys.has('KeyS');
  for (const v of G.touch.values()) { if (v === 'left') L = true; else if (v === 'right') Rt = true; else pull = true; }
  for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
    if ((p.buttons[4] && p.buttons[4].pressed) || (p.buttons[6] && p.buttons[6].value > 0.3) || (p.buttons[14] && p.buttons[14].pressed)) L = true;
    if ((p.buttons[5] && p.buttons[5].pressed) || (p.buttons[7] && p.buttons[7].value > 0.3) || (p.buttons[15] && p.buttons[15].pressed)) Rt = true;
    if (p.buttons[0] && p.buttons[0].pressed) pull = true;
  }
  if (G.done) { if (pull && !G.padHeld && G.msgT < 2) { finish(); return; } G.padHeld = pull; return; }
  if (L && !T.up[0]) G.o.sfx('click', 0.25);
  if (Rt && !T.up[1]) G.o.sfx('click', 0.25);
  T.up[0] = L; T.up[1] = Rt;
  // the plunger: pulled back while held, let go - the ball up the lane as hard as it was pulled
  const b = T.ball;
  if (b && b.lane && b.y >= 205) {
    if (pull) T.plunge = Math.min(1, T.plunge + dt * 1.2);
    else if (T.plunge > 0.05) { b.vy = -(360 + T.plunge * 420); T.plunge = 0; G.o.sfx('click', 0.5); }
    else T.plunge = 0;
  }
  for (let i = 0; i < 3; i++) T.lit[i] = Math.max(0, T.lit[i] - dt);
  for (let i = 0; i < 2; i++) T.sling[i] = Math.max(0, T.sling[i] - dt);
  const r = physics(T, dt, (what) => { if (what === 'bumper' || what === 'target') G.o.sfx('coin', 0.3); else if (what === 'bank') G.o.sfx('good', 0.6); });
  if (r === 'drain') {
    T.left--;
    G.o.sfx('bad', 0.4);
    if (T.left <= 0) { G.done = true; G.msgT = 3; G.msg = `${T.score} points`; G.o.sfx('good', 0.6); report(); }
    else { G.msg = `Ball ${BALLS - T.left + 1}`; G.msgT = 1.5; serve(); }
  }
}

// ---- the screen (AC7, the owner's pinball concept: the SNES look) ---------------------------------------------------------
// the table, painted once: the cabinet's dark wood round it, the backglass beside it (NEON NIGHTS: the sunset over the
// skyline, the palms), the playfield's night sky - the sunset behind the bumpers, the stars, the lit arrows up the
// lanes - and the chrome guide rails along the walls; the bumpers, slingshots, targets and flippers drawn over it as
// they light and move
let BG = null;
function tableArt() {
  const sky = ramp('#1a1450', 7, 3), wood = ramp('#3a2418', 5, 2), chrome = ramp('#b0b8c8', 5, 2), sunR = ramp('#ff6a3a', 5, 2);
  const seg = (x, y, w) => { const [cx, cy] = closest(x, y, w[0], w[1], w[2], w[3]); return Math.hypot(x - cx, y - cy); };
  const inField = (x, y) => x > X0 && x < X1 && y > 14 && !(y < 40 && (y < 14 + (92 - x) * 26 / 22 || y < 14 + (x - 164) * 20 / 22));
  const sun = (x, y, cx, cy, r) => { const d = Math.hypot(x - cx, y - cy); return d < r && (y < cy - r * 0.3 || (y - cy + r) % 4 > 1); };
  const skyline = (x, y, base, s) => y > base - 4 - Math.floor(hash(x >> 2, s, 9) * 14) && y < base;
  return layer(W, H, (put) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c;
      if (inField(x, y)) {
        const q = Math.hypot(x - 123, y - 130) / 120;
        c = tone(sky, 0.5 - q * 0.35 + (y / H) * 0.12, x, y, 0.6);
        if (hash(x, y, 7) > 0.985) c = [220, 220, 255];
        if (sun(x, y, 123, 128, 22)) c = tone(sunR, 0.72 - (y - 106) / 44 * 0.6, x, y, 0.5);
        if (skyline(x, y, 140, 3)) c = [22, 14, 40];
        for (const lx of [X0 + 12, LANE - 12]) { const dy = (y - 60) % 22; if (dy >= 0 && dy < 6 && Math.abs(Math.abs(x + 0.5 - lx) * 1.4 - dy) < 1.2 && y > 60 && y < 150) c = [90, 240, 120]; }   // (the arrows up the lanes)
      } else if (x >= 4 && x < 64 && y >= 4 && y < 124) {   // the backglass: NEON NIGHTS
        c = tone(sky, 0.2 + (y - 4) / 120 * 0.5, x, y);
        if (sun(x, y, 34, 92, 16)) c = tone(sunR, 0.75 - (y - 76) / 32 * 0.6, x, y, 0.5);
        if (skyline(x, y, 106, 5)) c = [20, 12, 36];
        if (y >= 106) c = tone(sky, 0.15, x, y);
        if (x === 4 || x === 63 || y === 4 || y === 123) c = [242, 194, 48];
      } else c = tone(wood, 0.35 + Math.sin(y * 0.15 + (x >> 3)) * 0.08 + (hash(x >> 1, y, 2) - 0.5) * 0.1, x, y);
      for (const w of WALLS) { const d = seg(x + 0.5, y + 0.5, w); if (d < 1.6) c = tone(chrome, d < 0.8 ? 0.85 : 0.35, x, y, 0.3); }
      for (const sl of SLINGS) { const d = seg(x + 0.5, y + 0.5, sl); if (d < 2.2) c = d < 1.2 ? [255, 210, 60] : [40, 30, 20]; }
      put(x, y, c);
    }
  });
}
// a flipper: a thick yellow bat, rounded, its rubber edge red
function flipper(g, f) {
  const [ex, ey] = flipperEnd(f);
  for (let t = 0; t <= 1; t += 0.04) {
    const x = f.px + (ex - f.px) * t, y = f.py + (ey - f.py) * t, r = 3.2 - t * 1.4;
    g.fillStyle = '#7a1a1a'; g.fillRect(Math.round(x - r - 0.5), Math.round(y - r + 0.5), Math.round(2 * r + 1), Math.round(2 * r));
    g.fillStyle = '#ffd23a'; g.fillRect(Math.round(x - r + 0.5), Math.round(y - r), Math.round(2 * r - 1), Math.round(2 * r - 1));
    g.fillStyle = '#fff0a0'; g.fillRect(Math.round(x - 1), Math.round(y - r), 1, 1);
  }
}
function draw() {
  const g = G.g, T = G.T, now = performance.now() / 1000;
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: the pixels square, the numbers sharp)
  BG ||= tableArt();
  blit(g, BG, 0, 0);
  SLINGS.forEach((s, i) => { if (T.sling[i] > 0) { g.fillStyle = '#fff'; for (let t = 0; t <= 1; t += 0.05) g.fillRect(Math.round(s[0] + (s[2] - s[0]) * t), Math.round(s[1] + (s[3] - s[1]) * t), 2, 2); } });
  BUMPERS.forEach((p, i) => {   // the pop bumpers: their skirts, the caps lit when they kick
    shadow(g, p.x + 1.5, p.y + 2, p.r, p.r * 0.8, 0.4);
    blit(g, ballSprite('#e8e4dc', p.r, { flat: 1 }), p.x - p.r - 0.5, p.y - p.r - 0.5);
    blit(g, ballSprite(T.lit[i] > 0 ? '#ffffff' : '#e8304a', p.r - 2.5), p.x - p.r + 2, p.y - p.r + 2);
    text(g, '100', p.x, p.y - 2, T.lit[i] > 0 ? '#e8304a' : '#ffffff', 1, 'c');
  });
  T.targets.forEach((up, i) => { const t = TARGETS[i]; g.fillStyle = up ? '#5ae05a' : '#1e3a24'; g.fillRect(t.x - 2, t.y - 5, up ? 4 : 2, 10); if (up) { g.fillStyle = '#c8ffc0'; g.fillRect(t.x - 2, t.y - 5, 1, 10); } });
  for (const f of T.flips) flipper(g, f);
  g.fillStyle = '#c0c4d0'; g.fillRect(178, 214 + T.plunge * 8, 6, 8); g.fillStyle = '#e8304a'; g.fillRect(178, 220 + T.plunge * 8, 6, 3);   // the plunger
  if (T.ball) { const b = T.ball; shadow(g, b.x + 1, b.y + 1.5, R, R * 0.8, 0.4); blit(g, ballSprite('#c8ccd8', R), b.x - R - 0.5, b.y - R - 0.5); }
  // the backglass's name over its art, the score, the ball, the best beside the table
  text(g, 'NEON', 34, 14, (now * 2 | 0) % 2 ? '#ff3aa0' : '#ff7ac4', 2, 'c'); text(g, 'NIGHTS', 34, 28, (now * 2 | 0) % 2 ? '#ff7ac4' : '#ff3aa0', 2, 'c');
  panel(g, 4, 130, 60, 30, '#c8a050'); text(g, 'SCORE', 34, 134, '#f4f2ea', 1, 'c'); led(g, T.score, 8, 143, '#ffb020', 11, 6);
  panel(g, 4, 164, 60, 16, '#c8a050'); text(g, `BALL ${Math.min(BALLS, BALLS - T.left + 1)}`, 34, 169, '#f4f2ea', 1, 'c');
  if (G.o.best) { panel(g, 192, 4, 60, 26, '#c8a050'); text(g, 'BEST', 222, 8, '#f4f2ea', 1, 'c'); text(g, String(G.o.best), 222, 18, '#ffd23a', 1, 'c'); }
  if (G.msgT > 0 || G.done) banner(g, W, G.done ? H / 2 - 7 : 120, G.done ? `${G.msg}${G.o.best && T.score > G.o.best ? ' - a new best!' : ''}` : G.msg, G.done ? '#ffd23a' : '#fff');
}
// (tests: the table without a screen)
export const _test = { newTable, physics, flipperEnd, BUMPERS, TARGETS, FLIP };
