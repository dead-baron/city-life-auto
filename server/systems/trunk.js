// A vehicle's trunk (the owner, 11-23: "should vehicles have a different system for inventory?" - Claude's suggestion,
// taken: its own small storage, not a door to the stash, so a car is never a way to bank what you carry mid-run;
// docs/DECISIONS.md). The numbers: shared/rules.js TRUNK.
//   - kept on your vehicle's entry (profile.vehicles[i].trunk { items, weapons }): it stays in a parked vehicle, through a
//     logoff and a restart, and waits with an impounded one (the entry is kept)
//   - opened on foot at its back (TRUNK.reach of the back of a vehicle of yours that stands still): "Open the trunk" - the
//     Inventory shows CARRIED | TRUNK (stash.js: the door { k: 'trunk', veh, vid }), TRUNK.slots by its kind, a slot a
//     stack of a thing or a weapon
//   - wrecked (insurance.js wrecked: burnt out, blown up, sunk): what was in it spills where it is, a bag anyone can take
//   - cargo crates never go in: they ride in the open (cargo.js), for everyone to see
import { K } from '../../shared/constants.js';
import { TRUNK, DROP_LIFE_S } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { store } from '../store.js';
import * as stash from './stash.js';

const KIND = (d) => (!d ? null : d.boat || d.kind === 'boat' ? 'boat' : d.kind === 'bike' ? 'bike' : d.truck || d.kind === 'truck' || (d.L || 0) >= 130 ? 'truck' : d.kind === 'car' ? 'car' : null);
// how many slots a vehicle's trunk has (0: none - a horse, a board, an aircraft...)
export function slotsOf(d) { if (!d || d.horse || d.board || d.surfboard || d.cart || d.air) return 0; return TRUNK.slots[KIND(d)] || 0; }
export function entryFor(prof, v) {
  const L = (prof && prof.vehicles) || [];
  return v.ownVid ? L.find((o) => o.vid === v.ownVid) || null : null;
}
export const trunkOf = (ov) => { const t = (ov.trunk ||= { items: {}, weapons: {} }); t.items ||= {}; t.weapons ||= {}; return t; };
export const used = (t) => Object.values(t.items).filter((n) => n > 0).length + Object.keys(t.weapons).length;
// the back of a vehicle, in world px
export const backOf = (v) => [v.x - Math.cos(v.a) * v.def.L / 2, v.y - Math.sin(v.a) * v.def.L / 2];

// a vehicle of yours standing still with its back in reach (on foot), or null
function yoursNear(world, p) {
  const ped = p.ped;
  for (const v of world.query(ped.x, ped.y, 160, K.VEH)) {
    if (v.owner !== p.pid || v.wreckAt || v.sinkAt || v.dead || v.removed || Math.hypot(v.vx, v.vy) > 20 || !slotsOf(v.def)) continue;
    const ov = entryFor(p.profile, v), [bx, by] = backOf(v);
    if (ov && Math.hypot(ped.x - bx, ped.y - by) <= TRUNK.reach + 14) return { v, ov };
  }
  return null;
}
// the action button (players.js findInteraction), on foot
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId || ped.carrying || p.stashAt) return null;
  const n = yoursNear(world, p);
  if (!n) return null;
  const t = trunkOf(n.ov);
  return { label: `Open the trunk (${used(t)}/${slotsOf(n.v.def)})`, run: () => stash.open(world, p, { k: 'trunk', label: `${n.v.def.name}'s trunk`, veh: n.v.id, vid: n.ov.vid, cap: slotsOf(n.v.def) }) };
}
// stash.js: is the trunk it was opened at still in reach (the vehicle there, still, whole, its back near you)
export function stillThere(world, p, at) {
  const v = world.get(at.veh), ped = p.ped;
  if (!v || v.removed || v.owner !== p.pid || v.ownVid !== at.vid || v.wreckAt || v.sinkAt || v.dead || ped.vehId || Math.hypot(v.vx, v.vy) > 20) return false;
  const [bx, by] = backOf(v);
  return Math.hypot(ped.x - bx, ped.y - by) <= TRUNK.reach + 40;
}
// stash.js: the pool and its room - { items, weapons, cap } of the trunk the door names
export function poolOf(p, at) {
  const ov = (p.profile.vehicles || []).find((o) => o.vid === at.vid);
  return ov ? trunkOf(ov) : null;
}

// insurance.js wrecked: what was in it spills where it is
export function spill(world, v, ov) {
  const t = ov && ov.trunk;
  if (!t) return null;
  const items = {}, weapons = {};
  let n = 0, value = 0;
  for (const [id, c] of Object.entries(t.items || {})) if (c > 0 && ITEMS[id]) { items[id] = c; n++; value += (ITEMS[id].sell || 5) * c; }
  for (const [id, r] of Object.entries(t.weapons || {})) { weapons[id] = r; n++; }
  ov.trunk = { items: {}, weapons: {} };
  store.touch();
  if (!n) return null;
  const bag = world.spawnBag(v.x, v.y, { cash: 0, items, weapons, itemValue: value }, 'a trunk');
  bag.expires = world.time + DROP_LIFE_S;
  return bag;
}
