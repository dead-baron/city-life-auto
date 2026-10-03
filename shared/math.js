// Lightweight vector / geometry helpers (no external math libraries).

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a < -Math.PI) a += TAU;
  return a;
}
export const angleDiff = (from, to) => wrapAngle(to - from);
export function lerpAngle(a, b, t) { return a + wrapAngle(b - a) * t; }

export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };
export const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
export const len = (x, y) => Math.sqrt(x * x + y * y);

// Oriented box: center (x,y), angle a, half-length hl (along forward), half-width hw.
export function obbAxes(a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { fx: c, fy: s, rx: -s, ry: c };
}
export function obbCorners(x, y, a, hl, hw, out = new Float64Array(8)) {
  const c = Math.cos(a), s = Math.sin(a);
  const fx = c * hl, fy = s * hl, rx = -s * hw, ry = c * hw;
  out[0] = x + fx + rx; out[1] = y + fy + ry;
  out[2] = x + fx - rx; out[3] = y + fy - ry;
  out[4] = x - fx - rx; out[5] = y - fy - ry;
  out[6] = x - fx + rx; out[7] = y - fy + ry;
  return out;
}
export function obbBounds(x, y, a, hl, hw) {
  const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const ex = c * hl + s * hw, ey = s * hl + c * hw;
  return { minX: x - ex, minY: y - ey, maxX: x + ex, maxY: y + ey };
}

function projectObb(x, y, a, hl, hw, ax, ay) {
  const c = Math.cos(a), s = Math.sin(a);
  const center = x * ax + y * ay;
  const r = Math.abs((c * ax + s * ay) * hl) + Math.abs((-s * ax + c * ay) * hw);
  return [center - r, center + r];
}

// SAT: OBB vs axis-aligned box (bx,by,bw,bh = min corner + size).
// Returns null or { nx, ny, depth } where n pushes the OBB out of the box.
export function obbVsAabb(x, y, a, hl, hw, bx, by, bw, bh) {
  const c = Math.cos(a), s = Math.sin(a);
  const axes = [[1, 0], [0, 1], [c, s], [-s, c]];
  const bcx = bx + bw / 2, bcy = by + bh / 2;
  let best = Infinity, nx = 0, ny = 0;
  for (const [ax, ay] of axes) {
    const [o0, o1] = projectObb(x, y, a, hl, hw, ax, ay);
    const bc = bcx * ax + bcy * ay;
    const br = Math.abs(ax) * bw / 2 + Math.abs(ay) * bh / 2;
    const b0 = bc - br, b1 = bc + br;
    const overlap = Math.min(o1, b1) - Math.max(o0, b0);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const d = (x * ax + y * ay) - bc;
      nx = d >= 0 ? ax : -ax; ny = d >= 0 ? ay : -ay;
    }
  }
  return { nx, ny, depth: best };
}

// SAT: OBB vs OBB. Normal pushes A away from B.
export function obbVsObb(ax, ay, aa, ahl, ahw, bx, by, ba, bhl, bhw) {
  const ca = Math.cos(aa), sa = Math.sin(aa), cb = Math.cos(ba), sb = Math.sin(ba);
  const axes = [[ca, sa], [-sa, ca], [cb, sb], [-sb, cb]];
  let best = Infinity, nx = 0, ny = 0;
  for (const [x, y] of axes) {
    const [a0, a1] = projectObb(ax, ay, aa, ahl, ahw, x, y);
    const [b0, b1] = projectObb(bx, by, ba, bhl, bhw, x, y);
    const overlap = Math.min(a1, b1) - Math.max(a0, b0);
    if (overlap <= 0) return null;
    if (overlap < best) {
      best = overlap;
      const d = (ax - bx) * x + (ay - by) * y;
      nx = d >= 0 ? x : -x; ny = d >= 0 ? y : -y;
    }
  }
  return { nx, ny, depth: best };
}

// Circle vs OBB: returns null or { nx, ny, depth } pushing circle out.
export function circleVsObb(cx, cy, r, x, y, a, hl, hw) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = cx - x, dy = cy - y;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const qx = clamp(lx, -hl, hl), qy = clamp(ly, -hw, hw);
  let ex = lx - qx, ey = ly - qy;
  let d2 = ex * ex + ey * ey;
  if (d2 > r * r) return null;
  let nlx, nly, depth;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    nlx = ex / d; nly = ey / d; depth = r - d;
  } else {
    // center inside box: push along the shallowest axis
    const px = hl - Math.abs(lx), py = hw - Math.abs(ly);
    if (px < py) { nlx = lx >= 0 ? 1 : -1; nly = 0; depth = px + r; }
    else { nlx = 0; nly = ly >= 0 ? 1 : -1; depth = py + r; }
  }
  return { nx: nlx * c - nly * s, ny: nlx * s + nly * c, depth };
}

// Segment (x1,y1)->(x2,y2) vs circle: returns t in [0,1] of first hit or -1.
export function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  const t2 = (-b + disc) / (2 * a);
  if (t1 < 0 && t2 >= 0) return 0; // started inside
  return -1;
}

// Segment vs OBB: returns entry t in [0,1] or -1.
export function segObb(x1, y1, x2, y2, x, y, a, hl, hw) {
  const c = Math.cos(a), s = Math.sin(a);
  const ox = x1 - x, oy = y1 - y;
  const lx1 = ox * c + oy * s, ly1 = -ox * s + oy * c;
  const dx = x2 - x1, dy = y2 - y1;
  const ldx = dx * c + dy * s, ldy = -dx * s + dy * c;
  let t0 = 0, t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (clip(-ldx, lx1 + hl) && clip(ldx, hl - lx1) && clip(-ldy, ly1 + hw) && clip(ldy, hw - ly1)) return t0;
  return -1;
}

// Local offset (forward fx, right ry) to world position for an entity at angle a.
export function localToWorld(x, y, a, lx, ly) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x + lx * c - ly * s, y + lx * s + ly * c];
}
