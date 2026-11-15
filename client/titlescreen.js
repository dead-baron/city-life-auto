// The title screen (UI-10, the owner's concept UIC-08): while the city loads, the logo, a "Connecting..." line, a bar
// and a tip that changes every few seconds; once it's ready, the menu (PLAY, CHARACTER, SETTINGS, the graphics you're
// on) with your card bottom left and who's online bottom right. main.js keeps writing the status line and enabling
// PLAY as before; this follows them (sync, a few times a second while the title shows) - loading is "PLAY can't be
// pressed yet, or the art is warming up" (client/warmup.js drives the same bar with its real progress then).
// Also the pixel skyline the title, the pause panel and the phone's home stand on (one small canvas, drawn once).

import { paintIcons } from './touchicons.js';
import { loadTracker, loadStep, creep, PHASE } from './warmup.js';

// tips, true of the game as it is (the Guide's facts: shared/guide.js); one at a time, in a shuffled order
export const TIPS = [
  'Explore the city to find new opportunities.',
  'Cash you carry drops where you go down. Bank it at any ATM.',
  'The phone\'s Jobs app always has work - one job at a time.',
  'The phone\'s Places app finds the nearest hospital, bank, shop or garage and sets a waypoint.',
  'Below 30% health you bleed: a med kit or a bandage stops it.',
  'Hospitals patch you up for a small fee - step onto the reception mat.',
  'A home of your own becomes your respawn point.',
  'Cargo rides in the open on pickups, flatbeds and boats - anyone can take it.',
  'Break the police\'s line of sight to lose your wanted stars.',
  'Nights get properly dark away from the streetlights - a flashlight never wears out.',
  'Buses, trains and ferries are free. The phone\'s Transit app says when the next one comes.',
  'Fishing rods are sold at tackle shops, the fish market and sports stores.',
];

