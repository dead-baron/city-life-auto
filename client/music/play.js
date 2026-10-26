// The music games, on the arcade's screen (main.js: the 'arcade' overlay - its keys are the game's, Esc / B leaves - and
// the server's { t: 'arcade', game: 'rhythm' | 'jam' }); laid over the bottom of the city so you see the crowd you're
// playing to. Loaded the first time you perform.
//   - the rhythm game (your mat): the notes fall down four lanes to the line on the song's beats (shared/music.js chart,
//     from the server's seed - the same chart it judges by); hit each as it crosses the line - the arrows or D F J K, the
//     d-pad (or X A Y RB), a tap on its lane (shared/controls.js MUSIC_KEYS). Each hit goes to the server with how far
//     off it was by this page's clock (server/systems/music.js judges it, in time or not); the grades, the combo and the
//     hype meter show at once, the set's result comes back from the server.
//   - the jam (an instrument out of the bag): eight pads play its notes (A-K, the d-pad and X A Y RB, or tap them), the
//     chord held for a chord (Shift, LT, the CHORD pad) - you hear them at once (client/sound/stage.js playNotes), the
//     server sends them to everyone near. GIG starts the rhythm game on the instrument to a backing track (the street
//     beat or a tape of yours): each hit a note.
//   start(o) / stop() (main.js), server(ev) (client/music/stage.js: the set's result, a gig's set starting)
import { chart, judge, newTally, tally, accuracy, jamNotes, TRACK, BEAT_TRACK, GRADE_NAMES, LANES, PADS, mood } from '../../shared/music.js';
import { RHYTHM } from '../../shared/rules-music.js';
import { MUSIC_KEYS, KB, PAD } from '../../shared/controls.js';
import { current as stageNow } from './stage.js';
import * as stageMod from './stage.js';

// two screens: the lanes upright at the right of the city (the dancer and the crowd stay in view), the jam's pads low
const LAYOUT = { lanes: [200, 240], jam: [320, 150] }, LANE_W = 34, LINE_Y = 206, LANE_X0 = 12;
let W = 320, H = 150;
const LANE_COL = ['#ff5ac8', '#5ae8ff', '#7aff7a', '#ffd24a'], ARROW = ['←', '↓', '↑', '→'];
const PAD_KEYS = 'ASDFGHJK', LANE_PAD = [0, 2, 4, 6];
let G = null, SND = null;
import('../sound/stage.js').then((m) => { SND = m; }).catch(() => {});
const stage = () => stageMod.current || stageNow;

function css() {
  if (document.getElementById('mus-css')) return;
  const st = document.createElement('style');
  st.id = 'mus-css';
  st.textContent = '#arcade.mus{background:transparent;align-items:flex-end;pointer-events:auto}#arcade.mus .arc-frame{background:rgba(10,8,24,.74);margin-bottom:1.5vh;padding:8px 10px;gap:4px;max-width:96vw}#arcade.mus #arc-cv{width:min(94vw,calc(34vh*320/150),640px);height:auto;aspect-ratio:320/150;background:transparent}'
    + '#arcade.mus.lanes{justify-content:flex-end}#arcade.mus.lanes .arc-frame{margin:0 3vw 2vh 0}#arcade.mus.lanes #arc-cv{width:auto;height:min(58vh,520px);aspect-ratio:200/240}#arcade.mus #arc-hint{max-width:min(94vw,640px);text-align:center;line-height:1.3}#arcade.mus.lanes #arc-hint{max-width:min(40vw,320px)}@media (max-height:500px){#arcade.mus.lanes #arc-cv{height:74vh}#arcade.mus #arc-cv{width:min(70vw,calc(52vh*320/150))}#arcade.mus #arc-hint{font-size:9px}}';
  document.head.appendChild(st);
}

