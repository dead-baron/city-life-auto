// Jumping out of an aircraft (the owner, 10-16: "Jumping out of an aircraft: fall all the way down (splat or bounce); a
// parachute to equip"). Out of a helicopter or a plane up in the air you fall - you used to land at once, hurt by how
// high you'd been. Now you fall all the way down, steering as you go (ped.sky: { z, vz, open, mx, my }):
//   - with a parachute in your bag (shared/items.js parachute: the sports shops, the pawn shops), the action button
//     opens it: the canopy fills over a second, and you float down slowly, steering where to land - a soft landing,
//     a roll if you come in fast. It's used up.
//   - without one, or never opened: a long fall. Onto hard ground from high up that's the end of you (a splat); into
//     the water, or onto a car's roof, you live through it - the water hurts, the car bounces you off it, dented.
// The numbers: shared/rules.js SKYDIVE. The server steps the fall (update); your page draws you up in the sky, the
// canopy over you, the camera following you down (the snapshot: server/net.js, the ped's parent word; the page:
// client/main.js, art2/game/host.js _ped). Shots hit you where you're drawn (combat.js traceTarget); cars pass under.
// The numbers (shared/rules.js SKYDIVE; px, px/s, px/s²) - carry: how much of the
// aircraft's speed you keep; in free fall grav to the limit fall, steer (push) against drag up to freeMax across; the
// parachute fills over openS (opened below lowOpen it won't in time), then sinks at chuteFall (easing to it at
// chuteEase), steering chuteSteer against chuteDrag up to chuteMax. Landing faster than hurtFrom hurts (hurtPer a px/s
// over), splat or faster on the ground is the end of you; into the water waterHurt a px/s over hurtFrom (never the
// last of your health); a car roof under you leaves you carHurt of your health down. Under the canopy, coming in
// faster than rollAt across you roll out of it.
import { K, TILE } from '../../shared/constants.js';
import { WATER_T } from '../../shared/mapcore.js';
import { PED_BLOCK } from '../../shared/map.js';
import { IN } from '../../shared/input.js';
import { floorAt } from '../../shared/flight.js';
import { SKYDIVE } from '../../shared/rules.js';
import { store } from '../store.js';
import * as combat from './combat.js';
import { safeSpot } from './unstuck.js';

export const hasChute = (p) => !!(p && p.profile && (p.profile.inventory.parachute || 0) > 0);

// out of aircraft v at its altitude, going its way
export function start(world, ped, v) {
  const p = ped.player;
  ped.sky = { z: Math.max(1, v.alt || 0), vz: 0, open: 0, mx: 0, my: 0, from: v.alt || 0 };
  (world.skyPeds ||= new Set()).add(ped);   // (who's up there: combat.js traceTarget looks for them where they're drawn)
  ped.vx = (v.vx || 0) * SKYDIVE.carry; ped.vy = (v.vy || 0) * SKYDIVE.carry;
  ped.rollT = 0; ped.tumbleUntil = 0; ped.airUntil = 0;
  if (p) {
    world.notify(p, hasChute(p) ? 'Free fall! Steer, then press the action button to open your parachute.'
      : 'No parachute! Steer for the water - or a car roof...', hasChute(p) ? 'info' : 'bad');
    p.meDirty = true;
  }
  world.emit(ped.x, ped.y, { e: 'skyjump', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y) });
}

export function open(world, ped) {
  const s = ped.sky, p = ped.player;
  if (!s || s.open || !hasChute(p)) return false;
  const inv = p.profile.inventory;
  inv.parachute -= 1;
  if (inv.parachute <= 0) delete inv.parachute;
  store.touch();
  s.open = world.time;
  p.meDirty = true;
  world.emit(ped.x, ped.y, { e: 'chute', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y) });
  if (s.z < SKYDIVE.lowOpen) world.notify(p, 'Too low - it won\'t fill in time!', 'warn');
  return true;
}

// your input up there: where to steer; the action button opens the parachute
export function input(world, p, ped, inp, pressed) {
  const s = ped.sky;
  s.mx = Math.max(-1, Math.min(1, inp.mx || 0)); s.my = Math.max(-1, Math.min(1, inp.my || 0));
  ped.aimAngle = inp.aim;
  if (pressed & IN.ACTION) open(world, ped);
}

// the prompt while you fall
export function interaction(world, p) {
  const s = p.ped && p.ped.sky;
  if (!s) return null;
  if (s.open) return { label: 'Steer where to land', passive: true };
  if (hasChute(p)) return { label: 'Open your parachute', run: () => open(world, p.ped) };
  return { label: 'No parachute - steer for the water', passive: true };
}

// how fast it's coming down a while after opening: the canopy fills over SKYDIVE.openS
const fill = (world, s) => (s.open ? Math.min(1, (world.time - s.open) / SKYDIVE.openS) : 0);

export function update(world, dt) {
  if (world.skyPeds) for (const ped of world.skyPeds) if (!ped.sky || ped.removed) world.skyPeds.delete(ped);
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || !ped.sky) continue;
    if (ped.dead || ped.vehId || ped.hidden || ped.onTrain || ped.cuffed || ped.ride) { ped.sky = null; p.meDirty = true; continue; }   // (put somewhere else: a train, the cuffs, a ride - the dev menu's hops)
    step(world, ped, dt);
  }
}

