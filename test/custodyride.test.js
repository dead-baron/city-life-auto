// The ride to the station, World v3 (the owner, 11-23: "police taking you in ... crash, ride the median, get stuck"; the
// heavy lock: one build): cuffed on five streets across the city, the car drives you to a station - no fade to black on
// the way, never up on a pavement or a lawn, nearer by road every few seconds. The roads empty (the traffic's own part is
// traffic's: test/trafficwalls, gridlock) - what's tested is the plan and the car: the way from the street it's on, the
// shortest by length, the time allowed by road (traffic.js planRoute, custody.js stationByRoad).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinPlayer, teleport } from './helpers.js';
import { World } from '../server/world.js';
import { buildWorld3 } from '../server/world3.js';
import { T, TILE } from '../shared/constants.js';
import { STAR_HEAT } from '../shared/rules.js';
import * as law from '../server/systems/law.js';
import * as custody from '../server/systems/custody.js';
import { spawnNpc } from '../server/systems/npc.js';

const { map: M } = await buildWorld3(1337, { log: () => {} });

test('World v3: taken in from five streets across the city, driven to the station every time - on the road, no fade', { timeout: 900000 }, () => {
  const spots = [[2644, 2001], [3185, 1901], [1681, 2001], [2989, 2655], [3681, 1963]];
  for (const [tx, ty] of spots) {
    const n = M.nearestNode(tx * TILE, ty * TILE);
    const w = new World(M, { npcBudget: 0, throwErrors: true });
    const { p } = joinPlayer(w);
    teleport(w, p.ped, n.x + 20, n.y + 20);
    law.addHeat(w, p, STAR_HEAT[1] + 2 - p.heat, p.ped.x, p.ped.y);
    const cop = spawnNpc(w, 'cop', p.ped.x + 20, p.ped.y, 'cop');
    p.ped.downUntil = w.time + 3;
    law.arrest(w, cop, p.ped);
    let fade = false, off = 0, ride = 0, end = null;
    for (let i = 0; i < 20 * 300 && !end; i++) {
      w.step();
      const c = p.custody;
      if (!c) { end = 'freed'; break; }
      if (c.stage === 'fade') fade = true;
      if (c.stage === 'walkin' || c.stage === 'cell') end = c.stage;
      if (c.stage !== 'ride') continue;
      const v = w.get(p.ped.vehId);
      if (!v) continue;
      ride++;
      const t = M.tileAtPx(v.x, v.y);
      if (t !== T.ROAD && t !== T.BRIDGE) off++;
    }
    const at = `from ${tx},${ty}`;
    assert.ok(end === 'walkin' || end === 'cell', `${at}: booked (${end})`);
    assert.ok(!fade, `${at}: driven there, no fade to black`);
    assert.ok(ride > 0, `${at}: a ride`);
    assert.ok(off / 20 <= 1.5, `${at}: on the road (${(off / 20).toFixed(1)} s off it)`);
    assert.equal(M.pois[p.custody.station].kind, 'police');
    const best = custody.stationByRoad && custody.stationByRoad(w, n.x, n.y);
    assert.ok(best && best.st.id === p.custody.station, `${at}: the station nearest by road`);
  }
});

// The plan from where a car is (traffic.js planRoute): along the street it's on to a junction - its first leg on the
// road, never straight across a pavement, a lawn or a block to a junction down the street (the ride above, cut short:
// the first waypoint was a junction 67 tiles off, straight across the pavement)
test('World v3: a route by road starts along the street the car is on - its first leg on the road', async () => {
  const { planRoute } = await import('../server/systems/traffic.js');
  const w = new World(M, { npcBudget: 0, throwErrors: true });
  const roads = [];
  for (const e of M.edges) if (e.lvl === 0 && e.len > 400 && !e.bridge) roads.push(e);
  let n = 0, bad = 0;
  const ex = [];
  for (let i = 0; i < 160; i++) {
    const e = roads[(i * 7919) % roads.length], q = e.pts[Math.floor(e.pts.length / 2)];
    const to = roads[(i * 104729 + 13) % roads.length].pts[0];
    const r = planRoute(w, q.x, q.y, to.x, to.y);
    if (r.length < 2) continue;
    n++;
    const a = r[0], L = Math.hypot(a.x - q.x, a.y - q.y), k = Math.ceil(L / 8);
    let off = 0;
    for (let j = 1; j < k; j++) { const t = M.tileAtPx(q.x + (a.x - q.x) * j / k, q.y + (a.y - q.y) * j / k); if (t !== T.ROAD && t !== T.BRIDGE) off++; }
    if (off > 2) { bad++; if (ex.length < 5) ex.push(`${Math.round(q.x / TILE)},${Math.round(q.y / TILE)}: first leg ${Math.round(L)} px, ${off} off the road`); }
  }
  assert.ok(n >= 120, `${n} routes`);
  assert.ok(bad <= n * 0.03, `${bad} of ${n} routes start across a pavement, a lawn or a block: ${ex.join('; ')}`);
});
