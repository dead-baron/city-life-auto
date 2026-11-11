// How the event calendar's events (server/systems/calevents.js) reach into the systems they build on - with no imports,
// so law.js, custody.js, police.js, npc.js, players.js and carsoccer.js can read it without pulling the calendar in (it
// imports half the systems). With no event on, every read is an empty list's length.
//   world.evMods: [{ id, at(x, y) -> bool, heat, fee, copPay, copXp, units, unitsMax }] - an event's multipliers where
//     it's on (a crackdown's district, a gang war's block): mult(world, x, y, k) is their product there (1: none)
//   interactions: [(world, p) -> { label, run } | null] - the action button's offers (players.js asks them in turn)
//   on(name, fn) / first(name, ...args): named calls (carsoccer.js: 'soccerResult' at full time, 'soccerTag' at the gate)
export function addMod(world, m) { removeMod(world, m.id); (world.evMods ||= []).push(m); }
export function removeMod(world, id) { if (world.evMods) world.evMods = world.evMods.filter((m) => m.id !== id); }
export function mult(world, x, y, k) {
  const L = world.evMods;
  if (!L || !L.length || !Number.isFinite(x)) return 1;
  let f = 1;
  for (const m of L) if (m[k] && m.at(x, y)) f *= m[k];
  return f;
}
// the units sent after a wanted player at (x, y): times the mods' `units`, at most their unitsMax more
export function units(world, x, y, want) {
  const L = world.evMods;
  if (!L || !L.length) return want;
  let n = want;
  for (const m of L) if (m.units && m.at(x, y)) n = Math.min(Math.round(n * m.units), n + (m.unitsMax ?? n));
  return n;
}
export const interactions = [];
const named = new Map();
export function on(name, fn) { named.set(name, fn); }
export function first(name, ...args) { const fn = named.get(name); return fn ? fn(...args) : undefined; }
