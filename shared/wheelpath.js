// The burning wheel (task #412). The owner: "Vehicle explosions are looking great, let's sometimes have a burning wheel
// bounce down the street and roll off occasionally (doesn't have to be every wheel that comes off a car)". Now and then
// one of the wheels a vehicle still has (shared/explosions.js wheelCount: never off a boat, never more than it has)
// comes off burning when it blows up: flung out, it bounces, rolls away and slows (more on grass), hops at a kerb,
// glances off walls and posts, curls round as it slows, wobbles and falls flat, and burns out there; into the water, it
// sinks. All from the explosion's seed: the server only says it happens (the 'explode' event's `wh`, down on the
// ground - server/systems/explosions.js) and does nothing more for it; each client rolls it over the same map with the
// same maths (client/render/wheels.js), so everyone sees the same wheel go the same way. Loaded by the clients with
// their first explosion, not with the page.
import { mulberry32 } from './rng.js';
import { dsin, dcos, datan2 } from './dmath.js';
import { T } from './constants.js';
import { CAR_BLOCK, WATER_T } from './map.js';
import { boomPlan, blastSize, wheelCount } from './explosions.js';

// a wheel's radius and tyre width (world px)
export function wheelSize(def) {
  if (def.kind === 'bike' && !def.stable) return { r: 6.5, w: 3.5 };
  return def.mass >= 2.4 ? { r: 9.5, w: 6 } : { r: 7.5, w: 5 };
}
// how often a wheel comes off and rolls, by what the explosion does (blown apart, up in the air, burning where it
// stands); a motorbike's less often
const WHEEL_CHANCE = { pieces: 0.42, launch: 0.3, '': 0.18 };
// The wheel that rolls, from its own stream of the seed (the explosion's plan, boomPlan, draws its own), or null:
// fr 1 a front wheel, -1 a back one; sd 1 the right side, -1 the left, 0 on the line (a motorbike's); a its throw's
// direction (radians from the heading: out from its side, a motorbike's on ahead or back); sp (px/s along the ground)
// and vz (px/s up) the throw; drag (px/s/s) how it slows rolling; curl (rad/s) how it turns, more as it slows (and the
// way it falls); burn (s from the blast) how long it burns.
export function wheelPlan(seed, def, plan = boomPlan(seed, def)) {
  const { k, pieces } = plan, big = plan.big ?? blastSize(def).big;   // (the plan's: explosives aboard make it a huge one)
  let thrown = 0;
  for (const p of pieces) if (p.c === 'w') thrown++;
  if (wheelCount(def) - thrown <= 0) return null;   // (none left on it: a boat, a motorbike that threw both)
  const R = mulberry32((seed >>> 0) ^ 0x68e31da4);
  if (R() >= (WHEEL_CHANCE[k] ?? 0) * (big === 0 ? 0.7 : 1)) return null;
  const line = def.kind === 'bike' && !def.stable, fr = R() < 0.5 ? 1 : -1, sd = line ? 0 : R() < 0.5 ? 1 : -1;
  const a = line ? (fr > 0 ? 0 : 3.1416) + (R() - 0.5) * 1.3 : sd * 1.5708 + fr * 0.3 + (R() - 0.5) * 1.1;
  return {
    fr, sd,
    a: +a.toFixed(3),
    sp: Math.round(150 + R() * 170 + big * 25),
    vz: Math.round(120 + R() * 150 + big * 30),
    drag: Math.round(36 + R() * 26),
    curl: +((R() - 0.5) * 0.9).toFixed(2),
    burn: +(9 + R() * 6).toFixed(1),
  };
}

