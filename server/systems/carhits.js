// Hit by a car (the owner's notes, task #361): "you dont always get knocked back and go flying or rolling - sometimes
// you just get run over entirely and you're face down or on your back on the ground ... pretty critically hurt.
// Sometimes you're thrown onto the car itself and you ride on the hood for a bit before being thrown off."
// vehicles.js strikePed asks outcome() which way a hit goes - by the speed, where on the car it caught you, the
// vehicle's shape (a low car scoops you onto its hood, a truck or a bus goes over you) and a roll of the dice:
//   'under'  run over: the car jolts over you; critically hurt (dead only fast or under something heavy), lying
//            face down or on your back for a few seconds ('runover' event);
//   'hood'   up onto the bonnet: you ride there (0.5-2 s) until it brakes or turns hard or the time is up, then
//            you're thrown off forwards or to the side; moving (any direction) rolls you off sooner ('hood' event);
//   'fling'  the knockback vehicles.js always had: thrown through the air, a roll, a faceplant or a slide.
// Lying on the ground already (low down), a car doesn't throw you: it goes over you. Pinned rolling against a car's
// front, moving another way gets you off it (pinned()). NPCs get all of this too.
import { RUNOVER_LIE_S, RUNOVER_LEFT, HOOD_RIDE_S, HOOD_MAX_SPEED } from '../../shared/rules.js';
import { vehForwardSpeed } from '../../shared/physics.js';
import * as combat from './combat.js';
import * as vehicles from './vehicles.js';

// a low front that scoops a person up (the cars; not the pickup, the vans, the trucks or a motorbike)
const LOW_FRONT = new Set(['compact', 'sedan', 'taxi', 'sports', 'police']);
const isHeavy = (def) => def.mass >= 2.4;

// which way a hit goes (h: the circle-vs-box hit from vehicles.js; vn: the closing speed, px/s)
export function outcome(world, v, ped, vn) {
  const def = v.def, now = world.time;
  if (def.kind !== 'car' || ped.wild) return 'fling';
  const c = Math.cos(v.a), s = Math.sin(v.a);
  const lx = (ped.x - v.x) * c + (ped.y - v.y) * s;           // along the car: + toward its nose
  const front = lx > def.L / 2 - 16 && vehForwardSpeed(v) > 60;
  const low = now < (ped.downUntil || 0) && now >= (ped.airUntil || 0);   // lying on the ground: low down
  const r = world.rand();
  if (low) return 'under';
  if (isHeavy(def)) return r < 0.55 ? 'under' : 'fling';
  if (front && LOW_FRONT.has(def.id) && vn < HOOD_MAX_SPEED && r < 0.5) return 'hood';
  if (vn < 230 && r > 0.82) return 'under';
  return 'fling';
}

// the hit as it goes; returns whether it killed them (vehicles.js strikePed does the rest: the law, witnesses)
export function apply(world, v, ped, vn, how, driver) {
  return how === 'under' ? runOver(world, v, ped, vn, driver) : onHood(world, v, ped, vn, driver);
}

function runOver(world, v, ped, vn, driver) {
  const now = world.time, a = Math.atan2(v.vy, v.vx), heavy = isHeavy(v.def);
  const lie = RUNOVER_LIE_S * (0.8 + 0.4 * world.rand()), k = world.rand() < 0.5 ? 'F' : 'B';
  ped.hitImmuneUntil = now + 0.9;   // (one hit: the car goes over you)
  ped.vx = v.vx * 0.12; ped.vy = v.vy * 0.12;   // (dragged a little way)
  ped.airUntil = 0; ped.tumbleUntil = 0; ped.rollT = 0;
  ped.downUntil = Math.max(ped.downUntil || 0, now + lie);
  ped.runK = k;
  // the car jolts going over (the clients bounce it: the event)
  v.vx *= 0.86; v.vy *= 0.86; v.av = (v.av || 0) + (world.rand() - 0.5) * 0.5;
  world.emit(ped.x, ped.y, { e: 'runover', id: ped.id, v: v.id, x: Math.round(ped.x), y: Math.round(ped.y), k, d: +lie.toFixed(1) });
  world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a, n: 12 });
  // critically hurt, not dead - unless it was fast, or something heavy
  const lethal = Math.max(0, (vn - 280) / 320) + (heavy && vn > 160 ? 0.3 : 0);
  if (world.rand() < lethal) return combat.damage(world, ped, 999, driver, 'vehicle', a);
  const left = ped.maxHp * RUNOVER_LEFT * (0.7 + 0.6 * world.rand());
  const killed = combat.damage(world, ped, Math.max(1, ped.hp - left) * combat.gritOf(ped, 'vehicle'), driver, 'vehicle', a);
  if (!ped.dead) { ped.bleeding = true; if (ped.player) world.notify(ped.player, 'Run over - you\'re badly hurt. Get help!', 'bad'); }
  return killed;
}

