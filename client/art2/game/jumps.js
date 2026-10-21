// The MX park's tabletop jumps (shared/world3-dirt.js m.jumps: { x, y, a, len, w, h, ramp }) as a vehicle rides them:
// how high to draw it. Looks only - the server's bikes run on the flat, so nothing here changes where anyone is.
// Over the mound a vehicle follows its profile (up the takeoff ramp, along the flat top, down the landing); fast enough
// off the lip it's thrown into the air - a kick up and gravity's arc, by how fast it came at it - and comes down where
// the arc meets the ground again (the top, the landing, or the flat beyond). The engine casts its shadow on the ground.
export const JUMP = { G: 1150, KICK: 0.55, MIN: 140, AWAY: 520 };
// the ground's height of a jump at u px along its heading from its middle
const ground = (J, u) => { const half = J.len / 2, au = Math.abs(u); return au >= half ? 0 : au > half - J.ramp ? J.h * (half - au) / J.ramp : J.h; };
// the jump whose box (with room past its ends for a flight) holds (x, y), by a coarse grid made once per map
const GRIDS = new WeakMap(), C = 1024;
function near(map, x, y) {
  let g = GRIDS.get(map);
  if (!g) {
    g = new Map();
    for (const J of map.jumps || []) {
      const r = J.len / 2 + JUMP.AWAY;
      for (let cy = Math.floor((J.y - r) / C); cy <= Math.floor((J.y + r) / C); cy++) for (let cx = Math.floor((J.x - r) / C); cx <= Math.floor((J.x + r) / C); cx++) { const k = cx * 65536 + cy; let a = g.get(k); if (!a) g.set(k, a = []); a.push(J); }
    }
    GRIDS.set(map, g);
  }
  return g.get(Math.floor(x / C) * 65536 + Math.floor(y / C)) || null;
}
// the height (px) to draw vehicle v at, now (s): 0 off every jump. v keeps its flight between frames (v._jf) and how
// fast it's going (v._jv, smoothed from where it's drawn)
export function jumpLift(map, v, now) {
  if (!map || !map.jumps || !map.jumps.length) return 0;
  const dt = now - (v._jt ?? now);
  if (dt > 0 && dt < 0.5) {
    const vx = (v.rx - v._jx) / dt, vy = (v.ry - v._jy) / dt, k = Math.min(1, dt * 8);
    v._jvx = (v._jvx || 0) + (vx - (v._jvx || 0)) * k; v._jvy = (v._jvy || 0) + (vy - (v._jvy || 0)) * k;
  }
  v._jx = v.rx; v._jy = v.ry; v._jt = now;
  const js = near(map, v.rx, v.ry);
  if (!js) { v._jf = null; return 0; }
  for (const J of js) {
    const ca = Math.cos(J.a), sa = Math.sin(J.a), dx = v.rx - J.x, dy = v.ry - J.y, u = dx * ca + dy * sa, w = -dx * sa + dy * ca;
    if (Math.abs(w) > J.w / 2 + 10 || Math.abs(u) > J.len / 2 + JUMP.AWAY) continue;
    const along = (v._jvx || 0) * ca + (v._jvy || 0) * sa, sg = along >= 0 ? 1 : -1, s = Math.abs(along), t = u * sg, lip = -(J.len / 2 - J.ramp);
    const gz = ground(J, u);
    // in the air: the arc from the lip at the speed it left with, until it meets the ground
    const F = v._jf;
    if (F && F.J === J && F.sg === sg) {
      const tt = (t - lip) / F.s, z = J.h + F.vz * tt - JUMP.G * tt * tt / 2;
      if (t > lip && z > gz) return z;
      v._jf = null;
      return gz;
    }
    // leaving the lip fast enough: up it goes
    if (t >= lip && t < lip + 48 && s >= JUMP.MIN) { v._jf = { J, sg, s, vz: s * JUMP.KICK }; return gz; }
    return gz;
  }
  v._jf = null;
  return 0;
}
