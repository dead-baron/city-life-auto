// Open-cargo system (GDD §8): physical crates that can be carried, thrown, loaded into
// visible vehicle slots, knocked off in crashes — plus loot bags from the drop rule (§9).
import { K, T } from '../../shared/constants.js';
import { WEAPONS, ITEMS, SHOPS, PACK_TIERS, PACK_WIRE, packTier } from '../../shared/items.js';
import { PACK_LIFE_S, PACK_BLINK_S } from '../../shared/rules.js';
import { localToWorld, circleVsObb } from '../../shared/math.js';
import { collideCircle } from '../../shared/physics.js';
import { PED_BLOCK } from '../../shared/map.js';
import * as law from './law.js';
import * as hotmoney from './hotmoney.js';

const GRAV = 620;

export function slotWorld(v, i) {
  const [lx, ly] = v.def.slots[i];
  return localToWorld(v.x, v.y, v.a, lx, ly);
}

export function update(world, dt) {
  const now = world.time;
  for (const e of world.entities.values()) {
    if (e.kind === K.CRATE) {
      if (e.state === 'carried') {
        const ped = world.get(e.parent);
        if (!ped || ped.dead || ped.carrying !== e.id) { e.state = 'ground'; e.parent = 0; continue; }
        e.x = ped.x + Math.cos(ped.a) * 14; e.y = ped.y + Math.sin(ped.a) * 14; e.a = ped.a; e.z = 10;
      } else if (e.state === 'loaded') {
        const v = world.get(e.parent);
        if (!v || v.cargo[e.slot] !== e.id) { e.state = 'ground'; e.parent = 0; continue; }
        const [x, y] = slotWorld(v, e.slot);
        e.x = x; e.y = y; e.a = v.a;
      } else {
        stepGroundCrate(world, e, dt);
        if (e.expires && now > e.expires) world.remove(e);
      }
    } else if (e.kind === K.BAG) {
      if (now > e.expires) { world.remove(e); continue; }
      if (e.cashOnly) {
        for (const p of world.query(e.x, e.y, 26, K.PED)) {
          if (!p.player || p.dead || p.vehId) continue;
          lootBag(world, p.player, e);
          break;
        }
      }
    }
  }
}

function stepGroundCrate(world, c, dt) {
  const airborne = c.z > 0 || c.vz !== 0;
  if (airborne) {
    c.vz -= GRAV * dt;
    c.z += c.vz * dt;
    if (c.z <= 0) {
      c.z = 0;
      if (c.vz < -120) { c.vz = -c.vz * 0.25; world.emit(c.x, c.y, { e: 'thud', x: c.x, y: c.y }); } else c.vz = 0;
      // landing in an open cargo slot (toss a case down into a truck bed)
      const slot = slotNear(world, c.x, c.y, 30);
      if (slot) { attach(world, c, slot.v, slot.i); return; }
    }
  }
  if (Math.abs(c.vx) + Math.abs(c.vy) > 1) {
    c.x += c.vx * dt; c.y += c.vy * dt;
    const f = c.z > 0 ? 0.995 : Math.exp(-6 * dt);
    c.vx *= f; c.vy *= f;
    collideCircle(c, 11, world.map, PED_BLOCK);
  } else { c.vx = 0; c.vy = 0; }
  // fell into the water
  const t = world.map.tileAtPx(c.x, c.y);
  if ((t === T.WATER || t === T.DEEP) && c.z <= 0) {
    world.emit(c.x, c.y, { e: 'splash', x: c.x, y: c.y });
    world.remove(c);
    return;
  }
  // vehicles shove crates around
  for (const v of world.query(c.x, c.y, 100, K.VEH)) {
    const h = circleVsObb(c.x, c.y, 11, v.x, v.y, v.a, v.def.L / 2, v.def.W / 2);
    if (!h) continue;
    c.x += h.nx * h.depth; c.y += h.ny * h.depth;
    const sp = Math.hypot(v.vx, v.vy);
    if (sp > 40) { c.vx = v.vx * 0.8 + h.nx * 60; c.vy = v.vy * 0.8 + h.ny * 60; c.vz = Math.min(220, sp * 0.3); }
  }
}

