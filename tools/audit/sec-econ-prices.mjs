// Report-only (security audit, money): every item a shop sells for less (per unit) than any counter buys it back for.
// A buy at the cheapest counter (with the "Loved" discount, reputation.js priceMul) and a sell at the best one = money printed.
import { SHOPS, ITEMS, CRAFTS, materialIds } from '../../shared/items.js';
import { REPUTATION } from '../../shared/rules.js';
import { RECORD_STORE } from '../../shared/music.js';
const buy = {};   // id -> [{ shop, unit }]
const add = (id, shop, unit) => (buy[id] ||= []).push({ shop, unit });
for (const [k, s] of Object.entries(SHOPS)) for (const o of s.buy || []) if (o.kind === 'item') add(o.id, k, o.price / (o.qty || 1));
for (const [id, pr] of [['whiskey', 8], ['redwine', 10], ['bread', 5], ['apple', 3], ['energy', 8], ['hotdog', 7], ['bread', 4], ...(RECORD_STORE || [])]) add(id, 'walk-in', pr);
const sell = {};
for (const [k, s] of Object.entries(SHOPS)) for (const id of s.sells || []) { const v = (s.sellPrice && s.sellPrice[id]) || (ITEMS[id] && ITEMS[id].sell) || 0; if (!sell[id] || v > sell[id].v) sell[id] = { shop: k, v }; }
const loved = REPUTATION.shops.loved;
let n = 0;
for (const id of Object.keys(buy)) {
  const b = buy[id].reduce((a, c) => (c.unit < a.unit ? c : a));
  const s = sell[id];
  if (!s) continue;
  const bl = Math.max(1, Math.round(b.unit * loved));
  if (s.v >= bl) { n++; console.log(`PROFIT ${id}: buy ${b.unit.toFixed(2)} (loved ${bl}) at ${b.shop}, sell ${s.v} at ${s.shop}`); }
  else if (s.v >= bl * 0.8) console.log(`close  ${id}: buy ${b.unit.toFixed(2)} at ${b.shop}, sell ${s.v} at ${s.shop}`);
}
// crafting from bought materials
for (const c of CRAFTS) {
  let cost = 0, ok = true;
  for (const [mat, k] of c.needs) { const ids = materialIds(mat).filter((i) => buy[i]); if (!ids.length) { ok = false; break; } cost += k * Math.min(...ids.flatMap((i) => buy[i].map((x) => x.unit))); }
  if (ok) { const s = sell[c.id]; console.log(`craft ${c.id}: materials buyable for ${cost}, sells ${s ? s.v : '-'}`); }
}
console.log(`${n} buy-low/sell-high items`);
