// Where the gang-police shootouts break out (server/systems/gangwar.js turfSpots): by a gang HQ on the turf or out in the
// wilds (a ghost town's hideout) - not by one in a casino town or the like, where the syndicate keeps its head down (the
// owner, 10-16: "Mesa Flats (casino town) gang: isolate it, or make them Vegas-mafia types who aren't touchy").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { DISTRICTS } from '../shared/mapcore.js';
import { TILE } from '../shared/constants.js';
const gangwar = await import('../server/systems/gangwar.js');

test('shootouts by a gang HQ on the turf or out in the wilds, not by one in town off the turf', () => {
  const w = makeWorld(), m = w.map;
  const hqs = m.pois.filter((p) => p.kind === 'gang');
  assert.ok(hqs.length, 'gang HQs on the map');
  const spots = gangwar.turfSpots(w);
  assert.equal(spots.length, hqs.filter((p) => DISTRICTS[m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]].turf).length + hqs.filter((p) => !DISTRICTS[m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]].turf && ['wild', 'rural', 'desert'].includes(DISTRICTS[m.dist[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))]].style)).length, 'the turf\'s and the wilds\' HQs');
  // a back room in a smart part of town, off the turf: no shootouts start from it
  let at = null;
  for (let ty = m.y0 + 10; ty < m.y0 + m.h - 10 && !at; ty += 5) for (let tx = m.x0 + 10; tx < m.x0 + m.w - 10; tx += 5) { const D = DISTRICTS[m.dist[m.idx(tx, ty)]]; if (D && !D.turf && (D.style === 'nightlife' || D.style === 'towers')) { at = [tx, ty]; break; } }
  assert.ok(at, 'a smart part of town');
  const back = { id: m.pois.length, kind: 'gang', label: 'The Counting Room', x: (at[0] + 0.5) * TILE, y: (at[1] + 0.5) * TILE, r: 46 };
  m.pois.push(back);
  try {
    assert.ok(!gangwar.turfSpots(w).some((s) => s.x === back.x && s.y === back.y), 'the casino town\'s back room: no shootouts from it');
  } finally { m.pois.pop(); }
});
