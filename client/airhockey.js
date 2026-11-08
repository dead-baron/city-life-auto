// Air hockey at the arcades (the owner, 10-08: "Arcade: ... air hockey, skee-ball, pinball; tickets for prizes"; 11-07:
// "id prefer it is 2 player"): first to seven. Your mallet on the left half, the other on the right; the puck glides on
// the air, off the rails and the mallets, into the goals at the ends (the table: shared/airhockey.js). Played on the
// arcade's screen (main.js: the 'arcade' overlay, loaded the first time someone plays).
//   start({ id, best, send, close, sfx, mp, tbl }) / stop() / update(m)
//   - Against the machine (no mp): played here, as it always was; the goals go to the server (server arcade.js:
//     tickets). From a table (tbl), its watchers are shown the game (the server says when there are: { watch }) and
//     getting up frees the table.
//   - At a table (mp: server/systems/hockeymatch.js): the choice first (wait for a player, play the machine), then a
//     game against someone - the puck the server's, predicted here (client/hockeynet.js): your mallet moves at once and
//     goes to the server 30 times a second; seat 1 sees the table turned round, so you're always on the left. A
//     watcher sees the table as the server has it.
// The mallet: the mouse or a finger (it follows where you point), or the keys, the stick or the d-pad. Esc / B leaves.
import { fitScreen } from './arcscreen.js';
import { layer, blit, ballSprite, shadow, text, banner, led, panel, ramp, tone, hash } from './arcart.js';
import { W, H, STEP, T, GOAL, PUCK_R, MAL_R, TO, MY_SPEED, KEY_SPEED, CY, STUCK_S, newTable, strike, glide, moveTo, cpuMove, unstick, stepTable } from '../shared/airhockey.js';
import * as net from './hockeynet.js';
export { newTable, strike, glide, cpuMove, unstick };
let G = null;

export function start(o) {
  stop(true);   // (the table's choice turned into a game against the machine: the screen goes on, nobody's got up)
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  cv.width = W; cv.height = H; cv.style.aspectRatio = '';
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, mp: !!o.mp, T: newTable(), done: false, t0: performance.now(), keys: new Set(), ptr: null, acc: 0, last: performance.now(), sent: false, padHeld: false, msg: 'First to seven', msgT: 2.5, btns: [], sel: 0, watched: 0, relayAt: 0, S: null, N: null, m: null, lastK: null, pingAt: 0, pings: 0, relay: [], prev: null };
  G.T.wait = 1.2;
  if (G.mp) { G.msg = ''; G.msgT = 0; o.send({ t: 'hockey', a: 'state' }); }   // (the table as it stands: what came before this module loaded was missed)
  G.onKey = (e) => {
    if (e.repeat) return;
    if (e.type === 'keydown') { G.keys.add(e.code); if (G.btns.length && !playing()) { if (/Arrow(Left|Up)|KeyA|KeyW/.test(e.code)) G.sel = (G.sel + G.btns.length - 1) % G.btns.length; else if (/Arrow(Right|Down)|KeyD|KeyS/.test(e.code)) G.sel = (G.sel + 1) % G.btns.length; else if (/Space|Enter/.test(e.code)) press(G.btns[G.sel]); } }
    else G.keys.delete(e.code);
  };
  G.onPtr = (e) => {
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (G.done && e.type === 'pointerdown') { finish(); return; }
    if (e.type === 'pointerdown') { const b = G.btns.find((q) => x >= q.x && x < q.x + q.w && y >= q.y && y < q.y + q.h); if (b) { press(b); return; } }
    if (e.type === 'pointerup' || e.type === 'pointercancel') { if (e.pointerType !== 'mouse') G.ptr = null; return; }
    if (e.type === 'pointermove' || e.type === 'pointerdown') G.ptr = { x, y };
  };
  addEventListener('keydown', G.onKey); addEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) cv.addEventListener(t, G.onPtr);
  const tick = (now) => {
    if (!G) return;
    G.raf = requestAnimationFrame(tick);
    if (G.mp) { mpFrame(now); if (G) draw(); return; }
    G.acc = Math.min(0.25, G.acc + (now - G.last) / 1000); G.last = now;
    while (G.acc >= STEP) { step(STEP); if (!G) return; G.acc -= STEP; }
    if (G.o.tbl && G.watched && now - G.relayAt > 100) { G.relayAt = now; const P = G.T.puck, q = (v) => Math.round(v * 10); G.o.send({ t: 'hockey', v: [q(P.x), q(P.y), q(G.T.me.x), q(G.T.me.y), q(G.T.cpu.x), q(G.T.cpu.y), G.T.us, G.T.them] }); }   // (shown to whoever's watching: hockeymatch.js relay)
    draw();
  };
  G.raf = requestAnimationFrame(tick);
}
export function stop(quiet = false) {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  removeEventListener('keydown', G.onKey); removeEventListener('keyup', G.onKey);
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) G.cv.removeEventListener(t, G.onPtr);
  if (!G.mp) report();
  if (!quiet && (G.mp || G.o.tbl)) G.o.send({ t: 'hockey', a: 'leave' });   // (up from the table: a game against someone forfeited)
  G = null;
}
// the goals, whenever you leave: a loss counts what you scored, a win is a win
function report() {
  if (G.sent || (!G.done && !G.T.us)) return;
  G.sent = true;
  G.o.send({ t: 'arcade', id: G.o.id, score: G.T.us, them: G.T.them, win: G.T.us >= TO ? 1 : 0, secs: Math.round((performance.now() - G.t0) / 1000) });
}
function finish() { report(); G.o.close(); }

