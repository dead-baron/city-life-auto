// Shared movement physics. The server runs these authoritatively; the client runs the
// exact same functions to predict its own character/vehicle between snapshots.

import { TILE, PED_RADIUS, T } from './constants.js';
import { PED_BLOCK, SWIM_BLOCK, WATER_T, CAR_BLOCK, BOAT_BLOCK, SURFACE } from './map.js';
import { IN } from './input.js';
import { clamp, wrapAngle, obbBounds, obbVsAabb, circleVsObb } from './math.js';
import { levelStep, GROUND_Z, LAND_IMPACT } from './levels.js';
import { edgeBrake } from './border.js';
import { dropsOf, DROP_SPEED } from './ledges.js';
import { ugMapOf } from './underground.js';
import { coverAtPx } from './tunnels.js';
// Down the sewers or in the cave (e.ug: shared/underground.js) people and boats move through the underground's own map.
const mapOf = (s, map) => (s.ug && !map.ug ? ugMapOf(map) || map : map);

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

// mods: { speedMul, canMove, canSprint, regenMul, staminaMax, drainMul (sprinting wears them out this much: officers on a
// chase last longer) }
export const TUMBLE_FRICTION = 2.2;
export const AIR_FRICTION = 0.35;   // flung out of a car: barely slows until you hit the ground
export const SWIM_SPEED = 0.42;     // swimming speed vs walking
export function pedStep(s, inp, dt, map, mods) {
  map = mapOf(s, map);
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
        if (sprint && ml > 0.1) s.stamina = Math.max(0, s.stamina - PED.sprintDrain * (mods.drainMul ?? 1) * dt);
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
        if (sprint) s.stamina = Math.max(0, s.stamina - PED.sprintDrain * (mods.drainMul ?? 1) * dt);
        else s.stamina = Math.min(smax, s.stamina + PED.regen * (mods.regenMul || 1) * dt);
        if (bits & IN.AIMING) s.a = inp.aim;
        else if (ml > 0.15) s.a = Math.atan2(my, mx);
      }
    }
  }
  if (s.stamina > smax) s.stamina = smax;
  // a drop (a waterfall's lip, the cliff it goes over: ledges.js): you go down it, fast, whatever you're pressing
  const drops = up(s) ? null : dropsOf(map);
  if (drops && drops.size && drops.has(Math.floor(s.y / TILE) * map.w + Math.floor(s.x / TILE))) {
    if (s.vy < DROP_SPEED) s.vy = DROP_SPEED;
    s.vx *= Math.exp(-6 * dt); s.rollT = 0;
    s.dropping = true;
  } else if (s.dropping) s.dropping = false;
  s.x += s.vx * dt; s.y += s.vy * dt;
  edgeBrake(s);   // (out past the map's edge: slowed, and stopped at the world's end - border.js)
  collideCircle(s, PED_RADIUS, map, mods.canSwim ? SWIM_BLOCK : PED_BLOCK);
  if (map.levels && levelStep(map, s, PED_RADIUS) >= LAND_IMPACT) s.hardLanding = true; // dropped off the deck
}

