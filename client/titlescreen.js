// The title screen (UI-10, the owner's concept UIC-08): while the city loads, the logo, a "Connecting..." line, a bar
// and a tip that changes every few seconds; once it's ready, the menu (PLAY, CHARACTER, SETTINGS, the graphics you're
// on) with your card bottom left and who's online bottom right. main.js keeps writing the status line and enabling
// PLAY as before; this follows them (sync, a few times a second while the title shows) - loading is "PLAY can't be
// pressed yet, or the art is warming up" (client/warmup.js drives the same bar with its real progress then).
// Also the pixel skyline the title, the pause panel and the phone's home stand on (one small canvas, drawn once).

import { paintIcons } from './touchicons.js';

// tips, true of the game as it is (the paused tour's facts: shared/tutorial.js); one at a time, in a shuffled order
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

// the skyline: dark towers with lit windows and a few palms, on a transparent sky (CSS paints the dusk behind it)
let skyUrl = null;
export function skyline() {
  if (skyUrl) return skyUrl;
  try {
    const W = 320, H = 72, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    // two rows of towers: the far ones lighter, the near ones darker, windows lit warm
    for (const [col, lo, hi, win] of [['#1d2a52', 20, 56, 0.18], ['#0e1631', 10, 40, 0.3]]) {
      let x = -4;
      while (x < W) {
        const w = 10 + Math.floor(rnd() * 18), h = lo + Math.floor(rnd() * (hi - lo));
        g.fillStyle = col; g.fillRect(x, H - h, w, h);
        if (rnd() < 0.3) g.fillRect(x + (w >> 1) - 1, H - h - 5, 2, 5);   // (an antenna)
        g.fillStyle = '#e2bd57';
        for (let wy = H - h + 3; wy < H - 2; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) if (rnd() < win) g.fillRect(wx, wy, 1, 2);
        x += w + (rnd() < 0.4 ? 2 : 0);
      }
    }
    // palms
    g.fillStyle = '#0a1022';
    for (const px of [34, 118, 251, 300]) {
      const ph = 26 + Math.floor(rnd() * 10);
      for (let y = 0; y < ph; y++) g.fillRect(px + Math.round(Math.sin(y / 9) * 1.5), H - y, 2, 1);
      const tx = px + 1, ty = H - ph;
      for (let a = 0; a < 6; a++) { const dx = Math.cos(a * 1.05), dy = Math.sin(a * 1.05) * 0.5; for (let r = 0; r < 9; r++) g.fillRect(Math.round(tx + dx * r), Math.round(ty + dy * r + (r * r) / 22), 2, 1); }
    }
    skyUrl = c.toDataURL();
  } catch { skyUrl = ''; }
  return skyUrl;
}
// the skyline under an element (a CSS variable its rules use: --sky)
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
  // where the load has got to, roughly: the socket, the welcome, the city built (each stage creeps toward its mark)
  function target() {
    if (S.welcomed) return 0.96;
    if (S.hold) return 0.88;   // (the welcome is in; the city is still being built)
    if (S.ws && S.ws.readyState === 1) return 0.45;
    return 0.25;
  }
  function sync() {
    if (title.classList.contains('hidden')) return;
    const warm = ctx.warming(), now = performance.now();
    const isLoading = warm || (!ctx.idle() && $('play').disabled && !S.practice);
    if (isLoading !== loading) {
      loading = isLoading;
      title.classList.toggle('loading', loading);
      if (loading) { k = Math.min(k, 0.1); bar.classList.remove('hidden'); }
    }
    if (loading && !warm) { k += (target() - k) * 0.04; fill.style.width = `${Math.round(k * 100)}%`; }
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
    const n = ctx.players(), on = $('t-online');
    on.classList.toggle('hidden', n === null);
    if (n !== null) on.lastElementChild.textContent = `Online - ${n} player${n === 1 ? '' : 's'}`;
    $('t-char').disabled = !S.welcomed || !S.looks;
  }
  setInterval(sync, 200);
  sync();
  return { sync, get loading() { return !!loading; } };
}
