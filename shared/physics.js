// Shared movement physics. The server runs these authoritatively; the client runs the
// exact same functions to predict its own character/vehicle between snapshots.

import { TILE, PED_RADIUS } from './constants.js';
import { PED_BLOCK, CAR_BLOCK, BOAT_BLOCK, SURFACE } from './map.js';
import { IN } from './input.js';
import { clamp, wrapAngle, obbBounds, obbVsAabb, circleVsObb } from './math.js';

export const PED = {
  walk: 115, sprint: 195, accel: 14, rollSpeed: 300, rollTime: 0.45, rollCost: 30,
  staminaMax: 100, sprintDrain: 22, regen: 14,
};

export function newPedState(x, y) {
  return { x, y, a: 0, vx: 0, vy: 0, stamina: PED.staminaMax, rollT: 0, rdx: 0, rdy: 0, prevBits: 0 };
}

// mods: { speedMul, canMove, canSprint, regenMul, staminaMax }
export function pedStep(s, inp, dt, map, mods) {
  const bits = inp.bits;
  const pressed = bits & ~s.prevBits;
  s.prevBits = bits;
  const smax = mods.staminaMax || PED.staminaMax;
  if (!mods.canMove) {
    s.vx *= 0.5; s.vy *= 0.5; s.rollT = 0;
  } else if (s.rollT > 0) {
    s.rollT -= dt;
    s.vx = s.rdx * PED.rollSpeed; s.vy = s.rdy * PED.rollSpeed;
    if (s.rollT <= 0) { s.rollT = 0; s.vx *= 0.3; s.vy *= 0.3; }
  } else {
    let mx = inp.mx, my = inp.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) { mx /= ml; my /= ml; }
    if ((pressed & IN.DIVE) && s.stamina >= PED.rollCost && ml > 0.2) {
      s.rollT = PED.rollTime; s.rdx = mx / Math.max(ml, 1e-6); s.rdy = my / Math.max(ml, 1e-6);
      if (Math.hypot(s.rdx, s.rdy) > 1.01) { const l = Math.hypot(s.rdx, s.rdy); s.rdx /= l; s.rdy /= l; }
      s.stamina -= PED.rollCost;
      s.vx = s.rdx * PED.rollSpeed; s.vy = s.rdy * PED.rollSpeed;
    } else {
      const sprint = (bits & IN.SPRINT) && s.stamina > 1 && ml > 0.1 && mods.canSprint;
      const spd = (sprint ? PED.sprint : PED.walk) * mods.speedMul;
      const k = 1 - Math.exp(-PED.accel * dt);
      s.vx += (mx * spd - s.vx) * k;
      s.vy += (my * spd - s.vy) * k;
      if (sprint) s.stamina = Math.max(0, s.stamina - PED.sprintDrain * dt);
      else s.stamina = Math.min(smax, s.stamina + PED.regen * (mods.regenMul || 1) * dt);
      if (bits & IN.AIMING) s.a = inp.aim;
      else if (ml > 0.15) s.a = Math.atan2(my, mx);
    }
  }
  if (s.stamina > smax) s.stamina = smax;
  s.x += s.vx * dt; s.y += s.vy * dt;
  collideCircle(s, PED_RADIUS, map, PED_BLOCK);
}

export function collideCircle(s, r, map, block) {
  for (let iter = 0; iter < 2; iter++) {
    const tx0 = Math.floor((s.x - r) / TILE), tx1 = Math.floor((s.x + r) / TILE);
    const ty0 = Math.floor((s.y - r) / TILE), ty1 = Math.floor((s.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (block[map.tileAt(tx, ty)]) {
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

export function newVehState(x, y, a) { return { x, y, a, vx: 0, vy: 0, av: 0 }; }

// inp: { throttle -1..1, steer -1..1, hb bool }, env: { rain bool }
// returns impact speed (px/s) of the hardest wall hit this step (0 if none)
export function vehStep(s, inp, dt, map, def, env) {
  const isBoat = def.kind === 'boat';
  const tile = map.tileAtPx(s.x, s.y);
  const surf = isBoat ? [1, 1, 0] : (SURFACE[tile] || SURFACE[1]);
  let gripMul = surf[1], brakeMul = 1;
  if (env.rain) {
    if (isBoat) gripMul *= 0.8;
    else if (surf[2]) { gripMul *= 0.65; brakeMul = 0.5; } // GDD: friction -35%, braking distance doubled
  }
  let c = Math.cos(s.a), sn = Math.sin(s.a);
  let fwd = s.vx * c + s.vy * sn;

  const speedFactor = clamp(Math.abs(fwd) / 120, 0, 1);
  const hiSpeed = 1 - 0.35 * clamp(Math.abs(fwd) / def.max, 0, 1);
  const dirSign = fwd >= 0 ? 1 : -1;
  const turnTarget = def.turn * inp.steer * speedFactor * hiSpeed * dirSign * (inp.hb ? 1.3 : 1);
  s.av += (turnTarget - s.av) * Math.min(1, 10 * dt);
  s.a = wrapAngle(s.a + s.av * dt);

  c = Math.cos(s.a); sn = Math.sin(s.a);
  fwd = s.vx * c + s.vy * sn;
  let lat = -s.vx * sn + s.vy * c;

  const t = inp.throttle;
  const maxEff = def.max * surf[0];
  if (t > 0.05) {
    if (fwd < -15) fwd = Math.min(0, fwd + def.brake * brakeMul * t * dt);
    else fwd += def.accel * t * dt * clamp(1 - fwd / maxEff, 0, 1) * 1.6;
  } else if (t < -0.05) {
    if (fwd > 15) fwd = Math.max(0, fwd - def.brake * brakeMul * -t * dt);
    else fwd = Math.max(-def.rev, fwd - def.accel * 0.6 * -t * dt);
  } else {
    fwd *= 1 - (isBoat ? 0.9 : 0.7) * dt;
    if (Math.abs(fwd) < 4) fwd = 0;
  }
  if (fwd > maxEff) fwd -= (fwd - maxEff) * 3 * dt;
  if (inp.hb) fwd *= 1 - 1.4 * dt;
  const grip = (inp.hb ? def.drift : def.grip) * gripMul;
  lat *= Math.max(0, 1 - grip * dt);

  s.vx = c * fwd - sn * lat;
  s.vy = sn * fwd + c * lat;
  s.x += s.vx * dt; s.y += s.vy * dt;
  return collideVehicleTiles(s, def, map, isBoat ? BOAT_BLOCK : CAR_BLOCK);
}

export function collideVehicleTiles(s, def, map, block) {
  const hl = def.L / 2, hw = def.W / 2;
  let impact = 0;
  for (let iter = 0; iter < 4; iter++) {
    const bb = obbBounds(s.x, s.y, s.a, hl, hw);
    const tx0 = Math.floor(bb.minX / TILE), tx1 = Math.floor(bb.maxX / TILE);
    const ty0 = Math.floor(bb.minY / TILE), ty1 = Math.floor(bb.maxY / TILE);
    let best = null;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (block[map.tileAt(tx, ty)]) {
        const hit = obbVsAabb(s.x, s.y, s.a, hl, hw, tx * TILE, ty * TILE, TILE, TILE);
        if (hit && (!best || hit.depth > best.depth)) best = hit;
      }
      const props = map.solidProps.get(ty * map.w + tx);
      if (props) for (const p of props) {
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
