// The Syndicate as a joinable faction. Join at any gang HQ in the city (not while you wear a
// badge): gang members are left alone on the turf, the Smuggler's Rock compound gate opens for
// them, and the den there sells hardware and buys poached sea life. Outsiders who land on the
// Rock are attacked by the guards.
import { ISLANDS } from '../../shared/map.js';
import { GANG_JOIN_FEE } from '../../shared/rules.js';
import { store } from '../store.js';
import { spawnNpc, despawnNpc, startFight } from './npc.js';

const TILE = 32;
const WARN_S = 3;  // outsiders get this long to turn back before the guards shoot
export const isMember = (p) => !!(p && p.profile.gang === 'syndicate');

export function join(world, p, pay) {
  if (p.badge) return 'The Syndicate doesn\'t take cops.';
  if (isMember(p)) return 'You\'re already in.';
  if (!pay(p, GANG_JOIN_FEE)) return `The initiation costs $${GANG_JOIN_FEE}.`;
  p.profile.gang = 'syndicate';
  p.gangHostileUntil = 0;
  store.touch(); p.meDirty = true;
  world.notify(p, 'You\'re Syndicate now. The turf leaves you be, and the gate on Smuggler\'s Rock will open for you.', 'good');
  return null;
}

export function leave(world, p) {
  if (!isMember(p)) return 'You\'re not a member.';
  p.profile.gang = null;
  store.touch(); p.meDirty = true;
  world.notify(p, 'You walked away from the Syndicate. Don\'t go back to the Rock.', 'warn');
  return null;
}

const onRock = (x, y) => { const [x0, y0, x1, y1] = ISLANDS.C.box; return x > (x0 - 3) * TILE && x < (x1 + 3) * TILE && y > (y0 - 3) * TILE && y < (y1 + 3) * TILE; };

export function update(world) {
  if (world.tick % 10 !== 6) return;
  const rock = world.map.rock;
  if (!rock) return;
  world.rockGuards ??= [];
  const players = [...world.players.values()].filter((p) => p.ped && !p.ped.dead);
  const near = players.some((p) => Math.hypot(p.ped.x - rock.x, p.ped.y - rock.y) < 2200);
  world.rockGuards = world.rockGuards.filter((id) => { const g = world.get(id); return g && !g.removed; });
  if (near && !world.rockGuards.length && world.time >= (world.rockRespawnAt || 0)) {
    for (const post of rock.guards) {
      const g = spawnNpc(world, 'syndicate', post.x, post.y, 'gang');
      g.npc.keep = true; g.npc.guard = { x: post.x, y: post.y, a: Math.random() * 6.28 };
      g.weapon = world.rockGuards.length % 3 === 0 ? 'smg' : 'pistol';
      world.rockGuards.push(g.id);
    }
  } else if (!near && world.rockGuards.length) {
    for (const id of world.rockGuards) { const g = world.get(id); if (g) despawnNpc(world, g); }
    world.rockGuards = [];
  }
  if (world.rockGuards.length && world.rockGuards.every((id) => world.get(id)?.dead)) world.rockRespawnAt = world.time + 240; // wiped out: reinforcements later
  // outsiders on the Rock: one warning, then the guards open up
  for (const p of players) {
    const ped = p.ped;
    if (isMember(p) || ped.hidden || !onRock(ped.x, ped.y)) { if (p.rockWarnedAt && world.time - p.rockWarnedAt > 30) p.rockWarnedAt = 0; continue; }
    const seen = world.rockGuards.some((id) => { const g = world.get(id); return g && !g.dead && Math.hypot(g.x - ped.x, g.y - ped.y) < 460 && world.map.los(g.x, g.y, ped.x, ped.y); });
    if (!seen) continue;
    if (!p.rockWarnedAt) { p.rockWarnedAt = world.time; world.notify(p, `Syndicate guards: "Members only on the Rock! Turn around - you've got ${WARN_S} seconds."`, 'bad'); continue; }
    if (world.time - p.rockWarnedAt < WARN_S) continue;
    for (const id of world.rockGuards) {
      const g = world.get(id);
      if (!g || g.dead || g.npc.state === 'fight') continue;
      if (Math.hypot(g.x - ped.x, g.y - ped.y) < 460 && world.map.los(g.x, g.y, ped.x, ped.y)) startFight(world, g, ped, 40);
    }
  }
}
