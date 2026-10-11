// The real-estate app on the phone (H65; the owner, 2026-10-11: "can we get more of the owning a house features up?"):
// the homes for sale - where (the district and how well-to-do it is), the price, the kind, the bedrooms, the garage's
// size, the yard (the garden plots: gardening.js), a picture (the page draws the plan) and a waypoint - and your own
// homes with what they're worth. All of it worked out here from the built map and who owns what (homes.js: the map's
// homes and the apartment blocks' units); the page only draws the list (client/realestate.js, loaded when the app opens).
//   msg: { a: 'homes', sort: 'near' | 'cheap' | 'dear', kind: 'all' | 'apartment' | 'house' | 'big' | 'cheap' }
//   reply: { t: 'homes', sale: [row], mine: [row], total, shown, sort, kind, cash, bank }
//   row: { id, n (name), k (kind), w (what: studio / apartment / penthouse / house...), pl (plan), tr (how well it's
//     furnished, 0-3), p (price), beds, g (garage spaces), yard (plots), dock, x, y (the door), d (district), dt (its
//     tier: lux / mid / low / rough), u (unit, in a block), fl (floor), worth / back (yours: what it's worth, what selling
//     brings) }
import { DISTRICTS } from '../../shared/map.js';
import { TILE } from '../../shared/constants.js';
import { planOf, tierOf } from '../../shared/homelayout.js';
import * as homes from './homes.js';
import { plotSpots } from './gardening.js';
import { bedsIn } from './homeinside.js';

const SHOW = 30;   // rows of homes for sale in one reply (the nearest, the cheapest...)
const SELL_BACK = 0.6;   // (homes.js sell: 60% of the price back)
const KIND_WORD = { farmhouse: 'farmhouse', cottage: 'cottage', beach: 'beach house', mansion: 'mansion', house: 'house', apartment: 'apartment', shack: 'shack' };

// every home there is: the map's (not gone) and the apartment blocks' units
export function allHomes(world) {
  const out = [];
  for (const h of world.map.homes || []) if (h && !h.gone) out.push(h);
  if (world.units) for (const u of world.units.values()) out.push(u);
  return out;
}

function districtOf(map, h) {
  const tx = Math.floor(h.x / TILE), ty = Math.floor(h.y / TILE);
  const d = map.inside && map.inside(tx, ty) ? map.dist[map.idx(tx, ty)] : -1;
  return DISTRICTS[d] || null;
}

export function row(world, h) {
  const D = districtOf(world.map, h);
  return {
    id: h.id, n: h.name, k: h.kind, w: h.what || KIND_WORD[h.kind] || h.kind, pl: planOf(h), tr: tierOf(h), p: h.price, beds: bedsIn(h),
    g: h.slots, yard: plotSpots(world.map, h).length, dock: h.dock ? 1 : 0, x: Math.round(h.x), y: Math.round(h.y),
    d: D ? D.name : '', dt: D ? D.tier || '' : '', ...(h.unit ? { u: h.unit, fl: h.floor } : world.unitsOf && world.unitsOf.has(h.id) ? { u: 1, fl: 1 } : null),   // (a block's own map home: its unit 1)
  };
}

const KINDS = {
  all: () => true,
  apartment: (h) => h.kind === 'apartment',
  house: (h) => h.kind !== 'apartment' && h.kind !== 'mansion' && h.kind !== 'shack',
  big: (h) => h.kind === 'mansion' || h.price >= 50000,
  cheap: (h) => h.price < 15000,
};

export function listings(world, p, msg = {}) {
  const prof = p.profile, ped = p.ped;
  const sort = ['near', 'cheap', 'dear'].includes(msg.sort) ? msg.sort : 'near';
  const kind = KINDS[msg.kind] ? msg.kind : 'all';
  const me = ped ? { x: ped.x, y: ped.y } : null;
  const all = allHomes(world);
  const forSale = all.filter((h) => !world.homeOwner.has(h.id));
  const pick = forSale.filter(KINDS[kind]);
  const dist = (h) => (me ? Math.hypot(h.x - me.x, h.y - me.y) : 0);
  pick.sort(sort === 'cheap' ? (a, b) => a.price - b.price || dist(a) - dist(b) : sort === 'dear' ? (a, b) => b.price - a.price || dist(a) - dist(b) : (a, b) => dist(a) - dist(b) || a.price - b.price);
  const sale = pick.slice(0, SHOW).map((h) => row(world, h));
  const mine = homes.ownedHomes(world, prof).filter(Boolean).map((h) => ({ ...row(world, h), worth: h.price, back: Math.round(h.price * SELL_BACK), spawn: prof.spawnHome === h.id ? 1 : 0 }));
  return { t: 'homes', sale, mine, total: forSale.length, matching: pick.length, homes: all.length, sort, kind, cash: prof.cash, bank: prof.bank };
}
