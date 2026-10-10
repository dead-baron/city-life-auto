// Pinwheel Lanes as this page sees it (loaded lazily near the alley: main.js drawBowling). The pins on each lane - up,
// knocked flying when a 'bowl' event says so, swept and set again on 'bowlset' - drawn while you're inside (the roof
// is over them otherwise); with a ball in your hands, the line it would take from where you stand and the power meter;
// your lane's score card at the top of the screen. The server decides everything (server/systems/bowling.js).
import { BOWL, ALL_PINS, PINS, rollBall, scoreCard, totalScore, lanePt } from '../shared/bowling.js';
import { swingMeter } from '../shared/golf.js';

const FLY_S = 0.9, LIE_S = 1.6, HOOKS = ['no hook', 'hook left', 'hook right'], HOOK_DIR = [0, -1, 1];

export class BowlingView {
  constructor(S) {
    this.S = S;
    const A = S.map.bowling;
    this.lanes = (A ? A.lanes : []).map(() => ({ up: ALL_PINS, fall: null, strikeAt: -9 }));
  }
  event(ev) {
    const ln = this.lanes[ev.lane];
    if (!ln) return;
    const now = performance.now() / 1000;
    if (ev.e === 'bowl') { ln.fall = { t0: now, down: ev.down, fl: ev.fl || [] }; ln.up = ev.up; }
    else if (ev.e === 'bowlset') { ln.up = ev.up; ln.fall = null; }
    else if (ev.e === 'bowlx') ln.strikeAt = now;
  }
  draw(g, F, ctx) {
    const S = this.S, A = S.map.bowling, b = ctx.walkInAt(F.sp.x, F.sp.y);
    const now = performance.now() / 1000;
    if (b && b.id === A.b) {
      A.lanes.forEach((L, i) => this.drawLane(g, L, this.lanes[i], now));
      this.drawAim(g, F, A);
    }
    const me = S.me && S.me.bowl;
    if (me) this.drawCard(g, ctx, me, A);
  }
  // the pins up, the ones knocked flying then lying till the sweep, "STRIKE!" over the deck
  drawLane(g, L, ln, now) {
    const spots = PINS.map((p) => lanePt(L, p.u, L.len + p.w));
    const f = ln.fall, ft = f ? now - f.t0 : 99;
    if (f && ft > LIE_S) ln.fall = null;
    for (let i = 9; i >= 0; i--) if (ln.up & (1 << i)) pin(g, spots[i].x, spots[i].y, 0, 0);
    if (ln.fall) for (const [i, du, dw] of f.fl) {
      const e = Math.min(1, ft / FLY_S), k = 1 - (1 - e) * (1 - e), s = spots[i];
      const x = s.x + du * k * L.right, y = s.y - dw * k * L.dir;
      pin(g, x, y, Math.min(1, ft / 0.25), Math.atan2(-dw * L.dir, du * L.right) + i);
    }
    if (now - ln.strikeAt < 1.5) {
      const h = lanePt(L, 0, L.len + 8);
      g.save(); g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillStyle = `rgba(255,214,64,${1 - (now - ln.strikeAt) / 1.5})`; g.fillText('STRIKE!', h.x, h.y - 16 - (now - ln.strikeAt) * 6); g.restore();
    }
  }
  // with your ball: the line it would take (the hook bending it late) and the meter beside you
  drawAim(g, F, A) {
    const S = this.S, me = S.me && S.me.bowl;
    if (!me || !me.ball || !me.mine || me.rolling || S.me.dead) return;
    const L = A.lanes[me.lane], sp = F.sp, e = S.ents.get(S.ctrlId);
    if (Math.abs(sp.x - (L.ax + BOWL.PITCH / 2)) > BOWL.PITCH / 2) return;
    const down = L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    let ang = ((e && e.ra !== undefined ? e.ra : S.lastAim) || 0) - down;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    const holding = S.golfHold >= 0, p = holding ? swingMeter(S.golfHold) : 0.6;
    const r = rollBall(L, (sp.x - L.cx) * L.right, ang, p, HOOK_DIR[me.hook] || 0);
    g.save();
    g.fillStyle = 'rgba(255,248,200,.85)';
    r.pts.forEach(([u, v], k) => { if (k % 2) return; const q = lanePt(L, u, v); g.beginPath(); g.arc(q.x, q.y, 0.9, 0, 6.28); g.fill(); });
    if (holding) {
      const x = sp.x + 14, y = sp.y - 34, h = 34, w = 5;
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = p > 0.85 ? '#ff6a4a' : p > 0.45 ? '#7dff7a' : '#ffd400'; g.fillRect(x, y + h * (1 - p), w, h * p);
    }
    g.restore();
  }
  // your lane's score card: each bowler's ten frames, the marks and the running score, whose turn it is
  drawCard(g, ctx, me, A) {
    const rows = me.card || [];
    if (!rows.length) return;
    const DPR = ctx.DPR, W = ctx.W, fw = Math.min(30, Math.floor((Math.min(W - 24, 470) - 96) / 10.5)), nameW = 64;
    const cw = nameW + fw * 10.5 + 34, x0 = Math.round((W - cw) / 2), y0 = 54, rh = 28;
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.save();
    g.fillStyle = 'rgba(14,16,30,.86)'; g.fillRect(x0 - 6, y0 - 18, cw + 12, rows.length * rh + 26);
    g.font = 'bold 11px sans-serif'; g.fillStyle = '#ffd24a'; g.textAlign = 'left';
    g.fillText(`Pinwheel Lanes · lane ${me.lane + 1}${me.ball ? ` · ${HOOKS[me.hook]} · hold attack, let go to roll` : me.mine && !me.rolling ? ' · your turn: pick up a ball' : ''}`, x0, y0 - 5);
    rows.forEach((bw, r) => {
      const y = y0 + r * rh, c = scoreCard(bw.rolls), next = c.done ? -1 : c.frame;
      const turn = me.mine ? bw.me : false;
      g.fillStyle = bw.me ? 'rgba(80,120,220,.35)' : 'rgba(255,255,255,.06)'; g.fillRect(x0, y, cw, rh - 3);
      g.font = '10px sans-serif'; g.fillStyle = turn ? '#7dff7a' : '#e8ecf4'; g.textAlign = 'left';
      g.fillText(String(bw.name || '').slice(0, 10), x0 + 4, y + 15);
      c.frames.forEach((fr, k) => {
        const fx = x0 + nameW + k * fw, wdt = k === 9 ? fw * 1.5 : fw;
        g.strokeStyle = k === next && bw.me ? '#ffd24a' : 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.strokeRect(fx + 0.5, y + 0.5, wdt - 1, rh - 4);
        g.font = 'bold 9px sans-serif'; g.textAlign = 'right'; g.fillStyle = '#ffffff';
        fr.marks.forEach((mk, j) => g.fillText(mk, fx + wdt - 3 - (fr.marks.length - 1 - j) * 9, y + 10));
        if (fr.total !== null) { g.font = '9px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#cfe0ff'; g.fillText(String(fr.total), fx + wdt / 2, y + 21); }
      });
      g.font = 'bold 12px sans-serif'; g.textAlign = 'right'; g.fillStyle = '#ffd24a';
      g.fillText(String(totalScore(bw.rolls)), x0 + cw - 3, y + 16);
    });
    g.restore();
  }
}

