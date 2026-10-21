// Sharks (the nature program, 2026-10-21; the owner, 2026-10-05: "sharks: very rare, likeliest round the prison;
// fins; blood draws them"). A great white comes up out of the deep now and then where someone is swimming in the open
// sea: very rarely anywhere, more often in the water round Prison Island, and soon when there's blood in the water - a
// swimmer bleeding, hurt. It cruises with its fin cutting the water (the page draws the fin and the dark shape under
// it: client/art2/animals.js sharkModel), smells or sees a swimmer and circles them, closing in, then rushes in and
// bites - and the blood draws it back for another pass. It only ever hunts in the sea: get out of the water (onto
// land, a dock, a boat) and it loses you; it never comes into a river, a lake or the shallows over a beach. Hurt it
// badly and it goes back down. It's an animal (shared/fauna.js shark: the hunters' rules, its death screen, protected)
// with its own way of moving, here - the wildlife's step leaves it alone.
import { K, T, TILE } from '../../shared/constants.js';
import { isSwimming } from '../../shared/mapcore.js';
import { SPECIES, APOSE } from '../../shared/fauna.js';
import { mulberry32 } from '../../shared/rng.js';
import { inAnyView } from '../view.js';
import { spawnAnimal } from './wildlife.js';
import * as combat from './combat.js';

const rng = mulberry32(7715);
// every: how often (s) a swimmer is looked at for a shark; p: the chance each time (out at sea, round the prison, when
// they're bleeding); deep: tiles of sea round the spot it comes up at; near / far: how far off it comes up (px);
// sense: how far it finds a swimmer (px; smell: one who's bleeding); circle: the ring it swims round them (px, closing
// in over close s); bite: its damage, every biteS s at the most; speeds px/s; leave: the share of its health that
// sends it down; gone: how far from everyone before it's taken away (px)
export const SHARK = {
  every: 4, p: { sea: 0.0035, prison: 0.04, blood: 0.22 }, prisonR: 3600, deep: 4, near: 760, far: 1100,
  sense: 800, smell: 2200, circle: [230, 120], close: 9, bite: 38, biteS: 2.4, back: 2.6,
  cruise: 110, round: 170, rush: 340, turn: 2.2, leave: 0.55, gone: 2600, one: 3000,
};

// the open sea: water, not land, not a river or a lake (a shark never comes in off the sea)
export function seaAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (!map.inside(tx, ty)) return false;
  const i = map.idx(tx, ty), t = map.tiles[i];
  return (t === T.WATER || t === T.DEEP) && !map.land[i] && !(map.river && map.river[i]) && !(map.lake && map.lake[i]);
}
// deep sea all round (tiles): somewhere it can come up from
function deepAt(map, x, y, r) {
  for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) if (!seaAt(map, x + dx * TILE, y + dy * TILE)) return false;
  return map.tileAtPx(x, y) === T.DEEP;
}
// a swimmer in the sea (a player or anyone else): who it can hunt
const inSea = (world, q) => !!q && !q.dead && !q.vehId && !q.hidden && !q.wild && seaAt(world.map, q.x, q.y) && isSwimming(world.map, q);
const bleeding = (q) => !!q.bleeding || q.hp < q.maxHp * 0.5;
const sharks = (world) => { const out = []; for (const e of world.entities.values()) if (e.kind === K.PED && e.wild && e.wild.kind === 'shark' && !e.removed) out.push(e); return out; };

// the prison's island, once (its landmark), for the waters round it
function prisonOf(map) {
  if (map._prisonAt !== undefined) return map._prisonAt;
  const l = (map.landmarks || []).find((q) => /Prison Island|Penitentiary/.test(q.name || ''));
  const at = l ? { x: l.x + (l.w || 0) / 2, y: l.y + (l.h || 0) / 2 } : null;
  Object.defineProperty(map, '_prisonAt', { value: at, enumerable: false, configurable: true });
  return at;
}

// up out of the deep somewhere near (x, y), out of sight: the shark, or null
export function spawnNear(world, x, y, target = null) {
  for (let k = 0; k < 24; k++) {
    const a = rng() * Math.PI * 2, d = SHARK.near + rng() * (SHARK.far - SHARK.near), sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
    if (!deepAt(world.map, sx, sy, SHARK.deep) || (k < 16 && inAnyView(world, sx, sy, 80))) continue;   // (out of sight if it can be: up from the deep at the edge of view if not)
    const s = spawnAnimal(world, 'shark', sx, sy);
    const w = s.wild;
    w.own = true; w.state = 'cruise'; w.tid = target ? target.id : 0; w.until = world.time + 6; w.nextBite = 0; w.lastHp = s.hp;
    w.wx = sx; w.wy = sy; w.pose = APOSE.swim;
    s.a = Math.atan2(y - sy, x - sx);
    return s;
  }
  return null;
}

export function update(world, dt) {
  const now = world.time;
  // now and then, round each swimmer out in the sea: a shark comes up (one about at a time)
  if (world.tick % Math.round(SHARK.every * 20) === 11) {
    const all = sharks(world), prison = prisonOf(world.map);
    for (const p of world.players.values()) {
      const q = p.ped;
      if (!inSea(world, q) || all.some((s) => Math.hypot(s.x - q.x, s.y - q.y) < SHARK.one)) continue;
      const near = prison && Math.hypot(q.x - prison.x, q.y - prison.y) < SHARK.prisonR;
      const pr = bleeding(q) ? SHARK.p.blood : near ? SHARK.p.prison : SHARK.p.sea;
      if (rng() < pr) { const s = spawnNear(world, q.x, q.y, q); if (s) all.push(s); }
    }
  }
  for (const s of sharks(world)) step(world, s, dt, now);
}

