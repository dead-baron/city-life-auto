// Prison Island (the owner, 10-05: "Prison island: sentenced after many arrests, about 5 min max, breakouts, prison-break
// quests"; Kestrel Bay Penitentiary was built in World v3 with nobody sent there). Booked for the third time in a day,
// or at four stars or more (shared/rules.js PRISON), it isn't the station's cells: it's a sentence out on the island -
// no bail - two to five minutes inside the walls of Kestrel Bay Penitentiary. Inside, the weapons are put away and
// nobody hurts anyone (as in the cells: ped.cellSafe); the gate opens for the officers, never for a prisoner. Time
// served, you're let out and the Prison Boat brings you back to the mainland (Sandpiper Bay Police Dock).
// The breakout: at the compound's outer wall the action button climbs it - five seconds up and over, in plain sight
// of the towers. Over the wall you're out (in the water off the island, or on its rocks) - and wanted, three stars: the
// rest is getting off the island (a long swim, the sharks: sharks.js). Logging off inside keeps the time left, served
// next time you play (custody.js saveJail / onJoin).
//   p.prison: { until, since, stars, weapon (back in your hand when you're out), climb: { until, x, y } | null }
import { TILE, T, STAR_HEAT } from '../../shared/constants.js';
import { PED_BLOCK } from '../../shared/map.js';
import { PRISON as PR } from '../../shared/rules.js';
import { store } from '../store.js';
import * as law from './law.js';
import * as homes from './homes.js';
import { ferryRoutes } from './ferries.js';
import { spawnNpc } from './npc.js';

const live = (world) => world.map.prison || null;
const inCompound = (P, x, y) => { const c = P.compound; return x > c.tx * TILE && x < (c.tx + c.tw) * TILE && y > c.ty * TILE && y < (c.ty + c.th) * TILE; };
export const inPrison = (p) => !!(p && p.prison);

// ---- who goes there -------------------------------------------------------------------------------------------------------
// every booking is noted (the last few, as wall-clock times: a day's are counted)
export function noteArrest(p) {
  const a = (p.profile.arrests ||= []);
  a.push(Date.now());
  while (a.length > 8) a.shift();
}
const recent = (p) => (p.profile.arrests || []).filter((t) => Date.now() - t < PR.repeatMs).length;
// the sentence for a booking at `stars` (s), or 0: the station's cells as ever
export function sentenceFor(world, p, stars) {
  if (!live(world)) return 0;
  const n = recent(p);
  if (stars < PR.stars && n < PR.repeat) return 0;
  return Math.min(PR.max, PR.base + PR.perStar * stars + PR.perRepeat * Math.max(0, n - 1));
}

// ---- in -------------------------------------------------------------------------------------------------------------------
// the intake: on the walk inside the gate, clear of everything
function intake(world, P) {
  const m = world.map, c = P.compound, gx = world.map.gates && world.map.gates[P.gate] ? world.map.gates[P.gate].x : (c.tx + c.tw / 2) * TILE;
  const y0 = (c.ty + c.th - 5) * TILE;
  for (let r = 0; r < 14 * TILE; r += 16) for (let k = 0; k < 16; k++) {
    const a = k / 16 * Math.PI * 2, x = gx + Math.cos(a) * r, y = y0 - Math.abs(Math.sin(a)) * r;
    if (inCompound(P, x, y) && open(m, x, y)) return { x, y };
  }
  return { x: gx, y: y0 };
}
const open = (m, x, y) => {
  for (const [dx, dy] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10]]) { const t = m.tileAtPx(x + dx, y + dy); if (PED_BLOCK[t] || t === T.WATER || t === T.DEEP) return false; }
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) for (const e of m.solidProps.get(m.idx(tx + ox, ty + oy)) || []) if (!e.off && Math.hypot(e.x - x, e.y - y) < e.r + 12) return false;
  return true;
};