export function start(o) {
  stop();
  css();
  const ov = document.getElementById('arcade'), cv = document.getElementById('arc-cv'), hint = document.getElementById('arc-hint');
  ov.classList.add('mus');
  G = { o, ov, cv, g: cv.getContext('2d'), hint, hint0: hint ? hint.textContent : '', keys: new Set(), padPrev: new Set(), mode: o.game === 'jam' ? 'jam' : 'rhythm', inst: o.inst || null, key: o.key ?? 57, minor: o.minor ?? true, chordOn: false, pick: -1, picks: [BEAT_TRACK, ...(o.tapes || [])], set: null, res: null, flash: [], lastPad: -1, padAt: 0 };
  const S = stage();
  if (S) { S.play = api; if (o.now !== undefined) S.clock(o.now, o.tk); }
  if (G.mode === 'rhythm') beginSet(o.track, o.seed, o.t0, o.setS || RHYTHM.setS);
  G.onKey = (e) => {
    if (e.type === 'keyup') { G.keys.delete(e.code); if (e.key === 'Shift') G.chordOn = false; return; }
    if (e.repeat) return;
    G.keys.add(e.code);
    if (e.key === 'Shift') G.chordOn = true;
    press({ code: e.code });
  };
  G.onPtr = (e) => { if (e.type !== 'pointerdown') return; const r = cv.getBoundingClientRect(); press({ x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }); };
  addEventListener('keydown', G.onKey); addEventListener('keyup', G.onKey);
  cv.addEventListener('pointerdown', G.onPtr);
  const tick = () => { if (!G) return; G.raf = requestAnimationFrame(tick); poll(); step(); draw(); };
  G.raf = requestAnimationFrame(tick);
}
export function stop() {
  if (!G) return;
  cancelAnimationFrame(G.raf);
  removeEventListener('keydown', G.onKey); removeEventListener('keyup', G.onKey);
  G.cv.removeEventListener('pointerdown', G.onPtr);
  G.ov.classList.remove('mus', 'lanes');
  if (G.hint) G.hint.textContent = G.hint0;
  G.o.send({ t: 'mus', a: 'stop' });
  const S = stage(); if (S && S.play === api) S.play = null;
  G = null;
}
const api = { server(ev) { if (!G) return; if (ev.go) { G.mode = 'gig'; G.key = ev.go.key; G.minor = ev.go.minor; beginSet(ev.go.track, ev.go.seed, ev.go.t0, ev.go.setS); } if (ev.res) { G.res = ev.res; if (G.mode === 'gig') { G.mode = 'jam'; G.set = null; G.key = 57; G.minor = true; } } } };
export const server = (ev) => api.server(ev);
export const _state = () => G;   // (tests and the capture scripts)

