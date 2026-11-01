// The tropics by hand (shared/world3-tropic.js, the nature showcase 2026-10-31): Coral Cay's east lobe as the owner's
// NA1-E - the falls off the black-rock spine into the inner lagoon, the trails, the mangrove inlet and its stilt hut,
// the beach bar and the T-jetty, the islet, the wreck on the reef - and Macaw Cove (SC3-H) dug into its east shore.
// One World v3 build: each piece where it should be, the water swimmable and open to the sea where it should be, the
// rock solid, the trails clear of anything solid, the bar's counter and the jetty's boat there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { TROPIC3 } from '../shared/world3-tropic.js';
import { prepare } from '../tools/world3-build.mjs';

test('Coral Cay\'s east lobe and Macaw Cove, by hand after NA1-E and SC3-H', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const C = TROPIC3, out = m.world3.tropic;
  const at = (x, y) => m.idx(Math.floor(x), Math.floor(y));
  const sea = (x, y) => { const i = at(x, y); return (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) && !m.land[i]; };
  const solidNear = (x, y, r) => { for (const arr of m.solidProps.values()) for (const e of arr) if (Math.hypot(e.x - x * TILE, e.y - y * TILE) <= r) return true; return false; };
  assert.ok(out && out.rocks >= 20 && out.boulders >= 60 && out.palms >= 300 && out.trails === 6 && out.steps >= 2, `the scene laid (${JSON.stringify(out)})`);
  for (const n of ['Coral Cay Falls', 'The Inner Lagoon', 'Mangrove Inlet', 'The Lagoon Bar', 'Macaw Cove', 'Turtle Islet', 'Corsair Reef']) assert.ok(m.landmarks.some((l) => l.name === n), `${n} on the map`);
  // the falls: their rock solid behind them, the inner lagoon below them sea water (the reef's clear turquoise) you swim in
  const F = C.falls, site = m.natureSites.find((s) => s.kind === 'jfalls' && s.name === F.name);
  assert.ok(site, 'the falls');
  assert.ok(solidNear(F.x, F.y - 3, 20), 'the spine behind the falls is solid');
  assert.ok(sea(F.pool[0], F.pool[1]) && sea(F.pool[0] - 8, F.pool[1]) && sea(F.pool[0] + 8, F.pool[1]), 'the inner lagoon');
  let sand = 0; for (let x = F.pool[0] - 8; x <= F.pool[0] + 8; x++) for (let y = F.pool[1]; y < F.pool[1] + F.pool[3] + 4; y++) if (m.tiles[at(x, y)] === T.SAND) sand++;
  assert.ok(sand >= 12, `its beach (${sand} tiles of sand)`);
  // the trails: on the ground, nothing solid across them, the first four from the road
  const trails = m.props.length && C.trails;
  for (const [k, cp] of trails.entries()) for (const [x, y] of cp.slice(1, -1)) {
    const t = m.tiles[at(x, y)];
    assert.ok(t === T.DIRT || t === T.SAND || t === T.DOCK, `trail ${k} at ${x}, ${y} (${t})`);
    assert.ok(!solidNear(x + 0.5, y + 0.5, 12), `trail ${k} clear at ${x}, ${y}`);
  }
  // the beach bar: its counter, the jetty out over the water, the speedboat at its head
  const bar = m.pois.find((p) => p.label === C.bar.name);
  assert.ok(bar && bar.counter, 'the bar\'s counter');
  let dock = 0; for (let y = 3500; y < 3580; y++) if (m.tiles[at(C.jetty.x, y)] === T.DOCK) dock++;
  assert.ok(dock >= C.jetty.len, `the jetty (${dock} tiles)`);
  assert.ok(m.marina.some((b) => b.kind === 'speedboat' && Math.abs(b.x / TILE - C.jetty.x) < 10 && b.y / TILE > 3520), 'the speedboat at the jetty');
  // Macaw Cove: dug into the shore, open to the sea (a swimmer gets out of it eastward), its falls, its dock
  const [cx, cy] = C.cove.c;
  assert.ok(sea(cx, cy), 'the cove\'s water');
  const seen = new Set([at(cx, cy)]), q = [[cx, cy]];
  let open = false;   // (out past x 4500: where the shore ran before the cove was dug)
  for (let k = 0; k < q.length && !open && seen.size < 30000; k++) { const [x, y] = q[k]; if (x >= 4500) { open = true; break; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy, i = at(a, b); if (!seen.has(i) && sea(a, b)) { seen.add(i); q.push([a, b]); } } }
  assert.ok(open, 'the cove opens to the sea');
  assert.ok(m.natureSites.some((s) => s.kind === 'jfalls' && s.name === C.cove.falls), 'Macaw Falls');
  // the islet: land of Coral Cay's, a stilt house off it
  const [ix, iy] = C.islet.c;
  assert.ok(m.land[at(ix, iy)] && m.dist[at(ix, iy)] === 44, 'the islet');
  assert.ok(m.props.some((p) => p.t === 'stilthut' && Math.abs(p.x / TILE - ix) < 20 && Math.abs(p.y / TILE - iy) < 6), 'its stilt house');
  // the life: macaws, turtles, snorkelers, mangroves; the lodge's cabins still to rent
  for (const [t, n] of [['macaw', 8], ['turtle', 3], ['snorkeler', 3], ['mangrove', 12], ['ginger', 10]]) assert.ok(m.props.filter((p) => p.t === t).length >= n, `${t}s`);
  // the lodge's seven cabins, still to rent, one after another in the homes' order (the ids players own them by)
  const cabins = m.homes.filter((h) => h && /^Cabin \d, Coral Cay Eco Lodge$/.test(h.name));
  assert.equal(cabins.length, 7, 'the lodge\'s seven cabins');
  cabins.forEach((h, k) => { assert.equal(h.name, `Cabin ${k + 1}, Coral Cay Eco Lodge`); if (k) assert.equal(h.id, cabins[0].id + k, 'their ids in a row'); });
  if (process.env.CLA_CABIN0) assert.equal(cabins[0].id, +process.env.CLA_CABIN0, 'the first cabin\'s id as on main');
});
