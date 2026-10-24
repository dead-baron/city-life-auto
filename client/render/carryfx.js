// Lights to carry, felling trees and the police dogs' leads (tasks #358, #359; the owner's notes 2), drawn on the overlay
// in world space (main.js loads this at the start and calls draw(g, F) over the art v2 world, over(g, F) over either
// view - the classic one too, like render/campfx.js).
//   over(): - a felled tree toppling (fall(), from the 'treefall' event): tipping over, faster and faster, from upright
//             to flat the way it falls over the second the server gives it (FALL_S), a bounce off the ground and back,
//             then settling, the crown shaking a moment - dust and leaves where it lands (crash(), 'treecrash')
//           - its trunk lying there (this.logs: from the fall, or S.logs0 - the welcome's [index, size, mask, ...]),
//             cut into rounds a round at a time ('logcut': cut()), the cut faces showing, till it's all cut up
//           - a police dog on its lead (server k9.js: the dog's parent field is its handler's): the lead from the
//             handler's hand to its collar, slack or pulled tight
//   draw(): the lights on the ground (S.glights, kept by main.js from the server's 'glight'): a road flare sputtering
//           red with sparks and smoke, a glow stick, a lantern. Their light is the renderer's (art2/game/host.js).
import { K } from '../../shared/constants.js';
import { TREE_SIZES, roundAlong } from '../../shared/felling.js';
const FALL_S = 1.2;   // (server felling.js FALL_S)
const LEN = [0, 64, 104, 190, 330], CROWN = [0, 18, 26, 34, 56], TRUNK = [0, 3, 4, 6, 10];
const BOUNCE_S = 0.38, SETTLE_S = 0.9, BOUNCE = 0.13;   // (up off the ground after it hits: how long, how high - radians)
const LEAF = ['#3d6b2a', '#4f8434', '#2f5a22', '#6a9a3c'];

