// Shared movement physics. The server runs these authoritatively; the client runs the
// exact same functions to predict its own character/vehicle between snapshots.

import { TILE, PED_RADIUS, T } from './constants.js';
import { PED_BLOCK, SWIM_BLOCK, WATER_T, CAR_BLOCK, BOAT_BLOCK, SURFACE } from './map.js';
import { IN } from './input.js';
import { clamp, wrapAngle, obbBounds, obbVsAabb, circleVsObb } from './math.js';
import { levelStep, GROUND_Z } from './levels.js';

// Ground tile under a moving thing - up on the highway deck it's always road.
const up = (s) => (s.lz || 0) > GROUND_Z;
const blockedAt = (map, tx, ty, block) => {
  if (block[map.tileAt(tx, ty)]) return true;
  const lb = map.lvl0Block;
  return !!lb && tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && lb[ty * map.w + tx] === 1;
};

export const PED = {
  walk: 115, sprint: 195, accel: 14, rollSpeed: 300, rollTime: 0.45, rollCost: 30,
  staminaMax: 100, sprintDrain: 22, regen: 14,
  // player analog curve: stick 0..WALK_AT ramps up to a walk, WALK_AT..1 blends walk -> run,
  // sprint (button, uses stamina) adds a burst on top. Ease in, glide out (momentum).
  aWalk: 100, aRun: 178, aSprint: 222, WALK_AT: 0.6, easeIn: 8.5, easeOut: 4.2, turnRate: 13,
};

// Analog stick magnitude (0..1) -> target ground speed for players.
export function analogSpeed(m, sprint) {
  if (m <= 0.02) return 0;
  if (sprint) return PED.aSprint * Math.max(m, PED.WALK_AT);
  if (m <= PED.WALK_AT) return PED.aWalk * (m / PED.WALK_AT);
  return PED.aWalk + (PED.aRun - PED.aWalk) * ((m - PED.WALK_AT) / (1 - PED.WALK_AT));
}

export function newPedState(x, y) {
  return { x, y, a: 0, vx: 0, vy: 0, stamina: PED.staminaMax, rollT: 0, rdx: 0, rdy: 0, prevBits: 0 };
}