function slotNear(world, x, y, r) {
  for (const v of world.query(x, y, 120, K.VEH)) {
    if (v.wreckAt) continue;
    for (let i = 0; i < v.def.slots.length; i++) {
      if (v.cargo[i]) continue;
      const [sx, sy] = slotWorld(v, i);
      if ((sx - x) ** 2 + (sy - y) ** 2 < r * r) return { v, i };
    }
  }
  return null;
}

function attach(world, c, v, i) {
  c.touched = true;
  c.state = 'loaded'; c.parent = v.id; c.slot = i; c.z = 0; c.vx = 0; c.vy = 0; c.vz = 0;
  v.cargo[i] = c.id;
  c.expires = 0;
  world.emit(c.x, c.y, { e: 'thud', x: c.x, y: c.y });
}

export function findFreeSlot(world, ped) {
  for (const v of world.query(ped.x, ped.y, 130, K.VEH)) {
    if (v.wreckAt || Math.hypot(v.vx, v.vy) > 60) continue;
    for (let i = 0; i < v.def.slots.length; i++) {
      if (v.cargo[i]) continue;
      const [sx, sy] = slotWorld(v, i);
      if ((sx - ped.x) ** 2 + (sy - ped.y) ** 2 < 56 * 56) return { v, i };
    }
  }
  return null;
}

export function loadCrate(world, ped, v, i) {
  const c = world.get(ped.carrying);
  if (!c || v.cargo[i]) return;
  ped.carrying = 0;
  attach(world, c, v, i);
  if (ped.player) ped.player.meDirty = true;
}

