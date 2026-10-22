// K9 units (task #324; only the K9 handler's look existed - shared/look.js policeLook 'k9'): now and then a patrol car
// sent after someone on foot at two or three stars carries a dog handler (the tactical vest and the ball cap) and a
// German shepherd. The dog rides in the back; when the crew jumps out it's let off the lead and runs the suspect down -
// faster than anyone can run - and brings them to the ground with a bite (down a couple of seconds: long enough for the
// officers to get there and the cuffs on). It won't go after someone in a vehicle, gives up when they're well away, and
// heels to its handler, riding back in with them when the unit stands down. A police dog is never hurt (as no pet is:
// combat.js hurtable) - get in a car, or outrun the officers before it gets to you. The numbers: shared/rules.js K9.
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { K9 } from '../../shared/rules.js';
import { decodeLook, encodeLook } from '../../shared/lookcore.js';
import { policeLook } from '../../shared/look.js';
import * as players from './players.js';

const dogs = (world) => (world.k9 ||= new Set());
export const onTarget = (world, pid) => [...dogs(world)].some((d) => !d.removed && d.k9.target === pid);

// a unit (v, its first officer the handler) after player p: the handler in the K9 vest, the dog in the back
export function attach(world, v, handler, p) {
  try { const L = decodeLook(handler.app && handler.app.lk); if (L) handler.app = { ...handler.app, lk: encodeLook(policeLook(L, 0, 'k9')) }; } catch { /* (an old look: the uniform as it is) */ }
  handler.appVer = (handler.appVer || 0) + 1;
  const dog = world.spawnPed(v.x, v.y, { hp: K9.hp, archetype: 'pet:dog_shepherd', name: 'a police dog', a: v.a, app: { bd: 1 } });
  dog.pet = { k9: true, kind: 'dog', name: 'a police dog' };   // (k9: not a lost pet - pets.js - nor a walker's dog)
  dog.k9 = { unit: v.id, handler: handler.id, target: p.pid, biteAt: -99, out: false };
  dog.hidden = true;   // (in the back of the car)
  dogs(world).add(dog);
  return dog;
}

export function update(world, dt) {
  const set = world.k9;
  if (!set || !set.size) return;
  const now = world.time;
  for (const dog of set) {
    const D = dog.k9, handler = world.get(D.handler), unit = world.get(D.unit);
    if (dog.removed || !handler || handler.removed || !unit || unit.removed) { set.delete(dog); if (!dog.removed) world.remove(dog); continue; }
    // riding: in while the handler's in the car; out beside them when they get out
    if (handler.vehId || handler.dead) {
      if (!dog.hidden && (handler.vehId === unit.id || handler.dead)) { dog.hidden = true; D.out = false; }
      if (dog.hidden) { dog.x = unit.x; dog.y = unit.y; world.place(dog); continue; }
    } else if (dog.hidden) {
      dog.hidden = false; D.out = true; dog.x = handler.x + 14; dog.y = handler.y + 8; dog.vx = 0; dog.vy = 0;
      world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
    }
    const p = world.players.get(D.target), t = p && p.ped;
    const after = t && !t.dead && !t.vehId && !t.hidden && !t.onTrain && !t.sky && (p.wanted || 0) > 0 && !t.cuffed && Math.hypot(t.x - dog.x, t.y - dog.y) < K9.sight;
    let gx = handler.x - Math.cos(handler.a) * 18, gy = handler.y - Math.sin(handler.a) * 18, fast = 1;
    if (after) {
      gx = t.x; gy = t.y; fast = K9.speed;
      const d = Math.hypot(t.x - dog.x, t.y - dog.y);
      if (d < K9.reach && now - D.biteAt > K9.every && now >= (t.downUntil || 0)) {
        D.biteAt = now;
        t.downUntil = now + K9.downS; t.stunUntil = Math.max(t.stunUntil || 0, now + K9.downS); t.rollT = 0; t.vx = 0; t.vy = 0;
        world.emit(t.x, t.y, { e: 'bite', id: dog.id, v: t.id, x: Math.round(t.x), y: Math.round(t.y) });
        if (t.player) world.notify(t.player, 'The police dog has you down!', 'bad');
      }
    } else if (Math.hypot(gx - dog.x, gy - dog.y) > 90) fast = 1.8;
    const dx = gx - dog.x, dy = gy - dog.y, dd = Math.hypot(dx, dy), go = dd > (after ? 4 : 14);
    const inp = { bits: 0, mx: go ? dx / dd : 0, my: go ? dy / dd : 0, aim: dog.a };
    const mods = players.pedMods(world, dog); mods.speedMul *= fast; mods.canSwim = true; mods.analog = true;
    pedStep(dog, inp, dt, world.map, mods);
    if (go) dog.a = Math.atan2(dy, dx);
    world.place(dog);
  }
}
