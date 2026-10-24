// The race book's screen (the owner's #310: server/systems/racebook.js takes the bets at Lucky Mesa's casinos): the race
// at the track out east on the casino's monitor - LUCKY MESA DOWNS - on the arcade's little screen (256 x 224), loaded the
// first time someone watches (main.js). Before the off: the runners in the paddock, the odds and the countdown; at the off
// the race itself, one lap of the oval, run here from the book's seed exactly as the server runs it (shared/racebook.js
// run); then the result, and what you won. The page asks the server where the race is now and then (the seed comes at the
// off), and draws the clock from it in between.
//   start({ n, now, post, off, next, ph, field, odds, seed, mine, last, send, close, sfx })   update(screen)   stop()
import { fitScreen } from './arcscreen.js';
import { run } from '../shared/racebook.js';

const W = 256, H = 224;
let G = null;

// a 3x5 pixel font (as the arcade's)
const FONT = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001010010', 8: '111101111101111', 9: '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '101111111111101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111',
  '-': '000000111000000', ' ': '000000000000000', ':': '000010000010000', '!': '010010010000010', '.': '000000000000010', ',': '000000000010100', "'": '010010000000000', '$': '011110010011110', '/': '001001010100100', '#': '101111101111101',
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
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH'];

// the oval: the track's middle line an ellipse round the infield, the start and finish at the foot of the home straight;
// d (0..1, how far round) and a lane (0 the rail .. 1 the outside) to a point on it - anticlockwise, as the screen sees it
const CX = 128, CY = 84, RX = 104, RY = 48, TW = 14;
function onTrack(d, lane) {
  const a = Math.PI / 2 - d * Math.PI * 2, rx = RX - TW / 2 + lane * TW, ry = RY - TW / 2 + lane * TW;
  return { x: CX + Math.cos(a) * rx, y: CY + Math.sin(a) * ry, dx: Math.sin(a), dy: -Math.cos(a) };
}

export function start(o) {
  stop();
  const cv = document.getElementById('arc-cv'), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  G = { o, cv, g, S: null, res: null, resN: -1, at: performance.now(), lastAsk: 0, said: '', lead: -1, sounds: new Set() };
  update(o);
  const tick = (now) => {
    if (!G) return;
    G.raf = requestAnimationFrame(tick);
    // ask where the race is: often round the off (the seed comes then), now and then otherwise
    const t = G.S ? G.S.now + (now - G.at) / 1000 : 0, near = G.S && !G.S.seed && t > G.S.off - 1;
    if (now - G.lastAsk > (near ? 700 : 4000)) { G.lastAsk = now; G.o.send({ t: 'racebook' }); }
    draw(t);
  };
  G.raf = requestAnimationFrame(tick);
}
export function update(s) {
  if (!G || !s || s.n === undefined) return;
  G.S = s; G.at = performance.now();
  if (s.seed && G.resN !== s.n) { G.res = run(s.field, s.seed); G.resN = s.n; G.lead = -1; }
  if (!s.seed && G.resN !== s.n) G.res = null;
}
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  G = null;
}