export function sentence(world, p, secs, stars, quiet = false) {
  const P = live(world), ped = p.ped;
  if (!P || !ped) return false;
  if (ped.vehId) { const v = world.get(ped.vehId); if (v) { const i = v.seats.indexOf(ped.id); if (i >= 0) v.seats[i] = 0; } ped.vehId = 0; ped.seat = -1; }
  ped.cuffed = false; ped.appVer = (ped.appVer || 0) + 1;
  ped.hidden = false; ped.inside = null; ped.interior = null; ped.sub = false; ped.ug = 0; ped.lz = 0; ped.fishing = null; ped.sky = null;
  ped.vx = 0; ped.vy = 0; ped.rollT = 0; ped.downUntil = 0; ped.stunUntil = 0;
  const at = intake(world, P);
  ped.x = at.x; ped.y = at.y; ped.a = -Math.PI / 2;
  world.place(ped);
  p.teleportAt = world.time;
  p.prison = { since: world.time, until: world.time + secs, stars, weapon: ped.weapon && ped.weapon !== 'fists' ? ped.weapon : null, climb: null };
  ped.weapon = 'fists'; ped.cellSafe = true;
  p.meDirty = true;
  store.touch();
  if (!quiet) world.notify(p, `Sentenced: ${fmt(secs)} at ${P.name} on Prison Island - no bail this time. Out on the Prison Boat when it's served... or over the wall.`, 'bad');
  return true;
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---- inside ---------------------------------------------------------------------------------------------------------------
// the outer wall within reach from inside: the way over it (a spot out beyond it)
function wallBy(world, P, ped) {
  const m = world.map, c = P.compound, tx = Math.floor(ped.x / TILE), ty = Math.floor(ped.y / TILE);
  const ring = (x, y) => x <= c.tx + 1 || x >= c.tx + c.tw - 2 || y <= c.ty + 1 || y >= c.ty + c.th - 2;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const x = tx + dx, y = ty + dy;
    if (!m.inside(x, y) || m.tiles[m.idx(x, y)] !== T.WALL || !ring(x, y)) continue;
    // over it: straight on, past the wall's two tiles, to the first place you can be (the island, or the water)
    for (let k = 2; k < 8; k++) {
      const ox = (tx + dx * k + 0.5) * TILE, oy = (ty + dy * k + 0.5) * TILE, t = m.tileAtPx(ox, oy);
      if (!PED_BLOCK[t] && !inCompound(P, ox, oy)) return { x: ox, y: oy };
    }
  }
  return null;
}

export function interaction(world, p) {
  const P = live(world), S = p.prison, ped = p.ped;
  if (!S || !P || !ped || ped.dead) return null;
  if (S.climb) return { label: 'Climbing...', passive: true };
  const over = wallBy(world, P, ped);
  if (over) return { label: 'Climb the wall - the guards will see', crime: false, run: () => climb(world, p, over) };
  return { label: `Doing time: out in ${fmt(S.until - world.time)}`, passive: true };
}
function climb(world, p, over) {
  const S = p.prison;
  if (!S || S.climb) return;
  S.climb = { until: world.time + PR.climbS, x: over.x, y: over.y };
  world.emit(p.ped.x, p.ped.y, { e: 'alarm', x: Math.round(p.ped.x), y: Math.round(p.ped.y) });
  world.notify(p, 'Up the wall... the tower\'s seen you!', 'warn');
  p.meDirty = true;
}

export function update(world, dt) {
  const P = live(world);
  if (!P) return;
  let any = false;
  for (const p of world.players.values()) {
    const S = p.prison, ped = p.ped;
    if (!S) continue;
    if (!ped || ped.removed) continue;
    any = true;
    ped.weapon = 'fists'; ped.cellSafe = !S.climb;
    if (S.climb) {   // (on the wall: held there till over it)
      ped.vx = 0; ped.vy = 0;
      if (world.time >= S.climb.until) { ped.x = S.climb.x; ped.y = S.climb.y; world.place(ped); p.teleportAt = world.time; escaped(world, p, 'Over the wall! The alarm\'s going - get off the island.'); }
      continue;
    }
    if (!inCompound(P, ped.x, ped.y)) { escaped(world, p, 'Out of the compound! The alarm\'s going - get off the island.'); continue; }
    if (world.time >= S.until) { release(world, p); continue; }
    if (world.tick % 20 === 0) p.meDirty = true;
  }
  guards(world, P, any);
}

