// The doors on the street fronts, opening live (the owner's notes 2, p16: "sliding doors or doors that open"; shared/doors.js
// says which and when). The chunk bakes bring each door's record (statics.js liveDoors: [x, y (the wall's foot), w, h,
// 1 sliding | 0 hinged, paint, building]) and bake it shut (buildings.js liveDoor); this draws it opening over that as
// someone comes up to it - you, another player, anyone in the city - and closing again behind them:
//   sliding   the two glass leaves part into the wall either side, the shop lit behind;
//   hinged    the door swings in on its hinges, narrowing as it turns, the shop lit behind it.
// Four steps of opening, made once per size and paint and kept in the sprite atlas. Only a picture: a door never stands in
// anyone's way (the doorway's tiles are the walk-in's floor, as ever - shared/map.js buildInteriors). Walking into one
// of the small shops rings the bell over its door (client/sound/places.js doors). Loaded by the host the first time a
// door is in view (host.js _doors).
import { GBuf, step, hash } from '../gbuf.js';
import { MAT, ramp } from '../palette.js';
import { K, PF } from '../../../shared/constants.js';
import { DOOR_COLS } from '../../../shared/doors.js';

export const DOOR = {
  slideReach: 52,   // px in front of a sliding door its sensor sees someone (and 40 behind, inside)
  slideSide: 22,    // px either side of the doorway it still sees them
  hingeReach: 30,   // px in front of a hinged door someone has to be, in line with it, for it to swing open (24 behind)
  openS: 0.45,      // s to open all the way, and a little longer to close
  holdS: 0.5,       // s it stays open after they've gone through
};
// is someone at (x, y) (moving vx, vy px/s) at the door [x0, y (its foot, the wall's line), w, ...] - the street in
// front of it to the south (+y), the shop behind it? A sliding door sees anyone near; a hinged one opens for someone in
// line with it coming in or going out, not someone walking past along the pavement.
export function atDoor(dr, slide, x, y, vx, vy) {
  const mid = dr[0] + dr[2] / 2, dx = Math.abs(x - mid), dy = y - dr[1];
  if (slide) return dx < dr[2] / 2 + DOOR.slideSide && dy > -40 && dy < DOOR.slideReach;
  if (dx > dr[2] / 2 + 4 || dy < -24 || dy > DOOR.hingeReach) return false;
  return !(dy > 6 && Math.abs(vx) > 2 * Math.abs(vy) + 10);   // (passing by along the pavement: no)
}

const S_N = [0, 1, 0], STEPS = 4;
const IN_BACK = ramp('#3a2c22', 5, 2), IN_FLOOR = ramp('#b8946a', 5, 2), SHELF = ramp('#6a5a4a', 5, 2);
// the shop seen through the open doorway: dim at the back, its lit floor coming forward, a shelf's line, warm light
function inside(G, x, y, w, h) {
  const t = y / h, X = x, c = t > 0.72 ? step(IN_FLOOR, 0.3 + (t - 0.72) * 2, X, y, 0.6) : Math.abs(y - Math.round(h * 0.4)) < 2 && hash(x >> 2, 3, 7) < 0.8 ? step(SHELF, 0.5, X, y, 0.4) : step(IN_BACK, 0.25 + t * 0.4, X, y, 0.6);
  G.put(x, y, c, S_N, h - y, [255, 196, 120, 26 + t * 30]);
}
// one step (1..STEPS) of a door opening, w x h (the inside of its frame), its foot on the anchor
export function doorSprite(slide, w, h, c, k) {
  const G = new GBuf(w, h), o = k / STEPS;
  G.ax = 0; G.ay = h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) inside(G, x, y, w, h);
  if (slide) {
    // the leaves slid back into the wall: what still shows of each at the sides, a steel edge on its leading side
    const lw = Math.round((w / 2) * (1 - o * 0.9));
    for (let y = 0; y < h; y++) for (let i = 0; i < lw; i++) for (const x of [i, w - 1 - i]) {
      const edge = i >= lw - 2 || y < 3 || y >= h - 3, streak = ((x + (h - y)) % 17) < 3;
      G.put(x, y, edge ? step(MAT.metal, 0.5, x, y, 0) : step(MAT.glass, (y > h * 0.62 ? 0.5 : 0.3) + (streak ? 0.3 : 0), x, y, 0.3), S_N, h - y + 1, edge ? null : [255, 200, 130, 14], 0);
    }
    return G;
  }
  // a hinged door swinging in: narrower as it turns, its far edge going back into the shop (up the picture a little),
  // darker turned away from the street; the hinges at the side - a wide doorway's pair from both sides
  const th = o * 1.4, P = ramp(DOOR_COLS[c % DOOR_COLS.length], 5, 2), dbl = w >= 34, W0 = dbl ? w >> 1 : w;
  const lw = Math.max(2, Math.round(W0 * Math.cos(th))), lift = Math.round(W0 * Math.sin(th) * 0.28);
  for (const side of dbl ? [0, 1] : [0]) for (let i = 0; i < lw; i++) {
    const x = side ? w - 1 - i : i, u = i / lw, up = Math.round(lift * u), tone = 0.55 - o * 0.25 - (i >= lw - 1 ? 0.2 : 0);
    for (let y = 0; y < h - up; y++) {
      const Y = y - up;
      if (Y < 0) continue;
      const pane = y >= 4 && y < Math.round(h * 0.44) && u > 0.12 && u < 0.86, plate = y >= h - 5;
      const col = pane ? step(MAT.glassDark, 0.45, x, y, 0.3) : plate ? step(MAT.metal, 0.45, x, y, 0) : u > 0.82 && u < 0.9 && Math.abs(y - Math.round(h * 0.54)) < 1 ? [214, 176, 80] : step(P, tone, x, y, 0.3);
      G.put(x, Y, col, S_N, h - Y + 1, pane ? [255, 196, 120, 30] : null, 0);
    }
  }
  return G;
}

