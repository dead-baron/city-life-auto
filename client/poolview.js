// The pool tables out in the world as this page sees them (the owner, 2026-11-13: "Balls should move on the table if
// possible" - a game going in the bar for anyone who walks in, the NPCs' and the players'). Loaded with the first table
// the server tells this page about (main.js: the 'ptab' / 'pshot' events - server/systems/pooltables.js). Each table:
// its felt in the world (f: shared/pool.js), its balls; a shot plays out here with the same physics from the same
// numbers the server played it from (the balls settled to 0.01 px, the cue ball's velocity) - so the balls roll on the
// bar's table as they did on the server's, step for step, and stop where it says they stop. The stroke: the shooter's
// cue drawn back and through (cueFrame: art2/game/peds.js reads e.cueAt), the cue ball off STRIKE s after. Drawn over
// the world while you're inside the table's building (its roof is over them otherwise), at the art's own scale: a ball
// is a dot of 3-4 px on a 90 px table.
import { T, R, STEP, physics, unpackBalls, feltPt } from '../shared/pool.js';

export const STRIKE = 0.15;   // s (server/systems/poolnpc.js LAG)
const COL = ['#f4f2ea', '#f2c21b', '#2350c8', '#c8262b', '#6a2ab8', '#ef7a1a', '#2f9a3a', '#8a1d24', '#1a1a1e'];   // (client/pool.js: 1 yellow .. 7 maroon, 8 black; 9-15 striped)
const colOf = (n) => COL[n === 0 ? 0 : n === 8 ? 8 : ((n - 1) % 8) + 1];
const MAX_STEPS = 600;   // a frame's catching up at most (a page that was away: on the next frames)
const none = () => {};

export class PoolView {
  constructor(S) { this.S = S; this.tabs = new Map(); }
  event(ev) {
    const now = performance.now() / 1000;
    let t = this.tabs.get(ev.k);
    if (ev.e === 'ptab') {
      if (!t) this.tabs.set(ev.k, (t = { k: ev.k }));
      t.f = ev.f; t.bi = ev.bi;
      if (t.r === ev.r && t.balls) return;   // (as we have it)
      t.r = ev.r; t.balls = unpackBalls(ev.b || []); t.roll = null;
      return;
    }
    if (ev.e !== 'pshot' || !t || !t.f) return;
    t.r = ev.r; t.balls = unpackBalls(ev.b || []);
    t.roll = { go: now + STRIKE, v: ev.v, n: 0, t: 0, on: false };
    const e = ev.by && this.S.ents ? this.S.ents.get(ev.by) : null;
    if (e) e.cueAt = now;
  }
  // the shots rolling: the physics' fixed steps, as many as the time since the strike says
  tick(now) {
    for (const t of this.tabs.values()) {
      const r = t.roll;
      if (!r || now < r.go) continue;
      const B = t.balls;
      if (!r.on) { r.on = true; B[0].vx = r.v[0]; B[0].vy = r.v[1]; }
      const want = Math.floor((now - r.go) / STEP);
      let k = 0;
      while (r.n < want && k++ < MAX_STEPS) {
        r.n++;
        if (r.t < 30 && physics(B, STEP, none)) r.t += STEP;   // (as shared/pool.js playOut: the same steps, the same end)
        else { for (const b of B) { b.vx = 0; b.vy = 0; } t.roll = null; break; }
      }
    }
  }
  draw(g, F, ctx) {
    const now = performance.now() / 1000;
    this.tick(now);
    const S = this.S, b = F.sp && ctx.walkInAt(F.sp.x, F.sp.y);
    if (!b) return;
    const dim = F.sky && F.sky.night ? 0.3 * F.sky.night : 0;
    for (const t of this.tabs.values()) {
      if (!t.balls || !t.f || S.map.buildings[t.bi] !== b) continue;
      const f = t.f, r = Math.max(1.4, R * (f[2] - f[0]) / (T.x1 - T.x0)), z = f[4];
      g.save();
      for (const q of t.balls) {
        if (q.in) continue;
        const p = feltPt(f, q.x, q.y), x = p.x, y = p.y - z;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 0.5, y + 0.7, r, 0, 6.2832); g.fill();
        g.fillStyle = q.n > 8 ? '#f4f2ea' : colOf(q.n); g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill();
        if (q.n > 8) { g.save(); g.clip(); g.fillStyle = colOf(q.n); g.fillRect(x - r, y - r * 0.45, r * 2, r * 0.9); g.restore(); }   // (a stripe: the band round its middle)
        if (dim) { g.fillStyle = `rgba(6,8,20,${dim.toFixed(2)})`; g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(x - r * 0.55, y - r * 0.7, 1, 1);   // (the shine)
      }
      g.restore();
    }
  }
}