// ---- the set ---------------------------------------------------------------------------------------------------
function beginSet(track, seed, t0, setS) {
  G.set = { track, seed, t0, setS, notes: chart(track, seed, setS).map((n) => ({ ...n, g: -1 })), T: newTally(), pop: null };
  G.res = null;
}
const songNow = () => { const S = stage(); return (S ? S.now() : performance.now() / 1000) - G.set.t0; };
function hitLane(lane) {
  const st = G.set;
  if (!st) return;
  const ts = songNow(), win = RHYTHM.goodMs / 1000 * 1.6;
  let best = -1, bd = win;
  st.notes.forEach((n, i) => { if (n.lane === lane && n.g < 0 && Math.abs(n.t - ts) < bd) { bd = Math.abs(n.t - ts); best = i; } });
  G.flash[lane] = performance.now();
  if (best < 0) return;
  const n = st.notes[best], off = Math.round((ts - n.t) * 1000);
  n.g = judge(off);
  tally(st.T, n.g);
  st.pop = { g: n.g, at: performance.now(), lane };
  G.o.send({ t: 'mus', a: 'hit', i: best, o: off });
  if (G.mode === 'gig' && n.g < 3) sound(jamNotes(G.inst, LANE_PAD[lane] + (st.T.combo >= 20 ? 1 : 0), st.T.combo >= 10 && st.T.combo % 4 === 0, G.key, G.minor));
}
function step() {
  const st = G.set;
  if (!st) return;
  const ts = songNow();
  for (const n of st.notes) if (n.g < 0 && ts - n.t > RHYTHM.goodMs / 1000 * 1.6) { n.g = 3; tally(st.T, 3); st.pop = { g: 3, at: performance.now(), lane: n.lane }; }
  if (ts > st.setS + 1 && !G.res) G.res = { score: st.T.score, acc: accuracy(st.T), best: st.T.best, grades: st.T.grades, local: true };
}
function sound(notes) { if (SND && SND.live && G.inst) SND.live.playNotes(G.inst, notes); }
function playPad(i) {
  if (G.mode !== 'jam' || !G.inst) return;
  const chord = G.chordOn || G.padChord || G.keys.has('ShiftLeft') || G.keys.has('ShiftRight');
  sound(jamNotes(G.inst, i, chord, G.key, G.minor));
  G.o.send({ t: 'mus', a: 'note', p: i, c: chord ? 1 : 0 });
  G.lastPad = i; G.padAt = performance.now();
}
// a key, a button or a tap: what it does in this mode
function press(q) {
  if (G.mode === 'rhythm' || G.mode === 'gig') {
    if (q.code) { const l = MUSIC_KEYS.lanes.findIndex((ks) => ks.includes(q.code)); if (l >= 0) hitLane(l); return; }
    if (q.pad !== undefined) { const l = MUSIC_KEYS.padLanes.findIndex((bs) => bs.includes(q.pad)); if (l >= 0) hitLane(l); return; }
    if (q.x !== undefined) { const l = Math.floor((q.x - LANE_X0) / LANE_W); if (l >= 0 && l < LANES) hitLane(l); else if (q.x < LANE_X0) hitLane(0); else hitLane(LANES - 1); }
    return;
  }
  // the jam: the gig's track picker open, else the pads
  if (G.pick >= 0) {
    const n = G.picks.length;
    if (q.code === 'ArrowUp' || q.code === 'KeyW' || q.pad === 12) G.pick = (G.pick + n - 1) % n;
    else if (q.code === 'ArrowDown' || q.code === 'KeyS' || q.pad === 13) G.pick = (G.pick + 1) % n;
    else if (q.code === 'Enter' || q.code === 'Space' || q.pad === 0 || q.pad === 2) { G.o.send({ t: 'mus', a: 'gig', track: G.picks[G.pick] }); G.pick = -1; }
    else if (q.code === 'Escape' || q.pad === 3) G.pick = -1;
    else if (q.x !== undefined) { const i = Math.floor((q.y - 22) / Math.min(14, 116 / n)); if (i >= 0 && i < n) { G.o.send({ t: 'mus', a: 'gig', track: G.picks[i] }); G.pick = -1; } else G.pick = -1; }
    return;
  }
  if (q.code === 'Enter' || (q.x !== undefined && q.x > W - 70 && q.y < 24)) { G.pick = 0; return; }
  if (q.x !== undefined && q.x < 70 && q.y < 24) { G.chordOn = !G.chordOn; return; }
  if (q.code) { const i = MUSIC_KEYS.pads.indexOf(q.code); if (i >= 0) playPad(i); return; }
  if (q.pad !== undefined) { const i = MUSIC_KEYS.padPads.indexOf(q.pad); if (i >= 0) playPad(i); return; }
  if (q.x !== undefined) { const c = Math.floor((q.x - 40) / 60), r = q.y > 86 ? 1 : q.y > 26 ? 0 : -1; if (c >= 0 && c < 4 && r >= 0) playPad(r * 4 + c); }
}
// the pad: buttons as they go down; the chord held on LT; RB / the view button opens the gig picker in the jam
function poll() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const now = new Set();
  let lt = false;
  for (const p of pads) {
    p.buttons.forEach((b, i) => { if (b && b.pressed) now.add(i); });
    if (p.buttons[MUSIC_KEYS.padChord] && p.buttons[MUSIC_KEYS.padChord].value > 0.4) lt = true;
  }
  for (const i of now) if (!G.padPrev.has(i)) { if (G.mode === 'jam' && i === 8 && G.pick < 0) G.pick = 0; else press({ pad: i }); }
  G.padPrev = now;
  G.padChord = lt;
}

