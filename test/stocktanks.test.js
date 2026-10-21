// The desert's windmills and stock tanks (shared/world3-stocktanks.js builds them in World v3: test/world3desert.test.js
// checks the build): range cattle graze round a stock tank out on the range as the farms keep their livestock about
// (server/systems/wildlife.js farmNear) - cows only, never the farms' sheep or pigs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld, joinPlayer, run, teleport } from './helpers.js';
import { K, T, TILE } from '../shared/constants.js';
import * as wildlife from '../server/systems/wildlife.js';

test('range cattle round a stock tank out in the desert: cows, and only cows', () => {
  const w = makeWorld({ npcBudget: 200 });   // (no NPCs at all: no animals either)
  const m = w.map;
  // a stock tank on open desert ground well away from the farms and anyone's place (this map has none of its own)
  let at = null;
  for (let ty = m.y0 + 10; ty < m.y0 + m.h - 10 && !at; ty += 6) for (let tx = m.x0 + 10; tx < m.x0 + m.w - 10; tx += 6) {
    const x = (tx + 0.5) * TILE, y = (ty + 0.5) * TILE, i = m.idx(tx, ty);
    if (wildlife.wildStyle(m, x, y) !== 'desert' || !m.land[i] || ![T.SAND, T.DIRT, T.GRASS].includes(m.tiles[i])) continue;
    if (m.pois.some((q) => Math.hypot(q.x - x, q.y - y) < 2600)) continue;
    at = { x, y }; break;
  }
  assert.ok(at, 'open desert on the map');
  m.natureSites = m.natureSites || [];
  m.natureSites.push({ kind: 'stocktank', x: Math.round(at.x), y: Math.round(at.y) });
  try {
    const { p } = joinPlayer(w);
    teleport(w, p.ped, at.x, at.y + 160);
    run(w, 25);
    const stock = w.query(at.x, at.y, 1500, K.PED).filter((e) => e.wild && e.wild.livestock);
    assert.ok(stock.length >= 2, `cattle round the tank (${stock.length})`);
    assert.ok(stock.every((e) => e.wild.kind === 'cow'), `cows only (${stock.map((e) => e.wild.kind)})`);
  } finally { m.natureSites.pop(); }
});
