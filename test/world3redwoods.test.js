// The redwoods by hand (shared/world3-redwoods.js; the owner's concepts NR1-E, N2-A, N1-A): Redwood Creek Falls off its
// basalt columns into its pool, the Hidden Pool fern glade, the Giants Loop's creek and footbridge - each where it should
// be, open where you walk and solid where the rock and the trunks stand - and the kit spread over the woods' other
// falls, glades and trails. Also the kit's art: every piece draws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { REDWOODS3 } from '../shared/world3-redwoods.js';
import { prepare } from '../tools/world3-build.mjs';
import * as RK from '../client/art2/props-redwoods.js';

test('the redwoods\' kit art: the columns, the column falls, the forest floor all draw', () => {
  const opaque = (G) => { let n = 0; for (let i = 3; i < G.col.length; i += 4) if (G.col[i] === 255) n++; return n; };
  const cols = RK.basaltCols(120, 56, 90, 3, { wet: 1 });
  assert.ok(cols.v.some((v) => v), 'the columns have voxels');
  const fall = RK.columnFall({ w: 96, drop: 90, side: 60, seed: 7 });
  assert.ok(opaque(fall) > 5000, `the falls drawn (${opaque(fall)} px)`);
  for (const k of ['agaric', 'shelf', 'glow']) assert.ok(RK.fungi(k, 1).v.some((v) => v), k);
  assert.ok(RK.puddle(40, 22, 1).v.some((v) => v));
  assert.ok(RK.mist(120, 50, 1).col.some((v) => v), 'mist');
  assert.ok(RK.ray(60, 200, 1).col.some((v) => v), 'a shaft of sun');
});

