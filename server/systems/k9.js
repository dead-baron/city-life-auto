// K9 units (task #324; only the K9 handler's look existed - shared/look.js policeLook 'k9'): now and then a patrol car
// sent after someone on foot at two or three stars carries a dog handler (the tactical vest and the ball cap) and a
// German shepherd. The dog rides in the back. It won't go after someone in a vehicle or on another level (the sewers,
// the subway, the highway deck), and heels to its handler, riding back in with them when the unit stands down.
// Since the owner's notes 2 (10-24: "way too aggressive and fast and when they attack they kind of glitch out back and
// forth. It would be good to see police officers holding them on leash and getting close before they let them go so you
// have a heads up. ... you can't kill a k9 dog but if you injure it the dog will limp off ... If a police dog does latch
// onto you you should be able to knock it off and run away, it is just meant to slow you down a bit and take a little
// health"), the dog's modes (dog.k9.mode):
//   'ride'   in the back of the car (hidden)
//   'leash'  out, on the lead at its handler's side, straining toward the suspect - the handler walks it in, and only
//            within K9.release px of the suspect is it let go (a bark and a word to the suspect: the heads-up). On the
//            wire the lead is the dog's parent field: its handler's id (net.js) - the clients draw it (render/carryfx.js)
//   'run'    let go: after the suspect a little faster than anyone runs (K9.speed x a run)
//   'latch'  it has hold of them: held at their side (moved with them, not stepped - no back and forth), it slows them
//            (K9.drag on their speed: players.js pedMods) and takes a little health (K9.dps, never the last of it) for up
//            to K9.latchS; mashing attack (K9.mash presses) or any blow on it knocks it off - then it's slowed a while
//   'limp'   hurt below K9.limpAt of its health: it limps off away from whoever hurt it (K9.limpMul), then back to heel,
//            out of the chase for the rest of the call. It is never killed (combat.js damage: hurt()) - as no pet is
//   'heel'   back at its handler's side, off the lead
// The numbers: shared/rules.js K9.
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { IN } from '../../shared/input.js';
import { K9 } from '../../shared/rules-play.js';
import { decodeLook, encodeLook } from '../../shared/lookcore.js';
import { policeLook } from '../../shared/look.js';
import { sameLevel } from '../../shared/levels.js';
import * as players from './players.js';

const dogs = (world) => (world.k9 ||= new Set());
export const onTarget = (world, pid) => [...dogs(world)].some((d) => !d.removed && d.k9.target === pid);
// who has hold of this person (a ped), or null
export const latchedOn = (world, ped) => { for (const d of dogs(world)) if (!d.removed && d.k9.mode === 'latch' && d.k9.on === ped.id) return d; return null; };
// on the wire: the dog's lead (its handler's id) while it's on it
export const leashOf = (dog) => (dog.k9 && dog.k9.mode === 'leash' ? dog.k9.handler : 0);

// a unit (v, its first officer the handler) after player p: the handler in the K9 vest, the dog in the back
export function attach(world, v, handler, p) {
  try { const L = decodeLook(handler.app && handler.app.lk); if (L) handler.app = { ...handler.app, lk: encodeLook(policeLook(L, 0, 'k9')) }; } catch { /* (an old look: the uniform as it is) */ }
  handler.appVer = (handler.appVer || 0) + 1;
  const dog = world.spawnPed(v.x, v.y, { hp: K9.hp, archetype: 'pet:dog_shepherd', name: 'a police dog', a: v.a, app: { bd: 1 } });
  dog.pet = { k9: true, kind: 'dog', name: 'a police dog' };   // (k9: not a lost pet - pets.js - nor a walker's dog)
  dog.k9 = { unit: v.id, handler: handler.id, target: p.pid, mode: 'ride', biteAt: -99, outAt: 0, until: 0, on: 0, mash: 0, tb: 0, slowUntil: 0, from: null, spent: false, growlAt: 0 };
  dog.hidden = true;   // (in the back of the car)
  dogs(world).add(dog);
  return dog;
}

