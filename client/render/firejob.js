// The fires on the ground and the firefighter's hose (H68: server/systems/firefighter.js), loaded the first time either
// turns up near you (main.js: the 'fires' message, the 'hose' event). Drawn on the overlay both renderers share
// (main.js drawOverlays: over the classic view's world, on the transparent layer over art v2's), so they look the same in
// both: the scorched grass a fire leaves, the flames of a grass fire tile by tile (a dumpster's or a kitchen's taller,
// smokier), their glow, and the hose - the canvas line from the engine to the one holding it, the stream of water out
// to where it reaches, the spray where it lands. The smoke and the droplets are the pooled particles (render/fx.js).
//   draw(g, F, S)      S.fires: { f: [tx, ty, kind, heat 1-9, ...], s: [tx, ty, ...] }; S.hoses: id -> the last 'hose'
const TILE = 32;
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the flame tongues (4 frames) and the glow, drawn once
let FLAMES = null, GLOW = null;
function sprites() {
  FLAMES = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 30;
    const x = c.getContext('2d'), lean = (k - 1.5) * 1.3;
    const tongue = (w, h, col) => {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(8 - w, 29);
      x.quadraticCurveTo(8 - w * 1.1, 29 - h * 0.55, 8 + lean, 29 - h);
      x.quadraticCurveTo(8 + w * 1.1, 29 - h * 0.55, 8 + w, 29);
      x.closePath();
      x.fill();
    };
    tongue(7, 28 - k, '#d8401a');
    tongue(5, 21 - k, '#ff9a1a');
    tongue(3, 13 - (k & 1) * 2, '#ffe36a');
    FLAMES.push(c);
  }
  GLOW = document.createElement('canvas');
  GLOW.width = GLOW.height = 64;
  const x = GLOW.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,170,60,0.55)'); gr.addColorStop(0.5, 'rgba(255,110,30,0.22)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
}

