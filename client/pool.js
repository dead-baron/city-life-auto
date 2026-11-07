// A frame of pool (the owner, 10-08 #308 / 10-16: "pool tables you can play"): at the Rusty Spur's table and the
// mansion's (server arcade.js play 'pool'), nine balls racked in a diamond to clear in as few shots as you can - a
// scratch (the cue ball down a pocket) costs a shot and the cue ball goes back on the spot. Played on its own screen
// like the arcade's cabinet (main.js: the 'arcade' overlay), and the shots it took go to the server (the best kept).
//   start({ id, best, send, close, sfx, mp }) / stop() / update(m)
// (11-07) mp: a table's game against someone (server/systems/poolmatch.js) - the choice first (wait for a player, play
// the computer, a frame alone), then eight-ball: your shot's aim and power go to the server, which plays every shot out
// (shared/pool.js) and sends it back to animate, to both players and anyone watching (update); closing the screen gets
// you up (a game against someone forfeited).
// Aiming: the mouse or a finger - drag back from the cue ball and let go (the further, the harder); or turn the cue with
// left / right (the stick, the d-pad, A D or the arrows; up / down to fine-tune), hold the shoot button (Space, Enter, A)
// to build the power and let go. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
import { layer, blit, ballSprite, shadow, text, panel, banner, ramp, tone, hash } from './arcart.js';
import { T, R, PR, POCKETS, HEAD, FOOT, STEP, rack, physics, strikeCue, spotCue, groupOf } from '../shared/pool.js';
export { rack, physics };
const W = 256, H = 160;
const BASE = ['#f2c21b', '#2350c8', '#c8262b', '#6a2ab8', '#ef7a1a', '#2f9a3a', '#8a1d24', '#1a1a1e'];
const colOf = (n) => (n === 0 ? '#f4f2ea' : BASE[(n - 1) % 8]);   // (1 yellow .. 7 maroon, 8 black; 9-15 the same striped)
const ballArt = (n) => ballSprite(colOf(n), R, { stripe: n > 8, dot: n > 0 && n !== 8 ? 1 : n === 8 });
let G = null;

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = `${W} / ${H}`;
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, mp: !!o.mp, S: null, sel: 0, btns: [], balls: rack(o.mp ? 'eight' : 'nine'), shots: 0, aim: 0, power: 0, charging: false, chargeT: 0, moving: false, done: false, t0: performance.now(), keys: new Set(), drag: null, acc: 0, last: performance.now(), msg: 'Clear the table in as few shots as you can', msgT: 3, sent: false, padHeld: false };
  if (G.mp) { G.msg = ''; G.msgT = 0; o.send({ t: 'pool', a: 'state' }); }   // (the table as it stands: what came before this module loaded was missed)
  G.onKey = (e) => {
    if (e.repeat) return;
    if (e.type === 'keydown') { G.keys.add(e.code); if (G.btns.length && !myTurn()) { if (/Arrow(Left|Up)|KeyA|KeyW/.test(e.code)) G.sel = (G.sel + G.btns.length - 1) % G.btns.length; else if (/Arrow(Right|Down)|KeyD|KeyS/.test(e.code)) G.sel = (G.sel + 1) % G.btns.length; else if (/Space|Enter/.test(e.code)) press(G.btns[G.sel]); } }
    else { G.keys.delete(e.code); if ((e.code === 'Space' || e.code === 'Enter') && G.charging) shoot(); }
  };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H, cb = G.balls[0];
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (e.type === 'pointerdown') { const b = G.btns.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h); if (b) { press(b); return; } }
    if (G.moving || cb.in || (G.mp && !myTurn())) return;
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
  if (G.mp) G.o.send({ t: 'pool', a: 'leave' }); else report();
  G = null;
}
// ---- a game against someone (mp) ------------------------------------------------------------------------------------
const myTurn = () => !!(G && G.S && G.S.st === 'play' && G.S.me === G.S.turn && !G.moving && !G.waitShot);
const setBalls = (list) => { G.balls = list.map(([n, x, y, i]) => ({ n, x, y, vx: 0, vy: 0, in: !!i })); };
// the table from the server: a shot to animate from where the balls were, else the balls where they are
export function update(m) {
  if (!G || !G.mp || m.t !== 'pool') return;
  const was = G.S;
  G.S = m;
  if (m.shot) { setBalls(m.shot.from); strikeCue(G.balls, m.shot.aim, m.shot.pow); G.moving = true; G.snap = m.balls; G.o.sfx('click', 0.6); }
  else if (!G.moving) setBalls(m.balls);
  G.waitShot = false;
  if (m.line && (!was || m.line !== was.line)) { G.msg = m.line; G.msgT = m.st === 'play' ? 2.5 : 99; }
  if (m.st === 'over' && (!was || was.st !== 'over')) G.o.sfx(m.win === m.me ? 'good' : 'bad', 0.6);
  G.sel = 0;
}
function press(b) { if (b.a === 'leave') G.o.close(); else G.o.send({ t: 'pool', a: b.a }); }
// the choice on the screen: waiting (the computer, a frame alone), a game over (a rematch), always a way out
function buttons() {
  const S = G.S, list = [];
  if (S && S.st === 'wait' && S.me === 0) list.push({ a: 'cpu', t: 'PLAY THE COMPUTER' }, { a: 'solo', t: 'A FRAME ALONE' });
  if (S && S.st === 'over' && S.me >= 0 && S.seats[0] && S.seats[1]) list.push({ a: 'again', t: 'REMATCH' });
  if (S && (S.st !== 'play' || S.me < 0)) list.push({ a: 'leave', t: S.me < 0 ? 'STOP WATCHING' : 'LEAVE' });
  let x = W / 2 - list.reduce((w, b) => w + b.t.length * 4 + 14, -6) / 2;
  for (const b of list) { b.w = b.t.length * 4 + 8; b.h = 13; b.x = Math.round(x); b.y = T.y1 - 30; x += b.w + 6; }
  return list;
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
  if (G.mp) { if (myTurn()) { G.o.send({ t: 'pool', a: 'shot', aim: G.aim, pow: G.power }); G.waitShot = true; } G.power = 0; return; }   // (the server plays it: update)
  strikeCue(G.balls, G.aim, G.power);
  G.shots++; G.power = 0; G.moving = true;
  if (!G.done && G.shots === 1) G.msgT = 0;   // (the opening words gone once you've broken)
  G.o.sfx('click', 0.6);
}

