// The woods' and the meadows' found places (shared/world3-wayside.js; the art pass, 2026-11-24; concepts NS1-B and
// NS1-E): ruins, an oak with a bench, a fire ring and a mossy log in Highland Woods' pine and oak; a dry-stone wall with
// its gate or a stile, an oak with a swing, beehives by sunflowers, a windmill and its trough in Willow Valley's
// meadows. World v3 as the server builds it (one build: the heavy lock). Each find: on open ground of its own, clear of
// every road, water, building, field, orchard and made place; its pieces there; what should stop you solid; nothing
// tall left standing in front of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld3 } from '../server/world3.js';
import { TILE, T } from '../shared/constants.js';
import { WAYSIDE } from '../shared/world3-wayside.js';
import { FLORA_SPECIES } from '../client/art2/game/statics.js';

const { map: m } = await buildWorld3(1337, { log: () => {} });
const finds = (m.natureSites || []).filter((s) => s.kind === 'wayside');
const near = (f, t, r) => m.props.filter((p) => p && p.t === t && Math.abs(p.x - f.x) < r && Math.abs(p.y - f.y) < r);
const solidsIn = (x0, y0, x1, y1) => { let n = 0; for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) for (const e of m.solidProps.get(m.idx(tx, ty)) || []) if (e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) n++; return n; };

test('the found places: enough of each kind, in their own districts, apart from each other', () => {
  const by = {};
  for (const f of finds) by[f.type] = (by[f.type] || 0) + 1;
  console.log('found places', finds.length, JSON.stringify(by));
  assert.ok(finds.length >= 28, `found places in the world (${finds.length})`);
  for (const [d, D] of Object.entries(WAYSIDE.by)) {
    const mine = finds.filter((f) => f.d === +d);
    assert.ok(mine.length >= D.n * 0.75, `district ${d}: ${mine.length} of ${D.n}`);
    for (const k of D.kinds) assert.ok(mine.filter((f) => f.type === k).length >= 2, `district ${d}: ${k} more than once`);
  }
  for (let i = 0; i < finds.length; i++) for (let j = i + 1; j < finds.length; j++) assert.ok(Math.hypot(finds[i].x - finds[j].x, finds[i].y - finds[j].y) >= WAYSIDE.apart * TILE - TILE, 'two finds apart');
});

test('each find: open ground of its own, clear of roads, water, buildings, fields, orchards and made places', () => {
  const HARD = new Set([T.ROAD, T.BRIDGE, T.LOT, T.BUILDING, T.WALL, T.WATER, T.DEEP, T.SIDEWALK, T.PLAZA, T.DOCK, T.FIELD]), R = WAYSIDE.R;
  for (const f of finds) {
    const tx = Math.floor(f.x / TILE), ty = Math.floor(f.y / TILE), at = `${f.type} at ${tx}, ${ty}`;
    for (let dy = -R - 3; dy <= R + 3; dy++) for (let dx = -R - 3; dx <= R + 3; dx++) {
      const i = m.idx(tx + dx, ty + dy), t = m.tiles[i];
      assert.ok(!HARD.has(t), `${at}: nothing hard within ${R + 3} tiles (${dx}, ${dy}: tile ${t})`);
      if (Math.abs(dx) <= R && Math.abs(dy) <= R) assert.ok((t === T.GRASS || t === T.DIRT) && m.dist[i] === f.d, `${at}: its own ground`);
    }
    for (const o of m.orchards || []) assert.ok(f.x < o.x - R * TILE || f.x > o.x + o.w + R * TILE || f.y < o.y - R * TILE || f.y > o.y + o.h + R * TILE, `${at}: off the orchards and the crop rows`);
    for (const s of m.natureSites || []) if (s !== f && s.kind !== 'trail' && s.kind !== 'wayside' && Number.isFinite(s.x)) assert.ok(Math.hypot(s.x - f.x, s.y - f.y) > 12 * TILE, `${at}: off ${s.kind} ${s.name || ''}`);
    // (nothing tall just south of it: in this view it would stand in front)
    const front = m.props.filter((p) => p && /^(tree_|redwood)/.test(p.t) && p.sp !== 'sapling' && Math.abs(p.x - f.x) < R * TILE && p.y > f.y + 2 * TILE && p.y < f.y + 8 * TILE);
    assert.equal(front.length, 0, `${at}: no tree standing in front of it`);
  }
});

test('each find has its pieces, and what should stop you is solid', () => {
  for (const f of finds) {
    const at = `${f.type} at ${Math.floor(f.x / TILE)}, ${Math.floor(f.y / TILE)}`, R = 5 * TILE;
    const has = (t, n = 1) => assert.ok(near(f, t, R).length >= n, `${at}: ${n} x ${t}`);
    switch (f.type) {
      case 'ruins': has('ruins'); assert.ok(solidsIn(f.x - 70, f.y - 66, f.x + 60, f.y + 30) >= 11, `${at}: its walls solid`); break;
      case 'oakbench': has('pbench'); has('fingerpost'); assert.ok(near(f, 'tree_b', R).some((p) => p.sp === 'oak'), `${at}: the oak`); break;
      case 'firering': has('campfire'); has('log', 3); has('boulder', 3); break;
      case 'mushlog': has('log'); assert.ok((m.forage || []).filter((q) => q.wayside && Math.abs(q.x - f.x) < R && Math.abs(q.y - f.y) < R).length >= 1, `${at}: its mushrooms`); break;
      case 'drywall': has('drywall', 2); has('fgate'); assert.ok(solidsIn(f.x - 4 * TILE, f.y - 12, f.x + 4 * TILE, f.y + 12) >= 12, `${at}: the wall and its gate solid`); break;
      case 'stilewall': has('drywall', 2); has('stile'); assert.equal(solidsIn(f.x - 14, f.y - 12, f.x + 14, f.y + 12), 0, `${at}: the stile is the way through`); break;
      case 'oakswing': has('rswing'); assert.ok(near(f, 'tree_b', R).some((p) => p.sp === 'oak'), `${at}: the oak`); break;
      case 'apiary': has('beehive', 3); assert.ok(near(f, 'flowers_a', R).filter((p) => p.sp === 'sunflowers').length >= 3, `${at}: the sunflowers`); break;
      case 'windpump': has('windmill'); has('trough'); break;
      default: assert.fail(`${at}: a kind the test doesn't know`);
    }
    // (every plant a find sets is a species the art knows)
    for (const p of m.props) if (p && p.sp && Math.abs(p.x - f.x) < R && Math.abs(p.y - f.y) < R) assert.ok(FLORA_SPECIES.includes(p.sp), `${at}: ${p.t} of species ${p.sp}`);
  }
});
