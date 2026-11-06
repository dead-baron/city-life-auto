// The maps' one icon for places of a kind close together (client/hud.js iconMerge): a grid by kind, the same places
// left off as the old look at every place kept so far - which took the page's start 0.9 s at World v3's size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iconMerge } from '../client/hud.js';

const NO = new Set(['delivery', 'vending', 'reception', 'evidence']);
function naive(list) {   // (the old iconSkip)
  const skip = new Set(), kept = [];
  for (const p of list) {
    if (!p || NO.has(p.kind)) continue;
    if (kept.some((q) => q.kind === p.kind && Math.hypot(q.x - p.x, q.y - p.y) < 640)) skip.add(p.id); else kept.push(p);
  }
  return skip;
}
let s = 7;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);

test('the grid leaves off the same places as the old merge, and in a fraction of the time', () => {
  const kinds = ['shop', 'atm', 'food', 'hospital', 'vending', undefined];
  const list = [];
  for (let i = 0; i < 6000; i++) list.push(rnd() < 0.01 ? null : { id: i, kind: kinds[Math.floor(rnd() * kinds.length)], x: rnd() < 0.005 ? NaN : rnd() * 60000 - 2000, y: rnd() * 60000 });
  for (let i = 0; i < 400; i++) { const q = list[i * 7]; if (q) list.push({ id: 10000 + i, kind: q.kind, x: q.x + (rnd() - 0.5) * 1400, y: q.y + 640 * (rnd() < 0.5 ? 1 : -1) * rnd() }); }   // (near neighbours, some across cell edges)
  let t = performance.now();
  const a = naive(list);
  const tNaive = performance.now() - t;
  t = performance.now();
  const b = iconMerge(list);
  const tGrid = performance.now() - t;
  assert.ok(a.size > 50);
  assert.deepEqual([...b].sort((x, y) => x - y), [...a].sort((x, y) => x - y));
  assert.ok(tGrid < tNaive, `grid ${tGrid.toFixed(1)} ms vs ${tNaive.toFixed(1)} ms`);
});
