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
// A K9 partner of a player officer's own (the police career's 'k9' unlock, Corporal - docs/PROGRESSION.md; the numbers:
// shared/rules.js K9_UNIT): partner() below - the same German shepherd, the same hurt() (never killed), its own modes:
//   'kennel' with its handler in the armory (hidden)    'heel'  at their side, off the lead
//   'ride'   in the back of their cruiser, the K9 unit (hidden; v.k9 the dog)
//   'run'    sent after a suspect on foot (law.js isSuspectFor) within sight that the handler can see - chaseS at most
//   'hold'   it has them down (downUntil: law.js arrestable - cuff them) for holdS; mash attack to shake it off
//   'limp'   hurt (as above), then back to heel
// After each go - a takedown, shaken off, given up, hurt - cooldownS before it's sent again (D.readyAt). It goes back to the
// kennels (removed; taken again at the armory) when its handler goes off duty, dies or leaves, its cruiser's gone, or it's
// left strayPx behind. p.k9Dog: its id (the session's, not saved: a partner is taken each shift).
import { K } from '../../shared/constants.js';
import { pedStep } from '../../shared/physics.js';
import { IN } from '../../shared/input.js';
import { K9 } from '../../shared/rules-play.js';
import { decodeLook, encodeLook } from '../../shared/lookcore.js';
import { policeLook } from '../../shared/look.js';
import { sameLevel } from '../../shared/levels.js';
import * as players from './players.js';
import { K9_UNIT } from '../../shared/rules.js';
import * as careers from './careers.js';
import * as law from './law.js';

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
  if (D.mode === 'hold') release(world, dog, 'hit');   // (a partner's: it lets go of them)
  if (D.partner && (D.mode === 'run' || D.mode === 'hold')) D.readyAt = Math.max(D.readyAt, now + K9_UNIT.cooldownS);
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
    if (dog.k9.partner) { stepPartner(world, dog, dt); continue; }   // (a player officer's own: below)
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