// ---- drawing ------------------------------------------------------------------------------------------------------
function draw() {
  const lanes = !!G.set && G.mode !== 'jam';
  [W, H] = LAYOUT[lanes ? 'lanes' : 'jam'];
  G.ov.classList.toggle('lanes', lanes);
  const hint = lanes ? `${KB.lanes} · ${PAD.lanes[0]} · tap the lanes · Esc / B: stop` : `${KB.pads} or tap: play · ${KB.chord} / ${PAD.chord[0]}: chord · ENTER / VIEW: gig · Esc / B: put it away`;
  if (G.hint && G.hint.textContent !== hint) G.hint.textContent = hint;
  const { cv, g } = G, dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
  const k = Math.max(1, Math.min(4, (r.width * dpr) / W)), bw = Math.round(W * k), bh = Math.round(H * k);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  g.setTransform(k, 0, 0, k, 0, 0);
  g.clearRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (G.set && (G.mode === 'rhythm' || G.mode === 'gig')) drawSet(g);
  else drawJam(g);
  if (G.res) drawResult(g);
}
function txt(g, s, x, y, size, col, align = 'center') { g.font = `bold ${size}px monospace`; g.textAlign = align; g.fillStyle = 'rgba(0,0,0,.6)'; g.fillText(s, x + 1, y + 1); g.fillStyle = col; g.fillText(s, x, y); }
function drawSet(g) {
  const st = G.set, ts = songNow(), now = performance.now();
  // the lanes, their line, the arrows at it (lit when pressed)
  for (let l = 0; l < LANES; l++) {
    const x = LANE_X0 + l * LANE_W;
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 1, 0, LANE_W - 2, H);
    const lit = now - (G.flash[l] || 0) < 120;
    g.fillStyle = lit ? LANE_COL[l] : 'rgba(255,255,255,.18)'; g.fillRect(x + 2, LINE_Y - 1, LANE_W - 4, 3);
    txt(g, ARROW[l], x + LANE_W / 2, LINE_Y + 14, 14, lit ? '#fff' : LANE_COL[l]);
  }
  // the notes coming down
  for (const n of st.notes) {
    const dt = n.t - ts;
    if (dt > RHYTHM.leadS || dt < -0.25 || n.g === 0 || n.g === 1 || n.g === 2) continue;
    const y = LINE_Y - (dt / RHYTHM.leadS) * (LINE_Y - 4), x = LANE_X0 + n.lane * LANE_W;
    g.fillStyle = n.g === 3 ? 'rgba(120,120,130,.6)' : LANE_COL[n.lane];
    g.fillRect(x + 4, y - 5, LANE_W - 8, 10);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + 4, y - 5, LANE_W - 8, 2);
    txt(g, ARROW[n.lane], x + LANE_W / 2, y + 1, 9, '#1a1424');
  }
  // the count-in, the grade, the score, the combo, the hype
  const cx = LANE_X0 + LANE_W * LANES / 2;
  if (ts < 0) txt(g, ts < -1 ? 'GET READY' : 'GO!', cx, 90, 14, '#ffe28a');
  if (st.pop && now - st.pop.at < 500) txt(g, GRADE_NAMES[st.pop.g], cx, 150 - (now - st.pop.at) / 40, 12, ['#ffe28a', '#7aff7a', '#9ae8ff', '#ff6a6a'][st.pop.g]);
  const T = st.T, md = mood(T.rating);
  txt(g, T.score.toLocaleString(), W - 6, 28, 10, '#fff', 'right');
  if (T.combo >= 4) txt(g, `${T.combo}x`, W - 6, 42, 9, '#ffd24a', 'right');
  txt(g, `${Math.max(0, Math.ceil(st.setS - ts))}s`, W - 6, 12, 10, '#b8bcd8', 'right');
  txt(g, G.mode === 'gig' ? `GIG · ${TRACK[st.track].title}` : TRACK[st.track].title, W - 6, 235, 7, '#b8bcd8', 'right');
  // the hype meter: how the crowd's taking it
  const mx = W - 30, my0 = 54, mh = 130;
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(mx, my0, 8, mh);
  g.fillStyle = md === 'hype' ? '#ff5ac8' : md === 'into' ? '#7aff7a' : md === 'meh' ? '#ffd24a' : '#ff6a6a';
  const hgt = Math.round(mh * T.rating); g.fillRect(mx, my0 + mh - hgt, 8, hgt);
  txt(g, { hype: 'HYPE!', into: 'INTO IT', meh: 'MEH', bored: 'BORED', boo: 'BOO!' }[md], mx + 4, my0 + mh + 10, 7, '#fff');
}
function drawJam(g) {
  const now = performance.now();
  const ch = G.chordOn || G.padChord;
  txt(g, `${ch ? '■' : '□'} CHORD`, 8, 12, 9, ch ? '#ffd24a' : '#b8bcd8', 'left');
  txt(g, 'GIG ▶', W - 8, 12, 10, '#7aff7a', 'right');
  for (let i = 0; i < PADS; i++) {
    const c = i % 4, r = i >> 2, x = 40 + c * 60, y = 28 + r * 60, lit = G.lastPad === i && now - G.padAt < 160;
    g.fillStyle = lit ? LANE_COL[c] : 'rgba(255,255,255,.1)'; g.fillRect(x + 4, y, 52, 54);
    g.strokeStyle = LANE_COL[c]; g.lineWidth = 1; g.strokeRect(x + 4.5, y + 0.5, 51, 53);
    txt(g, PAD_KEYS[i], x + 30, y + 27, 14, lit ? '#1a1424' : '#fff');
  }
  if (G.pick >= 0) {
    const n = G.picks.length, rh = Math.min(14, 116 / n);
    g.fillStyle = 'rgba(8,6,20,.94)'; g.fillRect(60, 4, 200, 22 + n * rh);
    txt(g, 'A GIG TO...', W / 2, 13, 9, '#ffe28a');
    G.picks.forEach((id, i) => txt(g, `${i === G.pick ? '▶ ' : ''}${TRACK[id].title}`, W / 2, 28 + i * rh, Math.min(9, rh - 2), i === G.pick ? '#7aff7a' : '#d8dcf0'));
  }
}
function drawResult(g) {
  const R = G.res;
  const y0 = Math.round(H / 2 - 62);
  g.fillStyle = 'rgba(8,6,20,.9)'; g.fillRect(W / 2 - 92, y0, 184, 124);
  txt(g, 'SET OVER', W / 2, y0 + 14, 12, '#ffe28a');
  txt(g, `${(R.score || 0).toLocaleString()} pts`, W / 2, y0 + 32, 12, '#fff');
  txt(g, `${Math.round((R.acc || 0) * 100)}% on the beat`, W / 2, y0 + 50, 8, '#d8dcf0');
  txt(g, `best combo ${R.best || 0}`, W / 2, y0 + 62, 8, '#d8dcf0');
  if (R.grades) txt(g, `${R.grades[0]} perfect · ${R.grades[1]} great · ${R.grades[2]} good · ${R.grades[3]} missed`, W / 2, y0 + 76, 6, '#b8bcd8');
  txt(g, R.tips ? `$${R.tips} in your hat · ${R.crowd} watching` : R.local ? '' : `${R.crowd || 0} watching`, W / 2, y0 + 92, 8, '#7aff7a');
  txt(g, G.mode === 'jam' ? 'play on, or Esc / B: put it away' : 'Esc / B to leave', W / 2, y0 + 108, 7, '#8a90b8');
}
