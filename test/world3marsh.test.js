// The Egret Marsh Boardwalk (Nature-C3, shared/world3-marsh.js): World v3's Egret Coast marsh gets its walk - from a
// trailhead by a county road, a plank boardwalk zig-zagging out over the channels, a bird hide on piles at a bend, a
// viewing platform with a bench and a coin telescope out over the water at the far end, a canoe dock with two canoes,
// a beaver lodge; walkable all the way; nothing else standing on its planks; kayaks to hire at the canoe dock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { MARSH } from '../shared/world3-marsh.js';
import { MARSH_BOX } from '../shared/world3-waterbodies.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the Egret Marsh Boardwalk - out over the marsh, the hide, the platform, the canoes, the lodge', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const B = m.world3.marsh;
  assert.ok(B && B.built, 'built');
  assert.ok(B.legs >= 3, `zig-zagging out (${B.legs} legs)`);
  assert.equal(B.canoes, 2, 'two canoes at the dock');
  assert.ok(B.lodge, "the beavers' lodge");
  const site = m.natureSites.find((s) => s.name === MARSH.name);
  assert.ok(site && site.boardwalk.length >= 4 && m.landmarks.some((l) => l.name === MARSH.name), 'a nature site and a landmark');
  const [sx, sy] = B.at;
  assert.ok(sx >= MARSH_BOX[0] && sx <= MARSH_BOX[2] && sy >= MARSH_BOX[1] && sy <= MARSH_BOX[3] && m.dist[m.idx(sx, sy)] === MARSH.district, "in the Egret Coast's marsh");
  // walkable end to end: every step along each leg on its planks
  const P = site.boardwalk, tileAt = (x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  let over = 0, steps = 0;
  for (let k = 1; k < P.length; k++) {
    const [x0, y0] = P[k - 1], [x1, y1] = P[k], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8);
    for (let j = 0; j <= n; j++) { steps++; const x = x0 + (x1 - x0) * j / n, y = y0 + (y1 - y0) * j / n; assert.ok(tileAt(x, y) === T.DOCK || tileAt(x, y) === T.BRIDGE, `on the planks at ${Math.round(x)},${Math.round(y)}`); if (!m.land[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))]) over++; }
  }
  assert.ok(over > steps * 0.5, `out over the water most of the way (${over} of ${steps})`);
  // its things: a leg of boardwalk each, the hide, the platform with the telescope and the bench, the canoes
  const near = (t, x, y, r) => m.props.filter((p) => p.t === t && Math.hypot(p.x - x, p.y - y) < r);
  assert.equal(near('boardwalk', P[0][0], P[0][1], 3000).length, P.length - 1, 'a boardwalk for each leg');
  assert.ok(near('birdhide', site.hide.x, site.hide.y, 10).length === 1, 'the bird hide');
  const deck = near('viewdeck', site.x, site.y, 200)[0];
  assert.ok(deck, 'the viewing platform at the end');
  assert.ok(near('scope', deck.x, deck.y, 120).length && near('pbench', deck.x, deck.y, 120).length, 'the telescope and the bench on it');
  assert.ok(!m.land[m.idx(Math.floor(deck.x / TILE), Math.floor(deck.y / TILE))], 'the platform out over the water');
  assert.equal(near('canoe', P[0][0], P[0][1], 900).length, 2);
  // the canoe hire at the dock: kayaks waiting on the open water by the canoes, handed back there
  const R = m.rentals.find((q) => q.name === MARSH.hire), cn = near('canoe', P[0][0], P[0][1], 900)[0];
  assert.ok(R && B.hire >= 1 && R.models.includes('kayak') && m.pois.some((q) => q.id === R.poi && q.kind === 'rental'), `the canoe hire (${B.hire})`);
  // the Egret Marsh Paddle: from the kayaks out through the channels and back to the dock, gates on the open water
  const race = m.races.find((r) => r.name === MARSH.race.name);
  assert.ok(race && race.kind === 'kayak' && B.race && race.cps.length >= 5, `the paddle race (${JSON.stringify(B.race)})`);
  assert.ok(Math.hypot(race.start.x - R.spots[0].x, race.start.y - R.spots[0].y) < TILE && Math.hypot(race.cps[race.cps.length - 1].x - race.start.x, race.cps[race.cps.length - 1].y - race.start.y) < 8 * TILE, 'from the dock and back to it');
  for (const c of race.cps) assert.equal(m.tiles[m.idx(Math.floor(c.x / TILE), Math.floor(c.y / TILE))], T.WATER, `a gate on the water at ${c.x}, ${c.y}`);
  const farG = Math.max(...race.cps.map((c) => Math.hypot(c.x - race.start.x, c.y - race.start.y))) / TILE;
  assert.ok(farG > 30, `out across the marsh (${farG | 0} tiles at the furthest)`);
  assert.ok(m.pois.some((q) => q.kind === 'race' && q.label === race.name), 'on the map as a race');
  for (const sp of R.spots) assert.ok(m.tiles[m.idx(Math.floor(sp.x / TILE), Math.floor(sp.y / TILE))] === T.WATER && Math.hypot(sp.x - cn.x, sp.y - cn.y) < 8 * TILE, `a kayak waiting on the water by the dock at ${sp.x}, ${sp.y}`);
  // the legs' planks on the reed islands drawn as the marsh's ground under the boardwalk (m.walkways), and nothing else
  // on any of the planks
  assert.ok(m.walkways && m.walkways.every((i) => m.tiles[i] === T.DOCK), 'the walkways listed');
  // (over the water the planks are a deck: bridge tiles, the marsh's channels one water under them)
  let decks = 0; for (const [x, y] of P) if (tileAt(x, y) === T.BRIDGE) decks++;
  assert.ok(decks >= 1, 'the boardwalk out over the water on its deck');
  const OWN = new Set(['boardwalk', 'birdhide', 'viewdeck', 'scope', 'pbench', 'pier', 'canoe', 'lodge', 'lily', 'shrub_a', 'mapboard', 'fenceline']);
  const onDeck = m.props.filter((p) => !OWN.has(p.t) && Math.hypot(p.x - site.x, p.y - site.y) < 1200 && (tileAt(p.x, p.y) === T.DOCK || (tileAt(p.x, p.y) === T.BRIDGE && !m.land[m.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE))])));
  assert.equal(onDeck.length, 0, `nothing else on the planks (${onDeck.map((p) => p.t).join(', ')})`);
});