// ---- a K9 partner of your own (the police career's 'k9' unlock: see the top) -------------------------------------------
export function partnerOf(world, p) {
  const d = p && p.k9Dog ? world.get(p.k9Dog) : null;
  return d && !d.removed && d.k9 && d.k9.partner === p.pid ? d : null;
}
const k9Rank = () => { const R = careers.CAREERS.police.ranks; const i = R.findIndex((r) => (r.unlock || []).some((u) => u.k === 'k9')); return R[Math.max(0, i)].name; };
// why this officer can't take one now (null: they can)
export function partnerRefusal(world, p) {
  if (!p.badge) return 'On-duty officers only.';
  if (!careers.hasUnlock(p, 'k9')) return `A K9 partner comes at ${k9Rank()} (police).`;
  if (partnerOf(world, p)) return 'Your partner is with you already.';
  if (!p.ped || p.ped.dead) return 'Not right now.';
  return null;
}
// the armory's row (economy.js): take your partner for the shift
export function takePartner(world, p) {
  const why = partnerRefusal(world, p);
  if (why) return why;
  const ped = p.ped;
  const dog = world.spawnPed(ped.x, ped.y, { hp: K9.hp, archetype: 'pet:dog_shepherd', name: 'a police dog', a: ped.a, app: { bd: 1 } });
  dog.pet = { k9: true, kind: 'dog', name: 'a police dog' };   // (k9: not a lost pet - pets.js - nor a walker's dog)
  dog.k9 = { partner: p.pid, handler: ped.id, unit: 0, target: 0, mode: ped.hidden ? 'kennel' : 'heel', readyAt: 0, runAt: 0, until: 0, on: 0, mash: 0, tb: 0, slowUntil: 0, from: null, biteAt: -99, spent: false, growlAt: 0 };
  dog.hidden = !!ped.hidden;
  p.k9Dog = dog.id;
  dogs(world).add(dog);
  world.notify(p, 'Your K9 partner is with you. It rides in your cruiser - the K9 unit - and goes after suspects on foot near you: it takes them down and holds them for the cuffs.', 'good');
  p.meDirty = true;
  return null;
}
// back to the kennels: gone
function kennel(world, dog, why) {
  const D = dog.k9, p = world.players.get(D.partner);
  if (D.mode === 'hold') release(world, dog, 'gone');
  const v = D.unit ? world.get(D.unit) : null;
  if (v && v.k9 === dog.id) v.k9 = 0;
  dogs(world).delete(dog);
  if (!dog.removed) world.remove(dog);
  if (p && p.k9Dog === dog.id) { p.k9Dog = 0; p.meDirty = true; if (why) world.notify(p, why, 'info'); }
}
// it lets go of the suspect it holds (why: 'tired' - time up, 'shaken' off, 'hit', 'done' - cuffed or gone)
function release(world, dog, why) {
  const D = dog.k9, now = world.time, t = D.on ? world.get(D.on) : null;
  if (t && !t.removed) {
    t.k9Until = 0;
    if (why === 'shaken' || why === 'hit') { t.downUntil = Math.min(t.downUntil || 0, now); if (t.player) world.notify(t.player, 'You shake the police dog off - run!', 'good'); }
    if (t.player) t.player.meDirty = true;
    const a = Math.atan2(dog.y - t.y, dog.x - t.x);
    dog.x = t.x + Math.cos(a) * 22; dog.y = t.y + Math.sin(a) * 22; world.place(dog);
  }
  D.on = 0; D.mash = 0; D.mode = 'heel'; D.biteAt = now;
  D.readyAt = Math.max(D.readyAt, now + K9_UNIT.cooldownS);
  if (why === 'shaken' || why === 'hit') D.slowUntil = Math.max(D.slowUntil, now + K9.slowS);
}
// the suspect the handler's dog would be sent after now: on foot, on its level, within sight of the handler and seen
export function quarry(world, p, dog) {
  const h = p.ped, now = world.time;
  let best = null, bd = K9_UNIT.sight;
  for (const e of world.query(h.x, h.y, K9_UNIT.sight, K.PED)) {
    if (e === h || e === dog || e.k9 || e.pet || e.dead || e.vehId || e.hidden || e.cuffed || e.onTrain || e.sky || e.sub || e.ug) continue;
    if (!sameLevel(e.lz, dog.lz) || now < (e.downUntil || 0) || now < (e.stunUntil || 0) || now < (e.graceUntil || 0) || now < (e.protectUntil || 0)) continue;
    if ((e.player && e.player.custody) || !law.isSuspectFor(world, p, e)) continue;
    const d = Math.hypot(e.x - h.x, e.y - h.y);
    if (d >= bd || (world.map.los && !world.map.los(h.x, h.y, e.x, e.y))) continue;
    bd = d; best = e;
  }
  return best;
}
function takedown(world, dog, t, p) {
  const D = dog.k9, now = world.time;
  D.mode = 'hold'; D.on = t.id; D.until = now + K9_UNIT.holdS; D.mash = 0; D.tb = t.player ? t.player.prevBits || 0 : 0;
  D.la = Math.atan2(dog.y - t.y, dog.x - t.x) - (t.a || 0);
  t.downUntil = Math.max(t.downUntil || 0, D.until); t.subduedBy = p.ped.id; t.k9Until = D.until;
  t.rollT = 0; t.vx = 0; t.vy = 0; dog.vx = 0; dog.vy = 0;
  world.emit(t.x, t.y, { e: 'k9bite', id: dog.id, v: t.id, x: Math.round(t.x), y: Math.round(t.y) });
  if (t.player) { world.notify(t.player, 'The police dog takes you down and holds you! Mash attack to shake it off.', 'bad'); t.player.meDirty = true; }
  world.notify(p, 'Your K9 has the suspect down - cuff them!', 'good');
}
// steps a dog toward (gx, gy): fast x a walk's speed, stopping `stop` px short (closing in: no overshoot); chasing, it goes
// round someone in its way (its handler, a passer-by) rather than pushing into them
function stepTo(world, dog, gx, gy, fast, stop, dt, chasing, quarryId = 0) {
  const dx = gx - dog.x, dy = gy - dog.y, dd = Math.hypot(dx, dy), go = dd > stop;
  const close = go && chasing ? Math.min(1, dd / (fast * 178 * dt * 1.2)) : 1;
  let ux = go ? dx / dd : 0, uy = go ? dy / dd : 0;
  if (go && chasing) for (const e of world.query(dog.x, dog.y, 36, K.PED)) {
    if (e === dog || e.id === quarryId || e.dead || e.hidden) continue;
    const ex = e.x - dog.x, ey = e.y - dog.y, along = ex * ux + ey * uy, side = -ex * uy + ey * ux;
    if (along <= 0 || along > 36 || Math.abs(side) > 22) continue;
    const s = side > 0 ? -1 : 1, nx = ux - s * uy, ny = uy + s * ux, nl = Math.hypot(nx, ny);   // (half a turn away from them)
    ux = nx / nl; uy = ny / nl;
    break;
  }
  const inp = { bits: 0, mx: ux * close, my: uy * close, aim: dog.a };
  const mods = players.pedMods(world, dog); mods.speedMul *= fast; mods.canSwim = true; mods.analog = true;
  pedStep(dog, inp, dt, world.map, mods);
  if (go) dog.a = Math.atan2(dy, dx);
  world.place(dog);
}
function stepPartner(world, dog, dt) {
  const D = dog.k9, now = world.time, p = world.players.get(D.partner), h = p && p.ped;
  if (dog.removed || !p || !h || h.removed || !p.badge || h.dead || p.custody) { kennel(world, dog, p && !p.badge ? 'Your K9 partner goes back to the kennels for the night.' : null); return; }
  const unit = D.unit ? world.get(D.unit) : null;
  if (D.unit && (!unit || unit.removed || unit.wreckAt)) { if (dog.hidden && D.mode === 'ride') { kennel(world, dog, 'Your cruiser\'s gone - your K9 partner goes back to the kennels. Take it again at the armory.'); return; } D.unit = 0; }
  // in the armory with them: waiting in the kennel; out, at their side
  if (h.hidden && h.interior) { if (D.mode === 'hold') release(world, dog, 'gone'); dog.hidden = true; D.mode = 'kennel'; dog.x = h.x; dog.y = h.y; world.place(dog); return; }
  if (D.mode === 'kennel') { dog.hidden = false; D.mode = 'heel'; dog.x = h.x + 14; dog.y = h.y + 8; dog.vx = 0; dog.vy = 0; dog.lz = h.lz; world.place(dog); world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) }); }
  const car = h.vehId ? world.get(h.vehId) : null;
  // riding: in the back of the K9 unit; out with the handler when they get out by it
  if (D.mode === 'ride') {
    if (unit) { dog.x = unit.x; dog.y = unit.y; world.place(dog); }
    if (!h.vehId && !h.hidden && unit && Math.hypot(h.x - unit.x, h.y - unit.y) < K9_UNIT.boardPx) {
      dog.hidden = false; D.mode = 'heel'; dog.x = h.x + 14; dog.y = h.y + 8; dog.vx = 0; dog.vy = 0; dog.lz = h.lz; dog.hp = dog.maxHp; world.place(dog);   // (out of the car: rested)
      world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
    }
    return;
  }
  // into the cruiser with them (a police car: it becomes the K9 unit)
  if (car && car.def && car.def.police && car.def.kind === 'car' && D.mode !== 'hold' && Math.hypot(dog.x - car.x, dog.y - car.y) < K9_UNIT.boardPx) {
    const old = D.unit ? world.get(D.unit) : null;
    if (old && old !== car && old.k9 === dog.id) old.k9 = 0;
    D.unit = car.id; car.k9 = dog.id; dog.hidden = true; D.mode = 'ride'; D.on = 0; dog.vx = 0; dog.vy = 0;
    return;
  }
  if (Math.hypot(dog.x - h.x, dog.y - h.y) > K9_UNIT.strayPx) { kennel(world, dog, 'You left your K9 partner behind - it\'s gone back to the kennels. Take it again at the armory.'); return; }
  if (D.mode === 'hold') {
    const q = world.get(D.on);
    if (!q || q.removed || q.dead || q.cuffed || q.vehId || q.hidden || (q.player && q.player.custody)) { release(world, dog, 'done'); }
    else {
      const bits = q.player ? q.player.prevBits || 0 : 0;
      if ((bits & IN.FIRE) && !(D.tb & IN.FIRE)) D.mash++;
      D.tb = bits;
      if (D.mash >= K9_UNIT.mash) release(world, dog, 'shaken');
      else if (now >= D.until) release(world, dog, 'tired');
      else {
        const a = (q.a || 0) + D.la;
        dog.x = q.x + Math.cos(a) * 15; dog.y = q.y + Math.sin(a) * 15; dog.vx = 0; dog.vy = 0; dog.lz = q.lz;
        dog.a = Math.atan2(q.y - dog.y, q.x - dog.x);
        q.downUntil = Math.max(q.downUntil || 0, D.until); q.k9Until = D.until;
        world.place(dog);
        return;
      }
    }
  }
  if (D.mode === 'limp') {
    if (now >= D.until) { D.mode = 'heel'; D.spent = false; D.readyAt = Math.max(D.readyAt, now + K9_UNIT.cooldownS); }
    else { const a = Math.atan2(dog.y - D.from.y, dog.x - D.from.x); stepTo(world, dog, dog.x + Math.cos(a) * 60, dog.y + Math.sin(a) * 60, K9.limpMul, 0, dt, false); return; }
  }
  if (D.mode === 'run') {
    const t = world.get(D.on);
    const ok = t && !t.removed && !t.dead && !t.vehId && !t.hidden && !t.cuffed && sameLevel(t.lz, dog.lz) && law.isSuspectFor(world, p, t) && now - D.runAt < K9_UNIT.chaseS && Math.hypot(t.x - h.x, t.y - h.y) < K9_UNIT.sight * 1.6;
    if (!ok) { D.mode = 'heel'; D.on = 0; D.readyAt = Math.max(D.readyAt, now + K9_UNIT.cooldownS); }
    else {
      if (Math.hypot(t.x - dog.x, t.y - dog.y) < K9_UNIT.reach && now >= (t.graceUntil || 0) && now >= (t.protectUntil || 0)) { takedown(world, dog, t, p); return; }
      stepTo(world, dog, t.x, t.y, K9_UNIT.speed * (now < D.slowUntil ? K9.slowMul : 1), 0, dt, true, t.id);
      return;
    }
  }
  // at heel - and sent after a suspect when it's ready and its handler's on foot
  if (!h.vehId && now >= D.readyAt) {
    const t = quarry(world, p, dog);
    if (t) {
      D.mode = 'run'; D.on = t.id; D.runAt = now;
      world.emit(dog.x, dog.y, { e: 'bark', id: dog.id, x: Math.round(dog.x), y: Math.round(dog.y) });
      if (t.player) world.notify(t.player, 'A police dog is coming for you!', 'bad');
      return;
    }
  }
  const gx = h.x - Math.cos(h.a || 0) * 18 + Math.cos((h.a || 0) + 1.57) * 10, gy = h.y - Math.sin(h.a || 0) * 18 + Math.sin((h.a || 0) + 1.57) * 10;
  stepTo(world, dog, gx, gy, Math.hypot(gx - dog.x, gy - dog.y) > 90 ? 1.8 : 1, 14, dt, false);
}
