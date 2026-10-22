// The underground stations' platforms in the subway's tunnel view (client/render/trains.js drawTunnel; loaded by main.js
// the first time you're down there - kept out of the page's first load).
// The underground stations' platforms (the owner, 10-22: at Port Westport Station the subway showed only the dark):
// beside each station's track, on the side away from the other line's track, a platform the train's length - its tiles,
// the yellow line at the edge, pillars, benches, the station's name - worked out once per map.
const platCache = new WeakMap();
function tunnelPlatforms(map) {
  let c = platCache.get(map);
  if (c) return c;
  c = [];
  const rails = map.rails || (map.rail ? [map.rail] : []);
  const nearOn = (r, x, y) => {   // (the nearest point of r's underground track to x, y: [distance, point, direction])
    let best = null, bd = Infinity;
    const pts = r.pts || [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i], q = pts[i + 1];
      if (!p.under || !q.under || Math.abs(p.x - x) > 600 || Math.abs(p.y - y) > 600) continue;
      const dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / L2));
      const cx = p.x + dx * t, cy = p.y + dy * t, d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = [d, cx, cy, dx, dy]; }
    }
    return best;
  };
  for (const r of rails) for (const st of r.stations || []) {
    if (!st.under || st.el) continue;
    const at = nearOn(r, st.x, st.y);
    if (!at || at[0] > 90) continue;
    const L = Math.hypot(at[3], at[4]) || 1, ux = at[3] / L, uy = at[4] / L, nx = -uy, ny = ux;
    // the other line's track close by: the platform on the far side from it
    let side = 1;
    for (const r2 of rails) {
      if (r2 === r) continue;
      const o = nearOn(r2, at[1], at[2]);
      if (o && o[0] < 160) { side = (o[1] - at[1]) * nx + (o[2] - at[2]) * ny > 0 ? -1 : 1; break; }
    }
    if (c.some((q) => Math.hypot(q.x - at[1], q.y - at[2]) < 60 && q.side * (q.nx * nx + q.ny * ny) > 0)) continue;   // (one a side)
    c.push({ x: at[1], y: at[2], a: Math.atan2(uy, ux), nx, ny, side, name: st.name || '' });
  }
  platCache.set(map, c);
  return c;
}
function drawPlatform(g, P) {
  const s = P.side, y0 = s > 0 ? 44 : -82, HL = 170;
  g.save(); g.translate(P.x, P.y); g.rotate(P.a);
  g.fillStyle = '#2a2d34'; g.fillRect(-HL - 6, y0 - 4, HL * 2 + 12, 46);   // (the wall behind it)
  g.fillStyle = '#6e737d'; g.fillRect(-HL, y0, HL * 2, 38);
  g.fillStyle = '#7c818b'; for (let x = -HL; x < HL; x += 16) g.fillRect(x, y0, 15, 38);   // (the tiles)
  g.fillStyle = '#f2c21b'; g.fillRect(-HL, s > 0 ? y0 : y0 + 34, HL * 2, 4);   // (the yellow line at the edge)
  g.fillStyle = '#3a3e46'; for (let x = -HL + 40; x < HL; x += 80) g.fillRect(x - 4, s > 0 ? y0 + 22 : y0 + 8, 8, 8);   // (the pillars)
  g.fillStyle = '#4a3a2a'; for (const x of [-100, 0, 100]) g.fillRect(x - 14, s > 0 ? y0 + 32 : y0 + 2, 28, 5);   // (the benches)
  g.restore();
  // the name, level, on the platform
  const tx = P.x + P.nx * s * 63, ty = P.y + P.ny * s * 63;
  g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = g.measureText(P.name).width + 12;
  g.fillStyle = '#1d3f8a'; g.fillRect(tx - w / 2, ty - 8, w, 16);
  g.fillStyle = '#ffffff'; g.fillText(P.name, tx, ty + 0.5);
}
export function drawPlatforms(g, map, x0, y0, x1, y1) {
  for (const P of tunnelPlatforms(map)) if (P.x > x0 && P.x < x1 && P.y > y0 && P.y < y1) drawPlatform(g, P);
}