// local spot on the hood: a third of the way from the middle to the nose
function glue(v, ped) {
  const c = Math.cos(v.a), s = Math.sin(v.a), fx = v.def.L * 0.28, ly = ped.hoodLy || 0;
  ped.x = v.x + c * fx - s * ly; ped.y = v.y + s * fx + c * ly;
  ped.vx = v.vx; ped.vy = v.vy; ped.lz = v.lz || 0;
  ped.a = v.a + Math.PI;   // (head toward the windscreen)
}

function onHood(world, v, ped, vn, driver) {
  const now = world.time, c = Math.cos(v.a), s = Math.sin(v.a);
  const ride = HOOD_RIDE_S[0] + world.rand() * (HOOD_RIDE_S[1] - HOOD_RIDE_S[0]);
  ped.hoodOf = v.id; ped.hoodAt = now; ped.hoodUntil = now + ride; ped.hoodSteer = null;
  ped.hoodLy = Math.max(-v.def.W / 4, Math.min(v.def.W / 4, -(ped.x - v.x) * s + (ped.y - v.y) * c));
  ped.hoodFwd = vehForwardSpeed(v);
  ped.airUntil = 0; ped.tumbleUntil = 0; ped.rollT = 0;
  ped.downUntil = Math.max(ped.downUntil || 0, now + ride + 0.6);
  ped.hitImmuneUntil = now + ride + 0.6;
  (world.hoodRiders ||= new Set()).add(ped.id);
  glue(v, ped);
  v.vx *= 0.94; v.vy *= 0.94;
  world.emit(ped.x, ped.y, { e: 'hood', id: ped.id, v: v.id, x: Math.round(ped.x), y: Math.round(ped.y) });
  // rolling up onto it hurts less than a full hit (the throw off it can hurt more)
  return combat.damage(world, ped, (vn - 100) * 0.09 * Math.sqrt(v.def.mass), driver, 'vehicle', Math.atan2(v.vy, v.vx));
}

// a player on the hood moving (any direction, a moment after landing on it): rolls off that way
export function hoodInput(world, ped, inp) {
  if (Math.hypot(inp.mx || 0, inp.my || 0) > 0.5 && world.time - (ped.hoodAt || 0) > 0.2) ped.hoodSteer = Math.atan2(inp.my, inp.mx);
}

// the hood riders: carried along until the car brakes or turns hard, the time's up, or they roll off
export function update(world, dt) {
  const R = world.hoodRiders;
  if (!R || !R.size) return;
  const now = world.time;
  for (const id of R) {
    const ped = world.get(id);
    if (!ped || ped.removed || ped.hoodOf === 0 || ped.hoodOf === undefined) { R.delete(id); continue; }
    const v = world.get(ped.hoodOf);
    if (!v || v.removed || ped.dead || ped.vehId || v.wreckAt || v.fly) { throwOff(world, ped, v, 'side'); continue; }
    const fwd = vehForwardSpeed(v), braked = (ped.hoodFwd - fwd) / Math.max(dt, 1e-3) > 520 || fwd < 40;
    ped.hoodFwd = fwd;
    if (ped.hoodSteer !== null && ped.hoodSteer !== undefined) throwOff(world, ped, v, 'steer');
    else if (braked) throwOff(world, ped, v, 'brake');
    else if (Math.abs(v.av || 0) > 1.7) throwOff(world, ped, v, 'turn');
    else if (now >= ped.hoodUntil) throwOff(world, ped, v, world.rand() < 0.5 ? 'brake' : 'side');
    else glue(v, ped);
  }
}

