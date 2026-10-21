// Granite Peaks by hand, part 1 (shared/world3-peaks.js): the alpine meadows, the stone hut with its spring and fire
// ring on the biggest, the summits' cairns and benches, the Summit Trail from the road through the hut's meadow to a
// summit; no snow on the designed places up there. One World v3 build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { PEAKS3 } from '../shared/world3-peaks.js';
import { peakHeight, SNOW_LINE, SNOW_CLS } from '../shared/world3-biomes.js';
import { terrainAt } from '../shared/mapcore.js';
import { prepare } from '../tools/world3-build.mjs';

test('World v3: Granite Peaks\' alpine meadows, the stone hut and its spring, the summits\' cairns, the Summit Trail', { timeout: 400000 }, () => {
  const prep = prepare();
  const m = generateCity(1337, { world3: true, frame: { w: FRAME_W, h: FRAME_H }, land: prep.land, today: prep.today });
  const P = m.world3.peaks;
  console.log('peaks', JSON.stringify({ meadows: P.meadows.map((q) => q.name), summits: P.summits.map((q) => q.name), trail: P.trail, cleared: P.cleared, missed: P.missed }));
  const near = (t, x, y, r) => m.props.filter((p) => p && p.t === t && Math.hypot(p.x - x, p.y - y) < r);
  const W = m.w, at = (x, y) => Math.floor(y / TILE) * W + Math.floor(x / TILE);
  // the meadows
  assert.ok(P.meadows.length >= PEAKS3.meadows.n - 1, `${P.meadows.length} meadows`);
  for (const q of P.meadows) {
    assert.equal(m.dist[at(q.x, q.y)], 48, `${q.name} in Granite Peaks`);
    const R = q.r / TILE;
    let lush = 0, n = 0;
    for (let dy = -R * 0.7; dy <= R * 0.7; dy += 1) for (let dx = -R * 0.7; dx <= R * 0.7; dx += 1) { if (dx * dx + dy * dy > R * R * 0.49) continue; n++; const i = at(q.x + dx * TILE, q.y + dy * TILE); if (m.tiles[i] === T.GRASS && m.reserve[i] & 128) lush++; }
    assert.ok(lush > n * 0.6, `${q.name}: lush grass (${lush} of ${n})`);
    assert.ok(near('flowers_a', q.x, q.y, q.r).length >= 10, `${q.name}: the flowers`);
    assert.equal(near('tree_a', q.x, q.y, q.r * 0.8).length + near('outcrop', q.x, q.y, q.r * 0.8).length, 0, `${q.name}: open`);
    assert.ok(m.landmarks.some((l) => l.name === q.name && l.type === 'meadow'), `${q.name} on the map`);
    const h = peakHeight(Math.floor(q.x / TILE), Math.floor(q.y / TILE));
    assert.ok(h >= PEAKS3.meadows.h[0] - 0.01 && h < SNOW_LINE, `${q.name}: high country, under the snow (${h.toFixed(3)})`);
  }
  for (let i = 0; i < P.meadows.length; i++) for (let j = i + 1; j < P.meadows.length; j++) assert.ok(Math.hypot(P.meadows[i].x - P.meadows[j].x, P.meadows[i].y - P.meadows[j].y) >= (PEAKS3.meadows.spacing - 1) * TILE, 'apart');
  // the hut, its spring and fire ring
  const hm = P.meadows.find((q) => q.hut);
  assert.ok(hm, 'the hut\'s meadow');
  assert.equal(near('stonehut', hm.hut.x, hm.hut.y, 4).length, 1, 'the stone hut');
  assert.equal(near('mtspring', hm.spring.x, hm.spring.y, 4).length, 1, 'the spring');
  assert.ok(near('campfire', hm.fire.x, hm.fire.y, 4).some((p) => p.rest), 'the fire ring to rest by');
  assert.ok((m.restSpots || []).some((r) => r.kind === 'hut' && Math.hypot(r.x - hm.fire.x, r.y - hm.fire.y) < 4), 'a rest spot');
  assert.ok(near('log', hm.fire.x, hm.fire.y, 100).filter((p) => p.seat).length === 3, 'log seats round the fire');
  // the summits
  assert.ok(P.summits.length >= PEAKS3.summits.n - 1, `${P.summits.length} summits`);
  P.summits.forEach((q, k) => {
    assert.ok(near('cairn', q.x, q.y, TILE).some((p) => p.big), `${q.name}: its cairn`);
    assert.ok(near('pbench', q.x, q.y, 4 * TILE).length >= 1, `${q.name}: a bench looking out`);
    if (k === 0) assert.ok(near('scope', q.x, q.y, 4 * TILE).length >= 1, `${q.name}: the coin telescope`);
    assert.ok(q.h >= PEAKS3.summits.h[0] - 0.001, `${q.name}: high (${q.h})`);
    assert.ok(m.landmarks.some((l) => l.name === q.name && l.type === 'summit'), `${q.name} on the map`);
  });
  // no snow on the designed places up there (the Ridge Trail Hunting Camp sat in it)
  for (const nm of ['Ridge Trail Hunting Camp', 'Ridge Fire Lookout']) {
    const l = m.landmarks.find((q) => q.name === nm);
    assert.ok(l, nm);
    const tx = Math.floor((l.x + l.w / 2) / TILE), ty = Math.floor((l.y + l.h / 2) / TILE);
    let snow = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (terrainAt(m.terrainCls.cls, m.terrainCls.cw, tx + dx, ty + dy) === SNOW_CLS) snow++;
    assert.equal(snow, 0, `${nm}: no snow on it`);
  }
  // the Summit Trail: from a road, through the hut's meadow, to a summit; cairns along it
  const tr = (m.natureSites || []).find((s) => s.kind === 'trail' && s.name === PEAKS3.trail.name);
  assert.ok(tr && tr.line && tr.line.length > 40 && P.trail.len > 60, `the Summit Trail (${P.trail && P.trail.len} tiles)`);
  const [x0, y0] = tr.line[0], [x1, y1] = tr.line[tr.line.length - 1];
  let road = false; for (let dy = -6; dy <= 6 && !road; dy++) for (let dx = -6; dx <= 6 && !road; dx++) if (m.tiles[at(x0 + dx * TILE, y0 + dy * TILE)] === T.ROAD) road = true;
  const onTrail = (m.natureSites || []).some((s) => s.kind === 'trail' && s !== tr && s.line && s.line.some(([x, y]) => Math.hypot(x - x0, y - y0) < 4 * TILE));
  assert.ok(P.trail.from !== 'meadow' && (road || onTrail), `it starts at a road or a trail (${P.trail.from})`);
  assert.ok(near('textsign', x0, y0, 14 * TILE).some((p) => p.text === 'SUMMIT TRAIL') && near('mapboard', x0, y0, 14 * TILE).length >= 1, 'its trailhead: the sign and a map board');
  let shows = 0; for (const [x, y] of tr.line) { const i = at(x, y); if ((m.tiles[i] === T.DIRT && !(m.reserve[i] & 128)) || (m.tiles[i] === T.SAND && m.reserve[i] & 128) || m.tiles[i] === T.ROAD) shows++; }
  assert.ok(shows > tr.line.length * 0.8, `it shows on the ground (${shows} of ${tr.line.length})`);
  assert.ok(tr.line.some(([x, y]) => Math.hypot(x - hm.x, y - hm.y) < hm.r), 'through the hut\'s meadow');
  assert.ok(P.summits.some((q) => Math.hypot(q.x - x1, q.y - y1) < 6 * TILE), 'up to a summit');
  const cairns = m.props.filter((p) => p && p.t === 'cairn' && !p.big && tr.line.some(([x, y]) => Math.hypot(p.x - x, p.y - y) < 4 * TILE));
  assert.ok(cairns.length >= 2, `cairns along it (${cairns.length})`);
});