// a pin: standing (tilt 0) - white, its red neck stripes, a dark edge so it reads on the maple; lying (tilt 1) along
// angle a
function pin(g, x, y, tilt, a) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.4, 2.4, 1.2, 0, 0, 6.28); g.fill();
  if (tilt < 0.5) {
    g.translate(x, y);
    g.fillStyle = '#f4f2ec'; g.strokeStyle = 'rgba(40,36,40,.75)'; g.lineWidth = 0.45;
    g.beginPath(); g.ellipse(0, -3.3, 2.2, 3.3, 0, 0, 6.28); g.fill(); g.stroke();
    g.fillRect(-0.9, -8.2, 1.8, 2.6);
    g.beginPath(); g.arc(0, -9.4, 1.35, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = '#d0302a'; g.fillRect(-1, -7.6, 2, 0.6); g.fillRect(-1, -6.6, 2, 0.6);
  } else {
    g.translate(x, y - 1.5); g.rotate(a);
    g.fillStyle = '#ece8e0'; g.strokeStyle = 'rgba(40,36,40,.75)'; g.lineWidth = 0.45;
    g.beginPath(); g.ellipse(0, 0, 3.4, 2.0, 0, 0, 6.28); g.fill(); g.stroke();
    g.fillRect(3, -0.8, 2.6, 1.6);
    g.beginPath(); g.arc(6, 0, 1.3, 0, 6.28); g.fill(); g.stroke();
    g.fillStyle = '#d0302a'; g.fillRect(3.6, -0.9, 0.6, 1.8); g.fillRect(4.6, -0.9, 0.6, 1.8);
  }
  g.restore();
}
