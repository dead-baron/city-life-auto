// Campfires (design notes: "at campsites, out in the boonies and on beaches, with seats; light them or put them out.
// Sitting by one slowly heals you"). Every campfire on the map (the campgrounds, the camps, the beach fires, the
// hunting camps: the map's campfire props, lit or not as they were laid out) can be lit with the action button.
// Sit by a lit one and you warm up: health creeps back (rules.js FIRE_HEAL) while you sit there, out of the fight.
// Getting up (any step), a hit or a car door ends it; sitting there, the action button puts the fire out. A fire
// someone lit burns down after a while, and the campers light theirs again (a change goes back the way the map
// laid it out after FIRE_BURN_S). Everyone sees every fire the same (the 'fire' event; the welcome's list).
// A campfire of your own (the owner's notes part 2: "Build a campfire, lets you create a campfire anywhere which stacks
// some logs and a few log seats. Just as long as it cant be used to exploit anything, like block an entrance or
// something. We can just make it so it can be passed through. And it despawns if the player walks away after a certain
// amount of time"): a Campfire Kit from the bag builds one ahead of you on open ground (world.builtFires: its index
// here is the negative of its id, so it lights, warms, cooks and burns like the map's - fireNear, isLit, sitDown,
// burning.js). Nothing about it is solid; its log seats are where you sit; one a player (a new one puts the old one
// out); its builder CAMPKIT.awayPx away for awayS s - or gone - and it burns out; lifeS at most ('camp' events).
import { FIRE_REACH, FIRE_HEAL, FIRE_AFTER_HIT_S, FIRE_BURN_S } from '../../shared/rules.js';
import { CAMPKIT } from '../../shared/rules-leisure.js';
import { campSeats } from '../../shared/leisure.js';
import { T, TILE } from '../../shared/constants.js';
import { PED_BLOCK, WATER_T } from '../../shared/mapcore.js';
import { underCover } from '../../shared/tunnels.js';
import { store } from '../store.js';
import * as skills from './skills.js';

const SIT_MOVE_PX = 6;   // a step this far gets you up

// every campfire prop's index (made once)
export function fireIdx(map) {
  if (map._campfires) return map._campfires;
  const out = [];
  map.props.forEach((p, i) => { if (p && p.t === 'campfire') out.push(i); });
  Object.defineProperty(map, '_campfires', { value: out, enumerable: false, configurable: true });
  return out;
}
export const isLit = (world, i) => { if (i < 0) { const b = builtOf(world, i); return !!(b && b.lit); } const o = world.fires && world.fires.get(i); return o ? o.lit : !!(world.map.props[i] && world.map.props[i].lit); };
// a fire by its index: the map's prop, or a built one (negative)
export const builtOf = (world, i) => (world.builtFires && world.builtFires.get(-i)) || null;
export const fireAt = (world, i) => (i < 0 ? builtOf(world, i) : world.map.props[i]);

// the nearest campfire within r px (lit only, when asked): { i, p, d } or null
export function fireNear(world, x, y, r = FIRE_REACH, litOnly = false) {
  let best = null;
  for (const i of fireIdx(world.map)) {
    const p = world.map.props[i];
    if (!p || p.broken || Math.abs(p.x - x) > r || Math.abs(p.y - y) > r) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < r && (!best || d < best.d) && (!litOnly || isLit(world, i))) best = { i, p, d };
  }
  for (const b of (world.builtFires || new Map()).values()) {
    const d = Math.hypot(b.x - x, b.y - y);
    if (d < r && (!best || d < best.d) && (!litOnly || b.lit)) best = { i: -b.id, p: b, d };
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
  if (i < 0) { const b = builtOf(world, i); if (!b || b.lit === !!lit) return false; if (lit) { b.lit = true; send(world, b); } else putOutBuilt(world, b, true); return true; }
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
  const f = fireNear(world, ped.x, ped.y, f0(world, ped));
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
  const ped = p.ped, f = fireAt(world, i);
  if (!ped || ped.dead || ped.vehId || ped.hidden || !f || !isLit(world, i)) return false;
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return false; }
  if (i < 0) {   // (a fire of your own: on the nearest free log seat)
    const taken = (q) => [...world.players.values()].some((o) => o.ped && o.ped !== ped && o.ped.sit && Math.hypot(o.ped.x - q.x, o.ped.y - q.y) < 8);
    const st = seatsOf(f).filter((q) => !taken(q)).sort((a, b) => Math.hypot(a.x - ped.x, a.y - ped.y) - Math.hypot(b.x - ped.x, b.y - ped.y))[0];
    if (st) { ped.x = st.x; ped.y = st.y; if (world.place) world.place(ped); }
  }
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
  builtUpdate(world, now);
  // a fire someone lit burns down, and the campers light theirs again
  if (world.fires && world.tick % 20 === 7) for (const [i, o] of [...world.fires]) if (now >= o.until) setLit(world, i, !!world.map.props[i].lit);
  for (const p of world.players.values()) {
    const ped = p.ped, s = ped && ped.sit;
    if (!s) continue;
    if (ped.dead || ped.vehId || ped.hidden || ped.carrying || now < (ped.downUntil || 0) || (ped.lastHitAt || -99) > s.at
      || Math.hypot(ped.x - s.x, ped.y - s.y) > SIT_MOVE_PX || !isLit(world, s.i)) { standUp(world, ped); continue; }
    if (now - (ped.lastHitAt || -99) > FIRE_AFTER_HIT_S) skills.gain(world, p, 'campfire', dt);   // (sat by the fire, out of the fight: constitution - skills.js)
    if (ped.hp < ped.maxHp && now - (ped.lastHitAt || -99) > FIRE_AFTER_HIT_S) {
      ped.hp = Math.min(ped.maxHp, ped.hp + FIRE_HEAL * dt);
      if (world.tick % 20 === 0) p.meDirty = true;
      if (!s.said && now - s.at > 2) { s.said = true; world.notify(p, 'The warmth of the fire soaks into you.', 'good'); }
    }
  }
}