// mods: { speedMul, canMove, canSprint, regenMul, staminaMax }
export const TUMBLE_FRICTION = 2.2;
export const AIR_FRICTION = 0.35;   // flung out of a car: barely slows until you hit the ground
export const SWIM_SPEED = 0.42;     // swimming speed vs walking
export function pedStep(s, inp, dt, map, mods) {
  const bits = inp.bits;
  const pressed = bits & ~s.prevBits;
  s.prevBits = bits;
  const smax = mods.staminaMax || PED.staminaMax;
  // swimming (players, and NPCs who ended up in the water): slow, no sprint, no dive-roll
  // Bridge tiles are two layers: the deck (reached from the road) and the water under it
  // (reached by swimming in). s.under remembers which one this ped is on.
  const tile = up(s) ? T.ROAD : map.tileAtPx(s.x, s.y);
  if (WATER_T[tile]) s.under = true; else if (tile !== T.BRIDGE) s.under = false;
  const swim = !!mods.canSwim && (WATER_T[tile] === 1 || (tile === T.BRIDGE && !!s.under));
  if (!mods.canMove) {
    // knocked down: stop dead; tumbling (bailed out of a fast car / blown out of one): slide and roll
    if (mods.air) { const k = Math.exp(-AIR_FRICTION * dt); s.vx *= k; s.vy *= k; }
    else if (mods.tumble) { const k = Math.exp(-(swim ? 6 : TUMBLE_FRICTION) * dt); s.vx *= k; s.vy *= k; } else { s.vx *= 0.5; s.vy *= 0.5; }
    s.rollT = 0;
  } else if (s.rollT > 0) {
    s.rollT -= dt;
    s.vx = s.rdx * PED.rollSpeed; s.vy = s.rdy * PED.rollSpeed;
    if (s.rollT <= 0) { s.rollT = 0; s.vx *= 0.3; s.vy *= 0.3; }
  } else {
    let mx = inp.mx, my = inp.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if ((pressed & IN.DIVE) && !swim && s.stamina >= PED.rollCost && ml > 0.2) {
      s.rollT = PED.rollTime; s.rdx = mx / Math.max(ml, 1e-6); s.rdy = my / Math.max(ml, 1e-6);
      if (Math.hypot(s.rdx, s.rdy) > 1.01) { const l = Math.hypot(s.rdx, s.rdy); s.rdx /= l; s.rdy /= l; }
      s.stamina -= PED.rollCost;
      s.vx = s.rdx * PED.rollSpeed; s.vy = s.rdy * PED.rollSpeed;
    } else {
      const sprint = (bits & IN.SPRINT) && s.stamina > 1 && ml > 0.1 && mods.canSprint && !swim;
      const smul = mods.speedMul * (swim ? SWIM_SPEED : 1);
      if (mods.analog) {
        // players: analog walk/run, eased acceleration and a short glide when the stick is released
        const spd = analogSpeed(ml, sprint) * smul;
        const dirx = ml > 1e-3 ? mx / ml : 0, diry = ml > 1e-3 ? my / ml : 0;
        const tvx = dirx * spd, tvy = diry * spd;
        const cur = Math.hypot(s.vx, s.vy);
        const rate = spd >= cur - 1 ? PED.easeIn : PED.easeOut;
        const k = 1 - Math.exp(-rate * dt);
        s.vx += (tvx - s.vx) * k;
        s.vy += (tvy - s.vy) * k;
        if (Math.hypot(s.vx, s.vy) < 3 && ml < 0.02) { s.vx = 0; s.vy = 0; }
        if (sprint && ml > 0.1) s.stamina = Math.max(0, s.stamina - PED.sprintDrain * dt);
        else s.stamina = Math.min(smax, s.stamina + PED.regen * (mods.regenMul || 1) * dt);
        if (bits & IN.AIMING) s.a = inp.aim;
        else {
          const sp = Math.hypot(s.vx, s.vy);
          const want = ml > 0.1 ? Math.atan2(my, mx) : sp > 25 ? Math.atan2(s.vy, s.vx) : s.a;
          const d = wrapAngle(want - s.a);
          const step = PED.turnRate * dt;
          s.a = wrapAngle(Math.abs(d) <= step ? want : s.a + Math.sign(d) * step);
        }
      } else {
        const spd = (sprint ? PED.sprint : PED.walk) * smul;
        const k = 1 - Math.exp(-PED.accel * dt);
        s.vx += (mx * spd - s.vx) * k;
        s.vy += (my * spd - s.vy) * k;
        if (sprint) s.stamina = Math.max(0, s.stamina - PED.sprintDrain * dt);
        else s.stamina = Math.min(smax, s.stamina + PED.regen * (mods.regenMul || 1) * dt);
        if (bits & IN.AIMING) s.a = inp.aim;
        else if (ml > 0.15) s.a = Math.atan2(my, mx);
      }
    }
  }
  if (s.stamina > smax) s.stamina = smax;
  s.x += s.vx * dt; s.y += s.vy * dt;
  collideCircle(s, PED_RADIUS, map, mods.canSwim ? SWIM_BLOCK : PED_BLOCK);
  if (map.levels) levelStep(map, s, PED_RADIUS);
}

