// Fishing on the page (task #277; server/systems/fishing.js, shared/fish.js), loaded the first time you have a line
// out or see someone cast - none of it is in the page's first load (client/main.js loadFish):
//   - your own line, predicted: the cast's charge, the wait, the bite, the fight, stepped with the inputs you send
//     exactly as the server steps them (shared/fish.js fightStep), set back to the server's at each snapshot (its state
//     at the input it last took: the snapshot's spare slots) with the inputs it hasn't had yet played again on top - so
//     the meter, the strike and the bar answer your thumb at once;
//   - in the world: everyone's line and bobber (from the 'cast' events: where it landed), its nibbles and its bite, the
//     line taut and the fish thrashing while it's on; your cast's meter at your side;
//   - on the screen: the fight (the track, your bar, the fish on it, the catch meter - Stardew Valley's) in the HUD's
//     spot for it (#fishspot), the timing cues (#fishbar: LET GO!, STRIKE!), and the catch card when you land one (the
//     fish drawn, its weight, new to your log, your best, a record, what it's worth: client/fishart.js).
import * as FS from '../shared/fish.js';
import { IN } from '../shared/input.js';
import { DT, T } from '../shared/constants.js';
import { ugMapOf } from '../shared/underground.js';
import { glyph } from './glyphs.js';
import { drawFish } from './fishart.js';

const { PH } = FS;
const wet = (t) => t === T.WATER || t === T.DEEP;
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const SILHOUETTE = { shape: 'bass', col: null };

export class FishView {
  constructor(S) { this.S = S; this.F = null; this.prev = 0; this.bits = new Map(); this.lines = new Map(); this.cardAt = 0; this.card = null; this.phSeen = 0; this.land = null; }
  // what the server sent while this was loading
  drain() { const q = this.S.fishQ || []; while (q.length) { const x = q.shift(); if (x.t === 'fish') this.showCard(x); else this.onEvent(x); } }
  get P() { const m = this.S.me && this.S.me.fishing; return m && m.P ? m.P : null; }

  // ---- your own line: predicted --------------------------------------------------------------------------------------
  // the snapshot: the server's fight at the input it last took, then the inputs it hasn't had, again
  reconcile(s) {
    const k = s.self && s.self.k;
    if ((s.selfFlags & 64) || !k || !(k[0] >= 1)) { this.F = null; return; }
    if (!this.F || this.F.ph === PH.NONE) this.land = null;
    this.F = FS.fishIn(this.F || {}, k);
    let prev = this.bits.has(s.ack) ? this.bits.get(s.ack) : s.prevBits;
    for (const q of this.S.pending) { this.stepOne(q.bits, prev); prev = q.bits; }
  }
  // an input sent: kept (the next snapshot replays from it) and stepped
  step(q) {
    this.bits.set(q.seq, q.bits);
    if (this.bits.size > 120) this.bits.delete(this.bits.keys().next().value);
    const prev = this.prev; this.prev = q.bits;
    if (this.F) this.stepOne(q.bits, prev);
  }
  stepOne(bits, prev) {
    const F = this.F;
    if (!F || F.ph === PH.DONE) return;
    const ph0 = F.ph;
    FS.fightStep(F, this.P, !!(bits & IN.ACTION), !!(bits & ~prev & IN.ACTION), DT);
    if (ph0 === PH.CHARGE && F.ph === PH.WAIT) this.land = this.landing(F.power);
  }
  // where your line will land as you let go (the server's own reckoning: shared/fish.js landing)
  landing(power) {
    const m = this.S.me && this.S.me.fishing, map = this.S.map;
    if (!m || !map) return null;
    const M = this.S.ugLayer ? ugMapOf(map) || map : map;
    return FS.landing(m.sx, m.sy, m.a, power, m.cast || 6, (x, y) => wet(M.tileAtPx(x, y)));
  }