// where the controls put your mallet: the stick, the d-pad or the keys (a push, -1 .. 1), else where you point
function controls() {
  let mx = 0, my = 0;
  if (G.keys.has('ArrowLeft') || G.keys.has('KeyA')) mx -= 1;
  if (G.keys.has('ArrowRight') || G.keys.has('KeyD')) mx += 1;
  if (G.keys.has('ArrowUp') || G.keys.has('KeyW')) my -= 1;
  if (G.keys.has('ArrowDown') || G.keys.has('KeyS')) my += 1;
  let btn = false;
  for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) {
    if (Math.abs(p.axes[0] || 0) > 0.15) mx = p.axes[0];
    if (Math.abs(p.axes[1] || 0) > 0.15) my = p.axes[1];
    if (p.buttons[14] && p.buttons[14].pressed) mx = -1;
    if (p.buttons[15] && p.buttons[15].pressed) mx = 1;
    if (p.buttons[12] && p.buttons[12].pressed) my = -1;
    if (p.buttons[13] && p.buttons[13].pressed) my = 1;
    if (p.buttons[0] && p.buttons[0].pressed) btn = true;
  }
  if (mx || my) G.ptr = null;
  return { mx, my, btn: btn || G.keys.has('Space') || G.keys.has('Enter') };
}
// your mallet a step: pushed by the keys / the stick, or after where you point (seat: 0 the left, 1 the right - its
// page's left and right turned round)
function moveMine(m, seat, c, dt) {
  const f = seat === 1 ? -1 : 1;
  if (c.mx || c.my) moveTo(m, m.x + f * c.mx * 100, m.y + c.my * 100, KEY_SPEED * Math.min(1, Math.hypot(c.mx, c.my)), dt, seat);
  else if (G.ptr) moveTo(m, net.mirror(seat, G.ptr.x), G.ptr.y, MY_SPEED, dt, seat);
  else { m.vx = 0; m.vy = 0; }
}

