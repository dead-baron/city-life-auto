// Picking: the trees in Willow River Orchard, the vines in the vineyard and the rows at Cedar Point Lavender
// (map.pickables, laid out by shared/naturesites.js). Stand by a tree, a vine or a row and press the action button:
// a few apples, oranges, bunches of grapes or of lavender go in your bag (fruit you can eat for a little health;
// all of it sells - the winery pays best for grapes, the farm stand for lavender), then that tree, vine or stretch
// of row is picked clean for PICK_REGROW_S.
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

// what each crop is called at the plant, what it grows on, and where it sells
const CROP = {
  apple: { verb: 'Pick apples', what: 'apples', on: 'tree', one: 'an apple', many: (n) => `${n} apples`, note: 'Eat them for a little health, or sell them at the orchard stand or a corner store.' },
  orange: { verb: 'Pick oranges', what: 'oranges', on: 'tree', one: 'an orange', many: (n) => `${n} oranges`, note: 'Eat them for a little health, or sell them at the orchard stand or a corner store.' },
  grapes: { verb: 'Pick grapes', what: 'grapes', on: 'vine', one: 'a bunch of grapes', many: (n) => `${n} bunches of grapes`, note: 'Eat them, or sell them to the winery down the hill - it pays best.' },
  lavender: { verb: 'Cut lavender', what: 'lavender', on: 'row', one: 'a bunch of lavender', many: (n) => `${n} bunches of lavender`, note: 'The farm stand by the road buys it, and so does the market in Old Town.' },
};
const crop = (id) => CROP[id] || { verb: `Pick ${id}`, what: id, on: 'plant', one: `a ${id}`, many: (n) => `${n} ${id}`, note: '' };

// the action-button prompt by a tree or a vine (null elsewhere)
export function interaction(world, p) {
  const ped = p.ped;
  if (!ped || ped.vehId) return null;
  const i = pickNear(world, ped.x, ped.y);
  if (i < 0) return null;
  const q = world.map.pickables[i], bare = ((world.picked && world.picked.get(i)) || 0) > world.time, c = crop(q.item);
  return { label: bare ? `Picked clean - more ${c.what} later` : c.verb, run: () => pick(world, p, i) };
}

export function pick(world, p, i) {
  const ped = p.ped, q = world.map.pickables && world.map.pickables[i];
  if (!ped || ped.dead || !q || Math.hypot(q.x - ped.x, q.y - ped.y) > PICK_REACH + 8) return 0;
  world.picked ||= new Map();
  const c = crop(q.item);
  if ((world.picked.get(i) || 0) > world.time) { world.notify(p, `Nothing left to pick here. Try another ${c.on}.`, 'info'); return 0; }
  const n = 1 + Math.floor(rng() * PICK_MAX);
  p.profile.inventory[q.item] = (p.profile.inventory[q.item] || 0) + n;
  world.picked.set(i, world.time + PICK_REGROW_S);
  ped.a = Math.atan2(q.y - ped.y, q.x - ped.x);
  world.notify(p, `You ${q.item === 'lavender' ? 'cut' : 'pick'} ${n === 1 ? c.one : c.many(n)}. ${c.note}`, 'good');
  p.meDirty = true;
  store.touch();
  return n;
}