export function step(world, ped, dt) {
  const s = ped.sky, k = fill(world, s), S = SKYDIVE;
  // down: falling faster and faster to the free-fall limit; under the canopy, easing to its slow sink
  if (k > 0) s.vz += ((S.chuteFall + (S.fall - S.chuteFall) * (1 - k) * 0.5) - s.vz) * Math.min(1, dt * S.chuteEase);
  else s.vz = Math.min(S.fall, s.vz + S.grav * dt);
  // across: steering pushes you, the air holds you back
  const steer = k > 0 ? S.chuteSteer : S.steer, drag = k > 0 ? S.chuteDrag : S.drag, max = k > 0 ? S.chuteMax : S.freeMax;
  ped.vx += s.mx * steer * dt; ped.vy += s.my * steer * dt;
  const f = Math.exp(-drag * dt);
  ped.vx *= f; ped.vy *= f;
  const sp = Math.hypot(ped.vx, ped.vy);
  if (sp > max) { ped.vx *= max / sp; ped.vy *= max / sp; }
  if (sp > 20) ped.a = Math.atan2(ped.vy, ped.vx);
  ped.x += ped.vx * dt; ped.y += ped.vy * dt;
  const m = world.map, fr = m.frame || { w: Infinity, h: Infinity };
  ped.x = Math.max(40, Math.min(fr.w * TILE - 40, ped.x)); ped.y = Math.max(40, Math.min(fr.h * TILE - 40, ped.y));
  s.z -= s.vz * dt;
  world.place(ped);
  const floor = floorAt(m, ped.x, ped.y);
  if (s.z <= floor) land(world, ped, floor);
}

// down: what you land on, and how hard
function land(world, ped, floor) {
  const s = ped.sky, p = ped.player, S = SKYDIVE, vz = s.vz, open = fill(world, s) >= 1 && vz < S.hurtFrom;
  ped.sky = null;
  if (p) p.meDirty = true;
  const m = world.map, t = m.tileAtPx(ped.x, ped.y), wet = !!WATER_T[t] && floor <= 0;
  // a car's roof under you: it gives (dented), and bounces you off it
  const car = !open && !wet ? world.query(ped.x, ped.y, 60, K.VEH).find((v) => (v.alt || 0) < 6 && v.def.kind !== 'boat' && Math.abs(Math.cos(v.a) * (ped.x - v.x) + Math.sin(v.a) * (ped.y - v.y)) < v.def.L / 2 && Math.abs(-Math.sin(v.a) * (ped.x - v.x) + Math.cos(v.a) * (ped.y - v.y)) < v.def.W / 2) : null;
  if (!wet && (floor > 0 || PED_BLOCK[t])) {   // (a roof, a wall: down off it to the nearest open ground)
    const at = safeSpot(m, ped.x, ped.y);
    if (at) { ped.x = at.x; ped.y = at.y; world.place(ped); }
  }
  ped.lz = 0;
  const hurt = (n, cause = 'fall') => { if (n > 0) combat.damage(world, ped, n, null, cause, ped.a); };
  if (open) {   // under the canopy: on your feet - or a roll if you came in fast
    const sp = Math.hypot(ped.vx, ped.vy);
    if (sp > S.rollAt) { ped.rollT = 0.45; ped.rdx = ped.vx / sp; ped.rdy = ped.vy / sp; }
    else { ped.vx *= 0.3; ped.vy *= 0.3; }
    world.emit(ped.x, ped.y, { e: 'skyland', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), k: 'soft' });
    if (p) world.notify(p, 'Touchdown!', 'good');
    return;
  }
  if (wet) {   // into the water: it hurts from high up, but you live
    world.emit(ped.x, ped.y, { e: 'splash', x: ped.x, y: ped.y, n: 24 });
    hurt(Math.min(ped.hp - 1, Math.max(0, vz - S.hurtFrom) * S.waterHurt));
    ped.vx *= 0.2; ped.vy *= 0.2;
    if (p && vz > S.hurtFrom) world.notify(p, 'Into the water - that stung.', 'warn');
    return;
  }
  if (car) {   // a bounce off a car's roof: dented, and you're thrown down beside it, hurt but alive
    world.emit(ped.x, ped.y, { e: 'skyland', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), k: 'car', v: car.id });
    if (car.hp !== undefined) car.hp = Math.max(1, car.hp - Math.min(car.def.hp * 0.4, vz * 0.3));
    const a = world.rand() * Math.PI * 2;
    ped.x = car.x + Math.cos(a) * (car.def.W / 2 + 20); ped.y = car.y + Math.sin(a) * (car.def.W / 2 + 20);
    const at = safeSpot(m, ped.x, ped.y);
    if (at) { ped.x = at.x; ped.y = at.y; }
    world.place(ped);
    ped.downUntil = Math.max(ped.downUntil || 0, world.time + 2.2);
    hurt(Math.min(ped.hp - 1, ped.maxHp * S.carHurt));
    if (p) world.notify(p, 'Bounced off a car roof - lucky!', 'warn');
    return;
  }
  // the ground: a splat from high up; lower, a hard landing
  if (vz >= S.splat) {
    world.emit(ped.x, ped.y, { e: 'skyland', id: ped.id, x: Math.round(ped.x), y: Math.round(ped.y), k: 'splat' });
    world.emit(ped.x, ped.y, { e: 'blood', x: ped.x, y: ped.y, a: 0, n: 22 });
    hurt(9999);
    return;
  }
  world.emit(ped.x, ped.y, { e: 'thud', x: ped.x, y: ped.y });
  hurt(Math.max(0, vz - S.hurtFrom) * S.hurtPer);
  ped.downUntil = Math.max(ped.downUntil || 0, world.time + (vz > S.hurtFrom ? 1.4 : 0.4));
  ped.vx *= 0.2; ped.vy *= 0.2;
}

// the word the snapshot carries for someone up there (server/net.js, the ped's parent): bit 29 up in the sky, bit 28
// the canopy open, the low 12 bits the height (px)
export function skyWord(ped) {
  const s = ped.sky;
  if (!s) return 0;
  return 0x20000000 | (s.open ? 0x10000000 : 0) | Math.max(0, Math.min(0xfff, Math.round(s.z)));
}
