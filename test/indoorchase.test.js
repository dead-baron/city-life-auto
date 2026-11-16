// Chasing someone inside a shop (the owner, 11-15: "Cops that came into the store couldn't get around the counter to catch
// me they got kind of stuck on the counter"): a walk-in's counter blocks people but not sight, so the straight line the
// foot chase took (npc.js footWay: m.los clear) ran them into it, and sidestep only slid them along it. footWay now walks
// round what stands in the room (npc.js roomWay: a search over the room's floor) - every walk-in with a way behind its
// counter is checked: an officer in front of the counter reaches someone behind it within a few seconds. And no dive
// across it (police.js: a dive needs the floor clear to them - npc.js clearWalk).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from './helpers.js';
import { T, TILE } from '../shared/constants.js';
import { pedStep } from '../shared/physics.js';

const { spawnNpc, footWay, seek, sidestep, clearWalk } = await import('../server/systems/npc.js');
const { copMods } = await import('../server/systems/police.js');

// every unit whose counter leaves a way round it (map.js buildInteriors: a gap at its far end, units 4 tiles wide and up)
function units(m) {
  const L = [];
  for (const bid of m.walkIns || []) {
    const b = m.buildings[bid], wi = b.walkIn;
    for (const u of wi.units) {
      let counter = 0, gap = 0;
      for (let tx = u.x0; tx <= u.x1; tx++) { if (m.tileAt(tx, u.counterRow) === T.COUNTER) counter++; else gap++; }
      if (counter && gap) L.push({ b, wi, u });
    }
  }
  return L;
}
// an officer chasing on foot as police.js does (footWay, seek, sidestep, pedStep) -> seconds to reach t, or Infinity
function chase(w, c, t, secs, way = true) {
  const dt = 0.05;
  for (let i = 0; i < secs / dt; i++) {
    if (Math.hypot(t.x - c.x, t.y - c.y) < 30) return i * dt;
    const wp = way ? footWay(w, c, t.x, t.y) : { x: t.x, y: t.y };
    pedStep(c, sidestep(w, c, seek(c, wp.x, wp.y, true), dt), dt, w.map, copMods(w, c, 1));
    w.time += dt;
  }
  return Infinity;
}

test('an officer in a shop gets round the counter to whoever is behind it, in every walk-in with a way round', () => {
  const w = makeWorld();
  const m = w.map, all = units(m);
  assert.ok(all.length > 20, `walk-ins with a counter and a way round it (${all.length})`);
  const slow = [];
  let straightStuck = 0;
  for (const { wi, u } of all) {
    const s = wi.south ? 1 : -1;
    const front = { x: (u.x0 + u.x1 + 1) / 2 * TILE - 2 * TILE, y: (u.counterRow + s * 1.5) * TILE };   // (on the shop's side, off to one end)
    const behind = { x: u.clerk.x + TILE, y: u.clerk.y };   // (beside the clerk, behind the counter)
    if (m.tileAtPx(front.x, front.y) !== T.FLOOR || m.tileAtPx(behind.x, behind.y) !== T.FLOOR) continue;
    const t = { x: behind.x, y: behind.y };
    const c = spawnNpc(w, 'cop', front.x, front.y, 'cop');
    const secs = chase(w, c, t, 8);
    if (!(secs < 6)) slow.push(`${u.kind} at ${Math.round(u.x0)}, ${u.counterRow} (${secs})`);
    // the same without the way round: straight at them, into the counter (what the owner saw)
    const c2 = spawnNpc(w, 'cop', front.x, front.y, 'cop');
    if (!(chase(w, c2, t, 6, false) < 6)) straightStuck++;
    w.remove(c); w.remove(c2);
  }
  assert.equal(slow.length, 0, `stuck at the counter: ${slow.slice(0, 8).join('; ')}`);
  assert.ok(straightStuck > 5, `the straight line does get stuck (${straightStuck}) - the check checks something`);
});

test('no dive across a counter: the floor to them is not clear', () => {
  const w = makeWorld();
  const { u, wi } = units(w.map)[0];
  const s = wi.south ? 1 : -1, x = u.clerk.x;
  assert.ok(!clearWalk(w.map, x, (u.counterRow + s * 1.5) * TILE, x, u.clerk.y), 'over the counter: not clear');
  assert.ok(clearWalk(w.map, x, (u.counterRow + s * 1.5) * TILE, x, (u.counterRow + s * 2.5) * TILE), 'along the shop floor: clear');
});
