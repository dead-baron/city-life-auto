// Layout warp for the district kits: a piecewise-linear stretch of each axis, so a block laid out in
// "design" coordinates can be widened along its roads (and their sidewalks) without moving anything
// else out of shape. Objects keep their size; only their positions move. Every placement in scene.js
// and every ground decorator (ground-warped.js) goes through it.
//
//   setWarp({ x: [[a, b, newLen], ...], y: [...] })   bands in design px, sorted, non-overlapping
//   W.x(x) / W.y(y)   design -> world      W.ix / W.iy   world -> design      W.kx / W.ky  local stretch
//   W.walk            the stretch for pavement widths      W.grow  a gentler one for kerb radii, paths, lights
function axis(bands = []) {
  const B = bands.map(([a, b, n]) => ({ a, b, n, k: n / (b - a) })).sort((p, q) => p.a - q.a);
  const f = (x) => { let off = 0; for (const s of B) { if (x <= s.a) break; if (x < s.b) return x + off + (x - s.a) * (s.k - 1); off += s.n - (s.b - s.a); } return x + off; };
  const inv = (X) => { let off = 0; for (const s of B) { const A = s.a + off; if (X <= A) break; const E = A + s.n; if (X < E) return s.a + (X - A) / s.k; off += s.n - (s.b - s.a); } return X - off; };
  const k = (x) => { for (const s of B) if (x >= s.a && x < s.b) return s.k; return 1; };
  const mean = B.length ? B.reduce((t, s) => t + s.k, 0) / B.length : 1;
  return { f, inv, k, mean };
}
let AX = axis(), AY = axis();
export const W = {
  x: (x) => AX.f(x), y: (y) => AY.f(y), ix: (x) => AX.inv(x), iy: (y) => AY.inv(y),
  kx: (x) => AX.k(x), ky: (y) => AY.k(y), walk: 1, grow: 1,
  rect(x, y, w, h) { const x0 = AX.f(x), y0 = AY.f(y); return [x0, y0, AX.f(x + w) - x0, AY.f(y + h) - y0]; },
};
export function setWarp(spec = {}) {
  AX = axis(spec.x); AY = axis(spec.y);
  W.walk = spec.walk ?? Math.max(1, (AX.mean + AY.mean) / 2);   // sidewalk widths
  W.grow = spec.grow ?? Math.min(1.5, W.walk);                     // kerb radii, paths, light reach
}