// the people who could be at a door this frame: on foot, alive, where they are and how they're moving
const PEDS = [];
function gather(host, F, x0, x1, y0, y1) {
  PEDS.length = 0;
  const dt = Math.max(1 / 120, Math.min(0.1, F.dt || 1 / 60));
  for (const e of host.S.ents.values()) {
    if (e.kind !== K.PED || e.parent || e.rx === undefined || (e.flags & PF.DEAD)) continue;
    const lx = e._dlx ?? e.rx, ly = e._dly ?? e.ry;
    e._dlx = e.rx; e._dly = e.ry;
    if (e.rx < x0 || e.rx > x1 || e.ry < y0 || e.ry > y1) continue;
    PEDS.push(e.rx, e.ry, (e.rx - lx) / dt, (e.ry - ly) / dt);
  }
}
// how far open each door is (0 shut .. 1), eased toward wanting to be open; the doors near the view this frame
export function stepDoors(st, L, peds, now, dt) {
  for (const dr of L) {
    const key = dr[0] * 65536 + dr[1];
    let s = st.get(key);
    if (!s) st.set(key, (s = { o: 0, hold: -1, seen: now }));
    s.seen = now;
    for (let i = 0; i < peds.length; i += 4) if (atDoor(dr, dr[4] === 1, peds[i], peds[i + 1], peds[i + 2], peds[i + 3])) { s.hold = now + DOOR.holdS; break; }
    const want = now < s.hold ? 1 : 0;
    s.o = want ? Math.min(1, s.o + dt / DOOR.openS) : Math.max(0, s.o - dt / (DOOR.openS * 1.3));
  }
  if (st.size > 600) for (const [k, s] of st) if (now - s.seen > 5) st.delete(k);
}
export function drawDoors(host, F, L) {
  const E = host.E, o = host.opts, now = F.now, st = host.doorSt || (host.doorSt = new Map());
  gather(host, F, host.vx0 - 120, host.vx1 + 120, host.vy0 - 120, host.vy1 + 160);
  stepDoors(st, L, PEDS, now, Math.max(0, Math.min(0.1, F.dt || 0)));
  o.alpha = 1; o.flash = 0; o.xray = false; o.flipX = false; o.tint = null; o.shadow = false;
  for (const dr of L) {
    const s = st.get(dr[0] * 65536 + dr[1]);
    if (!s || s.o <= 0.02 || (host.fades && (host.fades.get(dr[6]) || 0) > 0.05)) continue;   // (shut: the bake's; a building faded round you: not over its ghost)
    const k = Math.max(1, Math.min(STEPS, Math.ceil(s.o * STEPS))), w = dr[2], h = dr[3];
    const key = host._conv(`gdoor|${dr[4]}|${w}|${h}|${dr[5]}|${k}`, () => doorSprite(dr[4] === 1, w, h, dr[5], k), true);
    if (key) E.drawSprite(key, dr[0], dr[1], 0, o);
  }
}