export function collideCircle(s, r, map, block) {
  if (up(s)) return; // up on the deck: its barriers hold you (levels.js)
  const drops = dropsOf(map), anyDrops = !!drops && drops.size > 0;
  for (let iter = 0; iter < 2; iter++) {
    const tx0 = Math.floor((s.x - r) / TILE), tx1 = Math.floor((s.x + r) / TILE);
    const ty0 = Math.floor((s.y - r) / TILE), ty1 = Math.floor((s.y + r) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      // a drop (ledges.js) is open from above and the side and solid from below: nobody climbs up a waterfall or its cliff
      const drop = anyDrops && tx >= 0 && ty >= 0 && tx < map.w && drops.has(ty * map.w + tx);
      if (drop ? s.y > ty * TILE + TILE - 1 : blockedAt(map, tx, ty, block)) {
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
// Vehicles: a top-down handling model with tyre grip, weight transfer and drifting.

// Vehicles faster than this plough through breakable street furniture instead of bouncing off.
export const SMASH_SPEED = 85;
export const DRIFT_ENTER = 150;   // sideways speed (px/s) at which a human-driven car is sliding
export const DRIFT_EXIT = 50;     // ...and below which the tyres have hooked up again

export function newVehState(x, y, a) { return { x, y, a, vx: 0, vy: 0, av: 0, slip: 0, spin: 0, launch: 0 }; }

// inp: { throttle -1..1, steer -1..1, hb bool, slide bool, drv bool (a person at the wheel) },
// env: { rain bool }. Returns the impact speed (px/s) of the hardest wall hit this step (0 if none).
//
// The car moves in its own frame: fwd along the nose, lat sideways, and a yaw rate (av).
//  * Steering asks for a yaw rate from the wheel angle and speed; the front tyres can only deliver
//    so much sideways force, so asking for too much at speed just pushes wide (understeer) - more
//    so in the rain.
//  * Weight transfer: braking loads the nose (it turns in harder, the tail goes light); flooring it
//    loads the tail (the nose washes wide a little).
//  * The rear can break loose: the handbrake, braking hard while turning (slide), or - for a person
//    at the wheel - flooring it through a tight fast turn (power oversteer), or just arriving very
//    sideways. Then the car DRIFTS: the tyres slide (low grip), the tail stays out while you keep
//    the gas on, steering into the turn swings it further, counter-steering catches it, and
//    lifting off lets the tyres grip again. Sliding scrubs speed.
//  * Handbrake + gas at a standstill, wheel straight: a BURNOUT - the tyres smoke while the car
//    strains on the spot; let go of the handbrake for a launch. Add the wheel: DONUTS, the rear
//    swinging round the front wheels.
// AI drivers never set slide or drv, so traffic stays planted.
export function vehStep(s, inp, dt, map, def, env) {
  map = mapOf(s, map);
  const isBoat = def.kind === 'boat';
  const tile = up(s) ? T.ROAD : map.tileAtPx(s.x, s.y);
  const surf = isBoat ? [1, 1, 0] : (SURFACE[tile] || SURFACE[1]);
  // a bicycle's tyres take rough ground their own way (def.rough: the share of the surface's drag and lost grip it
  // feels - a mountain bike hardly any, a road bike more than a car)
  const rough = def.rough === undefined || isBoat || WATER_T[tile] ? 1 : def.rough;   // (in the water it's all the same)
  const surfSpeed = rough === 1 ? surf[0] : clamp(1 - (1 - surf[0]) * rough, 0.25, 1);
  let gripMul = rough === 1 ? surf[1] : clamp(1 - (1 - surf[1]) * rough, 0.3, 1), brakeMul = 1;
  if (s.flat) gripMul *= 0.55; // tyres shredded by a spike strip
  if (env.rain && !coverAtPx(map.cover, s.x, s.y)) {   // (in a tunnel the road is dry: shared/tunnels.js)
    if (isBoat) gripMul *= 0.8;
    else if (surf[2]) { gripMul *= 0.65; brakeMul = 0.5; } // GDD: friction -35%, braking distance doubled
  }
  const human = !!inp.drv && !isBoat;
  const t = inp.throttle, steer = inp.steer;
  let c = Math.cos(s.a), sn = Math.sin(s.a);
  let fwd = s.vx * c + s.vy * sn;
  let lat = -s.vx * sn + s.vy * c;
  const speed = Math.hypot(fwd, lat);
  const steering = Math.abs(steer) > 0.2;
  const brakeSlide = !isBoat && fwd > 160 && steering && !!inp.slide;
  const burnout = !isBoat && !!inp.hb && t > 0.5 && !steering && Math.abs(fwd) < 70;
  const donut = !isBoat && !!inp.hb && t > 0.5 && steering && speed < 240;
  const braking = t < -0.05 && fwd > 15;
  const powering = t > 0.6 && fwd > 40;
  // power oversteer: a person flooring it through a tight turn at a decent lick lights up the rear
  const powerOver = human && t > 0.85 && Math.abs(steer) > 0.7 && fwd > def.max * 0.3;
  // -- the drift state (0 gripping .. 1 fully sideways) --
  let drift = s.slip || 0;
  if (!isBoat) {
    const loose = (inp.hb && speed > 110) || brakeSlide || powerOver || (human && Math.abs(lat) > DRIFT_ENTER && speed > 180);
    if (loose) drift = Math.min(1, drift + 5 * dt);
    else if (Math.abs(lat) < DRIFT_EXIT || speed < 90) drift = Math.max(0, drift - 4 * dt);
    else drift = Math.max(0, drift - (t > 0.4 ? 0.6 : 2.4) * dt); // gas on: the slide is held; lift: it grips up
  }
  s.slip = drift;

  // -- steering / yaw --
  const speedFactor = clamp(speed / 120, 0, 1);
  const hiSpeed = 1 - 0.35 * clamp(speed / def.max, 0, 1);
  const sliding = inp.hb || brakeSlide || drift > 0.3;
  const dirSign = sliding ? (fwd >= -20 ? 1 : -1) : (fwd >= 0 ? 1 : -1);
  let turnTarget;
  if (donut) turnTarget = Math.sign(steer) * def.turn * 1.45;
  else if (burnout) turnTarget = 0;
  else {
    const bite = braking ? 1.12 : powering ? 0.93 : 1;                     // weight on the nose / on the tail
    const turnMul = inp.hb ? (isBoat ? 1.3 : 1.6) : brakeSlide ? 1.5 : 1;
    turnTarget = def.turn * steer * speedFactor * hiSpeed * dirSign * turnMul * bite;
    if (drift > 0.3 && !inp.hb) {
      // in a slide: steering into it swings the tail further, counter-steering (wheel pointing
      // the way the car is sliding) catches it gently instead of snapping back
      const counter = steer * lat > 0;
      turnTarget *= counter ? 0.55 : 1.2;
    }
    if (!sliding && !isBoat) {
      // the front tyres' limit: centripetal acceleration they can hold (understeer beyond it)
      const aMax = def.grip * 110 * gripMul * bite;
      const lim = aMax / Math.max(60, Math.abs(fwd));
      if (Math.abs(turnTarget) > lim) turnTarget = Math.sign(turnTarget) * (lim + (Math.abs(turnTarget) - lim) * 0.25);
    }
  }
  s.av += (turnTarget - s.av) * Math.min(1, (donut ? 7 : 10) * dt);
  s.a = wrapAngle(s.a + s.av * dt);

  c = Math.cos(s.a); sn = Math.sin(s.a);
  fwd = s.vx * c + s.vy * sn;
  lat = -s.vx * sn + s.vy * c;

  // -- longitudinal: engine, brakes, burnouts --
  const maxEff = def.max * surfSpeed * (s.flat ? 0.45 : 1);
  // analog throttle also sets a cruising speed: a light push drives slowly, full stick flat out
  const cap = maxEff * Math.min(1, 0.18 + 0.82 * Math.abs(t));
  let launch = s.launch || 0, spin = s.spin || 0;
  if (burnout) spin = Math.min(2, spin + dt);
  else if (spin > 0) { if (t > 0.5 && !inp.hb) launch = Math.min(1.2, spin); spin = 0; }   // let go of the handbrake: launch
  launch = Math.max(0, launch - dt);
  s.spin = spin; s.launch = launch;
  const accel = def.accel * (1 + 0.8 * launch) * (drift > 0.3 ? 0.75 : 1);   // spinning tyres put less down
  if (burnout) {
    fwd += (0 - fwd) * Math.min(1, 6 * dt); // straining against the brake, tyres smoking
  } else if (donut) {
    // pivot round the front wheels: the rear swings out sideways, the car barely moves forward
    const r = def.L * 0.32;
    lat += (-r * s.av - lat) * Math.min(1, 8 * dt);
    fwd += (24 - fwd) * Math.min(1, 4 * dt);
  } else if (t > 0.05) {
    if (fwd < -15) fwd = Math.min(0, fwd + def.brake * brakeMul * t * dt);
    else if (fwd > cap) fwd -= (fwd - cap) * 1.6 * dt;
    else fwd += accel * Math.max(t, 0.6) * dt * clamp(1 - fwd / cap, 0, 1) * 1.6;
  } else if (t < -0.05) {
    if (fwd > 15) fwd = Math.max(0, fwd - def.brake * brakeMul * -t * (brakeSlide ? 0.55 : 1) * dt); // locked up in a skid it scrubs off less
    else fwd = Math.max(-def.rev * Math.min(1, 0.3 + 0.7 * -t), fwd - def.accel * 0.6 * -t * dt);
  } else {
    fwd *= 1 - (isBoat ? 0.9 : 0.7) * dt;
    if (Math.abs(fwd) < 4) fwd = 0;
  }
  if (fwd > maxEff) fwd -= (fwd - maxEff) * 3 * dt;
  if (inp.hb && !donut && !burnout) { // e-brake: a hard stop with the tail sliding out
    if (isBoat) fwd *= 1 - 1.4 * dt;
    else fwd = fwd > 0 ? Math.max(0, fwd - def.brake * 0.5 * brakeMul * dt) : Math.min(0, fwd + def.brake * 0.5 * brakeMul * dt);
  }
  // -- lateral: the tyres pull the velocity round towards the nose (slowly when sliding) --
  if (!donut) {
    const slideGrip = def.drift + (def.grip - def.drift) * (1 - drift) * 0.35;
    const grip = (inp.hb || burnout ? def.drift : brakeSlide ? def.drift * 1.6 : drift > 0.05 ? slideGrip : def.grip) * gripMul;
    lat *= Math.max(0, 1 - grip * dt);
    if (drift > 0.05 && !isBoat) { const scrub = Math.max(0, 1 - 0.22 * drift * dt); fwd *= scrub; lat *= scrub; } // sliding tyres scrub speed
  }

  s.vx = c * fwd - sn * lat;
  s.vy = sn * fwd + c * lat;
  s.x += s.vx * dt; s.y += s.vy * dt;
  edgeBrake(s);   // (out past the map's edge: slowed, and stopped at the world's end - border.js)
  const hit = collideVehicleTiles(s, def, map, isBoat ? BOAT_BLOCK : CAR_BLOCK);
  if (!map.levels || isBoat) return hit;
  return Math.max(hit, levelStep(map, s, def.W / 2, true));
}

// A vehicle whose engine has died (out of health): no power, the brakes dragging it to a stop, the wheel still turns.
export function deadInput(s, steer = 0, hb = false) {
  const fwd = s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a);
  return { throttle: fwd > 20 ? -0.3 : 0, steer: Math.max(-1, Math.min(1, steer)), hb, slide: false, drv: true };
}

// Direction-based driving: the stick points where you want to go. Throttle follows how far it is
// pushed; steering turns the car toward the stick. Point well behind the car to brake, then reverse
// (the rear swings toward the stick). Tank mode (IN.TANK, optional for keyboards): up/down = gas /
// brake, left/right = steer, like the classic games.
export function driveInput(s, inp) {
  const hb = !!(inp.bits & IN.DIVE);
  if (s.dead) { // the engine has cut out: it only rolls to a stop (the wheel still turns)
    const m = Math.hypot(inp.mx, inp.my);
    return deadInput(s, inp.bits & IN.TANK ? inp.mx : m < 0.08 ? 0 : wrapAngle(Math.atan2(inp.my, inp.mx) - s.a) * 2.4, hb);
  }
  if (inp.bits & IN.TANK) return { throttle: -inp.my, steer: inp.mx, hb, slide: -inp.my < -0.3 && Math.abs(inp.mx) > 0.2, drv: true }; // brake + steer = skid turn
  const m = Math.min(1, Math.hypot(inp.mx, inp.my));
  if (m < 0.08) { s.rev = false; return { throttle: 0, steer: 0, hb, slide: false, drv: true }; }
  const want = Math.atan2(inp.my, inp.mx);
  const d = wrapAngle(want - s.a);
  const fwd = s.vx * Math.cos(s.a) + s.vy * Math.sin(s.a);
  // hysteresis so the car doesn't flip between forward and reverse
  if (!s.rev && Math.abs(d) > 2.35 && fwd < 60) s.rev = true;
  else if (s.rev && Math.abs(d) < 1.75) s.rev = false;
  if (s.rev) {
    const dr = wrapAngle(want - (s.a + Math.PI));
    return { throttle: -m, steer: clamp(-dr * 2.2, -1, 1), hb, slide: false, drv: true };
  }
  if (Math.abs(d) > 2.35) { // pulling back at speed = brake; pulled back to one side = brake into a skid turn
    const skid = Math.abs(d) < 2.95 && fwd > 160;
    return { throttle: -m, steer: skid ? Math.sign(d) : 0, hb, slide: skid, drv: true };
  }
  const steer = clamp(d * 2.4, -1, 1);
  const sharp = Math.abs(d) > 1.3;
  // a turn far sharper than the wheels can take at this speed: lift off and let the tail slide round
  if (sharp && fwd > 300) return { throttle: 0.25 * m, steer, hb, slide: true, drv: true };
  const throttle = m * (sharp ? 0.55 : 1);
  return { throttle, steer, hb, slide: false, drv: true };
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