// The dog hurt (combat.js damage hands it here instead of hurting it the usual way): it lets go, it's slowed, and badly
// hurt it limps off. Never below 1 health. Returns false (nobody's killed).
export function hurt(world, dog, amount, attacker) {
  const D = dog.k9, now = world.time;
  if (!D || dog.hidden || amount <= 0) return false;
  dog.hp = Math.max(1, dog.hp - amount);
  dog.lastHitAt = now;
  D.slowUntil = now + K9.slowS;
  if (D.mode === 'latch') letGo(world, dog, 'hit');
  if (dog.hp <= dog.maxHp * K9.limpAt && D.mode !== 'limp') {
    D.mode = 'limp'; D.until = now + K9.limpS; D.spent = true; dog.vx *= 0.2; dog.vy *= 0.2;
    D.from = attacker ? { x: attacker.x, y: attacker.y } : { x: dog.x - Math.cos(dog.a) * 30, y: dog.y - Math.sin(dog.a) * 30 };
    world.emit(dog.x, dog.y, { e: 'yelp', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
    const p = world.players.get(D.target);
    if (attacker && attacker.player) world.notify(attacker.player, 'The police dog yelps and limps off.', 'info');
    else if (p && p.ped === attacker) world.notify(p, 'The police dog yelps and limps off.', 'info');
  } else if (D.mode === 'leash' || D.mode === 'heel' || D.mode === 'run') world.emit(dog.x, dog.y, { e: 'yelp', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
  return false;
}

// it lets go of whoever it has hold of (why: 'hit' knocked off, 'shaken' shaken off, 'tired' let go by itself, 'gone')
function letGo(world, dog, why) {
  const D = dog.k9, now = world.time, t = D.on ? world.get(D.on) : null;
  if (t) {
    t.k9Until = 0;
    if (t.player) { t.player.meDirty = true; if (why === 'hit' || why === 'shaken') world.notify(t.player, 'You knock the police dog off - run!', 'good'); }
    // (knocked off: thrown back off them a little way)
    const a = Math.atan2(dog.y - t.y, dog.x - t.x);
    dog.x = t.x + Math.cos(a) * 22; dog.y = t.y + Math.sin(a) * 22; world.place(dog);
    dog.vx = Math.cos(a) * 120; dog.vy = Math.sin(a) * 120;
  }
  D.on = 0; D.mash = 0; D.mode = 'run'; D.biteAt = now;
  if (why === 'hit' || why === 'shaken') D.slowUntil = Math.max(D.slowUntil, now + K9.slowS);
}

function latch(world, dog, t) {
  const D = dog.k9, now = world.time;
  D.mode = 'latch'; D.on = t.id; D.until = now + K9.latchS; D.mash = 0; D.tb = t.player ? t.player.prevBits || 0 : 0; D.dmgT = 0;
  D.la = Math.atan2(dog.y - t.y, dog.x - t.x) - (t.a || 0);   // (where on them it has hold: kept as they turn)
  t.k9Until = D.until;
  t.rollT = 0;
  dog.vx = 0; dog.vy = 0;
  world.emit(t.x, t.y, { e: 'k9bite', id: dog.id, v: t.id, x: Math.round(t.x), y: Math.round(t.y) });
  if (t.player) { world.notify(t.player, 'The police dog has hold of you! Hit it or mash attack to knock it off.', 'bad'); t.player.meDirty = true; }
}

export function update(world, dt) {
  const set = world.k9;
  if (!set || !set.size) return;
  const now = world.time;
  for (const dog of set) {
    const D = dog.k9, handler = world.get(D.handler), unit = world.get(D.unit);
    if (dog.removed || !handler || handler.removed || !unit || unit.removed) { if (D.mode === 'latch') letGo(world, dog, 'gone'); set.delete(dog); if (!dog.removed) world.remove(dog); continue; }
    // riding: in while the handler's in the car; out beside them when they get out (and waiting in it while they're
    // down a manhole or on the subway: underground.js)
    const below = !!handler.sub || !!handler.ug;
    if (handler.vehId || handler.dead || below) {
      if (!dog.hidden && (handler.vehId === unit.id || handler.dead || below)) {
        if (D.mode === 'latch') letGo(world, dog, 'gone');
        dog.hidden = true; D.mode = 'ride'; D.spent = false; dog.hp = dog.maxHp;   // (back in the car: rested)
      }
      if (dog.hidden) { dog.x = unit.x; dog.y = unit.y; world.place(dog); continue; }
    } else if (dog.hidden) {
      dog.hidden = false; D.mode = 'leash'; D.outAt = now; dog.x = handler.x + 14; dog.y = handler.y + 8; dog.vx = 0; dog.vy = 0;
      world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
    }
    // after them: the unit still on the job, the suspect on foot on the dog's own level, and not well away from the
    // handler (outrun the officers and the dog is called back)
    const p = world.players.get(D.target), t = p && p.ped, job = handler.npc && handler.npc.unit === unit.id && !(unit.ai && unit.ai.downSince !== undefined);   // (not standing down, nor a hijacked car's crew turned on the thief: police.js)
    const after = job && !D.spent && t && !t.dead && !t.vehId && !t.hidden && !t.onTrain && !t.sky && !t.sub && !t.ug && sameLevel(t.lz, dog.lz) && (p.wanted || 0) > 0 && !t.cuffed && Math.hypot(t.x - handler.x, t.y - handler.y) < K9.sight;
    // hold of someone: kept at their side, moved with them (not stepped: no jitter)
    if (D.mode === 'latch') {
      const q = world.get(D.on);
      if (!q || q.dead || q.vehId || q.hidden || q.cuffed || !after || q !== t) { letGo(world, dog, 'gone'); }
      else {
        const bits = p.prevBits || 0;
        if ((bits & IN.FIRE) && !(D.tb & IN.FIRE)) D.mash++;
        D.tb = bits;
        if (D.mash >= K9.mash) letGo(world, dog, 'shaken');
        else if (now >= D.until) letGo(world, dog, 'tired');
        else {
          const a = (q.a || 0) + D.la;
          dog.x = q.x + Math.cos(a) * 15; dog.y = q.y + Math.sin(a) * 15; dog.vx = q.vx; dog.vy = q.vy; dog.lz = q.lz;
          dog.a = Math.atan2(q.y - dog.y, q.x - dog.x);
          world.place(dog);
          q.k9Until = D.until;
          // a little health while it hangs on (never the last of it: it's there to slow you, not to kill you)
          D.dmgT += dt;
          if (D.dmgT >= 0.5) {
            const left = q.hp - K9.dps * D.dmgT;
            if (!(q.player && q.player.invincible) && now >= (q.protectUntil || 0)) { q.hp = Math.max(Math.min(q.hp, q.maxHp * K9.floor), left); q.lastHitAt = now; if (q.player) q.player.meDirty = true; }
            D.dmgT = 0;
          }
          continue;
        }
      }
    }
    let gx = handler.x - Math.cos(handler.a) * 18, gy = handler.y - Math.sin(handler.a) * 18, fast = 1, stop = 14;
    if (D.mode === 'limp') {
      if (now >= D.until) D.mode = 'heel';
      else { const a = Math.atan2(dog.y - D.from.y, dog.x - D.from.x); gx = dog.x + Math.cos(a) * 60; gy = dog.y + Math.sin(a) * 60; fast = K9.limpMul; stop = 0; }
    } else if (D.mode === 'leash') {
      // on the lead: at the handler's side, a little ahead of them toward the suspect, straining
      const dh = after ? Math.hypot(t.x - handler.x, t.y - handler.y) : Infinity;
      if (after && (dh < K9.release || (now - D.outAt > K9.holdS && dh < K9.release * 1.6))) {
        D.mode = 'run';
        world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
        world.notify(p, 'The officer lets the police dog off the lead - it\'s coming for you!', 'bad');
      } else {
        const a = after ? Math.atan2(t.y - handler.y, t.x - handler.x) : handler.a;
        gx = handler.x + Math.cos(a) * 16 + Math.cos(a + 1.57) * 8; gy = handler.y + Math.sin(a) * 16 + Math.sin(a + 1.57) * 8; fast = 1.5; stop = 3;
        if (after && now >= D.growlAt) { D.growlAt = now + 2.5; world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) }); }
      }
    } else if (D.mode === 'run' && !after) D.mode = 'heel';
    else if (D.mode === 'heel' && after && !D.spent) D.mode = 'run';
    if (D.mode === 'run') {
      gx = t.x; gy = t.y; fast = K9.speed * (now < D.slowUntil ? K9.slowMul : 1); stop = 0;
      const d = Math.hypot(t.x - dog.x, t.y - dog.y);
      /* (not in the moment after breaking free of an officer, nor while safe: struggle.js, custody.js graceUntil, homes.js protectUntil) */
      if (d < K9.reach && now - D.biteAt > K9.every && now >= (t.graceUntil || 0) && now >= (t.protectUntil || 0) && !latchedOn(world, t)) { latch(world, dog, t); continue; }
    } else if (D.mode === 'heel' && Math.hypot(gx - dog.x, gy - dog.y) > 90) fast = 1.8;
    const dx = gx - dog.x, dy = gy - dog.y, dd = Math.hypot(dx, dy), go = dd > stop;
    // (closing in on its mark: no faster than gets it there this step - it doesn't overshoot and come back)
    const close = go && D.mode === 'run' ? Math.min(1, dd / (K9.speed * 178 * dt * 1.2)) : 1;
    const inp = { bits: 0, mx: go ? (dx / dd) * close : 0, my: go ? (dy / dd) * close : 0, aim: dog.a };
    const mods = players.pedMods(world, dog); mods.speedMul *= fast; mods.canSwim = true; mods.analog = true;
    pedStep(dog, inp, dt, world.map, mods);
    if (D.mode === 'leash') {   // (the lead's length: it can't get further than that from the hand holding it)
      const lx = dog.x - handler.x, ly = dog.y - handler.y, l = Math.hypot(lx, ly);
      if (l > K9.leash) { dog.x = handler.x + lx / l * K9.leash; dog.y = handler.y + ly / l * K9.leash; }
    }
    if (go) dog.a = Math.atan2(dy, dx);
    world.place(dog);
  }
}
