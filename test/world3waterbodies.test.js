// World v3's inland water as bodies (shared/world3-waterbodies.js, the water upgrade of 2026-10-18), in the whole-world
// build: every channel is listed (the Long Reach and the creeks) with its kind and setting and runs downhill; Kestrel
// Lake, the lakes laid as wide pieces and the water dug on land are flagged lakes and ponds (Greenfield Pond and the
// Commons Pond ponds), never the sea; and the bake reads it - the creeks and rivers run, the lakes lie still, the sea
// off Sunset Beach is see-through over its sand. One world build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { STREAMS, RIVER } from '../shared/world3-skeleton.js';
import { LAKE_PIECES } from '../shared/world3-waterbodies.js';
import { KESTREL } from '../shared/world3-water.js';
import { bakeGround, CHUNK } from '../client/art2/game/groundbake.js';
import { F_GROUND, F_WATER, F_WET, F_NOCAST } from '../client/art2/gbuf.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: the water bodies - which water is which, which way it runs; the bake reads them', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, at = (x, y) => Math.round(y) * W + Math.round(x);
  const sum = m.world3.waterBodies;
  console.log('water bodies', JSON.stringify(sum));
  const V = m.waters;
  assert.ok(V && Array.isArray(V.ch) && Array.isArray(V.lk), 'm.waters: channels and lakes');
  assert.equal(V.ch.length, 1 + STREAMS.length, 'every channel: the Long Reach and each creek');
  // kinds and settings
  const kinds = new Set(V.ch.map((c) => c.k)), sets = new Set(V.ch.map((c) => c.t));
  for (const k of ['creek', 'river', 'marsh', 'lake']) assert.ok(kinds.has(k), `some ${k}`);
  for (const t of ['alpine', 'forest', 'valley', 'desert', 'marsh']) assert.ok(sets.has(t), `some water in the ${t} setting`);
  assert.equal(V.ch.filter((c) => c.k === 'lake').length, LAKE_PIECES.size, 'the wide pieces that are lakes');
  // the Long Reach runs from Kestrel Lake's outlet to the gulf
  const reach = V.ch[0], a = reach.pts[0], z = reach.pts[reach.pts.length - 1];
  assert.equal(reach.k, 'river');
  assert.ok(Math.hypot(a[0] - RIVER.pts[0][0], a[1] - RIVER.pts[0][1]) < 6 && Math.hypot(z[0] - 3956, z[1] - 1900) < 6, 'the Long Reach: lake to sea');
  // every channel that falls runs downhill (the relief at its ends, a 5 x 5 mean: dithered)
  const h = (p) => { let s = 0, n = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { s += m.relief[at(p[0] + dx, p[1] + dy)]; n++; } return s / n; };
  const up = V.ch.filter((c) => c.k !== 'lake' && h(c.pts[0]) - h(c.pts[c.pts.length - 1]) <= -2.5);
  assert.equal(up.length, 0, `no channel runs uphill: ${up.map((c) => c.pts[0].join(',')).join(' ')}`);
  assert.ok(V.ch.filter((c) => c.k !== 'lake').every((c) => c.v > 0), 'the channels run');
  // the lakes and ponds on their tiles
  let kestrel = 0, sea = 0;
  const [bx0, by0, bx1, by1] = KESTREL.belt;
  for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) if (m.lake[y * W + x] === 1) kestrel++;
  for (let i = 0; i < W * m.h; i++) {
    if (!m.lake[i]) continue;
    const t = m.tiles[i];
    if (t !== T.WATER && t !== T.DEEP && t !== T.BRIDGE && t !== T.DOCK) sea++;
  }
  assert.ok(kestrel > 20000, `Kestrel Lake a lake (${kestrel} tiles)`);
  assert.ok(sea <= 4, `nothing but water (and the piers over it) flagged a lake (${sea}: two of a nature site's own, built over its lake)`);
  for (const [x0, y0, x1, y1] of [[3040, 2452, 3140, 2516], [3007, 1860, 3035, 1874]]) {   // (Greenfield Pond; Midtown's Commons Pond)
    let n = 0, wet = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * W + x; if (m.tiles[i] === T.WATER || m.tiles[i] === T.DEEP) { wet++; if (m.lake[i] === 2) n++; } }
    assert.ok(wet > 50 && n > wet * 0.9, `a pond (${n} of ${wet} wet tiles)`);
  }
  // the bake: a creek runs, Kestrel Lake lies still, the sea off Sunset Beach is see-through
  const words = (cx, cy) => {
    const G = bakeGround(m, cx, cy, { quality: 1, seed: 1337 }), o = { run: 0, still: 0, seaClear: 0, sea: 0, bad: 0 };
    for (let i = 0; i < G.w * G.h; i++) {
      const f = G.flag[i];
      if (!(f & F_WATER) || !(f & F_GROUND) || (f & F_WET)) continue;
      const c = G.col[i * 4 + 3];
      if (f & F_NOCAST) { if (c >= 128 && c < 192) o.run++; else if (c >= 192 && c < 232) o.still++; else o.bad++; }
      else { o.sea++; if (c >= 239 && c < 255) o.seaClear++; else if (c < 191) o.bad++; }
    }
    return o;
  };
  const C = CHUNK / TILE, cw = (x, y) => words(Math.floor(x / C), Math.floor(y / C));
  const creek = cw(1806, 780), lake = cw(3330, 860), beach = cw(2850, 3270);
  console.log('bake words', JSON.stringify({ creek, lake, beach }));
  assert.ok(creek.run > 50000 && !creek.bad, `the creek runs (${creek.run} px)`);
  assert.ok(lake.still > 50000 && !lake.bad, `the lake lies still (${lake.still} px)`);
  assert.ok(beach.seaClear > 20000 && !beach.bad, `the sea off the beach is see-through (${beach.seaClear} px)`);
});
