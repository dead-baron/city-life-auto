// Polyline geometry for the road network, the railway and the highway decks. Points are
// {x, y} in world px (or tiles - the functions don't care). No dependencies.

export function plen(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

// Cumulative arc length per point (adds .s).
export function measure(pts) {
  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s; }
  return s;
}

// Point + unit tangent at arc length s along a measured polyline (clamped to the ends).
export function pointAt(pts, s) {
  const n = pts.length;
  if (s <= 0) { const t = dirOf(pts[0], pts[1]); return { x: pts[0].x, y: pts[0].y, tx: t.x, ty: t.y, i: 0 }; }
  const L = pts[n - 1].s;
  if (s >= L) { const t = dirOf(pts[n - 2], pts[n - 1]); return { x: pts[n - 1].x, y: pts[n - 1].y, tx: t.x, ty: t.y, i: n - 2 }; }
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = pts[lo], b = pts[Math.min(n - 1, lo + 1)];
  const seg = (b.s - a.s) || 1, t = (s - a.s) / seg;
  const d = dirOf(a, b);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: d.x, ty: d.y, i: lo };
}

export function dirOf(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

// Evenly spaced resample (step in the same units as the points). Keeps both ends.
export function resample(pts, step) {
  const L = measure(pts);
  const n = Math.max(1, Math.round(L / step));
  const out = [];
  for (let k = 0; k <= n; k++) { const p = pointAt(pts, (L * k) / n); out.push({ x: p.x, y: p.y }); }
  return out;
}

// Offset a polyline sideways by d (positive = to the right of travel in screen coordinates,
// i.e. +y is down: right of heading (tx, ty) is (-ty, tx)). Mitred joins, clamped.
export function offset(pts, d) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    const t1 = dirOf(i > 0 ? a : b, i > 0 ? b : c), t2 = dirOf(b, i < n - 1 ? c : b);
    let tx = t1.x + (i < n - 1 ? t2.x : t1.x), ty = t1.y + (i < n - 1 ? t2.y : t1.y);
    const l = Math.hypot(tx, ty);
    if (l < 1e-6) { tx = t1.x; ty = t1.y; } else { tx /= l; ty /= l; }
    // mitre length: d / cos(half angle), clamped so hairpins don't explode
    const cos = Math.max(0.5, tx * t1.x + ty * t1.y);
    out.push({ x: b.x - ty * (d / cos), y: b.y + tx * (d / cos) });
  }
  return out;
}

// Chaikin corner cutting (keeps the end points).
export function chaikin(pts, iters = 2, closed = false) {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const out = closed ? [] : [p[0]];
    const n = p.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

// Ramer-Douglas-Peucker simplification.
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i0, i1] = st.pop();
    let best = -1, bd = tol;
    for (let i = i0 + 1; i < i1; i++) { const d = segDist(pts[i], pts[i0], pts[i1]); if (d > bd) { bd = d; best = i; } }
    if (best >= 0) { keep[best] = 1; st.push([i0, best], [best, i1]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export function segDist(p, a, b) {
  const q = closestOnSeg(p, a, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

export function closestOnSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return { x: a.x + dx * t, y: a.y + dy * t, t };
}

// Nearest point on a measured polyline: { x, y, s (arc length), d (distance), i (segment) }.
export function project(pts, p) {
  let best = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const q = closestOnSeg(p, pts[i], pts[i + 1]);
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (!best || d < best.d) best = { x: q.x, y: q.y, d, i, s: pts[i].s + (pts[i + 1].s - pts[i].s) * q.t };
  }
  return best;
}

// Segment intersection: returns {t, u, x, y} with t along ab and u along cd (both in 0..1) or null.
export function segX(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { t, u, x: a.x + rx * t, y: a.y + ry * t };
}

// Quadratic / cubic Bezier sampled into n segments.
export function quad(a, c, b, n = 12) {
  const out = [];
  for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y }); }
  return out;
}
export function cubic(a, c1, c2, b, n = 16) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    out.push({ x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y });
  }
  return out;
}

// A polyline through corner points with round corners of radius r (the polyline is straight
// between corner arcs). Works at any angle.
export function rounded(corners, r, closed = false, n = 10) {
  const C = corners;
  const m = C.length;
  const out = [];
  const push = (p) => { const l = out[out.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 0.01) out.push(p); };
  for (let i = 0; i < m; i++) {
    const p1 = C[i];
    if (!closed && (i === 0 || i === m - 1)) { push({ x: p1.x, y: p1.y }); continue; }
    const p0 = C[(i - 1 + m) % m], p2 = C[(i + 1) % m];
    const d0 = dirOf(p1, p0), d2 = dirOf(p1, p2);
    const rr = Math.min(r, Math.hypot(p0.x - p1.x, p0.y - p1.y) * 0.49, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.49);
    const a = { x: p1.x + d0.x * rr, y: p1.y + d0.y * rr }, b = { x: p1.x + d2.x * rr, y: p1.y + d2.y * rr };
    for (const q of quad(a, p1, b, n)) push(q);
  }
  if (closed && out.length) out.push({ x: out[0].x, y: out[0].y });
  return out;
}

export function angleOf(dx, dy) { return Math.atan2(dy, dx); }
export function wrapA(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// Point in polygon (even-odd).
export function inPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
