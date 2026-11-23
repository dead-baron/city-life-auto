// No shop sells an item for less than any place buys it back for (the security audit, 11-19: apples bought at $4 for 3,
// sold at $5 each - an unlimited money loop).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOPS, ITEMS } from '../shared/items.js';

test('no money loops: every item a shop sells costs more per piece than the best buy-back anywhere', () => {
  const best = (id) => Math.max((ITEMS[id] && ITEMS[id].sell) || 0, ...Object.values(SHOPS).map((s) => (s && s.sellPrice && s.sellPrice[id]) || 0));
  const loops = [];
  for (const [k, sh] of Object.entries(SHOPS)) for (const b of (sh && sh.buy) || []) {
    if (!b || b.kind !== 'item' || !(b.price > 0) || !ITEMS[b.id]) continue;
    if (b.price / Math.max(1, b.qty || 1) <= best(b.id)) loops.push(`${k} ${b.id} ${b.price}/${b.qty || 1} vs ${best(b.id)}`);
  }
  assert.deepEqual(loops, []);
});
