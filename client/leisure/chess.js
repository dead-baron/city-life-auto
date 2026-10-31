// The chess board at the park's tables (server/systems/chess.js plays every move; the rules: shared/chess.js), on the
// arcade's overlay (main.js: its keys are the game's; Esc / B gets you up - a game against another player in progress
// is resigned) laid low over the city, so you still see the table and who's sat at it. Loaded the first time you sit.
//   - Tap (click) one of your pieces: its moves show (a dot, a ring round a capture); tap where it goes. A pawn on the
//     last rank asks what it becomes. Keys: the arrows (WASD) move the cursor, Enter / Space picks; the pad: the d-pad
//     and A (shared/controls.js CHESS_KEYS).
//   - The last move, check and the result are on the board; the bar over it says whose move it is and who's playing.
//   - The buttons under it: Resign (twice to be sure), Draw (offer one, or take one offered), Play the regular (while
//     you wait for someone), Rematch (after a game, colours swapped).
//   start(o) / stop() / update(state) (main.js)
import { fromWire, legal, QUEEN, ROOK, BISHOP, KNIGHT, colorOf, typeOf } from '../../shared/chess.js';
import { CHESS_KEYS } from '../../shared/controls.js';
import { fitScreen } from '../arcscreen.js';

const W = 184, H = 250, SQ = 22, BX = 4, BY = 30;
const LIGHT = '#e8d2a8', DARK = '#a0703f', FRAME = '#4a2e18';
// the pieces, 11 x 11 pixels each, drawn at 2 px a pixel
const ART = {
  1: ['...........', '....xxx....', '...xxxxx...', '...xxxxx...', '....xxx....', '....xxx....', '...xxxxx...', '..xxxxxxx..', '..xxxxxxx..', '.xxxxxxxxx.', '...........'],
  2: ['...........', '....xx.....', '...xxxxx...', '..xxxxxxx..', '.xxxx.xxxx.', '.xx..xxxxx.', '.....xxxxx.', '....xxxxx..', '...xxxxxx..', '..xxxxxxxx.', '...........'],
  3: ['.....x.....', '....xxx....', '...xx.xx...', '...x.xxx...', '...xxxxx...', '....xxx....', '....xxx....', '...xxxxx...', '..xxxxxxx..', '.xxxxxxxxx.', '...........'],
  4: ['...........', '.xx.xxx.xx.', '.xxxxxxxxx.', '..xxxxxxx..', '...xxxxx...', '...xxxxx...', '...xxxxx...', '...xxxxx...', '..xxxxxxx..', '.xxxxxxxxx.', '...........'],
  5: ['.x...x...x.', '.x..xxx..x.', '.xx.xxx.xx.', '.xxxxxxxxx.', '..xxxxxxx..', '...xxxxx...', '...xxxxx...', '...xxxxx...', '..xxxxxxx..', '.xxxxxxxxx.', '...........'],
  6: ['.....x.....', '....xxx....', '.....x.....', '..xxxxxxx..', '.xxxxxxxxx.', '.xxxxxxxxx.', '..xxxxxxx..', '...xxxxx...', '..xxxxxxx..', '.xxxxxxxxx.', '...........'],
};
const PIECE_COL = [{ body: '#f6eedc', hi: '#ffffff', line: '#2a1e14' }, { body: '#2e2c34', hi: '#5c5866', line: '#0c0a10' }];
let G = null;

function css() {
  if (document.getElementById('chess-css')) return;
  const st = document.createElement('style');
  st.id = 'chess-css';
  st.textContent = '#arcade.chess{background:transparent;align-items:flex-end;justify-content:center;pointer-events:none}#arcade.chess .arc-frame{pointer-events:auto;background:rgba(10,14,28,.86);margin-bottom:1.2vh;padding:6px 8px;gap:3px;box-shadow:0 0 0 2px var(--gold,#e2bd57)}'
    + '#arcade.chess #arc-cv{height:min(46vh,560px);width:auto;aspect-ratio:184/250;background:transparent;touch-action:none}#arcade.chess #arc-hint{max-width:min(92vw,420px);text-align:center;font-size:12px;line-height:1.3}'
    + '@media (orientation:landscape){#arcade.chess{justify-content:flex-end}#arcade.chess .arc-frame{margin:0 2vw 1.5vh 0}#arcade.chess #arc-cv{height:min(80vh,620px)}#arcade.chess #arc-hint{max-width:min(36vw,300px)}}';
  document.head.appendChild(st);
}

