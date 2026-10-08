// Campfires (design notes: "at campsites, out in the boonies and on beaches, with seats; light them or put them out.
// Sitting by one slowly heals you"). Every campfire on the map (the campgrounds, the camps, the beach fires, the
// hunting camps: the map's campfire props, lit or not as they were laid out) can be lit with the action button.
// Sit by a lit one and you warm up: health creeps back (rules.js FIRE_HEAL) while you sit there, out of the fight.
// Getting up (any step), a hit or a car door ends it; sitting there, the action button puts the fire out. A fire
// someone lit burns down after a while, and the campers light theirs again (a change goes back the way the map
// laid it out after FIRE_BURN_S). Everyone sees every fire the same (the 'fire' event; the welcome's list).
import { FIRE_REACH, FIRE_HEAL, FIRE_AFTER_HIT_S, FIRE_BURN_S } from '../../shared/rules.js';

const SIT_MOVE_PX = 6;   // a step this far gets you up

// every campfire prop's index (made once)
function fireIdx(map) {
  if (map._campfires) return map._campfires;
  const out = [];
  map.props.forEach((p, i) => { if (p && p.t === 'campfire') out.push(i); });
  Object.defineProperty(map, '_campfires', { value: out, enumerable: false, configurable: true });
  return out;
}
export const isLit = (world, i) => { const o = world.fires && world.fires.get(i); return o ? o.lit : !!(world.map.props[i] && world.map.props[i].lit); };

// the nearest campfire within r px (lit only, when asked): { i, p, d } or null
export function fireNear(world, x, y, r = FIRE_REACH, litOnly = false) {
  let best = null;
  for (const i of fireIdx(world.map)) {
    const p = world.map.props[i];
    if (!p || p.broken || Math.abs(p.x - x) > r || Math.abs(p.y - y) > r) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < r && (!best || d < best.d) && (!litOnly || isLit(world, i))) best = { i, p, d };
  }
  return best;
}

// the fires that aren't the way the map laid them out (for a player joining)
export function fireList(world) {
  const out = [];
  for (const [i, o] of world.fires || []) out.push([i, o.lit ? 1 : 0]);
  return out;
}

export function setLit(world, i, lit) {
  const p = world.map.props[i];
  if (!p || isLit(world, i) === !!lit) return false;
  world.fires ||= new Map();
  if (!!lit === !!p.lit) world.fires.delete(i); else world.fires.set(i, { lit: !!lit, until: world.time + FIRE_BURN_S });
  world.broadcast({ e: 'fire', i, lit: lit ? 1 : 0, x: Math.round(p.x), y: Math.round(p.y) });
  if (!lit) for (const q of world.players.values()) if (q.ped && q.ped.sit && q.ped.sit.i === i) standUp(world, q.ped);
  return true;
}

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.dead) return null;
  if (ped.sit) return { label: 'Put out the fire (move to get up)', run: () => putOut(world, p) };
  const f = fireNear(world, ped.x, ped.y);
  if (!f) return null;
  if (!isLit(world, f.i)) return { label: 'Light the campfire', run: () => light(world, p, f.i) };
  return { label: 'Sit by the fire', run: () => sitDown(world, p, f.i) };
}

export function light(world, p, i) {
  if (!setLit(world, i, true)) return false;
  world.notify(p, 'You get the fire going. Sit by it a while to warm up.', 'good');
  return true;
}

export function putOut(world, p) {
  const s = p.ped && p.ped.sit;
  if (!s) return false;
  setLit(world, s.i, false);   // (stands everyone up who was sitting at it)
  world.notify(p, 'You kick dirt over the embers. The fire is out.', 'info');
  return true;
}

export function sitDown(world, p, i) {
  const ped = p.ped, f = world.map.props[i];
  if (!ped || ped.dead || ped.vehId || ped.hidden || !f || !isLit(world, i)) return false;
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return false; }
  ped.sit = { i, x: ped.x, y: ped.y, at: world.time, said: false };
  ped.vx = 0; ped.vy = 0;
  ped.a = Math.atan2(f.y - ped.y, f.x - ped.x);   // facing the fire
  ped.appVer = (ped.appVer || 0) + 1;               // (the pose rides in the descriptor: net.js)
  p.meDirty = true;
  return true;
}

export function standUp(world, ped) {
  if (!ped.sit) return;
  ped.sit = null;
  ped.appVer = (ped.appVer || 0) + 1;
  if (ped.player) ped.player.meDirty = true;
}

export function update(world, dt) {
  const now = world.time;
  // a fire someone lit burns down, and the campers light theirs again
  if (world.fires && world.tick % 20 === 7) for (const [i, o] of [...world.fires]) if (now >= o.until) setLit(world, i, !!world.map.props[i].lit);
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.sit;
    if (!s) continue;
    if (ped.dead || ped.vehId || ped.hidden || ped.carrying || now < (ped.downUntil || 0) || (ped.lastHitAt || -99) > s.at
      || Math.hypot(ped.x - s.x, ped.y - s.y) > SIT_MOVE_PX || !isLit(world, s.i)) { standUp(world, ped); continue; }
    if (ped.hp < ped.maxHp && now - (ped.lastHitAt || -99) > FIRE_AFTER_HIT_S) {
      ped.hp = Math.min(ped.maxHp, ped.hp + FIRE_HEAL * dt);
      if (world.tick % 20 === 0) p.meDirty = true;
      if (!s.said && now - s.at > 2) { s.said = true; world.notify(p, 'The warmth of the fire soaks into you.', 'good'); }
    }
  }
}
