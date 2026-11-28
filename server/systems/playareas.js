// Courts in play are the players' (the owner, 11-17 21:18: "NPCs walk across the court during a game (a group stands on
// the baseline)" - the pre-beta list's class fix: "any area where a game is being played is closed to NPC walkers and
// idlers while it's in use - their paths route around it"). The areas in play now: a tennis court with a game on it
// (tennis.js: the court's lines and its run-off), a half court someone's shooting hoops on (hoops.js). Passers-by treat
// them as the skate parks (npc.js pickWaypoint): never a waypoint in one nor across one, and one who finds themselves on
// one heads off it the nearest way. The game's own people (the club pro: npc.driven) aren't asked. Kept cheap: a list
// made once a tick, a box test each.
import { courts } from './tennis.js';
import { courtHoops } from '../../shared/hoops.js';

export const PLAY_PAD = 20;   // px round the lines kept clear (the run-off a rally uses, a ball off the rim)

// the boxes in play this tick: [{ x0, y0, x1, y1 }]
export function inPlay(world) {
  if (world._playTick === world.tick) return world._play;
  const out = (world._play ||= []); out.length = 0; world._playTick = world.tick;
  if (world.tennis && world.tennis.size) {
    const cs = courts(world);
    for (const G of world.tennis.values()) { const c = cs[G.c]; if (c) out.push({ x0: c.x0 - PLAY_PAD, y0: c.y0 - PLAY_PAD, x1: c.x1 + PLAY_PAD, y1: c.y1 + PLAY_PAD }); }
  }
  let hs = null;
  for (const p of world.players.values()) {
    if (!p.hoops || !p.ped) continue;
    hs ||= courtHoops(world.map);
    const h = hs[p.hoops.k];
    if (h && h.court) out.push({ x0: h.court.x0 - PLAY_PAD, y0: h.court.y0 - PLAY_PAD, x1: h.court.x1 + PLAY_PAD, y1: h.court.y1 + PLAY_PAD });
  }
  return out;
}
const inside = (a, x, y) => x > a.x0 && x < a.x1 && y > a.y0 && y < a.y1;
// the box in play (x, y) stands in, or null
export function playAt(world, x, y) { for (const a of inPlay(world)) if (inside(a, x, y)) return a; return null; }
// does the walk (x0, y0) -> (x1, y1) cross a box in play (Liang-Barsky against each)
export function playCrossed(world, x0, y0, x1, y1) {
  for (const a of inPlay(world)) {
    let t0 = 0, t1 = 1;
    const dx = x1 - x0, dy = y1 - y0, P = [-dx, dx, -dy, dy], Q = [x0 - a.x0, a.x1 - x0, y0 - a.y0, a.y1 - y0];
    let hit = true;
    for (let i = 0; i < 4 && hit; i++) {
      if (P[i] === 0) { if (Q[i] < 0) hit = false; continue; }
      const r = Q[i] / P[i];
      if (P[i] < 0) { if (r > t1) hit = false; else if (r > t0) t0 = r; } else if (r < t0) hit = false; else if (r < t1) t1 = r;
    }
    if (hit) return true;
  }
  return false;
}
// the nearest way off box a from (x, y): a point just outside its nearest edge
export function playOff(a, x, y) {
  const d = [x - a.x0, a.x1 - x, y - a.y0, a.y1 - y], m = Math.min(...d), k = d.indexOf(m);
  return k === 0 ? { x: a.x0 - 16, y } : k === 1 ? { x: a.x1 + 16, y } : k === 2 ? { x, y: a.y0 - 16 } : { x, y: a.y1 + 16 };
}