function step(dt) {
  const Tb = G.T;
  G.msgT -= dt;
  const c = controls();
  if (G.done) {
    if (c.btn && !G.padHeld && G.msgT < 2) { finish(); return; }
    G.padHeld = c.btn;
    return;
  }
  moveMine(Tb.me, 0, c, dt);
  cpuMove(Tb, dt);
  const r = stepTable(Tb, dt);
  if (r === 'hit') G.o.sfx('click', 0.35);
  else if (r === 'rail') G.o.sfx('click', 0.15);
  else if (r === 'face') { G.msg = 'Face-off'; G.msgT = 1; }
  else if (r === 'us' || r === 'them') {
    G.o.sfx(r === 'us' ? 'good' : 'bad', 0.5);
    G.msg = r === 'us' ? 'GOAL!' : 'Their goal'; G.msgT = 1.2;
    if (Tb.us >= TO || Tb.them >= TO) { G.done = true; G.msgT = 3; G.msg = Tb.us >= TO ? `You win ${Tb.us}-${Tb.them}!` : `The machine wins ${Tb.them}-${Tb.us}`; G.o.sfx(Tb.us >= TO ? 'good' : 'bad', 0.7); report(); }
  }
}

// ---- at a table: against someone, or watching (hockeymatch.js) -------------------------------------------------------
const playing = () => !!(G && G.mp && G.S && G.S.st === 'play' && G.S.me >= 0);
// the server's word: the table's players and score (st), the table 20 times a second (s), a ping back, a game against
// the machine shown to its watchers (v), how many watch your game against the machine (watch)
export function update(m) {
  if (!G || m.t !== 'hockey') return;
  if (!G.mp) { if (m.watch !== undefined) G.watched = m.watch; return; }
  const now = performance.now();
  if (m.pong !== undefined) { if (G.N) net.onPong(G.N, now, m.pong, m.now); return; }
  if (m.st) {
    const was = G.S;
    G.S = m;
    if (m.st === 'play' && (!was || was.st !== 'play' || !G.N || G.N.seat !== m.me)) {   // (a game begun: its clock from nothing)
      G.N = net.makeNet(m.me); G.lastK = null; G.pings = 0; G.pingAt = 0;
      G.m = m.me >= 0 ? { x: m.me ? T.x1 - 40 : T.x0 + 40, y: CY, vx: 0, vy: 0 } : null;
    }
    if (G.N) net.clockFrom(G.N, now, m.now);
    if (was && was.sc && m.st === 'play' && (m.sc[0] !== was.sc[0] || m.sc[1] !== was.sc[1])) {
      const mine = m.me >= 0 && m.sc[m.me] !== was.sc[m.me];
      G.o.sfx(m.me < 0 || mine ? 'good' : 'bad', 0.5);
    }
    if (m.line && (!was || m.line !== was.line)) { G.msg = m.line; G.msgT = m.st === 'play' ? 1.4 : 99; }
    if (m.st === 'over' && (!was || was.st !== 'over')) G.o.sfx(m.win === m.me ? 'good' : 'bad', 0.7);
    G.sel = 0;
  }
  if (m.v) { G.relay.push([now, m.v]); if (G.relay.length > 4) G.relay.shift(); if (m.sc && G.S) G.S.sc = m.sc; }
  if (m.s && G.N && G.S && G.S.st === 'play') net.onState(G.N, m.s, net.present(G.N, now), G.m);
}
function press(b) { if (b.a === 'leave') G.o.close(); else G.o.send({ t: 'hockey', a: b.a }); }
// the choice on the screen: waiting (the machine), a game over (a rematch), always a way out but in a game
function buttons() {
  const S = G.S, list = [];
  if (!S) return list;
  if (S.st === 'wait' && S.me === 0) list.push({ a: 'cpu', t: 'PLAY THE MACHINE' });
  if (S.st === 'over' && S.me >= 0 && S.seats[0] && S.seats[1]) list.push({ a: 'again', t: 'REMATCH' });
  if (S.st !== 'play' || S.me < 0) list.push({ a: 'leave', t: S.me < 0 ? 'STOP WATCHING' : 'LEAVE' });
  let x = W / 2 - list.reduce((w, b) => w + b.t.length * 4 + 14, -6) / 2;
  for (const b of list) { b.w = b.t.length * 4 + 8; b.h = 13; b.x = Math.round(x); b.y = T.y1 - 36; x += b.w + 6; }
  return list;
}
// a frame of a game against someone: your mallet each step since the last (its samples to the server), the prediction
// on to now; pings to keep the clock
function mpFrame(now) {
  const N = G.N, dt = Math.min(0.1, (now - G.last) / 1000);
  G.last = now; G.msgT -= dt;
  const c = controls();
  if (!playing()) { if (c.btn && !G.padHeld && G.btns.length) press(G.btns[G.sel]); G.padHeld = c.btn; }
  if (!N || !G.S || G.S.st !== 'play') return;
  if (now - G.pingAt > (G.pings < 5 ? 120 : 2000)) { G.pingAt = now; G.pings++; G.o.send({ t: 'hockey', a: 'ping', c: +now.toFixed(1) }); }
  const k = net.present(N, now);
  if (k === null) return;
  if (G.m && N.pred) {
    if (G.lastK === null) G.lastK = k - 1;
    for (let j = Math.max(G.lastK + 1, k - 30); j <= k; j++) {
      moveMine(G.m, N.seat, c, STEP);
      const s = net.sample(N, j, G.m);
      if (s) G.o.send({ t: 'hockey', m: s });
    }
    G.lastK = k;
  }
  net.frame(N, now * 0.12 + N.off, G.m, (ev) => { if (ev === 'hit') G.o.sfx('click', 0.35); else if (ev === 'rail') G.o.sfx('click', 0.15); });
}
// what to draw at a table: the puck and the two mallets (left and right as this page sees them), or null
function view() {
  const S = G.S;
  if (!S) return null;
  if (S.st === 'cpu') {   // (a game against the machine, watched: between its page's last two words, 150 ms behind)
    const R = G.relay;
    if (!R.length) return null;
    const t = performance.now() - 150;
    let a = R[0], b = R[0];
    for (let i = 1; i < R.length; i++) if (R[i][0] <= t) a = R[i]; else { b = R[i]; break; }
    if (b === a) b = R[R.length - 1];
    const f = b[0] === a[0] ? 1 : Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
    const p = (i) => (a[1][i] + (b[1][i] - a[1][i]) * f) / 10;
    return { puck: { x: p(0), y: p(1) }, L: { x: p(2), y: p(3) }, R: { x: p(4), y: p(5) } };
  }
  const N = G.N;
  if (S.st !== 'play' || !N || !N.pred) { const Tb = newTable(); return { puck: Tb.puck, L: Tb.me, R: Tb.cpu }; }
  const seat = Math.max(0, S.me), mir = (q) => (q ? { x: net.mirror(seat, q.x), y: q.y } : null);
  const puck = mir(net.drawn(N));
  if (S.me < 0) return { puck, L: net.other(N, 0), R: net.other(N, 1) };
  return { puck, L: mir(G.m), R: mir(net.other(N, seat ^ 1)) };
}

