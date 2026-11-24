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
import { WaterLife, POCKET } from '../client/art2/game/waterlife.js';
import { seaFields, WK } from '../client/art2/water.js';

test('World v3: the water bodies - which water is which, which way it runs; the bake reads them', { timeout: 300000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const W = m.w, at = (x, y) => Math.round(y) * W + Math.round(x);
  const sum = m.world3.waterBodies;
  console.log('water bodies', JSON.stringify(sum));
  const V = m.waters;
  assert.ok(V && Array.isArray(V.ch) && Array.isArray(V.lk), 'm.waters: channels and lakes');
  assert.equal(V.ch.filter((c) => !c.hand).length, 1 + STREAMS.length, 'every channel: the Long Reach and each creek (and the hand-laid runs: shared/world3-redwoods.js channel)');
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

  // The sea's bed falls away without a ruled line (the water pass, 11-24): its slope was the one nearest land tile's -
  // 0.22 off sand, 0.55 off rock, 1.4 off a quay - and stepped where that changed kind, a dark rectangle off the surf
  // beach. Between neighbouring sea tiles four tiles out and more, the slope now never steps (water.js coastSlopes).
  let step = 0, pairs = 0;
  for (const [tx, ty] of [[2850, 3270], [2850 - C, 3270], [2850, 3270 - C], [2850 - C, 3270 + C]]) {
    bakeGround(m, Math.floor(tx / C), Math.floor(ty / C), { quality: 1, seed: 1337 });
    const Fs = seaFields(), TN = Math.round(Math.sqrt(Fs.k.length));
    for (let j = 0; j < TN - 1; j++) for (let i = 0; i < TN - 1; i++) {
      const k = j * TN + i;
      if (Fs.k[k] !== WK.SEA) continue;
      for (const kk of [k + 1, k + TN]) if (Fs.k[kk] === WK.SEA && Math.min(Fs.ld[k], Fs.ld[kk]) >= 4) { pairs++; step = Math.max(step, Math.abs(Fs.sl[k] - Fs.sl[kk])); }
    }
  }
  console.log('the sea\'s slope', JSON.stringify({ pairs, step: +step.toFixed(3) }));
  assert.ok(pairs > 3000 && step < 0.15, `the sea's slope never steps between neighbouring tiles (${step.toFixed(3)} over ${pairs} pairs; a change of coast was 0.33 and more)`);
  // A hot spring's pool and a swimming pool laid in the ground: still inland water with a pond's word (224..231) - they
  // were baked as open sea, no word at all (the light pass ran the sea's waves over them) - and a spring's glow is its
  // own, dim: a cream one over the whole pool fed the bloom till the onsen was a white shape after dark (11-24).
  assert.ok((m.springs || []).length > 0 && (m.pools || []).length > 0, 'hot springs and pools in the world');
  const small = (e, x, y) => {
    const G = bakeGround(m, Math.floor(x / CHUNK), Math.floor(y / CHUNK), { quality: 1, seed: 1337 }), o = { n: 0, bad: 0, lit: 0, bright: 0 };
    for (let i = 0; i < G.w * G.h; i++) {
      const X = Math.floor(x / CHUNK) * CHUNK + (i % G.w) * (CHUNK / G.w), Y = Math.floor(y / CHUNK) * CHUNK + Math.floor(i / G.w) * (CHUNK / G.h);
      if (!e(X, Y) || !(G.flag[i] & F_WATER) || (G.flag[i] & F_WET)) continue;
      o.n++; const c = G.col[i * 4 + 3];
      if (!(G.flag[i] & F_NOCAST) || c < 224 || c >= 232) o.bad++;
      const ea = G.emi[i * 4 + 3]; if (ea) { o.lit++; if (Math.max(G.emi[i * 4], G.emi[i * 4 + 1], G.emi[i * 4 + 2]) * ea > 255 * 2) o.bright++; }
    }
    return o;
  };
  const sp = m.springs[0], spring = small((X, Y) => ((X - sp.x) / sp.rx) ** 2 + ((Y - sp.y) / sp.ry) ** 2 < 0.6, sp.x, sp.y);
  console.log('a hot spring baked', JSON.stringify(spring));
  assert.ok(spring.n > 2000 && !spring.bad, `a hot spring's pool is still inland water with a pond's word (${JSON.stringify(spring)})`);
  assert.ok(spring.lit > spring.n * 0.5 && spring.bright < spring.n * 0.01, `its glow is dim - only the bubbles bright (${spring.bright} of ${spring.lit} lit px; the cream glow was 255 x 20 over them all)`);
  // The small waters the map lists as no lake, pond or river (a garden's lily pond, a plaza's basin): the fish placed in
  // them are a pond's, never the sea's - moon jellies drifted in a botanical garden's pond (the water pass, 11-24).
  const cls = (i) => (m.lake && m.lake[i] ? 1 : m.river && m.river[i] ? 2 : 0), wet = (t) => t === T.WATER || t === T.DEEP || t === T.BRIDGE || t === T.DOCK;
  const seen = new Uint8Array(m.tiles.length), probe = new WaterLife(2), SEA = new Set(['shore', 'harbour', 'open', 'reef']);
  let pockets = 0, cells = 0; const bad = [];
  for (let ty = m.y0; ty < m.y0 + m.h; ty++) for (let tx = m.x0; tx < m.x0 + m.w; tx++) {
    const i0 = m.idx(tx, ty);
    if (seen[i0] || !wet(m.tiles[i0]) || cls(i0)) continue;
    const st = [[tx, ty]], body = []; seen[i0] = 1;
    while (st.length) {
      const [x, y] = st.pop(); if (body.length < POCKET) body.push([x, y]);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (!m.inside(X, Y)) continue; const j = m.idx(X, Y); if (seen[j] || !wet(m.tiles[j]) || cls(j)) continue; seen[j] = 1; st.push([X, Y]); }
    }
    if (body.length >= POCKET) continue;
    pockets++;
    const own = new Set(body.map(([x, y]) => y * 65536 + x));
    // (a patch's fish are those of its most open water: counted when that water is this one)
    for (const [x, y] of body) { const c = probe._cell(m, Math.floor(x / 6), Math.floor(y / 6)); if (!c || !own.has(Math.floor(c.y / TILE) * 65536 + Math.floor(c.x / TILE))) continue; cells++; if (SEA.has(c.k) && bad.length < 6) bad.push(`${x},${y}: ${c.k}`); }
  }
  console.log('small waters of their own', JSON.stringify({ pockets, cells }));
  assert.ok(pockets > 20, `the small waters found (${pockets})`);
  assert.deepEqual(bad, [], 'no sea fish in a small water of its own');
  for (const p of m.props) if (p.t === 'koi') { const c = probe._cell(m, Math.floor(p.x / (6 * TILE)), Math.floor(p.y / (6 * TILE))); assert.ok(c && c.k === 'koi', `a koi pond's fish are koi (${Math.round(p.x)}, ${Math.round(p.y)}: ${c && c.k})`); }
});
