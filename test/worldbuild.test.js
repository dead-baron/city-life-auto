// World building from the concepts: the back alleys dressed (shared/alleys.js, concepts AL1-A..H), the neon and the
// lit shop windows of the night (client/art2/nightfronts.js), lightning you can see (client/render/lightning.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, mapSignature } from '../shared/map.js';
import { T, TILE, MAP_W } from '../shared/constants.js';
import { alleyDressing, alleyBacks, alleyVentsIn, gritOf, DECALS, DRESS, ALLEY_TAGS } from '../shared/alleys.js';

let M = null;
const city = () => (M ||= generateCity(1337));
const alleyEdges = (m) => m.edges.filter((e) => e && e.kind === 'alley' && e.lvl === 0);
// distance from (x, y) to an edge's centre line, and how far along it the nearest point is
function along(e, x, y) {
  let best = Infinity, at = 0, s0 = 0;
  for (let i = 1; i < e.pts.length; i++) {
    const a = e.pts[i - 1], b = e.pts[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (L * L)));
    const d = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
    if (d < best) { best = d; at = s0 + t * L; }
    s0 += L;
  }
  return { d: best, s: at, len: s0 };
}

test('the alleys get their dressing: more and rougher in the rough districts, tidy and planted uptown', () => {
  const m = city(), D = alleyDressing(m);
  assert.equal(alleyDressing(m), D, 'worked out once per map');
  const standing = D.items.filter((it) => !DECALS.has(it.k)), decals = D.items.filter((it) => DECALS.has(it.k));
  assert.ok(standing.length > 600, `things along the alley walls (${standing.length})`);
  assert.ok(decals.length > 400, `puddles, oil, leaves, litter, cracks, weeds, drains (${decals.length})`);
  for (const k of Object.keys(DRESS)) if (k !== 'burn') assert.ok(D.items.some((it) => it.k === k), `some ${k}`);
  // per metre of alley, by district
  const len = new Map(), n = new Map(), kinds = new Map();
  const name = (x, y) => m.districtAt(x, y).name;
  for (const e of alleyEdges(m)) { const a = e.pts[0], z = e.pts.at(-1), d = name((a.x + z.x) / 2, (a.y + z.y) / 2); len.set(d, (len.get(d) || 0) + e.len); }
  for (const it of standing) { const d = name(it.x, it.y); n.set(d, (n.get(d) || 0) + 1); if (!kinds.has(d)) kinds.set(d, new Set()); kinds.get(d).add(it.k); }
  const per = (d) => (n.get(d) || 0) / (len.get(d) || 1) * 1000;
  assert.ok(per('Southside') > per('Westport Center') * 1.4, `Southside (${per('Southside').toFixed(1)} per 1000 px) is messier than Westport Center (${per('Westport Center').toFixed(1)})`);
  for (const k of ['mattress', 'cart', 'tires']) assert.ok(kinds.get('Southside').has(k), `a ${k} in Southside's alleys`);
  assert.ok(!kinds.get('Southside').has('pots'), 'no flower pots in Southside');
  assert.ok([...kinds.entries()].some(([d, s]) => s.has('pots') && gritOf(m.districtAt(...(() => { const it = standing.find((q) => q.k === 'pots' && name(q.x, q.y) === d); return [it.x, it.y]; })())) < 0.45), 'flower pots uptown');
  assert.ok(gritOf({ style: 'southside', tier: 'rough' }) > 0.9 && gritOf({ style: 'luxury', tier: 'lux' }) < 0.2);
  // the world itself is untouched: none of it is a prop of the map
  const sig = mapSignature(m);
  alleyDressing(m);
  assert.equal(mapSignature(m), sig);
});