// the skyline: a big city far off, on a transparent sky (CSS paints the night behind it; the owner, 11-14: "more
// detailed and interesting but still in the right style", no palms) - a hazier back row and a darker front row of
// towers: setbacks, stepped towers with spires, a water tower, rooftop antennas (their red lights blink: titlelife),
// a lit billboard or two, little neon strips by the street, windows lit in irregular floors.
// skyLayout(): where its windows are - every slot still in sight once it's drawn, lit or dark, its row (0 back,
// 1 front) - the antennas' tips (beacons) and the tall roofs (where a searchlight can stand); client/titlelife.js
let skyUrl = null, skyWins = null, skyMarks = { beacons: [], roofs: [] };
const SKY_COLS = ['#1d2a52', '#0e1631'], SKY_LIT = ['#a08a52', '#e2bd57'];
export function skyLayout() { skyline(); return { w: 320, h: 72, wins: skyWins || [], cols: SKY_COLS, lit: SKY_LIT, ...skyMarks }; }
export function skyline() {
  if (skyUrl) return skyUrl;
  try {
    const W = 320, H = 72, c = document.createElement('canvas'), slots = [], beacons = [], roofs = [];
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff), ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const box = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
    // the windows of a face: 1 x 2 px on a 3 x 4 grid, a floor at a time lit more or less (irregular, still windows)
    const wins = (x, top, w, foot, row, base) => {
      for (let wy = top + 3; wy < foot - 3; wy += 4) {
        const p = rnd() < 0.25 ? 0 : base * (0.4 + rnd() * 1.4);
        for (let wx = x + 2; wx < x + w - 2; wx += 3) { const lit = rnd() < p; if (lit) box(wx, wy, 1, 2, SKY_LIT[row]); slots.push(wx, wy, lit ? 1 : 0, row); }
      }
    };
    // a tower: its body, maybe a setback (a narrower top) or steps and a spire, its windows; returns its roof
    const tower = (x, w, h, row, kind) => {
      const col = SKY_COLS[row], foot = H;
      let top = H - h;
      box(x, top, w, h, col);
      wins(x, top, w, foot, row, row ? 0.32 : 0.16);
      if (kind === 'setback' && w >= 12) { const sw = w - 2 * ri(3, 4), sh = ri(6, 12); box(x + (w - sw >> 1), top - sh, sw, sh, col); wins(x + (w - sw >> 1), top - sh, sw, top, row, 0.3); top -= sh; }
      if (kind === 'stepped' && w >= 12) {
        for (let k = 1; k <= 2; k++) { const sw = w - 6 * k, sh = 4; if (sw < 4) break; top -= sh; box(x + (w - sw >> 1), top, sw, sh, col); }
        box(x + (w >> 1), top - 8, 1, 8, col); top -= 8;   // (the spire)
      }
      if (kind === 'antenna') { const ax = x + ri(2, w - 3), ah = ri(5, 8); box(ax, top - ah, 1, ah, col); beacons.push(ax, top - ah - 1); }
      if (kind === 'water' && row) {   // a water tower on its roof: the tank on its legs, a cone over it
        const tx = x + ri(2, Math.max(2, w - 8)), ty = H - h;
        box(tx + 1, ty - 3, 1, 3, col); box(tx + 4, ty - 3, 1, 3, col); box(tx, ty - 8, 6, 5, col); box(tx + 1, ty - 9, 4, 1, col); box(tx + 2, ty - 10, 2, 1, col);
        box(tx, ty - 6, 6, 1, '#1d2a52');   // (its hoop, catching the sky)
      }
      if (kind === 'billboard' && row) {   // a lit billboard on its roof: a pale face, a coloured band, its frame
        const bw = Math.min(w + 2, 12), bx = x + (w - bw >> 1), by = H - h - 7;
        box(bx + 2, by + 5, 1, 2, col); box(bx + bw - 3, by + 5, 1, 2, col); box(bx, by, bw, 5, '#26304f');
        box(bx + 1, by + 1, bw - 2, 3, '#e8dcc0'); box(bx + 1, by + 2, bw - 2, 1, rnd() < 0.5 ? '#ff5ab4' : '#46e6ff');
      }
      if (row) roofs.push(x + (w >> 1), top);
    };
    // the back row, hazier: taller, plainer, fewer lights
    for (let x = -6; x < W;) { const w = ri(12, 28); tower(x, w, ri(26, 58), 0, rnd() < 0.35 ? 'setback' : rnd() < 0.3 ? 'antenna' : ''); x += w + (rnd() < 0.3 ? ri(1, 3) : 0); }
    // the front row: every few towers something on top - a stepped tower and its spire, a water tower, a billboard,
    // an antenna, a setback - and now and then a little neon sign by the street
    const KINDS = ['', 'antenna', '', 'water', 'setback', '', 'stepped', '', 'billboard', 'antenna', '', 'setback'];
    let n = 0;
    for (let x = -4; x < W; n++) {
      const kind = KINDS[n % KINDS.length], w = kind === 'stepped' ? ri(16, 20) : ri(10, 22), h = kind === 'stepped' ? ri(34, 42) : ri(12, 36);
      tower(x, w, h, 1, kind);
      if (rnd() < 0.3 && w >= 8) { const nc = ['#ff5ab4', '#46e6ff', '#ffbe3c'][ri(0, 2)]; if (rnd() < 0.5) box(x + ri(1, w - 5), H - ri(5, 9), 4, 1, nc); else box(x + ri(1, w - 2), H - ri(7, 11), 1, 3, nc); }
      x += w + (rnd() < 0.35 ? ri(1, 2) : 0);
    }
    // (the slots a nearer tower covers are left out: a twinkle there would show through)
    const px = g.getImageData(0, 0, W, H).data, hex = (i) => '#' + [px[i], px[i + 1], px[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    skyWins = [];
    for (let k = 0; k < slots.length; k += 4) {
      const [wx, wy, lit, ci] = slots.slice(k, k + 4), i = (wy * W + wx) * 4, j = i + W * 4;
      if (wx < 0 || wx >= W) continue;
      const want = lit ? SKY_LIT[ci] : SKY_COLS[ci];
      if (hex(i) === want && hex(j) === want) skyWins.push(wx, wy, lit, ci);
    }
    const inside = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) if (a[i] >= 0 && a[i] < W) o.push(a[i], a[i + 1]); return o; };
    skyMarks = { beacons: inside(beacons), roofs: inside(roofs) };
    skyUrl = c.toDataURL();
  } catch { skyUrl = ''; }
  return skyUrl;
}
// the skyline under an element (a CSS variable its rules use: --sky)
// logged off (LOG OFF's 'done', the socket closed with 4016): the session in a few numbers - earned, spent, skill XP,
// Criminal EXP and Samaritan only when they moved, the time played
const money = (n) => `$${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US')}`;
export function playedFor(secs) {
  const m = Math.max(0, Math.round((Number(secs) || 0) / 60));
  return m < 1 ? 'under a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
export function offSummaryHtml(m = {}) {
  const rows = [['Earned', money(m.earned)], ['Spent', money(m.spent)], ['XP', `+${Math.round(Number(m.xp) || 0)}`]];
  if (Number(m.cexp)) rows.push(['Criminal EXP', `${m.cexp > 0 ? '+' : ''}${Math.round(m.cexp)}`]);
  if (Number(m.sam)) rows.push(['Samaritan', `${m.sam > 0 ? '+' : ''}${Math.round(m.sam)}`]);
  rows.push(['Played', playedFor(m.secs)]);
  return `<b class="t-off-h">SAVED - SAFE TRAVELS</b><dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}
export function paintSky(el) { const u = skyline(); if (el && u) el.style.setProperty('--sky', `url(${u})`); }

// ctx: { $, S, warming() -> bool, idle() -> bool, players() -> number | null }
export function createTitle(ctx) {
  const { $, S } = ctx;
  const title = $('title'), bar = $('t-warm'), fill = bar.firstElementChild, tip = $('t-tip');
  paintSky(title);
  paintIcons(document);   // (the title's, the sign-in panel's and the hub's icons: before the HUD is up)
  let k = 0, order = TIPS.map((_, i) => i), at = 0, lastTip = 0, loading = null;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  order.unshift(0);   // (the first is the concept's own: explore)
  const nextTip = () => { tip.textContent = 'Tip: ' + TIPS[order[at++ % order.length]]; lastTip = performance.now(); };
  nextTip();
  // where the load has got to: the socket, then the city (the welcome in, the city still being built - a creep through
  // it, there's no news of its own), then ready for PLAY - one record with the art's wait after PLAY (client/warmup.js
  // LOAD_PHASES: its phase and its bar only go forward)
  let phAt = 0, phWas = -1, ptCode = null;
  function sync() {
    if (title.classList.contains('hidden')) return;
    const warm = ctx.warming(), now = performance.now();
    const isLoading = warm || (!ctx.idle() && $('play').disabled && !S.practice);
    if (isLoading !== loading) {
      loading = isLoading;
      title.classList.toggle('loading', loading);
      if (loading) { if (S.loadT && S.loadT.done) S.loadT = null; bar.classList.remove('hidden'); }   // (a load again - back to the title, a reconnect: a new record)
    }
    if (loading && !warm) {
      const T = S.loadT || (S.loadT = loadTracker());
      const ph = S.welcomed ? PHASE.gfx : S.hold || (S.ws && S.ws.readyState === 1) ? PHASE.city : PHASE.connect;
      if (ph !== phWas) { phWas = ph; phAt = now; }
      loadStep(T, { phase: ph, sub: ph === PHASE.gfx ? 0 : creep(now - phAt, ph === PHASE.city ? 8000 : 3000) });
      k = T.k;
      const wd = `${Math.round(k * 100)}%`;
      if (fill.style.width !== wd) fill.style.width = wd;
    }
    if (loading && now - lastTip > 6000) nextTip();
    // your card: your name, your standing (the phone's Skills has the rest); who's online
    const me = S.me, card = $('t-card');
    card.classList.toggle('hidden', !me);
    if (me) {
      const nm = me.name || S.name || 'You';
      if ($('t-name').textContent !== nm) $('t-name').textContent = nm;
      $('t-xp').textContent = `Criminal XP ${(me.cexp | 0).toLocaleString('en-US')}`;
      $('t-sam').textContent = `Samaritan ${(me.sam | 0).toLocaleString('en-US')}`;
    }
    // (the avatar: your own character, drawn by client/portrait.js - loaded the first time there's a look to show - on
    // the card and on CHARACTER, in place of the person icon)
    const lk = me && S.looks && S.looks.cur;
    if (lk && lk !== ptCode) { ptCode = lk; import('./portrait.js').then((m) => { m.portrait(card.querySelector('.t-av'), lk); m.portrait($('t-char').querySelector('.t-cav'), lk); }).catch(() => { ptCode = null; }); }
    const n = ctx.players(), on = $('t-online');
    on.classList.toggle('hidden', n === null);
    if (n !== null) on.lastElementChild.textContent = `Online - ${n} player${n === 1 ? '' : 's'}`;
    $('t-char').disabled = !S.welcomed || !S.looks;
  }
  setInterval(sync, 200);
  sync();
  return { sync, get loading() { return !!loading; } };
}