// ---- the screen (AC7, the owner's air hockey concept: the SNES look) -------------------------------------------------------
// the rink, painted once: the arcade's carpet round it, the table's dark apron, the chrome rails with their light
// strips - blue down your half, orange down the other's - the goal slots in the ends, the lit blue top (brighter in
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
  const g = G.g;
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: the pixels square, the numbers sharp)
  BG ||= rinkArt();
  blit(g, BG, 0, 0);
  const V = G.mp ? view() : { puck: G.T.puck, L: G.T.me, R: G.T.cpu };
  if (V) {
    // the puck - its trail when it flies (from how far it went since the last frame) - and the mallets, shaded, their shadows
    const P = V.puck, q = G.prev || P, vx = (P.x - q.x) * 60, vy = (P.y - q.y) * 60;
    G.prev = { x: P.x, y: P.y };
    if (Math.hypot(vx, vy) > 160 && Math.hypot(vx, vy) < 2000) for (let k = 3; k >= 1; k--) { g.globalAlpha = 0.12 * (4 - k); blit(g, ballSprite('#2a2a34', PUCK_R, { flat: 1 }), P.x - vx * 0.012 * k - PUCK_R - 0.5, P.y - vy * 0.012 * k - PUCK_R - 0.5); }
    g.globalAlpha = 1;
    shadow(g, P.x + 1.5, P.y + 2, PUCK_R, PUCK_R * 0.8, 0.3);
    blit(g, ballSprite('#2a2a34', PUCK_R, { flat: 1 }), P.x - PUCK_R - 0.5, P.y - PUCK_R - 0.5);
    if (V.L) mallet(g, V.L, '#2a6ae8');
    if (V.R) mallet(g, V.R, '#e83a3a');
  }
  G.btns = G.mp ? buttons() : [];
  if (G.mp) { hudMatch(g); return; }
  // the score: LED digits in their panels, you and the machine
  score(g, 'YOU', G.T.us, 'CPU', G.T.them);
  if (G.o.tbl && G.watched) text(g, `${G.watched} WATCHING`, W - 8, H - 10, '#8a90b0', 1, 'r');
  if (G.msgT > 0 || G.done) banner(g, W, CY - 7, G.msg, G.done ? '#ffd23a' : '#fff');
}
function score(g, ln, ls, rn, rs) {
  const k = ln.length > 3 || rn.length > 3 ? 20 : 0;   // (wider for a player's name, up to six letters)
  panel(g, W / 2 - 62 - k, 2, 124 + 2 * k, 20, '#c8a050');
  text(g, ln.slice(0, 6), W / 2 - 56 - k, 9, '#8ac4ff'); led(g, ls, W / 2 - 40 + (k ? -8 : 0), 6, '#5ab0ff', 12);
  text(g, rn.slice(0, 6), W / 2 + 56 + k, 9, '#ffa08a', 1, 'r'); led(g, rs, W / 2 + 14 + (k ? 16 : 0), 6, '#ff5a3a', 12);
  text(g, `TO ${TO}`, W / 2, 9, '#c8a050', 1, 'c');
}
// a table's HUD: the names at their ends (yours on the left), the score, the word of the moment, the choice
function hudMatch(g) {
  const S = G.S;
  if (!S) { banner(g, W, CY - 7, 'At the table...'); return; }
  const me = Math.max(0, S.me), nm = (i) => (S.me === i ? 'YOU' : S.seats[i] ? (S.seats[i].cpu ? 'CPU' : S.seats[i].n.toUpperCase()) : '...');
  const sc = S.sc || [0, 0];
  score(g, nm(me), sc[me], nm(me ^ 1), sc[me ^ 1]);
  if (S.st === 'play' && S.me >= 0 && G.N && G.N.owd > 90) text(g, `${Math.round(G.N.owd * 2)} MS`, 8, H - 10, '#8a90b0');
  if (S.watch) text(g, `${S.watch} WATCHING`, W - 8, H - 10, '#8a90b0', 1, 'r');
  const word = S.st === 'wait' && S.me === 0 ? 'Waiting for a player - or:' : S.st === 'wait' ? 'Waiting for a player' : S.st === 'cpu' ? S.line : G.msgT > 0 || S.st === 'over' ? G.msg || S.line : '';
  if (word) banner(g, W, S.st === 'play' || S.st === 'cpu' ? T.y0 + 4 : CY - 22, word, S.st === 'over' ? '#ffd23a' : '#fff');
  G.btns.forEach((b, i) => { panel(g, b.x, b.y, b.w, b.h, i === G.sel ? '#ffd23a' : '#c8a050', i === G.sel ? 'rgba(60,40,10,.92)' : undefined); text(g, b.t, b.x + 4, b.y + 4, i === G.sel ? '#ffd23a' : '#f4f2ea'); });
}
// a mallet: its rim, the dome, the knob on top lit from the top left
function mallet(g, m, c) {
  shadow(g, m.x + 2, m.y + 3, MAL_R, MAL_R * 0.8, 0.32);
  blit(g, ballSprite(c, MAL_R, { flat: 1 }), m.x - MAL_R - 0.5, m.y - MAL_R - 0.5);
  blit(g, ballSprite(c, MAL_R - 4), m.x - MAL_R + 3.5, m.y - MAL_R + 3.5);
  blit(g, ballSprite(c, 3.5), m.x - 4.5, m.y - 4.5);
}
// (tests: the table without a screen)
export const _test = { newTable, strike, glide, cpuMove, unstick, T, TO, CY, STUCK_S };
