// The pool tables out in the world as this page sees them (the owner, 2026-11-13: "Balls should move on the table if
// possible" - a game going in the bar for anyone who walks in, the NPCs' and the players'). Loaded with the first table
// the server tells this page about (main.js: the 'ptab' / 'pshot' events - server/systems/pooltables.js). Each table:
// its felt in the world (f: shared/pool.js), its balls; a shot plays out here with the same physics from the same
// numbers the server played it from (the balls settled to 0.01 px, the cue ball's velocity) - so the balls roll on the
// bar's table as they did on the server's, step for step, and stop where it says they stop. Under art v2 the balls are
// sprites in the scene (scene, ballG - 11-27); the classic view draws them over the world (draw). The stroke: the shooter's
// cue drawn back and through (cueFrame: art2/game/peds.js reads e.cueAt), the cue ball off STRIKE s after. Drawn over
// the world while you're inside the table's building (its roof is over them otherwise), at the art's own scale: a ball
// is a dot of 3-4 px on a 90 px table.
import { T, R, STEP, physics, unpackBalls, feltPt } from '../shared/pool.js';
import { GBuf, ART_PX } from './art2/gbuf.js';

export const STRIKE = 0.15;   // s (server/systems/poolnpc.js LAG)
const COL = ['#f4f2ea', '#f2c21b', '#2350c8', '#c8262b', '#6a2ab8', '#ef7a1a', '#2f9a3a', '#8a1d24', '#1a1a1e'];   // (client/pool.js: 1 yellow .. 7 maroon, 8 black; 9-15 striped)
const colOf = (n) => COL[n === 0 ? 0 : n === 8 ? 8 : ((n - 1) % 8) + 1];
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// A ball on the bar's table in the art's own pixels (art v2: the host draws it in the scene - tableSpr): two art pixels
// across, lit from the top left - a glint, its colour, its shaded side; a stripe white over its colour; the cue ball
// white, the eight black. Its height on the felt: BALL_Z.
export const BALL_Z = 3;
export function ballG(n) {
  const G = new GBuf(2, 2), w = [244, 242, 234], c = n === 0 ? w : rgb(colOf(n)), top = n > 8 ? w : c, up = [0, 0, 1];
  G.ap = ART_PX; G.ax = 1; G.ay = 1;
  const px = (x, y, col, k, add = 0) => G.put(x, y, [Math.min(255, col[0] * k + add), Math.min(255, col[1] * k + add), Math.min(255, col[2] * k + add)], up, BALL_Z);
  px(0, 0, top, 1, n === 8 ? 70 : 46); px(1, 0, top, 0.94); px(0, 1, c, 0.86); px(1, 1, c, 0.58);
  return G;
}
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
  // art v2: the balls in the scene, on the felt under the heads of anyone nearer (host.js _entities calls this each
  // frame; draw - the page's overlay - then leaves them alone)
  scene(host, F) {
    const now = performance.now() / 1000;
    this.sceneAt = now; this.tick(now);
    const S = this.S, b = this.ctx && F.sp && this.ctx.walkInAt(F.sp.x, F.sp.y);
    if (!b) return;
    for (const t of this.tabs.values()) {
      if (!t.balls || !t.f || S.map.buildings[t.bi] !== b) continue;
      for (const q of t.balls) { if (q.in) continue; const p = feltPt(t.f, q.x, q.y); host.tableSpr(`pb|${q.n}`, () => ballG(q.n), p.x, p.y, t.f[4]); }
    }
  }
  draw(g, F, ctx) {
    const now = performance.now() / 1000;
    this.ctx = ctx;
    if (now - (this.sceneAt ?? -9) < 0.5) return;   // (art v2 has them in the scene)
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