// ---- a campfire of your own ------------------------------------------------------------------------------------------
// the reach to light / sit by one: a built fire's ring of seats is wider than the map's fires
const f0 = (world, ped) => { for (const b of (world.builtFires || new Map()).values()) if (Math.hypot(b.x - ped.x, b.y - ped.y) < CAMPKIT.seatR + 16) return CAMPKIT.seatR + 16; return FIRE_REACH; };
export const seatsOf = (b) => campSeats(b.x, b.y, b.a);
const wire = (b) => ({ e: 'camp', id: b.id, x: Math.round(b.x), y: Math.round(b.y), a: +b.a.toFixed(2), on: b.lit ? 1 : 0 });
function send(world, b) { world.broadcast(wire(b)); }
export const builtList = (world) => [...(world.builtFires || new Map()).values()].map(wire);
// open ground to build on, outside: not a wall, the water, a road or a bridge, nor under a roof or a hill
function groundOk(world, x, y) {
  const map = world.map;
  for (const [dx, dy] of [[0, 0], [-14, 0], [14, 0], [0, -10], [0, 10]]) {
    const t = map.tileAtPx(x + dx, y + dy);
    if (PED_BLOCK[t] || WATER_T[t] || t === T.ROAD || t === T.BRIDGE || t === T.DEEP) return false;
  }
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return !underCover(map, x, y) && !(map.inside(tx, ty) && map.bld[map.idx(tx, ty)] >= 0);   // (not inside a building: a walk-in's floor)
}
// the bag's Use (economy.js useItem): build it ahead of you
export function build(world, p) {
  const ped = p.ped, inv = p.profile.inventory;
  if (!ped || ped.dead || (inv.campkit || 0) <= 0) return false;
  if (ped.vehId || ped.interior || ped.ug || ped.sub || ped.hidden) { world.notify(p, 'Build it outside, on the ground.', 'warn'); return false; }
  const x = ped.x + Math.cos(ped.a) * CAMPKIT.ahead, y = ped.y + Math.sin(ped.a) * CAMPKIT.ahead;
  if (!groundOk(world, x, y)) { world.notify(p, 'Not here - find a patch of open ground (not the road, the water or indoors).', 'warn'); return false; }
  const B = (world.builtFires ||= new Map());
  for (const b of [...B.values()]) if (b.owner === p.pid) putOutBuilt(world, b, true);
  inv.campkit--;
  world.campN = (world.campN || 0) + 1;
  const b = { id: world.campN, x, y, a: Math.atan2(y - ped.y, x - ped.x), owner: p.pid, at: world.time, lit: true, away: 0 };
  B.set(b.id, b);
  send(world, b);
  world.notify(p, 'You stack the logs, set the seats round and get it going. Sit by it a while to warm up.', 'good');
  p.meDirty = true;
  store.touch();
  return true;
}
export function putOutBuilt(world, b, quiet = false) {
  if (!world.builtFires || !world.builtFires.delete(b.id)) return;
  world.broadcast({ e: 'camp', id: b.id, x: Math.round(b.x), y: Math.round(b.y), off: 1 });
  for (const q of world.players.values()) if (q.ped && q.ped.sit && q.ped.sit.i === -b.id) standUp(world, q.ped);
  if (!quiet) { const o = world.players.get(b.owner); if (o && o.conn) world.notify(o, 'Your campfire has burned out.', 'info'); }
}
function builtUpdate(world, now) {
  for (const p of world.players.values()) if (p.conn && p.campConn !== p.conn) { p.campConn = p.conn; if (world.builtFires && world.builtFires.size) (p.evq ||= []).push(...builtList(world)); }
  const B = world.builtFires;
  if (!B || !B.size || world.tick % 10) return;
  for (const b of [...B.values()]) {
    const o = world.players.get(b.owner), ped = o && o.conn && o.ped;
    if (now - b.at > CAMPKIT.lifeS) { putOutBuilt(world, b); continue; }
    if (ped && !ped.dead && Math.hypot(ped.x - b.x, ped.y - b.y) < CAMPKIT.awayPx) { b.away = 0; continue; }
    if (!b.away) b.away = now;
    else if (now - b.away > CAMPKIT.awayS) putOutBuilt(world, b);
  }
}
