// Car soccer as this page sees it (server/systems/carsoccer.js runs it; loaded with its first word - the server sends
// it to the players near an arena: main.js 'soc'). It keeps the page's own car's part of the physics in step (the banks
// and the boost: shared/carsoccer.js carStep, given to shared/physics.js setArena, with the boost and the kick-off hold
// from the server's word - `local`), predicts the giant ball between the server's words (its own physics, stepped
// every frame against the cars as drawn - your car's touch shows at once - and eased back onto the server's ball), and
// draws: the ball and its shadow (up the banks too), the goals' frames and nets, the boost pads lit or spent, the
// scoreboard and the clock, the kick-off's countdown, a goal (the scorer, the confetti, the replay of the ball's last
// seconds), full time; at the wheel your boost and an arrow to the ball when it's off the screen. Drawn over the world
// (main.js drawOverlays, either renderer), in the world's own coordinates; the HUD over the screen.
import { CARSOCCER as C } from '../shared/rules-games.js';
import { TEAMS, TEAM_COL, stepBall, carStep, local, groundZ } from '../shared/carsoccer.js';
import { setArena } from '../shared/physics.js';
import { VEHICLE_BY_INDEX } from '../shared/vehicles.js';
import { K } from '../shared/constants.js';
import { sfx } from './audio.js';

export function onMsg(S, m) {
  if (!S.soc) S.soc = new SoccerView(S);
  S.soc.msg(m);
}