// The wheel's path from the blast at (x, y), the vehicle facing a (the event's ev.x, ev.y, ev.a), over the map:
// frames WHEEL_DT apart, WHEEL_F numbers each - x, y (on the ground), z (its bottom's height), h (the way its face
// points along the ground, radians), lean (0 upright, +-pi/2 flat on its side), spin (how far it's turned, radians)
// and what happened in that frame (WF: a bounce, a hop at a kerb, a knock against a wall or a post, sunk - the most
// of them that frame). It ends lying flat (or sunk). out: a Float32Array to fill (a pooled one), at most WHEEL_MAX
// frames. Returns { f (the frames), n (how many), sunk }. Deterministic: + - * / and sqrt, dmath's trig - the same
// bits in every engine, so every client rolls it the same way.
export const WHEEL_DT = 1 / 30, WHEEL_F = 7, WHEEL_MAX = 360, WF = { BOUNCE: 1, KERB: 2, KNOCK: 3, SUNK: 4 };
const G = 520;                  // gravity (px/s/s: the debris's, render/fx.js chunks)
const SUB = 2;                  // steps a frame
const KERBED = new Uint8Array(16), SOFT = new Uint8Array(16), ROADLIKE = new Uint8Array(16);
KERBED[T.SIDEWALK] = 1; KERBED[T.PLAZA] = 1;
ROADLIKE[T.ROAD] = 1; ROADLIKE[T.BRIDGE] = 1; ROADLIKE[T.LOT] = 1;
SOFT[T.GRASS] = 1; SOFT[T.SAND] = 1; SOFT[T.DIRT] = 1; SOFT[T.FIELD] = 1;
const PI = 3.141592653589793, HALF = PI / 2;
export function wheelPath(roll, def, x0, y0, a0, map, out = null) {
  const { r } = wheelSize(def), f = out || new Float32Array(WHEEL_MAX * WHEEL_F), cap = Math.floor(f.length / WHEEL_F);
  const blocked = (px, py) => CAR_BLOCK[map.tileAtPx(px, py)] === 1;
  const ca = dcos(a0), sa = dsin(a0), lx = roll.fr * def.L * (roll.sd ? 0.3 : 0.36), ly = roll.sd * (def.W / 2 - 3);
  let x = x0 + ca * lx - sa * ly, y = y0 + sa * lx + ca * ly, z = 2;
  if (blocked(x, y)) { x = x0; y = y0; }   // (its corner up against a wall: off from the middle)
  const th = a0 + roll.a, dt = WHEEL_DT / SUB, rr = r * 0.6, side = roll.curl >= 0 ? 1 : -1;
  let vx = dcos(th) * roll.sp, vy = dsin(th) * roll.sp, vz = roll.vz;
  // its face starts along the vehicle (whichever way round is nearer the throw) and turns to the throw in the air
  let h0 = a0, dh = th - a0;
  while (dh > PI) dh -= 2 * PI;
  while (dh < -PI) dh += 2 * PI;
  if (dh > HALF) { h0 += PI; dh -= PI; } else if (dh < -HALF) { h0 -= PI; dh += PI; }
  let h = h0, lean = 0, spin = 0, tumble = 0, air = true, airT = 0, s0 = 0, fall = -1, fallFrom = 0, flag = 0, n = 0, sunk = false;
  let under = map.tileAtPx(x, y);
  const put = () => {
    const j = n * WHEEL_F;
    f[j] = x; f[j + 1] = y; f[j + 2] = z; f[j + 3] = h; f[j + 4] = lean; f[j + 5] = spin; f[j + 6] = flag;
    n++; flag = 0;
  };
  const hit = (k) => { if (k > flag) flag = k; };
  const hop = (up) => { air = true; airT = 1; vz = up; };   // (off the ground again: a knock, a kerb)
  put();
  for (let step = 1; n < cap; step++) {
    const sp = Math.sqrt(vx * vx + vy * vy);
    if (air) {
      // flying: tumbling at first, then righting itself (a spinning wheel), its face turning to the way it's going
      airT += dt;
      vz -= G * dt; z += vz * dt;
      tumble += (4 + sp * 0.02) * dt;
      if (airT < 0.45) { h = h0 + dh * airT / 0.45; lean = 0.8 * dsin(tumble); } else { h = h0 + dh; lean *= 0.92; }
      if (z <= 0) {
        z = 0;
        if (vz < -70) { vz = -vz * 0.42; vx *= 0.84; vy *= 0.84; hit(WF.BOUNCE); }
        else { vz = 0; air = false; h0 = h; dh = 0; if (!s0) s0 = Math.max(1, sp); }
      }
    } else if (fall < 0) {
      // rolling: slowing (more on grass and dirt), curling round more and more as it slows, upright but wobbling more
      const dec = roll.drag * (SOFT[under] ? 2.6 : 1), s = Math.max(0, sp - dec * dt), k = 1 - Math.min(1, s / s0);
      const w = roll.curl * (0.3 + 2.2 * k * k) * dt, c = dcos(w), sn = dsin(w), m = sp > 0 ? s / sp : 0;
      const nvx = (vx * c - vy * sn) * m, nvy = (vx * sn + vy * c) * m;
      vx = nvx; vy = nvy;
      if (s > 0.5) h = datan2(vy, vx);
      lean = lean * 0.85 + (side * 0.35 * k * k + (0.04 + 0.3 * k) * dsin(spin * 0.5)) * 0.15;
      if (s < 22) { fall = 0; fallFrom = lean; }
    } else {
      // falling over onto its side (the way it curled), skidding to a stop
      fall += dt;
      const u = Math.min(1, fall / 0.4);
      lean = fallFrom + (side * HALF - fallFrom) * u * u;
      vx *= 0.9; vy *= 0.9;
      if (u >= 1) { lean = side * HALF; vx = 0; vy = 0; hit(WF.BOUNCE); }
    }
    // along the ground: walls and buildings (it glances off them), posts and trees, a kerb's hop, the water
    if (vx || vy) {
      const nx = x + vx * dt, ny = y + vy * dt;
      if (blocked(nx + (vx > 0 ? rr : -rr), y)) { vx = -vx * 0.45; vy *= 0.85; hit(WF.KNOCK); if (!air && fall < 0) hop(40 + Math.abs(vx) * 0.2); }
      else x = nx;
      if (blocked(x, ny + (vy > 0 ? rr : -rr))) { vy = -vy * 0.45; vx *= 0.85; hit(WF.KNOCK); if (!air && fall < 0) hop(40 + Math.abs(vy) * 0.2); }
      else y = ny;
      const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const arr = map.solidProps && map.solidProps.size ? map.solidProps.get(map.idx(tx + ox, ty + oy)) : null;
        if (arr) for (const p of arr) {
          if (p.off) continue;
          const ex = x - p.x, ey = y - p.y, d2 = ex * ex + ey * ey, R2 = p.r + rr;
          if (d2 >= R2 * R2 || d2 === 0) continue;
          const d = Math.sqrt(d2), ux = ex / d, uy = ey / d, vn = vx * ux + vy * uy;
          if (!blocked(p.x + ux * R2, p.y + uy * R2)) { x = p.x + ux * R2; y = p.y + uy * R2; }   // (out of it)
          if (vn < 0) { vx -= 1.45 * vn * ux; vy -= 1.45 * vn * uy; hit(WF.KNOCK); }
        }
      }
      const t = map.tileAtPx(x, y);
      if (WATER_T[t] && z < 3) { sunk = true; hit(WF.SUNK); put(); break; }
      if (!air && fall < 0 && t !== under && ((KERBED[t] && ROADLIKE[under]) || (ROADLIKE[t] && KERBED[under]))) {
        vx *= 0.92; vy *= 0.92; hit(WF.KERB); hop(26 + Math.sqrt(vx * vx + vy * vy) * 0.12);
      }
      under = t;
    }
    spin += (Math.sqrt(vx * vx + vy * vy) / r) * dt;
    if (step % SUB === 0) {
      const done = fall >= 0.4;
      put();
      if (done) break;
      if (n >= cap - 1) { lean = side * HALF; z = 0; vx = 0; vy = 0; put(); break; }   // (out of frames: down where it is)
    }
  }
  return { f, n, sunk };
}