export function nearestCrate(world, ped) {
  let best = null, bd = 44 * 44;
  for (const c of world.query(ped.x, ped.y, 160, K.CRATE)) {
    if (c.state === 'carried') continue;
    if (c.state === 'loaded') {
      const v = world.get(c.parent);
      if (!v || Math.hypot(v.vx, v.vy) > 60) continue;
    }
    const d = (c.x - ped.x) ** 2 + (c.y - ped.y) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function pickUp(world, ped, c) {
  if (ped.carrying || c.state === 'carried') return;
  if (c.state === 'loaded') {
    const v = world.get(c.parent);
    if (v) v.cargo[c.slot] = 0;
  }
  const p = ped.player;
  if (p && c.owner && c.owner !== p.pid) {
    const ownerP = world.players.get(c.owner);
    law.crime(world, ped, 'cargoTheft', ownerP ? ownerP.ped : null, c.x, c.y);
    if (ownerP) world.notify(ownerP, `Someone is stealing your ${['', 'wood box', 'steel barrel', 'iron vault', 'carbon-gold case'][c.tier]}!`, 'bad');
  }
  c.touched = true;
  c.state = 'carried'; c.parent = ped.id; c.z = 10; c.vx = 0; c.vy = 0; c.vz = 0; c.expires = 0;
  ped.carrying = c.id;
  if (p && c.contraband) c.holder = p.pid;
  if (p) p.meDirty = true;
  if (ped.fishing && p) ped.fishing = null;
}

export function dropCrate(world, ped) {
  const c = world.get(ped.carrying);
  ped.carrying = 0;
  if (ped.player) ped.player.meDirty = true;
  if (!c) return;
  c.state = 'ground'; c.parent = 0; c.z = 6; c.vz = 0;
  c.x = ped.x + Math.cos(ped.a) * 18; c.y = ped.y + Math.sin(ped.a) * 18;
  c.vx = ped.vx * 0.5; c.vy = ped.vy * 0.5;
  if (c.job || c.contraband) c.expires = world.time + 600;
}

export function throwCrate(world, ped, aim) {
  const c = world.get(ped.carrying);
  if (!c) { ped.carrying = 0; return; }
  ped.carrying = 0;
  c.state = 'ground'; c.parent = 0;
  c.x = ped.x + Math.cos(aim) * 16; c.y = ped.y + Math.sin(aim) * 16;
  c.z = 14; c.vz = 190;
  c.vx = Math.cos(aim) * 250 + ped.vx * 0.5; c.vy = Math.sin(aim) * 250 + ped.vy * 0.5;
  ped.a = aim;
  ped.attackAnimUntil = world.time + 0.3;
  if (c.job || c.contraband) c.expires = world.time + 600;
  if (ped.player) ped.player.meDirty = true;
}

export function knockOff(world, v, impact) {
  const chance = Math.min(0.9, (impact - 300) / 400);
  for (let i = 0; i < v.cargo.length; i++) {
    if (!v.cargo[i] || world.rand() > chance) continue;
    fallOff(world, v, i);
  }
}
export function spillCargo(world, v) {
  for (let i = 0; i < v.cargo.length; i++) if (v.cargo[i]) fallOff(world, v, i);
}
function fallOff(world, v, i) {
  const c = world.get(v.cargo[i]);
  v.cargo[i] = 0;
  if (!c) return;
  c.state = 'ground'; c.parent = 0;
  const ang = world.rand() * Math.PI * 2;
  c.vx = v.vx * 0.6 + Math.cos(ang) * 90; c.vy = v.vy * 0.6 + Math.sin(ang) * 90;
  c.z = 12; c.vz = 200;
  if (c.job || c.contraband) c.expires = world.time + 600;
  world.emit(c.x, c.y, { e: 'thud', x: c.x, y: c.y });
}

// ---- Loot bags -------------------------------------------------------------
export function nearestBag(world, ped, skipCash = false) {
  let best = null, bd = 40 * 40;
  for (const b of world.query(ped.x, ped.y, 60, K.BAG)) {
    if (skipCash && b.cashOnly) continue;
    const d = (b.x - ped.x) ** 2 + (b.y - ped.y) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

export function lootBag(world, p, bag) {
  if (bag.hot) { hotmoney.pickUp(world, p, bag); return; }   // a robbery bag: still hot money
  const prof = p.profile;
  prof.cash += bag.cash;
  for (const [k, n] of Object.entries(bag.items)) prof.inventory[k] = (prof.inventory[k] || 0) + n;
  for (const [k, n] of Object.entries(bag.weapons)) {
    const had = prof.weapons[k] !== undefined;
    prof.weapons[k] = (prof.weapons[k] || 0) + n;
    if (!had && WEAPONS[k].mag) p.ped.mag[k] = Math.min(WEAPONS[k].mag, prof.weapons[k]);
  }
  world.remove(bag);
  world.emit(bag.x, bag.y, { e: 'loot', x: bag.x, y: bag.y, n: bag.cash });
  const mine = bag.ownerPid && bag.ownerPid === p.pid;
  if (bag.pack) {
    const T = PACK_TIERS[bag.tier], n = Object.keys(bag.items).length + Object.keys(bag.weapons).length;
    world.notify(p, mine ? `You got your ${T.name} back: everything you were carrying.`
      : `Looted ${bag.ownerName ? bag.ownerName + "'s " : 'a '}${T.rarity.toLowerCase()} ${T.name} - ${n} thing${n === 1 ? '' : 's'} worth about $${Math.round(bag.value).toLocaleString('en-US')}.`, 'good');
  } else if (bag.cashOnly) { if (bag.ownerPid) world.notify(p, mine ? `You picked your $${bag.cash.toLocaleString('en-US')} back up.` : `Scooped up $${bag.cash.toLocaleString('en-US')}${bag.ownerName ? ' ' + bag.ownerName + ' dropped' : ''}.`, 'good'); }
  else world.notify(p, `Looted $${bag.cash}${bag.ownerName ? ' from ' + bag.ownerName : ''}.`, 'good');
  if (bag.ownerPid) { const o = world.players.get(bag.ownerPid); if (o && o.lostPack && o.lostPack.id === bag.id) { o.lostPack = null; o.meDirty = true; } }
  p.meDirty = true;
}

// What the interact prompt says over a bag (players.findInteraction)
export function bagLabel(bag, p) {
  if (bag.hot) return hotmoney.bagLabel(bag, p);
  if (bag.pack) {
    const T = PACK_TIERS[bag.tier];
    if (bag.ownerPid && p && bag.ownerPid === p.pid) return `Pick up your ${T.name}`;
    return `Open ${bag.ownerName ? bag.ownerName.replace(/ \(disconnected\)$/, '') + "'s " : 'the '}${T.name} (${T.rarity}, ~$${Math.round(bag.value).toLocaleString('en-US')})`;
  }
  return `Grab loot ($${bag.cash}${Object.keys(bag.items).length || Object.keys(bag.weapons).length ? ' + items' : ''})`;
}

// The wire tier (net.js): 0 a pile of notes, 1-4 the old bags (an NPC's drop), 5-9 a dropped backpack by rarity
export const bagWireTier = (bag) => (bag.cashOnly ? 0 : bag.pack ? PACK_WIRE + bag.tier : bag.tier);
export const bagBlinks = (world, bag) => !!(bag.pack || bag.ownerPid) && bag.expires - world.time < PACK_BLINK_S;

// Your dropped backpack on your radar and map until someone takes it or it's gone (players.buildMe)
export function packRadar(world, p, out) {
  const L = p.lostPack;
  if (!L) return;
  const bag = world.get(L.id);
  if (!bag || bag.kind !== K.BAG) { p.lostPack = null; return; }
  out.push({ k: 'pack', x: Math.round(bag.x), y: Math.round(bag.y), t: bag.tier, s: Math.max(0, Math.round(bag.expires - world.time)) });
}

function weaponValue(id) {
  for (const s of Object.values(SHOPS)) for (const o of s.buy || []) if (o.kind === 'weapon' && o.id === id && o.price) return o.price * 0.4;
  return 50;
}

// GDD §9 drop rule, reworked (2026-10-08): everything you carried goes into one backpack whose look goes by what the gear
// in it is worth (shared/items.js PACK_TIERS, Common to Legendary). The cash falls out on its own beside it as a pile
// of notes anyone can scoop up by walking over it. Both stay PACK_LIFE_S, blinking at the end, then they're gone; the
// owner sees their pack on the radar until then.
export function dropEverything(world, ped, ownerName) {
  if (ped.carrying) dropCrate(world, ped);
  const p = ped.player;
  if (!p) return null;
  hotmoney.drop(world, ped, ownerName);   // the robbery bag, still hot (hotmoney.js)
  const prof = p.profile;
  const items = {}, weapons = {};
  let itemValue = 0, n = 0;
  for (const [k, c] of Object.entries(prof.inventory)) if (c > 0) { items[k] = c; itemValue += (ITEMS[k]?.sell || 5) * c; n++; }
  for (const [k, c] of Object.entries(prof.weapons)) if (k !== 'fists') { weapons[k] = c; itemValue += weaponValue(k); n++; }
  const cash = prof.cash;
  prof.cash = 0; prof.inventory = {}; prof.weapons = { fists: 0 };
  ped.weapon = 'fists'; ped.mag = {};
  p.meDirty = true;
  const until = world.time + PACK_LIFE_S;
  let pack = null;
  if (n > 0) {
    pack = world.spawnBag(ped.x, ped.y, { cash: 0, items, weapons, itemValue }, ownerName);
    pack.pack = true; pack.tier = packTier(itemValue); pack.value = itemValue; pack.expires = until; pack.ownerPid = p.pid;
    p.lostPack = { id: pack.id };
  } else p.lostPack = null;
  if (cash > 0) {
    // the notes land a step away, on the side away from where they were facing
    const a = ped.a + Math.PI + ((ped.id * 0.618) % 1 - 0.5);
    const pile = world.spawnBag(ped.x + Math.cos(a) * 24, ped.y + Math.sin(a) * 24, { cash, items: {}, weapons: {}, itemValue: 0 }, ownerName);
    pile.cashOnly = true; pile.expires = until; pile.ownerPid = p.pid;
  }
  if (pack) {
    const T = PACK_TIERS[pack.tier];
    world.notify(p, `You dropped your ${T.name} (${T.rarity}, ~$${Math.round(itemValue).toLocaleString('en-US')} of gear)${cash > 0 ? ` and $${cash.toLocaleString('en-US')} in cash` : ''} where you fell. Get back to it within ${Math.round(PACK_LIFE_S / 60)} minutes - anyone can take it.`, 'warn');
  } else if (cash > 0) world.notify(p, `You dropped $${cash.toLocaleString('en-US')} where you fell.`, 'warn');
  return pack;
}

export function npcDrop(world, ped, cash, item) {
  if (cash <= 0 && !item) return null;
  const items = item ? { [item]: 1 } : {};
  const bag = world.spawnBag(ped.x + 6, ped.y + 4, { cash, items, weapons: {}, itemValue: item ? (ITEMS[item]?.sell || 10) : 0 }, '');
  // just cash: a little pile of bills you scoop up by walking over it (no bag, no button)
  if (!item) bag.cashOnly = true;
  return bag;
}