// out the hard way: three stars, the weapons back
function escaped(world, p, msg) {
  const S = p.prison, ped = p.ped;
  p.prison = null;
  ped.cellSafe = false;
  if (S.weapon && p.profile.weapons[S.weapon] !== undefined) ped.weapon = S.weapon;
  law.addHeat(world, p, Math.max(0, STAR_HEAT[PR.escapeStars] - (p.heat || 0) + 1), ped.x, ped.y);
  world.emit(ped.x, ped.y, { e: 'alarm', x: Math.round(ped.x), y: Math.round(ped.y) });
  world.notify(p, msg, 'bad');
  p.meDirty = true;
  store.touch();
}

// time served: let out, and the Prison Boat back to the mainland - off it at Sandpiper Bay Police Dock
export function release(world, p, msg = null) {
  const S = p.prison, ped = p.ped;
  p.prison = null;
  if (!ped) return;
  ped.cellSafe = false;
  if (S && S.weapon && p.profile.weapons[S.weapon] !== undefined) ped.weapon = S.weapon;
  const R = (ferryRoutes(world) || []).find((r) => r.custody), land = R && R.stops[0] && R.stops[0].land;
  const at = land ? { x: land.x, y: land.y } : live(world).dock || { x: ped.x, y: ped.y };
  ped.x = at.x; ped.y = at.y; ped.vx = 0; ped.vy = 0;
  world.place(ped);
  homes.protect(world, ped, 3);
  p.teleportAt = world.time;
  world.notify(p, msg || `Time served. The Prison Boat brings you back to ${R ? R.mainland : 'the mainland'}.`, 'good');
  p.meDirty = true;
  store.touch();
}

// the guards at their posts (the gate, the yard's corners, the blocks' doors, the harbour) while anyone's
// doing time there; gone again when nobody is
function guards(world, P, any) {
  const G = (world.prisonGuards ||= []);
  if (any && !G.length) {
    for (const g of P.guards) {
      if (g.tower) continue;   // (up the towers: not drawn - the posts on the ground)
      const c = spawnNpc(world, 'cop', g.x, g.y, 'cop');
      c.weapon = 'rifle'; c.npc.tactic = 'fire'; c.npc.beat = false; c.npc.keep = true; c.npc.guard = true; c.npc.state = 'idle';
      c.a = Math.atan2(P.y - g.y, P.x - g.x);
      G.push(c.id);
    }
    world.prisonGuardsAt = world.time;
  } else if (!any && G.length && world.time - (world.prisonGuardsAt || 0) > 30) {
    for (const id of G) { const c = world.get(id); if (c && !c.removed) world.remove(c); }
    G.length = 0;
  }
  if (any) world.prisonGuardsAt = world.time;
}

export function meInfo(world, p) {
  const S = p.prison;
  return S ? { left: Math.max(0, Math.ceil(S.until - world.time)), climb: !!S.climb, at: (live(world) || {}).name || 'Prison Island' } : null;
}

// logging off inside: the time left kept with the character (custody.js saveJail), served next time (onJoin)
export function save(p, world) {
  const S = p.prison;
  if (!S) return false;
  p.profile.jail = { prison: true, left: Math.max(1, Math.ceil(S.until - world.time)), stars: S.stars, weapon: S.weapon };
  if (S.weapon && p.ped) p.ped.weapon = S.weapon;
  p.prison = null;
  return true;
}
export function resume(world, p, j) {
  if (!sentence(world, p, j.left, j.stars || 4, true)) return false;
  if (j.weapon) p.prison.weapon = j.weapon;
  world.notify(p, `Still doing time at ${live(world).name}: ${fmt(j.left)} left.`, 'warn');
  return true;
}