// ---- the picture ----------------------------------------------------------------------------------------------------
function horse(g, x, y, dx, silk, frame) {
  const L = dx < 0, px = (i) => (L ? x + 3 - i : x - 3 + i) | 0, yy = y | 0;
  g.fillStyle = '#6a3a1e';
  g.fillRect(px(0), yy - 2, 1, 1);                         // (the tail)
  for (let i = 1; i <= 5; i++) g.fillRect(px(i), yy - 2, 1, 2);   // (the body)
  g.fillRect(px(6), yy - 4, 1, 3); g.fillRect(px(7), yy - 4, 1, 1);   // (the neck, the head)
  g.fillStyle = '#3a2010';
  const f = frame & 1;
  g.fillRect(px(1 + f), yy, 1, 1); g.fillRect(px(5 - f), yy, 1, 1);   // (the legs in stride)
  g.fillStyle = silk[0]; g.fillRect(px(3), yy - 4, 2, 2);   // (the jockey's silks)
  g.fillStyle = silk[1]; g.fillRect(px(4), yy - 5, 1, 1);   // (the cap)
}
// a line in the infield, over the pond: what you won, the last race's winner
function infield(g, s, c) {
  const w = textW(s) + 6;
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(W / 2 - w / 2, CY - 22, w, 11);
  text(g, s, W / 2 - textW(s) / 2, CY - 19, c);
}
function draw(t) {
  const g = G.g, S = G.S;
  fitScreen(G.cv, g, W, H);   // (drawn at the size it's shown: sharp)
  g.fillStyle = '#0b1a10'; g.fillRect(0, 0, W, H);
  if (!S) { text(g, 'LOADING THE CARD...', W / 2 - textW('LOADING THE CARD...') / 2, 100, '#aab'); return; }
  const off = t - S.off, R = G.res, running = R && off >= 0;
  // the header: the track, the race, where it stands
  text(g, 'LUCKY MESA DOWNS', 6, 4, '#ffd23a');
  text(g, `RACE ${S.n % 1000}`, W - 6 - textW(`RACE ${S.n % 1000}`), 4, '#fff');
  // the oval: the infield, the dirt, the rails, the finish post
  g.fillStyle = '#2f6a2a'; g.beginPath(); g.ellipse(CX, CY, RX + TW / 2 + 3, RY + TW / 2 + 3, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a6a44'; g.beginPath(); g.ellipse(CX, CY, RX + TW / 2, RY + TW / 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3f8a3a'; g.beginPath(); g.ellipse(CX, CY, RX - TW / 2, RY - TW / 2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#f2f2f2'; g.lineWidth = 1;
  for (const r of [0, TW]) { g.beginPath(); g.ellipse(CX, CY, RX - TW / 2 + r, RY - TW / 2 + r, 0, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#5aa04a'; g.fillRect(CX - 40, CY - 4, 60, 14);   // (the infield's turf course and its pond)
  g.fillStyle = '#3a6aa8'; g.beginPath(); g.ellipse(CX + 32, CY + 6, 16, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8262b'; g.fillRect(CX - 1, CY + RY - TW / 2 - 2, 2, TW + 4);   // (the post)
  // the runners: in the gate (before the off) or round the track
  const N = S.field.length;
  const order = running ? S.field.map((_, i) => i).sort((a, b) => R.at(b, off) - R.at(a, off)) : S.field.map((_, i) => i);
  for (let i = N - 1; i >= 0; i--) {
    const d = running ? R.at(i, off) : 0, lane = (i + 0.5) / N, p = onTrack(d, lane), moving = running && d < 1;
    horse(g, p.x, p.y, p.dx, S.field[i].silk, moving ? Math.floor(t * 10 + i) : 0);
  }
  // the board: each runner, its odds, where it's running (or finished); yours starred
  const y0 = 150, mine = new Set((S.mine || []).map((b) => b.h));
  for (let i = 0; i < N; i++) {
    const y = y0 + i * 9, h = S.field[i];
    g.fillStyle = h.silk[0]; g.fillRect(6, y, 5, 5); g.fillStyle = h.silk[1]; g.fillRect(8, y, 2, 2);
    text(g, `${i + 1} ${h.name}`, 14, y, mine.has(i) ? '#ffd23a' : '#e8e8e8');
    text(g, S.odds[i] || '', 150, y, '#8ad8ff');
    if (running) { const k = order.indexOf(i), done = R.at(i, off) >= 1; text(g, done ? ORD[R.order.indexOf(i)] : ORD[k], 196, y, k === 0 ? '#ffd23a' : '#aab'); }
    if (mine.has(i)) text(g, '*', 240, y, '#ffd23a');
  }
  // the call
  let call;
  if (!running) call = S.seed === null && t < S.off ? `BETTING OPEN - OFF IN ${clock(S.off - t)}` : 'THEY ARE AT THE GATE...';
  else {
    const lead = order[0], fin = R.order.filter((i) => R.at(i, off) >= 1);
    if (fin.length === N) {
      call = `${S.field[R.order[0]].name} WINS IT!`;
      const won = (S.mine || []).filter((b) => b.h === R.order[0]).reduce((s, b) => s + b.ret, 0);
      const say = won ? `YOU COLLECT $${won.toLocaleString('en-US')}` : (S.mine || []).length ? 'NOT YOUR DAY' : `NEXT RACE IN ${clock(S.next - t)}`;
      infield(g, say, won ? '#7fe07f' : '#e8e8e8');
      if (won && !G.sounds.has('won' + S.n)) { G.sounds.add('won' + S.n); G.o.sfx && G.o.sfx('cashin', 0.6); }
    } else if (fin.length) call = `${S.field[fin[0]].name} FIRST PAST THE POST!`;
    else if (off < 2) call = 'AND THEY ARE OFF!';
    else if (R.at(lead, off) > 0.8) call = `INTO THE STRAIGHT - ${S.field[lead].name}!`;
    else call = `${S.field[lead].name} LEADS`;
    if (off < 0.5 && !G.sounds.has('off' + S.n)) { G.sounds.add('off' + S.n); G.o.sfx && G.o.sfx('ridebell', 0.6); }
  }
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 210, W, 14);
  text(g, call, W / 2 - textW(call) / 2, 214, '#fff');
  if (!running && S.last) infield(g, `LAST RACE: ${S.last[0]}`, '#e8e8e8');
}
// (tests: the oval's geometry)
export const _test = { onTrack };
