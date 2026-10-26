// Blood and dirt on people (the owner, 10-16: the bathhouses' "usable showers"): a player's ped.grime { b, d } (0..1
// each). Blood: a hit's share of your health (combat.js damage), more when you kill someone up close (combat.js kill),
// treading in a pool of it already leaves red footprints (ped.bloodyFeet: combat.js); dirt: a tumble along the ground
// (vehicles.js fling). Swimming washes it off, rain the dirt slowly; a shower - at home or at a bathhouse - all of it
// (wash: the bleeding stopped, a burn out, the red footprints gone). Covered in blood (b over BATH.seen) out in the
// street, people stare and step back from you (npc.js backOff), and an officer who sees you grows suspicious - once
// every BATH.eyeS s (law.js's hidden suspicion: never a star on its own, but the next small thing they see counts more).
import { K } from '../../shared/constants.js';
import { BATH } from '../../shared/rules-play.js';
import { SUSPICION_STAR } from '../../shared/rules.js';
import { isSwimming } from '../../shared/map.js';
import * as law from './law.js';
import * as npc from './npc.js';

export const grimeOf = (ped) => (ped && ped.grime) || { b: 0, d: 0 };
export function soil(world, ped, blood, dirt) {
  if (!ped || !ped.player || ped.dead || ped.hidden) return;
  const g = (ped.grime ||= { b: 0, d: 0 }), was = g.b;
  g.b = Math.min(1, g.b + Math.max(0, blood)); g.d = Math.min(1, g.d + Math.max(0, dirt));
  if (was < BATH.seen && g.b >= BATH.seen && world.time - (ped.grimeMsgAt ?? -1e9) > 60) { ped.grimeMsgAt = world.time; world.notify(ped.player, 'You\'re covered in blood - people will notice. A shower would wash it off.', 'warn'); }
}
// a shower: everything off you
export function wash(world, ped) {
  const g = grimeOf(ped), had = g.b > 0.05 || g.d > 0.05 || ped.bloodyFeet > 0;
  ped.grime = { b: 0, d: 0 }; ped.bloodyFeet = 0; ped.bleeding = false; ped.burnT = 0;
  return had;
}
// how it reads, for a prompt ('' when you're clean)
export function grimeWord(ped) {
  const g = grimeOf(ped);
  return g.b > 0.05 && g.d > 0.05 ? 'the blood and the dirt' : g.b > 0.05 ? 'the blood' : g.d > 0.05 ? 'the dirt' : ped && ped.bloodyFeet > 0 ? 'the blood off your shoes' : '';
}

// every tick (bathhouse.js update): the water and the rain; the city noticing someone covered in blood (a second apart)
export function update(world, dt) {
  const now = world.time, rain = world.weather === 1;
  for (const p of world.players.values()) {
    const ped = p.ped, g = ped && ped.grime;
    if (!g || ped.dead) continue;
    if (!ped.vehId && !ped.hidden && isSwimming(world.map, ped)) { g.b = Math.max(0, g.b - dt * 0.5); g.d = Math.max(0, g.d - dt * 0.8); }
    else if (rain && !ped.hidden && !ped.vehId) g.d = Math.max(0, g.d - dt / BATH.rainS);
    if (g.b < 0.01 && g.d < 0.01) { ped.grime = null; continue; }
    if (g.b < BATH.seen || ped.hidden || ped.vehId || (world.tick + ped.id) % 20) continue;
    for (const e of world.query(ped.x, ped.y, BATH.copR, K.PED)) {
      if (!e.npc || e.dead || e.vehId) continue;
      const d = Math.hypot(e.x - ped.x, e.y - ped.y);
      if (e.npc.role === 'cop') {
        if (p.wanted > 0 || now - (p.bloodEyedAt ?? -1e9) < BATH.eyeS) continue;
        p.bloodEyedAt = now;
        const s = law.suspicionOf(world, p);
        if (s < SUSPICION_STAR - 1) { p.suspicion = s + 1; p.suspicionAt = now; }
        world.notify(p, 'An officer eyes the blood on your clothes...', 'warn');
      } else if (d < 90 && e.npc.state === 'wander' && e.npc.role === 'civ') npc.backOff(world, e, ped);
    }
  }
}
