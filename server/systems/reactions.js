// Hit reactions: what a bullet, a blow, a blast or a fatal hit does to a body - nobody just flashes and
// walks on, or drops on the spot.
//  * A bullet staggers you back on your heels (forward, hit from behind) or knocks you off your feet and
//    slides you back along the ground. Running, it trips you into a roll or a faceplant; charging in, it
//    barely slows you - or puts you on your face and you scramble up and keep coming.
//  * A shotgun blast at close range blows you off your feet (and almost always kills: combat.js).
//  * An explosion throws you through the air.
//  * A bat (any heavy blow) knocks you back, now and then off your feet, and over onto your face or into a
//    roll if you were running.
//  * A fatal hit while running slides or rolls the body on to a stop; standing, it's knocked back onto its
//    back or crumples face down. The death event says how it lies.
//  * Knocked down by a bullet, people get back up limping; the worst hurt crawl away on their stomachs
//    (npc.js). Players keep control: a stagger and a shove - off their feet only for a shotgun blast at
//    close range, an explosion, or a heavy blow on the run.
// The client animates it from the 'react' (stagger), 'fling' (thrown) and 'death' (how it lies) events.
import { SHOTGUN_CLOSE_PX, HIT_LIMP_S } from '../../shared/rules.js';
import { isSwimming } from '../../shared/map.js';
import * as vehicles from './vehicles.js';

const LIE = { face: 'face', slide: 'back', roll: 'side' };   // how a body comes to rest after each kind of throw
// how the cut down fall (the client plays each): sinking to the knees then over on the face, spun half round and down
// on the side, slumping back to the knees then onto the back
const BLADE_DEATHS = ['knees', 'spin', 'slump', 'knees', 'spin'];
const speedOf = (p) => Math.hypot(p.vx, p.vy);
// how easily someone goes over: police, guards, gang heavies and the clubs' bouncers are drilled and keep their feet more; brutes too
const steady = (ped) => (ped.npc && (ped.npc.role === 'cop' || ped.npc.role === 'railguard' || ped.npc.role === 'gang' || ped.npc.role === 'bouncer') ? 0.55 : 1) / Math.sqrt(ped.build ? ped.build.poise : 1);

// A moment's stagger: shoved a step along the hit and thrown back on the heels (or forward, hit from behind).
export function stagger(world, ped, a, push, secs) {
  ped.vx += Math.cos(a) * push; ped.vy += Math.sin(a) * push;
  ped.staggerUntil = world.time + secs;
  world.emit(ped.x, ped.y, { e: 'react', id: ped.id, k: 's', d: +secs.toFixed(2), a: +a.toFixed(2), x: ped.x, y: ped.y });
}

// Off their feet along heading a: through the air, then sliding on the back, rolling or on the face, and up
// again after getUp (never, for the dead).
function knock(world, ped, a, speed, kind, air, slide, getUp) {
  vehicles.fling(world, ped, Math.cos(a) * speed, Math.sin(a) * speed, null, 'hit', 0, { kind, air, slide, getUp });
}

// Shot. info: { n: pellets in, dist: from the shooter, a: the shot's heading, lethal: this hit kills }.
// Runs before the damage, so a fatal shotgun blast throws the body too.
export function shot(world, ped, attacker, w, info) {
  if (ped.vehId || ped.onTrain || ped.hidden || ped.dead || isSwimming(world.map, ped)) return;
  const now = world.time, a = info.a, k = steady(ped);
  if ((w.pellets || 1) > 1 && info.n >= 3 && info.dist < SHOTGUN_CLOSE_PX) {   // blown off the feet, dead or alive
    const c = 1 - info.dist / SHOTGUN_CLOSE_PX;
    knock(world, ped, a + (world.rand() - 0.5) * 0.3, (320 + 280 * c) * Math.max(0.6, k), 'slide', 0.2 + 0.18 * c, 0.45 + 0.4 * c, 1.5);
    return;
  }
  if (info.lethal) return;                                  // the fall itself: died()
  if (ped.player) { stagger(world, ped, a, 80, 0.3); return; }
  if (now < ped.downUntil) return;                          // already down
  const sp = speedOf(ped), mv = Math.atan2(ped.vy, ped.vx), r = world.rand();
  if (sp > 110 && Math.cos(mv - a) > 0.3) {
    // running away: stumble on, trip into a roll, or go down on the face and slide
    if (r < 0.35 * k) knock(world, ped, mv, sp * 0.95, 'roll', 0.16, 0.5, 0.35);
    else if (r < 0.65 * k) knock(world, ped, mv, sp * 0.9, 'face', 0.12, 0.4, 0.9);
    else stagger(world, ped, a, 40, 0.3);
  } else if (sp > 80 && Math.cos(mv - a) < -0.3) {
    // coming at you: it barely slows them - or puts them on their face, and they scramble up and keep coming
    if (r < 0.35 * k) knock(world, ped, mv, sp * 0.55, 'face', 0.1, 0.3, 0.7);
    else stagger(world, ped, a, 90, 0.35);
  } else if (r < 0.43 * k) {
    knock(world, ped, a, 170 + world.rand() * 100, 'slide', 0.14, 0.35 + world.rand() * 0.25, 1.1);   // off the feet, back along the ground
  } else if (r < 0.55 * k) {
    knock(world, ped, a + (world.rand() - 0.5) * 1.4, 150, 'roll', 0.16, 0.4, 0.7);                   // spun round and down
  } else stagger(world, ped, a, 110, 0.4);                                                            // back on the heels
  if (now < ped.downUntil) ped.limpUntil = Math.max(ped.limpUntil || 0, now + HIT_LIMP_S);           // they'll get up limping
}

