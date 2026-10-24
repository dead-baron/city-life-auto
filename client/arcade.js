// The arcade cabinet (the owner, 10-08 / 10-16: "Arcade: walk in and play our own 8-bit games"): STARFALL, our own
// shooter - the waves come down in their formation, sliding side to side and dropping a row at each edge, firing back,
// and now and then one breaks off and dives at you; clear a wave and the next comes faster. Three ships. Loaded the
// first time someone plays (main.js), drawn on its own little screen (256 x 224, the old consoles' size) over the game.
//   start({ id, free, best, send, close, sfx }) - a credit: the attract screen, then the game; at GAME OVER (or quitting)
//     the score goes to the server (send: { t: 'arcade', id, score, secs }) - tickets at an arcade (server arcade.js),
//     just the high score at home
//   stop() - the cabinet left (the overlay closed: main.js)
// Controls: left / right (A, D, the arrows; the stick or the d-pad; a finger dragged on the screen), the ship fires on
// its own; any button starts; Esc / B leaves.
import { fitScreen } from './arcscreen.js';
const W = 256, H = 224, STEP = 1 / 60;
let G = null;   // the game running, or null

// ---- the pixels ------------------------------------------------------------------------------------------------------
const SPR = {
  ship: ['....##....', '....##....', '...####...', '.########.', '##########', '##.####.##'],
  a1: ['..#....#..', '...#..#...', '..######..', '.##.##.##.', '##########', '#.######.#', '#.#....#.#', '...##.##..'],
  a2: ['...####...', '.########.', '##########', '###.##.###', '##########', '..##..##..', '.##.##.##.', '##......##'],
  a3: ['....##....', '...####...', '..######..', '.##.##.##.', '..######..', '...#..#...', '..#.##.#..', '.#.#..#.#.'],
};
const COL = { ship: '#5ae0ff', a1: '#ff5a8a', a2: '#ffd23a', a3: '#8aff6a', shot: '#ffffff', bomb: '#ff8a3a', star: '#3a4a7a' };
function sprite(g, k, x, y, c = COL[k]) {
  const s = SPR[k];
  g.fillStyle = c;
  for (let j = 0; j < s.length; j++) for (let i = 0; i < s[j].length; i++) if (s[j][i] === '#') g.fillRect((x | 0) + i, (y | 0) + j, 1, 1);
}
// a 3x5 pixel font for the numbers and the few words on screen
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', Y: '101101010010010', X: '101101010101101', '-': '000000111000000', ' ': '000000000000000', ':': '000010000010000', '!': '010010010000010', '.': '000000000000010',
};
function text(g, s, x, y, c = '#fff', k = 1) {
  g.fillStyle = c;
  s = String(s).toUpperCase();
  for (let n = 0; n < s.length; n++) {
    const f = FONT[s[n]] || FONT[' '];
    for (let i = 0; i < 15; i++) if (f[i] === '1') g.fillRect(x + n * 4 * k + (i % 3) * k, y + Math.floor(i / 3) * k, k, k);
  }
}
const textW = (s, k = 1) => String(s).length * 4 * k - k;

// ---- the game ----------------------------------------------------------------------------------------------------------
function newWave(L) {
  const en = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) en.push({ x: 34 + c * 24, y: 30 + r * 16, k: r === 0 ? 'a3' : r < 3 ? 'a2' : 'a1', pts: [50, 30, 30, 20, 20][r], dive: null, alive: true });
  return { en, dx: 1, v: 16 * Math.pow(1.22, L), drop: 0 };
}
function reset() {
  G.ship = { x: W / 2 - 5, inv: 2, dead: 0 };
  G.shots = []; G.bombs = []; G.boom = [];
  G.wave = newWave(G.level); G.fireT = 0; G.diveT = 3; G.bombT = 1.2;
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, phase: 'attract', t0: 0, score: 0, lives: 3, level: 0, keys: new Set(), touchX: null, acc: 0, last: performance.now(), stars: [], best: o.best || 0, sent: false, pressed: false };
  for (let i = 0; i < 60; i++) G.stars.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 30 });
  reset();
  G.onKey = (e) => {
    if (e.repeat) return;
    const down = e.type === 'keydown', k = e.code;
    if (down) G.keys.add(k); else G.keys.delete(k);
    if (down && !/Escape/.test(k)) G.pressed = true;
  };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect();
    if (e.type === 'pointerdown') G.pressed = true;
    G.touchX = e.type === 'pointerup' || e.type === 'pointercancel' ? null : (e.clientX - r.left) / r.width * W;
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
  report();   // (left mid-game: what you'd scored)
  G = null;
}

function report() {
  if (G.sent || G.phase === 'attract') return;
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.score, secs: Math.round((performance.now() - G.t0) / 1000) });
}