export function draw(g, F, S) {
  if (!FLAMES) sprites();
  const t = performance.now() / 1000, V = F.view, fx = S.fx, dt = Math.min(0.1, F.dt || 0.016);
  const inV = (x, y, m) => x > V.x0 - m && x < V.x1 + m && y > V.y0 - m && y < V.y1 + m;
  const fires = S.fires;
  if (fires) {
    const s = fires.s || [], f = fires.f || [];
    // the scorched ground: dark (one shade, no seams between tiles), blotched darker, flecked with ash
    g.fillStyle = 'rgba(30,22,14,0.64)';
    for (let i = 0; i < s.length; i += 2) { const x = s[i] * TILE, y = s[i + 1] * TILE; if (inV(x, y, 40)) g.fillRect(x, y, TILE, TILE); }
    for (let i = 0; i < s.length; i += 2) {
      const x = s[i] * TILE, y = s[i + 1] * TILE;
      if (!inV(x, y, 40)) continue;
      const h = hash(s[i], s[i + 1]);
      g.fillStyle = 'rgba(14,10,6,0.35)';
      g.beginPath(); g.arc(x + 8 + h * 16, y + 10 + hash(s[i + 1], s[i]) * 12, 6 + h * 7, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(110,104,96,0.6)';
      g.fillRect(x + 5 + h * 14, y + 7 + h * 9, 3, 2);
      g.fillRect(x + 20 - h * 9, y + 21 - h * 6, 2, 2);
    }
    // the glow under the flames
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < f.length; i += 4) {
      const x = f[i] * TILE + 16, y = f[i + 1] * TILE + 16;
      if (!inV(x, y, 80)) continue;
      const r = (f[i + 2] ? 54 : 34) * (0.75 + 0.05 * f[i + 3]) * (0.92 + 0.08 * Math.sin(t * 11 + i));
      g.drawImage(GLOW, x - r, y - r, r * 2, r * 2);
    }
    g.restore();
    // the flames: tongues across the tile, licking up; a dumpster's or a kitchen's taller; the smoke rising off them
    for (let i = 0; i < f.length; i += 4) {
      const tx = f[i], ty = f[i + 1], k = f[i + 2], heat = f[i + 3] / 6, x0 = tx * TILE, y0 = ty * TILE;
      if (!inV(x0, y0, 60)) continue;
      const h = hash(tx, ty), n = k ? 6 : 4, big = k ? 1.6 : 1;
      for (let j = 0; j < n; j++) {
        const hj = hash(tx * 7 + j, ty * 13 - j);
        const ox = k ? 16 + (hj - 0.5) * 22 : 4 + hj * 24, oy = k ? 18 + (hash(j, tx) - 0.5) * 14 : 6 + hash(ty, j) * 22;
        const fl = 0.72 + 0.28 * Math.sin(t * (8 + hj * 5) + h * 30 + j * 2.1);
        const hh = (12 + 12 * heat) * big * fl, ww = hh * 0.55;
        g.drawImage(FLAMES[((t * 12 + j + h * 9) | 0) & 3], x0 + ox - ww / 2, y0 + oy - hh, ww, hh);
      }
      if (fx && Math.random() < dt * (k ? 5 : 1.6)) fx.smoke(x0 + 16 + (h - 0.5) * 12, y0 + 6, k > 0 || heat > 1);
    }
  }
  // the hoses: the canvas line from the engine, the stream of water, the spray where it lands
  const H = S.hoses;
  if (H && H.size) {
    const now = performance.now();
    for (const [id, ev] of H) {
      if (now - ev.at > 260) { H.delete(id); continue; }
      const e = S.ents && S.ents.get(id);
      const live = e && e.rx !== undefined && Math.hypot(e.rx - ev.x, e.ry - ev.y) < 80;
      const px = live ? e.rx : ev.x, py = live ? e.ry : ev.y, a = ev.a, c = Math.cos(a), s = Math.sin(a), l = ev.l;
      if (!inV(px, py, 260)) continue;
      // the hose from the engine, sagging along the ground
      const mx = (px + ev.tx) / 2 + Math.sin(t * 0.7) * 6, my = (py + ev.ty) / 2 + 14;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(40,10,6,0.45)'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(ev.tx, ev.ty + 2); g.quadraticCurveTo(mx, my + 2, px, py + 2); g.stroke();
      g.strokeStyle = '#a8321c'; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(ev.tx, ev.ty); g.quadraticCurveTo(mx, my, px, py); g.stroke();
      // the stream: a wide pale body, a brighter middle, a white core - wavering, thinning out to where it lands
      const x1 = px + c * 12, y1 = py + s * 12;
      const pts = [];
      for (let d = 0; d <= l - 12; d += 12) { const w = Math.sin(t * 34 + d * 0.16) * 1.6 * (d / l); pts.push(x1 + c * d - s * w, y1 + s * d + c * w); }
      pts.push(px + c * l, py + s * l);
      for (const [lw, col] of [[8, 'rgba(190,225,255,0.28)'], [4.2, 'rgba(160,210,255,0.7)'], [1.6, 'rgba(255,255,255,0.92)']]) {
        g.strokeStyle = col; g.lineWidth = lw;
        g.beginPath(); g.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
        g.stroke();
      }
      const ex = px + c * l, ey = py + s * l;
      g.fillStyle = 'rgba(220,240,255,0.3)';
      g.beginPath(); g.arc(ex, ey, 13 + Math.sin(t * 20) * 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(235,248,255,0.85)';
      for (let k = 0; k < 7; k++) { const aa = a + (Math.random() - 0.5) * 2.2, rr = 4 + Math.random() * 16; g.fillRect(ex + Math.cos(aa) * rr, ey + Math.sin(aa) * rr, 2, 2); }
      if (fx && Math.random() < dt * 14) { const aa = a + (Math.random() - 0.5) * 1.8, sp = 40 + Math.random() * 70; fx.spawn(5, ex, ey, Math.cos(aa) * sp, Math.sin(aa) * sp, 0.4, 2, '#d8f0ff', 0, 50); }
    }
  }
}