function step(dt) {
  const cb = G.balls[0];
  G.msgT -= dt;
  if (G.mp) {   // (a game against someone: aim on your turn; a shot animated, then the table as the server has it)
    if (G.moving) { G.moving = physics(G.balls, dt, (b) => G.o.sfx(b.n ? 'coin' : 'bad', 0.45)); if (!G.moving && G.snap) setBalls(G.snap); return; }
    if (!myTurn()) { G.charging = false; let a = false; for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) if (p.buttons[0] && p.buttons[0].pressed) a = true; if (a && !G.padHeld && G.btns.length) press(G.btns[G.sel]); G.padHeld = a; return; }
  }
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
        G.shots++; spotCue(G.balls);
      }
      if (G.balls.every((b) => b.n === 0 || b.in)) { G.done = true; G.msgT = 3; G.msg = `Cleared in ${G.shots} shots`; G.o.sfx('good', 0.7); report(); }
    }
  }
}

// ---- the screen (GM2, the owner's pool concept: the SNES look) -----------------------------------------------------------
// the table, painted once: the bar's plank floor round it and the table's shadow, the mahogany rails with their grain,
// bevels and the pearl diamond sights, the cushions, the felt lit from the lamp over the middle (darker to the rails, its
// nap in the noise), the head string and the foot spot, the leather drop pockets
let BG = null;
function tableArt() {
  const floor = ramp('#4a2c1c', 6, 3), wood = ramp('#8a4320', 7, 3), felt = ramp('#2a8a4e', 7, 3), cush = ramp('#1f7040', 6, 3), lea = ramp('#5a3420', 5, 2);
  const cx = (T.x0 + T.x1) / 2, cy = (T.y0 + T.y1) / 2, O = 12, C = 4;
  const sights = [];
  for (const k of [1, 2, 3, 5, 6, 7]) { const x = T.x0 + (T.x1 - T.x0) * k / 8; sights.push([x, T.y0 - 8], [x, T.y1 + 8]); }
  for (const k of [1, 2, 3]) { const y = T.y0 + (T.y1 - T.y0) * k / 4; sights.push([T.x0 - 8, y], [T.x1 + 8, y]); }
  return layer(W, H, (put) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const inR = x >= T.x0 - O && x < T.x1 + O && y >= T.y0 - O && y < T.y1 + O, inC = x >= T.x0 - C && x < T.x1 + C && y >= T.y0 - C && y < T.y1 + C;
      const inF = x >= T.x0 && x < T.x1 && y >= T.y0 && y < T.y1;
      let c;
      if (!inR) {   // the floor: planks, their seams, a vignette; the table's shadow
        const row = y >> 3, off = Math.floor(hash(row, 1, 4) * 40), seam = y % 8 === 0 || (x + off) % 40 === 0;
        const sh = x >= T.x0 - O + 3 && x < T.x1 + O + 4 && y >= T.y0 - O + 4 && y < T.y1 + O + 5;
        const v = Math.max(Math.abs(x - W / 2) / (W / 2), Math.abs(y - H / 2) / (H / 2));
        c = tone(floor, seam ? 0.1 : 0.42 + (hash((x + off) / 40 | 0, row, 2) - 0.5) * 0.25 + Math.sin((x + off) * 0.21 + row) * 0.06 - v * v * 0.25 - (sh ? 0.28 : 0), x, y);
      } else if (!inC) {   // the rails: the grain along them, the bevels
        const hz = y < T.y0 - C || y >= T.y1 + C, along = hz ? x : y, acr = hz ? (y < T.y0 ? y - (T.y0 - O) : T.y1 + O - 1 - y) : (x < T.x0 ? x - (T.x0 - O) : T.x1 + O - 1 - x);
        const lit = hz ? y < T.y0 : x < T.x0;   // (the top and the left catch the lamp)
        let t = 0.5 + Math.sin(along * 0.07 + acr * 0.9 + hash(acr, hz ? 1 : 2, 7) * 9) * 0.12 + (hash(along >> 2, acr, 9) - 0.5) * 0.1;
        if (acr === 0) t = 0.05; else if (acr === 1) t += lit ? 0.3 : -0.12; else if (acr >= O - C - 1) t -= 0.2;
        c = tone(wood, t, x, y, 0.6);
        for (const [sx, sy] of sights) { const d = Math.abs(x + 0.5 - sx) + Math.abs(y + 0.5 - sy); if (d < 1.6) c = [244, 236, 214]; else if (d < 2.4) c = tone(wood, 0.15, x, y); }
      } else if (!inF) {   // the cushions: the rubber's nose lit on the far side
        const e = Math.min(x - (T.x0 - C), T.x1 + C - 1 - x, y - (T.y0 - C), T.y1 + C - 1 - y);
        c = tone(cush, e === 3 ? 0.78 : e === 0 ? 0.2 : 0.48, x, y, 0.5);
      } else {   // the felt
        const q = ((x - cx) / 120) ** 2 + ((y - cy) / 74) ** 2;
        let t = 0.66 - q * 0.42 + (hash(x, y, 1) - 0.5) * 0.07 + (hash(x >> 1, y >> 1, 3) - 0.5) * 0.06;
        if (x < T.x0 + 2 || y < T.y0 + 2) t -= 0.18;   // (the cushions' shadow)
        if (x === Math.round(HEAD.x)) t += 0.08;
        if (Math.hypot(x + 0.5 - FOOT.x, y + 0.5 - FOOT.y) < 1.2) t += 0.4;
        c = tone(felt, t, x, y);
      }
      for (const [px, py] of POCKETS) {   // the leather pockets over the corners
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d < PR - 1.5) c = d < PR - 3.5 ? [6, 4, 4] : [20, 12, 10];
        else if (d < PR + 1) c = tone(lea, 0.35 + ((x - px) < 0 && (y - py) < 0 ? 0.35 : (y - py) * -0.02), x, y, 0.5);
      }
      put(x, y, c);
    }
  });
}
// the cue: the blue tip, the white ferrule, the maple shaft, the black wrap, the butt with its gold rings, along the aim
function cue(g, cb, ax, ay, back) {
  const seg = (d) => (d < 2 ? '#3a6ad8' : d < 4 ? '#f4f0e6' : d < 54 ? (d < 30 ? '#e8cc96' : '#dcb880') : d < 64 ? ((d | 0) % 3 ? '#26262c' : '#3a3a44') : d < 66 || (d > 84 && d < 86) ? '#e8c050' : '#6a2812');
  for (let d = 0; d < 90; d += 0.7) { const x = cb.x - ax * (back + d), y = cb.y - ay * (back + d); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(Math.round(x + 2), Math.round(y + 3), 1, 1); }
  for (let d = 0; d < 90; d += 0.6) {
    const x = cb.x - ax * (back + d), y = cb.y - ay * (back + d), w = d > 50 ? 2 : 1;
    g.fillStyle = seg(d); g.fillRect(Math.round(x), Math.round(y), w, w);
    if (d > 4 && d < 54) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(Math.round(x - ay), Math.round(y + ax), 1, 1); }
  }
}
// where the cue ball first meets a ball (the ghost ball) or a cushion, along the aim
export function aimHit(balls, cb, ax, ay) {
  let best = 220;
  for (const b of balls) {
    if (b === cb || b.in) continue;
    const fx = b.x - cb.x, fy = b.y - cb.y, t = fx * ax + fy * ay, d2 = fx * fx + fy * fy - t * t, r2 = 4 * R * R;
    if (t > 0 && d2 < r2) best = Math.min(best, t - Math.sqrt(r2 - d2));
  }
  for (const [lim, v, p] of [[T.x0 + R, ax, cb.x], [T.x1 - R, ax, cb.x], [T.y0 + R, ay, cb.y], [T.y1 - R, ay, cb.y]]) if (v && (lim - p) / v > 0) best = Math.min(best, (lim - p) / v);
  return best;
}
function draw() {
  const g = G.g, cb = G.balls[0];
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: the pixels square, the words sharp)
  BG ||= tableArt();
  blit(g, BG, 0, 0);
  for (const b of G.balls) {
    if (b.in) continue;
    shadow(g, b.x + 1.3, b.y + 1.8, R * 0.95, R * 0.7, 0.32);
    blit(g, ballArt(b.n), b.x - 5.5, b.y - 5.5);
  }
  if (!G.moving && !G.done && !cb.in && (!G.mp || myTurn())) {
    // the aim: dots to the ghost ball, the ghost ball's ring; the cue behind the ball, drawn back by the power
    const ax = Math.cos(G.aim), ay = Math.sin(G.aim), t = aimHit(G.balls, cb, ax, ay);
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let d = 7; d < t; d += 4) g.fillRect(Math.round(cb.x + ax * d), Math.round(cb.y + ay * d), 1, 1);
    const gx = cb.x + ax * t, gy = cb.y + ay * t;
    for (let k = 0; k < 12; k++) g.fillRect(Math.round(gx + Math.cos(k * 0.524) * R), Math.round(gy + Math.sin(k * 0.524) * R), 1, 1);
    cue(g, cb, ax, ay, 6 + G.power * 22);
    // the power: a gauge at the bottom left, green to red
    panel(g, 6, H - 13, 64, 9, '#c8a050');
    for (let i = 0; i < 15; i++) { g.fillStyle = i / 15 < G.power ? (i < 8 ? '#5ae05a' : i < 12 ? '#f2c21b' : '#ff4a3a') : 'rgba(255,255,255,.08)'; g.fillRect(8 + i * 4, H - 11, 3, 5); }
  }
  hud(g);
}
function hud(g) {
  G.btns = G.mp ? buttons() : [];
  if (G.mp) { hudMatch(g); return; }
  text(g, `SHOTS ${G.shots}`, 8, 3, '#f4f2ea');
  if (G.o.best) text(g, `BEST ${G.o.best}`, W - 8, 3, '#ffd23a', 1, 'r');
  if (G.msgT > 0 || G.done) banner(g, W, G.done ? H / 2 - 7 : T.y1 - 24, G.done ? `${G.msg}${G.o.best && G.shots < G.o.best ? ' - a new best!' : ''}` : G.msg, G.done ? '#ffd23a' : '#fff');
}
// a game's HUD: each player's name over their side - lit when it's their shot - their group's balls still on the table,
// the word of the last shot, the choice when there is one
function hudMatch(g) {
  const S = G.S;
  if (!S) { banner(g, W, H / 2 - 7, 'At the table...'); return; }
  S.seats.forEach((o, i) => {
    const up = S.st === 'play' && S.turn === i, gp = S.groups[i], x = i ? W - 8 : 8, al = i ? 'r' : 'l';
    const name = o ? (S.me === i ? 'YOU' : o.n.slice(0, 12)) : 'WAITING...';
    const w = text(g, `${up ? '> ' : ''}${name}`, x, 3, up ? '#ffd23a' : o ? '#f4f2ea' : '#8a90b0', 1, al);
    if (!gp) return;
    const left = G.balls.filter((b) => !b.in && groupOf(b.n) === gp).map((b) => b.n);
    left.forEach((n, k) => blit(g, ballSprite(colOf(n), 3, { stripe: n > 8 }), i ? x - w - 10 - k * 7 : x + w + 3 + k * 7, 1));
  });
  text(g, '8-BALL', W / 2, 3, '#c8a050', 1, 'c');
  if (S.watch) text(g, `${S.watch} WATCHING`, W - 8, H - 10, '#8a90b0', 1, 'r');
  if (G.msgT > 0 || S.st !== 'play') banner(g, W, S.st === 'play' ? T.y1 - 24 : H / 2 - 22, S.st === 'wait' && S.me === 0 ? 'Waiting for a player - or:' : G.msg || S.line, S.st === 'over' ? '#ffd23a' : '#fff');
  G.btns.forEach((b, i) => { panel(g, b.x, b.y, b.w, b.h, i === G.sel ? '#ffd23a' : '#c8a050', i === G.sel ? 'rgba(60,40,10,.92)' : undefined); text(g, b.t, b.x + 4, b.y + 4, i === G.sel ? '#ffd23a' : '#f4f2ea'); });
}
// (tests: the table without a screen)
export const _test = { rack, physics, POCKETS, T, R };