export class CarryFx {
  constructor(S) { this.S = S; this.logs = new Map(); this.puff = 0; }
  // a tree starts to fall (the 'treefall' event): its base, the angle it falls at, its size; i: its prop
  fall(x, y, a, s, sp, i) {
    s = Math.max(1, Math.min(4, s | 0));
    if (this.logs.size > 40) this.logs.delete(this.logs.keys().next().value);
    this.logs.set(i ?? -this.logs.size - 1, { x, y, a, s, m: (1 << (TREE_SIZES[s] ? TREE_SIZES[s].logs : 1)) - 1, t0: performance.now() / 1000, palm: !!sp });
  }
  // a round cut off a trunk (the 'logcut' event: m what's left of it - 0 all cut up, or cleared away): chips and sawdust
  cut(ev) {
    const L = this.logs.get(ev.i);
    if (!L) return;
    if (!ev.m) this.logs.delete(ev.i); else L.m = ev.m;
    if (ev.x === undefined) return;
    const fx = this.S.fx;
    for (let k = 0; k < 8; k++) { const an = Math.random() * 6.28, sp = 30 + Math.random() * 70; fx.spawn(1, ev.x, ev.y, Math.cos(an) * sp, Math.sin(an) * sp, 0.4 + Math.random() * 0.4, 1.5 + Math.random() * 1.5, k & 1 ? '#d8b07a' : '#8a5a34', 0, 40 + Math.random() * 40); }
  }
  // it lands: dust along the trunk, leaves thrown up at the crown
  crash(x, y, a, s) {
    const fx = this.S.fx, n = 4 + s * 3;
    for (let k = 0; k < n; k++) {
      const d = (k / n) * LEN[s], px = x - Math.cos(a) * d, py = y - Math.sin(a) * d;
      fx.smoke(px + (Math.random() - 0.5) * 14, py + (Math.random() - 0.5) * 10, false);
    }
    for (let k = 0; k < 10 + s * 6; k++) {
      const an = Math.random() * 6.28, sp = 40 + Math.random() * 120;
      fx.spawn(1, x + (Math.random() - 0.5) * CROWN[s], y + (Math.random() - 0.5) * CROWN[s], Math.cos(an) * sp, Math.sin(an) * sp, 0.5 + Math.random() * 0.5, 2 + Math.random() * 2, LEAF[k & 3], 0, 60 + Math.random() * 80);
    }
    fx.ring(x, y, 20 + s * 10, 'rgba(150,130,100,', 0.5);
  }
  // a trunk at th from upright (pi/2: flat on the ground): the point d px up it
  _pt(L, d, th) { const c = Math.cos(L.a), s = Math.sin(L.a), st = Math.sin(th); return [L.x + c * d * st, L.y + s * d * st - d * Math.cos(th)]; }
  over(g, F) {
    const S = this.S, now = performance.now() / 1000, v = F.view;
    if (S.logs0) {   // (the trunks lying there when you came: [index, size, mask, ...] - the props' felled angle, main.js setFelled)
      const l = S.logs0; S.logs0 = null;
      for (let k = 0; k + 2 < l.length; k += 3) { const p = S.map.props[l[k]]; if (p && p.broken) this.logs.set(l[k], { x: p.x, y: p.y, a: p.broken.a, s: l[k + 1], m: l[k + 2], t0: -1e9, palm: p.t.startsWith('palm') }); }
    }
    g.save();
    g.lineCap = 'round';
    for (const L of this.logs.values()) {
      const len = LEN[L.s], t = (now - L.t0) / FALL_S;
      if (v && (L.x + len < v.x0 - 40 || L.x - len > v.x1 + 40 || L.y + len < v.y0 - 40 || L.y - len > v.y1 + 40)) continue;
      // the fall: tipping, faster and faster; a bounce up off the ground and back; settled, the crown shaking a moment
      let th = Math.PI / 2, shake = 0;
      if (t < 1) th = (Math.PI / 2) * t * t;
      else { const u = (now - L.t0 - FALL_S) / BOUNCE_S; if (u < 1) th = Math.PI / 2 - BOUNCE * Math.sin(Math.PI * u) * (1 - u * 0.4); else { const w = (now - L.t0 - FALL_S - BOUNCE_S) / SETTLE_S; if (w < 1) shake = Math.sin(now * 38) * 2.2 * (1 - w); } }
      const n = TREE_SIZES[L.s] ? TREE_SIZES[L.s].logs : 1, wd = TRUNK[L.s] * 2;
      // the crown, out at the top (while there's trunk left to it)
      if (L.m) {
        const r = CROWN[L.s], [cx0, cy0] = this._pt(L, len * 0.86, th), cx = cx0 + shake * -Math.sin(L.a), cy = cy0 + shake * Math.cos(L.a);
        const [bx, by] = this._pt(L, roundAlong(L.s, n), th);
        g.strokeStyle = '#4a3020'; g.lineWidth = Math.max(2, wd * 0.6); g.beginPath(); g.moveTo(bx, by); g.lineTo(cx, cy); g.stroke();
        g.fillStyle = '#28461c'; g.beginPath(); g.ellipse(cx, cy + 2, r, r * 0.8, L.a, 0, 6.283); g.fill();
        g.fillStyle = L.palm ? '#5c8c34' : '#3f6e2a'; g.beginPath(); g.ellipse(cx - 2, cy - 1, r * 0.86, r * 0.68, L.a, 0, 6.283); g.fill();
        g.fillStyle = '#5f9440'; g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.25, r * 0.4, r * 0.3, L.a, 0, 6.283); g.fill();
      }
      // the trunk: the rounds still on it, a cut face showing at each end that's been cut
      for (let k = 0; k < n; k++) {
        if (!(L.m & (1 << k))) continue;
        const [x0, y0] = this._pt(L, roundAlong(L.s, k) + (k ? 0 : -len * 0.1), th), [x1, y1] = this._pt(L, roundAlong(L.s, k + 1), th);
        g.strokeStyle = '#4a3020'; g.lineWidth = wd; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = '#6e4a30'; g.lineWidth = Math.max(1, wd * 0.4); g.beginPath(); g.moveTo(x0, y0 - wd * 0.2); g.lineTo(x1, y1 - wd * 0.2); g.stroke();
        for (const [ex, ey, cutEnd] of [[x0, y0, k > 0 && !(L.m & (1 << (k - 1)))], [x1, y1, k < n - 1 && !(L.m & (1 << (k + 1)))]]) {
          if (!cutEnd) continue;
          g.fillStyle = '#d8b07a'; g.beginPath(); g.ellipse(ex, ey, wd * 0.32, wd * 0.5, L.a, 0, 6.283); g.fill();
          g.strokeStyle = '#a07040'; g.lineWidth = 1; g.beginPath(); g.ellipse(ex, ey, wd * 0.18, wd * 0.3, L.a, 0, 6.283); g.stroke();
        }
      }
    }
    // the police dogs on their leads (the dog's parent: its handler, the one holding it)
    g.strokeStyle = '#2e2218'; g.lineWidth = 1.3;
    for (const e of S.ents.values()) {
      if (e.kind !== K.PED || !e.parent || !e.d || !e.d.ar || !e.d.ar.startsWith('pet:')) continue;
      const h = S.ents.get(e.parent);
      if (!h || h.kind !== K.PED || (v && (e.rx < v.x0 - 60 || e.rx > v.x1 + 60 || e.ry < v.y0 - 60 || e.ry > v.y1 + 60))) continue;
      const ha = (h.ra || 0) + 0.9, hx = h.rx + Math.cos(ha) * 6, hy = h.ry + Math.sin(ha) * 6 - 10, dx = e.rx + Math.cos(e.ra || 0) * 7, dy = e.ry + Math.sin(e.ra || 0) * 7 - 7;
      const sag = Math.max(0, 1 - Math.hypot(dx - hx, dy - hy) / 30) * 7;
      g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo((hx + dx) / 2, (hy + dy) / 2 + sag, dx, dy); g.stroke();
    }
    g.restore();
  }
  draw(g, F) {
    const S = this.S, now = performance.now() / 1000;
    // the lights on the ground
    const L = S.glights;
    if (!L || !L.size) return;
    const v = F.view, puff = now - this.puff > 0.12;
    if (puff) this.puff = now;
    g.save();
    for (const q of L.values()) {
      if (v && (q.x < v.x0 - 20 || q.x > v.x1 + 20 || q.y < v.y0 - 20 || q.y > v.y1 + 20)) continue;
      if (q.k === 6) {   // a road flare: a red stick, its white-hot tip, sparks and a trail of smoke
        g.fillStyle = '#9a1c16'; g.fillRect(q.x - 5, q.y - 1, 9, 3);
        g.fillStyle = Math.random() < 0.5 ? '#fff4d8' : '#ff8a6a'; g.fillRect(q.x + 3, q.y - 2, 3, 4);
        if (puff) { if (Math.random() < 0.5) S.fx.sparks(q.x + 4, q.y - 1, 1); if (Math.random() < 0.4) S.fx.smoke(q.x + 4, q.y - 4, false); }
      } else if (q.k === 7) {   // a glow stick: a bright little bar in its colour
        const cc = q.col || [0.35, 1, 0.45], col = `rgb(${cc[0] * 255 | 0},${cc[1] * 255 | 0},${cc[2] * 255 | 0})`;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(q.x - 4, q.y, 9, 2);
        g.fillStyle = col; g.fillRect(q.x - 4, q.y - 2, 8, 2);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(q.x - 2, q.y - 2, 3, 1);
      } else if (q.k === 4) {   // a lantern: a dark frame round a warm glass (dark when its batteries are flat)
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(q.x - 4, q.y + 1, 9, 2);
        g.fillStyle = '#2a2a30'; g.fillRect(q.x - 4, q.y - 11, 8, 2); g.fillRect(q.x - 4, q.y - 1, 8, 2); g.fillRect(q.x - 4, q.y - 9, 1, 8); g.fillRect(q.x + 3, q.y - 9, 1, 8);
        g.fillStyle = q.dark ? '#6a6458' : '#ffd890'; g.fillRect(q.x - 3, q.y - 9, 6, 8);
        g.strokeStyle = '#2a2a30'; g.lineWidth = 1; g.beginPath(); g.arc(q.x, q.y - 12, 3, Math.PI, 0); g.stroke();
      }
    }
    g.restore();
  }
}
