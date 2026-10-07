// Hunting: the deer, rabbits, coyotes and raccoons of the wilds (wildlife.js) are game. Drop one (the hunting rifle
// from the Highland Hunting Lodge or a gun shop does it in one clean shot; anything else that kills does too) and
// stand over it: the action button field-dresses it - a few seconds standing still - for its meat and its hide
// (a deer's antlers too, now and then). The carcass is gone after. A farmer's livestock is not game. Raw meat
// cooks over any lit campfire (the campgrounds, the camps, the beach fires): stand by the fire, press the action
// button, and everything raw in your bag comes off it cooked - real food. The lodge buys meat, hides and antlers
// best (shared/items.js SHOPS.lodge).
import { HUNT_REACH, HUNT_DRESS_S, HUNT_COOK_S } from '../../shared/rules.js';
import { ITEMS } from '../../shared/items.js';
import { K } from '../../shared/constants.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';

const rng = mulberry32(7741);
const MOVE_PX = 14;   // moving this far stops the work

// what each kind of game gives: [item, min, max] (a share of the time, chance)
export const GAME = {
  deer: { name: 'deer', loot: [['venison', 3, 5], ['deerHide', 1, 1], ['antlers', 1, 1, 0.45]] },
  rabbit: { name: 'rabbit', loot: [['rabbitMeat', 1, 1], ['rabbitPelt', 1, 1]] },
  coyote: { name: 'coyote', loot: [['coyotePelt', 1, 1]] },
  raccoon: { name: 'raccoon', loot: [['raccoonPelt', 1, 1]] },
};
const LIVESTOCK = new Set(['cow', 'sheep', 'horse', 'goat', 'pig']);
const COOKS = { venison: 'venisonSteak', rabbitMeat: 'rabbitRoast' };   // raw -> cooked, one for one

// the nearest dead animal within reach (game or livestock), or null
function carcassNear(world, x, y) {
  let best = null, bd = HUNT_REACH;
  for (const e of world.query(x, y, HUNT_REACH + 10, K.PED)) {
    if (!e.wild || !e.dead || e.dressed) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
// a lit campfire within reach (the map's campfire props), or null
function fireNear(world, x, y) {
  const m = world.map;
  let fires = m._fires;
  if (!fires) { fires = []; for (const p of m.props) if (p && p.t === 'campfire' && p.lit) fires.push(p); Object.defineProperty(m, '_fires', { value: fires, enumerable: false, configurable: true }); }
  for (const f of fires) if (Math.abs(f.x - x) < HUNT_REACH + 20 && Math.abs(f.y - y) < HUNT_REACH + 20 && Math.hypot(f.x - x, f.y - y) < HUNT_REACH + 16) return f;
  return null;
}
const rawIn = (p) => Object.keys(COOKS).filter((id) => (p.profile.inventory[id] || 0) > 0);

export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  if (ped.hunt) return { label: ped.hunt.kind === 'cook' ? 'Cooking over the fire... (stand still)' : 'Field dressing... (stand still)', passive: true, run: () => {} };
  const c = carcassNear(world, ped.x, ped.y);
  if (c) {
    if (LIVESTOCK.has(c.wild.kind)) return { label: "Somebody's livestock - not game", run: () => world.notify(p, 'That was a farmer\'s animal, not game. Hunt deer, rabbits, coyotes and raccoons out in the wilds.', 'warn') };
    const G = GAME[c.wild.kind];
    if (G) return { label: `Field dress the ${G.name}`, run: () => begin(world, p, 'dress', c.id) };
  }
  const f = rawIn(p).length ? fireNear(world, ped.x, ped.y) : null;
  if (f) return { label: 'Cook your meat over the fire', run: () => begin(world, p, 'cook', 0) };
  return null;
}

export function begin(world, p, kind, id) {
  const ped = p.ped;
  if (!ped || ped.dead || ped.vehId || ped.hidden) return 'Not right now.';
  if (ped.carrying) { world.notify(p, 'Set the crate down first.', 'warn'); return 'busy'; }
  ped.hunt = { kind, id, at: world.time, x: ped.x, y: ped.y };
  ped.vx = 0; ped.vy = 0;
  world.notify(p, kind === 'cook' ? 'You set the meat over the coals... (stand still)' : 'You kneel and get to work with your knife... (stand still)', 'info');
  p.meDirty = true;
  return null;
}

export function update(world) {
  if (world.tick % 2) return;
  for (const p of world.players.values()) {
    const ped = p.ped, h = ped && ped.hunt;
    if (!h) continue;
    const c = h.kind === 'dress' ? world.get(h.id) : null;
    const lost = h.kind === 'dress' ? !c || !c.dead || c.dressed : !fireNear(world, ped.x, ped.y) || !rawIn(p).length;
    if (ped.dead || ped.vehId || ped.hidden || world.time < ped.downUntil || (ped.lastHitAt || -99) > h.at || Math.hypot(ped.x - h.x, ped.y - h.y) > MOVE_PX || lost) {
      ped.hunt = null;
      if (!ped.dead) world.notify(p, h.kind === 'cook' ? 'You took the meat off the fire.' : 'You stopped.', 'warn');
      p.meDirty = true;
      continue;
    }
    if (world.time - h.at < (h.kind === 'cook' ? HUNT_COOK_S : HUNT_DRESS_S)) continue;
    ped.hunt = null;
    if (h.kind === 'dress') dress(world, p, c);
    else cook(world, p);
    p.meDirty = true;
    store.touch();
  }
}

function dress(world, p, c) {
  const G = GAME[c.wild.kind], inv = p.profile.inventory, got = [];
  for (const [id, lo, hi, chance] of G.loot) {
    if (chance !== undefined && rng() >= chance) continue;
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    inv[id] = (inv[id] || 0) + n;
    got.push(`${n > 1 ? n + ' ' : ''}${ITEMS[id].name.toLowerCase()}`);
  }
  c.dressed = true;
  world.remove(c);
  world.notify(p, `From the ${G.name}: ${got.join(', ')}. Cook the meat over a campfire; the Highland Hunting Lodge pays best for meat and hides.`, 'good');
}

function cook(world, p) {
  const inv = p.profile.inventory, done = [];
  for (const raw of rawIn(p)) {
    const n = inv[raw], out = COOKS[raw];
    delete inv[raw];
    inv[out] = (inv[out] || 0) + n;
    done.push(`${n} ${ITEMS[out].name.toLowerCase()}`);
  }
  world.notify(p, `Cooked: ${done.join(', ')}. Eat it from your bag for health, or sell it at the lodge.`, 'good');
}
