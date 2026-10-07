// Foraging (shared/foraging.js): the mushrooms of the redwood floor and the tidepools' golden stars, laid out with the
// map (map.forage). Stand by a spot and press the action button: a few go in your bag, and the spot is bare until it
// grows back (rules.js FORAGE_REGROW_S, by kind). Everyone sees which spots are bare: a pick and a regrowth are
// broadcast ({ e: 'forage', i, up }), and the welcome carries the bare ones (gone()). Ghostglass is contraband: only
// the Back-Alley Exchange buys it (items.js), and an arrest takes it (law.js).
import { FORAGE_REACH, FORAGE_REGROW_S } from '../../shared/rules.js';
import { FORAGE_KINDS } from '../../shared/foraging.js';
import { ITEMS } from '../../shared/items.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';

const rng = mulberry32(5813);
const CELL = 512;

// the spots by 512 px cell, built once per map
function grid(map) {
  if (map._forageGrid) return map._forageGrid;
  const g = new Map();
  (map.forage || []).forEach((f, i) => { const k = Math.floor(f.y / CELL) * 4096 + Math.floor(f.x / CELL); let a = g.get(k); if (!a) g.set(k, (a = [])); a.push(i); });
  Object.defineProperty(map, '_forageGrid', { value: g, enumerable: false, configurable: true });
  return g;
}

// the index of the nearest spot within reach of (x, y) that has something on it, else the nearest bare one (so the
// prompt can say so), or -1
export function forageNear(world, x, y) {
  const list = world.map.forage;
  if (!list || !list.length) return -1;
  const g = grid(world.map), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = -1, bd = FORAGE_REACH, bare = -1, bb = FORAGE_REACH;
  for (let yy = cy - 1; yy <= cy + 1; yy++) for (let xx = cx - 1; xx <= cx + 1; xx++) {
    for (const i of g.get(yy * 4096 + xx) || []) {
      const f = list[i], d = Math.hypot(f.x - x, f.y - y);
      if (isBare(world, i)) { if (d < bb) { bb = d; bare = i; } } else if (d < bd) { bd = d; best = i; }
    }
  }
  return best >= 0 ? best : bare;
}
const isBare = (world, i) => !!(world.forageGone && world.forageGone.has(i));

// the action-button prompt by a spot (null elsewhere)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const i = forageNear(world, ped.x, ped.y);
  if (i < 0) return null;
  const f = world.map.forage[i], K = FORAGE_KINDS[f.k];
  if (!K) return null;
  if (isBare(world, i)) return { label: `Picked here already - ${f.k === 'goldStar' ? 'look in another pool' : 'more will grow'}`, run: () => world.notify(p, 'Someone has picked this spot clean. It grows back in a while - try the next giant along.', 'info') };
  return { label: K.verb, run: () => pick(world, p, i) };
}

export function pick(world, p, i) {
  const ped = p.ped, f = world.map.forage && world.map.forage[i], K = f && FORAGE_KINDS[f.k];
  if (!ped || ped.dead || !K || Math.hypot(f.x - ped.x, f.y - ped.y) > FORAGE_REACH + 8) return 0;
  if (isBare(world, i)) { world.notify(p, 'Nothing left here. It grows back in a while.', 'info'); return 0; }
  const n = K.n[0] + Math.floor(rng() * (K.n[1] - K.n[0] + 1));
  p.profile.inventory[K.item] = (p.profile.inventory[K.item] || 0) + n;
  (world.forageGone ||= new Map()).set(i, world.time + (FORAGE_REGROW_S[f.k] || 600));
  world.broadcast({ e: 'forage', i, up: 0 });
  ped.a = Math.atan2(f.y - ped.y, f.x - ped.x);
  const name = ITEMS[K.item] ? ITEMS[K.item].name : K.item;
  world.notify(p, `${n > 1 ? `${n} ${name}` : name} in your bag. ${K.tip}`, f.k === 'ghostglass' || f.k === 'redcap' ? 'warn' : 'good');
  p.meDirty = true;
  store.touch();
  return n;
}

// spots growing back (a few times a second is plenty)
export function update(world) {
  const gone = world.forageGone;
  if (!gone || !gone.size || world.tick % 10 !== 3) return;
  for (const [i, t] of gone) if (world.time >= t) { gone.delete(i); world.broadcast({ e: 'forage', i, up: 1 }); }
}

// the bare spots, for a player joining
export function goneList(world) { return world.forageGone ? [...world.forageGone.keys()] : []; }