// thrown off the hood: forwards when it brakes, to the outside of a turn, the way they rolled; a fling (the arc and
// the landing as a hit: vehicles.fling)
export function throwOff(world, ped, v, why) {
  const now = world.time;
  ped.hoodOf = 0;
  if (world.hoodRiders) world.hoodRiders.delete(ped.id);
  if (ped.dead || ped.removed) return;
  ped.downUntil = now;   // (fling sets how long they're down)
  ped.hitImmuneUntil = now + 0.6;
  if (!v || v.removed) { vehicles.fling(world, ped, 0, 0, null, 'vehicle', 0, { kind: 'roll', air: 0.3 }); return; }
  const c = Math.cos(v.a), s = Math.sin(v.a), driver = vehicles.driverOf(world, v);
  let ax, ay, sp;
  if (why === 'steer') { ax = Math.cos(ped.hoodSteer); ay = Math.sin(ped.hoodSteer); sp = 170; }
  else if (why === 'turn') { const k = (v.av || 0) > 0 ? -1 : 1; ax = -s * k; ay = c * k; sp = 200; }   // (to the outside of the turn)
  else if (why === 'brake') { ax = c; ay = s; sp = 90; }
  else { const k = world.rand() < 0.5 ? -1 : 1; ax = -s * k; ay = c * k; sp = 150; }
  // clear of the car that way (out past the nose or off the side), so it doesn't hit them again at once
  const fwdOut = ax * c + ay * s > 0.7;
  const off = fwdOut ? v.def.L * 0.22 + 14 : v.def.W / 2 + 12;
  ped.x += ax * off; ped.y += ay * off;
  world.place(ped);
  world.emit(ped.x, ped.y, { e: 'hoodoff', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), k: why });
  vehicles.fling(world, ped, v.vx + ax * sp, v.vy + ay * sp, driver, 'vehicle', why === 'steer' ? 0.5 : 1, why === 'steer' ? { kind: 'roll' } : null);
}

// Pinned rolling against a car's front (pushed along, not hit hard enough to throw): moving another way gets you
// off it - you roll off to that side (an NPC does after a moment). From vehicles.js's push-out.
export function pinned(world, v, ped, dt) {
  const now = world.time;
  if (now >= (ped.downUntil || 0) && !(ped.rollT > 0) || now < (ped.airUntil || 0) || ped.hoodOf) { ped.pinT = 0; return; }
  const c = Math.cos(v.a), s = Math.sin(v.a), fwd = vehForwardSpeed(v);
  const lx = (ped.x - v.x) * c + (ped.y - v.y) * s;
  if (fwd < 40 || lx < v.def.L / 2 - 18) { ped.pinT = 0; return; }
  ped.pinT = (ped.pinT || 0) + dt;
  let dir = null;
  const inp = ped.player && ped.player.lastInput;
  if (inp && Math.hypot(inp.mx || 0, inp.my || 0) > 0.5) {
    const a = Math.atan2(inp.my, inp.mx);
    if (Math.cos(a - v.a) < 0.8) dir = a;   // (not just running ahead of it)
  } else if (!ped.player && ped.pinT > 0.6) dir = v.a + (world.rand() < 0.5 ? 1 : -1) * Math.PI / 2;
  if (dir === null) return;
  // off to the side it's heading for: whichever side of the car that way lies
  const side = Math.sin(dir - v.a) >= 0 ? 1 : -1, sx = -s * side, sy = c * side;
  ped.pinT = 0;
  ped.x += sx * 12; ped.y += sy * 12;
  ped.hitImmuneUntil = now + 0.5;
  ped.downUntil = now;
  vehicles.fling(world, ped, v.vx * 0.6 + sx * 190, v.vy * 0.6 + sy * 190, null, 'vehicle', 0, { kind: 'roll', air: 0.25 });
}