  // ---- everyone's lines ----------------------------------------------------------------------------------------------
  onEvent(ev) {
    const S = this.S, fx = S.fx, now = S.loopClock || 0;
    let L = this.lines.get(ev.id);
    switch (ev.e) {
      case 'cast': this.lines.set(ev.id, { x: ev.x, y: ev.y, at: now, on: 0 }); if (fx) fx.splash(ev.x, ev.y, 4); break;
      case 'nibble': if (L) L.nib = now; if (fx) fx.splash(ev.x, ev.y, 2); break;
      case 'bite': if (L) L.bite = now; if (fx) fx.splash(ev.x, ev.y, 7); break;
      case 'hook': if (!L) { L = { x: ev.x, y: ev.y, at: now }; this.lines.set(ev.id, L); } L.on = now; L.leg = ev.leg; if (fx) fx.splash(ev.x, ev.y, ev.leg ? 16 : 9); break;
      case 'flost': if (fx) { fx.splash(ev.x, ev.y, 6); if (ev.snap) fx.floatText(ev.x, ev.y - 16, 'SNAP!', '#ff8a6a'); } this.lines.delete(ev.id); break;
      case 'catch': {
        const f = FS.FISH[ev.f];
        if (fx && f) { fx.splash(ev.x, ev.y, 12); if (ev.id !== S.myPedId) fx.floatText(ev.x, ev.y - 30, `${f.name} · ${ev.lb} lb`, f.rare === 5 ? '#ffd34a' : '#7de0ff'); }
        this.lines.delete(ev.id);
        break;
      }
    }
  }
  // world space (g under the world's transform): every line out, your cast's meter
  drawWorld(g) {
    const S = this.S, me = S.myPedId, mf = S.me && S.me.fishing, now = S.loopClock || 0;
    for (const [id, L] of this.lines) {
      const e = S.ents.get(id);
      if (!e || !(e.flags & 16384) || (id === me && !mf)) { if (now - L.at > 1) this.lines.delete(id); continue; }
      if (id === me) continue;   // (your own: drawn from the prediction below)
      this.line(g, e, L.x, L.y, now, L.on ? 2 : now - (L.bite || -9) < 0.8 ? 1 : 0, L, null);
    }
    const F = this.F;
    if (!F || !mf) return;
    // (in a boat you're not drawn as yourself: the rod over its side, where the line goes in)
    const e = !mf.boat && S.ents.get(me) || { id: me, rx: mf.sx - Math.cos(mf.a) * 24, ry: mf.sy - Math.sin(mf.a) * 24, ra: mf.a };
    if (F.ph === PH.CHARGE) this.meter(g, e, F.power, now);
    else if (F.ph >= PH.WAIT && F.ph < PH.DONE) {
      const at = mf.x !== undefined ? [mf.x, mf.y] : this.land;
      if (!at) return;
      const st = F.ph === PH.FIGHT ? 2 : F.ph === PH.BITE ? 1 : 0;
      const nib = F.ph === PH.WAIT && this.P ? FS.nibbles(this.P).some((s) => F.t >= s && F.t < s + 0.25) : false;
      const my = (this.my ||= {}); my.nib = nib ? now : -9; my.leg = mf.leg;
      this.line(g, e, at[0], at[1], now, st, my, F.ph === PH.FIGHT && this.P ? FS.fishY(this.P, F.t) : null);
    }
  }
  // a line from the rod's tip to the bobber (st 0 bobbing, 1 diving, 2 a fish on: taut, the fish thrashing about the
  // end - fy: where it is on its track, your own)
  line(g, e, bx, by, now, st, L, fy) {
    const a = e.ra || 0, tx = e.rx + Math.cos(a) * 20, ty = e.ry + Math.sin(a) * 20 - 30;
    let ex = bx, ey = by;
    if (st === 2) {   // (the fish on: off to one side and back, as it runs)
      const k = fy === null ? Math.sin(now * 5 + e.id) * 0.5 : fy - 0.5, nx = -Math.sin(a), ny = Math.cos(a);
      ex = bx + nx * k * 46 + Math.cos(now * 17) * 1.5; ey = by + ny * k * 46 + Math.sin(now * 13) * 1.5;
      if (now - (L.sp || 0) > 0.33 && this.S.fx) { L.sp = now; this.S.fx.splash(ex, ey, L.leg ? 5 : 3); }
    }
    const bob = st === 0 ? Math.sin(now * 2.6 + e.id) * 1.2 + (now - (L.nib || -9) < 0.25 ? 2.5 : 0) : st === 1 ? 4 : 0;
    g.save();
    g.strokeStyle = 'rgba(240,240,230,.75)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(tx, ty);
    if (st === 2) g.lineTo(ex, ey);
    else g.quadraticCurveTo((tx + ex) / 2, Math.max(ty, ey) + 14, ex, ey + bob);
    g.stroke();
    if (st < 2) {   // the bobber: red over white; under it goes on the bite
      if (st === 1) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(ex, ey + 2, 6 + ((now * 20) % 6), 0, 6.283); g.stroke(); }
      g.fillStyle = '#f4f4ee'; g.beginPath(); g.arc(ex, ey + bob, st === 1 ? 2 : 3, 0, 6.283); g.fill();
      if (st === 0) { g.fillStyle = '#e8402a'; g.beginPath(); g.arc(ex, ey + bob - 1.5, 2.6, Math.PI, 0); g.fill(); }
    }
    if (L.leg && st === 2) { g.strokeStyle = 'rgba(255,211,74,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(ex, ey, 10 + Math.sin(now * 8) * 3, 0, 6.283); g.stroke(); }
    g.restore();
  }
  // the cast's meter at your side: up and down while you hold; let go at the top for the long one
  meter(g, e, power, now) {
    const x = e.rx + 22, y = e.ry - 54, h = 44;
    g.save();
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - 1, y - 1, 9, h + 2);
    const top = power > 0.92;
    g.fillStyle = top ? `hsl(${(now * 400) % 360},90%,60%)` : `hsl(${20 + power * 100},85%,55%)`;
    g.fillRect(x + 1, y + h * (1 - power), 5, h * power);
    g.restore();
  }

  // ---- the screen --------------------------------------------------------------------------------------------------
  drawHud(g, W, H) {
    const now = this.S.loopClock || 0;
    this.prompt();
    const F = this.F, on = !!(F && F.ph === PH.FIGHT && this.P), sp = this.spot(on, W, H);
    if (on && sp) this.fight(g, sp, now, F, this.P);
    if (this.card) this.drawCard(g, W, H, now);
  }
  // the big timing cue (UI-7, the owner 2026-10-26: one prompt at a time): what to do the rest of the time - hold to
  // cast, wait, hold to reel - is the prompt's (server fishing.js interaction: #helpbox, on every device); this only
  // flashes the moments - LET GO! at the top of the cast's swing, STRIKE! on the bite - on one line (style.css #fishbar)
  prompt() {
    const el = this.pEl || (this.pEl = document.getElementById('fishbar'));
    if (!el) return;
    const F = this.F, ph = F ? F.ph : 0;
    if (ph === this.phSeen && ph !== PH.CHARGE) return;
    this.phSeen = ph;
    const txt = ph === PH.CHARGE && F.power > 0.92 ? `LET GO! ${glyph('action')}` : ph === PH.BITE ? `STRIKE! ${glyph('action')}` : '';
    el.classList.toggle('hidden', !txt);
    el.classList.toggle('bite', ph === PH.BITE);
    if (el.dataset.t !== txt) { el.dataset.t = txt; el.innerHTML = txt; }
  }
  // the meter's box: the HUD's spot for it (index.html #fishspot, placed by style.css clear of the touch slots, the
  // prompt, the notes and the corners' HUD on every screen), looked up again when the screen changes
  spot(on, W, H) {
    const el = this.spEl || (this.spEl = document.getElementById('fishspot'));
    if (!el) return null;
    if (on !== this.spOn) { this.spOn = on; el.classList.toggle('on', on); this.spBox = null; }
    if (!on) return null;
    const k = `${W}x${H}|${document.body.className}`;
    if (!this.spBox || this.spKey !== k) {
      const r = el.getBoundingClientRect(), c = this.cv || (this.cv = document.getElementById('view')), o = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
      this.spKey = k; this.spBox = { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    }
    return this.spBox;
  }
  // the fight: the track, your bar on it, the fish, the catch meter beside it (in the spot's box, screen px)
  fight(g, sp, now, F, P) {
    const tw = 34, x = sp.x + 8, y = sp.y + 8, th = sp.h - 16;
    const leg = this.S.me && this.S.me.fishing && this.S.me.fishing.leg;
    g.save();
    g.fillStyle = 'rgba(14,24,34,.82)'; rr(g, sp.x, sp.y, sp.w, sp.h, 8); g.fill();
    g.strokeStyle = leg ? '#ffd34a' : '#c8a060'; g.lineWidth = 2; rr(g, sp.x, sp.y, sp.w, sp.h, 8); g.stroke();
    // the water in the track
    const wg = g.createLinearGradient(0, y, 0, y + th); wg.addColorStop(0, '#2a6a9a'); wg.addColorStop(1, '#0e2a44');
    g.fillStyle = wg; g.fillRect(x, y, tw, th);
    // your bar
    const by = y + th * (1 - F.barY - P.bar), bh = th * P.bar, fy = FS.fishY(P, F.t), on = fy >= F.barY && fy <= F.barY + P.bar;
    g.fillStyle = leg ? (on ? 'rgba(255,214,90,.75)' : 'rgba(255,214,90,.45)') : on ? 'rgba(110,230,120,.78)' : 'rgba(110,230,120,.45)';
    g.fillRect(x + 2, by, tw - 4, bh);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 2, by, tw - 4, 2); g.fillRect(x + 2, by + bh - 2, tw - 4, 2);
    // the fish (a silhouette till it's landed)
    const sy = y + th * (1 - fy), dy = FS.fishY(P, F.t + 0.05) - fy, wob = Math.sin(now * 14) * (on ? 0.06 : 0.18);
    g.save(); g.translate(x + tw / 2, sy); g.rotate(wob - dy * 6); if (Math.floor(F.t / 1.7) % 2) g.scale(-1, 1);   // (it turns about now and then; up or down it noses)
    drawFish(g, SILHOUETTE, 0, 0, 30, { ink: leg ? '#ffe6a0' : '#d8ecf4', glow: leg ? '#ffd34a' : 'rgba(0,0,0,.6)' });
    g.restore();
    // the catch meter
    const mx = x + tw + 10, mh = th * F.prog;
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(mx, y, 12, th);
    g.fillStyle = `hsl(${F.prog * 120},85%,52%)`; g.fillRect(mx + 1, y + th - mh, 10, mh);
    g.restore();
  }
  showCard(m) { this.card = m; this.cardAt = performance.now() / 1000; }
  // the catch card: the fish, its name and weight, the log's news, what it's worth
  drawCard(g, W, H, now0) {
    const m = this.card, f = FS.FISH[m.f], t = performance.now() / 1000 - this.cardAt;
    if (!f || t > 4.2) { this.card = null; return; }
    const a = t < 0.2 ? t / 0.2 : t > 3.7 ? (4.2 - t) / 0.5 : 1, leg = f.rare === 5;
    const cw = Math.min(360, W - 32), ch = 200, cx = W / 2, cy = H * 0.3, x = cx - cw / 2, y = cy - ch / 2;
    g.save();
    g.globalAlpha = Math.max(0, a);
    g.fillStyle = 'rgba(12,20,30,.9)'; rr(g, x, y, cw, ch, 12); g.fill();
    g.strokeStyle = leg ? '#ffd34a' : f.rare >= 4 ? '#c890ff' : f.rare >= 3 ? '#58b8ff' : '#c8a060'; g.lineWidth = 3; rr(g, x, y, cw, ch, 12); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const banner = m.wr ? 'NEW RECORD!' : m.nw ? 'NEW SPECIES!' : m.pb ? 'PERSONAL BEST!' : leg ? 'LEGENDARY!' : '';
    if (banner) { g.font = '700 14px "Barlow Condensed", sans-serif'; g.fillStyle = leg || m.wr ? '#ffd34a' : '#7fe07f'; g.fillText(banner, cx, y + 18); }
    const L = Math.min(cw * 0.62, 70 + Math.min(1, Math.log10(1 + m.lb) / 3) * 160), sway = Math.sin(now0 * 3) * 0.04;
    g.save(); g.translate(cx, y + 74); g.rotate(sway); drawFish(g, f, 0, 0, L, { glow: leg ? '#ffd34a' : null }); g.restore();
    g.font = '700 20px "CLA Pixel", "Barlow Condensed", sans-serif'; g.fillStyle = '#fff'; g.fillText(f.name, cx, y + 128);
    g.font = '700 16px "Barlow Condensed", sans-serif'; g.fillStyle = '#dde';
    g.fillText(`${m.lb} lb · ${'★'.repeat(f.rare)}${'☆'.repeat(Math.max(0, 5 - f.rare))} ${FS.RARITY[f.rare]}`, cx, y + 152);
    g.font = '600 14px "Barlow Condensed", sans-serif'; g.fillStyle = '#bcd';
    g.fillText(`about $${fmt(m.v)} at the fish market · ${m.n} of ${m.of} kinds in your log`, cx, y + 176);
    g.restore();
  }
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
