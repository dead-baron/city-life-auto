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

test('the art: back doors and bulbs on the alley walls, big neon on the nightlife fronts, lit shop windows', async () => {
  const m = city();
  const { staticIndex, staticLights } = await import('../client/art2/game/statics.js');
  const { signKind, NEON_COLS } = await import('../client/art2/neonsigns.js');
  const I = staticIndex(m), B = alleyBacks(m);
  let walls = 0, doors = 0, signs = 0, nightSigns = 0, fronts = 0;
  const signed = new Set();
  for (const [bi, items] of I.byB) {
    const b = m.buildings[bi];
    if (!b) continue;
    const st = m.districtAt((b.tx + b.tw / 2) * TILE, (b.ty + b.th / 2) * TILE).style;
    for (const it of items) {
      const sp = it.recipe && it.recipe.spec;
      if (!sp) continue;
      if (sp.alley) {
        walls++;
        assert.ok(B.has(bi), `${b.kind} ${bi}: wall kit only on a wall that fronts an alley`);
        assert.ok(!sp.shop, 'a back wall, not a shopfront');
        if (sp.alley.bulb !== null) { doors++; assert.ok(sp.doors && sp.doors.length === 1 && sp.doors[0].kind === 'door', 'a back door under the bulb'); }
      }
      if (sp.shop) fronts++;
      if (sp.neonSigns) {
        signs++; signed.add(bi);
        assert.ok(sp.shop, `${b.kind} ${b.name}: neon only on a front with a shop`);
        for (const sg of sp.neonSigns) {
          assert.ok(signKind(st, '', sp.shop.kind) || /club|arcade|tattoo/.test(b.kind) || st === 'nightlife' || st === 'redlight', `${b.kind} in ${st}: a sign where the night is`);
          assert.ok(sg.x >= 0 && sg.x + sg.w <= sp.w && sg.v >= 60 && sg.text.length >= 2 && NEON_COLS.includes(sg.col), `${b.name}: the sign fits its facade (${sg.text})`);
          assert.ok(!/[a-z]/.test(sg.text), 'neon letters');
        }
        if (st === 'nightlife' || st === 'redlight') nightSigns++;
      }
    }
  }
  assert.ok(walls > 30 && doors > 20, `alley walls dressed (${walls}), back doors with a bulb (${doors})`);
  assert.ok(signs > 12 && nightSigns >= 6, `neon signs (${signs}; ${nightSigns} on the nightlife strips)`);
  // every club on the map (outside the hand-set hero corner) has its sign
  for (const b of m.buildings) if (b && !b.gone && /^club/.test(b.kind) && !b.art) assert.ok(signed.has(b.id), `${b.name} has its neon`);
  // nobody's house or a plain back gets a sign
  for (const bi of signed) assert.ok(!/^house|^shanty|^shack|^farmstead/.test(m.buildings[bi].kind) && !m.buildings[bi].back, `${m.buildings[bi].kind}: no neon on homes or backs`);
  // the lights: a neon sign lights the pavement in its colour; a back door's bulb an amber pool; shopfronts spill light
  let neon = 0, bulbs = 0, windows = 0;
  for (const l of [...I.lights.values()].flat()) { if (l.kind === 'neon' && l.r >= 240) neon++; else if (l.kind === 'window' && l.r === 150 && l.col[2] < 0.3) bulbs++; else if (l.kind === 'window') windows++; }
  assert.ok(neon >= signs, `a big pool of colour for every big sign (${neon})`);
  assert.ok(bulbs >= doors, `a pool of amber under every back-door bulb (${bulbs})`);
  assert.ok(windows > fronts * 0.8, `light from the shop windows (${windows} for ${fronts} fronts)`);
  assert.ok(Array.isArray(staticLights(m, 30, 20)));
});

test('grit on the town\'s streets: drains at the kerb, leaves and litter, oil, cracks and weeds - rougher where the district is', async () => {
  const m = city();
  const { streetGrit } = await import('../client/art2/streetgrit.js');
  const G = streetGrit(m);
  assert.equal(streetGrit(m), G);
  assert.ok(G.length > 3000, `grit (${G.length})`);
  const count = (name, ks) => G.filter((it) => ks.includes(it.k) && m.districtAt(it.x, it.y).name === name).length;
  const roads = (name) => m.edges.filter((e) => e.lvl === 0 && e.kind !== 'alley' && m.districtAt(e.pts[0].x, e.pts[0].y).name === name).reduce((s, e) => s + e.len, 0) || 1;
  const rough = count('Southside', ['litter', 'weeds', 'crack', 'patch']) / roads('Southside'), tidy = count('Westport Center', ['litter', 'weeds', 'crack', 'patch']) / roads('Westport Center');
  assert.ok(rough > tidy * 2, `Southside's streets are rougher (${(rough * 1000).toFixed(2)} per 1000 px against ${(tidy * 1000).toFixed(2)})`);
  for (const it of G) {
    const t = m.tiles[Math.floor(it.y / TILE) * MAP_W + Math.floor(it.x / TILE)];
    assert.ok(t === T.ROAD || t === T.SIDEWALK || t === T.BRIDGE || t === T.PLAZA, `${it.k} at ${it.x},${it.y} is on the street (tile ${t})`);
  }
});

test('lightning you can see: a forked bolt, the same for the same seed, inside the screen; near strikes come down into the street', async () => {
  const { boltPath } = await import('../client/render/lightning.js');
  for (const [W, H] of [[1280, 720], [390, 844], [2560, 1440]]) {
    for (let seed = 1; seed <= 40; seed++) for (const near of [false, true]) {
      const a = boltPath(seed, W, H, near), b = boltPath(seed, W, H, near);
      assert.deepEqual(a, b, 'deterministic by seed');
      assert.ok(a.segs.length > a.trunk && a.trunk >= 8, `forked (${a.segs.length} segments, ${a.trunk} in the main channel)`);
      for (const s of a.segs) {
        for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]]) assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `in the screen: ${x},${y} of ${W}x${H}`);
        assert.ok(s[4] >= 1 && s[4] <= 3 && s[5] > 0 && s[5] <= 1);
      }
      assert.equal(a.segs[0][1], 0, 'the channel comes down from the top of the screen');
      for (let i = 1; i < a.trunk; i++) assert.ok(a.segs[i][0] === a.segs[i - 1][2] && a.segs[i][1] === a.segs[i - 1][3], 'one unbroken channel');
      assert.deepEqual([a.end.x, a.end.y], [a.segs[a.trunk - 1][2], a.segs[a.trunk - 1][3]]);
      if (near) assert.ok(a.end.y >= H * 0.55 && a.near, 'a near strike hits the street in view'); else assert.ok(a.end.y <= H * 0.5, 'a far one ends up in the distance');
    }
    assert.notDeepEqual(boltPath(1, W, H), boltPath(2, W, H), 'every bolt its own');
  }
});
