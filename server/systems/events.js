// Live world events (snatch-and-grabs, contraband drops) and per-player guidance (where to
// return a recovered purse). Clients get a small list in their `me` payload and draw blips +
// a fading arrow (client/hud.js, client/main.js).
import { K } from '../../shared/constants.js';
import { EVENT_RANGE } from '../../shared/worldevents.js';

export function add(world, ev) {
  world.happenings ??= [];
  world.happeningSeq = (world.happeningSeq || 0) + 1;
  const e = { id: world.happeningSeq, t: world.time, ...ev };
  world.happenings.push(e);
  for (const p of world.players.values()) p.meDirty = true;
  return e;
}

export function update(world) {
  if (world.tick % 5 !== 2 || !world.happenings) return;
  const now = world.time;
  world.happenings = world.happenings.filter((e) => {
    if (now > e.until) return false;
    if (e.kind === 'snatch') {
      const victim = world.get(e.victim);
      if (!victim || victim.dead || !victim.npc || !victim.npc.robbed) return false; // purse returned / victim gone
      const thief = world.get(e.thief);
      if (thief && !thief.dead && thief.npc && thief.npc.hasPurse) { e.x = thief.x; e.y = thief.y; } // follow the runner
      else if (!e.dropAt) e.dropAt = now; // thief dropped it: the blip stays where it fell for a bit
      if (e.dropAt && now - e.dropAt > 25) return false;
    }
    if (e.kind === 'drop' && !world.dropRumor) return false;
    return true;
  });
}

// What one player should see: nearby events, plus a "return it" target when they hold a purse.
export function forPlayer(world, p) {
  const ped = p.ped;
  if (!ped) return null;
  const out = [];
  for (const e of world.happenings || []) {
    if (Math.hypot(e.x - ped.x, e.y - ped.y) > EVENT_RANGE) continue;
    out.push({ id: e.id, k: e.kind, x: Math.round(e.x), y: Math.round(e.y) });
  }
  if ((p.profile.inventory.purse || 0) > 0) {
    let best = null, bd = EVENT_RANGE * 1.5;
    for (const e of world.query(ped.x, ped.y, bd, K.PED)) {
      if (!e.npc || e.dead || !e.npc.robbed) continue;
      const d = Math.hypot(e.x - ped.x, e.y - ped.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) out.push({ id: 'r' + best.id, k: 'ret', x: Math.round(best.x), y: Math.round(best.y) });
  }
  return out.length ? out : null;
}
