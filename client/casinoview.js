// The games on a casino's floor and at a bar's card table as this page sees them (the owner, 2026-11-14: the roulette
// wheel visibly spinning and the ball landing, the cards dealt at blackjack and poker, the slots' reels turning - the
// regulars' games and a player's). Loaded with the first floor the server tells this page about (main.js: the 'cfl' /
// 'cdl' events - server/systems/casinofloor.js). Each deal is played out here from its few numbers: the wheel turned and
// slowed, the ball run round the other way and dropped into its pocket; the cards flown from the dealer one at a time
// round the table, a hole card turned over at the end; poker's flop, turn and river, the hands shown and the pot pushed
// to the winner; the three reels stopping one after another. Drawn over the world while you're inside the building (its
// roof is over them otherwise), at the art's own scale: a card is 3 x 4 px.
import { floorByKey } from '../shared/cardfloors.js';
import { TILE } from '../shared/constants.js';
import { soundEvent } from './audio.js';

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const POCK = (n) => (n === 0 ? '#2a9a46' : RED.has(n) ? '#c8262b' : '#1c1c22');
const REEL_C = [['#d8262c', '#3a8a2a'], ['#f2d21b', '#c8a010'], ['#e8b830', '#8a6010'], ['#1c1c22', '#f4f2ea'], ['#d8262c', '#f4f2ea'], ['#ff6ab0', '#f2d21b']];   // (CASINO.reel's order: cherry, lemon, bell, bar, seven, lotus)
const SPIN = 7, LAND = 5.6, DEAL = 0.42, FLY = 0.22;
const TAU = 6.2832;

