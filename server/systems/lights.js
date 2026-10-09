// Lights to carry (task #359; the kinds: shared/lights.js). Your light: the one you chose from the bag (the headlamp,
// the hard hat's lamp, the flashlight, the lantern) - or the heavy flashlight while it's the weapon in your hand -
// switched on and off with the light button (L / D-pad up / the touch button) or from the bag. A light that takes a
// hand goes dark while both of yours are busy (an axe at a tree, a rifle, a crate) and comes back after. Batteries
// run down slowly while it's on; when they're flat a fresh set from the bag goes in, or the light goes out until you
// buy some. Flares are struck and thrown, glow sticks snapped and dropped, a lantern set down: they stay lit where they
// lie (a flare about a minute, a glow stick a few, a lantern on its batteries) and anyone can pick a lantern back up.
// Everyone sees every light: a ped's in its descriptor (net.js fl: the light's code; hh: a hard hat on), the ones on
// the ground through the 'glight' event and the welcome's list.
import { LIGHTS, CARRIED, GLOW_COLS, GLOW_NAMES, twoHanded, LIGHT_BY_CODE } from '../../shared/lights.js';
import { WEAPONS } from '../../shared/items.js';
import { GROUND_LIGHTS_MAX, HARDHAT_GUARD, FLASHLIGHT_PRICE } from '../../shared/rules.js';
import { store } from '../store.js';

const PICK_PX = 34;          // how close you stand to pick a lantern back up
const THROW_PX = 70;         // how far a flare goes when you throw it

// which of your lights is the one the button works (null: none)
export function activeKind(p) {
  const prof = p.profile, ped = p.ped, inv = prof.inventory || {};
  if (ped && ped.weapon === 'heavyflash' && prof.weapons && prof.weapons.heavyflash !== undefined) return 'heavyflash';
  if (prof.lightSel && CARRIED.includes(prof.lightSel) && (inv[prof.lightSel] || 0) > 0) return prof.lightSel;
  for (const id of CARRIED) if ((inv[id] || 0) > 0) return id;
  return null;
}
export const fuelLeft = (prof, id) => { const f = prof.lightFuel && prof.lightFuel[id]; return f === undefined || f === null ? LIGHTS[id].fuel : f; };
function setFuel(prof, id, s) { (prof.lightFuel ||= {})[id] = Math.max(0, Math.round(s * 10) / 10); }
// a fresh set of batteries from the bag, if there's one: true if it went in
function refill(world, p, id) {
  const prof = p.profile;
  if ((prof.inventory.batteries || 0) <= 0) return false;
  prof.inventory.batteries--;
  setFuel(prof, id, LIGHTS[id].fuel);
  world.notify(p, `Fresh batteries in your ${LIGHTS[id].name.toLowerCase()}.`, 'info');
  p.meDirty = true;
  return true;
}
// the share a hard hat takes off a blow from above (a falling tree, a rock): 1 without one
export const headGuard = (ped) => (ped && ped.hardhat ? 1 - HARDHAT_GUARD : 1);

// the light button (and the flashlight's old toggle): on / off, or as asked
export function toggle(world, p, on) {
  const prof = p.profile, ped = p.ped, kind = activeKind(p);
  if (!kind) {
    if (world.time - (p.noLightAt ?? -99) > 6) { p.noLightAt = world.time; world.notify(p, `You don't have a light - a flashlight ($${FLASHLIGHT_PRICE}) at hardware stores, corner stores and gas stations; headlamps, hard hats and lanterns at the hardware store and the outfitters.`, 'warn'); }
    return false;
  }
  const want = on === undefined ? !prof.light : !!on;
  if (want && fuelLeft(prof, kind) <= 0 && !refill(world, p, kind)) {
    if (world.time - (p.noLightAt ?? -99) > 4) { p.noLightAt = world.time; world.notify(p, `Your ${LIGHTS[kind].name.toLowerCase()}'s batteries are flat - batteries at hardware stores and gas stations.`, 'warn'); }
    return false;
  }
  prof.light = want;
  sync(world, p);
  if (ped && !ped.dead) world.emit(ped.x, ped.y, { e: 'lightclick', x: Math.round(ped.x), y: Math.round(ped.y), on: want ? 1 : 0 });
  p.meDirty = true;
  store.touch();
  return true;
}