// A blow (melee() has already shoved them). was: how they were moving before it - { speed, heading }.
export function blow(world, ped, attacker, w, dir, was) {
  if (ped.vehId || ped.onTrain || ped.dead || world.time < ped.downUntil || isSwimming(world.map, ped)) return;   // (floored already: a combo, a taser)
  const heavy = w.id !== 'fists' && w.id !== 'knife', k = steady(ped), r = world.rand();
  if (heavy && was.speed > 140 && r < (ped.player ? 0.35 : 0.75) * k) {
    // hit on the run: over onto the face, or into a roll
    const roll = world.rand() < 0.5;
    knock(world, ped, was.heading, was.speed * 0.85, roll ? 'roll' : 'face', 0.14, roll ? 0.5 : 0.4, roll ? 0.4 : 0.9);
  } else if (heavy && r < (ped.player ? 0.1 : 0.3) * k) knock(world, ped, dir, 190, 'slide', 0.14, 0.3, 1.0);  // knocked flat on the back
  else stagger(world, ped, dir, 0, 0.3);
}

// An explosion at f (0..1 how close) of its radius, heading a away from it: thrown through the air. k: how much harder
// than an ordinary blast (a huge one - a fuel tanker, explosives: BLAST_FLING): faster (up to 950 px/s at the heart of
// the biggest), higher and longer in the air, further along the ground after.
export function blasted(world, ped, a, f, k = 1) {
  if (ped.vehId || ped.onTrain || isSwimming(world.map, ped)) return;
  const kinds = ['roll', 'face', 'slide'];
  knock(world, ped, a + (world.rand() - 0.5) * 0.4, Math.min(950, (240 + 480 * f) * k), kinds[Math.floor(world.rand() * 3)], (0.3 + 0.5 * f) * Math.sqrt(k), (0.5 + 0.5 * f) * Math.sqrt(k), 1.3);
}

// The fall, from combat.kill: a body already thrown lands as it was thrown; one cut down on the run slides on
// (on the face - or on the back, if it was going backwards) or rolls to a stop; one standing is knocked back
// onto its back or crumples. Emits the death event with how it lies ('face' | 'back' | 'side'); cut down by a blade:
// 'knees' | 'spin' | 'slump', a finisher 'stab' | 'slash', the plasma blade 'halved'.
export function died(world, ped, cause, dir) {
  const now = world.time, sp = speedOf(ped), mv = Math.atan2(ped.vy, ped.vx);
  let lie;
  if (ped.halved) { ped.vx *= 0.1; ped.vy *= 0.1; lie = 'halved'; }                 // the plasma blade: in two halves where it stood
  else if (ped.finisher) { ped.vx *= 0.1; ped.vy *= 0.1; lie = ped.finisher; }      // a finishing stab or slash: down where they stand
  else if (now < (ped.tumbleUntil || 0)) lie = LIE[ped.flungKind] || 'back';
  else if (cause === 'melee' && ped.killBlade && world.rand() < 0.8) { ped.vx *= 0.25; ped.vy *= 0.25; lie = BLADE_DEATHS[Math.floor(world.rand() * BLADE_DEATHS.length)]; }   // cut down: to the knees, spun round, slumping back
  else if (sp > 100 && cause !== 'train' && cause !== 'bleed') {
    const r = world.rand(), backward = Math.cos((ped.a || 0) - mv) < -0.2;
    const kind = r < 0.25 ? 'roll' : backward ? 'slide' : 'face';
    knock(world, ped, mv, sp * (kind === 'slide' ? 0.75 : 0.95), kind, 0.12, 0.3 + sp / 700, 0);
    lie = kind === 'roll' ? (world.rand() < 0.5 ? 'side' : 'face') : LIE[kind];
  } else if (cause === 'gun' || cause === 'melee' || cause === 'nonlethal') {
    if (world.rand() < 0.55) { knock(world, ped, dir, 110 + world.rand() * 60, 'slide', 0.1, 0.3, 0); lie = 'back'; }
    else { ped.vx *= 0.2; ped.vy *= 0.2; lie = world.rand() < 0.7 ? 'face' : 'side'; }
  } else { ped.vx *= 0.3; ped.vy *= 0.3; lie = ['back', 'face', 'side'][Math.floor(world.rand() * 3)]; }
  world.emit(ped.x, ped.y, { e: 'death', x: ped.x, y: ped.y, a: dir, id: ped.id, k: lie });
}