export function start(o) {
  stop();
  css();
  const ov = document.getElementById('arcade'), cv = document.getElementById('arc-cv'), hint = document.getElementById('arc-hint');
  ov.classList.add('chess');
  G = { o, ov, cv, g: cv.getContext('2d'), hint, hint0: hint ? hint.textContent : '', st: null, pos: null, moves: [], sel: -1, cur: 52, promo: null, sure: 0, padPrev: new Set(), btns: [] };
  if (hint) hint.textContent = 'Tap a piece, then where it goes. Esc / B gets up from the table (resigns a game against a player).';
  G.onKey = (e) => {
    if (e.repeat || !G) return;
    const k = e.code, K = CHESS_KEYS;
    if (K.up.includes(k)) cursor(0, 1); else if (K.down.includes(k)) cursor(0, -1); else if (K.left.includes(k)) cursor(-1, 0); else if (K.right.includes(k)) cursor(1, 0);
    else if (K.pick.includes(k)) pick(G.cur);
    else if (k === K.resign) button('resign'); else if (k === K.draw) button('draw'); else if (k === K.next) button(G.st && G.st.st === 'over' ? 'again' : 'npc');
  };
  G.onPtr = (e) => {
    if (e.type !== 'pointerdown' || !G) return;
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (G.promo) { const i = Math.floor((x - BX - SQ * 2) / SQ); if (y > BY + SQ * 3.5 && y < BY + SQ * 4.5 && i >= 0 && i < 4) choosePromo(i); else G.promo = null; return; }
    for (const b of G.btns) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { button(b.id); return; }
    const sq = squareAt(x, y);
    if (sq >= 0) { G.cur = sq; pick(sq); }
  };
  addEventListener('keydown', G.onKey);
  cv.addEventListener('pointerdown', G.onPtr);
  o.send({ t: 'chess', a: 'state' });
  const tick = () => { if (!G) return; G.raf = requestAnimationFrame(tick); poll(); draw(); };
  G.raf = requestAnimationFrame(tick);
}
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  removeEventListener('keydown', G.onKey);
  G.cv.removeEventListener('pointerdown', G.onPtr);
  G.ov.classList.remove('chess');
  if (G.hint) G.hint.textContent = G.hint0;
  G.o.send({ t: 'chess', a: 'leave' });
  G = null;
}
// the server's word: the board as it stands
export function update(m) {
  if (!G) return;
  G.st = m; G.pos = fromWire(m); G.sel = -1; G.promo = null;
  G.moves = m.st === 'play' && m.w === m.me ? legal(G.pos) : [];
  if (G.sure && m.st !== 'play') G.sure = 0;
}

// ---- input ----------------------------------------------------------------------------------------------------------
const flip = () => !!(G.st && G.st.me === 1);
function squareAt(x, y) {
  const f = Math.floor((x - BX) / SQ), r = 7 - Math.floor((y - BY) / SQ);
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return flip() ? (7 - r) * 8 + (7 - f) : r * 8 + f;
}
function sqXY(sq) { let f = sq & 7, r = sq >> 3; if (flip()) { f = 7 - f; r = 7 - r; } return [BX + f * SQ, BY + (7 - r) * SQ]; }
function cursor(df, dr) { if (flip()) { df = -df; dr = -dr; } const f = Math.max(0, Math.min(7, (G.cur & 7) + df)), r = Math.max(0, Math.min(7, (G.cur >> 3) + dr)); G.cur = r * 8 + f; }
function pick(sq) {
  if (!G.st || G.promo) { if (G.promo) choosePromo(0); return; }
  const mine = G.moves.filter((m) => m.f === sq);
  if (G.sel >= 0) {
    const to = G.moves.filter((m) => m.f === G.sel && m.t === sq);
    if (to.length) { if (to.some((m) => m.p)) { G.promo = { f: G.sel, t: sq }; return; } send(G.sel, sq, 0); return; }
  }
  G.sel = mine.length ? sq : -1;
}
const PROMOS = [QUEEN, ROOK, BISHOP, KNIGHT];
function choosePromo(i) { const P = G.promo; G.promo = null; if (P) send(P.f, P.t, PROMOS[i]); }
function send(f, t, p) { G.o.send({ t: 'chess', a: 'move', f, to: t, p }); G.sel = -1; G.last = [f, t]; G.moves = []; if (G.o.sfx) G.o.sfx('click', 0.5); }
function button(id) {
  const s = G.st;
  if (!s) return;
  if (id === 'resign') { if (s.st !== 'play') return; if (!G.sure) { G.sure = performance.now(); return; } G.sure = 0; G.o.send({ t: 'chess', a: 'resign' }); return; }
  if (id === 'draw' && s.st === 'play') G.o.send({ t: 'chess', a: 'draw' });
  if (id === 'npc' && s.st === 'wait') G.o.send({ t: 'chess', a: 'npc' });
  if (id === 'again' && s.st === 'over') G.o.send({ t: 'chess', a: 'again' });
  if (id === 'leave') G.o.close();
}
function poll() {
  const now = new Set();
  for (const p of navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []) p.buttons.forEach((b, i) => { if (b && b.pressed) now.add(i); });
  const tap = (i) => now.has(i) && !G.padPrev.has(i);
  const P = CHESS_KEYS.pad;
  if (tap(P.up)) cursor(0, 1); if (tap(P.down)) cursor(0, -1); if (tap(P.left)) cursor(-1, 0); if (tap(P.right)) cursor(1, 0);
  if (tap(P.pick)) pick(G.cur);
  if (tap(P.draw)) button('draw');
  if (tap(P.resign)) button('resign');
  if (tap(P.next)) button(G.st && G.st.st === 'over' ? 'again' : 'npc');
  G.padPrev = now;
  if (G.sure && performance.now() - G.sure > 3000) G.sure = 0;
}

