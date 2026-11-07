// Pinwheel Lanes as this page sees it (loaded lazily near the alley: main.js drawBowling). The pins on each lane - up,
// knocked flying when a 'bowl' event says so, swept and set again on 'bowlset' - drawn while you're inside (the roof
// is over them otherwise); with a ball in your hands, the line it would take from where you stand and the power meter;
// your lane's score card at the bottom of the screen. The server decides everything (server/systems/bowling.js).
// (11-07) the lanes as big as the alley draws them (a lane's k: shared/bowling.js) - the pins and the ball k times the
// size; the ball rolled here down the line the server sent ('bowlroll'); each lane's screen over its pins showing its
// bowlers' names and scores (the 'bowl' event's sc), so everyone in the alley sees who's winning.
import { BOWL, ALL_PINS, PINS, rollBall, scoreCard, totalScore, lanePt, rollAt } from '../shared/bowling.js';
import { swingMeter } from '../shared/golf.js';

const FLY_S = 0.9, LIE_S = 1.6, HOOKS = ['no hook', 'hook left', 'hook right'], HOOK_DIR = [0, -1, 1];

export class BowlingView {
  constructor(S) {
    this.S = S;
    const A = S.map.bowling;
    this.lanes = (A ? A.lanes : []).map(() => ({ up: ALL_PINS, fall: null, strikeAt: -9, roll: null, sc: null }));
  }
  event(ev) {
    const ln = this.lanes[ev.lane];
    if (!ln) return;
    const now = performance.now() / 1000;
    if (ev.e === 'bowlroll') { ln.roll = { t0: now, pts: ev.pts, sp: ev.sp }; return; }
    if (ev.e === 'bowl') { ln.fall = { t0: now, down: ev.down, fl: ev.fl || [] }; ln.up = ev.up; ln.roll = null; if (ev.sc) ln.sc = ev.sc; }
    else if (ev.e === 'bowlset') { ln.up = ev.up; ln.fall = null; }
    else if (ev.e === 'bowlx') ln.strikeAt = now;
  }
  draw(g, F, ctx) {
    const S = this.S, A = S.map.bowling, b = ctx.walkInAt(F.sp.x, F.sp.y);
    const now = performance.now() / 1000;
    const me = S.me && S.me.bowl;
    if (b && b.id === A.b) {
      A.lanes.forEach((L, i) => { this.drawLane(g, L, this.lanes[i], now); this.drawBoard(g, L, i === (me && me.lane) ? me : null, this.lanes[i]); });
      this.drawAim(g, F, A);
    }
    if (me) this.drawCard(g, ctx, me, A);
  }
  // the pins up, the ones knocked flying then lying till the sweep, "STRIKE!" over the deck
  drawLane(g, L, ln, now) {
    const spots = PINS.map((p) => lanePt(L, p.u, L.len + p.w));
    const f = ln.fall, ft = f ? now - f.t0 : 99;
    if (f && ft > LIE_S) ln.fall = null;
    const K = L.k || 1;
    for (let i = 9; i >= 0; i--) if (ln.up & (1 << i)) pin(g, spots[i].x, spots[i].y, 0, 0, K);
    if (ln.fall) for (const [i, du, dw] of f.fl) {
      const e = Math.min(1, ft / FLY_S), k = 1 - (1 - e) * (1 - e), s = spots[i];
      const x = s.x + du * k * K * L.right, y = s.y - dw * k * K * L.dir;
      pin(g, x, y, Math.min(1, ft / 0.25), Math.atan2(-dw * L.dir, du * L.right) + i, K);
    }
    if (ln.roll) {   // the ball down its line, turning as it goes
      const at = rollAt(ln.roll.pts, ln.roll.sp, now - ln.roll.t0), q = lanePt(L, at.u, at.v), r = BOWL.BALL_R * K;
      if (at.done && now - ln.roll.t0 > 6) ln.roll = null;
      g.save();
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(q.x + r * 0.25, q.y + r * 0.35, r, r * 0.7, 0, 0, 6.28); g.fill();
      const gr = g.createRadialGradient(q.x - r * 0.35, q.y - r * 0.45, r * 0.1, q.x, q.y, r);
      gr.addColorStop(0, '#9ab8ff'); gr.addColorStop(0.35, '#2a4ac8'); gr.addColorStop(1, '#0e1440');
      g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y - r * 0.2, r, 0, 6.28); g.fill();
      const a = (now - ln.roll.t0) * ln.roll.sp * 0.08;
      g.fillStyle = '#05060c'; for (let h = 0; h < 3; h++) { g.beginPath(); g.arc(q.x + Math.cos(a + h * 0.5) * r * 0.45, q.y - r * 0.2 + Math.sin(a + h * 0.5) * r * 0.3, r * 0.13, 0, 6.28); g.fill(); }
      g.restore();
    }
    if (now - ln.strikeAt < 1.5) {
      const h = lanePt(L, 0, L.len + 8);
      g.save(); g.font = `bold ${7 * K}px sans-serif`; g.textAlign = 'center'; g.fillStyle = `rgba(255,214,64,${1 - (now - ln.strikeAt) / 1.5})`; g.fillText('STRIKE!', h.x, h.y - 16 * K - (now - ln.strikeAt) * 6); g.restore();
    }
  }
  // a lane's screen over its pins (the masking unit on the back wall, art v2's bowlingRoom): its bowlers' names and scores
  // - whose turn it is lit - for everyone near; your own lane's from your card, your frame
  drawBoard(g, L, me, ln) {
    const K = L.k || 1, rows = me ? (me.card || []).map((b, i) => [String(b.name).slice(0, 10), totalScore(b.rolls), b.me ? 1 : 0, i]) : ln && ln.sc ? ln.sc : null;
    if (!rows || !rows.length) return;
    const x = L.ax + L.w / 2, y = L.backEdge - L.dir * 4 - (K > 1 ? 60 : 39), fs = K > 1 ? 9 : 6;
    g.save(); g.textAlign = 'center';
    if (me) { const up = rows.find((r) => r[2]) || rows[0], c = scoreCard((me.card[up[3]] || me.card[0]).rolls); g.font = `bold ${fs}px sans-serif`; g.fillStyle = '#ffd24a'; g.fillText(c.done ? 'FINAL' : `FRAME ${c.frame + 1}`, x, y - fs - 2); }
    g.font = `bold ${fs}px sans-serif`;
    rows.slice(0, 4).forEach((r, i) => { g.fillStyle = r[2] ? '#7dff7a' : '#ffffff'; g.fillText(`${r[0]} ${r[1]}`, x, y + i * (fs + 2)); });
    g.restore();
  }
  // with your ball: the line it would take (the hook bending it late) and the meter beside you
  drawAim(g, F, A) {
    const S = this.S, me = S.me && S.me.bowl;
    if (!me || !me.ball || !me.mine || me.rolling || S.me.dead) return;
    const L = A.lanes[me.lane], sp = F.sp, e = S.ents.get(S.ctrlId);
    if (Math.abs(sp.x - (L.ax + L.w / 2)) > L.w / 2) return;
    const down = L.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    let ang = ((e && e.ra !== undefined ? e.ra : S.lastAim) || 0) - down;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    const holding = S.golfHold >= 0, p = holding ? swingMeter(S.golfHold) : 0.6;
    const r = rollBall(L, (sp.x - L.cx) * L.right / (L.k || 1), ang, p, HOOK_DIR[me.hook] || 0);
    g.save();
    g.fillStyle = 'rgba(255,248,200,.85)';
    r.pts.forEach(([u, v], k) => { if (k % 2) return; const q = lanePt(L, u, v); g.beginPath(); g.arc(q.x, q.y, 0.9 * (L.k || 1), 0, 6.28); g.fill(); });
    if (holding) {
      const x = sp.x + 14, y = sp.y - 34, h = 34, w = 5;
      g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
      g.fillStyle = p > 0.85 ? '#ff6a4a' : p > 0.45 ? '#7dff7a' : '#ffd400'; g.fillRect(x, y + h * (1 - p), w, h * p);
    }
    g.restore();
  }
  // your lane's score card (at the bottom, over the HUD's tracker): each bowler's ten frames, the marks and the running score, whose turn it is
  drawCard(g, ctx, me, A) {
    const rows = me.card || [];
    if (!rows.length) return;
    const DPR = ctx.DPR, W = ctx.W, fw = Math.min(30, Math.floor((Math.min(W - 24, 470) - 96) / 10.5)), nameW = 64;
    const cw = nameW + fw * 10.5 + 34, x0 = Math.round((W - cw) / 2), rh = 28, y0 = Math.round(ctx.H - 84 - rows.length * rh);   // (at the bottom, over the tracker: the top is the HUD's and the pins')
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
function pin(g, x, y, tilt, a, k = 1) {
  g.save();
  g.translate(x, y); g.scale(k, k); x = 0; y = 0;   // (a big alley's pins: k times the size)
  g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 0.6, y + 0.4, 2.4, 1.2, 0, 0, 6.28); g.fill();
  if (tilt < 0.5) {
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