class SoccerView {
  constructor(S) {
    this.S = S; this.st = null; this.ball = null; this.a = null; this.roll = 0; this.confetti = []; this.goalAt = -1; this.kickAt = -1; this.lastHit = 0;
    setArena(carStep);   // (from now on the page's own car feels the banks and the boost, as the server's does)
  }
  msg(m) {
    const S = this.S;
    if (m.off) { this.st = null; this.ball = null; local.bok = false; local.frz = false; return; }
    const a = S.map && S.map.arenas && S.map.arenas[m.a];
    if (!a) return;
    this.a = a;
    const st = this.st || (this.st = { sc: [0, 0], cars: [], ot: 0 }), now = performance.now() / 1000;
    const was = st.ph;
    for (const k of ['ph', 'tl', 'pads', 'me', 'sc', 'ot', 'cars', 'q', 'clock']) if (m[k] !== undefined) st[k] = m[k];
    if (!m.me) st.me = null;
    st.at = now;
    if (st.ph === 'kick' && was !== 'kick') this.kickAt = now;
    if (m.goal && st.ph === 'goal' && was !== 'goal') { this.goalAt = now; st.goal = m.goal; st.rp = m.rp || []; this.burst(a, m.goal.team); }
    if (st.ph === 'play' && was === 'kick') sfx('racego', 0.8);
    if (m.b) {
      const [x, y, z, vx, vy, vz, spin] = m.b, lag = Math.min(0.25, (S.rtt || 100) / 2000);
      const srv = { x: x + vx * lag, y: y + vy * lag, z, vx, vy, vz, spin };
      const B = this.ball;
      if (!B || st.ph !== 'play' || Math.hypot(B.x - srv.x, B.y - srv.y) > 220) this.ball = srv;
      else { const k = 0.35; B.x += (srv.x - B.x) * k; B.y += (srv.y - B.y) * k; B.z += (srv.z - B.z) * k; B.vx += (vx - B.vx) * 0.5; B.vy += (vy - B.vy) * 0.5; B.vz += (vz - B.vz) * 0.5; B.spin = spin; }
    } else this.ball = null;
    local.frz = !!st.me && (st.ph === 'kick' || st.ph === 'over');
    local.bok = !!st.me && st.ph === 'play' && st.me.boost > 0;
  }
  // the cars as they're drawn (your own as the page predicts it), for the ball to meet
  cars() {
    const S = this.S, out = [], a = this.a;
    for (const e of S.ents.values()) {
      if (e.kind !== K.VEH || !e.d || e.rx === undefined || e.rx < a.x0 || e.rx > a.x1 || e.ry < a.y0 || e.ry > a.y1) continue;
      const def = VEHICLE_BY_INDEX[e.d.m];
      if (!def) continue;
      const mine = S.pred && S.pred.kind !== 'ped' && e.id === S.ctrlId;
      const vx = mine ? S.pred.s.vx : e._socx !== undefined ? (e.rx - e._socx) / Math.max(0.008, this.dt) : 0, vy = mine ? S.pred.s.vy : e._socy !== undefined ? (e.ry - e._socy) / Math.max(0.008, this.dt) : 0;
      e._socx = e.rx; e._socy = e.ry;
      out.push({ id: e.id, x: e.rx, y: e.ry, a: e.ra, vx, vy, L: def.L, W: def.W, mine });
    }
    return out;
  }
  draw(g, F, v2) {
    const st = this.st, a = this.a;
    if (!st || !a) return;
    const dt = Math.min(0.05, F.dt || 0.016), now = performance.now() / 1000;
    this.dt = dt;
    const view = F.view, onScreen = !view || !(a.x1 < view.x0 || a.x0 > view.x1 || a.y1 < view.y0 || a.y0 > view.y1);
    const B = this.ball;
    if (B && st.ph === 'play') {   // (the ball predicted: its own physics against the cars as drawn)
      const cars = this.cars();
      stepBall(B, a, dt, cars, (id) => { const c = cars.find((q) => q.id === id); if (c && c.mine && now - this.lastHit > 0.25) { this.lastHit = now; sfx('kick', 1); } });
      this.roll += Math.hypot(B.vx, B.vy) * dt / C.ball.r;
    }
    if (onScreen) { this.goals(g, a); this.pads(g, a, st, now); }
    if (B && onScreen && st.ph !== 'goal') this.drawBall(g, a, B.x, B.y, B.z, this.roll, 1);
    if (st.ph === 'goal' && st.rp && st.rp.length > 1) this.replay(g, a, st, now);
    this.drawConfetti(g, dt);
    this.hud(g, F, st, now, v2);
  }
  // the goals: the frame (posts up the screen, the crossbar), the net behind in its team's colour, the line lit
  goals(g, a) {
    const H = 66;
    for (const [lx, back, t] of [[a.ix0, a.gx0, 0], [a.ix1, a.gx1, 1]]) {
      const col = TEAM_COL[t];
      g.save();
      g.globalAlpha = 0.28; g.fillStyle = col; g.fillRect(Math.min(lx, back), a.my0 - H, Math.abs(back - lx), a.my1 - a.my0);
      g.globalAlpha = 0.5; g.strokeStyle = '#e8eef4'; g.lineWidth = 1;
      for (let y = a.my0; y <= a.my1; y += 16) { g.beginPath(); g.moveTo(lx, y - H); g.lineTo(back, y - H * 0.55); g.stroke(); }
      for (let k = 0; k <= 4; k++) { const x = lx + (back - lx) * k / 4; g.beginPath(); g.moveTo(x, a.my0 - H + H * 0.45 * k / 4); g.lineTo(x, a.my1 - H + H * 0.45 * k / 4); g.stroke(); }
      g.globalAlpha = 1; g.strokeStyle = '#f4f6f8'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(lx, a.my0); g.lineTo(lx, a.my0 - H); g.lineTo(lx, a.my1 - H); g.lineTo(lx, a.my1); g.stroke();
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, a.my0 - H); g.lineTo(lx, a.my1 - H); g.stroke();
      g.globalAlpha = 0.6; g.fillStyle = col; g.fillRect(lx - 2, a.my0, 4, a.my1 - a.my0);
      g.restore();
    }
  }
  pads(g, a, st, now) {
    g.save();
    a.pads.forEach((p, i) => {
      const on = !!(st.pads & (1 << i)), r = p.big ? 26 : 14, pulse = 0.75 + 0.25 * Math.sin(now * 5 + i);
      g.globalAlpha = on ? 0.9 : 0.35;
      g.fillStyle = on ? (p.big ? `rgba(255,170,40,${0.35 * pulse})` : `rgba(255,214,90,${0.3 * pulse})`) : 'rgba(60,60,60,.4)';
      g.beginPath(); g.ellipse(p.x, p.y, r * 1.5, r * 1.05, 0, 0, 6.28); g.fill();
      g.strokeStyle = on ? '#ffd25a' : '#6a6a6a'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.7, 0, 0, 6.28); g.stroke();
      if (on && p.big) { g.fillStyle = `rgba(255,236,170,${0.6 * pulse})`; g.beginPath(); g.ellipse(p.x, p.y - 6 - 4 * pulse, 7, 9, 0, 0, 6.28); g.fill(); }
    });
    g.restore();
  }
  // the giant ball: its shadow on the ground (up a bank where it is), the sphere lit from the north-west, its panels
  // rolling the way it goes
  drawBall(g, a, x, y, z, roll, alpha) {
    const r = C.ball.r, zg = groundZ(a, x, y), cy = y - zg - z - r;
    g.save(); g.globalAlpha = alpha;
    const sh = Math.max(0.25, 1 - z / 400);
    g.fillStyle = `rgba(0,0,0,${0.35 * sh})`; g.beginPath(); g.ellipse(x + 4, y - zg + 2, r * sh, r * 0.45 * sh, 0, 0, 6.28); g.fill();
    const grd = g.createRadialGradient(x - r * 0.35, cy - r * 0.4, r * 0.15, x, cy, r);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.55, '#c8ccd2'); grd.addColorStop(1, '#5e646e');
    g.fillStyle = grd; g.beginPath(); g.arc(x, cy, r, 0, 6.28); g.fill();
    g.beginPath(); g.arc(x, cy, r - 1, 0, 6.28); g.clip();
    g.fillStyle = 'rgba(40,46,56,.55)';
    for (let k = 0; k < 12; k++) {   // the panels: points on the sphere turned by how far it's rolled
      const u = k * 2.399 + roll, v = (k / 12) * 2 - 1 + 1 / 12, s = Math.sqrt(1 - v * v), px = Math.cos(u) * s, pz = Math.sin(u) * s;
      if (pz < 0) continue;
      g.beginPath(); g.ellipse(x + px * r * 0.82, cy + v * r * 0.82, r * 0.17 * (0.4 + pz * 0.6), r * 0.17, 0, 0, 6.28); g.fill();
    }
    g.restore();
    g.save(); g.globalAlpha = alpha * 0.9; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x, cy, r - 1, 3.6, 5.2); g.stroke(); g.restore();
  }
  // a goal's replay: the ball's last seconds again, faint, its trail
  replay(g, a, st, now) {
    const rp = st.rp, k = Math.min(1, (now - this.goalAt) / (C.goalS * 0.8)), n = rp.length - 1, i = Math.min(n - 1, Math.floor(k * n)), f = k * n - i;
    const p = rp[i], q = rp[i + 1];
    g.save(); g.strokeStyle = 'rgba(255,240,180,.5)'; g.lineWidth = 3; g.setLineDash([6, 6]); g.beginPath();
    for (let j = 0; j <= i; j++) { const o = rp[j]; if (j) g.lineTo(o[0], o[1] - o[2]); else g.moveTo(o[0], o[1] - o[2]); }
    g.stroke(); g.restore();
    this.drawBall(g, a, p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f, k * 12, 0.75);
  }
  burst(a, team) {
    const x = team ? a.ix0 : a.ix1;
    for (let k = 0; k < 90; k++) {
      const ang = Math.random() * 6.28, sp = 80 + Math.random() * 260;
      this.confetti.push({ x, y: a.cy + (Math.random() - 0.5) * a.gw, z: 30, vx: Math.cos(ang) * sp * (team ? 1 : -1) * 0.6 + (team ? 120 : -120), vy: Math.sin(ang) * sp, vz: 200 + Math.random() * 300, c: Math.random() < 0.5 ? TEAM_COL[team] : '#f4f0e0', t: 2 + Math.random() * 1.5 });
    }
  }
  drawConfetti(g, dt) {
    if (!this.confetti.length) return;
    for (const c of this.confetti) { c.x += c.vx * dt; c.y += c.vy * dt; c.vz -= 420 * dt; c.z = Math.max(0, c.z + c.vz * dt); c.vx *= 0.98; c.vy *= 0.98; c.t -= dt; g.fillStyle = c.c; g.fillRect(c.x, c.y - c.z, 4, 3); }
    this.confetti = this.confetti.filter((c) => c.t > 0);
  }
  // over the screen: the scoreboard and the clock, what's happening, your boost, the arrow to the ball
  hud(g, F, st, now, v2) {
    const S = this.S, dpr = S.worldTf ? S.worldTf[0] / (F.z || 1) : 1, W = innerWidth, H = innerHeight;
    g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mine = !!st.me, near = mine || st.ph !== 'idle';
    if (near) {
      const wide = W > 900, cw = wide ? 230 : 190, x0 = wide ? Math.max(W / 2 - cw / 2, 610) : W / 2 - cw / 2, y0 = wide ? 56 : 158;   // (clear of the prompt and the messages down the left, under the top buttons)
      g.fillStyle = 'rgba(10,14,22,.78)'; g.fillRect(x0, y0, cw, 34);
      g.fillStyle = TEAM_COL[0]; g.fillRect(x0, y0, 60, 34); g.fillStyle = TEAM_COL[1]; g.fillRect(x0 + cw - 60, y0, 60, 34);
      g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText(String(st.sc[0]), x0 + 30, y0 + 18); g.fillText(String(st.sc[1]), x0 + cw - 30, y0 + 18);
      const tl = st.ph === 'play' ? Math.max(0, (st.tl || 0) - (now - st.at)) : st.ph === 'kick' || st.ph === 'goal' || st.ph === 'over' ? st.clock || 0 : C.matchS;
      g.font = 'bold 18px monospace'; g.fillStyle = st.ot ? '#ffd25a' : '#e8eef4';
      g.fillText(st.ot ? `+${fmt(tl)}` : fmt(tl), x0 + cw / 2, y0 + 18);
      g.font = 'bold 9px monospace'; g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText(TEAMS[0], x0 + 30, y0 + 42); g.fillText(st.ot ? 'OVERTIME' : 'CAR SOCCER', x0 + cw / 2, y0 + 42); g.fillText(TEAMS[1], x0 + cw - 30, y0 + 42);
      const big = (t, sub, col = '#fff') => { g.font = 'bold 54px monospace'; g.fillStyle = 'rgba(0,0,0,.5)'; g.fillText(t, W / 2 + 3, H * 0.36 + 3); g.fillStyle = col; g.fillText(t, W / 2, H * 0.36); if (sub) { g.font = 'bold 16px monospace'; g.fillStyle = '#fff'; g.fillText(sub, W / 2, H * 0.36 + 40); } };
      const left = Math.max(0, (st.tl || 0) - (now - st.at));
      if (st.ph === 'lobby') { g.font = 'bold 14px monospace'; g.fillStyle = '#fff'; g.fillText(`Kick-off in ${Math.ceil(left)} s - ${st.q || 0} player${st.q === 1 ? '' : 's'} in`, x0 + cw / 2, y0 + 60); }
      else if (st.ph === 'kick' && mine) big(left > 0.2 ? String(Math.ceil(left)) : 'GO!', 'Sprint: boost');
      else if (st.ph === 'goal' && st.goal) big('GOAL!', `${st.goal.who} - REPLAY`, TEAM_COL[st.goal.team]);
      else if (st.ph === 'over') { const w = st.sc[0] === st.sc[1] ? -1 : st.sc[0] > st.sc[1] ? 0 : 1; big('FULL TIME', w < 0 ? 'A draw' : `${TEAMS[w]} win`, w < 0 ? '#fff' : TEAM_COL[w]); }
    }
    if (mine) {   // your boost: a ring filling round its number, bottom right
      const cx = W > 700 ? W - 70 : 44, cy = W > 700 ? H - 150 : H * 0.5, r = 30, k = Math.max(0, Math.min(1, st.me.boost / 100));   // (bottom right; on a narrow screen the left edge, clear of the sticks)
      g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(cx, cy, r, 0, 6.28); g.stroke();
      g.strokeStyle = k > 0.25 ? '#ffb02a' : '#e8503a'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + k * 6.28); g.stroke();
      g.font = 'bold 16px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(String(Math.round(st.me.boost)), cx, cy);
      g.font = 'bold 8px monospace'; g.fillText('BOOST', cx, cy + r + 12);
      const B = this.ball, T = S.worldTf;
      if (B && T && st.ph === 'play') {   // the ball off the screen: an arrow at the edge toward it
        const sx = (B.x * T[0] + T[4]) / dpr, sy = ((B.y - B.z - C.ball.r) * T[3] + T[5]) / dpr;
        if (sx < 0 || sy < 0 || sx > W || sy > H) {
          const ax = Math.max(40, Math.min(W - 40, sx)), ay = Math.max(110, Math.min(H - 40, sy)), an = Math.atan2(sy - H / 2, sx - W / 2);
          g.translate(ax, ay); g.rotate(an); g.fillStyle = 'rgba(240,244,250,.9)'; g.beginPath(); g.moveTo(16, 0); g.lineTo(-8, -10); g.lineTo(-8, 10); g.closePath(); g.fill();
        }
      }
    }
    g.restore();
    if (S.worldTf) g.setTransform(...S.worldTf);
    void v2;
  }
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const _test = { SoccerView };
