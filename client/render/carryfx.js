// Lights to carry and felling trees (tasks #358, #359), drawn on the overlay over the art v2 world (main.js loads this
// the first time it's needed and calls draw(g, F) in world space, like render/campfx.js). Placeholder art until the
// concept sheets come (WD1-WD3): everything here is plain shapes, easy to swap for sprites.
//   - a felled tree toppling: its trunk and crown tipping over from upright to flat along the way it falls, over the
//     second the server gives it (FALL_S), then dust and leaves where it lands (crash(), from the 'treecrash' event)
//   - the lights on the ground (S.glights, kept by main.js from the server's 'glight'): a road flare sputtering red
//     with sparks and smoke, a glow stick, a lantern. Their light is the renderer's (art2/game/host.js).
const FALL_S = 1.2;   // (server felling.js FALL_S)
const LEN = [0, 64, 104, 190, 330], CROWN = [0, 18, 26, 34, 56], TRUNK = [0, 3, 4, 6, 10];
const LEAF = ['#3d6b2a', '#4f8434', '#2f5a22', '#6a9a3c'];

export class CarryFx {
  constructor(S) { this.S = S; this.falls = []; this.puff = 0; }
  // a tree starts to fall (the 'treefall' event): its base, the angle it falls at, its size
  fall(x, y, a, s, sp) { if (this.falls.length < 12) this.falls.push({ x, y, a, s: Math.max(1, Math.min(4, s | 0)), t0: performance.now() / 1000, palm: !!sp }); }
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
  draw(g, F) {
    const S = this.S, now = performance.now() / 1000;
    // the falling trees
    for (let k = this.falls.length - 1; k >= 0; k--) {
      const f = this.falls[k], t = (now - f.t0) / FALL_S;
      if (t >= 1) { this.falls.splice(k, 1); continue; }
      const th = (Math.PI / 2) * t * t, L = LEN[f.s], c = Math.cos(f.a), s = Math.sin(f.a), st = Math.sin(th), ct = Math.cos(th);
      const tx = f.x + c * L * st, ty = f.y + s * L * st - L * ct;   // (the top: out along the ground, and up the screen as high as it stands)
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = '#4a3020'; g.lineWidth = TRUNK[f.s] * 2;
      g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(tx, ty); g.stroke();
      g.strokeStyle = '#6e4a30'; g.lineWidth = Math.max(1, TRUNK[f.s] * 0.8);
      g.beginPath(); g.moveTo(f.x - 1, f.y); g.lineTo(tx - 1, ty); g.stroke();
      const r = CROWN[f.s], cx = f.x + (tx - f.x) * 0.82, cy = f.y + (ty - f.y) * 0.82;
      g.fillStyle = '#28461c'; g.beginPath(); g.ellipse(cx, cy + 2, r, r * 0.8, f.a, 0, 6.283); g.fill();
      g.fillStyle = f.palm ? '#5c8c34' : '#3f6e2a'; g.beginPath(); g.ellipse(cx - 2, cy - 1, r * 0.86, r * 0.68, f.a, 0, 6.283); g.fill();
      g.fillStyle = '#5f9440'; g.beginPath(); g.ellipse(cx - r * 0.3, cy - r * 0.25, r * 0.4, r * 0.3, f.a, 0, 6.283); g.fill();
      g.restore();
    }
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