export class CasinoView {
  constructor(S) { this.S = S; this.fl = new Map(); }
  // the deal's sounds, on its timeline (client/sound/events.js cflick / crou / creel): heard while its floor is drawn -
  // you're in the room - and only when their moment comes (a late one, a frame or two, still; a stale one dropped)
  cue(f, t, ev) { const q = (f.q ||= []); q.push([t, ev]); if (q.length > 160) q.splice(0, q.length - 160); }
  cues(f, now) {
    if (!f.q || !f.q.length) return;
    const keep = [];
    for (const c of f.q) { if (c[0] > now) keep.push(c); else if (now - c[0] < 0.4) soundEvent(c[1], this.S); }
    f.q = keep;
  }
  sounds(f, ev, P, now) {
    const T = ev.g === 'slot' ? null : f.F.tables[ev.i];
    if (ev.g === 'slot') {
      const M = f.F.slots[ev.i];
      if (!M) return;
      const at = { x: M.sx, y: M.sy };
      this.cue(f, now, { e: 'creel', ...at, s: 1.8 });
      for (let k = 0; k < 3; k++) this.cue(f, now + 0.9 + k * 0.45, { e: 'creel', k: 'stop', ...at });
      if (ev.x) this.cue(f, now + 2, { e: 'creel', k: 'win', ...at });
      return;
    }
    if (!T || !P) return;
    if (ev.g === 'rou') { const W = T.wheel; this.cue(f, P.t0 + LAND - 1.2, { e: 'crou', x: W.x, y: W.y, s: 1.15 }); this.cue(f, P.t0 + LAND, { e: 'crou', k: 1, x: W.x, y: W.y }); return; }
    const from = T.dealer || T.dc;
    for (const c of P.cards) { const t = P.t0 + c.at * DEAL; if (t >= now - 0.05) this.cue(f, t, { e: 'cflick', x: from.x, y: from.y }); }
    if (P.flip !== undefined && P.t0 + P.flip * DEAL >= now - 0.05) this.cue(f, P.t0 + P.flip * DEAL, { e: 'cflick', x: from.x, y: from.y });
  }
  floor(k) {
    let f = this.fl.get(k);
    if (!f) { const F = floorByKey(this.S.map, k, TILE); if (!F) return null; this.fl.set(k, (f = { F, t: F.tables.map(() => null), sl: new Map() })); }
    return f;
  }
  event(ev) {
    const f = this.floor(ev.k), now = performance.now() / 1000;
    if (!f) return;
    if (ev.e === 'cfl') {   // (as it stands: the last deal at each table, done)
      (ev.d || []).forEach((d, i) => { if (d && i < f.t.length) f.t[i] = this.play(d, now - 60, null); });
      for (const [j, r] of ev.sl || []) f.sl.set(j, { r, t0: now - 60, x: 0 });
      return;
    }
    if (ev.g === 'slot') { f.sl.set(ev.i, { r: ev.r, t0: now, x: ev.x }); this.sounds(f, ev, null, now); return; }
    if (ev.i >= f.t.length) return;
    f.t[ev.i] = this.play(ev, now, f.t[ev.i]);
    this.sounds(f, ev, f.t[ev.i], now);
  }
  // a deal's timeline: what lands where and when
  play(d, now, old) {
    const P = { d, t0: now, cards: [] };
    if (d.g === 'rou') { P.rot = Math.random() * TAU; return P; }
    const push = (who, k, c, up, at) => P.cards.push({ who, k, c, up, at });
    if (d.g === 'bj') {
      const same = old && old.d.g === 'bj' && old.d.h === d.h && old.d.by === d.by, seats = [];
      d.s.forEach((h, k) => { if (h) seats.push(k); });
      let n = 0;
      for (let r = 0; r < 2; r++) { for (const k of seats) push(k, r, d.s[k][r], true, n++); push(-1, r, d.d[r], r === 0, n++); }
      for (const k of seats) for (let r = 2; r < d.s[k].length; r++) push(k, r, d.s[k][r], true, n++);
      if (d.d[1] >= 0) P.flip = n++;   // (the hole card turned over)
      for (let r = 2; r < d.d.length; r++) push(-1, r, d.d[r], true, n++);
      P.end = n;
      // (a player's hand, again: the cards already on the felt stay as they lay, the new ones come from now)
      if (same) {
        P.t0 = old.t0;
        const was = old.cards.length, a0 = Math.min(was < P.cards.length ? P.cards[was].at : 1e9, P.flip ?? 1e9), sh = a0 < 1e9 ? Math.max(0, (now - old.t0) / DEAL - a0) : 0;
        for (let i = was; i < P.cards.length; i++) P.cards[i].at += sh;
        if (P.flip !== undefined) P.flip += sh;
        P.end += sh;
      }
    } else if (d.g === 'pk') {
      const seats = [];
      d.s.forEach((h, k) => { if (h) seats.push(k); });
      let n = 0;
      for (let r = 0; r < 2; r++) for (const k of seats) push(k, r, d.s[k][r], false, n++);
      n += 3; for (let r = 0; r < 3; r++) push(-1, r, d.b[r], true, n);
      n += 4; push(-1, 3, d.b[3], true, n);
      n += 4; push(-1, 4, d.b[4], true, n);
      P.show = n + 4; P.end = n + 6;
    } else if (d.g === 'vp') {
      for (let r = 0; r < 5; r++) push(d.s, r, d.c[r], true, old && old.d.g === 'vp' && old.d.by === d.by && old.d.c[r] === d.c[r] ? -99 : r);
      P.end = 5;
    }
    return P;
  }
  draw(g, F, ctx) {
    const b = F.sp && ctx.walkInAt(F.sp.x, F.sp.y);
    if (!b) return;
    const now = performance.now() / 1000;
    for (const f of this.fl.values()) {
      if (this.S.map.buildings[f.F.b] !== b) { if (f.q) f.q.length = 0; continue; }
      this.cues(f, now);
      g.save();
      f.F.tables.forEach((T, i) => { const P = f.t[i]; if (T.g === 'rou') this.wheel(g, T, P, now); else if (P) this.hand(g, T, P, now); });
      for (const [j, s] of f.sl) { const M = f.F.slots[j]; if (M) this.reels(g, M, s, now); }
      g.restore();
    }
  }
  // the wheel: turning, slowing; the ball the other way round the rim, dropping in toward its pocket and landing there
  wheel(g, T, P, now) {
    const W = T.wheel, cx = W.x, cy = W.y - T.h - 2, r = W.r, t = P ? now - P.t0 : 99;
    const rot = (P ? P.rot : 0) + (t < SPIN ? 5 * (t - t * t / (2 * SPIN)) : 5 * SPIN / 2);
    for (let k = 0; k < 37; k++) {
      const a = rot + k * TAU / 37;
      g.fillStyle = POCK(WHEEL[k]); g.fillRect(Math.round(cx + Math.cos(a) * (r - 2.5)) - 1, Math.round(cy + Math.sin(a) * (r - 2.5)) - 1, 2, 2);
    }
    g.fillStyle = '#e8b840'; g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    for (let k = 0; k < 4; k++) { const a = rot * 1 + k * TAU / 4; g.fillRect(Math.round(cx + Math.cos(a) * 3), Math.round(cy + Math.sin(a) * 3), 1, 1); }
    if (!P) return;
    const pk = WHEEL.indexOf(P.d.n), home = rot + pk * TAU / 37;
    let a = home, rad = r - 2.5;
    if (t < LAND) { const u = 1 - t / LAND; a = home + 30 * u * u; rad = t < LAND - 1.2 ? r - 0.5 : r - 0.5 - 2 * (1 - (LAND - t) / 1.2) + Math.abs(Math.sin(t * 9)) * 0.6 * (LAND - t); }
    g.fillStyle = '#ffffff'; g.fillRect(Math.round(cx + Math.cos(a) * rad) - 0.5, Math.round(cy + Math.sin(a) * rad) - 0.5, 1.6, 1.6);
    // the chips on the layout while it spins; the dolly on the number once it's landed
    const n = P.d.n, cell = (q) => (q === 0 ? { x: T.x0 + 8, y: T.y0 + 15 } : { x: T.x0 + 12 + ((q - 1) / 3 | 0) * 4, y: T.y0 + 8 + (2 - (q - 1) % 3) * 7 });
    const z = T.h + 1;
    if (t < LAND + 0.4) for (let k = 0; k < 5; k++) { const q = (n * 7 + k * 11 + (P.d.by | 0)) % 37, c = cell(q); g.fillStyle = ['#d83a3a', '#3a6ad8', '#e8e8e8', '#2a9a46', '#e8b840'][k]; g.fillRect(c.x, c.y - z, 2, 2); }
    else if (t < 40) { const c = cell(n); g.fillStyle = '#f4f2ea'; g.fillRect(c.x - 0.5, c.y - z - 1, 3, 3); g.fillStyle = '#e8b840'; g.fillRect(c.x, c.y - z - 2, 2, 1); }
  }
  // the cards round a blackjack or a poker table (or a player's video poker hand in front of him)
  hand(g, T, P, now) {
    const t = (now - P.t0) / DEAL, z = T.h + 1, from = T.dealer || T.dc, D = P.d;
    if (P.end !== undefined && t > P.end + 40 / DEAL) return;   // (swept off the felt a while after)
    const spot = (c) => {
      if (c.who < 0) return D.g === 'pk' ? { x: T.dc.x - 10 + c.k * 5, y: T.dc.y } : { x: T.dc.x - 4 + c.k * 4, y: T.dc.y };
      const q = T.cards[c.who] || T.dc, n = D.g === 'vp' ? c.k - 2 : c.k;
      return { x: q.x + n * (D.g === 'vp' ? 4 : 2) - 1, y: q.y - (D.g === 'vp' ? 0 : c.k) };
    };
    for (const c of P.cards) {
      const u = t - c.at;
      if (u < 0) continue;
      const p = spot(c), f = Math.min(1, u * DEAL / FLY), x = from.x + (p.x - from.x) * f, y = from.y + (p.y - from.y) * f - z;
      let up = c.up;
      if (c.who === -1 && c.k === 1 && D.g === 'bj' && P.flip !== undefined && t >= P.flip) up = true;
      if (D.g === 'pk' && c.who >= 0 && t >= P.show) up = true;
      card(g, Math.round(x - 1.5), Math.round(y - 2), up ? c.c : -1, D.g === 'pk' && t >= P.show && c.who === D.w);
    }
    if (D.g === 'pk') {   // the pot in the middle, pushed to the winner at the showdown
      const k = Math.min(8, Math.floor(t / 2)), win = t >= P.show + 1, q = win ? T.cards[D.w] || T.dc : { x: T.dc.x, y: T.dc.y + 6 }, f = win ? Math.min(1, (t - P.show - 1) * DEAL / 0.5) : 0;
      for (let i = 0; i < k; i++) { const x = T.dc.x - 6 + (i % 4) * 3 + (q.x - T.dc.x) * f, y = T.dc.y + 6 + (i >> 2) * 2 + (q.y - T.dc.y - 6) * f - z; g.fillStyle = ['#d83a3a', '#3a6ad8', '#e8e8e8', '#1c1c22'][i & 3]; g.fillRect(Math.round(x), Math.round(y), 2, 2); }
    }
  }
  // a slot machine's three reels in its window: a blur while they spin, stopping one after another; the topper flashing on a win
  reels(g, M, s, now) {
    const t = now - s.t0, y = M.sy - M.sz - 3, x0 = M.x0 + 2;
    for (let k = 0; k < 3; k++) {
      const stop = 0.9 + k * 0.45, x = x0 + k * 3;
      const sym = t >= stop ? s.r[k] : Math.floor((now * 14 + k * 2.3) % 6), C = REEL_C[sym];
      g.fillStyle = '#f4f2ea'; g.fillRect(x, y, 2, 5);
      g.fillStyle = C[0]; g.fillRect(x, y + 1, 2, 2); g.fillStyle = C[1]; g.fillRect(x + (sym === 0 ? 1 : 0), y + (sym === 3 || sym === 4 ? 2 : 0), 1, 1);
      if (t < stop) { g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(x, y + ((now * 30) | 0) % 5, 2, 1); }
    }
    if (s.x && t > 2 && t < 6 && ((now * 6) | 0) & 1) { g.fillStyle = 'rgba(255,230,120,.8)'; g.fillRect(M.x0, M.y1 - M.h, M.x1 - M.x0, 4); }
  }
}
// a card, 3 x 4: its face (white, the suit's colour in the middle; a court card a band) or its back; a gold edge on a winner
function card(g, x, y, c, win) {
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 1, y + 1, 3, 4);
  if (c < 0) { g.fillStyle = '#b02a3a'; g.fillRect(x, y, 3, 4); g.fillStyle = '#e8d8c8'; g.fillRect(x + 1, y + 1, 1, 2); return; }
  g.fillStyle = win ? '#ffe070' : '#f4f2ea'; g.fillRect(x, y, 3, 4);
  const s = Math.floor(c / 13), r = c % 13;
  g.fillStyle = s === 1 || s === 2 ? '#d02a30' : '#1c1c22';
  if (r >= 10) g.fillRect(x, y + 1, 3, 2); else g.fillRect(x + 1, y + 1, 1, r === 0 ? 1 : 2);
}
