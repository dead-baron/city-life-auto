// The coasts by hand, part 1 (shared/world3-coast.js): North Cape's tidepool shelf - its rock out into the sea, the
// pools in it (closed, clear, alive), the golden stars, the blowhole and its spout, the seal rock; Redwood Cove dug back
// into the woods, its beach, its horn's tidepools and the path down. One World v3 build (and the blowhole's spout on
// a stand-in world).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { COAST3 } from '../shared/world3-coast.js';
import { habitatAt } from '../server/systems/fishing.js';
import { blowholes, BLOWHOLE } from '../server/systems/props.js';
import { biteTable, POINT } from '../shared/fish.js';
import { prepare } from '../tools/world3-build.mjs';

test('a blowhole spouts every few seconds when someone is near, not for nobody', () => {
  const events = [], hole = { kind: 'blowhole', name: 'Test blowhole', x: 1000, y: 1000 };
  let r = 0.37;
  const world = { tick: 3, time: 0, rand: () => (r = (r * 7.31 + 0.13) % 1), map: { natureSites: [hole] }, players: new Map(), emit: (x, y, ev) => events.push(ev) };
  const run = (secs) => { for (let k = 0; k < secs * 2; k++) { world.time += 0.5; world.tick = 3; blowholes(world); } };
  run(60);
  assert.equal(events.length, 0, 'nobody near: no spout');
  world.players.set(1, { ped: { x: 1200, y: 900 } });
  run(60);
  assert.ok(events.length >= 60 / BLOWHOLE.every[1] && events.length <= 60 / BLOWHOLE.gap + 1, `spouts in a minute (${events.length})`);
  assert.ok(events.every((e) => e.e === 'geyser' && e.x === 1000 && e.y === 1000 && e.d === BLOWHOLE.burst), 'the spray at the hole');
  world.players.set(1, { ped: { x: 1000 + BLOWHOLE.near + 400, y: 1000 } });
  const n = events.length;
  run(60);
  assert.equal(events.length, n, 'out of sight: no spout');
});

test('a rock fishing point: the stripers, the redfish and the flounder likelier, the rest as on the shore', () => {
  const shore = new Map(biteTable({ water: 'shore', spot: null }).map(([f, w]) => [f.id, w]));
  const point = new Map(biteTable({ water: 'shore', spot: 'point' }).map(([f, w]) => [f.id, w]));
  for (const [id, w] of point) {
    const f = biteTable({ water: 'shore', spot: 'point' }).find(([g]) => g.id === id)[0];
    if (POINT.shapes.includes(f.shape)) assert.ok(w > shore.get(id), `${id} likelier off the rocks`);
    else assert.equal(w, shore.get(id), `${id} as on the shore`);
  }
  assert.ok(['stripedbass', 'redfish', 'flounder'].every((id) => point.get(id) > shore.get(id)));
});