test('World v3: Redwood Creek Falls, Hidden Pool and the Giants Loop by hand; the kit spread through Highland Woods', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const R = m.world3.redwoods;
  const tAt = (x, y) => m.tiles[m.idx(Math.floor(x / TILE), Math.floor(y / TILE))];
  const wet = (x, y) => tAt(x, y) === T.WATER || tAt(x, y) === T.DEEP;
  const solidAt = (x, y) => { for (const arr of m.solidProps.values()) for (const e of arr) if (Math.hypot(e.x - x, e.y - y) < e.r) return true; return false; };
  const near = (pred, x, y, r) => m.props.filter((p) => p && pred(p) && Math.hypot(p.x - x, p.y - y) < r);
  // the falls: off the columns, into its pool; the walls solid; the cave's way in, the deck and the camp open
  const cr = m.natureSites.find((s) => s.kind === 'creek' && s.name === 'Redwood Creek');
  assert.ok(R.falls && cr.bowl, 'the falls rebuilt');
  const F = cr.falls;
  assert.ok(F.w >= 120 && F.drop >= 120, `a big curtain (${F.w} x ${F.drop})`);
  assert.equal(near((p) => p.t === 'rk' && p.k === 'fall', F.x, F.y, 60).length, 1, 'the column falls');
  assert.ok(near((p) => p.t === 'rk' && p.k === 'cols', F.x, F.y + 100, 520).length >= 7, 'the columns round it: the back wall and the arms');
  assert.ok(R.falls.pool > 40, `the pool (${R.falls.pool} tiles)`);
  assert.ok(wet(F.x + 30, F.y + 110) && wet(F.x - 100, F.y + 120) && wet(F.x + 150, F.y + 150), 'the pool under the falls');
  assert.ok(solidAt(F.x - 120, F.y - 14) && solidAt(F.x + 120, F.y - 14), 'the lip\'s rock is solid');
  for (const c of near((p) => p.t === 'rk' && p.k === 'cols', F.x, F.y + 100, 520)) assert.ok(solidAt(c.x, c.y - 12), `the columns at ${c.x},${c.y} are solid`);
  const cave = m.natureSites.find((s) => s.kind === 'cavemouth' && s.where === 'Redwood Creek Falls');
  assert.ok(near((p) => p.t === 'cavemouth', cave.x, cave.y, 40).length === 1, 'the Redwood Caverns\' mouth stays');
  assert.ok(!solidAt(cave.x + 4, cave.y + 60) && !wet(cave.x + 4, cave.y + 60), 'its way out is open ground');
  const [dx, dy] = R.falls.deck;
  assert.ok(near((p) => p.t === 'viewdeck', dx, dy, 20).length === 1 && !solidAt(dx, dy) && !wet(dx, dy), 'the viewing deck stands, open');
  assert.ok(near((p) => p.t === 'campfire', R.falls.camp[0], R.falls.camp[1], 40).length === 1 && !solidAt(R.falls.camp[0], R.falls.camp[1] + 60), 'the camp moved east of the falls');
  assert.ok(near((p) => p.t === 'logsteps', F.x - 450, F.y - 60, 360).length >= 3, 'the switchback\'s timber steps');
  assert.ok(m.natureSites.some((s) => s.kind === 'trapper' && near((p) => p.t === 'cottage', s.x, s.y, 200).length), 'the trapper\'s cabin stays');
  // Hidden Pool: the glade's fungi along its log, puddles, the little falls, stepping stones you can walk
  const hp = m.natureSites.find((s) => s.kind === 'glade' && s.name === 'Hidden Pool');
  assert.ok(R.glade && R.glade.pool > 8, 'Hidden Pool\'s pool');
  assert.ok(near((p) => p.t === 'rk' && p.k === 'fungi', hp.x, hp.y, hp.r + 60).length >= 6, 'the fungi on the mossy log');
  assert.ok(near((p) => p.t === 'rk' && p.k === 'puddle', hp.x, hp.y, hp.r + 60).length >= 2, 'puddles on the floor');
  const stones = near((p) => p.t === 'rk' && p.k === 'stone', hp.pool.x, hp.pool.y, 220);
  assert.ok(stones.length >= 4 && stones.filter((s) => tAt(s.x, s.y - 6) === T.BRIDGE).length >= 3, 'stepping stones across the pool, walkable');
  assert.ok(near((p) => p.t === 'rk' && p.k === 'fall', hp.pool.x, hp.pool.y - 30, 80).length === 1, 'its little falls');
  const PATCH = new Set(['goldTrumpet', 'bunCap', 'shelfOyster', 'redcap', 'berries', 'herbs']);
  assert.ok((m.forage || []).filter((f) => PATCH.has(f.k) && Math.hypot(f.x - hp.x, f.y - hp.y) < hp.r + 80).length >= 5, 'the forager\'s round: mushrooms and berries to pick (server/systems/wildfolk.js foragers)');
  // the Giants Loop: the giants along it, the creek and its footbridge
  const gl = R.loop;
  assert.ok(gl && gl.giants >= 6, `the giants along the loop (${gl && gl.giants})`);
  assert.ok(gl.creek > 10 && gl.bridge, 'the creek and its footbridge');
  assert.equal(tAt(gl.bridge.x, gl.bridge.y), T.BRIDGE, 'the footbridge walkable over the water');
  assert.ok(near((p) => p.t === 'fbridge', gl.bridge.x, gl.bridge.y, 10).length === 1, 'the plank footbridge drawn');
  for (const p of near((q) => q.t === 'redwood', gl.bridge.x, gl.bridge.y, 900)) assert.ok(!(Math.abs(p.x - gl.bridge.x) < 200 && p.y > gl.bridge.y && p.y < gl.bridge.y + 600), 'no giant hides the footbridge');
  // the kit spread: the ledge falls' columns, the glades, the trails
  assert.ok(R.ledges.filter(([, n]) => n > 0).length >= 3, `columns at the ledge falls (${JSON.stringify(R.ledges)})`);
  assert.equal(R.glades.length, REDWOODS3.glades.length, 'the other glades dressed');
  assert.ok(R.trails.length === REDWOODS3.trails.length && R.trails.every(([, f]) => f > 5), `the trails' edges (${JSON.stringify(R.trails)})`);
  for (const p of m.props) if (p && p.t === 'rk' && p.k === 'cols') assert.ok(!wet(p.x, p.y - 12), `columns on dry ground (${p.x},${p.y})`);
});