// keeps the ped's light in step with the switch (every tick, players.update via economy.syncLight): off when you go
// down or lose the light, dark while both hands are busy, out of batteries
export function sync(world, p) {
  const prof = p.profile, ped = p.ped, kind = activeKind(p);
  if (prof.light && !kind) { prof.light = false; p.meDirty = true; }
  let on = !!(prof.light && kind && ped && !ped.dead);
  if (on && LIGHTS[kind].hand && kind !== 'heavyflash' && (twoHanded(ped.weapon, WEAPONS) || ped.chop || ped.carrying)) on = false;
  if (on && fuelLeft(prof, kind) <= 0) on = false;
  const code = on ? LIGHTS[kind].w : 0;
  const hat = !!(ped && !ped.dead && (prof.inventory.hardhat || 0) > 0 && (kind === 'hardhat' || prof.lightSel === 'hardhat'));
  if (ped && ((ped.lightCode || 0) !== code || !!ped.hardhat !== hat)) {
    ped.lightCode = code; ped.flashOn = on; ped.hardhat = hat;
    ped.appVer = (ped.appVer || 0) + 1; p.meDirty = true;
  }
}

// one from the bag: a light you wear or hold - chosen, and switched on (off if it's the one already on); a lantern
// that's lit in your hand - set down; a flare - struck and thrown; a glow stick - snapped and dropped
export function use(world, p, id, aim) {
  const prof = p.profile, ped = p.ped, L = LIGHTS[id];
  if (!L || !ped || ped.dead || (prof.inventory[id] || 0) <= 0) return false;
  if (L.burn) return dropBurning(world, p, id, aim);
  if (id === 'lantern' && prof.light && activeKind(p) === 'lantern' && ped.lightCode === L.w && !ped.vehId) return setDown(world, p);
  if (activeKind(p) === id && prof.light) return toggle(world, p, false);
  prof.lightSel = id;
  return toggle(world, p, true);
}