function step(world, s, dt, now) {
  const w = s.wild, map = world.map;
  if (s.dead) return;
  // hurt badly: back down into the deep, gone once no one's looking
  if (s.hp < w.lastHp) { w.lastHp = s.hp; if (s.hp < s.maxHp * SHARK.leave) { w.state = 'leave'; w.tid = 0; } }
  let near = Infinity, nearest = null;
  for (const p of world.players.values()) if (p.ped) { const d = Math.hypot(p.ped.x - s.x, p.ped.y - s.y); if (d < near) { near = d; nearest = p.ped; } }
  if ((w.state === 'leave' || near > SHARK.gone) && !inAnyView(world, s.x, s.y, 60)) { world.remove(s); return; }
  // who it's after: the one it came up for, or the nearest swimmer it can see - or smell, bleeding
  let q = w.tid ? world.get(w.tid) : null;
  if (q && (!inSea(world, q) || Math.hypot(q.x - s.x, q.y - s.y) > SHARK.smell * 1.2)) { q = null; w.tid = 0; if (w.state !== 'leave') w.state = 'cruise'; }
  if (q && w.state === 'cruise') { w.state = 'circle'; w.until = now + SHARK.close; w.dir = rng() < 0.5 ? 1 : -1; }   // (the one it came up for)
  if (!q && w.state !== 'leave') {
    let best = null, bd = Infinity;
    for (const e of world.query(s.x, s.y, SHARK.smell, K.PED)) {
      if (!inSea(world, e)) continue;
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      if ((d < SHARK.sense || (bleeding(e) && d < SHARK.smell)) && d < bd) { bd = d; best = e; }
    }
    if (best) { q = best; w.tid = best.id; w.state = 'circle'; w.until = now + SHARK.close; w.ring = SHARK.circle[0]; w.dir = rng() < 0.5 ? 1 : -1; }
  }
  // where it's heading and how fast
  let gx = w.wx, gy = w.wy, speed = SHARK.cruise;
  if (w.state === 'leave') {
    // (straight out, away from whoever's nearest)
    if (!w.away) { const f = q || nearest, a = f ? Math.atan2(s.y - f.y, s.x - f.x) : s.a; w.away = [s.x + Math.cos(a) * 3000, s.y + Math.sin(a) * 3000]; }
    [gx, gy] = w.away; speed = SHARK.round;
  } else if (q && w.state === 'circle') {
    // round them, the ring closing; then the rush
    const k = Math.min(1, 1 - (w.until - now) / SHARK.close), ring = SHARK.circle[0] + (SHARK.circle[1] - SHARK.circle[0]) * k, ang = Math.atan2(s.y - q.y, s.x - q.x) + w.dir * 0.55;
    gx = q.x + Math.cos(ang) * ring; gy = q.y + Math.sin(ang) * ring; speed = SHARK.round;
    if (now >= w.until && now >= w.nextBite) w.state = 'rush';
  } else if (q && w.state === 'rush') {
    gx = q.x; gy = q.y; speed = SHARK.rush;
    if (Math.hypot(q.x - s.x, q.y - s.y) < s.r + 30) {
      const dir = Math.atan2(q.y - s.y, q.x - s.x);
      world.emit(q.x, q.y, { e: 'blood', x: q.x, y: q.y, a: dir, n: 8 });
      world.emit(s.x, s.y, { e: 'maul', x: s.x, y: s.y, id: s.id, t: q.id, a: +dir.toFixed(2) });
      combat.damage(world, q, SHARK.bite * (0.85 + rng() * 0.3), s, 'claw', dir);
      q.bleeding = true;
      w.nextBite = now + SHARK.biteS; w.bitAt = now;
      // (off after the bite, round again for another pass)
      w.state = 'circle'; w.until = now + SHARK.back + rng() * 2; w.dir = -w.dir;
    }
  } else if (now >= w.until || Math.hypot(w.wx - s.x, w.wy - s.y) < 40) {
    // cruising: somewhere else in the open sea
    for (let k = 0; k < 8; k++) { const a = rng() * Math.PI * 2, d = 300 + rng() * 500, x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d; if (seaAt(map, x, y)) { w.wx = x; w.wy = y; break; } }
    w.until = now + 6 + rng() * 6;
  }
  // turn toward it (a big fish doesn't turn on the spot), and swim on - never out of the sea
  const want = Math.atan2(gy - s.y, gx - s.x);
  let da = want - s.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  const rushing = w.state === 'rush', turn = SHARK.turn * (rushing ? 2.4 : 1);   // (the rush: it swings its head round onto you)
  s.a += Math.max(-turn * dt, Math.min(turn * dt, da));
  if (rushing && Math.abs(da) > 0.7) speed *= 0.45;
  const nx = s.x + Math.cos(s.a) * speed * dt, ny = s.y + Math.sin(s.a) * speed * dt;
  if (seaAt(map, nx + Math.cos(s.a) * s.r, ny + Math.sin(s.a) * s.r) && seaAt(map, nx, ny)) { s.vx = (nx - s.x) / dt; s.vy = (ny - s.y) / dt; s.x = nx; s.y = ny; }
  else { s.vx = 0; s.vy = 0; s.a += Math.PI * 0.6 * (w.dir || 1); if (w.state === 'cruise') w.until = 0; }
  w.pose = now - (w.bitAt || -9) < 0.7 ? APOSE.attack : APOSE.swim;
}

export const sharksOf = sharks;