test('alley dressing: on an alley\'s own asphalt, along its walls, never at its mouths, a door, a doorway or a back door', () => {
  const m = city(), D = alleyDressing(m), edges = m.edges;
  const doors = m.pois.concat(m.homes || []).filter((p) => Number.isFinite(p.x));
  for (const it of D.items) {
    const tx = Math.floor(it.x / TILE), ty = Math.floor(it.y / TILE), i = ty * MAP_W + tx;
    const e = edges[it.e], q = along(e, it.x, it.y);
    assert.ok(q.s >= 50 && q.s <= q.len - 50, `${it.k} at ${it.x},${it.y} is clear of the alley's ends (${Math.round(q.s)} of ${Math.round(q.len)})`);
    if (DECALS.has(it.k)) { assert.ok(q.d <= e.hw + 2, `${it.k} lies on the alley`); continue; }
    assert.ok(m.tiles[i] === T.ROAD && m.roadRank[i] === 1, `${it.k} at ${it.x},${it.y} stands on alley asphalt`);
    assert.ok(q.d >= e.hw - 32, `${it.k} at ${it.x},${it.y} keeps to the wall (${Math.round(q.d)} px from the middle; the lane stays clear)`);
    for (const p of doors) assert.ok(Math.hypot(p.x - it.x, p.y - it.y) >= 60, `${it.k} at ${it.x},${it.y} is clear of the door at ${p.x},${p.y}`);
    for (const bk of D.backs.values()) if (bk.door !== null && Math.abs(bk.y - it.y) < 64) assert.ok(Math.abs(bk.door - it.x) >= 34, `${it.k} at ${it.x},${it.y} keeps clear of a back door`);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const s of m.solidProps.get((ty + dy) * MAP_W + tx + dx) || []) assert.ok(Math.hypot(s.x - it.x, s.y - it.y) >= s.r + DRESS[it.k][0], `${it.k} at ${it.x},${it.y} doesn't stand in a solid prop`);
  }
  // the map's own solid props in the alleys (dumpsters, crates, drums: map.js dressAlleys) leave a lane down the middle
  for (const e of alleyEdges(m)) {
    const pts = e.pts, x0 = Math.min(...pts.map((p) => p.x)) - e.hw, x1 = Math.max(...pts.map((p) => p.x)) + e.hw, y0 = Math.min(...pts.map((p) => p.y)) - e.hw, y1 = Math.max(...pts.map((p) => p.y)) + e.hw;
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor(y1 / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor(x1 / TILE); tx++) for (const s of m.solidProps.get(ty * MAP_W + tx) || []) {
      const q = along(e, s.x, s.y);
      if (q.d > e.hw) continue;
      assert.ok(q.d - s.r >= 20, `a solid prop at ${Math.round(s.x)},${Math.round(s.y)} leaves the alley's middle lane open (${Math.round(q.d - s.r)} px)`);
      for (const p of doors) assert.ok(Math.hypot(p.x - s.x, p.y - s.y) >= s.r + 16, `a solid prop at ${Math.round(s.x)},${Math.round(s.y)} doesn't block the door at ${p.x},${p.y}`);
    }
  }
});

test('the back walls on an alley: a back door with a bare bulb, tags and grime by the district\'s grit, steam from the vents', () => {
  const m = city(), B = alleyBacks(m), D = alleyDressing(m);
  assert.equal(D.backs, B);
  assert.ok(B.size > 40, `back walls facing an alley (${B.size})`);
  let doors = 0, roughTags = 0, rough = 0, tidyTags = 0, tidy = 0;
  for (const bk of B.values()) {
    const b = m.buildings[bk.b];
    assert.ok(b && !b.walkIn && !b.business, 'only plain backs');
    assert.equal(bk.y, (b.ty + b.th) * TILE, 'the wall is the building\'s south face');
    if (bk.door !== null) {
      doors++;
      assert.ok(bk.door > bk.x0 + 20 && bk.door < bk.x1 - 20, 'the door is in the wall');
      const i = Math.floor(bk.y / TILE) * MAP_W + Math.floor(bk.door / TILE);
      assert.ok(m.tiles[i] === T.ROAD && m.roadRank[i] === 1, 'a back door opens onto the alley');
      for (let dy = -1; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const s of m.solidProps.get(i + dy * MAP_W + dx) || []) assert.ok(Math.hypot(s.x - bk.door, s.y - bk.y - 14) >= s.r + 22, `nothing solid in front of the back door at ${bk.door},${bk.y}`);
    }
    if (bk.tag) assert.ok(ALLEY_TAGS.includes(bk.tag), 'an original tag');
    for (const x of [bk.pipe, bk.vent, bk.meter, ...bk.ac]) if (x !== null) assert.ok(x >= bk.x0 && x <= bk.x1, 'the wall\'s kit is on the wall');
    if (bk.g > 0.8) { rough++; roughTags += bk.tags; } else if (bk.g < 0.5) { tidy++; tidyTags += bk.tags; }
  }
  assert.ok(doors > 30, `back doors (${doors})`);
  assert.ok(rough && tidy && roughTags / rough > tidyTags / tidy + 0.3, `more tags in the rough end of town (${(roughTags / rough).toFixed(2)} a wall against ${(tidyTags / tidy).toFixed(2)})`);
  const vents = alleyVentsIn(m, 0, 0, 1e9, 1e9);
  assert.ok(vents.length > 10 && vents.every((v) => [...B.values()].some((bk) => bk.vent === v.x && bk.y === v.y && bk.door !== null)), 'steam rises only from the vents the walls have');
});