// ---- lights on the ground --------------------------------------------------------------------------------------------
const wire = (g) => [g.id, LIGHTS[g.k].w, Math.round(g.x), Math.round(g.y), g.c | 0, g.until ? Math.max(0, Math.round(g.until - g.now0)) : -1, g.dark ? 1 : 0];
function announce(world, g) { world.broadcast({ e: 'glight', id: g.id, k: LIGHTS[g.k].w, x: Math.round(g.x), y: Math.round(g.y), c: g.c | 0, s: g.until ? Math.max(0, Math.round(g.until - world.time)) : -1, ...(g.dark ? { dark: 1 } : null) }); }
function add(world, p, kind, x, y, extra) {
  world.glights ||= new Map();
  world.glightN = (world.glightN || 0) + 1;
  const g = { id: world.glightN, k: kind, x, y, owner: p ? p.pid : null, at: world.time, c: 0, ...extra };
  // one player's lights on the ground: the oldest goes out past the cap
  if (p) {
    const mine = [...world.glights.values()].filter((q) => q.owner === p.pid);
    if (mine.length >= GROUND_LIGHTS_MAX) remove(world, mine[0]);
  }
  world.glights.set(g.id, g);
  announce(world, g);
  return g;
}
function remove(world, g) {
  if (!world.glights || !world.glights.delete(g.id)) return;
  world.broadcast({ e: 'glight', id: g.id, off: 1 });
}
function dropBurning(world, p, id, aim) {
  const prof = p.profile, ped = p.ped, L = LIGHTS[id];
  const a = typeof aim === 'number' ? aim : ped.a, d = id === 'flare' ? THROW_PX : 12;
  const x = ped.x + Math.cos(a) * d, y = ped.y + Math.sin(a) * d;
  prof.inventory[id]--;
  let c = 0;
  if (id === 'glowstick') { c = (prof.glowN || 0) % GLOW_COLS.length; prof.glowN = (prof.glowN || 0) + 1; }
  add(world, p, id, x, y, { until: world.time + L.burn, c });
  if (id === 'flare') world.emit(ped.x, ped.y, { e: 'flarestrike', x: Math.round(ped.x), y: Math.round(ped.y) });
  else world.emit(ped.x, ped.y, { e: 'lightclick', x: Math.round(ped.x), y: Math.round(ped.y), on: 1, snap: 1 });
  world.notify(p, id === 'flare' ? 'You strike a flare and toss it: it burns red for about a minute.' : `You snap a ${GLOW_NAMES[c]} glow stick and drop it: it glows for a few minutes.`, 'info');
  ped.attackAnimUntil = world.time + 0.3;
  p.meDirty = true;
  store.touch();
  return true;
}
// a lantern set down where you stand: it stays lit on its batteries
export function setDown(world, p) {
  const prof = p.profile, ped = p.ped;
  if (!ped || (prof.inventory.lantern || 0) <= 0) return false;
  const fuel = fuelLeft(prof, 'lantern');
  prof.inventory.lantern--;
  add(world, p, 'lantern', ped.x + Math.cos(ped.a) * 14, ped.y + Math.sin(ped.a) * 14, { fuel, dark: fuel <= 0 });
  if (prof.lightFuel) delete prof.lightFuel.lantern;
  if (prof.lightSel === 'lantern') prof.lightSel = null;
  sync(world, p);
  world.notify(p, 'You set the lantern down. It stays lit - come back for it (the action button picks it up).', 'info');
  p.meDirty = true;
  store.touch();
  return true;
}
export function lanternNear(world, ped) {
  if (!world.glights) return null;
  let best = null, bd = PICK_PX;
  for (const g of world.glights.values()) {
    if (g.k !== 'lantern') continue;
    const d = Math.hypot(g.x - ped.x, g.y - ped.y);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}
export function pickUp(world, p, g) {
  const prof = p.profile;
  if (!g || !world.glights || !world.glights.has(g.id)) return false;
  if ((prof.inventory.lantern || 0) > 0) { world.notify(p, 'You already carry a lantern.', 'info'); return false; }
  prof.inventory.lantern = 1;
  setFuel(prof, 'lantern', g.fuel ?? LIGHTS.lantern.fuel);
  remove(world, g);
  world.emit(g.x, g.y, { e: 'lightclick', x: Math.round(g.x), y: Math.round(g.y), on: 0 });
  p.meDirty = true;
  store.touch();
  return true;
}
// the prompt over a lantern on the ground (players.findInteraction)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.carrying) return null;
  const g = lanternNear(world, ped);
  return g ? { label: g.dark ? 'Pick up the lantern (its batteries are flat)' : 'Pick up the lantern', run: () => pickUp(world, p, g) } : null;
}
// for a player joining: every light on the ground as [id, code, x, y, colour, seconds left (-1: on batteries), dark]
export function groundList(world) {
  const out = [];
  for (const g of (world.glights || new Map()).values()) out.push(wire({ ...g, now0: world.time }));
  return out;
}

// ---- every tick ----------------------------------------------------------------------------------------------------
export function update(world, dt) {
  if (world.tick % 20 !== 11) return;
  const step = dt * 20;
  for (const p of world.players.values()) {
    const ped = p.ped;
    if (!ped || ped.dead || !ped.lightCode) continue;
    const L = LIGHT_BY_CODE[ped.lightCode], kind = L && L.id;
    if (!kind || !L.fuel) continue;
    const left = fuelLeft(p.profile, kind) - step;
    setFuel(p.profile, kind, left);
    if (left <= 0 && !refill(world, p, kind)) {
      world.notify(p, `Your ${L.name.toLowerCase()} flickers and dies: the batteries are flat. Batteries at hardware stores and gas stations.`, 'warn');
      sync(world, p);
    }
  }
  if (!world.glights || !world.glights.size) return;
  for (const g of [...world.glights.values()]) {
    if (g.until && world.time >= g.until) { remove(world, g); continue; }
    if (g.k === 'lantern' && !g.dark) {
      g.fuel = Math.max(0, (g.fuel ?? LIGHTS.lantern.fuel) - step);
      if (g.fuel <= 0) { g.dark = true; announce(world, g); }
    }
  }
}
