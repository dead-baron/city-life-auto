// Sun shadows, cast live: every building, the elevated highway, trees and lamp posts throw a
// shadow away from the sun - long and thin at sunrise and in the golden hour, short at noon,
// gone at night - all in one fill, so where shadows overlap they don't get darker.
const hull = (pts) => {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop();
  return lo.concat(up);
};
function rectShadow(g, x0, y0, x1, y1, vx, vy) {
  const h = hull([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + vx, y0 + vy], [x1 + vx, y0 + vy], [x1 + vx, y1 + vy], [x0 + vx, y1 + vy]]);
  g.moveTo(h[0][0], h[0][1]);
  for (let i = 1; i < h.length; i++) g.lineTo(h[i][0], h[i][1]);
  g.closePath();
}
// buildings: BuildingLayer items (lifted ones have H; painted lots are given a nominal height)
export function drawBuildingShadows(g, items, sky) {
  const a = 0.46 * sky.sun;
  if (a < 0.02) return;
  const L = sky.shadowLen, dx = sky.sunDir.x, dy = sky.sunDir.y;
  g.save();
  g.fillStyle = `rgba(16,20,48,${a.toFixed(3)})`;
  g.beginPath();
  for (const it of items) {
    if (it.flat) continue;
    const h = it.H * L;
    rectShadow(g, it.x0, it.y0, it.x1, it.y1, dx * h, dy * h);
  }
  g.fill();
  // painted lots: their own art has its shadows drawn in, so theirs is lighter
  g.fillStyle = `rgba(16,20,48,${(a * 0.55).toFixed(3)})`;
  g.beginPath();
  for (const it of items) {
    if (!it.flat || it.b.kind === 'motorpool') continue;
    const h = 36 * L;
    rectShadow(g, it.x0, it.y0, it.x1, it.y1, dx * h, dy * h);
  }
  g.fill();
  g.restore();
}
// trees, palms, lamp posts: a soft blot thrown along the ground
export function drawPropShadows(g, props, sky, size) {
  const a = 0.34 * sky.sun;
  if (a < 0.02 || !props.length) return;
  const L = Math.min(2.2, sky.shadowLen), dx = sky.sunDir.x, dy = sky.sunDir.y;
  g.save();
  g.fillStyle = `rgba(16,20,48,${a.toFixed(3)})`;
  g.beginPath();
  for (const p of props) {
    const s = size(p);
    if (!s) continue;
    const h = s.h * L, r = s.r;
    const cx = p.x + dx * h * 0.6, cy = p.y + dy * h * 0.6;
    const ang = Math.atan2(dy, dx);
    g.moveTo(cx + Math.cos(ang) * (r + h * 0.4), cy + Math.sin(ang) * (r + h * 0.4));
    g.ellipse(cx, cy, r + h * 0.4, r * 0.7, ang, 0, 6.283);
  }
  g.fill();
  g.restore();
}

// Contact shade: the ground darkens close round every building's foot, whatever the time of day
// (ambient occlusion) - a few soft rings, so walls look like they stand on the ground instead of
// floating over it. Strongest under the front wall, where the street meets it.
export function drawContactShade(g, items, sky) {
  const k = 0.55 + 0.45 * Math.max(sky.sun, 1 - sky.night);
  g.save();
  for (const [pad, a] of [[3, 0.16], [8, 0.09], [15, 0.045]]) {
    g.fillStyle = `rgba(10,12,26,${(a * k).toFixed(3)})`;
    g.beginPath();
    for (const it of items) {
      if (it.flat || it.b.kind === 'motorpool') continue;
      g.rect(it.x0 - pad, it.y0 - pad * 0.5, it.x1 - it.x0 + pad * 2, it.y1 - it.y0 + pad * 1.6);
    }
    g.fill();
  }
  g.restore();
}