// ---- the picture ----------------------------------------------------------------------------------------------------
function piece(g, x, y, pc) {
  const art = ART[typeOf(pc)], C = PIECE_COL[colorOf(pc)];
  g.fillStyle = C.line;
  for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) if (art[r][c] === 'x') g.fillRect(x + c * 2 - 1, y + r * 2 - 1, 4, 4);
  for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) if (art[r][c] === 'x') { g.fillStyle = c > 0 && art[r][c - 1] !== 'x' ? C.hi : C.body; g.fillRect(x + c * 2, y + r * 2, 2, 2); }
}
function text(g, s, x, y, col = '#f3ead2', size = 9, align = 'left', bold = true) {
  g.font = `${bold ? '700' : '400'} ${size}px "CLA Pixel", "Barlow Condensed", monospace`; g.textAlign = align; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s, x + 1, y + 1); g.fillStyle = col; g.fillText(s, x, y);
}
function draw() {
  const g = G.g, s = G.st;
  fitScreen(G.cv, g, W, H);
  g.clearRect(0, 0, W, H);
  // the bar over the board: who's playing whom, whose move
  if (s) {
    const yours = s.st === 'play' && s.w === s.me;
    const line = s.st === 'wait' ? (s.come ? 'The park regular is on his way...' : 'Waiting for an opponent') : s.st === 'over' ? (s.res || 'Game over') : yours ? (s.chk ? 'Check! Your move' : 'Your move') : `${s.names[s.w]} is thinking${s.chk ? ' (check)' : ''}...`;
    text(g, `${s.names[0] || '?'} (W) v ${s.names[1] || '...'} (B)`, W / 2, 8, '#a6aec4', 8, 'center', false);
    text(g, line, W / 2, 20, s.st === 'over' ? '#e2bd57' : yours ? '#6cd06c' : '#f3ead2', 10, 'center');
  } else text(g, 'Sitting down...', W / 2, 14, '#f3ead2', 10, 'center');
  // the board
  g.fillStyle = FRAME; g.fillRect(BX - 3, BY - 3, SQ * 8 + 6, SQ * 8 + 6);
  for (let sq = 0; sq < 64; sq++) { const [x, y] = sqXY(sq); g.fillStyle = ((sq & 7) + (sq >> 3)) & 1 ? LIGHT : DARK; g.fillRect(x, y, SQ, SQ); }
  if (s && s.last) for (const sq of s.last) { const [x, y] = sqXY(sq); g.fillStyle = 'rgba(255,214,70,.38)'; g.fillRect(x, y, SQ, SQ); }
  if (s && s.chk && G.pos) { const [x, y] = sqXY(G.pos.k[s.w]); const gr = g.createRadialGradient(x + SQ / 2, y + SQ / 2, 2, x + SQ / 2, y + SQ / 2, SQ * 0.7); gr.addColorStop(0, 'rgba(255,40,30,.85)'); gr.addColorStop(1, 'rgba(255,40,30,0)'); g.fillStyle = gr; g.fillRect(x, y, SQ, SQ); }
  if (G.sel >= 0) { const [x, y] = sqXY(G.sel); g.fillStyle = 'rgba(90,176,255,.5)'; g.fillRect(x, y, SQ, SQ); }
  // the rank and file letters
  for (let i = 0; i < 8; i++) {
    const f = flip() ? 7 - i : i, r = flip() ? i : 7 - i;
    text(g, 'abcdefgh'[f], BX + i * SQ + SQ - 3, BY + SQ * 8 - 3, i & 1 ? '#7a5030' : '#f0dcb4', 6, 'center', false);
    text(g, String(r + 1), BX + 3, BY + i * SQ + 4, i & 1 ? '#7a5030' : '#f0dcb4', 6, 'center', false);
  }
  if (G.pos) for (let sq = 0; sq < 64; sq++) { const pc = G.pos.b[sq]; if (pc) { const [x, y] = sqXY(sq); piece(g, x, y, pc); } }
  // where the picked piece can go
  if (G.sel >= 0) for (const m of G.moves) if (m.f === G.sel) {
    const [x, y] = sqXY(m.t);
    if (m.x) { g.strokeStyle = 'rgba(20,20,20,.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, SQ - 2, SQ - 2); }
    else { g.fillStyle = 'rgba(20,20,20,.38)'; g.beginPath(); g.arc(x + SQ / 2, y + SQ / 2, 3.5, 0, 6.283); g.fill(); }
  }
  { const [x, y] = sqXY(G.cur); g.strokeStyle = '#5ab0ff'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, SQ - 1, SQ - 1); }
  // a pawn on the last rank: what it becomes
  if (G.promo && G.pos) {
    g.fillStyle = 'rgba(7,11,22,.85)'; g.fillRect(BX + SQ * 2 - 4, BY + SQ * 3.5 - 14, SQ * 4 + 8, SQ + 18);
    text(g, 'Promote to', BX + SQ * 4, BY + SQ * 3.5 - 7, '#e2bd57', 8, 'center');
    PROMOS.forEach((p, i) => { const x = BX + SQ * (2 + i), y = BY + SQ * 3.5; g.fillStyle = i & 1 ? DARK : LIGHT; g.fillRect(x, y, SQ, SQ); piece(g, x, y, p + (s.me ? 8 : 0)); });
  }
  // the buttons, and the last few moves
  const by = BY + SQ * 8 + 6, bh = 18;
  G.btns = [];
  const btn = (id, label, x, w, on = true, hot = false) => {
    G.btns.push({ id, x, y: by, w, h: bh });
    g.fillStyle = !on ? 'rgba(34,50,94,.5)' : hot ? '#e2bd57' : '#172447'; g.fillRect(x, by, w, bh);
    g.strokeStyle = on ? '#e2bd57' : 'rgba(226,189,87,.35)'; g.lineWidth = 1; g.strokeRect(x + 0.5, by + 0.5, w - 1, bh - 1);
    text(g, label, x + w / 2, by + bh / 2 + 1, hot ? '#070b16' : on ? '#f3ead2' : '#6a7290', 8, 'center');
  };
  if (s && s.st === 'play') {
    btn('resign', G.sure ? 'Sure?' : 'Resign', BX, 56, true, !!G.sure);
    btn('draw', s.offer === (s.me ^ 1) ? 'Take draw' : s.offer === s.me ? 'Offered' : 'Draw', BX + 60, 56, s.offer !== s.me, s.offer === (s.me ^ 1));
    btn('leave', 'Get up', BX + 120, 56);
  } else if (s && s.st === 'wait') {
    btn('npc', s.come ? 'Coming...' : 'Play the regular', BX, 116, !s.come, !s.come);
    btn('leave', 'Get up', BX + 120, 56);
  } else if (s && s.st === 'over') {
    btn('again', 'Rematch', BX, 116, true, true);
    btn('leave', 'Get up', BX + 120, 56);
  }
  if (s && s.sans && s.sans.length) {
    const ply0 = s.ply - s.sans.length, out = [];
    for (let i = Math.max(0, s.sans.length - 6); i < s.sans.length; i++) { const ply = ply0 + i; out.push((ply % 2 === 0 ? `${(ply >> 1) + 1}.` : '') + s.sans[i]); }
    text(g, out.join(' '), W / 2, by + bh + 9, '#a6aec4', 8, 'center', false);
  }
}
