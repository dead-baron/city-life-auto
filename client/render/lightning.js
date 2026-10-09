// Lightning you can see (the storm concept AT1-B): a forked bolt across the sky, lit for a few frames with the screen's
// flash (weather.js), now and then a near strike that comes down into the street in view and lights the ground where it
// hits. Screen space, drawn over the scene like the rain.
//   boltPath(seed, W, H, near) -> { segs: [[x0, y0, x1, y1, w, k]...], trunk (how many of segs are the main channel,
//     first), end: { x, y } (where it strikes), near }
//     deterministic by seed; every point inside [0, W] x [0, H]; the main channel runs from the top edge down, jagged,
//     forking into branches (thinner and fainter, some forking again). A far bolt ends high on the screen (off in the
//     distance), a near one low (in the street).
//   drawBolt(g, bolt, k, night)   the bolt on a 2D context, additive: a wide soft glow, a bright core; k 0..1 its
//     strength this frame (the flash's flicker), night 0..1 (brighter against a dark sky); a near strike's ground glow
// Pure apart from drawBolt (no DOM), so test/worldbuild.test.js checks the generator.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clampTo = (v, a, b) => (v < a ? a : v > b ? b : v);

export function boltPath(seed, W, H, near = false) {
  const r = rng(seed * 2654435761 + 977), segs = [];
  const X = (v) => Math.round(clampTo(v, 0, W)), Y = (v) => Math.round(clampTo(v, 0, H));
  // the main channel: from somewhere along the top edge to where it strikes
  const x0 = W * (0.12 + r() * 0.76), endY = near ? H * (0.58 + r() * 0.3) : H * (0.16 + r() * 0.3);
  const endX = clampTo(x0 + (r() - 0.5) * W * (near ? 0.35 : 0.5), W * 0.06, W * 0.94);
  const n = Math.max(8, Math.round(endY / Math.max(8, H / 26)));
  const pts = [[X(x0), 0]];
  let x = x0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, aim = x0 + (endX - x0) * t;
    x += (aim - x) * 0.35 + (r() - 0.5) * W * 0.045 * (1 - t * 0.4);   // jagged, but heading for the strike
    pts.push([X(i === n ? endX : x), Y(endY * t + (i < n ? (r() - 0.5) * (endY / n) * 0.5 : 0))]);
  }
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 3, 1]);
  const trunk = segs.length;
  // branches off the channel, heading down and out; some fork again
  const branch = (bx, by, dir, len, w, k, depth) => {
    let px = bx, py = by;
    for (let j = 0; j < len; j++) {
      const nx = px + dir * (W * (0.008 + r() * 0.022)) + (r() - 0.5) * W * 0.012, ny = py + H * (0.022 + r() * 0.035);
      const a = [X(px), Y(py)], b = [X(nx), Y(ny)];
      if (a[0] === b[0] && a[1] === b[1]) break;
      segs.push([a[0], a[1], b[0], b[1], w, k * (1 - j / (len + 2))]);
      if (depth < 2 && r() < 0.22) branch(b[0], b[1], r() < 0.5 ? -dir : dir, Math.max(2, len - j - 2), Math.max(1, w - 0.6), k * 0.7, depth + 1);
      px = nx; py = ny;
      if (ny >= H || nx <= 0 || nx >= W) break;
    }
  };
  for (let i = 1; i < pts.length - 1; i++) if (r() < (i < 3 ? 0.2 : 0.42)) branch(pts[i][0], pts[i][1], r() < 0.5 ? -1 : 1, 3 + Math.floor(r() * 5), 1.8, 0.75, 0);
  if (segs.length === trunk) branch(pts[2][0], pts[2][1], 1, 4, 1.8, 0.75, 0);   // (always at least one fork)
  return { segs, trunk, end: { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] }, near: !!near };
}

export function drawBolt(g, B, k = 1, night = 1) {
  if (!B || k <= 0) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round'; g.lineJoin = 'round';
  const a = Math.min(1, k * (0.65 + 0.35 * night));
  // a near strike lights the ground where it hits
  if (B.near) {
    const R = 140 + 60 * k, gr = g.createRadialGradient(B.end.x, B.end.y, 0, B.end.x, B.end.y, R);
    gr.addColorStop(0, `rgba(210,222,255,${(0.55 * a).toFixed(3)})`); gr.addColorStop(0.35, `rgba(150,170,255,${(0.22 * a).toFixed(3)})`); gr.addColorStop(1, 'rgba(120,140,255,0)');
    g.fillStyle = gr; g.fillRect(B.end.x - R, B.end.y - R, R * 2, R * 2);
  }
  // glow, halo, core: one path per pass and width
  for (const [mul, col, al] of [[5, '140,160,255', 0.1], [2.4, '185,200,255', 0.28], [1, '248,250,255', 1]]) {
    for (const w of [3, 1.8, 1.2, 1]) {
      let any = false;
      g.beginPath();
      for (const s of B.segs) { if (Math.abs(s[4] - w) > 0.05) continue; g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); any = true; }
      if (!any) continue;
      g.lineWidth = Math.max(1, w * mul);
      g.strokeStyle = `rgba(${col},${(al * a * (w >= 3 ? 1 : 0.75)).toFixed(3)})`;
      g.stroke();
    }
  }
  g.restore();
}
