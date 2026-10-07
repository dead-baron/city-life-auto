// Picking fruit: the trees in Willow River Orchard and the vines in the vineyard (map.pickables, laid out by
// shared/naturesites.js). Stand by a tree or a vine and press the action button: a few apples, oranges or grapes
// go in your bag (eat them for a little health, or sell them at a corner store or a gas station), then that tree
// or vine is picked clean for PICK_REGROW_S.
import { ITEMS } from '../../shared/items.js';
import { PICK_MAX, PICK_REGROW_S, PICK_REACH } from '../../shared/rules.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';

const rng = mulberry32(7331);

// the pickables' bounding boxes in clusters (the orchard, the vineyard), so most of the world skips the search
function clusters(map) {
  if (map._pickClusters) return map._pickClusters;
  const out = [];
  for (let i = 0; i < (map.pickables || []).length; i++) {
    const q = map.pickables[i];
    let c = out.find((k) => q.x > k.x0 - 600 && q.x < k.x1 + 600 && q.y > k.y0 - 600 && q.y < k.y1 + 600);
    if (!c) out.push((c = { x0: q.x, y0: q.y, x1: q.x, y1: q.y, idx: [] }));
    c.x0 = Math.min(c.x0, q.x); c.y0 = Math.min(c.y0, q.y); c.x1 = Math.max(c.x1, q.x); c.y1 = Math.max(c.y1, q.y); c.idx.push(i);
  }
  Object.defineProperty(map, '_pickClusters', { value: out, enumerable: false, configurable: true });
  return out;
}

// the index of the nearest pickable within reach of (x, y), or -1
export function pickNear(world, x, y) {
  const list = world.map.pickables;
  if (!list || !list.length) return -1;
  let best = -1, bd = PICK_REACH;
  for (const c of clusters(world.map)) {
    if (x < c.x0 - PICK_REACH || x > c.x1 + PICK_REACH || y < c.y0 - PICK_REACH || y > c.y1 + PICK_REACH) continue;
    for (const i of c.idx) { const q = list[i], d = Math.hypot(q.x - x, q.y - y); if (d < bd) { bd = d; best = i; } }
  }
  return best;
}

const plural = (id, n) => { const nm = ITEMS[id].name; return n === 1 ? (id === 'grapes' ? 'a bunch of grapes' : `a ${nm.toLowerCase()}`) : id === 'grapes' ? `${n} bunches of grapes` : `${n} ${nm.toLowerCase()}s`; };

// the action-button prompt by a tree or a vine (null elsewhere)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const i = pickNear(world, ped.x, ped.y);
  if (i < 0) return null;
  const q = world.map.pickables[i], bare = ((world.picked && world.picked.get(i)) || 0) > world.time;
  const what = q.item === 'grapes' ? 'grapes' : `${q.item}s`;
  return { label: bare ? `Picked clean - more ${what} later` : `Pick ${what}`, run: () => pick(world, p, i) };
}

export function pick(world, p, i) {
  const ped = p.ped, q = world.map.pickables && world.map.pickables[i];
  if (!ped || ped.dead || !q || Math.hypot(q.x - ped.x, q.y - ped.y) > PICK_REACH + 8) return 0;
  world.picked ||= new Map();
  if ((world.picked.get(i) || 0) > world.time) { world.notify(p, `Nothing left to pick here. Try another ${q.vine ? 'vine' : 'tree'}.`, 'info'); return 0; }
  const n = 1 + Math.floor(rng() * PICK_MAX);
  p.profile.inventory[q.item] = (p.profile.inventory[q.item] || 0) + n;
  world.picked.set(i, world.time + PICK_REGROW_S);
  ped.a = Math.atan2(q.y - ped.y, q.x - ped.x);
  world.notify(p, `You pick ${plural(q.item, n)}. Eat them for a little health, or sell them at a corner store.`, 'good');
  p.meDirty = true;
  store.touch();
  return n;
}