test('World v3: North Cape\'s tidepool shelf and blowhole, Redwood Cove dug back into the woods with its horn\'s pools', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const C = m.world3.coast, W = m.w;
  console.log('coast', JSON.stringify(C, (k, v) => (k === 'pools' ? v.length : v)));
  const at = (x, y) => y * W + x;
  const rock = (x, y) => m.tiles[at(x, y)] === T.SAND && (m.reserve[at(x, y)] & 192) === 192;
  const sea = (x, y) => { const i = at(x, y); return (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && !m.land[i]; };
  const pool = (x, y) => { const i = at(x, y); return m.tiles[i] === T.WATER && m.land[i] && (m.reserve[i] & 64) && !m.lake[i]; };
  const near = (t, x, y, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - x, p.y - y) < r);
  // a shelf: its rock, its pools - each closed in by rock (never open to the sea), small, with life in it - and its stars
  const shelfOk = (S, R, minPools) => {
    let n = 0;
    for (let y = S.rows[0]; y <= S.rows[1]; y++) for (let x = S.from - 60; x <= S.from; x++) if (rock(x, y)) n++;
    assert.ok(n >= 120 && R.rock >= 120, `${S.name}: its rock (${n} tiles)`);
    assert.ok(R.pools.length >= minPools, `${S.name}: ${R.pools.length} pools`);
    const seen = new Set();
    let alive = 0, stars = 0;
    for (let y = S.rows[0] - 1; y <= S.rows[1] + 1; y++) for (let x = S.from - 60; x <= S.from; x++) {
      if (!pool(x, y) || seen.has(at(x, y))) continue;
      const q = [[x, y]], tiles = [];
      seen.add(at(x, y));
      while (q.length) {
        const [a, b] = q.pop();
        tiles.push([a, b]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = a + dx, Y = b + dy;
          assert.ok(!sea(X, Y), `${S.name}: the pool at ${x},${y} is closed in`);
          if (pool(X, Y) && !seen.has(at(X, Y))) { seen.add(at(X, Y)); q.push([X, Y]); }
        }
      }
      assert.ok(tiles.length <= 16, `${S.name}: the pool at ${x},${y} is small (${tiles.length})`);
      const cx = (tiles.reduce((s, t) => s + t[0], 0) / tiles.length + 0.5) * TILE, cy = (tiles.reduce((s, t) => s + t[1], 0) / tiles.length + 0.5) * TILE;
      if (['starfish', 'urchin', 'anemone'].some((t) => near(t, cx, cy, 2.5 * TILE).length)) alive++;
      assert.deepEqual(habitatAt({ map: m }, cx, cy), { water: 'shore', spot: 'tidepool' }, `${S.name}: a tidepool fishes as the shore`);
    }
    assert.ok(alive >= minPools - 1, `${S.name}: life in the pools (${alive})`);
    for (const f of m.forage || []) { const fx = Math.floor(f.x / TILE), fy = Math.floor(f.y / TILE); if (f.k === 'goldStar' && fx >= S.from - 60 && fx <= S.from && fy >= S.rows[0] && fy <= S.rows[1]) { stars++; assert.ok(pool(fx, fy) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => pool(fx + dx, fy + dy)), `${S.name}: a golden star in a pool`); } }
    assert.equal(stars, S.stars, `${S.name}: the golden stars`);
    const site = m.natureSites.find((s) => s.kind === 'tidepools' && s.name === S.name);
    assert.ok(site && site.pools === R.pools.length, `${S.name}: a nature site`);
  };
  // North Cape
  shelfOk(COAST3.cape, C.cape, 6);
  const bh = m.natureSites.find((s) => s.kind === 'blowhole');
  assert.ok(bh && near('blowhole', bh.x, bh.y, 4).length === 1, 'the blowhole');
  const [bx, by] = C.cape.blowhole;
  assert.ok(rock(bx, by) && sea(bx - 1, by), 'the blowhole on the shelf\'s seaward lip');
  const [sx, sy] = C.cape.sealrock;
  assert.ok(sea(sx, sy) && near('sealrock', (sx + 0.5) * TILE, (sy + 0.5) * TILE, 8).length === 1 && near('seal', (sx + 0.5) * TILE, (sy + 0.5) * TILE, 60).length >= 2, 'the seal rock and its seals, out in the sea');
  assert.ok(m.landmarks.some((l) => l.name === 'North Cape Light') && m.buildings.some((b) => b && b.name === 'North Cape Light'), 'the light still stands');
  // Redwood Cove: the shore bitten back, sand round it, no tree on the sand or in the water, the path down
  const V = COAST3.cove, xs = [];
  for (let y = V.rows[0]; y <= V.rows[1]; y++) { let x = V.from; while (x > V.from - 60 && !sea(x, y)) x--; xs.push(x + 1); }
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 10 && C.cove.dug > 250, `the cove bitten back into the woods (${Math.max(...xs) - Math.min(...xs)} tiles, ${C.cove.dug} dug)`);
  let sand = 0;
  xs.forEach((x, k) => { const y = V.rows[0] + k; for (let j = 0; j < 4; j++) if (m.tiles[at(x + j, y)] === T.SAND || rock(x + j, y)) sand++; });
  assert.ok(sand >= xs.length * 4 * 0.9, `its beach all round (${sand} of ${xs.length * 4})`);
  const trees = m.props.filter((p) => p && /^(tree_|redwood)/.test(p.t) && p.y / TILE >= V.rows[0] && p.y / TILE <= V.rows[1] && p.x / TILE >= Math.min(...xs) - 4 && p.x / TILE <= Math.max(...xs) + 3);
  assert.equal(trees.filter((p) => { const i = at(Math.floor(p.x / TILE), Math.floor(p.y / TILE)); return m.tiles[i] === T.SAND || m.tiles[i] === T.WATER; }).length, 0, 'no tree on the sand or in the water');
  shelfOk(V.horn, C.cove.shelf, 4);
  assert.ok(C.cove.path >= 6, `the path down from the trail (${C.cove.path})`);
  // the caves' sea cave and the cove's fire ring are as they were
  assert.ok(m.natureSites.some((s) => s.kind === 'cavemouth' && /Redwood Cove/.test(s.where || '')), 'the sea cave');
  assert.ok(near('campfire', (V.path.from[0] - 18) * TILE, (V.path.from[1] + 2) * TILE, 8 * TILE).length >= 1, 'the cove\'s fire ring');
  // part 2: the rock fishing points (an angler's rods on each, the wash off them fishing as the point), North Cape's
  // cliff path with its fence and telescope
  const pts = m.natureSites.filter((s) => s.kind === 'fishpoint');
  assert.equal(pts.length, 2, 'two fishing points');
  for (const s of pts) {
    assert.ok(rock(Math.floor(s.x / TILE), Math.floor(s.y / TILE)), `${s.name}: on the rock`);
    assert.ok(near('rods', s.x, s.y, 2 * TILE).length === 1, `${s.name}: the rods`);
    let cast = null; for (let k = 2; k < 8 && !cast; k++) if (sea(Math.floor(s.x / TILE) - k, Math.floor(s.y / TILE))) cast = [s.x - k * TILE, s.y];
    assert.ok(cast, `${s.name}: the sea off it`);
    assert.deepEqual(habitatAt({ map: m }, cast[0], cast[1]), { water: 'shore', spot: 'point' }, `${s.name}: the wash off it fishes as the point`);
  }
  assert.ok(C.capeTop.fence >= 6 && C.capeTop.scope, `North Cape's cliff path: its fence (${C.capeTop.fence}) and telescope`);
  assert.ok(near('scope', bh.x, bh.y, 40 * TILE).length >= 1, 'the telescope over the shelf');
  let bare = 0;
  for (const [x0, y0, x1, y1] of COAST3.rubble) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = at(x, y); if (m.tiles[i] === T.WALL && !(m.reserve[i] & 32) && m.dist[i] >= 47 && m.dist[i] <= 54) bare++; }
  assert.ok(C.rubble >= 200 && bare === 0, `the cliff bands' bare rock drawn as rubble (${C.rubble}, ${bare} left)`);
});
