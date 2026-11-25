// Granite Peaks by hand, part 1 (shared/world3-peaks.js): the alpine meadows, the stone hut with its spring and fire
// ring on the biggest, the summits' cairns and benches, the Summit Trail from the road through the hut's meadow to a
// summit; no snow on the designed places up there; part 2 (shared/world3-tarn.js): Summit Tarn's turf, slabs, pebble
// beach, rowboat and camp, Eagle Crag. One World v3 build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../shared/map.js';
import '../shared/world3-islands.js';
import { T, TILE } from '../shared/constants.js';
import { FRAME_W, FRAME_H } from '../shared/world3.js';
import { PEAKS3 } from '../shared/world3-peaks.js';
import { TARN3 } from '../shared/world3-tarn.js';
import { peakHeight, SNOW_LINE, SNOW_CLS } from '../shared/world3-biomes.js';
import { terrainAt, reliefMetres } from '../shared/mapcore.js';
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
  // each summit a knob of rock (the owner, 11-25 09:03: "Build the summit from plans"): a level shelf with the cairn on
  // it, a crown of solid rock round it with cliff walls on its south faces, stone steps up a ramp from the south -
  // and you can walk up it: from open ground south of the knob to the foot of the cairn, never through rock
  const KN = PEAKS3.knob, blocked = (i) => { const t = m.tiles[i]; return t === T.WALL || t === T.WATER || t === T.DEEP || t === T.BUILDING; };
  let knobs = 0;
  for (const q of P.summits) {
    if (!q.knob) continue;
    knobs++;
    const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE), RM = Math.max(...KN.shelf) + Math.max(...KN.crown) + 4;
    let rock = 0, shelfRock = 0;
    for (let dy = -RM; dy <= RM; dy++) for (let dx = -RM; dx <= RM; dx++) { const i = (ty + dy) * W + tx + dx; if (m.tiles[i] === T.WALL && (m.reserve[i] & 32)) { rock++; if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) shelfRock++; } }
    assert.ok(rock >= 60 && q.knob.crown >= 60, `${q.name}: a crown of rock (${rock} tiles)`);
    assert.equal(shelfRock, 0, `${q.name}: the shelf round the cairn is open ground`);
    assert.ok(q.knob.faces >= 2 && m.props.filter((p) => p && p.t === 'cliff' && p.relief && Math.hypot(p.x - q.x, p.y - q.y) < RM * TILE).length >= 2, `${q.name}: cliff walls on its south faces (${q.knob.faces})`);
    assert.ok(near('stairs', q.x, q.y + (KN.shelf[1] + KN.crown[1]) * TILE, 5 * TILE).length >= 1, `${q.name}: steps up the ramp`);
    // the rise: the shelf stands KN.rise metres over the ground outside the knob (m.relief, a 3 x 3 mean)
    const z = (x, y) => { let sum = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += m.relief[(y + dy) * W + x + dx]; return reliefMetres(sum / 9); };
    // (over the ground round it: the middle one of eight heights on a ring outside the knob - a summit on a spur has higher ground on one side)
    const ring = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => z(Math.round(tx + Math.cos(k * Math.PI / 4) * (RM + 4)), Math.round(ty + Math.sin(k * Math.PI / 4) * (RM + 4)))).sort((a, b) => a - b), round = (ring[3] + ring[4]) / 2;
    assert.ok(z(tx, ty) - round >= KN.rise * 0.6, `${q.name}: it stands over the ground round it (${(z(tx, ty) - round).toFixed(1)} m)`);
    // the walk up: breadth-first from 6 tiles south of the knob's foot to the tile south of the cairn
    const start = (ty + RM + 6) * W + tx, goal = (ty + 1) * W + tx, seen = new Set([start]), queue = [start];
    let ok = false;
    for (let h = 0; h < queue.length && !ok; h++) { const i = queue[h]; if (i === goal) { ok = true; break; } for (const j of [i - 1, i + 1, i - W, i + W]) { const x = j % W, y = (j / W) | 0; if (Math.abs(x - tx) > RM + 12 || Math.abs(y - ty) > RM + 12 || seen.has(j) || blocked(j)) continue; seen.add(j); queue.push(j); } }
    assert.ok(ok, `${q.name}: walked up from the south to the cairn`);
    // the bench (and the telescope) stand on open ground
    for (const p of [...near('pbench', q.x, q.y, 4 * TILE), ...near('scope', q.x, q.y, 4 * TILE)]) assert.ok(!blocked(at(p.x, p.y)), `${q.name}: its ${p.t} on the shelf`);
  }
  assert.ok(knobs >= 2, `summits built as knobs: ${knobs} of ${P.summits.length}`);
  // a summit is a top of the land (11-25: "Cairn Peak" lay on a foothill at 92 m, the telescope on it): at least two of
  // them PEAKS3.summits.z metres up in the land's own relief, the first - the Summit Trail's, with the telescope - one
  const zOf = (q) => { const tx = Math.floor(q.x / TILE), ty = Math.floor(q.y / TILE); let a = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) a += m.relief[(ty + dy) * W + tx + dx]; return reliefMetres(a / 25); };
  console.log('summits up', JSON.stringify(P.summits.map((q) => [q.name, Math.round(zOf(q))])));
  assert.ok(P.summits.filter((q) => zOf(q) >= PEAKS3.summits.z).length >= 2 && zOf(P.summits[0]) >= PEAKS3.summits.z, 'two summits on the mountains\' real tops, the first of them one');
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
  // part 2: Summit Tarn by hand, Eagle Crag
  const TN = m.world3.tarn;
  console.log('tarn', JSON.stringify(TN));
  assert.ok(TN.turf >= 100 && TN.beach >= 20 && TN.slabs >= 2, `the tarn's turf, beach and slabs (${TN.turf}, ${TN.beach}, ${TN.slabs})`);
  const camp = m.natureSites.find((s) => s.kind === 'camp' && s.name === TARN3.camp.name);
  assert.ok(camp && near('tent', camp.x, camp.y, 4 * TILE).length === 2, 'the camp\'s two tents');
  assert.ok(near('campfire', camp.x, camp.y, 2 * TILE).some((p) => p.rest) && (m.restSpots || []).some((r) => r.kind === 'camp' && Math.hypot(r.x - camp.x, r.y - camp.y) < 2 * TILE), 'its fire ring to rest by');
  assert.equal(near('log', camp.x, camp.y, 3 * TILE).filter((p) => p.seat).length, 3, 'log seats');
  assert.ok(m.landmarks.some((l) => l.name === TARN3.camp.name && l.type === 'camp'), 'the camp on the map');
  const tarn = m.natureSites.find((s) => s.kind === 'tarn');
  let shingle = 0; for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) { const i = at(tarn.x + dx * TILE, tarn.y + dy * TILE); if (m.tiles[i] === T.SAND && (m.reserve[i] & 128)) shingle++; }
  assert.ok(shingle >= 20, `the pebble beach (${shingle})`);
  // (a real boat since 11-22 - shared/world3-boats.js boatsAfloat3: moored in m.marina, by where it lay)
  assert.ok((m.marina || []).some((q) => q.kind === 'rowboat' && Math.hypot(q.x - tarn.x, q.y - tarn.y) < 16 * TILE), 'a rowboat on it');
  const crag = m.natureSites.find((s) => s.kind === 'crag' && s.name === TARN3.crag.name);
  assert.ok(crag, 'Eagle Crag');
  assert.ok(near('crashpad', crag.x, crag.y, 3 * TILE).length === 2 && near('ropecoil', crag.x, crag.y, 3 * TILE).length === 1, 'its crash pads and rope');
  assert.ok(near('textsign', crag.x, crag.y, 5 * TILE).some((p) => p.text === 'EAGLE CRAG') && near('outcrop', crag.x, crag.y, 6 * TILE).some((p) => p.h >= 100), 'its sign and its rock');
});
