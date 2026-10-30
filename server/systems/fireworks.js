// Fireworks (the owner's notes part 2: "Fireworks you can set off"). A Skyrocket, a Fountain or a twelve-shot Cake
// from a corner store or a gas station: Use it from the bag (or the quick wheel) and it's set down at your feet, the
// fuse lit - FIREWORKS.fuseS later it goes: the rocket up over the rooftops and bursting, the fountain's cone of
// sparks, the cake's barrage. What each does is worked out from its seed the same by everyone who sees it
// (shared/leisure.js fwShow; drawn and lit by client/leisure/stage.js - the stars thrown as light on the city around
// them), so the wire carries only the kind, the place, the fuse and the seed ('fw', broadcast: seen from afar).
// The rules: they hurt nobody and break nothing; FIREWORKS.maxOut of yours burning at once, gapS between two; not
// indoors, underground, in the water or in a vehicle. In town after dark it's a small crime ('fireworks' - law.js: if
// someone sees, a little heat and an officer may come for a word); out in the country or by day, nobody minds.
import { FIREWORKS } from '../../shared/rules-leisure.js';
import { fwShow } from '../../shared/leisure.js';
import { ITEMS } from '../../shared/items.js';
import { isSwimming, PED_BLOCK } from '../../shared/mapcore.js';
import { underCover } from '../../shared/tunnels.js';
import { mulberry32 } from '../../shared/rng.js';
import { TILE } from '../../shared/constants.js';
import { wildStyle } from './wildlife.js';
import * as law from './law.js';
import { store } from '../store.js';

let rng = mulberry32(4747);
export function setRng(r) { rng = r; }   // (tests)
const live = (world) => (world.fireworks ||= new Map());

// why p can't light one here (or null)
function noRoom(world, p) {
  const ped = p.ped, map = world.map;
  if (ped.vehId) return 'Not from a vehicle - set it down on the ground.';
  const tx = Math.floor(ped.x / TILE), ty = Math.floor(ped.y / TILE);
  if (ped.interior || ped.ug || ped.sub || ped.hidden || underCover(map, ped.x, ped.y) || (map.inside(tx, ty) && map.bld[map.idx(tx, ty)] >= 0)) return 'Not in here - fireworks go off outside, under the open sky.';
  if (isSwimming(map, ped)) return 'Not in the water.';
  const mine = [...live(world).values()].filter((f) => f.owner === p.pid).length;
  if (mine >= FIREWORKS.maxOut) return 'Let the ones you lit finish first.';
  if (world.time - (p.fwAt ?? -99) < FIREWORKS.gapS) return 'One at a time.';
  return null;
}

// the bag's Use (economy.js useItem): set it down in front of you and light the fuse
export function use(world, p, id) {
  const it = ITEMS[id], ped = p.ped, inv = p.profile.inventory;
  if (!it || it.fun !== 'fw' || !ped || ped.dead || (inv[id] || 0) <= 0) return false;
  const why = noRoom(world, p);
  if (why) { world.notify(p, why, 'warn'); return false; }
  let x = ped.x + Math.cos(ped.a) * 16, y = ped.y + Math.sin(ped.a) * 16;
  if (PED_BLOCK[world.map.tileAtPx(x, y)]) { x = ped.x; y = ped.y + 4; }
  inv[id]--;
  world.fwN = (world.fwN || 0) + 1;
  const seed = Math.floor(rng() * 0x7fffffff), show = fwShow(it.fw, seed);
  const f = { id: world.fwN, k: it.fw, x, y, owner: p.pid, at: world.time, go: world.time + FIREWORKS.fuseS, seed, until: world.time + FIREWORKS.fuseS + show.secs };
  live(world).set(f.id, f);
  p.fwAt = world.time;
  world.broadcast({ e: 'fw', id: f.id, k: f.k, x: Math.round(x), y: Math.round(y), f: FIREWORKS.fuseS, s: seed });
  world.notify(p, `You light the ${it.name.toLowerCase()}'s fuse - stand back!`, 'info');
  // in town after dark: someone may call it in (a small crime: law.js)
  if (world.clock && world.clock.isNight && !wildStyle(world.map, x, y)) law.crime(world, ped, 'fireworks', null, x, y);
  p.meDirty = true;
  store.touch();
  return true;
}

// the ones burning now (a player coming in sees the rest of a show: the fuse left, < 0 if it's gone already)
export function list(world) {
  return [...live(world).values()].map((f) => ({ e: 'fw', id: f.id, k: f.k, x: Math.round(f.x), y: Math.round(f.y), f: +(f.go - world.time).toFixed(2), s: f.seed }));
}

export function update(world) {
  const L = world.fireworks;
  for (const p of world.players.values()) if (p.conn && p.fwConn !== p.conn) { p.fwConn = p.conn; if (L && L.size) (p.evq ||= []).push(...list(world)); }   // (a player coming in: the shows going on)
  if (!L || !L.size || world.tick % 10) return;
  for (const [id, f] of L) if (world.time >= f.until) L.delete(id);
}
