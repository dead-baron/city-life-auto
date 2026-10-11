// World v3, 8.13.2 (H40): the first mainland towns' own models in the whole-world build - each town's buildings drawn
// as its own (b.look: Timber Bend's wooden shopfronts, cabins, sawmill, lodge row, small-town clinic, sheriff and motel;
// Willow Crossing's white church, grain elevator with its silos, co-op with its loading dock, feed store and
// farmhouses; Sandpiper Bay's surf shop row, cottages and houses on stilts), the planned places moved into them, what
// stands round them (m.townKit: porches, the log yard, the saw line, silos, the steeple, the dock, the boards) and
// Sandpiper Bay's boardwalk and pier dressed (rails, benches, lamps, the shelter, a lifeguard tower); nothing solid on
// a road. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { TILE, T } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { TOWNS3, TOWN_SPECIALS } from '../shared/world3-towns.js';
import { prepare } from '../tools/world3-build.mjs';

const WANT = {
  timber: { looks: ['sawmill', 'clinic', 'sheriff', 'motel', 'lodgerow', 'shopfront', 'cabin'], kit: { logs: 3, loader: 1, saw: 1, porch: 4, antlers: 1 } },
  willow: { looks: ['church', 'elevator', 'coop', 'feedrow', 'clinic', 'sheriff', 'shopfront', 'farmhouse'], kit: { steeple: 1, silos: 1, dock: 1, sacks: 1, porch: 4 } },
  sandpiper: { looks: ['surfrow', 'clinic', 'beachshop', 'cottage', 'stilts'], kit: { boards: 1, rail: 10, bench: 3, lamp: 4, shelter: 1, porch: 4, tower: 1 } },
};

test('World v3: the towns\' own models - the planned places in them, the yards, the boardwalk and the pier dressed, nothing solid on a road', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, tileAt = (x, y) => m.tiles[Math.floor(y / TILE) * W + Math.floor(x / TILE)], distAt = (x, y) => m.dist[Math.floor(y / TILE) * W + Math.floor(x / TILE)];
  const bad = [], check = (ok, msg) => { if (!ok) bad.push(msg); };
  const models = m.world3.towns.models;
  console.log('models', JSON.stringify(models));
  assert.equal(models.length, TOWNS3.length);
  for (const t of TOWNS3) {
    const got = models.find((q) => q.key === t.key), want = WANT[t.key];
    for (const L of want.looks) check((got.looks[L] || 0) >= 1, `${t.name}: no ${L}`);
    for (const [k, n] of Object.entries(want.kit)) check((got.kit[k] || 0) >= n, `${t.name}: ${got.kit[k] || 0} ${k} (want ${n} or more)`);
    // every planned place with a look is in its model, in its town: the building, its lot and its POI
    for (const sp of TOWN_SPECIALS.filter((s) => s.d === t.d && s.look)) {
      const b = m.buildings.find((q) => q && q.name === sp.names[0] && m.dist[(q.ty + (q.th >> 1)) * W + q.tx + (q.tw >> 1)] === t.d);
      check(b && b.look === sp.look && m.prefabs[b.prefab].look === sp.look, `${sp.names[0]}: not in its ${sp.look}`);
      check(m.pois.some((p) => p && p.label === sp.names[0] && p.b === b?.id), `${sp.names[0]}: no POI`);
    }
    // a sawmill's and an elevator's yard stands inside its footprint, east of the shed or the head house
    for (const b of m.buildings) {
      if (!b || !b.lookW || m.dist[(b.ty + (b.th >> 1)) * W + b.tx + (b.tw >> 1)] !== t.d) continue;
      const yard = m.townKit.filter((k) => (k.k === 'logs' || k.k === 'silos') && k.x > (b.tx + b.lookW) * TILE && k.x < (b.tx + b.tw) * TILE && k.y > b.ty * TILE && k.y < (b.ty + b.th) * TILE);
      check(yard.length >= 1 && b.lookW < b.tw, `${b.name}: its yard not in its footprint`);
    }
  }
  // nothing solid on a road: the kit's solids (the saw line), the town's lifeguard tower; and no kit item on a road
  // but the boardwalk's and the pier's on their planks
  let onRoad = 0;
  for (const k of m.townKit) {
    const tl = tileAt(k.x, k.y);
    if (k.s) check(tl !== T.ROAD && tl !== T.BRIDGE, `a solid ${k.k} on a road at ${k.x},${k.y}`);
    if (tl === T.ROAD || tl === T.BRIDGE) onRoad++;
    if (k.k === 'rail' || k.k === 'bench' || k.k === 'shelter') check(tl === T.DOCK || tl === T.SAND || tl === T.WATER || tl === T.DEEP, `the boardwalk's ${k.k} off its planks at ${k.x},${k.y} (tile ${tl})`);
  }
  check(onRoad === 0, `${onRoad} town models on a road`);
  const towers = (m.lifeguards || []).filter((q) => q.town);
  check(towers.length === 1, `${towers.length} lifeguard station towers`);
  for (const q of towers) check(tileAt(q.x, q.y) === T.SAND, `the lifeguard station's tower off the sand at ${q.x},${q.y}`);
  // (the kit stands in its town)
  for (const k of m.townKit) check(TOWNS3.some((t) => Math.abs(distAt(k.x, k.y) - t.d) === 0) || tileAt(k.x, k.y) === T.DOCK || tileAt(k.x, k.y) === T.SAND || tileAt(k.x, k.y) === T.SIDEWALK, `a ${k.k} outside the towns at ${k.x},${k.y}`);
  assert.deepEqual(bad, []);
});