// what the controls say: -1 .. 1 across, and a button pressed since last asked
function controls() {
  let mx = 0;
  if (G.keys.has('ArrowLeft') || G.keys.has('KeyA')) mx -= 1;
  if (G.keys.has('ArrowRight') || G.keys.has('KeyD')) mx += 1;
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  let btn = false;
  for (const p of pads) {
    if (Math.abs(p.axes[0] || 0) > 0.25) mx = p.axes[0];
    if (p.buttons[14] && p.buttons[14].pressed) mx = -1;
    if (p.buttons[15] && p.buttons[15].pressed) mx = 1;
    if (p.buttons[0] && p.buttons[0].pressed) btn = true;   // (A: Start closes the screen - main.js overlayPad)
  }
  const press = G.pressed || (btn && !G.padHeld);
  G.padHeld = btn; G.pressed = false;
  if (G.touchX !== null) { const d = G.touchX - (G.ship.x + 5); mx = Math.abs(d) < 2 ? 0 : Math.max(-1, Math.min(1, d / 12)); }
  return { mx, press };
}

const hit = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

function step(dt) {
  const c = controls(), now = performance.now();
  for (const s of G.stars) { s.y += s.v * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
  for (const b of G.boom) b.t += dt;
  G.boom = G.boom.filter((b) => b.t < 0.5);
  if (G.phase === 'attract') { if (c.press) { G.phase = 'play'; G.t0 = now; G.o.sfx('coin', 0.8); } return; }
  if (G.phase === 'over') { G.overT += dt; if (G.overT > 1 && c.press) { report(); G.o.close(); } return; }
  const S = G.ship;
  // the ship: across the bottom, firing on its own
  if (S.dead > 0) { S.dead -= dt; if (S.dead <= 0) { if (G.lives <= 0) { G.phase = 'over'; G.overT = 0; G.best = Math.max(G.best, G.score); report(); G.o.sfx('bad', 0.6); return; } S.inv = 2; } }
  else {
    S.x = Math.max(4, Math.min(W - 14, S.x + c.mx * 140 * dt));
    S.inv = Math.max(0, S.inv - dt);
    G.fireT -= dt;
    if (G.fireT <= 0 && G.shots.length < 3) { G.fireT = 0.28; G.shots.push({ x: S.x + 4.5, y: 196 }); }
  }
  for (const s of G.shots) s.y -= 260 * dt;
  G.shots = G.shots.filter((s) => s.y > -6);
  // the formation: across, and down a row at each edge
  const Wv = G.wave, alive = Wv.en.filter((e) => e.alive);
  let minX = W, maxX = 0;
  for (const e of alive) if (!e.dive) { minX = Math.min(minX, e.x); maxX = Math.max(maxX, e.x + 10); }
  const sp = Wv.v * (1 + (40 - alive.length) * 0.035);
  if ((Wv.dx > 0 && maxX > W - 6) || (Wv.dx < 0 && minX < 6)) { Wv.dx = -Wv.dx; for (const e of alive) if (!e.dive) e.y += 6; }
  for (const e of alive) {
    if (e.dive) {   // diving: a curve down at you, then back into its place from the top
      const D = e.dive;
      D.t += dt;
      e.x += Math.sin(D.t * 3) * 70 * dt + (S.x - e.x) * 0.6 * dt;
      e.y += (60 + G.level * 12) * dt;
      if (e.y > H + 10) { e.y = -10; e.x = D.hx; e.dive = null; }
    } else e.x += Wv.dx * sp * dt;
  }
  // their bombs, and a diver now and then
  G.bombT -= dt;
  if (G.bombT <= 0 && alive.length) { const e = alive[Math.floor(Math.random() * alive.length)]; G.bombs.push({ x: e.x + 4, y: e.y + 8 }); G.bombT = Math.max(0.25, 1.1 - G.level * 0.12) * (0.5 + Math.random()); }
  G.diveT -= dt;
  if (G.diveT <= 0 && alive.length > 3) { const e = alive[Math.floor(Math.random() * alive.length)]; if (!e.dive) e.dive = { t: 0, hx: e.x }; G.diveT = Math.max(1.2, 4 - G.level * 0.4) * (0.6 + Math.random() * 0.8); }
  for (const b of G.bombs) b.y += (90 + G.level * 10) * dt;
  G.bombs = G.bombs.filter((b) => b.y < H);
  // hits
  for (const s of G.shots) for (const e of alive) {
    if (!e.alive || s.y < -5 || !hit(s.x, s.y, 1, 4, e.x, e.y, 10, 8)) continue;
    e.alive = false; s.y = -10;
    G.score += e.pts * (e.dive ? 2 : 1);
    G.boom.push({ x: e.x + 5, y: e.y + 4, t: 0, c: COL[e.k] });
  }
  if (S.dead <= 0 && S.inv <= 0) {
    const struck = G.bombs.some((b) => hit(b.x, b.y, 2, 4, S.x, 196, 10, 6)) || alive.some((e) => e.alive && hit(e.x, e.y, 10, 8, S.x, 196, 10, 6));
    if (struck) {
      G.lives--; S.dead = 1.4; G.bombs = [];
      G.boom.push({ x: S.x + 5, y: 199, t: 0, c: COL.ship, big: 1 });
      G.o.sfx('bad', 0.4);
    }
  }
  // down to the bottom: a life gone and the wave back up; all gone: the next, faster
  if (alive.some((e) => e.alive && !e.dive && e.y > 186)) { G.lives--; S.dead = 1.4; G.wave = newWave(G.level); }
  if (!Wv.en.some((e) => e.alive)) { G.level++; G.score += 200; G.wave = newWave(G.level); G.bombs = []; G.o.sfx('good', 0.5); }
}

function draw() {
  const g = G.g;
  fitScreen(G.cv, g, W, H, true);   // (sharp: a whole number of device pixels to each of its pixels)
  g.fillStyle = '#05060f'; g.fillRect(0, 0, W, H);
  for (const s of G.stars) { g.fillStyle = s.v > 24 ? '#8aa0d8' : COL.star; g.fillRect(s.x | 0, s.y | 0, 1, 1); }
  text(g, `SCORE ${G.score}`, 6, 5, '#fff');
  const hi = `HI ${Math.max(G.best, G.score)}`;
  text(g, hi, W - 6 - textW(hi), 5, '#ffd23a');
  if (G.phase === 'attract') {
    text(g, 'STARFALL', W / 2 - textW('STARFALL', 3) / 2, 60, '#5ae0ff', 3);
    sprite(g, 'a3', 96, 100); text(g, '50', 112, 102, '#8aff6a'); sprite(g, 'a2', 96, 114); text(g, '30', 112, 116, '#ffd23a'); sprite(g, 'a1', 96, 128); text(g, '20', 112, 130, '#ff5a8a');
    text(g, 'DIVERS SCORE DOUBLE', W / 2 - textW('DIVERS SCORE DOUBLE') / 2, 146, '#aab');
    if (Math.floor(performance.now() / 500) % 2) text(g, 'PRESS START', W / 2 - textW('PRESS START', 2) / 2, 170, '#fff', 2);
    text(g, 'LEFT RIGHT TO MOVE - THE SHIP FIRES ITSELF', W / 2 - textW('LEFT RIGHT TO MOVE - THE SHIP FIRES ITSELF') / 2, 204, '#778');
    return;
  }
  for (const e of G.wave.en) if (e.alive) sprite(g, e.k, e.x, e.y + (Math.floor(performance.now() / 300) % 2 && !e.dive ? 1 : 0));
  g.fillStyle = COL.shot; for (const s of G.shots) g.fillRect(s.x | 0, s.y | 0, 1, 4);
  g.fillStyle = COL.bomb; for (const b of G.bombs) g.fillRect(b.x | 0, b.y | 0, 2, 4);
  const S = G.ship;
  if (S.dead <= 0 && !(S.inv > 0 && Math.floor(performance.now() / 90) % 2)) sprite(g, 'ship', S.x, 196);
  for (const b of G.boom) {
    g.fillStyle = b.c;
    const r = (b.big ? 14 : 7) * (b.t / 0.5);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.fillRect((b.x + Math.cos(a) * r) | 0, (b.y + Math.sin(a) * r) | 0, 1, 1); }
  }
  for (let i = 0; i < Math.max(0, G.lives - (S.dead > 0 ? 0 : 1)); i++) sprite(g, 'ship', 6 + i * 14, 214, '#3a8ab0');
  if (G.level) text(g, `WAVE ${G.level + 1}`, W - 6 - textW(`WAVE ${G.level + 1}`), 214, '#778');
  if (G.phase === 'over') {
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 70, W, 70);
    text(g, 'GAME OVER', W / 2 - textW('GAME OVER', 3) / 2, 80, '#ff5a8a', 3);
    text(g, `SCORE ${G.score}`, W / 2 - textW(`SCORE ${G.score}`, 2) / 2, 104, '#fff', 2);
    if (G.score >= G.best && G.score > 0) text(g, 'NEW HIGH SCORE!', W / 2 - textW('NEW HIGH SCORE!') / 2, 122, '#ffd23a');
    if (G.overT > 1 && Math.floor(performance.now() / 500) % 2) text(g, 'PRESS ANY BUTTON', W / 2 - textW('PRESS ANY BUTTON') / 2, 132, '#aab');
  }
}
// (tests: the game's own rules without a screen)
export const _test = { newWave, hit };