export function collideCircle(s, r, map, block) {
  if (up(s)) return; // up on the deck: its barriers hold you (levels.js)
  for (let iter = 0; iter < 2; iter++) {
    const tx0 = Math.floor((s.x - r) / TILE), tx1 = Math.floor((s.x + r) / TILE);
    const ty0 = Math.floor((s.y - r) / TILE), ty1 = Math.floor((s.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (blockedAt(map, tx, ty, block)) {
        const qx = clamp(s.x, tx * TILE, tx * TILE + TILE), qy = clamp(s.y, ty * TILE, ty * TILE + TILE);
        let dx = s.x - qx, dy = s.y - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 < 1e-6) { // center inside tile: push to nearest edge
            const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
            dx = s.x - cx; dy = s.y - cy;
            if (Math.abs(dx) > Math.abs(dy)) s.x = dx > 0 ? tx * TILE + TILE + r : tx * TILE - r;
            else s.y = dy > 0 ? ty * TILE + TILE + r : ty * TILE - r;
          } else {
            const d = Math.sqrt(d2), push = r - d;
            s.x += (dx / d) * push; s.y += (dy / d) * push;
            const vn = s.vx * (dx / d) + s.vy * (dy / d);
            if (vn < 0) { s.vx -= vn * (dx / d); s.vy -= vn * (dy / d); }
          }
        }
      }
      const props = map.solidProps.get(ty * map.w + tx);
      if (props) for (const p of props) {
        if (p.off) continue;
        const dx = s.x - p.x, dy = s.y - p.y, rr = r + p.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          s.x += (dx / d) * (rr - d); s.y += (dy / d) * (rr - d);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Vehicles: arcade top-down model with lateral grip (drift) and rain friction.

// Vehicles faster than this plough through breakable street furniture instead of bouncing off.
export const SMASH_SPEED = 85;

export function newVehState(x, y, a) { return { x, y, a, vx: 0, vy: 0, av: 0 }; }

// inp: { throttle -1..1, steer -1..1, hb bool, slide bool }, env: { rain bool }
// Driving feel: the handbrake (hb) is a hard e-brake that kicks the tail out - flick it with the
// wheel turned at speed for a sharp skid turn. Braking while steering at speed (or asking for a
// turn far sharper than the wheels allow: slide) also breaks the rear loose into a drift. The
// handbrake held with the gas floored at low speed spins the car on the spot (donuts).
// returns impact speed (px/s) of the hardest wall hit this step (0 if none)
export function vehStep(s, inp, dt, map, def, env) {
  const isBoat = def.kind === 'boat';
  const tile = up(s) ? T.ROAD : map.tileAtPx(s.x, s.y);
  const surf = isBoat ? [1, 1, 0] : (SURFACE[tile] || SURFACE[1]);
  let gripMul = surf[1], brakeMul = 1;
  if (env.rain) {
    if (isBoat) gripMul *= 0.8;
    else if (surf[2]) { gripMul *= 0.65; brakeMul = 0.5; } // GDD: friction -35%, braking distance doubled
  }
  let c = Math.cos(s.a), sn = Math.sin(s.a);
  let fwd = s.vx * c + s.vy * sn;

  const steering = Math.abs(inp.steer) > 0.2;
  const brakeSlide = !isBoat && fwd > 160 && steering && !!inp.slide; // (players only: AI drivers never set slide)
  const donut = !isBoat && inp.hb && inp.throttle > 0.5 && Math.abs(fwd) < 160;
  // sliding, the car keeps rotating on its momentum even as the wheels stop rolling forward
  const spd = (inp.hb || brakeSlide) && !isBoat ? Math.hypot(s.vx, s.vy) : Math.abs(fwd);
  const speedFactor = clamp(spd / 120, 0, 1);
  const hiSpeed = 1 - 0.35 * clamp(spd / def.max, 0, 1);
  const dirSign = (inp.hb || brakeSlide) ? (fwd >= -20 ? 1 : -1) : (fwd >= 0 ? 1 : -1);
  const turnMul = inp.hb ? (isBoat ? 1.3 : 1.6) : brakeSlide ? 1.5 : 1;
  const turnTarget = donut ? def.turn * 1.15 * inp.steer : def.turn * inp.steer * speedFactor * hiSpeed * dirSign * turnMul;
  s.av += (turnTarget - s.av) * Math.min(1, 10 * dt);
  s.a = wrapAngle(s.a + s.av * dt);

  c = Math.cos(s.a); sn = Math.sin(s.a);
  fwd = s.vx * c + s.vy * sn;
  let lat = -s.vx * sn + s.vy * c;

  const t = inp.throttle;
  const maxEff = def.max * surf[0];
  // analog throttle also sets a cruising speed: a light push drives slowly, full stick flat out
  const cap = maxEff * Math.min(1, 0.18 + 0.82 * Math.abs(t));
  if (t > 0.05) {
    if (fwd < -15) fwd = Math.min(0, fwd + def.brake * brakeMul * t * dt);
    else if (fwd > cap) fwd -= (fwd - cap) * 1.6 * dt;
    else fwd += def.accel * Math.max(t, 0.6) * dt * clamp(1 - fwd / cap, 0, 1) * 1.6;
  } else if (t < -0.05) {
    if (fwd > 15) fwd = Math.max(0, fwd - def.brake * brakeMul * -t * (brakeSlide ? 0.55 : 1) * dt); // locked up in a skid it scrubs off less
    else fwd = Math.max(-def.rev * Math.min(1, 0.3 + 0.7 * -t), fwd - def.accel * 0.6 * -t * dt);
  } else {
    fwd *= 1 - (isBoat ? 0.9 : 0.7) * dt;
    if (Math.abs(fwd) < 4) fwd = 0;
  }
  if (fwd > maxEff) fwd -= (fwd - maxEff) * 3 * dt;
  if (inp.hb && !donut) { // e-brake: a hard stop with the tail sliding out
    if (isBoat) fwd *= 1 - 1.4 * dt;
    else fwd = fwd > 0 ? Math.max(0, fwd - def.brake * 0.5 * brakeMul * dt) : Math.min(0, fwd + def.brake * 0.5 * brakeMul * dt);
  }
  if (donut) fwd = Math.min(fwd, 90); // wheelspin: the rear just smokes round
  const grip = (inp.hb || donut ? def.drift : brakeSlide ? def.drift * 1.6 : def.grip) * gripMul;
  lat *= Math.max(0, 1 - grip * dt);

  s.vx = c * fwd - sn * lat;
  s.vy = sn * fwd + c * lat;
  s.x += s.vx * dt; s.y += s.vy * dt;
  const hit = collideVehicleTiles(s, def, map, isBoat ? BOAT_BLOCK : CAR_BLOCK);
  if (!map.levels || isBoat) return hit;
  return Math.max(hit, levelStep(map, s, def.W / 2));
}

// Direction-based driving: the stick points where you want to go. Throttle follows how far it is
// pushed; steering turns the car toward the stick. Point well behind the car to brake, then reverse
// (the rear swings toward the stick). Tank mode (IN.TANK, optional for keyboards): up/down = gas /
// brake, left/right = steer, like the classic games.
export function driveInput(s, inp) {
  const hb = !!(inp.bits & IN.DIVE);
  if (inp.bits & IN.TANK) return { throttle: -inp.my, steer: inp.mx, hb, slide: -inp.my < -0.3 && Math.abs(inp.mx) > 0.2 }; // brake + steer = skid turn
  const m = Math.min(1, Math.hypot(inp.mx, inp.my));
  if (m < 0.08) { s.rev = false; return { throttle: 0, steer: 0, hb, slide: false }; }
  const want = Math.atan2(inp.my, inp.mx);
  const d = wrapAngle(want - s.a);
  const fwd = s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a);
  // hysteresis so the car doesn't flip between forward and reverse
  if (!s.rev && Math.abs(d) > 2.35 && fwd < 60) s.rev = true;
  else if (s.rev && Math.abs(d) < 1.75) s.rev = false;
  if (s.rev) {
    const dr = wrapAngle(want - (s.a + Math.PI));
    return { throttle: -m, steer: clamp(-dr * 2.2, -1, 1), hb, slide: false };
  }
  if (Math.abs(d) > 2.35) { // pulling back at speed = brake; pulled back to one side = brake into a skid turn
    const skid = Math.abs(d) < 2.95 && fwd > 160;
    return { throttle: -m, steer: skid ? Math.sign(d) : 0, hb, slide: skid };
  }
  const steer = clamp(d * 2.4, -1, 1);
  const sharp = Math.abs(d) > 1.3;
  // a turn far sharper than the wheels can take at this speed: lift off and let the tail slide round
  if (sharp && fwd > 300) return { throttle: 0.25 * m, steer, hb, slide: true };
  const throttle = m * (sharp ? 0.55 : 1);
  return { throttle, steer, hb, slide: false };
}

export function collideVehicleTiles(s, def, map, block) {
  const hl = def.L / 2, hw = def.W / 2;
  let impact = 0;
  if (up(s)) return 0;
  for (let iter = 0; iter < 4; iter++) {
    const bb = obbBounds(s.x, s.y, s.a, hl, hw);
    const tx0 = Math.floor(bb.minX / TILE), tx1 = Math.floor(bb.maxX / TILE);
    const ty0 = Math.floor(bb.minY / TILE), ty1 = Math.floor(bb.maxY / TILE);
    let best = null;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (blockedAt(map, tx, ty, block)) {
        const hit = obbVsAabb(s.x, s.y, s.a, hl, hw, tx * TILE, ty * TILE, TILE, TILE);
        if (hit && (!best || hit.depth > best.depth)) best = hit;
      }
      const props = map.solidProps.get(ty * map.w + tx);
      if (props) for (const p of props) {
        if (p.off || (p.brk && Math.abs(s.vx) + Math.abs(s.vy) > SMASH_SPEED)) continue; // smashes through (server breaks it)
        const h = circleVsObb(p.x, p.y, p.r, s.x, s.y, s.a, hl, hw);
        if (h && (!best || h.depth > best.depth)) best = { nx: -h.nx, ny: -h.ny, depth: h.depth };
      }
    }
    if (!best) break;
    s.x += best.nx * (best.depth + 0.01);
    s.y += best.ny * (best.depth + 0.01);
    const vn = s.vx * best.nx + s.vy * best.ny;
    if (vn < 0) {
      s.vx -= 1.25 * vn * best.nx;
      s.vy -= 1.25 * vn * best.ny;
      impact = Math.max(impact, -vn);
      s.av *= 0.5;
    }
  }
  return impact;
}

export function vehLateralSpeed(s) {
  const c = Math.cos(s.a), sn = Math.sin(s.a);
  return -s.vx * sn + s.vy * c;
}
export function vehForwardSpeed(s) {
  return s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a);
}
