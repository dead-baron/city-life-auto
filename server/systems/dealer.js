// Dealership lots: a handful of cars in stock on the open lot outside each dealership, each with
// a price tag. Walk up to one and press interact to buy it - it's yours on the spot (and in your
// garage list). Sold cars are replaced with something new a while later, when nobody's looking.
import { K } from '../../shared/constants.js';
import { VEHICLES, PAINTS } from '../../shared/vehicles.js';
import { mulberry32 } from '../../shared/rng.js';
import { store } from '../store.js';
import * as homes from './homes.js';

const rng = mulberry32(9090);
// what turns up on the lot (weights) - mostly everyday cars, the odd sports car, motorbike or bicycle
const STOCK = [['compact', 5], ['sedan', 5], ['pickup', 3], ['van', 2], ['flatbed', 1], ['bike', 2], ['sports', 1.2], ['mtb', 0.5], ['roadbike', 0.4], ['cruiser', 0.4], ['cargobike', 0.3]];
const RESTOCK_S = 60;

function pickModel() {
  let tot = 0; for (const [, w] of STOCK) tot += w;
  let r = rng() * tot;
  for (const [id, w] of STOCK) { r -= w; if (r <= 0) return id; }
  return 'sedan';
}

export function init(world) {
  world.lotState = (world.map.dealerLots || []).map((lot) => lot.slots.map(() => ({ v: 0, restockAt: 0 })));
  for (let i = 0; i < world.lotState.length; i++) stock(world, i, true);
}

function stock(world, i, force) {
  const lot = world.map.dealerLots[i];
  lot.slots.forEach((sp, j) => {
    const st = world.lotState[i][j];
    const v = st.v ? world.get(st.v) : null;
    if (v && !v.removed && v.forSale) return;
    st.v = 0;
    if (!force && world.time < st.restockAt) return;
    if (world.query(sp.x, sp.y, 50, K.VEH).length) return;
    if (!force && [...world.players.values()].some((q) => q.ped && Math.hypot(q.ped.x - sp.x, q.ped.y - sp.y) < 380)) return;
    const model = pickModel();
    const d = VEHICLES[model];
    const price = Math.round(((d.price || 4000) * (0.85 + rng() * 0.3)) / 50) * 50;
    const nv = world.spawnVehicle(model, sp.x, sp.y, sp.a, { paint: Math.floor(rng() * PAINTS.length), variant: Math.floor(rng() * 1000) });
    nv.despawnable = false; nv.parked = true;
    nv.forSale = { lot: i, slot: j, price };
    nv.descVer = (nv.descVer || 0) + 1;
    st.v = nv.id;
  });
}

export function update(world) {
  if (!world.lotState || world.tick % 40 !== 21) return;
  for (let i = 0; i < world.lotState.length; i++) stock(world, i, false);
}

// The for-sale vehicle you're standing next to (on foot).
export function saleNear(world, ped) {
  let best = null, bd = 80;
  for (const v of world.query(ped.x, ped.y, 120, K.VEH)) {
    if (!v.forSale || v.wreckAt) continue;
    const d = Math.hypot(v.x - ped.x, v.y - ped.y) - Math.max(v.def.L, v.def.W) / 2;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function buy(world, p, v, pay) {
  const prof = p.profile;
  if (!v || !v.forSale) return 'That one just sold.';
  if (prof.vehicles.length >= homes.garageCap(world, prof)) return `Garage full (${prof.vehicles.length}/${homes.garageCap(world, prof)}). Buy a home for more garage space.`;
  const price = v.forSale.price;
  if (!pay(p, price)) return `You need $${price.toLocaleString()} (cash + bank).`;
  const { lot, slot } = v.forSale;
  world.lotState[lot][slot].v = 0;
  world.lotState[lot][slot].restockAt = world.time + RESTOCK_S;
  v.forSale = null;
  v.owner = p.pid; v.ownerName = p.name; v.npcOwned = false; v.despawnable = false; v.parked = false;
  v.descVer = (v.descVer || 0) + 1;
  prof.vehicles.push({ model: v.model, paint: v.paint, variant: v.variant });
  const old = world.get(p.activeVehicle);
  if (old && old !== v && old.owner === p.pid && !old.seats.some((s) => s)) world.remove(old); // one of your cars out at a time
  p.activeVehicle = v.id;
  store.touch();
  p.meDirty = true;
  world.notify(p, `You bought the ${v.def.name} for $${price.toLocaleString()}! The keys are yours - it's in your garage list too.`, 'good');
  return null;
}
