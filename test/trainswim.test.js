// Train riders never swim (the owner, 11-25 13:33: "in some places the train might be registering as in water and all
// the people on the train will do a swimming animation for a few seconds"): the swim flag the page draws from (net.js,
// mapcore.js isSwimming) read the tile under a rider - over a stretch of track on water, everyone aboard swam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { isSwimming } from '../shared/mapcore.js';
import { _fields } from '../server/net.js';
import { spawnNpc } from '../server/systems/npc.js';
import { T } from '../shared/constants.js';

test('a rider over water is not swimming, on the wire or anywhere else', () => {
  const w = makeWorld(), m = w.map;
  let at = null;
  for (let ty = m.y0 + 10; ty < m.y0 + m.h - 10 && !at; ty += 3) for (let tx = m.x0 + 10; tx < m.x0 + m.w - 10; tx += 3) if (m.tileAt(tx, ty) === T.WATER) { at = { x: tx * 32 + 16, y: ty * 32 + 16 }; break; }
  assert.ok(at && w.trains && w.trains.length, 'water and a train');
  const n = spawnNpc(w, 'casual', at.x, at.y, 'civ');
  assert.ok(isSwimming(m, n), 'in the water: swimming');
  assert.ok(_fields(w, n)[3] & 128, 'flagged so');
  n.onTrain = { t: 0, c: 0, ox: 0, oy: 0, la: 0 };
  assert.ok(!isSwimming(m, n), 'aboard a train over the same water: not swimming');
  assert.ok(!(_fields(w, n)[3] & 128), 'nor flagged so for the page');
});
